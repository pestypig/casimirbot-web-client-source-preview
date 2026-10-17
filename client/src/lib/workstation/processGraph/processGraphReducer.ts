import type {
  WorkstationProcessEdge,
  WorkstationProcessEdgeKind,
  WorkstationProcessGraphEvent,
  WorkstationProcessGraphSnapshotArtifact,
  WorkstationProcessGraphState,
  WorkstationProcessGraphTimelineEntry,
  WorkstationProcessNode,
  WorkstationProcessNodeKind,
  WorkstationProcessStatus,
} from "./processGraphTypes";

const MAX_NODES = 240;
const MAX_EDGES = 420;
const MAX_TIMELINE = 500;
const MAX_ARTIFACT_PREVIEW_CHARS = 240;
const WORKSPACE_NODE_ID = "workspace:current";
const HELIX_NODE_ID = "helix:ask";
const SENSITIVE_FIELD_PATTERN =
  /chain[_-]?of[_-]?thought|hidden[_-]?reasoning|scratchpad|private[_-]?scratch|reasoning[_-]?trace/i;

function nowIso(): string {
  return new Date().toISOString();
}

function newSessionId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `process-graph:${random}`;
}

function cleanId(value: string): string {
  const safe = SENSITIVE_FIELD_PATTERN.test(value) ? "private-graph-detail" : value;
  return safe.trim().replace(/\s+/g, "-").replace(/[^\w:./-]+/g, "").slice(0, 120);
}

function nodeId(kind: WorkstationProcessNodeKind, value: string): string {
  return `${kind}:${cleanId(value) || "unknown"}`;
}

function edgeId(kind: WorkstationProcessEdgeKind, from: string, to: string, traceId?: string): string {
  return `${kind}:${from}->${to}:${cleanId(traceId ?? "session")}`;
}

function artifactKindFrom(value: Record<string, unknown> | null | undefined): string {
  const kind = value?.kind ?? value?.artifact_kind ?? value?.receipt_kind ?? value?.type;
  return typeof kind === "string" && kind.trim() ? kind.trim() : "artifact";
}

function sanitizeVisibleText(value: unknown, fallback: string, maxChars = 160): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  if (SENSITIVE_FIELD_PATTERN.test(text)) return "[private graph detail]";
  return text.slice(0, maxChars);
}

function artifactLabel(value: Record<string, unknown> | null | undefined, fallback: string): string {
  const label = value?.label ?? value?.title ?? value?.path ?? value?.note_title ?? value?.message;
  return sanitizeVisibleText(label, fallback, 96);
}

function sanitizeGraphMeta(value: unknown, depth = 0): unknown {
  if (depth > 2) return undefined;
  if (typeof value === "string") {
    return sanitizeVisibleText(value, "[private graph detail]", MAX_ARTIFACT_PREVIEW_CHARS);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((entry) => sanitizeGraphMeta(entry, depth + 1));
  }
  if (!value || typeof value !== "object") return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) continue;
    const sanitized = sanitizeGraphMeta(entry, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function statusFromEvent(type: string): WorkstationProcessStatus {
  if (type.endsWith(".failed")) return "failed";
  if (type.endsWith(".completed")) return "completed";
  if (type.endsWith(".closed")) return "stale";
  if (type.endsWith(".focused")) return "active";
  if (type.endsWith(".step")) return "running";
  if (type.endsWith(".requested")) return "pending";
  return "active";
}

function baseNode(ts: string, input: Omit<WorkstationProcessNode, "createdAt" | "updatedAt">): WorkstationProcessNode {
  return {
    ...input,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createInitialWorkstationProcessGraphState(sessionId = newSessionId()): WorkstationProcessGraphState {
  const ts = nowIso();
  return {
    schemaVersion: "helix.workstation.process_graph/v1",
    sessionId,
    revision: 0,
    updatedAt: ts,
    activeTraceIds: [],
    nodes: {
      [WORKSPACE_NODE_ID]: baseNode(ts, {
        id: WORKSPACE_NODE_ID,
        kind: "workspace",
        label: "Workspace",
        status: "active",
        weight: 1,
      }),
      [HELIX_NODE_ID]: baseNode(ts, {
        id: HELIX_NODE_ID,
        kind: "helix_ask",
        label: "Helix Ask",
        status: "idle",
        weight: 0.8,
      }),
    },
    edges: {},
    timeline: [],
    timelineEntries: {},
    camera: { x: 0, y: 0, z: 0, zoom: 1 },
    view: {},
  };
}

function upsertNode(
  state: WorkstationProcessGraphState,
  ts: string,
  patch: Omit<Partial<WorkstationProcessNode>, "id"> & Pick<WorkstationProcessNode, "id" | "kind" | "label" | "status">,
): void {
  const existing = state.nodes[patch.id];
  const label = sanitizeVisibleText(patch.label, existing?.label ?? patch.id);
  const duplicate =
    existing &&
    existing.updatedAt === ts &&
    existing.kind === patch.kind &&
    existing.label === label &&
    existing.status === patch.status;
  state.nodes[patch.id] = {
    ...existing,
    id: patch.id,
    kind: patch.kind,
    label,
    status: patch.status,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    panelId: patch.panelId ?? existing?.panelId,
    traceId: patch.traceId ?? existing?.traceId,
    jobId: patch.jobId ?? existing?.jobId,
    artifactKind: patch.artifactKind ?? existing?.artifactKind,
    weight: duplicate ? existing.weight : Math.min(3, (existing?.weight ?? 0.2) + (patch.weight ?? 0.18)),
    meta: sanitizeGraphMeta({ ...(existing?.meta ?? {}), ...(patch.meta ?? {}) }) as Record<string, unknown>,
  };
}

function upsertEdge(
  state: WorkstationProcessGraphState,
  ts: string,
  input: Omit<WorkstationProcessEdge, "id" | "createdAt" | "updatedAt"> & { id?: string },
): void {
  const id = input.id ?? edgeId(input.kind, input.from, input.to, input.traceId);
  const existing = state.edges[id];
  state.edges[id] = {
    ...existing,
    ...input,
    id,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    meta: { ...(existing?.meta ?? {}), ...(input.meta ?? {}) },
  };
}

function addTimeline(
  state: WorkstationProcessGraphState,
  entry: Omit<WorkstationProcessGraphTimelineEntry, "id"> & { id?: string },
): void {
  const label = sanitizeVisibleText(entry.label, "graph event", 180);
  const signature = `${entry.ts}:${label}:${entry.traceId ?? ""}:${(entry.nodeIds ?? []).join("|")}`;
  const id = entry.id ?? `graph-entry:${cleanId(signature) || `${Date.parse(entry.ts) || Date.now()}`}`;
  state.timelineEntries[id] = { ...entry, label, id };
  state.timeline = [id, ...state.timeline.filter((current) => current !== id)].slice(0, MAX_TIMELINE);
  const keep = new Set(state.timeline);
  for (const key of Object.keys(state.timelineEntries)) {
    if (!keep.has(key)) delete state.timelineEntries[key];
  }
}

function trimGraph(state: WorkstationProcessGraphState): void {
  const activePanelNodeId = state.activePanelId ? nodeId("panel", state.activePanelId) : undefined;
  const fixed = new Set([WORKSPACE_NODE_ID, HELIX_NODE_ID, activePanelNodeId].filter(Boolean));
  const activeTraceIds = new Set(state.activeTraceIds);
  const degree = new Map<string, number>();
  for (const edge of Object.values(state.edges)) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const now = Date.parse(state.updatedAt) || Date.now();
  const priority = (node: WorkstationProcessNode): number => {
    const ageMs = Math.max(0, now - (Date.parse(node.updatedAt) || now));
    if (fixed.has(node.id)) return 1000;
    if (node.status === "active" || node.status === "running" || node.status === "pending" || node.status === "failed") return 900;
    if (node.traceId && activeTraceIds.has(node.traceId)) return 800;
    if (node.kind === "artifact" && ageMs <= 60 * 60 * 1000) return 700;
    if ((degree.get(node.id) ?? 0) > 0) return 500;
    return 100;
  };
  const keepNodeIds = new Set(
    Object.values(state.nodes)
      .sort((a, b) => {
        const priorityDelta = priority(b) - priority(a);
        if (priorityDelta !== 0) return priorityDelta;
        const degreeDelta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
        if (degreeDelta !== 0) return degreeDelta;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, MAX_NODES)
      .map((node) => node.id),
  );
  for (const id of Object.keys(state.nodes)) {
    if (!keepNodeIds.has(id)) delete state.nodes[id];
  }

  const edgeIds = Object.values(state.edges)
    .filter((edge) => state.nodes[edge.from] && state.nodes[edge.to])
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_EDGES)
    .map((edge) => edge.id);
  const keepEdgeIds = new Set(edgeIds);
  for (const id of Object.keys(state.edges)) {
    if (!keepEdgeIds.has(id)) delete state.edges[id];
  }
}

function addTrace(state: WorkstationProcessGraphState, traceId: string | undefined, status: WorkstationProcessStatus): void {
  if (!traceId) return;
  if (status === "completed" || status === "failed" || status === "verified") {
    state.activeTraceIds = state.activeTraceIds.filter((id) => id !== traceId);
    return;
  }
  state.activeTraceIds = [traceId, ...state.activeTraceIds.filter((id) => id !== traceId)].slice(0, 24);
}

export function applyWorkstationProcessGraphEvent(
  current: WorkstationProcessGraphState,
  event: WorkstationProcessGraphEvent,
): WorkstationProcessGraphState {
  const ts = event.ts ?? nowIso();
  const state: WorkstationProcessGraphState = {
    ...current,
    revision: current.revision + 1,
    updatedAt: ts,
    activeTraceIds: [...current.activeTraceIds],
    nodes: { ...current.nodes },
    edges: { ...current.edges },
    timeline: [...current.timeline],
    timelineEntries: { ...current.timelineEntries },
    camera: { ...current.camera },
    view: { ...current.view },
  };

  if (event.type.startsWith("panel.")) {
    const status = statusFromEvent(event.type);
    const panelNodeId = nodeId("panel", event.panelId);
    upsertNode(state, ts, {
      id: panelNodeId,
      kind: "panel",
      label: event.label ?? event.panelId,
      status,
      panelId: event.panelId,
      traceId: event.traceId,
    });
    if (event.type === "panel.focused" || event.type === "panel.opened") {
      state.activePanelId = event.panelId;
    }
    upsertEdge(state, ts, {
      from: WORKSPACE_NODE_ID,
      to: panelNodeId,
      kind: event.type === "panel.closed" ? "observed" : event.type === "panel.focused" ? "focused" : "opened",
      status,
      traceId: event.traceId,
    });
    addTrace(state, event.traceId, status);
    addTimeline(state, { ts, label: `${event.type.replace(".", " ")}: ${event.label ?? event.panelId}`, nodeIds: [panelNodeId], traceId: event.traceId });
  }

  if (event.type.startsWith("tool.")) {
    const status = statusFromEvent(event.type);
    const toolNodeId = nodeId("tool", event.tool);
    upsertNode(state, ts, {
      id: toolNodeId,
      kind: "tool",
      label: event.label ?? event.tool,
      status,
      panelId: event.panelId,
      traceId: event.traceId,
    });
    upsertEdge(state, ts, {
      from: HELIX_NODE_ID,
      to: toolNodeId,
      kind: event.type === "tool.failed" ? "failed" : event.type === "tool.requested" ? "requested" : "executed",
      status,
      traceId: event.traceId,
    });
    if (event.panelId) {
      const panelNodeId = nodeId("panel", event.panelId);
      upsertNode(state, ts, { id: panelNodeId, kind: "panel", label: event.panelId, status: "active", panelId: event.panelId, traceId: event.traceId });
      upsertEdge(state, ts, { from: panelNodeId, to: toolNodeId, kind: "executed", status, traceId: event.traceId });
    }
    if (event.artifact) {
      const kind = artifactKindFrom(event.artifact);
      const artifactId = nodeId("artifact", `${event.traceId}:${kind}:${artifactLabel(event.artifact, event.tool)}`);
      upsertNode(state, ts, {
        id: artifactId,
        kind: "artifact",
        label: artifactLabel(event.artifact, kind),
        status: status === "failed" ? "failed" : "completed",
        traceId: event.traceId,
        artifactKind: kind,
        meta: { artifact: event.artifact },
      });
      upsertEdge(state, ts, { from: toolNodeId, to: artifactId, kind: status === "failed" ? "failed" : "produced", status, traceId: event.traceId });
    }
    addTrace(state, event.traceId, status);
    addTimeline(state, { ts, label: `${event.type.replace(".", " ")}: ${event.label ?? event.tool}`, nodeIds: [toolNodeId], traceId: event.traceId });
  }

  if (event.type.startsWith("operation.")) {
    const status = statusFromEvent(event.type);
    const operationNodeId = nodeId("operation", event.operationId);
    upsertNode(state, ts, {
      id: operationNodeId,
      kind: "operation",
      label: event.operationKind,
      status,
      traceId: event.traceId,
      meta: { operationId: event.operationId },
    });
    for (const input of event.inputNodeIds ?? []) {
      upsertEdge(state, ts, { from: input, to: operationNodeId, kind: "depends_on", status, traceId: event.traceId });
    }
    for (const output of event.outputNodeIds ?? []) {
      upsertEdge(state, ts, { from: operationNodeId, to: output, kind: "produced", status, traceId: event.traceId });
    }
    addTrace(state, event.traceId, status);
    addTimeline(state, { ts, label: `${event.type.replace(".", " ")}: ${event.operationKind}`, nodeIds: [operationNodeId], traceId: event.traceId });
  }

  if (event.type === "artifact.attached") {
    const artifactNodeId = nodeId("artifact", event.artifactId);
    upsertNode(state, ts, {
      id: artifactNodeId,
      kind: "artifact",
      label: event.label,
      status: "completed",
      traceId: event.traceId,
      artifactKind: event.artifactKind,
    });
    if (event.sourceNodeId) {
      upsertEdge(state, ts, { from: event.sourceNodeId, to: artifactNodeId, kind: "attached", status: "completed", traceId: event.traceId });
    }
    addTimeline(state, { ts, label: `artifact attached: ${event.label}`, nodeIds: [artifactNodeId], traceId: event.traceId });
  }

  if (event.type.startsWith("job.")) {
    const status = event.type === "job.step" ? "running" : statusFromEvent(event.type);
    const jobNodeId = nodeId("job", event.jobId);
    upsertNode(state, ts, {
      id: jobNodeId,
      kind: "job",
      label: event.label,
      status,
      panelId: event.panelId,
      traceId: event.traceId,
      jobId: event.jobId,
      meta: event.meta,
    });
    upsertEdge(state, ts, { from: HELIX_NODE_ID, to: jobNodeId, kind: event.type === "job.failed" ? "failed" : "routed", status, traceId: event.traceId });
    if (event.panelId) {
      const panelNodeId = nodeId("panel", event.panelId);
      upsertNode(state, ts, { id: panelNodeId, kind: "panel", label: event.panelId, status: "active", panelId: event.panelId, traceId: event.traceId });
      upsertEdge(state, ts, { from: panelNodeId, to: jobNodeId, kind: "requested", status, traceId: event.traceId });
    }
    addTrace(state, event.traceId, status);
    addTimeline(state, { ts, label: `${event.type.replace(".", " ")}: ${event.label}`, nodeIds: [jobNodeId], traceId: event.traceId });
  }

  if (event.type === "edge.upsert") {
    upsertEdge(state, ts, {
      from: event.from,
      to: event.to,
      kind: event.kind,
      status: event.status ?? "active",
      traceId: event.traceId,
    });
    addTimeline(state, { ts, label: `${event.kind}: ${event.from} -> ${event.to}`, nodeIds: [event.from, event.to], traceId: event.traceId });
  }

  trimGraph(state);
  return state;
}

export function applyWorkstationProcessGraphEvents(
  current: WorkstationProcessGraphState,
  events: readonly WorkstationProcessGraphEvent[],
): WorkstationProcessGraphState {
  return events.reduce(applyWorkstationProcessGraphEvent, current);
}

export function buildWorkstationProcessGraphSnapshot(
  state: WorkstationProcessGraphState,
  options: { maxNodes?: number; includeTimeline?: boolean; includeArtifacts?: boolean } = {},
): WorkstationProcessGraphSnapshotArtifact {
  const maxNodes = Math.max(1, Math.min(300, options.maxNodes ?? 120));
  const nodes = Object.values(state.nodes)
    .filter((node) => options.includeArtifacts !== false || node.kind !== "artifact")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, maxNodes);
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = Object.values(state.edges)
    .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, maxNodes * 2));
  const timeline = options.includeTimeline === false
    ? []
    : state.timeline
        .map((id) => state.timelineEntries[id])
        .filter((entry): entry is WorkstationProcessGraphTimelineEntry => Boolean(entry))
        .slice(0, 80);

  return {
    kind: "workstation_process_graph_snapshot",
    schemaVersion: "helix.workstation.process_graph.snapshot/v1",
    sessionId: state.sessionId,
    generatedAt: nowIso(),
    summary: {
      activePanelId: state.activePanelId ? sanitizeVisibleText(state.activePanelId, "panel") : undefined,
      activeJobs: nodes.filter((node) => node.kind === "job" && (node.status === "running" || node.status === "active")).length,
      runningOperations: nodes.filter((node) => node.kind === "operation" && node.status === "running").length,
      failedNodes: nodes.filter((node) => node.status === "failed").length,
      staleSources: nodes.filter((node) => node.kind === "source" && node.status === "stale").length,
      recentArtifacts: nodes.filter((node) => node.kind === "artifact").length,
    },
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: sanitizeVisibleText(node.label, node.kind),
      status: node.status,
      panelId: node.panelId ? sanitizeVisibleText(node.panelId, "panel") : undefined,
      traceId: node.traceId ? sanitizeVisibleText(node.traceId, "trace") : undefined,
      jobId: node.jobId ? sanitizeVisibleText(node.jobId, "job") : undefined,
    })),
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      status: edge.status,
    })),
    timeline: timeline.map((entry) => ({
      ts: entry.ts,
      label: sanitizeVisibleText(entry.label, "graph event"),
      nodeIds: entry.nodeIds,
      traceId: entry.traceId ? sanitizeVisibleText(entry.traceId, "trace") : undefined,
    })),
  };
}
