import type { BarWindow, TempoMeta } from "@/types/noise-gens";

import { fetchOriginalStems } from "@/lib/api/noiseGens";
import type { OriginalStem } from "@/types/noise-gens";

export type PlanWindowAnalysis = {
  startBar: number;
  bars: number;
  energy?: number;
  density?: number;
  brightness?: number;
};

export type PlanSection = {
  name: string;
  startBar: number;
  bars: number;
};

export type PlanEnergyPoint = { bar: number; energy: number };

export type PlanAnalysis = {
  windows?: PlanWindowAnalysis[];
  energyByBar?: number[];
  densityByBar?: number[];
  onsetDensityByBar?: number[];
  brightnessByBar?: number[];
  centroidByBar?: number[];
  rolloffByBar?: number[];
  dynamicRangeByBar?: number[];
  crestFactorByBar?: number[];
  tempoByBar?: number[];
  silenceByBar?: number[];
  chromaByBar?: number[][];
  keyConfidence?: number;
  sections?: PlanSection[];
  energyCurve?: PlanEnergyPoint[];
};

type PlanAnalysisInput = {
  originalId: string;
  barWindows: BarWindow[];
  tempo: TempoMeta;
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const STEM_EXCLUDE_TOKENS = [
  "vocal",
  "vox",
  "drum",
  "drums",
  "kick",
  "snare",
  "hat",
  "perc",
  "percussion",
];
const STEM_EXCLUDE_CATEGORIES = new Set(["vocal", "drums"]);

const resourceCache = new Map<string, Promise<boolean>>();

const resourceExists = async (url: string) => {
  let cached = resourceCache.get(url);
  if (!cached) {
    cached = fetch(url, { method: "HEAD" })
      .then((res) => res.ok)
      .catch(() => false);
    resourceCache.set(url, cached);
  }
  return cached;
};

const resolveInstrumentalUrl = async (
  originalId: string,
): Promise<string | null> => {
  const slug = encodeURIComponent(originalId.toLowerCase());
  const candidates = [
    `/api/noise-gens/originals/${slug}/instrumental`,
    `/originals/${slug}/instrumental.wav`,
    `/audio/originals/${slug}/instrumental.wav`,
  ];
  for (const url of candidates) {
    if (await resourceExists(url)) {
      return url;
    }
  }
  return null;
};

const shouldExcludeStemName = (value?: string) => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return STEM_EXCLUDE_TOKENS.some((token) => normalized.includes(token));
};

const selectInstrumentalStems = (stems: OriginalStem[]) => {
  if (!stems.length) return [];
  const isExcluded = (stem: OriginalStem) => {
    const category = stem.category?.toLowerCase();
    if (category && STEM_EXCLUDE_CATEGORIES.has(category)) return true;
    return (
      shouldExcludeStemName(stem.name) || shouldExcludeStemName(stem.id)
    );
  };
  const filtered = stems.filter(
    (stem) => !isExcluded(stem),
  );
  return filtered.length ? filtered : stems;
};

const decodeAudioBuffer = async (
  context: AudioContext,
  url: string,
): Promise<AudioBuffer | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    return null;
  }
};

const mixBuffers = async (buffers: AudioBuffer[]): Promise<AudioBuffer | null> => {
  if (!buffers.length) return null;
  if (buffers.length === 1) return buffers[0];
  if (typeof OfflineAudioContext === "undefined") {
    return buffers[0];
  }
  const sampleRate = buffers[0].sampleRate || 44100;
  const maxDuration = Math.max(
    ...buffers.map((buffer) => buffer.length / buffer.sampleRate),
  );
  const frameCount = Math.max(1, Math.ceil(maxDuration * sampleRate));
  const context = new OfflineAudioContext(2, frameCount, sampleRate);
  const gainValue = 1 / Math.max(1, buffers.length);
  for (const buffer of buffers) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(context.destination);
    source.start(0);
  }
  const mixed = await context.startRendering();
  const maybeClose = (context as OfflineAudioContext & { close?: () => Promise<void> }).close;
  if (typeof maybeClose === "function") {
    await maybeClose.call(context);
  }
  return mixed;
};

const sanitizeTempo = (tempo: TempoMeta) => ({
  bpm: Math.min(240, Math.max(40, Number(tempo.bpm) || 120)),
  timeSig:
    typeof tempo.timeSig === "string" && /^\d+\/\d+$/.test(tempo.timeSig)
      ? tempo.timeSig
      : ("4/4" as TempoMeta["timeSig"]),
  offsetMs: Number.isFinite(tempo.offsetMs) ? tempo.offsetMs : 0,
});

export async function analyzeOriginalForPlan(
  input: PlanAnalysisInput,
): Promise<PlanAnalysis | null> {
  if (typeof AudioContext === "undefined") return null;
  const cleanedWindows = (input.barWindows ?? []).filter(
    (window) =>
      Number.isFinite(window.startBar) &&
      Number.isFinite(window.endBar) &&
      window.endBar > window.startBar,
  );
  if (!cleanedWindows.length) return null;

  try {
    const tempo = sanitizeTempo(input.tempo);
    const context = new AudioContext();
    let audioBuffer: AudioBuffer | null = null;
    const url = await resolveInstrumentalUrl(input.originalId);
    if (url) {
      audioBuffer = await decodeAudioBuffer(context, url);
    }
    if (!audioBuffer) {
      const stems = await fetchOriginalStems(input.originalId).catch(() => []);
      const selected = selectInstrumentalStems(stems);
      if (selected.length) {
        const buffers = await Promise.all(
          selected.map((stem) => decodeAudioBuffer(context, stem.url)),
        );
        const usable = buffers.filter(Boolean) as AudioBuffer[];
        audioBuffer = await mixBuffers(usable);
      }
    }
    if (!audioBuffer) {
      audioBuffer = await decodeAudioBuffer(
        context,
        "/originals/default/instrumental.wav",
      );
    }
    if (context.close) {
      void context.close();
    }
    if (!audioBuffer) return null;

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const channelA = audioBuffer.getChannelData(0);
    const channelB = channels > 1 ? audioBuffer.getChannelData(1) : null;
    const channelScale = channels > 1 ? 1 / channels : 1;

    const maxEndBar = Math.max(
      ...cleanedWindows.map((window) => Math.floor(window.endBar)),
    );
    const maxBar = Math.max(1, maxEndBar - 1);
    const energyRaw = new Array<number>(maxBar).fill(0);
    const densityRaw = new Array<number>(maxBar).fill(0);
    const brightnessRaw = new Array<number>(maxBar).fill(0);
    const crestRaw = new Array<number>(maxBar).fill(0);
    const dynamicRangeRaw = new Array<number>(maxBar).fill(0);

    const beatsPerBar = Number(tempo.timeSig.split("/")[0]) || 4;
    const msPerBeat = 60000 / tempo.bpm;
    const msPerBar = msPerBeat * beatsPerBar;
    const offsetMs = tempo.offsetMs;
    const cutoffHz = 250;
    const lpAlpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);

    let energyMin = Number.POSITIVE_INFINITY;
    let energyMax = Number.NEGATIVE_INFINITY;
    let densityMin = Number.POSITIVE_INFINITY;
    let densityMax = Number.NEGATIVE_INFINITY;
    let brightnessMin = Number.POSITIVE_INFINITY;
    let brightnessMax = Number.NEGATIVE_INFINITY;

    for (let bar = 1; bar <= maxBar; bar += 1) {
      const startMs = offsetMs + (bar - 1) * msPerBar;
      const endMs = offsetMs + bar * msPerBar;
      const startSample = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
      const endSample = Math.min(
        audioBuffer.length,
        Math.floor((endMs / 1000) * sampleRate),
      );
      const count = Math.max(0, endSample - startSample);
      if (count <= 0) {
        energyRaw[bar - 1] = 0;
        densityRaw[bar - 1] = 0;
        brightnessRaw[bar - 1] = 0;
        continue;
      }

      let sumSq = 0;
      let sumLowSq = 0;
      let sumHighSq = 0;
      let sumDiff = 0;
      let low = 0;
      let prev = 0;
      let seeded = false;
      let peak = 0;

      for (let idx = startSample; idx < endSample; idx += 1) {
        const sample =
          channels > 1
            ? (channelA[idx] + (channelB?.[idx] ?? 0)) * channelScale
            : channelA[idx];
        low = lpAlpha * low + (1 - lpAlpha) * sample;
        const high = sample - low;
        sumSq += sample * sample;
        sumLowSq += low * low;
        sumHighSq += high * high;
        peak = Math.max(peak, Math.abs(sample));
        if (seeded) {
          sumDiff += Math.abs(sample - prev);
        } else {
          seeded = true;
        }
        prev = sample;
      }

      const rms = Math.sqrt(sumSq / count);
      const lowRms = Math.sqrt(sumLowSq / count);
      const highRms = Math.sqrt(sumHighSq / count);
      const brightness =
        highRms + lowRms > 0 ? highRms / (highRms + lowRms) : 0;
      const density = sumDiff / count;
      const crestFactor = rms > 0 ? peak / rms : 0;
      const dynamicRange = Math.max(0, peak - rms);

      energyRaw[bar - 1] = rms;
      densityRaw[bar - 1] = density;
      brightnessRaw[bar - 1] = clamp01(brightness);
      crestRaw[bar - 1] = crestFactor;
      dynamicRangeRaw[bar - 1] = dynamicRange;

      energyMin = Math.min(energyMin, rms);
      energyMax = Math.max(energyMax, rms);
      densityMin = Math.min(densityMin, density);
      densityMax = Math.max(densityMax, density);
      brightnessMin = Math.min(brightnessMin, brightness);
      brightnessMax = Math.max(brightnessMax, brightness);
    }

    const energyRange =
      Number.isFinite(energyMin) && Number.isFinite(energyMax) && energyMax > energyMin
        ? energyMax - energyMin
        : 0;
    const densityRange =
      Number.isFinite(densityMin) &&
      Number.isFinite(densityMax) &&
      densityMax > densityMin
        ? densityMax - densityMin
        : 0;
    const brightnessRange =
      Number.isFinite(brightnessMin) &&
      Number.isFinite(brightnessMax) &&
      brightnessMax > brightnessMin
        ? brightnessMax - brightnessMin
        : 0;

    const energyByBar = energyRaw.map((value) =>
      energyRange > 0 ? clamp01((value - energyMin) / energyRange) : 0.5,       
    );
    const densityByBar = densityRaw.map((value) =>
      densityRange > 0 ? clamp01((value - densityMin) / densityRange) : 0.5,    
    );
    const brightnessByBar = brightnessRaw.map((value) =>
      brightnessRange > 0
        ? clamp01((value - brightnessMin) / brightnessRange)
        : clamp01(value),
    );
    const crestFactorByBar = crestRaw.map((value) =>
      clamp01(value / 4),
    );
    const dynamicRangeByBar = dynamicRangeRaw.map((value) =>
      clamp01(value),
    );
    // Use brightness ratio as a cheap centroid/rolloff proxy.
    const centroidByBar = brightnessByBar.map((value) => clamp01(value));
    const rolloffByBar = brightnessByBar.map((value) =>
      clamp01(value * 0.9 + 0.05),
    );
    const onsetDensityByBar = densityByBar.map((value) => clamp01(value));
    const tempoByBar = Array.from({ length: maxBar }, () => tempo.bpm);
    const silenceThreshold = 0.08;
    const silenceByBar = energyByBar.map((value) =>
      value <= silenceThreshold ? 1 : 0,
    );

    const windows: PlanWindowAnalysis[] = cleanedWindows.map((window) => {      
      const startBar = Math.max(1, Math.floor(window.startBar));
      const bars = Math.max(1, Math.floor(window.endBar - window.startBar));    
      const startIndex = Math.max(0, startBar - 1);
      const endIndex = Math.min(maxBar, startIndex + bars);
      let sumEnergy = 0;
      let sumDensity = 0;
      let sumBrightness = 0;
      let count = 0;
      for (let idx = startIndex; idx < endIndex; idx += 1) {
        sumEnergy += energyByBar[idx] ?? 0;
        sumDensity += densityByBar[idx] ?? 0;
        sumBrightness += brightnessByBar[idx] ?? 0;
        count += 1;
      }
      const denom = count || 1;
      return {
        startBar,
        bars,
        energy: clamp01(sumEnergy / denom),
        density: clamp01(sumDensity / denom),
        brightness: clamp01(sumBrightness / denom),
      };
    });

    return {
      windows,
      energyByBar,
      densityByBar,
      onsetDensityByBar,
      brightnessByBar,
      centroidByBar,
      rolloffByBar,
      dynamicRangeByBar,
      crestFactorByBar,
      tempoByBar,
      silenceByBar,
    };
  } catch {
    return null;
  }
}
