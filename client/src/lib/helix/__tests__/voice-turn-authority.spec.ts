import { describe, expect, it } from "vitest";

import {
  evaluateVoiceReasoningResponseAuthority,
  evaluateVoiceTurnSealGate,
  resolveVoiceAuthoritySuppression,
} from "@/lib/helix/voice/voice-turn-authority";

describe("voice-turn-authority", () => {
  it("projects authority suppression reasons without component state", () => {
    expect(resolveVoiceAuthoritySuppression("phase_not_sealed")).toEqual({
      suppressionReason: "voice_turn_response_phase_not_sealed",
      suppressionCause: "phase_not_sealed",
      restartDetail: "phase_not_sealed; restarting",
    });
    expect(resolveVoiceAuthoritySuppression("sealed_revision_mismatch")).toEqual({
      suppressionReason: "voice_turn_response_sealed_revision_mismatch",
      suppressionCause: "sealed_revision_mismatch",
      restartDetail: "sealed_revision_mismatch; restarting",
    });
    expect(resolveVoiceAuthoritySuppression("stale_prompt")).toEqual({
      suppressionReason: "voice_turn_response_stale_prompt",
      suppressionCause: "dispatch_hash_mismatch",
      restartDetail: "dispatch_hash_mismatch; restarting",
    });
    expect(resolveVoiceAuthoritySuppression("ok")).toEqual({
      suppressionReason: "voice_turn_response_inactive_attempt",
      suppressionCause: "inactive_attempt",
      restartDetail: "inactive_attempt; restarting",
    });
  });

  it("keeps voice response authority decisions deterministic", () => {
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "Explain the paper",
        askPromptForRequest: "Explain the paper",
        assemblerPhase: "draft",
      }),
    ).toEqual({
      suppress: true,
      reason: "phase_not_sealed",
      restart: false,
    });
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "Explain the paper",
        askPromptForRequest: "Explain the paper",
        requestDispatchPromptHash: "old",
        latestDispatchPromptHash: "new",
      }),
    ).toEqual({
      suppress: true,
      reason: "dispatch_hash_mismatch",
      restart: true,
    });
  });

  it("keeps voice turn seal gating bounded to queue and dwell inputs", () => {
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 3500,
        sttQueueDepth: 0,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 1000,
      }),
    ).toBe(true);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 3500,
        sttQueueDepth: 1,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 1000,
      }),
    ).toBe(false);
  });
});
