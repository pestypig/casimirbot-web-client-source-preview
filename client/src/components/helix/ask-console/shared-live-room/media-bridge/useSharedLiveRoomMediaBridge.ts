import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../SharedLiveRoomApi";
import {
  createSharedLiveRoomMediaBridge,
  type SharedLiveRoomMediaBridge,
} from "./RoomMediaBridge";
import {
  INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
  type SharedLiveRoomMediaBridgeProjection,
  type SharedLiveRoomProviderAttachmentMode,
} from "./RoomMediaBridgeContracts";

export const useSharedLiveRoomMediaBridge = (input: {
  room: HelixSharedRealtimeRoom | null;
  self: HelixSharedRealtimeRoomParticipant | null;
  realtimeSessionId: string | null;
  providerAttachmentMode?: SharedLiveRoomProviderAttachmentMode;
  api: HelixSharedLiveRoomApi;
}): {
  projection: SharedLiveRoomMediaBridgeProjection;
  start(): Promise<void>;
  stop(): Promise<void>;
  resumePlayback(): Promise<boolean>;
} => {
  const bridgeRef = useRef<SharedLiveRoomMediaBridge | null>(null);
  const bridgeIdentityRef = useRef<string | null>(null);
  const projectionGenerationRef = useRef(0);
  const closePromiseRef = useRef<Promise<void> | null>(null);
  const [projection, setProjection] = useState<SharedLiveRoomMediaBridgeProjection>(
    INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
  );
  const bridgeIdentity = input.room && input.self
    ? [
        input.room.room_id,
        input.self.participant_id,
        input.realtimeSessionId ?? "participant:no-provider-session",
        input.providerAttachmentMode ?? "required",
      ].join("|")
    : null;
  const beginClose = useCallback((
    bridge: SharedLiveRoomMediaBridge,
  ): Promise<void> => {
    const closePromise = bridge.close();
    closePromiseRef.current = closePromise;
    void closePromise.then(
      () => {
        if (closePromiseRef.current === closePromise) closePromiseRef.current = null;
      },
      () => {
        if (closePromiseRef.current === closePromise) closePromiseRef.current = null;
      },
    );
    return closePromise;
  }, []);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (bridge && input.room && bridgeIdentityRef.current === bridgeIdentity) {
      bridge.syncRoom(input.room);
      return;
    }
    if (bridgeIdentityRef.current !== bridgeIdentity) {
      projectionGenerationRef.current += 1;
      setProjection(INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION);
    }
    if (!bridge) return;
    bridgeRef.current = null;
    bridgeIdentityRef.current = null;
    void beginClose(bridge);
  }, [beginClose, bridgeIdentity, input.room]);

  useEffect(() => () => {
    projectionGenerationRef.current += 1;
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    bridgeIdentityRef.current = null;
    if (bridge) {
      void beginClose(bridge);
    }
  }, [beginClose]);

  const start = useCallback(async (): Promise<void> => {
    if (!input.room || !input.self || !bridgeIdentity) return;
    const generation = ++projectionGenerationRef.current;
    setProjection(INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION);
    await closePromiseRef.current?.catch(() => undefined);
    if (bridgeRef.current) {
      const closePromise = beginClose(bridgeRef.current);
      await closePromise.catch(() => undefined);
      bridgeRef.current = null;
      bridgeIdentityRef.current = null;
    }
    if (generation !== projectionGenerationRef.current) return;
    const bridge = createSharedLiveRoomMediaBridge({
      room: input.room,
      self: input.self,
      realtimeSessionId: input.realtimeSessionId,
      providerAttachmentMode: input.providerAttachmentMode,
      api: input.api,
      onProjection: (next) => {
        if (generation === projectionGenerationRef.current) setProjection(next);
      },
    });
    bridgeRef.current = bridge;
    bridgeIdentityRef.current = bridgeIdentity;
    await bridge.start();
  }, [
    beginClose,
    bridgeIdentity,
    input.api,
    input.realtimeSessionId,
    input.providerAttachmentMode,
    input.room,
    input.self,
  ]);

  const stop = useCallback(async (): Promise<void> => {
    projectionGenerationRef.current += 1;
    setProjection(INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION);
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    bridgeIdentityRef.current = null;
    if (!bridge) {
      await closePromiseRef.current?.catch(() => undefined);
      return;
    }
    const closePromise = beginClose(bridge);
    await closePromise.catch(() => undefined);
  }, [beginClose]);

  const resumePlayback = useCallback(
    (): Promise<boolean> =>
      bridgeRef.current?.resumePlayback() ?? Promise.resolve(false),
    [],
  );

  return { projection, start, stop, resumePlayback };
};
