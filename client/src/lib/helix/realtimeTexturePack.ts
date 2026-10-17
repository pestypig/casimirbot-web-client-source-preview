import {
  REALTIME_TEXTURE_PACK_BASELINE_HEIGHT,
  REALTIME_TEXTURE_PACK_BASELINE_WIDTH,
  buildRealtimeTexturePackConfig,
  buildRealtimeTexturePackSessionState,
  buildRealtimeTexturePackTransformRequest,
  createLocalPassthroughRealtimeTexturePackProvider,
  type RealtimeTexturePackPresetId,
  type RealtimeTexturePackConfigV1,
  type RealtimeTexturePackProjectionFrameV1,
  type RealtimeTexturePackSessionStateV1,
  type RealtimeTexturePackTransformRequestV1,
} from "@shared/realtime-texture-pack";
import { captureFrameDataUrlFromStream } from "./visualFrameProducer";
import {
  requestVisualSourceMediaStream,
  stopVisualSourceMediaStream,
  type HelixVisualSourceRequestResult,
} from "./visualSourceMedia";

export type RealtimeTexturePackPreviewOptions = {
  presetId: RealtimeTexturePackPresetId;
  customPrompt: string;
};

export type RealtimeTexturePackPreviewController = {
  start(options: RealtimeTexturePackPreviewOptions): Promise<RealtimeTexturePackSessionStateV1>;
  updateDirection(options: RealtimeTexturePackPreviewOptions): RealtimeTexturePackConfigV1 | null;
  updateProvider(providerId: string): RealtimeTexturePackConfigV1 | null;
  stop(reason?: string): RealtimeTexturePackSessionStateV1;
  getState(): RealtimeTexturePackSessionStateV1;
};

export type RealtimeTexturePackPreviewDependencies = {
  requestSource?: () => Promise<HelixVisualSourceRequestResult>;
  captureFrame?: (stream: MediaStream, signal: AbortSignal) => Promise<string>;
  resizeFrame?: (dataUrl: string) => Promise<string>;
  now?: () => Date;
  setInterval?: (callback: () => void, delayMs: number) => number;
  clearInterval?: (handle: number) => void;
  onState?: (state: RealtimeTexturePackSessionStateV1) => void;
  onConfig?: (config: RealtimeTexturePackConfigV1) => void;
  onFrame?: (frame: RealtimeTexturePackProjectionFrameV1) => void;
  transformRemote?: (
    request: RealtimeTexturePackTransformRequestV1,
    providerId: string,
  ) => Promise<RealtimeTexturePackProjectionFrameV1>;
};

const resizeRealtimeTexturePackFrame = async (dataUrl: string): Promise<string> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error("realtime_texture_pack_frame_decode_failed"));
    candidate.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = REALTIME_TEXTURE_PACK_BASELINE_WIDTH;
  canvas.height = REALTIME_TEXTURE_PACK_BASELINE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("realtime_texture_pack_canvas_unavailable");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(
    image,
    Math.round((canvas.width - width) / 2),
    Math.round((canvas.height - height) / 2),
    width,
    height,
  );
  return canvas.toDataURL("image/jpeg", 0.72);
};

const cloneState = (
  state: RealtimeTexturePackSessionStateV1,
): RealtimeTexturePackSessionStateV1 => Object.freeze({ ...state });

export function createRealtimeTexturePackPreviewController(
  dependencies: RealtimeTexturePackPreviewDependencies = {},
): RealtimeTexturePackPreviewController {
  const now = dependencies.now ?? (() => new Date());
  const requestSource = dependencies.requestSource ?? (() => requestVisualSourceMediaStream({
    kind: "screen",
    includeDisplayAudio: false,
  }));
  const captureFrame = dependencies.captureFrame ?? ((stream, signal) =>
    captureFrameDataUrlFromStream(stream, { signal }));
  const resizeFrame = dependencies.resizeFrame ?? resizeRealtimeTexturePackFrame;
  const schedule = dependencies.setInterval ?? ((callback, delayMs) => window.setInterval(callback, delayMs));
  const cancelSchedule = dependencies.clearInterval ?? ((handle) => window.clearInterval(handle));
  const provider = createLocalPassthroughRealtimeTexturePackProvider();

  let generation = 0;
  let stream: MediaStream | null = null;
  let timer: number | null = null;
  let abortController: AbortController | null = null;
  let inFlight = false;
  let frameSequence = 0;
  let activeConfig: RealtimeTexturePackConfigV1 | null = null;
  let state = buildRealtimeTexturePackSessionState({
    sessionId: `texture-session:${now().getTime()}`,
  });

  const publishState = (patch: Partial<RealtimeTexturePackSessionStateV1>) => {
    state = cloneState({ ...state, ...patch });
    dependencies.onState?.(state);
    return state;
  };

  const settleStop = (reason: string | null): RealtimeTexturePackSessionStateV1 => {
    generation += 1;
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    abortController?.abort();
    abortController = null;
    if (stream) stopVisualSourceMediaStream(stream);
    stream = null;
    inFlight = false;
    activeConfig = null;
    return publishState({
      status: "stopped",
      capture_active: false,
      overlay_visible: false,
      frame_age_ms: null,
      failure_reason: reason,
    });
  };

  const start = async (
    options: RealtimeTexturePackPreviewOptions,
  ): Promise<RealtimeTexturePackSessionStateV1> => {
    if (stream || timer !== null || inFlight) settleStop(null);
    const activeGeneration = ++generation;
    const result = await requestSource();
    if (activeGeneration !== generation) {
      if (result.ok) stopVisualSourceMediaStream(result.stream);
      return state;
    }
    if (result.ok === false) {
      return publishState({
        status: "error",
        capture_active: false,
        failure_reason: result.errorCode,
      });
    }
    if (result.surface !== "window") {
      stopVisualSourceMediaStream(result.stream);
      return publishState({
        status: "error",
        capture_active: false,
        failure_reason: "realtime_texture_pack_window_source_required",
      });
    }

    stream = result.stream;
    const sessionId = `texture-session:${now().getTime()}`;
    state = buildRealtimeTexturePackSessionState({ sessionId, status: "source_selected" });
    publishState({ capture_active: true, failure_reason: null });
    const sourceId = `texture-source:${sessionId}`;
    activeConfig = buildRealtimeTexturePackConfig({
      sessionId,
      sourceId,
      sourceSurface: "window",
      presetId: options.presetId,
      customPrompt: options.customPrompt,
    });
    dependencies.onConfig?.(activeConfig);
    abortController = new AbortController();

    const capture = async () => {
      if (!stream || !abortController || !activeConfig || activeGeneration !== generation) return;
      if (inFlight) {
        publishState({ dropped_frame_count: state.dropped_frame_count + 1 });
        return;
      }
      inFlight = true;
      const sequence = ++frameSequence;
      try {
        const capturedAt = now().toISOString();
        const rawFrame = await captureFrame(stream, abortController.signal);
        const sourceFrame = await resizeFrame(rawFrame);
        if (activeGeneration !== generation) return;
        const request = buildRealtimeTexturePackTransformRequest({
          config: activeConfig,
          requestId: `texture-request:${sessionId}:${sequence}`,
          sourceFrameId: `source-frame:${sessionId}:${sequence}`,
          sourceCapturedAt: capturedAt,
          sourceImageDataUrl: sourceFrame,
        });
        const projection = activeConfig.provider_id === provider.provider_id
          ? await provider.transform(request)
          : dependencies.transformRemote
            ? await dependencies.transformRemote(request, activeConfig.provider_id)
            : (() => { throw new Error("realtime_texture_pack_remote_provider_unavailable"); })();
        if (activeGeneration !== generation) return;
        dependencies.onFrame?.(projection);
        publishState({
          status: "previewing",
          capture_active: true,
          last_source_frame_id: projection.source_frame_id,
          last_projection_frame_id: projection.projection_frame_id,
          frame_age_ms: Math.max(0, now().getTime() - Date.parse(projection.source_captured_at)),
          provider_state: projection.provider_id === provider.provider_id ? "local_only" : "connected",
          failure_reason: null,
        });
      } catch (error) {
        if (activeGeneration === generation && !abortController?.signal.aborted) {
          publishState({
            status: "degraded",
            provider_state: activeConfig?.provider_id === provider.provider_id ? "local_only" : "error",
            failure_reason: error instanceof Error ? error.message : "realtime_texture_pack_capture_failed",
          });
        }
      } finally {
        inFlight = false;
      }
    };

    result.videoTrack.addEventListener?.("ended", () => {
      if (activeGeneration === generation) settleStop("source_ended");
    }, { once: true });
    void capture();
    timer = schedule(() => void capture(), 1_000);
    return state;
  };

  return {
    start,
    updateDirection: (options) => {
      if (!activeConfig || !stream) return null;
      activeConfig = buildRealtimeTexturePackConfig({
        sessionId: activeConfig.session_id,
        sourceId: activeConfig.source_id,
        sourceSurface: activeConfig.source_surface,
        providerId: activeConfig.provider_id,
        presetId: options.presetId,
        customPrompt: options.customPrompt,
      });
      dependencies.onConfig?.(activeConfig);
      return activeConfig;
    },
    updateProvider: (providerId) => {
      if (!activeConfig || !stream) return null;
      activeConfig = buildRealtimeTexturePackConfig({
        sessionId: activeConfig.session_id,
        sourceId: activeConfig.source_id,
        sourceSurface: activeConfig.source_surface,
        providerId,
        presetId: activeConfig.preset_id,
        customPrompt: activeConfig.custom_prompt,
      });
      dependencies.onConfig?.(activeConfig);
      return activeConfig;
    },
    stop: (reason = "user_stopped") => settleStop(reason),
    getState: () => state,
  };
}
