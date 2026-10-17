import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomVisualFrame,
} from "@shared/helix-shared-realtime-room";
import type { SharedLiveRoomMediaBridgeProjection } from
  "./media-bridge/RoomMediaBridgeContracts";

const FRESH_VISUAL_EVIDENCE_MS = 30_000;

export type SharedLiveRoomAcceptanceProjection = {
  schema: "helix.shared_realtime_room.acceptance_projection.v1";
  participants_present: boolean;
  single_shared_model_bound: boolean;
  fresh_provider_acknowledged_participant_ids: string[];
  both_participants_visual_provider_acknowledged: boolean;
  media_bridge_active: boolean;
  peer_audio_transport_connected: boolean;
  remote_audio_playback_ready: boolean;
  mixed_provider_input_ready: boolean;
  provider_input_enabled: boolean;
  provider_audio_transport_forwarded: boolean;
  automated_transport_evidence_ready: boolean;
  manual_checks_required: [
    "comparative_screen_question",
    "both_human_audio_directions",
    "gpt_audio_in_both_browsers",
    "gpt_and_floor_attributed_transcripts",
    "consent_revoke_and_microphone_restore",
  ];
  evidence_scope: "current_room_projection_only";
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export const buildSharedLiveRoomAcceptanceProjection = (input: {
  room: HelixSharedRealtimeRoom | null;
  frames: readonly HelixSharedRealtimeRoomVisualFrame[];
  mediaBridge: SharedLiveRoomMediaBridgeProjection;
  nowMs?: number;
}): SharedLiveRoomAcceptanceProjection => {
  const nowMs = input.nowMs ?? Date.now();
  const presentParticipantIds = new Set(
    input.room?.participants
      .filter((participant) => participant.presence === "present")
      .map((participant) => participant.participant_id) ?? [],
  );
  const acknowledgedParticipantIds = Array.from(new Set(
    input.frames
      .filter((frame) =>
        frame.provider_delivery === "sent_to_shared_model" &&
        presentParticipantIds.has(frame.participant_id) &&
        Number.isFinite(Date.parse(frame.captured_at)) &&
        Date.parse(frame.captured_at) >= nowMs - FRESH_VISUAL_EVIDENCE_MS)
      .map((frame) => frame.participant_id),
  )).sort();
  const participantsPresent = presentParticipantIds.size === 2;
  const singleSharedModelBound = Boolean(
    input.room?.runtime.topology === "single_shared_model" &&
    input.room.runtime.realtime_session_ref_hash &&
    (
      input.room.runtime.state === "host_transport_active" ||
      input.room.runtime.state === "bridge_active"
    ),
  );
  const bothVisualsAcknowledged =
    participantsPresent &&
    acknowledgedParticipantIds.length === 2;
  const mediaBridgeActive = Boolean(
    input.room?.runtime.state === "bridge_active" &&
    input.room.runtime.transport_owner === "room_media_bridge" &&
    input.mediaBridge.state === "active",
  );
  const mixedProviderInputReady =
    mediaBridgeActive &&
    input.mediaBridge.provider_input_mixed;
  const providerAudioForwarded =
    mediaBridgeActive &&
    input.mediaBridge.provider_audio_forwarded;
  const peerAudioConnected =
    mediaBridgeActive &&
    input.mediaBridge.peer_audio_connected;

  return {
    schema: "helix.shared_realtime_room.acceptance_projection.v1",
    participants_present: participantsPresent,
    single_shared_model_bound: singleSharedModelBound,
    fresh_provider_acknowledged_participant_ids: acknowledgedParticipantIds,
    both_participants_visual_provider_acknowledged: bothVisualsAcknowledged,
    media_bridge_active: mediaBridgeActive,
    peer_audio_transport_connected: peerAudioConnected,
    remote_audio_playback_ready:
      peerAudioConnected &&
      input.mediaBridge.remote_audio_playback_ready,
    mixed_provider_input_ready: mixedProviderInputReady,
    provider_input_enabled:
      mixedProviderInputReady &&
      input.mediaBridge.provider_input_enabled,
    provider_audio_transport_forwarded: providerAudioForwarded,
    automated_transport_evidence_ready: Boolean(
      singleSharedModelBound &&
      bothVisualsAcknowledged &&
      mediaBridgeActive &&
      peerAudioConnected &&
      input.mediaBridge.remote_audio_playback_ready &&
      mixedProviderInputReady &&
      input.mediaBridge.provider_input_enabled &&
      providerAudioForwarded
    ),
    manual_checks_required: [
      "comparative_screen_question",
      "both_human_audio_directions",
      "gpt_audio_in_both_browsers",
      "gpt_and_floor_attributed_transcripts",
      "consent_revoke_and_microphone_restore",
    ],
    evidence_scope: "current_room_projection_only",
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};
