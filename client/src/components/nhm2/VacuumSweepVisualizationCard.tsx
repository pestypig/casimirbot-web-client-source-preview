import { useMemo, useState } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import VacuumGapHeatmap from "@/components/VacuumGapHeatmap";
import SweepReplayControls from "@/components/SweepReplayControls";
import type { VacuumGapSweepRow } from "@shared/schema";

const MAX_HEATMAP_ROWS = 1500;
const shown = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "unreported";

export default function VacuumSweepVisualizationCard() {
  const { sweepResults, sweepResultsTotal, sweepResultsDropped, sweepResultsLimit } =
    useEnergyPipeline({ refetchInterval: 5000 });
  const [selected, setSelected] = useState<VacuumGapSweepRow | null>(null);
  const visible = Array.isArray(sweepResults) ? sweepResults : [];
  const total = typeof sweepResultsTotal === "number" ? sweepResultsTotal : visible.length;
  const dropped = typeof sweepResultsDropped === "number"
    ? Math.max(0, sweepResultsDropped) : Math.max(0, total - visible.length);
  const plotted = useMemo(() => {
    const latestByCell = new Map<string, VacuumGapSweepRow>();
    for (const row of visible) latestByCell.set(`${row.d_nm}|${row.Omega_GHz}`, row);
    const unique = [...latestByCell.values()];
    if (unique.length <= MAX_HEATMAP_ROWS) return unique;
    const stride = Math.ceil(unique.length / MAX_HEATMAP_ROWS);
    const sampled = unique.filter((_, index) => index % stride === 0);
    const tail = unique[unique.length - 1];
    if (tail && sampled[sampled.length - 1] !== tail) sampled.push(tail);
    return sampled;
  }, [visible]);
  const focused = selected && visible.some((row) => row === selected) ? selected : visible[visible.length - 1] ?? null;

  return <section className="space-y-4 text-sm text-slate-100">
    <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
      This heatmap and replay inspect retained live sweep rows. Gain, crest, stability, and negative-energy proxy
      fields are diagnostics; they are not a selected-run NHM2 source or physical-viability receipt.
    </p>
    <p className="text-xs text-slate-300">
      {total.toLocaleString()} rows reported; {visible.length.toLocaleString()} retained; {dropped.toLocaleString()} dropped
      {typeof sweepResultsLimit === "number" ? `; retained cap ${sweepResultsLimit.toLocaleString()}` : ""}.
      {plotted.length < visible.length ? ` Heatmap uses ${plotted.length.toLocaleString()} latest unique cells.` : ""}
    </p>
    <VacuumGapHeatmap rows={plotted} onCellClick={(cell) => {
      const row = visible.filter((candidate) => candidate.d_nm === cell.d_nm && candidate.Omega_GHz === cell.Omega_GHz)
        .sort((a, b) => b.G - a.G)[0];
      if (row) setSelected(row);
    }} />
    <div className="rounded border border-slate-700 p-3">
      <h3 className="mb-2 font-semibold">Replay retained rows</h3>
      <SweepReplayControls rows={visible} onStep={(row) => setSelected(row)} />
    </div>
    {focused ? <div className="rounded border border-slate-700 p-3 font-mono text-xs">
      <div>Focused row: gap {shown(focused.d_nm)} nm · pump {shown(focused.Omega_GHz, 3)} GHz · phase {shown(focused.phi_deg)}°</div>
      <div>Gain {shown(focused.G)} dB · Q loaded {shown(focused.QL, 0)} · squeezing {shown(focused.dB_squeeze)} dB</div>
      <div>Noise {shown(focused.noiseTemp_K)} K · ΔU/cycle {shown(focused.deltaU_cycle_J, 4)} J · {focused.stable ? "stable flag" : "warning flag"}</div>
    </div> : <p className="text-xs text-slate-400">No retained sweep rows are available.</p>}
  </section>;
}
