import { apiRequest } from "@/lib/queryClient";
import type { ProofPack, ProofValue } from "@shared/schema";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { NHM2_PROOF_PACK_STAGE_REQUIREMENTS } from "@shared/nhm2-solve-state";

type GrInvariantStats = {
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

type GrInvariantStatsSet = {
  kretschmann?: GrInvariantStats;
  ricci4?: GrInvariantStats;
};

export const PROOF_PACK_STAGE_REQUIREMENTS = NHM2_PROOF_PACK_STAGE_REQUIREMENTS;

export async function fetchProofPack(signal?: AbortSignal): Promise<ProofPack> {
  const res = await apiRequest("GET", "/api/helix/pipeline/proofs", undefined, signal);
  const json = await res.json();
  if (!json || json.kind !== "proof-pack") {
    throw new Error("Invalid proof-pack payload");
  }
  return json as ProofPack;
}

export const getProofValue = (
  pack: ProofPack | null | undefined,
  key: string,
): ProofValue | undefined => pack?.values?.[key];

export const readProofNumber = (
  pack: ProofPack | null | undefined,
  key: string,
): number | null => {
  const value = pack?.values?.[key]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const readProofBoolean = (
  pack: ProofPack | null | undefined,
  key: string,
): boolean | null => {
  const value = pack?.values?.[key]?.value;
  return typeof value === "boolean" ? value : null;
};

export const readProofString = (
  pack: ProofPack | null | undefined,
  key: string,
): string | null => {
  const value = pack?.values?.[key]?.value;
  return typeof value === "string" ? value : null;
};

export const isStrictProofPack = (pack: ProofPack | null | undefined): boolean => {
  const thetaStrict = readProofBoolean(pack, "theta_strict_mode");
  const qiStrict = readProofBoolean(pack, "qi_strict_mode");
  return thetaStrict === true || qiStrict === true;
};

const STRICT_TELEMETRY_KEYS = new Set<string>([
  "theta_pipeline_raw",
  "theta_pipeline_cal",
  "theta_pipeline_proxy",
  "mechanical_safety_min",
  "mechanical_note",
  "gr_cl3_rho_delta_pipeline_mean_telemetry",
]);

export const isStrictTelemetryKey = (key: string): boolean =>
  STRICT_TELEMETRY_KEYS.has(key);

export const hasStrictProxy = (
  pack: ProofPack | null | undefined,
  keys?: string[],
): boolean => {
  if (!pack) return true;
  const values = pack.values ?? {};
  const strictKeys = keys ?? Object.keys(values);
  return strictKeys.some((key) => {
    if (STRICT_TELEMETRY_KEYS.has(key)) return false;
    return values[key]?.proxy === true;
  });
};

const isStrictBlocked = (
  pack: ProofPack | null | undefined,
  entry: ProofValue | undefined,
  strictOverride?: boolean,
): boolean => {
  if (!entry) return false;
  const strict =
    typeof strictOverride === "boolean"
      ? strictOverride
      : isStrictProofPack(pack);
  return strict && entry.proxy === true;
};

export const isStrictProxy = (
  pack: ProofPack | null | undefined,
  key: string,
  strictOverride?: boolean,
): boolean => {
  const entry = getProofValue(pack, key);
  return isStrictBlocked(pack, entry, strictOverride);
};

export const readProofNumberStrict = (
  pack: ProofPack | null | undefined,
  key: string,
  strictOverride?: boolean,
): number | null => {
  const entry = getProofValue(pack, key);
  if (isStrictBlocked(pack, entry, strictOverride)) return null;
  const value = entry?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const readProofBooleanStrict = (
  pack: ProofPack | null | undefined,
  key: string,
  strictOverride?: boolean,
): boolean | null => {
  const entry = getProofValue(pack, key);
  if (isStrictBlocked(pack, entry, strictOverride)) return null;
  const value = entry?.value;
  return typeof value === "boolean" ? value : null;
};

export const readProofStringStrict = (
  pack: ProofPack | null | undefined,
  key: string,
  strictOverride?: boolean,
): string | null => {
  const entry = getProofValue(pack, key);
  if (isStrictBlocked(pack, entry, strictOverride)) return null;
  const value = entry?.value;
  return typeof value === "string" ? value : null;
};

const readInvariantStats = (
  pack: ProofPack | null | undefined,
  prefix: string,
): GrInvariantStats | null => {
  const min = readProofNumber(pack, `${prefix}_min`);
  const max = readProofNumber(pack, `${prefix}_max`);
  const mean = readProofNumber(pack, `${prefix}_mean`);
  const p98 = readProofNumber(pack, `${prefix}_p98`);
  const sampleCount = readProofNumber(pack, `${prefix}_sample_count`);
  const abs = readProofBoolean(pack, `${prefix}_abs`);
  const wallFraction = readProofNumber(pack, `${prefix}_wall_fraction`);
  const bandFraction = readProofNumber(pack, `${prefix}_band_fraction`);
  const threshold = readProofNumber(pack, `${prefix}_threshold`);
  const bandMin = readProofNumber(pack, `${prefix}_band_min`);
  const bandMax = readProofNumber(pack, `${prefix}_band_max`);

  if (
    min == null ||
    max == null ||
    mean == null ||
    p98 == null ||
    sampleCount == null ||
    abs == null ||
    wallFraction == null ||
    bandFraction == null ||
    threshold == null ||
    bandMin == null ||
    bandMax == null
  ) {
    return null;
  }

  return {
    min,
    max,
    mean,
    p98,
    sampleCount,
    abs,
    wallFraction,
    bandFraction,
    threshold,
    bandMin,
    bandMax,
  };
};

const readInvariantStatsSet = (
  pack: ProofPack | null | undefined,
): GrInvariantStatsSet | null => {
  const kretschmann = readInvariantStats(pack, "gr_kretschmann");
  const ricci4 = readInvariantStats(pack, "gr_ricci4");
  if (!kretschmann && !ricci4) return null;
  return { ...(kretschmann ? { kretschmann } : {}), ...(ricci4 ? { ricci4 } : {}) };
};

export const mapProofPackToPipeline = (
  pack: ProofPack | null | undefined,
): Partial<EnergyPipelineState> | null => {
  if (!pack) return null;
  const hull = {
    Lx_m: readProofNumber(pack, "hull_Lx_m") ?? undefined,
    Ly_m: readProofNumber(pack, "hull_Ly_m") ?? undefined,
    Lz_m: readProofNumber(pack, "hull_Lz_m") ?? undefined,
    wallThickness_m: readProofNumber(pack, "hull_wall_m") ?? undefined,
  };
  const numOrNaN = (value: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
  const gapRequested = readProofNumber(pack, "mechanical_gap_req_nm");
  const gapEffective = readProofNumber(pack, "mechanical_gap_eff_nm");
  const maxStroke = readProofNumber(pack, "mechanical_max_stroke_pm");
  const hasMechanical =
    gapRequested != null ||
    gapEffective != null ||
    maxStroke != null ||
    readProofNumber(pack, "mechanical_margin_Pa") != null;
  const mechanical = hasMechanical
    ? {
        requestedGap_nm: numOrNaN(gapRequested),
        requestedStroke_pm: Number.NaN,
        recommendedGap_nm: numOrNaN(gapEffective ?? gapRequested),
        minGap_nm: numOrNaN(gapEffective ?? gapRequested),
        maxStroke_pm: numOrNaN(maxStroke),
        casimirPressure_Pa: numOrNaN(readProofNumber(pack, "mechanical_casimir_pressure_Pa")),
        electrostaticPressure_Pa: numOrNaN(
          readProofNumber(pack, "mechanical_electrostatic_pressure_Pa"),
        ),
        restoringPressure_Pa: numOrNaN(readProofNumber(pack, "mechanical_restoring_pressure_Pa")),
        roughnessGuard_nm: Number.NaN,
        margin_Pa: numOrNaN(readProofNumber(pack, "mechanical_margin_Pa")),
        feasible: readProofBoolean(pack, "mechanical_feasible") ?? false,
        strokeFeasible: readProofBoolean(pack, "mechanical_stroke_feasible") ?? false,
        constrainedGap_nm: gapEffective ?? undefined,
        safetyFactorMin: readProofNumber(pack, "mechanical_safety_min") ?? undefined,
        mechSafetyFactor: readProofNumber(pack, "mechanical_safety_factor") ?? undefined,
        loadPressure_Pa: readProofNumber(pack, "mechanical_load_pressure_Pa") ?? undefined,
        sigmaAllow_Pa: readProofNumber(pack, "mechanical_sigma_allow_Pa") ?? undefined,
        safetyFeasible: readProofBoolean(pack, "mechanical_safety_feasible") ?? undefined,
      }
    : undefined;
  const vdbLimit = readProofNumber(pack, "vdb_limit");
  const gammaVanDenBroeckGuard =
    vdbLimit != null ||
    readProofNumber(pack, "vdb_pocket_radius_m") != null ||
    readProofNumber(pack, "vdb_pocket_thickness_m") != null
      ? {
          limit: numOrNaN(vdbLimit),
          greenBand: {
            min: 1,
            max: Number.isFinite(vdbLimit as number) ? (vdbLimit as number) : 1,
          },
          pocketRadius_m: numOrNaN(readProofNumber(pack, "vdb_pocket_radius_m")),
          pocketThickness_m: numOrNaN(readProofNumber(pack, "vdb_pocket_thickness_m")),
          planckMargin: numOrNaN(readProofNumber(pack, "vdb_planck_margin")),
          admissible: readProofBoolean(pack, "vdb_admissible") ?? false,
          reason: readProofString(pack, "vdb_reason") ?? "",
          requested: readProofNumber(pack, "gamma_vdb_requested") ?? undefined,
        }
      : undefined;
  const gammaChain = {
    geo_cubed: readProofNumber(pack, "gamma_geo_cubed") ?? undefined,
    qGain: readProofNumber(pack, "q_gain") ?? undefined,
    pocketCompression: readProofNumber(pack, "gamma_vdb") ?? undefined,
    dutyEffective: readProofNumber(pack, "duty_effective") ?? undefined,
    qSpoiling: readProofNumber(pack, "q_spoil") ?? undefined,
    note: readProofString(pack, "gamma_chain_note") ?? undefined,
  };
  const bubble = {
    R: readProofNumber(pack, "bubble_R_m") ?? undefined,
    sigma: readProofNumber(pack, "bubble_sigma") ?? undefined,
    beta: readProofNumber(pack, "bubble_beta") ?? undefined,
  };
  const thetaRaw = readProofNumber(pack, "theta_pipeline_raw");
  const thetaCal = readProofNumber(pack, "theta_pipeline_cal");
  const thetaGeom = readProofNumber(pack, "theta_geom");
  const thetaAudit = readProofNumber(pack, "theta_audit");
  const thetaProxy = readProofNumber(pack, "theta_pipeline_proxy");
  const thetaGeomEntry = getProofValue(pack, "theta_geom");
  const thetaAuditEntry = getProofValue(pack, "theta_audit");
  const thetaProxyEntry = getProofValue(pack, "theta_pipeline_proxy");
  const thetaCalEntry = getProofValue(pack, "theta_pipeline_cal");
  const thetaRawEntry = getProofValue(pack, "theta_pipeline_raw");
  const thetaGeomSource = thetaGeomEntry?.source;
  const thetaGeomProxy = thetaGeomEntry?.proxy ?? false;
  const thetaAuditSource = thetaAuditEntry?.source;
  const thetaProxySource =
    thetaProxyEntry?.source ?? thetaCalEntry?.source ?? thetaRawEntry?.source;
  const thetaSource = thetaGeomSource ?? thetaProxySource;
  const thetaMetricDerived = readProofBoolean(pack, "theta_metric_derived");
  const thetaMetricSource = readProofString(pack, "theta_metric_source");
  const thetaMetricReason = readProofString(pack, "theta_metric_reason");
  const thetaStrictMode = readProofBoolean(pack, "theta_strict_mode");
  const thetaStrictOk = readProofBoolean(pack, "theta_strict_ok");
  const thetaStrictReason = readProofString(pack, "theta_strict_reason");
  const qiStrictMode = readProofBoolean(pack, "qi_strict_mode");
  const qiStrictOk = readProofBoolean(pack, "qi_strict_ok");
  const qiStrictReason = readProofString(pack, "qi_strict_reason");
  const qiRhoSource = readProofString(pack, "qi_rho_source");
  const qiMetricDerived = readProofBoolean(pack, "qi_metric_derived");
  const qiMetricSource = readProofString(pack, "qi_metric_source");
  const qiMetricReason = readProofString(pack, "qi_metric_reason");
  const tsMetricDerived = readProofBoolean(pack, "ts_metric_derived");
  const tsMetricSource = readProofString(pack, "ts_metric_source");
  const tsMetricReason = readProofString(pack, "ts_metric_reason");
  const rhoConstraintMean = readProofNumber(pack, "gr_rho_constraint_mean");
  const rhoConstraintRms = readProofNumber(pack, "gr_rho_constraint_rms");
  const rhoConstraintMaxAbs = readProofNumber(pack, "gr_rho_constraint_max_abs");
  const rhoConstraintSource = getProofValue(pack, "gr_rho_constraint_mean")?.source;
  const metricChartLabel = readProofString(pack, "metric_chart_label") ?? undefined;
  const metricAdapterFamily = readProofString(pack, "metric_adapter_family") ?? undefined;
  const metricT00Observer = readProofString(pack, "metric_t00_observer") ?? undefined;
  const metricT00Normalization = readProofString(pack, "metric_t00_normalization") ?? undefined;
  const metricT00UnitSystem = readProofString(pack, "metric_t00_unit_system") ?? undefined;
  const congruenceMissingParts = readProofString(pack, "congruence_missing_parts") ?? undefined;
  const congruenceMissingCount = readProofNumber(pack, "congruence_missing_count") ?? undefined;
  const congruenceMissingReason = readProofString(pack, "congruence_missing_reason") ?? undefined;
  const curvatureMetaSource = readProofString(pack, "curvature_meta_source") ?? undefined;
  const curvatureMetaCongruence =
    readProofString(pack, "curvature_meta_congruence") ?? undefined;
  const curvatureMetaProxy = readProofBoolean(pack, "curvature_meta_proxy") ?? undefined;
  const stressMetaSource = readProofString(pack, "stress_meta_source") ?? undefined;
  const stressMetaCongruence =
    readProofString(pack, "stress_meta_congruence") ?? undefined;
  const stressMetaProxy = readProofBoolean(pack, "stress_meta_proxy") ?? undefined;
  const metricConstraint =
    rhoConstraintMean != null
      ? {
          updatedAt:
            typeof pack?.pipeline?.ts === "number"
              ? pack.pipeline.ts
              : Date.now(),
          source: rhoConstraintSource ?? "unknown",
          chart: metricChartLabel,
          family: metricAdapterFamily,
          observer: metricT00Observer,
          normalization: metricT00Normalization,
          unitSystem: metricT00UnitSystem,
          rho_constraint: {
            min: rhoConstraintMean,
            max: rhoConstraintMean,
            maxAbs: rhoConstraintMaxAbs ?? Math.abs(rhoConstraintMean),
            rms: rhoConstraintRms ?? Math.abs(rhoConstraintMean),
            mean: rhoConstraintMean,
          },
        }
      : undefined;
  return {
    P_avg_W: readProofNumber(pack, "power_avg_W") ?? undefined,
    P_avg: readProofNumber(pack, "power_avg_MW") ?? undefined,
    dutyEffectiveFR: readProofNumber(pack, "duty_effective") ?? undefined,
    dutyEffective_FR: readProofNumber(pack, "duty_effective") ?? undefined,
    dutyBurst: readProofNumber(pack, "duty_burst") ?? undefined,
    gammaGeo: readProofNumber(pack, "gamma_geo") ?? undefined,
    gammaVanDenBroeck: readProofNumber(pack, "gamma_vdb") ?? undefined,
    qCavity: readProofNumber(pack, "q_cavity") ?? undefined,
    qSpoilingFactor: readProofNumber(pack, "q_spoil") ?? undefined,
    U_static: readProofNumber(pack, "U_static_J") ?? undefined,
    U_geo: readProofNumber(pack, "U_geo_J") ?? undefined,
    U_Q: readProofNumber(pack, "U_Q_J") ?? undefined,
    U_cycle: readProofNumber(pack, "U_cycle_J") ?? undefined,
    U_static_total: readProofNumber(pack, "U_static_total_J") ?? undefined,
    M_exotic: readProofNumber(pack, "M_exotic_kg") ?? undefined,
    M_exotic_raw: readProofNumber(pack, "M_exotic_raw_kg") ?? undefined,
    massCalibration: readProofNumber(pack, "mass_calibration") ?? undefined,
    rho_static: readProofNumber(pack, "rho_static_J_m3") ?? undefined,
    rho_inst: readProofNumber(pack, "rho_inst_J_m3") ?? undefined,
    rho_avg: readProofNumber(pack, "rho_avg_J_m3") ?? undefined,
    TS_ratio: readProofNumber(pack, "ts_ratio") ?? undefined,
    zeta: readProofNumber(pack, "zeta") ?? undefined,
    fordRomanCompliance: readProofBoolean(pack, "ford_roman_ok") ?? undefined,
    natarioConstraint: readProofBoolean(pack, "natario_ok") ?? undefined,
    thetaRaw: thetaRaw ?? undefined,
    thetaCal: thetaCal ?? undefined,
    thetaScaleExpected: thetaCal ?? undefined,
    theta_audit: thetaAudit ?? thetaGeom ?? thetaProxy ?? thetaCal ?? undefined,
    theta_audit_source: thetaAuditSource ?? thetaGeomSource ?? thetaProxySource,
    theta_geom: thetaGeom ?? undefined,
    theta_geom_source: thetaGeomSource,
    theta_geom_proxy: thetaGeomProxy,
    theta_proxy: thetaProxy ?? thetaCal ?? undefined,
    theta_proxy_source: thetaProxySource,
    theta_source: thetaSource,
    theta_metric_derived: thetaMetricDerived ?? undefined,
    theta_metric_source: thetaMetricSource ?? undefined,
    theta_metric_reason: thetaMetricReason ?? undefined,
    theta_strict_mode: thetaStrictMode ?? undefined,
    theta_strict_ok: thetaStrictOk ?? undefined,
    theta_strict_reason: thetaStrictReason ?? undefined,
    metric_k_trace_mean: readProofNumber(pack, "metric_k_trace_mean") ?? undefined,
    metric_k_sq_mean: readProofNumber(pack, "metric_k_sq_mean") ?? undefined,
    qi_strict_mode: qiStrictMode ?? undefined,
    qi_strict_ok: qiStrictOk ?? undefined,
    qi_strict_reason: qiStrictReason ?? undefined,
    qi_rho_source: qiRhoSource ?? undefined,
    qi_metric_derived: qiMetricDerived ?? undefined,
    qi_metric_source: qiMetricSource ?? undefined,
    qi_metric_reason: qiMetricReason ?? undefined,
    ts_metric_derived: tsMetricDerived ?? undefined,
    ts_metric_source: tsMetricSource ?? undefined,
    ts_metric_reason: tsMetricReason ?? undefined,
    curvatureMeta:
      curvatureMetaSource || curvatureMetaCongruence || curvatureMetaProxy != null
        ? {
            source: curvatureMetaSource ?? "unknown",
            congruence: curvatureMetaCongruence ?? "unknown",
            proxy: curvatureMetaProxy === true,
          }
        : undefined,
    stressMeta:
      stressMetaSource || stressMetaCongruence || stressMetaProxy != null
        ? {
            source: stressMetaSource ?? "unknown",
            congruence: stressMetaCongruence ?? "unknown",
            proxy: stressMetaProxy === true,
          }
        : undefined,
    metricConstraint,
    hullArea_m2: readProofNumber(pack, "hull_area_m2") ?? undefined,
    tileArea_cm2: readProofNumber(pack, "tile_area_cm2") ?? undefined,
    N_tiles: readProofNumber(pack, "tile_count") ?? undefined,
    hull,
    bubble,
    mechanical,
    gammaVanDenBroeckGuard,
    gammaChain,
    vdb_two_wall_support: readProofBoolean(pack, "vdb_two_wall_support") ?? undefined,
    vdb_two_wall_derivative_support:
      readProofBoolean(pack, "vdb_two_wall_derivative_support") ?? undefined,
    vdb_region_ii_derivative_support:
      readProofBoolean(pack, "vdb_region_ii_derivative_support") ?? undefined,
    vdb_region_iv_derivative_support:
      readProofBoolean(pack, "vdb_region_iv_derivative_support") ?? undefined,
    congruence_missing_parts: congruenceMissingParts
      ? congruenceMissingParts.split(",").map((part) => part.trim()).filter(Boolean)
      : undefined,
    congruence_missing_count:
      typeof congruenceMissingCount === "number" ? congruenceMissingCount : undefined,
    congruence_missing_reason: congruenceMissingReason ?? undefined,
  };
};

export const mergeProofPackIntoPipeline = (
  pack: ProofPack | null | undefined,
  pipeline: EnergyPipelineState | null | undefined,
): EnergyPipelineState | null => {
  if (!pipeline) return null;
  const mapped = mapProofPackToPipeline(pack);
  if (!mapped) return pipeline;
  const merged = { ...pipeline, ...mapped } as EnergyPipelineState;
  const invariantPatch = readInvariantStatsSet(pack);
  if (invariantPatch && pipeline.gr) {
    merged.gr = {
      ...pipeline.gr,
      invariants: {
        ...(pipeline.gr.invariants ?? {}),
        ...invariantPatch,
      },
    } as EnergyPipelineState["gr"];
  }
  return merged;
};
