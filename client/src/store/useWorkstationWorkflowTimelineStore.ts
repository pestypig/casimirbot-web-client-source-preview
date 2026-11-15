import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  readCachedAccountProfileIdentity,
} from "@/lib/workstation/accountCapabilityPolicy";

const WORKSTATION_TIMELINE_STORAGE_PREFIX = "workstation-workflow-timeline:v2:";
const WORKSTATION_TIMELINE_MAX_ENTRIES = 320;

export type WorkstationTimelineLane = "procedural" | "chat" | "clipboard" | "notes";

export type WorkstationTimelineEntry = {
  id: string;
  ts: string;
  lane: WorkstationTimelineLane;
  label: string;
  detail?: string;
  traceId?: string;
  panelId?: string;
  step?: string;
};

type WorkstationWorkflowTimelineState = {
  entries: WorkstationTimelineEntry[];
  addEntry: (entry: Omit<WorkstationTimelineEntry, "id" | "ts"> & { id?: string; ts?: string }) => void;
  clear: () => void;
};

const timelineStorageKey = (profileId: string | null | undefined): string =>
  `${WORKSTATION_TIMELINE_STORAGE_PREFIX}${profileId === undefined
    ? "unresolved" : profileId === null ? "guest" : `profile:${encodeURIComponent(profileId)}`}`;

function readStoredEntries(key: string): WorkstationTimelineEntry[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    const state = (JSON.parse(raw ?? "null") as { state?: { entries?: unknown } } | null)?.state;
    return Array.isArray(state?.entries) ? state.entries.slice(0, WORKSTATION_TIMELINE_MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let currentTimelineStorageKey = timelineStorageKey(readCachedAccountProfileIdentity().profileId);
const initialEntries = readStoredEntries(currentTimelineStorageKey);

export const useWorkstationWorkflowTimelineStore = create<WorkstationWorkflowTimelineState>()(
  persist(
    (set) => ({
      entries: initialEntries,
      addEntry: (entry) =>
        set((state) => {
          const complete: WorkstationTimelineEntry = {
            id: entry.id?.trim() || `timeline:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
            ts: entry.ts?.trim() || new Date().toISOString(),
            lane: entry.lane,
            label: entry.label,
            detail: entry.detail,
            traceId: entry.traceId,
            panelId: entry.panelId,
            step: entry.step,
          };
          return {
            entries: [complete, ...state.entries].slice(0, WORKSTATION_TIMELINE_MAX_ENTRIES),
          };
        }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: currentTimelineStorageKey,
      skipHydration: true,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, () => {
    const profileId = readCachedAccountProfileIdentity().profileId;
    const nextKey = timelineStorageKey(profileId);
    if (nextKey !== currentTimelineStorageKey) {
      const entries = readStoredEntries(nextKey);
      currentTimelineStorageKey = nextKey;
      useWorkstationWorkflowTimelineStore.persist.setOptions({ name: nextKey });
      useWorkstationWorkflowTimelineStore.setState({ entries });
    }
  });
}

export function recordWorkstationTimelineEntry(
  entry: Omit<WorkstationTimelineEntry, "id" | "ts"> & { id?: string; ts?: string },
): void {
  useWorkstationWorkflowTimelineStore.getState().addEntry(entry);
}
