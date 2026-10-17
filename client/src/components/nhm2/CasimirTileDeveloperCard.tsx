import { useEffect, useMemo, useState } from "react";
import { useEnergyPipeline, useUpdatePipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useCasimirTileSummary } from "@/hooks/useCasimirTileSummary";
import { Button } from "@/components/ui/button";

type Draft = {
  sectorCount: number;
  localBurstFrac: number;
  strobeHz: number;
  phase01: number;
  splitEnabled: boolean;
  splitFrac: number;
  sigmaSector: number;
  N_tiles: number;
  tileArea_cm2: number;
  gammaGeo: number;
  gammaVanDenBroeck: number;
  qSpoilingFactor: number;
};

const finite = (...values: unknown[]): number | null => {
  for (const value of values) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
};
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;

function readDraft(pipeline?: EnergyPipelineState | null): Draft {
  return {
    sectorCount: Math.max(1, Math.floor(finite(pipeline?.sectorCount, 400) ?? 400)),
    localBurstFrac: clamp01(finite((pipeline as any)?.localBurstFrac, pipeline?.dutyBurst, pipeline?.dutyCycle, 0.01) ?? 0.01),
    strobeHz: finite(pipeline?.strobeHz, 1000) ?? 1000,
    phase01: clamp01(finite(pipeline?.phase01, 0) ?? 0),
    splitEnabled: Boolean((pipeline as any)?.splitEnabled ?? false),
    splitFrac: clamp01(finite((pipeline as any)?.splitFrac, 0.6) ?? 0.6),
    sigmaSector: Math.max(1e-3, finite((pipeline as any)?.sigmaSector, 0.05) ?? 0.05),
    N_tiles: Math.max(0, Math.floor(finite(pipeline?.N_tiles, pipeline?.tiles?.N_tiles, pipeline?.tiles?.total, 0) ?? 0)),
    tileArea_cm2: finite(pipeline?.tileArea_cm2, pipeline?.tiles?.tileArea_cm2, 25) ?? 25,
    gammaGeo: finite(pipeline?.gammaGeo, (pipeline as any)?.ampFactors?.gammaGeo, (pipeline as any)?.amps?.gammaGeo, 26) ?? 26,
    gammaVanDenBroeck: finite(pipeline?.gammaVanDenBroeck, (pipeline as any)?.gammaVanDenBroeck_mass,
      (pipeline as any)?.gammaVanDenBroeck_vis, 0) ?? 0,
    qSpoilingFactor: finite(pipeline?.qSpoilingFactor, 1) ?? 1,
  };
}

function hullAreaM2(pipeline?: EnergyPipelineState | null): number | null {
  const area = finite(pipeline?.hullArea_m2, pipeline?.tiles?.hullArea_m2,
    pipeline?.hullAreaOverride_m2, (pipeline as any)?.__hullAreaEllipsoid_m2);
  if (area != null && area > 0) return area;
  const tileArea = finite(pipeline?.tileArea_cm2, pipeline?.tiles?.tileArea_cm2);
  const count = finite(pipeline?.N_tiles, pipeline?.tiles?.N_tiles, pipeline?.tiles?.total);
  return tileArea != null && tileArea > 0 && count != null && count > 0
    ? tileArea * 1e-4 * count : null;
}

const FORMAT = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? "unreported" : value.toPrecision(digits);

export default function CasimirTileDeveloperCard() {
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1500 });
  const updatePipeline = useUpdatePipeline();
  const summary = useCasimirTileSummary({ dims: [32, 32, 32], refetchMs: 5000 });
  const [draft, setDraft] = useState<Draft>(() => readDraft(pipeline));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useMemo(() => hullAreaM2(pipeline), [pipeline]);
  const initial = useMemo(() => readDraft(pipeline), [pipeline]);
  const packing = area != null && area > 0 && initial.N_tiles > 0 && initial.tileArea_cm2 > 0
    ? initial.N_tiles * initial.tileArea_cm2 * 1e-4 / area : null;

  useEffect(() => {
    if (pipeline && !dirty) setDraft(initial);
  }, [pipeline, initial, dirty]);

  const edit = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setError(null);
  };
  const editCount = (value: number) => {
    const count = Math.max(0, Math.floor(value || 0));
    setDraft((current) => ({ ...current, N_tiles: count,
      tileArea_cm2: packing != null && area != null && count > 0
        ? area * packing / count / 1e-4 : current.tileArea_cm2 }));
    setDirty(true);
    setError(null);
  };
  const editArea = (value: number) => {
    const tileArea = Math.max(0.01, positive(value, 0.01));
    setDraft((current) => ({ ...current, tileArea_cm2: tileArea,
      N_tiles: packing != null && area != null
        ? Math.max(0, Math.floor(area * packing / (tileArea * 1e-4))) : current.N_tiles }));
    setDirty(true);
    setError(null);
  };

  const apply = async () => {
    setError(null);
    try {
      await updatePipeline.mutateAsync({
        sectorCount: Math.max(1, Math.floor(draft.sectorCount)),
        localBurstFrac: clamp01(draft.localBurstFrac),
        strobeHz: Math.max(0, draft.strobeHz),
        phase01: clamp01(draft.phase01),
        sigmaSector: Math.max(1e-3, draft.sigmaSector),
        splitEnabled: draft.splitEnabled,
        splitFrac: clamp01(draft.splitFrac),
        tileArea_cm2: Math.max(0.01, draft.tileArea_cm2),
        gammaGeo: Math.max(1e-6, draft.gammaGeo),
        gammaVanDenBroeck: Math.max(0, draft.gammaVanDenBroeck),
        qSpoilingFactor: Math.max(0, draft.qSpoilingFactor),
      } as any);
      setDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pipeline update failed");
    }
  };

  return <section className="space-y-4 rounded border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
    <div>
      <h3 className="font-semibold">Casimir tile developer controls</h3>
      <p className="text-xs text-amber-200">
        Explicit live-pipeline schedule, envelope, tile-area, and amplification edits. These values are not
        bound to the selected NHM2 run and do not establish a measured negative-energy source or GR solution.
      </p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <NumberField label="Sector count" value={draft.sectorCount} min={1} step={1} onChange={(v) => edit("sectorCount", Math.max(1, Math.floor(v || 1)))} />
      <NumberField label="Local burst fraction" value={draft.localBurstFrac} min={0} max={1} step={0.0001} onChange={(v) => edit("localBurstFrac", clamp01(v || 0))} />
      <NumberField label="Strobe Hz" value={draft.strobeHz} min={0} step={1} onChange={(v) => edit("strobeHz", Math.max(0, v || 0))} />
      <NumberField label="Phase" value={draft.phase01} min={0} max={1} step={0.01} onChange={(v) => edit("phase01", clamp01(v || 0))} />
      <label className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1 text-xs">
        <input type="checkbox" checked={draft.splitEnabled} onChange={(event) => edit("splitEnabled", event.target.checked)} /> Split enabled
      </label>
      <NumberField label="Split fraction" value={draft.splitFrac} min={0} max={1} step={0.01} disabled={!draft.splitEnabled} onChange={(v) => edit("splitFrac", Number.isFinite(v) ? clamp01(v) : 0.6)} />
      <NumberField label="Sector width σ" value={draft.sigmaSector} min={0.001} step={0.001} onChange={(v) => edit("sigmaSector", Number.isFinite(v) ? Math.max(0.001, v) : 0.05)} />
      <NumberField label="N tiles (area helper)" value={draft.N_tiles} min={0} step={1} onChange={editCount} />
      <NumberField label="Tile area cm²" value={draft.tileArea_cm2} min={0.01} step={0.1} onChange={editArea} />
      <NumberField label="Geometry factor" value={draft.gammaGeo} min={1} step={1} onChange={(v) => edit("gammaGeo", Number.isFinite(v) ? Math.max(1, v) : 26)} />
      <NumberField label="VdB factor" value={draft.gammaVanDenBroeck} min={0} step={1} onChange={(v) => edit("gammaVanDenBroeck", Math.max(0, v || 0))} />
      <NumberField label="Q spoiling" value={draft.qSpoilingFactor} min={0} step={0.01} onChange={(v) => edit("qSpoilingFactor", Number.isFinite(v) ? Math.max(0, v) : 1)} />
    </div>
    <p className="text-xs text-slate-400">
      N tiles is a local packing helper: changing it adjusts tile area at the current packing fraction;
      the Apply action sends tile area, not a tile-count mutation. Hull area: {FORMAT(area)} m².
    </p>
    <div className="flex gap-2">
      <Button size="sm" onClick={() => void apply()} disabled={updatePipeline.isPending}>Apply to live pipeline</Button>
      <Button size="sm" variant="outline" disabled={!dirty} onClick={() => { setDraft(initial); setDirty(false); setError(null); }}>Reset</Button>
    </div>
    {error && <p className="text-xs text-amber-200">Update failed: {error}</p>}
    <div className="rounded border border-slate-800 p-2 text-xs text-slate-300">
      <div className="font-semibold">Live tile summary</div>
      {summary.isFetching && !summary.data && <div>Loading…</div>}
      {summary.error instanceof Error && <div className="text-amber-200">{summary.error.message}</div>}
      {summary.data && <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <span>Effective FR duty: {FORMAT(summary.data.summary.dutyEffectiveFR, 6)}</span>
        <span>Mean ρ: {FORMAT(summary.data.summary.rho_avg)}</span>
        <span>T00 range: {FORMAT(summary.data.summary.T00_min)} to {FORMAT(summary.data.summary.T00_max)}</span>
        <span>Flux: {Array.isArray(summary.data.summary.netFlux)
          ? summary.data.summary.netFlux.map((v) => FORMAT(v)).join(", ") : "unreported"}</span>
        <span>Divergence RMS: {FORMAT(summary.data.summary.divRms)}</span>
        <span>Strobe phase: {FORMAT(summary.data.summary.strobePhase)}</span>
        <span>Source: {summary.data.source.proxy ? "proxy" : "pipeline"}</span>
      </div>}
    </div>
    <div className="rounded border border-slate-800 p-2 text-xs text-slate-300">
      <div className="font-semibold">Reported sector schedule</div>
      <p className="text-slate-400">Live pipeline telemetry only; no selected-run NHM2 binding or measured source claim.</p>
      {pipeline?.phaseSchedule ? <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <span>Reported sectors: {FORMAT(pipeline.phaseSchedule.N, 5)}</span>
        <span>Sector period: {FORMAT(pipeline.phaseSchedule.sectorPeriod_ms)} ms</span>
        <span>Phase: {FORMAT(pipeline.phaseSchedule.phase01)}</span>
        <span>Sampler: {pipeline.phaseSchedule.sampler ?? "unreported"}</span>
        <span>Sampler width: {FORMAT(pipeline.phaseSchedule.tau_s_ms)} ms</span>
        <span>Negative roles: {pipeline.phaseSchedule.negSectors?.length ?? "unreported"}</span>
        <span>Positive roles: {pipeline.phaseSchedule.posSectors?.length ?? "unreported"}</span>
        <span>Server weights: {Array.isArray(pipeline.phaseSchedule.weights)
          ? `${pipeline.phaseSchedule.weights.length} reported` : "unreported"}</span>
      </div> : <p className="mt-1 text-slate-400">No phase schedule reported.</p>}
    </div>
    <div className="rounded border border-slate-800 p-2 text-xs text-slate-300">
      <div className="font-semibold">Reported gate-routing totals</div>
      <p className="text-slate-400">Live pipeline accounting only. These totals are not measured curvature, a QEI result, or selected-run NHM2 evidence.</p>
      {pipeline?.gateAnalytics ? <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <span>Bus: {FORMAT(pipeline.gateAnalytics.busJoules)} J</span>
        <span>Sink: {FORMAT(pipeline.gateAnalytics.sinkJoules)} J</span>
        <span>Reversible fraction: {FORMAT(pipeline.gateAnalytics.reversibleFraction)}</span>
        <span>Event rows: {pipeline.gateAnalytics.ledger.length}</span>
      </div> : <p className="mt-1 text-slate-400">No gate analytics reported.</p>}
    </div>
  </section>;
}

function NumberField({ label, value, onChange, min, max, step, disabled }: {
  label: string; value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  return <label className="flex items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1 text-xs">
    <span>{label}</span>
    <input className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
      type="number" value={value} min={min} max={max} step={step} disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}
