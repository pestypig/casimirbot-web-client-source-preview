import type { HelixSharedLiveRoomApi } from "./SharedLiveRoomApi";

export async function resolveHelixAskSharedLiveRoomId(input: {
  api: HelixSharedLiveRoomApi;
  selectedRoomId: string | null;
}): Promise<string | null> {
  if (!input.selectedRoomId) return null;
  const selectedRoom = await input.api.getRoom(input.selectedRoomId);
  if (selectedRoom.room_id !== input.selectedRoomId) throw new Error("Selected room identity changed.");
  if (selectedRoom.status === "closed") throw new Error("Selected room is closed.");
  return selectedRoom.room_id;
}
