import { describe, expect, it } from "vitest";
import {
  buildVisibleResolvedTurn,
  isInvalidTerminalAnswerText,
  normalizeTerminalAnswerText,
  readHelixAskFinalAnswerSourceLabel,
  readHelixTopLevelPendingServerRequest,
  renderLiveAnswerEnvironmentContextPackAnswer,
  resolveHelixAskVisibleJobReadyLinks,
} from "@/lib/helix/ask-terminal-projection";

describe("Helix Ask terminal projection", () => {
  it("normalizes terminal answer text and recognizes invalid placeholders", () => {
    expect(normalizeTerminalAnswerText(" \u00a0No final answer returned.  ")).toBe("No final answer returned.");
    expect(isInvalidTerminalAnswerText("")).toBe(true);
    expect(isInvalidTerminalAnswerText("No final answer returned.")).toBe(true);
    expect(isInvalidTerminalAnswerText("I could not produce a substantive direct answer for this background-only turn.")).toBe(
      true,
    );
    expect(isInvalidTerminalAnswerText("I couldn't produce a final answer for that turn. Please retry once.")).toBe(true);
    expect(
      isInvalidTerminalAnswerText("I need retrieval before finalizing this claim. I do not yet have grounded evidence references for it."),
    ).toBe(true);
    expect(
      isInvalidTerminalAnswerText(
        "I could not complete that turn because the runtime provider echoed Helix internal capability instructions instead of returning a valid lane request or final answer.\nNo visual observation receipt was produced for this turn.",
      ),
    ).toBe(true);
    expect(
      isInvalidTerminalAnswerText(
        "I could not complete that turn because the runtime provider echoed Helix internal capability instructions instead of returning a valid lane request or final answer.\nNo calculator workstation_tool_evaluation was produced from the calculator receipt for this turn.",
      ),
    ).toBe(true);
    expect(isInvalidTerminalAnswerText("  grounded answer ready  ")).toBe(false);
  });

  it("reads unresolved top-level pending server requests", () => {
    expect(
      readHelixTopLevelPendingServerRequest({
        id: "reply-1",
        pending_server_request: {
          request_id: "req-1",
          prompt: "Which file should I open?",
          required_fields: ["path"],
        },
      }),
    ).toMatchObject({ request_id: "req-1" });
    expect(
      readHelixTopLevelPendingServerRequest({
        id: "reply-2",
        pending_server_request: {
          request_id: "req-2",
          prompt: "Resolved",
          status: "resolved",
        },
      }),
    ).toBeNull();
  });

  it("renders live-answer environment context-pack answer copy", () => {
    expect(
      renderLiveAnswerEnvironmentContextPackAnswer({
        live_answer_environment: {
          latest_summary: "The current environment summary.",
          lines: [
            { visibility: "answer_card", label: "State", value: "ready" },
            { visibility: "debug", label: "Hidden", value: "ignored" },
          ],
        },
        utility_hypotheses: [
          { utility_label: "useful source", status: "candidate", confidence: 0.42 },
        ],
        missing_evidence_notes: ["need source citation"],
        semantic_confidence_ladder: ["low", "medium"],
      }),
    ).toBe(
      [
        "The current environment summary.",
        "Hypothesis: candidate useful source (confidence 0.42).",
        "Missing evidence: need source citation.",
        "Semantic confidence: low; medium.",
        "State: ready",
      ].join("\n"),
    );
    expect(renderLiveAnswerEnvironmentContextPackAnswer({})).toBeNull();
  });

  it("lets successful Codex workstation terminal authority outrank stale typed-failure projection fields", () => {
    const visible = buildVisibleResolvedTurn({
      id: "reply-codex-workstation-success",
      turn_id: "turn-codex-workstation-success",
      ok: true,
      selected_final_answer: "I don't have a scientific-calculator.solve_expression observation packet for 8*9.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "calculator_gateway_solve_observation_missing",
      debug: {
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          turn_id: "turn-codex-workstation-success",
          server_authoritative: true,
          terminal_text_preview: "Observed expression: 8*9\nResult: 72",
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
        },
        terminal_result: {
          terminal_authority_ok: true,
          route_authority_ok: true,
          text: "Observed expression: 8*9\nResult: 72",
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
        },
      },
    });

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.primary_source_label).not.toBe("typed failure");
    expect(visible.terminal_error_code).toBeNull();
    expect(visible.selected_final_answer).toBe("Observed expression: 8*9\nResult: 72");
  });

  it("uses full terminal presentation text instead of terminal authority preview", () => {
    const preview =
      "Moral Graph reflection supports the principle as a procedural boundary, not a final moral verdict.\n\nThe strongest matched lenses are `direct-observation-before-claim`, `falsifiability-and-truth-conve";
    const fullAnswer =
      "Moral Graph reflection supports the principle as a procedural boundary, not a final moral verdict.\n\nThe strongest matched lenses are `direct-observation-before-claim`, `falsifiability-and-truth-convergence`, and `right-speech-and-accurate-formulation`. Presence is only availability. Permission requires current intent, source-target admission, and a bounded purpose.";

    const visible = buildVisibleResolvedTurn({
      id: "reply-moral-graph-full-terminal-presentation",
      turn_id: "ask:moral-graph-full-terminal-presentation",
      ok: true,
      selected_final_answer: preview,
      final_answer_source: "agent_provider_terminal_candidate",
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      terminal_presentation: {
        schema: "helix.terminal_presentation.v1",
        concise_text: fullAnswer,
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        server_authoritative: true,
        terminal_text_preview: preview,
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
      },
    });

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.selected_final_answer).toBe(fullAnswer);
    expect(visible.selected_final_answer).not.toBe(preview);
  });

  it("projects a server admission rejection instead of the backend materialization fallback", () => {
    const visible = buildVisibleResolvedTurn({
      id: "ask:memory-pressure-rejection",
      turn_id: "ask:memory-pressure-rejection",
      ok: false,
      response_type: "final_answer",
      selected_final_answer: "",
      final_answer_source: "ask_turn_admission",
      terminal_artifact_kind: "ask_turn_admission",
      route_reason_code: "ask_turn_admission / memory_hard_pressure",
      runtime_memory_governor_admission: {
        admitted: false,
        action: "reject_memory_pressure",
        reason: "heap_used_limit",
        pressure_state: "hard_pressure",
      },
      resolved_turn_summary: {
        final_status: "final_answer",
        resolved_route_label: "ask_turn_admission / rejected",
        terminal_artifact_kind: "ask_turn_admission",
        final_answer_source: "ask_turn_admission",
      },
      terminal_answer_authority: {
        schema: "helix.turn_terminal_authority.v1",
        terminal_kind: "answer",
        final_answer_source: "ask_turn_admission",
        terminal_artifact_kind: "ask_turn_admission",
        authority_origin: "ask_turn_admission",
        server_authoritative: true,
        assistant_answer: false,
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("ask turn admission");
    expect(visible.terminal_error_code).toBe("memory_hard_pressure");
    expect(visible.selected_final_answer).toBe("Ask turn rejected: memory_hard_pressure.");
    expect(visible.selected_final_answer).not.toContain("no server terminal artifact");
  });

  it("blocks workstation evaluation projection when the backend Ask entrypoint is missing", () => {
    const visible = buildVisibleResolvedTurn({
      id: "reply-client-projection-scholar-fetch",
      ok: true,
      selected_final_answer:
        "I cannot claim the requested workstation tool or UI action ran because Helix did not produce a successful observation or action receipt for every gateway request. Blocked or failed gateway request: scholarly-research.fetch_full_text: fetchable_paper_identity_required.",
      final_answer_source: "workstation_tool_evaluation",
      terminal_artifact_kind: "workstation_tool_evaluation",
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        selected_final_answer:
          "I cannot claim the requested workstation tool or UI action ran because Helix did not produce a successful observation or action receipt for every gateway request. Blocked or failed gateway request: scholarly-research.fetch_full_text: fetchable_paper_identity_required.",
        final_answer_source: "workstation_tool_evaluation",
        terminal_artifact_kind: "workstation_tool_evaluation",
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBe("backend_ask_entry_required");
    expect(visible.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
  });

  it("does not force backend entrypoint for conceptual tool explanations that suppress execution", () => {
    const visible = buildVisibleResolvedTurn({
      id: "reply-moral-graph-concept-no-run",
      ok: true,
      question: "What is the Moral Graph reflection tool? Explain conceptually. Do not run it.",
      selected_final_answer: "The Moral Graph reflection tool is a conceptual reflection surface.",
      final_answer_source: "agent_provider_terminal_candidate",
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      terminal_answer_authority: {
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        final_answer_source: "agent_provider_terminal_candidate",
      },
    });

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.terminal_error_code).toBeFalsy();
    expect(visible.selected_final_answer).toBe(
      "The Moral Graph reflection tool is a conceptual reflection surface.",
    );
  });

  it("still treats explicit Moral Graph execution as backend entrypoint territory", () => {
    const visible = buildVisibleResolvedTurn({
      id: "reply-moral-graph-execute-missing-entrypoint",
      ok: true,
      question:
        "Use only the Moral Graph. Reflect on whether I should apologize after snapping at a coworker. Do not use web, papers, calculator, image, or PDF context.",
      selected_final_answer: "A stale provider draft should not be shown.",
      final_answer_source: "agent_provider_terminal_candidate",
      terminal_artifact_kind: "agent_provider_terminal_candidate",
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.terminal_error_code).toBe("backend_ask_entry_required");
    expect(visible.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
  });

  it("does not let stale backend entrypoint flags hide a materialized workstation final", () => {
    const answer =
      "The scholarly chain reached a bounded result, but it did not fully bind a calculator expression.";
    const visible = buildVisibleResolvedTurn({
      id: "reply-codex-workstation-materialized-final",
      ok: true,
      selected_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        resolved_turn_summary: {
          final_status: "final_answer",
          terminal_artifact_kind: "workstation_tool_evaluation",
        },
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          server_authoritative: true,
          terminal_text_preview: answer,
          final_answer_source: "workstation_tool_evaluation",
          terminal_artifact_kind: "workstation_tool_evaluation",
        },
        ui_debug_parity_harness: {
          visible_final_answer: answer,
        },
      },
    });

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.primary_source_label).not.toBe("typed failure");
    expect(visible.terminal_error_code).toBeNull();
    expect(visible.selected_final_answer).toBe(answer);
  });

  it("does not treat Image Lens projection text as a materialized backend final without authority", () => {
    const projectedImageLensAnswer =
      "The runtime provider echoed Helix internal capability instructions after Image Lens observations re-entered, so I am using only the observation receipts below.";
    const visible = buildVisibleResolvedTurn({
      id: "reply-image-lens-client-projection",
      ok: true,
      selected_final_answer: projectedImageLensAnswer,
      final_answer_source: "workstation_tool_evaluation",
      terminal_artifact_kind: "workstation_tool_evaluation",
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        selected_final_answer: projectedImageLensAnswer,
        final_answer_source: "workstation_tool_evaluation",
        terminal_artifact_kind: "workstation_tool_evaluation",
        resolved_turn_summary: {
          final_status: "final_answer",
          terminal_artifact_kind: "workstation_tool_evaluation",
          final_answer_source: "workstation_tool_evaluation",
        },
        ui_debug_parity_harness: {
          has_terminal_authority: false,
          has_receipt_artifact: false,
          visible_final_answer: projectedImageLensAnswer,
        },
        current_turn_artifact_ledger: [],
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBe("backend_ask_entry_required");
    expect(visible.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
  });

  it("does not project provider instruction echo failures from compound synthesis when backend Ask did not run", () => {
    const providerEchoFailure =
      "I could not complete that turn because the runtime provider echoed Helix internal capability instructions instead of returning a valid lane request or final answer.\nNo visual observation receipt was produced for this turn.";
    const visible = buildVisibleResolvedTurn({
      id: "reply-image-lens-provider-echo",
      ok: true,
      selected_final_answer: providerEchoFailure,
      final_answer_source: "compound_evidence_synthesis_answer",
      terminal_artifact_kind: "compound_evidence_synthesis_answer",
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        selected_final_answer: providerEchoFailure,
        final_answer_source: "compound_evidence_synthesis_answer",
        terminal_artifact_kind: "compound_evidence_synthesis_answer",
        current_turn_artifact_ledger: [],
        current_turn_events: [],
        ui_debug_parity_harness: {
          has_agent_runtime_loop: false,
          visible_final_answer: providerEchoFailure,
        },
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBe("backend_ask_entry_required");
    expect(visible.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
  });

  it("blocks stale scholarly fallbacks for natural Moral Graph prompts without backend authority", () => {
    const staleScholarlyFallback =
      "I cannot answer scholarly paper content from this turn because no scholarly-research.lookup_papers observation packet was materialized.\nAsk with an explicit scholarly search target, DOI, or arXiv id so Helix can create bounded research-paper evidence first.";
    const visible = buildVisibleResolvedTurn({
      id: "reply-moral-graph-stale-scholarly-fallback",
      ok: true,
      question:
        "Use the Moral Graph to help me reflect on a roommate situation. Do not use calculator, image, PDF, page, or web evidence.",
      selected_final_answer: staleScholarlyFallback,
      final_answer_source: "agent_provider_terminal_candidate",
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      ask_entrypoint_required: true,
      debug: {
        debug_export_source: "rendered_reply_dom",
        selected_final_answer: staleScholarlyFallback,
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBe("backend_ask_entry_required");
    expect(visible.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
    expect(visible.selected_final_answer).not.toContain("scholarly paper content");
  });

  it("rejects terminal envelopes forbidden by route evidence authority", () => {
    const staleScholarlyFallback =
      "I cannot answer scholarly paper content from this turn because no scholarly-research.lookup_papers observation packet was materialized.";
    const visible = buildVisibleResolvedTurn({
      id: "reply-moral-graph-route-authority-vetoes-scholarly-envelope",
      ok: true,
      terminal_answer_envelope: {
        terminal_kind: "final_answer",
        terminal_artifact_kind: "scholarly_research_answer",
        final_answer_source: "scholarly_research_answer",
        terminal_text: staleScholarlyFallback,
      },
      route_evidence_authority: {
        schema: "helix.route_evidence_authority.v1",
        turn_id: "ask:moral-graph-route-authority-vetoes-scholarly-envelope",
        candidate_tools: [
          {
            capability_id: "moral-graph.reflect_context",
            family: "moral_graph",
            reason: "requested_route",
          },
          {
            capability_id: "scholarly-research.lookup_papers",
            family: "scholarly_research",
            reason: "ambient_context_rejected",
          },
        ],
        admitted_tools: [
          {
            capability_id: "moral-graph.reflect_context",
            family: "moral_graph",
            admission_ref: "ask:moral-graph-route-authority:admission",
          },
        ],
        rejected_tools: [
          {
            capability_id: "scholarly-research.lookup_papers",
            family: "scholarly_research",
            reason: "route_suppressed",
          },
        ],
        supporting_evidence_refs: ["ask:moral-graph-route-authority:moral_graph_observation"],
        allowed_terminal_artifact_kinds: ["model_synthesized_answer", "typed_failure"],
        forbidden_terminal_artifact_kinds: ["scholarly_research_answer"],
        required_terminal_kind: null,
        terminal_product_allowed: true,
        current_turn_only: true,
        assistant_answer: false,
        raw_content_included: false,
      },
    });

    expect(visible.primary_terminal_label).toBe("final_failure");
    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBe("route_terminal_product_not_allowed");
    expect(visible.selected_final_answer).not.toBe(staleScholarlyFallback);
    expect(visible.selected_final_answer).not.toContain("scholarly paper content");
  });

  it("lets structured workstation gateway success outrank stale typed-failure labels", () => {
    const reply = {
      id: "reply-codex-workstation-live-stale-failure",
      turn_id: "turn-codex-workstation-live-stale-failure",
      ok: true,
      content: "Observed expression: `8*9`\n\nResult: `72`",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      debug: {
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        workstation_gateway_call_results: [
          {
            ok: false,
            capability_id: "scientific-calculator.solve_expression",
            error: "expression_evaluation_failed",
            observation_packet: {
              status: "failed",
            },
          },
          {
            ok: true,
            capability_id: "scientific-calculator.solve_expression",
            observation: {
              expression: "8*9",
              result: "72",
            },
            observation_packet: {
              capability_key: "scientific-calculator.solve_expression",
              status: "succeeded",
              observation_summary: "8*9 = 72",
            },
          },
        ],
      },
    };

    const visible = buildVisibleResolvedTurn(reply);

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.primary_source_label).toBe("workstation tool evaluation");
    expect(visible.terminal_error_code).toBeNull();
    expect(visible.selected_final_answer).toBe("Observed expression: `8*9`\n\nResult: `72`");
    expect(readHelixAskFinalAnswerSourceLabel(reply)).toBe("workstation tool evaluation");
    expect(readHelixAskFinalAnswerSourceLabel(reply.debug, reply)).toBe("workstation tool evaluation");
  });

  it("keeps typed failure when workstation gateway success has no usable final answer", () => {
    const visible = buildVisibleResolvedTurn({
      id: "reply-codex-workstation-no-final",
      ok: true,
      content: "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      debug: {
        workstation_gateway_call_results: [
          {
            ok: true,
            capability_id: "scientific-calculator.solve_expression",
            observation_packet: {
              status: "succeeded",
              observation_summary: "8*9 = 72",
            },
          },
        ],
      },
    });

    expect(visible.primary_source_label).toBe("typed failure");
    expect(visible.terminal_error_code).toBeTruthy();
  });

  it("projects backend-selected quoted tool-name explanations instead of stale retrieval fallbacks", () => {
    const answer =
      "`internet-search.search_web` is a capability or tool identifier. It names an internet-search module/action that would perform a web search if invoked. In this request, it is just text: the phrase is being discussed literally, not executed.";
    const staleFallback = "I need retrieval before finalizing this claim. I do not yet have grounded evidence references for it.";

    const visible = buildVisibleResolvedTurn({
      id: "reply-negative-quoted-internet",
      turn_id: "ask:negative-quoted-internet",
      ok: false,
      content: staleFallback,
      text: staleFallback,
      selected_final_answer: answer,
      final_answer_source: "model_direct_answer",
      terminal_answer_authority: {
        server_authoritative: true,
        terminal_kind: "answer",
        terminal_artifact_kind: "direct_answer_text",
        final_answer_source: "model_direct_answer",
      },
      debug: {
        selected_final_answer: answer,
        final_answer_source: "model_direct_answer",
        terminal_answer_authority: {
          server_authoritative: true,
          terminal_kind: "answer",
          terminal_artifact_kind: "direct_answer_text",
          final_answer_source: "model_direct_answer",
        },
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      },
    });

    expect(visible.primary_terminal_label).toBe("final_answer");
    expect(visible.terminal_error_code).toBeNull();
    expect(visible.selected_final_answer).toBe(answer);
    expect(visible.selected_final_answer).not.toBe(staleFallback);
  });

  it("hides job-ready links on failure terminals and keeps valid links on successful turns", () => {
    const link = {
      label: "Open note: Stage Play Live-Source Findings",
      panel_id: "workstation-notes",
      action_id: "set_active_note",
      args: { title: "Stage Play Live-Source Findings" },
    };

    expect(
      resolveHelixAskVisibleJobReadyLinks({
        id: "turn-note-link-typed-failure",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        debug: {
          job_ready_links: [link],
        },
      }),
    ).toEqual([]);

    expect(
      resolveHelixAskVisibleJobReadyLinks({
        id: "turn-note-link-success",
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        debug: {
          job_ready_links: [link, { panel_id: "missing-action" }, "ignored"],
        },
      }),
    ).toEqual([link]);
  });
});
