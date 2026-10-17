import { describe, expect, it } from "vitest";

import { createHelixAskComposerInputFrameScheduler } from "../HelixAskComposerInputFrame";

describe("Helix Ask composer input-frame scheduler", () => {
  it("coalesces a burst to its latest native input", () => {
    const scheduled: FrameRequestCallback[] = [];
    const seen: string[] = [];
    const scheduler = createHelixAskComposerInputFrameScheduler({
      onFrame: ({ value }) => seen.push(value),
      scheduleFrame: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
    });
    const target = {} as HTMLTextAreaElement;

    scheduler.schedule({ value: "r", target });
    scheduler.schedule({ value: "re", target });
    scheduler.schedule({ value: "recrowned", target });

    expect(scheduled).toHaveLength(1);
    scheduled[0]?.(0);
    expect(seen).toEqual(["recrowned"]);
  });

  it("can synchronously flush the current draft before a submit", () => {
    const seen: string[] = [];
    const cancelled: number[] = [];
    const scheduler = createHelixAskComposerInputFrameScheduler({
      onFrame: ({ value }) => seen.push(value),
      scheduleFrame: () => 1,
      cancelFrame: (handle) => cancelled.push(handle),
    });

    scheduler.schedule({ value: "latest prompt", target: {} as HTMLTextAreaElement });
    scheduler.flush();

    expect(seen).toEqual(["latest prompt"]);
    expect(cancelled).toEqual([1]);
  });
});
