import {
  HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT,
  type HelixWorkstationProceduralStepPayload,
} from "@/lib/workstation/proceduralPlaybackContract";
import {
  HELIX_ASK_LIVE_EVENT_BUS_EVENT,
  coerceHelixAskLiveEventBusPayload,
} from "@/lib/helix/liveEventsBus";
import { recordWorkstationTimelineEntry } from "@/store/useWorkstationWorkflowTimelineStore";

function proceduralLabel(payload: HelixWorkstationProceduralStepPayload): string {
  const topic = payload.topic?.trim();
  switch (payload.step) {
    case "open_doc":
      return `Opened document ${payload.docPath ?? ""}`.trim();
    case "highlight_copy":
      return `Highlighted section${topic ? ` (${topic})` : ""}`;
    case "paste_note":
      return `Pasted into note${topic ? ` (${topic})` : ""}`;
    case "save_note":
      return `Saved note${topic ? ` (${topic})` : ""}`;
    case "compare_topics_start":
      return `Started compare topics${topic ? ` (${topic})` : ""}`;
    default:
      return `Procedural step: ${payload.step}`;
  }
}

export function startWorkstationTimelineCapture(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onProcedural = (event: Event) => {
    const payload = (event as CustomEvent<HelixWorkstationProceduralStepPayload | null>)?.detail;
    if (!payload) return;
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: proceduralLabel(payload),
      detail: payload.docPath ? `doc=${payload.docPath}` : undefined,
      traceId: payload.traceId,
      panelId: payload.panelId,
      step: payload.step,
    });
  };

  const onLiveEvent = (event: Event) => {
    const payload = coerceHelixAskLiveEventBusPayload((event as CustomEvent<unknown>)?.detail);
    if (!payload) return;
    const kind =
      payload.entry.meta && typeof payload.entry.meta.kind === "string"
        ? payload.entry.meta.kind
        : "";
    if (
      kind !== "workstation_action_receipt" &&
      kind !== "workstation_procedural_step" &&
      kind !== "job_started" &&
      kind !== "job_step_receipt" &&
      kind !== "job_completed"
    ) {
      return;
    }
    recordWorkstationTimelineEntry({
      lane: "chat",
      label: payload.entry.text,
      traceId: payload.traceId,
      detail: payload.entry.tool,
      panelId: "agi-essence-console",
    });
  };

  window.addEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, onProcedural as EventListener);
  window.addEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, onLiveEvent as EventListener);
  return () => {
    window.removeEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, onProcedural as EventListener);
    window.removeEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, onLiveEvent as EventListener);
  };
}
