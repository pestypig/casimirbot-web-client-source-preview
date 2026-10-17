import { describe, expect, it } from "vitest";

import {
  parseVoiceLaneTimelineJsonLines,
  summarizeVoiceLaneTurnTimeline,
} from "@/lib/helix/turn-loop-timeline-reference";

describe("turn-loop timeline reference", () => {
  it("parses timeline JSONL and summarizes healthy brief-before-final ordering", () => {
    const jsonl = [
      JSON.stringify({
        id: "e1",
        atMs: 1_000,
        source: "conversation",
        kind: "prompt_recorded",
        status: "done",
        turnKey: "voice:healthy",
      }),
      JSON.stringify({
        id: "e2",
        atMs: 1_300,
        source: "conversation",
        kind: "brief",
        status: "running",
        turnKey: "voice:healthy",
        briefSource: "llm",
      }),
      JSON.stringify({
        id: "e3",
        atMs: 2_000,
        source: "reasoning",
        kind: "reasoning_attempt",
        status: "running",
        turnKey: "voice:healthy",
      }),
      JSON.stringify({
        id: "e4",
        atMs: 2_800,
        source: "reasoning",
        kind: "reasoning_final",
        status: "done",
        turnKey: "voice:healthy",
        finalSource: "normal_reasoning",
      }),
    ].join("\n");
    const events = parseVoiceLaneTimelineJsonLines(jsonl);
    const summary = summarizeVoiceLaneTurnTimeline(events, "voice:healthy");
    expect(summary.totalEvents).toBe(4);
    expect(summary.promptRecordedCount).toBe(1);
    expect(summary.briefCount).toBe(1);
    expect(summary.finalCount).toBe(1);
    expect(summary.hasBriefBeforeFinal).toBe(true);
    expect(summary.hasSoftLockCandidate).toBe(false);
    expect(summary.issues).toHaveLength(0);
  });

  it("flags missing brief-before-final and missing typed suppression cause", () => {
    const events = parseVoiceLaneTimelineJsonLines(
      [
        JSON.stringify({
          id: "e1",
          atMs: 10,
          source: "conversation",
          kind: "prompt_recorded",
          status: "done",
          turnKey: "voice:missing-brief",
        }),
        JSON.stringify({
          id: "e2",
          atMs: 100,
          source: "reasoning",
          kind: "suppressed",
          status: "suppressed",
          turnKey: "voice:missing-brief",
          text: "Switched to your newer request.",
        }),
        JSON.stringify({
          id: "e3",
          atMs: 160,
          source: "reasoning",
          kind: "reasoning_final",
          status: "done",
          turnKey: "voice:missing-brief",
        }),
      ].join("\n"),
    );
    const summary = summarizeVoiceLaneTurnTimeline(events, "voice:missing-brief");
    expect(summary.hasBriefBeforeFinal).toBe(false);
    expect(summary.issues).toContain("missing_brief_before_final");
    expect(summary.issues).toContain("missing_typed_suppression_cause");
  });

  it("flags soft-lock candidate when suppressions loop without final completion", () => {
    const events = parseVoiceLaneTimelineJsonLines(
      [
        JSON.stringify({
          id: "e1",
          atMs: 1,
          source: "conversation",
          kind: "prompt_recorded",
          status: "done",
          turnKey: "voice:soft-lock",
        }),
        JSON.stringify({
          id: "e2",
          atMs: 2,
          source: "reasoning",
          kind: "reasoning_attempt",
          status: "running",
          turnKey: "voice:soft-lock",
        }),
        JSON.stringify({
          id: "e3",
          atMs: 3,
          source: "reasoning",
          kind: "suppressed",
          status: "suppressed",
          turnKey: "voice:soft-lock",
          suppressionCause: "dispatch_hash_mismatch",
        }),
        JSON.stringify({
          id: "e4",
          atMs: 4,
          source: "reasoning",
          kind: "reasoning_attempt",
          status: "suppressed",
          turnKey: "voice:soft-lock",
          suppressionCause: "sealed_revision_mismatch",
        }),
        JSON.stringify({
          id: "e5",
          atMs: 5,
          source: "reasoning",
          kind: "suppressed",
          status: "suppressed",
          turnKey: "voice:soft-lock",
          suppressionCause: "inactive_attempt",
        }),
      ].join("\n"),
    );
    const summary = summarizeVoiceLaneTurnTimeline(events, "voice:soft-lock");
    expect(summary.hasSoftLockCandidate).toBe(true);
    expect(summary.issues).toContain("soft_lock_candidate");
  });
});
