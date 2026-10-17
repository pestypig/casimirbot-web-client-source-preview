// warp-uniforms.ts
// Canonical normalization for warp renderer uniforms, with robust aliasing
// and physics-aware fallbacks so UI code can depend on consistent fields.
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

export type WarpUniforms = {
  // --- geometry (semi-axes in meters) -------------------------------------
  hull?: { a:number; b:number; c:number };
  axesScene?: [number,number,number];
  gridSpan?: number;
  wallWidth_m?: number;
  wallWidth_rho?: number;

  // --- sectoring & duties --------------------------------------------------
  sectorCount: number;     // total sectors
  sectors: number;         // concurrent sectors
  dutyCycle: number;       // UI duty (0..1)
  dutyLocal?: number;      // per-sector ON fraction (0..1)
  dutyEffectiveFR: number; // Ford–Roman ship-wide duty (0..1)

  // --- amplification chain -------------------------------------------------
  gammaGeo: number;        // γ_geo

  // γ_VdB aliases (visual amplitude version)
  gammaVdB?: number;
  gammaVanDenBroeck?: number;      // legacy alias
  gammaVanDenBroeck_vis?: number;  // explicit visual version
  gammaVanDenBroeck_mass?: number; // mass-calibrated version (pass-through if present)

  // q (ΔA/A) aliases
  deltaAOverA?: number;     // canonical symbol for q-spoiling factor
  qSpoilingFactor?: number; // legacy alias
  qSpoil?: number;          // short alias

  // mechanical/cavity Q or gains (optional but helpful to UI)
  qMech?: number;           // mechanical energy gain proxy used by UI
  qMechanical?: number;     // alias (server/state name)
  qCav?: number;            // cavity Q (short)
  qCavity?: number;         // alias (server/state name)

  // expected θ scale (renderer convenience). If server omits it, we derive.
  thetaScale?: number;

  // --- renderer/display helpers -------------------------------------------
  viewAvg?: boolean;
  viewMassFraction?: number;             // defaults to sectors/sectorCount
  colorMode?: 'theta'|'rho';

  currentMode?: 'hover'|'cruise'|'emergency'|'standby';

  // Optional pass-through for UI gating (not used by shader math, but handy)
  onWindowDisplay?: boolean;
  cyclesPerBurst?: number;
  dwell_ms?: number;
  tauLC_ms?: number;

  // --- interior shift (Purple) ---------------------------------------------
  epsilonTilt?: number;                       // dimensionless, ~1e-16..1e-7
  betaTiltVec?: [number,number,number];       // arbitrary vec (we'll normalize)
  // optional aliases (if you want)
  betaTiltVecN?: [number,number,number];      // normalized copy

  // optional provenance
  __src?: 'server'|'client'|'legacy';
  __version?: number;
};

const EPS = 1e-12;
const N = (x:any,d:any)=>Number.isFinite(+x)?+x:d;
const clamp = (v:number, lo:number, hi:number) => Math.min(hi, Math.max(lo, v));
const DEFAULT_GAMMA_VDB = PROMOTED_WARP_PROFILE.gammaVanDenBroeck;

// helpers for Purple shift vector processing
const V3 = (a:any)=>Array.isArray(a)&&a.length===3 ? [+a[0],+a[1],+a[2]] : undefined;
const norm3 = (v:[number,number,number])=>{
  const L = Math.hypot(v[0],v[1],v[2]) || 1;
  return [v[0]/L, v[1]/L, v[2]/L];
};

// Helper to compute Ford-Roman duty consistently across client and server
const computeFordRomanDuty = (burstLocal: number, live: number, total: number, isStandby: boolean) =>
  isStandby ? 0 : Math.max(0, Math.min(1, burstLocal * (Math.max(1, live) / Math.max(1, total))));

export function normalizeWU(raw:any): WarpUniforms {
  if (!raw) {
    // Conservative defaults consistent with backend fallbacks
    const sectorCount = PROMOTED_WARP_PROFILE.sectorCount;
    const sectors = PROMOTED_WARP_PROFILE.concurrentSectors;
    const dutyLocal = PROMOTED_WARP_PROFILE.dutyCycle;
    const dutyEffectiveFR = computeFordRomanDuty(dutyLocal, sectors, sectorCount, false);
    const gammaGeo = PROMOTED_WARP_PROFILE.gammaGeo;
    const gammaVdB = DEFAULT_GAMMA_VDB; // telemetry-aligned fallback baseline
    const q = PROMOTED_WARP_PROFILE.qSpoilingFactor;
    const base: WarpUniforms = {
      sectorCount,
      sectors,
      dutyCycle: dutyLocal,
      dutyLocal,
      dutyEffectiveFR,
      gammaGeo,
      gammaVdB,
      gammaVanDenBroeck: gammaVdB,
      gammaVanDenBroeck_vis: gammaVdB,
      deltaAOverA: q,
      qSpoilingFactor: q,
      qSpoil: q,
      qMech: 1,
      qCav: PROMOTED_WARP_PROFILE.qCavity,
      viewAvg: true,
      viewMassFraction: sectors / sectorCount,
      colorMode: 'theta',
      thetaScale: Math.sqrt(dutyEffectiveFR) * Math.pow(gammaGeo,3) * q * gammaVdB,
      __src: 'legacy',
      __version: 1
    };
    return base;
  }

  // --- sectors & duties -----------------------------------------------------
  const sectorCount = Math.max(1, N(raw.sectorCount, PROMOTED_WARP_PROFILE.sectorCount));
  const sectors = Math.max(
    1,
    Math.min(sectorCount, N(raw.sectors, PROMOTED_WARP_PROFILE.concurrentSectors)),
  );

  // UI duty (what users see/adjust)
  const dutyCycle = clamp(N(raw.dutyCycle, PROMOTED_WARP_PROFILE.dutyCycle), EPS, 1);

  // Local burst fraction (used in FR derivation)
  const dutyLocal   = clamp(N(raw.dutyLocal, dutyCycle), EPS, 1);

  // Ford–Roman duty (authoritative if provided, else derive)
  const dutyEffectiveFR = clamp(N(
    raw.dutyEffectiveFR,
    computeFordRomanDuty(dutyLocal, sectors, sectorCount, false)
  ), EPS, 1);

  // --- γ_geo ----------------------------------------------------------------
  const gammaGeo = Math.max(1, N(raw.gammaGeo, PROMOTED_WARP_PROFILE.gammaGeo));

  // --- q (ΔA/A) with symmetric aliases -------------------------------------
  const q_canonical = clamp(
    N(raw.deltaAOverA ?? raw.qSpoilingFactor ?? raw.qSpoil, PROMOTED_WARP_PROFILE.qSpoilingFactor),
    EPS, 1e6
  );
  // reflect back to all aliases so downstream code can rely on any name
  const deltaAOverA     = q_canonical;
  const qSpoilingFactor = q_canonical;
  const qSpoil          = q_canonical;

  // --- γ_VdB visual with symmetric aliases ---------------------------------
  const gammaV_vis_src = N(
    raw.gammaVanDenBroeck_mass ??
      raw.gammaVanDenBroeck_vis ??
      raw.gammaVdB ??
      raw.gammaVanDenBroeck,
    DEFAULT_GAMMA_VDB // telemetry-aligned fallback baseline
  );
  const gammaVdB              = Math.max(1, gammaV_vis_src);
  const gammaVanDenBroeck     = gammaVdB; // keep legacy alias in sync
  const gammaVanDenBroeck_vis = gammaVdB;

  // Mass-calibrated (pass-through if present; do not invent)
  const gammaVanDenBroeck_mass =
    Number.isFinite(+raw.gammaVanDenBroeck_mass) ? +raw.gammaVanDenBroeck_mass : undefined;

  // --- mechanical & cavity Q/gains -----------------------------------------
  const qMech        = clamp(N(raw.qMech ?? raw.qMechanical, 1), EPS, 1e12);
  const qCav = clamp(N(raw.qCav ?? raw.qCavity, PROMOTED_WARP_PROFILE.qCavity), 1, 1e12);

  // --- renderer helpers -----------------------------------------------------
  const viewAvg = typeof raw.viewAvg === 'boolean' ? raw.viewAvg : true;
  const viewMassFraction = clamp(N(raw.viewMassFraction, sectors / sectorCount), 0, 1);
  const colorMode: 'theta'|'rho' = (raw.colorMode === 'rho' ? 'rho' : 'theta');

  // --- expected θ scale (derive if missing) ---------------------------------
  const thetaScale = Number.isFinite(+raw.thetaScale)
    ? +raw.thetaScale
    : (Math.sqrt(dutyEffectiveFR) * Math.pow(gammaGeo,3) * q_canonical * gammaVdB);

  // --- Purple shift normalization ------------------------------------------
  const epsilonTilt = Number.isFinite(+raw.epsilonTilt) ? Math.max(0, +raw.epsilonTilt) : undefined;
  let betaTiltVec: [number,number,number] | undefined;
  if (Array.isArray(raw.betaTiltVec) && raw.betaTiltVec.length === 3) {
    const [x,y,z] = raw.betaTiltVec.map(Number);
    const n = Math.hypot(x,y,z) || 1;
    betaTiltVec = [x/n, y/n, z/n];
  }

  // --- optional time-window gating passthrough ------------------------------
  const onWindowDisplay = !!raw.onWindowDisplay;
  const cyclesPerBurst  = Number.isFinite(+raw.cyclesPerBurst) ? +raw.cyclesPerBurst : undefined;
  const dwell_ms        = Number.isFinite(+raw.dwell_ms) ? +raw.dwell_ms : undefined;
  const tauLC_ms        = Number.isFinite(+raw.tauLC_ms) ? +raw.tauLC_ms : undefined;

  const wu: WarpUniforms = {
    ...raw,

    // normalized numerics
    sectorCount,
    sectors,
    dutyCycle,
    dutyLocal,
    dutyEffectiveFR,
    gammaGeo,

    // q aliases normalized & mirrored
    deltaAOverA,
    qSpoilingFactor,
    qSpoil,

    // γ_VdB aliases normalized & mirrored
    gammaVdB,
    gammaVanDenBroeck,
    gammaVanDenBroeck_vis,
    gammaVanDenBroeck_mass,

    // Q/gain helpers
    qMech,
    qMechanical: qMech,
    qCav,
    qCavity: qCav,

    // derived θ
    thetaScale,

    // renderer helpers
    viewAvg,
    viewMassFraction,
    colorMode,

    // Purple shift parameters
    epsilonTilt,
    betaTiltVec,

    // gating passthrough
    onWindowDisplay,
    cyclesPerBurst,
    dwell_ms,
    tauLC_ms,

    __src: raw.__src ?? 'server',
    __version: Number.isFinite(+raw.__version) ? +raw.__version : 1,
  };

  return wu;
}

// Pane builders (only pane-specific spice added here)
export function buildREAL(wu: WarpUniforms) {
  return {
    ...wu,
    physicsParityMode: true,
    ridgeMode: 0,
    viewAvg: true,
    colorMode: wu.colorMode ?? 'theta',
    exposure: 3.5,
    zeroStop: 1e-6,
    userGain: 1,
    displayGain: 1,
    epsilonTilt: wu.epsilonTilt ?? 0,
    betaTiltVec: wu.betaTiltVec ?? [0,-1,0],
  };
}

export function buildSHOW(wu: WarpUniforms, opts?: { T?:number; boost?:number; userGain?:number }) {
  const T = clamp(N(opts?.T, 0.70), 0, 1);
  const boost = Math.max(1, N(opts?.boost, 40));
  return {
    ...wu,
    physicsParityMode: false,
    ridgeMode: 1,
    viewAvg: true,
    colorMode: wu.colorMode ?? 'theta',
    exposure: 6,
    zeroStop: 1e-7,
    curvatureGainT: T,
    curvatureBoostMax: boost,
    userGain: Math.max(1, N(opts?.userGain, 2)),
    epsilonTilt: wu.epsilonTilt ?? 0,
    betaTiltVec: wu.betaTiltVec ?? [0,-1,0],
  };
}
