import { describe, expect, it } from "vitest";

import {
  buildVoiceClientDebugProjectionFields,
  buildVoicePlaybackReceiptBarrierDebug,
  buildVoicePlaybackReconciliationDebug,
  resolveVoiceTimelineClientBuildStamp,
  sanitizeVoiceDiagnosticsForExport,
  summarizeVoiceSegments,
} from "@/lib/helix/ask-voice-diagnostics-export";
import type { VoiceCaptureDiagnosticsSnapshot } from "@/lib/helix/voice-capture-diagnostics";

describe("ask-voice-diagnostics-export", () => {
  it("resolves client build stamps from browser stamp and dev mode inputs", () => {
    expect(resolveVoiceTimelineClientBuildStamp({ stampedBuild: "  build-123  ", isDev: false, hasWindow: true })).toBe(
      "build-123",
    );
    expect(resolveVoiceTimelineClientBuildStamp({ stampedBuild: "", isDev: true, hasWindow: true })).toBe("dev");
    expect(resolveVoiceTimelineClientBuildStamp({ stampedBuild: null, isDev: false, hasWindow: true })).toBe("prod");
    expect(resolveVoiceTimelineClientBuildStamp({ stampedBuild: "build-123", isDev: true, hasWindow: false })).toBe(
      "unknown",
    );
  });

  it("summarizes segment dispatch and STT status counts", () => {
    expect(summarizeVoiceSegments(undefined)).toEqual({
      total: 0,
      dispatchCompleted: 0,
      dispatchQueued: 0,
      dispatchSuppressed: 0,
      sttErrors: 0,
    });
    expect(summarizeVoiceSegments([
      { id: "a", cutAtMs: 1, durationMs: 10, status: "stt_ok", sttLatencyMs: 2, transcriptPreview: "ok", translated: false, dispatch: "completed", engine: "x", error: null },
      { id: "b", cutAtMs: 2, durationMs: 10, status: "stt_error", sttLatencyMs: null, transcriptPreview: null, translated: false, dispatch: "suppressed", engine: "x", error: "bad" },
      { id: "c", cutAtMs: 3, durationMs: 10, status: "transcribing", sttLatencyMs: null, transcriptPreview: null, translated: false, dispatch: "queued", engine: null, error: null },
    ])).toEqual({
      total: 3,
      dispatchCompleted: 1,
      dispatchQueued: 1,
      dispatchSuppressed: 1,
      sttErrors: 1,
    });
  });

  it("sanitizes voice diagnostics into bounded export fields", () => {
    const snapshot = {
      updatedAtMs: 123,
      micArmState: "on",
      voiceInputState: "listening",
      voiceSignalState: "speech",
      warnings: ["loopback_source"],
      voiceMonitorLevel: 0.123456789,
      voiceMonitorThreshold: 0.012345678,
      rmsDb: -42.12345,
      chunksPerSecond: 3.45678,
      lastRoundtripMs: 55,
      segments: [],
      playback: null,
      playbackOutput: {
        expectedPath: "audio_graph",
        currentUtterancePath: "direct_element",
        currentUtteranceDirectFallback: false,
        graphBypassActive: false,
        graphFailureStreak: 1,
        fallbackCount: 2,
        lastFallbackReason: "NotAllowedError",
        audioUnlocked: true,
        audioGraphAttached: false,
      },
      playbackReceipts: Array.from({ length: 82 }, (_, index) => ({
        schema: "helix.voice.playback_receipt.v1",
        receiptId: `receipt:${index}`,
        sourceReceiptId: null,
        sourceReceiptKey: null,
        requestId: `request:${index}`,
        calloutKind: null,
        utteranceId: `utt:${index}`,
        turnKey: "turn",
        kind: "final_answer",
        status: "ended",
        atMs: index,
        providerHeader: null,
        profileHeader: null,
        cacheHitCount: 0,
        cacheMissCount: 1,
        totalPlaybackMs: 10,
        cancelReason: null,
        error: null,
        audioUnlocked: true,
        playbackPath: "direct_element",
      })),
      voiceCalls: [],
      timelineEvents: Array.from({ length: 162 }, (_, index) => ({
        id: `event:${index}`,
        atMs: index,
        source: "voice",
        kind: "chunk",
        status: "ok",
        traceId: "trace",
        turnKey: "turn",
        attemptId: null,
        utteranceId: null,
        utteranceAuthority: null,
        utteranceSource: null,
        replyId: null,
        detail: null,
        text: null,
        debugContext: null,
      })),
    } as unknown as VoiceCaptureDiagnosticsSnapshot;

    const exportPayload = sanitizeVoiceDiagnosticsForExport(snapshot) as Record<string, any>;
    expect(exportPayload.monitor).toEqual({
      level: 0.123457,
      threshold: 0.012346,
      rmsDb: -42.123,
      chunksPerSecond: 3.457,
      lastRoundtripMs: 55,
    });
    expect(exportPayload.playbackReceipts).toHaveLength(80);
    expect(exportPayload.playbackReceipts[0]).toMatchObject({
      receiptId: "receipt:2",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "playback_observation",
    });
    expect(exportPayload.voiceAuthorityDebug).toMatchObject({
      schema: "helix.voice_authority_debug_summary.v1",
      voice_input_capture: {
        mic_armed: true,
        mic_arm_state: "on",
        voice_input_state: "listening",
        voice_signal_state: "speech",
        observation_role: "input_capture_observation",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      voice_output_playback: {
        output_path_expected: "audio_graph",
        current_utterance_path: "direct_element",
        audio_unlocked: true,
        audio_graph_attached: false,
        observation_role: "output_playback_observation",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      tool_admission: {
        handoff_event_count: 0,
        observation_role: "tool_admission_projection",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      playback_receipt: {
        receipt_count: 82,
        latest_receipt_id: "receipt:81",
        latest_status: "ended",
        observation_role: "playback_receipt_observation",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      terminal_answer_authority: {
        receipts_are_answers: false,
        playback_claim_requires_client_receipt: true,
        final_answer_may_report_receipt_only: true,
        terminal_authority_owner: "completed_solver_path",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "voice_debug_projection",
    });
    expect(exportPayload.timelineEvents).toHaveLength(160);
    expect(exportPayload.timelineEvents[0].id).toBe("event:2");
  });

  it("returns null for missing diagnostics snapshots", () => {
    expect(sanitizeVoiceDiagnosticsForExport(null)).toBeNull();
  });

  it("builds client debug projection fields with voice authority separation", () => {
    const projection = buildVoiceClientDebugProjectionFields({
      nowMs: 999,
      localPayload: {
        exportedAtMs: 123,
        client_voice_debug: {
          voiceAuthorityDebug: {
            schema: "helix.voice_authority_debug_summary.v1",
            voice_input_capture: { observation_role: "input_capture_observation" },
            voice_output_playback: { observation_role: "output_playback_observation" },
            tool_admission: { observation_role: "tool_admission_projection" },
            playback_receipt: { observation_role: "playback_receipt_observation" },
            terminal_answer_authority: { receipts_are_answers: false },
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
          playbackReceipts: [
            {
              receiptId: "receipt-1",
              status: "delivered",
            },
          ],
          playbackOutput: {
            expectedPath: "direct_element",
          },
          playback: {
            utteranceId: "utt-1",
          },
          voiceCalls: [
            {
              id: "call-1",
              kind: "speak",
            },
          ],
        },
        unified_timeline: [
          { channel: "voice_timeline", id: "voice-row" },
          { channel: "voice_call", id: "call-row" },
          { channel: "voice_playback_receipt", id: "receipt-row" },
          { channel: "ask_live", id: "ask-row" },
        ],
      },
    });

    expect(projection).toMatchObject({
      schema: "helix.client_debug_projection.v1",
      source: "browser_runtime",
      captured_at_ms: 123,
      voice_authority_debug: {
        schema: "helix.voice_authority_debug_summary.v1",
        voice_input_capture: { observation_role: "input_capture_observation" },
        voice_output_playback: { observation_role: "output_playback_observation" },
        tool_admission: { observation_role: "tool_admission_projection" },
        playback_receipt: { observation_role: "playback_receipt_observation" },
        terminal_answer_authority: { receipts_are_answers: false },
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      voice_playback_receipts: [{ receiptId: "receipt-1", status: "delivered" }],
      voice_playback_output: { expectedPath: "direct_element" },
      voice_playback_metrics: { utteranceId: "utt-1" },
      voice_calls: [{ id: "call-1", kind: "speak" }],
      unified_timeline_voice_rows: [
        { channel: "voice_timeline", id: "voice-row" },
        { channel: "voice_call", id: "call-row" },
        { channel: "voice_playback_receipt", id: "receipt-row" },
      ],
    });
  });

  it("builds playback reconciliation from client receipts without mutating terminal answer", () => {
    expect(
      buildVoicePlaybackReconciliationDebug({
        activeTurnId: "turn-1",
        selectedFinalAnswer: "Browser playback confirmation is still pending.",
        source: {
          client_voice_playback_receipts: [
            {
              receiptId: "receipt-1",
              utteranceId: "utt-turn-1",
              turnKey: "turn-1",
              status: "queued",
            },
            {
              receiptId: "receipt-1",
              utteranceId: "utt-turn-1",
              turnKey: "turn-1",
              status: "delivered",
            },
          ],
          client_voice_calls: [
            {
              id: "call-1",
              utteranceId: "utt-turn-1",
              audioBytes: 512,
            },
          ],
        },
      }),
    ).toEqual({
      schema: "helix.voice_playback_reconciliation.v1",
      source: "client_playback_receipts",
      active_turn_id: "turn-1",
      selected_final_answer_claim: "pending_client_playback",
      playback_confirmation: "delivered",
      delivered_receipt_count: 1,
      delivered_utterance_ids: ["utt-turn-1"],
      audio_bytes_observed: 512,
      corrected_status_text: "Client playback receipt confirms delivered audio after the final answer was composed.",
      terminal_answer_mutated: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "client_playback_observation",
    });
  });

  it("reads nested client projection voice playback records and filters by active turn", () => {
    expect(
      buildVoicePlaybackReconciliationDebug({
        activeTurnId: "turn-2",
        selectedFinalAnswer: "Final answer delivered.",
        source: {
          client_debug_projection: {
            voice: {
              playbackReceipts: [
                {
                  receiptId: "receipt-other",
                  utteranceId: "utt-other",
                  turnKey: "turn-other",
                  status: "delivered",
                },
                {
                  receiptId: "receipt-2",
                  utteranceId: "utt-turn-2",
                  requestId: "turn-2:voice",
                  status: "delivered",
                },
              ],
              voiceCalls: [
                {
                  id: "call-other",
                  utteranceId: "utt-other",
                  audioBytes: 2000,
                },
                {
                  id: "call-2",
                  utteranceId: "utt-turn-2",
                  audioBytes: 300,
                },
              ],
            },
          },
        },
      }),
    ).toMatchObject({
      active_turn_id: "turn-2",
      selected_final_answer_claim: "none",
      playback_confirmation: "delivered",
      delivered_receipt_count: 1,
      delivered_utterance_ids: ["utt-turn-2"],
      audio_bytes_observed: 300,
      corrected_status_text: null,
    });
  });

  it("projects governed text-to-speech receipt barrier from solver tool rails", () => {
    expect(
      buildVoicePlaybackReceiptBarrierDebug({
        activeTurnId: "turn-voice",
        selectedFinalAnswer: "playback_status: queued\nassistant_answer: false\nterminal_eligible: false",
        source: {
          client_voice_playback_receipts: [
            {
              receiptId: "voice-started",
              sourceReceiptId: "turn-voice:workstation_gateway:text_to_speech.speak_text:abc",
              requestId: "turn-voice:voice-request",
              utteranceId: "utt-turn-voice",
              turnKey: "turn-voice",
              status: "queued",
              playback_status: "started",
              source_turn_id: "turn-voice",
              source_text_hash: "sha256:voice-source",
              chunk_index: 0,
              chunk_count: 2,
              position_ms: 0,
              atMs: 100,
            },
            {
              receiptId: "voice-completed",
              sourceReceiptId: "turn-voice:workstation_gateway:text_to_speech.speak_text:abc",
              requestId: "turn-voice:voice-request",
              utteranceId: "utt-turn-voice",
              turnKey: "turn-voice",
              status: "delivered",
              playback_status: "completed",
              source_turn_id: "turn-voice",
              source_text_hash: "sha256:voice-source",
              chunk_index: 1,
              chunk_count: 2,
              position_ms: 1200,
              atMs: 160,
            },
          ],
          ask_turn_solver_trace: {
            capability_result: {
              requested_capability: "text_to_speech.speak_text",
              executed_capability: "text_to_speech.speak_text",
              status: "succeeded",
              reentered_solver: true,
              observation_refs: ["turn-voice:workstation_gateway:text_to_speech.speak_text:abc"],
            },
          },
          tool_turn_chain_audit: {
            requested_capability: "text_to_speech.speak_text",
            executed_capability: "text_to_speech.speak_text",
            reentry_executed: true,
          },
        },
      }),
    ).toEqual({
      schema: "helix.voice_playback_receipt_barrier.v1",
      source: "agent_provider_gateway_reentry_projection",
      active_turn_id: "turn-voice",
      requested_capability: "text_to_speech.speak_text",
      executed_capability: "text_to_speech.speak_text",
      capability_result_status: "succeeded",
      playback_status: "queued",
      receipt_kind: "helix.interim_voice_callout_tool_result.v1",
      observation_refs: ["turn-voice:workstation_gateway:text_to_speech.speak_text:abc"],
      client_playback_receipt_count: 2,
      latest_client_playback_status: "delivered",
      playback_started: true,
      playback_completed: true,
      playback_failed: false,
      playback_started_at_ms: 100,
      playback_completed_at_ms: 160,
      playback_failed_at_ms: null,
      delivered_utterance_ids: ["utt-turn-voice"],
      delivered_utterance_id: "utt-turn-voice",
      delivered_at_ms: 160,
      client_playback_receipts: [
        {
          receiptId: "voice-started",
          sourceReceiptId: "turn-voice:workstation_gateway:text_to_speech.speak_text:abc",
          requestId: "turn-voice:voice-request",
          utteranceId: "utt-turn-voice",
          status: "queued",
          playback_status: "started",
          source_turn_id: "turn-voice",
          source_text_hash: "sha256:voice-source",
          chunk_index: 0,
          chunk_count: 2,
          position_ms: 0,
          atMs: 100,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          output_authority: "playback_observation",
        },
        {
          receiptId: "voice-completed",
          sourceReceiptId: "turn-voice:workstation_gateway:text_to_speech.speak_text:abc",
          requestId: "turn-voice:voice-request",
          utteranceId: "utt-turn-voice",
          status: "delivered",
          playback_status: "completed",
          source_turn_id: "turn-voice",
          source_text_hash: "sha256:voice-source",
          chunk_index: 1,
          chunk_count: 2,
          position_ms: 1200,
          atMs: 160,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          output_authority: "playback_observation",
        },
      ],
      receipt_observed: true,
      evidence_reentered: true,
      terminal_blockers: [],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "voice_playback_observation",
    });
  });
});
