import { describe, expect, it } from "vitest";
import type { TheoryBadgeV1 } from "@shared/contracts/theory-badge-graph.v1";
import type { TheoryAchievementLayoutEdge } from "@/lib/theory/theoryAchievementLayout";
import {
  resolveTheoryBadgeEdgeVisualState,
  resolveTheoryBadgeVisualState,
  theoryBadgeButtonClass,
  theoryBadgeEdgeClass,
} from "../theoryBadgeVisualState";

function badge(overrides: Partial<TheoryBadgeV1> = {}): TheoryBadgeV1 {
  return {
    id: "badge.a",
    title: "Badge A",
    plainMeaning: "Fixture badge.",
    whyItMatters: "Fixture badge for visual-state tests.",
    subjects: [],
    level: "derived_relation",
    status: "diagnostic",
    simulationOwners: [],
    equationFamilies: [],
    tags: [],
    equations: [],
    units: [],
    assumptions: [],
    calculatorPayloads: [],
    sourceRefs: [],
    hintKeys: {
      subjects: [],
      symbols: [],
      unitSignatures: [],
      repoPaths: [],
      equationFamilies: [],
      simulationOwners: [],
    },
    claimBoundary: {
      diagnosticOnly: true,
      doesValidateNHM2: false,
      validationClaimAllowed: false,
      physicalMechanismClaimAllowed: false,
      promotionAllowed: false,
    },
    ...overrides,
  };
}

function visualState(overrides: Partial<Parameters<typeof resolveTheoryBadgeVisualState>[0]> = {}) {
  return resolveTheoryBadgeVisualState({
    badge: badge(),
    badgeId: "badge.a",
    selectedBadgeId: null,
    selectedBadgeIds: new Set<string>(),
    traceBadgeIds: new Set<string>(),
    connectableBadgeIds: new Set<string>(),
    manualSelectionActive: false,
    playbackBadgeIds: new Set<string>(),
    solvedBadgeIds: new Set<string>(),
    failedBadgeIds: new Set<string>(),
    rippleBadgeIds: new Set<string>(),
    heatByBadgeId: {},
    atlasHighlightedBadgeIds: new Set<string>(),
    exactBadgeIds: new Set<string>(),
    likelyBadgeIds: new Set<string>(),
    plannedDomain: false,
    routeBlocked: false,
    ...overrides,
  });
}

function edge(overrides: Partial<TheoryAchievementLayoutEdge> = {}): TheoryAchievementLayoutEdge {
  return {
    edgeId: "edge.a",
    from: "badge.a",
    to: "badge.b",
    relation: "derives",
    points: [],
    ...overrides,
  };
}

describe("theory badge visual state", () => {
  it("distinguishes selected pins, trace intermediates, and no-path selected pins", () => {
    const selected = visualState({
      selectedBadgeId: "badge.a",
      selectedBadgeIds: new Set(["badge.a"]),
      manualSelectionActive: true,
    });
    expect(selected.selected).toBe(true);
    expect(selected.selectedNoPath).toBe(false);
    expect(theoryBadgeButtonClass(selected)).toMatch(/ring-cyan/);

    const intermediate = visualState({
      traceBadgeIds: new Set(["badge.a"]),
      manualSelectionActive: true,
    });
    expect(intermediate.intermediate).toBe(true);
    expect(theoryBadgeButtonClass(intermediate)).toMatch(/ring-sky/);

    const noPath = visualState({
      selectedBadgeId: "badge.a",
      selectedBadgeIds: new Set(["badge.a", "badge.b"]),
      traceBadgeIds: new Set(["badge.b"]),
      manualSelectionActive: true,
    });
    expect(noPath.selected).toBe(true);
    expect(noPath.selectedNoPath).toBe(true);
    expect(theoryBadgeButtonClass(noPath)).toMatch(/ring-amber/);
  });

  it("suppresses backend overlay and heat when manual selection is active", () => {
    const backendOverlay = visualState({
      atlasHighlightedBadgeIds: new Set(["badge.a"]),
      rippleBadgeIds: new Set(["badge.a"]),
      heatByBadgeId: { "badge.a": 1 },
      playbackBadgeIds: new Set(["badge.a"]),
      solvedBadgeIds: new Set(["badge.a"]),
      failedBadgeIds: new Set(["badge.a"]),
      manualSelectionActive: false,
    });
    expect(backendOverlay.backendOverlay).toBe(true);
    expect(backendOverlay.ripple).toBe(true);
    expect(backendOverlay.heat).toBe(1);
    expect(backendOverlay.playback).toBe(true);
    expect(backendOverlay.solved).toBe(true);
    expect(backendOverlay.failed).toBe(true);

    const manual = visualState({
      atlasHighlightedBadgeIds: new Set(["badge.a"]),
      rippleBadgeIds: new Set(["badge.a"]),
      heatByBadgeId: { "badge.a": 1 },
      playbackBadgeIds: new Set(["badge.a"]),
      solvedBadgeIds: new Set(["badge.a"]),
      failedBadgeIds: new Set(["badge.a"]),
      manualSelectionActive: true,
    });
    expect(manual.backendOverlay).toBe(false);
    expect(manual.ripple).toBe(false);
    expect(manual.heat).toBe(0);
    expect(manual.playback).toBe(false);
    expect(manual.solved).toBe(false);
    expect(manual.failed).toBe(false);
  });

  it("marks non-connectable manual candidates unavailable", () => {
    const unavailable = visualState({
      manualSelectionActive: true,
      selectedBadgeIds: new Set(["badge.b"]),
      traceBadgeIds: new Set(["badge.b"]),
      connectableBadgeIds: new Set(["badge.c"]),
    });
    expect(unavailable.unavailable).toBe(true);
    expect(theoryBadgeButtonClass(unavailable)).toMatch(/cursor-not-allowed/);

    const connectable = visualState({
      manualSelectionActive: true,
      selectedBadgeIds: new Set(["badge.b"]),
      connectableBadgeIds: new Set(["badge.a"]),
    });
    expect(connectable.connectable).toBe(true);
    expect(connectable.unavailable).toBe(false);
  });

  it("keeps claim-boundary context separate from trace-path context", () => {
    const boundary = visualState({
      badge: badge({ level: "claim_boundary" }),
      badgeId: "badge.a",
    });
    expect(boundary.boundaryContext).toBe(true);
    expect(boundary.tracePath).toBe(false);

    const tracedBoundary = visualState({
      badge: badge({ level: "claim_boundary" }),
      badgeId: "badge.a",
      traceBadgeIds: new Set(["badge.a"]),
    });
    expect(tracedBoundary.boundaryContext).toBe(false);
    expect(tracedBoundary.tracePath).toBe(true);
  });

  it("resolves trace-path edge state and context styling", () => {
    const traceEdgeIds = new Set(["edge.a"]);
    const ordinary = resolveTheoryBadgeEdgeVisualState({ edge: edge(), traceEdgeIds });
    expect(ordinary.tracePath).toBe(true);
    expect(ordinary.context).toBe(false);
    expect(theoryBadgeEdgeClass(ordinary)).toMatch(/stroke-cyan/);

    const context = resolveTheoryBadgeEdgeVisualState({
      edge: edge({ relation: "shares_units" }),
      traceEdgeIds,
    });
    expect(context.tracePath).toBe(true);
    expect(context.context).toBe(true);
    expect(theoryBadgeEdgeClass(context)).toMatch(/stroke-sky/);

    const hidden = resolveTheoryBadgeEdgeVisualState({ edge: edge(), traceEdgeIds: new Set() });
    expect(hidden.tracePath).toBe(false);
    expect(theoryBadgeEdgeClass(hidden)).toMatch(/stroke-transparent/);
  });
});
