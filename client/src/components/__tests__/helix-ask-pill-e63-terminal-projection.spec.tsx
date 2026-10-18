import { beforeAll, describe, expect, it } from "vitest";

let buildVisibleResolvedTurn: typeof import("@/components/helix/HelixAskPill").buildVisibleResolvedTurn;
let chooseVisibleFinalText: typeof import("@/components/helix/HelixAskPill").chooseVisibleFinalText;
let readHelixAskFinalAnswerSourceLabel: typeof import("@/components/helix/HelixAskPill").readHelixAskFinalAnswerSourceLabel;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ buildVisibleResolvedTurn, chooseVisibleFinalText, readHelixAskFinalAnswerSourceLabel } = await import("@/components/helix/HelixAskPill"));
}, 30000);

describe("Helix Ask E63 terminal projection", () => {
  it("uses resolved final failure state over stale clarification history", () => {
    const reply = {
      id: "turn-e63-equation",
      turn_id: "turn-e63-equation",
      content: "typed failure body",
      ok: false,
      selected_final_answer: "I looked for an NHM2 equation source, but none satisfied the equation contract.",
      final_answer_source: "typed_failure",
      terminal_error_code: "equation_source_unavailable",
      pending_server_request: null,
      resolved_turn_summary: {
        turn_id: "turn-e63-equation",
        final_status: "final_failure",
        terminal_error_code: "equation_source_unavailable",
        resolved_route_label: "doc_equation_location / typed_failure:equation_source_unavailable",
      },
      debug: {
        route_history_debug: {
          rejected_route_candidates: [
            {
              route: "needs_user_input / clarify:missing_args",
              rejected_reason: "overridden_by_final_failure",
            },
          ],
        },
        pending_server_request: {
          request_id: "stale-debug-request",
          prompt: "stale",
        },
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible).toMatchObject({
      active_turn_id: "turn-e63-equation",
      primary_route_label: "doc_equation_location / typed_failure:equation_source_unavailable",
      primary_terminal_label: "final_failure",
      primary_source_label: "typed failure",
      terminal_error_code: "equation_source_unavailable",
      pending_server_request_present: false,
    });
  });

  it("renders selected typed failure text instead of stale search result text", () => {
    const reply = {
      id: "turn-e63-synthesis",
      turn_id: "turn-e63-synthesis",
      content: "Search results:\n- docs/nhm2.md",
      text: "Search results:\n- docs/nhm2.md",
      selected_final_answer: "I could not synthesize an answer from the current NHM2 evidence.\nCause: synthesis_unavailable.",
      final_answer_source: "typed_failure",
      terminal_error_code: "synthesis_unavailable",
      pending_server_request: null,
      resolved_turn_summary: {
        final_status: "final_failure",
        resolved_route_label: "doc_evidence_synthesis / typed_failure:synthesis_unavailable",
        terminal_error_code: "synthesis_unavailable",
      },
    };

    const text = chooseVisibleFinalText(reply as never);

    expect(text).toContain("synthesize an answer");
    expect(text).toContain("synthesis_unavailable");
    expect(text).not.toMatch(/^Search results:/);
  });

  it("prefers localized selected typed failure text over stale authority presentation", () => {
    const reply = {
      id: "turn-e63-localized-typed-failure",
      turn_id: "turn-e63-localized-typed-failure",
      content:
        "I could not complete this repo-grounded answer because repo evidence was retrieved, but no valid model-authored synthesis passed terminal authority.",
      selected_final_answer: "No pude producir una respuesta terminal para este turno.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "repo_evidence_synthesis_failed",
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview:
          "I could not complete this repo-grounded answer because repo evidence was retrieved, but no valid model-authored synthesis passed terminal authority.",
        terminal_artifact_kind: "typed_failure",
        final_answer_source: "typed_failure",
      },
      terminal_presentation: {
        concise_text:
          "I could not complete this repo-grounded answer because repo evidence was retrieved, but no valid model-authored synthesis passed terminal authority.",
      },
      debug: {
        language_contract: {
          schema: "helix.ask_language_contract.v1",
          response_language: "es",
          language_detected: "mixed",
          code_mixed: true,
        },
        selected_final_answer: "No pude producir una respuesta terminal para este turno.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
      },
      resolved_turn_summary: {
        final_status: "final_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "repo_evidence_synthesis_failed",
        resolved_route_label: "repo_code_evidence_question / typed_failure:repo_evidence_synthesis_failed",
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);
    const text = chooseVisibleFinalText(reply as never);

    expect(visible.selected_final_answer).toBe("No pude producir una respuesta terminal para este turno.");
    expect(text).toBe("No pude producir una respuesta terminal para este turno.");
    expect(text).not.toContain("I could not complete this repo-grounded answer");
  });

  it("uses a typed failure fallback when selected_final_answer is missing", () => {
    const reply = {
      id: "turn-e63-missing-selected",
      turn_id: "turn-e63-missing-selected",
      content: "Search results:\n- docs/nhm2.md",
      text: "Search results:\n- docs/nhm2.md",
      final_answer_source: "typed_failure",
      terminal_error_code: "synthesis_unavailable",
      pending_server_request: null,
      resolved_turn_summary: {
        final_status: "final_failure",
        resolved_route_label: "doc_evidence_synthesis / typed_failure:synthesis_unavailable",
        terminal_error_code: "synthesis_unavailable",
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);
    const text = chooseVisibleFinalText(reply as never);

    expect(visible.selected_final_answer).toContain("synthesis_unavailable");
    expect(text).toContain("synthesis_unavailable");
    expect(text).not.toMatch(/^Search results:/);
  });

  it("prefers terminal envelope text over stale selected_final_answer", () => {
    const reply = {
      id: "turn-e63-envelope",
      turn_id: "turn-e63-envelope",
      content: "stale content",
      selected_final_answer: "stale selected answer",
      final_answer_source: "artifact_synthesis",
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
    };

    expect(chooseVisibleFinalText(reply as never)).toBe("authoritative envelope answer");
  });

  it("renders authoritative doc summary surfaces instead of stale terminal-authority failure text", () => {
    const summary =
      "Summary of docs/helix-ask-flow.md:\n- Routing starts with source-target arbitration.\n- Evidence re-entry gates terminal readiness.\n- The terminal artifact is mirrored into visible presentation.";
    const reply = {
      id: "turn-e63-doc-summary",
      turn_id: "turn-e63-doc-summary",
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
        resolved_route_label: "doc_summary / artifact_synthesis",
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.terminal_error_code).toBeNull();
    expect(chooseVisibleFinalText(reply as never)).toBe(summary);
    expect(chooseVisibleFinalText(reply as never)).not.toContain("terminal_authority_missing");
  });

  it("does not render request_user_input text as the visible final answer", () => {
    const pendingText = "I need active_doc_path before I can run that multi-step request.";
    const reply = {
      id: "turn-e63-pending-input",
      turn_id: "turn-e63-pending-input",
      selected_final_answer: pendingText,
      answer: pendingText,
      text: pendingText,
      final_answer_source: "request_user_input",
      terminal_artifact_kind: "request_user_input",
      pending_server_request: {
        request_id: "request:active-doc",
        prompt: pendingText,
        status: "pending",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_kind: "request_user_input",
        terminal_artifact_kind: "request_user_input",
        final_answer_source: "request_user_input",
        terminal_text_preview: pendingText,
      },
      resolved_turn_summary: {
        final_status: "pending_input",
        terminal_artifact_kind: "request_user_input",
        resolved_route_label: "docs_viewer_multi_step / request_user_input",
        pending_server_request_present: true,
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible.primary_terminal_label).toBe("pending_input");
    expect(visible.pending_server_request_present).toBe(true);
    expect(visible.selected_final_answer).toBe("");
    expect(chooseVisibleFinalText(reply as never)).toBe("");
  });

  it("keeps debug-exported doc open receipts authoritative in the visible UI", () => {
    const receiptText =
      "Opened document:\nDocument: NHM2 Current Status in `pestypig/casimirbot-` as Implemented Today\nPath: /docs/research/nhm2-current-status-whitepaper-2026-04-03.md\nReason: best matching document for the request";
    const reply = {
      id: "turn-e63-doc-open-debug-authority",
      turn_id: "turn-e63-doc-open-debug-authority",
      content: receiptText,
      debug: {
        selected_final_answer: receiptText,
        final_answer_source: "artifact_synthesis",
        terminal_artifact_kind: "doc_open_receipt",
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          server_authoritative: true,
          terminal_text_preview: receiptText,
          terminal_artifact_kind: "doc_open_receipt",
          final_answer_source: "artifact_synthesis",
        },
        resolved_turn_summary: {
          final_status: "final_answer",
          terminal_artifact_kind: "doc_open_receipt",
          resolved_route_label: "doc_open_best / artifact_synthesis",
        },
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible.terminal_error_code).toBeNull();
    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(chooseVisibleFinalText(reply as never)).toContain("Opened document:");
    expect(chooseVisibleFinalText(reply as never)).not.toContain("terminal_authority_missing");
  });

  it("prefers terminal single-writer text over stale selected_final_answer", () => {
    const reply = {
      id: "turn-e63-single-writer",
      turn_id: "turn-e63-single-writer",
      content: "stale content",
      selected_final_answer: "Failed to execute docs-viewer.open (workspace_step_failed).",
      terminal_authority_single_writer: {
        schema: "helix.terminal_authority_single_writer_result.v1",
        visible_text: "docs-viewer has been successfully opened.",
        selected_terminal_artifact_kind: "model_synthesized_answer",
        integrity: {
          single_writer_applied: true,
          stale_failure_visible: false,
          receipt_visible_as_answer: false,
        },
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: "docs-viewer has been successfully opened.",
      },
    };

    expect(chooseVisibleFinalText(reply as never)).toBe("docs-viewer has been successfully opened.");
  });

  it("keeps backend selected_final_answer as visible truth for model-synthesized final drafts", () => {
    const longSelected =
      "Long model-authored synthesis: curvature is encoded by the metric and Riemann tensor, matter enters through stress-energy, and free fall follows geodesics while tidal forces reveal curvature.";
    const reply = {
      id: "turn-e63-model-synth",
      turn_id: "turn-e63-model-synth",
      content: "Short projection.",
      text: "Short projection.",
      selected_final_answer: longSelected,
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
      resolved_turn_summary: {
        final_status: "final_answer",
        terminal_artifact_kind: "model_synthesized_answer",
        resolved_route_label: "model_only_concept / model_synthesized_answer",
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible.selected_final_answer).toBe(longSelected);
    expect(chooseVisibleFinalText(reply as never)).toBe(longSelected);
  });

  it("labels calculator workstation terminals by terminal authority instead of stale final draft mirrors", () => {
    const text =
      "Calculator verification plan completed.\nExpression: ((sqrt(81)+ln(e^3))*7-5^2)/2\nResult: 29.5\nTrace source: scientific-calculator.solve_expression.";
    const reply = {
      id: "turn-e63-calculator-workstation-label",
      turn_id: "turn-e63-calculator-workstation-label",
      content: text,
      selected_final_answer: text,
      final_answer_source: "final_answer_draft",
      terminal_authority_single_writer: {
        schema: "helix.terminal_authority_single_writer_result.v1",
        visible_text: text,
        selected_terminal_artifact_kind: "workstation_tool_evaluation",
        source: "workstation_tool_evaluation",
        integrity: {
          single_writer_applied: true,
          materialized_terminal_artifact_kind: "workstation_tool_evaluation",
        },
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: text,
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "final_answer_draft",
      },
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: text,
        terminal_artifact_kind: "workstation_tool_evaluation",
      },
      canonical_goal_frame: {
        goal_kind: "calculator_solve",
      },
      resolved_turn_summary: {
        final_status: "final_answer",
        resolved_route_label: "calculator_solve / model_synthesized_answer",
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "final_answer_draft",
      },
    };

    const visible = buildVisibleResolvedTurn(reply as never);

    expect(visible.primary_source_label).toBe("workstation tool evaluation");
    expect(visible.primary_route_label).toBe("calculator_solve / workstation_tool_evaluation");
    expect(readHelixAskFinalAnswerSourceLabel(reply)).toBe("workstation tool evaluation");
    expect(visible.selected_final_answer).toBe(text);
    expect(chooseVisibleFinalText(reply as never)).toBe(text);
  });

  it("prefers backend debug terminal authority over stale reply source labels", () => {
    const text =
      "Calculator verification plan completed.\nExpression: 2 + 2\nResult: 4\nTrace source: scientific-calculator.solve_expression.";
    const staleReply = {
      id: "turn-e63-stale-source-shell",
      turn_id: "turn-e63-stale-source-shell",
      content: text,
      selected_final_answer: text,
      final_answer_source: "model_synthesized_answer",
      terminal_artifact_kind: "model_synthesized_answer",
      resolved_turn_summary: {
        resolved_route_label: "calculator_solve / model_synthesized_answer",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "model_synthesized_answer",
      },
    };
    const backendDebug = {
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: text,
        terminal_artifact_kind: "workstation_tool_evaluation",
        final_answer_source: "workstation_tool_evaluation",
      },
      terminal_authority_single_writer: {
        schema: "helix.terminal_authority_single_writer_result.v1",
        visible_text: text,
        selected_terminal_artifact_kind: "workstation_tool_evaluation",
        source: "workstation_tool_evaluation",
        integrity: {
          single_writer_applied: true,
          materialized_terminal_artifact_kind: "workstation_tool_evaluation",
        },
      },
    };

    expect(readHelixAskFinalAnswerSourceLabel(backendDebug, staleReply)).toBe("workstation tool evaluation");
  });

  it("does not let source-targeted legacy selected_final_answer become visible truth without authority", () => {
    const reply = {
      id: "turn-e63-source-no-authority",
      turn_id: "turn-e63-source-no-authority",
      content: "stale content",
      selected_final_answer: "legacy ghost answer",
      final_answer_source: "artifact_synthesis",
      canonical_goal_frame: {
        goal_kind: "doc_open_best",
      },
      source_target_intent: {
        target_source: "active_doc",
        strength: "hard",
      },
    };

    const text = chooseVisibleFinalText(reply as never);

    expect(text).toContain("terminal_authority_missing");
    expect(text).not.toContain("legacy ghost answer");
  });

  it("does not let live event text override backend typed failure authority", () => {
    const reply = {
      id: "turn-e63-live-final",
      turn_id: "turn-e63-live-final",
      content: "I looked for an NHM2 paper/document with equation-bearing snippets, but I could not find a source.",
      selected_final_answer:
        "I looked for an NHM2 paper/document with equation-bearing snippets, but I could not find a source.\nCause: equation_source_unavailable.",
      final_answer_source: "typed_failure",
      terminal_error_code: "equation_source_unavailable",
      pending_server_request: null,
      liveEvents: [
        {
          id: "final-answer",
          text:
            "Final: Equation-bearing source:\nDocument: NHM2 Frontier Distance From 0p995\nPath: /docs/research/nhm2-frontier-distance-report.md:L154-L156\nSnippet:\nproperTimeS_expected = alpha * T",
        },
      ],
      resolved_turn_summary: {
        final_status: "final_failure",
        resolved_route_label: "doc_equation_location / typed_failure:equation_source_unavailable",
        terminal_error_code: "equation_source_unavailable",
      },
    };

    const text = chooseVisibleFinalText(reply as never);

    expect(text).toContain("equation_source_unavailable");
    expect(text).not.toContain("properTimeS_expected = alpha * T");
    expect(text).not.toContain("/docs/research/nhm2-frontier-distance-report.md");
  });
});
