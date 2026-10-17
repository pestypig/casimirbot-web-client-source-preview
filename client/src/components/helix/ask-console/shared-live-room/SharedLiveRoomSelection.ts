import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { sortHelixSharedLiveRooms } from "./useSharedLiveRoomSync";

export const reconcileSharedLiveRoomCollection = (
  current: HelixSharedRealtimeRoom[],
  nextRoom: HelixSharedRealtimeRoom,
): HelixSharedRealtimeRoom[] => nextRoom.status === "closed"
  ? current.filter((candidate) => candidate.room_id !== nextRoom.room_id)
  : sortHelixSharedLiveRooms([
      nextRoom,
      ...current.filter((candidate) => candidate.room_id !== nextRoom.room_id),
    ]);

export const reconcileSharedLiveRoomSelection = (
  current: HelixSharedRealtimeRoom | null,
  nextRoom: HelixSharedRealtimeRoom,
): HelixSharedRealtimeRoom | null => nextRoom.status === "closed"
  ? current?.room_id === nextRoom.room_id ? null : current
  : nextRoom;

export const selectInitialSharedLiveRoom = (
  current: HelixSharedRealtimeRoom | null,
  availableRooms: HelixSharedRealtimeRoom[],
): HelixSharedRealtimeRoom | null => current?.status !== "closed" && current !== null
  ? current
  : availableRooms.find((candidate) => candidate.status !== "closed") ?? null;
