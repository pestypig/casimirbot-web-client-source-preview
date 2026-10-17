export type SharedLiveRoomPeerConnectionRecovery = {
  observe(state: RTCPeerConnectionState): void;
  close(): void;
};

export const createSharedLiveRoomPeerConnectionRecovery = (input: {
  disconnectGraceMs?: number;
  onTerminalFailure(): void;
}): SharedLiveRoomPeerConnectionRecovery => {
  const disconnectGraceMs = Math.max(
    0,
    Math.trunc(input.disconnectGraceMs ?? 5_000),
  );
  let disconnectTimer: number | null = null;
  let closed = false;

  const clearDisconnectTimer = (): void => {
    if (disconnectTimer !== null) window.clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };

  return {
    observe(state) {
      if (closed) return;
      if (state === "connected") {
        clearDisconnectTimer();
        return;
      }
      if (state === "failed") {
        clearDisconnectTimer();
        input.onTerminalFailure();
        return;
      }
      if (state === "disconnected" && disconnectTimer === null) {
        disconnectTimer = window.setTimeout(() => {
          disconnectTimer = null;
          if (!closed) input.onTerminalFailure();
        }, disconnectGraceMs);
      }
    },
    close() {
      closed = true;
      clearDisconnectTimer();
    },
  };
};
