import type {
  HelixLiveRuntimeAgentAuthority,
  HelixLiveRuntimeAgentMode,
} from "@shared/helix-live-runtime-agent";
import type {
  HelixRealtimeStagePlayAskHandoffV1,
  HelixRealtimeStagePlayContextSyncV1,
  HelixRealtimeStagePlayDebugV1,
  HelixRealtimeStagePlayGroundedAnswerV1,
} from "@shared/contracts/helix-realtime-stage-play.v1";
import type { HelixAskLiveRuntimeVisualFrameReceipt } from "./HelixAskLiveRuntimeTransportController";
import {
  HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA,
  type HelixAskRealtimeCompletedOutputTranscript,
} from "./HelixAskRealtimeOutputTranscriptDebug";
import type {
  HelixAskRealtimeVisualFrameRouteKind,
  HelixAskRealtimeVisualFrameProviderAcknowledgement,
} from "./HelixAskRealtimeVisualFrameAcknowledgement";
import {
  buildHelixAskLiveVisionProof,
  type HelixAskLiveVisionProof,
} from "./HelixAskLiveVisionProof";

const MAX_EVENTS = 80;
const MAX_COMPLETED_OUTPUT_TRANSCRIPTS = 16;

export type HelixAskLiveRuntimeClientDebugEvent = {
  event_kind:
    | "session_start_requested"
    | "server_session_admitted"
    | "transport_active"
    | "transport_failed"
    | "microphone_tracks_observed"
    | "microphone_enabled"
    | "microphone_disabled"
    | "visual_input_enabled"
    | "visual_input_disabled"
    | "visual_frame_sent"
    | "visual_frame_blocked"
    | "visual_frame_error"
    | "visual_frame_provider_acknowledged"
    | "visual_frame_provider_error"
    | "data_channel_opened"
    | "data_channel_closed"
    | "data_channel_error"
    | "initial_audio_probe_requested"
    | "initial_audio_probe_failed"
    | "managed_voice_reply_requested"
    | "managed_voice_reply_blocked"
    | "audio_state_changed"
    | "provider_event_received"
    | "provider_output_transcript_completed"
    | "remote_audio_track_attached"
    | "remote_audio_playback_started"
    | "remote_audio_playback_failed"
    | "server_stage_play_handoff_received"
    | "server_stage_play_debug_refreshed"
    | "session_stop_requested"
    | "session_stopped";
  observed_at_ms: number;
  detail_code: string | null;
  provider_event_type: string | null;
  remote_track_source: "stream" | "track_fallback" | null;
  remote_audio_muted: boolean | null;
  audio_focus_granted: boolean | null;
  microphone_track_count: number | null;
  microphone_live_track_count: number | null;
  microphone_enabled_track_count: number | null;
  microphone_muted_track_count: number | null;
  microphone_device_label: string | null;
  microphone_loopback_source: boolean | null;
  handoff_id?: string | null;
  transcript_observation_ref?: string | null;
  stage_play_event_ref?: string | null;
  context_pack_id?: string | null;
  context_hash?: string | null;
  context_sync_status?: string | null;
  provider_response_ref?: string | null;
  transcript_text_hash?: string | null;
  transcript_text_char_count?: number | null;
  visual_frame_item_id?: string | null;
  visual_frame_client_event_id?: string | null;
  provider_event_ref?: string | null;
};

export type HelixAskLiveRuntimeClientDebugSnapshot = {
  schema: "helix.ask.live_runtime.client_debug.v1";
  attempt_ref: string;
  realtime_session_id: string | null;
  runtime_agent_mode: HelixLiveRuntimeAgentMode;
  runtime_agent_authority: HelixLiveRuntimeAgentAuthority;
  selected_model_or_service: string | null;
  browser_output_path: "webrtc_remote_media_element";
  voice_lane_required: false;
  microphone_track_count: number;
  microphone_live_track_count: number;
  microphone_enabled_track_count: number;
  microphone_muted_track_count: number;
  microphone_device_label: string | null;
  microphone_loopback_source: boolean;
  microphone_input_enabled: boolean;
  visual_input_enabled: boolean;
  visual_frame_attempt_count: number;
  visual_frame_sent_count: number;
  visual_frame_provider_acknowledged_count: number;
  visual_frame_provider_image_confirmed_count: number;
  visual_frame_automatic_sent_count: number;
  visual_frame_manual_sent_count: number;
  visual_frame_automatic_provider_acknowledged_count: number;
  visual_frame_manual_provider_acknowledged_count: number;
  visual_frame_automatic_provider_image_confirmed_count: number;
  visual_frame_manual_provider_image_confirmed_count: number;
  visual_frame_blocked_count: number;
  visual_frame_error_count: number;
  latest_visual_frame_receipt: Omit<HelixAskLiveRuntimeVisualFrameReceipt, "raw_content_included"> & {
    raw_content_included: false;
  } | null;
  latest_visual_frame_provider_acknowledgement:
    HelixAskRealtimeVisualFrameProviderAcknowledgement | null;
  visual_input_proof: HelixAskLiveVisionProof;
  data_channel_state: "not_created" | "connecting" | "open" | "closed" | "error";
  initial_audio_probe_requested: boolean;
  initial_audio_probe_error: string | null;
  provider_audio_event_observed: boolean;
  remote_audio_track_received: boolean;
  remote_track_source: "stream" | "track_fallback" | null;
  browser_playback_status: "not_attempted" | "started_unmuted" | "started_muted" | "failed";
  browser_playback_error: string | null;
  remote_audio_muted: boolean | null;
  audio_focus_granted: boolean | null;
  speaker_trigger_evidence:
    | "not_observed"
    | "browser_play_ready_waiting_for_provider_audio"
    | "browser_play_resolved_muted"
    | "browser_play_rejected"
    | "provider_audio_and_browser_play_unmuted";
  hardware_audio_output_confirmed: false;
  completed_output_transcript_count: number;
  completed_output_transcripts: HelixAskRealtimeCompletedOutputTranscript[];
  latest_completed_output_transcript: HelixAskRealtimeCompletedOutputTranscript | null;
  lifecycle_state: string;
  transport_state: string;
  started_at_ms: number;
  updated_at_ms: number;
  events: HelixAskLiveRuntimeClientDebugEvent[];
  latest_stage_play_handoff: {
    handoff_id: string;
    transcript_observation_ref: string;
    stage_play_event_ref: string;
    context_pack_id: string;
    context_hash: string;
    context_sync_status: HelixRealtimeStagePlayContextSyncV1["status"] | null;
  } | null;
  server_stage_play_provenance: HelixRealtimeStagePlayDebugV1 | null;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

let snapshot: HelixAskLiveRuntimeClientDebugSnapshot | null = null;

const safeCode = (value: unknown): string | null =>
  typeof value === "string" && /^[a-z0-9._:-]{1,180}$/i.test(value.trim())
    ? value.trim()
    : null;

const safeLabel = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;

const isProviderOutputAudioEvent = (eventType: string | null): boolean =>
  eventType !== null && (
    /^response\.(?:output_audio|audio)\.(?:delta|done)$/.test(eventType) ||
    /^output_audio_buffer\.(?:started|stopped)$/.test(eventType)
  );

const resolveSpeakerTriggerEvidence = (
  current: HelixAskLiveRuntimeClientDebugSnapshot,
): HelixAskLiveRuntimeClientDebugSnapshot["speaker_trigger_evidence"] => {
  if (current.browser_playback_status === "failed") return "browser_play_rejected";
  if (current.browser_playback_status === "started_muted") return "browser_play_resolved_muted";
  if (current.browser_playback_status !== "started_unmuted") return "not_observed";
  return current.provider_audio_event_observed
    ? "provider_audio_and_browser_play_unmuted"
    : "browser_play_ready_waiting_for_provider_audio";
};

export const beginHelixAskLiveRuntimeClientDebugAttempt = (input: {
  attemptRef: string;
  runtimeAgentMode: HelixLiveRuntimeAgentMode;
  runtimeAgentAuthority: HelixLiveRuntimeAgentAuthority;
  observedAtMs?: number;
}): void => {
  const observedAtMs = input.observedAtMs ?? Date.now();
  snapshot = {
    schema: "helix.ask.live_runtime.client_debug.v1",
    attempt_ref: input.attemptRef,
    realtime_session_id: null,
    runtime_agent_mode: input.runtimeAgentMode,
    runtime_agent_authority: input.runtimeAgentAuthority,
    selected_model_or_service: null,
    browser_output_path: "webrtc_remote_media_element",
    voice_lane_required: false,
    microphone_track_count: 0,
    microphone_live_track_count: 0,
    microphone_enabled_track_count: 0,
    microphone_muted_track_count: 0,
    microphone_device_label: null,
    microphone_loopback_source: false,
    microphone_input_enabled: false,
    visual_input_enabled: false,
    visual_frame_attempt_count: 0,
    visual_frame_sent_count: 0,
    visual_frame_provider_acknowledged_count: 0,
    visual_frame_provider_image_confirmed_count: 0,
    visual_frame_automatic_sent_count: 0,
    visual_frame_manual_sent_count: 0,
    visual_frame_automatic_provider_acknowledged_count: 0,
    visual_frame_manual_provider_acknowledged_count: 0,
    visual_frame_automatic_provider_image_confirmed_count: 0,
    visual_frame_manual_provider_image_confirmed_count: 0,
    visual_frame_blocked_count: 0,
    visual_frame_error_count: 0,
    latest_visual_frame_receipt: null,
    latest_visual_frame_provider_acknowledgement: null,
    visual_input_proof: buildHelixAskLiveVisionProof({
      visual_frame_sent_count: 0,
      visual_frame_provider_acknowledged_count: 0,
      visual_frame_provider_image_confirmed_count: 0,
      visual_frame_automatic_sent_count: 0,
      visual_frame_manual_sent_count: 0,
      visual_frame_automatic_provider_acknowledged_count: 0,
      visual_frame_manual_provider_acknowledged_count: 0,
      visual_frame_automatic_provider_image_confirmed_count: 0,
      visual_frame_manual_provider_image_confirmed_count: 0,
      latest_visual_frame_provider_acknowledgement: null,
    }),
    data_channel_state: "not_created",
    initial_audio_probe_requested: false,
    initial_audio_probe_error: null,
    provider_audio_event_observed: false,
    remote_audio_track_received: false,
    remote_track_source: null,
    browser_playback_status: "not_attempted",
    browser_playback_error: null,
    remote_audio_muted: null,
    audio_focus_granted: null,
    speaker_trigger_evidence: "not_observed",
    hardware_audio_output_confirmed: false,
    completed_output_transcript_count: 0,
    completed_output_transcripts: [],
    latest_completed_output_transcript: null,
    lifecycle_state: "requesting",
    transport_state: "awaiting_server_session",
    started_at_ms: observedAtMs,
    updated_at_ms: observedAtMs,
    events: [{
      event_kind: "session_start_requested",
      observed_at_ms: observedAtMs,
      detail_code: null,
      provider_event_type: null,
      remote_track_source: null,
      remote_audio_muted: null,
      audio_focus_granted: null,
      microphone_track_count: null,
      microphone_live_track_count: null,
      microphone_enabled_track_count: null,
      microphone_muted_track_count: null,
      microphone_device_label: null,
      microphone_loopback_source: null,
    }],
    latest_stage_play_handoff: null,
    server_stage_play_provenance: null,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

export const recordHelixAskLiveRuntimeStagePlayHandoff = (input: {
  handoff: HelixRealtimeStagePlayAskHandoffV1;
  contextSync?: HelixRealtimeStagePlayContextSyncV1 | null;
  observedAtMs?: number;
}): void => {
  if (!snapshot) return;
  const observedAtMs = input.observedAtMs ?? Date.now();
  const event: HelixAskLiveRuntimeClientDebugEvent = {
    event_kind: "server_stage_play_handoff_received",
    observed_at_ms: observedAtMs,
    detail_code: "server_readonly_ask_handoff_received",
    provider_event_type: null,
    remote_track_source: null,
    remote_audio_muted: null,
    audio_focus_granted: null,
    microphone_track_count: null,
    microphone_live_track_count: null,
    microphone_enabled_track_count: null,
    microphone_muted_track_count: null,
    microphone_device_label: null,
    microphone_loopback_source: null,
    handoff_id: safeCode(input.handoff.handoff_id),
    transcript_observation_ref: safeCode(input.handoff.transcript_observation_ref),
    stage_play_event_ref: safeCode(input.handoff.stage_play_event_ref),
    context_pack_id: safeCode(input.handoff.context_pack_id),
    context_hash: safeCode(input.handoff.context_hash),
    context_sync_status: safeCode(input.contextSync?.status),
  };
  snapshot = {
    ...snapshot,
    latest_stage_play_handoff: {
      handoff_id: input.handoff.handoff_id,
      transcript_observation_ref: input.handoff.transcript_observation_ref,
      stage_play_event_ref: input.handoff.stage_play_event_ref,
      context_pack_id: input.handoff.context_pack_id,
      context_hash: input.handoff.context_hash,
      context_sync_status: input.contextSync?.status ?? null,
    },
    updated_at_ms: observedAtMs,
    events: [...snapshot.events, event].slice(-MAX_EVENTS),
  };
};

export const recordHelixAskLiveRuntimeServerStagePlayDebug = (value: unknown): void => {
  if (!snapshot || !value || typeof value !== "object" || Array.isArray(value)) return;
  const candidate = value as Partial<HelixRealtimeStagePlayDebugV1>;
  if (
    candidate.schema !== "helix.realtime_stage_play.debug.v1" ||
    candidate.realtime_session_id !== snapshot.realtime_session_id ||
    candidate.provider_call_id_included !== false ||
    candidate.provider_payload_included !== false ||
    candidate.raw_content_included !== false
  ) return;
  const observedAtMs = Date.now();
  const cloned = JSON.parse(JSON.stringify(candidate)) as HelixRealtimeStagePlayDebugV1;
  const event: HelixAskLiveRuntimeClientDebugEvent = {
    event_kind: "server_stage_play_debug_refreshed",
    observed_at_ms: observedAtMs,
    detail_code: "server_stage_play_provenance_refreshed",
    provider_event_type: null,
    remote_track_source: null,
    remote_audio_muted: null,
    audio_focus_granted: null,
    microphone_track_count: null,
    microphone_live_track_count: null,
    microphone_enabled_track_count: null,
    microphone_muted_track_count: null,
    microphone_device_label: null,
    microphone_loopback_source: null,
    handoff_id: safeCode(cloned.handoffs.at(-1)?.handoff_id),
    context_pack_id: safeCode(cloned.latest_context_sync?.context_pack_id),
    context_hash: safeCode(cloned.latest_context_sync?.context_hash),
    context_sync_status: safeCode(cloned.latest_context_sync?.status),
  };
  snapshot = {
    ...snapshot,
    server_stage_play_provenance: cloned,
    updated_at_ms: observedAtMs,
    events: [...snapshot.events, event].slice(-MAX_EVENTS),
  };
};

export const recordHelixAskLiveRuntimeClientDebugEvent = (input: {
  eventKind: HelixAskLiveRuntimeClientDebugEvent["event_kind"];
  observedAtMs?: number;
  realtimeSessionId?: string | null;
  selectedModelOrService?: string | null;
  lifecycleState?: string | null;
  transportState?: string | null;
  detailCode?: string | null;
  providerEventType?: string | null;
  remoteTrackSource?: "stream" | "track_fallback" | null;
  remoteAudioMuted?: boolean | null;
  audioFocusGranted?: boolean | null;
  microphoneTrackCount?: number | null;
  microphoneLiveTrackCount?: number | null;
  microphoneEnabledTrackCount?: number | null;
  microphoneMutedTrackCount?: number | null;
  microphoneDeviceLabel?: string | null;
  microphoneLoopbackSource?: boolean | null;
}): void => {
  if (!snapshot) return;
  const observedAtMs = input.observedAtMs ?? Date.now();
  const providerEventType = safeCode(input.providerEventType);
  const detailCode = safeCode(input.detailCode);
  const event: HelixAskLiveRuntimeClientDebugEvent = {
    event_kind: input.eventKind,
    observed_at_ms: observedAtMs,
    detail_code: detailCode,
    provider_event_type: providerEventType,
    remote_track_source: input.remoteTrackSource ?? null,
    remote_audio_muted: input.remoteAudioMuted ?? null,
    audio_focus_granted: input.audioFocusGranted ?? null,
    microphone_track_count: input.microphoneTrackCount ?? null,
    microphone_live_track_count: input.microphoneLiveTrackCount ?? null,
    microphone_enabled_track_count: input.microphoneEnabledTrackCount ?? null,
    microphone_muted_track_count: input.microphoneMutedTrackCount ?? null,
    microphone_device_label: safeLabel(input.microphoneDeviceLabel),
    microphone_loopback_source: input.microphoneLoopbackSource ?? null,
  };
  const next: HelixAskLiveRuntimeClientDebugSnapshot = {
    ...snapshot,
    realtime_session_id: input.realtimeSessionId ?? snapshot.realtime_session_id,
    selected_model_or_service:
      safeCode(input.selectedModelOrService) ?? snapshot.selected_model_or_service,
    microphone_track_count: input.microphoneTrackCount ?? snapshot.microphone_track_count,
    microphone_live_track_count:
      input.microphoneLiveTrackCount ?? snapshot.microphone_live_track_count,
    microphone_enabled_track_count:
      input.microphoneEnabledTrackCount ?? snapshot.microphone_enabled_track_count,
    microphone_muted_track_count:
      input.microphoneMutedTrackCount ?? snapshot.microphone_muted_track_count,
    microphone_device_label:
      safeLabel(input.microphoneDeviceLabel) ?? snapshot.microphone_device_label,
    microphone_loopback_source:
      input.microphoneLoopbackSource ?? snapshot.microphone_loopback_source,
    microphone_input_enabled:
      input.eventKind === "microphone_enabled"
        ? true
        : input.eventKind === "microphone_disabled"
          ? false
          : snapshot.microphone_input_enabled,
    visual_input_enabled:
      input.eventKind === "visual_input_enabled"
        ? true
        : input.eventKind === "visual_input_disabled"
          ? false
          : snapshot.visual_input_enabled,
    data_channel_state:
      input.eventKind === "data_channel_opened"
        ? "open"
        : input.eventKind === "data_channel_closed"
          ? "closed"
          : input.eventKind === "data_channel_error"
            ? "error"
            : input.eventKind === "server_session_admitted"
              ? "connecting"
              : snapshot.data_channel_state,
    initial_audio_probe_requested:
      snapshot.initial_audio_probe_requested || input.eventKind === "initial_audio_probe_requested",
    initial_audio_probe_error:
      input.eventKind === "initial_audio_probe_failed"
        ? detailCode ?? "initial_audio_probe_failed"
        : input.eventKind === "initial_audio_probe_requested"
          ? null
          : snapshot.initial_audio_probe_error,
    lifecycle_state: input.lifecycleState ?? snapshot.lifecycle_state,
    transport_state: input.transportState ?? snapshot.transport_state,
    provider_audio_event_observed:
      snapshot.provider_audio_event_observed || isProviderOutputAudioEvent(providerEventType),
    remote_audio_track_received:
      snapshot.remote_audio_track_received || input.eventKind === "remote_audio_track_attached",
    remote_track_source: input.remoteTrackSource ?? snapshot.remote_track_source,
    browser_playback_status:
      input.eventKind === "remote_audio_playback_failed"
        ? "failed"
        : input.eventKind === "remote_audio_playback_started"
          ? input.remoteAudioMuted === true
            ? "started_muted"
            : "started_unmuted"
          : snapshot.browser_playback_status,
    browser_playback_error:
      input.eventKind === "remote_audio_playback_failed"
        ? detailCode ?? "remote_audio_playback_failed"
        : input.eventKind === "remote_audio_playback_started"
          ? null
          : snapshot.browser_playback_error,
    remote_audio_muted: input.remoteAudioMuted ?? snapshot.remote_audio_muted,
    audio_focus_granted: input.audioFocusGranted ?? snapshot.audio_focus_granted,
    updated_at_ms: observedAtMs,
    events: [...snapshot.events, event].slice(-MAX_EVENTS),
  };
  next.speaker_trigger_evidence = resolveSpeakerTriggerEvidence(next);
  snapshot = next;
};

export const recordHelixAskLiveRuntimeCompletedOutputTranscript = (
  transcript: HelixAskRealtimeCompletedOutputTranscript,
): void => {
  if (
    !snapshot ||
    transcript.schema !== HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA ||
    transcript.capture_source !== "browser_data_channel" ||
    transcript.provider_payload_included !== false ||
    transcript.output_audio_transcript_deltas_included !== false ||
    transcript.answer_authority !== false ||
    transcript.assistant_answer !== false ||
    transcript.terminal_eligible !== false ||
    transcript.raw_content_included !== false
  ) return;
  const identity = [
    transcript.provider_response_ref ?? "response:unknown",
    transcript.provider_item_ref ?? "item:unknown",
    transcript.provider_content_index ?? "content:unknown",
    transcript.completed_event_ref,
  ].join("|");
  const existing = snapshot.completed_output_transcripts.filter(
    (candidate: HelixAskRealtimeCompletedOutputTranscript) => [
      candidate.provider_response_ref ?? "response:unknown",
      candidate.provider_item_ref ?? "item:unknown",
      candidate.provider_content_index ?? "content:unknown",
      candidate.completed_event_ref,
    ].join("|") !== identity,
  );
  const completedOutputTranscripts = [...existing, { ...transcript }]
    .slice(-MAX_COMPLETED_OUTPUT_TRANSCRIPTS);
  const event: HelixAskLiveRuntimeClientDebugEvent = {
    event_kind: "provider_output_transcript_completed",
    observed_at_ms: transcript.observed_at_ms,
    detail_code: transcript.capture_status,
    provider_event_type: transcript.provider_event_type,
    remote_track_source: null,
    remote_audio_muted: null,
    audio_focus_granted: null,
    microphone_track_count: null,
    microphone_live_track_count: null,
    microphone_enabled_track_count: null,
    microphone_muted_track_count: null,
    microphone_device_label: null,
    microphone_loopback_source: null,
    provider_response_ref: transcript.provider_response_ref,
    transcript_text_hash: transcript.transcript_text_hash,
    transcript_text_char_count: transcript.transcript_text_char_count,
  };
  snapshot = {
    ...snapshot,
    completed_output_transcript_count: completedOutputTranscripts.length,
    completed_output_transcripts: completedOutputTranscripts,
    latest_completed_output_transcript: { ...transcript },
    updated_at_ms: transcript.observed_at_ms,
    events: [...snapshot.events, event].slice(-MAX_EVENTS),
  };
};

export const recordHelixAskLiveRuntimeVisualFrameReceipt = (
  receipt: HelixAskLiveRuntimeVisualFrameReceipt,
  routeKind: HelixAskRealtimeVisualFrameRouteKind = "unspecified",
): void => {
  if (!snapshot) return;
  recordHelixAskLiveRuntimeClientDebugEvent({
    eventKind: receipt.ok
      ? "visual_frame_sent"
      : receipt.status === "blocked"
        ? "visual_frame_blocked"
        : "visual_frame_error",
    observedAtMs: receipt.observed_at_ms,
    detailCode: receipt.code,
  });
  if (!snapshot) return;
  snapshot = {
    ...snapshot,
    visual_frame_attempt_count: snapshot.visual_frame_attempt_count + 1,
    visual_frame_sent_count: snapshot.visual_frame_sent_count + (receipt.ok ? 1 : 0),
    visual_frame_automatic_sent_count:
      snapshot.visual_frame_automatic_sent_count +
      (receipt.ok && routeKind === "automatic_capture" ? 1 : 0),
    visual_frame_manual_sent_count:
      snapshot.visual_frame_manual_sent_count +
      (receipt.ok && routeKind === "manual_promotion" ? 1 : 0),
    visual_frame_blocked_count: snapshot.visual_frame_blocked_count + (receipt.status === "blocked" ? 1 : 0),
    visual_frame_error_count: snapshot.visual_frame_error_count + (receipt.status === "error" ? 1 : 0),
    latest_visual_frame_receipt: {
      ...receipt,
      raw_content_included: false,
    },
    updated_at_ms: receipt.observed_at_ms,
  };
};

export const recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement = (
  acknowledgement: HelixAskRealtimeVisualFrameProviderAcknowledgement,
): void => {
  if (!snapshot) return;
  const event: HelixAskLiveRuntimeClientDebugEvent = {
    event_kind: acknowledgement.status === "provider_error"
      ? "visual_frame_provider_error"
      : "visual_frame_provider_acknowledged",
    observed_at_ms: acknowledgement.observed_at_ms,
    detail_code: acknowledgement.provider_error_code ?? acknowledgement.status,
    provider_event_type: acknowledgement.provider_event_type,
    remote_track_source: null,
    remote_audio_muted: null,
    audio_focus_granted: null,
    microphone_track_count: null,
    microphone_live_track_count: null,
    microphone_enabled_track_count: null,
    microphone_muted_track_count: null,
    microphone_device_label: null,
    microphone_loopback_source: null,
    visual_frame_item_id: safeCode(acknowledgement.item_id),
    visual_frame_client_event_id: safeCode(acknowledgement.client_event_id),
    provider_event_ref: safeCode(acknowledgement.provider_event_id),
  };
  snapshot = {
    ...snapshot,
    visual_frame_provider_acknowledged_count:
      snapshot.visual_frame_provider_acknowledged_count +
      (acknowledgement.first_provider_acknowledgement ? 1 : 0),
    visual_frame_automatic_provider_acknowledged_count:
      snapshot.visual_frame_automatic_provider_acknowledged_count +
      (acknowledgement.first_provider_acknowledgement &&
      acknowledgement.route_kind === "automatic_capture" ? 1 : 0),
    visual_frame_manual_provider_acknowledged_count:
      snapshot.visual_frame_manual_provider_acknowledged_count +
      (acknowledgement.first_provider_acknowledgement &&
      acknowledgement.route_kind === "manual_promotion" ? 1 : 0),
    visual_frame_provider_image_confirmed_count:
      snapshot.visual_frame_provider_image_confirmed_count +
      (acknowledgement.first_provider_image_context_confirmation ? 1 : 0),
    visual_frame_automatic_provider_image_confirmed_count:
      snapshot.visual_frame_automatic_provider_image_confirmed_count +
      (acknowledgement.first_provider_image_context_confirmation &&
      acknowledgement.route_kind === "automatic_capture" ? 1 : 0),
    visual_frame_manual_provider_image_confirmed_count:
      snapshot.visual_frame_manual_provider_image_confirmed_count +
      (acknowledgement.first_provider_image_context_confirmation &&
      acknowledgement.route_kind === "manual_promotion" ? 1 : 0),
    latest_visual_frame_provider_acknowledgement: { ...acknowledgement },
    updated_at_ms: acknowledgement.observed_at_ms,
    events: [...snapshot.events, event].slice(-MAX_EVENTS),
  };
};

export const readHelixAskLiveRuntimeClientDebugSnapshot = ():
  HelixAskLiveRuntimeClientDebugSnapshot | null =>
  snapshot
    ? {
        ...snapshot,
        events: snapshot.events.map((event: HelixAskLiveRuntimeClientDebugEvent) => ({ ...event })),
        completed_output_transcripts: snapshot.completed_output_transcripts.map(
          (transcript: HelixAskRealtimeCompletedOutputTranscript) => ({ ...transcript }),
        ),
        latest_completed_output_transcript: snapshot.latest_completed_output_transcript
          ? { ...snapshot.latest_completed_output_transcript }
          : null,
        latest_visual_frame_provider_acknowledgement:
          snapshot.latest_visual_frame_provider_acknowledgement
            ? { ...snapshot.latest_visual_frame_provider_acknowledgement }
            : null,
        visual_input_proof: buildHelixAskLiveVisionProof(snapshot),
      }
    : null;

export const resetHelixAskLiveRuntimeClientDebugStateForTests = (): void => {
  snapshot = null;
};

export const mergeHelixAskLiveRuntimeClientDebugIntoExport = (payload: string): string => {
  const liveRuntimeDebug = readHelixAskLiveRuntimeClientDebugSnapshot();
  if (!liveRuntimeDebug) return payload;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const selectedAnswerTurnId =
      typeof parsed.active_turn_id === "string" ? parsed.active_turn_id : null;
    const groundedAnswers = liveRuntimeDebug.server_stage_play_provenance?.handoffs
      .map((handoff: HelixRealtimeStagePlayDebugV1["handoffs"][number]) =>
        handoff.grounded_answer)
      .filter((answer: HelixRealtimeStagePlayGroundedAnswerV1 | null):
        answer is HelixRealtimeStagePlayGroundedAnswerV1 => Boolean(answer)) ?? [];
    const stagePlayHandoffs = liveRuntimeDebug.server_stage_play_provenance?.handoffs ?? [];
    const boundGroundedAnswer = selectedAnswerTurnId
      ? groundedAnswers.find((answer: HelixRealtimeStagePlayGroundedAnswerV1) =>
          answer.ask_turn_id === selectedAnswerTurnId) ?? null
      : null;
    const boundGroundedHandoff = boundGroundedAnswer
      ? stagePlayHandoffs.find((handoff: HelixRealtimeStagePlayDebugV1["handoffs"][number]) =>
          handoff.grounded_answer?.feedback_id === boundGroundedAnswer.feedback_id) ?? null
      : null;
    const boundGroundedRelay = boundGroundedHandoff?.grounded_relay ?? null;
    const turnBinding = boundGroundedAnswer
      ? "server_stage_play_handoff_bound_to_selected_answer"
      : liveRuntimeDebug.latest_stage_play_handoff
        ? "server_stage_play_handoff_pending_or_bound_to_another_answer"
        : "ambient_live_runtime_session_not_bound_to_selected_answer";
    const completedOutputTranscripts = liveRuntimeDebug.completed_output_transcripts.map(
      (transcript: HelixAskRealtimeCompletedOutputTranscript) => {
        const matchedHandoff = transcript.provider_response_ref
          ? stagePlayHandoffs.find((handoff: HelixRealtimeStagePlayDebugV1["handoffs"][number]) =>
              handoff.grounded_relay?.provider_response_ref === transcript.provider_response_ref) ?? null
          : null;
        const matchedRelay = matchedHandoff?.grounded_relay ?? null;
        const matchedAskTurnId = matchedRelay?.ask_turn_id ??
          matchedHandoff?.grounded_answer?.ask_turn_id ?? null;
        const bindingStatus = !transcript.provider_response_ref
          ? "provider_response_ref_missing"
          : !matchedRelay
            ? "no_grounded_relay_match"
            : !matchedAskTurnId
              ? "grounded_relay_pending_ask_turn"
              : !selectedAnswerTurnId
                ? "grounded_relay_matched_no_selected_answer"
                : matchedAskTurnId === selectedAnswerTurnId
                  ? "grounded_relay_bound_to_selected_answer"
                  : "grounded_relay_bound_to_another_answer";
        return {
          ...transcript,
          ask_turn_binding_status: bindingStatus,
          ask_turn_id: matchedAskTurnId,
          grounded_feedback_id: matchedRelay?.feedback_id ??
            matchedHandoff?.grounded_answer?.feedback_id ?? null,
          grounded_handoff_id: matchedHandoff?.handoff_id ?? null,
          grounded_relay_id: matchedRelay?.relay_id ?? null,
          grounded_relay_status: matchedRelay?.status ?? null,
          grounded_relay_playback_receipt_ref: matchedRelay?.playback_receipt_ref ?? null,
          grounded_relay_playback_confirmed:
            matchedRelay?.status === "delivered" && Boolean(matchedRelay.playback_receipt_ref),
          spoken_text_matches_answer_projection_hash:
            transcript.transcript_text_hash && matchedRelay?.answer_projection_hash
              ? transcript.transcript_text_hash === matchedRelay.answer_projection_hash
              : null,
          spoken_text_matches_canonical_answer_hash:
            transcript.transcript_text_hash && matchedHandoff?.grounded_answer?.answer_text_hash
              ? transcript.transcript_text_hash === matchedHandoff.grounded_answer.answer_text_hash
              : null,
          binding_source: matchedRelay ? "server_stage_play_grounded_relay" : "none",
        };
      },
    );
    const selectedAnswerSpokenOutput = [...completedOutputTranscripts]
      .reverse()
      .find((transcript) =>
        transcript.ask_turn_binding_status === "grounded_relay_bound_to_selected_answer") ?? null;
    const selectedAnswerSpokenOutputBinding = selectedAnswerSpokenOutput
      ? "provider_response_bound_to_selected_answer"
      : boundGroundedRelay?.status === "response_requested" ||
          boundGroundedRelay?.status === "speaking"
        ? "provider_response_in_progress_for_selected_answer"
      : boundGroundedAnswer
        ? "selected_answer_has_no_bound_completed_output_transcript"
        : "selected_answer_not_bound_to_grounded_feedback";
    return JSON.stringify({
      ...parsed,
      realtime_live_client_debug: {
        ...liveRuntimeDebug,
        completed_output_transcripts: completedOutputTranscripts,
        latest_completed_output_transcript: completedOutputTranscripts.at(-1) ?? null,
        selected_answer_turn_id: selectedAnswerTurnId,
        selected_answer_grounded_feedback_id: boundGroundedAnswer?.feedback_id ?? null,
        selected_answer_spoken_output_binding: selectedAnswerSpokenOutputBinding,
        selected_answer_spoken_output_provider_response_ref:
          selectedAnswerSpokenOutput?.provider_response_ref ??
          boundGroundedRelay?.provider_response_ref ??
          null,
        selected_answer_spoken_output_relay_status: boundGroundedRelay?.status ?? null,
        selected_answer_spoken_output_transcript_hash:
          selectedAnswerSpokenOutput?.transcript_text_hash ?? null,
        selected_answer_spoken_output_playback_confirmed:
          selectedAnswerSpokenOutput?.grounded_relay_playback_confirmed ?? false,
        turn_binding: turnBinding,
      },
    }, null, 2);
  } catch {
    return payload;
  }
};
