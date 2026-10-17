import { useEffect, useRef } from "react";
import { normalizeHash } from "./hashes";

export type WhisperPanelContext = Record<string, unknown>;
type Listener = () => void;

const CONTEXTS = new Map<string, WhisperPanelContext>();
const LISTENERS = new Set<Listener>();

function notify() {
  LISTENERS.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error("[luma-whispers] context listener failed", err);
    }
  });
}

function updateContext(hash: string, context: WhisperPanelContext | null) {
  if (!hash) return;
  const prev = CONTEXTS.get(hash);
  if (context === null || context === undefined) {
    if (prev !== undefined) {
      CONTEXTS.delete(hash);
      notify();
    }
    return;
  }
  if (prev === context) {
    return;
  }
  CONTEXTS.set(hash, context);
  notify();
}

/**
 * Imperative helper to publish context snapshots (used by focus hooks).
 */
export function publishPanelContext(
  hash: string,
  context: WhisperPanelContext | null | undefined,
): void {
  const canonical = normalizeHash(hash);
  if (!canonical) return;
  updateContext(canonical, context ?? null);
}

/**
 * Registers a listener for any panel-context change.
 * Returns an unsubscribe callback.
 */
export function subscribePanelContexts(listener: Listener): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

/**
 * Reads the latest published context for a canonical hash.
 */
export function getPanelContext(hash: string): WhisperPanelContext | undefined {
  const canonical = normalizeHash(hash);
  if (!canonical) return undefined;
  return CONTEXTS.get(canonical);
}

/**
 * React hook to publish context values for a whisper panel.
 * Call this from within a component that owns the live data.
 */
export function useRegisterWhisperContext(
  hash: string,
  context: WhisperPanelContext | null | undefined,
): void {
  const canonical = normalizeHash(hash);
  const lastContextRef = useRef<WhisperPanelContext | null>(null);

  useEffect(() => {
    const nextContext = context ?? null;
    if (!canonical) {
      lastContextRef.current = nextContext;
      return () => void 0;
    }

    updateContext(canonical, nextContext);
    lastContextRef.current = nextContext;

    return () => {
      if (lastContextRef.current !== null) {
        updateContext(canonical, null);
      }
      lastContextRef.current = null;
    };
  }, [canonical, context]);
}
