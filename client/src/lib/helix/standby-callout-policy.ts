import {
  HELIX_STANDBY_CALLOUT_DELIVERY_RECEIPT_SCHEMA,
  type StandbyCalloutDeliveryReceipt,
  type StandbyCalloutMode,
  type StandbyCalloutProposal,
} from "@shared/helix-standby-callout";

export function shouldRenderStandbyCalloutCard(proposal: StandbyCalloutProposal): boolean {
  return proposal.decision !== "suppress";
}

export function buildLocalStandbyCalloutDeliveryReceipt(args: {
  proposal: StandbyCalloutProposal;
  channel: "none" | "ui_text" | "voice" | "voice_on_confirm";
  delivered: boolean;
  reason: StandbyCalloutDeliveryReceipt["reason"];
  audioEventId?: string | null;
  now?: Date;
}): StandbyCalloutDeliveryReceipt {
  const now = args.now ?? new Date();
  return {
    schema: HELIX_STANDBY_CALLOUT_DELIVERY_RECEIPT_SCHEMA,
    delivery_id: `standby_callout_delivery:${args.proposal.proposal_id}:${now.getTime()}`,
    proposal_id: args.proposal.proposal_id,
    delivered: args.delivered,
    channel: args.channel,
    reason: args.reason,
    thread_id: args.proposal.thread_id ?? null,
    audio_event_id: args.audioEventId ?? null,
    evidence_refs: args.proposal.evidence_refs,
    ts: now.toISOString(),
  };
}

export function describeStandbyVoiceMode(mode: StandbyCalloutMode): string {
  if (mode === "off") return "Voice output is off.";
  if (mode === "text_only") return "Text callouts only.";
  if (mode === "voice_on_confirm") return "Voice waits for confirmation.";
  if (mode === "critical_voice") return "Critical/action callouts may speak when voice output is enabled.";
  return "Only direct address may produce callouts.";
}
