const VOICE_PLAYBACK_DIRECT_RETRY_MAX = 1;

const VOICE_PLAYBACK_ERROR_RECOVER_MIN_SECONDS = 0.65;
const VOICE_PLAYBACK_ERROR_RECOVER_MIN_SECONDS_NO_DURATION = 1.2;
const VOICE_PLAYBACK_ERROR_RECOVER_DURATION_RATIO = 0.35;
const VOICE_PLAYBACK_ERROR_RECOVER_DIRECT_FALLBACK_MIN_SECONDS = 0.3;

export function shouldRetryVoicePlaybackWithDirectFallback(params: {
  graphAttached: boolean;
  directFallbackAttempted: boolean;
}): boolean {
  return params.graphAttached && !params.directFallbackAttempted;
}

export function shouldRetryVoicePlaybackDirectAttempt(params: {
  graphAttached: boolean;
  directFallbackAttempted: boolean;
  directRetryCount: number;
}): boolean {
  return (
    !params.graphAttached &&
    params.directFallbackAttempted &&
    params.directRetryCount < VOICE_PLAYBACK_DIRECT_RETRY_MAX
  );
}

export function shouldTreatVoicePlaybackErrorAsEnded(params: {
  playedSeconds: number;
  durationSeconds: number | null;
  directFallbackAttempted?: boolean;
}): boolean {
  if (!Number.isFinite(params.playedSeconds)) return false;
  const playedSeconds = Math.max(0, params.playedSeconds);
  if (
    params.directFallbackAttempted &&
    playedSeconds >= VOICE_PLAYBACK_ERROR_RECOVER_DIRECT_FALLBACK_MIN_SECONDS
  ) {
    return true;
  }
  if (playedSeconds < VOICE_PLAYBACK_ERROR_RECOVER_MIN_SECONDS) return false;
  const durationSeconds =
    typeof params.durationSeconds === "number" && Number.isFinite(params.durationSeconds)
      ? params.durationSeconds
      : null;
  if (!durationSeconds || durationSeconds <= 0) {
    return playedSeconds >= VOICE_PLAYBACK_ERROR_RECOVER_MIN_SECONDS_NO_DURATION;
  }
  const ratio = playedSeconds / Math.max(durationSeconds, 1e-6);
  return ratio >= VOICE_PLAYBACK_ERROR_RECOVER_DURATION_RATIO;
}

export function isRetryableVoiceChunkSynthesisError(error: unknown): boolean {
  const err = error as {
    status?: unknown;
    name?: unknown;
    message?: unknown;
  } | null;
  const status = typeof err?.status === "number" && Number.isFinite(err.status) ? err.status : null;
  const name = typeof err?.name === "string" ? err.name.toLowerCase() : "";
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof err?.message === "string"
        ? err.message.toLowerCase()
        : String(error ?? "").toLowerCase();
  if (message.startsWith("voice_auto_speak_suppressed:")) return false;
  if (name === "aborterror" || /\babort(ed)?\b/.test(message)) return false;
  if (status !== null && (status === 408 || status === 425 || status === 429 || status >= 500)) {
    return true;
  }
  return /\b(failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|temporarily unavailable)\b/.test(
    message,
  );
}

export function isVoiceMemoryPressureError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return (
    status === 503 &&
    /voice_memory_pressure|memory pressure|temporarily paused/i.test(error.message)
  );
}
