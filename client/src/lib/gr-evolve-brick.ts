import { apiRequest } from "@/lib/queryClient";
import type { StressEnergyBrickStats } from "@/lib/stress-energy-brick";
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

export interface GrEvolveBrickRequest {
  quality?: CurvatureQuality;
  dims?: [number, number, number];
  time_s?: number;
  dt_s?: number;
  steps?: number;
  iterations?: number;
  tolerance?: number;
  koEps?: number;
  koTargets?: "gauge" | "all";
  shockMode?: "off" | "diagnostic" | "stabilize";
  advectScheme?: "centered" | "upwind1";
  lapseKappa?: number;
  shiftEta?: number;
  shiftGamma?: number;
  advect?: boolean;
  order?: 2 | 4;
  boundary?: "clamp" | "periodic";
  includeExtra?: boolean;
  includeMatter?: boolean;
  includeKij?: boolean;
  invariantWallFraction?: number;
  invariantBandFraction?: number;
  invariantSampleMax?: number;
  invariantPercentile?: number;
  driveDir?: [number, number, number] | null;
  dutyFR?: number;
  q?: number;
  gammaGeo?: number;
  gammaVdB?: number;
  zeta?: number;
  phase01?: number;
}

export interface GrEvolveBrickChannel {
  data: Float32Array;
  min: number;
  max: number;
}

export interface FixupStepStats {
  alphaClampCount: number;
  kClampCount: number;
  detFixCount: number;
  traceFixCount: number;
  maxAlphaBeforeClamp: number;
  maxKBeforeClamp: number;
}

export interface FixupStats extends FixupStepStats {
  totalCells: number;
  alphaClampByStep: number[];
  kClampByStep: number[];
  detFixByStep: number[];
  traceFixByStep: number[];
  alphaClampMin: number;
  alphaClampMax: number;
  kClampMaxAbs: number;
  postStep?: FixupStepStats;
  clampFraction?: number;
}

export type GrSolverHealthStatus = "CERTIFIED" | "UNSTABLE" | "NOT_CERTIFIED";

export interface GrSolverHealth {
  status: GrSolverHealthStatus;
  reasons: string[];
  alphaClampFraction: number;
  kClampFraction: number;
  totalClampFraction: number;
  maxAlphaBeforeClamp: number;
  maxKBeforeClamp: number;
}

export type GrBrickMetaStatus = "CERTIFIED" | "NOT_CERTIFIED";

export interface GrBrickMeta {
  status: GrBrickMetaStatus;
  reasons: string[];
}

export interface GrShiftStiffnessMetrics {
  betaMaxAbs: number;
  betaP98Abs: number;
  gradBetaMaxAbs: number;
  gradBetaP98Abs: number;
  advectiveCflSuggested: number;
  charSpeedSuggested: number;
  charCflSuggested: number;
  shockIndex: number;
  shockSeverity?: "ok" | "warn" | "severe";
  shockMode?: "off" | "diagnostic" | "stabilize";
  stabilizersApplied?: string[];
}

export interface GrDissipationStats {
  koEpsUsed: number;
  koTargets: "gauge" | "all";
}

export interface GrEvolveBrickStats {
  steps: number;
  iterations: number;
  tolerance: number;
  cfl: number;
  H_rms: number;
  M_rms: number;
  thetaPeakAbs?: number;
  thetaGrowthPerStep?: number;
  invariants?: GrInvariantStatsSet;
  dissipation?: GrDissipationStats;
  advectScheme?: "centered" | "upwind1";
  stiffness?: GrShiftStiffnessMetrics;
  fixups?: FixupStats;
  solverHealth?: GrSolverHealth;
  stressEnergy?: StressEnergyBrickStats;
  perf?: GrEvolveBrickPerfStats;
}

export interface GrEvolveBrickPerfStats {
  totalMs: number;
  evolveMs: number;
  brickMs: number;
  voxels: number;
  channelCount: number;
  bytesEstimate: number;
  msPerStep: number;
}

export interface GrInvariantStats {
  min: number;
  max: number;
  mean: number;
  p98: number;
  sampleCount: number;
  abs: boolean;
  wallFraction: number;
  bandFraction: number;
  threshold: number;
  bandMin: number;
  bandMax: number;
}

export interface GrInvariantStatsSet {
  kretschmann?: GrInvariantStats;
  ricci4?: GrInvariantStats;
}

export interface GrEvolveBrickDecoded {
  dims: [number, number, number];
  voxelBytes: number;
  format: "r32f";
  bounds: { min: [number, number, number]; max: [number, number, number] };
  voxelSize_m: [number, number, number];
  time_s: number;
  dt_s: number;
  source?: "pipeline" | "metric" | "unknown";
  channelOrder?: string[];
  channels: {
    alpha: GrEvolveBrickChannel;
    beta_x: GrEvolveBrickChannel;
    beta_y: GrEvolveBrickChannel;
    beta_z: GrEvolveBrickChannel;
    gamma_xx: GrEvolveBrickChannel;
    gamma_yy: GrEvolveBrickChannel;
    gamma_zz: GrEvolveBrickChannel;
    K_trace: GrEvolveBrickChannel;
    H_constraint: GrEvolveBrickChannel;
    M_constraint_x: GrEvolveBrickChannel;
    M_constraint_y: GrEvolveBrickChannel;
    M_constraint_z: GrEvolveBrickChannel;
  };
  extraChannels?: Record<string, GrEvolveBrickChannel>;
  stats: GrEvolveBrickStats;
  meta?: GrBrickMeta;
}

const BRICK_FORMAT = "raw";
const BINARY_CONTENT_TYPES = ["application/octet-stream", "application/x-helix-brick"];
const GR_EVOLVE_CHANNEL_ORDER = [
  "alpha",
  "beta_x",
  "beta_y",
  "beta_z",
  "gamma_xx",
  "gamma_yy",
  "gamma_zz",
  "K_trace",
  "H_constraint",
  "M_constraint_x",
  "M_constraint_y",
  "M_constraint_z",
] as const;
const GR_EVOLVE_CHANNEL_SET = new Set<string>(GR_EVOLVE_CHANNEL_ORDER);

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

const normalizeStressEnergyStats = (raw: any): StressEnergyBrickStats | undefined =>
  raw && typeof raw === "object" ? (raw as StressEnergyBrickStats) : undefined;

const normalizePerfStats = (raw: any): GrEvolveBrickPerfStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const totalMs = Number(raw.totalMs);
  const evolveMs = Number(raw.evolveMs);
  const brickMs = Number(raw.brickMs);
  const voxels = Number(raw.voxels);
  const channelCount = Number(raw.channelCount);
  const bytesEstimate = Number(raw.bytesEstimate);
  const msPerStep = Number(raw.msPerStep);
  if (
    !Number.isFinite(totalMs) &&
    !Number.isFinite(evolveMs) &&
    !Number.isFinite(brickMs) &&
    !Number.isFinite(voxels) &&
    !Number.isFinite(channelCount) &&
    !Number.isFinite(bytesEstimate) &&
    !Number.isFinite(msPerStep)
  ) {
    return undefined;
  }
  return {
    totalMs: Number.isFinite(totalMs) ? totalMs : 0,
    evolveMs: Number.isFinite(evolveMs) ? evolveMs : 0,
    brickMs: Number.isFinite(brickMs) ? brickMs : 0,
    voxels: Number.isFinite(voxels) ? voxels : 0,
    channelCount: Number.isFinite(channelCount) ? channelCount : 0,
    bytesEstimate: Number.isFinite(bytesEstimate) ? bytesEstimate : 0,
    msPerStep: Number.isFinite(msPerStep) ? msPerStep : 0,
  };
};

const normalizeFixupStepStats = (raw: any): FixupStepStats => ({
  alphaClampCount: Number(raw?.alphaClampCount ?? 0),
  kClampCount: Number(raw?.kClampCount ?? 0),
  detFixCount: Number(raw?.detFixCount ?? 0),
  traceFixCount: Number(raw?.traceFixCount ?? 0),
  maxAlphaBeforeClamp: Number(raw?.maxAlphaBeforeClamp ?? 0),
  maxKBeforeClamp: Number(raw?.maxKBeforeClamp ?? 0),
});

const normalizeFixupStats = (raw: any): FixupStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const step = normalizeFixupStepStats(raw);
  return {
    ...step,
    totalCells: Number(raw.totalCells ?? 0),
    alphaClampByStep: Array.isArray(raw.alphaClampByStep)
      ? raw.alphaClampByStep.map((value: unknown) => Number(value))
      : [],
    kClampByStep: Array.isArray(raw.kClampByStep)
      ? raw.kClampByStep.map((value: unknown) => Number(value))
      : [],
    detFixByStep: Array.isArray(raw.detFixByStep)
      ? raw.detFixByStep.map((value: unknown) => Number(value))
      : [],
    traceFixByStep: Array.isArray(raw.traceFixByStep)
      ? raw.traceFixByStep.map((value: unknown) => Number(value))
      : [],
    alphaClampMin: Number(raw.alphaClampMin ?? 0),
    alphaClampMax: Number(raw.alphaClampMax ?? 0),
    kClampMaxAbs: Number(raw.kClampMaxAbs ?? 0),
    clampFraction: Number(raw.clampFraction ?? 0),
    postStep: raw.postStep ? normalizeFixupStepStats(raw.postStep) : undefined,
  };
};

const normalizeStiffness = (raw: any): GrShiftStiffnessMetrics | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const betaMaxAbs = Number(raw.betaMaxAbs);
  const betaP98Abs = Number(raw.betaP98Abs);
  const gradBetaMaxAbs = Number(raw.gradBetaMaxAbs);
  const gradBetaP98Abs = Number(raw.gradBetaP98Abs);
  const advectiveCflSuggested = Number(raw.advectiveCflSuggested);
  const charSpeedSuggested = Number(raw.charSpeedSuggested);
  const charCflSuggested = Number(raw.charCflSuggested);
  const shockIndex = Number(raw.shockIndex);
  const shockSeverityRaw =
    typeof raw.shockSeverity === "string" ? raw.shockSeverity.toLowerCase() : "";
  const shockSeverity =
    shockSeverityRaw === "severe" || shockSeverityRaw === "warn" || shockSeverityRaw === "ok"
      ? (shockSeverityRaw as "ok" | "warn" | "severe")
      : undefined;
  const shockModeRaw =
    typeof raw.shockMode === "string" ? raw.shockMode.toLowerCase() : "";
  const shockMode =
    shockModeRaw === "diagnostic" || shockModeRaw === "stabilize" || shockModeRaw === "off"
      ? (shockModeRaw as "off" | "diagnostic" | "stabilize")
      : undefined;
  const stabilizersApplied = Array.isArray(raw.stabilizersApplied)
    ? raw.stabilizersApplied.map((value: unknown) => String(value))
    : undefined;
  if (
    !Number.isFinite(betaMaxAbs) &&
    !Number.isFinite(betaP98Abs) &&
    !Number.isFinite(gradBetaMaxAbs) &&
    !Number.isFinite(gradBetaP98Abs) &&
    !Number.isFinite(advectiveCflSuggested) &&
    !Number.isFinite(charSpeedSuggested) &&
    !Number.isFinite(charCflSuggested) &&
    !Number.isFinite(shockIndex) &&
    !shockSeverity
  ) {
    return undefined;
  }
  return {
    betaMaxAbs: Number.isFinite(betaMaxAbs) ? betaMaxAbs : 0,
    betaP98Abs: Number.isFinite(betaP98Abs) ? betaP98Abs : 0,
    gradBetaMaxAbs: Number.isFinite(gradBetaMaxAbs) ? gradBetaMaxAbs : 0,
    gradBetaP98Abs: Number.isFinite(gradBetaP98Abs) ? gradBetaP98Abs : 0,
    advectiveCflSuggested: Number.isFinite(advectiveCflSuggested) ? advectiveCflSuggested : 0,
    charSpeedSuggested: Number.isFinite(charSpeedSuggested) ? charSpeedSuggested : 0,
    charCflSuggested: Number.isFinite(charCflSuggested) ? charCflSuggested : 0,
    shockIndex: Number.isFinite(shockIndex) ? shockIndex : 0,
    ...(shockSeverity ? { shockSeverity } : {}),
    ...(shockMode ? { shockMode } : {}),
    ...(stabilizersApplied ? { stabilizersApplied } : {}),
  };
};

const normalizeDissipation = (raw: any): GrDissipationStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const koEps = Number(raw.koEpsUsed ?? raw.koEps);
  const koTargets = raw.koTargets === "all" ? "all" : "gauge";
  if (!Number.isFinite(koEps) && koTargets === "gauge") return undefined;
  return {
    koEpsUsed: Number.isFinite(koEps) ? koEps : 0,
    koTargets,
  };
};

const normalizeSolverHealth = (raw: any): GrSolverHealth | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const status = String(raw.status ?? "").toUpperCase();
  return {
    status: status === "CERTIFIED" || status === "UNSTABLE" ? status : "NOT_CERTIFIED",
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.map((value: unknown) => String(value))
      : [],
    alphaClampFraction: Number(raw.alphaClampFraction ?? 0),
    kClampFraction: Number(raw.kClampFraction ?? 0),
    totalClampFraction: Number(raw.totalClampFraction ?? 0),
    maxAlphaBeforeClamp: Number(raw.maxAlphaBeforeClamp ?? 0),
    maxKBeforeClamp: Number(raw.maxKBeforeClamp ?? 0),
  };
};

const normalizeBrickMeta = (raw: any): GrBrickMeta | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const status = String(raw.status ?? "").toUpperCase();
  return {
    status: status === "CERTIFIED" ? "CERTIFIED" : "NOT_CERTIFIED",
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.map((value: unknown) => String(value))
      : [],
  };
};

const normalizeInvariantStats = (raw: any): GrInvariantStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    min: Number(raw.min ?? 0),
    max: Number(raw.max ?? 0),
    mean: Number(raw.mean ?? 0),
    p98: Number(raw.p98 ?? 0),
    sampleCount: Number(raw.sampleCount ?? 0),
    abs: Boolean(raw.abs),
    wallFraction: Number(raw.wallFraction ?? 0),
    bandFraction: Number(raw.bandFraction ?? 0),
    threshold: Number(raw.threshold ?? 0),
    bandMin: Number(raw.bandMin ?? 0),
    bandMax: Number(raw.bandMax ?? 0),
  };
};

const normalizeInvariantStatsSet = (raw: any): GrInvariantStatsSet | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const kretschmann = normalizeInvariantStats(raw.kretschmann);
  const ricci4 = normalizeInvariantStats(raw.ricci4);
  if (!kretschmann && !ricci4) return undefined;
  return {
    ...(kretschmann ? { kretschmann } : {}),
    ...(ricci4 ? { ricci4 } : {}),
  };
};

const normalizeStats = (raw: any): GrEvolveBrickStats => ({
  steps: Number(raw?.steps ?? 0),
  iterations: Number(raw?.iterations ?? 0),
  tolerance: Number(raw?.tolerance ?? 0),
  cfl: Number(raw?.cfl ?? 0),
  H_rms: Number(raw?.H_rms ?? 0),
  M_rms: Number(raw?.M_rms ?? 0),
  thetaPeakAbs: Number(raw?.thetaPeakAbs ?? 0),
  thetaGrowthPerStep: Number(raw?.thetaGrowthPerStep ?? 0),
  invariants: normalizeInvariantStatsSet(raw?.invariants),
  dissipation: normalizeDissipation(raw?.dissipation),
  advectScheme:
    raw?.advectScheme === "upwind1"
      ? "upwind1"
      : raw?.advectScheme === "centered"
        ? "centered"
        : undefined,
  stiffness: normalizeStiffness(raw?.stiffness),
  fixups: normalizeFixupStats(raw?.fixups),
  solverHealth: normalizeSolverHealth(raw?.solverHealth),
  stressEnergy: normalizeStressEnergyStats(raw?.stressEnergy),
  perf: normalizePerfStats(raw?.perf),
});

const decodeGrEvolveBrickBinary = (buffer: ArrayBuffer): GrEvolveBrickDecoded | null => {
  const parsed = decodeBinaryHeader(buffer);
  if (!parsed) return null;
  const { header, dataOffset } = parsed;
  if (header?.kind !== "gr-evolve-brick") return null;
  const dims = Array.isArray(header.dims) ? header.dims : null;
  if (!dims || dims.length !== 3) return null;
  const voxelBytes = Number(header.voxelBytes ?? 4);
  const total = Number(dims[0]) * Number(dims[1]) * Number(dims[2]);
  if (!Number.isFinite(total) || total <= 0) return null;
  const defaultBytes = total * (Number.isFinite(voxelBytes) && voxelBytes > 0 ? voxelBytes : 4);
  let offset = dataOffset;
  const channelsHeader = header.channels ?? {};
  const channelOrder = Array.isArray(header.channelOrder)
    ? header.channelOrder
    : GR_EVOLVE_CHANNEL_ORDER;

  const decodeChannel = (info: any): GrEvolveBrickChannel | null => {
    const bytes = Number(info?.bytes ?? defaultBytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes % 4 !== 0) return null;
    if (offset + bytes > buffer.byteLength) return null;
    if (offset % 4 !== 0) return null;
    const data = new Float32Array(buffer, offset, bytes / 4);
    offset += bytes;
    return {
      data,
      min: Number(info?.min ?? 0),
      max: Number(info?.max ?? 0),
    };
  };

  const decoded: Record<string, GrEvolveBrickChannel> = {};
  for (const key of channelOrder) {
    const info = channelsHeader[key];
    if (!info) continue;
    const channel = decodeChannel(info);
    if (!channel) return null;
    decoded[key] = channel;
  }

  const alpha = decoded.alpha;
  const beta_x = decoded.beta_x;
  const beta_y = decoded.beta_y;
  const beta_z = decoded.beta_z;
  const gamma_xx = decoded.gamma_xx;
  const gamma_yy = decoded.gamma_yy;
  const gamma_zz = decoded.gamma_zz;
  const K_trace = decoded.K_trace;
  const H_constraint = decoded.H_constraint;
  const M_constraint_x = decoded.M_constraint_x;
  const M_constraint_y = decoded.M_constraint_y;
  const M_constraint_z = decoded.M_constraint_z;
  if (
    !alpha ||
    !beta_x ||
    !beta_y ||
    !beta_z ||
    !gamma_xx ||
    !gamma_yy ||
    !gamma_zz ||
    !K_trace ||
    !H_constraint ||
    !M_constraint_x ||
    !M_constraint_y ||
    !M_constraint_z
  ) {
    return null;
  }

  const extraChannels: Record<string, GrEvolveBrickChannel> = {};
  for (const [key, channel] of Object.entries(decoded)) {
    if (GR_EVOLVE_CHANNEL_SET.has(key)) continue;
    extraChannels[key] = channel;
  }

  return {
    dims: [Number(dims[0]), Number(dims[1]), Number(dims[2])],
    voxelBytes: Number(header.voxelBytes ?? 4),
    format: "r32f",
    bounds: header.bounds,
    voxelSize_m: header.voxelSize_m,
    time_s: Number(header.time_s ?? 0),
    dt_s: Number(header.dt_s ?? 0),
    source:
      header.source === "pipeline" || header.source === "metric" || header.source === "unknown"
        ? header.source
        : undefined,
    channelOrder,
    channels: {
      alpha,
      beta_x,
      beta_y,
      beta_z,
      gamma_xx,
      gamma_yy,
      gamma_zz,
      K_trace,
      H_constraint,
      M_constraint_x,
      M_constraint_y,
      M_constraint_z,
    },
    extraChannels: Object.keys(extraChannels).length ? extraChannels : undefined,
    stats: normalizeStats(header.stats),
    meta: normalizeBrickMeta(header.meta),
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
  if (bytes.byteLength % 4 !== 0) return undefined;
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(view);
};

const buildQuery = (request: GrEvolveBrickRequest) => {
  const params = new URLSearchParams();
  if (request.quality) params.set("quality", request.quality);
  if (request.dims) params.set("dims", request.dims.join("x"));
  if (Number.isFinite(request.time_s ?? NaN)) params.set("time_s", String(request.time_s));
  if (Number.isFinite(request.dt_s ?? NaN)) params.set("dt_s", String(request.dt_s));
  if (Number.isFinite(request.steps ?? NaN)) params.set("steps", String(Math.max(0, Math.floor(request.steps as number))));
  if (Number.isFinite(request.iterations ?? NaN)) params.set("iterations", String(Math.max(0, Math.floor(request.iterations as number))));
  if (Number.isFinite(request.tolerance ?? NaN)) params.set("tolerance", String(Math.max(0, request.tolerance as number)));
  if (Number.isFinite(request.koEps ?? NaN)) {
    params.set("koEps", String(Math.max(0, request.koEps as number)));
  }
  if (request.koTargets === "all" || request.koTargets === "gauge") {
    params.set("koTargets", request.koTargets);
  }
  if (
    request.shockMode === "off" ||
    request.shockMode === "diagnostic" ||
    request.shockMode === "stabilize"
  ) {
    params.set("shockMode", request.shockMode);
  }
  if (request.advectScheme === "upwind1" || request.advectScheme === "centered") {
    params.set("advectScheme", request.advectScheme);
  }
  if (Number.isFinite(request.lapseKappa ?? NaN)) params.set("kappa", String(request.lapseKappa));
  if (Number.isFinite(request.shiftEta ?? NaN)) params.set("eta", String(request.shiftEta));
  if (Number.isFinite(request.shiftGamma ?? NaN)) params.set("shiftGamma", String(request.shiftGamma));
  if (typeof request.advect === "boolean") params.set("advect", request.advect ? "1" : "0");
  if (typeof request.includeExtra === "boolean") {
    params.set("includeExtra", request.includeExtra ? "1" : "0");
  }
  if (typeof request.includeMatter === "boolean") {
    params.set("includeMatter", request.includeMatter ? "1" : "0");
  }
  if (typeof request.includeKij === "boolean") {
    params.set("includeKij", request.includeKij ? "1" : "0");
  }
  if (Number.isFinite(request.invariantWallFraction ?? NaN)) {
    params.set("invariantWallFraction", String(request.invariantWallFraction));
  }
  if (Number.isFinite(request.invariantBandFraction ?? NaN)) {
    params.set("invariantBandFraction", String(request.invariantBandFraction));
  }
  if (Number.isFinite(request.invariantSampleMax ?? NaN)) {
    params.set("invariantSampleMax", String(request.invariantSampleMax));
  }
  if (Number.isFinite(request.invariantPercentile ?? NaN)) {
    params.set("invariantPercentile", String(request.invariantPercentile));
  }
  if (request.order === 4 || request.order === 2) params.set("order", String(request.order));
  if (request.boundary === "periodic" || request.boundary === "clamp") {
    params.set("boundary", request.boundary);
  }
  if (Array.isArray(request.driveDir) && request.driveDir.length >= 3) {
    const parts = request.driveDir
      .slice(0, 3)
      .map((value: number) => Number(value));
    if (parts.every((value) => Number.isFinite(value))) {
      params.set("driveDir", parts.join(","));
    }
  }
  if (Number.isFinite(request.dutyFR ?? NaN)) {
    params.set("dutyFR", String(Math.max(1e-8, request.dutyFR as number)));
  }
  if (Number.isFinite(request.q ?? NaN)) {
    params.set("q", String(Math.max(1e-6, request.q as number)));
  }
  if (Number.isFinite(request.gammaGeo ?? NaN)) {
    params.set("gammaGeo", String(Math.max(1e-6, request.gammaGeo as number)));
  }
  if (Number.isFinite(request.gammaVdB ?? NaN)) {
    params.set("gammaVdB", String(Math.max(1e-6, request.gammaVdB as number)));
  }
  if (Number.isFinite(request.zeta ?? NaN)) {
    params.set("zeta", String(Math.max(0, request.zeta as number)));
  }
  if (Number.isFinite(request.phase01 ?? NaN)) {
    const phase = request.phase01 as number;
    const wrapped = ((phase % 1) + 1) % 1;
    params.set("phase01", String(wrapped));
  }
  params.set("format", BRICK_FORMAT);
  return params.toString();
};

export async function fetchGrEvolveBrick(
  request: GrEvolveBrickRequest,
  signal?: AbortSignal,
): Promise<GrEvolveBrickDecoded> {
  const query = buildQuery(request);
  const res = await apiRequest("GET", `/api/helix/gr-evolve-brick?${query}`, undefined, signal, {
    headers: { Accept: "application/octet-stream, application/json" },
  });
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (BINARY_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    const buffer = await res.arrayBuffer();
    const decoded = decodeGrEvolveBrickBinary(buffer);
    if (!decoded) {
      throw new Error("Failed to decode gr-evolve brick binary payload");
    }
    return decoded;
  }
  const json = await res.json();
  const dims = (json.dims ?? []) as number[];
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error("Invalid gr-evolve brick dimensions");
  }
  const decodeChannel = (payload: any, label: string): GrEvolveBrickChannel => {
    const data = decodeFloat32(payload?.data);
    if (!data) throw new Error(`Failed to decode gr-evolve channel ${label}`);
    return {
      data,
      min: Number(payload?.min ?? 0),
      max: Number(payload?.max ?? 0),
    };
  };
  const channelOrder = Array.isArray(json.channelOrder) ? json.channelOrder : undefined;
  const extraChannels: Record<string, GrEvolveBrickChannel> = {};
  const jsonChannels = json.channels ?? {};
  if (jsonChannels && typeof jsonChannels === "object") {
    for (const [key, value] of Object.entries(jsonChannels)) {
      if (GR_EVOLVE_CHANNEL_SET.has(key)) continue;
      extraChannels[key] = decodeChannel(value, key);
    }
  }

  return {
    dims: [dims[0], dims[1], dims[2]],
    voxelBytes: Number(json.voxelBytes ?? 4),
    format: "r32f",
    bounds: json.bounds,
    voxelSize_m: json.voxelSize_m,
    time_s: Number(json.time_s ?? 0),
    dt_s: Number(json.dt_s ?? 0),
    source:
      json.source === "pipeline" || json.source === "metric" || json.source === "unknown"
        ? json.source
        : undefined,
    channelOrder,
    channels: {
      alpha: decodeChannel(json.channels?.alpha, "alpha"),
      beta_x: decodeChannel(json.channels?.beta_x, "beta_x"),
      beta_y: decodeChannel(json.channels?.beta_y, "beta_y"),
      beta_z: decodeChannel(json.channels?.beta_z, "beta_z"),
      gamma_xx: decodeChannel(json.channels?.gamma_xx, "gamma_xx"),
      gamma_yy: decodeChannel(json.channels?.gamma_yy, "gamma_yy"),
      gamma_zz: decodeChannel(json.channels?.gamma_zz, "gamma_zz"),
      K_trace: decodeChannel(json.channels?.K_trace, "K_trace"),
      H_constraint: decodeChannel(json.channels?.H_constraint, "H_constraint"),
      M_constraint_x: decodeChannel(json.channels?.M_constraint_x, "M_constraint_x"),
      M_constraint_y: decodeChannel(json.channels?.M_constraint_y, "M_constraint_y"),
      M_constraint_z: decodeChannel(json.channels?.M_constraint_z, "M_constraint_z"),
    },
    extraChannels: Object.keys(extraChannels).length ? extraChannels : undefined,
    stats: normalizeStats(json.stats),
    meta: normalizeBrickMeta(json.meta),
  };
}
