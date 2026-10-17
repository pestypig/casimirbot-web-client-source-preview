import type { HelixAskReasoningTheaterSurfaceProps } from "./HelixAskReasoningTheaterSurface";

export type HelixAskReasoningTheaterStatusState = HelixAskReasoningTheaterSurfaceProps["status"];

export type HelixAskReasoningTheaterStatusStateOptions = HelixAskReasoningTheaterStatusState;

export function buildHelixAskReasoningTheaterStatusState({
  stanceBadgeClassName,
  stanceLabel,
  archetypeLabel,
  phaseLabel,
  certaintyLabel,
  medals,
  latestMedal,
  onMedalImageError,
}: HelixAskReasoningTheaterStatusStateOptions): HelixAskReasoningTheaterStatusState {
  return {
    stanceBadgeClassName,
    stanceLabel,
    archetypeLabel,
    phaseLabel,
    certaintyLabel,
    medals,
    latestMedal,
    onMedalImageError,
  };
}
