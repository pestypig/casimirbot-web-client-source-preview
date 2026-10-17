import type { HelixTurnTranscriptRow } from "@/lib/helix/ask-turn-transcript";

const WORKSTATION_TRACE_LABELS = new Set([
  "Tool Request",
  "Tool Observation",
  "Action Request",
  "Action Observation",
  "Model Re-entry",
]);

function hasWorkstationTraceMarker(row: HelixTurnTranscriptRow): boolean {
  return /\b(?:workstation_gateway|workstation observation packet|tool observation|action observation|tool request|action request)\b/i.test(
    `${row.text} ${row.meta}`,
  );
}

export function isHelixAskRuntimeHeartbeatTraceRow(row: HelixTurnTranscriptRow): boolean {
  return /\bbackend_ask_runtime\b/i.test(row.meta) ||
    /\bruntime_heartbeat\b/i.test(`${row.status} ${row.meta}`) ||
    /\bBackend Ask runtime is still running\b/i.test(row.text);
}

export function isHelixAskConsoleWorkstationTraceRow(row: HelixTurnTranscriptRow): boolean {
  if (!WORKSTATION_TRACE_LABELS.has(row.label)) return false;
  return hasWorkstationTraceMarker(row);
}

export function selectHelixAskConsoleTurnTranscriptRowsForStream(
  rows: readonly HelixTurnTranscriptRow[],
): HelixTurnTranscriptRow[] {
  return rows.filter((row) => row.label !== "Final" && !isHelixAskRuntimeHeartbeatTraceRow(row));
}

export function selectHelixAskConsoleWorkstationTraceRows(
  rows: readonly HelixTurnTranscriptRow[],
): HelixTurnTranscriptRow[] {
  return selectHelixAskConsoleTurnTranscriptRowsForStream(rows).filter(isHelixAskConsoleWorkstationTraceRow);
}
