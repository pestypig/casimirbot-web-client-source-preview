import type { StandbyCalloutDeliveryReceipt } from "@shared/helix-standby-callout";
import type { HelixStandbyVoicePolicy } from "@shared/helix-standby-voice-policy";
import { canDeliverStandbyVoice } from "@/lib/helix/standbyVoicePolicy";
import { speakVoice, type VoiceSpeakResponse } from "@/lib/agi/api";

const hashText = (text: string): string => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 10);
};

export type StandbyVoiceDeliveryInput = {
  proposalId: string;
  text: string;
  priority: "info" | "warn" | "critical" | "action";
  evidenceRefs: string[];
  policy?: HelixStandbyVoicePolicy | null;
  requiresConfirmation?: boolean;
  directAddressAuthorized?: boolean;
  dedupeKey?: string | null;
  traceId?: string | null;
  speak?: typeof speakVoice;
  now?: () => Date;
};

export async function deliverStandbyVoiceCallout(
  input: StandbyVoiceDeliveryInput,
): Promise<StandbyCalloutDeliveryReceipt & { voice_response?: VoiceSpeakResponse | null }> {
  const now = input.now?.() ?? new Date();
  const deliveryId = `standby_callout_delivery:${hashText(`${input.proposalId}:${now.toISOString()}`)}`;
  const base = {
    schema: "helix.standby_callout_delivery_receipt.v1" as const,
    delivery_id: deliveryId,
    proposal_id: input.proposalId,
    thread_id: null,
    audio_event_id: null,
    evidence_refs: input.evidenceRefs,
    ts: now.toISOString(),
  };
  const allowed = canDeliverStandbyVoice({
    policy: input.policy,
    priority: input.priority,
    requiresConfirmation: input.requiresConfirmation,
    directAddressAuthorized: input.directAddressAuthorized,
  });
  if (!allowed) {
    const reason = input.policy?.voice_output_enabled
      ? input.requiresConfirmation
        ? "awaiting_confirmation"
        : "suppressed_policy"
      : "voice_not_enabled";
    return {
      ...base,
      delivered: false,
      channel: input.requiresConfirmation ? "voice_on_confirm" : "none",
      reason,
      voice_response: null,
    };
  }

  const audioEventId = `standby_voice:${hashText(input.proposalId)}`;
  const speak = input.speak ?? speakVoice;
  const voiceResponse = await speak({
    text: input.text.slice(0, 500),
    mode: "callout",
    priority: input.priority,
    traceId: input.traceId ?? undefined,
    eventId: input.proposalId,
    utteranceId: audioEventId,
    chunkKind: "tool_receipt",
    dedupe_key: input.dedupeKey ?? undefined,
  });

  return {
    ...base,
    delivered: true,
    channel: "voice",
    reason: "delivered",
    audio_event_id: audioEventId,
    voice_response: voiceResponse,
  };
}
