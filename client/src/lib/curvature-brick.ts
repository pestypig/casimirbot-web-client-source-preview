import { apiRequest } from "@/lib/queryClient";

declare const Buffer: undefined | { from(input: string, encoding: string): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number; } };

export type CurvatureQuality = "low" | "medium" | "high";

export interface CurvatureBrickRequest {
  quality?: CurvatureQuality;
  dims?: [number, number, number];
  phase01: number;
  sigmaSector: number;
  splitEnabled: boolean;
  splitFrac: number;
  dutyFR: number;
  tauLC_s: number;
  Tm_s: number;
  beta0: number;
  betaMax: number;
  zeta: number;
  q: number;
  gammaGeo: number;
  gammaVdB: number;
  ampBase: number;
  clampQI: boolean;
}

export interface CurvatureBrickDecoded {
  dims: [number, number, number];
  data: Float32Array;
  min: number;
  max: number;
  qiMargin?: Float32Array;
  qiMin?: number;
  qiMax?: number;
  emaAlpha?: number;
  residualMin?: number;
  residualMax?: number;
  meta?: {
    source?: "pipeline" | "metric" | "unknown";
    proxy?: boolean;
    congruence?: "proxy-only" | "geometry-derived" | "conditional";
    kScale?: number;
    kScaleSource?: string;
  };
}

const BRICK_FORMAT = "raw";
const BINARY_CONTENT_TYPES = ["application/octet-stream", "application/x-helix-brick"];
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

const decodeCurvatureBrickBinary = (buffer: ArrayBuffer): CurvatureBrickDecoded | null => {
  const parsed = decodeBinaryHeader(buffer);
  if (!parsed) return null;
  const { header, dataOffset } = parsed;
  if (header?.kind !== "curvature-brick") return null;
  const dims = Array.isArray(header.dims) ? header.dims : null;
  if (!dims || dims.length !== 3) return null;
  const dataBytes = Number(header.dataBytes ?? 0);
  if (!Number.isFinite(dataBytes) || dataBytes <= 0) return null;
  if (dataOffset + dataBytes > buffer.byteLength) return null;
  if (dataOffset % 4 !== 0 || dataBytes % 4 !== 0) return null;
  const data = new Float32Array(buffer, dataOffset, dataBytes / 4);
  let offset = dataOffset + dataBytes;
  const qiMarginBytes = Number(header.qiMarginBytes ?? 0);
  let qiMargin: Float32Array | undefined;
  if (Number.isFinite(qiMarginBytes) && qiMarginBytes > 0) {
    if (offset + qiMarginBytes > buffer.byteLength) return null;
    if (offset % 4 !== 0 || qiMarginBytes % 4 !== 0) return null;
    qiMargin = new Float32Array(buffer, offset, qiMarginBytes / 4);
    offset += qiMarginBytes;
  }
  const emaAlpha = Number(header.emaAlpha);
  const residualMin = Number(header.residualMin);
  const residualMax = Number(header.residualMax);
  const meta =
    header && typeof header === "object"
      ? {
          source: header.source as "pipeline" | "metric" | "unknown" | undefined,
          proxy: typeof header.proxy === "boolean" ? header.proxy : undefined,
          congruence: header.congruence as "proxy-only" | "geometry-derived" | "conditional" | undefined,
          kScale: Number.isFinite(Number(header.kScale)) ? Number(header.kScale) : undefined,
          kScaleSource: typeof header.kScaleSource === "string" ? header.kScaleSource : undefined,
        }
      : undefined;
  return {
    dims: [Number(dims[0]), Number(dims[1]), Number(dims[2])],
    data,
    min: Number(header.min ?? 0),
    max: Number(header.max ?? 0),
    qiMargin,
    qiMin: qiMargin ? Number(header.qiMin ?? 0) : undefined,
    qiMax: qiMargin ? Number(header.qiMax ?? 0) : undefined,
    emaAlpha: Number.isFinite(emaAlpha) ? emaAlpha : undefined,
    residualMin: Number.isFinite(residualMin) ? residualMin : undefined,
    residualMax: Number.isFinite(residualMax) ? residualMax : undefined,
    meta,
  };
};

const decodeBase64 = (payload: string | undefined): Uint8Array | undefined => {
  if (!payload) return undefined;
  if (typeof atob === "function") {
    const binary = atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
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
  if (bytes.byteLength % 4 !== 0) {
    return undefined;
  }
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(view);
};

const buildQuery = (request: CurvatureBrickRequest) => {
  const params = new URLSearchParams();
  if (request.quality) params.set("quality", request.quality);
  if (request.dims) params.set("dims", request.dims.join("x"));
  params.set("phase01", request.phase01.toString());
  params.set("sigmaSector", request.sigmaSector.toString());
  params.set("splitEnabled", request.splitEnabled ? "1" : "0");
  params.set("splitFrac", request.splitFrac.toString());
  params.set("dutyFR", request.dutyFR.toString());
  params.set("tauLC_s", request.tauLC_s.toString());
  params.set("Tm_s", request.Tm_s.toString());
  params.set("beta0", request.beta0.toString());
  params.set("betaMax", request.betaMax.toString());
  params.set("zeta", request.zeta.toString());
  params.set("q", request.q.toString());
  params.set("gammaGeo", request.gammaGeo.toString());
  params.set("gammaVdB", request.gammaVdB.toString());
  params.set("ampBase", request.ampBase.toString());
  params.set("clampQI", request.clampQI ? "1" : "0");
  params.set("format", BRICK_FORMAT);
  return params.toString();
};

export async function fetchCurvatureBrick(request: CurvatureBrickRequest, signal?: AbortSignal): Promise<CurvatureBrickDecoded> {
  const query = buildQuery(request);
  const res = await apiRequest("GET", `/api/helix/curvature-brick?${query}`, undefined, signal, {
    headers: { Accept: "application/octet-stream, application/json" },
  });
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (BINARY_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    const buffer = await res.arrayBuffer();
    const decoded = decodeCurvatureBrickBinary(buffer);
    if (!decoded) {
      throw new Error("Failed to decode curvature brick binary payload");
    }
    return decoded;
  }
  const json = await res.json();
  const dims = (json.dims ?? []) as number[];
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error("Invalid curvature brick dimensions");
  }
  const data = decodeFloat32(json.data);
  if (!data) {
    throw new Error("Failed to decode curvature brick payload");
  }
  const qiMargin = decodeFloat32(json.qiMargin);
  const emaAlphaRaw = Number(json.emaAlpha);
  const residualMinRaw = Number(json.residualMin);
  const residualMaxRaw = Number(json.residualMax);
  const meta = json
    ? {
        source: json.source as "pipeline" | "metric" | "unknown" | undefined,
        proxy: typeof json.proxy === "boolean" ? json.proxy : undefined,
        congruence: json.congruence as "proxy-only" | "geometry-derived" | "conditional" | undefined,
        kScale: Number.isFinite(Number(json.kScale)) ? Number(json.kScale) : undefined,
        kScaleSource: typeof json.kScaleSource === "string" ? json.kScaleSource : undefined,
      }
    : undefined;
  return {
    dims: [dims[0], dims[1], dims[2]],
    data,
    min: Number(json.min ?? 0),
    max: Number(json.max ?? 0),
    qiMargin,
    qiMin: qiMargin ? Number(json.qiMin ?? 0) : undefined,
    qiMax: qiMargin ? Number(json.qiMax ?? 0) : undefined,
    emaAlpha: Number.isFinite(emaAlphaRaw) ? emaAlphaRaw : undefined,
    residualMin: Number.isFinite(residualMinRaw) ? residualMinRaw : undefined,
    residualMax: Number.isFinite(residualMaxRaw) ? residualMaxRaw : undefined,
    meta,
  };
}
