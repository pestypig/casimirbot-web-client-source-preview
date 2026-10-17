import type {
  TheoryBadgeRelationTensorV1,
  TheoryFrontierFitClassV1,
  TheoryFrontierVectorCandidateTraceV1,
  TheoryFrontierVectorFieldTraceV1,
} from "@shared/contracts/theory-frontier-vector-field.v1";
import type { TheoryBiomeChunkV1 } from "@shared/contracts/theory-biome-layout.v1";
import type { TheoryAchievementLayoutNode } from "./theoryAchievementLayout";

export type TheorySeedAtlasLayerState = {
  frontierDiagnostics: boolean;
  placementCertainty: boolean;
  entropyRoughness: boolean;
  claimPressure: boolean;
};

export const DEFAULT_THEORY_SEED_ATLAS_LAYERS: TheorySeedAtlasLayerState = {
  frontierDiagnostics: true,
  placementCertainty: true,
  entropyRoughness: true,
  claimPressure: true,
};

export type TheoryFrontierMapCandidateRegion = {
  id: string;
  candidateId: string;
  badgeIds: string[];
  fitClass: TheoryFrontierFitClassV1;
  x: number;
  y: number;
  rx: number;
  ry: number;
  labelX: number;
  labelY: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
  hatch: boolean;
  certainty: number;
  localCongruence: number;
  evidenceReadiness: number;
  entropyRoughness: number;
  uncertaintyPressure: number;
  claimPressure: number;
  contourCount: number;
  positiveSignals: string[];
  blockingSignals: string[];
  missingStructureHints: string[];
  interpretation: string;
};

export type TheoryFrontierMapTensorPath = {
  id: string;
  tensorId: string;
  candidateId: string | null;
  fromBadgeId: string;
  toBadgeId: string;
  path: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
  transformKind: string;
  relation: string;
};

export type TheoryFrontierMapOverlay = {
  replay: {
    graphHash: string;
    query: string;
    searchSeed: string;
    basisVersion: string;
    scoringVersion: string;
    taxonomyVersion: string;
    evidenceReferenceCount: number;
  };
  diagnostics: TheoryFrontierVectorFieldTraceV1["traceDiagnostics"];
  candidateRegions: TheoryFrontierMapCandidateRegion[];
  tensorPaths: TheoryFrontierMapTensorPath[];
};

type BuildTheoryFrontierMapOverlayInput = {
  trace: TheoryFrontierVectorFieldTraceV1;
  nodes: TheoryAchievementLayoutNode[];
  chunks?: TheoryBiomeChunkV1[];
};

type NodeCenter = {
  badgeId: string;
  x: number;
  y: number;
  claimPressure: number;
};

const FIT_STYLE: Record<
  TheoryFrontierFitClassV1,
  {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
    hatch: boolean;
  }
> = {
  strong_local_fit: {
    fill: "rgba(16,185,129,0.16)",
    stroke: "rgba(110,231,183,0.92)",
    strokeWidth: 3.2,
    hatch: false,
  },
  moderate_local_fit: {
    fill: "rgba(34,211,238,0.14)",
    stroke: "rgba(103,232,249,0.84)",
    strokeWidth: 2.7,
    strokeDasharray: "14 8",
    hatch: false,
  },
  weak_cross_domain_fit: {
    fill: "rgba(251,191,36,0.13)",
    stroke: "rgba(252,211,77,0.78)",
    strokeWidth: 2.2,
    strokeDasharray: "10 9",
    hatch: false,
  },
  off_manifold: {
    fill: "rgba(244,63,94,0.1)",
    stroke: "rgba(251,113,133,0.74)",
    strokeWidth: 2,
    strokeDasharray: "5 7",
    hatch: true,
  },
  missing_region_suspected: {
    fill: "rgba(168,85,247,0.11)",
    stroke: "rgba(216,180,254,0.82)",
    strokeWidth: 2.4,
    strokeDasharray: "2 8",
    hatch: true,
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length : 0;
}

function centerForNode(node: TheoryAchievementLayoutNode): NodeCenter {
  return {
    badgeId: node.badgeId,
    x: node.x + 22,
    y: node.y + 22,
    claimPressure: clamp01(node.claimPressure ?? 0),
  };
}

function stableHash(input: string): number {
  let h = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function candidateCenters(
  candidate: TheoryFrontierVectorCandidateTraceV1,
  centersByBadgeId: Map<string, NodeCenter>,
): NodeCenter[] {
  return candidate.badgeIds
    .map((badgeId: string) => centersByBadgeId.get(badgeId))
    .filter((center): center is NodeCenter => Boolean(center));
}

function buildCandidateRegion(
  candidate: TheoryFrontierVectorCandidateTraceV1,
  centersByBadgeId: Map<string, NodeCenter>,
): TheoryFrontierMapCandidateRegion | null {
  const centers = candidateCenters(candidate, centersByBadgeId);
  if (centers.length === 0) return null;

  const diagnostic = candidate.placementDiagnostic;
  const xs = centers.map((center: NodeCenter) => center.x);
  const ys = centers.map((center: NodeCenter) => center.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const entropyRoughness = clamp01(
    Math.max(candidate.uncertaintyReductionPotential, diagnostic.uncertaintyPressureScore),
  );
  const uncertaintyPadding = 56 + entropyRoughness * 96 + (1 - diagnostic.fitScore) * 44;
  const x = average(xs);
  const y = average(ys);
  const rx = Math.max(72, (maxX - minX) / 2 + uncertaintyPadding);
  const ry = Math.max(54, (maxY - minY) / 2 + uncertaintyPadding * 0.72);
  const style = FIT_STYLE[diagnostic.fitClass];

  return {
    id: `seed-atlas-region:${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    badgeIds: candidate.badgeIds,
    fitClass: diagnostic.fitClass,
    x: round3(x),
    y: round3(y),
    rx: round3(rx),
    ry: round3(ry),
    labelX: round3(x - rx + 12),
    labelY: round3(y - ry - 10),
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeDasharray: style.strokeDasharray,
    opacity: round3(0.28 + diagnostic.fitScore * 0.42),
    hatch: style.hatch || diagnostic.missingStructureHints.length > 0,
    certainty: diagnostic.fitScore,
    localCongruence: diagnostic.localCongruenceScore,
    evidenceReadiness: diagnostic.evidenceReadinessScore,
    entropyRoughness,
    uncertaintyPressure: diagnostic.uncertaintyPressureScore,
    claimPressure: round3(average(centers.map((center: NodeCenter) => center.claimPressure))),
    contourCount: Math.max(1, Math.min(4, Math.ceil(1 + diagnostic.localCongruenceScore * 3))),
    positiveSignals: diagnostic.positiveSignals,
    blockingSignals: diagnostic.blockingSignals,
    missingStructureHints: diagnostic.missingStructureHints,
    interpretation: diagnostic.interpretation,
  };
}

function tensorPath(args: {
  from: NodeCenter;
  to: NodeCenter;
  tensorId: string;
  entropyRoughness: number;
}): string {
  const dx = args.to.x - args.from.x;
  const dy = args.to.y - args.from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const hash = stableHash(args.tensorId);
  const direction = hash % 2 === 0 ? 1 : -1;
  const bend = direction * (28 + args.entropyRoughness * 82 + (hash % 19));
  const cx = (args.from.x + args.to.x) / 2 + normalX * bend;
  const cy = (args.from.y + args.to.y) / 2 + normalY * bend;
  return `M ${round3(args.from.x)} ${round3(args.from.y)} Q ${round3(cx)} ${round3(cy)} ${round3(args.to.x)} ${round3(args.to.y)}`;
}

export function buildTheoryFrontierMapOverlay({
  trace,
  nodes,
}: BuildTheoryFrontierMapOverlayInput): TheoryFrontierMapOverlay {
  const centersByBadgeId = new Map(
    nodes.map((node: TheoryAchievementLayoutNode) => [node.badgeId, centerForNode(node)]),
  );
  const candidateRegions = trace.candidateTraces
    .map((candidate: TheoryFrontierVectorCandidateTraceV1) => buildCandidateRegion(candidate, centersByBadgeId))
    .filter((region): region is TheoryFrontierMapCandidateRegion => Boolean(region))
    .sort((left: TheoryFrontierMapCandidateRegion, right: TheoryFrontierMapCandidateRegion) =>
      left.candidateId.localeCompare(right.candidateId),
    );
  const regionByTensorId = new Map<string, TheoryFrontierMapCandidateRegion>();
  for (const candidate of trace.candidateTraces) {
    const region = candidateRegions.find(
      (candidateRegion: TheoryFrontierMapCandidateRegion) =>
        candidateRegion.candidateId === candidate.candidateId,
    );
    if (!region) continue;
    for (const tensorId of candidate.relationTensorIds) regionByTensorId.set(tensorId, region);
  }

  const tensorPaths = trace.relationTensors
    .map((tensor: TheoryBadgeRelationTensorV1): TheoryFrontierMapTensorPath | null => {
      const from = centersByBadgeId.get(tensor.fromBadgeId);
      const to = centersByBadgeId.get(tensor.toBadgeId);
      if (!from || !to) return null;
      const region = regionByTensorId.get(tensor.tensorId) ?? null;
      const style = FIT_STYLE[region?.fitClass ?? "weak_cross_domain_fit"];
      const entropyRoughness = region?.entropyRoughness ?? clamp01(tensor.uncertaintyPropagation.entropyDeltaBits / 4);
      return {
        id: `seed-atlas-tensor:${tensor.tensorId}`,
        tensorId: tensor.tensorId,
        candidateId: region?.candidateId ?? null,
        fromBadgeId: tensor.fromBadgeId,
        toBadgeId: tensor.toBadgeId,
        path: tensorPath({ from, to, tensorId: tensor.tensorId, entropyRoughness }),
        stroke: style.stroke,
        strokeWidth: Math.max(1.8, style.strokeWidth - 0.5),
        strokeDasharray: tensor.transformKind === "candidate_delta" ? style.strokeDasharray ?? "8 7" : undefined,
        opacity: round3(0.22 + (region?.certainty ?? 0.35) * 0.42),
        transformKind: tensor.transformKind,
        relation: tensor.relation,
      };
    })
    .filter((path): path is TheoryFrontierMapTensorPath => Boolean(path))
    .sort((left: TheoryFrontierMapTensorPath, right: TheoryFrontierMapTensorPath) =>
      left.tensorId.localeCompare(right.tensorId),
    );

  return {
    replay: {
      graphHash: trace.replay.graphHash,
      query: trace.replay.query,
      searchSeed: trace.replay.searchSeed,
      basisVersion: trace.replay.basisVersion,
      scoringVersion: trace.replay.scoringVersion,
      taxonomyVersion: trace.replay.taxonomyVersion,
      evidenceReferenceCount: trace.replay.evidenceReferenceIds.length,
    },
    diagnostics: trace.traceDiagnostics,
    candidateRegions,
    tensorPaths,
  };
}
