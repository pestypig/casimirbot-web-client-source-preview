/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { helixSharedLiveRoomApi } from "../SharedLiveRoomApi";
import { useHelixSharedLiveRoom } from "../useHelixSharedLiveRoom";

const media = vi.hoisted(() => ({ connected: true }));
vi.mock("../useSharedLiveRoomSync", () => ({
  useSharedLiveRoomSync: () => undefined,
  sortHelixSharedLiveRooms: (rooms: HelixSharedRealtimeRoom[]) => rooms,
}));
vi.mock("../SharedLiveRoomDebugArtifact", () => ({
  buildSharedLiveRoomDebugArtifact: () => null,
  recordSharedLiveRoomDebugArtifact: () => undefined,
}));
vi.mock("../useSharedLiveRoomVisualIngress", () => ({
  useSharedLiveRoomVisualIngress: () => ({ frameUpload: { status: "idle" }, resetVisualIngress: () => undefined }),
}));
vi.mock("../media-bridge/useSharedLiveRoomMediaBridge", () => ({
  useSharedLiveRoomMediaBridge: () => ({ projection: { peer_audio_connected: media.connected } }),
}));

const room = (id: string): HelixSharedRealtimeRoom => ({
  schema: "helix.shared_realtime_room.v1", room_id: id, title: id, status: "active",
  max_participants: 2, capacity_profile: "two_person_voice", self_participant_id: "participant:self",
  participants: [{ participant_id: "participant:self", display_name: "Test owner", role: "owner",
    presence: "present", joined_at: "2026-11-13T00:00:00.000Z", last_seen_at: "2026-11-13T00:00:00.000Z",
    consent: { schema: "helix.shared_realtime_room.consent.v1", microphone_to_room: true,
      microphone_to_model: true, transcript_to_room: false, screen_to_model: false,
      screen_thumbnail_to_room: false, model_audio_output: true, consent_version: 1,
      consent_receipt_ref: "consent:test", updated_at: "2026-11-13T00:00:00.000Z" } }],
  participant_context_cards: [], public_terminal_results: [],
  readiness: { participant_count: 1, required_participant_count: 2, ready: false,
    missing_participant_count: 1, missing_consent_by_participant: {} },
  runtime: { runtime_id: "runtime:" + id, state: "bridge_active", topology: "single_shared_model",
    transport_owner: "room_media_bridge", model: null, active_speaker_participant_id: "participant:self",
    provider_session_ref_hash: null, realtime_session_ref_hash: null, reserved_by_participant_id: null,
    started_at: null, updated_at: "2026-11-13T00:00:00.000Z", limitations: [] },
  created_at: "2026-11-13T00:00:00.000Z", updated_at: "2026-11-13T00:00:00.000Z", closed_at: null,
  answer_authority: false, assistant_answer: false, terminal_eligible: false, raw_content_included: false,
});
const deferred = () => {
  let resolve!: (value: HelixSharedRealtimeRoom) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<HelixSharedRealtimeRoom>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = () => {
  const pending = deferred();
  const takeFloor = vi.fn((_id: string) => pending.promise);
  const api = { ...helixSharedLiveRoomApi, takeFloor,
    getRoom: vi.fn(async (id: string) => room(id)), leaveRoom: vi.fn(async () => null) };
  const hook = renderHook(() => useHelixSharedLiveRoom({ api, realtimeSessionId: null,
    runtimeActive: false, realtimeModel: "test-model" }));
  const open = async (id: string) => { await act(async () => { expect(await hook.result.current.openRoom(id)).toBe(true); }); };
  const tick = async (ms = 3000) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const resolve = async (value: HelixSharedRealtimeRoom) => { await act(async () => { pending.resolve(value); }); };
  return { ...hook, pending, takeFloor, open, tick, resolve };
};
beforeEach(() => { vi.useFakeTimers(); media.connected = true; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Shared Live Room automatic floor renewal ownership", () => {
  it("does not renew without a selected room", async () => {
    const h = setup(); await h.tick(9000); expect(h.takeFloor).not.toHaveBeenCalled();
  });
  it("applies a response while its exact room and transport remain active", async () => {
    const h = setup(); await h.open("room:a"); await h.tick();
    expect(h.takeFloor).toHaveBeenCalledWith("room:a");
    await h.resolve({ ...room("room:a"), title: "Renewed" });
    expect(h.result.current.room?.title).toBe("Renewed");
  });
  it("does not reselect an old room after switching rooms", async () => {
    const h = setup(); await h.open("room:a"); await h.tick(); await h.open("room:b");
    await h.resolve({ ...room("room:a"), title: "Late" });
    expect(h.result.current.room?.room_id).toBe("room:b");
    expect(h.result.current.rooms.find(r => r.room_id === "room:a")?.title).toBe("room:a");
  });
  it("does not rejoin a room after leaving it", async () => {
    const h = setup(); await h.open("room:a"); await h.tick();
    await act(async () => { expect(await h.result.current.leaveRoom()).toBe(true); });
    await h.resolve(room("room:a"));
    expect(h.result.current.room).toBeNull(); expect(h.result.current.rooms).toEqual([]);
  });
  it("ignores a pending renewal after the audio connection ends", async () => {
    const h = setup(); await h.open("room:a"); await h.tick(); media.connected = false; h.rerender();
    await h.resolve({ ...room("room:a"), title: "Late" });
    expect(h.result.current.room?.title).toBe("room:a");
    await h.tick(); expect(h.takeFloor).toHaveBeenCalledTimes(1);
  });
  it("does not revive a retired renewal when the same room reconnects", async () => {
    const h = setup(); await h.open("room:a"); await h.tick();
    media.connected = false; h.rerender(); media.connected = true; h.rerender();
    await h.resolve({ ...room("room:a"), title: "Retired connection" });
    expect(h.result.current.room?.title).toBe("room:a");
  });
  it("keeps at most one automatic renewal pending per active connection", async () => {
    const h = setup(); await h.open("room:a"); await h.tick(12000);
    expect(h.takeFloor).toHaveBeenCalledTimes(1);
  });
  it("retries on the next interval after a rejected renewal", async () => {
    const h = setup(); await h.open("room:a"); await h.tick();
    await act(async () => { h.pending.reject(new Error("Temporary disconnect")); });
    h.takeFloor.mockResolvedValueOnce(room("room:a")); await h.tick();
    expect(h.takeFloor).toHaveBeenCalledTimes(2); expect(h.result.current.error).toBeNull();
  });
  it("rejects a response carrying a different room identity", async () => {
    const h = setup(); await h.open("room:a"); await h.tick(); await h.resolve(room("room:b"));
    expect(h.result.current.room?.room_id).toBe("room:a");
  });
  it("removes the renewal timer on unmount", async () => {
    const h = setup(); await h.open("room:a"); await h.tick(); h.unmount();
    await h.resolve(room("room:a")); await h.tick(9000); expect(h.takeFloor).toHaveBeenCalledTimes(1);
  });
});
