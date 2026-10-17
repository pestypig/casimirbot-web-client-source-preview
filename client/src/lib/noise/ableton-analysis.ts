import { listKnowledgeFiles, type KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import type { BarWindow, TempoMeta } from "@/types/noise-gens";
import type { PlanAnalysis } from "@/lib/noise/plan-analysis";

export type AbletonPlanFeatures = {
  analysis: PlanAnalysis | null;
  key?: string;
};

type AbletonCandidate = {
  analysis: PlanAnalysis | null;
  key?: string;
  score: number;
};

const MAX_BARS = 2048;

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeNote = (value: string): string | null => {
  const compact = value.replace(/\s+/g, "");
  const match = compact.match(/^([A-Ga-g])([#b])?$/);
  if (!match) return null;
  const note = match[1].toUpperCase();
  const accidental = match[2] ?? "";
  return `${note}${accidental}`;
};

const normalizeMode = (value: string | null): string => {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "maj" || lower === "major") return "maj";
  if (lower === "min" || lower === "minor" || lower === "m") return "min";
  return "";
};

const normalizeKey = (value: string): string | null => {
  const compact = value.replace(/\s+/g, "");
  const match = compact.match(/^([A-Ga-g])([#b])?(maj|major|min|minor|m)?$/);
  if (!match) return null;
  const note = match[1].toUpperCase();
  const accidental = match[2] ?? "";
  const mode = normalizeMode(match[3] ?? "");
  return mode ? `${note}${accidental}${mode}` : `${note}${accidental}`;
};

const parseTimeSig = (value: unknown): { timeSig: string; beatsPerBar: number } => {
  if (typeof value === "string" && /^\d+\/\d+$/.test(value)) {
    const [numRaw, denRaw] = value.split("/").map((part) => Number(part));
    const num = Number.isFinite(numRaw) ? Math.max(1, Math.floor(numRaw)) : 4;
    const den = Number.isFinite(denRaw) ? Math.max(1, Math.floor(denRaw)) : 4;
    return { timeSig: `${num}/${den}`, beatsPerBar: num };
  }
  if (Array.isArray(value) && value.length >= 2) {
    const num = toNumber(value[0]) ?? 4;
    const den = toNumber(value[1]) ?? 4;
    return {
      timeSig: `${Math.max(1, Math.floor(num))}/${Math.max(1, Math.floor(den))}`,
      beatsPerBar: Math.max(1, Math.floor(num)),
    };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const num = toNumber(record.numerator ?? record.num ?? record.beats) ?? 4;
    const den = toNumber(record.denominator ?? record.den ?? record.divisor) ?? 4;
    return {
      timeSig: `${Math.max(1, Math.floor(num))}/${Math.max(1, Math.floor(den))}`,
      beatsPerBar: Math.max(1, Math.floor(num)),
    };
  }
  return { timeSig: "4/4", beatsPerBar: 4 };
};

const isJsonRecord = (record: KnowledgeFileRecord): boolean => {
  if (record.kind === "audio" || record.mime?.startsWith("audio/")) return false;
  const name = record.name.toLowerCase();
  if (record.mime?.includes("json")) return true;
  return name.endsWith(".json");
};

const parseJsonRecord = async (record: KnowledgeFileRecord): Promise<unknown | null> => {
  if (!isJsonRecord(record)) return null;
  try {
    const text = await record.data.text();
    const trimmed = text.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const resolveNumberField = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in obj) {
      const value = toNumber(obj[key]);
      if (value != null) return value;
    }
  }
  return null;
};

const resolveStringField = (obj: Record<string, unknown>, keys: string[]) => {  
  for (const key of keys) {
    if (key in obj) {
      const value = normalizeString(obj[key]);
      if (value) return value;
    }
  }
  return null;
};

const resolveTempoValue = (sources: Array<Record<string, unknown>>) => {
  for (const source of sources) {
    const value = resolveNumberField(source, [
      "tempo",
      "bpm",
      "tempoBpm",
      "bpmValue",
    ]);
    if (value != null) return value;
  }
  return null;
};

type TempoMapEntry = { bar: number; bpm: number };

const resolveTempoMap = (data: Record<string, unknown>): TempoMapEntry[] | null => {
  const candidates = [
    data.tempoMap,
    data.tempoTimeline,
    data.tempoAutomation,
    data.tempos,
    data.tempoEvents,
  ];
  const entries: TempoMapEntry[] = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const raw of candidate) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const bar = toNumber(
        entry.bar ??
          entry.startBar ??
          entry.barNumber ??
          entry.position ??
          entry.barIndex,
      );
      const bpm = toNumber(entry.bpm ?? entry.tempo ?? entry.value);
      if (bar != null && bpm != null && bar >= 1) {
        entries.push({ bar: Math.floor(bar), bpm });
      }
    }
  }
  if (!entries.length) return null;
  return entries.sort((a, b) => a.bar - b.bar);
};

const buildTempoByBar = (
  maxBar: number,
  tempoMap: TempoMapEntry[] | null,
  fallbackBpm: number | null,
) => {
  const safeMax = Math.max(1, Math.floor(maxBar));
  const base = fallbackBpm != null ? fallbackBpm : 120;
  const tempoByBar = new Array<number>(safeMax).fill(base);
  if (!tempoMap?.length) return tempoByBar;
  let current = base;
  let idx = 0;
  for (let bar = 1; bar <= safeMax; bar += 1) {
    while (idx < tempoMap.length && tempoMap[idx].bar <= bar) {
      current = tempoMap[idx].bpm;
      idx += 1;
    }
    tempoByBar[bar - 1] = current;
  }
  return tempoByBar;
};

const normalizeChromaByBar = (value: unknown, maxBar: number) => {
  if (!Array.isArray(value)) return null;
  const result: number[][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry)) continue;
    const bins = entry
      .slice(0, 12)
      .map((bin) => clamp01(toNumber(bin) ?? 0));
    if (bins.length !== 12) {
      while (bins.length < 12) bins.push(0);
    }
    result.push(bins);
  }
  if (!result.length) return null;
  return result.slice(0, Math.max(1, Math.floor(maxBar)));
};

const resolveKeyConfidence = (sources: Array<Record<string, unknown>>) => {
  for (const source of sources) {
    const value = resolveNumberField(source, [
      "keyConfidence",
      "keyStrength",
      "keyProb",
      "keyProbability",
    ]);
    if (value != null) return clamp01(value);
  }
  return null;
};

const resolveKeyFromMeta = (value: unknown): string | null => {
  if (typeof value === "string") return normalizeKey(value);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const root = normalizeNote(
    resolveStringField(record, ["root", "tonic", "note", "key"]) ?? "",
  );
  const mode = normalizeMode(resolveStringField(record, ["mode", "scale", "quality"]) ?? "");
  if (root) {
    return mode ? `${root}${mode}` : root;
  }
  const direct = resolveStringField(record, ["name", "label"]);
  return direct ? normalizeKey(direct) : null;
};

const resolveKeyFromName = (name: string): string | null => {
  const tokens = name
    .replace(/\.[^/.]+$/, "")
    .split(/[^a-zA-Z0-9#]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const parsed = normalizeKey(token);
    if (parsed) return parsed;
  }
  return null;
};

const resolveTrackName = (track: Record<string, unknown>): string => {
  return (
    resolveStringField(track, ["name", "title", "trackName", "displayName"]) ?? "track"
  );
};

const TRACK_WEIGHTS: Array<{
  pattern: RegExp;
  energy: number;
  density: number;
  brightness: number;
}> = [
  { pattern: /\b(kick|bd|drum|drums|perc|snare|hat|clap)\b/i, energy: 0.85, density: 0.75, brightness: 0.5 },
  { pattern: /\b(bass|sub)\b/i, energy: 0.8, density: 0.55, brightness: 0.25 },
  { pattern: /\b(lead|synth|arp)\b/i, energy: 0.65, density: 0.6, brightness: 0.75 },
  { pattern: /\b(pad|ambient|texture)\b/i, energy: 0.4, density: 0.35, brightness: 0.6 },
  { pattern: /\b(vocal|vox|voice)\b/i, energy: 0.6, density: 0.55, brightness: 0.8 },
  { pattern: /\b(fx|sfx|riser|sweep|impact)\b/i, energy: 0.55, density: 0.4, brightness: 0.6 },
];

const DEFAULT_TRACK_WEIGHT = { energy: 0.55, density: 0.5, brightness: 0.5 };

const resolveTrackWeights = (name: string) => {
  for (const entry of TRACK_WEIGHTS) {
    if (entry.pattern.test(name)) return entry;
  }
  return DEFAULT_TRACK_WEIGHT;
};

const resolveNoteCount = (clip: Record<string, unknown>): number => {
  const direct = resolveNumberField(clip, [
    "noteCount",
    "notesCount",
    "noteTotal",
    "notesTotal",
  ]);
  if (direct != null) return Math.max(0, Math.floor(direct));
  const arrays = [
    clip.notes,
    clip.midiNotes,
    clip.events,
    clip.noteEvents,
    (clip.notes as Record<string, unknown> | undefined)?.notes,
  ];
  for (const candidate of arrays) {
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
};

const resolveTicksPerBeat = (sources: Array<Record<string, unknown> | null | undefined>) => {
  for (const source of sources) {
    if (!source) continue;
    const value = resolveNumberField(source, ["ticksPerBeat", "ticksPerQuarter", "ppq"]);
    if (value && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
};

const normalizeBeatValue = (value: number, ticksPerBeat: number | null) => {
  if (!ticksPerBeat) return value;
  if (value >= ticksPerBeat * 2 && Number.isInteger(value / ticksPerBeat)) {
    return value / ticksPerBeat;
  }
  if (value >= ticksPerBeat * 4) {
    return value / ticksPerBeat;
  }
  return value;
};

const beatsToStartBar = (beats: number, beatsPerBar: number) =>
  Math.max(1, Math.floor(Math.max(0, beats) / beatsPerBar) + 1);

const beatsToEndBar = (beats: number, beatsPerBar: number) =>
  Math.max(1, Math.ceil(Math.max(0, beats) / beatsPerBar) + 1);

const resolveClipRange = (
  clip: Record<string, unknown>,
  beatsPerBar: number,
  ticksPerBeat: number | null,
) => {
  const startBar = resolveNumberField(clip, ["startBar", "barStart", "start_bar"]);
  const endBar = resolveNumberField(clip, ["endBar", "barEnd", "end_bar"]);
  if (startBar != null && endBar != null) {
    const start = Math.max(1, Math.floor(startBar));
    const end = Math.max(start + 1, Math.floor(endBar));
    return { startBar: start, endBar: end };
  }
  const bars = resolveNumberField(clip, ["bars", "lengthBars", "durationBars", "barLength"]);
  if (startBar != null && bars != null) {
    const start = Math.max(1, Math.floor(startBar));
    const span = Math.max(1, Math.floor(bars));
    return { startBar: start, endBar: start + span };
  }
  const startBeat = resolveNumberField(clip, ["startBeat", "beatStart", "start_beats"]);
  const endBeat = resolveNumberField(clip, ["endBeat", "beatEnd", "end_beats"]);
  if (startBeat != null && endBeat != null) {
    const normalizedStart = normalizeBeatValue(startBeat, ticksPerBeat);
    const normalizedEnd = normalizeBeatValue(endBeat, ticksPerBeat);
    const start = beatsToStartBar(normalizedStart, beatsPerBar);
    const end = Math.max(start + 1, beatsToEndBar(normalizedEnd, beatsPerBar));
    return { startBar: start, endBar: end };
  }
  const durationBeats = resolveNumberField(clip, [
    "durationBeats",
    "lengthBeats",
    "beats",
  ]);
  if (startBeat != null && durationBeats != null) {
    const normalizedStart = normalizeBeatValue(startBeat, ticksPerBeat);
    const normalizedDuration = normalizeBeatValue(durationBeats, ticksPerBeat);
    const start = beatsToStartBar(normalizedStart, beatsPerBar);
    const end = Math.max(
      start + 1,
      beatsToEndBar(normalizedStart + normalizedDuration, beatsPerBar),
    );
    return { startBar: start, endBar: end };
  }
  const start = resolveNumberField(clip, ["start"]);
  const end = resolveNumberField(clip, ["end"]);
  if (start != null && end != null) {
    const normalizedStart = normalizeBeatValue(start, ticksPerBeat);
    const normalizedEnd = normalizeBeatValue(end, ticksPerBeat);
    const startBarGuess = beatsToStartBar(normalizedStart, beatsPerBar);
    const endBarGuess = Math.max(
      startBarGuess + 1,
      beatsToEndBar(normalizedEnd, beatsPerBar),
    );
    return { startBar: startBarGuess, endBar: endBarGuess };
  }
  const duration = resolveNumberField(clip, ["length", "duration"]);
  if (start != null && duration != null) {
    const normalizedStart = normalizeBeatValue(start, ticksPerBeat);
    const normalizedDuration = normalizeBeatValue(duration, ticksPerBeat);
    const startBarGuess = beatsToStartBar(normalizedStart, beatsPerBar);
    const endBarGuess = Math.max(
      startBarGuess + 1,
      beatsToEndBar(normalizedStart + normalizedDuration, beatsPerBar),
    );
    return { startBar: startBarGuess, endBar: endBarGuess };
  }
  return null;
};

const collectClipCandidates = (track: Record<string, unknown>) => {
  const clips: Array<Record<string, unknown>> = [];
  const pushClip = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    if (record.clip && typeof record.clip === "object") {
      clips.push(record.clip as Record<string, unknown>);
      return;
    }
    clips.push(record);
  };
  const pushList = (items: unknown) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => pushClip(item));
  };
  pushList(track.clips);
  pushList(track.clipSlots);
  pushList(track.items);
  pushList(track.arrangementClips);
  const nested = track.arrangement ?? track.timeline ?? track.session;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    pushList(nestedRecord.clips);
    pushList(nestedRecord.items);
  }
  return clips;
};

const isTrackLike = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" ||
    Array.isArray(record.clips) ||
    Array.isArray(record.clipSlots) ||
    Array.isArray(record.items)
  );
};

const extractTrackList = (value: unknown): Array<Record<string, unknown>> | null => {
  if (Array.isArray(value)) {
    if (value.some((entry) => isTrackLike(entry))) {
      return value.filter((entry) => entry && typeof entry === "object") as Array<
        Record<string, unknown>
      >;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record.tracks ?? record.items ?? record.list;
    if (Array.isArray(nested) && nested.some((entry) => isTrackLike(entry))) {
      return nested.filter((entry) => entry && typeof entry === "object") as Array<
        Record<string, unknown>
      >;
    }
  }
  return null;
};

const resolveTrackList = (data: Record<string, unknown>) => {
  const candidates: Array<Array<Record<string, unknown>>> = [];
  const pushCandidate = (value: unknown) => {
    const list = extractTrackList(value);
    if (list?.length) candidates.push(list);
  };
  pushCandidate(data.tracks);
  pushCandidate(data.session);
  pushCandidate((data.session as Record<string, unknown> | undefined)?.tracks);
  pushCandidate(data.liveSet);
  pushCandidate((data.liveSet as Record<string, unknown> | undefined)?.tracks);
  pushCandidate(data.arrangement);
  pushCandidate((data.arrangement as Record<string, unknown> | undefined)?.tracks);
  pushCandidate(data.project);
  pushCandidate((data.project as Record<string, unknown> | undefined)?.tracks);
  pushCandidate(data.song);
  pushCandidate((data.song as Record<string, unknown> | undefined)?.tracks);
  if (!candidates.length) return [];
  const scored = candidates
    .map((list) => {
      let clipCount = 0;
      for (const track of list) {
        clipCount += collectClipCandidates(track).length;
      }
      return { list, score: list.length * 2 + clipCount };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.list ?? [];
};

const resolveMarkers = (
  data: Record<string, unknown>,
  beatsPerBar: number,
  ticksPerBeat: number | null,
) => {
  const markers: Array<{ name: string; startBar: number; bars?: number }> = [];
  const addMarkers = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const name =
        resolveStringField(record, ["name", "label", "title"]) ?? "section";
      const startBar = resolveNumberField(record, [
        "startBar",
        "bar",
        "barStart",
        "start_bar",
      ]);
      if (startBar != null) {
        const bars = resolveNumberField(record, ["bars", "lengthBars", "durationBars"]);
        markers.push({
          name,
          startBar: Math.max(1, Math.floor(startBar)),
          bars: bars != null ? Math.max(1, Math.floor(bars)) : undefined,
        });
        continue;
      }
      const startBeat = resolveNumberField(record, ["startBeat", "beat", "position"]);
      if (startBeat != null) {
        const normalizedStart = normalizeBeatValue(startBeat, ticksPerBeat);
        const bars = resolveNumberField(record, ["bars", "lengthBars", "durationBars"]);
        markers.push({
          name,
          startBar: beatsToStartBar(normalizedStart, beatsPerBar),
          bars: bars != null ? Math.max(1, Math.floor(bars)) : undefined,
        });
      }
    }
  };
  addMarkers(data.markers);
  addMarkers(data.locators);
  addMarkers(data.sections);
  const arrangement = data.arrangement as Record<string, unknown> | undefined;
  if (arrangement) {
    addMarkers(arrangement.markers);
    addMarkers(arrangement.locators);
    addMarkers(arrangement.sections);
  }
  const session = data.session as Record<string, unknown> | undefined;
  if (session) {
    addMarkers(session.markers);
    addMarkers(session.locators);
    addMarkers(session.sections);
  }
  return markers.sort((a, b) => a.startBar - b.startBar);
};

const buildSections = (
  markers: Array<{ name: string; startBar: number; bars?: number }>,
  maxBar: number,
) => {
  if (!markers.length) return [];
  const sections = [];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const next = markers[index + 1];
    const inferredBars =
      marker.bars ??
      (next ? Math.max(1, next.startBar - marker.startBar) : Math.max(1, maxBar + 1 - marker.startBar));
    if (inferredBars <= 0) continue;
    sections.push({
      name: marker.name,
      startBar: marker.startBar,
      bars: inferredBars,
    });
  }
  return sections;
};

const buildEnergyCurve = (energyByBar: number[], maxBar: number) => {
  const curve = [];
  const limit = Math.min(maxBar, energyByBar.length);
  for (let index = 0; index < limit; index += 1) {
    curve.push({ bar: index + 1, energy: clamp01(energyByBar[index] ?? 0) });
  }
  return curve;
};

const normalizeSeries = (
  raw: number[],
  counts: number[],
  fallback: number,
) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < raw.length; index += 1) {
    if (counts[index] <= 0) continue;
    min = Math.min(min, raw[index]);
    max = Math.max(max, raw[index]);
  }
  const range =
    Number.isFinite(min) && Number.isFinite(max) && max > min ? max - min : 0;
  return raw.map((value, index) => {
    if (counts[index] <= 0) return fallback;
    if (!range) return 0.5;
    return clamp01((value - min) / range);
  });
};

const buildWindows = (
  barWindows: BarWindow[],
  energyByBar: number[],
  densityByBar: number[],
  brightnessByBar: number[],
) => {
  const windows = [];
  for (const window of barWindows) {
    const startBar = Math.max(1, Math.floor(window.startBar));
    const bars = Math.max(1, Math.floor(window.endBar - window.startBar));
    const startIndex = Math.max(0, startBar - 1);
    const endIndex = Math.min(energyByBar.length, startIndex + bars);
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
    windows.push({
      startBar,
      bars,
      energy: clamp01(sumEnergy / denom),
      density: clamp01(sumDensity / denom),
      brightness: clamp01(sumBrightness / denom),
    });
  }
  return windows;
};

const analyzeAbletonData = (
  record: KnowledgeFileRecord,
  data: Record<string, unknown>,
  options: {
    barWindows: BarWindow[];
    tempo?: TempoMeta | null;
    trackName?: string;
    trackId?: string;
  },
): AbletonCandidate => {
  const metaCandidates = [
    data,
    data.meta as Record<string, unknown> | undefined,
    data.metadata as Record<string, unknown> | undefined,
    data.global as Record<string, unknown> | undefined,
    data.song as Record<string, unknown> | undefined,
    data.project as Record<string, unknown> | undefined,
    data.liveSet as Record<string, unknown> | undefined,
    data.session as Record<string, unknown> | undefined,
  ].filter(Boolean) as Array<Record<string, unknown>>;

  let timeSigValue: unknown = options.tempo?.timeSig;
  let key: string | null = null;
  let trackMetaName: string | null = null;
  let trackMetaId: string | null = null;
  let keyConfidence: number | null = null;

  for (const meta of metaCandidates) {
    if (timeSigValue == null) {
      timeSigValue =
        meta.timeSig ??
        meta.timeSignature ??
        meta.signature ??
        meta.meter ??
        timeSigValue;
    }
    if (!key) {
      key =
        resolveKeyFromMeta(meta.key) ??
        resolveKeyFromMeta(meta.keySignature) ??
        resolveKeyFromMeta(meta.tonality) ??
        resolveKeyFromMeta(meta.scale) ??
        key;
    }
    if (!trackMetaName) {
      trackMetaName =
        resolveStringField(meta, ["trackName", "name", "title"]) ?? trackMetaName;
    }
    if (!trackMetaId) {
      trackMetaId = resolveStringField(meta, ["trackId", "id"]) ?? trackMetaId;
    }
  }

  if (keyConfidence == null) {
    keyConfidence = resolveKeyConfidence(metaCandidates);
  }

  if (!key) {
    const nameKey = resolveKeyFromName(record.name);
    if (nameKey) {
      key = nameKey;
    }
  }

  const timeSig = parseTimeSig(timeSigValue);
  const beatsPerBar = timeSig.beatsPerBar;
  const ticksPerBeat = resolveTicksPerBeat(metaCandidates);
  const tempoValue = resolveTempoValue(metaCandidates) ?? options.tempo?.bpm ?? null;

  const tracks = resolveTrackList(data);
  let clipCount = 0;
  let maxClipBar = 0;
  const energyRaw: number[] = [];
  const densityRaw: number[] = [];
  const brightnessRaw: number[] = [];
  const counts: number[] = [];

  const barWindows = options.barWindows ?? [];
  const maxWindowBar = barWindows.length
    ? Math.max(
        ...barWindows.map((window) => Math.max(1, Math.floor(window.endBar - 1))),
      )
    : 1;

  for (const track of tracks) {
    const trackName = resolveTrackName(track);
    const weights = resolveTrackWeights(trackName);
    const clips = collectClipCandidates(track);
    for (const clip of clips) {
      const range = resolveClipRange(clip, beatsPerBar, ticksPerBeat);
      if (!range) continue;
      clipCount += 1;
      const startBar = Math.max(1, Math.floor(range.startBar));
      const endBar = Math.max(startBar + 1, Math.floor(range.endBar));
      if (startBar > MAX_BARS) continue;
      const clampedEnd = Math.min(MAX_BARS + 1, endBar);
      maxClipBar = Math.max(maxClipBar, clampedEnd - 1);
      const bars = Math.max(1, clampedEnd - startBar);
      const noteCount = resolveNoteCount(clip);
      const noteIntensity = clamp01(noteCount / Math.max(1, bars * 8));
      const energy = clamp01(weights.energy + noteIntensity * 0.25);
      const density = clamp01(weights.density + noteIntensity * 0.35);
      const brightness = clamp01(weights.brightness + noteIntensity * 0.15);
      for (let bar = startBar; bar < clampedEnd; bar += 1) {
        const idx = bar - 1;
        energyRaw[idx] = (energyRaw[idx] ?? 0) + energy;
        densityRaw[idx] = (densityRaw[idx] ?? 0) + density;
        brightnessRaw[idx] = (brightnessRaw[idx] ?? 0) + brightness;
        counts[idx] = (counts[idx] ?? 0) + 1;
      }
    }
  }

  const markers = resolveMarkers(data, beatsPerBar, ticksPerBeat);
  const maxMarkerBar = markers.length
    ? Math.max(...markers.map((marker) => marker.startBar + (marker.bars ?? 0)))
    : 0;
  const maxBar = Math.max(1, maxWindowBar, maxClipBar, maxMarkerBar);
  const cappedMaxBar = Math.min(MAX_BARS, maxBar);
  const tempoMap = resolveTempoMap(data);
  const tempoByBar = buildTempoByBar(cappedMaxBar, tempoMap, tempoValue);
  const chromaByBar = normalizeChromaByBar(
    (data.chromaByBar ??
      data.chroma ??
      (data.analysis as Record<string, unknown> | undefined)?.chromaByBar) as unknown,
    cappedMaxBar,
  );

  const hasClipSignal = clipCount > 0;
  const sections = buildSections(markers, cappedMaxBar);
  let analysis: PlanAnalysis | null = null;

  if (hasClipSignal) {
    const rawEnergy = Array.from(
      { length: cappedMaxBar },
      (_, index) => energyRaw[index] ?? 0,
    );
    const rawDensity = Array.from(
      { length: cappedMaxBar },
      (_, index) => densityRaw[index] ?? 0,
    );
    const rawBrightness = Array.from(
      { length: cappedMaxBar },
      (_, index) => brightnessRaw[index] ?? 0,
    );
    const rawCounts = Array.from(
      { length: cappedMaxBar },
      (_, index) => counts[index] ?? 0,
    );
    const energyByBar = normalizeSeries(rawEnergy, rawCounts, 0.45);
    const densityByBar = normalizeSeries(rawDensity, rawCounts, 0.45);
    const brightnessByBar = normalizeSeries(rawBrightness, rawCounts, 0.5);
    const onsetDensityByBar = densityByBar.map((value) => clamp01(value));
    const silenceByBar = energyByBar.map((value) => (value <= 0.08 ? 1 : 0));
    const centroidByBar = brightnessByBar.map((value) => clamp01(value));
    const rolloffByBar = brightnessByBar.map((value) =>
      clamp01(value * 0.9 + 0.05),
    );
    const dynamicRangeByBar = energyByBar.map((value) => clamp01(value * 0.8));
    const crestFactorByBar = energyByBar.map((value) => clamp01(value * 1.4));
    const windows = buildWindows(barWindows, energyByBar, densityByBar, brightnessByBar);
    const energyCurve = buildEnergyCurve(energyByBar, cappedMaxBar);
    analysis = {
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
      energyCurve,
      ...(sections.length ? { sections } : {}),
      ...(chromaByBar ? { chromaByBar } : {}),
      ...(keyConfidence != null ? { keyConfidence } : {}),
    };
  } else if (sections.length) {
    analysis = {
      sections,
      tempoByBar,
      ...(chromaByBar ? { chromaByBar } : {}),
      ...(keyConfidence != null ? { keyConfidence } : {}),
    };
  }

  const trackHint = options.trackName ?? trackMetaName ?? "";
  const trackIdHint = options.trackId ?? trackMetaId ?? "";
  const lowerName = record.name.toLowerCase();
  const matchName = trackHint ? trackHint.toLowerCase() : "";
  const matchId = trackIdHint ? trackIdHint.toLowerCase() : "";
  let matchScore = 0;
  if (matchName) {
    if (lowerName === matchName) matchScore += 8;
    else if (lowerName.includes(matchName)) matchScore += 5;
  }
  if (matchId) {
    if (lowerName.includes(matchId)) matchScore += 4;
  }
  const signalScore =
    Math.min(20, clipCount) +
    Math.min(8, tracks.length * 2) +
    (sections.length ? 6 : 0) +
    (key ? 3 : 0);
  const score = signalScore + matchScore;

  return {
    analysis,
    key: key ?? undefined,
    score,
  };
};

export async function resolveAbletonPlanFeatures(options: {
  knowledgeFileIds?: string[];
  trackId?: string;
  trackName?: string;
  barWindows: BarWindow[];
  tempo?: TempoMeta | null;
}): Promise<AbletonPlanFeatures | null> {
  try {
    const ids = (options.knowledgeFileIds ?? []).filter(
      (id) => typeof id === "string",
    );
    if (!ids.length) return null;
    const idSet = new Set(ids);
    const files = await listKnowledgeFiles();
    const candidates = files.filter((file) => idSet.has(file.id));
    if (!candidates.length) return null;

    const analyses: AbletonCandidate[] = [];
    for (const record of candidates) {
      const parsed = await parseJsonRecord(record);
      if (!parsed || typeof parsed !== "object") continue;
      const result = analyzeAbletonData(record, parsed as Record<string, unknown>, {
        barWindows: options.barWindows,
        tempo: options.tempo ?? null,
        trackName: options.trackName,
        trackId: options.trackId,
      });
      if (result.analysis || result.key) {
        analyses.push(result);
      }
    }

    if (!analyses.length) return null;
    analyses.sort((a, b) => b.score - a.score);
    const best = analyses[0];
    if (!best) return null;
    return {
      analysis: best.analysis,
      key: best.key,
    };
  } catch {
    return null;
  }
}
