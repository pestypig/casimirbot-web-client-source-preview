import { apiRequest } from "@/lib/queryClient";
import type { CurvatureBrickRequest } from "@/lib/curvature-brick";

declare const Buffer: undefined | { from(input: string, encoding: string): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number } };

export type StressEnergyBrickRequest = CurvatureBrickRequest & {
  observerRapidityCap?: number;
  observerTypeITolerance?: number;
};

export interface StressEnergyBrickChannel {
  data: Float32Array;
  min: number;
  max: number;
}

export interface StressEnergyBrickStats {
  totalEnergy_J: number;
  invariantMass_kg?: number;
  invariantMassEnergy_J?: number;
  avgT00: number;
  avgFluxMagnitude: number;
  netFlux: [number, number, number];
  divMin: number;
  divMax: number;
  dutyFR: number;
  strobePhase: number;
  natario?: {
    divBetaMax: number;
    divBetaRms: number;
    divBetaMaxPre?: number;
    divBetaRmsPre?: number;
    divBetaMaxPost?: number;
    divBetaRmsPost?: number;
    clampScale?: number;
    gateLimit: number;
    gNatario: number;
  };
  conservation?: StressEnergyConservationStats;
  mapping?: StressEnergyMappingStats;
  observerRobust?: ObserverRobustDiagnostics;
}

export interface StressEnergyConservationStats {
  divMean: number;
  divAbsMean: number;
  divRms: number;
  divMaxAbs: number;
  netFluxMagnitude: number;
  netFluxNorm: number;
  divRmsNorm: number;
}

export interface StressEnergyMappingStats {
  rho_avg: number;
  rho_inst: number;
  gap_nm: number;
  cavityQ: number;
  qSpoil: number;
  gammaGeo: number;
  gammaVdB: number;
  dutyFR: number;
  ampBase: number;
  zeta: number;
  pressureFactor?: number;
  pressureSource?: "pipeline" | "proxy" | "override";
  source?: "pipeline" | "defaults" | "metric";
  proxy: boolean;
}

export type ObserverMarginSource = "algebraic_type_i" | "capped_search";
export type ObserverConditionKey = "nec" | "wec" | "sec" | "dec";
export type ObserverFrameKey = "Eulerian" | "Robust" | "Delta" | "Missed";

export const OBSERVER_ROBUST_SELECTION_CHANNEL = "hull3d:observer-robust-selection";
export const OBSERVER_DIRECTION_OVERLAY_CHANNEL = "hull3d:observer-direction-overlay";

export interface ObserverRobustSelection {
  condition: ObserverConditionKey;
  frame: ObserverFrameKey;
}

export interface ObserverConditionSummary {
  eulerianMin: number;
  eulerianMean: number;
  robustMin: number;
  robustMean: number;
  eulerianViolationFraction: number;
  robustViolationFraction: number;
  missedViolationFraction: number;
  severityGainMin: number;
  severityGainMean: number;
  maxRobustMinusEulerian: number;
  worstCase: {
    index: number;
    value: number;
    direction: [number, number, number];
    rapidity: number | null;
    source: ObserverMarginSource;
  };
}

export interface ObserverRobustDiagnostics {
  pressureModel: "isotropic_pressure";
  pressureFactor: number;
  rapidityCap: number;
  rapidityCapBeta: number;
  typeI: {
    count: number;
    fraction: number;
    tolerance: number;
  };
  nec: ObserverConditionSummary;
  wec: ObserverConditionSummary;
  sec: ObserverConditionSummary;
  dec: ObserverConditionSummary;
  consistency: {
    robustNotGreaterThanEulerian: boolean;
    maxRobustMinusEulerian: number;
  };
}

export interface StressEnergyBrickDecoded {
  dims: [number, number, number];
  t00: StressEnergyBrickChannel;
  flux: {
    Sx: StressEnergyBrickChannel;
    Sy: StressEnergyBrickChannel;
    Sz: StressEnergyBrickChannel;
    divS: StressEnergyBrickChannel;
  };
  stats: StressEnergyBrickStats;
  meta?: {
    source?: "pipeline" | "metric" | "unknown";
    proxy?: boolean;
    congruence?: "proxy-only" | "geometry-derived" | "conditional";
    metricT00Ref?: string;
    metricT00Source?: string;
  };
}

export interface ObserverFrameField {
  data: Float32Array;
  min: number;
  max: number;
}

export interface ObserverDirectionOverlayConfig {
  enabled: boolean;
  stride?: number;
  decDirectionMode?: "local" | "global";
  maskMode?: "all" | "violating" | "missed";
  minMagnitude?: number;
}

export interface ObserverDirectionField {
  directions: Float32Array;
  mask?: Float32Array;
  magnitude?: Float32Array;
  minMagnitude: number;
  maxMagnitude: number;
  activeCount: number;
  totalCount: number;
}

const EPS = 1e-9;

type Vec3 = [number, number, number];

const normalize = (v: Vec3): Vec3 => {
  const mag = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(mag) || mag <= 0) return [0, 0, 0];
  return [v[0] / mag, v[1] / mag, v[2] / mag];
};

const hasFiniteDirection = (value: Vec3 | null | undefined): boolean => {
  if (!value) return false;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) return false;
  return Math.hypot(value[0], value[1], value[2]) > EPS;
};

const safeDirection = (value: Vec3 | null | undefined, fallback: Vec3 = [1, 0, 0]): Vec3 => {
  if (!value) return normalize(fallback);
  const n = normalize(value);
  if (Math.hypot(n[0], n[1], n[2]) > 0) return n;
  return normalize(fallback);
};

const cross = (a: Vec3, b: Vec3): Vec3 => ([
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]);

const orthogonalDirection = (direction: Vec3): Vec3 => {
  const base = Math.abs(direction[0]) < 0.9 ? ([1, 0, 0] as Vec3) : ([0, 1, 0] as Vec3);
  return safeDirection(cross(direction, base), [0, 0, 1]);
};

const clampBeta = (value: number, cap: number): number => {
  const finiteCap = Number.isFinite(cap) ? Math.max(0, Math.min(0.999999999, cap)) : 0;
  const finiteValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(finiteCap, finiteValue));
};

const evaluateWecMargin = (rho: number, pressure: number, fluxMag: number, beta: number): number => {
  const b = Math.max(0, Math.min(0.999999999, beta));
  const oneMinus = Math.max(1e-12, 1 - b * b);
  return (rho - 2 * fluxMag * b + pressure * b * b) / oneMinus;
};

const optimizeWecMargin = (
  rho: number,
  pressure: number,
  fluxMag: number,
  betaCap: number,
): { margin: number; beta: number } => {
  const cap = clampBeta(betaCap, betaCap);
  let bestBeta = 0;
  let bestMargin = evaluateWecMargin(rho, pressure, fluxMag, 0);
  const consider = (candidate: number) => {
    if (!Number.isFinite(candidate)) return;
    const b = clampBeta(candidate, cap);
    const margin = evaluateWecMargin(rho, pressure, fluxMag, b);
    if (margin < bestMargin) {
      bestMargin = margin;
      bestBeta = b;
    }
  };

  consider(cap);
  if (fluxMag > EPS) {
    const discriminant = (rho + pressure) * (rho + pressure) - 4 * fluxMag * fluxMag;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const denom = 2 * fluxMag;
      consider((rho + pressure - root) / denom);
      consider((rho + pressure + root) / denom);
    }
  }
  return { margin: bestMargin, beta: bestBeta };
};

const evaluateDecMargin = (
  rho: number,
  pressure: number,
  sx: number,
  sy: number,
  sz: number,
  direction: Vec3,
  beta: number,
): number => {
  const dir = safeDirection(direction, [1, 0, 0]);
  const b = Math.max(0, Math.min(0.999999999, beta));
  const oneMinus = Math.max(1e-12, 1 - b * b);
  const gamma = 1 / Math.sqrt(oneMinus);
  const gamma2 = 1 / oneMinus;
  const dotSn = sx * dir[0] + sy * dir[1] + sz * dir[2];
  const energy = gamma2 * (rho + 2 * b * dotSn + pressure * b * b);
  const j0 = gamma * (rho + b * dotSn);
  const jx = -gamma * (sx + pressure * b * dir[0]);
  const jy = -gamma * (sy + pressure * b * dir[1]);
  const jz = -gamma * (sz + pressure * b * dir[2]);
  const u0 = gamma;
  const ux = gamma * b * dir[0];
  const uy = gamma * b * dir[1];
  const uz = gamma * b * dir[2];
  const q0 = j0 - energy * u0;
  const qx = jx - energy * ux;
  const qy = jy - energy * uy;
  const qz = jz - energy * uz;
  let qNormSq = -q0 * q0 + qx * qx + qy * qy + qz * qz;
  if (qNormSq < 0 && qNormSq > -1e-9) qNormSq = 0;
  if (qNormSq < 0) qNormSq = 0;
  return energy - Math.sqrt(qNormSq);
};

const optimizeDecMargin = (args: {
  rho: number;
  pressure: number;
  sx: number;
  sy: number;
  sz: number;
  fluxDir: Vec3;
  canonicalDir: Vec3;
  betaCap: number;
  betaHint: number;
}): number => {
  const cap = clampBeta(args.betaCap, args.betaCap);
  const fluxDir = safeDirection(args.fluxDir, args.canonicalDir);
  const canonicalDir = safeDirection(args.canonicalDir, [1, 0, 0]);
  const antiFluxDir: Vec3 = [-fluxDir[0], -fluxDir[1], -fluxDir[2]];
  const parallelFluxDir: Vec3 = [fluxDir[0], fluxDir[1], fluxDir[2]];
  const orthoDir = orthogonalDirection(fluxDir);
  const directionCandidates = [antiFluxDir, canonicalDir, parallelFluxDir, orthoDir];
  const betaCandidates = [0, cap * 0.5, cap, args.betaHint];

  let bestMargin = Number.POSITIVE_INFINITY;
  for (const direction of directionCandidates) {
    for (const beta of betaCandidates) {
      const margin = evaluateDecMargin(args.rho, args.pressure, args.sx, args.sy, args.sz, direction, beta);
      if (margin < bestMargin) bestMargin = margin;
    }
  }
  if (Number.isFinite(bestMargin)) return bestMargin;
  const fallback = evaluateDecMargin(args.rho, args.pressure, args.sx, args.sy, args.sz, antiFluxDir, 0);
  return Number.isFinite(fallback) ? fallback : args.rho - Math.hypot(args.sx, args.sy, args.sz);
};

const optimizeDecDirection = (args: {
  rho: number;
  pressure: number;
  sx: number;
  sy: number;
  sz: number;
  fluxDir: Vec3;
  canonicalDir: Vec3;
  betaCap: number;
  betaHint: number;
}): Vec3 => {
  const cap = clampBeta(args.betaCap, args.betaCap);
  const fluxDir = safeDirection(args.fluxDir, args.canonicalDir);
  const canonicalDir = safeDirection(args.canonicalDir, [1, 0, 0]);
  const antiFluxDir: Vec3 = [-fluxDir[0], -fluxDir[1], -fluxDir[2]];
  const parallelFluxDir: Vec3 = [fluxDir[0], fluxDir[1], fluxDir[2]];
  const orthoDir = orthogonalDirection(fluxDir);
  const directionCandidates = [antiFluxDir, canonicalDir, parallelFluxDir, orthoDir];
  const betaCandidates = [0, cap * 0.5, cap, args.betaHint];

  let bestMargin = Number.POSITIVE_INFINITY;
  let bestDirection = antiFluxDir;
  for (const direction of directionCandidates) {
    for (const beta of betaCandidates) {
      const margin = evaluateDecMargin(args.rho, args.pressure, args.sx, args.sy, args.sz, direction, beta);
      if (margin < bestMargin) {
        bestMargin = margin;
        bestDirection = direction;
      }
    }
  }
  return safeDirection(bestDirection, antiFluxDir);
};

const resolveTypeISlacks = (rho: number, pressure: number, fluxMag: number, tolerance: number) => {
  const discriminant = (rho + pressure) * (rho + pressure) - 4 * fluxMag * fluxMag;
  if (discriminant < -Math.max(0, tolerance)) return { isTypeI: false as const };
  const sqrtDisc = Math.sqrt(Math.max(0, discriminant));
  const sign = rho + pressure >= 0 ? 1 : -1;
  const lambdaTime = 0.5 * (pressure - rho - sign * sqrtDisc);
  const lambdaLongitudinal = 0.5 * (pressure - rho + sign * sqrtDisc);
  const epsilon = -lambdaTime;
  const pParallel = lambdaLongitudinal;
  const pPerp = pressure;
  const nec = Math.min(epsilon + pParallel, epsilon + pPerp);
  const wec = Math.min(epsilon, nec);
  const sec = Math.min(epsilon + pParallel, epsilon + pPerp, epsilon + pParallel + 2 * pPerp);
  const dec = Math.min(epsilon, epsilon - Math.abs(pParallel), epsilon - Math.abs(pPerp));
  if (!Number.isFinite(nec) || !Number.isFinite(wec) || !Number.isFinite(sec) || !Number.isFinite(dec)) {
    return { isTypeI: false as const };
  }
  return { isTypeI: true as const, nec, wec, sec, dec };
};

export const buildObserverFrameField = (
  brick: StressEnergyBrickDecoded,
  selection: ObserverRobustSelection,
): ObserverFrameField | null => {
  if (!brick.stats.observerRobust) return null;
  const total = Math.min(brick.t00.data.length, brick.flux.Sx.data.length, brick.flux.Sy.data.length, brick.flux.Sz.data.length);
  if (total <= 0) return null;
  const data = new Float32Array(total);
  const pressureFactor = Number.isFinite(brick.stats.observerRobust.pressureFactor) ? brick.stats.observerRobust.pressureFactor : -1;
  const betaCap = Number.isFinite(brick.stats.observerRobust.rapidityCapBeta)
    ? Math.max(0, Math.min(0.999999999, brick.stats.observerRobust.rapidityCapBeta))
    : Math.tanh(Math.max(0, brick.stats.observerRobust.rapidityCap ?? 0));
  const typeITolerance = Number.isFinite(brick.stats.observerRobust.typeI?.tolerance)
    ? Math.max(0, brick.stats.observerRobust.typeI.tolerance)
    : 1e-9;
  const canonicalNullDir: Vec3 = [1, 0, 0];

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i += 1) {
    const rho = Number.isFinite(brick.t00.data[i]) ? brick.t00.data[i] : 0;
    const sx = Number.isFinite(brick.flux.Sx.data[i]) ? brick.flux.Sx.data[i] : 0;
    const sy = Number.isFinite(brick.flux.Sy.data[i]) ? brick.flux.Sy.data[i] : 0;
    const sz = Number.isFinite(brick.flux.Sz.data[i]) ? brick.flux.Sz.data[i] : 0;
    const pressure = rho * pressureFactor;
    const trace = -rho + 3 * pressure;
    const fluxMag = Math.hypot(sx, sy, sz);
    const fluxDir = fluxMag > EPS ? ([sx / fluxMag, sy / fluxMag, sz / fluxMag] as Vec3) : canonicalNullDir;
    const canonicalFluxProjection = sx * canonicalNullDir[0] + sy * canonicalNullDir[1] + sz * canonicalNullDir[2];
    const eulerianByCondition = {
      nec: rho + pressure + 2 * canonicalFluxProjection,
      wec: rho,
      sec: rho + 0.5 * trace,
      dec: rho - fluxMag,
    } as const;

    const typeI = resolveTypeISlacks(rho, pressure, fluxMag, typeITolerance);
    const robustByCondition = typeI.isTypeI
      ? { nec: typeI.nec, wec: typeI.wec, sec: typeI.sec, dec: typeI.dec }
      : (() => {
          const wecOptimized = optimizeWecMargin(rho, pressure, fluxMag, betaCap);
          return {
            nec: rho + pressure - 2 * fluxMag,
            wec: wecOptimized.margin,
            sec: wecOptimized.margin + 0.5 * trace,
            dec: optimizeDecMargin({
              rho,
              pressure,
              sx,
              sy,
              sz,
              fluxDir,
              canonicalDir: canonicalNullDir,
              betaCap,
              betaHint: wecOptimized.beta,
            }),
          };
        })();

    const eulerian = eulerianByCondition[selection.condition];
    const robust = robustByCondition[selection.condition];
    const rawValue =
      selection.frame === "Eulerian"
        ? eulerian
        : selection.frame === "Robust"
          ? robust
          : selection.frame === "Delta"
            ? robust - eulerian
            : robust < 0 && eulerian >= 0
              ? 1
              : 0;
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    data[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    data,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
  };
};

export const buildObserverDirectionField = (
  brick: StressEnergyBrickDecoded,
  condition: ObserverConditionKey,
  config?: ObserverDirectionOverlayConfig,
): ObserverDirectionField | null => {
  if (!brick.stats.observerRobust) return null;
  const total = Math.min(brick.t00.data.length, brick.flux.Sx.data.length, brick.flux.Sy.data.length, brick.flux.Sz.data.length);
  if (total <= 0) return null;

  const directions = new Float32Array(total * 3);
  const magnitude = new Float32Array(total);
  const mask = new Float32Array(total);

  const pressureFactor = Number.isFinite(brick.stats.observerRobust.pressureFactor) ? brick.stats.observerRobust.pressureFactor : -1;
  const betaCap = Number.isFinite(brick.stats.observerRobust.rapidityCapBeta)
    ? Math.max(0, Math.min(0.999999999, brick.stats.observerRobust.rapidityCapBeta))
    : Math.tanh(Math.max(0, brick.stats.observerRobust.rapidityCap ?? 0));
  const typeITolerance = Number.isFinite(brick.stats.observerRobust.typeI?.tolerance)
    ? Math.max(0, brick.stats.observerRobust.typeI.tolerance)
    : 1e-9;
  const canonicalDir: Vec3 = [1, 0, 0];
  const decDirectionMode = config?.decDirectionMode === "global" ? "global" : "local";
  const maskMode = config?.maskMode === "all" || config?.maskMode === "missed" ? config.maskMode : "violating";
  const minMagnitudeThresholdRaw = Number(config?.minMagnitude ?? 0);
  const minMagnitudeThreshold = Number.isFinite(minMagnitudeThresholdRaw) ? Math.max(0, minMagnitudeThresholdRaw) : 0;
  const decSearchDirectionRaw = brick.stats.observerRobust.dec?.worstCase?.direction as Vec3 | undefined;
  const decSearchDirection = safeDirection(decSearchDirectionRaw, canonicalDir);
  const hasDecSearchDirection = hasFiniteDirection(decSearchDirectionRaw);

  let minMagnitude = Number.POSITIVE_INFINITY;
  let maxMagnitude = Number.NEGATIVE_INFINITY;
  let activeCount = 0;

  for (let i = 0; i < total; i += 1) {
    const rho = Number.isFinite(brick.t00.data[i]) ? brick.t00.data[i] : 0;
    const sx = Number.isFinite(brick.flux.Sx.data[i]) ? brick.flux.Sx.data[i] : 0;
    const sy = Number.isFinite(brick.flux.Sy.data[i]) ? brick.flux.Sy.data[i] : 0;
    const sz = Number.isFinite(brick.flux.Sz.data[i]) ? brick.flux.Sz.data[i] : 0;
    const fluxMag = Math.hypot(sx, sy, sz);
    const fluxDir = fluxMag > EPS ? ([sx / fluxMag, sy / fluxMag, sz / fluxMag] as Vec3) : canonicalDir;
    const antiFluxDir: Vec3 = [-fluxDir[0], -fluxDir[1], -fluxDir[2]];
    const pressure = rho * pressureFactor;
    const canonicalFluxProjection = sx * canonicalDir[0] + sy * canonicalDir[1] + sz * canonicalDir[2];
    const wecOptimized = optimizeWecMargin(rho, pressure, fluxMag, betaCap);
    const robustByCondition = {
      nec: Math.min(rho + pressure + 2 * canonicalFluxProjection, rho + pressure - 2 * fluxMag * betaCap),
      wec: wecOptimized.margin,
      sec: Math.min(rho + pressure + 2 * canonicalFluxProjection, rho + pressure - 2 * fluxMag * betaCap) + 2 * pressure,
      dec: optimizeDecMargin({
        rho,
        pressure,
        sx,
        sy,
        sz,
        fluxDir,
        canonicalDir,
        betaCap,
        betaHint: wecOptimized.beta,
      }),
    };
    const eulerianByCondition = {
      nec: rho + pressure + 2 * canonicalFluxProjection,
      wec: rho,
      sec: rho + 3 * pressure,
      dec: rho - Math.hypot(sx, sy, sz),
    };

    const typeI = resolveTypeISlacks(rho, pressure, fluxMag, typeITolerance);
    const direction = typeI.isTypeI
      ? safeDirection(antiFluxDir, canonicalDir)
      : condition === "dec"
        ? (() => {
            if (decDirectionMode === "global" && hasDecSearchDirection) return decSearchDirection;
            const decOptimized = optimizeDecDirection({
              rho,
              pressure,
              sx,
              sy,
              sz,
              fluxDir,
              canonicalDir,
              betaCap,
              betaHint: wecOptimized.beta,
            });
            return fluxMag > EPS ? decOptimized : safeDirection(antiFluxDir, canonicalDir);
          })()
        : safeDirection(antiFluxDir, canonicalDir);

    const x = Number.isFinite(direction[0]) ? direction[0] : 0;
    const y = Number.isFinite(direction[1]) ? direction[1] : 0;
    const z = Number.isFinite(direction[2]) ? direction[2] : 0;
    const norm = Math.hypot(x, y, z);
    const robust = robustByCondition[condition];
    const eulerian = eulerianByCondition[condition];
    const robustViolation = robust < 0;
    const missed = robustViolation && eulerian >= 0;
    const maskEnabled =
      maskMode === "all"
        ? true
        : maskMode === "violating"
          ? robustViolation
          : missed;
    const isActive = Number.isFinite(norm) && norm > 1e-8 && maskEnabled && fluxMag >= minMagnitudeThreshold;
    const base = i * 3;
    if (isActive) {
      directions[base] = x / norm;
      directions[base + 1] = y / norm;
      directions[base + 2] = z / norm;
      magnitude[i] = fluxMag;
      mask[i] = 1;
      activeCount += 1;
      if (fluxMag < minMagnitude) minMagnitude = fluxMag;
      if (fluxMag > maxMagnitude) maxMagnitude = fluxMag;
    } else {
      directions[base] = 0;
      directions[base + 1] = 0;
      directions[base + 2] = 0;
      magnitude[i] = 0;
      mask[i] = 0;
      if (0 < minMagnitude) minMagnitude = 0;
      if (0 > maxMagnitude) maxMagnitude = 0;
    }
  }

  return {
    directions,
    magnitude,
    mask,
    minMagnitude: Number.isFinite(minMagnitude) ? minMagnitude : 0,
    maxMagnitude: Number.isFinite(maxMagnitude) ? maxMagnitude : 0,
    activeCount,
    totalCount: total,
  };
};

const BRICK_FORMAT = "raw";
const BINARY_CONTENT_TYPES = ["application/octet-stream", "application/x-helix-brick"];
const STRESS_CHANNEL_ORDER = ["t00", "Sx", "Sy", "Sz", "divS"] as const;
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

const normalizeNatarioStats = (raw: any) => {
  if (!raw || typeof raw !== "object") return undefined;
  const divBetaMax = Number(raw.divBetaMax ?? raw.divMax);
  const divBetaRms = Number(raw.divBetaRms ?? raw.divRms);
  const divBetaMaxPre = Number(raw.divBetaMaxPre ?? raw.divBetaMaxBefore ?? raw.divMaxPre);
  const divBetaRmsPre = Number(raw.divBetaRmsPre ?? raw.divRmsPre);
  const divBetaMaxPost = Number(raw.divBetaMaxPost ?? divBetaMax);
  const divBetaRmsPost = Number(raw.divBetaRmsPost ?? divBetaRms);
  const clampScale = Number(raw.clampScale ?? raw.clampRatio);
  const gateLimit = Number(raw.gateLimit ?? raw.kTol);
  const gNatario = Number(raw.gNatario);
  if (
    !Number.isFinite(divBetaMax) &&
    !Number.isFinite(divBetaRms) &&
    !Number.isFinite(divBetaMaxPre) &&
    !Number.isFinite(divBetaRmsPre) &&
    !Number.isFinite(divBetaMaxPost) &&
    !Number.isFinite(divBetaRmsPost) &&
    !Number.isFinite(clampScale) &&
    !Number.isFinite(gateLimit) &&
    !Number.isFinite(gNatario)
  ) {
    return undefined;
  }
  return {
    divBetaMax,
    divBetaRms,
    divBetaMaxPre,
    divBetaRmsPre,
    divBetaMaxPost,
    divBetaRmsPost,
    clampScale,
    gateLimit,
    gNatario,
  };
};

const normalizeConservationStats = (raw: any): StressEnergyConservationStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const divMean = Number(raw.divMean);
  const divAbsMean = Number(raw.divAbsMean);
  const divRms = Number(raw.divRms);
  const divMaxAbs = Number(raw.divMaxAbs);
  const netFluxMagnitude = Number(raw.netFluxMagnitude);
  const netFluxNorm = Number(raw.netFluxNorm);
  const divRmsNorm = Number(raw.divRmsNorm);
  if (
    !Number.isFinite(divMean) &&
    !Number.isFinite(divAbsMean) &&
    !Number.isFinite(divRms) &&
    !Number.isFinite(divMaxAbs) &&
    !Number.isFinite(netFluxMagnitude) &&
    !Number.isFinite(netFluxNorm) &&
    !Number.isFinite(divRmsNorm)
  ) {
    return undefined;
  }
  return {
    divMean,
    divAbsMean,
    divRms,
    divMaxAbs,
    netFluxMagnitude,
    netFluxNorm,
    divRmsNorm,
  };
};

const normalizeMappingStats = (
  raw: any,
  fallbackDutyFR: number,
): StressEnergyMappingStats | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const pressureSourceRaw = typeof raw.pressureSource === "string" ? raw.pressureSource : undefined;
  const pressureSource =
    pressureSourceRaw === "pipeline" || pressureSourceRaw === "proxy" || pressureSourceRaw === "override"
      ? pressureSourceRaw
      : undefined;
  const sourceRaw = typeof raw.source === "string" ? raw.source : undefined;
  const source =
    sourceRaw === "pipeline" || sourceRaw === "defaults" || sourceRaw === "metric"
      ? sourceRaw
      : undefined;
  const proxy = typeof raw.proxy === "boolean" ? raw.proxy : Boolean(raw.proxy);
  const rho_avg = Number(raw.rho_avg);
  const rho_inst = Number(raw.rho_inst);
  const gap_nm = Number(raw.gap_nm);
  const cavityQ = Number(raw.cavityQ);
  const qSpoil = Number(raw.qSpoil);
  const gammaGeo = Number(raw.gammaGeo);
  const gammaVdB = Number(raw.gammaVdB);
  const dutyFR = Number(raw.dutyFR ?? fallbackDutyFR);
  const ampBase = Number(raw.ampBase);
  const zeta = Number(raw.zeta);
  const pressureFactor = Number(raw.pressureFactor);
  const hasData =
    Number.isFinite(rho_avg) ||
    Number.isFinite(rho_inst) ||
    Number.isFinite(gap_nm) ||
    Number.isFinite(cavityQ) ||
    Number.isFinite(qSpoil) ||
    Number.isFinite(gammaGeo) ||
    Number.isFinite(gammaVdB) ||
    Number.isFinite(dutyFR) ||
    Number.isFinite(ampBase) ||
    Number.isFinite(zeta) ||
    Number.isFinite(pressureFactor) ||
    pressureSource ||
    source ||
    typeof raw.proxy === "boolean";
  if (!hasData) return undefined;
  return {
    rho_avg,
    rho_inst,
    gap_nm,
    cavityQ,
    qSpoil,
    gammaGeo,
    gammaVdB,
    dutyFR,
    ampBase,
    zeta,
    pressureFactor: Number.isFinite(pressureFactor) ? pressureFactor : undefined,
    pressureSource,
    source,
    proxy,
  };
};

const normalizeObserverConditionSummary = (raw: any): ObserverConditionSummary | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const directionRaw = Array.isArray(raw.worstCase?.direction) ? raw.worstCase.direction : [];
  const sourceRaw = typeof raw.worstCase?.source === "string" ? raw.worstCase.source : "capped_search";
  const source: ObserverMarginSource =
    sourceRaw === "algebraic_type_i" || sourceRaw === "capped_search"
      ? sourceRaw
      : "capped_search";
  return {
    eulerianMin: Number(raw.eulerianMin ?? 0),
    eulerianMean: Number(raw.eulerianMean ?? 0),
    robustMin: Number(raw.robustMin ?? 0),
    robustMean: Number(raw.robustMean ?? 0),
    eulerianViolationFraction: Number(raw.eulerianViolationFraction ?? 0),
    robustViolationFraction: Number(raw.robustViolationFraction ?? 0),
    missedViolationFraction: Number(raw.missedViolationFraction ?? 0),
    severityGainMin: Number(raw.severityGainMin ?? 0),
    severityGainMean: Number(raw.severityGainMean ?? 0),
    maxRobustMinusEulerian: Number(raw.maxRobustMinusEulerian ?? 0),
    worstCase: {
      index: Number(raw.worstCase?.index ?? -1),
      value: Number(raw.worstCase?.value ?? 0),
      direction: [
        Number(directionRaw[0] ?? 0),
        Number(directionRaw[1] ?? 0),
        Number(directionRaw[2] ?? 0),
      ],
      rapidity: Number.isFinite(Number(raw.worstCase?.rapidity))
        ? Number(raw.worstCase?.rapidity)
        : null,
      source,
    },
  };
};

const normalizeObserverRobustStats = (raw: any): ObserverRobustDiagnostics | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const nec = normalizeObserverConditionSummary(raw.nec);
  const wec = normalizeObserverConditionSummary(raw.wec);
  const sec = normalizeObserverConditionSummary(raw.sec);
  const dec = normalizeObserverConditionSummary(raw.dec);
  if (!nec || !wec || !sec || !dec) return undefined;
  return {
    pressureModel: "isotropic_pressure",
    pressureFactor: Number(raw.pressureFactor ?? 0),
    rapidityCap: Number(raw.rapidityCap ?? 0),
    rapidityCapBeta: Number(raw.rapidityCapBeta ?? 0),
    typeI: {
      count: Number(raw.typeI?.count ?? 0),
      fraction: Number(raw.typeI?.fraction ?? 0),
      tolerance: Number(raw.typeI?.tolerance ?? 0),
    },
    nec,
    wec,
    sec,
    dec,
    consistency: {
      robustNotGreaterThanEulerian: raw.consistency?.robustNotGreaterThanEulerian === true,
      maxRobustMinusEulerian: Number(raw.consistency?.maxRobustMinusEulerian ?? 0),
    },
  };
};

const normalizeStats = (raw: any, fallbackDutyFR: number): StressEnergyBrickStats => ({
  totalEnergy_J: Number(raw?.totalEnergy_J ?? 0),
  invariantMass_kg: Number.isFinite(Number(raw?.invariantMass_kg))
    ? Number(raw?.invariantMass_kg)
    : undefined,
  invariantMassEnergy_J: Number.isFinite(Number(raw?.invariantMassEnergy_J))
    ? Number(raw?.invariantMassEnergy_J)
    : undefined,
  avgT00: Number(raw?.avgT00 ?? 0),
  avgFluxMagnitude: Number(raw?.avgFluxMagnitude ?? 0),
  netFlux: Array.isArray(raw?.netFlux) && raw.netFlux.length === 3
    ? [Number(raw.netFlux[0] ?? 0), Number(raw.netFlux[1] ?? 0), Number(raw.netFlux[2] ?? 0)]
    : [0, 0, 0],
  divMin: Number(raw?.divMin ?? 0),
  divMax: Number(raw?.divMax ?? 0),
  dutyFR: Number(raw?.dutyFR ?? fallbackDutyFR ?? 0),
  strobePhase: Number(raw?.strobePhase ?? 0),
  natario: normalizeNatarioStats(raw?.natario),
  conservation: normalizeConservationStats(raw?.conservation),
  mapping: normalizeMappingStats(raw?.mapping, fallbackDutyFR),
  observerRobust: normalizeObserverRobustStats(raw?.observerRobust),
});

const decodeStressEnergyBrickBinary = (
  buffer: ArrayBuffer,
  fallbackDutyFR: number,
): StressEnergyBrickDecoded | null => {
  const parsed = decodeBinaryHeader(buffer);
  if (!parsed) return null;
  const { header, dataOffset } = parsed;
  if (header?.kind !== "stress-energy-brick") return null;
  const dims = Array.isArray(header.dims) ? header.dims : null;
  if (!dims || dims.length !== 3) return null;
  const voxelBytes = Number(header.voxelBytes ?? 4);
  const total = Number(dims[0]) * Number(dims[1]) * Number(dims[2]);
  if (!Number.isFinite(total) || total <= 0) return null;
  const defaultBytes = total * (Number.isFinite(voxelBytes) && voxelBytes > 0 ? voxelBytes : 4);
  let offset = dataOffset;
  const channelsHeader = header.channels ?? {};

  const decodeChannel = (key: typeof STRESS_CHANNEL_ORDER[number]): StressEnergyBrickChannel | null => {
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

  const t00 = decodeChannel("t00");
  const Sx = decodeChannel("Sx");
  const Sy = decodeChannel("Sy");
  const Sz = decodeChannel("Sz");
  const divS = decodeChannel("divS");
  if (!t00 || !Sx || !Sy || !Sz || !divS) return null;

  const meta =
    header && typeof header === "object"
      ? {
          source: header.source as "pipeline" | "metric" | "unknown" | undefined,
          proxy: typeof header.proxy === "boolean" ? header.proxy : undefined,
          congruence: header.congruence as "proxy-only" | "geometry-derived" | "conditional" | undefined,
          metricT00Ref: typeof header.metricT00Ref === "string" ? header.metricT00Ref : undefined,
          metricT00Source: typeof header.metricT00Source === "string" ? header.metricT00Source : undefined,
        }
      : undefined;
  return {
    dims: [Number(dims[0]), Number(dims[1]), Number(dims[2])],
    t00,
    flux: { Sx, Sy, Sz, divS },
    stats: normalizeStats(header.stats, fallbackDutyFR),
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
  if (bytes.byteLength % 4 !== 0) return undefined;
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(view);
};

const buildQuery = (request: StressEnergyBrickRequest) => {
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
  const observerRapidityCap = Number((request as any).observerRapidityCap);
  if (Number.isFinite(observerRapidityCap)) {
    params.set("observerRapidityCap", observerRapidityCap.toString());
  }
  const observerTypeITolerance = Number((request as any).observerTypeITolerance);
  if (Number.isFinite(observerTypeITolerance)) {
    params.set("observerTypeITolerance", observerTypeITolerance.toString());
  }
  params.set("format", BRICK_FORMAT);
  return params.toString();
};

export async function fetchStressEnergyBrick(request: StressEnergyBrickRequest, signal?: AbortSignal): Promise<StressEnergyBrickDecoded> {
  const query = buildQuery(request);
  const res = await apiRequest("GET", `/api/helix/stress-energy-brick?${query}`, undefined, signal, {
    headers: { Accept: "application/octet-stream, application/json" },
  });
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (BINARY_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    const buffer = await res.arrayBuffer();
    const decoded = decodeStressEnergyBrickBinary(buffer, Number(request.dutyFR ?? 0));
    if (!decoded) {
      throw new Error("Failed to decode stress-energy brick binary payload");
    }
    return decoded;
  }
  const json = await res.json();
  const dims = (json.dims ?? []) as number[];
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error("Invalid stress-energy brick dimensions");
  }
  const decodeChannel = (payload: any, label: string): StressEnergyBrickChannel => {
    const data = decodeFloat32(payload?.data);
    if (!data) throw new Error(`Failed to decode stress-energy channel ${label}`);
    return {
      data,
      min: Number(payload?.min ?? 0),
      max: Number(payload?.max ?? 0),
    };
  };
  const t00 = decodeChannel(json.channels?.t00, "t00");
  const Sx = decodeChannel(json.channels?.Sx, "Sx");
  const Sy = decodeChannel(json.channels?.Sy, "Sy");
  const Sz = decodeChannel(json.channels?.Sz, "Sz");
  const divS = decodeChannel(json.channels?.divS, "divS");

  const meta = json
    ? {
        source: json.source as "pipeline" | "metric" | "unknown" | undefined,
        proxy: typeof json.proxy === "boolean" ? json.proxy : undefined,
        congruence: json.congruence as "proxy-only" | "geometry-derived" | "conditional" | undefined,
        metricT00Ref: typeof json.metricT00Ref === "string" ? json.metricT00Ref : undefined,
        metricT00Source: typeof json.metricT00Source === "string" ? json.metricT00Source : undefined,
      }
    : undefined;
  return {
    dims: [dims[0], dims[1], dims[2]],
    t00,
    flux: { Sx, Sy, Sz, divS },
    stats: normalizeStats(json.stats, Number(request.dutyFR ?? 0)),
    meta,
  };
}
