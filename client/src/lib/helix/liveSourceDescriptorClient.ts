type PostJson = (path: string, body?: Record<string, unknown>) => Promise<any>;

type DescriptorInput = {
  postJson: PostJson;
  sourceId: string;
  threadId: string;
  environmentId?: string | null;
  pipelineId?: string | null;
  currentState?: "active" | "active_interval" | "permission_required" | "stale" | "paused" | "stopped" | "error";
  cadenceMs?: number | null;
  stream?: MediaStream | null;
  surface?: "screen" | "window" | "browser_tab" | "camera" | "document" | "game" | "app" | "terminal" | "file_manager" | "calculator" | "simulation" | "unknown";
  sourceOrigin?: "browser_getDisplayMedia" | "browser_getUserMedia";
  latestObservationRefs?: string[];
};

const trackLabel = (stream?: MediaStream | null): string | null => {
  const track = stream?.getVideoTracks()[0] ?? stream?.getTracks()[0] ?? null;
  const label = typeof track?.label === "string" ? track.label.trim() : "";
  return label || null;
};

export async function postVisualLiveSourceDescriptor(input: DescriptorInput): Promise<void> {
  const label = trackLabel(input.stream);
  const sourceOrigin = input.sourceOrigin ?? "browser_getDisplayMedia";
  await input.postJson("/api/agi/situation/live-source/descriptor", {
    source_id: input.sourceId,
    thread_id: input.threadId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    modality: "visual_frame",
    user_label: label ?? (sourceOrigin === "browser_getUserMedia" ? "Device camera capture" : "Browser visual capture"),
    serving_context: {
      surface: input.surface ?? (sourceOrigin === "browser_getUserMedia" ? "camera" : "screen"),
      source_origin: sourceOrigin,
      app_hint: null,
      window_title_hint: label,
      participant_id: null,
    },
    capabilities: ["capture_frame", "interval_capture", "client_adoption"],
    current_state: input.currentState ?? "active",
    cadence_ms: input.cadenceMs ?? null,
    latest_observation_refs: input.latestObservationRefs ?? [],
    assistant_answer: false,
    raw_content_included: false,
  }).catch(() => null);
}

export async function postAudioTranscriptLiveSourceDescriptor(input: DescriptorInput): Promise<void> {
  const label = trackLabel(input.stream);
  const sourceOrigin = input.sourceOrigin ?? "browser_getDisplayMedia";
  await input.postJson("/api/agi/situation/live-source/descriptor", {
    source_id: input.sourceId,
    thread_id: input.threadId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    modality: "audio_transcript",
    user_label: label
      ? `${label} audio transcript`
      : sourceOrigin === "browser_getUserMedia"
        ? "Device camera audio transcript"
        : "Browser audio transcript",
    serving_context: {
      surface: input.surface ?? (sourceOrigin === "browser_getUserMedia" ? "camera" : "screen"),
      source_origin: sourceOrigin,
      app_hint: null,
      window_title_hint: label,
      participant_id: null,
    },
    capabilities: ["transcribe_chunk", "chunk_window", "client_adoption"],
    current_state: input.currentState ?? "active",
    cadence_ms: input.cadenceMs ?? null,
    latest_observation_refs: input.latestObservationRefs ?? [],
    assistant_answer: false,
    raw_content_included: false,
  }).catch(() => null);
}
