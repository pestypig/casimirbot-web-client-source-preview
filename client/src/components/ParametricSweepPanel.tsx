// client/src/components/ParametricSweepPanel.tsx
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useParametricSweepController } from "@/hooks/useParametricSweepController";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import {
  DEFAULT_GEOM_COUPLING,
  DEFAULT_PUMP_EFF,
  DEFAULT_MAX_DEPTH_PCT,
  DEFAULT_MIN_DEPTH_PCT,
  RHO_CUTOFF,
  depthPctToEpsilon,
  resolvePhaseWindows,
} from "@/lib/parametric-sweep";
import { useRegisterWhisperContext } from "@/lib/whispers/contextRegistry";
import { usePanelHashFocus } from "@/lib/whispers/usePanelHashFocus";
import type {
  SweepRanges,
  SweepResolution,
  PipelineSnapshot,
  SimulationParams,
  PointResult,
  SweepAggregate,
  PhiStarEntry,
} from "@/lib/parametric-sweep";

type HeatmapTileInfo = {
  x: number;
  y: number;
  v: number | null;
  lambdaSign?: number | null;
  rho?: number | null;
  margin?: number | null;
};

type HeatmapProps = {
  width: number;
  height: number;
  tiles: HeatmapTileInfo[];
  xs: number[];
  ys: number[];
  title?: string;
};

const Heatmap: React.FC<HeatmapProps> = ({
  width,
  height,
  tiles,
  xs,
  ys,
  title,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, width, height);

    if (!tiles.length || !xs.length || !ys.length) {
      return;
    }

    const cellWidth = width / xs.length;
    const cellHeight = height / ys.length;

    const vMin = -40;
    const vMax = 15;
    const normalize = (value: number) => (value - vMin) / (vMax - vMin);

    const colorFor = (value: number, sign?: number | null) => {
      const t = normalize(value);
      const clamped = Math.max(0, Math.min(1, t));
      if (sign !== undefined && sign !== null && sign < 0) {
        // Amplification quadrant -> cool/blue palette
        const r = Math.round(40 + 60 * clamped);
        const g = Math.round(140 + 90 * clamped);
        const b = Math.round(210 + 30 * (1 - clamped));
        return `rgba(${r},${g},${b},1)`;
      }
      // Attenuation quadrant -> warm palette
      const r = Math.round(200 + 40 * clamped);
      const g = Math.round(70 + 60 * clamped);
      const b = Math.round(70 + 30 * (1 - clamped));
      return `rgba(${r},${g},${b},1)`;
    };

    for (const tile of tiles) {
      const xi = xs.indexOf(tile.x);
      const yi = ys.indexOf(tile.y);
      if (xi < 0 || yi < 0) {
        continue;
      }
      const x0 = xi * cellWidth;
      const y0 = (ys.length - 1 - yi) * cellHeight;
      if (tile.v == null) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(x0, y0, cellWidth, cellHeight);
        ctx.strokeStyle = "rgba(148,163,184,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + cellHeight);
        ctx.lineTo(x0 + cellWidth, y0);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = colorFor(tile.v, tile.lambdaSign);
      ctx.fillRect(x0, y0, cellWidth, cellHeight);
    }

    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= xs.length; i += 1) {
      const x = i * cellWidth + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let j = 0; j <= ys.length; j += 1) {
      const y = j * cellHeight + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (title) {
      ctx.fillStyle = "rgba(226,232,240,0.9)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(title, 8, 16);
    }
  }, [tiles, xs, ys, width, height, title]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block", borderRadius: 6 }}
    />
  );
};

type PanelProps = {
  onCapturePreset?: (point: PointResult) => void;
};

const DEFAULT_DEPTH_PCT = 0.005;
const MIN_DEPTH_PCT = DEFAULT_MIN_DEPTH_PCT;
const MAX_DEPTH_PCT = DEFAULT_MAX_DEPTH_PCT;
const DEPTH_STEP = 0.00000001;

const clampDepth = (value: number) =>
  Math.max(MIN_DEPTH_PCT, Math.min(MAX_DEPTH_PCT, value));

const formatDepth = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (value >= 0.1) {
    return value.toFixed(2);
  }
  if (value >= 0.01) {
    return value.toFixed(3);
  }
  if (value >= 0.001) {
    return value.toFixed(4);
  }
  if (value >= 0.0001) {
    return value.toFixed(5);
  }
  return value.toExponential(2);
};

function fmtKappaMHz(vMHz: number | null | undefined): string {
  if (!Number.isFinite(vMHz ?? NaN)) {
    return "â€”";
  }
  const value = Number(vMHz);
  const abs = Math.abs(value);
  if (abs >= 0.1) {
    return `${value.toFixed(3)} MHz`;
  }
  if (abs >= 1e-3) {
    return `${(value * 1e3).toFixed(2)} kHz`;
  }
  if (abs >= 1e-6) {
    return `${(value * 1e6).toFixed(1)} Hz`;
  }
  if (abs >= 1e-9) {
    return `${(value * 1e9).toFixed(1)} mHz`;
  }
  return `${value.toExponential(2)} MHz`;
}

const formatRange = (value: number) =>
  Number.isFinite(value) ? value.toString() : "";

const parseResolution = (value: string) =>
  value
    .split(",")
    .map((part) => Math.max(1, Math.floor(Number(part.trim()))))
    .filter((item) => Number.isFinite(item));

export default function ParametricSweepPanel({ onCapturePreset }: PanelProps) {
  const pipelineQuery = useEnergyPipeline();
  const pipelineLive = pipelineQuery.data;
  const { start, stop, runId, snapshot } = useParametricSweepController();
  const { pumpPhaseDeg, setPumpPhaseDeg } = useDriveSyncStore((state) => ({
    pumpPhaseDeg: state.pumpPhaseDeg,
    setPumpPhaseDeg: state.setPumpPhaseDeg,
  }));

  const refGap = pipelineLive?.gap_nm ?? 200;
  const refQL = pipelineLive?.qCavity ?? 1e4;
  const refF0 = pipelineLive?.modulationFreq_GHz ?? 15;
  const geomCoupling = pipelineLive?.geomCoupling ?? DEFAULT_GEOM_COUPLING;
  const pumpEff = pipelineLive?.pumpEff ?? DEFAULT_PUMP_EFF;
  const safeQL = Math.max(1, refQL);

  const [ranges, setRanges] = React.useState<SweepRanges>({
    gap_nm: [20, 400],
    Omega_GHz: [refF0 * 2 * 0.995, refF0 * 2 * 1.005],
    phase_deg: [-30, 30],
  });
  const [resolution, setResolution] = React.useState<SweepResolution>({
    gap: 18,
    Omega: 151,
    phase: 61,
  });
  const [depthPct, setDepthPct] = React.useState<number>(DEFAULT_DEPTH_PCT);
  const [depthEdited, setDepthEdited] = React.useState<boolean>(false);

  const recommendedDepthPct = React.useMemo(() => {
    const rhoTarget = 0.4;
    const denom = Math.max(1e-12, geomCoupling * pumpEff * safeQL);
    const raw = (rhoTarget / denom) * 100;
    const sanitized = Number.isFinite(raw) ? raw : MIN_DEPTH_PCT;
    return clampDepth(sanitized);
  }, [geomCoupling, pumpEff, safeQL]);

  React.useEffect(() => {
    setDepthEdited(false);
  }, [safeQL, geomCoupling, pumpEff]);

  React.useEffect(() => {
    if (!depthEdited) {
      setDepthPct((prev) =>
        Math.abs(prev - recommendedDepthPct) > 1e-12
          ? recommendedDepthPct
          : prev
      );
    }
  }, [recommendedDepthPct, depthEdited]);

  const pipelineSnapshot = React.useMemo<PipelineSnapshot>(
    () => ({
      gap_nm: refGap,
      modulationFreq_GHz: refF0,
      qCavity: refQL,
      geomCoupling,
      pumpEff,
      pumpPhaseBiasDeg: pumpPhaseDeg,
      gainMax_dB: 15,
      kappaFloor_MHz: 0.01,
      staySubThreshold: true,
      minDepth_pct: MIN_DEPTH_PCT,
      maxDepth_pct: MAX_DEPTH_PCT,
    }),
    [refGap, refF0, refQL, pumpPhaseDeg, geomCoupling, pumpEff]
  );

  const simulationParams = React.useMemo<SimulationParams>(
    () => ({
      depth_pct: depthPct,
      alpha_gap_to_f0: 1,
      geomCoupling,
      pumpEff,
      phaseJitter_deg: 0.5,
      freqJitterFrac: 0.1,
      jitterSamples: 5,
      maxGain_dB: 15,
      kappaFloor_MHz: 0.01,
      staySubThreshold: true,
    }),
    [depthPct, geomCoupling, pumpEff]
  );

  const rhoEstimate = React.useMemo(() => {
    const epsilon = depthPctToEpsilon(depthPct, geomCoupling, pumpEff);
    return epsilon * safeQL;
  }, [depthPct, geomCoupling, pumpEff, safeQL]);

  const sweepSnapshot = runId ? snapshot(runId) : null;
  const aggregate: SweepAggregate | undefined = sweepSnapshot?.aggregate;
  const progress = sweepSnapshot?.progress;
  const stats = aggregate?.stats;

  const ridgeEmptyNote = React.useMemo(() => {
    if (!stats) {
      return "";
    }
    if (stats.samples === 0) {
      return "";
    }
    if (stats.stable > 0) {
      return "";
    }
    if (stats.filtered > 0 && stats.filtered === stats.samples) {
      if (stats.filteredRho === stats.filtered) {
        return `All samples filtered by rho guard. Try depth <= ${formatDepth(recommendedDepthPct)}% or reduce Q.`;
      }
      if (stats.filteredDepth === stats.filtered) {
        return "All samples fell outside the allowed depth range.";
      }
      return "All samples filtered by safety envelopes.";
    }
    if (stats.threshold === stats.samples) {
      return "Every sample hit the parametric threshold.";
    }
    if (stats.linewidthCollapse === stats.samples) {
      return "Every sample collapsed the linewidth floor.";
    }
    return "";
  }, [stats, recommendedDepthPct]);

  const currentSlice = React.useMemo(() => {
    if (!aggregate?.omegaSlices?.length) {
      return null;
    }
    return aggregate.omegaSlices[aggregate.omegaSlices.length - 1];
  }, [aggregate]);

  const tiles = React.useMemo<HeatmapTileInfo[]>(() => {
    if (!currentSlice) {
      return [];
    }
    return currentSlice.tiles.map((tile) => ({
      x: tile.gap_nm,
      y: tile.phase_deg,
      v: tile.value_dB,
      lambdaSign: tile.lambdaSign ?? undefined,
      rho: tile.rho ?? undefined,
      margin: tile.subThresholdMargin ?? undefined,
    }));
  }, [currentSlice]);

  const phiStar = React.useMemo(() => {
    if (!aggregate?.phiStarIndex) {
      return null;
    }
    const entries = Object.values(aggregate.phiStarIndex) as PhiStarEntry[];
    if (!entries.length) {
      return null;
    }
    const targetOmega = currentSlice?.Omega_GHz ?? refF0 * 2;
    let best: (PhiStarEntry & { score: number }) | null = null;
    for (const entry of entries) {
      const gapDelta =
        Math.abs(entry.gap_nm - refGap) / Math.max(refGap, 1);
      const omegaDelta = Math.abs(entry.Omega_GHz - targetOmega);
      const rhoDelta = Math.abs((entry.rho ?? 0) - rhoEstimate);
      const score = gapDelta * 0.5 + omegaDelta * 2 + rhoDelta;
      if (
        !best ||
        score < best.score ||
        (score === best.score && entry.gain_dB > best.gain_dB)
      ) {
        best = { ...entry, score };
      }
    }
    return best;
  }, [aggregate?.phiStarIndex, currentSlice, refF0, refGap, rhoEstimate]);

  const phaseWindowsCount = React.useMemo(
    () => resolvePhaseWindows(ranges.phase_deg).length,
    [ranges.phase_deg],
  );
  const subMargin =
    typeof phiStar?.subThresholdMargin === "number"
      ? phiStar.subThresholdMargin
      : typeof aggregate?.topRidge?.[0]?.subThresholdMargin === "number"
        ? aggregate.topRidge![0].subThresholdMargin
        : undefined;
  const rhoPeak =
    typeof phiStar?.rho === "number"
      ? phiStar.rho
      : typeof aggregate?.topRidge?.[0]?.rho === "number"
        ? aggregate.topRidge![0].rho
        : undefined;
  const depthViolation = (stats?.filteredDepth ?? 0) > 0;
  const clippedAny = (stats?.clipped ?? 0) > 0;
  const jitterCollapse = (stats?.linewidthCollapse ?? 0) > 0;
  const sanitizedSubMargin = Number.isFinite(subMargin) ? subMargin : undefined;
  const sanitizedRho = Number.isFinite(rhoPeak) ? rhoPeak : undefined;

  const sweepWhisperContext = React.useMemo(
    () => ({
      subThresholdMargin: sanitizedSubMargin,
      rho: sanitizedRho,
      rhoCutoff: RHO_CUTOFF,
      phaseWindows: phaseWindowsCount,
      depthViolation,
      depthBounds: [MIN_DEPTH_PCT, MAX_DEPTH_PCT] as [number, number],
      clipped: clippedAny,
      jitterCollapse,
      jitterSamples: simulationParams.jitterSamples,
    }),
    [
      sanitizedSubMargin,
      sanitizedRho,
      phaseWindowsCount,
      depthViolation,
      clippedAny,
      jitterCollapse,
      simulationParams.jitterSamples,
    ],
  );
  useRegisterWhisperContext("#sweeps", sweepWhisperContext);
  const panelRef = usePanelHashFocus("#sweeps", () => sweepWhisperContext);

  const onBiasPhiStar = React.useCallback(() => {
    if (!phiStar) {
      return;
    }
    setPumpPhaseDeg(phiStar.phi_deg);
  }, [phiStar, setPumpPhaseDeg]);

  const onStart = React.useCallback(() => {
    void start({
      ranges,
      resolution,
      pipeline: pipelineSnapshot,
      params: simulationParams,
      chunkSize: 96,
      abortOnCollapse: true,
      collapseFloor_MHz: 0.01,
      collapseConsecutive: 3,
    });
  }, [start, ranges, resolution, pipelineSnapshot, simulationParams]);

  const onStop = React.useCallback(() => {
    stop();
  }, [stop]);

  return (
    <section ref={panelRef} data-panel-hash="#sweeps">
      <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Gap x Phase x Omega Sweep
        </CardTitle>
        <CardDescription>
          Parametric gain surfaces (DCE scaffold). Captures top ridge points
          for presets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Gap (nm): min</Label>
            <Input
              type="number"
              value={formatRange(ranges.gap_nm[0])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  gap_nm: [Number(event.target.value), prev.gap_nm[1]],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Gap (nm): max</Label>
            <Input
              type="number"
              value={formatRange(ranges.gap_nm[1])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  gap_nm: [prev.gap_nm[0], Number(event.target.value)],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Omega (GHz): min</Label>
            <Input
              type="number"
              value={formatRange(ranges.Omega_GHz[0])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  Omega_GHz: [Number(event.target.value), prev.Omega_GHz[1]],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Omega (GHz): max</Label>
            <Input
              type="number"
              value={formatRange(ranges.Omega_GHz[1])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  Omega_GHz: [prev.Omega_GHz[0], Number(event.target.value)],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Phase (deg): min</Label>
            <Input
              type="number"
              value={formatRange(ranges.phase_deg[0])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  phase_deg: [Number(event.target.value), prev.phase_deg[1]],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Phase (deg): max</Label>
            <Input
              type="number"
              value={formatRange(ranges.phase_deg[1])}
              onChange={(event) =>
                setRanges((prev) => ({
                  ...prev,
                  phase_deg: [prev.phase_deg[0], Number(event.target.value)],
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Depth m (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step={DEPTH_STEP}
                min={MIN_DEPTH_PCT}
                max={MAX_DEPTH_PCT}
                value={depthPct}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const clamped = clampDepth(
                    Number.isFinite(next) ? next : MIN_DEPTH_PCT
                  );
                  setDepthEdited(true);
                  setDepthPct(clamped);
                }}
              />
              <span className="text-xs tabular-nums text-slate-300">
                rho~={rhoEstimate.toFixed(3)}
                {rhoEstimate >= RHO_CUTOFF ? " !" : ""}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {`target rho<=0.4 -> depth~${formatDepth(recommendedDepthPct)}%`}
              {Math.abs(depthPct - recommendedDepthPct) > 1e-6 ? (
                <button
                  type="button"
                  className="ml-1 text-sky-400 hover:underline"
                  onClick={() => {
                    setDepthEdited(false);
                    setDepthPct(recommendedDepthPct);
                  }}
                >
                  apply
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <Label className="text-xs">Resolution (g, Omega, phi)</Label>
            <Input
              type="text"
              value={`${resolution.gap}, ${resolution.Omega}, ${resolution.phase}`}
              onChange={(event) => {
                const parsed = parseResolution(event.target.value);
                if (parsed.length === 3) {
                  setResolution({
                    gap: parsed[0],
                    Omega: parsed[1],
                    phase: parsed[2],
                  });
                }
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={onStart}>Start Sweep</Button>
          <Button variant="outline" onClick={onStop}>
            Stop
          </Button>
          <Button
            variant="secondary"
            disabled={!phiStar}
            onClick={onBiasPhiStar}
          >
            Bias to Ï†*
          </Button>
          {phiStar ? (
            <span className="text-xs text-slate-300">
              Ï†* {phiStar.phi_deg.toFixed(2)}Â° Â· Î”/Îº{" "}
              {(phiStar.deltaOverKappa ?? 0).toFixed(2)} Â· margin{" "}
              {(phiStar.subThresholdMargin ?? 0).toFixed(3)}
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Ï†* pending (needs stable ridge)
            </span>
          )}
          <div className="ml-auto text-xs text-slate-400">
            {progress
              ? `step ${progress.done} / ${progress.total}${
                  progress.eta ? ` - ETA ${progress.eta}` : ""
                }`
              : "idle"}
          </div>
        </div>

        {stats ? (
          <div className="text-[11px] text-slate-400 flex flex-wrap gap-3">
            <span>samples {stats.samples}</span>
            <span>stable {stats.stable}</span>
            <span>
              filtered {stats.filtered}
              {stats.filtered > 0
                ? ` (rho ${stats.filteredRho}, depth ${stats.filteredDepth})`
                : ""}
            </span>
            {stats.threshold > 0 ? (
              <span>threshold {stats.threshold}</span>
            ) : null}
            {stats.linewidthCollapse > 0 ? (
              <span>collapse {stats.linewidthCollapse}</span>
            ) : null}
            {stats.clipped > 0 ? <span>clipped {stats.clipped}</span> : null}
          </div>
        ) : null}

        <div className="rounded-md border border-slate-800 p-2 bg-black/40">
          <Heatmap
            width={640}
            height={280}
            tiles={tiles}
            xs={currentSlice?.xVals_gap_nm ?? []}
            ys={currentSlice?.yVals_phase_deg ?? []}
            title={
              currentSlice
                ? `Omega = ${currentSlice.Omega_GHz.toFixed(3)} GHz`
                : "Omega slice"
            }
          />
          <div className="mt-1 text-[11px] text-slate-400">
            Cells show gain (dB); blue tiles indicate amplification
            (1 - lambda0*cos(phi) &lt; 0), red indicate attenuation. Hatched
            cells were filtered by safety envelopes or instability.
          </div>
          {aggregate?.guardExit ? (
            <div className="mt-2 text-[11px] text-amber-300">
              Guard exit: {aggregate.guardExit.reason}
            </div>
          ) : null}
        </div>

        <Card className="bg-slate-950/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Ridge</CardTitle>
            <CardDescription className="text-xs">
              Best 10 stable points (click to push into presets).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <table className="w-full text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left">gap</th>
                    <th className="text-left">Omega</th>
                    <th className="text-left">phi</th>
                    <th className="text-right">gain</th>
                    <th className="text-right">Î”/Îº</th>
                    <th className="text-right">kappa_eff</th>
                    <th className="text-right">rho</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(aggregate?.topRidge ?? []).map((point, index) => (
                    <tr key={index} className="border-t border-slate-800">
                      <td>{point.sample.gap_nm.toFixed(0)} nm</td>
                      <td>{point.sample.Omega_GHz.toFixed(3)} GHz</td>
                      <td>{point.sample.phase_deg.toFixed(2)} deg</td>
                      <td className="text-right">
                        {point.gain_dB.toFixed(2)} dB
                      </td>
                      <td className="text-right">
                        {(point.deltaOverKappa ?? point.detuneNorm ?? 0).toFixed(
                          2
                        )}
                      </td>
                      <td className="text-right">
                        {fmtKappaMHz(point.kappa_eff_MHz)}
                      </td>
                      <td className="text-right">{point.rho.toFixed(2)}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (onCapturePreset) {
                              onCapturePreset(point);
                              return;
                            }
                            if (typeof setPumpPhaseDeg === "function") {
                              setPumpPhaseDeg(point.sample.phase_deg);
                            }
                          }}
                        >
                          Push
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!aggregate?.topRidge || aggregate.topRidge.length === 0) && (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500">
                        No stable points yet.
                        {ridgeEmptyNote ? (
                          <div className="mt-1 text-[11px] text-slate-400">
                            {ridgeEmptyNote}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </CardContent>
      </Card>
    </section>
  );
}


