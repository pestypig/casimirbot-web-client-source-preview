import { useEffect, useRef } from "react";
import { useQiStore } from "@/store/useQiStore";

type QiStreamParams = Record<string, string | number | boolean | undefined | null>;

let activeQiStreams = 0;
const BASE_RETRY_MS = 1500;
const MAX_RETRY_MS = 15000;

export function useQiStream(enabled = true, params?: QiStreamParams): void {
  const ingest = useQiStore((state) => state.ingest);
  const setConnected = useQiStore((state) => state.setConnected);
  const paramKey = params ? JSON.stringify(params) : "";
  const retryDelayRef = useRef(BASE_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (activeQiStreams === 0) {
        setConnected(false);
      }
      return;
    }
    const qs = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === false) continue;
        qs.set(key, value === true ? "1" : String(value));
      }
    }
    const search = qs.toString();
    let es: EventSource | null = null;
    let opened = false;
    let closed = false;

    const handleOpen = () => {
      if (!opened) {
        opened = true;
        activeQiStreams += 1;
        setConnected(true);
      }
    };
    const handleClose = () => {
      if (opened) {
        opened = false;
        activeQiStreams = Math.max(0, activeQiStreams - 1);
        if (activeQiStreams === 0) {
          setConnected(false);
        }
      }
    };

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      clearRetryTimer();
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!onlineListenerRef.current && typeof window !== "undefined") {
          const handleOnline = () => {
            if (onlineListenerRef.current) {
              window.removeEventListener("online", onlineListenerRef.current);
              onlineListenerRef.current = null;
            }
            if (!closed) {
              connect();
            }
          };
          onlineListenerRef.current = handleOnline;
          window.addEventListener("online", handleOnline);
        }
        return;
      }
      const jitter = retryDelayRef.current * (0.75 + Math.random() * 0.5);
      retryDelayRef.current = Math.min(MAX_RETRY_MS, retryDelayRef.current * 2);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!closed) {
          connect();
        }
      }, jitter);
    };

    const connect = () => {
      if (closed) return;
      es?.close();
      es = new EventSource(`/api/qisnap/stream${search ? `?${search}` : ""}`);
      es.onopen = () => {
        retryDelayRef.current = BASE_RETRY_MS;
        handleOpen();
      };
      es.onerror = () => {
        handleClose();
        es?.close();
        scheduleReconnect();
      };
      es.onmessage = (event) => {
        try {
          ingest(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };
    };

    connect();

    return () => {
      closed = true;
      clearRetryTimer();
      if (onlineListenerRef.current && typeof window !== "undefined") {
        window.removeEventListener("online", onlineListenerRef.current);
        onlineListenerRef.current = null;
      }
      handleClose();
      es?.close();
    };
  }, [enabled, paramKey, ingest, setConnected]);
}
