import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  buildMoralGraphCurrentAnswerBlockFromDebugExport,
  type MoralGraphCurrentAnswerBlock,
} from "@/lib/moral-graph/currentAnswerBlock";

const STORAGE_KEY = "moral-graph-current-answer:v1";

type MoralGraphCurrentAnswerState = {
  currentAnswerBlock: MoralGraphCurrentAnswerBlock | null;
  publishCurrentAnswerBlock: (block: MoralGraphCurrentAnswerBlock) => void;
  publishFromDebugExport: (debugExport: unknown) => MoralGraphCurrentAnswerBlock | null;
  clearCurrentAnswerBlock: () => void;
};

export const useMoralGraphCurrentAnswerStore = create<MoralGraphCurrentAnswerState>()(
  persist(
    (set) => ({
      currentAnswerBlock: null,
      publishCurrentAnswerBlock: (block) => set({ currentAnswerBlock: block }),
      publishFromDebugExport: (debugExport) => {
        const block = buildMoralGraphCurrentAnswerBlockFromDebugExport(debugExport);
        if (block) set({ currentAnswerBlock: block });
        return block;
      },
      clearCurrentAnswerBlock: () => set({ currentAnswerBlock: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentAnswerBlock: state.currentAnswerBlock,
      }),
    },
  ),
);

export function publishMoralGraphCurrentAnswerFromDebugExport(debugExport: unknown): MoralGraphCurrentAnswerBlock | null {
  return useMoralGraphCurrentAnswerStore.getState().publishFromDebugExport(debugExport);
}
