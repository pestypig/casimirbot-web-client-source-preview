import {
  buildVoiceAutoSpeakUtteranceId,
} from "@/lib/helix/ask-read-aloud-display";
import type {
  VoicePlaybackIntentAuthority,
  VoicePlaybackIntentSource,
  VoicePlaybackUtteranceKind,
} from "@/lib/helix/voice-playback";

export type VoiceAutoSpeakTask = {
  key: string;
  kind: VoicePlaybackUtteranceKind;
  turnKey: string;
  revision: number;
  text: string;
  traceId?: string;
  eventId: string;
  authority?: VoicePlaybackIntentAuthority;
  source?: VoicePlaybackIntentSource;
  replyId?: string;
  allowMicOffPlayback?: boolean;
  interimVoiceRequestId?: string;
  interimVoiceReceiptId?: string;
  interimVoiceReceiptKey?: string;
  interimVoiceCalloutKind?: string;
  briefSource?: "llm" | "none";
  finalSource?: "normal_reasoning" | "strict_gate_override";
};

export type VoicePlaybackUtteranceIntent = {
  kind: VoicePlaybackUtteranceKind;
  authority: VoicePlaybackIntentAuthority;
  turnKey: string;
  revision: number;
  text: string;
  traceId?: string;
  eventId: string;
  replyId?: string;
  allowMicOffPlayback?: boolean;
  interimVoiceRequestId?: string;
  interimVoiceReceiptId?: string;
  interimVoiceReceiptKey?: string;
  interimVoiceCalloutKind?: string;
  source: VoicePlaybackIntentSource;
  briefSource?: "llm" | "none";
  finalSource?: "normal_reasoning" | "strict_gate_override";
};

export function buildManualReadAloudVoiceIntent(input: {
  text: string;
  replyId: string;
  traceId?: string | null;
  turnKey?: string | null;
}): VoicePlaybackUtteranceIntent {
  const turnKey = input.turnKey?.trim() || `manual:${input.replyId}`;
  return {
    kind: "manual_read_aloud",
    authority: "final",
    turnKey,
    revision: 1,
    text: input.text,
    traceId: input.traceId?.trim() || undefined,
    eventId: input.replyId,
    replyId: input.replyId,
    source: "manual",
  };
}

export function mapVoicePlaybackIntentToTask(intent: VoicePlaybackUtteranceIntent): VoiceAutoSpeakTask {
  return {
    key: buildVoiceAutoSpeakUtteranceId([
      intent.kind,
      intent.traceId ?? intent.turnKey,
      intent.eventId,
      intent.replyId,
    ]),
    kind: intent.kind,
    turnKey: intent.turnKey,
    revision: intent.revision,
    text: intent.text,
    traceId: intent.traceId,
    eventId: intent.eventId,
    authority: intent.authority,
    source: intent.source,
    replyId: intent.replyId,
    allowMicOffPlayback: intent.allowMicOffPlayback,
    interimVoiceRequestId: intent.interimVoiceRequestId,
    interimVoiceReceiptId: intent.interimVoiceReceiptId,
    interimVoiceReceiptKey: intent.interimVoiceReceiptKey,
    interimVoiceCalloutKind: intent.interimVoiceCalloutKind,
    briefSource: intent.briefSource,
    finalSource: intent.finalSource,
  };
}
