import { create } from "zustand";
import type { StandbyCognitionMode, StandbyWorkItem } from "@shared/helix-standby-queue";

type StandbyCognitionQueueState = {
  modeByRoom: Record<string, StandbyCognitionMode>;
  items: StandbyWorkItem[];
  pausedRooms: Record<string, boolean>;
  setMode: (roomId: string, mode: StandbyCognitionMode) => void;
  upsertItem: (item: StandbyWorkItem) => void;
  setPaused: (roomId: string, paused: boolean) => void;
  clearRoom: (roomId: string) => void;
};

export const useStandbyCognitionQueueStore = create<StandbyCognitionQueueState>()(
  (set: (partial: Partial<StandbyCognitionQueueState> | ((state: StandbyCognitionQueueState) => Partial<StandbyCognitionQueueState>)) => void) => ({
  modeByRoom: {},
  items: [],
  pausedRooms: {},
  setMode: (roomId: string, mode: StandbyCognitionMode) =>
    set((state: StandbyCognitionQueueState) => ({
      modeByRoom: { ...state.modeByRoom, [roomId]: mode },
    })),
  upsertItem: (item: StandbyWorkItem) =>
    set((state: StandbyCognitionQueueState) => {
      const existing = state.items.filter((entry: StandbyWorkItem) => entry.work_id !== item.work_id);
      return { items: [...existing, item].sort((a: StandbyWorkItem, b: StandbyWorkItem) => a.created_at.localeCompare(b.created_at)) };
    }),
  setPaused: (roomId: string, paused: boolean) =>
    set((state: StandbyCognitionQueueState) => ({
      pausedRooms: { ...state.pausedRooms, [roomId]: paused },
    })),
  clearRoom: (roomId: string) =>
    set((state: StandbyCognitionQueueState) => ({
      items: state.items.filter((item: StandbyWorkItem) => item.room_id !== roomId),
    })),
}));
