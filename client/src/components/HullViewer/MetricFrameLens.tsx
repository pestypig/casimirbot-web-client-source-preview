import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildMetricXdmfArtifacts,
  type HullMetricVolumeContract,
} from "@/lib/metric-volume-contract";

export type SolveOrderStatus = "pass" | "warn" | "fail" | "unknown";

export type SolveOrderCheck = {
  id:
    | "metric_form_alignment"
    | "shift_mapping"
    | "york_time_sign_parity"
    | "natario_control_behavior"
    | "metric_derived_t00_path";
  label: string;
  status: SolveOrderStatus;
  note: string;
};

export type SolveOrderSnapshot = {
  checks: SolveOrderCheck[];
  metric: {
    family: string | null;
    chartLabel: string | null;
    dtGammaPolicy: string | null;
    contractStatus: string | null;
    contractReason: string | null;
    coordinateMap: string | null;
    alpha: number | null;
    gammaDiag: [number, number, number] | null;
    betaMethod: string | null;
    thetaMax: number | null;
    thetaRms: number | null;
    curlMax: number | null;
    curlRms: number | null;
    thetaConformalMax: number | null;
    thetaConformalRms: number | null;
    bPrimeOverBMax: number | null;
    bDoubleOverBMax: number | null;
    sampleCount: number | null;
    stepM: number | null;
    note: string | null;
  };
  derived: {
    thetaGeom: number | null;
    kTraceMean: number | null;
    parity: "aligned" | "mismatch" | "unknown";
    parityNote: string;
    natarioConstraint: boolean | null;
  };
  stress: {
    ref: string | null;
    source: string | null;
    contractStatus: string | null;
    contractReason: string | null;
    observer: string | null;
    normalization: string | null;
    unitSystem: string | null;
    rhoGeomMean: number | null;
    rhoSiMean: number | null;
    sampleCount: number | null;
    stepM: number | null;
    scaleM: number | null;
  };
  constraints: {
    H_rms: number | null;
    M_rms: number | null;
    H_maxAbs: number | null;
    M_maxAbs: number | null;
    H_rms_max: number | null;
    M_rms_max: number | null;
    H_maxAbs_max: number | null;
    M_maxAbs_max: number | null;
    gateStatus: "pass" | "fail" | "unknown" | null;
    gateMode: string | null;
    unknownAsFail: boolean | null;
  };
  provenance: {
    frameModeSource: string | null;
    energyModeSource: string | null;
    driveModeSource: string | null;
    worldtubeModeSource: string | null;
    constraintSource: string | null;
    observationTimeMs: number | null;
  };
  optics?: {
    geodesicMode: string | null;
    scientificEnabled: boolean;
    metricAvailable: boolean;
    chart: string | null;
    consistency: "ok" | "warn" | "fail" | "unknown";
    consistencyNote: string | null;
    maxNullResidual: number | null;
    stepConvergence: number | null;
    bundleSpread: number | null;
  };
  displacement?: {
    status: SolveOrderStatus;
    analyticStatus?: SolveOrderStatus;
    integralStatus?: SolveOrderStatus;
    metricChannel: string | null;
    chartLabel: string | null;
    coordinateMap: string | null;
    metricRadiusM: [number | null, number | null, number | null];
    renderedRadiusM: [number | null, number | null, number | null];
    axisDeltaM: [number | null, number | null, number | null];
    axisDeltaPct: [number | null, number | null, number | null];
    rmsDeltaM: number | null;
    rmsDeltaPct: number | null;
    maxAbsDeltaM: number | null;
    worldtubeRadiusM: number | null;
    worldtubeDeltaM: number | null;
    samplingPoints: number | null;
    symmetryErrorM: [number | null, number | null, number | null];
    integralSignal?: {
      source: string | null;
      updatedAtMs: number | null;
      ageMs: number | null;
      coveragePct: number | null;
      depthMinM: number | null;
      depthMaxM: number | null;
      depthMeanM: number | null;
      fitScalePxPerM: number | null;
      fitZOffsetM: number | null;
      fitSign: number | null;
      rmsZResidualM: number | null;
      maxAbsZResidualM: number | null;
      hausdorffM: number | null;
      rmsPassMaxM: number | null;
      rmsWarnMaxM: number | null;
      maxAbsPassMaxM: number | null;
      maxAbsWarnMaxM: number | null;
      hausdorffPassMaxM: number | null;
      hausdorffWarnMaxM: number | null;
      rmsStatus: SolveOrderStatus;
      maxAbsStatus: SolveOrderStatus;
      hausdorffStatus: SolveOrderStatus;
      statusReason: string | null;
      sampleCount: number | null;
      note: string | null;
    };
    note: string | null;
  };
  lightCross: {
    tauLCms: number | null;
    burstMs: number | null;
    dwellMs: number | null;
    dutyPct: number | null;
  };
  guardrails: {
    zetaValue: number | null;
    zetaLimit: number | null;
    tsRatio: number | null;
    fordRomanCompliance: boolean | null;
    natarioConstraint: boolean | null;
    viabilityStatus: string | null;
    certificateHash: string | null;
    integrityOk: boolean | null;
    firstHardFail: string | null;
  };
};

type MetricFrameLensProps = {
  className?: string;
  thetaExpected: number;
  thetaPeak: number;
  thetaTail: number;
  beta: number;
  sigma: number;
  R: number;
  lightCrossText: string;
  lightCrossTitle: string;
  hullText: string;
  hullTitle: string;
  driveText: string;
  driveTitle: string;
  activeMode: 0 | 1 | 2 | 3;
  onSelectMode: (mode: 0 | 1 | 2 | 3) => void;
  warpFieldType?: string;
  solveOrder?: SolveOrderSnapshot | null;
};

type MercurySignal = {
  arcsec: number | null;
  perOrbit: number | null;
  source: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const fmt = (value: number | null | undefined, digits = 2) => {
  if (!Number.isFinite(value ?? NaN)) return "--";
  const abs = Math.abs(value as number);
  if (abs !== 0 && (abs >= 1e4 || abs < 1e-2)) return (value as number).toExponential(2);
  return (value as number).toFixed(digits);
};

const fmtSigned = (value: number | null | undefined, digits = 2) => {
  if (!Number.isFinite(value ?? NaN)) return "--";
  return `${(value as number) >= 0 ? "+" : ""}${fmt(value, digits)}`;
};

const fmtTriplet = (
  values: [number | null, number | null, number | null] | null | undefined,
  digits = 2,
  signed = false,
) => {
  if (!values) return "--";
  const formatter = signed ? fmtSigned : fmt;
  return `${formatter(values[0], digits)}, ${formatter(values[1], digits)}, ${formatter(values[2], digits)}`;
};

const statusClass: Record<SolveOrderStatus, string> = {
  pass: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
  warn: "border-amber-400/25 bg-amber-500/10 text-amber-100",
  fail: "border-rose-400/30 bg-rose-500/15 text-rose-100",
  unknown: "border-slate-500/30 bg-slate-800/60 text-slate-200",
};

const statusLabel: Record<SolveOrderStatus, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  unknown: "UNKNOWN",
};

const statusTextClass: Record<SolveOrderStatus, string> = {
  pass: "text-emerald-100",
  warn: "text-amber-100",
  fail: "text-rose-100",
  unknown: "text-slate-300",
};

const residualStatusClass: Record<"pass" | "fail" | "unknown", string> = {
  pass: "text-emerald-100",
  fail: "text-rose-100",
  unknown: "text-slate-300",
};

const residualGateClass: Record<"pass" | "fail" | "unknown", string> = {
  pass: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100",
  fail: "border-rose-300/25 bg-rose-500/10 text-rose-100",
  unknown: "border-slate-300/20 bg-slate-800/60 text-slate-200",
};

const classifyResidual = (value: number | null | undefined, limit: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN) || !Number.isFinite(limit ?? NaN)) return "unknown";
  return (value as number) <= (limit as number) ? "pass" : "fail";
};

const formatResidual = (
  value: number | null | undefined,
  limit: number | null | undefined,
  digits = 3,
) => {
  const vKnown = Number.isFinite(value ?? NaN);
  const lKnown = Number.isFinite(limit ?? NaN);
  if (!vKnown && !lKnown) return "--";
  if (!lKnown) return fmt(value, digits);
  return `${fmt(value, digits)} <= ${fmt(limit, digits)}`;
};

const formatBandThreshold = (
  value: number | null | undefined,
  passMax: number | null | undefined,
  warnMax: number | null | undefined,
  unit = "",
  digits = 3,
) => {
  const vKnown = Number.isFinite(value ?? NaN);
  const pKnown = Number.isFinite(passMax ?? NaN);
  const wKnown = Number.isFinite(warnMax ?? NaN);
  if (!vKnown && !pKnown && !wKnown) return "--";
  return `${fmt(value, digits)}${unit} <= ${fmt(passMax, digits)}${unit} pass | <= ${fmt(warnMax, digits)}${unit} warn`;
};

const fmtUtc = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN)) return "--";
  try {
    return new Date(value as number).toISOString();
  } catch {
    return "--";
  }
};

type ResidualHistoryPoint = {
  t: number;
  H_rms: number | null;
  M_rms: number | null;
  H_rms_max: number | null;
  M_rms_max: number | null;
  gateStatus: "pass" | "fail" | "unknown";
};

function orbitPoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  theta: number,
) {
  const angle = (rotationDeg * Math.PI) / 180;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const x = rx * Math.cos(theta);
  const y = ry * Math.sin(theta);
  const xr = x * cosAngle - y * sinAngle;
  const yr = x * sinAngle + y * cosAngle;
  return { x: cx + xr, y: cy + yr };
}

function orbitPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  segments = 120,
) {
  let d = "";
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const p = orbitPoint(cx, cy, rx, ry, rotationDeg, theta);
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function chipClass(active: boolean, tone: "cyan" | "amber" | "emerald" | "slate" = "slate") {
  const base = "rounded-lg border px-2 py-1 transition";
  const activeTone = {
    cyan: "border-cyan-400/30 bg-cyan-400/12 text-cyan-50",
    amber: "border-amber-400/30 bg-amber-400/12 text-amber-50",
    emerald: "border-emerald-400/30 bg-emerald-400/12 text-emerald-50",
    slate: "border-white/15 bg-white/10 text-slate-100",
  }[tone];
  const inactiveTone = {
    cyan: "border-cyan-400/10 bg-cyan-400/5 text-cyan-100/70 hover:bg-cyan-400/10 hover:text-cyan-50",
    amber: "border-amber-400/10 bg-amber-400/5 text-amber-100/70 hover:bg-amber-400/10 hover:text-amber-50",
    emerald: "border-emerald-400/10 bg-emerald-400/5 text-emerald-100/70 hover:bg-emerald-400/10 hover:text-emerald-50",
    slate: "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100",
  }[tone];
  return cn(base, active ? activeTone : inactiveTone);
}

const toneFromBoolean = (value: boolean | null | undefined) => {
  if (value === true) return "text-emerald-100";
  if (value === false) return "text-rose-100";
  return "text-slate-300";
};

const labelFromBoolean = (value: boolean | null | undefined) => {
  if (value === true) return "pass";
  if (value === false) return "fail";
  return "--";
};

function DetailRow({
  label,
  value,
  title,
  valueClassName,
}: {
  label: string;
  value: string;
  title?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span
        className={cn("max-w-[62%] truncate text-right font-mono text-slate-100", valueClassName)}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

export default function MetricFrameLens({
  className,
  thetaExpected,
  thetaPeak,
  thetaTail,
  beta,
  sigma,
  R,
  lightCrossText,
  lightCrossTitle,
  hullText,
  hullTitle,
  driveText,
  driveTitle,
  activeMode,
  onSelectMode,
  warpFieldType,
  solveOrder,
}: MetricFrameLensProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [lane, setLane] = useState<"scientific" | "teaching">("scientific");
  const [inflate, setInflate] = useState(24);
  const [showReference, setShowReference] = useState(true);
  const [showMercury, setShowMercury] = useState(true);
  const [showWorldTube, setShowWorldTube] = useState(true);
  const [mercurySignal, setMercurySignal] = useState<MercurySignal | null>(null);
  const [residualHistory, setResidualHistory] = useState<ResidualHistoryPoint[]>([]);

  useEffect(() => {
    let alive = true;

    const sample = () => {
      if (typeof window === "undefined") return;
      const fn = (window as any).accrueGR_arcsec;
      if (typeof fn !== "function") return;
      try {
        const end = Date.now();
        const start = end - 100 * 365.25 * 24 * 60 * 60 * 1000;
        const next = fn("mercury", start, end);
        if (!next || !alive) return;
        const arcsec = Number(next.arcsec);
        const perOrbit = Number(next.perOrbit_as);
        setMercurySignal({
          arcsec: Number.isFinite(arcsec) ? arcsec : null,
          perOrbit: Number.isFinite(perOrbit) ? perOrbit : null,
          source: "linked Mercury GR",
        });
      } catch {
        // Keep viewer stable if the optional Mercury accumulator is absent.
      }
    };

    sample();
    if (typeof window === "undefined") {
      return () => {
        alive = false;
      };
    }

    const timer = window.setInterval(sample, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const baselineArcsec = mercurySignal?.arcsec ?? 43;
  const exaggeratedArcsec = baselineArcsec * clamp(inflate, 1, 240);
  const precessionDeg = exaggeratedArcsec / 3600;
  const worldTubeOpacity = clamp(0.24 + 0.08 * Math.log10(Math.abs(thetaPeak) + 1), 0.24, 0.72);

  const referenceOrbit = useMemo(() => orbitPath(180, 92, 78, 40, -7), []);
  const processionOrbit = useMemo(
    () => orbitPath(180, 92, 78, 40, -7 + precessionDeg),
    [precessionDeg],
  );
  const referencePoint = useMemo(() => orbitPoint(180, 92, 78, 40, -7, 0), []);
  const processionPoint = useMemo(
    () => orbitPoint(180, 92, 78, 40, -7 + precessionDeg, 0),
    [precessionDeg],
  );

  const modeButtons: Array<{
    mode: 0 | 1 | 2 | 3;
    label: string;
    title: string;
    tone: "cyan" | "amber" | "emerald" | "slate";
  }> = [
    { mode: 0, label: "Frame", title: "Reference-frame expansion slice", tone: "cyan" },
    { mode: 1, label: "Energy", title: "Hamiltonian energy density slice", tone: "amber" },
    { mode: 2, label: "Drive", title: "Drive-scaled expansion slice", tone: "emerald" },
    { mode: 3, label: "Worldtube", title: "Hull and worldtube lens", tone: "slate" },
  ];

  const checks = solveOrder?.checks ?? [];
  const metric = solveOrder?.metric ?? null;
  const derived = solveOrder?.derived ?? null;
  const stress = solveOrder?.stress ?? null;
  const constraints = solveOrder?.constraints ?? null;
  const provenance = solveOrder?.provenance ?? null;
  const optics = solveOrder?.optics ?? null;
  const displacement = solveOrder?.displacement ?? null;
  const integral = displacement?.integralSignal ?? null;
  const guard = solveOrder?.guardrails ?? null;
  const lightCross = solveOrder?.lightCross ?? null;

  const certShort = guard?.certificateHash ? `${guard.certificateHash.slice(0, 12)}...` : "--";
  const dutyKnown = Number.isFinite(lightCross?.dutyPct ?? NaN);
  const burstDuty = dutyKnown ? clamp(lightCross?.dutyPct ?? 0, 0, 100) : 0;
  const dwellDuty = dutyKnown ? 100 - burstDuty : 0;
  const frameTarget = metric?.coordinateMap ?? metric?.chartLabel ?? "bubble-centered coordinates";
  const frameReference = stress?.observer ?? "eulerian_congruence";
  const frameState =
    Number.isFinite(derived?.thetaGeom ?? NaN) || Number.isFinite(derived?.kTraceMean ?? NaN)
      ? `theta=${fmtSigned(derived?.thetaGeom, 3)} | -K=${fmtSigned(
          Number.isFinite(derived?.kTraceMean ?? NaN) ? -(derived?.kTraceMean ?? 0) : null,
          3,
        )}`
      : "theta/K state unavailable";
  const metricLayer = `alpha=${fmt(metric?.alpha, 3)} | gamma=${
    metric?.gammaDiag
      ? `[${fmt(metric.gammaDiag[0], 2)},${fmt(metric.gammaDiag[1], 2)},${fmt(metric.gammaDiag[2], 2)}]`
      : "--"
  } | beta=${metric?.betaMethod ?? "--"}`;
  const inferredGateStatus = constraints?.gateStatus ?? "unknown";
  const modeSourceSummary = `${provenance?.frameModeSource ?? "frame:--"} | ${provenance?.energyModeSource ?? "energy:--"} | ${provenance?.driveModeSource ?? "drive:--"} | ${provenance?.worldtubeModeSource ?? "worldtube:--"}`;

  useEffect(() => {
    const next: ResidualHistoryPoint = {
      t: provenance?.observationTimeMs ?? Date.now(),
      H_rms: constraints?.H_rms ?? null,
      M_rms: constraints?.M_rms ?? null,
      H_rms_max: constraints?.H_rms_max ?? null,
      M_rms_max: constraints?.M_rms_max ?? null,
      gateStatus: inferredGateStatus,
    };
    setResidualHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.H_rms === next.H_rms &&
        last.M_rms === next.M_rms &&
        last.H_rms_max === next.H_rms_max &&
        last.M_rms_max === next.M_rms_max &&
        last.gateStatus === next.gateStatus
      ) {
        return prev;
      }
      const merged = [...prev, next];
      return merged.slice(Math.max(0, merged.length - 120));
    });
  }, [
    constraints?.H_rms,
    constraints?.M_rms,
    constraints?.H_rms_max,
    constraints?.M_rms_max,
    inferredGateStatus,
    provenance?.observationTimeMs,
  ]);

  const residualSpark = useMemo(() => {
    const points = residualHistory;
    if (points.length < 2) {
      return {
        hPath: "",
        mPath: "",
        hThresh: "",
        mThresh: "",
      };
    }
    const width = 336;
    const height = 104;
    const logEps = 1e-16;
    const values = points.flatMap((p) => {
      const list: number[] = [];
      if (Number.isFinite(p.H_rms ?? NaN)) list.push(Math.log10(Math.max(logEps, p.H_rms as number)));
      if (Number.isFinite(p.M_rms ?? NaN)) list.push(Math.log10(Math.max(logEps, p.M_rms as number)));
      if (Number.isFinite(p.H_rms_max ?? NaN)) list.push(Math.log10(Math.max(logEps, p.H_rms_max as number)));
      if (Number.isFinite(p.M_rms_max ?? NaN)) list.push(Math.log10(Math.max(logEps, p.M_rms_max as number)));
      return list;
    });
    const yMin = values.length ? Math.min(...values) : -12;
    const yMaxRaw = values.length ? Math.max(...values) : 0;
    const yMax = yMaxRaw - yMin < 1e-9 ? yMin + 1 : yMaxRaw;
    const xAt = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * width);
    const yAt = (value: number) => {
      const v = Math.log10(Math.max(logEps, value));
      const norm = (v - yMin) / (yMax - yMin);
      return height * (1 - clamp(norm, 0, 1));
    };
    const buildPath = (pick: (p: ResidualHistoryPoint) => number | null | undefined) => {
      let path = "";
      for (let i = 0; i < points.length; i += 1) {
        const value = pick(points[i]);
        if (!Number.isFinite(value ?? NaN)) continue;
        path += `${path.length ? " L " : "M "}${xAt(i).toFixed(2)} ${yAt(value as number).toFixed(2)}`;
      }
      return path;
    };
    const hThreshValue = points[points.length - 1]?.H_rms_max;
    const mThreshValue = points[points.length - 1]?.M_rms_max;
    const hThresh =
      Number.isFinite(hThreshValue ?? NaN)
        ? `M 0 ${yAt(hThreshValue as number).toFixed(2)} L ${width.toFixed(2)} ${yAt(hThreshValue as number).toFixed(2)}`
        : "";
    const mThresh =
      Number.isFinite(mThreshValue ?? NaN)
        ? `M 0 ${yAt(mThreshValue as number).toFixed(2)} L ${width.toFixed(2)} ${yAt(mThreshValue as number).toFixed(2)}`
        : "";
    return {
      hPath: buildPath((p) => p.H_rms),
      mPath: buildPath((p) => p.M_rms),
      hThresh,
      mThresh,
    };
  }, [residualHistory]);

  const nullCone = useMemo(() => {
    const alphaLocal = Number.isFinite(metric?.alpha ?? NaN) ? (metric?.alpha as number) : 1;
    const betaShift = Number.isFinite(beta) ? beta : 0;
    const cPlus = -betaShift + alphaLocal;
    const cMinus = -betaShift - alphaLocal;
    const bubbleTimelike = Math.abs(betaShift) < alphaLocal;
    return {
      alphaLocal,
      betaShift,
      cPlus,
      cMinus,
      bubbleTimelike,
    };
  }, [metric?.alpha, beta]);

  const exportSolveFrame = () => {
    if (typeof window === "undefined") return;
    const payload = {
      exportedAt: new Date().toISOString(),
      lane,
      mode: activeMode,
      warpFieldType: warpFieldType ?? null,
      snapshot: solveOrder ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.download = `nhm2-solve-frame-${ts}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportMetricXdmf = () => {
    if (typeof window === "undefined") return;
    const latest = (window as any).__hullMetricVolumeLatest as HullMetricVolumeContract | null | undefined;
    if (!latest || latest.kind !== "hull3d:metric-volume") return;
    const artifacts = buildMetricXdmfArtifacts(latest);
    if (solveOrder?.optics) {
      const stamp = new Date(latest.updatedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
      artifacts.push({
        filename: `nhm2-metric-diagnostics-${stamp}.json`,
        blob: new Blob(
          [
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    optics: solveOrder.optics,
                    displacement: solveOrder.displacement ?? null,
                    provenance: solveOrder.provenance,
                  },
                  null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      });
    }
    for (const artifact of artifacts) {
      const url = URL.createObjectURL(artifact.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };
  const metricExportAvailable =
    typeof window !== "undefined" &&
    Boolean((window as any).__hullMetricVolumeLatest);

  return (
    <div
      className={cn(
        "pointer-events-auto w-[22rem] max-w-[calc(100%-1rem)] sm:w-[27rem]",
        "rounded-2xl border border-cyan-400/20 bg-slate-950/92 shadow-2xl shadow-black/50 backdrop-blur-md",
        "max-h-[calc(100%-1rem)] overflow-hidden",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/20 via-slate-950 to-emerald-500/15 px-3 py-2">
        <div>
          <div className="text-[0.62rem] uppercase tracking-[0.28em] text-cyan-100/75">NHM2 solve lens</div>
          <div className="text-sm font-semibold text-slate-50">Canonical 3+1 chain: metric to worldtube</div>
          <div className="text-[0.62rem] text-slate-400">
            field={warpFieldType ?? "unknown"} | chart={metric?.chartLabel ?? "--"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] text-slate-200 hover:bg-white/10 hover:text-white"
          title={collapsed ? "Open lens" : "Collapse lens"}
        >
          {collapsed ? "Open" : "Hide"}
        </button>
      </div>

      {collapsed ? (
        <div className="px-3 py-2 text-[0.65rem] text-slate-300">
          Solve lens collapsed. Main viewer remains active.
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {modeButtons.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                onClick={() => onSelectMode(entry.mode)}
                className={chipClass(activeMode === entry.mode, entry.tone)}
                title={entry.title}
              >
                <div className="text-[0.58rem] uppercase tracking-[0.18em] opacity-70">mode</div>
                <div className="text-[0.74rem] font-semibold">{entry.label}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLane("scientific")}
              className={chipClass(lane === "scientific", "cyan")}
              title="Scientific lane keeps displays tied to solver diagnostics and canonical labels."
            >
              <div className="text-[0.58rem] uppercase tracking-[0.18em] opacity-70">lane</div>
              <div className="text-[0.74rem] font-semibold">Scientific</div>
            </button>
            <button
              type="button"
              onClick={() => setLane("teaching")}
              className={chipClass(lane === "teaching", "amber")}
              title="Teaching lane keeps explanatory inflation panels."
            >
              <div className="text-[0.58rem] uppercase tracking-[0.18em] opacity-70">lane</div>
              <div className="text-[0.74rem] font-semibold">Teaching</div>
            </button>
            <button
              type="button"
              onClick={exportSolveFrame}
              className="ml-auto rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[0.66rem] text-slate-100 hover:bg-white/15"
              title="Export the current solve frame snapshot as JSON."
            >
              Export Frame
            </button>
            <button
              type="button"
              onClick={exportMetricXdmf}
              disabled={!metricExportAvailable}
              className={cn(
                "rounded-lg border px-2 py-1 text-[0.66rem]",
                metricExportAvailable
                  ? "border-cyan-300/25 bg-cyan-500/15 text-cyan-50 hover:bg-cyan-500/20"
                  : "border-slate-500/30 bg-slate-900/70 text-slate-400",
              )}
              title="Export metric volume as XDMF + float32 channel binaries."
            >
              Export XDMF
            </button>
          </div>

          {lane === "scientific" ? (
            <>

          {checks.length ? (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-[0.64rem]",
                    statusClass[check.status],
                  )}
                  title={check.note}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate uppercase tracking-[0.14em]">{check.label}</span>
                    <span className="font-semibold">{statusLabel[check.status]}</span>
                  </div>
                  <div className="truncate text-[0.6rem] opacity-85">{check.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5 text-[0.64rem] text-slate-300">
              Solve-order checks unavailable for this snapshot.
            </div>
          )}

          <div className="rounded-xl border border-indigo-300/15 bg-indigo-500/5 px-2 py-2 text-[0.66rem] text-slate-200">
            <div className="mb-1 uppercase tracking-[0.16em] text-indigo-100">reference stack: kinematics plus metric</div>
            <div className="grid gap-1">
              <DetailRow
                label="target"
                value={frameTarget}
                title="Worldtube target coordinates (chart/coordinate map)"
              />
              <DetailRow
                label="reference"
                value={frameReference}
                title="Observer congruence used for local measurements"
              />
              <DetailRow
                label="state"
                value={frameState}
                title="Relative state diagnostic from geometry-derived theta and K-trace"
              />
              <DetailRow
                label="metric layer"
                value={metricLayer}
                title="ADM layer that sets distance, duration, simultaneity, and local speed semantics"
              />
            </div>
            <div className="mt-1 font-mono text-[0.6rem] text-indigo-100/90">
              state = target - reference (kinematics), interpreted through (alpha, beta_i, gamma_ij)
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[0.64rem] text-slate-200">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="uppercase tracking-[0.16em] text-slate-300">canonical relation panels</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[0.56rem] uppercase tracking-[0.14em]",
                  residualGateClass[inferredGateStatus],
                )}
                title="BSSN gate status from solved residuals and policy thresholds"
              >
                gate {statusLabel[inferredGateStatus]}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-cyan-400/15 bg-cyan-500/5 px-2 py-1.5">
                <div className="mb-1 uppercase tracking-[0.14em] text-cyan-100/85">ADM primitives</div>
                <div className="grid gap-1">
                  <DetailRow label="alpha (lapse)" value={fmt(metric?.alpha, 3)} />
                  <DetailRow label="beta^i (shift)" value={metric?.betaMethod ?? "--"} />
                  <DetailRow
                    label="gamma_ij"
                    value={
                      metric?.gammaDiag
                        ? `${fmt(metric.gammaDiag[0], 2)},${fmt(metric.gammaDiag[1], 2)},${fmt(metric.gammaDiag[2], 2)}`
                        : "--"
                    }
                  />
                  <DetailRow label="chart/policy" value={`${metric?.chartLabel ?? "--"} / ${metric?.dtGammaPolicy ?? "--"}`} />
                </div>
              </div>

              <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/5 px-2 py-1.5">
                <div className="mb-1 uppercase tracking-[0.14em] text-emerald-100/85">Derived Kinematics</div>
                <div className="grid gap-1">
                  <DetailRow label="theta_geom" value={fmtSigned(derived?.thetaGeom, 3)} />
                  <DetailRow label="K_trace" value={fmtSigned(derived?.kTraceMean, 3)} />
                  <DetailRow
                    label="theta = -K"
                    value={derived?.parity ?? "unknown"}
                    title={derived?.parityNote}
                    valueClassName={
                      derived?.parity === "aligned"
                        ? "text-emerald-100"
                        : derived?.parity === "mismatch"
                          ? "text-rose-100"
                          : "text-slate-300"
                    }
                  />
                  <DetailRow
                    label="natario ctrl"
                    value={labelFromBoolean(derived?.natarioConstraint)}
                    valueClassName={toneFromBoolean(derived?.natarioConstraint)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 px-2 py-1.5">
                <div className="mb-1 uppercase tracking-[0.14em] text-amber-100/85">Stress-Energy Lane</div>
                <div className="grid gap-1">
                  <DetailRow label="ref/source" value={`${stress?.ref ?? "--"} | ${stress?.source ?? "--"}`} />
                  <DetailRow label="observer" value={stress?.observer ?? "--"} />
                  <DetailRow label="rho_geom" value={fmt(stress?.rhoGeomMean, 3)} />
                  <DetailRow
                    label="rho_SI"
                    value={Number.isFinite(stress?.rhoSiMean ?? NaN) ? `${fmt(stress?.rhoSiMean, 3)} J/m^3` : "--"}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-violet-400/15 bg-violet-500/5 px-2 py-1.5">
                <div className="mb-1 uppercase tracking-[0.14em] text-violet-100/85">Constraint Residuals</div>
                <div className="grid gap-1">
                  <DetailRow
                    label="H_rms"
                    value={formatResidual(constraints?.H_rms, constraints?.H_rms_max, 3)}
                    valueClassName={residualStatusClass[classifyResidual(constraints?.H_rms, constraints?.H_rms_max)]}
                  />
                  <DetailRow
                    label="M_rms"
                    value={formatResidual(constraints?.M_rms, constraints?.M_rms_max, 3)}
                    valueClassName={residualStatusClass[classifyResidual(constraints?.M_rms, constraints?.M_rms_max)]}
                  />
                  <DetailRow
                    label="H_maxAbs"
                    value={formatResidual(constraints?.H_maxAbs, constraints?.H_maxAbs_max, 3)}
                    valueClassName={residualStatusClass[classifyResidual(constraints?.H_maxAbs, constraints?.H_maxAbs_max)]}
                  />
                  <DetailRow
                    label="M_maxAbs"
                    value={formatResidual(constraints?.M_maxAbs, constraints?.M_maxAbs_max, 3)}
                    valueClassName={residualStatusClass[classifyResidual(constraints?.M_maxAbs, constraints?.M_maxAbs_max)]}
                  />
                  <DetailRow
                    label="policy"
                    value={`${constraints?.gateMode ?? "--"} | unknownAsFail=${constraints?.unknownAsFail == null ? "--" : constraints.unknownAsFail ? "true" : "false"}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-300/15 bg-slate-900/50 px-2 py-2 text-[0.64rem] text-slate-200">
              <div className="mb-1 uppercase tracking-[0.16em] text-slate-300">provenance</div>
              <div className="grid gap-1">
                <DetailRow label="render modes" value={modeSourceSummary} title={modeSourceSummary} />
                <DetailRow label="constraint source" value={provenance?.constraintSource ?? "--"} />
                <DetailRow label="observation" value={fmtUtc(provenance?.observationTimeMs)} />
                <DetailRow label="lane" value={lane} />
              </div>
            </div>

            <div className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-500/5 px-2 py-2 text-[0.64rem] text-slate-200">
              <div className="mb-1 uppercase tracking-[0.16em] text-fuchsia-100">constraint trend (log10)</div>
              <svg viewBox="0 0 336 104" className="block h-auto w-full" role="img" aria-label="Constraint residual trend">
                <rect x="0" y="0" width="336" height="104" rx="10" fill="rgba(2,6,23,0.42)" />
                <g opacity="0.25" stroke="rgba(148,163,184,0.3)" strokeWidth="1">
                  {[20, 40, 60, 80].map((y) => (
                    <line key={`grid-y-${y}`} x1="0" y1={y} x2="336" y2={y} />
                  ))}
                </g>
                {residualSpark.hThresh ? (
                  <path d={residualSpark.hThresh} fill="none" stroke="rgba(34,197,94,0.65)" strokeDasharray="4 3" strokeWidth="1.2" />
                ) : null}
                {residualSpark.mThresh ? (
                  <path d={residualSpark.mThresh} fill="none" stroke="rgba(245,158,11,0.65)" strokeDasharray="4 3" strokeWidth="1.2" />
                ) : null}
                {residualSpark.hPath ? <path d={residualSpark.hPath} fill="none" stroke="rgba(94,234,212,0.9)" strokeWidth="2" /> : null}
                {residualSpark.mPath ? <path d={residualSpark.mPath} fill="none" stroke="rgba(251,191,36,0.9)" strokeWidth="2" /> : null}
              </svg>
              <div className="mt-1 flex items-center gap-3 text-[0.58rem] text-slate-300">
                <span className="font-mono text-cyan-100">H_rms</span>
                <span className="font-mono text-amber-100">M_rms</span>
                <span className="font-mono text-emerald-100">dashed = threshold</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-300/15 bg-cyan-500/5 px-2 py-2 text-[0.64rem] text-slate-200">
            <div className="mb-1 uppercase tracking-[0.16em] text-cyan-100">null-geodesic diagnostics</div>
            <div className="grid gap-1 sm:grid-cols-2">
              <DetailRow
                label="mode"
                value={optics?.geodesicMode ?? "--"}
                valueClassName={
                  optics?.geodesicMode === "full-3+1-christoffel"
                    ? "text-emerald-100"
                    : optics?.geodesicMode === "reduced-1+1-fallback"
                      ? "text-amber-100"
                      : "text-slate-200"
                }
              />
              <DetailRow label="metric chart" value={optics?.chart ?? "--"} />
              <DetailRow
                label="max |gkk|"
                value={fmt(optics?.maxNullResidual, 3)}
                valueClassName={residualStatusClass[classifyResidual(optics?.maxNullResidual, 1e-3)]}
              />
              <DetailRow
                label="step conv"
                value={fmt(optics?.stepConvergence, 3)}
                valueClassName={residualStatusClass[classifyResidual(optics?.stepConvergence, 1e-2)]}
              />
              <DetailRow
                label="bundle spread"
                value={fmt(optics?.bundleSpread, 3)}
                valueClassName={residualStatusClass[classifyResidual(optics?.bundleSpread, 0.5)]}
              />
              <DetailRow
                label="consistency"
                value={optics?.consistency ?? "unknown"}
                title={optics?.consistencyNote ?? undefined}
                valueClassName={
                  optics?.consistency === "ok"
                    ? "text-emerald-100"
                    : optics?.consistency === "warn"
                      ? "text-amber-100"
                      : optics?.consistency === "fail"
                        ? "text-rose-100"
                        : "text-slate-300"
                }
              />
            </div>
            <div className="mt-1 text-[0.58rem] text-cyan-100/80">
              Scientific lane runs full 3+1 Christoffel optics when metric volume is consistent; reduced 1+1 stays as labeled fallback.
            </div>
          </div>

          <div className="rounded-xl border border-emerald-300/15 bg-emerald-500/5 px-2 py-2 text-[0.64rem] text-slate-200">
            <div className="mb-1 uppercase tracking-[0.16em] text-emerald-100">render-vs-metric displacement</div>
            <div className="grid gap-1 sm:grid-cols-2">
              <DetailRow
                label="status"
                value={displacement?.status ?? "unknown"}
                valueClassName={
                  displacement?.status === "pass"
                    ? "text-emerald-100"
                    : displacement?.status === "warn"
                      ? "text-amber-100"
                      : displacement?.status === "fail"
                        ? "text-rose-100"
                        : "text-slate-300"
                }
              />
              <DetailRow label="analytic / integral" value={`${displacement?.analyticStatus ?? "--"} / ${displacement?.integralStatus ?? "--"}`} />
              <DetailRow label="channel" value={displacement?.metricChannel ?? "--"} />
              <DetailRow label="metric r(x,y,z)" value={fmtTriplet(displacement?.metricRadiusM, 3)} />
              <DetailRow label="render r(x,y,z)" value={fmtTriplet(displacement?.renderedRadiusM, 3)} />
              <DetailRow label="delta m (x,y,z)" value={fmtTriplet(displacement?.axisDeltaM, 3, true)} />
              <DetailRow label="delta pct" value={fmtTriplet(displacement?.axisDeltaPct, 2, true)} />
              <DetailRow label="rms / max abs" value={`${fmt(displacement?.rmsDeltaM, 3)} / ${fmt(displacement?.maxAbsDeltaM, 3)} m`} />
              <DetailRow label="rms pct" value={Number.isFinite(displacement?.rmsDeltaPct ?? NaN) ? `${fmt(displacement?.rmsDeltaPct, 2)}%` : "--"} />
              <DetailRow label="worldtube delta" value={fmtSigned(displacement?.worldtubeDeltaM, 3)} />
              <DetailRow
                label="sym err (x,y,z)"
                value={fmtTriplet(displacement?.symmetryErrorM, 3)}
                title="Absolute difference between +axis and -axis shell picks from metric sampling."
              />
              <DetailRow label="integral src" value={integral?.source ?? "--"} />
              <DetailRow label="integral age ms" value={fmt(integral?.ageMs, 0)} />
              <DetailRow
                label="integral coverage"
                value={Number.isFinite(integral?.coveragePct ?? NaN) ? `${fmt(integral?.coveragePct, 2)}%` : "--"}
              />
              <DetailRow
                label="depth min/max"
                value={`${fmt(integral?.depthMinM, 3)} / ${fmt(integral?.depthMaxM, 3)} m`}
              />
              <DetailRow label="depth mean" value={`${fmt(integral?.depthMeanM, 3)} m`} />
              <DetailRow
                label="fit scale"
                value={Number.isFinite(integral?.fitScalePxPerM ?? NaN) ? `${fmt(integral?.fitScalePxPerM, 3)} px/m` : "--"}
              />
              <DetailRow label="fit z0/sign" value={`${fmtSigned(integral?.fitZOffsetM, 3)} / ${fmtSigned(integral?.fitSign, 0)}`} />
              <DetailRow label="z rms / max" value={`${fmt(integral?.rmsZResidualM, 3)} / ${fmt(integral?.maxAbsZResidualM, 3)} m`} />
              <DetailRow label="hausdorff" value={`${fmt(integral?.hausdorffM, 3)} m`} />
              <DetailRow
                label="rms gate"
                value={`${statusLabel[integral?.rmsStatus ?? "unknown"]} | ${formatBandThreshold(
                  integral?.rmsZResidualM,
                  integral?.rmsPassMaxM,
                  integral?.rmsWarnMaxM,
                  " m",
                  3,
                )}`}
                valueClassName={statusTextClass[integral?.rmsStatus ?? "unknown"]}
              />
              <DetailRow
                label="max abs gate"
                value={`${statusLabel[integral?.maxAbsStatus ?? "unknown"]} | ${formatBandThreshold(
                  integral?.maxAbsZResidualM,
                  integral?.maxAbsPassMaxM,
                  integral?.maxAbsWarnMaxM,
                  " m",
                  3,
                )}`}
                valueClassName={statusTextClass[integral?.maxAbsStatus ?? "unknown"]}
              />
              <DetailRow
                label="hausdorff gate"
                value={`${statusLabel[integral?.hausdorffStatus ?? "unknown"]} | ${formatBandThreshold(
                  integral?.hausdorffM,
                  integral?.hausdorffPassMaxM,
                  integral?.hausdorffWarnMaxM,
                  " m",
                  3,
                )}`}
                valueClassName={statusTextClass[integral?.hausdorffStatus ?? "unknown"]}
              />
              <DetailRow
                label="gate reason"
                value={integral?.statusReason ?? "--"}
                title={integral?.statusReason ?? undefined}
                valueClassName={
                  displacement?.integralStatus
                    ? statusTextClass[displacement.integralStatus]
                    : statusTextClass.unknown
                }
              />
              <DetailRow label="chart/map" value={`${displacement?.chartLabel ?? "--"} | ${displacement?.coordinateMap ?? "--"}`} />
              <DetailRow label="samples" value={fmt(displacement?.samplingPoints, 0)} />
              <DetailRow label="integral n" value={fmt(integral?.sampleCount, 0)} />
            </div>
            <div className="mt-1 text-[0.58rem] text-emerald-100/80">
              {displacement?.note ??
                "Computation requires a metric-volume channel (theta/K_trace/H_constraint) to sample shell radii."}
              {integral?.note ? ` | ${integral.note}` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-rose-300/15 bg-rose-500/5 px-2 py-2 text-[0.64rem] text-slate-200">
            <div className="mb-1 uppercase tracking-[0.16em] text-rose-100">causal panel (1+1 approximation)</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <svg viewBox="0 0 220 124" className="block h-auto w-full" role="img" aria-label="Worldtube causal panel">
                <rect x="0" y="0" width="220" height="124" rx="12" fill="rgba(2,6,23,0.45)" />
                <line x1="30" y1="108" x2="194" y2="108" stroke="rgba(148,163,184,0.4)" />
                <line x1="110" y1="108" x2="110" y2="16" stroke="rgba(148,163,184,0.4)" />
                <line x1="110" y1="24" x2={110 + nullCone.cPlus * 28} y2="96" stroke="rgba(56,189,248,0.9)" strokeWidth="2" />
                <line x1="110" y1="24" x2={110 + nullCone.cMinus * 28} y2="96" stroke="rgba(56,189,248,0.9)" strokeWidth="2" />
                <rect
                  x="100"
                  y="36"
                  width="20"
                  height="56"
                  rx="10"
                  fill={nullCone.bubbleTimelike ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)"}
                />
                <text x="16" y="20" fontSize="9" fill="rgba(226,232,240,0.9)">t</text>
                <text x="200" y="116" fontSize="9" fill="rgba(226,232,240,0.9)">z</text>
              </svg>
              <div className="grid gap-1">
                <DetailRow label="alpha" value={fmt(nullCone.alphaLocal, 3)} />
                <DetailRow label="beta shift" value={fmtSigned(nullCone.betaShift, 3)} />
                <DetailRow label="c_plus" value={fmtSigned(nullCone.cPlus, 3)} />
                <DetailRow label="c_minus" value={fmtSigned(nullCone.cMinus, 3)} />
                <DetailRow
                  label="worldtube class"
                  value={nullCone.bubbleTimelike ? "timelike" : "non-timelike"}
                  valueClassName={nullCone.bubbleTimelike ? "text-emerald-100" : "text-rose-100"}
                />
              </div>
            </div>
            <div className="mt-1 text-[0.58rem] text-rose-100/80">
              Local null-cone estimate uses c_+ = -beta + alpha and c_- = -beta - alpha in a reduced 1+1 chart view.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
              <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">theta expected</div>
              <div className="font-mono text-[0.74rem] text-cyan-100">{fmtSigned(thetaExpected, 2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
              <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">theta peak/tail</div>
              <div className="font-mono text-[0.74rem] text-amber-100">
                {fmtSigned(thetaPeak, 2)} / {fmtSigned(thetaTail, 2)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
              <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">beta / sigma</div>
              <div className="font-mono text-[0.74rem] text-slate-100">
                {fmt(beta, 3)} / {fmt(sigma, 3)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
              <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">R</div>
              <div className="font-mono text-[0.74rem] text-slate-100">{fmt(R, 3)} m</div>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 px-2 py-2 text-[0.66rem]">
            <div className="mb-1 uppercase tracking-[0.16em] text-cyan-200/90">stage 1: metric adapter</div>
            <div className="grid gap-1 text-slate-200">
              <DetailRow label="family" value={metric?.family ?? "--"} />
              <DetailRow label="chart" value={metric?.chartLabel ?? "--"} />
              <DetailRow label="contract" value={metric?.contractStatus ?? "--"} title={metric?.contractReason ?? undefined} />
              <DetailRow label="alpha" value={fmt(metric?.alpha, 3)} />
              <DetailRow
                label="gamma_ij"
                value={
                  metric?.gammaDiag
                    ? `${fmt(metric.gammaDiag[0], 2)},${fmt(metric.gammaDiag[1], 2)},${fmt(metric.gammaDiag[2], 2)}`
                    : "--"
                }
              />
              <DetailRow label="beta diag" value={metric?.betaMethod ?? "--"} title={metric?.note ?? undefined} />
              <DetailRow
                label="theta/curl"
                value={`${fmt(metric?.thetaMax, 2)}/${fmt(metric?.curlMax, 2)}`}
                title={`theta_rms=${fmt(metric?.thetaRms, 3)} | curl_rms=${fmt(metric?.curlRms, 3)}`}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-2 py-2 text-[0.66rem] text-slate-200">
              <div className="mb-1 uppercase tracking-[0.16em] text-emerald-200/90">stage 2: derived fields</div>
              <div className="grid gap-1">
                <DetailRow
                  label="theta_geom"
                  value={fmtSigned(derived?.thetaGeom, 3)}
                />
                <DetailRow
                  label="k_trace"
                  value={fmtSigned(derived?.kTraceMean, 3)}
                />
                <DetailRow
                  label="york parity"
                  value={derived?.parity ?? "unknown"}
                  title={derived?.parityNote}
                  valueClassName={
                    derived?.parity === "aligned"
                      ? "text-emerald-100"
                      : derived?.parity === "mismatch"
                        ? "text-rose-100"
                        : "text-slate-300"
                  }
                />
                <DetailRow
                  label="natario ctrl"
                  value={labelFromBoolean(derived?.natarioConstraint)}
                  valueClassName={toneFromBoolean(derived?.natarioConstraint)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 px-2 py-2 text-[0.66rem] text-slate-200">
              <div className="mb-1 uppercase tracking-[0.16em] text-amber-200/90">stage 3: metric T00 path</div>
              <div className="grid gap-1">
                <DetailRow label="ref" value={stress?.ref ?? "--"} />
                <DetailRow label="source" value={stress?.source ?? "--"} />
                <DetailRow
                  label="contract"
                  value={stress?.contractStatus ?? "--"}
                  title={stress?.contractReason ?? undefined}
                />
                <DetailRow
                  label="rho_geom"
                  value={fmt(stress?.rhoGeomMean, 3)}
                />
                <DetailRow
                  label="rho_SI"
                  value={Number.isFinite(stress?.rhoSiMean ?? NaN) ? `${fmt(stress?.rhoSiMean, 3)} J/m^3` : "--"}
                  title={
                    Number.isFinite(stress?.sampleCount ?? NaN)
                      ? `samples=${fmt(stress?.sampleCount, 0)} step=${fmt(stress?.stepM, 3)}m`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 px-2 py-2 text-[0.66rem] text-slate-200">
            <div className="mb-1 uppercase tracking-[0.16em] text-sky-100">stage 4/5: light-crossing + guardrails</div>
            <div className="grid gap-1">
              <DetailRow
                label="tau/burst/dwell"
                value={`${fmt(lightCross?.tauLCms, 3)} / ${fmt(lightCross?.burstMs, 3)} / ${fmt(lightCross?.dwellMs, 3)} ms`}
              />
              <DetailRow
                label="duty"
                value={Number.isFinite(lightCross?.dutyPct ?? NaN) ? `${fmt(lightCross?.dutyPct, 1)}%` : "--"}
              />
              <DetailRow
                label="regions"
                value={dutyKnown ? `${fmt(burstDuty, 1)}% burst / ${fmt(dwellDuty, 1)}% dwell` : "--"}
                title="Burst and dwell slices are shown as a normalized light-cross segmentation."
              />
              <div className="mt-0.5 rounded-md border border-sky-300/15 bg-slate-900/45 px-1.5 py-1">
                {dutyKnown ? (
                  <>
                    <div className="flex h-2 overflow-hidden rounded">
                      <div
                        className="bg-amber-300/80"
                        style={{ width: `${burstDuty.toFixed(2)}%` }}
                        title={`burst ${fmt(burstDuty, 1)}%`}
                      />
                      <div
                        className="bg-cyan-300/80"
                        style={{ width: `${dwellDuty.toFixed(2)}%` }}
                        title={`dwell ${fmt(dwellDuty, 1)}%`}
                      />
                    </div>
                    <div className="mt-1 text-[0.58rem] text-slate-300">
                      light-cross segmentation (visualized as inflated explanatory slices)
                    </div>
                  </>
                ) : (
                  <div className="text-[0.58rem] text-slate-400">light-cross segmentation unavailable</div>
                )}
              </div>
              <DetailRow
                label="zeta"
                value={
                  Number.isFinite(guard?.zetaValue ?? NaN) && Number.isFinite(guard?.zetaLimit ?? NaN)
                    ? `${fmt(guard?.zetaValue, 3)}/${fmt(guard?.zetaLimit, 3)}`
                    : "--"
                }
              />
              <DetailRow label="TS_ratio" value={fmt(guard?.tsRatio, 3)} />
              <DetailRow
                label="FR / natario"
                value={`${labelFromBoolean(guard?.fordRomanCompliance)} / ${labelFromBoolean(guard?.natarioConstraint)}`}
                valueClassName={
                  guard?.fordRomanCompliance === true && guard?.natarioConstraint === true
                    ? "text-emerald-100"
                    : guard?.fordRomanCompliance === false || guard?.natarioConstraint === false
                      ? "text-rose-100"
                      : "text-slate-300"
                }
              />
              <DetailRow
                label="cert"
                value={`${guard?.viabilityStatus ?? "--"} | ${certShort}`}
                title={guard?.firstHardFail ?? undefined}
                valueClassName={guard?.integrityOk === false ? "text-rose-100" : "text-slate-100"}
              />
            </div>
          </div>

            </>
          ) : (
            <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-2 py-2 text-[0.66rem] text-amber-50">
              Teaching lane active. Explanatory and inflated visuals are prioritized over strict diagnostic density.
            </div>
          )}

          {lane === "teaching" ? (
            <>
          <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),rgba(2,6,23,0.95)_62%)] p-2">
            <svg
              viewBox="0 0 360 184"
              className="block h-auto w-full"
              role="img"
              aria-label="Mercury precession and worldtube overview"
            >
              <defs>
                <linearGradient id="nhm2-tube" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(34,211,238,0.8)" />
                  <stop offset="50%" stopColor="rgba(16,185,129,0.65)" />
                  <stop offset="100%" stopColor="rgba(251,191,36,0.75)" />
                </linearGradient>
                <linearGradient id="nhm2-orbit" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(125,211,252,0.45)" />
                  <stop offset="100%" stopColor="rgba(245,158,11,0.88)" />
                </linearGradient>
                <radialGradient id="nhm2-core" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(250,250,250,1)" />
                  <stop offset="100%" stopColor="rgba(252,211,77,0.9)" />
                </radialGradient>
              </defs>

              <rect x="0" y="0" width="360" height="184" rx="18" fill="rgba(2,6,23,0.3)" />
              <g opacity="0.35" stroke="rgba(148,163,184,0.18)" strokeWidth="1">
                {[36, 78, 120, 162, 204, 246, 288, 330].map((x) => (
                  <line key={`v-${x}`} x1={x} y1={12} x2={x} y2={172} />
                ))}
                {[28, 60, 92, 124, 156].map((y) => (
                  <line key={`h-${y}`} x1={12} y1={y} x2={348} y2={y} />
                ))}
              </g>

              {showWorldTube ? (
                <rect x="136" y="42" width="88" height="100" rx="44" fill="url(#nhm2-tube)" opacity={worldTubeOpacity} />
              ) : null}

              <path
                d={referenceOrbit}
                fill="none"
                stroke="rgba(103,232,249,0.48)"
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity={showReference ? 1 : 0.16}
              />

              <path
                d={processionOrbit}
                fill="none"
                stroke="url(#nhm2-orbit)"
                strokeWidth="2.8"
                opacity={showMercury ? 1 : 0.16}
              />

              <path
                d={`M${referencePoint.x.toFixed(2)} ${referencePoint.y.toFixed(2)} Q 180 52 ${processionPoint.x.toFixed(2)} ${processionPoint.y.toFixed(2)}`}
                fill="none"
                stroke="rgba(248,250,252,0.4)"
                strokeWidth="1.4"
                strokeDasharray="2 4"
                opacity={showMercury ? 1 : 0.2}
              />

              <circle cx="180" cy="92" r="10" fill="url(#nhm2-core)" />
              <circle cx="180" cy="92" r="16" fill="rgba(250,204,21,0.12)" />

              <text x="22" y="26" fill="rgba(226,232,240,0.92)" fontSize="11" fontWeight="600">metric background</text>
              <text x="22" y="42" fill="rgba(148,163,184,0.82)" fontSize="10">alpha, beta^i, gamma_ij</text>
              <text x="238" y="28" fill="rgba(226,232,240,0.92)" fontSize="11" fontWeight="600">worldtube shell</text>
              <text x="238" y="44" fill="rgba(148,163,184,0.82)" fontSize="10">light-cross segmented</text>
              <text x="250" y="152" fill="rgba(251,191,36,0.95)" fontSize="11" fontWeight="700">Mercury</text>
              <text x="24" y="154" fill="rgba(226,232,240,0.86)" fontSize="10">reference frame held fixed</text>
              <text x="24" y="168" fill="rgba(148,163,184,0.82)" fontSize="10">precession exaggerated for operator intuition</text>

              <circle cx={referencePoint.x} cy={referencePoint.y} r="3.5" fill="rgba(103,232,249,0.95)" />
              <circle cx={processionPoint.x} cy={processionPoint.y} r="3.8" fill="rgba(252,211,77,0.98)" />
            </svg>
          </div>

          <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[0.68rem] text-slate-200">
            <span className="flex items-center justify-between gap-2">
              <span>Mercury exaggeration</span>
              <span className="font-mono text-slate-300">{inflate.toFixed(0)}x</span>
            </span>
            <input
              type="range"
              min={1}
              max={240}
              step={1}
              value={inflate}
              onChange={(event) => setInflate(Number(event.target.value))}
              className="accent-amber-400"
            />
            <span className="font-mono text-[0.62rem] text-slate-400">
              {mercurySignal?.source ?? "illustrative baseline"} | {fmt(exaggeratedArcsec, 2)} arcsec visualized
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-[0.68rem]">
            <label className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200">
              <input
                type="checkbox"
                checked={showReference}
                onChange={(event) => setShowReference(event.target.checked)}
                className="accent-cyan-400"
              />
              Reference
            </label>
            <label className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200">
              <input
                type="checkbox"
                checked={showMercury}
                onChange={(event) => setShowMercury(event.target.checked)}
                className="accent-amber-400"
              />
              Mercury
            </label>
            <label className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-200">
              <input
                type="checkbox"
                checked={showWorldTube}
                onChange={(event) => setShowWorldTube(event.target.checked)}
                className="accent-emerald-400"
              />
              Worldtube
            </label>
          </div>

            </>
          ) : null}

          <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[0.66rem] text-slate-200">
            <DetailRow label="light crossing" value={lightCrossText} title={lightCrossTitle} />
            <DetailRow label="hull" value={hullText} title={hullTitle} />
            <DetailRow label="drive" value={driveText} title={driveTitle} />
          </div>
        </div>
      )}
    </div>
  );
}
