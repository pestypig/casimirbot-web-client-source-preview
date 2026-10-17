import type { AgentGoalSessionV1 } from "@shared/contracts/workstation-goal-context.v1";
import {
  HelixAskGoalPill,
  type StagePlayGoalSessionAction,
} from "./HelixAskGoalPill";

export type HelixAskGoalPillSurfaceProps = {
  session: AgentGoalSessionV1 | null;
  expanded: boolean;
  busyAction: StagePlayGoalSessionAction | null;
  error: string | null;
  onToggleExpanded: () => void;
  onAction: (action: StagePlayGoalSessionAction) => void;
};

export function HelixAskGoalPillSurface({
  session,
  expanded,
  busyAction,
  error,
  onToggleExpanded,
  onAction,
}: HelixAskGoalPillSurfaceProps) {
  if (!session) return null;

  return (
    <HelixAskGoalPill
      session={session}
      expanded={expanded}
      busyAction={busyAction}
      error={error}
      onToggleExpanded={onToggleExpanded}
      onAction={onAction}
    />
  );
}
