// Hook for accessing the centralized HELIX-CORE energy pipeline
import { startTransition } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { clampHullArea, clampHullAxis, clampHullDims } from "@/lib/hull-guardrails";
import { getModeWisdom } from "@/lib/luma-whispers-core";
import { isFlagEnabled } from "@/lib/envFlags";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import type {
  VacuumGapSweepRow,
  DynamicConfig,
  DynamicCasimirSweepConfig,
  SweepRuntime,
  SweepPointExtended,
  GateAnalytics,
  QiStats,
  PhaseScheduleTelemetry,
  WarpGeometry,
  WarpGeometryKind,
  WarpGeometryFallback,
  WarpFallbackMode,
  CardRecipe,
  CardMeshMetadata,
  CardLatticeMetadata,
  HullPreviewPayload,
} from "@shared/schema";
import type { ClockingSnapshot } from "@shared/clocking";
import type {
  PipelineSnapshot,
  QiAutoscaleTelemetry,
  QiAutoscaleClamp,
  QiGuardrail,
  CongruenceMeta,
} from "@/types/pipeline";
import type { StressEnergyBrickStats } from "@/lib/stress-energy-brick";
import type { FixupStats, GrBrickMeta, GrSolverHealth } from "@/lib/gr-evolve-brick";

/**
 * TheoryRefs:
 *  - ford-roman-qi-1995: FR duty clamp + scheduler spacing
 */

// Greens function types
export type GreensKind = "poisson" | "helmholtz";
export type GreensSource = "server" | "client" | "none";

export interface GreensPayload {
  kind: GreensKind;
  m: number;                 // mass parameter for Helmholtz (0 ⇒ Poisson limit)
  normalize: boolean;
  phi: Float32Array;         // normalized or raw potential samples (per-tile order)
  size: number;              // phi.length
  source: GreensSource;      // who computed it
}

export type QuantumInterestBook = {
  neg_Jm3: number;
  pos_Jm3: number;
  debt_Jm3: number;
  credit_Jm3: number;
  margin_Jm3: number;
  netCycle_Jm3: number;
  window_ms: number;
  rate: number;
};

export type WarpSdfPreview = {
  key?: string | null;
  hash?: string | null;
  meshHash?: string | null;
  basisSignature?: string | null;
  dims?: [number, number, number] | null;
  bounds?: [number, number, number] | null;
  voxelSize?: number | null;
  band?: number | null;
  format?: "float" | "byte" | null;
  clampReasons?: string[] | null;
  stats?: {
    sampleCount?: number;
    voxelsTouched?: number;
    voxelCoverage?: number;
    trianglesTouched?: number;
    triangleCoverage?: number;
    maxAbsDistance?: number;
    maxQuantizationError?: number;
  } | null;
  updatedAt?: number | null;
};

export type GeometryPreviewState = {
  preview?: HullPreviewPayload | null;
  mesh?: CardMeshMetadata | null;
  sdf?: WarpSdfPreview | null;
  lattice?: CardLatticeMetadata | null;
  updatedAt?: number | null;
};

export interface MechanicalFeasibility {
  requestedGap_nm: number;
  requestedStroke_pm: number;
  recommendedGap_nm: number;
  minGap_nm: number;
  maxStroke_pm: number;
  casimirPressure_Pa: number;
  electrostaticPressure_Pa: number;
  restoringPressure_Pa: number;
  roughnessGuard_nm: number;
  margin_Pa: number;
  safetyFactorMin?: number;
  mechSafetyFactor?: number;
  sigmaYield_Pa?: number;
  sigmaAllow_Pa?: number;
  loadPressure_Pa?: number;
  safetyFeasible?: boolean;
  feasible: boolean;
  strokeFeasible: boolean;
  constrainedGap_nm?: number;
  casimirGap_nm?: number;
  modelMode?: 'calibrated' | 'raw';
  unattainable?: boolean;
  note?: string;
  sweep?: Array<{ gap_nm: number; margin_Pa: number; feasible: boolean }>;
}

export interface MechanicalGuard {
  qMechDemand: number;
  qMechApplied: number;
  mechSpoilage: number;
  pCap_W: number;
  pApplied_W: number;
  pShortfall_W: number;
  status: "ok" | "saturated" | "fail";
}

export type VdbRegionIIDiagnostics = {
  alpha: number;
  n: number;
  r_tilde_m: number;
  delta_tilde_m: number;
  sampleCount: number;
  b_min: number;
  b_max: number;
  bprime_min: number;
  bprime_max: number;
  bprime_rms: number;
  bdouble_min: number;
  bdouble_max: number;
  bdouble_rms: number;
  t00_min: number;
  t00_max: number;
  t00_mean: number;
  t00_rms: number;
  support: boolean;
  note?: string;
};

export type VdbRegionIVDiagnostics = {
  R_m: number;
  sigma: number;
  sampleCount: number;
  dfdr_max_abs: number;
  dfdr_rms: number;
  beta?: number;
  r_min_m?: number;
  r_max_m?: number;
  step_m?: number;
  t00_min?: number;
  t00_max?: number;
  t00_mean?: number;
  t00_rms?: number;
  k_trace_mean?: number;
  k_squared_mean?: number;
  support: boolean;
  note?: string;
};

export type AmpFactors = {
  gammaGeo?: number;
  gammaVanDenBroeck?: number;
  qSpoilingFactor?: number;
  qMechanical?: number;
  qCavity?: number;
  measuredGammaGeo?: number;
  measuredGammaVanDenBroeck?: number;
  measuredQSpoilingFactor?: number;
  measuredQMechanical?: number;
  measuredCavityQ?: number;
};

export type HullBrickChannel = {
  data: Float32Array | string;
  min?: number;
  max?: number;
};

export type HullBrickBounds = {
  min?: [number, number, number];
  max?: [number, number, number];
  center?: [number, number, number];
  extent?: [number, number, number];
  axes?: [number, number, number];
  wall?: number;
};

export type HullBrickPayload = {
  dims: [number, number, number];
  voxelBytes?: number;
  format?: "r32f";
  channels: {
    hullDist?: HullBrickChannel;
    hullMask?: HullBrickChannel;
  };
  bounds?: HullBrickBounds;
  meta?: unknown;
};

export type GrConstraintDiagnostics = {
  min: number;
  max: number;
  maxAbs: number;
  rms?: number;
  mean?: number;
  sampleCount?: number;
};

export type GrMomentumConstraintDiagnostics = {
  rms: number;
  maxAbs: number;
  components: {
    x: GrConstraintDiagnostics;
    y: GrConstraintDiagnostics;
    z: GrConstraintDiagnostics;
  };
};

export type GrShiftStiffnessMetrics = {
  betaMaxAbs: number;
  betaP98Abs: number;
  gradBetaMaxAbs: number;
  gradBetaP98Abs: number;
  advectiveCflSuggested: number;
  charSpeedSuggested: number;
  charCflSuggested: number;
  shockIndex?: number;
  shockSeverity?: "ok" | "warn" | "severe";
  shockMode?: "off" | "diagnostic" | "stabilize";
  stabilizersApplied?: string[];
};

export type GrInvariantStats = {
  min: number;
  max: number;
  mean: number;
  p98: number;
  sampleCount: number;
  abs: boolean;
  wallFraction: number;
  bandFraction: number;
  threshold: number;
  bandMin: number;
  bandMax: number;
};

export type GrInvariantStatsSet = {
  kretschmann?: GrInvariantStats;
  ricci4?: GrInvariantStats;
};

export type GrPipelineDiagnostics = {
  updatedAt: number;
  source: "gr-evolve-brick";
  meta?: GrBrickMeta;
  grid: {
    dims: [number, number, number];
    bounds: { min: [number, number, number]; max: [number, number, number] };
    voxelSize_m: [number, number, number];
    time_s: number;
    dt_s: number;
  };
  solver: {
    steps: number;
    iterations: number;
    tolerance: number;
    cfl: number;
    fixups?: FixupStats;
    health?: GrSolverHealth;
  };
  gauge?: {
    lapseMin: number;
    lapseMax: number;
    betaMaxAbs: number;
  };
  stiffness?: GrShiftStiffnessMetrics;
  constraints: {
    H_constraint: GrConstraintDiagnostics;
    M_constraint: GrMomentumConstraintDiagnostics;
    rho_constraint?: GrConstraintDiagnostics;
  };
  invariants?: GrInvariantStatsSet;
  matter?: {
    stressEnergy?: StressEnergyBrickStats;
  };
  perf?: {
    totalMs: number;
    evolveMs: number;
    brickMs: number;
    voxels: number;
    channelCount: number;
    bytesEstimate: number;
    msPerStep: number;
  };
};

export type GrInvariantBaseline = {
  invariants?: GrInvariantStatsSet;
  source?: string;
  updatedAt?: number;
};

export type GrRequestPayload = {
  P_avg_W: number;
  dutyEffectiveFR: number;
  gammaGeo: number;
  gammaVdB: number;
  qSpoil: number;
  TS_ratio: number;
  hull: { Lx_m: number; Ly_m: number; Lz_m: number; wallThickness_m?: number };
  hullArea_m2?: number;
  N_tiles: number;
  tilesPerSector: number;
};

export interface EnergyPipelineState {
  claim_tier?: "exploratory" | "reduced_order" | "diagnostic" | "certified" | string;
  provenance_class?: string;
  claimTier?: "exploratory" | "reduced_order" | "diagnostic" | "certified" | string;
  provenanceClass?: string;
  // Input parameters
  tileArea_cm2: number;
  gap_nm: number;
  sag_nm?: number;
  temperature_K: number;
  modulationFreq_GHz: number;
  warpFieldType?: DynamicConfig["warpFieldType"];
  warpGeometry?: WarpGeometry | null;
  warpGeometryKind?: WarpGeometryKind;
  warpGeometryAssetId?: string;
  cardRecipe?: CardRecipe;
  geometryPreview?: GeometryPreviewState | null;
  geometryFallback?: WarpGeometryFallback | null;
  hullBrick?: HullBrickPayload | null;
  
  /** Post-scale for translational bias (0..1). 1 = full translation. */
  beta_trans?: number;
  /** Optional power fill command (0..1). 1 = nominal mode target. */
  powerFillCmd?: number;
  /** Optional target ground speed for Taxi mode, meters/second (default 1.4). */
  taxi_target_mps?: number;

  // Mode parameters
  currentMode: 'hover' | 'taxi' | 'nearzero' | 'cruise' | 'emergency' | 'standby';
  dutyCycle: number;
  sectorStrobing: number;
  qSpoilingFactor: number;
  iPeakMaxMidi_A?: number;
  iPeakMaxSector_A?: number;
  iPeakMaxLauncher_A?: number;
  
  // Additional mode knobs (explicit to drive FR duty & timing)
  localBurstFrac?: number;     // sector-local burst fraction (0..1); defaults to dutyCycle
  sectorsTotal?: number;       // total sectors in sweep
  sectorsConcurrent?: number;  // how many sectors fire simultaneously

  // Light-crossing & cycle timing (server may emit, else client derives)
  tau_LC_ms?: number;          // light-crossing time across hull/bubble (ms)
  sectorPeriod_ms?: number;    // dwell period per sector (ms)
  burst_ms?: number;           // instantaneous burst window (ms)
  dwell_ms?: number;           // gap between bursts (ms)
  
  // Scheduling truth
  sectorCount?: number;
  concurrentSectors?: number;
  tilesPerSector?: number;
  activeSectors?: number;
  activeTiles?: number;
  activeFraction?: number;
  S_live?: number;
  sectors?: number;
  tiles?: {
    active?: number;
    total?: number;
    tileArea_cm2?: number;
    hullArea_m2?: number;
    [key: string]: unknown;
  };
  currentSector?: number;
  __sectors?: unknown;
  __fr?: unknown;
  __mockData?: boolean;
  
  // FR duty direct
  dutyEffectiveFR?: number;
  dutyEffective_FR?: number;    // legacy alias
  dutyShip?: number;            // legacy alias
  dutyFR?: number;              // legacy alias
  dutyBurst?: number;           // legacy alias
  dutyUsed?: number;            // legacy alias
  dutyFR_slice?: number;        // legacy alias
  dutyFR_ship?: number;         // legacy alias
  dutyEff?: number;             // legacy alias
  dutyGate?: number;            // legacy alias
  deltaAOverA?: number;         // alias for qSpoilingFactor
  strobeHz?: number;
  phase01?: number;
  sigmaSector?: number;
  splitEnabled?: boolean;
  splitFrac?: number;
  phaseSign?: number;
  phaseMode?: string;
  pumpPhase_deg?: number;
  phaseFreeze?: boolean;
  negativeFraction?: number;   // share of sectors assigned to negative lobe (0..1)

  // Physics parameters
  gammaGeo: number;
  qMechanical: number;
  qCavity: number;
  gammaVanDenBroeck: number;
  gammaVdB?: number;            // legacy alias
  gamma_vdb?: number;           // legacy alias
  exoticMassTarget_kg: number;
  massMode?: "MODEL_DERIVED" | "TARGET_CALIBRATED" | "MEASURED_FORCE_INFERRED";
  massSource?: "model" | "measured" | "target" | "targetOverride";
  massDatasetId?: string;
  massFitResiduals?: {
    rms_N?: number;
    rms_rel?: number;
    sampleCount?: number;
  };
  massSigma_kg?: number;
  invariantMassSigma_kg?: number;
  massSourceNote?: string;
  casimirForceInference?: {
    datasetId?: string;
    referenceSeparation_m?: number;
    energy_J_at_a0?: number;
    sigmaEnergy_J?: number;
    kCasimir?: number;
    sigmaK?: number;
    sampleCount?: number;
    fitResiduals?: {
      rms_N?: number;
      rms_rel?: number;
      sampleCount?: number;
    };
    forceSign?: {
      expected?: "negative" | "positive";
      observed?: "negative" | "positive" | "mixed" | "unknown";
      positiveFraction?: number;
      negativeFraction?: number;
      sampleCount?: number;
      autoFlipApplied?: boolean;
      note?: string;
    };
    note?: string;
  };
  geomCoupling?: number;        // χ coupling factor for parametric sweeps
  pumpEff?: number;             // η pump transduction efficiency (0..1)
  ampFactors?: AmpFactors;      // Amplification factors (gamma, q) from pipeline
  /** @deprecated use ampFactors */
  amps?: AmpFactors;
  
  // Visual vs mass split (server emits both)
  gammaVanDenBroeck_vis?: number;
  gammaVanDenBroeck_mass?: number;
  gammaVdB_vis?: number;        // legacy alias
  sigma?: number;               // legacy alias
  q?: number;                   // legacy alias
  qSpoil?: number;              // legacy alias
  greens?: GreensPayload | null | Record<string, unknown>;
  lightCrossing?: unknown;
  lc?: unknown;
  natario?: unknown;
  warp?: unknown;
  stressEnergy?: unknown;
  P_avg_W?: number;             // alias for power in watts
  busVoltage_kV?: number;       // ship HV bus setpoint (per-mode policy)
  busCurrent_A?: number;        // derived ship-side bus current
  qi?: QiStats;
  qiBadge?: "ok" | "near" | "violation";
  qiInterest?: QuantumInterestBook | null;
  qiGuardrail?: QiGuardrail;
  clocking?: ClockingSnapshot;
  mechanical?: MechanicalFeasibility;
  thetaRaw?: number;
  thetaCal?: number;
  thetaScaleExpected?: number;
  theta_audit?: number;
  theta_audit_source?: string;
  theta_geom?: number;
  theta_geom_source?: string;
  theta_geom_proxy?: boolean;
  theta_proxy?: number;
  theta_proxy_source?: string;
  theta_source?: string;
  theta_metric_derived?: boolean;
  theta_metric_source?: string;
  theta_metric_reason?: string;
  theta_strict_mode?: boolean;
  theta_strict_ok?: boolean;
  theta_strict_reason?: string;
  metric_k_trace_mean?: number;
  metric_k_sq_mean?: number;
  vdb_two_wall_support?: boolean;
  vdb_two_wall_derivative_support?: boolean;
  vdb_region_ii_derivative_support?: boolean;
  vdb_region_iv_derivative_support?: boolean;
  qi_strict_mode?: boolean;
  qi_strict_ok?: boolean;
  qi_strict_reason?: string;
  qi_rho_source?: string;
  qi_metric_derived?: boolean;
  qi_metric_source?: string;
  qi_metric_reason?: string;
  ts_metric_derived?: boolean;
  ts_metric_source?: string;
  ts_metric_reason?: string;
  mechGuard?: MechanicalGuard;
  phaseSchedule?: PhaseScheduleTelemetry;

  // GR diagnostics (optional)
  grEnabled?: boolean;
  gr?: GrPipelineDiagnostics;
  grBaseline?: GrInvariantBaseline;
  grRequest?: GrRequestPayload;

  // Hull parameters for UI overlays
  hull?: {
    // Client-friendly axes (semi-major lengths of ellipsoid)
    a?: number;
    b?: number;
    c?: number;
    // Server canonical box dimensions
    Lx_m?: number;
    Ly_m?: number;
    Lz_m?: number;
    wallWidth_m?: number;
    wallThickness_m?: number;
  };
  bubble?: {
    R?: number;
    sigma?: number;
    beta?: number;
    dutyGate?: number;
  };
  R?: number;
  radius?: number;
  driveDir?: [number, number, number];
  bubbleStatus?: "NOMINAL" | "WARNING" | "CRITICAL";

  // Optional: targets if you want to show them
  P_target_W?: number;
  P_target_cmd_W?: number;
  P_cap_W?: number;
  physicsCap_W?: number;
  P_applied_W?: number;
  beta_trans_power?: number;
  beta_policy?: number;
  shipBeta_raw?: number;
  shipBeta?: number;
  vShip_mps?: number;
  speedClosure?: "policyA" | "proxyB";
  
  // Calculated values
  U_static: number;
  U_geo: number;
  U_Q: number;
  U_cycle: number;
  U_static_total?: number;
  U_static_total_band?: { min: number; max: number };
  P_loss_raw: number;
  P_avg: number;
  M_exotic: number;
  M_exotic_raw: number;     // Raw physics exotic mass (before calibration)
  massCalibration: number;  // Mass calibration factor
  rho_static?: number;      // Static Casimir energy density (J/m^3)
  rho_inst?: number;        // Instantaneous (on-window) energy density (J/m^3)
  rho_avg?: number;         // Cycle-averaged energy density (J/m^3)
  gammaChain?: {
    geo_cubed?: number;
    qGain?: number;
    pocketCompression?: number;
    dutyEffective?: number;
    qSpoiling?: number;
    note?: string;
  };
  gammaVanDenBroeckGuard?: {
    limit: number;
    greenBand: { min: number; max: number };
    pocketRadius_m: number;
    pocketThickness_m: number;
    planckMargin: number;
    admissible: boolean;
    reason: string;
    requested?: number;
    targetHit?: boolean;
    targetShortfall?: number;
  };
  vdbRegionII?: VdbRegionIIDiagnostics;
  vdbRegionIV?: VdbRegionIVDiagnostics;
  TS_ratio: number;
  TS_long?: number;
  TS_geom?: number;
  zeta: number;
  zetaRaw?: number;
  N_tiles: number;
  hullAreaOverride_m2?: number;
  hullAreaOverride_uncertainty_m2?: number;
  __hullAreaEllipsoid_m2?: number;
  __hullAreaSource?: "override" | "ellipsoid";
  __hullAreaPerSectorSource?: "override" | "ellipsoid" | "uniform";
  hullAreaPerSector_m2?: number[];
  hullArea_m2?: number;
  tilesPerSectorVector?: number[];
  tilesPerSectorUniform?: number[];
  tilePowerDensityScale?: Array<number | null>;
  tilesPerSectorStrategy?: "area-weighted" | "uniform";
  
  // System status
  fordRomanCompliance: boolean;
  natarioConstraint: boolean;
  curvatureLimit: boolean;
  overallStatus: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  modelMode?: 'calibrated' | 'raw';
  atmDensity_kg_m3?: number | null;
  altitude_m?: number | null;
  dynamicConfig?: DynamicConfig | null;
  vacuumGapSweepResults?: VacuumGapSweepRow[];
  vacuumGapSweepRowsTotal?: number;
  vacuumGapSweepRowsDropped?: number;
  sweep?: SweepRuntime | null;
  gateAnalytics?: GateAnalytics | null;
  qiAutoscale?: QiAutoscaleTelemetry | null;
  curvatureMeta?: CongruenceMeta;
  stressMeta?: CongruenceMeta;
}

export type EnergyPipelineSnapshot = EnergyPipelineState & PipelineSnapshot;

const MAX_SWEEP_ROWS = 2000;
const QI_INTENT_GATEWAY_BACKOFF_MS = 60_000;
let issuedInitialMarginIntent = false;
let qiIntentRetryAfter = 0;

const isGatewayError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes(" 502") ||
    normalized.includes(" 503") ||
    normalized.includes(" 504") ||
    normalized.includes("bad gateway") ||
    normalized.includes("upstream")
  );
};
const MAX_STREAM_SWEEP_ROWS = 5000;

const ACTIVE_SLEW_DEFAULT_MOD_DEPTH_CAP_PCT = 0.8;
const ACTIVE_SLEW_MIN_MOD_DEPTH_PCT = 0.005;
const ACTIVE_SLEW_ABSOLUTE_MIN_MOD_DEPTH_PCT = 0.001;
const ACTIVE_SLEW_TARGET_RHO = 0.85;
const ACTIVE_SLEW_MAX_GAIN_DB = 12;
const ACTIVE_SLEW_HARDWARE_GUARDS = {
  gapLimit: 6,
  modDepthLimit: 2,
  phaseLimit: 6,
  pumpLimit: 2,
  pumpFreqLimit_GHz: 120,
  delayMs: 8,
} as const;
const TWO_PHASE_DEFAULT_GAPS = [20, 100, 170, 250, 320, 400] as const;
const TWO_PHASE_DEFAULT_MOD_DEPTHS = [0.1, 0.5] as const;
const TWO_PHASE_DEFAULT_PHASES = [-10, -6, -2, 2, 6, 10] as const;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => Number(entry))
      .filter((num): num is number => Number.isFinite(num));
  }
  const num = Number(value);
  return Number.isFinite(num) ? [num] : [];
};

const pickNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const dedupeNumeric = (values: number[], digits: number): number[] => {
  if (!values.length) return [];
  const scale = 10 ** digits;
  const unique = new Set<number>();
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const rounded = Math.round(value * scale) / scale;
    if (!Number.isFinite(rounded)) continue;
    unique.add(rounded);
  }
  return Array.from(unique).sort((a, b) => a - b);
};

type ActiveSlewGuardContext = {
  pipeline?: EnergyPipelineState;
  sweepResults: VacuumGapSweepRow[];
};

const guardActiveSlewPayload = (
  payload: Partial<DynamicConfig>,
  context: ActiveSlewGuardContext,
): Partial<DynamicConfig> => {
  if (!payload || typeof payload !== "object") return payload;
  const sweepPayload = payload.sweep;
  if (!sweepPayload || sweepPayload.activeSlew !== true) {
    return payload;
  }

  const pipeline = context.pipeline;
  const dynamicConfig = (pipeline as any)?.dynamicConfig as DynamicConfig | undefined;
  const runtimeSweep = pipeline?.sweep as SweepRuntime | undefined;

  const baseSweep: Partial<DynamicCasimirSweepConfig> = {
    ...(dynamicConfig?.sweep ?? {}),
    ...sweepPayload,
  };

  const twoPhaseRequested = baseSweep.twoPhase === true;
  const allowMeasurementSeed = !twoPhaseRequested || Boolean(runtimeSweep?.activeSlew);

  const lastRow =
    allowMeasurementSeed
      ? ((runtimeSweep?.last as VacuumGapSweepRow | undefined) ??
        (context.sweepResults.length
          ? (context.sweepResults[context.sweepResults.length - 1] as VacuumGapSweepRow)
          : undefined))
      : undefined;

  const measuredRho = allowMeasurementSeed ? pickNumber((lastRow as any)?.pumpRatio) : undefined;
  const measuredModDepthFrac = allowMeasurementSeed ? pickNumber((lastRow as any)?.m) : undefined;
  const measuredModDepthPct =
    typeof measuredModDepthFrac === "number" ? measuredModDepthFrac * 100 : undefined;
  const measuredKappaEffMHz = allowMeasurementSeed ? pickNumber((lastRow as any)?.kappaEff_MHz) : undefined;
  const measuredGapNm = allowMeasurementSeed ? pickNumber((lastRow as any)?.d_nm) : undefined;
  const measuredPhaseDeg = allowMeasurementSeed ? pickNumber((lastRow as any)?.phi_deg) : undefined;
  const measuredPumpGHz = allowMeasurementSeed ? pickNumber((lastRow as any)?.Omega_GHz) : undefined;

  const modDepthInputs = [
    ...toNumberArray(baseSweep.mod_depth_pct),
    ...toNumberArray(dynamicConfig?.mod_depth_pct),
    ...toNumberArray(payload.mod_depth_pct),
  ];
  if (typeof measuredModDepthPct === "number") {
    modDepthInputs.push(measuredModDepthPct);
  }
  if (!modDepthInputs.length) {
    modDepthInputs.push(ACTIVE_SLEW_DEFAULT_MOD_DEPTH_CAP_PCT);
  }

  let modDepthCap = ACTIVE_SLEW_DEFAULT_MOD_DEPTH_CAP_PCT;
  const maxSpecified = modDepthInputs.length ? Math.max(...modDepthInputs) : undefined;
  if (Number.isFinite(maxSpecified)) {
    modDepthCap = Math.min(modDepthCap, maxSpecified as number);
  }
  if (typeof measuredModDepthPct === "number" && measuredModDepthPct > 0) {
    modDepthCap = Math.min(modDepthCap, measuredModDepthPct);
  }

  if (
    typeof measuredRho === "number" &&
    measuredRho > 0 &&
    typeof measuredModDepthPct === "number" &&
    measuredModDepthPct > 0
  ) {
    if (measuredRho > ACTIVE_SLEW_TARGET_RHO) {
      const scaled = measuredModDepthPct * (ACTIVE_SLEW_TARGET_RHO / measuredRho);
      if (scaled > 0) {
        modDepthCap = Math.min(
          modDepthCap,
          Math.max(ACTIVE_SLEW_ABSOLUTE_MIN_MOD_DEPTH_PCT, scaled),
        );
      }
    }
  }

  if (typeof measuredKappaEffMHz === "number" && measuredKappaEffMHz <= 0) {
    modDepthCap = Math.min(modDepthCap, ACTIVE_SLEW_MIN_MOD_DEPTH_PCT);
  }

  modDepthCap = Math.max(ACTIVE_SLEW_ABSOLUTE_MIN_MOD_DEPTH_PCT, modDepthCap);
  const depthFloor = Math.max(
    ACTIVE_SLEW_ABSOLUTE_MIN_MOD_DEPTH_PCT,
    Math.min(ACTIVE_SLEW_MIN_MOD_DEPTH_PCT, modDepthCap),
  );

  const modDepthDigits = modDepthCap < 0.1 ? 4 : 3;
  let trimmedModDepths = dedupeNumeric(
    modDepthInputs.map((value) => clampNumber(value, depthFloor, modDepthCap)),
    modDepthDigits,
  );
  trimmedModDepths = dedupeNumeric(
    [...trimmedModDepths, modDepthCap],
    modDepthDigits,
  );

  const gapInputs = [
    ...toNumberArray(baseSweep.gaps_nm),
    ...toNumberArray(dynamicConfig?.gap_nm),
    ...toNumberArray(payload.gap_nm),
  ].filter((value) => value > 0);
  if (typeof measuredGapNm === "number" && measuredGapNm > 0) {
    gapInputs.push(measuredGapNm);
  }
  let safeGaps = dedupeNumeric(gapInputs, 2);
  if (!safeGaps.length && typeof measuredGapNm === "number" && measuredGapNm > 0) {
    safeGaps = [Number(measuredGapNm.toFixed(2))];
  }

  const phaseInputs = [
    ...toNumberArray(baseSweep.phase_deg),
    ...toNumberArray(dynamicConfig?.phase_deg),
    ...toNumberArray(payload.phase_deg),
  ];
  if (typeof measuredPhaseDeg === "number") {
    phaseInputs.push(measuredPhaseDeg);
  }
  const safePhaseList = dedupeNumeric(phaseInputs, 2);

  const pumpSources = [
    baseSweep.pump_freq_GHz,
    dynamicConfig?.pump_freq_GHz,
    payload.pump_freq_GHz,
    payload.sweep?.pump_freq_GHz,
  ];
  const pumpAuto = twoPhaseRequested || pumpSources.some((value) => value === "auto");
  const pumpInputs = twoPhaseRequested
    ? []
    : pumpSources
        .filter((value) => value !== "auto")
        .flatMap((value) => toNumberArray(value));
  if (!twoPhaseRequested && typeof measuredPumpGHz === "number" && measuredPumpGHz > 0) {
    pumpInputs.push(measuredPumpGHz);
  }
  const pumpDigits = 6;
  const pumpList = pumpAuto ? [] : dedupeNumeric(pumpInputs, pumpDigits);

  const guardHardwareLimit = (value: unknown, guard: number, available: number) => {
    const numeric = Number(value);
    const fallback = available > 0 ? available : guard;
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return Math.max(1, Math.min(guard, fallback));
    }
    return Math.max(1, Math.min(Math.floor(numeric), guard, fallback));
  };

  const guardPumpFreqLimit = (value: unknown, guard: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return guard;
    }
    return Math.max(0.01, Math.min(numeric, guard));
  };

  const baseHardwareProfile = {
    ...(dynamicConfig?.sweep?.hardwareProfile ?? {}),
    ...(baseSweep.hardwareProfile ?? {}),
  } as Record<string, unknown>;

  const gainCandidates = [
    ACTIVE_SLEW_MAX_GAIN_DB,
    Number(baseSweep.maxGain_dB),
    Number(dynamicConfig?.sweep?.maxGain_dB),
  ].filter((value) => Number.isFinite(value) && value > 0) as number[];
  const maxGainGuard =
    gainCandidates.length > 0
      ? Math.min(...gainCandidates, ACTIVE_SLEW_MAX_GAIN_DB)
      : ACTIVE_SLEW_MAX_GAIN_DB;

  let resolvedGaps: number[];
  if (twoPhaseRequested) {
    resolvedGaps = dedupeNumeric(Array.from(TWO_PHASE_DEFAULT_GAPS, (value) => Number(value)), 2);
  } else {
    resolvedGaps = safeGaps.length ? safeGaps : toNumberArray(baseSweep.gaps_nm);
    if (!resolvedGaps.length && typeof measuredGapNm === "number" && measuredGapNm > 0) {
      resolvedGaps = [Number(measuredGapNm.toFixed(2))];
    }
    if (!resolvedGaps.length) {
      resolvedGaps = [20];
    }
    resolvedGaps = dedupeNumeric(resolvedGaps, 2);
  }

  let resolvedModDepths: number[];
  if (twoPhaseRequested) {
    resolvedModDepths = dedupeNumeric(
      Array.from(TWO_PHASE_DEFAULT_MOD_DEPTHS, (value) =>
        Number(value.toFixed(modDepthDigits)),
      ),
      modDepthDigits,
    );
  } else {
    resolvedModDepths = trimmedModDepths.length
      ? trimmedModDepths
      : toNumberArray(baseSweep.mod_depth_pct);
    if (!resolvedModDepths.length) {
      resolvedModDepths = [Number(modDepthCap.toFixed(modDepthDigits))];
    }
    resolvedModDepths = dedupeNumeric(resolvedModDepths, modDepthDigits);
  }

  let resolvedPhases: number[];
  if (twoPhaseRequested) {
    resolvedPhases = dedupeNumeric(
      Array.from(TWO_PHASE_DEFAULT_PHASES, (value) => Number(value)),
      2,
    );
  } else {
    resolvedPhases = safePhaseList.length ? safePhaseList : toNumberArray(baseSweep.phase_deg);
    if (!resolvedPhases.length && typeof measuredPhaseDeg === "number") {
      resolvedPhases = [Number(measuredPhaseDeg.toFixed(1))];
    }
    if (!resolvedPhases.length) {
      resolvedPhases = [0];
    }
    resolvedPhases = dedupeNumeric(resolvedPhases, 2);
  }

  let resolvedPump: DynamicCasimirSweepConfig["pump_freq_GHz"];
  if (pumpAuto) {
    resolvedPump = "auto";
  } else {
    let pumpValues = pumpList.length ? pumpList : toNumberArray(baseSweep.pump_freq_GHz);
    if (!pumpValues.length && typeof measuredPumpGHz === "number" && measuredPumpGHz > 0) {
      pumpValues = [Number(measuredPumpGHz.toFixed(pumpDigits))];
    }
    pumpValues = dedupeNumeric(pumpValues, pumpDigits);
    resolvedPump = pumpValues.length ? pumpValues : "auto";
  }

  const pumpCountForHardware =
    resolvedPump === "auto"
      ? 1
      : Array.isArray(resolvedPump)
      ? resolvedPump.length
      : 1;

  const safeHardwareProfile = {
    gapLimit: guardHardwareLimit(
      baseHardwareProfile.gapLimit,
      ACTIVE_SLEW_HARDWARE_GUARDS.gapLimit,
      resolvedGaps.length,
    ),
    modDepthLimit: guardHardwareLimit(
      baseHardwareProfile.modDepthLimit,
      ACTIVE_SLEW_HARDWARE_GUARDS.modDepthLimit,
      resolvedModDepths.length,
    ),
    phaseLimit: guardHardwareLimit(
      baseHardwareProfile.phaseLimit,
      ACTIVE_SLEW_HARDWARE_GUARDS.phaseLimit,
      resolvedPhases.length,
    ),
    pumpLimit: guardHardwareLimit(
      baseHardwareProfile.pumpLimit,
      ACTIVE_SLEW_HARDWARE_GUARDS.pumpLimit,
      pumpCountForHardware,
    ),
    pumpFreqLimit_GHz: guardPumpFreqLimit(
      baseHardwareProfile.pumpFreqLimit_GHz,
      ACTIVE_SLEW_HARDWARE_GUARDS.pumpFreqLimit_GHz,
    ),
    delayMs: Math.max(
      Number.isFinite(Number(baseHardwareProfile.delayMs))
        ? Number(baseHardwareProfile.delayMs)
        : 0,
      ACTIVE_SLEW_HARDWARE_GUARDS.delayMs,
    ),
  };

  const sanitizedSweep = {
    ...baseSweep,
    activeSlew: true,
    hardwareProfile: safeHardwareProfile,
    maxGain_dB: maxGainGuard,
  } as DynamicCasimirSweepConfig;

  sanitizedSweep.twoPhase = twoPhaseRequested ? true : baseSweep.twoPhase;
  sanitizedSweep.gaps_nm = resolvedGaps;
  sanitizedSweep.mod_depth_pct = resolvedModDepths;
  sanitizedSweep.phase_deg = resolvedPhases;
  sanitizedSweep.pump_freq_GHz = resolvedPump;

  const nextPayload: Partial<DynamicConfig> = {
    ...payload,
    sweep: sanitizedSweep,
  };

  if (resolvedModDepths.length === 1) {
    nextPayload.mod_depth_pct = resolvedModDepths[0];
  } else if (resolvedModDepths.length > 1) {
    nextPayload.mod_depth_pct = resolvedModDepths;
  }

  if (resolvedGaps.length === 1) nextPayload.gap_nm = resolvedGaps[0];
  else if (resolvedGaps.length > 1) nextPayload.gap_nm = resolvedGaps;

  if (resolvedPhases.length === 1) nextPayload.phase_deg = resolvedPhases[0];
  else if (resolvedPhases.length > 1) nextPayload.phase_deg = resolvedPhases;

  if (resolvedPump === "auto") nextPayload.pump_freq_GHz = "auto";
  else if (resolvedPump.length === 1) nextPayload.pump_freq_GHz = resolvedPump[0];
  else if (resolvedPump.length > 1) nextPayload.pump_freq_GHz = resolvedPump;

  return nextPayload;
};

const SWEEP_RESULTS_QUERY_KEY = ["helix:sweep:results"] as const;

const adaptVacuumRowToExtended = (row: VacuumGapSweepRow): SweepPointExtended => {
  const modulationPct = Number.isFinite(row.m) ? row.m * 100 : row.m ?? 0;
  const pumpFreq = Number.isFinite(row.Omega_GHz) ? row.Omega_GHz : 0;
  const gLinear = Number.isFinite(row.G) ? 10 ** (row.G / 10) : undefined;
  const abortReason =
    row.abortReason ??
    (Array.isArray(row.notes) && row.notes.length ? row.notes.join("; ") : null);
  return {
    gap_nm: row.d_nm,
    pumpFreq_GHz: pumpFreq,
    modulationDepth_pct: modulationPct,
    pumpPhase_deg: row.phi_deg,
    kappa_Hz: row.kappa_Hz,
    kappaEff_Hz: row.kappaEff_Hz,
    kappa_MHz: row.kappa_MHz,
    kappaEff_MHz: row.kappaEff_MHz,
    detune_MHz: row.detune_MHz,
    pumpRatio: row.pumpRatio,
    G_dB: row.G,
    G_lin: gLinear,
    QL: row.QL,
    QL_base: row.QL_base,
    stable: row.stable,
    status: row.status,
    plateau: row.plateau ? true : row.crest ?? false,
    abortReason,
    ts: Date.now(),
  };
};

const appendStreamRow = (row: SweepPointExtended) => {
  const prev =
    (queryClient.getQueryData(SWEEP_RESULTS_QUERY_KEY) as SweepPointExtended[] | undefined) ?? [];
  const next = [...prev, row].slice(-MAX_STREAM_SWEEP_ROWS);
  queryClient.setQueryData(SWEEP_RESULTS_QUERY_KEY, next);
};

export function useSweepResults() {
  return useQuery<SweepPointExtended[]>({
    queryKey: SWEEP_RESULTS_QUERY_KEY,
    queryFn: async () =>
      (queryClient.getQueryData(SWEEP_RESULTS_QUERY_KEY) as SweepPointExtended[] | undefined) ?? [],
    initialData: () =>
      (queryClient.getQueryData(SWEEP_RESULTS_QUERY_KEY) as SweepPointExtended[] | undefined) ?? [],
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

type SweepResultsMeta = {
  total: number;
  dropped: number;
};

const EMPTY_SWEEP_META: SweepResultsMeta = { total: 0, dropped: 0 };

const trimSweepRows = (rows?: VacuumGapSweepRow[] | null): VacuumGapSweepRow[] => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (rows.length <= MAX_SWEEP_ROWS) return rows;
  return rows.slice(-MAX_SWEEP_ROWS);
};

const deriveSweepMeta = (
  state: Pick<
    EnergyPipelineState,
    "vacuumGapSweepRowsTotal" | "vacuumGapSweepRowsDropped" | "vacuumGapSweepResults"
  > | undefined,
  visibleCount: number,
): SweepResultsMeta => {
  if (!state) {
    return visibleCount > 0 ? { total: visibleCount, dropped: 0 } : EMPTY_SWEEP_META;
  }
  const total =
    typeof state.vacuumGapSweepRowsTotal === "number"
      ? state.vacuumGapSweepRowsTotal
      : visibleCount;
  const dropped =
    typeof state.vacuumGapSweepRowsDropped === "number"
      ? Math.max(0, state.vacuumGapSweepRowsDropped)
      : Math.max(0, total - visibleCount);
  return { total, dropped };
};

// Server emits per-tile stress–energy samples for φ = G · ρ
export type TileDatum = {
  pos: [number, number, number];
  t00: number;
};

// Chat message interface for HELIX-CORE
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// System metrics interface (add tile arrays for φ compute back-compat)
export interface SystemMetrics {
  totalTiles: number;
  activeTiles: number;
  currentMode?: string;
  tileData?: TileDatum[]; // current server shape
  tiles?: TileDatum[];    // legacy shape
  hull?: {
    Lx_m?: number;
    Ly_m?: number;
    Lz_m?: number;
  };
  axes_m?: [number, number, number];
  // Optional LC/timing structure from backend metrics, if available
  lightCrossing?: {
    tauLC_ms?: number;        // preferred
    tau_ms?: number;          // alias
    tauLC_s?: number;         // alt units
    sectorPeriod_ms?: number; // dwell per sector
    burst_ms?: number;
    dwell_ms?: number;
    sectorsTotal?: number;
    activeSectors?: number;
  };
  env?: {
    atmDensity_kg_m3?: number | null;
    altitude_m?: number | null;
  };
}

// Helix metrics interface (some callers read directly from here)
export interface HelixMetrics {
  totalTiles: number;
  activeTiles: number;
  activeFraction?: number;
  data?: any;
  tileData?: TileDatum[];
  tiles?: TileDatum[];
  // lightCrossing may be a simple numeric or the structured SystemMetrics lighting object
  lightCrossing?: SystemMetrics['lightCrossing'] | number;
  env?: SystemMetrics['env'];
}

// Shared physics constants from pipeline backend
export const PIPE_CONST = {
  TOTAL_SECTORS: PROMOTED_WARP_PROFILE.sectorCount,
  BURST_DUTY_LOCAL: PROMOTED_WARP_PROFILE.dutyCycle,
  Q_BURST: PROMOTED_WARP_PROFILE.qCavity
};

// Shared smart formatter (W→kW→MW) for UI labels
export const fmtPowerUnitFromW = (watts?: number) => {
  const x = Number(watts);
  if (!Number.isFinite(x)) return '—';
  if (x >= 1e6) return `${(x/1e6).toFixed(1)} MW`;
  if (x >= 1e3) return `${(x/1e3).toFixed(1)} kW`;
  return `${x.toFixed(1)} W`;
};

// Hook to get current pipeline state
export function useEnergyPipeline(options?: {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: number;
}) {
  const selectPipelineState = React.useCallback(
    (raw: EnergyPipelineSnapshot): EnergyPipelineSnapshot => {
      if (!raw) return raw;
      let snapshot: EnergyPipelineSnapshot = raw;

      const claimTier =
        (snapshot as any).claim_tier ??
        (snapshot as any).claimTier;
      const provenanceClass =
        (snapshot as any).provenance_class ??
        (snapshot as any).provenanceClass;
      if (claimTier != null || provenanceClass != null) {
        snapshot = {
          ...snapshot,
          ...(claimTier != null ? { claim_tier: claimTier, claimTier } : {}),
          ...(provenanceClass != null
            ? { provenance_class: provenanceClass, provenanceClass }
            : {}),
        };
      }

      // Enforce server-provided γ_VdB green-band guard so UI solvers cannot wander outside it
      const vdbGuard =
        (snapshot as any).gammaVanDenBroeckGuard ??
        (snapshot as any).gammaVanDenBroeck_guard;
      if (vdbGuard && Number.isFinite((vdbGuard as any).limit)) {
        const limit = Number((vdbGuard as any).limit);
        const requested = Number(
          (vdbGuard as any).requested ?? snapshot.gammaVanDenBroeck,
        );
        const boundedGamma = Math.min(
          snapshot.gammaVanDenBroeck ?? limit,
          limit,
        );
        const boundedMass = Number.isFinite(snapshot.gammaVanDenBroeck_mass)
          ? Math.min(snapshot.gammaVanDenBroeck_mass as number, limit)
          : undefined;
        snapshot = {
          ...snapshot,
          gammaVanDenBroeck: boundedGamma,
          gammaVanDenBroeck_mass: boundedMass ?? boundedGamma,
        };
        (snapshot as any).gammaVanDenBroeck_greenBand = (vdbGuard as any).greenBand;
        (snapshot as any).gammaVanDenBroeck_nonAdmissible = requested > limit;
      }

      // Clamp hull dims/areas to client guardrails and ensure ellipsoid axes are present for renderers.
      const hullRaw = (snapshot as any).hull as any;
      if (hullRaw && typeof hullRaw === "object") {
        const clampedDims = clampHullDims(hullRaw);
        const hasDims =
          clampedDims.Lx_m != null ||
          clampedDims.Ly_m != null ||
          clampedDims.Lz_m != null;
        const axes = {
          a: clampHullAxis(hullRaw.a ?? (clampedDims.Lx_m != null ? clampedDims.Lx_m * 0.5 : undefined)),
          b: clampHullAxis(hullRaw.b ?? (clampedDims.Ly_m != null ? clampedDims.Ly_m * 0.5 : undefined)),
          c: clampHullAxis(hullRaw.c ?? (clampedDims.Lz_m != null ? clampedDims.Lz_m * 0.5 : undefined)),
        };
        const hullNext: any = { ...hullRaw };
        if (hasDims) {
          if (clampedDims.Lx_m != null) hullNext.Lx_m = clampedDims.Lx_m;
          if (clampedDims.Ly_m != null) hullNext.Ly_m = clampedDims.Ly_m;
          if (clampedDims.Lz_m != null) hullNext.Lz_m = clampedDims.Lz_m;
        }
        if (axes.a != null) hullNext.a = axes.a;
        if (axes.b != null) hullNext.b = axes.b;
        if (axes.c != null) hullNext.c = axes.c;
        snapshot = { ...snapshot, hull: hullNext };
      }

      const hullArea = clampHullArea((snapshot as any).hullArea_m2);
      const tilesArea = clampHullArea((snapshot as any)?.tiles?.hullArea_m2);
      if (hullArea != null || tilesArea != null) {
        snapshot = {
          ...snapshot,
          ...(hullArea != null ? { hullArea_m2: hullArea } : {}),
          tiles:
            tilesArea != null || snapshot.tiles
              ? { ...(snapshot.tiles ?? {}), ...(tilesArea != null ? { hullArea_m2: tilesArea } : {}) }
              : snapshot.tiles,
        };
      }

      const rows = Array.isArray(snapshot.vacuumGapSweepResults)
        ? snapshot.vacuumGapSweepResults
        : [];
      const visibleCount = rows.length;
      const totalFromServer =
        typeof snapshot.vacuumGapSweepRowsTotal === "number"
          ? snapshot.vacuumGapSweepRowsTotal
          : visibleCount;
      const total = Math.max(totalFromServer, visibleCount);

      if (visibleCount > MAX_SWEEP_ROWS) {
        const trimmed = rows.slice(-MAX_SWEEP_ROWS);
        return {
          ...snapshot,
          vacuumGapSweepResults: trimmed,
          vacuumGapSweepRowsTotal: total,
          vacuumGapSweepRowsDropped: total - trimmed.length,
        };
      }

      const dropped =
        typeof snapshot.vacuumGapSweepRowsDropped === "number"
          ? Math.max(0, snapshot.vacuumGapSweepRowsDropped)
          : Math.max(0, total - visibleCount);

      if (
        snapshot.vacuumGapSweepRowsTotal === total &&
        snapshot.vacuumGapSweepRowsDropped === dropped
      ) {
        return snapshot;
      }

      return {
        ...snapshot,
        vacuumGapSweepRowsTotal: total,
        vacuumGapSweepRowsDropped: dropped,
      };
    },
    [],
  );

  const query = useQuery<EnergyPipelineSnapshot>({
    queryKey: ['/api/helix/pipeline'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/helix/pipeline');
      const json = await response.json();
      return json as EnergyPipelineSnapshot;
    },
    select: selectPipelineState,
    // Keep dev/browser load low when many tabs are open
    refetchIntervalInBackground: false, // stop polling when tab is hidden
    gcTime: 5 * 60 * 1000, // let cache be collected after 5 minutes
    refetchInterval: (queryInstance) => {
      if (typeof options?.refetchInterval === "number") {
        return options.refetchInterval;
      }
      const snapshot = queryInstance.state?.data as EnergyPipelineSnapshot | undefined;
      const sweepActive = !!snapshot?.sweep?.active;
      // Relax polling to reduce long-lived dev socket pressure; sweep gets modestly faster cadence.
      return sweepActive ? 1200 : 2500;
    },
    staleTime: options?.staleTime ?? 5000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });

  const devMocksEnabled = isFlagEnabled("HELIX_DEV_MOCKS", false);

  React.useEffect(() => {
    if (issuedInitialMarginIntent) return;
    if (Date.now() < qiIntentRetryAfter) return;
    if (devMocksEnabled) return;
    if (!query.isSuccess) return;

    issuedInitialMarginIntent = true;
    let cancelled = false;
    (async () => {
      try {
        await apiRequest("POST", "/api/qi/setpoint", {
          intent: "increase_margin",
          aggressiveness: 0.7,
        });
        qiIntentRetryAfter = 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isNotFound = message.includes("404") || message.toLowerCase().includes("api_not_found");
        const isGateway = isGatewayError(err);
        const shouldDisable = isNotFound || isGateway;
        const shortMessage = message.split("\n")[0]?.slice(0, 220) ?? "unknown_error";
        if (isGateway) {
          console.warn("[HELIX] Initial QI margin intent deferred (gateway/backoff):", shortMessage);
        } else {
          console.warn("[HELIX] Failed to issue initial QI margin intent:", shortMessage);
        }
        if (!cancelled) {
          issuedInitialMarginIntent = shouldDisable;
          if (isGateway) {
            qiIntentRetryAfter = Date.now() + QI_INTENT_GATEWAY_BACKOFF_MS;
            issuedInitialMarginIntent = false;
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devMocksEnabled, query.isSuccess, query.dataUpdatedAt]);

  const [sweepResults, setSweepResults] = React.useState<VacuumGapSweepRow[]>([]);
  const [sweepMeta, setSweepMeta] = React.useState<SweepResultsMeta>(EMPTY_SWEEP_META);

  React.useEffect(() => {
    const state = query.data;
    if (!state) return;
    const rows = Array.isArray(state.vacuumGapSweepResults)
      ? state.vacuumGapSweepResults
      : [];
    setSweepResults(rows);
    setSweepMeta(deriveSweepMeta(state, rows.length));
    if (rows.length) {
      const existing =
        (queryClient.getQueryData(SWEEP_RESULTS_QUERY_KEY) as SweepPointExtended[] | undefined) ??
        [];
      if (existing.length === 0) {
        queryClient.setQueryData(
          SWEEP_RESULTS_QUERY_KEY,
          rows.map(adaptVacuumRowToExtended).slice(-MAX_STREAM_SWEEP_ROWS),
        );
      }
    }
  }, [query.data]);

  React.useEffect(() => {
    const ids = [
      subscribe("vacuumGapSweepResults", (rows: VacuumGapSweepRow[] | undefined) => {
        if (!Array.isArray(rows)) return;
        const trimmed = trimSweepRows(rows);
        setSweepResults(trimmed);
        setSweepMeta({
          total: rows.length,
          dropped: Math.max(0, rows.length - trimmed.length),
        });
        queryClient.setQueryData(
          SWEEP_RESULTS_QUERY_KEY,
          trimmed.map(adaptVacuumRowToExtended).slice(-MAX_STREAM_SWEEP_ROWS),
        );
      }),
      subscribe("vacuumGapSweepStep", (row: VacuumGapSweepRow | undefined) => {
        if (!row) return;
        setSweepResults((prev) => {
          if (prev.length >= MAX_SWEEP_ROWS) {
            const next = prev.slice(-(MAX_SWEEP_ROWS - 1));
            next.push(row);
            return next;
          }
          return [...prev, row];
        });
        setSweepMeta((prev) => {
          const total = prev.total + 1;
          const dropped = Math.max(0, total - MAX_SWEEP_ROWS);
          return { total, dropped };
        });
        appendStreamRow(adaptVacuumRowToExtended(row));
      }),
      subscribe("parametricSweepStep", (row: SweepPointExtended | undefined) => {
        if (!row) return;
        appendStreamRow(row);
      }),
    ];
    return () => {
      ids.forEach((id) => unsubscribe(id));
    };
  }, []);

  const publishSweepControls = React.useCallback(async (payload: Partial<DynamicConfig>) => {
    const guardedPayload = guardActiveSlewPayload(payload, {
      pipeline: query.data,
      sweepResults,
    });
    try {
      await apiRequest('POST', '/api/helix/pipeline/update', { dynamicConfig: guardedPayload });
      startTransition(() => {
        queryClient.invalidateQueries({ predicate: q =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === '/api/helix/pipeline' || q.queryKey[0] === '/api/helix/metrics')
        });
      });
    } catch (err) {
      console.error("[HELIX] Failed to publish sweep controls:", err);
    }
  }, [query.data, sweepResults]);

  return {
    ...query,
    sweepResults,
    sweepResultsTotal: sweepMeta.total,
    sweepResultsDropped: sweepMeta.dropped,
    sweepResultsLimit: MAX_SWEEP_ROWS,
    sweepResultsOverLimit: sweepMeta.total > MAX_SWEEP_ROWS,
    publishSweepControls,
  };
}

// Hook to update pipeline parameters
export function useUpdatePipeline() {
  return useMutation({
    mutationFn: async (params: Partial<EnergyPipelineState> & { fallbackMode?: WarpFallbackMode }) => {
      const response = await apiRequest('POST', '/api/helix/pipeline/update', params);
      const payload = await response.json().catch(() => null);
      if (response.status === 422) {
        const err = new Error((payload as any)?.error ?? "Pipeline update blocked");
        (err as any).payload = payload;
        throw err;
      }
      if (!response.ok) {
        const err = new Error((payload as any)?.error ?? response.statusText);
        (err as any).payload = payload;
        throw err;
      }
      const fallback = (payload as any)?.geometryFallback;
      if (fallback?.applied || (fallback && fallback.mode === "warn")) {
        console.warn("[HELIX] pipeline update fallback", fallback);
      }
      return payload;
    },
    onSuccess: () => {
      startTransition(() => {
        queryClient.invalidateQueries({ predicate: q =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === '/api/helix/pipeline' || q.queryKey[0] === '/api/helix/metrics')
        });
      });
    }
  });
}

// Hook to switch operational mode
export function useSwitchMode() {
  return useMutation({
    mutationFn: async (mode: EnergyPipelineState['currentMode']) => {
      const requireOk = async (response: Response, label: string) => {
        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new Error(`${label} failed: ${detail || response.statusText}`);
        }
      };

      // 1) switch server mode
      const resMode = await apiRequest('POST', '/api/helix/pipeline/mode', { mode });
      await requireOk(resMode, 'Mode switch');
      const data = await resMode.json();

      // 2) immediately push mode-specific knobs so duty/strobing/qSpoil are in sync
      const cfg = MODE_CONFIGS[mode];
      if (cfg) {
        const resUpdate = await apiRequest('POST', '/api/helix/pipeline/update', {
          dutyCycle: cfg.dutyCycle,
          sectorStrobing: cfg.sectorStrobing,
          qSpoilingFactor: cfg.qSpoilingFactor,
          sectorsConcurrent: (cfg as any).sectorsConcurrent ?? (cfg as any).concurrentSectors,
          localBurstFrac: (cfg as any).localBurstFrac ?? cfg.dutyCycle,
          sectorsTotal: (cfg as any).sectorsTotal,
        });
        await requireOk(resUpdate, 'Mode knob sync');
      }
      const sectorEvent = {
        ts: Date.now(),
        requestedMode: mode,
        appliedMode:
          typeof (data as any)?.mode === "string" ? ((data as any).mode as string) : mode,
        fallbackApplied: Boolean((data as any)?.fallbackApplied),
        plannerMode:
          typeof (data as any)?.preflight?.plannerMode === "string"
            ? ((data as any).preflight.plannerMode as string)
            : null,
        firstFail:
          typeof (data as any)?.preflight?.firstFail === "string"
            ? ((data as any).preflight.firstFail as string)
            : null,
        constraints:
          (data as any)?.preflight?.constraints && typeof (data as any).preflight.constraints === "object"
            ? (data as any).preflight.constraints
            : null,
        observerGrid:
          (data as any)?.preflight?.observerGrid && typeof (data as any).preflight.observerGrid === "object"
            ? (data as any).preflight.observerGrid
            : null,
      };
      publish("warp:sector-control:plan", sectorEvent);
      publish("warp:reload", {
        reason: "mode-switch-local",
        mode,
        requestedMode: sectorEvent.requestedMode,
        appliedMode: sectorEvent.appliedMode,
        preflight: {
          plannerMode: sectorEvent.plannerMode,
          firstFail: sectorEvent.firstFail,
          fallbackApplied: sectorEvent.fallbackApplied,
        },
        ts: Date.now(),
      });
      return data;
    },
    onSuccess: (data, mode) => {
      startTransition(() => {
        queryClient.invalidateQueries({ predicate: q =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === '/api/helix/pipeline' || q.queryKey[0] === '/api/helix/metrics')
        });
      });
      
      // Let visualizers/inspectors hard-refresh
      publish("helix:pipeline:updated", { mode });
      
      // Trigger Luma whisper for mode changes
      const wisdom = getModeWisdom(mode);
      publish("luma:whisper", { text: wisdom });
    },
    onError: () => {
      startTransition(() => {
        queryClient.invalidateQueries({ predicate: q =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === '/api/helix/pipeline' || q.queryKey[0] === '/api/helix/metrics')
        });
      });
    }
  });
}

// --- Types
export type ModeKey = "standby" | "hover" | "taxi" | "nearzero" | "cruise" | "emergency";

export type ModeConfig = {
  name: string;
  color: string;
  description?: string;
  hint?: string;

  // UI duty knob (not FR-averaged)
  dutyCycle: number;

  // 🔁 NEW: how many sectors exist vs. are live at once
  sectorsTotal: number;        // grid partitions across the hull
  sectorsConcurrent: number;   // e.g., 1 in Hover/Cruise, maybe 4–8 in Emergency

  // 🔦 NEW: per-sector ON window (fraction of dwell, 0..1)
  localBurstFrac: number;      // mode-specific local burst fraction

  // 🎯 Optional: what the mode is aiming to produce (display only)
  powerTarget_W?: number;

  // 🧹 Legacy back-compat (many places still reference this)
  // Keep it equal to sectorsConcurrent so older code "just works".
  sectorStrobing?: number;

  // Legacy fields for backward compatibility
  qSpoilingFactor?: number;

  envCaps?: {
    rho_pad: number;
    v_pad: number;
    rho_strat: number;
    v_strat: number;
  };
  guards?: {
    q: { amber: number; red: number };
    zeta: { amber: number; red: number };
    stroke_pm: { amber: number; red: number };
    TS: { amber: number; red: number };
  };
  actionGuards?: { T_guard_amber_s: number; T_guard_red_s: number };
};

// Mode configurations for UI display (synchronized with backend)
const GUARDED_SWEEP_DEFAULTS = {
  sectorsTotal: PROMOTED_WARP_PROFILE.sectorCount,
  sectorsConcurrent: PROMOTED_WARP_PROFILE.concurrentSectors,
  localBurstFrac: PROMOTED_WARP_PROFILE.dutyCycle,
  sectorStrobing: PROMOTED_WARP_PROFILE.concurrentSectors,
} as const;

export const MODE_CONFIGS: Record<ModeKey, ModeConfig> = {
  standby: {
    name: "Standby",
    color: "text-slate-300",
    description: "Field idle / safed",
    ...GUARDED_SWEEP_DEFAULTS,
    dutyCycle: 0.0,
    localBurstFrac: 0.0,         // override safe sweep defaults so RF stays muted
    powerTarget_W: 0,
    qSpoilingFactor: 0.1,
  },
  hover: {
    name: "Hover",
    color: "text-sky-300",
    description: "Gentle bulge / training profile",
    ...GUARDED_SWEEP_DEFAULTS,
    dutyCycle: PROMOTED_WARP_PROFILE.dutyCycle,
    powerTarget_W: 83.3e6,       // match your display target
    qSpoilingFactor: PROMOTED_WARP_PROFILE.qSpoilingFactor,
  },
  taxi: {
    name: "Taxi",
    color: "text-sky-300",
    description: "Ground ops posture; translation suppressed",
    ...GUARDED_SWEEP_DEFAULTS,
    dutyCycle: PROMOTED_WARP_PROFILE.dutyCycle,
    powerTarget_W: 83.3e6,       // inherits hover power budget
    qSpoilingFactor: PROMOTED_WARP_PROFILE.qSpoilingFactor,
  },
  nearzero: {
    name: "Near-Zero",
    color: "text-amber-300",
    description: "Zero-β hover-climb regime",
    hint: "Zero-β hover-climb",
    ...GUARDED_SWEEP_DEFAULTS,
    dutyCycle: PROMOTED_WARP_PROFILE.dutyCycle,
    localBurstFrac: PROMOTED_WARP_PROFILE.dutyCycle,
    powerTarget_W: 5e6,
    qSpoilingFactor: PROMOTED_WARP_PROFILE.qSpoilingFactor,
    envCaps: {
      rho_pad: 0.1,
      v_pad: 30,
      rho_strat: 1e-4,
      v_strat: 100,
    },
    guards: {
      q: { amber: 0.9, red: 1.0 },
      zeta: { amber: 0.95, red: 1.0 },
      stroke_pm: { amber: 45, red: 50 },
      TS: { amber: 100, red: 50 },
    },
    actionGuards: { T_guard_amber_s: 120, T_guard_red_s: 30 },
  },
  cruise: {
    name: "Cruise",
    color: "text-cyan-300",
    description: "Coherent sector sweep; FR duty mostly from averaging",
    ...GUARDED_SWEEP_DEFAULTS,
    dutyCycle: PROMOTED_WARP_PROFILE.dutyCycle,
    powerTarget_W: 40e6,
    qSpoilingFactor: PROMOTED_WARP_PROFILE.qSpoilingFactor,
  },
  emergency: {
    name: "Emergency",
    color: "text-rose-300",
    description: "Max response window; fewer averages",
    dutyCycle: 0.50,
    sectorsTotal: PROMOTED_WARP_PROFILE.sectorCount,
    sectorsConcurrent: 8,        // aligned with Mk1 emergency posture
    localBurstFrac: 0.50,        // emergency burst fraction per MODE_POLICY
    powerTarget_W: 297.5e6,
    sectorStrobing: 8,
    qSpoilingFactor: 1,
  },
};

// Optional: helper if other components want to apply mode knobs explicitly
export const modeKnobsFor = (mode: EnergyPipelineState['currentMode']) => {
  const m = MODE_CONFIGS[mode];
  return m ? {
    dutyCycle: m.dutyCycle,
    sectorStrobing: m.sectorStrobing,
    qSpoilingFactor: m.qSpoilingFactor,
  } : undefined;
};

