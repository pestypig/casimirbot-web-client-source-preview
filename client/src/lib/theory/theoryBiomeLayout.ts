import type {
  TheoryBiomeCoordinateV1,
  TheoryBiomeLayoutV1,
} from "@shared/contracts/theory-biome-layout.v1";
import type {
  TheoryBadgeEdgeV1,
  TheoryBadgeGraphV1,
} from "@shared/contracts/theory-badge-graph.v1";
import {
  buildTheoryBiomeLayoutV1,
  computeTheoryBiomeDepths,
  theoryBiomeBandIndex,
  theoryBiomeDomainIndex,
} from "@shared/theory/theory-biome-layout";
import type {
  TheoryAchievementLayout,
  TheoryAchievementLayoutEdge,
  TheoryAchievementLayoutNode,
} from "./theoryAchievementLayout";

export type TheoryBiomeAchievementLayout = TheoryAchievementLayout & {
  biome: TheoryBiomeLayoutV1;
};

function edgePoints(
  from: TheoryAchievementLayoutNode,
  to: TheoryAchievementLayoutNode,
  relation: string,
): Array<{ x: number; y: number }> {
  const badgeHalf = 22;
  const start = { x: from.x + badgeHalf, y: from.y + badgeHalf };
  const end = { x: to.x + badgeHalf, y: to.y + badgeHalf };
  const dx = end.x - start.x;
  const crossScale = Math.abs((from.scaleLog10M ?? 0) - (to.scaleLog10M ?? 0)) > 8;
  const bend = crossScale ? Math.max(84, Math.min(260, Math.abs(dx) * 0.22)) : 0;
  const midX = start.x + Math.max(44, dx / 2);
  const midY = (start.y + end.y) / 2 - bend;
  if (relation === "blocks") {
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  return [start, { x: midX, y: midY }, end];
}

export function layoutTheoryBiomeMap(graph: TheoryBadgeGraphV1): TheoryBiomeAchievementLayout {
  const biome = buildTheoryBiomeLayoutV1(graph);
  const depths = computeTheoryBiomeDepths(graph);
  const coordinateByBadgeId = new Map<string, TheoryBiomeCoordinateV1>(
    biome.coordinates.map((coordinate: TheoryBiomeCoordinateV1) => [coordinate.badgeId, coordinate]),
  );

  const nodes: TheoryAchievementLayoutNode[] = biome.coordinates.map((coordinate: TheoryBiomeCoordinateV1) => ({
    badgeId: coordinate.badgeId,
    x: coordinate.x,
    y: coordinate.y,
    depth: depths.get(coordinate.badgeId) ?? 0,
    lane: theoryBiomeDomainIndex(coordinate.domainKey),
    scaleBand: coordinate.scaleBand,
    scaleLog10M: coordinate.scaleLog10M,
    domainKey: coordinate.domainKey,
    chunkX: coordinate.chunkX,
    chunkY: coordinate.chunkY,
    renderChunkId: coordinate.renderChunkId,
    semanticChunkId: coordinate.semanticChunkId,
    claimPressure: coordinate.claimPressure,
  }));

  const nodesById = new Map(nodes.map((node: TheoryAchievementLayoutNode) => [node.badgeId, node]));
  const edges = graph.edges
    .map((edge: TheoryBadgeEdgeV1): TheoryAchievementLayoutEdge | null => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) return null;
      const fromCoord = coordinateByBadgeId.get(edge.from);
      const toCoord = coordinateByBadgeId.get(edge.to);
      const scaleDelta =
        fromCoord?.scaleLog10M != null && toCoord?.scaleLog10M != null
          ? Math.abs(fromCoord.scaleLog10M - toCoord.scaleLog10M)
          : Math.abs(
              theoryBiomeBandIndex(from.scaleBand ?? "abstract_formal") -
                theoryBiomeBandIndex(to.scaleBand ?? "abstract_formal"),
            );
      return {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        points: edgePoints(from, to, edge.relation),
        scaleDistanceKind:
          from.scaleBand === to.scaleBand ? "same_biome" : scaleDelta > 8 ? "cross_scale" : "neighbor_biome",
      };
    })
    .filter((edge: TheoryAchievementLayoutEdge | null): edge is TheoryAchievementLayoutEdge => Boolean(edge));

  return {
    width: biome.width,
    height: biome.height,
    nodes,
    edges,
    biome,
  };
}
