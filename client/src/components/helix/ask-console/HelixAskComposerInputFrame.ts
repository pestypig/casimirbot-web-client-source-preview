export type HelixAskComposerInputFrameInput = {
  value: string;
  target: HTMLTextAreaElement;
};

export type HelixAskComposerInputFrameScheduler = {
  schedule: (input: HelixAskComposerInputFrameInput) => void;
  flush: () => void;
  clear: () => void;
};

export type HelixAskComposerInputFrameSchedulerOptions = {
  onFrame: (input: HelixAskComposerInputFrameInput) => void;
  scheduleFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

function defaultScheduleFrame(callback: FrameRequestCallback): number {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 0) as unknown as number;
}

function defaultCancelFrame(handle: number): void {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

/**
 * Keeps native textarea painting on the input event while coalescing parent
 * presentation work (resize, slash-menu projection, and draft decoration) to
 * at most one update per frame.
 */
export function createHelixAskComposerInputFrameScheduler({
  onFrame,
  scheduleFrame = defaultScheduleFrame,
  cancelFrame = defaultCancelFrame,
}: HelixAskComposerInputFrameSchedulerOptions): HelixAskComposerInputFrameScheduler {
  let latest: HelixAskComposerInputFrameInput | null = null;
  let frameHandle: number | null = null;

  const flush = () => {
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
    const input = latest;
    latest = null;
    if (input) onFrame(input);
  };

  return {
    schedule(input) {
      latest = input;
      if (frameHandle !== null) return;
      frameHandle = scheduleFrame(() => flush());
    },
    flush,
    clear() {
      if (frameHandle !== null) cancelFrame(frameHandle);
      frameHandle = null;
      latest = null;
    },
  };
}
