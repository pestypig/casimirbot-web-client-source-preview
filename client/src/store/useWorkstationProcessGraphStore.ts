import { create } from "zustand";
import {
  buildProcessGraphContextPack,
  type ProcessGraphContextPack,
} from "@/lib/workstation/processGraph/buildProcessGraphContextPack";
import {
  applyWorkstationProcessGraphEvent,
  applyWorkstationProcessGraphEvents,
  buildWorkstationProcessGraphSnapshot,
  createInitialWorkstationProcessGraphState,
} from "@/lib/workstation/processGraph/processGraphReducer";
import {
  isPersistableProcessGraphChange,
  readPersistedWorkstationProcessGraph,
  WORKSTATION_PROCESS_GRAPH_PERSIST_DEBOUNCE_MS,
  writePersistedWorkstationProcessGraph,
} from "@/lib/workstation/processGraph/processGraphPersistence";
import type {
  WorkstationProcessEdge,
  WorkstationProcessGraphEvent,
  WorkstationProcessGraphSnapshotArtifact,
  WorkstationProcessGraphState,
  WorkstationProcessNode,
} from "@/lib/workstation/processGraph/processGraphTypes";

type WorkstationProcessGraphStore = {
  graph: WorkstationProcessGraphState;
  dispatch: (event: WorkstationProcessGraphEvent) => void;
  dispatchMany: (events: readonly WorkstationProcessGraphEvent[]) => void;
  focusNode: (nodeId?: string) => void;
  filterView: (filter?: string) => void;
  clearHistorical: () => void;
  reset: () => void;
  getSnapshotArtifact: (options?: {
    maxNodes?: number;
    includeTimeline?: boolean;
    includeArtifacts?: boolean;
  }) => WorkstationProcessGraphSnapshotArtifact;
  getContextPack: (options?: {
    maxActive?: number;
    maxArtifacts?: number;
    maxTimeline?: number;
  }) => ProcessGraphContextPack;
};

const hydratedProcessGraph = readPersistedWorkstationProcessGraph();

export const useWorkstationProcessGraphStore = create<WorkstationProcessGraphStore>()(
  (set, get) => ({
    graph: hydratedProcessGraph.graph,
    dispatch: (event) => set((state) => ({ graph: applyWorkstationProcessGraphEvent(state.graph, event) })),
    dispatchMany: (events) => {
      if (events.length === 0) return;
      set((state) => ({ graph: applyWorkstationProcessGraphEvents(state.graph, events) }));
    },
    focusNode: (nodeId) =>
      set((state) => ({
        graph: {
          ...state.graph,
          revision: state.graph.revision + 1,
          view: {
            ...state.graph.view,
            focusedNodeId: nodeId,
          },
        },
      })),
    filterView: (filter) =>
      set((state) => ({
        graph: {
          ...state.graph,
          revision: state.graph.revision + 1,
          view: {
            ...state.graph.view,
            filter: filter?.trim() || undefined,
          },
        },
      })),
    clearHistorical: () =>
      set((state) => {
        const cutoffMs = Date.now() - 5 * 60 * 1000;
        const keepNodes: Record<string, WorkstationProcessNode> = Object.fromEntries(
          Object.entries(state.graph.nodes).filter(([, node]) => {
            if (node.kind === "workspace" || node.kind === "helix_ask") return true;
            if (node.status === "active" || node.status === "running" || node.status === "pending") return true;
            return Date.parse(node.updatedAt) >= cutoffMs;
          }),
        );
        const keepEdges: Record<string, WorkstationProcessEdge> = Object.fromEntries(
          Object.entries(state.graph.edges).filter(([, edge]) => keepNodes[edge.from] && keepNodes[edge.to]),
        );
        return {
          graph: {
            ...state.graph,
            revision: state.graph.revision + 1,
            updatedAt: new Date().toISOString(),
            nodes: keepNodes,
            edges: keepEdges,
          },
        };
      }),
    reset: () => {
      discardQueuedWorkstationProcessGraphEvents();
      set({ graph: createInitialWorkstationProcessGraphState() });
    },
    getSnapshotArtifact: (options) => {
      flushQueuedWorkstationProcessGraphEvents();
      return buildWorkstationProcessGraphSnapshot(get().graph, options);
    },
    getContextPack: (options) => {
      flushQueuedWorkstationProcessGraphEvents();
      return buildProcessGraphContextPack(get().graph, options);
    },
  }),
);

let queuedEvents: WorkstationProcessGraphEvent[] = [];
let queuedFrameId: number | null = null;
let queuedFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistGraph: WorkstationProcessGraphState | null = null;

function cancelQueuedEventSchedule(): void {
  if (queuedFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(queuedFrameId);
  }
  if (queuedFallbackTimer !== null) clearTimeout(queuedFallbackTimer);
  queuedFrameId = null;
  queuedFallbackTimer = null;
}

function scheduleQueuedEventFlush(): void {
  if (queuedFrameId !== null || queuedFallbackTimer !== null) return;
  if (typeof window !== "undefined" && document.visibilityState === "visible") {
    queuedFrameId = window.requestAnimationFrame(() => flushQueuedWorkstationProcessGraphEvents());
  }
  queuedFallbackTimer = setTimeout(() => flushQueuedWorkstationProcessGraphEvents(), 48);
}

export function recordWorkstationProcessGraphEvent(event: WorkstationProcessGraphEvent): void {
  const previous = queuedEvents[queuedEvents.length - 1];
  if (
    event.type === "panel.focused" &&
    previous?.type === "panel.focused" &&
    event.panelId === previous.panelId &&
    event.traceId === previous.traceId
  ) {
    return;
  }
  queuedEvents.push(event);
  scheduleQueuedEventFlush();
}

export function flushQueuedWorkstationProcessGraphEvents(): void {
  cancelQueuedEventSchedule();
  if (queuedEvents.length === 0) return;
  const events = queuedEvents;
  queuedEvents = [];
  useWorkstationProcessGraphStore.getState().dispatchMany(events);
}

function discardQueuedWorkstationProcessGraphEvents(): void {
  cancelQueuedEventSchedule();
  queuedEvents = [];
}

export function flushWorkstationProcessGraphPersistence(): void {
  if (persistenceTimer !== null) clearTimeout(persistenceTimer);
  persistenceTimer = null;
  const graph = pendingPersistGraph;
  pendingPersistGraph = null;
  if (graph) writePersistedWorkstationProcessGraph(graph);
}

function scheduleWorkstationProcessGraphPersistence(graph: WorkstationProcessGraphState): void {
  pendingPersistGraph = graph;
  if (persistenceTimer !== null) clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(
    flushWorkstationProcessGraphPersistence,
    WORKSTATION_PROCESS_GRAPH_PERSIST_DEBOUNCE_MS,
  );
}

let previousPersistableGraph = useWorkstationProcessGraphStore.getState().graph;
const stopProcessGraphPersistence = useWorkstationProcessGraphStore.subscribe((state) => {
  const next = state.graph;
  if (!isPersistableProcessGraphChange(previousPersistableGraph, next)) {
    previousPersistableGraph = next;
    return;
  }
  previousPersistableGraph = next;
  scheduleWorkstationProcessGraphPersistence(next);
});

if (hydratedProcessGraph.migrated) {
  scheduleWorkstationProcessGraphPersistence(hydratedProcessGraph.graph);
}

if (typeof window !== "undefined") {
  const flushPendingGraphWork = () => {
    flushQueuedWorkstationProcessGraphEvents();
    flushWorkstationProcessGraphPersistence();
  };
  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flushPendingGraphWork();
  };
  window.addEventListener("pagehide", flushPendingGraphWork);
  document.addEventListener("visibilitychange", flushWhenHidden);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      flushPendingGraphWork();
      stopProcessGraphPersistence();
      window.removeEventListener("pagehide", flushPendingGraphWork);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    });
  }
}
