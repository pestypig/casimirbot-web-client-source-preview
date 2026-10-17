/**
 * Warp Uniforms Gate - Single Source of Truth
 * Prevents renderer conflicts by gating all engine uniform writes
 */

import { DebounceConfig, createDebouncedFunction } from './usePollingSmart';
import { PROMOTED_WARP_PROFILE } from '@shared/warp-promoted-profile';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Track most-recent pipeline stamp per engine to avoid out-of-order frames
const LAST_PIPE_STAMP = new WeakMap<any, { ts?: number; seq?: number }>();
function newerThan(a?: {ts?:number;seq?:number}, b?: {ts?:number;seq?:number}) {
  if (!a) return true;                // nothing recorded → accept
  if (!b) return false;               // no incoming stamp → treat as stale
  if (Number.isFinite(b.seq) && Number.isFinite(a.seq)) return (b.seq as number) > (a.seq as number);
  if (Number.isFinite(b.ts)  && Number.isFinite(a.ts))  return (b.ts  as number) > (a.ts  as number);
  return true; // accept if incomparable
}

function extractStampFrom(p: Record<string, any>) {
  const ts = Number(p.__pipelineTs ?? p.__ts ?? p.timestamp ?? p.__version);
  const seq = Number(p.__pipelineSeq ?? p.seq ?? p.__seq);
  return {
    ts: Number.isFinite(ts) ? ts : undefined,
    seq: Number.isFinite(seq) ? seq : undefined,
  };
}

// Canonical uniform name mapping to prevent shader header duplication
// Match shader uniform names exactly (underscored)
const CANON = {
  physicsParityMode: 'u_physicsParityMode',
  ridgeMode:         'u_ridgeMode',
  epsilonTilt:       'u_epsilonTilt',
  betaTiltVec:       'u_betaTiltVec'
} as const;

// Create a debounced uniform update function per engine instance
const engineDebouncers = new WeakMap<any, ReturnType<typeof createDebouncedFunction>>();

function getDebouncedUpdate(engine: any): ReturnType<typeof createDebouncedFunction> {
  if (!engineDebouncers.has(engine)) {
    const config: DebounceConfig = {
      delay: 16, // ~60fps
      maxDelay: 100, // Force update after 100ms max
      immediate: false
    };

    const debouncedFn = createDebouncedFunction((uniforms: any) => {
      if (engine && typeof engine.updateUniforms === 'function') {
        engine.updateUniforms(uniforms);
      }
      if (engine && typeof engine.forceRedraw === 'function') {
        engine.forceRedraw();
      }
    }, config);

    engineDebouncers.set(engine, debouncedFn);
  }

  return engineDebouncers.get(engine)!;
}

  // Per-engine frame queue + parity/ridge debounce helpers ---------------------
  const PARITY_DEBOUNCE_MS = 32; // drop parity/ridge flips that bounce faster than this
  const lastParityFlip = new WeakMap<any, number>();
  const lastRidgeFlip  = new WeakMap<any, number>();
  const frameQueues = new WeakMap<any, Record<string, any>>();
  const rafIds = new WeakMap<any, number | any>();

  function flushFrameQueue(engine: any, source?: string, hasIncomingStamp?: boolean, incomingStamp?: {ts?:number;seq?:number}) {
    try {
      rafIds.delete(engine);
      const queued = frameQueues.get(engine);
      frameQueues.delete(engine);
      if (!queued) return;
      if (engine && typeof engine.updateUniforms === 'function') {
        engine.updateUniforms(queued);
      }
      if (engine && typeof engine.forceRedraw === 'function') {
        engine.forceRedraw();
      }
      if ((source === 'server' || source === 'legacy') && hasIncomingStamp && incomingStamp) {
        LAST_PIPE_STAMP.set(engine, incomingStamp);
      }
    } catch (err) {
      if (GATE_LOG) console.warn('[warp-gate] flushFrameQueue error', err);
    }
  }

// Physics keys we never allow from the client/viewers (adapter is the only writer)
const PHYSICS_KEYS = new Set([
  'thetaScale','thetaUniform','thetaScaleExpected',
  'gammaGeo','gammaVdB','gammaVanDenBroeck',
  'qSpoilingFactor','deltaAOverA','qSpoil','Qburst',
  'tauLC_ms','dwell_ms','burst_ms','phase','onWindow',
  'sectorIdx','sectorCount','sectors','split',
  'dutyEffectiveFR','dutyUsed','dutyCycle',
  'physicsParityMode','ridgeMode',
  'axesHull','axesMeters','axesScene','axesClip','wallWidth','wallWidth_m','wallWidth_rho',
  'metricMode','useMetric','u_useMetric','u_metric','metric','gSpatialDiag','gSpatialSym',
  'lapseN','shiftBeta','viewForward','g0i'
]);

export function withoutPhysics<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  const stripped: string[] = [];
  for (const k of Object.keys(out)) {
    if (PHYSICS_KEYS.has(k)) { stripped.push(k); delete out[k]; }
  }
  if (GATE_LOG && (import.meta as any)?.env?.DEV && stripped.length) {
    console.warn(`[warp-gate] stripped physics from non-adapter patch: ${stripped.join(', ')}`);
  }
  return out as T;
}

const COSMETIC_SOURCES = new Set([
  'client','visualizer','shell-outline','margin-hunter','preview',
  'REAL/cosmetic','SHOW/cosmetic'
]);

export type WarpUniforms = {
  // geometry
  hull?: { a:number; b:number; c:number };
  axesScene?: [number,number,number];
  axesClip?: [number,number,number];
  cameraZ?: number;
  lockFraming?: boolean;

  // duty / sectoring
  sectorCount: number;      // total sectors
  sectors: number;          // concurrent live sectors
  dutyCycle?: number;       // UI duty (0..1)
  dutyLocal?: number;       // local on-window duty (defaults to 0.01 if missing)
  dutyEffectiveFR: number;  // Ford–Roman ship-wide duty (0..1)

  // physics amps
  gammaGeo: number;

  // q (ΔA/A) aliases
  deltaAOverA?: number;
  qSpoilingFactor?: number;
  qSpoil?: number;

  // γ_VdB aliases
  gammaVanDenBroeck?: number;      // legacy/visual
  gammaVdB?: number;               // short alias
  gammaVanDenBroeck_vis?: number;  // explicit visual version
  gammaVanDenBroeck_mass?: number; // mass-calibrated (pass-through)

  // mech/cavity Q aliases (pass-through for consumers that need them)
  qMechanical?: number;
  qMech?: number;
  qCavity?: number;
  qCav?: number;

  // θ scaling
  thetaScale?: number;             // server-precomputed θ (authoritative if present)
  thetaScaleExpected?: number;     // server verification value (for audit)
  thetaDutyExponent?: number;      // optional duty exponent (default 1.0). Viz may set 0.5
  __vizDutySqrt?: boolean;         // legacy viz toggle → exponent 0.5

  // view
  colorMode?: 'theta'|'rho';
  viewAvg?: boolean;
  viewMassFraction?: number;       // 0..1
  physicsParityMode?: boolean;
  ridgeMode?: number;
  exposure?: number;
  zeroStop?: number;

  // provenance
  __src?: 'server'|'client'|'legacy';
  __version?: number;              // monotone

  // timing hints (pass-through)
  onWindowDisplay?: boolean;
  cyclesPerBurst?: number;
  dwell_ms?: number;
  tauLC_ms?: number;

  [key: string]: any;              // allow other engine-specific uniforms
};

let lastVersion = 0;
let lastSrc: string | undefined;

const EPS = 1e-12;
const N = (x:any, d:number) => (Number.isFinite(+x) ? +x : d);
const POS = (x:any, d:number) => Math.max(d, N(x, d));

// Global hard lock: when true, ONLY the adapter may write to engines.
// Blocks all viewer "cosmetics" and any non-adapter patches.
export const PIPELINE_LOCK = true;
// NEW: Physics-truth mode — enforce neutral visuals and drop cosmetic writes.
export const PHYSICS_TRUTH_MODE = true;
// Gate logging (flip to true for local debugging)
const GATE_LOG = false as const;

// Keys that only affect appearance (never physics)
const COSMETIC_KEYS = new Set([
  'displayGain','exposure','zeroStop','curvatureGainT','curvatureBoostMax','userGain',
  'colorMode','toneMap','brightness','contrast','saturation','gamma',
  // NOTE: viewAvg is operational (affects θ treatment), not cosmetic
  'thetaDutyExponent','__vizDutySqrt'
]);

// Essential keys that should always pass through for operational modes
const ESSENTIAL_KEYS = new Set([
  'mode','currentMode','hullAxes','wallWidth','axesClip','cameraZ','lockFraming',
  'dutyEffectiveFR','lightCrossing','sectors','sectorCount','viewAvg',
  'thetaSource' // allow explicit client override of server latch
]);

// Values that keep visuals neutral and linear
const NEUTRAL_COSMETICS = {
  displayGain: 1,
  exposure: 1,
  zeroStop: 1e-9,
  curvatureGainT: 0,
  curvatureBoostMax: 1,
  userGain: 1,
  // viewAvg: (leave unchanged; adapter/engine decide)
  thetaDutyExponent: 1,
  __vizDutySqrt: false,
} as const;

export function applyToEngine(
  engine: { updateUniforms: (u: any) => void },
  uniforms: WarpUniforms
) {
  // --- 1) Normalize aliases --------------------------------------------------
  const u: any = { ...uniforms };

  // γ_VdB aliases ↔ mirror both ways
  if (typeof u.gammaVanDenBroeck === 'number' && typeof u.gammaVdB !== 'number') {
    u.gammaVdB = u.gammaVanDenBroeck;
  }
  if (typeof u.gammaVdB === 'number' && typeof u.gammaVanDenBroeck !== 'number') {
    u.gammaVanDenBroeck = u.gammaVdB;
  }
  if (typeof u.gammaVanDenBroeck_vis !== 'number') {
    u.gammaVanDenBroeck_vis = (typeof u.gammaVdB === 'number' ? u.gammaVdB : u.gammaVanDenBroeck);
  }

  // q (ΔA/A) aliases ↔ mirror
  const qCanon = POS(u.deltaAOverA ?? u.qSpoilingFactor ?? u.qSpoil, 1);
  u.deltaAOverA     = qCanon;
  u.qSpoilingFactor = qCanon;
  u.qSpoil          = qCanon;

  // qMechanical / qMech aliases ↔ mirror (pass-through; not used here but useful to consumers)
  const qMechCanon = N(u.qMechanical ?? u.qMech, NaN);
  if (Number.isFinite(qMechCanon)) {
    u.qMechanical = qMechCanon;
    u.qMech = qMechCanon;
  }

  // qCavity / qCav aliases ↔ mirror (pass-through)
  const qCavCanon = N(u.qCavity ?? u.qCav, NaN);
  if (Number.isFinite(qCavCanon)) {
    u.qCavity = qCavCanon;
    u.qCav = qCavCanon;
  }

  // --- 2) Version / source gate --------------------------------------------
  const v = N(u.__version, Date.now());
  const src = u.__src || 'legacy';

  if (src === 'server') {
    if (v >= lastVersion) {
      lastVersion = v;
      lastSrc = src;
    } else {
      if (GATE_LOG) console.warn('[warp:gating] drop older server uniforms v=', v, 'last=', lastVersion);
      return;
    }
  } else if (lastSrc === 'server' && src === 'legacy') {
    if (GATE_LOG) console.warn('[warp:gating] blocked legacy uniforms (server canonical active)');
    return;
  } else if (v < lastVersion) {
    if (GATE_LOG) console.warn('[warp:gating] drop older uniforms from', src, 'v=', v, 'last=', lastVersion);
    return;
  } else {
    lastVersion = v;
    lastSrc = src;
  }

  // --- 3) Compute canonical θ ----------------------------------------------
  const gammaGeo = POS(u.gammaGeo, PROMOTED_WARP_PROFILE.gammaGeo);
  const q = POS(u.qSpoilingFactor, PROMOTED_WARP_PROFILE.qSpoilingFactor);

  // Use the visual γ_VdB for geometry amplitude to match audits/expectations
  const gammaVdB_vis = POS(u.gammaVanDenBroeck_vis ?? u.gammaVdB ?? u.gammaVanDenBroeck, 1);

  // Sectors / Duties
  // Allow sectorsTotal / sectorsLive to be zero (don't force a 1-floor here).
  const sectorsTotal = N(u.sectorCount, PROMOTED_WARP_PROFILE.sectorCount);
  const sectorsLive  = Number.isFinite(u.sectors) ? Math.max(0, Math.min(sectorsTotal, N(u.sectors, 0))) : N(u.sectors, 1);

  // Local duty for provenance (UI/local) — clamp to [0,1] but don't force a small positive floor.
  const dutyLocal = Math.max(0, Math.min(1, N(u.dutyLocal ?? u.dutyCycle, 0)));

  // Ford–Roman ship-wide duty: authoritative if provided, else derive from local & sectoring.
  // Do NOT apply an epsilon floor here; keep exact zeros if provided. Clamp to [0,1].
  let dutyFR = (u.dutyEffectiveFR ?? (sectorsTotal > 0 ? (dutyLocal * (sectorsLive / sectorsTotal)) : 0));
  dutyFR = Math.max(0, Math.min(1, Number.isFinite(+dutyFR) ? +dutyFR : 0));

  // If caller explicitly indicates standby mode, or the authoritative field is exactly 0,
  // ensure dutyFR is zero (defensive but preserves literal zeros from server).
  const isStandby = (u.mode === 'standby' || u.__mode === 'standby');
  if (isStandby || (u.dutyEffectiveFR === 0)) dutyFR = 0;

  // Duty exponent (physics-true by default):
  // - explicit thetaDutyExponent overrides
  // - optional viz-only sqrt via __vizDutySqrt
  const dutyExp = Number.isFinite(+u.thetaDutyExponent)
    ? +u.thetaDutyExponent
    : 1.0;

  // Fallback chain matches backend physics by default (exp=1). Viz may compress range with exp=0.5.
  const thetaFromChain = Math.pow(gammaGeo, 3) * q * gammaVdB_vis * Math.pow(dutyFR, dutyExp);
  // Visual-only θ (for optional range compression in viewers/legends)
  const thetaVisual    = Math.pow(gammaGeo, 3) * q * gammaVdB_vis * Math.pow(dutyFR, (u.__vizDutySqrt ? 0.5 : dutyExp));

  // If server provided a θ, it wins; otherwise use chain
  const thetaUsed =
    (u.thetaScale != null && Number.isFinite(+u.thetaScale))
      ? +u.thetaScale
      : thetaFromChain;

  // Optional audit vs expected
  if (Number.isFinite(+u.thetaScaleExpected) && Number.isFinite(+thetaUsed)) {
    const exp = +u.thetaScaleExpected;
    const rel = Math.abs(thetaUsed - exp) / Math.max(EPS, Math.abs(exp));
    if (rel > 0.10) {
      console.warn('[warp:gating] θ mismatch vs expected (>|10%|): used=', thetaUsed, 'expected=', exp, 'rel=', (rel*100).toFixed(1)+'%');
    }
  }

  // --- 4) Display/fit helpers ----------------------------------------------
  // Scientific build: no display cosmetics; viewers shouldn’t receive them from the gate.

  // Ridge mode: respect caller; else infer from parity (REAL→0, SHOW→1)
  let ridgeMode = u.ridgeMode;
  if (ridgeMode == null && typeof u.physicsParityMode === 'boolean') {
    ridgeMode = u.physicsParityMode ? 0 : 1;
  }

  // axesClip → derive from axesClip | axesScene | hull
  let axesClip: [number,number,number] | undefined = u.axesClip;
  if (!axesClip) {
    if (Array.isArray(u.axesScene) && u.axesScene.length === 3) {
      axesClip = [
        Math.abs(Number.isFinite(u.axesScene[0]) ? u.axesScene[0] : 0),
        Math.abs(Number.isFinite(u.axesScene[1]) ? u.axesScene[1] : 0),
        Math.abs(Number.isFinite(u.axesScene[2]) ? u.axesScene[2] : 0)
      ];
    } else if (u.hull && Number.isFinite(u.hull.a) && Number.isFinite(u.hull.b) && Number.isFinite(u.hull.c)) {
      axesClip = [ Math.abs(u.hull.a), Math.abs(u.hull.b), Math.abs(u.hull.c) ];
    }
  }

  // CameraZ helper (prevents "CameraZ unset" warnings) — only fill if missing
  let cameraZ = u.cameraZ as any;
  let lockFraming = u.lockFraming as any;
  if (!Number.isFinite(cameraZ) && axesClip) {
    const ax0 = Number.isFinite(axesClip[0]) ? axesClip[0] : 0;
    const ax1 = Number.isFinite(axesClip[1]) ? axesClip[1] : 0;
    const ax2 = Number.isFinite(axesClip[2]) ? axesClip[2] : 0;
    const R = Math.max(1e-6, Math.max(ax0, ax1, ax2));
    const fov = Math.PI / 3.2; // ~56°
    cameraZ = (1.8 * R) / Math.tan(fov * 0.5);
    lockFraming = true;
  }

  // --- 5) Final locked uniforms pushed to engine ----------------------------
  const locked: any = {
    ...u,
    // canonical outputs (don't override engine's authoritative theta)
    // thetaScale: thetaUsed, // REMOVED - let engine compute authoritatively
    dutyEffectiveFR: dutyFR,
    // audit-only (dev) — keep but silent by default
    __theta_from_gate: thetaFromChain,
    thetaVisual: thetaVisual,
    // mirrored aliases (so downstream can use any)
    gammaVdB: gammaVdB_vis,
    gammaVanDenBroeck: gammaVdB_vis,
    deltaAOverA: q,
    qSpoilingFactor: q,
    qSpoil: q,
    // view locks (no cosmetics)
    ridgeMode,
    // geometry / framing
    axesClip: axesClip ?? u.axesClip,
    cameraZ: Number.isFinite(cameraZ) ? cameraZ : u.cameraZ,
    lockFraming: (lockFraming ?? u.lockFraming ?? false),
  };

  try {
    if (GATE_LOG && (import.meta as any)?.env?.DEV) {
      (window as any).__warpEcho = {
        v, src, theta_used: thetaUsed, theta_dutyExp: dutyExp,
        terms: { gammaGeo, q, gammaVdB_vis, dutyFR, sectors: { total: sectorsTotal, live: sectorsLive } }
      };
    }
  } catch {}

   engine.updateUniforms(locked);
}

// Heartbeat/meta passthrough: always allow harmless meta packets through
// so that canvases don't get starved between mount and the first full frame.
export function gatedHeartbeat(engine: any, meta: any) {
  if (!engine || !meta) return;
  if (meta.__meta !== true) meta.__meta = true;
  try { engine.updateUniforms(meta); } catch {}
}

/**
 * Convenience wrapper for legacy updateUniforms calls
 * Automatically adds version and source tracking
 */
export function gatedUpdateUniforms(
  engine: any,
  patch: any,
  source: string = 'client'
) {
  if (!engine || !patch) return;

  // Heartbeats/meta are always allowed and never rewritten/stripped.
  // They carry no physics and keep canvases “alive” between full pushes.
  if (patch && typeof patch === 'object' && patch.__meta === true) {
    try { engine.updateUniforms?.(patch); } catch {}
    return;
  }

  // Hard stop: drop all non-adapter writes entirely, except essential keys
  if (PIPELINE_LOCK && source !== 'adapter') {
    // Allow essential keys to pass through even with pipeline lock
    const essentialPatch: Record<string, any> = {};
    let hasEssential = false;
    
    for (const key of Object.keys(patch)) {
      if (ESSENTIAL_KEYS.has(key)) {
        essentialPatch[key] = patch[key];
        hasEssential = true;
      }
    }
    
    if (!hasEssential) {
      if ((import.meta as any)?.env?.DEV && Object.keys(patch).length) {
        console.warn('[warp-gate] BLOCKED non-adapter patch (PIPELINE_LOCK)', {
          source,
          keys: Object.keys(patch)
        });
      }
      return;
    }
    
    // Continue with only essential keys
    Object.keys(patch).forEach(key => {
      if (!ESSENTIAL_KEYS.has(key)) delete patch[key];
    });
  }

  // In physics-truth mode, strip cosmetic keys from incoming patch early
  if (PHYSICS_TRUTH_MODE && patch && typeof patch === 'object') {
    for (const k of Object.keys(patch)) {
      if (COSMETIC_KEYS.has(k)) delete patch[k];
    }
  }

  try {
    const u: Record<string, any> = {...patch};

  const incomingStamp = extractStampFrom(u);
    const hasIncomingStamp = incomingStamp.ts != null || incomingStamp.seq != null;
    const last = LAST_PIPE_STAMP.get(engine);

    // If patch is from server/legacy and has a stamp, ensure it's newer than last accepted
    if ((source === 'server' || source === 'legacy') && hasIncomingStamp && !newerThan(last, incomingStamp)) {
      // older than already-accepted frame → ignore silently
      return;
    }

  // sanitize + rename to prevent shader header duplication
    if ('physicsParityMode' in u) u[CANON.physicsParityMode] = !!u.physicsParityMode;
    if ('ridgeMode' in u)         u[CANON.ridgeMode]         = (u.ridgeMode|0) ? 1 : 0;

    if ('epsilonTilt' in u)       u[CANON.epsilonTilt]       = Math.max(0, +u.epsilonTilt || 0);
    if ('betaTiltVec' in u && Array.isArray(u.betaTiltVec)) {
      const [x=0,y=0,z=0] = u.betaTiltVec.map(Number);
      const n = Math.hypot(x,y,z) || 1;
      u[CANON.betaTiltVec] = [x/n, y/n, z/n];
    }

    // Non-server writes must NOT carry a latched server θ
    if (source !== 'server') {
      // don't forward precomputed θ; engine is authoritative
      if ('thetaScale' in u) delete (u as any).thetaScale;
      if ('thetaScaleExpected' in u) delete (u as any).thetaScaleExpected;
      (u as any).thetaSource = 'client';
    }

    // If source isn't adapter, strip physics keys EXCEPT essentials
    if (source !== 'adapter') {
      for (const k of Object.keys(u)) {
        if (PHYSICS_KEYS.has(k) && !ESSENTIAL_KEYS.has(k)) {
          delete u[k];
        }
      }
    }

  // strip legacy keys so we never double-write engine params
  delete u.physicsParityMode; delete u.ridgeMode;
  delete u.epsilonTilt; delete u.betaTiltVec;

    // Enforce neutral cosmetics right before sending to engine when in physics-truth mode
    if (PHYSICS_TRUTH_MODE) {
      Object.assign(u, NEUTRAL_COSMETICS);
    }
    // --- parity/ridge debounce: drop bouncing flips -----------------------
    const now = Date.now();
    if ('physicsParityMode' in u || CANON.physicsParityMode in u) {
      const last = lastParityFlip.get(engine) || 0;
      const next = (u.physicsParityMode != null) ? (!!u.physicsParityMode ? 1 : 0) : (u[CANON.physicsParityMode] ? 1 : 0);
      if (now - last < PARITY_DEBOUNCE_MS) {
        // too fast → drop parity update
        // dropped bouncing parity update (silent)
        delete u.physicsParityMode; delete u[CANON.physicsParityMode];
      } else {
        lastParityFlip.set(engine, now);
      }
    }

    if ('ridgeMode' in u || CANON.ridgeMode in u) {
      const last = lastRidgeFlip.get(engine) || 0;
      if (now - last < PARITY_DEBOUNCE_MS) {
        // drop ridge flip silently
         delete u.ridgeMode; delete u[CANON.ridgeMode];
       } else {
         lastRidgeFlip.set(engine, now);
       }
     }

    // Enqueue into per-engine frame queue and schedule a single RAF flush
    const queued = frameQueues.get(engine) || {};
    Object.assign(queued, u);
    frameQueues.set(engine, queued);

    if (!rafIds.has(engine)) {
      const id = (typeof requestAnimationFrame !== 'undefined')
        ? requestAnimationFrame(() => flushFrameQueue(engine, source, hasIncomingStamp, incomingStamp))
        : setTimeout(() => flushFrameQueue(engine, source, hasIncomingStamp, incomingStamp), 16);
      rafIds.set(engine, id);
    }
  } catch (error) {
    if (GATE_LOG) console.warn(`[warp-uniforms-gate] Error updating uniforms from ${source}:`, error);
     // Fallback to direct update
     try {
       if (engine && typeof engine.updateUniforms === 'function') {
         engine.updateUniforms(patch);
       }
       if (engine && typeof engine.forceRedraw === 'function') {
         engine.forceRedraw();
       }
     } catch (fallbackError) {
      if (GATE_LOG) console.error(`[warp-uniforms-gate] Fallback update also failed:`, fallbackError);
     }
   }
}

/**
 * Reset gating state (for testing or debugging)
 */
export function resetGate() {
  lastVersion = 0;
  lastSrc = undefined;
}
