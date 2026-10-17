import { describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../SharedLiveRoomApi";
import { resolveHelixAskSharedLiveRoomId } from "../SharedLiveRoomAskScope";

const room = (
  roomId: string,
  status: HelixSharedRealtimeRoom["status"],
  updatedAt: string,
): HelixSharedRealtimeRoom => ({
  room_id: roomId,
  status,
  updated_at: updatedAt,
} as HelixSharedRealtimeRoom);

describe("Shared Live Room typed Ask scope", () => {
  it("validates the selected room before using its thread scope", async () => {
    const api = {
      getRoom: vi.fn().mockResolvedValue(room("room:selected", "ready", "2026-08-26T12:00:00Z")),
      listRooms: vi.fn(),
    } as unknown as HelixSharedLiveRoomApi;

    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: "room:selected",
    })).resolves.toBe("room:selected");
    expect(api.listRooms).not.toHaveBeenCalled();
  });

  it("keeps Ask private when no room is explicitly selected", async () => {
    const api = {
      getRoom: vi.fn(),
      listRooms: vi.fn().mockResolvedValue([
        room("room:closed", "closed", "2026-08-26T12:03:00Z"),
        room("room:older", "ready", "2026-08-26T12:01:00Z"),
        room("room:newer", "active", "2026-08-26T12:02:00Z"),
      ]),
    } as unknown as HelixSharedLiveRoomApi;

    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: null,
    })).resolves.toBeNull();
    expect(api.listRooms).not.toHaveBeenCalled();
  });

  it("does not infer the only open room from account membership", async () => {
    const api = {
      getRoom: vi.fn(),
      listRooms: vi.fn().mockResolvedValue([
        room("room:closed", "closed", "2026-08-26T12:03:00Z"),
        room("room:only-open", "ready", "2026-08-26T12:01:00Z"),
      ]),
    } as unknown as HelixSharedLiveRoomApi;

    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: null,
    })).resolves.toBeNull();
    expect(api.listRooms).not.toHaveBeenCalled();
  });

  it("fails closed instead of sending a selected-room turn to private Ask", async () => {
    const api = {
      getRoom: vi.fn().mockResolvedValue(room("room:closed", "closed", "2026-08-26T12:00:00Z")),
      listRooms: vi.fn(),
    } as unknown as HelixSharedLiveRoomApi;

    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: "room:closed",
    })).rejects.toThrow("Selected room is closed.");
  });

  it("fails closed when selected room identity cannot be verified", async () => {
    const api = {
      getRoom: vi.fn().mockRejectedValue(new Error("room service unavailable")),
      listRooms: vi.fn(),
    } as unknown as HelixSharedLiveRoomApi;

    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: "room:selected",
    })).rejects.toThrow("room service unavailable");
  });

  it("rejects a mismatched selected-room response", async () => {
    const api = {
      getRoom: vi.fn().mockResolvedValue(room("room:other", "ready", "2026-08-26T12:00:00Z")),
      listRooms: vi.fn(),
    } as unknown as HelixSharedLiveRoomApi;
    await expect(resolveHelixAskSharedLiveRoomId({
      api,
      selectedRoomId: "room:selected",
    })).rejects.toThrow("Selected room identity changed.");
  });
});
