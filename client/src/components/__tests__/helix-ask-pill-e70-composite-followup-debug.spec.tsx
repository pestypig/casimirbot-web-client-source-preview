import { describe, expect, it } from "vitest";

import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";

describe("HelixAskPill E70 composite follow-up debug export", () => {
  it("preserves composite follow-up binding and handoff debug fields", () => {
    const payload = {
      selectedDebugQuestion: "What failed in the equation part?",
      selectedDebugFinalAnswer: "Equation lookup failed because no valid equation evidence artifact was produced.\nCause: equation_source_unavailable.",
      debug: {
        turn_id: "ask:e70",
        terminal_artifact_kind: "composite_subgoal_explanation",
        canonical_goal_frame: { goal_kind: "composite_followup" },
        composite_subgoal_reference_intent: {
          required: true,
          reference_kind: "the_equation_part",
          requested_action: "explain",
        },
        composite_subgoal_binding: {
          binding_status: "bound",
          selected_subgoal_ids: ["sg2_doc_equation_location"],
        },
        composite_handoff_decision: {
          decision: "handoff_allowed",
          accepted_artifacts: [{ artifact_kind: "typed_failure", source_scope: "prior_turn_context" }],
        },
        composite_subgoal_explanation: {
          kind: "composite_subgoal_explanation",
          source_scope: "prior_turn_context",
          selected_subgoal_ids: ["sg2_doc_equation_location"],
        },
        composite_followup_anti_determinism_audit: { verdict: "clean" },
      },
      agentLoop: {
        final_answer_source: "artifact_synthesis",
      },
    };

    const exported = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        {
          id: "ask:e70",
          question: "What failed in the equation part?",
          content: "Equation lookup failed because no valid equation evidence artifact was produced.\nCause: equation_source_unavailable.",
        },
        payload,
      ),
    );

    expect(exported.schema).toBe("helix.ask.debug_export.v1");
    expect(exported.canonical_goal_frame?.goal_kind).toBe("composite_followup");
    expect(exported.composite_subgoal_reference_intent?.reference_kind).toBe("the_equation_part");
    expect(exported.composite_subgoal_binding?.binding_status).toBe("bound");
    expect(exported.composite_handoff_decision?.decision).toBe("handoff_allowed");
    expect(exported.composite_subgoal_explanation?.source_scope).toBe("prior_turn_context");
    expect(exported.composite_followup_anti_determinism_audit?.verdict).toBe("clean");
  });

  it("uses canonical server turn id and top-level E70 fields when debug nesting is sparse", () => {
    const payload = {
      selectedDebugQuestion: "Add that result to my note.",
      selectedDebugFinalAnswer: "I could not use that prior composite subgoal for this action.\nCause: composite_subgoal_unusable.",
      debug: {
        canonical_goal_frame: { turn_id: "ask:e70-server", goal_kind: "composite_followup" },
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "composite_subgoal_unusable",
      },
      composite_subgoal_reference_intent: { reference_kind: "that_result", requested_action: "append_to_note" },
      composite_subgoal_binding: { binding_status: "ambiguous" },
      composite_handoff_decision: { decision: "needs_user_input" },
      composite_followup_anti_determinism_audit: { verdict: "clean" },
      pending_server_request: { turn_id: "ask:e70-server", item_id: "item:e70" },
      agentLoop: {
        final_answer_source: "typed_failure",
      },
    };

    const exported = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        {
          id: "ui-reply-id",
          question: "Add that result to my note.",
          content: "I could not use that prior composite subgoal for this action.\nCause: composite_subgoal_unusable.",
        },
        payload,
      ),
    );

    expect(exported.active_turn_id).toBe("ask:e70-server");
    expect(exported.backend_debug_response_ref).toEqual({
      endpoint: "/api/agi/ask/turn/ask%3Ae70-server/debug-export",
      turn_id: "ask:e70-server",
    });
    expect(exported.debug_export_source).toBe("embedded_backend_payload");
    expect(exported.backend_debug_response_status).toBe("embedded_payload");
    expect(exported.composite_subgoal_reference_intent?.reference_kind).toBe("that_result");
    expect(exported.composite_subgoal_binding?.binding_status).toBe("ambiguous");
    expect(exported.pending_server_request?.item_id).toBe("item:e70");
  });
});
