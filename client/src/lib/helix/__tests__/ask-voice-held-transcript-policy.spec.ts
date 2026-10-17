import { describe, expect, it } from "vitest";
import {
  shouldFlushHeldTranscriptFromWatchdog,
  shouldMergePendingConfirmationTranscript,
  shouldRecoverHeldTranscriptAfterNoTranscript,
} from "../ask-voice-held-transcript-policy";

describe("ask voice held transcript policy", () => {
  it("recovers held transcript after a quiet complete turn", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript:
          "Virtual particles are not directly observable, but they result in the Casimir effect, so can you relate that?",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 3600,
      }),
    ).toBe(true);
  });

  it("does not recover before silence, while active, or for low-information tails", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "Virtual particles are not directly observable.",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 1800,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "A continuation is still happening",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: true,
        sinceLastSpeechMs: 4000,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "Friends.",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 4000,
      }),
    ).toBe(false);
  });

  it("flushes held transcript watchdog only for quiet continuation holds", () => {
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript:
          "Classical mechanics and quantum mechanics can meet at Penrose objective reduction. Can you get into how our curvature unit does that?",
        holdReason: "continuation_hold",
        transcribeQueueLength: 0,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 3600,
        ageMs: 2400,
      }),
    ).toBe(true);
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript: "Can you relate that to Casimir vacuum effects?",
        holdReason: "continuation_hold",
        transcribeQueueLength: 1,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 3600,
        ageMs: 2400,
      }),
    ).toBe(false);
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript: "Can you relate that to Casimir vacuum effects?",
        holdReason: "low_info_tail",
        transcribeQueueLength: 0,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 3600,
        ageMs: 2400,
      }),
    ).toBe(false);
  });

  it("merges pending confirmations for continuation or low-salience fragments", () => {
    expect(
      shouldMergePendingConfirmationTranscript({
        pendingTranscript: "How does the immersion of fantasy reflect the",
        nextTranscript: "Human qualities in storytelling.",
        pendingAgeMs: 1800,
      }),
    ).toBe(true);
    expect(
      shouldMergePendingConfirmationTranscript({
        pendingTranscript: "What is a warp bubble in this codebase?",
        nextTranscript: "Actually switch topics and explain tomato soil acidity.",
        pendingAgeMs: 1500,
      }),
    ).toBe(false);
    expect(
      shouldMergePendingConfirmationTranscript({
        pendingTranscript: "What is a warp bubble in this codebase?",
        nextTranscript: "Friends.",
        pendingAgeMs: 1500,
      }),
    ).toBe(true);
  });
});
