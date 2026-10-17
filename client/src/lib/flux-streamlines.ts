type Vec3 = [number, number, number];

export type FluxVectorField = {
  dims: [number, number, number];
  Sx: Float32Array;
  Sy: Float32Array;
  Sz: Float32Array;
  maxMag: number;
};

export type FluxStreamlineSettings = {
  bounds: Vec3;
  shellAxes: Vec3;
  seedCount: number;
  seedRadius: number;
  seedSpread: number;
  stepCount: number;
  stepScale: number;
  minSpeedFraction: number;
  bidirectional: boolean;
  seed: number;
};

export type FluxStreamlineResult = {
  positions: Float32Array;
  vertexCount: number;
  segmentCount: number;
};

const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const mulberry32 = (seed: number) => {
  let t = seed | 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const randomUnitVector = (rand: () => number): Vec3 => {
  const z = rand() * 2 - 1;
  const t = rand() * TWO_PI;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(t), z, r * Math.sin(t)];
};

export function buildFluxStreamlines(field: FluxVectorField, settings: FluxStreamlineSettings): FluxStreamlineResult {
  const [nx, ny, nz] = field.dims;
  if (nx <= 1 || ny <= 1 || nz <= 1) {
    return { positions: new Float32Array(0), vertexCount: 0, segmentCount: 0 };
  }

  const bounds = settings.bounds;
  const shellAxes = settings.shellAxes;
  if (!bounds.every((v) => Number.isFinite(v) && Math.abs(v) > 1e-6)) {
    return { positions: new Float32Array(0), vertexCount: 0, segmentCount: 0 };
  }
  if (!shellAxes.every((v) => Number.isFinite(v) && Math.abs(v) > 1e-6)) {
    return { positions: new Float32Array(0), vertexCount: 0, segmentCount: 0 };
  }

  const seedCount = Math.max(1, Math.round(settings.seedCount));
  const stepCount = Math.max(1, Math.round(settings.stepCount));
  const stepScale = clamp(settings.stepScale, 1e-4, 1);
  const minSpeedFrac = clamp(settings.minSpeedFraction, 0, 1);
  const bidirectional = settings.bidirectional;
  const minSpeed = Math.max(field.maxMag * minSpeedFrac, field.maxMag * 1e-6);
  if (!Number.isFinite(minSpeed) || minSpeed <= 0) {
    return { positions: new Float32Array(0), vertexCount: 0, segmentCount: 0 };
  }

  const maxScale = Math.min(
    bounds[0] / shellAxes[0],
    bounds[1] / shellAxes[1],
    bounds[2] / shellAxes[2]
  );
  const baseRadius = clamp(settings.seedRadius, 0.05, Math.max(0.05, maxScale));
  const spread = Math.max(0, settings.seedSpread);
  const rand = mulberry32(settings.seed);

  const strideY = nx;
  const strideZ = nx * ny;

  const stepSize = stepScale * Math.min(bounds[0], bounds[1], bounds[2]);
  if (!Number.isFinite(stepSize) || stepSize <= 0) {
    return { positions: new Float32Array(0), vertexCount: 0, segmentCount: 0 };
  }

  const maxSegments = seedCount * stepCount * (bidirectional ? 2 : 1);
  const positions = new Float32Array(maxSegments * 6);
  let cursor = 0;

  const sampleVector = (px: number, py: number, pz: number) => {
    const nxNorm = px / bounds[0];
    const nyNorm = py / bounds[1];
    const nzNorm = pz / bounds[2];
    if (
      nxNorm < -1 || nxNorm > 1 ||
      nyNorm < -1 || nyNorm > 1 ||
      nzNorm < -1 || nzNorm > 1
    ) {
      return null;
    }
    const gx = (nxNorm * 0.5 + 0.5) * (nx - 1);
    const gy = (nyNorm * 0.5 + 0.5) * (ny - 1);
    const gz = (nzNorm * 0.5 + 0.5) * (nz - 1);

    const ix0 = Math.floor(gx);
    const iy0 = Math.floor(gy);
    const iz0 = Math.floor(gz);
    const ix1 = Math.min(ix0 + 1, nx - 1);
    const iy1 = Math.min(iy0 + 1, ny - 1);
    const iz1 = Math.min(iz0 + 1, nz - 1);
    const tx = gx - ix0;
    const ty = gy - iy0;
    const tz = gz - iz0;

    const i000 = ix0 + iy0 * strideY + iz0 * strideZ;
    const i100 = ix1 + iy0 * strideY + iz0 * strideZ;
    const i010 = ix0 + iy1 * strideY + iz0 * strideZ;
    const i110 = ix1 + iy1 * strideY + iz0 * strideZ;
    const i001 = ix0 + iy0 * strideY + iz1 * strideZ;
    const i101 = ix1 + iy0 * strideY + iz1 * strideZ;
    const i011 = ix0 + iy1 * strideY + iz1 * strideZ;
    const i111 = ix1 + iy1 * strideY + iz1 * strideZ;

    const sx00 = field.Sx[i000] * (1 - tx) + field.Sx[i100] * tx;
    const sx10 = field.Sx[i010] * (1 - tx) + field.Sx[i110] * tx;
    const sx01 = field.Sx[i001] * (1 - tx) + field.Sx[i101] * tx;
    const sx11 = field.Sx[i011] * (1 - tx) + field.Sx[i111] * tx;
    const sx0 = sx00 * (1 - ty) + sx10 * ty;
    const sx1 = sx01 * (1 - ty) + sx11 * ty;
    const sx = sx0 * (1 - tz) + sx1 * tz;

    const sy00 = field.Sy[i000] * (1 - tx) + field.Sy[i100] * tx;
    const sy10 = field.Sy[i010] * (1 - tx) + field.Sy[i110] * tx;
    const sy01 = field.Sy[i001] * (1 - tx) + field.Sy[i101] * tx;
    const sy11 = field.Sy[i011] * (1 - tx) + field.Sy[i111] * tx;
    const sy0 = sy00 * (1 - ty) + sy10 * ty;
    const sy1 = sy01 * (1 - ty) + sy11 * ty;
    const sy = sy0 * (1 - tz) + sy1 * tz;

    const sz00 = field.Sz[i000] * (1 - tx) + field.Sz[i100] * tx;
    const sz10 = field.Sz[i010] * (1 - tx) + field.Sz[i110] * tx;
    const sz01 = field.Sz[i001] * (1 - tx) + field.Sz[i101] * tx;
    const sz11 = field.Sz[i011] * (1 - tx) + field.Sz[i111] * tx;
    const sz0 = sz00 * (1 - ty) + sz10 * ty;
    const sz1 = sz01 * (1 - ty) + sz11 * ty;
    const sz = sz0 * (1 - tz) + sz1 * tz;

    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) {
      return null;
    }
    return [sx, sy, sz] as Vec3;
  };

  const integrate = (start: Vec3, dirSign: number) => {
    let px = start[0];
    let py = start[1];
    let pz = start[2];
    for (let step = 0; step < stepCount; step += 1) {
      const v = sampleVector(px, py, pz);
      if (!v) break;
      const vx = v[0];
      const vy = v[1];
      const vz = v[2];
      const mag = Math.hypot(vx, vy, vz);
      if (!Number.isFinite(mag) || mag < minSpeed) break;
      const inv = dirSign / mag;
      const nx = px + vx * inv * stepSize;
      const ny = py + vy * inv * stepSize;
      const nz = pz + vz * inv * stepSize;
      if (cursor + 6 > positions.length) break;
      positions[cursor++] = px;
      positions[cursor++] = py;
      positions[cursor++] = pz;
      positions[cursor++] = nx;
      positions[cursor++] = ny;
      positions[cursor++] = nz;
      px = nx;
      py = ny;
      pz = nz;
    }
  };

  for (let i = 0; i < seedCount; i += 1) {
    const dir = randomUnitVector(rand);
    const jitter = (rand() * 2 - 1) * spread;
    const rMetric = clamp(baseRadius + jitter, 0.02, maxScale);
    const seed: Vec3 = [
      dir[0] * shellAxes[0] * rMetric,
      dir[1] * shellAxes[1] * rMetric,
      dir[2] * shellAxes[2] * rMetric,
    ];
    integrate(seed, 1);
    if (bidirectional) integrate(seed, -1);
    if (cursor >= positions.length) break;
  }

  const used = positions.subarray(0, cursor);
  return {
    positions: used,
    vertexCount: used.length / 3,
    segmentCount: used.length / 6,
  };
}
