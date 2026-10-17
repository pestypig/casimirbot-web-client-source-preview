import { describe, expect, it } from "vitest";
import { createSharedLiveRoomTranscriptSpeakerBindings } from
  "../RoomTranscriptSpeakerBindings";

describe("Shared Live Room transcript speaker bindings", () => {
  it("keeps the speech-start participant when the floor changes before completion", () => {
    const bindings = createSharedLiveRoomTranscriptSpeakerBindings();
    bindings.bind("item:owner", {
      participant_id: "participant:owner",
      display_name: "Dan",
    });
    bindings.bind("item:guest", {
      participant_id: "participant:guest",
      display_name: "Alex",
    });

    expect(bindings.consume("item:owner")).toEqual({
      participant_id: "participant:owner",
      display_name: "Dan",
    });
    expect(bindings.consume("item:guest")).toEqual({
      participant_id: "participant:guest",
      display_name: "Alex",
    });
  });

  it("consumes bindings once and evicts the oldest bounded item", () => {
    const bindings = createSharedLiveRoomTranscriptSpeakerBindings(2);
    bindings.bind("item:1", { participant_id: "p1", display_name: "One" });
    bindings.bind("item:2", { participant_id: "p2", display_name: "Two" });
    bindings.bind("item:3", { participant_id: "p3", display_name: "Three" });

    expect(bindings.consume("item:1")).toBeNull();
    expect(bindings.consume("item:2")?.participant_id).toBe("p2");
    expect(bindings.consume("item:2")).toBeNull();
  });
});
