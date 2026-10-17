import { describe, expect, it } from "vitest";

import {
  buildInterimVoiceClientHandoffDebug,
  buildInterimVoiceReceiptPlaybackIntent,
  collectInterimVoiceCalloutPlaybackIntents,
} from "@/lib/helix/ask-interim-voice-callout";

function receiptArtifact(overrides: {
  kind?: string;
  status?: string;
  text?: string;
  turnId?: string;
  requestId?: string;
  receiptId?: string;
  utteranceId?: string;
  authority?: string;
  assistantAnswer?: boolean;
  terminalEligible?: boolean;
  rawContentIncluded?: boolean;
  voicePlaybackKind?: string;
  reasonCodes?: string[];
  allowMicOffPlayback?: boolean;
} = {}) {
  const requestId = overrides.requestId ?? "request-1";
  const receiptId = overrides.receiptId ?? "receipt-1";
  return {
    schema: "helix.interim_voice_callout_tool_result.v1",
    request: {
      kind: overrides.kind ?? "tool_result",
      authority: overrides.authority ?? "provisional",
      text: overrides.text ?? "Calculator returned 72.",
      turnId: overrides.turnId ?? "turn-1",
      requestId,
      voicePlaybackKind: overrides.voicePlaybackKind,
      reasonCodes: overrides.reasonCodes,
      allowMicOffPlayback: overrides.allowMicOffPlayback,
      assistant_answer: overrides.assistantAnswer ?? false,
      terminal_eligible: overrides.terminalEligible ?? false,
      raw_content_included: overrides.rawContentIncluded ?? false,
    },
    receipt: {
      status: overrides.status ?? "queued",
      receiptId,
      delivery: overrides.utteranceId ? { utteranceId: overrides.utteranceId } : undefined,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
  };
}

describe("interim voice callout playback projection", () => {
  it("builds a provisional playback intent from a safe structured receipt", () => {
    const intent = buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      utteranceId: "utterance-1",
    }));

    expect(intent).toMatchObject({
      kind: "tool_receipt",
      authority: "provisional",
      source: "agent_loop",
      turnKey: "turn-1",
      eventId: "receipt-1",
      requestId: "request-1",
      receiptId: "receipt-1",
      receiptKey: "utterance-1",
      calloutKind: "tool_result",
      interimVoiceRequestId: "request-1",
      interimVoiceReceiptId: "receipt-1",
      interimVoiceReceiptKey: "utterance-1",
      interimVoiceCalloutKind: "tool_result",
    });
  });

  it("rejects unsafe or unplayable receipts", () => {
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      assistantAnswer: true,
    }))).toBeNull();
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      authority: "final",
    }))).toBeNull();
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      status: "failed",
    }))).toBeNull();
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      kind: "final_answer",
    }))).toBeNull();
  });

  it("maps explicit relay and narration callouts to matching playback kinds", () => {
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      kind: "translation_relay",
    }))?.kind).toBe("translation_relay");
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      kind: "narrator_read",
    }))?.kind).toBe("narrator_read");
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      kind: "panel_narration",
    }))?.kind).toBe("panel_narration");
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      voicePlaybackKind: "translation_relay",
    }))?.kind).toBe("translation_relay");
  });

  it("collects nested receipts while suppressing already-spoken and duplicate intents", () => {
    const repeated = receiptArtifact({
      requestId: "request-repeat",
      receiptId: "receipt-repeat",
      utteranceId: "utterance-repeat",
    });
    const immediateAck = receiptArtifact({
      kind: "immediate_ack",
      turnId: "turn-ack",
      requestId: "request-ack",
      receiptId: "receipt-ack",
    });
    const fresh = receiptArtifact({
      requestId: "request-fresh",
      receiptId: "receipt-fresh",
    });

    const intents = collectInterimVoiceCalloutPlaybackIntents({
      artifacts: [{ nested: [repeated, repeated, immediateAck, fresh] }],
      spokenReceiptKeys: ["utterance-repeat"],
      spokenImmediateAckTurnKeys: ["turn-ack"],
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      requestId: "request-fresh",
      receiptId: "receipt-fresh",
    });
  });

  it("collects capability-lane text-to-speech client playback handoffs from observation packets", () => {
    const artifacts = [
      {
        schema: "helix.agent_step_observation_packet.v1",
        capability_key: "text_to_speech.speak_text",
        state_delta: {
          text_to_speech_client_playback_handoff: receiptArtifact({
            status: "awaiting_client_playback",
            kind: "tool_result",
            text: "La traduccion esta lista.",
            turnId: "turn-tts-lane",
            requestId: "helix_interim_voice_callout_request:tts-lane",
            receiptId: "helix_interim_voice_callout_receipt:tts-lane",
            utteranceId: "interim_voice:tts-lane",
            voicePlaybackKind: "translation_relay",
            reasonCodes: ["capability_lane_text_to_speech_speak_text"],
          }),
        },
      },
    ];

    const intents = collectInterimVoiceCalloutPlaybackIntents({ artifacts });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "translation_relay",
      source: "agent_loop",
      turnKey: "turn-tts-lane",
      requestId: "helix_interim_voice_callout_request:tts-lane",
      receiptId: "helix_interim_voice_callout_receipt:tts-lane",
      receiptKey: "interim_voice:tts-lane",
      calloutKind: "tool_result",
      interimVoiceRequestId: "helix_interim_voice_callout_request:tts-lane",
      interimVoiceReceiptId: "helix_interim_voice_callout_receipt:tts-lane",
      interimVoiceReceiptKey: "interim_voice:tts-lane",
      interimVoiceCalloutKind: "tool_result",
      allowMicOffPlayback: true,
    });
  });

  it("preserves explicit mic-off playback permission from governed handoffs", () => {
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      allowMicOffPlayback: true,
    }))?.allowMicOffPlayback).toBe(true);
    expect(buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      allowMicOffPlayback: false,
    }))?.allowMicOffPlayback).toBe(false);
  });

  it("builds governed client handoff debug without answer authority", () => {
    const intent = buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      requestId: "request-debug",
      receiptId: "receipt-debug",
      utteranceId: "utterance-debug",
    }));

    expect(intent).not.toBeNull();
    expect(buildInterimVoiceClientHandoffDebug({
      intent: intent!,
      micArmState: "off",
      voiceMode: "companion",
      outputModeEnabled: true,
      allowMicOffPlayback: null,
    })).toEqual({
      schema: "helix.interim_voice_client_handoff_debug.v1",
      micArmState: "off",
      voiceMode: "companion",
      micArmed: false,
      outputModeEnabled: true,
      outputArmed: true,
      requestId: "request-debug",
      receiptId: "receipt-debug",
      receiptKey: "utterance-debug",
      calloutKind: "tool_result",
      playbackKind: "tool_receipt",
      allowMicOffPlayback: null,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(buildInterimVoiceClientHandoffDebug({
      intent: intent!,
      micArmState: "off",
      voiceMode: "off",
      outputModeEnabled: false,
      allowMicOffPlayback: true,
    })).toMatchObject({
      micArmed: false,
      outputModeEnabled: false,
      outputArmed: true,
      allowMicOffPlayback: true,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
  });

  it("does not report speaker output armed from microphone state alone", () => {
    const intent = buildInterimVoiceReceiptPlaybackIntent(receiptArtifact({
      allowMicOffPlayback: false,
      authority: "provisional",
      requestId: "request-mic-only",
      receiptId: "receipt-mic-only",
      utteranceId: "utterance-mic-only",
    }));

    expect(intent).not.toBeNull();
    expect(buildInterimVoiceClientHandoffDebug({
      intent: intent!,
      micArmState: "on",
      voiceMode: "off",
      outputModeEnabled: false,
      allowMicOffPlayback: false,
    })).toMatchObject({
      micArmed: true,
      outputModeEnabled: false,
      outputArmed: false,
      allowMicOffPlayback: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
  });
});
