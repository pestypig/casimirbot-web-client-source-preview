import { describe, expect, it } from "vitest";
import {
  extractIntentTerms,
  extractLatestContinuationQuestionFocus,
  hasDanglingTurnTail,
  hasSufficientLexicalCarryover,
  isLikelyContinuationAddendum,
  isLikelyContinuationTailFragment,
  isLikelyNearTurnContinuation,
  isLowInformationTailTranscript,
  shouldMergeVoiceContinuationInFlight,
  shouldMergeVoiceContinuationTurn,
  shouldRestartExplorationLadderOnSupersede,
} from "../ask-voice-continuation-lexical";

describe("ask voice continuation lexical helpers", () => {
  it("extracts stable intent terms with a cap", () => {
    expect(extractIntentTerms("Current NHM2 whitepaper: compare verified claims", 3)).toEqual([
      "current",
      "nhm2",
      "whitepaper",
    ]);
  });

  it("detects dangling turn tails", () => {
    expect(hasDanglingTurnTail("the virtual particles of the energy density is the")).toBe(true);
    expect(hasDanglingTurnTail("quantum systems exhibit superposition.")).toBe(false);
  });

  it("classifies low-information tails without suppressing action words", () => {
    expect(isLowInformationTailTranscript("Friends.")).toBe(true);
    expect(isLowInformationTailTranscript("Define quantum system")).toBe(false);
  });

  it("extracts a latest continuation question focus", () => {
    expect(
      extractLatestContinuationQuestionFocus("Okay, define a system. So, what about a statistical quantum system?"),
    ).toBe("So, what about a statistical quantum system?");
    expect(extractLatestContinuationQuestionFocus("Just a single sentence?")).toBeNull();
  });

  it("requires at least two lexical carryover terms", () => {
    expect(hasSufficientLexicalCarryover("compare energy density now", "explain energy density comparison")).toBe(true);
    expect(hasSufficientLexicalCarryover("compare calculator result", "explain energy density comparison")).toBe(false);
  });

  it("detects near-turn continuations from deixis, connectors, or lexical carryover", () => {
    expect(isLikelyNearTurnContinuation({ transcript: "where is that from", priorUserTurn: "Open the paper" })).toBe(true);
    expect(isLikelyNearTurnContinuation({ transcript: "and compare energy density", priorUserTurn: "Explain energy density" })).toBe(true);
    expect(
      isLikelyNearTurnContinuation({
        transcript: "compare energy density now",
        priorUserTurn: "explain energy density comparison",
      }),
    ).toBe(true);
    expect(isLikelyNearTurnContinuation({ transcript: "new unrelated topic", priorUserTurn: "explain energy density" })).toBe(false);
  });

  it("merges nearby voice continuation turns without accepting stale fragments", () => {
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "Explain the Casimir setup",
        nextTranscript: "and compare the energy density",
        gapMs: 800,
      }),
    ).toBe(true);
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "Explain the Casimir setup",
        nextTranscript: "new unrelated request",
        gapMs: 12_000,
      }),
    ).toBe(false);
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "Explain the Casimir setup.",
        nextTranscript: "Short fragment",
        gapMs: 800,
      }),
    ).toBe(false);
  });

  it("merges active in-flight continuations by window or lexical continuity", () => {
    expect(shouldMergeVoiceContinuationInFlight({ gapMs: 500, lexicalContinuation: false })).toBe(true);
    expect(shouldMergeVoiceContinuationInFlight({ gapMs: 30_000, lexicalContinuation: true })).toBe(true);
    expect(shouldMergeVoiceContinuationInFlight({ gapMs: 30_000, lexicalContinuation: false })).toBe(false);
  });

  it("keeps supersede restart policy deterministic", () => {
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: false,
        shortContinuationAddendum: false,
        canMergeContinuation: false,
        intentShiftBand: "shift",
      }),
    ).toBe(true);
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: true,
        shortContinuationAddendum: false,
        canMergeContinuation: false,
        intentShiftBand: "shift",
      }),
    ).toBe(false);
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: false,
        shortContinuationAddendum: false,
        canMergeContinuation: true,
        intentShiftBand: "continuation",
      }),
    ).toBe(false);
  });

  it("classifies addendum and tail fragments without treating questions as tails", () => {
    expect(isLikelyContinuationAddendum("So gravity is like where this converges.")).toBe(true);
    expect(isLikelyContinuationAddendum("Define a system from scratch with examples.")).toBe(false);
    expect(isLikelyContinuationTailFragment("probability that happens in the Casimir effect.")).toBe(true);
    expect(isLikelyContinuationTailFragment("What is the Casimir effect?")).toBe(false);
  });
});
