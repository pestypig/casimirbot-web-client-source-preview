import type {
  TheoryBiomeBand,
  TheoryBiomeLayoutV1,
} from "@shared/contracts/theory-biome-layout.v1";
import type {
  TheoryBadgeEdgeV1,
  TheoryBadgeGraphV1,
  TheoryBadgeLevel,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import { layoutTheoryBiomeMap } from "./theoryBiomeLayout";

export type TheoryAchievementLayoutNode = {
  badgeId: string;
  x: number;
  y: number;
  depth: number;
  lane: number;
  scaleBand?: TheoryBiomeBand;
  scaleLog10M?: number | null;
  domainKey?: string;
  chunkX?: number;
  chunkY?: number;
  renderChunkId?: string;
  semanticChunkId?: string;
  claimPressure?: number;
};

export type TheoryAchievementLayoutEdge = {
  edgeId: string;
  from: string;
  to: string;
  relation: string;
  points: Array<{ x: number; y: number }>;
  scaleDistanceKind?: "same_biome" | "neighbor_biome" | "cross_scale";
};

export type TheoryAchievementLayout = {
  width: number;
  height: number;
  nodes: TheoryAchievementLayoutNode[];
  edges: TheoryAchievementLayoutEdge[];
  biome?: TheoryBiomeLayoutV1;
};

const X_SPACING = 116;
const Y_SPACING = 64;
const X_OFFSET = 72;
const Y_OFFSET = 92;

const LEVEL_DEPTH: Record<TheoryBadgeLevel, number> = {
  first_principle: 0,
  law: 1,
  derived_relation: 2,
  model: 3,
  simulation_specific: 4,
  diagnostic_gate: 5,
  claim_boundary: 6,
};

const LANE_RULES: Array<{ lane: number; matches: string[] }> = [
  { lane: 0, matches: ["first_principles", "units", "dimensions", "foundation"] },
  { lane: 1, matches: ["constants", "constant", "quantum", "radiation", "blackbody", "wien_displacement"] },
  { lane: 2, matches: ["starsim", "stellar", "solar", "solar_spectrum", "solar_flare", "spectrum", "flare"] },
  { lane: 3, matches: ["cosmic_distance", "redshift", "blueshift", "parallax", "cepheid", "hubble_law"] },
  { lane: 4, matches: ["casimir", "cavity", "cavity_mode", "negative_energy", "q_factor"] },
  { lane: 5, matches: ["qei", "stress_energy", "energy_conditions", "source", "closure"] },
  { lane: 6, matches: ["general_relativity", "field_equations", "adm", "nhm2", "warp", "geometry"] },
  { lane: 7, matches: ["tokamak", "plasma", "magnetohydrodynamics", "fusion_plasma"] },
  { lane: 8, matches: ["galactic", "galactic_dynamics", "orbital", "dark_matter"] },
  { lane: 9, matches: ["curvature", "collapse", "black_hole", "compact_object"] },
  { lane: 10, matches: ["claim_boundary", "safety", "boundary"] },
];

const LAYOUT_EDGE_RELATIONS = new Set([
  "derives",
  "requires",
  "specializes",
  "approximates",
  "bounds",
  "uses_constant",
  "numerically_solves",
  "diagnostic_checks",
  "shares_units",
]);

function preferredLane(badge: TheoryBadgeV1): number {
  if (badge.level === "claim_boundary") return 10;
  if (badge.level === "first_principle") return 0;
  const tokens = new Set([
    ...badge.subjects,
    ...badge.tags,
    ...badge.equationFamilies,
    ...badge.hintKeys.subjects,
  ]);
  if (tokens.has("solar") || tokens.has("starsim") || tokens.has("stellar")) return 2;
  for (const rule of LANE_RULES) {
    if (rule.matches.some((token: string) => tokens.has(token))) return rule.lane;
  }
  return LEVEL_DEPTH[badge.level] + 1;
}

function incomingLayoutEdges(graph: TheoryBadgeGraphV1): Map<string, TheoryBadgeEdgeV1[]> {
  const incoming = new Map<string, TheoryBadgeEdgeV1[]>();
  for (const edge of graph.edges) {
    if (!LAYOUT_EDGE_RELATIONS.has(edge.relation)) continue;
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }
  return incoming;
}

function computeDepths(graph: TheoryBadgeGraphV1): Map<string, number> {
  const incoming = incomingLayoutEdges(graph);
  const badgeIds = new Set(graph.badges.map((badge: TheoryBadgeV1) => badge.id));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthFor = (badge: TheoryBadgeV1): number => {
    const cached = memo.get(badge.id);
    if (cached !== undefined) return cached;
    if (visiting.has(badge.id)) return LEVEL_DEPTH[badge.level];

    visiting.add(badge.id);
    const upstreamDepths = (incoming.get(badge.id) ?? [])
      .filter((edge: TheoryBadgeEdgeV1) => badgeIds.has(edge.from))
      .map((edge: TheoryBadgeEdgeV1) => {
        const upstream = graph.badges.find((candidate: TheoryBadgeV1) => candidate.id === edge.from);
        return upstream ? depthFor(upstream) + 1 : LEVEL_DEPTH[badge.level];
      });
    visiting.delete(badge.id);

    const computed =
      upstreamDepths.length > 0
        ? Math.max(LEVEL_DEPTH[badge.level], ...upstreamDepths)
        : LEVEL_DEPTH[badge.level];
    memo.set(badge.id, computed);
    return computed;
  };

  for (const badge of graph.badges) depthFor(badge);
  return memo;
}

function edgePoints(from: TheoryAchievementLayoutNode, to: TheoryAchievementLayoutNode) {
  const badgeHalf = 22;
  const start = { x: from.x + badgeHalf, y: from.y + badgeHalf };
  const end = { x: to.x + badgeHalf, y: to.y + badgeHalf };
  const midX = start.x + Math.max(36, (end.x - start.x) / 2);
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}

export function layoutTheoryAchievementMapGrid(graph: TheoryBadgeGraphV1): TheoryAchievementLayout {
  const depths = computeDepths(graph);
  const occupied = new Set<string>();
  const nodes = graph.badges.map((badge: TheoryBadgeV1) => {
    const depth = depths.get(badge.id) ?? LEVEL_DEPTH[badge.level];
    let lane = preferredLane(badge);
    while (occupied.has(`${depth}:${lane}`)) lane += 1;
    occupied.add(`${depth}:${lane}`);
    return {
      badgeId: badge.id,
      x: depth * X_SPACING + X_OFFSET,
      y: lane * Y_SPACING + Y_OFFSET,
      depth,
      lane,
    };
  });

  const nodesById = new Map(nodes.map((node: TheoryAchievementLayoutNode) => [node.badgeId, node]));
  const edges = graph.edges
    .map((edge: TheoryBadgeEdgeV1): TheoryAchievementLayoutEdge | null => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) return null;
      return {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        points: edgePoints(from, to),
      };
    })
    .filter((edge: TheoryAchievementLayoutEdge | null): edge is TheoryAchievementLayoutEdge => Boolean(edge));

  const maxX = Math.max(...nodes.map((node: TheoryAchievementLayoutNode) => node.x), X_OFFSET);
  const maxY = Math.max(...nodes.map((node: TheoryAchievementLayoutNode) => node.y), Y_OFFSET);

  return {
    width: maxX + X_OFFSET + 96,
    height: maxY + Y_OFFSET + 96,
    nodes,
    edges,
  };
}

export function layoutTheoryAchievementMap(graph: TheoryBadgeGraphV1): TheoryAchievementLayout {
  return layoutTheoryBiomeMap(graph);
}
