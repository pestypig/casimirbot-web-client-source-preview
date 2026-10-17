import type { MidiMotif, MidiNote } from "@/types/noise-gens";

type MidiNoteInput = {
  startBeat?: number;
  start?: number;
  beat?: number;
  time?: number;
  t?: number;
  durationBeats?: number;
  duration?: number;
  length?: number;
  len?: number;
  beats?: number;
  pitch?: number | string;
  note?: number | string;
  midi?: number | string;
  velocity?: number;
  vel?: number;
  v?: number;
};

type MidiMotifInput = {
  id?: string;
  name?: string;
  bars?: number;
  lengthBars?: number;
  loopBars?: number;
  lengthBeats?: number;
  beats?: number;
  loopBeats?: number;
  bpm?: number;
  tempo?: number;
  timeSig?: string;
  swing?: number;
  quantize?: string | number;
  quantizeGrid?: string | number;
  grid?: string | number;
  quantizeSwing?: number;
  arp?: unknown;
  arpeggiator?: unknown;
  synth?: unknown;
  sound?: unknown;
  sampler?: unknown;
  sample?: unknown;
  notes?: MidiNoteInput[];
  events?: MidiNoteInput[];
  motif?: unknown;
};

type MidiMotifPayload = MidiMotifInput | MidiNoteInput[];

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const NOTE_MAP: Record<string, number> = {
  C: 0,
  "C#": 1,
  DB: 1,
  D: 2,
  "D#": 3,
  EB: 3,
  E: 4,
  F: 5,
  "F#": 6,
  GB: 6,
  G: 7,
  "G#": 8,
  AB: 8,
  A: 9,
  "A#": 10,
  BB: 10,
  B: 11,
};

const parsePitch = (value: unknown): number | null => {
  const numeric = toNumber(value);
  if (numeric != null) {
    return clamp(Math.round(numeric), 0, 127);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;
  const [, baseRaw, accidentalRaw, octaveRaw] = match;
  const base = baseRaw.toUpperCase();
  const accidental = accidentalRaw ? accidentalRaw.toUpperCase() : "";
  const octave = Number(octaveRaw);
  if (!Number.isFinite(octave)) return null;
  const key = `${base}${accidental}`;
  const semitone = NOTE_MAP[key];
  if (semitone == null) return null;
  const midi = (octave + 1) * 12 + semitone;
  return clamp(Math.round(midi), 0, 127);
};

const parseNote = (note: MidiNoteInput): MidiNote | null => {
  const pitch =
    parsePitch(note.pitch ?? note.note ?? note.midi ?? null) ?? null;
  if (pitch == null) return null;
  const start =
    toNumber(
      note.startBeat ??
        note.start ??
        note.beat ??
        note.time ??
        note.t ??
        0,
    ) ?? 0;
  const duration =
    toNumber(
      note.durationBeats ??
        note.duration ??
        note.length ??
        note.len ??
        note.beats ??
        1,
    ) ?? 1;
  const velocity = toNumber(note.velocity ?? note.vel ?? note.v ?? 0.8);
  if (!Number.isFinite(start) || !Number.isFinite(duration)) return null;
  const safeDuration = Math.max(0.01, duration);
  return {
    startBeat: Math.max(0, start),
    durationBeats: safeDuration,
    pitch,
    velocity: velocity != null ? clamp01(velocity) : undefined,
  };
};

const normalizeArp = (value: unknown): MidiMotif["arp"] | undefined => {
  if (!isRecord(value)) return undefined;
  const modeRaw = typeof value.mode === "string" ? value.mode.toLowerCase() : "";
  const mode =
    modeRaw === "down" || modeRaw === "updown" || modeRaw === "up"
      ? (modeRaw as NonNullable<MidiMotif["arp"]>["mode"])
      : undefined;
  const rate =
    typeof value.rate === "string" || typeof value.rate === "number"
      ? value.rate
      : undefined;
  const gate = toNumber(value.gate ?? value.gatePct ?? value.gatePercent);
  const octaves = toNumber(value.octaves ?? value.octaveSpan ?? value.octave);
  return {
    ...(mode ? { mode } : {}),
    ...(rate != null ? { rate } : {}),
    ...(gate != null ? { gate } : {}),
    ...(octaves != null ? { octaves } : {}),
  };
};

const normalizeSynth = (value: unknown): MidiMotif["synth"] | undefined => {
  if (!isRecord(value)) return undefined;
  const waveform =
    typeof value.waveform === "string"
      ? (value.waveform.toLowerCase() as NonNullable<MidiMotif["synth"]>["waveform"])
      : undefined;
  const detune = toNumber(value.detune);
  const attackMs = toNumber(value.attackMs ?? value.attack);
  const decayMs = toNumber(value.decayMs ?? value.decay);
  const sustain = toNumber(value.sustain);
  const releaseMs = toNumber(value.releaseMs ?? value.release);
  const gain = toNumber(value.gain ?? value.level ?? value.volume);
  return {
    ...(waveform ? { waveform } : {}),
    ...(detune != null ? { detune } : {}),
    ...(attackMs != null ? { attackMs } : {}),
    ...(decayMs != null ? { decayMs } : {}),
    ...(sustain != null ? { sustain } : {}),
    ...(releaseMs != null ? { releaseMs } : {}),
    ...(gain != null ? { gain } : {}),
  };
};

const normalizeSamplerMapEntry = (
  value: unknown,
): NonNullable<NonNullable<MidiMotif["sampler"]>["map"]>[number] | null => {
  if (!isRecord(value)) return null;
  const note = parsePitch(value.note ?? value.pitch ?? value.midi ?? null);
  const sourceId =
    typeof value.sourceId === "string"
      ? value.sourceId
      : typeof value.id === "string"
        ? value.id
        : typeof value.sample === "string"
          ? value.sample
          : null;
  if (note == null || !sourceId) return null;
  const rootNote = parsePitch(value.rootNote ?? value.root ?? null) ?? undefined;
  const gain = toNumber(value.gain ?? value.level ?? value.volume) ?? undefined;
  const startMs = toNumber(value.startMs ?? value.start) ?? undefined;
  const endMs = toNumber(value.endMs ?? value.end) ?? undefined;
  return {
    note,
    sourceId,
    ...(rootNote != null ? { rootNote } : {}),
    ...(gain != null ? { gain } : {}),
    ...(startMs != null ? { startMs } : {}),
    ...(endMs != null ? { endMs } : {}),
  };
};

const normalizeSampler = (value: unknown): MidiMotif["sampler"] | undefined => {
  if (!isRecord(value)) return undefined;
  const modeRaw = typeof value.mode === "string" ? value.mode.toLowerCase() : "";
  const mode = modeRaw === "multi" ? "multi" : "single";
  const sourceId =
    typeof value.sourceId === "string"
      ? value.sourceId
      : typeof value.id === "string"
        ? value.id
        : undefined;
  const rootNote = parsePitch(value.rootNote ?? value.root ?? null) ?? undefined;
  const gain = toNumber(value.gain ?? value.level ?? value.volume) ?? undefined;
  const attackMs = toNumber(value.attackMs ?? value.attack) ?? undefined;
  const releaseMs = toNumber(value.releaseMs ?? value.release) ?? undefined;
  const startMs = toNumber(value.startMs ?? value.start) ?? undefined;
  const endMs = toNumber(value.endMs ?? value.end) ?? undefined;
  const mapRaw = Array.isArray(value.map) ? value.map : [];
  const map = mapRaw
    .map(normalizeSamplerMapEntry)
    .filter(Boolean) as NonNullable<NonNullable<MidiMotif["sampler"]>["map"]>;
  if (!sourceId && map.length === 0) return undefined;
  return {
    mode: map.length > 0 ? "multi" : mode,
    ...(sourceId ? { sourceId } : {}),
    ...(rootNote != null ? { rootNote } : {}),
    ...(gain != null ? { gain } : {}),
    ...(attackMs != null ? { attackMs } : {}),
    ...(releaseMs != null ? { releaseMs } : {}),
    ...(startMs != null ? { startMs } : {}),
    ...(endMs != null ? { endMs } : {}),
    ...(map.length ? { map } : {}),
  };
};

export const normalizeMidiMotifPayload = (
  payload: unknown,
  fallbackName?: string,
): MidiMotif | null => {
  const rawPayload = payload as MidiMotifPayload | null;
  if (!rawPayload) return null;

  let source: MidiMotifInput | null = null;
  if (Array.isArray(rawPayload)) {
    source = { notes: rawPayload };
  } else if (isRecord(rawPayload)) {
    const motifCandidate = rawPayload.motif;
    if (motifCandidate && (Array.isArray(motifCandidate) || isRecord(motifCandidate))) {
      source = Array.isArray(motifCandidate)
        ? { notes: motifCandidate as MidiNoteInput[] }
        : (motifCandidate as MidiMotifInput);
    } else {
      source = rawPayload as MidiMotifInput;
    }
  }

  if (!source) return null;
  const notesInput =
    source.notes ??
    source.events ??
    (Array.isArray(payload) ? (payload as MidiNoteInput[]) : null);
  if (!Array.isArray(notesInput)) return null;
  const notes = notesInput.map(parseNote).filter(Boolean) as MidiNote[];
  if (notes.length === 0) return null;
  notes.sort(
    (a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch,
  );

  const bars =
    toNumber(source.bars ?? source.lengthBars ?? source.loopBars) ?? undefined;
  const lengthBeats =
    toNumber(source.lengthBeats ?? source.loopBeats ?? source.beats) ?? undefined;
  const bpm = toNumber(source.bpm ?? source.tempo) ?? undefined;
  const timeSig =
    typeof source.timeSig === "string" && /^\d+\/\d+$/.test(source.timeSig)
      ? (source.timeSig as MidiMotif["timeSig"])
      : undefined;
  const quantize =
    typeof source.quantize === "string" || typeof source.quantize === "number"
      ? source.quantize
      : typeof source.quantizeGrid === "string" || typeof source.quantizeGrid === "number"
        ? source.quantizeGrid
        : typeof source.grid === "string" || typeof source.grid === "number"
          ? source.grid
          : undefined;
  const swing =
    toNumber(source.swing ?? source.quantizeSwing) ?? undefined;

  const arp = normalizeArp(source.arp ?? source.arpeggiator);
  const synth = normalizeSynth(source.synth ?? source.sound);
  const sampler = normalizeSampler(source.sampler ?? source.sample);

  return {
    id: typeof source.id === "string" ? source.id : undefined,
    name: typeof source.name === "string" ? source.name : fallbackName,
    bars: bars != null ? Math.max(1, bars) : undefined,
    lengthBeats: lengthBeats != null ? Math.max(0.25, lengthBeats) : undefined,
    bpm: bpm != null ? clamp(bpm, 40, 240) : undefined,
    timeSig,
    swing: swing != null ? clamp01(swing) : undefined,
    quantize,
    arp,
    synth,
    ...(sampler ? { sampler } : {}),
    notes,
  };
};
