export type AlcubierreDebugLevel = "info" | "warn" | "error";

export type AlcubierreDebugCategory =
  | "viewer_state"
  | "calc_vs_render"
  | "render_transport"
  | "solve_to_render_pipeline"
  | "render_vs_metric_displacement"
  | "runtime_guard"
  | "metric";

export type AlcubierreDebugNumericMap = Record<string, number | null>;

export type AlcubierreDebugMeasurementMap = Record<string, number | string | boolean | null>;

export type AlcubierreDebugEvent = {
  id: string;
  atMs: number;
  isoTime: string;
  level: AlcubierreDebugLevel;
  category: AlcubierreDebugCategory;
  source: string;
  mode: number | null;
  rendererBackend: string | null;
  skyboxMode: string | null;
  expected: AlcubierreDebugNumericMap | null;
  rendered: AlcubierreDebugNumericMap | null;
  delta: AlcubierreDebugNumericMap | null;
  measurements: AlcubierreDebugMeasurementMap | null;
  note: string | null;
};

export type AlcubierreDebugEventInput = {
  level: AlcubierreDebugLevel;
  category: AlcubierreDebugCategory;
  source: string;
  mode?: number | null;
  rendererBackend?: string | null;
  skyboxMode?: string | null;
  expected?: Record<string, unknown> | null;
  rendered?: Record<string, unknown> | null;
  delta?: Record<string, unknown> | null;
  measurements?: Record<string, unknown> | null;
  note?: string | null;
};

export type AlcubierreDebugLogSnapshot = {
  updatedAtMs: number;
  enabled: boolean;
  total: number;
  dropped: number;
  events: AlcubierreDebugEvent[];
};

export const ALCUBIERRE_DEBUG_LOG_EVENT = "helix:alcubierre-debug-log";
export const ALCUBIERRE_DEBUG_LOG_CONFIG_EVENT = "helix:alcubierre-debug-log-config";

const MAX_ALCUBIERRE_DEBUG_EVENTS = 600;

type DebugWindow = Window & {
  __alcubierreDebugLogEnabled?: boolean;
  __alcubierreDebugEvents?: AlcubierreDebugEvent[];
};

let debugEnabled = false;
let initialized = false;
let updatedAtMs = 0;
let droppedCount = 0;
let debugEvents: AlcubierreDebugEvent[] = [];

const getDebugWindow = (): DebugWindow | null =>
  typeof window === "undefined" ? null : (window as DebugWindow);

const toFiniteOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeNumericMap = (input?: Record<string, unknown> | null): AlcubierreDebugNumericMap | null => {
  if (!input || typeof input !== "object") return null;
  const entries: Array<[string, number | null]> = [];
  for (const [key, value] of Object.entries(input)) {
    entries.push([key, toFiniteOrNull(value)]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const sanitizeMeasurementMap = (
  input?: Record<string, unknown> | null,
): AlcubierreDebugMeasurementMap | null => {
  if (!input || typeof input !== "object") return null;
  const entries: Array<[string, number | string | boolean | null]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number") {
      entries.push([key, Number.isFinite(value) ? value : null]);
      continue;
    }
    if (typeof value === "string" || typeof value === "boolean" || value === null) {
      entries.push([key, value]);
      continue;
    }
    entries.push([key, null]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const ensureInitialized = (): void => {
  if (initialized) return;
  initialized = true;
  const win = getDebugWindow();
  if (!win) return;
  if (typeof win.__alcubierreDebugLogEnabled === "boolean") {
    debugEnabled = win.__alcubierreDebugLogEnabled;
  }
  if (Array.isArray(win.__alcubierreDebugEvents)) {
    debugEvents = win.__alcubierreDebugEvents.slice(-MAX_ALCUBIERRE_DEBUG_EVENTS);
    updatedAtMs = Date.now();
  }
};

const snapshot = (): AlcubierreDebugLogSnapshot => ({
  updatedAtMs,
  enabled: debugEnabled,
  total: debugEvents.length,
  dropped: droppedCount,
  events: [...debugEvents],
});

const publishSnapshot = (): void => {
  const win = getDebugWindow();
  if (!win) return;
  win.__alcubierreDebugEvents = [...debugEvents];
  win.dispatchEvent(
    new CustomEvent<AlcubierreDebugLogSnapshot>(ALCUBIERRE_DEBUG_LOG_EVENT, {
      detail: snapshot(),
    }),
  );
};

const publishConfig = (): void => {
  const win = getDebugWindow();
  if (!win) return;
  win.__alcubierreDebugLogEnabled = debugEnabled;
  win.dispatchEvent(
    new CustomEvent<{ enabled: boolean }>(ALCUBIERRE_DEBUG_LOG_CONFIG_EVENT, {
      detail: { enabled: debugEnabled },
    }),
  );
};

export function isAlcubierreDebugLogEnabled(): boolean {
  ensureInitialized();
  return debugEnabled;
}

export function setAlcubierreDebugLogEnabled(enabled: boolean): void {
  ensureInitialized();
  debugEnabled = enabled === true;
  publishConfig();
  publishSnapshot();
}

export function pushAlcubierreDebugEvent(
  input: AlcubierreDebugEventInput,
): AlcubierreDebugEvent | null {
  ensureInitialized();
  if (!debugEnabled) return null;
  const atMs = Date.now();
  const event: AlcubierreDebugEvent = {
    id: `alc-${atMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    atMs,
    isoTime: new Date(atMs).toISOString(),
    level: input.level,
    category: input.category,
    source: input.source,
    mode: Number.isFinite(input.mode) ? Number(input.mode) : null,
    rendererBackend: input.rendererBackend ?? null,
    skyboxMode: input.skyboxMode ?? null,
    expected: sanitizeNumericMap(input.expected),
    rendered: sanitizeNumericMap(input.rendered),
    delta: sanitizeNumericMap(input.delta),
    measurements: sanitizeMeasurementMap(input.measurements),
    note: typeof input.note === "string" ? input.note : null,
  };
  debugEvents.push(event);
  if (debugEvents.length > MAX_ALCUBIERRE_DEBUG_EVENTS) {
    const overflow = debugEvents.length - MAX_ALCUBIERRE_DEBUG_EVENTS;
    debugEvents.splice(0, overflow);
    droppedCount += overflow;
  }
  updatedAtMs = atMs;
  publishSnapshot();
  return event;
}

export function clearAlcubierreDebugEvents(): void {
  ensureInitialized();
  if (debugEvents.length === 0) return;
  debugEvents = [];
  updatedAtMs = Date.now();
  publishSnapshot();
}

export function getAlcubierreDebugLogSnapshot(): AlcubierreDebugLogSnapshot {
  ensureInitialized();
  return snapshot();
}

export function subscribeAlcubierreDebugLog(
  listener: (snapshot: AlcubierreDebugLogSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AlcubierreDebugLogSnapshot>).detail;
    if (!detail) return;
    listener(detail);
  };
  window.addEventListener(ALCUBIERRE_DEBUG_LOG_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(ALCUBIERRE_DEBUG_LOG_EVENT, handler as EventListener);
  };
}

export function subscribeAlcubierreDebugLogConfig(
  listener: (enabled: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
    if (!detail) return;
    listener(detail.enabled === true);
  };
  window.addEventListener(ALCUBIERRE_DEBUG_LOG_CONFIG_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(ALCUBIERRE_DEBUG_LOG_CONFIG_EVENT, handler as EventListener);
  };
}

export function buildAlcubierreDebugLogExport(events: AlcubierreDebugEvent[]): string {
  if (!Array.isArray(events) || events.length === 0) return "";
  return events.map((event) => JSON.stringify(event)).join("\n");
}
