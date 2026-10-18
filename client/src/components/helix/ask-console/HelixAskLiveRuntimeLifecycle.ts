import type {
  HelixLiveRuntimeAgentAuthority,
  HelixLiveRuntimeAgentMode,
} from "@shared/helix-live-runtime-agent";
import {
  resolveHelixLiveRuntimeAuthority,
  resolveHelixLiveRuntimeMode,
} from "@shared/helix-live-runtime-agent";
import type { HelixRealtimeTranscriptEventType } from "@shared/helix-realtime-observation";
import type {
  HelixRealtimeSessionResponse,
  HelixRealtimeSessionTransportPlan,
} from "@shared/helix-realtime-session";

export const HELIX_ASK_LIVE_RUNTIME_LIFECYCLE_STATES = [
  "off",
  "requesting",
  "active",
  "listening",
  "speaking",
  "muted",
  "paused",
  "transcript_received",
  "stopping",
  "stopped",
  "error",
] as const;

export type HelixAskLiveRuntimeLifecycleState =
  (typeof HELIX_ASK_LIVE_RUNTIME_LIFECYCLE_STATES)[number];

export type HelixAskLiveRuntimeClientReceiptKind =
  | "session_start_requested"
  | "session_started"
  | "consent_granted"
  | "consent_denied"
  | "mic_permission_granted"
  | "mic_permission_denied"
  | "capture_active"
  | "capture_stopped"
  | "track_stopped"
  | "playback_started"
  | "playback_ended"
  | "playback_failed"
  | "transcript_event_received"
  | "stop_requested"
  | "stopped"
  | "error";

export const HELIX_ASK_LIVE_RUNTIME_TRANSPORT_CONTROLLER_STATES = [
  "idle",
  "awaiting_consent",
  "awaiting_server_session",
  "ready",
  "connecting",
  "active",
  "ready_blocked",
  "starting_blocked",
  "stopping",
  "stopped",
  "error",
] as const;

export type HelixAskLiveRuntimeTransportControllerState =
  (typeof HELIX_ASK_LIVE_RUNTIME_TRANSPORT_CONTROLLER_STATES)[number];

export type HelixAskLiveRuntimeTransportLifecycleReceiptKind =
  | "transport_start_requested"
  | "transport_start_blocked"
  | "transport_stop_requested"
  | "transport_stopped"
  | "transport_error";

export type HelixAskLiveRuntimeTransportControllerEvent = {
  schema: "helix.ask.live_runtime.transport_controller_event.v1";
  event_kind:
    | "controller_state_projected"
    | "transport_prepare_blocked"
    | "transport_start_blocked"
    | "transport_stop_recorded";
  controller_state: HelixAskLiveRuntimeTransportControllerState;
  blocked_reason: string | null;
  receipt_ref: string | null;
  transport_execution_attempted: false;
  media_capture_started: false;
  webrtc_started: false;
  assistant_answer: false;
  terminal_eligible: false;
  answer_authority: false;
  raw_content_included: false;
  reentry_required: true;
};

export type HelixAskLiveRuntimeRouteMethod = "POST";

export type HelixAskLiveRuntimeClientReceiptPayload = {
  schema: "helix.ask.live_runtime.client_receipt.v1";
  client_receipt_ref: string;
  receipt_kind: HelixAskLiveRuntimeClientReceiptKind;
  realtime_session_id: string | null;
  runtime_agent_mode: HelixLiveRuntimeAgentMode;
  runtime_agent_authority: HelixLiveRuntimeAgentAuthority;
  lifecycle_state: HelixAskLiveRuntimeLifecycleState;
  route_method: HelixAskLiveRuntimeRouteMethod;
  route_path: string;
  status: "requested" | "granted" | "denied" | "received" | "stopping" | "stopped" | "error";
  observed_at_ms: number;
  event_type?: HelixRealtimeTranscriptEventType;
  source_binding?: Record<string, unknown> | null;
  transcript_observation_ref?: string | null;
  transcript_text_hash?: string | null;
  transcript_text_char_count?: number | null;
  error_code?: string | null;
  transcript_is_user_intent: false;
  openai_network_call_attempted: false;
  ephemeral_credential_minted: false;
  webrtc_started: false;
  sideband_started: false;
  media_capture_started: false;
  browser_media_api_referenced: boolean;
  reentry_required: true;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type HelixAskLiveRuntimeRouteRequest = {
  method: HelixAskLiveRuntimeRouteMethod;
  path: string;
  body: Record<string, unknown>;
};

export type HelixAskLiveRuntimeTransportHandoffPlan = {
  schema: "helix.ask.live_runtime.transport_handoff_plan.v1";
  status:
    | "waiting_for_visible_consent"
    | "waiting_for_server_session_response"
    | "ready_for_browser_transport"
    | "blocked_live_transport_disabled";
  visible_user_consent_receipt: string | null;
  server_session_response_observed: boolean;
  server_session_response_ok: boolean;
  transport_plan: HelixRealtimeSessionTransportPlan | null;
  provider_session_ref: string | null;
  requires_visible_user_gesture: true;
  requires_server_session_response: true;
  requires_client_consent_receipt: true;
  client_secret_issued: boolean;
  sdp_exchange_allowed: boolean;
  server_sideband_allowed: false;
  can_start_browser_transport: boolean;
  media_capture_started: false;
  browser_media_api_referenced: boolean;
  webrtc_started: false;
  openai_network_call_attempted: boolean;
  blocked_reason: string;
  reentry_required: true;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type HelixAskLiveRuntimeTransportLifecycleReceiptPayload = {
  schema: "helix.ask.live_runtime.transport_lifecycle_receipt.v1";
  client_receipt_ref: string;
  receipt_kind: HelixAskLiveRuntimeTransportLifecycleReceiptKind;
  realtime_session_id: string | null;
  controller_state: HelixAskLiveRuntimeTransportControllerState;
  handoff_status: HelixAskLiveRuntimeTransportHandoffPlan["status"] | null;
  route_method: HelixAskLiveRuntimeRouteMethod;
  route_path: string;
  status: "requested" | "blocked" | "stopping" | "stopped" | "error";
  observed_at_ms: number;
  blocked_reason: string | null;
  latest_lifecycle_receipt_refs: string[];
  transport_execution_attempted: boolean;
  media_capture_started: boolean;
  browser_media_api_referenced: boolean;
  webrtc_started: boolean;
  openai_network_call_attempted: boolean;
  browser_tracks_created: boolean;
  data_channels_created: boolean;
  reentry_required: true;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type HelixAskLiveRuntimeTransportControllerModel = {
  schema: "helix.ask.live_runtime.transport_controller_model.v1";
  controller_state: HelixAskLiveRuntimeTransportControllerState;
  controller_label: string;
  handoff_plan: HelixAskLiveRuntimeTransportHandoffPlan;
  latest_lifecycle_receipt_refs: string[];
  blocked_reason: string | null;
  events: HelixAskLiveRuntimeTransportControllerEvent[];
  transport_execution_attempted: boolean;
  media_capture_started: false;
  browser_media_api_referenced: boolean;
  webrtc_started: false;
  openai_network_call_attempted: boolean;
  reentry_required: true;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type HelixAskLiveRuntimeTransportBoundaryResult = {
  schema: "helix.ask.live_runtime.transport_boundary_result.v1";
  ok: boolean;
  method: "prepareTransport" | "startTransport" | "stopTransport";
  controller_state: HelixAskLiveRuntimeTransportControllerState;
  receipt: HelixAskLiveRuntimeTransportLifecycleReceiptPayload;
  transport_execution_attempted: boolean;
  media_capture_started: boolean;
  browser_media_api_referenced: boolean;
  webrtc_started: boolean;
  openai_network_call_attempted: boolean;
  browser_tracks_created: boolean;
  data_channels_created: boolean;
  blocked_reason: string;
};

export type HelixAskLiveRuntimeTransportExecutionBoundary = {
  prepareTransport(args: {
    handoffPlan: HelixAskLiveRuntimeTransportHandoffPlan;
    observedAtMs?: number | null;
  }): Promise<HelixAskLiveRuntimeTransportBoundaryResult>;
  startTransport(args: {
    handoffPlan: HelixAskLiveRuntimeTransportHandoffPlan;
    serverResponse?: HelixRealtimeSessionResponse | null;
    observedAtMs?: number | null;
  }): Promise<HelixAskLiveRuntimeTransportBoundaryResult>;
  stopTransport(args: {
    realtimeSessionId?: string | null;
    observedAtMs?: number | null;
  }): Promise<HelixAskLiveRuntimeTransportBoundaryResult>;
};

const lifecycleStateSet = new Set<string>(HELIX_ASK_LIVE_RUNTIME_LIFECYCLE_STATES);
const transportControllerStateSet = new Set<string>(
  HELIX_ASK_LIVE_RUNTIME_TRANSPORT_CONTROLLER_STATES,
);

const normalizeLifecycleState = (value: unknown): HelixAskLiveRuntimeLifecycleState =>
  typeof value === "string" && lifecycleStateSet.has(value)
    ? (value as HelixAskLiveRuntimeLifecycleState)
    : "off";

const normalizeTransportControllerState = (
  value: unknown,
): HelixAskLiveRuntimeTransportControllerState =>
  typeof value === "string" && transportControllerStateSet.has(value)
    ? (value as HelixAskLiveRuntimeTransportControllerState)
    : "idle";

const statusForReceiptKind = (
  receiptKind: HelixAskLiveRuntimeClientReceiptKind,
): HelixAskLiveRuntimeClientReceiptPayload["status"] => {
  switch (receiptKind) {
    case "session_start_requested":
      return "requested";
    case "session_started":
    case "capture_active":
    case "track_stopped":
    case "playback_started":
    case "playback_ended":
      return "received";
    case "consent_granted":
    case "mic_permission_granted":
      return "granted";
    case "consent_denied":
    case "mic_permission_denied":
      return "denied";
    case "transcript_event_received":
      return "received";
    case "stop_requested":
      return "stopping";
    case "stopped":
    case "capture_stopped":
      return "stopped";
    case "error":
    case "playback_failed":
      return "error";
  }
};

const routePathForReceiptKind = (args: {
  receiptKind: HelixAskLiveRuntimeClientReceiptKind;
  realtimeSessionId: string | null;
}): string => {
  const id = args.realtimeSessionId ? encodeURIComponent(args.realtimeSessionId) : null;
  switch (args.receiptKind) {
    case "session_start_requested":
      return "/api/agi/realtime/session";
    case "transcript_event_received":
      return `/api/agi/realtime/session/${id ?? "pending"}/event`;
    case "stop_requested":
      return `/api/agi/realtime/session/${id ?? "pending"}/stop`;
    case "consent_granted":
    case "consent_denied":
    case "session_started":
    case "mic_permission_granted":
    case "mic_permission_denied":
    case "capture_active":
    case "capture_stopped":
    case "track_stopped":
    case "playback_started":
    case "playback_ended":
    case "playback_failed":
    case "stopped":
    case "error":
      return `/api/agi/realtime/session/${id ?? "pending"}/client-receipt`;
  }
};

const lifecycleForReceiptKind = (
  receiptKind: HelixAskLiveRuntimeClientReceiptKind,
  preferredState: unknown,
): HelixAskLiveRuntimeLifecycleState => {
  const normalized = normalizeLifecycleState(preferredState);
  if (preferredState) return normalized;
  switch (receiptKind) {
    case "session_start_requested":
    case "consent_granted":
    case "mic_permission_granted":
      return "requesting";
    case "session_started":
    case "capture_active":
    case "playback_started":
    case "playback_ended":
      return "active";
    case "consent_denied":
    case "mic_permission_denied":
    case "playback_failed":
    case "error":
      return "error";
    case "transcript_event_received":
      return "transcript_received";
    case "stop_requested":
      return "stopping";
    case "stopped":
    case "capture_stopped":
    case "track_stopped":
      return "stopped";
  }
};

export const labelForHelixAskLiveRuntimeLifecycleState = (
  state: HelixAskLiveRuntimeLifecycleState,
): string => {
  switch (state) {
    case "off":
      return "Off";
    case "requesting":
      return "Requesting";
    case "active":
      return "Active";
    case "listening":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "muted":
      return "Muted";
    case "paused":
      return "Paused";
    case "transcript_received":
      return "Transcript";
    case "stopping":
      return "Stopping";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
  }
};

export const labelForHelixAskLiveRuntimeTransportControllerState = (
  state: HelixAskLiveRuntimeTransportControllerState,
): string => {
  switch (state) {
    case "idle":
      return "Transport Idle";
    case "awaiting_consent":
      return "Needs Consent";
    case "awaiting_server_session":
      return "Needs Session";
    case "ready":
      return "Ready";
    case "connecting":
      return "Connecting";
    case "active":
      return "Live";
    case "ready_blocked":
      return "Ready Blocked";
    case "starting_blocked":
      return "Start Blocked";
    case "stopping":
      return "Stopping";
    case "stopped":
      return "Stopped";
    case "error":
      return "Transport Error";
  }
};

export function buildHelixAskLiveRuntimeClientReceiptPayload(args: {
  receiptKind: HelixAskLiveRuntimeClientReceiptKind;
  realtimeSessionId?: string | null;
  runtimeAgentMode?: unknown;
  runtimeAgentAuthority?: unknown;
  lifecycleState?: unknown;
  clientReceiptRef?: string | null;
  observedAtMs?: number | null;
  eventType?: HelixRealtimeTranscriptEventType | null;
  sourceBinding?: Record<string, unknown> | null;
  transcriptObservationRef?: string | null;
  transcriptTextHash?: string | null;
  transcriptTextCharCount?: number | null;
  errorCode?: string | null;
}): HelixAskLiveRuntimeClientReceiptPayload {
  const realtimeSessionId = args.realtimeSessionId ?? null;
  const lifecycleState = lifecycleForReceiptKind(args.receiptKind, args.lifecycleState);
  const routePath = routePathForReceiptKind({
    receiptKind: args.receiptKind,
    realtimeSessionId,
  });
  return {
    schema: "helix.ask.live_runtime.client_receipt.v1",
    client_receipt_ref:
      args.clientReceiptRef ??
      `receipt:live-runtime:${args.receiptKind}:${args.observedAtMs ?? "pending"}`,
    receipt_kind: args.receiptKind,
    realtime_session_id: realtimeSessionId,
    runtime_agent_mode: resolveHelixLiveRuntimeMode(args.runtimeAgentMode),
    runtime_agent_authority: resolveHelixLiveRuntimeAuthority(args.runtimeAgentAuthority),
    lifecycle_state: lifecycleState,
    route_method: "POST",
    route_path: routePath,
    status: statusForReceiptKind(args.receiptKind),
    observed_at_ms:
      typeof args.observedAtMs === "number" && Number.isFinite(args.observedAtMs)
        ? Math.trunc(args.observedAtMs)
        : 0,
    ...(args.eventType ? { event_type: args.eventType } : {}),
    ...(args.sourceBinding ? { source_binding: args.sourceBinding } : {}),
    ...(args.transcriptObservationRef
      ? { transcript_observation_ref: args.transcriptObservationRef }
      : {}),
    ...(args.transcriptTextHash ? { transcript_text_hash: args.transcriptTextHash } : {}),
    ...(typeof args.transcriptTextCharCount === "number"
      ? { transcript_text_char_count: Math.trunc(args.transcriptTextCharCount) }
      : {}),
    ...(args.errorCode ? { error_code: args.errorCode } : {}),
    transcript_is_user_intent: false,
    openai_network_call_attempted: false,
    ephemeral_credential_minted: false,
    webrtc_started: false,
    sideband_started: false,
    media_capture_started: false,
    browser_media_api_referenced: false,
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

export function buildHelixAskLiveRuntimeRouteRequest(
  payload: HelixAskLiveRuntimeClientReceiptPayload,
): HelixAskLiveRuntimeRouteRequest {
  if (payload.receipt_kind === "session_start_requested") {
    return {
      method: payload.route_method,
      path: payload.route_path,
      body: {
        runtime_agent_mode: payload.runtime_agent_mode,
        runtime_agent_authority: payload.runtime_agent_authority,
        visible_user_consent_receipt: payload.client_receipt_ref,
        client_receipt_ref: payload.client_receipt_ref,
        receipt_kind: payload.receipt_kind,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        media_capture_started: false,
      },
    };
  }
  if (payload.receipt_kind === "transcript_event_received") {
    return {
      method: payload.route_method,
      path: payload.route_path,
      body: {
        event_type: payload.event_type ?? "transcript.partial",
        event_ref: payload.transcript_observation_ref ?? payload.client_receipt_ref,
        client_receipt_ref: payload.client_receipt_ref,
        observed_at_ms: payload.observed_at_ms,
        source_binding: payload.source_binding ?? null,
        transcript_text_hash: payload.transcript_text_hash ?? null,
        transcript_text_char_count: payload.transcript_text_char_count ?? null,
      },
    };
  }
  return {
    method: payload.route_method,
    path: payload.route_path,
    body: {
      client_receipt_ref: payload.client_receipt_ref,
      receipt_kind: payload.receipt_kind,
      status: payload.status,
      observed_at_ms: payload.observed_at_ms,
      lifecycle_state: payload.lifecycle_state,
      error_code: payload.error_code ?? null,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    },
  };
}

const readRealtimeTransportPlan = (
  response: HelixRealtimeSessionResponse | null | undefined,
): HelixRealtimeSessionTransportPlan | null =>
  response && typeof response === "object" && response.transport_plan
    ? response.transport_plan
    : null;

export function buildHelixAskLiveRuntimeTransportHandoffPlan(args: {
  consentReceipt?: HelixAskLiveRuntimeClientReceiptPayload | null;
  serverResponse?: HelixRealtimeSessionResponse | null;
}): HelixAskLiveRuntimeTransportHandoffPlan {
  const consentRef =
    args.consentReceipt?.receipt_kind === "consent_granted"
      ? args.consentReceipt.client_receipt_ref
      : null;
  const serverResponseObserved = Boolean(args.serverResponse);
  const transportPlan = readRealtimeTransportPlan(args.serverResponse);
  const transportReady = Boolean(
    consentRef &&
      args.serverResponse?.ok === true &&
      args.serverResponse.realtime_session_id &&
      transportPlan?.live_transport_enabled === true &&
      args.serverResponse.sdp_exchange_requested === true,
  );
  const status = !consentRef
    ? "waiting_for_visible_consent"
    : !serverResponseObserved
      ? "waiting_for_server_session_response"
      : transportReady
        ? "ready_for_browser_transport"
        : "blocked_live_transport_disabled";
  const blockedReason = !consentRef
    ? "visible_user_consent_required"
    : !serverResponseObserved
      ? "server_session_response_required"
      : transportReady
        ? "transport_contract_admitted"
        : transportPlan?.live_execution_disabled_reason ?? "live_transport_not_enabled";

  return {
    schema: "helix.ask.live_runtime.transport_handoff_plan.v1",
    status,
    visible_user_consent_receipt: consentRef,
    server_session_response_observed: serverResponseObserved,
    server_session_response_ok: args.serverResponse?.ok === true,
    transport_plan: transportPlan,
    provider_session_ref: args.serverResponse?.provider_session_ref ?? null,
    requires_visible_user_gesture: true,
    requires_server_session_response: true,
    requires_client_consent_receipt: true,
    client_secret_issued: args.serverResponse?.client_secret_issued === true,
    sdp_exchange_allowed: transportReady,
    server_sideband_allowed: false,
    can_start_browser_transport: transportReady,
    media_capture_started: false,
    browser_media_api_referenced: false,
    webrtc_started: false,
    openai_network_call_attempted: args.serverResponse?.openai_network_call_attempted === true,
    blocked_reason: blockedReason,
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

const statusForTransportReceiptKind = (
  receiptKind: HelixAskLiveRuntimeTransportLifecycleReceiptKind,
): HelixAskLiveRuntimeTransportLifecycleReceiptPayload["status"] => {
  switch (receiptKind) {
    case "transport_start_requested":
      return "requested";
    case "transport_start_blocked":
      return "blocked";
    case "transport_stop_requested":
      return "stopping";
    case "transport_stopped":
      return "stopped";
    case "transport_error":
      return "error";
  }
};

const controllerStateForTransportReceiptKind = (
  receiptKind: HelixAskLiveRuntimeTransportLifecycleReceiptKind,
  preferredState: unknown,
): HelixAskLiveRuntimeTransportControllerState => {
  const normalized = normalizeTransportControllerState(preferredState);
  if (preferredState) return normalized;
  switch (receiptKind) {
    case "transport_start_requested":
    case "transport_start_blocked":
      return "starting_blocked";
    case "transport_stop_requested":
      return "stopping";
    case "transport_stopped":
      return "stopped";
    case "transport_error":
      return "error";
  }
};

const routePathForTransportReceipt = (realtimeSessionId: string | null): string =>
  `/api/agi/realtime/session/${realtimeSessionId ? encodeURIComponent(realtimeSessionId) : "pending"}/client-receipt`;

export function buildHelixAskLiveRuntimeTransportLifecycleReceiptPayload(args: {
  receiptKind: HelixAskLiveRuntimeTransportLifecycleReceiptKind;
  realtimeSessionId?: string | null;
  controllerState?: unknown;
  handoffPlan?: HelixAskLiveRuntimeTransportHandoffPlan | null;
  clientReceiptRef?: string | null;
  observedAtMs?: number | null;
  blockedReason?: string | null;
  latestLifecycleReceiptRefs?: string[];
  transportExecutionAttempted?: boolean;
  mediaCaptureStarted?: boolean;
  webrtcStarted?: boolean;
  browserTracksCreated?: boolean;
  dataChannelsCreated?: boolean;
  browserMediaApiReferenced?: boolean;
  openAiNetworkCallAttempted?: boolean;
}): HelixAskLiveRuntimeTransportLifecycleReceiptPayload {
  const realtimeSessionId = args.realtimeSessionId ?? null;
  const controllerState = controllerStateForTransportReceiptKind(
    args.receiptKind,
    args.controllerState,
  );
  const blockedReason =
    args.blockedReason ??
    args.handoffPlan?.blocked_reason ??
    (args.receiptKind.includes("blocked") ? "transport_execution_disabled" : null);
  return {
    schema: "helix.ask.live_runtime.transport_lifecycle_receipt.v1",
    client_receipt_ref:
      args.clientReceiptRef ??
      `receipt:live-runtime:transport:${args.receiptKind}:${args.observedAtMs ?? "pending"}`,
    receipt_kind: args.receiptKind,
    realtime_session_id: realtimeSessionId,
    controller_state: controllerState,
    handoff_status: args.handoffPlan?.status ?? null,
    route_method: "POST",
    route_path: routePathForTransportReceipt(realtimeSessionId),
    status: statusForTransportReceiptKind(args.receiptKind),
    observed_at_ms:
      typeof args.observedAtMs === "number" && Number.isFinite(args.observedAtMs)
        ? Math.trunc(args.observedAtMs)
        : 0,
    blocked_reason: blockedReason,
    latest_lifecycle_receipt_refs: args.latestLifecycleReceiptRefs ?? [],
    transport_execution_attempted: args.transportExecutionAttempted === true,
    media_capture_started: args.mediaCaptureStarted === true,
    browser_media_api_referenced: args.browserMediaApiReferenced === true,
    webrtc_started: args.webrtcStarted === true,
    openai_network_call_attempted: args.openAiNetworkCallAttempted === true,
    browser_tracks_created: args.browserTracksCreated === true,
    data_channels_created: args.dataChannelsCreated === true,
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

export function buildHelixAskLiveRuntimeTransportReceiptRouteRequest(
  payload: HelixAskLiveRuntimeTransportLifecycleReceiptPayload,
): HelixAskLiveRuntimeRouteRequest {
  return {
    method: payload.route_method,
    path: payload.route_path,
    body: {
      client_receipt_ref: payload.client_receipt_ref,
      receipt_kind: payload.receipt_kind,
      status: payload.status,
      observed_at_ms: payload.observed_at_ms,
      controller_state: payload.controller_state,
      handoff_status: payload.handoff_status,
      blocked_reason: payload.blocked_reason,
      latest_lifecycle_receipt_refs: payload.latest_lifecycle_receipt_refs,
      transport_execution_attempted: payload.transport_execution_attempted,
      media_capture_started: payload.media_capture_started,
      browser_media_api_referenced: payload.browser_media_api_referenced,
      webrtc_started: payload.webrtc_started,
      openai_network_call_attempted: payload.openai_network_call_attempted,
      browser_tracks_created: payload.browser_tracks_created,
      data_channels_created: payload.data_channels_created,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    },
  };
}

const controllerStateForHandoff = (
  handoffPlan: HelixAskLiveRuntimeTransportHandoffPlan,
): HelixAskLiveRuntimeTransportControllerState => {
  switch (handoffPlan.status) {
    case "waiting_for_visible_consent":
      return "awaiting_consent";
    case "waiting_for_server_session_response":
      return "awaiting_server_session";
    case "ready_for_browser_transport":
      return "ready";
    case "blocked_live_transport_disabled":
      return handoffPlan.server_session_response_observed ? "ready_blocked" : "starting_blocked";
  }
};

export function buildHelixAskLiveRuntimeTransportControllerModel(args: {
  handoffPlan: HelixAskLiveRuntimeTransportHandoffPlan;
  controllerState?: unknown;
  latestLifecycleReceiptRefs?: string[];
  latestReceipt?: HelixAskLiveRuntimeTransportLifecycleReceiptPayload | null;
}): HelixAskLiveRuntimeTransportControllerModel {
  const controllerState = args.controllerState
    ? normalizeTransportControllerState(args.controllerState)
    : args.latestReceipt?.controller_state ?? controllerStateForHandoff(args.handoffPlan);
  const receiptRefs = [
    ...(args.latestLifecycleReceiptRefs ?? []),
    ...(args.latestReceipt ? [args.latestReceipt.client_receipt_ref] : []),
  ];
  const latestReceiptRef = receiptRefs[receiptRefs.length - 1] ?? null;
  const eventKind: HelixAskLiveRuntimeTransportControllerEvent["event_kind"] =
    controllerState === "stopping" || controllerState === "stopped"
      ? "transport_stop_recorded"
      : controllerState === "starting_blocked"
        ? "transport_start_blocked"
        : controllerState === "ready_blocked"
          ? "transport_prepare_blocked"
          : "controller_state_projected";
  return {
    schema: "helix.ask.live_runtime.transport_controller_model.v1",
    controller_state: controllerState,
    controller_label: labelForHelixAskLiveRuntimeTransportControllerState(controllerState),
    handoff_plan: args.handoffPlan,
    latest_lifecycle_receipt_refs: receiptRefs,
    blocked_reason: args.latestReceipt?.blocked_reason ?? args.handoffPlan.blocked_reason,
    events: [
      {
        schema: "helix.ask.live_runtime.transport_controller_event.v1",
        event_kind: eventKind,
        controller_state: controllerState,
        blocked_reason: args.latestReceipt?.blocked_reason ?? args.handoffPlan.blocked_reason,
        receipt_ref: latestReceiptRef,
        transport_execution_attempted: false,
        media_capture_started: false,
        webrtc_started: false,
        assistant_answer: false,
        terminal_eligible: false,
        answer_authority: false,
        raw_content_included: false,
        reentry_required: true,
      },
    ],
    transport_execution_attempted: false,
    media_capture_started: false,
    browser_media_api_referenced: false,
    webrtc_started: false,
    openai_network_call_attempted: false,
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

const buildDisabledTransportBoundaryResult = (args: {
  method: HelixAskLiveRuntimeTransportBoundaryResult["method"];
  receiptKind: HelixAskLiveRuntimeTransportLifecycleReceiptKind;
  handoffPlan?: HelixAskLiveRuntimeTransportHandoffPlan | null;
  realtimeSessionId?: string | null;
  observedAtMs?: number | null;
  blockedReason: string;
  controllerState?: HelixAskLiveRuntimeTransportControllerState;
}): HelixAskLiveRuntimeTransportBoundaryResult => {
  const receipt = buildHelixAskLiveRuntimeTransportLifecycleReceiptPayload({
    receiptKind: args.receiptKind,
    realtimeSessionId: args.realtimeSessionId,
    controllerState: args.controllerState,
    handoffPlan: args.handoffPlan,
    observedAtMs: args.observedAtMs,
    blockedReason: args.blockedReason,
  });
  return {
    schema: "helix.ask.live_runtime.transport_boundary_result.v1",
    ok: false,
    method: args.method,
    controller_state: receipt.controller_state,
    receipt,
    transport_execution_attempted: false,
    media_capture_started: false,
    browser_media_api_referenced: false,
    webrtc_started: false,
    openai_network_call_attempted: false,
    browser_tracks_created: false,
    data_channels_created: false,
    blocked_reason: args.blockedReason,
  };
};

export const HELIX_ASK_DISABLED_LIVE_RUNTIME_TRANSPORT_BOUNDARY:
  HelixAskLiveRuntimeTransportExecutionBoundary = {
    prepareTransport: async ({ handoffPlan, observedAtMs }) =>
      buildDisabledTransportBoundaryResult({
        method: "prepareTransport",
        receiptKind: "transport_start_blocked",
        handoffPlan,
        realtimeSessionId: null,
        observedAtMs,
        blockedReason: handoffPlan.blocked_reason || "transport_prepare_disabled",
        controllerState: "ready_blocked",
      }),
    startTransport: async ({ handoffPlan, observedAtMs }) =>
      buildDisabledTransportBoundaryResult({
        method: "startTransport",
        receiptKind: "transport_start_blocked",
        handoffPlan,
        realtimeSessionId: null,
        observedAtMs,
        blockedReason: handoffPlan.blocked_reason || "transport_start_disabled",
        controllerState: "starting_blocked",
      }),
    stopTransport: async ({ realtimeSessionId, observedAtMs }) =>
      buildDisabledTransportBoundaryResult({
        method: "stopTransport",
        receiptKind: "transport_stopped",
        realtimeSessionId,
        observedAtMs,
        blockedReason: "transport_stop_recorded_without_browser_resources",
        controllerState: "stopped",
      }),
  };
