// Adapter: pipeline → engine uniforms (strict; no client fabrication)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { gatedUpdateUniforms, gatedHeartbeat } from './warp-uniforms-gate';

// Small helpers
function finite(x:any){ const n=+x; return Number.isFinite(n)?n:undefined; }
function isF(x:any){ return Number.isFinite(+x); }
function inty(x:any){ const n=Math.floor(+x); return Number.isFinite(n)?n:undefined; }
function booly(x:any){ return x===true || x===1 || x==='1'; }
function arrN(a:any,k:number){ return (Array.isArray(a)&&a.length>=k)?a:undefined; }

type MetricsLike = {
  dutyFR?: number;
  lightCrossing?: { tauLC_ms?: number; dwell_ms?: number; burst_ms?: number; phase?: number; onWindow?: boolean; sectorIdx?: number; sectorCount?: number };
};

const isNum = (x:any): x is number => typeof x === 'number' && Number.isFinite(x);
const fint  = (x:any) => Number.isFinite(+x) ? +x : undefined;
const fnum  = (x:any, d?:number) => Number.isFinite(+x) ? +x : d;
const arr3  = (a:any) => Array.isArray(a) && a.length >= 3 ? [ +a[0], +a[1], +a[2] ] as [number,number,number] : undefined;
const get = (o:any, path:(string|number)[]) => { let cur=o; for (const k of path){ if (cur==null) return undefined; cur = (typeof k==='number')? cur[k] : cur[k]; } return cur; };

function pickDuty(pipeline:any, metrics?:MetricsLike){
  const m = metrics?.dutyFR;
  if (isNum(m)) return m;
  const d = fnum(pipeline?.dutyUsed, undefined)
        ?? fnum(pipeline?.dutyEffective_FR, undefined)
        ?? fnum(pipeline?.dutyEffectiveFR, undefined)
        ?? fnum(pipeline?.dutyFR_slice, undefined)
        ?? fnum(pipeline?.dutyFR_ship, undefined);
  return fnum(d, 0);
}

function pickLC(pipeline:any, metrics?:MetricsLike){
  const src = metrics?.lightCrossing ?? pipeline?.lc ?? pipeline?.lightCrossing ?? {};
  const tauLC_ms = isNum(src.tauLC_ms) ? src.tauLC_ms : (isNum(src.tauLC_us) ? src.tauLC_us/1000 : undefined);
  const dwell_ms = isNum(src.dwell_ms) ? src.dwell_ms : (isNum(src.dwell_us) ? src.dwell_us/1000 : undefined);
  const burst_ms = isNum(src.burst_ms) ? src.burst_ms : (isNum(src.burst_us) ? src.burst_us/1000 : undefined);
  return {
    tauLC_ms, dwell_ms, burst_ms,
    phase: fint(src.phase),
    onWindow: !!src.onWindow,
    sectorIdx: fint(src.sectorIdx),
    sectorCount: fint(src.sectorCount) ?? fint(pipeline?.sectorCount) ?? fint(pipeline?.totalSectors)
  };
}

// NOTE: Do not consume server-provided theta values; engine derives θ locally from scalars.

function pickCore(pipeline:any){
  const nat = pipeline?.natario ?? {};
  return {
    gammaGeo: fnum(pipeline?.gammaGeo) ?? fnum(pipeline?.gamma_geo) ?? fnum(nat?.gammaGeo) ?? fnum(nat?.gamma_geo),
    qSpoilingFactor: fnum(pipeline?.qSpoilingFactor) ?? fnum(pipeline?.deltaAOverA) ?? fnum(pipeline?.q) ?? fnum(pipeline?.qMechanical),
    gammaVdB: fnum(pipeline?.gammaVanDenBroeck_vis) ?? fnum(pipeline?.gammaVdB) ?? fnum(pipeline?.gammaVanDenBroeck) ?? fnum(pipeline?.gamma_vdb),
  };
}

// NEW: local Ford–Roman duty calculator for client-side adapter (same logic as server)
export function computeFordRomanDuty(burstLocal: number, live: number, total: number, isStandby = false) {
  if (isStandby) return 0;
  const S_live = Math.max(1, Number(live) || 1);
  const S_total = Math.max(1, Number(total) || 1);
  const burstLocalNum = Number(burstLocal);
  const burstLocalVal = Number.isFinite(burstLocalNum) ? burstLocalNum : 0;
  const d = Math.max(0, Math.min(1, burstLocalVal * (S_live / S_total)));
  return d;
}

/** Build a harmless meta heartbeat from whatever we have */
function buildHeartbeat(pipeline: any, extra?: any) {
  const p = pipeline || {};
  return {
    __meta: true,
    __ts: Date.now(),
    currentMode: String(p.currentMode ?? 'unknown').toLowerCase(),
    // timing / strobe hints (non-physics)
    sectorCount: Number(p.sectorCount ?? p.totalSectors ?? 0) || 0,
    // core physics (engine will compute θ from these scalars)
    onWindow: !!(p.lightCrossing?.onWindow),
    dutyEffectiveFR: Number(p.dutyEffectiveFR ?? p.dutyUsed ?? 0) || 0,
    ...extra
  };
}

// Main adapter: authoritative bridge from pipeline -> engine uniforms
export function driveWarpFromPipeline(engine: any, pipeline: any, opts?: { mode?: 'REAL'|'SHOW', strict?: boolean, metrics?: MetricsLike }) {
  const ADAPTER_LOG = false as const;
  // Always emit a minimal heartbeat as soon as we can talk to an engine.
  if (engine) {
    try { gatedUpdateUniforms(engine, buildHeartbeat(pipeline), 'adapter'); } catch {}
  }
  if (!engine || !pipeline) return;

  const modeStr = String(opts?.mode ?? pipeline?.currentMode ?? pipeline?.mode ?? 'REAL').toUpperCase();
  const mode: 'REAL'|'SHOW' = (modeStr === 'SHOW') ? 'SHOW' : 'REAL';
  const strict = opts?.strict ?? true;
  const mx: MetricsLike|undefined = opts?.metrics as any;
  const isStandby = String(pipeline?.currentMode || '').toLowerCase() === 'standby';

  // 1) Normalize LC and duty
  const LC = pickLC(pipeline, mx);
  const dutyUsed = pickDuty(pipeline, mx);
  const zeroDuty = !(isNum(dutyUsed) && dutyUsed > 0);
  const lcPayload = { tauLC_ms: LC.tauLC_ms, dwell_ms: LC.dwell_ms, burst_ms: LC.burst_ms, phase: LC.phase, onWindow: LC.onWindow, sectorIdx: LC.sectorIdx, sectorCount: LC.sectorCount };

  // 2) Early meta + heartbeat so UIs/outline see stamps even if we strict-abort later
  const pipeTs = finite(pipeline?.__ts) ?? finite(pipeline?.timestamp) ?? undefined;
  const pipeSeq = finite(pipeline?.seq) ?? finite(pipeline?.__seq) ?? undefined;
  const metaPatch: any = { currentMode: mode, __pipelineMode: mode, __src: 'server', __version: (pipeSeq != null ? pipeSeq : (pipeTs != null ? pipeTs : Date.now())) };
  if (pipeTs != null) metaPatch.__pipelineTs = pipeTs;
  if (pipeSeq != null) metaPatch.__pipelineSeq = pipeSeq;
  if ((mx as any)?.timestamp != null) metaPatch.__metricsTick = (mx as any).timestamp;

  const isRealPane = mode === 'REAL';
  metaPatch.physicsParityMode = isRealPane ? true : false;
  metaPatch.ridgeMode = isRealPane ? 0 : 1;

  const withAdapterWrite = (eng: any, fn: () => void) => { if (!eng) return; try { try { eng.__adapterWriting = true; } catch(e){} fn(); } finally { try { delete eng.__adapterWriting; } catch(e){} } };

  // Make sure engines see meta and LC ASAP
  withAdapterWrite(engine, () => { engine.updateUniforms?.(metaPatch); });
  try { withAdapterWrite(engine, () => { engine.setLightCrossing?.(lcPayload); }); } catch(e) {}

  // 3) Heartbeat: axes + wall + physics flags to keep canvases alive
  const axes = arr3(pipeline?.axesScene) ?? arr3(pipeline?.axes) ?? [1,1,1];
  const wallRho = fnum(pipeline?.wallWidth_rho) ?? fnum(pipeline?.wallWidth) ?? 0.05;
  withAdapterWrite(engine, () => { engine.updateUniforms?.({ axesScene: axes, wallWidth_rho: wallRho, physicsParityMode: metaPatch.physicsParityMode, ridgeMode: metaPatch.ridgeMode }); });

  // 4) Standby or zero-duty: send a strict zero-frame but keep parity/ridge
  if (isStandby || zeroDuty) {
    const zeroU: any = {
      // Do not push θ in standby; engine will derive zero from inputs
      metricOn: 0, useMetric: false,
      thetaSource: 'client', // clear any server latch
      physicsParityMode: metaPatch.physicsParityMode, ridgeMode: metaPatch.ridgeMode,
      onWindow: false, dutyUsed: 0,
      // enforce flattened grid in truth/standby
      yVariation: 0,
      displayGain: 1, exposure: 1, zeroStop: 1e-9, curvatureGainT: 0, curvatureBoostMax: 1, thetaDutyExponent: 1
    };
    try { withAdapterWrite(engine, () => { engine.updateUniforms?.(zeroU); }); } catch(e){}
    try { withAdapterWrite(engine, () => { engine.setLightCrossing?.(lcPayload); }); } catch(e){}
    return;
  }

  // 5) Active frame: assemble authoritative physics scalars (engine derives θ)
  const core = pickCore(pipeline);
  const sectorCount = LC.sectorCount ?? inty(pipeline?.sectorCount) ?? inty(pipeline?.totalSectors);

  // Soft guard: attempt to continue even if core appears missing; use fallbacks and send zero frame.
  let gammaGeoMissing = !Number.isFinite(pipeline?.gammaGeo);
  let qMissing = !Number.isFinite(pipeline?.qSpoilingFactor);
  // fallback attempts (natario / mechanical)
  if (gammaGeoMissing && Number.isFinite(pipeline?.natario?.gammaGeo)) {
    (pipeline as any).gammaGeo = pipeline.natario.gammaGeo;
    gammaGeoMissing = false;
  }
  if (qMissing && Number.isFinite(pipeline?.qMechanical)) {
    (pipeline as any).qSpoilingFactor = pipeline.qMechanical;
    qMissing = false;
  }
  const incompletePhysics = (gammaGeoMissing || qMissing);
  if (incompletePhysics) {
    try { gatedHeartbeat(engine, { __meta: true, note: 'incomplete-physics', __ts: Date.now() }); } catch {}
  }

  const uniforms: any = {
    // core physics (let engine compute θ from these)
    gammaGeo: core.gammaGeo, qSpoilingFactor: core.qSpoilingFactor, gammaVdB: core.gammaVdB,
    dutyUsed: fnum(dutyUsed, 0), sectorCount,
    physicsParityMode: metaPatch.physicsParityMode, ridgeMode: metaPatch.ridgeMode,
    onWindow: booly(pipeline?.onWindow) || booly(LC.onWindow),
    // Never send server θ here; engine derives locally. Also ensure source is client.
    thetaSource: 'client',
    // natario diagnostics (pass-through)
    thetaFromNatario: fnum(get(pipeline?.natario ?? {}, ['shiftVectorField','amplitude'])),
    thetaNet: fnum(get(pipeline?.natario ?? {}, ['shiftVectorField','netShiftAmplitude'])),
    thetaPlus: fnum(get(pipeline?.natario ?? {}, ['shiftVectorField','positivePhaseAmplitude'])),
    thetaMinus: fnum(get(pipeline?.natario ?? {}, ['shiftVectorField','negativePhaseAmplitude'])),
    // shift vector
    epsilonTilt: fnum(pipeline?.epsilonTilt ?? get(pipeline?.natario ?? {}, ['shiftVectorField','epsilonTilt'])),
    betaTiltVec: arrN(pipeline?.betaTiltVec ?? get(pipeline?.natario ?? {}, ['shiftVectorField','betaTiltVec']), 3),
    // enforce truth-mode flattened grid when REAL
    yVariation: isRealPane ? 0 : undefined,
  // cosmetics neutralized in truth mode
  displayGain: 1, exposure: 1, zeroStop: 1e-9, curvatureGainT: 0, curvatureBoostMax: 1, thetaDutyExponent: 1
  };

  // Hard-stop: never forward any precomputed θ; engine derives authoritatively
  try { delete (uniforms as any).thetaScale; } catch {}
  try { delete (uniforms as any).thetaScaleExpected; } catch {}

  // Inject Natário geometric shell parameters for client warp-engine deformation
  try {
    const hull = (pipeline as any)?.hull || {};
    const aHull = fnum(hull.a) ?? axes[0] ?? 1;
    const bHull = fnum(hull.b) ?? axes[1] ?? aHull;
    const cHull = fnum(hull.c) ?? axes[2] ?? aHull;
    const natSrc = (pipeline as any)?.natario || {};
    const beta0 = fnum(get(natSrc, ['shiftVectorField','amplitude'])) ?? 0;
    const wall = fnum(natSrc.wall) ?? 0.08;
    const centerArr = Array.isArray(natSrc.center) && natSrc.center.length === 3
      ? [ fnum(natSrc.center[0]) ?? 0, fnum(natSrc.center[1]) ?? -0.15, fnum(natSrc.center[2]) ?? 0 ]
      : [0, -0.15, 0];
    uniforms.natario = {
      enabled: !isStandby,
      a: aHull, b: bHull, c: cHull,
      wall,
      beta0,
      dispGain: 1.0,
      center: centerArr
    };
  } catch(_) { /* non-fatal */ }

  // Avoid re-sending identical physics parity/ridge if engine already has them
  try {
    const engU = engine?.uniforms || {};
    const nextParity = uniforms.physicsParityMode;
    const nextRidge = uniforms.ridgeMode;
    if (engU.u_physicsParityMode === nextParity || engU.physicsParityMode === nextParity) delete uniforms.physicsParityMode;
    if (engU.u_ridgeMode === nextRidge || engU.ridgeMode === nextRidge) delete uniforms.ridgeMode;
  } catch(e) { /* best-effort */ }

  // If physics incomplete, zero out sensitive amps but still drive meta/duty so canvas doesn't show error.
  if (incompletePhysics) {
    // Do not write θ; just clamp core scalars to safe defaults
    uniforms.gammaGeo = uniforms.gammaGeo ?? 0;
    uniforms.qSpoilingFactor = uniforms.qSpoilingFactor ?? 0;
    uniforms.gammaVdB = uniforms.gammaVdB ?? 1;
  }
  // Authoritative write via gate to preserve thetaSource enforcement
  try { gatedUpdateUniforms(engine, uniforms); } catch(e) {}
  try { withAdapterWrite(engine, () => { engine.setLightCrossing?.(lcPayload); }); } catch(e) {}
  try { engine.requestRewarp?.(); } catch(e) {}

  const result = { mode, __pipelineSeq: pipeSeq ?? null, __pipelineTs: pipeTs ?? null, dutyUsed: uniforms.dutyUsed ?? null, thetaScale: uniforms.thetaScale ?? null };
  if (ADAPTER_LOG && (import.meta as any)?.env?.DEV) { try { (window as any).__lastAdapter = result; console.log('[adapter] forwarded', result); } catch(e){} }
  return result;
}

// Provide a default export for consumers expecting default import
export default driveWarpFromPipeline;