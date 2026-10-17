export type SharedLiveRoomMediaBridgeRole = "owner" | "participant";
export type SharedLiveRoomProviderAttachmentMode = "required" | "detached";

export type SharedLiveRoomMediaBridgeState =
  | "idle"
  | "waiting_for_peer"
  | "negotiating"
  | "active"
  | "degraded"
  | "closed"
  | "error";

export type SharedLiveRoomMediaBridgeFailure =
  | "live_media_boundary_unavailable"
  | "microphone_consent_required"
  | "model_audio_consent_required"
  | "owner_microphone_unavailable"
  | "participant_microphone_unavailable"
  | "provider_audio_unavailable"
  | "audio_context_suspended"
  | "remote_audio_playback_blocked"
  | "peer_connection_failed"
  | "signaling_failed"
  | "provider_input_replace_failed";

export type SharedLiveRoomMediaBridgeProjection = {
  state: SharedLiveRoomMediaBridgeState;
  role: SharedLiveRoomMediaBridgeRole;
  provider_attachment_mode: SharedLiveRoomProviderAttachmentMode;
  peer_audio_connected: boolean;
  remote_audio_playback_ready: boolean;
  provider_input_mixed: boolean;
  provider_input_enabled: boolean;
  provider_audio_forwarded: boolean;
  active_model_speaker_participant_id: string | null;
  latest_shared_transcript: SharedLiveRoomTranscriptProjection | null;
  recent_shared_transcripts?: SharedLiveRoomTranscriptProjection[];
  ice_configuration: "default_stun" | "configured";
  ice_configuration_error: "ice_configuration_invalid" | null;
  failure: SharedLiveRoomMediaBridgeFailure | null;
};

export type SharedLiveRoomTranscriptProjection = {
  speaker_kind: "gpt" | "participant";
  speaker_label: string;
  transcript: string;
  observed_at_ms: number;
};

export const INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION:
SharedLiveRoomMediaBridgeProjection = {
  state: "idle",
  role: "participant",
  provider_attachment_mode: "required",
  peer_audio_connected: false,
  remote_audio_playback_ready: false,
  provider_input_mixed: false,
  provider_input_enabled: false,
  provider_audio_forwarded: false,
  active_model_speaker_participant_id: null,
  latest_shared_transcript: null,
  recent_shared_transcripts: [],
  ice_configuration: "default_stun",
  ice_configuration_error: null,
  failure: null,
};
