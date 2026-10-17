import React, { useEffect, useMemo, useState } from "react";
import { driveWarpFromPipeline } from "@/lib/warp-pipeline-adapter";

type EngineStub = {
  uniforms: any;
  _lc: any;
  updateUniforms: (p:any)=>void;
  setLightCrossing: (lc:any)=>void;
  requestRewarp: ()=>void;
};

function makeEngineStub(): EngineStub {
  return {
    uniforms: {},
    _lc: {},
    // Preserve gate semantics in the dev stub: strip physics fields so the
    // probe cannot fake pipeline-owned uniforms.
    updateUniforms(p:any){
      try {
        // lazy-import to avoid circular deps during tests
        const { withoutPhysics } = require('@/lib/warp-uniforms-gate');
        const safe = withoutPhysics(p || {});
        this.uniforms = { ...(this.uniforms||{}), ...(safe||{}) };
      } catch (e) {
        this.uniforms = { ...(this.uniforms||{}), ...(p||{}) };
      }
    },
    setLightCrossing(lc:any){
      try {
        const { withoutPhysics } = require('@/lib/warp-uniforms-gate');
        const safe = withoutPhysics(lc || {});
        this._lc = { ...(this._lc||{}), ...(safe||{}) };
      } catch (e) {
        this._lc = { ...(this._lc||{}), ...(lc||{}) };
      }
    },
    requestRewarp(){ /* no-op */ },
  };
}

function Row({k,v,u}:{k:string; v:any; u?:string}) {
  const txt = (v===undefined||v===null) ? '\u2014'
    : (typeof v==='number' ? (Number.isFinite(v)? v.toExponential(3):'NaN')
    : Array.isArray(v) ? v.join(', ')
    : typeof v==='boolean' ? (v?'true':'false')
    : JSON.stringify(v));
  return (
    <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800">
      <div className="text-slate-400">{k}</div>
      <div className="text-slate-100">{txt}</div>
      <div className="text-slate-500 text-right">{u||''}</div>
    </div>
  );
}

export default function AdapterProbe(){
  const [mode, setMode] = useState<'REAL'|'SHOW'>('REAL');
  const [source, setSource] = useState<'LIVE'|'SAMPLE'>('LIVE');
  const [snap, setSnap] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  // SAMPLE: controlled snapshot
  const samplePipeline = useMemo(() => ({
    gammaGeo: 26,
    qSpoilingFactor: 1.0,
    gammaVanDenBroeck: 2.86e5,
    thetaScaleExpected: 2.5e7,
    sectorCount: 400,
    lc: { tauLC_ms: 3.36, dwell_ms: 1.0, burst_ms: 0.01, phase: 0.0, onWindow: true, sectorIdx: 0, sectorCount: 400 },
  natario: {
      metricMode: false,
      lapseN: 1.0,
      shiftBeta: [0,0,0],
      gSpatialDiag: [1,1,1],
      gSpatialSym:  [1,1,1,0,0,0],
      viewForward:  [0,0,-1],
      g0i:          [0,0,0],
      dutyFactor: 0.01,
  // Use explicit `_sqrtDuty` alias in samples; legacy `thetaScaleCore` is deprecated.
  thetaScaleCore_sqrtDuty: Math.pow(26,3) * 1.0 * Math.sqrt(0.01),
    }
  }), []);

  // LIVE: fetch server snapshot when selected
  useEffect(() => {
    let alive = true;
    async function load() {
      if (source !== 'LIVE') { setSnap(null); setErr(""); return; }
      try {
        const r = await fetch(`/api/helix/snapshot?mode=${mode}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const j = await r.json();
        if (alive) { setSnap(j); setErr(""); }
      } catch (e:any) {
        if (alive) { setErr(e?.message || String(e)); setSnap(null); }
      }
    }
    load();
    return () => { alive = false; };
  }, [mode, source]);

  // Derive a metrics-like object from LIVE snapshot (when present)
  const metrics = useMemo(() => {
    if (source === 'LIVE' && snap) {
      const lc = snap.lc || snap.lightCrossing || {};
      return {
        dutyFR: snap.dutyEffectiveFR ?? snap.dutyUsed,
        totalSectors: lc.sectorCount ?? snap.sectorCount,
        currentSector: lc.sectorIdx,
        lightCrossing: {
          tauLC_ms: lc.tauLC_ms, dwell_ms: lc.dwell_ms, burst_ms: lc.burst_ms,
          onWindow: lc.onWindow, sectorIdx: lc.sectorIdx, sectorCount: lc.sectorCount
        }
      };
    }
    // SAMPLE default metrics
    return {
      dutyFR: 0.000025,
      totalSectors: 400,
      currentSector: 0,
      lightCrossing: { tauLC_ms: 3.36, dwell_ms: 1.0, burst_ms: 0.01, onWindow: true, sectorIdx: 0, sectorCount: 400 }
    };
  }, [snap, source]);

  const pipeline = (source === 'LIVE' && snap) ? snap : samplePipeline;

  // Run adapter in loose+strict to show mapping and strict errors
  const result = useMemo(() => {
    const engA = makeEngineStub();
    const engB = makeEngineStub();
    if (pipeline) {
      driveWarpFromPipeline(engA as any, pipeline, { mode, strict: false, metrics });
      driveWarpFromPipeline(engB as any, pipeline, { mode, strict: true,  metrics });
    }
    return { loose: engA, strict: engB };
  }, [pipeline, metrics, mode]);

  const U = result.loose.uniforms || {};
  const L = result.loose._lc || {};
  const E = result.strict.uniforms?.__error;

  return (
    <div className="p-4 font-mono text-sm rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between mb-3">
        <div className="text-slate-200">AdapterProbe (client-side mapping)</div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Mode:</span>
          <button className={`px-2 py-1 rounded ${mode==='REAL'?'bg-cyan-700':'bg-slate-700'}`} onClick={()=>setMode('REAL')}>REAL</button>
          <button className={`px-2 py-1 rounded ${mode==='SHOW'?'bg-pink-700':'bg-slate-700'}`} onClick={()=>setMode('SHOW')}>SHOW</button>
          <span className="ml-4 text-slate-400">Source:</span>
          <button className={`px-2 py-1 rounded ${source==='LIVE'?'bg-emerald-700':'bg-slate-700'}`} onClick={()=>setSource('LIVE')}>LIVE</button>
          <button className={`px-2 py-1 rounded ${source==='SAMPLE'?'bg-amber-700':'bg-slate-700'}`} onClick={()=>setSource('SAMPLE')}>SAMPLE</button>
        </div>
      </div>
      {err && <div className="mb-2 text-amber-400">live fetch: {err}</div>}
      {E && <div className="mb-2 text-red-400">strict error: {String(E)}</div>}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h3 className="text-slate-300 mb-1">LC (what engine receives)</h3>
          <div className="rounded-lg border border-slate-800 p-2">
            <Row k="tauLC_ms"   v={L.tauLC_ms}   u="ms"/>
            <Row k="dwell_ms"   v={L.dwell_ms}   u="ms"/>
            <Row k="burst_ms"   v={L.burst_ms}   u="ms"/>
            <Row k="phase"      v={L.phase}/>
            <Row k="onWindow"   v={L.onWindow}/>
            <Row k="sectorIdx"  v={L.sectorIdx}/>
            <Row k="sectorCount"v={L.sectorCount}/>
          </div>
        </section>
        <section>
          <h3 className="text-slate-300 mb-1">Uniforms (adapter output)</h3>
          <div className="rounded-lg border border-slate-800 p-2">
            <Row k="thetaScale"        v={U.thetaScale}/>
            <Row k="thetaUniform"      v={U.thetaUniform}/>
            <Row k="thetaScaleExpected"v={U.thetaScaleExpected}/>
            <Row k="gammaGeo"          v={U.gammaGeo}/>
            <Row k="qSpoilingFactor"   v={U.qSpoilingFactor}/>
            <Row k="deltaAOverA"       v={U.deltaAOverA}/>
            <Row k="gammaVdB"          v={U.gammaVdB}/>
            <Row k="gammaVanDenBroeck" v={U.gammaVanDenBroeck}/>
            <Row k="sectorCount"       v={U.sectorCount}/>
            <Row k="dutyUsed"          v={U.dutyUsed}/>
            <Row k="physicsParityMode" v={U.physicsParityMode}/>
            <Row k="ridgeMode"         v={U.ridgeMode}/>
            <Row k="metricMode"        v={U.metricMode}/>
          </div>
        </section>
      </div>
      <div className="grid grid-cols-2 gap-6 mt-4">
        <section>
          <h3 className="text-slate-300 mb-1">Natário diagnostics</h3>
          <div className="rounded-lg border border-slate-800 p-2">
            <Row k="dutyNatario"      v={U.dutyNatario}/>
            <Row k="thetaCoreNatario (sqrtDuty)" v={U.thetaCoreNatario}/>
            <Row k="T00" v={U.T00}/>
            <Row k="T11" v={U.T11}/>
            <Row k="T22" v={U.T22}/>
            <Row k="T33" v={U.T33}/>
          </div>
        </section>
        <section>
          <h3 className="text-slate-300 mb-1">Tensors</h3>
          <div className="rounded-lg border border-slate-800 p-2">
            <Row k="lapseN"       v={U.lapseN}/>
            <Row k="shiftBeta"    v={U.shiftBeta}/>
            <Row k="gSpatialDiag" v={U.gSpatialDiag}/>
            <Row k="gSpatialSym"  v={U.gSpatialSym}/>
            <Row k="viewForward"  v={U.viewForward}/>
            <Row k="g0i"          v={U.g0i}/>
          </div>
        </section>
      </div>
    </div>
  );
}
