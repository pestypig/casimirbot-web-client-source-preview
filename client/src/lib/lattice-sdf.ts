import type { HullPreviewPayload } from "@shared/schema";
import type { HullSurfaceMesh, HullSurfaceMeshOptions, HullSurfaceMeshResult } from "./resolve-wireframe-overlay";
import { resolveHullSurfaceMesh } from "./resolve-wireframe-overlay";
import type { LatticeClaimTier, LatticeFrame, LatticeProvenance } from "./lattice-frame";
import { hashSignature, normalizeBasisForSignature } from "./card-signatures";


const DEFAULT_LATTICE_PROVENANCE: LatticeProvenance = Object.freeze({
  claimTier: "diagnostic",
  certifying: false,
  source: "lattice-dataflow/default",
});

const resolveLatticeProvenance = (provenance?: Partial<LatticeProvenance> | null): LatticeProvenance => {
  if (!provenance) return DEFAULT_LATTICE_PROVENANCE;
  const claimTier: LatticeClaimTier = provenance.claimTier === "certifying" ? "certifying" : "diagnostic";
  const certifying = claimTier === "certifying" ? provenance.certifying !== false : false;
  const source =
    typeof provenance.source === "string" && provenance.source.trim()
      ? provenance.source
      : DEFAULT_LATTICE_PROVENANCE.source;
  return { claimTier, certifying, source };
};

export type HullDistanceGrid = {
  key: string;
  meshHash?: string;
  basisSignature?: string;
  dims: [number, number, number];
  bounds: [number, number, number];
  voxelSize: number;
  band: number;
  format: "float";
  indices: Uint32Array;
  distances: Float32Array;
  cacheHit: boolean;
  provenance: LatticeProvenance;
  clampReasons: string[];
  stats: {
    sampleCount: number;
    voxelsTouched: number;
    voxelCoverage: number;
    trianglesTouched: number;
    triangleCoverage: number;
    maxAbsDistance: number;
    maxQuantizationError: number;
  };
};

type BuildDistanceGridParams = {
  payload: HullPreviewPayload | null | undefined;
  frame: LatticeFrame | null | undefined;
  band?: number;
  surface?: HullSurfaceMeshOptions;
  maxSamples?: number;
  surfaceResolved?: HullSurfaceMeshResult | HullSurfaceMesh | null;
};

const clampIndex = (value: number, maxExclusive: number) =>
  Math.min(Math.max(value, 0), Math.max(0, maxExclusive - 1));

const isIdentityMatrix = (m: Float32Array, eps = 1e-6) =>
  Math.abs(m[0] - 1) < eps &&
  Math.abs(m[5] - 1) < eps &&
  Math.abs(m[10] - 1) < eps &&
  Math.abs(m[15] - 1) < eps &&
  Math.abs(m[1]) < eps &&
  Math.abs(m[2]) < eps &&
  Math.abs(m[3]) < eps &&
  Math.abs(m[4]) < eps &&
  Math.abs(m[6]) < eps &&
  Math.abs(m[7]) < eps &&
  Math.abs(m[8]) < eps &&
  Math.abs(m[9]) < eps &&
  Math.abs(m[11]) < eps &&
  Math.abs(m[12]) < eps &&
  Math.abs(m[13]) < eps &&
  Math.abs(m[14]) < eps;

const transformPositions = (positions: Float32Array, m: Float32Array) => {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
};

const triangleNormal = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) => {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const mag = Math.hypot(nx, ny, nz);
  if (mag < 1e-12 || !Number.isFinite(mag)) return [0, 0, 0] as const;
  const inv = 1 / mag;
  return [nx * inv, ny * inv, nz * inv] as const;
};

const closestPointOnTriangle = (
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) => {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az] as const;

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz] as const;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [ax + abx * v, ay + aby * v, az + abz * v] as const;
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz] as const;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [ax + acx * w, ay + acy * w, az + acz * w] as const;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bcx = cx - bx;
    const bcy = cy - by;
    const bcz = cz - bz;
    return [bx + bcx * w, by + bcy * w, bz + bcz * w] as const;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const u = 1 - v - w;
  return [
    ax * u + bx * v + cx * w,
    ay * u + by * v + cy * w,
    az * u + bz * v + cz * w,
  ] as const;
};

const signedDistanceToTriangle = (
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) => {
  const cp = closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
  const dx = px - cp[0];
  const dy = py - cp[1];
  const dz = pz - cp[2];
  const dist = Math.hypot(dx, dy, dz);
  const normal = triangleNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
  const sign = normal[0] * dx + normal[1] * dy + normal[2] * dz >= 0 ? 1 : -1;
  return dist * sign;
};

const cache = new Map<string, HullDistanceGrid>();

export const clearLatticeSdfCache = () => {
  cache.clear();
};

const buildCacheKey = (
  meshHash: string | undefined,
  basisSignature: string | undefined,
  dims: [number, number, number],
  voxelSize: number,
  band: number,
) => {
  const meshPart = meshHash ?? "mesh:none";
  const basisPart = basisSignature ?? "basis:none";
  const dimPart = `${dims[0]}x${dims[1]}x${dims[2]}`;
  return [meshPart, basisPart, dimPart, `v${voxelSize.toFixed(5)}`, `b${band.toFixed(4)}`].join("|");
};

export async function buildHullDistanceGrid(
  params: BuildDistanceGridParams,
): Promise<{ grid: HullDistanceGrid | null; clampReasons: string[]; key?: string }> {
  const clampReasons: string[] = [];
  if (!params.payload) {
    clampReasons.push("sdf:missingPayload");
    return { grid: null, clampReasons };
  }
  if (!params.frame) {
    clampReasons.push("sdf:missingFrame");
    return { grid: null, clampReasons };
  }

  const frame = params.frame;
  const band =
    typeof params.band === "number" && Number.isFinite(params.band) && params.band > 0
      ? params.band
      : Math.max(frame.voxelSize_m * 1.25, Math.min(frame.voxelSize_m * 4, frame.voxelSize_m * 2.5));

  const surfaceResolved = params.surfaceResolved
    ? "surface" in params.surfaceResolved
      ? params.surfaceResolved
      : { surface: params.surfaceResolved, clampReasons: [], lod: params.surface?.lod ?? "preview", source: "preview" as const }
    : resolveHullSurfaceMesh(params.payload, params.surface);

  const surface = surfaceResolved.surface;
  clampReasons.push(...surfaceResolved.clampReasons);
  if (!surface) {
    clampReasons.push("sdf:missingSurface");
    return { grid: null, clampReasons };
  }

  const meshHash = surface.meshHash ?? params.payload.meshHash ?? params.payload.mesh?.meshHash;
  const basisSignature = await hashSignature(normalizeBasisForSignature(surface.basis));
  const cacheKey = buildCacheKey(meshHash, basisSignature, frame.dims, frame.voxelSize_m, band);
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      grid: { ...cached, cacheHit: true, provenance: resolveLatticeProvenance(frame.provenance), clampReasons: [...cached.clampReasons] },
      clampReasons: [...cached.clampReasons],
      key: cacheKey,
    };
  }

  const positions =
    frame.worldToLattice && !isIdentityMatrix(frame.worldToLattice)
      ? transformPositions(surface.positions, frame.worldToLattice)
      : surface.positions;
  const indices = surface.indices;
  const triCount = Math.max(0, Math.floor(indices.length / 3));
  if (triCount === 0) {
    clampReasons.push("sdf:noTriangles");
    return { grid: null, clampReasons };
  }

  const [nx, ny, nz] = frame.dims;
  const totalVoxels = Math.max(1, nx * ny * nz);
  const voxel = frame.voxelSize_m;
  const invVoxel = voxel > 0 ? 1 / voxel : 0;
  const min = frame.bounds.minLattice;
  const max = frame.bounds.maxLattice;
  const voxelDiag = Math.sqrt(3) * voxel;

  const sampleBudgetDefault = Math.min(Math.max(Math.floor(totalVoxels * 0.4), 250_000), 4_500_000);
  const maxSamples = Math.max(1, Math.floor(params.maxSamples ?? sampleBudgetDefault));
  let samples = 0;
  let budgetHit = false;
  let maxAbsDistance = 0;
  const data = new Map<number, number>();
  const touchedTriangles = new Set<number>();

  for (let tri = 0; tri < triCount; tri++) {
    if (budgetHit) break;
    const ia = indices[tri * 3] ?? 0;
    const ib = indices[tri * 3 + 1] ?? 0;
    const ic = indices[tri * 3 + 2] ?? 0;
    const aBase = ia * 3;
    const bBase = ib * 3;
    const cBase = ic * 3;
    const ax = positions[aBase] ?? 0;
    const ay = positions[aBase + 1] ?? 0;
    const az = positions[aBase + 2] ?? 0;
    const bx = positions[bBase] ?? 0;
    const by = positions[bBase + 1] ?? 0;
    const bz = positions[bBase + 2] ?? 0;
    const cx = positions[cBase] ?? 0;
    const cy = positions[cBase + 1] ?? 0;
    const cz = positions[cBase + 2] ?? 0;

    const triMinX = Math.min(ax, bx, cx) - band;
    const triMaxX = Math.max(ax, bx, cx) + band;
    const triMinY = Math.min(ay, by, cy) - band;
    const triMaxY = Math.max(ay, by, cy) + band;
    const triMinZ = Math.min(az, bz, cz) - band;
    const triMaxZ = Math.max(az, bz, cz) + band;

    if (triMaxX < min[0] || triMinX > max[0] || triMaxY < min[1] || triMinY > max[1] || triMaxZ < min[2] || triMinZ > max[2]) {
      continue;
    }

    const ix0 = clampIndex(Math.floor((Math.max(triMinX, min[0]) - min[0]) * invVoxel), nx);
    const iy0 = clampIndex(Math.floor((Math.max(triMinY, min[1]) - min[1]) * invVoxel), ny);
    const iz0 = clampIndex(Math.floor((Math.max(triMinZ, min[2]) - min[2]) * invVoxel), nz);
    const ix1 = clampIndex(Math.floor((Math.min(triMaxX, max[0]) - min[0]) * invVoxel), nx);
    const iy1 = clampIndex(Math.floor((Math.min(triMaxY, max[1]) - min[1]) * invVoxel), ny);
    const iz1 = clampIndex(Math.floor((Math.min(triMaxZ, max[2]) - min[2]) * invVoxel), nz);

    for (let ix = ix0; ix <= ix1; ix++) {
      if (budgetHit) break;
      const px = min[0] + (ix + 0.5) * voxel;
      for (let iy = iy0; iy <= iy1; iy++) {
        if (budgetHit) break;
        const py = min[1] + (iy + 0.5) * voxel;
        for (let iz = iz0; iz <= iz1; iz++) {
          if (samples >= maxSamples) {
            budgetHit = true;
            break;
          }
          samples += 1;
          const pz = min[2] + (iz + 0.5) * voxel;
          const dist = signedDistanceToTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          if (!Number.isFinite(dist)) continue;
          const absDist = Math.abs(dist);
          if (absDist > band) continue;
          const idx = ix + nx * (iy + ny * iz);
          const prev = data.get(idx);
          if (prev === undefined || Math.abs(prev) > absDist) {
            data.set(idx, dist);
          }
          if (absDist > maxAbsDistance) maxAbsDistance = absDist;
          touchedTriangles.add(tri);
        }
      }
    }
  }

  if (budgetHit) clampReasons.push("sdf:sampleBudgetHit");
  if (data.size === 0) {
    clampReasons.push("sdf:noCoverage");
    return { grid: null, clampReasons, key: cacheKey };
  }

  const sortedIndices = Array.from(data.keys()).sort((a, b) => a - b);
  const indicesOut = new Uint32Array(sortedIndices.length);
  const distances = new Float32Array(sortedIndices.length);
  for (let i = 0; i < sortedIndices.length; i++) {
    const idx = sortedIndices[i];
    indicesOut[i] = idx;
    distances[i] = data.get(idx) ?? 0;
  }

  const grid: HullDistanceGrid = {
    key: cacheKey,
    meshHash,
    basisSignature,
    dims: [nx, ny, nz],
    bounds: [
      Math.abs(frame.bounds.halfSize[0]),
      Math.abs(frame.bounds.halfSize[1]),
      Math.abs(frame.bounds.halfSize[2]),
    ],
    voxelSize: voxel,
    band,
    format: "float",
    indices: indicesOut,
    distances,
    cacheHit: false,
    provenance: resolveLatticeProvenance(frame.provenance),
    clampReasons,
    stats: {
      sampleCount: samples,
      voxelsTouched: data.size,
      voxelCoverage: data.size / totalVoxels,
      trianglesTouched: touchedTriangles.size,
      triangleCoverage: triCount > 0 ? touchedTriangles.size / triCount : 0,
      maxAbsDistance,
      maxQuantizationError: 0.5 * voxelDiag,
    },
  };

  cache.set(cacheKey, grid);
  return { grid, clampReasons, key: cacheKey };
}

export function encodeHullDistanceBandWeightsR8(grid: HullDistanceGrid): Uint8Array {
  const dims = grid.dims;
  const totalVoxels = Math.max(1, dims[0] * dims[1] * dims[2]);
  const out = new Uint8Array(totalVoxels);
  const bandRaw = Number(grid.band);
  const band = Number.isFinite(bandRaw) && bandRaw > 0 ? bandRaw : 1.0;
  const invBand = 1 / Math.max(1e-6, band);

  const indices = grid.indices;
  const distances = grid.distances;
  const len = Math.min(indices.length, distances.length);
  for (let i = 0; i < len; i++) {
    const idx = indices[i];
    if (idx >= totalVoxels) continue;
    const dist = distances[i] ?? 0;
    if (!Number.isFinite(dist)) continue;
    const w = 1 - Math.min(1, Math.abs(dist) * invBand);
    out[idx] = Math.max(0, Math.min(255, Math.round(w * 255)));
  }

  return out;
}

export function encodeHullDistanceTsdfRG8(grid: HullDistanceGrid): Uint8Array {
  const dims = grid.dims;
  const totalVoxels = Math.max(1, dims[0] * dims[1] * dims[2]);
  const bandRaw = Number(grid.band);
  const band = Number.isFinite(bandRaw) && bandRaw > 0 ? bandRaw : 1.0;
  const out = new Uint8Array(totalVoxels * 2);
  out.fill(255);

  const indices = grid.indices;
  const distances = grid.distances;
  const len = Math.min(indices.length, distances.length);
  for (let i = 0; i < len; i++) {
    const idx = indices[i];
    if (idx >= totalVoxels) continue;
    const distRaw = distances[i];
    if (!Number.isFinite(distRaw)) continue;
    const dist = Math.max(-band, Math.min(band, distRaw));
    const u01 = 0.5 + 0.5 * (dist / band);
    const q = Math.max(0, Math.min(65535, Math.round(u01 * 65535)));
    const base = idx * 2;
    out[base] = (q >> 8) & 255;
    out[base + 1] = q & 255;
  }

  return out;
}
