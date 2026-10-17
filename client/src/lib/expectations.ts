// expectations.ts
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

// ───────────────── Types ─────────────────
export type ThetaExpectedArgs = {
  gammaGeo?: number;
  // q aliases (renderer uses ΔA/A as qSpoilingFactor)
  q?: number;
  deltaAOverA?: number;
  qSpoilingFactor?: number;

  // γ_VdB (visual) aliases
  gammaVdB?: number;
  gammaVanDenBroeck?: number;
  gammaVanDenBroeck_vis?: number;

  // duty inputs
  dFR?: number;                 // ship-wide Ford–Roman duty (authoritative if present)
  dutyEffectiveFR?: number;     // alias
  dutyLocal?: number;           // local burst fraction
  concurrent?: number;          // S_live
  total?: number;               // S_total
};

export type ThetaUsedArgs = {
  // same duty inputs as above (any combination allowed)
  dFR?: number;
  dutyEffectiveFR?: number;
  dutyLocal?: number;
  concurrent?: number;
  total?: number;

  // view handling
  viewFraction?: number;        // defaults to concurrent/total when averaging
  viewAveraging?: boolean;      // default true
};

// ──────────────── Helpers ───────────────
const EPS = 1e-12;

export function resolveDutyFR({
  dFR,
  dutyEffectiveFR,
  dutyLocal = PROMOTED_WARP_PROFILE.dutyCycle,
  concurrent = 1,
  total = PROMOTED_WARP_PROFILE.sectorCount,
}: Partial<ThetaExpectedArgs>): number {
  const fr = Number.isFinite(dFR as number)
    ? (dFR as number)
    : Number.isFinite(dutyEffectiveFR as number)
      ? (dutyEffectiveFR as number)
      : dutyLocal * (concurrent / Math.max(1, total));
  // allow exact 0 in standby for perfect audit equality
  return Math.max(0, Math.min(1, Number(fr) || 0));
}

// ─────────────── Expected θ (engine law) ───────────────
// Matches engine θ-scale: θ = γ_geo^3 · q · γ_VdB_vis · √d_FR
export function thetaScaleExpected(args: ThetaExpectedArgs = {}) {
  const gammaGeo = Math.max(1, Number(args.gammaGeo ?? PROMOTED_WARP_PROFILE.gammaGeo));

  // q (ΔA/A) with aliases
  const qRaw = Number(args.q ?? args.deltaAOverA ?? args.qSpoilingFactor ?? 1);
  const q = Math.max(EPS, qRaw);

  // visual γ_VdB with aliases; keep ≥1 so it never damps visuals
  const gammaV = Number(
    args.gammaVanDenBroeck_vis ??
      args.gammaVdB ??
      args.gammaVanDenBroeck ??
      PROMOTED_WARP_PROFILE.gammaVanDenBroeck,
  );
  const gammaV_vis = Math.max(1, gammaV);

  const dFR = resolveDutyFR(args);

  // Use linear duty to match server canonical calculation: θ = γ³ · q · γ_VdB · duty_FR
  return Math.pow(gammaGeo, 3) * q * gammaV_vis * dFR;
}

// ─────────────── Used θ in renderer ───────────────
// Convert expected (which now uses linear duty like server) into what the renderer actually uses.
export function thetaScaleUsed(expected: number, opts: ThetaUsedArgs = {}) {
  const concurrent = Math.max(1, Number(opts.concurrent ?? 1));
  const total = Math.max(1, Number(opts.total ?? PROMOTED_WARP_PROFILE.sectorCount));
  const dutyLocal = Math.max(EPS, Number(opts.dutyLocal ?? PROMOTED_WARP_PROFILE.dutyCycle));

  const dFR = resolveDutyFR({
    dFR: opts.dFR,
    dutyEffectiveFR: opts.dutyEffectiveFR,
    dutyLocal,
    concurrent,
    total
  });

  // If averaging ON, the engine applies no further duty scaling—only the view-mass fraction matters.
  // Default viewFraction to the pane’s visible mass fraction (S_live / S_total).
  const viewFractionDefault = concurrent / total;
  const viewFraction = Math.max(0, Math.min(1, Number(opts.viewFraction ?? viewFractionDefault)));
  const viewAveraging = (opts.viewAveraging ?? true) ? true : false;

  if (viewAveraging) {
    // With averaging: apply view fraction to expected (both use linear duty)
    return expected * viewFraction;
  }
  
  // No averaging: both expected and engine use linear duty, so direct comparison
  return expected;
}
