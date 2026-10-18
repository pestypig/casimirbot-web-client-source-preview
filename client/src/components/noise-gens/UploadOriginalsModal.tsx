import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "bad-words";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useKnowledgeProjectsStore } from "@/store/useKnowledgeProjectsStore";
import {
  finalizeOriginalUpload,
  fetchOriginalDetails,
  fetchNoisegenCapabilities,
  updateOriginalIntentSnapshotPreferences,
  updateOriginalMeta,
  uploadOriginal,
  uploadOriginalChunk,
} from "@/lib/api/noiseGens";
import type { KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import type {
  AbletonIntentSnapshot,
  IntentContract,
  IntentSnapshotPreferences,
  NoisegenCapabilities,
  PulseSource,
  TempoMeta,
  TimeSkyMeta,
} from "@/types/noise-gens";

type UploadOriginalsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthenticated: boolean;
  onRequestSignIn?: () => void;
  onUploaded?: (payload: UploadCompletePayload) => void;
  prefill?: UploadOriginalPrefill | null;
};

const MAX_TITLE = 120;
const MAX_CREATOR = 60;
const DEFAULT_TIME_SIG: TempoMeta["timeSig"] = "4/4";
const DIRECT_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const clampBpm = (value: number) => Math.max(40, Math.min(250, value));
const sanitizeBpmInput = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return clampBpm(numeric);
};
const isBpmInputValue = (value: string): boolean => /^[0-9.,\s]*$/.test(value);

const extractFileMetadata = (file: File): { title?: string; bpm?: number } => {
  const base = file.name.replace(/\.[^/.]+$/, "");
  const normalizedTitle = base.replace(/[_-]+/g, " ").trim();
  const bpmMatches = Array.from(base.matchAll(/(\d{2,3}(?:\.\d{1,2})?)\s*(?:bpm|bp|tempo)?/gi));
  let bpm: number | undefined;
  if (bpmMatches.length > 0) {
    const lastMatch = bpmMatches[bpmMatches.length - 1];
    const candidate = Number(lastMatch[1]);
    if (Number.isFinite(candidate)) {
      bpm = clampBpm(candidate);
    }
  }
  return {
    title: normalizedTitle || undefined,
    bpm,
  };
};

type FieldState = {
  value: string;
  error: string | null;
};

type StemCategory =
  | "mix"
  | "vocal"
  | "drums"
  | "bass"
  | "music"
  | "fx"
  | "other"
  | "ignore";

type StemEntry = {
  id: string;
  name: string;
  file: File;
  category: StemCategory;
  inferred: StemCategory;
};

type UploadFileProgress = {
  id: string;
  name: string;
  bytes: number;
  loaded: number;
  pct: number;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  error?: string;
};

type UploadQueueItem = {
  id: string;
  name: string;
  file: File;
  field: "instrumental" | "vocal" | "stems" | "intent";
  category?: StemCategory;
};

const STEM_CATEGORY_LABELS: Record<StemCategory, string> = {
  mix: "Mix",
  vocal: "Vocal",
  drums: "Drums",
  bass: "Bass",
  music: "Music",
  fx: "FX",
  other: "Other",
  ignore: "Ignore",
};

const STEM_CATEGORY_ORDER: StemCategory[] = [
  "mix",
  "vocal",
  "drums",
  "bass",
  "music",
  "fx",
  "other",
  "ignore",
];

type IntentRangeKey =
  | "sampleInfluence"
  | "styleInfluence"
  | "weirdness"
  | "reverbSend"
  | "chorus";

const INTENT_RANGE_FIELDS: Array<{ key: IntentRangeKey; label: string }> = [
  { key: "sampleInfluence", label: "Sample influence" },
  { key: "styleInfluence", label: "Style influence" },
  { key: "weirdness", label: "Weirdness" },
  { key: "reverbSend", label: "Reverb send" },
  { key: "chorus", label: "Chorus" },
];

const DEFAULT_INTENT_RANGES: Record<IntentRangeKey, { min: string; max: string }> = {
  sampleInfluence: { min: "", max: "" },
  styleInfluence: { min: "", max: "" },
  weirdness: { min: "", max: "" },
  reverbSend: { min: "", max: "" },
  chorus: { min: "", max: "" },
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const STEM_CATEGORY_STYLES: Record<StemCategory, string> = {
  mix: "border-sky-500/50 bg-sky-500/10 text-sky-100",
  vocal: "border-rose-500/50 bg-rose-500/10 text-rose-100",
  drums: "border-amber-500/50 bg-amber-500/10 text-amber-100",
  bass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-100",
  music: "border-cyan-500/50 bg-cyan-500/10 text-cyan-100",
  fx: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  other: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  ignore: "border-slate-600/30 bg-slate-800/20 text-slate-400",
};

const STEM_CATEGORY_RULES: Array<{
  category: StemCategory;
  tokens: string[];
}> = [
  { category: "mix", tokens: ["mix", "instrumental", "mixdown", "master"] },
  { category: "vocal", tokens: ["vocal", "vox", "acap", "chorus"] },
  {
    category: "drums",
    tokens: ["drum", "drums", "kick", "snare", "hat", "perc", "percussion", "clap"],
  },
  { category: "bass", tokens: ["bass", "sub"] },
  {
    category: "fx",
    tokens: ["fx", "sfx", "riser", "impact", "sweep", "whoosh", "noise"],
  },
  {
    category: "music",
    tokens: ["synth", "pad", "keys", "piano", "guitar", "string", "strings", "brass", "lead", "arp", "chord"],
  },
];

const inferStemCategory = (name: string): StemCategory => {
  const normalized = name.toLowerCase();
  for (const rule of STEM_CATEGORY_RULES) {
    if (rule.tokens.some((token) => normalized.includes(token))) {
      return rule.category;
    }
  }
  return "music";
};

const normalizeTimestamp = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const formatDateInput = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatMonthInput = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 7);
};

const formatDateTimeInput = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
};

const parseDateInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts.map((part) => Number(part));
    if ([year, month, day].every((part) => Number.isFinite(part))) {
      return Date.UTC(year, Math.max(0, month - 1), day);
    }
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMonthInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("-");
  if (parts.length === 2) {
    const [year, month] = parts.map((part) => Number(part));
    if ([year, month].every((part) => Number.isFinite(part))) {
      return Date.UTC(year, Math.max(0, month - 1), 1);
    }
  }
  const parsed = Date.parse(`${trimmed}-01`);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDateTimeInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

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

const parseRangeInput = (range: { min: string; max: string }) => {
  const minValue = parseOptionalNumber(range.min);
  const maxValue = parseOptionalNumber(range.max);
  if (minValue == null && maxValue == null) return undefined;
  const resolvedMin = clamp01(minValue ?? (maxValue ?? 0));
  const resolvedMax = clamp01(maxValue ?? (minValue ?? 0));
  return resolvedMax >= resolvedMin
    ? { min: resolvedMin, max: resolvedMax }
    : { min: resolvedMax, max: resolvedMin };
};

const hashSeedSalt = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
};

const normalizePulseSource = (value: unknown): PulseSource | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized === "drand" ||
    normalized === "nist-beacon" ||
    normalized === "curby" ||
    normalized === "local-sky-photons"
  ) {
    return normalized;
  }
  return undefined;
};

const normalizePlacePrecision = (
  value: unknown,
): "exact" | "approximate" | "hidden" | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized === "exact" || normalized === "approximate" || normalized === "hidden") {
    return normalized as "exact" | "approximate" | "hidden";
  }
  return undefined;
};

const normalizeTimeSkyMeta = (value: unknown): TimeSkyMeta | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const next: TimeSkyMeta = {};
  const contextInput =
    record.context && typeof record.context === "object"
      ? (record.context as Record<string, unknown>)
      : record;
  const context: NonNullable<TimeSkyMeta["context"]> = {};
  const publishedAt = normalizeTimestamp(contextInput.publishedAt);
  if (publishedAt != null) {
    next.publishedAt = publishedAt;
    context.publishedAt = publishedAt;
  }
  const composedStart = normalizeTimestamp(contextInput.composedStart);
  if (composedStart != null) {
    next.composedStart = composedStart;
    context.composedStart = composedStart;
  }
  const composedEnd = normalizeTimestamp(contextInput.composedEnd);
  if (composedEnd != null) {
    next.composedEnd = composedEnd;
    context.composedEnd = composedEnd;
  }
  if (typeof contextInput.timezone === "string" && contextInput.timezone.trim().length > 0) {
    context.timezone = contextInput.timezone.trim();
  }
  if (typeof contextInput.place === "string" && contextInput.place.trim().length > 0) {
    const trimmed = contextInput.place.trim();
    next.place = trimmed;
    context.place = trimmed;
  }
  const placePrecision = normalizePlacePrecision(contextInput.placePrecision);
  if (placePrecision) {
    context.placePrecision = placePrecision;
  }
  if (
    typeof contextInput.halobankSpanId === "string" &&
    contextInput.halobankSpanId.trim().length > 0
  ) {
    context.halobankSpanId = contextInput.halobankSpanId.trim();
  }
  if (
    typeof contextInput.skySignature === "string" &&
    contextInput.skySignature.trim().length > 0
  ) {
    const trimmed = contextInput.skySignature.trim();
    next.skySignature = trimmed;
    context.skySignature = trimmed;
  }
  if (Object.keys(context).length > 0) {
    next.context = context;
  }

  const pulseInput =
    record.pulse && typeof record.pulse === "object"
      ? (record.pulse as Record<string, unknown>)
      : record;
  const pulse: NonNullable<TimeSkyMeta["pulse"]> = {};
  const source = normalizePulseSource(pulseInput.source);
  if (source) {
    pulse.source = source;
  }
  const rawRound = pulseInput.round ?? record.pulseRound;
  if (typeof rawRound === "number" || (typeof rawRound === "string" && rawRound.trim())) {
    pulse.round = typeof rawRound === "string" ? rawRound.trim() : rawRound;
    next.pulseRound = pulse.round;
  }
  const pulseTime = normalizeTimestamp(pulseInput.pulseTime);
  if (pulseTime != null) {
    pulse.pulseTime = pulseTime;
  }
  const rawHash = pulseInput.valueHash ?? record.pulseHash;
  if (typeof rawHash === "string" && rawHash.trim().length > 0) {
    pulse.valueHash = rawHash.trim();
    next.pulseHash = pulse.valueHash;
  }
  if (typeof pulseInput.seedSalt === "string" && pulseInput.seedSalt.trim().length > 0) {
    pulse.seedSalt = pulseInput.seedSalt.trim();
  }
  if (
    !pulse.source &&
    (pulse.round != null || pulse.valueHash || pulse.pulseTime != null)
  ) {
    pulse.source = "drand";
  }
  if (Object.keys(pulse).length > 0) {
    next.pulse = pulse;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const readTimeSkyMeta = (meta?: Record<string, unknown>): TimeSkyMeta | undefined => {
  if (!meta || typeof meta !== "object") return undefined;
  const candidate = (meta as { timeSky?: unknown }).timeSky;
  return normalizeTimeSkyMeta(candidate);
};

const mergeTimeSkyContext = (
  base: TimeSkyMeta["context"],
  overrides: Partial<NonNullable<TimeSkyMeta["context"]>>,
  options: {
    placePrecision?: "exact" | "approximate" | "hidden";
    placePrecisionTouched: boolean;
  },
): TimeSkyMeta["context"] | undefined => {
  const merged: NonNullable<TimeSkyMeta["context"]> = { ...(base ?? {}) };
  if (overrides.publishedAt != null) merged.publishedAt = overrides.publishedAt;
  if (overrides.composedStart != null) {
    merged.composedStart = overrides.composedStart;
  }
  if (overrides.composedEnd != null) merged.composedEnd = overrides.composedEnd;
  if (overrides.timezone) merged.timezone = overrides.timezone;
  if (overrides.place) merged.place = overrides.place;
  if (overrides.halobankSpanId) {
    merged.halobankSpanId = overrides.halobankSpanId;
  }
  if (overrides.skySignature) merged.skySignature = overrides.skySignature;
  if (options.placePrecisionTouched && options.placePrecision) {
    merged.placePrecision = options.placePrecision;
    if (options.placePrecision === "hidden") {
      delete merged.place;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeTimeSkyPulse = (
  base: TimeSkyMeta["pulse"],
  overrides: Partial<NonNullable<TimeSkyMeta["pulse"]>>,
  options: { source?: PulseSource; sourceTouched: boolean },
): TimeSkyMeta["pulse"] | undefined => {
  const merged: NonNullable<TimeSkyMeta["pulse"]> = { ...(base ?? {}) };
  if (overrides.round != null) merged.round = overrides.round;
  if (overrides.pulseTime != null) merged.pulseTime = overrides.pulseTime;
  if (overrides.valueHash) merged.valueHash = overrides.valueHash;
  if (overrides.seedSalt) merged.seedSalt = overrides.seedSalt;
  if (options.sourceTouched && options.source) {
    merged.source = options.source;
  }
  if (!merged.source && options.source) {
    merged.source = options.source;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const derivePulseSeedSalt = (options: {
  trackId: string;
  context?: TimeSkyMeta["context"];
  pulse?: TimeSkyMeta["pulse"];
}): string | undefined => {
  const { trackId, context, pulse } = options;
  if (!trackId || !context || !pulse) return undefined;
  const pulseKey = pulse.round ?? pulse.pulseTime;
  if (pulseKey == null || !pulse.valueHash) return undefined;
  const placeSeed =
    context.placePrecision === "hidden"
      ? "hidden"
      : (context.place ?? "").trim();
  const publishedAt =
    context.publishedAt != null ? String(context.publishedAt) : "";
  const seedMaterial = `${trackId}|${publishedAt}|${placeSeed}|${pulseKey}|${pulse.valueHash}`;
  return hashSeedSalt(seedMaterial);
};

const buildStemEntry = (file: File, category?: StemCategory): StemEntry => {
  const inferred = inferStemCategory(file.name);
  const resolvedCategory = category ?? inferred;
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    file,
    category: resolvedCategory,
    inferred,
  };
};

const createUploadId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `noise-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const fetchOriginalDetailsWithRetry = async (
  originalId: string,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
  } = {},
) => {
  const attempts = options.attempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchOriginalDetails(originalId, options.signal);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      const statusMatch = message.match(/^(\d{3})\s*:/);
      const status = statusMatch ? Number(statusMatch[1]) : null;
      if (status != null && status !== 404) {
        break;
      }
      if (options.signal?.aborted) {
        throw error;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load track details.");
};

const isAudioFile = (record: KnowledgeFileRecord): boolean =>
  record.kind === "audio" || record.mime?.toLowerCase().startsWith("audio/");

const buildFileFromKnowledge = (record: KnowledgeFileRecord): File => {
  const mime = record.mime || record.type || "audio/wav";
  const name = record.name || "stem.wav";
  return new File([record.data], name, { type: mime });
};

export type UploadOriginalPrefill = {
  title?: string;
  creator?: string;
  notes?: string;
  bpm?: number;
  quantized?: boolean;
  offsetMs?: number;
  sourceHint?: string;
  knowledgeProjectId?: string;
  knowledgeProjectName?: string;
  existingOriginalId?: string;
  editOnly?: boolean;
};

export type UploadCompletePayload = {
  trackId: string;
  title: string;
  creator: string;
  knowledgeProjectId?: string;
  knowledgeProjectName?: string;
  tempo?: TempoMeta;
  durationSeconds?: number | null;
  publishedLyrics?: string;
};

const DEFAULT_BARS_IN_LOOP = 8;

const estimateLoopDurationSeconds = (tempo?: TempoMeta): number | null => {
  if (!tempo) return null;
  if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) return null;
  const [numerator] = tempo.timeSig.split("/").map((value) => Number(value));
  const beatsPerBar = Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
  const bars = tempo.barsInLoop ?? DEFAULT_BARS_IN_LOOP;
  const seconds = (bars * beatsPerBar * 60) / tempo.bpm;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export function UploadOriginalsModal({
  open,
  onOpenChange,
  isAuthenticated,
  onRequestSignIn,
  onUploaded,
  prefill,
}: UploadOriginalsModalProps) {
  const { toast } = useToast();
  const { projects, projectFiles, refresh, refreshFiles, updateProject } = useKnowledgeProjectsStore(
    (state) => ({
      projects: state.projects,
      projectFiles: state.projectFiles,
      refresh: state.refresh,
      refreshFiles: state.refreshFiles,
      updateProject: state.updateProject,
    }),
  );
  const filter = useMemo(() => new Filter({ placeHolder: "*" }), []);
  const validateField = useCallback(
    (label: string, value: string, maxLength: number) => {
      const trimmed = value.trim();
      if (!trimmed) return `${label} is required`;
      if (trimmed.length > maxLength) {
        return `${label} must be under ${maxLength} characters`;
      }
      if (filter.isProfane(trimmed)) {
        return `Please remove profanity from the ${label.toLowerCase()}.`;
      }
      return null;
    },
    [filter],
  );
  const [title, setTitle] = useState<FieldState>({ value: "", error: null });
  const [titleTouched, setTitleTouched] = useState(false);
  const [creator, setCreator] = useState<FieldState>({ value: "", error: null });
  const [creatorTouched, setCreatorTouched] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [timeSkyTouched, setTimeSkyTouched] = useState(false);
  const [publishedDate, setPublishedDate] = useState("");
  const [composedStart, setComposedStart] = useState("");
  const [composedEnd, setComposedEnd] = useState("");
  const [timezone, setTimezone] = useState("");
  const [place, setPlace] = useState("");
  const [placePrecision, setPlacePrecision] = useState<
    "exact" | "approximate" | "hidden"
  >("approximate");
  const [placePrecisionTouched, setPlacePrecisionTouched] = useState(false);
  const [skySignature, setSkySignature] = useState("");
  const [pulseEnabled, setPulseEnabled] = useState(false);
  const [pulseTouched, setPulseTouched] = useState(false);
  const [pulseSource, setPulseSource] = useState<PulseSource>("drand");
  const [pulseSourceTouched, setPulseSourceTouched] = useState(false);
  const [pulseRound, setPulseRound] = useState("");
  const [pulseTime, setPulseTime] = useState("");
  const [pulseValueHash, setPulseValueHash] = useState("");
  const [intentFile, setIntentFile] = useState<File | null>(null);
  const [intentSummaryOpen, setIntentSummaryOpen] = useState(false);
  const [intentSummaryLoading, setIntentSummaryLoading] = useState(false);
  const [intentSummaryError, setIntentSummaryError] = useState<string | null>(
    null,
  );
  const [intentSummaryTrackId, setIntentSummaryTrackId] = useState<string | null>(
    null,
  );
  const [intentSnapshot, setIntentSnapshot] = useState<AbletonIntentSnapshot | null>(
    null,
  );
  const [intentSnapshotPreferences, setIntentSnapshotPreferences] =
    useState<IntentSnapshotPreferences>({
      applyTempo: true,
      applyMix: true,
      applyAutomation: false,
    });
  const [intentPrefsSaving, setIntentPrefsSaving] = useState(false);
  const [intentContractEnabled, setIntentContractEnabled] = useState(false);
  const [intentKey, setIntentKey] = useState("");
  const [intentGrooveTemplateIds, setIntentGrooveTemplateIds] = useState("");
  const [intentMotifIds, setIntentMotifIds] = useState("");
  const [intentStemLocks, setIntentStemLocks] = useState("");
  const [intentArrangementMoves, setIntentArrangementMoves] = useState("");
  const [intentIdeologyRootId, setIntentIdeologyRootId] = useState("");
  const [intentAllowedNodeIds, setIntentAllowedNodeIds] = useState("");
  const [intentNotes, setIntentNotes] = useState("");
  const [intentStoreTimeSky, setIntentStoreTimeSky] = useState(false);
  const [intentStorePulse, setIntentStorePulse] = useState(false);
  const [intentPulseSource, setIntentPulseSource] =
    useState<PulseSource>("drand");
  const [intentPlacePrecision, setIntentPlacePrecision] = useState<
    "exact" | "approximate" | "hidden"
  >("approximate");
  const [intentRanges, setIntentRanges] = useState(() => ({
    ...DEFAULT_INTENT_RANGES,
  }));
  const [editOnlyMode, setEditOnlyMode] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(
    undefined,
  );
  const [stemEntries, setStemEntries] = useState<StemEntry[]>([]);
  const stemSourceRef = useRef<string>("");
  const [offsetMs, setOffsetMs] = useState(0);
  const [bpm, setBpm] = useState<string>("");
  const [bpmTouched, setBpmTouched] = useState(false);
  const [quantized, setQuantized] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadFileProgress[] | null>(
    null,
  );
  const [uploadTotalProgress, setUploadTotalProgress] = useState<{
    loaded: number;
    total?: number;
    pct?: number;
  } | null>(null);
  const uploadFilesRef = useRef<UploadFileProgress[]>([]);
  const isUploading =
    isSubmitting ||
    (uploadProgress?.some((file) =>
      ["queued", "uploading", "processing"].includes(file.status),
    ) ??
      false);
  const [capabilities, setCapabilities] = useState<NoisegenCapabilities | null>(
    null,
  );
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const storeBackend = capabilities?.store?.backend;
  const storageBackend = capabilities?.storage?.backend;
  const storageDriver = capabilities?.storage?.driver;

  useEffect(() => {
    if (!open) {
      setTitle({ value: "", error: null });
      setTitleTouched(false);
      setCreator({ value: "", error: null });
      setCreatorTouched(false);
      setLyrics("");
      setTimeSkyTouched(false);
      setPublishedDate("");
      setComposedStart("");
      setComposedEnd("");
      setTimezone("");
      setPlace("");
      setPlacePrecision("approximate");
      setPlacePrecisionTouched(false);
      setSkySignature("");
      setPulseEnabled(false);
      setPulseTouched(false);
      setPulseSource("drand");
      setPulseSourceTouched(false);
      setPulseRound("");
      setPulseTime("");
      setPulseValueHash("");
      setIntentFile(null);
      setIntentSummaryOpen(false);
      setIntentSummaryLoading(false);
      setIntentSummaryError(null);
      setIntentSummaryTrackId(null);
      setIntentSnapshot(null);
      setIntentSnapshotPreferences({
        applyTempo: true,
        applyMix: true,
        applyAutomation: false,
      });
      setIntentPrefsSaving(false);
      setIntentContractEnabled(false);
      setIntentKey("");
      setIntentGrooveTemplateIds("");
      setIntentMotifIds("");
      setIntentStemLocks("");
      setIntentArrangementMoves("");
      setIntentIdeologyRootId("");
      setIntentAllowedNodeIds("");
      setIntentNotes("");
      setIntentStoreTimeSky(false);
      setIntentStorePulse(false);
      setIntentPulseSource("drand");
      setIntentPlacePrecision("approximate");
      setIntentRanges({ ...DEFAULT_INTENT_RANGES });
      setEditOnlyMode(false);
      setSelectedProjectId(undefined);
      setStemEntries([]);
      stemSourceRef.current = "";
      setOffsetMs(0);
      setBpm("");
      setBpmTouched(false);
      setQuantized(true);
      setIsSubmitting(false);
      setUploadProgress(null);
      setUploadTotalProgress(null);
      uploadFilesRef.current = [];
      setCapabilities(null);
      setCapabilitiesError(null);
      setCapabilitiesLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !prefill) return;
    const derivedTitle = prefill.title ?? prefill.knowledgeProjectName ?? "";
    const derivedCreator = prefill.creator ?? "";
    setTitle({
      value: derivedTitle,
      error: derivedTitle ? validateField("Title", derivedTitle, MAX_TITLE) : null,
    });
    setCreator({
      value: derivedCreator,
      error: derivedCreator
        ? validateField("Creator", derivedCreator, MAX_CREATOR)
        : null,
    });
    setLyrics(prefill.notes ?? "");
    setEditOnlyMode(Boolean(prefill.editOnly));
    if (prefill.knowledgeProjectId) {
      setSelectedProjectId(prefill.knowledgeProjectId);
    }
    if (typeof prefill.offsetMs === "number" && Number.isFinite(prefill.offsetMs)) {
      setOffsetMs(Math.round(prefill.offsetMs));
    } else {
      setOffsetMs(0);
    }
    const resolvedBpm =
      typeof prefill.bpm === "number" && Number.isFinite(prefill.bpm)
        ? clampBpm(prefill.bpm)
        : undefined;
    setBpm(resolvedBpm ? resolvedBpm.toFixed(2) : "");
    setQuantized(prefill.quantized ?? true);
  }, [open, prefill, validateField]);

  const noiseProjects = useMemo(
    () => projects.filter((project) => project.type === "noise-album"),
    [projects],
  );
  const selectedProject = useMemo(
    () => noiseProjects.find((project) => project.id === selectedProjectId),
    [noiseProjects, selectedProjectId],
  );
  const projectTimeSky = useMemo(
    () =>
      readTimeSkyMeta((selectedProject?.meta ?? {}) as Record<string, unknown>),
    [selectedProject?.meta],
  );

  useEffect(() => {
    if (!open || timeSkyTouched) return;
    const context = projectTimeSky?.context;
    if (!context) return;
    if (context.publishedAt && !publishedDate) {
      setPublishedDate(formatDateInput(context.publishedAt));
    }
    if (context.composedStart && !composedStart) {
      setComposedStart(formatMonthInput(context.composedStart));
    }
    if (context.composedEnd && !composedEnd) {
      setComposedEnd(formatMonthInput(context.composedEnd));
    }
    if (context.timezone && !timezone) {
      setTimezone(context.timezone);
    }
    if (context.place && !place) {
      setPlace(context.place);
    }
    if (context.placePrecision && !placePrecisionTouched) {
      setPlacePrecision(context.placePrecision);
    }
    if (context.skySignature && !skySignature) {
      setSkySignature(context.skySignature);
    }
  }, [
    composedEnd,
    composedStart,
    open,
    place,
    placePrecisionTouched,
    projectTimeSky,
    publishedDate,
    skySignature,
    timeSkyTouched,
    timezone,
  ]);

  useEffect(() => {
    if (!open || pulseTouched) return;
    const pulse = projectTimeSky?.pulse;
    if (!pulse) return;
    setPulseEnabled(true);
    if (pulse.source && !pulseSourceTouched) {
      setPulseSource(pulse.source);
    }
    if (pulse.round != null && !pulseRound) {
      setPulseRound(String(pulse.round));
    }
    if (pulse.pulseTime && !pulseTime) {
      setPulseTime(formatDateTimeInput(pulse.pulseTime));
    }
    if (pulse.valueHash && !pulseValueHash) {
      setPulseValueHash(pulse.valueHash);
    }
  }, [
    open,
    projectTimeSky,
    pulseRound,
    pulseSourceTouched,
    pulseTime,
    pulseTouched,
    pulseValueHash,
  ]);
  useEffect(() => {
    if (!open || !selectedProject) return;
    const projectName = selectedProject.name?.trim();
    if (!projectName) return;
    if (!titleTouched && !title.value.trim()) {
      setTitle({
        value: projectName,
        error: validateField("Title", projectName, MAX_TITLE),
      });
    }
    if (!creatorTouched && !creator.value.trim()) {
      setCreator({
        value: projectName,
        error: validateField("Creator", projectName, MAX_CREATOR),
      });
    }
  }, [
    creator.value,
    creatorTouched,
    open,
    selectedProject,
    title.value,
    titleTouched,
    validateField,
  ]);
  const projectFilesList = useMemo<KnowledgeFileRecord[]>(() => {
    if (!selectedProjectId) return [];
    return projectFiles[selectedProjectId] ?? [];
  }, [projectFiles, selectedProjectId]);
  const audioProjectFiles = useMemo(
    () => projectFilesList.filter(isAudioFile),
    [projectFilesList],
  );

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setCapabilitiesLoading(true);
    setCapabilitiesError(null);
    fetchNoisegenCapabilities(controller.signal)
      .then((payload) => {
        setCapabilities(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unable to read codec status.";
        setCapabilitiesError(message);
        setCapabilities(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCapabilitiesLoading(false);
        }
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!selectedProjectId) return;
    void refreshFiles(selectedProjectId);
  }, [open, refreshFiles, selectedProjectId]);

  useEffect(() => {
    if (!open) return;
    if (selectedProjectId) return;
    if (prefill?.knowledgeProjectId) {
      setSelectedProjectId(prefill.knowledgeProjectId);
      return;
    }
    if (noiseProjects.length > 0) {
      setSelectedProjectId(noiseProjects[0]?.id);
    }
  }, [noiseProjects, open, prefill?.knowledgeProjectId, selectedProjectId]);

  useEffect(() => {
    if (!open || !selectedProjectId) return;
    if (audioProjectFiles.length === 0) {
      if (stemEntries.length) {
        setStemEntries([]);
      }
      stemSourceRef.current = "";
      return;
    }
    const sourceKey = `project:${selectedProjectId}:${audioProjectFiles
      .map((file) => file.id)
      .join(",")}`;
    if (stemSourceRef.current === sourceKey) return;
    setStemEntries(
      audioProjectFiles.map((record) =>
        buildStemEntry(buildFileFromKnowledge(record)),
      ),
    );
    stemSourceRef.current = sourceKey;
  }, [audioProjectFiles, open, selectedProjectId, stemEntries.length]);

  useEffect(() => {
    if (!open || stemEntries.length === 0) return;
    const metadata = extractFileMetadata(stemEntries[0].file);
    if (metadata?.title && !titleTouched && !title.value.trim()) {
      const clipped = metadata.title.slice(0, MAX_TITLE);
      setTitle({
        value: clipped,
        error: validateField("Title", clipped, MAX_TITLE),
      });
    }
    if (metadata?.bpm && !bpmTouched && !bpm) {
      setBpm(metadata.bpm.toFixed(2));
    }
  }, [bpm, bpmTouched, open, stemEntries, title.value, titleTouched, validateField]);

  const stemSummary = useMemo(() => {
    const mixEntries = stemEntries.filter((entry) => entry.category === "mix");
    const vocalEntries = stemEntries.filter((entry) => entry.category === "vocal");
    const stemUploads = stemEntries.filter(
      (entry) =>
        entry.category !== "mix" &&
        entry.category !== "vocal" &&
        entry.category !== "ignore",
    );
    const ignoredCount = stemEntries.filter((entry) => entry.category === "ignore").length;
    const errors: string[] = [];
    if (mixEntries.length > 1) {
      errors.push("Only one mix/instrumental stem can be selected.");
    }
    if (vocalEntries.length > 1) {
      errors.push("Only one vocal stem can be selected.");
    }
    if (stemEntries.length > 0 && mixEntries.length === 0 && stemUploads.length === 0) {
      errors.push("Select a mix or at least one stem.");
    }
    return {
      mixEntry: mixEntries[0],
      vocalEntry: vocalEntries[0],
      stemUploads,
      ignoredCount,
      errors,
    };
  }, [stemEntries]);

  const isEditOnly = editOnlyMode && Boolean(prefill?.existingOriginalId);
  const hasAudio =
    Boolean(stemSummary.mixEntry) || stemSummary.stemUploads.length > 0;
  const hasRequiredFields =
    (isEditOnly || hasAudio) &&
    !title.error &&
    !creator.error &&
    title.value.trim().length > 0 &&
    creator.value.trim().length > 0;

  const canSubmit =
    !isSubmitting &&
    hasRequiredFields &&
    (isEditOnly || stemSummary.errors.length === 0);
  const requiresAuth = !isAuthenticated;
  const submitButtonLabel = requiresAuth
    ? "Sign in to upload"
    : isSubmitting
      ? isEditOnly
        ? "Saving..."
        : "Uploading..."
      : isEditOnly
        ? "Save details"
        : "Upload";
  const dialogTitle = isEditOnly ? "Edit details" : "Upload Originals";
  const dialogDescription = isEditOnly
    ? "Update metadata for this noise album. Files will not be reuploaded."
    : "Choose a Noise Album project and tag each stem. Mark one mix if you have it, or keep stems-only to auto-build a playback mixdown from your stems.";
  const submitButtonDisabled = requiresAuth ? false : !canSubmit;
  const showIntentSummary = intentSummaryOpen || intentSummaryLoading;
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isUploading) {
        toast({
          title: "Upload in progress",
          description: "Keep this window open until the upload finishes.",
        });
        return;
      }
      onOpenChange(nextOpen);
    },
    [isUploading, onOpenChange, toast],
  );

  const bpmNumeric = useMemo(() => sanitizeBpmInput(bpm), [bpm]);

  const intentSummaryStats = useMemo(() => {
    if (!intentSnapshot) return [];
    const summary = intentSnapshot.summary;
    return [
      { label: "Tracks", value: summary.trackCount },
      { label: "Audio", value: summary.audioTrackCount },
      { label: "MIDI", value: summary.midiTrackCount },
      { label: "Returns", value: summary.returnTrackCount },
      { label: "Groups", value: summary.groupTrackCount },
      { label: "Devices", value: summary.deviceCount },
      { label: "Locators", value: summary.locatorCount },
    ];
  }, [intentSnapshot]);

  const intentDevicePreview = useMemo(() => {
    if (!intentSnapshot?.devices?.length) return "";
    const preview = intentSnapshot.devices
      .slice(0, 4)
      .map((device) => `${device.name} (${device.count})`)
      .join(", ");
    const remaining = intentSnapshot.devices.length - 4;
    return remaining > 0 ? `${preview} +${remaining} more` : preview;
  }, [intentSnapshot]);

  const tempoPreview = useMemo(() => {
    if (bpmNumeric == null) return null;
    return {
      bpm: Number(bpmNumeric.toFixed(2)),
      timeSig: DEFAULT_TIME_SIG,
      quantized,
    };
  }, [bpmNumeric, quantized]);

  const handleProjectChange = useCallback((value: string) => {
    const nextId = value || undefined;
    setSelectedProjectId(nextId);
    setStemEntries([]);
    stemSourceRef.current = "";
  }, []);

  const handleStemCategoryChange = useCallback(
    (stemId: string, category: StemCategory) => {
      setStemEntries((previous) =>
        previous.map((entry) =>
          entry.id === stemId ? { ...entry, category } : entry,
        ),
      );
    },
    [],
  );

  const persistProjectMeta = useCallback(
    async (tempoMeta?: TempoMeta, lyricsText?: string) => {
      if (!selectedProject) return;
      try {
        const currentMeta = (selectedProject.meta ?? {}) as Record<string, unknown>;
        const existingTempo =
          (currentMeta as { tempo?: Partial<TempoMeta> }).tempo ?? undefined;
        let nextTempo: Partial<TempoMeta> | undefined;
        let tempoChanged = false;
        if (tempoMeta) {
          nextTempo = {
            ...(typeof existingTempo === "object" && existingTempo ? existingTempo : {}),
            bpm: tempoMeta.bpm,
            timeSig: tempoMeta.timeSig,
            offsetMs: tempoMeta.offsetMs,
            quantized: tempoMeta.quantized,
          };
          const isSame =
            existingTempo &&
            existingTempo.bpm === nextTempo.bpm &&
            existingTempo.timeSig === nextTempo.timeSig &&
            (existingTempo.offsetMs ?? 0) === (nextTempo.offsetMs ?? 0) &&
            (existingTempo.quantized ?? true) === (nextTempo.quantized ?? true);
          tempoChanged = !isSame;
        }

        const existingLyrics =
          typeof (currentMeta as { lyrics?: unknown }).lyrics === "string"
            ? String((currentMeta as { lyrics?: unknown }).lyrics)
            : "";
        const nextLyrics = lyricsText?.trim() ?? "";
        const lyricsChanged =
          (nextLyrics || existingLyrics) && nextLyrics !== existingLyrics;

        if (!tempoChanged && !lyricsChanged) return;

        const nextMeta = { ...currentMeta };
        if (tempoChanged && nextTempo) {
          nextMeta.tempo = nextTempo;
        }
        if (lyricsChanged) {
          if (nextLyrics) {
            nextMeta.lyrics = nextLyrics;
          } else {
            delete (nextMeta as { lyrics?: unknown }).lyrics;
          }
        }

        const { fileCount: _fileCount, ...projectRecord } = selectedProject;
        await updateProject({
          ...projectRecord,
          meta: nextMeta,
        });
      } catch {
        toast({
          title: "Metadata not saved",
          description:
            "We could not store the BPM or lyrics on this noise album. You can set the BPM in the DAW.",
        });
      }
    },
    [selectedProject, toast, updateProject],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setIsSubmitting(true);
      const existingOriginalId = prefill?.existingOriginalId?.trim();
      const trackIdForUpload = existingOriginalId || createUploadId();
      const timeSkyMeta = (() => {
        const base = projectTimeSky;
        const contextOverrides: Partial<
          NonNullable<TimeSkyMeta["context"]>
        > = {};
        const publishedAt = parseDateInput(publishedDate);
        if (publishedAt != null) contextOverrides.publishedAt = publishedAt;
        const composedStartTs = parseMonthInput(composedStart);
        if (composedStartTs != null) {
          contextOverrides.composedStart = composedStartTs;
        }
        const composedEndTs = parseMonthInput(composedEnd);
        if (composedEndTs != null) {
          contextOverrides.composedEnd = composedEndTs;
        }
        if (timezone.trim()) {
          contextOverrides.timezone = timezone.trim();
        }
        if (place.trim() && placePrecision !== "hidden") {
          contextOverrides.place = place.trim();
        }
        if (skySignature.trim()) {
          contextOverrides.skySignature = skySignature.trim();
        }

        const includePulse =
          pulseEnabled || (!pulseTouched && Boolean(base?.pulse));
        const pulseOverrides: Partial<NonNullable<TimeSkyMeta["pulse"]>> = {};
        const trimmedRound = pulseRound.trim();
        if (trimmedRound) {
          const numeric = Number(trimmedRound);
          pulseOverrides.round =
            Number.isFinite(numeric) && /^\d+$/.test(trimmedRound)
              ? numeric
              : trimmedRound;
        }
        const pulseTimeTs = parseDateTimeInput(pulseTime);
        if (pulseTimeTs != null) {
          pulseOverrides.pulseTime = pulseTimeTs;
        }
        if (pulseValueHash.trim()) {
          pulseOverrides.valueHash = pulseValueHash.trim();
        }

        const mergedContext = mergeTimeSkyContext(base?.context, contextOverrides, {
          placePrecision,
          placePrecisionTouched,
        });
        const mergedPulse = includePulse
          ? mergeTimeSkyPulse(base?.pulse, pulseOverrides, {
              source: pulseSource,
              sourceTouched: pulseSourceTouched,
            })
          : undefined;

        if (mergedPulse && !mergedPulse.seedSalt) {
          const seedSalt = derivePulseSeedSalt({
            trackId: trackIdForUpload,
            context: mergedContext,
            pulse: mergedPulse,
          });
          if (seedSalt) {
            mergedPulse.seedSalt = seedSalt;
          }
        }

        if (!mergedContext && !mergedPulse) return undefined;
        const next: TimeSkyMeta = {};
        if (mergedContext) {
          next.context = mergedContext;
          next.publishedAt = mergedContext.publishedAt;
          next.composedStart = mergedContext.composedStart;
          next.composedEnd = mergedContext.composedEnd;
          next.place = mergedContext.place;
          next.skySignature = mergedContext.skySignature;
        }
        if (mergedPulse) {
          next.pulse = mergedPulse;
          if (mergedPulse.round != null) next.pulseRound = mergedPulse.round;
          if (mergedPulse.valueHash) next.pulseHash = mergedPulse.valueHash;
        }
        return next;
      })();
      let tempoMeta: TempoMeta | undefined;
      if (bpmNumeric != null) {
        tempoMeta = {
          bpm: Number(bpmNumeric.toFixed(2)),
          timeSig: DEFAULT_TIME_SIG,
          offsetMs,
          quantized,
        };
      }
      const intentContract = (() => {
        if (!intentContractEnabled) return undefined;
        const now = Date.now();
        const invariants: NonNullable<IntentContract["invariants"]> = {};
        if (bpmNumeric != null) {
          invariants.tempoBpm = Number(bpmNumeric.toFixed(2));
          invariants.timeSig = DEFAULT_TIME_SIG;
        }
        if (intentKey.trim()) {
          invariants.key = intentKey.trim();
        }
        const grooveTemplateIds = parseCsvList(intentGrooveTemplateIds);
        if (grooveTemplateIds) {
          invariants.grooveTemplateIds = grooveTemplateIds;
        }
        const motifIds = parseCsvList(intentMotifIds);
        if (motifIds) {
          invariants.motifIds = motifIds;
        }
        const stemLocks = parseCsvList(intentStemLocks);
        if (stemLocks) {
          invariants.stemLocks = stemLocks;
        }
        const resolvedInvariants =
          Object.keys(invariants).length > 0 ? invariants : undefined;

        const ranges: NonNullable<IntentContract["ranges"]> = {};
        for (const field of INTENT_RANGE_FIELDS) {
          const rangeValue = parseRangeInput(intentRanges[field.key]);
          if (rangeValue) {
            ranges[field.key] = rangeValue;
          }
        }
        const arrangementMoves = parseCsvList(intentArrangementMoves);
        if (arrangementMoves) {
          ranges.arrangementMoves = arrangementMoves;
        }
        const resolvedRanges = Object.keys(ranges).length > 0 ? ranges : undefined;

        const meaning: NonNullable<IntentContract["meaning"]> = {};
        if (intentIdeologyRootId.trim()) {
          meaning.ideologyRootId = intentIdeologyRootId.trim();
        }
        const allowedNodeIds = parseCsvList(intentAllowedNodeIds);
        if (allowedNodeIds) {
          meaning.allowedNodeIds = allowedNodeIds;
        }
        const resolvedMeaning =
          Object.keys(meaning).length > 0 ? meaning : undefined;

        const provenance: NonNullable<IntentContract["provenancePolicy"]> = {};
        if (intentStoreTimeSky) {
          provenance.storeTimeSky = true;
        }
        if (intentStorePulse) {
          provenance.storePulse = true;
          provenance.pulseSource = intentPulseSource;
        }
        if (intentPlacePrecision) {
          provenance.placePrecision = intentPlacePrecision;
        }
        const resolvedProvenance =
          Object.keys(provenance).length > 0 ? provenance : undefined;

        const notes = intentNotes.trim();

        return {
          version: 1,
          createdAt: now,
          updatedAt: now,
          ...(resolvedInvariants ? { invariants: resolvedInvariants } : {}),
          ...(resolvedRanges ? { ranges: resolvedRanges } : {}),
          ...(resolvedMeaning ? { meaning: resolvedMeaning } : {}),
          ...(resolvedProvenance ? { provenancePolicy: resolvedProvenance } : {}),
          ...(notes ? { notes } : {}),
        } satisfies IntentContract;
      })();

      const uploadQueue: UploadQueueItem[] = [
        ...(stemSummary.mixEntry
          ? [
              {
                id: stemSummary.mixEntry.id,
                name: stemSummary.mixEntry.name,
                file: stemSummary.mixEntry.file,
                field: "instrumental" as const,
              },
            ]
          : []),
        ...(stemSummary.vocalEntry
          ? [
              {
                id: stemSummary.vocalEntry.id,
                name: stemSummary.vocalEntry.name,
                file: stemSummary.vocalEntry.file,
                field: "vocal" as const,
              },
            ]
          : []),
        ...stemSummary.stemUploads.map((entry) => ({
          id: entry.id,
          name: entry.name,
          file: entry.file,
          field: "stems" as const,
          category: entry.category,
        })),
        ...(intentFile
          ? [
              {
                id: `intent-${intentFile.name}-${intentFile.size}`,
                name: intentFile.name,
                file: intentFile,
                field: "intent" as const,
              },
            ]
          : []),
      ];
      if (isEditOnly) {
        if (!existingOriginalId) {
          throw new Error("Missing original ID for metadata update.");
        }
        await updateOriginalMeta(existingOriginalId, {
          title: title.value.trim(),
          creator: creator.value.trim(),
          notes: lyrics.trim(),
          tempo: tempoMeta,
          offsetMs,
          timeSky: timeSkyMeta,
          intentContract: intentContractEnabled ? intentContract : undefined,
        });
        toast({
          title: "Details saved",
          description: "Metadata updated for this noise album.",
        });
        void persistProjectMeta(tempoMeta, lyrics);
        onUploaded?.({
          trackId: existingOriginalId,
          title: title.value.trim(),
          creator: creator.value.trim(),
          knowledgeProjectId: selectedProjectId,
          knowledgeProjectName: selectedProject?.name?.trim(),
          tempo: tempoMeta,
          durationSeconds: estimateLoopDurationSeconds(tempoMeta ?? undefined),
          publishedLyrics: lyrics.trim() || undefined,
        });
        onOpenChange(false);
        return;
      }
      if (uploadQueue.length === 0) {
        throw new Error("No audio files selected for upload.");
      }
      const uploadFiles: UploadFileProgress[] = uploadQueue.map((item) => ({
        id: item.id,
        name: item.name,
        bytes: item.file.size,
        loaded: 0,
        pct: 0,
        status: "queued",
      }));
      uploadFilesRef.current = uploadFiles;
      const totalBytes = uploadFiles.reduce((sum, file) => sum + file.bytes, 0);
      if (uploadFiles.length) {
        setUploadProgress(uploadFiles);
        setUploadTotalProgress({
          loaded: 0,
          total: totalBytes > 0 ? totalBytes : undefined,
          pct: totalBytes > 0 ? 0 : undefined,
        });
      } else {
        setUploadProgress(null);
        setUploadTotalProgress(null);
      }

      const updateProgress = (
        fileId: string,
        loaded: number,
        status?: UploadFileProgress["status"],
        error?: string,
      ) => {
        const files = uploadFilesRef.current;
        if (!files.length) return;
        const next = files.map((file) => {
          if (file.id !== fileId) return file;
          const safeLoaded = Math.max(0, Math.min(file.bytes, loaded));
          const pct = file.bytes > 0 ? safeLoaded / file.bytes : 1;
          const resolvedStatus = status ?? file.status;
          const nextStatus =
            pct >= 1 && resolvedStatus === "uploading"
              ? "processing"
              : resolvedStatus;
          return {
            ...file,
            loaded: safeLoaded,
            pct,
            status: nextStatus,
            error,
          };
        });
        uploadFilesRef.current = next;
        setUploadProgress(next);
        const loadedTotal = next.reduce((sum, file) => sum + file.loaded, 0);
        setUploadTotalProgress({
          loaded: loadedTotal,
          total: totalBytes > 0 ? totalBytes : undefined,
          pct: totalBytes > 0 ? Math.min(1, loadedTotal / totalBytes) : undefined,
        });
      };
      const appendSharedFields = (payload: FormData, trackId?: string) => {
        payload.append("title", title.value.trim());
        payload.append("creator", creator.value.trim());
        if (trackId) {
          payload.append("existingOriginalId", trackId);
        }
        payload.append("offsetMs", String(offsetMs));
        if (lyrics.trim()) {
          payload.append("notes", lyrics.trim());
        }
        if (timeSkyMeta) {
          payload.append("timeSky", JSON.stringify(timeSkyMeta));
        }
        if (tempoMeta) {
          payload.append("tempo", JSON.stringify(tempoMeta));
        }
        if (intentContract) {
          payload.append("intentContract", JSON.stringify(intentContract));
        }
      };
      const abortControllers = new Map<string, AbortController>();
      let abortAll = false;
      const runUpload = async (item: (typeof uploadQueue)[number]) => {
        if (abortAll) return;
        const controller = new AbortController();
        abortControllers.set(item.id, controller);
        updateProgress(item.id, 0, "uploading");
        const totalSize = item.file.size;
        const shouldChunk = totalSize > DIRECT_UPLOAD_LIMIT_BYTES;
        try {
          if (!shouldChunk) {
            const payload = new FormData();
            appendSharedFields(payload, trackIdForUpload);
            if (item.field === "stems") {
              payload.append("stems", item.file);
              payload.append("stemCategories", JSON.stringify([item.category]));
            } else {
              payload.append(item.field, item.file);
            }
            const result = await uploadOriginal(payload, {
              signal: controller.signal,
              onProgress: (progress) => {
                updateProgress(item.id, progress.loaded, "uploading");
              },
            });
            if (result.trackId && result.trackId !== trackIdForUpload) {
              throw new Error("Upload returned a mismatched track ID.");
            }
            updateProgress(item.id, totalSize, "done");
          } else {
            const totalChunks = Math.ceil(totalSize / CHUNK_SIZE_BYTES);
            for (let index = 0; index < totalChunks; index += 1) {
              if (abortAll) return;
              const start = index * CHUNK_SIZE_BYTES;
              const end = Math.min(totalSize, start + CHUNK_SIZE_BYTES);
              const chunk = item.file.slice(start, end);
              const payload = new FormData();
              appendSharedFields(payload, trackIdForUpload);
              payload.append("fileId", item.id);
              payload.append("fileName", item.name);
              payload.append(
                "kind",
                item.field === "stems" ? "stem" : item.field,
              );
              if (item.field === "stems" && item.category) {
                payload.append("stemCategory", item.category);
              }
              payload.append("chunkIndex", String(index));
              payload.append("chunkCount", String(totalChunks));
              payload.append("chunk", chunk, item.name);
              const base = index * CHUNK_SIZE_BYTES;
              const result = await uploadOriginalChunk(payload, {
                signal: controller.signal,
                onProgress: (progress) => {
                  const loaded = Math.min(totalSize, base + progress.loaded);
                  updateProgress(item.id, loaded, "uploading");
                },
              });
              if (result.trackId && result.trackId !== trackIdForUpload) {
                throw new Error("Upload returned a mismatched track ID.");
              }
              if (index === totalChunks - 1) {
                updateProgress(item.id, totalSize, "done");
              }
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed";
          updateProgress(item.id, 0, "error", message);
          abortAll = true;
          abortControllers.forEach((ctrl) => ctrl.abort());
          throw new Error(`"${item.name}" failed to upload. ${message}`);
        } finally {
          abortControllers.delete(item.id);
        }
      };
      const hasChunkedUploads = uploadQueue.some(
        (item) => item.file.size > DIRECT_UPLOAD_LIMIT_BYTES,
      );
      const concurrency = hasChunkedUploads
        ? 1
        : Math.min(2, uploadQueue.length);
      let cursor = 0;
      const workers = Array.from({ length: concurrency }, () =>
        (async () => {
          while (!abortAll) {
            const next = uploadQueue[cursor++];
            if (!next) return;
            await runUpload(next);
          }
        })(),
      );
      await Promise.all(workers);
      const shouldAutoMixdown =
        !stemSummary.mixEntry && stemSummary.stemUploads.length > 0;
      if (shouldAutoMixdown) {
        try {
          await finalizeOriginalUpload({
            trackId: trackIdForUpload,
            autoMixdown: true,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Auto mixdown failed.";
          toast({
            title: "Mixdown error",
            description: message,
            variant: "destructive",
          });
        }
      } else {
        await finalizeOriginalUpload({ trackId: trackIdForUpload });
      }
      toast({
        title: "Upload queued",
        description: "We will notify you when mastering finishes.",
      });
      void persistProjectMeta(tempoMeta, lyrics);
      const selectedProjectName =
        selectedProject?.name?.trim() ?? prefill?.knowledgeProjectName;
      onUploaded?.({
        trackId: trackIdForUpload,
        title: title.value.trim(),
        creator: creator.value.trim(),
        knowledgeProjectId: selectedProjectId,
        knowledgeProjectName: selectedProjectName,
        tempo: tempoMeta,
        durationSeconds: estimateLoopDurationSeconds(tempoMeta ?? undefined),
        publishedLyrics: lyrics.trim() || undefined,
      });
      if (intentFile) {
        setIntentSummaryLoading(true);
        setIntentSummaryError(null);
        try {
          const details = await fetchOriginalDetailsWithRetry(trackIdForUpload);
          const snapshot = details.intentSnapshot ?? null;
          if (snapshot) {
            const prefs = details.intentSnapshotPreferences ?? {
              applyTempo: true,
              applyMix: true,
              applyAutomation: false,
            };
            setIntentSnapshot(snapshot);
            setIntentSnapshotPreferences({
              applyTempo: prefs.applyTempo ?? true,
              applyMix: prefs.applyMix ?? true,
              applyAutomation: prefs.applyAutomation ?? false,
            });
            setIntentSummaryTrackId(trackIdForUpload);
            setIntentSummaryOpen(true);
            return;
          }
        } catch (error) {
          setIntentSummaryError(
            error instanceof Error
              ? error.message
              : "Unable to load Ableton summary.",
          );
        } finally {
          setIntentSummaryLoading(false);
        }
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveIntentPreferences = async () => {
    if (!intentSummaryTrackId) {
      onOpenChange(false);
      return;
    }
    setIntentPrefsSaving(true);
    setIntentSummaryError(null);
    try {
      await updateOriginalIntentSnapshotPreferences(
        intentSummaryTrackId,
        intentSnapshotPreferences,
      );
      onOpenChange(false);
    } catch (error) {
      setIntentSummaryError(
        error instanceof Error
          ? error.message
          : "Unable to save intent preferences.",
      );
    } finally {
      setIntentPrefsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        aria-modal="true"
        onInteractOutside={(event) => {
          if (isUploading) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isUploading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {capabilitiesLoading ? (
              <Badge variant="outline" className="border-slate-500/40 text-slate-300">
                Checking codecs...
              </Badge>
            ) : capabilities ? (
              capabilities.ffmpeg ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
                  Codec pack ready
                </Badge>
              ) : (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-100">
                  WAV-only playback (ffmpeg missing)
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="border-slate-500/40 text-slate-300">
                Codec status unavailable
              </Badge>
            )}
            {capabilities ? (
              storeBackend === "db" ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
                  Store: DB
                </Badge>
              ) : storeBackend === "fs" ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-100">
                  Store: local disk
                </Badge>
              ) : null
            ) : null}
            {capabilities ? (
              storageBackend === "storage" ? (
                <Badge
                  className={
                    storageDriver === "s3"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-100"
                  }
                >
                  Audio: {storageDriver === "s3" ? "S3" : "local disk"}
                </Badge>
              ) : storageBackend === "replit" ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
                  Audio: Replit
                </Badge>
              ) : storageBackend === "fs" ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-100">
                  Audio: local disk
                </Badge>
              ) : null
            ) : null}
            {capabilitiesError ? (
              <span className="text-muted-foreground">{capabilitiesError}</span>
            ) : null}
          </div>
        </DialogHeader>
        {isUploading ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Upload in progress. Keep this window open until publishing finishes.
          </div>
        ) : null}

        {prefill?.sourceHint ? (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
            {prefill.sourceHint}
          </div>
        ) : null}

        {showIntentSummary ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Label>Ableton intent summary</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Review the Live set snapshot and choose which layers to apply.
                  </p>
                </div>
                {intentSummaryLoading ? (
                  <Badge
                    variant="outline"
                    className="border-slate-500/40 text-slate-300"
                  >
                    Loading summary...
                  </Badge>
                ) : intentSnapshot ? (
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
                    Snapshot ready
                  </Badge>
                ) : (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-100">
                    No snapshot found
                  </Badge>
                )}
              </div>

              {intentSummaryError ? (
                <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {intentSummaryError}
                </div>
              ) : null}

              {intentSnapshot ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Tempo
                      </div>
                      <div className="mt-1 text-sm text-slate-100">
                        {intentSnapshot.globals?.bpm != null
                          ? `${Math.round(intentSnapshot.globals.bpm)} BPM`
                          : "Unknown BPM"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Time sig {intentSnapshot.globals?.timeSig ?? "--"}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Tracks and devices
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                        {intentSummaryStats.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between"
                          >
                            <span>{item.label}</span>
                            <span>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {intentDevicePreview ? (
                    <div className="mt-3 text-[11px] text-slate-400">
                      Devices: {intentDevicePreview}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No Ableton snapshot was stored for this upload.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Apply intent layers
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <label className="flex items-center justify-between gap-2">
                  <span>Tempo and time signature</span>
                  <input
                    type="checkbox"
                    checked={Boolean(intentSnapshotPreferences.applyTempo)}
                    onChange={(event) =>
                      setIntentSnapshotPreferences((prev) => ({
                        ...prev,
                        applyTempo: event.target.checked,
                      }))
                    }
                    disabled={
                      !intentSnapshot || intentSummaryLoading || intentPrefsSaving
                    }
                    className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Mix intent (EQ and FX)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(intentSnapshotPreferences.applyMix)}
                    onChange={(event) =>
                      setIntentSnapshotPreferences((prev) => ({
                        ...prev,
                        applyMix: event.target.checked,
                      }))
                    }
                    disabled={
                      !intentSnapshot || intentSummaryLoading || intentPrefsSaving
                    }
                    className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Automation energy curve</span>
                  <input
                    type="checkbox"
                    checked={Boolean(intentSnapshotPreferences.applyAutomation)}
                    onChange={(event) =>
                      setIntentSnapshotPreferences((prev) => ({
                        ...prev,
                        applyAutomation: event.target.checked,
                      }))
                    }
                    disabled={
                      !intentSnapshot || intentSummaryLoading || intentPrefsSaving
                    }
                    className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Automation defaults off to keep RenderPlans stable unless you want it.
              </p>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="noise-upload-title">Song title</Label>
              <Input
                id="noise-upload-title"
                placeholder="Orbiting Signals"
                maxLength={MAX_TITLE}
                value={title.value}
                onChange={(event) => {
                  setTitleTouched(true);
                  setTitle({
                    value: event.target.value,
                    error: validateField("Title", event.target.value, MAX_TITLE),
                  });
                }}
              />
              {title.error ? (
                <p className="text-xs text-destructive">{title.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {title.value.length}/{MAX_TITLE} characters
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="noise-upload-creator">Creator</Label>
              <Input
                id="noise-upload-creator"
                placeholder="Helix Lab"
                maxLength={MAX_CREATOR}
                value={creator.value}
                onChange={(event) => {
                  setCreatorTouched(true);
                  setCreator({
                    value: event.target.value,
                    error: validateField("Creator", event.target.value, MAX_CREATOR),
                  });
                }}
              />
              {creator.error ? (
                <p className="text-xs text-destructive">{creator.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {creator.value.length}/{MAX_CREATOR} characters
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="noise-upload-project">Noise project</Label>
            {noiseProjects.length ? (
              <>
                <select
                  id="noise-upload-project"
                  value={selectedProjectId ?? ""}
                  onChange={(event) => handleProjectChange(event.target.value)}
                  className="h-10 w-full rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {noiseProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.fileCount ? ` (${project.fileCount})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Noise Album projects live in My Knowledge. Drop stems there to make them
                  available here.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-xs text-muted-foreground">
                No Noise Album projects found yet. Create one in My Knowledge to load stems
                here.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Project stems</Label>
              <span className="text-xs text-muted-foreground">
                {stemEntries.length} file{stemEntries.length === 1 ? "" : "s"}
              </span>
            </div>
            {stemEntries.length ? (
              <div className="space-y-2">
                {stemEntries.map((entry) => {
                  const isManual = entry.category !== entry.inferred;
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="min-w-[160px] flex-1">
                        <p className="truncate text-sm text-slate-100">{entry.name}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge className={`border ${STEM_CATEGORY_STYLES[entry.category]}`}>
                            {STEM_CATEGORY_LABELS[entry.category]}
                          </Badge>
                          <span>{isManual ? "Manual" : "Auto"}</span>
                        </div>
                      </div>
                      <label className="flex min-w-[140px] flex-col text-xs font-medium text-muted-foreground">
                        Category
                        <select
                          value={entry.category}
                          onChange={(event) =>
                            handleStemCategoryChange(
                              entry.id,
                              event.target.value as StemCategory,
                            )
                          }
                          className="mt-1 h-9 rounded border border-white/10 bg-slate-900 px-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          {STEM_CATEGORY_ORDER.map((category) => (
                            <option key={category} value={category}>
                              {STEM_CATEGORY_LABELS[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-xs text-muted-foreground">
                {selectedProjectId
                  ? "No audio stems found in this project."
                  : "Select a Noise Album project to load stems."}
              </div>
            )}
            {stemSummary.errors.length && !isEditOnly ? (
              <p className="text-xs text-destructive">{stemSummary.errors[0]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {stemSummary.mixEntry ? "Mix selected" : "No mix"}{" | "}
                {stemSummary.vocalEntry ? "Vocal attached" : "No vocal"}{" | "}
                {stemSummary.stemUploads.length} stem
                {stemSummary.stemUploads.length === 1 ? "" : "s"}
                {stemSummary.ignoredCount
                  ? ` | ${stemSummary.ignoredCount} ignored`
                  : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="noise-upload-intent">Ableton Set (optional)</Label>
            <Input
              id="noise-upload-intent"
              type="file"
              accept=".als,.xml,application/xml,text/xml"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setIntentFile(file);
              }}
            />
            {intentFile ? (
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  {intentFile.name} | {formatBytes(intentFile.size)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIntentFile(null)}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Attach a Live set to capture tempo, locators, and device intent.
              </p>
            )}
          </div>

          <div>
            <Label>Tempo (optional)</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                BPM
                <Input
                  type="text"
                  inputMode="decimal"
                  value={bpm}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "" || isBpmInputValue(raw)) {
                      setBpmTouched(true);
                      setBpm(raw);
                    }
                  }}
                  onBlur={() => {
                    if (!bpm) return;
                    const numeric = sanitizeBpmInput(bpm);
                    if (numeric == null) {
                      setBpm("");
                      return;
                    }
                    setBpm(numeric.toFixed(2));
                  }}
                  className="rounded bg-slate-900 px-2 py-1 text-slate-100"
                  placeholder="120.00"
                />
              </label>
              <label className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={quantized}
                  onChange={(event) => setQuantized(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                Quantize selections to bar grid
              </label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Time signature is locked to 4/4 for Noise Gens.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Label>Time & Sky (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Provenance metadata for replay. Leave blank to use project defaults.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={pulseEnabled}
                  onChange={(event) => {
                    setPulseTouched(true);
                    setPulseEnabled(event.target.checked);
                  }}
                  className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                Use cosmic pulse for seeding
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Published date
                <Input
                  type="date"
                  value={publishedDate}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setPublishedDate(event.target.value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Timezone
                <Input
                  value={timezone}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setTimezone(event.target.value);
                  }}
                  placeholder="America/Los_Angeles"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Composed start
                <Input
                  type="month"
                  value={composedStart}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setComposedStart(event.target.value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Composed end
                <Input
                  type="month"
                  value={composedEnd}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setComposedEnd(event.target.value);
                  }}
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Place
                <Input
                  value={place}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setPlace(event.target.value);
                  }}
                  disabled={placePrecision === "hidden"}
                  placeholder={
                    placePrecision === "hidden" ? "Hidden" : "City or region"
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Place privacy
                <select
                  value={placePrecision}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setPlacePrecisionTouched(true);
                    setPlacePrecision(
                      event.target.value as "exact" | "approximate" | "hidden",
                    );
                  }}
                  className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <option value="exact">Exact</option>
                  <option value="approximate">Approximate</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            </div>

            <div className="mt-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Sky signature
                <Input
                  value={skySignature}
                  onChange={(event) => {
                    setTimeSkyTouched(true);
                    setSkySignature(event.target.value);
                  }}
                  placeholder="HALO-XXXX..."
                />
              </label>
            </div>

            {pulseEnabled ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Pulse source
                    <select
                      value={pulseSource}
                      onChange={(event) => {
                        setPulseTouched(true);
                        setPulseSourceTouched(true);
                        setPulseSource(event.target.value as PulseSource);
                      }}
                      className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <option value="drand">drand beacon</option>
                      <option value="nist-beacon">NIST beacon</option>
                      <option value="curby">CURBy beacon</option>
                      <option value="local-sky-photons">Local sky photons</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Pulse round (optional)
                    <Input
                      value={pulseRound}
                      onChange={(event) => {
                        setPulseTouched(true);
                        setPulseRound(event.target.value);
                      }}
                      placeholder="e.g. 123456"
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Pulse time (optional)
                    <Input
                      type="datetime-local"
                      value={pulseTime}
                      onChange={(event) => {
                        setPulseTouched(true);
                        setPulseTime(event.target.value);
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Pulse value hash
                    <Input
                      value={pulseValueHash}
                      onChange={(event) => {
                        setPulseTouched(true);
                        setPulseValueHash(event.target.value);
                      }}
                      placeholder="hash of the pulse output"
                    />
                  </label>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">
                  Round or time plus a value hash is required to replay the seed.
                </p>
                {pulseSource === "local-sky-photons" ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Local sky photons are studio-only; store the derived hash for
                    reproducibility.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Pulse data is a public salt for replay, not a security key.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Label>Intent contract (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lock invariants and allowable variation for this original.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={intentContractEnabled}
                  onChange={(event) => setIntentContractEnabled(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                Enable intent contract
              </label>
            </div>

            {intentContractEnabled ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Key
                    <Input
                      value={intentKey}
                      onChange={(event) => setIntentKey(event.target.value)}
                      placeholder="A minor"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Stem locks
                    <Input
                      value={intentStemLocks}
                      onChange={(event) => setIntentStemLocks(event.target.value)}
                      placeholder="drums, lead"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Groove template IDs
                    <Input
                      value={intentGrooveTemplateIds}
                      onChange={(event) =>
                        setIntentGrooveTemplateIds(event.target.value)
                      }
                      placeholder="groove-1, groove-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Motif IDs
                    <Input
                      value={intentMotifIds}
                      onChange={(event) => setIntentMotifIds(event.target.value)}
                      placeholder="motif-a, motif-b"
                    />
                  </label>
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
                            value={intentRanges[field.key].min}
                            onChange={(event) =>
                              setIntentRanges((prev) => ({
                                ...prev,
                                [field.key]: {
                                  ...prev[field.key],
                                  min: event.target.value,
                                },
                              }))
                            }
                            placeholder="Min"
                          />
                          <Input
                            value={intentRanges[field.key].max}
                            onChange={(event) =>
                              setIntentRanges((prev) => ({
                                ...prev,
                                [field.key]: {
                                  ...prev[field.key],
                                  max: event.target.value,
                                },
                              }))
                            }
                            placeholder="Max"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Arrangement moves
                    <Input
                      value={intentArrangementMoves}
                      onChange={(event) =>
                        setIntentArrangementMoves(event.target.value)
                      }
                      placeholder="swap-hook, drop-drums"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Ideology root
                    <Input
                      value={intentIdeologyRootId}
                      onChange={(event) =>
                        setIntentIdeologyRootId(event.target.value)
                      }
                      placeholder="worldview-integrity"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Allowed nodes
                    <Input
                      value={intentAllowedNodeIds}
                      onChange={(event) =>
                        setIntentAllowedNodeIds(event.target.value)
                      }
                      placeholder="stewardship-ledger, interbeing-systems"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    Store Time &amp; Sky
                    <input
                      type="checkbox"
                      checked={intentStoreTimeSky}
                      onChange={(event) =>
                        setIntentStoreTimeSky(event.target.checked)
                      }
                      className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    Store pulse
                    <input
                      type="checkbox"
                      checked={intentStorePulse}
                      onChange={(event) =>
                        setIntentStorePulse(event.target.checked)
                      }
                      className="h-3.5 w-3.5 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Pulse source
                    <select
                      value={intentPulseSource}
                      onChange={(event) =>
                        setIntentPulseSource(event.target.value as PulseSource)
                      }
                      disabled={!intentStorePulse}
                      className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <option value="drand">drand beacon</option>
                      <option value="nist-beacon">NIST beacon</option>
                      <option value="curby">CURBy beacon</option>
                      <option value="local-sky-photons">Local sky photons</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Place precision
                    <select
                      value={intentPlacePrecision}
                      onChange={(event) =>
                        setIntentPlacePrecision(
                          event.target.value as
                            | "exact"
                            | "approximate"
                            | "hidden",
                        )
                      }
                      className="h-10 rounded border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <option value="exact">Exact</option>
                      <option value="approximate">Approximate</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </label>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={intentNotes}
                    onChange={(event) => setIntentNotes(event.target.value)}
                    placeholder="Optional notes about the intent contract."
                    className="mt-2 min-h-[80px]"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Enable to store creator intent rules alongside the original.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="noise-upload-lyrics">Lyrics (optional)</Label>
            <Textarea
              id="noise-upload-lyrics"
              value={lyrics}
              onChange={(event) => setLyrics(event.target.value)}
              placeholder="Paste lyrics for the listener panels and ideology parallels."
              className="min-h-[80px]"
            />
          </div>
        </div>
        )}

        {!showIntentSummary && uploadProgress && uploadProgress.length ? (
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Uploading {uploadProgress.length} file(s)</span>
              {uploadTotalProgress?.pct != null ? (
                <span>{Math.round(uploadTotalProgress.pct * 100)}%</span>
              ) : null}
            </div>
            <Progress
              value={
                uploadTotalProgress?.pct != null
                  ? Math.round(uploadTotalProgress.pct * 100)
                  : 0
              }
              className="mt-2 h-2"
            />
            <div className="mt-3 space-y-2">
              {uploadProgress.map((file) => (
                <div key={file.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{file.name}</span>
                    <span>
                      {file.status === "processing"
                        ? "Processing"
                        : file.status === "done"
                          ? "Done"
                          : file.status === "error"
                            ? "Error"
                            : file.status === "queued"
                              ? "Queued"
                              : `${Math.round(file.pct * 100)}%`}
                    </span>
                  </div>
                  <Progress value={Math.round(file.pct * 100)} className="h-1.5" />
                  {file.error ? (
                    <p className="text-[11px] text-destructive">{file.error}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showIntentSummary ? (
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={intentPrefsSaving}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveIntentPreferences()}
              disabled={
                intentSummaryLoading || intentPrefsSaving || !intentSnapshot
              }
              className="min-w-[140px]"
            >
              {intentPrefsSaving ? "Saving..." : "Save preferences"}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (requiresAuth) {
                  onRequestSignIn?.();
                  return;
                }
                void handleSubmit();
              }}
              disabled={submitButtonDisabled}
              className="min-w-[120px]"
            >
              {submitButtonLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UploadOriginalsModal;
