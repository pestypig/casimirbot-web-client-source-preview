import React from "react";
import { Line } from "react-simple-maps";
import { CIVILIZATION_MAP_PALETTE } from "./civilizationMapPalette";

type EnvironmentalFlow = {
  flowId: string;
  label: string;
  kind: "weather_front" | "ocean_current";
  coordinates: Array<[number, number]>;
};

export const CIVILIZATION_ENVIRONMENTAL_FLOWS: EnvironmentalFlow[] = [
  {
    flowId: "flow:weather:north-atlantic-front",
    label: "North Atlantic weather front",
    kind: "weather_front",
    coordinates: [
      [-72, 42],
      [-56, 46],
      [-38, 48],
      [-20, 50],
      [-4, 54],
    ],
  },
  {
    flowId: "flow:current:gulf-stream",
    label: "Gulf Stream current corridor",
    kind: "ocean_current",
    coordinates: [
      [-82, 26],
      [-72, 33],
      [-58, 39],
      [-42, 43],
      [-28, 46],
    ],
  },
  {
    flowId: "flow:weather:indo-pacific-monsoon",
    label: "Indo-Pacific seasonal weather corridor",
    kind: "weather_front",
    coordinates: [
      [64, 8],
      [78, 14],
      [94, 18],
      [112, 14],
      [128, 8],
    ],
  },
];

function flowColor(kind: EnvironmentalFlow["kind"]): string {
  return kind === "weather_front"
    ? CIVILIZATION_MAP_PALETTE.environmental.weatherFront
    : CIVILIZATION_MAP_PALETTE.environmental.oceanCurrent;
}

export function CivilizationEnvironmentalFlowLayer({
  flows = CIVILIZATION_ENVIRONMENTAL_FLOWS,
}: {
  flows?: EnvironmentalFlow[];
}) {
  return (
    <>
      {flows.map((flow) =>
        flow.coordinates.slice(0, -1).map((from, index) => {
          const to = flow.coordinates[index + 1];
          return (
            <Line
              key={`${flow.flowId}:${index}`}
              data-testid="civilization-environmental-flow"
              aria-label={flow.label}
              from={from}
              to={to}
              stroke={flowColor(flow.kind)}
              strokeWidth={1.15}
              strokeLinecap="round"
              strokeDasharray={flow.kind === "weather_front" ? "5 4" : "1 4"}
              strokeOpacity={0.42}
              style={{ pointerEvents: "none" }}
            />
          );
        }),
      )}
    </>
  );
}
