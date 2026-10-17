import type { StandbyCalloutProposal } from "@shared/helix-standby-callout";
import { useStandbyCalloutStore } from "@/store/useStandbyCalloutStore";

export function publishStandbyCalloutProposal(proposal: StandbyCalloutProposal): void {
  useStandbyCalloutStore.getState().upsertProposal(proposal);
}
