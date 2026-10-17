import { describe, expect, it } from "vitest";

import {
  formatHelixVisibleTerminalSourceLabel,
  resolveHelixVisibleTerminal,
  shouldShowHelixRuntimeStopReason,
} from "./resolveHelixVisibleTerminal";

describe("resolveHelixVisibleTerminal", () => {
  it("prefers terminal envelope text over stale legacy fields", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "stale selected answer",
      content: "stale content",
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text: "authoritative envelope answer",
        terminal_kind: "direct_answer_text",
        final_answer_source: "artifact_synthesis",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: "authoritative envelope answer",
      },
    });

    expect(terminal.text).toBe("authoritative envelope answer");
    expect(terminal.source).toBe("terminal_answer_envelope");
    expect(terminal.usedLegacyShadow).toBe(false);
  });

  it("lets a successful backend envelope supersede stale failure fields", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "I could not complete that turn.\nCause: pending_request_missing.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "pending_request_missing",
      pending_server_request: {
        schema: "helix.pending_server_request.v1",
        status: "pending",
      },
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text: "Calculator-backed result: ((sqrt(81)+ln(e^3))*7-5^2)/2 = 29.5.",
        terminal_kind: "answer",
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "workstation_tool_evaluation",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_text_preview: "Calculator-backed result: ((sqrt(81)+ln(e^3))*7-5^2)/2 = 29.5.",
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "workstation_tool_evaluation",
      },
    });

    expect(terminal.text).toContain("29.5");
    expect(terminal.source).toBe("terminal_answer_envelope");
    expect(terminal.terminalErrorCode).toBeNull();
    expect(terminal.finalAnswerSource).toBe("workstation_tool_evaluation");
    expect(terminal.terminalArtifactKind).toBe("workstation_tool_evaluation");
  });

  it("normalizes stale final answer draft source to the selected workstation terminal artifact", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "Calculator-backed result: ((sqrt(81)+ln(e^3))*7-5^2)/2 = 29.5.",
      final_answer_source: "final_answer_draft",
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_text_preview: "Calculator-backed result: ((sqrt(81)+ln(e^3))*7-5^2)/2 = 29.5.",
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "final_answer_draft",
      },
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        terminal_artifact_kind: "workstation_tool_evaluation",
        concise_text: "Calculator-backed result: ((sqrt(81)+ln(e^3))*7-5^2)/2 = 29.5.",
      },
      resolved_turn_summary: {
        final_status: "final_answer",
        resolved_route_label: "calculator_solve / model_synthesized_answer",
        terminal_artifact_kind: "workstation_tool_evaluation",
      },
    });

    expect(terminal.text).toContain("29.5");
    expect(terminal.source).toBe("terminal_answer_authority");
    expect(terminal.terminalArtifactKind).toBe("workstation_tool_evaluation");
    expect(terminal.finalAnswerSource).toBe("workstation_tool_evaluation");
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: terminal.terminalArtifactKind,
        finalAnswerSource: terminal.finalAnswerSource,
      }),
    ).toBe("workstation tool evaluation");
  });

  it("does not render terminal authority preview as the full final answer", () => {
    const fullAnswer =
      "I cannot answer scholarly paper content from this turn because no scholarly-research.lookup_papers observation packet was materialized.\nAsk with an explicit scholarly search target, DOI, or arXiv id so Helix can create bounded research-paper evidence first.";
    const preview = fullAnswer.slice(0, 240);

    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: fullAnswer,
      final_answer_source: "compound_evidence_synthesis_answer",
      terminal_artifact_kind: "compound_evidence_synthesis_answer",
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        final_answer_source: "compound_evidence_synthesis_answer",
        terminal_artifact_kind: "compound_evidence_synthesis_answer",
        terminal_text_preview: preview,
      },
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: fullAnswer,
        final_answer_source: "compound_evidence_synthesis_answer",
        terminal_artifact_kind: "compound_evidence_synthesis_answer",
      },
    });

    expect(terminal.text).toBe(fullAnswer);
    expect(terminal.text).toContain("research-paper evidence first.");
    expect(terminal.source).toBe("terminal_answer_authority");
  });

  it("shows an authorized retained scientific packet as the scholarly route product", () => {
    const packetAnswer =
      "Scientific evidence packet ref: `sha256:packet#crop=120,205,500,120`. Exact-equation admissibility: `partial_candidate`.";
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: packetAnswer,
      final_answer_source: "scientific_image_evidence_continuity_summary",
      terminal_artifact_kind: "scholarly_research_answer",
      route_evidence_authority: {
        schema: "helix.route_evidence_authority.v1",
        terminal_product_allowed: true,
        required_terminal_kind: "scholarly_research_answer",
        allowed_terminal_artifact_kinds: ["scholarly_research_answer", "typed_failure"],
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_text_preview: packetAnswer,
        final_answer_source: "scientific_image_evidence_continuity_summary",
        terminal_artifact_kind: "scholarly_research_answer",
      },
    });

    expect(terminal.text).toBe(packetAnswer);
    expect(terminal.source).toBe("terminal_answer_authority");
    expect(terminal.terminalArtifactKind).toBe("scholarly_research_answer");
    expect(terminal.finalAnswerSource).toBe("scientific_image_evidence_continuity_summary");
    expect(terminal.terminalErrorCode).toBeNull();
  });

  it("explains which selected terminal product a route rejected", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "Receipt evaluated: `equation_47`.",
      final_answer_source: "image_lens_named_receipt_evaluation",
      terminal_artifact_kind: "image_lens_named_receipt_evaluation",
      route_evidence_authority: {
        schema: "helix.route_evidence_authority.v1",
        terminal_product_allowed: true,
        required_terminal_kind: "image_lens_observation_report",
        allowed_terminal_artifact_kinds: ["image_lens_observation_report", "typed_failure"],
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_text_preview: "Receipt evaluated: `equation_47`.",
        final_answer_source: "image_lens_named_receipt_evaluation",
        terminal_artifact_kind: "image_lens_named_receipt_evaluation",
      },
    });

    expect(terminal.text).toContain("route required `image_lens_observation_report`");
    expect(terminal.text).toContain("solver produced `image_lens_named_receipt_evaluation`");
    expect(terminal.text).toContain("Allowed terminal products: `image_lens_observation_report`, `typed_failure`");
    expect(terminal.terminalErrorCode).toBe("route_terminal_product_not_allowed");
  });

  it("prefers terminal envelope text over stale model-synthesis selected_final_answer", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "stale model synthesis",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text: "authoritative model synthesis",
        terminal_kind: "answer",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "final_answer_draft",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: "authoritative model synthesis",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "final_answer_draft",
      },
    });

    expect(terminal.text).toBe("authoritative model synthesis");
    expect(terminal.source).toBe("terminal_answer_envelope");
  });

  it("projects compound synthesis authority over stale receipt text", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "Calculator receipt: 42",
      final_answer_source: "calculator_receipt",
      terminal_artifact_kind: "calculator_receipt",
      capability_itinerary: {
        schema: "helix.capability_itinerary.v1",
        terminal_success_criteria: {
          compound_terminal_policy: "synthesize_from_satisfied_subgoal_observations",
          forbidden_terminal_artifact_kinds: ["tool_receipt", "calculator_receipt"],
        },
      },
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text: "Located the document evidence and calculated 42 from the satisfied subgoal observations.",
        terminal_kind: "answer",
        terminal_artifact_kind: "doc_evidence_synthesis_answer",
        final_answer_source: "doc_evidence_synthesis_answer",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_text_preview: "Located the document evidence and calculated 42 from the satisfied subgoal observations.",
        terminal_artifact_kind: "doc_evidence_synthesis_answer",
        final_answer_source: "doc_evidence_synthesis_answer",
      },
    });

    expect(terminal.text).toContain("satisfied subgoal observations");
    expect(terminal.text).not.toContain("Calculator receipt");
    expect(terminal.source).toBe("terminal_answer_envelope");
    expect(terminal.terminalArtifactKind).toBe("doc_evidence_synthesis_answer");
    expect(terminal.finalAnswerSource).toBe("doc_evidence_synthesis_answer");
    expect(terminal.terminalErrorCode).toBeNull();
  });

  it("uses authoritative doc summary terminal surfaces over stale authority-missing content", () => {
    const summary =
      "Summary of docs/helix-ask-flow.md:\n- Routing enters Helix Ask through source-target arbitration.\n- Evidence must re-enter the solver path before terminal authority.\n- Presentation mirrors the selected terminal artifact.";
    const terminal = resolveHelixVisibleTerminal({
      content: "I could not complete that turn.\nCause: terminal_authority_missing.",
      selected_final_answer: summary,
      final_answer_source: "artifact_synthesis",
      terminal_artifact_kind: "doc_summary",
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text: summary,
        terminal_kind: "answer",
        terminal_artifact_kind: "doc_summary",
        final_answer_source: "artifact_synthesis",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: summary,
        terminal_artifact_kind: "doc_summary",
        final_answer_source: "artifact_synthesis",
      },
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: summary,
        terminal_artifact_kind: "doc_summary",
      },
      resolved_turn_summary: {
        final_status: "final_answer",
        terminal_artifact_kind: "doc_summary",
        terminal_error_code: null,
      },
    });

    expect(terminal.text).toBe(summary);
    expect(terminal.source).toBe("terminal_answer_envelope");
    expect(terminal.terminalErrorCode).toBeNull();
    expect(terminal.text).not.toContain("terminal_authority_missing");
  });

  it("does not let source-targeted legacy selected_final_answer become visible truth without authority", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "legacy ghost answer",
      final_answer_source: "artifact_synthesis",
      canonical_goal_frame: {
        goal_kind: "doc_open_best",
      },
      source_target_intent: {
        target_source: "active_doc",
        strength: "hard",
      },
    });

    expect(terminal.text).toContain("terminal_authority_missing");
    expect(terminal.text).not.toContain("legacy ghost answer");
    expect(terminal.source).toBe("terminal_authority_missing");
  });

  it("does not let source-targeted terminal presentation become visible truth without authority", () => {
    const terminal = resolveHelixVisibleTerminal({
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: "presentation-only answer",
        terminal_artifact_kind: "doc_summary",
      },
      canonical_goal_frame: {
        goal_kind: "doc_summary",
      },
      source_target_intent: {
        target_source: "docs_viewer",
        strength: "hard",
      },
    });

    expect(terminal.text).toContain("terminal_authority_missing");
    expect(terminal.text).not.toContain("presentation-only answer");
    expect(terminal.source).toBe("terminal_authority_missing");
  });

  it("does not let compound terminal presentation become visible truth without authority", () => {
    const terminal = resolveHelixVisibleTerminal({
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: "compound presentation-only answer",
        terminal_artifact_kind: "model_synthesized_answer",
      },
      compound_capability_contract: {
        schema: "helix.compound_capability_contract.v1",
        subgoals: [
          {
            requested_capability: "docs-viewer.locate_in_doc",
          },
          {
            requested_capability: "scientific-calculator.solve_expression",
          },
        ],
      },
    });

    expect(terminal.text).toContain("terminal_authority_missing");
    expect(terminal.text).not.toContain("compound presentation-only answer");
    expect(terminal.source).toBe("terminal_authority_missing");
  });

  it("does not let source-targeted model-synthesized drafts become visible truth without authority", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "draft-only source/capability answer",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      canonical_goal_frame: {
        goal_kind: "repo_concept_explanation",
      },
      source_target_intent: {
        target_source: "repo_code",
        strength: "hard",
      },
    });

    expect(terminal.text).toContain("terminal_authority_missing");
    expect(terminal.text).not.toContain("draft-only source/capability answer");
    expect(terminal.source).toBe("terminal_authority_missing");
    expect(terminal.usedLegacyShadow).toBe(false);
  });

  it("allows legacy shadows only for non-source compatibility turns", () => {
    const terminal = resolveHelixVisibleTerminal({
      content: "plain model-only answer",
    });

    expect(terminal.text).toBe("plain model-only answer");
    expect(terminal.source).toBe("legacy_shadow");
    expect(terminal.usedLegacyShadow).toBe(true);
  });

  it("uses selected final answer for model-synthesized final drafts instead of concise presentation text", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "Long model-authored synthesis with field, photon, probability, and geodesic details.",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      terminal_presentation: {
        concise_text: "Short projection.",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: "Short projection.",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "final_answer_draft",
      },
    });

    expect(terminal.text).toBe("Long model-authored synthesis with field, photon, probability, and geodesic details.");
    expect(terminal.source).toBe("selected_final_answer");
    expect(terminal.usedLegacyShadow).toBe(false);
  });

  it("prefers debug single-writer authority over a stale model-draft shell", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer:
        "Calculator verification plan completed.\nExpression: 2*(3+4)\nResult: 2\nTrace source: scientific-calculator.solve_expression.",
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      debug: {
        terminal_authority_single_writer: {
          schema: "helix.terminal_authority_single_writer_result.v1",
          visible_text:
            "Calculator verification plan completed.\nExpression: 2*(3+4)\nResult: 14\nTrace source: scientific-calculator.solve_expression.",
          selected_terminal_artifact_kind: "workstation_tool_evaluation",
          source: "workstation_tool_evaluation",
          integrity: {
            single_writer_applied: true,
            materialized_terminal_artifact_kind: "workstation_tool_evaluation",
          },
        },
      },
    });

    expect(terminal.text).toContain("Result: 14");
    expect(terminal.text).not.toContain("Result: 2");
    expect(terminal.source).toBe("terminal_authority_single_writer");
    expect(terminal.terminalArtifactKind).toBe("workstation_tool_evaluation");
    expect(terminal.finalAnswerSource).toBe("workstation_tool_evaluation");
    expect(terminal.terminalErrorCode).toBeNull();
    expect(terminal.authorityVerified).toBe(true);
  });

  it("uses single-writer terminal metadata over stale envelope and API labels", () => {
    const terminal = resolveHelixVisibleTerminal({
      terminal_artifact_kind: "model_synthesized_answer",
      final_answer_source: "final_answer_draft",
      terminal_answer_envelope: {
        schema: "helix.terminal_answer_envelope.v1",
        terminal_text:
          "Calculator verification plan completed.\nExpression: 2*(3+4)\nResult: 14\nTrace source: scientific-calculator.solve_expression.",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "final_answer_draft",
      },
      debug: {
        terminal_authority_single_writer: {
          schema: "helix.terminal_authority_single_writer_result.v1",
          selected_terminal_artifact_kind: "workstation_tool_evaluation",
          source: "workstation_tool_evaluation",
          integrity: {
            single_writer_applied: true,
            materialized_terminal_artifact_kind: "workstation_tool_evaluation",
          },
        },
      },
    });

    expect(terminal.text).toContain("Result: 14");
    expect(terminal.source).toBe("terminal_answer_envelope");
    expect(terminal.terminalArtifactKind).toBe("workstation_tool_evaluation");
    expect(terminal.finalAnswerSource).toBe("workstation_tool_evaluation");
    expect(terminal.authorityVerified).toBe(true);
  });

  it("prefers specific debug observation failures over stale projection-mismatch shells", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "I could not produce a terminal answer because terminal authority and visible projection selected different artifacts.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "terminal_projection_mismatch",
      debug: {
        selected_final_answer:
          "I could not complete this turn because the requested capability did not produce the required observation.\nRequested capability: docs-viewer.locate_in_doc.\nRequired observation: doc_location_matches.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "observation_missing",
      },
    });

    expect(terminal.text).toContain("docs-viewer.locate_in_doc");
    expect(terminal.text).toContain("doc_location_matches");
    expect(terminal.text).not.toContain("visible projection selected different artifacts");
    expect(terminal.terminalErrorCode).toBe("observation_missing");
    expect(terminal.source).toBe("typed_failure");
  });

  it("recovers a satisfied model-direct answer artifact from stale placeholder failure text", () => {
    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: "I could not produce a terminal answer for this turn.",
      terminal_artifact_kind: "typed_failure",
      final_answer_source: "typed_failure",
      terminal_error_code: "direct_answer_unavailable",
      goal_satisfaction_evaluation: {
        satisfaction: "satisfied",
        next_decision: "allow_terminal",
      },
      direct_answer_text: {
        schema: "helix.direct_answer_text.v1",
        text: "An electron is a negatively charged elementary particle.",
      },
      final_answer_draft: {
        schema: "helix.final_answer_draft.v1",
        text: "An electron is a negatively charged elementary particle.",
      },
    });

    expect(terminal.text).toBe("An electron is a negatively charged elementary particle.");
    expect(terminal.source).toBe("model_direct_answer_artifact");
    expect(terminal.usedLegacyShadow).toBe(false);
  });

  it("uses backend-selected model-only text for quoted tool-name explanations without tool observations", () => {
    const answer =
      "`internet-search.search_web` is a capability or tool identifier.\n\nIt names an internet-search module/action that would perform a web search if invoked. In this request, it is just text: the phrase is being discussed literally, not executed.";

    const terminal = resolveHelixVisibleTerminal({
      selected_final_answer: answer,
      response_type: "final_failure",
      final_status: "final_failure",
      debug: {
        selected_final_answer: answer,
        response_type: "final_failure",
        final_status: "final_failure",
        artifact_query_index: {
          tool_family: "model",
          capability: "model_only",
        },
      },
    });

    expect(terminal.text).toBe(answer);
    expect(terminal.source).toBe("selected_final_answer");
    expect(terminal.terminalErrorCode).toBeNull();
    expect(terminal.usedLegacyShadow).toBe(false);
  });
});

describe("formatHelixVisibleTerminalSourceLabel", () => {
  it("labels source-backed doc summaries by terminal product instead of model source", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "doc_summary",
        finalAnswerSource: "model_direct_answer",
      }),
    ).toBe("doc summary");
  });

  it("keeps true model-direct answers labeled as model direct", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "direct_answer_text",
        finalAnswerSource: "model_direct_answer",
      }),
    ).toBe("model direct answer");
  });

  it("labels scholarly research terminal products by terminal product", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "scholarly_research_answer",
        finalAnswerSource: "final_answer_draft",
      }),
    ).toBe("scholarly research answer");
  });

  it("labels compound doc-evidence synthesis by terminal product", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "doc_evidence_synthesis_answer",
        finalAnswerSource: "calculator_receipt",
      }),
    ).toBe("doc evidence synthesis answer");
  });

  it("labels capability and synthesis products by terminal product", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "capability_help_summary",
        finalAnswerSource: "repo_code_evidence_answer",
      }),
    ).toBe("capability help summary");

    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "model_synthesized_answer",
        finalAnswerSource: "calculator_receipt",
      }),
    ).toBe("model synthesized answer");

    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "theory_context_reflection_answer",
        finalAnswerSource: "tool_receipt",
      }),
    ).toBe("theory context reflection answer");
  });

  it("labels workspace and docs observation products by terminal product", () => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "workspace_status_answer",
        finalAnswerSource: "model_synthesized_answer",
      }),
    ).toBe("workspace status answer");

    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "workspace_directory_resolution",
        finalAnswerSource: "workspace_action_receipt",
      }),
    ).toBe("workspace directory resolution");

    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "doc_equation_context",
        finalAnswerSource: "doc_summary",
      }),
    ).toBe("doc equation context");
  });

  it.each([
    ["calculation_trace", "calculation trace"],
    ["calculator_stream_result", "calculator stream result"],
    ["docs_viewer_receipt", "docs viewer receipt"],
    ["live_source_interim_voice_callout_receipt", "live-source interim voice callout receipt"],
    ["narrator_bind_stream_receipt", "narrator bind stream receipt"],
    ["narrator_say_receipt", "narrator say receipt"],
    ["stage_play_agent_goal_session_receipt", "stage play agent goal session receipt"],
    ["stage_play_live_source_watch_job_policy_config_result", "stage play live-source watch policy config"],
    ["stage_play_workstation_control_receipt", "stage play workstation control receipt"],
    ["voice_block_receipt", "voice block receipt"],
    ["voice_hold_receipt", "voice hold receipt"],
    ["voice_receipt", "voice receipt"],
  ])("labels contract terminal product %s explicitly", (terminalArtifactKind, expectedLabel) => {
    expect(
      formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind,
        finalAnswerSource: "model_synthesized_answer",
      }),
    ).toBe(expectedLabel);
  });
});

describe("shouldShowHelixRuntimeStopReason", () => {
  it("hides exhausted budget labels when the terminal was successful", () => {
    expect(
      shouldShowHelixRuntimeStopReason({
        stopReason: "budget_exhausted",
        finalStatus: "final_answer",
        solverDecision: "allow_terminal",
        terminalKind: "doc_summary",
      }),
    ).toBe(false);
  });

  it("hides exhausted budget labels when final status is absent but terminal kind is final answer", () => {
    expect(
      shouldShowHelixRuntimeStopReason({
        stopReason: "budget_exhausted",
        solverDecision: "allow_terminal",
        terminalKind: "final_answer",
      }),
    ).toBe(false);
  });

  it("keeps exhausted budget labels when a terminal error remains", () => {
    expect(
      shouldShowHelixRuntimeStopReason({
        stopReason: "budget_exhausted",
        finalStatus: "final_answer",
        terminalErrorCode: "selected_capability_observation_missing",
        solverDecision: "fail_closed",
        terminalKind: "typed_failure",
      }),
    ).toBe(true);
  });
});
