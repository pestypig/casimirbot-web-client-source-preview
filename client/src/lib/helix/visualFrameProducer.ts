import {
  useVisualSourceCaptureStore,
  type VisualSourceCaptureFrameHistoryItem,
} from "@/store/useVisualSourceCaptureStore";
import { postVisualLiveSourceDescriptor } from "@/lib/helix/liveSourceDescriptorClient";

type PostJson = (path: string, body?: Record<string, unknown>) => Promise<any>;

export type VisualFrameProducerResult = {
  source_id: string;
  frame_id: string | null;
  evidence_id: string | null;
  summary: string;
  evidence: Record<string, unknown> | null;
  /** Client-memory-only frame data. Never include this object in evidence or debug payloads. */
  client_frame: VisualFrameProducerClientFrame | null;
  warnings: VisualFrameProducerWarning[];
};

export type VisualFrameProducerClientFrame = Readonly<{
  clientFrameId: string;
  sourceId: string;
  threadId: string;
  capturedAt: string;
  previewHash: string;
  mimeType: "image/jpeg";
  dataUrl: string;
  sourceSurface: VisualFrameProducerSourceSurface;
  sourceOrigin: VisualFrameProducerSourceOrigin;
  liveRuntimeEligible: boolean;
}>;

export type VisualFrameProducerWarning = Readonly<{
  code: "visual_frame_sink_callback_failed";
  message: "One or more visual frame sink callbacks failed; evidence capture continued.";
  sourceId: string;
  clientFrameId: string;
  failedSinkCount: number;
}>;

export type VisualFrameProducerFrameListener = (
  frame: VisualFrameProducerClientFrame,
) => void | Promise<void>;

export type VisualFrameProducerWarningListener = (
  warning: VisualFrameProducerWarning,
) => void | Promise<void>;

export type VisualFrameProducerSourceSurface =
  | "screen"
  | "window"
  | "browser_tab"
  | "camera"
  | "document"
  | "game"
  | "app"
  | "terminal"
  | "file_manager"
  | "calculator"
  | "simulation"
  | "unknown";

export type VisualFrameProducerSourceOrigin =
  | "browser_getDisplayMedia"
  | "browser_getUserMedia";

type VisualCaptureMode = "manual" | "interval" | "salience_triggered";

type VisualProducerIntervalOptions = {
  sourceId: string;
  threadId: string;
  roomId?: string | null;
  stream: MediaStream;
  postJson: PostJson;
  prompt?: string;
  environmentId?: string | null;
  pipelineId?: string | null;
  cadenceMs?: number | null;
  preserveExistingStream?: boolean;
  onFrame?: VisualFrameProducerFrameListener;
  onWarning?: VisualFrameProducerWarningListener;
  sourceSurface?: VisualFrameProducerSourceSurface;
  sourceOrigin?: VisualFrameProducerSourceOrigin;
  liveRuntimeEligible?: boolean;
  signal?: AbortSignal;
};

const activeIntervals = new Map<string, number>();
const activeStreams = new Map<string, MediaStream>();
const activeStreamMetadata = new Map<string, Readonly<{
  sourceSurface: VisualFrameProducerSourceSurface;
  sourceOrigin: VisualFrameProducerSourceOrigin;
  liveRuntimeEligible: boolean;
}>>();
const activeCaptureLocks = new Set<string>();
const captureGenerations = new Map<string, number>();
const observedTrackSources = new WeakMap<MediaStreamTrack, Set<string>>();
const visualFrameProducerFrameListeners = new Set<VisualFrameProducerFrameListener>();
let latestVisualFrameProducerFrame: VisualFrameProducerClientFrame | null = null;
const visualFrameHistoryLimit = 20;
const visualFrameHistoryTtlMs = 10 * 60 * 1000;
const visualFramePreviewExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const visualFrameReadyTimeoutMs = 5_000;

const visualCaptureCancelledError = (): Error => new Error("visual_capture_cancelled");

const assertVisualCaptureCurrent = (input: {
  sourceId: string;
  generation: number;
  signal?: AbortSignal;
}): void => {
  if (input.signal?.aborted || captureGenerations.get(input.sourceId) !== input.generation) {
    throw visualCaptureCancelledError();
  }
};

const beginVisualCaptureGeneration = (sourceId: string): number => {
  const generation = (captureGenerations.get(sourceId) ?? 0) + 1;
  captureGenerations.set(sourceId, generation);
  return generation;
};

const invalidateVisualCaptureGeneration = (sourceId: string): void => {
  captureGenerations.set(sourceId, (captureGenerations.get(sourceId) ?? 0) + 1);
};

const clearLatestVisualFrameForSource = (sourceId: string): void => {
  if (latestVisualFrameProducerFrame?.sourceId === sourceId) {
    latestVisualFrameProducerFrame = null;
  }
};

const scheduleVisualFramePreviewExpiry = (sourceId: string): void => {
  const priorTimer = visualFramePreviewExpiryTimers.get(sourceId);
  if (priorTimer) clearTimeout(priorTimer);
  visualFramePreviewExpiryTimers.delete(sourceId);

  const state = useVisualSourceCaptureStore.getState().producers[sourceId];
  const history = state?.frame_history ?? [];
  if (history.length === 0) return;
  const nextExpiryMs = Math.min(...history.map((item) => Date.parse(item.expires_at)));
  if (!Number.isFinite(nextExpiryMs)) return;
  const timer = setTimeout(() => {
    visualFramePreviewExpiryTimers.delete(sourceId);
    const current = useVisualSourceCaptureStore.getState().producers[sourceId];
    if (!current) return;
    const retainedHistory = pruneVisualFrameHistory(current.frame_history ?? [], Date.now());
    const latestRetained = retainedHistory.at(-1) ?? null;
    useVisualSourceCaptureStore.getState().patchProducer(sourceId, {
      frame_history: retainedHistory,
      last_frame_preview_data_url: latestRetained?.preview_data_url ?? null,
    });
    if (retainedHistory.length > 0) scheduleVisualFramePreviewExpiry(sourceId);
  }, Math.max(0, nextExpiryMs - Date.now()) + 1);
  visualFramePreviewExpiryTimers.set(sourceId, timer);
};

export function subscribeVisualFrameProducerFrames(
  listener: VisualFrameProducerFrameListener,
): () => void {
  visualFrameProducerFrameListeners.add(listener);
  return () => {
    visualFrameProducerFrameListeners.delete(listener);
  };
}

export function getLatestVisualFrameProducerFrame(): VisualFrameProducerClientFrame | null {
  if (latestVisualFrameProducerFrame) {
    const capturedAtMs = Date.parse(latestVisualFrameProducerFrame.capturedAt);
    if (!Number.isFinite(capturedAtMs) || Date.now() - capturedAtMs >= visualFrameHistoryTtlMs) {
      latestVisualFrameProducerFrame = null;
    }
  }
  return latestVisualFrameProducerFrame;
}

export function isVisualFrameProducerSourceActive(sourceId: string): boolean {
  const track = getLiveTrack(activeStreams.get(sourceId));
  const state = useVisualSourceCaptureStore.getState().producers[sourceId];
  if (!track || !state?.stream_active) return false;
  if (state.capture_mode !== "interval") return true;
  return state.interval_active &&
    state.scheduler_adoption_status !== "paused" &&
    state.scheduler_adoption_status !== "stopped" &&
    state.scheduler_adoption_status !== "error";
}

const notifyVisualFrameProducerSinks = async (input: {
  frame: VisualFrameProducerClientFrame;
  onFrame?: VisualFrameProducerFrameListener;
  onWarning?: VisualFrameProducerWarningListener;
}): Promise<VisualFrameProducerWarning[]> => {
  const listeners: VisualFrameProducerFrameListener[] = [
    ...visualFrameProducerFrameListeners,
  ];
  if (input.onFrame) listeners.push(input.onFrame);
  if (listeners.length === 0) return [];

  const outcomes = await Promise.allSettled(
    listeners.map((listener: VisualFrameProducerFrameListener) =>
      Promise.resolve().then(() => listener(input.frame))),
  );
  const failedSinkCount = outcomes.filter(
    (outcome: PromiseSettledResult<void>) => outcome.status === "rejected",
  ).length;
  if (failedSinkCount === 0) return [];

  const warning: VisualFrameProducerWarning = Object.freeze({
    code: "visual_frame_sink_callback_failed",
    message: "One or more visual frame sink callbacks failed; evidence capture continued.",
    sourceId: input.frame.sourceId,
    clientFrameId: input.frame.clientFrameId,
    failedSinkCount,
  });
  if (input.onWarning) {
    await Promise.resolve()
      .then(() => input.onWarning?.(warning))
      .catch(() => undefined);
  }
  return [warning];
};

const readEvidenceString = (evidence: Record<string, unknown> | null | undefined, key: string): string | null => {
  const value = evidence?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const pruneVisualFrameHistory = (
  history: VisualSourceCaptureFrameHistoryItem[],
  nowMs: number,
): VisualSourceCaptureFrameHistoryItem[] =>
  history
    .filter((item: VisualSourceCaptureFrameHistoryItem) => Date.parse(item.expires_at) > nowMs)
    .slice(-visualFrameHistoryLimit);

type ServerVisualProducer = {
  producer_id?: string;
  source_id?: string;
  thread_id?: string;
  modality?: string;
  environment_id?: string | null;
  pipeline_id?: string | null;
  capture_mode?: string;
  cadence_ms?: number | null;
  status?: string;
  action_request_id?: string | null;
};

const clampVisualCadenceMs = (value?: number | null): number =>
  Math.max(5_000, Math.min(120_000, Math.round(value ?? 15_000)));

const getLiveTrack = (stream?: MediaStream | null): MediaStreamTrack | null => {
  const track = stream?.getVideoTracks()[0] ?? stream?.getTracks()[0] ?? null;
  return track && track.readyState !== "ended" ? track : null;
};

export function getActiveVisualFrameStream(sourceId?: string | null): MediaStream | null {
  if (!sourceId) return null;
  const stream = activeStreams.get(sourceId) ?? null;
  return getLiveTrack(stream) ? stream : null;
}

export function getLatestActiveVisualFrameStream(threadId?: string | null): { sourceId: string; stream: MediaStream } | null {
  const states = useVisualSourceCaptureStore.getState().producers;
  const candidates = Object.values(states)
    .filter((state: { thread_id: string; stream_active: boolean; track_ready_state: string }) =>
      (!threadId || state.thread_id === threadId) && state.stream_active && state.track_ready_state !== "ended")
    .sort((a: { last_heartbeat_at?: string | null; last_frame_at?: string | null }, b: { last_heartbeat_at?: string | null; last_frame_at?: string | null }) =>
      Date.parse(b.last_heartbeat_at ?? b.last_frame_at ?? "0") - Date.parse(a.last_heartbeat_at ?? a.last_frame_at ?? "0"));
  for (const candidate of candidates) {
    const stream = getActiveVisualFrameStream(candidate.source_id);
    if (stream) return { sourceId: candidate.source_id, stream };
  }
  for (const [sourceId, stream] of activeStreams.entries()) {
    if (getLiveTrack(stream)) return { sourceId, stream };
  }
  return null;
}

const hashFramePreview = async (dataUrl: string): Promise<string> => {
  const bytes = new TextEncoder().encode(dataUrl.slice(0, 4096));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((byte: number) => byte.toString(16).padStart(2, "0")).join("");
};

const waitForVideoReady = async (
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<void> => {
  if (video.videoWidth > 0 && video.videoHeight > 0) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      video.onloadedmetadata = null;
      video.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const onAbort = (): void => finish(visualCaptureCancelledError());
    const timeout = setTimeout(
      () => finish(new Error("visual_capture_video_not_ready")),
      visualFrameReadyTimeoutMs,
    );
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish(new Error("visual_capture_video_not_ready"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
};

export async function captureFrameDataUrlFromStream(
  stream: MediaStream,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  if (options.signal?.aborted) throw visualCaptureCancelledError();
  if (!getLiveTrack(stream)) throw new Error("visual_capture_track_ended");
  const video = document.createElement("video");
  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (options.signal?.aborted) throw visualCaptureCancelledError();
    await waitForVideoReady(video, options.signal);
    if (!getLiveTrack(stream)) throw new Error("visual_capture_track_ended");
    const maxWidth = 1280;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("screen_capture_canvas_unavailable");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    try {
      video.pause();
    } catch {
      // Browser-specific media teardown must not mask the capture outcome.
    }
    video.srcObject = null;
  }
}

export async function runVisualFrameProducerOnce(input: {
  sourceId: string;
  threadId: string;
  roomId?: string | null;
  stream: MediaStream;
  postJson: PostJson;
  prompt?: string;
  environmentId?: string | null;
  pipelineId?: string | null;
  producerId?: string | null;
  captureMode?: VisualCaptureMode;
  cadenceMs?: number | null;
  alignWithEvents?: boolean;
  onFrame?: VisualFrameProducerFrameListener;
  onWarning?: VisualFrameProducerWarningListener;
  sourceSurface?: VisualFrameProducerSourceSurface;
  sourceOrigin?: VisualFrameProducerSourceOrigin;
  liveRuntimeEligible?: boolean;
  signal?: AbortSignal;
  captureGeneration?: number;
}): Promise<VisualFrameProducerResult> {
  const captureGeneration = input.captureGeneration ?? (
    captureGenerations.get(input.sourceId) ?? beginVisualCaptureGeneration(input.sourceId)
  );
  assertVisualCaptureCurrent({
    sourceId: input.sourceId,
    generation: captureGeneration,
    signal: input.signal,
  });
  const now = new Date().toISOString();
  const firstTrack = getLiveTrack(input.stream);
  if (!firstTrack) throw new Error("visual_capture_track_ended");
  const captureMode = input.captureMode ?? "manual";
  activeStreams.set(input.sourceId, input.stream);
  activeStreamMetadata.set(input.sourceId, Object.freeze({
    sourceSurface: input.sourceSurface ?? "screen",
    sourceOrigin: input.sourceOrigin ?? "browser_getDisplayMedia",
    liveRuntimeEligible: input.liveRuntimeEligible === true,
  }));
  useVisualSourceCaptureStore.getState().upsertProducer({
    source_id: input.sourceId,
    thread_id: input.threadId,
    producer_id: input.producerId ?? undefined,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    stream_active: true,
    interval_active: captureMode === "interval",
    track_ready_state: firstTrack?.readyState === "ended" ? "ended" : "live",
    capture_mode: captureMode,
    cadence_ms: captureMode === "manual" ? null : clampVisualCadenceMs(input.cadenceMs),
    last_frame_at: null,
    last_heartbeat_at: now,
    last_error: null,
  });
  const observedSources = observedTrackSources.get(firstTrack) ?? new Set<string>();
  if (!observedSources.has(input.sourceId)) {
    observedSources.add(input.sourceId);
    observedTrackSources.set(firstTrack, observedSources);
    firstTrack.addEventListener("ended", () => {
      if (activeStreams.get(input.sourceId) !== input.stream) return;
      stopVisualFrameProducerInterval(input.sourceId, { stopStream: false });
    }, { once: true });
  }

  await input.postJson("/api/agi/situation/visual-source/permission-granted", {
    source_id: input.sourceId,
    client_stream_confirmed: true,
    surface: input.sourceSurface,
    source_origin: input.sourceOrigin,
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  await postVisualLiveSourceDescriptor({
    postJson: input.postJson,
    sourceId: input.sourceId,
    threadId: input.threadId,
    environmentId: input.environmentId ?? null,
    pipelineId: input.pipelineId ?? null,
    currentState: captureMode === "interval" ? "active_interval" : "active",
    cadenceMs: captureMode === "interval" ? input.cadenceMs ?? null : null,
    stream: input.stream,
    surface: input.sourceSurface,
    sourceOrigin: input.sourceOrigin,
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  await input.postJson("/api/agi/situation/source/heartbeat", {
    source_id: input.sourceId,
    thread_id: input.threadId,
    room_id: input.roomId ?? null,
    modality: "visual_frame",
    status: "active",
    surface: input.sourceSurface,
    source_origin: input.sourceOrigin,
    ts: now,
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });

  const imageBase64 = await captureFrameDataUrlFromStream(input.stream, { signal: input.signal });
  const frameHash = await hashFramePreview(imageBase64);
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  const capturedAt = new Date().toISOString();
  const clientFrame: VisualFrameProducerClientFrame = Object.freeze({
    clientFrameId: `${input.sourceId}:${frameHash}:${Date.parse(capturedAt)}`,
    sourceId: input.sourceId,
    threadId: input.threadId,
    capturedAt,
    previewHash: frameHash,
    mimeType: "image/jpeg",
    dataUrl: imageBase64,
    sourceSurface: input.sourceSurface ?? "screen",
    sourceOrigin: input.sourceOrigin ?? "browser_getDisplayMedia",
    liveRuntimeEligible: input.liveRuntimeEligible === true,
  });
  latestVisualFrameProducerFrame = clientFrame;
  const existingState = useVisualSourceCaptureStore.getState().producers[input.sourceId];
  useVisualSourceCaptureStore.getState().patchProducer(input.sourceId, {
    capture_count: (existingState?.capture_count ?? 0) + 1,
    last_frame_hash: frameHash,
    last_frame_preview_data_url: imageBase64,
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  const warnings = await notifyVisualFrameProducerSinks({
    frame: clientFrame,
    onFrame: input.onFrame,
    onWarning: input.onWarning,
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  const analysis = await input.postJson("/api/agi/situation/visual-frame/analyze", {
    thread_id: input.threadId,
    room_id: input.roomId ?? null,
    source_id: input.sourceId,
    environment_id: input.environmentId ?? null,
    capture_mode: captureMode,
    image_base64: imageBase64,
    mime_type: "image/jpeg",
    prompt: input.prompt ??
      "Summarize this permission-bound live frame as compact evidence for the current live environment. Focus on visible scene, activity, objects, UI/game context, and uncertainty.",
  });
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  if (input.alignWithEvents !== false) {
    await input.postJson("/api/agi/situation/visual-frame/align-with-events", {
      thread_id: input.threadId,
      room_id: input.roomId ?? null,
      limit: 40,
    });
    assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  }
  if (input.environmentId && analysis?.evidence?.evidence_id) {
    await input.postJson("/api/agi/situation/live-schema/repair", {
      environment_id: input.environmentId,
      thread_id: input.threadId,
    }).catch(() => null);
    assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  }

  const frameId = typeof analysis?.evidence?.frame_id === "string" ? analysis.evidence.frame_id : null;
  const evidenceId = typeof analysis?.evidence?.evidence_id === "string" ? analysis.evidence.evidence_id : null;
  const chunkId = typeof analysis?.live_source_chunk?.chunk_id === "string" ? analysis.live_source_chunk.chunk_id : null;
  const summary = typeof analysis?.evidence?.summary === "string" && analysis.evidence.summary.trim()
    ? analysis.evidence.summary.trim()
    : "Visual frame captured and recorded as compact evidence.";
  const frameAt = capturedAt;
  const frameHistoryNowMs = Date.parse(frameAt);
  const evidence = analysis?.evidence && typeof analysis.evidence === "object"
    ? analysis.evidence as Record<string, unknown>
    : null;
  const existingProducerState = useVisualSourceCaptureStore.getState().producers[input.sourceId];
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  const frameHistoryItem: VisualSourceCaptureFrameHistoryItem = {
    history_id: `${frameId ?? "pending"}:${frameHash}:${frameHistoryNowMs}`,
    source_id: input.sourceId,
    frame_id: frameId,
    evidence_id: evidenceId,
    captured_at: frameAt,
    preview_data_url: imageBase64,
    preview_hash: frameHash,
    source_surface: input.sourceSurface ?? "screen",
    summary,
    visual_observer_profile_id: readEvidenceString(evidence, "visual_observer_profile_id"),
    visual_observer_profile_title: readEvidenceString(evidence, "visual_observer_profile_title"),
    visual_prompt_hash: readEvidenceString(evidence, "visual_prompt_hash"),
    expires_at: new Date(frameHistoryNowMs + visualFrameHistoryTtlMs).toISOString(),
  };
  useVisualSourceCaptureStore.getState().patchProducer(input.sourceId, {
    last_frame_at: frameAt,
    last_heartbeat_at: frameAt,
    post_count: (useVisualSourceCaptureStore.getState().producers[input.sourceId]?.post_count ?? 0) + 1,
    frame_history: pruneVisualFrameHistory([...(existingProducerState?.frame_history ?? []), frameHistoryItem], frameHistoryNowMs),
    last_chunk_id: chunkId,
    pending_analysis_job_id: Array.isArray(analysis?.live_source_analysis_jobs) && typeof analysis.live_source_analysis_jobs.at(-1)?.job_id === "string"
      ? analysis.live_source_analysis_jobs.at(-1).job_id
      : null,
    last_error: null,
    next_capture_due_at: captureMode === "interval" && input.cadenceMs
      ? new Date(Date.parse(frameAt) + clampVisualCadenceMs(input.cadenceMs)).toISOString()
      : null,
  });
  scheduleVisualFramePreviewExpiry(input.sourceId);

  return {
    source_id: input.sourceId,
    frame_id: frameId,
    evidence_id: evidenceId,
    summary,
    evidence,
    client_frame: clientFrame,
    warnings,
  };
}

export function stopVisualFrameProducerInterval(sourceId: string, options: { stopStream?: boolean } = {}): void {
  invalidateVisualCaptureGeneration(sourceId);
  const interval = activeIntervals.get(sourceId);
  if (interval !== undefined) window.clearInterval(interval);
  activeIntervals.delete(sourceId);
  activeCaptureLocks.delete(sourceId);
  const stream = activeStreams.get(sourceId);
  if (stream && options.stopStream !== false) {
    stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }
  const retainedLiveTrack = options.stopStream === false ? getLiveTrack(stream) : null;
  const keepStream = Boolean(retainedLiveTrack);
  if (!keepStream) {
    activeStreams.delete(sourceId);
    activeStreamMetadata.delete(sourceId);
    clearLatestVisualFrameForSource(sourceId);
    const previewExpiryTimer = visualFramePreviewExpiryTimers.get(sourceId);
    if (previewExpiryTimer) clearTimeout(previewExpiryTimer);
    visualFramePreviewExpiryTimers.delete(sourceId);
  }
  useVisualSourceCaptureStore.getState().patchProducer(sourceId, {
    interval_active: false,
    stream_active: keepStream,
    track_ready_state: keepStream ? "live" : "ended",
    scheduler_adoption_status: keepStream ? "paused" : "stopped",
    last_heartbeat_at: new Date().toISOString(),
    ...(keepStream ? {} : {
      frame_history: [],
      last_frame_preview_data_url: null,
    }),
  });
}

const postSchedulerAdoption = async (input: {
  postJson: PostJson;
  producerId?: string | null;
  sourceId: string;
  threadId: string;
  environmentId?: string | null;
  pipelineId?: string | null;
  cadenceMs?: number | null;
  captureMode?: VisualCaptureMode;
  clientStreamConfirmed: boolean;
  intervalActive: boolean;
  status?: "adopted" | "waiting_for_stream" | "waiting_for_environment" | "paused" | "stopped" | "error";
  lastCaptureAt?: string | null;
  lastChunkId?: string | null;
  sourceSurface?: VisualFrameProducerSourceSurface;
  sourceOrigin?: VisualFrameProducerSourceOrigin;
}): Promise<void> => {
  const nextCaptureDueAt = input.intervalActive && input.cadenceMs
    ? new Date(Date.now() + clampVisualCadenceMs(input.cadenceMs)).toISOString()
    : null;
  const response = await input.postJson("/api/agi/situation/live-source/producer/adopt", {
    producer_id: input.producerId ?? undefined,
    source_id: input.sourceId,
    thread_id: input.threadId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    cadence_ms: input.cadenceMs ?? null,
    capture_mode: input.captureMode ?? "interval",
    client_stream_confirmed: input.clientStreamConfirmed,
    interval_active: input.intervalActive,
    next_capture_due_at: nextCaptureDueAt,
    last_capture_at: input.lastCaptureAt ?? null,
    last_chunk_id: input.lastChunkId ?? null,
    status: input.status ?? (input.clientStreamConfirmed && input.intervalActive ? "adopted" : "waiting_for_stream"),
    surface: input.sourceSurface,
    source_origin: input.sourceOrigin,
  }).catch(() => null);
  const adoption = response?.adoption && typeof response.adoption === "object" ? response.adoption : null;
  useVisualSourceCaptureStore.getState().patchProducer(input.sourceId, {
    scheduler_adoption_id: typeof adoption?.adoption_id === "string" ? adoption.adoption_id : null,
    scheduler_adoption_status: typeof adoption?.status === "string" ? adoption.status : input.status ?? null,
  });
};

const postClientCapabilityAdoption = async (input: {
  postJson: PostJson;
  actionRequestId?: string | null;
  threadId: string;
  sourceId?: string | null;
  producerId?: string | null;
  ok: boolean;
  observedState: Record<string, unknown>;
  nextRequiredAction?: string | null;
  error?: string | null;
}): Promise<void> => {
  if (!input.actionRequestId) return;
  await input.postJson(`/api/agi/client-action/${encodeURIComponent(input.actionRequestId)}/adopt`, {
    thread_id: input.threadId,
    source_id: input.sourceId ?? null,
    producer_id: input.producerId ?? null,
    client_id: "current_browser",
    ok: input.ok,
    observed_state: input.observedState,
    next_required_action: input.nextRequiredAction ?? null,
    error: input.error ?? null,
  }).catch(() => null);
};

const reassertVisualProducerInactiveAfterCancellation = async (input: {
  options: VisualProducerIntervalOptions;
  captureGeneration: number;
  producerId?: string | null;
  cadenceMs: number;
}): Promise<void> => {
  const sourceId = input.options.sourceId;
  const currentGeneration = captureGenerations.get(sourceId);
  let retainedStream = activeStreams.get(sourceId);
  let retainedTrack = getLiveTrack(retainedStream);

  // Cleanup from an older capture must never overwrite a replacement that
  // already owns a new generation and a live stream.
  if (currentGeneration !== input.captureGeneration && retainedTrack) return;

  if (
    input.options.signal?.aborted &&
    currentGeneration === input.captureGeneration &&
    retainedTrack
  ) {
    stopVisualFrameProducerInterval(sourceId, { stopStream: false });
    retainedStream = activeStreams.get(sourceId);
    retainedTrack = getLiveTrack(retainedStream);
  }

  const paused = Boolean(retainedStream && retainedTrack);
  await postSchedulerAdoption({
    postJson: input.options.postJson,
    producerId: input.producerId ?? null,
    sourceId,
    threadId: input.options.threadId,
    environmentId: input.options.environmentId ?? null,
    pipelineId: input.options.pipelineId ?? null,
    cadenceMs: input.cadenceMs,
    captureMode: "interval",
    clientStreamConfirmed: paused,
    intervalActive: false,
    status: paused ? "paused" : "stopped",
    sourceSurface: input.options.sourceSurface,
    sourceOrigin: input.options.sourceOrigin,
  });
  await postVisualLiveSourceDescriptor({
    postJson: input.options.postJson,
    sourceId,
    threadId: input.options.threadId,
    environmentId: input.options.environmentId ?? null,
    pipelineId: input.options.pipelineId ?? null,
    currentState: paused ? "paused" : "stopped",
    cadenceMs: input.cadenceMs,
    stream: paused ? retainedStream : null,
    surface: input.options.sourceSurface,
    sourceOrigin: input.options.sourceOrigin,
  }).catch(() => null);
};

export async function startVisualFrameProducerInterval(input: VisualProducerIntervalOptions): Promise<VisualFrameProducerResult> {
  const cadenceMs = clampVisualCadenceMs(input.cadenceMs);
  stopVisualFrameProducerInterval(input.sourceId, { stopStream: input.preserveExistingStream ? false : true });
  const captureGeneration = beginVisualCaptureGeneration(input.sourceId);
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  activeStreams.set(input.sourceId, input.stream);
  activeStreamMetadata.set(input.sourceId, Object.freeze({
    sourceSurface: input.sourceSurface ?? "screen",
    sourceOrigin: input.sourceOrigin ?? "browser_getDisplayMedia",
    liveRuntimeEligible: input.liveRuntimeEligible === true,
  }));
  const assertCurrentAfterMutation = async (producerId?: string | null): Promise<void> => {
    try {
      assertVisualCaptureCurrent({
        sourceId: input.sourceId,
        generation: captureGeneration,
        signal: input.signal,
      });
    } catch (error) {
      await reassertVisualProducerInactiveAfterCancellation({
        options: input,
        captureGeneration,
        producerId,
        cadenceMs,
      });
      throw error;
    }
  };

  const firstTrack = getLiveTrack(input.stream);
  if (!firstTrack) {
    stopVisualFrameProducerInterval(input.sourceId, { stopStream: false });
    throw new Error("visual_capture_track_ended");
  }
  const observedSources = observedTrackSources.get(firstTrack) ?? new Set<string>();
  if (!observedSources.has(input.sourceId)) {
    observedSources.add(input.sourceId);
    observedTrackSources.set(firstTrack, observedSources);
    firstTrack.addEventListener("ended", () => {
      if (activeStreams.get(input.sourceId) !== input.stream) return;
      stopVisualFrameProducerInterval(input.sourceId, { stopStream: false });
      void input.postJson("/api/agi/situation/live-source/producer/heartbeat", {
        source_id: input.sourceId,
        thread_id: input.threadId,
        environment_id: input.environmentId ?? null,
        pipeline_id: input.pipelineId ?? null,
        client_stream_confirmed: false,
        status: "stopped",
        surface: input.sourceSurface,
        source_origin: input.sourceOrigin,
        ts: new Date().toISOString(),
      }).catch(() => null);
    }, { once: true });
  }

  const cadenceResponse = await input.postJson("/api/agi/situation/live-source/producer/set-cadence", {
    source_id: input.sourceId,
    thread_id: input.threadId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    capture_mode: "interval",
    cadence_ms: cadenceMs,
    client_stream_confirmed: true,
    surface: input.sourceSurface,
    source_origin: input.sourceOrigin,
  });
  const producerId = typeof cadenceResponse?.producer?.producer_id === "string"
    ? cadenceResponse.producer.producer_id
    : typeof cadenceResponse?.receipt?.cadence?.producer_id === "string"
      ? cadenceResponse.receipt.cadence.producer_id
      : null;
  await assertCurrentAfterMutation(producerId);

  useVisualSourceCaptureStore.getState().upsertProducer({
    source_id: input.sourceId,
    thread_id: input.threadId,
    producer_id: producerId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    stream_active: true,
    interval_active: true,
    track_ready_state: firstTrack?.readyState === "ended" ? "ended" : "live",
    capture_mode: "interval",
    cadence_ms: cadenceMs,
    last_frame_at: null,
    last_heartbeat_at: new Date().toISOString(),
    next_capture_due_at: new Date(Date.now() + cadenceMs).toISOString(),
  });
  await postSchedulerAdoption({
    postJson: input.postJson,
    producerId,
    sourceId: input.sourceId,
    threadId: input.threadId,
    environmentId: input.environmentId ?? null,
    pipelineId: input.pipelineId ?? null,
    cadenceMs,
    captureMode: "interval",
    clientStreamConfirmed: true,
    intervalActive: true,
    status: "adopted",
    sourceSurface: input.sourceSurface,
    sourceOrigin: input.sourceOrigin,
  });
  await assertCurrentAfterMutation(producerId);
  await postVisualLiveSourceDescriptor({
    postJson: input.postJson,
    sourceId: input.sourceId,
    threadId: input.threadId,
    environmentId: input.environmentId ?? null,
    pipelineId: input.pipelineId ?? null,
    currentState: "active_interval",
    cadenceMs,
    stream: input.stream,
    surface: input.sourceSurface,
    sourceOrigin: input.sourceOrigin,
  });
  await assertCurrentAfterMutation(producerId);

  const capture = async (force: boolean): Promise<VisualFrameProducerResult | null> => {
    assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
    if (activeCaptureLocks.has(input.sourceId)) return null;
    const stream = activeStreams.get(input.sourceId);
    const track = getLiveTrack(stream);
    if (!stream || !track) {
      stopVisualFrameProducerInterval(input.sourceId, { stopStream: false });
      return null;
    }
    activeCaptureLocks.add(input.sourceId);
    try {
      await input.postJson("/api/agi/situation/live-source/producer/heartbeat", {
        source_id: input.sourceId,
        thread_id: input.threadId,
        environment_id: input.environmentId ?? null,
        pipeline_id: input.pipelineId ?? null,
        client_stream_confirmed: true,
        status: "active",
        surface: input.sourceSurface,
        source_origin: input.sourceOrigin,
        ts: new Date().toISOString(),
      }).catch(() => null);
      assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
      if (!force) {
        const due = await input.postJson("/api/agi/situation/live-source/producer/tick-due", {
          source_id: input.sourceId,
          thread_id: input.threadId,
          now: new Date().toISOString(),
        }).catch(() => null);
        assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
        if (due?.due === false) return null;
      }
      const result = await runVisualFrameProducerOnce({
        ...input,
        stream,
        producerId,
        captureMode: "interval",
        cadenceMs,
        captureGeneration,
      });
      assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
      await input.postJson("/api/agi/situation/live-source/analysis-jobs/run-due", {
        thread_id: input.threadId,
        source_id: input.sourceId,
      }).catch(() => null);
      assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
      const latestState = useVisualSourceCaptureStore.getState().producers[input.sourceId];
      await postSchedulerAdoption({
        postJson: input.postJson,
        producerId,
        sourceId: input.sourceId,
        threadId: input.threadId,
        environmentId: input.environmentId ?? null,
        pipelineId: input.pipelineId ?? null,
        cadenceMs,
        captureMode: "interval",
        clientStreamConfirmed: true,
        intervalActive: true,
        status: "adopted",
        lastCaptureAt: latestState?.last_frame_at ?? null,
        lastChunkId: latestState?.last_chunk_id ?? null,
        sourceSurface: input.sourceSurface,
        sourceOrigin: input.sourceOrigin,
      });
      assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
      await postVisualLiveSourceDescriptor({
        postJson: input.postJson,
        sourceId: input.sourceId,
        threadId: input.threadId,
        environmentId: input.environmentId ?? null,
        pipelineId: input.pipelineId ?? null,
        currentState: "active_interval",
        cadenceMs,
        stream,
        surface: input.sourceSurface,
        sourceOrigin: input.sourceOrigin,
      });
      assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
      return result;
    } catch (error) {
      if (captureGenerations.get(input.sourceId) !== captureGeneration || input.signal?.aborted) {
        await reassertVisualProducerInactiveAfterCancellation({
          options: input,
          captureGeneration,
          producerId,
          cadenceMs,
        });
      } else {
        useVisualSourceCaptureStore.getState().patchProducer(input.sourceId, {
          last_error: error instanceof Error ? error.message : "visual_interval_capture_failed",
        });
      }
      throw error;
    } finally {
      activeCaptureLocks.delete(input.sourceId);
    }
  };

  const firstResult = await capture(true);
  assertVisualCaptureCurrent({ sourceId: input.sourceId, generation: captureGeneration, signal: input.signal });
  const interval = window.setInterval(() => {
    void capture(false).catch(() => null);
  }, cadenceMs);
  activeIntervals.set(input.sourceId, interval);
  return firstResult ?? {
    source_id: input.sourceId,
    frame_id: null,
    evidence_id: null,
    summary: "Visual producer interval started; first frame capture is pending.",
    evidence: null,
    client_frame: null,
    warnings: [],
  };
}

export async function adoptServerVisualProducerPolicies(input: {
  threadId: string;
  postJson: PostJson;
  fetchJson?: (path: string) => Promise<any>;
  roomId?: string | null;
  environmentId?: string | null;
  sourceSurface?: VisualFrameProducerSourceSurface;
  sourceOrigin?: VisualFrameProducerSourceOrigin;
}): Promise<number> {
  const fetchJson = input.fetchJson ?? (async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
    return response.json();
  });
  const body = await fetchJson(`/api/agi/situation/live-source/producers?thread_id=${encodeURIComponent(input.threadId)}`);
  const pendingBody = await fetchJson(`/api/agi/client-action/pending?thread_id=${encodeURIComponent(input.threadId)}`).catch(() => null);
  const producers: ServerVisualProducer[] = Array.isArray(body?.producers) ? body.producers : [];
  const inactiveSourceIds = new Set(
    producers
      .filter((producer) => producer.status === "stopped" || producer.status === "paused" || producer.status === "error")
      .map((producer) => producer.source_id)
      .filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.length > 0),
  );
  const pendingProducers: ServerVisualProducer[] = Array.isArray(pendingBody?.actions)
    ? pendingBody.actions
        .filter((action: any) =>
          action?.capability === "visual_capture" &&
          ["adopt_producer", "set_rate", "start_interval"].includes(action?.action) &&
          action?.args &&
          typeof action.args === "object"
        )
        .map((action: any) => ({
          producer_id: typeof action.args.producer_id === "string" ? action.args.producer_id : undefined,
          source_id: typeof action.args.source_id === "string" ? action.args.source_id : undefined,
          thread_id: typeof action.thread_id === "string" ? action.thread_id : input.threadId,
          modality: "visual_frame",
          environment_id: typeof action.environment_id === "string" ? action.environment_id : null,
          pipeline_id: typeof action.pipeline_id === "string" ? action.pipeline_id : null,
          capture_mode: typeof action.args.capture_mode === "string" ? action.args.capture_mode : "interval",
          cadence_ms: typeof action.args.cadence_ms === "number" ? action.args.cadence_ms : null,
          action_request_id: typeof action.action_request_id === "string" ? action.action_request_id : null,
        }))
    : [];
  const producerByKey = new Map<string, ServerVisualProducer>();
  for (const producer of [...producers, ...pendingProducers]) {
    const key = producer.producer_id ?? producer.source_id ?? `${producer.action_request_id}`;
    if (key) producerByKey.set(key, { ...producerByKey.get(key), ...producer });
  }
  let adopted = 0;
  for (const producer of producerByKey.values()) {
    if (producer.modality && producer.modality !== "visual_frame") continue;
    if (producer.capture_mode !== "interval" || typeof producer.cadence_ms !== "number") continue;
    const sourceId = typeof producer.source_id === "string" ? producer.source_id : null;
    if (!sourceId) continue;
    if (inactiveSourceIds.has(sourceId) || producer.status === "stopped" || producer.status === "paused" || producer.status === "error") {
      if (activeStreams.has(sourceId)) {
        stopVisualFrameProducerInterval(sourceId, {
          stopStream: producer.status === "paused" ? false : true,
        });
      }
      continue;
    }
    const stream = activeStreams.get(sourceId);
    const track = getLiveTrack(stream);
    const metadata = activeStreamMetadata.get(sourceId) ?? {
      sourceSurface: input.sourceSurface ?? "screen",
      sourceOrigin: input.sourceOrigin ?? "browser_getDisplayMedia",
      liveRuntimeEligible: false,
    };
    // Source identity is consent-bound. Never attach a different source's active stream
    // merely because it is the newest stream in this thread.
    if (!stream || !track) {
      await postSchedulerAdoption({
        postJson: input.postJson,
        producerId: producer.producer_id ?? null,
        sourceId,
        threadId: input.threadId,
        environmentId: producer.environment_id ?? input.environmentId ?? null,
        pipelineId: producer.pipeline_id ?? null,
        cadenceMs: producer.cadence_ms,
        captureMode: "interval",
        clientStreamConfirmed: false,
        intervalActive: false,
        status: "waiting_for_stream",
        sourceSurface: metadata.sourceSurface,
        sourceOrigin: metadata.sourceOrigin,
      });
      await postClientCapabilityAdoption({
        postJson: input.postJson,
        actionRequestId: producer.action_request_id ?? null,
        threadId: input.threadId,
        sourceId,
        producerId: producer.producer_id ?? null,
        ok: false,
        observedState: {
          source_id: sourceId,
          producer_id: producer.producer_id ?? null,
          surface: metadata.sourceSurface,
          source_origin: metadata.sourceOrigin,
          client_stream_confirmed: false,
          interval_active: false,
          track_ready_state: track?.readyState ?? "ended",
          status: "waiting_for_stream",
        },
        nextRequiredAction: "grant_visual_capture_permission",
      });
      continue;
    }
    const liveTrack = getLiveTrack(stream);
    if (!liveTrack) continue;
    const current = useVisualSourceCaptureStore.getState().producers[sourceId];
    if (
      current?.interval_active &&
      current.cadence_ms === producer.cadence_ms &&
      current.producer_id === producer.producer_id
    ) {
      const trackReadyState = liveTrack.readyState;
      await postSchedulerAdoption({
        postJson: input.postJson,
        producerId: producer.producer_id ?? null,
        sourceId,
        threadId: input.threadId,
        environmentId: producer.environment_id ?? input.environmentId ?? null,
        pipelineId: producer.pipeline_id ?? null,
        cadenceMs: producer.cadence_ms,
        captureMode: "interval",
        clientStreamConfirmed: true,
        intervalActive: true,
        status: "adopted",
        lastCaptureAt: current.last_frame_at ?? null,
        lastChunkId: current.last_chunk_id ?? null,
        sourceSurface: metadata.sourceSurface,
        sourceOrigin: metadata.sourceOrigin,
      });
      await postVisualLiveSourceDescriptor({
        postJson: input.postJson,
        sourceId,
        threadId: input.threadId,
        environmentId: producer.environment_id ?? input.environmentId ?? null,
        pipelineId: producer.pipeline_id ?? null,
        currentState: "active_interval",
        cadenceMs: producer.cadence_ms,
        stream,
        surface: metadata.sourceSurface,
        sourceOrigin: metadata.sourceOrigin,
      });
      await postClientCapabilityAdoption({
        postJson: input.postJson,
        actionRequestId: producer.action_request_id ?? null,
        threadId: input.threadId,
        sourceId,
        producerId: producer.producer_id ?? null,
        ok: true,
        observedState: {
          source_id: sourceId,
          producer_id: producer.producer_id ?? null,
          surface: metadata.sourceSurface,
          source_origin: metadata.sourceOrigin,
          client_stream_confirmed: true,
          interval_active: true,
          cadence_ms: producer.cadence_ms,
          track_ready_state: trackReadyState,
          latest_chunk_id: current.last_chunk_id ?? null,
          scheduler_adoption_status: "adopted",
        },
      });
      adopted += 1;
      continue;
    }
    const trackReadyState = liveTrack.readyState;
    await startVisualFrameProducerInterval({
      sourceId,
      threadId: input.threadId,
      roomId: input.roomId ?? null,
      environmentId: producer.environment_id ?? input.environmentId ?? null,
      pipelineId: producer.pipeline_id ?? null,
      cadenceMs: producer.cadence_ms,
      stream,
      postJson: input.postJson,
      preserveExistingStream: true,
      sourceSurface: metadata.sourceSurface,
      sourceOrigin: metadata.sourceOrigin,
      liveRuntimeEligible: metadata.liveRuntimeEligible,
    });
    const updated = useVisualSourceCaptureStore.getState().producers[sourceId];
    await postClientCapabilityAdoption({
      postJson: input.postJson,
      actionRequestId: producer.action_request_id ?? null,
      threadId: input.threadId,
      sourceId,
      producerId: producer.producer_id ?? updated?.producer_id ?? null,
      ok: true,
      observedState: {
        source_id: sourceId,
        producer_id: producer.producer_id ?? updated?.producer_id ?? null,
        surface: metadata.sourceSurface,
        source_origin: metadata.sourceOrigin,
        client_stream_confirmed: true,
        interval_active: true,
        cadence_ms: producer.cadence_ms,
        track_ready_state: trackReadyState,
        latest_chunk_id: updated?.last_chunk_id ?? null,
        scheduler_adoption_status: "adopted",
      },
    });
    adopted += 1;
  }
  return adopted;
}
