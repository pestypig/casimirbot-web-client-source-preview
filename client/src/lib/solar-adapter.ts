// client/src/lib/solar-adapter.ts
import * as Astronomy from "astronomy-engine";
import { Body } from "./galaxy-schema";

export type SolarBody =
  | "Sun"
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune";

const NAMES: SolarBody[] = [
  "Sun",
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
];

export type SolarPoint = {
  id: string;
  name: string;
  x_au: number;
  y_au: number;
  kind: "star" | "planet" | "station";
};

export function computeSolarXY(date = new Date()): SolarPoint[] {
  // heliocentric XY (AU), flattened to 2D for the map
  return NAMES.map((name) => {
    if (name === "Sun") {
      return {
        id: "SUN",
        name: "Sun",
        x_au: 0,
        y_au: 0,
        kind: "star" as const,
      };
    }

    try {
      const vec = Astronomy.HelioVector(name as any, date); // x,y,z in AU
      return {
        id: name.toUpperCase(),
        name,
        x_au: vec.x,
        y_au: vec.y,
        kind: "planet" as const,
      };
    } catch (error) {
      console.warn(`Failed to compute position for ${name}:`, error);
      return {
        id: name.toUpperCase(),
        name,
        x_au: 0,
        y_au: 0,
        kind: "planet" as const,
      };
    }
  });
}

/* -------------------------------------------------------------------------
   Barycenter background helpers (for subtle live polyline in Mission Planner)
   ------------------------------------------------------------------------- */

// --- NEW: approximate Sun barycentric “wobble” polyline (AU) ---
/**
 * Returns a background polyline (in AU) representing the Sun's motion about the
 * solar-system barycenter. Uses a mass-weighted sum of the giant planets'
 * heliocentric vectors (Jupiter/Saturn/Uranus/Neptune) for robustness and speed.
 *
 * NOTE: This is visualization-grade (smooth “wobble” path), not an exact ephemeris.
 */
export function computeBarycenterPolylineAU(options?: {
  daysPast?: number; // span before "now" (default 3650 ~ 10y)
  daysFuture?: number; // span after "now" (default 3650 ~ 10y)
  stepDays?: number; // sampling step (default 20d)
  fade?: boolean; // add alpha fade toward ends (default true)
}): Array<{ x_au: number; y_au: number; alpha?: number }> {
  const now = new Date();
  const daysPast = Math.max(1, Math.floor(options?.daysPast ?? 3650));
  const daysFut = Math.max(1, Math.floor(options?.daysFuture ?? 3650));
  const step = Math.max(1, Math.floor(options?.stepDays ?? 20));
  const doFade = options?.fade !== false;

  // Planet-to-Sun mass ratios (approx). Contribution ~ (m_i/M_sun) * r_i.
  const MU = {
    JUPITER: 1 / 1047.3486,
    SATURN: 1 / 3497.898,
    URANUS: 1 / 22962.0,
    NEPTUNE: 1 / 19412.0,
  } as const;

  const samples: Array<{ x_au: number; y_au: number; alpha?: number }> = [];
  const totalSteps = Math.floor((daysPast + daysFut) / step) + 1;

  let k = 0;
  for (let d = -daysPast; d <= daysFut; d += step) {
    const t = new Date(now.getTime() + d * 86400000);

    // Helio vectors (AU)
    const vJ = Astronomy.HelioVector("Jupiter" as any, t);
    const vS = Astronomy.HelioVector("Saturn" as any, t);
    const vU = Astronomy.HelioVector("Uranus" as any, t);
    const vN = Astronomy.HelioVector("Neptune" as any, t);

    // Sun offset from barycenter ≈ -Σ mu_i * r_i (take XY plane)
    const x = -(
      MU.JUPITER * vJ.x +
      MU.SATURN * vS.x +
      MU.URANUS * vU.x +
      MU.NEPTUNE * vN.x
    );
    const y = -(
      MU.JUPITER * vJ.y +
      MU.SATURN * vS.y +
      MU.URANUS * vU.y +
      MU.NEPTUNE * vN.y
    );

    let alpha: number | undefined;
    if (doFade) {
      // cosine fade to 0 toward the ends, peak in the middle
      const u = k / Math.max(1, totalSteps - 1); // 0..1
      alpha = 0.15 + 0.85 * Math.sin(Math.PI * u) ** 2; // 0.15..1.0
    }

    samples.push({ x_au: x, y_au: y, alpha });
    k++;
  }

  return samples;
}

export type BarySample = {
  /** Barycentric XY in AU (flattened to 2D, same frame as HelioVector XY usage) */
  x_au: number;
  y_au: number;
  /** Timestamp of this sample (UTC) */
  t: Date;
  /** Planar curvature κ ~ |x'y''-y'x''|/(x'^2+y'^2)^(3/2) in 1/AU (approximate) */
  kappa: number;
  /** Suggested opacity for drawing (0..1), derived from normalized curvature */
  alpha: number;
};

/**
 * Returns the Sun's barycentric XY in AU at a given date.
 * Tries Astronomy.BaryState if available; otherwise falls back to heliocentric
 * mass-weighted approximation using giant planets.
 */
export function computeSunBaryXY(
  date = new Date()
): { x_au: number; y_au: number } {
  try {
    const hasBary = typeof (Astronomy as any).BaryState === "function";
    if (hasBary) {
      const st = (Astronomy as any).BaryState("Sun", date); // StateVector: x,y,z,vx,vy,vz
      return { x_au: st.x, y_au: st.y };
    }
  } catch (e) {
    // fall through to approximation
  }

  // Approximate via mass-weighted giant planets at this date
  const MU = {
    JUPITER: 1 / 1047.3486,
    SATURN: 1 / 3497.898,
    URANUS: 1 / 22962.0,
    NEPTUNE: 1 / 19412.0,
  } as const;

  try {
    const vJ = Astronomy.HelioVector("Jupiter" as any, date);
    const vS = Astronomy.HelioVector("Saturn" as any, date);
    const vU = Astronomy.HelioVector("Uranus" as any, date);
    const vN = Astronomy.HelioVector("Neptune" as any, date);

    const x =
      -(
        MU.JUPITER * vJ.x +
        MU.SATURN * vS.x +
        MU.URANUS * vU.x +
        MU.NEPTUNE * vN.x
      ) || 0;
    const y =
      -(
        MU.JUPITER * vJ.y +
        MU.SATURN * vS.y +
        MU.URANUS * vU.y +
        MU.NEPTUNE * vN.y
      ) || 0;

    return { x_au: x, y_au: y };
  } catch {
    return { x_au: 0, y_au: 0 };
  }
}

/**
 * Samples the Sun's barycentric path around a center date and estimates
 * per-vertex curvature to drive a subtle opacity ramp for a background polyline.
 *
 * Defaults:
 *  - spanYears: 22 years (captures Jupiter (~11.86y) + J/S synodic (~19.86y) structure)
 *  - stepDays: 10 days (smooth path, light compute)
 */
export function computeBarycenterTrail(opts?: {
  centerDate?: Date;
  spanYears?: number;
  stepDays?: number;
}): BarySample[] {
  const center = opts?.centerDate ?? new Date();
  const spanYears = Math.max(1, Math.floor(opts?.spanYears ?? 22));
  const stepDays = Math.max(1, Math.floor(opts?.stepDays ?? 10));

  const msPerDay = 86400000;
  const halfDays = Math.round((spanYears * 365.25) / 2);
  const start = new Date(center.getTime() - halfDays * msPerDay);
  const totalSteps = Math.floor((2 * halfDays) / stepDays) + 1;

  // 1) sample XY
  const pts: { x: number; y: number; t: Date }[] = [];
  for (let i = 0; i < totalSteps; i++) {
    const t = new Date(start.getTime() + i * stepDays * msPerDay);
    const { x_au, y_au } = computeSunBaryXY(t);
    pts.push({ x: x_au, y: y_au, t });
  }

  // 2) finite-difference curvature (central differences)
  const h = stepDays; // parameter step (days) — cancels out in normalization
  const kap: number[] = new Array(pts.length).fill(0);

  for (let i = 1; i < pts.length - 1; i++) {
    const xm = pts[i - 1].x,
      x0 = pts[i].x,
      xp = pts[i + 1].x;
    const ym = pts[i - 1].y,
      y0 = pts[i].y,
      yp = pts[i + 1].y;

    const x1 = (xp - xm) / (2 * h);
    const y1 = (yp - ym) / (2 * h);
    const x2 = (xp - 2 * x0 + xm) / (h * h);
    const y2 = (yp - 2 * y0 + ym) / (h * h);

    const num = Math.abs(x1 * y2 - y1 * x2);
    const den = Math.pow(x1 * x1 + y1 * y1, 1.5) + 1e-16; // avoid 0
    kap[i] = num / den; // ~1/AU
  }
  // endpoints from neighbors
  kap[0] = kap[1];
  kap[kap.length - 1] = kap[kap.length - 2];

  // 3) normalize curvature → alpha in [0.18, 0.85] (use sqrt for softer rolloff)
  let kMin = Infinity,
    kMax = -Infinity;
  for (const k of kap) {
    if (Number.isFinite(k)) {
      if (k < kMin) kMin = k;
      if (k > kMax) kMax = k;
    }
  }
  if (!Number.isFinite(kMin) || !Number.isFinite(kMax) || kMax <= kMin) {
    kMin = 0;
    kMax = 1;
  }
  const toAlpha = (k: number) => {
    const u = Math.max(0, Math.min(1, (k - kMin) / (kMax - kMin)));
    const eased = Math.sqrt(u); // emphasize higher curvature subtly
    return 0.18 + 0.67 * eased; // 0.18 .. 0.85
  };

  // 4) assemble samples
  const out: BarySample[] = pts.map((p, i) => ({
    x_au: p.x,
    y_au: p.y,
    t: p.t,
    kappa: kap[i],
    alpha: toAlpha(kap[i]),
  }));

  return out;
}

/**
 * Convenience alias for Mission Planner:
 * returns a ready-to-draw polyline (array of {x_au,y_au,alpha}) centered on `atDate`.
 */
export function getSolarBackgroundPolyline(
  atDate = new Date()
): Array<{
  x_au: number;
  y_au: number;
  alpha: number;
}> {
  const samples = computeBarycenterTrail({ centerDate: atDate });
  return samples.map(({ x_au, y_au, alpha }) => ({ x_au, y_au, alpha }));
}

// Convert solar points to the unified Body schema for route calculations
export function solarToBodies(solarPoints: SolarPoint[]): Body[] {
  const AU_TO_PC = 1 / 206265; // 1 pc ≈ 206,265 AU

  return solarPoints.map((point) => ({
    id: point.id,
    name: point.name,
    x_pc: point.x_au * AU_TO_PC,
    y_pc: point.y_au * AU_TO_PC,
    kind: point.kind === "star" ? "station" : point.kind,
    notes: `${point.x_au.toFixed(2)} AU, ${point.y_au.toFixed(2)} AU`,
  }));
}

export function auToLightMinutes(au: number): number {
  return au * 8.317; // 1 AU ≈ 8.317 light-minutes
}

// Helper to get live solar system positions as unified Body objects for route planning
export function getSolarBodiesAsPc(): Body[] {
  const AU_PER_PC = 206265;
  const pts = computeSolarXY(new Date());

  return pts.map((p) => ({
    id: p.id, // "EARTH", "SATURN", "SUN", ...
    name: p.name,
    x_pc: p.x_au / AU_PER_PC,
    y_pc: p.y_au / AU_PER_PC,
    kind: p.kind,
    notes: `${p.x_au.toFixed(2)} AU, ${p.y_au.toFixed(2)} AU`,
  }));
}
