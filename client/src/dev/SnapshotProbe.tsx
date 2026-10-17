import React, { useEffect, useState } from "react";

type Snap = any;

function Row({k,v,u}:{k:string; v:any; u?:string}){
  const txt = (v===undefined||v===null) ? '—' : (typeof v==='number' ? (Number.isFinite(v)? v.toExponential(3):'NaN') : JSON.stringify(v));
  return (
    <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800">
      <div className="text-slate-300">{k}</div>
      <div className="text-slate-100">{txt}</div>
      <div className="text-slate-500 text-right">{u||''}</div>
    </div>
  );
}

export default function SnapshotProbe(){
  const [real, setReal] = useState<Snap|null>(null);
  const [show, setShow] = useState<Snap|null>(null);
  const [err, setErr]   = useState<string>("");

  useEffect(() => {
    let alive = true;
    async function load(mode:'REAL'|'SHOW', put:(s:Snap)=>void){
      try {
        const r = await fetch(`/api/helix/snapshot?mode=${mode}`);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const j = await r.json();
        if (alive) put(j);
      } catch(e:any){
        if (alive) setErr(e?.message||String(e));
      }
    }
    load('REAL', setReal);
    load('SHOW', setShow);
    return () => { alive=false; };
  }, []);

  return (
    <div className="p-4 text-sm font-mono text-slate-100">
      <h2 className="text-lg mb-2">SnapshotProbe</h2>
      {err && <div className="text-red-400 mb-2">error: {err}</div>}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h3 className="text-cyan-400 mb-2">REAL</h3>
          {real ? <Block snap={real}/> : <div>loading…</div>}
        </section>
        <section>
          <h3 className="text-pink-400 mb-2">SHOW</h3>
          {show ? <Block snap={show}/> : <div>loading…</div>}
        </section>
      </div>
    </div>
  );
}

function Block({snap}:{snap:Snap}){
  const lc = snap?.lc || snap?.lightCrossing || {};
  const nat = snap?.natario || {};
  return (
    <div className="space-y-4">
      <Sub title="LC (ms)">
        <Row k="tauLC_ms"   v={lc.tauLC_ms}   u="ms"/>
        <Row k="dwell_ms"   v={lc.dwell_ms}   u="ms"/>
        <Row k="burst_ms"   v={lc.burst_ms}   u="ms"/>
        <Row k="phase"      v={lc.phase}/>
        <Row k="onWindow"   v={lc.onWindow?1:0}/>
        <Row k="sectorIdx"  v={lc.sectorIdx}/>
        <Row k="sectorCount"v={lc.sectorCount}/>
      </Sub>
      <Sub title="Duty">
        <Row k="dutyUsed"         v={snap.dutyUsed}/>
        <Row k="dutyEffectiveFR"  v={snap.dutyEffectiveFR}/>
        <Row k="dutyFR_slice"     v={snap.dutyFR_slice}/>
        <Row k="dutyFR_ship"      v={snap.dutyFR_ship}/>
        <Row k="natario.dutyFactor" v={nat.dutyFactor}/>
      </Sub>
      <Sub title="Amplifications">
        <Row k="gammaGeo"               v={snap.gammaGeo}/>
        <Row k="qSpoilingFactor"        v={snap.qSpoilingFactor}/>
        <Row k="deltaAOverA"            v={snap.deltaAOverA}/>
        <Row k="gammaVdB"               v={snap.gammaVdB}/>
        <Row k="gammaVanDenBroeck"      v={snap.gammaVanDenBroeck}/>
      </Sub>
      <Sub title="Theta">
        <Row k="thetaScale"        v={snap.thetaScale}/>
        <Row k="thetaUniform"      v={snap.thetaUniform}/>
        <Row k="thetaScaleExpected"v={snap.thetaScaleExpected}/>
  <Row k="natario.thetaCore (sqrtDuty)" v={nat.thetaScaleCore_sqrtDuty ?? nat.thetaScaleCore} u="(prefers _sqrtDuty; legacy key shown if missing)"/>
      </Sub>
      <Sub title="Natário tensors">
        <Row k="metricMode"   v={nat.metricMode?1:0}/>
        <Row k="lapseN"       v={nat.lapseN}/>
        <Row k="shiftBeta"    v={Array.isArray(nat.shiftBeta)? nat.shiftBeta.join(', '): nat.shiftBeta}/>
        <Row k="gSpatialDiag" v={Array.isArray(nat.gSpatialDiag)? nat.gSpatialDiag.join(', '): nat.gSpatialDiag}/>
        <Row k="gSpatialSym"  v={Array.isArray(nat.gSpatialSym)? nat.gSpatialSym.join(', '): nat.gSpatialSym}/>
        <Row k="viewForward"  v={Array.isArray(nat.viewForward)? nat.viewForward.join(', '): nat.viewForward}/>
        <Row k="g0i"          v={Array.isArray(nat.g0i)? nat.g0i.join(', '): nat.g0i}/>
      </Sub>
    </div>
  );
}

function Sub({title, children}:{title:string; children:any}){
  return (
    <div>
      <div className="text-slate-400 uppercase tracking-wide text-xs mb-1">{title}</div>
      <div className="rounded-xl border border-slate-800 p-2 bg-slate-950/40">
        {children}
      </div>
    </div>
  );
}
