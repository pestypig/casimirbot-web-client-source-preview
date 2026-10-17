import { sha256Hex } from "@/utils/sha";
import type { HullDistanceGrid } from "@/lib/lattice-sdf";
import type { HullSurfaceVoxelVolume } from "@/lib/lattice-surface";

const DEFAULT_SAMPLE_COUNT = 2048;
const DEFAULT_QUANT_SCALE = 1e5;
const DEFAULT_META_SCALE = 1e6;
const DIGEST_LENGTH = 16;

const quantizeToI32 = (value: number, scale: number) => {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(value * scale);
  if (!Number.isFinite(scaled)) return 0;
  return scaled | 0;
};

const sampleIndex = (i: number, len: number, sampleCount: number) => {
  if (len <= 1) return 0;
  if (sampleCount <= 1) return Math.max(0, Math.min(len - 1, i));
  const idx = Math.floor(((i + 0.5) * len) / sampleCount);
  return Math.max(0, Math.min(len - 1, idx));
};

export async function hashLatticeVolumeDeterminism(
  volume: HullSurfaceVoxelVolume,
  opts?: { sampleCount?: number; quantScale?: number },
): Promise<string> {
  const expectedLen = Math.max(0, volume.dims[0] * volume.dims[1] * volume.dims[2]);
  const len = Math.min(expectedLen, volume.drive3D.length, volume.gate3D.length);
  const sampleCount = Math.min(Math.max(0, Math.floor(opts?.sampleCount ?? DEFAULT_SAMPLE_COUNT)), len);
  const quantScale = Math.max(1, Math.floor(opts?.quantScale ?? DEFAULT_QUANT_SCALE));

  const headerLen = 6;
  const out = new Uint32Array(headerLen + sampleCount * 2);
  out[0] = volume.dims[0] >>> 0;
  out[1] = volume.dims[1] >>> 0;
  out[2] = volume.dims[2] >>> 0;
  out[3] = Math.round((volume.voxelSize ?? 0) * DEFAULT_META_SCALE) >>> 0;
  out[4] = Math.round((volume.stats?.coverage ?? 0) * DEFAULT_META_SCALE) >>> 0;
  out[5] = Math.round((volume.stats?.maxGate ?? 0) * DEFAULT_META_SCALE) >>> 0;

  let offset = headerLen;
  for (let i = 0; i < sampleCount; i++) {
    const idx = sampleIndex(i, len, sampleCount);
    out[offset++] = quantizeToI32(volume.drive3D[idx] ?? 0, quantScale) >>> 0;
    out[offset++] = quantizeToI32(volume.gate3D[idx] ?? 0, quantScale) >>> 0;
  }

  return (await sha256Hex(out.buffer)).slice(0, DIGEST_LENGTH);
}

export async function hashLatticeSdfDeterminism(
  grid: HullDistanceGrid,
  opts?: { sampleCount?: number; quantScale?: number },
): Promise<string> {
  const len = Math.min(grid.indices.length, grid.distances.length);
  const sampleCount = Math.min(Math.max(0, Math.floor(opts?.sampleCount ?? DEFAULT_SAMPLE_COUNT)), len);
  const quantScale = Math.max(1, Math.floor(opts?.quantScale ?? DEFAULT_QUANT_SCALE));

  const headerLen = 7;
  const out = new Uint32Array(headerLen + sampleCount * 2);
  out[0] = grid.dims[0] >>> 0;
  out[1] = grid.dims[1] >>> 0;
  out[2] = grid.dims[2] >>> 0;
  out[3] = Math.round((grid.voxelSize ?? 0) * DEFAULT_META_SCALE) >>> 0;
  out[4] = Math.round((grid.band ?? 0) * DEFAULT_META_SCALE) >>> 0;
  out[5] = Math.round((grid.stats?.voxelCoverage ?? 0) * DEFAULT_META_SCALE) >>> 0;
  out[6] = Math.round((grid.stats?.triangleCoverage ?? 0) * DEFAULT_META_SCALE) >>> 0;

  let offset = headerLen;
  for (let i = 0; i < sampleCount; i++) {
    const idx = sampleIndex(i, len, sampleCount);
    out[offset++] = (grid.indices[idx] ?? 0) >>> 0;
    out[offset++] = quantizeToI32(grid.distances[idx] ?? 0, quantScale) >>> 0;
  }

  return (await sha256Hex(out.buffer)).slice(0, DIGEST_LENGTH);
}

