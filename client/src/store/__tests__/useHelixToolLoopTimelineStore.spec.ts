import { beforeEach, describe, expect, it } from "vitest";
import { buildPhysicsToolLoopCommentaryEvent } from "@shared/helix-physics-tool-loop-commentary";
import { useHelixToolLoopTimelineStore } from "../useHelixToolLoopTimelineStore";

describe("useHelixToolLoopTimelineStore", () => {
  beforeEach(() => {
    useHelixToolLoopTimelineStore.getState().clearTimeline();
  });

  it("stores and clears physics tool-loop commentary events", () => {
    const event = buildPhysicsToolLoopCommentaryEvent({
      planId: "plan:test",
      kind: "locator",
      timing: "after_step",
      status: "done",
      text: "Located Solar Spectrum.",
    });

    useHelixToolLoopTimelineStore.getState().appendEvent(event);

    expect(useHelixToolLoopTimelineStore.getState().activePlanId).toBe("plan:test");
    expect(useHelixToolLoopTimelineStore.getState().events).toHaveLength(1);

    useHelixToolLoopTimelineStore.getState().clearTimeline();

    expect(useHelixToolLoopTimelineStore.getState().events).toEqual([]);
    expect(useHelixToolLoopTimelineStore.getState().activePlanId).toBeNull();
  });
});
