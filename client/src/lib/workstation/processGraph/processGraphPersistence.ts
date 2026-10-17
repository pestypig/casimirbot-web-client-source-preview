import type {
  WorkstationProcessEdge,
  WorkstationProcessGraphState,
  WorkstationProcessGraphTimelineEntry,
  WorkstationProcessNode,
} from "./processGraphTypes";
import { createInitialWorkstationProcessGraphState } from "./processGraphReducer";

export const WORKSTATION_PROCESS_GRAPH_STORAGE_KEY = "workstation-process-graph:v1";
export const WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION = 2;
export const WORKSTATION_PROCESS_GRAPH_PERSIST_DEBOUNCE_MS = 750;

const MAX_PERSISTED_NODES = 120;
const MAX_PERSISTED_EDGES = 240;
const MAX_PERSISTED_TIMELINE = 160;

type CompactProcessGraphState = Pick<
  WorkstationProcessGraphState,
  "schemaVersion" | "sessionId" | "revision" | "updatedAt" | "activePanelId" | "activeTraceIds"
> & {
  nodes: Record<string, WorkstationProcessNode>;
  edges: Record<string, WorkstationProcessEdge>;
  timeline: string[];
  timelineEntries: Record<string, WorkstationProcessGraphTimelineEntry>;
};

export type PersistedWorkstationProcessGraph = {
  version: typeof WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION;
  state: {
    graph: CompactProcessGraphState;
  };
};

type LegacyPersistedWorkstationProcessGraph = {
  version?: number;
  state?: {
    graph?: WorkstationProcessGraphState;
  };
};

function nodePriority(node: WorkstationProcessNode, graph: WorkstationProcessGraphState): number {
  if (node.id === "workspace:current" || node.id === "helix:ask") return 1_000;
  if (node.panelId && node.panelId === graph.activePanelId) return 950;
  if (["failed", "running", "active", "pending"].includes(node.status)) return 900;
  if (node.traceId && graph.activeTraceIds.includes(node.traceId)) return 850;
  if (node.kind === "artifact") return 800;
  if (node.kind === "job" || node.kind === "operation" || node.kind === "tool") return 700;
  return 100;
}

function compactNode(node: WorkstationProcessNode): WorkstationProcessNode {
  const { meta: _meta, ...compact } = node;
  return compact;
}

function compactEdge(edge: WorkstationProcessEdge): WorkstationProcessEdge {
  const { meta: _meta, ...compact } = edge;
  return compact;
}

export function compactWorkstationProcessGraph(
  graph: WorkstationProcessGraphState,
): CompactProcessGraphState {
  const nodes = Object.values(graph.nodes)
    .sort((a, b) => {
      const priority = nodePriority(b, graph) - nodePriority(a, graph);
      return priority !== 0 ? priority : Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    })
    .slice(0, MAX_PERSISTED_NODES)
    .map(compactNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Object.values(graph.edges)
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PERSISTED_EDGES)
    .map(compactEdge);
  const timeline = graph.timeline.slice(0, MAX_PERSISTED_TIMELINE);
  const timelineEntries = Object.fromEntries(
    timeline
      .map((id) => [id, graph.timelineEntries[id]] as const)
      .filter((entry): entry is readonly [string, WorkstationProcessGraphTimelineEntry] => Boolean(entry[1])),
  );

  return {
    schemaVersion: graph.schemaVersion,
    sessionId: graph.sessionId,
    revision: graph.revision,
    updatedAt: graph.updatedAt,
    activePanelId: graph.activePanelId,
    activeTraceIds: graph.activeTraceIds.slice(0, 24),
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(edges.map((edge) => [edge.id, edge])),
    timeline: timeline.filter((id) => Boolean(timelineEntries[id])),
    timelineEntries,
  };
}

export function serializeWorkstationProcessGraph(graph: WorkstationProcessGraphState): string {
  const payload: PersistedWorkstationProcessGraph = {
    version: WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION,
    state: { graph: compactWorkstationProcessGraph(graph) },
  };
  return JSON.stringify(payload);
}

function isGraphLike(value: unknown): value is WorkstationProcessGraphState {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<WorkstationProcessGraphState>;
  return (
    graph.schemaVersion === "helix.workstation.process_graph/v1" &&
    typeof graph.sessionId === "string" &&
    Boolean(graph.nodes && typeof graph.nodes === "object") &&
    Boolean(graph.edges && typeof graph.edges === "object") &&
    Array.isArray(graph.timeline) &&
    Boolean(graph.timelineEntries && typeof graph.timelineEntries === "object")
  );
}

export function hydrateWorkstationProcessGraph(value: string | null): {
  graph: WorkstationProcessGraphState;
  migrated: boolean;
} {
  if (!value) return { graph: createInitialWorkstationProcessGraphState(), migrated: false };
  try {
    const payload = JSON.parse(value) as LegacyPersistedWorkstationProcessGraph;
    const stored = payload?.state?.graph;
    if (!isGraphLike(stored)) {
      return { graph: createInitialWorkstationProcessGraphState(), migrated: true };
    }
    const compact = compactWorkstationProcessGraph(stored);
    const initial = createInitialWorkstationProcessGraphState(compact.sessionId);
    return {
      graph: {
        ...initial,
        ...compact,
        nodes: { ...initial.nodes, ...compact.nodes },
        edges: { ...compact.edges },
        timeline: [...compact.timeline],
        timelineEntries: { ...compact.timelineEntries },
        activeTraceIds: [...compact.activeTraceIds],
      },
      migrated: payload.version !== WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION,
    };
  } catch {
    return { graph: createInitialWorkstationProcessGraphState(), migrated: true };
  }
}

export function readPersistedWorkstationProcessGraph(): {
  graph: WorkstationProcessGraphState;
  migrated: boolean;
} {
  if (typeof window === "undefined") {
    return { graph: createInitialWorkstationProcessGraphState(), migrated: false };
  }
  try {
    return hydrateWorkstationProcessGraph(
      window.localStorage.getItem(WORKSTATION_PROCESS_GRAPH_STORAGE_KEY),
    );
  } catch {
    return { graph: createInitialWorkstationProcessGraphState(), migrated: false };
  }
}

export function writePersistedWorkstationProcessGraph(graph: WorkstationProcessGraphState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSTATION_PROCESS_GRAPH_STORAGE_KEY,
      serializeWorkstationProcessGraph(graph),
    );
  } catch (error) {
    console.warn("[workstation-process-graph] persistence skipped", error);
  }
}

export function isPersistableProcessGraphChange(
  previous: WorkstationProcessGraphState,
  next: WorkstationProcessGraphState,
): boolean {
  return (
    previous.nodes !== next.nodes ||
    previous.edges !== next.edges ||
    previous.timeline !== next.timeline ||
    previous.timelineEntries !== next.timelineEntries ||
    previous.activePanelId !== next.activePanelId ||
    previous.activeTraceIds !== next.activeTraceIds
  );
}
