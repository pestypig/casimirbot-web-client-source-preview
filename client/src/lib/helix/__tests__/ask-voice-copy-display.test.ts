import { describe, expect, it } from "vitest";
import {
  buildVoiceInputStatusLabel,
  composeVoiceBriefWithDecision,
  describeVoiceCommandAction,
  describeVoiceInputError,
  formatReasoningAttemptDetail,
  formatVoiceDecisionSentence,
  resolveReasoningAttemptTimelineText,
} from "../ask-voice-copy-display";

describe("ask voice copy display helpers", () => {
  it("formats voice command labels", () => {
    expect(describeVoiceCommandAction("send")).toBe("Send current draft");
    expect(describeVoiceCommandAction("retry")).toBe("Retry previous ask");
    expect(describeVoiceCommandAction("cancel")).toBe("Cancel pending flow");
  });

  it("formats voice input status labels from mic state", () => {
    expect(buildVoiceInputStatusLabel("off", "listening", null)).toBeNull();
    expect(buildVoiceInputStatusLabel("on", "listening", null)).toBe("Listening");
    expect(buildVoiceInputStatusLabel("on", "transcribing", null)).toBe("Transcribing");
    expect(buildVoiceInputStatusLabel("on", "cooldown", null)).toBe("Cooldown");
    expect(buildVoiceInputStatusLabel("on", "error", "Microphone permission denied.")).toBe(
      "Microphone permission denied.",
    );
    expect(buildVoiceInputStatusLabel("on", "error", null)).toBe("Voice input unavailable.");
  });

  it("formats voice input errors without owning retry or capture behavior", () => {
    expect(describeVoiceInputError(new Error("STT HTTP 401: bad key"))).toBe(
      "OpenAI STT unauthorized (401). Check OPENAI_API_KEY on server :5050.",
    );
    expect(describeVoiceInputError(new Error("fetch failed"))).toBe(
      "STT network/allowlist failure. Verify outbound host allowlist includes api.openai.com.",
    );
    const denied = new Error("");
    denied.name = "NotAllowedError";
    expect(describeVoiceInputError(denied)).toBe("Microphone permission denied.");
    const busy = new Error("");
    busy.name = "NotReadableError";
    expect(describeVoiceInputError(busy)).toBe("Microphone is busy.");
    expect(describeVoiceInputError(null)).toBe("Voice input unavailable.");
  });

  it("formats voice decision sentences without owning lifecycle policy", () => {
    expect(formatVoiceDecisionSentence({ lifecycle: "queued", routeReasonCode: "dispatch:verify" })).toBe(
      "I am thinking through a verification pass in the background.",
    );
    expect(formatVoiceDecisionSentence({ lifecycle: "running", mode: "act" })).toBe(
      "Reasoning is running in action mode.",
    );
    expect(formatVoiceDecisionSentence({ lifecycle: "suppressed", routeReasonCode: "suppressed:filler" })).toBe(
      "Reasoning is suppressed for this filler turn.",
    );
    expect(formatVoiceDecisionSentence({ lifecycle: "failed", failureReasonRaw: "REASONING_TIMEOUT" })).toBe(
      "Reasoning failed for this turn because the run timed out before completion.",
    );
  });

  it("composes brief copy with bounded decision text", () => {
    expect(composeVoiceBriefWithDecision("Short brief.", "")).toBe("Short brief.");
    expect(composeVoiceBriefWithDecision("", "Decision sentence.")).toBe("Decision sentence.");
    expect(composeVoiceBriefWithDecision("Short brief", "Decision sentence.")).toBe(
      "Short brief. Decision sentence.",
    );
    expect(composeVoiceBriefWithDecision("A".repeat(700), "Decision sentence.").length).toBeLessThanOrEqual(643);
  });

  it("shows original user turn for artifact-retry voice timeline prompts", () => {
    const prompt = [
      "Topic: warp bubble",
      "Restart observe mode from the top of the reasoning chain.",
      "",
      "Original user turn:",
      "How does the bubble relate to Casimir geometry?",
      "",
      "Previous artifact-dominated output (avoid repeating this pattern):",
      "docs/foo.md docs/bar.md",
    ].join("\n");

    expect(resolveReasoningAttemptTimelineText({ source: "voice_auto", prompt })).toBe(
      "How does the bubble relate to Casimir geometry?",
    );
    expect(resolveReasoningAttemptTimelineText({ source: "manual", prompt })).toBe(prompt);
    expect(resolveReasoningAttemptTimelineText({ source: "voice_auto", prompt, recordedText: "recorded" })).toBe(
      "recorded",
    );
  });

  it("formats reasoning attempt details without owning timeline mutation", () => {
    expect(formatReasoningAttemptDetail({ mode: "verify" }, null)).toBe("mode:verify");
    expect(formatReasoningAttemptDetail({ mode: "act" }, "running")).toBe("mode:act");
    expect(formatReasoningAttemptDetail({ mode: null }, "running")).toBe("running");
    expect(formatReasoningAttemptDetail({}, null)).toBeNull();
  });
});
