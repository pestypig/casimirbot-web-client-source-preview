import { describe, expect, it } from "vitest";
import {
  buildExplorationArtifactRetryPrompt,
  buildExplorationEscalationPrompt,
  isRepoCodeEvidencePrompt,
  isRepoFileLocationRequestPrompt,
  resolveAskContextChooserAutoMode,
} from "../ask-exploration-policy";

describe("ask exploration policy helpers", () => {
  it("detects repo file-location requests", () => {
    expect(isRepoFileLocationRequestPrompt("Where is the calculator implemented?")).toBe(true);
    expect(isRepoFileLocationRequestPrompt("show me the source code paths")).toBe(true);
    expect(isRepoFileLocationRequestPrompt("which file defines the Helix ask console?")).toBe(true);
    expect(isRepoFileLocationRequestPrompt("what is the repository path for the UI?")).toBe(true);
  });

  it("does not flag ordinary explanation prompts as file-location requests", () => {
    expect(isRepoFileLocationRequestPrompt("Explain the Helix Ask console behavior.")).toBe(false);
    expect(isRepoFileLocationRequestPrompt("Summarize the current document.")).toBe(false);
    expect(isRepoFileLocationRequestPrompt("   ")).toBe(false);
  });

  it("detects repo-code evidence prompts for isolated context routing", () => {
    expect(isRepoCodeEvidencePrompt("cite exact file paths for the route contract")).toBe(true);
    expect(isRepoCodeEvidencePrompt("where is requestedLaneSchema wired?")).toBe(true);
    expect(isRepoCodeEvidencePrompt("show client/src/components/helix/HelixAskPill.tsx")).toBe(true);
    expect(isRepoCodeEvidencePrompt("explain the current whitepaper")).toBe(false);
  });

  it("resolves context chooser auto mode without owning request submission", () => {
    expect(resolveAskContextChooserAutoMode("cite exact file paths for the Ask request envelope")).toEqual({
      mode: "isolated",
      reason: "repo_code_evidence_prompt",
    });
    expect(resolveAskContextChooserAutoMode("analyze this screenshot and source file path together")).toEqual({
      mode: "attached",
      reason: "workspace_context_reasoning_prompt",
    });
    expect(resolveAskContextChooserAutoMode("summarize the current document")).toEqual({
      mode: "attached",
      reason: "workspace_context_reasoning_prompt",
    });
  });

  it("builds verify and act escalation prompts from clipped topic and previous output", () => {
    const verify = buildExplorationEscalationPrompt({
      mode: "verify",
      prompt: "verify this route",
      previousOutput: "observe output",
      packet: { topic: "NHM2 route integrity" },
    });
    expect(verify).toContain("Topic: NHM2 route integrity");
    expect(verify).toContain("Run verify mode on this exploration thread.");
    expect(verify).toContain("Return pass/fail with grounded evidence anchors");
    expect(verify).toContain("Original user turn:\nverify this route");
    expect(verify).toContain("Observe attempt output:\nobserve output");

    const act = buildExplorationEscalationPrompt({
      mode: "act",
      prompt: "fix the route",
      previousOutput: "observe output",
    });
    expect(act).toContain("Topic: fix the route");
    expect(act).toContain("Run act mode on this exploration thread.");
    expect(act).toContain("Return concrete execution steps and expected receipts");
  });

  it("builds artifact-retry prompts with repo-file guidance only for file-location requests", () => {
    const fileRetry = buildExplorationArtifactRetryPrompt({
      prompt: "Where is the Helix ask console implemented?",
      previousOutput: "tree walk: docs and mission scaffolds",
      packet: { topic: "console location" },
    });
    expect(fileRetry).toContain("Topic: console location");
    expect(fileRetry).toContain("include concrete file paths only when they directly answer");
    expect(fileRetry).toContain("Previous artifact-dominated output");

    const ordinaryRetry = buildExplorationArtifactRetryPrompt({
      prompt: "Explain the Helix ask console behavior.",
      previousOutput: "tree walk: docs and mission scaffolds",
    });
    expect(ordinaryRetry).toContain("Do not emit repository file lists");
    expect(ordinaryRetry).not.toContain("include concrete file paths only");
  });
});
