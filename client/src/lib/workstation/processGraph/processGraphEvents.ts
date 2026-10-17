import type { WorkstationProcessGraphEvent } from "./processGraphTypes";

export const WORKSTATION_PROCESS_GRAPH_EVENT = "helix:workstation:process-graph-event";

export function emitWorkstationProcessGraphEvent(event: WorkstationProcessGraphEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkstationProcessGraphEvent>(WORKSTATION_PROCESS_GRAPH_EVENT, {
      detail: event,
    }),
  );
}

export function isWorkstationProcessGraphEvent(value: unknown): value is WorkstationProcessGraphEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.includes(".");
}
