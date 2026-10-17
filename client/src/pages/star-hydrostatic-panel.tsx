
import React from "react";
import {SolarEvidenceStatus} from '@/components/SolarEvidenceStatus';
import {formatSolarScientific} from '@/lib/solar-evidence-format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { HR_PRESETS, HR_CATEGORY_STYLES, HR_SWATCHES } from "@/data/hr-presets";
import type { HRCategory, ResearchOverlays, StarInputs } from "@/models/star";
import { buildPolytropeProfile } from "@/physics/polytrope";
import { kappaBody, kappaDrive } from "@/physics/curvature";
import { sampleGamowWindow } from "@/physics/gamow";
import {
  G,
  kB,
  mH,
  sigmaSB,
  Msun,
  Rsun,
  Lsun,
  radiationConstant,
} from "@/physics/constants";

const overlayDefaults: ResearchOverlays = {
  "p-modes": false,
  coherence: false,
  multifractal: false,
};

const overlayNotes: Record<keyof ResearchOverlays, string> = {
  "p-modes": "Granulation and 3.3 mHz p-mode rails (observational reference).",
  coherence: "Experimental CSL / time-crystal overlay. Marked as a research tool.",
  multifractal: "Solar/stellar intermittency overlays sourced from multifractal turbulence studies.",
};

const ignitionNetworks = [
  { value: "pp", label: "pp-chain" },
  { value: "cno", label: "CNO cycle" },
];

const solverLabels: Record<StarInputs["solver"], string> = {
  polytrope: "Quick polytrope",
  "hydro-lite": "Hydro-lite ODE",
};

const defaultPreset = HR_PRESETS["ms-g"];

const defaultInputs: StarInputs = {
  category: "ms-g",
  M: defaultPreset.M,
  R: defaultPreset.R,
  X: defaultPreset.X,
  Z: defaultPreset.Z,
  rotation: defaultPreset.rotation,
  polytropeN: defaultPreset.n,
  solver: defaultPreset.solver ?? "polytrope",
  drive: { powerPerArea: 1e9, duty: 0.5, gain: 1, dEff: 1 },
  ignition: { enabled: false, network: "pp", coreTemperatureK: 1.5e7 },
};

const COHERENCE_DEFAULTS = {
  collapsePressureThreshold: 0.7,
  lowCoherenceThreshold: 0.35,
  highDispersionThreshold: 0.55,
  energyBudgetCeiling: 0.85,
  fastStopConfidence: 0.6,
};

function StarHydrostaticPanel() {
  const [inputs, setInputs] = React.useState<StarInputs>(defaultInputs);
  const [lockRadius, setLockRadius] = React.useState(true);
  const [overlays, setOverlays] = React.useState<ResearchOverlays>(overlayDefaults);

  const mu = React.useMemo(() => meanMolecularWeight(inputs.X, inputs.Z), [inputs.X, inputs.Z]);

  const profile = React.useMemo(() => {
    try {
      return buildPolytropeProfile({
        n: inputs.polytropeN,
        M: inputs.M,
        R: inputs.R,
        mu,
      });
    } catch (error) {
      console.warn("polytrope solve failed", error);
      return null;
    }
  }, [inputs.M, inputs.R, inputs.polytropeN, mu, inputs.solver]);

  const luminosity =
    HR_PRESETS[inputs.category]?.luminosity ??
    estimateLuminosity(inputs.M / Msun) * Lsun;

  const teff = React.useMemo(() => {
    if (!Number.isFinite(luminosity) || luminosity <= 0) return Number.NaN;
    if (inputs.R <= 0) return Number.NaN;
    return Math.pow(luminosity / (4 * Math.PI * inputs.R * inputs.R * sigmaSB), 0.25);
  }, [luminosity, inputs.R]);

  const meanDensity = React.useMemo(() => {
    if (inputs.R <= 0) return Number.NaN;
    return inputs.M / ((4 / 3) * Math.PI * Math.pow(inputs.R, 3));
  }, [inputs.M, inputs.R]);

  const coreDensity = profile?.rho?.[0] ?? meanDensity;

  const surfaceGravity = React.useMemo(() => {
    if (inputs.R <= 0) return Number.NaN;
    return (G * inputs.M) / (inputs.R * inputs.R);
  }, [inputs.M, inputs.R]);

  const betaCore = React.useMemo(() => {
    if (!profile || !profile.T) return Number.NaN;
    if (!Number.isFinite(profile.T[0]) || profile.rho[0] <= 0) return Number.NaN;
    const pGas = (profile.rho[0] * kB * profile.T[0]) / (mu * mH);
    const pRad = (radiationConstant / 3) * Math.pow(profile.T[0], 4);
    return pGas / (pGas + pRad);
  }, [profile, mu]);

  const kappaBodyMean = kappaBody(meanDensity);
  const kappaBodyCore = kappaBody(coreDensity);
  const driveFlux = inputs.drive.powerPerArea * inputs.drive.duty;
  const kappaDriveValue = kappaDrive(driveFlux, inputs.drive.dEff, inputs.drive.gain);
  const ePotatoMean = kappaDriveValue / kappaBodyMean;
  const ePotatoCore = kappaDriveValue / kappaBodyCore;

  const coreTemperature = profile?.T?.[0] ?? inputs.ignition.coreTemperatureK;
  const tunnelZ2 = inputs.ignition.network === "cno" ? 6 : 1;
  const tunnelMu = inputs.ignition.network === "cno" ? (12 * mH) / 13 : 0.5 * mH;

  const gamow = React.useMemo(() => {
    if (!inputs.ignition.enabled) return null;
    if (!Number.isFinite(coreTemperature) || coreTemperature <= 0) return null;
    return sampleGamowWindow(coreTemperature, { Z1: 1, Z2: tunnelZ2, mu: tunnelMu });
  }, [inputs.ignition, coreTemperature, tunnelMu, tunnelZ2]);

  const balancePoints = React.useMemo(
    () => buildBalanceProfile(profile, inputs.R),
    [profile, inputs.R],
  );

  const jeansContext = React.useMemo(() => {
    const rhoCloud = meanDensity / 1e6;
    const jeansMass = estimateJeansMass(20, rhoCloud, mu);
    const freeFallSeconds = estimateFreeFallTime(rhoCloud);
    const kelvinHelmholtz = estimateKelvinHelmholtz(inputs.M, inputs.R, luminosity);
    return { jeansMass, freeFallSeconds, kelvinHelmholtz };
  }, [meanDensity, mu, inputs.M, inputs.R, luminosity]);

  const potatoPi = React.useMemo(
    () => computePotatoPi(meanDensity, inputs.R, 1e5),
    [meanDensity, inputs.R],
  );

  const overlayActive = Object.values(overlays).some(Boolean);

  const handleCategory = (category: HRCategory) => {
    const preset = HR_PRESETS[category];
    setInputs((prev) => ({
      ...prev,
      category,
      M: preset?.M ?? prev.M,
      R: preset?.R ?? prev.R,
      X: preset?.X ?? prev.X,
      Z: preset?.Z ?? prev.Z,
      rotation: preset?.rotation ?? prev.rotation,
      polytropeN: preset?.n ?? prev.polytropeN,
      solver: preset?.solver ?? prev.solver,
    }));
  };

  const handleMass = (massSol: number) => {
    if (!Number.isFinite(massSol) || massSol <= 0) return;
    setInputs((prev) => {
      const newM = massSol * Msun;
      const ratio = prev.M > 0 ? newM / prev.M : 1;
      const scaledR = lockRadius ? prev.R * Math.pow(ratio, 0.8) : prev.R;
      return { ...prev, M: newM, R: scaledR };
    });
  };

  const handleRadius = (radiusSol: number) => {
    if (!Number.isFinite(radiusSol) || radiusSol <= 0) return;
    setInputs((prev) => ({ ...prev, R: radiusSol * Rsun }));
  };
  return (
    <div className="space-y-6 px-6 pb-12 text-slate-100">
      <header className="space-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Hydrostatic Equilibrium - HR Categories
          </h1>
          <Badge className="bg-slate-800 text-slate-100">
            Polytrope + kappa ledger + Pi teaching inset
          </Badge>
          {overlayActive && (
            <Badge className="bg-pink-900/60 text-pink-100" variant="secondary">
              Experimental overlays enabled
            </Badge>
          )}
        </div>
        <p className="max-w-4xl text-sm text-slate-300">
          Pick an HR category, adjust mass, radius, composition, and drive inputs, and watch the Lane-Emden profile,
          kappa_drive/kappa_body ledger, and ignition/tunneling cues shift in lockstep. All language matches the Drive Guards
          teaching diagnostics. The shape-transition Pi inset is separate from the drive/body curvature proxy.
        </p>
      </header>
      <SolarEvidenceStatus kind="Derived diagnostic" availability={profile?'Available':'Rejected'}
        provenance="Local HR presets and operator inputs; no observational or evolved-MESA binding."
        quantity="Reduced-order polytrope and scalar diagnostics; luminosity comes from the category preset or mass-luminosity estimate."
        coordinates="Static radial structure; no stellar evolutionary time integration."
        processing={`Both solver selections currently use the polytrope builder. ${profile?'Profile built.':'Profile unavailable; displayed core density uses mean density and core temperature uses the ignition input.'}`}
        uncertainty="No observational fit, covariance or calibrated uncertainty model."
        limitations="Educational/reduced-order workspace, not an evolving solar baseline. The scalar drive-curvature overlay is independent of the selected NHM2 campaign and cannot establish source closure or physical viability. Hydrostatic balance does not establish thermal closure, lifetime extension or intervention feasibility." />

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>Category presets, structure knobs, drive pack, ignition, overlays.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={inputs.category} onValueChange={(value) => handleCategory(value as HRCategory)}>
                  <SelectTrigger className="bg-slate-900 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 text-slate-100">
                    {(Object.keys(HR_PRESETS) as HRCategory[]).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {HR_CATEGORY_STYLES[cat].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <span>
                    Preset M: {formatNumber((HR_PRESETS[inputs.category]?.M ?? 0) / Msun, 2)} M_sun
                  </span>
                  <span>
                    Preset R: {formatNumber((HR_PRESETS[inputs.category]?.R ?? 0) / Rsun, 2)} R_sun
                  </span>
                  <span>Preset Teff: {formatNumber((HR_PRESETS[inputs.category]?.teff ?? teff) / 1000, 1)} kK</span>
                </div>
              </div>

              <Separator className="bg-slate-800" />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mass (M/M_sun)</Label>
                  <Input
                    type="number"
                    value={formatNumber(inputs.M / Msun, 3)}
                    onChange={(e) => handleMass(e.currentTarget.valueAsNumber)}
                    className="bg-slate-900 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    <span>Radius (R/R_sun)</span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      lock
                      <Switch checked={lockRadius} onCheckedChange={setLockRadius} className="scale-75" />
                    </span>
                  </Label>
                  <Input
                    type="number"
                    value={formatNumber(inputs.R / Rsun, 3)}
                    onChange={(e) => handleRadius(e.currentTarget.valueAsNumber)}
                    className="bg-slate-900 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hydrogen fraction X</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    value={formatNumber(inputs.X, 2)}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, X: clamp01(e.currentTarget.valueAsNumber) }))
                    }
                    className="bg-slate-900 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Metallicity Z</Label>
                  <Input
                    type="number"
                    min={0}
                    max={0.1}
                    step="0.001"
                    value={formatNumber(inputs.Z, 3)}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, Z: clamp01(e.currentTarget.valueAsNumber) }))
                    }
                    className="bg-slate-900 text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rotation (Omega / Omega_crit)</Label>
                <Slider
                  value={[inputs.rotation]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => setInputs((prev) => ({ ...prev, rotation: value }))}
                />
                <p className="text-xs text-slate-400">
                  Rotation smears Pi thresholds; this slider mirrors the curvature ledger copy.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Polytrope n</Label>
                  <Select
                    value={String(inputs.polytropeN)}
                    onValueChange={(value) =>
                      setInputs((prev) => ({ ...prev, polytropeN: Number(value) as 1.5 | 3 }))
                    }
                  >
                    <SelectTrigger className="bg-slate-900 text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-slate-100">
                      <SelectItem value="1.5">n = 1.5 (convective)</SelectItem>
                      <SelectItem value="3">n = 3 (radiation dominated)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Solver</Label>
                  <Tabs
                    value={inputs.solver}
                    onValueChange={(value) =>
                      setInputs((prev) => ({ ...prev, solver: value as StarInputs["solver"] }))
                    }
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-slate-900">
                      <TabsTrigger value="polytrope">{solverLabels.polytrope}</TabsTrigger>
                      <TabsTrigger value="hydro-lite">{solverLabels["hydro-lite"]}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-2">
                <Label>Drive pack (matches Drive Guards / Potato Lab)</Label>
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={inputs.drive.powerPerArea}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        drive: { ...prev.drive, powerPerArea: Math.max(0, e.currentTarget.valueAsNumber) },
                      }))
                    }
                    className="bg-slate-900 text-slate-100"
                    placeholder="Power per area (W/m^2)"
                  />
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step="0.01"
                      value={inputs.drive.duty}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          drive: { ...prev.drive, duty: clamp01(e.currentTarget.valueAsNumber) },
                        }))
                      }
                      className="bg-slate-900 text-slate-100"
                      placeholder="Duty"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={inputs.drive.gain}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          drive: { ...prev.drive, gain: Math.max(0, e.currentTarget.valueAsNumber) },
                        }))
                      }
                      className="bg-slate-900 text-slate-100"
                      placeholder="Geometry gain"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={inputs.drive.dEff}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          drive: { ...prev.drive, dEff: Math.max(0, e.currentTarget.valueAsNumber) },
                        }))
                      }
                      className="bg-slate-900 text-slate-100"
                      placeholder="d_eff"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  kappa_drive = (8 pi G / c^5) (P/A) d_eff geometry_gain, identical to the Drive Guards calculation.
                </p>
              </div>
              <Separator className="bg-slate-800" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Ignition pack</p>
                    <p className="text-xs text-slate-400">Toggle pp vs CNO tunneling overlays.</p>
                  </div>
                  <Switch
                    checked={inputs.ignition.enabled}
                    onCheckedChange={(checked) =>
                      setInputs((prev) => ({ ...prev, ignition: { ...prev.ignition, enabled: checked } }))
                    }
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Select
                    value={inputs.ignition.network}
                    onValueChange={(value) =>
                      setInputs((prev) => ({
                        ...prev,
                        ignition: { ...prev.ignition, network: value as StarInputs["ignition"]["network"] },
                      }))
                    }
                  >
                    <SelectTrigger className="bg-slate-900 text-slate-100">
                      <SelectValue placeholder="Network" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-slate-100">
                      {ignitionNetworks.map((net) => (
                        <SelectItem key={net.value} value={net.value}>
                          {net.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    step="0.1"
                    value={formatNumber(inputs.ignition.coreTemperatureK / 1e6, 2)}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        ignition: {
                          ...prev.ignition,
                          coreTemperatureK: Math.max(1e6, e.currentTarget.valueAsNumber * 1e6),
                        },
                      }))
                    }
                    className="bg-slate-900 text-slate-100"
                    placeholder="Core T (MK)"
                  />
                </div>
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-2">
                <Label>Research overlays (opt-in)</Label>
                <div className="space-y-2">
                  {(Object.entries(overlays) as [keyof ResearchOverlays, boolean][]).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-start justify-between rounded border border-slate-800 p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium capitalize text-slate-100">{key}</p>
                        <p className="text-[11px] text-slate-400">{overlayNotes[key]}</p>
                      </div>
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) =>
                          setOverlays((prev) => ({ ...prev, [key]: checked }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
        <section className="col-span-12 space-y-4 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Star snapshot</CardTitle>
              <CardDescription>Teff, luminosity, densities, surface gravity, rotation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-slate-300">
              <StatBlock label="Teff" value={`${formatNumber(teff / 1000, 2)} kK`} />
              <StatBlock label="L / L_sun" value={formatSci(luminosity / Lsun)} />
              <StatBlock label="Rotation" value={`${formatNumber(inputs.rotation * 100, 1)} % crit`} />
              <StatBlock label="Mean density" value={`${formatSci(meanDensity)} kg/m^3`} />
              <StatBlock label="Core density" value={`${formatSci(coreDensity)} kg/m^3`} />
              <StatBlock label="Surface gravity" value={`${formatNumber(surfaceGravity / 9.81, 2)} g_earth`} />
              <StatBlock label="Beta (gas pressure fraction)" value={Number.isFinite(betaCore) ? betaCore.toFixed(2) : "n/a"} />
              <StatBlock label="Drive overlays" value={overlayActive ? "Research tools on" : "Baseline physics"} span />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hydrostatic balance</CardTitle>
              <CardDescription>|dP/dr| vs rho g from the Lane-Emden backbone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <BalancePlot points={balancePoints} />
              <p className="text-xs text-slate-400">
                When the orange and blue curves hug each other, pressure gradients cancel gravity shell-by-shell.
                Hydro-lite reuses the same backbone but emphasizes the two-ODE framing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Curvature ledger</CardTitle>
              <CardDescription>Illustrative scalar kappa_drive vs kappa_body comparison used in Drive Guards; no NHM2 solve authority.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <LedgerRow label="kappa_body (mean)" value={`${formatSci(kappaBodyMean)} m^-2`} />
              <LedgerRow label="kappa_body (core)" value={`${formatSci(kappaBodyCore)} m^-2`} />
              <LedgerRow label="kappa_drive" value={`${formatSci(kappaDriveValue)} m^-2`} />
              <LedgerRow label="E_potato (mean)" value={formatSci(ePotatoMean)} />
              <LedgerRow label="E_potato (core)" value={formatSci(ePotatoCore)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Star coherence (observable proofs)</CardTitle>
              <CardDescription>
                Ground the coherence story in solar evidence: 5-minute p-modes protect coherent mass; flares and sunquakes
                show rapid collapse when gravitational self-energy spikes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 space-y-1">
                <p className="font-semibold text-white">Core equations</p>
                <p className="text-slate-300">
                  Collapse time follows the Penrose OR estimate <code>tau ~ hbar / E_G</code>. For solar structures we use
                  <code>E_G ~ G (Delta m)^2 / Delta r</code> as a proxy: more mass in superposition or tighter separation
                  boosts self-energy and shortens tau. Protected bands (like the 3.3 mHz p-mode clock) stretch tau;
                  detuning and stored free energy shrink it until a collapse fires.
                </p>
              </div>

              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 space-y-2">
                <p className="font-semibold text-white">Solved solar cues (static)</p>
                <ul className="list-disc space-y-1 pl-4 text-slate-300">
                  <li>p-mode clock: nu ~ 3.3 mHz &rarr; P ~ 300 s (resonant protection window).</li>
                  <li>Granule cat: Delta r ~ 1 Mm, modest Delta m &rarr; E_G stays low &rarr; minute-scale coherence survives.</li>
                  <li>Flux-rope cat: Delta r ~ 30-100 Mm, large Delta m &rarr; E_G jumps &rarr; tau collapses to seconds (flares/sunquakes).</li>
                </ul>
                <p className="text-xs text-slate-400">Static teaching numbers; no live stream is shown on this page.</p>
              </div>

              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 space-y-2">
                <p className="font-semibold text-white">Telemetry thresholds (sim)</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                  <GuardrailRow label="Collapse pressure >=" value={COHERENCE_DEFAULTS.collapsePressureThreshold} />
                  <GuardrailRow label="Low coherence <" value={COHERENCE_DEFAULTS.lowCoherenceThreshold} />
                  <GuardrailRow label="High dispersion >" value={COHERENCE_DEFAULTS.highDispersionThreshold} />
                  <GuardrailRow label="Energy ceiling >" value={COHERENCE_DEFAULTS.energyBudgetCeiling} />
                </div>
                <p className="text-xs text-slate-400">
                  Fast-stop uses collapse confidence &ge; {(COHERENCE_DEFAULTS.fastStopConfidence * 100).toFixed(0)}%. Star service env toggles control collapse
                  gating and endpoint selection (STAR_COLLAPSE_ENABLE, STAR_SERVICE_URL, etc.).
                </p>
              </div>

              <div className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100">
                <div className="flex flex-col gap-2">
                  <p className="uppercase tracking-[0.2em] text-sky-300">Docs</p>
                  <p className="text-[11px] text-sky-200">
                    Observational derivation: {""}
                    <a className="underline text-white" href="/docs/stellar-consciousness-ii.md">docs/stellar-consciousness-ii.md</a>. Orch-OR bridge: {""}
                    <a className="underline text-white" href="/docs/stellar-consciousness-orch-or-review.md">docs/stellar-consciousness-orch-or-review.md</a>.
                  </p>
                  <p className="text-[10px] text-sky-200/80">
                    Live AGI session coherence streams stay in the Star Coherence Governor panel.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ignition & tunneling</CardTitle>
              <CardDescription>Gamow window viewer plus quick stats.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <GamowPlot sample={gamow} enabled={inputs.ignition.enabled} />
              <div className="space-y-2 text-sm text-slate-300">
                <StatBlock
                  label="Core temperature"
                  value={Number.isFinite(coreTemperature) ? `${formatNumber(coreTemperature / 1e6, 2)} MK` : "n/a"}
                  span
                />
                <StatBlock
                  label="Network"
                  value={inputs.ignition.network === "pp" ? "pp-chain (p+p)" : "CNO proxy (p + C12)"}
                  span
                />
                <StatBlock
                  label="Relative rate (unnormalized)"
                  value={gamow ? formatSci(gamow.relativeRate) : inputs.ignition.enabled ? "pending" : "off"}
                  span
                />
                <p className="text-xs text-slate-400">
                  The kernel uses the classic exp(-2 pi eta(E)) barrier factor. Tooltips link to improved WKB/Kemble
                  references for anyone cross-checking lab tunneling treatments.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
              <CardHeader>
                <CardTitle>Formation timeline & Pi inset</CardTitle>
                <CardDescription>Jeans cloud &rarr; collapse &rarr; ignition plus the potato threshold reminder.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <TimelineCard
                  label="Jeans mass"
                  primary={`${formatNumber(jeansContext.jeansMass / Msun, 2)} M_sun`}
                  caption="20 K cloud, density scaled from current mean."
                />
                <TimelineCard
                  label="Free-fall time"
                  primary={formatDuration(jeansContext.freeFallSeconds)}
                  caption="sqrt(3 pi / 32 G rho) with the cloud proxy."
                />
                <TimelineCard
                  label="Kelvin-Helmholtz"
                  primary={formatDuration(jeansContext.kelvinHelmholtz)}
                  caption="GM^2 / (R L) cooling time."
                />
              </div>
              <div className="space-y-2 rounded border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm font-semibold text-slate-100">Pi teaching inset</p>
                <p className="text-xs text-slate-400">
                  Pi = (4 pi G / 3) rho^2 R^2 / sigma_y is an illustrative self-gravity versus yield-stress ratio.
                  Applying its fixed solid-body sigma_y placeholder to stellar gas is a teaching extrapolation, not a stellar material model.
                </p>
                <div className="flex items-center justify-between font-mono text-lg">
                  <span>Pi(star)</span>
                  <span>{formatSci(potatoPi)}</span>
                </div>
                <p className="text-[11px] text-slate-500">sigma_y placeholder = 1e5 Pa.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HR map</CardTitle>
              <CardDescription>Current point (Teff, L) with category swatches.</CardDescription>
            </CardHeader>
            <CardContent>
              <HRDiagram teff={teff} luminosity={luminosity} category={inputs.category} />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

export default StarHydrostaticPanel;
function StatBlock({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "md:col-span-2" : undefined}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-base text-slate-100">{value}</p>
    </div>
  );
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-mono text-slate-100">{value}</span>
    </div>
  );
}

function TimelineCard({
  label,
  primary,
  caption,
}: {
  label: string;
  primary: string;
  caption: string;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-50">{primary}</p>
      <p className="text-xs text-slate-500">{caption}</p>
    </div>
  );
}

function HRDiagram({
  teff,
  luminosity,
  category,
}: {
  teff: number;
  luminosity: number;
  category: HRCategory;
}) {
  const width = 480;
  const height = 260;
  const teffRange: [number, number] = [Math.log10(2000), Math.log10(60000)];
  const lumRange: [number, number] = [-6, 6];

  const logTeff = Math.log10(teff);
  const normTeff = clamp01((logTeff - teffRange[0]) / (teffRange[1] - teffRange[0]));
  const logLum = Math.log10(luminosity / Lsun);
  const normLum = clamp01((logLum - lumRange[0]) / (lumRange[1] - lumRange[0]));

  return (
    <div className="overflow-hidden rounded border border-slate-800 bg-slate-950 p-3">
      <svg width={width} height={height} className="w-full">
        {HR_SWATCHES.map((swatch) => {
          const x0 = clamp01((Math.log10(swatch.teffRange[0]) - teffRange[0]) / (teffRange[1] - teffRange[0]));
          const x1 = clamp01((Math.log10(swatch.teffRange[1]) - teffRange[0]) / (teffRange[1] - teffRange[0]));
          const y0 = clamp01((Math.log10(swatch.lumRange[0]) - lumRange[0]) / (lumRange[1] - lumRange[0]));
          const y1 = clamp01((Math.log10(swatch.lumRange[1]) - lumRange[0]) / (lumRange[1] - lumRange[0]));
          return (
            <rect
              key={swatch.category}
              x={width * (1 - Math.max(x0, x1))}
              y={height * (1 - Math.max(y0, y1))}
              width={width * Math.abs(x0 - x1)}
              height={height * Math.abs(y0 - y1)}
              fill={HR_CATEGORY_STYLES[swatch.category].color}
              fillOpacity={0.08}
              stroke={HR_CATEGORY_STYLES[swatch.category].color}
              strokeOpacity={0.15}
            />
          );
        })}
        <circle
          cx={width * (1 - normTeff)}
          cy={height * (1 - normLum)}
          r={6}
          fill={HR_CATEGORY_STYLES[category].color}
        />
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>Teff {formatNumber(teff / 1000, 2)} kK</span>
        <span>L/L_sun {formatSci(luminosity / Lsun)}</span>
        <span>{HR_CATEGORY_STYLES[category].label}</span>
      </div>
    </div>
  );
}
type BalancePoint = {
  rFraction: number;
  dPdr: number;
  rhoG: number;
};

function BalancePlot({ points }: { points: BalancePoint[] }) {
  if (!points.length) {
    return <div className="text-sm text-slate-500">Profile pending...</div>;
  }
  const width = 360;
  const height = 160;
  const values = points.flatMap((p) => [p.dPdr, p.rhoG]).filter((v) => v > 0);
  if (!values.length) {
    values.push(1);
  }
  const minLog = Math.log10(Math.max(Math.min(...values), 1e-6));
  const maxLog = Math.log10(Math.max(...values, 1));

  const renderLine = (key: "dPdr" | "rhoG", color: string) => (
    <polyline
      key={key}
      fill="none"
      stroke={color}
      strokeWidth={2}
      points={points
        .map((pt) => {
          const x = pt.rFraction * width;
          const yVal = Math.log10(Math.max(pt[key], 1e-12));
          const y = height * (1 - (yVal - minLog) / (maxLog - minLog));
          return `${x},${y}`;
        })
        .join(" ")}
    />
  );

  return (
    <svg width={width} height={height} className="w-full rounded border border-slate-800 bg-slate-950 p-1">
      {renderLine("dPdr", "#f97316")}
      {renderLine("rhoG", "#38bdf8")}
    </svg>
  );
}

function GamowPlot({
  sample,
  enabled,
}: {
  sample: ReturnType<typeof sampleGamowWindow> | null;
  enabled: boolean;
}) {
  if (!enabled) return <div className="text-sm text-slate-500">Ignition pack disabled.</div>;
  if (!sample) return <div className="text-sm text-slate-500">Waiting on core temperature...</div>;

  const width = 360;
  const height = 160;
  const kernel = Array.from(sample.kernel);
  const kernelLength = kernel.length;
  const rawMax = kernelLength ? Math.max(...kernel) : 0;
  const maxValue = rawMax || 1;
  const eMax = sample.energiesKeV[sample.energiesKeV.length - 1] || 1;
  const kernelPath = kernel
    .map((value, idx) => {
      const x = (idx / Math.max(kernelLength - 1, 1)) * width;
      const y = height * (1 - value / maxValue);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="w-full rounded border border-slate-800 bg-slate-950 p-1">
      <polyline fill="none" stroke="#f472b6" strokeWidth={2} points={kernelPath} />
      <rect
        x={(sample.windowKeV[0] / eMax) * width}
        width={((sample.windowKeV[1] - sample.windowKeV[0]) / eMax) * width}
        y={0}
        height={height}
        fill="#f472b6"
        fillOpacity={0.08}
      />
      <text x={8} y={16} className="fill-slate-400 text-xs">
        Peak ~ {formatNumber(sample.peakEnergyKeV, 2)} keV
      </text>
    </svg>
  );
}

function buildBalanceProfile(
  profile: ReturnType<typeof buildPolytropeProfile> | null,
  R: number,
): BalancePoint[] {
  if (!profile) return [];
  const points: BalancePoint[] = [];
  for (let i = 1; i < profile.r.length; i++) {
    const r = profile.r[i];
    if (r <= 0 || r > R) continue;
    const dr = profile.r[i] - profile.r[i - 1];
    if (!Number.isFinite(dr) || dr === 0) continue;
    const dP = profile.P[i] - profile.P[i - 1];
    const dPdr = Math.abs(dP / dr);
    const enclosed = profile.Menc[i];
    const g = (G * enclosed) / (r * r);
    const rhoG = Math.abs(profile.rho[i] * g);
    points.push({ rFraction: r / R, dPdr, rhoG });
  }
  return points;
}

const TelemetryMetric = ({ label, value }: { label: string; value?: number }) => {
  const display = typeof value === "number" ? `${(value * 100).toFixed(0)}%` : "—";
  return (
    <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{display}</div>
    </div>
  );
};

const GuardrailRow = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between rounded border border-white/5 bg-white/5 px-2 py-1.5">
    <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
    <span className="font-mono text-sm text-white">{value.toFixed(2)}</span>
  </div>
);

function meanMolecularWeight(X: number, Z: number) {
  const clampedX = clamp01(X);
  const clampedZ = clamp01(Z);
  const Y = Math.max(0, 1 - clampedX - clampedZ);
  return 1 / (2 * clampedX + (3 / 4) * Y + 0.5 * clampedZ + 1e-9);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function formatSci(value: number, digits = 2) {
  return formatSolarScientific(value,digits);
}

function formatPercent01(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(0)}%`;
}

function estimateLuminosity(massSolar: number) {
  if (massSolar <= 0) return 0;
  if (massSolar < 0.43) return 0.23 * Math.pow(massSolar, 2.3);
  if (massSolar < 2) return Math.pow(massSolar, 4);
  if (massSolar < 20) return 1.5 * Math.pow(massSolar, 3.5);
  return 32000 * massSolar;
}

function estimateJeansMass(tempK: number, rho: number, mu: number) {
  const cSound = Math.sqrt((kB * tempK) / (mu * mH));
  const factor = (Math.PI ** (5 / 2)) / 6;
  return factor * Math.pow(cSound, 3) / Math.sqrt(Math.pow(G, 3) * rho);
}

function estimateFreeFallTime(rho: number) {
  if (!Number.isFinite(rho) || rho <= 0) return Number.NaN;
  return Math.sqrt((3 * Math.PI) / (32 * G * rho));
}

function estimateKelvinHelmholtz(M: number, R: number, L: number) {
  if (!Number.isFinite(M) || !Number.isFinite(R) || !Number.isFinite(L) || R <= 0 || L <= 0) return Number.NaN;
  return (G * M * M) / (R * L);
}

function computePotatoPi(rho: number, R: number, sigmaY: number) {
  if (!Number.isFinite(rho) || !Number.isFinite(R) || sigmaY <= 0) return Number.NaN;
  return ((4 * Math.PI * G) / 3) * (rho * rho * R * R) / sigmaY;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "n/a";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  const days = hours / 24;
  if (days < 365) return `${days.toFixed(1)} d`;
  const years = days / 365;
  if (years < 1e3) return `${years.toFixed(1)} yr`;
  const kyr = years / 1e3;
  if (kyr < 1e3) return `${kyr.toFixed(1)} kyr`;
  const Myr = kyr / 1e3;
  if (Myr < 1e3) return `${Myr.toFixed(2)} Myr`;
  const Gyr = Myr / 1e3;
  return `${Gyr.toFixed(2)} Gyr`;
}
