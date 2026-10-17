/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSharedLiveRoomPeerConnectionRecovery } from
  "../RoomPeerConnectionRecovery";

afterEach(() => {
  vi.useRealTimers();
});

describe("Shared Live Room peer connection recovery", () => {
  it("allows transient disconnect recovery without teardown", () => {
    vi.useFakeTimers();
    const onTerminalFailure = vi.fn();
    const recovery = createSharedLiveRoomPeerConnectionRecovery({
      disconnectGraceMs: 5_000,
      onTerminalFailure,
    });

    recovery.observe("disconnected");
    vi.advanceTimersByTime(4_000);
    recovery.observe("connected");
    vi.advanceTimersByTime(2_000);

    expect(onTerminalFailure).not.toHaveBeenCalled();
  });

  it("tears down failed or persistently disconnected peers exactly once", () => {
    vi.useFakeTimers();
    const onTerminalFailure = vi.fn();
    const recovery = createSharedLiveRoomPeerConnectionRecovery({
      disconnectGraceMs: 5_000,
      onTerminalFailure,
    });

    recovery.observe("disconnected");
    vi.advanceTimersByTime(5_000);
    expect(onTerminalFailure).toHaveBeenCalledOnce();
    recovery.close();

    const failed = createSharedLiveRoomPeerConnectionRecovery({
      onTerminalFailure,
    });
    failed.observe("failed");
    expect(onTerminalFailure).toHaveBeenCalledTimes(2);
    failed.close();
  });
});
