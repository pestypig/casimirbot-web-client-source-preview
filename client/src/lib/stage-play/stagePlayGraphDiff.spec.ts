import { describe, expect, it } from "vitest";
import {
  buildStagePlayBadgeGraphV1,
  type StagePlayBadgeGraphV1,
  type StagePlayBadgeV1,
} from "@shared/contracts/stage-play-badge-graph.v1";
import {
  diffStagePlayBadgeGraphs,
  hasStagePlayGraphDiff,
} from "./stagePlayGraphDiff";

const sourceWindow: StagePlayBadgeGraphV1["sourceWindow"] = {
  threadId: "thread:stage-play-diff",
  roomId: "room:diff",
  environmentId: "env:diff",
  fromTs: "2026-06-02T12:20:00.000Z",
  toTs: "2026-06-02T12:20:01.000Z",
  latestObservationRefs: ["live_source_observation:1"],
  latestSourceDescriptorRefs: [],
  latestSourceProducerRefs: [],
  latestRawSessionBufferRefs: [],
  sources: [
    {
      sourceId: "source:visual",
      modality: "visual_frame",
      status: "active",
      contribution: "visual frame source",
      fidelityScore: 0.8,
      selectedForStagePlay: true,
      routeTo: "visual_context",
      cadenceMs: 10000,
      lastEventTs: "2026-06-02T12:20:01.000Z",
      missingReason: null,
      nextRequiredAction: null,
      evidenceRefs: ["live_source_observation:1"],
    },
  ],
  latestSnapshotRefs: ["snapshot:1"],
  latestDeltaOverlayRefs: [],
  latestNavigationRefs: [],
  freshness: "fresh",
};

function badge(overrides: Partial<StagePlayBadgeV1> = {}): StagePlayBadgeV1 {
  return {
    id: "affordance.observe",
    title: "Observe",
    plainMeaning: "Observation is available.",
    whyItMatters: "Observation bounds the next move.",
    kind: "affordance",
    status: "available",
    subjects: [],
    tags: [],
    liveBindings: [
      {
        bindingKind: "source_status",
        sourceRefIds: ["live_source_observation:1"],
        freshness: "fresh",
        confidence: 0.8,
        compactValue: "fresh",
      },
    ],
    sourceRefs: [{ kind: "live_source_observation", id: "live_source_observation:1" }],
    evidenceRefs: ["live_source_observation:1"],
    confidence: 0.8,
    missingEvidence: [],
    reasonCodes: ["evidence_available"],
    admission: "auto",
    ...overrides,
  };
}

function graph(overrides: Partial<StagePlayBadgeGraphV1> = {}): StagePlayBadgeGraphV1 {
  return buildStagePlayBadgeGraphV1({
    generatedAt: "2026-06-02T12:20:01.000Z",
    graphId: "stage_play_badge_graph:diff",
    title: "Stage Play Badge Graph",
    description: "Diff fixture.",
    sourceWindow,
    badges: [badge()],
    edges: [
      {
        id: "edge:observer:feeds:observe",
        from: "affordance.observe",
        to: "affordance.observe",
        relation: "feeds",
        label: "self test edge",
        evidenceRefs: ["live_source_observation:1"],
        reasonCodes: ["test"],
      },
    ],
    recommendedActions: [
      {
        id: "stage-action:observe-more",
        label: "Observe more",
        actionType: "observe_more",
        admission: "auto",
        agentExecutable: false,
        reasonCodes: ["diagnostic_only"],
        evidenceRefs: ["live_source_observation:1"],
        missingEvidence: [],
      },
    ],
    ...overrides,
  });
}

describe("stagePlayGraphDiff", () => {
  it("detects added, removed, updated, action, and source-window changes", () => {
    const previous = graph({
      badges: [
        badge({ id: "affordance.observe" }),
        badge({ id: "hazard.low_light", kind: "hazard", status: "blocked", title: "Low light" }),
      ],
    });
    const next = graph({
      sourceWindow: {
        ...sourceWindow,
        latestObservationRefs: ["live_source_observation:2"],
        freshness: "mixed",
      },
      badges: [
        badge({
          id: "affordance.observe",
          confidence: 0.9,
          reasonCodes: ["evidence_available", "fresh_source_window"],
          liveBindings: [
            {
              bindingKind: "source_status",
              sourceRefIds: ["live_source_observation:2"],
              freshness: "fresh",
              confidence: 0.9,
              compactValue: "mixed",
            },
          ],
        }),
        badge({ id: "intent.delay_conflict", kind: "intent_module", status: "candidate", title: "Delay conflict" }),
      ],
      edges: [],
      recommendedActions: [
        {
          id: "stage-action:observe-more",
          label: "Observe more",
          actionType: "observe_more",
          admission: "ask_user",
          agentExecutable: false,
          reasonCodes: ["missing_evidence"],
          evidenceRefs: ["live_source_observation:2"],
          missingEvidence: ["Need another compact window."],
        },
      ],
    });

    const diff = diffStagePlayBadgeGraphs(previous, next);

    expect(diff.addedBadgeIds).toEqual(["intent.delay_conflict"]);
    expect(diff.removedBadgeIds).toEqual(["hazard.low_light"]);
    expect(diff.updatedBadgeIds).toEqual(["affordance.observe"]);
    expect(diff.addedEdgeIds).toEqual([]);
    expect(diff.removedEdgeIds).toEqual(["edge:observer:feeds:observe"]);
    expect(diff.updatedActionIds).toEqual(["stage-action:observe-more"]);
    expect(diff.sourceWindowChanged).toBe(true);
    expect(diff.summaryDelta).toMatchObject({
      badgeCount: 0,
      affordanceCount: 0,
      blockedAffordanceCount: 0,
      proceduralBindingCount: 0,
    });
    expect(hasStagePlayGraphDiff(diff)).toBe(true);
  });

  it("returns an empty diff when a previous or next graph is missing", () => {
    const diff = diffStagePlayBadgeGraphs(null, graph());

    expect(hasStagePlayGraphDiff(diff)).toBe(false);
    expect(diff.addedBadgeIds).toEqual([]);
    expect(diff.sourceWindowChanged).toBe(false);
  });
});
