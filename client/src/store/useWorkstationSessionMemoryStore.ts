import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  HELIX_WORKSTATION_MEMORY_SCHEMA,
  type HelixWorkstationMemorySnapshot,
} from "@shared/helix-workstation-memory";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

const WORKSTATION_SESSION_MEMORY_KEY = "workstation-session-memory:v1";

export type WorkstationScrollMemory = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  updatedAtMs: number;
};

export type WorkstationDraftMemory = {
  text: string;
  updatedAtMs: number;
};

type WorkstationSessionMemoryState = {
  panelScroll: Record<string, WorkstationScrollMemory>;
  drafts: Record<string, WorkstationDraftMemory>;
  rememberPanelScroll: (
    key: string,
    scroll: Omit<WorkstationScrollMemory, "updatedAtMs">,
  ) => void;
  readPanelScroll: (key: string) => WorkstationScrollMemory | null;
  rememberDraft: (key: string, text: string) => void;
  readDraft: (key: string) => string;
  clearDraft: (key: string) => void;
  buildWorkstationSessionMemorySnapshot: () => HelixWorkstationMemorySnapshot;
};

const fallbackSessionStorage = (() => {
  const memory: Record<string, string> = {};
  return {
    getItem: (name: string) => memory[name] ?? null,
    setItem: (name: string, value: string) => {
      memory[name] = value;
    },
    removeItem: (name: string) => {
      delete memory[name];
    },
  };
})();

function resolveSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return fallbackSessionStorage;
  }
  return fallbackSessionStorage;
}

function normalizeKey(key: string): string {
  return key.trim();
}

export const useWorkstationSessionMemoryStore = create<WorkstationSessionMemoryState>()(
  persist(
    (set, get) => ({
      panelScroll: {},
      drafts: {},
      rememberPanelScroll: (key, scroll) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return;
        useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
          artifact_id: `workstation-panel-scroll:${normalizedKey}`,
          artifact_type: "workstation_panel_scroll",
          storage_key: WORKSTATION_SESSION_MEMORY_KEY,
          storage_backend: "sessionStorage",
          owner_scope: "surface_session_only",
          sync_status: "local_only",
          title: normalizedKey,
        });
        set((state) => ({
          panelScroll: {
            ...state.panelScroll,
            [normalizedKey]: {
              scrollTop: Math.max(0, Math.round(scroll.scrollTop)),
              scrollHeight: Math.max(0, Math.round(scroll.scrollHeight)),
              clientHeight: Math.max(0, Math.round(scroll.clientHeight)),
              updatedAtMs: Date.now(),
            },
          },
        }));
      },
      readPanelScroll: (key) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return null;
        return get().panelScroll[normalizedKey] ?? null;
      },
      rememberDraft: (key, text) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return;
        useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
          artifact_id: `workstation-session-draft:${normalizedKey}`,
          artifact_type: "workstation_session_draft",
          storage_key: WORKSTATION_SESSION_MEMORY_KEY,
          storage_backend: "sessionStorage",
          owner_scope: "surface_session_only",
          sync_status: "local_only",
          title: normalizedKey,
        });
        set((state) => ({
          drafts: {
            ...state.drafts,
            [normalizedKey]: {
              text,
              updatedAtMs: Date.now(),
            },
          },
        }));
      },
      readDraft: (key) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return "";
        return get().drafts[normalizedKey]?.text ?? "";
      },
      clearDraft: (key) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) return;
        set((state) => {
          if (!state.drafts[normalizedKey]) return state;
          const drafts = { ...state.drafts };
          delete drafts[normalizedKey];
          useWorkspaceMemoryRegistryStore.getState().removeArtifact(
            `workstation-session-draft:${normalizedKey}`,
          );
          return { drafts };
        });
      },
      buildWorkstationSessionMemorySnapshot: () => ({
        schema: HELIX_WORKSTATION_MEMORY_SCHEMA,
        memory_class: "surface_session_only",
        storage: "sessionStorage",
        panel_scroll_keys: Object.keys(get().panelScroll).sort(),
        draft_keys: Object.keys(get().drafts).sort(),
        context_injection: "never_by_default",
        user_visible: true,
      }),
    }),
    {
      name: WORKSTATION_SESSION_MEMORY_KEY,
      storage: createJSONStorage(resolveSessionStorage),
      partialize: (state) => ({
        panelScroll: state.panelScroll,
        drafts: state.drafts,
      }),
    },
  ),
);
