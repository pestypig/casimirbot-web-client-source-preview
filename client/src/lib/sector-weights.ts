// client/src/lib/sector-weights.ts
// Shared helpers for sector weight smoothing so 2D/3D overlays remain in lockstep.

/**
 * Apply a small Gaussian blur to a 1D ring of weights. The ends are clamped so
 * the total energy stays bounded and consistent with how the 3D renderer
 * prepares its sector lookup table.
 */
export function gaussianBlur1D(weights: number[], sigma = 1.2): number[] {
  if (sigma <= 0) {
    return weights.slice();
  }
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    kernel.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }
  const kernelSum = kernel.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }
  const out = new Array(weights.length).fill(0);
  for (let idx = 0; idx < weights.length; idx++) {
    let accum = 0;
    for (let j = -radius; j <= radius; j++) {
      const sampleIndex = Math.max(0, Math.min(weights.length - 1, idx + j));
      accum += weights[sampleIndex] * kernel[j + radius];
    }
    out[idx] = accum;
  }
  return out;
}

/**
 * Smooth a binary/live sector mask while preserving the total integral. This
 * mirrors the logic AlcubierrePanel uses before updating the Hull3D shared
 * store, so every consumer sees the same lobe shape.
 */
export function smoothSectorWeights(weights: number[], sigma = 1.25): number[] {
  const blurred = gaussianBlur1D(weights, sigma);
  const blurredSum = blurred.reduce((sum, value) => sum + value, 0) || 1;
  const originalSum = weights.reduce((sum, value) => sum + value, 0) || 1;
  return blurred.map((value) => (value * originalSum) / blurredSum);
}

/**
 * Construct a normalized Gaussian mask around an active sector index. The
 * returned weights wrap around the ring and integrate to the requested
 * `concurrent` energy so legacy consumers that expect a fixed number of hot
 * sectors keep the same area under the curve.
 */
export function gaussianSectorMask(
  totalSectors: number,
  centerIndex: number,
  concurrent = 1,
  sigma?: number,
  floor = 0,
): number[] {
  const total = Math.max(1, Math.floor(totalSectors || 0));
  const wrappedCenter = ((Math.floor(centerIndex) % total) + total) % total;
  const integral = Math.max(1e-6, concurrent);
  const effectiveSigma = Math.max(
    0.2,
    Number.isFinite(sigma) && (sigma as number) > 0 ? (sigma as number) : Math.max(0.45, concurrent * 0.45),
  );
  const clampedFloor = Math.max(0, Math.min(0.95, Number.isFinite(floor) ? (floor as number) : 0));
  const weights = new Array<number>(total);
  let sum = 0;
  for (let i = 0; i < total; i += 1) {
    let delta = (i - wrappedCenter) % total;
    if (delta < -total / 2) {
      delta += total;
    } else if (delta > total / 2) {
      delta -= total;
    }
    const gaussian = Math.exp(-0.5 * (delta / effectiveSigma) * (delta / effectiveSigma));
    const value = clampedFloor > 0 ? clampedFloor + (1 - clampedFloor) * gaussian : gaussian;
    weights[i] = value;
    sum += value;
  }
  if (sum <= 0) {
    weights.fill(integral / total);
    return weights;
  }
  const scale = integral / sum;
  for (let i = 0; i < total; i += 1) {
    weights[i] *= scale;
  }
  return weights;
}
