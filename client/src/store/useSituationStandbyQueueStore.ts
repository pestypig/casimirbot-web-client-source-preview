import { create } from "zustand";
import type { StandbyQueueItem } from "@shared/helix-standby-queue";

const MAX_QUEUE_ROWS = 100;

type SituationStandbyQueueState = {
  paused_by_key: Record<string, boolean>;
  items_by_key: Record<string, StandbyQueueItem[]>;
  setPaused: (roomId: string, graphId: string | null | undefined, paused: boolean) => void;
  upsertItems: (roomId: string, graphId: string | null | undefined, items: StandbyQueueItem[]) => void;
  reset: () => void;
};

const standbyQueueKey = (roomId: string, graphId?: string | null): string =>
  `${roomId}:${graphId ?? "room"}`;

export const useSituationStandbyQueueStore = create<SituationStandbyQueueState>()(
  (set: (partial: Partial<SituationStandbyQueueState> | ((state: SituationStandbyQueueState) => Partial<SituationStandbyQueueState>)) => void) => ({
  paused_by_key: {},
  items_by_key: {},
  setPaused: (roomId: string, graphId: string | null | undefined, paused: boolean) =>
    set((state: SituationStandbyQueueState) => ({
      paused_by_key: { ...state.paused_by_key, [standbyQueueKey(roomId, graphId)]: paused },
    })),
  upsertItems: (roomId: string, graphId: string | null | undefined, items: StandbyQueueItem[]) =>
    set((state: SituationStandbyQueueState) => {
      const key = standbyQueueKey(roomId, graphId);
      const existing = state.items_by_key[key] ?? [];
      const byId = new Map(existing.map((item: StandbyQueueItem) => [item.queue_item_id, item]));
      for (const item of items) byId.set(item.queue_item_id, item);
      return {
        items_by_key: {
          ...state.items_by_key,
          [key]: Array.from(byId.values())
            .sort((a: StandbyQueueItem, b: StandbyQueueItem) => b.created_at.localeCompare(a.created_at))
            .slice(0, MAX_QUEUE_ROWS),
        },
      };
    }),
  reset: () => set({ paused_by_key: {}, items_by_key: {} }),
  }),
);

export const buildSituationStandbyQueueKey = standbyQueueKey;
