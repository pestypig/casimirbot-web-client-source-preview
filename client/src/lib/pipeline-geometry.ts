import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";

const LIGHT_SPEED_M_PER_S = 299_792_458;

const finiteNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

type PipelineGeometryLike = Pick<
  EnergyPipelineState,
  "bubble" | "hull" | "R" | "tau_LC_ms"
> & {
  tauLC_ms?: number | null;
  lightCrossing?: {
    tauLC_ms?: number | null;
  } | null;
};

export const resolvePipelineBubbleRadiusM = (
  state?: PipelineGeometryLike | null,
): number | null => {
  const bubbleRadius = finiteNumber(state?.bubble?.R) ?? finiteNumber(state?.R);
  return bubbleRadius != null && bubbleRadius > 0 ? bubbleRadius : null;
};

export const resolvePipelineHullGeometryM = (
  state?: PipelineGeometryLike | null,
): { Lx_m: number; Ly_m: number; Lz_m: number } | null => {
  const Lx_m = finiteNumber(state?.hull?.Lx_m);
  const Ly_m = finiteNumber(state?.hull?.Ly_m);
  const Lz_m = finiteNumber(state?.hull?.Lz_m);
  if (Lx_m != null && Ly_m != null && Lz_m != null && Lx_m > 0 && Ly_m > 0 && Lz_m > 0) {
    return { Lx_m, Ly_m, Lz_m };
  }

  const bubbleRadius = resolvePipelineBubbleRadiusM(state);
  if (bubbleRadius != null) {
    const span = bubbleRadius * 2;
    return { Lx_m: span, Ly_m: span, Lz_m: span };
  }

  return null;
};

export const resolvePipelineHullReferenceRadiusM = (
  state?: PipelineGeometryLike | null,
): number | null => {
  const hull = resolvePipelineHullGeometryM(state);
  if (hull) return Math.max(hull.Lx_m, hull.Ly_m, hull.Lz_m) / 2;
  return null;
};

export const resolvePipelineTauLcMs = (
  state?: PipelineGeometryLike | null,
): number | null => {
  const directTau =
    finiteNumber(state?.tau_LC_ms) ??
    finiteNumber(state?.tauLC_ms) ??
    finiteNumber(state?.lightCrossing?.tauLC_ms);
  if (directTau != null && directTau > 0) return directTau;

  const hull = resolvePipelineHullGeometryM(state);
  if (hull) {
    const longestAxisM = Math.max(hull.Lx_m, hull.Ly_m, hull.Lz_m);
    return (longestAxisM / LIGHT_SPEED_M_PER_S) * 1e3;
  }

  const bubbleRadius = resolvePipelineBubbleRadiusM(state);
  if (bubbleRadius != null) {
    return ((2 * bubbleRadius) / LIGHT_SPEED_M_PER_S) * 1e3;
  }

  return null;
};
