import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HelixLiveRuntimeAgentAuthority,
  HelixLiveRuntimeAgentMode,
} from "@shared/helix-live-runtime-agent";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type { HelixRealtimeSessionResponse } from "@shared/helix-realtime-session";
import type { HelixRealtimeGroundedRelayStatusV1 } from "@shared/contracts/helix-realtime-worker-relay.v1";
import {
  buildHelixAskLiveRuntimeClientReceiptPayload,
  buildHelixAskLiveRuntimeRouteRequest,
  buildHelixAskLiveRuntimeTransportHandoffPlan,
  type HelixAskLiveRuntimeLifecycleState,
  type HelixAskLiveRuntimeTransportControllerState,
} from "./HelixAskLiveRuntimeLifecycle";
import {
  createHelixAskLiveRuntimeBrowserTransportController,
  type HelixAskLiveRuntimeBrowserTransportController,
} from "./HelixAskLiveRuntimeTransportController";
import {
  getLatestVisualFrameProducerFrame,
  isVisualFrameProducerSourceActive,
  subscribeVisualFrameProducerFrames,
  type VisualFrameProducerClientFrame,
} from "@/lib/helix/visualFrameProducer";
import {
  createHelixAskRealtimeProviderEventHandler,
  type HelixAskRealtimeProviderEventHandler,
  type HelixAskRealtimeProviderEventProjection,
} from "./HelixAskRealtimeProviderEventHandler";
import { getAudioFocusSnapshot } from "@/lib/audio-focus";
import { HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT,
  type HelixManagedVoiceReplyCompletedDetail } from "@/lib/helix/managed-voice-reply";
import {
  beginHelixAskLiveRuntimeClientDebugAttempt,
  recordHelixAskLiveRuntimeClientDebugEvent,
  recordHelixAskLiveRuntimeCompletedOutputTranscript,
  recordHelixAskLiveRuntimeServerStagePlayDebug,
  recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement,
  recordHelixAskLiveRuntimeVisualFrameReceipt,
} from "./HelixAskLiveRuntimeDebugState";
import {
  createHelixAskRealtimeVisualFrameAcknowledgementTracker,
  type HelixAskRealtimeVisualFrameRouteKind,
} from "./HelixAskRealtimeVisualFrameAcknowledgement";
import { registerHelixAskVisualFrameLivePromotionHandler } from "./HelixAskVisualFramePromotion";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { buildHelixAskLiveRuntimeSourceBinding } from "./HelixAskMinimalRuntimeWorkspaceContext";
import { stageSharedLiveRoomManualVisualFrame } from
  "./shared-live-room/SharedLiveRoomManualFrame";
import {
  registerHelixAskLiveMediaBoundary,
  unregisterHelixAskLiveMediaBoundary,
} from "./shared-live-room/media-bridge/HelixAskLiveMediaBoundary";
import {
  publishSharedLiveRoomInputSpeechStarted,
  publishSharedLiveRoomInputTranscript,
  publishSharedLiveRoomOutputTranscript,
} from
  "./shared-live-room/media-bridge/RoomTranscriptRelay";

type LiveRuntimeSessionState = {
  lifecycleState: HelixAskLiveRuntimeLifecycleState;
  transportState: HelixAskLiveRuntimeTransportControllerState;
  realtimeSessionId: string | null;
  expiresAtMs: number | null;
  error: string | null;
  active: boolean;
  workerRelayStatus: HelixRealtimeGroundedRelayStatusV1 | null;
  microphoneEnabled: boolean;
  visualInputEnabled: boolean;
  visualInputFrameCount: number;
  visualInputProviderAcknowledgedFrameCount: number;
  visualInputProviderImageConfirmedFrameCount: number;
  visualInputLastDeliveryStatus:
    | "none"
    | "transport_sent"
    | "provider_acknowledged"
    | "transport_error"
    | "provider_error";
  visualInputError: string | null;
};

const INITIAL_STATE: LiveRuntimeSessionState = {
  lifecycleState: "off",
  transportState: "idle",
  realtimeSessionId: null,
  expiresAtMs: null,
  error: null,
  active: false,
  workerRelayStatus: null,
  microphoneEnabled: false,
  visualInputEnabled: false,
  visualInputFrameCount: 0,
  visualInputProviderAcknowledgedFrameCount: 0,
  visualInputProviderImageConfirmedFrameCount: 0,
  visualInputLastDeliveryStatus: "none",
  visualInputError: null,
};

type LiveRuntimeSafeContext = {
  transportReceiptRef: string | null;
  vadState: string | null;
  interruptionCount: number;
};

const REALTIME_GROUNDED_RELAY_STATUSES = new Set<HelixRealtimeGroundedRelayStatusV1>([
  "worker_running",
  "result_ready",
  "relay_queued_busy",
  "response_requested",
  "provider_acknowledged",
  "speaking",
  "delivered",
  "suppressed",
  "superseded",
  "stale",
  "interrupted",
  "cancelled",
  "failed",
]);

const readWorkerRelayStatus = (value: unknown): HelixRealtimeGroundedRelayStatusV1 | null =>
  typeof value === "string" &&
  REALTIME_GROUNDED_RELAY_STATUSES.has(value as HelixRealtimeGroundedRelayStatusV1)
    ? value as HelixRealtimeGroundedRelayStatusV1
    : null;

const postJson = async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as
    | (T & { blocked_reason?: string; error?: string })
    | null;
  if (!response.ok) {
    throw new Error(payload?.blocked_reason || payload?.error || `realtime_http_${response.status}`);
  }
  if (!payload) throw new Error("realtime_response_invalid");
  return payload;
};

const readLiveRuntimeSourceBinding = (): Record<string, unknown> =>
  buildHelixAskLiveRuntimeSourceBinding({
    desktopUrl: typeof window === "undefined" ? "" : window.location.href,
    layoutState: useWorkstationLayoutStore.getState(),
  });

export const useHelixAskLiveRuntimeSession = (input: {
  enabled: boolean;
  mode: HelixLiveRuntimeAgentMode;
  authority: HelixLiveRuntimeAgentAuthority;
  selectedRuntimeAgentProvider: HelixAgentRuntimeId;
  directVisualInputSuppressed?: boolean;
  initialLifecycleState?: HelixAskLiveRuntimeLifecycleState;
  initialTransportState?: HelixAskLiveRuntimeTransportControllerState;
}) => {
  const [state, setState] = useState<LiveRuntimeSessionState>(() => ({
    ...INITIAL_STATE,
    lifecycleState: input.initialLifecycleState ?? INITIAL_STATE.lifecycleState,
    transportState: input.initialTransportState ?? INITIAL_STATE.transportState,
  }));
  const [visualTransportRevision, setVisualTransportRevision] = useState(0);
  const controllerRef = useRef<HelixAskLiveRuntimeBrowserTransportController | null>(null);
  const providerEventHandlerRef = useRef<HelixAskRealtimeProviderEventHandler | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const microphoneEnabledRef = useRef(false);
  const visualInputEnabledRef = useRef(false);
  const visualFrameAcknowledgementTrackerRef = useRef(
    createHelixAskRealtimeVisualFrameAcknowledgementTracker(),
  );
  const selectedRuntimeAgentProviderRef = useRef(input.selectedRuntimeAgentProvider);
  selectedRuntimeAgentProviderRef.current = input.selectedRuntimeAgentProvider;
  const runtimeContextRef = useRef<LiveRuntimeSafeContext>({
    transportReceiptRef: null,
    vadState: null,
    interruptionCount: 0,
  });

  useEffect(() => {
    const spokenTurns = new Set<string>();
    const onManagedReply = (event: Event) => {
      const detail = (event as CustomEvent<HelixManagedVoiceReplyCompletedDetail>).detail;
      const sessionId = sessionIdRef.current;
      if (!sessionId || !detail?.clientEventRef?.startsWith(`gpt-live:${sessionId}:`) ||
          !detail.turnId || spokenTurns.has(detail.turnId)) return;
      const sent = controllerRef.current?.speakManagedVoiceReply({
        turnId: detail.turnId, text: detail.text,
      }) === true;
      recordHelixAskLiveRuntimeClientDebugEvent({
        eventKind: sent ? "managed_voice_reply_requested" : "managed_voice_reply_blocked",
        realtimeSessionId: sessionId,
        detailCode: sent ? null : "realtime_transport_unavailable",
      });
      if (sent) {
        spokenTurns.add(detail.turnId);
        if (spokenTurns.size > 256) spokenTurns.delete(spokenTurns.values().next().value!);
      }
    };
    window.addEventListener(HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT, onManagedReply);
    return () => window.removeEventListener(HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT, onManagedReply);
  }, []);

  const stop = useCallback(async () => {
    // Consent revocation must take effect before React can commit the next render.
    visualInputEnabledRef.current = false;
    visualFrameAcknowledgementTrackerRef.current.reset();
    const sessionId = sessionIdRef.current ?? state.realtimeSessionId;
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "session_stop_requested",
      realtimeSessionId: sessionId,
      lifecycleState: "stopping",
      transportState: "stopping",
    });
    setState((current) => ({
      ...current,
      lifecycleState: "stopping",
      transportState: "stopping",
    }));
    const controller = controllerRef.current;
    providerEventHandlerRef.current?.dispose();
    providerEventHandlerRef.current = null;
    unregisterHelixAskLiveMediaBoundary({ realtimeSessionId: sessionId, controller });
    await controller?.stopTransport({ realtimeSessionId: sessionId }).catch(() => null);
    controllerRef.current = null;
    sessionIdRef.current = null;
    runtimeContextRef.current = {
      transportReceiptRef: null,
      vadState: null,
      interruptionCount: 0,
    };
    if (sessionId) {
      await postJson(`/api/agi/realtime/session/${encodeURIComponent(sessionId)}/stop`, {
        receipt_kind: "stop_requested",
        observed_at_ms: Date.now(),
      }).catch(() => null);
    }
    setState({
      lifecycleState: "stopped",
      transportState: "stopped",
      realtimeSessionId: null,
      expiresAtMs: null,
      error: null,
      active: false,
      workerRelayStatus: null,
      microphoneEnabled: false,
      visualInputEnabled: false,
      visualInputFrameCount: 0,
      visualInputProviderAcknowledgedFrameCount: 0,
      visualInputProviderImageConfirmedFrameCount: 0,
      visualInputLastDeliveryStatus: "none",
      visualInputError: null,
    });
    microphoneEnabledRef.current = false;
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "session_stopped",
      realtimeSessionId: sessionId,
      lifecycleState: "stopped",
      transportState: "stopped",
    });
  }, [state.realtimeSessionId]);

  const start = useCallback(async (renewal = false) => {
    if (!input.enabled || (!renewal && state.active) || state.lifecycleState === "requesting") return false;
    if (renewal) await stop();
    visualInputEnabledRef.current = false;
    visualFrameAcknowledgementTrackerRef.current.reset();
    const mode = input.mode === "off" ? "live_voice" : input.mode;
    const observedAtMs = Date.now();
    const consentReceipt = buildHelixAskLiveRuntimeClientReceiptPayload({
      receiptKind: "consent_granted",
      runtimeAgentMode: mode,
      runtimeAgentAuthority: input.authority,
      clientReceiptRef: `receipt:live-runtime:consent:${crypto.randomUUID()}`,
      observedAtMs,
    });
    beginHelixAskLiveRuntimeClientDebugAttempt({
      attemptRef: consentReceipt.client_receipt_ref,
      runtimeAgentMode: mode,
      runtimeAgentAuthority: input.authority,
      observedAtMs,
    });
    setState({
      lifecycleState: "requesting",
      transportState: "awaiting_server_session",
      realtimeSessionId: null,
      expiresAtMs: null,
      error: null,
      active: false,
      workerRelayStatus: null,
      microphoneEnabled: false,
      visualInputEnabled: false,
      visualInputFrameCount: 0,
      visualInputProviderAcknowledgedFrameCount: 0,
      visualInputProviderImageConfirmedFrameCount: 0,
      visualInputLastDeliveryStatus: "none",
      visualInputError: null,
    });
    try {
      const startReceipt = buildHelixAskLiveRuntimeClientReceiptPayload({
        receiptKind: "session_start_requested",
        runtimeAgentMode: mode,
        runtimeAgentAuthority: input.authority,
        clientReceiptRef: consentReceipt.client_receipt_ref,
        observedAtMs,
      });
      const request = buildHelixAskLiveRuntimeRouteRequest(startReceipt);
      const response = await postJson<HelixRealtimeSessionResponse>(request.path, {
        ...request.body,
        runtime_agent_mode: mode,
        runtime_agent_authority: input.authority,
        selected_runtime_agent_provider: selectedRuntimeAgentProviderRef.current,
        transport: "webrtc",
        sdp_exchange_mode: "server",
        requested_backend_provider: "realtime_session.openai_realtime",
        selected_model_or_service:
          mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1",
        selected_realtime_voice: "marin",
        source_binding: readLiveRuntimeSourceBinding(),
        visible_user_consent_receipt: consentReceipt.client_receipt_ref,
      });
      if (!response.ok || !response.realtime_session_id) {
        throw new Error(response.blocked_reason || response.error || "realtime_session_admission_failed");
      }
      const realtimeSessionId = response.realtime_session_id;
      recordHelixAskLiveRuntimeClientDebugEvent({
        eventKind: "server_session_admitted",
        realtimeSessionId: response.realtime_session_id,
        selectedModelOrService:
          mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1",
        lifecycleState: "requesting",
        transportState: "connecting",
      });
      const eventHandler = createHelixAskRealtimeProviderEventHandler({
        realtimeSessionId: response.realtime_session_id,
        runtimeAgentAuthority: input.authority,
        selectedRealtimeModel:
          mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1",
        providerSessionRef: response.provider_session_ref,
        getRuntimeContext: () => ({
          ...runtimeContextRef.current,
          audioFocusOwner: getAudioFocusSnapshot().active_kind,
          sourceBinding: readLiveRuntimeSourceBinding(),
          selectedRuntimeAgentProvider: selectedRuntimeAgentProviderRef.current,
        }),
        onProjection: (projection: HelixAskRealtimeProviderEventProjection) => {
          if (projection.completed_output_transcript) {
            recordHelixAskLiveRuntimeCompletedOutputTranscript(
              projection.completed_output_transcript,
            );
            publishSharedLiveRoomOutputTranscript(
              realtimeSessionId,
              projection.completed_output_transcript,
            );
          }
          if (projection.vad_state) {
            runtimeContextRef.current.vadState = projection.vad_state;
          }
          if (projection.response_interrupted) {
            runtimeContextRef.current.interruptionCount += 1;
          }
          const nextLifecycle: HelixAskLiveRuntimeLifecycleState | null = projection.event_kind === "playback"
            ? projection.provider_event_type.endsWith(".done") ||
                projection.provider_event_type === "output_audio_buffer.stopped"
              ? microphoneEnabledRef.current ? "listening" : "active"
              : "speaking"
            : projection.event_kind === "interruption" || projection.event_kind === "vad"
              ? "listening"
              : projection.event_kind === "response"
                ? projection.provider_event_type === "response.created"
                  ? "active"
                  : "listening"
              : null;
          if (nextLifecycle) {
            setState((current) => current.realtimeSessionId === response.realtime_session_id
              ? current.error?.startsWith("remote_audio_")
                ? current
                : { ...current, lifecycleState: nextLifecycle }
              : current);
          }
        },
      });
      providerEventHandlerRef.current?.dispose();
      providerEventHandlerRef.current = eventHandler;
      let remoteAudioPlaybackFailure: string | null = null;
      const controller = createHelixAskLiveRuntimeBrowserTransportController({
        onProviderEvent: (event) => {
          const providerEvent = event && typeof event === "object" && !Array.isArray(event)
            ? event as Record<string, unknown>
            : null;
          const providerEventType = typeof providerEvent?.type === "string"
            ? providerEvent.type
            : "provider_event_unknown";
          const providerError = providerEvent?.error &&
            typeof providerEvent.error === "object" &&
            !Array.isArray(providerEvent.error)
            ? providerEvent.error as Record<string, unknown>
            : null;
          const providerErrorCode = typeof providerError?.code === "string"
            ? providerError.code
            : typeof providerError?.type === "string"
              ? providerError.type
              : null;
          if (
            providerEventType === "input_audio_buffer.speech_started" &&
            typeof providerEvent?.item_id === "string"
          ) {
            publishSharedLiveRoomInputSpeechStarted(
              realtimeSessionId,
              {
                itemId: providerEvent.item_id,
                observedAtMs: Date.now(),
              },
            );
          }
          if (
            providerEventType === "conversation.item.input_audio_transcription.completed" &&
            typeof providerEvent?.transcript === "string"
          ) {
            const transcript = providerEvent.transcript
              .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
              .trim()
              .slice(0, 4_000);
            const eventRef = [
              typeof providerEvent.event_id === "string"
                ? providerEvent.event_id
                : "event:unknown",
              typeof providerEvent.item_id === "string"
                ? providerEvent.item_id
                : "item:unknown",
              typeof providerEvent.content_index === "number"
                ? providerEvent.content_index
                : "content:unknown",
            ].join("|");
            if (transcript) {
              publishSharedLiveRoomInputTranscript(
                realtimeSessionId,
                {
                  eventRef,
                  itemId: typeof providerEvent.item_id === "string"
                    ? providerEvent.item_id
                    : null,
                  transcript,
                  observedAtMs: Date.now(),
                },
              );
            }
          }
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: "provider_event_received",
            realtimeSessionId: response.realtime_session_id,
            providerEventType,
            detailCode: providerErrorCode,
          });
          const visualFrameAcknowledgement =
            visualFrameAcknowledgementTrackerRef.current.observeProviderEvent(event);
          if (visualFrameAcknowledgement) {
            recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement(
              visualFrameAcknowledgement,
            );
            setState((current) =>
              current.realtimeSessionId !== response.realtime_session_id
                ? current
                : {
                    ...current,
                    visualInputProviderAcknowledgedFrameCount:
                      current.visualInputProviderAcknowledgedFrameCount +
                      (visualFrameAcknowledgement.first_provider_acknowledgement ? 1 : 0),
                    visualInputProviderImageConfirmedFrameCount:
                      current.visualInputProviderImageConfirmedFrameCount +
                      (visualFrameAcknowledgement
                        .first_provider_image_context_confirmation ? 1 : 0),
                    visualInputLastDeliveryStatus:
                      visualFrameAcknowledgement.status === "provider_error"
                        ? "provider_error"
                        : "provider_acknowledged",
                    visualInputError:
                      visualFrameAcknowledgement.status === "provider_error"
                        ? visualFrameAcknowledgement.provider_error_code ??
                          "visual_frame_provider_error"
                        : null,
                  });
          }
          void eventHandler.handle(event);
        },
        onMicrophoneState: (outcome) => {
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: "microphone_tracks_observed",
            realtimeSessionId: response.realtime_session_id,
            microphoneTrackCount: outcome.trackCount,
            microphoneLiveTrackCount: outcome.liveTrackCount,
            microphoneEnabledTrackCount: outcome.enabledTrackCount,
            microphoneMutedTrackCount: outcome.mutedTrackCount,
            microphoneDeviceLabel: outcome.deviceLabel,
            microphoneLoopbackSource: outcome.loopbackSource,
          });
        },
        onDataChannelState: (outcome) => {
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: outcome.initialAudioProbe === "requested"
              ? "initial_audio_probe_requested"
              : outcome.initialAudioProbe === "failed"
                ? "initial_audio_probe_failed"
                : outcome.state === "open"
                  ? "data_channel_opened"
                  : outcome.state === "closed"
                    ? "data_channel_closed"
                    : "data_channel_error",
            realtimeSessionId: response.realtime_session_id,
            detailCode: outcome.errorCode,
          });
          if (outcome.state === "open") {
            setVisualTransportRevision((current) => current + 1);
          }
        },
        onAudioState: (audioState) => {
          const projectedAudioState = audioState === "listening" && !microphoneEnabledRef.current
            ? "active"
            : audioState;
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: "audio_state_changed",
            realtimeSessionId: response.realtime_session_id,
            lifecycleState: projectedAudioState,
            detailCode: projectedAudioState,
          });
          setState((current) => current.realtimeSessionId === response.realtime_session_id
            ? current.error?.startsWith("remote_audio_")
              ? current
              : { ...current, lifecycleState: projectedAudioState }
            : current);
        },
        onRemoteAudioTrack: (outcome) => {
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: "remote_audio_track_attached",
            realtimeSessionId: response.realtime_session_id,
            remoteTrackSource: outcome.source,
            remoteAudioMuted: outcome.muted,
            audioFocusGranted: outcome.focusGranted,
          });
        },
        onRemoteAudioPlayback: (outcome) => {
          remoteAudioPlaybackFailure = outcome.errorCode;
          recordHelixAskLiveRuntimeClientDebugEvent({
            eventKind: outcome.status === "failed"
              ? "remote_audio_playback_failed"
              : "remote_audio_playback_started",
            realtimeSessionId: response.realtime_session_id,
            lifecycleState: outcome.status === "failed" ? "error" : "active",
            detailCode: outcome.errorCode,
            remoteAudioMuted: outcome.muted,
            audioFocusGranted: getAudioFocusSnapshot().active_kind === "helix_realtime",
          });
          setState((current) => {
            if (current.realtimeSessionId !== response.realtime_session_id) return current;
            if (outcome.status === "failed") {
              return {
                ...current,
                lifecycleState: "error",
                error: outcome.errorCode ?? "remote_audio_playback_failed",
              };
            }
            return {
              ...current,
              lifecycleState: current.lifecycleState === "error" ? "listening" : current.lifecycleState,
              error: null,
            };
          });
          const receipt = buildHelixAskLiveRuntimeClientReceiptPayload({
            receiptKind: outcome.status === "failed" ? "playback_failed" : "playback_started",
            realtimeSessionId: response.realtime_session_id,
            runtimeAgentMode: mode,
            runtimeAgentAuthority: input.authority,
            lifecycleState: outcome.status === "failed" ? "error" : "active",
            clientReceiptRef: `receipt:live-runtime:browser-audio:${crypto.randomUUID()}`,
            observedAtMs: Date.now(),
            errorCode: outcome.errorCode,
          });
          void postJson(receipt.route_path, {
            ...receipt,
            source_binding_ref: "browser:remote_audio",
            provider_event_type: "browser.remote_audio.play",
            audio_focus_owner: getAudioFocusSnapshot().active_kind,
            failure_code: outcome.errorCode,
            failure_reason: outcome.errorCode,
            browser_media_api_referenced: true,
            webrtc_started: true,
          }).catch(() => null);
        },
      });
      controllerRef.current = controller;
      sessionIdRef.current = response.realtime_session_id;
      const handoffPlan = buildHelixAskLiveRuntimeTransportHandoffPlan({
        consentReceipt,
        serverResponse: response,
      });
      setState((current) => ({
        ...current,
        transportState: "connecting",
        realtimeSessionId: response.realtime_session_id,
      }));
      const result = await controller.startTransport({ handoffPlan, serverResponse: response });
      runtimeContextRef.current.transportReceiptRef = result.receipt.client_receipt_ref;
      await postJson(
        `/api/agi/realtime/session/${encodeURIComponent(response.realtime_session_id)}/client-receipt`,
        {
          ...result.receipt,
          runtime_agent_mode: mode,
          runtime_agent_authority: input.authority,
          selected_model_or_service:
            mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1",
          provider_session_ref: response.provider_session_ref,
          audio_focus_owner: getAudioFocusSnapshot().active_kind,
          failure_code: result.ok ? null : result.blocked_reason,
          failure_reason: result.ok ? null : result.blocked_reason,
        },
      ).catch(() => null);
      if (!result.ok) throw new Error(result.blocked_reason);
      registerHelixAskLiveMediaBoundary({
        realtimeSessionId: response.realtime_session_id,
        controller,
      });
      recordHelixAskLiveRuntimeClientDebugEvent({
        eventKind: "transport_active",
        realtimeSessionId: response.realtime_session_id,
        lifecycleState: remoteAudioPlaybackFailure ? "error" : "active",
        transportState: "active",
        detailCode: remoteAudioPlaybackFailure,
      });
      setState({
        lifecycleState: remoteAudioPlaybackFailure ? "error" : "active",
        transportState: "active",
        realtimeSessionId: response.realtime_session_id,
        expiresAtMs: typeof response.admitted_session_expires_at_ms === "number"
          ? response.admitted_session_expires_at_ms : null,
        error: remoteAudioPlaybackFailure,
        active: true,
        workerRelayStatus: null,
        microphoneEnabled: false,
        visualInputEnabled: false,
        visualInputFrameCount: 0,
        visualInputProviderAcknowledgedFrameCount: 0,
        visualInputProviderImageConfirmedFrameCount: 0,
        visualInputLastDeliveryStatus: "none",
        visualInputError: null,
      });
      return !remoteAudioPlaybackFailure;
    } catch (error) {
      visualInputEnabledRef.current = false;
      const failureCode = error instanceof Error ? error.message : "realtime_session_start_failed";
      recordHelixAskLiveRuntimeClientDebugEvent({
        eventKind: "transport_failed",
        realtimeSessionId: sessionIdRef.current,
        lifecycleState: "error",
        transportState: "error",
        detailCode: failureCode,
      });
      const failedSessionId = sessionIdRef.current;
      unregisterHelixAskLiveMediaBoundary({
        realtimeSessionId: failedSessionId,
        controller: controllerRef.current,
      });
      await controllerRef.current?.stopTransport({
        realtimeSessionId: failedSessionId,
      }).catch(() => null);
      if (failedSessionId) {
        await postJson(`/api/agi/realtime/session/${encodeURIComponent(failedSessionId)}/stop`, {
          receipt_kind: "start_failed_cleanup",
          observed_at_ms: Date.now(),
        }).catch(() => null);
      }
      controllerRef.current = null;
      providerEventHandlerRef.current?.dispose();
      providerEventHandlerRef.current = null;
      sessionIdRef.current = null;
      runtimeContextRef.current = {
        transportReceiptRef: null,
        vadState: null,
        interruptionCount: 0,
      };
      setState({
        lifecycleState: "error",
        transportState: "error",
        realtimeSessionId: null,
        expiresAtMs: null,
        error: error instanceof Error ? error.message : "realtime_session_start_failed",
        active: false,
        workerRelayStatus: null,
        microphoneEnabled: false,
        visualInputEnabled: false,
        visualInputFrameCount: 0,
        visualInputProviderAcknowledgedFrameCount: 0,
        visualInputProviderImageConfirmedFrameCount: 0,
        visualInputLastDeliveryStatus: "none",
        visualInputError: null,
      });
      microphoneEnabledRef.current = false;
      return false;
    }
  }, [input.authority, input.enabled, input.mode, state.active, state.lifecycleState, state.realtimeSessionId, stop]);

  const renew = useCallback(async () => {
    if (!state.active || !state.realtimeSessionId || !state.expiresAtMs) return false;
    return start(true);
  }, [start, state.active, state.expiresAtMs, state.realtimeSessionId]);

  const setMicrophoneEnabled = useCallback((enabled: boolean): boolean => {
    const controller = controllerRef.current;
    const sessionId = sessionIdRef.current;
    if (!controller || !sessionId || !controller.setMicrophoneEnabled(enabled)) return false;
    microphoneEnabledRef.current = enabled;
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: enabled ? "microphone_enabled" : "microphone_disabled",
      realtimeSessionId: sessionId,
      lifecycleState: enabled ? "listening" : "active",
      detailCode: enabled ? "live_microphone_enabled" : "live_microphone_disabled",
    });
    setState((current) => ({
      ...current,
      microphoneEnabled: enabled,
      lifecycleState: enabled ? "listening" : "active",
    }));
    return true;
  }, []);

  const setVisualInputEnabled = useCallback((enabled: boolean): boolean => {
    if (enabled && (!controllerRef.current || !sessionIdRef.current)) return false;
    // Keep an imperative consent gate in sync so Vision Off closes the route in
    // the same turn, without waiting for the subscription effect to clean up.
    visualInputEnabledRef.current = enabled;
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: enabled ? "visual_input_enabled" : "visual_input_disabled",
      realtimeSessionId: sessionIdRef.current,
      detailCode: enabled ? "live_visual_input_enabled" : "live_visual_input_disabled",
    });
    setState((current) => ({
      ...current,
      visualInputEnabled: enabled,
      visualInputError: null,
    }));
    return true;
  }, []);

  const applyVisualFrameReceipt = useCallback((
    sessionId: string,
    receipt: ReturnType<HelixAskLiveRuntimeBrowserTransportController["sendVisualFrame"]>,
    routeKind: HelixAskRealtimeVisualFrameRouteKind,
  ): void => {
    visualFrameAcknowledgementTrackerRef.current.registerReceipt(receipt, routeKind);
    recordHelixAskLiveRuntimeVisualFrameReceipt(receipt, routeKind);
    setState((current) => current.realtimeSessionId !== sessionId
      ? current
      : receipt.ok
        ? {
            ...current,
            visualInputFrameCount: current.visualInputFrameCount + 1,
            visualInputLastDeliveryStatus: "transport_sent",
            visualInputError: null,
          }
        : {
            ...current,
            visualInputLastDeliveryStatus: "transport_error",
            visualInputError: receipt.code,
          });
  }, []);

  useEffect(() => registerHelixAskVisualFrameLivePromotionHandler((frame) => {
    const sessionId = sessionIdRef.current;
    const controller = controllerRef.current;
    if (!state.active || !sessionId || !controller) {
      return {
        ok: false,
        code: "live_runtime_unavailable",
        receipt: null,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    }
    if (!visualInputEnabledRef.current) {
      recordHelixAskLiveRuntimeClientDebugEvent({
        eventKind: "visual_frame_blocked",
        realtimeSessionId: sessionId,
        detailCode: "visual_input_consent_required",
      });
      return {
        ok: false,
        code: "visual_input_consent_required",
        receipt: null,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    }
    if (input.directVisualInputSuppressed === true) {
      stageSharedLiveRoomManualVisualFrame(frame);
      return {
        ok: true,
        code: "shared_room_visual_frame_queued",
        receipt: null,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    }
    const receipt = controller.sendVisualFrame(frame);
    applyVisualFrameReceipt(sessionId, receipt, "manual_promotion");
    return {
      ok: receipt.ok,
      code: receipt.code,
      receipt,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
    };
  }), [
    applyVisualFrameReceipt,
    input.directVisualInputSuppressed,
    state.active,
    state.realtimeSessionId,
  ]);

  useEffect(() => {
    const sessionId = state.realtimeSessionId;
    if (
      !state.active ||
      !state.visualInputEnabled ||
      !sessionId ||
      input.directVisualInputSuppressed === true
    ) return;
    let lastClientFrameId: string | null = null;
    const routeFrame = (frame: VisualFrameProducerClientFrame): void => {
      if (
        !visualInputEnabledRef.current ||
        !frame.liveRuntimeEligible ||
        frame.threadId !== "helix-ask:desktop" ||
        !isVisualFrameProducerSourceActive(frame.sourceId) ||
        frame.clientFrameId === lastClientFrameId
      ) {
        return;
      }
      const receipt = controllerRef.current?.sendVisualFrame({
        imageDataUrl: frame.dataUrl,
        sourceKind:
          frame.sourceSurface === "camera" || frame.sourceOrigin === "browser_getUserMedia"
            ? "camera"
            : "screen",
        sourceLabel:
          frame.sourceSurface === "camera" || frame.sourceOrigin === "browser_getUserMedia"
            ? "Device camera"
            : "Shared screen",
        detail:
          frame.sourceSurface === "camera" || frame.sourceOrigin === "browser_getUserMedia"
            ? "low"
            : "auto",
      });
      if (!receipt) return;
      if (receipt.ok) lastClientFrameId = frame.clientFrameId;
      applyVisualFrameReceipt(sessionId, receipt, "automatic_capture");
    };
    const unsubscribe = subscribeVisualFrameProducerFrames(routeFrame);
    const latestFrame = getLatestVisualFrameProducerFrame();
    if (
      latestFrame &&
      Date.now() - Date.parse(latestFrame.capturedAt) <= 30_000
    ) {
      routeFrame(latestFrame);
    }
    return unsubscribe;
  }, [
    applyVisualFrameReceipt,
    input.directVisualInputSuppressed,
    state.active,
    state.realtimeSessionId,
    state.visualInputEnabled,
    visualTransportRevision,
  ]);

  useEffect(() => {
    const sessionId = state.realtimeSessionId;
    if (!state.active || !sessionId) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/agi/realtime/session/${encodeURIComponent(sessionId)}/debug`,
        );
        if (!response.ok || disposed) return;
        const payload = await response.json() as {
          latest_grounded_relay?: { status?: unknown } | null;
        };
        if (!disposed) {
          recordHelixAskLiveRuntimeServerStagePlayDebug(payload);
          const workerRelayStatus = readWorkerRelayStatus(
            payload.latest_grounded_relay?.status,
          );
          setState((current) =>
            current.realtimeSessionId !== sessionId ||
            current.workerRelayStatus === workerRelayStatus
              ? current
              : { ...current, workerRelayStatus });
        }
      } catch {
        // Debug refresh is observational and must not affect the live transport.
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [state.active, state.realtimeSessionId]);

  useEffect(() => () => {
    visualInputEnabledRef.current = false;
    visualFrameAcknowledgementTrackerRef.current.reset();
    const controller = controllerRef.current;
    const sessionId = sessionIdRef.current;
    providerEventHandlerRef.current?.dispose();
    providerEventHandlerRef.current = null;
    controllerRef.current = null;
    sessionIdRef.current = null;
    unregisterHelixAskLiveMediaBoundary({ realtimeSessionId: sessionId, controller });
    microphoneEnabledRef.current = false;
    runtimeContextRef.current = {
      transportReceiptRef: null,
      vadState: null,
      interruptionCount: 0,
    };
    void controller?.stopTransport({ realtimeSessionId: sessionId });
    if (sessionId) {
      void postJson(`/api/agi/realtime/session/${encodeURIComponent(sessionId)}/stop`, {
        receipt_kind: "component_unmounted",
        observed_at_ms: Date.now(),
      }).catch(() => null);
    }
  }, []);

  return {
    ...state,
    start,
    renew,
    stop,
    setMicrophoneEnabled,
    setVisualInputEnabled,
  };
};
