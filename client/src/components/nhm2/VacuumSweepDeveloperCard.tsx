import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useHardwareFeeds, type HardwareConnectHelp } from "@/hooks/useHardwareFeeds";
import HardwareConnectButton from "@/components/HardwareConnectButton";
import PipelineCongruenceBadge from "@/components/common/PipelineCongruenceBadge";
import ReversibilityBadge from "@/components/ReversibilityBadge";
import { getSweepGuardReasons } from "@/lib/sweep-guards";
import { sweepTelemetry, type SweepSnapshot } from "@/lib/sweepTelemetry";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { downloadCSV } from "@/utils/csv";
import type { DynamicConfig, RidgePreset, SweepPoint, VacuumGapSweepRow } from "@shared/schema";

const SWEEP_PROFILE = JSON.stringify({
  profileId: "demo-vacuum-sweep",
  description: "Example bench pump and piezo gap stream",
  timebase: { source: "ptp", confidence: 0.9 },
  streams: [{
    topic: "hardware/vacuum-gap-sweep",
    ingest: {
      type: "scpi", endpoint: "tcp://10.42.0.20:5025", pollMs: 500,
      commands: [{ send: "READ:SWEEP:POINT?", field: "raw" }],
    },
    transform: { flatten: {
      "raw.d_nm": "d_nm", "raw.m": "m", "raw.Omega_GHz": "Omega_GHz",
      "raw.phi_deg": "phi_deg", "raw.kappa_Hz": "kappa_Hz",
      "raw.kappaEff_Hz": "kappaEff_Hz", "raw.detune_Hz": "detune_Hz",
      "raw.pumpRatio": "pumpRatio", "raw.gain_dB": "G", "raw.QL": "QL",
      "raw.noise_temp_K": "noiseTemp_K", "raw.plateau": "plateau",
    } },
    normalize: { pre: "normalizeSweepRowUnitsAndKeys", endpoint: "/api/helix/hardware/sweep-point" },
  }],
}, null, 2);

const SWEEP_HELP: HardwareConnectHelp = {
  instruments: ["Pump synthesizer", "Piezo/electrostatic gap actuator", "Cryo displacement sensor"],
  feeds: ["POST /api/helix/hardware/sweep-point (flat VacuumGapSweepRow)", "Server guard before append"],
  notes: ["Incoming rows need phi_deg, kappa_MHz, detune_MHz, pumpRatio, noiseTemp_K, and plateau.width_deg."],
  fileTypes: [".csv (one point per row)", ".json (row per object)"],
  profiles: [{ name: "Bench Sweep (SCPI)", description: "Example pump and piezo LabBridge profile", json: SWEEP_PROFILE }],
};

type Row = SweepPoint | VacuumGapSweepRow;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};
const number = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const shown = (value: number | null, digits = 3): string => value == null ? "unreported" : value.toFixed(digits);

function mergeRow(primary: Row | null, fallback: Row | null): Row | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const merged = { ...record(fallback) };
  for (const [key, value] of Object.entries(record(primary))) {
    if (value != null) merged[key] = value;
  }
  return merged as unknown as Row;
}

export default function VacuumSweepDeveloperCard({ readOnly = false }: { readOnly?: boolean }) {
  const { data: pipeline, sweepResults, sweepResultsTotal, sweepResultsDropped, sweepResultsLimit, refetch, publishSweepControls } =
    useEnergyPipeline({ refetchInterval: 2500 });
  const driveSync = useDriveSyncStore();
  const sweep = record(record(pipeline).sweep);
  const top = Array.isArray(sweep.top) ? sweep.top as SweepPoint[] : [];
  const history = Array.isArray(sweepResults) ? sweepResults as VacuumGapSweepRow[] : [];
  const last = sweep.last && typeof sweep.last === "object" ? sweep.last as SweepPoint : null;
  const row = mergeRow(history.length ? history[history.length - 1] : null, mergeRow(last, top[0] ?? null));
  const fields = record(row);
  const guard = getSweepGuardReasons(row);
  const active = sweep.active === true;
  const cancelRequested = sweep.cancelRequested === true;
  const totalRows = typeof sweepResultsTotal === "number" ? sweepResultsTotal : history.length;
  const droppedRows = typeof sweepResultsDropped === "number"
    ? Math.max(0, sweepResultsDropped) : Math.max(0, totalRows - history.length);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [topN, setTopN] = useState(8);
  const hardware = useHardwareFeeds({
    panelId: "vacuum-gap-sweep",
    panelTitle: "Vacuum-gap sweep feed",
    help: SWEEP_HELP,
    fileIngest: { endpoint: "/api/helix/hardware/sweep-point", kind: "vacuum-sweep" },
  });

  const snapshot = useMemo<SweepSnapshot | null>(() => {
    if (!row || Object.keys(sweep).length === 0) return null;
    const data = record(row);
    const status = typeof data.status === "string" ? data.status
      : typeof data.stable === "boolean" ? data.stable ? "PASS" : "WARN"
        : typeof sweep.status === "string" ? sweep.status : null;
    const iter = number(sweep.iter);
    const total = number(sweep.total);
    const kappaEff = number(data.kappaEff_MHz);
    return {
      iter, total, pct: iter != null && total != null && total > 0 ? Math.max(0, Math.min(100, iter / total * 100)) : null,
      d_nm: number(data.d_nm), m: number(data.m), phi_deg: number(data.phi_deg),
      Omega_GHz: number(data.Omega_GHz), detune_MHz: number(data.detune_MHz),
      kappa_MHz: number(data.kappa_MHz),
      kappaEff_MHz: kappaEff != null ? kappaEff : status === "UNSTABLE" ? "THRESHOLD" : null,
      pumpRatio: number(data.pumpRatio), G_dB: number(data.G), QL: number(data.QL),
      status, guard: getSweepGuardReasons(row).join("; ") || null,
      etaMs: number(sweep.etaMs), slewDelayMs: number(sweep.slewDelayMs),
      bestIdx: null, guardCap: typeof sweep.guardCap === "boolean" ? sweep.guardCap : null,
    };
  }, [row, sweep]);
  useEffect(() => {
    sweepTelemetry.set(snapshot);
    return () => sweepTelemetry.set(null);
  }, [snapshot]);

  const cancel = async () => {
    setActionError(null);
    try {
      await apiRequest("POST", "/api/helix/pipeline/cancel-sweep", {});
      await refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const start = async () => {
    setActionError(null);
    setActionNote(null);
    setStarting(true);
    try {
      await publishSweepControls({ sweep: { activeSlew: true, twoPhase: true } } as Partial<DynamicConfig>);
      await refetch();
      setActionNote("Sweep request attempted. Check the reported job state for server acceptance.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };
  const captureRidge = () => {
    if (!history.length) return;
    const bestByGap = new Map<number, VacuumGapSweepRow>();
    for (const candidate of history) {
      const previous = bestByGap.get(candidate.d_nm);
      if (!previous || candidate.G > previous.G) bestByGap.set(candidate.d_nm, candidate);
    }
    const perGap = [...bestByGap.values()].sort((a, b) => a.d_nm - b.d_nm);
    const fallback = [...history].sort((a, b) => b.G - a.G);
    const chosen = (perGap.length ? perGap : fallback).slice(0, topN);
    const presets: RidgePreset[] = chosen.map((candidate) => ({
      d_nm: candidate.d_nm,
      Omega_GHz: candidate.Omega_GHz,
      phi_deg: candidate.phi_deg,
      m_pct: candidate.m * 100,
      note: `G=${candidate.G.toFixed(2)} dB, QL=${Number.isFinite(candidate.QL) ? candidate.QL!.toExponential(2) : "—"}`,
    }));
    driveSync.setRidgePresets(presets);
    setActionNote(`${presets.length} ridge presets staged from the visible sweep rows.`);
  };
  const exportRows = () => {
    if (!history.length) return;
    downloadCSV(history);
    setActionNote(`Exported ${history.length} visible sweep rows; ${droppedRows} earlier rows were outside the retained window.`);
  };
  const copyTop = async () => {
    setActionError(null);
    try {
      await navigator.clipboard.writeText(JSON.stringify(top, null, 2));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="space-y-3 rounded border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-100">
      <h3 className="text-sm font-semibold">Vacuum-gap sweep operations</h3>
      <p className="text-amber-200">
        Developer hardware ingest and cancellation. A sweep row, guard label, or local telemetry snapshot is not
        an authenticated selected-run NHM2 source or physical-viability receipt.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <HardwareConnectButton controller={hardware} />
        {active ? (
          <button type="button" onClick={cancel} disabled={cancelRequested}
            className="rounded border border-rose-500/40 px-2 py-1 text-rose-200 disabled:opacity-50">
            {cancelRequested ? "Stopping…" : "Stop sweep"}
          </button>
        ) : (
          <>
            <button type="button" onClick={start} disabled={starting || readOnly}
              className="rounded border border-cyan-500/40 px-2 py-1 text-cyan-200 disabled:opacity-50">
              {starting ? "Requesting…" : "Run sweep with hardware slew"}
            </button>
            <button type="button" onClick={copyTop}
              disabled={!top.length || typeof navigator === "undefined" || !navigator.clipboard}
              className="rounded border border-cyan-500/40 px-2 py-1 text-cyan-200 disabled:opacity-50">
              Copy top ridge
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-slate-300">
          Top N
          <input type="number" min={1} max={64} value={topN}
            onChange={(event) => {
              const value = Number(event.target.value);
              setTopN(Number.isFinite(value) ? Math.min(64, Math.max(1, Math.round(value))) : 1);
            }}
            className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" />
        </label>
        <button type="button" onClick={captureRidge} disabled={!history.length}
          className="rounded border border-cyan-500/40 px-2 py-1 text-cyan-200 disabled:opacity-50">
          Capture ridge presets
        </button>
        <button type="button" onClick={exportRows} disabled={!history.length}
          className="rounded border border-slate-600 px-2 py-1 text-slate-200 disabled:opacity-50">
          Download sweep CSV
        </button>
      </div>
      {actionError ? <p className="text-rose-300">Operation failed: {actionError}</p> : null}
      {actionNote ? <p className="text-slate-300">{actionNote}</p> : null}
      <div className="grid gap-2 font-mono sm:grid-cols-3">
        <div>Job: {typeof sweep.jobId === "string" ? sweep.jobId : "unreported"}</div>
        <div>State: {active ? cancelRequested ? "STOPPING" : "RUNNING" : sweep.cancelled ? "CANCELLED" : sweep.completedAt ? "COMPLETE" : "IDLE"}</div>
        <div>Step: {shown(number(sweep.iter), 0)} / {shown(number(sweep.total), 0)}</div>
        <div>Gap: {shown(number(fields.d_nm))} nm</div>
        <div>Phase: {shown(number(fields.phi_deg))} deg</div>
        <div>Pump: {shown(number(fields.Omega_GHz))} GHz</div>
        <div>Detune: {shown(number(fields.detune_MHz))} MHz</div>
        <div>κ effective: {shown(number(fields.kappaEff_MHz))} MHz</div>
        <div>Ratio: {shown(number(fields.pumpRatio))}</div>
        <div>Gain: {shown(number(fields.G))} dB</div>
        <div>Q loaded: {shown(number(fields.QL), 0)}</div>
        <div>ETA: {shown(number(sweep.etaMs), 0)} ms</div>
      </div>
      <p>Guard: {guard.length ? guard.join("; ") : "none reported by local check"}</p>
      <p>Rows: {totalRows.toLocaleString()} total; {history.length.toLocaleString()} visible; {droppedRows.toLocaleString()} dropped
        {typeof sweepResultsLimit === "number" ? `; cap ${sweepResultsLimit.toLocaleString()}` : ""}.</p>
      <PipelineCongruenceBadge label="stress" meta={pipeline?.stressMeta} />
      <ReversibilityBadge analytics={pipeline?.gateAnalytics} />
      <p className="text-slate-400">Feed: {hardware.status.level}; {hardware.activeSource ?? "no active source"}.</p>
    </section>
  );
}
