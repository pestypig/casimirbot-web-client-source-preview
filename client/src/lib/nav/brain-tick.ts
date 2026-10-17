export type BrainTickContext = {
  tick: number;
  dt_s: number;
  scheduledAt_ms: number;
  now_ms: number;
  drift_ms: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type BrainTickSchedulerOptions = {
  hz?: number;
  maxCatchUpTicks?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay_ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  onTick: (context: BrainTickContext) => void;
};

const clampHz = (hz?: number): number => {
  if (!Number.isFinite(hz)) return 12;
  return Math.min(20, Math.max(10, Number(hz)));
};

const defaultNow = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

export type BrainTickScheduler = {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
};

export const createFixedHzBrainLoop = (options: BrainTickSchedulerOptions): BrainTickScheduler => {
  const hz = clampHz(options.hz);
  const period_ms = 1000 / hz;
  const maxCatchUpTicks = Math.max(1, Math.floor(options.maxCatchUpTicks ?? 4));
  const now = options.now ?? defaultNow;
  const setTimer = options.setTimer ?? ((cb, delay) => setTimeout(cb, delay));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));

  let running = false;
  let timer: TimerHandle | undefined;
  let nextScheduledAt = 0;
  let tick = 0;

  const schedule = () => {
    if (!running) return;
    const delay = Math.max(0, nextScheduledAt - now());
    timer = setTimer(flush, delay);
  };

  const flush = () => {
    if (!running) return;

    const now_ms = now();
    let processed = 0;

    while (running && now_ms >= nextScheduledAt && processed < maxCatchUpTicks) {
      const scheduledAt_ms = nextScheduledAt;
      tick += 1;
      options.onTick({
        tick,
        dt_s: period_ms / 1000,
        scheduledAt_ms,
        now_ms,
        drift_ms: now_ms - scheduledAt_ms,
      });
      nextScheduledAt += period_ms;
      processed += 1;
    }

    if (now_ms > nextScheduledAt + period_ms) {
      nextScheduledAt = now_ms + period_ms;
    }

    schedule();
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      tick = 0;
      nextScheduledAt = now() + period_ms;
      schedule();
    },
    stop: () => {
      running = false;
      if (timer !== undefined) {
        clearTimer(timer);
        timer = undefined;
      }
    },
    isRunning: () => running,
  };
};
