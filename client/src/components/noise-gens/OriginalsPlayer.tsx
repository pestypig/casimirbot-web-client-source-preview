import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Copy,
  Info,
  Loader2,
  MessageCircle,
  Pause,
  PencilLine,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIdeology } from "@/hooks/use-ideology";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { useToast } from "@/hooks/use-toast";
import {
  fetchOriginalDetails,
  fetchRecipes,
  fetchStemPack,
  saveRecipe,
  updateOriginalIntentContract,
  updateOriginalLyrics,
} from "@/lib/api/noiseGens";
import type {
  CoverJobRequest,
  IntentContract,
  ListenerMacros,
  ListenerMacroLocks,
  MoodPreset,
  EditionReceipt,
  Original,
  OriginalDetails,
  JobStatus,
  PulseSource,
  NoisegenRecipe,
  RenderPlan,
  StemGroup,
  StemGroupSource,
  StemPack,
  TempoMeta,
  TimeSkyMeta,
} from "@/types/noise-gens";
import { cn } from "@/lib/utils";
import { releaseAudioFocus, requestAudioFocus } from "@/lib/audio-focus";

type PlayerSource = {
  id: string;
  url: string;
  label: string;
  bytes?: number;
  mime?: string;
};

type SourceMode = "playback" | "fallback" | null;

type SourceHandle = {
  id: string;
  source: AudioBufferSourceNode;
};

type RemixStatus = "idle" | "loading" | "ready" | "active" | "error";

type StemGroupPlayback = StemGroup & {
  gain: number;
  source: StemGroupSource;
};

type MeaningCard = {
  nodeId: string;
  nodeTitle: string;
  nodePath: string;
  confidence: "High" | "Medium" | "Low";
  lyricQuote: string;
  parallel: string;
  why: string;
  reasonPath: string;
  lineIndices: number[];
};

type IntentRangeKey =
  | "sampleInfluence"
  | "styleInfluence"
  | "weirdness"
  | "reverbSend"
  | "chorus";

type IntentContractRangeDraft = { min: string; max: string };

type IntentContractDraft = {
  enabled: boolean;
  tempoBpm: string;
  timeSig: string;
  key: string;
  grooveTemplateIds: string;
  motifIds: string;
  stemLocks: string;
  arrangementMoves: string;
  ideologyRootId: string;
  allowedNodeIds: string;
  storeTimeSky: boolean;
  storePulse: boolean;
  pulseSource: PulseSource;
  placePrecision: "exact" | "approximate" | "hidden";
  notes: string;
  ranges: Record<IntentRangeKey, IntentContractRangeDraft>;
};

const INTENT_RANGE_FIELDS: Array<{ key: IntentRangeKey; label: string }> = [
  { key: "sampleInfluence", label: "Sample influence" },
  { key: "styleInfluence", label: "Style influence" },
  { key: "weirdness", label: "Weirdness" },
  { key: "reverbSend", label: "Reverb send" },
  { key: "chorus", label: "Chorus" },
];

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

type MacroEqPoint = { freq: number; q: number; gainDb: number };

type MacroFxProfile = {
  eq: MacroEqPoint[];
  reverbSend: number;
  drive: number;
  energy: number;
};

type MacroFxChain = {
  input: GainNode;
  output: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  drive: GainNode;
  shaper: WaveShaperNode;
  reverbSend: GainNode;
  reverbReturn: GainNode;
  convolver: ConvolverNode;
};

const buildMacroFxProfile = (macros: ListenerMacros): MacroFxProfile => {
  const energy = clamp01(macros.energy);
  const space = clamp01(macros.space);
  const texture = clamp01(macros.texture);
  const drive = clamp01(macros.drive ?? 0.3);
  return {
    eq: [
      { freq: 110, q: 0.9, gainDb: -5 + drive * 3 },
      { freq: 820, q: 1.1, gainDb: -2 + texture * 4 },
      { freq: 5200, q: 0.8, gainDb: -1 + texture * 6 },
    ],
    reverbSend: clamp01(space * 0.8),
    drive: clamp01(0.15 + drive * 0.6),
    energy,
  };
};

const buildImpulseResponse = (
  ctx: AudioContext,
  durationSec = 1.2,
  decay = 2.5,
): AudioBuffer => {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
};

const buildSaturationCurve = (amount: number, samples = 1024): Float32Array => {
  const curve = new Float32Array(samples);
  const k = 1 + amount * 20;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(k * x);
  }
  return curve;
};

const createMacroFxChain = (ctx: AudioContext): MacroFxChain => {
  const input = ctx.createGain();
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 110;
  low.Q.value = 0.9;
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 820;
  mid.Q.value = 1.1;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 5200;
  high.Q.value = 0.8;
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = "2x";
  const output = ctx.createGain();
  input.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(drive);
  drive.connect(shaper);
  shaper.connect(output);

  const reverbSend = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = buildImpulseResponse(ctx);
  const reverbReturn = ctx.createGain();
  shaper.connect(reverbSend);
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(output);

  return {
    input,
    output,
    low,
    mid,
    high,
    drive,
    shaper,
    reverbSend,
    reverbReturn,
    convolver,
  };
};

const applyMacroFxProfile = (
  chain: MacroFxChain,
  profile: MacroFxProfile,
  ctx: AudioContext,
) => {
  const [low, mid, high] = profile.eq;
  chain.low.frequency.setTargetAtTime(low.freq, ctx.currentTime, 0.05);
  chain.low.Q.setTargetAtTime(low.q, ctx.currentTime, 0.05);
  chain.low.gain.setTargetAtTime(low.gainDb, ctx.currentTime, 0.05);
  chain.mid.frequency.setTargetAtTime(mid.freq, ctx.currentTime, 0.05);
  chain.mid.Q.setTargetAtTime(mid.q, ctx.currentTime, 0.05);
  chain.mid.gain.setTargetAtTime(mid.gainDb, ctx.currentTime, 0.05);
  chain.high.frequency.setTargetAtTime(high.freq, ctx.currentTime, 0.05);
  chain.high.Q.setTargetAtTime(high.q, ctx.currentTime, 0.05);
  chain.high.gain.setTargetAtTime(high.gainDb, ctx.currentTime, 0.05);

  chain.drive.gain.setTargetAtTime(
    clamp(0.7 + profile.drive * 1.2, 0.5, 2),
    ctx.currentTime,
    0.05,
  );
  chain.shaper.curve = buildSaturationCurve(profile.drive);
  chain.reverbSend.gain.setTargetAtTime(
    clamp(profile.reverbSend * 0.6, 0, 0.8),
    ctx.currentTime,
    0.08,
  );
  chain.output.gain.setTargetAtTime(
    clamp(0.85 + profile.energy * 0.3, 0.7, 1.2),
    ctx.currentTime,
    0.08,
  );
};

const DEFAULT_INTENT_TIME_SIG = "4/4";

const formatCsvList = (list?: string[]): string =>
  list && list.length ? list.join(", ") : "";

const parseCsvList = (value: string): string[] | undefined => {
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : undefined;
};

const parseOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
};

const buildRangeDraft = (range?: { min: number; max: number }): IntentContractRangeDraft => ({
  min: range && Number.isFinite(range.min) ? range.min.toFixed(2) : "",
  max: range && Number.isFinite(range.max) ? range.max.toFixed(2) : "",
});

const parseRangeDraft = (
  range: IntentContractRangeDraft,
): { min: number; max: number } | undefined => {
  const minValue = parseOptionalNumber(range.min);
  const maxValue = parseOptionalNumber(range.max);
  if (minValue == null && maxValue == null) return undefined;
  const resolvedMin = clamp01(minValue ?? (maxValue ?? 0));
  const resolvedMax = clamp01(maxValue ?? (minValue ?? 0));
  return resolvedMax >= resolvedMin
    ? { min: resolvedMin, max: resolvedMax }
    : { min: resolvedMax, max: resolvedMin };
};

const buildIntentContractDraft = (
  contract?: IntentContract,
  tempo?: TempoMeta,
): IntentContractDraft => ({
  enabled: Boolean(contract),
  tempoBpm:
    contract?.invariants?.tempoBpm != null
      ? String(contract.invariants.tempoBpm)
      : tempo?.bpm != null
        ? String(tempo.bpm)
        : "",
  timeSig:
    contract?.invariants?.timeSig ??
    tempo?.timeSig ??
    DEFAULT_INTENT_TIME_SIG,
  key: contract?.invariants?.key ?? "",
  grooveTemplateIds: formatCsvList(contract?.invariants?.grooveTemplateIds),
  motifIds: formatCsvList(contract?.invariants?.motifIds),
  stemLocks: formatCsvList(contract?.invariants?.stemLocks),
  arrangementMoves: formatCsvList(contract?.ranges?.arrangementMoves),
  ideologyRootId: contract?.meaning?.ideologyRootId ?? "",
  allowedNodeIds: formatCsvList(contract?.meaning?.allowedNodeIds),
  storeTimeSky: Boolean(contract?.provenancePolicy?.storeTimeSky),
  storePulse: Boolean(contract?.provenancePolicy?.storePulse),
  pulseSource: contract?.provenancePolicy?.pulseSource ?? "drand",
  placePrecision: contract?.provenancePolicy?.placePrecision ?? "approximate",
  notes: contract?.notes ?? "",
  ranges: {
    sampleInfluence: buildRangeDraft(contract?.ranges?.sampleInfluence),
    styleInfluence: buildRangeDraft(contract?.ranges?.styleInfluence),
    weirdness: buildRangeDraft(contract?.ranges?.weirdness),
    reverbSend: buildRangeDraft(contract?.ranges?.reverbSend),
    chorus: buildRangeDraft(contract?.ranges?.chorus),
  },
});

const buildIntentContractFromDraft = (
  draft: IntentContractDraft,
  existing?: IntentContract,
): IntentContract | null => {
  if (!draft.enabled) return null;
  const now = Date.now();
  const invariants: NonNullable<IntentContract["invariants"]> = {};
  const tempoBpm = parseOptionalNumber(draft.tempoBpm);
  if (tempoBpm != null) invariants.tempoBpm = tempoBpm;
  const timeSig = draft.timeSig.trim();
  if (/^\d+\/\d+$/.test(timeSig)) {
    invariants.timeSig = timeSig as TempoMeta["timeSig"];
  }
  const key = draft.key.trim();
  if (key) invariants.key = key;
  const grooveTemplateIds = parseCsvList(draft.grooveTemplateIds);
  if (grooveTemplateIds) invariants.grooveTemplateIds = grooveTemplateIds;
  const motifIds = parseCsvList(draft.motifIds);
  if (motifIds) invariants.motifIds = motifIds;
  const stemLocks = parseCsvList(draft.stemLocks);
  if (stemLocks) invariants.stemLocks = stemLocks;
  const resolvedInvariants =
    Object.keys(invariants).length > 0 ? invariants : undefined;

  const ranges: NonNullable<IntentContract["ranges"]> = {};
  for (const field of INTENT_RANGE_FIELDS) {
    const rangeValue = parseRangeDraft(draft.ranges[field.key]);
    if (rangeValue) {
      ranges[field.key] = rangeValue;
    }
  }
  const arrangementMoves = parseCsvList(draft.arrangementMoves);
  if (arrangementMoves) ranges.arrangementMoves = arrangementMoves;
  const resolvedRanges = Object.keys(ranges).length > 0 ? ranges : undefined;

  const meaning: NonNullable<IntentContract["meaning"]> = {};
  const ideologyRootId = draft.ideologyRootId.trim();
  if (ideologyRootId) meaning.ideologyRootId = ideologyRootId;
  const allowedNodeIds = parseCsvList(draft.allowedNodeIds);
  if (allowedNodeIds) meaning.allowedNodeIds = allowedNodeIds;
  const resolvedMeaning = Object.keys(meaning).length > 0 ? meaning : undefined;

  const provenance: NonNullable<IntentContract["provenancePolicy"]> = {};
  if (draft.storeTimeSky) provenance.storeTimeSky = true;
  if (draft.storePulse) {
    provenance.storePulse = true;
    provenance.pulseSource = draft.pulseSource;
  }
  if (draft.placePrecision) {
    provenance.placePrecision = draft.placePrecision;
  }
  const resolvedProvenance =
    Object.keys(provenance).length > 0 ? provenance : undefined;

  const notes = draft.notes.trim();

  return {
    version: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(resolvedInvariants ? { invariants: resolvedInvariants } : {}),
    ...(resolvedRanges ? { ranges: resolvedRanges } : {}),
    ...(resolvedMeaning ? { meaning: resolvedMeaning } : {}),
    ...(resolvedProvenance ? { provenancePolicy: resolvedProvenance } : {}),
    ...(notes ? { notes } : {}),
  };
};

const MACROS_STORAGE_KEY = "noisegen:listenerMacros.v2";
const MEANING_CACHE_PREFIX = "noisegen:meaning:v2";
const FAIRNESS_BASELINE_IDS = [
  "worldview-integrity",
  "integrity-protocols",
  "verification-checklist",
  "right-speech-infrastructure",
  "interbeing-systems",
  "jurisdictional-floor",
  "stewardship-ledger",
];

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRng = (seed: number) => {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickWeighted = <T,>(
  items: Array<{ item: T; weight: number }>,
  rng: () => number,
): T | null => {
  if (!items.length) return null;
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return items[0]?.item ?? null;
  let roll = rng() * total;
  for (const entry of items) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.item;
  }
  return items[items.length - 1]?.item ?? null;
};

const formatPulseSource = (source?: PulseSource): string => {
  switch (source) {
    case "drand":
      return "drand beacon";
    case "nist-beacon":
      return "NIST beacon";
    case "curby":
      return "CURBy beacon";
    case "local-sky-photons":
      return "Local sky photons";
    default:
      return "Unspecified";
  }
};

const resolveTimeSkyContext = (timeSky?: TimeSkyMeta) => {
  const context = timeSky?.context;
  return {
    publishedAt: context?.publishedAt ?? timeSky?.publishedAt,
    composedStart: context?.composedStart ?? timeSky?.composedStart,
    composedEnd: context?.composedEnd ?? timeSky?.composedEnd,
    timezone: context?.timezone,
    place: context?.place ?? timeSky?.place,
    placePrecision: context?.placePrecision ?? "approximate",
    halobankSpanId: context?.halobankSpanId,
    skySignature: context?.skySignature ?? timeSky?.skySignature,
  };
};

const resolveTimeSkyPulse = (timeSky?: TimeSkyMeta) => {
  const pulse = timeSky?.pulse;
  const round = pulse?.round ?? timeSky?.pulseRound;
  const pulseTime = pulse?.pulseTime;
  const valueHash = pulse?.valueHash ?? timeSky?.pulseHash;
  const source =
    pulse?.source ??
    (round != null || pulseTime != null || valueHash ? "drand" : undefined);
  return {
    source,
    round,
    pulseTime,
    valueHash,
    seedSalt: pulse?.seedSalt,
  };
};

const buildPulseSeed = (options: {
  originalId?: string;
  timeSky?: TimeSkyMeta;
}) => {
  const originalId = options.originalId;
  if (!originalId || !options.timeSky) {
    return {};
  }
  const context = resolveTimeSkyContext(options.timeSky);
  const pulse = resolveTimeSkyPulse(options.timeSky);
  const pulseKey = pulse.round ?? pulse.pulseTime;
  if (pulseKey == null || !pulse.valueHash) {
    return {};
  }
  const placeSeed =
    context.placePrecision === "hidden"
      ? "hidden"
      : (context.place ?? "").trim();
  const publishedAt =
    context.publishedAt != null ? String(context.publishedAt) : "";
  const seedMaterial = `${originalId}|${publishedAt}|${placeSeed}|${pulseKey}|${pulse.valueHash}`;
  const seedSalt = pulse.seedSalt ?? hashString(seedMaterial);
  const seed = hashSeed(seedMaterial);
  return { seed, seedSalt, seedMaterial };
};

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatTimestamp = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatHashShort = (value?: string) =>
  value && value.length > 10 ? `${value.slice(0, 8)}…` : value ?? "--";

const formatPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(clamp01(value) * 100)}%`
    : "--";

const formatIsoDate = (value?: number): string | null => {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const formatYearMonth = (value?: number): string | null => {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

const formatYearMonthRange = (start?: number, end?: number): string | null => {
  const startLabel = formatYearMonth(start);
  const endLabel = formatYearMonth(end);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} -> ${endLabel}`;
  }
  return startLabel ?? endLabel ?? null;
};

const buildInitials = (title?: string, artist?: string): string => {
  const base = `${title ?? ""} ${artist ?? ""}`.trim();
  if (!base) return "NG";
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase());
  return letters.join("") || "NG";
};

const DEFAULT_LISTENER_MACROS: ListenerMacros = {
  energy: 0.6,
  space: 0,
  texture: 0.5,
  weirdness: 0.5,
  drive: 0.3,
  locks: {},
};

const normalizeMacroLocks = (
  locks: ListenerMacroLocks | null | undefined,
): ListenerMacroLocks => ({
  groove: Boolean(locks?.groove),
  harmony: Boolean(locks?.harmony),
  drums: Boolean(locks?.drums),
});

const normalizeListenerMacros = (
  value: Partial<ListenerMacros> | null | undefined,
): ListenerMacros => ({
  energy: clamp01(value?.energy ?? DEFAULT_LISTENER_MACROS.energy),
  space: clamp01(value?.space ?? DEFAULT_LISTENER_MACROS.space),
  texture: clamp01(value?.texture ?? DEFAULT_LISTENER_MACROS.texture),
  weirdness:
    value?.weirdness == null
      ? DEFAULT_LISTENER_MACROS.weirdness
      : clamp01(value.weirdness),
  drive:
    value?.drive == null ? DEFAULT_LISTENER_MACROS.drive : clamp01(value.drive),
  locks: normalizeMacroLocks(value?.locks),
});

const readStoredMacros = (): ListenerMacros => {
  if (typeof window === "undefined") return DEFAULT_LISTENER_MACROS;
  try {
    const raw = window.localStorage.getItem(MACROS_STORAGE_KEY);
    if (!raw) return DEFAULT_LISTENER_MACROS;
    const parsed = JSON.parse(raw) as Partial<ListenerMacros>;
    return normalizeListenerMacros(parsed);
  } catch {
    return DEFAULT_LISTENER_MACROS;
  }
};

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "and",
  "any",
  "are",
  "but",
  "can",
  "could",
  "day",
  "did",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "here",
  "him",
  "his",
  "into",
  "its",
  "just",
  "like",
  "more",
  "not",
  "now",
  "our",
  "out",
  "over",
  "she",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "too",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "will",
  "with",
  "you",
  "your",
]);

const normalizeToken = (token: string) =>
  token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .map((token) => normalizeToken(token.trim()))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const buildMacroRenderPlan = (
  macros: ListenerMacros,
  bars: number,
): RenderPlan => {
  const energy = clamp01(macros.energy);
  const space = clamp01(macros.space);
  const texture = clamp01(macros.texture);
  const weirdness = clamp01(macros.weirdness ?? macros.texture);
  const drive = clamp01(macros.drive ?? 0.3);
  const midpoint = Math.max(2, Math.round(bars * 0.5));

  const eqPeaks = [
    { freq: 110, q: 0.9, gainDb: Number((-5 + drive * 3).toFixed(2)) },
    { freq: 820, q: 1.1, gainDb: Number((-2 + texture * 4).toFixed(2)) },
    { freq: 5200, q: 0.8, gainDb: Number((-1 + texture * 6).toFixed(2)) },
  ];

  return {
    global: {
      energyCurve: [
        { bar: 1, energy: clamp01(0.2 + energy * 0.7) },
        { bar: midpoint, energy: clamp01(0.25 + energy * 0.65) },
        { bar: bars, energy: clamp01(0.2 + energy * 0.7) },
      ],
      locks: normalizeMacroLocks(macros.locks),
    },
    windows: [
      {
        startBar: 1,
        bars,
        texture: {
          sampleInfluence: clamp01(0.3 + texture * 0.6),
          styleInfluence: clamp01(0.25 + energy * 0.5 + drive * 0.1),
          weirdness: clamp01(0.1 + weirdness * 0.6 + space * 0.2),
          eqPeaks,
          fx: {
            reverbSend: clamp01(space * 0.8),
            comp: clamp01(0.25 + drive * 0.5),
            sat: clamp01(0.15 + drive * 0.6),
            chorus: clamp01(0.05 + texture * 0.5),
          },
        },
      },
    ],
  };
};

const buildMacroCoverRequest = (params: {
  originalId: string;
  macros: ListenerMacros;
  bars: number;
  tempo?: OriginalDetails["tempo"];
}): CoverJobRequest => {
  const renderPlan = buildMacroRenderPlan(params.macros, params.bars);
  const texture = renderPlan.windows[0]?.texture;
  const coverRequest: CoverJobRequest = {
    originalId: params.originalId,
    barWindows: [{ startBar: 1, endBar: 1 + params.bars }],
    linkHelix: false,
    sampleInfluence: texture?.sampleInfluence,
    styleInfluence: texture?.styleInfluence,
    weirdness: texture?.weirdness,
    renderPlan,
  };
  if (params.tempo) {
    coverRequest.tempo = params.tempo;
  }
  return coverRequest;
};

type EditionNode = {
  recipe: NoisegenRecipe;
  children: EditionNode[];
};

const buildEditionTree = (recipes: NoisegenRecipe[]): EditionNode[] => {
  const nodes = new Map<string, EditionNode>();
  recipes.forEach((recipe) => {
    nodes.set(recipe.id, { recipe, children: [] });
  });
  const roots: EditionNode[] = [];
  recipes.forEach((recipe) => {
    const node = nodes.get(recipe.id);
    if (!node) return;
    const parentId = recipe.parentId?.trim();
    const parentNode = parentId ? nodes.get(parentId) : undefined;
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (items: EditionNode[]) => {
    items.sort(
      (left, right) => (right.recipe.updatedAt ?? 0) - (left.recipe.updatedAt ?? 0),
    );
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
};

const summarizeEditionDelta = (
  child: NoisegenRecipe,
  parent?: NoisegenRecipe | null,
): string[] => {
  if (!parent) return [];
  const deltas: string[] = [];
  const childReq = child.coverRequest;
  const parentReq = parent.coverRequest;
  const diff = (a?: number, b?: number) => (a ?? 0) - (b ?? 0);
  const pushDelta = (label: string, value: number, threshold = 0.05) => {
    if (Math.abs(value) < threshold) return;
    const sign = value > 0 ? "+" : "";
    deltas.push(`${label} ${sign}${value.toFixed(2)}`);
  };
  pushDelta("sample", diff(childReq.sampleInfluence, parentReq.sampleInfluence));
  pushDelta("style", diff(childReq.styleInfluence, parentReq.styleInfluence));
  pushDelta("weird", diff(childReq.weirdness, parentReq.weirdness));
  if (childReq.kbTexture !== parentReq.kbTexture) {
    deltas.push("texture");
  }
  const childTempo = childReq.tempo;
  const parentTempo = parentReq.tempo;
  if (
    childTempo?.bpm !== parentTempo?.bpm ||
    childTempo?.timeSig !== parentTempo?.timeSig
  ) {
    deltas.push("tempo");
  }
  const childPlan = childReq.renderPlan;
  const parentPlan = parentReq.renderPlan;
  if (Boolean(childPlan) !== Boolean(parentPlan)) {
    deltas.push("plan");
  } else if (childPlan && parentPlan) {
    if ((childPlan.windows?.length ?? 0) !== (parentPlan.windows?.length ?? 0)) {
      deltas.push("plan");
    }
  }
  return deltas.slice(0, 4);
};

const resolveMoodVector = (recipe: NoisegenRecipe) => ({
  sample: clamp01(recipe.coverRequest.sampleInfluence ?? 0),
  style: clamp01(recipe.coverRequest.styleInfluence ?? 0),
  weird: clamp01(recipe.coverRequest.weirdness ?? 0),
});

const summarizeMoodDelta = (
  child: NoisegenRecipe,
  parent?: NoisegenRecipe | null,
): string[] => {
  if (!parent) return [];
  const childMood = resolveMoodVector(child);
  const parentMood = resolveMoodVector(parent);
  const deltas: string[] = [];
  const pushDelta = (label: string, value: number, threshold = 0.03) => {
    if (!Number.isFinite(value) || Math.abs(value) < threshold) return;
    const sign = value > 0 ? "+" : "";
    deltas.push(`${label} ${sign}${value.toFixed(2)}`);
  };
  pushDelta("sample", childMood.sample - parentMood.sample);
  pushDelta("style", childMood.style - parentMood.style);
  pushDelta("weird", childMood.weird - parentMood.weird);
  return deltas.slice(0, 4);
};

const buildReceiptChips = (receipt?: EditionReceipt) => {
  if (!receipt) return [];
  const chips: string[] = [];
  if (receipt.contract?.hash) {
    chips.push(`Contract ${formatHashShort(receipt.contract.hash)}`);
  }
  if (receipt.contract?.intentSimilarity != null) {
    chips.push(`Intent ${formatPercent(receipt.contract.intentSimilarity)}`);
  }
  if (receipt.contract?.violations?.length) {
    const count = receipt.contract.violations.length;
    chips.push(`${count} violation${count === 1 ? "" : "s"}`);
  }
  if (receipt.ideology?.rootId) {
    chips.push(`Ideology ${receipt.ideology.rootId}`);
  }
  if (receipt.ideology?.treeVersion != null) {
    chips.push(`Tree v${receipt.ideology.treeVersion}`);
  }
  if (receipt.ideology?.allowedNodeIds?.length) {
    chips.push(`${receipt.ideology.allowedNodeIds.length} nodes`);
  }
  if (receipt.provenance?.pulse?.source) {
    chips.push(`Pulse ${receipt.provenance.pulse.source}`);
  }
  if (receipt.provenance?.placePrecision) {
    chips.push(`Place ${receipt.provenance.placePrecision}`);
  }
  if (receipt.tools?.plannerVersion) {
    chips.push(`Planner ${receipt.tools.plannerVersion}`);
  }
  if (receipt.tools?.modelVersion) {
    chips.push(`Model ${receipt.tools.modelVersion}`);
  }
  if (receipt.tools?.toolVersions) {
    chips.push(`Tools ${Object.keys(receipt.tools.toolVersions).length}`);
  }
  return chips;
};

const buildNodeTokens = (node: {
  title: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
}) => {
  const tokens = new Set<string>();
  const fields = [node.title, node.slug, node.excerpt, ...(node.tags ?? [])].filter(
    Boolean,
  );
  fields.forEach((field) => {
    tokenize(String(field)).forEach((token) => tokens.add(token));
  });
  return tokens;
};

const IDEOLOGY_HINTS: Record<
  string,
  { tokens: string[]; phrases: string[]; focus: string }
> = {
  "devotion-course": {
    tokens: ["saved", "save", "purpose", "vow", "intent", "devotion", "protect", "course", "called"],
    phrases: ["saved for something", "called to", "set the course"],
    focus: "vow / intent",
  },
  "struggle-testament": {
    tokens: ["struggle", "earned", "purpose", "testament", "sweat", "tear", "proof", "weight", "world"],
    phrases: ["purpose earned", "weight of the world"],
    focus: "purpose earned",
  },
  "civic-memory-continuity": {
    tokens: ["memory", "remember", "record", "archive", "carry", "carried", "sleeve", "wear", "history"],
    phrases: ["collecting on our sleeves", "wear that day", "carry the record"],
    focus: "carried record",
  },
  "promise-trials": {
    tokens: ["promise", "trial", "pressure", "return", "proof", "separation", "test"],
    phrases: ["promise tested", "trial by"],
    focus: "promises tested",
  },
  "lifetime-trust-ledger": {
    tokens: ["trust", "ledger", "evidence", "time", "record", "archive", "prove"],
    phrases: ["evidence over time", "time tested"],
    focus: "evidence over time",
  },
  "phoenix-averaging": {
    tokens: ["window", "signal", "average", "tuned", "tune", "settle", "measure", "steady"],
    phrases: ["stayed tuned", "right window", "step back"],
    focus: "right window for signal",
  },
  "liveness-or-it-didnt-happen": {
    tokens: ["liveness", "live", "stale", "update", "fresh", "alive", "age"],
    phrases: ["stayed tuned", "still alive"],
    focus: "liveness over stale memory",
  },
  "capability-ambition-gradient": {
    tokens: ["frontier", "reach", "ambition", "capability", "drive", "outdo"],
    phrases: ["make the frontier", "outdo it"],
    focus: "reach + responsibility",
  },
  "worldview-integrity": {
    tokens: ["worldview", "map", "reality", "truth", "idea", "face", "integrity", "test"],
    phrases: ["idea faced", "faced us now"],
    focus: "testing the map against reality",
  },
  "three-tenets-loop": {
    tokens: ["knowing", "witness", "action", "wait", "see", "listen", "bearing"],
    phrases: ["wait and see", "best to wait"],
    focus: "not-knowing → witness → action",
  },
  "impermanence-by-design": {
    tokens: ["change", "shift", "impermanence", "adapt", "review", "cycle", "path"],
    phrases: ["paths will constantly change", "wait and see"],
    focus: "adaptation over time",
  },
  "values-over-images": {
    tokens: ["value", "image", "status", "shame", "skill", "core", "performance"],
    phrases: ["skill outwits shame"],
    focus: "values over status/performance",
  },
  "interbeing-systems": {
    tokens: ["interbeing", "depend", "together", "connected", "system", "path"],
    phrases: ["paths will constantly change"],
    focus: "interdependence",
  },
  "solitude-to-signal": {
    tokens: ["solitude", "signal", "tuned", "quiet", "distance"],
    phrases: ["stayed tuned"],
    focus: "signal through distance",
  },
};

const PLAYBACK_PRIORITY: Record<string, number> = {
  aac: 0,
  opus: 1,
  mp3: 2,
  wav: 3,
};

const filterPlayableSources = (sources: PlayerSource[]): PlayerSource[] => {
  if (typeof window === "undefined" || sources.length === 0) return sources;
  const probe = document.createElement("audio");
  const supported = sources.filter((source) => {
    if (!source.mime) return true;
    const verdict = probe.canPlayType(source.mime);
    return verdict === "probably" || verdict === "maybe";
  });
  return supported.length > 0 ? supported : sources;
};

const filterPlayableStemSources = (
  sources: StemGroupSource[],
): StemGroupSource[] => {
  if (typeof window === "undefined" || sources.length === 0) return sources;
  const probe = document.createElement("audio");
  const supported = sources.filter((source) => {
    const verdict = probe.canPlayType(source.mime);
    return verdict === "probably" || verdict === "maybe";
  });
  return supported.length > 0 ? supported : sources;
};

const buildPlaybackSources = (
  assets?: OriginalDetails["playback"],
): PlayerSource[] => {
  if (!assets || assets.length === 0) return [];
  const sorted = [...assets].sort(
    (a, b) =>
      (PLAYBACK_PRIORITY[a.codec] ?? 99) -
      (PLAYBACK_PRIORITY[b.codec] ?? 99),
  );
  const mapped = sorted.map((asset) => ({
    id: asset.id,
    url: asset.url,
    label: asset.label,
    bytes: asset.size,
    mime: asset.mime,
  }));
  return filterPlayableSources(mapped);
};

const pickStemGroupSource = (
  sources: StemGroupSource[] = [],
): StemGroupSource | null => {
  if (sources.length === 0) return null;
  const sorted = [...sources].sort(
    (a, b) =>
      (PLAYBACK_PRIORITY[a.codec] ?? 99) -
      (PLAYBACK_PRIORITY[b.codec] ?? 99),
  );
  const filtered = filterPlayableStemSources(sorted);
  return filtered[0] ?? null;
};

const buildOriginalAssetCandidates = (
  originalId: string,
  kind: "instrumental" | "vocal",
) => {
  const slug = encodeURIComponent(originalId);
  return [
    `/api/noise-gens/originals/${slug}/${kind}`,
    `/originals/${slug}/${kind}`,
    `/audio/originals/${slug}/${kind}`,
  ];
};

const checkOriginalAsset = async (
  originalId: string,
  kind: "instrumental" | "vocal",
  label: string,
): Promise<PlayerSource | null> => {
  const candidates = buildOriginalAssetCandidates(originalId, kind);
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) continue;
      const lengthHeader = res.headers.get("content-length");
      const lengthValue = lengthHeader ? Number(lengthHeader) : Number.NaN;
      return {
        id: kind,
        url,
        label,
        bytes: Number.isFinite(lengthValue) ? lengthValue : undefined,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
};

type OriginalsPlayerProps = {
  original: Original | null;
  playlist?: Original[];
  onSelectOriginal?: (original: Original) => void;
  moodPresets?: MoodPreset[];
  onVary?: (preset?: MoodPreset, macros?: ListenerMacros, seed?: number) => void;
  isVarying?: boolean;
  varyStatus?: {
    status: JobStatus;
    previewUrl?: string | null;
    detail?: string | null;
  } | null;
  canEditLyrics?: boolean;
  canEditContract?: boolean;
  autoPlayToken?: number;
};

export function OriginalsPlayer({
  original,
  playlist = [],
  onSelectOriginal,
  moodPresets = [],
  onVary,
  isVarying = false,
  varyStatus = null,
  canEditLyrics = false,
  canEditContract = false,
  autoPlayToken,
}: OriginalsPlayerProps) {
  const { data: ideologyDoc } = useIdeology();
  const { toast } = useToast();
  const { isMobile } = useIsMobileViewport();
  const [listenerMacros, setListenerMacros] = useState<ListenerMacros>(() =>
    readStoredMacros(),
  );
  const listenerUndoRef = useRef<ListenerMacros | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [editionRecipes, setEditionRecipes] = useState<NoisegenRecipe[]>([]);
  const [editionLoading, setEditionLoading] = useState(false);
  const [editionError, setEditionError] = useState<string | null>(null);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);
  const [lyricsEditorOpen, setLyricsEditorOpen] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [lyricsSaving, setLyricsSaving] = useState(false);
  const [intentEditorOpen, setIntentEditorOpen] = useState(false);
  const [intentDraft, setIntentDraft] = useState<IntentContractDraft>(() =>
    buildIntentContractDraft(),
  );
  const [intentSaving, setIntentSaving] = useState(false);
  const meaningCacheRef = useRef<Map<string, MeaningCard[]>>(new Map());
  const meaningSeedOverridesRef = useRef<Map<string, number>>(new Map());
  const [meaningSeedTick, setMeaningSeedTick] = useState(0);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [details, setDetails] = useState<OriginalDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const detailsCacheRef = useRef<Map<string, OriginalDetails | null>>(new Map());
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const macroFxRef = useRef<MacroFxChain | null>(null);
  const elementSourceRef = useRef<Map<string, MediaElementAudioSourceNode>>(
    new Map(),
  );
  const buffersRef = useRef<Record<string, AudioBuffer | null>>({});
  const activeSourcesRef = useRef<SourceHandle[]>([]);
  const startAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playerIdRef = useRef(
    `noisegen-player-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [playableCount, setPlayableCount] = useState(0);
  const [autoPlayPending, setAutoPlayPending] = useState(false);
  const lastAutoPlayRef = useRef<number | null>(null);
  const [remixStatus, setRemixStatus] = useState<RemixStatus>("idle");
  const [remixError, setRemixError] = useState<string | null>(null);
  const [remixGroups, setRemixGroups] = useState<StemGroupPlayback[]>([]);
  const remixBuffersRef = useRef<Record<string, AudioBuffer | null>>({});
  const remixGainsRef = useRef<Map<string, GainNode>>(new Map());
  const remixDurationRef = useRef<number>(0);
  const remixRequestedRef = useRef(false);
  const remixControllerRef = useRef<AbortController | null>(null);
  // Stream playback via media elements to avoid heavy decoding in Listener.    
  const useElementPlayback =
    sourceMode === "playback" ||
    sourceMode === "fallback" ||
    sources.length === 1 ||
    (sourceMode === null && sources.length > 1);

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopWebAudioSources = useCallback(() => {
    activeSourcesRef.current.forEach(({ source }) => {
      try {
        source.stop();
      } catch {
        /* ignore */
      }
    });
    activeSourcesRef.current = [];
    startAtRef.current = null;
    stopRaf();
  }, [stopRaf]);

  const stopPlayback = useCallback(() => {
    if (audioElementsRef.current.size) {
      audioElementsRef.current.forEach((audio) => audio.pause());
    } else if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
    stopWebAudioSources();
    setIsPlaying(false);
  }, [stopWebAudioSources]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSources([]);
    setSourceMode(null);
    setLoadError(null);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    remixControllerRef.current?.abort();
    remixControllerRef.current = null;
    remixRequestedRef.current = false;
    remixBuffersRef.current = {};
    remixGainsRef.current = new Map();
    remixDurationRef.current = 0;
    setRemixGroups([]);
    setRemixStatus("idle");
    setRemixError(null);

    if (!original) {
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(false);
      setIsLoading(false);
      return undefined;
    }

    const load = async () => {
      setIsLoading(true);
      setDetailsLoading(true);
      try {
        const cached = detailsCacheRef.current.get(original.id);
        const payload =
          cached ??
          (await fetchOriginalDetails(original.id, controller.signal));
        if (cancelled) return;
        if (cached == null) {
          detailsCacheRef.current.set(original.id, payload);
        }
        setDetails(payload);
        setDetailsError(null);

        const playbackSources = buildPlaybackSources(payload.playback);
        if (playbackSources.length > 0) {
          setSources(playbackSources);
          setSourceMode("playback");
          return;
        }

        if (payload.processing && payload.processing.status !== "ready") {
          const detail = payload.processing.detail?.trim();
          const statusLabel =
            payload.processing.status === "error"
              ? "Playback failed."
              : "Playback is still processing.";
          setLoadError(detail || statusLabel);
          setIsLoading(false);
          return;
        }

        const fallback = await checkOriginalAsset(
          original.id,
          "instrumental",
          "Mix",
        );
        if (cancelled) return;
        if (fallback) {
          setSources([fallback]);
          setSourceMode("fallback");
          return;
        }

        setLoadError("Playback assets are not ready yet.");
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load track details.";
        setDetailsError(message);
        setLoadError(message);
        setIsLoading(false);
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
      stopPlayback();
    };
  }, [original?.id, stopPlayback]);

  useEffect(() => {
    let cancelled = false;
    if (!original) {
      setEditionRecipes([]);
      setEditionLoading(false);
      setEditionError(null);
      return undefined;
    }
    const loadEditions = async () => {
      setEditionLoading(true);
      setEditionError(null);
      try {
        const records = await fetchRecipes();
        if (cancelled) return;
        const filtered = (records ?? []).filter(
          (entry) => entry.originalId === original.id,
        );
        setEditionRecipes(filtered);
      } catch (error) {
        if (cancelled) return;
        setEditionError(
          error instanceof Error ? error.message : "Failed to load editions.",
        );
      } finally {
        if (!cancelled) setEditionLoading(false);
      }
    };
    void loadEditions();
    return () => {
      cancelled = true;
    };
  }, [original?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        MACROS_STORAGE_KEY,
        JSON.stringify(listenerMacros),
      );
    } catch {
      // best-effort persistence only
    }
  }, [listenerMacros]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (!masterGainRef.current) {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      masterGainRef.current = gain;
    }
    return ctx;
  }, []);

  const ensureMacroFxChain = useCallback(async () => {
    const ctx = await ensureAudioContext();
    if (!ctx || !masterGainRef.current) return null;
    let chain = macroFxRef.current;
    if (!chain) {
      chain = createMacroFxChain(ctx);
      chain.output.connect(masterGainRef.current);
      macroFxRef.current = chain;
    }
    return chain;
  }, [ensureAudioContext]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    const chain = macroFxRef.current;
    if (ctx && chain) {
      applyMacroFxProfile(chain, buildMacroFxProfile(listenerMacros), ctx);
      return;
    }
    if (!isPlaying) return;
    let canceled = false;
    const sync = async () => {
      const fx = await ensureMacroFxChain();
      if (canceled) return;
      const activeCtx = audioContextRef.current;
      if (fx && activeCtx) {
        applyMacroFxProfile(fx, buildMacroFxProfile(listenerMacros), activeCtx);
      }
    };
    void sync();
    return () => {
      canceled = true;
    };
  }, [ensureMacroFxChain, isPlaying, listenerMacros]);

  useEffect(
    () => () => {
      releaseAudioFocus(playerIdRef.current);
    },
    [releaseAudioFocus],
  );

  const attachElementToMacroFx = useCallback(
    async (id: string, audio: HTMLAudioElement) => {
      const chain = await ensureMacroFxChain();
      const ctx = audioContextRef.current;
      if (!chain || !ctx) return;
      if (elementSourceRef.current.has(id)) return;
      const source = ctx.createMediaElementSource(audio);
      source.connect(chain.input);
      elementSourceRef.current.set(id, source);
    },
    [ensureMacroFxChain],
  );

  const pausePlayback = useCallback(() => {
    if (
      remixStatus !== "active" &&
      (audioElementsRef.current.size || audioElementRef.current)
    ) {
      audioElementsRef.current.forEach((audio) => audio.pause());
      const leader =
        audioElementRef.current ??
        audioElementsRef.current.values().next().value ??
        null;
      if (leader) {
        setCurrentTime(leader.currentTime);
      }
      setIsPlaying(false);
      return;
    }
    const ctx = audioContextRef.current;
    const startedAt = startAtRef.current;
    const elapsed =
      ctx && startedAt != null
        ? Math.max(0, ctx.currentTime - startedAt)
        : currentTime;
    const clamped = duration > 0 ? Math.min(elapsed, duration) : elapsed;
    stopPlayback();
    setCurrentTime(clamped);
  }, [currentTime, duration, remixStatus, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
      audioContextRef.current?.close().catch(() => null);
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (sources.length === 0) {
      stopPlayback();
      buffersRef.current = {};
      setDuration(0);
      setCurrentTime(0);
      setPlayableCount(0);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    if (useElementPlayback) {
      stopPlayback();
      buffersRef.current = {};
      setDuration(0);
      setCurrentTime(0);
      setPlayableCount(0);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const ctx = await ensureAudioContext();
      if (!ctx || cancelled) return;
      const loaded: Record<string, AudioBuffer | null> = {};
      let longest = 0;
      let playable = 0;
      for (const source of sources) {
        if (!source.url) {
          loaded[source.id] = null;
          continue;
        }
        try {
          const response = await fetch(source.url, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(
              `Failed to load ${source.label} (${response.status})`,
            );
          }
          const data = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          loaded[source.id] = buffer;
          playable += 1;
          longest = Math.max(longest, buffer.duration);
        } catch (error) {
          if (controller.signal.aborted || cancelled) return;
          loaded[source.id] = null;
          const message =
            error instanceof Error
              ? error.message
              : `Could not decode ${source.label}`;
          setLoadError((prev) => prev ?? message);
        }
      }
      if (cancelled) return;
      buffersRef.current = loaded;
      setPlayableCount(playable);
      setDuration(longest);
      setCurrentTime(0);
      setIsLoading(false);
    };

    stopPlayback();
    buffersRef.current = {};
    setDuration(0);
    setCurrentTime(0);
    setPlayableCount(0);

    load().catch((error) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load audio.");
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
      stopPlayback();
    };
  }, [ensureAudioContext, sources, stopPlayback, useElementPlayback]);

  useEffect(() => {
    if (!useElementPlayback || sources.length === 0) {
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioElementsRef.current.clear();
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = "";
        audioElementRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const elements = new Map<string, HTMLAudioElement>();
    const handlers = new Map<
      string,
      {
        loaded: () => void;
        time: () => void;
        ended: () => void;
        error: () => void;
      }
    >();
    const loadedIds = new Set<string>();
    let longest = 0;

    setIsLoading(true);
    setLoadError(null);
    setPlayableCount(0);
    setDuration(0);
    setCurrentTime(0);

    if (sourceMode === "playback") {
      const playbackKey = "playback";
      const audio = new Audio();
      audio.preload = "metadata";
      audio.volume = macroFxRef.current ? 1 : volume;
      let currentIndex = 0;

      const setPlaybackSource = (index: number) => {
        const source = sources[index];
        if (!source) return;
        audio.src = source.url;
        audio.load();
      };

      const handleLoaded = () => {
        if (cancelled) return;
        const durationValue = Number.isFinite(audio.duration)
          ? audio.duration
          : 0;
        if (durationValue > longest) {
          longest = durationValue;
        }
        setPlayableCount(1);
        setDuration(longest);
        setIsLoading(false);
      };
      const handleError = () => {
        if (cancelled) return;
        const nextIndex = currentIndex + 1;
        if (nextIndex < sources.length) {
          currentIndex = nextIndex;
          setPlaybackSource(currentIndex);
          return;
        }
        setLoadError(
          (prev) =>
            prev ?? `Could not decode ${sources[currentIndex]?.label ?? "audio"}`,
        );
        setIsLoading(false);
      };
      const handleTime = () => {
        if (cancelled) return;
        setCurrentTime(audio.currentTime);
      };
      const handleEnded = () => {
        if (cancelled) return;
        setIsPlaying(false);
        setCurrentTime(audio.duration || 0);
      };

      audio.addEventListener("loadedmetadata", handleLoaded);
      audio.addEventListener("timeupdate", handleTime);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      setPlaybackSource(currentIndex);
      void attachElementToMacroFx(playbackKey, audio);

      handlers.set(playbackKey, {
        loaded: handleLoaded,
        time: handleTime,
        ended: handleEnded,
        error: handleError,
      });
      elements.set(playbackKey, audio);
    } else {
      sources.forEach((source, index) => {
        const audio = new Audio();
        audio.preload = "metadata";
        audio.src = source.url;
        audio.volume = macroFxRef.current ? 1 : volume;

        const handleLoaded = () => {
          if (cancelled) return;
          loadedIds.add(source.id);
          const durationValue = Number.isFinite(audio.duration)
            ? audio.duration
            : 0;
          if (durationValue > longest) {
            longest = durationValue;
          }
          setPlayableCount(loadedIds.size);
          setDuration(longest);
          if (loadedIds.size >= sources.length) {
            setIsLoading(false);
          }
        };
        const handleError = () => {
          if (cancelled) return;
          setLoadError((prev) => prev ?? `Could not decode ${source.label}`);
          setIsLoading(false);
        };
        const handleTime = () => {
          if (cancelled) return;
          if (index === 0) {
            setCurrentTime(audio.currentTime);
          }
        };
        const handleEnded = () => {
          if (cancelled) return;
          if (index === 0) {
            setIsPlaying(false);
            setCurrentTime(audio.duration || 0);
          }
        };

        audio.addEventListener("loadedmetadata", handleLoaded);
        audio.addEventListener("timeupdate", handleTime);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.load();
        void attachElementToMacroFx(source.id, audio);

        handlers.set(source.id, {
          loaded: handleLoaded,
          time: handleTime,
          ended: handleEnded,
          error: handleError,
        });
        elements.set(source.id, audio);
      });
    }

    audioElementsRef.current = elements;
    audioElementRef.current =
      sourceMode === "playback"
        ? elements.get("playback") ?? null
        : sources[0]?.id
          ? elements.get(sources[0].id) ?? null
          : null;

    return () => {
      cancelled = true;
      elements.forEach((audio, id) => {
        const entry = handlers.get(id);
        if (entry) {
          audio.removeEventListener("loadedmetadata", entry.loaded);
          audio.removeEventListener("timeupdate", entry.time);
          audio.removeEventListener("ended", entry.ended);
          audio.removeEventListener("error", entry.error);
        }
        audio.pause();
        audio.src = "";
        const node = elementSourceRef.current.get(id);
        if (node) {
          try {
            node.disconnect();
          } catch {
            // ignore disconnect failures
          }
          elementSourceRef.current.delete(id);
        }
      });
      if (
        audioElementRef.current &&
        audioElementRef.current === elements.get(sources[0]?.id ?? "")
      ) {
        audioElementRef.current = null;
      }
      audioElementsRef.current.clear();
    };
  }, [attachElementToMacroFx, sources, sourceMode, useElementPlayback]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    const gain = masterGainRef.current;
    if (ctx && gain && macroFxRef.current) {
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
      if (audioElementsRef.current.size) {
        audioElementsRef.current.forEach((audio) => {
          audio.volume = 1;
        });
      } else if (audioElementRef.current) {
        audioElementRef.current.volume = 1;
      }
      return;
    }
    if (audioElementsRef.current.size) {
      audioElementsRef.current.forEach((audio) => {
        audio.volume = volume;
      });
      return;
    }
    if (audioElementRef.current) {
      audioElementRef.current.volume = volume;
      return;
    }
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  }, [volume]);

  const startRaf = useCallback(() => {
    stopRaf();
    const tick = () => {
      const ctx = audioContextRef.current;
      const startedAt = startAtRef.current;
      if (!ctx || startedAt == null) return;
      const elapsed = Math.max(0, ctx.currentTime - startedAt);
      const clamped = duration > 0 ? Math.min(elapsed, duration) : elapsed;
      setCurrentTime(clamped);
      if (duration > 0 && clamped >= duration) {
        stopPlayback();
        setCurrentTime(duration);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, stopPlayback, stopRaf]);

  const fadeElementVolume = useCallback(
    (audio: HTMLAudioElement, target: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        if (durationMs <= 0 || typeof window === "undefined") {
          audio.volume = target;
          resolve();
          return;
        }
        const start = audio.volume;
        const delta = target - start;
        const startTime = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - startTime) / durationMs);
          audio.volume = start + delta * progress;
          if (progress >= 1) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [],
  );

  const resolvePlayError = useCallback(
    (results: PromiseSettledResult<unknown>[]): string | null => {
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const reasons = rejected.map(
        (result) => result.reason as { name?: string } | undefined,
      );
      if (reasons.some((reason) => reason?.name === "AbortError")) {
        return null;
      }
      if (reasons.some((reason) => reason?.name === "NotAllowedError")) {
        return "Tap play to start audio.";
      }
      if (reasons.some((reason) => reason?.name === "NotSupportedError")) {
        return "This browser cannot play the current audio format.";
      }
      return "Unable to start playback.";
    },
    [],
  );

  const startPlayback = useCallback(
    async (offsetSec = 0, reportError = true) => {
      if (sources.length === 0) return;
      stopPlayback();

      if (audioElementsRef.current.size || audioElementRef.current) {
        const fx = await ensureMacroFxChain();
        const ctx = audioContextRef.current;
        if (fx && ctx) {
          applyMacroFxProfile(fx, buildMacroFxProfile(listenerMacros), ctx);
        }
        const elements = audioElementsRef.current.size
          ? Array.from(audioElementsRef.current.values())
          : audioElementRef.current
            ? [audioElementRef.current]
            : [];
        elements.forEach((audio) => {
          try {
            audio.currentTime = Math.max(0, offsetSec);
          } catch {
            /* ignore */
          }
        });
        const results = await Promise.allSettled(
          elements.map((audio) => audio.play()),
        );
        if (results.some((result) => result.status === "fulfilled")) {
          setIsPlaying(true);
          if (reportError) {
            setLoadError(null);
          }
        } else {
          if (reportError) {
            const message = resolvePlayError(results);
            if (message) {
              setLoadError(message);
            }
          }
        }
        return;
      }

      const ctx = await ensureAudioContext();
      if (!ctx) return;
      const fx = await ensureMacroFxChain();
      if (fx) {
        applyMacroFxProfile(fx, buildMacroFxProfile(listenerMacros), ctx);
      }
      let gain = masterGainRef.current;
      if (!gain) {
        gain = ctx.createGain();
        gain.connect(ctx.destination);
        masterGainRef.current = gain;
      }
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      const destination = fx?.input ?? gain;
      const startAt = ctx.currentTime + 0.05;
      const handles: SourceHandle[] = [];
      let longest = duration;

      for (const source of sources) {
        const buffer = buffersRef.current[source.id];
        if (!buffer) continue;
        const startOffset = Math.max(
          0,
          Math.min(offsetSec, Math.max(0, buffer.duration - 0.01)),
        );
        if (buffer.duration === 0 || startOffset >= buffer.duration) continue;
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(destination);
        node.start(startAt, startOffset);
        handles.push({ id: source.id, source: node });
        longest = Math.max(longest, buffer.duration);
      }

      if (!handles.length) return;
      activeSourcesRef.current = handles;
      const effectiveOffset = longest > 0 ? Math.min(offsetSec, longest) : offsetSec;
      startAtRef.current = startAt - effectiveOffset;
      setDuration(longest);
      setCurrentTime(effectiveOffset);
      setIsPlaying(true);
      startRaf();
    },
    [
      duration,
      ensureAudioContext,
      ensureMacroFxChain,
      listenerMacros,
      resolvePlayError,
      sources,
      startRaf,
      stopPlayback,
      volume,
    ],
  );

  const startStemPlayback = useCallback(
    async (offsetSec = 0, fadeInMs = 0) => {
      if (remixGroups.length === 0) return;
      const ctx = await ensureAudioContext();
      if (!ctx) return;
      stopWebAudioSources();
      const fx = await ensureMacroFxChain();
      if (fx) {
        applyMacroFxProfile(fx, buildMacroFxProfile(listenerMacros), ctx);
      }
      let master = masterGainRef.current;
      if (!master) {
        master = ctx.createGain();
        master.connect(ctx.destination);
        masterGainRef.current = master;
      }
      master.gain.setValueAtTime(volume, ctx.currentTime);
      const destination = fx?.input ?? master;
      const startAt = ctx.currentTime + 0.02;
      const handles: SourceHandle[] = [];
      const gains = new Map<string, GainNode>();
      let longest = 0;

      remixGroups.forEach((group) => {
        const buffer = remixBuffersRef.current[group.id];
        if (!buffer) return;
        const groupGain = ctx.createGain();
        const targetGain = Math.max(0, Math.min(1, group.gain));
        if (fadeInMs > 0) {
          groupGain.gain.setValueAtTime(0, ctx.currentTime);
          groupGain.gain.linearRampToValueAtTime(
            targetGain,
            ctx.currentTime + fadeInMs / 1000,
          );
        } else {
          groupGain.gain.setValueAtTime(targetGain, ctx.currentTime);
        }
        groupGain.connect(destination);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(groupGain);
        const maxStart = Math.max(0, buffer.duration - 0.01);
        const startOffset = Math.max(0, Math.min(offsetSec, maxStart));
        node.start(startAt, startOffset);
        handles.push({ id: group.id, source: node });
        gains.set(group.id, groupGain);
        longest = Math.max(longest, buffer.duration);
      });

      if (!handles.length) return;
      activeSourcesRef.current = handles;
      remixGainsRef.current = gains;
      const effectiveOffset = longest > 0 ? Math.min(offsetSec, longest) : offsetSec;
      startAtRef.current = startAt - effectiveOffset;
      setDuration(longest);
      setCurrentTime(effectiveOffset);
      setIsPlaying(true);
      setRemixStatus("active");
      startRaf();
    },
    [
      ensureAudioContext,
      ensureMacroFxChain,
      listenerMacros,
      remixGroups,
      startRaf,
      stopWebAudioSources,
      volume,
    ],
  );

  const activateRemix = useCallback(async () => {
    const mixElement =
      audioElementRef.current ??
      audioElementsRef.current.values().next().value ??
      null;
    const mixTime = mixElement ? mixElement.currentTime : currentTime;
    const fadeMs = 450;
    await startStemPlayback(mixTime, fadeMs);
    if (mixElement) {
      await fadeElementVolume(mixElement, 0, fadeMs);
      mixElement.pause();
      mixElement.currentTime = mixTime;
      mixElement.volume = volume;
    }
  }, [currentTime, fadeElementVolume, startStemPlayback, volume]);

  const loadStemPack = useCallback(async () => {
    if (!original) return;
    if (remixStatus === "loading") return;
    remixRequestedRef.current = true;
    setRemixStatus("loading");
    setRemixError(null);
    const controller = new AbortController();
    remixControllerRef.current?.abort();
    remixControllerRef.current = controller;
    try {
      const pack: StemPack = await fetchStemPack(original.id, controller.signal);
      if (controller.signal.aborted) return;
      if (pack.processing && pack.processing.status !== "ready") {
        const detail = pack.processing.detail?.trim();
        throw new Error(detail || "Stem pack is still processing.");
      }
      const baseGroups = (pack.groups ?? [])
        .map((group) => {
          const source = pickStemGroupSource(group.sources);
          if (!source) return null;
          const gain = Number.isFinite(group.defaultGain)
            ? Math.max(0, Math.min(1, group.defaultGain))
            : 1;
          return {
            ...group,
            gain,
            source,
          };
        })
        .filter((group): group is StemGroupPlayback => group !== null);

      if (baseGroups.length === 0) {
        throw new Error("No stem groups are available yet.");
      }

      const ctx = await ensureAudioContext();
      if (!ctx) {
        throw new Error("Audio engine unavailable.");
      }

      const buffers: Record<string, AudioBuffer | null> = {};
      let playable = 0;
      let longest = 0;
      let decodeIssue: string | null = null;
      for (const group of baseGroups) {
        if (!group.source?.url) {
          buffers[group.id] = null;
          continue;
        }
        try {
          const response = await fetch(group.source.url, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(
              `Failed to load ${group.label} (${response.status})`,
            );
          }
          const data = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          buffers[group.id] = buffer;
          playable += 1;
          longest = Math.max(longest, buffer.duration);
        } catch (error) {
          if (controller.signal.aborted) return;
          buffers[group.id] = null;
          const message =
            error instanceof Error
              ? error.message
              : `Could not decode ${group.label}`;
          decodeIssue = decodeIssue ?? message;
          setRemixError((prev) => prev ?? message);
        }
      }

      if (playable === 0) {
        throw new Error(decodeIssue ?? "Stem groups are not ready.");
      }

      remixBuffersRef.current = buffers;
      remixDurationRef.current = longest;
      const readyGroups = baseGroups.filter((group) => buffers[group.id]);
      setRemixGroups(readyGroups);
      setRemixStatus("ready");
      if (remixRequestedRef.current && isPlaying) {
        await activateRemix();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Unable to load stem pack.";
      setRemixError(message);
      setRemixStatus("error");
    }
  }, [
    activateRemix,
    ensureAudioContext,
    isPlaying,
    original,
    remixStatus,
  ]);

  const handlePause = useCallback(() => {
    pausePlayback();
  }, [pausePlayback]);

  const handleRemix = useCallback(() => {
    if (!original) return;
    remixRequestedRef.current = true;
    if (remixStatus === "active") return;
    if (remixStatus === "ready") {
      if (isPlaying) {
        void activateRemix();
      }
      return;
    }
    if (remixStatus === "loading") return;
    void loadStemPack();
  }, [activateRemix, isPlaying, loadStemPack, original, remixStatus]);

  const requiresAllSources = false;
  const hasPlayable =
    sources.length > 0 &&
    (requiresAllSources ? playableCount >= sources.length : playableCount > 0);
  const remixPlayable = remixStatus === "ready" || remixStatus === "active";

  const handlePlay = useCallback((options?: { reportError?: boolean }) => {
    const reportError = options?.reportError ?? true;
    const shouldUseRemix =
      remixStatus === "active" ||
      (remixStatus === "ready" && remixRequestedRef.current);
    if (shouldUseRemix) {
      requestAudioFocus({ id: playerIdRef.current, stop: handlePause });
      const resumeFrom =
        duration > 0 && currentTime >= duration ? 0 : currentTime;
      void startStemPlayback(resumeFrom);
      return;
    }
    if (!hasPlayable || isLoading) return;
    if (reportError) {
      setLoadError(null);
    }
    requestAudioFocus({ id: playerIdRef.current, stop: handlePause });
    const resumeFrom = duration > 0 && currentTime >= duration ? 0 : currentTime;
    void startPlayback(resumeFrom, reportError);
  }, [
    currentTime,
    duration,
    handlePause,
    hasPlayable,
    isLoading,
    remixStatus,
    startPlayback,
    startStemPlayback,
  ]);

  const handleSeek = useCallback(
    (value: number) => {
      const safe = Math.max(0, Math.min(duration || 0, value));
      setCurrentTime(safe);
      if (remixStatus === "active") {
        if (isPlaying) {
          void startStemPlayback(safe);
        }
        return;
      }
      if (audioElementsRef.current.size) {
        audioElementsRef.current.forEach((audio) => {
          audio.currentTime = safe;
          if (isPlaying) {
            void audio.play().catch(() => null);
          }
        });
        return;
      }
      if (audioElementRef.current) {
        audioElementRef.current.currentTime = safe;
        return;
      }
      if (isPlaying) {
        void startPlayback(safe);
      }
    },
    [duration, isPlaying, remixStatus, startPlayback, startStemPlayback],
  );

  const handleGroupGainChange = useCallback((groupId: string, gain: number) => {
    const clamped = Math.max(0, Math.min(1, gain));
    setRemixGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, gain: clamped } : group,
      ),
    );
    const ctx = audioContextRef.current;
    const node = remixGainsRef.current.get(groupId);
    if (ctx && node) {
      node.gain.setTargetAtTime(clamped, ctx.currentTime, 0.01);
    }
  }, []);

  const handleListenerMacroChange = useCallback(
    (key: keyof ListenerMacros, value: number) => {
      setListenerMacros((prev) => {
        listenerUndoRef.current = prev;
        return { ...prev, [key]: clamp01(value) };
      });
    },
    [],
  );

  const handleListenerLockChange = useCallback(
    (key: keyof ListenerMacroLocks, value: boolean) => {
      setListenerMacros((prev) => {
        listenerUndoRef.current = prev;
        return {
          ...prev,
          locks: {
            ...prev.locks,
            [key]: value,
          },
        };
      });
    },
    [],
  );

  const handleMacroUndo = useCallback(() => {
    const snapshot = listenerUndoRef.current;
    if (!snapshot) return;
    setListenerMacros(snapshot);
    listenerUndoRef.current = null;
  }, []);

  const handleMacroReset = useCallback(() => {
    setListenerMacros(DEFAULT_LISTENER_MACROS);
    listenerUndoRef.current = null;
  }, []);

  const sourceLabel = useMemo(() => {
    if (sourceMode === "playback") return sources[0]?.label ?? "Song";
    if (sourceMode === "fallback") return sources[0]?.label ?? "Song";
    return "";
  }, [sourceMode, sources]);

  const lyricText = details?.lyrics?.trim() ?? "";
  const lyricLines = useMemo(
    () =>
      lyricText
        ? lyricText.split(/\r?\n/).map((line) => line.trimEnd())
        : [],
    [lyricText],
  );
  const lyricsHash = useMemo(
    () => (lyricText ? hashString(lyricText) : null),
    [lyricText],
  );
  const meaningSeedOverrideKey = useMemo(
    () => (original?.id && lyricsHash ? `${original.id}:${lyricsHash}` : null),
    [lyricsHash, original?.id],
  );

  const meaningCards = useMemo<MeaningCard[]>(() => {
    if (!ideologyDoc || lyricLines.length === 0) return [];
    const meaningSeedOverride = meaningSeedOverrideKey
      ? meaningSeedOverridesRef.current.get(meaningSeedOverrideKey)
      : null;
    const baseSeed = lyricsHash
      ? `${lyricsHash}:${original?.id ?? ""}:${ideologyDoc.version}`
      : null;
    const meaningSeed = baseSeed
      ? hashSeed(
          meaningSeedOverride != null
            ? `${baseSeed}:${meaningSeedOverride}`
            : baseSeed,
        )
      : null;
    const allowPersistentCache = meaningSeedOverride == null;
    const cacheKey =
      lyricsHash && meaningSeed != null
        ? `${MEANING_CACHE_PREFIX}:${ideologyDoc.version}:${lyricsHash}:${meaningSeed}`
        : null;
    if (cacheKey) {
      const cached = meaningCacheRef.current.get(cacheKey);
      if (cached) return cached;
      if (allowPersistentCache && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as MeaningCard[];
            if (Array.isArray(parsed)) {
              meaningCacheRef.current.set(cacheKey, parsed);
              return parsed;
            }
          }
        } catch {
          // ignore cache read failures
        }
      }
    }

    const nodeById = new Map(ideologyDoc.nodes.map((node) => [node.id, node]));
    const parentById = new Map<string, string>();
    ideologyDoc.nodes.forEach((node) => {
      node.children?.forEach((childId) => {
        if (!parentById.has(childId)) parentById.set(childId, node.id);
      });
    });

    const rootId = nodeById.has(ideologyDoc.rootId)
      ? ideologyDoc.rootId
      : "mission-ethos";
    const descendants = new Set<string>();
    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift();
      if (!current || descendants.has(current)) continue;
      descendants.add(current);
      const node = nodeById.get(current);
      node?.children?.forEach((childId) => queue.push(childId));
    }

    const reasonPath = FAIRNESS_BASELINE_IDS.map(
      (id) => nodeById.get(id)?.title ?? id,
    ).join(" -> ");

    const tokenCache = new Map<string, Set<string>>();
    const getTokens = (nodeId: string) => {
      const cached = tokenCache.get(nodeId);
      if (cached) return cached;
      const node = nodeById.get(nodeId);
      if (!node) return new Set<string>();
      const tokens = buildNodeTokens(node);
      const hint = IDEOLOGY_HINTS[node.id];
      if (hint) {
        hint.tokens.forEach((token) => tokens.add(normalizeToken(token)));
        hint.phrases.forEach((phrase) =>
          tokenize(phrase).forEach((token) => tokens.add(token)),
        );
      }
      tokenCache.set(nodeId, tokens);
      return tokens;
    };

    const buildPath = (nodeId: string) => {
      const titles: string[] = [];
      let current: string | undefined = nodeId;
      for (let i = 0; i < 6 && current; i += 1) {
        const node = nodeById.get(current);
        if (!node) break;
        titles.unshift(node.title);
        current = parentById.get(current);
      }
      return titles.join(" -> ");
    };

    const resolveBranchId = (nodeId: string): string | null => {
      let current = nodeId;
      let parent = parentById.get(current);
      while (parent && parent !== rootId) {
        current = parent;
        parent = parentById.get(current);
      }
      return parent === rootId ? current : null;
    };

    const isInBranch = (nodeId: string, branchId: string) => {
      let current: string | undefined = nodeId;
      for (let i = 0; i < 8 && current; i += 1) {
        if (current === branchId) return true;
        current = parentById.get(current);
      }
      return false;
    };

    const segments: Array<{ text: string; lineIndices: number[] }> = [];
    for (let i = 0; i < lyricLines.length; i += 1) {
      const line = lyricLines[i]?.trim();
      if (!line) continue;
      const next = lyricLines[i + 1]?.trim();
      if (next) {
        segments.push({
          text: `${line} / ${next}`,
          lineIndices: [i, i + 1],
        });
        i += 1;
      } else {
        segments.push({ text: line, lineIndices: [i] });
      }
    }

    const nodeScores = new Map<
      string,
      {
        score: number;
        bestScore: number;
        matches: string[];
        phraseHits: number;
        segment: { text: string; lineIndices: number[] };
      }
    >();

    const segmentScores: Array<
      Map<
        string,
        {
          score: number;
          matches: string[];
          phraseHits: number;
          segment: { text: string; lineIndices: number[] };
        }
      >
    > = segments.map(() => new Map());

    const minScore = 1.8;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const lineTokens = new Set(tokenize(segment.text));
      if (lineTokens.size === 0) continue;
      const lineText = segment.text.toLowerCase();
      for (const node of ideologyDoc.nodes) {
        if (node.id === rootId) continue;
        if (!descendants.has(node.id)) continue;
        const tokens = getTokens(node.id);
        if (tokens.size === 0) continue;
        const matches: string[] = [];
        lineTokens.forEach((token) => {
          if (tokens.has(token)) matches.push(token);
        });
        const hint = IDEOLOGY_HINTS[node.id];
        const phraseHits = hint
          ? hint.phrases.filter((phrase) => lineText.includes(phrase)).length
          : 0;
        const overlapRatio = matches.length / Math.max(1, lineTokens.size);
        const score = matches.length + phraseHits * 3 + overlapRatio * 2;
        if (score < minScore) continue;
        const segmentMap = segmentScores[segmentIndex];
        if (segmentMap) {
          segmentMap.set(node.id, {
            score,
            matches,
            phraseHits,
            segment,
          });
        }
        const existing = nodeScores.get(node.id);
        if (!existing) {
          nodeScores.set(node.id, {
            score,
            bestScore: score,
            matches,
            phraseHits,
            segment,
          });
        } else {
          existing.score += score;
          if (score > existing.bestScore) {
            existing.bestScore = score;
            existing.matches = matches;
            existing.phraseHits = phraseHits;
            existing.segment = segment;
          }
        }
      }
    }

    const branchScores = new Map<string, number>();
    nodeScores.forEach((entry, nodeId) => {
      const branchId = resolveBranchId(nodeId);
      if (!branchId) return;
      branchScores.set(branchId, (branchScores.get(branchId) ?? 0) + entry.score);
    });

    const rng = createSeededRng(meaningSeed ?? hashSeed("meaning-default"));
    const branchCandidates = Array.from(branchScores.entries()).map(
      ([branchId, score]) => ({
        item: branchId,
        weight: Math.max(0.1, score),
      }),
    );
    const selectedBranches = new Set<string>();
    if (branchCandidates.length > 0) {
      const first = pickWeighted(branchCandidates, rng);
      if (first) selectedBranches.add(first);
      if (branchCandidates.length > 1) {
        const second = pickWeighted(
          branchCandidates.filter((candidate) => candidate.item !== first),
          rng,
        );
        if (second) selectedBranches.add(second);
      }
    }

    const allScoredNodes = Array.from(nodeScores.entries()).map(([nodeId, entry]) => ({
      nodeId,
      ...entry,
    }));

    const usedNodes = new Set<string>();
    const picks: Array<{
      nodeId: string;
      score: number;
      matches: string[];
      phraseHits: number;
      segment: { text: string; lineIndices: number[] };
    }> = [];
    const maxCards = Math.min(6, Math.max(3, Math.ceil(segments.length / 2)));

    for (const segmentMap of segmentScores) {
      if (!segmentMap || picks.length >= maxCards) break;
      let candidates = Array.from(segmentMap.entries())
        .map(([nodeId, entry]) => ({ nodeId, ...entry }))
        .filter((entry) => !usedNodes.has(entry.nodeId));
      if (selectedBranches.size > 0) {
        const filtered = candidates.filter((entry) => {
          for (const branchId of selectedBranches) {
            if (isInBranch(entry.nodeId, branchId)) return true;
          }
          return false;
        });
        if (filtered.length) candidates = filtered;
      }
      const pick = pickWeighted(
        candidates.map((entry) => ({ item: entry, weight: entry.score })),
        rng,
      );
      if (pick) {
        usedNodes.add(pick.nodeId);
        picks.push(pick);
      }
    }

    if (picks.length < maxCards && allScoredNodes.length) {
      const remaining = allScoredNodes
        .filter((entry) => !usedNodes.has(entry.nodeId))
        .sort((a, b) => b.score - a.score);
      for (const entry of remaining) {
        if (picks.length >= maxCards) break;
        picks.push(entry);
        usedNodes.add(entry.nodeId);
      }
    }

    const cards = picks.map((entry) => {
      const node = nodeById.get(entry.nodeId);
      if (!node) return null;
      const confidence =
        entry.score >= 6 ? "High" : entry.score >= 3.2 ? "Medium" : "Low";
      const matchLabel = entry.matches.slice(0, 3).join(", ");
      const focus = IDEOLOGY_HINTS[entry.nodeId]?.focus;
      const parallel = matchLabel
        ? `This line echoes ${node.title} through ${matchLabel}.`
        : focus
          ? `This line echoes ${node.title} (${focus}).`
          : `This line echoes ${node.title}.`;
      const evidence = matchLabel
        ? `Evidence: ${matchLabel}.`
        : "Evidence: thematic overlap within the branch.";
      return {
        nodeId: entry.nodeId,
        nodeTitle: node.title,
        nodePath: buildPath(entry.nodeId),
        confidence,
        lyricQuote: entry.segment.text,
        parallel,
        why: evidence,
        reasonPath,
        lineIndices: entry.segment.lineIndices,
      };
    });

    const resolved = cards.filter(Boolean) as MeaningCard[];
    if (cacheKey) {
      meaningCacheRef.current.set(cacheKey, resolved);
      if (allowPersistentCache && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(resolved));
        } catch {
          // ignore cache write failures
        }
      }
    }
    return resolved;
  }, [
    ideologyDoc,
    lyricLines,
    lyricsHash,
    meaningSeedOverrideKey,
    meaningSeedTick,
    original?.id,
  ]);

  const handleRegenerateMeaning = useCallback(() => {
    if (!meaningSeedOverrideKey) return;
    const nextSeed =
      typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 1_000_000_000);
    meaningSeedOverridesRef.current.set(meaningSeedOverrideKey, nextSeed);
    setMeaningSeedTick((prev) => prev + 1);
  }, [meaningSeedOverrideKey]);

  const currentLyricIndex = useMemo(() => {
    if (!duration || lyricLines.length === 0) return -1;
    const progress = clamp01(currentTime / duration);
    const index = Math.floor(progress * lyricLines.length);
    return Math.min(lyricLines.length - 1, Math.max(0, index));
  }, [currentTime, duration, lyricLines.length]);

  const currentIndex = useMemo(
    () => playlist.findIndex((entry) => entry.id === original?.id),
    [original?.id, playlist],
  );
  const canSelectPrev =
    typeof onSelectOriginal === "function" && currentIndex > 0;
  const canSelectNext =
    typeof onSelectOriginal === "function" &&
    currentIndex >= 0 &&
    currentIndex < playlist.length - 1;
  const timeSky = details?.timeSky;
  const pulseSeedData = useMemo(
    () => buildPulseSeed({ originalId: original?.id, timeSky }),
    [original?.id, timeSky],
  );
  const pulseSeed = pulseSeedData.seed;
  const pulseSeedSalt = pulseSeedData.seedSalt;

  const handlePrev = useCallback(() => {
    if (!canSelectPrev || !onSelectOriginal) return;
    onSelectOriginal(playlist[currentIndex - 1]);
  }, [canSelectPrev, currentIndex, onSelectOriginal, playlist]);

  const handleNext = useCallback(() => {
    if (!canSelectNext || !onSelectOriginal) return;
    onSelectOriginal(playlist[currentIndex + 1]);
  }, [canSelectNext, currentIndex, onSelectOriginal, playlist]);

  const handleVary = useCallback(
    (preset?: MoodPreset) => {
      if (!onVary || isVarying) return;
      onVary(preset, listenerMacros, pulseSeed);
    },
    [isVarying, listenerMacros, onVary, pulseSeed],
  );

  const handleOpenLyricsEditor = useCallback(() => {
    setLyricsDraft(details?.lyrics ?? "");
    setLyricsEditorOpen(true);
  }, [details?.lyrics]);

  const handleOpenIntentEditor = useCallback(() => {
    const tempo = details?.tempo ?? original?.tempo;
    setIntentDraft(buildIntentContractDraft(details?.intentContract, tempo));
    setIntentEditorOpen(true);
  }, [details?.intentContract, details?.tempo, original?.tempo]);

  const handleIntentRangeChange = useCallback(
    (key: IntentRangeKey, field: "min" | "max", value: string) => {
      setIntentDraft((prev) => ({
        ...prev,
        ranges: {
          ...prev.ranges,
          [key]: { ...prev.ranges[key], [field]: value },
        },
      }));
    },
    [],
  );

  const handleSaveLyrics = useCallback(async () => {
    if (!original) return;
    const nextLyrics = lyricsDraft.trim();
    setLyricsSaving(true);
    try {
      const payload = await updateOriginalLyrics(original.id, nextLyrics);
      const nextDetails: OriginalDetails = {
        ...(details ?? original),
        lyrics: payload.lyrics || undefined,
        timeSky: details?.timeSky,
        playback: details?.playback,
        processing: details?.processing,
        intentSnapshot: details?.intentSnapshot,
        intentContract: details?.intentContract,
      };
      setDetails(nextDetails);
      detailsCacheRef.current.set(original.id, nextDetails);
      setLyricsEditorOpen(false);
      toast({
        title: nextLyrics ? "Lyrics saved" : "Lyrics cleared",
        description: nextLyrics
          ? "Lyrics are now attached to this original."
          : "Lyrics were removed from this original.",
      });
    } catch (error) {
      toast({
        title: "Lyrics update failed",
        description:
          error instanceof Error ? error.message : "Unable to save lyrics.",
        variant: "destructive",
      });
    } finally {
      setLyricsSaving(false);
    }
  }, [details, lyricsDraft, original, toast]);

  const handleSaveIntentContract = useCallback(async () => {
    if (!original) return;
    setIntentSaving(true);
    try {
      const contractPayload = buildIntentContractFromDraft(
        intentDraft,
        details?.intentContract,
      );
      const response = await updateOriginalIntentContract(
        original.id,
        contractPayload,
      );
      const nextDetails: OriginalDetails = {
        ...(details ?? original),
        lyrics: details?.lyrics,
        timeSky: details?.timeSky,
        playback: details?.playback,
        processing: details?.processing,
        intentSnapshot: details?.intentSnapshot,
        intentContract: response.intentContract ?? undefined,
      };
      setDetails(nextDetails);
      detailsCacheRef.current.set(original.id, nextDetails);
      setIntentEditorOpen(false);
      toast({
        title: response.intentContract ? "Intent contract saved" : "Contract cleared",
        description: response.intentContract
          ? "This original now has a creator intent contract."
          : "Intent contract removed from this original.",
      });
    } catch (error) {
      toast({
        title: "Intent contract update failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to save the intent contract.",
        variant: "destructive",
      });
    } finally {
      setIntentSaving(false);
    }
  }, [details, intentDraft, original, toast]);

  const handleSaveRecipe = useCallback(async () => {
    const name = recipeName.trim();
    if (!name) {
      toast({
        title: "Name the recipe",
        description: "Add a name before saving this recipe.",
      });
      return;
    }
    if (!original) {
      toast({
        title: "Pick a track first",
        description: "Select a track before saving a recipe.",
      });
      return;
    }
    const bars = Math.max(
      4,
      details?.tempo?.barsInLoop ?? original.tempo?.barsInLoop ?? 8,
    );
    const coverRequest = buildMacroCoverRequest({
      originalId: original.id,
      macros: listenerMacros,
      bars,
      tempo: details?.tempo ?? original.tempo,
    });
    setRecipeSaving(true);
    try {
      const saved = await saveRecipe({
        name,
        coverRequest,
        notes: recipeNotes.trim() || undefined,
      });
      setEditionRecipes((prev) => {
        const filtered = prev.filter((entry) => entry.id !== saved.id);
        return [saved, ...filtered];
      });
      setSelectedEditionId(saved.id);
      setRecipeName("");
      setRecipeNotes("");
      setRecipeOpen(false);
      toast({
        title: "Recipe saved",
        description: `Saved ${name} for ${original.title}.`,
      });
    } catch (error) {
      toast({
        title: "Recipe save failed",
        description:
          error instanceof Error ? error.message : "Unable to save recipe.",
        variant: "destructive",
      });
    } finally {
      setRecipeSaving(false);
    }
  }, [details?.tempo, listenerMacros, original, recipeName, recipeNotes, toast]);

  const handleCopyText = useCallback(
    async (value: string, label: string) => {
      if (!value) return;
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast({
          title: `${label} unavailable`,
          description: "Clipboard access is not available here.",
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        toast({
          title: `${label} copied`,
          description: value,
        });
      } catch (error) {
        toast({
          title: `${label} copy failed`,
          description:
            error instanceof Error ? error.message : "Unable to copy.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const previewMoods = moodPresets.slice(0, 5);
  const showVaryControls = Boolean(onVary) && previewMoods.length > 0;
  const macroLocks = listenerMacros.locks ?? {};
  const hasMacroUndo = Boolean(listenerUndoRef.current);
  const showLyricsPanel = lyricsOpen && !isMobile;
  const showLyricsDrawer = lyricsOpen && isMobile;
  const initials = buildInitials(original?.title, original?.artist);
  const stemCount = details?.stemCount ?? original?.stemCount ?? 0;
  const canRemix = stemCount > 0;
  const remixLoading = remixStatus === "loading";
  const remixReady = remixPlayable;
  const isReady = (hasPlayable && !isLoading) || remixReady;
  const remixLabel = remixLoading
    ? "Loading stems"
    : remixStatus === "active"
      ? "Remix live"
      : remixReady
        ? "Remix ready"
        : "Remix";
  const featuredEditions = useMemo(() => {
    return editionRecipes
      .filter((recipe) => recipe.featured)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  }, [editionRecipes]);
  const editionById = useMemo(() => {
    return new Map(editionRecipes.map((recipe) => [recipe.id, recipe]));
  }, [editionRecipes]);
  const editionTree = useMemo(
    () => buildEditionTree(editionRecipes),
    [editionRecipes],
  );
  const selectedEdition = useMemo(() => {
    if (selectedEditionId) {
      const match = editionById.get(selectedEditionId);
      if (match) return match;
    }
    return featuredEditions[0] ?? editionRecipes[0] ?? null;
  }, [editionById, editionRecipes, featuredEditions, selectedEditionId]);
  const selectedEditionParent = useMemo(() => {
    if (!selectedEdition?.parentId) return null;
    return editionById.get(selectedEdition.parentId) ?? null;
  }, [editionById, selectedEdition]);
  const selectedEditionPlanDeltas = useMemo(() => {
    if (!selectedEdition) return [];
    return summarizeEditionDelta(selectedEdition, selectedEditionParent);
  }, [selectedEdition, selectedEditionParent]);
  const selectedEditionMoodDeltas = useMemo(() => {
    if (!selectedEdition) return [];
    return summarizeMoodDelta(selectedEdition, selectedEditionParent);
  }, [selectedEdition, selectedEditionParent]);
  const selectedReceiptChips = useMemo(
    () => buildReceiptChips(selectedEdition?.receipt),
    [selectedEdition?.receipt],
  );
  const intentContract = details?.intentContract;
  const intentSummary = useMemo(() => {
    if (!intentContract) return null;
    const sections: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [];
    const invariants: Array<{ label: string; value: string }> = [];
    if (intentContract.invariants?.tempoBpm != null) {
      invariants.push({
        label: "Tempo",
        value: `${intentContract.invariants.tempoBpm} BPM`,
      });
    }
    if (intentContract.invariants?.timeSig) {
      invariants.push({
        label: "Time signature",
        value: intentContract.invariants.timeSig,
      });
    }
    if (intentContract.invariants?.key) {
      invariants.push({ label: "Key", value: intentContract.invariants.key });
    }
    if (intentContract.invariants?.grooveTemplateIds?.length) {
      invariants.push({
        label: "Groove IDs",
        value: intentContract.invariants.grooveTemplateIds.join(", "),
      });
    }
    if (intentContract.invariants?.motifIds?.length) {
      invariants.push({
        label: "Motif IDs",
        value: intentContract.invariants.motifIds.join(", "),
      });
    }
    if (intentContract.invariants?.stemLocks?.length) {
      invariants.push({
        label: "Stem locks",
        value: intentContract.invariants.stemLocks.join(", "),
      });
    }
    if (invariants.length) {
      sections.push({ title: "Invariants", rows: invariants });
    }

    const ranges: Array<{ label: string; value: string }> = [];
    for (const field of INTENT_RANGE_FIELDS) {
      const rangeValue = intentContract.ranges?.[field.key];
      if (rangeValue) {
        ranges.push({
          label: field.label,
          value: `${Math.round(rangeValue.min * 100)}-${Math.round(
            rangeValue.max * 100,
          )}%`,
        });
      }
    }
    if (intentContract.ranges?.arrangementMoves?.length) {
      ranges.push({
        label: "Moves",
        value: intentContract.ranges.arrangementMoves.join(", "),
      });
    }
    if (ranges.length) {
      sections.push({ title: "Ranges", rows: ranges });
    }

    const meaning: Array<{ label: string; value: string }> = [];
    if (intentContract.meaning?.ideologyRootId) {
      meaning.push({
        label: "Ideology root",
        value: intentContract.meaning.ideologyRootId,
      });
    }
    if (intentContract.meaning?.allowedNodeIds?.length) {
      meaning.push({
        label: "Allowed nodes",
        value: intentContract.meaning.allowedNodeIds.join(", "),
      });
    }
    if (meaning.length) {
      sections.push({ title: "Meaning", rows: meaning });
    }

    const provenance: Array<{ label: string; value: string }> = [];
    if (intentContract.provenancePolicy?.storeTimeSky != null) {
      provenance.push({
        label: "Store Time & Sky",
        value: intentContract.provenancePolicy.storeTimeSky ? "Yes" : "No",
      });
    }
    if (intentContract.provenancePolicy?.storePulse != null) {
      provenance.push({
        label: "Store pulse",
        value: intentContract.provenancePolicy.storePulse ? "Yes" : "No",
      });
    }
    if (intentContract.provenancePolicy?.pulseSource) {
      provenance.push({
        label: "Pulse source",
        value: formatPulseSource(intentContract.provenancePolicy.pulseSource),
      });
    }
    if (intentContract.provenancePolicy?.placePrecision) {
      provenance.push({
        label: "Place precision",
        value: intentContract.provenancePolicy.placePrecision,
      });
    }
    if (provenance.length) {
      sections.push({ title: "Provenance", rows: provenance });
    }

    return {
      sections,
      notes: intentContract.notes?.trim() || "",
    };
  }, [intentContract]);
  const context = resolveTimeSkyContext(timeSky);
  const pulse = resolveTimeSkyPulse(timeSky);
  const placeValue = context.place?.trim();
  const placePrecision = context.placePrecision ?? "approximate";
  const placeLabel =
    placePrecision === "hidden"
      ? "Hidden"
      : placeValue
        ? placePrecision === "approximate"
          ? `${placeValue} (approx)`
          : placeValue
        : "Not provided";
  const publishedLabel =
    formatIsoDate(
      context.publishedAt ?? details?.uploadedAt ?? original?.uploadedAt,
    ) ?? "Unknown";
  const madeLabel = formatYearMonthRange(
    context.composedStart,
    context.composedEnd,
  );
  const skyLabel = context.skySignature?.trim() || "Unavailable";
  const pulseRound = pulse.round;
  const pulseHashLabel = pulse.valueHash ? String(pulse.valueHash) : "";
  const pulseTimeLabel = pulse.pulseTime
    ? formatIsoDate(pulse.pulseTime) ?? String(pulse.pulseTime)
    : null;
  const pulseLabel =
    pulseRound != null
      ? `Round ${pulseRound}`
      : pulseTimeLabel
        ? `Time ${pulseTimeLabel}`
        : "Not seeded";
  const pulseDisplay = pulseHashLabel
    ? `${pulseLabel} (${pulseHashLabel.slice(0, 10)}...)`
    : pulseLabel;
  const pulseSourceLabel = formatPulseSource(pulse.source);
  const macroControls = (
    <div className="space-y-4">
      {[
        { key: "energy", label: "Energy", value: listenerMacros.energy },
        { key: "space", label: "Space", value: listenerMacros.space },
        { key: "texture", label: "Texture", value: listenerMacros.texture },
        { key: "weirdness", label: "Weirdness", value: listenerMacros.weirdness ?? 0 },
        { key: "drive", label: "Drive", value: listenerMacros.drive ?? 0 },
      ].map((macro) => (
        <div key={macro.key}>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>{macro.label}</span>
            <span>{Math.round(macro.value * 100)}%</span>
          </div>
          <Slider
            value={[macro.value]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(value) =>
              handleListenerMacroChange(
                macro.key as keyof ListenerMacros,
                value[0] ?? 0,
              )
            }
            className="mt-2"
          />
        </div>
      ))}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Locks
        </div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span>Groove</span>
            <Switch
              checked={Boolean(macroLocks.groove)}
              onCheckedChange={(value) =>
                handleListenerLockChange("groove", value)
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Harmony</span>
            <Switch
              checked={Boolean(macroLocks.harmony)}
              onCheckedChange={(value) =>
                handleListenerLockChange("harmony", value)
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Drums</span>
            <Switch
              checked={Boolean(macroLocks.drums)}
              onCheckedChange={(value) =>
                handleListenerLockChange("drums", value)
              }
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Locks keep core motifs anchored while you vary the surface.
        </p>
      </div>
    </div>
  );
  const timeSkyPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-2 text-xs">
          <Info className="h-4 w-4" />
          Time & Sky
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 border border-white/10 bg-slate-950 text-slate-100">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Published</span>
            <span>{publishedLabel}</span>
          </div>
          {madeLabel ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Made</span>
              <span>{madeLabel}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Place</span>
            <span>{placeLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Sky signature</span>
            <div className="flex items-center gap-2">
              <span className="max-w-[140px] truncate">{skyLabel}</span>
              {skyLabel !== "Unavailable" ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => handleCopyText(skyLabel, "Sky signature")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Pulse source</span>
            <span>{pulseSourceLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Variation pulse</span>
            <div className="flex items-center gap-2">
              <span className="max-w-[140px] truncate">{pulseDisplay}</span>
              {pulseHashLabel ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() =>
                    handleCopyText(pulseHashLabel, "Variation pulse")
                  }
                >
                  <Copy className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
          </div>
          {pulseSeedSalt ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Seed salt</span>
              <div className="flex items-center gap-2">
                <span className="max-w-[140px] truncate">
                  {pulseSeedSalt.slice(0, 10)}...
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => handleCopyText(pulseSeedSalt, "Seed salt")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : null}
          <Button asChild variant="outline" size="sm" className="mt-2 w-full text-xs">
            <a href="/halobank" target="_blank" rel="noreferrer">
              Explore timeline
            </a>
          </Button>
          <p className="text-[11px] text-slate-500">
            Provenance note: pulse data is a public salt for replay, not a security key.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
  const intentContractPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-2 text-xs">
          <SlidersHorizontal className="h-4 w-4" />
          Intent Contract
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 border border-white/10 bg-slate-950 text-slate-100">
        {intentSummary ? (
          <div className="space-y-3 text-xs">
            {intentSummary.sections.length ? (
              intentSummary.sections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {section.title}
                  </div>
                  {section.rows.map((row) => (
                    <div
                      key={`${section.title}-${row.label}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-400">{row.label}</span>
                      <span className="max-w-[160px] truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-slate-400">No explicit constraints recorded.</p>
            )}
            {intentSummary.notes ? (
              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-[11px] text-slate-300">
                {intentSummary.notes}
              </div>
            ) : null}
            {canEditContract ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={handleOpenIntentEditor}
              >
                {intentContract ? "Edit contract" : "Add contract"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-xs text-slate-400">
            <p>No intent contract recorded.</p>
            {canEditContract ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={handleOpenIntentEditor}
              >
                Add contract
              </Button>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
  const lyricsBody = (
    <>
      {detailsLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lyrics
        </div>
      ) : detailsError ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {detailsError}
        </div>
      ) : lyricLines.length ? (
        <div className="mt-3 space-y-2 text-sm leading-relaxed">
          {lyricLines.map((line, index) => {
            const isActive = index === currentLyricIndex;
            return (
              <p
                key={`${index}-${line}`}
                className={cn(
                  "transition-colors",
                  !line && "h-3",
                  isActive && "text-sky-100",
                )}
              >
                {line || "\u00A0"}
              </p>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground">
          Lyrics not available for this song.
        </div>
      )}
    </>
  );
  const meaningBody = (
    <div className="space-y-4">
      {meaningCards.length ? (
        <div className="space-y-3">
          {meaningCards.map((card) => {
            const isActive =
              currentLyricIndex >= 0 &&
              card.lineIndices.includes(currentLyricIndex);
            return (
              <div
                key={`${card.nodeId}-${card.lyricQuote}`}
                className={cn(
                  "rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200",
                  isActive &&
                    "border-sky-400/60 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.35)]",
                )}
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                  <span>{card.nodeTitle}</span>
                  <span>{card.confidence}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {card.nodePath}
                </div>
                <p className="mt-2 text-sm">{card.parallel}</p>
                <p className="mt-2 text-xs text-slate-400">
                  &ldquo;{card.lyricQuote}&rdquo;
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  Baseline: {card.reasonPath}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{card.why}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          Add lyrics to generate ideology parallels.
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Interpretation, not author intent.</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!meaningSeedOverrideKey}
          onClick={handleRegenerateMeaning}
        >
          Regenerate meaning
        </Button>
      </div>
    </div>
  );

  useEffect(() => {
    if (!editionRecipes.length) {
      if (selectedEditionId) {
        setSelectedEditionId(null);
      }
      return;
    }
    if (
      selectedEditionId &&
      editionRecipes.some((entry) => entry.id === selectedEditionId)
    ) {
      return;
    }
    const nextId = featuredEditions[0]?.id ?? editionRecipes[0]?.id ?? null;
    setSelectedEditionId(nextId);
  }, [editionRecipes, featuredEditions, selectedEditionId]);

  const renderEditionNode = (node: EditionNode, depth = 0) => {
    const parent = node.recipe.parentId
      ? editionById.get(node.recipe.parentId)
      : null;
    const planDeltas = summarizeEditionDelta(node.recipe, parent);
    const moodDeltas = summarizeMoodDelta(node.recipe, parent);
    const idiLabel = formatPercent(node.recipe.metrics?.idi);
    const intentLabel = formatPercent(
      node.recipe.receipt?.contract?.intentSimilarity,
    );
    const isSelected = selectedEdition?.id === node.recipe.id;
    return (
      <div key={node.recipe.id} style={{ marginLeft: depth * 14 }}>
        <div
          className={cn(
            "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm",
            isSelected && "border-sky-400/60 bg-sky-500/10",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-slate-100">
                {node.recipe.name}
              </div>
              <div className="text-[10px] text-slate-400">
                {formatTimestamp(node.recipe.updatedAt)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {node.recipe.featured ? (
                <Badge
                  variant="secondary"
                  className="bg-amber-500/20 text-amber-100"
                >
                  Featured
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant={isSelected ? "secondary" : "outline"}
                onClick={() => setSelectedEditionId(node.recipe.id)}
              >
                {isSelected ? "Selected" : "Select"}
              </Button>
            </div>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Plan Δ: {planDeltas.length ? planDeltas.join(", ") : "--"}
          </div>
          <div className="text-[10px] text-slate-400">
            Mood Δ: {moodDeltas.length ? moodDeltas.join(", ") : "--"}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
            <span>IDI {idiLabel}</span>
            <span>Intent {intentLabel}</span>
          </div>
        </div>
        {node.children.length ? (
          <div className="mt-2 space-y-2">
            {node.children.map((child) => renderEditionNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    if (!original) {
      setAutoPlayPending(false);
      return;
    }
    if (typeof autoPlayToken !== "number") return;
    if (lastAutoPlayRef.current === autoPlayToken) return;
    lastAutoPlayRef.current = autoPlayToken;
    setAutoPlayPending(true);
  }, [autoPlayToken, original]);

  useEffect(() => {
    if (!autoPlayPending) return;
    if (!isReady || isPlaying) return;
    void handlePlay({ reportError: false });
    setAutoPlayPending(false);
  }, [autoPlayPending, handlePlay, isPlaying, isReady]);

  return (
    <div className="rounded-3xl border border-border bg-background/70 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800/80 via-slate-900 to-slate-950 text-2xl font-semibold text-slate-100 shadow-inner">
              {initials}
            </div>
            <div className="flex flex-1 flex-col justify-center gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                Now Playing
              </div>
              <div className="text-xl font-semibold text-slate-100">
                {original?.title ?? "Select a song"}
              </div>
              <div className="text-sm text-muted-foreground">
                {original?.artist ?? "-"}
              </div>
              {sourceLabel ? (
                <div className="text-xs text-muted-foreground">{sourceLabel}</div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={lyricsOpen ? "secondary" : "ghost"}
              onClick={() => setLyricsOpen((prev) => !prev)}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Lyrics
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              disabled={!canSelectPrev}
              onClick={handlePrev}
              aria-label="Previous song"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              disabled={!isReady}
              onClick={isPlaying ? handlePause : () => handlePlay()}
              aria-label={isPlaying ? "Pause song" : "Play song"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={!canSelectNext}
              onClick={handleNext}
              aria-label="Next song"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-w-[200px] flex-1">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 1}
              step={0.25}
              disabled={!isReady}
              onValueChange={(value) => handleSeek(value[0] ?? 0)}
              className={cn(!isReady && "opacity-50")}
            />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div className="flex min-w-[120px] items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[volume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(value) => setVolume(value[0] ?? 0)}
            />
          </div>
        </div>

        {showVaryControls ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                disabled={!isReady || isVarying}
                onClick={() => handleVary(previewMoods[0])}
              >
                <Sparkles className="h-4 w-4" />
                Vary
              </Button>
              {previewMoods.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="outline"
                  className="rounded-full text-xs"
                  disabled={!isReady || isVarying}
                  onClick={() => handleVary(preset)}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!isReady}
                onClick={() => setCustomizeOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Customize
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!original || recipeSaving}
                onClick={() => setRecipeOpen(true)}
              >
                <BookmarkPlus className="h-4 w-4" />
                Save / Share
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasMacroUndo}
                onClick={handleMacroUndo}
              >
                Undo
              </Button>
              <Button size="sm" variant="ghost" onClick={handleMacroReset}>
                Reset
              </Button>
            </div>
            {varyStatus ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {varyStatus.status === "ready"
                    ? "Latest variation ready."
                    : varyStatus.status === "error"
                      ? "Variation failed."
                      : "Rendering variation..."}
                </span>
                {varyStatus.previewUrl &&
                !varyStatus.previewUrl.startsWith("blob:") ? (
                  <Button asChild size="sm" variant="secondary" className="text-xs">
                    <a
                      href={varyStatus.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open preview
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {editionLoading || editionError || editionRecipes.length ? (
          <div className="rounded-xl border border-border/60 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Editions
              </div>
              {editionLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading editions
                </div>
              ) : null}
            </div>
            {editionError ? (
              <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {editionError}
              </div>
            ) : null}
            {!editionLoading && !editionRecipes.length ? (
              <div className="mt-2 text-xs text-muted-foreground">
                No editions saved yet.
              </div>
            ) : editionRecipes.length ? (
              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Official Editions
                    </div>
                    <div className="mt-2 space-y-2">
                      {featuredEditions.length ? (
                        featuredEditions.map((recipe) => {
                          const isSelected = selectedEdition?.id === recipe.id;
                          return (
                            <div
                              key={recipe.id}
                              className={cn(
                                "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2",
                                isSelected && "border-sky-400/60 bg-sky-500/10",
                              )}
                            >
                              <div>
                                <div className="text-[11px] font-semibold text-slate-100">
                                  {recipe.name}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {formatTimestamp(recipe.updatedAt)}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant={isSelected ? "secondary" : "outline"}
                                onClick={() => setSelectedEditionId(recipe.id)}
                              >
                                {isSelected ? "Selected" : "Select"}
                              </Button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          No featured editions yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Lineage
                    </div>
                    <div className="mt-2 space-y-2">
                      {editionTree.length ? (
                        editionTree.map((node) => renderEditionNode(node, 0))
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          No lineage captured yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    <span>Receipts</span>
                    {selectedEdition?.receipt?.createdAt ? (
                      <span className="text-[10px] text-slate-500">
                        {formatTimestamp(selectedEdition.receipt.createdAt)}
                      </span>
                    ) : null}
                  </div>
                  {selectedEdition ? (
                    <>
                      <div className="mt-2 text-xs font-semibold text-slate-100">
                        {selectedEdition.name}
                      </div>
                      {selectedReceiptChips.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedReceiptChips.map((chip) => (
                            <Badge
                              key={`${selectedEdition.id}-${chip}`}
                              variant="secondary"
                              className="bg-slate-800/80 text-slate-200"
                            >
                              {chip}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">
                          Receipt recorded.
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-slate-400">
                        Plan Δ:{" "}
                        {selectedEditionPlanDeltas.length
                          ? selectedEditionPlanDeltas.join(", ")
                          : "--"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Mood Δ:{" "}
                        {selectedEditionMoodDeltas.length
                          ? selectedEditionMoodDeltas.join(", ")
                          : "--"}
                      </div>
                      <div className="mt-2 grid gap-1 text-[11px] text-slate-400">
                        <div>IDI {formatPercent(selectedEdition.metrics?.idi)}</div>
                        <div>
                          Intent{" "}
                          {formatPercent(
                            selectedEdition.receipt?.contract?.intentSimilarity,
                          )}
                        </div>
                        {selectedEdition.receipt?.contract?.hash ? (
                          <div>
                            Contract {formatHashShort(selectedEdition.receipt.contract.hash)}
                          </div>
                        ) : null}
                        {selectedEdition.receipt?.ideology?.mappingHash ? (
                          <div>
                            Ideology {formatHashShort(selectedEdition.receipt.ideology.mappingHash)}
                          </div>
                        ) : null}
                        {selectedEdition.receipt?.provenance?.pulse?.valueHash ? (
                          <div>
                            Pulse {formatHashShort(selectedEdition.receipt.provenance.pulse.valueHash)}
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Select an edition to view receipts.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {canRemix ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant={remixReady ? "secondary" : "outline"}
              className="gap-2"
              disabled={remixLoading || remixStatus === "active"}
              onClick={handleRemix}
            >
              {remixLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {remixLabel}
            </Button>
            {remixStatus === "error" && remixError ? (
              <span className="text-xs text-amber-200">{remixError}</span>
            ) : null}
            {remixReady && remixGroups.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                Grouped stems ready.
              </span>
            ) : null}
          </div>
        ) : null}

        {remixReady && remixGroups.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-slate-950/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Remix Groups
            </div>
            <div className="mt-3 grid gap-3">
              {remixGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-medium text-slate-200">
                    {group.label}
                  </div>
                  <Slider
                    value={[group.gain]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(value) =>
                      handleGroupGainChange(group.id, value[0] ?? 0)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {loadError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audio
          </div>
        ) : null}
      </div>

      {showLyricsPanel ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-slate-100">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="flex items-center">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Meaning
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {timeSkyPopover}
              {intentContractPopover}
              {canEditLyrics ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleOpenLyricsEditor}
                >
                  <PencilLine className="h-4 w-4" />
                  {details?.lyrics ? "Edit lyrics" : "Add lyrics"}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setLyricsOpen(false)}>
                Close
              </Button>
            </div>
            <div className="flex items-center justify-end">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Lyrics
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Playback is a lens for context, values, and provenance.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              {meaningBody}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              {lyricsBody}
            </div>
          </div>
        </div>
      ) : null}

      <Drawer open={showLyricsDrawer} onOpenChange={setLyricsOpen}>
        <DrawerContent className="flex max-h-[92vh] flex-col bg-slate-950 text-slate-100">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>Lyrics &amp; Meaning</DrawerTitle>
            <p className="text-xs text-slate-400">
              Playback is a lens for context, values, and provenance.
            </p>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {timeSkyPopover}
              {intentContractPopover}
              {canEditLyrics ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleOpenLyricsEditor}
                >
                  <PencilLine className="h-4 w-4" />
                  {details?.lyrics ? "Edit lyrics" : "Add lyrics"}
                </Button>
              ) : null}
            </div>
            <Tabs defaultValue="lyrics" className="mt-4">
              <TabsList className="bg-white/5">
                <TabsTrigger value="meaning">Meaning</TabsTrigger>
                <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              </TabsList>
              <TabsContent value="meaning">{meaningBody}</TabsContent>
              <TabsContent value="lyrics">{lyricsBody}</TabsContent>
            </Tabs>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DrawerContent className="bg-slate-950 text-slate-100">
          <DrawerHeader>
            <DrawerTitle>Customize</DrawerTitle>
            <p className="text-xs text-slate-400">
              Macro controls only. No mixing or stems in listener mode.
            </p>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {macroControls}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!hasMacroUndo}
                onClick={handleMacroUndo}
              >
                Undo
              </Button>
              <Button size="sm" variant="ghost" onClick={handleMacroReset}>
                Reset
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save / Share recipe</DialogTitle>
            <DialogDescription>
              Save your listener macros as a reusable recipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Recipe name"
              value={recipeName}
              onChange={(event) => setRecipeName(event.target.value)}
            />
            <Textarea
              rows={3}
              placeholder="Notes or intent (optional)"
              value={recipeNotes}
              onChange={(event) => setRecipeNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecipeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRecipe} disabled={recipeSaving}>
              {recipeSaving ? "Saving..." : "Save recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lyricsEditorOpen} onOpenChange={setLyricsEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {details?.lyrics ? "Edit lyrics" : "Add lyrics"}
            </DialogTitle>
            <DialogDescription>
              Paste or edit the lyrics for this original. Line breaks are preserved.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            placeholder="Paste lyrics here..."
            value={lyricsDraft}
            onChange={(event) => setLyricsDraft(event.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLyricsEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLyrics} disabled={lyricsSaving}>
              {lyricsSaving ? "Saving..." : "Save lyrics"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={intentEditorOpen} onOpenChange={setIntentEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Intent contract</DialogTitle>
            <DialogDescription>
              Define the invariants and allowable variation for this original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Contract enabled
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Toggle off to clear the intent contract.
                </p>
              </div>
              <Switch
                checked={intentDraft.enabled}
                onCheckedChange={(value) =>
                  setIntentDraft((prev) => ({ ...prev, enabled: value }))
                }
              />
            </div>

            {intentDraft.enabled ? (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Invariants
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Tempo (BPM)
                      <Input
                        value={intentDraft.tempoBpm}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            tempoBpm: event.target.value,
                          }))
                        }
                        placeholder="120"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Time signature
                      <Input
                        value={intentDraft.timeSig}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            timeSig: event.target.value,
                          }))
                        }
                        placeholder="4/4"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Key
                      <Input
                        value={intentDraft.key}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            key: event.target.value,
                          }))
                        }
                        placeholder="A minor"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Groove template IDs
                      <Input
                        value={intentDraft.grooveTemplateIds}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            grooveTemplateIds: event.target.value,
                          }))
                        }
                        placeholder="groove-1, groove-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Motif IDs
                      <Input
                        value={intentDraft.motifIds}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            motifIds: event.target.value,
                          }))
                        }
                        placeholder="motif-a, motif-b"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Stem locks
                      <Input
                        value={intentDraft.stemLocks}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            stemLocks: event.target.value,
                          }))
                        }
                        placeholder="drums, lead"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Variation ranges
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {INTENT_RANGE_FIELDS.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <div className="text-xs font-medium text-slate-200">
                          {field.label}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Input
                            value={intentDraft.ranges[field.key].min}
                            onChange={(event) =>
                              handleIntentRangeChange(
                                field.key,
                                "min",
                                event.target.value,
                              )
                            }
                            placeholder="Min"
                          />
                          <Input
                            value={intentDraft.ranges[field.key].max}
                            onChange={(event) =>
                              handleIntentRangeChange(
                                field.key,
                                "max",
                                event.target.value,
                              )
                            }
                            placeholder="Max"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Arrangement moves
                    <Input
                      value={intentDraft.arrangementMoves}
                      onChange={(event) =>
                        setIntentDraft((prev) => ({
                          ...prev,
                          arrangementMoves: event.target.value,
                        }))
                      }
                      placeholder="swap-hook, drop-drums"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Meaning anchors
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Ideology root
                      <Input
                        value={intentDraft.ideologyRootId}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            ideologyRootId: event.target.value,
                          }))
                        }
                        placeholder="worldview-integrity"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Allowed nodes
                      <Input
                        value={intentDraft.allowedNodeIds}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            allowedNodeIds: event.target.value,
                          }))
                        }
                        placeholder="stewardship-ledger, interbeing-systems"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Provenance policy
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                      Store Time &amp; Sky
                      <Switch
                        checked={intentDraft.storeTimeSky}
                        onCheckedChange={(value) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            storeTimeSky: value,
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                      Store pulse
                      <Switch
                        checked={intentDraft.storePulse}
                        onCheckedChange={(value) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            storePulse: value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Pulse source
                      <select
                        value={intentDraft.pulseSource}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            pulseSource: event.target.value as PulseSource,
                          }))
                        }
                        disabled={!intentDraft.storePulse}
                        className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <option value="drand">drand beacon</option>
                        <option value="nist-beacon">NIST beacon</option>
                        <option value="curby">CURBy beacon</option>
                        <option value="local-sky-photons">Local sky photons</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Place precision
                      <select
                        value={intentDraft.placePrecision}
                        onChange={(event) =>
                          setIntentDraft((prev) => ({
                            ...prev,
                            placePrecision: event.target.value as
                              | "exact"
                              | "approximate"
                              | "hidden",
                          }))
                        }
                        className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <option value="exact">Exact</option>
                        <option value="approximate">Approximate</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Notes
                  </div>
                  <Textarea
                    rows={3}
                    value={intentDraft.notes}
                    onChange={(event) =>
                      setIntentDraft((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Optional notes about the intent contract."
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                The intent contract is disabled for this original.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIntentEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveIntentContract} disabled={intentSaving}>
              {intentSaving ? "Saving..." : "Save contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default OriginalsPlayer;
