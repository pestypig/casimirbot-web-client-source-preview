import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskObserverSupplementState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "showObserverLane" | "conversationBriefText" | "observerLaneVisible" | "observerLaneEvents"
>;

export type HelixAskObserverSupplementStateOptions = HelixAskObserverSupplementState;

export function buildHelixAskObserverSupplementState({
  showObserverLane,
  conversationBriefText,
  observerLaneVisible,
  observerLaneEvents,
}: HelixAskObserverSupplementStateOptions): HelixAskObserverSupplementState {
  return {
    showObserverLane,
    conversationBriefText,
    observerLaneVisible,
    observerLaneEvents,
  };
}
