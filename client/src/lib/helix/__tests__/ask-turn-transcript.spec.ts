import { describe, expect, it } from "vitest";

import {
  buildAskLiveEventFromTurnTranscriptRecord,
  buildHelixRuntimeAskLiveEvents,
  buildHelixTurnTranscriptRows,
  buildHelixWorkstationGatewayTranscriptEvents,
} from "@/lib/helix/ask-turn-transcript";
import { buildHelixAskRuntimeTurnSummary } from "@/lib/helix/ask-runtime-turn-summary";

describe("Helix Ask turn transcript projection", () => {
  it("renders a compact visible translation chain summary row from debug export", () => {
    const reply = {
      id: "turn-visible-chain-summary",
      content: "Visible document translation was projected.",
      debug: {
        turn_id: "turn-visible-chain-summary",
        debug_export: {
          visible_translation_chain_summary: {
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
            observation_refs: ["obs:visible-targets", "obs:visible-chain-translation"],
            receipt_refs: ["receipt:visible-chain-projection"],
          },
        },
      },
    };
    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);

    const visibleTranslationRow = rows.find((row) => row.label === "Visible Translation");

    expect(visibleTranslationRow).toEqual(
      expect.objectContaining({
        label: "Visible Translation",
        role: "system",
        status: "completed",
        text: expect.stringContaining("Visible translation chain complete"),
        meta: expect.stringContaining("terminal authority terminal_selected_after_reentry"),
      }),
    );
    expect(visibleTranslationRow?.text).toContain("collector requested");
    expect(visibleTranslationRow?.text).toContain("translation executed");
    expect(visibleTranslationRow?.text).toContain("source kind docs_viewer");
    expect(visibleTranslationRow?.text).toContain("panel docs-viewer");
    expect(visibleTranslationRow?.text).toContain("region docs-viewer:visible-1");
    expect(visibleTranslationRow?.text).toContain("Projection is not terminal authority.");
    expect(visibleTranslationRow?.meta).toContain("capability live_translation.translate_text");
    expect(visibleTranslationRow?.meta).toContain("receipt receipt:visible-chain-projection");
    expect(visibleTranslationRow?.meta).toContain("source kind docs_viewer");
    expect(visibleTranslationRow?.meta).toContain("panel docs-viewer");
    expect(visibleTranslationRow?.meta).toContain("region docs-viewer:visible-1");
    expect(visibleTranslationRow?.meta).toContain("target es");

    const summaryValue = summary?.rows.find((row) => row.key === "visible_translation_chain")?.value ?? "";
    expect(summaryValue).toContain("complete");
    expect(summaryValue).toContain("collector requested");
    expect(summaryValue).toContain("translation executed");
    expect(summaryValue).toContain("terminal selected");
    expect(summaryValue).toContain("source document_markdown:docs/current.md");
    expect(summaryValue).toContain("chunk visible-1");
    expect(summaryValue).toContain("source kind docs_viewer");
    expect(summaryValue).toContain("panel docs-viewer");
    expect(summaryValue).toContain("region docs-viewer:visible-1");
    expect(summaryValue).toContain("target es");
    expect(summaryValue).toContain("receipt receipt:visible-chain-projection");
    expect(summaryValue).toContain("projection-only, not terminal authority");
  });

  it("projects individual turn transcript records into live-event entries", () => {
    expect(
      buildAskLiveEventFromTurnTranscriptRecord(
        {
          id: "transcript-1",
          text: `Working ${"x".repeat(24)}`,
          role: "tool",
          type: "tool_result",
          source_event_type: "tool_observation",
          status: "completed",
          detail: "calculator",
          step_id: "step-1",
          lane: "scientific-calculator.solve_expression",
          turn_id: "turn-1",
          at_ms: Date.UTC(2026, 0, 2, 3, 4, 5, 678),
          seq: 4.8,
          durationMs: 12.6,
          reconstructed: true,
        },
        "fallback",
        18,
      ),
    ).toEqual({
      id: "transcript-1",
      text: "Working xxxxxxxxx...",
      tool: "tool",
      ts: "2026-01-02T03:04:05.678Z",
      tsMs: Date.UTC(2026, 0, 2, 3, 4, 5, 678),
      seq: 4,
      durationMs: 13,
      meta: {
        stage: "tool_result",
        detail: "calculator",
          status: "completed",
          stepId: "step-1",
          lane: "scientific-calculator.solve_expression",
          capabilityId: null,
          requestedCapabilityId: null,
          executedCapabilityId: null,
          laneSessionId: null,
          sessionControlKey: null,
          sourceBindingKey: null,
          latestObservationKey: null,
          latestMailLoopObservationKey: null,
          goalBindingKey: null,
          latestEventId: null,
          hasObservation: null,
          observationLaneSessionId: null,
          selectedBackendProvider: null,
          backendCostClass: null,
          backendLatencyClass: null,
          backendPrivacyClass: null,
          fallbackBackendProvider: null,
          stagePlayMailDeliveryStatus: null,
          previousStagePlayMailId: null,
          materializedMailLoopEvidence: null,
          receiptRef: null,
          observationRef: null,
          sourceId: null,
          sourceHash: null,
          sourceKind: null,
          sourceTextHash: null,
          sourceTextCharCount: null,
          sourceProjectionTarget: null,
          projectionKey: null,
          accountLocale: null,
          latestChunkId: null,
          latestChunkIndex: null,
          latestDedupeKey: null,
          latestSourceEventId: null,
          latestSourceEventMs: null,
          latestObservedAtMs: null,
          latestFreshnessStatus: null,
          latestProjectionTarget: null,
          targetLanguage: null,
          existingObservationRef: null,
          existingReceiptRef: null,
          existingProjectionStatus: null,
          existingFreshnessStatus: null,
          existingTerminalAuthorityStatus: null,
          latestCancelRequested: null,
          laneVisible: null,
          laneRequested: null,
          laneExecuted: null,
          observationReentered: null,
          reentryRequired: null,
          reportSummaryText: null,
          terminalEligible: null,
          terminalAuthorityStatus: null,
          contextRole: null,
          answerAuthority: null,
          assistantAnswer: null,
          rawContentIncluded: null,
          clientReplayReason: null,
          providerNativeEventType: null,
          source_event_type: "tool_observation",
          event_source: "live",
        turn_id: "turn-1",
        reconstructed: true,
        stream_event: "turn_transcript_event",
      },
    });

    expect(
      buildAskLiveEventFromTurnTranscriptRecord(
        {
          text: "  ",
          ts: "2026-01-02T03:04:05.000Z",
        },
        "empty",
      ),
    ).toBeNull();
  });

  it("labels transcript row sources for live, native, and replayed stream rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-source-audit",
      content: "",
      debug: {
        turn_transcript_events: [
          {
            id: "live-provider",
            type: "model_decision",
            source_event_type: "model_reentry",
            event_source: "live",
            stream_event: "turn_transcript_event",
            text: "Codex is evaluating the observation.",
            status: "running",
          },
          {
            id: "native-tool",
            type: "tool_result",
            source_event_type: "codex_native_tool_result",
            event_source: "live",
            provider_native_event_type: "McpToolCallEnd",
            text: "Codex completed tool: docs.search.",
            status: "completed",
          },
          {
            id: "replay",
            type: "model_decision",
            source_event_type: "context_state",
            event_source: "live",
            client_replay_reason: "final_response_backfill",
            reconstructed: true,
            text: "Backfilled final transcript row.",
            status: "completed",
          },
        ],
      },
    });

    expect(rows.some((row) => row.meta.includes("source live_provider_transcript"))).toBe(true);
    expect(rows.some((row) => row.meta.includes("source codex_native_event:McpToolCallEnd"))).toBe(true);
    expect(rows.some((row) => row.meta.includes("source final_response_backfill"))).toBe(true);
  });

  it("does not present provider token deltas as numbered agent steps", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-native-delta-filter",
      content: "The governed final answer.",
      debug: {
        turn_transcript_events: [
          {
            id: "native-delta-1",
            type: "model_decision",
            source_event_type: "codex_native_agent_message_delta",
            event_source: "live",
            provider_native_event_type: "item/agentMessage/delta",
            text: "agent: target",
            status: "running",
          },
          {
            id: "native-completed-1",
            type: "model_decision",
            source_event_type: "codex_native_agent_message_completed",
            event_source: "live",
            provider_native_event_type: "item/agentMessage/completed",
            text: "Codex completed its public message.",
            status: "completed",
          },
          {
            id: "terminal-1",
            type: "final_answer",
            source_event_type: "terminal_answer",
            event_source: "live",
            text: "The governed final answer.",
            status: "completed",
          },
        ],
      },
    });

    expect(rows.some((row) => row.text.includes("agent: target"))).toBe(false);
    expect(rows.some((row) => row.text.includes("completed its public message"))).toBe(true);
    expect(rows.some((row) => row.text.includes("governed final answer"))).toBe(true);
  });

  it("does not clip terminal answer transcript events in the console stream", () => {
    const longFinal = `Final answer starts.\n${"agent-output ".repeat(80)}\nFinal answer ends.`;

    const event = buildAskLiveEventFromTurnTranscriptRecord(
      {
        id: "terminal-answer-1",
        text: longFinal,
        role: "assistant",
        type: "final_answer",
        source_event_type: "terminal_answer",
        status: "completed",
        turn_id: "turn-long-final",
      },
      "fallback",
      80,
    );

    expect(event?.text).toBe(longFinal);
    expect(event?.text).toContain("Final answer ends.");
    expect(event?.text).not.toContain("...");
  });

  it("preserves target language metadata when replaying transcript records", () => {
    const event = buildAskLiveEventFromTurnTranscriptRecord(
      {
        id: "goal-lane-target-language",
        text: "Goal-bound lane session: live_translation; target es.",
        role: "system",
        type: "observation",
        source_event_type: "lane_goal_binding",
        status: "pending",
        step_id: "lane_goal_binding",
        lane: "live_translation",
        source_id: "docs:target-language",
        source_hash: "fnv1a32:target-language",
        source_kind: "docs",
        source_projection_target: "docs_chunk",
        account_locale: "es-US",
        latest_projection_target: "docs_chunk",
        target_language: "es",
      },
      "fallback",
    );

    expect(event).toMatchObject({
      meta: expect.objectContaining({
        source_event_type: "lane_goal_binding",
        sourceId: "docs:target-language",
        sourceHash: "fnv1a32:target-language",
        sourceKind: "docs",
        sourceProjectionTarget: "docs_chunk",
        accountLocale: "es-US",
        latestProjectionTarget: "docs_chunk",
        targetLanguage: "es",
      }),
    });

    const rows = buildHelixTurnTranscriptRows({
      id: "reply-target-language-row",
      content: "",
      debug: {
        turn_transcript_events: [
          {
            type: "observation",
            source_event_type: "lane_goal_binding",
            status: "pending",
            text: "Goal-bound lane session: live_translation; target es.",
            lane: "live_translation",
            source_id: "docs:target-language",
            source_hash: "fnv1a32:target-language",
            source_kind: "docs",
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            latest_projection_target: "docs_chunk",
            target_language: null,
            latest_target_language: "es",
          },
        ],
      },
    });

    expect(rows[0]?.meta).toContain("source docs:target-language");
    expect(rows[0]?.meta).toContain("source kind docs");
    expect(rows[0]?.meta).toContain("source projection docs_chunk");
    expect(rows[0]?.meta).toContain("account locale es-US");
    expect(rows[0]?.meta).toContain("projection docs_chunk");
    expect(rows[0]?.meta).toContain("target es");
  });

  it("projects runtime transcript events into Ask live-event rows", () => {
    const events = buildHelixRuntimeAskLiveEvents({
      id: "reply-1",
      turn_id: "turn-1",
      debug: {
        agent_runtime_loop: {
          iterations: [
            {
              next_step: "tool",
              chosen_capability: "docs.search",
              decision_authority: "runtime",
              decision_id: "decision-1",
              observed_artifact_refs: ["doc_search_results:abc123"],
            },
          ],
        },
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        id: "reply-1-runtime-0-decision",
        text: "Selected docs.search.",
        tool: "agent",
        seq: 0,
        meta: expect.objectContaining({
          stage: "decision",
          detail: "docs.search",
          status: "completed",
          turnKey: "turn-1",
          stepId: "runtime_1",
          lane: "runtime",
          event_source: "agent_runtime_loop",
        }),
      }),
      expect.objectContaining({
        id: "reply-1-runtime-0-observation",
        text: "Observed doc_search_results.",
        tool: "tool",
        seq: 1,
        meta: expect.objectContaining({
          stage: "tool_result",
          detail: "docs.search",
          status: "completed",
          turnKey: "turn-1",
          stepId: "runtime_1",
          lane: "docs.search",
          event_source: "agent_runtime_loop",
        }),
      }),
    ]);
  });

  it("projects structured Codex workstation gateway calls without final-prose scraping", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-structured-gateway",
      turn_id: "turn-codex-structured-gateway",
      content: "Observed expression: 8*9\nResult: 72",
      debug: {
        turn_id: "turn-codex-structured-gateway",
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            source_event_type: "runtime_selected",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: no workstation observation packet was available for this Codex turn.",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "Observed expression: 8*9\nResult: 72",
            source_event_type: "terminal_answer",
          },
        ],
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "scientific-calculator.solve_expression",
            mode: "read",
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              admission_status: "admitted",
            },
            observation: {
              expression: "8*9",
              result: "72",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-structured-gateway",
              capability_key: "scientific-calculator.solve_expression",
              status: "succeeded",
              observation_summary: "8*9 = 72",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text}`).join("\n");
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(combined).toContain("Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).toContain("Observed expression: 8*9\nResult: 72");
    expect(combined).not.toContain("no workstation observation packet was available");
  });

  it("keeps current tool execution proof visible when many available lanes would exceed the transcript cap", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-environment-gateway-bounded",
      turn_id: "turn-codex-environment-gateway-bounded",
      content: "No immediate hazards were observed.",
      debug: {
        turn_id: "turn-codex-environment-gateway-bounded",
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "No immediate hazards were observed.",
            source_event_type: "terminal_answer",
          },
        ],
        model_visible_capability_lane_manifest: {
          schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          selected_runtime_agent_provider: "codex",
          lanes: Array.from({ length: 10 }, (_, index) => ({
            lane_id: `available_lane_${index}`,
            label: `Available lane ${index}`,
            status: "available",
            default_backend_provider: `available_lane_${index}.backend`,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
            capabilities: [
              {
                capability_id: `available_lane_${index}.read`,
                one_shot_status: "executable",
                session_status: "not_supported",
                terminal_eligible: false,
                assistant_answer: false,
              },
            ],
          })),
        },
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "com.casimirbot.minecraft.hazards.scan",
            mode: "act",
            gateway_admission: {
              requested_capability: "com.casimirbot.minecraft.hazards.scan",
              admission_status: "admitted",
            },
            observation: {
              outcome: "succeeded",
              result: { hazard_present: false },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-environment-gateway-bounded",
              capability_key: "com.casimirbot.minecraft.hazards.scan",
              status: "succeeded",
              observation_summary: "Hazard check read-only probe completed.",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text}`).join("\n");
    expect(rows.length).toBeLessThanOrEqual(14);
    expect(combined).toContain(
      "Action request: com.casimirbot.minecraft.hazards.scan.",
    );
    expect(combined).toContain(
      "Action observation: com.casimirbot.minecraft.hazards.scan observed Hazard check read-only probe completed.",
    );
    expect(combined).toContain(
      "Model re-entry: Codex received the workstation observation packet",
    );
    expect(combined).toContain("No immediate hazards were observed.");
    expect(rows.filter((row) => row.label === "Lane Visible").length).toBeLessThan(10);
  });

  it("projects structured Codex voice gateway receipts as non-terminal tool observations", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-voice-gateway",
      turn_id: "turn-codex-voice-gateway",
      content: "I requested the voice lane to say checking now.",
      debug: {
        turn_id: "turn-codex-voice-gateway",
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            source_event_type: "runtime_selected",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: no workstation observation packet was available for this Codex turn.",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "I requested the voice lane to say checking now.",
            source_event_type: "terminal_answer",
          },
        ],
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "live_env.request_interim_voice_callout",
            mode: "act",
            gateway_admission: {
              requested_capability: "live_env.request_interim_voice_callout",
              admission_status: "admitted",
            },
            observation: {
              schema: "helix.interim_voice_callout_tool_result.v1",
              post_tool_model_step_required: true,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
              request: {
                text: "checking now",
                assistant_answer: false,
                terminal_eligible: false,
                raw_content_included: false,
              },
              receipt: {
                status: "awaiting_client_playback",
                assistant_answer: false,
                terminal_eligible: false,
                raw_content_included: false,
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-voice-gateway",
              capability_key: "live_env.request_interim_voice_callout",
              status: "succeeded",
              observation_summary: "Voice callout request queued for host playback",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain("Action request: live_env.request_interim_voice_callout.");
    expect(combined).toContain(
      "Action observation: live_env.request_interim_voice_callout observed Voice callout request queued for host playback.",
    );
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).toContain("I requested the voice lane to say checking now.");
    expect(combined).not.toContain("no workstation observation packet was available");
    expect(rows.find((row) => row.label === "Action Observation")).toMatchObject({
      role: "tool",
      status: "completed",
    });
    expect(rows.find((row) => row.label === "Final")).toMatchObject({
      role: "assistant",
      status: "completed",
    });
  });

  it("does not promote a structured voice receipt into a final answer row", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-voice-receipt-only",
      turn_id: "turn-codex-voice-receipt-only",
      debug: {
        turn_id: "turn-codex-voice-receipt-only",
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "live_env.narrator_say",
            mode: "act",
            gateway_admission: {
              requested_capability: "live_env.narrator_say",
              admission_status: "admitted",
            },
            observation: {
              schema: "helix.interim_voice_callout_tool_result.v1",
              post_tool_model_step_required: true,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
              request: {
                text: "checking now",
                assistant_answer: false,
                terminal_eligible: false,
                raw_content_included: false,
              },
              receipt: {
                status: "awaiting_client_playback",
                assistant_answer: false,
                terminal_eligible: false,
                raw_content_included: false,
              },
              host_projection: {
                kind: "voice_playback_request",
                playback_status: "awaiting_client_playback",
                assistant_answer: false,
                terminal_eligible: false,
                raw_content_included: false,
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-voice-receipt-only",
              capability_key: "live_env.narrator_say",
              status: "succeeded",
              observation_summary: "Narrator voice playback request queued",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Action request: live_env.narrator_say.");
    expect(combined).toContain("Action observation: live_env.narrator_say observed Narrator voice playback request queued.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(rows.some((row) => row.label === "Final")).toBe(false);
    expect(rows.find((row) => row.label === "Action Observation")).toMatchObject({
      role: "tool",
      status: "completed",
    });
  });

  it("projects capability lane requests, backend selection, observations, re-entry, and terminal authority", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-translation",
      turn_id: "turn-codex-lane-translation",
      content: "The translation observation is available.",
      debug: {
        turn_id: "turn-codex-lane-translation",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            source_event_type: "runtime_selected",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "The translation observation is available.",
            source_event_type: "terminal_answer",
          },
        ],
        capability_lane_reentry_status: "observation_packet_required_for_provider_reentry",
        runtime_lane_request_loop: {
          status: "collector_and_translation_completed",
          visible_translation_collector_chain: {
            schema: "helix.runtime_lane_request_loop.visible_translation_collector_chain.v1",
            requested_collector_capability: "workstation.visible_text.collect_translation_targets",
            collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
            translation_capability: "live_translation.translate_text",
            collector_requested: true,
            translation_requested: true,
            collected_target_count: 1,
            collected_source_kinds: ["docs_viewer", "panel_text"],
            collected_projection_targets: ["docs_chunk", "account_language"],
            collected_panel_ids: ["docs-viewer", "workstation-notes"],
            collector_observation_ref: "ask:lane:collector:obs",
            collector_batch_ref: "ask:lane:collector:batch",
            first_collected_source_id: "docs:nhm2",
            first_collected_doc_path: "docs/research/nhm2.md",
            first_collected_chunk_id: "chunk-1",
            first_collected_source_event_id:
              "visible_translation_source_event:docs/research/nhm2.md:chunk:chunk-1:fnv1a32:source-text:es",
            first_collected_source_event_ms: 1782860000000,
            first_collected_observed_at_ms: 1782860000100,
            first_collected_source_hash: "fnv1a32:doc-hash",
            first_collected_source_text_hash: "fnv1a32:source-text",
            first_collected_source_text_char_count: 4096,
            first_collected_projection_target: "docs_chunk",
            first_collected_target_language: "es",
            first_collected_existing_observation_ref: "ask:lane:existing:obs",
            first_collected_existing_receipt_ref: "ask:lane:existing:receipt",
            first_collected_existing_projection_status: "projected",
            first_collected_existing_freshness_status: "fresh",
            first_collected_existing_terminal_authority_status: "not_terminal_authority",
            first_collected_existing_source_event_ms: 1782859999000,
            first_collected_existing_observed_at_ms: 1782859999100,
            reentry_required: true,
            translation_observation_ref: "ask:lane:translation:obs",
            translation_receipt_ref: "ask:lane:translation:obs:projection:receipt",
            translated_source_kinds: ["docs_viewer"],
            translated_projection_targets: ["docs_chunk"],
            projection_receipt_status: "stale",
          },
        },
        capability_lane_resolve_traces: [
          {
            schema: "helix.capability_lane_resolve_trace.v1",
            requested_lane: "live_translation",
            requested_backend_provider: "google_gemini",
            selected_backend_provider: "live_translation.local_runtime",
            requested_backend_configuration_status: "configured",
            requested_backend_availability_status: "dry_run",
            requested_backend_permission_status: "admitted",
            selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              owner: "helix",
              outcome: "requested_recorded_default_selected",
              reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
              requested_backend_provider: "google_gemini",
              requested_backend_provider_known: true,
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              selected_runtime_provider_remains_root: true,
              backend_provider_becomes_root_agent: false,
              dynamic_switching_executed: false,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            availability_status: "available",
            permission_status: "available",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
          },
        ],
        capability_lane_call_results: [
          {
            schema: "helix.live_translation.one_shot_result.v1",
            ok: true,
            capability: "live_translation.translate_text",
            lane_id: "live_translation",
            observation: {
              lane_session_id: "lane-session-translation",
              observation_ref: "ask:lane:translation:obs",
              source_id: "docs:nhm2",
              chunk_id: "chunk-1",
              projection_target: "docs_chunk",
            },
            lane_resolve_trace: {
              requested_lane: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              requested_backend_configuration_status: "configured",
              requested_backend_availability_status: "dry_run",
              requested_backend_permission_status: "admitted",
              selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
              backend_selection_decision: {
                schema: "helix.capability_lane.backend_selection_decision.v1",
                owner: "helix",
                outcome: "requested_recorded_default_selected",
                reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
                requested_backend_provider: "google_gemini",
                requested_backend_provider_known: true,
                selected_backend_provider: "live_translation.local_runtime",
                fallback_backend_provider: "live_translation.local_runtime",
                selected_runtime_provider_remains_root: true,
                backend_provider_becomes_root_agent: false,
                dynamic_switching_executed: false,
                live_backend_execution_enabled: false,
                terminal_authority_owner: "helix",
                terminal_eligible: false,
                assistant_answer: false,
                raw_content_included: false,
              },
              availability_status: "available",
              permission_status: "available",
              cost_class: "free_local",
              latency_class: "interactive",
              privacy_class: "local_only",
              fallback_backend_provider: null,
            },
            observation_ref: "ask:lane:translation:obs",
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-lane-translation",
              capability_key: "live_translation.translate_text",
              lane_id: "live_translation",
              status: "succeeded",
              observation_summary: "Translation observation ready for en -> es",
              observation_ref: "ask:lane:translation:obs",
              state_delta: {
                live_translation_chunk: {
                  lane_session_id: "lane-session-translation",
                  source_id: "docs:nhm2",
                  chunk_id: "chunk-1",
                  chunk_index: 1,
                  dedupe_key: "docs:nhm2:chunk-1:es",
                  source_event_ms: null,
                  observed_at_ms: 1782860000000,
                  freshness_status: "fresh",
                  projection_target: "docs_chunk",
                  cancel_requested: false,
                  observation_ref: "ask:lane:translation:obs",
                  terminal_eligible: false,
                  assistant_answer: false,
                  raw_content_included: false,
                },
              },
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
        capability_lane_projection_receipts: [
          {
            schema: "helix.capability_lane.provider_adapter_receipt.v1",
            receipt_ref: "ask:lane:translation:obs:projection:receipt",
            kind: "live_translation_projection",
            status: "stale",
            turn_id: "turn-codex-lane-translation",
            lane_id: "live_translation",
            capability_key: "live_translation.translate_text",
            observation_ref: "ask:lane:translation:obs",
            payload: {
              projection_target: "docs_chunk",
              projection_status: "stale",
              target_language: "es",
            },
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
            reentry_required: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "ask:lane:translation:account-language:pending:receipt",
            observation_ref: "ask:lane:translation:account-language:pending:obs",
            projection_key: "account-language:docs-viewer:title:es",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            lane_session_id: "lane-session-account-language",
            selected_backend_provider: "live_translation.local_runtime",
            projection_target: "account_language",
            projection_status: "projected",
            source_id: "workstation-shell#docs-viewer:title",
            panel_id: "docs-viewer",
            region_id: "docs-viewer:title",
            doc_path: "docs/research/nhm2.md",
            source_hash: "fnv1a32:title",
            source_kind: "panel_text",
            account_locale: "es-US",
            chunk_id: "docs-viewer:title",
            chunk_index: 0,
            dedupe_key: "workstation-shell#docs-viewer:title:es",
            observed_at_ms: 1782860000100,
            freshness_status: "fresh",
            target_language: "es",
            translated_text: null,
            session_debug_phase: "running:translate_visible_region",
            session_observation_status: "pending_backend_observation",
            terminal_authority_status: "pending_helix_terminal_authority",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
            reentry_required: true,
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain(
      "Visible Collector: Visible translation collector: workstation.visible_text.collect_translation_targets requested; workstation_tool_reference.collect_visible_translation_targets executed collected source targets before live_translation.translate_text.",
    );
    expect(combined).toContain("1 target");
    expect(combined).toContain("collected source kinds docs_viewer, panel_text");
    expect(combined).toContain("collected projections docs_chunk, account_language");
    expect(combined).toContain("panels docs-viewer, workstation-notes");
    expect(combined).toContain("translated source kinds docs_viewer");
    expect(combined).toContain("translated projections docs_chunk");
    expect(combined).toContain("doc docs/research/nhm2.md");
    expect(combined).toContain("source docs:nhm2");
    expect(combined).toContain("source hash fnv1a32:doc-hash");
    expect(combined).toContain("source payload hash fnv1a32:source-text");
    expect(combined).toContain("source payload chars 4096");
    expect(combined).toContain(
      "source event visible_translation_source_event:docs/research/nhm2.md:chunk:chunk-1:fnv1a32:source-text:es",
    );
    expect(combined).toContain("source event ms 1782860000000");
    expect(combined).toContain("observed 1782860000100");
    expect(combined).toContain("existing observation ask:lane:existing:obs");
    expect(combined).toContain("existing receipt ask:lane:existing:receipt");
    expect(combined).toContain("existing projection projected");
    expect(combined).toContain("existing freshness fresh");
    expect(combined).toContain("existing terminal authority not_terminal_authority");
    expect(combined).toContain("existing source event ms 1782859999000");
    expect(combined).toContain("existing observed 1782859999100");
    expect(combined).toContain("re-entry required true");
    expect(combined).toContain("answer authority false");
    expect(combined).toContain("collector observation ask:lane:collector:obs");
    expect(combined).toContain("batch ask:lane:collector:batch");
    expect(combined).toContain("projection receipt stale");
    expect(combined).toContain("Collector output remains observation-only.");
    expect(combined).toContain("Lane Request: Lane requested: live_translation.translate_text.");
    expect(combined).toContain("Lane Backend: Lane backend selected: selected live_translation.local_runtime");
    expect(combined).toContain("requested google_gemini");
    expect(combined).toContain("requested configuration configured");
    expect(combined).toContain("requested availability dry_run");
    expect(combined).toContain("requested permission admitted");
    expect(combined).toContain("reason requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy");
    expect(combined).toContain("decision requested_recorded_default_selected");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("cost free_local");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy local_only");
    expect(combined).toContain(
      "Lane Observation: Lane observation: live_translation.translate_text session lane-session-translation produced Translation observation ready for en -> es.",
    );
    expect(combined).toContain(
      "Lane Receipt: Lane projection receipt: live_translation.translate_text; projection stale; target docs_chunk; language es; re-entry required true; observation ask:lane:translation:obs; receipt ask:lane:translation:obs:projection:receipt; remains observation-only.",
    );
    expect(combined).toContain(
      "UI Projection: UI translation projection: status stale; target docs_chunk; language es; source unknown_source; chunk ask:lane:translation:obs; freshness unknown; stale; terminal authority not_terminal_authority; observation ask:lane:translation:obs; receipt ask:lane:translation:obs:projection:receipt; projection-only, not terminal authority.",
    );
    expect(combined).toContain(
      "UI Projection: UI translation projection: status projected; account-language health pending; target account_language; language es; source workstation-shell#docs-viewer:title",
    );
    expect(combined).toContain("session phase running:translate_visible_region");
    expect(combined).toContain("observation status pending_backend_observation");
    expect(combined).toContain("terminal authority pending_helix_terminal_authority");
    expect(combined).toContain("receipt ask:lane:translation:account-language:pending:receipt; projection-only, not terminal authority.");
    expect(combined).toContain("Lane Re-entry: Lane re-entry: observation packet available for provider reasoning before terminal selection.");
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: The translation observation is available.");
    expect(combined).not.toContain("source text");
    expect(rows.find((row) => row.label === "Visible Collector")?.text).toContain(
      "existing source event ms 1782859999000",
    );
    expect(rows.find((row) => row.label === "Visible Collector")?.text).toContain(
      "existing observed 1782859999100",
    );
  });

  it("keeps text-to-speech projection receipts out of live-translation UI projection rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-tts-receipt",
      turn_id: "turn-codex-tts-receipt",
      content: "Playback was blocked.",
      debug: {
        turn_id: "turn-codex-tts-receipt",
        capability_lane_projection_receipts: [
          {
            schema: "helix.capability_lane.provider_adapter_receipt.v1",
            receipt_ref: "ask:lane:tts:obs:receipt",
            kind: "text_to_speech_playback",
            status: "blocked",
            turn_id: "turn-codex-tts-receipt",
            lane_id: "text_to_speech",
            capability_key: "text_to_speech.speak_text",
            observation_ref: "ask:lane:tts:obs",
            payload: {
              schema: "helix.text_to_speech.receipt.v1",
              lane_id: "text_to_speech",
              capability: "text_to_speech.speak_text",
              playback_status: "blocked",
              provider_playback_status: "queued_for_retry",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const laneReceiptRows = rows.filter((row) => row.label === "Lane Receipt");
    const uiProjectionRows = rows.filter((row) => row.label === "UI Projection");
    expect(laneReceiptRows.some((row) => row.text.includes("text_to_speech.speak_text"))).toBe(true);
    expect(uiProjectionRows.some((row) => row.text.includes("text_to_speech.speak_text"))).toBe(false);
    expect(uiProjectionRows.some((row) => row.text.includes("UI translation projection"))).toBe(false);
  });

  it("projects capability lane terminal authority rejection after observation re-entry", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-terminal-rejected",
      turn_id: "turn-codex-lane-terminal-rejected",
      content: "I could not complete that turn.\nCause: terminal_authority_missing.",
      debug: {
        turn_id: "turn-codex-lane-terminal-rejected",
        agent_runtime: "codex",
        terminal_error_code: "terminal_authority_missing",
        terminal_authority_status: "terminal_authority_missing",
        capability_lane_call_results: [
          {
            schema: "helix.live_translation.one_shot_result.v1",
            ok: true,
            capability: "live_translation.translate_text",
            lane_id: "live_translation",
            observation_ref: "ask:lane:translation:obs:rejected",
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-lane-terminal-rejected",
              capability_key: "live_translation.translate_text",
              lane_id: "live_translation",
              status: "succeeded",
              observation_summary: "Translation observation ready for en -> es",
              observation_ref: "ask:lane:translation:obs:rejected",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Request: Lane requested: live_translation.translate_text.");
    expect(combined).toContain("Lane Observation: Lane observation: live_translation.translate_text produced Translation observation ready for en -> es.");
    expect(combined).toContain("Lane Re-entry: Lane re-entry: observation packet available for provider reasoning before terminal selection.");
    expect(combined).toContain("Terminal: Terminal rejected: terminal_authority_missing.");
    expect(combined).toContain("source capability_lane_call_results");
    expect(combined).toContain("terminal_rejected");
    expect(combined).not.toContain("Terminal: Terminal selected:");
  });

  it("projects lane projection receipts into live-event metadata without answer authority", () => {
    const events = buildHelixRuntimeAskLiveEvents({
      id: "reply-codex-lane-receipt-live-event",
      turn_id: "turn-codex-lane-receipt-live-event",
      debug: {
        turn_id: "turn-codex-lane-receipt-live-event",
        agent_runtime: "codex",
        capability_lane_projection_receipts: [
          {
            schema: "helix.capability_lane.provider_adapter_receipt.v1",
            receipt_ref: "ask:lane:translation:live-event:projection:receipt",
            status: "projected",
            lane_id: "live_translation",
            capability_key: "live_translation.translate_text",
            observation_ref: "ask:lane:translation:live-event",
            payload: {
              projection_target: "docs_hover",
              projection_status: "projected",
              projection_key:
                "document_markdown:docs/example.md::fnv1a32:example-source::docs_hover::es-US::u0001::ask:lane:translation:live-event:projection:receipt",
              source_id: "document_markdown:docs/example.md",
              source_hash: "fnv1a32:example",
              source_kind: "docs",
              source_text_hash: "fnv1a32:example-source",
              source_text_char_count: 42,
              account_locale: "es-US",
              chunk_id: "u0001",
              chunk_index: 1,
              dedupe_key: "document_markdown:docs/example.md:u0001:es",
              source_event_id: "docs:event:1",
              source_event_ms: 100,
              observed_at_ms: 120,
              freshness_status: "fresh",
              target_language: "es",
              translated_text: "hola",
            },
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
            reentry_required: true,
          },
        ],
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ask:lane:translation:live-event:projection:receipt",
        tool: "tool",
        text: expect.stringContaining("remains observation-only"),
        meta: expect.objectContaining({
          stage: "observation",
          detail: "ask:lane:translation:live-event:projection:receipt",
          status: "completed",
          stepId: "lane_projection_receipt",
          lane: "live_translation",
          capabilityId: "live_translation.translate_text",
          receiptRef: "ask:lane:translation:live-event:projection:receipt",
          observationRef: "ask:lane:translation:live-event",
          sourceId: "document_markdown:docs/example.md",
          sourceHash: "fnv1a32:example",
          sourceKind: "docs",
          sourceTextHash: "fnv1a32:example-source",
          sourceTextCharCount: "42",
          projectionKey:
            "document_markdown:docs/example.md::fnv1a32:example-source::docs_hover::es-US::u0001::ask:lane:translation:live-event:projection:receipt",
          accountLocale: "es-US",
          latestChunkId: "u0001",
          latestChunkIndex: "1",
          latestSourceEventId: "docs:event:1",
          latestSourceEventMs: "100",
          latestObservedAtMs: "120",
          latestFreshnessStatus: "fresh",
          latestProjectionTarget: "docs_hover",
          targetLanguage: "es",
          terminalAuthorityStatus: "pending_helix_terminal_authority",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
          source_event_type: "lane_projection_receipt",
          event_source: "capability_lane_projection_receipts",
        }),
      }),
      expect.objectContaining({
        id: "ask:lane:translation:live-event:projection:receipt",
        tool: "tool",
        text: expect.stringContaining("projection-only, not terminal authority"),
        meta: expect.objectContaining({
          stage: "observation",
          status: "completed",
          stepId: "ui_translation_projection",
          lane: "live_translation",
          capabilityId: "live_translation.translate_text",
          receiptRef: "ask:lane:translation:live-event:projection:receipt",
          observationRef: "ask:lane:translation:live-event",
          sourceId: "document_markdown:docs/example.md",
          sourceHash: "fnv1a32:example",
          sourceKind: "docs",
          sourceTextHash: "fnv1a32:example-source",
          sourceTextCharCount: "42",
          projectionKey:
            "document_markdown:docs/example.md::fnv1a32:example-source::docs_hover::es-US::u0001::ask:lane:translation:live-event:projection:receipt",
          accountLocale: "es-US",
          latestChunkId: "u0001",
          latestChunkIndex: "1",
          latestDedupeKey: "document_markdown:docs/example.md:u0001:es",
          latestSourceEventId: "docs:event:1",
          latestSourceEventMs: "100",
          latestObservedAtMs: "120",
          latestFreshnessStatus: "fresh",
          latestProjectionTarget: "docs_hover",
          targetLanguage: "es",
          translatedText: "hola",
          projectionStatus: "projected",
          terminalAuthorityStatus: "pending_helix_terminal_authority",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
          source_event_type: "ui_translation_projection",
          event_source: "capability_lane_projection_receipts",
        }),
      }),
    ]));
  });

  it("replaces direct lane projection receipt transcript rows with reconstructed receipt rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-receipt-dedupe",
      turn_id: "turn-codex-lane-receipt-dedupe",
      content: "Receipt projection is visible once.",
      debug: {
        turn_id: "turn-codex-lane-receipt-dedupe",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        turn_transcript_events: [
          {
            role: "tool",
            type: "observation",
            status: "completed",
            text: "stale direct receipt row",
            source_event_type: "lane_projection_receipt",
            event_source: "turn_transcript_events",
            receipt_ref: "ask:lane:translation:dedupe:projection:receipt",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "Receipt projection is visible once.",
            source_event_type: "terminal_answer",
          },
        ],
        capability_lane_projection_receipts: [
          {
            schema: "helix.capability_lane.provider_adapter_receipt.v1",
            receipt_ref: "ask:lane:translation:dedupe:projection:receipt",
            status: "projected",
            lane_id: "live_translation",
            capability_key: "live_translation.translate_text",
            observation_ref: "ask:lane:translation:dedupe",
            payload: {
              projection_target: "docs_selection",
              projection_status: "projected",
              target_language: "de",
            },
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const receiptRows = rows.filter((row) => row.label === "Lane Receipt");
    expect(receiptRows).toHaveLength(1);
    expect(receiptRows[0]?.text).toContain("live_translation.translate_text");
    expect(receiptRows[0]?.text).toContain("target docs_selection");
    expect(receiptRows[0]?.text).toContain("receipt ask:lane:translation:dedupe:projection:receipt");
    expect(receiptRows[0]?.meta).toContain("capability live_translation.translate_text");
    expect(receiptRows[0]?.meta).toContain("observation ask:lane:translation:dedupe");
    expect(receiptRows[0]?.meta).toContain("receipt ask:lane:translation:dedupe:projection:receipt");
    expect(receiptRows[0]?.meta).toContain("terminal authority pending_helix_terminal_authority");
    expect(rows.find((row) => row.label === "UI Projection")).toMatchObject({
      role: "tool",
      status: "completed",
      text: expect.stringContaining("target docs_selection"),
      meta: expect.stringContaining("terminal authority pending_helix_terminal_authority"),
    });
    expect(rows.map((row) => row.text).join("\n")).not.toContain("stale direct receipt row");
  });

  it("surfaces runtime goal id, status, provider, and debug availability in the runtime turn summary", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-runtime-goal",
      turn_id: "turn-runtime-goal",
      final_answer_source: "runtime_goal_command",
      terminal_artifact_kind: "runtime_goal_command_result",
      runtime_goal_command: {
        command: "wake",
        goal_id: "goal:test-runtime",
      },
      runtime_goal_session: {
        goal_id: "goal:test-runtime",
        status: "waiting",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime-session:test-runtime",
        latest_observation_refs: ["obs:docs-viewer.read_visible_surface:test"],
        latest_receipt_refs: ["receipt:docs-viewer.read_visible_surface:test"],
        terminal_authority_status: "authorized",
      },
      runtime_goal_debug_export: {
        goal_id: "goal:test-runtime",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime-session:test-runtime",
        wake_event_kind: "manual_resume",
        terminal_authority_status: "authorized",
      },
      debug_export: {
        debug_export_ref: "debug:goal:test-runtime",
      },
    });

    const row = summary?.rows.find((entry) => entry.key === "runtime_goal_session");
    expect(row).toMatchObject({
      label: "Runtime goal",
      value: expect.stringContaining("goal goal:test-runtime"),
    });
    expect(row?.value).toContain("status waiting");
    expect(row?.value).toContain("runtime codex");
    expect(row?.value).toContain("command wake");
    expect(row?.value).toContain("observation obs:docs-viewer.read_visible_surface:test");
    expect(row?.value).toContain("terminal authority authorized");
    expect(row?.value).toContain("debug export available");
    expect(summary?.rows.find((entry) => entry.key === "debug_export")).toMatchObject({
      label: "Debug export",
      value: "debug:goal:test-runtime",
    });
  });

  it("summarizes session-bound live translation chunks in the runtime turn summary", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-codex-lane-summary-session",
      turn_id: "turn-codex-lane-summary-session",
      debug: {
        turn_id: "turn-codex-lane-summary-session",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_resolve_trace: {
          requested_lane: "live_translation",
          requested_backend_provider: "google_gemini",
          selected_backend_provider: "live_translation.local_runtime",
          requested_backend_configuration_status: "configured",
          requested_backend_availability_status: "dry_run",
          requested_backend_permission_status: "admitted",
          selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
          backend_selection_decision: {
            schema: "helix.capability_lane.backend_selection_decision.v1",
            owner: "helix",
            outcome: "requested_recorded_default_selected",
            reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            requested_backend_provider: "google_gemini",
            requested_backend_provider_known: true,
            selected_backend_provider: "live_translation.local_runtime",
            fallback_backend_provider: "live_translation.local_runtime",
            selected_runtime_provider_remains_root: true,
            backend_provider_becomes_root_agent: false,
            dynamic_switching_executed: false,
            live_backend_execution_enabled: false,
            terminal_authority_owner: "helix",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          availability_status: "dry_run",
          permission_status: "admitted",
        },
        capability_lane_call_results: [
          {
            schema: "helix.live_translation.one_shot_result.v1",
            ok: true,
            capability: "live_translation.translate_text",
            lane_id: "live_translation",
            translated_text: "hola",
            lane_resolve_trace: {
              requested_lane: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              requested_backend_configuration_status: "configured",
              requested_backend_availability_status: "dry_run",
              requested_backend_permission_status: "admitted",
              selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
              backend_selection_decision: {
                schema: "helix.capability_lane.backend_selection_decision.v1",
                owner: "helix",
                outcome: "requested_recorded_default_selected",
                reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
                requested_backend_provider: "google_gemini",
                requested_backend_provider_known: true,
                selected_backend_provider: "live_translation.local_runtime",
                fallback_backend_provider: "live_translation.local_runtime",
                selected_runtime_provider_remains_root: true,
                backend_provider_becomes_root_agent: false,
                dynamic_switching_executed: false,
                live_backend_execution_enabled: false,
                terminal_authority_owner: "helix",
                terminal_eligible: false,
                assistant_answer: false,
                raw_content_included: false,
              },
              availability_status: "dry_run",
              permission_status: "admitted",
            },
            observation: {
              lane_session_id: "lane-session-summary",
              observation_ref: "ask:lane:translation:summary-obs",
              source_id: "docs:nhm2",
              source_hash: "fnv1a32:summary-doc",
              source_text_hash: "fnv1a32:summary-source-text",
              source_text_char_count: 32,
              chunk_id: "chunk-9",
              target_language: "es",
              freshness_status: "fresh",
              projection_target: "docs_chunk",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-lane-summary-session",
              capability_key: "live_translation.translate_text",
              status: "succeeded",
              state_delta: {
                live_translation_chunk: {
                  lane_session_id: "lane-session-summary",
                  source_id: "docs:nhm2",
                  source_hash: "fnv1a32:summary-doc",
                  source_text_hash: "fnv1a32:summary-source-text",
                  source_text_char_count: 32,
                  chunk_id: "chunk-9",
                  chunk_index: 9,
                  dedupe_key: "docs:nhm2:chunk-9:es",
                  source_event_id: "docs:nhm2:event-9",
                  source_event_ms: null,
                  observed_at_ms: 1782860000000,
                  freshness_status: "fresh",
                  projection_target: "docs_chunk",
                  cancel_requested: false,
                  observation_ref: "ask:lane:translation:summary-obs",
                  terminal_eligible: false,
                  assistant_answer: false,
                  raw_content_included: false,
                },
                live_translation_projection_receipt: {
                  schema: "helix.live_translation.projection_receipt.v1",
                  receipt_ref: "ask:lane:translation:summary-obs:projection:receipt",
                  observation_ref: "ask:lane:translation:summary-obs",
                  lane_id: "live_translation",
                  capability: "live_translation.translate_text",
                  projection_target: "docs_chunk",
                  projection_status: "projected",
                  source_id: "docs:nhm2",
                  source_hash: "fnv1a32:summary-doc",
                  source_text_hash: "fnv1a32:summary-source-text",
                  source_text_char_count: 32,
                  chunk_id: "chunk-9",
                  chunk_index: 9,
                  dedupe_key: "docs:nhm2:chunk-9:es",
                  source_event_id: "docs:nhm2:event-9",
                  source_event_ms: null,
                  observed_at_ms: 1782860000000,
                  freshness_status: "fresh",
                  target_language: "es",
                  translated_text: "hola",
                  stale: false,
                  cancel_requested: false,
                  reentry_required: true,
                  terminal_eligible: false,
                  assistant_answer: false,
                  raw_content_included: false,
                },
              },
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
      },
    });

    const projection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(projection).toContain("live_translation");
    expect(projection).toContain("projection projected");
    expect(projection).toContain("session lane-session-summary");
    expect(projection).toContain("source docs:nhm2");
    expect(projection).toContain("source hash fnv1a32:summary-doc");
    expect(projection).toContain("source payload hash fnv1a32:summary-source-text");
    expect(projection).toContain("source payload chars 32");
    expect(projection).toContain("chunk chunk-9");
    expect(projection).toContain("index 9");
    expect(projection).toContain("dedupe docs:nhm2:chunk-9:es");
    expect(projection).toContain("source event id docs:nhm2:event-9");
    expect(projection).toContain("observed 1782860000000");
    expect(projection).toContain("receipt ask:lane:translation:summary-obs:projection:receipt");
    expect(projection).toContain("ref ask:lane:translation:summary-obs");
    const backend = summary?.rows.find((row) => row.key === "lane_backend")?.value ?? "";
    expect(backend).toContain("lane live_translation");
    expect(backend).toContain("backend live_translation.local_runtime");
    expect(backend).toContain("requested configuration configured");
    expect(backend).toContain("requested availability dry_run");
    expect(backend).toContain("requested permission admitted");
    expect(backend).toContain("decision requested_recorded_default_selected");
    expect(backend).toContain("runtime root preserved");
    expect(backend).toContain("no live backend execution");
    expect(backend).toContain("terminal authority helix");
  });

  it("summarizes explicit lane projection receipts without call results", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-codex-lane-receipt-summary",
      turn_id: "turn-codex-lane-receipt-summary",
      debug: {
        turn_id: "turn-codex-lane-receipt-summary",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_projection_receipts: [
          {
            schema: "helix.capability_lane.provider_adapter_receipt.v1",
            receipt_ref: "ask:lane:translation:receipt-only:projection:receipt",
            status: "projected",
            lane_id: "live_translation",
            capability_key: "live_translation.translate_text",
            observation_ref: "ask:lane:translation:receipt-only",
            payload: {
              projection_target: "docs_hover",
              projection_status: "projected",
              projection_key:
                "docs:hover::fnv1a32:hover-source::docs_hover::fr-CA::hover-1::ask:lane:translation:receipt-only:projection:receipt",
              source_id: "docs:hover",
              doc_path: "docs/research/hover-source.md",
              bbox: { x: 20, y: 40, width: 180, height: 36, source: "hover-region" },
              source_hash: "fnv1a32:hover",
              source_kind: "docs",
              source_text_hash: "fnv1a32:hover-source",
              source_text_char_count: 18,
              account_locale: "fr-CA",
              chunk_id: "hover-1",
              chunk_index: 0,
              source_event_ms: 100,
              observed_at_ms: 125,
              freshness_status: "fresh",
              target_language: "fr",
              translated_text: "bonjour",
            },
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
            reentry_required: true,
          },
        ],
      },
    });

    const projection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(projection).toContain("live_translation.translate_text");
    expect(projection).toContain("projection projected");
    expect(projection).toContain(
      "projection key docs:hover::fnv1a32:hover-source::docs_hover::fr-CA::hover-1::ask:lane:translation:receipt-only:projection:receipt",
    );
    expect(projection).toContain("target docs_hover");
    expect(projection).toContain("source docs:hover");
    expect(projection).toContain("doc path docs/research/hover-source.md");
    expect(projection).toContain('bbox {"x":20,"y":40,"width":180,"height":36,"source":"hover-region"}');
    expect(projection).toContain("source hash fnv1a32:hover");
    expect(projection).toContain("source kind docs");
    expect(projection).toContain("source payload hash fnv1a32:hover-source");
    expect(projection).toContain("source payload chars 18");
    expect(projection).toContain("account locale fr-CA");
    expect(projection).toContain("language fr");
    expect(projection).toContain("chunk hover-1");
    expect(projection).toContain("chunk index 0");
    expect(projection).toContain("source event ms 100");
    expect(projection).toContain("observed 125");
    expect(projection).toContain("freshness fresh");
    expect(projection).toContain("re-entry required true");
    expect(projection).toContain("receipt ask:lane:translation:receipt-only:projection:receipt");
    expect(projection).toContain("ref ask:lane:translation:receipt-only");
    expect(projection).toContain("observation-only");
    const traffic = summary?.rows.find((row) => row.key === "translation_traffic")?.value ?? "";
    expect(traffic).toContain("docs:hover");
    expect(traffic).toContain("latest doc path docs/research/hover-source.md");
    expect(traffic).toContain('latest bbox {"x":20,"y":40,"width":180,"height":36,"source":"hover-region"}');
    expect(traffic).toContain("source hash fnv1a32:hover");
    expect(traffic).toContain("source kind docs");
    expect(traffic).toContain("latest source payload hash fnv1a32:hover-source");
    expect(traffic).toContain("latest source payload chars 18");
    expect(traffic).toContain("account locale fr-CA");
    expect(traffic).toContain("target docs_hover");
    expect(traffic).toContain("language fr");
    expect(traffic).toContain("chunks 1");
    expect(traffic).toContain("projected 1");
    expect(traffic).toContain("latest chunk hover-1");
    expect(traffic).toContain("latest index 0");
    expect(traffic).toContain("freshness fresh");
    expect(traffic).toContain("observation ask:lane:translation:receipt-only");
    expect(traffic).toContain("receipt ask:lane:translation:receipt-only:projection:receipt");
    expect(traffic).toContain("observation-only");
  });

  it("summarizes lane backend provider configuration without exposing secrets", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-codex-lane-provider-config",
      turn_id: "turn-codex-lane-provider-config",
      debug: {
        turn_id: "turn-codex-lane-provider-config",
        agent_runtime: "codex",
        capability_lane_manifest: {
          schema: "helix.capability_lane_manifest.v1",
          selected_runtime_agent_provider: "codex",
          policy_mode: "shadow",
          lanes: [
            {
              schema: "helix.capability_lane.descriptor.v1",
              lane_id: "live_translation",
              status: "dry_run",
              backend_family: "local_runtime",
              backend_providers: [
                {
                  schema: "helix.capability_lane.backend_provider.v1",
                  provider_id: "live_translation.local_runtime",
                  configuration_status: "not_required",
                  availability_status: "dry_run",
                  permission_status: "admitted",
                  latency_class: "interactive",
                  privacy_class: "local_only",
                  configured_env_vars: [],
                  fallback_backend_provider: null,
                  raw_secret_exposed: false,
                },
                {
                  schema: "helix.capability_lane.backend_provider.v1",
                  provider_id: "live_translation.google_gemini",
                  configuration_status: "configured",
                  availability_status: "dry_run",
                  permission_status: "admitted",
                  latency_class: "realtime",
                  privacy_class: "external_provider",
                  configured_env_vars: ["GOOGLE_GEMINI_API_KEY"],
                  fallback_backend_provider: "live_translation.local_runtime",
                  raw_secret_exposed: false,
                  debug_secret_probe: "secret-gemini-key",
                },
                {
                  schema: "helix.capability_lane.backend_provider.v1",
                  provider_id: "live_translation.openai_compatible",
                  configuration_status: "missing",
                  availability_status: "unconfigured",
                  permission_status: "configuration_missing",
                  latency_class: "interactive",
                  privacy_class: "account_provider",
                  configured_env_vars: [],
                  fallback_backend_provider: "live_translation.local_runtime",
                  raw_secret_exposed: false,
                },
              ],
            },
          ],
        },
      },
    });

    const providers = summary?.rows.find((row) => row.key === "lane_backend_providers")?.value ?? "";
    expect(providers).toContain("live_translation/live_translation.local_runtime");
    expect(providers).toContain("config not_required");
    expect(providers).toContain("live_translation/live_translation.google_gemini");
    expect(providers).toContain("config configured");
    expect(providers).toContain("availability dry_run");
    expect(providers).toContain("permission admitted");
    expect(providers).toContain("latency realtime");
    expect(providers).toContain("privacy external_provider");
    expect(providers).toContain("fallback live_translation.local_runtime");
    expect(providers).toContain("configured env GOOGLE_GEMINI_API_KEY");
    expect(providers).toContain("live_translation/live_translation.openai_compatible");
    expect(providers).toContain("config missing");
    expect(providers).toContain("availability unconfigured");
    expect(providers).toContain("permission configuration_missing");
    expect(providers).toContain("no raw secrets");
    expect(providers).not.toContain("secret-gemini-key");
  });

  it("projects visible capability lanes separately from executed lane calls", () => {
    const reply = {
      id: "reply-codex-visible-lanes-only",
      turn_id: "turn-codex-visible-lanes-only",
      debug: {
        turn_id: "turn-codex-visible-lanes-only",
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            id: "stale-visible-lane-row",
            role: "system",
            type: "observation",
            status: "completed",
            text: "stale visible lane row",
            source_event_type: "lane_visible",
          },
          {
            id: "stale-ui-projection-row",
            role: "tool",
            type: "observation",
            status: "completed",
            text: "stale ui projection row",
            source_event_type: "ui_translation_projection",
          },
        ],
        model_visible_capability_lane_manifest: {
          schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          selected_runtime_agent_provider: "codex",
          lanes: [
            {
              lane_id: "live_translation",
              label: "Live translation",
              status: "dry_run",
              default_backend_provider: "live_translation.local_runtime",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
              capabilities: [
                {
                  capability_id: "live_translation.translate_text",
                  one_shot_status: "executable",
                  session_status: "supported",
                  terminal_eligible: false,
                  assistant_answer: false,
                },
              ],
            },
            {
              lane_id: "utility_text",
              label: "Utility text",
              status: "available",
              default_backend_provider: "utility_text.local_runtime",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
              capabilities: [
                {
                  capability_id: "utility_text.normalize_text",
                  one_shot_status: "executable",
                  session_status: "not_supported",
                  terminal_eligible: false,
                  assistant_answer: false,
                },
              ],
            },
          ],
        },
      },
    };
    const rows = buildHelixTurnTranscriptRows(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Visible: Lane visible: live_translation");
    expect(combined).toContain("capabilities live_translation.translate_text one-shot executable session supported");
    expect(combined).toContain("visible does not mean executed");
    expect(combined).toContain("Lane Visible: Lane visible: utility_text");
    expect(combined).not.toContain("Lane Request: Lane requested");
    expect(combined).not.toContain("Lane Observation: Lane observation");
    expect(combined).not.toContain("stale visible lane row");
    expect(combined).not.toContain("stale ui projection row");

    const summary = buildHelixAskRuntimeTurnSummary(reply);
    const visibleLanes = summary?.rows.find((row) => row.key === "visible_lanes")?.value ?? "";
    const laneProjection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(visibleLanes).toContain("live_translation");
    expect(visibleLanes).toContain("status dry_run");
    expect(visibleLanes).toContain("default backend live_translation.local_runtime");
    expect(visibleLanes).toContain("capability live_translation.translate_text one-shot executable session supported");
    expect(visibleLanes).toContain("utility_text");
    expect(visibleLanes).toContain("visible does not mean executed");
    expect(laneProjection).toBe("");
  });

  it("summarizes goal dispatch readiness in the runtime turn summary without executing side effects", () => {
    const reply = {
      id: "reply-codex-goal-readiness-summary",
      turn_id: "turn-codex-goal-readiness-summary",
      debug: {
        turn_id: "turn-codex-goal-readiness-summary",
        agent_runtime: "codex",
        capability_lane_goal_dispatch_readiness: {
          schema: "helix.capability_lane.goal_dispatch_readiness.v1",
          total_plans: 2,
          total_admissions: 2,
          admitted_count: 1,
          blocked_count: 1,
          pending_wake_count: 1,
          pending_terminal_authority_count: 0,
          live_mail_loop_required_count: 1,
          terminal_authority_required_count: 0,
          any_live_mail_loop_required: true,
          any_terminal_authority_required: false,
          projection_only_count: 0,
          manual_review_count: 0,
          debug_only_count: 0,
          blocked_reasons: ["missing_mail_loop_ref"],
          next_dispatch_targets: ["ask_wake"],
          next_goal_binding_ids: ["goal-binding-ready"],
          next_source_ids: ["docs:ready"],
          next_source_binding_keys: ["docs:ready::sha256:ready::docs_chunk::es-US::es"],
          next_source_identity_keys: [
            "docs:ready::sha256:ready::sha256:ready-text::2048::docs::docs_chunk::es-US::es",
          ],
          next_mail_loop_observation_keys: [
            "docs:ready::sha256:ready::docs_chunk::es::chunk-ready::ask:lane:translation:ready-obs:projection:receipt",
          ],
          next_source_hashes: ["sha256:ready"],
          next_source_kinds: ["docs"],
          next_source_projection_targets: ["docs_chunk"],
          next_account_locales: ["es-US"],
          next_chunk_ids: ["chunk-ready"],
          next_source_event_ids: ["docs:ready:event-1"],
          next_projection_targets: ["docs_chunk"],
          next_target_languages: ["es"],
          next_mail_loop_wake_kinds: ["mailbox_wake"],
          next_freshness_statuses: ["fresh"],
          next_receipt_refs: ["ask:lane:translation:ready-obs:projection:receipt"],
          side_effects_allowed: false,
          side_effects_executed: false,
          wake_dispatch_allowed: false,
          badge_projection_allowed: false,
          terminal_report_allowed: false,
          terminal_report_emitted: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    };

    const summary = buildHelixAskRuntimeTurnSummary(reply);
    const rows = buildHelixTurnTranscriptRows(reply);
    const readiness = summary?.rows.find((row) => row.key === "goal_dispatch_readiness");
    expect(readiness).toMatchObject({
      label: "Goal dispatch readiness",
      value: expect.stringContaining("plans 2"),
    });
    expect(rows.find((row) => row.label === "Goal Readiness")).toMatchObject({
      status: "pending",
      text: expect.stringContaining("readiness partial"),
    });
    expect(buildHelixRuntimeAskLiveEvents(reply).find((event) => event.meta.stepId === "lane_goal_dispatch_readiness")).toMatchObject({
      meta: expect.objectContaining({
        readinessState: "partial",
        sourceIdentityKey:
          "docs:ready::sha256:ready::sha256:ready-text::2048::docs::docs_chunk::es-US::es",
      }),
    });
    expect(readiness?.value).toContain("readiness partial");
    expect(readiness?.value).toContain("admissions 2");
    expect(readiness?.value).toContain("admitted 1");
    expect(readiness?.value).toContain("blocked 1");
    expect(readiness?.value).toContain("pending wake 1");
    expect(readiness?.value).toContain("live mail loop required 1");
    expect(readiness?.value).toContain("any live mail loop required true");
    expect(readiness?.value).toContain("targets ask_wake");
    expect(readiness?.value).toContain("goal bindings goal-binding-ready");
    expect(readiness?.value).toContain("sources docs:ready");
    expect(readiness?.value).toContain("source bindings docs:ready::sha256:ready::docs_chunk::es-US::es");
    expect(readiness?.value).toContain(
      "source identities docs:ready::sha256:ready::sha256:ready-text::2048::docs::docs_chunk::es-US::es",
    );
    expect(readiness?.value).toContain(
      "mail observations docs:ready::sha256:ready::docs_chunk::es::chunk-ready::ask:lane:translation:ready-obs:projection:receipt",
    );
    expect(readiness?.value).toContain("source hashes sha256:ready");
    expect(readiness?.value).toContain("source kinds docs");
    expect(readiness?.value).toContain("source projections docs_chunk");
    expect(readiness?.value).toContain("account locales es-US");
    expect(readiness?.value).toContain("projections docs_chunk");
    expect(readiness?.value).toContain("target languages es");
    expect(readiness?.value).toContain("chunks chunk-ready");
    expect(readiness?.value).toContain("source events docs:ready:event-1");
    expect(readiness?.value).toContain("wake kinds mailbox_wake");
    expect(readiness?.value).toContain("freshness fresh");
    expect(readiness?.value).toContain("receipts ask:lane:translation:ready-obs:projection:receipt");
    expect(readiness?.value).toContain("blocked missing_mail_loop_ref");
    expect(readiness?.value).toContain("no side effects");
    expect(readiness?.value).toContain("observation-only");
  });

  it("projects utility and workstation reference lane observations without granting terminal authority", () => {
    const reply = {
      id: "reply-codex-generalized-lanes",
      turn_id: "turn-codex-generalized-lanes",
      content: "The lane observations are ready.",
      debug: {
        turn_id: "turn-codex-generalized-lanes",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_reentry_status: "observation_packet_required_for_provider_reentry",
        capability_lane_call_results: [
          {
            schema: "helix.utility_text.normalize_result.v1",
            ok: true,
            capability: "utility_text.normalize_text",
            lane_id: "utility_text",
            lane_resolve_trace: {
              requested_lane: "utility_text",
              requested_backend_provider: "utility_text.openai_compatible",
              selected_backend_provider: "utility_text.local_runtime",
              selection_reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
              availability_status: "dry_run",
              permission_status: "admitted",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-generalized-lanes",
              capability_key: "utility_text.normalize_text",
              lane_id: "utility_text",
              status: "succeeded",
              observation_summary: "Utility text normalization ready: lowercase.",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
          {
            schema: "helix.workstation_tool_reference.list_result.v1",
            ok: true,
            capability: "workstation_tool_reference.list_capabilities",
            lane_id: "workstation_tool_reference",
            lane_resolve_trace: {
              requested_lane: "workstation_tool_reference",
              selected_backend_provider: "workstation_tool_reference.helix_workstation_gateway",
              selection_reason: "selected_default_backend_provider_for_shadow_manifest",
              availability_status: "available",
              permission_status: "admitted",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-generalized-lanes",
              capability_key: "workstation_tool_reference.list_capabilities",
              lane_id: "workstation_tool_reference",
              status: "succeeded",
              observation_summary: "Workstation gateway catalog ready: 42 capabilities.",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
      },
    };

    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Request: Lane requested: utility_text.normalize_text.");
    expect(combined).toContain("Lane Backend: Lane backend selected: selected utility_text.local_runtime");
    expect(combined).toContain("requested utility_text.openai_compatible");
    expect(combined).toContain(
      "Lane Observation: Lane observation: utility_text.normalize_text produced Utility text normalization ready: lowercase.",
    );
    expect(combined).toContain("backend utility_text.local_runtime");
    expect(combined).toContain("execution executed_observation_only");
    expect(combined).toContain("availability dry_run");
    expect(combined).toContain("permission admitted");
    expect(combined).toContain("Lane Request: Lane requested: workstation_tool_reference.list_capabilities.");
    expect(combined).toContain(
      "Lane Backend: Lane backend selected: selected workstation_tool_reference.helix_workstation_gateway",
    );
    expect(combined).toContain(
      "Lane Observation: Lane observation: workstation_tool_reference.list_capabilities produced Workstation gateway catalog ready: 42 capabilities.",
    );
    expect(combined).toContain("Lane Re-entry: Lane re-entry: observation packet available for provider reasoning before terminal selection.");
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: The lane observations are ready.");
    expect(combined).not.toContain("source text");

    const laneProjection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(laneProjection).toContain("utility_text");
    expect(laneProjection).toContain("backend utility_text.local_runtime");
    expect(laneProjection).toContain("requested backend utility_text.openai_compatible");
    expect(laneProjection).toContain("execution executed_observation_only");
    expect(laneProjection).toContain("availability dry_run");
    expect(laneProjection).toContain("permission admitted");
  });

  it("summarizes visible translation collector UI-region targets in the runtime turn summary", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-codex-visible-ui-region-summary",
      turn_id: "turn-codex-visible-ui-region-summary",
      content: "The visible UI target was collected.",
      debug: {
        turn_id: "turn-codex-visible-ui-region-summary",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_call_results: [
          {
            schema: "helix.workstation_tool_reference.visible_translation_targets_result.v1",
            ok: true,
            capability: "workstation_tool_reference.collect_visible_translation_targets",
            lane_id: "workstation_tool_reference",
            target_count: 1,
            observation_ref: "ask:lane:collector:obs",
            lane_resolve_trace: {
              requested_lane: "workstation_tool_reference",
              selected_backend_provider: "workstation_tool_reference.helix_workstation_gateway",
              selection_reason: "selected_default_backend_provider_for_shadow_manifest",
              availability_status: "available",
              permission_status: "admitted",
            },
            observation: {
              schema: "helix.workstation_tool_reference.visible_translation_targets_observation.v1",
              observation_ref: "ask:lane:collector:obs",
              target_batch: {
                schema: "helix.visible_translation_target_batch.v1",
                batch_ref: "ask:lane:collector:batch",
                target_count: 1,
                requested_collector_capability: "workstation.visible_text.collect_translation_targets",
                collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
                targets: [
                  {
                    schema: "helix.visible_translation_target.v1",
                    source_kind: "button_label",
                    panel_id: "docs-viewer",
                    doc_path: "docs/current.md",
                    source_id: "workstation-shell#docs-viewer:translate-button",
                    source_hash: "sha256:doc-context",
                    source_text_hash: "fnv1a32:78e3e875",
                    source_text_char_count: 9,
                    visible_text: "Translate",
                    chunk_id: "docs-viewer:translate-button",
                    source_event_id:
                      "visible_translation_source_event:docs/current.md:ui:docs-viewer:translate-button:fnv1a32:78e3e875:es",
                    chunk_index: 0,
                    region_id: "docs-viewer:translate-button",
                    dedupe_key: "workstation-shell#docs-viewer:translate-button::es",
                    projection_target: "account_language",
                    account_locale: "en-US",
                    target_language: "es",
                    existing_observation_ref: "ask:turn:translation:observation:button",
                    existing_receipt_ref: "ask:turn:translation:receipt:button",
                    existing_translation_receipt_ref: "ask:turn:translation:receipt:button",
                    existing_projection_status: "projected",
                    existing_freshness_status: "fresh",
                    existing_terminal_authority_status: "not_terminal_authority",
                    existing_source_event_ms: 1782859999000,
                    existing_observed_at_ms: 1782859999100,
                    assistant_answer: false,
                    terminal_eligible: false,
                    answer_authority: false,
                    raw_content_included: false,
                    reentry_required: true,
                  },
                ],
                terminal_eligible: false,
                assistant_answer: false,
                answer_authority: false,
                raw_content_included: false,
                reentry_required: true,
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              capability_key: "workstation_tool_reference.collect_visible_translation_targets",
              status: "succeeded",
              observation_ref: "ask:lane:collector:obs",
              state_delta: {
                visible_translation_target_batch: {
                  schema: "helix.visible_translation_target_batch.v1",
                  target_count: 1,
                  requested_collector_capability: "workstation.visible_text.collect_translation_targets",
                  collector_capability: "workstation_tool_reference.collect_visible_translation_targets",
                  targets: [],
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
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "ask:turn:translation:receipt:button:pending",
            observation_ref: "ask:turn:translation:observation:button:pending",
            projection_key: "account-language:docs-viewer:translate-button:es",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            lane_session_id: "lane-session-account-language",
            selected_backend_provider: "live_translation.local_runtime",
            projection_target: "account_language",
            projection_status: "projected",
            source_id: "workstation-shell#docs-viewer:translate-button",
            panel_id: "docs-viewer",
            region_id: "docs-viewer:translate-button",
            doc_path: "docs/current.md",
            source_hash: "sha256:doc-context",
            source_kind: "button_label",
            source_text_hash: "fnv1a32:78e3e875",
            source_text_char_count: 9,
            account_locale: "en-US",
            chunk_id: "docs-viewer:translate-button",
            chunk_index: 0,
            dedupe_key: "workstation-shell#docs-viewer:translate-button::es",
            observed_at_ms: 1782860000100,
            freshness_status: "fresh",
            target_language: "es",
            translated_text: null,
            session_debug_phase: "running:translate_visible_region",
            session_observation_status: "pending_backend_observation",
            terminal_authority_status: "pending_helix_terminal_authority",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const laneProjection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(laneProjection).toContain("workstation_tool_reference");
    expect(laneProjection).toContain("visible_translation_targets");
    expect(laneProjection).toContain("requested collector workstation.visible_text.collect_translation_targets");
    expect(laneProjection).toContain("executed collector workstation_tool_reference.collect_visible_translation_targets");
    expect(laneProjection).toContain("target chunks 1");
    expect(laneProjection).toContain("target es");
    expect(laneProjection).toContain("projection account_language");
    expect(laneProjection).toContain("source kind button_label");
    expect(laneProjection).toContain("panel docs-viewer");
    expect(laneProjection).toContain("source workstation-shell#docs-viewer:translate-button");
    expect(laneProjection).toContain("doc path docs/current.md");
    expect(laneProjection).toContain("source hash sha256:doc-context");
    expect(laneProjection).toContain("source text hash fnv1a32:78e3e875");
    expect(laneProjection).toContain("source text chars 9");
    expect(laneProjection).toContain("first chunk docs-viewer:translate-button");
    expect(laneProjection).toContain(
      "source event visible_translation_source_event:docs/current.md:ui:docs-viewer:translate-button:fnv1a32:78e3e875:es",
    );
    expect(laneProjection).toContain("region docs-viewer:translate-button");
    expect(laneProjection).toContain("existing observation ask:turn:translation:observation:button");
    expect(laneProjection).toContain("existing receipt ask:turn:translation:receipt:button");
    expect(laneProjection).toContain("existing projection projected");
    expect(laneProjection).toContain("existing freshness fresh");
    expect(laneProjection).toContain("existing terminal authority not_terminal_authority");
    expect(laneProjection).toContain("existing source event ms 1782859999000");
    expect(laneProjection).toContain("existing observed 1782859999100");
    expect(laneProjection).toContain("answer authority false");
    expect(laneProjection).toContain("terminal eligible false");
    expect(laneProjection).toContain("assistant answer false");
    expect(laneProjection).toContain("re-entry required true");
    expect(laneProjection).toContain("translation still requires live_translation.translate_text");
    expect(laneProjection).toContain("live_translation.translate_text");
    expect(laneProjection).toContain("account-language health pending");
    expect(laneProjection).toContain("projection key account-language:docs-viewer:translate-button:es");
    expect(laneProjection).toContain("session phase running:translate_visible_region");
    expect(laneProjection).toContain("observation status pending_backend_observation");
    expect(laneProjection).toContain("terminal authority pending_helix_terminal_authority");
    expect(laneProjection).toContain("receipt ask:turn:translation:receipt:button:pending");
    expect(laneProjection).toContain("ref ask:turn:translation:observation:button:pending");
  });

  it("projects canonical capability_lane_turn_timeline rows before falling back to legacy lane arrays", () => {
    const reply = {
      id: "reply-codex-lane-timeline",
      turn_id: "turn-codex-lane-timeline",
      content: "Hola.",
      debug: {
        turn_id: "turn-codex-lane-timeline",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_turn_timeline: [
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 0,
            stage: "lane_visible",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "available",
            lane_visible: true,
            lane_requested: false,
            lane_executed: false,
            observation_reentered: false,
            requested_backend_provider: "google_gemini",
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
            stage: "lane_requested",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: false,
            observation_reentered: false,
            requested_backend_provider: "google_gemini",
            selected_backend_provider: "live_translation.local_runtime",
            fallback_backend_provider: "live_translation.local_runtime",
            selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            observation_ref: null,
            receipt_ref: null,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 2,
            stage: "lane_backend_selected",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: false,
            observation_reentered: false,
            requested_backend_provider: "google_gemini",
            selected_backend_provider: "live_translation.local_runtime",
            fallback_backend_provider: "live_translation.local_runtime",
            selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            observation_ref: null,
            receipt_ref: null,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 3,
            stage: "lane_observation",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "ask:lane:translation:obs",
            receipt_ref: "ask:lane:translation:receipt",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:timeline-doc",
            source_kind: "docs",
            source_text_hash: "fnv1a32:timeline-source-text",
            source_text_char_count: 2048,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
            latest_source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
            projection_target: "docs_chunk",
            account_locale: "es-US",
            target_language: "es",
            chunk_id: "chunk-001",
            chunk_index: 0,
            dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-001:es",
            source_event_id: "docs:event-001",
            freshness_status: "fresh",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 4,
            stage: "lane_projection_receipt",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "recorded",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "ask:lane:translation:obs",
            receipt_ref: "ask:lane:translation:receipt",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:timeline-doc",
            source_kind: "docs",
            source_text_hash: "fnv1a32:timeline-source-text",
            source_text_char_count: 2048,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
            projection_target: "docs_chunk",
            account_locale: "es-US",
            target_language: "es",
            chunk_id: "chunk-001",
            chunk_index: 0,
            dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-001:es",
            source_event_id: "docs:event-001",
            freshness_status: "fresh",
            terminal_authority_status: "not_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 5,
            stage: "lane_reentered",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "completed",
            lane_visible: false,
            lane_requested: true,
            lane_executed: false,
            observation_reentered: true,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "ask:lane:translation:obs",
            receipt_ref: "ask:lane:translation:receipt",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 6,
            stage: "lane_session",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: null,
            status: "running",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: false,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "ask:lane:translation:session-obs",
            receipt_ref: "ask:lane:translation:session-obs:projection:receipt",
            lifecycle_action: "record_observation",
            session_lifecycle_action: "record_observation",
            session_action: "record_observation",
            session_control_key:
              "lane-session-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es",
            source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es",
            latest_observation_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es::chunk-session-001::ask:lane:translation:session-obs:projection:receipt",
            latest_event_id: "lane-session-timeline:record_observation:250",
            has_observation: true,
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:session-doc",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:session-source-text",
            source_text_char_count: 4096,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text::4096::document_markdown::docs_chunk::es-US::es",
            latest_source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text-latest::2048::document_markdown::docs_chunk::es-US::es",
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            latest_chunk_id: "chunk-session-001",
            latest_chunk_index: 1,
            latest_dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-session-001:es",
            latest_source_event_id: "docs:event-session-001",
            latest_freshness_status: "stale",
            latest_projection_target: "docs_chunk",
            target_language: "es",
            latest_cancel_requested: false,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 7,
            stage: "lane_mail_loop",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "created",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: true,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "stage-play-mail:translation:timeline",
            receipt_ref: "ask:lane:translation:mail-obs:projection:receipt",
            latest_event_id: "stage-play-mail-provider-goal",
            lifecycle_action: "mail_loop",
            session_lifecycle_action: "mail_loop",
            session_action: "mail_loop",
            session_control_key:
              "lane-session-mail-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es",
            source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es",
            latest_observation_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es::chunk-mail-001::ask:lane:translation:mail-obs:projection:receipt",
            has_observation: true,
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:mail-doc",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:mail-source-text",
            source_text_char_count: 6144,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text::6144::document_markdown::docs_chunk::es-US::es",
            latest_source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text-latest::2048::document_markdown::docs_chunk::es-US::es",
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            latest_chunk_id: "chunk-mail-001",
            latest_chunk_index: 3,
            latest_dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-mail-001:es",
            latest_source_event_id: "docs:event-mail-001",
            latest_freshness_status: "fresh",
            latest_projection_target: "docs_chunk",
            target_language: "es",
            latest_cancel_requested: false,
            latest_mail_loop_wake_kind: "mailbox_wake",
            report_action: "mailbox_wake",
            report_reason: "created",
            report_summary_text: "lane mail loop materialized observation evidence",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 8,
            stage: "goal_binding",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability_id: null,
            status: "bound",
            lane_visible: false,
            lane_requested: true,
            lane_executed: true,
            observation_reentered: true,
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "stage-play-mail:translation:timeline",
            receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
            lifecycle_action: "record_observation",
            session_lifecycle_action: "record_observation",
            session_action: "record_observation",
            session_control_key:
              "lane-session-goal-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es-US::es",
            source_binding_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es-US::es",
            latest_observation_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es::chunk-goal-001::ask:lane:translation:goal-obs:projection:receipt",
            latest_event_id: "lane-session-goal-timeline:record_observation:275",
            has_observation: true,
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "fnv1a32:goal-doc",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:goal-source-text",
            source_text_char_count: 8192,
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::fnv1a32:goal-source-text::8192::document_markdown::docs_chunk::es-US::es",
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            latest_chunk_id: "chunk-goal-001",
            latest_chunk_index: 2,
            latest_dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-goal-001:es",
            latest_source_event_id: "docs:event-goal-001",
            latest_freshness_status: "fresh",
            latest_projection_target: "docs_chunk",
            target_language: "es",
            latest_cancel_requested: true,
            latest_mail_loop_wake_kind: "mailbox_wake",
            report_action: "wake_on_salience",
            report_reason: "goal_binding_policy_requests_wake_on_salience",
            report_summary_text:
              "goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience | evidence stage-play-mail:translation:timeline | mail stage-play-mail-provider-goal | receipt ask:lane:translation:goal-obs:projection:receipt | terminal authority pending_helix_terminal_authority",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.provider_timeline_event.v1",
            seq: 9,
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
            observation_ref: "ask:lane:translation:obs",
            receipt_ref: "ask:lane:translation:receipt",
            terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    };
    const rows = buildHelixTurnTranscriptRows(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");

    expect(combined).toContain("Lane Visible: Lane visible: live_translation.translate_text.");
    expect(combined).toContain("source capability_lane_turn_timeline");
    expect(combined).toContain("has observation false");
    expect(combined).toContain("Lane Request: Lane requested: live_translation.translate_text.");
    expect(combined).toContain(
      "Lane Backend: Lane backend selected: live_translation.local_runtime for live_translation.translate_text.",
    );
    expect(combined).toContain(
      "Lane Observation: Lane observation: live_translation.translate_text completed. has observation true; observation ask:lane:translation:obs; receipt ask:lane:translation:receipt.",
    );
    expect(combined).toContain(
      "Lane Receipt: Lane receipt: live_translation.translate_text projection receipt recorded. has observation true; observation ask:lane:translation:obs; receipt ask:lane:translation:receipt.",
    );
    expect(combined).toContain("lane_projection_receipt");
    expect(combined).toContain("source document_markdown:docs/research/nhm2.md");
    expect(combined).toContain("source hash fnv1a32:timeline-doc");
    expect(combined).toContain("source kind docs");
    expect(combined).toContain("source payload hash fnv1a32:timeline-source-text");
    expect(combined).toContain("source payload chars 2048");
    expect(combined).toContain(
      "source identity key document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
    );
    expect(combined).toContain("source projection docs_chunk");
    expect(combined).toContain("account locale es-US");
    expect(combined).toContain("projection docs_chunk");
    expect(combined).toContain("chunk chunk-001");
    expect(combined).toContain("dedupe document_markdown:docs/research/nhm2.md:chunk-001:es");
    expect(combined).toContain("source event docs:event-001");
    expect(combined).toContain("freshness fresh");
    expect(combined).toContain("target es");
    expect(combined).toContain(
      "Lane Re-entry: Lane re-entry: live_translation.translate_text observation re-entered provider reasoning. has observation true; observation ask:lane:translation:obs; receipt ask:lane:translation:receipt.",
    );
    expect(combined).toContain(
      "Lane Session: Lane session: live_translation running. source document_markdown:docs/research/nhm2.md; source kind document_markdown; source payload hash fnv1a32:session-source-text; source payload chars 4096; source identity key document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text::4096::document_markdown::docs_chunk::es-US::es; latest source identity key document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text-latest::2048::document_markdown::docs_chunk::es-US::es; source projection docs_chunk; projection docs_chunk; chunk chunk-session-001; dedupe document_markdown:docs/research/nhm2.md:chunk-session-001:es; source event docs:event-session-001; freshness stale; target es; cancel requested false; action record_observation; control lane-session-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es; source binding key document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es; observation key document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es::chunk-session-001::ask:lane:translation:session-obs:projection:receipt; latest event lane-session-timeline:record_observation:250; has observation true; observation ask:lane:translation:session-obs; receipt ask:lane:translation:session-obs:projection:receipt.",
    );
    expect(combined).toContain(
      "Lane Mail: Lane mail loop: live_translation created. source document_markdown:docs/research/nhm2.md; source kind document_markdown; source payload hash fnv1a32:mail-source-text; source payload chars 6144; source identity key document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text::6144::document_markdown::docs_chunk::es-US::es; latest source identity key document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text-latest::2048::document_markdown::docs_chunk::es-US::es; source projection docs_chunk; projection docs_chunk; chunk chunk-mail-001; dedupe document_markdown:docs/research/nhm2.md:chunk-mail-001:es; source event docs:event-mail-001; freshness fresh; wake kind mailbox_wake; report summary lane mail loop materialized observation evidence; report action mailbox_wake; report reason created; target es; cancel requested false; action mail_loop; control lane-session-mail-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es; source binding key document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es; observation key document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es::chunk-mail-001::ask:lane:translation:mail-obs:projection:receipt; latest event stage-play-mail-provider-goal; has observation true; observation stage-play-mail:translation:timeline; receipt ask:lane:translation:mail-obs:projection:receipt.",
    );
    expect(combined).toContain(
      "Goal Lane: Goal lane binding: live_translation bound. source document_markdown:docs/research/nhm2.md; source kind document_markdown; source payload hash fnv1a32:goal-source-text; source payload chars 8192; source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::fnv1a32:goal-source-text::8192::document_markdown::docs_chunk::es-US::es; source projection docs_chunk; projection docs_chunk; chunk chunk-goal-001; dedupe document_markdown:docs/research/nhm2.md:chunk-goal-001:es; source event docs:event-goal-001; freshness fresh; wake kind mailbox_wake; report summary goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience | evidence stage-play-mail:translation:timeline | mail stage-play-mail-provider-goal | receipt ask:lane:translation:goal-obs:projection:receipt | terminal authority pending_helix_terminal_authority; report action wake_on_salience; report reason goal_binding_policy_requests_wake_on_salience; target es; cancel requested true; action record_observation; control lane-session-goal-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es-US::es; source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es-US::es; observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-doc::docs_chunk::es::chunk-goal-001::ask:lane:translation:goal-obs:projection:receipt; latest event lane-session-goal-timeline:record_observation:275; has observation true; observation stage-play-mail:translation:timeline; receipt ask:lane:translation:goal-obs:projection:receipt.",
    );
    expect(combined).not.toContain("source text");
    expect(combined).toContain("wake kind mailbox_wake");
    expect(combined).toContain(
      "Terminal: Terminal selected: Helix accepted the provider candidate after lane evidence re-entry. Authority authorized_by_helix_provider_candidate_bridge.",
    );
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    const events = buildHelixRuntimeAskLiveEvents(reply);
    expect(events.find((event) => event.meta.stepId === "lane_session")).toMatchObject({
      meta: expect.objectContaining({
        sessionControlKey:
          "lane-session-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es",
        sourceBindingKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es-US::es",
        sourceIdentityKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text::4096::document_markdown::docs_chunk::es-US::es",
        latestSourceIdentityKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::fnv1a32:session-source-text-latest::2048::document_markdown::docs_chunk::es-US::es",
        latestObservationKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:session-doc::docs_chunk::es::chunk-session-001::ask:lane:translation:session-obs:projection:receipt",
        sessionLifecycleAction: "record_observation",
        event_source: "capability_lane_turn_timeline",
      }),
    });
    expect(events.find((event) => event.meta.stepId === "lane_mail_loop")).toMatchObject({
      text: expect.stringContaining("Lane mail loop: live_translation created."),
      meta: expect.objectContaining({
        stage: "observation",
        source_event_type: "lane_mail_loop",
        event_source: "capability_lane_turn_timeline",
        sessionControlKey:
          "lane-session-mail-timeline::document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es",
        sourceBindingKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es-US::es",
        sourceIdentityKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text::6144::document_markdown::docs_chunk::es-US::es",
        latestSourceIdentityKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::fnv1a32:mail-source-text-latest::2048::document_markdown::docs_chunk::es-US::es",
        latestObservationKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:mail-doc::docs_chunk::es::chunk-mail-001::ask:lane:translation:mail-obs:projection:receipt",
        sessionLifecycleAction: "mail_loop",
        observationRef: "stage-play-mail:translation:timeline",
        receiptRef: "ask:lane:translation:mail-obs:projection:receipt",
      }),
    });
  });

  it("projects capability lane console state rows from timeline summary", () => {
    const reply = {
      id: "reply-codex-lane-console-state",
      turn_id: "turn-codex-lane-console-state",
      content: "Done.",
      debug: {
        turn_id: "turn-codex-lane-console-state",
        agent_runtime: "codex",
        capability_lane_timeline_summary: {
          schema: "helix.capability_lane.timeline_summary.v1",
          console_state_rows: [
            {
              schema: "helix.capability_lane.console_state_row.v1",
              seq: 0,
              stage: "lane_visible",
              normalized_stage: "visible",
              state_label: "visible_only",
              lane_id: "live_translation",
              capability_id: "live_translation.translate_text",
              selected_runtime_agent_provider: "codex",
              requested_backend_provider: "google_gemini",
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
            },
            {
              schema: "helix.capability_lane.console_state_row.v1",
              seq: 1,
              stage: "lane_observation",
              normalized_stage: "observed",
              state_label: "observed_pending_reentry",
              lane_id: "live_translation",
              capability_id: "live_translation.translate_text",
              selected_runtime_agent_provider: "codex",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              backend_selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
              lane_visible: false,
              lane_requested: true,
              lane_executed: true,
              observation_reentered: false,
              lane_session_id: "lane-session-console",
              session_control_key:
                "lane-session-console::document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
              source_binding_key:
                "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
              latest_observation_key:
                "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
              latest_mail_loop_observation_key:
                "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
              goal_binding_key:
                "goal:translate-docs::goal-binding-console::lane-session-console::live_translation",
              latest_event_id: "lane-session-console:record_observation:125",
              observation_ref: "ask:lane:translation:obs",
              receipt_ref: "ask:lane:translation:receipt",
              source_id: "document_markdown:docs/research/nhm2.md",
              source_hash: "fnv1a32:timeline-doc",
              source_kind: "docs",
              source_text_hash: "fnv1a32:timeline-source-text",
              source_text_char_count: "2048",
              source_identity_key:
                "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
              latest_source_identity_key:
                "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text-latest::1024::docs::docs_chunk::es-US::es",
              projection_target: "docs_chunk",
              account_locale: "es-US",
              target_language: "es",
              chunk_id: "chunk-console-001",
              chunk_index: "0",
              dedupe_key: "document_markdown:docs/research/nhm2.md:chunk-console-001:es",
              source_event_id: "docs:event-console-001",
              source_event_ms: "100",
              observed_at_ms: "125",
              freshness_status: "fresh",
              terminal_authority_status: "pending_helix_terminal_authority",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.capability_lane.console_state_row.v1",
              seq: 2,
              stage: "terminal_selected",
              normalized_stage: "terminal_selected",
              state_label: "terminal_selected",
              lane_id: "helix_terminal_authority",
              selected_runtime_agent_provider: "codex",
              lane_visible: false,
              lane_requested: true,
              lane_executed: true,
              observation_reentered: true,
              observation_ref: "ask:lane:translation:obs",
              receipt_ref: "ask:lane:translation:receipt",
              terminal_authority_status: "authorized_by_helix_provider_candidate_bridge",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
        },
      },
    };

    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);
    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta}`).join("\n");

    expect(combined).toContain("Lane State: Lane state: live_translation.translate_text is visible_only.");
    expect(combined).toContain("source capability_lane_timeline_summary.console_state_rows");
    expect(combined).toContain("state visible_only");
    expect(combined).toContain("normalized stage visible");
    expect(combined).toContain("requested backend google_gemini");
    expect(combined).toContain("backend live_translation.local_runtime");
    expect(combined).toContain("fallback backend live_translation.local_runtime");
    expect(combined).toContain(
      "selection reason requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
    );
    expect(combined).toContain("lane visible true");
    expect(combined).toContain("lane requested false");
    expect(combined).toContain("lane executed false");
    expect(combined).toContain("observation re-entered false");
    expect(combined).toContain("terminal eligible false");
    expect(combined).toContain("assistant answer false");
    expect(combined).toContain("raw content included false");
    expect(combined).toContain(
      "Lane State: Lane state: live_translation.translate_text is observed_pending_reentry.",
    );
    expect(combined).toContain("observation ask:lane:translation:obs");
    expect(combined).toContain("receipt ask:lane:translation:receipt");
    expect(combined).toContain("session lane-session-console");
    expect(combined).toContain(
      "control lane-session-console::document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
    );
    expect(combined).toContain(
      "source binding key document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
    );
    expect(combined).toContain(
      "mail observation document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
    );
    expect(combined).toContain(
      "goal binding key goal:translate-docs::goal-binding-console::lane-session-console::live_translation",
    );
    expect(combined).toContain("latest event lane-session-console:record_observation:125");
    expect(combined).toContain("terminal authority pending_helix_terminal_authority");
    expect(combined).toContain("Lane State: Lane state: helix_terminal_authority is terminal_selected.");

    const events = buildHelixRuntimeAskLiveEvents(reply);
    expect(events.find((event) => event.meta.stateLabel === "observed_pending_reentry")).toMatchObject({
      meta: expect.objectContaining({
        event_source: "capability_lane_timeline_summary.console_state_rows",
        source_event_type: "lane_console_state",
        normalizedStage: "observed",
        requestedBackendProvider: "google_gemini",
        selectedBackendProvider: "live_translation.local_runtime",
        fallbackBackendProvider: "live_translation.local_runtime",
        backendSelectionReason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
        laneSessionId: "lane-session-console",
        sessionControlKey:
          "lane-session-console::document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
        sourceBindingKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
        latestObservationKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
        latestMailLoopObservationKey:
          "document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
        goalBindingKey: "goal:translate-docs::goal-binding-console::lane-session-console::live_translation",
        latestEventId: "lane-session-console:record_observation:125",
        observationRef: "ask:lane:translation:obs",
        receiptRef: "ask:lane:translation:receipt",
        laneVisible: false,
        laneRequested: true,
        laneExecuted: true,
        observationReentered: false,
        terminalAuthorityStatus: "pending_helix_terminal_authority",
      }),
    });

    const laneTimeline = summary?.rows.find((row) => row.key === "lane_timeline")?.value ?? "";
    expect(laneTimeline).toContain("visible: live_translation.translate_text");
    expect(laneTimeline).toContain("state visible_only");
    expect(laneTimeline).toContain("runtime codex");
    expect(laneTimeline).toContain("requested backend google_gemini");
    expect(laneTimeline).toContain("backend live_translation.local_runtime");
    expect(laneTimeline).toContain("fallback live_translation.local_runtime");
    expect(laneTimeline).toContain(
      "reason requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
    );
    expect(laneTimeline).toContain("source document_markdown:docs/research/nhm2.md");
    expect(laneTimeline).toContain("source hash fnv1a32:timeline-doc");
    expect(laneTimeline).toContain("source kind docs");
    expect(laneTimeline).toContain("source text fnv1a32:timeline-source-text");
    expect(laneTimeline).toContain("source chars 2048");
    expect(laneTimeline).toContain(
      "source identity document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text::2048::docs::docs_chunk::es-US::es",
    );
    expect(laneTimeline).toContain(
      "latest source identity document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::fnv1a32:timeline-source-text-latest::1024::docs::docs_chunk::es-US::es",
    );
    expect(laneTimeline).toContain("projection docs_chunk");
    expect(laneTimeline).toContain("account locale es-US");
    expect(laneTimeline).toContain("target es");
    expect(laneTimeline).toContain("chunk chunk-console-001");
    expect(laneTimeline).toContain("dedupe document_markdown:docs/research/nhm2.md:chunk-console-001:es");
    expect(laneTimeline).toContain("source event docs:event-console-001");
    expect(laneTimeline).toContain("source event ms 100");
    expect(laneTimeline).toContain("observed 125");
    expect(laneTimeline).toContain("freshness fresh");
    expect(laneTimeline).toContain("visible");
    expect(laneTimeline).toContain("not executed");
    expect(laneTimeline).toContain("observed: live_translation.translate_text");
    expect(laneTimeline).toContain("requested");
    expect(laneTimeline).toContain("executed");
    expect(laneTimeline).toContain("session lane-session-console");
    expect(laneTimeline).toContain(
      "control lane-session-console::document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
    );
    expect(laneTimeline).toContain(
      "source binding document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es-US::es",
    );
    expect(laneTimeline).toContain(
      "mail observation document_markdown:docs/research/nhm2.md::fnv1a32:timeline-doc::docs_chunk::es::chunk-console-001::ask:lane:translation:obs:projection:receipt",
    );
    expect(laneTimeline).toContain(
      "goal binding goal:translate-docs::goal-binding-console::lane-session-console::live_translation",
    );
    expect(laneTimeline).toContain("latest event lane-session-console:record_observation:125");
    expect(laneTimeline).toContain("observation ask:lane:translation:obs");
    expect(laneTimeline).toContain("receipt ask:lane:translation:receipt");
    expect(laneTimeline).toContain("terminal authority pending_helix_terminal_authority");
    expect(laneTimeline).toContain("terminal_selected: helix_terminal_authority");
    expect(laneTimeline).toContain("re-entered");
    expect(laneTimeline).toContain("terminal authority authorized_by_helix_provider_candidate_bridge");
    expect(laneTimeline).toContain("visible does not mean executed");
  });

  it("projects lane lifecycle rows from capability_lane_debug_events without call results", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-debug-events-only",
      turn_id: "turn-codex-lane-debug-events-only",
      content: "The debug event trail is visible.",
      debug: {
        turn_id: "turn-codex-lane-debug-events-only",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_debug_events: [
          {
            schema: "helix.capability_lane.debug_event.v1",
            event_id: "debug-lane-0-requested",
            seq: 0,
            stage: "lane_requested",
            selected_runtime_agent_provider: "codex",
            lane_id: "utility_text",
            capability: "utility_text.normalize_text",
            status: "completed",
            requested_backend_provider: "utility_text.openai_compatible",
            requested_backend_provider_known: true,
            requested_backend_configuration_status: "missing",
            requested_backend_availability_status: "unconfigured",
            requested_backend_permission_status: "configuration_missing",
            requested_backend_fallback_provider: "utility_text.local_runtime",
            selected_backend_provider: "utility_text.local_runtime",
            selection_reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              owner: "helix",
              outcome: "fallback_selected",
              reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
              requested_backend_provider: "utility_text.openai_compatible",
              requested_backend_provider_known: true,
              selected_backend_provider: "utility_text.local_runtime",
              fallback_backend_provider: "utility_text.local_runtime",
              selected_runtime_provider_remains_root: true,
              backend_provider_becomes_root_agent: false,
              dynamic_switching_executed: false,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            availability_status: "dry_run",
            permission_status: "admitted",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            execution_status: "executed_observation_only",
            observation_ref: "ask:lane:utility:obs",
            result_ref: "ask:lane:utility:obs",
            receipt_ref: "ask:lane:utility:obs:projection:receipt",
            reentry_required: true,
            reentry_status: "not_applicable",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.debug_event.v1",
            event_id: "debug-lane-0-backend",
            seq: 1,
            stage: "lane_backend_selected",
            selected_runtime_agent_provider: "codex",
            lane_id: "utility_text",
            capability: "utility_text.normalize_text",
            status: "completed",
            requested_backend_provider: "utility_text.openai_compatible",
            requested_backend_provider_known: true,
            requested_backend_configuration_status: "missing",
            requested_backend_availability_status: "unconfigured",
            requested_backend_permission_status: "configuration_missing",
            requested_backend_fallback_provider: "utility_text.local_runtime",
            selected_backend_provider: "utility_text.local_runtime",
            selection_reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              owner: "helix",
              outcome: "fallback_selected",
              reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
              requested_backend_provider: "utility_text.openai_compatible",
              requested_backend_provider_known: true,
              selected_backend_provider: "utility_text.local_runtime",
              fallback_backend_provider: "utility_text.local_runtime",
              selected_runtime_provider_remains_root: true,
              backend_provider_becomes_root_agent: false,
              dynamic_switching_executed: false,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            availability_status: "dry_run",
            permission_status: "admitted",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            execution_status: "executed_observation_only",
            observation_ref: "ask:lane:utility:obs",
            result_ref: "ask:lane:utility:obs",
            receipt_ref: "ask:lane:utility:obs:projection:receipt",
            reentry_required: true,
            reentry_status: "not_applicable",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.debug_event.v1",
            event_id: "debug-lane-0-observation",
            seq: 2,
            stage: "lane_observation",
            selected_runtime_agent_provider: "codex",
            lane_id: "utility_text",
            capability: "utility_text.normalize_text",
            status: "completed",
            requested_backend_provider: "utility_text.openai_compatible",
            selected_backend_provider: "utility_text.local_runtime",
            selection_reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
            availability_status: "dry_run",
            permission_status: "admitted",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            execution_status: "executed_observation_only",
            observation_ref: "ask:lane:utility:obs",
            result_ref: "ask:lane:utility:obs",
            receipt_ref: "ask:lane:utility:obs:projection:receipt",
            reentry_required: true,
            reentry_status: "observation_packet_required_for_provider_reentry",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          {
            schema: "helix.capability_lane.debug_event.v1",
            event_id: "debug-lane-reentry",
            seq: 3,
            stage: "lane_reentered",
            selected_runtime_agent_provider: "codex",
            lane_id: "capability_lane",
            capability: "capability_lane.reentry",
            status: "pending",
            requested_backend_provider: null,
            selected_backend_provider: null,
            selection_reason: null,
            availability_status: null,
            permission_status: null,
            cost_class: null,
            latency_class: null,
            privacy_class: null,
            fallback_backend_provider: null,
            execution_status: "executed_observation_only",
            observation_ref: null,
            result_ref: null,
            receipt_ref: "ask:lane:utility:obs:projection:receipt",
            reentry_required: true,
            reentry_status: "observation_packet_required_for_provider_reentry",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Request: Lane requested: utility_text.normalize_text.");
    expect(combined).toContain("Lane Backend: Lane backend selected: selected utility_text.local_runtime");
    expect(combined).toContain("requested utility_text.openai_compatible");
    expect(combined).toContain("requested configuration missing");
    expect(combined).toContain("requested availability unconfigured");
    expect(combined).toContain("requested permission configuration_missing");
    expect(combined).toContain("reason requested_backend_unconfigured_default_backend_selected_by_helix_policy");
    expect(combined).toContain("decision fallback_selected");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("cost free_local");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy local_only");
    expect(combined).toContain(
      "Lane Observation: Lane observation: utility_text.normalize_text produced ask:lane:utility:obs; receipt ask:lane:utility:obs:projection:receipt.",
    );
    expect(combined).toContain(
      "Lane Re-entry: Lane re-entry: observation packet available for provider reasoning before terminal selection. Receipt ask:lane:utility:obs:projection:receipt remains observation-only.",
    );
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: The debug event trail is visible.");
    expect(combined).not.toContain("source text");
  });

  it("projects compact lane backend selection summaries without inventing observations", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-backend-summary-only",
      turn_id: "turn-codex-lane-backend-summary-only",
      content: "Backend selection is visible.",
      debug: {
        turn_id: "turn-codex-lane-backend-summary-only",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_backend_selections: [
          {
            schema: "helix.capability_lane.backend_selection_summary.v1",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            requested_lane: "live_translation",
            requested_backend_provider: "google_gemini",
            selected_backend_provider: "live_translation.local_runtime",
            selection_reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              owner: "helix",
              outcome: "requested_recorded_default_selected",
              reason: "requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy",
              requested_backend_provider: "google_gemini",
              requested_backend_provider_known: true,
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              selected_runtime_provider_remains_root: true,
              backend_provider_becomes_root_agent: false,
              dynamic_switching_executed: false,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            availability_status: "dry_run",
            permission_status: "admitted",
            execution_status: "executed_observation_only",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Request: Lane requested: live_translation.translate_text.");
    expect(combined).toContain("Lane Backend: Lane backend selected: selected live_translation.local_runtime");
    expect(combined).toContain("requested google_gemini");
    expect(combined).toContain("reason requested_backend_recorded_but_default_backend_selected_by_helix_shadow_policy");
    expect(combined).toContain("decision requested_recorded_default_selected");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: Backend selection is visible.");
    expect(combined).not.toContain("Lane Observation:");
  });

  it("projects selected backend operating classes into lane live-event metadata", () => {
    const events = buildHelixRuntimeAskLiveEvents({
      id: "reply-codex-lane-backend-metadata-live-event",
      turn_id: "turn-codex-lane-backend-metadata-live-event",
      debug: {
        turn_id: "turn-codex-lane-backend-metadata-live-event",
        capability_lane_debug_events: [
          {
            schema: "helix.capability_lane.debug_event.v1",
            event_id: "debug-lane-backend-metadata",
            seq: 0,
            stage: "lane_backend_selected",
            selected_runtime_agent_provider: "codex",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            status: "completed",
            requested_backend_provider: "google_gemini",
            requested_backend_provider_known: true,
            selected_backend_provider: "live_translation.local_runtime",
            selection_reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              owner: "helix",
              outcome: "fallback_selected",
              reason: "requested_backend_unconfigured_default_backend_selected_by_helix_policy",
              requested_backend_provider: "google_gemini",
              requested_backend_provider_known: true,
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              selected_runtime_provider_remains_root: true,
              backend_provider_becomes_root_agent: false,
              dynamic_switching_executed: false,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            availability_status: "dry_run",
            permission_status: "admitted",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            execution_status: "executed_observation_only",
            observation_ref: "ask:lane:translation:metadata-obs",
            result_ref: "ask:lane:translation:metadata-obs",
            receipt_ref: "ask:lane:translation:metadata-obs:projection:receipt",
            reentry_required: true,
            reentry_status: "not_applicable",
            terminal_authority_status: "pending_helix_terminal_authority",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    expect(events.find((event) => event.meta.source_event_type === "lane_backend_selected")).toMatchObject({
      meta: expect.objectContaining({
        source_event_type: "lane_backend_selected",
        lane: "live_translation",
        capabilityId: "live_translation.translate_text",
        selectedBackendProvider: "live_translation.local_runtime",
        backendCostClass: "free_local",
        backendLatencyClass: "interactive",
        backendPrivacyClass: "local_only",
        fallbackBackendProvider: null,
        receiptRef: "ask:lane:translation:metadata-obs:projection:receipt",
        observationRef: "ask:lane:translation:metadata-obs",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    });
  });

  it("projects goal-bound lane session summaries without treating lane output as the final answer", () => {
    const reply = {
      id: "reply-codex-lane-goal-binding",
      turn_id: "turn-codex-lane-goal-binding",
      content: "The goal-bound lane session is being watched.",
      debug: {
        turn_id: "turn-codex-lane-goal-binding",
        agent_runtime: "codex",
        capability_lane_goal_binding_debug_summaries: [
          {
            schema: "helix.capability_lane.goal_binding_debug_summary.v1",
            goal_binding_id: "goal-binding-translate-docs",
            goal_binding_key: "goal:translate-docs::goal-binding-translate-docs::lane-session-translate-docs::live_translation",
            goal_id: "goal:translate-docs",
            lane_session_id: "lane-session-translate-docs",
            lane_id: "live_translation",
            selected_runtime_agent_provider: "codex",
            selected_backend_provider: "live_translation.local_runtime",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              lane_id: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              outcome: "fallback_to_available_provider",
              reason: "requested_backend_unconfigured",
              selected_runtime_provider_remains_root: true,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
            },
            lifecycle_action: "record_observation",
            session_status: "running",
            session_health: "healthy",
            latest_event_id: "lane-session-translate-docs:record_observation:1040",
            session_event_count: 2,
            has_observation: true,
            source_id: "docs:nhm2",
            source_hash: "sha256:nhm2-goal",
            source_kind: "docs",
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            session_control_key:
              "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
            source_binding_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
            permissions: {
              read: true,
              observe: true,
              act: true,
              write: false,
              shell: false,
              code_mutation: false,
            },
            permission_profile: "permissions non-mutating",
            last_observation_ref: "ask:lane:translation:goal-obs",
            last_receipt_ref: "ask:lane:translation:goal-obs:projection:receipt:previous",
            latest_observation_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
            latest_chunk_id: "chunk-goal-visible",
            latest_chunk_index: 5,
            latest_dedupe_key: "docs:nhm2:chunk-goal-visible:es",
            latest_source_event_id: "docs:nhm2:event-goal-visible",
            latest_source_event_ms: 1001,
            latest_observed_at_ms: 1040,
            latest_freshness_status: "fresh",
            latest_projection_target: "docs_chunk",
            target_language: "es",
            latest_cancel_requested: true,
            latest_mail_loop_summary: {
              schema: "helix.capability_lane.mail_loop_debug_summary.v1",
              lane_session_id: "lane-session-translate-docs",
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              observation_ref: "ask:lane:translation:goal-obs",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              stage_play_mail_id: "stage-play-mail-goal",
              stage_play_wake_expected: true,
              stage_play_wake_kind: "mailbox_wake",
              mailbox_thread_id: "ask-thread-goal",
              lane_session_source_binding_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              mail_loop_observation_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
              target_language: "es",
              terminal_authority_status: "pending_helix_terminal_authority",
              selected_backend_provider: "live_translation.local_runtime",
              requested_backend_provider: "google_gemini",
              cost_class: "free_local",
              latency_class: "interactive",
              privacy_class: "local_only",
              fallback_backend_provider: null,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            latest_mail_loop_observation_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
            mail_loop_refs: ["stage-play-mail-goal"],
            latest_goal_binding_event: {
              schema: "helix.capability_lane.goal_binding_event.v1",
              event_id: "goal-binding-translate-docs:mail_loop_recorded:1782860000100",
              goal_binding_id: "goal-binding-translate-docs",
              goal_id: "goal:translate-docs",
              lane_session_id: "lane-session-translate-docs",
              session_control_key:
                "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              source_binding_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              latest_mail_loop_observation_key:
                "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
              lane_id: "live_translation",
              event: "mail_loop_recorded",
              at_ms: 1782860000100,
              reason: "goal_lane_mail_loop_evidence_recorded",
              lane_session_status: "running",
              lane_session_health: "healthy",
              lane_session_observation_ref: "ask:lane:translation:goal-obs",
              source_id: "docs:nhm2",
              source_hash: "sha256:nhm2-goal",
              source_kind: "docs",
              source_projection_target: "docs_chunk",
              account_locale: "es-US",
              latest_event_id: "lane-session-translate-docs:record_observation:1040",
              session_event_count: 2,
              has_observation: true,
              latest_chunk_id: "chunk-goal-visible",
              latest_chunk_index: 5,
              latest_dedupe_key: "docs:nhm2:chunk-goal-visible:es",
              latest_source_event_id: "docs:nhm2:event-goal-visible",
              latest_source_event_ms: 1001,
              latest_observed_at_ms: 1040,
              latest_freshness_status: "fresh",
              latest_projection_target: "docs_chunk",
              latest_cancel_requested: true,
              mail_loop_ref: "stage-play-mail-goal",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              terminal_authority_status: "pending_helix_terminal_authority",
              reentry_required: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            report_decision: {
              schema: "helix.capability_lane.goal_report_decision.v1",
              action: "wake_on_salience",
              reason: "goal_binding_policy_requests_wake_on_salience",
              summary_text: [
                "goal lane wake on salience",
                "reason goal_binding_policy_requests_wake_on_salience",
                "evidence ask:lane:translation:goal-obs",
                "mail stage-play-mail-goal",
                "receipt ask:lane:translation:goal-obs:projection:receipt",
                "terminal authority pending_helix_terminal_authority",
              ].join(" | "),
              wake_expected: true,
              surface_badge_expected: false,
              terminal_report_requested: false,
              terminal_report_authorized: false,
              terminal_report_requires_authority: true,
              terminal_authority_status: "pending_helix_terminal_authority",
              evidence_ref: "ask:lane:translation:goal-obs",
              mail_loop_ref: "stage-play-mail-goal",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              reentry_required: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            dispatch_plan: {
              schema: "helix.capability_lane.goal_dispatch_plan.v1",
              target: "ask_wake",
              status: "planned_not_dispatched",
              reason: "goal_binding_policy_plans_ask_wake",
              source_report_action: "wake_on_salience",
              goal_binding_id: "goal-binding-translate-docs",
              goal_id: "goal:translate-docs",
              lane_session_id: "lane-session-translate-docs",
              session_control_key:
                "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              source_binding_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              latest_mail_loop_observation_key:
                "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
              lane_id: "live_translation",
              source_id: "docs:nhm2",
              source_kind: "docs",
              source_projection_target: "docs_chunk",
              account_locale: "es-US",
              latest_event_id: "lane-session-translate-docs:record_observation:1040",
              session_event_count: 2,
              has_observation: true,
              latest_chunk_id: "chunk-goal-visible",
              latest_chunk_index: 5,
              latest_dedupe_key: "docs:nhm2:chunk-goal-visible:es",
              latest_source_event_id: "docs:nhm2:event-goal-visible",
              latest_source_event_ms: 1001,
              latest_observed_at_ms: 1040,
              latest_freshness_status: "fresh",
              latest_projection_target: "docs_chunk",
              latest_cancel_requested: true,
              permissions: {
                read: true,
                observe: true,
                act: true,
                write: false,
                shell: false,
                code_mutation: false,
              },
              evidence_ref: "ask:lane:translation:goal-obs",
              mail_loop_ref: "stage-play-mail-goal",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              requires_live_mail_loop: true,
              requires_terminal_authority: false,
              side_effects_executed: false,
              wake_dispatched: false,
              badge_projected: false,
              terminal_report_emitted: false,
              terminal_authority_status: "pending_helix_terminal_authority",
              reentry_required: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            dispatch_admission: {
              schema: "helix.capability_lane.goal_dispatch_admission.v1",
              status: "eligible_waiting_for_mail_loop",
              reason: "goal_dispatch_admission_eligible_waiting_for_mail_loop",
              target: "ask_wake",
              goal_binding_id: "goal-binding-translate-docs",
              goal_id: "goal:translate-docs",
              lane_session_id: "lane-session-translate-docs",
              session_control_key:
                "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              source_binding_key: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
              latest_mail_loop_observation_key:
                "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
              lane_id: "live_translation",
              source_id: "docs:nhm2",
              source_kind: "docs",
              source_projection_target: "docs_chunk",
              account_locale: "es-US",
              latest_event_id: "lane-session-translate-docs:record_observation:1040",
              session_event_count: 2,
              has_observation: true,
              latest_chunk_id: "chunk-goal-visible",
              latest_chunk_index: 5,
              latest_dedupe_key: "docs:nhm2:chunk-goal-visible:es",
              latest_source_event_id: "docs:nhm2:event-goal-visible",
              latest_source_event_ms: 1001,
              latest_observed_at_ms: 1040,
              latest_freshness_status: "fresh",
              latest_projection_target: "docs_chunk",
              latest_cancel_requested: true,
              permissions: {
                read: true,
                observe: true,
                act: true,
                write: false,
                shell: false,
                code_mutation: false,
              },
              evidence_ref: "ask:lane:translation:goal-obs",
              mail_loop_ref: "stage-play-mail-goal",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              blocked_reason: null,
              requires_live_mail_loop: true,
              requires_terminal_authority: false,
              side_effects_allowed: false,
              side_effects_executed: false,
              wake_dispatch_allowed: false,
              badge_projection_allowed: false,
              terminal_report_allowed: false,
              terminal_authority_status: "pending_helix_terminal_authority",
              reentry_required: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            binding_status: "bound",
            report_summary_text: [
              "goal lane wake on salience",
              "reason goal_binding_policy_requests_wake_on_salience",
              "evidence ask:lane:translation:goal-obs",
              "mail stage-play-mail-goal",
              "receipt ask:lane:translation:goal-obs:projection:receipt",
              "terminal authority pending_helix_terminal_authority",
            ].join(" | "),
            report_policy: "terminal_authorized_summary",
            quiet_behavior: "wake_on_salience",
            backend_provider_becomes_root_agent: false,
            final_reports_require_terminal_authority: true,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_dispatch_readiness: {
          schema: "helix.capability_lane.goal_dispatch_readiness.v1",
          total_plans: 1,
          total_admissions: 1,
          admitted_count: 1,
          blocked_count: 0,
          pending_wake_count: 1,
          pending_terminal_authority_count: 0,
          live_mail_loop_required_count: 1,
          terminal_authority_required_count: 0,
          any_live_mail_loop_required: true,
          any_terminal_authority_required: false,
          projection_only_count: 0,
          manual_review_count: 0,
          debug_only_count: 0,
          blocked_reasons: [],
          next_lane_ids: ["live_translation"],
          next_lane_session_ids: ["lane-session-translate-docs"],
          next_session_control_keys: [
            "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
          ],
          next_source_binding_keys: [
            "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
          ],
          next_mail_loop_observation_keys: [
            "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
          ],
          next_dispatch_targets: ["ask_wake"],
          next_goal_binding_ids: ["goal-binding-translate-docs"],
          next_source_ids: ["docs:nhm2"],
          next_source_hashes: ["sha256:nhm2-goal"],
          next_source_kinds: ["docs"],
          next_source_projection_targets: ["docs_chunk"],
          next_account_locales: ["es-US"],
          next_latest_event_ids: ["lane-session-translate-docs:record_observation:1040"],
          next_session_event_counts: [2],
          next_has_observation: true,
          all_next_have_observation: true,
          next_chunk_ids: ["chunk-goal-visible"],
          next_dedupe_keys: ["docs:nhm2:chunk-goal-visible:es"],
          next_source_event_ids: ["docs:nhm2:event-goal-visible"],
          next_projection_targets: ["docs_chunk"],
          next_freshness_statuses: ["fresh"],
          next_mail_loop_wake_kinds: ["mailbox_wake"],
          next_cancel_requested: true,
          all_admitted_permissions_non_mutating: true,
          next_evidence_refs: ["ask:lane:translation:goal-obs"],
          next_receipt_refs: ["ask:lane:translation:goal-obs:projection:receipt"],
          side_effects_allowed: false,
          side_effects_executed: false,
          wake_dispatch_allowed: false,
          badge_projection_allowed: false,
          terminal_report_allowed: false,
          terminal_report_emitted: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    };

    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);
    const events = buildHelixRuntimeAskLiveEvents(reply);
    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Goal Lane: Goal-bound lane session: live_translation;");
    expect(combined).toContain("goal goal:translate-docs");
    expect(combined).toContain("session lane-session-translate-docs");
    expect(combined).toContain(
      "goal binding key goal:translate-docs::goal-binding-translate-docs::lane-session-translate-docs::live_translation",
    );
    expect(combined).toContain(
      "session control key lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
    );
    expect(combined).toContain("source binding key docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es");
    expect(combined).toContain(
      "observation key docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
    );
    expect(combined).toContain(
      "mail observation key docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
    );
    expect(combined).toContain("action record_observation");
    expect(combined).toContain("backend live_translation.local_runtime");
    expect(combined).toContain("cost free_local");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy local_only");
    expect(combined).toContain("decision fallback_to_available_provider");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("source kind docs");
    expect(combined).toContain("source hash sha256:nhm2-goal");
    expect(combined).toContain("source projection docs_chunk");
    expect(combined).toContain("account locale es-US");
    expect(combined).toContain("latest event id lane-session-translate-docs:record_observation:1040");
    expect(combined).toContain("session events 2");
    expect(combined).toContain("has observation true");
    expect(combined).toContain("latest projection docs_chunk");
    expect(combined).toContain("target es");
    expect(combined).toContain("latest chunk chunk-goal-visible");
    expect(combined).toContain("latest index 5");
    expect(combined).toContain("latest dedupe docs:nhm2:chunk-goal-visible:es");
    expect(combined).toContain("latest source event id docs:nhm2:event-goal-visible");
    expect(combined).toContain("latest source event ms 1001");
    expect(combined).toContain("latest observed 1040");
    expect(combined).toContain("latest freshness fresh");
    expect(combined).toContain("latest cancelled");
    expect(combined).toContain("last observation ask:lane:translation:goal-obs");
    expect(combined).toContain("latest mail stage-play-mail-goal");
    expect(combined).toContain("latest event mail_loop_recorded");
    expect(combined).toContain("receipt ask:lane:translation:goal-obs:projection:receipt");
    expect(combined).not.toContain("receipt ask:lane:translation:goal-obs:projection:receipt:previous");
    expect(combined).toContain(
      "report summary goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience",
    );
    expect(combined).toContain("report action wake_on_salience");
    expect(combined).toContain("report reason goal_binding_policy_requests_wake_on_salience");
    expect(combined).toContain("dispatch target ask_wake");
    expect(combined).toContain("dispatch planned_not_dispatched");
    expect(combined).toContain("permissions non-mutating");
    expect(combined).toContain("Goal Admission: Goal dispatch admission: live_translation;");
    expect(combined).toContain("status eligible_waiting_for_mail_loop");
    expect(combined).toContain("side effects not allowed");
    expect(combined).toContain("Goal Readiness: Goal dispatch readiness:");
    expect(combined).toContain("plans 1");
    expect(combined).toContain("admitted 1");
    expect(combined).toContain("pending wake 1");
    expect(combined).toContain("live mail loop required 1");
    expect(combined).toContain("any live mail loop required true");
    expect(combined).toContain("next lanes live_translation");
    expect(combined).toContain("next sessions lane-session-translate-docs");
    expect(combined).toContain(
      "next session controls lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
    );
    expect(combined).toContain("next source bindings docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es");
    expect(combined).toContain(
      "next mail observations docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
    );
    expect(combined).toContain("next targets ask_wake");
    expect(combined).toContain("next goal bindings goal-binding-translate-docs");
    expect(combined).toContain("next sources docs:nhm2");
    expect(combined).toContain("next source hashes sha256:nhm2-goal");
    expect(combined).toContain("next source kinds docs");
    expect(combined).toContain("next source projections docs_chunk");
    expect(combined).toContain("next account locales es-US");
    expect(combined).toContain("next latest events lane-session-translate-docs:record_observation:1040");
    expect(combined).toContain("next session event counts 2");
    expect(combined).toContain("next has observation true");
    expect(combined).toContain("all next have observation true");
    expect(combined).toContain("next projections docs_chunk");
    expect(combined).toContain("next chunks chunk-goal-visible");
    expect(combined).toContain("next dedupe docs:nhm2:chunk-goal-visible:es");
    expect(combined).toContain("next source events docs:nhm2:event-goal-visible");
    expect(combined).toContain("next wake kinds mailbox_wake");
    expect(combined).toContain("wake kind mailbox_wake");
    expect(combined).toContain("next freshness fresh");
    expect(combined).toContain("next cancelled");
    expect(combined).toContain("next evidence ask:lane:translation:goal-obs");
    expect(combined).toContain("next receipts ask:lane:translation:goal-obs:projection:receipt");
    expect(combined).toContain("all admitted permissions non-mutating");
    expect(combined).toContain("no side effects allowed");
    expect(combined).toContain("terminal authority pending_helix_terminal_authority");
    expect(combined).toContain("lane output remains observation-only");
    expect(combined).toContain("Final: The goal-bound lane session is being watched.");
    expect(rows.find((row) => row.label === "Goal Lane")).toMatchObject({
      role: "system",
      status: "pending",
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_binding")).toMatchObject({
      meta: expect.objectContaining({
        sourceId: "docs:nhm2",
        sourceHash: "sha256:nhm2-goal",
        sourceKind: "docs",
        sourceProjectionTarget: "docs_chunk",
        accountLocale: "es-US",
        sessionControlKey:
          "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        latestObservationKey:
          "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
        latestMailLoopObservationKey:
          "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
        goalBindingKey:
          "goal:translate-docs::goal-binding-translate-docs::lane-session-translate-docs::live_translation",
        goalBindingId: "goal-binding-translate-docs",
        goalId: "goal:translate-docs",
        bindingStatus: "bound",
        sessionStatus: "running",
        sessionHealth: "healthy",
        sessionLifecycleAction: "record_observation",
        sessionPermissionProfile: "permissions non-mutating",
        reportPolicy: "terminal_authorized_summary",
        quietBehavior: "wake_on_salience",
        reportAction: "wake_on_salience",
        reportReason: "goal_binding_policy_requests_wake_on_salience",
        reportSummaryText: [
          "goal lane wake on salience",
          "reason goal_binding_policy_requests_wake_on_salience",
          "evidence ask:lane:translation:goal-obs",
          "mail stage-play-mail-goal",
          "receipt ask:lane:translation:goal-obs:projection:receipt",
          "terminal authority pending_helix_terminal_authority",
        ].join(" | "),
        latestEventId: "lane-session-translate-docs:record_observation:1040",
        sessionEventCount: "2",
        hasObservation: true,
        latestChunkId: "chunk-goal-visible",
        latestDedupeKey: "docs:nhm2:chunk-goal-visible:es",
        latestSourceEventId: "docs:nhm2:event-goal-visible",
        latestProjectionTarget: "docs_chunk",
        targetLanguage: "es",
        latestFreshnessStatus: "fresh",
        latestCancelRequested: true,
        receiptRef: "ask:lane:translation:goal-obs:projection:receipt",
      }),
    });
    expect(rows.find((row) => row.label === "Goal Dispatch")).toMatchObject({
      role: "system",
      status: "pending",
      text: expect.stringContaining("Goal dispatch plan: live_translation; target ask_wake"),
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_plan")).toMatchObject({
      meta: expect.objectContaining({
        sessionControlKey:
          "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        latestMailLoopObservationKey:
          "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
        latestEventId: "lane-session-translate-docs:record_observation:1040",
        sessionEventCount: "2",
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
      }),
    });
    expect(rows.find((row) => row.label === "Goal Admission")).toMatchObject({
      role: "system",
      status: "pending",
      text: expect.stringContaining("Goal dispatch admission: live_translation; target ask_wake"),
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_admission")).toMatchObject({
      meta: expect.objectContaining({
        sessionControlKey:
          "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        latestMailLoopObservationKey:
          "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
        latestEventId: "lane-session-translate-docs:record_observation:1040",
        sessionEventCount: "2",
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
      }),
    });
    expect(rows.find((row) => row.label === "Goal Readiness")).toMatchObject({
      role: "system",
      status: "pending",
      text: expect.stringContaining("Goal dispatch readiness: readiness ready; plans 1"),
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_readiness")).toMatchObject({
      meta: expect.objectContaining({
        readinessState: "ready",
        sessionControlKey:
          "lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
        latestMailLoopObservationKey:
          "docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
        latestEventId: "lane-session-translate-docs:record_observation:1040",
        sessionEventCount: "2",
        hasObservation: true,
        allNextHaveObservation: true,
        liveMailLoopRequiredCount: "1",
        terminalAuthorityRequiredCount: "0",
        anyLiveMailLoopRequired: true,
        anyTerminalAuthorityRequired: false,
        stagePlayWakeKind: "mailbox_wake",
        contextRole: "tool_evidence",
        answerAuthority: false,
      }),
    });
    expect(rows.filter((row) => row.label === "Final")).toHaveLength(1);
    const goalSummary = summary?.rows.find((row) => row.key === "goal_bound_lanes")?.value ?? "";
    expect(goalSummary).toContain("live_translation");
    expect(goalSummary).toContain(
      "control lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
    );
    expect(goalSummary).toContain("action record_observation");
    expect(goalSummary).toContain("source docs:nhm2");
    expect(goalSummary).toContain("source kind docs");
    expect(goalSummary).toContain("source projection docs_chunk");
    expect(goalSummary).toContain("account locale es-US");
    expect(goalSummary).toContain("latest projection docs_chunk");
    expect(goalSummary).toContain("latest chunk chunk-goal-visible");
    expect(goalSummary).toContain("latest index 5");
    expect(goalSummary).toContain("latest dedupe docs:nhm2:chunk-goal-visible:es");
    expect(goalSummary).toContain("latest source event id docs:nhm2:event-goal-visible");
    expect(goalSummary).toContain("latest source event ms 1001");
    expect(goalSummary).toContain("latest observed 1040");
    expect(goalSummary).toContain("latest freshness fresh");
    expect(goalSummary).toContain("latest cancelled");
    expect(goalSummary).toContain("latest event id lane-session-translate-docs:record_observation:1040");
    expect(goalSummary).toContain("session events 2");
    expect(goalSummary).toContain("has observation true");
    expect(goalSummary).toContain("receipt ask:lane:translation:goal-obs:projection:receipt");
    expect(goalSummary).not.toContain("receipt ask:lane:translation:goal-obs:projection:receipt:previous");
    expect(goalSummary).toContain(
      "report summary goal lane wake on salience | reason goal_binding_policy_requests_wake_on_salience",
    );
    expect(goalSummary).toContain("permissions non-mutating");
    const readinessSummary = summary?.rows.find((row) => row.key === "goal_dispatch_readiness")?.value ?? "";
    expect(readinessSummary).toContain(
      "session controls lane-session-translate-docs::docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es",
    );
    expect(readinessSummary).toContain("source bindings docs:nhm2::sha256:nhm2-goal::docs_chunk::es-US::es");
    expect(readinessSummary).toContain(
      "mail observations docs:nhm2::sha256:nhm2-goal::docs_chunk::es::chunk-goal-visible::ask:lane:translation:goal-obs:projection:receipt",
    );
    expect(readinessSummary).toContain("latest events lane-session-translate-docs:record_observation:1040");
    expect(readinessSummary).toContain("session event counts 2");
    expect(readinessSummary).toContain("next has observation true");
    expect(readinessSummary).toContain("all next have observation true");
    expect(readinessSummary).toContain("live mail loop required 1");
    expect(readinessSummary).toContain("any live mail loop required true");
  });

  it("projects direct goal dispatch plans without requiring a full goal-binding summary", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-lane-goal-dispatch",
      turn_id: "turn-codex-lane-goal-dispatch",
      content: "The goal dispatch plan is visible.",
      debug: {
        turn_id: "turn-codex-lane-goal-dispatch",
        agent_runtime: "codex",
        capability_lane_goal_dispatch_plans: [
          {
            schema: "helix.capability_lane.goal_dispatch_plan.v1",
            target: "terminal_authority_review",
            status: "planned_not_dispatched",
            reason: "goal_binding_policy_plans_terminal_authority_review",
            source_report_action: "request_terminal_authority",
            goal_binding_id: "goal-binding-review",
            goal_id: "goal:review-lane",
            lane_session_id: "lane-session-review",
            lane_id: "live_translation",
            evidence_ref: "ask:lane:translation:review-obs",
            mail_loop_ref: null,
            receipt_ref: null,
            requires_live_mail_loop: false,
            requires_terminal_authority: true,
            side_effects_executed: false,
            wake_dispatched: false,
            badge_projected: false,
            terminal_report_emitted: false,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_dispatch_admissions: [
          {
            schema: "helix.capability_lane.goal_dispatch_admission.v1",
            status: "blocked",
            reason: "goal_dispatch_admission_blocked:terminal_authority_not_pending",
            target: "terminal_authority_review",
            goal_binding_id: "goal-binding-review",
            goal_id: "goal:review-lane",
            lane_session_id: "lane-session-review",
            lane_id: "live_translation",
            evidence_ref: "ask:lane:translation:review-obs",
            mail_loop_ref: null,
            receipt_ref: null,
            blocked_reason: "terminal_authority_not_pending",
            requires_live_mail_loop: false,
            requires_terminal_authority: true,
            side_effects_allowed: false,
            side_effects_executed: false,
            wake_dispatch_allowed: false,
            badge_projection_allowed: false,
            terminal_report_allowed: false,
            terminal_authority_status: "not_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Goal Dispatch: Goal dispatch plan: live_translation;");
    expect(combined).toContain("target terminal_authority_review");
    expect(combined).toContain("status planned_not_dispatched");
    expect(combined).toContain("no side effects executed");
    expect(combined).toContain("Goal Admission: Goal dispatch admission: live_translation;");
    expect(combined).toContain("blocked terminal_authority_not_pending");
    expect(combined).toContain("side effects not allowed");
    expect(combined).toContain("lane output remains observation-only");
    expect(rows.find((row) => row.label === "Goal Dispatch")).toMatchObject({
      role: "system",
      status: "pending",
    });
    expect(rows.find((row) => row.label === "Goal Admission")).toMatchObject({
      role: "system",
      status: "failed",
    });
    expect(rows.filter((row) => row.label === "Goal Lane")).toHaveLength(0);
    expect(rows.filter((row) => row.label === "Final")).toHaveLength(1);
  });

  it("projects standalone lane session summaries before goal binding exists", () => {
    const reply = {
      id: "reply-codex-lane-session",
      turn_id: "turn-codex-lane-session",
      content: "The lane session is visible.",
      debug: {
        turn_id: "turn-codex-lane-session",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_session_debug_summaries: [
          {
            schema: "helix.capability_lane.session_debug_summary.v1",
            lane_session_id: "lane-session-standalone",
            lane_id: "live_translation",
            selected_runtime_agent_provider: "codex",
            selected_backend_provider: "live_translation.local_runtime",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              lane_id: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              outcome: "fallback_to_available_provider",
              reason: "requested_backend_unconfigured",
              selected_runtime_provider_remains_root: true,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
            },
            lifecycle_action: "start",
            session_status: "running",
            session_health: "healthy",
            source_id: "docs:nhm2",
            source_hash: "sha256:nhm2-session",
            source_kind: "docs",
            source_text_hash: "fnv1a32:session-source-text",
            source_text_char_count: 4096,
            source_projection_target: "docs_chunk",
            projection_target: "docs_chunk",
            account_locale: null,
            latest_account_locale: "es-US",
            target_language: null,
            latest_target_language: "es",
            session_control_key:
              "lane-session-standalone::docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
            source_binding_key: "docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
            permissions: {
              read: true,
              observe: true,
              act: true,
              write: false,
              shell: false,
              code_mutation: false,
            },
            last_observation_ref: "ask:lane:translation:session-obs",
            last_receipt_ref: "ask:lane:translation:session-obs:projection:receipt",
            latest_receipt_ref: "ask:lane:translation:session-obs:projection:receipt:latest",
            latest_chunk_id: "chunk-session-visible",
            latest_chunk_index: 3,
            latest_source_event_id: "docs:nhm2:event-session-visible",
            latest_source_event_ms: 101,
            latest_observed_at_ms: 140,
            latest_freshness_status: "stale",
            latest_projection_target: "docs_chunk",
            latest_event_id: "lane-session-standalone:observation_recorded:140",
            has_observation: true,
            session_event_count: 2,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            backend_provider_becomes_root_agent: false,
            final_reports_require_terminal_authority: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    };
    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Session: Lane session: live_translation;");
    expect(combined).toContain("session lane-session-standalone");
    expect(combined).toContain("action start");
    expect(combined).toContain("backend live_translation.local_runtime");
    expect(combined).toContain("cost free_local");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy local_only");
    expect(combined).toContain("decision fallback_to_available_provider");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("source docs:nhm2");
    expect(combined).toContain("source binding key docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es");
    expect(combined).toContain("projection docs_chunk");
    expect(combined).toContain("locale es-US");
    expect(combined).toContain("target es");
    expect(combined).toContain("latest chunk chunk-session-visible");
    expect(combined).toContain("latest index 3");
    expect(combined).toContain("latest source event id docs:nhm2:event-session-visible");
    expect(combined).toContain("latest source event ms 101");
    expect(combined).toContain("latest observed 140");
    expect(combined).toContain("latest freshness stale");
    expect(combined).toContain("latest event lane-session-standalone:observation_recorded:140");
    expect(combined).toContain("has observation true");
    expect(combined).toContain("last observation ask:lane:translation:session-obs");
    expect(combined).toContain("receipt ask:lane:translation:session-obs:projection:receipt:latest");
    expect(combined).toContain("terminal authority pending_helix_terminal_authority");
    expect(combined).toContain("permissions non-mutating");
    expect(combined).toContain("lane output remains observation-only");
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: The lane session is visible.");
    expect(rows.find((row) => row.label === "Lane Session")).toMatchObject({
      role: "system",
      status: "pending",
    });
    expect(rows.some((row) => row.label === "Goal Lane")).toBe(false);
    const events = buildHelixRuntimeAskLiveEvents(reply);
    expect(events.find((event) => event.meta.stepId === "lane_session")).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        capabilityId: "live_translation",
        laneSessionId: "lane-session-standalone",
        sessionControlKey:
          "lane-session-standalone::docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
        sessionLifecycleAction: "start",
        sessionPermissionProfile: "permissions non-mutating",
        selectedBackendProvider: "live_translation.local_runtime",
        backendCostClass: "free_local",
        backendLatencyClass: "interactive",
        backendPrivacyClass: "local_only",
        fallbackBackendProvider: null,
        accountLocale: "es-US",
        targetLanguage: "es",
        receiptRef: "ask:lane:translation:session-obs:projection:receipt:latest",
        observationRef: "ask:lane:translation:session-obs",
        latestEventId: "lane-session-standalone:observation_recorded:140",
        hasObservation: true,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        source_event_type: "lane_session",
        event_source: "capability_lane_session_debug_summaries",
      }),
    });

    const sessionSummary = summary?.rows.find((row) => row.key === "lane_sessions")?.value ?? "";
    expect(sessionSummary).toContain("live_translation");
    expect(sessionSummary).toContain("session lane-session-standalone");
    expect(sessionSummary).toContain("action start");
    expect(sessionSummary).toContain("backend live_translation.local_runtime");
    expect(sessionSummary).toContain("cost free_local");
    expect(sessionSummary).toContain("latency interactive");
    expect(sessionSummary).toContain("privacy local_only");
    expect(sessionSummary).toContain("decision fallback_to_available_provider");
    expect(sessionSummary).toContain("runtime root preserved");
    expect(sessionSummary).toContain("no live backend execution");
    expect(sessionSummary).toContain("terminal authority helix");
    expect(sessionSummary).toContain(
      "control lane-session-standalone::docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
    );
    expect(sessionSummary).toContain("source docs:nhm2");
    expect(sessionSummary).toContain("source hash sha256:nhm2-session");
    expect(sessionSummary).toContain("source kind docs");
    expect(sessionSummary).toContain("source payload hash fnv1a32:session-source-text");
    expect(sessionSummary).toContain("source payload chars 4096");
    expect(sessionSummary).toContain("source projection docs_chunk");
    expect(sessionSummary).toContain("projection docs_chunk");
    expect(sessionSummary).toContain("locale es-US");
    expect(sessionSummary).toContain("target es");
    expect(sessionSummary).toContain("latest chunk chunk-session-visible");
    expect(sessionSummary).toContain("latest index 3");
    expect(sessionSummary).toContain("latest source event id docs:nhm2:event-session-visible");
    expect(sessionSummary).toContain("latest source event ms 101");
    expect(sessionSummary).toContain("latest observed 140");
    expect(sessionSummary).toContain("latest freshness stale");
    expect(sessionSummary).toContain("latest event lane-session-standalone:observation_recorded:140");
    expect(sessionSummary).toContain("has observation true");
    expect(sessionSummary).toContain("observation ask:lane:translation:session-obs");
    expect(sessionSummary).toContain("receipt ask:lane:translation:session-obs:projection:receipt:latest");
    expect(sessionSummary).toContain("authority pending_helix_terminal_authority");
    expect(sessionSummary).toContain("permissions non-mutating");
    expect(sessionSummary).toContain("observation-only");
  });

  it("projects manual lane session list controls separately from stored lifecycle summaries", () => {
    const reply = {
      id: "reply-codex-lane-session-list",
      turn_id: "turn-codex-lane-session-list",
      content: "The lane session list is visible.",
      debug: {
        turn_id: "turn-codex-lane-session-list",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_session_results: [
          {
            ok: true,
            action: "list",
            lane_id: "live_translation",
            lane_session_id: "lane-session-standalone",
            selected_runtime_agent_provider: "codex",
            requested_backend_provider: null,
            session_supported: true,
            source_id: "docs:nhm2",
            source_hash: "sha256:nhm2-session",
            source_binding_key: "docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
            source_identity_key:
              "docs:nhm2::sha256:nhm2-session::fnv1a32:session-source-text::4096::docs::docs_chunk::es-US::es",
            source_text_hash: "fnv1a32:session-source-text",
            source_text_char_count: 4096,
            account_locale: "es-US",
            target_language: "es",
            lane_session: null,
            blocked_reason: null,
            context_role: "tool_evidence",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_session_debug_summaries: [
          {
            schema: "helix.capability_lane.session_debug_summary.v1",
            lane_session_id: "lane-session-standalone",
            lane_id: "live_translation",
            selected_runtime_agent_provider: "codex",
            selected_backend_provider: "live_translation.local_runtime",
            lifecycle_action: "start",
            session_status: "running",
            session_health: "healthy",
            source_id: "docs:nhm2",
            source_hash: "sha256:nhm2-session",
            source_kind: "docs",
            source_text_hash: "fnv1a32:session-source-text",
            source_text_char_count: 4096,
            projection_target: "docs_chunk",
            latest_account_locale: "es-US",
            latest_target_language: "es",
            session_control_key:
              "lane-session-standalone::docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
            source_binding_key: "docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
            latest_event_id: "lane-session-standalone:start:100",
            has_observation: false,
            session_event_count: 1,
            terminal_authority_status: "not_terminal_authority",
            reentry_required: true,
            backend_provider_becomes_root_agent: false,
            final_reports_require_terminal_authority: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    };

    const rows = buildHelixTurnTranscriptRows(reply);
    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Session: Lane session control: live_translation; action list;");
    expect(combined).toContain("session lane-session-standalone");
    expect(combined).toContain("source binding key docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es");
    expect(combined).toContain("source payload hash fnv1a32:session-source-text");
    expect(combined).toContain("control result is observation-only");
    expect(combined).toContain("Lane Session: Lane session: live_translation; session lane-session-standalone; action start;");

    const events = buildHelixRuntimeAskLiveEvents(reply);
    expect(events.find((event) =>
      event.meta.stepId === "lane_session" &&
      event.meta.event_source === "capability_lane_session_results"
    )).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        laneSessionId: "lane-session-standalone",
        sessionLifecycleAction: "list",
        sourceBindingKey: "docs:nhm2::sha256:nhm2-session::docs_chunk::es-US::es",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    });
    expect(events.find((event) =>
      event.meta.stepId === "lane_session" &&
      event.meta.event_source === "capability_lane_session_debug_summaries"
    )).toMatchObject({
      meta: expect.objectContaining({
        laneSessionId: "lane-session-standalone",
        sessionLifecycleAction: "start",
      }),
    });
  });

  it("projects goal-bound lane refs into live-event metadata", () => {
    const events = buildHelixRuntimeAskLiveEvents({
      id: "reply-codex-goal-lane-live-event",
      turn_id: "turn-codex-goal-lane-live-event",
      debug: {
        turn_id: "turn-codex-goal-lane-live-event",
        capability_lane_goal_dispatch_plans: [
          {
            schema: "helix.capability_lane.goal_dispatch_plan.v1",
            target: "ask_wake",
            status: "planned_not_dispatched",
            reason: "goal_binding_policy_plans_ask_wake",
            source_report_action: "wake_on_salience",
            goal_binding_id: "goal-binding-live-event",
            goal_id: "goal:translate-docs",
            lane_session_id: "lane-session-live-event",
            lane_id: "live_translation",
            evidence_ref: "ask:lane:translation:live-event-obs",
            mail_loop_ref: "stage-play-mail-live-event",
            receipt_ref: "ask:lane:translation:live-event-obs:projection:receipt",
            requires_live_mail_loop: true,
            requires_terminal_authority: false,
            side_effects_executed: false,
            wake_dispatched: false,
            badge_projected: false,
            terminal_report_emitted: false,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_dispatch_admissions: [
          {
            schema: "helix.capability_lane.goal_dispatch_admission.v1",
            status: "eligible_waiting_for_mail_loop",
            reason: "goal_dispatch_admission_eligible_waiting_for_mail_loop",
            target: "ask_wake",
            goal_binding_id: "goal-binding-live-event",
            goal_id: "goal:translate-docs",
            lane_session_id: "lane-session-live-event",
            lane_id: "live_translation",
            evidence_ref: "ask:lane:translation:live-event-obs",
            mail_loop_ref: "stage-play-mail-live-event",
            receipt_ref: "ask:lane:translation:live-event-obs:projection:receipt",
            blocked_reason: null,
            requires_live_mail_loop: true,
            requires_terminal_authority: false,
            side_effects_allowed: false,
            side_effects_executed: false,
            wake_dispatch_allowed: false,
            badge_projection_allowed: false,
            terminal_report_allowed: false,
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
        capability_lane_goal_dispatch_readiness: {
          schema: "helix.capability_lane.goal_dispatch_readiness.v1",
          total_plans: 1,
          total_admissions: 1,
          admitted_count: 1,
          blocked_count: 0,
          pending_wake_count: 1,
          pending_terminal_authority_count: 0,
          projection_only_count: 0,
          manual_review_count: 0,
          debug_only_count: 0,
          blocked_reasons: [],
          next_lane_ids: ["live_translation"],
          next_lane_session_ids: ["lane-session-live-event"],
          next_dispatch_targets: ["ask_wake"],
          next_goal_binding_ids: ["goal-binding-live-event"],
          next_evidence_refs: ["ask:lane:translation:live-event-obs"],
          next_receipt_refs: ["ask:lane:translation:live-event-obs:projection:receipt"],
          side_effects_allowed: false,
          side_effects_executed: false,
          wake_dispatch_allowed: false,
          badge_projection_allowed: false,
          terminal_report_allowed: false,
          terminal_report_emitted: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    });

    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_plan")).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        laneSessionId: "lane-session-live-event",
        receiptRef: "ask:lane:translation:live-event-obs:projection:receipt",
        observationRef: "ask:lane:translation:live-event-obs",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_admission")).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        laneSessionId: "lane-session-live-event",
        receiptRef: "ask:lane:translation:live-event-obs:projection:receipt",
        observationRef: "ask:lane:translation:live-event-obs",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    });
    expect(events.find((event) => event.meta.stepId === "lane_goal_dispatch_readiness")).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        laneSessionId: "lane-session-live-event",
        receiptRef: "ask:lane:translation:live-event-obs:projection:receipt",
        observationRef: "ask:lane:translation:live-event-obs",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    });
  });

  it("projects goal-bound lane backend-selection decisions in the runtime summary", () => {
    const summary = buildHelixAskRuntimeTurnSummary({
      id: "reply-codex-lane-goal-summary",
      turn_id: "turn-codex-lane-goal-summary",
      content: "Goal-bound lane summary.",
      debug: {
        turn_id: "turn-codex-lane-goal-summary",
        agent_runtime: "codex",
        capability_lane_goal_binding_debug_summaries: [
          {
            schema: "helix.capability_lane.goal_binding_debug_summary.v1",
            goal_binding_id: "goal-binding-translate-docs",
            goal_id: "goal:translate-docs",
            lane_session_id: "lane-session-translate-docs",
            lane_id: "live_translation",
            selected_runtime_agent_provider: "codex",
            selected_backend_provider: "live_translation.local_runtime",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              lane_id: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              outcome: "fallback_to_available_provider",
              reason: "requested_backend_unconfigured",
              selected_runtime_provider_remains_root: true,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
            },
            binding_status: "active",
            session_status: "running",
            source_id: "docs:nhm2",
            last_observation_ref: "ask:lane:translation:goal-obs",
            latest_mail_loop_summary: {
              schema: "helix.capability_lane.mail_loop_debug_summary.v1",
              stage_play_mail_id: "stage-play-mail-goal-summary",
              observation_ref: "ask:lane:translation:goal-obs",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              selected_backend_provider: "live_translation.local_runtime",
              requested_backend_provider: "google_gemini",
              cost_class: "free_local",
              latency_class: "interactive",
              privacy_class: "local_only",
              fallback_backend_provider: null,
            },
            latest_goal_binding_event: {
              schema: "helix.capability_lane.goal_binding_event.v1",
              event_id: "goal-binding-translate-docs:mail_loop_recorded:1782860000100",
              goal_binding_id: "goal-binding-translate-docs",
              goal_id: "goal:translate-docs",
              lane_session_id: "lane-session-translate-docs",
              lane_id: "live_translation",
              event: "mail_loop_recorded",
              at_ms: 1782860000100,
              reason: "goal_lane_mail_loop_evidence_recorded",
              lane_session_status: "running",
              lane_session_health: "healthy",
              lane_session_observation_ref: "ask:lane:translation:goal-obs",
              mail_loop_ref: "stage-play-mail-goal-summary",
              receipt_ref: "ask:lane:translation:goal-obs:projection:receipt",
              terminal_authority_status: "pending_helix_terminal_authority",
              reentry_required: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            terminal_authority_status: "pending_helix_terminal_authority",
          },
        ],
      },
    });

    const goalSummary = summary?.rows.find((row) => row.key === "goal_bound_lanes")?.value ?? "";
    expect(goalSummary).toContain("live_translation");
    expect(goalSummary).toContain("goal goal:translate-docs");
    expect(goalSummary).toContain("session lane-session-translate-docs");
    expect(goalSummary).toContain("backend live_translation.local_runtime");
    expect(goalSummary).toContain("cost free_local");
    expect(goalSummary).toContain("latency interactive");
    expect(goalSummary).toContain("privacy local_only");
    expect(goalSummary).toContain("decision fallback_to_available_provider");
    expect(goalSummary).toContain("runtime root preserved");
    expect(goalSummary).toContain("no live backend execution");
    expect(goalSummary).toContain("terminal authority helix");
    expect(goalSummary).toContain("event mail_loop_recorded");
    expect(goalSummary).toContain("receipt ask:lane:translation:goal-obs:projection:receipt");
    expect(goalSummary).toContain("authority pending_helix_terminal_authority");
    expect(goalSummary).toContain("observation-only");
  });

  it("projects lane mail-loop summaries as evidence-only wake rows", () => {
    const reply = {
      id: "reply-codex-lane-mail-loop",
      turn_id: "turn-codex-lane-mail-loop",
      content: "The lane mail packet is visible.",
      debug: {
        turn_id: "turn-codex-lane-mail-loop",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_mail_loop_debug_summaries: [
          {
            schema: "helix.capability_lane.mail_loop_debug_summary.v1",
            lane_session_id: "lane-session-mail",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            observation_lane_session_id: "lane-session-mail-observation",
            observation_ref: "ask:lane:translation:mail-obs",
            receipt_ref: "ask:lane:translation:mail-obs:projection:receipt",
            stage_play_mail_id: "stage-play-mail-translation",
            stage_play_mail_delivery_status: "deduped_existing",
            materialized_mail_loop_evidence: true,
            previous_stage_play_mail_id: "stage-play-mail-translation",
            stage_play_wake_expected: true,
            stage_play_wake_kind: "mailbox_wake",
            mailbox_thread_id: "ask-thread-mail",
            source_id: "docs:nhm2",
            source_hash: "sha256:mail-doc",
            source_kind: "document_markdown",
            source_text_hash: "fnv1a32:mail-source-text",
            source_text_char_count: 6144,
            source_projection_target: "docs_chunk",
            account_locale: "es-US",
            lane_session_control_key:
              "lane-session-mail::docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
            lane_session_source_binding_key: "docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
            chunk_id: "chunk-1",
            chunk_index: 1,
            dedupe_key: "docs:nhm2:chunk-1:es",
            source_event_id: "docs:nhm2:event-1",
            source_event_ms: 1782860000000,
            observed_at_ms: 1782860000100,
            projection_target: "docs_chunk",
            target_language: "es",
            cancel_requested: false,
            selected_backend_provider: "live_translation.local_runtime",
            requested_backend_provider: "google_gemini",
            cost_class: "free_local",
            latency_class: "interactive",
            privacy_class: "local_only",
            fallback_backend_provider: null,
            backend_selection_decision: {
              schema: "helix.capability_lane.backend_selection_decision.v1",
              lane_id: "live_translation",
              requested_backend_provider: "google_gemini",
              selected_backend_provider: "live_translation.local_runtime",
              fallback_backend_provider: "live_translation.local_runtime",
              outcome: "fallback_to_available_provider",
              reason: "requested_backend_unconfigured",
              selected_runtime_provider_remains_root: true,
              live_backend_execution_enabled: false,
              terminal_authority_owner: "helix",
            },
            freshness_status: "fresh",
            blocked_reason: null,
            mail_status: "unread",
            terminal_authority_status: "pending_helix_terminal_authority",
            reentry_required: true,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    };
    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("Lane Mail: Lane mail loop: live_translation;");
    expect(combined).toContain("session lane-session-mail");
    expect(combined).toContain("mail stage-play-mail-translation");
    expect(combined).toContain("materialized mail evidence true");
    expect(combined).toContain("mail delivery deduped_existing");
    expect(combined).toContain("previous mail stage-play-mail-translation");
    expect(combined).toContain("wake expected");
    expect(combined).toContain("mailbox wake expected true");
    expect(combined).toContain("decision wake expected false");
    expect(combined).toContain("wake kind mailbox_wake");
    expect(combined).toContain("observation session lane-session-mail-observation");
    expect(combined).toContain(
      "session control key lane-session-mail::docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
    );
    expect(combined).toContain("source binding key docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es");
    expect(combined).toContain("observation ask:lane:translation:mail-obs");
    expect(combined).toContain("receipt ask:lane:translation:mail-obs:projection:receipt");
    expect(combined).toContain("source docs:nhm2");
    expect(combined).toContain("account locale es-US");
    expect(combined).toContain("chunk chunk-1");
    expect(combined).toContain("index 1");
    expect(combined).toContain("dedupe docs:nhm2:chunk-1:es");
    expect(combined).toContain("source event id docs:nhm2:event-1");
    expect(combined).toContain("source event ms 1782860000000");
    expect(combined).toContain("observed 1782860000100");
    expect(combined).toContain("target es");
    expect(combined).toContain("backend live_translation.local_runtime");
    expect(combined).toContain("requested backend google_gemini");
    expect(combined).toContain("cost free_local");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy local_only");
    expect(combined).toContain("decision fallback_to_available_provider");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("terminal authority pending_helix_terminal_authority");
    expect(combined).toContain("mail is evidence-only");
    expect(combined).toContain("Terminal: Terminal selected: agent_provider_terminal_candidate.");
    expect(combined).toContain("Final: The lane mail packet is visible.");
    expect(rows.find((row) => row.label === "Lane Mail")).toMatchObject({
      role: "system",
      status: "pending",
    });

    const mailSummary = summary?.rows.find((row) => row.key === "lane_mail")?.value ?? "";
    expect(mailSummary).toContain("live_translation");
    expect(mailSummary).toContain("session lane-session-mail");
    expect(mailSummary).toContain("mail stage-play-mail-translation");
    expect(mailSummary).toContain("materialized mail evidence true");
    expect(mailSummary).toContain("mail delivery deduped_existing");
    expect(mailSummary).toContain("previous mail stage-play-mail-translation");
    expect(mailSummary).toContain("wake expected");
    expect(mailSummary).toContain("mailbox wake expected true");
    expect(mailSummary).toContain("decision wake expected false");
    expect(mailSummary).toContain("wake kind mailbox_wake");
    expect(mailSummary).toContain("observation session lane-session-mail-observation");
    expect(mailSummary).toContain(
      "control lane-session-mail::docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
    );
    expect(mailSummary).toContain("observation ask:lane:translation:mail-obs");
    expect(mailSummary).toContain("receipt ask:lane:translation:mail-obs:projection:receipt");
    expect(mailSummary).toContain("source docs:nhm2");
    expect(mailSummary).toContain("source hash sha256:mail-doc");
    expect(mailSummary).toContain("source kind document_markdown");
    expect(mailSummary).toContain("source payload hash fnv1a32:mail-source-text");
    expect(mailSummary).toContain("source payload chars 6144");
    expect(mailSummary).toContain("source projection docs_chunk");
    expect(mailSummary).toContain("account locale es-US");
    expect(mailSummary).toContain("projection docs_chunk");
    expect(mailSummary).toContain("chunk chunk-1");
    expect(mailSummary).toContain("index 1");
    expect(mailSummary).toContain("dedupe docs:nhm2:chunk-1:es");
    expect(mailSummary).toContain("source event id docs:nhm2:event-1");
    expect(mailSummary).toContain("source event ms 1782860000000");
    expect(mailSummary).toContain("observed 1782860000100");
    expect(mailSummary).toContain("backend live_translation.local_runtime");
    expect(mailSummary).toContain("cost free_local");
    expect(mailSummary).toContain("latency interactive");
    expect(mailSummary).toContain("privacy local_only");
    expect(mailSummary).toContain("decision fallback_to_available_provider");
    expect(mailSummary).toContain("runtime root preserved");
    expect(mailSummary).toContain("no live backend execution");
    expect(mailSummary).toContain("terminal authority helix");
    expect(mailSummary).toContain("authority pending_helix_terminal_authority");
    expect(mailSummary).toContain("evidence-only");

    const events = buildHelixRuntimeAskLiveEvents(reply);
    expect(events.find((event) => event.meta.stepId === "lane_mail_loop")).toMatchObject({
      meta: expect.objectContaining({
        lane: "live_translation",
        capabilityId: "live_translation.translate_text",
        laneSessionId: "lane-session-mail",
        observationLaneSessionId: "lane-session-mail-observation",
        sessionControlKey: "lane-session-mail::docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
        sourceBindingKey: "docs:nhm2::sha256:mail-doc::docs_chunk::es-US::es",
        sourceId: "docs:nhm2",
        sourceHash: "sha256:mail-doc",
        accountLocale: "es-US",
        latestChunkId: "chunk-1",
        latestChunkIndex: "1",
        latestDedupeKey: "docs:nhm2:chunk-1:es",
        latestSourceEventId: "docs:nhm2:event-1",
        latestSourceEventMs: "1782860000000",
        latestObservedAtMs: "1782860000100",
        latestFreshnessStatus: "fresh",
        latestProjectionTarget: "docs_chunk",
        targetLanguage: "es",
        stagePlayMailId: "stage-play-mail-translation",
        stagePlayMailDeliveryStatus: "deduped_existing",
        previousStagePlayMailId: "stage-play-mail-translation",
        stagePlayWakeExpected: true,
        mailboxThreadId: "ask-thread-mail",
        mailStatus: "unread",
        blockedReason: null,
        receiptRef: "ask:lane:translation:mail-obs:projection:receipt",
        observationRef: "ask:lane:translation:mail-obs",
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        source_event_type: "lane_mail_loop",
        event_source: "capability_lane_mail_loop_debug_summaries",
      }),
    });
  });

  it("projects shadow lane packet backend metadata in transcript rows and runtime summary", () => {
    const reply = {
      id: "reply-codex-shadow-visual-lane",
      turn_id: "turn-codex-shadow-visual-lane",
      content: "The visual lane is cataloged but not executed.",
      debug: {
        turn_id: "turn-codex-shadow-visual-lane",
        agent_runtime: "codex",
        terminal_artifact_kind: "agent_provider_terminal_candidate",
        capability_lane_call_results: [
          {
            ok: false,
            capability: "visual_analysis.inspect_frame",
            capability_key: "visual_analysis.inspect_frame",
            lane_id: "visual_analysis",
            observation_ref: "ask:lane:visual:shadow-obs",
            observation_summary:
              "visual_analysis.inspect_frame is cataloged on visual_analysis but did not execute; lane output remains non-terminal.",
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-shadow-visual-lane",
              capability_key: "visual_analysis.inspect_frame",
              observation_ref: "ask:lane:visual:shadow-obs",
              status: "blocked",
              observation_summary:
                "visual_analysis.inspect_frame is cataloged on visual_analysis but did not execute; lane output remains non-terminal.",
              backend_selection_decision: {
                schema: "helix.capability_lane.backend_selection_decision.v1",
                lane_id: "visual_analysis",
                outcome: "requested_selected",
                requested_backend_provider: "openai_compatible",
                selected_backend_provider: "visual_analysis.openai_compatible",
                fallback_backend_provider: null,
                selected_runtime_provider_remains_root: true,
                live_backend_execution_enabled: false,
                terminal_authority_owner: "helix",
                terminal_eligible: false,
                assistant_answer: false,
              },
              state_delta: {
                capability_lane_shadow_execution: {
                  lane_id: "visual_analysis",
                  capability: "visual_analysis.inspect_frame",
                  requested_backend_provider: "openai_compatible",
                  selected_backend_provider: "visual_analysis.openai_compatible",
                  availability_status: "dry_run",
                  permission_status: "admitted",
                  cost_class: "standard",
                  latency_class: "interactive",
                  privacy_class: "external_provider",
                  fallback_backend_provider: null,
                  execution_status: "not_executed_shadow_only",
                  terminal_eligible: false,
                  assistant_answer: false,
                  reentry_required: true,
                },
              },
              terminal_eligible: false,
              assistant_answer: false,
            },
          },
        ],
      },
    };

    const rows = buildHelixTurnTranscriptRows(reply);
    const summary = buildHelixAskRuntimeTurnSummary(reply);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta} ${row.status}`).join("\n");
    expect(combined).toContain("visual_analysis.inspect_frame");
    expect(combined).toContain("backend visual_analysis.openai_compatible");
    expect(combined).toContain("requested backend openai_compatible");
    expect(combined).toContain("execution not_executed_shadow_only");
    expect(combined).toContain("availability dry_run");
    expect(combined).toContain("permission admitted");
    expect(combined).toContain("cost standard");
    expect(combined).toContain("latency interactive");
    expect(combined).toContain("privacy external_provider");
    expect(combined).toContain("decision requested_selected");
    expect(combined).toContain("runtime root preserved");
    expect(combined).toContain("no live backend execution");
    expect(combined).toContain("terminal authority helix");
    expect(combined).toContain("lane output remains observation-only");

    expect(rows.find((row) => row.label === "Lane Observation")).toMatchObject({
      role: "tool",
      status: "failed",
    });

    const laneProjection = summary?.rows.find((row) => row.key === "lane_projection")?.value ?? "";
    expect(laneProjection).toContain("visual_analysis.inspect_frame");
    expect(laneProjection).toContain("backend visual_analysis.openai_compatible");
    expect(laneProjection).toContain("requested backend openai_compatible");
    expect(laneProjection).toContain("execution not_executed_shadow_only");
    expect(laneProjection).toContain("availability dry_run");
    expect(laneProjection).toContain("permission admitted");
    expect(laneProjection).toContain("cost standard");
    expect(laneProjection).toContain("latency interactive");
    expect(laneProjection).toContain("privacy external_provider");
    expect(laneProjection).toContain("decision requested_selected");
    expect(laneProjection).toContain("terminal authority helix");
    expect(laneProjection).toContain("observation-only");
  });

  it("projects compound docs-to-narrator itinerary status from structured gateway state", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-compound-read-aloud",
      turn_id: "turn-codex-compound-read-aloud",
      debug: {
        turn_id: "turn-codex-compound-read-aloud",
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "docs.search",
            mode: "read",
            gateway_admission: {
              requested_capability: "docs.search",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_doc_excerpt",
                subgoal_id: "read_aloud_doc_excerpt:docs_excerpt",
              },
            },
            observation: {
              schema: "helix.docs_search_observation.v1",
              compound_dependency_turn_plan: {
                schema: "helix.compound_capability_dependency_turn_plan.v1",
                turn_id: "turn-codex-compound-read-aloud",
                compound_outcomes: ["read_aloud_doc_excerpt"],
                rail_status: "satisfied",
                subgoal_count: 2,
                satisfied_subgoal_count: 2,
                ordered_subgoals: [
                  {
                    subgoal_id: "read_aloud_doc_excerpt:docs_excerpt",
                    requested_capability: "docs.search",
                    executed_capability: "docs.search",
                    satisfied: true,
                  },
                  {
                    subgoal_id: "read_aloud_doc_excerpt:narrator_receipt",
                    requested_capability: "live_env.narrator_say",
                    executed_capability: "live_env.narrator_say",
                    required_receipt_kind: "helix.interim_voice_callout_tool_result.v1",
                    satisfied: true,
                  },
                ],
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-compound-read-aloud",
              capability_key: "docs.search",
              status: "succeeded",
              observation_summary: "docs.search materialized a bounded document excerpt",
            },
          },
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "live_env.narrator_say",
            mode: "act",
            gateway_admission: {
              requested_capability: "live_env.narrator_say",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_doc_excerpt",
                subgoal_id: "read_aloud_doc_excerpt:narrator_receipt",
                depends_on_subgoal_id: "read_aloud_doc_excerpt:docs_excerpt",
              },
            },
            observation: {
              schema: "helix.interim_voice_callout_tool_result.v1",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-compound-read-aloud",
              capability_key: "live_env.narrator_say",
              status: "succeeded",
              observation_summary: "Narrator voice playback request queued",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Tool request: docs.search.");
    expect(combined).toContain("Tool observation: docs.search observed docs.search materialized a bounded document excerpt.");
    expect(combined).toContain("Action request: live_env.narrator_say.");
    expect(combined).toContain("Action observation: live_env.narrator_say observed Narrator voice playback request queued.");
    expect(combined).toContain("Itinerary: Compound itinerary: read_aloud_doc_excerpt satisfied with 2/2 subgoals satisfied.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
  });

  it("projects readable surface observation and narrator receipt trace rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-readable-surface",
      turn_id: "turn-codex-readable-surface",
      content: "I read the visible section aloud.",
      debug: {
        turn_id: "turn-codex-readable-surface",
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "docs-viewer.read_visible_surface",
            mode: "read",
            gateway_admission: {
              requested_capability: "docs-viewer.read_visible_surface",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_surface",
                subgoal_id: "read_aloud_surface:surface_observation",
              },
            },
            observation: {
              schema: "helix.workstation_readable_surface_observation.v1",
              status: "succeeded",
              text: "Visible section text.",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
              compound_dependency_turn_plan: {
                schema: "helix.compound_capability_dependency_turn_plan.v1",
                turn_id: "turn-codex-readable-surface",
                compound_outcomes: ["read_aloud_surface"],
                rail_status: "satisfied",
                subgoal_count: 2,
                satisfied_subgoal_count: 2,
                ordered_subgoals: [
                  {
                    subgoal_id: "read_aloud_surface:surface_observation",
                    requested_capability: "docs-viewer.read_visible_surface",
                    executed_capability: "docs-viewer.read_visible_surface",
                    required_observation_kind: "helix.workstation_readable_surface_observation.v1",
                    satisfied: true,
                  },
                  {
                    subgoal_id: "read_aloud_surface:narrator_receipt",
                    requested_capability: "live_env.narrator_say",
                    executed_capability: "live_env.narrator_say",
                    required_receipt_kind: "helix.interim_voice_callout_tool_result.v1",
                    satisfied: true,
                  },
                ],
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-readable-surface",
              capability_key: "docs-viewer.read_visible_surface",
              status: "succeeded",
              observation_summary: "docs-viewer.read_visible_surface observed bounded visible document surface",
            },
          },
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "live_env.narrator_say",
            mode: "act",
            gateway_admission: {
              requested_capability: "live_env.narrator_say",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_surface",
                subgoal_id: "read_aloud_surface:narrator_receipt",
                depends_on_subgoal_id: "read_aloud_surface:surface_observation",
                depends_on_capability_id: "docs-viewer.read_visible_surface",
              },
            },
            observation: {
              schema: "helix.interim_voice_callout_tool_result.v1",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-readable-surface",
              capability_key: "live_env.narrator_say",
              status: "succeeded",
              observation_summary: "Narrator voice playback request queued",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Tool request: docs-viewer.read_visible_surface.");
    expect(combined).toContain(
      "Tool observation: docs-viewer.read_visible_surface observed docs-viewer.read_visible_surface observed bounded visible document surface.",
    );
    expect(combined).toContain("Action request: live_env.narrator_say.");
    expect(combined).toContain("Action observation: live_env.narrator_say observed Narrator voice playback request queued.");
    expect(combined).toContain("Itinerary: Compound itinerary: read_aloud_surface satisfied with 2/2 subgoals satisfied.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).not.toContain("client.read_aloud");
  });

  it("projects blocked compound downstream tools without faking action execution", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-compound-read-aloud-blocked",
      turn_id: "turn-codex-compound-read-aloud-blocked",
      debug: {
        turn_id: "turn-codex-compound-read-aloud-blocked",
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "docs.search",
            mode: "read",
            gateway_admission: {
              requested_capability: "docs.search",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_doc_excerpt",
                subgoal_id: "read_aloud_doc_excerpt:docs_excerpt",
              },
            },
            observation: {
              schema: "helix.docs_search_observation.v1",
              hit_count: 0,
              compound_dependency_turn_plan: {
                schema: "helix.compound_capability_dependency_turn_plan.v1",
                turn_id: "turn-codex-compound-read-aloud-blocked",
                compound_outcomes: ["read_aloud_doc_excerpt"],
                rail_status: "blocked",
                subgoal_count: 2,
                satisfied_subgoal_count: 1,
                first_broken_rail: {
                  subgoal_id: "read_aloud_doc_excerpt:narrator_receipt",
                  requested_capability: "live_env.narrator_say",
                  rail_status: "blocked_by_dependency",
                  reason: "upstream_docs_excerpt_missing",
                  satisfied: false,
                },
                ordered_subgoals: [
                  {
                    subgoal_id: "read_aloud_doc_excerpt:docs_excerpt",
                    requested_capability: "docs.search",
                    executed_capability: "docs.search",
                    satisfied: true,
                  },
                  {
                    subgoal_id: "read_aloud_doc_excerpt:narrator_receipt",
                    requested_capability: "live_env.narrator_say",
                    executed_capability: null,
                    satisfied: false,
                    rail_status: "blocked_by_dependency",
                  },
                ],
              },
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-compound-read-aloud-blocked",
              capability_key: "docs.search",
              status: "succeeded",
              observation_summary: "docs.search returned no document excerpt",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Tool request: docs.search.");
    expect(combined).toContain(
      "Itinerary: Compound itinerary: read_aloud_doc_excerpt blocked at read_aloud_doc_excerpt:narrator_receipt (live_env.narrator_say): upstream_docs_excerpt_missing.",
    );
    expect(combined).not.toContain("Action request: live_env.narrator_say.");
    expect(combined).not.toContain("Action observation: live_env.narrator_say");
  });

  it("does not create gateway observations from final prose alone", () => {
    const events = buildHelixWorkstationGatewayTranscriptEvents({
      id: "reply-prose-only",
      content: "Observed expression: 8*9\nResult: 72",
      debug: {
        turn_id: "turn-prose-only",
        agent_runtime: "codex",
      },
    });

    expect(events).toEqual([]);
  });

  it("keeps no-observation gateway turns as failed observations without model re-entry success", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-no-observation",
      debug: {
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            ok: false,
            capability_id: "scientific-calculator.solve_expression",
            mode: "read",
            error: "calculator_gateway_solve_observation_missing",
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              admission_status: "blocked",
              blocked_reason: "calculator_gateway_solve_observation_missing",
            },
            observation_packet: {
              capability_key: "scientific-calculator.solve_expression",
              status: "blocked",
              observation_summary: "calculator_gateway_solve_observation_missing",
            },
          },
        ],
      },
    });

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(combined).toContain("Tool observation: scientific-calculator.solve_expression blocked calculator_gateway_solve_observation_missing.");
    expect(combined).toContain("failed");
    expect(combined).not.toContain("Codex received the workstation observation packet");
  });
});
