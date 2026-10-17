import { describe, expect, it } from "vitest";
import {
  cleanPromptLine,
  decideHelixAskFormat,
  extractAnswerBlock,
  normalizeQuestionMatch,
  stripAnswerBoundaryPrefix,
  stripEvidencePromptBlock,
  stripInlineQuestionLine,
  stripLeadingQuestion,
  stripPromptEcho,
  stripQuestionPrefixText,
  stripStageTags,
} from "../ask-output-cleanup";

describe("ask output cleanup", () => {
  it("removes answer boundary prefixes repeatedly", () => {
    expect(stripAnswerBoundaryPrefix("  ANSWER_START ANSWER_END Final text")).toBe("Final text");
  });

  it("strips stage tags from line endings only", () => {
    expect(stripStageTags("First (observe)\nKeep (observe) inside sentence.\nFinal (explain)")).toBe(
      "First\nKeep (observe) inside sentence.\nFinal",
    );
  });

  it("normalizes question text for matching", () => {
    expect(normalizeQuestionMatch("Current NHM2 whitepaper?")).toBe("current nhm2 whitepaper");
  });

  it("extracts inline question answer tails", () => {
    expect(stripInlineQuestionLine("Question: What is 3+5? 8", "What is 3+5?")).toBe("8");
    expect(stripInlineQuestionLine("Question: Question: What is 3+5? 8")).toBe("8");
    expect(stripInlineQuestionLine("Answer: 8")).toBeNull();
  });

  it("strips question prefix text from the first line only", () => {
    expect(stripQuestionPrefixText("Question: What is 3+5? 8\nDetails", "What is 3+5?")).toBe("8\nDetails");
    expect(stripQuestionPrefixText("Question:\n8")).toBe("8");
  });

  it("cleans prompt punctuation wrappers", () => {
    expect(cleanPromptLine('  "`..Answer.,`"  ')).toBe("Answer");
  });

  it("removes leading echoed question scaffolding", () => {
    const response = ["Question: What is 3+5?", "Context: calculator", "", "8"].join("\n");
    expect(stripLeadingQuestion(response, "What is 3+5?")).toBe("8");
  });

  it("extracts the most useful answer block from marker-heavy fallback output", () => {
    expect(extractAnswerBlock("ANSWER_START\nshort\nANSWER_END\nANSWER_START\nlonger final\nANSWER_END")).toBe(
      "longer final",
    );
    expect(extractAnswerBlock("noise\nFINAL ANSWER: terminal answer")).toBe("noise\nFINAL ANSWER: terminal answer");
  });

  it("removes scaffold evidence prompt blocks before fallback display", () => {
    expect(stripEvidencePromptBlock(["Intro", "Evidence:", "- source A", "Answer:", "Final text"].join("\n"))).toBe(
      "Intro\nFinal text",
    );
    expect(stripEvidencePromptBlock("Evidence:\n- source A")).toBe("Evidence:\n- source A");
  });

  it("strips echoed fallback prompt scaffolds without changing answer authority", () => {
    const fallback = [
      "Question: What is 3+5?",
      "ANSWER_START",
      "8 (explain)",
      "ANSWER_END",
    ].join("\n");
    expect(stripPromptEcho(fallback, "What is 3+5?")).toBe("8 (explain)");
  });

  it("preserves stage tags for method-format fallback answers", () => {
    const fallback = ["ANSWER_START", "Step one (observe)", "ANSWER_END"].join("\n");
    expect(stripPromptEcho(fallback, "Use the scientific method here")).toBe("Step one (observe)");
  });

  it("classifies answer cleanup format hints deterministically", () => {
    expect(decideHelixAskFormat()).toEqual({ format: "brief", stageTags: false });
    expect(decideHelixAskFormat("Use the scientific method on this claim")).toEqual({
      format: "steps",
      stageTags: true,
    });
    expect(decideHelixAskFormat("How do I troubleshoot this pipeline?")).toEqual({
      format: "steps",
      stageTags: false,
    });
    expect(decideHelixAskFormat("Compare these two approaches")).toEqual({
      format: "compare",
      stageTags: false,
    });
  });
});
