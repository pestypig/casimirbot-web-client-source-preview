import React from 'react';
import { subscribe, unsubscribe, publish } from '@/lib/luma-bus';
import { useQueryClient } from '@tanstack/react-query';
import type { EnergyPipelineState } from '@/hooks/use-energy-pipeline';
import { useHull3DSharedStore } from '@/store/useHull3DSharedStore';

type Trace = {
  t: number;
  mode: 'raw'|'exaggerated'|'calibrated';
  ridgeMode: 0|1;
  gammaGeo: number;
  q: number;
  gammaVdB: number;
  dutyFR: number;
  viewAvg: boolean;
  wallWidth: number;
  axesClip: [number,number,number];
  displayGain: number;
  zeroStop: number;
  cameraZ: number;
};

type NatarioDiagnostics = {
  t: number;
  nBeta?: number;       // ||beta|| (normalized)
  divMax?: number;      // max |∇·β|
  K_rms?: number;       // RMS(K)
  K_tol?: number;       // tolerance for K clamp
  gNatario?: number;    // 1 - divMax/K_tol
  gK?: number;          // optional K gate (K_rms/K_ref)
};

type CrestPacket = {
  t: number;
  frameId?: number;
  crestR_major?: number;
  crestR_minor?: number;
  rimR?: number;
};

export default function VizDiagnosticsPanel(){
  const DEFAULTS = React.useMemo(() => ({
    mode: 'exaggerated' as 'raw'|'exaggerated'|'calibrated',
    gain: 20,
    zero: 1e-9,
    ridge: undefined as 0|1|undefined,
  }), []);

  const [trace, setTrace] = React.useState<Trace | null>(null);
  const [natario, setNatario] = React.useState<NatarioDiagnostics | null>(null);
  const [crest, setCrest] = React.useState<CrestPacket | null>(null);
  const [ledger, setLedger] = React.useState<{ t:number; gainPhysics?: number } | null>(null);
  const [displayMode, setDisplayMode] = React.useState<'raw'|'exaggerated'|'calibrated'>(DEFAULTS.mode);
  const [displayGain, setDisplayGain] = React.useState<number>(DEFAULTS.gain);
  const [zeroStop, setZeroStop] = React.useState<number>(DEFAULTS.zero);
  const [ridgeMode, setRidgeMode] = React.useState<0|1|undefined>(DEFAULTS.ridge);

  const qc = useQueryClient();
  const pipeline = qc.getQueryData<EnergyPipelineState>(['/api/helix/pipeline']);

  // Hull 3D shared store (visual gain controls)
  const physics = useHull3DSharedStore((s) => s.physics);
  const setPhysics = useHull3DSharedStore((s) => s.setPhysics);
  const togglePhysicsLock = useHull3DSharedStore((s) => s.togglePhysicsLock);

  React.useEffect(() => {
    const onTrace = (payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      setTrace(payload as Trace);
    };
    const id1 = subscribe('warp:viz:trace', onTrace);

    const onNatario = (payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      setNatario({
        t: Date.now(),
        nBeta: Number(payload.nBeta),
        divMax: Number(payload.divMax),
        K_rms: Number(payload.K_rms),
        K_tol: Number(payload.K_tol),
        gNatario: Number(payload.gNatario),
        gK: Number(payload.gK),
      });
    };
    const id2 = subscribe('natario:diagnostics', onNatario);

    const onCrest = (payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      setCrest({
        t: Number(payload.ts ?? Date.now()),
        frameId: Number(payload.frameId),
        crestR_major: Number(payload.crestR_major),
        crestR_minor: Number(payload.crestR_minor),
        rimR: Number(payload.rimR),
      });
    };
    const id3 = subscribe('hull3d:viz:crest', onCrest);

    const onLedger = (payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      setLedger({ t: Date.now(), gainPhysics: Number(payload.gainPhysics) });
    };
    const id4 = subscribe('hull3d:viz:ledger', onLedger);

    return () => { unsubscribe(id1); unsubscribe(id2); unsubscribe(id3); unsubscribe(id4); };
  }, []);

  React.useEffect(() => {
    // push settings to viewers that opt‑in
    publish('warp:viz:display-settings', { displayMode, displayGain, zeroStop, ridgeMode });
  }, [displayMode, displayGain, zeroStop, ridgeMode]);

  const fmt = (n: any, d = 3) => Number.isFinite(+n) ? (+n).toFixed(d) : '—';
  const dbToLin = (db: number) => Math.pow(10, (db||0) / 20);

  const gainVisual = (Number.isFinite(physics?.yGain) ? (physics!.yGain) : 1) * dbToLin(Number(physics?.trimDb ?? 0));
  const gainPhysics = (ledger?.gainPhysics ?? (
    (Number.isFinite(natario?.nBeta) && Number.isFinite(natario?.gNatario))
      ? (Math.max(0, Math.min(1, natario!.nBeta!)) * Math.max(0, Math.min(1, natario!.gNatario!)) * (Number.isFinite(natario?.gK) ? Math.max(0, Math.min(1, natario!.gK!)) : 1))
      : undefined
  ));
  const gainPhysicsEff = Number.isFinite(gainPhysics) ? (gainPhysics as number) : 1; // fallback until diagnostics bus is live
  const gainDisplayStr = fmt(gainPhysicsEff * gainVisual, 3);

  const resetDefaults = () => {
    setDisplayMode(DEFAULTS.mode);
    setDisplayGain(DEFAULTS.gain);
    setZeroStop(DEFAULTS.zero);
    setRidgeMode(DEFAULTS.ridge);
    try {
      setPhysics({ locked: false, yGain: 1e-12, kColor: 0.05, trimDb: 24, updatedAt: Date.now() });
    } catch {}
    try {
      publish('warp:viz:display-settings', {
        displayMode: DEFAULTS.mode,
        displayGain: DEFAULTS.gain,
        zeroStop: DEFAULTS.zero,
        ridgeMode: DEFAULTS.ridge,
      });
    } catch {}
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] font-mono text-slate-200">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold">Viz Diagnostics</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-white/15 bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide"
            onClick={resetDefaults}
            title="Return to default HUD settings"
          >
            Reset
          </button>
          <span className="text-slate-400">{trace ? new Date(trace.t).toLocaleTimeString() : 'idle'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="text-slate-400">Mode</div>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select className="bg-transparent border border-white/15 rounded px-1 py-0.5"
              value={displayMode} onChange={(e) => setDisplayMode(e.target.value as any)}>
              <option value="raw">raw</option>
              <option value="exaggerated">exaggerated</option>
              <option value="calibrated">calibrated</option>
            </select>
            <label className="inline-flex items-center gap-1">
              <span>gain</span>
              <input className="bg-transparent border border-white/15 rounded px-1 py-0.5 w-16" type="number" step={1} value={displayGain}
                onChange={(e) => setDisplayGain(+e.target.value)} />
            </label>
            <label className="inline-flex items-center gap-1">
              <span>zero</span>
              <input className="bg-transparent border border-white/15 rounded px-1 py-0.5 w-24" type="number" step="any" value={zeroStop}
                onChange={(e) => setZeroStop(+e.target.value)} />
            </label>
          </div>
          <div className="mt-2">
            <label className="inline-flex items-center gap-2">
              <span className="text-slate-400">ridge</span>
              <select className="bg-transparent border border-white/15 rounded px-1 py-0.5"
                value={ridgeMode == null ? '' : ridgeMode}
                onChange={(e) => setRidgeMode(e.target.value === '' ? undefined : (Number(e.target.value) as 0|1))}>
                <option value="">auto</option>
                <option value={0}>REAL (double)</option>
                <option value={1}>SHOW (single)</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="text-slate-400">Pipeline</div>
          <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            <div>gammaGeo</div><div>{fmt(pipeline?.gammaGeo)}</div>
            <div>q (dA/A)</div><div>{fmt((pipeline as any)?.q ?? (pipeline as any)?.deltaAOverA ?? (pipeline as any)?.qSpoilingFactor)}</div>
            <div>gammaVdB</div><div>{fmt((pipeline as any)?.gammaVanDenBroeck_vis ?? pipeline?.gammaVanDenBroeck ?? (pipeline as any)?.gammaVanDenBroeck_mass)}</div>
            <div>dutyFR</div><div>{fmt(pipeline?.dutyEffectiveFR ?? pipeline?.dutyCycle)}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-slate-300">Hull 3D Visual Gain</div>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!physics.locked}
              onChange={() => togglePhysicsLock()}
            />
            <span className="text-slate-400">Lock</span>
          </label>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 items-end sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">yGain</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={200}
              className="bg-transparent border border-white/15 rounded px-1 py-0.5"
              value={Number.isFinite(physics.yGain) ? physics.yGain : 1}
              onChange={(e) => setPhysics({ yGain: Math.max(0, +e.target.value), updatedAt: Date.now() })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">kColor</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={10}
              className="bg-transparent border border-white/15 rounded px-1 py-0.5"
              value={Number.isFinite(physics.kColor) ? physics.kColor : 1}
              onChange={(e) => setPhysics({ kColor: Math.max(0, +e.target.value), updatedAt: Date.now() })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">trimDb</span>
            <input
              type="number"
              step={0.5}
              min={-24}
              max={24}
              className="bg-transparent border border-white/15 rounded px-1 py-0.5"
              value={Number.isFinite(physics.trimDb) ? physics.trimDb : 0}
              onChange={(e) => {
                const v = Math.max(-24, Math.min(24, +e.target.value));
                setPhysics({ trimDb: v, updatedAt: Date.now() });
              }}
            />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[10px] text-slate-400 sm:grid-cols-3">
          <div>θ expected: <span className="text-slate-200">{fmt(physics.thetaExpected)}</span></div>
          <div>θ used: <span className="text-slate-200">{fmt(physics.thetaUsed)}</span></div>
          <div>ratio: <span className="text-slate-200">{fmt(physics.ratio)}</span></div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 p-2">
        <div className="text-slate-300 mb-1">Gain Ledger</div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-3">
          <div className="text-slate-400">nβ</div><div className="col-span-2">{fmt(natario?.nBeta)}</div>
          <div className="text-slate-400">max|∇·β|</div><div className="col-span-2">{fmt(natario?.divMax)}</div>
          <div className="text-slate-400">K_rms</div><div className="col-span-2">{fmt(natario?.K_rms)}</div>
          <div className="text-slate-400">K_tol</div><div className="col-span-2">{fmt(natario?.K_tol)}</div>
          <div className="text-slate-400">gNatário</div><div className="col-span-2">{fmt(natario?.gNatario)}</div>
          <div className="text-slate-400">gK</div><div className="col-span-2">{fmt(natario?.gK)}</div>
          <div className="text-slate-400">gainPhysics</div><div className="col-span-2">{Number.isFinite(gainPhysics) ? fmt(gainPhysics) : '—'}</div>
          <div className="text-slate-400">yGain</div><div className="col-span-2">{fmt(physics?.yGain)}</div>
          <div className="text-slate-400">trimDb</div><div className="col-span-2">{fmt(physics?.trimDb)}</div>
          <div className="text-slate-400">lin(trimDb)</div><div className="col-span-2">{fmt(dbToLin(Number(physics?.trimDb ?? 0)))}</div>
          <div className="text-slate-400">kColor</div><div className="col-span-2">{fmt(physics?.kColor)}</div>
          <div className="text-slate-400">gainVisual</div><div className="col-span-2">{fmt(gainVisual)}</div>
          <div className="text-slate-400">gainDisplay</div><div className="col-span-2">{gainDisplayStr}</div>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[10px] text-slate-400 sm:grid-cols-3">
          <div>crestR (maj)</div><div className="col-span-2">{fmt(crest?.crestR_major)}</div>
          <div>crestR (min)</div><div className="col-span-2">{fmt(crest?.crestR_minor)}</div>
          <div>rimR</div><div className="col-span-2">{fmt(crest?.rimR)}</div>
          <div>rim ratio</div>
          <div className="col-span-2">
            {Number.isFinite(crest?.crestR_major) && Number.isFinite(crest?.crestR_minor) && Number.isFinite(crest?.rimR) && (crest!.rimR! > 0)
              ? fmt(((crest!.crestR_major! + crest!.crestR_minor!) * 0.5) / crest!.rimR!)
              : '—'}
          </div>
        </div>
      </div>

      {trace && (
        <div className="mt-3">
          <div className="text-slate-400 mb-1">Trace</div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-3">
            <div>u_mode</div><div className="col-span-2">{trace.mode} ridge:{trace.ridgeMode}</div>
            <div>theta chain</div><div className="col-span-2">geo^3·q·VdB·(√dFR:{String(trace.viewAvg)})</div>
            <div>gammaGeo</div><div className="col-span-2">{fmt(trace.gammaGeo)}</div>
            <div>q</div><div className="col-span-2">{fmt(trace.q)}</div>
            <div>gammaVdB</div><div className="col-span-2">{fmt(trace.gammaVdB)}</div>
            <div>dutyFR</div><div className="col-span-2">{fmt(trace.dutyFR,6)}</div>
            <div>wallWidth</div><div className="col-span-2">{fmt(trace.wallWidth,4)}</div>
            <div>axes</div><div className="col-span-2">[{fmt(trace.axesClip[0])}, {fmt(trace.axesClip[1])}, {fmt(trace.axesClip[2])}]</div>
            <div>display</div><div className="col-span-2">gain {fmt(trace.displayGain)} zero {fmt(trace.zeroStop, 12)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
