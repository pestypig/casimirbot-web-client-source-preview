import type { ScientificCalculatorDebugEvent } from "@/store/useScientificCalculatorStore";

export type ScientificCalculatorDebugSnapshot = {
  kind: "scientific_calculator_debug_log";
  panel_id: "scientific-calculator";
  event_count: number;
  latest_event_id: string | null;
  events: ScientificCalculatorDebugEvent[];
};

export function buildScientificCalculatorDebugSnapshot(
  events: ScientificCalculatorDebugEvent[],
  limit = 40,
): ScientificCalculatorDebugSnapshot {
  const selected = events.slice(0, Math.max(1, Math.min(160, limit)));
  return {
    kind: "scientific_calculator_debug_log",
    panel_id: "scientific-calculator",
    event_count: selected.length,
    latest_event_id: selected[0]?.id ?? null,
    events: selected,
  };
}

export function formatScientificCalculatorDebugLog(events: ScientificCalculatorDebugEvent[], limit = 40): string {
  return JSON.stringify(buildScientificCalculatorDebugSnapshot(events, limit), null, 2);
}
