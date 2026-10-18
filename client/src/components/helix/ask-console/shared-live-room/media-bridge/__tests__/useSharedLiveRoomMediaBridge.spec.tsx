/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../../SharedLiveRoomApi";

const mocks = vi.hoisted(() => ({
  createBridge: vi.fn(),
}));

vi.mock("../RoomMediaBridge", () => ({
  createSharedLiveRoomMediaBridge: mocks.createBridge,
}));

import { useSharedLiveRoomMediaBridge } from
  "../useSharedLiveRoomMediaBridge";
import { INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION } from "../RoomMediaBridgeContracts";

describe("Shared Live Room media bridge hook", () => {
  beforeEach(() => {
    mocks.createBridge.mockReset();
  });

  it("waits for teardown completion before constructing a replacement bridge", async () => {
    let resolveClose: (() => void) | null = null;
    const closePending = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const firstBridge = {
      start: vi.fn(async () => undefined),
      syncRoom: vi.fn(),
      resumePlayback: vi.fn(async () => true),
      close: vi.fn(() => closePending),
    };
    const secondBridge = {
      start: vi.fn(async () => undefined),
      syncRoom: vi.fn(),
      resumePlayback: vi.fn(async () => true),
      close: vi.fn(async () => undefined),
    };
    mocks.createBridge
      .mockReturnValueOnce(firstBridge)
      .mockReturnValueOnce(secondBridge);
    const room = {
      room_id: "room:restart",
    } as HelixSharedRealtimeRoom;
    const self = {
      participant_id: "participant:owner",
      role: "owner",
    } as HelixSharedRealtimeRoomParticipant;
    const api = {} as HelixSharedLiveRoomApi;
    const { result } = renderHook(() => useSharedLiveRoomMediaBridge({
      room,
      self,
      realtimeSessionId: "realtime:restart",
      api,
    }));

    await act(async () => {
      await result.current.start();
    });
    expect(mocks.createBridge).toHaveBeenCalledTimes(1);

    let stopPromise: Promise<void>;
    let restartPromise: Promise<void>;
    act(() => {
      stopPromise = result.current.stop();
      restartPromise = result.current.start();
    });
    await Promise.resolve();
    expect(mocks.createBridge).toHaveBeenCalledTimes(1);

    resolveClose?.();
    await act(async () => {
      await Promise.all([stopPromise!, restartPromise!]);
    });
    expect(mocks.createBridge).toHaveBeenCalledTimes(2);
    expect(secondBridge.start).toHaveBeenCalledOnce();
  });

  it("closes rather than retargeting a peer connection when room identity changes", async () => {
    const bridge = {
      start: vi.fn(async () => undefined),
      syncRoom: vi.fn(),
      resumePlayback: vi.fn(async () => true),
      close: vi.fn(async () => undefined),
    };
    mocks.createBridge.mockReturnValue(bridge);
    const firstRoom = { room_id: "room:first" } as HelixSharedRealtimeRoom;
    const secondRoom = { room_id: "room:second" } as HelixSharedRealtimeRoom;
    const self = {
      participant_id: "participant:owner",
      role: "owner",
    } as HelixSharedRealtimeRoomParticipant;
    const api = {} as HelixSharedLiveRoomApi;
    const { result, rerender } = renderHook(
      ({ room }) => useSharedLiveRoomMediaBridge({
        room,
        self,
        realtimeSessionId: "realtime:room-switch",
        api,
      }),
      { initialProps: { room: firstRoom } },
    );

    await act(async () => {
      await result.current.start();
    });
    const emitOldProjection = mocks.createBridge.mock.calls[0]?.[0]?.onProjection;
    const oldTranscript = { speaker_kind: "participant" as const, speaker_label: "Dan", transcript: "Old room line", observed_at_ms: 1 };
    act(() => emitOldProjection?.({ ...INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
      latest_shared_transcript: oldTranscript, recent_shared_transcripts: [oldTranscript] }));
    expect(result.current.projection.recent_shared_transcripts).toHaveLength(1);
    rerender({ room: secondRoom });
    await waitFor(() => expect(bridge.close).toHaveBeenCalledOnce());
    expect(bridge.syncRoom).not.toHaveBeenCalledWith(secondRoom);
    act(() => emitOldProjection?.({ ...INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
      latest_shared_transcript: oldTranscript, recent_shared_transcripts: [oldTranscript] }));
    expect(result.current.projection.recent_shared_transcripts).toEqual([]);
  });

  it("constructs an explicit provider-detached bridge for human-only voice", async () => {
    const bridge = {
      start: vi.fn(async () => undefined),
      syncRoom: vi.fn(),
      resumePlayback: vi.fn(async () => true),
      close: vi.fn(async () => undefined),
    };
    mocks.createBridge.mockReturnValue(bridge);
    const room = { room_id: "room:human-voice" } as HelixSharedRealtimeRoom;
    const self = {
      participant_id: "participant:owner",
      role: "owner",
    } as HelixSharedRealtimeRoomParticipant;
    const api = {} as HelixSharedLiveRoomApi;
    const { result } = renderHook(() => useSharedLiveRoomMediaBridge({
      room,
      self,
      realtimeSessionId: null,
      providerAttachmentMode: "detached",
      api,
    }));

    await act(async () => {
      await result.current.start();
    });
    expect(mocks.createBridge).toHaveBeenCalledWith(expect.objectContaining({
      realtimeSessionId: null,
      providerAttachmentMode: "detached",
    }));
    expect(bridge.start).toHaveBeenCalledOnce();
  });
});
