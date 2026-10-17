import { useEffect } from "react";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomVisualFrame,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "./SharedLiveRoomApi";

const ROOM_FOREGROUND_REFRESH_INTERVAL_MS = 3_000;
const ROOM_BACKGROUND_REFRESH_INTERVAL_MS = 15_000;
const FRAME_FOREGROUND_REFRESH_INTERVAL_MS = 5_000;
const FRAME_BACKGROUND_REFRESH_INTERVAL_MS = 30_000;
const ROOM_PRESENCE_INTERVAL_MS = 15_000;
const ROOM_REFRESH_MAX_BACKOFF_MS = 12_000;
const FRAME_REFRESH_MAX_BACKOFF_MS = 30_000;
const ROOM_PRESENCE_MAX_BACKOFF_MS = 60_000;

const nextBackoffMs = (currentMs: number, maximumMs: number): number =>
  Math.min(maximumMs, Math.max(1, currentMs * 2));

export const sortHelixSharedLiveRooms = (
  rooms: readonly HelixSharedRealtimeRoom[],
): HelixSharedRealtimeRoom[] => [...rooms]
  .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));

export function useSharedLiveRoomSync(input: {
  api: HelixSharedLiveRoomApi;
  activeRoomId: string | null;
  foreground: boolean;
  onInitialRooms(rooms: HelixSharedRealtimeRoom[]): void;
  onRoom(room: HelixSharedRealtimeRoom): void;
  onFrames(frames: HelixSharedRealtimeRoomVisualFrame[]): void;
  onClearRoomArtifacts(): void;
  onError(error: unknown): void;
  onLoading(loading: boolean): void;
}): void {
  useEffect(() => {
    let disposed = false;
    input.onLoading(true);
    void input.api.listRooms()
      .then((rooms) => {
        if (!disposed) input.onInitialRooms(sortHelixSharedLiveRooms(rooms));
      })
      .catch((error) => {
        if (!disposed) input.onError(error);
      })
      .finally(() => {
        if (!disposed) input.onLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [input.api, input.onError, input.onInitialRooms, input.onLoading]);

  useEffect(() => {
    if (!input.activeRoomId) {
      input.onClearRoomArtifacts();
      return;
    }
    let disposed = false;
    let roomTimer: number | null = null;
    let frameTimer: number | null = null;
    const roomBaseDelayMs = input.foreground
      ? ROOM_FOREGROUND_REFRESH_INTERVAL_MS
      : ROOM_BACKGROUND_REFRESH_INTERVAL_MS;
    const frameBaseDelayMs = input.foreground
      ? FRAME_FOREGROUND_REFRESH_INTERVAL_MS
      : FRAME_BACKGROUND_REFRESH_INTERVAL_MS;
    let roomDelayMs = roomBaseDelayMs;
    let frameDelayMs = frameBaseDelayMs;

    const scheduleRoomRefresh = (delayMs: number): void => {
      if (disposed) return;
      roomTimer = window.setTimeout(() => {
        roomTimer = null;
        void refreshRoom();
      }, delayMs);
    };
    const scheduleFrameRefresh = (delayMs: number): void => {
      if (disposed) return;
      frameTimer = window.setTimeout(() => {
        frameTimer = null;
        void refreshFrames();
      }, delayMs);
    };
    const refreshRoom = async (): Promise<void> => {
      try {
        const room = await input.api.getRoom(input.activeRoomId as string);
        if (disposed) return;
        roomDelayMs = roomBaseDelayMs;
        input.onRoom(room);
      } catch (error) {
        if (disposed) return;
        input.onError(error);
        roomDelayMs = nextBackoffMs(roomDelayMs, ROOM_REFRESH_MAX_BACKOFF_MS);
      } finally {
        if (!disposed) scheduleRoomRefresh(roomDelayMs);
      }
    };
    const refreshFrames = async (): Promise<void> => {
      try {
        const frames = await input.api.listVisualFrames(input.activeRoomId as string);
        if (disposed) return;
        frameDelayMs = frameBaseDelayMs;
        input.onFrames(frames);
      } catch (error) {
        if (disposed) return;
        input.onError(error);
        frameDelayMs = nextBackoffMs(frameDelayMs, FRAME_REFRESH_MAX_BACKOFF_MS);
      } finally {
        if (!disposed) scheduleFrameRefresh(frameDelayMs);
      }
    };

    void refreshRoom();
    void refreshFrames();
    return () => {
      disposed = true;
      if (roomTimer !== null) window.clearTimeout(roomTimer);
      if (frameTimer !== null) window.clearTimeout(frameTimer);
    };
  }, [
    input.activeRoomId,
    input.api,
    input.foreground,
    input.onClearRoomArtifacts,
    input.onError,
    input.onFrames,
    input.onRoom,
  ]);

  useEffect(() => {
    if (!input.activeRoomId) return;
    let disposed = false;
    let heartbeatTimer: number | null = null;
    let heartbeatDelayMs = ROOM_PRESENCE_INTERVAL_MS;
    const schedulePresentHeartbeat = (delayMs: number): void => {
      if (disposed) return;
      heartbeatTimer = window.setTimeout(() => {
        heartbeatTimer = null;
        void sendPresentHeartbeat();
      }, delayMs);
    };
    const sendPresentHeartbeat = async (): Promise<void> => {
      try {
        const room = await input.api.updatePresence(
          input.activeRoomId as string,
          "present",
        );
        if (disposed) return;
        heartbeatDelayMs = ROOM_PRESENCE_INTERVAL_MS;
        input.onRoom(room);
      } catch {
        if (disposed) return;
        heartbeatDelayMs = nextBackoffMs(
          heartbeatDelayMs,
          ROOM_PRESENCE_MAX_BACKOFF_MS,
        );
      } finally {
        if (!disposed) schedulePresentHeartbeat(heartbeatDelayMs);
      }
    };
    const sendAwayOnPageExit = (): void => {
      void input.api.updatePresence(input.activeRoomId as string, "away", { keepalive: true })
        .catch(() => undefined);
    };
    // Visibility is intentionally not presence: a host may switch tabs while
    // sharing a screen. The heartbeat proves connectivity; page exit or TTL
    // expiry transitions the member away.
    void sendPresentHeartbeat();
    window.addEventListener("pagehide", sendAwayOnPageExit);
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", sendAwayOnPageExit);
      if (heartbeatTimer !== null) window.clearTimeout(heartbeatTimer);
    };
  }, [input.activeRoomId, input.api, input.onRoom]);
}
