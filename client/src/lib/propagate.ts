import type { LocalRestStar } from "@shared/physics";

/**
 * Linearly propagate heliocentric positions using the stored velocity vectors.
 * Intended for small time deltas where constant-velocity is acceptable.
 */
export function propagateHeliocentricPositions(stars: LocalRestStar[], epochMs: number): LocalRestStar[] {
  const out = new Array<LocalRestStar>(stars.length);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const dtSeconds = (epochMs - s.epochMs) / 1000;
    const v = s.vectors.helioVelocity ?? s.vectors.lsrVelocity;
    const p = s.vectors.heliocentric;
    out[i] = {
      ...s,
      vectors: {
        ...s.vectors,
        heliocentric: {
          x: p.x + v.vx * 1000 * dtSeconds,
          y: p.y + v.vy * 1000 * dtSeconds,
          z: p.z + v.vz * 1000 * dtSeconds,
          unit: "m",
        },
      },
      epochMs,
    };
  }
  return out;
}
