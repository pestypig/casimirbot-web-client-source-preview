import { create } from "zustand";
import type { HelixPhysicsToolLoopCommentaryEventV1 } from "@shared/helix-physics-tool-loop-commentary";

const MAX_TIMELINE_EVENTS = 100;

type HelixToolLoopTimelineState = {
  events: HelixPhysicsToolLoopCommentaryEventV1[];
  activePlanId: string | null;
  appendEvent: (event: HelixPhysicsToolLoopCommentaryEventV1) => void;
  appendEvents: (events: HelixPhysicsToolLoopCommentaryEventV1[]) => void;
  clearTimeline: () => void;
};

export const useHelixToolLoopTimelineStore = create<HelixToolLoopTimelineState>()((set) => ({
  events: [],
  activePlanId: null,
  appendEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_TIMELINE_EVENTS),
      activePlanId: event.planId,
    })),
  appendEvents: (events) =>
    set((state) => {
      const normalizedEvents = events.slice().reverse();
      return {
        events: [...normalizedEvents, ...state.events].slice(0, MAX_TIMELINE_EVENTS),
        activePlanId: normalizedEvents[0]?.planId ?? state.activePlanId,
      };
    }),
  clearTimeline: () => set({ events: [], activePlanId: null }),
}));
