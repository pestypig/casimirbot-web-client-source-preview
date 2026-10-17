import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HelixStandbyActivityItem } from "@shared/helix-standby-activity";

export type { HelixStandbyActivityItem };

export type HelixStandbyActivityState = {
  activitiesByThread: Record<string, HelixStandbyActivityItem[]>;
  dismissedActivityIds: Record<string, true>;
  diagnosticsByThread: Record<string, {
    last_loaded_at?: string | null;
    last_fetch_error?: string | null;
    activity_count: number;
    thread_id: string;
  }>;
  upsertActivities: (threadId: string, activities: HelixStandbyActivityItem[]) => void;
  dismissActivity: (activityId: string) => void;
  pinActivity: (threadId: string, activityId: string) => void;
  loadThreadActivities: (threadId: string, limit?: number) => Promise<void>;
};

const MAX_ACTIVITIES_PER_THREAD = 80;

const dedupeActivities = (activities: HelixStandbyActivityItem[]): HelixStandbyActivityItem[] => {
  const byKey = new Map<string, HelixStandbyActivityItem>();
  for (const activity of activities) {
    const evidenceKey = activity.evidence_refs.length > 0 ? activity.evidence_refs.join("|") : activity.activity_id;
    byKey.set(`${activity.kind}:${activity.activity_id}:${evidenceKey}`, activity);
  }
  return Array.from(byKey.values())
    .sort(
      (a: HelixStandbyActivityItem, b: HelixStandbyActivityItem) =>
        b.ts.localeCompare(a.ts) || a.activity_id.localeCompare(b.activity_id),
    )
    .slice(0, MAX_ACTIVITIES_PER_THREAD);
};

export const useHelixStandbyActivityStore = create<HelixStandbyActivityState>()(
  persist(
    (set: (partial: Partial<HelixStandbyActivityState> | ((state: HelixStandbyActivityState) => Partial<HelixStandbyActivityState>)) => void, get: () => HelixStandbyActivityState) => ({
      activitiesByThread: {},
      dismissedActivityIds: {},
      diagnosticsByThread: {},
      upsertActivities: (threadId: string, activities: HelixStandbyActivityItem[]) =>
        set((state: HelixStandbyActivityState) => ({
          activitiesByThread: {
            ...state.activitiesByThread,
            [threadId]: dedupeActivities([...(state.activitiesByThread[threadId] ?? []), ...activities]),
          },
        })),
      dismissActivity: (activityId: string) =>
        set((state: HelixStandbyActivityState) => ({
          dismissedActivityIds: { ...state.dismissedActivityIds, [activityId]: true },
        })),
      pinActivity: (threadId: string, activityId: string) =>
        set((state: HelixStandbyActivityState) => ({
          activitiesByThread: {
            ...state.activitiesByThread,
            [threadId]: (state.activitiesByThread[threadId] ?? []).map((activity: HelixStandbyActivityItem) =>
              activity.activity_id === activityId
                ? { ...activity, visibility: "helix_dock_pinned" }
                : activity,
            ),
          },
        })),
      loadThreadActivities: async (threadId: string, limit = 50) => {
        try {
          const response = await fetch(
            `/api/agi/situation/standby-activity?thread_id=${encodeURIComponent(threadId)}&limit=${encodeURIComponent(String(limit))}`,
          );
          if (!response.ok) {
            set((state: HelixStandbyActivityState) => ({
              diagnosticsByThread: {
                ...state.diagnosticsByThread,
                [threadId]: {
                  thread_id: threadId,
                  activity_count: state.activitiesByThread[threadId]?.length ?? 0,
                  last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                  last_fetch_error: `http_${response.status}`,
                },
              },
            }));
            return;
          }
          const parsed = (await response.json()) as {
            activities?: HelixStandbyActivityItem[];
            diagnostics?: HelixStandbyActivityState["diagnosticsByThread"][string];
          };
          if (Array.isArray(parsed.activities)) {
            get().upsertActivities(threadId, parsed.activities);
          }
          set((state: HelixStandbyActivityState) => ({
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: parsed.diagnostics ?? {
                thread_id: threadId,
                activity_count: parsed.activities?.length ?? state.activitiesByThread[threadId]?.length ?? 0,
                last_loaded_at: new Date().toISOString(),
                last_fetch_error: null,
              },
            },
          }));
        } catch (error) {
          set((state: HelixStandbyActivityState) => ({
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: {
                thread_id: threadId,
                activity_count: state.activitiesByThread[threadId]?.length ?? 0,
                last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                last_fetch_error: error instanceof Error ? error.message : "fetch_failed",
              },
            },
          }));
        }
      },
    }),
    {
      name: "helix-standby-activity-v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state: HelixStandbyActivityState) => ({
        activitiesByThread: state.activitiesByThread,
        dismissedActivityIds: state.dismissedActivityIds,
        diagnosticsByThread: state.diagnosticsByThread,
      }),
    },
  ),
);

export const selectVisibleDockActivities = (
  state: HelixStandbyActivityState,
  threadId: string,
): HelixStandbyActivityItem[] =>
  (state.activitiesByThread[threadId] ?? []).filter(
    (activity: HelixStandbyActivityItem) =>
      !state.dismissedActivityIds[activity.activity_id] &&
      (activity.visibility === "helix_dock" || activity.visibility === "helix_dock_pinned"),
  );

export const selectLatestCallout = (
  state: HelixStandbyActivityState,
  threadId: string,
): HelixStandbyActivityItem | null =>
  selectVisibleDockActivities(state, threadId).find(
    (activity: HelixStandbyActivityItem) =>
      activity.kind === "callout_delivery" || activity.kind === "callout_proposal",
  ) ?? null;

export const selectRuntimeActivities = (
  state: HelixStandbyActivityState,
  roomId: string,
): HelixStandbyActivityItem[] =>
  Object.values(state.activitiesByThread)
    .flat()
    .filter((activity: HelixStandbyActivityItem) => activity.room_id === roomId);

export const selectSuppressionReasons = (
  state: HelixStandbyActivityState,
  roomId: string,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const activity of selectRuntimeActivities(state, roomId)) {
    if (activity.kind !== "suppression") continue;
    counts[activity.summary] = (counts[activity.summary] ?? 0) + 1;
  }
  return counts;
};
