import { beforeEach, describe, expect, it } from "vitest";
import {
  beginHelixAskLiveRuntimeClientDebugAttempt,
  mergeHelixAskLiveRuntimeClientDebugIntoExport,
  readHelixAskLiveRuntimeClientDebugSnapshot,
  recordHelixAskLiveRuntimeClientDebugEvent,
  recordHelixAskLiveRuntimeCompletedOutputTranscript,
  recordHelixAskLiveRuntimeServerStagePlayDebug,
  recordHelixAskLiveRuntimeStagePlayHandoff,
  recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement,
  recordHelixAskLiveRuntimeVisualFrameReceipt,
  resetHelixAskLiveRuntimeClientDebugStateForTests,
} from "@/components/helix/ask-console/HelixAskLiveRuntimeDebugState";
import {
  HELIX_DEBUG_EXPORT_MAX_UI_CHARS,
  boundHelixDebugExportTextForUi,
} from "@/components/helix/ask-console/HelixAskDebugExportSizeControl";

describe("Helix Ask live runtime client debug state", () => {
  beforeEach(resetHelixAskLiveRuntimeClientDebugStateForTests);

  it("distinguishes provider audio, remote track, muted playback, and unmuted speaker evidence", () => {
    beginHelixAskLiveRuntimeClientDebugAttempt({
      attemptRef: "receipt:live-runtime:consent:test",
      runtimeAgentMode: "live_voice",
      runtimeAgentAuthority: "observe_only",
      observedAtMs: 100,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "server_session_admitted",
      realtimeSessionId: "realtime:test",
      selectedModelOrService: "gpt-realtime-2.1",
      observedAtMs: 110,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "microphone_tracks_observed",
      realtimeSessionId: "realtime:test",
      microphoneTrackCount: 1,
      microphoneLiveTrackCount: 1,
      microphoneEnabledTrackCount: 1,
      microphoneMutedTrackCount: 0,
      microphoneDeviceLabel: "USB Microphone",
      microphoneLoopbackSource: false,
      observedAtMs: 115,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "microphone_enabled",
      realtimeSessionId: "realtime:test",
      observedAtMs: 115.5,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "data_channel_opened",
      realtimeSessionId: "realtime:test",
      observedAtMs: 116,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "initial_audio_probe_requested",
      realtimeSessionId: "realtime:test",
      observedAtMs: 117,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "remote_audio_track_attached",
      realtimeSessionId: "realtime:test",
      remoteTrackSource: "stream",
      remoteAudioMuted: true,
      audioFocusGranted: false,
      observedAtMs: 120,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "remote_audio_playback_started",
      realtimeSessionId: "realtime:test",
      remoteAudioMuted: true,
      audioFocusGranted: false,
      observedAtMs: 130,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "provider_event_received",
      realtimeSessionId: "realtime:test",
      providerEventType: "output_audio_buffer.started",
      observedAtMs: 140,
    });

    expect(readHelixAskLiveRuntimeClientDebugSnapshot()).toMatchObject({
      realtime_session_id: "realtime:test",
      voice_lane_required: false,
      microphone_track_count: 1,
      microphone_live_track_count: 1,
      microphone_enabled_track_count: 1,
      microphone_muted_track_count: 0,
      microphone_device_label: "USB Microphone",
      microphone_loopback_source: false,
      microphone_input_enabled: true,
      data_channel_state: "open",
      initial_audio_probe_requested: true,
      initial_audio_probe_error: null,
      provider_audio_event_observed: true,
      remote_audio_track_received: true,
      browser_playback_status: "started_muted",
      audio_focus_granted: false,
      speaker_trigger_evidence: "browser_play_resolved_muted",
      hardware_audio_output_confirmed: false,
    });

    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "remote_audio_playback_started",
      realtimeSessionId: "realtime:test",
      remoteAudioMuted: false,
      audioFocusGranted: true,
      observedAtMs: 150,
    });
    const exported = JSON.parse(mergeHelixAskLiveRuntimeClientDebugIntoExport(JSON.stringify({
      active_turn_id: "ask:selected-answer",
      selected_final_answer: "Existing answer remains authoritative.",
    })));
    expect(exported.realtime_live_client_debug).toMatchObject({
      realtime_session_id: "realtime:test",
      speaker_trigger_evidence: "provider_audio_and_browser_play_unmuted",
      selected_answer_turn_id: "ask:selected-answer",
      turn_binding: "ambient_live_runtime_session_not_bound_to_selected_answer",
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(exported.selected_final_answer).toBe("Existing answer remains authoritative.");

    const oversized = mergeHelixAskLiveRuntimeClientDebugIntoExport(JSON.stringify({
      active_turn_id: "ask:selected-answer",
      giant_debug_blob: "x".repeat(HELIX_DEBUG_EXPORT_MAX_UI_CHARS + 1000),
    }));
    expect(JSON.parse(boundHelixDebugExportTextForUi(oversized))).toMatchObject({
      realtime_live_client_debug: {
        realtime_session_id: "realtime:test",
        speaker_trigger_evidence: "provider_audio_and_browser_play_unmuted",
        terminal_eligible: false,
      },
    });
  });

  it("does not modify answer debug before a live runtime attempt", () => {
    const payload = JSON.stringify({ active_turn_id: "ask:no-live-attempt" });
    expect(mergeHelixAskLiveRuntimeClientDebugIntoExport(payload)).toBe(payload);
  });

  it("attaches sanitized visual-frame transport evidence without raw pixels or answer authority", () => {
    beginHelixAskLiveRuntimeClientDebugAttempt({
      attemptRef: "receipt:live-runtime:visual:test",
      runtimeAgentMode: "live_voice",
      runtimeAgentAuthority: "observe_only",
      observedAtMs: 100,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "visual_input_enabled",
      realtimeSessionId: "realtime:visual:test",
      observedAtMs: 105,
    });
    recordHelixAskLiveRuntimeVisualFrameReceipt({
      schema: "helix.ask.live_runtime.visual_frame_receipt.v1",
      ok: true,
      status: "sent",
      code: "visual_frame_sent",
      observed_at_ms: 110,
      source_kind: "screen",
      source_label: "Selected visual frame",
      detail: "auto",
      media_type: "image/jpeg",
      frame_size_bytes: 3,
      event_id: "visual-frame-event:test",
      item_id: "visual-frame-item:test",
      pruned_item_id: null,
      retained_item_count: 1,
      conversation_item_create_sent: true,
      conversation_item_delete_sent: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      reentry_required: true,
    }, "manual_promotion");
    recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement({
      schema: "helix.ask.realtime.visual_frame_provider_ack.v1",
      status: "provider_item_added",
      item_id: "visual-frame-item:test",
      client_event_id: "visual-frame-event:test",
      provider_event_id: "provider-event:visual-added",
      provider_event_type: "conversation.item.added",
      route_kind: "manual_promotion",
      provider_error_code: null,
      observed_at_ms: 115,
      first_provider_acknowledgement: true,
      provider_image_content_observed: true,
      first_provider_image_context_confirmation: true,
      model_context_evidence: "provider_conversation_item_with_input_image",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });

    const exportedText = mergeHelixAskLiveRuntimeClientDebugIntoExport(JSON.stringify({
      active_turn_id: "ask:selected-answer",
    }));
    const debug = JSON.parse(exportedText).realtime_live_client_debug;
    expect(debug).toMatchObject({
      visual_input_enabled: true,
      visual_frame_attempt_count: 1,
      visual_frame_sent_count: 1,
      visual_frame_provider_acknowledged_count: 1,
      visual_frame_provider_image_confirmed_count: 1,
      visual_frame_automatic_sent_count: 0,
      visual_frame_manual_sent_count: 1,
      visual_frame_automatic_provider_acknowledged_count: 0,
      visual_frame_manual_provider_acknowledged_count: 1,
      visual_frame_automatic_provider_image_confirmed_count: 0,
      visual_frame_manual_provider_image_confirmed_count: 1,
      visual_frame_blocked_count: 0,
      visual_frame_error_count: 0,
      latest_visual_frame_receipt: {
        code: "visual_frame_sent",
        frame_size_bytes: 3,
        item_id: "visual-frame-item:test",
        raw_content_included: false,
        answer_authority: false,
        terminal_eligible: false,
      },
      latest_visual_frame_provider_acknowledgement: {
        status: "provider_item_added",
        route_kind: "manual_promotion",
        item_id: "visual-frame-item:test",
        provider_event_id: "provider-event:visual-added",
        model_context_evidence: "provider_conversation_item_with_input_image",
        answer_authority: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      visual_input_proof: {
        schema: "helix.ask.live_vision.proof.v1",
        status: "provider_image_context_confirmed",
        automatic_capture: {
          status: "not_observed",
        },
        manual_promotion: {
          status: "provider_image_context_confirmed",
        },
        automatic_capture_transport_ready: false,
        manual_promotion_transport_ready: true,
        semantic_marker_test_required: true,
        semantic_model_use_confirmed: false,
        answer_authority: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    expect(exportedText).not.toContain("data:image/");
  });

  it("binds a server-issued handoff and grounded feedback to the selected answer", () => {
    beginHelixAskLiveRuntimeClientDebugAttempt({
      attemptRef: "receipt:live-runtime:consent:binding",
      runtimeAgentMode: "live_voice",
      runtimeAgentAuthority: "observe_only",
      observedAtMs: 100,
    });
    recordHelixAskLiveRuntimeClientDebugEvent({
      eventKind: "server_session_admitted",
      realtimeSessionId: "realtime:binding",
      observedAtMs: 110,
    });
    recordHelixAskLiveRuntimeStagePlayHandoff({
      handoff: {
        schema: "helix.realtime_stage_play.ask_handoff.v1",
        handoff_id: "handoff:binding",
        realtime_session_id: "realtime:binding",
        thread_id: "helix-ask:desktop",
        provider_event_ref: "provider-event:binding",
        transcript_observation_ref: "obs:binding",
        stage_play_event_ref: "stage-event:binding",
        context_pack_id: "context-pack:binding",
        context_hash: "sha256:binding",
        transcript_text_hash: "sha256:transcript",
        transcript_text_char_count: 20,
        goal_id: null,
        runtime_goal_session_ref: null,
        runtime_agent_provider: null,
        required_grounding_capability_ids: [],
        worker_admission: {
          schema: "helix.realtime_worker_admission.v2",
          admission_id: "realtime-worker-admission:binding",
          handoff_id: "handoff:binding",
          realtime_session_id: "realtime:binding",
          thread_id: "helix-ask:desktop",
          decision_phase: "transcript_handoff",
          outcome: "conversation_local",
          interaction_mode: "conversation_local",
          reason_codes: ["intent_conversation_local"],
          selected_primary_intent: "conversation_local",
          selected_route: null,
          selected_runtime_agent_provider: null,
          selected_model: null,
          candidate_readonly_capability_ids: [],
          observed_readonly_capability_ids: [],
          action_candidate_capability_ids: [],
          dispatch: {
            schema: "helix.realtime_worker_dispatch.v2",
            kind: "none",
            state: "not_required",
            requested: false,
            completed: false,
            target_runtime_agent_provider: null,
            runtime_selection_source: "none",
            goal_id: null,
            runtime_goal_session_ref: null,
            suppress_parallel_ask_turn: false,
            read_only: true,
            workstation_action_execution_allowed: false,
            realtime_provider_tool_execution_allowed: false,
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
          worker_turn_dispatched: false,
          spoken_relay_eligible: false,
          workstation_action_execution_allowed: false,
          realtime_provider_tool_execution_allowed: false,
          evidence_refs: ["obs:binding"],
          decided_at_ms: 120,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
        created_at_ms: 120,
        route_metadata: {},
        read_only: true,
        transcript_is_user_intent_after_admission: true,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      observedAtMs: 120,
    });
    recordHelixAskLiveRuntimeCompletedOutputTranscript({
      schema: "helix.ask.realtime.completed_output_transcript.v1",
      capture_source: "browser_data_channel",
      capture_status: "captured",
      completed_event_ref: "event:transcript:conversation-local",
      provider_event_type: "response.output_audio_transcript.done",
      provider_response_ref: "response:conversation-local",
      provider_item_ref: "item:conversation-local",
      provider_content_index: 0,
      helix_response_purpose: null,
      helix_provisional_response_id: null,
      helix_handoff_id: null,
      helix_worker_admission_id: null,
      helix_utterance_code: null,
      correlation_source: null,
      transcript_text_hash: "sha256:conversation-local",
      transcript_text_char_count: 24,
      sanitized_transcript_text: "A conversational response.",
      sanitized_transcript_char_count: 24,
      sanitized_transcript_included: true,
      transcript_redacted: false,
      transcript_truncated: false,
      transcript_delta_count: 2,
      transcript_accumulator_truncated: false,
      observed_at_ms: 125,
      provider_payload_included: false,
      raw_provider_metadata_included: false,
      output_audio_transcript_deltas_included: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    recordHelixAskLiveRuntimeCompletedOutputTranscript({
      schema: "helix.ask.realtime.completed_output_transcript.v1",
      capture_source: "browser_data_channel",
      capture_status: "captured",
      completed_event_ref: "event:transcript:grounded",
      provider_event_type: "response.output_audio_transcript.done",
      provider_response_ref: "response:grounded:selected-answer",
      provider_item_ref: "item:grounded",
      provider_content_index: 0,
      helix_response_purpose: null,
      helix_provisional_response_id: null,
      helix_handoff_id: null,
      helix_worker_admission_id: null,
      helix_utterance_code: null,
      correlation_source: null,
      transcript_text_hash: "sha256:spoken-grounded-answer",
      transcript_text_char_count: 38,
      sanitized_transcript_text: "Account & Sessions is the active panel.",
      sanitized_transcript_char_count: 38,
      sanitized_transcript_included: true,
      transcript_redacted: false,
      transcript_truncated: false,
      transcript_delta_count: 3,
      transcript_accumulator_truncated: false,
      observed_at_ms: 126,
      provider_payload_included: false,
      raw_provider_metadata_included: false,
      output_audio_transcript_deltas_included: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    recordHelixAskLiveRuntimeServerStagePlayDebug({
      schema: "helix.realtime_stage_play.debug.v1",
      realtime_session_id: "realtime:binding",
      thread_id: "helix-ask:desktop",
      bound_goal_id: null,
      bound_runtime_session_ref: null,
      bound_runtime_agent_provider: null,
      provider_call_ref: "openai-realtime:call:hash",
      handoffs: [{
        handoff_id: "handoff:binding",
        provider_event_ref: "provider-event:binding",
        transcript_observation_ref: "obs:binding",
        stage_play_event_ref: "stage-event:binding",
        context_pack_id: "context-pack:binding",
        context_hash: "sha256:binding",
        goal_id: null,
        runtime_goal_session_ref: null,
        runtime_agent_provider: null,
        required_grounding_capability_ids: [],
        created_at_ms: 120,
        grounded_answer: {
          feedback_id: "feedback:binding",
          handoff_id: "handoff:binding",
          realtime_session_id: "realtime:binding",
          thread_id: "helix-ask:desktop",
          goal_id: null,
          ask_turn_id: "ask:selected-answer",
          stage_play_event_ref: "stage-event:answer",
          answer_text_hash: "sha256:answer",
          answer_text_char_count: 42,
          final_answer_source: "final_answer_draft",
          terminal_artifact_kind: "model_synthesized_answer",
          evidence_refs: ["evidence:1"],
          required_grounding_capability_ids: [],
          grounding_evidence_satisfied: true,
          recorded_at_ms: 130,
          completed_solver_path: true,
          server_authoritative: true,
          assistant_answer: false,
          raw_content_included: false,
        },
        grounded_relay: {
          schema: "helix.realtime_grounded_relay.v1",
          relay_id: "relay:binding",
          handoff_id: "handoff:binding",
          feedback_id: "feedback:binding",
          ask_turn_id: "ask:selected-answer",
          status: "delivered",
          answer_projection_hash: "sha256:answer-projection",
          provider_response_ref: "response:grounded:selected-answer",
          playback_receipt_ref: "receipt:playback:binding",
        },
      }, {
        handoff_id: "handoff:in-progress",
        grounded_answer: {
          feedback_id: "feedback:in-progress",
          ask_turn_id: "ask:in-progress",
        },
        grounded_relay: {
          schema: "helix.realtime_grounded_relay.v1",
          relay_id: "relay:in-progress",
          handoff_id: "handoff:in-progress",
          feedback_id: "feedback:in-progress",
          ask_turn_id: "ask:in-progress",
          status: "speaking",
          provider_response_ref: "response:grounded:in-progress",
          playback_receipt_ref: "receipt:playback-started:in-progress",
        },
      }],
      latest_context_sync: null,
      authority: {
        realtime_answer_authority: false,
        workstation_action_authority: false,
        terminal_answer_authority: false,
        grounded_answer_requires_completed_solver_path: true,
        grounded_answer_requires_route_evidence: true,
      },
      provider_call_id_included: false,
      provider_payload_included: false,
      raw_content_included: false,
    });

    const exported = JSON.parse(mergeHelixAskLiveRuntimeClientDebugIntoExport(JSON.stringify({
      active_turn_id: "ask:selected-answer",
    })));
    expect(exported.realtime_live_client_debug).toMatchObject({
      latest_stage_play_handoff: { handoff_id: "handoff:binding" },
      selected_answer_grounded_feedback_id: "feedback:binding",
      completed_output_transcript_count: 2,
      latest_completed_output_transcript: {
        provider_response_ref: "response:grounded:selected-answer",
        sanitized_transcript_text: "Account & Sessions is the active panel.",
        ask_turn_binding_status: "grounded_relay_bound_to_selected_answer",
        grounded_relay_id: "relay:binding",
        grounded_relay_playback_confirmed: true,
        provider_payload_included: false,
        output_audio_transcript_deltas_included: false,
        raw_content_included: false,
      },
      selected_answer_spoken_output_binding: "provider_response_bound_to_selected_answer",
      selected_answer_spoken_output_provider_response_ref:
        "response:grounded:selected-answer",
      selected_answer_spoken_output_transcript_hash: "sha256:spoken-grounded-answer",
      selected_answer_spoken_output_playback_confirmed: true,
      turn_binding: "server_stage_play_handoff_bound_to_selected_answer",
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(exported.realtime_live_client_debug.completed_output_transcripts[0]).toMatchObject({
      provider_response_ref: "response:conversation-local",
      ask_turn_binding_status: "no_grounded_relay_match",
      binding_source: "none",
    });

    const inProgressExport = JSON.parse(
      mergeHelixAskLiveRuntimeClientDebugIntoExport(JSON.stringify({
        active_turn_id: "ask:in-progress",
      })),
    );
    expect(inProgressExport.realtime_live_client_debug).toMatchObject({
      selected_answer_grounded_feedback_id: "feedback:in-progress",
      selected_answer_spoken_output_binding:
        "provider_response_in_progress_for_selected_answer",
      selected_answer_spoken_output_provider_response_ref:
        "response:grounded:in-progress",
      selected_answer_spoken_output_relay_status: "speaking",
      selected_answer_spoken_output_playback_confirmed: false,
    });
  });
});
