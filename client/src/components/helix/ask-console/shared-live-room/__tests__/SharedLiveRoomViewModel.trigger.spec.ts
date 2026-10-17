import { expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { describeHelixSharedLiveRoomTrigger } from "../SharedLiveRoomViewModel";

const room = (capacity_profile: "two_person_voice" | "three_human_text", members: number) => ({
  capacity_profile,
  participants: Array.from({ length: members }, (_, index) => ({
    participant_id: `participant:${index}`, presence: "present",
  })),
}) as unknown as HelixSharedRealtimeRoom;

it("describes private Ask separately and counts the selected human room profile", () => {
  expect(describeHelixSharedLiveRoomTrigger(null)).toMatchObject({ label: "Room" });
  expect(describeHelixSharedLiveRoomTrigger(room("two_person_voice", 2))).toEqual({
    label: "Room 2/2",
    title: "Party Chat is separate from Ask Helix; GPT Live voice can be connected after consent.",
  });
  expect(describeHelixSharedLiveRoomTrigger(room("three_human_text", 3))).toEqual({
    label: "Room 3/3 · Text",
    title: "Three-person Party Chat. Ask Helix stays separate; GPT Live voice is unavailable.",
  });
});
