import type { AskLiveEventEntry } from "@/lib/helix/ask-debug-event-display";

export type HelixAskLiveTurnDisplayState = {
  events: AskLiveEventEntry[];
  version: number;
  lastEventId: string | null;
  lastUpdatedAtMs: number | null;
  duplicateEventCount: number;
};

export function createHelixAskLiveTurnDisplayState(): HelixAskLiveTurnDisplayState {
  return {
    events: [],
    version: 0,
    lastEventId: null,
    lastUpdatedAtMs: null,
    duplicateEventCount: 0,
  };
}

export function appendHelixAskLiveTurnDisplayEvent(
  state: HelixAskLiveTurnDisplayState,
  entry: AskLiveEventEntry,
  limit: number,
): HelixAskLiveTurnDisplayState {
  const id = entry.id.trim();
  if (!id) return state;
  if (state.events.some((event) => event.id === id)) {
    return {
      ...state,
      duplicateEventCount: state.duplicateEventCount + 1,
      lastUpdatedAtMs: Date.now(),
    };
  }
  const events = [...state.events, entry].slice(-Math.max(1, limit));
  return {
    ...state,
    events,
    version: state.version + 1,
    lastEventId: id,
    lastUpdatedAtMs: Date.now(),
  };
}
