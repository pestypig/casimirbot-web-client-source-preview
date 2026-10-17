import type {
  StagePlayBadgeGraphRecommendedActionV1,
  StagePlayBadgeGraphV1,
  StagePlayBadgeV1,
} from "@shared/contracts/stage-play-badge-graph.v1";

export type StagePlayGraphDiff = {
  addedBadgeIds: string[];
  removedBadgeIds: string[];
  updatedBadgeIds: string[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  updatedActionIds: string[];
  sourceWindowChanged: boolean;
  summaryDelta: {
    badgeCount: number;
    affordanceCount: number;
    blockedAffordanceCount: number;
    proceduralBindingCount: number;
    missingEvidenceCount: number;
  };
};

const EMPTY_DIFF: StagePlayGraphDiff = {
  addedBadgeIds: [],
  removedBadgeIds: [],
  updatedBadgeIds: [],
  addedEdgeIds: [],
  removedEdgeIds: [],
  updatedActionIds: [],
  sourceWindowChanged: false,
  summaryDelta: {
    badgeCount: 0,
    affordanceCount: 0,
    blockedAffordanceCount: 0,
    proceduralBindingCount: 0,
    missingEvidenceCount: 0,
  },
};

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const stringArraySignature = (values: string[] | undefined): string =>
  uniqueSorted(values ?? []).join("|");

const numberSignature = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(4) : "invalid";

const badgeSignature = (badge: StagePlayBadgeV1): string =>
  JSON.stringify({
    kind: badge.kind,
    status: badge.status,
    confidence: numberSignature(badge.confidence),
    reasonCodes: uniqueSorted(badge.reasonCodes),
    liveBindings: badge.liveBindings.map((binding) => ({
      bindingKind: binding.bindingKind,
      freshness: binding.freshness,
      compactValue: binding.compactValue ?? null,
    })),
  });

const actionSignature = (action: StagePlayBadgeGraphRecommendedActionV1): string =>
  JSON.stringify({
    admission: action.admission,
    missingEvidence: uniqueSorted(action.missingEvidence),
  });

const sourceWindowSignature = (graph: StagePlayBadgeGraphV1): string =>
  JSON.stringify({
    freshness: graph.sourceWindow.freshness,
    latestObservationRefs: uniqueSorted(graph.sourceWindow.latestObservationRefs),
    latestSourceDescriptorRefs: uniqueSorted(graph.sourceWindow.latestSourceDescriptorRefs ?? []),
    latestSourceProducerRefs: uniqueSorted(graph.sourceWindow.latestSourceProducerRefs ?? []),
    latestRawSessionBufferRefs: uniqueSorted(graph.sourceWindow.latestRawSessionBufferRefs ?? []),
    latestSnapshotRefs: uniqueSorted(graph.sourceWindow.latestSnapshotRefs),
    latestDeltaOverlayRefs: uniqueSorted(graph.sourceWindow.latestDeltaOverlayRefs),
    latestNavigationRefs: uniqueSorted(graph.sourceWindow.latestNavigationRefs),
    sources: graph.sourceWindow.sources.map((source) => ({
      sourceId: source.sourceId,
      modality: source.modality,
      status: source.status,
      routeTo: source.routeTo,
      selectedForStagePlay: source.selectedForStagePlay,
      lastEventTs: source.lastEventTs ?? null,
      evidenceRefs: uniqueSorted(source.evidenceRefs),
    })),
  });

const idSet = <T extends { id: string }>(items: T[]): Set<string> =>
  new Set(items.map((item) => item.id));

const changedIds = <T extends { id: string }>(
  previous: T[],
  next: T[],
  signature: (value: T) => string,
): string[] => {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return next
    .filter((item) => {
      const before = previousById.get(item.id);
      return before ? signature(before) !== signature(item) : false;
    })
    .map((item) => item.id)
    .sort((a, b) => a.localeCompare(b));
};

const addedIds = <T extends { id: string }>(previous: T[], next: T[]): string[] => {
  const previousIds = idSet(previous);
  return next
    .map((item) => item.id)
    .filter((id) => !previousIds.has(id))
    .sort((a, b) => a.localeCompare(b));
};

const removedIds = <T extends { id: string }>(previous: T[], next: T[]): string[] => {
  const nextIds = idSet(next);
  return previous
    .map((item) => item.id)
    .filter((id) => !nextIds.has(id))
    .sort((a, b) => a.localeCompare(b));
};

export function diffStagePlayBadgeGraphs(
  previous: StagePlayBadgeGraphV1 | null | undefined,
  next: StagePlayBadgeGraphV1 | null | undefined,
): StagePlayGraphDiff {
  if (!previous || !next) return EMPTY_DIFF;

  return {
    addedBadgeIds: addedIds(previous.badges, next.badges),
    removedBadgeIds: removedIds(previous.badges, next.badges),
    updatedBadgeIds: changedIds(previous.badges, next.badges, badgeSignature),
    addedEdgeIds: addedIds(previous.edges, next.edges),
    removedEdgeIds: removedIds(previous.edges, next.edges),
    updatedActionIds: changedIds(previous.recommendedActions, next.recommendedActions, actionSignature),
    sourceWindowChanged: sourceWindowSignature(previous) !== sourceWindowSignature(next),
    summaryDelta: {
      badgeCount: next.summary.badgeCount - previous.summary.badgeCount,
      affordanceCount: next.summary.affordanceCount - previous.summary.affordanceCount,
      blockedAffordanceCount: next.summary.blockedAffordanceCount - previous.summary.blockedAffordanceCount,
      proceduralBindingCount: next.summary.proceduralBindingCount - previous.summary.proceduralBindingCount,
      missingEvidenceCount: next.summary.missingEvidenceCount - previous.summary.missingEvidenceCount,
    },
  };
}

export function hasStagePlayGraphDiff(diff: StagePlayGraphDiff): boolean {
  return (
    diff.addedBadgeIds.length > 0 ||
    diff.removedBadgeIds.length > 0 ||
    diff.updatedBadgeIds.length > 0 ||
    diff.addedEdgeIds.length > 0 ||
    diff.removedEdgeIds.length > 0 ||
    diff.updatedActionIds.length > 0 ||
    diff.sourceWindowChanged ||
    Object.values(diff.summaryDelta).some((value) => value !== 0)
  );
}
