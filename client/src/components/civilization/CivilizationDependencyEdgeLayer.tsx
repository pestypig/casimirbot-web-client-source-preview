import React from "react";
import { Line } from "react-simple-maps";
import {
  CIVILIZATION_NATION_STATE_VECTORS,
  type CivilizationNationDependencyEdge,
} from "@/data/civilizationNationStateVectors";
import { CIVILIZATION_DEPENDENCY_EDGE_COLORS } from "./civilizationMapPalette";

export type CivilizationDependencyEdgeTone = "direct" | "comparison" | "hidden";

export function selectedEdgeTone(
  edge: CivilizationNationDependencyEdge,
  selectedIso3s: string[],
): CivilizationDependencyEdgeTone {
  const fromSelected = selectedIso3s.includes(edge.fromIso3);
  const toSelected = selectedIso3s.includes(edge.toIso3);
  if (fromSelected && toSelected) return "comparison";
  if (fromSelected || toSelected) return "direct";
  return "hidden";
}

function edgeEndpoint(edge: CivilizationNationDependencyEdge, iso3: string) {
  return CIVILIZATION_NATION_STATE_VECTORS.find((vector) => vector.countryIso3 === iso3);
}

export function CivilizationDependencyEdgeLayer({
  edges,
  selectedIso3s,
}: {
  edges: CivilizationNationDependencyEdge[];
  selectedIso3s: string[];
}) {
  return (
    <>
      {edges.map((edge) => {
        const from = edgeEndpoint(edge, edge.fromIso3);
        const to = edgeEndpoint(edge, edge.toIso3);
        if (!from || !to) return null;
        const tone = selectedEdgeTone(edge, selectedIso3s);
        return (
          <Line
            key={edge.edgeId}
            data-testid="civilization-bounds-edge"
            from={[from.coordinates.lon, from.coordinates.lat]}
            to={[to.coordinates.lon, to.coordinates.lat]}
            stroke={CIVILIZATION_DEPENDENCY_EDGE_COLORS[edge.kind]}
            strokeWidth={tone === "comparison" ? 2.8 : 1.4}
            strokeLinecap="round"
            strokeOpacity={tone === "comparison" ? 0.9 : 0.42}
          />
        );
      })}
    </>
  );
}

