import { describe, expect, it } from "vitest";
import type { TheoryFrontierVectorFieldTraceV1 } from "@shared/contracts/theory-frontier-vector-field.v1";
import type { TheoryAchievementLayoutNode } from "../theoryAchievementLayout";
import {
  buildTheoryFrontierMapOverlay,
  type TheoryFrontierMapCandidateRegion,
} from "../theoryFrontierMapOverlay";

const nodes: TheoryAchievementLayoutNode[] = [
  {
    badgeId: "badge.strong.a",
    x: 100,
    y: 120,
    depth: 0,
    lane: 0,
    claimPressure: 0.1,
  },
  {
    badgeId: "badge.strong.b",
    x: 260,
    y: 130,
    depth: 1,
    lane: 0,
    claimPressure: 0.2,
  },
  {
    badgeId: "badge.missing.a",
    x: 500,
    y: 360,
    depth: 2,
    lane: 3,
    claimPressure: 0.7,
  },
  {
    badgeId: "badge.missing.b",
    x: 740,
    y: 540,
    depth: 4,
    lane: 5,
    claimPressure: 1,
  },
];

function makeTrace(): TheoryFrontierVectorFieldTraceV1 {
  return {
    artifactId: "theory_frontier_vector_field",
    schemaVersion: "theory_frontier_vector_field/v1",
    generatedAt: "2026-06-20T00:00:00.000Z",
    traceId: "trace:test",
    graphId: "graph:test",
    graphHash: "tfh_test",
    query: "seed atlas overlay test",
    searchSeed: "seed:test",
    basisVersion: "basis:test",
    scoringVersion: "scoring:test",
    taxonomyVersion: "taxonomy:test",
    vectors: [],
    relationTensors: [
      {
        tensorId: "tensor:strong",
        fromBadgeId: "badge.strong.a",
        toBadgeId: "badge.strong.b",
        relation: "candidate_frontier",
        sourceBasisVersion: "basis:test",
        targetBasisVersion: "basis:test",
        transformKind: "candidate_delta",
        axes: [
          "scale_log10_m",
          "unit_dimension_signature",
          "equation_family",
          "domain",
          "fidelity",
          "claim_pressure",
          "evidence_density",
          "first_principles_depth",
        ],
        matrix: [],
        vectorDelta: {
          scaleGapLog10M: 0,
          scaleOverlapLog10M: 1,
          dimensionalDistance: 0,
          equationFamilyDistance: 0,
          domainDistance: 0.1,
          fidelityMismatch: 0,
          claimPressureIncrease: 0,
          evidenceDensityDelta: 0.1,
          firstPrinciplesDepthDelta: 1,
        },
        dimensionalChecks: [],
        equationVariableMap: [],
        uncertaintyPropagation: {
          inputEntropyBits: 0.4,
          outputEntropyBits: 0.5,
          entropyDeltaBits: 0.1,
          covarianceDiagonal: [],
          interpretation: "placement_uncertainty_not_truth_probability",
        },
        typedEdgeSemantics: ["candidate_frontier"],
        falsifierRequirements: [],
        evidenceRequirements: [],
        evidenceRefs: ["source:a"],
        claimBoundary: {
          validatesTheory: false,
          solvesPhysicalMechanism: false,
          promotionAllowed: false,
        },
      },
      {
        tensorId: "tensor:missing",
        fromBadgeId: "badge.missing.a",
        toBadgeId: "badge.missing.b",
        relation: "candidate_frontier",
        sourceBasisVersion: "basis:test",
        targetBasisVersion: "basis:test",
        transformKind: "candidate_delta",
        axes: [
          "scale_log10_m",
          "unit_dimension_signature",
          "equation_family",
          "domain",
          "fidelity",
          "claim_pressure",
          "evidence_density",
          "first_principles_depth",
        ],
        matrix: [],
        vectorDelta: {
          scaleGapLog10M: 6,
          scaleOverlapLog10M: 0,
          dimensionalDistance: 1,
          equationFamilyDistance: 1,
          domainDistance: 1,
          fidelityMismatch: 1,
          claimPressureIncrease: 0.6,
          evidenceDensityDelta: 0.8,
          firstPrinciplesDepthDelta: 3,
        },
        dimensionalChecks: [],
        equationVariableMap: [],
        uncertaintyPropagation: {
          inputEntropyBits: 2,
          outputEntropyBits: 5,
          entropyDeltaBits: 3,
          covarianceDiagonal: [],
          interpretation: "placement_uncertainty_not_truth_probability",
        },
        typedEdgeSemantics: ["candidate_frontier"],
        falsifierRequirements: [],
        evidenceRequirements: [],
        evidenceRefs: [],
        claimBoundary: {
          validatesTheory: false,
          solvesPhysicalMechanism: false,
          promotionAllowed: false,
        },
      },
    ],
    candidateTraces: [
      {
        candidateId: "candidate:strong",
        badgeIds: ["badge.strong.a", "badge.strong.b"],
        vectorDelta: {
          scaleGapLog10M: 0,
          scaleOverlapLog10M: 1,
          dimensionalDistance: 0,
          equationFamilyDistance: 0,
          domainDistance: 0.1,
          fidelityMismatch: 0,
          claimPressureIncrease: 0,
          evidenceDensityDelta: 0.1,
          firstPrinciplesDepthDelta: 1,
        },
        relationTensorIds: ["tensor:strong"],
        entropyContributors: [],
        evidenceGaps: [],
        exactVerificationRequirements: [],
        uncertaintyReductionPotential: 0.1,
        expectedEvidenceClosureCost: 1,
        verifiedFrontierYieldPerBudget: 0.8,
        placementDiagnostic: {
          fitClass: "strong_local_fit",
          fitScore: 0.86,
          localCongruenceScore: 0.88,
          evidenceReadinessScore: 0.9,
          uncertaintyPressureScore: 0.1,
          positiveSignals: ["unit dimensions align"],
          blockingSignals: [],
          missingStructureHints: [],
          interpretation: "candidate_region_has_local_support",
        },
      },
      {
        candidateId: "candidate:missing",
        badgeIds: ["badge.missing.a", "badge.missing.b"],
        vectorDelta: {
          scaleGapLog10M: 6,
          scaleOverlapLog10M: 0,
          dimensionalDistance: 1,
          equationFamilyDistance: 1,
          domainDistance: 1,
          fidelityMismatch: 1,
          claimPressureIncrease: 0.6,
          evidenceDensityDelta: 0.8,
          firstPrinciplesDepthDelta: 3,
        },
        relationTensorIds: ["tensor:missing"],
        entropyContributors: [],
        evidenceGaps: ["dimensional mapping requires exact verification"],
        exactVerificationRequirements: [],
        uncertaintyReductionPotential: 0.9,
        expectedEvidenceClosureCost: 3,
        verifiedFrontierYieldPerBudget: 0.1,
        placementDiagnostic: {
          fitClass: "missing_region_suspected",
          fitScore: 0.18,
          localCongruenceScore: 0.16,
          evidenceReadinessScore: 0.25,
          uncertaintyPressureScore: 0.9,
          positiveSignals: [],
          blockingSignals: ["domain distance 1"],
          missingStructureHints: ["add intermediate domain bridge badge"],
          interpretation: "candidate_region_probably_missing_graph_structure",
        },
      },
    ],
    traceDiagnostics: {
      overallFitClass: "missing_region_suspected",
      strongestCandidateId: "candidate:strong",
      weakestCandidateId: "candidate:missing",
      candidateFitHistogram: {
        strong_local_fit: 1,
        moderate_local_fit: 0,
        weak_cross_domain_fit: 0,
        off_manifold: 0,
        missing_region_suspected: 1,
      },
      averageFitScore: 0.52,
      averageLocalCongruenceScore: 0.52,
      strongestSignals: ["unit dimensions align"],
      weakestSignals: ["domain distance 1"],
      missingStructureHints: ["add intermediate domain bridge badge"],
      interpretation: "frontier_region_probably_missing_graph_structure",
    },
    replay: {
      graphHash: "tfh_test",
      query: "seed atlas overlay test",
      searchSeed: "seed:test",
      basisVersion: "basis:test",
      scoringVersion: "scoring:test",
      taxonomyVersion: "taxonomy:test",
      evidenceReferenceIds: ["source:a"],
    },
    methodAnchors: [],
    interpretation: {
      renderProjectionOnlyForXY: true,
      entropyIsPlacementAndBoundaryUncertaintyOnly: true,
      tensorsAreRelationTransformsOnly: true,
      noTheoryValidation: true,
      noAutomaticEdgePromotion: true,
    },
  };
}

describe("buildTheoryFrontierMapOverlay", () => {
  it("maps fit diagnostics into deterministic candidate regions and tensor paths", () => {
    const trace = makeTrace();
    const first = buildTheoryFrontierMapOverlay({ trace, nodes });
    const second = buildTheoryFrontierMapOverlay({ trace, nodes });

    expect(first).toEqual(second);
    expect(first.replay).toMatchObject({
      graphHash: "tfh_test",
      searchSeed: "seed:test",
      evidenceReferenceCount: 1,
    });
    expect(first.candidateRegions).toHaveLength(2);
    expect(first.tensorPaths).toHaveLength(2);
  });

  it("renders strong local fits differently from missing suspected regions", () => {
    const overlay = buildTheoryFrontierMapOverlay({ trace: makeTrace(), nodes });
    const strong = overlay.candidateRegions.find(
      (region: TheoryFrontierMapCandidateRegion) => region.fitClass === "strong_local_fit",
    );
    const missing = overlay.candidateRegions.find(
      (region: TheoryFrontierMapCandidateRegion) => region.fitClass === "missing_region_suspected",
    );

    expect(strong).toBeDefined();
    expect(missing).toBeDefined();
    expect(strong?.hatch).toBe(false);
    expect(missing?.hatch).toBe(true);
    expect(strong?.strokeDasharray).toBeUndefined();
    expect(missing?.strokeDasharray).toBe("2 8");
    expect(strong?.strokeWidth ?? 0).toBeGreaterThan(missing?.strokeWidth ?? 0);
    expect(missing?.missingStructureHints).toContain("add intermediate domain bridge badge");
  });

  it("expands unresolved regions as uncertainty pressure rises", () => {
    const overlay = buildTheoryFrontierMapOverlay({ trace: makeTrace(), nodes });
    const strong = overlay.candidateRegions.find(
      (region: TheoryFrontierMapCandidateRegion) => region.fitClass === "strong_local_fit",
    );
    const missing = overlay.candidateRegions.find(
      (region: TheoryFrontierMapCandidateRegion) => region.fitClass === "missing_region_suspected",
    );

    expect(missing?.entropyRoughness).toBeGreaterThan(strong?.entropyRoughness ?? 0);
    expect((missing?.rx ?? 0) * (missing?.ry ?? 0)).toBeGreaterThan((strong?.rx ?? 0) * (strong?.ry ?? 0));
  });
});
