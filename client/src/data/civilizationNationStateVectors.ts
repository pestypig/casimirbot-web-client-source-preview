export const CIVILIZATION_NATION_PARAMETER_SCOPES = [
  "material_base",
  "governance_capacity",
  "security_exposure",
  "social_cohesion_pressure",
  "information_legitimacy_pressure",
  "environmental_pressure",
] as const;

export type CivilizationNationParameterScope =
  (typeof CIVILIZATION_NATION_PARAMETER_SCOPES)[number];

export type CivilizationNationStateVector = {
  countryIso3: string;
  label: string;
  coordinates: { lat: number; lon: number };
  observedAt: string;
  freshnessDays: number;
  confidence: number;
  claimTier: "diagnostic_bound";
  parameters: Record<CivilizationNationParameterScope, number | null>;
  eventPulse: {
    politicalViolence30d: number;
    demonstrations30d: number;
    strategicDevelopments30d: number;
    activeConflict: boolean;
  };
  clusters: string[];
  missingObservations: string[];
  sourceRefs: string[];
};

export type CivilizationNationDependencyEdge = {
  edgeId: string;
  fromIso3: string;
  toIso3: string;
  kind:
    | "trade_dependency"
    | "logistics_corridor"
    | "security_exposure"
    | "climate_shared_risk"
    | "institutional_alignment";
  label: string;
  confidence: number;
  freshnessDays: number;
  missingObservations: string[];
  sourceRefs: string[];
};

export const CIVILIZATION_NATION_SOURCE_REFS = {
  wdi: "World Bank World Development Indicators",
  wgi: "World Bank Worldwide Governance Indicators",
  vdem: "V-Dem democracy indices",
  fsi: "Fragile States Index",
  gpi: "Global Peace Index",
  acled: "ACLED event data",
  ucdp: "UCDP conflict data",
  hdi: "UNDP Human Development Index",
  ndGain: "ND-GAIN climate vulnerability/readiness",
  lpi: "World Bank Logistics Performance Index",
  eci: "Observatory of Economic Complexity",
} as const;

export const CIVILIZATION_NATION_SCOPE_LABELS: Record<
  CivilizationNationParameterScope,
  string
> = {
  material_base: "Material",
  governance_capacity: "Governance",
  security_exposure: "Security",
  social_cohesion_pressure: "Cohesion",
  information_legitimacy_pressure: "Information",
  environmental_pressure: "Environment",
};

// Diagnostic seed values for UI/procedure testing. These are normalized
// scaffold values, not a current source-backed country ranking.
export const CIVILIZATION_NATION_STATE_VECTORS: CivilizationNationStateVector[] = [
  {
    countryIso3: "USA",
    label: "United States",
    coordinates: { lat: 39.8, lon: -98.6 },
    observedAt: "2026-06-17",
    freshnessDays: 30,
    confidence: 0.58,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.9,
      governance_capacity: 0.68,
      security_exposure: 0.34,
      social_cohesion_pressure: 0.58,
      information_legitimacy_pressure: 0.52,
      environmental_pressure: 0.46,
    },
    eventPulse: {
      politicalViolence30d: 0.12,
      demonstrations30d: 0.46,
      strategicDevelopments30d: 0.35,
      activeConflict: false,
    },
    clusters: ["high_material_high_dependency_centrality"],
    missingObservations: ["latest_acled_rollup", "subnational_variance"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "hdi", "eci"],
  },
  {
    countryIso3: "CHN",
    label: "China",
    coordinates: { lat: 35.9, lon: 104.2 },
    observedAt: "2026-06-17",
    freshnessDays: 45,
    confidence: 0.55,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.88,
      governance_capacity: 0.52,
      security_exposure: 0.28,
      social_cohesion_pressure: 0.42,
      information_legitimacy_pressure: 0.7,
      environmental_pressure: 0.62,
    },
    eventPulse: {
      politicalViolence30d: 0.08,
      demonstrations30d: 0.18,
      strategicDevelopments30d: 0.38,
      activeConflict: false,
    },
    clusters: ["high_material_low_observability", "high_dependency_centrality"],
    missingObservations: ["media_pluralism_refs", "regional_supply_chain_detail"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "lpi", "eci"],
  },
  {
    countryIso3: "DEU",
    label: "Germany",
    coordinates: { lat: 51.2, lon: 10.5 },
    observedAt: "2026-06-17",
    freshnessDays: 60,
    confidence: 0.64,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.78,
      governance_capacity: 0.84,
      security_exposure: 0.24,
      social_cohesion_pressure: 0.34,
      information_legitimacy_pressure: 0.24,
      environmental_pressure: 0.38,
    },
    eventPulse: {
      politicalViolence30d: 0.06,
      demonstrations30d: 0.32,
      strategicDevelopments30d: 0.22,
      activeConflict: false,
    },
    clusters: ["high_material_high_governance"],
    missingObservations: ["energy_dependency_refresh", "industrial_transition_rate"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "hdi", "lpi", "eci"],
  },
  {
    countryIso3: "IND",
    label: "India",
    coordinates: { lat: 20.6, lon: 78.9 },
    observedAt: "2026-06-17",
    freshnessDays: 45,
    confidence: 0.54,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.72,
      governance_capacity: 0.56,
      security_exposure: 0.42,
      social_cohesion_pressure: 0.55,
      information_legitimacy_pressure: 0.46,
      environmental_pressure: 0.7,
    },
    eventPulse: {
      politicalViolence30d: 0.36,
      demonstrations30d: 0.4,
      strategicDevelopments30d: 0.28,
      activeConflict: false,
    },
    clusters: ["high_material_high_environment_pressure"],
    missingObservations: ["subnational_event_distribution", "water_stress_refs"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ndGain", "eci"],
  },
  {
    countryIso3: "BRA",
    label: "Brazil",
    coordinates: { lat: -14.2, lon: -51.9 },
    observedAt: "2026-06-17",
    freshnessDays: 60,
    confidence: 0.52,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.64,
      governance_capacity: 0.55,
      security_exposure: 0.5,
      social_cohesion_pressure: 0.56,
      information_legitimacy_pressure: 0.38,
      environmental_pressure: 0.64,
    },
    eventPulse: {
      politicalViolence30d: 0.34,
      demonstrations30d: 0.3,
      strategicDevelopments30d: 0.2,
      activeConflict: false,
    },
    clusters: ["high_environment_pressure", "social_cohesion_pressure"],
    missingObservations: ["amazon_ecological_sink_detail", "public_security_event_refresh"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ndGain"],
  },
  {
    countryIso3: "NGA",
    label: "Nigeria",
    coordinates: { lat: 9.1, lon: 8.7 },
    observedAt: "2026-06-17",
    freshnessDays: 30,
    confidence: 0.48,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.48,
      governance_capacity: 0.34,
      security_exposure: 0.78,
      social_cohesion_pressure: 0.74,
      information_legitimacy_pressure: 0.46,
      environmental_pressure: 0.66,
    },
    eventPulse: {
      politicalViolence30d: 0.72,
      demonstrations30d: 0.34,
      strategicDevelopments30d: 0.42,
      activeConflict: true,
    },
    clusters: ["high_security_exposure", "high_social_pressure"],
    missingObservations: ["actor_identity_refs", "subnational_governance_variance"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ucdp", "ndGain"],
  },
  {
    countryIso3: "UKR",
    label: "Ukraine",
    coordinates: { lat: 48.4, lon: 31.2 },
    observedAt: "2026-06-17",
    freshnessDays: 7,
    confidence: 0.62,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.42,
      governance_capacity: 0.52,
      security_exposure: 0.95,
      social_cohesion_pressure: 0.68,
      information_legitimacy_pressure: 0.55,
      environmental_pressure: 0.54,
    },
    eventPulse: {
      politicalViolence30d: 0.96,
      demonstrations30d: 0.12,
      strategicDevelopments30d: 0.68,
      activeConflict: true,
    },
    clusters: ["high_security_exposure", "event_pulse_dominant"],
    missingObservations: ["infrastructure_damage_refresh", "displacement_trend_refs"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ucdp"],
  },
  {
    countryIso3: "JPN",
    label: "Japan",
    coordinates: { lat: 36.2, lon: 138.3 },
    observedAt: "2026-06-17",
    freshnessDays: 60,
    confidence: 0.66,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.76,
      governance_capacity: 0.82,
      security_exposure: 0.22,
      social_cohesion_pressure: 0.28,
      information_legitimacy_pressure: 0.2,
      environmental_pressure: 0.42,
    },
    eventPulse: {
      politicalViolence30d: 0.04,
      demonstrations30d: 0.16,
      strategicDevelopments30d: 0.2,
      activeConflict: false,
    },
    clusters: ["high_material_high_governance"],
    missingObservations: ["energy_import_dependency_refresh", "demographic_pressure_refs"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "hdi", "lpi", "eci"],
  },
  {
    countryIso3: "ZAF",
    label: "South Africa",
    coordinates: { lat: -30.6, lon: 22.9 },
    observedAt: "2026-06-17",
    freshnessDays: 60,
    confidence: 0.5,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.54,
      governance_capacity: 0.48,
      security_exposure: 0.56,
      social_cohesion_pressure: 0.66,
      information_legitimacy_pressure: 0.34,
      environmental_pressure: 0.58,
    },
    eventPulse: {
      politicalViolence30d: 0.28,
      demonstrations30d: 0.46,
      strategicDevelopments30d: 0.24,
      activeConflict: false,
    },
    clusters: ["social_cohesion_pressure", "infrastructure_constraint"],
    missingObservations: ["grid_reliability_refresh", "public_service_capacity_refs"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ndGain"],
  },
  {
    countryIso3: "IDN",
    label: "Indonesia",
    coordinates: { lat: -2.5, lon: 118.0 },
    observedAt: "2026-06-17",
    freshnessDays: 60,
    confidence: 0.52,
    claimTier: "diagnostic_bound",
    parameters: {
      material_base: 0.62,
      governance_capacity: 0.54,
      security_exposure: 0.36,
      social_cohesion_pressure: 0.45,
      information_legitimacy_pressure: 0.38,
      environmental_pressure: 0.72,
    },
    eventPulse: {
      politicalViolence30d: 0.18,
      demonstrations30d: 0.28,
      strategicDevelopments30d: 0.24,
      activeConflict: false,
    },
    clusters: ["high_environment_pressure", "logistics_archipelago"],
    missingObservations: ["island_level_logistics_detail", "climate_shared_risk_refs"],
    sourceRefs: ["wdi", "wgi", "vdem", "fsi", "gpi", "acled", "ndGain", "lpi"],
  },
];

export const CIVILIZATION_NATION_DEPENDENCY_EDGES: CivilizationNationDependencyEdge[] = [
  {
    edgeId: "edge:USA:DEU:institutional-alignment",
    fromIso3: "USA",
    toIso3: "DEU",
    kind: "institutional_alignment",
    label: "Transatlantic institutional and standards interface",
    confidence: 0.58,
    freshnessDays: 60,
    missingObservations: ["current_policy_alignment_refs"],
    sourceRefs: ["wgi", "vdem", "gpi"],
  },
  {
    edgeId: "edge:CHN:DEU:trade-dependency",
    fromIso3: "CHN",
    toIso3: "DEU",
    kind: "trade_dependency",
    label: "Industrial trade dependency",
    confidence: 0.5,
    freshnessDays: 90,
    missingObservations: ["latest_trade_matrix"],
    sourceRefs: ["wdi", "lpi", "eci"],
  },
  {
    edgeId: "edge:CHN:IDN:logistics-corridor",
    fromIso3: "CHN",
    toIso3: "IDN",
    kind: "logistics_corridor",
    label: "Regional logistics and commodity corridor",
    confidence: 0.48,
    freshnessDays: 90,
    missingObservations: ["commodity_flow_detail"],
    sourceRefs: ["wdi", "lpi"],
  },
  {
    edgeId: "edge:UKR:DEU:security-exposure",
    fromIso3: "UKR",
    toIso3: "DEU",
    kind: "security_exposure",
    label: "European conflict exposure and support interface",
    confidence: 0.62,
    freshnessDays: 7,
    missingObservations: ["support_flow_refresh"],
    sourceRefs: ["acled", "ucdp", "gpi"],
  },
  {
    edgeId: "edge:BRA:IDN:climate-shared-risk",
    fromIso3: "BRA",
    toIso3: "IDN",
    kind: "climate_shared_risk",
    label: "Forest and ecological sink pressure comparison",
    confidence: 0.46,
    freshnessDays: 120,
    missingObservations: ["ecosystem_service_trend_refs"],
    sourceRefs: ["ndGain", "wdi"],
  },
  {
    edgeId: "edge:NGA:ZAF:institutional-alignment",
    fromIso3: "NGA",
    toIso3: "ZAF",
    kind: "institutional_alignment",
    label: "Regional institutional and trade interface",
    confidence: 0.42,
    freshnessDays: 90,
    missingObservations: ["regional_bloc_interface_refs"],
    sourceRefs: ["wgi", "fsi", "lpi"],
  },
];
