import type {
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import {
  buildTheoryBadgeLocatorArtifactV1,
  type TheoryBadgeLocatorArtifactV1,
  type TheoryBadgeLocatorSource,
} from "@shared/contracts/theory-badge-locator.v1";
import {
  locateTheoryBadges,
  type TheoryBadgeLookupInput,
} from "@shared/theory/theory-badge-overlap-locator";

export type TheoryBadgeLocatorInput = TheoryBadgeLookupInput & {
  expression?: string;
  source?: TheoryBadgeLocatorSource;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function claimBoundaryNotesForBadge(badge: TheoryBadgeV1): string[] {
  const notes: string[] = [];
  if (badge.claimBoundary.diagnosticOnly) notes.push(`${badge.id}: diagnostic-only badge`);
  if (!badge.claimBoundary.validationClaimAllowed) notes.push(`${badge.id}: validation claim not allowed`);
  if (!badge.claimBoundary.physicalMechanismClaimAllowed) {
    notes.push(`${badge.id}: physical mechanism claim not allowed`);
  }
  if (!badge.claimBoundary.promotionAllowed) notes.push(`${badge.id}: promotion not allowed`);
  return notes;
}

function neighborContext(graph: TheoryBadgeGraphV1, badgeIds: string[]): {
  badgeIds: string[];
  edgeIds: string[];
} {
  const selected = new Set(badgeIds);
  const contextBadgeIds = new Set(badgeIds);
  const edgeIds: string[] = [];
  for (const edge of graph.edges) {
    if (selected.has(edge.to) || selected.has(edge.from)) {
      contextBadgeIds.add(edge.from);
      contextBadgeIds.add(edge.to);
      edgeIds.push(edge.id);
    }
  }
  return {
    badgeIds: Array.from(contextBadgeIds),
    edgeIds: unique(edgeIds),
  };
}

export function buildTheoryBadgeLocatorArtifact(args: {
  graph: TheoryBadgeGraphV1;
  input: TheoryBadgeLocatorInput;
}): TheoryBadgeLocatorArtifactV1 {
  const { graph } = args;
  const badgesById = new Map(graph.badges.map((badge) => [badge.id, badge]));
  const query = args.input.query?.trim() ?? null;
  const expression = args.input.expression?.trim() ?? null;
  const matches = locateTheoryBadges({
    graph,
    input: {
      ...args.input,
      query: [query, expression].filter(Boolean).join(" ") || undefined,
    },
  });
  const matchedBadgeIds = matches.map((match) => match.badgeId);
  const context = neighborContext(graph, matchedBadgeIds.slice(0, 5));
  const maxScore = Math.max(...matches.map((match) => match.score), 1);
  const heatByBadgeId = Object.fromEntries(
    matches.slice(0, 12).map((match) => [match.badgeId, Math.max(0.15, Math.min(1, match.score / maxScore))]),
  );
  const matchedBadges = matchedBadgeIds
    .map((badgeId) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge));

  const locatorMatches = matches.map((match) => {
    const badge = badgesById.get(match.badgeId);
    return {
      badgeId: match.badgeId,
      title: match.badgeTitle,
      score: match.score,
      reasons: match.reasons,
      matchedSubjects: match.matchedSubjects,
      matchedSymbols: match.matchedSymbols,
      matchedUnitSignatures: match.matchedUnitSignatures,
      matchedEquationFamilies: match.matchedEquationFamilies,
      matchedSimulationOwners: [],
      matchedRepoPaths: match.matchedRepoPaths,
      calculatorPayloads:
        badge?.calculatorPayloads.slice(0, 2).map((payload) => ({
          payloadId: payload.id,
          expression: payload.expression,
          displayLatex: payload.displayLatex,
          preferredAction: payload.preferredAction,
        })) ?? [],
      claimBoundaryNotes: badge ? claimBoundaryNotesForBadge(badge) : match.claimBoundaryWarnings,
    };
  });

  const primaryMatch = locatorMatches[0];
  const primaryPayloadIds = primaryMatch?.calculatorPayloads.map((payload) => payload.payloadId) ?? [];
  const claimBoundaryNotes =
    matchedBadges.length > 0
      ? unique(matchedBadges.flatMap(claimBoundaryNotesForBadge))
      : [
          "No canonical theory badge matched the supplied context.",
          "Locator result is unresolved; no proof or validation claim was made.",
        ];

  return buildTheoryBadgeLocatorArtifactV1({
    graphId: graph.graphId,
    input: {
      query,
      expression,
      subjects: args.input.subjects ?? [],
      symbols: args.input.symbols ?? [],
      unitSignatures: args.input.unitSignatures ?? [],
      repoPaths: args.input.repoPaths ?? [],
      equationFamilies: args.input.equationFamilies ?? [],
      simulationOwners: args.input.simulationOwners ?? [],
      source: args.input.source ?? "manual",
    },
    matches: locatorMatches,
    overlay: {
      centerBadgeIds: primaryMatch ? [primaryMatch.badgeId] : [],
      highlightedBadgeIds: context.badgeIds.slice(0, 12),
      highlightedEdgeIds: context.edgeIds.slice(0, 12),
      rippleBadgeIds: matchedBadgeIds.slice(0, 5),
      heatByBadgeId,
      suggestedViewport: {
        centerBadgeId: primaryMatch?.badgeId ?? null,
        zoom: primaryMatch ? 1.15 : 1,
      },
    },
    recommendedActions: [
      ...(primaryMatch && primaryPayloadIds.length > 0
        ? [
            {
              actionId: "theory-badge-graph.load_payloads_to_calculator",
              label: `Load ${primaryMatch.title} into calculator`,
              badgeId: primaryMatch.badgeId,
              payloadIds: primaryPayloadIds.slice(0, 1),
            },
          ]
        : []),
      ...(primaryMatch
        ? [
            {
              actionId: "theory-badge-graph.run_badge_path",
              label: `Run path to ${primaryMatch.title}`,
              targetBadgeId: primaryMatch.badgeId,
            },
          ]
        : []),
    ],
    claimBoundaryNotes,
  });
}
