import type {
  CountryProgramRole,
  PhaseId,
  PhaseSlice,
} from "./needleWorldRoles";

// Helpers so we do not mistype phase spans.
const PHASE_SPANS: Record<PhaseId, { startYear: number; endYear: number }> = {
  P0: { startYear: 0, endYear: 5 },
  P1: { startYear: 5, endYear: 10 },
  P2: { startYear: 10, endYear: 20 },
  P3: { startYear: 20, endYear: 35 },
  P4: { startYear: 35, endYear: 50 },
};

const phase = (
  phaseId: PhaseId,
  roleSummary: string,
  costShareEstimate?: number,
): PhaseSlice => {
  const span = PHASE_SPANS[phaseId];
  return { phaseId, ...span, roleSummary, costShareEstimate };
};

/**
 * Additional regions/countries for global coverage.
 * At least one country per continent; costs are relative weights (0..1),
 * not hard dollar budgets.
 */
export const MORE_COUNTRY_PROGRAM_ROLES: CountryProgramRole[] = [
  // --- North America (beyond US) -------------------------------------------
  {
    iso2: "CA",
    name: "Canada",
    lat: 45.4215,
    lon: -75.6972,
    capabilities: [
      "casimir_tile_fab",
      "rf_q_devices",
      "metrology_foundry",
      "hpc",
      "observatory",
      "power_grid",
      "hvdc",
      "education",
      "sensor_network",
      "ethics_governance",
    ],
    phases: [
      phase(
        "P0",
        "Metrology-grade Casimir benches, cryo pilot lines, and simulation clusters tied into Phoenix-style TS/tau_LC benches.",
        0.04,
      ),
      phase(
        "P1",
        "Supercell assembly for dynamic Casimir stacks; Q~1e8-1e9 devices and RF testbeds.",
        0.04,
      ),
      phase(
        "P2",
        "m^2 hull patches and long-baseline observatories for stress-energy proxy validation.",
        0.03,
      ),
    ],
  },
  {
    iso2: "MX",
    name: "Mexico",
    lat: 19.4326,
    lon: -99.1332,
    capabilities: [
      "materials_recycling",
      "civil_megaprojects",
      "power_grid",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P1",
        "Precision manufacturing for tile frames and mechanical stacks; regional supply-chain integration.",
        0.02,
      ),
      phase(
        "P2",
        "Bulk hull-plate fabrication and logistics hubs for P2 test ranges.",
        0.02,
      ),
      phase(
        "P3",
        "Assembly/support for ground test caverns and pulsed-power auxiliaries.",
        0.015,
      ),
    ],
  },

  // --- South America -------------------------------------------------------
  {
    iso2: "AR",
    name: "Argentina",
    lat: -34.6037,
    lon: -58.3816,
    capabilities: [
      "rare_earths",
      "observatory",
      "open_source_dev",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P0",
        "GR-theory and observatory tie-ins; open data pipelines for Casimir and warp diagnostics.",
        0.015,
      ),
      phase(
        "P1",
        "Critical-mineral feedstock (e.g., lithium) aligned with tile and cavity supply chains.",
        0.02,
      ),
      phase(
        "P2",
        "Southern-hemisphere monitoring stations for Phoenix/warp telemetry.",
        0.015,
      ),
    ],
  },
  {
    iso2: "CL",
    name: "Chile",
    lat: -33.4489,
    lon: -70.6693,
    capabilities: [
      "rare_earths",
      "observatory",
      "test_range",
      "sensor_network",
      "education",
    ],
    phases: [
      phase(
        "P1",
        "Deep-sky observatories used as background curvature monitors and calibration lines.",
        0.015,
      ),
      phase(
        "P2",
        "High-altitude test ranges for hull-patch experiments and QI-telemetry antennas.",
        0.02,
      ),
    ],
  },

  // --- Africa --------------------------------------------------------------
  {
    iso2: "NG",
    name: "Nigeria",
    lat: 9.0765,
    lon: 7.3986,
    capabilities: [
      "materials_recycling",
      "power_grid",
      "civil_megaprojects",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P1",
        "Materials recycling and fabrication chains for tile carriers and support structures.",
        0.02,
      ),
      phase(
        "P2",
        "Grid-modernization pilots co-designed with FR/QI guardrail constraints.",
        0.02,
      ),
      phase(
        "P3",
        "Regional sensor networks for global warp/curvature monitoring.",
        0.015,
      ),
    ],
  },
  {
    iso2: "KE",
    name: "Kenya",
    lat: -1.2864,
    lon: 36.8172,
    capabilities: [
      "observatory",
      "test_range",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P1",
        "East-African test ranges for dynamic Casimir pilot hardware and ground-station links.",
        0.015,
      ),
      phase(
        "P2",
        "Regional QI/FR sensor networks and open citizen-science programs.",
        0.015,
      ),
    ],
  },
  {
    iso2: "EG",
    name: "Egypt",
    lat: 30.0444,
    lon: 31.2357,
    capabilities: [
      "test_range",
      "civil_megaprojects",
      "power_grid",
      "education",
      "sensor_network",
    ],
    phases: [
      phase(
        "P2",
        "Large-scale civil builds and arid-region test ranges for P2/P3 hull experiments.",
        0.02,
      ),
      phase(
        "P3",
        "Support caverns, cryoplants, and regional HVDC/pulsed-power links.",
        0.02,
      ),
    ],
  },

  // --- Middle East ---------------------------------------------------------
  {
    iso2: "SA",
    name: "Saudi Arabia",
    lat: 24.7136,
    lon: 46.6753,
    capabilities: [
      "power_grid",
      "hvdc",
      "cryoplant",
      "civil_megaprojects",
      "test_range",
    ],
    phases: [
      phase(
        "P2",
        "High-capacity cryoplants and industrial power for large tile banks and dynamic Casimir stacks.",
        0.03,
      ),
      phase(
        "P3",
        "Support for ground hull caverns and pulsed-power plants in remote test regions.",
        0.03,
      ),
    ],
  },
  {
    iso2: "AE",
    name: "United Arab Emirates",
    lat: 24.4539,
    lon: 54.3773,
    capabilities: [
      "space_launch",
      "orbital_ops",
      "test_range",
      "hpc",
      "open_source_dev",
      "education",
    ],
    phases: [
      phase(
        "P1",
        "Regional HPC and software hubs for Phoenix-averaging, TS_ratio estimation, and warp-control sims.",
        0.02,
      ),
      phase(
        "P3",
        "Ground-to-orbit interfaces for Needle Hull qualification flights.",
        0.02,
      ),
      phase(
        "P4",
        "Orbital operations and data hubs for routine warp-drive telemetry.",
        0.02,
      ),
    ],
  },
  {
    iso2: "TR",
    name: "Turkiye",
    lat: 39.9334,
    lon: 32.8597,
    capabilities: [
      "materials_recycling",
      "power_grid",
      "hvdc",
      "civil_megaprojects",
      "test_range",
      "education",
    ],
    phases: [
      phase(
        "P1",
        "Manufacturing for steel/composite hull frames and cryogenic infrastructure.",
        0.02,
      ),
      phase(
        "P2",
        "Test ranges straddling Europe-Asia corridors for P2 hull patches and FR/QI probes.",
        0.02,
      ),
    ],
  },

  // --- Asia (additional) ---------------------------------------------------
  {
    iso2: "ID",
    name: "Indonesia",
    lat: -6.2088,
    lon: 106.8456,
    capabilities: [
      "rare_earths",
      "materials_recycling",
      "test_range",
      "power_grid",
      "education",
      "sensor_network",
    ],
    phases: [
      phase(
        "P1",
        "Critical-mineral feedstock and manufacturing for tile carriers and Casimir stack supports.",
        0.02,
      ),
      phase(
        "P2",
        "Archipelago test ranges and sensor nets for warp-environment monitoring.",
        0.02,
      ),
    ],
  },
  {
    iso2: "SG",
    name: "Singapore",
    lat: 1.3521,
    lon: 103.8198,
    capabilities: [
      "casimir_tile_fab",
      "rf_q_devices",
      "metrology_foundry",
      "hpc",
      "open_source_dev",
      "ethics_governance",
      "education",
    ],
    phases: [
      phase(
        "P0",
        "Nano-fab and RF foundry lines for Casimir tiles and high-Q cavities.",
        0.03,
      ),
      phase(
        "P1",
        "Supercell integration and early QI-compliant telemetry stacks.",
        0.03,
      ),
      phase(
        "P2",
        "Regional governance, standards, and open-source control stacks.",
        0.02,
      ),
    ],
  },
  {
    iso2: "KR",
    name: "South Korea",
    lat: 37.5665,
    lon: 126.978,
    capabilities: [
      "casimir_tile_fab",
      "rf_q_devices",
      "metrology_foundry",
      "hpc",
      "space_launch",
      "power_grid",
      "education",
    ],
    phases: [
      phase(
        "P0",
        "Advanced semiconductor fabs for tile/cavity stacks and nm-gap mechanics pilot lines.",
        0.05,
      ),
      phase(
        "P1",
        "High-Q dynamic Casimir devices and supercell integration at large scale.",
        0.05,
      ),
      phase(
        "P2",
        "m^2 hull patches with aggressive TS_ratio and gammaGeo testing.",
        0.04,
      ),
    ],
  },
  {
    iso2: "VN",
    name: "Vietnam",
    lat: 21.0278,
    lon: 105.8342,
    capabilities: [
      "materials_recycling",
      "power_grid",
      "civil_megaprojects",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P1",
        "Manufacturing for support structures and electronics; workforce development for nano-mech ops.",
        0.02,
      ),
      phase(
        "P2",
        "Regional sensor networks and citizen-science curvature monitors.",
        0.02,
      ),
    ],
  },

  // --- Europe (finer-grained) ---------------------------------------------
  {
    iso2: "SE",
    name: "Sweden",
    lat: 59.3293,
    lon: 18.0686,
    capabilities: [
      "hvdc",
      "power_grid",
      "observatory",
      "open_source_dev",
      "ethics_governance",
      "sensor_network",
    ],
    phases: [
      phase(
        "P1",
        "HVDC/grid technology development tuned to FR/QI constraints and P_avg targets.",
        0.03,
      ),
      phase(
        "P2",
        "Observatory and sensor networks used as independent warp/curvature monitors.",
        0.025,
      ),
      phase(
        "P3",
        "Governance frameworks, safety standards, and cross-border data norms.",
        0.02,
      ),
    ],
  },
  {
    iso2: "PL",
    name: "Poland",
    lat: 52.2297,
    lon: 21.0122,
    capabilities: [
      "materials_recycling",
      "civil_megaprojects",
      "test_range",
      "power_grid",
      "education",
    ],
    phases: [
      phase(
        "P1",
        "Manufacturing and materials recycling hubs feeding EU tile and hull programs.",
        0.02,
      ),
      phase(
        "P2",
        "Ground test ranges and industrial sites for P2 hull-patch validation.",
        0.02,
      ),
    ],
  },

  // --- Oceania (beyond AU if you add it elsewhere) ------------------------
  {
    iso2: "NZ",
    name: "New Zealand",
    lat: -41.2865,
    lon: 174.7762,
    capabilities: [
      "space_launch",
      "test_range",
      "observatory",
      "education",
      "sensor_network",
      "citimoral_science",
    ],
    phases: [
      phase(
        "P2",
        "Southern-hemisphere launch/test ranges and optical/radio observatories.",
        0.02,
      ),
      phase(
        "P3",
        "Uncrewed high-beta hull test flights and tracking infrastructure.",
        0.02,
      ),
    ],
  },
];

// -----------------------------------------------------------------------------
// Promoted partner regions (all suggested countries/regions)
// -----------------------------------------------------------------------------

type CountrySeed = { iso2: string; name: string; lat: number; lon: number };

const CAP_TECH_HUB: string[] = [
  "casimir_tile_fab",
  "rf_q_devices",
  "metrology_foundry",
  "hpc",
  "observatory",
  "open_source_dev",
  "education",
  "sensor_network",
  "ethics_governance",
];

const CAP_SPACE_RANGE: string[] = [
  "space_launch",
  "orbital_ops",
  "test_range",
  "power_grid",
  "hvdc",
  "civil_megaprojects",
  "education",
  "sensor_network",
];

const CAP_MATERIALS_GRID: string[] = [
  "rare_earths",
  "materials_recycling",
  "power_grid",
  "hvdc",
  "civil_megaprojects",
  "education",
  "sensor_network",
];

const CAP_EDU_GOV: string[] = [
  "education",
  "sensor_network",
  "ethics_governance",
  "citimoral_science",
];

const P0_START = PHASE_SPANS.P0.startYear;
const P0_END = PHASE_SPANS.P0.endYear;
const P1_START = PHASE_SPANS.P1.startYear;
const P1_END = PHASE_SPANS.P1.endYear;
const P2_START = PHASE_SPANS.P2.startYear;
const P2_END = PHASE_SPANS.P2.endYear;
const P3_START = PHASE_SPANS.P3.startYear;
const P3_END = PHASE_SPANS.P3.endYear;
const P4_START = PHASE_SPANS.P4.startYear;
const P4_END = PHASE_SPANS.P4.endYear;

function techHubPhases(label: string): PhaseSlice[] {
  return [
    {
      phaseId: "P0",
      startYear: P0_START,
      endYear: P0_END,
      roleSummary: `${label}: stand up Casimir tile and RF/Q pilot lines, metrology, and simulation benches.`,
    },
    {
      phaseId: "P1",
      startYear: P1_START,
      endYear: P1_END,
      roleSummary: `${label}: scale supercell fabrication and cavity/Q sweeps; feed Phoenix-style TS/tau_LC models.`,
    },
    {
      phaseId: "P2",
      startYear: P2_START,
      endYear: P2_END,
      roleSummary: `${label}: export qualified tile stacks and RF devices for m^2 hull patches and regional testbeds.`,
    },
    {
      phaseId: "P3",
      startYear: P3_START,
      endYear: P3_END,
      roleSummary: `${label}: maintain global tile supply, calibration, and failure analysis for ground-test Needle hulls.`,
    },
    {
      phaseId: "P4",
      startYear: P4_START,
      endYear: P4_END,
      roleSummary: `${label}: support orbital hull servicing, QI-compliant operations, and open-source control stacks.`,
    },
  ];
}

function spaceRangePhases(label: string): PhaseSlice[] {
  return [
    {
      phaseId: "P0",
      startYear: P0_START,
      endYear: P0_END,
      roleSummary: `${label}: reserve test corridors and begin regulatory work for dynamic Casimir and EM emissions.`,
    },
    {
      phaseId: "P1",
      startYear: P1_START,
      endYear: P1_END,
      roleSummary: `${label}: qualify ground ranges for supercell and sector-scheduling tests; build tracking networks.`,
    },
    {
      phaseId: "P2",
      startYear: P2_START,
      endYear: P2_END,
      roleSummary: `${label}: host m^2 hull patch tests and Phoenix-averaged stress-energy proxies at national ranges.`,
    },
    {
      phaseId: "P3",
      startYear: P3_START,
      endYear: P3_END,
      roleSummary: `${label}: ground and near-space campaigns for full ellipsoidal hulls at reduced gamma_VdB/duty.`,
    },
    {
      phaseId: "P4",
      startYear: P4_START,
      endYear: P4_END,
      roleSummary: `${label}: downrange tracking, orbital ops support, and recovery for uncrewed and crewed warp tests.`,
    },
  ];
}

function materialsGridPhases(label: string): PhaseSlice[] {
  return [
    {
      phaseId: "P0",
      startYear: P0_START,
      endYear: P0_END,
      roleSummary: `${label}: map critical-materials, power, and grid assets for Casimir tile and driver supply chains.`,
    },
    {
      phaseId: "P1",
      startYear: P1_START,
      endYear: P1_END,
      roleSummary: `${label}: pilot sustainable mining, recycling, and HVDC upgrades aligned with Ford-Roman duty limits.`,
    },
    {
      phaseId: "P2",
      startYear: P2_START,
      endYear: P2_END,
      roleSummary: `${label}: anchor regional P2 hull-patch test sites with upgraded power and monitoring grids.`,
    },
    {
      phaseId: "P3",
      startYear: P3_START,
      endYear: P3_END,
      roleSummary: `${label}: host caverns, cryoplants, and pulsed-power infrastructure for full Needle-hull stacks.`,
    },
    {
      phaseId: "P4",
      startYear: P4_START,
      endYear: P4_END,
      roleSummary: `${label}: maintain resilient grids, recycling, and materials loops for long-term warp operations.`,
    },
  ];
}

function eduGovPhases(label: string): PhaseSlice[] {
  return [
    {
      phaseId: "P0",
      startYear: P0_START,
      endYear: P0_END,
      roleSummary: `${label}: stand up education, outreach, and ethics/governance tracks around Casimir and warp R&D.`,
    },
    {
      phaseId: "P1",
      startYear: P1_START,
      endYear: P1_END,
      roleSummary: `${label}: deploy sensor networks and citizen-science programs for environmental and sky monitoring.`,
    },
    {
      phaseId: "P2",
      startYear: P2_START,
      endYear: P2_END,
      roleSummary: `${label}: contribute to global QI policy, FR guardrails, and data standards for the Needle program.`,
    },
    {
      phaseId: "P3",
      startYear: P3_START,
      endYear: P3_END,
      roleSummary: `${label}: host regional observatories, public verification nodes, and governance summits.`,
    },
    {
      phaseId: "P4",
      startYear: P4_START,
      endYear: P4_END,
      roleSummary: `${label}: act as long-term stewards for data, ethics, and public participation in warp operations.`,
    },
  ];
}

const TECH_HUB_SEEDS: CountrySeed[] = [
  { iso2: "JP", name: "Japan", lat: 36.0, lon: 138.0 },
  { iso2: "GB", name: "United Kingdom", lat: 54.0, lon: -2.0 },
  { iso2: "FR", name: "France", lat: 46.0, lon: 2.0 },
  { iso2: "IT", name: "Italy", lat: 42.5, lon: 12.5 },
  { iso2: "FI", name: "Finland", lat: 64.0, lon: 26.0 },
  { iso2: "NO", name: "Norway", lat: 62.0, lon: 10.0 },
  { iso2: "TW", name: "Taiwan", lat: 23.7, lon: 121.0 },
  { iso2: "IL", name: "Israel", lat: 31.5, lon: 35.0 },
  { iso2: "UA", name: "Ukraine", lat: 49.0, lon: 32.0 },
  { iso2: "CZ", name: "Czechia", lat: 49.8, lon: 15.5 },
  { iso2: "CH", name: "Switzerland", lat: 46.8, lon: 8.2 },
  { iso2: "PT", name: "Portugal", lat: 39.5, lon: -8.0 },
  { iso2: "IE", name: "Ireland", lat: 53.0, lon: -8.0 },
  { iso2: "BE", name: "Belgium", lat: 50.5, lon: 4.5 },
  { iso2: "NL", name: "Netherlands", lat: 52.3, lon: 5.3 },
  { iso2: "AT", name: "Austria", lat: 47.5, lon: 14.6 },
  { iso2: "HU", name: "Hungary", lat: 47.0, lon: 19.0 },
  { iso2: "DK", name: "Denmark", lat: 56.0, lon: 10.0 },
  { iso2: "SK", name: "Slovakia", lat: 48.7, lon: 19.5 },
  { iso2: "IS", name: "Iceland", lat: 64.9, lon: -18.0 },
  { iso2: "LU", name: "Luxembourg", lat: 49.8, lon: 6.1 },
  { iso2: "EE", name: "Estonia", lat: 58.7, lon: 25.0 },
  { iso2: "LV", name: "Latvia", lat: 56.9, lon: 24.6 },
  { iso2: "LT", name: "Lithuania", lat: 55.3, lon: 23.9 },
  { iso2: "SI", name: "Slovenia", lat: 46.1, lon: 14.8 },
];

const SPACE_RANGE_SEEDS: CountrySeed[] = [
  { iso2: "ES", name: "Spain", lat: 40.0, lon: -4.0 },
  { iso2: "PT", name: "Portugal", lat: 39.5, lon: -8.0 },
  { iso2: "KZ", name: "Kazakhstan", lat: 48.0, lon: 67.0 },
  { iso2: "PH", name: "Philippines", lat: 12.5, lon: 122.0 },
  { iso2: "PG", name: "Papua New Guinea", lat: -6.0, lon: 147.0 },
  { iso2: "GR", name: "Greece", lat: 39.0, lon: 22.0 },
  { iso2: "HR", name: "Croatia", lat: 45.1, lon: 15.2 },
];

const MATERIALS_GRID_SEEDS: CountrySeed[] = [
  { iso2: "PE", name: "Peru", lat: -9.0, lon: -75.0 },
  { iso2: "BO", name: "Bolivia", lat: -16.0, lon: -64.0 },
  { iso2: "MA", name: "Morocco", lat: 31.8, lon: -6.0 },
  { iso2: "GH", name: "Ghana", lat: 7.9, lon: -1.0 },
  { iso2: "TH", name: "Thailand", lat: 15.0, lon: 101.0 },
  { iso2: "PK", name: "Pakistan", lat: 30.0, lon: 70.0 },
  { iso2: "BD", name: "Bangladesh", lat: 24.0, lon: 90.0 },
  { iso2: "RO", name: "Romania", lat: 45.9, lon: 24.9 },
  { iso2: "MN", name: "Mongolia", lat: 46.8, lon: 103.0 },
  { iso2: "UZ", name: "Uzbekistan", lat: 41.2, lon: 64.5 },
  { iso2: "MY", name: "Malaysia", lat: 4.2, lon: 102.0 },
  { iso2: "IR", name: "Iran", lat: 32.0, lon: 53.0 },
  { iso2: "IQ", name: "Iraq", lat: 33.0, lon: 44.0 },
  { iso2: "TN", name: "Tunisia", lat: 34.0, lon: 9.0 },
  { iso2: "CI", name: "Cote d'Ivoire", lat: 7.6, lon: -5.5 },
  { iso2: "ET", name: "Ethiopia", lat: 9.1, lon: 40.5 },
  { iso2: "CO", name: "Colombia", lat: 4.0, lon: -73.0 },
  { iso2: "VE", name: "Venezuela", lat: 7.0, lon: -66.0 },
  { iso2: "GY", name: "Guyana", lat: 5.0, lon: -59.0 },
  { iso2: "DZ", name: "Algeria", lat: 28.0, lon: 2.0 },
  { iso2: "SN", name: "Senegal", lat: 14.5, lon: -14.0 },
  { iso2: "TZ", name: "Tanzania", lat: -6.3, lon: 35.0 },
  { iso2: "UG", name: "Uganda", lat: 1.5, lon: 32.5 },
  { iso2: "AO", name: "Angola", lat: -12.5, lon: 18.5 },
  { iso2: "NA", name: "Namibia", lat: -22.0, lon: 17.0 },
  { iso2: "BW", name: "Botswana", lat: -22.0, lon: 24.0 },
  { iso2: "MG", name: "Madagascar", lat: -19.0, lon: 46.7 },
  { iso2: "EC", name: "Ecuador", lat: -1.4, lon: -78.4 },
  { iso2: "PY", name: "Paraguay", lat: -23.3, lon: -58.0 },
  { iso2: "SR", name: "Suriname", lat: 4.0, lon: -56.0 },
  { iso2: "KH", name: "Cambodia", lat: 12.6, lon: 104.9 },
  { iso2: "LA", name: "Laos", lat: 18.0, lon: 103.0 },
  { iso2: "RS", name: "Serbia", lat: 44.0, lon: 21.0 },
  { iso2: "BA", name: "Bosnia and Herzegovina", lat: 44.2, lon: 17.8 },
];

const EDU_GOV_SEEDS: CountrySeed[] = [
  { iso2: "QA", name: "Qatar", lat: 25.3, lon: 51.2 },
  { iso2: "KW", name: "Kuwait", lat: 29.3, lon: 47.5 },
  { iso2: "JO", name: "Jordan", lat: 31.2, lon: 36.5 },
  { iso2: "OM", name: "Oman", lat: 20.5, lon: 57.0 },
  { iso2: "BH", name: "Bahrain", lat: 26.1, lon: 50.5 },
  { iso2: "UY", name: "Uruguay", lat: -32.5, lon: -56.0 },
  { iso2: "CR", name: "Costa Rica", lat: 9.9, lon: -84.2 },
  { iso2: "PA", name: "Panama", lat: 8.5, lon: -80.0 },
  { iso2: "CU", name: "Cuba", lat: 21.5, lon: -79.5 },
  { iso2: "DO", name: "Dominican Republic", lat: 19.0, lon: -70.7 },
  { iso2: "JM", name: "Jamaica", lat: 18.1, lon: -77.3 },
  { iso2: "LK", name: "Sri Lanka", lat: 7.9, lon: 80.8 },
  { iso2: "NP", name: "Nepal", lat: 28.0, lon: 84.0 },
  { iso2: "BT", name: "Bhutan", lat: 27.5, lon: 90.5 },
  { iso2: "RW", name: "Rwanda", lat: -1.9, lon: 29.9 },
  { iso2: "MU", name: "Mauritius", lat: -20.2, lon: 57.5 },
  { iso2: "GL", name: "Greenland", lat: 72.0, lon: -40.0 },
  { iso2: "AZ", name: "Azerbaijan", lat: 40.1, lon: 47.5 },
  { iso2: "GE", name: "Georgia", lat: 42.2, lon: 43.6 },
  { iso2: "AM", name: "Armenia", lat: 40.1, lon: 45.0 },
];

export const NEEDLE_WORLD_ROLES_PROMOTED: CountryProgramRole[] = [
  ...TECH_HUB_SEEDS.map((c) => ({
    ...c,
    capabilities: CAP_TECH_HUB,
    phases: techHubPhases(c.name),
  })),
  ...SPACE_RANGE_SEEDS.map((c) => ({
    ...c,
    capabilities: CAP_SPACE_RANGE,
    phases: spaceRangePhases(c.name),
  })),
  ...MATERIALS_GRID_SEEDS.map((c) => ({
    ...c,
    capabilities: CAP_MATERIALS_GRID,
    phases: materialsGridPhases(c.name),
  })),
  ...EDU_GOV_SEEDS.map((c) => ({
    ...c,
    capabilities: CAP_EDU_GOV,
    phases: eduGovPhases(c.name),
  })),
];
