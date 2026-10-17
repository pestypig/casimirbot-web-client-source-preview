export type WorkstationProcessNodeKind =
  | "workspace"
  | "panel"
  | "helix_ask"
  | "tool"
  | "operation"
  | "artifact"
  | "source"
  | "memory"
  | "job"
  | "agent"
  | "evidence"
  | "error";

export type WorkstationProcessEdgeKind =
  | "opened"
  | "focused"
  | "requested"
  | "executed"
  | "produced"
  | "attached"
  | "routed"
  | "observed"
  | "verified"
  | "failed"
  | "depends_on";

export type WorkstationProcessStatus =
  | "idle"
  | "active"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stale"
  | "verified";

export type WorkstationProcessNode = {
  id: string;
  kind: WorkstationProcessNodeKind;
  label: string;
  status: WorkstationProcessStatus;
  panelId?: string;
  traceId?: string;
  jobId?: string;
  artifactKind?: string;
  createdAt: string;
  updatedAt: string;
  weight?: number;
  meta?: Record<string, unknown>;
};

export type WorkstationProcessEdge = {
  id: string;
  from: string;
  to: string;
  kind: WorkstationProcessEdgeKind;
  status: WorkstationProcessStatus;
  traceId?: string;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
};

export type WorkstationProcessGraphTimelineEntry = {
  id: string;
  ts: string;
  label: string;
  nodeIds?: string[];
  traceId?: string;
};

export type WorkstationProcessGraphState = {
  schemaVersion: "helix.workstation.process_graph/v1";
  sessionId: string;
  revision: number;
  updatedAt: string;
  activePanelId?: string;
  activeTraceIds: string[];
  nodes: Record<string, WorkstationProcessNode>;
  edges: Record<string, WorkstationProcessEdge>;
  timeline: string[];
  timelineEntries: Record<string, WorkstationProcessGraphTimelineEntry>;
  camera: {
    x: number;
    y: number;
    z: number;
    zoom: number;
  };
  view: {
    focusedNodeId?: string;
    filter?: string;
  };
};

export type WorkstationProcessGraphEvent =
  | {
      type: "panel.opened" | "panel.focused" | "panel.closed";
      panelId: string;
      label?: string;
      traceId?: string;
      ts?: string;
    }
  | {
      type: "tool.requested" | "tool.completed" | "tool.failed";
      tool: string;
      traceId: string;
      panelId?: string;
      label?: string;
      artifact?: Record<string, unknown> | null;
      ts?: string;
    }
  | {
      type: "operation.started" | "operation.completed" | "operation.failed";
      operationId: string;
      operationKind: string;
      traceId?: string;
      inputNodeIds?: string[];
      outputNodeIds?: string[];
      ts?: string;
    }
  | {
      type: "artifact.attached";
      artifactId: string;
      artifactKind: string;
      label: string;
      sourceNodeId?: string;
      traceId?: string;
      ts?: string;
    }
  | {
      type: "job.started" | "job.step" | "job.completed" | "job.failed";
      jobId: string;
      label: string;
      traceId?: string;
      panelId?: string;
      ts?: string;
      meta?: Record<string, unknown>;
    }
  | {
      type: "edge.upsert";
      from: string;
      to: string;
      kind: WorkstationProcessEdgeKind;
      status?: WorkstationProcessStatus;
      traceId?: string;
      ts?: string;
    };

export type WorkstationProcessGraphSnapshotArtifact = {
  kind: "workstation_process_graph_snapshot";
  schemaVersion: "helix.workstation.process_graph.snapshot/v1";
  sessionId: string;
  generatedAt: string;
  summary: {
    activePanelId?: string;
    activeJobs: number;
    runningOperations: number;
    failedNodes: number;
    staleSources: number;
    recentArtifacts: number;
  };
  nodes: Array<{
    id: string;
    kind: WorkstationProcessNodeKind;
    label: string;
    status: WorkstationProcessStatus;
    panelId?: string;
    traceId?: string;
    jobId?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: WorkstationProcessEdgeKind;
    status: WorkstationProcessStatus;
  }>;
  timeline: Array<{
    ts: string;
    label: string;
    nodeIds?: string[];
    traceId?: string;
  }>;
};
