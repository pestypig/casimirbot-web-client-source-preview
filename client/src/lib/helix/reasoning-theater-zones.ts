import type {
  ReasoningTheaterAtlasGraphResponse,
  ReasoningTheaterCongruenceGraphResponse,
  ReasoningTheaterTopologyResponse,
} from "@/lib/agi/api";
import type {
  ReasoningTheaterFrontierAction,
  ReasoningTheaterFrontierParticleProfile,
  ReasoningTheaterRetrievalZone,
  ReasoningTheaterZoneConfig,
  ReasoningTheaterZoneGraphFocusConfig,
  ReasoningTheaterZoneMotionConfig,
} from "@/lib/helix/reasoning-theater-config";

export type ReasoningTheaterZoneEvent = {
  id?: string;
  text?: string;
  tool?: string;
  tsMs?: number;
  ts?: string | number;
  meta?: Record<string, unknown>;
};

export type ReasoningTheaterZonePulse = {
  zone: ReasoningTheaterRetrievalZone;
  startMs: number;
  holdUntilMs: number;
  endMs: number;
  sourceEventId: string;
  openWorldActive: boolean;
};

export type ReasoningTheaterZoneTimelineState = {
  zone: ReasoningTheaterRetrievalZone;
  intensity: number;
  openWorldActive: boolean;
  deltaMs: number;
};

export type ZoneMotionFrameInput = {
  elapsedMs: number;
  meterPct: number;
  frontierAction: ReasoningTheaterFrontierAction;
  frontierProfile: ReasoningTheaterFrontierParticleProfile;
  activeZone: ReasoningTheaterRetrievalZone;
  zoneIntensity: number;
  motion: ReasoningTheaterZoneMotionConfig;
};

export type ZoneMotionFrame = {
  sweepX: number;
  direction: -1 | 0 | 1;
  velocityNorm: number;
  sweepOpacity: number;
};

export type RetrievalFootprintMeta = {
  exactPaths: string[];
  pathCount: number;
  zoneHint: ReasoningTheaterRetrievalZone | null;
  hasExactProvenance: boolean;
  primaryPath: string | null;
};

export type ZoneCausalEvent = {
  zone: ReasoningTheaterRetrievalZone;
  startMs: number;
  holdUntilMs: number;
  endMs: number;
  sourceEventId: string;
  openWorldActive: boolean;
  exactPaths: string[];
  hasExactProvenance: boolean;
  primaryPath: string | null;
};

export type ZoneCausalFrame = {
  activeZone: ReasoningTheaterRetrievalZone;
  intensity: number;
  exactNodeIds: string[];
  hasExactProvenance: boolean;
  openWorldActive: boolean;
  deltaMs: number;
};

export type ReasoningTheaterZoneNode = {
  id: string;
  zone: ReasoningTheaterRetrievalZone;
  x: number;
  y: number;
  radius: number;
  alpha: number;
};

export type ReasoningTheaterZoneEdge = {
  id: string;
  from: string;
  to: string;
  alpha: number;
  kind: "internal" | "bridge";
};

export type ReasoningTheaterDenseZoneLayout = {
  nodes: ReasoningTheaterZoneNode[];
  edges: ReasoningTheaterZoneEdge[];
  byId: Record<string, ReasoningTheaterZoneNode>;
};

export type ReasoningTheaterAtlasNode = {
  id: string;
  path: string;
  zone: "mapped_connected" | "owned_frontier";
  x: number;
  y: number;
  degree: number;
};

export type ReasoningTheaterAtlasEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
};

export type ReasoningTheaterAtlasGraphIndex = {
  version: string;
  seed: number;
  nodes: ReasoningTheaterAtlasNode[];
  edges: ReasoningTheaterAtlasEdge[];
  byId: Record<string, ReasoningTheaterAtlasNode>;
  idsByPath: Record<string, string>;
  adjacency: Record<string, Array<{ to: string; edgeId: string; weight: number }>>;
};

export type ReasoningTheaterFocusedSubgraph = {
  nodes: ReasoningTheaterAtlasNode[];
  edges: ReasoningTheaterAtlasEdge[];
  byId: Record<string, ReasoningTheaterAtlasNode>;
};

export type ReasoningTheaterAtlasCameraState = {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
};

export type ReasoningTheaterProjectedNode = {
  id: string;
  zone: "mapped_connected" | "owned_frontier";
  x: number;
  y: number;
  degree: number;
  path: string;
};

export type ReasoningTheaterProjectedEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
};

export type ReasoningTheaterProjectedSubgraph = {
  nodes: ReasoningTheaterProjectedNode[];
  edges: ReasoningTheaterProjectedEdge[];
  byId: Record<string, ReasoningTheaterProjectedNode>;
};

export type ReasoningTheaterCongruenceTrace = {
  treeId: string;
  nodeIds: string[];
};

export type ReasoningTheaterCongruenceSelection = {
  treeIds: string[];
  primaryTreeId: string | null;
  trace: ReasoningTheaterCongruenceTrace[];
  source: "tree_walk" | "none";
};

export type ReasoningTheaterCongruenceNode = {
  id: string;
  treeId: string;
  nodeId: string;
  title: string;
  zone: "mapped_connected" | "owned_frontier";
  atlasLinked: boolean;
  x: number;
  y: number;
  degree: number;
  depth: number;
};

export type ReasoningTheaterCongruenceEdge = {
  id: string;
  treeId: string;
  from: string;
  to: string;
  rel: string;
  edgeType: string;
  requiresCl: string | null;
  weight: number;
};

export type ReasoningTheaterCongruenceTree = {
  id: string;
  label: string;
  rootId: string | null;
  nodeCount: number;
};

export type ReasoningTheaterCongruenceGraphIndex = {
  version: string;
  seed: number;
  stats: {
    treesTotal: number;
    nodesTotal: number;
    edgesTotal: number;
    mappedConnectedNodes: number;
    ownedFrontierNodes: number;
    degraded: boolean;
  };
  trees: ReasoningTheaterCongruenceTree[];
  nodes: ReasoningTheaterCongruenceNode[];
  edges: ReasoningTheaterCongruenceEdge[];
  byId: Record<string, ReasoningTheaterCongruenceNode>;
  nodeIdByTreeAndNodeId: Record<string, string>;
  edgeIdsByPair: Record<string, string[]>;
  treeById: Record<string, ReasoningTheaterCongruenceTree>;
};

const DEFAULT_ZONE: ReasoningTheaterRetrievalZone = "mapped_connected";
const ZONE_ORDER: ReasoningTheaterRetrievalZone[] = [
  "mapped_connected",
  "owned_frontier",
  "uncharted",
];

type ZoneRegion = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

const ZONE_REGIONS: Record<ReasoningTheaterRetrievalZone, ZoneRegion> = {
  mapped_connected: { cx: 0.34, cy: 0.42, rx: 0.22, ry: 0.2 },
  owned_frontier: { cx: 0.68, cy: 0.42, rx: 0.2, ry: 0.2 },
  uncharted: { cx: 0.5, cy: 0.78, rx: 0.34, ry: 0.16 },
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function normalizeTreeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeGraphNodeId(value: string): string {
  return value.trim();
}

function createCongruenceNodeKey(treeId: string, nodeId: string): string {
  return `${normalizeTreeId(treeId)}::${normalizeGraphNodeId(nodeId).toLowerCase()}`;
}

function isZone(value: unknown): value is ReasoningTheaterRetrievalZone {
  return value === "mapped_connected" || value === "owned_frontier" || value === "uncharted";
}

function parseTsMs(event: ReasoningTheaterZoneEvent, fallbackMs: number): number {
  if (typeof event.tsMs === "number" && Number.isFinite(event.tsMs)) {
    return event.tsMs;
  }
  if (typeof event.ts === "number" && Number.isFinite(event.ts)) {
    return event.ts;
  }
  if (typeof event.ts === "string") {
    const parsed = Date.parse(event.ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readMetaAtlasHits(meta: Record<string, unknown> | null): number {
  if (!meta) return 0;
  const direct = readNumber(meta.atlasHits);
  if (direct !== null) return direct;
  const channelHits = asRecord(meta.channelHits ?? meta.retrieval_channel_hits);
  if (channelHits) {
    const atlas = readNumber(channelHits.atlas);
    if (atlas !== null) return atlas;
  }
  return 0;
}

function readMetaAtlasGraphSelected(meta: Record<string, unknown> | null): number {
  if (!meta) return 0;
  const direct = readNumber(meta.atlasGraphSelectedCount ?? meta.retrieval_atlas_graph_selected_count);
  return direct ?? 0;
}

function readMetaRepoHits(meta: Record<string, unknown> | null): number {
  if (!meta) return 0;
  const direct = readNumber(meta.repoHits);
  if (direct !== null) return direct;
  const channelHits = asRecord(meta.channelHits ?? meta.retrieval_channel_hits);
  if (!channelHits) return 0;
  const docs = readNumber(channelHits.docs) ?? 0;
  const git = readNumber(channelHits.git) ?? 0;
  const path = readNumber(channelHits.path) ?? 0;
  const code = readNumber(channelHits.code) ?? 0;
  return docs + git + path + code;
}

function readMetaExactPaths(
  meta: Record<string, unknown> | null,
  maxCount = Number.POSITIVE_INFINITY,
): string[] {
  if (!meta) return [];
  const raw = meta.exact_paths ?? meta.exactPaths;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeRepoPath(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxCount) break;
  }
  return out;
}

function isOpenWorldMeta(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  const mode = readString(meta.openWorldBypassMode ?? meta.open_world_bypass_mode).toLowerCase();
  if (mode === "active") return true;
  const route = readString(meta.retrievalRoute ?? meta.retrieval_route).toLowerCase();
  return route.includes("open_world");
}

function resolveDirectionFromAction(action: ReasoningTheaterFrontierAction): -1 | 0 | 1 {
  if (action === "steady") return 0;
  if (action === "small_gain" || action === "large_gain") return 1;
  return -1;
}

export function resolveZoneMotionFrame(input: ZoneMotionFrameInput): ZoneMotionFrame {
  const sweepX = clampNumber(input.meterPct, 0, 100);
  if (!input.motion.enabled) {
    return {
      sweepX,
      direction: 0,
      velocityNorm: 0,
      sweepOpacity: 0,
    };
  }
  const radians = (input.frontierProfile.base_direction_deg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  let direction: -1 | 0 | 1 = 0;
  if (cosine > 0.06) {
    direction = 1;
  } else if (cosine < -0.06) {
    direction = -1;
  } else {
    direction = resolveDirectionFromAction(input.frontierAction);
  }
  const avgSpeed =
    (Math.max(0, input.frontierProfile.speed_min_px_s) +
      Math.max(0, input.frontierProfile.speed_max_px_s)) /
    2;
  const velocityNorm = clampNumber(avgSpeed / 150, 0, 1);
  const zoneIntensity = clampNumber(input.zoneIntensity, 0, 1);
  const sweepOpacityMin = clampNumber(input.motion.sweep_opacity_min, 0, 1);
  const sweepOpacityMax = clampNumber(
    Math.max(sweepOpacityMin, input.motion.sweep_opacity_max),
    0,
    1,
  );
  const sweepOpacity = clampNumber(
    sweepOpacityMin + zoneIntensity * (sweepOpacityMax - sweepOpacityMin),
    sweepOpacityMin,
    sweepOpacityMax,
  );
  return {
    sweepX,
    direction,
    velocityNorm,
    sweepOpacity,
  };
}

export function resolveNodeFrontierInfluence(
  nodeX: number,
  sweepX: number,
  falloffPct: number,
): number {
  const distance = Math.abs(nodeX - sweepX);
  const falloff = Math.max(0.001, Math.abs(falloffPct));
  return clampNumber(1 - distance / falloff, 0, 1);
}

export function resolveEdgeFrontierInfluence(
  midX: number,
  sweepX: number,
  falloffPct: number,
): number {
  return resolveNodeFrontierInfluence(midX, sweepX, falloffPct);
}

export function classifyZoneFromEvent(
  event: ReasoningTheaterZoneEvent,
): ReasoningTheaterRetrievalZone {
  const meta = asRecord(event.meta);
  if (isOpenWorldMeta(meta)) return "uncharted";

  const atlasHits = readMetaAtlasHits(meta);
  const atlasGraphSelected = readMetaAtlasGraphSelected(meta);
  if (atlasHits > 0 || atlasGraphSelected > 0) {
    return "mapped_connected";
  }

  const repoHits = readMetaRepoHits(meta);
  if (repoHits > 0 && atlasHits <= 0) {
    return "owned_frontier";
  }

  const text = `${event.tool ?? ""} ${event.text ?? ""}`.toLowerCase();
  if (/open[-_\s]?world|retrieval:open_world/.test(text)) return "uncharted";
  if (/atlas|graph selected|atlas gate.*ok/.test(text)) return "mapped_connected";
  if (/repo|git|docs|path retrieval|search/.test(text)) return "owned_frontier";
  return DEFAULT_ZONE;
}

export function extractRetrievalFootprintMeta(
  event: ReasoningTheaterZoneEvent,
  maxExactPaths = Number.POSITIVE_INFINITY,
): RetrievalFootprintMeta {
  const meta = asRecord(event.meta);
  const exactPaths = readMetaExactPaths(meta, maxExactPaths);
  const pathCountRaw = meta ? readNumber(meta.path_count ?? meta.pathCount) : null;
  const pathCount = pathCountRaw !== null ? Math.max(0, Math.floor(pathCountRaw)) : exactPaths.length;
  const primaryPathRaw = meta ? readString(meta.primary_path ?? meta.primaryPath) : "";
  const primaryPath = primaryPathRaw ? normalizeRepoPath(primaryPathRaw) : null;
  const zoneHintRaw = meta ? readString(meta.zone_hint ?? meta.zoneHint).toLowerCase() : "";
  const zoneHint = isZone(zoneHintRaw) ? zoneHintRaw : null;
  const hasExactRaw =
    typeof meta?.has_exact_provenance === "boolean"
      ? meta.has_exact_provenance
      : typeof meta?.hasExactProvenance === "boolean"
        ? meta.hasExactProvenance
        : null;
  const hasExactProvenance = hasExactRaw !== null ? hasExactRaw : pathCount > 0 || exactPaths.length > 0;
  return {
    exactPaths,
    pathCount,
    zoneHint,
    hasExactProvenance,
    primaryPath,
  };
}

function isRetrievalEvent(event: ReasoningTheaterZoneEvent): boolean {
  const meta = asRecord(event.meta);
  if (!meta) {
    const text = `${event.tool ?? ""} ${event.text ?? ""}`.toLowerCase();
    return /retrieval|open[-_\s]?world|atlas gate/.test(text);
  }
  if (
    "exact_paths" in meta ||
    "exactPaths" in meta ||
    "zone_hint" in meta ||
    "zoneHint" in meta ||
    "retrievalRoute" in meta ||
    "retrieval_route" in meta ||
    "channelHits" in meta ||
    "retrieval_channel_hits" in meta ||
    "atlasHits" in meta
  ) {
    return true;
  }
  const text = `${event.tool ?? ""} ${event.text ?? ""}`.toLowerCase();
  return /retrieval|open[-_\s]?world|atlas gate/.test(text);
}

export function buildZoneCausalQueue(
  events: ReasoningTheaterZoneEvent[],
  options: {
    zoneConfig: ReasoningTheaterZoneConfig;
    startEpochMs?: number;
  },
): ZoneCausalEvent[] {
  if (!events.length || !options.zoneConfig.enabled) return [];
  const presentation = options.zoneConfig.presentation;
  const sorted = events
    .map((event, index) => ({
      event,
      index,
      tsMs: parseTsMs(event, (options.startEpochMs ?? 0) + index * 120),
    }))
    .filter((entry) => isRetrievalEvent(entry.event))
    .sort((a, b) => (a.tsMs === b.tsMs ? a.index - b.index : a.tsMs - b.tsMs));
  if (!sorted.length) return [];
  const firstTs = sorted[0]?.tsMs ?? 0;
  const out: ZoneCausalEvent[] = [];
  for (const entry of sorted) {
    const footprint = extractRetrievalFootprintMeta(
      entry.event,
      presentation.max_exact_paths_per_event,
    );
    const fallbackZone = classifyZoneFromEvent(entry.event);
    const zone = footprint.zoneHint ?? fallbackZone;
    const startMs = Math.max(0, entry.tsMs - firstTs);
    const holdUntilMs = startMs + presentation.event_hold_ms;
    const endMs = startMs + presentation.event_pulse_ms;
    out.push({
      zone,
      startMs,
      holdUntilMs,
      endMs,
      sourceEventId: entry.event.id ?? `${entry.index}`,
      openWorldActive: zone === "uncharted",
      exactPaths: footprint.exactPaths,
      hasExactProvenance: footprint.hasExactProvenance,
      primaryPath: footprint.primaryPath,
    });
  }
  return out;
}

export function mapExactPathsToNodeIds(
  layout: ReasoningTheaterDenseZoneLayout,
  exactPaths: string[],
  zone: ReasoningTheaterRetrievalZone,
  seed: number,
): string[] {
  if (!exactPaths.length) return [];
  const zoneNodes = layout.nodes.filter((node) => node.zone === zone);
  if (!zoneNodes.length) return [];
  const normalized = zoneNodes
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of exactPaths) {
    const hashed = hash32(`${seed}:${zone}:${normalizeRepoPath(path).toLowerCase()}`);
    const node = normalized[hashed % normalized.length];
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node.id);
  }
  return out;
}

export function resolveZoneCausalFrameAtTime(
  queue: ZoneCausalEvent[],
  elapsedMs: number,
  fallbackZone: ReasoningTheaterRetrievalZone = DEFAULT_ZONE,
): ZoneCausalFrame {
  if (!queue.length) {
    return {
      activeZone: fallbackZone,
      intensity: 0,
      exactNodeIds: [],
      hasExactProvenance: false,
      openWorldActive: false,
      deltaMs: 0,
    };
  }
  let selected: ZoneCausalEvent | null = null;
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (elapsedMs >= queue[i].startMs) {
      selected = queue[i];
      break;
    }
  }
  if (!selected) {
    return {
      activeZone: fallbackZone,
      intensity: 0,
      exactNodeIds: [],
      hasExactProvenance: false,
      openWorldActive: false,
      deltaMs: 0,
    };
  }
  const deltaMs = elapsedMs - selected.startMs;
  if (elapsedMs <= selected.holdUntilMs) {
    return {
      activeZone: selected.zone,
      intensity: 1,
      exactNodeIds: [],
      hasExactProvenance: selected.hasExactProvenance,
      openWorldActive: selected.openWorldActive,
      deltaMs,
    };
  }
  if (elapsedMs >= selected.endMs) {
    return {
      activeZone: selected.zone,
      intensity: 0,
      exactNodeIds: [],
      hasExactProvenance: selected.hasExactProvenance,
      openWorldActive: selected.openWorldActive,
      deltaMs,
    };
  }
  const decaySpan = Math.max(1, selected.endMs - selected.holdUntilMs);
  const decayProgress = clampNumber((elapsedMs - selected.holdUntilMs) / decaySpan, 0, 1);
  return {
    activeZone: selected.zone,
    intensity: Number((1 - decayProgress).toFixed(4)),
    exactNodeIds: [],
    hasExactProvenance: selected.hasExactProvenance,
    openWorldActive: selected.openWorldActive,
    deltaMs,
  };
}

export function buildZoneActivityQueue(
  events: ReasoningTheaterZoneEvent[],
  options: {
    zoneConfig: ReasoningTheaterZoneConfig;
    startEpochMs?: number;
  },
): ReasoningTheaterZonePulse[] {
  if (!events.length || !options.zoneConfig.enabled) return [];
  const sorted = events
    .map((event, index) => ({
      event,
      index,
      tsMs: parseTsMs(event, (options.startEpochMs ?? 0) + index * 120),
    }))
    .sort((a, b) => (a.tsMs === b.tsMs ? a.index - b.index : a.tsMs - b.tsMs));
  const firstTs = sorted[0]?.tsMs ?? 0;
  const pulses: ReasoningTheaterZonePulse[] = [];
  for (const entry of sorted) {
    const zone = classifyZoneFromEvent(entry.event);
    const startMs = Math.max(0, entry.tsMs - firstTs);
    const holdUntilMs = startMs + options.zoneConfig.hold_ms;
    const endMs = startMs + options.zoneConfig.pulse_ms;
    pulses.push({
      zone,
      startMs,
      holdUntilMs,
      endMs,
      sourceEventId: entry.event.id ?? `${entry.index}`,
      openWorldActive: zone === "uncharted",
    });
  }
  return pulses;
}

export function resolveActiveZoneAtTime(
  pulses: ReasoningTheaterZonePulse[],
  elapsedMs: number,
  fallbackZone: ReasoningTheaterRetrievalZone = DEFAULT_ZONE,
): ReasoningTheaterZoneTimelineState {
  if (!pulses.length) {
    return {
      zone: fallbackZone,
      intensity: 0,
      openWorldActive: false,
      deltaMs: 0,
    };
  }
  let selected: ReasoningTheaterZonePulse | null = null;
  for (let i = pulses.length - 1; i >= 0; i -= 1) {
    if (elapsedMs >= pulses[i].startMs) {
      selected = pulses[i];
      break;
    }
  }
  if (!selected) {
    return {
      zone: fallbackZone,
      intensity: 0,
      openWorldActive: false,
      deltaMs: 0,
    };
  }
  const deltaMs = elapsedMs - selected.startMs;
  if (elapsedMs <= selected.holdUntilMs) {
    return {
      zone: selected.zone,
      intensity: 1,
      openWorldActive: selected.openWorldActive,
      deltaMs,
    };
  }
  if (elapsedMs >= selected.endMs) {
    return {
      zone: selected.zone,
      intensity: 0,
      openWorldActive: selected.openWorldActive,
      deltaMs,
    };
  }
  const decaySpan = Math.max(1, selected.endMs - selected.holdUntilMs);
  const decayProgress = clampNumber((elapsedMs - selected.holdUntilMs) / decaySpan, 0, 1);
  return {
    zone: selected.zone,
    intensity: Number((1 - decayProgress).toFixed(4)),
    openWorldActive: selected.openWorldActive,
    deltaMs,
  };
}

function buildZoneNodes(
  zone: ReasoningTheaterRetrievalZone,
  count: number,
  rng: () => number,
  offset: number,
): ReasoningTheaterZoneNode[] {
  const region = ZONE_REGIONS[zone];
  const nodes: ReasoningTheaterZoneNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const radial = Math.sqrt(rng());
    const theta = rng() * Math.PI * 2;
    const x = clampNumber(region.cx + Math.cos(theta) * region.rx * radial, 0.02, 0.98);
    const y = clampNumber(region.cy + Math.sin(theta) * region.ry * radial, 0.04, 0.96);
    nodes.push({
      id: `zone-node-${zone}-${offset + i}`,
      zone,
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      radius: Number((1.1 + rng() * 1.6).toFixed(3)),
      alpha: Number((0.35 + rng() * 0.5).toFixed(3)),
    });
  }
  return nodes;
}

function distanceSq(a: ReasoningTheaterZoneNode, b: ReasoningTheaterZoneNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function linkNearestNeighbors(
  nodes: ReasoningTheaterZoneNode[],
  edges: ReasoningTheaterZoneEdge[],
  edgeIds: Set<string>,
): void {
  for (const node of nodes) {
    const nearest = nodes
      .filter((candidate) => candidate.id !== node.id)
      .map((candidate) => ({
        candidate,
        dist: distanceSq(node, candidate),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    for (const pair of nearest) {
      const left = node.id < pair.candidate.id ? node.id : pair.candidate.id;
      const right = node.id < pair.candidate.id ? pair.candidate.id : node.id;
      const key = `${left}|${right}`;
      if (edgeIds.has(key)) continue;
      edgeIds.add(key);
      edges.push({
        id: `edge-${left}-${right}`,
        from: left,
        to: right,
        alpha: 0.28,
        kind: "internal",
      });
    }
  }
}

function bridgeZones(
  sourceNodes: ReasoningTheaterZoneNode[],
  targetNodes: ReasoningTheaterZoneNode[],
  edges: ReasoningTheaterZoneEdge[],
  edgeIds: Set<string>,
  stride: number,
): void {
  if (!sourceNodes.length || !targetNodes.length) return;
  for (let i = 0; i < sourceNodes.length; i += stride) {
    const source = sourceNodes[i];
    const target = targetNodes[i % targetNodes.length];
    const left = source.id < target.id ? source.id : target.id;
    const right = source.id < target.id ? target.id : source.id;
    const key = `${left}|${right}`;
    if (edgeIds.has(key)) continue;
    edgeIds.add(key);
    edges.push({
      id: `edge-${left}-${right}`,
      from: left,
      to: right,
      alpha: 0.22,
      kind: "bridge",
    });
  }
}

export function buildDenseZoneNodeLayout(
  topology: ReasoningTheaterTopologyResponse,
  seed: number,
): ReasoningTheaterDenseZoneLayout {
  const connected = Math.max(0, Math.floor(topology.display.connected_nodes));
  const frontier = Math.max(0, Math.floor(topology.display.frontier_nodes));
  const uncharted = Math.max(0, Math.floor(topology.display.uncharted_nodes));
  const rng = mulberry32(seed ^ topology.display.seed ^ hash32(topology.version));

  const connectedNodes = buildZoneNodes("mapped_connected", connected, rng, 0);
  const frontierNodes = buildZoneNodes("owned_frontier", frontier, rng, connectedNodes.length);
  const unchartedNodes = buildZoneNodes(
    "uncharted",
    uncharted,
    rng,
    connectedNodes.length + frontierNodes.length,
  );
  const nodes = [...connectedNodes, ...frontierNodes, ...unchartedNodes];

  const edges: ReasoningTheaterZoneEdge[] = [];
  const edgeIds = new Set<string>();
  linkNearestNeighbors(connectedNodes, edges, edgeIds);
  linkNearestNeighbors(frontierNodes, edges, edgeIds);
  linkNearestNeighbors(unchartedNodes, edges, edgeIds);
  bridgeZones(frontierNodes, connectedNodes, edges, edgeIds, 5);
  bridgeZones(frontierNodes, unchartedNodes, edges, edgeIds, 7);

  const byId = nodes.reduce<Record<string, ReasoningTheaterZoneNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});

  return { nodes, edges, byId };
}

export function resolveZoneColor(
  zone: ReasoningTheaterRetrievalZone,
  zoneConfig: ReasoningTheaterZoneConfig,
  active: boolean,
): string {
  const entry = zoneConfig.zones[zone];
  return active ? entry.active_color : entry.base_color;
}

export function getZoneOrder(): ReasoningTheaterRetrievalZone[] {
  return ZONE_ORDER.slice();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function readCongruenceTrace(value: unknown): ReasoningTheaterCongruenceTrace[] {
  if (!Array.isArray(value)) return [];
  const out: ReasoningTheaterCongruenceTrace[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const treeId = readString(row.treeId);
    if (!treeId) continue;
    const nodeIds = readStringArray(row.nodeIds);
    out.push({ treeId, nodeIds });
  }
  return out;
}

export function extractLatestCongruenceSelection(
  events: ReasoningTheaterZoneEvent[],
): ReasoningTheaterCongruenceSelection {
  if (!events.length) {
    return {
      treeIds: [],
      primaryTreeId: null,
      trace: [],
      source: "none",
    };
  }

  let treeIds: string[] = [];
  let primaryTreeId: string | null = null;
  let trace: ReasoningTheaterCongruenceTrace[] = [];
  let source: ReasoningTheaterCongruenceSelection["source"] = "none";

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const meta = asRecord(event.meta);
    if (!meta) continue;

    if (!primaryTreeId) {
      const treeWalkPrimary = readString(meta.treeWalkPrimaryTreeId);
      const graphPrimary = readString(meta.graphPackPrimaryTreeId);
      const nextPrimary = treeWalkPrimary || graphPrimary;
      if (nextPrimary) {
        primaryTreeId = nextPrimary;
      }
    }

    if (!treeIds.length) {
      const fromGraphPack = readStringArray(meta.graphPackTreeIds);
      if (fromGraphPack.length) {
        treeIds = fromGraphPack;
      }
    }

    if (source === "none") {
      const treeWalkTrace = readCongruenceTrace(meta.treeWalkTrace);
      if (treeWalkTrace.length) {
        trace = treeWalkTrace;
        source = "tree_walk";
      }
    }

    if (treeIds.length && source !== "none" && primaryTreeId) break;
  }

  if (!treeIds.length && trace.length) {
    treeIds = Array.from(new Set(trace.map((entry) => entry.treeId.trim()).filter(Boolean)));
  }
  if (!primaryTreeId && treeIds.length) {
    primaryTreeId = treeIds[0];
  }
  if (primaryTreeId) {
    const primaryTreeKey = normalizeTreeId(primaryTreeId);
    const inTreeIds = treeIds.some((entry) => normalizeTreeId(entry) === primaryTreeKey);
    if (!inTreeIds && treeIds.length) {
      primaryTreeId = treeIds[0];
    }
  }

  return {
    treeIds,
    primaryTreeId: primaryTreeId ?? null,
    trace,
    source,
  };
}

export function buildCongruenceGraphIndex(
  graph: ReasoningTheaterCongruenceGraphResponse,
): ReasoningTheaterCongruenceGraphIndex {
  const trees = Array.isArray(graph.trees)
    ? graph.trees
        .filter((tree) => tree && typeof tree.id === "string")
        .map((tree) => ({
          id: tree.id.trim(),
          label: typeof tree.label === "string" && tree.label.trim() ? tree.label.trim() : tree.id.trim(),
          rootId: typeof tree.root_id === "string" && tree.root_id.trim() ? tree.root_id.trim() : null,
          nodeCount: Math.max(0, Math.floor(Number(tree.node_count) || 0)),
        }))
    : [];

  const treeById = trees.reduce<Record<string, ReasoningTheaterCongruenceTree>>((acc, tree) => {
    acc[normalizeTreeId(tree.id)] = tree;
    return acc;
  }, {});

  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes
        .filter((node) => node && typeof node.id === "string")
        .map((node) => {
          const treeId = readString(node.tree_id);
          const nodeId = readString(node.node_id);
          const title = readString(node.title) || nodeId || node.id;
          const id = readString(node.id).toLowerCase();
          return {
            id,
            treeId,
            nodeId,
            title,
            zone: node.zone === "mapped_connected" ? "mapped_connected" : "owned_frontier",
            atlasLinked: Boolean(node.atlas_linked),
            x: clampNumber(Number(node.x), 0, 1),
            y: clampNumber(Number(node.y), 0, 1),
            degree: Math.max(0, Math.floor(Number(node.degree) || 0)),
            depth: Math.max(0, Math.floor(Number(node.depth) || 0)),
          } satisfies ReasoningTheaterCongruenceNode;
        })
    : [];

  const byId: Record<string, ReasoningTheaterCongruenceNode> = {};
  const nodeIdByTreeAndNodeId: Record<string, string> = {};
  for (const node of nodes) {
    byId[node.id] = node;
    const key = createCongruenceNodeKey(node.treeId, node.nodeId);
    nodeIdByTreeAndNodeId[key] = node.id;
  }

  const edges = Array.isArray(graph.edges)
    ? graph.edges
        .filter((edge) => edge && typeof edge.id === "string")
        .map((edge) => ({
          id: readString(edge.id),
          treeId: readString(edge.tree_id),
          from: readString(edge.from).toLowerCase(),
          to: readString(edge.to).toLowerCase(),
          rel: readString(edge.rel) || "link",
          edgeType: readString(edge.edge_type) || "link",
          requiresCl:
            typeof edge.requires_cl === "string" && edge.requires_cl.trim()
              ? edge.requires_cl.trim()
              : null,
          weight: clampNumber(Number(edge.weight), 0, 1),
        }))
        .filter((edge) => Boolean(byId[edge.from] && byId[edge.to] && edge.from !== edge.to))
    : [];

  const edgeIdsByPair: Record<string, string[]> = {};
  for (const edge of edges) {
    const pairKey = `${edge.from}|${edge.to}`;
    const reverseKey = `${edge.to}|${edge.from}`;
    edgeIdsByPair[pairKey] = [...(edgeIdsByPair[pairKey] ?? []), edge.id];
    edgeIdsByPair[reverseKey] = [...(edgeIdsByPair[reverseKey] ?? []), edge.id];
  }

  return {
    version: String(graph.version ?? "reasoning_theater.v1"),
    seed: Math.floor(Number(graph.seed) || 0),
    stats: {
      treesTotal: Math.max(0, Math.floor(Number(graph.stats?.trees_total) || trees.length)),
      nodesTotal: Math.max(0, Math.floor(Number(graph.stats?.nodes_total) || nodes.length)),
      edgesTotal: Math.max(0, Math.floor(Number(graph.stats?.edges_total) || edges.length)),
      mappedConnectedNodes: Math.max(
        0,
        Math.floor(Number(graph.stats?.mapped_connected_nodes) || 0),
      ),
      ownedFrontierNodes: Math.max(0, Math.floor(Number(graph.stats?.owned_frontier_nodes) || 0)),
      degraded: Boolean(graph.stats?.degraded),
    },
    trees,
    nodes,
    edges,
    byId,
    nodeIdByTreeAndNodeId,
    edgeIdsByPair,
    treeById,
  };
}

export function mapTraceNodeIdsToCongruenceNodeIds(
  index: ReasoningTheaterCongruenceGraphIndex,
  trace: ReasoningTheaterCongruenceTrace[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const segment of trace) {
    const treeId = segment.treeId;
    if (!treeId) continue;
    for (const nodeId of segment.nodeIds) {
      const key = createCongruenceNodeKey(treeId, nodeId);
      const mapped = index.nodeIdByTreeAndNodeId[key];
      if (!mapped || seen.has(mapped)) continue;
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

export function resolveTraceEdgeIds(
  index: ReasoningTheaterCongruenceGraphIndex,
  orderedNodeIds: string[],
): Set<string> {
  const edgeIds = new Set<string>();
  for (let i = 1; i < orderedNodeIds.length; i += 1) {
    const left = orderedNodeIds[i - 1]?.toLowerCase();
    const right = orderedNodeIds[i]?.toLowerCase();
    if (!left || !right || left === right) continue;
    const pair = `${left}|${right}`;
    for (const edgeId of index.edgeIdsByPair[pair] ?? []) {
      edgeIds.add(edgeId);
    }
  }
  return edgeIds;
}

export function buildAtlasGraphIndex(
  graph: ReasoningTheaterAtlasGraphResponse,
): ReasoningTheaterAtlasGraphIndex {
  const nodes: ReasoningTheaterAtlasNode[] = Array.isArray(graph.nodes)
    ? graph.nodes
        .filter((node) => typeof node?.id === "string" && typeof node?.path === "string")
        .map((node) => ({
          id: String(node.id).toLowerCase(),
          path: normalizeRepoPath(String(node.path)),
          zone: node.zone === "mapped_connected" ? "mapped_connected" : "owned_frontier",
          x: clampNumber(Number(node.x), 0, 1),
          y: clampNumber(Number(node.y), 0, 1),
          degree: Math.max(0, Math.floor(Number(node.degree) || 0)),
        }))
    : [];
  const byId: Record<string, ReasoningTheaterAtlasNode> = {};
  const idsByPath: Record<string, string> = {};
  for (const node of nodes) {
    byId[node.id] = node;
    idsByPath[node.path.toLowerCase()] = node.id;
  }
  const edges: ReasoningTheaterAtlasEdge[] = [];
  const adjacency: Record<string, Array<{ to: string; edgeId: string; weight: number }>> = {};
  for (const node of nodes) {
    adjacency[node.id] = [];
  }
  for (const edge of Array.isArray(graph.edges) ? graph.edges : []) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") continue;
    const from = String(edge.from).toLowerCase();
    const to = String(edge.to).toLowerCase();
    if (!byId[from] || !byId[to] || from === to) continue;
    const id = typeof edge.id === "string" && edge.id.trim() ? edge.id.trim() : `${from}|${to}`;
    const weight = clampNumber(Number(edge.weight), 0, 1);
    edges.push({ id, from, to, weight });
    adjacency[from].push({ to, edgeId: id, weight });
    adjacency[to].push({ to: from, edgeId: id, weight });
  }
  return {
    version: String(graph.version ?? "reasoning_theater.v1"),
    seed: Math.floor(Number(graph.seed) || 0),
    nodes,
    edges,
    byId,
    idsByPath,
    adjacency,
  };
}

export function mapExactPathsToAtlasNodeIds(
  index: ReasoningTheaterAtlasGraphIndex,
  exactPaths: string[],
): string[] {
  if (!exactPaths.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawPath of exactPaths) {
    const key = normalizeRepoPath(rawPath).toLowerCase();
    if (!key) continue;
    const id = index.idsByPath[key];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sortNodeIdsDeterministic(ids: string[]): string[] {
  return ids.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function selectFocusedSubgraph(
  index: ReasoningTheaterAtlasGraphIndex,
  seedIds: string[],
  activeZone: ReasoningTheaterRetrievalZone,
  cfg: ReasoningTheaterZoneGraphFocusConfig,
): ReasoningTheaterFocusedSubgraph {
  const maxVisibleNodes = clampNumber(cfg.max_visible_nodes, 80, 160);
  const maxVisibleEdges = clampNumber(cfg.max_visible_edges, 120, 500);
  const hopLimit = clampNumber(cfg.hop_limit, 1, 5);
  const neighborCap = clampNumber(cfg.neighbor_cap_per_node, 2, 16);

  let frontierSeedIds = sortNodeIdsDeterministic(
    seedIds.filter((id) => Boolean(index.byId[id])),
  );
  if (!frontierSeedIds.length) {
    frontierSeedIds = sortNodeIdsDeterministic(
      index.nodes
        .filter((node) => node.zone === activeZone || (activeZone === "uncharted" && node.zone === "owned_frontier"))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 8)
        .map((node) => node.id),
    );
  }
  if (!frontierSeedIds.length) {
    frontierSeedIds = sortNodeIdsDeterministic(index.nodes.slice(0, 8).map((node) => node.id));
  }

  const selected = new Set<string>(frontierSeedIds);
  let wave = frontierSeedIds.slice();
  for (let hop = 0; hop < hopLimit && selected.size < maxVisibleNodes && wave.length > 0; hop += 1) {
    const nextWave: string[] = [];
    for (const nodeId of wave) {
      const neighbors = (index.adjacency[nodeId] ?? [])
        .slice()
        .sort((a, b) => b.weight - a.weight || (a.to < b.to ? -1 : 1))
        .slice(0, neighborCap);
      for (const entry of neighbors) {
        if (selected.size >= maxVisibleNodes) break;
        if (selected.has(entry.to)) continue;
        selected.add(entry.to);
        nextWave.push(entry.to);
      }
      if (selected.size >= maxVisibleNodes) break;
    }
    wave = nextWave;
  }

  const nodes = sortNodeIdsDeterministic(Array.from(selected))
    .map((id) => index.byId[id])
    .filter((node): node is ReasoningTheaterAtlasNode => Boolean(node));
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = index.edges
    .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to))
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .slice(0, maxVisibleEdges);
  const byId = nodes.reduce<Record<string, ReasoningTheaterAtlasNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});
  return { nodes, edges, byId };
}

export function computeCameraTargetFromNodes(nodes: ReasoningTheaterAtlasNode[]): {
  cx: number;
  cy: number;
} {
  if (!nodes.length) return { cx: 0.5, cy: 0.5 };
  let sx = 0;
  let sy = 0;
  for (const node of nodes) {
    sx += node.x;
    sy += node.y;
  }
  return { cx: sx / nodes.length, cy: sy / nodes.length };
}

export function createInitialAtlasCameraState(): ReasoningTheaterAtlasCameraState {
  return { cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.24 };
}

export function stepAtlasCameraState(
  prev: ReasoningTheaterAtlasCameraState,
  target: { cx: number; cy: number },
  subgraph: ReasoningTheaterFocusedSubgraph,
  cfg: ReasoningTheaterZoneGraphFocusConfig,
): ReasoningTheaterAtlasCameraState {
  const lerp = clampNumber(cfg.camera_lerp, 0.05, 0.6);
  const padding = clampNumber(cfg.camera_padding_pct, 0.04, 0.24);
  const minHalfW = 0.2;
  const minHalfH = 0.14;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const node of subgraph.nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const targetHalfW = subgraph.nodes.length
    ? clampNumber((maxX - minX) * 0.5 + padding, minHalfW, 0.49)
    : prev.halfW;
  const targetHalfH = subgraph.nodes.length
    ? clampNumber((maxY - minY) * 0.5 + padding * 0.6, minHalfH, 0.49)
    : prev.halfH;
  const nextCx = prev.cx + (target.cx - prev.cx) * lerp;
  const nextCy = prev.cy + (target.cy - prev.cy) * lerp;
  const nextHalfW = prev.halfW + (targetHalfW - prev.halfW) * lerp;
  const nextHalfH = prev.halfH + (targetHalfH - prev.halfH) * lerp;
  return {
    cx: clampNumber(nextCx, nextHalfW, 1 - nextHalfW),
    cy: clampNumber(nextCy, nextHalfH, 1 - nextHalfH),
    halfW: nextHalfW,
    halfH: nextHalfH,
  };
}

function projectPointToViewport(
  x: number,
  y: number,
  camera: ReasoningTheaterAtlasCameraState,
): { x: number; y: number } {
  const normX = (x - (camera.cx - camera.halfW)) / Math.max(0.0001, camera.halfW * 2);
  const normY = (y - (camera.cy - camera.halfH)) / Math.max(0.0001, camera.halfH * 2);
  return {
    x: clampNumber(normX * 100, 0, 100),
    y: clampNumber(normY * 32, 0, 32),
  };
}

export function projectFocusedSubgraph(
  subgraph: ReasoningTheaterFocusedSubgraph,
  camera: ReasoningTheaterAtlasCameraState,
): ReasoningTheaterProjectedSubgraph {
  const nodes = subgraph.nodes.map((node) => {
    const projected = projectPointToViewport(node.x, node.y, camera);
    return {
      id: node.id,
      zone: node.zone,
      x: projected.x,
      y: projected.y,
      degree: node.degree,
      path: node.path,
    };
  });
  const byId = nodes.reduce<Record<string, ReasoningTheaterProjectedNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});
  const edges = subgraph.edges
    .filter((edge) => Boolean(byId[edge.from] && byId[edge.to]))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
    }));
  return { nodes, edges, byId };
}

export function resolveIndicatorCentroid(
  projectedNodes: ReasoningTheaterProjectedNode[],
  activeIds: string[],
  fallbackZone: ReasoningTheaterRetrievalZone,
): { x: number; y: number } {
  const byId = projectedNodes.reduce<Record<string, ReasoningTheaterProjectedNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});
  const activeNodes = activeIds.map((id) => byId[id]).filter((node): node is ReasoningTheaterProjectedNode => Boolean(node));
  if (activeNodes.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const node of activeNodes) {
      sx += node.x;
      sy += node.y;
    }
    return { x: sx / activeNodes.length, y: sy / activeNodes.length };
  }
  const zoneNodes = projectedNodes.filter((node) => {
    if (fallbackZone === "uncharted") return node.zone === "owned_frontier";
    return node.zone === fallbackZone;
  });
  if (zoneNodes.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const node of zoneNodes) {
      sx += node.x;
      sy += node.y;
    }
    return { x: sx / zoneNodes.length, y: sy / zoneNodes.length };
  }
  return { x: 50, y: 16 };
}

export function resolveZoneBlobGeometry(
  projectedNodes: ReasoningTheaterProjectedNode[],
  zone: ReasoningTheaterRetrievalZone,
): { cx: number; cy: number; rx: number; ry: number } {
  const zoneNodes = projectedNodes.filter((node) => {
    if (zone === "uncharted") return false;
    return node.zone === zone;
  });
  if (!zoneNodes.length) {
    if (zone === "mapped_connected") return { cx: 34, cy: 13.5, rx: 20, ry: 8.8 };
    if (zone === "owned_frontier") return { cx: 68, cy: 13.5, rx: 19, ry: 8.8 };
    return { cx: 50, cy: 25, rx: 28, ry: 6.5 };
  }
  let minX = 100;
  let maxX = 0;
  let minY = 32;
  let maxY = 0;
  for (const node of zoneNodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  return {
    cx: Number(((minX + maxX) * 0.5).toFixed(3)),
    cy: Number(((minY + maxY) * 0.5).toFixed(3)),
    rx: Number((Math.max(6, (maxX - minX) * 0.56 + 4)).toFixed(3)),
    ry: Number((Math.max(3.2, (maxY - minY) * 0.56 + 2)).toFixed(3)),
  };
}
