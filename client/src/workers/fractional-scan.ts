// client/src/workers/fractional-scan.ts
// Lightweight DSP worker that evaluates fractional harmonic coherence using Goertzel kernels.

export type FractionalSidebands = {
  plus: number;
  minus: number;
  symmetry: number;
};

export type FractionalLine = {
  ratio: number;
  fHz: number;
  A: number;
  P: number;
  phase: number;
  snr: number;
  sidebands?: FractionalSidebands;
};

export type FractionalGridSpec = {
  numeratorMax: number;
  denominatorMax: number;
  minRatio?: number;
  maxRatio?: number;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  segmentCount?: number;
};

export type FractionalGridCell = {
  p: number;
  q: number;
  ratio: number;
  fHz: number;
  coherence: number;
  coherenceEff: number;
  stability: number;
  sigma: number;
  phase: number;
  amplitude: number;
  snr: number;
};

export type FractionalGridPayload = {
  cells: FractionalGridCell[];
  rows: number;
  cols: number;
  numeratorMax: number;
  denominatorMax: number;
  f0: number;
  fs: number;
  timestamp: number;
};

export type FractionalScanConfig = {
  fs: number;
  f0: number;
  windowMs: number;
  hopMs: number;
  ratios: number[];
  sidebandDeltaHz: number;
  grid?: FractionalGridSpec | null;
};

type WorkerMessage =
  | { type: "init"; config: FractionalScanConfig }
  | { type: "push"; samples: Float32Array }
  | { type: "flush" };

type WorkerResponse = {
  CP: number;
  IFC: number;
  SS: number;
  lines: FractionalLine[];
  grid?: FractionalGridPayload | null;
};

const ctx: any = self as any;

let config: FractionalScanConfig | null = null;
let ring = new Float32Array(0);
let writeIndex = 0;
let buffered = 0;
let windowSize = 0;
let hopSize = 0;
let samplesSinceFrame = 0;

function ensureRing(capacity: number) {
  if (ring.length >= capacity) return;
  ring = new Float32Array(capacity);
  writeIndex = 0;
  buffered = 0;
}

function hannWindow(samples: Float32Array) {
  const { length } = samples;
  if (length <= 1) return;
  for (let i = 0; i < length; i++) {
    samples[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
}

function goertzel(samples: Float32Array, fs: number, f: number) {
  const omega = (2 * Math.PI * f) / fs;
  const coeff = 2 * Math.cos(omega);
  const sin = Math.sin(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const cos = Math.cos(omega);
  const real = s1 - s2 * cos;
  const imag = s2 * sin;
  const power = real * real + imag * imag;
  const amplitude = Math.sqrt(power) / (samples.length / 2);
  const phase = Math.atan2(imag, real);
  return { A: amplitude, P: power, phase, real, imag };
}

function noiseFloor(samples: Float32Array) {
  const stride = Math.max(1, Math.floor(samples.length / 64));
  let accum = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += stride) {
    accum += Math.abs(samples[i]);
    count++;
  }
  return count > 0 ? (0.8 * accum) / count + 1e-12 : 1e-12;
}

function normalizeAngle(angle: number) {
  let value = angle;
  while (value <= -Math.PI) value += 2 * Math.PI;
  while (value > Math.PI) value -= 2 * Math.PI;
  return value;
}

function clampSegmentCount(windowSize: number, requested: number) {
  const maxSegmentsFromWindow = Math.max(3, Math.floor(windowSize / 128));
  const bounded = Math.min(Math.max(3, requested), maxSegmentsFromWindow);
  return bounded;
}

type GoertzelResult = ReturnType<typeof goertzel>;

type CoherenceStats = {
  R: number;
  R_eff: number;
  sigma: number;
  sigmaNorm: number;
  meanPhase: number;
};

function computeCoherenceStats(
  samples: Float32Array,
  fs: number,
  f: number,
  segments: number,
  kernel: GoertzelResult,
  noise: number,
): CoherenceStats {
  const safeNoise = Math.max(noise, 1e-12);
  const maxSegments = clampSegmentCount(samples.length, segments);
  const segmentSize = Math.floor(samples.length / maxSegments);
  if (segmentSize < 24 || maxSegments < 3) {
    const snr = kernel.A / safeNoise;
    const fallback = Math.max(0, Math.min(1, snr / (snr + 1)));
    return {
      R: fallback,
      R_eff: fallback * 0.5,
      sigma: Math.PI / 2,
      sigmaNorm: 0.5,
      meanPhase: kernel.phase,
    };
  }

  let sumRe = 0;
  let sumIm = 0;
  let count = 0;
  let phases: number[] = [];

  for (let idx = 0; idx < maxSegments; idx++) {
    const start = idx * segmentSize;
    const end = idx === maxSegments - 1 ? samples.length : start + segmentSize;
    if (end - start < 16) continue;
    const segmentView = samples.subarray(start, end);
    const segmentKernel = goertzel(segmentView, fs, f);
    phases.push(segmentKernel.phase);
    sumRe += Math.cos(segmentKernel.phase);
    sumIm += Math.sin(segmentKernel.phase);
    count++;
  }

  if (count === 0) {
    const snr = kernel.A / safeNoise;
    const fallback = Math.max(0, Math.min(1, snr / (snr + 1)));
    return {
      R: fallback,
      R_eff: fallback * 0.5,
      sigma: Math.PI / 2,
      sigmaNorm: 0.5,
      meanPhase: kernel.phase,
    };
  }

  const R = Math.sqrt(sumRe * sumRe + sumIm * sumIm) / count;
  const meanPhase = Math.atan2(sumIm, sumRe);
  let variance = 0;
  if (count > 1) {
    for (const phase of phases) {
      const delta = normalizeAngle(phase - meanPhase);
      variance += delta * delta;
    }
  }
  const sigma = count > 1 ? Math.sqrt(variance / (count - 1)) : 0;
  const sigmaNorm = Math.max(0, Math.min(1, sigma / Math.PI));
  const R_eff = R * (1 - sigmaNorm);
  return { R, R_eff, sigma, sigmaNorm, meanPhase };
}

function buildFractionalGrid(
  samples: Float32Array,
  fs: number,
  f0: number,
  noise: number,
  spec: FractionalGridSpec,
): FractionalGridPayload | null {
  if (!Number.isFinite(f0) || f0 <= 0) return null;
  const numeratorMax = Math.max(1, Math.floor(spec.numeratorMax));
  const denominatorMax = Math.max(1, Math.floor(spec.denominatorMax));
  if (!Number.isFinite(numeratorMax) || !Number.isFinite(denominatorMax)) return null;

  const minRatio = spec.minRatio && spec.minRatio > 0 ? spec.minRatio : 0;
  const maxRatio = spec.maxRatio && spec.maxRatio > 0 ? spec.maxRatio : Number.POSITIVE_INFINITY;
  const maxFrequency =
    spec.maxFrequencyHz && Number.isFinite(spec.maxFrequencyHz)
      ? Math.min(spec.maxFrequencyHz, fs * 0.49)
      : fs * 0.49;
  const minFrequency =
    spec.minFrequencyHz && Number.isFinite(spec.minFrequencyHz) && spec.minFrequencyHz > 0
      ? spec.minFrequencyHz
      : 0;
  const segmentCount = spec.segmentCount && spec.segmentCount > 0 ? spec.segmentCount : 6;
  const safeNoise = Math.max(noise, 1e-12);

  const cells: FractionalGridCell[] = [];
  for (let p = 1; p <= numeratorMax; p++) {
    for (let q = 1; q <= denominatorMax; q++) {
      const ratio = p / q;
      const fHz = ratio * f0;
      const ratioInBand = ratio >= minRatio && ratio <= maxRatio;
      const freqInBand =
        ratioInBand && Number.isFinite(fHz) && fHz >= minFrequency && fHz <= maxFrequency && fHz < fs * 0.495;

      if (!freqInBand) {
        cells.push({
          p,
          q,
          ratio,
          fHz,
          coherence: 0,
          coherenceEff: 0,
          stability: 0,
          sigma: Math.PI,
          phase: 0,
          amplitude: 0,
          snr: 0,
        });
        continue;
      }

      const kernel = goertzel(samples, fs, fHz);
      const stats = computeCoherenceStats(samples, fs, fHz, segmentCount, kernel, safeNoise);
      const snr = kernel.A / safeNoise;
      cells.push({
        p,
        q,
        ratio,
        fHz,
        coherence: Math.max(0, Math.min(1, stats.R)),
        coherenceEff: Math.max(0, Math.min(1, stats.R_eff)),
        stability: Math.max(0, Math.min(1, 1 - stats.sigmaNorm)),
        sigma: stats.sigma,
        phase: stats.meanPhase,
        amplitude: kernel.A,
        snr,
      });
    }
  }

  const timestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    cells,
    rows: numeratorMax,
    cols: denominatorMax,
    numeratorMax,
    denominatorMax,
    f0,
    fs,
    timestamp,
  };
}

function snapshotWindow(): Float32Array | null {
  if (!config || buffered < windowSize || samplesSinceFrame < hopSize) {
    return null;
  }
  const out = new Float32Array(windowSize);
  let readIndex = writeIndex - windowSize;
  if (readIndex < 0) readIndex += ring.length;
  for (let i = 0; i < windowSize; i++) {
    out[i] = ring[readIndex++];
    if (readIndex >= ring.length) readIndex = 0;
  }
  samplesSinceFrame = 0;
  hannWindow(out);
  return out;
}

function pushSamples(samples: Float32Array) {
  if (!config) return;
  const requiredCapacity = Math.max(
    ring.length,
    4 * Math.ceil((config.fs * config.windowMs) / 1000)
  );
  ensureRing(requiredCapacity);

  for (let i = 0; i < samples.length; i++) {
    ring[writeIndex++] = samples[i];
    if (writeIndex >= ring.length) writeIndex = 0;
  }
  buffered = Math.min(ring.length, buffered + samples.length);
  samplesSinceFrame += samples.length;
}

function analyse(samples: Float32Array) {
  if (!config) return;
  const { fs, f0, ratios, sidebandDeltaHz, grid } = config;
  const floor = noiseFloor(samples);

  let integerPower = 0;
  for (let h = 1; h <= 4; h++) {
    integerPower += goertzel(samples, fs, h * f0).P;
  }

  const lines: FractionalLine[] = [];
  let fracPowerSum = 0;
  let qualitySum = 0;
  let sbSymmetrySum = 0;
  let sbSymmetryCount = 0;
  let phaseStability = 0;

  for (const ratio of ratios) {
    const f = ratio * f0;
    const core = goertzel(samples, fs, f);
    const snr = core.A / floor;

    const sidebands = {
      plus: goertzel(samples, fs, f + sidebandDeltaHz).P,
      minus: goertzel(samples, fs, f - sidebandDeltaHz).P,
    };
    const sbMax = Math.max(sidebands.plus, sidebands.minus) + 1e-15;
    const sbMin = Math.min(sidebands.plus, sidebands.minus) + 1e-15;
    const symmetry = sbMin / sbMax;

    lines.push({
      ratio,
      fHz: f,
      A: core.A,
      P: core.P,
      phase: core.phase,
      snr,
      sidebands: { ...sidebands, symmetry },
    });

    fracPowerSum += core.P;
    sbSymmetrySum += symmetry;
    sbSymmetryCount++;

    const sharpness = symmetry;
    const quality = (core.A / (1 + (1 - sharpness))) * Math.max(0, Math.log1p(Math.max(0, snr)));
    qualitySum += quality;
    phaseStability += Math.abs(core.phase) < 0.2 ? 1 : Math.exp(-Math.abs(core.phase));
  }

  const IFC = (integerPower + 1e-18) / (fracPowerSum + 1e-18);
  const SS = sbSymmetryCount > 0 ? sbSymmetrySum / sbSymmetryCount : 0;
  const CP = qualitySum * Math.exp(0.1 * phaseStability / Math.max(1, ratios.length));

  const gridPayload = grid ? buildFractionalGrid(samples, fs, f0, floor, grid) : null;
  const payload: WorkerResponse = { CP, IFC, SS, lines, grid: gridPayload };
  ctx.postMessage(payload);
}

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message) return;

  if (message.type === "init") {
    config = message.config;
    if (!config || !Number.isFinite(config.fs) || config.fs <= 0) {
      config = null;
      return;
    }
    windowSize = Math.max(
      256,
      1 << Math.ceil(Math.log2((config.fs * config.windowMs) / 1000))
    );
    hopSize = Math.max(128, Math.floor((config.fs * config.hopMs) / 1000));
    ensureRing(4 * windowSize);
    writeIndex = 0;
    buffered = 0;
    samplesSinceFrame = 0;
    return;
  }

  if (!config) return;

  if (message.type === "push") {
    pushSamples(message.samples);
    const window = snapshotWindow();
    if (window) analyse(window);
    return;
  }

  if (message.type === "flush") {
    const window = snapshotWindow();
    if (window) analyse(window);
  }
};
