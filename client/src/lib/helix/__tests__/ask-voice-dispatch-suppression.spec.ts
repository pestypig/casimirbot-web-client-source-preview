import { describe, expect, it } from "vitest";

import {
  deriveVoiceTimelineSuppressionMeta,
  inferSuppressionCauseFromRouteReason,
  resolveSuppressedDispatchRescueTranscript,
  shouldDispatchReasoningAttempt,
  shouldForceObserveDispatchFromSuppression,
} from "@/lib/helix/ask-voice-dispatch-suppression";

describe("ask-voice-dispatch-suppression", () => {
  it("admits only substantive reasoning or operation prompts for background dispatch", () => {
    expect(shouldDispatchReasoningAttempt("Verify this claim and provide evidence.")).toBe(true);
    expect(shouldDispatchReasoningAttempt("Implement the patch now.")).toBe(true);
    expect(shouldDispatchReasoningAttempt("How is a full solve done?")).toBe(true);
    expect(shouldDispatchReasoningAttempt("and what a warp bubble is the congruence of the code base")).toBe(true);
    expect(shouldDispatchReasoningAttempt("hello")).toBe(false);
    expect(shouldDispatchReasoningAttempt("hello, how are you today?")).toBe(false);
    expect(shouldDispatchReasoningAttempt("ok")).toBe(false);
    expect(shouldDispatchReasoningAttempt("thanks")).toBe(false);
  });

  it("forces observe dispatch for suppressed substantive codebase questions", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:clarify_after_attempt1",
        transcript: "What is a warp bubble false off in this codebase?",
      }),
    ).toBe(true);
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:multilang_dispatch_blocked",
        transcript: "What is a warp bubble in this codebase?",
      }),
    ).toBe(true);
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: true,
        routeReasonCode: "suppressed:clarify_after_attempt1",
        transcript: "What is a warp bubble false off in this codebase?",
      }),
    ).toBe(false);
  });

  it("maps suppressed route reasons to stable suppression causes", () => {
    expect(inferSuppressionCauseFromRouteReason("suppressed:heuristic_low_salience")).toBe("low_salience");
    expect(inferSuppressionCauseFromRouteReason("suppressed:clarify_after_attempt1")).toBe("clarifier_requested");
    expect(inferSuppressionCauseFromRouteReason("suppressed:custom reason!")).toBe("suppressed_custom_reason_");
    expect(inferSuppressionCauseFromRouteReason("dispatch:observe")).toBeNull();
  });

  it("derives suppression metadata from restart and preflight fixtures", () => {
    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_final",
        detail: "artifact-dominated output; restarting observe lane",
        meta: {},
      }),
    ).toEqual({
      suppressionCause: "artifact_guard_restart",
      authorityRejectStage: "final",
    });

    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_attempt",
        detail: "phase_not_sealed; causal_ref:timeline:f83a0039-3139-4923-b90b-ad9fd7664b68",
        meta: {
          authorityRejectStage: "preflight",
        },
      }),
    ).toEqual({
      suppressionCause: "phase_not_sealed",
      authorityRejectStage: "preflight",
    });

    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_final",
        detail: null,
        meta: null,
      }),
    ).toEqual({
      suppressionCause: "suppressed_unspecified",
      authorityRejectStage: "final",
    });
  });

  it("rescues suppressed low-info transcript fragments from richer draft context", () => {
    expect(
      resolveSuppressedDispatchRescueTranscript({
        dispatchHint: false,
        routeReasonCode: "dispatch:heuristic",
        transcript: "a notario solve.",
        draftText: "Okay, define what a warp solve is for. a notario solve.",
      }),
    ).toContain("warp solve");

    expect(
      resolveSuppressedDispatchRescueTranscript({
        dispatchHint: false,
        routeReasonCode: "suppressed:multilang_dispatch_blocked",
        transcript: "a notario solve.",
        draftText: "Okay, define what a warp solve is for. a notario solve.",
      }),
    ).toContain("warp solve");
  });
});
