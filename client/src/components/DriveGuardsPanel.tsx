import { useEffect, useMemo, useState } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useGrConstraintContract } from "@/hooks/useGrConstraintContract";
import { useMetrics } from "@/hooks/use-metrics";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { publish } from "@/lib/luma-bus";
import {
  computeSurfaceDivergenceBeta,
  helmholtzProjectDivergenceFree,
  type AxesABC,
  type Vec3,
  type YorkSample,
} from "@/lib/york-time";
import { useNavPoseStore } from "@/store/useNavPoseStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DriveGuardsPanelProps = { panelHash?: string };

const NATARIO_K_TOL = 1e-6;
const DEFAULT_HULL_AXIS = 503.5;
const YORK_THETA_STEPS = 24;
const YORK_PHI_STEPS = 48;
const TWO_PI = Math.PI * 2;

const firstFinite = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
};

function normalizeVec(vec: Vec3): Vec3 | null {
  const mag = Math.hypot(vec[0], vec[1], vec[2]);
  if (!Number.isFinite(mag) || mag < 1e-9) return null;
  return [vec[0] / mag, vec[1] / mag, vec[2] / mag];
}

function ellipsoidNormal(pos: Vec3, axes: AxesABC): Vec3 {
  const nx = pos[0] / (axes.a * axes.a);
  const ny = pos[1] / (axes.b * axes.b);
  const nz = pos[2] / (axes.c * axes.c);
  return normalizeVec([nx, ny, nz]) ?? [0, 1, 0];
}

function projectOntoTangent(vec: Vec3, normal: Vec3): Vec3 {
  const dot = vec[0] * normal[0] + vec[1] * normal[1] + vec[2] * normal[2];
  return [
    vec[0] - normal[0] * dot,
    vec[1] - normal[1] * dot,
    vec[2] - normal[2] * dot,
  ];
}

function fallbackTangent(normal: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(normal[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const crossVec: Vec3 = [
    normal[1] * axis[2] - normal[2] * axis[1],
    normal[2] * axis[0] - normal[0] * axis[2],
    normal[0] * axis[1] - normal[1] * axis[0],
  ];
  return normalizeVec(crossVec) ?? [1, 0, 0];
}

function buildYorkSamples(params: {
  axes: AxesABC;
  direction: Vec3;
  amplitude: number;
  thetaSteps: number;
  phiSteps: number;
}): YorkSample[] {
  const { axes, amplitude } = params;
  const thetaCount = Math.max(3, params.thetaSteps);
  const phiCount = Math.max(3, params.phiSteps);
  const dirNorm = normalizeVec(params.direction) ?? ([0, -1, 0] as Vec3);
  const samples: YorkSample[] = [];

  for (let ti = 0; ti < thetaCount; ti += 1) {
    const theta = thetaCount === 1 ? 0 : (ti / (thetaCount - 1)) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let pj = 0; pj < phiCount; pj += 1) {
      const phi = (pj / phiCount) * TWO_PI;
      const pos: Vec3 = [
        axes.a * sinTheta * Math.cos(phi),
        axes.b * sinTheta * Math.sin(phi),
        axes.c * cosTheta,
      ];
      const normal = ellipsoidNormal(pos, axes);
      const tangential = normalizeVec(projectOntoTangent(dirNorm, normal)) ?? fallbackTangent(normal);
      const betaVec: Vec3 = [
        tangential[0] * amplitude,
        tangential[1] * amplitude,
        tangential[2] * amplitude,
      ];
      samples.push({ pos, beta: betaVec });
    }
  }
  return samples;
}

const format = (value: number) => Number.isFinite(value) ? value.toExponential(2) : "unreported";

export default function DriveGuardsPanel({ panelHash }: DriveGuardsPanelProps = {}) {
  const { state: nhm2SolveState } = useNhm2SolveState();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1500 });
  const { data: metrics } = useMetrics();
  const contractQuery = useGrConstraintContract({ enabled: true, refetchInterval: 2000 });
  const pipe = pipeline as any;
  const [helmholtzEnabled, setHelmholtzEnabled] = useState(false);
  const [natarioGateEnabled, setNatarioGateEnabled] = useState(true);
  const navPose = useNavPoseStore((state) => state.navPose);
  const startNavPose = useNavPoseStore((state) => state.start);
  const stopNavPose = useNavPoseStore((state) => state.stop);

  useEffect(() => {
    startNavPose();
    return () => stopNavPose();
  }, [startNavPose, stopNavPose]);

  const authorityAxes = useMemo<AxesABC>(() => ({
    a: nhm2SolveState.geometry.authority.Lx_m / 2,
    b: nhm2SolveState.geometry.authority.Ly_m / 2,
    c: nhm2SolveState.geometry.authority.Lz_m / 2,
  }), [
    nhm2SolveState.geometry.authority.Lx_m,
    nhm2SolveState.geometry.authority.Ly_m,
    nhm2SolveState.geometry.authority.Lz_m,
  ]);

  const hullAxes = useMemo<AxesABC>(() => {
    const hull = pipe?.hull ?? {};
    const axisFrom = (primary?: number, fallback?: number) => {
      const primaryNum = typeof primary === "number" ? primary : Number(primary);
      if (Number.isFinite(primaryNum) && primaryNum > 0) return primaryNum;
      if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback;
      return undefined;
    };
    const half = (value?: number) =>
      typeof value === "number" && Number.isFinite(value) && value > 0 ? value / 2 : undefined;
    const a = axisFrom(hull.a, half(hull.Lx_m)) ?? authorityAxes.a ?? DEFAULT_HULL_AXIS;
    const b = axisFrom(hull.b, half(hull.Ly_m)) ?? authorityAxes.b ?? a;
    const c = axisFrom(hull.c, half(hull.Lz_m)) ?? authorityAxes.c ?? a;
    return {
      a: Math.abs(a) || Math.abs(authorityAxes.a) || DEFAULT_HULL_AXIS,
      b: Math.abs(b) || Math.abs(authorityAxes.b) || Math.abs(a) || DEFAULT_HULL_AXIS,
      c: Math.abs(c) || Math.abs(authorityAxes.c) || Math.abs(a) || DEFAULT_HULL_AXIS,
    };
  }, [authorityAxes.a, authorityAxes.b, authorityAxes.c, pipe?.hull?.a, pipe?.hull?.b,
    pipe?.hull?.c, pipe?.hull?.Lx_m, pipe?.hull?.Ly_m, pipe?.hull?.Lz_m]);

  const axesKey = `${hullAxes.a.toFixed(3)}|${hullAxes.b.toFixed(3)}|${hullAxes.c.toFixed(3)}`;
  const metricsShift = metrics?.shiftVector;
  const betaVecCandidate = (metricsShift?.betaTiltVec ?? pipe?.betaTiltVec ??
    pipe?.natario?.shiftVectorField?.betaTiltVec ?? [0, -1, 0]) as Vec3;
  const betaDirection = normalizeVec([
    Number(betaVecCandidate[0]) || 0,
    Number(betaVecCandidate[1]) || 0,
    Number(betaVecCandidate[2]) || 0,
  ]) ?? ([0, -1, 0] as Vec3);
  const betaDirKey = `${betaDirection[0].toFixed(4)}|${betaDirection[1].toFixed(4)}|${betaDirection[2].toFixed(4)}`;
  const betaAmplitudeRaw = firstFinite(metricsShift?.epsilonTilt, pipe?.beta_avg,
    pipe?.natario?.shiftVectorField?.amplitude, pipe?.epsilonTilt, 0);
  const betaAmplitude = Number.isFinite(betaAmplitudeRaw) ? Math.abs(betaAmplitudeRaw) : 0;
  const yorkBaseSamples = useMemo<YorkSample[]>(() => {
    if (!betaAmplitude) return [];
    return buildYorkSamples({ axes: hullAxes, direction: betaDirection, amplitude: betaAmplitude,
      thetaSteps: YORK_THETA_STEPS, phiSteps: YORK_PHI_STEPS });
  }, [axesKey, betaDirKey, betaAmplitude]);
  const yorkSamples = useMemo<YorkSample[]>(() => {
    if (!yorkBaseSamples.length || !helmholtzEnabled) return yorkBaseSamples;
    return helmholtzProjectDivergenceFree(yorkBaseSamples, hullAxes);
  }, [yorkBaseSamples, helmholtzEnabled, axesKey]);
  const yorkStats = useMemo(() => {
    if (!yorkSamples.length) return null;
    return computeSurfaceDivergenceBeta(yorkSamples, hullAxes);
  }, [yorkSamples, axesKey]);
  const divMaxVal = Number.isFinite(yorkStats?.divMax) ? Math.abs(yorkStats!.divMax) : 0;
  const kRmsValue = Number.isFinite(yorkStats?.kRMS) ? Math.abs(yorkStats!.kRMS) : NaN;
  const betaSourceLabel = metricsShift ? "metrics" : Number.isFinite(pipe?.beta_avg) ? "live" : "derived";

  useEffect(() => {
    publish("natario:diagnostics", {
      divMax: divMaxVal,
      kRms: kRmsValue,
      helmholtzEnabled,
      gateEnabled: natarioGateEnabled,
      source: betaSourceLabel,
    });
  }, [divMaxVal, kRmsValue, helmholtzEnabled, natarioGateEnabled, betaSourceLabel]);

  const guardrails = contractQuery.data?.guardrails;
  const contractSource = contractQuery.data?.sources?.grDiagnostics ?? "unreported";

  return (
    <Card id={panelHash} data-panel-hash={panelHash} className="border-slate-800 bg-slate-900/60 text-slate-100">
      <CardHeader>
        <CardTitle>Drive Guards diagnostic</CardTitle>
        <CardDescription className="text-slate-400">
          Local surface-sampling visualization and raw live contract fields. Theory Badge Graph explains the
          equations; NHM2 Solve State and Warp Proof own selected-run evidence and claim locks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
          This view can mix a live shift proxy with fallback geometry and publishes `natario:diagnostics` for
          other visualizations. Its local residual and threshold do not prove a divergence-free physical
          metric, source closure, or transport.
        </div>
        <div className="flex flex-wrap gap-4 rounded border border-slate-800 p-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={helmholtzEnabled}
              onChange={(event) => setHelmholtzEnabled(event.target.checked)}
              disabled={yorkBaseSamples.length === 0} />
            Project local display samples to divergence-free
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={natarioGateEnabled}
              onChange={(event) => setNatarioGateEnabled(event.target.checked)} />
            Gate Hull3D shell display on local Natario residual
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Local max |div β|" value={yorkBaseSamples.length ? format(divMaxVal) : "unreported"} />
          <Field label="Local K RMS" value={format(kRmsValue)} />
          <Field label="Display threshold" value={NATARIO_K_TOL.toExponential(1)} />
          <Field label="Shift proxy source" value={betaSourceLabel} />
          <Field label="Surface samples" value={String(yorkBaseSamples.length)} />
          <Field label="Nav Pose" value={navPose ? "live local snapshot" : "no local snapshot"} />
        </div>
        <div className="space-y-2 rounded border border-slate-800 p-3">
          <div className="text-xs font-semibold text-slate-200">Live GR contract fields</div>
          <div className="text-xs text-slate-400">Reported source: {contractSource}. Interpret these in Warp Proof with its proof-pack provenance.</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Ford–Roman" value={guardrails?.fordRoman ?? "unreported"} />
            <Field label="Theta audit" value={guardrails?.thetaAudit ?? "unreported"} />
            <Field label="TS ratio" value={guardrails?.tsRatio ?? "unreported"} />
            <Field label="VdB band" value={guardrails?.vdbBand ?? "unreported"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}
