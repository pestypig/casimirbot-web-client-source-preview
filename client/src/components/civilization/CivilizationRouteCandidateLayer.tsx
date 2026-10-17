import React from "react";
import { Line } from "react-simple-maps";
import type {
  CivilizationInfrastructureNodeV1,
  CivilizationRouteCandidateV1,
} from "@shared/civilization-traversability-atlas";
import { CIVILIZATION_MAP_PALETTE } from "./civilizationMapPalette";

function nodeCoordinates(node: CivilizationInfrastructureNodeV1 | undefined): [number, number] | null {
  if (!node?.coordinates) return null;
  return [node.coordinates.lon, node.coordinates.lat];
}

export function CivilizationRouteCandidateLayer({
  routes,
  nodes,
  visible,
}: {
  routes: CivilizationRouteCandidateV1[];
  nodes: CivilizationInfrastructureNodeV1[];
  visible: boolean;
}) {
  if (!visible) return null;
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  return (
    <>
      {routes.flatMap((route) => {
        const coordinates = route.transferNodeIds
          .map((nodeId) => nodeCoordinates(nodeById.get(nodeId)))
          .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
        if (coordinates.length < 2) return [];
        return coordinates.slice(0, -1).map((from, index) => {
          const to = coordinates[index + 1];
          return (
            <Line
              key={`${route.routeId}:${index}`}
              data-testid="civilization-route-candidate"
              aria-label={route.label}
              from={from}
              to={to}
              stroke={
                route.realization === "observed"
                  ? CIVILIZATION_MAP_PALETTE.route.observed
                  : CIVILIZATION_MAP_PALETTE.route.candidate
              }
              strokeWidth={1.05}
              strokeLinecap="round"
              strokeDasharray="6 5"
              strokeOpacity={0.34}
              style={{ pointerEvents: "none" }}
            />
          );
        });
      })}
    </>
  );
}

