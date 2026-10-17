import {
  MORE_COUNTRY_PROGRAM_ROLES,
  NEEDLE_WORLD_ROLES_PROMOTED,
} from "./needleWorldRoles.extra";

// ---- Core types ------------------------------------------------------------

export type PhaseId = "P0" | "P1" | "P2" | "P3" | "P4";

export type PhaseSlice = {
  phaseId: PhaseId;
  /** Years from program start (t=0) */
  startYear: number;
  endYear: number;
  /**
   * Human-readable role description for this country *in this phase*.
   * Keep this short; longer copy can live in a side panel.
   */
  roleSummary: string;
  /**
   * Optional relative cost/effort share for this phase (0..1),
   * used to size map markers. Not normalized globally; think of it
   * as a weight: lead > major > support.
   */
  costShareEstimate?: number;
};

export type CountryProgramRole = {
  iso2: string;
  name: string;
  lat: number;
  lon: number;
  /** Capability tags from the shared taxonomy */
  capabilities: string[];
  /** One slice per phase where this country participates */
  phases: PhaseSlice[];
};

// ---- Global phase envelope (0-50y) ----------------------------------------

export const PHASE_DEFS: Record<
  PhaseId,
  { startYear: number; endYear: number; summary: string }
> = {
  P0: {
    startYear: 0,
    endYear: 5,
    summary:
      "Lock static Casimir energy at scale; nm-gap mechanics; early dynamic Casimir pilots; Phoenix TS/tau_LC benches.",
  },
  P1: {
    startYear: 5,
    endYear: 10,
    summary:
      "Casimir supercells (10^3-10^6 tiles); validate amp/gamma ladders; dynamic Casimir Q~1e8-1e9; QI telemetry at scale.",
  },
  P2: {
    startYear: 10,
    endYear: 20,
    summary:
      "m^2 hull patches with sector scheduling; Phoenix averaging vs stress-energy proxies; TS_ratio >> 1 in hardware.",
  },
  P3: {
    startYear: 20,
    endYear: 35,
    summary:
      "Full ellipsoidal hull on ground at reduced gamma_VdB/duty; close T00/curvature to GR targets; high-beta uncrewed tests.",
  },
  P4: {
    startYear: 35,
    endYear: 50,
    summary:
      "Orbital integration; repeatable, QI-compliant warp ops at design power; uncrewed then cautious crewed flights.",
  },
};

// Convenience buckets for “lead / major / support”
const COST_LEAD = 0.6;
const COST_MAJOR = 0.35;
const COST_SUPPORT = 0.12;

// Shared short-hands for capability tags
const UNIVERSE = [
  "education",
  "sensor_network",
  "ethics_governance",
  "citimoral_science",
] as const;

type CostBucket = typeof COST_LEAD | typeof COST_MAJOR | typeof COST_SUPPORT;

function phaseSlice(
  phaseId: PhaseId,
  roleSummary: string,
  costShareEstimate: CostBucket,
): PhaseSlice {
  const p = PHASE_DEFS[phaseId];
  return {
    phaseId,
    startYear: p.startYear,
    endYear: p.endYear,
    roleSummary,
    costShareEstimate,
  };
}

// === NORTH AMERICA ===========================================================
export const US_ROLE: CountryProgramRole = {
  iso2: "US",
  name: "United States",
  lat: 39.0,
  lon: -98.0,
  capabilities: [
    "casimir_tile_fab",
    "rf_q_devices",
    "metrology_foundry",
    "hpc",
    "gr_theory",
    "space_launch",
    "orbital_ops",
    "test_range",
    "power_grid",
    "hvdc",
    "cryoplant",
    "civil_megaprojects",
    ...UNIVERSE,
  ],
  phases: [
    phaseSlice(
      "P0",
      "Anchor nm-gap metrology, dynamic Casimir theory, and Phoenix-style TS/tau_LC benches.",
      COST_LEAD,
    ),
    phaseSlice(
      "P1",
      "Lead supercell fabrication and high-Q RF devices; scale QI-safe telemetry and control stacks.",
      COST_LEAD,
    ),
    phaseSlice(
      "P2",
      "Host early m^2 hull-patch ground ranges and sector schedulers; integrate Phoenix averaging with live stress proxies.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P3",
      "Build one of the heavy ground hull caverns, pulsed-power and cryo complexes for full ellipsoidal tests.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P4",
      "Share orbital integration, launch services, and global monitoring/ethics governance for operational warp trials.",
      COST_MAJOR,
    ),
  ],
};

// === EUROPE ==================================================================
export const DE_ROLE: CountryProgramRole = {
  iso2: "DE",
  name: "Germany",
  lat: 51.0,
  lon: 10.0,
  capabilities: [
    "casimir_tile_fab",
    "metrology_foundry",
    "rf_q_devices",
    "hpc",
    "gr_theory",
    "power_grid",
    "hvdc",
    "civil_megaprojects",
    ...UNIVERSE,
  ],
  phases: [
    phaseSlice(
      "P0",
      "Lead precision static Casimir metrology, nm-scale mechanics envelopes, and theory benchmarking.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P1",
      "Co-lead supercell verification, materials characterization, and cryogenic Q-factor campaigns.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P2",
      "Provide hull patch manufacturing and EU testbeds for sector scheduling and Phoenix vs GR-proxy validation.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Host one of the European heavy-cryoplant nodes; grid integration and safety/standards leadership.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Contribute governance, certification, and precision timing/observatory support for orbital operations.",
      COST_SUPPORT,
    ),
  ],
};

// === ASIA ====================================================================
export const CN_ROLE: CountryProgramRole = {
  iso2: "CN",
  name: "China",
  lat: 35.9,
  lon: 104.2,
  capabilities: [
    "casimir_tile_fab",
    "rf_q_devices",
    "metrology_foundry",
    "rare_earths",
    "tungsten",
    "materials_recycling",
    "space_launch",
    "test_range",
    "power_grid",
    "hvdc",
    "civil_megaprojects",
    ...UNIVERSE,
  ],
  phases: [
    phaseSlice(
      "P0",
      "Spin up tile fabs, materials supply, and static Casimir characterization at industrial scale.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P1",
      "Mass-produce supercells and high-Q structures; contribute large-scale dynamic Casimir pilot rigs.",
      COST_LEAD,
    ),
    phaseSlice(
      "P2",
      "Host extensive ground test ranges for hull patches, sector strobing, and Phoenix/QI guardrail tuning.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P3",
      "Build one of the global full-scale Needle Hull sites with integrated pulsed-power and HVDC links.",
      COST_MAJOR,
    ),
    phaseSlice(
      "P4",
      "Provide launch capacity, orbital logistics, and data infra for uncrewed and then crewed warp trials.",
      COST_MAJOR,
    ),
  ],
};

export const IN_ROLE: CountryProgramRole = {
  iso2: "IN",
  name: "India",
  lat: 22.0,
  lon: 79.0,
  capabilities: [
    "space_launch",
    "test_range",
    "hpc",
    "open_source_dev",
    "education",
    "sensor_network",
    "citimoral_science",
    "power_grid",
  ],
  phases: [
    phaseSlice(
      "P0",
      "Host simulation and open-source tooling hubs; grow GR and QI theory groups and education pipelines.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P1",
      "Contribute test ranges and cost-efficient RF/mechanics pilots for supercell arrays.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P2",
      "Operate Phoenix telemetry clusters and regional ground hull patches; dense sensor networks for monitoring.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Support large civil works, power integration, and regional QI/ethics oversight for high-beta ground tests.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Contribute launch windows, tracking, and global education/outreach for operational warp infrastructure.",
      COST_SUPPORT,
    ),
  ],
};

// === SOUTH AMERICA ===========================================================
export const BR_ROLE: CountryProgramRole = {
  iso2: "BR",
  name: "Brazil",
  lat: -15.8,
  lon: -47.9,
  capabilities: [
    "space_launch",
    "test_range",
    "rare_earths",
    "materials_recycling",
    "power_grid",
    "civil_megaprojects",
    ...UNIVERSE,
  ],
  phases: [
    phaseSlice(
      "P0",
      "Map regional materials supply (critical minerals) and stand up measurement labs linked into global QI networks.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P1",
      "Host dynamic Casimir pilot rigs with access to equatorial launch and coastal power infrastructure.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P2",
      "Run hull patch ground ranges, plus environmental and biosphere monitoring around high-field zones.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Provide one ground integration site with strong grid coupling and civil-engineering capacity.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Equatorial launch/landing segments and participation in long-baseline observatory / governance networks.",
      COST_SUPPORT,
    ),
  ],
};

// === AFRICA ==================================================================
export const ZA_ROLE: CountryProgramRole = {
  iso2: "ZA",
  name: "South Africa",
  lat: -30.0,
  lon: 25.0,
  capabilities: [
    "rare_earths",
    "materials_recycling",
    "observatory",
    "test_range",
    "sensor_network",
    "education",
    "citimoral_science",
  ],
  phases: [
    phaseSlice(
      "P0",
      "Tie radio/optical observatories into early monitoring networks; begin materials census for critical inputs.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P1",
      "Pilot small-scale Casimir mechanics rigs and integrate regional QI/curvature monitoring around test sites.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P2",
      "Operate southern-hemisphere stress-energy sensor grids and materials recycling channels for tile stacks.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Contribute wide-area safety monitoring for ground hulls and Phoenix averaging cross-checks against observatories.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Maintain long-baseline observatories and governance seats, ensuring southern-sky coverage during trials.",
      COST_SUPPORT,
    ),
  ],
};

// === OCEANIA =================================================================
export const AU_ROLE: CountryProgramRole = {
  iso2: "AU",
  name: "Australia",
  lat: -25.3,
  lon: 133.8,
  capabilities: [
    "test_range",
    "space_launch",
    "observatory",
    "rare_earths",
    "materials_recycling",
    "sensor_network",
    "civil_megaprojects",
    ...UNIVERSE,
  ],
  phases: [
    phaseSlice(
      "P0",
      "Prepare remote test ranges and observatory tie-ins; start geotech surveys for desert hull caverns.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P1",
      "Run early high-intensity RF and sector-scheduler prototypes in remote ranges with strong environmental monitoring.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P2",
      "Operate one Phoenix test hull patch and associated QI-compliance sensor networks in sparsely populated regions.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Potential host for a full-scale Needle Hull ground site exploiting large, geologically stable deserts.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Provide southern-hemisphere launch windows, tracking, and governance representation.",
      COST_SUPPORT,
    ),
  ],
};

// === ANTARCTICA (RESEARCH CONSORTIUM “COUNTRY”) ==============================
export const AQ_ROLE: CountryProgramRole = {
  iso2: "AQ",
  name: "Antarctic Research Stations",
  lat: -80.0,
  lon: 0.0,
  capabilities: [
    "observatory",
    "sensor_network",
    "ethics_governance",
    "citimoral_science",
  ],
  phases: [
    phaseSlice(
      "P0",
      "Coordinate multinational Antarctic science advisory group; define low-background monitoring protocols.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P1",
      "Deploy prototype curvature/stress-energy sensors in ultra-quiet environments for baseline data.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P2",
      "Serve as off-axis reference for Phoenix averages and QI guardrails during increasing power tests elsewhere.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P3",
      "Maintain long-term monitoring for subtle global metric shifts correlated with high-power ground runs.",
      COST_SUPPORT,
    ),
    phaseSlice(
      "P4",
      "Act as permanent neutral site for deep-time observatories and cross-checks during orbital warp operations.",
      COST_SUPPORT,
    ),
  ],
};

// Export a simple array the map can ingest
export const SEED_COUNTRY_ROLES: CountryProgramRole[] = [
  US_ROLE,
  DE_ROLE,
  CN_ROLE,
  IN_ROLE,
  BR_ROLE,
  ZA_ROLE,
  AU_ROLE,
  AQ_ROLE,
];

// Extended data set used by the map (seed + optional extras)
export const COUNTRY_PROGRAM_ROLES: CountryProgramRole[] = [
  ...SEED_COUNTRY_ROLES,
  ...MORE_COUNTRY_PROGRAM_ROLES,
  ...NEEDLE_WORLD_ROLES_PROMOTED,
];

// ---- Helpers to derive map markers ----------------------------------------

export type CountryMarker = {
  iso2: string;
  name: string;
  lat: number;
  lon: number;
  capabilities: string[];
  roleSummary: string;
  costWeight: number;
};

export function markersForPhase(phase: PhaseId): CountryMarker[] {
  return COUNTRY_PROGRAM_ROLES.map((c) => {
    const slice = c.phases.find((p) => p.phaseId === phase);
    if (!slice) return null;
    return {
      iso2: c.iso2,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      capabilities: c.capabilities,
      roleSummary: slice.roleSummary,
      costWeight: slice.costShareEstimate ?? 0,
    };
  }).filter((m): m is CountryMarker => m !== null);
}
