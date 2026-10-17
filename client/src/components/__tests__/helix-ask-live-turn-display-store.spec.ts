import { describe, expect, it } from "vitest";

import {
  appendHelixAskLiveTurnDisplayEvent,
  createHelixAskLiveTurnDisplayState,
} from "@/components/helix/ask-console/HelixAskLiveTurnDisplayStore";

describe("HelixAskLiveTurnDisplayStore", () => {
  it("appends active display events without mutating the prior state", () => {
    const initial = createHelixAskLiveTurnDisplayState();
    const next = appendHelixAskLiveTurnDisplayEvent(
      initial,
      {
        id: "event-1",
        text: "Tool request",
        ts: "2026-07-02T00:00:00.000Z",
        tsMs: 1783029000000,
        meta: { source_event_type: "tool_request" },
      },
      8,
    );

    expect(initial.events).toEqual([]);
    expect(next.events).toHaveLength(1);
    expect(next.version).toBe(1);
    expect(next.lastEventId).toBe("event-1");
  });

  it("dedupes active display events by id and clips to the configured limit", () => {
    let state = createHelixAskLiveTurnDisplayState();
    state = appendHelixAskLiveTurnDisplayEvent(state, { id: "event-1", text: "one" }, 2);
    state = appendHelixAskLiveTurnDisplayEvent(state, { id: "event-2", text: "two" }, 2);
    state = appendHelixAskLiveTurnDisplayEvent(state, { id: "event-3", text: "three" }, 2);
    const deduped = appendHelixAskLiveTurnDisplayEvent(state, { id: "event-3", text: "three again" }, 2);

    expect(state.events.map((event) => event.id)).toEqual(["event-2", "event-3"]);
    expect(deduped.events.map((event) => event.id)).toEqual(["event-2", "event-3"]);
    expect(deduped.duplicateEventCount).toBe(1);
  });
});
