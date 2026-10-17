import { create } from "zustand";
import type { StandbyCalloutDeliveryReceipt } from "@shared/helix-standby-callout";

export type StandbyVoiceDeliveryState = {
  receipts: StandbyCalloutDeliveryReceipt[];
  lastError: string | null;
  addReceipt: (receipt: StandbyCalloutDeliveryReceipt) => void;
  setError: (error: string | null) => void;
};

export const useStandbyVoiceDeliveryStore = create<StandbyVoiceDeliveryState>()((set) => ({
  receipts: [],
  lastError: null,
  addReceipt: (receipt: StandbyCalloutDeliveryReceipt) =>
    set((state) => ({
      receipts: [receipt, ...state.receipts.filter((entry) => entry.delivery_id !== receipt.delivery_id)].slice(0, 40),
    })),
  setError: (error: string | null) => set({ lastError: error }),
}));
