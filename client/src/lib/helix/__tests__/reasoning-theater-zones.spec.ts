import { describe, expect, it } from "vitest";
import type { ReasoningTheaterTopologyResponse } from "@/lib/agi/api";
import { getDefaultReasoningTheaterConfig } from "@/lib/helix/reasoning-theater-config";
import {
  buildAtlasGraphIndex,
  buildCongruenceGraphIndex,
  buildDenseZoneNodeLayout,
  buildZoneCausalQueue,
  buildZoneActivityQueue,
  classifyZoneFromEvent,
  createInitialAtlasCameraState,
  extractLatestCongruenceSelection,
  extractRetrievalFootprintMeta,
  mapExactPathsToAtlasNodeIds,
  mapExactPathsToNodeIds,
  mapTraceNodeIdsToCongruenceNodeIds,
  projectFocusedSubgraph,
  resolveTraceEdgeIds,
  resolveEdgeFrontierInfluence,
  resolveIndicatorCentroid,
  resolveActiveZoneAtTime,
  resolveNodeFrontierInfluence,
  resolveZoneCausalFrameAtTime,
  resolveZoneMotionFrame,
  selectFocusedSubgraph,
} from "@/lib/helix/reasoning-theater-zones";

const zoneConfig = getDefaultReasoningTheaterConfig().retrieval_zone_layer;

const baseTopology: ReasoningTheaterTopologyResponse = {
  version: "reasoning_theater.v1",
  generated_at: new Date(0).toISOString(),
  baseline: {
    owned_total: 1000,
    connected_owned: 420,
    owned_not_connected: 580,
    convergence_ratio: 0.42,
  },
  sources: {
    owned_source: "git_tracked",
    connected_source: "atlas_corpus",
    atlas_unique_files: 80,
    atlas_existing_files: 42,
    degraded: false,
  },
  display: {
    node_density_mode: "dense",
    total_nodes: 120,
    connected_nodes: 40,
    frontier_nodes: 56,
    uncharted_nodes: 24,
    seed: 11223344,
  },
};

describe("reasoning theater zones", () => {
  it("classifies atlas-hit events as mapped_connected", () => {
    const zone = classifyZoneFromEvent({
      id: "evt1",
      text: "Retrieval channels",
      meta: {
        channelHits: { atlas: 3, docs: 0, git: 0, path: 0, code: 0 },
      },
    });
    expect(zone).toBe("mapped_connected");
  });

  it("classifies repo-only events as owned_frontier", () => {
    const zone = classifyZoneFromEvent({
      id: "evt2",
      text: "Retrieval channels",
      meta: {
        channelHits: { atlas: 0, docs: 2, git: 1, path: 1, code: 0 },
      },
    });
    expect(zone).toBe("owned_frontier");
  });

  it("classifies open-world active events as uncharted", () => {
    const zone = classifyZoneFromEvent({
      id: "evt3",
      text: "Open-world mode active",
      meta: {
        openWorldBypassMode: "active",
        retrievalRoute: "retrieval:open_world",
      },
    });
    expect(zone).toBe("uncharted");
  });

  it("applies deterministic pulse hold/decay", () => {
    const queue = buildZoneActivityQueue(
      [
        {
          id: "evt4",
          tsMs: 1000,
          meta: { channelHits: { atlas: 2 } },
        },
      ],
      { zoneConfig, startEpochMs: 1000 },
    );
    expect(queue).toHaveLength(1);
    expect(resolveActiveZoneAtTime(queue, 100)).toMatchObject({
      zone: "mapped_connected",
      intensity: 1,
    });
    const decayed = resolveActiveZoneAtTime(queue, zoneConfig.hold_ms + 240);
    expect(decayed.zone).toBe("mapped_connected");
    expect(decayed.intensity).toBeLessThan(1);
    expect(decayed.intensity).toBeGreaterThan(0);
  });

  it("builds deterministic dense layout for same seed/topology", () => {
    const layoutA = buildDenseZoneNodeLayout(baseTopology, 9001);
    const layoutB = buildDenseZoneNodeLayout(baseTopology, 9001);
    expect(layoutA.nodes).toEqual(layoutB.nodes);
    expect(layoutA.edges).toEqual(layoutB.edges);
  });

  it("keeps dense node totals aligned with topology counts", () => {
    const layout = buildDenseZoneNodeLayout(baseTopology, 73);
    expect(layout.nodes.length).toBe(
      baseTopology.display.connected_nodes +
        baseTopology.display.frontier_nodes +
        baseTopology.display.uncharted_nodes,
    );
    expect(baseTopology.display.total_nodes).toBeGreaterThanOrEqual(80);
    expect(baseTopology.display.total_nodes).toBeLessThanOrEqual(140);
  });

  it("resolves motion frame deterministically from meter and frontier profile", () => {
    const cfg = getDefaultReasoningTheaterConfig();
    const gainMotion = resolveZoneMotionFrame({
      elapsedMs: 500,
      meterPct: 67.4,
      frontierAction: "large_gain",
      frontierProfile: cfg.frontier_actions.actions.large_gain.particle_profile,
      activeZone: "mapped_connected",
      zoneIntensity: 0.75,
      motion: cfg.retrieval_zone_layer.motion,
    });
    expect(gainMotion.sweepX).toBeCloseTo(67.4, 4);
    expect(gainMotion.direction).toBe(1);
    expect(gainMotion.velocityNorm).toBeGreaterThan(0);
    expect(gainMotion.sweepOpacity).toBeGreaterThanOrEqual(
      cfg.retrieval_zone_layer.motion.sweep_opacity_min,
    );
    expect(gainMotion.sweepOpacity).toBeLessThanOrEqual(
      cfg.retrieval_zone_layer.motion.sweep_opacity_max,
    );

    const lossMotion = resolveZoneMotionFrame({
      elapsedMs: 500,
      meterPct: -20,
      frontierAction: "large_loss",
      frontierProfile: cfg.frontier_actions.actions.large_loss.particle_profile,
      activeZone: "owned_frontier",
      zoneIntensity: 0.4,
      motion: cfg.retrieval_zone_layer.motion,
    });
    expect(lossMotion.sweepX).toBe(0);
    expect(lossMotion.direction).toBe(-1);
  });

  it("node/edge frontier influence decays with distance from sweep", () => {
    const nearNode = resolveNodeFrontierInfluence(52, 50, 10);
    const farNode = resolveNodeFrontierInfluence(80, 50, 10);
    expect(nearNode).toBeGreaterThan(farNode);
    expect(nearNode).toBeLessThanOrEqual(1);
    expect(farNode).toBeGreaterThanOrEqual(0);

    const nearEdge = resolveEdgeFrontierInfluence(48, 50, 12);
    const farEdge = resolveEdgeFrontierInfluence(90, 50, 12);
    expect(nearEdge).toBeGreaterThan(farEdge);
    expect(nearEdge).toBeLessThanOrEqual(1);
    expect(farEdge).toBeGreaterThanOrEqual(0);
  });

  it("extracts retrieval footprint meta with strict exact provenance fields", () => {
    const footprint = extractRetrievalFootprintMeta(
      {
        id: "evt-footprint",
        text: "Retrieval channels",
        meta: {
          exact_paths: ["src/a.ts", "./src/a.ts", "src/b.ts"],
          path_count: 9,
          zone_hint: "owned_frontier",
          has_exact_provenance: true,
        },
      },
      2,
    );
    expect(footprint.exactPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(footprint.pathCount).toBe(9);
    expect(footprint.zoneHint).toBe("owned_frontier");
    expect(footprint.hasExactProvenance).toBe(true);
  });

  it("builds causal queue with deterministic hold/decay timing", () => {
    const cfg = getDefaultReasoningTheaterConfig();
    const queue = buildZoneCausalQueue(
      [
        {
          id: "evt-causal",
          tsMs: 1_000,
          meta: {
            zone_hint: "mapped_connected",
            exact_paths: ["server/routes/agi.plan.ts"],
            has_exact_provenance: true,
          },
        },
      ],
      {
        zoneConfig: cfg.retrieval_zone_layer,
        startEpochMs: 1_000,
      },
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].zone).toBe("mapped_connected");
    const held = resolveZoneCausalFrameAtTime(queue, cfg.retrieval_zone_layer.presentation.event_hold_ms - 1);
    expect(held.activeZone).toBe("mapped_connected");
    expect(held.intensity).toBe(1);
    const decayed = resolveZoneCausalFrameAtTime(
      queue,
      cfg.retrieval_zone_layer.presentation.event_hold_ms + 120,
    );
    expect(decayed.intensity).toBeGreaterThan(0);
    expect(decayed.intensity).toBeLessThan(1);
  });

  it("maps exact paths to deterministic node ids for same layout and seed", () => {
    const layout = buildDenseZoneNodeLayout(baseTopology, 44);
    const paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    const idsA = mapExactPathsToNodeIds(layout, paths, "mapped_connected", 44);
    const idsB = mapExactPathsToNodeIds(layout, paths, "mapped_connected", 44);
    expect(idsA).toEqual(idsB);
  });

  it("strict exact mode yields pulse-only frame when exact paths are absent", () => {
    const cfg = getDefaultReasoningTheaterConfig();
    const queue = buildZoneCausalQueue(
      [
        {
          id: "evt-no-exact",
          tsMs: 500,
          meta: {
            zone_hint: "owned_frontier",
            has_exact_provenance: false,
          },
        },
      ],
      { zoneConfig: cfg.retrieval_zone_layer, startEpochMs: 500 },
    );
    const frame = resolveZoneCausalFrameAtTime(queue, 80);
    expect(frame.activeZone).toBe("owned_frontier");
    expect(frame.hasExactProvenance).toBe(false);
    expect(frame.exactNodeIds).toEqual([]);
  });

  it("falls back to channel/text classifier when zone hint is unknown", () => {
    const queue = buildZoneCausalQueue(
      [
        {
          id: "evt-fallback-zone",
          tsMs: 10,
          text: "Retrieval channels",
          meta: {
            zone_hint: "not_a_zone",
            channelHits: { atlas: 2 },
          },
        },
      ],
      { zoneConfig, startEpochMs: 10 },
    );
    expect(queue[0]?.zone).toBe("mapped_connected");
  });

  it("maps exact paths to real atlas node ids and keeps focus deterministic", () => {
    const graphIndex = buildAtlasGraphIndex({
      version: "v1",
      generated_at: new Date(0).toISOString(),
      seed: 11,
      baseline: {
        owned_total: 4,
        connected_owned: 2,
        owned_not_connected: 2,
        convergence_ratio: 0.5,
      },
      stats: {
        nodes_total: 4,
        edges_total: 3,
        mapped_connected_nodes: 2,
        owned_frontier_nodes: 2,
        uncharted_nodes: 0,
        degraded: false,
      },
      nodes: [
        { id: "src/a.ts", path: "src/A.ts", zone: "mapped_connected", x: 0.2, y: 0.4, degree: 4 },
        { id: "src/b.ts", path: "src/B.ts", zone: "mapped_connected", x: 0.35, y: 0.35, degree: 3 },
        { id: "src/c.ts", path: "src/C.ts", zone: "owned_frontier", x: 0.72, y: 0.38, degree: 2 },
        { id: "src/d.ts", path: "src/D.ts", zone: "owned_frontier", x: 0.82, y: 0.54, degree: 1 },
      ],
      edges: [
        { id: "e1", from: "src/a.ts", to: "src/b.ts", weight: 1 },
        { id: "e2", from: "src/b.ts", to: "src/c.ts", weight: 0.7 },
        { id: "e3", from: "src/c.ts", to: "src/d.ts", weight: 0.6 },
      ],
    });
    const seedIds = mapExactPathsToAtlasNodeIds(graphIndex, ["src/A.ts", "src/c.ts"]);
    expect(seedIds).toEqual(["src/a.ts", "src/c.ts"]);
    const cfg = getDefaultReasoningTheaterConfig().retrieval_zone_layer.graph_focus;
    const focusA = selectFocusedSubgraph(graphIndex, seedIds, "mapped_connected", cfg);
    const focusB = selectFocusedSubgraph(graphIndex, seedIds, "mapped_connected", cfg);
    expect(focusA.nodes.map((node) => node.id)).toEqual(focusB.nodes.map((node) => node.id));
    expect(focusA.edges.map((edge) => edge.id)).toEqual(focusB.edges.map((edge) => edge.id));
  });

  it("projects focused atlas subgraph and keeps indicator centroid in viewport", () => {
    const graphIndex = buildAtlasGraphIndex({
      version: "v1",
      generated_at: new Date(0).toISOString(),
      seed: 11,
      baseline: {
        owned_total: 3,
        connected_owned: 2,
        owned_not_connected: 1,
        convergence_ratio: 0.67,
      },
      stats: {
        nodes_total: 3,
        edges_total: 2,
        mapped_connected_nodes: 2,
        owned_frontier_nodes: 1,
        uncharted_nodes: 0,
        degraded: false,
      },
      nodes: [
        { id: "src/a.ts", path: "src/a.ts", zone: "mapped_connected", x: 0.2, y: 0.2, degree: 3 },
        { id: "src/b.ts", path: "src/b.ts", zone: "mapped_connected", x: 0.4, y: 0.45, degree: 3 },
        { id: "src/c.ts", path: "src/c.ts", zone: "owned_frontier", x: 0.78, y: 0.56, degree: 1 },
      ],
      edges: [
        { id: "e1", from: "src/a.ts", to: "src/b.ts", weight: 1 },
        { id: "e2", from: "src/b.ts", to: "src/c.ts", weight: 0.6 },
      ],
    });
    const cfg = getDefaultReasoningTheaterConfig().retrieval_zone_layer.graph_focus;
    const focused = selectFocusedSubgraph(graphIndex, ["src/b.ts"], "mapped_connected", cfg);
    const projected = projectFocusedSubgraph(focused, createInitialAtlasCameraState());
    const centroid = resolveIndicatorCentroid(projected.nodes, ["src/b.ts"], "mapped_connected");
    expect(centroid.x).toBeGreaterThanOrEqual(0);
    expect(centroid.x).toBeLessThanOrEqual(100);
    expect(centroid.y).toBeGreaterThanOrEqual(0);
    expect(centroid.y).toBeLessThanOrEqual(32);
  });

  it("extracts latest congruence selection from tree walk and graph pack events", () => {
    const selection = extractLatestCongruenceSelection([
      {
        id: "graph-pack",
        meta: {
          graphPackTreeIds: ["ideology", "math"],
          graphPackPrimaryTreeId: "ideology",
          graphPackFrameworks: [
            { treeId: "ideology", nodeIds: ["root", "child_a"] },
            { treeId: "math", nodeIds: ["math_root"] },
          ],
        },
      },
      {
        id: "tree-walk",
        meta: {
          treeWalkPrimaryTreeId: "math",
          treeWalkTrace: [{ treeId: "math", nodeIds: ["math_root", "proof_node"] }],
        },
      },
    ]);
    expect(selection.treeIds).toEqual(["ideology", "math"]);
    expect(selection.primaryTreeId).toBe("math");
    expect(selection.source).toBe("tree_walk");
    expect(selection.trace).toEqual([
      { treeId: "math", nodeIds: ["math_root", "proof_node"] },
    ]);
  });

  it("does not synthesize route traces from graph pack when tree-walk trace is missing", () => {
    const selection = extractLatestCongruenceSelection([
      {
        id: "graph-pack-only",
        meta: {
          graphPackTreeIds: ["ideology", "math"],
          graphPackPrimaryTreeId: "ideology",
          graphPackFrameworks: [{ treeId: "ideology", nodeIds: ["root", "child_a"] }],
        },
      },
    ]);
    expect(selection.treeIds).toEqual(["ideology", "math"]);
    expect(selection.primaryTreeId).toBe("ideology");
    expect(selection.source).toBe("none");
    expect(selection.trace).toEqual([]);
  });

  it("maps strict exact trace node ids to congruence graph nodes and resolves trace edges", () => {
    const index = buildCongruenceGraphIndex({
      version: "v1",
      generated_at: new Date(0).toISOString(),
      seed: 9,
      baseline: {
        owned_total: 10,
        connected_owned: 5,
        owned_not_connected: 5,
        convergence_ratio: 0.5,
      },
      stats: {
        trees_total: 1,
        nodes_total: 3,
        edges_total: 2,
        mapped_connected_nodes: 2,
        owned_frontier_nodes: 1,
        uncharted_nodes: 0,
        degraded: false,
      },
      trees: [{ id: "ideology", label: "Ideology", root_id: "root", node_count: 3 }],
      nodes: [
        {
          id: "ideology::root",
          tree_id: "ideology",
          node_id: "root",
          title: "Root",
          zone: "mapped_connected",
          atlas_linked: true,
          x: 0.3,
          y: 0.2,
          degree: 2,
          depth: 0,
        },
        {
          id: "ideology::child_a",
          tree_id: "ideology",
          node_id: "child_a",
          title: "Child A",
          zone: "mapped_connected",
          atlas_linked: true,
          x: 0.45,
          y: 0.45,
          degree: 2,
          depth: 1,
        },
        {
          id: "ideology::child_b",
          tree_id: "ideology",
          node_id: "child_b",
          title: "Child B",
          zone: "owned_frontier",
          atlas_linked: false,
          x: 0.6,
          y: 0.64,
          degree: 1,
          depth: 2,
        },
      ],
      edges: [
        {
          id: "e1",
          tree_id: "ideology",
          from: "ideology::root",
          to: "ideology::child_a",
          rel: "child",
          edge_type: "child",
          requires_cl: null,
          weight: 1,
        },
        {
          id: "e2",
          tree_id: "ideology",
          from: "ideology::child_a",
          to: "ideology::child_b",
          rel: "child",
          edge_type: "child",
          requires_cl: null,
          weight: 1,
        },
      ],
    });
    const nodeIds = mapTraceNodeIdsToCongruenceNodeIds(index, [
      { treeId: "ideology", nodeIds: ["root", "child_a", "child_b"] },
    ]);
    expect(nodeIds).toEqual(["ideology::root", "ideology::child_a", "ideology::child_b"]);
    const edgeIds = resolveTraceEdgeIds(index, nodeIds);
    expect(Array.from(edgeIds).sort()).toEqual(["e1", "e2"]);
  });
});
