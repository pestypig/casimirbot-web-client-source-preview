import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Atom, Beaker, CircuitBoard, ExternalLink, Info, Repeat, Waves, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  useElectronOrbitSim,
  type AtomicStressEnergyProxy,
  type CoulombExperiment,
  type ElectronState,
  type OrbitEvent,
  type OrbitWavefieldState,
  type SweepSample,
  type SweepState
} from "@/hooks/useElectronOrbitSim";
import type { AtomicViewerLaunch } from "@/lib/agi/api";
import { openDocPanel } from "@/lib/docs/openDocPanel";
import type { AtomicOrbitalCloud } from "@/lib/atomic-orbitals";

const EPSILON_0 = 8.8541878128e-12;
const ELECTRON_CHARGE = 1.602176634e-19;
const G_CANONICAL = 2.00231930436256;
const formatNumber = (value?: number | null, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e3 || abs <= 1e-3) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
};

const HELIX_ATOMIC_LAUNCH_EVENT = "helix:atomic-launch";
const HELIX_ATOMIC_LAUNCH_STORAGE_KEY = "helix.atomic.launch.v1";

function coerceAtomicViewerLaunch(value: unknown): AtomicViewerLaunch | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AtomicViewerLaunch>;
  if (candidate.viewer !== "atomic-orbital") return null;
  if (candidate.panel_id !== "electron-orbital") return null;
  if (!candidate.params || typeof candidate.params !== "object") return null;
  return candidate as AtomicViewerLaunch;
}

function readPendingAtomicViewerLaunch(): AtomicViewerLaunch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HELIX_ATOMIC_LAUNCH_STORAGE_KEY);
    if (!raw) return null;
    return coerceAtomicViewerLaunch(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearPendingAtomicViewerLaunch(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(HELIX_ATOMIC_LAUNCH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function clampAtomicInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : typeof value === "string" && value.trim()
        ? Math.trunc(Number(value))
        : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeAtomicLaunchParams(params: AtomicViewerLaunch["params"]): {
  model: "quantum" | "classical";
  Z: number;
  n: number;
  l: number;
  m: number;
  sampleCount: number | null;
} {
  const model = params.model === "classical" ? "classical" : "quantum";
  let n = clampAtomicInt(params.n, 1, 7, 1);
  let l = clampAtomicInt(params.l, 0, 9, 0);
  if (l > n - 1) {
    n = Math.min(7, l + 1);
  }
  l = Math.min(l, n - 1);
  let m = clampAtomicInt(params.m, -9, 9, 0);
  if (m < -l) m = -l;
  if (m > l) m = l;
  const Z = clampAtomicInt(params.Z, 1, 118, 1);
  const hasSampleCount = typeof params.sampleCount === "number" && Number.isFinite(params.sampleCount);
  const sampleCount = hasSampleCount
    ? clampAtomicInt(params.sampleCount, 96, 4000, model === "quantum" ? 640 : 280)
    : null;
  return { model, Z, n, l, m, sampleCount };
}

export default function ElectronOrbitalPanel() {
  const [state, actions] = useElectronOrbitSim();
  const [selectedId, setSelectedId] = useState<string | null>(state.electrons[0]?.id ?? null);
  const [showDriftHelp, setShowDriftHelp] = useState(true);
  const [launchStressProxy, setLaunchStressProxy] = useState<AtomicStressEnergyProxy | null>(null);
  const selected = useMemo(
    () => state.electrons.find((e) => e.id === selectedId) ?? state.electrons[0] ?? null,
    [selectedId, state.electrons]
  );
  const electronA = useMemo(
    () => state.electrons.find((e) => e.id === state.experiment.electronA) ?? state.electrons[0] ?? null,
    [state.electrons, state.experiment.electronA]
  );
  const electronB = useMemo(
    () => state.electrons.find((e) => e.id === state.experiment.electronB) ?? state.electrons[1] ?? state.electrons[0] ?? null,
    [state.electrons, state.experiment.electronB]
  );
  const selectedCloud = useMemo(
    () => state.orbitalClouds.find((entry) => entry.electronId === selected?.id)?.cloud ?? null,
    [selected?.id, state.orbitalClouds]
  );
  const telemetryLabel = state.telemetrySources.join(", ");
  const effectiveStressProxy = launchStressProxy ?? state.derived.stressEnergyProxy;

  useEffect(() => {
    if (!state.electrons.find((e) => e.id === selectedId)) {
      setSelectedId(state.electrons[0]?.id ?? null);
    }
  }, [selectedId, state.electrons]);

  const instrumentStatus = useMemo(() => {
    if (state.experiment.kDerived == null) return "idle" as const;
    const rel = state.experiment.relativeError ?? 0;
    const usingToroidal = [electronA, electronB].some((electron) => electron?.structureModel === "toroidal");
    if (usingToroidal) return "expected_drift" as const;
    if (Math.abs(rel) < 0.01) return "calibrated" as const;
    return "alert" as const;
  }, [electronA, electronB, state.experiment.kDerived, state.experiment.relativeError]);
  const showDriftCallout = instrumentStatus === "expected_drift" && showDriftHelp;

  const openDocs = () => {
    openDocPanel("/docs/helix-desktop-panels.md#electron-orbital-simulator");
  };

  const openPanel = (id: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id } }));
  };

  const applyAtomicLaunch = useCallback(
    (payload: AtomicViewerLaunch) => {
      const next = normalizeAtomicLaunchParams(payload.params);
      actions.setAtomModel(next.model);
      actions.setCloudSampleCount(next.sampleCount);
      actions.setPotential({ type: "hydrogenic", Z: next.Z });
      const targetId =
        (selectedId && state.electrons.some((electron) => electron.id === selectedId)
          ? selectedId
          : state.electrons[0]?.id) ?? null;
      if (!targetId) return;
      setLaunchStressProxy((payload.params as { stress_energy_proxy?: AtomicStressEnergyProxy }).stress_energy_proxy ?? null);
      actions.setElectrons((prev) =>
        prev.map((electron) => {
          if (electron.id !== targetId) return electron;
          const orbital = {
            ...electron.orbital,
            n: next.n,
            l: next.l,
            m: next.m,
          };
          return {
            ...electron,
            label: `${next.n}${orbitalLabel(next.l)} launch`,
            orbital,
            energyEV: (-13.6 * next.Z * next.Z) / (next.n * next.n),
            occupancy: next.l === 0 ? 2 : 1,
            spinAligned: orbital.ms > 0,
          };
        }),
      );
      setSelectedId(targetId);
    },
    [actions, selectedId, state.electrons],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyPayload = (value: unknown) => {
      const payload = coerceAtomicViewerLaunch(value);
      if (!payload) return;
      applyAtomicLaunch(payload);
      clearPendingAtomicViewerLaunch();
    };
    applyPayload(readPendingAtomicViewerLaunch());
    const handleAtomicLaunch = (event: Event) => {
      applyPayload((event as CustomEvent).detail);
    };
    window.addEventListener(HELIX_ATOMIC_LAUNCH_EVENT, handleAtomicLaunch);
    return () => {
      window.removeEventListener(HELIX_ATOMIC_LAUNCH_EVENT, handleAtomicLaunch);
    };
  }, [applyAtomicLaunch]);

  return (
    <Card className="h-full border-slate-800 bg-slate-950/75 text-slate-100">
      <CardHeader className="space-y-3 border-b border-white/5 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold text-white">
              Electron Orbital Simulator
            </CardTitle>
            <CardDescription className="text-sm text-slate-300">
              Orbital probability clouds with telemetry-seeded drift visualization for diagnostic
              instrumentation of charge, spin, and Coulomb constants.
            </CardDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <Badge variant="outline" className="border-white/15 bg-white/5 text-[10px] uppercase tracking-wide">
                Helix core panel
              </Badge>
              <Badge variant="secondary" className="bg-slate-800 text-[10px]">
                Data: {telemetryLabel || "Mock seeds"}
              </Badge>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-500/10 text-[10px] text-amber-200">
                Coupling: {state.coupling.mode.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="border-white/15 bg-white/5 text-[10px]">
                Tier: {state.coupling.claim_tier} · non-certifying
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-200"
                onClick={openDocs}
              >
                <Info className="mr-1 h-3.5 w-3.5" />
                Panel docs
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {state.coupling.note}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Stress-energy proxy: {formatNumber(effectiveStressProxy.value_J_m3, 3)} {effectiveStressProxy.units.value} ±
              {Math.round(effectiveStressProxy.uncertainty.relative_1sigma * 100)}% (1σ)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={state.atomModel}
              onValueChange={(value) => actions.setAtomModel(value as typeof state.atomModel)}
            >
              <SelectTrigger className="w-52 bg-slate-900/80 border-white/10 text-sm text-white">
                <SelectValue placeholder="Orbital model" />
              </SelectTrigger>
              <SelectContent side="bottom" align="end">
                <SelectItem value="quantum">Quantum probability cloud</SelectItem>
                <SelectItem value="classical">Classical trajectory shell</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selected?.id} onValueChange={setSelectedId}>
              <SelectTrigger className="w-48 bg-slate-900/80 border-white/10 text-sm text-white">
                <SelectValue placeholder="Select electron" />
              </SelectTrigger>
              <SelectContent side="bottom" align="end">
                {state.electrons.map((electron) => (
                  <SelectItem key={electron.id} value={electron.id}>
                    {electron.label} ({electron.orbital.n}
                    {orbitalLabel(electron.orbital.l)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 bg-slate-900/80 text-white"
              onClick={actions.togglePlay}
            >
              {state.time.playing ? "Pause evolution" : "Play evolution"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
              onClick={actions.runExperiment}
            >
              Measure Coulomb k
            </Button>
          </div>
        </div>

        {selected && (
          <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-wide text-slate-400">
            <span className="text-slate-200 text-sm font-semibold">
              {selected.label} · n={selected.orbital.n} ℓ={selected.orbital.l} m={selected.orbital.m} ms=
              {selected.orbital.ms > 0 ? "+½" : "−½"}
            </span>
            <Badge variant="outline" className="border-white/15 bg-white/5 text-xs text-white">
              {state.potential.type === "hydrogenic"
                ? `Hydrogenic · Z=${state.potential.Z}`
                : `Custom potential (${state.potential.customId ?? "unlinked"})`}
            </Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5 text-xs text-white">
              {state.atomModel === "quantum" ? "Quantum |psi|^2 model" : "Classical trajectory model"}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/15 bg-white/5 text-xs text-white"
            >
              Energy: {formatNumber(selected.energyEV, 3)} eV
            </Badge>
            <Badge
              variant="outline"
              className={`border-white/15 text-xs ${
                selected.structureModel === "toroidal"
                  ? "bg-purple-500/20 text-purple-200"
                  : "bg-slate-700/50 text-slate-100"
              }`}
            >
              {selected.structureModel === "toroidal" ? "Toroidal EM core" : "Pointlike"}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Toroidal overlay</span>
              <Switch
                checked={selected.structureModel === "toroidal"}
                onCheckedChange={() => selected && actions.toggleStructureModel(selected.id)}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
            <SectionTitle icon={Atom} title="Orbital cloud" subtitle={state.atomModel === "quantum" ? "|psi|^2 density" : "Bohr-like trajectory"} />
            <OrbitalIsoSurface electron={selected} cloud={selectedCloud} simTime={state.time.tSim} />
            <div className="mt-3 flex justify-between text-[11px] text-slate-400">
              <span>Normalization drift</span>
              <span>{formatPercent(state.derived.normalizationError)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
            <SectionTitle icon={Waves} title="State amplitudes" subtitle="Basis timeline" />
            <OrbitTimeline
              wavefield={state.wavefields}
              electrons={state.electrons}
              simTime={state.time.tSim}
            />
            <div className="mt-3 text-[11px] text-slate-400">
              Time step: {formatNumber(state.time.dt, 3)} τ (sim) · Duty:{" "}
              {formatPercent(state.derived.pipelineDuty)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle icon={Beaker} title="Instrumentation" subtitle="Probe electrons" />
              <div className="flex flex-wrap items-center gap-2">
                <InstrumentationStatusBadge
                  status={instrumentStatus}
                  relativeError={state.experiment.relativeError}
                  usingToroidal={[electronA, electronB].some((e) => e?.structureModel === "toroidal")}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/15 bg-transparent text-xs text-slate-100"
                  onClick={actions.resetToSafeDefaults}
                >
                  Reset to verified defaults
                </Button>
              </div>
            </div>
            <CoulombExperimentControls
              electrons={state.electrons}
              electronAState={electronA}
              electronBState={electronB}
              experiment={state.experiment}
              configure={actions.configureExperiment}
              run={actions.runExperiment}
              setStructure={actions.setElectronStructure}
            />
            <Separator className="bg-white/5" />
            <ParametricSweepControls
              sweeps={state.sweeps}
              setSweep={actions.setSweep}
              runSweep={actions.runSweep}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TelemetryCard
            icon={Zap}
            label="Coulomb constant"
            value={state.experiment.kDerived ?? state.experiment.kCanonical}
            unit="N·m²/C²"
            reference={state.experiment.kCanonical}
          />
          <TelemetryCard
            icon={CircuitBoard}
            label="Effective charge"
            value={selected?.toroidal?.qDerived ?? ELECTRON_CHARGE}
            unit="C"
            reference={ELECTRON_CHARGE}
          />
          <TelemetryCard
            icon={Activity}
            label="g-factor"
            value={selected?.toroidal?.gDerived ?? G_CANONICAL}
            unit=""
            reference={G_CANONICAL}
          />
          <TelemetryCard
            icon={Repeat}
            label="Length scales"
            value={state.derived.bohrRadius}
            unit="Bohr radius (m)"
            reference={state.derived.comptonWavelength}
            referenceLabel="Compton λ"
            hideDrift
          />
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
          <SectionTitle icon={Waves} title="Sweep telemetry" subtitle="k vs parameter" />
          {state.sweeps.results && state.sweeps.results.length > 1 ? (
            <SweepSparkline
              samples={state.sweeps.results}
              canonical={state.experiment.kCanonical}
            />
          ) : (
            <div className="grid h-32 place-items-center text-sm text-slate-400">
              Run a sweep to capture drift history.
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-400">
            <span>
              Last run:{" "}
              {state.sweeps.lastRunAt
                ? new Date(state.sweeps.lastRunAt).toLocaleTimeString()
                : "—"}
            </span>
            <span>Samples: {state.sweeps.results?.length ?? 0}</span>
            <span>Param: {state.sweeps.activeParam}</span>
          </div>
        </div>

        <StackContextCard openVacuumPanel={() => openPanel("theory-badge-graph")} />

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
          <SectionTitle icon={Atom} title="AGI hooks" subtitle="Event stream" />
          {showDriftCallout && (
            <Alert variant="default" className="mb-4 border-amber-500/30 bg-amber-500/10 text-amber-50">
              <AlertTitle>Initial drift is expected</AlertTitle>
              <AlertDescription className="text-xs text-amber-100">
                The default toroidal charge (~0.91 e) skews k to prove the instrumentation path is live. Switch both electrons to pointlike to verify canonical constants.
              </AlertDescription>
              <div className="mt-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-100 hover:text-amber-50"
                  onClick={() => setShowDriftHelp(false)}
                >
                  Got it
                </Button>
              </div>
            </Alert>
          )}
          <EventLog events={state.events} />
        </div>
      </CardContent>
    </Card>
  );
}

type SectionTitleProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
};

function SectionTitle({ icon: Icon, title, subtitle }: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{subtitle}</div>
      </div>
      <div className="rounded-full border border-white/10 bg-white/5 p-2">
        <Icon className="h-4 w-4 text-slate-200" />
      </div>
    </div>
  );
}

type OrbitalIsoSurfaceProps = {
  electron: ElectronState | null;
  cloud: AtomicOrbitalCloud | null;
  simTime: number;
};

type ProjectedOrbitalPoint = {
  x: number;
  y: number;
  z: number;
  weight: number;
};

function OrbitalIsoSurface({ electron, cloud, simTime }: OrbitalIsoSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 280;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(2, 6, 23, 0.96)";
    ctx.fillRect(0, 0, size, size);

    if (!electron || !cloud || cloud.points.length === 0) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.font = "12px sans-serif";
      ctx.fillText("No orbital cloud available", 72, size / 2);
      return;
    }

    const center = size / 2;
    const radius = center * 0.8;
    const extent = Math.max(cloud.extent, 1e-16);
    const spin = simTime * (cloud.mode === "classical" ? 1.05 : 0.35);
    const tilt = 0.28 + electron.orbital.l * 0.12;
    const cosSpin = Math.cos(spin);
    const sinSpin = Math.sin(spin);
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);

    const projected: ProjectedOrbitalPoint[] = cloud.points.map((point) => {
      const x1 = point.x * cosSpin - point.z * sinSpin;
      const z1 = point.x * sinSpin + point.z * cosSpin;
      const y2 = point.y * cosTilt - z1 * sinTilt;
      const z2 = point.y * sinTilt + z1 * cosTilt;
      const perspective = 1 / (1 + (z2 / extent) * 0.25);
      return {
        x: center + (x1 / extent) * radius * perspective,
        y: center + (y2 / extent) * radius * perspective,
        z: z2,
        weight: point.weight
      };
    });

    if (cloud.mode === "classical") {
      ctx.beginPath();
      projected.forEach((point, idx) => {
        if (idx === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.strokeStyle =
        electron.structureModel === "toroidal"
          ? "rgba(216, 180, 254, 0.68)"
          : "rgba(251, 191, 36, 0.74)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const sorted = [...projected].sort((a, b) => a.z - b.z);
    for (const point of sorted) {
      const depth = Math.max(0, Math.min(1, (point.z + extent) / (2 * extent)));
      const alphaBase = cloud.mode === "quantum" ? 0.08 + point.weight * 0.72 : 0.2 + point.weight * 0.55;
      const alpha = Math.min(0.92, alphaBase * (0.65 + depth * 0.6));
      const radiusPx = cloud.mode === "quantum" ? 1 + point.weight * 2 : 1.2 + point.weight * 1.3;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
      ctx.fillStyle =
        electron.structureModel === "toroidal"
          ? `rgba(192, 132, 252, ${alpha})`
          : cloud.mode === "quantum"
            ? `rgba(56, 189, 248, ${alpha})`
            : `rgba(251, 191, 36, ${alpha})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(center, center, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
    ctx.fill();

    if (electron.structureModel === "toroidal" && electron.toroidal) {
      ctx.beginPath();
      ctx.ellipse(center, center, radius * 0.22, radius * 0.13, spin * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(248, 250, 252, 0.8)";
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [cloud, electron, simTime]);

  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
      <canvas ref={canvasRef} className="mx-auto block h-64 w-full max-w-xs" />
      {cloud && (
        <p className="mt-2 text-[11px] text-slate-400">
          Source: atoms-kavan010 equations ({cloud.mode}, n={cloud.n} l={cloud.l} m={cloud.m}).
        </p>
      )}
      {electron?.structureModel === "toroidal" && electron?.toroidal && (
        <p className="mt-2 text-[11px] text-slate-400">
          Toroidal core radius approx {electron.toroidal.torusRadius.toExponential(2)} m (~lambdaC/4pi).
        </p>
      )}
    </div>
  );
}

type OrbitTimelineProps = {
  wavefield: OrbitWavefieldState;
  electrons: ElectronState[];
  simTime: number;
};

function OrbitTimeline({ wavefield, electrons, simTime }: OrbitTimelineProps) {
  const width = 280;
  const height = 180;
  const points = wavefield.amplitudes.map((amp, idx) => {
    const x = (idx / Math.max(1, wavefield.amplitudes.length - 1)) * width;
    const y = height - amp.amplitude * height;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full rounded-xl border border-white/5 bg-slate-950/40 p-2">
      <polyline
        fill="none"
        stroke="url(#timelineGradient)"
        strokeWidth={2}
        points={points.join(" ")}
      />
      <defs>
        <linearGradient id="timelineGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      {electrons.map((electron, idx) => (
        <text
          key={electron.id}
          x={((idx + 0.1) / (electrons.length + 0.4)) * width}
          y={height - 4}
          fontSize={10}
          fill="rgba(255,255,255,0.6)"
        >
          n={electron.orbital.n}
        </text>
      ))}
      <text x={8} y={14} fontSize={10} fill="rgba(148,163,184,0.9)">
        t = {formatNumber(simTime, 2)} τ
      </text>
    </svg>
  );
}

type CoulombControlsProps = {
  electrons: ElectronState[];
  electronAState: ElectronState | null;
  electronBState: ElectronState | null;
  experiment: CoulombExperiment;
  configure: (cfg: Partial<CoulombExperiment>) => void;
  run: () => void;
  setStructure: (id: string, model: ElectronState["structureModel"]) => void;
};

function CoulombExperimentControls({
  electrons,
  electronAState,
  electronBState,
  experiment,
  configure,
  run,
  setStructure
}: CoulombControlsProps) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <ElectronPicker
          label="Electron A (source)"
          electrons={electrons}
          selectedId={experiment.electronA}
          onSelect={(val) => configure({ electronA: val })}
          electron={electronAState}
          onStructureChange={setStructure}
        />
        <ElectronPicker
          label="Electron B (target)"
          electrons={electrons}
          selectedId={experiment.electronB}
          onSelect={(val) => configure({ electronB: val })}
          electron={electronBState}
          onStructureChange={setStructure}
        />
      </div>

      <MeasurementInputsCard
        electronA={electronAState}
        electronB={electronBState}
        separation={experiment.separation}
        mediumPermittivity={experiment.mediumPermittivity}
      />

      <label className="text-[11px] uppercase tracking-wide text-slate-400">
        Separation (m): {experiment.separation.toExponential(2)}
      </label>
      <Slider
        min={5e-12}
        max={5e-9}
        step={5e-12}
        value={[experiment.separation]}
        onValueChange={([value]) => configure({ separation: value })}
      />

      <label className="text-[11px] uppercase tracking-wide text-slate-400">
        Effective permittivity εᵣ (vacuum gap / medium): {experiment.mediumPermittivity.toExponential(2)}
      </label>
      <Slider
        min={EPSILON_0 * 0.25}
        max={EPSILON_0 * 4}
        step={EPSILON_0 * 0.05}
        value={[experiment.mediumPermittivity]}
        onValueChange={([value]) => configure({ mediumPermittivity: value })}
      />
      <p className="text-[11px] text-slate-400">
        Adjusting εᵣ here mimics how Casimir-gap media skew the Coulomb constant before you scale up to full cavities.
      </p>

      <div className="flex items-center justify-between text-xs">
        <div className="space-y-1">
          <div className="text-slate-400">Measured k</div>
          <div className="font-semibold text-white">
            {formatNumber(experiment.kDerived ?? experiment.kCanonical, 3)}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
          onClick={run}
        >
          Re-run probe
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">
        Tip: toggle electrons to "Pointlike (QED)" to compare proxy drift against the canonical k baseline.
      </p>
    </div>
  );
}

type ParametricSweepProps = {
  sweeps: SweepState;
  setSweep: (cfg: Partial<SweepState>) => void;
  runSweep: () => void;
};

function ParametricSweepControls({ sweeps, setSweep, runSweep }: ParametricSweepProps) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        Parametric sweep ({sweeps.activeParam})
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>
          <div>Start</div>
          <input
            type="number"
            value={sweeps.start}
            onChange={(e) => setSweep({ start: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <div>End</div>
          <input
            type="number"
            value={sweeps.end}
            onChange={(e) => setSweep({ end: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-300">
        <label>Steps</label>
        <input
          type="number"
          min={2}
          value={sweeps.steps}
          onChange={(e) => setSweep({ steps: Number(e.target.value) })}
          className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs"
        />
      </div>
      <Select
        value={sweeps.activeParam}
        onValueChange={(val) => setSweep({ activeParam: val as typeof sweeps.activeParam })}
      >
        <SelectTrigger className="h-9 bg-slate-950/60 border-white/10 text-xs">
          <SelectValue placeholder="Parameter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="radius">Radius</SelectItem>
          <SelectItem value="charge">Charge scale</SelectItem>
          <SelectItem value="permittivity">Permittivity</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="w-full bg-indigo-500/80 text-white"
        onClick={runSweep}
      >
        Run sweep
      </Button>
    </div>
  );
}

type ElectronPickerProps = {
  label: string;
  electrons: ElectronState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  electron: ElectronState | null;
  onStructureChange: (id: string, model: ElectronState["structureModel"]) => void;
};

function ElectronPicker({
  label,
  electrons,
  selectedId,
  onSelect,
  electron,
  onStructureChange
}: ElectronPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        {electron && (
          <StructureModelSelect electron={electron} onChange={onStructureChange} />
        )}
      </div>
      <Select value={selectedId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger className="h-9 bg-slate-950/60 border-white/10 text-xs">
          <SelectValue placeholder="Pick electron" />
        </SelectTrigger>
        <SelectContent>
          {electrons.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.label} · n={entry.orbital.n}
              {orbitalLabel(entry.orbital.l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type StructureModelSelectProps = {
  electron: ElectronState;
  onChange: (id: string, model: ElectronState["structureModel"]) => void;
};

function StructureModelSelect({ electron, onChange }: StructureModelSelectProps) {
  return (
    <Select
      value={electron.structureModel}
      onValueChange={(value) => onChange(electron.id, value as ElectronState["structureModel"])}
    >
      <SelectTrigger className="h-7 w-[140px] bg-slate-900/70 border-white/15 text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pointlike">Pointlike (QED)</SelectItem>
        <SelectItem value="toroidal">Toroidal core</SelectItem>
      </SelectContent>
    </Select>
  );
}

type MeasurementInputsCardProps = {
  electronA: ElectronState | null;
  electronB: ElectronState | null;
  separation: number;
  mediumPermittivity: number;
};

function MeasurementInputsCard({
  electronA,
  electronB,
  separation,
  mediumPermittivity
}: MeasurementInputsCardProps) {
  const q1 = getEffectiveCharge(electronA);
  const q2 = getEffectiveCharge(electronB);
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3 text-xs text-slate-300">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Measurement inputs</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span>{electronA ? electronA.label : "Electron A"}</span>
          <Badge variant="outline" className="border-white/10 bg-white/5">
            q₁ = {formatChargeLabel(q1)}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>{electronB ? electronB.label : "Electron B"}</span>
          <Badge variant="outline" className="border-white/10 bg-white/5">
            q₂ = {formatChargeLabel(q2)}
          </Badge>
        </div>
        <Separator className="bg-white/5" />
        <div className="flex items-center justify-between gap-2">
          <span>Separation r</span>
          <span>{separation.toExponential(2)} m</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Medium εᵣ</span>
          <span>{mediumPermittivity.toExponential(2)} F/m</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Electrical readouts depend directly on these live values. Change electron defaults or their structure model to see the probe respond.
      </p>
    </div>
  );
}

type InstrumentationStatusBadgeProps = {
  status: "idle" | "expected_drift" | "calibrated" | "alert";
  relativeError?: number | null;
  usingToroidal: boolean;
};

function InstrumentationStatusBadge({
  status,
  relativeError,
  usingToroidal
}: InstrumentationStatusBadgeProps) {
  const labelMap: Record<InstrumentationStatusBadgeProps["status"], string> = {
    idle: "Idle · waiting for probe",
    expected_drift: "Mock calibration · drift expected",
    calibrated: "Calibrated · within threshold",
    alert: `Drifted ${relativeError != null ? formatPercent(relativeError) : ""}`
  };
  const color =
    status === "calibrated"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
      : status === "expected_drift"
        ? "bg-amber-500/20 text-amber-100 border-amber-400/30"
        : status === "alert"
          ? "bg-rose-500/20 text-rose-200 border-rose-400/30"
          : "bg-slate-700/40 text-slate-200 border-white/10";
  return (
    <Badge variant="outline" className={`text-[11px] ${color}`}>
      {status === "expected_drift" && usingToroidal ? "Toroidal defaults · drift expected" : labelMap[status]}
    </Badge>
  );
}

type StackContextCardProps = {
  openVacuumPanel: () => void;
};

function StackContextCard({ openVacuumPanel }: StackContextCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
      <SectionTitle icon={Atom} title="Stack context" subtitle="Where this fits" />
      <ul className="space-y-2 text-sm text-slate-300">
        <li>
          <strong className="text-white">Microscopic ·</strong> Calibrates Coulomb k, effective charge, and g-factor from individual electrons.
        </li>
        <li>
          <strong className="text-white">Mesoscopic ·</strong> Reads pipeline timing and duty into a local orbital illustration.
        </li>
        <li>
          <strong className="text-white">Macroscopic ·</strong> Casimir tools are separate mechanism diagnostics; this orbital view does not supply an NHM2 source tensor.
        </li>
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 text-sky-300 hover:text-sky-100"
        onClick={openVacuumPanel}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Explore Casimir theory
      </Button>
    </div>
  );
}

type TelemetryCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null | undefined;
  unit?: string;
  reference?: number;
  referenceLabel?: string;
  hideDrift?: boolean;
};

function TelemetryCard({
  icon: Icon,
  label,
  value,
  unit,
  reference,
  referenceLabel,
  hideDrift
}: TelemetryCardProps) {
  const delta =
    value != null && reference != null && reference !== 0
      ? (value - reference) / reference
      : null;
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {formatNumber(value ?? null, 3)} {unit}
      </div>
      {reference != null && (
        <div className="mt-1 text-xs text-slate-400">
          Canonical: {formatNumber(reference, 3)}
          {referenceLabel ? ` (${referenceLabel})` : null}
        </div>
      )}
      {delta != null && !hideDrift && (
        <div className="mt-1 text-xs">
          Drift:{" "}
          <span className={Math.abs(delta) > 0.01 ? "text-rose-300" : "text-emerald-300"}>
            {formatPercent(delta)}
          </span>
        </div>
      )}
    </div>
  );
}

type SweepSparkProps = {
  samples: SweepSample[];
  canonical: number;
};

function SweepSparkline({ samples, canonical }: SweepSparkProps) {
  const width = 640;
  const height = 160;
  const minK = Math.min(...samples.map((s) => s.k), canonical);
  const maxK = Math.max(...samples.map((s) => s.k), canonical);
  const span = Math.max(1e-9, maxK - minK);
  const points = samples.map((sample, idx) => {
    const x = (idx / Math.max(1, samples.length - 1)) * width;
    const y = height - ((sample.k - minK) / span) * height;
    return `${x},${y}`;
  });
  const canonicalY = height - ((canonical - minK) / span) * height;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full rounded-xl border border-white/5 bg-slate-950/60 p-2">
      <polyline points={points.join(" ")} fill="none" stroke="#67e8f9" strokeWidth={2} />
      <line
        x1={0}
        x2={width}
        y1={canonicalY}
        y2={canonicalY}
        stroke="rgba(248,113,113,0.7)"
        strokeDasharray="6 4"
      />
      {samples.map((sample, idx) => (
        <circle
          key={idx}
          cx={(idx / Math.max(1, samples.length - 1)) * width}
          cy={height - ((sample.k - minK) / span) * height}
          r={3}
          fill="#f472b6"
          opacity={0.7}
        />
      ))}
    </svg>
  );
}

type EventLogProps = {
  events: OrbitEvent[];
};

function EventLog({ events }: EventLogProps) {
  const recent = events.slice(0, 6);
  if (!recent.length) {
    return <div className="text-sm text-slate-400">No AGI events emitted yet.</div>;
  }
  return (
    <ul className="space-y-2">
      {recent.map((event, idx) => (
        <li
          key={`${event.type}-${idx}`}
          className="flex items-start justify-between rounded-xl border border-white/5 bg-slate-950/60 p-3 text-sm"
        >
          <div>
            <div className="font-semibold text-white">{eventLabel(event)}</div>
            <div className="text-xs text-slate-400">
              {new Date().toLocaleTimeString()} · t={formatNumber(
                "simTime" in event ? event.simTime : "simTimeEnd" in event ? event.simTimeEnd : 0,
                2
              )}
            </div>
          </div>
          <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px]">
            {event.type}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function eventLabel(event: OrbitEvent) {
  switch (event.type) {
    case "constant_drift":
      return `Drifted ${event.constant} by ${formatPercent(event.relError)}`;
    case "normalization_error":
      return `Normalization ${formatPercent(event.norm - 1)} (limit ${formatPercent(event.tolerance)})`;
    case "topology_switch":
      return `Electron ${event.electronId} switched to ${event.to}`;
    case "sweep_complete":
      return `Sweep (${event.param}) completed`;
    default:
      return "Event";
  }
}

function formatPercent(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function getEffectiveCharge(electron?: ElectronState | null) {
  if (!electron) return null;
  const magnitude = electron.toroidal?.qDerived ?? ELECTRON_CHARGE;
  return -Math.abs(magnitude);
}

function formatChargeLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const inE = value / ELECTRON_CHARGE;
  const sign = inE >= 0 ? "+" : "−";
  return `${sign}${Math.abs(inE).toFixed(2)} e`;
}

function orbitalLabel(l: number) {
  switch (l) {
    case 0:
      return "s";
    case 1:
      return "p";
    case 2:
      return "d";
    case 3:
      return "f";
    default:
      return `ℓ${l}`;
  }
}

