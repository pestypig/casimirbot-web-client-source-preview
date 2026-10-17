import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const C_LY_PER_HOUR = 1 / (365 * 24);

/**
 * Legacy local navigation visualization rate. The coefficients are tuned
 * display values, not measured speed, an NHM2 result, or route ETA authority.
 * Keep the calculation unchanged until the navigation runtime is audited.
 */
export function computeEffectiveLyPerHour(
  mode: string, duty=0, gammaGeo=0, q=0, zeta=0, tsRatio=0
) {
  const m = String(mode || "").toLowerCase();
  const canonical =
    m === "hover" ? "hover" :
    m === "cruise" ? "cruise" :
    m === "emergency" ? "emergency" :
    m === "standby" ? "standby" :
    m === "nearzero" || m === "near-zero" || m === "near_zero" ? "nearzero" :
    m === "taxi" ? "taxi" :
    "hover";

  const baseFrac: Record<string, number> = {
    hover:     0.001,
    nearzero:  0.0005,
    taxi:      0.0001,
    cruise:    0.010,
    emergency: 0.015,
    standby:   0
  };
  let v = (baseFrac[canonical] ?? 0) * C_LY_PER_HOUR;

  const g = Math.min(40, Math.max(10, gammaGeo || PROMOTED_WARP_PROFILE.gammaGeo));
  const qn = Math.log10(Math.max(1, q || PROMOTED_WARP_PROFILE.qCavity)) - 6;
  const dutyBoost = Math.max(0, duty || 0);
  const safety = clamp01(zeta / 0.84) * clamp01(tsRatio / 100);

  v *= (1 + 0.01*(g - 26))
     * (1 + 0.05*qn)
     * (0.5 + 0.5*dutyBoost)
     * (0.5 + 0.5*safety);
  const VMAX = 0.05 * C_LY_PER_HOUR;
  return Math.min(v, VMAX);
}
