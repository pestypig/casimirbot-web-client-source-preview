const TWO_PI = Math.PI * 2;
const ANGLE_TOL = 1e-4;
const EPS = 1e-9;
const DEFAULT_ITERATIONS = 20;

export type Vec3 = [number, number, number];

export interface AxesABC {
  a: number;
  b: number;
  c: number;
}

export interface YorkSample {
  pos: Vec3;
  beta: Vec3;
}

export interface YorkStats {
  kRMS: number;
  divMax: number;
  divRMS: number;
}

interface GridEntry {
  index: number;
  theta: number;
  phi: number;
  sqrtG: number;
  fluxTheta: number;
  fluxPhi: number;
  eTheta: Vec3;
  ePhi: Vec3;
  metricInv: {
    thetaTheta: number;
    thetaPhi: number;
    phiPhi: number;
  };
}

interface GridData {
  entries: (GridEntry | null)[][];
  thetaValues: number[];
  phiValues: number[];
  validCount: number;
}

type DivergenceResult = {
  stats: YorkStats;
  divergence: (number | null)[][];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const vecAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vecScale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const vecDot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function computeSurfaceDivergenceBeta(
  samples: YorkSample[],
  axesABC: AxesABC
): YorkStats {
  const grid = buildGrid(samples, axesABC);
  if (!grid || grid.validCount === 0) {
    return { kRMS: 0, divMax: 0, divRMS: 0 };
  }

  const { stats } = computeDivergence(grid);
  return stats;
}

export function helmholtzProjectDivergenceFree(
  samples: YorkSample[],
  axesABC: AxesABC,
  iterations = DEFAULT_ITERATIONS
): YorkSample[] {
  if (!samples.length || iterations <= 0) {
    return samples.slice();
  }

  const grid = buildGrid(samples, axesABC);
  if (!grid || grid.validCount === 0) {
    return samples.slice();
  }

  const { divergence } = computeDivergence(grid);
  const { entries, thetaValues, phiValues } = grid;
  if (!entries.length || !phiValues.length) {
    return samples.slice();
  }

  const thetaCount = thetaValues.length;
  const phiCount = phiValues.length;
  const phiGrid = Array.from({ length: thetaCount }, () => Array<number>(phiCount).fill(0));
  const avgThetaStep = averageSpacing(thetaValues);
  const avgPhiStep = averageSpacing(phiValues, true);

  if (avgThetaStep < EPS || avgPhiStep < EPS) {
    return samples.slice();
  }

  const invThetaSq = 1 / (avgThetaStep * avgThetaStep);
  const invPhiSq = 1 / (avgPhiStep * avgPhiStep);
  const denom = 2 * (invThetaSq + invPhiSq);
  if (!Number.isFinite(denom) || denom === 0) {
    return samples.slice();
  }

  const source = Array.from({ length: thetaCount }, (_, i) =>
    Array.from({ length: phiCount }, (_, j) => divergence[i]?.[j] ?? 0)
  );

  const entriesExist = Array.from({ length: thetaCount }, (_, i) =>
    Array.from({ length: phiCount }, (_, j) => entries[i]?.[j] !== null)
  );

  const tmpGrid = Array.from({ length: thetaCount }, () => Array<number>(phiCount).fill(0));

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < thetaCount; i += 1) {
      for (let j = 0; j < phiCount; j += 1) {
        if (!entriesExist[i][j]) {
          tmpGrid[i][j] = phiGrid[i][j];
          continue;
        }
        const up = i > 0 ? phiGrid[i - 1][j] : phiGrid[i][j];
        const down = i < thetaCount - 1 ? phiGrid[i + 1][j] : phiGrid[i][j];
        const left = phiGrid[i][(j - 1 + phiCount) % phiCount];
        const right = phiGrid[i][(j + 1) % phiCount];
        const rhs = source[i][j];
        const numerator = (up + down) * invThetaSq + (left + right) * invPhiSq - rhs;
        tmpGrid[i][j] = numerator / denom;
      }
    }
    for (let i = 0; i < thetaCount; i += 1) {
      for (let j = 0; j < phiCount; j += 1) {
        phiGrid[i][j] = tmpGrid[i][j];
      }
    }
  }

  const updates = new Map<number, Vec3>();

  for (let i = 0; i < thetaCount; i += 1) {
    for (let j = 0; j < phiCount; j += 1) {
      const entry = entries[i][j];
      if (!entry) continue;

      const gradTheta = derivativeTheta(phiGrid, thetaValues, i, j);
      const gradPhi = derivativePhi(phiGrid, phiValues, i, j);

      const gradContrTheta =
        entry.metricInv.thetaTheta * gradTheta + entry.metricInv.thetaPhi * gradPhi;
      const gradContrPhi =
        entry.metricInv.thetaPhi * gradTheta + entry.metricInv.phiPhi * gradPhi;

      const gradVec = vecAdd(
        vecScale(entry.eTheta, gradContrTheta),
        vecScale(entry.ePhi, gradContrPhi)
      );

      const betaNew: Vec3 = [
        samples[entry.index].beta[0] - gradVec[0],
        samples[entry.index].beta[1] - gradVec[1],
        samples[entry.index].beta[2] - gradVec[2],
      ];

      if (
        Number.isFinite(betaNew[0]) &&
        Number.isFinite(betaNew[1]) &&
        Number.isFinite(betaNew[2])
      ) {
        updates.set(entry.index, betaNew);
      }
    }
  }

  if (!updates.size) {
    return samples.slice();
  }

  return samples.map((sample, index) => {
    const replacement = updates.get(index);
    if (!replacement) {
      return { pos: sample.pos.slice() as Vec3, beta: sample.beta.slice() as Vec3 };
    }
    return {
      pos: sample.pos.slice() as Vec3,
      beta: replacement,
    };
  });
}

function buildGrid(samples: YorkSample[], axesABC: AxesABC): GridData | null {
  if (!samples.length) return null;

  const ax = Math.abs(axesABC?.a ?? 1) || 1;
  const by = Math.abs(axesABC?.b ?? 1) || 1;
  const cz = Math.abs(axesABC?.c ?? 1) || 1;

  const enriched = samples
    .map((sample, index) => {
      const [xRaw, yRaw, zRaw] = sample.pos;
      const [bx, byVec, bz] = sample.beta;
      if (
        !Number.isFinite(xRaw) ||
        !Number.isFinite(yRaw) ||
        !Number.isFinite(zRaw) ||
        !Number.isFinite(bx) ||
        !Number.isFinite(byVec) ||
        !Number.isFinite(bz)
      ) {
        return null;
      }

      const x = xRaw / ax;
      const y = yRaw / by;
      const z = zRaw / cz;
      const norm = Math.hypot(x, y, z);
      if (norm < EPS) return null;

      const xn = x / norm;
      const yn = y / norm;
      const zn = z / norm;
      const theta = Math.acos(clamp(zn, -1, 1));
      let phi = Math.atan2(yn, xn);
      if (phi < 0) phi += TWO_PI;

      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const eTheta: Vec3 = [
        ax * cosTheta * cosPhi,
        by * cosTheta * sinPhi,
        -cz * sinTheta,
      ];
      const ePhi: Vec3 = [
        -ax * sinTheta * sinPhi,
        by * sinTheta * cosPhi,
        0,
      ];

      const g11 = vecDot(eTheta, eTheta);
      const g22 = vecDot(ePhi, ePhi);
      const g12 = vecDot(eTheta, ePhi);
      const det = g11 * g22 - g12 * g12;
      if (det <= EPS) return null;

      const sqrtG = Math.sqrt(det);
      const betaThetaCov = vecDot(sample.beta, eTheta);
      const betaPhiCov = vecDot(sample.beta, ePhi);
      const invDet = 1 / det;

      const betaThetaContr = (g22 * betaThetaCov - g12 * betaPhiCov) * invDet;
      const betaPhiContr = (g11 * betaPhiCov - g12 * betaThetaCov) * invDet;

      return {
        index,
        theta,
        phi,
        sqrtG,
        fluxTheta: sqrtG * betaThetaContr,
        fluxPhi: sqrtG * betaPhiContr,
        eTheta,
        ePhi,
        metricInv: {
          thetaTheta: g22 * invDet,
          thetaPhi: -g12 * invDet,
          phiPhi: g11 * invDet,
        },
      } as GridEntry;
    })
    .filter((entry): entry is GridEntry => Boolean(entry));

  if (!enriched.length) return null;

  const thetaValues = dedupeAngles(enriched.map((entry) => entry.theta));
  const phiValues = dedupeAngles(enriched.map((entry) => entry.phi), true);
  if (!thetaValues.length || !phiValues.length) {
    return null;
  }

  const thetaCount = thetaValues.length;
  const phiCount = phiValues.length;
  const entries = Array.from({ length: thetaCount }, () =>
    Array<GridEntry | null>(phiCount).fill(null)
  );

  const thetaIdx = (value: number) => nearestIndex(value, thetaValues);
  const phiIdx = (value: number) => nearestIndex(value, phiValues);

  let placed = 0;
  for (const entry of enriched) {
    const ti = thetaIdx(entry.theta);
    const pj = phiIdx(entry.phi);
    if (!entries[ti][pj]) {
      entries[ti][pj] = entry;
      placed += 1;
    }
  }

  return {
    entries,
    thetaValues,
    phiValues,
    validCount: placed,
  };
}

function computeDivergence(grid: GridData): DivergenceResult {
  const { entries, thetaValues, phiValues } = grid;
  const thetaCount = thetaValues.length;
  const phiCount = phiValues.length;

  const fluxTheta = Array.from({ length: thetaCount }, (_, i) =>
    Array.from({ length: phiCount }, (_, j) => entries[i][j]?.fluxTheta ?? null)
  );
  const fluxPhi = Array.from({ length: thetaCount }, (_, i) =>
    Array.from({ length: phiCount }, (_, j) => entries[i][j]?.fluxPhi ?? null)
  );
  const sqrtGGrid = Array.from({ length: thetaCount }, (_, i) =>
    Array.from({ length: phiCount }, (_, j) => entries[i][j]?.sqrtG ?? null)
  );

  const divergence = Array.from({ length: thetaCount }, () =>
    Array<number | null>(phiCount).fill(null)
  );

  const values: number[] = [];
  const weightedSquares: number[] = [];
  const weights: number[] = [];

  for (let i = 0; i < thetaCount; i += 1) {
    for (let j = 0; j < phiCount; j += 1) {
      const sqrtG = sqrtGGrid[i][j];
      if (sqrtG == null || sqrtG <= EPS) continue;

      const dTheta = derivativeFluxTheta(fluxTheta, thetaValues, i, j);
      const dPhi = derivativeFluxPhi(fluxPhi, phiValues, i, j);
      const div = (dTheta + dPhi) / sqrtG;
      if (!Number.isFinite(div)) continue;

      divergence[i][j] = div;
      values.push(div);
      weightedSquares.push(div * div * sqrtG);
      weights.push(sqrtG);
    }
  }

  const divMax = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const divRMS =
    values.length > 0
      ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
      : 0;
  const kRMS =
    weightedSquares.length > 0
      ? Math.sqrt(
          weightedSquares.reduce((sum, value) => sum + value, 0) /
            weights.reduce((sum, value) => sum + value, 0)
        )
      : 0;

  return {
    stats: { kRMS, divMax, divRMS },
    divergence,
  };
}

function dedupeAngles(values: number[], wrap = false) {
  if (!values.length) return [];
  const sorted = values
    .map((value) => {
      let norm = value;
      if (wrap) {
        norm %= TWO_PI;
        if (norm < 0) norm += TWO_PI;
      }
      return norm;
    })
    .sort((a, b) => a - b);

  const deduped: number[] = [];
  let current = sorted[0];
  let count = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const value = sorted[i];
    if (Math.abs(value - current) <= ANGLE_TOL) {
      count += 1;
      current = (current * (count - 1) + value) / count;
    } else {
      deduped.push(current);
      current = value;
      count = 1;
    }
  }
  deduped.push(current);

  if (wrap && deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.abs((first + TWO_PI) - last) <= ANGLE_TOL) {
      let merged = (first + (last - TWO_PI)) * 0.5;
      merged %= TWO_PI;
      if (merged < 0) merged += TWO_PI;
      deduped[0] = merged;
      deduped.pop();
    }
  }

  return deduped;
}

function nearestIndex(value: number, sorted: number[]) {
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const delta = Math.abs(sorted[i] - value);
    if (delta < bestDelta) {
      bestIdx = i;
      bestDelta = delta;
    } else if (delta > bestDelta && sorted[i] > value) {
      break;
    }
  }
  return bestIdx;
}

function averageSpacing(values: number[], wrap = false) {
  if (values.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 1; i < values.length; i += 1) {
    total += values[i] - values[i - 1];
    count += 1;
  }
  if (wrap) {
    let delta = values[0] + TWO_PI - values[values.length - 1];
    if (delta < 0) delta += TWO_PI;
    total += delta;
    count += 1;
  }
  return total / count;
}

function derivativeFluxTheta(
  flux: (number | null)[][],
  thetaValues: number[],
  i: number,
  j: number
) {
  const thetaCount = thetaValues.length;
  const current = flux[i][j];
  if (current == null) return 0;

  if (thetaCount >= 3 && i > 0 && i < thetaCount - 1) {
    const prev = flux[i - 1][j];
    const next = flux[i + 1][j];
    if (prev != null && next != null) {
      const delta = thetaValues[i + 1] - thetaValues[i - 1];
      if (Math.abs(delta) > EPS) {
        return (next - prev) / delta;
      }
    }
  }

  if (i < thetaCount - 1) {
    const next = flux[i + 1][j];
    const delta = thetaValues[i + 1] - thetaValues[i];
    if (next != null && Math.abs(delta) > EPS) {
      return (next - current) / delta;
    }
  }

  if (i > 0) {
    const prev = flux[i - 1][j];
    const delta = thetaValues[i] - thetaValues[i - 1];
    if (prev != null && Math.abs(delta) > EPS) {
      return (current - prev) / delta;
    }
  }

  return 0;
}

function derivativeFluxPhi(
  flux: (number | null)[][],
  phiValues: number[],
  i: number,
  j: number
) {
  const phiCount = phiValues.length;
  if (phiCount < 2) return 0;
  const prevIdx = (j - 1 + phiCount) % phiCount;
  const nextIdx = (j + 1) % phiCount;
  const prev = flux[i][prevIdx];
  const next = flux[i][nextIdx];
  if (prev != null && next != null) {
    let delta = phiValues[nextIdx] - phiValues[prevIdx];
    if (delta <= -Math.PI) delta += TWO_PI;
    if (delta > Math.PI) delta -= TWO_PI;
    if (Math.abs(delta) > EPS) {
      return (next - prev) / delta;
    }
  }

  const current = flux[i][j];
  if (current == null) return 0;

  const nextForward = flux[i][nextIdx];
  let deltaForward = phiValues[nextIdx] - phiValues[j];
  if (deltaForward <= -Math.PI) deltaForward += TWO_PI;
  if (deltaForward > Math.PI) deltaForward -= TWO_PI;
  if (nextForward != null && Math.abs(deltaForward) > EPS) {
    return (nextForward - current) / deltaForward;
  }

  const prevVal = flux[i][prevIdx];
  let deltaBackward = phiValues[j] - phiValues[prevIdx];
  if (deltaBackward <= -Math.PI) deltaBackward += TWO_PI;
  if (deltaBackward > Math.PI) deltaBackward -= TWO_PI;
  if (prevVal != null && Math.abs(deltaBackward) > EPS) {
    return (current - prevVal) / deltaBackward;
  }

  return 0;
}

function derivativeTheta(
  field: number[][],
  thetaValues: number[],
  i: number,
  j: number
) {
  const thetaCount = thetaValues.length;
  if (thetaCount < 2) return 0;
  const prevIdx = Math.max(0, i - 1);
  const nextIdx = Math.min(thetaCount - 1, i + 1);
  const prev = field[prevIdx][j];
  const next = field[nextIdx][j];
  let delta = thetaValues[nextIdx] - thetaValues[prevIdx];
  if (delta === 0) return 0;
  return (next - prev) / delta;
}

function derivativePhi(field: number[][], phiValues: number[], i: number, j: number) {
  const phiCount = phiValues.length;
  if (phiCount < 2) return 0;
  const prevIdx = (j - 1 + phiCount) % phiCount;
  const nextIdx = (j + 1) % phiCount;
  const prev = field[i][prevIdx];
  const next = field[i][nextIdx];
  let delta = phiValues[nextIdx] - phiValues[prevIdx];
  if (delta <= -Math.PI) delta += TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (Math.abs(delta) < EPS) return 0;
  return (next - prev) / delta;
}
