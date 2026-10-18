import { describe, expect, it } from "vitest";

import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";

describe("helix ask pill E68 debug export envelope", () => {
  it("projects the active completed turn into a canonical debug export", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-b",
        question: "Open Scientific Calculator",
        content: "Opening panel: Scientific Calculator.",
        mode: "read",
        debug: {},
      } as any,
      {
        selectedDebugFinalAnswer: "Opening panel: Scientific Calculator.",
        debug: {
          turn_id: "turn-b",
          selected_final_answer: "Opening panel: Scientific Calculator.",
          terminal_artifact_kind: "workspace_action_receipt",
          canonical_goal_frame: { goal_kind: "panel_control" },
          solver_controller_decision: {
            decision: "allow_terminal",
            blocking_reasons: [],
            final_route: "panel_control",
            required_terminal_kind: "workspace_action_receipt",
            selected_terminal_artifact_kind: "workspace_action_receipt",
          },
          poison_audit: { ok: true },
          route_authority_audit: { route_authority_ok: true },
          turn_id_integrity_audit: { ok: true },
          final_route_reconciliation: { ok: true },
        },
        agentLoop: {
          selected_final_answer: "Opening panel: Scientific Calculator.",
          final_answer_source: "artifact_synthesis",
          terminal_artifact_kind: "workspace_action_receipt",
          current_turn_artifact_ledger: [
            {
              artifact_id: "turn-b:panel_control:workspace_action_receipt",
              kind: "workspace_action_receipt",
              payload: {
                action_key: "scientific-calculator.open",
                target_id: "scientific-calculator",
                action_id: "open",
                status: "dispatched",
                message: "Opening panel: Scientific Calculator.",
                workspace_action_registry_audit: { verdict: "clean" },
                workspace_action_anti_determinism_audit: { verdict: "clean" },
                workspace_action_lifecycle_events: [
                  { event: "workspace_action/started" },
                  { event: "workspace_action/dispatched" },
                  { event: "workspace_action/completed" },
                ],
              },
            },
          ],
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.schema).toBe("helix.ask.debug_export.v1");
    expect(parsed.active_turn_id).toBe("turn-b");
    expect(parsed.active_prompt).toBe("Open Scientific Calculator");
    expect(parsed.selected_final_answer).toBe("Opening panel: Scientific Calculator.");
    expect(parsed.resolved_turn_summary.terminal_artifact_kind).toBe("workspace_action_receipt");
    expect(parsed.solver_controller_summary).toMatchObject({
      decision: "allow_terminal",
      final_route: "panel_control",
      required_terminal_kind: "workspace_action_receipt",
      selected_terminal_artifact_kind: "workspace_action_receipt",
      poison_ok: true,
      route_authority_ok: true,
      turn_id_integrity_ok: true,
      final_route_reconciliation_ok: true,
    });
    expect(parsed.workspace_action_debug.workspace_action_receipt.target_id).toBe("scientific-calculator");
    expect(parsed.workspace_action_debug.workspace_action_debug_proof.final_answer_receipt_backed).toBe(true);
    expect(parsed.payload_hash).toEqual(expect.any(String));
  });

  it("classifies structured calculator receipts in debug exports", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-calculator-receipt",
        question: "Use the scientific calculator",
        content: "Calculator receipt materialized.",
        mode: "read",
        debug: {},
      } as any,
      {
        selectedDebugFinalAnswer: "Calculator receipt materialized.",
        calculator_panel_state: {
          lastCalculatorReceipt: {
            schema: "helix.scientific_calculator_receipt.v1",
            receipt_id: "scientific-calculator-receipt:test",
            expression_template_id: "template:rho",
            status: "blocked",
            expression: "rho = E / V",
            latex: "\\rho = E / V",
            variables: [
              { symbol: "E", value: null, unit: "J" },
              { symbol: "V", value: null, unit: "m^3" },
            ],
            assumptions: [],
            source_refs: ["theory-reflection:test"],
            dimensional_check_status: "missing_units",
            result_value: null,
            result_unit: null,
            result_text: null,
            provenance_refs: ["calculator_template:test"],
            missing_bindings: ["variable:E", "variable:V"],
            blockers: ["missing_variable_bindings"],
            claim_boundary: "diagnostic only",
            created_at: "2026-07-08T00:00:00.000Z",
            updated_at: "2026-07-08T00:00:00.000Z",
          },
        },
        debug: {
          turn_id: "turn-calculator-receipt",
          selected_final_answer: "Calculator receipt materialized.",
          terminal_artifact_kind: "calculator_receipt",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.calculator_receipt_taxonomy).toBe("calculator_blocked_missing_bindings");
    expect(parsed.calculator_receipt_status).toBe("blocked");
    expect(parsed.calculator_receipt_ref).toBe("scientific-calculator-receipt:test");
    expect(parsed.calculator_receipt_debug_projection).toMatchObject({
      schema: "helix.calculator_receipt_debug_projection.v1",
      taxonomy: "calculator_blocked_missing_bindings",
      calculator_receipt_count: 1,
      missing_bindings: ["variable:E", "variable:V"],
      blockers: ["missing_variable_bindings"],
    });
    expect(parsed.calculator_receipt_debug_projection.latest_receipt).toMatchObject({
      receipt_id: "scientific-calculator-receipt:test",
      status: "blocked",
      variable_symbols: ["E", "V"],
      result_present: false,
      assistant_answer: false,
      terminal_eligible: false,
    });
  });

  it("preserves durable live interpretation debug attachments", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "client-turn-live",
        question: "Check live interpretation state",
        content: "Live interpretation state is attached.",
        mode: "read",
        debug: {},
      } as any,
      {
        selectedDebugFinalAnswer: "Live interpretation state is attached.",
        debug: {
          turn_id: "turn-live",
          selected_final_answer: "Live interpretation state is attached.",
          terminal_artifact_kind: "live_environment_binding_diagnosis",
          canonical_goal_frame: { goal_kind: "live_environment_binding_diagnosis" },
        },
        live_interpretation_debug: {
          schema: "helix.live_interpretation_debug.v1",
          interpretation_run_id: "live_interpretation_run:test",
          counts: { workers: 9 },
        },
        live_interpretation_run: {
          interpretation_run_id: "live_interpretation_run:test",
          first_scene_epoch_id: "observation:first",
          current_scene_epoch_id: "observation:latest",
        },
        live_interpretation_workers: [{ kind: "scene_neutral" }, { kind: "verifier" }],
        live_interpretation_worker_runs: [{ worker_kind: "verifier", status: "succeeded" }],
        live_interpretation_validation_artifacts: [{ artifact_type: "contradiction" }],
        live_interpretation_hypotheses: [{ hypothesis_id: "hypothesis:1", status: "active" }],
        live_interpretation_graph: {
          graph_id: "live_interpretation_graph:test",
          edges: [{ relation: "seeded_by" }],
        },
        agentLoop: {
          selected_final_answer: "Live interpretation state is attached.",
          final_answer_source: "live_environment_binding_diagnosis",
          terminal_artifact_kind: "live_environment_binding_diagnosis",
          terminal_answer_authority: {
            turn_id: "ask:backend-live",
            server_authoritative: true,
          },
        },
        live_interpretation_epoch_delta: {
          schema: "helix.live_interpretation_epoch_delta.v1",
          delta_id: "live_interpretation_epoch_delta:test",
          interpretation_run_id: "live_interpretation_run:test",
          previous_scene_epoch_id: "observation:first",
          current_scene_epoch_id: "observation:latest",
          reinforced_hypothesis_ids: ["hypothesis:1"],
          contradicted_hypothesis_ids: [],
          superseded_hypothesis_ids: [],
          expired_hypothesis_ids: [],
          newly_created_hypothesis_ids: ["hypothesis:2"],
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.active_turn_id).toBe("ask:backend-live");
    expect(parsed.backend_turn_id).toBe("ask:backend-live");
    expect(parsed.client_active_turn_id).toBe("client-turn-live");
    expect(parsed.resolved_turn_summary.turn_id).toBe("ask:backend-live");
    expect(parsed.live_interpretation_debug.counts.workers).toBe(9);
    expect(parsed.live_interpretation_run.interpretation_run_id).toBe("live_interpretation_run:test");
    expect(parsed.live_interpretation_workers.map((worker: any) => worker.kind)).toEqual(["scene_neutral", "verifier"]);
    expect(parsed.live_interpretation_worker_runs[0].worker_kind).toBe("verifier");
    expect(parsed.live_interpretation_validation_artifacts[0].artifact_type).toBe("contradiction");
    expect(parsed.live_interpretation_hypotheses[0].status).toBe("active");
    expect(parsed.live_interpretation_graph.edges[0].relation).toBe("seeded_by");
    expect(parsed.live_interpretation_epoch_delta).toEqual(
      expect.objectContaining({
        interpretation_run_id: "live_interpretation_run:test",
        previous_scene_epoch_id: "observation:first",
        current_scene_epoch_id: "observation:latest",
      }),
    );
  });

  it("exports the UI/debug parity harness fields for tool-backed turns", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:phase7",
        question: "Use calculator solve x^2-9=0.",
        content: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
        mode: "read",
        debug: {},
      } as any,
      {
        selectedDebugFinalAnswer: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
        debug: {
          turn_id: "ask:phase7",
          selected_final_answer: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
          terminal_artifact_kind: "workstation_tool_evaluation",
          canonical_goal_frame: { turn_id: "ask:phase7", goal_kind: "calculator_solve" },
        },
        calculator_panel_state: {
          current_compound_run_id: "compound:phase7",
          visible_compound_run_ids: ["compound:phase7"],
          stale_compound_run_visible: false,
        },
        agentLoop: {
          selected_final_answer: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
          final_answer_source: "final_answer_draft",
          terminal_artifact_kind: "workstation_tool_evaluation",
          terminal_answer_authority: {
            turn_id: "ask:phase7",
            terminal_text_preview: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
            terminal_artifact_kind: "workstation_tool_evaluation",
            final_answer_source: "final_answer_draft",
          },
          agent_runtime_loop: {
            schema: "helix.agent_runtime_loop.v1",
            iterations: [{ action_key: "scientific-calculator.solve_expression" }],
          },
          goal_satisfaction_evaluation: {
            schema: "helix.goal_satisfaction_evaluation.v1",
            satisfaction: "satisfied",
          },
          current_turn_artifact_ledger: [
            {
              artifact_id: "ask:phase7:planner",
              kind: "calculator_planner_result",
              payload: { schema: "helix.calculator_planner_result.v1", status: "valid" },
            },
            {
              artifact_id: "ask:phase7:repair",
              kind: "calculator_planner_repair_result",
              payload: { schema: "helix.calculator_planner_repair_result.v1", repair_attempted: true },
            },
            {
              artifact_id: "ask:phase7:coverage",
              kind: "calculator_plan_coverage",
              payload: { schema: "helix.calculator_plan_coverage.v1", missing_requirement_ids: [] },
            },
            {
              artifact_id: "ask:phase7:receipt",
              kind: "workspace_action_receipt",
              payload: {
                action_key: "scientific-calculator.solve_expression",
                target_id: "scientific-calculator",
                action_id: "solve_expression",
                status: "completed",
              },
            },
            {
              artifact_id: "ask:phase7:draft",
              kind: "final_answer_draft",
              payload: { schema: "helix.final_answer_draft.v1", text: "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3." },
            },
            {
              artifact_id: "ask:phase7:runtime_intent_packet",
              kind: "runtime_intent_packet",
              payload: {
                schema: "helix.runtime_intent_packet.v1",
                completion_authority: "agent_runtime_loop_and_goal_satisfaction",
              },
            },
          ],
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.terminal_answer_authority.terminal_text_preview).toBe(
      "The equation x^2 - 9 = 0 has solutions x = -3 and x = 3.",
    );
    expect(parsed.goal_satisfaction_evaluation.satisfaction).toBe("satisfied");
    expect(parsed.agent_runtime_loop.iterations).toHaveLength(1);
    expect(parsed.calculator_planner_result.status).toBe("valid");
    expect(parsed.calculator_planner_repair_result.repair_attempted).toBe(true);
    expect(parsed.calculator_plan_coverage.missing_requirement_ids).toEqual([]);
    expect(parsed.final_answer_draft.schema).toBe("helix.final_answer_draft.v1");
    expect(parsed.runtime_intent_packet.schema).toBe("helix.runtime_intent_packet.v1");
    expect(parsed.coverage_artifacts.map((artifact: any) => artifact.schema)).toContain("helix.calculator_plan_coverage.v1");
    expect(parsed.ui_debug_parity_harness).toMatchObject({
      schema: "helix.ui_debug_parity_harness.v1",
      ui_answer_equals_selected_final_answer: true,
      ui_answer_equals_terminal_authority_text: true,
      has_terminal_authority: true,
      has_goal_satisfaction: true,
      has_agent_runtime_loop: true,
      has_coverage_artifact: true,
      has_planner_artifact: true,
      has_repair_artifact: true,
      has_receipt_artifact: true,
      has_composer_artifact: true,
      calculator_panel_current_compound_run_id: "compound:phase7",
      calculator_panel_visible_compound_run_ids: ["compound:phase7"],
      calculator_panel_stale_compound_run_visible: false,
      clipboard_debug_copy_required_for_prompt_submission: false,
    });
  });

  it("preserves provider gateway debug trace fields for selected Codex answers", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:codex-provider-debug",
        question: "Use the calculator observation.",
        content: "The calculator observation reports 42.",
      } as any,
      {
        selected_final_answer: "The calculator observation reports 42.",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        provider_gateway_debug_summary: {
          schema: "helix.provider_gateway_debug_summary.v1",
          turn_id: "ask:codex-provider-debug",
          prompt: "Use the calculator observation.",
          selected_provider: "codex",
          capability_manifest_version: "read-observe-act.v1",
          requested_capabilities: [
            "scientific-calculator.solve_expression",
            "scientific-calculator.show_gateway_solve",
          ],
          admitted_capabilities: [
            "scientific-calculator.solve_expression",
            "scientific-calculator.show_gateway_solve",
          ],
          blocked_capabilities: [],
          executed_capabilities: [
            "scientific-calculator.solve_expression",
            "scientific-calculator.show_gateway_solve",
          ],
          evidence_reentry_status: "completed",
          route_authority_result: "provider_gateway_read_observe_contract_satisfied",
          terminal_authority_result: "authorized_by_helix_provider_candidate_bridge",
          final_answer_source: "agent_provider_terminal_candidate",
        },
        workstation_gateway_manifest_version: "read-observe-act.v1",
        workstation_gateway_call_results: [
          {
            capability_id: "scientific-calculator.solve_expression",
            ok: true,
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              selected_agent_provider: "codex",
              admission_status: "admitted",
            },
            observation_packet: {
              terminal_eligible: false,
              post_tool_model_step_required: true,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
          {
            capability_id: "scientific-calculator.show_gateway_solve",
            ok: true,
            gateway_admission: {
              requested_capability: "scientific-calculator.show_gateway_solve",
              selected_agent_provider: "codex",
              admission_status: "admitted",
            },
            observation_packet: {
              terminal_eligible: false,
              post_tool_model_step_required: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
        workstation_gateway_observation_packets: [
          {
            terminal_eligible: false,
            post_tool_model_step_required: true,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        turn_transcript_events: [
          {
            source_event_type: "runtime_selected",
            text: "Runtime selected: Codex Workstation Mode.",
          },
          {
            source_event_type: "tool_request",
            capability_id: "scientific-calculator.solve_expression",
            text: "Tool request: scientific-calculator.solve_expression.",
          },
          {
            source_event_type: "tool_observation",
            capability_id: "scientific-calculator.solve_expression",
            text: "Tool observation: scientific-calculator.solve_expression observed 6*7 = 42.",
          },
          {
            source_event_type: "action_request",
            capability_id: "scientific-calculator.show_gateway_solve",
            text: "Action request: scientific-calculator.show_gateway_solve.",
          },
          {
            source_event_type: "action_observation",
            capability_id: "scientific-calculator.show_gateway_solve",
            text: "Action observation: scientific-calculator.show_gateway_solve admitted show_gateway_solve for scientific-calculator.",
          },
          {
            source_event_type: "model_reentry",
            text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
          },
          {
            source_event_type: "terminal_answer",
            text: "The calculator observation reports 42.",
          },
        ],
        provider_reasoning_reentry: {
          schema: "helix.provider_reasoning_reentry.v1",
          status: "completed",
          evidence_reentered: true,
        },
        terminal_authority_candidate_review: {
          schema: "helix.provider_terminal_authority_candidate_review.v1",
          terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
          terminal_authority_granted: true,
          final_visible_answer_authorized: true,
        },
        provider_terminal_authority_bridge: {
          schema: "helix.provider_terminal_authority_bridge.v1",
          route_authority_status: "provider_gateway_read_observe_contract_satisfied",
          terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
          terminal_authority_granted: true,
          final_answer_source: "agent_provider_terminal_candidate",
        },
        terminal_answer_authority: {
          turn_id: "ask:codex-provider-debug",
          terminal_text_preview: "The calculator observation reports 42.",
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
          server_authoritative: true,
        },
        debug: {
          turn_id: "ask:codex-provider-debug",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.agent_runtime).toBe("codex");
    expect(parsed.selected_agent_provider.label).toBe("Codex Workstation Mode");
    expect(parsed.provider_gateway_debug_summary).toMatchObject({
      schema: "helix.provider_gateway_debug_summary.v1",
      selected_provider: "codex",
      requested_capabilities: [
        "scientific-calculator.solve_expression",
        "scientific-calculator.show_gateway_solve",
      ],
      admitted_capabilities: [
        "scientific-calculator.solve_expression",
        "scientific-calculator.show_gateway_solve",
      ],
      executed_capabilities: [
        "scientific-calculator.solve_expression",
        "scientific-calculator.show_gateway_solve",
      ],
      evidence_reentry_status: "completed",
      route_authority_result: "provider_gateway_read_observe_contract_satisfied",
      terminal_authority_result: "authorized_by_helix_provider_candidate_bridge",
      final_answer_source: "agent_provider_terminal_candidate",
    });
    expect(parsed.workstation_gateway_manifest_version).toBe("read-observe-act.v1");
    expect(parsed.workstation_gateway_call_results[0].gateway_admission).toMatchObject({
      selected_agent_provider: "codex",
      admission_status: "admitted",
    });
    expect(parsed.workstation_gateway_observation_packets[0]).toMatchObject({
      terminal_eligible: false,
      post_tool_model_step_required: true,
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(parsed.turn_transcript_events.map((event: any) => event.source_event_type)).toEqual([
      "runtime_selected",
      "tool_request",
      "tool_observation",
      "action_request",
      "action_observation",
      "model_reentry",
      "terminal_answer",
    ]);
    expect(parsed.turn_transcript_events[2]).toMatchObject({
      capability_id: "scientific-calculator.solve_expression",
      text: "Tool observation: scientific-calculator.solve_expression observed 6*7 = 42.",
    });
    expect(parsed.turn_transcript_events[4]).toMatchObject({
      capability_id: "scientific-calculator.show_gateway_solve",
      text: "Action observation: scientific-calculator.show_gateway_solve admitted show_gateway_solve for scientific-calculator.",
    });
    expect(parsed.provider_reasoning_reentry).toMatchObject({
      status: "completed",
      evidence_reentered: true,
    });
    expect(parsed.terminal_authority_candidate_review.terminal_authority_granted).toBe(true);
    expect(parsed.provider_terminal_authority_bridge.route_authority_status).toBe(
      "provider_gateway_read_observe_contract_satisfied",
    );
  });

  it("preserves language model policy metadata for normal final answers", () => {
    const languageModelPolicy = {
      schema: "helix.language_model_policy.v1",
      requested_profile: "auto",
      resolved_profile: "deep",
      resolved_model: "gpt-5.5",
      reasoning_effort: "high",
      persistence: "turn-local",
    };
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:model-policy-normal",
        question: "Summarize this document.",
        content: "Model policy visible.",
        debug: {},
      } as any,
      {
        selected_final_answer: "Model policy visible.",
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        language_model_policy: languageModelPolicy,
        language_model_debug_summary: "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
        model_policy_debug_summary: "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
        debug: {
          turn_id: "ask:model-policy-normal",
          language_model_policy: languageModelPolicy,
          language_model_debug_summary: "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
          model_policy_debug_summary: "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.language_model_policy).toMatchObject(languageModelPolicy);
    expect(parsed.language_model_debug_summary).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
    expect(parsed.model_policy_debug_summary).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
    expect(parsed.debug.language_model_policy).toMatchObject(languageModelPolicy);
    expect(parsed.debug.language_model_debug_summary).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
    expect(parsed.debug.model_policy_debug_summary).toBe(
      "AI: Auto -> Deep | gpt-5.5 | reasoning: high | turn-local",
    );
  });

  it("preserves language model policy metadata for typed failures", () => {
    const languageModelPolicy = {
      schema: "helix.language_model_policy.v1",
      requested_profile: "fast",
      resolved_profile: "fast",
      resolved_model: "gpt-4.1-mini",
      reasoning_effort: "low",
      persistence: "turn-local",
    };
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:model-policy-failure",
        question: "Search the internet for current news.",
        content: "I cannot claim the requested workstation tool or UI action ran.",
        debug: {},
      } as any,
      {
        selected_final_answer: "I cannot claim the requested workstation tool or UI action ran.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "tavily_requires_TAVILY_API_KEY",
        language_model_policy: languageModelPolicy,
        language_model_debug_summary: "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
        model_policy_debug_summary: "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
        debug: {
          turn_id: "ask:model-policy-failure",
          language_model_policy: languageModelPolicy,
          language_model_debug_summary: "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
          model_policy_debug_summary: "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.final_answer_source).toBe("typed_failure");
    expect(parsed.terminal_artifact_kind).toBe("typed_failure");
    expect(parsed.terminal_error_code).toBe("tavily_requires_TAVILY_API_KEY");
    expect(parsed.language_model_policy).toMatchObject(languageModelPolicy);
    expect(parsed.language_model_debug_summary).toBe(
      "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
    );
    expect(parsed.debug.language_model_policy).toMatchObject(languageModelPolicy);
    expect(parsed.debug.language_model_debug_summary).toBe(
      "AI: Fast -> Fast | gpt-4.1-mini | reasoning: low | turn-local",
    );
  });

  it("exports backend selected_final_answer for model-synthesized final drafts instead of concise presentation text", () => {
    const longSelected =
      "Long model-authored synthesis: curvature is encoded by the metric and Riemann tensor, matter enters through stress-energy, and free fall follows geodesics while tidal forces reveal curvature.";
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:model-synth",
        question: "Explain spacetime curvature.",
        content: "Short projection.",
      } as any,
      {
        selectedDebugFinalAnswer: longSelected,
        selected_final_answer: longSelected,
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        terminal_presentation: {
          concise_text: "Short projection.",
        },
        terminal_answer_authority: {
          turn_id: "ask:model-synth",
          terminal_text_preview: "Short projection.",
          terminal_artifact_kind: "model_synthesized_answer",
          final_answer_source: "final_answer_draft",
        },
        debug: {
          turn_id: "ask:model-synth",
          selected_final_answer: longSelected,
          final_answer_source: "final_answer_draft",
          terminal_artifact_kind: "model_synthesized_answer",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.selected_final_answer).toBe(longSelected);
    expect(parsed.selected_final_answer).not.toBe("Short projection.");
  });

  it("reconciles client playback receipts without mutating the final answer", () => {
    const pendingAnswer =
      'The interim voice callout "I am checking this now" was accepted for client playback handoff; browser playback confirmation is still pending.';
    const utteranceId =
      "tool_receipt:ask:voice-reconcile:helix_interim_voice_callout_receipt:voice-reconcile";
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:voice-reconcile",
        question: "Use the interim voice callout tool.",
        content: pendingAnswer,
      } as any,
      {
        selected_final_answer: pendingAnswer,
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        terminal_answer_authority: {
          turn_id: "ask:voice-reconcile",
          terminal_text_preview: pendingAnswer,
          terminal_artifact_kind: "model_synthesized_answer",
          final_answer_source: "final_answer_draft",
        },
        debug: {
          turn_id: "ask:voice-reconcile",
          selected_final_answer: pendingAnswer,
          final_answer_source: "final_answer_draft",
          terminal_artifact_kind: "model_synthesized_answer",
        },
        client_voice_playback_receipts: [
          {
            schema: "helix.voice_playback_outcome_receipt.v1",
            status: "delivered",
            turnKey: "ask:voice-reconcile",
            utteranceId,
            sourceReceiptId: "helix_interim_voice_callout_receipt:voice-reconcile",
          },
        ],
        client_voice_calls: [
          {
            kind: "speak",
            utteranceId,
            audioBytes: 39541,
          },
        ],
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.selected_final_answer).toBe(pendingAnswer);
    expect(parsed.voice_playback_reconciliation).toMatchObject({
      schema: "helix.voice_playback_reconciliation.v1",
      selected_final_answer_claim: "pending_client_playback",
      playback_confirmation: "delivered",
      delivered_receipt_count: 1,
      audio_bytes_observed: 39541,
      terminal_answer_mutated: false,
      assistant_answer: false,
      terminal_eligible: false,
      output_authority: "client_playback_observation",
    });
    expect(parsed.voice_playback_reconciliation.corrected_status_text).toMatch(/delivered audio/i);
  });

  it("exports voice steering debug separately from playback reconciliation", () => {
    const steeringEvent = {
      artifactId: "helix_voice_steering_event",
      schemaVersion: "helix.voice_steering_event.v1",
      steeringEventId: "helix_voice_steering_event:unit-correction",
      threadId: "thread:voice-steering",
      turnId: "ask:voice-steering",
      transcriptText: "Actually use meters per second, not feet.",
      queueDecision: "queued_for_safe_boundary",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const steeringDecision = {
      artifactId: "helix_voice_steering_decision",
      schemaVersion: "helix.voice_steering_decision.v1",
      decisionId: "helix_voice_steering_decision:unit-correction",
      steeringEventId: steeringEvent.steeringEventId,
      decision: "steering_applied",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:voice-steering",
        question: "Use voice steering while reasoning.",
        content: "I applied the correction in the final answer.",
      } as any,
      {
        selected_final_answer: "I applied the correction in the final answer.",
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        terminal_answer_authority: {
          turn_id: "ask:voice-steering",
          terminal_text_preview: "I applied the correction in the final answer.",
          terminal_artifact_kind: "model_synthesized_answer",
          final_answer_source: "final_answer_draft",
        },
        agentLoop: {
          current_turn_artifact_ledger: [
            {
              artifact_id: steeringEvent.steeringEventId,
              kind: "helix_voice_steering_event",
              payload: steeringEvent,
            },
            {
              artifact_id: steeringDecision.decisionId,
              kind: "helix_voice_steering_decision",
              payload: steeringDecision,
            },
            {
              artifact_id: "helix_interim_voice_callout_request:steering-ack",
              kind: "interim_voice_callout",
              payload: {
                schema: "helix.interim_voice_callout_tool_result.v1",
                request: {
                  artifactId: "helix_interim_voice_callout_request",
                  requestId: "helix_interim_voice_callout_request:steering-ack",
                  kind: "steering_ack",
                  text: "I heard the correction. I'll apply it after this step.",
                },
                receipt: {
                  artifactId: "helix_interim_voice_callout_receipt",
                  receiptId: "helix_interim_voice_callout_receipt:steering-ack",
                  requestId: "helix_interim_voice_callout_request:steering-ack",
                  status: "delivered",
                },
              },
            },
          ],
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.voice_steering_debug).toMatchObject({
      schema: "helix.voice_steering_debug.v1",
      active_turn_id: "ask:voice-steering",
      pending_count: 0,
      assistant_answer: false,
      terminal_eligible: false,
      output_authority: "tool_evidence",
    });
    expect(parsed.voice_steering_debug.events.map((event: any) => event.steeringEventId)).toContain(
      steeringEvent.steeringEventId,
    );
    expect(parsed.voice_steering_debug.decisions.map((decision: any) => decision.decisionId)).toContain(
      steeringDecision.decisionId,
    );
    expect(parsed.voice_steering_debug.latest_steering_ack_receipts.map((receipt: any) => receipt.receiptId)).toContain(
      "helix_interim_voice_callout_receipt:steering-ack",
    );
    expect(parsed.voice_playback_reconciliation.schema).toBe("helix.voice_playback_reconciliation.v1");
    expect(parsed.voice_playback_reconciliation).not.toHaveProperty("events");
  });

  it("exports compact theory reflection and calculator tool trace disclosure", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:tool-trace",
        question: "Calculate photon energy for f=5e14 Hz and show where E=hf fits in the theory graph.",
        content:
          "Calculator-backed answer:\nPhoton energy: 3.313035e-19 J.\n\nEvidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.",
      } as any,
      {
        selected_final_answer:
          "Calculator-backed answer:\nPhoton energy: 3.313035e-19 J.\n\nEvidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.",
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        terminal_answer_authority: {
          turn_id: "ask:tool-trace",
          terminal_text_preview:
            "Calculator-backed answer:\nPhoton energy: 3.313035e-19 J.\n\nEvidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.",
          terminal_artifact_kind: "model_synthesized_answer",
          final_answer_source: "final_answer_draft",
        },
        action_envelope: {
          schema: "helix.ask.action_envelope.v1",
          workstation_actions: [
            { panel_id: "theory-badge-graph", action_id: "reflect_discussion_context", args: {} },
            { panel_id: "theory-badge-graph", action_id: "explain_reflected_context", args: {} },
            { panel_id: "scientific-calculator", action_id: "solve_expression", args: {} },
          ],
        },
        debug: {
          turn_id: "ask:tool-trace",
          selected_final_answer:
            "Calculator-backed answer:\nPhoton energy: 3.313035e-19 J.\n\nEvidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.",
          final_answer_source: "final_answer_draft",
          terminal_artifact_kind: "model_synthesized_answer",
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.action_envelope.workstation_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_id: "reflect_discussion_context" }),
        expect.objectContaining({ action_id: "explain_reflected_context" }),
        expect.objectContaining({ action_id: "solve_expression" }),
      ]),
    );
    expect(parsed.tool_trace_disclosure.action_keys).toEqual(
      expect.arrayContaining([
        "theory-badge-graph.reflect_discussion_context",
        "theory-badge-graph.explain_reflected_context",
        "scientific-calculator.solve_expression",
      ]),
    );
    expect(parsed.tool_trace_disclosure.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "theory-badge-graph.reflect_discussion_context",
          role: "context_locator",
          authority: "evidence_only",
        }),
        expect.objectContaining({
          tool: "scientific-calculator.solve_expression",
          role: "scalar_solver",
          authority: "numeric_observation",
        }),
      ]),
    );
    expect(parsed.tool_trace_disclosure.answerNote).toBe(
      "Evidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.",
    );
    expect(parsed.tool_trace_disclosure.assistant_answer).toBe(false);
    expect(parsed.tool_trace_disclosure.terminal_eligible).toBe(false);
  });

  it("exports Codex host workstation affordances beside final prose", () => {
    const payload = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:codex-affordance",
        question: "Use the calculator to evaluate 8 * 9.",
        content: "8 * 9 = 72",
      } as any,
      {
        agent_runtime: "codex",
        selected_final_answer: "8 * 9 = 72",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        workstation_actions: [
          {
            kind: "fill_calculator_expression",
            expression_text: "8 * 9",
            result: "72",
            observation_ref: "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
          },
        ],
        support_refs: [
          "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
        ],
        tool_output_refs: [
          "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
        ],
        debug: {
          turn_id: "ask:codex-affordance",
          codex_host_workstation_affordances: {
            schema: "helix.codex_host_workstation_affordances.v1",
            workstation_actions: [
              {
                kind: "fill_calculator_expression",
                expression_text: "8 * 9",
                result: "72",
                observation_ref: "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
              },
            ],
            support_refs: [
              "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
            ],
            tool_output_refs: [
              "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
            ],
            assistant_answer: false,
            raw_content_included: false,
            terminal_eligible: false,
          },
        },
      },
    );
    const parsed = JSON.parse(payload);

    expect(parsed.selected_final_answer).toBe("8 * 9 = 72");
    expect(parsed.codex_host_workstation_affordances).toMatchObject({
      schema: "helix.codex_host_workstation_affordances.v1",
      assistant_answer: false,
      raw_content_included: false,
      terminal_eligible: false,
    });
    expect(parsed.workstation_actions).toEqual([
      expect.objectContaining({
        kind: "fill_calculator_expression",
        expression_text: "8 * 9",
        result: "72",
      }),
    ]);
    expect(parsed.support_refs).toEqual([
      "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
    ]);
    expect(parsed.tool_output_refs).toEqual([
      "ask:codex-affordance:workstation_gateway:scientific-calculator.solve_expression:abc123",
    ]);
  });
});
