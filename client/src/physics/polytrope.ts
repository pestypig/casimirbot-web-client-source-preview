import type { RadialProfile } from "@/models/star";
import { G, kB, mH } from "./constants";

export interface LaneEmdenSolution {
  xi: Float64Array;
  theta: Float64Array;
  dtheta: Float64Array;
  xi1: number;
  thetaPrimeXi1: number;
  n: 1.5 | 3;
}

interface LaneEmdenOptions {
  xiMax?: number;
  step?: number;
}

const laneEmdenCache = new Map<number, LaneEmdenSolution>();

export function solveLaneEmden(n: 1.5 | 3, opts: LaneEmdenOptions = {}): LaneEmdenSolution {
  const cached = laneEmdenCache.get(n);
  if (cached) return cached;

  const xiMax = opts.xiMax ?? 20;
  const h = opts.step ?? 1e-3;
  const N = Math.floor(xiMax / h) + 1;
  const xi = new Float64Array(N);
  const theta = new Float64Array(N);
  const dth = new Float64Array(N);

  // start slightly away from zero with series expansion
  const start = 1e-4;
  xi[0] = start;
  theta[0] = 1 - (start * start) / 6;
  dth[0] = -start / 3;

  let xi1 = Number.NaN;
  let dtheta1 = Number.NaN;

  const f1 = (_x: number, _theta: number, dthetaVal: number) => dthetaVal;
  const f2 = (x: number, thetaVal: number, dthetaVal: number) => {
    if (x === 0) return 0;
    return -(2 / x) * dthetaVal - Math.pow(Math.max(thetaVal, 0), n);
  };

  for (let i = 0; i < N - 1; i++) {
    const x = xi[i];
    const y = theta[i];
    const z = dth[i];

    const k1y = h * f1(x, y, z);
    const k1z = h * f2(x, y, z);
    const k2y = h * f1(x + 0.5 * h, y + 0.5 * k1y, z + 0.5 * k1z);
    const k2z = h * f2(x + 0.5 * h, y + 0.5 * k1y, z + 0.5 * k1z);
    const k3y = h * f1(x + 0.5 * h, y + 0.5 * k2y, z + 0.5 * k2z);
    const k3z = h * f2(x + 0.5 * h, y + 0.5 * k2y, z + 0.5 * k2z);
    const k4y = h * f1(x + h, y + k3y, z + k3z);
    const k4z = h * f2(x + h, y + k3y, z + k3z);

    xi[i + 1] = x + h;
    theta[i + 1] = y + (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
    dth[i + 1] = z + (k1z + 2 * k2z + 2 * k3z + k4z) / 6;

    if (!Number.isFinite(xi1) && theta[i + 1] <= 0) {
      const t0 = y;
      const t1 = theta[i + 1];
      const frac = t0 / (t0 - t1);
      xi1 = x + frac * h;
      dtheta1 = z + frac * (dth[i + 1] - z);
      break;
    }
  }

  const cutIndex = Number.isFinite(xi1) ? Math.max(2, Math.floor((xi1 as number) / h) + 1) : N;
  const solution: LaneEmdenSolution = {
    xi: xi.slice(0, cutIndex),
    theta: theta.slice(0, cutIndex),
    dtheta: dth.slice(0, cutIndex),
    xi1: Number.isFinite(xi1) ? (xi1 as number) : xi[cutIndex - 1],
    thetaPrimeXi1: Number.isFinite(dtheta1) ? (dtheta1 as number) : dth[cutIndex - 1],
    n,
  };

  laneEmdenCache.set(n, solution);
  return solution;
}

export interface PolytropeProfileOptions {
  n: 1.5 | 3;
  M: number;
  R: number;
  mu?: number;
}

export interface PolytropeProfile extends RadialProfile {
  rhoCentral: number;
  pressureCentral: number;
}

export function buildPolytropeProfile({ n, M, R, mu = 0.61 }: PolytropeProfileOptions): PolytropeProfile {
  const lane = solveLaneEmden(n);
  const xi1 = lane.xi1;
  const thetap1 = lane.thetaPrimeXi1;
  const a = R / xi1;
  const rhoCentral = M / (4 * Math.PI * Math.pow(a, 3) * -xi1 * xi1 * thetap1);
  const K = ((4 * Math.PI * G * a * a) / (n + 1)) * Math.pow(rhoCentral, 1 - 1 / n);

  const len = lane.xi.length;
  const r = new Float64Array(len);
  const rho = new Float64Array(len);
  const P = new Float64Array(len);
  const T = new Float64Array(len);
  const Menc = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    const thetaVal = Math.max(lane.theta[i], 0);
    r[i] = a * lane.xi[i];
    rho[i] = rhoCentral * Math.pow(thetaVal, n);
    P[i] = rho[i] > 0 ? K * Math.pow(rho[i], 1 + 1 / n) : 0;
    if (rho[i] > 0) {
      T[i] = (P[i] * mu * mH) / (rho[i] * kB);
    } else {
      T[i] = 0;
    }

    if (i === 0) {
      Menc[i] = (4 / 3) * Math.PI * r[i] ** 3 * rho[i];
    } else {
      const dr = r[i] - r[i - 1];
      const fPrev = 4 * Math.PI * r[i - 1] * r[i - 1] * rho[i - 1];
      const fCurr = 4 * Math.PI * r[i] * r[i] * rho[i];
      Menc[i] = Menc[i - 1] + 0.5 * (fPrev + fCurr) * dr;
    }
  }

  return {
    r,
    rho,
    P,
    T,
    Menc,
    rhoCentral,
    pressureCentral: P[0],
  };
}
