import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Loader2, Zap, Waves } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useStressEnergyBrick } from "@/hooks/useStressEnergyBrick";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import type { StressEnergyBrickDecoded } from "@/lib/stress-energy-brick";
import HardwareConnectButton from "@/components/HardwareConnectButton";
import { useHardwareFeeds, type HardwareConnectHelp } from "@/hooks/useHardwareFeeds";
import { DEFAULT_T00_CHANNEL, DEFAULT_FLUX_CHANNEL } from "@/components/CurvatureVoxProvider";
import { buildCongruenceBadge, resolveCongruenceMeta } from "@/lib/congruence-meta";
import type { CurvatureQuality } from "@/lib/curvature-brick";

const EPS = 1e-9;

const arraysEqual = (a?: [number, number, number], b?: [number, number, number]) =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const vecMagnitude = (v?: [number, number, number]) =>
  v ? Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) : null;

const ENERGY_FLUX_HELP: HardwareConnectHelp = {
  instruments: ["Flux probe array", "Casimir gap sensors", "DAQ / LabBridge"],
  feeds: [
    "GET /api/helix/stress-energy-brick (t00, S, div S) - stress-energy volume feed",
    "Bus overlays: hull3d:t00-volume, hull3d:flux (publish Float32 textures directly to renderer)",
  ],
  notes: [
    "Panel now renders slices from the server-built stress-energy brick. Lab tools can push overrides over the same endpoint.",
    "When hardware feed is live, badges flip to 'Live' and overlays use your instrument or simulation data.",
  ],
  fileTypes: [".json"],
};

type StressBusBase = {
  dims: [number, number, number];
  stats?: StressEnergyBrickDecoded["stats"];
  meta?: StressEnergyBrickDecoded["meta"];
};

type StressBusT00Payload = StressBusBase & {
  t00: StressEnergyBrickDecoded["t00"];
};

type StressBusFluxPayload = StressBusBase & {
  flux: StressEnergyBrickDecoded["flux"];
};

type SliceStats = {
  dims: { nx: number; ny: number };
  density: { data: Float32Array; min: number; max: number };
  divergence: { data: Float32Array; min: number; max: number };
};

type ProbeCell = { x: number; y: number };

export default function EnergyFluxPanel() {
  const { data: pipeline } = useEnergyPipeline();
  const [brickQuality, setBrickQuality] = useState<CurvatureQuality>("low");
  const stressQuery = useStressEnergyBrick({
    quality: brickQuality,
    refetchMs: brickQuality === "low" ? 1500 : 2400,
  });
  const { isLoading, isFetching, error: brickError } = stressQuery;
  const hardwareController = useHardwareFeeds({
    panelId: "energy-flux",
    panelTitle: "Stress Brick Spatial Diagnostic",
    help: ENERGY_FLUX_HELP,
  });
  const [busT00, setBusT00] = useState<StressBusT00Payload | null>(null);
  const [busFlux, setBusFlux] = useState<StressBusFluxPayload | null>(null);
  const lastMirrorStampRef = useRef<number>(0);
  useEffect(() => {
    const id = subscribe(DEFAULT_T00_CHANNEL, (payload: any) => {
      if (!payload || typeof payload !== "object") return;
      if (!payload.dims || !payload.t00) return;
      setBusT00(payload as StressBusT00Payload);
    });
    return () => {
      unsubscribe(id);
    };
  }, []);

  useEffect(() => {
    const id = subscribe(DEFAULT_FLUX_CHANNEL, (payload: any) => {
      if (!payload || typeof payload !== "object") return;
      if (!payload.dims || !payload.flux) return;
      setBusFlux(payload as StressBusFluxPayload);
    });
    return () => {
      unsubscribe(id);
    };
  }, []);

  const busSample = useMemo<StressEnergyBrickDecoded | null>(() => {
    if (!busT00 || !busFlux) return null;
    if (busT00.dims[0] !== busFlux.dims[0] || busT00.dims[1] !== busFlux.dims[1] || busT00.dims[2] !== busFlux.dims[2]) {
      return null;
    }
    const stats = busFlux.stats ?? busT00.stats ?? stressQuery.data?.stats;
    if (!stats) return null;
    return {
      dims: busT00.dims,
      t00: busT00.t00,
      flux: busFlux.flux,
      stats,
      meta: busFlux.meta ?? busT00.meta ?? stressQuery.data?.meta,
    };
  }, [busT00, busFlux, stressQuery.data]);

  const activeSample = busSample ?? stressQuery.data ?? null;
  const feedSource = busSample
    ? "bus"
    : stressQuery.data
      ? "query"
      : null;
  const stressMeta = resolveCongruenceMeta(
    activeSample?.meta,
    pipeline?.stressMeta,
  );
  const stressMetaSource = stressMeta.source ?? "unknown";
  const stressMetaCongruence = stressMeta.congruence ?? "unknown";
  const { proxy: stressMetaProxy } = buildCongruenceBadge(stressMeta);
  const slice = useMemo(() => computeSlice(activeSample), [activeSample]);
  const [probeCell, setProbeCell] = useState<ProbeCell | null>(null);
  const [showFluxDirections, setShowFluxDirections] = useState(false);
  const pointProbe = useMemo(() => {
    if (!activeSample || !probeCell) return null;
    const [nx, ny, nz] = activeSample.dims;
    const { x, y } = probeCell;
    if (x < 0 || x >= nx || y < 0 || y >= ny || nz < 1) return null;
    const z = Math.floor(nz / 2);
    const index = z * nx * ny + y * nx + x;
    const t00 = activeSample.t00.data[index];
    const divS = activeSample.flux.divS.data[index];
    const sx = activeSample.flux.Sx.data[index];
    const sy = activeSample.flux.Sy.data[index];
    if (![t00, divS, sx, sy].every(Number.isFinite)) return null;
    return { x, y, z, t00, divS, fluxXY: Math.hypot(sx, sy) };
  }, [activeSample, probeCell]);

  const densityMagnitude = activeSample?.stats?.avgT00 ?? null;
  const fluxProxy = activeSample?.stats?.avgFluxMagnitude ?? null;
  const tsRatio = pipeline?.TS_ratio ?? null;
  const mode = pipeline?.currentMode ?? "unknown";
  const duty = pipeline?.dutyEffectiveFR ?? pipeline?.dutyCycle ?? 0;

  const mirrorApiToBus = useCallback((sample: StressEnergyBrickDecoded) => {
    const payloadBase = {
      dims: sample.dims,
      stats: sample.stats,
    };
    publish(DEFAULT_T00_CHANNEL, { ...payloadBase, t00: sample.t00 });
    publish(DEFAULT_FLUX_CHANNEL, { ...payloadBase, flux: sample.flux });
  }, []);

  useEffect(() => {
    if (!stressQuery.data) return;
    const updatedAt = stressQuery.dataUpdatedAt;
    if (typeof updatedAt !== "number") return;
    if (updatedAt <= lastMirrorStampRef.current) return;
    lastMirrorStampRef.current = updatedAt;
    mirrorApiToBus(stressQuery.data);
  }, [stressQuery.data, stressQuery.dataUpdatedAt, mirrorApiToBus]);

  const overlaySync = useMemo(() => {
    const apiSample = stressQuery.data ?? null;
    if (!busSample && !apiSample) {
      return null;
    }
    if (!busSample || !apiSample) {
      return {
        mode: "missing" as const,
        busAvailable: !!busSample,
        apiAvailable: !!apiSample,
      };
    }
    const dimsMatch = arraysEqual(busSample.dims, apiSample.dims);
    const busFluxAvg = busSample.stats.avgFluxMagnitude;
    const apiFluxAvg = apiSample.stats.avgFluxMagnitude;
    const fluxDeltaPct =
      Number.isFinite(busFluxAvg) && Number.isFinite(apiFluxAvg) && apiFluxAvg
        ? Math.abs(busFluxAvg - apiFluxAvg) / Math.max(Math.abs(apiFluxAvg), EPS)
        : null;
    const busNetMag = vecMagnitude(busSample.stats.netFlux);
    const apiNetMag = vecMagnitude(apiSample.stats.netFlux);
    const netDelta =
      Number.isFinite(busNetMag) && Number.isFinite(apiNetMag)
        ? Math.abs((busNetMag ?? 0) - (apiNetMag ?? 0))
        : null;
    const strobeDelta = Math.abs((busSample.stats.strobePhase ?? 0) - (apiSample.stats.strobePhase ?? 0));
    const healthy =
      dimsMatch &&
      (fluxDeltaPct == null || fluxDeltaPct < 0.05) &&
      (netDelta == null || netDelta <= Math.max(apiNetMag ? apiNetMag * 0.05 : 0, 1e-3)) &&
      strobeDelta < 0.05;
    return {
      mode: "compare" as const,
      dimsMatch,
      fluxDeltaPct,
      netDelta,
      strobeDelta,
      healthy,
    };
  }, [busSample, stressQuery.data]);

  return (
    <Card className="h-full border-slate-800 bg-slate-950/70 text-slate-100">
      <CardHeader className="space-y-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-cyan-300" />
              <span className="flex items-center gap-2">
                Stress Brick Spatial Diagnostic
              </span>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Equatorial |T00| and div S slices from the current stress-energy brick. These live
              feed fields are spatial diagnostics, not a complete source tensor or selected-run NHM2 proof.
            </CardDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="font-mono">stress.source={stressMetaSource}</span>
              <span className="font-mono">stress.congruence={stressMetaCongruence}</span>
              {stressMetaProxy && (
                <Badge variant="outline" className="border-amber-400/60 text-amber-200">
                  PROXY
                </Badge>
              )}
            </div>
          </div>
          <HardwareConnectButton
            controller={hardwareController}
            buttonClassName="pointer-events-auto bg-emerald-500/20 text-emerald-100 border border-emerald-400/50 hover:bg-emerald-500/30"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile
            icon={<Zap className="h-4 w-4 text-amber-400" />}
            label="|T00| (avg)"
            value={formatScientific(densityMagnitude)}
            hint="Feed-reported average |T00|; check the source and proxy flags."
          />
          <MetricTile
            icon={<Waves className="h-4 w-4 text-sky-400" />}
            label="Avg |S| (feed)"
            value={formatScientific(fluxProxy)}
            hint="Feed-reported average flux magnitude; units and source identity need separate checks."
          />
          <MetricTile
            icon={<Activity className="h-4 w-4 text-emerald-400" />}
            label="TS ratio"
            value={tsRatio ? tsRatio.toFixed(2) : "-"}
            hint="Live pipeline timing proxy; not selected-run NHM2 proof."
          />
        </section>

        {activeSample?.stats && (
          <section className="rounded-xl border border-white/5 bg-slate-900/70 p-4 text-xs text-slate-300">
            <div className="font-semibold text-slate-100">Reported brick aggregates</div>
            <p className="mt-1 text-slate-400">Raw feed values with no local pass threshold or conservation verdict.</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <div><dt>Avg |S|</dt><dd>{formatScientific(activeSample.stats.avgFluxMagnitude)}</dd></div>
              <div><dt>|net flux|</dt><dd>{formatScientific(activeSample.stats.conservation?.netFluxMagnitude ?? vecMagnitude(activeSample.stats.netFlux))}</dd></div>
              <div><dt>max |div S|</dt><dd>{formatScientific(activeSample.stats.conservation?.divMaxAbs ?? Math.max(Math.abs(activeSample.stats.divMin ?? 0), Math.abs(activeSample.stats.divMax ?? 0)))}</dd></div>
            </dl>
          </section>
        )}

        {overlaySync && (
          <section className="rounded-xl border border-white/5 bg-slate-950/60 p-4 text-sm text-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Overlay sync</div>
                {overlaySync.mode === "compare" ? (
                  <div className={`text-sm font-semibold ${overlaySync.healthy ? "text-emerald-300" : "text-amber-300"}`}>
                    {overlaySync.healthy ? "Bus matches current API sample" : "Bus payload differs from API sample"}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-amber-300">
                    {overlaySync.busAvailable
                      ? "Awaiting API stress brick sample"
                      : "No bus overlay detected"}
                  </div>
                )}
              </div>
              {overlaySync.mode === "compare" ? (
                <Badge
                  variant="outline"
                  className={
                    overlaySync.healthy
                      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/60 bg-amber-400/10 text-amber-200"
                  }
                >
                  {overlaySync.dimsMatch ? "Dims aligned" : "Dims mismatch"}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-400/50 bg-amber-400/10 text-amber-200">
                  {overlaySync.busAvailable ? "Bus active" : "Bus idle"}
                </Badge>
              )}
            </div>
            <p className="mb-2 text-xs text-slate-400">
              The API sample is mirrored to the bus while this view is mounted. A match is display synchronization,
              not independent source verification.
            </p>
            {overlaySync.mode === "compare" ? (
              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Flux drift</dt>
                  <dd className={overlaySync.fluxDeltaPct != null && overlaySync.fluxDeltaPct > 0.05 ? "text-amber-200" : ""}>
                    {overlaySync.fluxDeltaPct == null ? "n/a" : `${(overlaySync.fluxDeltaPct * 100).toFixed(2)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">|Δ net flux|</dt>
                  <dd className={overlaySync.netDelta != null && overlaySync.netDelta > 1e-3 ? "text-amber-200" : ""}>
                    {overlaySync.netDelta == null ? "n/a" : formatScientific(overlaySync.netDelta)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Δ strobe phase</dt>
                  <dd className={overlaySync.strobeDelta > 0.05 ? "text-amber-200" : ""}>
                    {overlaySync.strobeDelta.toFixed(3)}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="space-y-2 text-xs text-slate-400">
                <p>
                  {overlaySync.busAvailable
                    ? "Waiting for /api/helix/stress-energy-brick to return; sync metrics will populate automatically."
                    : "Feed the hull3d:t00-volume + hull3d:flux bus to compare overlays with the API stress brick."}
                </p>
                {!overlaySync.busAvailable && stressQuery.data && (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-200"
                    onClick={() => mirrorApiToBus(stressQuery.data!)}
                  >
                    Mirror latest API brick to bus
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-xs">
          <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
            Mode: {mode}
          </Badge>
          <Badge variant="outline" className="border-slate-400/40 bg-slate-400/10 text-slate-100">
            Duty: {(duty * 100).toFixed(3)}%
          </Badge>
          <Badge
            variant="outline"
            className={
              hardwareController.isLive
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                : "border-slate-500/40 bg-slate-500/10 text-slate-200"
            }
          >
            {hardwareController.isLive ? "Live hardware feed" : "Simulated stress-energy feed"}
          </Badge>
          {feedSource && (
            <Badge
              variant="outline"
              className={
                feedSource === "bus"
                  ? "border-sky-400/60 bg-sky-400/10 text-sky-100"
                  : "border-slate-400/50 bg-slate-400/15 text-slate-100"
              }
            >
              Stress-energy source: {feedSource === "bus" ? "Hull3D bus" : "local query"}
            </Badge>
          )}
          {brickError && (
            <span className="text-rose-300">
              Slice unavailable: {brickError instanceof Error ? brickError.message : String(brickError)}
            </span>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <label className="flex items-center gap-2">
            API brick quality
            <select className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
              value={brickQuality} onChange={(event) => setBrickQuality(event.target.value as CurvatureQuality)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          {feedSource === "bus" && <span className="text-amber-200">Bus channels take display precedence.</span>}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showFluxDirections}
              onChange={(event) => setShowFluxDirections(event.target.checked)} />
            Show XY flux directions on the div S slice (equal-length visual arrows)
          </label>
        </div>
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SliceCanvas
            label="Equatorial |T00| slice"
            subtitle="Heat compresses automatically"
            payload={slice?.density}
            dims={slice?.dims}
            palette="heat"
            loading={!slice && (isLoading || isFetching)}
            selected={pointProbe}
            onProbe={(x, y) => setProbeCell({ x, y })}
          />
          <SliceCanvas
            label="Proxy div S slice"
            subtitle="Blue = inflow, Red = outflow"
            payload={slice?.divergence}
            dims={slice?.dims}
            palette="diverge"
            loading={!slice && (isLoading || isFetching)}
            selected={pointProbe}
            onProbe={(x, y) => setProbeCell({ x, y })}
            fluxDirections={showFluxDirections ? activeSample : null}
          />
        </section>

        <section className="rounded-xl border border-white/5 bg-slate-900/60 p-4 text-xs text-slate-300">
          <div className="font-semibold text-slate-100">Equatorial brick point probe</div>
          <p className="mt-1 text-slate-400">
            Select a cell in either slice. Values come from the current {feedSource === "bus"
              ? "Hull3D bus channels (shape matched, not run matched)" : "API brick"} in feed units;
            they are not a complete tensor or an authenticated selected-run NHM2 receipt.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <span>Cell: {pointProbe ? `${pointProbe.x}, ${pointProbe.y}, ${pointProbe.z}` : "none selected"}</span>
            <span>T00: {formatScientific(pointProbe?.t00)}</span>
            <span>div S proxy: {formatScientific(pointProbe?.divS)}</span>
            <span>|Sx,Sy|: {formatScientific(pointProbe?.fluxXY)}</span>
          </div>
        </section>

      </CardContent>
    </Card>
  );
}

function logMagnitude(value: number) {
  return Math.log10(EPS + Math.abs(value));
}

function signedLogMagnitude(value: number) {
  if (value === 0) return 0;
  const magnitude = logMagnitude(value);
  return Math.sign(value) * magnitude;
}

function computeSlice(sample?: StressEnergyBrickDecoded | null): SliceStats | null {
  if (!sample?.t00?.data?.length) return null;
  const [nx, ny, nz] = sample.dims;
  if (!nx || !ny || !nz) return null;
  const sliceK = Math.floor(nz / 2);
  const planeSize = nx * ny;
  const baseOffset = sliceK * ny * nx;
  const densityData = new Float32Array(planeSize);
  const divergenceData = new Float32Array(planeSize);

  let densityMin = Number.POSITIVE_INFINITY;
  let densityMax = Number.NEGATIVE_INFINITY;
  let divMin = Number.POSITIVE_INFINITY;
  let divMax = Number.NEGATIVE_INFINITY;

  const sampleValue = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(nx - 1, x));
    const clampedY = Math.max(0, Math.min(ny - 1, y));
    const idx = baseOffset + clampedY * nx + clampedX;
    return sample.t00.data[idx] ?? 0;
  };

  const divergenceValue = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(nx - 1, x));
    const clampedY = Math.max(0, Math.min(ny - 1, y));
    const idx = baseOffset + clampedY * nx + clampedX;
    return sample.flux.divS.data[idx] ?? 0;
  };

  let idx2d = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const value = sampleValue(x, y);
      const absValue = Math.abs(value);
      const logDensity = logMagnitude(absValue);
      densityData[idx2d] = logDensity;
      densityMin = Math.min(densityMin, logDensity);
      densityMax = Math.max(densityMax, logDensity);

      const divergence = divergenceValue(x, y);
      const logDivergence = signedLogMagnitude(divergence);
      divergenceData[idx2d] = logDivergence;
      divMin = Math.min(divMin, logDivergence);
      divMax = Math.max(divMax, logDivergence);

      idx2d += 1;
    }
  }

  if (!Number.isFinite(densityMin)) densityMin = 0;
  if (!Number.isFinite(densityMax)) densityMax = 0;
  if (!Number.isFinite(divMin)) divMin = 0;
  if (!Number.isFinite(divMax)) divMax = 0;

  return {
    dims: { nx, ny },
    density: { data: densityData, min: densityMin, max: densityMax },
    divergence: { data: divergenceData, min: divMin, max: divMax },
  };
}

type MetricTileProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
};

function MetricTile({ icon, label, value, hint }: MetricTileProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

type SliceCanvasProps = {
  label: string;
  subtitle: string;
  payload?: { data: Float32Array; min: number; max: number } | null;
  dims?: { nx: number; ny: number };
  palette: "heat" | "diverge";
  loading?: boolean;
  selected?: ProbeCell | null;
  onProbe?: (x: number, y: number) => void;
  fluxDirections?: StressEnergyBrickDecoded | null;
};

function SliceCanvas({ label, subtitle, payload, dims, palette, loading, selected, onProbe, fluxDirections }: SliceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const width = dims?.nx ?? 128;
  const height = dims?.ny ?? 128;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !payload?.data?.length || !dims) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    const [min, max] = [payload.min, payload.max];
    const span = Math.max(EPS, max - min);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx2d = y * width + x;
        const raw = payload.data[idx2d] ?? 0;
        const norm = Math.max(0, Math.min(1, (raw - min) / span));
        const [r, g, b] = palette === "heat" ? heatPalette(norm) : divergePalette(norm);
        const px = idx2d * 4;
        image.data[px] = r;
        image.data[px + 1] = g;
        image.data[px + 2] = b;
        image.data[px + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (fluxDirections && fluxDirections.dims[0] === width && fluxDirections.dims[1] === height) {
      const z = Math.floor(fluxDirections.dims[2] / 2);
      const stepX = Math.max(4, Math.floor(width / 20));
      const stepY = Math.max(4, Math.floor(height / 20));
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 0.8;
      for (let y = Math.floor(stepY / 2); y < height; y += stepY) {
        for (let x = Math.floor(stepX / 2); x < width; x += stepX) {
          const index = z * width * height + y * width + x;
          const sx = fluxDirections.flux.Sx.data[index];
          const sy = fluxDirections.flux.Sy.data[index];
          const length = Math.hypot(sx, sy);
          if (!Number.isFinite(length) || length <= 0) continue;
          const dx = sx / length;
          const dy = -sy / length;
          const tipX = x + dx * 5;
          const tipY = y + dy * 5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(tipX, tipY);
          ctx.moveTo(tipX - dx * 2 - dy * 1.5, tipY - dy * 2 + dx * 1.5);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(tipX - dx * 2 + dy * 1.5, tipY - dy * 2 - dx * 1.5);
          ctx.stroke();
        }
      }
    }
  }, [payload, dims, palette, width, height, fluxDirections]);

  const selectCell = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !dims || !onProbe) return;
    if (event.detail === 0) {
      onProbe(Math.floor(dims.nx / 2), Math.floor(dims.ny / 2));
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.max(0, Math.min(dims.nx - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * dims.nx)));
    const y = Math.max(0, Math.min(dims.ny - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * dims.ny)));
    onProbe(x, y);
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span>{subtitle}</span>
      </div>
      <div className="mb-2 flex items-center justify-end gap-2 text-xs text-slate-400">
        <button type="button" aria-label={`Zoom out ${label}`} disabled={zoom <= 1}
          className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40" onClick={() => setZoom((value) => Math.max(1, value / 2))}>−</button>
        <span>{zoom}×</span>
        <button type="button" aria-label={`Zoom in ${label}`} disabled={zoom >= 4}
          className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40" onClick={() => setZoom((value) => Math.min(4, value * 2))}>+</button>
      </div>
      <div className="relative h-64 overflow-auto rounded-lg border border-white/10 bg-slate-950">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <canvas ref={canvasRef} className="block h-auto w-full cursor-crosshair"
            role="button" tabIndex={0} aria-label={`Sample ${label}`}
            onClick={selectCell}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && dims && onProbe) {
                event.preventDefault();
                onProbe(Math.floor(dims.nx / 2), Math.floor(dims.ny / 2));
              }
            }} />
          {selected && dims && (
            <div className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-cyan-400/70"
              style={{ left: `${((selected.x + 0.5) / dims.nx) * 100}%`, top: `${((selected.y + 0.5) / dims.ny) * 100}%` }} />
          )}
        </div>
        {loading && (
          <div className="absolute inset-0 grid place-items-center rounded-lg bg-slate-950/70">
            <Loader2 className="h-6 w-6 animate-spin text-slate-200" />
          </div>
        )}
      </div>
    </div>
  );
}

function formatScientific(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e3 || abs <= 1e-2) {
    return value.toExponential(2);
  }
  return value.toFixed(2);
}

function heatPalette(t: number): [number, number, number] {
  const clamp = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * clamp);
  const g = Math.round(255 * Math.pow(clamp, 0.5));
  const b = Math.round(255 * Math.pow(clamp, 0.2) * 0.2);
  return [r, g, b];
}

function divergePalette(t: number): [number, number, number] {
  const clamp = Math.max(0, Math.min(1, t));
  const cold: [number, number, number] = [33, 82, 214];
  const mid: [number, number, number] = [250, 250, 250];
  const hot: [number, number, number] = [255, 92, 52];
  if (clamp < 0.5) {
    const u = clamp / 0.5;
    return [
      Math.round(cold[0] * (1 - u) + mid[0] * u),
      Math.round(cold[1] * (1 - u) + mid[1] * u),
      Math.round(cold[2] * (1 - u) + mid[2] * u),
    ];
  }
  const u = (clamp - 0.5) / 0.5;
  return [
    Math.round(mid[0] * (1 - u) + hot[0] * u),
    Math.round(mid[1] * (1 - u) + hot[1] * u),
    Math.round(mid[2] * (1 - u) + hot[2] * u),
  ];
}
