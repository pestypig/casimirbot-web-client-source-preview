import { expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { describeHelixSharedLiveRoomReadiness, describeHelixSharedLiveRoomTrigger } from "../SharedLiveRoomViewModel";

const room = (capacity_profile: "two_person_voice" | "three_person_voice" | "three_human_text", members: number) => ({
  capacity_profile,
  max_participants: capacity_profile === "two_person_voice" ? 2 : 3,
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
  expect(describeHelixSharedLiveRoomTrigger(room("three_person_voice", 3))).toEqual({
    label: "Room 3/3 · Voice pending",
    title: "Three-person consent evaluation. GPT Live media is unavailable until the group bridge is installed.",
  });
  expect(describeHelixSharedLiveRoomTrigger(room("three_human_text", 3))).toEqual({
    label: "Room 3/3 · Text",
    title: "Three-person Party Chat. Ask Helix stays separate; GPT Live voice is unavailable.",
  });
});

it("reports group consent without claiming a shared GPT Live media context", () => {
  const group = room("three_person_voice", 3);
  group.readiness = { ready: true } as HelixSharedRealtimeRoom["readiness"];
  expect(describeHelixSharedLiveRoomReadiness(group))
    .toBe("Three-person consent ready · group GPT Live media pending");
});
