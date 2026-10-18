import { describe, expect, it } from "vitest";

import {
  buildHelixAskVoicePlaybackLifecycleReceiptInput,
  buildHelixAskVoiceSpeakRequest,
  buildHelixAskVoicePlaybackToolHandoffPlan,
  buildHelixAskVoicePlaybackToolOutputState,
  classifyHelixAskVoiceSpeakJsonResponse,
  executeHelixAskVoicePlaybackToolHandoffPlan,
  recordHelixAskVoicePlaybackToolOutcomeReceipt,
  type HelixAskVoicePlaybackToolOutcomeReceipt,
  type HelixAskVoicePlaybackToolTimelineEvent,
} from "@/components/helix/ask-console/HelixAskVoicePlaybackToolController";
import type { VoicePlaybackOutcomeReceipt } from "@/lib/helix/voice-capture-diagnostics";
import type { VoicePlaybackLifecycleReceiptStatus } from "@/lib/helix/voice-capture-diagnostics";

function ttsHandoff(overrides: {
  allowMicOffPlayback?: boolean;
  voicePlaybackKind?: string;
  reasonCodes?: string[];
} = {}) {
  return {
    schema: "helix.interim_voice_callout_tool_result.v1",
    request: {
      kind: "tool_result",
      authority: "provisional",
      text: "La navegacion esta lista.",
      turnId: "turn-tts",
      requestId: "request-tts",
      voicePlaybackKind: overrides.voicePlaybackKind ?? "translation_relay",
      reasonCodes: overrides.reasonCodes ?? ["capability_lane_text_to_speech_speak_text"],
      allowMicOffPlayback: overrides.allowMicOffPlayback,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    receipt: {
      status: "awaiting_client_playback",
      receiptId: "receipt-tts",
      delivery: { utteranceId: "interim_voice:tts" },
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
  };
}

describe("HelixAskVoicePlaybackToolController", () => {
  it("builds manual read-aloud as a governed voice speak request, not a legacy browser fallback", () => {
    expect(buildHelixAskVoiceSpeakRequest({
      text: "Read this final answer.",
      provider: "elevenlabs",
      voiceProfileId: "voice-default",
      traceId: "ask:trace",
      missionId: "desktop:mission",
      eventId: "reply-1",
      contextTier: "tier1",
      sessionState: "idle",
      voiceMode: "normal",
      utteranceId: "manual_read_aloud:reply-1",
      chunkKind: "manual_read_aloud",
      turnKey: "manual:reply-1",
    })).toEqual({
      text: "Read this final answer.",
      mode: "briefing",
      priority: "info",
      provider: "elevenlabs",
      voice_profile_id: "voice-default",
      traceId: "ask:trace",
      missionId: "desktop:mission",
      eventId: "reply-1",
      contextTier: "tier1",
      sessionState: "idle",
      voiceMode: "normal",
      utteranceId: "manual_read_aloud:reply-1",
      chunkKind: "manual_read_aloud",
      turnKey: "manual:reply-1",
      deterministic: true,
      textCertainty: "reasoned",
      voiceCertainty: "reasoned",
    });
  });

  it("classifies voice speak JSON responses without exposing dry-run as read-aloud UX state", () => {
    expect(classifyHelixAskVoiceSpeakJsonResponse({
      status: 200,
      payload: { ok: true, dryRun: true },
    })).toEqual({
      stateEvent: "suppressed",
      reason: "voice_proxy_dry_run",
    });

    expect(classifyHelixAskVoiceSpeakJsonResponse({
      status: 200,
      payload: { ok: true, suppressed: true, reason: "voice_unavailable" },
    })).toEqual({
      stateEvent: "error",
      reason: "voice_unavailable",
    });
  });

  it("separates microphone input state from governed TTS output permission", () => {
    expect(buildHelixAskVoicePlaybackToolOutputState({
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
      allowMicOffPlayback: true,
    })).toMatchObject({
      micArmed: false,
      voiceOutputArmed: true,
      outputArmed: true,
    });
  });

  it("does not treat an armed microphone as speaker output permission", () => {
    expect(buildHelixAskVoicePlaybackToolOutputState({
      micArmState: "on",
      voiceMode: "off",
      outputModeEnabled: false,
      allowMicOffPlayback: false,
    })).toMatchObject({
      micArmed: true,
      voiceOutputArmed: false,
      outputArmed: false,
    });
  });

  it("plans governed TTS playback with mic off when the handoff permits mic-off playback", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff()],
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      outputState: {
        micArmed: false,
        voiceOutputArmed: true,
        outputArmed: true,
      },
      playbackIntent: {
        kind: "translation_relay",
        allowMicOffPlayback: true,
      },
      enqueueDebugContext: {
        outputArmed: true,
        allowMicOffPlayback: true,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
  });

  it("plans suppression when neither output mode nor governed mic-off playback is available", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff({
        allowMicOffPlayback: false,
        reasonCodes: ["ordinary_interim_callout"],
      })],
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      outputState: {
        micArmed: false,
        voiceOutputArmed: false,
        outputArmed: false,
      },
      suppressedReason: "voice_output_not_armed:mic=off:mode=off",
    });
  });

  it("plans suppression when only microphone input is armed", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff({
        allowMicOffPlayback: false,
        reasonCodes: ["ordinary_interim_callout"],
      })],
      micArmState: "on",
      voiceMode: "off",
      outputModeEnabled: false,
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      outputState: {
        micArmed: true,
        voiceOutputArmed: false,
        outputArmed: false,
      },
      suppressedReason: "voice_output_not_armed:mic=on:mode=off",
    });
  });

  it("executes governed playback by emitting debug and enqueueing accepted handoffs", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff()],
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
    });
    const events: HelixAskVoicePlaybackToolTimelineEvent[] = [];
    const receipts: HelixAskVoicePlaybackToolOutcomeReceipt[] = [];
    const consumed: string[] = [];

    const accepted = executeHelixAskVoicePlaybackToolHandoffPlan(plan, {
      emitTimelineEvent: (event) => events.push(event),
      recordPlaybackOutcomeReceipt: (receipt) => receipts.push(receipt),
      enqueuePlaybackIntent: (intent) => intent.allowMicOffPlayback === true,
      markHandoffConsumed: (intent) => consumed.push(intent.receiptKey),
    });

    expect(accepted).toBe(1);
    expect(receipts).toEqual([]);
    expect(consumed).toEqual(["interim_voice:tts"]);
    expect(events.map((event) => event.kind)).toEqual([
      "interim_voice_handoff_seen",
      "interim_voice_enqueue_attempted",
    ]);
    expect(events[1]).toMatchObject({
      status: "attempted",
      debugContext: {
        outputArmed: true,
        allowMicOffPlayback: true,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
  });

  it("executes suppression with an auditable receipt when output is not armed", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff({
        allowMicOffPlayback: false,
        reasonCodes: ["ordinary_interim_callout"],
      })],
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
    });
    const events: HelixAskVoicePlaybackToolTimelineEvent[] = [];
    const receipts: HelixAskVoicePlaybackToolOutcomeReceipt[] = [];
    const consumed: string[] = [];

    const accepted = executeHelixAskVoicePlaybackToolHandoffPlan(plan, {
      emitTimelineEvent: (event) => events.push(event),
      recordPlaybackOutcomeReceipt: (receipt) => receipts.push(receipt),
      enqueuePlaybackIntent: () => true,
      markHandoffConsumed: (intent) => consumed.push(intent.receiptKey),
    });

    expect(accepted).toBe(0);
    expect(consumed).toEqual(["interim_voice:tts"]);
    expect(receipts).toEqual([
      expect.objectContaining({
        status: "suppressed",
        utteranceId: "translation_relay:turn-tts:receipt-tts",
        turnKey: "turn-tts",
        kind: "translation_relay",
        sourceReceiptId: "receipt-tts",
        sourceReceiptKey: "interim_voice:tts",
        requestId: "request-tts",
        calloutKind: "tool_result",
        error: "voice_output_not_armed:mic=off:mode=off",
      }),
    ]);
    expect(events.map((event) => event.kind)).toEqual([
      "interim_voice_handoff_seen",
      "chunk_drop",
    ]);
    expect(events[1]).toMatchObject({
      status: "suppressed",
      suppressionCause: "inactive_attempt",
      authorityRejectStage: "preflight",
    });
  });

  it("records suppression when the browser playback queue rejects an armed handoff", () => {
    const plan = buildHelixAskVoicePlaybackToolHandoffPlan({
      artifacts: [ttsHandoff()],
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
    });
    const receipts: HelixAskVoicePlaybackToolOutcomeReceipt[] = [];

    const accepted = executeHelixAskVoicePlaybackToolHandoffPlan(plan, {
      emitTimelineEvent: () => undefined,
      recordPlaybackOutcomeReceipt: (receipt) => receipts.push(receipt),
      enqueuePlaybackIntent: () => false,
      markHandoffConsumed: () => undefined,
    });

    expect(accepted).toBe(0);
    expect(receipts).toEqual([
      expect.objectContaining({
        status: "suppressed",
        error: "interim_voice_enqueue_rejected:mic=off:mode=off:outputArmed=true",
      }),
    ]);
  });

  it("records playback outcome receipts through the controller ledger and poster", () => {
    const currentReceipts: VoicePlaybackOutcomeReceipt[] = [];
    const committed: VoicePlaybackOutcomeReceipt[][] = [];
    const posted: VoicePlaybackOutcomeReceipt[] = [];

    const result = recordHelixAskVoicePlaybackToolOutcomeReceipt({
      receipt: {
        status: "delivered",
        utteranceId: "translation_relay:turn-tts:receipt-tts",
        turnKey: "turn-tts",
        kind: "translation_relay",
        sourceReceiptId: "receipt-tts",
        sourceReceiptKey: "interim_voice:tts",
        requestId: "request-tts",
        calloutKind: "tool_result",
        error: null,
        metrics: {
          providerHeader: "test-provider",
          profileHeader: "test-profile",
          cacheHitCount: 1,
          cacheMissCount: 0,
          totalPlaybackMs: 120,
          cancelReason: null,
          playbackLifecycle: "ended",
        },
        atMs: 1234,
      },
      currentReceipts,
      audioUnlocked: true,
      playbackPath: "chunked",
      commitReceipts: (receipts) => committed.push(receipts),
      postReceipt: (receipt) => posted.push(receipt),
    });

    expect(result.receipt).toMatchObject({
      schema: "helix.voice_playback_outcome_receipt.v1",
      status: "delivered",
      utteranceId: "translation_relay:turn-tts:receipt-tts",
      sourceReceiptId: "receipt-tts",
      requestId: "request-tts",
      audioUnlocked: true,
      playbackPath: "chunked",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "playback_observation",
    });
    expect(committed).toEqual([[result.receipt]]);
    expect(posted).toEqual([result.receipt]);
  });

  it("builds non-terminal lifecycle receipts for transport state changes", () => {
    const playbackStatuses: VoicePlaybackLifecycleReceiptStatus[] = [
      "queued",
      "started",
      "paused",
      "resumed",
      "completed",
      "cancelled",
      "failed",
    ];
    const lifecycleReceipts = playbackStatuses.map((playbackStatus) =>
      buildHelixAskVoicePlaybackLifecycleReceiptInput({
        playbackStatus,
        utteranceId: "manual_read_aloud:reply-1",
        turnKey: "manual:reply-1",
        sourceTurnId: "turn:reply-1",
        sourceTextHash: "sha256:reply-text",
        kind: "manual_read_aloud",
        cancelReason: playbackStatus === "cancelled" ? "user_stop" : null,
        chunkIndex: 1,
        chunkCount: 3,
        positionMs: 750,
      }),
    );

    expect(lifecycleReceipts.map((receipt) => receipt.playbackStatus)).toEqual([
      "queued",
      "started",
      "paused",
      "resumed",
      "completed",
      "cancelled",
      "failed",
    ]);
    expect(lifecycleReceipts.map((receipt) => receipt.status)).toEqual([
      "queued",
      "queued",
      "queued",
      "queued",
      "delivered",
      "cancelled",
      "failed",
    ]);
    expect(lifecycleReceipts[5]).toMatchObject({
      cancelReason: "user_stop",
      sourceTurnId: "turn:reply-1",
      sourceTextHash: "sha256:reply-text",
      chunkIndex: 1,
      chunkCount: 3,
      positionMs: 750,
    });
  });
});
