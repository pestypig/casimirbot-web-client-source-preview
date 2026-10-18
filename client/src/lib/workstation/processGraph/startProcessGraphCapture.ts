import { getPanelDef } from "@/lib/desktop/panelRegistry";
import {
  HELIX_ASK_LIVE_EVENT_BUS_EVENT,
  coerceHelixAskLiveEventBusPayload,
} from "@/lib/helix/liveEventsBus";
import {
  HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT,
  type HelixWorkstationProceduralStepPayload,
} from "@/lib/workstation/proceduralPlaybackContract";
import { useMobileAppStore } from "@/store/useMobileAppStore";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import {
  flushQueuedWorkstationProcessGraphEvents,
  recordWorkstationProcessGraphEvent,
} from "@/store/useWorkstationProcessGraphStore";
import {
  WORKSTATION_PROCESS_GRAPH_EVENT,
  isWorkstationProcessGraphEvent,
} from "./processGraphEvents";
import type { WorkstationProcessGraphEvent } from "./processGraphTypes";

const SELF_PANEL_ID = "workstation-process-graph";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function panelLabel(panelId: string): string {
  return getPanelDef(panelId)?.title ?? panelId;
}

function graphArtifactId(traceId: string | undefined, artifact: Record<string, unknown>, fallback: string): string {
  const explicit =
    asString(artifact.artifact_id) ??
    asString(artifact.receipt_id) ??
    asString(artifact.job_id) ??
    asString(artifact.note_id) ??
    asString(artifact.path);
  return explicit ?? `${traceId ?? "trace"}:${fallback}:${Date.now()}`;
}

function graphArtifactKind(artifact: Record<string, unknown>): string {
  return (
    asString(artifact.kind) ??
    asString(artifact.artifact_kind) ??
    asString(artifact.receipt_kind) ??
    "artifact"
  );
}

function graphArtifactLabel(artifact: Record<string, unknown>, fallback: string): string {
  return (
    asString(artifact.label) ??
    asString(artifact.title) ??
    asString(artifact.path) ??
    asString(artifact.message) ??
    fallback
  );
}

export type ProcessGraphPanelSnapshot = {
  panelIds: ReadonlySet<string>;
  activePanelId?: string;
};

export function diffProcessGraphPanelSnapshots(
  previous: ProcessGraphPanelSnapshot,
  next: ProcessGraphPanelSnapshot,
): WorkstationProcessGraphEvent[] {
  const events: WorkstationProcessGraphEvent[] = [];
  next.panelIds.forEach((panelId) => {
    if (previous.panelIds.has(panelId)) return;
    events.push({
      type: next.activePanelId === panelId ? "panel.focused" : "panel.opened",
      panelId,
      label: panelLabel(panelId),
    });
  });
  if (
    next.activePanelId &&
    next.activePanelId !== previous.activePanelId &&
    previous.panelIds.has(next.activePanelId)
  ) {
    events.push({
      type: "panel.focused",
      panelId: next.activePanelId,
      label: panelLabel(next.activePanelId),
    });
  }
  previous.panelIds.forEach((panelId) => {
    if (next.panelIds.has(panelId)) return;
    events.push({
      type: "panel.closed",
      panelId,
      label: panelLabel(panelId),
    });
  });
  return events;
}

export function startProcessGraphCapture(): () => void {
  if (typeof window === "undefined") return () => undefined;

  let lastLayoutSnapshot: ProcessGraphPanelSnapshot = { panelIds: new Set() };
  let lastMobileSnapshot: ProcessGraphPanelSnapshot = { panelIds: new Set() };
  const executionStatuses = new Map<string, string>();
  const record = (event: WorkstationProcessGraphEvent) => recordWorkstationProcessGraphEvent(event);
  const recordPanelTransition = (
    previous: ProcessGraphPanelSnapshot,
    next: ProcessGraphPanelSnapshot,
  ) => diffProcessGraphPanelSnapshots(previous, next).forEach(record);

  const onProcessGraphEvent = (event: Event) => {
    const detail = (event as CustomEvent<unknown>)?.detail;
    if (isWorkstationProcessGraphEvent(detail)) {
      record(detail);
    }
  };

  const onProcedural = (event: Event) => {
    const payload = (event as CustomEvent<HelixWorkstationProceduralStepPayload | null>)?.detail;
    if (!payload) return;
    const operationId = `${payload.traceId}:${payload.step}`;
    record({
      type: "operation.started",
      operationId,
      operationKind: payload.step,
      traceId: payload.traceId,
      inputNodeIds: payload.panelId ? [`panel:${payload.panelId}`] : undefined,
      ts: new Date().toISOString(),
    });
    if (payload.panelId) {
      record({
        type: "panel.focused",
        panelId: payload.panelId,
        label: panelLabel(payload.panelId),
        traceId: payload.traceId,
      });
    }
  };

  const onLiveEvent = (event: Event) => {
    const payload = coerceHelixAskLiveEventBusPayload((event as CustomEvent<unknown>)?.detail);
    if (!payload) return;
    const meta = asRecord(payload.entry.meta);
    const kind = asString(meta?.kind);
    const traceId = payload.traceId ?? asString(meta?.trace_id) ?? payload.entry.id;
    const artifact = asRecord(meta?.artifact);
    const ok = meta?.ok !== false;
    const ts = typeof payload.entry.ts === "string" ? payload.entry.ts : new Date().toISOString();

    if (kind === "workstation_action_receipt" || kind === "situation_room_setup_execution_receipt") {
      const action = asRecord(meta?.action);
      const panelId = asString(action?.panel_id);
      const actionId = asString(action?.action_id) ?? asString(action?.action);
      const tool = panelId && actionId ? `${panelId}.${actionId}` : payload.entry.tool ?? "workstation.action";
      if (panelId === SELF_PANEL_ID) {
        record({
          type: "panel.focused",
          panelId,
          label: panelLabel(panelId),
          traceId,
          ts,
        });
        return;
      }
      if (panelId && (action?.action === "open_panel" || actionId === "open")) {
        record({
          type: "panel.opened",
          panelId,
          label: panelLabel(panelId),
          traceId,
          ts,
        });
      }
      record({
        type: ok ? "tool.completed" : "tool.failed",
        tool,
        traceId,
        panelId,
        label: payload.entry.text,
        artifact,
        ts,
      });
      if (artifact) {
        record({
          type: "artifact.attached",
          artifactId: graphArtifactId(traceId, artifact, tool),
          artifactKind: graphArtifactKind(artifact),
          label: graphArtifactLabel(artifact, tool),
          sourceNodeId: `tool:${tool}`,
          traceId,
          ts,
        });
      }
      return;
    }

    if (kind === "job_started" || kind === "job_step_receipt" || kind === "job_completed") {
      const panelId = asString(meta?.panel_id);
      const jobId = asString(meta?.job_id) ?? traceId;
      record({
        type: kind === "job_completed" ? "job.completed" : kind === "job_started" ? "job.started" : "job.step",
        jobId,
        label: payload.entry.text,
        traceId,
        panelId,
        ts,
        meta: meta ?? undefined,
      });
      if (artifact) {
        record({
          type: "artifact.attached",
          artifactId: graphArtifactId(traceId, artifact, "job-artifact"),
          artifactKind: graphArtifactKind(artifact),
          label: graphArtifactLabel(artifact, "Job artifact"),
          sourceNodeId: `job:${jobId}`,
          traceId,
          ts,
        });
      }
    }
  };

  const stopLayout = useWorkstationLayoutStore.subscribe((state) => {
    const panelIds = Object.values(state.groups).flatMap((group) => group.panelIds);
    const next: ProcessGraphPanelSnapshot = {
      panelIds: new Set(panelIds),
      activePanelId: state.groups[state.activeGroupId]?.activePanelId ?? undefined,
    };
    recordPanelTransition(lastLayoutSnapshot, next);
    lastLayoutSnapshot = next;
  });

  const stopMobile = useMobileAppStore.subscribe((state) => {
    const panelIds = state.stack.map((entry) => entry.panelId);
    const next: ProcessGraphPanelSnapshot = {
      panelIds: new Set(panelIds),
      activePanelId: state.activeId ?? undefined,
    };
    recordPanelTransition(lastMobileSnapshot, next);
    lastMobileSnapshot = next;
  });

  const stopExecutions = useWorkstationActionExecutionStore.subscribe((state) => {
    state.order.slice(0, 8).forEach((executionId) => {
      const execution = state.executions[executionId];
      if (!execution) return;
      if (executionStatuses.get(executionId) === execution.status) return;
      executionStatuses.set(executionId, execution.status);
      const traceId = execution.trace_id ?? execution.execution_id;
      const tool = `${execution.panel_id}.${execution.action_id}`;
      if (execution.status === "planned" || execution.status === "dispatched") {
        record({
          type: "tool.requested",
          tool,
          traceId,
          panelId: execution.panel_id,
        });
      }
    });
  });

  window.addEventListener(WORKSTATION_PROCESS_GRAPH_EVENT, onProcessGraphEvent as EventListener);
  window.addEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, onProcedural as EventListener);
  window.addEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, onLiveEvent as EventListener);

  const layoutState = useWorkstationLayoutStore.getState();
  lastLayoutSnapshot = {
    panelIds: new Set(Object.values(layoutState.groups).flatMap((group) => group.panelIds)),
    activePanelId: layoutState.groups[layoutState.activeGroupId]?.activePanelId ?? undefined,
  };
  recordPanelTransition({ panelIds: new Set() }, lastLayoutSnapshot);
  const mobileState = useMobileAppStore.getState();
  lastMobileSnapshot = {
    panelIds: new Set(mobileState.stack.map((entry) => entry.panelId)),
    activePanelId: mobileState.activeId ?? undefined,
  };
  recordPanelTransition({ panelIds: new Set() }, lastMobileSnapshot);

  return () => {
    window.removeEventListener(WORKSTATION_PROCESS_GRAPH_EVENT, onProcessGraphEvent as EventListener);
    window.removeEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, onProcedural as EventListener);
    window.removeEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, onLiveEvent as EventListener);
    stopLayout();
    stopMobile();
    stopExecutions();
    flushQueuedWorkstationProcessGraphEvents();
  };
}
