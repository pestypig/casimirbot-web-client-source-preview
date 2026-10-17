import React from "react";
import { Line } from "react-simple-maps";
import { CIVILIZATION_MAP_PALETTE } from "./civilizationMapPalette";

export type TectonicPlateBoundary = {
  boundaryId: string;
  label: string;
  coordinates: Array<[number, number]>;
};

export const TECTONIC_PLATE_BOUNDARIES: TectonicPlateBoundary[] = [
  {
    boundaryId: "plate:pacific-ring-east",
    label: "Pacific plate eastern boundary",
    coordinates: [
      [-150, 58],
      [-135, 50],
      [-124, 40],
      [-112, 28],
      [-96, 15],
      [-82, 6],
      [-76, -8],
      [-72, -22],
      [-73, -38],
      [-76, -52],
    ],
  },
  {
    boundaryId: "plate:pacific-ring-west",
    label: "Pacific plate western boundary",
    coordinates: [
      [142, 52],
      [148, 40],
      [140, 34],
      [128, 24],
      [122, 12],
      [128, 0],
      [142, -10],
      [156, -24],
      [170, -40],
      [178, -52],
    ],
  },
  {
    boundaryId: "plate:mid-atlantic-ridge",
    label: "Mid-Atlantic ridge",
    coordinates: [
      [-28, 62],
      [-34, 45],
      [-30, 30],
      [-22, 12],
      [-18, -5],
      [-14, -22],
      [-10, -38],
      [-6, -55],
    ],
  },
  {
    boundaryId: "plate:african-eurasian",
    label: "African-Eurasian plate boundary",
    coordinates: [
      [-10, 36],
      [4, 38],
      [18, 37],
      [30, 36],
      [42, 34],
      [55, 30],
      [70, 29],
      [88, 28],
    ],
  },
  {
    boundaryId: "plate:indian-eurasian",
    label: "Indian-Eurasian collision zone",
    coordinates: [
      [66, 31],
      [76, 33],
      [86, 31],
      [96, 29],
      [104, 28],
    ],
  },
];

export function CivilizationTectonicPlateLayer({
  boundaries = TECTONIC_PLATE_BOUNDARIES,
}: {
  boundaries?: TectonicPlateBoundary[];
}) {
  return (
    <>
      {boundaries.map((boundary) =>
        boundary.coordinates.slice(0, -1).map((from, index) => {
          const to = boundary.coordinates[index + 1];
          return (
            <Line
              key={`${boundary.boundaryId}:${index}`}
              data-testid="civilization-tectonic-plate-boundary"
              aria-label={boundary.label}
              from={from}
              to={to}
              stroke={CIVILIZATION_MAP_PALETTE.physical.tectonicPlate}
              strokeWidth={2.15}
              strokeLinecap="round"
              strokeOpacity={0.78}
              style={{
                pointerEvents: "none",
                filter: "drop-shadow(0 0 3px rgba(250, 204, 21, 0.45))",
              }}
            />
          );
        }),
      )}
    </>
  );
}

