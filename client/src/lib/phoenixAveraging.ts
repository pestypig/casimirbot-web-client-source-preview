// Utilities for GR-proxy curvature and light-crossing averaging (Phoenix window).

import { kappa_drive } from "@shared/curvature-proxy";

export type PhoenixInputs = {
  powerDensityWPerM2: number;
  dutyEffective: number; // duty / sectors, clamped [0,1]
  geometryGain: number; // storage/geometry gain factor
};

export function kappaDrive({
  powerDensityWPerM2,
  dutyEffective,
  geometryGain,
}: PhoenixInputs): number {
  const p = Math.max(0, powerDensityWPerM2);
  const d = Math.max(0, Math.min(1, dutyEffective));
  const g = Math.max(0, geometryGain);
  return kappa_drive(p, d, g);
}

// Compact Hann window; |u| <= 1 maps to [0,1], 0 otherwise.
export function hann(u: number): number {
  if (Math.abs(u) > 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * u));
}

// Build a normalized Hann kernel for a given light-crossing time and sample spacing.
function buildKernel(tauLC: number, dt: number): { kernel: Float64Array; radius: number } {
  if (!Number.isFinite(tauLC) || tauLC <= 0 || !Number.isFinite(dt) || dt <= 0) {
    return { kernel: new Float64Array([1]), radius: 0 };
  }
  const halfSamples = Math.max(1, Math.round((tauLC / dt) * 0.5));
  const radius = Math.max(1, halfSamples);
  const length = radius * 2 + 1;
  const kernel = new Float64Array(length);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = hann(i / radius);
    kernel[i + radius] = w;
    sum += w;
  }
  if (sum > 0) {
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum;
    }
  }
  return { kernel, radius };
}

// Light-crossing average using a compact Hann window; O(N * window) per series.
export function lightCrossingAverage(
  series: Float64Array,
  times: number[],
  tauLC: number,
): Float64Array {
  const n = series.length;
  if (n === 0 || times.length !== n) return series.slice() as Float64Array;
  const dtEstimate = (() => {
    let acc = 0;
    let count = 0;
    for (let i = 1; i < times.length; i++) {
      const dt = times[i] - times[i - 1];
      if (Number.isFinite(dt) && dt > 0) {
        acc += dt;
        count += 1;
      }
    }
    return count > 0 ? acc / count : 0;
  })();
  if (!Number.isFinite(dtEstimate) || dtEstimate <= 0) return series.slice() as Float64Array;
  const { kernel, radius } = buildKernel(tauLC, dtEstimate);
  if (radius === 0) return series.slice() as Float64Array;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= n) continue;
      const w = kernel[k + radius];
      const v = series[idx];
      if (!Number.isFinite(v)) continue;
      acc += w * v;
    }
    out[i] = acc;
  }
  return out;
}

export type NormalizedSeries = {
  values: Float64Array;
  min: number;
  max: number;
};

export function normalizeSeries(values: Float64Array, useLog = false): NormalizedSeries {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = Number.NaN;
      continue;
    }
    const mapped = useLog ? safeLog10(v) : v;
    out[i] = mapped;
    if (Number.isFinite(mapped)) {
      min = Math.min(min, mapped);
      max = Math.max(max, mapped);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = 0;
    max = 1;
  }
  const span = max - min || 1;
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    out[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - min) / span)) : 0;
  }
  return { values: out, min, max };
}

export function safeLog10(value: number): number {
  const clipped = Math.max(value, 1e-24);
  return Math.log10(clipped);
}
