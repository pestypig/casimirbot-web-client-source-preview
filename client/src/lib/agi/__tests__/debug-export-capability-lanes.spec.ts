import { describe, expect, it } from "vitest";
import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";

describe("Helix Ask debug export capability lanes", () => {
  it("retains sanitized Realtime context materialization metadata after size compaction", () => {
    const audit = {
      schema: "helix.realtime_conversation_context_materialization.v1",
      handoff_id: "realtime-stage-play-handoff:compact-context",
      context_pack_id: "context-pack:compact-context",
      prior_turn_count: 3,
      current_transcript_char_count: 24,
      raw_content_included: false,
      provider_payload_included: false,
    };
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:compact-realtime-context",
        question: "Explain the current conversation context.",
        content: "Context retained.",
      },
      {
        selected_final_answer: "Context retained.",
        final_answer_source: "direct_answer_text",
        terminal_artifact_kind: "direct_answer_text",
        debug: {
          provider_gateway_debug_summary: {
            schema: "helix.provider_gateway_debug_summary.v1",
            prompt: "x".repeat(800_000),
            realtime_conversation_context_materialization: audit,
          },
        },
      },
    );
    const exported = JSON.parse(text) as Record<string, any>;

    expect(exported.debug_export_size_control).toMatchObject({
      truncated: true,
      compacted: true,
    });
    expect(exported.realtime_conversation_context_materialization).toEqual(audit);
    expect(exported.provider_gateway_debug_summary).toBeUndefined();
  });

  it("exports Realtime runtime session debug as non-terminal blocked evidence", () => {
    const poisonedTranscript = "open the postulate board now";
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:realtime-debug-observability",
        question: "show live runtime state",
        content: "Realtime state recorded.",
      },
      {
        selected_final_answer: "Realtime state recorded.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "realtime_session_disabled",
        realtime_runtime_session_summary: {
          schema: "helix.live_runtime_agent.control_state.v1",
          realtime_session_id: "realtime:test",
          runtime_agent_mode: "live_voice",
          runtime_agent_authority: "execute_confirmed_actions",
          transport: "webrtc",
          session_status: "active",
          session_lifecycle: ["start", "realtime_live_transport_disabled_by_env"],
          selected_backend_provider: "openai",
          selected_model_or_service: "gpt-realtime",
          selected_realtime_model: "gpt-realtime",
          consent_state: "granted",
          tool_admission_state: "confirmation_required",
          client_receipt_state: "received",
          client_receipt_count: 1,
          client_receipt_refs: ["receipt:visible-consent"],
          provider_session_ref: "provider:session:client-debug-safe",
          ephemeral_client_secret: "summary-secret-must-not-export",
          ephemeral_client_secret_expires_at_ms: 1783550300000,
          latest_failure_code: "realtime_live_transport_disabled_by_env",
          transport_execution_attempted: true,
          media_capture_started: true,
          openai_network_call_attempted: true,
          webrtc_started: true,
          sideband_started: true,
          terminal_authority_status: "pending_helix_terminal_authority",
          answer_authority: true,
          assistant_answer: true,
          terminal_eligible: true,
          raw_content_included: true,
        },
        realtime_runtime_session_events: [
          {
            schema: "helix.realtime_session.lifecycle_event.v1",
            action: "record_client_receipt",
            receipt_ref: "receipt:visible-consent",
            answer_authority: true,
            assistant_answer: true,
            terminal_eligible: true,
            raw_content_included: true,
          },
        ],
        realtime_transcript_observations: [
          {
            schema: "helix.realtime.transcript_observation.v1",
            observation_ref: "obs:realtime:transcript:test",
            runtime_agent_authority: "execute_confirmed_actions",
            transcript_text_hash: "sha256:abc",
            transcript_text_char_count: poisonedTranscript.length,
            transcript_text: poisonedTranscript,
            text: poisonedTranscript,
            prompt_text: poisonedTranscript,
            workstation_action_args: {
              action_id: "must_not_execute",
              transcript_text: poisonedTranscript,
            },
            reentry_status: "reentered",
            observation_reentered: true,
            transcript_is_user_intent: true,
            answer_authority: true,
            assistant_answer: true,
            terminal_eligible: true,
            raw_content_included: true,
          },
        ],
        realtime_tool_suggestion_observations: [
          {
            schema: "helix.realtime.tool_suggestion_observation.v1",
            suggestion_ref: "suggestion:realtime:debug",
            realtime_session_id: "realtime:test",
            runtime_agent_mode: "live_voice",
            runtime_agent_authority: "execute_confirmed_actions",
            event_type: "action.suggestion",
            suggested_action_id: "inspect_docs_selection",
            source_observation_ref: "obs:realtime:transcript:test",
            client_receipt_ref: "receipt:suggestion:debug",
            tool_admission_state: "suggest_only",
            admission_status: "candidate_only",
            execution_attempted: true,
            gateway_execution_attempted: true,
            workstation_action_executed: true,
            answer_authority: true,
            assistant_answer: true,
            terminal_eligible: true,
            raw_content_included: true,
          },
        ],
        realtime_client_receipt_observations: [
          {
            schema: "helix.realtime.client_receipt_observation.v1",
            receipt_ref: "receipt:realtime:debug",
            realtime_session_id: "realtime:test",
            runtime_agent_mode: "live_voice",
            runtime_agent_authority: "execute_confirmed_actions",
            receipt_kind: "mic_permission_granted",
            status: "granted",
            client_receipt_ref: "receipt:visible-consent",
            client_secret: "must-not-export",
            ephemeral_secret: "must-not-export",
            sdp: "v=0 must-not-export",
            answer_sdp: "v=0 answer-must-not-export",
            ice_candidate: "candidate:ice-must-not-export",
            Authorization: "Bearer auth-must-not-export",
            openai_api_key: "key-must-not-export",
            raw_provider_response: { secret: "provider-must-not-export" },
            audio_payload: "must-not-export",
            raw_audio: "must-not-export",
            openai_network_call_attempted: true,
            ephemeral_credential_minted: true,
            webrtc_started: true,
            sideband_started: true,
            media_capture_started: true,
            browser_media_api_referenced: true,
            browser_tracks_created: true,
            data_channels_created: true,
            answer_authority: true,
            assistant_answer: true,
            terminal_eligible: true,
            raw_content_included: true,
          },
        ],
        debug: {
          turn_id: "ask:realtime-debug-observability",
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.realtime_runtime_session_summary).toMatchObject({
      realtime_session_id: "realtime:test",
      runtime_agent_mode: "live_voice",
      runtime_agent_authority: "execute_confirmed_actions",
      transport: "none",
      session_lifecycle: ["start", "realtime_live_transport_disabled_by_env"],
      consent_state: "granted",
      client_receipt_count: 1,
      provider_session_ref: "provider:session:client-debug-safe",
      ephemeral_client_secret_expires_at_ms: 1783550300000,
      latest_failure_code: "realtime_live_transport_disabled_by_env",
      terminal_authority_status: "not_terminal_authority",
      transport_execution_attempted: false,
      media_capture_started: false,
      openai_network_call_attempted: false,
      webrtc_started: false,
      sideband_started: false,
      reentry_required: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(exported.realtime_runtime_session_events).toEqual([
      expect.objectContaining({
        receipt_ref: "receipt:visible-consent",
        context_role: "tool_evidence",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(exported.realtime_transcript_observations).toEqual([
      expect.objectContaining({
        observation_ref: "obs:realtime:transcript:test",
        runtime_agent_mode: "live_transcription",
        runtime_agent_authority: "execute_confirmed_actions",
        context_role: "tool_evidence",
        transcript_text_hash: "sha256:abc",
        transcript_text_char_count: poisonedTranscript.length,
        transcript_is_user_intent: false,
        reentry_status: "pending_solver_reentry",
        observation_reentered: false,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(exported.realtime_tool_suggestion_observations).toEqual([
      expect.objectContaining({
        suggestion_ref: "suggestion:realtime:debug",
        suggested_action_id: "inspect_docs_selection",
        source_observation_ref: "obs:realtime:transcript:test",
        client_receipt_ref: "receipt:suggestion:debug",
        context_role: "tool_evidence",
        tool_admission_state: "suggest_only",
        admission_status: "candidate_only",
        reentry_status: "pending_solver_reentry",
        observation_reentered: false,
        execution_attempted: false,
        gateway_execution_attempted: false,
        workstation_action_executed: false,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(exported.realtime_client_receipt_observations).toEqual([
      expect.objectContaining({
        receipt_ref: "receipt:realtime:debug",
        client_receipt_ref: "receipt:visible-consent",
        receipt_kind: "mic_permission_granted",
        status: "granted",
        context_role: "tool_evidence",
        reentry_status: "pending_solver_reentry",
        observation_reentered: false,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        sideband_started: false,
        media_capture_started: false,
        browser_media_api_referenced: false,
        browser_tracks_created: false,
        data_channels_created: false,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(text).not.toContain(poisonedTranscript);
    expect(text).not.toContain("must-not-export");
    expect(text).not.toContain("summary-secret-must-not-export");
    expect(text).not.toContain("must_not_execute");
    expect(text).not.toContain("workstation_action_args");
    expect(text).not.toContain("prompt_text");
    expect(text).not.toContain("ice-must-not-export");
    expect(text).not.toContain("auth-must-not-export");
    expect(text).not.toContain("key-must-not-export");
    expect(text).not.toContain("provider-must-not-export");
    expect(text).not.toContain("answer-must-not-export");
  });

  it("exports native Codex and grounded relay proof without raw identity or prompt content", () => {
    const rawProfileId = "profile:native-debug-must-not-export";
    const rawPromptText = "raw native prompt must not export";
    const groundedAnswerText = "grounded answer body must not export";
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:native-debug-proof",
        question: "show native runtime proof",
        content: "Native runtime proof recorded.",
      },
      {
        selected_final_answer: "Native runtime proof recorded.",
        final_answer_source: "agent_provider",
        terminal_artifact_kind: "provider_answer",
        codex_native_provider_bridge: {
          schema: "helix.codex_native_provider_bridge.v1",
          enabled: true,
          eligible: true,
          attempted: true,
          status: "completed",
          native_transport: "codex_app_server",
          compatibility_transport: "codex_exec",
          fallback_required: false,
          fallback_reason: null,
          model_policy_source: "language_model_policy",
          effective_model: "gpt-5.4-mini",
          effective_reasoning_effort: "low",
          trusted_goal_account_binding_required: true,
          allowed_workstation_tools: ["workspace_os.status"],
          native_workstation_turn: {
            schema: "helix.codex_native_workstation_turn_debug.v1",
            account_type: "developer",
            profile_id: rawProfileId,
            profile_bound: true,
            raw_profile_id_included: true,
            trusted_account_session: true,
            trusted_account_binding_required: true,
            account_binding_status: "trusted",
            requested_mode: "act",
            effective_mode: "act",
            requested_runtime: "codex",
            native_transport: "app_server_stdio_jsonl",
            ephemeral_thread: true,
            isolated_runtime_workspace: true,
            sandbox_policy: "read_only",
            network_access: false,
            approval_policy: "never",
            built_in_tools_disabled: true,
            disabled_native_features: ["shell", "web_search"],
            model_visible_tools: ["workspace_os.status"],
            account_locked_tools: ["repo.search"],
            goal_allowed_tools: ["workspace_os.status"],
            route_prompt_hash: "prompt:abc",
            route_proposal: {
              schema: "helix.runtime_semantic_route_proposal.v1",
              turn_id: "ask:native-debug-proof",
              proposal_id: "route-proposal:test",
              prompt_hash: "prompt:abc",
              proposal_source: "agent_runtime",
              proposed_route: "workspace_status",
              proposed_tool_family: "workspace",
              proposed_capability_id: "workspace_os.status",
              proposed_capability_ids: ["workspace_os.status"],
              confidence: "high",
              reason_summary: rawPromptText,
              supporting_hint_refs: ["hint:workspace-status"],
            },
            route_admission_reason: "runtime_semantic_route_validated_against_helix_admission",
            route_admitted_tools: ["workspace_os.status"],
            requested_tools: ["workspace_os.status"],
            executed_tools: ["workspace_os.status"],
            successful_tools: ["workspace_os.status"],
            failed_tools: [],
            route_unobserved_tools: [],
            observation_reentry_refs: ["observation:workspace-status"],
            effective_model: "gpt-5.4-mini",
            effective_reasoning_effort: "low",
            native_item_types: ["dynamicToolCall", "agentMessage"],
            forbidden_native_item_types: [],
            native_thread_id: "thread:native:test",
            native_turn_id: "turn:native:test",
            native_final_item_id: "item:native:final",
            native_turn_status: "completed",
            terminal_candidate_present: true,
            compatibility_fallback_required: false,
            compatibility_fallback_reason: null,
            prompt_text: rawPromptText,
          },
          Authorization: "Bearer native-secret-must-not-export",
        },
        codex_native_compatibility_fallback: {
          schema: "helix.codex_native_compatibility_fallback.v1",
          activated: false,
          native_attempted: true,
          native_fallback_reason: null,
          native_unobserved_capability_ids: [],
          gateway_recovery_attempted: false,
          gateway_recovery_result_count: 0,
          gateway_recovery_capability_ids: [],
          compatibility_transport: "codex_exec",
        },
        realtime_grounded_answer_feedback: {
          schema: "helix.runtime_goal.realtime_grounded_feedback.v1",
          handoff_id: "realtime-handoff:test",
          account_bound: true,
          feedback_recorded: true,
          relay_status: "response_requested",
          relay_failure_code: null,
          blocked_reason: null,
          answer_text: groundedAnswerText,
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.codex_native_provider_bridge).toMatchObject({
      schema: "helix.codex_native_provider_bridge.v1",
      attempted: true,
      status: "completed",
      effective_model: "gpt-5.4-mini",
      effective_reasoning_effort: "low",
      native_workstation_turn: {
        profile_bound: true,
        raw_profile_id_included: false,
        model_visible_tools: ["workspace_os.status"],
        route_admitted_tools: ["workspace_os.status"],
        requested_tools: ["workspace_os.status"],
        executed_tools: ["workspace_os.status"],
        successful_tools: ["workspace_os.status"],
        failed_tools: [],
        route_unobserved_tools: [],
        observation_reentry_refs: ["observation:workspace-status"],
        native_turn_id: "turn:native:test",
        native_final_item_id: "item:native:final",
        native_turn_status: "completed",
        terminal_candidate_present: true,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      },
    });
    expect(exported.codex_native_provider_bridge.native_workstation_turn.route_proposal)
      .toMatchObject({
        proposed_capability_id: "workspace_os.status",
        proposed_capability_ids: ["workspace_os.status"],
        reason_summary_included: false,
        terminal_eligible: false,
      });
    expect(exported.codex_native_compatibility_fallback).toMatchObject({
      activated: false,
      native_attempted: true,
      native_unobserved_capability_ids: [],
      compatibility_transport: "codex_exec",
      terminal_eligible: false,
    });
    expect(exported.realtime_grounded_answer_feedback).toMatchObject({
      handoff_id: "realtime-handoff:test",
      account_bound: true,
      feedback_recorded: true,
      relay_status: "response_requested",
      answer_authority: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(text).not.toContain(rawProfileId);
    expect(text).not.toContain(rawPromptText);
    expect(text).not.toContain(groundedAnswerText);
    expect(text).not.toContain("native-secret-must-not-export");
    expect(text).not.toContain('"profile_id":');
    expect(text).not.toContain('"answer_text":');
  });

  it("preserves client note persistence receipts for workstation note creation", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:note-create-client-receipt",
        question: 'make a note for me "hh"',
        content: "Note saved.",
      },
      {
        selected_final_answer: "Note saved.",
        final_answer_source: "client_workstation_receipt",
        terminal_artifact_kind: "note_update_receipt",
        ask_turn_solver_trace: {
          schema: "helix.ask_turn_solver_trace.v1",
          turn_id: "ask:note-create-client-receipt",
          completed_solver_path: true,
          final_arbitration: {
            terminal_artifact_kind: "note_update_receipt",
            final_answer_source: "client_workstation_receipt",
          },
        },
        action_envelope: {
          schema: "helix.ask.action_envelope.v1",
          workstation_actions: [
            {
              action: "run_panel_action",
              panel_id: "workstation-notes",
              action_id: "create_note",
              args: { body: "hh" },
            },
          ],
        },
        workstation_gateway_call_results: [
          {
            capability_id: "workstation-notes.create_note",
            ok: true,
          },
        ],
        agent_step_loop: {
          iterations: [
            {
              decision: {
                chosen_capability: "workstation-notes.create_note",
              },
            },
          ],
        },
        workspace_action_client_ack: [
          {
            turn_id: "ask:note-create-client-receipt",
            item_id: "workstation-receipt:note-1",
            action_key: "workstation-notes.create_note",
            target_id: "workstation-notes",
            action_id: "create_note",
            applied: true,
            persisted: true,
            receipt_kind: "note_update_receipt",
            state_observed: true,
          },
        ],
        client_receipt_terminal: {
          turn_id: "ask:note-create-client-receipt",
          text: "Note saved.",
          receipt_kind: "note_update_receipt",
          panel_id: "workstation-notes",
          action_id: "create_note",
          note_id: "note-1",
        },
        debug: {
          turn_id: "ask:note-create-client-receipt",
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).toBe("Note saved.");
    expect(exported.final_answer_source).toBe("client_workstation_receipt");
    expect(exported.terminal_artifact_kind).toBe("note_update_receipt");
    expect(exported.ask_turn_solver_trace).toMatchObject({
      schema: "helix.ask_turn_solver_trace.v1",
      turn_id: "ask:note-create-client-receipt",
      completed_solver_path: true,
      final_arbitration: {
        terminal_artifact_kind: "note_update_receipt",
      },
    });
    expect(exported.action_envelope).toMatchObject({
      schema: "helix.ask.action_envelope.v1",
      workstation_actions: [
        expect.objectContaining({
          panel_id: "workstation-notes",
          action_id: "create_note",
        }),
      ],
    });
    expect(exported.workstation_gateway_call_results).toEqual([
      expect.objectContaining({
        capability_id: "workstation-notes.create_note",
      }),
    ]);
    expect(exported.agent_step_loop).toMatchObject({
      iterations: [
        {
          decision: {
            chosen_capability: "workstation-notes.create_note",
          },
        },
      ],
    });
    expect(exported.workspace_action_client_ack).toEqual([
      expect.objectContaining({
        action_key: "workstation-notes.create_note",
        receipt_kind: "note_update_receipt",
        persisted: true,
        state_observed: true,
      }),
    ]);
    expect(exported.client_receipt_terminal).toMatchObject({
      turn_id: "ask:note-create-client-receipt",
      receipt_kind: "note_update_receipt",
      panel_id: "workstation-notes",
      action_id: "create_note",
    });
  });

  it("fails closed when backend ref is advertised but hard Ask entrypoint was explicitly not observed", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:debug-ref-without-runtime",
        question: "Using my previous reflection and current Image Lens evidence, frame a candidate postulate.",
        content: "I could not complete that turn.",
      },
      {
        selected_final_answer: "I could not complete that turn.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        ask_entrypoint_failure_code: "backend_ask_entry_required",
        debug_export_ref: {
          endpoint: "/api/agi/ask/turn/ask%3Adebug-ref-without-runtime/debug-export",
          turn_id: "ask:debug-ref-without-runtime",
        },
        debug_export_source: "backend_ref_advertised",
      },
    );

    const exported = JSON.parse(text) as Record<string, unknown>;
    expect(exported.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
    expect(exported.final_answer_source).toBe("typed_failure");
    expect(exported.terminal_artifact_kind).toBe("typed_failure");
    expect(exported.terminal_error_code).toBe("backend_ask_entry_required");
    expect(exported.first_broken_rail).toBe("backend_ask_entrypoint");
    expect(exported.repair_target).toBe("prompt_submit_entrypoint");
  });

  it("does not mark conceptual no-run tool explanations as missing backend entrypoint turns", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:moral-graph-concept-no-run",
        question: "What is the Moral Graph reflection tool? Explain conceptually. Do not run it.",
        content: "The Moral Graph reflection tool is a conceptual reflection surface.",
      },
      {
        selected_final_answer: "The Moral Graph reflection tool is a conceptual reflection surface.",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
      },
    );

    const exported = JSON.parse(text) as Record<string, unknown>;
    expect(exported.selected_final_answer).toBe(
      "The Moral Graph reflection tool is a conceptual reflection surface.",
    );
    expect(exported.terminal_error_code).not.toBe("backend_ask_entry_required");
    expect(exported.ask_entrypoint_required).toBe(false);
  });

  it("preserves normal Image Lens crop receipts and terminal presentation in copied debug export", () => {
    const finalAnswer = [
      "**equation_area**",
      "- Bbox: x=10, y=8, width=326, height=238",
      "- Extraction status: partial",
      "- Extracted information: latex_candidate: E = mc^2",
      "- Uncertainty: fixture-backed math OCR candidate",
      "",
      "**caption_text**",
      "- Bbox: x=0, y=0, width=346, height=58",
      "- Extraction status: candidate",
      "- Extracted information: text_candidate: As in Chapter 2 we use the Bianchi identities",
      "- Uncertainty: fixture-backed caption OCR candidate",
    ].join("\n");
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:image-lens-normal",
        question: "Use the Image Lens region tool on the attached image. Inspect the equation area first, then inspect the caption/text area separately.",
        content: finalAnswer,
      },
      {
        selected_final_answer: finalAnswer,
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        agent_runtime: "codex",
        capability_lane_call_results: [
          {
            capability: "visual_analysis.inspect_image_region",
            ok: true,
            receipt: {
              region_label: "equation_area",
              bbox_px: { x: 10, y: 8, width: 326, height: 238 },
              crop_ref: "image-lens://crop/equation-area",
              crop_image_ref: "data:image/png;base64,SHOULD_NOT_APPEAR_IN_PRESENTATION",
              latex_candidate: "E = mc^2",
              extraction_status: "partial",
              uncertainty: ["fixture-backed math OCR candidate"],
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            capability: "visual_analysis.inspect_image_region",
            ok: true,
            receipt: {
              region_label: "caption_text",
              bbox_px: { x: 0, y: 0, width: 346, height: 58 },
              crop_ref: "image-lens://crop/caption-text",
              text_candidate: "As in Chapter 2 we use the Bianchi identities",
              extraction_status: "candidate",
              uncertainty: ["fixture-backed caption OCR candidate"],
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_observation_packets: [
          {
            schema: "helix.agent_step_observation_packet.v1",
            capability_key: "visual_analysis.inspect_image_region",
            status: "succeeded",
            observation_ref: "obs:image-lens-equation",
            produced_artifact_refs: ["obs:image-lens-equation"],
            state_delta: {
              visual_analysis_region_inspection: {
                region_label: "equation_area",
                bbox_px: { x: 10, y: 8, width: 326, height: 238 },
                latex_candidate: "E = mc^2",
                extraction_status: "partial",
              },
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.agent_step_observation_packet.v1",
            capability_key: "visual_analysis.inspect_image_region",
            status: "succeeded",
            observation_ref: "obs:image-lens-caption",
            produced_artifact_refs: ["obs:image-lens-caption"],
            state_delta: {
              visual_analysis_region_inspection: {
                region_label: "caption_text",
                bbox_px: { x: 0, y: 0, width: 346, height: 58 },
                text_candidate: "As in Chapter 2 we use the Bianchi identities",
                extraction_status: "candidate",
              },
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        runtime_lane_request_loop: {
          schema: "helix.runtime_agent_lane_request_loop.v1",
          status: "lane_observation_reentered",
          capability_lane_observation_packets: [
            {
              capability_key: "visual_analysis.inspect_image_region",
              status: "succeeded",
              observation_ref: "obs:image-lens-equation",
            },
            {
              capability_key: "visual_analysis.inspect_image_region",
              status: "succeeded",
              observation_ref: "obs:image-lens-caption",
            },
          ],
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          turn_id: "ask:image-lens-normal",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_text_preview: finalAnswer,
          server_authoritative: true,
          terminal_eligible: true,
          assistant_answer: false,
        },
        terminal_presentation: {
          schema: "helix.terminal_presentation.v1",
          turn_id: "ask:image-lens-normal",
          concise_text: finalAnswer,
          terminal_artifact_kind: "agent_provider_terminal_candidate",
          final_answer_source: "agent_provider_terminal_candidate",
          presentation_policy: "preserve_provider_text",
          assistant_answer: false,
          raw_content_included: false,
        },
        terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
        debug: {
          turn_id: "ask:image-lens-normal",
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).toBe(finalAnswer);
    expect(exported.final_answer_source).toBe("agent_provider_terminal_candidate");
    expect(exported.terminal_artifact_kind).toBe("agent_provider_terminal_candidate");
    expect(exported.terminal_error_code).toBeNull();
    expect(exported.debug_export_source).toBe("embedded_backend_payload");
    expect(exported.backend_debug_response_status).toBe("embedded_payload");
    expect(exported.provider_prompt_leak_guard).toBeNull();
    expect(exported.capability_lane_call_results).toHaveLength(2);
    expect(exported.capability_lane_observation_packets).toHaveLength(2);
    expect(exported.runtime_lane_request_loop).toMatchObject({
      status: "lane_observation_reentered",
    });
    expect(exported.capability_lane_call_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminal_eligible: false,
          assistant_answer: false,
          receipt: expect.objectContaining({
            region_label: "equation_area",
            bbox_px: { x: 10, y: 8, width: 326, height: 238 },
            latex_candidate: "E = mc^2",
            extraction_status: "partial",
            terminal_eligible: false,
            assistant_answer: false,
          }),
        }),
        expect.objectContaining({
          terminal_eligible: false,
          assistant_answer: false,
          receipt: expect.objectContaining({
            region_label: "caption_text",
            bbox_px: { x: 0, y: 0, width: 346, height: 58 },
            text_candidate: "As in Chapter 2 we use the Bianchi identities",
            extraction_status: "candidate",
            terminal_eligible: false,
            assistant_answer: false,
          }),
        }),
      ]),
    );
    expect(exported.terminal_presentation).toMatchObject({
      concise_text: finalAnswer,
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      final_answer_source: "agent_provider_terminal_candidate",
    });
    expect(exported.terminal_answer_authority).toMatchObject({
      terminal_text_preview: finalAnswer,
      server_authoritative: true,
    });
    expect(exported.ui_debug_parity_harness).toMatchObject({
      visible_final_answer: finalAnswer,
      selected_final_answer: finalAnswer,
      ui_answer_equals_selected_final_answer: true,
      has_terminal_authority: true,
    });
    const presentationFields = JSON.stringify({
      selected_final_answer: exported.selected_final_answer,
      terminal_presentation: exported.terminal_presentation,
      terminal_answer_authority: exported.terminal_answer_authority,
      ui_debug_parity_harness: exported.ui_debug_parity_harness,
    });
    expect(presentationFields).not.toContain("data:image");
    expect(presentationFields).not.toContain("SHOULD_NOT_APPEAR_IN_PRESENTATION");
  });

  it("keeps backend-entrypoint failures from exposing projection text as the visible final answer", () => {
    const projectionText = [
      "The runtime provider echoed Helix internal capability instructions after Image Lens observations re-entered.",
      "**caption_text**",
      "text_candidate: As in Chapter 2 we use the Bianchi identities.",
      "tokamak.plasma.thermal_pressure_proxy",
    ].join("\n");
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:image-lens-backend-required",
        question: "Use the Image Lens region tool on the attached image. Inspect the equation area first.",
        content: projectionText,
      },
      {
        selected_final_answer: projectionText,
        visible_final_answer: projectionText,
        final_answer_source: "workstation_tool_evaluation",
        terminal_artifact_kind: "workstation_tool_evaluation",
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        ask_entrypoint_failure_code: "backend_ask_entry_required",
        current_turn_artifact_ledger: [],
        debug: {
          turn_id: "ask:image-lens-backend-required",
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
    expect(exported.final_answer_source).toBe("typed_failure");
    expect(exported.terminal_artifact_kind).toBe("typed_failure");
    expect(exported.terminal_error_code).toBe("backend_ask_entry_required");
    expect(exported.ui_debug_parity_harness).toMatchObject({
      visible_final_answer: exported.selected_final_answer,
      selected_final_answer: exported.selected_final_answer,
      ui_answer_equals_selected_final_answer: true,
    });
    expect(exported.selected_final_answer).not.toContain("tokamak");
    expect(exported.ui_debug_parity_harness.visible_final_answer).not.toContain("Bianchi identities");
  });

  it("projects route evidence authority when it blocks a wrong-route terminal", () => {
    const staleScholarlyFallback =
      "I cannot answer scholarly paper content from this turn because no scholarly-research.lookup_papers observation packet was materialized.";
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:moral-graph-route-authority-debug-export",
        question: "Review this current route authority projection. Do not use scholarly lookup.",
        content: staleScholarlyFallback,
      },
      {
        selected_final_answer: staleScholarlyFallback,
        final_answer_source: "scholarly_research_answer",
        terminal_artifact_kind: "scholarly_research_answer",
        terminal_answer_envelope: {
          terminal_kind: "final_answer",
          terminal_artifact_kind: "scholarly_research_answer",
          final_answer_source: "scholarly_research_answer",
          terminal_text: staleScholarlyFallback,
        },
        route_evidence_authority: {
          schema: "helix.route_evidence_authority.v1",
          turn_id: "ask:moral-graph-route-authority-debug-export",
          candidate_tools: [
            {
              capability_id: "moral-graph.reflect_context",
              family: "moral_graph",
              reason: "requested_route",
            },
            {
              capability_id: "scholarly-research.lookup_papers",
              family: "scholarly_research",
              reason: "explicitly_suppressed",
            },
          ],
          admitted_tools: [
            {
              capability_id: "moral-graph.reflect_context",
              family: "moral_graph",
              admission_ref: "ask:moral-graph-route-authority-debug-export:moral_graph_admission",
            },
          ],
          rejected_tools: [
            {
              capability_id: "scholarly-research.lookup_papers",
              family: "scholarly_research",
              reason: "route_suppressed",
            },
          ],
          supporting_evidence_refs: ["ask:moral-graph-route-authority-debug-export:moral_graph_observation"],
          allowed_terminal_artifact_kinds: ["model_synthesized_answer", "typed_failure"],
          forbidden_terminal_artifact_kinds: ["scholarly_research_answer"],
          required_terminal_kind: null,
          terminal_product_allowed: true,
          current_turn_only: true,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).not.toBe(staleScholarlyFallback);
    expect(exported.selected_final_answer).not.toContain("scholarly paper content");
    expect(exported.final_answer_source).toBe("typed_failure");
    expect(exported.terminal_artifact_kind).toBe("typed_failure");
    expect(exported.terminal_error_code).toBe("route_terminal_product_not_allowed");
    expect(exported.route_evidence_authority).toMatchObject({
      schema: "helix.route_evidence_authority.v1",
      allowed_terminal_artifact_kinds: ["model_synthesized_answer", "typed_failure"],
      forbidden_terminal_artifact_kinds: ["scholarly_research_answer"],
    });
    expect(exported.hard_evidence_turn_path_trace).toMatchObject({
      route_evidence_authority_ref: "ask:moral-graph-route-authority-debug-export:route_evidence_authority",
      route_authority_terminal_product_allowed: true,
    });
  });

  it("preserves rendered Image Lens reply-scoped exports when backend artifacts are not advertised", () => {
    const finalAnswer = [
      "The runtime provider echoed Helix internal capability instructions after Image Lens observations re-entered, so I am using only the observation receipts below and not the echoed provider text.",
      "",
      "**crop_1**",
      "- Bbox: x=0, y=0, width=1, height=1",
      "- Extraction status: failed",
      "- Extracted information: no text_candidate or latex_candidate was returned for this crop",
    ].join("\n");
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:image-lens-rendered-card",
        question:
          "Here is a scientific document image. Extract the visible text, equations, equation labels, LaTeX candidates, symbols, bbox/crop refs, confidence, and uncertainty.",
        content: finalAnswer,
      },
      {
        debug_export_rebuild_reason: "rendered_button_scope",
        debug_export_source: "rendered_reply_dom",
        selectedDebugFinalAnswer: finalAnswer,
        selected_final_answer: finalAnswer,
        final_answer_source: "provider_image_lens_observation_report",
        terminal_artifact_kind: "image_lens_observation_report",
        ask_entrypoint_required: true,
        backend_debug_response_status: "not_advertised",
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).toBe(finalAnswer);
    expect(exported.final_answer_source).toBe("provider_image_lens_observation_report");
    expect(exported.terminal_artifact_kind).toBe("image_lens_observation_report");
    expect(exported.terminal_error_code).toBeNull();
    expect(exported.ask_entrypoint_required).toBe(true);
    expect(exported.ask_entrypoint_observed).toBeNull();
    expect(exported.ask_entrypoint_failure_code).toBeNull();
    expect(exported.debug_export_source).toBe("rendered_reply_dom");
    expect(exported.selected_final_answer).not.toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
  });

  it("projects scientific branch gates and run traces without copying OCR text into the compact debug summary", () => {
    const finalAnswer = [
      "Theory context reflection answer:",
      "Theory reflection located discussion context as evidence only: Weyl/Bianchi crop context.",
      "Scientific evidence guard:",
      "- Evidence domain: weyl_bianchi; branch gate: restricted; congruence floor: domain_context_match.",
    ].join("\n");
    const scientificEvidencePacket = {
      schema: "helix.scientific_evidence_packet.v1",
      evidence_type: "image_lens_region_ocr_math",
      source_ref_hash: "sha256:test-bianchi",
      source_image: {
        ref_hash: "sha256:test-bianchi",
        source_kind: "image_lens_source",
        page_number: null,
        raw_ref_included: false,
      },
      crop_region_id: "image_lens_region:test-bianchi",
      crop_region: {
        region_id: "image_lens_region:test-bianchi",
        bbox_px: { x: 0, y: 0, width: 346, height: 255 },
        source_ref_hash: "sha256:test-bianchi",
      },
      bbox_px: { x: 0, y: 0, width: 346, height: 255 },
      ocr_text_candidate: "SECRET_OCR_TEXT_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE",
      text_candidate: "SECRET_OCR_TEXT_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE",
      latex_candidate: "\\SECRET_LATEX_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE",
      symbol_candidates: ["\\nabla", "\\psi"],
      primary_domain: "weyl_bianchi",
      uncertainty: ["OCR symbols are uncertain."],
      extraction_status: "partial",
      admissibility: {
        status: "admissible_observation",
        congruence_grade_floor: "domain_context_match",
        allowed_branch_hints: ["weyl", "bianchi"],
        blocked_branch_hints: ["tokamak"],
      },
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificBranchGate = {
      schema: "helix.scientific_branch_gate.v1",
      status: "restricted",
      primary_domain: "weyl_bianchi",
      congruence_grade_floor: "domain_context_match",
      rejected_badge_ids: [],
      rejected_calculator_payload_ids: [
        "tokamak_thermal_pressure_payload",
        "tokamak_confinement_energy_payload",
      ],
      congruence_assessments: [
        {
          target_ref: "tokamak_thermal_pressure_payload",
          target_kind: "calculator_payload",
          grade: "false_friend",
          reasons: ["Target matched a blocked scientific branch hint for this evidence domain."],
          matched_symbols: [],
          blocked_by_branch_hint: true,
        },
        {
          target_ref: "weyl.bianchi.curvature_identity",
          target_kind: "badge",
          grade: "domain_context_match",
          reasons: ["Target matched an allowed scientific branch hint without direct symbol overlap."],
          matched_symbols: [],
          blocked_by_branch_hint: false,
        },
      ],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificRunTrace = {
      schema: "helix.scientific_run_trace.v1",
      trace_id: "scientific_run:test-bianchi",
      source_ref_hash: "sha256:test-bianchi",
      primary_domain: "weyl_bianchi",
      branch_gate_status: "restricted",
      congruence_grade_floor: "domain_context_match",
      admitted_calculator_payload_ids: [],
      rejected_calculator_payload_ids: [
        "tokamak_thermal_pressure_payload",
        "tokamak_confinement_energy_payload",
      ],
      rejected_badge_ids: [],
      stages: [
        {
          stage: "image_extraction",
          status: "observed",
          artifact_refs: ["sha256:test-bianchi#crop=0,0,346,255"],
          notes: ["Source evidence came from a typed scientific evidence packet."],
        },
        {
          stage: "scientific_evidence_sidecar",
          status: "admitted",
          artifact_refs: ["scientific_image_sidecar:test-bianchi"],
          notes: ["Scientific image sidecar normalized one admissible observation."],
        },
        {
          stage: "theory_reflection",
          status: "restricted",
          artifact_refs: [],
          notes: ["Incompatible calculator payloads were suppressed before handoff."],
        },
      ],
      final_answer_guard: {
        required_claim_boundary: "observation_ocr_graph_match_not_proof",
        must_disclose_uncertainty: true,
        must_disclose_rejections: true,
      },
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificEvidenceSidecar = {
      schema: "helix.scientific_image_evidence_sidecar.v1",
      sidecar_id: "scientific_image_sidecar:test-bianchi",
      sidecar_kind: "transient_scientific_image_evidence",
      source_ref_hash: "sha256:test-bianchi",
      source_kind: "image_lens_source",
      packet_count: 1,
      packets: [scientificEvidencePacket],
      packet_refs: ["sha256:test-bianchi#crop=0,0,346,255"],
      crop_regions: [
        {
          crop_region_id: "image_lens_region:test-bianchi",
          bbox_px: { x: 0, y: 0, width: 346, height: 255 },
          source_ref_hash: "sha256:test-bianchi",
          extraction_status: "partial",
          admissibility_status: "admissible_observation",
          confidence: 0.7,
        },
      ],
      primary_packet_ref: "sha256:test-bianchi#crop=0,0,346,255",
      selected_evidence_object: {
        schema: "helix.promoted_scientific_image_evidence.v1",
        evidence_id: "promoted_scientific_image_evidence:image_lens_region:test-bianchi-row",
        sidecar_id: "scientific_image_sidecar:test-bianchi",
        packet_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
        source_id: "pdf-page-render:test-bianchi",
        source_kind: "pdf_page_render",
        source_hash: "sha256:test-bianchi-page",
        page_number: 5,
        bbox_px: { x: 12, y: 34, width: 300, height: 42 },
        crop_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
        crop_region_id: "image_lens_region:test-bianchi-row",
        text_candidate: "SECRET_OCR_TEXT_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE",
        latex_candidate: "\\SECRET_LATEX_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE",
        requested_label: "7",
        observed_label: "7",
        observed_labels: ["7"],
        evidence_depth: "exact_row_promoted",
        admissibility: "admissible_observation",
        exact_equation_admissibility: "admissible_for_exact_equation",
        exact_row_promotion: {
          status: "promoted",
          reasons: ["requested_label_matched", "single_clean_row", "extracted_latex_candidate_present"],
        },
        active_blockers: [],
        promotion_reasons: ["requested_label_matched", "single_clean_row", "extracted_latex_candidate_present"],
        claim_boundary: "observation_only_not_proof",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      promoted_equation_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
      active_blockers: [],
      historical_blockers: ["partial_extraction_status"],
      primary_domain: "weyl_bianchi",
      primary_domains: ["weyl_bianchi"],
      extraction_summary: {
        extracted_count: 0,
        partial_count: 1,
        failed_count: 0,
        not_run_count: 0,
        admissible_count: 1,
        unverified_count: 0,
        inadmissible_count: 0,
        confidence_max: 0.7,
        confidence_avg: 0.7,
      },
      admissibility: {
        status: "admissible_observation",
        reasons: ["1 Image Lens scientific evidence packet(s) normalized."],
        claim_boundary: "observation_only_not_proof",
      },
      memory_classification: {
        memory_kind: "transient_scientific_image_evidence",
        retrieval_tags: ["scientific_image", "image_lens", "weyl_bianchi"],
        suggested_consumers: [
          "visual_analysis.inspect_image_region",
          "theory-badge-graph.reflect_discussion_context",
          "scientific-calculator.solve_expression",
        ],
        claim_boundary: "observation_only_not_proof",
      },
      compound_route_stages: [
        {
          stage: "image_extraction",
          status: "observed",
          artifact_refs: ["sha256:test-bianchi#crop=0,0,346,255"],
          notes: ["Image Lens crop observations carry bbox and extraction candidates."],
        },
        {
          stage: "scientific_evidence_sidecar",
          status: "admitted",
          artifact_refs: ["scientific_image_sidecar:test-bianchi"],
          notes: ["Scientific image sidecar normalized one admissible observation."],
        },
        {
          stage: "theory_reflection",
          status: "candidate",
          artifact_refs: ["sha256:test-bianchi#crop=0,0,346,255"],
          notes: ["Theory graph branch admission must consume this sidecar, not prompt text."],
        },
        {
          stage: "calculator_payload_filter",
          status: "candidate",
          artifact_refs: [],
          notes: ["Calculator handoff is blocked unless graph reflection keeps the evidence admissible."],
        },
        {
          stage: "final_answer_guard",
          status: "restricted",
          artifact_refs: [],
          notes: ["Final answers must separate OCR candidates, graph congruence, calculator output, and proof authority."],
        },
      ],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificSidecarGatewayBridge = {
      schema: "helix.scientific_image_sidecar_gateway_bridge.v1",
      status: "completed",
      capability_id: "theory-badge-graph.reflect_discussion_context",
      result_count: 1,
      scientific_evidence_sidecar_id: "scientific_image_sidecar:test-bianchi",
      sidecar_admissibility_status: "admissible_observation",
      sidecar_primary_domain: "weyl_bianchi",
      observation_refs: ["theory-reflection:obs:test-bianchi"],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificEvidenceGraphReflection = {
      schema: "helix.scientific_evidence_graph_reflection.v1",
      reflection_id: "scientific_evidence_graph_reflection:test-bianchi",
      evidence_depth: "promoted_exact_equation_row",
      evidence_object_class: "page_ocr_math_candidate",
      selected_evidence_object: scientificEvidenceSidecar.selected_evidence_object,
      exact_evidence_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
      normalized_scientific_features: {
        latex_candidates: ["SECRET_LATEX_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE"],
        text_candidates: ["SECRET_OCR_TEXT_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE"],
        operators: ["differential_operator"],
        variables: ["psi", "phi"],
        constants: [],
        fields: ["scalar_field_phi"],
        geometry_terms: [],
        domain_hints: ["weyl_bianchi"],
        symbol_candidates: ["psi", "phi"],
      },
      graph_attachments: [{
        node_id: "collapse.objective.dp_gravitational_self_energy",
        node_kind: "badge",
        attachment_strength: "moderate",
        evidence_depth: "promoted_exact_equation_row",
        mathematical_reasons: ["Target shares extracted symbol candidates with the observation."],
        matched_symbols: ["psi"],
        claim_boundary: "diagnostic_only",
      }],
      attachment_reasons: ["Evidence object classified as page_ocr_math_candidate."],
      claim_boundary: {
        diagnostic_only: true,
        observation_not_proof: true,
        no_physical_validation: true,
        no_badge_promotion: true,
        no_calculator_authority_without_bound_payload: true,
      },
      blocked_authorities: [
        { authority: "proof", blocked_reason: "Scientific evidence packets are observations, not proof authority." },
        { authority: "calculator_payload", blocked_reason: "Calculator handoff requires bound variables." },
      ],
      upgrade_requirements: ["Extract neighboring definitions, assumptions, and boundary conditions."],
      next_tool_affordances: [
        { capability: "visual_analysis.inspect_image_region", reason: "Inspect adjacent rows/pages." },
      ],
      provenance_refs: ["scientific_image_sidecar:test-bianchi"],
      branch_gate_status: "restricted",
      congruence_grade_floor: "domain_context_match",
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    };
    const calculatorTemplateAdmissibility = {
      schema: "helix.calculator_template_admissibility.v1",
      status: "template_admissible",
      admitted_template_count: 2,
      rejected_template_count: 1,
      calculation_ready_count: 0,
      binding_status: "unbound_variables_units_assumptions",
      claim_boundary: "templates_only_not_calculator_solve_authority",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const scientificEvidenceWorkflowStatus = {
      schema: "helix.scientific_evidence_workflow_status.v1",
      pageLoaded: true,
      sourceId: "pdf-page-render:test-bianchi",
      sourceKind: "pdf_page_render",
      sourceImageHash: "sha256:test-bianchi-page",
      pageNumber: 5,
      pageCount: 9,
      cropRef: "sha256:test-bianchi-crop#crop=12,34,300,42",
      cropRegionRef: "equation_crop:image_lens_region:test-bianchi-row",
      sidecarId: "scientific_image_sidecar:test-bianchi",
      evidenceDepth: "exact_row_promoted",
      promotedRowState: "promoted",
      graphReflectionStatus: "diagnostic_reflected",
      calculatorTemplateStatus: "template_admissible",
      postulateReadyRefs: {
        evidenceSidecarRefs: ["scientific_image_sidecar:test-bianchi"],
        promotedEquationRowRefs: ["promoted_scientific_image_evidence:image_lens_region:test-bianchi-row"],
        pageRenderRefs: ["pdf-page-render:test-bianchi"],
        cropRefs: ["sha256:test-bianchi-crop#crop=12,34,300,42"],
        graphReflectionRefs: ["scientific_evidence_graph_reflection:test-bianchi"],
        provenanceAuditRefs: ["provenance_audit:sha256:test-bianchi-page"],
        calculatorCheckRefs: ["calculator_check:template_admissibility:template_admissible:2"],
        uncertaintyReductionRefs: [],
      },
      activeBlockers: [],
      historicalBlockers: ["partial_extraction_status"],
      claimBoundary: "observation_only_not_proof",
    };
    const artifactAdmissionTrace = {
      schema: "helix.artifact_admission_trace.v1",
      status: "ambient_available",
      route_contract: "unrelated_or_unbound_turn",
      policy: "artifact presence is not permission; artifacts become support refs or prerequisites only when admitted by current-turn intent or route contract",
      continuity_requested: false,
      continuation_required: false,
      ambient_artifacts: [
        { kind: "scientific_image_evidence_sidecar", id: "scientific_image_sidecar:test-bianchi", reason: "available_but_not_bound_by_current_turn" },
      ],
      admitted_artifacts: [],
      required_prerequisites: [],
      ignored_artifacts: [
        { kind: "scientific_image_evidence_sidecar", id: "scientific_image_sidecar:test-bianchi", reason: "ambient_artifact_not_bound_by_current_turn_intent" },
      ],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const workstationArtifactAdmissionTrace = {
      schema: "helix.artifact_admission_trace.v1",
      artifact_family: "workstation_gateway",
      status: "admitted_evidence",
      route_contract: "current_turn_workstation_gateway",
      policy: "artifact presence is not permission; artifacts become support refs or prerequisites only when admitted by current-turn intent or route contract",
      ambient_artifacts: [
        {
          kind: "helix.theory_context_reflection_observation.v1",
          ref: "theory-reflection:obs:test-bianchi",
          capability_id: "theory-badge-graph.reflect_discussion_context",
          reason: "current_turn_gateway_observation",
        },
      ],
      admitted_artifacts: [
        {
          kind: "helix.theory_context_reflection_observation.v1",
          ref: "theory-reflection:obs:test-bianchi",
          capability_id: "theory-badge-graph.reflect_discussion_context",
          reason: "current_turn_observation_admitted_as_support_ref",
        },
      ],
      required_prerequisites: [
        {
          kind: "helix.theory_context_reflection_observation.v1",
          ref: "theory-reflection:obs:test-bianchi",
          capability_id: "theory-badge-graph.reflect_discussion_context",
          status: "satisfied",
          reason: "current_turn_gateway_route_selected_observation",
        },
      ],
      ignored_artifacts: [],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:scientific-evidence-trace",
        question: "Use Image Lens Bianchi/Weyl crop evidence in the Theory Badge Graph.",
        content: finalAnswer,
      },
      {
        selected_final_answer: finalAnswer,
        final_answer_source: "theory_context_reflection_answer",
        terminal_artifact_kind: "theory_context_reflection_answer",
        backend_ask_entrypoint_runtime_fingerprint: {
          schema: "helix.backend_ask_entrypoint_runtime_fingerprint.v1",
          runAsk_entered: true,
          hard_backend_entrypoint_required: true,
          backend_ask_call_attempted: true,
          backend_ask_call_path: "/api/agi/ask/turn",
          route_metadata_source: "hard_tool_backend_entrypoint",
          mandatory_next_tool_name: "theory-badge-graph.reflect_discussion_context",
          legacy_ask_local_bypassed: true,
        },
        route_product_contract: {
          schema: "helix.route_product_contract.v1",
          source_target: "context_reflection",
          allowed_terminal_artifact_kinds: ["theory_context_reflection_answer", "typed_failure"],
          forbidden_terminal_artifact_kinds: ["model_synthesized_answer"],
          required_artifact_refs: [],
          precedence_reason: "theory_reflection_requires_gateway_observation",
          assistant_answer: false,
          raw_content_included: false,
        },
        source_target_intent: {
          schema: "helix.ask_source_target_intent.v1",
          target_source: "context_reflection",
          target_kind: "theory_badge_graph_reflection",
        },
        scientific_evidence_workflow_status: scientificEvidenceWorkflowStatus,
        action_envelope: {
          workstation_actions: [
            {
              panel_id: "theory-badge-graph",
              action_id: "reflect_discussion_context",
            },
          ],
        },
        workstation_gateway_call_results: [
          {
            ok: true,
            capability_id: "theory-badge-graph.reflect_discussion_context",
            observation: {
              schema: "helix.theory_context_reflection_observation.v1",
              scientific_evidence_packet: scientificEvidencePacket,
              scientific_evidence_sidecar: scientificEvidenceSidecar,
              scientific_branch_gate: scientificBranchGate,
              scientific_run_trace: scientificRunTrace,
              scientific_evidence_graph_reflection: scientificEvidenceGraphReflection,
              calculator_template_admissibility: calculatorTemplateAdmissibility,
              scientific_evidence_workflow_status: scientificEvidenceWorkflowStatus,
              calculator_payloads: [],
              rejected_calculator_payload_ids: scientificBranchGate.rejected_calculator_payload_ids,
            },
          },
        ],
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          turn_id: "ask:scientific-evidence-trace",
          terminal_artifact_kind: "theory_context_reflection_answer",
          final_answer_source: "theory_context_reflection_answer",
          terminal_text_preview: finalAnswer,
          server_authoritative: true,
          terminal_eligible: true,
          assistant_answer: false,
        },
        terminal_presentation: {
          schema: "helix.terminal_presentation.v1",
          turn_id: "ask:scientific-evidence-trace",
          concise_text: finalAnswer,
          terminal_artifact_kind: "theory_context_reflection_answer",
          final_answer_source: "theory_context_reflection_answer",
          assistant_answer: false,
          raw_content_included: false,
        },
        debug: {
          turn_id: "ask:scientific-evidence-trace",
          scientific_image_artifact_admission_trace: artifactAdmissionTrace,
          workstation_artifact_admission_trace: workstationArtifactAdmissionTrace,
          runtime_lane_request_loop: {
            schema: "helix.runtime_agent_lane_request_loop.v1",
            status: "lane_observation_reentered",
            scientific_image_sidecar_gateway_bridge: scientificSidecarGatewayBridge,
            assistant_answer: false,
            raw_content_included: false,
          },
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.hard_evidence_turn_path_trace).toMatchObject({
      schema: "helix.hard_evidence_turn_path_trace.v1",
      submit_path_entered: true,
      backend_ask_required: true,
      backend_ask_called: true,
      backend_ask_call_path: "/api/agi/ask/turn",
      route_contract_selected: true,
      route_contract_source_target: "context_reflection",
      route_contract_target_kind: "theory_badge_graph_reflection",
      route_contract_allowed_terminal_artifact_kinds: ["theory_context_reflection_answer", "typed_failure"],
      route_metadata_source: "hard_tool_backend_entrypoint",
      mandatory_next_tool_name: "theory-badge-graph.reflect_discussion_context",
      ambient_artifact_count: 2,
      admitted_artifact_count: 1,
      required_observation_count: 1,
      ignored_artifact_count: 1,
      artifact_admission_statuses: expect.arrayContaining(["ambient_available", "admitted_evidence"]),
      terminal_artifact_selected: "theory_context_reflection_answer",
      final_answer_source_selected: "theory_context_reflection_answer",
      terminal_error_code: null,
      raw_content_included: false,
    });
    expect(exported.scientific_evidence_trace).toMatchObject({
      schema: "helix.scientific_evidence_debug_projection.v1",
      evidence_packet_count: 1,
      evidence_sidecar_count: 1,
      branch_gate_count: 1,
      run_trace_count: 1,
      sidecar_gateway_bridge_count: 1,
      graph_reflection_count: 1,
      calculator_template_check_count: 1,
      promoted_evidence_object_count: 1,
      workflow_status_count: 1,
      artifact_admission_trace_count: 2,
      primary_domains: ["weyl_bianchi"],
      branch_gate_statuses: ["restricted"],
      congruence_grade_floors: ["domain_context_match"],
      graph_reflection_evidence_depths: ["promoted_exact_equation_row"],
      graph_reflection_object_classes: ["page_ocr_math_candidate"],
      graph_reflection_branch_gate_statuses: ["restricted"],
      calculator_template_statuses: ["template_admissible"],
      congruence_assessment_count: 2,
      congruence_grades: expect.arrayContaining(["false_friend", "domain_context_match"]),
      false_friend_refs: ["tokamak_thermal_pressure_payload"],
      congruence_assessments: expect.arrayContaining([
        expect.objectContaining({
          target_ref: "tokamak_thermal_pressure_payload",
          target_kind: "calculator_payload",
          grade: "false_friend",
          blocked_by_branch_hint: true,
        }),
      ]),
      source_ref_hashes: ["sha256:test-bianchi"],
      selected_evidence_object_ids: ["promoted_scientific_image_evidence:image_lens_region:test-bianchi-row"],
      selected_evidence_refs: ["sha256:test-bianchi-crop#crop=12,34,300,42"],
      selected_evidence_reasons: ["latest_promoted_exact_row"],
      calculator_check_refs: ["calculator_check:template_admissibility:template_admissible:2"],
      sidecar_ids: ["scientific_image_sidecar:test-bianchi"],
      workflow_sidecar_ids: ["scientific_image_sidecar:test-bianchi"],
      sidecar_admissibility_statuses: ["admissible_observation"],
      sidecar_memory_kinds: ["transient_scientific_image_evidence"],
      sidecar_gateway_bridge_statuses: ["completed"],
      sidecar_gateway_bridge_blocked_reasons: [],
      sidecar_gateway_bridges: [
        expect.objectContaining({
          status: "completed",
          capability_id: "theory-badge-graph.reflect_discussion_context",
          result_count: 1,
          scientific_evidence_sidecar_id: "scientific_image_sidecar:test-bianchi",
          sidecar_admissibility_status: "admissible_observation",
          sidecar_primary_domain: "weyl_bianchi",
          observation_refs: ["theory-reflection:obs:test-bianchi"],
        }),
      ],
      graph_reflections: [
        expect.objectContaining({
          reflection_id: "scientific_evidence_graph_reflection:test-bianchi",
          evidence_depth: "promoted_exact_equation_row",
          evidence_object_class: "page_ocr_math_candidate",
          exact_evidence_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          selected_evidence_object_id: "promoted_scientific_image_evidence:image_lens_region:test-bianchi-row",
          branch_gate_status: "restricted",
          graph_attachment_count: 1,
          blocked_authorities: expect.arrayContaining([
            expect.objectContaining({ authority: "proof" }),
            expect.objectContaining({ authority: "calculator_payload" }),
          ]),
          upgrade_requirements: ["Extract neighboring definitions, assumptions, and boundary conditions."],
          next_tool_affordances: [
            expect.objectContaining({ capability: "visual_analysis.inspect_image_region" }),
          ],
          provenance_refs: ["scientific_image_sidecar:test-bianchi"],
        }),
      ],
      promoted_evidence_objects: [
        expect.objectContaining({
          evidence_id: "promoted_scientific_image_evidence:image_lens_region:test-bianchi-row",
          sidecar_id: "scientific_image_sidecar:test-bianchi",
          packet_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          source_id: "pdf-page-render:test-bianchi",
          source_hash: "sha256:test-bianchi-page",
          page_number: 5,
          crop_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          requested_label: "7",
          observed_label: "7",
          evidence_depth: "exact_row_promoted",
          exact_row_promotion_status: "promoted",
          active_blockers: [],
          promotion_reasons: expect.arrayContaining(["requested_label_matched", "single_clean_row"]),
          latex_candidate_hash: expect.stringMatching(/^fnv1a:/),
          text_candidate_hash: expect.stringMatching(/^fnv1a:/),
          candidate_text_included: false,
          raw_content_included: false,
        }),
      ],
      calculator_template_checks: [
        expect.objectContaining({
          status: "template_admissible",
          admitted_template_count: 2,
          rejected_template_count: 1,
          calculation_ready_count: 0,
          binding_status: "unbound_variables_units_assumptions",
          claim_boundary: "templates_only_not_calculator_solve_authority",
          raw_content_included: false,
        }),
      ],
      scientific_evidence_workflow_statuses: [
        expect.objectContaining({
          evidence_depth: "exact_row_promoted",
          source_id: "pdf-page-render:test-bianchi",
          source_kind: "pdf_page_render",
          source_image_hash: "sha256:test-bianchi-page",
          page_number: 5,
          crop_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          sidecar_id: "scientific_image_sidecar:test-bianchi",
          promoted_row_state: "promoted",
          graph_reflection_status: "diagnostic_reflected",
          calculator_template_status: "template_admissible",
          active_blockers: [],
          claim_boundary: "observation_only_not_proof",
        }),
      ],
      artifact_admission_traces: [
        expect.objectContaining({
          status: "ambient_available",
          route_contract: "unrelated_or_unbound_turn",
          continuity_requested: false,
          continuation_required: false,
          ambient_artifacts: [
            expect.objectContaining({
              kind: "scientific_image_evidence_sidecar",
              id: "scientific_image_sidecar:test-bianchi",
              reason: "available_but_not_bound_by_current_turn",
            }),
          ],
          required_prerequisites: [],
          ignored_artifacts: [
            expect.objectContaining({
              kind: "scientific_image_evidence_sidecar",
              id: "scientific_image_sidecar:test-bianchi",
              reason: "ambient_artifact_not_bound_by_current_turn_intent",
            }),
          ],
          raw_content_included: false,
        }),
        expect.objectContaining({
          status: "admitted_evidence",
          route_contract: "current_turn_workstation_gateway",
          ambient_artifacts: [
            expect.objectContaining({
              kind: "helix.theory_context_reflection_observation.v1",
              ref: "theory-reflection:obs:test-bianchi",
              capability_id: "theory-badge-graph.reflect_discussion_context",
              reason: "current_turn_gateway_observation",
            }),
          ],
          admitted_artifacts: [
            expect.objectContaining({
              ref: "theory-reflection:obs:test-bianchi",
              capability_id: "theory-badge-graph.reflect_discussion_context",
              reason: "current_turn_observation_admitted_as_support_ref",
            }),
          ],
          required_prerequisites: [
            expect.objectContaining({
              ref: "theory-reflection:obs:test-bianchi",
              capability_id: "theory-badge-graph.reflect_discussion_context",
              status: "satisfied",
              reason: "current_turn_gateway_route_selected_observation",
            }),
          ],
          raw_content_included: false,
        }),
      ],
      compound_stage_sequence: [
        "image_extraction",
        "scientific_evidence_sidecar",
        "theory_reflection",
        "calculator_payload_filter",
        "final_answer_guard",
      ],
      sidecars: [
        expect.objectContaining({
          sidecar_id: "scientific_image_sidecar:test-bianchi",
          sidecar_kind: "transient_scientific_image_evidence",
          selected_evidence_object_id: "promoted_scientific_image_evidence:image_lens_region:test-bianchi-row",
          selected_evidence_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          selected_evidence_reason: "latest_promoted_exact_row",
          promoted_equation_ref: "sha256:test-bianchi-crop#crop=12,34,300,42",
          active_blockers: [],
          historical_blockers: ["partial_extraction_status"],
          admissibility_status: "admissible_observation",
          memory_classification: expect.objectContaining({
            memory_kind: "transient_scientific_image_evidence",
          }),
          stages: expect.arrayContaining([
            expect.objectContaining({ stage: "image_extraction", status: "observed" }),
            expect.objectContaining({ stage: "scientific_evidence_sidecar", status: "admitted" }),
            expect.objectContaining({ stage: "theory_reflection", status: "candidate" }),
          ]),
        }),
      ],
      crop_region_ids: ["image_lens_region:test-bianchi"],
      source_images: [
        {
          ref_hash: "sha256:test-bianchi",
          source_kind: "image_lens_source",
          page_number: null,
          raw_ref_included: false,
        },
      ],
      crop_regions: [
        {
          region_id: "image_lens_region:test-bianchi",
          bbox_px: { x: 0, y: 0, width: 346, height: 255 },
          source_ref_hash: "sha256:test-bianchi",
        },
      ],
      run_trace_ids: ["scientific_run:test-bianchi"],
      rejected_calculator_payload_ids: expect.arrayContaining([
        "tokamak_thermal_pressure_payload",
        "tokamak_confinement_energy_payload",
      ]),
      final_answer_guard_required: true,
      claim_boundary: "observation_ocr_graph_match_not_proof",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(exported.tool_trace_disclosure).toMatchObject({
      scientific_evidence_trace: expect.objectContaining({
        schema: "helix.scientific_evidence_debug_projection.v1",
        run_trace_ids: ["scientific_run:test-bianchi"],
      }),
    });
    const compactTraceText = JSON.stringify({
      scientific_evidence_trace: exported.scientific_evidence_trace,
      tool_trace_disclosure: exported.tool_trace_disclosure,
    });
    expect(compactTraceText).not.toContain("SECRET_OCR_TEXT_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE");
    expect(compactTraceText).not.toContain("SECRET_LATEX_SHOULD_NOT_APPEAR_IN_COMPACT_TRACE");
  });

  it("projects blocked scientific image sidecar gateway bridge audits without a graph observation", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:scientific-sidecar-bridge-blocked",
        question: "Here is a scientific document image. Extract the equations and compare them to the theory graph.",
        content: "The image evidence sidecar was not admissible, so graph reflection was blocked.",
      },
      {
        selected_final_answer: "The image evidence sidecar was not admissible, so graph reflection was blocked.",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        debug: {
          turn_id: "ask:scientific-sidecar-bridge-blocked",
          runtime_lane_request_loop: {
            schema: "helix.runtime_agent_lane_request_loop.v1",
            status: "lane_observation_reentered",
            scientific_image_sidecar_gateway_bridge: {
              schema: "helix.scientific_image_sidecar_gateway_bridge.v1",
              status: "blocked",
              capability_id: "theory-badge-graph.reflect_discussion_context",
              result_count: 0,
              blocked_reason: "scientific_image_evidence_sidecar_not_admissible",
              scientific_evidence_sidecar_id: "scientific_image_sidecar:blocked",
              sidecar_admissibility_status: "inadmissible_for_exact_mapping",
              sidecar_primary_domain: "unknown_math",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.scientific_evidence_trace).toMatchObject({
      schema: "helix.scientific_evidence_debug_projection.v1",
      evidence_packet_count: 0,
      evidence_sidecar_count: 0,
      branch_gate_count: 0,
      run_trace_count: 0,
      sidecar_gateway_bridge_count: 1,
      sidecar_gateway_bridge_statuses: ["blocked"],
      sidecar_gateway_bridge_blocked_reasons: ["scientific_image_evidence_sidecar_not_admissible"],
      sidecar_gateway_bridges: [
        expect.objectContaining({
          status: "blocked",
          capability_id: "theory-badge-graph.reflect_discussion_context",
          result_count: 0,
          blocked_reason: "scientific_image_evidence_sidecar_not_admissible",
          scientific_evidence_sidecar_id: "scientific_image_sidecar:blocked",
          sidecar_admissibility_status: "inadmissible_for_exact_mapping",
          sidecar_primary_domain: "unknown_math",
        }),
      ],
      output_authority: "scientific_evidence_debug_projection",
    });
  });

  it("preserves recovered Image Lens terminal authority and lane receipts over stale typed failure projection", () => {
    const recoveredAnswer = [
      "The runtime provider echoed Helix internal capability instructions after Image Lens observations re-entered, so I am using only the observation receipts below and not the echoed provider text.",
      "",
      "**equation_area**",
      "- Bbox: x=10, y=8, width=326, height=238",
      "- Crop ref: [inline image/png crop data redacted; ref_hash=sha256:abc123]",
      "- Extraction status: partial",
      "- Extracted information: latex_candidate: E = mc^2",
      "- Uncertainty: fixture-backed math OCR candidate",
    ].join("\n");
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "helix-chat-turn:test:ask:image-lens-recovered",
        question: "Use the Image Lens region tool on the attached image and inspect the equation area.",
        content: recoveredAnswer,
      },
      {
        selected_final_answer: "I could not complete that turn.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "provider_prompt_leak",
        terminal_failure_text: "No visual observation receipt was produced for this turn.",
        debug: {
          turn_id: "ask:image-lens-recovered",
          selected_final_answer: recoveredAnswer,
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
          provider_prompt_leak_guard: {
            schema: "helix.provider_prompt_leak_guard.v1",
            status: "recovered_with_image_lens_observation_report",
            leaked_marker_detected: true,
            recovered_with_observation_only_image_lens_report: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          capability_lane_call_results: [
            {
              capability: "visual_analysis.inspect_image_region",
              ok: true,
              receipt: {
                region_label: "equation_area",
                bbox_px: { x: 10, y: 8, width: 326, height: 238 },
                crop_image_ref: "data:image/png;base64,SHOULD_NOT_APPEAR_IN_PRESENTATION",
                latex_candidate: "E = mc^2",
                extraction_status: "partial",
                uncertainty: ["fixture-backed math OCR candidate"],
                terminal_eligible: false,
                assistant_answer: false,
              },
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_observation_packets: [
            {
              schema: "helix.agent_step_observation_packet.v1",
              capability_key: "visual_analysis.inspect_image_region",
              status: "succeeded",
              observation_ref: "obs:image-lens-equation",
              produced_artifact_refs: ["obs:image-lens-equation"],
              state_delta: {
                visual_analysis_region_inspection: {
                  region_label: "equation_area",
                  latex_candidate: "E = mc^2",
                  extraction_status: "partial",
                },
              },
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_reentry_status: "lane_observation_reentered",
          runtime_lane_request_loop: {
            schema: "helix.runtime_agent_lane_request_loop.v1",
            status: "lane_observation_reentered",
            synthesized_by_helix_policy: false,
            capability_lane_observation_packets: [
              {
                capability_key: "visual_analysis.inspect_image_region",
                status: "succeeded",
              },
            ],
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          terminal_answer_authority: {
            schema: "helix.turn_terminal_authority.v1",
            turn_id: "ask:image-lens-recovered",
            terminal_artifact_kind: "agent_provider_terminal_candidate",
            final_answer_source: "agent_provider_terminal_candidate",
            terminal_text_preview: recoveredAnswer,
            server_authoritative: true,
            terminal_eligible: true,
            assistant_answer: false,
          },
          terminal_presentation: {
            schema: "helix.terminal_presentation.v1",
            turn_id: "ask:image-lens-recovered",
            concise_text: recoveredAnswer,
            terminal_artifact_kind: "agent_provider_terminal_candidate",
            final_answer_source: "agent_provider_terminal_candidate",
            presentation_policy: "preserve_provider_text",
            assistant_answer: false,
            raw_content_included: false,
          },
          terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.selected_final_answer).toBe(recoveredAnswer);
    expect(exported.final_answer_source).toBe("agent_provider_terminal_candidate");
    expect(exported.terminal_artifact_kind).toBe("agent_provider_terminal_candidate");
    expect(exported.terminal_error_code).toBeNull();
    expect(exported.debug_export_source).toBe("embedded_backend_payload");
    expect(exported.backend_debug_response_status).toBe("embedded_payload");
    expect(exported.provider_prompt_leak_guard).toMatchObject({
      status: "recovered_with_image_lens_observation_report",
      recovered_with_observation_only_image_lens_report: true,
    });
    expect(exported.capability_lane_call_results).toHaveLength(1);
    expect(exported.capability_lane_observation_packets).toHaveLength(1);
    expect(exported.runtime_lane_request_loop).toMatchObject({
      status: "lane_observation_reentered",
    });
    expect(exported.terminal_presentation).toMatchObject({
      concise_text: recoveredAnswer,
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      final_answer_source: "agent_provider_terminal_candidate",
    });
    expect(exported.terminal_answer_authority).toMatchObject({
      terminal_text_preview: recoveredAnswer,
      server_authoritative: true,
    });
    expect(exported.ui_debug_parity_harness).toMatchObject({
      visible_final_answer: recoveredAnswer,
      selected_final_answer: recoveredAnswer,
      ui_answer_equals_selected_final_answer: true,
      has_terminal_authority: true,
    });
    const presentationFields = JSON.stringify({
      selected_final_answer: exported.selected_final_answer,
      terminal_presentation: exported.terminal_presentation,
      terminal_answer_authority: exported.terminal_answer_authority,
      ui_debug_parity_harness: exported.ui_debug_parity_harness,
    });
    expect(presentationFields).not.toContain("data:image");
    expect(presentationFields).not.toContain("SHOULD_NOT_APPEAR_IN_PRESENTATION");
    expect(exported.selected_final_answer).not.toContain("No visual observation receipt was produced");
  });

  it("includes client playback receipts in the governed voice receipt barrier", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-voice-debug",
        question: "Read this aloud.",
        content: "playback_status: awaiting_client_receipt",
      },
      {
        selected_final_answer: "playback_status: awaiting_client_receipt",
        ask_turn_solver_trace: {
          capability_result: {
            requested_capability: "text_to_speech.speak_text",
            executed_capability: "text_to_speech.speak_text",
            status: "succeeded",
            reentered_solver: true,
            observation_refs: ["turn-voice-debug:capability_lane:text_to_speech.speak_text:1"],
          },
        },
        client_voice_playback_receipts: [
          {
            receiptId: "voice-receipt-queued",
            sourceReceiptId: "turn-voice-debug:capability_lane:text_to_speech.speak_text:1",
            requestId: "turn-voice-debug:voice-request",
            utteranceId: "utt-turn-voice-debug",
            turnKey: "turn-voice-debug",
            status: "queued",
            atMs: 200,
          },
          {
            receiptId: "voice-receipt-delivered",
            sourceReceiptId: "turn-voice-debug:capability_lane:text_to_speech.speak_text:1",
            requestId: "turn-voice-debug:voice-request",
            utteranceId: "utt-turn-voice-debug",
            turnKey: "turn-voice-debug",
            status: "delivered",
            atMs: 260,
          },
        ],
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.voice_playback_receipt_barrier).toMatchObject({
      schema: "helix.voice_playback_receipt_barrier.v1",
      requested_capability: "text_to_speech.speak_text",
      executed_capability: "text_to_speech.speak_text",
      playback_status: "awaiting_client_receipt",
      client_playback_receipt_count: 2,
      latest_client_playback_status: "delivered",
      playback_started: true,
      playback_completed: true,
      playback_failed: false,
      playback_started_at_ms: 200,
      playback_completed_at_ms: 260,
      playback_failed_at_ms: null,
      delivered_utterance_ids: ["utt-turn-voice-debug"],
      delivered_utterance_id: "utt-turn-voice-debug",
      delivered_at_ms: 260,
      receipt_observed: true,
      evidence_reentered: true,
      terminal_eligible: false,
      assistant_answer: false,
    });
    expect(exported.voice_playback_receipt_barrier.client_playback_receipts).toEqual([
      expect.objectContaining({
        receiptId: "voice-receipt-queued",
        status: "queued",
        output_authority: "playback_observation",
      }),
      expect.objectContaining({
        receiptId: "voice-receipt-delivered",
        status: "delivered",
        output_authority: "playback_observation",
      }),
    ]);
  });

  it("preserves runtime goal session and debug proof in the client export", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-runtime-goal",
        question: "/goal wake",
        content: "I am awake.",
      },
      {
        selected_final_answer: "I am awake.",
        final_answer_source: "runtime_goal_command",
        terminal_artifact_kind: "runtime_goal_command_result",
        runtime_goal_command: {
          schema: "helix.runtime_goal.command_result.v1",
          command: "wake",
          goal_id: "goal:test:debug-copy",
          blocked_reason: null,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        runtime_goal_session: {
          schema: "helix.runtime_goal.session.v1",
          goal_id: "goal:test:debug-copy",
          objective: "Keep a running summary of the visible document section.",
          runtime_agent_provider: "codex",
          runtime_session_id: "runtime:codex:test-debug-copy",
          status: "waiting",
          wake_count: 1,
          updated_at: "2026-06-29T12:15:00.000Z",
          job_brief: {
            schema: "helix.runtime_goal.job_brief.v1",
            user_goal_text: "Keep a running summary of the visible document section.",
            expected_wake_behavior:
              "On wake, inspect admitted workstation evidence and report job progress.",
          },
          latest_wake_plan: {
            schema: "helix.runtime_goal.wake_plan.v1",
            requested_observation_or_lane: "docs-viewer.read_visible_surface",
            expected_terminal_product: "job_progress_report",
            relevance_reason: "Visible document evidence can update the assigned job.",
          },
          latest_progress_summary: {
            schema: "helix.runtime_goal.progress_summary.v1",
            job: "Keep a running summary of the visible document section.",
            observed_source: {
              schema: "helix.runtime_goal.source_binding.v1",
              source_kind: "docs_viewer_visible_surface",
              source_label: "docs/current.md",
              doc_path: "docs/current.md",
            },
            evidence_used: {
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              observation_refs: ["obs:visible-surface"],
              receipt_refs: ["receipt:projection"],
              provider_terminal_candidate_ref: "candidate:codex",
            },
            current_summary: "The visible document now emphasizes governed evidence.",
            next_wake_behavior: "Waiting for the next /goal wake.",
            terminal_authority_status: "authorized",
          },
          latest_source_binding: {
            schema: "helix.runtime_goal.source_binding.v1",
            source_kind: "docs_viewer_visible_surface",
            source_label: "docs/current.md",
            doc_path: "docs/current.md",
          },
          latest_observation_refs: ["obs:visible-surface"],
          latest_receipt_refs: ["receipt:projection"],
          latest_provider_terminal_candidate_ref: "candidate:codex",
          terminal_authority_status: "authorized",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        runtime_goal_debug_export: {
          schema: "helix.runtime_goal.debug_export.v1",
          goal_id: "goal:test:debug-copy",
          runtime_provider: "codex",
          runtime_session_id: "runtime:codex:test-debug-copy",
          session_status: "waiting",
          wake_events: [
            {
              wake_event_id: "goal-wake:debug-copy",
              created_at: "2026-06-29T12:15:00.000Z",
            },
          ],
          runtime_goal_job_brief: {
            schema: "helix.runtime_goal.job_brief.v1",
            user_goal_text: "Keep a running summary of the visible document section.",
          },
          runtime_goal_wake_plan: {
            schema: "helix.runtime_goal.wake_plan.v1",
            requested_observation_or_lane: "docs-viewer.read_visible_surface",
            expected_terminal_product: "job_progress_report",
          },
          runtime_goal_progress_summary: {
            schema: "helix.runtime_goal.progress_summary.v1",
            current_summary: "The visible document now emphasizes governed evidence.",
            next_wake_behavior: "Waiting for the next /goal wake.",
          },
          runtime_goal_source_binding: {
            schema: "helix.runtime_goal.source_binding.v1",
            source_kind: "docs_viewer_visible_surface",
            source_label: "docs/current.md",
            doc_path: "docs/current.md",
          },
          runtime_goal_observation_refs: ["obs:visible-surface"],
          runtime_goal_terminal_authority_status: "authorized",
          latest_observation_refs: ["obs:visible-surface"],
          latest_receipt_refs: ["receipt:projection"],
          provider_terminal_candidate: {
            schema: "helix.agent_provider_terminal_candidate.v1",
            candidate_id: "candidate:codex",
            agent_runtime: "codex",
            provider_label: "Codex Workstation Mode",
            grounded_in_observation_refs: ["obs:visible-surface"],
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
          terminal_answer_authority: {
            schema: "helix.turn_terminal_authority.v1",
            server_authoritative: true,
            terminal_kind: "answer",
            final_answer_source: "agent_provider_terminal_candidate",
          },
          terminal_authority_status: "authorized",
          debug_events: [
            {
              schema: "helix.runtime_goal.debug_event.v1",
              stage: "tool_or_lane_requested",
              status: "completed",
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              observation_refs: [],
              receipt_refs: [],
              reentry_status: "not_requested",
              terminal_authority_status: "not_evaluated",
            },
            {
              schema: "helix.runtime_goal.debug_event.v1",
              stage: "tool_or_lane_admitted",
              status: "completed",
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              admitted: true,
              observation_refs: ["obs:visible-surface"],
              receipt_refs: ["receipt:projection"],
              reentry_status: "pending_provider_reentry",
              terminal_authority_status: "pending_helix_terminal_authority",
            },
            {
              schema: "helix.runtime_goal.debug_event.v1",
              stage: "evidence_reentered",
              status: "completed",
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              observation_refs: ["obs:visible-surface"],
              receipt_refs: ["receipt:projection"],
              reentry_status: "reentered",
              terminal_authority_status: "pending_helix_terminal_authority",
            },
            {
              schema: "helix.runtime_goal.debug_event.v1",
              stage: "runtime_candidate_generated",
              status: "completed",
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              observation_refs: ["obs:visible-surface"],
              receipt_refs: ["receipt:projection"],
              terminal_authority_status: "authorized",
              provider_terminal_candidate_ref: "candidate:codex",
            },
            {
              schema: "helix.runtime_goal.debug_event.v1",
              stage: "terminal_authority_evaluated",
              status: "completed",
              requested_tool_or_lane: "docs-viewer.read_visible_surface",
              observation_refs: ["obs:visible-surface"],
              receipt_refs: ["receipt:projection"],
              terminal_authority_status: "authorized",
              reason: "provider_candidate_authorized_after_goal_evidence_reentry",
            },
          ],
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        turn_transcript_events: [
          {
            id: "turn-runtime-goal:runtime-goal-command",
            role: "system",
            type: "runtime_goal_command",
            lane: "runtime_goal",
            text: "Runtime goal command routed: wake.",
            assistant_answer: false,
            terminal_eligible: false,
          },
          {
            id: "turn-runtime-goal:runtime-goal-debug",
            role: "tool",
            type: "terminal_authority_evaluated",
            lane: "runtime_goal",
            text: "Goal goal:test:debug-copy: terminal_authority_evaluated; terminal authority authorized.",
            assistant_answer: false,
            terminal_eligible: false,
          },
          {
            id: "turn-runtime-goal:runtime-goal-final",
            role: "agent",
            type: "terminal_answer",
            lane: "terminal_authority",
            text: "I am awake.",
            assistant_answer: false,
            terminal_eligible: true,
          },
        ],
      },
    );

    const exported = JSON.parse(text);

    expect(exported.runtime_goal_command).toMatchObject({
      command: "wake",
      goal_id: "goal:test:debug-copy",
    });
    expect(exported.runtime_goal_session).toMatchObject({
      goal_id: "goal:test:debug-copy",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:test-debug-copy",
      terminal_authority_status: "authorized",
    });
    expect(exported.runtime_goal_debug_summary).toMatchObject({
      job_title: "Keep a running summary of the visible document section.",
      observed_source_label: "docs/current.md",
      observed_source_doc_path: "docs/current.md",
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      current_progress_summary: "The visible document now emphasizes governed evidence.",
      next_wake_behavior: "Waiting for the next /goal wake.",
      provider_terminal_candidate_ref: "candidate:codex",
    });
    expect(exported.runtime_goal_debug_export).toMatchObject({
      schema: "helix.runtime_goal.debug_export.v1",
      runtime_provider: "codex",
      terminal_authority_status: "authorized",
    });
    expect(exported.runtime_goal_debug_export.debug_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "tool_or_lane_requested" }),
        expect.objectContaining({ stage: "tool_or_lane_admitted" }),
        expect.objectContaining({ stage: "evidence_reentered", reentry_status: "reentered" }),
        expect.objectContaining({ stage: "runtime_candidate_generated" }),
        expect.objectContaining({ stage: "terminal_authority_evaluated" }),
      ]),
    );
    expect(exported.runtime_goal_debug_summary).toMatchObject({
      schema: "helix.runtime_goal.debug_copy_summary.v1",
      command: "wake",
      goal_id: "goal:test:debug-copy",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:test-debug-copy",
      terminal_authority_status: "authorized",
      wake_count: 1,
      last_wake_at: "2026-06-29T12:15:00.000Z",
      last_wake_event_id: "goal-wake:debug-copy",
      session_updated_at: "2026-06-29T12:15:00.000Z",
      evidence_reentered: true,
      runtime_candidate_generated: true,
      terminal_authority_evaluated: true,
      terminal_eligible: false,
      assistant_answer: false,
    });
    expect(exported.runtime_goal_debug_summary.latest_observation_refs).toEqual(["obs:visible-surface"]);
    expect(exported.runtime_goal_debug_summary.latest_receipt_refs).toEqual(["receipt:projection"]);
    expect(exported.runtime_goal_debug_summary.requested_tool_or_lane_sequence).toEqual([
      "docs-viewer.read_visible_surface",
    ]);
    expect(exported.turn_transcript_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          type: "runtime_goal_command",
          lane: "runtime_goal",
          text: "Runtime goal command routed: wake.",
        }),
        expect.objectContaining({
          role: "tool",
          type: "terminal_authority_evaluated",
          lane: "runtime_goal",
        }),
        expect.objectContaining({
          role: "agent",
          type: "terminal_answer",
          lane: "terminal_authority",
          terminal_eligible: true,
          assistant_answer: false,
        }),
      ]),
    );
  });

  it("preserves capability lane session, mail-loop, and goal-binding evidence in the client export", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-lanes",
        question: "keep translating the document",
        content: "Translation lane is active.",
      },
      {
        selected_final_answer: "Translation lane is active.",
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        capability_lane_ids: ["speech_to_text", "live_translation", "text_to_speech"],
        capability_lane_statuses: {
          speech_to_text: "available",
          live_translation: "available",
          text_to_speech: "available",
        },
        capability_lane_call_results: [
          {
            capability: "speech_to_text.transcribe_audio",
            ok: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            capability: "live_translation.translate_text",
            ok: true,
          },
          {
            capability: "text_to_speech.speak_text",
            ok: true,
            receipt: {
              playback_status: "started",
              assistant_answer: false,
              terminal_eligible: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_turn_timeline: [
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 0,
            stage: "lane_visible",
            adapter_boundary: "helix_agent_provider_edge",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "available",
            lane_visible: true,
            lane_requested: false,
            lane_executed: false,
            observation_reentered: false,
            requested_backend_provider: "google_gemini",
            requested_backend_provider_known: true,
            selected_backend_provider: "live_translation.local_runtime",
            fallback_backend_provider: "live_translation.local_runtime",
            selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            observation_ref: null,
            receipt_ref: null,
            terminal_authority_status: "not_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 1,
            stage: "lane_observation",
            adapter_boundary: "helix_agent_provider_edge",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "obs:translation",
            receipt_ref: "receipt:projection",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 2,
            stage: "goal_binding",
            selected_runtime_agent_provider: "codex",
            lane_id: "speech_to_text",
            capability_id: null,
            status: "bound",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "speech_to_text.openai_compatible",
            observation_ref: "obs:stt",
            receipt_ref: "stage_play_live_source_mail:stt-debug",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 3,
            stage: "goal_binding",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            goal_id: "goal:audio-translation-playback",
            goal_binding_id: "goal-binding-docs",
            lane_session_id: "lane-session-docs",
            status: "bound",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "obs:translation-goal-binding",
            receipt_ref: "receipt:translation-goal-binding",
            mail_loop_ref: "stage_play_live_source_mail:translation-debug",
            materialized_mail_loop_evidence: true,
            dispatch_target: "ask_wake",
            dispatch_admission_status: "eligible_waiting_for_mail_loop",
            dispatch_blocked_reason: null,
            wake_dispatch_allowed: false,
            side_effects_allowed: false,
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:goal-docs",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:goal-source-text",
            source_text_char_count: 2048,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            projection_target: "docs_chunk",
            account_locale: "es-US",
            target_language: "es",
            chunk_id: "u0001",
            chunk_index: 0,
            dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
            source_event_id: "docs:event-goal-1",
            source_event_ms: 100,
            observed_at_ms: 125,
            freshness_status: "fresh",
            cancel_requested: false,
            session_control_key:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            latest_source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-latest::docs_chunk::es-US::es",
            lane_session_source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::docs_chunk::es-US::es",
            lane_session_source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latest_source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:latest-goal-source-text::1024::docs::docs_chunk::es-US::es",
            session_lifecycle_action: "record_observation",
            latest_observation_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::u0001::receipt:translation-goal-binding",
            latest_mail_loop_observation_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::document_markdown::docs_chunk::es-US::es::u0001::receipt:translation-goal-binding",
            observation_lane_session_id: "lane-session-docs-observation",
            report_action: "wake_on_salience",
            report_reason: "goal_binding_policy_requests_wake_on_salience",
            quiet_behavior_applied: true,
            wake_expected: true,
            mailbox_wake_expected: true,
            decision_wake_expected: false,
            surface_badge_expected: true,
            terminal_report_requested: true,
            terminal_report_authorized: false,
            report_summary_text:
              "goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience | evidence obs:translation-goal-binding | mail stage_play_live_source_mail:translation-debug | receipt receipt:translation-goal-binding | terminal authority pending_helix_terminal_authority",
            terminal_authority_status: "pending_helix_terminal_authority",
            context_role: "tool_evidence",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 4,
            stage: "goal_binding",
            selected_runtime_agent_provider: "codex",
            lane_id: "text_to_speech",
            capability_id: null,
            status: "bound",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "text_to_speech.existing_voice_service",
            observation_ref: "obs:voice",
            receipt_ref: "receipt:voice-playback",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 5,
            stage: "lane_session",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: null,
            status: "paused",
            lane_visible: false,
            lane_requested: true,
            lane_executed: false,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: null,
            receipt_ref: null,
            session_status: "paused",
            session_health: "degraded",
            session_debug_phase: "paused:pause:observation_recorded",
            session_observation_status: "observation_recorded",
            lifecycle_action: "pause",
            session_lifecycle_action: "pause",
            session_action: "pause",
            lane_session_id: "lane-session-docs",
            session_control_key:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::docs_chunk::es-US::es",
            source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::docs_chunk::es-US::es",
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::fnv1a32:session-source-text::2048::docs::docs_chunk::es-US::es",
            evidence_refs: [
              "lane-session-docs",
              "lane-session-docs:pause:320",
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::docs_chunk::es-US::es",
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::docs_chunk::es-US::es",
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::fnv1a32:session-source-text::2048::docs::docs_chunk::es-US::es",
            ],
            latest_event_id: "lane-session-docs:pause:320",
            terminal_authority_status: "not_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 6,
            stage: "terminal_selected",
            selected_runtime_agent_provider: "codex",
            lane_id: "helix_terminal_authority",
            capability_id: null,
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: true,
            selected_backend_provider: null,
            observation_ref: "obs:translation",
            receipt_ref: "receipt:projection",
            terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_observation_packets: [
          {
            schema: "helix.agent_step_observation_packet.v1",
            capability_key: "speech_to_text.transcribe_audio",
            status: "succeeded",
            state_delta: {
              speech_to_text_observation: {
                schema: "helix.speech_to_text.observation.v1",
                source_kind: "audio_transcript",
                stage_play_mail_id: "stage_play_live_source_mail:stt-debug",
                terminal_eligible: false,
                assistant_answer: false,
                raw_audio_included: false,
              },
              speech_to_text_live_source_mail_item: {
                mailId: "stage_play_live_source_mail:stt-debug",
                sourceKind: "audio_transcript",
                context_role: "tool_evidence",
                terminal_eligible: false,
                assistant_answer: false,
                raw_content_included: false,
              },
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_projection_receipts: [
          {
            receipt_ref: "receipt:projection",
            observation_ref: "obs:translation",
            projection_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:source-text::docs_chunk::es-US::u0001::receipt:projection",
            lane_session_id: "lane-session-docs",
            observation_lane_session_id: "lane-session-docs-observation",
            goal_binding_id: "goal-binding-docs",
            latest_event_id: "lane-session-docs:observation_recorded:300",
            has_observation: true,
            selected_backend_provider: "live_translation.local_runtime",
            projection_target: "docs_chunk",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:projection",
            source_kind: "docs",
            source_text_hash: "fnv1a32:source-text",
            source_text_char_count: 2048,
            account_locale: "es-US",
            target_language: "es",
            chunk_id: "u0001",
            chunk_index: 0,
            dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
            source_event_id: "docs:event:1",
            source_event_ms: 250,
            observed_at_ms: 300,
            freshness_status: "fresh",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_session_debug_summaries: [
          {
            lane_session_id: "lane-session-stt",
            lane_id: "speech_to_text",
            session_status: "running",
            session_health: "healthy",
            latest_event_id: "lane-session-stt:record_observation:200",
            has_observation: true,
            last_observation_ref: "obs:stt",
            last_receipt_ref: "stage_play_live_source_mail:stt-debug",
            latest_receipt_ref: "stage_play_live_source_mail:stt-debug",
            evidence_refs: ["legacy:stt-replay"],
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            lane_session_id: "lane-session-docs",
            lane_id: "live_translation",
            session_status: "running",
            session_health: "healthy",
            latest_event_id: "lane-session-docs:start:150",
            has_observation: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            lane_session_id: "lane-session-tts",
            lane_id: "text_to_speech",
            session_status: "running",
            session_health: "healthy",
            latest_event_id: "lane-session-tts:record_observation:240",
            has_observation: true,
            last_observation_ref: "obs:voice",
            receipt_ref: "receipt:voice-playback",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_mail_loop_debug_summaries: [
          {
            lane_session_id: "lane-session-docs",
            observation_lane_session_id: "lane-session-docs",
            stage_play_mail_id: "stage-play-mail-docs",
            materialized_mail_loop_evidence: true,
            stage_play_wake_expected: true,
            stage_play_wake_kind: "mailbox_wake",
            context_role: "tool_evidence",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_binding_results: [
          {
            ok: true,
            goal_binding: {
              goal_binding_id: "goal-binding-stt",
              goal_id: "goal:audio-translation-playback",
              lane_session_id: "lane-session-stt",
              lane_id: "speech_to_text",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            blocked_reason: null,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            ok: true,
            goal_binding: {
              goal_binding_id: "goal-binding-docs",
              goal_id: "goal:audio-translation-playback",
              lane_session_id: "lane-session-docs",
              lane_id: "live_translation",
              source_id: "document_markdown:docs/research/nhm2.md",
              source_hash: "fnv1a32:goal-docs",
              source_kind: "docs",
              source_text_hash: "fnv1a32:goal-source-text",
              source_text_char_count: 2048,
              projection_target: "docs_chunk",
              account_locale: "es-US",
              target_language: "es",
              latest_chunk_id: "u0001",
              latest_chunk_index: 0,
              latest_dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
              observation_ref: "obs:translation-goal-binding",
              receipt_ref: "receipt:translation-goal-binding",
              terminal_authority_status: "pending_helix_terminal_authority",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            blocked_reason: null,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            ok: true,
            goal_binding: {
              goal_binding_id: "goal-binding-tts",
              goal_id: "goal:audio-translation-playback",
              lane_session_id: "lane-session-tts",
              lane_id: "text_to_speech",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            blocked_reason: null,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_binding_debug_summaries: [
          {
            goal_binding_id: "goal-binding-stt",
            goal_id: "goal:audio-translation-playback",
            lane_session_id: "lane-session-stt",
            lane_id: "speech_to_text",
            binding_status: "bound",
            final_reports_require_terminal_authority: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            goal_binding_id: "goal-binding-docs",
            goal_id: "goal:audio-translation-playback",
            lane_session_id: "lane-session-docs",
            lane_id: "live_translation",
            binding_status: "bound",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:goal-docs",
            source_kind: "docs",
            source_text_hash: "fnv1a32:goal-source-text",
            source_text_char_count: 2048,
            projection_target: "docs_chunk",
            account_locale: "es-US",
            target_language: "es",
            latest_chunk_id: "u0001",
            latest_chunk_index: 0,
            latest_dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
            observation_ref: "obs:translation-goal-binding",
            receipt_ref: "receipt:translation-goal-binding",
            terminal_authority_status: "pending_helix_terminal_authority",
            final_reports_require_terminal_authority: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            goal_binding_id: "goal-binding-tts",
            goal_id: "goal:audio-translation-playback",
            lane_session_id: "lane-session-tts",
            lane_id: "text_to_speech",
            binding_status: "bound",
            final_reports_require_terminal_authority: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_dispatch_readiness: {
          next_lane_ids: ["speech_to_text", "live_translation", "text_to_speech"],
          next_lane_session_ids: ["lane-session-stt", "lane-session-docs", "lane-session-tts"],
          next_goal_binding_ids: ["goal-binding-stt", "goal-binding-docs", "goal-binding-tts"],
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
        capability_lane_reentry_status: "observation_packet_required_for_provider_reentry",
        runtime_lane_request_loop: {
          status: "lane_observation_reentered",
          visible_translation_collector_chain: {
            schema: "helix.runtime_lane_request_loop.visible_translation_collector_chain.v1",
            requested_collector_capability: "workstation.visible_text.collect_translation_targets",
            collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
            collector_requested: true,
            collector_observation_ref: "obs:visible-targets",
            first_collected_existing_source_event_ms: 1782859999000,
            first_collected_existing_observed_at_ms: 1782859999100,
            collected_existing_source_event_ms: [1782859999000],
            collected_existing_observed_at_ms: [1782859999100],
          },
        },
        debug: {
          turn_id: "turn-debug-lanes",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.agent_runtime).toBe("codex");
    expect(exportPayload.selected_agent_provider).toMatchObject({
      id: "codex",
    });
    expect(exportPayload.capability_lane_ids).toEqual(["speech_to_text", "live_translation", "text_to_speech"]);
    expect(exportPayload.capability_lane_call_results).toEqual([
      expect.objectContaining({
        capability: "speech_to_text.transcribe_audio",
        ok: true,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        capability: "live_translation.translate_text",
        ok: true,
      }),
      expect.objectContaining({
        capability: "text_to_speech.speak_text",
        ok: true,
        terminal_eligible: false,
        assistant_answer: false,
        receipt: expect.objectContaining({
          playback_status: "started",
        }),
      }),
    ]);
    expect(exportPayload.capability_lane_turn_timeline).toEqual([
      expect.objectContaining({
        stage: "lane_visible",
        lane_id: "live_translation",
        capability_id: "live_translation.translate_text",
        lane_visible: true,
        lane_requested: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        stage: "lane_observation",
        observation_ref: "obs:translation",
        receipt_ref: "receipt:projection",
        lane_executed: true,
        terminal_authority_status: "pending_helix_terminal_authority",
      }),
      expect.objectContaining({
        stage: "goal_binding",
        lane_id: "speech_to_text",
        observation_ref: "obs:stt",
        receipt_ref: "stage_play_live_source_mail:stt-debug",
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        stage: "goal_binding",
        lane_id: "live_translation",
        selected_backend_provider: "live_translation.local_runtime",
        goal_id: "goal:audio-translation-playback",
        goal_binding_id: "goal-binding-docs",
        lane_session_id: "lane-session-docs",
        observation_ref: "obs:translation-goal-binding",
        receipt_ref: "receipt:translation-goal-binding",
        mail_loop_ref: "stage_play_live_source_mail:translation-debug",
        materialized_mail_loop_evidence: true,
        dispatch_target: "ask_wake",
        dispatch_admission_status: "eligible_waiting_for_mail_loop",
        dispatch_blocked_reason: null,
        wake_dispatch_allowed: false,
        side_effects_allowed: false,
        source_id: "document_markdown:docs/research/nhm2.md",
        source_hash: "fnv1a32:goal-docs",
        source_kind: "document_markdown",
        source_text_hash: "fnv1a32:goal-source-text",
        source_text_char_count: 2048,
        source_identity_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
        latest_mail_loop_observation_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::document_markdown::docs_chunk::es-US::es::u0001::receipt:translation-goal-binding",
        projection_target: "docs_chunk",
        account_locale: "es-US",
        target_language: "es",
        chunk_id: "u0001",
        chunk_index: 0,
        dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
        source_event_id: "docs:event-goal-1",
        source_event_ms: 100,
        observed_at_ms: 125,
        freshness_status: "fresh",
        cancel_requested: false,
        session_control_key:
          "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
        source_binding_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
        latest_source_binding_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-latest::docs_chunk::es-US::es",
        lane_session_source_binding_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::docs_chunk::es-US::es",
        lane_session_source_identity_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
        report_action: "wake_on_salience",
        report_reason: "goal_binding_policy_requests_wake_on_salience",
        report_summary_text:
          "goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience | evidence obs:translation-goal-binding | mail stage_play_live_source_mail:translation-debug | receipt receipt:translation-goal-binding | terminal authority pending_helix_terminal_authority",
        terminal_authority_status: "pending_helix_terminal_authority",
        mailbox_wake_expected: true,
        decision_wake_expected: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        stage: "goal_binding",
        lane_id: "text_to_speech",
        observation_ref: "obs:voice",
        receipt_ref: "receipt:voice-playback",
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        stage: "lane_session",
        lane_id: "live_translation",
        status: "paused",
        session_status: "paused",
        session_health: "degraded",
        session_debug_phase: "paused:pause:observation_recorded",
        session_observation_status: "observation_recorded",
        session_lifecycle_action: "pause",
        latest_event_id: "lane-session-docs:pause:320",
        terminal_authority_status: "not_terminal_authority",
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        stage: "terminal_selected",
        lane_id: "helix_terminal_authority",
        observation_ref: "obs:translation",
        receipt_ref: "receipt:projection",
        terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
        observation_reentered: true,
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      event_count: 7,
      stage_sequence: [
        "visible",
        "observed",
        "goal",
        "goal",
        "goal",
        "session",
        "terminal_selected",
      ],
      stage_sequence_text: "visible > observed > goal > goal > goal > session > terminal_selected",
      visible_count: 1,
      requested_count: 0,
      backend_selected_count: 0,
      observed_count: 1,
      receipt_count: 0,
      reentered_count: 0,
      session_count: 1,
      mail_loop_count: 0,
      goal_binding_count: 3,
      observed_session_count: 0,
      observed_mail_loop_count: 0,
      observed_goal_binding_count: 3,
      observed_lane_activity_count: 5,
      goal_dispatch_plan_count: 0,
      goal_dispatch_admission_count: 0,
      goal_dispatch_readiness_count: 0,
      lane_executed_count: 5,
      visible_only_count: 1,
      observation_ref_count: 5,
      receipt_ref_count: 5,
      session_lifecycle_action_count: 2,
      session_control_key_count: 2,
      session_debug_phase_count: 1,
      session_observation_status_count: 1,
      source_binding_key_count: 2,
      latest_source_binding_key_count: 1,
      source_identity_key_count: 2,
      latest_source_identity_key_count: 1,
      lane_session_source_binding_key_count: 1,
      lane_session_source_identity_key_count: 1,
      latest_mail_loop_observation_key_count: 1,
      latest_observation_key_count: 1,
      observation_lane_session_id_count: 1,
      observation_reentered_count: 1,
      quiet_behavior_applied_count: 1,
      mailbox_wake_expected_count: 1,
      decision_wake_expected_count: 0,
      wake_expected_count: 1,
      surface_badge_expected_count: 1,
      terminal_report_requested_count: 1,
      terminal_report_authorized_count: 0,
      terminal_selected_count: 1,
      terminal_rejected_count: 0,
      visible_lane_does_not_mean_executed: true,
    });
    const timelineSummary = exportPayload.capability_lane_timeline_summary as Record<string, unknown>;
    expect(timelineSummary.console_state_rows).toHaveLength(7);
    expect(timelineSummary.console_state_rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: "helix.capability_lane.console_state_row.v1",
        seq: 0,
        stage: "lane_visible",
        normalized_stage: "visible",
        state_label: "visible_only",
        execution_state: "available_only",
        lane_id: "live_translation",
        capability_id: "live_translation.translate_text",
        adapter_boundary: "helix_agent_provider_edge",
        selected_runtime_agent_provider: "codex",
        requested_backend_provider: "google_gemini",
        requested_backend_provider_known: true,
        selected_backend_provider: "live_translation.local_runtime",
        fallback_backend_provider: "live_translation.local_runtime",
        backend_selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
        lane_visible: true,
        lane_requested: false,
        lane_executed: false,
        observation_reentered: false,
        terminal_authority_status: "not_terminal_authority",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
      expect.objectContaining({
        seq: 1,
        stage: "lane_observation",
        normalized_stage: "observed",
        state_label: "observed_pending_reentry",
        execution_state: "executed_pending_reentry",
        lane_id: "live_translation",
        observation_ref: "obs:translation",
        receipt_ref: "receipt:projection",
        lane_requested: true,
        lane_executed: true,
        observation_reentered: false,
        terminal_authority_status: "pending_helix_terminal_authority",
      }),
      expect.objectContaining({
        seq: 3,
        stage: "goal_binding",
        normalized_stage: "goal",
        state_label: "goal_bound_waiting_for_evidence",
        execution_state: "goal_bound",
        lane_id: "live_translation",
        goal_id: "goal:audio-translation-playback",
        goal_binding_id: "goal-binding-docs",
        lane_session_id: "lane-session-docs",
        observation_ref: "obs:translation-goal-binding",
        receipt_ref: "receipt:translation-goal-binding",
        mail_loop_ref: "stage_play_live_source_mail:translation-debug",
        evidence_refs: expect.arrayContaining([
          "lane-session-docs",
          "lane-session-docs-observation",
          "obs:translation-goal-binding",
          "receipt:translation-goal-binding",
          "stage_play_live_source_mail:translation-debug",
          "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
        ]),
        materialized_mail_loop_evidence: true,
        dispatch_target: "ask_wake",
        dispatch_admission_status: "eligible_waiting_for_mail_loop",
        dispatch_blocked_reason: null,
        wake_dispatch_allowed: false,
        side_effects_allowed: false,
        source_id: "document_markdown:docs/research/nhm2.md",
        source_hash: "fnv1a32:goal-docs",
        source_kind: "docs",
        source_text_hash: "fnv1a32:goal-source-text",
        source_text_char_count: "2048",
        source_identity_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
        latest_source_binding_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-latest::docs_chunk::es-US::es",
        lane_session_source_binding_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::docs_chunk::es-US::es",
        lane_session_source_identity_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:goal-session::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
        projection_target: "docs_chunk",
        account_locale: "es-US",
        target_language: "es",
        chunk_id: "u0001",
        chunk_index: "0",
        dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
        source_event_id: "docs:event-goal-1",
        source_event_ms: "100",
        observed_at_ms: "125",
        freshness_status: "fresh",
        cancel_requested: false,
        report_action: "wake_on_salience",
        report_reason: "goal_binding_policy_requests_wake_on_salience",
        quiet_behavior_applied: true,
        wake_expected: true,
        surface_badge_expected: true,
        terminal_report_requested: true,
        terminal_report_authorized: false,
        terminal_authority_status: "pending_helix_terminal_authority",
        context_role: "tool_evidence",
      }),
      expect.objectContaining({
        seq: 5,
        stage: "lane_session",
        normalized_stage: "session",
        state_label: "session_pause",
        execution_state: "session_active",
        lane_id: "live_translation",
        session_status: "paused",
        session_health: "degraded",
        latest_event_id: "lane-session-docs:pause:320",
        evidence_refs: expect.arrayContaining([
          "lane-session-docs",
          "lane-session-docs:pause:320",
          "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:session-docs::docs_chunk::es-US::es",
        ]),
        terminal_authority_status: "not_terminal_authority",
      }),
      expect.objectContaining({
        seq: 6,
        stage: "terminal_selected",
        normalized_stage: "terminal_selected",
        state_label: "terminal_selected",
        execution_state: "terminal_selected",
        lane_id: "helix_terminal_authority",
        observation_ref: "obs:translation",
        receipt_ref: "receipt:projection",
        observation_reentered: true,
        terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
      }),
    ]));
    expect(exportPayload.capability_lane_observation_packets).toEqual([
      expect.objectContaining({
        capability_key: "speech_to_text.transcribe_audio",
        status: "succeeded",
        terminal_eligible: false,
        assistant_answer: false,
        state_delta: expect.objectContaining({
          speech_to_text_observation: expect.objectContaining({
            schema: "helix.speech_to_text.observation.v1",
            stage_play_mail_id: "stage_play_live_source_mail:stt-debug",
            terminal_eligible: false,
            assistant_answer: false,
            raw_audio_included: false,
          }),
          speech_to_text_live_source_mail_item: expect.objectContaining({
            sourceKind: "audio_transcript",
            context_role: "tool_evidence",
            terminal_eligible: false,
            assistant_answer: false,
          }),
        }),
      }),
    ]);
    expect(exportPayload.capability_lane_projection_receipts).toEqual([
      expect.objectContaining({
        receipt_ref: "receipt:projection",
        observation_ref: "obs:translation",
        projection_key:
          "document_markdown:docs/research/nhm2.md::fnv1a32:source-text::docs_chunk::es-US::u0001::receipt:projection",
        lane_session_id: "lane-session-docs",
        observation_lane_session_id: "lane-session-docs-observation",
        goal_binding_id: "goal-binding-docs",
        latest_event_id: "lane-session-docs:observation_recorded:300",
        has_observation: true,
        selected_backend_provider: "live_translation.local_runtime",
        projection_target: "docs_chunk",
        source_id: "document_markdown:docs/research/nhm2.md",
        source_hash: "fnv1a32:projection",
        source_kind: "docs",
        source_text_hash: "fnv1a32:source-text",
        source_text_char_count: 2048,
        account_locale: "es-US",
        target_language: "es",
        chunk_id: "u0001",
        chunk_index: 0,
        dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
        source_event_id: "docs:event:1",
        source_event_ms: 250,
        observed_at_ms: 300,
        freshness_status: "fresh",
        terminal_authority_status: "pending_helix_terminal_authority",
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_session_debug_summaries).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-stt",
        lane_id: "speech_to_text",
        session_status: "running",
        latest_event_id: "lane-session-stt:record_observation:200",
        has_observation: true,
        latest_receipt_ref: "stage_play_live_source_mail:stt-debug",
        evidence_refs: [
          "legacy:stt-replay",
          "lane-session-stt",
          "lane-session-stt:record_observation:200",
          "obs:stt",
          "stage_play_live_source_mail:stt-debug",
        ],
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        lane_session_id: "lane-session-docs",
        lane_id: "live_translation",
        session_status: "running",
        latest_event_id: "lane-session-docs:start:150",
        has_observation: false,
        evidence_refs: ["lane-session-docs", "lane-session-docs:start:150"],
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        lane_session_id: "lane-session-tts",
        lane_id: "text_to_speech",
        session_status: "running",
        latest_event_id: "lane-session-tts:record_observation:240",
        has_observation: true,
        latest_receipt_ref: "receipt:voice-playback",
        evidence_refs: [
          "lane-session-tts",
          "lane-session-tts:record_observation:240",
          "obs:voice",
          "receipt:voice-playback",
        ],
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_mail_loop_debug_summaries).toEqual([
      expect.objectContaining({
        stage_play_mail_id: "stage-play-mail-docs",
        observation_lane_session_id: "lane-session-docs",
        materialized_mail_loop_evidence: true,
        stage_play_wake_expected: true,
        stage_play_wake_kind: "mailbox_wake",
        mailbox_wake_expected: true,
        decision_wake_expected: false,
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_goal_binding_results).toEqual([
      expect.objectContaining({
        ok: true,
        goal_binding: expect.objectContaining({
          goal_binding_id: "goal-binding-stt",
          goal_id: "goal:audio-translation-playback",
          lane_session_id: "lane-session-stt",
          lane_id: "speech_to_text",
        }),
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        ok: true,
        goal_binding: expect.objectContaining({
          goal_binding_id: "goal-binding-docs",
          goal_id: "goal:audio-translation-playback",
          lane_session_id: "lane-session-docs",
          lane_id: "live_translation",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:goal-docs",
          source_kind: "docs",
          source_text_hash: "fnv1a32:goal-source-text",
          source_text_char_count: 2048,
          projection_target: "docs_chunk",
          account_locale: "es-US",
          target_language: "es",
          latest_chunk_id: "u0001",
          latest_chunk_index: 0,
          latest_dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
          observation_ref: "obs:translation-goal-binding",
          receipt_ref: "receipt:translation-goal-binding",
          terminal_authority_status: "pending_helix_terminal_authority",
        }),
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        ok: true,
        goal_binding: expect.objectContaining({
          goal_binding_id: "goal-binding-tts",
          goal_id: "goal:audio-translation-playback",
          lane_session_id: "lane-session-tts",
          lane_id: "text_to_speech",
        }),
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_goal_binding_debug_summaries).toEqual([
      expect.objectContaining({
        goal_binding_id: "goal-binding-stt",
        lane_id: "speech_to_text",
        binding_status: "bound",
        final_reports_require_terminal_authority: true,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        goal_binding_id: "goal-binding-docs",
        lane_id: "live_translation",
        binding_status: "bound",
        source_id: "document_markdown:docs/research/nhm2.md",
        source_hash: "fnv1a32:goal-docs",
        source_kind: "docs",
        source_text_hash: "fnv1a32:goal-source-text",
        source_text_char_count: 2048,
        projection_target: "docs_chunk",
        account_locale: "es-US",
        target_language: "es",
        latest_chunk_id: "u0001",
        latest_chunk_index: 0,
        latest_dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
        observation_ref: "obs:translation-goal-binding",
        receipt_ref: "receipt:translation-goal-binding",
        terminal_authority_status: "pending_helix_terminal_authority",
        final_reports_require_terminal_authority: true,
        terminal_eligible: false,
        assistant_answer: false,
      }),
      expect.objectContaining({
        goal_binding_id: "goal-binding-tts",
        lane_id: "text_to_speech",
        binding_status: "bound",
        final_reports_require_terminal_authority: true,
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(exportPayload.capability_lane_goal_dispatch_readiness).toMatchObject({
      next_lane_ids: ["speech_to_text", "live_translation", "text_to_speech"],
      next_lane_session_ids: ["lane-session-stt", "lane-session-docs", "lane-session-tts"],
      next_goal_binding_ids: ["goal-binding-stt", "goal-binding-docs", "goal-binding-tts"],
    });
    expect(exportPayload.runtime_lane_request_loop).toMatchObject({
      status: "lane_observation_reentered",
      visible_translation_collector_chain: {
        requested_collector_capability: "workstation.visible_text.collect_translation_targets",
        collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
        collector_observation_ref: "obs:visible-targets",
        first_collected_existing_source_event_ms: 1782859999000,
        first_collected_existing_observed_at_ms: 1782859999100,
        collected_existing_source_event_ms: [1782859999000],
        collected_existing_observed_at_ms: [1782859999100],
      },
    });
  });

  it("derives mail-loop evidence from goal-binding summaries when explicit mail-loop summaries are absent", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-derived-mail",
        question: "keep translating the document",
        content: "Translation lane is active.",
      },
      {
        selected_final_answer: "Translation lane is active.",
        agent_runtime: "codex",
        capability_lane_goal_binding_debug_summaries: [
          {
            goal_binding_id: "goal-binding-docs",
            goal_id: "goal:account-language",
            lane_session_id: "lane-session-docs",
            lane_id: "live_translation",
            binding_status: "bound",
            latest_mail_loop_summary: {
              schema: "helix.capability_lane.mail_loop_debug_summary.v1",
              lane_session_id: "lane-session-docs",
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              stage_play_mail_id: "stage-play-mail-derived",
              stage_play_wake_expected: true,
              observation_ref: "ask:lane:translation:derived-obs",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        debug: {
          turn_id: "turn-debug-derived-mail",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.capability_lane_mail_loop_debug_summaries).toEqual([
      expect.objectContaining({
        schema: "helix.capability_lane.mail_loop_debug_summary.v1",
        lane_session_id: "lane-session-docs",
        stage_play_mail_id: "stage-play-mail-derived",
        stage_play_wake_expected: true,
        stage_play_wake_kind: "mailbox_wake",
        mailbox_wake_expected: true,
        decision_wake_expected: false,
        observation_ref: "ask:lane:translation:derived-obs",
        context_role: "tool_evidence",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
  });

  it("forces lane evidence records to remain non-authoritative in the client export", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-bad-authority",
        question: "keep translating",
        content: "Translation lane is active.",
      },
      {
        capability_lane_turn_timeline: [
          {
            stage: "lane_observation",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            lane_requested: true,
            lane_executed: true,
            observation_ref: "obs:bad-authority",
            receipt_ref: "receipt:bad-authority",
            answer_authority: true,
            terminal_eligible: true,
            assistant_answer: true,
            raw_content_included: true,
          },
        ],
        agent_runtime: "codex",
        capability_lane_session_debug_summaries: [
          {
            lane_session_id: "lane-session-bad-authority",
            latest_event_id: "lane-session-bad-authority:record_observation:1",
            last_observation_ref: "obs:bad-authority",
            answer_authority: true,
            terminal_eligible: true,
            assistant_answer: true,
            raw_content_included: true,
          },
        ],
        capability_lane_mail_loop_debug_summaries: [
          {
            lane_session_id: "lane-session-bad-authority",
            stage_play_wake_expected: true,
            stage_play_wake_kind: "mailbox_wake",
            observation_ref: "obs:bad-authority",
            answer_authority: true,
            terminal_eligible: true,
            assistant_answer: true,
            raw_content_included: true,
          },
        ],
        capability_lane_goal_dispatch_readiness: {
          next_lane_session_ids: ["lane-session-bad-authority"],
          next_evidence_refs: ["obs:bad-authority"],
          answer_authority: true,
          terminal_eligible: true,
          assistant_answer: true,
          raw_content_included: true,
        },
        debug: {
          turn_id: "turn-debug-bad-authority",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.capability_lane_timeline_summary).toMatchObject({
      console_state_rows: [
        expect.objectContaining({
          normalized_stage: "observed",
          execution_state: "executed_pending_reentry",
          selected_runtime_agent_provider: "codex",
          observation_ref: "obs:bad-authority",
          context_role: "tool_evidence",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
      ],
    });
    expect(exportPayload.capability_lane_session_debug_summaries).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-bad-authority",
        selected_runtime_agent_provider: "codex",
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(exportPayload.capability_lane_mail_loop_debug_summaries).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-bad-authority",
        selected_runtime_agent_provider: "codex",
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(exportPayload.capability_lane_goal_dispatch_readiness).toMatchObject({
      selected_runtime_agent_provider: "codex",
      context_role: "tool_evidence",
      answer_authority: false,
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    });
  });

  it("derives console lane rows when a server timeline summary omits projection rows", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-partial-summary",
        question: "show the current document translation state",
        content: "Translation projection is ready.",
      },
      {
        selected_final_answer: "Translation projection is ready.",
        agent_runtime: "codex",
        capability_lane_turn_timeline: [
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 0,
            stage: "lane_projection_receipt",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "obs:docs-projection",
            receipt_ref: "receipt:docs-projection",
            visible_observation_ref: "obs:docs-projection-visible",
            visible_receipt_ref: "receipt:docs-projection-visible",
            evidence_observation_ref: "obs:docs-projection-stale",
            evidence_receipt_ref: "receipt:docs-projection-stale",
            projection_target: "docs_viewer.inline_translation",
            source_id: "document_markdown:docs/audits/research/civilization.md",
            source_hash: "fnv1a32:doc-current",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:visible-chunk",
            source_text_char_count: 512,
            bbox: { x: 16, y: 24, width: 320, height: 48, source: "visible-doc-title" },
            source_identity_key:
              "document_markdown:docs/audits/research/civilization.md::fnv1a32:doc-current::fnv1a32:visible-chunk::512::docs::docs_viewer.inline_translation::es-US::es",
            account_locale: "es-US",
            target_language: "es",
            chunk_id: "visible-1",
            chunk_index: 0,
            dedupe_key: "document_markdown:docs/audits/research/civilization.md:visible-1:es",
            source_event_id: "docs:event-visible-1",
            source_event_ms: 200,
            observed_at_ms: 250,
            freshness_status: "fresh",
            cancel_requested: false,
            terminal_authority_status: "not_terminal_authority",
            context_role: "tool_evidence",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_timeline_summary: {
          schema: "helix.capability_lane.timeline_summary.v1",
          event_count: 1,
          server_summary_marker: "partial_without_console_rows",
        },
        debug: {
          turn_id: "turn-debug-partial-summary",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      event_count: 1,
      server_summary_marker: "partial_without_console_rows",
      visible_lane_does_not_mean_executed: true,
      console_state_rows: [
        expect.objectContaining({
          schema: "helix.capability_lane.console_state_row.v1",
          seq: 0,
          stage: "lane_projection_receipt",
          normalized_stage: "receipt",
          state_label: "receipt_recorded",
          adapter_boundary: "helix_agent_provider_edge",
          selected_runtime_agent_provider: "codex",
          lane_id: "live_translation",
          capability_id: "live_translation.translate_text",
          selected_backend_provider: "live_translation.local_runtime",
          observation_ref: "obs:docs-projection",
          receipt_ref: "receipt:docs-projection",
          latest_visible_observation_ref: "obs:docs-projection-visible",
          latest_visible_receipt_ref: "receipt:docs-projection-visible",
          latest_evidence_observation_ref: "obs:docs-projection-stale",
          latest_evidence_receipt_ref: "receipt:docs-projection-stale",
          projection_target: "docs_chunk",
          source_id: "document_markdown:docs/audits/research/civilization.md",
          source_hash: "fnv1a32:doc-current",
          source_kind: "docs",
          source_text_hash: "fnv1a32:visible-chunk",
          source_text_char_count: "512",
          bbox: { x: 16, y: 24, width: 320, height: 48, source: "visible-doc-title" },
          source_identity_key:
            "document_markdown:docs/audits/research/civilization.md::fnv1a32:doc-current::fnv1a32:visible-chunk::512::docs::docs_chunk::es-US::es",
          account_locale: "es-US",
          target_language: "es",
          chunk_id: "visible-1",
          chunk_index: "0",
          dedupe_key: "document_markdown:docs/audits/research/civilization.md:visible-1:es",
          source_event_id: "docs:event-visible-1",
          source_event_ms: "200",
          observed_at_ms: "250",
          freshness_status: "fresh",
          cancel_requested: false,
          terminal_authority_status: "not_terminal_authority",
          context_role: "tool_evidence",
          reentry_required: true,
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
      ],
      latest_visible_observation_ref_count: 1,
      latest_visible_receipt_ref_count: 1,
      latest_evidence_observation_ref_count: 1,
      latest_evidence_receipt_ref_count: 1,
    });
  });

  it("summarizes visible translation collector to projection to terminal authority chain", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-visible-chain",
        question: "translate this visible document to Spanish",
        content: "Visible document translation was projected.",
      },
      {
        selected_final_answer: "Visible document translation was projected.",
        agent_runtime: "codex",
        capability_lane_call_results: [
          {
            capability: "workstation_tool_reference.collect_visible_translation_targets",
            ok: true,
          },
          {
            capability: "live_translation.translate_text",
            ok: true,
          },
        ],
        capability_lane_turn_timeline: [
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 0,
            stage: "lane_requested",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "workstation_tool_reference",
            capability_id: "workstation_tool_reference.collect_visible_translation_targets",
            lane_requested: true,
            lane_executed: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 1,
            stage: "lane_requested",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            lane_requested: true,
            lane_executed: false,
            target_language: "es",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 2,
            stage: "lane_backend_selected",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            backend_selection_reason: "default_local_runtime",
            lane_requested: true,
            lane_executed: false,
            target_language: "es",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 3,
            stage: "lane_observation",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            lane_requested: true,
            lane_executed: true,
            observation_ref: "obs:visible-chain-translation",
            receipt_ref: "receipt:visible-chain-projection",
            projection_target: "docs_chunk",
            source_id: "document_markdown:docs/current.md",
            chunk_id: "visible-1",
            target_language: "es",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 4,
            stage: "lane_projection_receipt",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            lane_requested: true,
            lane_executed: true,
            observation_ref: "obs:visible-chain-translation",
            receipt_ref: "receipt:visible-chain-projection",
            projection_target: "docs_chunk",
            source_id: "document_markdown:docs/current.md",
            panel_id: "docs-viewer",
            region_id: "docs-viewer:visible-1",
            source_hash: "fnv1a32:doc-current",
            source_kind: "docs_viewer",
            source_text_hash: "fnv1a32:visible-text",
            source_text_char_count: 64,
            chunk_id: "visible-1",
            target_language: "es",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 5,
            stage: "lane_reentered",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            observation_reentered: true,
            observation_ref: "obs:visible-chain-translation",
            receipt_ref: "receipt:visible-chain-projection",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 6,
            stage: "terminal_selected",
            selected_runtime_agent_provider: "codex",
            lane_id: "helix_terminal_authority",
            lane_requested: true,
            lane_executed: true,
            observation_reentered: true,
            observation_ref: "obs:visible-chain-translation",
            receipt_ref: "receipt:visible-chain-projection",
            terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
            terminal_eligible: true,
            assistant_answer: true,
            raw_content_included: false,
          },
        ],
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:visible-chain-projection",
            observation_ref: "obs:visible-chain-translation",
            selected_backend_provider: "live_translation.local_runtime",
            projection_target: "docs_chunk",
            source_id: "document_markdown:docs/current.md",
            source_hash: "fnv1a32:doc-current",
            source_text_hash: "fnv1a32:visible-text",
            source_text_char_count: 64,
            chunk_id: "visible-1",
            target_language: "es",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_reentry_status: "lane_observation_reentered",
        runtime_lane_request_loop: {
          status: "lane_observation_reentered",
          visible_translation_collector_chain: {
            schema: "helix.runtime_agent_visible_translation_chain.v1",
            requested_collector_capability: "workstation.visible_text.collect_translation_targets",
            collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
            translation_capability: "live_translation.translate_text",
            collector_requested: true,
            translation_requested: true,
            collector_observation_ref: "obs:visible-targets",
            collected_target_count: 1,
            collected_source_ids: ["document_markdown:docs/current.md"],
            collected_chunk_ids: ["visible-1"],
            collected_source_kinds: ["docs_viewer"],
            collected_panel_ids: ["docs-viewer"],
            collected_region_ids: ["docs-viewer:visible-1"],
            collected_target_languages: ["es"],
            collected_projection_targets: ["docs_chunk"],
          },
        },
        debug: {
          turn_id: "turn-debug-visible-chain",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.visible_translation_chain_summary).toMatchObject({
      schema: "helix.visible_translation.chain_summary.v1",
      collector_requested: true,
      collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
      collector_observation_ref: "obs:visible-targets",
      collected_target_count: 1,
      translation_requested: true,
      translation_executed: true,
      backend_selected_count: 1,
      projection_receipt_count: 1,
      observation_reentered: true,
      terminal_selected: true,
      terminal_rejected: false,
      chain_complete: true,
      projection_is_terminal_authority: false,
      source_ids: ["document_markdown:docs/current.md"],
      chunk_ids: ["visible-1"],
      source_kinds: ["docs_viewer"],
      panel_ids: ["docs-viewer"],
      region_ids: ["docs-viewer:visible-1"],
      target_languages: ["es"],
      projection_targets: ["docs_chunk"],
      observation_refs: expect.arrayContaining([
        "obs:visible-targets",
        "obs:visible-chain-translation",
      ]),
      receipt_refs: ["receipt:visible-chain-projection"],
    });
  });

  it("derives visible translation target proof from materialized collector call results", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-visible-collector-call-result",
        question: "translate the visible title to Spanish",
        content: "Visible target collection is available.",
      },
      {
        selected_final_answer: "Visible target collection is available.",
        agent_runtime: "codex",
        capability_lane_call_results: [
          {
            schema: "helix.workstation_tool_reference.visible_translation_targets_result.v1",
            ok: true,
            capability: "workstation_tool_reference.collect_visible_translation_targets",
            observation: {
              schema: "helix.workstation_tool_reference.visible_translation_targets_observation.v1",
              observation_ref: "obs:visible-targets-from-call-result",
              target_batch: {
                schema: "helix.visible_translation_target_batch.v1",
                target_count: 1,
                targets: [
                  {
                    schema: "helix.visible_translation_target.v1",
                    source_kind: "panel_text",
                    panel_id: "docs-viewer",
                    doc_path: "docs/current.md",
                    source_id: "workstation-shell#docs-viewer:title",
                    source_hash: "fnv1a32:doc-current",
                    source_text_hash: "fnv1a32:title-text",
                    source_text_char_count: 14,
                    visible_text: "Current Status",
                    chunk_id: "docs-viewer:title",
                    chunk_index: 0,
                    region_id: "docs-viewer:title",
                    dedupe_key: "workstation-shell#docs-viewer:title:es",
                    projection_target: "account_language",
                    account_locale: "es-US",
                    target_language: "es",
                    existing_observation_ref: "obs:existing-title-translation",
                    existing_receipt_ref: "receipt:existing-title-projection",
                    existing_projection_status: "ready",
                    existing_freshness_status: "fresh",
                    existing_terminal_authority_status: "projection_only",
                    existing_source_event_ms: 1782860000000,
                    existing_observed_at_ms: 1782860000100,
                    assistant_answer: false,
                    terminal_eligible: false,
                    raw_content_included: false,
                    reentry_required: true,
                  },
                ],
              },
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        runtime_lane_request_loop: {
          status: "collector_observation_reentered",
          visible_translation_collector_chain: {
            schema: "helix.runtime_agent_visible_translation_chain.v1",
            requested_collector_capability: "workstation.visible_text.collect_translation_targets",
            collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
            translation_capability: "live_translation.translate_text",
            collector_requested: true,
            translation_requested: false,
            collector_observation_ref: "obs:visible-targets-from-call-result",
          },
        },
        debug: {
          turn_id: "turn-debug-visible-collector-call-result",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.visible_translation_chain_summary).toMatchObject({
      schema: "helix.visible_translation.chain_summary.v1",
      collector_requested: true,
      collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
      collector_observation_ref: "obs:visible-targets-from-call-result",
      collected_target_count: 1,
      translation_requested: false,
      translation_executed: false,
      chain_complete: false,
      source_ids: ["workstation-shell#docs-viewer:title"],
      chunk_ids: ["docs-viewer:title"],
      source_kinds: ["panel_text"],
      panel_ids: ["docs-viewer"],
      region_ids: ["docs-viewer:title"],
      target_languages: ["es"],
      projection_targets: ["account_language"],
      existing_observation_refs: ["obs:existing-title-translation"],
      existing_receipt_refs: ["receipt:existing-title-projection"],
      existing_projection_statuses: ["ready"],
      existing_freshness_statuses: ["fresh"],
      existing_terminal_authority_statuses: ["projection_only"],
      existing_source_event_ms: [1782860000000],
      existing_observed_at_ms: [1782860000100],
      first_collected_existing_observation_ref: "obs:existing-title-translation",
      first_collected_existing_receipt_ref: "receipt:existing-title-projection",
      first_collected_existing_projection_status: "ready",
      first_collected_existing_freshness_status: "fresh",
      first_collected_existing_terminal_authority_status: "projection_only",
      first_collected_existing_source_event_ms: 1782860000000,
      first_collected_existing_observed_at_ms: 1782860000100,
      projection_is_terminal_authority: false,
    });
  });

  it("derives visible translation target proof from observation packet state delta", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-visible-collector-packet",
        question: "translate the visible document title to Spanish",
        content: "Visible target packet is available.",
      },
      {
        selected_final_answer: "Visible target packet is available.",
        agent_runtime: "codex",
        capability_lane_call_results: [
          {
            schema: "helix.workstation_tool_reference.visible_translation_targets_result.v1",
            ok: true,
            capability: "workstation_tool_reference.collect_visible_translation_targets",
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              capability_key: "workstation_tool_reference.collect_visible_translation_targets",
              status: "succeeded",
              state_delta: {
                visible_translation_target_batch: {
                  schema: "helix.visible_translation_target_batch.v1",
                  target_count: 1,
                  targets: [
                    {
                      schema: "helix.visible_translation_target.v1",
                      source_kind: "docs_viewer",
                      panel_id: "docs-viewer",
                      doc_path: "docs/current.md",
                      source_id: "document_markdown:docs/current.md#title",
                      source_hash: "fnv1a32:doc-current",
                      source_text_hash: "fnv1a32:title-text",
                      source_text_char_count: 14,
                      visible_text: "Current Status",
                      chunk_id: "docs-current:title",
                      chunk_index: 0,
                      region_id: "docs-viewer:title",
                      dedupe_key: "document_markdown:docs/current.md#title:es",
                      projection_target: "docs_chunk",
                      account_locale: "es-US",
                      target_language: "es",
                      existing_observation_ref: "obs:packet-existing-title-translation",
                      existing_receipt_ref: "receipt:packet-existing-title-projection",
                      existing_projection_status: "stale",
                      existing_freshness_status: "stale_source",
                      existing_terminal_authority_status: "projection_only",
                      existing_source_event_ms: 1782860000200,
                      existing_observed_at_ms: 1782860000300,
                      assistant_answer: false,
                      terminal_eligible: false,
                      raw_content_included: false,
                      reentry_required: true,
                    },
                  ],
                },
              },
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        runtime_lane_request_loop: {
          status: "collector_observation_reentered",
          visible_translation_collector_chain: {
            schema: "helix.runtime_agent_visible_translation_chain.v1",
            requested_collector_capability: "workstation.visible_text.collect_translation_targets",
            collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
            translation_capability: "live_translation.translate_text",
            collector_requested: true,
            translation_requested: false,
            collector_observation_ref: "obs:visible-targets-from-packet",
          },
        },
        debug: {
          turn_id: "turn-debug-visible-collector-packet",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.visible_translation_chain_summary).toMatchObject({
      schema: "helix.visible_translation.chain_summary.v1",
      collector_requested: true,
      collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
      collector_observation_ref: "obs:visible-targets-from-packet",
      collected_target_count: 1,
      translation_requested: false,
      translation_executed: false,
      chain_complete: false,
      source_ids: ["document_markdown:docs/current.md#title"],
      chunk_ids: ["docs-current:title"],
      source_kinds: ["docs_viewer"],
      panel_ids: ["docs-viewer"],
      region_ids: ["docs-viewer:title"],
      target_languages: ["es"],
      projection_targets: ["docs_chunk"],
      existing_observation_refs: ["obs:packet-existing-title-translation"],
      existing_receipt_refs: ["receipt:packet-existing-title-projection"],
      existing_projection_statuses: ["stale"],
      existing_freshness_statuses: ["stale_source"],
      existing_terminal_authority_statuses: ["projection_only"],
      existing_source_event_ms: [1782860000200],
      existing_observed_at_ms: [1782860000300],
      first_collected_existing_observation_ref: "obs:packet-existing-title-translation",
      first_collected_existing_receipt_ref: "receipt:packet-existing-title-projection",
      first_collected_existing_projection_status: "stale",
      first_collected_existing_freshness_status: "stale_source",
      first_collected_existing_terminal_authority_status: "projection_only",
      first_collected_existing_source_event_ms: 1782860000200,
      first_collected_existing_observed_at_ms: 1782860000300,
      projection_is_terminal_authority: false,
    });
  });

  it("normalizes explicit server console rows before exporting lane state", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "turn-debug-explicit-console-row",
        question: "show the current translation lane state",
        content: "Translation lane state is available.",
      },
      {
        selected_final_answer: "Translation lane state is available.",
        agent_runtime: "codex",
        capability_lane_timeline_summary: {
          schema: "helix.capability_lane.timeline_summary.v1",
          event_count: 1,
          console_state_rows: [
            {
              schema: "helix.capability_lane.console_state_row.v1",
              seq: 0,
              stage: "lane_projection_receipt",
              selected_runtime_agent_provider: "codex",
              adapter_boundary: "helix_agent_provider_edge",
              lane_id: "live_translation",
              capability_id: "live_translation.translate_text",
              selected_backend_provider: "live_translation.local_runtime",
              observation_ref: "obs:explicit-console-row",
              receipt_ref: "receipt:explicit-console-row",
              source_id: "document_markdown:docs/current.md",
              source_hash: "fnv1a32:current-doc",
              source_kind: "document_markdown",
              source_text_hash: "fnv1a32:current-text",
              source_text_char_count: 77,
              source_identity_key:
                "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:current-text::77::document_markdown::docs_viewer.inline_translation::es-US::es",
              latest_source_identity_key:
                "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:latest-text::55::document_markdown::docs_viewer.inline_translation::es-US::es",
              projection_target: "docs_viewer.inline_translation",
              account_locale: "es-US",
              target_language: "es",
              chunk_id: "chunk-current",
              chunk_index: 2,
              dedupe_key: "document_markdown:docs/current.md:chunk-current:es",
              latest_source_event_id: "docs:event-current",
              latest_source_event_ms: 300,
              observed_at_ms: 350,
              freshness_status: "fresh",
              answer_authority: true,
              terminal_eligible: true,
              assistant_answer: true,
              raw_content_included: true,
            },
          ],
        },
        debug: {
          turn_id: "turn-debug-explicit-console-row",
        },
      },
    );

    const exportPayload = JSON.parse(text) as Record<string, unknown>;
    expect(exportPayload.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      event_count: 1,
      console_state_rows: [
        expect.objectContaining({
          schema: "helix.capability_lane.console_state_row.v1",
          seq: 0,
          normalized_stage: "receipt",
          execution_state: "receipt_pending_reentry",
          adapter_boundary: "helix_agent_provider_edge",
          selected_runtime_agent_provider: "codex",
          lane_id: "live_translation",
          capability_id: "live_translation.translate_text",
          selected_backend_provider: "live_translation.local_runtime",
          observation_ref: "obs:explicit-console-row",
          receipt_ref: "receipt:explicit-console-row",
          projection_target: "docs_chunk",
          source_id: "document_markdown:docs/current.md",
          source_hash: "fnv1a32:current-doc",
          source_kind: "docs",
          source_text_hash: "fnv1a32:current-text",
          source_text_char_count: "77",
          source_identity_key:
            "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:current-text::77::docs::docs_chunk::es-US::es",
          latest_source_identity_key:
            "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:latest-text::55::docs::docs_chunk::es-US::es",
          chunk_id: "chunk-current",
          chunk_index: "2",
          source_event_id: "docs:event-current",
          source_event_ms: "300",
          observed_at_ms: "350",
          freshness_status: "fresh",
          context_role: "tool_evidence",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
          evidence_refs: expect.arrayContaining([
            "obs:explicit-console-row",
            "receipt:explicit-console-row",
            "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:current-text::77::docs::docs_chunk::es-US::es",
            "document_markdown:docs/current.md::fnv1a32:current-doc::fnv1a32:latest-text::55::docs::docs_chunk::es-US::es",
          ]),
        }),
      ],
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("exports bounded non-terminal continuation and rejection diagnostics", () => {
    const states = Array.from({ length: 12 }, (_, index) => ({
      schema: "helix.agent_continuation_state.v1",
      turn_id: "ask:continuation-debug",
      state_id: `ask:continuation-debug:state:${index + 1}`,
      sequence: index + 1,
      trigger: index === 11 ? "final_review" : "post_attempt",
      goal: { status: "in_progress", satisfied: false, terminal_product_allowed: true },
      observation_refs: {
        existing: [`observation:${index}`],
        new: [`observation:${index + 1}`],
        all: [`observation:${index}`, `observation:${index + 1}`],
      },
      missing_requirement_ids: ["agent_authored_answer"],
      last_attempt: null,
      next_admissible_affordances: [],
      tried_action_fingerprints: [],
      progress: { made_progress: true, no_progress_repeat_count: 0 },
      budget: { soft: { pressure: "none" }, hard: { exhausted: false } },
      allowed_decisions: ["answer", "fail"],
      authority: "runtime_agent_decides_within_admitted_boundaries",
      terminal_eligible: false,
      assistant_answer: false,
    }));
    const rejections = Array.from({ length: 10 }, (_, index) => ({
      schema: "helix.terminal_rejection_observation.v1",
      turn_id: "ask:continuation-debug",
      observation_id: `ask:continuation-debug:rejection:${index + 1}`,
      rejected_candidate_kind: "tool_observation",
      rejected_candidate_ref: `candidate:${index + 1}`,
      rejection_reason: "missing_post_tool_model_step",
      recoverable: true,
      failure_class: "terminal_authority",
      retryability: "retryable",
      next_affordances: [{ decision: "answer" }],
      terminal_eligible: false,
      assistant_answer: false,
    }));
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:continuation-debug",
        question: "Continue from admitted observations.",
        content: "Bounded answer.",
      },
      {
        turn_id: "ask:continuation-debug",
        selected_final_answer: "Bounded answer.",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        agent_continuation_state: states.at(-1),
        agent_continuation_states: states,
        terminal_rejection_observations: rejections,
        current_turn_artifact_ledger: [],
        debug: { turn_id: "ask:continuation-debug" },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.agent_continuation_state).toMatchObject({
      schema: "helix.agent_continuation_state.v1",
      sequence: 12,
      observation_refs: {
        existing: ["observation:11"],
        new: ["observation:12"],
        all: ["observation:11", "observation:12"],
      },
      terminal_eligible: false,
      assistant_answer: false,
    });
    expect(exported.agent_continuation_states).toHaveLength(8);
    expect(exported.agent_continuation_states[0]?.sequence).toBe(5);
    expect(exported.terminal_rejection_observations).toHaveLength(8);
    expect(exported.terminal_rejection_observations.at(-1)).toMatchObject({
      observation_id: "ask:continuation-debug:rejection:10",
      recoverable: true,
      terminal_eligible: false,
      assistant_answer: false,
    });
    expect(exported.debug.agent_continuation_state).toEqual(exported.agent_continuation_state);
  });

  it("exports referent resolution and source summary without prior answer text", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:referent-debug",
        question: "Based on those two causes you just described, compare them.",
        content: "Specific comparison.",
      },
      {
        turn_id: "ask:referent-debug",
        selected_final_answer: "Specific comparison.",
        final_answer_source: "agent_provider_terminal_candidate",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        conversational_referent_resolution: {
          schema: "helix.ask.conversational_referent_resolution.v1",
          referent_detected: true,
          referent_phrase: "deictic_previous_assistant_answer",
          source_kind: "chat_history",
          resolved_source_ref: "chat.final_answer.previous:turn-prior",
          resolved_text_hash: "sha256:prior",
          resolution_confidence: "high",
          resolution_block_reason: null,
          context_role: "evidence_for_followup_reasoning",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        workspace_context_snapshot: {
          chat_referent_context_source_summary: {
            schema: "helix.ask.chat_referent_context_source_summary.v1",
            source_count: 3,
            total_reply_count: 4,
            readable_reply_count: 4,
            selected_source_name: "visible_ask_transcript",
            context_present: true,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
          chat_referent_context: {
            previous_assistant_final_answer: {
              text: "Sensitive prior answer text must not be exported.",
            },
          },
        },
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.conversational_referent_resolution).toMatchObject({
      referent_detected: true,
      resolved_source_ref: "chat.final_answer.previous:turn-prior",
      resolution_confidence: "high",
      raw_content_included: false,
    });
    expect(exported.chat_referent_context_source_summary).toMatchObject({
      selected_source_name: "visible_ask_transcript",
      context_present: true,
      raw_content_included: false,
    });
    expect(text).not.toContain("Sensitive prior answer text must not be exported.");
  });

  it("exports the tool-neutral terminal grounding authority", () => {
    const authority = {
      schema: "helix.terminal_grounding_authority.v1",
      authority_id: "terminal-grounding:test",
      authority_source: "canonical_terminal_boundary",
      turn_id: "ask:grounding-debug",
      terminal_artifact_ref: "ask:grounding-debug:terminal",
      terminal_artifact_kind: "model_synthesized_answer",
      final_answer_source: "final_answer_draft",
      terminal_text_hash: "sha256:test",
      grounding_required: true,
      status: "validated",
      selected_evidence_refs: ["ask:grounding-debug:observation:docs"],
      evidence_reentry_authority: "runtime_event_log",
      runtime_lifecycle_verified: true,
      current_turn_only: true,
      completed_solver_path: true,
      route_authority_ok: true,
      poison_audit_ok: true,
      terminal_authority_ok: true,
      support_coverage_complete: true,
      failure_code: null,
      failure_codes: [],
      assistant_answer: false,
      terminal_eligible: false,
      provider_payload_included: false,
      raw_content_included: false,
    };
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:grounding-debug",
        question: "Summarize the selected document.",
        content: "Grounded answer.",
      },
      {
        turn_id: "ask:grounding-debug",
        selected_final_answer: "Grounded answer.",
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "model_synthesized_answer",
        terminal_grounding_authority: authority,
      },
    );

    const exported = JSON.parse(text) as Record<string, any>;
    expect(exported.terminal_grounding_authority).toEqual(authority);
  });
});
