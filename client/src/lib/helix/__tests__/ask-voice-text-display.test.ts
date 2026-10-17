import { describe, expect, it } from "vitest";
import {
  buildSpeakText,
  cleanReasoningDisplayArtifacts,
  isArtifactDominatedReasoningText,
  sanitizeConversationBriefTextForVoice,
  sanitizeReasoningOutputText,
  stripVoiceCitationArtifacts,
  summarizeVoiceDebugText,
} from "../ask-voice-text-display";

describe("ask voice text display helpers", () => {
  it("strips file citations and URLs while preserving readable text", () => {
    const spoken = buildSpeakText(
      [
        "Negative energy density is theoretical.",
        "Sources: docs/knowledge/physics/einstein-field-equations.md",
        "Tree Walk: Physics Foundations Walk (tree-derived; source: docs/knowledge/physics/physics-foundations-tree.json)",
        "Read this [reference](https://example.com/deep/link).",
      ].join("\n"),
      2000,
    );

    expect(spoken).toContain("Negative energy density is theoretical.");
    expect(spoken).toContain("Tree Walk: Physics Foundations Walk");
    expect(spoken).toContain("Read this reference.");
    expect(spoken).not.toContain("docs/knowledge/physics");
    expect(spoken).not.toContain("Sources:");
    expect(spoken).not.toContain("https://example.com");
  });

  it("caps speak text at sentence boundaries when possible", () => {
    const longText = `${"A".repeat(300)}. ${"B".repeat(320)}. ${"C".repeat(200)}`;
    const speakText = buildSpeakText(longText);

    expect(speakText.length).toBeLessThanOrEqual(600);
    expect(speakText.endsWith("...")).toBe(true);
    expect(buildSpeakText("   ")).toBe("");
  });

  it("sanitizes conversation brief text for voice playback display", () => {
    expect(sanitizeConversationBriefTextForVoice("  Why now??   Because  context... matters.  ", 200)).toBe(
      "Why now. Because context. matters.",
    );
    expect(sanitizeConversationBriefTextForVoice("abcdef", 4)).toBe("abc...");
    expect(sanitizeConversationBriefTextForVoice("abcdef", 0)).toBe("");
  });

  it("detects and sanitizes artifact-dominated reasoning text", () => {
    const noisy =
      "Runtime fallback: fetch failed Runtime fallback: fetch failed. In practice, retry with narrower scope.";

    expect(isArtifactDominatedReasoningText(noisy)).toBe(true);
    const cleaned = sanitizeReasoningOutputText(noisy);
    expect(cleaned).toContain("In practice, retry with narrower scope.");
    expect(cleaned.toLowerCase()).not.toContain("runtime fallback: fetch failed");
  });

  it("cleans display-only extension artifacts without removing real citations", () => {
    const noisy = [
      "Claim-first explanation:",
      "1. ts] Grounded equation candidates were retrieved.",
      "",
      "Details",
      "ts]",
      "4. The retrieved files still provide grounded model parameters.",
    ].join("\n");
    expect(cleanReasoningDisplayArtifacts(noisy)).not.toContain("ts]");

    const withCitation =
      "Primary equation: [server/services/mixer/collapse.ts] -> collapseMix(state, knobs).";
    expect(cleanReasoningDisplayArtifacts(withCitation)).toContain("[server/services/mixer/collapse.ts]");
  });

  it("summarizes voice debug text compactly", () => {
    expect(summarizeVoiceDebugText("  hello   world  ")).toBe("hello world");
    expect(summarizeVoiceDebugText("abcdef", 4)).toBe("abc...");
  });

  it("strips raw citation fragments directly", () => {
    const cleaned = stripVoiceCitationArtifacts(
      "Tree Walk: Warp Mechanics (tree-derived; source: docs/knowledge/warp/warp-mechanics-tree.json)",
    );
    expect(cleaned).toBe("Tree Walk: Warp Mechanics (tree-derived)");
  });
});
