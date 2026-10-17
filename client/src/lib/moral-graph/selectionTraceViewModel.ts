import type { MoralGraphBiomeId, MoralGraphEdge, MoralGraphNode } from "./biomeScaleViewModel";

export type MoralGraphTraceStatus = "idle" | "building" | "requires_boundary_check" | "conflict";

export type MoralGraphSelectionTraceViewModel = {
  activeNodeIds: Set<string>;
  candidateNodeIds: Set<string>;
  blockedNodeIds: Set<string>;
  conflictNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
  candidateEdgeIds: Set<string>;
  blockedEdgeIds: Set<string>;
  traceStatus: MoralGraphTraceStatus;
  traceReason: string;
};

type BuildSelectionTraceViewModelInput = {
  nodes: MoralGraphNode[];
  edges: MoralGraphEdge[];
  selectedNodeIds: string[];
};

const BIOME_ORDER: MoralGraphBiomeId[] = [
  "pre_boundary_conditions",
  "substrate_boundary",
  "substrate_sensing",
  "maintenance_response",
  "action_selection",
  "coordination_scale",
  "mandate_authority",
  "objective_binding",
];

const CHECK_BIOMES = new Set<MoralGraphBiomeId>(["claim_boundary", "frontier_mechanism"]);

const biomeRank = (biome: MoralGraphBiomeId): number => {
  const index = BIOME_ORDER.indexOf(biome);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
};

const isBoundaryOrConflictNode = (node: MoralGraphNode): boolean =>
  node.tone === "boundary" ||
  node.procedureOperator === "blocks" ||
  node.maturity === "boundary" ||
  node.actionManifestation === "blocking";

const isCheckNode = (node: MoralGraphNode): boolean =>
  CHECK_BIOMES.has(node.biome) || node.maturity === "frontier" || isBoundaryOrConflictNode(node);

const uniqueKnownIds = (ids: string[], nodeById: Map<string, MoralGraphNode>): string[] =>
  Array.from(new Set(ids.filter((id) => nodeById.has(id))));

const nodeIdsForRank = (nodes: MoralGraphNode[], rank: number): string[] =>
  nodes.filter((node) => biomeRank(node.biome) === rank && !isCheckNode(node)).map((node) => node.id);

const edgeTouchesAny = (edge: MoralGraphEdge, ids: Set<string>): boolean => ids.has(edge.from) || ids.has(edge.to);

const edgeConnectsActiveToCandidate = (edge: MoralGraphEdge, active: Set<string>, candidate: Set<string>): boolean =>
  (active.has(edge.from) && candidate.has(edge.to)) || (candidate.has(edge.from) && active.has(edge.to));

const edgeConnectsCandidates = (edge: MoralGraphEdge, candidate: Set<string>): boolean =>
  candidate.has(edge.from) && candidate.has(edge.to);

export function buildMoralGraphSelectionTraceViewModel(
  input: BuildSelectionTraceViewModelInput,
): MoralGraphSelectionTraceViewModel {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const));
  const selectedNodeIds = uniqueKnownIds(input.selectedNodeIds, nodeById);
  const activeNodeIds = new Set<string>(selectedNodeIds);
  const candidateNodeIds = new Set<string>();
  const blockedNodeIds = new Set<string>();
  const conflictNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  const candidateEdgeIds = new Set<string>();
  const blockedEdgeIds = new Set<string>();
  const selectedNodes = selectedNodeIds.map((id) => nodeById.get(id)).filter((node): node is MoralGraphNode => Boolean(node));

  if (selectedNodes.length === 0) {
    return {
      activeNodeIds,
      candidateNodeIds,
      blockedNodeIds,
      conflictNodeIds,
      activeEdgeIds,
      candidateEdgeIds,
      blockedEdgeIds,
      traceStatus: "idle",
      traceReason: "Select a substrate boundary badge to begin a procedural trace.",
    };
  }

  let highestRank = -1;
  let hasLaterSelection = false;
  let hasConflict = false;
  const selectedRanks = new Set<number>();
  for (const node of selectedNodes) {
    if (isBoundaryOrConflictNode(node) || node.maturity === "frontier") {
      conflictNodeIds.add(node.id);
      hasConflict = true;
      continue;
    }
    const rank = biomeRank(node.biome);
    if (Number.isFinite(rank)) {
      highestRank = Math.max(highestRank, rank);
      selectedRanks.add(rank);
    }
    if (rank >= 3) hasLaterSelection = true;
  }

  const missingEarlierSubstrate =
    highestRank > 0 && Array.from({ length: highestRank }, (_, rank) => rank).some((rank) => !selectedRanks.has(rank));
  const selectedTraceCompleteToCurrentScale =
    highestRank >= 0 && Array.from({ length: highestRank + 1 }, (_, rank) => rank).every((rank) => selectedRanks.has(rank));

  if (highestRank >= 0) {
    for (let rank = 0; rank <= highestRank; rank += 1) {
      for (const id of nodeIdsForRank(input.nodes, rank)) {
        if (!activeNodeIds.has(id)) candidateNodeIds.add(id);
      }
    }
    if (selectedTraceCompleteToCurrentScale) {
      for (const id of nodeIdsForRank(input.nodes, highestRank + 1)) candidateNodeIds.add(id);
    }
  }

  for (const node of input.nodes) {
    if (activeNodeIds.has(node.id) || candidateNodeIds.has(node.id) || conflictNodeIds.has(node.id)) continue;
    if (isCheckNode(node)) {
      if (hasConflict || hasLaterSelection) candidateNodeIds.add(node.id);
      else blockedNodeIds.add(node.id);
      continue;
    }
    const rank = biomeRank(node.biome);
    const allowedForwardRank = selectedTraceCompleteToCurrentScale ? highestRank + 1 : highestRank;
    if (rank > allowedForwardRank) blockedNodeIds.add(node.id);
  }

  for (const edge of input.edges) {
    if (activeNodeIds.has(edge.from) && activeNodeIds.has(edge.to)) {
      activeEdgeIds.add(edge.id);
    } else if (
      edgeConnectsActiveToCandidate(edge, activeNodeIds, candidateNodeIds) ||
      edgeConnectsCandidates(edge, candidateNodeIds)
    ) {
      candidateEdgeIds.add(edge.id);
    } else if (edgeTouchesAny(edge, conflictNodeIds) || edgeTouchesAny(edge, blockedNodeIds)) {
      blockedEdgeIds.add(edge.id);
    }
  }

  const hasSelectedChecks = selectedNodes.some(isCheckNode);
  const traceStatus: MoralGraphTraceStatus = hasConflict || hasSelectedChecks
    ? "conflict"
    : hasLaterSelection && missingEarlierSubstrate
      ? "requires_boundary_check"
      : "building";
  const traceReason =
    traceStatus === "conflict"
      ? "The selected trace includes a boundary, blocker, or frontier badge, so it can only support a caution/check posture."
      : traceStatus === "requires_boundary_check"
        ? "A later complexity badge was selected; earlier substrate dependencies are available as candidates, not completed trace steps."
        : "The selected badges form a procedural trace with valid next continuations highlighted.";

  return {
    activeNodeIds,
    candidateNodeIds,
    blockedNodeIds,
    conflictNodeIds,
    activeEdgeIds,
    candidateEdgeIds,
    blockedEdgeIds,
    traceStatus,
    traceReason,
  };
}
