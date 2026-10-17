import type {
  TheoryBadgeEdgeV1,
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import {
  resolveTheoryBadgeConnectionTrace,
  type TheoryBadgeConnectionTraceResult,
} from "@/lib/theory/theoryBadgeConnectionTrace";

export type TheoryBadgeCombinationReaderBadge = {
  id: string;
  title: string;
  level: TheoryBadgeV1["level"];
  status: TheoryBadgeV1["status"];
};

export type TheoryBadgeCombinationReaderEdge = {
  id: string;
  from: string;
  to: string;
  relation: TheoryBadgeEdgeV1["relation"];
  lineStyle: "solid" | "dotted";
  implication: string;
};

export type TheoryBadgeCombinationReaderPayload = {
  schema: "theory_badge_graph_combination_reader/v1";
  graphId: string;
  selectedBadges: TheoryBadgeCombinationReaderBadge[];
  tracePathBadges: TheoryBadgeCombinationReaderBadge[];
  intermediateBadges: TheoryBadgeCombinationReaderBadge[];
  availableNextBadges: TheoryBadgeCombinationReaderBadge[];
  unavailableBadgeCount: number;
  disconnectedSelectedBadges: TheoryBadgeCombinationReaderBadge[];
  boundaryContext: {
    badges: TheoryBadgeCombinationReaderBadge[];
    notes: string[];
  };
  traceEdges: TheoryBadgeCombinationReaderEdge[];
  sharedSubjects: string[];
  sharedSymbols: string[];
  sharedUnitSignatures: string[];
  calculatorPayloadIds: string[];
  warnings: string[];
  implicationSummary: string[];
  suggestedNextBadgeIds: string[];
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function badgeSummary(badge: TheoryBadgeV1): TheoryBadgeCombinationReaderBadge {
  return {
    id: badge.id,
    title: badge.title,
    level: badge.level,
    status: badge.status,
  };
}

function edgeLineStyle(edge: TheoryBadgeEdgeV1): "solid" | "dotted" {
  return edge.relation === "shares_units" || edge.relation === "documents" || edge.relation === "blocks"
    ? "dotted"
    : "solid";
}

function edgeImplication(edge: TheoryBadgeEdgeV1): string {
  switch (edge.relation) {
    case "shares_units":
      return "Context relation: badges share units or dimensional language.";
    case "documents":
      return "Context relation: documentation/provenance supports the path.";
    case "blocks":
      return "Boundary relation: this edge limits interpretation or promotion.";
    case "requires":
      return "Dependency relation: the target needs the source concept.";
    case "derives":
      return "Derivation relation: the target follows from the source concept.";
    case "uses_constant":
      return "Constant relation: the path depends on a shared physical constant.";
    case "diagnostic_checks":
      return "Diagnostic relation: the edge supports checking, not proof promotion.";
    default:
      return "Direct theory relation in the computed path.";
  }
}

function summarizeImplications(args: {
  selectedCount: number;
  traceCount: number;
  intermediateCount: number;
  disconnectedCount: number;
  availableCount: number;
  boundaryCount: number;
  solidEdgeCount: number;
  dottedEdgeCount: number;
}): string[] {
  if (args.selectedCount === 0) {
    return ["No badges are selected; the whole graph is still available for exploration."];
  }

  const summary = [
    args.traceCount > 0
      ? `The current selection resolves to ${args.traceCount} trace badge${args.traceCount === 1 ? "" : "s"}.`
      : "The current selection does not yet resolve to a visible connection path.",
  ];

  if (args.intermediateCount > 0) {
    summary.push(`${args.intermediateCount} intermediate badge${args.intermediateCount === 1 ? "" : "s"} explain the bridge between selected badges.`);
  }
  if (args.disconnectedCount > 0) {
    summary.push(`${args.disconnectedCount} selected badge${args.disconnectedCount === 1 ? "" : "s"} are outside the computed trace.`);
  }
  if (args.solidEdgeCount > 0 || args.dottedEdgeCount > 0) {
    summary.push(`Solid edges carry direct theory relations; dotted edges carry context, unit, document, or boundary relations.`);
  }
  if (args.boundaryCount > 0) {
    summary.push(`${args.boundaryCount} boundary note${args.boundaryCount === 1 ? "" : "s"} limit what this combination can claim.`);
  }
  if (args.availableCount > 0) {
    summary.push(`${args.availableCount} next badge${args.availableCount === 1 ? " is" : "s are"} available for expanding this trace.`);
  }

  return summary;
}

export function buildTheoryBadgeCombinationReaderPayload(args: {
  graph: TheoryBadgeGraphV1;
  selectedBadgeIds: string[];
  trace: TheoryBadgeConnectionTraceResult | null;
  availableNextBadgeIds: string[];
}): TheoryBadgeCombinationReaderPayload {
  const badgesById = new Map(args.graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge]));
  const edgesById = new Map(args.graph.edges.map((edge: TheoryBadgeEdgeV1) => [edge.id, edge]));
  const selectedSet = new Set(args.selectedBadgeIds);
  const traceBadgeIds = args.trace?.connectingBadgeIds ?? (args.selectedBadgeIds.length === 1 ? args.selectedBadgeIds : []);
  const traceSet = new Set(traceBadgeIds);
  const availableSet = new Set(args.availableNextBadgeIds);

  const selectedBadges = args.selectedBadgeIds
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge))
    .map(badgeSummary);
  const tracePathBadges = traceBadgeIds
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge))
    .map(badgeSummary);
  const intermediateBadges = traceBadgeIds
    .filter((badgeId: string) => !selectedSet.has(badgeId))
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge))
    .map(badgeSummary);
  const availableNextBadges = args.availableNextBadgeIds
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge))
    .map(badgeSummary);
  const disconnectedSelectedBadges = args.selectedBadgeIds
    .filter((badgeId: string) => args.selectedBadgeIds.length > 1 && !traceSet.has(badgeId))
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge))
    .map(badgeSummary);
  const boundaryBadges = unique([
    ...traceBadgeIds,
    ...args.selectedBadgeIds,
  ])
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge) && badge.level === "claim_boundary")
    .map(badgeSummary);
  const traceEdges = (args.trace?.connectingEdgeIds ?? [])
    .map((edgeId: string) => edgesById.get(edgeId))
    .filter((edge): edge is TheoryBadgeEdgeV1 => Boolean(edge))
    .map((edge: TheoryBadgeEdgeV1) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      lineStyle: edgeLineStyle(edge),
      implication: edgeImplication(edge),
    }));
  const unavailableBadgeCount = args.graph.badges.filter((badge: TheoryBadgeV1) =>
    selectedSet.size > 0 && !selectedSet.has(badge.id) && !traceSet.has(badge.id) && !availableSet.has(badge.id),
  ).length;
  const solidEdgeCount = traceEdges.filter((edge) => edge.lineStyle === "solid").length;
  const dottedEdgeCount = traceEdges.filter((edge) => edge.lineStyle === "dotted").length;

  return {
    schema: "theory_badge_graph_combination_reader/v1",
    graphId: args.graph.graphId,
    selectedBadges,
    tracePathBadges,
    intermediateBadges,
    availableNextBadges,
    unavailableBadgeCount,
    disconnectedSelectedBadges,
    boundaryContext: {
      badges: boundaryBadges,
      notes: args.trace?.claimBoundaryNotes ?? [],
    },
    traceEdges,
    sharedSubjects: args.trace?.sharedSubjects ?? [],
    sharedSymbols: args.trace?.sharedSymbols ?? [],
    sharedUnitSignatures: args.trace?.sharedUnitSignatures ?? [],
    calculatorPayloadIds: args.trace?.calculatorPayloadIds ?? [],
    warnings: args.trace?.warnings ?? [],
    implicationSummary: summarizeImplications({
      selectedCount: selectedBadges.length,
      traceCount: tracePathBadges.length,
      intermediateCount: intermediateBadges.length,
      disconnectedCount: disconnectedSelectedBadges.length,
      availableCount: availableNextBadges.length,
      boundaryCount: (args.trace?.claimBoundaryNotes ?? []).length,
      solidEdgeCount,
      dottedEdgeCount,
    }),
    suggestedNextBadgeIds: availableNextBadges.slice(0, 8).map((badge) => badge.id),
  };
}

export function buildTheoryBadgeCombinationReaderPayloadForSelection(args: {
  graph: TheoryBadgeGraphV1;
  selectedBadgeIds: string[];
}): TheoryBadgeCombinationReaderPayload {
  const selectedBadgeIds = Array.from(new Set(args.selectedBadgeIds)).filter((badgeId) =>
    args.graph.badges.some((badge) => badge.id === badgeId),
  );
  const trace = selectedBadgeIds.length >= 2
    ? resolveTheoryBadgeConnectionTrace({ graph: args.graph, badgeIds: selectedBadgeIds })
    : null;
  const selected = new Set(selectedBadgeIds);
  const availableNextBadgeIds = selectedBadgeIds.length === 0
    ? []
    : args.graph.badges
      .filter((badge) => !selected.has(badge.id))
      .filter((badge) => {
        const candidateTrace = resolveTheoryBadgeConnectionTrace({
          graph: args.graph,
          badgeIds: [...selectedBadgeIds, badge.id],
        });
        return candidateTrace.connectingEdgeIds.length > 0 && candidateTrace.connectingBadgeIds.includes(badge.id);
      })
      .map((badge) => badge.id);

  return buildTheoryBadgeCombinationReaderPayload({
    graph: args.graph,
    selectedBadgeIds,
    trace,
    availableNextBadgeIds,
  });
}
