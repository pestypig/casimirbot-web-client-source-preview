export type VoicePlaybackLifecycleStage =
  | "json_response"
  | "audio_response"
  | "play_requested"
  | "play_resolved"
  | "playing"
  | "timeupdate"
  | "ended"
  | "error"
  | "aborted";

export type VoicePlaybackLifecycleDiagnostic = {
  schema: "helix.voice_playback_lifecycle_diagnostic.v1";
  stage: VoicePlaybackLifecycleStage;
  startedAtMs: number;
  updatedAtMs: number;
  provider: string | null;
  profile: string | null;
  mimeType: string | null;
  audioBytes: number | null;
  playResolved: boolean;
  playingObserved: boolean;
  endedObserved: boolean;
  timeupdateCount: number;
  maxCurrentTime: number;
  duration: number | null;
  muted: boolean | null;
  volume: number | null;
  paused: boolean | null;
  readyState: number | null;
  networkState: number | null;
  mediaErrorCode: number | null;
  errorMessage: string | null;
};

export class VoicePlaybackLifecycleError extends Error {
  diagnostic: VoicePlaybackLifecycleDiagnostic;

  constructor(message: string, diagnostic: VoicePlaybackLifecycleDiagnostic) {
    super(message);
    this.name = "VoicePlaybackLifecycleError";
    this.diagnostic = diagnostic;
  }
}

export function createVoicePlaybackLifecycleDiagnostic(input: {
  stage: VoicePlaybackLifecycleStage;
  provider?: string | null;
  profile?: string | null;
  mimeType?: string | null;
  audioBytes?: number | null;
  nowMs?: number;
}): VoicePlaybackLifecycleDiagnostic {
  const nowMs = input.nowMs ?? Date.now();
  return {
    schema: "helix.voice_playback_lifecycle_diagnostic.v1",
    stage: input.stage,
    startedAtMs: nowMs,
    updatedAtMs: nowMs,
    provider: input.provider ?? null,
    profile: input.profile ?? null,
    mimeType: input.mimeType ?? null,
    audioBytes: input.audioBytes ?? null,
    playResolved: false,
    playingObserved: false,
    endedObserved: false,
    timeupdateCount: 0,
    maxCurrentTime: 0,
    duration: null,
    muted: null,
    volume: null,
    paused: null,
    readyState: null,
    networkState: null,
    mediaErrorCode: null,
    errorMessage: null,
  };
}

export function updateVoicePlaybackLifecycleDiagnosticFromAudio(
  diagnostic: VoicePlaybackLifecycleDiagnostic,
  audio: HTMLAudioElement,
  stage: VoicePlaybackLifecycleStage,
  errorMessage?: string | null,
): VoicePlaybackLifecycleDiagnostic {
  const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
  return {
    ...diagnostic,
    stage,
    updatedAtMs: Date.now(),
    playResolved: diagnostic.playResolved || stage === "play_resolved",
    playingObserved: diagnostic.playingObserved || stage === "playing",
    endedObserved: diagnostic.endedObserved || stage === "ended",
    timeupdateCount: diagnostic.timeupdateCount + (stage === "timeupdate" ? 1 : 0),
    maxCurrentTime: Math.max(diagnostic.maxCurrentTime, currentTime),
    duration,
    muted: audio.muted,
    volume: Number.isFinite(audio.volume) ? audio.volume : null,
    paused: audio.paused,
    readyState: audio.readyState,
    networkState: audio.networkState,
    mediaErrorCode: audio.error?.code ?? null,
    errorMessage: errorMessage ?? diagnostic.errorMessage,
  };
}
