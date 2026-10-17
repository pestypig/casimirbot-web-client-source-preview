import type {
  HelixSharedRealtimeRoomRole,
  HelixSharedRealtimeRoomRuntimeState,
  HelixSharedRealtimeRoomTransportOwner,
} from "@shared/helix-shared-realtime-room";

export const shouldRenewSharedLiveRoomFloor = (input: {
  activeRoomId: string | null;
  runtimeState: HelixSharedRealtimeRoomRuntimeState | null;
  transportOwner: HelixSharedRealtimeRoomTransportOwner | null;
  activeSpeakerParticipantId: string | null;
  selfParticipantId: string | null;
  selfRole: HelixSharedRealtimeRoomRole | null;
  peerAudioConnected: boolean;
}): boolean => {
  if (
    !input.activeRoomId ||
    !input.selfParticipantId ||
    input.activeSpeakerParticipantId !== input.selfParticipantId
  ) {
    return false;
  }
  if (
    input.runtimeState === "host_transport_active" &&
    input.transportOwner === "host_browser"
  ) {
    return input.selfRole === "owner";
  }
  return (
    input.runtimeState === "bridge_active" &&
    input.transportOwner === "room_media_bridge" &&
    input.peerAudioConnected
  );
};
