import { transcribeVoice, type VoiceTranscribeResponse } from "@/lib/agi/api";
import type { HelixSituationEvent, HelixSituationSource } from "./situation-room";

export type DisplayAudioTranscribe = typeof transcribeVoice;

export type DisplayAudioSituationSessionOptions = {
  roomId: string;
  sourceId?: string;
  environmentId?: string | null;
  missionId?: string;
  threadId?: string;
  captureSessionId?: string;
  chunkMs?: number;
  stream?: MediaStream | null;
  stopStreamOnStop?: boolean;
  onEvent: (event: HelixSituationEvent) => void;
  onTranscriptChunk?: (chunk: DisplayAudioTranscriptChunk) => void | Promise<void>;
  onError?: (error: Error) => void;
  onStop?: (reason: "manual" | "track_ended") => void;
  isDottiePlaybackActive?: () => boolean;
  transcribe?: DisplayAudioTranscribe;
};

export type DisplayAudioTranscriptChunk = {
  event: HelixSituationEvent;
  result: VoiceTranscribeResponse;
  sourceId?: string;
  environmentId?: string | null;
  source: HelixSituationSource;
  captureSessionId: string;
  chunkIndex: number;
  durationMs: number;
  fromTs: string;
  toTs: string;
};

export type DisplayAudioSituationSession = {
  captureSessionId: string;
  source: HelixSituationSource;
  stream: MediaStream;
  recorder: MediaRecorder;
  stop: () => void;
};

type DisplayAudioCaptureSource =
  | "display_tab_audio"
  | "display_window_audio"
  | "display_screen_audio";

type DisplayTrackSettings = MediaTrackSettings & {
  displaySurface?: string;
};

type DisplayAudioTimer = ReturnType<typeof setTimeout>;

const createCaptureSessionId = (): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `capture:${Date.now()}:${random}`;
};

export const inferDisplayAudioSource = (stream: MediaStream): HelixSituationSource => {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() as DisplayTrackSettings | undefined;
  const displaySurface = settings?.displaySurface?.toLowerCase();
  if (displaySurface === "browser") return "display_tab_audio";
  if (displaySurface === "window" || displaySurface === "application") return "display_window_audio";
  return "display_screen_audio";
};

const shouldPrimeSegmentWithContainerHeader = (args: {
  segmentStartIndex: number;
  mimeType?: string | null;
  hasHeaderChunk: boolean;
}): boolean => {
  if (!args.hasHeaderChunk) return false;
  if (args.segmentStartIndex <= 0) return false;
  const normalized = (args.mimeType ?? "").trim().toLowerCase();
  return normalized.includes("webm") || normalized.includes("ogg");
};

const pickDisplayAudioMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate: string) => MediaRecorder.isTypeSupported(candidate));
};

const stopStreamTracks = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

const buildTranscriptEvent = (args: {
  roomId: string;
  missionId?: string;
  threadId?: string;
  captureSessionId: string;
  chunkIndex: number;
  source: HelixSituationSource;
  result: VoiceTranscribeResponse;
  possibleTtsEcho: boolean;
}): HelixSituationEvent | null => {
  const text = args.result.text?.trim() ?? "";
  if (!text) return null;
  return {
    id: `situation:${args.captureSessionId}:${args.chunkIndex}`,
    room_id: args.roomId,
    mission_id: args.missionId,
    thread_id: args.threadId,
    source: args.source,
    event_type: "voice_transcript",
    text,
    classification: "info",
    evidence_refs: [`voice:transcribe:${args.captureSessionId}:${args.chunkIndex}`],
    capture_session_id: args.captureSessionId,
    chunk_index: args.chunkIndex,
    ts: new Date().toISOString(),
    meta: {
      confidence: typeof args.result.confidence === "number" ? args.result.confidence : null,
      language: args.result.language_detected ?? args.result.source_language ?? args.result.language ?? null,
      display_language: args.result.language ?? null,
      source_language: args.result.source_language ?? args.result.language_detected ?? null,
      source_text: args.result.source_text ?? null,
      translated: args.result.translated === true,
      engine: args.result.engine ?? null,
      possible_tts_echo: args.possibleTtsEcho,
    },
  };
};

export async function startDisplayAudioSituationSession(
  options: DisplayAudioSituationSessionOptions,
): Promise<DisplayAudioSituationSession> {
  if (!options.stream && (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia)) {
    throw new Error("Display audio capture unavailable.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Browser recording unsupported.");
  }

  const ownsStream = !options.stream;
  const stream = options.stream ?? await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    } as MediaTrackConstraints,
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    if (ownsStream) stopStreamTracks(stream);
    throw new Error("Selected source did not provide an audio track.");
  }

  const captureSessionId = options.captureSessionId?.trim() || createCaptureSessionId();
  const source = inferDisplayAudioSource(stream);
  const audioOnlyStream = new MediaStream(audioTracks);
  const mimeType = pickDisplayAudioMimeType();
  const recorder = mimeType ? new MediaRecorder(audioOnlyStream, { mimeType }) : new MediaRecorder(audioOnlyStream);
  const transcribe = options.transcribe ?? transcribeVoice;
  const chunkMs = Math.max(1000, Math.round(options.chunkMs ?? 5000));
  const recorderSliceMs = 250;
  const bufferedChunks: Array<{ chunk: Blob; atMs: number }> = [];

  let chunkIndex = 0;
  let segmentStartIndex = 0;
  let segmentStartedAt = Date.now();
  let stopped = false;
  let flushTimer: DisplayAudioTimer | null = null;
  let segmentTimer: DisplayAudioTimer | null = null;

  const flushSegment = (): void => {
    if (stopped) return;
    if (recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Some browsers do not support explicit flush; buffered chunks still upload on the timer.
      }
    }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (stopped) return;
      const currentSegmentStartIndex = segmentStartIndex;
      const headerChunk = bufferedChunks[0]?.chunk;
      const segmentChunks = bufferedChunks.slice(currentSegmentStartIndex);
      segmentStartIndex = bufferedChunks.length;
      const audioChunks = segmentChunks
        .map((entry: { chunk: Blob; atMs: number }) => entry.chunk)
        .filter((chunk: Blob) => chunk.size > 0);
      if (audioChunks.length === 0) return;
      const uploadMimeType = recorder.mimeType || audioChunks[0]?.type || mimeType || "audio/webm";
      const shouldPrimeWithHeader = shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: currentSegmentStartIndex,
        mimeType: uploadMimeType,
        hasHeaderChunk: Boolean(headerChunk && headerChunk.size > 0),
      });
      const uploadChunks =
        shouldPrimeWithHeader && headerChunk && !audioChunks.includes(headerChunk)
          ? [headerChunk, ...audioChunks]
          : audioChunks;
      const audio = new Blob(uploadChunks, { type: uploadMimeType });
      if (audio.size <= 0) return;
      const now = Date.now();
      const fromTs = new Date(segmentStartedAt).toISOString();
      const toTs = new Date(now).toISOString();
      const durationMs = Math.max(0, now - segmentStartedAt);
      segmentStartedAt = now;
      const currentChunkIndex = chunkIndex;
      chunkIndex += 1;

      void transcribe({
        audio,
        room_id: options.roomId,
        mission_id: options.missionId,
        missionId: options.missionId,
        thread_id: options.threadId,
        capture_session_id: captureSessionId,
        chunk_index: currentChunkIndex,
        capture_source: source as DisplayAudioCaptureSource,
        command_lane_enabled: false,
        durationMs,
      })
        .then((result: VoiceTranscribeResponse) => {
          const situationEvent = buildTranscriptEvent({
            roomId: options.roomId,
            missionId: options.missionId,
            threadId: options.threadId,
            captureSessionId,
            chunkIndex: currentChunkIndex,
            source,
            result,
            possibleTtsEcho: options.isDottiePlaybackActive?.() === true,
          });
          if (situationEvent) {
            options.onEvent(situationEvent);
            if (options.onTranscriptChunk) {
              void Promise.resolve(options.onTranscriptChunk({
                event: situationEvent,
                result,
                sourceId: options.sourceId,
                environmentId: options.environmentId ?? null,
                source,
                captureSessionId,
                chunkIndex: currentChunkIndex,
                durationMs,
                fromTs,
                toTs,
              })).catch((error: unknown) => {
                options.onError?.(error instanceof Error ? error : new Error(String(error)));
              });
            }
          }
        })
        .catch((error: unknown) => {
          options.onError?.(error instanceof Error ? error : new Error(String(error)));
        });
    }, 90);
  };

  recorder.ondataavailable = (event: BlobEvent) => {
    if (stopped || !event.data || event.data.size <= 0) return;
    const now = Date.now();
    bufferedChunks.push({ chunk: event.data, atMs: now });
  };

  recorder.onerror = (event: Event) => {
    const error = (event as unknown as { error?: Error }).error ?? new Error("Display audio recorder failed.");
    options.onError?.(error);
  };

  recorder.start(recorderSliceMs);
  segmentTimer = setInterval(flushSegment, chunkMs);

  const stop = (reason: "manual" | "track_ended" = "manual"): void => {
    if (stopped) return;
    stopped = true;
    if (segmentTimer !== null) {
      clearInterval(segmentTimer);
      segmentTimer = null;
    }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch {
      // Recorder may already be stopped by the browser.
    }
    if (options.stopStreamOnStop ?? ownsStream) {
      stopStreamTracks(stream);
    }
    options.onStop?.(reason);
  };

  for (const track of stream.getTracks()) {
    track.addEventListener?.("ended", () => stop("track_ended"), { once: true });
  }

  return {
    captureSessionId,
    source,
    stream,
    recorder,
    stop,
  };
}
