import { describe, expect, it } from "vitest";

import {
  VOICE_STT_CONFIRM_THRESHOLD,
  VOICE_TRANSCRIPT_AUTO_CONFIRM_BLOCK_PIVOT_CONFIDENCE,
  deriveTranscriptConfidence,
  isLowPivotBlocked,
  normalizeTranscriptConfirmPolicyReason,
  normalizeVoiceConfirmDispatchState,
  resolveTranscriptConfirmPolicy,
  shouldAutoConfirmTranscriptPrompt,
  shouldRequireTranscriptConfirmation,
} from "@/lib/helix/ask-voice-transcript-confidence";

describe("ask-voice-transcript-confidence", () => {
  it("prefers finite provider confidence and clamps it into range", () => {
    expect(deriveTranscriptConfidence({
      transcript: "ignored",
      providerConfidence: 1.5,
      segments: [{ confidence: 0.2 }],
    })).toEqual({ confidence: 1, reason: "provider_reported" });
  });

  it("averages finite segment confidence when provider confidence is absent", () => {
    expect(deriveTranscriptConfidence({
      transcript: "ignored",
      providerConfidence: null,
      segments: [{ confidence: 0.25 }, { confidence: 0.75 }, { confidence: Number.NaN }],
    })).toEqual({ confidence: 0.5, reason: "segment_average" });
  });

  it("scores text quality heuristically when structured confidence is unavailable", () => {
    expect(deriveTranscriptConfidence({
      transcript: "",
      providerConfidence: null,
      segments: [],
    })).toEqual({ confidence: 0, reason: "empty_text" });
    expect(deriveTranscriptConfidence({
      transcript: "Explain the Casimir effect in one sentence.",
      providerConfidence: null,
      segments: [],
    })).toMatchObject({
      reason: "heuristic_text_quality",
    });
  });

  it("requires confirmation for provider, translation, or threshold risk", () => {
    expect(VOICE_STT_CONFIRM_THRESHOLD).toBe(0.58);
    expect(shouldRequireTranscriptConfirmation({
      confidence: 0.91,
      translationUncertain: false,
    })).toBe(false);
    expect(shouldRequireTranscriptConfirmation({
      confidence: 0.34,
      translationUncertain: false,
    })).toBe(true);
    expect(shouldRequireTranscriptConfirmation({
      confidence: 0.92,
      translationUncertain: true,
    })).toBe(true);
    expect(shouldRequireTranscriptConfirmation({
      confidence: 0.92,
      translationUncertain: false,
      providerNeedsConfirmation: true,
    })).toBe(true);
  });

  it("normalizes transcript confirm policy reasons and dispatch state", () => {
    expect(normalizeTranscriptConfirmPolicyReason("eligible")).toBe("eligible");
    expect(normalizeTranscriptConfirmPolicyReason("pivot_low_confidence")).toBe("pivot_low_confidence");
    expect(normalizeTranscriptConfirmPolicyReason("not-a-reason")).toBeNull();
    expect(normalizeTranscriptConfirmPolicyReason(null)).toBeNull();
    expect(normalizeVoiceConfirmDispatchState("auto")).toBe("auto");
    expect(normalizeVoiceConfirmDispatchState("blocked")).toBe("blocked");
    expect(normalizeVoiceConfirmDispatchState(undefined)).toBe("confirm");
  });

  it("detects low-pivot translation blocks deterministically", () => {
    expect(VOICE_TRANSCRIPT_AUTO_CONFIRM_BLOCK_PIVOT_CONFIDENCE).toBe(0.68);
    expect(isLowPivotBlocked(0.4, true)).toBe("pivot_low_confidence");
    expect(isLowPivotBlocked(null, true)).toBe("translation_uncertain_without_pivot");
    expect(isLowPivotBlocked(Number.NaN, true)).toBe("translation_uncertain_without_pivot");
    expect(isLowPivotBlocked(0.9, true)).toBeNull();
    expect(isLowPivotBlocked(0.4, false)).toBeNull();
  });

  it("resolves transcript confirm policy without owning voice dispatch side effects", () => {
    expect(resolveTranscriptConfirmPolicy({
      dispatchState: "blocked",
      confidence: 0.9,
      translationUncertain: false,
    })).toMatchObject({
      action: "blocked",
      reason: "dispatch_blocked",
      confirmAutoEligible: false,
      confirmBlockReason: "dispatch_blocked",
    });

    expect(resolveTranscriptConfirmPolicy({
      dispatchState: "confirm",
      confidence: 0.9,
      pivotConfidence: 0.4,
      translationUncertain: true,
      sourceLanguage: "zh-hans",
    })).toMatchObject({
      action: "blocked",
      reason: "pivot_low_confidence",
    });

    expect(resolveTranscriptConfirmPolicy({
      dispatchState: "confirm",
      confidence: 0.62,
      pivotConfidence: 0.92,
      translationUncertain: false,
      lowAudioQuality: true,
    })).toMatchObject({
      action: "manual_confirm",
      reason: "low_audio_quality",
    });

    expect(resolveTranscriptConfirmPolicy({
      dispatchState: "confirm",
      confidence: 0.9,
      pivotConfidence: 0.92,
      translationUncertain: false,
      queuedSegmentCount: 1,
    })).toMatchObject({
      action: "manual_confirm",
      reason: "live_activity",
    });

    expect(resolveTranscriptConfirmPolicy({
      dispatchState: "confirm",
      confidence: 0.9,
      pivotConfidence: 0.92,
      translationUncertain: false,
    })).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
      confirmAutoEligible: true,
    });
  });

  it("projects auto-confirm eligibility through the policy resolver", () => {
    expect(shouldAutoConfirmTranscriptPrompt({
      dispatchState: "confirm",
      confidence: 0.9,
      translationUncertain: false,
    })).toBe(true);
    expect(shouldAutoConfirmTranscriptPrompt({
      dispatchState: "blocked",
      confidence: 0.9,
      translationUncertain: false,
    })).toBe(false);
  });
});
