import type { HelixPlan, HelixPlanAction } from "@shared/helix-plan";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";

export type PlanActionStatus = "applied" | "skipped" | "error";

export interface PlanActionResult {
  action: HelixPlanAction;
  status: PlanActionStatus;
  detail?: string;
}

export interface PlanExecutionRecord {
  planId: string;
  executedAt: number;
  results: PlanActionResult[];
}

export interface ExecutePlanOptions {
  dryRun?: boolean;
  requireConfirmation?: (action: Extract<HelixPlanAction, { op: "move_bubble" }>) => Promise<boolean> | boolean;
  broadcast?: boolean;
}

type Peak = { f: number; q: number; gain: number };

interface HelixExecutorState {
  rc: number;
  T: number;
  peaks: Peak[];
}

interface ActionOutcome {
  status: PlanActionStatus;
  detail?: string;
  state?: HelixExecutorState;
}

const MAX_PEAKS = 12;
const PEAK_FREQ_TOLERANCE_HZ = 35;
const EPS = 1e-4;
const DEFAULT_STATE: HelixExecutorState = { rc: 0.25, T: 0.2, peaks: [] };

const STATE_STORAGE_KEY = "helix:plan-state:v1";
const PLAN_LOG_KEY = "helix:plan-log:v1";
const PLAN_LOG_LIMIT = 50;
const NOISEGEN_TEMPO_KEY = "noisegen:tempo";
const NOISEGEN_BAR_WINDOW_KEY = "noisegen:barWindow";
const NOISEGEN_TEXTURE_KEY = "noisegen:kbTexture";
const NOISEGEN_RENDER_TRIGGER_KEY = "noisegen:renderCover";

const executedPlans = new Set<string>();
let memoryState: HelixExecutorState = cloneState(DEFAULT_STATE);

const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("helix-exec")
    : null;

const stateChannel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("helix-plan-state")
    : null;

let driveSyncAvailableCache: boolean | null = null;

export function readPlanLog(): PlanExecutionRecord[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(PLAN_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => sanitizeRecord(entry))
      .filter((entry): entry is PlanExecutionRecord => entry != null);
  } catch (err) {
    console.warn("[helix-plan] failed to parse plan log", err);
    return [];
  }
}

export function clearPlanLog() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(PLAN_LOG_KEY);
}

export function getHelixPlanState(): HelixExecutorState {
  return readExecutorState();
}

export function resetHelixPlanState() {
  persistExecutorState(cloneState(DEFAULT_STATE));
  executedPlans.clear();
}

export async function executeHelixPlan(
  planId: string,
  plan: HelixPlan,
  options: ExecutePlanOptions = {},
): Promise<PlanExecutionRecord> {
  if (!planId) {
    throw new Error("planId required");
  }

  const dryRun = options.dryRun === true;

  if (!dryRun && executedPlans.has(planId)) {
    return {
      planId,
      executedAt: Date.now(),
      results: plan.actions.map((action) => ({
        action,
        status: "skipped",
        detail: "duplicate plan id - skipped",
      })),
    };
  }

  if (!dryRun) {
    executedPlans.add(planId);
  }

  let state = readExecutorState();
  let dirty = false;
  const results: PlanActionResult[] = [];

  for (const action of plan.actions) {
    if (action.op === "move_bubble" && action.confirm) {
      const confirmed = await maybeConfirm(action, options);
      if (!confirmed) {
        results.push({
          action,
          status: "skipped",
          detail: "move_bubble requires user confirmation",
        });
        continue;
      }
    }

    try {
      const outcome = await runAction(action, state, options);
      if (outcome.state) {
        state = outcome.state;
      }
      if (outcome.status === "applied") {
        dirty = true;
      }
      results.push({
        action,
        status: outcome.status,
        detail: outcome.detail,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ action, status: "error", detail: message });
    }
  }

  const record: PlanExecutionRecord = {
    planId,
    executedAt: Date.now(),
    results,
  };

  if (!dryRun) {
    if (dirty) {
      persistExecutorState(state, planId);
    }
    persistRecord(record);
    if (options.broadcast !== false) {
      channel?.postMessage(record);
    }
  } else {
    executedPlans.delete(planId);
  }

  return record;
}

async function runAction(
  action: HelixPlanAction,
  state: HelixExecutorState,
  options: ExecutePlanOptions,
): Promise<ActionOutcome> {
  switch (action.op) {
    case "set_peaks":
      return applySetPeaks(action, state);
    case "set_rc":
      return applySetRc(action, state);
    case "set_T":
      return applySetT(action, state);
    case "move_bubble":
      return applyMoveBubble(action, options);
    case "sweep":
      return {
        status: "skipped",
        detail: `sweep ${action.param} deferred to dedicated controller`,
        state,
      };
    case "explain":
      return {
        status: "skipped",
        detail: "explain actions are delegated to local RAG",
        state,
      };
    case "set_tempo":
      return applySetTempo(action, state, options);
    case "set_bar_window":
      return applySetBarWindow(action, state, options);
    case "set_kb_texture":
      return applySetKbTexture(action, state, options);
    case "render_cover":
      return applyRenderCover(action, state, options);
    default:
      return {
        status: "skipped",
        detail: "unrecognized action",
        state,
      };
  }
}

function applySetPeaks(
  action: Extract<HelixPlanAction, { op: "set_peaks" }>,
  state: HelixExecutorState,
): ActionOutcome {
  const sanitized = action.peaks
    .map((peak) => sanitizePeak(peak))
    .filter((peak): peak is Peak => peak != null);

  if (!sanitized.length) {
    return { status: "skipped", detail: "no valid peaks provided", state };
  }

  const mode = action.mode ?? "absolute";
  const { peaks, changed } = mergePeaks(state.peaks, sanitized, mode);

  if (!changed) {
    return { status: "skipped", detail: "peaks unchanged", state };
  }

  return {
    status: "applied",
    detail: `${mode} peaks -> ${peaks.length}`,
    state: { ...state, peaks },
  };
}

function applySetRc(
  action: Extract<HelixPlanAction, { op: "set_rc" }>,
  state: HelixExecutorState,
): ActionOutcome {
  const rc = clamp(action.rc, 0.01, 1);
  if (Math.abs(rc - state.rc) < EPS) {
    return { status: "skipped", detail: `rc already ${state.rc.toFixed(3)}`, state };
  }
  return {
    status: "applied",
    detail: `rc ${state.rc.toFixed(3)} → ${rc.toFixed(3)}`,
    state: { ...state, rc },
  };
}

function applySetT(
  action: Extract<HelixPlanAction, { op: "set_T" }>,
  state: HelixExecutorState,
): ActionOutcome {
  const T = clamp(action.T, 0.01, 1);
  if (Math.abs(T - state.T) < EPS) {
    return { status: "skipped", detail: `T already ${state.T.toFixed(3)}`, state };
  }
  return {
    status: "applied",
    detail: `T ${state.T.toFixed(3)} → ${T.toFixed(3)}`,
    state: { ...state, T },
  };
}

function applyMoveBubble(
  action: Extract<HelixPlanAction, { op: "move_bubble" }>,
  options: ExecutePlanOptions,
): ActionOutcome {
  if (options.dryRun) {
    return { status: "skipped", detail: "dry-run (no bubble movement)" };
  }

  if (!driveSyncAvailable()) {
    return { status: "skipped", detail: "drive sync store unavailable in this environment" };
  }

  const store = useDriveSyncStore.getState();
  const { intent } = store;

  const target = {
    x: clamp(intent.x + clamp(action.dx, -1, 1), -1, 1),
    y: clamp(intent.y + clamp(action.dy, -1, 1), -1, 1),
    z: clamp(intent.z, -1, 1),
  };

  if (Math.abs(target.x - intent.x) < EPS && Math.abs(target.y - intent.y) < EPS) {
    return { status: "skipped", detail: "warp bubble unchanged" };
  }

  store.setIntent(target);

  if (typeof action.speed === "number" && Number.isFinite(action.speed)) {
    const magnitude = clamp(Math.hypot(target.x, target.y), 0, 1);
    store.setNudge01(Math.max(store.nudge01, magnitude));
  }

  return {
    status: "applied",
    detail: `bubble intent → (${target.x.toFixed(2)}, ${target.y.toFixed(2)})`,
  };
}

function applySetTempo(
  action: Extract<HelixPlanAction, { op: "set_tempo" }>,
  state: HelixExecutorState,
  options: ExecutePlanOptions,
): ActionOutcome {
  const dryRun = options.dryRun === true;
  if (!dryRun) {
    persistNoisegenSetting(NOISEGEN_TEMPO_KEY, action.tempo);
  }
  const detail = `tempo ${Math.round(action.tempo.bpm)} bpm ${action.tempo.timeSig}`;
  return {
    status: "applied",
    detail: dryRun ? `${detail} (preview)` : detail,
    state,
  };
}

function applySetBarWindow(
  action: Extract<HelixPlanAction, { op: "set_bar_window" }>,
  state: HelixExecutorState,
  options: ExecutePlanOptions,
): ActionOutcome {
  const dryRun = options.dryRun === true;
  if (action.endBar <= action.startBar) {
    return {
      status: "skipped",
      detail: "invalid bar window (end <= start)",
      state,
    };
  }
  if (!dryRun) {
    persistNoisegenSetting(NOISEGEN_BAR_WINDOW_KEY, {
      startBar: action.startBar,
      endBar: action.endBar,
    });
  }
  const detail = `bar window ${action.startBar}-${action.endBar} (exclusive)`;
  return {
    status: "applied",
    detail: dryRun ? `${detail} (preview)` : detail,
    state,
  };
}

function applySetKbTexture(
  action: Extract<HelixPlanAction, { op: "set_kb_texture" }>,
  state: HelixExecutorState,
  options: ExecutePlanOptions,
): ActionOutcome {
  const dryRun = options.dryRun === true;
  if (!dryRun) {
    if (action.kbId == null) {
      persistNoisegenSetting(NOISEGEN_TEXTURE_KEY, null);
    } else {
      persistNoisegenSetting(NOISEGEN_TEXTURE_KEY, action.kbId);
    }
  }
  const detail = action.kbId ? `kb texture ${action.kbId}` : "kb texture auto";
  return {
    status: "applied",
    detail: dryRun ? `${detail} (preview)` : detail,
    state,
  };
}

function applyRenderCover(
  _action: Extract<HelixPlanAction, { op: "render_cover" }>,
  state: HelixExecutorState,
  options: ExecutePlanOptions,
): ActionOutcome {
  const dryRun = options.dryRun === true;
  if (!dryRun) {
    const triggerToken = Date.now().toString(36);
    persistNoisegenSetting(NOISEGEN_RENDER_TRIGGER_KEY, triggerToken);
  }
  return {
    status: "applied",
    detail: dryRun ? "render_cover (preview)" : "render cover requested",
    state,
  };
}

async function maybeConfirm(
  action: Extract<HelixPlanAction, { op: "move_bubble" }>,
  options: ExecutePlanOptions,
) {
  if (!action.confirm) return true;

  if (options.requireConfirmation) {
    try {
      const result = await options.requireConfirmation(action);
      if (result === true) return true;
    } catch (err) {
      console.warn("[helix-plan] confirm hook threw:", err);
      return false;
    }
    return false;
  }

  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const dx = action.dx.toFixed(2);
    const dy = action.dy.toFixed(2);
    return window.confirm(`Move warp bubble by dx=${dx}, dy=${dy}?`);
  }

  return false;
}

function mergePeaks(base: Peak[], updates: Peak[], mode: "absolute" | "relative") {
  if (mode === "absolute") {
    const next = normalizePeaks(updates);
    return {
      peaks: next,
      changed: !arraysEqual(base, next),
    };
  }

  const next = normalizePeaks(base);
  let changed = false;

  for (const update of updates) {
    const idx = next.findIndex((peak) => Math.abs(peak.f - update.f) <= PEAK_FREQ_TOLERANCE_HZ);
    if (idx >= 0) {
      if (!peaksEqual(next[idx], update)) {
        next[idx] = update;
        changed = true;
      }
    } else if (next.length < MAX_PEAKS) {
      next.push(update);
      changed = true;
    } else {
      const lowestIdx = next.reduce((acc, peak, index) => (peak.gain < next[acc].gain ? index : acc), 0);
      if (update.gain > next[lowestIdx].gain + 1e-3) {
        next[lowestIdx] = update;
        changed = true;
      }
    }
  }

  next.sort((a, b) => a.f - b.f);
  if (next.length > MAX_PEAKS) {
    next.length = MAX_PEAKS;
  }

  return { peaks: next, changed };
}

function normalizePeaks(peaks: Peak[]): Peak[] {
  return peaks
    .map((peak) => sanitizePeak(peak))
    .filter((peak): peak is Peak => peak != null)
    .slice(0, MAX_PEAKS)
    .sort((a, b) => a.f - b.f);
}

function sanitizePeak(peak: { f: number; q: number; gain: number } | null | undefined): Peak | null {
  if (!peak) return null;
  const f = Number(peak.f);
  const q = Number(peak.q);
  const gain = Number(peak.gain);
  if (!Number.isFinite(f) || !Number.isFinite(q) || !Number.isFinite(gain)) {
    return null;
  }
  return {
    f: clamp(f, 5, 20_000),
    q: clamp(q, 0.1, 50),
    gain: clamp(gain, 0, 2),
  };
}

function arraysEqual(a: Peak[], b: Peak[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!peaksEqual(a[i], b[i])) return false;
  }
  return true;
}

function peaksEqual(a: Peak, b: Peak) {
  return (
    Math.abs(a.f - b.f) < 0.5 &&
    Math.abs(a.q - b.q) < 1e-3 &&
    Math.abs(a.gain - b.gain) < 1e-3
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readExecutorState(): HelixExecutorState {
  if (!hasWindow()) {
    return cloneState(memoryState);
  }

  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return cloneState(memoryState);
    const parsed = JSON.parse(raw) as Partial<HelixExecutorState>;
    const rc = typeof parsed?.rc === "number" ? clamp(parsed.rc, 0.01, 1) : DEFAULT_STATE.rc;
    const T = typeof parsed?.T === "number" ? clamp(parsed.T, 0.01, 1) : DEFAULT_STATE.T;
    const peaks = Array.isArray(parsed?.peaks)
      ? parsed.peaks.map((peak) => sanitizePeak(peak)).filter((peak): peak is Peak => peak != null)
      : [];
    const state: HelixExecutorState = { rc, T, peaks: peaks.slice(0, MAX_PEAKS) };
    memoryState = cloneState(state);
    return state;
  } catch {
    return cloneState(memoryState);
  }
}

function persistExecutorState(state: HelixExecutorState, planId?: string) {
  memoryState = cloneState(state);

  if (hasWindow()) {
    try {
      window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(memoryState));
    } catch (err) {
      console.warn("[helix-plan] failed to persist plan state", err);
    }
  }

  try {
    stateChannel?.postMessage({ type: "state", planId, state: memoryState });
  } catch {
    /* ignore broadcast errors */
  }
}

function persistRecord(record: PlanExecutionRecord) {
  if (!hasWindow()) return;
  try {
    const existing = readPlanLog();
    const next = [record, ...existing].slice(0, PLAN_LOG_LIMIT);
    window.localStorage.setItem(PLAN_LOG_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[helix-plan] failed to persist plan record", err);
  }
}

function sanitizeRecord(entry: unknown): PlanExecutionRecord | null {
  if (!entry || typeof entry !== "object") return null;
  const scoped = entry as Record<string, unknown>;
  const planId = typeof scoped.planId === "string" ? scoped.planId : null;
  const executedAt = typeof scoped.executedAt === "number" ? scoped.executedAt : null;
  const results = Array.isArray(scoped.results)
    ? scoped.results
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null;
          const { action, status, detail } = raw as PlanActionResult;
          if (!action || typeof action !== "object") return null;
          if (status !== "applied" && status !== "skipped" && status !== "error") {
            return null;
          }
          return {
            action,
            status,
            detail: typeof detail === "string" ? detail : undefined,
          } satisfies PlanActionResult;
        })
        .filter(Boolean) as PlanActionResult[]
    : [];
  if (!planId || !executedAt || results.length === 0) return null;
  return { planId, executedAt, results };
}

function cloneState(state: HelixExecutorState): HelixExecutorState {
  return {
    rc: state.rc,
    T: state.T,
    peaks: state.peaks.map((peak) => ({ ...peak })),
  };
}

function driveSyncAvailable() {
  if (driveSyncAvailableCache != null) return driveSyncAvailableCache;
  if (typeof window === "undefined") {
    driveSyncAvailableCache = false;
    return driveSyncAvailableCache;
  }
  try {
    useDriveSyncStore.getState();
    driveSyncAvailableCache = true;
  } catch {
    driveSyncAvailableCache = false;
  }
  return driveSyncAvailableCache;
}

function persistNoisegenSetting(key: string, value: unknown) {
  if (!hasWindow()) return;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else if (typeof value === "string") {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.warn(`[helix-plan] failed to persist noisegen setting ${key}`, err);
  }
}
