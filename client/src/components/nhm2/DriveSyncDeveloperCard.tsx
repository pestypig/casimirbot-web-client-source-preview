import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";

const shown = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "unreported";

type ControlProps = {
  label: string;
  value: number;
  shownValue: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function Control({ label, value, shownValue, min, max, step, disabled, onChange }: ControlProps) {
  return <div className="space-y-1">
    <div className="flex justify-between gap-3 text-xs"><span>{label}</span><span className="font-mono text-slate-300">{shownValue}</span></div>
    <Slider value={[Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min]}
      min={min} max={max} step={step} disabled={disabled}
      onValueChange={(next) => { if (typeof next[0] === "number") onChange(next[0]); }} />
  </div>;
}

export default function DriveSyncDeveloperCard() {
  const drive = useDriveSyncStore();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 5000 });
  const [ampInput, setAmpInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const pipelineStatic = Number(pipeline?.U_static);
  const hasPipelineStatic = Number.isFinite(pipelineStatic);
  const parsedAmp = Number(ampInput);
  const validAmp = ampInput.trim() !== "" && Number.isFinite(parsedAmp) && parsedAmp >= 0;
  const phasePct = Math.round(((drive.phase01 % 1 + 1) % 1) * 100);
  const splitPct = Math.round(drive.splitFrac * 100);

  return <section className="space-y-4 rounded border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
    <div>
      <h3 className="font-semibold">Drive sync developer controls</h3>
      <p className="text-xs text-amber-200">
        These actions publish local drive-split visualization state. They do not amend the selected NHM2 solve,
        establish a measured Casimir source, or certify steering or physical viability.
      </p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-xs">
          Follow mode presets <Switch checked={drive.locks.followMode} onCheckedChange={drive.setFollowMode} />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          Manual phase source <Switch checked={drive.phaseMode === "manual"}
            onCheckedChange={(manual) => drive.setPhaseMode(manual ? "manual" : "scheduler")} />
        </label>
        <Control label="Phase" value={drive.phase01} shownValue={`${phasePct}%`} min={0} max={1} step={0.001}
          disabled={drive.phaseMode !== "manual"}
          onChange={(value) => { drive.setPhaseMode("manual"); drive.setPhase(value); }} />
        <label className="flex items-center justify-between gap-3 text-xs">
          Split lobes <Switch checked={drive.splitEnabled}
            onCheckedChange={(enabled) => drive.setSplit(enabled, drive.splitFrac)} />
        </label>
        <Control label="Split weight" value={drive.splitFrac} shownValue={`${splitPct}% / ${100 - splitPct}%`}
          min={0} max={1} step={0.01} disabled={!drive.splitEnabled}
          onChange={(value) => drive.setSplit(true, value)} />
      </div>
      <div className="space-y-4">
        <Control label="Sector width σ" value={drive.sigmaSectors} shownValue={shown(drive.sigmaSectors)}
          min={0.01} max={1} step={0.01} onChange={drive.setSigma} />
        <Control label="Sector floor" value={drive.sectorFloor} shownValue={shown(drive.sectorFloor)}
          min={0} max={0.5} step={0.01} onChange={drive.setFloor} />
        <Control label="Spoiling q" value={drive.q} shownValue={shown(drive.q)}
          min={0} max={2} step={0.01} onChange={drive.setQ} />
        <Control label="Coupling ζ" value={drive.zeta} shownValue={shown(drive.zeta)}
          min={0} max={1} step={0.01} onChange={drive.setZeta} />
      </div>
    </div>
    <div className="space-y-2 border-t border-slate-700 pt-3 text-xs">
      <div>Visual amplitude base: <span className="font-mono">{shown(drive.ampBase, 4)}</span>.</div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min={0} step="any" value={ampInput} onChange={(event) => setAmpInput(event.target.value)}
          aria-label="Visual amplitude base" placeholder="Set visual amplitude base"
          className="min-w-52 rounded border border-slate-600 bg-slate-900 px-2 py-1" />
        <button type="button" disabled={!validAmp} onClick={() => { drive.setAmpBase(parsedAmp); setStatus("Manual visual amplitude base applied."); }}
          className="rounded border border-cyan-500/40 px-2 py-1 disabled:opacity-50">Apply value</button>
        <button type="button" disabled={!hasPipelineStatic}
          onClick={() => { drive.setAmpBase(Math.abs(pipelineStatic)); setStatus("Absolute live pipeline U_static staged as a visual amplitude base."); }}
          className="rounded border border-slate-500 px-2 py-1 disabled:opacity-50">Use live U_static</button>
      </div>
      <p className="text-slate-400">Live U_static: {hasPipelineStatic ? `${pipelineStatic.toExponential(3)} J` : "unreported"}; the staging button is a visual control, not a source receipt.</p>
      {status ? <p role="status" className="text-cyan-200">{status}</p> : null}
    </div>
  </section>;
}
