/** @vitest-environment jsdom */

import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from
  "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../SharedLiveRoomApi";
import { useSharedLiveRoomSync } from "../useSharedLiveRoomSync";

const room = {
  room_id: "room:fast-floor-sync",
  updated_at: new Date(0).toISOString(),
} as HelixSharedRealtimeRoom;

function Harness({
  api,
  foreground = true,
}: {
  api: HelixSharedLiveRoomApi;
  foreground?: boolean;
}) {
  useSharedLiveRoomSync({
    api,
    activeRoomId: room.room_id,
    foreground,
    onInitialRooms: vi.fn(),
    onRoom: vi.fn(),
    onFrames: vi.fn(),
    onClearRoomArtifacts: vi.fn(),
    onError: vi.fn(),
    onLoading: vi.fn(),
  });
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Shared Live Room state refresh", () => {
  it("propagates foreground room state faster than the heavier frame carousel", async () => {
    vi.useFakeTimers();
    const api = {
      listRooms: vi.fn(async () => []),
      getRoom: vi.fn(async () => room),
      listVisualFrames: vi.fn(async () => []),
      updatePresence: vi.fn(async () => room),
    } as unknown as HelixSharedLiveRoomApi;

    render(<Harness api={api} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);
    expect(api.listVisualFrames).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(2);
    expect(api.listVisualFrames).toHaveBeenCalledTimes(1);
  });

  it("never overlaps room refreshes while an earlier request remains pending", async () => {
    vi.useFakeTimers();
    let resolveRoom: ((value: HelixSharedRealtimeRoom) => void) | null = null;
    const api = {
      listRooms: vi.fn(async () => []),
      getRoom: vi.fn(() => new Promise<HelixSharedRealtimeRoom>((resolve) => {
        resolveRoom = resolve;
      })),
      listVisualFrames: vi.fn(async () => []),
      updatePresence: vi.fn(async () => room),
    } as unknown as HelixSharedLiveRoomApi;

    render(<Harness api={api} />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRoom?.(room);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(2);
  });

  it("backs off room refreshes after a failure and recovers to the fast cadence", async () => {
    vi.useFakeTimers();
    const api = {
      listRooms: vi.fn(async () => []),
      getRoom: vi.fn()
        .mockRejectedValueOnce(new Error("temporarily unavailable"))
        .mockResolvedValue(room),
      listVisualFrames: vi.fn(async () => []),
      updatePresence: vi.fn(async () => room),
    } as unknown as HelixSharedLiveRoomApi;

    render(<Harness api={api} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_999);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(3);
  });

  it("uses a bounded background cadence when the room dialog is closed", async () => {
    vi.useFakeTimers();
    const api = {
      listRooms: vi.fn(async () => []),
      getRoom: vi.fn(async () => room),
      listVisualFrames: vi.fn(async () => []),
      updatePresence: vi.fn(async () => room),
    } as unknown as HelixSharedLiveRoomApi;

    render(<Harness api={api} foreground={false} />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getRoom).toHaveBeenCalledTimes(2);
    expect(api.listVisualFrames).toHaveBeenCalledTimes(1);
  });

  it("never overlaps presence heartbeats while an earlier update remains pending", async () => {
    vi.useFakeTimers();
    let resolvePresence: ((value: HelixSharedRealtimeRoom) => void) | null = null;
    const api = {
      listRooms: vi.fn(async () => []),
      getRoom: vi.fn(async () => room),
      listVisualFrames: vi.fn(async () => []),
      updatePresence: vi.fn(() => new Promise<HelixSharedRealtimeRoom>((resolve) => {
        resolvePresence = resolve;
      })),
    } as unknown as HelixSharedLiveRoomApi;

    render(<Harness api={api} />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.updatePresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePresence?.(room);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(api.updatePresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.updatePresence).toHaveBeenCalledTimes(2);
  });
});
