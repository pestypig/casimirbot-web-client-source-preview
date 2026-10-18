import * as React from "react";
import type { ProofPack } from "@shared/schema";
import { useProofPack } from "@/hooks/useProofPack";
import { useMathStageGate } from "@/hooks/useMathStageGate";
import { useGrConstraintContract } from "@/hooks/useGrConstraintContract";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROOF_PACK_STAGE_REQUIREMENTS,
  getProofValue,
  isStrictProofPack,
  readProofBooleanStrict,
  readProofNumberStrict,
  readProofStringStrict,
} from "@/lib/proof-pack";
import { STAGE_BADGE, STAGE_LABELS } from "@/lib/math-stage-gate";

function fmtExp(v: number | null | undefined, digits = 3): string {
  if (!Number.isFinite(v as number)) return "--";
  return (v as number).toExponential(digits);
}

function fmtFixed(v: number | null | undefined, digits = 3): string {
  if (!Number.isFinite(v as number)) return "--";
  return (v as number).toFixed(digits);
}

type GuardStatus = "pass" | "warn" | "fail" | "na";
type ContractGuardrailStatus = "ok" | "fail" | "proxy" | "missing";

interface LedgerRow {
  id: string;
  label: string;
  equation: string;
  value: string;
  guard?: GuardStatus;
  guardLabel?: string;
  proxy?: boolean;
}

function guardBadge(status: GuardStatus | undefined, label?: string) {
  if (!status || status === "na") return null;
  let klass =
    status === "pass"
      ? "bg-emerald-500/20 text-emerald-300"
      : status === "warn"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-rose-500/20 text-rose-300";

  return (
    <Badge className={cn("ml-2 px-2 py-0.5 text-[10px] leading-tight", klass)}>
      {label ?? status.toUpperCase()}
    </Badge>
  );
}

function proxyBadge(proxy?: boolean, strict?: boolean) {
  if (!proxy) return null;
  return (
    <Badge
      className={cn(
        "ml-2 px-2 py-0.5 text-[10px] leading-tight",
        strict ? "bg-rose-900/40 text-rose-200" : "bg-slate-800 text-slate-300",
      )}
    >
      {strict ? "NON-ADMISSIBLE" : "PROXY"}
    </Badge>
  );
}

function contractSummaryClass(statuses: ContractGuardrailStatus[] | null): string {
  if (!statuses) return "border-slate-600 bg-slate-900/70 text-slate-200";
  if (statuses.some((status) => status === "fail" || status === "missing")) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  if (statuses.some((status) => status === "proxy")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

function buildLedgerRows(
  pack?: ProofPack | null,
  stageProxy = false,
  strictMode = false,
): LedgerRow[] {
  if (!pack) return [];

  const eq = pack.equations ?? {};
  const isProxy = (key: string) =>
    Boolean(getProofValue(pack, key)?.proxy) || stageProxy;
  const readNum = (key: string) =>
    readProofNumberStrict(pack, key, strictMode);
  const readBool = (key: string) =>
    readProofBooleanStrict(pack, key, strictMode);
  const readStr = (key: string) =>
    readProofStringStrict(pack, key, strictMode);
  const proxyFrom = (keys: string[]) => keys.some(isProxy);

  // Hull / geometry
  const Lx = readNum("hull_Lx_m");
  const Ly = readNum("hull_Ly_m");
  const Lz = readNum("hull_Lz_m");
  const a = Lx;
  const b = Ly;
  const c = Lz;
  const R_geom = readNum("R_geom_m");

  // Amplification chain
  const qGain = readNum("q_gain");
  const gammaGeoCubed = readNum("gamma_geo_cubed");
  const gammaVdb = readNum("gamma_vdb");
  const dutyEff = readNum("duty_effective");
  const dutyBurst = readNum("duty_burst");
  const thetaRaw = readNum("theta_pipeline_raw");
  const thetaCal = readNum("theta_pipeline_cal");
  const thetaGeom = readNum("theta_geom");
  const thetaProxy = readNum("theta_pipeline_proxy") ?? thetaCal;
  const thetaStrictMode = readBool("theta_strict_mode");
  const thetaStrictOk = readBool("theta_strict_ok");
  const thetaStrictReason = readStr("theta_strict_reason");
  const metricT00 = {
    sampleCount: readNum("metric_t00_sample_count"),
    rhoGeomMean: readNum("metric_t00_rho_geom_mean"),
    rhoSiMean: readNum("metric_t00_rho_si_mean"),
    kTraceMean: readNum("metric_k_trace_mean"),
    kSquaredMean: readNum("metric_k_sq_mean"),
    step_m: readNum("metric_t00_step_m"),
    scale_m: readNum("metric_t00_scale_m"),
  };
  const metricT00Proxy = proxyFrom([
    "metric_t00_sample_count",
    "metric_t00_rho_geom_mean",
    "metric_t00_rho_si_mean",
    "metric_k_trace_mean",
    "metric_k_sq_mean",
    "metric_t00_step_m",
    "metric_t00_scale_m",
  ]);

  // Guards
  const vdb = {
    requested: readNum("gamma_vdb_requested"),
    limit: readNum("vdb_limit"),
    pocketRadius_m: readNum("vdb_pocket_radius_m"),
    pocketThickness_m: readNum("vdb_pocket_thickness_m"),
    planckMargin: readNum("vdb_planck_margin"),
    reason: readStr("vdb_reason") ?? null,
    admissible: readBool("vdb_admissible"),
  };
  const vdbTwoWallSupport = readBool("vdb_two_wall_support");
  const vdbTwoWallDerivativeSupport = readBool("vdb_two_wall_derivative_support");
  const mech = {
    requestedGap_nm: readNum("mechanical_gap_req_nm"),
    constrainedGap_nm: readNum("mechanical_gap_eff_nm"),
    mechSafetyFactor: readNum("mechanical_safety_factor"),
    safetyFactorMin: readNum("mechanical_safety_min"),
    loadPressure_Pa: readNum("mechanical_load_pressure_Pa"),
    sigmaAllow_Pa: readNum("mechanical_sigma_allow_Pa"),
    casimirPressure_Pa: readNum("mechanical_casimir_pressure_Pa"),
    electrostaticPressure_Pa: readNum("mechanical_electrostatic_pressure_Pa"),
    maxStroke_pm: readNum("mechanical_max_stroke_pm"),
    strokeFeasible: readBool("mechanical_stroke_feasible"),
    feasible: readBool("mechanical_feasible"),
    safetyFeasible: readBool("mechanical_safety_feasible"),
    margin_Pa: readNum("mechanical_margin_Pa"),
  };
  const qiGuard = readNum("qi_interest_margin_Jm3") != null;
  const zeta = readNum("zeta");
  const TS = readNum("ts_ratio");
  const tsMetricDerived = readBool("ts_metric_derived");
  const tsMetricSource = readStr("ts_metric_source");
  const tsMetricReason = readStr("ts_metric_reason");
  const fordOk = readBool("ford_roman_ok");
  const qiStrictMode = readBool("qi_strict_mode");
  const qiStrictOk = readBool("qi_strict_ok");
  const qiStrictReason = readStr("qi_strict_reason");
  const qiRhoSource = readStr("qi_rho_source");
  const qiMetricDerived = readBool("qi_metric_derived");
  const qiMetricSource = readStr("qi_metric_source");
  const qiMetricReason = readStr("qi_metric_reason");
  const qiStrictBlocked = qiStrictMode === true && qiStrictOk === false;
  const metricT00Geom = readNum("gr_metric_t00_geom_mean");
  const pipelineT00Geom = readNum("gr_pipeline_t00_geom_mean");
  const cl3Threshold = readNum("gr_cl3_rho_threshold");
  const cl3Gate = readBool("gr_cl3_rho_gate");
  const cl3GateSource = readStr("gr_cl3_rho_gate_source");
  const cl3GateReason = readStr("gr_cl3_rho_gate_reason");
  const cl3MissingParts = readStr("gr_cl3_rho_missing_parts");
  const cl3ConstraintSource = getProofValue(pack, "gr_rho_constraint_mean")?.source;
  const metricDelta =
    typeof metricT00Geom === "number" &&
    typeof pipelineT00Geom === "number"
      ? Math.abs(metricT00Geom - pipelineT00Geom) /
        Math.max(1e-12, Math.abs(pipelineT00Geom))
      : null;

  const rows: LedgerRow[] = [];

  // Geometry row
  rows.push({
    id: "geom-R",
    label: "Bubble radius R",
    equation: eq.R ?? "R = (Lx * Ly * Lz)^(1/3)",
    value: `R = ${fmtFixed(R_geom, 3)} m  (Lx=${fmtFixed(a, 1)}, Ly=${fmtFixed(b, 1)}, Lz=${fmtFixed(c, 1)})`,
    guard: "na",
    proxy: proxyFrom(["R_geom_m", "hull_Lx_m", "hull_Ly_m", "hull_Lz_m"]),
  });

  // Effective duty
  const S_live = readNum("sectors_live");
  const S_total = readNum("sectors_total");
  rows.push({
    id: "d_eff",
    label: "FR duty d_eff",
    equation: eq.d_eff ?? "d_eff = d_burst * S_live / S_total",
    value: `d_eff = ${fmtExp(dutyEff, 3)}  (d_burst=${fmtExp(dutyBurst, 3)}, S_live=${fmtExp(S_live, 0)}, S_total=${fmtExp(S_total, 0)})`,
    guard: "na",
    proxy: proxyFrom([
      "duty_effective",
      "duty_burst",
      "sectors_live",
      "sectors_total",
    ]),
  });

  // Amplification ladder (theta)
  const thetaRowProxy =
    thetaGeom != null ? isProxy("theta_geom") : proxyFrom(
      [
        "gamma_geo",
        "gamma_geo_cubed",
        "q_gain",
        "q_cavity",
        "q_spoil",
        "gamma_vdb",
        "duty_effective",
        "theta_pipeline_raw",
        "theta_pipeline_cal",
        "theta_pipeline_proxy",
      ],
    );
  const thetaGuard: GuardStatus =
    thetaStrictMode === true
      ? thetaStrictOk === true
        ? "pass"
        : "fail"
      : fordOk === true
        ? "pass"
        : fordOk === false
          ? "fail"
          : "na";
  const thetaGuardLabel =
    thetaStrictMode === true
      ? thetaStrictOk === true
        ? "strict theta OK"
        : "strict theta blocked"
      : fordOk === true
        ? "FR OK"
        : fordOk === false
          ? "FR FAIL"
          : undefined;
  rows.push({
    id: "theta",
    label: "Amplification theta",
    equation:
      eq.theta_expected ??
      "theta_expected = gamma_geo^3 * q_spoil * gamma_vdb * d_eff",
    value: [
      `gamma_geo^3 = ${fmtExp(gammaGeoCubed, 3)}`,
      `sqrt(Q/1e9) = ${fmtFixed(qGain, 3)}`,
      `gamma_VdB = ${fmtExp(gammaVdb, 3)}`,
      `d_eff = ${fmtExp(dutyEff, 3)}`,
      thetaGeom != null
        ? `=> theta_geom = ${fmtExp(thetaGeom, 3)} (metric)`
        : `=> theta_pipeline_cal = ${fmtExp(thetaCal, 3)} (proxy)`,
      thetaProxy != null && thetaGeom != null
        ? `theta_pipeline_proxy = ${fmtExp(thetaProxy, 3)}`
        : null,
      thetaRaw != null ? `theta_pipeline_raw = ${fmtExp(thetaRaw, 3)}` : null,
      thetaStrictMode === true
        ? `strict=${thetaStrictOk === true ? "on:ok" : `on:fail(${thetaStrictReason ?? "unknown"})`}`
        : "strict=off",
    ].filter(Boolean).join(" * "),
    guard: thetaGuard,
    guardLabel: thetaGuardLabel,
    proxy: thetaRowProxy,
  });

  if (metricDelta != null) {
    const guard =
      typeof cl3Threshold === "number"
        ? metricDelta <= cl3Threshold
          ? "pass"
          : metricDelta <= cl3Threshold * 2
            ? "warn"
            : "fail"
        : "na";
    const guardLabel =
      guard === "pass"
        ? "within CL3 threshold"
        : guard === "warn"
          ? "above CL3 threshold"
          : guard === "fail"
            ? "far above CL3"
            : undefined;
    rows.push({
      id: "metric_vs_pipeline_t00",
      label: "Metric vs pipeline T00",
      equation: "delta = |T00_metric - T00_pipeline| / |T00_pipeline|",
      value: [
        `T00_metric = ${fmtExp(metricT00Geom, 3)} (gr)`,
        `T00_pipeline = ${fmtExp(pipelineT00Geom, 3)} (gr)`,
        `delta = ${fmtExp(metricDelta, 3)}`,
      ].join("  |  "),
      guard,
      guardLabel,
      proxy: proxyFrom([
        "gr_metric_t00_geom_mean",
        "gr_pipeline_t00_geom_mean",
        "gr_cl3_rho_threshold",
      ]),
    });
  }

  rows.push({
    id: "cl3_gate_source",
    label: "CL3 metric source",
    equation: "strict CL3 gate compares rho_constraint against metric-derived T00",
    value: [
      `gate=${cl3Gate == null ? "n/a" : cl3Gate ? "pass" : "fail"}`,
      `source=${cl3GateSource ?? "n/a"}`,
      `reason=${cl3GateReason ?? "n/a"}`,
      `missing=${cl3MissingParts ?? "n/a"}`,
    ].join("  |  "),
    guard:
      cl3Gate == null
        ? "na"
        : cl3Gate
          ? "pass"
          : "fail",
    guardLabel:
      cl3Gate == null
        ? undefined
        : cl3Gate
          ? "metric source"
          : "strict blocked",
    proxy: proxyFrom([
      "gr_cl3_rho_gate",
      "gr_cl3_rho_gate_source",
      "gr_cl3_rho_gate_reason",
      "gr_cl3_rho_missing_parts",
    ]),
  });

  rows.push({
    id: "cl3_constraint_source",
    label: "CL3 constraint rho source",
    equation: "rho_constraint provenance (GR gate vs metric fallback)",
    value: `source=${cl3ConstraintSource ?? "n/a"}`,
    guard: "na",
    proxy: proxyFrom(["gr_rho_constraint_mean"]),
  });

  if (
    metricT00.sampleCount != null ||
    metricT00.rhoGeomMean != null ||
    metricT00.rhoSiMean != null
  ) {
    rows.push({
      id: "metric_t00_diag",
      label: "Metric T00 diagnostics",
      equation: "rho_E = (K^2 - K_ij K^ij)/(16π) (flat-slice)",
      value: [
        `samples = ${fmtExp(metricT00.sampleCount, 3)}`,
        `rho_geom = ${fmtExp(metricT00.rhoGeomMean, 3)}`,
        `rho_SI = ${fmtExp(metricT00.rhoSiMean, 3)} J/m^3`,
        `K_trace = ${fmtExp(metricT00.kTraceMean, 3)} 1/m`,
        `K_sq = ${fmtExp(metricT00.kSquaredMean, 3)} 1/m^2`,
        `step = ${fmtExp(metricT00.step_m, 3)} m`,
        `scale = ${fmtExp(metricT00.scale_m, 3)} m`,
      ].join("  |  "),
      guard: "na",
      proxy: metricT00Proxy,
    });
  }

  // Static -> geo -> Q -> duty chain
  rows.push({
    id: "U_chain",
    label: "Casimir energy ladder",
    equation:
      (eq.U_static ?? "U_static = chi * [-pi^2 hbar c/(720 a^3)] * A_tile") +
      ", " +
      (eq.U_geo ?? "U_geo = gamma_geo^3 * U_static") +
      ", " +
      (eq.U_Q ?? "U_Q = q_mech * U_geo") +
      ", " +
      (eq.P_avg ?? "P_avg = |U_Q| * omega/Q * N_tiles * d_eff"),
    value: [
      `U_static = ${fmtExp(readNum("U_static_J"), 3)} J`,
      `U_geo = ${fmtExp(readNum("U_geo_J"), 3)} J`,
      `U_Q = ${fmtExp(readNum("U_Q_J"), 3)} J`,
      `U_cycle = ${fmtExp(readNum("U_cycle_J"), 3)} J`,
      `P_avg = ${fmtExp(readNum("power_avg_MW"), 3)} MW`,
    ].join("  *  "),
    guard: "na",
    proxy: proxyFrom(
      ["U_static_J", "U_geo_J", "U_Q_J", "U_cycle_J", "power_avg_MW"],
    ),
  });

  // Exotic mass
  rows.push({
    id: "M_exotic",
    label: "Exotic mass",
    equation:
      eq.M_exotic ??
      "M = |U_static| * gamma_geo^3 * Q_burst * gamma_vdb * d_eff * N_tiles / c^2",
    value: `M_exotic = ${fmtExp(readNum("M_exotic_kg"), 3)} kg  (raw=${fmtExp(readNum("M_exotic_raw_kg"), 3)}, cal=${fmtExp(readNum("mass_calibration"), 3)})`,
    guard: "na",
    proxy: proxyFrom(["M_exotic_kg", "M_exotic_raw_kg", "mass_calibration"]),
  });

  // Time-scale separation
  rows.push({
    id: "TS_ratio",
    label: "Time-scale separation (soft timing proxy)",
    equation: eq.TS_long ?? "TS_ratio = (L_long / c) / (1/f_m)",
    value: `TS_ratio = ${fmtExp(TS, 3)}`,
    guard: typeof TS === "number" ? (TS >= 1.5 ? "warn" : "fail") : "na",
    guardLabel:
      typeof TS === "number"
        ? TS >= 1.5
          ? "soft timing proxy met"
          : "below soft timing proxy 1.5"
        : undefined,
    proxy: proxyFrom(["ts_ratio"]),
  });

  rows.push({
    id: "ts_metric_strict",
    label: "TS strict congruence",
    equation: "strict mode requires metric-derived TS timing source",
    value: [
      `metric_derived = ${
        tsMetricDerived == null ? "n/a" : tsMetricDerived ? "true" : "false"
      }`,
      `source = ${tsMetricSource ?? "n/a"}`,
      `reason = ${tsMetricReason ?? "n/a"}`,
    ].join("  |  "),
    guard:
      tsMetricDerived == null
        ? "na"
        : tsMetricDerived
          ? "pass"
          : "fail",
    guardLabel:
      tsMetricDerived == null
        ? undefined
        : tsMetricDerived
          ? "metric source"
          : "proxy timing",
    proxy: proxyFrom(["ts_metric_derived", "ts_metric_source", "ts_metric_reason"]),
  });

  // Ford-Roman / QI zeta
  rows.push({
    id: "zeta",
    label: "Ford-Roman (QI) scalar",
    equation: "zeta = sampledIntegral / bound  (require zeta < 1)",
    value: [
      `zeta = ${fmtFixed(zeta, 3)} (${fordOk === true ? "< 1" : fordOk === false ? ">= 1" : "n/a"})`,
      `source=${qiRhoSource ?? "n/a"}`,
      `metric=${qiMetricDerived == null ? "n/a" : qiMetricDerived ? "derived" : "proxy"}`,
      qiStrictMode === true
        ? `strict=${qiStrictOk === true ? "on:ok" : `on:fail(${qiStrictReason ?? "unknown"})`}`
        : "strict=off",
    ].join("  |  "),
    guard: qiStrictBlocked
      ? "fail"
      : fordOk === true
        ? "pass"
        : fordOk === false
          ? "fail"
          : "na",
    guardLabel:
      qiStrictBlocked
        ? "strict metric blocked"
        : fordOk === true
          ? "FR OK"
          : fordOk === false
            ? "FR FAIL"
            : undefined,
    proxy: proxyFrom([
      "zeta",
      "ford_roman_ok",
      "qi_rho_source",
      "qi_metric_derived",
      "qi_metric_source",
      "qi_metric_reason",
      "qi_strict_mode",
      "qi_strict_ok",
      "qi_strict_reason",
    ]),
  });

  rows.push({
    id: "qi_metric_path",
    label: "QI metric path",
    equation: "metric-derived QI rho source provenance",
    value: [
      `metric_derived=${
        qiMetricDerived == null ? "n/a" : qiMetricDerived ? "true" : "false"
      }`,
      `source=${qiMetricSource ?? "n/a"}`,
      `reason=${qiMetricReason ?? "n/a"}`,
      `rho_source=${qiRhoSource ?? "n/a"}`,
    ].join("  |  "),
    guard:
      qiMetricDerived == null
        ? "na"
        : qiMetricDerived
          ? "pass"
          : "fail",
    guardLabel:
      qiMetricDerived == null
        ? undefined
        : qiMetricDerived
          ? "geometry-derived"
          : "proxy-only",
    proxy: proxyFrom([
      "qi_metric_derived",
      "qi_metric_source",
      "qi_metric_reason",
      "qi_rho_source",
    ]),
  });

  rows.push({
    id: "qi_strict",
    label: "QI strict congruence",
    equation: "strict mode requires metric-derived QI rho source",
    value: [
      `mode=${qiStrictMode == null ? "n/a" : qiStrictMode ? "on" : "off"}`,
      `ok=${qiStrictOk == null ? "n/a" : qiStrictOk ? "true" : "false"}`,
      `reason=${qiStrictReason ?? "n/a"}`,
      `metric_derived=${
        qiMetricDerived == null ? "n/a" : qiMetricDerived ? "true" : "false"
      }`,
      `metric_source=${qiMetricSource ?? "n/a"}`,
      `metric_reason=${qiMetricReason ?? "n/a"}`,
      `rho_source=${qiRhoSource ?? "n/a"}`,
    ].join("  |  "),
    guard:
      qiStrictMode === true
        ? qiStrictOk === true
          ? "pass"
          : "fail"
        : "na",
    guardLabel:
      qiStrictMode === true
        ? qiStrictOk === true
          ? "metric source"
          : "proxy blocked"
        : undefined,
    proxy: proxyFrom([
      "qi_strict_mode",
      "qi_strict_ok",
      "qi_strict_reason",
      "qi_metric_derived",
      "qi_metric_source",
      "qi_metric_reason",
      "qi_rho_source",
    ]),
  });

  // Quantum Interest book (debt / credit)
  if (qiGuard) {
    const qiNeg = readNum("qi_interest_neg_Jm3");
    const qiPos = readNum("qi_interest_pos_Jm3");
    const qiDebt = readNum("qi_interest_debt_Jm3");
    const qiCredit = readNum("qi_interest_credit_Jm3");
    const qiMargin = readNum("qi_interest_margin_Jm3");
    rows.push({
      id: "qi_interest",
      label: "Quantum interest",
      equation:
        "margin_Jm3 = credit_Jm3 - debt_Jm3  (require margin >= 0 over window)",
      value: `neg=${fmtExp(qiNeg, 3)}  pos=${fmtExp(qiPos, 3)}  debt=${fmtExp(qiDebt, 3)}  credit=${fmtExp(qiCredit, 3)}  => margin=${fmtExp(qiMargin, 3)} J/m^3`,
      guard:
        typeof qiMargin === "number"
          ? qiMargin >= 0
            ? "pass"
            : "fail"
          : "na",
      guardLabel:
        typeof qiMargin === "number"
          ? qiMargin >= 0
            ? "paid"
            : "unpaid"
          : undefined,
      proxy: proxyFrom(
        [
          "qi_interest_neg_Jm3",
          "qi_interest_pos_Jm3",
          "qi_interest_debt_Jm3",
          "qi_interest_credit_Jm3",
          "qi_interest_margin_Jm3",
        ],
      ),
    });
  }

  // Van den Broeck guard
  rows.push({
    id: "vdb_guard",
    label: "Van den Broeck pocket",
    equation:
      "gamma_VdB <= limit, pocketRadius = a_min / gamma_VdB, pocketThickness = pocketRadius - floor, planckMargin >= 1",
    value: [
      `gamma_VdB(requested) = ${fmtExp(vdb.requested, 3)}`,
      `limit = ${fmtExp(vdb.limit, 3)}`,
      `pocketRadius = ${fmtExp(vdb.pocketRadius_m, 3)} m`,
      `pocketThickness = ${fmtExp(vdb.pocketThickness_m, 3)} m`,
      `planckMargin = ${fmtExp(vdb.planckMargin, 3)}`,
      `reason = ${vdb.reason ?? "n/a"}`,
    ].join("  *  "),
    guard:
      vdb.admissible === true
        ? "pass"
        : vdb.admissible === false
          ? "fail"
          : "na",
    guardLabel:
      vdb.admissible === true
        ? "admissible"
        : vdb.admissible === false
          ? "clamped"
          : undefined,
    proxy: proxyFrom(
      [
        "gamma_vdb_requested",
        "vdb_limit",
        "vdb_pocket_radius_m",
        "vdb_pocket_thickness_m",
        "vdb_planck_margin",
        "vdb_reason",
        "vdb_admissible",
      ],
    ),
  });
  if (vdbTwoWallSupport != null || vdbTwoWallDerivativeSupport != null) {
    const supportLabel =
      vdbTwoWallSupport === true ? "yes" : vdbTwoWallSupport === false ? "no" : "n/a";
    const derivLabel =
      vdbTwoWallDerivativeSupport === true
        ? "yes"
        : vdbTwoWallDerivativeSupport === false
          ? "no"
          : "n/a";
    rows.push({
      id: "vdb_two_wall_support",
      label: "VdB two-wall derivative support",
      equation: "region II + IV derivative support",
      value: `two_wall=${supportLabel}  |  deriv=${derivLabel}`,
      guard: "na",
      proxy: proxyFrom(["vdb_two_wall_support", "vdb_two_wall_derivative_support"]),
    });
  }

  // Mechanical feasibility (single tile)
  const hasMarginDeficit =
    Number.isFinite(mech.margin_Pa) && (mech.margin_Pa as number) < 0;
  let guardStatus: "pass" | "fail" | "warn" | "na";
  let guardLabel: string | undefined;
  if (
    mech.feasible == null &&
    mech.strokeFeasible == null &&
    mech.safetyFeasible == null &&
    mech.margin_Pa == null
  ) {
    guardStatus = "na";
    guardLabel = "missing";
  } else if (mech.feasible && mech.strokeFeasible) {
    guardStatus = "pass";
    guardLabel = "OK";
  } else if (mech.safetyFeasible === false) {
    guardStatus = "fail";
    guardLabel = "overload";
  } else if (hasMarginDeficit) {
    guardStatus = "fail";
    guardLabel = "stiffness";
  } else if (mech.strokeFeasible === false) {
    guardStatus = "warn";
    guardLabel = "stroke";
  } else {
    guardStatus = "warn";
    guardLabel = "clearance";
  }

  rows.push({
    id: "mech_guard",
    label: "Mechanical tile guard",
    equation:
      "S_mech = sigma_allow / P_load, require S_mech >= S_min and stroke <= maxStroke",
    value: [
      `gap_req = ${fmtFixed(mech.requestedGap_nm, 1)} nm`,
      `gap_eff = ${fmtFixed(mech.constrainedGap_nm ?? mech.requestedGap_nm, 1)} nm`,
      `S_mech = ${fmtExp(mech.mechSafetyFactor ?? NaN, 3)}${Number.isFinite(mech.safetyFactorMin) ? ` (min ${fmtFixed(mech.safetyFactorMin as number, 2)})` : ""}`,
      `P_load = ${fmtExp(mech.loadPressure_Pa ?? NaN, 3)} Pa`,
      `sigma_allow = ${fmtExp(mech.sigmaAllow_Pa ?? NaN, 3)} Pa`,
      `P_Casimir = ${fmtExp(mech.casimirPressure_Pa, 3)} Pa`,
      `P_ES = ${fmtExp(mech.electrostaticPressure_Pa, 3)} Pa`,
      `maxStroke = ${fmtFixed(mech.maxStroke_pm, 1)} pm`,
      `strokeFeasible = ${
        mech.strokeFeasible == null
          ? "n/a"
          : mech.strokeFeasible
            ? "yes"
            : "no"
      }`,
    ].join("  |  "),
    guard: guardStatus === "na" ? "na" : guardStatus,
    guardLabel,
    proxy: proxyFrom(
      [
        "mechanical_gap_req_nm",
        "mechanical_gap_eff_nm",
        "mechanical_safety_factor",
        "mechanical_safety_min",
        "mechanical_load_pressure_Pa",
        "mechanical_sigma_allow_Pa",
        "mechanical_casimir_pressure_Pa",
        "mechanical_electrostatic_pressure_Pa",
        "mechanical_max_stroke_pm",
        "mechanical_stroke_feasible",
        "mechanical_feasible",
        "mechanical_safety_feasible",
        "mechanical_margin_Pa",
      ],
    ),
  });

  return rows;
}

export function FrontProofsLedger() {
  const { data: pack, isLoading, error } = useProofPack({
    refetchInterval: 5000,
  });
  const contractQuery = useGrConstraintContract({ enabled: true, refetchInterval: 2000 });
  const stageGate = useMathStageGate(PROOF_PACK_STAGE_REQUIREMENTS, {
    staleTime: 30_000,
  });
  const stageLabel = stageGate.pending
    ? "STAGE..."
    : STAGE_LABELS[stageGate.stage];
  const contractGuardrails = contractQuery.data?.guardrails ?? null;
  const contractStatuses = contractGuardrails
    ? ([
        contractGuardrails.fordRoman,
        contractGuardrails.thetaAudit,
        contractGuardrails.tsRatio,
        contractGuardrails.vdbBand,
      ] as ContractGuardrailStatus[])
    : null;
  const contractSource = contractQuery.data?.sources?.grDiagnostics ?? "missing";
  const strictMode = isStrictProofPack(pack);
  const contractStatusesStrict =
    strictMode && contractStatuses
      ? contractStatuses.map((status) =>
          status === "proxy" || status === "missing" ? "fail" : status,
        )
      : contractStatuses;
  const contractBadgeClass = contractSummaryClass(contractStatusesStrict);
  const rows = buildLedgerRows(pack, !stageGate.ok, strictMode);
  const visibleRows = strictMode ? rows.filter((row) => !row.proxy) : rows;

  return (
    <Card className="bg-slate-950/80 border-cyan-500/40">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-3">
          <span className="text-sm uppercase tracking-[0.2em] text-cyan-300">
            FRONT PROOFS
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <Badge
              variant="outline"
              className={cn(
                "border px-2 py-0.5 text-[10px]",
                STAGE_BADGE[stageGate.stage],
              )}
            >
              {stageLabel}
            </Badge>
            {proxyBadge(!stageGate.ok, strictMode)}
            {contractGuardrails ? (
              <Badge className={cn("border px-2 py-0.5 text-[10px]", contractBadgeClass)}>
                {`contract FR=${contractGuardrails.fordRoman} TH=${contractGuardrails.thetaAudit} TS=${contractGuardrails.tsRatio} VdB=${contractGuardrails.vdbBand}`}
              </Badge>
            ) : (
              <Badge className="border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-200">
                contract unavailable
              </Badge>
            )}
            <Badge className="border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-200">
              {`source=${contractSource}`}
            </Badge>
            <span>Math Ledger (proof pack)</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {isLoading && <div className="text-slate-400">Loading proof pack...</div>}
        {error && (
          <div className="text-rose-400">
            Failed to load proof pack. Check /api/helix/pipeline/proofs.
          </div>
        )}
        {!isLoading && !error && visibleRows.length === 0 && (
          <div className="text-slate-400">
            No ledger rows available (proof pack empty).
          </div>
        )}
        {visibleRows.length > 0 && (
          <div className="divide-y divide-slate-800">
            {visibleRows.map((row) => (
              <div key={row.id} className="py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-100">
                    {row.label}
                    {guardBadge(row.guard, row.guardLabel)}
                    {proxyBadge(row.proxy, strictMode)}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {row.equation}
                  </div>
                </div>
                <div className="font-mono text-[11px] text-slate-200 break-words">
                  {strictMode && row.proxy ? "non-admissible (proxy)" : row.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FrontProofsLedger;
