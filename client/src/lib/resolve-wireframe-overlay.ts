import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import { applyHullBasisToPositions, type HullBasisResolved } from "@shared/hull-basis";
import type { HullPreviewIndexedGeometry, HullPreviewLOD, HullPreviewPayload } from "@shared/schema";

export type WireframeOverlayLod = "preview" | "high";

export type WireframeContactPatch = {
  sector: number;
  gateAvg: number;
  gateMin: number;
  gateMax: number;
  count: number;
  blanketAvg?: number;
  blanketMin?: number;
  blanketMax?: number;
};

export type WireframeGateParams = {
  phase01?: number;
  sectorCenter01?: number;
  gaussianSigma?: number;
  totalSectors?: number;
  liveSectors?: number;
  sectorFloor?: number;
  lumpExp?: number;
  duty?: number;
  gateView?: number;
  splitEnabled?: boolean;
  splitFrac?: number;
  syncMode?: number;
  tilesPerSectorVector?: ArrayLike<number> | null;
  fieldThreshold?: number;
  gradientThreshold?: number;
};

export type WireframeOverlayBuffers = {
  key: string;
  positions: Float32Array;
  lod: WireframeOverlayLod;
  meshHash?: string;
  basis?: HullBasisResolved;
  lineWidth: number;
  alpha: number;
  color: [number, number, number];
  triangleCount?: number;
  vertexCount?: number;
  clampReasons: string[];
  angles01?: Float32Array;
  gateDuty?: Float32Array;
  blanketWeights?: Float32Array;
  blanketSignature?: string;
  colors?: Float32Array;
  patches?: WireframeContactPatch[];
  fieldThreshold?: number;
  gradientThreshold?: number;
  colorSignature?: string;
  colorMode?: "gate" | "field";
  fieldStats?: { min: number; max: number; mean: number; absMax: number; absMean?: number };
};

export type WireframeOverlayResult = {
  overlay: WireframeOverlayBuffers | null;
  clampReasons: string[];
  lod: WireframeOverlayLod;
  source: "preview" | "fallback";
};

export type WireframeOverlayBudgets = {
  maxPreviewTriangles: number;
  maxHighTriangles: number;
  maxEdges: number;
  maxUploadBytes: number;
  minLineWidth: number;
  maxLineWidth: number;
};

export const VIEWER_WIREFRAME_BUDGETS: WireframeOverlayBudgets = Object.freeze({
  maxPreviewTriangles: 25000,
  maxHighTriangles: 90000,
  maxEdges: 220000,
  maxUploadBytes: 12_000_000, // ~12 MB guardrail to keep uploads from blowing up memory/GL buffers
  minLineWidth: 0.65,
  maxLineWidth: 1.8,
});

export type HullSurfaceMesh = {
  key: string;
  lod: WireframeOverlayLod;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array | null;
  tangents?: Float32Array | null;
  vertexAngles01: Float32Array;
  vertexSectors: Uint16Array | Uint32Array;
  triangleAngles01: Float32Array;
  triangleSectors: Uint16Array | Uint32Array;
  sectorCount: number;
  triangleCount: number;
  vertexCount: number;
  meshHash?: string;
  basis: HullBasisResolved;
  handedness: 1 | -1;
  bounds: ReturnType<typeof applyHullBasisToPositions>["bounds"];
  wireframe: WireframeOverlayBuffers | null;
  clampReasons: string[];
  source: "preview" | "fallback";
};

export type HullSurfaceMeshResult = {
  surface: HullSurfaceMesh | null;
  clampReasons: string[];
  lod: WireframeOverlayLod;
  source: "preview" | "fallback";
};

export type HullSurfaceMeshOptions = (Partial<WireframeOverlayBudgets> & {
  lod?: WireframeOverlayLod;
  targetDims?: { Lx_m?: number; Ly_m?: number; Lz_m?: number } | null;
  totalSectors?: number;
}) | null;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const wrap01 = (value: number) => {
  const v = value - Math.floor(value);
  return v < 0 ? v + 1 : v;
};
const divergeColor = (x: number): [number, number, number] => {
  const c1: [number, number, number] = [0.06, 0.25, 0.98];
  const c2: [number, number, number] = [0.94, 0.94, 0.95];
  const c3: [number, number, number] = [0.95, 0.3, 0.08];
  const t = clamp(0.5 + 0.5 * x, 0, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return [
      c1[0] + (c2[0] - c1[0]) * k,
      c1[1] + (c2[1] - c1[1]) * k,
      c1[2] + (c2[2] - c1[2]) * k,
    ];
  }
  const k = (t - 0.5) / 0.5;
  return [
    c2[0] + (c3[0] - c2[0]) * k,
    c2[1] + (c3[1] - c2[1]) * k,
    c2[2] + (c3[2] - c2[2]) * k,
  ];
};

const toFloatArray = (raw?: Float32Array | number[] | null): Float32Array | null => {
  if (!raw) return null;
  if (raw instanceof Float32Array) return raw;
  if (Array.isArray(raw)) return new Float32Array(raw);
  return null;
};

const lodHasGeometry = (lod?: HullPreviewLOD | null) => {
  if (!lod?.indexedGeometry) return false;
  const asArray = toFloatArray(lod.indexedGeometry.positions);
  return !!asArray && asArray.length >= 6;
};

const dimsFromObb = (obb?: { halfSize?: [number, number, number] | number[] | null }) => {
  const half = obb?.halfSize;
  if (!half || !Array.isArray(half) || half.length < 3) return null;
  return {
    Lx_m: Math.abs(half[0] ?? 0) * 2,
    Ly_m: Math.abs(half[1] ?? 0) * 2,
    Lz_m: Math.abs(half[2] ?? 0) * 2,
  };
};

const pickLod = (payload: HullPreviewPayload | null | undefined, pref: WireframeOverlayLod) => {
  if (!payload) return null;
  const coarse: (HullPreviewLOD | undefined)[] = [];
  const full: (HullPreviewLOD | undefined)[] = [];
  const meshLods = payload.mesh?.lods ?? [];
  if (pref === "preview") {
    coarse.push(payload.lodCoarse, payload.mesh?.coarseLod);
    coarse.push(...(payload.lods ?? []).filter((lod) => lod?.tag === "coarse"));
    full.push(payload.lodFull, payload.mesh?.fullLod);
    full.push(...(payload.lods ?? []).filter((lod) => lod?.tag === "full"));
  } else {
    full.push(payload.lodFull, payload.mesh?.fullLod);
    full.push(...(payload.lods ?? []).filter((lod) => lod?.tag === "full"));
    coarse.push(payload.lodCoarse, payload.mesh?.coarseLod);
    coarse.push(...(payload.lods ?? []).filter((lod) => lod?.tag === "coarse"));
  }
  const ordered = [...coarse, ...full, ...meshLods];
  for (const candidate of ordered) {
    if (lodHasGeometry(candidate)) return candidate as HullPreviewLOD;
  }
  const first = ordered.find((lod) => !!lod);
  return first ?? null;
};

const buildAngles = (positions: Float32Array) => {
  const count = positions.length / 3;
  const angles = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const x = positions[base];
    const z = positions[base + 2];
    const a = Math.atan2(z, x);
    const a01 = a < 0 ? a / (Math.PI * 2) + 1 : a / (Math.PI * 2);
    angles[i] = a01;
  }
  return angles;
};

const normalizeTiles = (tiles?: ArrayLike<number> | null) => {
  if (!tiles) return null;
  const asArray = Array.from(tiles as ArrayLike<number>).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
  if (!asArray.length) return null;
  const max = Math.max(...asArray, 1e-6);
  const values = asArray.map((v) => v / max);
  const signature = `${values.length}:${values
    .slice(0, 16)
    .map((v) => Math.round(v * 1000).toString(16))
    .join(",")}`;
  return { values, signature };
};

const ensureBlanketWeights = (
  overlay: WireframeOverlayBuffers,
  params: { tiles?: ArrayLike<number> | null; totalSectors?: number },
) => {
  const normalized = normalizeTiles(params.tiles);
  if (!normalized) {
    overlay.blanketWeights = undefined;
    overlay.blanketSignature = undefined;
    return;
  }
  const total = Math.max(1, Math.floor(params.totalSectors ?? normalized.values.length));
  const count = overlay.positions.length / 3;
  if (!overlay.angles01 || overlay.angles01.length !== count) {
    overlay.angles01 = buildAngles(overlay.positions);
  }
  const blanket =
    overlay.blanketWeights && overlay.blanketWeights.length === count
      ? overlay.blanketWeights
      : new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = overlay.angles01![i];
    const idx = Math.min(total - 1, Math.max(0, Math.floor(theta * total)));
    blanket[i] = normalized.values[idx % normalized.values.length] ?? 0;
  }
  overlay.blanketWeights = blanket;
  overlay.blanketSignature = normalized.signature;
};

export function colorizeWireframeOverlay(
  overlay: WireframeOverlayBuffers,
  params: WireframeGateParams,
) {
  const count = overlay.positions.length / 3;
  if (!overlay.angles01 || overlay.angles01.length !== count) {
    overlay.angles01 = buildAngles(overlay.positions);
  }
  if (params.tilesPerSectorVector) {
    ensureBlanketWeights(overlay, {
      tiles: params.tilesPerSectorVector,
      totalSectors: params.totalSectors,
    });
  }
  const gateDuty =
    overlay.gateDuty && overlay.gateDuty.length === count ? overlay.gateDuty : new Float32Array(count);
  overlay.gateDuty = gateDuty;
  const colors =
    overlay.colors && overlay.colors.length === count * 3 ? overlay.colors : new Float32Array(count * 3);
  overlay.colors = colors;
  const total = Math.max(1, Math.floor(params.totalSectors ?? 1));
  const live = Math.max(1, Math.min(total, Math.floor(params.liveSectors ?? total)));
  const sigma = Math.max(1e-4, params.gaussianSigma ?? 0.35 / total);
  const center = wrap01(params.sectorCenter01 ?? 0.5);
  const sectorFloor = clamp(params.sectorFloor ?? 0.08, 0, 0.99);
  const peakFrac = 1 - sectorFloor;
  const lumpExp = Math.max(0.5, params.lumpExp ?? 1.25);
  const duty = clamp(params.duty ?? 0, 0, 1);
  const gateView = clamp(params.gateView ?? 1, 0, 4);
  const phase01 = wrap01(params.phase01 ?? 0);
  const syncMode = params.syncMode ?? 0;
  const splitEnabled = !!params.splitEnabled;
  const splitFrac = clamp(params.splitFrac ?? 0.5, 0, 1);
  const blanket = overlay.blanketWeights;
  const patches: WireframeContactPatch[] = [];
  const sectorBuckets: {
    gateMin: number;
    gateMax: number;
    gateSum: number;
    blanketMin?: number;
    blanketMax?: number;
    blanketSum?: number;
    count: number;
  }[] = Array.from({ length: total }, () => ({
    gateMin: Number.POSITIVE_INFINITY,
    gateMax: Number.NEGATIVE_INFINITY,
    gateSum: 0,
    count: 0,
  }));

  for (let i = 0; i < count; i++) {
    let a01 = wrap01(overlay.angles01![i] + phase01);
    let wNorm: number;
    if (syncMode === 1) {
      const dist = Math.min(Math.abs(a01 - center), 1 - Math.abs(a01 - center));
      const g1 = Math.exp(-0.5 * (dist * dist) / (sigma * sigma));
      let g = g1;
      if (splitEnabled) {
        const center2 = wrap01(center + 0.5);
        const dist2 = Math.min(Math.abs(a01 - center2), 1 - Math.abs(a01 - center2));
        const g2 = Math.exp(-0.5 * (dist2 * dist2) / (sigma * sigma));
        g = g1 * splitFrac + g2 * (1 - splitFrac);
      }
      const avgG = Math.min(1, sigma * 2.5066283);
      const gNorm = Math.min(g / Math.max(avgG, 1e-4), 12);
      wNorm = sectorFloor + peakFrac * gNorm;
    } else {
      const idx = Math.min(total - 1, Math.max(0, Math.floor(a01 * total)));
      const on = idx < live ? 1 : 0;
      const frac = Math.max(1 / total, live / total);
      const norm = frac > 1e-9 ? Math.min(on / frac, 12) : on;
      wNorm = sectorFloor + peakFrac * norm;
    }
    const gateWF = Math.pow(Math.sqrt(Math.max(0, wNorm)), lumpExp);
    const gateScalar = gateWF * gateView * Math.max(0.35, duty);
    gateDuty[i] = gateScalar;

    const sectorIdx = Math.min(total - 1, Math.max(0, Math.floor(a01 * total)));
    const bucket = sectorBuckets[sectorIdx];
    bucket.gateMin = Math.min(bucket.gateMin, gateScalar);
    bucket.gateMax = Math.max(bucket.gateMax, gateScalar);
    bucket.gateSum += gateScalar;
    bucket.count += 1;
    const blanketVal = blanket ? blanket[i] ?? 0 : null;
    if (blanketVal !== null) {
      bucket.blanketMin = bucket.blanketMin === undefined ? blanketVal : Math.min(bucket.blanketMin, blanketVal);
      bucket.blanketMax = bucket.blanketMax === undefined ? blanketVal : Math.max(bucket.blanketMax, blanketVal);
      bucket.blanketSum = (bucket.blanketSum ?? 0) + blanketVal;
    }

    const delta = a01 - center;
    const wrappedDelta = delta > 0.5 ? delta - 1 : delta < -0.5 ? delta + 1 : delta;
    const hue = clamp(wrappedDelta * 2, -1, 1);
    const base = divergeColor(hue);
    const amp = 0.35 + 0.65 * clamp(gateScalar, 0, 1.6);
    let r = base[0] * amp;
    let g = base[1] * amp;
    let b = base[2] * amp;
    if (blanketVal !== null) {
      const t = Math.pow(clamp(blanketVal, 0, 1), 0.65);
      const mix = (a: number, b: number, k: number) => a * (1 - k) + b * k;
      r = mix(r, 0.13, t);
      g = mix(g, 0.83, t);
      b = mix(b, 0.62, t);
    }
    const cBase = i * 3;
    colors[cBase] = clamp(r, 0, 1);
    colors[cBase + 1] = clamp(g, 0, 1);
    colors[cBase + 2] = clamp(b, 0, 1);
  }

  const fieldThreshold = params.fieldThreshold ?? overlay.fieldThreshold ?? 0.45;
  const gradientThreshold = params.gradientThreshold ?? overlay.gradientThreshold ?? 0.22;
  for (let s = 0; s < sectorBuckets.length; s++) {
    const bucket = sectorBuckets[s];
    if (!bucket.count) continue;
    const gateAvg = bucket.gateSum / bucket.count;
    const gateSpread = bucket.gateMax - bucket.gateMin;
    const gatePeak = Math.max(Math.abs(bucket.gateMin), Math.abs(bucket.gateMax));
    if (gatePeak < fieldThreshold && gateSpread < gradientThreshold) continue;
    const patch: WireframeContactPatch = {
      sector: s,
      gateAvg,
      gateMin: bucket.gateMin,
      gateMax: bucket.gateMax,
      count: bucket.count,
    };
    if (bucket.blanketSum !== undefined && bucket.blanketMin !== undefined && bucket.blanketMax !== undefined) {
      patch.blanketAvg = bucket.blanketSum / bucket.count;
      patch.blanketMin = bucket.blanketMin;
      patch.blanketMax = bucket.blanketMax;
    }
    patches.push(patch);
  }
  patches.sort((a, b) => b.gateMax - a.gateMax);
  overlay.patches = patches;
  overlay.fieldThreshold = fieldThreshold;
  overlay.gradientThreshold = gradientThreshold;
  return { colors, gateDuty, blanket, patches };
}

export function colorizeFieldProbe(
  values: ArrayLike<number>,
  opts?: { absMax?: number; clamp?: number },
) {
  const count = values.length;
  const colors = new Float32Array(count * 3);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let absSum = 0;
  let absMax = opts?.absMax ?? 0;
  for (let i = 0; i < count; i++) {
    const v = Number(values[i] ?? 0);
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    absSum += Math.abs(v);
    if (Math.abs(v) > absMax) absMax = Math.abs(v);
  }
  const mean = count > 0 ? sum / count : 0;
  const absMean = count > 0 ? absSum / count : 0;
  const denom = Math.max(opts?.absMax ?? absMax, 1e-6);
  const clampTo = Math.max(1e-6, opts?.clamp ?? 1);
  for (let i = 0; i < count; i++) {
    const v = Number(values[i] ?? 0);
    const norm = clamp(v / denom, -clampTo, clampTo);
    const c = divergeColor(norm);
    const base = i * 3;
    colors[base] = clamp(c[0], 0, 1);
    colors[base + 1] = clamp(c[1], 0, 1);
    colors[base + 2] = clamp(c[2], 0, 1);
  }
  return { colors, stats: { min, max, mean, absMax, absMean } };
}

const buildEdges = (
  positions: Float32Array,
  indices: Uint32Array | Uint16Array | Float32Array | number[] | null,
  edgeBudget: number,
) => {
  if (!indices || (indices as any).length === 0) return null;
  const idxArray =
    indices instanceof Uint32Array || indices instanceof Uint16Array || indices instanceof Float32Array
      ? indices
      : new Uint32Array(indices as number[]);

  const seen = new Set<string>();
  const lines: number[] = [];
  const vertCount = positions.length / 3;
  const addEdge = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a < 0 || b < 0 || a >= vertCount || b >= vertCount) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    const aBase = a * 3;
    const bBase = b * 3;
    lines.push(
      positions[aBase + 0],
      positions[aBase + 1],
      positions[aBase + 2],
      positions[bBase + 0],
      positions[bBase + 1],
      positions[bBase + 2],
    );
  };

  for (let i = 0; i + 2 < idxArray.length; i += 3) {
    const i0 = idxArray[i] ?? 0;
    const i1 = idxArray[i + 1] ?? 0;
    const i2 = idxArray[i + 2] ?? 0;
    addEdge(i0, i1);
    addEdge(i1, i2);
    addEdge(i2, i0);
    if (lines.length / 6 > edgeBudget) break;
  }

  if (lines.length === 0 || lines.length / 6 > edgeBudget) return null;
  return new Float32Array(lines);
};

const coerceIndexArray = (
  indices: Uint32Array | Uint16Array | Float32Array | number[] | null,
  vertexCount: number,
  reasonPrefix: string,
) => {
  const clampReasons: string[] = [];
  if (indices && (indices as any).length) {
    if (indices instanceof Uint32Array) return { indices, clampReasons };
    if (indices instanceof Uint16Array || indices instanceof Float32Array) {
      return { indices: new Uint32Array(indices), clampReasons };
    }
    if (Array.isArray(indices)) {
      return { indices: new Uint32Array(indices), clampReasons };
    }
  }
  if (vertexCount >= 3) {
    const triCount = Math.floor(vertexCount / 3);
    const generated = new Uint32Array(triCount * 3);
    for (let i = 0; i < generated.length; i++) generated[i] = i;
    clampReasons.push(`${reasonPrefix}:generatedIndices`);
    return { indices: generated, clampReasons };
  }
  return { indices: null, clampReasons };
};

const basisDeterminant = (basis: HullBasisResolved) => {
  const r = basis.right;
  const u = basis.up;
  const f = basis.forward;
  return (
    r[0] * (u[1] * f[2] - u[2] * f[1]) -
    r[1] * (u[0] * f[2] - u[2] * f[0]) +
    r[2] * (u[0] * f[1] - u[1] * f[0])
  );
};

const normalizeVec3Safe = (x: number, y: number, z: number, eps = 1e-9) => {
  const m = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(m) || m < eps) return [0, 0, 0] as const;
  return [x / m, y / m, z / m] as const;
};

const transformNormals = (
  normals: Float32Array | number[] | null | undefined,
  basis: HullBasisResolved,
  targetScale: [number, number, number],
) => {
  const src = toFloatArray(normals);
  if (!src || src.length < 3) return null;
  const out = new Float32Array(src.length);
  const sx = Math.max(Math.abs(basis.scale[0] * targetScale[0]), 1e-9);
  const sy = Math.max(Math.abs(basis.scale[1] * targetScale[1]), 1e-9);
  const sz = Math.max(Math.abs(basis.scale[2] * targetScale[2]), 1e-9);
  for (let i = 0; i + 2 < src.length; i += 3) {
    const nx = src[i] ?? 0;
    const ny = src[i + 1] ?? 0;
    const nz = src[i + 2] ?? 0;
    const swapX = basis.swap.x === "x" ? nx : basis.swap.x === "y" ? ny : nz;
    const swapY = basis.swap.y === "x" ? nx : basis.swap.y === "y" ? ny : nz;
    const swapZ = basis.swap.z === "x" ? nx : basis.swap.z === "y" ? ny : nz;
    const tx = (basis.flip.x ? -swapX : swapX) / sx;
    const ty = (basis.flip.y ? -swapY : swapY) / sy;
    const tz = (basis.flip.z ? -swapZ : swapZ) / sz;
    const [nxOut, nyOut, nzOut] = normalizeVec3Safe(tx, ty, tz);
    out[i] = nxOut;
    out[i + 1] = nyOut;
    out[i + 2] = nzOut;
  }
  return out;
};

const transformTangents = (
  tangents: Float32Array | number[] | null | undefined,
  basis: HullBasisResolved,
  targetScale: [number, number, number],
  handedness: 1 | -1,
) => {
  const src = toFloatArray(tangents);
  if (!src || src.length < 4 || src.length % 4 !== 0) return null;
  const out = new Float32Array(src.length);
  const sx = Math.max(Math.abs(basis.scale[0] * targetScale[0]), 1e-9);
  const sy = Math.max(Math.abs(basis.scale[1] * targetScale[1]), 1e-9);
  const sz = Math.max(Math.abs(basis.scale[2] * targetScale[2]), 1e-9);
  for (let i = 0; i + 3 < src.length; i += 4) {
    const txRaw = src[i] ?? 0;
    const tyRaw = src[i + 1] ?? 0;
    const tzRaw = src[i + 2] ?? 0;
    const swapX = basis.swap.x === "x" ? txRaw : basis.swap.x === "y" ? tyRaw : tzRaw;
    const swapY = basis.swap.y === "x" ? txRaw : basis.swap.y === "y" ? tyRaw : tzRaw;
    const swapZ = basis.swap.z === "x" ? txRaw : basis.swap.z === "y" ? tyRaw : tzRaw;
    const tx = (basis.flip.x ? -swapX : swapX) / sx;
    const ty = (basis.flip.y ? -swapY : swapY) / sy;
    const tz = (basis.flip.z ? -swapZ : swapZ) / sz;
    const [ox, oy, oz] = normalizeVec3Safe(tx, ty, tz);
    out[i] = ox;
    out[i + 1] = oy;
    out[i + 2] = oz;
    const w = Number.isFinite(src[i + 3]) ? (src[i + 3] as number) : 1;
    out[i + 3] = w * handedness;
  }
  return out;
};

const sanitizeTriangles = (
  positions: Float32Array,
  indices: Uint32Array,
  handedness: 1 | -1,
  reasonPrefix: string,
  areaEps = 1e-12,
) => {
  const out = new Uint32Array(indices.length);
  let outTris = 0;
  let culled = 0;
  const swapWinding = handedness < 0;
  let flipped = false;
  const areaEpsSq = areaEps * areaEps;
  const vertCount = positions.length / 3;

  for (let i = 0; i + 2 < indices.length; i += 3) {
    let a = indices[i] ?? 0;
    let b = indices[i + 1] ?? 0;
    let c = indices[i + 2] ?? 0;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      culled += 1;
      continue;
    }
    if (a < 0 || b < 0 || c < 0 || a >= vertCount || b >= vertCount || c >= vertCount) {
      culled += 1;
      continue;
    }
    if (a === b || b === c || c === a) {
      culled += 1;
      continue;
    }
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
    const areaSq = cx * cx + cy * cy + cz * cz;
    if (!Number.isFinite(areaSq) || areaSq <= areaEpsSq) {
      culled += 1;
      continue;
    }
    if (swapWinding) {
      const tmp = b;
      b = c;
      c = tmp;
      flipped = true;
    }
    const dst = outTris * 3;
    out[dst] = a;
    out[dst + 1] = b;
    out[dst + 2] = c;
    outTris += 1;
  }

  const trimmed = outTris * 3 === out.length ? out : out.slice(0, outTris * 3);
  const reasons: string[] = [];
  if (culled > 0) {
    reasons.push(`${reasonPrefix}:degenerateCulled`);
  }
  if (flipped) {
    reasons.push(`${reasonPrefix}:windingFlipped`);
  }
  return { indices: trimmed, culled, flipped, reasons };
};

const buildTriangleAngles = (positions: Float32Array, indices: Uint32Array) => {
  const triCount = Math.max(0, Math.floor(indices.length / 3));
  const angles = new Float32Array(triCount);
  for (let i = 0; i < triCount; i++) {
    const a = indices[i * 3] ?? 0;
    const b = indices[i * 3 + 1] ?? 0;
    const c = indices[i * 3 + 2] ?? 0;
    const aBase = a * 3;
    const bBase = b * 3;
    const cBase = c * 3;
    const cx = (positions[aBase] + positions[bBase] + positions[cBase]) / 3;
    const cz = (positions[aBase + 2] + positions[bBase + 2] + positions[cBase + 2]) / 3;
    const aRaw = Math.atan2(cz, cx);
    const a01 = aRaw < 0 ? aRaw / (Math.PI * 2) + 1 : aRaw / (Math.PI * 2);
    angles[i] = Number.isFinite(a01) ? wrap01(a01) : 0;
  }
  return angles;
};

const buildSectorIndices = (angles: Float32Array, totalSectors: number) => {
  const sectorCount = Math.max(1, Math.floor(totalSectors));
  const IndexArray = sectorCount <= 0xffff ? Uint16Array : Uint32Array;
  const sectors = new IndexArray(angles.length);
  const denom = Math.max(sectorCount, 1);
  for (let i = 0; i < angles.length; i++) {
    const a01 = wrap01(Number.isFinite(angles[i]) ? angles[i] : 0);
    const idx = Math.min(denom - 1, Math.max(0, Math.floor(a01 * denom)));
    sectors[i] = idx;
  }
  return { sectors, sectorCount };
};

const byteLengthOf = (array?: ArrayLike<number> | null) => {
  if (!array) return 0;
  const asAny = array as any;
  if (typeof asAny.byteLength === "number" && Number.isFinite(asAny.byteLength)) {
    return asAny.byteLength as number;
  }
  if (typeof asAny.length === "number" && Number.isFinite(asAny.length)) {
    return (asAny.length as number) * 4; // assume 32-bit float/int payloads
  }
  return 0;
};

const estimateGeometryBytes = (geometry: HullPreviewIndexedGeometry | undefined | null) => {
  if (!geometry) return 0;
  if (typeof geometry.byteLength === "number" && Number.isFinite(geometry.byteLength)) {
    return geometry.byteLength;
  }
  return (
    byteLengthOf(geometry.positions) +
    byteLengthOf(geometry.indices) +
    byteLengthOf(geometry.normals) +
    byteLengthOf(geometry.tangents)
  );
};

const clampLogOnce = new Set<string>();
const logClamp = (reason: string, meta?: Record<string, unknown>) => {
  try {
    if (reason.includes("missingMesh")) {
      const debug = typeof window !== "undefined" && Boolean((window as any).__wireframeClampDebug);
      if (!debug) return;
    }
    if (clampLogOnce.has(reason)) return;
    clampLogOnce.add(reason);
    // Keep terse to avoid noisy console in prod while still surfacing clamp breadcrumbs
    const isDegenerate = reason.includes("degenerate");
    const log = isDegenerate ? console.info : console.warn;
    log("[resolveWireframeOverlay] clamp", reason, meta ?? {});
  } catch {
    // ignore logging failures
  }
};

type PreparedHullGeometry = {
  positions: Float32Array;
  indices: Uint32Array | Uint16Array | Float32Array | number[] | null;
  basis: HullBasisResolved;
  bounds: ReturnType<typeof applyHullBasisToPositions>["bounds"];
  triangleCount?: number;
  vertexCount: number;
  meshHash?: string;
  normals?: Float32Array | null;
  tangents?: Float32Array | null;
  targetScale: [number, number, number];
  handedness: 1 | -1;
};

const resolveTargetDims = (
  payload: HullPreviewPayload,
  targetDims?: { Lx_m?: number; Ly_m?: number; Lz_m?: number } | null,
) =>
  targetDims ??
  payload.targetDims ??
  payload.hullMetrics?.dims_m ??
  dimsFromObb(payload.mesh?.obb ?? payload.obb) ??
  null;

const prepareHullGeometry = (
  payload: HullPreviewPayload | null | undefined,
  opts: {
    lodPref: WireframeOverlayLod;
    budgets: WireframeOverlayBudgets;
    targetDims?: { Lx_m?: number; Ly_m?: number; Lz_m?: number } | null;
    reasonPrefix: string;
  },
): { ok: true; clampReasons: string[]; geometry: PreparedHullGeometry } | { ok: false; clampReasons: string[] } => {
  const clampReasons: string[] = [];
  const prefix = opts.reasonPrefix;
  const clampFallback = (reason: string, meta?: Record<string, unknown>) => {
    const tagged = `${prefix}:${reason}`;
    clampReasons.push(tagged);
    logClamp(tagged, { lod: opts.lodPref, ...meta });
    return { ok: false as const, clampReasons };
  };

  if (!payload) {
    return clampFallback("missingMesh");
  }

  const lod = pickLod(payload, opts.lodPref);
  if (!lod) {
    return clampFallback("missingLod");
  }

  const geometry = lod.indexedGeometry;
  const positions = geometry?.positions ? toFloatArray(geometry.positions) : null;
  const indices = geometry?.indices ?? null;
  if (!positions || positions.length < 6) {
    return clampFallback("missingGeometry");
  }

  const uploadBytes = estimateGeometryBytes(geometry);
  if (uploadBytes > opts.budgets.maxUploadBytes) {
    return clampFallback("payloadTooLarge", {
      uploadBytes,
      budget: opts.budgets.maxUploadBytes,
      meshHash: payload.meshHash ?? payload.mesh?.meshHash,
    });
  }

  const triangleBudget = opts.lodPref === "preview" ? opts.budgets.maxPreviewTriangles : opts.budgets.maxHighTriangles;
  const idxAny: any = indices;
  const triangleCount =
    geometry?.triangleCount ??
    lod.triangleCount ??
    (Array.isArray(idxAny) || idxAny instanceof Uint32Array || idxAny instanceof Uint16Array || idxAny instanceof Float32Array
      ? Math.floor((idxAny.length ?? 0) / 3)
      : undefined);
  const decimationTarget = Math.max(
    Number.isFinite((lod as any)?.decimation?.targetTris) ? Number((lod as any).decimation.targetTris) : 0,
    Number.isFinite((lod as any)?.decimation?.achievedTris) ? Number((lod as any).decimation.achievedTris) : 0,
  );
  if (decimationTarget > triangleBudget) {
    return clampFallback("decimationOverBudget", {
      decimationTarget,
      triangleBudget,
      meshHash: payload.meshHash ?? payload.mesh?.meshHash,
    });
  }
  if (triangleCount && triangleCount > triangleBudget) {
    return clampFallback("overBudget", {
      triangleCount,
      triangleBudget,
      meshHash: payload.meshHash ?? payload.mesh?.meshHash,
    });
  }

  const targetDims = resolveTargetDims(payload, opts.targetDims);
  const { positions: transformed, basis, bounds, targetScale } = applyHullBasisToPositions(positions, {
    basis: payload.mesh?.basis ?? payload.basis,
    extraScale: payload.scale,
    targetDims: targetDims ?? undefined,
  });
  const handedness: 1 | -1 = basisDeterminant(basis) < 0 ? -1 : 1;
  const normals = transformNormals(geometry?.normals, basis, targetScale);
  const tangents = transformTangents(geometry?.tangents, basis, targetScale, handedness);

  return {
    ok: true,
    clampReasons,
    geometry: {
      positions: transformed,
      indices,
      basis,
      bounds,
      normals,
      tangents,
      targetScale,
      handedness,
      triangleCount,
      vertexCount: Math.floor(transformed.length / 3),
      meshHash: payload.meshHash ?? payload.mesh?.meshHash,
    },
  };
};

export function resolveWireframeOverlay(
  payload: HullPreviewPayload | null | undefined,
  opts?: (Partial<WireframeOverlayBudgets> & {
    lod?: WireframeOverlayLod;
    targetDims?: { Lx_m?: number; Ly_m?: number; Lz_m?: number } | null;
    maxPreviewTriangles?: number;
    maxHighTriangles?: number;
    maxEdges?: number;
    totalSectors?: number;
    tilesPerSectorVector?: ArrayLike<number> | null;
  }) | null,
): WireframeOverlayResult {
  const lodPref = opts?.lod ?? "preview";
  const budgets = {
    maxPreviewTriangles: opts?.maxPreviewTriangles ?? VIEWER_WIREFRAME_BUDGETS.maxPreviewTriangles,
    maxHighTriangles: opts?.maxHighTriangles ?? VIEWER_WIREFRAME_BUDGETS.maxHighTriangles,
    maxEdges: opts?.maxEdges ?? VIEWER_WIREFRAME_BUDGETS.maxEdges,
    maxUploadBytes: opts?.maxUploadBytes ?? VIEWER_WIREFRAME_BUDGETS.maxUploadBytes,
    minLineWidth: opts?.minLineWidth ?? VIEWER_WIREFRAME_BUDGETS.minLineWidth,
    maxLineWidth: opts?.maxLineWidth ?? VIEWER_WIREFRAME_BUDGETS.maxLineWidth,
  };
  const edgeBudget = budgets.maxEdges;
  const prepared = prepareHullGeometry(payload, {
    lodPref,
    budgets,
    targetDims: opts?.targetDims,
    reasonPrefix: "overlay",
  });
  if (!prepared.ok) {
    return { overlay: null, clampReasons: prepared.clampReasons, lod: lodPref, source: "fallback" };
  }
  const clampReasons = [...prepared.clampReasons];
  const { geometry } = prepared;

  const lines = buildEdges(geometry.positions, geometry.indices, edgeBudget);
  if (!lines) {
    clampReasons.push("overlay:indicesMissing");
    logClamp("overlay:indicesMissing", { lod: lodPref });
    return { overlay: null, clampReasons, lod: lodPref, source: "fallback" };
  }

  const lineWidthRaw = lodPref === "preview" ? 1.6 : 1.1;
  const lineWidth = clamp(lineWidthRaw, budgets.minLineWidth, budgets.maxLineWidth);
  if (lineWidth !== lineWidthRaw) {
    clampReasons.push("overlay:lineWidthClamped");
    logClamp("overlay:lineWidthClamped", { from: lineWidthRaw, to: lineWidth, lod: lodPref });
  }
  const overlay: WireframeOverlayBuffers = {
    key: `${lodPref}|${payload?.meshHash ?? payload?.mesh?.meshHash ?? "none"}|${geometry.handedness}|${lines.length}`,
    positions: lines,
    basis: geometry.basis,
    lod: lodPref,
    meshHash: geometry.meshHash,
    lineWidth,
    alpha: lodPref === "preview" ? 0.85 : 0.72,
    color: [0.26, 0.93, 0.78],
    triangleCount: geometry.triangleCount,
    vertexCount: geometry.vertexCount,
    clampReasons,
  };

  overlay.angles01 = buildAngles(geometry.positions);
  if (opts?.tilesPerSectorVector) {
    ensureBlanketWeights(overlay, {
      tiles: opts.tilesPerSectorVector,
      totalSectors: opts.totalSectors,
    });
  }

  return { overlay, clampReasons, lod: lodPref, source: "preview" };
}

export function resolveHullSurfaceMesh(
  payload: HullPreviewPayload | null | undefined,
  opts?: HullSurfaceMeshOptions,
): HullSurfaceMeshResult {
  const lodPref = opts?.lod ?? "preview";
  const budgets = {
    maxPreviewTriangles: opts?.maxPreviewTriangles ?? VIEWER_WIREFRAME_BUDGETS.maxPreviewTriangles,
    maxHighTriangles: opts?.maxHighTriangles ?? VIEWER_WIREFRAME_BUDGETS.maxHighTriangles,
    maxEdges: opts?.maxEdges ?? VIEWER_WIREFRAME_BUDGETS.maxEdges,
    maxUploadBytes: opts?.maxUploadBytes ?? VIEWER_WIREFRAME_BUDGETS.maxUploadBytes,
    minLineWidth: opts?.minLineWidth ?? VIEWER_WIREFRAME_BUDGETS.minLineWidth,
    maxLineWidth: opts?.maxLineWidth ?? VIEWER_WIREFRAME_BUDGETS.maxLineWidth,
  };

  const prepared = prepareHullGeometry(payload, {
    lodPref,
    budgets,
    targetDims: opts?.targetDims,
    reasonPrefix: "surface",
  });
  if (!prepared.ok) {
    return { surface: null, clampReasons: prepared.clampReasons, lod: lodPref, source: "fallback" };
  }
  const clampReasons = [...prepared.clampReasons];
  const { geometry } = prepared;

  const { indices: coercedIndices, clampReasons: idxClamp } = coerceIndexArray(
    geometry.indices,
    geometry.vertexCount,
    "surface",
  );
  clampReasons.push(...idxClamp);
  const indicesRaw = coercedIndices;
  if (!indicesRaw || indicesRaw.length < 3) {
    const reason = "surface:indicesMissing";
    clampReasons.push(reason);
    logClamp(reason, { lod: lodPref });
    return { surface: null, clampReasons, lod: lodPref, source: "fallback" };
  }
  const sanitized = sanitizeTriangles(geometry.positions, indicesRaw, geometry.handedness, "surface");
  const indices = sanitized.indices;
  if (sanitized.culled > 0) {
    clampReasons.push(...sanitized.reasons.filter((r) => !clampReasons.includes(r)));
    logClamp("surface:degenerateCulled", { lod: lodPref, culled: sanitized.culled });
  }
  if (sanitized.flipped) {
    if (!clampReasons.includes("surface:windingFlipped")) clampReasons.push("surface:windingFlipped");
    logClamp("surface:windingFlipped", { lod: lodPref });
  }
  if (!indices || indices.length < 3) {
    const reason = "surface:indicesMissing";
    if (!clampReasons.includes(reason)) clampReasons.push(reason);
    logClamp(reason, { lod: lodPref });
    return { surface: null, clampReasons, lod: lodPref, source: "fallback" };
  }

  const wireLines = buildEdges(geometry.positions, indices, budgets.maxEdges);
  let wireframe: WireframeOverlayBuffers | null = null;
  if (wireLines) {
    const lineWidthRaw = lodPref === "preview" ? 1.6 : 1.1;
    const lineWidth = clamp(lineWidthRaw, budgets.minLineWidth, budgets.maxLineWidth);
    if (lineWidth !== lineWidthRaw) {
      clampReasons.push("surface:lineWidthClamped");
      logClamp("surface:lineWidthClamped", { lod: lodPref, from: lineWidthRaw, to: lineWidth });
    }
    wireframe = {
      key: `${lodPref}|${geometry.meshHash ?? "none"}|${geometry.handedness}|${wireLines.length}`,
      positions: wireLines,
      lod: lodPref,
      meshHash: geometry.meshHash,
      basis: geometry.basis,
      lineWidth,
      alpha: lodPref === "preview" ? 0.85 : 0.72,
      color: [0.26, 0.93, 0.78],
      triangleCount: geometry.triangleCount,
      vertexCount: geometry.vertexCount,
      clampReasons,
    };
    wireframe.angles01 = buildAngles(geometry.positions);
  } else {
    const reason = "surface:indicesMissing";
    clampReasons.push(reason);
    logClamp(reason, { lod: lodPref });
  }

  const vertexAngles01 = buildAngles(geometry.positions);
  const sectorCountInput =
    typeof opts?.totalSectors === "number"
      ? opts.totalSectors
      : Number((payload as any)?.hullMetrics?.sectorCount) || PROMOTED_WARP_PROFILE.sectorCount;
  const vertexSectors = buildSectorIndices(vertexAngles01, sectorCountInput);
  const triangleAngles01 = buildTriangleAngles(geometry.positions, indices);
  const triangleSectors = buildSectorIndices(triangleAngles01, vertexSectors.sectorCount);

  const surface: HullSurfaceMesh = {
    key: `${lodPref}|${geometry.meshHash ?? "none"}|${geometry.handedness}|${indices.length}|${vertexSectors.sectorCount}`,
    lod: lodPref,
    positions: geometry.positions,
    indices,
    normals: geometry.normals ?? null,
    tangents: geometry.tangents ?? null,
    vertexAngles01,
    vertexSectors: vertexSectors.sectors,
    triangleAngles01,
    triangleSectors: triangleSectors.sectors,
    sectorCount: vertexSectors.sectorCount,
    triangleCount: Math.floor(indices.length / 3),
    vertexCount: geometry.vertexCount,
    meshHash: geometry.meshHash,
    basis: geometry.basis,
    handedness: geometry.handedness,
    bounds: geometry.bounds,
    wireframe,
    clampReasons,
    source: "preview",
  };

  return { surface, clampReasons, lod: lodPref, source: surface.source };
}

