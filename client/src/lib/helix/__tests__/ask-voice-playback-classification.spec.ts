import { describe, expect, it } from "vitest";
import {
  isRetryableVoiceChunkSynthesisError,
  isVoiceMemoryPressureError,
  shouldRetryVoicePlaybackDirectAttempt,
  shouldRetryVoicePlaybackWithDirectFallback,
  shouldTreatVoicePlaybackErrorAsEnded,
} from "../ask-voice-playback-classification";

describe("ask voice playback classification", () => {
  it("classifies graph fallback and direct retry attempts", () => {
    expect(shouldRetryVoicePlaybackWithDirectFallback({ graphAttached: true, directFallbackAttempted: false })).toBe(true);
    expect(shouldRetryVoicePlaybackWithDirectFallback({ graphAttached: false, directFallbackAttempted: false })).toBe(false);
    expect(
      shouldRetryVoicePlaybackDirectAttempt({
        graphAttached: false,
        directFallbackAttempted: true,
        directRetryCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryVoicePlaybackDirectAttempt({
        graphAttached: false,
        directFallbackAttempted: true,
        directRetryCount: 1,
      }),
    ).toBe(false);
  });

  it("classifies recoverable playback errors as ended only after enough progress", () => {
    expect(shouldTreatVoicePlaybackErrorAsEnded({ playedSeconds: 0.2, durationSeconds: 10 })).toBe(false);
    expect(shouldTreatVoicePlaybackErrorAsEnded({ playedSeconds: 4, durationSeconds: 10 })).toBe(true);
    expect(shouldTreatVoicePlaybackErrorAsEnded({ playedSeconds: 1.3, durationSeconds: null })).toBe(true);
    expect(
      shouldTreatVoicePlaybackErrorAsEnded({
        playedSeconds: 0.35,
        durationSeconds: 10,
        directFallbackAttempted: true,
      }),
    ).toBe(true);
  });

  it("classifies retryable synthesis errors without retrying aborts or suppressed turns", () => {
    expect(isRetryableVoiceChunkSynthesisError(new Error("Failed to fetch"))).toBe(true);
    expect(isRetryableVoiceChunkSynthesisError({ status: 429, message: "rate limited" })).toBe(true);
    expect(isRetryableVoiceChunkSynthesisError({ name: "AbortError", message: "aborted" })).toBe(false);
    expect(isRetryableVoiceChunkSynthesisError("voice_auto_speak_suppressed: stale")).toBe(false);
  });

  it("classifies voice memory pressure errors", () => {
    const error = new Error("voice_memory_pressure: temporarily paused") as Error & { status?: number };
    error.status = 503;
    expect(isVoiceMemoryPressureError(error)).toBe(true);
    expect(isVoiceMemoryPressureError(new Error("temporarily paused"))).toBe(false);
  });
});
