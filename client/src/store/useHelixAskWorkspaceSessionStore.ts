import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import type { WorkstationLayoutSnapshot } from "@/store/useWorkstationLayoutStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

type HelixAskWorkspaceSessionState = {
  layoutSnapshots: Record<string, WorkstationLayoutSnapshot>;
  saveLayoutSnapshot: (sessionId: string, snapshot: WorkstationLayoutSnapshot) => void;
  readLayoutSnapshot: (sessionId: string) => WorkstationLayoutSnapshot | null;
  removeLayoutSnapshot: (sessionId: string) => void;
};

const STORAGE_KEY = "helix-ask-workspace-sessions-v1";

export const useHelixAskWorkspaceSessionStore = createWithEqualityFn<HelixAskWorkspaceSessionState>()(
  persist(
    (set, get) => ({
      layoutSnapshots: {},
      saveLayoutSnapshot: (sessionId, snapshot) => {
        const key = sessionId.trim();
        if (!key) return;
        useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
          artifact_id: `helix-chat-layout:${key}`,
          artifact_type: "helix_chat_layout",
          storage_key: STORAGE_KEY,
          storage_backend: "localStorage",
          owner_scope: "browser_guest",
          sync_status: "local_only",
          chat_session_id: key,
          title: "Workstation layout",
        });
        set((state) => ({
          layoutSnapshots: {
            ...state.layoutSnapshots,
            [key]: snapshot,
          },
        }));
      },
      readLayoutSnapshot: (sessionId) => {
        const key = sessionId.trim();
        if (!key) return null;
        return get().layoutSnapshots[key] ?? null;
      },
      removeLayoutSnapshot: (sessionId) => {
        const key = sessionId.trim();
        if (!key) return;
        useWorkspaceMemoryRegistryStore.getState().removeArtifact(`helix-chat-layout:${key}`);
        set((state) => {
          if (!state.layoutSnapshots[key]) return state;
          const next = { ...state.layoutSnapshots };
          delete next[key];
          return { layoutSnapshots: next };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        layoutSnapshots: state.layoutSnapshots,
      }),
    },
  ),
);
