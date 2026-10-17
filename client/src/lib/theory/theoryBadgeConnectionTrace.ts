import type {
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import { traceTheoryBadgeConnections } from "@shared/theory/theory-badge-overlap-locator";

export type TheoryBadgeConnectionTraceResult = {
  selectedBadgeIds: string[];
  connectingBadgeIds: string[];
  connectingEdgeIds: string[];
  sharedAncestorIds: string[];
  sharedSubjects: string[];
  sharedSymbols: string[];
  sharedUnitSignatures: string[];
  calculatorPayloadIds: string[];
  claimBoundaryNotes: string[];
  warnings: string[];
};

export function resolveTheoryBadgeConnectionTrace(args: {
  graph: TheoryBadgeGraphV1;
  badgeIds: string[];
}): TheoryBadgeConnectionTraceResult {
  const trace = traceTheoryBadgeConnections(args);
  const badgesById = new Map<string, TheoryBadgeV1>(
    args.graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge]),
  );
  const connectingEdgeIds = Array.from(
    new Set(trace.pathSegments.flatMap((segment) => segment.edgeIds)),
  );
  const calculatorPayloadIds = trace.connectingBadgeIds.flatMap((badgeId: string) => {
    const badge = badgesById.get(badgeId);
    return badge?.calculatorPayloads.map((payload) => payload.id) ?? [];
  });

  return {
    selectedBadgeIds: trace.selectedBadgeIds,
    connectingBadgeIds: trace.connectingBadgeIds,
    connectingEdgeIds,
    sharedAncestorIds: trace.sharedAncestorIds,
    sharedSubjects: trace.sharedSubjects,
    sharedSymbols: trace.sharedSymbols,
    sharedUnitSignatures: trace.sharedUnitSignatures,
    calculatorPayloadIds,
    claimBoundaryNotes: trace.claimBoundaryNotes,
    warnings: trace.warnings,
  };
}
