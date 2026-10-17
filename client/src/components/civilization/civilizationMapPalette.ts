import type { CivilizationNationDependencyEdge } from "@/data/civilizationNationStateVectors";

export const CIVILIZATION_MAP_PALETTE = {
  country: {
    fill: "#0d1b17",
    stroke: "#203a31",
    hoverFill: "#143126",
    hoverStroke: "#8ff8c5",
    hoverGlow: "drop-shadow(0 0 7px rgba(52, 211, 153, 0.8))",
  },
  physical: {
    tectonicPlate: "#facc15",
    seismicPulse: "#f97316",
  },
  environmental: {
    weatherFront: "#7dd3fc",
    oceanCurrent: "#2dd4bf",
    climateRisk: "#84cc16",
  },
  civilization: {
    trade: "#22c55e",
    logistics: "#38bdf8",
    security: "#ef4444",
    institutional: "#a78bfa",
  },
  route: {
    candidate: "#f8fafc",
    observed: "#67e8f9",
  },
} as const;

export const CIVILIZATION_DEPENDENCY_EDGE_COLORS: Record<
  CivilizationNationDependencyEdge["kind"],
  string
> = {
  trade_dependency: CIVILIZATION_MAP_PALETTE.civilization.trade,
  logistics_corridor: CIVILIZATION_MAP_PALETTE.civilization.logistics,
  security_exposure: CIVILIZATION_MAP_PALETTE.civilization.security,
  climate_shared_risk: CIVILIZATION_MAP_PALETTE.environmental.climateRisk,
  institutional_alignment: CIVILIZATION_MAP_PALETTE.civilization.institutional,
};

