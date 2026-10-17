// 0 = program start year, 50 = +50 years
export type RoadmapPhaseId = 0 | 1 | 2 | 3 | 4;

export interface RoadmapPhase {
  id: RoadmapPhaseId;
  label: string;
  color: string; // Tailwind-safe hex
  startYear: number; // relative to program start
  endYear: number; // relative to program start
}

export type PartnerRole =
  | "fundamental-physics"
  | "casimir-tiles"
  | "cryogenics"
  | "power-grid"
  | "space-assembly"
  | "flight-test"
  | "governance";

export interface PartnerSite {
  id: string;
  name: string;
  country: string;
  city?: string;
  latitude: number;
  longitude: number;
  role: PartnerRole;
  phaseId: RoadmapPhaseId;
  capex_BUSD: number; // rough CAPEX bucket in billions USD
  opex_BUSD: number; // annual steady-state OPEX, billions
  summary: string; // 1-2 lines, assuming physics works
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 0,
    label: "0-10y - Foundations",
    color: "#38bdf8",
    startYear: 0,
    endYear: 10,
  },
  {
    id: 1,
    label: "10-20y - Proto-hulls",
    color: "#a855f7",
    startYear: 10,
    endYear: 20,
  },
  {
    id: 2,
    label: "20-30y - Orbital demos",
    color: "#22c55e",
    startYear: 20,
    endYear: 30,
  },
  {
    id: 3,
    label: "30-40y - Needle fleet build-out",
    color: "#eab308",
    startYear: 30,
    endYear: 40,
  },
  {
    id: 4,
    label: "40-50y - Routine warp ops",
    color: "#f97316",
    startYear: 40,
    endYear: 50,
  },
];

// NOTE: Numbers and locations here are illustrative.
// Replace with real partners and cost estimates later.
export const PARTNER_SITES: PartnerSite[] = [
  {
    id: "foundations-eu",
    name: "Quantum Vacuum & QI Lab Network",
    country: "Germany / France / Italy",
    city: "CERN / Max Planck cluster",
    latitude: 48.85,
    longitude: 2.35,
    role: "fundamental-physics",
    phaseId: 0,
    capex_BUSD: 25,
    opex_BUSD: 1.5,
    summary:
      "Push tight Casimir / QI bounds, validate Ford-Roman duty models, and pin down tile material stacks.",
  },
  {
    id: "tiles-east-asia",
    name: "Casimir Tile Mega-Fab",
    country: "Japan / South Korea",
    city: "Kyoto-Busan corridor",
    latitude: 35.68,
    longitude: 139.76,
    role: "casimir-tiles",
    phaseId: 1,
    capex_BUSD: 80,
    opex_BUSD: 4,
    summary:
      "Mass-produce nm-gap tile arrays with Phoenix-ready timing, feeding global hull programs.",
  },
  {
    id: "cryogenics-na",
    name: "Cryo & Power Test Yard",
    country: "United States",
    city: "Colorado Front Range",
    latitude: 39.74,
    longitude: -104.99,
    role: "cryogenics",
    phaseId: 1,
    capex_BUSD: 40,
    opex_BUSD: 2,
    summary:
      "Integrate HV bus, pulsed current limits, and Phoenix guardrails into ship-scale test rigs.",
  },
  {
    id: "space-assembly",
    name: "Orbital Needle Hull Assembly",
    country: "Global",
    city: "Equatorial LEO Yard",
    latitude: 0.0,
    longitude: -30.0,
    role: "space-assembly",
    phaseId: 2,
    capex_BUSD: 150,
    opex_BUSD: 6,
    summary:
      "Assemble full needle hulls in microgravity; verify Natario bubble geometry and TS_ratio in situ.",
  },
  {
    id: "flight-test",
    name: "Warp Flight Test Range",
    country: "Australia",
    city: "Woomera region",
    latitude: -30.0,
    longitude: 135.0,
    role: "flight-test",
    phaseId: 3,
    capex_BUSD: 70,
    opex_BUSD: 3,
    summary:
      "Ship-frame Phoenix diagnostics + Hull3D telemetry on subluminal and nearzero warp hops.",
  },
  {
    id: "governance-global",
    name: "Warp Governance & Safety Hub",
    country: "Global",
    city: "Hybrid virtual / Geneva",
    latitude: 46.2,
    longitude: 6.15,
    role: "governance",
    phaseId: 4,
    capex_BUSD: 10,
    opex_BUSD: 1,
    summary:
      "Quantum-interest compliance, TS autoscale policy, and intergovernmental safety standards.",
  },
];
