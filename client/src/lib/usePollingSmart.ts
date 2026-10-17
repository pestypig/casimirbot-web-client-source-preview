import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./queryClient";

/**
 * Smart polling:
 * - Visibility aware (pauses when tab hidden)
 * - Online/Offline aware
 * - AbortController to cancel in-flight requests when cycle restarts
 * - Exponential backoff on failures
 * - Optional deduping so multiple components share one network stream per URL
 */

type Opts = {
  minMs?: number;              // initial interval
  maxMs?: number;              // cap
  backoffFactor?: number;      // on error
  dedupeKey?: string;          // share requests across components
  enabled?: boolean;           // allow turning off
  parser?: (res: Response) => Promise<any>; // override json()
};

const defaultParser = (r: Response) => r.json();

// in-module cache to fan out results to multiple components
const bus = new Map<
  string,
  {
    subscribers: Set<(v: any) => void>;
    last?: any;
    controller?: AbortController;
    timer?: number;
    running?: boolean;
  }
>();

export type DebounceConfig = {
  delay: number;
  maxDelay: number;
  immediate: boolean;
};

export function createDebouncedFunction<T extends (...args: any[]) => any>(
  fn: T,
  config: DebounceConfig
): T & { cancel: () => void } {
  let timeoutId: number | null = null;
  let lastCallTime = 0;

  const debouncedFn = ((...args: Parameters<T>) => {
    const now = Date.now();

    // Clear existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // If immediate is true and it's the first call, execute immediately
    if (config.immediate && lastCallTime === 0) {
      lastCallTime = now;
      return fn(...args);
    }

    // If max delay exceeded, execute immediately
    if (now - lastCallTime >= config.maxDelay) {
      lastCallTime = now;
      return fn(...args);
    }

    // Otherwise, debounce with delay
    timeoutId = window.setTimeout(() => {
      lastCallTime = Date.now();
      timeoutId = null;
      fn(...args);
    }, config.delay);
  }) as T & { cancel: () => void };

  debouncedFn.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFn;
}

export function usePollingSmart<T = any>(
  url: string,
  { minMs = 8000, maxMs = 30000, backoffFactor = 1.6, dedupeKey, enabled = true, parser = defaultParser }: Opts = {}
) {
  const key = dedupeKey ?? url;
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const delayRef = useRef(minMs);
  const abortWith = (ac?: AbortController, reason = "cleanup") => {
    if (!ac) return;
    // Prefer a proper AbortError if available; any value works as reason.
    const r =
      typeof DOMException !== "undefined"
        ? new DOMException(`polling ${reason}`, "AbortError")
        : new Error(`polling ${reason}`);
    ac.abort(r as any);
  };

  useEffect(() => {
    if (!enabled) return;

    // ensure channel exists
    if (!bus.has(key)) {
      bus.set(key, { subscribers: new Set(), running: false });
    }
    const ch = bus.get(key)!;

    const sub = (v: any) => setData(v as T);
    ch.subscribers.add(sub);

    // emit cached value immediately if available
    if (ch.last !== undefined) setData(ch.last as T);

    let disposed = false;

    const tick = async () => {
      if (disposed) return;
      if (document.hidden || !navigator.onLine) {
        console.log(`[usePollingSmart] Skipping fetch - hidden: ${document.hidden}, offline: ${!navigator.onLine}`);
        ch.timer = window.setTimeout(tick, minMs); // cheap wait while hidden/offline
        return;
      }
      try {
        // cancel any in-flight request from the previous cycle
        abortWith(ch.controller, "restart");
        ch.controller = new AbortController();

        // Add debugging for fetch attempts
        console.log(`[usePollingSmart] Fetching: ${url}`);

        const res = await apiRequest(
          "GET",
          url,
          undefined,
          ch.controller.signal,
        );

        if (!res.ok) {
          const errorMsg = `HTTP ${res.status} ${res.statusText}`;
          console.error(`[usePollingSmart] Request failed: ${errorMsg} for ${url}`);
          throw new Error(errorMsg);
        }

        const json = await parser(res);
        ch.last = json;
        ch.subscribers.forEach(fn => fn(json));
        if (!disposed) setErr(null);
        delayRef.current = minMs; // reset backoff on success

        console.log(`[usePollingSmart] Success: ${url}`);
      } catch (e: any) {
        // Treat our own aborts as benign: no error/backoff
        const isAbort =
          e?.name === "AbortError" ||
          e?.message?.toLowerCase?.().includes("abort") ||
          e === "restart" ||
          e === "cleanup";

        if (!disposed && !isAbort) {
          const errorMsg = e?.message ?? "fetch failed";
          console.error(`[usePollingSmart] Error for ${url}:`, e);
          setErr(errorMsg);
          delayRef.current = Math.min(
            maxMs,
            Math.max(minMs, Math.round(delayRef.current * backoffFactor))
          );
        }
      } finally {
        // Only keep polling while someone is listening and we’re not disposed
        if (!disposed && ch.subscribers.size > 0) {
          ch.timer = window.setTimeout(tick, delayRef.current);
        } else {
          ch.timer = undefined as any;
        }
      }
    };

    // start loop only once per key
    if (!ch.running) {
      ch.running = true;
      delayRef.current = minMs;
      tick();
    }

    const onVis = () => {
      if (!document.hidden && ch.timer == null) {
        delayRef.current = minMs;
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVis);
      ch.subscribers.delete(sub);
      // stop loop if nobody is listening
      if (ch.subscribers.size === 0) {
        if (ch.timer != null) {
          clearTimeout(ch.timer);
          ch.timer = undefined as any;
        }
        abortWith(ch.controller, "cleanup");
        ch.controller = undefined;
        ch.running = false;
        bus.delete(key);
      }
    };
  }, [key, url, enabled, minMs, maxMs, backoffFactor, parser]);

  return { data, err } as const;
}

/**
 * usePollingSmart(cb, intervalMs)
 * - Calls cb() once immediately and then every intervalMs while mounted.
 * - Returns a control object { stop, start } for manual control.
 */
export function usePollingSmartImmediate(cb: () => void, intervalMs = 1000) {
  const idRef = useRef<number | null>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!cbRef.current) return;
    // initial call
    try { cbRef.current(); } catch {}
    idRef.current = window.setInterval(() => {
      try { cbRef.current(); } catch {}
    }, intervalMs);
    return () => {
      if (idRef.current !== null) {
        clearInterval(idRef.current);
        idRef.current = null;
      }
    };
  }, [intervalMs]);

  return {
    stop: () => { if (idRef.current !== null) { clearInterval(idRef.current); idRef.current = null; } },
    start: () => { if (idRef.current === null) idRef.current = window.setInterval(() => { try { cbRef.current(); } catch {} }, intervalMs); }
  };
}

