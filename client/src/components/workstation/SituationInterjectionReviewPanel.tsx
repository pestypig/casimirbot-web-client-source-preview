import type { SituationInterjectionProposal } from "@shared/helix-situation-standby";

type SituationInterjectionReviewPanelProps = {
  proposals: SituationInterjectionProposal[];
  onConfirm?: (proposal: SituationInterjectionProposal) => void;
  onDismiss?: (proposal: SituationInterjectionProposal) => void;
};

export function SituationInterjectionReviewPanel({
  proposals,
  onConfirm,
  onDismiss,
}: SituationInterjectionReviewPanelProps) {
  if (proposals.length === 0) {
    return <div className="text-xs text-muted-foreground">No interjection proposals.</div>;
  }
  return (
    <div className="space-y-2">
      {proposals.map((proposal) => (
        <div key={proposal.proposal_id} className="rounded-md border border-border/70 p-2 text-xs">
          <div className="font-medium text-foreground">{proposal.text}</div>
          <div className="mt-1 text-muted-foreground">
            {proposal.mode} · voice {proposal.voice_output} · {proposal.ts}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-1"
              onClick={() => onConfirm?.(proposal)}
            >
              Confirm
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1"
              onClick={() => onDismiss?.(proposal)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
