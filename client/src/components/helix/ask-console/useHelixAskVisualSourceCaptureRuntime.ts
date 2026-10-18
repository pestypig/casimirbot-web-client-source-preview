import { useCallback, useEffect, useRef, useState } from "react";

import type { AskLiveEventEntry } from "@/lib/helix/ask-debug-event-display";
import { clipText } from "@/lib/helix/ask-value-normalization";
import type { DisplayAudioTranscriptChunk } from "@/lib/helix/display-audio-capture";
import {
  postAudioTranscriptLiveSourceDescriptor,
  postVisualLiveSourceDescriptor,
} from "@/lib/helix/liveSourceDescriptorClient";
import {
  adoptServerVisualProducerPolicies,
  getActiveVisualFrameStream,
  startVisualFrameProducerInterval,
  stopVisualFrameProducerInterval,
} from "@/lib/helix/visualFrameProducer";
import {
  attachVisualSourceAudioWithCancellation,
  requestVisualSourceMediaStream,
  stopVisualSourceMediaStream,
  type HelixVisualSourceRequestResult,
  type VisualSourceKind,
} from "@/lib/helix/visualSourceMedia";
import { sourceLabelForSituationSource } from "@/lib/helix/situation-room";
import {
  useSituationRoomStore,
  type SituationRoomSource,
} from "@/store/useSituationRoomStore";
import {
  readHelixAskVisualCaptureAudioPreference,
  syncHelixAskVisualCaptureRoutePreference,
} from "./HelixAskVisualCapturePreference";

const HELIX_ASK_THREAD_ID = "helix-ask:desktop";
const HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID = `audio_transcript:${HELIX_ASK_THREAD_ID}`;
const HELIX_ASK_DISPLAY_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};
export const HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS = 10_000;
export const HELIX_ASK_LIVE_VISUAL_CAPTURE_CADENCE_MS = 10_000;

export type HelixAskDisplayAudioStatus =
  | "idle"
  | "requesting"
  | "active"
  | "transcribing"
  | "error";

export type HelixAskVisualSituationSourceStatus =
  | "idle"
  | "requesting"
  | "active"
  | "error";

export type HelixAskVisualSourceCaptureRuntimeOptions = {
  situationRoomId: string;
  canUseCaptureControls: boolean;
  appendSyntheticLiveEvent: (entry: AskLiveEventEntry) => void;
  onOpenPanel?: (panelId: string) => void;
  onUserError: (message: string) => void;
};

export type HelixAskVisualSourceCaptureRuntime = {
  displayAudioStatus: HelixAskDisplayAudioStatus;
  displayAudioError: string | null;
  displayAudioCaptureLabel: string | null;
  displayAudioSourceSnapshot: SituationRoomSource | undefined;
  visualSituationSourceId: string | null;
  visualSituationSourceStatus: HelixAskVisualSituationSourceStatus;
  visualSituationSourceError: string | null;
  visualSituationSourceLabel: string | null;
  visualSituationEvidenceForTurn: Record<string, unknown> | null;
  visualSituationSourceKind: VisualSourceKind;
  visualSituationIncludeAudio: boolean;
  stopDisplayAudioCapture: () => void;
  toggleDisplayAudioCapture: () => void;
  handleVisualSituationSourceCapture: () => void;
  handleVisualSituationSourceKindToggle: () => void;
  handleVisualSituationAudioPreferenceToggle: () => void;
};

const postSituationJson = async (
  path: string,
  body?: Record<string, unknown>,
): Promise<any> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${path} failed with ${response.status}`);
  }
  return response.json().catch(() => null);
};

export function useHelixAskVisualSourceCaptureRuntime(
  options: HelixAskVisualSourceCaptureRuntimeOptions,
): HelixAskVisualSourceCaptureRuntime {
  const {
    situationRoomId,
    canUseCaptureControls,
    appendSyntheticLiveEvent,
    onOpenPanel,
    onUserError,
  } = options;
  const [displayAudioStatus, setDisplayAudioStatus] = useState<HelixAskDisplayAudioStatus>("idle");
  const [displayAudioError, setDisplayAudioError] = useState<string | null>(null);
  const [displayAudioCaptureLabel, setDisplayAudioCaptureLabel] = useState<string | null>(null);
  const [displayAudioSourceId, setDisplayAudioSourceIdState] = useState<string | null>(null);
  const displayAudioSourceIdRef = useRef<string | null>(null);
  const displayAudioTranscriptSourceIdRef = useRef<string | null>(null);
  const [visualSituationSourceId, setVisualSituationSourceIdState] = useState<string | null>(null);
  const [visualSituationSourceStatus, setVisualSituationSourceStatus] =
    useState<HelixAskVisualSituationSourceStatus>("idle");
  const [visualSituationSourceError, setVisualSituationSourceError] = useState<string | null>(null);
  const [visualSituationSourceLabel, setVisualSituationSourceLabel] = useState<string | null>(null);
  const [visualSituationEvidenceForTurn, setVisualSituationEvidenceForTurn] =
    useState<Record<string, unknown> | null>(null);
  const [visualSituationSourceKind, setVisualSituationSourceKind] =
    useState<VisualSourceKind>("screen");
  const [visualSituationIncludeAudio, setVisualSituationIncludeAudio] = useState<boolean>(() =>
    readHelixAskVisualCaptureAudioPreference(),
  );
  const visualSituationSourceIdRef = useRef<string | null>(null);
  const visualSituationStreamRef = useRef<MediaStream | null>(null);
  const visualSituationCaptureAbortRef = useRef<AbortController | null>(null);
  const visualSituationSourceKindRef = useRef<VisualSourceKind>(visualSituationSourceKind);
  visualSituationSourceKindRef.current = visualSituationSourceKind;
  const situationRoomSourcesById = useSituationRoomStore((state) => state.sources);

  const setDisplayAudioSourceId = useCallback((sourceId: string | null): void => {
    displayAudioSourceIdRef.current = sourceId;
    setDisplayAudioSourceIdState(sourceId);
  }, []);

  const setVisualSituationSourceId = useCallback((sourceId: string | null): void => {
    visualSituationSourceIdRef.current = sourceId;
    setVisualSituationSourceIdState(sourceId);
  }, []);

  const stopRegisteredHelixAskAudioTranscriptSource = useCallback(async (input: {
    sourceId?: string | null;
    roomId?: string | null;
    stream?: MediaStream | null;
  } = {}): Promise<void> => {
    const transcriptSourceId = input.sourceId?.trim() || HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID;
    await Promise.allSettled([
      postSituationJson("/api/agi/situation/audio-source/stop", {
        source_id: transcriptSourceId,
        thread_id: HELIX_ASK_THREAD_ID,
        room_id: input.roomId ?? null,
        ts: new Date().toISOString(),
      }),
      postAudioTranscriptLiveSourceDescriptor({
        postJson: postSituationJson,
        sourceId: transcriptSourceId,
        threadId: HELIX_ASK_THREAD_ID,
        currentState: "stopped",
        cadenceMs: HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS,
        stream: input.stream ?? null,
      }),
    ]);
  }, []);

  const stopDisplayAudioCapture = useCallback(() => {
    const sourceId = displayAudioSourceIdRef.current;
    const transcriptSourceId = displayAudioTranscriptSourceIdRef.current;
    if (sourceId) useSituationRoomStore.getState().stopSource(sourceId);
    setDisplayAudioSourceId(null);
    displayAudioTranscriptSourceIdRef.current = null;
    if (transcriptSourceId) {
      void stopRegisteredHelixAskAudioTranscriptSource({ sourceId: transcriptSourceId });
    }
    setDisplayAudioStatus("idle");
    setDisplayAudioCaptureLabel(null);
  }, [setDisplayAudioSourceId, stopRegisteredHelixAskAudioTranscriptSource]);

  const toggleDisplayAudioCapture = useCallback(() => {
    if (displayAudioSourceIdRef.current) {
      stopDisplayAudioCapture();
      return;
    }
    setDisplayAudioStatus("requesting");
    setDisplayAudioError(null);
    const situationStore = useSituationRoomStore.getState();
    const existingRoomId =
      situationStore.active_room_id && situationStore.rooms[situationStore.active_room_id]
        ? situationStore.active_room_id
        : null;
    const room = existingRoomId
      ? situationStore.rooms[existingRoomId]
      : situationStore.createRoom("Helix Ask Sources");
    if (room?.room_id) situationStore.setActiveRoom(room.room_id);
    void situationStore
      .attachDisplayAudioSource(room?.room_id ?? situationRoomId, "Helix Ask display audio", {
        chunkMs: HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS,
      })
      .then((source) => {
        if (!source || source.status === "error") {
          const message = source?.last_error ?? "Display audio capture failed.";
          setDisplayAudioStatus("error");
          setDisplayAudioError(message);
          appendSyntheticLiveEvent({
            id: `situation:error:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            tool: "situation_room",
            ts: new Date().toISOString(),
            text: `Display audio capture failed: ${clipText(message, 180)}`,
            meta: {
              room_id: room?.room_id ?? situationRoomId,
              source: "display_screen_audio",
              event_type: "capture_error",
            },
          });
          return;
        }
        setDisplayAudioSourceId(source.source_id);
        setDisplayAudioStatus("active");
        setDisplayAudioCaptureLabel(
          source.label || sourceLabelForSituationSource(source.capture_source),
        );
      })
      .catch((error) => {
        setDisplayAudioStatus("error");
        setDisplayAudioError(error instanceof Error ? error.message : String(error));
      });
  }, [
    appendSyntheticLiveEvent,
    setDisplayAudioSourceId,
    situationRoomId,
    stopDisplayAudioCapture,
  ]);

  const registerHelixAskAudioTranscriptSource = useCallback(async (input: {
    sourceId?: string | null;
    roomId?: string | null;
    stream?: MediaStream | null;
    signal?: AbortSignal;
  } = {}): Promise<void> => {
    if (input.signal?.aborted) throw new Error("visual_capture_cancelled");
    const transcriptSourceId = input.sourceId?.trim() || HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID;
    await postSituationJson("/api/agi/situation/audio-source/permission-granted", {
      source_id: transcriptSourceId,
      thread_id: HELIX_ASK_THREAD_ID,
      room_id: input.roomId ?? null,
      ts: new Date().toISOString(),
    });
    if (input.signal?.aborted) {
      await stopRegisteredHelixAskAudioTranscriptSource(input);
      throw new Error("visual_capture_cancelled");
    }
    await postAudioTranscriptLiveSourceDescriptor({
      postJson: postSituationJson,
      sourceId: transcriptSourceId,
      threadId: HELIX_ASK_THREAD_ID,
      currentState: "active_interval",
      cadenceMs: HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS,
      stream: input.stream ?? null,
    });
    if (input.signal?.aborted) {
      await stopRegisteredHelixAskAudioTranscriptSource(input);
      throw new Error("visual_capture_cancelled");
    }
  }, [stopRegisteredHelixAskAudioTranscriptSource]);

  const postHelixAskAudioTranscriptChunk = useCallback(async (
    chunk: DisplayAudioTranscriptChunk,
    sourceId: string = HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID,
  ): Promise<void> => {
    const transcript = chunk.event.text?.trim() ?? "";
    if (!transcript || displayAudioTranscriptSourceIdRef.current !== sourceId) return;
    const response = await postSituationJson("/api/agi/situation/audio-source/transcript-chunk", {
      source_id: sourceId,
      thread_id: HELIX_ASK_THREAD_ID,
      room_id: chunk.event.room_id ?? null,
      environment_id: chunk.environmentId ?? null,
      transcript,
      transcript_is_final: true,
      direct_address_classification: "unclassified",
      evidence_refs: chunk.event.evidence_refs,
      chunk_index: chunk.chunkIndex,
      capture_session_id: chunk.captureSessionId,
      capture_source: chunk.source,
      duration_ms: chunk.durationMs,
      from_ts: chunk.fromTs,
      to_ts: chunk.toTs,
      ts: chunk.toTs,
    });
    const latestObservationRefs = [
      response?.live_source_event?.event_id,
      response?.live_source_chunk?.chunk_id,
      response?.live_source_analysis_job?.job_id,
    ].filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
    if (displayAudioTranscriptSourceIdRef.current !== sourceId) {
      await stopRegisteredHelixAskAudioTranscriptSource({
        sourceId,
        roomId: chunk.event.room_id ?? null,
      });
      return;
    }
    await postAudioTranscriptLiveSourceDescriptor({
      postJson: postSituationJson,
      sourceId,
      threadId: HELIX_ASK_THREAD_ID,
      environmentId: chunk.environmentId ?? null,
      currentState: "active_interval",
      cadenceMs: HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS,
      latestObservationRefs,
    });
    if (displayAudioTranscriptSourceIdRef.current !== sourceId) {
      await stopRegisteredHelixAskAudioTranscriptSource({
        sourceId,
        roomId: chunk.event.room_id ?? null,
      });
    }
  }, [stopRegisteredHelixAskAudioTranscriptSource]);

  const stopRegisteredHelixAskVisualSource = useCallback((
    sourceId: string,
    kind: VisualSourceKind,
  ): void => {
    const sourceSurface = kind === "camera" ? "camera" : "screen";
    const sourceOrigin = kind === "camera" ? "browser_getUserMedia" : "browser_getDisplayMedia";
    stopVisualFrameProducerInterval(sourceId);
    void Promise.all([
      postSituationJson("/api/agi/situation/visual-source/stop", {
        source_id: sourceId,
        thread_id: HELIX_ASK_THREAD_ID,
      }),
      postSituationJson("/api/agi/situation/live-source/producer/heartbeat", {
        source_id: sourceId,
        thread_id: HELIX_ASK_THREAD_ID,
        client_stream_confirmed: false,
        status: "stopped",
        surface: sourceSurface,
        source_origin: sourceOrigin,
        ts: new Date().toISOString(),
      }),
      postVisualLiveSourceDescriptor({
        postJson: postSituationJson,
        sourceId,
        threadId: HELIX_ASK_THREAD_ID,
        currentState: "stopped",
        stream: null,
        surface: sourceSurface,
        sourceOrigin,
      }),
    ]).catch(() => null);
  }, []);

  const ensureHelixAskVisualSource = useCallback(async (
    kind: VisualSourceKind,
    signal?: AbortSignal,
  ): Promise<string> => {
    if (signal?.aborted) throw new Error("visual_capture_cancelled");
    if (visualSituationSourceIdRef.current) return visualSituationSourceIdRef.current;
    const response = await postSituationJson("/api/agi/situation/visual-source/start", {
      thread_id: HELIX_ASK_THREAD_ID,
      room_id: null,
      capture_mode: "interval",
      cadence_ms: HELIX_ASK_LIVE_VISUAL_CAPTURE_CADENCE_MS,
      source_surface: kind === "camera" ? "device_camera" : "screen_share_window",
      status: "permission_required",
      raw_image_storage_policy: "ephemeral",
    });
    const sourceId =
      typeof response?.source?.source_id === "string"
        ? response.source.source_id
        : typeof response?.receipt?.source?.source_id === "string"
          ? response.receipt.source.source_id
          : null;
    if (!sourceId) throw new Error("visual_source_registration_failed");
    if (signal?.aborted) {
      stopRegisteredHelixAskVisualSource(sourceId, kind);
      throw new Error("visual_capture_cancelled");
    }
    setVisualSituationSourceId(sourceId);
    setVisualSituationSourceLabel(kind === "camera" ? "Device camera" : "Visual screen capture");
    return sourceId;
  }, [setVisualSituationSourceId, stopRegisteredHelixAskVisualSource]);

  const requestHelixAskVisualFrame = useCallback(async (input: {
    kind: VisualSourceKind;
    includeAudio?: boolean;
    signal?: AbortSignal;
  }): Promise<{ summary: string; visualEvidence: Record<string, unknown> | null }> => {
    let sourceId: string | null = null;
    const existingSourceId = visualSituationSourceIdRef.current;
    let stream: MediaStream | null = existingSourceId
      ? getActiveVisualFrameStream(existingSourceId)
      : null;
    let ownsStream = false;
    let pendingMediaRequest: Promise<HelixVisualSourceRequestResult> | null = null;
    let sourceSurface: "screen" | "window" | "browser_tab" | "camera" =
      input.kind === "camera" ? "camera" : "screen";
    let sourceOrigin: "browser_getDisplayMedia" | "browser_getUserMedia" =
      input.kind === "camera" ? "browser_getUserMedia" : "browser_getDisplayMedia";
    const includeDisplayAudio = input.kind === "screen" && input.includeAudio === true;
    const hasLiveDisplayAudio = Boolean(
      stream?.getAudioTracks().some((track) => track.readyState !== "ended"),
    );
    const existingStreamNeedsAudioUpgrade = Boolean(
      stream && includeDisplayAudio && !hasLiveDisplayAudio,
    );
    try {
      // Begin the browser permission request while the originating click still owns
      // transient user activation. Awaiting source registration first makes
      // getDisplayMedia/getUserMedia browser-dependent and intermittently blocked.
      if (!stream || existingStreamNeedsAudioUpgrade) {
        pendingMediaRequest = requestVisualSourceMediaStream({
          kind: input.kind,
          includeDisplayAudio,
          displayAudioConstraints: HELIX_ASK_DISPLAY_AUDIO_CONSTRAINTS,
          cameraFacingMode: "user",
        });
      }
      sourceId = await ensureHelixAskVisualSource(input.kind, input.signal);
      if (input.signal?.aborted) throw new Error("visual_capture_cancelled");
      if (pendingMediaRequest) {
        const supersededStream = stream;
        const visualSource = await pendingMediaRequest;
        if (!visualSource.ok) {
          throw new Error(`${visualSource.errorCode}: ${visualSource.message}`);
        }
        if (input.signal?.aborted) {
          stopVisualSourceMediaStream(visualSource.stream);
          throw new Error("visual_capture_cancelled");
        }
        stream = visualSource.stream;
        ownsStream = true;
        sourceSurface = visualSource.surface;
        sourceOrigin = visualSource.sourceOrigin;
        visualSituationStreamRef.current = stream;
        if (existingStreamNeedsAudioUpgrade) {
          supersededStream?.getTracks().forEach((track) => track.stop());
        }
      }
      visualSituationStreamRef.current = stream;
      const observedStream = stream;
      const observedTrack = stream.getVideoTracks()[0] ?? stream.getTracks()[0] ?? null;
      observedTrack?.addEventListener("ended", () => {
        if (visualSituationStreamRef.current !== observedStream) return;
        visualSituationCaptureAbortRef.current?.abort();
        visualSituationCaptureAbortRef.current = null;
        stopVisualSourceMediaStream(observedStream);
        visualSituationStreamRef.current = null;
        if (visualSituationSourceIdRef.current === sourceId) {
          setVisualSituationSourceId(null);
          stopRegisteredHelixAskVisualSource(sourceId, input.kind);
          setVisualSituationSourceStatus("idle");
          setVisualSituationSourceLabel(null);
          setVisualSituationEvidenceForTurn(null);
          stopDisplayAudioCapture();
        }
      }, { once: true });
      const result = await startVisualFrameProducerInterval({
        sourceId,
        threadId: HELIX_ASK_THREAD_ID,
        roomId: null,
        stream,
        postJson: postSituationJson,
        cadenceMs: HELIX_ASK_LIVE_VISUAL_CAPTURE_CADENCE_MS,
        preserveExistingStream: !ownsStream,
        sourceSurface,
        sourceOrigin,
        liveRuntimeEligible: true,
        signal: input.signal,
      });
      if (input.signal?.aborted) throw new Error("visual_capture_cancelled");
      const liveTrack = stream.getVideoTracks()[0] ?? stream.getTracks()[0] ?? null;
      if (!liveTrack || liveTrack.readyState === "ended") {
        throw new Error("visual_capture_track_ended");
      }
      if (includeDisplayAudio) {
        if (stream.getAudioTracks().some((track) => track.readyState !== "ended")) {
          const situationStore = useSituationRoomStore.getState();
          const existingRoomId =
            situationStore.active_room_id && situationStore.rooms[situationStore.active_room_id]
              ? situationStore.active_room_id
              : null;
          const room = existingRoomId
            ? situationStore.rooms[existingRoomId]
            : situationStore.createRoom("Helix Ask Sources");
          if (room?.room_id) situationStore.setActiveRoom(room.room_id);
          if (displayAudioSourceIdRef.current || displayAudioTranscriptSourceIdRef.current) {
            stopDisplayAudioCapture();
          }
          setDisplayAudioStatus("requesting");
          setDisplayAudioError(null);
          const audioRoomId = room?.room_id ?? situationRoomId;
          const audioTranscriptSourceId =
            `${HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID}:${crypto.randomUUID()}`;
          displayAudioTranscriptSourceIdRef.current = audioTranscriptSourceId;
          const audioSource = await attachVisualSourceAudioWithCancellation({
            signal: input.signal,
            register: () => registerHelixAskAudioTranscriptSource({
              sourceId: audioTranscriptSourceId,
              roomId: audioRoomId,
              stream,
              signal: input.signal,
            }),
            attach: () => situationStore.attachDisplayAudioSource(
              audioRoomId,
              "Helix Ask shared tab audio",
              {
                stream,
                stopStreamOnStop: false,
                chunkMs: HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS,
                onTranscriptChunk: (chunk) => postHelixAskAudioTranscriptChunk(
                  chunk,
                  audioTranscriptSourceId,
                ),
              },
            ),
            stopRegistered: () => stopRegisteredHelixAskAudioTranscriptSource({
              sourceId: audioTranscriptSourceId,
              roomId: audioRoomId,
              stream,
            }),
            stopAttached: (lateSource) => {
              if (lateSource?.source_id) situationStore.stopSource(lateSource.source_id);
            },
          });
          if (!audioSource || audioSource.status === "error") {
            if (audioSource?.source_id) situationStore.stopSource(audioSource.source_id);
            await stopRegisteredHelixAskAudioTranscriptSource({
              sourceId: audioTranscriptSourceId,
              roomId: audioRoomId,
              stream,
            });
            if (displayAudioTranscriptSourceIdRef.current === audioTranscriptSourceId) {
              displayAudioTranscriptSourceIdRef.current = null;
            }
            const message = audioSource?.last_error ?? "Display audio capture failed.";
            setDisplayAudioStatus("error");
            setDisplayAudioError(message);
          } else {
            setDisplayAudioSourceId(audioSource.source_id);
            setDisplayAudioStatus("active");
            setDisplayAudioCaptureLabel(
              audioSource.label || sourceLabelForSituationSource(audioSource.capture_source),
            );
          }
        } else {
          setDisplayAudioStatus("error");
          setDisplayAudioError(
            "Selected visual share did not include tab audio. Share a Chrome tab and enable tab audio.",
          );
        }
      }
      stream = null;
      return {
        summary: result.summary,
        visualEvidence: result.evidence
          ? {
              evidence: result.evidence,
              source: {
                source_id: sourceId,
                source_family: "visual_snapshot",
                source_surface: sourceSurface,
                source_origin: sourceOrigin,
                raw_image_included: false,
                assistant_answer: false,
                context_policy: "compact_context_pack_only",
              },
            }
          : null,
      };
    } catch (error) {
      if (pendingMediaRequest && !ownsStream) {
        const abandonedRequest = await pendingMediaRequest.catch(() => null);
        if (abandonedRequest?.ok) stopVisualSourceMediaStream(abandonedRequest.stream);
      }
      if (sourceId && input.signal?.aborted) {
        stopRegisteredHelixAskVisualSource(sourceId, input.kind);
      }
      throw error;
    } finally {
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
    }
  }, [
    ensureHelixAskVisualSource,
    postHelixAskAudioTranscriptChunk,
    registerHelixAskAudioTranscriptSource,
    setDisplayAudioSourceId,
    situationRoomId,
    stopDisplayAudioCapture,
    stopRegisteredHelixAskAudioTranscriptSource,
    stopRegisteredHelixAskVisualSource,
    setVisualSituationSourceId,
  ]);

  const releaseVisualSituationCapture = useCallback((kind: VisualSourceKind): void => {
    visualSituationCaptureAbortRef.current?.abort();
    visualSituationCaptureAbortRef.current = null;
    const sourceId = visualSituationSourceIdRef.current;
    const stream = visualSituationStreamRef.current;
    if (sourceId) stopRegisteredHelixAskVisualSource(sourceId, kind);
    stopVisualSourceMediaStream(stream);
    stopDisplayAudioCapture();
    setVisualSituationSourceId(null);
    visualSituationStreamRef.current = null;
    setVisualSituationSourceStatus("idle");
    setVisualSituationSourceError(null);
    setVisualSituationSourceLabel(null);
    setVisualSituationEvidenceForTurn(null);
  }, [
    setVisualSituationSourceId,
    stopDisplayAudioCapture,
    stopRegisteredHelixAskVisualSource,
  ]);

  useEffect(() => {
    if (
      canUseCaptureControls ||
      (visualSituationSourceStatus !== "active" && visualSituationSourceStatus !== "requesting")
    ) return;
    releaseVisualSituationCapture(visualSituationSourceKind);
  }, [
    canUseCaptureControls,
    releaseVisualSituationCapture,
    visualSituationSourceKind,
    visualSituationSourceStatus,
  ]);

  const handleVisualSituationSourceCapture = useCallback(() => {
    if (!canUseCaptureControls) {
      onUserError("Visual capture is not available for this account.");
      return;
    }
    if (visualSituationSourceStatus === "active" || visualSituationSourceStatus === "requesting") {
      const cancelledRequest = visualSituationSourceStatus === "requesting";
      releaseVisualSituationCapture(visualSituationSourceKind);
      appendSyntheticLiveEvent({
        id: `situation:visual:disabled:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        tool: "situation_room",
        ts: new Date().toISOString(),
        text: cancelledRequest
          ? `${visualSituationSourceKind === "camera" ? "Camera" : "Screen"} sharing request cancelled.`
          : `${visualSituationSourceKind === "camera" ? "Camera" : "Screen"} sharing detached from Helix Ask context.`,
        meta: {
          room_id: situationRoomId,
          source: visualSituationSourceKind === "camera" ? "device_camera" : "visual_screen_capture",
          event_type: cancelledRequest ? "visual_source_request_cancelled" : "visual_source_detached",
          assistant_answer: false,
          raw_content_included: false,
        },
      });
      return;
    }
    if (visualSituationSourceStatus === "error") {
      releaseVisualSituationCapture(visualSituationSourceKind);
    }
    const captureController = new AbortController();
    visualSituationCaptureAbortRef.current?.abort();
    visualSituationCaptureAbortRef.current = captureController;
    syncHelixAskVisualCaptureRoutePreference(visualSituationIncludeAudio);
    onOpenPanel?.("live-answer-environment");
    setDisplayAudioError(null);
    setDisplayAudioStatus((current) => current === "error" ? "idle" : current);
    setVisualSituationSourceStatus("requesting");
    setVisualSituationSourceError(null);
    setVisualSituationSourceLabel(
      visualSituationSourceKind === "camera" ? "Device camera" : "Visual screen capture",
    );
    void requestHelixAskVisualFrame({
      kind: visualSituationSourceKind,
      includeAudio: visualSituationSourceKind === "screen" && visualSituationIncludeAudio,
      signal: captureController.signal,
    })
      .then(({ summary, visualEvidence }) => {
        if (
          captureController.signal.aborted ||
          visualSituationCaptureAbortRef.current !== captureController
        ) return;
        setVisualSituationEvidenceForTurn(visualEvidence);
        setVisualSituationSourceStatus("active");
        appendSyntheticLiveEvent({
          id: `situation:visual:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          tool: "situation_room",
          ts: new Date().toISOString(),
          text: summary,
          meta: {
            room_id: situationRoomId,
            source: visualSituationSourceKind === "camera" ? "device_camera" : "visual_screen_capture",
            event_type: "visual_frame_captured",
            raw_image_included: false,
            assistant_answer: false,
          },
        });
      })
      .catch((error) => {
        if (
          captureController.signal.aborted ||
          visualSituationCaptureAbortRef.current !== captureController
        ) return;
        visualSituationCaptureAbortRef.current = null;
        const sourceId = visualSituationSourceIdRef.current;
        if (sourceId) stopRegisteredHelixAskVisualSource(sourceId, visualSituationSourceKind);
        stopVisualSourceMediaStream(visualSituationStreamRef.current);
        stopDisplayAudioCapture();
        setVisualSituationSourceId(null);
        visualSituationStreamRef.current = null;
        setVisualSituationSourceStatus("error");
        setVisualSituationSourceError(error instanceof Error ? error.message : String(error));
      });
  }, [
    appendSyntheticLiveEvent,
    canUseCaptureControls,
    onOpenPanel,
    onUserError,
    releaseVisualSituationCapture,
    requestHelixAskVisualFrame,
    setVisualSituationSourceId,
    situationRoomId,
    stopDisplayAudioCapture,
    stopRegisteredHelixAskVisualSource,
    visualSituationIncludeAudio,
    visualSituationSourceKind,
    visualSituationSourceStatus,
  ]);

  const handleVisualSituationSourceKindToggle = useCallback(() => {
    if (visualSituationSourceStatus === "active" || visualSituationSourceStatus === "requesting") return;
    releaseVisualSituationCapture(visualSituationSourceKind);
    const nextKind: VisualSourceKind = visualSituationSourceKind === "screen" ? "camera" : "screen";
    setVisualSituationSourceKind(nextKind);
    if (nextKind === "camera" && visualSituationIncludeAudio) {
      setVisualSituationIncludeAudio(false);
      syncHelixAskVisualCaptureRoutePreference(false);
    }
  }, [
    releaseVisualSituationCapture,
    visualSituationIncludeAudio,
    visualSituationSourceKind,
    visualSituationSourceStatus,
  ]);

  const handleVisualSituationAudioPreferenceToggle = useCallback(() => {
    if (!canUseCaptureControls) {
      onUserError("Tab audio for visual capture is not available for this account.");
      return;
    }
    if (visualSituationSourceKind !== "screen") return;
    const next = !visualSituationIncludeAudio;
    setVisualSituationIncludeAudio(next);
    syncHelixAskVisualCaptureRoutePreference(next);
    if (!next) {
      stopDisplayAudioCapture();
      for (const track of visualSituationStreamRef.current?.getAudioTracks() ?? []) {
        try {
          track.stop();
        } catch {
          // Keep stopping remaining tracks after a browser-specific failure.
        }
      }
      return;
    }
    if (visualSituationSourceStatus !== "active") return;
    setDisplayAudioError(null);
    setDisplayAudioStatus((current) => current === "error" ? "idle" : current);
    setVisualSituationSourceStatus("requesting");
    setVisualSituationSourceError(null);
    const captureController = new AbortController();
    visualSituationCaptureAbortRef.current?.abort();
    visualSituationCaptureAbortRef.current = captureController;
    void requestHelixAskVisualFrame({
      kind: "screen",
      includeAudio: true,
      signal: captureController.signal,
    })
      .then(({ summary, visualEvidence }) => {
        if (
          captureController.signal.aborted ||
          visualSituationCaptureAbortRef.current !== captureController
        ) return;
        setVisualSituationEvidenceForTurn(visualEvidence);
        setVisualSituationSourceStatus("active");
        appendSyntheticLiveEvent({
          id: `situation:visual-audio:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          tool: "situation_room",
          ts: new Date().toISOString(),
          text: summary,
          meta: {
            room_id: situationRoomId,
            source: "visual_screen_capture",
            event_type: "visual_frame_audio_enabled",
            raw_image_included: false,
            assistant_answer: false,
          },
        });
      })
      .catch((error) => {
        if (
          captureController.signal.aborted ||
          visualSituationCaptureAbortRef.current !== captureController
        ) return;
        releaseVisualSituationCapture("screen");
        setVisualSituationSourceStatus("error");
        setVisualSituationSourceError(error instanceof Error ? error.message : String(error));
      });
  }, [
    appendSyntheticLiveEvent,
    canUseCaptureControls,
    onUserError,
    releaseVisualSituationCapture,
    requestHelixAskVisualFrame,
    situationRoomId,
    stopDisplayAudioCapture,
    visualSituationIncludeAudio,
    visualSituationSourceKind,
    visualSituationSourceStatus,
  ]);

  useEffect(() => {
    if (visualSituationSourceStatus !== "active") return;
    let cancelled = false;
    const adopt = async () => {
      try {
        await adoptServerVisualProducerPolicies({
          threadId: HELIX_ASK_THREAD_ID,
          roomId: null,
          postJson: postSituationJson,
        });
      } catch {
        if (cancelled) return;
      }
    };
    void adopt();
    const interval = window.setInterval(() => void adopt(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [visualSituationSourceStatus]);

  useEffect(() => stopDisplayAudioCapture, [stopDisplayAudioCapture]);

  useEffect(() => () => {
    visualSituationCaptureAbortRef.current?.abort();
    visualSituationCaptureAbortRef.current = null;
    const sourceId = visualSituationSourceIdRef.current;
    if (sourceId) {
      stopRegisteredHelixAskVisualSource(sourceId, visualSituationSourceKindRef.current);
    }
    stopVisualSourceMediaStream(visualSituationStreamRef.current);
    visualSituationSourceIdRef.current = null;
    visualSituationStreamRef.current = null;
  }, [stopRegisteredHelixAskVisualSource]);

  const displayAudioSourceSnapshot = displayAudioSourceId
    ? situationRoomSourcesById[displayAudioSourceId]
    : undefined;

  return {
    displayAudioStatus,
    displayAudioError,
    displayAudioCaptureLabel,
    displayAudioSourceSnapshot,
    visualSituationSourceId,
    visualSituationSourceStatus,
    visualSituationSourceError,
    visualSituationSourceLabel,
    visualSituationEvidenceForTurn,
    visualSituationSourceKind,
    visualSituationIncludeAudio,
    stopDisplayAudioCapture,
    toggleDisplayAudioCapture,
    handleVisualSituationSourceCapture,
    handleVisualSituationSourceKindToggle,
    handleVisualSituationAudioPreferenceToggle,
  };
}
