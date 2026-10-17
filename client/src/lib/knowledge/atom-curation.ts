import type {
  KnowledgeFileAnalysis,
  KnowledgeFileRecord,
} from "@/lib/agi/knowledge-store";
import type { RenderPlan, TempoMeta } from "@/types/noise-gens";

export const ATOM_TAG = "atom";

const DEFAULT_SAMPLE_SECONDS = 20;
const MAX_SAMPLE_POINTS = 32_000;
const WAVEFORM_SAMPLE_COUNT = 180;

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const normalizeTag = (value: string) => value.trim().toLowerCase();

const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of tags) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = normalizeTag(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
};

export const collectTags = (record: {
  tags?: string[];
  autoTags?: string[];
}): string[] => uniqueTags([...(record.tags ?? []), ...(record.autoTags ?? [])]);

export const hasTag = (record: { tags?: string[]; autoTags?: string[] }, tag: string) => {
  const needle = normalizeTag(tag);
  return collectTags(record).some((entry) => normalizeTag(entry) === needle);
};

const tokenizedName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .split(/[^a-z0-9#]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const parseBpmToken = (token: string) => {
  const match = token.match(/^(\d{2,3})bpm$/) ?? token.match(/^bpm(\d{2,3})$/);
  if (!match) return null;
  const bpm = Number(match[1]);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;
  return bpm;
};

const parseKeyToken = (token: string) => {
  const match = token.match(/^([a-g])([#b])?(maj|min|major|minor|m)?$/i);
  if (!match) return null;
  const [, noteRaw, accidentalRaw, modeRaw] = match;
  if (!modeRaw) return null;
  const note = noteRaw.toUpperCase();
  const accidental = accidentalRaw ?? "";
  const mode =
    modeRaw.toLowerCase().startsWith("m") && modeRaw.toLowerCase() !== "maj"
      ? "min"
      : "maj";
  return `key:${note}${accidental}${mode}`;
};

const keywordTags: Array<[RegExp, string]> = [
  [/\b(kick|bd)\b/i, "inst:kick"],
  [/\b(snare)\b/i, "inst:snare"],
  [/\b(hat|hihat)\b/i, "inst:hat"],
  [/\b(clap)\b/i, "inst:clap"],
  [/\b(bass)\b/i, "inst:bass"],
  [/\b(sub)\b/i, "inst:sub"],
  [/\b(perc|percussion)\b/i, "inst:perc"],
  [/\b(drum|drums)\b/i, "inst:drums"],
  [/\b(pad)\b/i, "inst:pad"],
  [/\b(lead)\b/i, "inst:lead"],
  [/\b(keys|piano|ep)\b/i, "inst:keys"],
  [/\b(arp|arpeggio)\b/i, "inst:arp"],
  [/\b(vocal|vox)\b/i, "inst:vocal"],
  [/\b(guitar)\b/i, "inst:guitar"],
  [/\b(synth)\b/i, "inst:synth"],
  [/\b(fx|sfx)\b/i, "inst:fx"],
  [/\b(riser|sweep|impact|transition)\b/i, "role:fx"],
  [/\b(loop)\b/i, "type:loop"],
  [/\b(one?shot|oneshot)\b/i, "type:oneshot"],
  [/\b(texture|ambience|ambient)\b/i, "role:texture"],
  [/\b(intro)\b/i, "section:intro"],
  [/\b(verse)\b/i, "section:verse"],
  [/\b(build)\b/i, "section:build"],
  [/\b(drop)\b/i, "section:drop"],
  [/\b(bridge)\b/i, "section:bridge"],
  [/\b(outro)\b/i, "section:outro"],
];

export const deriveNameTags = (name: string): string[] => {
  const tags: string[] = [];
  for (const token of tokenizedName(name)) {
    const bpm = parseBpmToken(token);
    if (bpm) {
      tags.push(`bpm:${bpm}`);
      continue;
    }
    const keyTag = parseKeyToken(token);
    if (keyTag) {
      tags.push(keyTag);
    }
  }
  for (const [pattern, tag] of keywordTags) {
    if (pattern.test(name)) {
      tags.push(tag);
    }
  }
  return tags;
};

const classifyEnergy = (rms: number) => {
  if (rms < 0.06) return "energy:low";
  if (rms < 0.12) return "energy:mid";
  return "energy:high";
};

const classifyBrightness = (brightness: number) => {
  if (brightness < 0.33) return "bright:low";
  if (brightness < 0.66) return "bright:mid";
  return "bright:high";
};

const classifyDuration = (durationSec: number) => {
  if (durationSec < 1.2) return "duration:shot";
  if (durationSec < 4) return "duration:short";
  if (durationSec < 16) return "duration:loop";
  return "duration:long";
};

const buildWaveformPeaks = (buffer: AudioBuffer): number[] => {
  const totalSamples = buffer.length;
  if (!Number.isFinite(totalSamples) || totalSamples <= 0) return [];
  const channelCount = buffer.numberOfChannels;
  const left = buffer.getChannelData(0);
  const right = channelCount > 1 ? buffer.getChannelData(1) : null;
  const blockSize = Math.max(1, Math.floor(totalSamples / WAVEFORM_SAMPLE_COUNT));
  const peaks: number[] = new Array(WAVEFORM_SAMPLE_COUNT).fill(0);
  for (let i = 0; i < WAVEFORM_SAMPLE_COUNT; i += 1) {
    const start = i * blockSize;
    if (start >= totalSamples) {
      peaks[i] = 0;
      continue;
    }
    const end = Math.min(totalSamples, start + blockSize);
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      const leftSample = Math.abs(left[j] ?? 0);
      const rightSample = right ? Math.abs(right[j] ?? 0) : 0;
      const value = leftSample > rightSample ? leftSample : rightSample;
      if (value > peak) peak = value;
    }
    peaks[i] = clamp01(peak);
  }
  return peaks;
};

export const analyzeAudioBuffer = (
  audioBuffer: AudioBuffer,
  name: string,
): AtomAnalysisResult => {
  const channels = audioBuffer.numberOfChannels;
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const maxSamples = Math.min(
    channelData.length,
    Math.floor(sampleRate * DEFAULT_SAMPLE_SECONDS),
  );
  const stride = Math.max(1, Math.floor(maxSamples / MAX_SAMPLE_POINTS));
  let sumSq = 0;
  let peak = 0;
  let zcr = 0;
  let last = 0;
  let count = 0;

  for (let i = 0; i < maxSamples; i += stride) {
    let sample = channelData[i] ?? 0;
    if (channels > 1) {
      sample += audioBuffer.getChannelData(1)?.[i] ?? 0;
      sample /= channels;
    }
    sumSq += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
    const sign = sample >= 0 ? 1 : -1;
    if (i > 0 && sign !== last) {
      zcr += 1;
    }
    last = sign;
    count += 1;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, count));
  const zcrRate = count > 1 ? zcr / count : 0;
  const brightness = clamp01((zcrRate - 0.02) / 0.23);
  const durationSec = audioBuffer.duration;
  const waveformPeaks = buildWaveformPeaks(audioBuffer);

  const analysis: KnowledgeFileAnalysis = {
    durationSec,
    rms,
    peak,
    zcr: zcrRate,
    brightness,
    waveformPeaks,
  };

  const autoTags = uniqueTags(
    [
      ...deriveNameTags(name),
      classifyDuration(durationSec),
      classifyEnergy(rms),
      classifyBrightness(brightness),
      durationSec < 16 ? ATOM_TAG : "",
    ].filter(Boolean),
  );

  return { analysis, autoTags };
};

export type AtomAnalysisResult = {
  analysis: KnowledgeFileAnalysis;
  autoTags: string[];
};

export async function analyzeKnowledgeAudio(
  record: KnowledgeFileRecord,
): Promise<AtomAnalysisResult | null> {
  if (typeof AudioContext === "undefined") return null;
  try {
    const arrayBuffer = await record.data.arrayBuffer();
    const context = new AudioContext();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));    
    if (context.close) {
      void context.close();
    }
    return analyzeAudioBuffer(audioBuffer, record.name);
  } catch {
    return null;
  }
}

export type AtomIndexEntry = {
  id: string;
  projectId?: string;
  name: string;
  tags: string[];
  manualTags: string[];
  autoTags: string[];
  analysis?: KnowledgeFileAnalysis;
  energy?: number;
  brightness?: number;
  durationSec?: number;
};

export type AtomIndex = {
  entries: AtomIndexEntry[];
  tagMap: Map<string, AtomIndexEntry[]>;
};

export const buildAtomIndex = (files: KnowledgeFileRecord[]): AtomIndex => {
  const entries: AtomIndexEntry[] = [];
  let minRms = Number.POSITIVE_INFINITY;
  let maxRms = Number.NEGATIVE_INFINITY;
  let minBright = Number.POSITIVE_INFINITY;
  let maxBright = Number.NEGATIVE_INFINITY;

  for (const file of files) {
    const analysis = file.analysis;
    if (analysis?.rms != null) {
      minRms = Math.min(minRms, analysis.rms);
      maxRms = Math.max(maxRms, analysis.rms);
    }
    if (analysis?.brightness != null) {
      minBright = Math.min(minBright, analysis.brightness);
      maxBright = Math.max(maxBright, analysis.brightness);
    }
  }

  const rmsRange = Number.isFinite(minRms) && Number.isFinite(maxRms) && maxRms > minRms
    ? maxRms - minRms
    : 1;
  const brightRange =
    Number.isFinite(minBright) && Number.isFinite(maxBright) && maxBright > minBright
      ? maxBright - minBright
      : 1;

  for (const file of files) {
    const manualTags = file.tags ?? [];
    const autoTags = file.autoTags ?? [];
    const tags = collectTags({ tags: manualTags, autoTags });
    const analysis = file.analysis;
    const energy =
      typeof analysis?.rms === "number" ? clamp01((analysis.rms - minRms) / rmsRange) : undefined;
    const brightness =
      typeof analysis?.brightness === "number"
        ? clamp01((analysis.brightness - minBright) / brightRange)
        : undefined;
    entries.push({
      id: file.id,
      projectId: file.projectId,
      name: file.name,
      tags,
      manualTags,
      autoTags,
      analysis,
      energy,
      brightness,
      durationSec: analysis?.durationSec,
    });
  }

  const tagMap = new Map<string, AtomIndexEntry[]>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const key = normalizeTag(tag);
      const bucket = tagMap.get(key) ?? [];
      bucket.push(entry);
      tagMap.set(key, bucket);
    }
  }
  return { entries, tagMap };
};

const parseTagValue = (tags: string[], prefix: string) => {
  const match = tags.find((tag) => normalizeTag(tag).startsWith(prefix));
  return match ? match.split(":").slice(1).join(":") : null;
};

const resolveEnergyForWindow = (
  plan: RenderPlan,
  window: RenderPlan["windows"][number],
) => {
  const curve = plan.global?.energyCurve;
  if (curve?.length) {
    const start = window.startBar;
    const bars = window.bars;
    let sum = 0;
    let count = 0;
    for (const point of curve) {
      if (point.bar >= start && point.bar < start + bars) {
        sum += clamp01(point.energy);
        count += 1;
      }
    }
    if (count > 0) return sum / count;
  }
  if (typeof window.texture?.sampleInfluence === "number") {
    return clamp01(window.texture.sampleInfluence);
  }
  return 0.5;
};

const resolveBrightnessForWindow = (window: RenderPlan["windows"][number]) => {
  if (typeof window.texture?.styleInfluence === "number") {
    return clamp01(window.texture.styleInfluence);
  }
  return 0.5;
};

const resolveSectionForWindow = (plan: RenderPlan, window: RenderPlan["windows"][number]) => {
  const sections = plan.global?.sections ?? [];
  for (const section of sections) {
    const start = section.startBar;
    const end = section.startBar + section.bars;
    if (window.startBar >= start && window.startBar < end) {
      return section.name.toLowerCase();
    }
  }
  return null;
};

const windowDurationSec = (tempo: TempoMeta | undefined, bars: number) => {
  const bpm = tempo?.bpm ?? 120;
  const [_, denRaw] = (tempo?.timeSig ?? "4/4").split("/").map(Number);
  const den = Number.isFinite(denRaw) && denRaw > 0 ? denRaw : 4;
  const beatSeconds = 60 / bpm;
  const beatsPerBar = 4 * (4 / den);
  return bars * beatsPerBar * beatSeconds;
};

export type AtomSelectionOptions = {
  tempo?: TempoMeta;
  maxPerWindow?: number;
  requireAtomTag?: boolean;
};

export const applyAtomSelectionToPlan = (
  plan: RenderPlan,
  index: AtomIndex,
  options: AtomSelectionOptions = {},
) => {
  const nextPlan: RenderPlan = {
    ...plan,
    windows: plan.windows.map((window) => ({ ...window })),
  };
  const maxPerWindow = options.maxPerWindow ?? 1;
  const used = new Set<string>();
  let appliedCount = 0;

  nextPlan.windows = nextPlan.windows.map((window) => {
    if (window.material?.audioAtomIds?.length) {
      window.material.audioAtomIds.forEach((id) => used.add(id));
      return window;
    }
    const energyTarget = resolveEnergyForWindow(nextPlan, window);
    const brightTarget = resolveBrightnessForWindow(window);
    const durationTarget = windowDurationSec(options.tempo, window.bars);
    const section = resolveSectionForWindow(nextPlan, window);
    const planKey = plan.global?.key?.toLowerCase();
    const planBpm = plan.global?.bpm ?? options.tempo?.bpm;

    const candidates = index.entries.filter((entry) => {
      if (options.requireAtomTag && !hasTag(entry, ATOM_TAG)) {
        return false;
      }
      return true;
    });

    const ranked = candidates
      .map((entry) => {
        const entryEnergy = entry.energy ?? 0.5;
        const entryBright = entry.brightness ?? 0.5;
        const energyScore = 1 - Math.abs(entryEnergy - energyTarget);
        const brightScore = 1 - Math.abs(entryBright - brightTarget);
        const durationScore =
          typeof entry.durationSec === "number"
            ? 1 - Math.min(1, Math.abs(entry.durationSec - durationTarget) / durationTarget)
            : 0.5;
        const sectionBoost =
          section && entry.tags.some((tag) => normalizeTag(tag) === `section:${section}`)
            ? 0.15
            : 0;
        const manualAtomBoost = hasTag({ tags: entry.manualTags }, ATOM_TAG) ? 0.1 : 0;
        let bpmBoost = 0;
        if (planBpm) {
          const bpmTag = parseTagValue(entry.tags, "bpm:");
          const bpmValue = bpmTag ? Number(bpmTag) : NaN;
          if (Number.isFinite(bpmValue)) {
            bpmBoost = Math.abs(bpmValue - planBpm) <= 6 ? 0.1 : -0.05;
          }
        }
        let keyBoost = 0;
        if (planKey) {
          const keyTag = parseTagValue(entry.tags, "key:");
          if (keyTag && keyTag.toLowerCase() === planKey) {
            keyBoost = 0.1;
          }
        }
        let usedPenalty = used.has(entry.id) ? 0.2 : 0;
        const score =
          0.4 * energyScore +
          0.25 * brightScore +
          0.2 * durationScore +
          sectionBoost +
          manualAtomBoost +
          bpmBoost +
          keyBoost -
          usedPenalty;
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score);

    const selected = ranked.slice(0, maxPerWindow).map((item) => item.entry.id);
    selected.forEach((id) => used.add(id));
    if (selected.length) {
      appliedCount += selected.length;
      return {
        ...window,
        material: {
          ...(window.material ?? {}),
          audioAtomIds: selected,
        },
      };
    }
    return window;
  });

  return { plan: nextPlan, appliedCount };
};
