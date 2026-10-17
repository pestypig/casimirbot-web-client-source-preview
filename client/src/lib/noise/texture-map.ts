type PeakInput = { f: number; q: number; gain: number };
type PlanEqPeak = { freq: number; q: number; gainDb: number };
type PlanFxOverrides = {
  chorus?: number;
  sat?: number;
  reverbSend?: number;
  comp?: number;
};

export type Peak = Readonly<{
  f: number;
  q: number;
  /**
   * Gain in dB. Normalized 0..2 inputs map to -12..+12 dB.
   */
  gain: number;
}>;

export type TextureFingerprint = Readonly<{
  eq: PeakInput[];
  ir: string;
  chorus: { rate: number; depth: number };
  sat: { drive: number };
}>;

export type TextureRecipe = Readonly<{
  eqPeaks: Peak[];
  irName: string;
  chorus: { rate: number; depth: number };
  sat: { drive: number };
  reverbSend?: number;
  comp?: number;
}>;

export interface TextureBlendOptions {
  sampleInfluence: number;
  styleInfluence: number;
  weirdness: number;
  seed: number;
  eqPeaks?: PlanEqPeak[];
  fx?: PlanFxOverrides;
}

const MAX_PEAKS = 12;
const FREQ_TOLERANCE_HZ = 80;
const MIN_FREQ_HZ = 20;
const MAX_FREQ_HZ = 20_000;
const MIN_Q = 0.1;
const MAX_Q = 50;
const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = 12;

const DEFAULT_EQ: Peak[] = [
  { f: 180, q: 0.7, gain: 1.5 },
  { f: 1000, q: 1.1, gain: 0.8 },
  { f: 6000, q: 1.3, gain: 1.2 },
];

const DEFAULT_IRS = ["plate_small.wav", "hall_small.wav", "room_short.wav"] as const;
const DEFAULT_CHORUS = { rate: 0.32, depth: 0.0018 };
const DEFAULT_SAT = { drive: 0.18 };

export type Xoroshiro128State = {
  next(): number;
  nextRange(min: number, max: number): number;
};

export function textureFrom(
  helix: PeakInput[] | undefined,
  kbTexture: TextureFingerprint | undefined,
  opts: TextureBlendOptions,
): TextureRecipe {
  const helixPeaks = sanitizePeaks(helix);
  const kbPeaks = sanitizePeaks(kbTexture?.eq);
  const weights = resolveWeights(opts.sampleInfluence, opts.styleInfluence);
  const rng = createDeterministicRng(opts.seed);
  const weird = clamp01(opts.weirdness);
  const eqOverrides = sanitizePeaks(eqOverridesToPeakInputs(opts.eqPeaks));

  const eqPeaks = eqOverrides.length
    ? applyWeirdnessToPeaks(eqOverrides, weird, rng)
    : blendPeaksInternal(helixPeaks, kbPeaks, weights, weird, rng);
  const irName = resolveImpulse(kbTexture?.ir, rng);
  const chorusBase = resolveChorus(kbTexture?.chorus, weird, rng);
  const satBase = resolveSaturation(kbTexture?.sat, weird, rng);
  const fxChorus = resolveFxScalar(opts.fx?.chorus);
  const fxSat = resolveFxScalar(opts.fx?.sat);
  const chorus = applyChorusOverride(chorusBase, fxChorus);
  const sat = applySaturationOverride(satBase, fxSat);
  const reverbSend = resolveFxScalar(opts.fx?.reverbSend);
  const comp = resolveFxScalar(opts.fx?.comp);

  return {
    eqPeaks,
    irName,
    chorus,
    sat,
    reverbSend,
    comp,
  };
}

export function blendPeaks(
  helix: PeakInput[] | undefined,
  kb: PeakInput[] | undefined,
  sampleInfluence: number,
  styleInfluence: number,
): Peak[] {
  const weights = resolveWeights(sampleInfluence, styleInfluence);
  return blendPeaksInternal(
    sanitizePeaks(helix),
    sanitizePeaks(kb),
    weights,
    0,
    createDeterministicRng(0),
  );
}

function blendPeaksInternal(
  helix: Peak[],
  kb: Peak[],
  weights: { helixWeight: number; kbWeight: number },
  weirdness: number,
  rng: Xoroshiro128State,
): Peak[] {
  if (!helix.length && !kb.length) {
    return DEFAULT_EQ;
  }

  const [primary, secondary] =
    helix.length >= kb.length
      ? [helix, kb]
      : [kb, helix];

  const merged: Peak[] = [];

  for (const candidate of primary) {
    const counterpart = findClosestPeak(candidate, secondary);
    merged.push(
      mergeTwoPeaks(candidate, counterpart, weights, weirdness, rng),
    );
  }

  if (secondary.length > primary.length) {
    for (const peak of secondary) {
      if (!merged.some((existing) => Math.abs(existing.f - peak.f) <= FREQ_TOLERANCE_HZ)) {
        merged.push(mergeTwoPeaks(peak, undefined, weights, weirdness, rng));
      }
    }
  }

  const limited = merged
    .map((peak, index) => addMicroVariations(peak, weirdness, index, rng))
    .sort((a, b) => a.f - b.f)
    .slice(0, MAX_PEAKS);

  return limited;
}

function applyWeirdnessToPeaks(
  peaks: Peak[],
  weirdness: number,
  rng: Xoroshiro128State,
): Peak[] {
  if (!peaks.length || weirdness <= 0) return peaks;
  return peaks
    .map((peak, index) => addMicroVariations(peak, weirdness, index, rng))
    .sort((a, b) => a.f - b.f)
    .slice(0, MAX_PEAKS);
}

function mergeTwoPeaks(
  a: Peak,
  b: Peak | undefined,
  weights: { helixWeight: number; kbWeight: number },
  weirdness: number,
  rng: Xoroshiro128State,
): Peak {
  const helixWeight = weights.helixWeight;
  const kbWeight = weights.kbWeight;
  const totalWeight = helixWeight + kbWeight || 1;

  const freq = clamp(
    (a.f * helixWeight + (b?.f ?? a.f) * kbWeight) / totalWeight,
    MIN_FREQ_HZ,
    MAX_FREQ_HZ,
  );

  const qBlend = clamp(
    (a.q * helixWeight + (b?.q ?? a.q) * kbWeight) / totalWeight,
    MIN_Q,
    MAX_Q,
  );

  const gainDb = clamp(
    (a.gain * helixWeight + (b?.gain ?? a.gain) * kbWeight) / totalWeight,
    MIN_GAIN_DB,
    MAX_GAIN_DB,
  );

  const weirdBoost = weirdness > 0 ? (rng.next() - 0.5) * weirdness * 2 : 0;

  return Object.freeze({
    f: freq,
    q: qBlend * (1 + weirdBoost * 0.08),
    gain: clamp(gainDb + weirdBoost, MIN_GAIN_DB, MAX_GAIN_DB),
  });
}

function addMicroVariations(peak: Peak, weirdness: number, order: number, rng: Xoroshiro128State): Peak {
  if (weirdness <= 0) return peak;

  const bend = (rng.next() - 0.5) * weirdness;
  const freqJitter = (rng.next() - 0.5) * weirdness * 35;
  const gainJitter = (rng.next() - 0.5) * weirdness * 0.6;

  return Object.freeze({
    f: clamp(peak.f + freqJitter + order * bend, MIN_FREQ_HZ, MAX_FREQ_HZ),
    q: clamp(peak.q * (1 + bend * 0.04), MIN_Q, MAX_Q),
    gain: clamp(peak.gain + gainJitter, MIN_GAIN_DB, MAX_GAIN_DB),
  });
}

function resolveImpulse(ir: string | undefined, rng: Xoroshiro128State): string {
  if (ir) return ir;
  const index = Math.floor(rng.nextRange(0, DEFAULT_IRS.length));
  return DEFAULT_IRS[index] ?? DEFAULT_IRS[0];
}

function resolveChorus(
  input: { rate: number; depth: number } | undefined,
  weirdness: number,
  rng: Xoroshiro128State,
) {
  const base = input ?? DEFAULT_CHORUS;
  const weird = clamp01(weirdness);
  const jitter = (rng.next() - 0.5) * 0.1 * weird;
  return {
    rate: clamp(base.rate * (1 + 0.35 * weird) + jitter * 0.5, 0.05, 2.5),
    depth: clamp(base.depth * (1 + 0.75 * weird) + jitter * 0.002, 0.0005, 0.02),
  };
}

function applyChorusOverride(
  base: { rate: number; depth: number },
  intensity: number | undefined,
) {
  if (intensity == null) return base;
  const scaledRate = clamp(base.rate * (0.6 + intensity * 0.8), 0.05, 2.5);
  const scaledDepth = clamp(base.depth * (0.25 + intensity * 1.6), 0.0005, 0.02);
  return { rate: scaledRate, depth: scaledDepth };
}

function resolveSaturation(
  input: { drive: number } | undefined,
  weirdness: number,
  rng: Xoroshiro128State,
) {
  const base = input?.drive ?? DEFAULT_SAT.drive;
  const weird = clamp01(weirdness);
  const jitter = (rng.next() - 0.5) * 0.12 * (1 + weird * 0.5);
  return {
    drive: clamp(base + 0.25 * weird + jitter, 0.05, 1.4),
  };
}

function applySaturationOverride(
  base: { drive: number },
  intensity: number | undefined,
) {
  if (intensity == null) return base;
  const scaledDrive = clamp(base.drive * (0.35 + intensity * 1.6), 0.05, 1.4);
  return { drive: scaledDrive };
}

function findClosestPeak(target: Peak, candidates: Peak[]): Peak | undefined {
  let closest: Peak | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const peak of candidates) {
    const dist = Math.abs(peak.f - target.f);
    if (dist < bestDist && dist <= FREQ_TOLERANCE_HZ) {
      closest = peak;
      bestDist = dist;
    }
  }
  return closest;
}

function resolveWeights(sampleInfluence: number, styleInfluence: number) {
  const helixWeight = clamp01(1 - styleInfluence) * clamp01(sampleInfluence);
  const kbWeight = clamp01(styleInfluence);

  if (helixWeight + kbWeight === 0) {
    return { helixWeight: 1, kbWeight: 0 };
  }

  return { helixWeight, kbWeight };
}

function eqOverridesToPeakInputs(peaks: PlanEqPeak[] | undefined) {
  if (!peaks?.length) return undefined;
  const inputs: PeakInput[] = [];
  for (const peak of peaks) {
    const freq = Number(peak?.freq);
    const q = Number(peak?.q);
    const gainDb = Number(peak?.gainDb);
    if (!Number.isFinite(freq) || !Number.isFinite(q) || !Number.isFinite(gainDb)) {
      continue;
    }
    inputs.push({ f: freq, q, gain: dbToNormalizedGain(gainDb) });
  }
  return inputs.length ? inputs : undefined;
}

function sanitizePeaks(peaks: PeakInput[] | undefined): Peak[] {
  if (!peaks?.length) return [];
  const dedup: Peak[] = [];

  for (const peak of peaks) {
    const clean = sanitizePeak(peak);
    if (!clean) continue;

    const existingIndex = dedup.findIndex((p) => Math.abs(p.f - clean.f) <= FREQ_TOLERANCE_HZ);
    if (existingIndex >= 0) {
      const current = dedup[existingIndex];
      dedup[existingIndex] = Object.freeze({
        f: (current.f + clean.f) / 2,
        q: (current.q + clean.q) / 2,
        gain: clamp((current.gain + clean.gain) / 2, MIN_GAIN_DB, MAX_GAIN_DB),
      });
    } else {
      dedup.push(clean);
    }
  }

  return dedup.sort((a, b) => a.f - b.f).slice(0, MAX_PEAKS);
}

function sanitizePeak(peak: PeakInput): Peak | null {
  const f = Number.isFinite(peak.f) ? clamp(peak.f, MIN_FREQ_HZ, MAX_FREQ_HZ) : null;
  const q = Number.isFinite(peak.q) ? clamp(peak.q, MIN_Q, MAX_Q) : null;
  const gain = Number.isFinite(peak.gain)
    ? clamp(normalizedGainToDb(peak.gain), MIN_GAIN_DB, MAX_GAIN_DB)
    : null;
  if (f == null || q == null || gain == null) return null;
  return Object.freeze({ f, q, gain });
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function normalizedGainToDb(normalized: number): number {
  return clamp((normalized - 1) * 12, MIN_GAIN_DB, MAX_GAIN_DB);
}

function dbToNormalizedGain(db: number): number {
  return clamp(db / 12 + 1, 0, 2);
}

function resolveFxScalar(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : undefined;
}

export function createDeterministicRng(seed: number): Xoroshiro128State {
  const MASK64 = BigInt("0xFFFFFFFFFFFFFFFF");
  let { state0, state1 } = splitmixSeed(seed);

  const rotl = (x: bigint, k: number) =>
    ((x << BigInt(k)) | (x >> BigInt(64 - k))) & MASK64;

  const nextUint64 = () => {
    const s0 = state0;
    let s1 = state1;
    const result = (s0 + s1) & MASK64;
    s1 ^= s0;
    state0 = rotl(s0, 55) ^ s1 ^ ((s1 << BigInt(14)) & MASK64);
    state1 = rotl(s1, 36);
    return result;
  };

  return {
    next() {
      const value = Number(nextUint64() >> BigInt(11));
      return value / 2 ** 53;
    },
    nextRange(min: number, max: number) {
      if (min >= max) return min;
      return min + this.next() * (max - min);
    },
  };
}

function splitmixSeed(seed: number) {
  const MASK64 = BigInt("0xFFFFFFFFFFFFFFFF");
  const increment = BigInt("0x9E3779B97F4A7C15");

  let x = (BigInt(seed) ^ increment) & MASK64;
  const next = () => {
    x = (x + increment) & MASK64;
    let z = x;
    z = (z ^ (z >> BigInt(30))) * BigInt("0xBF58476D1CE4E5B9") & MASK64;
    z = (z ^ (z >> BigInt(27))) * BigInt("0x94D049BB133111EB") & MASK64;
    return z ^ (z >> BigInt(31));
  };

  return { state0: next(), state1: next() };
}
