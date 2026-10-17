import { describe, expect, it } from "vitest";

import {
  buildSuppressedVoiceSpeechText,
  isBriefEchoingTranscript,
  isGenericQueuedVoiceAcknowledgement,
  isGenericRunningVoiceStatus,
  isPinnedVoiceBriefCandidate,
  isReasoningTimeoutReason,
  isVoiceTurnSupersededReason,
  normalizeBriefComparableText,
  normalizeConversationBriefSource,
  shouldSuppressVoiceForTerminalState,
} from "@/lib/helix/ask-voice-brief-policy";

describe("ask-voice-brief-policy", () => {
  it("normalizes and detects brief echoes of the transcript", () => {
    expect(normalizeBriefComparableText("I heard: Warp bubble?")).toBe("i heard warp bubble");
    expect(isBriefEchoingTranscript("What is a warp bubble?", "what is a warp bubble")).toBe(true);
    expect(isBriefEchoingTranscript("What is a warp bubble? okay", "what is a warp bubble")).toBe(true);
    expect(isBriefEchoingTranscript("I will verify the evidence path.", "what is a warp bubble")).toBe(false);
  });

  it("classifies timeout and superseded voice reasons", () => {
    expect(isReasoningTimeoutReason("reasoning_timeout:90000")).toBe(true);
    expect(isReasoningTimeoutReason("request timed out")).toBe(true);
    expect(isReasoningTimeoutReason("provider_error")).toBe(false);
    expect(isVoiceTurnSupersededReason("VOICE_TURN_CONTINUATION_MERGED")).toBe(true);
    expect(isVoiceTurnSupersededReason("the run was interrupted by a newer turn")).toBe(true);
    expect(isVoiceTurnSupersededReason("reasoning_timeout:90000")).toBe(false);
  });

  it("identifies generic queued/running status and pinned brief candidates", () => {
    expect(isGenericQueuedVoiceAcknowledgement("Got it. Thinking in the background.")).toBe(true);
    expect(isGenericRunningVoiceStatus("Reasoning is running in verify mode.")).toBe(true);
    expect(isPinnedVoiceBriefCandidate("I heard: \"What is a warp bubble?\"")).toBe(false);
    expect(isPinnedVoiceBriefCandidate("Reasoning is running in the background.")).toBe(false);
    expect(isPinnedVoiceBriefCandidate(
      "The current answer ties the calculation to the selected document and keeps the source evidence visible.",
    )).toBe(true);
  });

  it("suppresses voice for pending or typed-failure terminal states", () => {
    expect(shouldSuppressVoiceForTerminalState({ hasPendingRequest: true })).toBe(true);
    expect(shouldSuppressVoiceForTerminalState({ dispatchPolicy: "needs_user_input" })).toBe(true);
    expect(shouldSuppressVoiceForTerminalState({ routeReasonCode: "clarify:missing_scope" })).toBe(true);
    expect(shouldSuppressVoiceForTerminalState({ terminalKind: "typed_failure" })).toBe(true);
    expect(shouldSuppressVoiceForTerminalState({ finalAnswerSource: "compound_answer" })).toBe(false);
  });

  it("normalizes brief source and formats suppressed voice speech", () => {
    expect(normalizeConversationBriefSource("llm")).toBe("llm");
    expect(normalizeConversationBriefSource("manual")).toBe("none");
    expect(buildSuppressedVoiceSpeechText({
      entryText: "First sentence. Second sentence. Third sentence.",
      decisionSentence: "Reasoning needs one concrete detail.",
      routeReasonCode: "suppressed:filler",
    })).toBe("First sentence. Second sentence. Reasoning needs one concrete detail.");
    expect(buildSuppressedVoiceSpeechText({
      entryText: "This should not be used.",
      decisionSentence: "Switched to your newer request.",
      failReasonRaw: "voice_turn_response_stale",
    })).toBe("Switched to your newer request.");
  });
});
