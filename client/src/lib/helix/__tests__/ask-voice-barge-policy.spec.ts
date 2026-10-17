import { describe, expect, it } from "vitest";

import {
  VOICE_BARGE_HARD_CUT_PERSIST_MS,
  mapVoicePreemptPolicyToCancelReason,
  resolveVoiceBargeHardCutReason,
  shouldInterruptForSupersededReason,
  shouldResumeBargeHeldPlayback,
} from "@/lib/helix/ask-voice-barge-policy";

describe("ask-voice-barge-policy", () => {
  it("resolves hard-cut reasons in deterministic priority order", () => {
    expect(VOICE_BARGE_HARD_CUT_PERSIST_MS).toBe(700);
    expect(resolveVoiceBargeHardCutReason({
      holdActive: false,
      holdStartedAtMs: 0,
      nowMs: 900,
      transcribeQueueLength: 1,
      transcribeBusy: true,
      pendingConfirmation: true,
      speechActive: true,
    })).toBeNull();
    expect(resolveVoiceBargeHardCutReason({
      holdActive: true,
      holdStartedAtMs: 0,
      nowMs: 900,
      transcribeQueueLength: 1,
      transcribeBusy: true,
      pendingConfirmation: true,
      speechActive: true,
    })).toBe("pending_confirmation");
    expect(resolveVoiceBargeHardCutReason({
      holdActive: true,
      holdStartedAtMs: 0,
      nowMs: 900,
      transcribeQueueLength: 1,
      transcribeBusy: true,
      pendingConfirmation: false,
      speechActive: true,
    })).toBe("stt_queue");
    expect(resolveVoiceBargeHardCutReason({
      holdActive: true,
      holdStartedAtMs: 0,
      nowMs: 900,
      transcribeQueueLength: 0,
      transcribeBusy: true,
      pendingConfirmation: false,
      speechActive: true,
    })).toBe("stt_busy");
    expect(resolveVoiceBargeHardCutReason({
      holdActive: true,
      holdStartedAtMs: 100,
      nowMs: 900,
      transcribeQueueLength: 0,
      transcribeBusy: false,
      pendingConfirmation: false,
      speechActive: true,
    })).toBe("speech_persisted");
  });

  it("resumes held playback only after quiet ready conditions", () => {
    const ready = {
      holdActive: true,
      resumeNotBeforeMs: 1000,
      nowMs: 1200,
      transcribeQueueLength: 0,
      transcribeBusy: false,
      pendingConfirmation: false,
      speechActive: false,
      micArmed: true,
      segmentFlushPending: false,
      trafficQuietUntilMs: null,
    };
    expect(shouldResumeBargeHeldPlayback(ready)).toBe(true);
    expect(shouldResumeBargeHeldPlayback({ ...ready, nowMs: 900 })).toBe(false);
    expect(shouldResumeBargeHeldPlayback({ ...ready, speechActive: true })).toBe(false);
    expect(shouldResumeBargeHeldPlayback({ ...ready, trafficQuietUntilMs: 1300 })).toBe(false);
  });

  it("maps preemption policy and interruption decisions without queue mutation", () => {
    expect(mapVoicePreemptPolicyToCancelReason("pending_final")).toBe("preempted_by_final");
    expect(mapVoicePreemptPolicyToCancelReason("boundary")).toBe("superseded_same_turn");
    expect(shouldInterruptForSupersededReason("superseded_same_turn", true)).toBe(false);
    expect(shouldInterruptForSupersededReason("preempted_by_final", false)).toBe(false);
    expect(shouldInterruptForSupersededReason("preempted_by_final", true)).toBe(true);
    expect(shouldInterruptForSupersededReason(null, true)).toBe(false);
  });
});
