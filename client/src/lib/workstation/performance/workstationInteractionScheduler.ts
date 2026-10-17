import { useWorkstationInteractionStore } from "@/store/useWorkstationInteractionStore";

export type WorkstationInteractionMode =
  | "idle"
  | "scrolling"
  | "dragging"
  | "resizing"
  | "typing"
  | "blocked";

export type WorkstationTaskPriority =
  | "immediate_input"
  | "visual_frame"
  | "committed_layout"
  | "evidence_refresh"
  | "share_state"
  | "background_diagnostics";

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type SchedulerLike = {
  yield?: () => Promise<void>;
};

type WindowWithIdle = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

type PendingTask = {
  key: string;
  priority: WorkstationTaskPriority;
  cancel: () => void;
};

type RunWhenQuietOptions = {
  key: string;
  priority: WorkstationTaskPriority;
  quietMs?: number;
  timeoutMs?: number;
};

const DEFAULT_INTERACTION_QUIET_MS: Record<WorkstationInteractionMode, number> = {
  idle: 0,
  scrolling: 260,
  dragging: 180,
  resizing: 220,
  typing: 320,
  blocked: 750,
};

const DEFAULT_TASK_QUIET_MS: Record<WorkstationTaskPriority, number> = {
  immediate_input: 0,
  visual_frame: 0,
  committed_layout: 120,
  evidence_refresh: 500,
  share_state: 700,
  background_diagnostics: 1000,
};

const DEFAULT_TASK_TIMEOUT_MS: Record<WorkstationTaskPriority, number> = {
  immediate_input: 0,
  visual_frame: 32,
  committed_layout: 750,
  evidence_refresh: 3000,
  share_state: 2500,
  background_diagnostics: 5000,
};

let currentMode: WorkstationInteractionMode = "idle";
let currentSource: string | null = null;
let activeSinceMs: number | null = null;
let lastInteractionAtMs: number | null = null;
let lastQuietAtMs: number | null = null;
let quietTimer: ReturnType<typeof setTimeout> | null = null;
let lastInteractionPublishAtMs = 0;
let deferredTaskCount = 0;
let lastDeferredAtMs: number | null = null;
const pendingTasks = new Map<string, PendingTask>();

const emptyPendingByPriority = (): Record<WorkstationTaskPriority, number> => ({
  immediate_input: 0,
  visual_frame: 0,
  committed_layout: 0,
  evidence_refresh: 0,
  share_state: 0,
  background_diagnostics: 0,
});

function publishInteraction(force = false): void {
  const now = Date.now();
  if (!force && now - lastInteractionPublishAtMs < 100) return;
  lastInteractionPublishAtMs = now;
  useWorkstationInteractionStore.getState().setInteractionSnapshot({
    mode: currentMode,
    source: currentSource,
    activeSinceMs,
    lastInteractionAtMs,
    lastQuietAtMs,
  });
}

function publishPending(): void {
  const pendingByPriority = emptyPendingByPriority();
  for (const task of pendingTasks.values()) {
    pendingByPriority[task.priority] += 1;
  }
  useWorkstationInteractionStore.getState().setPendingSnapshot({
    pendingTaskCount: pendingTasks.size,
    pendingByPriority,
    deferredTaskCount,
    lastDeferredAtMs,
  });
}

function clearQuietTimer(): void {
  if (quietTimer === null) return;
  clearTimeout(quietTimer);
  quietTimer = null;
}

function publishIdle(): void {
  currentMode = "idle";
  currentSource = null;
  activeSinceMs = null;
  lastQuietAtMs = Date.now();
  clearQuietTimer();
  publishInteraction(true);
}

function quietDelayFor(mode: WorkstationInteractionMode): number {
  return DEFAULT_INTERACTION_QUIET_MS[mode] ?? 300;
}

export function markInteraction(mode: Exclude<WorkstationInteractionMode, "idle">, source = "workstation"): void {
  const now = Date.now();
  if (currentMode === "idle") {
    activeSinceMs = now;
  }
  currentMode = mode;
  currentSource = source;
  lastInteractionAtMs = now;
  clearQuietTimer();
  quietTimer = setTimeout(publishIdle, quietDelayFor(mode));
  publishInteraction();
}

export function isInteractionActive(quietMs = 0): boolean {
  if (currentMode === "idle") return false;
  if (lastInteractionAtMs === null) return false;
  return Date.now() - lastInteractionAtMs < Math.max(quietMs, quietDelayFor(currentMode));
}

export function getWorkstationInteractionSnapshot() {
  const pendingByPriority = emptyPendingByPriority();
  for (const task of pendingTasks.values()) {
    pendingByPriority[task.priority] += 1;
  }
  return {
    mode: currentMode,
    source: currentSource,
    activeSinceMs,
    lastInteractionAtMs,
    lastQuietAtMs,
    pendingTaskCount: pendingTasks.size,
    pendingByPriority,
    deferredTaskCount,
    lastDeferredAtMs,
  };
}

export async function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (typeof scheduler?.yield === "function") {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve: () => void) => {
    setTimeout(resolve, 0);
  });
}

function clearPendingTask(key: string): void {
  const existing = pendingTasks.get(key);
  if (!existing) return;
  pendingTasks.delete(key);
  publishPending();
}

function registerPendingTask(key: string, priority: WorkstationTaskPriority, cancel: () => void): void {
  const existing = pendingTasks.get(key);
  if (existing) {
    existing.cancel();
    pendingTasks.delete(key);
  }
  pendingTasks.set(key, { key, priority, cancel });
  publishPending();
}

function runTask(task: () => void | Promise<void>, key: string): void {
  clearPendingTask(key);
  void Promise.resolve()
    .then(task)
    .catch(() => undefined);
}

export function runWhenQuiet(
  task: () => void | Promise<void>,
  options: RunWhenQuietOptions,
): () => void {
  if (typeof window === "undefined") {
    void Promise.resolve().then(task).catch(() => undefined);
    return () => undefined;
  }

  const quietMs = options.quietMs ?? DEFAULT_TASK_QUIET_MS[options.priority];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS[options.priority];
  const startedAtMs = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let canceled = false;

  const cancel = () => {
    canceled = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    clearPendingTask(options.key);
  };

  const attempt = () => {
    if (canceled) return;
    const now = Date.now();
    const timedOut = timeoutMs > 0 && now - startedAtMs >= timeoutMs;
    if (!timedOut && isInteractionActive(quietMs)) {
      deferredTaskCount += 1;
      lastDeferredAtMs = now;
      publishPending();
      const remainingQuietMs = lastInteractionAtMs === null
        ? quietMs
        : Math.max(quietMs - (now - lastInteractionAtMs), 32);
      timer = setTimeout(attempt, Math.min(remainingQuietMs, 160));
      return;
    }
    runTask(task, options.key);
  };

  registerPendingTask(options.key, options.priority, cancel);
  timer = setTimeout(attempt, 0);
  return cancel;
}

export function scheduleIdleTask(
  task: () => void | Promise<void>,
  options: Pick<RunWhenQuietOptions, "key" | "priority" | "timeoutMs">,
): () => void {
  if (typeof window === "undefined") {
    void Promise.resolve().then(task).catch(() => undefined);
    return () => undefined;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS[options.priority];
  const win = window as WindowWithIdle;
  let canceled = false;
  let idleId: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    canceled = true;
    if (idleId !== null && typeof win.cancelIdleCallback === "function") {
      win.cancelIdleCallback(idleId);
    }
    if (timer !== null) clearTimeout(timer);
    clearPendingTask(options.key);
  };

  const execute = () => {
    if (canceled) return;
    runTask(task, options.key);
  };

  registerPendingTask(options.key, options.priority, cancel);
  if (typeof win.requestIdleCallback === "function") {
    idleId = win.requestIdleCallback(execute, { timeout: timeoutMs });
  } else {
    timer = setTimeout(execute, Math.min(Math.max(timeoutMs, 1), 250));
  }
  return cancel;
}

export function resetWorkstationInteractionSchedulerForTests(): void {
  clearQuietTimer();
  for (const task of [...pendingTasks.values()]) {
    task.cancel();
  }
  pendingTasks.clear();
  currentMode = "idle";
  currentSource = null;
  activeSinceMs = null;
  lastInteractionAtMs = null;
  lastQuietAtMs = Date.now();
  lastInteractionPublishAtMs = 0;
  deferredTaskCount = 0;
  lastDeferredAtMs = null;
  useWorkstationInteractionStore.getState().reset();
}
