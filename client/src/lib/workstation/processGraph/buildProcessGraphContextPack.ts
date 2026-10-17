import type {
  WorkstationProcessGraphState,
  WorkstationProcessGraphTimelineEntry,
  WorkstationProcessNode,
} from "./processGraphTypes";

export type ProcessGraphContextPack = {
  kind: "workstation_process_graph_context_pack";
  schemaVersion: "helix.workstation.process_graph.context_pack/v1";
  generatedAt: string;
  summary: {
    activePanelId?: string;
    activeTraceCount: number;
    runningJobs: number;
    pendingOperations: number;
    failedItems: number;
    recentArtifacts: number;
  };
  active: Array<{
    id: string;
    kind: string;
    label: string;
    status: string;
    panelId?: string;
    traceId?: string;
    jobId?: string;
  }>;
  recentArtifacts: Array<{
    id: string;
    label: string;
    artifactKind?: string;
    status: string;
    traceId?: string;
  }>;
  recentTimeline: Array<{
    ts: string;
    label: string;
    traceId?: string;
    panelId?: string;
  }>;
  warnings: string[];
  observer_note: string;
};

type BuildProcessGraphContextPackOptions = {
  maxActive?: number;
  maxArtifacts?: number;
  maxTimeline?: number;
};

const SENSITIVE_FIELD_PATTERN =
  /chain[_-]?of[_-]?thought|hidden[_-]?reasoning|scratchpad|private[_-]?scratch|reasoning[_-]?trace/i;

function sanitizeVisibleText(value: unknown, fallback: string, maxChars = 160): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  if (SENSITIVE_FIELD_PATTERN.test(text)) return "[private graph detail]";
  return text.slice(0, maxChars);
}

function panelIdFromTimelineEntry(entry: WorkstationProcessGraphTimelineEntry): string | undefined {
  const panelNode = entry.nodeIds?.find((id) => id.startsWith("panel:"));
  return panelNode ? panelNode.slice("panel:".length) : undefined;
}

function nodeRecencyDesc(a: WorkstationProcessNode, b: WorkstationProcessNode): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function nodePriority(node: WorkstationProcessNode): number {
  if (node.status === "failed") return 110;
  if (node.status === "running" || node.status === "active" || node.status === "pending") return 100;
  if (node.kind === "job" || node.kind === "operation") return 70;
  if (node.kind === "panel") return 60;
  return 10;
}

export function buildProcessGraphContextPack(
  graph: WorkstationProcessGraphState,
  options: BuildProcessGraphContextPackOptions = {},
): ProcessGraphContextPack {
  const maxActive = Math.max(1, Math.min(24, options.maxActive ?? 12));
  const maxArtifacts = Math.max(0, Math.min(16, options.maxArtifacts ?? 8));
  const maxTimeline = Math.max(0, Math.min(24, options.maxTimeline ?? 10));
  const nodes = Object.values(graph.nodes);
  const activeNodes = nodes
    .filter((node) => ["active", "running", "pending", "failed"].includes(node.status))
    .sort((a, b) => {
      const priorityDelta = nodePriority(b) - nodePriority(a);
      return priorityDelta !== 0 ? priorityDelta : nodeRecencyDesc(a, b);
    })
    .slice(0, maxActive);
  const artifacts = nodes
    .filter((node) => node.kind === "artifact")
    .sort(nodeRecencyDesc)
    .slice(0, maxArtifacts);
  const timeline = graph.timeline
    .map((id) => graph.timelineEntries[id])
    .filter((entry): entry is WorkstationProcessGraphTimelineEntry => Boolean(entry))
    .slice(0, maxTimeline);
  const failedNodes = nodes.filter((node) => node.status === "failed");
  const staleNodes = nodes.filter((node) => node.status === "stale");
  const pendingNodes = nodes.filter((node) => node.status === "pending" || node.status === "running");

  const warnings = [
    failedNodes.length > 0 ? `${failedNodes.length} failed item${failedNodes.length === 1 ? "" : "s"}` : null,
    staleNodes.length > 0 ? `${staleNodes.length} stale item${staleNodes.length === 1 ? "" : "s"}` : null,
    pendingNodes.length > 0 ? `${pendingNodes.length} pending or running item${pendingNodes.length === 1 ? "" : "s"}` : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    kind: "workstation_process_graph_context_pack",
    schemaVersion: "helix.workstation.process_graph.context_pack/v1",
    generatedAt: new Date().toISOString(),
    summary: {
      activePanelId: graph.activePanelId ? sanitizeVisibleText(graph.activePanelId, "panel") : undefined,
      activeTraceCount: graph.activeTraceIds.length,
      runningJobs: nodes.filter((node) => node.kind === "job" && (node.status === "running" || node.status === "active")).length,
      pendingOperations: nodes.filter((node) => node.kind === "operation" && (node.status === "pending" || node.status === "running")).length,
      failedItems: failedNodes.length,
      recentArtifacts: artifacts.length,
    },
    active: activeNodes.map((node) => ({
      id: sanitizeVisibleText(node.id, node.kind),
      kind: node.kind,
      label: sanitizeVisibleText(node.label, node.kind),
      status: node.status,
      panelId: node.panelId ? sanitizeVisibleText(node.panelId, "panel") : undefined,
      traceId: node.traceId ? sanitizeVisibleText(node.traceId, "trace") : undefined,
      jobId: node.jobId ? sanitizeVisibleText(node.jobId, "job") : undefined,
    })),
    recentArtifacts: artifacts.map((node) => ({
      id: sanitizeVisibleText(node.id, "artifact"),
      label: sanitizeVisibleText(node.label, "artifact"),
      artifactKind: node.artifactKind ? sanitizeVisibleText(node.artifactKind, "artifact") : undefined,
      status: node.status,
      traceId: node.traceId ? sanitizeVisibleText(node.traceId, "trace") : undefined,
    })),
    recentTimeline: timeline.map((entry) => ({
      ts: entry.ts,
      label: sanitizeVisibleText(entry.label, "graph event"),
      traceId: entry.traceId ? sanitizeVisibleText(entry.traceId, "trace") : undefined,
      panelId: panelIdFromTimelineEntry(entry),
    })),
    warnings,
    observer_note:
      "The process graph is a lossy observer of workspace activity. Use typed receipts, artifacts, and adapter results as completion proof.",
  };
}
