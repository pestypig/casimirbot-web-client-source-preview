import type { AgentGoalSessionV1 } from "@shared/contracts/workstation-goal-context.v1";

export function labelizeGoalPillValue(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "none";
}

export function formatGoalPillCadence(cadence: AgentGoalSessionV1["cadence"]): string {
  if (cadence.kind === "interval") return `${Math.round(cadence.everyMs / 1000)}s interval`;
  if (cadence.kind === "event_accumulation") return `${cadence.minUpdates} updates`;
  if (cadence.kind === "user_turn_only") return "user turns";
  return "manual";
}
