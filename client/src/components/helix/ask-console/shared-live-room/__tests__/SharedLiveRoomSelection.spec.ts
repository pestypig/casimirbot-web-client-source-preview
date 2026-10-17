import { describe, expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import {
  reconcileSharedLiveRoomCollection,
  reconcileSharedLiveRoomSelection,
  selectInitialSharedLiveRoom,
} from "../SharedLiveRoomSelection";

const room = (
  roomId: string,
  status: HelixSharedRealtimeRoom["status"],
  updatedAt: string,
): HelixSharedRealtimeRoom => ({
  room_id: roomId,
  status,
  updated_at: updatedAt,
} as HelixSharedRealtimeRoom);

describe("Shared Live Room selection reconciliation", () => {
  it("does not let a late closed-room sync reselect the room after owner closure", () => {
    const closed = room("shared_realtime_room:old", "closed", "2026-08-26T17:30:00.000Z");

    expect(reconcileSharedLiveRoomSelection(closed, closed)).toBeNull();
    expect(reconcileSharedLiveRoomCollection([closed], closed)).toEqual([]);
  });

  it("preserves an unrelated active room when a closed-room update arrives", () => {
    const active = room("shared_realtime_room:active", "waiting", "2026-08-26T17:31:00.000Z");
    const closed = room("shared_realtime_room:old", "closed", "2026-08-26T17:30:00.000Z");

    expect(reconcileSharedLiveRoomSelection(active, closed)).toBe(active);
    expect(reconcileSharedLiveRoomCollection([active, closed], closed)).toEqual([active]);
  });

  it("selects only a resumable room when initial state still references a closed room", () => {
    const closed = room("shared_realtime_room:old", "closed", "2026-08-26T17:30:00.000Z");
    const active = room("shared_realtime_room:active", "waiting", "2026-08-26T17:31:00.000Z");

    expect(selectInitialSharedLiveRoom(closed, [closed, active])).toBe(active);
    expect(selectInitialSharedLiveRoom(closed, [closed])).toBeNull();
  });
});
