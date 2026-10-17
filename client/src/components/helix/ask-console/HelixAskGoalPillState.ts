import type { HelixAskGoalPillSurfaceProps } from "./HelixAskGoalPillSurface";

export type HelixAskGoalPillStateOptions = HelixAskGoalPillSurfaceProps;

export function buildHelixAskGoalPillState({
  session,
  expanded,
  busyAction,
  error,
  onToggleExpanded,
  onAction,
}: HelixAskGoalPillStateOptions): HelixAskGoalPillSurfaceProps {
  return {
    session,
    expanded,
    busyAction,
    error,
    onToggleExpanded,
    onAction,
  };
}
