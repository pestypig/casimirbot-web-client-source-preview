// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkstationInteractionStore } from "@/store/useWorkstationInteractionStore";
import {
  markInteraction,
  resetWorkstationInteractionSchedulerForTests,
  runWhenQuiet,
} from "../workstationInteractionScheduler";

describe("workstationInteractionScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetWorkstationInteractionSchedulerForTests();
  });

  afterEach(() => {
    resetWorkstationInteractionSchedulerForTests();
    vi.useRealTimers();
  });

  it("tracks active interaction mode and returns to idle after quiet time", async () => {
    markInteraction("scrolling", "spec.scroll");
    expect(useWorkstationInteractionStore.getState()).toMatchObject({
      mode: "scrolling",
      source: "spec.scroll",
    });

    await vi.advanceTimersByTimeAsync(300);

    expect(useWorkstationInteractionStore.getState()).toMatchObject({
      mode: "idle",
      source: null,
    });
  });

  it("defers share-state work until the workstation is quiet", async () => {
    const task = vi.fn();

    markInteraction("scrolling", "spec.scroll");
    runWhenQuiet(task, {
      key: "spec.share_state",
      priority: "share_state",
      quietMs: 240,
      timeoutMs: 1200,
    });

    await vi.advanceTimersByTimeAsync(120);
    expect(task).not.toHaveBeenCalled();
    expect(useWorkstationInteractionStore.getState().pendingTaskCount).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(1);
    expect(useWorkstationInteractionStore.getState().pendingTaskCount).toBe(0);
    expect(useWorkstationInteractionStore.getState().deferredTaskCount).toBeGreaterThan(0);
  });

  it("coalesces keyed background tasks so stale diagnostics do not stack up", async () => {
    const first = vi.fn();
    const second = vi.fn();

    markInteraction("resizing", "spec.resize");
    runWhenQuiet(first, {
      key: "spec.background",
      priority: "background_diagnostics",
      quietMs: 400,
      timeoutMs: 1500,
    });
    runWhenQuiet(second, {
      key: "spec.background",
      priority: "background_diagnostics",
      quietMs: 400,
      timeoutMs: 1500,
    });

    expect(useWorkstationInteractionStore.getState().pendingTaskCount).toBe(1);

    await vi.advanceTimersByTimeAsync(900);
    await Promise.resolve();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
