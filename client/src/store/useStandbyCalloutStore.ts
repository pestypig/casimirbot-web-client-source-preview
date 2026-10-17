import { create } from "zustand";
import type {
  StandbyCalloutDeliveryReceipt,
  StandbyCalloutMode,
  StandbyCalloutProposal,
} from "@shared/helix-standby-callout";

export type StandbyCalloutState = {
  mode: StandbyCalloutMode;
  voiceOutputEnabled: boolean;
  proposals: StandbyCalloutProposal[];
  deliveries: StandbyCalloutDeliveryReceipt[];
  setMode: (mode: StandbyCalloutMode) => void;
  setVoiceOutputEnabled: (enabled: boolean) => void;
  upsertProposal: (proposal: StandbyCalloutProposal) => void;
  addDelivery: (receipt: StandbyCalloutDeliveryReceipt) => void;
  dismissProposal: (proposalId: string) => void;
};

export const useStandbyCalloutStore = create<StandbyCalloutState>()(
  (set: (partial: Partial<StandbyCalloutState> | ((state: StandbyCalloutState) => Partial<StandbyCalloutState>)) => void) => ({
    mode: "text_only",
    voiceOutputEnabled: false,
    proposals: [],
    deliveries: [],
    setMode: (mode: StandbyCalloutMode) => set({ mode }),
    setVoiceOutputEnabled: (enabled: boolean) => set({ voiceOutputEnabled: enabled }),
    upsertProposal: (proposal: StandbyCalloutProposal) =>
      set((state: StandbyCalloutState) => ({
        proposals: [
          proposal,
          ...state.proposals.filter((entry: StandbyCalloutProposal) => entry.proposal_id !== proposal.proposal_id),
        ].slice(0, 12),
      })),
    addDelivery: (receipt: StandbyCalloutDeliveryReceipt) =>
      set((state: StandbyCalloutState) => ({
        deliveries: [receipt, ...state.deliveries].slice(0, 24),
      })),
    dismissProposal: (proposalId: string) =>
      set((state: StandbyCalloutState) => ({
        proposals: state.proposals.filter((entry: StandbyCalloutProposal) => entry.proposal_id !== proposalId),
      })),
  }),
);
