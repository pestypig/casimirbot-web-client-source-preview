import { alphaFS, c, eCharge, kB, mH } from "./constants";

export function eta(E: number, Z1: number, Z2: number, mu: number) {
  if (E <= 0 || mu <= 0) return Number.POSITIVE_INFINITY;
  const v = Math.sqrt((2 * E) / mu);
  return (Z1 * Z2 * alphaFS * c) / v;
}

export function gamowKernel(E: number, T: number, mu: number, Z1 = 1, Z2 = 1) {
  if (!Number.isFinite(E) || E <= 0 || T <= 0) return 0;
  const mb = Math.sqrt(E) * Math.exp(-E / (kB * T));
  const barrier = Math.exp(-2 * Math.PI * eta(E, Z1, Z2, mu));
  return mb * barrier;
}

const JOULE_TO_KEV = 1 / (eCharge * 1e3);
const KEV_TO_JOULE = eCharge * 1e3;

export interface GamowWindowSample {
  energiesKeV: Float64Array;
  kernel: Float64Array;
  peakEnergyKeV: number;
  windowKeV: [number, number];
  relativeRate: number;
}

export interface GamowWindowOptions {
  samples?: number;
  eMaxFactor?: number;
  mu?: number;
  Z1?: number;
  Z2?: number;
}

export function sampleGamowWindow(T: number, opts: GamowWindowOptions = {}): GamowWindowSample {
  const samples = opts.samples ?? 320;
  const eMaxFactor = opts.eMaxFactor ?? 40;
  const mu = opts.mu ?? 0.5 * mH;
  const Z1 = opts.Z1 ?? 1;
  const Z2 = opts.Z2 ?? 1;

  const kT = kB * T;
  const eMax = kT * eMaxFactor;
  const energies = new Float64Array(samples);
  const kernelValues = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const frac = i / (samples - 1);
    const E = frac * eMax;
    energies[i] = E * JOULE_TO_KEV;
    kernelValues[i] = gamowKernel(E, T, mu, Z1, Z2);
  }

  let maxVal = 0;
  let peakIndex = 0;
  for (let i = 0; i < samples; i++) {
    if (kernelValues[i] > maxVal) {
      maxVal = kernelValues[i];
      peakIndex = i;
    }
  }

  let area = 0;
  for (let i = 1; i < samples; i++) {
    const Eprev = energies[i - 1] * KEV_TO_JOULE;
    const Ecurr = energies[i] * KEV_TO_JOULE;
    const fPrev = kernelValues[i - 1];
    const fCurr = kernelValues[i];
    area += 0.5 * (fPrev + fCurr) * (Ecurr - Eprev);
  }

  const threshold = maxVal * 0.1;
  let left = peakIndex;
  let right = peakIndex;
  while (left > 0 && kernelValues[left] > threshold) left -= 1;
  while (right < samples - 1 && kernelValues[right] > threshold) right += 1;

  return {
    energiesKeV: energies,
    kernel: kernelValues,
    peakEnergyKeV: energies[peakIndex],
    windowKeV: [energies[left], energies[right]],
    relativeRate: area,
  };
}

export const energyUnit = {
  jouleToKeV: (value: number) => value * JOULE_TO_KEV,
  keVToJoule: (value: number) => value * KEV_TO_JOULE,
};
