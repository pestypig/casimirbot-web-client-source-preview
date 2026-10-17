import type {
  TheoryBadgeEdgeV1,
  TheoryBadgeEdgeRelation,
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";

export const THEORY_PLAYBACK_EXECUTABLE_RELATIONS = new Set<TheoryBadgeEdgeRelation>([
  "derives",
  "requires",
  "specializes",
  "approximates",
  "bounds",
  "uses_constant",
  "numerically_solves",
  "diagnostic_checks",
]);

export const THEORY_PLAYBACK_NON_EXECUTABLE_RELATIONS = new Set<TheoryBadgeEdgeRelation>([
  "shares_units",
  "documents",
  "blocks",
]);

export type TheoryBadgePlaybackPlan = {
  orderedBadgeIds: string[];
  executableRelationTypes: string[];
  skippedRelationTypes: string[];
  warnings: string[];
};

export function resolveTheoryBadgePlaybackPlan(args: {
  graph: TheoryBadgeGraphV1;
  targetBadgeId: string;
}): TheoryBadgePlaybackPlan {
  const { graph, targetBadgeId } = args;
  const warnings: string[] = [];
  const badgesById = new Map<string, TheoryBadgeV1>(
    graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge]),
  );
  const incomingByTarget = new Map<string, TheoryBadgeEdgeV1[]>();
  const executableRelationTypes = new Set<string>();
  const skippedRelationTypes = new Set<string>();
  const included = new Set<string>();
  const visiting = new Set<string>();
  const orderedBadgeIds: string[] = [];

  for (const edge of graph.edges) {
    incomingByTarget.set(edge.to, [...(incomingByTarget.get(edge.to) ?? []), edge]);
  }

  if (!badgesById.has(targetBadgeId)) {
    return {
      orderedBadgeIds: [],
      executableRelationTypes: [],
      skippedRelationTypes: [],
      warnings: [`target badge not found: ${targetBadgeId}`],
    };
  }

  const visit = (badgeId: string, path: string[]) => {
    if (!badgesById.has(badgeId)) {
      warnings.push(`missing badge in playback path: ${badgeId}`);
      return;
    }
    if (included.has(badgeId)) return;
    if (visiting.has(badgeId)) {
      warnings.push(`cycle detected in playback path: ${[...path, badgeId].join(" -> ")}`);
      return;
    }

    visiting.add(badgeId);
    const incoming = incomingByTarget.get(badgeId) ?? [];
    for (const edge of incoming) {
      if (THEORY_PLAYBACK_EXECUTABLE_RELATIONS.has(edge.relation)) {
        executableRelationTypes.add(edge.relation);
        visit(edge.from, [...path, badgeId]);
      } else if (THEORY_PLAYBACK_NON_EXECUTABLE_RELATIONS.has(edge.relation)) {
        skippedRelationTypes.add(edge.relation);
      } else {
        skippedRelationTypes.add(edge.relation);
        warnings.push(`relation ignored for playback: ${edge.relation}`);
      }
    }
    visiting.delete(badgeId);
    included.add(badgeId);
    orderedBadgeIds.push(badgeId);
  };

  visit(targetBadgeId, []);

  return {
    orderedBadgeIds,
    executableRelationTypes: Array.from(executableRelationTypes).sort(),
    skippedRelationTypes: Array.from(skippedRelationTypes).sort(),
    warnings,
  };
}
