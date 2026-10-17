import { describe, expect, it } from "vitest";

import {
  buildVoiceSteeringClientRequest,
  classifyVoiceSteeringClientTranscript,
  isVoiceSteeringDuringToolCall,
} from "@/lib/helix/ask-voice-steering-client";

describe("ask-voice-steering-client", () => {
  it("classifies empty, cancellation, correction, constraint, additive, and new-goal transcripts", () => {
    expect(classifyVoiceSteeringClientTranscript("  ")).toEqual({
      classification: "ambient",
      queueDecision: "ambient_ignored",
      reasonCodes: ["too_short_or_empty"],
    });
    expect(classifyVoiceSteeringClientTranscript("Stop, cancel that.")).toEqual({
      classification: "cancel_or_stop",
      queueDecision: "cancel_requested",
      reasonCodes: ["explicit_cancel_phrase"],
    });
    expect(classifyVoiceSteeringClientTranscript("Actually use meters per second.")).toEqual({
      classification: "correction",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["correction_phrase"],
    });
    expect(classifyVoiceSteeringClientTranscript("Make sure only the cited values are used.")).toEqual({
      classification: "constraint",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["constraint_phrase"],
    });
    expect(classifyVoiceSteeringClientTranscript("Also check the units.")).toEqual({
      classification: "on_topic_additive",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["additive_phrase"],
    });
    expect(classifyVoiceSteeringClientTranscript("What is the weather tomorrow?")).toEqual({
      classification: "off_topic_new_goal",
      queueDecision: "deferred_to_new_turn",
      reasonCodes: ["default_active_turn_new_goal"],
    });
  });

  it("builds a deduped voice steering request without adding runtime side effects", () => {
    expect(buildVoiceSteeringClientRequest({
      threadId: "thread:voice",
      turnId: "ask:active",
      expectedTurnId: "  ",
      transcriptText: "  Also check the units.  ",
      timing: "during_tool_call",
      evidenceRefs: ["voice:segment", "voice:segment", "voice:second"],
    })).toEqual({
      thread_id: "thread:voice",
      turn_id: "ask:active",
      expected_turn_id: "ask:active",
      transcript_text: "Also check the units.",
      source: "voice_capture",
      timing: "during_tool_call",
      classification: "on_topic_additive",
      queue_decision: "queued_for_safe_boundary",
      evidence_refs: ["voice:segment", "voice:second"],
      reason_codes: ["additive_phrase"],
    });
  });

  it("detects active tool-call steering from structured event rows only", () => {
    expect(isVoiceSteeringDuringToolCall([
      { type: "tool_call", tool: "live_env.query_event_log", status: "running" },
    ])).toBe(true);
    expect(isVoiceSteeringDuringToolCall([
      { type: "assistant_message", status: "running" },
      { type: "tool_call", status: "running" },
      { type: "status", tool: "scientific-calculator.solve_expression", status: "done" },
    ])).toBe(false);
  });
});
