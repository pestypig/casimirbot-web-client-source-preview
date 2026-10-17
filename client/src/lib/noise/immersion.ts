/* Immersion/Resolution metrics for 4-bar windows within 8-bar loops.
   Captures: on-grid timing, AM (swell) coherence, harmonic alignment (peak agreement),
   cross-part coherence, texture density, space/dynamics, and the 4/8-bar resolve theory.
   No external deps; deterministic; browser & worker safe. */

export type TempoMeta = { bpm: number; timeSig: `${number}/${number}`; offsetMs: number };
export type ImmersionScores = {
  timing: number;
  am: number;
  harm: number;
  cross: number;
  texture: number;
  spaceDyn: number;
  idi: number;
  confidence: number;
  resolve4_low: number;
  resolve4_high: number;
  resolve8_low: number;
  resolve8_high: number;
  bassline_diversity: number;
  melody_division_rate: number;
  dyadness: number;
  chordness: number;
};

type Stems = { instrumental?: Float32Array; vocal?: Float32Array };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Beat period (samples) from BPM/timeSig (accounts for denominator). */
function samplesPerBeat(sr: number, bpm: number, timeSig: `${number}/${number}`) {
  const [, denRaw] = timeSig.split('/').map(Number);
  const den = Number.isFinite(denRaw) && denRaw > 0 ? denRaw : 4;
  return (60 / bpm) * sr * (4 / den);
}

/** Moving RMS envelope (rectified EMA), deterministic and cheap. */
function envelopeRMS(x: Float32Array, sr: number, winMs = 25) {
  const n = x.length;
  const y = new Float32Array(n);
  const winSamples = Math.max(1, Math.round((winMs / 1000) * sr));
  const a = Math.exp(-1 / winSamples);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    s = a * s + (1 - a) * v * v;
    y[i] = Math.sqrt(s + 1e-12);
  }
  return y;
}

/** Onset indicator (spectral-flux-like from envelope derivative). */
function onsetCurve(env: Float32Array) {
  const n = env.length;
  const y = new Float32Array(n);
  for (let i = 1; i < n; i++) y[i] = Math.max(0, env[i] - env[i - 1]);
  return y;
}

/** Pick onset times (ms) by simple peak picking with refractory window. */
function pickOnsets(envDiff: Float32Array, sr: number, minGapMs = 80, thresh = 0.002) {
  const gap = Math.max(1, Math.round((minGapMs / 1000) * sr));
  const peaks: number[] = [];
  let last = -gap;
  for (let i = 1; i < envDiff.length - 1; i++) {
    if (envDiff[i] > thresh && envDiff[i] >= envDiff[i - 1] && envDiff[i] >= envDiff[i + 1]) {
      if (i - last >= gap) {
        peaks.push(i);
        last = i;
      }
    }
  }
  return peaks.map((i) => (i / sr) * 1000);
}

/** Circular concentration of onset phases on the beat grid. */
function circularConcentration(beatMs: number, onsetMs: number[]) {
  if (!onsetMs.length || beatMs <= 0) return 0;
  let re = 0;
  let im = 0;
  for (const t of onsetMs) {
    const phi = (t % beatMs) / beatMs;
    const ang = 2 * Math.PI * phi;
    re += Math.cos(ang);
    im += Math.sin(ang);
  }
  const R = Math.sqrt(re * re + im * im) / onsetMs.length;
  return clamp01(R);
}

/** Energy ratio within +/- delta around beat times (on-grid energy). */
function onGridEnergyRatio(env: Float32Array, sr: number, beatMs: number, offsetMs: number, deltaMs = 40) {
  if (beatMs <= 0) return 0;
  const beatS = beatMs / 1000;
  const offS = offsetMs / 1000;
  const dS = deltaMs / 1000;
  const n = env.length;
  let on = 0;
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const phase = ((t - offS) % beatS + beatS) % beatS;
    const v = env[i];
    tot += v;
    if (phase <= dS || phase >= beatS - dS) on += v;
  }
  return clamp01(on / Math.max(tot, 1e-9));
}

/** AM (swell) coherence via envelope autocorrelation at grid-related lags. */
function amCoherence(env: Float32Array, sr: number, bpm: number) {
  const beat = (60 / bpm) * sr;
  const lags = [beat / 2, beat, 2 * beat, 4 * beat].map((x) => Math.round(x));
  const N = env.length;
  const mu = env.reduce((a, b) => a + b, 0) / (N || 1);
  const varE = env.reduce((a, b) => a + (b - mu) * (b - mu), 0) + 1e-9;
  let gridAC = 0;
  for (const L of lags) {
    if (L <= 1 || L >= N) continue;
    let num = 0;
    for (let i = 0; i < N - L; i++) num += (env[i] - mu) * (env[i + L] - mu);
    gridAC = Math.max(gridAC, num / varE);
  }
  const bars = [1, 2, 4];
  let swell = 0;
  for (const m of bars) {
    const period = Math.round((60 / bpm) * sr * 4 * m);
    if (period < 4 || period > N) continue;
    const ramp = new Float32Array(N);
    for (let i = 0; i < N; i++) ramp[i] = i / Math.max(N - 1, 1);
    const muR = 0.5;
    const varR = N * (1 / 12);
    let num = 0;
    for (let i = 0; i < N; i++) num += (env[i] - mu) * (ramp[i] - muR);
    swell = Math.max(swell, clamp01(num / Math.sqrt(varE * varR)));
  }
  return { amGrid: clamp01(gridAC), swell };
}

/** Very cheap low/high band split via single-pole IIRs. */
function lowHighEnvelopes(x: Float32Array, sr: number) {
  const low = new Float32Array(x.length);
  const high = new Float32Array(x.length);
  const fc = 250 / sr;
  const a = Math.exp(-2 * Math.PI * fc);
  let l = 0;
  for (let i = 0; i < x.length; i++) {
    l = a * l + (1 - a) * x[i];
    low[i] = l;
    high[i] = x[i] - l;
  }
  return { low: envelopeRMS(low, sr, 25), high: envelopeRMS(high, sr, 25) };
}

/** Resolve metrics: correlation start↔end over 4- and 8-bar spans (low/high). */
function resolveCorrelation(env: Float32Array, sr: number, bars: number, bpm: number, timeSig: `${number}/${number}`) {
  const spBeat = samplesPerBeat(sr, bpm, timeSig);
  const beatsPerBar = Number(timeSig.split('/')[0]);
  const spBar = Math.round(spBeat * beatsPerBar);
  const span = bars * spBar;
  if (env.length < span || spBar <= 0) return 0;
  const seg = env.subarray(0, span);
  const w = Math.min(Math.round(0.5 * spBar), seg.length >> 2);
  if (w <= 0) return 0;
  const start = seg.subarray(0, w);
  const end = seg.subarray(seg.length - w);
  const muA = start.reduce((a, v) => a + v, 0) / w;
  const muB = end.reduce((a, v) => a + v, 0) / w;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < w; i++) {
    const da = start[i] - muA;
    const db = end[i] - muB;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  return clamp01(num / Math.sqrt((va + 1e-9) * (vb + 1e-9)));
}

/** Bassline diversity: onset density in the low band, normalized per beat. */
function basslineDiversity(lowEnv: Float32Array, sr: number, bpm: number, timeSig: `${number}/${number}`) {
  const on = pickOnsets(onsetCurve(lowEnv), sr, 120, 0.001);
  const beats = (lowEnv.length / sr) / (60 / bpm) * (Number(timeSig.split('/')[1]) / 4);
  const perBeat = on.length / Math.max(beats, 1e-9);
  return clamp01(perBeat / 1.5);
}

/** Melody division rate: onset density in high band, normalized per beat. */
function melodyDivisionRate(highEnv: Float32Array, sr: number, bpm: number, timeSig: `${number}/${number}`) {
  const on = pickOnsets(onsetCurve(highEnv), sr, 60, 0.001);
  const beats = (highEnv.length / sr) / (60 / bpm) * (Number(timeSig.split('/')[1]) / 4);
  const perBeat = on.length / Math.max(beats, 1e-9);
  return clamp01(perBeat / 4.0);
}

/** Dyadness/Chordness envelope-domain proxies. */
function dyadChordProxy(lowEnv: Float32Array, highEnv: Float32Array, sr: number, bpm: number, timeSig: `${number}/${number}`) {
  const spBeat = samplesPerBeat(sr, bpm, timeSig);
  const maxLag = Math.max(1, Math.round(spBeat / 4));
  let best = 0;
  for (let L = -maxLag; L <= maxLag; L += Math.max(1, Math.round(maxLag / 8))) {
    let num = 0;
    let va = 0;
    let vb = 0;
    for (let i = Math.max(0, -L); i < Math.min(lowEnv.length, highEnv.length - L); i++) {
      const a = lowEnv[i];
      const b = highEnv[i + L];
      num += a * b;
      va += a * a;
      vb += b * b;
    }
    best = Math.max(best, num / Math.sqrt((va + 1e-9) * (vb + 1e-9)));
  }
  const sum = new Float32Array(lowEnv.length);
  for (let i = 0; i < sum.length; i++) sum[i] = 0.5 * (lowEnv[i] + highEnv[i]);
  const beatsPerBar = Number(timeSig.split('/')[0]);
  const barLag = Math.round(spBeat * beatsPerBar);
  let ac = 0;
  let mu = 0;
  let vr = 0;
  for (let i = 0; i < sum.length; i++) mu += sum[i];
  mu /= sum.length || 1;
  for (let i = 0; i + barLag < sum.length; i++) {
    const a = sum[i] - mu;
    const b = sum[i + barLag] - mu;
    ac += a * b;
    vr += a * a;
  }
  const chordness = clamp01(ac / Math.sqrt((vr + 1e-9) * (vr + 1e-9)));
  return { dyadness: clamp01(best), chordness };
}

/** Texture density & space/dynamics proxies from envelope stats. */
function textureAndSpace(x: Float32Array, highEnv: Float32Array, sr: number) {
  const muHigh = highEnv.reduce((a, v) => a + v, 0) / (highEnv.length || 1);
  const varHigh = highEnv.reduce((a, v) => a + (v - muHigh) * (v - muHigh), 0) / (highEnv.length + 1e-9);
  const flatPen = clamp01(varHigh < 1e-5 ? 1 : 1 / (1 + varHigh * 2e3));
  const env = envelopeRMS(x, sr, 50);
  const mu = env.reduce((a, v) => a + v, 0) / (env.length || 1);
  const varEnv = env.reduce((a, v) => a + (v - mu) * (v - mu), 0) / (env.length + 1e-9);
  const dyn = clamp01(Math.tanh(varEnv * 80));
  const texture = clamp01(1 - flatPen);
  return { texture, spaceDyn: dyn };
}

/** Main entry: compute Immersion + theory metrics on a mono window or stem mix. */
export function computeImmersion(
  pcm: Float32Array,
  sr: number,
  tempo: TempoMeta,
  stems?: Stems,
  helixPeaks?: { f: number; q: number; gain: number }[]
): ImmersionScores {
  const env = envelopeRMS(pcm, sr, 25);
  const on = pickOnsets(onsetCurve(env), sr, 80, 0.002);
  const beatMs = (60 / tempo.bpm) * 1000 * (4 / Number(tempo.timeSig.split('/')[1]));

  const R = circularConcentration(beatMs, on);
  const OGER = onGridEnergyRatio(env, sr, beatMs, tempo.offsetMs, 40);
  const timing = clamp01(0.6 * R + 0.4 * OGER);

  const { amGrid, swell } = amCoherence(env, sr, tempo.bpm);
  const am = clamp01(0.6 * amGrid + 0.4 * swell);

  let harm = 0.5;
  if (helixPeaks && helixPeaks.length) {
    let sum = 0;
    let max = 0;
    for (const p of helixPeaks) {
      const w = 2 * Math.PI * (p.f / sr);
      let I = 0;
      let Q = 0;
      for (let n = 0; n < pcm.length; n++) {
        const v = pcm[n];
        I += v * Math.cos(w * n);
        Q += v * Math.sin(w * n);
      }
      const P = Math.sqrt(I * I + Q * Q);
      sum += P;
      max = Math.max(max, P);
    }
    const agree = max > 0 ? clamp01(sum / (helixPeaks.length * max)) : 0.5;
    harm = clamp01(0.4 + 0.6 * agree);
  }

  let cross = 0.5;
  if (stems?.instrumental && stems?.vocal) {
    const li = envelopeRMS(stems.instrumental, sr, 25);
    const lv = envelopeRMS(stems.vocal, sr, 25);
    const jointOnsets = pickOnsets(onsetCurve(li), sr, 80, 0.002)
      .concat(pickOnsets(onsetCurve(lv), sr, 80, 0.002))
      .sort((a, b) => a - b);
    const Rj = circularConcentration(beatMs, jointOnsets);
    cross = clamp01(0.5 + 0.5 * Rj);
  }

  const { low: lowEnv, high: highEnv } = lowHighEnvelopes(pcm, sr);
  const { texture, spaceDyn } = textureAndSpace(pcm, highEnv, sr);

  const resolve4_low = resolveCorrelation(lowEnv, sr, 4, tempo.bpm, tempo.timeSig);
  const resolve4_high = resolveCorrelation(highEnv, sr, 4, tempo.bpm, tempo.timeSig);
  const resolve8_low = resolveCorrelation(lowEnv, sr, 8, tempo.bpm, tempo.timeSig);
  const resolve8_high = resolveCorrelation(highEnv, sr, 8, tempo.bpm, tempo.timeSig);

  const bassDiv = basslineDiversity(lowEnv, sr, tempo.bpm, tempo.timeSig);
  const melDiv = melodyDivisionRate(highEnv, sr, tempo.bpm, tempo.timeSig);
  const { dyadness, chordness } = dyadChordProxy(lowEnv, highEnv, sr, tempo.bpm, tempo.timeSig);

  const w = { timing: 0.22, am: 0.18, harm: 0.22, cross: 0.12, texture: 0.16, spaceDyn: 0.1 };
  const idi = clamp01(
    w.timing * timing +
      w.am * am +
      w.harm * harm +
      w.cross * cross +
      w.texture * texture +
      w.spaceDyn * spaceDyn
  );

  const conf = clamp01(Math.min(on.length / 8, amGrid, 1 - (1 - texture)));
  return {
    timing,
    am,
    harm,
    cross,
    texture,
    spaceDyn,
    idi: conf < 0.3 ? idi * 0.5 : idi,
    confidence: conf,
    resolve4_low,
    resolve4_high,
    resolve8_low,
    resolve8_high,
    bassline_diversity: bassDiv,
    melody_division_rate: melDiv,
    dyadness,
    chordness,
  };
}
