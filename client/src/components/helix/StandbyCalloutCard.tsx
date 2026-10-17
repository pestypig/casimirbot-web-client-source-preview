import type { StandbyCalloutProposal } from "@shared/helix-standby-callout";
import { buildLocalStandbyCalloutDeliveryReceipt } from "@/lib/helix/standby-callout-policy";
import {
  useStandbyCalloutStore,
  type StandbyCalloutState,
} from "@/store/useStandbyCalloutStore";

export function StandbyCalloutCard({
  proposal,
  onAskHelix,
}: {
  proposal: StandbyCalloutProposal;
  onAskHelix?: (prompt: string) => void;
}) {
  const addDelivery = useStandbyCalloutStore((state: StandbyCalloutState) => state.addDelivery);
  const dismissProposal = useStandbyCalloutStore((state: StandbyCalloutState) => state.dismissProposal);
  const voiceOutputEnabled = useStandbyCalloutStore((state: StandbyCalloutState) => state.voiceOutputEnabled);

  const recordDelivery = (kind: "speak" | "silent") => {
    const receipt =
      kind === "speak" && voiceOutputEnabled
        ? buildLocalStandbyCalloutDeliveryReceipt({
            proposal,
            channel: "voice",
            delivered: true,
            reason: "delivered",
            audioEventId: `standby_voice:${proposal.proposal_id}`,
          })
        : buildLocalStandbyCalloutDeliveryReceipt({
            proposal,
            channel: kind === "speak" ? "voice_on_confirm" : "none",
            delivered: false,
            reason: kind === "speak" ? "voice_not_enabled" : "suppressed_policy",
          });
    addDelivery(receipt);
    if (kind === "silent") dismissProposal(proposal.proposal_id);
  };

  return (
    <section className="rounded border border-amber-300/30 bg-amber-950/25 p-2 text-xs text-amber-50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-amber-100">{proposal.text}</p>
          <p className="mt-1 text-[11px] text-amber-200/80">
            {proposal.salience_receipt_id ?? "standby callout"} / {proposal.priority}
          </p>
        </div>
        <span className="rounded border border-amber-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-100">
          {proposal.decision}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => recordDelivery("speak")}
          className="rounded border border-white/15 px-2 py-1 text-[11px] text-amber-50 hover:bg-white/10"
        >
          Speak
        </button>
        <button
          type="button"
          onClick={() => recordDelivery("silent")}
          className="rounded border border-white/15 px-2 py-1 text-[11px] text-amber-50 hover:bg-white/10"
        >
          Keep silent
        </button>
        <button
          type="button"
          onClick={() => onAskHelix?.(`Review this standby callout with explicit context: ${proposal.text}`)}
          className="rounded border border-white/15 px-2 py-1 text-[11px] text-amber-50 hover:bg-white/10"
        >
          Ask Helix about this
        </button>
      </div>
    </section>
  );
}
