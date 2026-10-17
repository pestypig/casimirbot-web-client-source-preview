import type { StressEnergyBrickStats } from "@/lib/stress-energy-brick";

declare const Buffer:
  | undefined
  | {
      from(input: string, encoding: string): {
        buffer: ArrayBufferLike;
        byteOffset: number;
        byteLength: number;
      };
    };

export type WfBrickChannel = {
  data: Float32Array;
  min: number;
  max: number;
};

export type WfBrickFlux = {
  Sx: WfBrickChannel;
  Sy: WfBrickChannel;
  Sz: WfBrickChannel;
  divS: WfBrickChannel;
};

export type WfBrickBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type WfBrickDataset = {
  dims: [number, number, number];
  bounds?: WfBrickBounds;
  t00: WfBrickChannel;
  flux: WfBrickFlux;
  stats: StressEnergyBrickStats;
  hasFlux: boolean;
};

type ParseOptions = {
  filename?: string;
};

const decodeBase64 = (payload: string): Uint8Array | null => {
  if (!payload) return null;
  if (typeof atob === "function") {
    const binary = atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
  if (typeof Buffer !== "undefined") {
    try {
      const buf = Buffer.from(payload, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }
  return null;
};

const coerceFloat32 = (dataSource: unknown): Float32Array | null => {
  if (!dataSource) return null;
  if (dataSource instanceof Float32Array) return dataSource;
  if (dataSource instanceof ArrayBuffer) return new Float32Array(dataSource);
  if (Array.isArray(dataSource)) return new Float32Array(dataSource);
  if (typeof dataSource === "string") {
    const bytes = decodeBase64(dataSource);
    if (!bytes || bytes.byteLength % 4 !== 0) return null;
    const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Float32Array(view);
  }
  if (ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
    try {
      if (dataSource.byteLength % 4 !== 0) return null;
      return new Float32Array(dataSource.buffer, dataSource.byteOffset, dataSource.byteLength / 4);
    } catch {
      return null;
    }
  }
  return null;
};

const pick = (root: any, keys: string[]) => {
  if (!root || typeof root !== "object") return undefined;
  for (const key of keys) {
    if (root[key] != null) return root[key];
  }
  return undefined;
};

const parseDims = (payload: any): [number, number, number] | null => {
  const raw =
    payload?.dims ??
    payload?.shape ??
    payload?.size ??
    payload?.grid?.dims ??
    payload?.grid?.shape ??
    payload?.grid?.size;
  if (Array.isArray(raw) && raw.length >= 3) {
    const nx = Number(raw[0]);
    const ny = Number(raw[1]);
    const nz = Number(raw[2]);
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
      return [Math.max(1, Math.round(nx)), Math.max(1, Math.round(ny)), Math.max(1, Math.round(nz))];
    }
  }
  if (typeof raw === "string") {
    const parts = raw.split(/[x,]/).map((v) => v.trim());
    if (parts.length >= 3) {
      const nx = Number(parts[0]);
      const ny = Number(parts[1]);
      const nz = Number(parts[2]);
      if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
        return [Math.max(1, Math.round(nx)), Math.max(1, Math.round(ny)), Math.max(1, Math.round(nz))];
      }
    }
  }
  return null;
};

const parseBounds = (payload: any): WfBrickBounds | undefined => {
  const raw = payload?.bounds ?? payload?.grid?.bounds ?? payload?.domain;
  if (!raw) return undefined;
  const minRaw = raw.min ?? raw.minCorner ?? raw[0];
  const maxRaw = raw.max ?? raw.maxCorner ?? raw[1];
  if (!Array.isArray(minRaw) || !Array.isArray(maxRaw)) return undefined;
  if (minRaw.length < 3 || maxRaw.length < 3) return undefined;
  const min: [number, number, number] = [Number(minRaw[0]), Number(minRaw[1]), Number(minRaw[2])];
  const max: [number, number, number] = [Number(maxRaw[0]), Number(maxRaw[1]), Number(maxRaw[2])];
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return undefined;
  return { min, max };
};

const computeMinMax = (data: Float32Array) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { min, max };
};

const normalizeChannel = (raw: any, expected: number, label: string): WfBrickChannel => {
  const dataRaw = raw?.data ?? raw?.values ?? raw?.buffer ?? raw;
  const data = coerceFloat32(dataRaw);
  if (!data) {
    throw new Error(`wfbrick: missing ${label} channel data`);
  }
  if (data.length < expected) {
    throw new Error(`wfbrick: ${label} length ${data.length} < expected ${expected}`);
  }
  const dataSlice = data.length === expected ? data : data.subarray(0, expected);
  const minRaw = Number(raw?.min);
  const maxRaw = Number(raw?.max);
  const computed = computeMinMax(dataSlice);
  const min = Number.isFinite(minRaw) ? minRaw : computed.min;
  const max = Number.isFinite(maxRaw) ? maxRaw : computed.max;
  return { data: dataSlice, min, max };
};

const ensureZeros = (expected: number): WfBrickChannel => {
  const data = new Float32Array(expected);
  return { data, min: 0, max: 0 };
};

const computeStats = (
  t00: WfBrickChannel,
  flux: WfBrickFlux,
  expected: number,
  rawStats: any,
): StressEnergyBrickStats => {
  const safeNumber = (value: unknown, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const stats: StressEnergyBrickStats = {
    totalEnergy_J: safeNumber(rawStats?.totalEnergy_J),
    avgT00: safeNumber(rawStats?.avgT00),
    avgFluxMagnitude: safeNumber(rawStats?.avgFluxMagnitude),
    netFlux: Array.isArray(rawStats?.netFlux) && rawStats.netFlux.length === 3
      ? [safeNumber(rawStats.netFlux[0]), safeNumber(rawStats.netFlux[1]), safeNumber(rawStats.netFlux[2])]
      : [0, 0, 0],
    divMin: safeNumber(rawStats?.divMin),
    divMax: safeNumber(rawStats?.divMax),
    dutyFR: safeNumber(rawStats?.dutyFR),
    strobePhase: safeNumber(rawStats?.strobePhase),
    natario: rawStats?.natario,
  };

  const needsAvg =
    !Number.isFinite(rawStats?.avgT00) ||
    !Number.isFinite(rawStats?.avgFluxMagnitude) ||
    !Array.isArray(rawStats?.netFlux);
  const needsDiv = !Number.isFinite(rawStats?.divMin) || !Number.isFinite(rawStats?.divMax);

  if (expected > 0 && (needsAvg || needsDiv)) {
    let sumT00 = 0;
    let sumFluxMag = 0;
    let sumSx = 0;
    let sumSy = 0;
    let sumSz = 0;
    let divMin = Number.POSITIVE_INFINITY;
    let divMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < expected; i += 1) {
      const t = t00.data[i] ?? 0;
      sumT00 += t;
      const sx = flux.Sx.data[i] ?? 0;
      const sy = flux.Sy.data[i] ?? 0;
      const sz = flux.Sz.data[i] ?? 0;
      sumSx += sx;
      sumSy += sy;
      sumSz += sz;
      sumFluxMag += Math.hypot(sx, sy, sz);
      if (needsDiv) {
        const div = flux.divS.data[i] ?? 0;
        if (div < divMin) divMin = div;
        if (div > divMax) divMax = div;
      }
    }
    if (needsAvg) {
      const inv = 1 / expected;
      stats.avgT00 = sumT00 * inv;
      stats.avgFluxMagnitude = sumFluxMag * inv;
      stats.netFlux = [sumSx * inv, sumSy * inv, sumSz * inv];
    }
    if (needsDiv) {
      stats.divMin = Number.isFinite(divMin) ? divMin : 0;
      stats.divMax = Number.isFinite(divMax) ? divMax : 0;
    }
  }

  return stats;
};

export function parseWfbrickPayload(payload: unknown, options: ParseOptions = {}): WfBrickDataset {
  if (!payload || typeof payload !== "object") {
    throw new Error("wfbrick: payload must be a JSON object");
  }
  const dims = parseDims(payload);
  if (!dims) {
    const name = options.filename ? ` (${options.filename})` : "";
    throw new Error(`wfbrick: missing dims${name}`);
  }
  const expected = dims[0] * dims[1] * dims[2];
  const bounds = parseBounds(payload);
  const channelRoot = (payload as any).channels ?? (payload as any).fields ?? (payload as any).data ?? payload;

  const t00Raw =
    pick(payload as any, ["t00", "T00", "rho", "density"]) ??
    pick(channelRoot as any, ["t00", "T00", "rho", "density"]);
  const t00 = normalizeChannel(t00Raw, expected, "t00");

  const fluxRoot =
    (payload as any).flux ??
    (channelRoot as any)?.flux ??
    (payload as any).vector ??
    (payload as any).vectors ??
    null;
  const SxRaw = pick(fluxRoot, ["Sx", "sx"]) ?? pick(channelRoot as any, ["Sx", "sx"]);
  const SyRaw = pick(fluxRoot, ["Sy", "sy"]) ?? pick(channelRoot as any, ["Sy", "sy"]);
  const SzRaw = pick(fluxRoot, ["Sz", "sz"]) ?? pick(channelRoot as any, ["Sz", "sz"]);
  const divRaw =
    pick(fluxRoot, ["divS", "div_s", "div"]) ??
    pick(channelRoot as any, ["divS", "div_s", "div"]);

  const hasFlux = Boolean(SxRaw && SyRaw && SzRaw);
  const Sx = SxRaw ? normalizeChannel(SxRaw, expected, "Sx") : ensureZeros(expected);
  const Sy = SyRaw ? normalizeChannel(SyRaw, expected, "Sy") : ensureZeros(expected);
  const Sz = SzRaw ? normalizeChannel(SzRaw, expected, "Sz") : ensureZeros(expected);
  const divS = divRaw ? normalizeChannel(divRaw, expected, "divS") : ensureZeros(expected);

  const stats = computeStats(t00, { Sx, Sy, Sz, divS }, expected, (payload as any).stats);

  return {
    dims,
    bounds,
    t00,
    flux: { Sx, Sy, Sz, divS },
    stats,
    hasFlux,
  };
}

export function parseWfbrickBuffer(buffer: ArrayBuffer, options: ParseOptions = {}): WfBrickDataset {
  const text = new TextDecoder().decode(buffer);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const name = options.filename ? ` (${options.filename})` : "";
    throw new Error(`wfbrick: expected JSON${name}`);
  }
  return parseWfbrickPayload(json, options);
}

export async function loadWfbrickFile(file: File): Promise<WfBrickDataset> {
  const buffer = await file.arrayBuffer();
  return parseWfbrickBuffer(buffer, { filename: file.name });
}
