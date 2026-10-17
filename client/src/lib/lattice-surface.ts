import type { HullBasisResolved } from "@shared/hull-basis";
import type { HullPreviewPayload } from "@shared/schema";
import type { LatticeClaimTier, LatticeFrame, LatticeProvenance } from "./lattice-frame";
import {
  resolveHullSurfaceMesh,
  type HullSurfaceMeshOptions,
  type HullSurfaceMeshResult,
  type WireframeOverlayLod,
} from "./resolve-wireframe-overlay";


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

export type HullSurfaceStrobeHist = {
  vertices: Float32Array;
  triangles: Float32Array;
  triangleArea: Float32Array;
  triangleAreaTotal: number;
  triangleArea01: Float32Array;
  sectorCount: number;
};

export type HullSurfaceStrobeBuild = {
  surface: HullSurfaceMeshResult["surface"];
  histogram: HullSurfaceStrobeHist | null;
  hash: string;
  clampReasons: string[];
  lod: WireframeOverlayLod;
  source: HullSurfaceMeshResult["source"];
};

const buildHistogram = (sectors: Uint16Array | Uint32Array, sectorCount: number) => {
  const hist = new Float32Array(Math.max(1, sectorCount));
  for (let i = 0; i < sectors.length; i++) {
    const idx = sectors[i] ?? 0;
    if (idx >= 0 && idx < hist.length) {
      hist[idx] += 1;
    }
  }
  return hist;
};

const buildAreaHistogram = (
  positions: Float32Array,
  indices: Uint32Array,
  sectors: Uint16Array | Uint32Array,
  sectorCount: number,
) => {
  const hist = new Float32Array(Math.max(1, sectorCount));
  let total = 0;
  const triCount = Math.max(0, Math.floor(indices.length / 3));
  for (let i = 0; i < triCount; i++) {
    const a = indices[i * 3] ?? 0;
    const b = indices[i * 3 + 1] ?? 0;
    const c = indices[i * 3 + 2] ?? 0;
    const aBase = a * 3;
    const bBase = b * 3;
    const cBase = c * 3;
    const abx = positions[bBase] - positions[aBase];
    const aby = positions[bBase + 1] - positions[aBase + 1];
    const abz = positions[bBase + 2] - positions[aBase + 2];
    const acx = positions[cBase] - positions[aBase];
    const acy = positions[cBase + 1] - positions[aBase + 1];
    const acz = positions[cBase + 2] - positions[aBase + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const area = 0.5 * Math.sqrt(Math.max(cx * cx + cy * cy + cz * cz, 0));
    if (!Number.isFinite(area) || area <= 0) continue;
    const idx = sectors[i] ?? 0;
    if (idx >= 0 && idx < hist.length) {
      hist[idx] += area;
      total += area;
    }
  }
  const norm = Math.max(total, 1e-12);
  const hist01 = new Float32Array(hist.length);
  for (let i = 0; i < hist.length; i++) hist01[i] = hist[i] / norm;
  return { hist, total, hist01 };
};

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

export function buildHullSurfaceStrobe(
  payload: HullPreviewPayload | null | undefined,
  opts?: { surface?: HullSurfaceMeshOptions },
): HullSurfaceStrobeBuild {
  const surface = resolveHullSurfaceMesh(payload, opts?.surface);
  const histogram: HullSurfaceStrobeHist | null =
    surface.surface != null
      ? (() => {
          const vertices = buildHistogram(surface.surface.vertexSectors, surface.surface.sectorCount);
          const triangles = buildHistogram(surface.surface.triangleSectors, surface.surface.sectorCount);
          const areaHist = buildAreaHistogram(
            surface.surface.positions,
            surface.surface.indices,
            surface.surface.triangleSectors,
            surface.surface.sectorCount,
          );
          return {
            vertices,
            triangles,
            triangleArea: areaHist.hist,
            triangleAreaTotal: areaHist.total,
            triangleArea01: areaHist.hist01,
            sectorCount: surface.surface.sectorCount,
          };
        })()
      : null;

  const hash = surface.surface
    ? [
        surface.surface.meshHash ?? "none",
        surface.surface.handedness,
        surface.surface.lod,
        surface.surface.sectorCount,
        surface.surface.vertexCount,
        surface.surface.triangleCount,
        histogram?.triangleAreaTotal ?? 0,
      ].join("|")
    : "none";

  return {
    surface: surface.surface,
    histogram,
    hash,
    clampReasons: surface.clampReasons,
    lod: surface.lod,
    source: surface.source,
  };
}

export type StrobeWeightParams = {
  totalSectors: number;
  liveSectors: number;
  sectorCenter01: number;
  gaussianSigma: number;
  sectorFloor: number;
  splitEnabled?: boolean;
  splitFrac?: number;
  syncMode?: number;
};

const wrap01 = (x: number) => {
  const v = x - Math.floor(x);
  return v < 0 ? v + 1 : v;
};

const clamp = (x: number, min = 0, max = 1) => Math.min(Math.max(x, min), max);

const quantizeSectorCenter01 = (center01: number, totalSectors: number) => {
  const total = Math.max(1, Math.floor(totalSectors));
  const center = wrap01(center01);
  const idx = Math.min(total - 1, Math.max(0, Math.floor(center * total)));
  return (idx + 0.5) / total;
};

export const buildSectorWeights = (params: StrobeWeightParams) => {
  const total = Math.max(1, Math.floor(params.totalSectors));
  const weights = new Float32Array(total);
  const floor = clamp(params.sectorFloor, 0, 0.99);
  const peak = 1 - floor;
  const sigma = Math.max(1e-4, params.gaussianSigma);
  const center = quantizeSectorCenter01(params.sectorCenter01, total);
  const splitEnabled = !!params.splitEnabled;
  const splitFrac = clamp(params.splitFrac ?? 0.5, 0, 1);
  const mode = params.syncMode ?? 1; // 1 = gaussian, else wedge

  if (mode === 1) {
    const altCenter = wrap01(center + 0.5);
    const normK = Math.min(1, sigma * 2.5066283); // approx avg gaussian mass
    for (let i = 0; i < total; i++) {
      const a = (i + 0.5) / total;
      const dist = Math.min(Math.abs(a - center), 1 - Math.abs(a - center));
      const g1 = Math.exp(-0.5 * Math.pow(dist / sigma, 2));
      let g = g1;
      if (splitEnabled) {
        const dist2 = Math.min(Math.abs(a - altCenter), 1 - Math.abs(a - altCenter));
        const g2 = Math.exp(-0.5 * Math.pow(dist2 / sigma, 2));
        g = g1 * (1 - splitFrac) + g2 * splitFrac;
      }
      const gNorm = normK > 1e-4 ? Math.min(g / normK, 12) : g;
      weights[i] = floor + peak * gNorm;
    }
  } else {
    const live = Math.max(1, Math.min(total, Math.floor(params.liveSectors ?? total)));
    const half = 0.5 * (live / total);
    const left = wrap01(center - half);
    const right = wrap01(center + half);
    for (let i = 0; i < total; i++) {
      const a = (i + 0.5) / total;
      const inRange = left < right ? a >= left && a <= right : a >= left || a <= right;
      weights[i] = inRange ? 1 : floor;
    }
  }

  // Normalize weights so mean ~1 to avoid changing overall power
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i];
  const mean = sum > 0 ? sum / weights.length : 1;
  if (mean > 0) {
    for (let i = 0; i < weights.length; i++) weights[i] /= mean;
  }
  return weights;
};

type StrobeWeightsResult = {
  weights: Float32Array;
  vertexWeighted: Float32Array;
  triangleWeighted: Float32Array;
  areaWeighted: Float32Array;
  areaWeighted01: Float32Array;
  vertexWeighted01: Float32Array;
  triangleWeighted01: Float32Array;
  hash: string;
  cacheHit: boolean;
};

const MAX_STROBE_CACHE_ENTRIES = 256;
// Voxel volumes are large (multiple Float32Array fields); keep this tiny to avoid runaway memory growth.
const MAX_VOXEL_CACHE_ENTRIES = 2;

const strobeCache = new Map<string, StrobeWeightsResult>();

export const clearLatticeSurfaceCaches = () => {
  strobeCache.clear();
  voxelCache.clear();
};

const fnv1a32 = (str: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const basisSignature = (basis?: HullBasisResolved | null) => {
  if (!basis) return "basis:none";
  const swap = `${basis.swap.x}${basis.swap.y}${basis.swap.z}`;
  const flip = `${basis.flip.x ? 1 : 0}${basis.flip.y ? 1 : 0}${basis.flip.z ? 1 : 0}`;
  const scale = basis.scale.map((v) => Math.round((v ?? 0) * 1e6) / 1e6).join(",");
  const forward = basis.forward.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const up = basis.up.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const right = basis.right.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  return `basis:${swap}|${flip}|${scale}|${forward}|${up}|${right}`;
};

const paramsSignature = (params: StrobeWeightParams) => {
  const center01 = quantizeSectorCenter01(params.sectorCenter01, params.totalSectors);
  const parts = [
    `total=${Math.floor(params.totalSectors)}`,
    `live=${Math.floor(params.liveSectors)}`,
    `center=${Math.round(center01 * 1e6) / 1e6}`,
    `sigma=${Math.round(params.gaussianSigma * 1e6) / 1e6}`,
    `floor=${Math.round(params.sectorFloor * 1e6) / 1e6}`,
    `split=${params.splitEnabled ? 1 : 0}`,
    `frac=${Math.round((params.splitFrac ?? 0) * 1e6) / 1e6}`,
    `mode=${params.syncMode ?? 1}`,
  ];
  return parts.join("|");
};

export const applySchedulerWeights = (
  hist: HullSurfaceStrobeHist | null | undefined,
  params: StrobeWeightParams,
  opts?: { surfaceHash?: string; basis?: HullBasisResolved | null },
) => {
  if (!hist) return null;
  const cacheKeyRaw = [
    opts?.surfaceHash ?? "surface:none",
    basisSignature(opts?.basis),
    paramsSignature(params),
    hist.sectorCount,
    hist.triangleAreaTotal ?? 0,
  ].join("|");
  const hash = fnv1a32(cacheKeyRaw);
  const cacheKey = `${hash}|${cacheKeyRaw}`;
  const cached = strobeCache.get(cacheKey);
  if (cached) {
    // refresh insertion order (Map iteration order == insertion order)
    strobeCache.delete(cacheKey);
    strobeCache.set(cacheKey, cached);
    return { ...cached, cacheHit: true, hash };
  }
  const total = Math.max(1, hist.sectorCount || params.totalSectors);
  const weights = buildSectorWeights({ ...params, totalSectors: total });
  const clampLen = Math.min(weights.length, hist.vertices.length, hist.triangles.length, hist.triangleArea.length);
  const vertexWeighted = new Float32Array(clampLen);
  const triangleWeighted = new Float32Array(clampLen);
  const areaWeighted = new Float32Array(clampLen);
  let areaSum = 0;
  let vertexSum = 0;
  let triangleSum = 0;
  for (let i = 0; i < clampLen; i++) {
    const w = weights[i] ?? 0;
    const vw = (hist.vertices[i] ?? 0) * w;
    const tw = (hist.triangles[i] ?? 0) * w;
    const aw = (hist.triangleArea[i] ?? 0) * w;
    vertexWeighted[i] = vw;
    triangleWeighted[i] = tw;
    areaWeighted[i] = aw;
    vertexSum += vw;
    triangleSum += tw;
    areaSum += aw;
  }
  const area01 = new Float32Array(clampLen);
  const v01 = new Float32Array(clampLen);
  const t01 = new Float32Array(clampLen);
  const invArea = areaSum > 1e-12 ? 1 / areaSum : 0;
  const invV = vertexSum > 1e-12 ? 1 / vertexSum : 0;
  const invT = triangleSum > 1e-12 ? 1 / triangleSum : 0;
  for (let i = 0; i < clampLen; i++) {
    area01[i] = areaWeighted[i] * invArea;
    v01[i] = vertexWeighted[i] * invV;
    t01[i] = triangleWeighted[i] * invT;
  }

  const result = {
    weights,
    vertexWeighted,
    triangleWeighted,
    areaWeighted,
    areaWeighted01: area01,
    vertexWeighted01: v01,
    triangleWeighted01: t01,
    hash,
    cacheHit: false,
  };
  strobeCache.set(cacheKey, result);
  if (strobeCache.size > MAX_STROBE_CACHE_ENTRIES) {
    for (const key of strobeCache.keys()) {
      strobeCache.delete(key);
      if (strobeCache.size <= MAX_STROBE_CACHE_ENTRIES) break;
    }
  }
  return result;
};

type SurfaceVoxelParams = {
  frame: LatticeFrame | null | undefined;
  surface: HullSurfaceMeshResult["surface"] | null | undefined;
  sectorWeights?: Float32Array | null;
  perVertexDfdr?: Float32Array | number | null;
  gateScale?: number;
  driveScale?: number;
  driveLadder?: HullLatticeDriveLadderScalars | null;
  shellThickness?: number;
  sampleBudget?: number;
  surfaceHash?: string;
  weightsHash?: string;
  dfdrSignature?: string;
};

export type HullLatticeDriveLadderScalars = {
  R: number;
  sigma: number;
  beta: number;
  gate: number;
  ampChain: number;
};

export type HullSurfaceVoxelDriveLadderMetadata = {
  scalars: HullLatticeDriveLadderScalars | null;
  gateScale: number;
  driveScale: number;
  dfdrSignature: string;
  signature: string;
  hash: string;
};

export type HullSurfaceVoxelVolumeMetadata = {
  driveLadder: HullSurfaceVoxelDriveLadderMetadata;
  provenance: LatticeProvenance;
};

export type HullSurfaceVoxelVolume = {
  hash: string;
  cacheHit: boolean;
  dims: [number, number, number];
  voxelSize: number;
  bounds: [number, number, number];
  metadata: HullSurfaceVoxelVolumeMetadata;
  gate3D: Float32Array;
  dfdr3D: Float32Array;
  drive3D: Float32Array;
  weightAccum: Float32Array;
  clampReasons: string[];
  stats: {
    samples: number;
    voxelsTouched: number;
    coverage: number;
    maxGate: number;
    maxDfdr: number;
    maxDrive: number;
    budgetHit: boolean;
  };
};

const voxelCache = new Map<string, HullSurfaceVoxelVolume>();

const clampIndex = (value: number, maxExclusive: number) =>
  Math.min(Math.max(value, 0), Math.max(0, maxExclusive - 1));

const closestPointOnTriangle3D = (
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

const barycentricOnTriangle = (
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) => {
  const v0x = bx - ax;
  const v0y = by - ay;
  const v0z = bz - az;
  const v1x = cx - ax;
  const v1y = cy - ay;
  const v1z = cz - az;
  const v2x = px - ax;
  const v2y = py - ay;
  const v2z = pz - az;

  const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
  const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
  const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
  const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return [1 / 3, 1 / 3, 1 / 3] as const;
  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;
  return [
    clamp(u, 0, 1),
    clamp(v, 0, 1),
    clamp(w, 0, 1),
  ] as const;
};

const signatureFromArray = (arr: Float32Array | null | undefined, limit = 12) => {
  if (!arr || arr.length === 0) return "none";
  const step = Math.max(1, Math.floor(arr.length / limit));
  const samples: number[] = [];
  for (let i = 0; i < arr.length; i += step) {
    const v = arr[i];
    if (Number.isFinite(v)) samples.push(Math.round(v * 1e4));
  }
  return `${arr.length}:${samples.join(",")}`;
};

export const voxelizeHullSurfaceStrobe = (
  params: SurfaceVoxelParams,
): { volume: HullSurfaceVoxelVolume | null; clampReasons: string[]; hash?: string } => {
  const clampReasons: string[] = [];
  const surface = params.surface;
  const frame = params.frame;
  if (!surface) {
    clampReasons.push("voxel:missingSurface");
    return { volume: null, clampReasons };
  }
  if (!frame) {
    clampReasons.push("voxel:missingFrame");
    return { volume: null, clampReasons };
  }

  const triCount = Math.max(0, Math.floor(surface.indices.length / 3));
  if (triCount === 0) {
    clampReasons.push("voxel:noTriangles");
    return { volume: null, clampReasons };
  }

  const dims = frame.dims;
  const totalVoxels = Math.max(1, frame.voxelCount);
  const shellThickness = Math.max(1e-6, params.shellThickness ?? frame.voxelSize_m * 0.75);
  const maxSamples = Math.max(1, Math.floor(params.sampleBudget ?? totalVoxels * 6));
  const gateScale = Number.isFinite(params.gateScale) ? (params.gateScale as number) : 1;
  const driveScale = Number.isFinite(params.driveScale) ? (params.driveScale as number) : 1;
  const sectorWeights =
    params.sectorWeights && params.sectorWeights.length
      ? params.sectorWeights
      : new Float32Array(Math.max(1, surface.sectorCount || 1)).fill(1);

  const positions =
    frame.worldToLattice && !isIdentityMatrix(frame.worldToLattice)
      ? transformPositions(surface.positions, frame.worldToLattice)
      : surface.positions;
  const vertexCount = surface.vertexCount ?? Math.floor(positions.length / 3);
  const vertexGate = new Float32Array(vertexCount);
  const vertexDfdr = new Float32Array(vertexCount);
  const dfdrDefault = typeof params.perVertexDfdr === "number" ? params.perVertexDfdr : 1;
  const perVertexDfdr = params.perVertexDfdr instanceof Float32Array ? params.perVertexDfdr : null;

  for (let i = 0; i < vertexCount; i++) {
    const sectorIdx = surface.vertexSectors[i] ?? 0;
    const gate = sectorIdx >= 0 && sectorIdx < sectorWeights.length ? sectorWeights[sectorIdx] : 0;
    vertexGate[i] = Number.isFinite(gate) ? gate : 0;
    const dfdr = perVertexDfdr ? perVertexDfdr[i] ?? dfdrDefault : dfdrDefault;
    vertexDfdr[i] = Number.isFinite(dfdr) ? dfdr : 0;
  }

  const weightsSig = params.weightsHash ?? signatureFromArray(sectorWeights);
  const dfdrSig = params.dfdrSignature ?? signatureFromArray(perVertexDfdr);
  const driveLadderSignature = [dfdrSig, `g${Math.round(gateScale * 1e6)}`, `d${Math.round(driveScale * 1e6)}`].join(
    "|",
  );
  const driveLadderMeta: HullSurfaceVoxelDriveLadderMetadata = {
    scalars: params.driveLadder ?? null,
    gateScale,
    driveScale,
    dfdrSignature: dfdrSig,
    signature: driveLadderSignature,
    hash: fnv1a32(driveLadderSignature),
  };

  const cacheKeyRaw = [
    params.surfaceHash ?? surface.key ?? surface.meshHash ?? "surface:none",
    surface.lod,
    surface.handedness,
    surface.vertexCount,
    surface.triangleCount,
    `${dims[0]}x${dims[1]}x${dims[2]}`,
    frame.voxelSize_m.toFixed(6),
    shellThickness.toFixed(6),
    weightsSig,
    dfdrSig,
    `g${Math.round(gateScale * 1e6)}`,
    `d${Math.round(driveScale * 1e6)}`,
  ].join("|");
  const cacheKey = `${fnv1a32(cacheKeyRaw)}|${cacheKeyRaw}`;
  const cached = voxelCache.get(cacheKey);
  if (cached) {
    voxelCache.delete(cacheKey);
    voxelCache.set(cacheKey, cached);
    return {
      volume: {
        ...cached,
        cacheHit: true,
        metadata: { ...cached.metadata, provenance: resolveLatticeProvenance(frame.provenance) },
        clampReasons: [...cached.clampReasons],
      },
      clampReasons: [...cached.clampReasons],
      hash: cacheKey,
    };
  }

  const gateAccum = new Float32Array(totalVoxels);
  const dfdrAccum = new Float32Array(totalVoxels);
  const driveAccum = new Float32Array(totalVoxels);
  const weightAccum = new Float32Array(totalVoxels);

  const voxel = frame.voxelSize_m;
  const invVoxel = voxel > 0 ? 1 / voxel : 0;
  const min = frame.bounds.minLattice;
  let samples = 0;
  let budgetHit = false;
  let voxelsTouched = 0;

  for (let tri = 0; tri < triCount; tri++) {
    if (budgetHit) break;
    const ia = surface.indices[tri * 3] ?? 0;
    const ib = surface.indices[tri * 3 + 1] ?? 0;
    const ic = surface.indices[tri * 3 + 2] ?? 0;
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

    const triMinX = Math.min(ax, bx, cx) - shellThickness;
    const triMaxX = Math.max(ax, bx, cx) + shellThickness;
    const triMinY = Math.min(ay, by, cy) - shellThickness;
    const triMaxY = Math.max(ay, by, cy) + shellThickness;
    const triMinZ = Math.min(az, bz, cz) - shellThickness;
    const triMaxZ = Math.max(az, bz, cz) + shellThickness;

    const ix0 = clampIndex(Math.floor((triMinX - min[0]) * invVoxel), dims[0]);
    const iy0 = clampIndex(Math.floor((triMinY - min[1]) * invVoxel), dims[1]);
    const iz0 = clampIndex(Math.floor((triMinZ - min[2]) * invVoxel), dims[2]);
    const ix1 = clampIndex(Math.floor((triMaxX - min[0]) * invVoxel), dims[0]);
    const iy1 = clampIndex(Math.floor((triMaxY - min[1]) * invVoxel), dims[1]);
    const iz1 = clampIndex(Math.floor((triMaxZ - min[2]) * invVoxel), dims[2]);

    const gateA = vertexGate[ia] ?? 0;
    const gateB = vertexGate[ib] ?? 0;
    const gateC = vertexGate[ic] ?? 0;
    const dfdrA = vertexDfdr[ia] ?? 0;
    const dfdrB = vertexDfdr[ib] ?? 0;
    const dfdrC = vertexDfdr[ic] ?? 0;

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
          const pz = min[2] + (iz + 0.5) * voxel;
          const cp = closestPointOnTriangle3D(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          const dx = px - cp[0];
          const dy = py - cp[1];
          const dz = pz - cp[2];
          const dist = Math.hypot(dx, dy, dz);
          if (dist > shellThickness) continue;
          const bary = barycentricOnTriangle(cp[0], cp[1], cp[2], ax, ay, az, bx, by, bz, cx, cy, cz);
          const gate = bary[0] * gateA + bary[1] * gateB + bary[2] * gateC;
          const dfdr = bary[0] * dfdrA + bary[1] * dfdrB + bary[2] * dfdrC;
          const gateScaled = gate * gateScale;
          const drive = gateScaled * dfdr * driveScale;
          const idx = ix + dims[0] * (iy + dims[1] * iz);
          if (weightAccum[idx] === 0) voxelsTouched += 1;
          gateAccum[idx] += gateScaled;
          dfdrAccum[idx] += dfdr;
          driveAccum[idx] += drive;
          weightAccum[idx] += 1;
          samples += 1;
        }
      }
    }
  }

  if (budgetHit) clampReasons.push("voxel:budgetHit");

  const gate3D = new Float32Array(totalVoxels);
  const dfdr3D = new Float32Array(totalVoxels);
  const drive3D = new Float32Array(totalVoxels);
  let maxGate = 0;
  let maxDfdr = 0;
  let maxDrive = 0;
  for (let i = 0; i < totalVoxels; i++) {
    const w = weightAccum[i];
    if (w <= 0) continue;
    const inv = 1 / w;
    const g = gateAccum[i] * inv;
    const df = dfdrAccum[i] * inv;
    const dr = driveAccum[i] * inv;
    gate3D[i] = g;
    dfdr3D[i] = df;
    drive3D[i] = dr;
    const gAbs = Math.abs(g);
    const dfAbs = Math.abs(df);
    const drAbs = Math.abs(dr);
    if (gAbs > maxGate) maxGate = gAbs;
    if (dfAbs > maxDfdr) maxDfdr = dfAbs;
    if (drAbs > maxDrive) maxDrive = drAbs;
  }

  const volume: HullSurfaceVoxelVolume = {
    hash: cacheKey,
    cacheHit: false,
    dims: [dims[0], dims[1], dims[2]],
    voxelSize: frame.voxelSize_m,
    bounds: [
      Math.abs(frame.bounds.halfSize[0]),
      Math.abs(frame.bounds.halfSize[1]),
      Math.abs(frame.bounds.halfSize[2]),
    ],
    metadata: {
      driveLadder: driveLadderMeta,
      provenance: resolveLatticeProvenance(frame.provenance),
    },
    gate3D,
    dfdr3D,
    drive3D,
    weightAccum,
    clampReasons: [...clampReasons],
    stats: {
      samples,
      voxelsTouched,
      coverage: voxelsTouched / totalVoxels,
      maxGate,
      maxDfdr,
      maxDrive,
      budgetHit,
    },
  };

  voxelCache.set(cacheKey, volume);
  if (voxelCache.size > MAX_VOXEL_CACHE_ENTRIES) {
    for (const key of voxelCache.keys()) {
      voxelCache.delete(key);
      if (voxelCache.size <= MAX_VOXEL_CACHE_ENTRIES) break;
    }
  }
  return { volume, clampReasons, hash: cacheKey };
};
