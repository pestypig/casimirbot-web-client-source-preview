import { apiRequest } from "@/lib/queryClient";
import type { CurvatureQuality } from "@/lib/curvature-brick";

declare const Buffer:
  | undefined
  | {
      from(input: string, encoding: string): {
        buffer: ArrayBufferLike;
        byteOffset: number;
        byteLength: number;
      };
    };

export interface LapseBrickRequest {
  quality?: CurvatureQuality;
  dims?: [number, number, number];
  phase01: number;
  sigmaSector: number;
  splitEnabled: boolean;
  splitFrac: number;
  dutyFR: number;
  q: number;
  gammaGeo: number;
  gammaVdB: number;
  ampBase: number;
  zeta: number;
  driveDir?: [number, number, number] | null;
  iterations?: number;
  tolerance?: number;
}

export interface LapseBrickChannel {
  data: Float32Array;
  min: number;
  max: number;
}

export interface LapseBrickStats {
  iterations: number;
  residual: number;
  phiMin: number;
  phiMax: number;
  gttMin: number;
  gttMax: number;
  alphaMin: number;
  alphaMax: number;
  boundary: "dirichlet_zero";
  solver: "jacobi";
}

export interface LapseBrickDecoded {
  dims: [number, number, number];
  channels: {
    phi: LapseBrickChannel;
    g_tt: LapseBrickChannel;
    alpha: LapseBrickChannel;
    hullDist?: LapseBrickChannel;
    hullMask?: LapseBrickChannel;
  };
  stats: LapseBrickStats;
  bounds?: {
    min?: [number, number, number];
    max?: [number, number, number];
    center?: [number, number, number];
    extent?: [number, number, number];
    axes?: [number, number, number];
  };
  meta?: unknown;
}

const BRICK_FORMAT = "raw";
const BINARY_CONTENT_TYPES = ["application/octet-stream", "application/x-helix-brick"];
const LAPSE_CHANNEL_ORDER = ["phi", "g_tt", "alpha"] as const;
const OPTIONAL_CHANNEL_ORDER = ["hullDist", "hullMask"] as const;
const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

const decodeUtf8 = (bytes: Uint8Array): string => {
  if (textDecoder) return textDecoder.decode(bytes);
  let result = "";
  for (let i = 0; i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
};

const decodeBinaryHeader = (buffer: ArrayBuffer): { header: any; dataOffset: number } | null => {
  if (buffer.byteLength < 4) return null;
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);
  if (!headerLength || headerLength < 2 || headerLength > buffer.byteLength - 4) {
    return null;
  }
  const headerStart = 4;
  const headerEnd = headerStart + headerLength;
  const headerBytes = new Uint8Array(buffer, headerStart, headerLength);
  let header: any;
  try {
    header = JSON.parse(decodeUtf8(headerBytes));
  } catch {
    return null;
  }
  const padding = (4 - (headerLength % 4)) % 4;
  const dataOffset = headerEnd + padding;
  if (dataOffset > buffer.byteLength) return null;
  return { header, dataOffset };
};

const normalizeStats = (raw: any): LapseBrickStats => ({
  iterations: Number(raw?.iterations ?? 0),
  residual: Number(raw?.residual ?? 0),
  phiMin: Number(raw?.phiMin ?? 0),
  phiMax: Number(raw?.phiMax ?? 0),
  gttMin: Number(raw?.gttMin ?? 0),
  gttMax: Number(raw?.gttMax ?? 0),
  alphaMin: Number(raw?.alphaMin ?? 0),
  alphaMax: Number(raw?.alphaMax ?? 0),
  boundary: "dirichlet_zero",
  solver: "jacobi",
});

const decodeLapseBrickBinary = (buffer: ArrayBuffer): LapseBrickDecoded | null => {
  const parsed = decodeBinaryHeader(buffer);
  if (!parsed) return null;
  const { header, dataOffset } = parsed;
  if (header?.kind !== "lapse-brick") return null;
  const dims = Array.isArray(header.dims) ? header.dims : null;
  if (!dims || dims.length !== 3) return null;
  const voxelBytes = Number(header.voxelBytes ?? 4);
  const total = Number(dims[0]) * Number(dims[1]) * Number(dims[2]);
  if (!Number.isFinite(total) || total <= 0) return null;
  const defaultBytes = total * (Number.isFinite(voxelBytes) && voxelBytes > 0 ? voxelBytes : 4);
  let offset = dataOffset;
  const channelsHeader = header.channels ?? {};

  const decodeChannel = (key: typeof LAPSE_CHANNEL_ORDER[number]): LapseBrickChannel | null => {
    const info = channelsHeader[key] ?? {};
    const bytes = Number(info.bytes ?? defaultBytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes % 4 !== 0) return null;
    if (offset + bytes > buffer.byteLength) return null;
    if (offset % 4 !== 0) return null;
    const data = new Float32Array(buffer, offset, bytes / 4);
    offset += bytes;
    return {
      data,
      min: Number(info.min ?? 0),
      max: Number(info.max ?? 0),
    };
  };

  const decodeOptionalChannel = (
    key: typeof OPTIONAL_CHANNEL_ORDER[number],
  ): LapseBrickChannel | null => {
    const info = channelsHeader[key];
    if (!info) return null;
    const bytes = Number(info.bytes ?? defaultBytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes % 4 !== 0) return null;
    if (offset + bytes > buffer.byteLength) return null;
    if (offset % 4 !== 0) return null;
    const data = new Float32Array(buffer, offset, bytes / 4);
    offset += bytes;
    return {
      data,
      min: Number(info.min ?? 0),
      max: Number(info.max ?? 0),
    };
  };

  const phi = decodeChannel("phi");
  const g_tt = decodeChannel("g_tt");
  const alpha = decodeChannel("alpha");
  if (!phi || !g_tt || !alpha) return null;
  const hullDist = decodeOptionalChannel("hullDist");
  const hullMask = decodeOptionalChannel("hullMask");

  return {
    dims: [Number(dims[0]), Number(dims[1]), Number(dims[2])],
    channels: { phi, g_tt, alpha, ...(hullDist ? { hullDist } : {}), ...(hullMask ? { hullMask } : {}) },
    stats: normalizeStats(header.stats),
    bounds: header.bounds,
    meta: header.meta,
  };
};

const decodeBase64 = (payload: string | undefined): Uint8Array | undefined => {
  if (!payload) return undefined;
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
      return undefined;
    }
  }
  return undefined;
};

const decodeFloat32 = (payload: string | undefined): Float32Array | undefined => {
  const bytes = decodeBase64(payload);
  if (!bytes) return undefined;
  if (bytes.byteLength % 4 !== 0) return undefined;
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(view);
};

const buildQuery = (request: LapseBrickRequest) => {
  const params = new URLSearchParams();
  if (request.quality) params.set("quality", request.quality);
  if (request.dims) params.set("dims", request.dims.join("x"));
  params.set("phase01", request.phase01.toString());
  params.set("sigmaSector", request.sigmaSector.toString());
  params.set("splitEnabled", request.splitEnabled ? "1" : "0");
  params.set("splitFrac", request.splitFrac.toString());
  params.set("dutyFR", request.dutyFR.toString());
  params.set("q", request.q.toString());
  params.set("gammaGeo", request.gammaGeo.toString());
  params.set("gammaVdB", request.gammaVdB.toString());
  params.set("ampBase", request.ampBase.toString());
  params.set("zeta", request.zeta.toString());
  if (Number.isFinite(request.iterations ?? NaN)) {
    params.set("iterations", Math.max(0, Math.floor(request.iterations as number)).toString());
  }
  if (Number.isFinite(request.tolerance ?? NaN)) {
    params.set("tolerance", Math.max(0, request.tolerance as number).toString());
  }
  if (Array.isArray(request.driveDir) && request.driveDir.length >= 3) {
    const parts = request.driveDir.slice(0, 3).map((value) => Number(value));
    if (parts.every((value) => Number.isFinite(value))) {
      params.set("driveDir", parts.join(","));
    }
  }
  params.set("format", BRICK_FORMAT);
  return params.toString();
};

export async function fetchLapseBrick(
  request: LapseBrickRequest,
  signal?: AbortSignal,
): Promise<LapseBrickDecoded> {
  const query = buildQuery(request);
  const res = await apiRequest("GET", `/api/helix/lapse-brick?${query}`, undefined, signal, {
    headers: { Accept: "application/octet-stream, application/json" },
  });
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (BINARY_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    const buffer = await res.arrayBuffer();
    const decoded = decodeLapseBrickBinary(buffer);
    if (!decoded) {
      throw new Error("Failed to decode lapse brick binary payload");
    }
    return decoded;
  }
  const json = await res.json();
  const dims = (json.dims ?? []) as number[];
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error("Invalid lapse brick dimensions");
  }
  const decodeChannel = (payload: any, label: string): LapseBrickChannel => {
    const data = decodeFloat32(payload?.data);
    if (!data) throw new Error(`Failed to decode lapse channel ${label}`);
    return {
      data,
      min: Number(payload?.min ?? 0),
      max: Number(payload?.max ?? 0),
    };
  };
  const phi = decodeChannel(json.channels?.phi, "phi");
  const g_tt = decodeChannel(json.channels?.g_tt, "g_tt");
  const alpha = decodeChannel(json.channels?.alpha, "alpha");
  const hullDist = json.channels?.hullDist ? decodeChannel(json.channels?.hullDist, "hullDist") : undefined;
  const hullMask = json.channels?.hullMask ? decodeChannel(json.channels?.hullMask, "hullMask") : undefined;

  return {
    dims: [dims[0], dims[1], dims[2]],
    channels: { phi, g_tt, alpha, ...(hullDist ? { hullDist } : {}), ...(hullMask ? { hullMask } : {}) },
    stats: normalizeStats(json.stats),
    bounds: json.bounds,
    meta: json.meta,
  };
}
