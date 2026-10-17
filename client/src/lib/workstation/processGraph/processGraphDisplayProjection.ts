import type {
  WorkstationProcessEdge,
  WorkstationProcessGraphState,
  WorkstationProcessNode,
} from "./processGraphTypes";

export type WorkstationProcessGraphDisplayProjection = {
  nodes: Record<string, WorkstationProcessNode>;
  edges: Record<string, WorkstationProcessEdge>;
};

type DisplayProjectionOptions = {
  maxNodes: number;
  maxEdges: number;
};

function nodeSignature(node: WorkstationProcessNode): string {
  return [node.id, node.kind, node.label, node.status, node.updatedAt].join("\u001f");
}

function edgeSignature(edge: WorkstationProcessEdge): string {
  return [edge.id, edge.from, edge.to, edge.kind, edge.status, edge.updatedAt].join("\u001f");
}

export function buildWorkstationProcessGraphDisplayProjection(
  graph: WorkstationProcessGraphState,
  options: DisplayProjectionOptions,
): { projection: WorkstationProcessGraphDisplayProjection; signature: string } {
  const nodes = Object.values(graph.nodes)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, options.maxNodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Object.values(graph.edges)
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-options.maxEdges);

  return {
    projection: {
      nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
      edges: Object.fromEntries(edges.map((edge) => [edge.id, edge])),
    },
    signature: [nodes.map(nodeSignature).join("\u001e"), edges.map(edgeSignature).join("\u001e")].join("\u001d"),
  };
}

export function createWorkstationProcessGraphDisplaySelector(options: DisplayProjectionOptions) {
  let previousSignature = "";
  let previousProjection: WorkstationProcessGraphDisplayProjection | null = null;
  return (state: { graph: WorkstationProcessGraphState }): WorkstationProcessGraphDisplayProjection => {
    const next = buildWorkstationProcessGraphDisplayProjection(state.graph, options);
    if (previousProjection && next.signature === previousSignature) return previousProjection;
    previousSignature = next.signature;
    previousProjection = next.projection;
    return next.projection;
  };
}
