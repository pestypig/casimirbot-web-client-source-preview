import type { KnowledgeFileAnalysis, KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import {
  ATOM_TAG,
  analyzeAudioBuffer,
  collectTags,
  deriveNameTags,
  hasTag,
} from "@/lib/knowledge/atom-curation";

type SliceKind = "transient" | "loop" | "phrase";

export type ExtractedAtom = {
  file: File;
  analysis: KnowledgeFileAnalysis;
  autoTags: string[];
  sourceId: string;
};

export type AtomExtractionResult = {
  atoms: ExtractedAtom[];
  deduped: number;
  skippedSources: number;
};

export type AtomExtractionOptions = {
  maxAtomsPerSource?: number;
  maxTotal?: number;
  onProgress?: (message: string) => void;
};

const ENVELOPE_WINDOW_SEC = 0.02;
const ENVELOPE_HOP_SEC = 0.01;
const TRANSIENT_PRE_SEC = 0.03;
const TRANSIENT_POST_SEC = 0.25;
const MIN_TRANSIENT_GAP_SEC = 0.18;
const MIN_LOOP_SEC = 0.7;
const MIN_PHRASE_SEC = 3;
const MAX_SLICE_SEC = 12;
const TARGET_RMS = 0.12;
const TARGET_PEAK = 0.95;
const MAX_GAIN = 6;

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const clamp01 = (value: number) => clamp(value, 0, 1);

const normalizeTag = (value: string) => value.trim().toLowerCase();

const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = normalizeTag(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

const sanitizeBaseName = (name: string) => {
  const base = name.replace(/\.[^/.]+$/, "");
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "atom";
};

const mixToMono = (buffer: AudioBuffer) => {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] ?? 0;
    }
  }
  if (channels > 1) {
    for (let i = 0; i < length; i += 1) {
      mono[i] /= channels;
    }
  }
  return mono;
};

const computeEnvelope = (
  samples: Float32Array,
  windowSize: number,
  hop: number,
) => {
  const length = samples.length;
  const frameCount = Math.max(1, Math.floor((length - windowSize) / hop));
  const envelope = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hop;
    const end = Math.min(length, start + windowSize);
    let sumSq = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const sample = samples[i] ?? 0;
      sumSq += sample * sample;
      count += 1;
    }
    envelope[frame] = Math.sqrt(sumSq / Math.max(1, count));
  }
  return envelope;
};

const computeMeanStd = (values: Float32Array) => {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    sum += value;
    sumSq += value * value;
  }
  const mean = values.length ? sum / values.length : 0;
  const variance = values.length ? sumSq / values.length - mean * mean : 0;
  return { mean, std: Math.sqrt(Math.max(0, variance)) };
};

const detectTransientPeaks = (
  envelope: Float32Array,
  threshold: number,
  minGapFrames: number,
) => {
  const peaks: number[] = [];
  let lastPeak = -minGapFrames;
  for (let i = 1; i < envelope.length - 1; i += 1) {
    const value = envelope[i];
    if (value < threshold) continue;
    if (value < envelope[i - 1] || value < envelope[i + 1]) continue;
    if (i - lastPeak < minGapFrames) continue;
    peaks.push(i);
    lastPeak = i;
  }
  return peaks;
};

type Segment = { start: number; end: number };

const detectSegments = (
  envelope: Float32Array,
  threshold: number,
): Segment[] => {
  const segments: Segment[] = [];
  let active = false;
  let start = 0;
  for (let i = 0; i < envelope.length; i += 1) {
    const isOn = envelope[i] >= threshold;
    if (isOn && !active) {
      active = true;
      start = i;
    }
    if (!isOn && active) {
      active = false;
      segments.push({ start, end: i });
    }
  }
  if (active) {
    segments.push({ start, end: envelope.length });
  }
  return segments;
};

const trimSegment = (
  samples: Float32Array,
  start: number,
  end: number,
  minSamples: number,
) => {
  let peak = 0;
  for (let i = start; i < end; i += 1) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) peak = value;
  }
  const threshold = peak * 0.04;
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < end && Math.abs(samples[trimmedStart] ?? 0) < threshold) {
    trimmedStart += 1;
  }
  while (trimmedEnd > trimmedStart && Math.abs(samples[trimmedEnd - 1] ?? 0) < threshold) {
    trimmedEnd -= 1;
  }
  if (trimmedEnd - trimmedStart < minSamples) {
    return { start, end };
  }
  return { start: trimmedStart, end: trimmedEnd };
};

const computeSegmentStats = (
  samples: Float32Array,
  start: number,
  end: number,
  stride = 1,
) => {
  let sumSq = 0;
  let peak = 0;
  let zcr = 0;
  let last = 0;
  let count = 0;
  for (let i = start; i < end; i += stride) {
    const value = samples[i] ?? 0;
    sumSq += value * value;
    peak = Math.max(peak, Math.abs(value));
    const sign = value >= 0 ? 1 : -1;
    if (i > start && sign !== last) {
      zcr += 1;
    }
    last = sign;
    count += 1;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, count));
  const zcrRate = count > 1 ? zcr / count : 0;
  return { rms, peak, zcr: zcrRate };
};

const buildFingerprint = (
  samples: Float32Array,
  start: number,
  end: number,
  sampleRate: number,
) => {
  const length = end - start;
  const durationBin = Math.round((length / sampleRate) * 10);
  const stats = computeSegmentStats(samples, start, end, 6);
  const rmsBin = Math.round(stats.rms * 50);
  const zcrBin = Math.round(stats.zcr * 40);
  const bins = 12;
  const binSize = Math.max(1, Math.floor(length / bins));
  const shape: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const binStart = start + i * binSize;
    const binEnd = Math.min(end, binStart + binSize);
    let peak = 0;
    for (let j = binStart; j < binEnd; j += 1) {
      const value = Math.abs(samples[j] ?? 0);
      if (value > peak) peak = value;
    }
    shape.push(Math.round(clamp01(peak) * 15));
  }
  return `${durationBin}:${rmsBin}:${zcrBin}:${shape.join("")}`;
};

const applyFade = (buffer: AudioBuffer, durationSec: number) => {
  const fadeSamples = Math.min(
    Math.floor(durationSec * buffer.sampleRate),
    Math.floor(buffer.length / 10),
  );
  if (fadeSamples <= 0) return;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < fadeSamples; i += 1) {
      const gain = i / fadeSamples;
      data[i] *= gain;
      data[data.length - 1 - i] *= gain;
    }
  }
};

const createSliceBuffer = (
  source: AudioBuffer,
  start: number,
  end: number,
  gain: number,
) => {
  const length = Math.max(1, end - start);
  const buffer = new AudioBuffer({
    length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const dest = buffer.getChannelData(channel);
    const data = source.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      dest[i] = (data[start + i] ?? 0) * gain;
    }
  }
  applyFade(buffer, 0.01);
  return buffer;
};

const resolveTempoFromTags = (tags: string[]) => {
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized.startsWith("bpm:")) continue;
    const bpm = Number(normalized.slice(4));
    if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 240) {
      return bpm;
    }
  }
  return null;
};

const filterSourceTags = (record: KnowledgeFileRecord, derivedTags: string[]) => {
  const tags = uniqueTags([...collectTags(record), ...derivedTags]);
  const prefixes = ["bpm:", "key:", "inst:", "role:", "section:", "stem:", "genre:", "kit:"];
  return tags.filter((tag) =>
    prefixes.some((prefix) => normalizeTag(tag).startsWith(prefix)),
  );
};

const bufferToWavBlob = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2;
  const wavBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length, true);

  let offset = 44;
  const channelData = Array.from(
    { length: numChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = channelData[channel][i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([wavBuffer], { type: "audio/wav" });
};

type Candidate = {
  start: number;
  end: number;
  kind: SliceKind;
  energy: number;
  fingerprint: string;
};

const buildCandidates = (
  source: AudioBuffer,
  mono: Float32Array,
  tempoBpm: number | null,
) => {
  const sampleRate = source.sampleRate;
  const windowSize = Math.max(64, Math.floor(sampleRate * ENVELOPE_WINDOW_SEC));
  const hop = Math.max(32, Math.floor(sampleRate * ENVELOPE_HOP_SEC));
  const envelope = computeEnvelope(mono, windowSize, hop);
  const { mean, std } = computeMeanStd(envelope);
  const max = envelope.reduce((acc, value) => Math.max(acc, value), 0);
  const transientThreshold = Math.max(mean + std * 1.5, max * 0.55);
  const segmentThreshold = Math.max(mean + std * 0.3, max * 0.25);
  const minGapFrames = Math.max(1, Math.floor((MIN_TRANSIENT_GAP_SEC * sampleRate) / hop));
  const peaks = detectTransientPeaks(envelope, transientThreshold, minGapFrames);
  const candidates: Candidate[] = [];
  const minTransientSamples = Math.floor(sampleRate * 0.08);

  for (const peak of peaks) {
    const center = peak * hop + Math.floor(windowSize / 2);
    const start = Math.max(0, center - Math.floor(sampleRate * TRANSIENT_PRE_SEC));
    const end = Math.min(
      mono.length,
      center + Math.floor(sampleRate * TRANSIENT_POST_SEC),
    );
    const trimmed = trimSegment(mono, start, end, minTransientSamples);
    const durationSec = (trimmed.end - trimmed.start) / sampleRate;
    if (durationSec < 0.08) continue;
    const stats = computeSegmentStats(mono, trimmed.start, trimmed.end, 8);
    const fingerprint = buildFingerprint(mono, trimmed.start, trimmed.end, sampleRate);
    candidates.push({
      start: trimmed.start,
      end: trimmed.end,
      kind: "transient",
      energy: stats.rms,
      fingerprint,
    });
  }

  const segments = detectSegments(envelope, segmentThreshold);
  for (const segment of segments) {
    const start = Math.max(0, segment.start * hop);
    const end = Math.min(mono.length, segment.end * hop + windowSize);
    const trimmed = trimSegment(mono, start, end, Math.floor(sampleRate * 0.1));
    const durationSec = (trimmed.end - trimmed.start) / sampleRate;
    if (durationSec < MIN_LOOP_SEC) continue;
    const maxSec = Math.min(MAX_SLICE_SEC, durationSec);
    const targetBars = tempoBpm ? [4, 2, 1] : [];
    let sliceSec = Math.min(maxSec, 4);
    if (tempoBpm) {
      const barSec = (60 / tempoBpm) * 4;
      for (const bars of targetBars) {
        const candidateSec = bars * barSec;
        if (candidateSec <= maxSec * 1.1) {
          sliceSec = candidateSec;
          break;
        }
      }
    }
    const sliceSamples = Math.max(1, Math.floor(sliceSec * sampleRate));
    const availableSamples = trimmed.end - trimmed.start;
    const loopCount = Math.max(1, Math.floor(availableSamples / sliceSamples));
    const maxSlices = durationSec >= MIN_PHRASE_SEC ? 3 : 2;
    const sliceTotal = Math.min(loopCount, maxSlices);
    for (let i = 0; i < sliceTotal; i += 1) {
      const sliceStart = trimmed.start + i * sliceSamples;
      const sliceEnd = Math.min(trimmed.end, sliceStart + sliceSamples);
      const sliceDuration = (sliceEnd - sliceStart) / sampleRate;
      if (sliceDuration < MIN_LOOP_SEC) continue;
      const kind: SliceKind = sliceDuration >= MIN_PHRASE_SEC ? "phrase" : "loop";
      const stats = computeSegmentStats(mono, sliceStart, sliceEnd, 6);
      const fingerprint = buildFingerprint(mono, sliceStart, sliceEnd, sampleRate);
      candidates.push({
        start: sliceStart,
        end: sliceEnd,
        kind,
        energy: stats.rms,
        fingerprint,
      });
    }
  }

  return candidates;
};

export async function extractAtomsFromKnowledgeFiles(
  sources: KnowledgeFileRecord[],
  options: AtomExtractionOptions = {},
): Promise<AtomExtractionResult> {
  if (typeof AudioContext === "undefined") {
    throw new Error("AudioContext is not available in this environment.");
  }
  const maxAtomsPerSource = options.maxAtomsPerSource ?? 6;
  const maxTotal = options.maxTotal ?? 32;
  const atoms: ExtractedAtom[] = [];
  let deduped = 0;
  let skippedSources = 0;
  const signatures = new Set<string>();

  const context = new AudioContext();
  try {
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      if (hasTag(source, ATOM_TAG)) {
        skippedSources += 1;
        continue;
      }
      if (atoms.length >= maxTotal) break;
      options.onProgress?.(
        `Extracting ${source.name} (${index + 1}/${sources.length})`,
      );
      const arrayBuffer = await source.data.arrayBuffer();
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
      const mono = mixToMono(buffer);
      const derivedTags = deriveNameTags(source.name);
      const sourceTags = filterSourceTags(source, derivedTags);
      const tempoBpm = resolveTempoFromTags(sourceTags);
      const candidates = buildCandidates(buffer, mono, tempoBpm);

      const picked = candidates
        .filter((candidate) => {
          if (signatures.has(candidate.fingerprint)) {
            deduped += 1;
            return false;
          }
          signatures.add(candidate.fingerprint);
          return true;
        })
        .sort((a, b) => b.energy - a.energy)
        .slice(0, maxAtomsPerSource);

      for (let sliceIndex = 0; sliceIndex < picked.length; sliceIndex += 1) {
        if (atoms.length >= maxTotal) break;
        const candidate = picked[sliceIndex];
        const stats = computeSegmentStats(mono, candidate.start, candidate.end, 2);
        const gain = clamp(
          Math.min(
            TARGET_RMS / Math.max(1e-6, stats.rms),
            TARGET_PEAK / Math.max(1e-6, stats.peak),
          ),
          0.2,
          MAX_GAIN,
        );
        const sliceBuffer = createSliceBuffer(
          buffer,
          candidate.start,
          candidate.end,
          gain,
        );
        const baseName = sanitizeBaseName(source.name);
        const fileName = `${baseName}-${candidate.kind}-${sliceIndex + 1}.wav`;
        const blob = bufferToWavBlob(sliceBuffer);
        const file = new File([blob], fileName, { type: "audio/wav" });
        const analysisResult = analyzeAudioBuffer(sliceBuffer, fileName);
        const autoTags = uniqueTags([
          ...analysisResult.autoTags,
          ATOM_TAG,
          `type:${candidate.kind}`,
          `source:${baseName}`,
          ...sourceTags,
        ]);
        atoms.push({
          file,
          analysis: analysisResult.analysis,
          autoTags,
          sourceId: source.id,
        });
      }
    }
  } finally {
    if (context.close) {
      void context.close();
    }
  }

  return { atoms, deduped, skippedSources };
}
