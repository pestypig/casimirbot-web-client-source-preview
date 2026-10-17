import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HelixMissionMemory, HelixMissionMemoryUpdate } from "@shared/helix-mission-memory";

export type HelixMissionMemoryState = {
  memoryByThread: Record<string, HelixMissionMemory | null>;
  updateByThread: Record<string, HelixMissionMemoryUpdate | null>;
  diagnosticsByThread: Record<string, {
    last_loaded_at?: string | null;
    last_fetch_error?: string | null;
    thread_id: string;
  }>;
  loadMissionMemory: (threadId: string) => Promise<void>;
};

export const useHelixMissionMemoryStore = create<HelixMissionMemoryState>()(
  persist(
    (
      set: (
        partial:
          | Partial<HelixMissionMemoryState>
          | ((state: HelixMissionMemoryState) => Partial<HelixMissionMemoryState>),
      ) => void,
    ) => ({
      memoryByThread: {},
      updateByThread: {},
      diagnosticsByThread: {},
      loadMissionMemory: async (threadId: string) => {
        try {
          const response = await fetch(
            `/api/agi/situation/mission-memory?thread_id=${encodeURIComponent(threadId)}`,
          );
          if (!response.ok) {
            set((state: HelixMissionMemoryState) => ({
              diagnosticsByThread: {
                ...state.diagnosticsByThread,
                [threadId]: {
                  thread_id: threadId,
                  last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                  last_fetch_error: `http_${response.status}`,
                },
              },
            }));
            return;
          }
          const parsed = (await response.json()) as {
            memory?: HelixMissionMemory | null;
            update?: HelixMissionMemoryUpdate | null;
          };
          set((state: HelixMissionMemoryState) => ({
            memoryByThread: {
              ...state.memoryByThread,
              [threadId]: parsed.memory ?? null,
            },
            updateByThread: {
              ...state.updateByThread,
              [threadId]: parsed.update ?? null,
            },
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: {
                thread_id: threadId,
                last_loaded_at: new Date().toISOString(),
                last_fetch_error: null,
              },
            },
          }));
        } catch (error) {
          set((state: HelixMissionMemoryState) => ({
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: {
                thread_id: threadId,
                last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                last_fetch_error: error instanceof Error ? error.message : "fetch_failed",
              },
            },
          }));
        }
      },
    }),
    {
      name: "helix-mission-memory-v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state: HelixMissionMemoryState) => ({
        memoryByThread: state.memoryByThread,
        updateByThread: state.updateByThread,
        diagnosticsByThread: state.diagnosticsByThread,
      }),
    },
  ),
);

