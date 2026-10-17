import { useSyncExternalStore } from "react";

const watcherEnabled = import.meta.env?.VITE_ENABLE_LATTICE_WATCHER === "1";
const LATTICE_WAIT_TIMEOUT_MS = 4000;

export type ResonanceWatcherStats = {
  filesTouched?: number;
  addedNodes?: number;
  updatedNodes?: number;
  removedNodes?: number;
  edgeDelta?: number;
};

export type ResonanceVersionState = {
  version: number;
  stats: ResonanceWatcherStats | null;
  connected: boolean;
  lastEventTs: number | null;
};

let eventSource: EventSource | null = null;
let latestVersion = 0;
let acknowledgedVersion = 0;
let initializing = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let watcherState: ResonanceVersionState = {
  version: 0,
  stats: null,
  connected: false,
  lastEventTs: null,
};
const pendingResolvers = new Set<() => void>();
const subscribers = new Set<() => void>();

const notify = () => {
  for (const listener of subscribers) {
    listener();
  }
};

const updateState = (partial: Partial<ResonanceVersionState>) => {
  watcherState = { ...watcherState, ...partial };
  notify();
};

const resolvePending = () => {
  if (acknowledgedVersion >= latestVersion) {
    return;
  }
  acknowledgedVersion = latestVersion;
  if (pendingResolvers.size === 0) {
    return;
  }
  for (const resolve of Array.from(pendingResolvers)) {
    pendingResolvers.delete(resolve);
    resolve();
  }
};

const parseStats = (value: unknown): ResonanceWatcherStats | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const stats: ResonanceWatcherStats = {};
  for (const key of ["filesTouched", "addedNodes", "updatedNodes", "removedNodes", "edgeDelta"] as const) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      stats[key] = raw;
    }
  }
  return Object.keys(stats).length === 0 ? null : stats;
};

const handleEventPayload = (raw: string | null) => {
  if (!raw) {
    return;
  }
  try {
    const payload = JSON.parse(raw);
    const version = typeof payload.version === "number" ? payload.version : null;
    const stats = parseStats(payload.stats);
    if (version && version > latestVersion) {
      latestVersion = version;
      updateState({ version, stats: stats ?? watcherState.stats, lastEventTs: Date.now() });
      resolvePending();
    } else if (stats) {
      updateState({ stats, lastEventTs: Date.now() });
    }
  } catch {
    /* ignore malformed payloads */
  }
};

const connectStream = () => {
  if (!watcherEnabled || typeof window === "undefined" || typeof EventSource === "undefined") {
    return;
  }
  if (eventSource) {
    return;
  }
  initializing = true;
  eventSource = new EventSource("/api/code-lattice/stream");
  eventSource.onmessage = (event) => {
    handleEventPayload(event.data);
  };
  eventSource.addEventListener("init", (event) => {
    handleEventPayload((event as MessageEvent<string>).data);
  });
  eventSource.onerror = () => {
    updateState({ connected: false });
    eventSource?.close();
    eventSource = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectStream();
    }, 3000);
  };
  eventSource.onopen = () => {
    initializing = false;
    updateState({ connected: true });
  };
};

export function getResonanceVersion(): number {
  return latestVersion;
}

export function getResonanceWatcherState(): ResonanceVersionState {
  return watcherState;
}

export async function ensureLatestLattice(): Promise<void> {
  if (!watcherEnabled || typeof window === "undefined") {
    return;
  }
  connectStream();
  if (acknowledgedVersion >= latestVersion && !initializing && watcherState.connected) {
    return;
  }
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      acknowledgedVersion = latestVersion;
      timer = null;
      pendingResolvers.delete(settle);
      resolve();
    }, LATTICE_WAIT_TIMEOUT_MS);
    const settle = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingResolvers.delete(settle);
      resolve();
    };
    pendingResolvers.add(settle);
    // If the stream failed to open immediately, don't block the UI.
    if (!watcherState.connected && !initializing && !eventSource) {
      settle();
    }
  });
}

export function startResonanceVersionStream(): void {
  if (!watcherEnabled) {
    return;
  }
  connectStream();
}

export function useResonanceVersion(): ResonanceVersionState {
  startResonanceVersionStream();
  return useSyncExternalStore(
    (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    () => watcherState,
    () => watcherState,
  );
}
