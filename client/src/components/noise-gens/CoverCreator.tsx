import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  deleteKnowledgeFile,
  listKnowledgeFiles,
  saveKnowledgeFiles,
  updateKnowledgeFileTags,
  type KnowledgeFileRecord,
} from "@/lib/agi/knowledge-store";
import {
  createCoverJob,
  fetchCoverJob,
  fetchJobStatus,
  fetchRecipes,
  saveRecipe,
  updateRecipe,
  deleteRecipe,
  requestGeneration,
  uploadCoverPreview,
} from "@/lib/api/noiseGens";
import { isAudioKnowledgeFile } from "@/lib/knowledge/audio";
import {
  applyAtomSelectionToPlan,
  buildAtomIndex,
} from "@/lib/knowledge/atom-curation";
import {
  analyzeOriginalForPlan,
  type PlanAnalysis,
} from "@/lib/noise/plan-analysis";
import { resolveAbletonPlanFeatures } from "@/lib/noise/ableton-analysis";
import type {
  JobStatus,
  MoodPreset,
  Original,
  NoisegenRecipe,
  HelixPacket,
  BarWindow,
  CoverJobRequest,
  CoverJob,
  PlanMeta,
  TempoMeta,
  KBTexture,
  KBMatch,
  ListenerMacroLocks,
  RenderPlan,
  RenderPlanGroupKey,
  RenderPlanGroupLevels,
  CoverEvidence,
  EditionReceipt,
} from "@/types/noise-gens";
import type { NoisegenUiMode } from "@/hooks/useNoisegenUiMode";
import { cn } from "@/lib/utils";
import {
  fulfillCoverJob,
  canFulfillLocally,
  scoreRenderPlan,
} from "@/lib/noise/cover-runner";
import { autoMatchTexture, resolveTextureById } from "@/lib/noise/kb-autoselect";
import {
  COVER_FLOW_EVENT,
  COVER_FLOW_STORAGE_KEY,
  clearCoverFlowPayload,
  readCoverFlowPayload,
  writeCoverFlowPayload,
  type CoverFlowPayload,
} from "@/lib/noise/cover-flow";

export const COVER_DROPPABLE_ID = "noise-cover-creator";

export type RenderJobUpdate = {
  jobId: string;
  status: JobStatus | null;
  original?: Original | null;
  previewUrl?: string | null;
  sourceLabel?: string;
  startedAt?: number;
  evidence?: CoverEvidence;
};

export type RenderJobResult = RenderJobUpdate & { completedAt: number };

type PlanRankCandidate = {
  id: string;
  seed: string;
  plan?: RenderPlan;
  planMeta?: PlanMeta;
  status: "planning" | "scoring" | "scored" | "error";
  idi?: number;
  confidence?: number;
  score?: number;
  repetitionPenalty?: number;
  error?: string;
};

type PlanAnalysisBundle = {
  analysis: PlanAnalysis | null;
  key?: string;
};

type ListenerMacros = {
  energy: number;
  space: number;
  brightness: number;
  weirdness: number;
  drive: number;
};

type CoverCreatorProps = {
  selectedOriginal: Original | null;
  onClearSelection: () => void;
  moodPresets: MoodPreset[];
  includeHelixPacket: boolean;
  helixPacket: HelixPacket | null;
  sessionTempo?: TempoMeta | null;
  uiMode?: NoisegenUiMode;
  coverControlsEnabled?: boolean;
  onRenderJobUpdate?: (event: RenderJobUpdate | null) => void;
  onRenderJobComplete?: (event: RenderJobResult) => void;
};

type JobTracker = {
  id: string;
  status: JobStatus;
  mode: "legacy" | "cover";
  snapshot?: CoverJob;
  sourceLabel?: string;
  original?: Original | null;
  startedAt?: number;
  forceRemote?: boolean;
};

const STATUS_ORDER: JobStatus[] = ["queued", "processing", "ready", "error"];

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const clampBarValue = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, value));

const parseIdList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const formatIdList = (value?: string[]): string =>
  Array.isArray(value) && value.length ? value.join(", ") : "";

const clonePlanWindow = (window: RenderPlan["windows"][number]) => ({
  ...window,
  material: window.material ? { ...window.material } : undefined,
  texture: window.texture
    ? {
        ...window.texture,
        fx: window.texture.fx ? { ...window.texture.fx } : undefined,
      }
    : undefined,
});

const cloneRenderPlan = (plan: RenderPlan): RenderPlan => ({
  ...plan,
  global: plan.global
    ? {
        ...plan.global,
        sections: plan.global.sections
          ? plan.global.sections.map((section) => ({ ...section }))
          : undefined,
        energyCurve: plan.global.energyCurve
          ? plan.global.energyCurve.map((point) => ({ ...point }))
          : undefined,
        locks: plan.global.locks ? { ...plan.global.locks } : undefined,
        groups: plan.global.groups ? { ...plan.global.groups } : undefined,
      }
    : undefined,
  windows: plan.windows.map((window) => clonePlanWindow(window)),
});

type PlanWindowAnalysis = NonNullable<PlanAnalysis["windows"]>[number];

const planWindowKey = (startBar: number, bars: number) => `${startBar}:${bars}`;

const PLAN_RANK_PREVIEW_BARS = 16;

const GROUP_KEYS: RenderPlanGroupKey[] = [
  "drums",
  "bass",
  "music",
  "textures",
  "fx",
];
const GROUP_LABELS: Record<RenderPlanGroupKey, string> = {
  drums: "Drums",
  bass: "Bass",
  music: "Music",
  textures: "Textures",
  fx: "FX",
};
const DEFAULT_GROUP_LEVELS: RenderPlanGroupLevels = {
  drums: 0.5,
  bass: 0.5,
  music: 0.5,
  textures: 0.5,
  fx: 0.5,
};

const formatTimestamp = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return "--";
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

const formatIntentSimilarity = (value?: number) => formatPercent(value);

const formatViolationPreview = (violations?: string[]) => {
  if (!violations?.length) return null;
  const preview = violations.slice(0, 2).join("; ");
  return violations.length > 2
    ? `${preview} +${violations.length - 2} more`
    : preview;
};

const buildReceiptChips = (receipt?: EditionReceipt) => {
  if (!receipt) return [];
  const chips: string[] = [];
  if (receipt.contract?.hash) {
    chips.push(`Contract ${formatHashShort(receipt.contract.hash)}`);
  }
  if (receipt.contract?.intentSimilarity != null) {
    chips.push(`Intent ${formatIntentSimilarity(receipt.contract.intentSimilarity)}`);
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
    if (!Number.isFinite(value) || Math.abs(value) < threshold) return;
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

const normalizeIdList = (list?: string[]) => {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(list.map((entry) => (typeof entry === "string" ? entry.trim() : ""))),
  )
    .filter(Boolean)
    .sort();
};

const resolveTextureKey = (
  value: RenderPlan["windows"][number]["texture"] | undefined,
) => {
  const kbTexture = value?.kbTexture;
  if (!kbTexture) return "";
  if (typeof kbTexture === "string") return kbTexture;
  if (typeof kbTexture === "object" && "weights" in kbTexture) {
    const entries = Object.entries(kbTexture.weights ?? {})
      .map(([key, weight]) => [key, Number(weight) || 0] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, weight]) => `${key}:${weight.toFixed(3)}`);
    return entries.length ? `blend:${entries.join(",")}` : "";
  }
  return "";
};

const resolveWindowSignature = (window: RenderPlan["windows"][number]) => {
  const textureKey = resolveTextureKey(window.texture);
  const materialIds = normalizeIdList([
    ...(window.material?.audioAtomIds ?? []),
    ...(window.material?.midiMotifIds ?? []),
    ...(window.material?.grooveTemplateIds ?? []),
    ...(window.material?.macroCurveIds ?? []),
  ]);
  const materialKey = materialIds.join("|");
  return [textureKey, materialKey].filter(Boolean).join("::");
};

const windowIntersects = (
  planWindow: RenderPlan["windows"][number],
  barWindow: BarWindow,
) => {
  const planStart = Math.max(1, Math.floor(planWindow.startBar));
  const planEnd = planStart + Math.max(1, Math.floor(planWindow.bars));
  const rangeStart = Math.max(1, Math.floor(barWindow.startBar));
  const rangeEnd = Math.max(rangeStart + 1, Math.floor(barWindow.endBar));
  return planStart < rangeEnd && planEnd > rangeStart;
};

const computeRepetitionPenalty = (
  plan: RenderPlan,
  previewWindows?: BarWindow[],
) => {
  if (!plan?.windows?.length) return 0;
  const scoped = Array.isArray(previewWindows) && previewWindows.length
    ? plan.windows.filter((window) =>
        previewWindows.some((preview) => windowIntersects(window, preview)),
      )
    : plan.windows;
  if (scoped.length <= 1) return 0;
  const signatures = scoped.map(resolveWindowSignature);
  const uniqueCount = new Set(signatures).size;
  const repetitionRatio = 1 - uniqueCount / scoped.length;
  return clamp01(repetitionRatio);
};

const applyListenerFxOverlay = (
  plan: RenderPlan,
  macros: ListenerMacros | null,
): RenderPlan => {
  if (!macros) return plan;
  const spaceDelta = macros.space - 0.5;
  const driveDelta = macros.drive - 0.5;
  if (Math.abs(spaceDelta) < 0.01 && Math.abs(driveDelta) < 0.01) {
    return plan;
  }
  return {
    ...plan,
    windows: plan.windows.map((window) => {
      const texture = window.texture ?? {};
      const baseFx = texture.fx ?? {};
      const baseReverb =
        typeof baseFx.reverbSend === "number" ? baseFx.reverbSend : 0.5;
      const baseComp = typeof baseFx.comp === "number" ? baseFx.comp : 0.5;
      const nextFx = {
        ...baseFx,
        ...(Math.abs(spaceDelta) >= 0.01
          ? { reverbSend: clamp01(baseReverb + spaceDelta * 0.6) }
          : {}),
        ...(Math.abs(driveDelta) >= 0.01
          ? { comp: clamp01(baseComp + driveDelta * 0.6) }
          : {}),
      };
      return {
        ...window,
        texture: {
          ...texture,
          fx: nextFx,
        },
      };
    }),
  };
};

const normalizeGroupLevels = (
  levels: RenderPlanGroupLevels | null | undefined,
): RenderPlanGroupLevels => {
  if (!levels) return {};
  const next: RenderPlanGroupLevels = {};
  for (const key of GROUP_KEYS) {
    const value = levels[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = clamp01(value);
    }
  }
  return next;
};

const mergeGroupLevels = (
  base: RenderPlanGroupLevels,
  incoming: RenderPlanGroupLevels | null | undefined,
  locks: ListenerMacroLocks | null | undefined,
): RenderPlanGroupLevels => {
  const next = { ...base };
  const normalizedIncoming = normalizeGroupLevels(incoming);
  for (const key of GROUP_KEYS) {
    const incomingValue = normalizedIncoming[key];
    const locked = Boolean(locks?.[key]);
    if (locked) {
      if (next[key] == null && typeof incomingValue === "number") {
        next[key] = incomingValue;
      }
      continue;
    }
    if (typeof incomingValue === "number") {
      next[key] = incomingValue;
    }
  }
  return next;
};

const extractGroupLocks = (
  locks: ListenerMacroLocks | null | undefined,
): ListenerMacroLocks => {
  if (!locks) return {};
  const next: ListenerMacroLocks = {};
  for (const key of GROUP_KEYS) {
    if (locks[key]) {
      next[key] = true;
    }
  }
  return next;
};

const mergePlanLocks = (
  planLocks: ListenerMacroLocks | undefined,
  overrides: ListenerMacroLocks,
): ListenerMacroLocks | undefined => {
  const merged = { ...(planLocks ?? {}), ...overrides };
  return Object.values(merged).some(Boolean) ? merged : undefined;
};

const applyGroupOverrides = (
  plan: RenderPlan,
  levels: RenderPlanGroupLevels,
  locks: ListenerMacroLocks,
): RenderPlan => {
  const mergedLocks = mergePlanLocks(plan.global?.locks, locks);
  const normalizedLevels = normalizeGroupLevels(levels);
  const hasLevels = Object.values(normalizedLevels).some(
    (value) => typeof value === "number",
  );
  if (!mergedLocks && !hasLevels) return plan;
  return {
    ...plan,
    global: {
      ...(plan.global ?? {}),
      ...(mergedLocks ? { locks: mergedLocks } : {}),
      ...(hasLevels ? { groups: normalizedLevels } : {}),
    },
  };
};

const resolveGroupSettings = (
  plan: RenderPlan,
  baseLevels: RenderPlanGroupLevels,
  baseLocks: ListenerMacroLocks,
) => {
  const planLocks = extractGroupLocks(plan.global?.locks);
  const mergedLocks = { ...baseLocks, ...planLocks };
  const mergedLevels = mergeGroupLevels(
    baseLevels,
    plan.global?.groups,
    mergedLocks,
  );
  return { mergedLevels, mergedLocks };
};

const resolvePlanRange = (
  plan: RenderPlan,
  fallback: { start: number; end: number },
) => {
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const window of plan.windows ?? []) {
    const startBar = clampBarValue(window.startBar, fallback.start);
    const bars = clampBarValue(window.bars, 1);
    const endBar = startBar + bars;
    if (startBar < minStart) minStart = startBar;
    if (endBar > maxEnd) maxEnd = endBar;
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return fallback;
  }
  const safeEnd = Math.max(minStart + 1, maxEnd);
  return { start: minStart, end: safeEnd };
};

const buildPreviewWindows = (
  windows: BarWindow[],
  previewBars: number,
): BarWindow[] => {
  if (!windows.length) return [];
  const sorted = [...windows].sort(
    (a, b) => a.startBar - b.startBar || a.endBar - b.endBar,
  );
  let remaining = Math.max(1, Math.floor(previewBars));
  const result: BarWindow[] = [];
  for (const window of sorted) {
    if (remaining <= 0) break;
    const windowBars = Math.max(1, window.endBar - window.startBar);
    const bars = Math.min(windowBars, remaining);
    const startBar = Math.max(1, Math.floor(window.startBar));
    const endBar = Math.max(startBar + 1, startBar + bars);
    result.push({ startBar, endBar });
    remaining -= bars;
  }
  return result.length ? result : [sorted[0]];
};

const mergePlanAnalyses = (
  primary: PlanAnalysis | null,
  fallback: PlanAnalysis | null,
): PlanAnalysis | null => {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;

  const windowMap = new Map<string, PlanWindowAnalysis>();
  const addWindow = (window: PlanWindowAnalysis) => {
    const key = planWindowKey(window.startBar, window.bars);
    windowMap.set(key, { ...window });
  };
  fallback.windows?.forEach(addWindow);
  primary.windows?.forEach((window) => {
    const key = planWindowKey(window.startBar, window.bars);
    const existing = windowMap.get(key);
    windowMap.set(key, {
      startBar: window.startBar,
      bars: window.bars,
      energy:
        typeof window.energy === "number" ? window.energy : existing?.energy,
      density:
        typeof window.density === "number" ? window.density : existing?.density,
      brightness:
        typeof window.brightness === "number"
          ? window.brightness
          : existing?.brightness,
    });
  });

  const windows = windowMap.size
    ? Array.from(windowMap.values()).sort(
        (a, b) => a.startBar - b.startBar || a.bars - b.bars,
      )
    : undefined;

  const energyByBar = primary.energyByBar?.length
    ? primary.energyByBar
    : fallback.energyByBar;
  const densityByBar = primary.densityByBar?.length
    ? primary.densityByBar
    : fallback.densityByBar;
  const onsetDensityByBar = primary.onsetDensityByBar?.length
    ? primary.onsetDensityByBar
    : fallback.onsetDensityByBar;
  const brightnessByBar = primary.brightnessByBar?.length
    ? primary.brightnessByBar
    : fallback.brightnessByBar;
  const centroidByBar = primary.centroidByBar?.length
    ? primary.centroidByBar
    : fallback.centroidByBar;
  const rolloffByBar = primary.rolloffByBar?.length
    ? primary.rolloffByBar
    : fallback.rolloffByBar;
  const dynamicRangeByBar = primary.dynamicRangeByBar?.length
    ? primary.dynamicRangeByBar
    : fallback.dynamicRangeByBar;
  const crestFactorByBar = primary.crestFactorByBar?.length
    ? primary.crestFactorByBar
    : fallback.crestFactorByBar;
  const tempoByBar = primary.tempoByBar?.length
    ? primary.tempoByBar
    : fallback.tempoByBar;
  const silenceByBar = primary.silenceByBar?.length
    ? primary.silenceByBar
    : fallback.silenceByBar;
  const chromaByBar = primary.chromaByBar?.length
    ? primary.chromaByBar
    : fallback.chromaByBar;
  const keyConfidence =
    typeof primary.keyConfidence === "number"
      ? primary.keyConfidence
      : fallback.keyConfidence;
  const sections = primary.sections?.length ? primary.sections : fallback.sections;
  const energyCurve = primary.energyCurve?.length
    ? primary.energyCurve
    : fallback.energyCurve;

  return {
    ...(windows ? { windows } : {}),
    ...(energyByBar?.length ? { energyByBar } : {}),
    ...(densityByBar?.length ? { densityByBar } : {}),
    ...(onsetDensityByBar?.length ? { onsetDensityByBar } : {}),
    ...(brightnessByBar?.length ? { brightnessByBar } : {}),
    ...(centroidByBar?.length ? { centroidByBar } : {}),
    ...(rolloffByBar?.length ? { rolloffByBar } : {}),
    ...(dynamicRangeByBar?.length ? { dynamicRangeByBar } : {}),
    ...(crestFactorByBar?.length ? { crestFactorByBar } : {}),
    ...(tempoByBar?.length ? { tempoByBar } : {}),
    ...(silenceByBar?.length ? { silenceByBar } : {}),
    ...(chromaByBar?.length ? { chromaByBar } : {}),
    ...(typeof keyConfidence === "number" ? { keyConfidence } : {}),
    ...(sections?.length ? { sections } : {}),
    ...(energyCurve?.length ? { energyCurve } : {}),
  };
};

const TEMPO_STORAGE_KEY = "noisegen:tempo";
const RENDER_PLAN_STORAGE_KEY = "noisegen:renderPlanDraft";
const PLAN_ANALYSIS_CACHE_KEY = "noisegen:planAnalysisCache.v1";
const PLAN_ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PLAN_ANALYSIS_CACHE_LIMIT = 25;
const PLAN_ANALYSIS_FILE_PREFIX = "noisegen-analysis-";
const PLAN_ANALYSIS_TAGS = ["noisegen-analysis", "plan-analysis"];
const MANUAL_PLAN_META: PlanMeta = { plannerVersion: "manual:v1" };
const DEFAULT_LISTENER_MACROS: ListenerMacros = {
  energy: 0.5,
  space: 0.5,
  brightness: 0.5,
  weirdness: 0.5,
  drive: 0.5,
};

type CachedPlanAnalysis = {
  key: string;
  updatedAt: number;
  value: PlanAnalysisBundle | null;
};

const readPlanAnalysisCache = (
  cacheKey: string,
): PlanAnalysisBundle | null | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(PLAN_ANALYSIS_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedPlanAnalysis[];
    if (!Array.isArray(parsed)) return undefined;
    const entry = parsed.find((item) => item.key === cacheKey);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > PLAN_ANALYSIS_CACHE_TTL_MS) {
      return null;
    }
    return entry.value ?? null;
  } catch {
    return undefined;
  }
};

const writePlanAnalysisCache = (
  cacheKey: string,
  value: PlanAnalysisBundle | null,
) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PLAN_ANALYSIS_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedPlanAnalysis[]) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    const next: CachedPlanAnalysis[] = entries.filter(
      (entry) => entry.key !== cacheKey,
    );
    next.push({ key: cacheKey, updatedAt: Date.now(), value });
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed = next.slice(0, PLAN_ANALYSIS_CACHE_LIMIT);
    window.localStorage.setItem(
      PLAN_ANALYSIS_CACHE_KEY,
      JSON.stringify(trimmed),
    );
  } catch {
    // Best-effort cache.
  }
};

const readStoredTempo = (): TempoMeta | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEMPO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.bpm === "number" && typeof parsed?.timeSig === "string") {
      return parsed as TempoMeta;
    }
  } catch {
    return null;
  }
  return null;
};

const readStoredRenderPlan = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(RENDER_PLAN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

type ParsedRenderPlan = { plan: RenderPlan | null; error?: string };

const parseRenderPlan = (value: string): ParsedRenderPlan => {
  const trimmed = value.trim();
  if (!trimmed) return { plan: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return { plan: null, error: "RenderPlan must be a JSON object." };
    }
    if (!Array.isArray((parsed as RenderPlan).windows)) {
      return { plan: null, error: "RenderPlan.windows must be an array." };
    }
    if ((parsed as RenderPlan).windows.length === 0) {
      return { plan: null, error: "RenderPlan.windows must include at least one entry." };
    }
    return { plan: parsed as RenderPlan };
  } catch (error) {
    return {
      plan: null,
      error: error instanceof Error ? error.message : "RenderPlan JSON is invalid.",
    };
  }
};

const KB_TEXTURE_MANIFEST = "/kb-textures/index.json";

type KBTextureOption = KBTexture["id"] | "auto";

export function CoverCreator({
  selectedOriginal,
  onClearSelection,
  moodPresets,
  includeHelixPacket,
  helixPacket,
  sessionTempo,
  uiMode,
  coverControlsEnabled = false,
  onRenderJobUpdate,
  onRenderJobComplete,
}: CoverCreatorProps) {
  const { toast } = useToast();
  const effectiveMode: NoisegenUiMode = uiMode ?? "studio";
  const isListener = effectiveMode === "listener";
  const showRemixTools = effectiveMode !== "listener";
  const showRemixLayer = effectiveMode === "remix";
  const showPlanEditor = effectiveMode === "studio" || effectiveMode === "labs";
  const canEditPlan = showPlanEditor;
  const showRecipeTools =
    effectiveMode === "remix" || effectiveMode === "studio" || effectiveMode === "labs";
  const initialRenderPlanDraft = useMemo(() => readStoredRenderPlan(), []);
  const [seed, setSeed] = useState<string>("");
  const [startBar, setStartBar] = useState<number>(1);
  const [endBar, setEndBar] = useState<number>(9);
  const [kbTexture, setKbTexture] = useState<KBTextureOption>("auto");
  const [kbTextures, setKbTextures] = useState<KBTexture[]>([]);
  const [kbTexturesReady, setKbTexturesReady] = useState(false);
  const [autoMatch, setAutoMatch] = useState<KBMatch | null>(null);
  const [sampleInfluence, setSampleInfluence] = useState<number>(0.7);
  const [styleInfluence, setStyleInfluence] = useState<number>(0.3);
  const [weirdness, setWeirdness] = useState<number>(0.2);
  const [renderPlanDraft, setRenderPlanDraft] = useState<string>(initialRenderPlanDraft);
  const [renderPlan, setRenderPlan] = useState<RenderPlan | null>(null);
  const [renderPlanMeta, setRenderPlanMeta] = useState<PlanMeta | null>(null);
  const [renderPlanEnabled, setRenderPlanEnabled] = useState(false);
  const [renderPlanError, setRenderPlanError] = useState<string | null>(null);
  const [renderPlanOpen, setRenderPlanOpen] = useState<boolean>(
    () => Boolean(initialRenderPlanDraft),
  );
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [ingredientFiles, setIngredientFiles] = useState<KnowledgeFileRecord[]>([]);
  const [ingredientLoading, setIngredientLoading] = useState(false);
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [atomAutoFillRunning, setAtomAutoFillRunning] = useState(false);
  const [atomAutoFillStatus, setAtomAutoFillStatus] = useState<string | null>(
    null,
  );
  const [planRankCount, setPlanRankCount] = useState<number>(3);
  const [planRankCandidates, setPlanRankCandidates] = useState<PlanRankCandidate[]>([]);
  const [planRanking, setPlanRanking] = useState(false);
  const [planRankError, setPlanRankError] = useState<string | null>(null);
  const [planRankStatus, setPlanRankStatus] = useState<string | null>(null);
  const [listenerMode, setListenerMode] = useState<"artist" | "user">("artist");
  const [listenerMacros, setListenerMacros] = useState<ListenerMacros>(
    DEFAULT_LISTENER_MACROS,
  );
  const [groupLevels, setGroupLevels] = useState<RenderPlanGroupLevels>(() => ({
    ...DEFAULT_GROUP_LEVELS,
  }));
  const [groupLocks, setGroupLocks] = useState<ListenerMacroLocks>({});
  const [recipes, setRecipes] = useState<NoisegenRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeFeatured, setRecipeFeatured] = useState(false);
  const [recipeParentId, setRecipeParentId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeStatus, setRecipeStatus] = useState<string | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeBusyId, setRecipeBusyId] = useState<string | null>(null);
  const sortedRecipes = useMemo(() => {
    return [...recipes].sort((left, right) => {
      const featuredDelta =
        Number(Boolean(right.featured)) - Number(Boolean(left.featured));
      if (featuredDelta !== 0) return featuredDelta;
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    });
  }, [recipes]);
  const recipeById = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  );
  const recipesByOriginal = useMemo(() => {
    if (!selectedOriginal) return [];
    return recipes.filter((recipe) => recipe.originalId === selectedOriginal.id);
  }, [recipes, selectedOriginal]);
  const editionTree = useMemo(
    () => buildEditionTree(recipesByOriginal),
    [recipesByOriginal],
  );
  const recipeParent = useMemo(() => {
    if (!recipeParentId) return null;
    return recipeById.get(recipeParentId) ?? null;
  }, [recipeById, recipeParentId]);
  const [job, setJob] = useState<JobTracker | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [fulfillingJobId, setFulfillingJobId] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [coverFlowPayload, setCoverFlowPayload] = useState<CoverFlowPayload | null>(() => readCoverFlowPayload());
  const lastPlanTriggerRef = useRef<string | null>(null);
  const lastPreviewUrlRef = useRef<string | null>(null);
  const lastCompletedJobRef = useRef<string | null>(null);
  const planAnalysisCacheRef = useRef<Map<string, PlanAnalysisBundle | null>>(
    new Map(),
  );
  const analysisArtifactRef = useRef<Set<string>>(new Set());
  const listenerUndoRef = useRef<ListenerMacros | null>(null);
  const { isOver, setNodeRef } = useDroppable({ id: COVER_DROPPABLE_ID });

  const { mutateAsync: queueGeneration, isPending: isRequesting } = useMutation({
    mutationFn: requestGeneration,
  });

  const { mutateAsync: queueCoverJob, isPending: isCoverJobPending } = useMutation({
    mutationFn: (payload: CoverJobRequest) => createCoverJob(payload),
  });

  useEffect(() => {
    let cancelled = false;
    const loadTextures = async () => {
      try {
        const response = await fetch(KB_TEXTURE_MANIFEST, { cache: "no-cache" });
        if (!response.ok) throw new Error(`Failed to load KB textures (${response.status})`);
        const manifest = (await response.json()) as KBTexture[];
        if (!cancelled && Array.isArray(manifest)) {
          const sorted = [...manifest].sort((a, b) => a.name.localeCompare(b.name));
          setKbTextures(sorted);
        }
      } catch (error) {
        console.warn("[CoverCreator] Unable to load KB textures", error);
      } finally {
        if (!cancelled) {
          setKbTexturesReady(true);
        }
      }
    };
    void loadTextures();
    return () => {
      cancelled = true;
    };
  }, []);

  const barWindows = useMemo<BarWindow[]>(() => {
    const start = Math.max(1, Math.round(startBar));
    const end = Math.max(start + 1, Math.round(endBar));
    return [{ startBar: start, endBar: end }];
  }, [startBar, endBar]);

  useEffect(() => {
    if (!sessionTempo) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TEMPO_STORAGE_KEY, JSON.stringify(sessionTempo));
    } catch {
      // ignore persistence issues
    }
  }, [sessionTempo]);

  useEffect(() => {
    if (!initialRenderPlanDraft.trim()) return;
    const { plan, error } = parseRenderPlan(initialRenderPlanDraft);
    if (plan) {
      const { mergedLevels, mergedLocks } = resolveGroupSettings(
        plan,
        DEFAULT_GROUP_LEVELS,
        {},
      );
      const nextPlan = applyGroupOverrides(plan, mergedLevels, mergedLocks);
      setGroupLevels(mergedLevels);
      setGroupLocks(mergedLocks);
      setRenderPlan(nextPlan);
      setRenderPlanMeta(MANUAL_PLAN_META);
      setRenderPlanEnabled(true);
      setRenderPlanError(null);
    } else if (error) {
      setRenderPlanError(error);
    }
  }, [initialRenderPlanDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (renderPlanDraft.trim()) {
        window.localStorage.setItem(RENDER_PLAN_STORAGE_KEY, renderPlanDraft);
      } else {
        window.localStorage.removeItem(RENDER_PLAN_STORAGE_KEY);
      }
    } catch {
      // ignore persistence issues
    }
  }, [renderPlanDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleCoverFlow = (event: Event) => {
      const detail = (event as CustomEvent<CoverFlowPayload | null>).detail;
      setCoverFlowPayload(detail ?? null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COVER_FLOW_STORAGE_KEY) {
        setCoverFlowPayload(readCoverFlowPayload());
      }
    };
    window.addEventListener(COVER_FLOW_EVENT, handleCoverFlow as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(COVER_FLOW_EVENT, handleCoverFlow as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const loadIngredientOptions = useCallback(async () => {
    setIngredientLoading(true);
    setIngredientError(null);
    try {
      const files = await listKnowledgeFiles();
      const audioFiles = files.filter(isAudioKnowledgeFile);
      setIngredientFiles(audioFiles);
      if (!audioFiles.length) {
        setIngredientError("No audio files found in knowledge library.");
      }
    } catch (error) {
      setIngredientError(
        error instanceof Error ? error.message : "Unable to load ingredients.",
      );
    } finally {
      setIngredientLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ingredientsOpen) return;
    void loadIngredientOptions();
  }, [ingredientsOpen, loadIngredientOptions]);

  const updateCoverFlowIngredients = useCallback(
    (nextIds: string[]) => {
      const normalized = normalizeIdList(nextIds);
      if (!normalized.length) {
        clearCoverFlowPayload();
        setCoverFlowPayload(null);
        return;
      }
      const persisted = writeCoverFlowPayload({
        knowledgeFileIds: normalized,
        kbTexture: coverFlowPayload?.kbTexture ?? undefined,
        trackId: coverFlowPayload?.trackId,
        trackName: coverFlowPayload?.trackName,
        albumId: coverFlowPayload?.albumId,
        albumName: coverFlowPayload?.albumName,
        forceRemote: coverFlowPayload?.forceRemote,
      });
      setCoverFlowPayload(persisted);
    },
    [coverFlowPayload],
  );

  const coverFlowAttachmentCount = coverFlowPayload?.knowledgeFileIds?.length ?? 0;
  const selectedIngredientIds = useMemo(
    () => normalizeIdList(coverFlowPayload?.knowledgeFileIds),
    [coverFlowPayload?.knowledgeFileIds],
  );
  const ingredientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of ingredientFiles) {
      map.set(file.id, file.name);
    }
    return map;
  }, [ingredientFiles]);
  const selectedIngredientNames = useMemo(
    () =>
      selectedIngredientIds
        .map((id) => ingredientNameById.get(id))
        .filter((value): value is string => Boolean(value)),
    [ingredientNameById, selectedIngredientIds],
  );

  const handleToggleIngredient = useCallback(
    (fileId: string) => {
      const nextIds = selectedIngredientIds.includes(fileId)
        ? selectedIngredientIds.filter((id) => id !== fileId)
        : [...selectedIngredientIds, fileId];
      updateCoverFlowIngredients(nextIds);
    },
    [selectedIngredientIds, updateCoverFlowIngredients],
  );

  const handleClearIngredients = useCallback(() => {
    updateCoverFlowIngredients([]);
  }, [updateCoverFlowIngredients]);

  useEffect(() => {
    if (!selectedOriginal || !kbTextures.length) {
      setAutoMatch(null);
      return;
    }
    const primaryWindow = barWindows[0];
    const match = autoMatchTexture({
      original: selectedOriginal,
      textures: kbTextures,
      window: primaryWindow,
    });
    setAutoMatch(match);
  }, [selectedOriginal, kbTextures, barWindows]);

  const statusDisplay = useMemo(() => {
    if (!job) {
      return STATUS_ORDER.map((status) => ({ status, active: false, error: false }));
    }
    const currentIndex = STATUS_ORDER.indexOf(job.status);
    return STATUS_ORDER.map((status, index) => ({
      status,
      active: index <= currentIndex && job.status !== "error",
      error: job.status === "error" && index === currentIndex,
    }));
  }, [job]);

  useEffect(() => {
    if (!job || job.status === "ready" || job.status === "error") return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const { id, mode } = job;

    const pollLegacy = async () => {
      try {
        const response = await fetchJobStatus(id, controller.signal);
        if (cancelled) return;
        setJob((prev) => {
          if (prev && prev.id === id) {
            return { ...prev, status: response.status };
          }
          const fallbackMeta = job && job.id === id ? job : undefined;
          return {
            id,
            status: response.status,
            mode: "legacy",
            sourceLabel: fallbackMeta?.sourceLabel,
            original: fallbackMeta?.original ?? selectedOriginal,
            startedAt: fallbackMeta?.startedAt ?? Date.now(),
            forceRemote: fallbackMeta?.forceRemote,
          };
        });
        if (response.detail) {
          setJobMessage(response.detail);
        } else {
          setJobMessage(null);
        }
        if (response.status === "ready") {
          toast({
            title: "Generation ready",
            description: "Your Helix cover is available in the Generations feed.",
          });
        } else if (response.status === "error") {
          toast({
            title: "Generation failed",
            description: response.detail ?? "Try another mood preset.",
            variant: "destructive",
          });
        }
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        toast({
          title: "Status check failed",
          description: error instanceof Error ? error.message : "Could not refresh job status.",
          variant: "destructive",
        });
      }
    };

    const pollCover = async () => {
      try {
        const response = await fetchCoverJob(id, controller.signal);
        if (cancelled) return;
        setJob((prev) => {
          if (prev && prev.id === id) {
            return { ...prev, status: response.status, snapshot: response };
          }
          const fallbackMeta = job && job.id === id ? job : undefined;
          return {
            id,
            status: response.status,
            mode: "cover",
            snapshot: response,
            sourceLabel: fallbackMeta?.sourceLabel,
            original: fallbackMeta?.original ?? selectedOriginal,
            startedAt: fallbackMeta?.startedAt ?? Date.now(),
            forceRemote: fallbackMeta?.forceRemote ?? response.request?.forceRemote,
          };
        });
        const message =
          response.status === "error"
            ? response.error ?? null
            : response.previewUrl
              ? `Preview available: ${response.previewUrl}`
              : null;
        setJobMessage(message);
        if (response.previewUrl) {
          setLocalPreviewUrl((prev) => (prev === response.previewUrl ? prev : response.previewUrl ?? null));
        }
        if (response.status === "ready" || response.status === "error") {
          setRenderProgress(null);
          setFulfillingJobId((prev) => (prev === id ? null : prev));
        }
        if (response.status === "ready") {
          toast({
            title: "Cover ready",
            description: response.previewUrl
              ? "Preview is ready to play."
              : "Your Helix cover is ready.",
          });
        } else if (response.status === "error") {
          toast({
            title: "Cover job failed",
            description: response.error ?? "Unable to process cover job.",
            variant: "destructive",
          });
        }
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        toast({
          title: "Cover status failed",
          description: error instanceof Error ? error.message : "Could not refresh cover job status.",
          variant: "destructive",
        });
      }
    };

    const poll = mode === "cover" ? pollCover : pollLegacy;

    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [job, selectedOriginal, toast]);

  useEffect(() => {
    if (!job || job.mode !== "cover") return undefined;
    if (job.status !== "processing") return undefined;
    if (!job.snapshot) return undefined;
    if (job.forceRemote || job.snapshot.request?.forceRemote) return undefined;
    if (job.snapshot.previewUrl) return undefined;
    if (fulfillingJobId && fulfillingJobId !== job.id) return undefined;
    if (!canFulfillLocally()) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    const jobId = job.id;
    setFulfillingJobId(job.id);
    setRenderProgress((prev) => prev ?? { pct: 0.05, stage: "Preparing offline renderer" });

    const uploadPreview = async (blob: Blob) => {
      try {
        const response = await uploadCoverPreview(jobId, blob, controller.signal);
        return response.previewUrl;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[CoverCreator] preview upload failed, using local URL", error);
        }
        return URL.createObjectURL(blob);
      }
    };

    void fulfillCoverJob(job.snapshot, {
      signal: controller.signal,
      onProgress: (pct, stage) => {
        if (cancelled) return;
        setRenderProgress({ pct, stage });
        setJobMessage(stage);
      },
      uploadPreview,
    })
      .then((result) => {
        if (cancelled) return;
        setLocalPreviewUrl(result.previewUrl);
        setRenderProgress(null);
        setJobMessage("Preview available");
        setJob((prev) => {
          if (!prev || prev.id !== jobId || !prev.snapshot) return prev;
          const updatedSnapshot: CoverJob = {
            ...prev.snapshot,
            previewUrl: result.previewUrl,
            updatedAt: Date.now(),
            evidence: result.evidence,
          };
          return { ...prev, snapshot: updatedSnapshot };
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRenderProgress(null);
        toast({
          title: "Cover renderer failed",
          description: error instanceof Error ? error.message : "Unable to render cover locally.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setFulfillingJobId((prev) => (prev === job.id ? null : prev));
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [job, fulfillingJobId, toast]);

  useEffect(() => {
    if (!selectedOriginal) {
      setJob(null);
      setJobMessage(null);
      setRenderProgress(null);
      setLocalPreviewUrl(null);
      setFulfillingJobId(null);
      setStartBar(1);
      setEndBar(9);
      setKbTexture("auto");
      setAutoMatch(null);
      setSampleInfluence(0.7);
      setStyleInfluence(0.3);
      setWeirdness(0.2);
      lastCompletedJobRef.current = null;
    }
  }, [selectedOriginal]);

  useEffect(() => {
    if (includeHelixPacket && typeof helixPacket?.weirdness === "number") {
      setWeirdness(clamp01(helixPacket.weirdness));
    }
  }, [includeHelixPacket, helixPacket?.weirdness]);

  useEffect(() => {
    if (!coverFlowPayload?.kbTexture) return;
    setKbTexture((current) =>
      current === coverFlowPayload.kbTexture ? current : (coverFlowPayload.kbTexture as KBTextureOption),
    );
  }, [coverFlowPayload?.kbTexture]);

  const formattedDuration = useMemo(() => {
    if (!selectedOriginal) return null;
    const totalSeconds = Math.round(selectedOriginal.duration ?? 0);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [selectedOriginal]);

  const immersionEvidence = job?.snapshot?.evidence ?? null;

  const immersionCard = useMemo(() => {
    if (!immersionEvidence) return null;
    const { idi, idiConfidence, immersion } = immersionEvidence;
    const idiClamped = clamp01(idi);
    const confClamped = clamp01(idiConfidence);
    const idiPct = Math.round(idiClamped * 100);
    const confPct = Math.round(confClamped * 100);
    const gaugeColor =
      idiClamped >= 0.75 ? "bg-emerald-500" : idiClamped >= 0.6 ? "bg-amber-400" : "bg-slate-500";
    const chipTuples: Array<{ key: string; label: string }> = [
      { key: "resolve4_low", label: `4->4 L ${Math.round(clamp01(immersion.resolve4_low) * 100)}%` },
      { key: "resolve4_high", label: `4->4 H ${Math.round(clamp01(immersion.resolve4_high) * 100)}%` },
      { key: "resolve8_low", label: `8->8 L ${Math.round(clamp01(immersion.resolve8_low) * 100)}%` },
      { key: "resolve8_high", label: `8->8 H ${Math.round(clamp01(immersion.resolve8_high) * 100)}%` },
      { key: "bassline", label: `Bass div ${Math.round(clamp01(immersion.bassline_diversity) * 100)}%` },
      { key: "melody", label: `Mel div ${Math.round(clamp01(immersion.melody_division_rate) * 100)}%` },
      { key: "dyads", label: `Dyads ${Math.round(clamp01(immersion.dyadness) * 100)}%` },
      { key: "chords", label: `Chords ${Math.round(clamp01(immersion.chordness) * 100)}%` },
    ];
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wide text-[11px] text-slate-400">
            Immersion
          </span>
          <span className="font-semibold text-slate-100">
            {idiPct}%
            <span className="ml-2 font-normal text-slate-500">conf {confPct}%</span>
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
          <div
            className={cn("h-full rounded-full transition-all", gaugeColor)}
            style={{ width: `${idiPct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chipTuples.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="bg-slate-800/90 text-slate-100">
              {chip.label}
            </Badge>
          ))}
        </div>
      </div>
    );
  }, [immersionEvidence]);

  const barWindowRange = useMemo(() => {
    const start = barWindows[0]?.startBar ?? 1;
    const end = barWindows[0]?.endBar ?? start + 1;
    return { start, end };
  }, [barWindows]);

  const renderPlanSummary = useMemo(() => {
    if (!renderPlan) return null;
    const windows = renderPlan.windows ?? [];
    let minStart: number | null = null;
    let maxEnd: number | null = null;
    let materialCount = 0;
    let textureCount = 0;
    let eqCount = 0;
    let fxCount = 0;
    for (const window of windows) {
      if (window.material) materialCount += 1;
      if (window.texture) textureCount += 1;
      if (window.texture?.eqPeaks?.length) eqCount += 1;
      if (window.texture?.fx) fxCount += 1;
      const start = Number(window.startBar);
      const bars = Number(window.bars);
      if (Number.isFinite(start) && Number.isFinite(bars)) {
        const end = start + bars;
        minStart = minStart === null ? start : Math.min(minStart, start);
        maxEnd = maxEnd === null ? end : Math.max(maxEnd, end);
      }
    }
    return {
      windowCount: windows.length,
      minStart,
      maxEnd,
      materialCount,
      textureCount,
      eqCount,
      fxCount,
      bpm: renderPlan.global?.bpm,
      sectionCount: renderPlan.global?.sections?.length ?? 0,
      energyPoints: renderPlan.global?.energyCurve?.length ?? 0,
    };
  }, [renderPlan]);

  const timelinePlan = useMemo(() => {
    if (renderPlan?.windows?.length) return renderPlan;
    const fallbackBars = Math.max(1, barWindowRange.end - barWindowRange.start);
    return {
      global: sessionTempo?.bpm ? { bpm: sessionTempo.bpm } : undefined,
      windows: [{ startBar: barWindowRange.start, bars: fallbackBars }],
    };
  }, [barWindowRange, renderPlan, sessionTempo]);

  const timelineRange = useMemo(
    () => resolvePlanRange(timelinePlan, barWindowRange),
    [barWindowRange, timelinePlan],
  );
  const timelineTotalBars = Math.max(
    1,
    timelineRange.end - timelineRange.start,
  );
  const timelineGridStyle = useMemo(() => {
    const barWidth = 100 / timelineTotalBars;
    return {
      backgroundSize: `${barWidth}% 100%`,
      backgroundImage:
        "linear-gradient(to right, rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
    };
  }, [timelineTotalBars]);

  const applyRenderPlanDraft = useCallback(() => {
    const { plan, error } = parseRenderPlan(renderPlanDraft);
    if (plan) {
      const { mergedLevels, mergedLocks } = resolveGroupSettings(
        plan,
        groupLevels,
        groupLocks,
      );
      const nextPlan = applyGroupOverrides(plan, mergedLevels, mergedLocks);
      setGroupLevels(mergedLevels);
      setGroupLocks(mergedLocks);
      setRenderPlan(nextPlan);
      setRenderPlanMeta(MANUAL_PLAN_META);
      setRenderPlanEnabled(true);
      setRenderPlanError(null);
      return;
    }
    setRenderPlan(null);
    setRenderPlanMeta(null);
    setRenderPlanEnabled(false);
    setRenderPlanError(error ?? "RenderPlan JSON is invalid.");
  }, [groupLevels, groupLocks, renderPlanDraft]);

  const formatRenderPlanDraft = useCallback(() => {
    const { plan, error } = parseRenderPlan(renderPlanDraft);
    if (!plan) {
      setRenderPlanError(error ?? "RenderPlan JSON is invalid.");
      return;
    }
    setRenderPlanDraft(JSON.stringify(plan, null, 2));
    setRenderPlanError(null);
  }, [renderPlanDraft]);

  const clearRenderPlanDraft = useCallback(() => {
    setRenderPlanDraft("");
    setRenderPlan(null);
    setRenderPlanMeta(null);
    setRenderPlanEnabled(false);
    setRenderPlanError(null);
  }, []);

  const autoFillPlanAtoms = useCallback(async () => {
    setAtomAutoFillStatus(null);
    const { plan, error } = parseRenderPlan(renderPlanDraft);
    if (!plan) {
      setRenderPlanError(error ?? "RenderPlan JSON is invalid.");
      setAtomAutoFillStatus(
        "Paste a RenderPlan JSON before auto-filling atoms.",
      );
      return;
    }
    setAtomAutoFillRunning(true);
    try {
      const files = await listKnowledgeFiles();
      const audioFiles = files.filter(isAudioKnowledgeFile);
      if (!audioFiles.length) {
        setAtomAutoFillStatus(
          "No audio files found in the knowledge library.",
        );
        return;
      }
      const index = buildAtomIndex(audioFiles);
      const tempo =
        sessionTempo ??
        selectedOriginal?.tempo ??
        readStoredTempo() ??
        undefined;
      let result = applyAtomSelectionToPlan(plan, index, {
        tempo,
        requireAtomTag: true,
      });
      let fallbackNote = "";
      if (result.appliedCount === 0) {
        const fallback = applyAtomSelectionToPlan(plan, index, {
          tempo,
          requireAtomTag: false,
        });
        if (fallback.appliedCount > 0) {
          result = fallback;
          fallbackNote = " using untagged audio";
        }
      }
      if (result.appliedCount === 0) {
        setAtomAutoFillStatus(
          "No atom-tagged audio found. Tag atoms or run analysis first.",
        );
        return;
      }
      const { mergedLevels, mergedLocks } = resolveGroupSettings(
        result.plan,
        groupLevels,
        groupLocks,
      );
      const nextPlan = applyGroupOverrides(result.plan, mergedLevels, mergedLocks);
      setGroupLevels(mergedLevels);
      setGroupLocks(mergedLocks);
      setRenderPlan(nextPlan);
      setRenderPlanDraft(JSON.stringify(nextPlan, null, 2));
      setRenderPlanMeta(MANUAL_PLAN_META);
      setRenderPlanEnabled(true);
      setRenderPlanError(null);
      setAtomAutoFillStatus(
        `Filled ${result.appliedCount} window(s)${fallbackNote}.`,
      );
    } catch (error) {
      setAtomAutoFillStatus(
        error instanceof Error ? error.message : "Auto-fill failed.",
      );
    } finally {
      setAtomAutoFillRunning(false);
    }
  }, [groupLevels, groupLocks, renderPlanDraft, selectedOriginal, sessionTempo]);

  const updateListenerMacro = useCallback(
    (key: keyof ListenerMacros, value: number) => {
      setListenerMacros((prev) => {
        listenerUndoRef.current = prev;
        return { ...prev, [key]: clamp01(value) };
      });
      setListenerMode("user");
    },
    [],
  );

  const handleListenerUndo = useCallback(() => {
    const snapshot = listenerUndoRef.current;
    if (snapshot) {
      setListenerMacros(snapshot);
      setListenerMode("user");
    }
  }, []);

  const handleListenerReset = useCallback(() => {
    setListenerMacros(DEFAULT_LISTENER_MACROS);
    setListenerMode("artist");
  }, []);

  const handleGroupLevelChange = useCallback(
    (key: RenderPlanGroupKey, value: number) => {
      setGroupLevels((prev) => ({ ...prev, [key]: clamp01(value) }));
    },
    [],
  );

  const handleGroupLockChange = useCallback(
    (key: RenderPlanGroupKey, value: boolean) => {
      setGroupLocks((prev) => {
        const next = { ...prev };
        if (value) {
          next[key] = true;
        } else {
          delete next[key];
        }
        return next;
      });
    },
    [],
  );

  const buildFallbackPlan = useCallback((): RenderPlan => {
    const fallbackBars = Math.max(1, barWindowRange.end - barWindowRange.start);
    return {
      global: sessionTempo?.bpm ? { bpm: sessionTempo.bpm } : undefined,
      windows: [{ startBar: barWindowRange.start, bars: fallbackBars }],
    };
  }, [barWindowRange, sessionTempo]);

  const getEditablePlan = useCallback(
    (): RenderPlan =>
      renderPlan?.windows?.length ? renderPlan : buildFallbackPlan(),
    [buildFallbackPlan, renderPlan],
  );

  const applyTimelinePlan = useCallback(
    (plan: RenderPlan) => {
      const { mergedLevels, mergedLocks } = resolveGroupSettings(
        plan,
        groupLevels,
        groupLocks,
      );
      const nextPlan = applyGroupOverrides(plan, mergedLevels, mergedLocks);
      setGroupLevels(mergedLevels);
      setGroupLocks(mergedLocks);
      setRenderPlan(nextPlan);
      setRenderPlanDraft(JSON.stringify(nextPlan, null, 2));
      setRenderPlanMeta(MANUAL_PLAN_META);
      setRenderPlanEnabled(true);
      setRenderPlanError(null);
      const range = resolvePlanRange(nextPlan, barWindowRange);
      setStartBar(range.start);
      setEndBar(range.end);
    },
    [barWindowRange, groupLevels, groupLocks],
  );

  const updateTimelinePlan = useCallback(
    (updater: (draft: RenderPlan) => RenderPlan | void) => {
      const draft = cloneRenderPlan(getEditablePlan());
      const nextPlan = updater(draft) ?? draft;
      if (!nextPlan.windows?.length) {
        nextPlan.windows = buildFallbackPlan().windows;
      }
      applyTimelinePlan(nextPlan);
    },
    [applyTimelinePlan, buildFallbackPlan, getEditablePlan],
  );

  const updateWindow = useCallback(
    (
      index: number,
      updater: (window: RenderPlan["windows"][number]) => RenderPlan["windows"][number],
    ) => {
      updateTimelinePlan((draft) => {
        const windows = draft.windows.map((window, idx) =>
          idx === index ? updater(clonePlanWindow(window)) : window,
        );
        return { ...draft, windows };
      });
    },
    [updateTimelinePlan],
  );

  const handleAddWindow = useCallback(() => {
    updateTimelinePlan((draft) => {
      const windows = [...draft.windows];
      const last = windows[windows.length - 1];
      const defaultBars = Math.max(
        1,
        Math.round((barWindowRange.end - barWindowRange.start) / 2),
      );
      const startBar = last
        ? clampBarValue(last.startBar + last.bars, barWindowRange.start)
        : barWindowRange.start;
      windows.push({ startBar, bars: defaultBars });
      return { ...draft, windows };
    });
  }, [barWindowRange, updateTimelinePlan]);

  const handleRemoveWindow = useCallback(
    (index: number) => {
      updateTimelinePlan((draft) => {
        if (draft.windows.length <= 1) return draft;
        const windows = draft.windows.filter((_, idx) => idx !== index);
        return { ...draft, windows };
      });
    },
    [updateTimelinePlan],
  );

  const handleAddSection = useCallback(() => {
    updateTimelinePlan((draft) => {
      const sections = [...(draft.global?.sections ?? [])];
      const defaultBars = Math.max(
        1,
        Math.round((barWindowRange.end - barWindowRange.start) / 2),
      );
      sections.push({
        name: `Section ${sections.length + 1}`,
        startBar: barWindowRange.start,
        bars: defaultBars,
      });
      const nextGlobal = { ...(draft.global ?? {}), sections };
      return { ...draft, global: nextGlobal };
    });
  }, [barWindowRange, updateTimelinePlan]);

  const handleRemoveSection = useCallback(
    (index: number) => {
      updateTimelinePlan((draft) => {
        const sections = (draft.global?.sections ?? []).filter(
          (_, idx) => idx !== index,
        );
        const nextGlobal = { ...(draft.global ?? {}) };
        if (sections.length) {
          nextGlobal.sections = sections;
        } else {
          delete nextGlobal.sections;
        }
        return { ...draft, global: Object.keys(nextGlobal).length ? nextGlobal : undefined };
      });
    },
    [updateTimelinePlan],
  );

  const handleAddEnergyPoint = useCallback(() => {
    updateTimelinePlan((draft) => {
      const energyCurve = [...(draft.global?.energyCurve ?? [])];
      energyCurve.push({ bar: barWindowRange.start, energy: 0.5 });
      const nextGlobal = { ...(draft.global ?? {}), energyCurve };
      return { ...draft, global: nextGlobal };
    });
  }, [barWindowRange, updateTimelinePlan]);

  const updateWindowTextureValue = useCallback(
    (
      index: number,
      key: "sampleInfluence" | "styleInfluence" | "weirdness",
      value: number,
    ) => {
      updateWindow(index, (window) => {
        const texture = { ...(window.texture ?? {}) };
        texture[key] = clamp01(value);
        return { ...window, texture };
      });
    },
    [updateWindow],
  );

  const updateWindowTextureId = useCallback(
    (index: number, value: string) => {
      updateWindow(index, (window) => {
        const texture = { ...(window.texture ?? {}) };
        if (!value) {
          delete texture.kbTexture;
        } else {
          texture.kbTexture = value;
        }
        return {
          ...window,
          texture: Object.keys(texture).length ? texture : undefined,
        };
      });
    },
    [updateWindow],
  );

  const updateWindowMaterialList = useCallback(
    (
      index: number,
      key: "audioAtomIds" | "midiMotifIds" | "grooveTemplateIds",
      raw: string,
    ) => {
      const ids = parseIdList(raw);
      updateWindow(index, (window) => {
        const material = { ...(window.material ?? {}) };
        if (ids.length) {
          material[key] = ids;
        } else {
          delete material[key];
        }
        return {
          ...window,
          material: Object.keys(material).length ? material : undefined,
        };
      });
    },
    [updateWindow],
  );

  const updateSection = useCallback(
    (
      index: number,
      updater: (section: { name: string; startBar: number; bars: number }) => {
        name: string;
        startBar: number;
        bars: number;
      },
    ) => {
      updateTimelinePlan((draft) => {
        const sections = [...(draft.global?.sections ?? [])];
        const current = sections[index] ?? {
          name: `Section ${index + 1}`,
          startBar: barWindowRange.start,
          bars: 1,
        };
        sections[index] = updater({ ...current });
        const nextGlobal = { ...(draft.global ?? {}), sections };
        return { ...draft, global: nextGlobal };
      });
    },
    [barWindowRange.start, updateTimelinePlan],
  );

  const updateEnergyPoint = useCallback(
    (
      index: number,
      updater: (point: { bar: number; energy: number }) => {
        bar: number;
        energy: number;
      },
    ) => {
      updateTimelinePlan((draft) => {
        const energyCurve = [...(draft.global?.energyCurve ?? [])];
        const current = energyCurve[index] ?? {
          bar: barWindowRange.start,
          energy: 0.5,
        };
        energyCurve[index] = updater({ ...current });
        const nextGlobal = { ...(draft.global ?? {}), energyCurve };
        return { ...draft, global: nextGlobal };
      });
    },
    [barWindowRange.start, updateTimelinePlan],
  );

  const handleRemoveEnergyPoint = useCallback(
    (index: number) => {
      updateTimelinePlan((draft) => {
        const energyCurve = (draft.global?.energyCurve ?? []).filter(
          (_, idx) => idx !== index,
        );
        const nextGlobal = { ...(draft.global ?? {}) };
        if (energyCurve.length) {
          nextGlobal.energyCurve = energyCurve;
        } else {
          delete nextGlobal.energyCurve;
        }
        return { ...draft, global: Object.keys(nextGlobal).length ? nextGlobal : undefined };
      });
    },
    [updateTimelinePlan],
  );

  const persistPlanAnalysisArtifact = useCallback(
    async (cacheKey: string, bundle: PlanAnalysisBundle | null, coverRequest: CoverJobRequest) => {
      if (!bundle?.analysis) return;
      if (typeof window === "undefined" || typeof File === "undefined") return;
      const fingerprint = `${coverRequest.originalId}:${cacheKey}`;
      if (analysisArtifactRef.current.has(fingerprint)) return;
      analysisArtifactRef.current.add(fingerprint);
      const fileName = `${PLAN_ANALYSIS_FILE_PREFIX}${coverRequest.originalId}.json`;
      const payload = {
        originalId: coverRequest.originalId,
        key: cacheKey,
        createdAt: Date.now(),
        tempo: coverRequest.tempo ?? null,
        barWindows: coverRequest.barWindows,
        analysis: bundle.analysis,
        analysisKey: bundle.key ?? null,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const file = new File([blob], fileName, { type: "application/json" });
      try {
        const existingFiles = await listKnowledgeFiles();
        const existing = existingFiles.find((entry) => entry.name === fileName);
        if (
          existing &&
          !existing.tags?.some((tag) => PLAN_ANALYSIS_TAGS.includes(tag))
        ) {
          return;
        }
        if (existing) {
          await deleteKnowledgeFile(existing.id);
        }
        const saved = await saveKnowledgeFiles([file]);
        const record = saved[0];
        if (record) {
          await updateKnowledgeFileTags(record.id, [
            ...PLAN_ANALYSIS_TAGS,
            ...(record.tags ?? []),
          ]);
        }
      } catch {
        // Best-effort analysis artifact persistence.
      }
    },
    [],
  );

  const resolvePlanAnalysis = useCallback(
    async (coverRequest: CoverJobRequest): Promise<PlanAnalysisBundle | null> => {
      const tempoMeta =
        coverRequest.tempo ??
        sessionTempo ??
        selectedOriginal?.tempo ??
        readStoredTempo();
      const normalizedWindows = coverRequest.barWindows.map((window) => ({
        startBar: Math.max(1, Math.floor(window.startBar)),
        endBar: Math.max(Math.floor(window.endBar), Math.floor(window.startBar) + 1),
      }));
      const knowledgeFileIds = coverRequest.knowledgeFileIds ?? coverFlowPayload?.knowledgeFileIds;
      const normalizedKnowledgeIds = Array.isArray(knowledgeFileIds)
        ? Array.from(new Set(knowledgeFileIds)).sort()
        : [];
      const trackId = coverFlowPayload?.trackId;
      const trackName = coverFlowPayload?.trackName ?? selectedOriginal?.title;
      const key = JSON.stringify({
        originalId: coverRequest.originalId,
        tempo: tempoMeta
          ? {
              bpm: tempoMeta.bpm,
              timeSig: tempoMeta.timeSig,
              offsetMs: tempoMeta.offsetMs,
              barsInLoop: tempoMeta.barsInLoop,
              quantized: tempoMeta.quantized ?? true,
            }
          : null,
        barWindows: normalizedWindows,
        knowledgeFileIds: normalizedKnowledgeIds,
        trackId,
        trackName,
      });
      if (planAnalysisCacheRef.current.has(key)) {
        return planAnalysisCacheRef.current.get(key) ?? null;
      }
      const cached = readPlanAnalysisCache(key);
      if (cached !== undefined) {
        planAnalysisCacheRef.current.set(key, cached);
        return cached;
      }
      const abletonFeatures = await resolveAbletonPlanFeatures({
        knowledgeFileIds: normalizedKnowledgeIds,
        trackId,
        trackName,
        barWindows: coverRequest.barWindows,
        tempo: tempoMeta ?? null,
      });
      const audioAnalysis = tempoMeta
        ? await analyzeOriginalForPlan({
            originalId: coverRequest.originalId,
            barWindows: coverRequest.barWindows,
            tempo: tempoMeta,
          })
        : null;
      const mergedAnalysis = mergePlanAnalyses(
        abletonFeatures?.analysis ?? null,
        audioAnalysis,
      );
      const bundle =
        mergedAnalysis || abletonFeatures?.key
          ? { analysis: mergedAnalysis, key: abletonFeatures?.key }
          : null;
      planAnalysisCacheRef.current.set(key, bundle);
      writePlanAnalysisCache(key, bundle);
      void persistPlanAnalysisArtifact(key, bundle, coverRequest);
      return bundle;
    },
    [coverFlowPayload, persistPlanAnalysisArtifact, selectedOriginal, sessionTempo],
  );

  const applyPlanCandidate = useCallback(
    (candidate: PlanRankCandidate) => {
      if (!candidate.plan) return;
      const { mergedLevels, mergedLocks } = resolveGroupSettings(
        candidate.plan,
        groupLevels,
        groupLocks,
      );
      const nextPlan = applyGroupOverrides(
        candidate.plan,
        mergedLevels,
        mergedLocks,
      );
      setGroupLevels(mergedLevels);
      setGroupLocks(mergedLocks);
      setRenderPlan(nextPlan);
      setRenderPlanDraft(JSON.stringify(nextPlan, null, 2));
      setRenderPlanMeta(candidate.planMeta ?? null);
      setRenderPlanEnabled(true);
      setRenderPlanOpen(true);
      setRenderPlanError(null);
    },
    [groupLevels, groupLocks],
  );

  const requestPlanCandidate = useCallback(
    async (
      coverRequest: CoverJobRequest,
      seedValue: string,
      analysisBundle?: PlanAnalysisBundle | null,
    ): Promise<{ plan: RenderPlan; planMeta?: PlanMeta }> => {
      const payload = {
        originalId: coverRequest.originalId,
        barWindows: coverRequest.barWindows,
        tempo: coverRequest.tempo ?? undefined,
        kbTexture: coverRequest.kbTexture ?? null,
        base: {
          sampleInfluence: coverRequest.sampleInfluence ?? 0.7,
          styleInfluence: coverRequest.styleInfluence ?? 0.3,
          weirdness: coverRequest.weirdness ?? 0.2,
        },
        analysis: analysisBundle?.analysis ?? undefined,
        key: analysisBundle?.key ?? undefined,
        seed: seedValue,
      };
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Plan request failed (${response.status})`);
      }
      const json = (await response.json()) as {
        renderPlan?: RenderPlan;
        meta?: {
          plannerVersion?: string;
          modelVersion?: string | number;
          toolVersions?: Record<string, string>;
        };
      };
      if (!json?.renderPlan || !Array.isArray(json.renderPlan.windows)) {
        throw new Error("Plan response missing renderPlan windows.");
      }
      const planMeta = json.meta
        ? {
            plannerVersion: json.meta.plannerVersion,
            modelVersion: json.meta.modelVersion,
            toolVersions: json.meta.toolVersions,
          }
        : undefined;
      return { plan: json.renderPlan, planMeta };
    },
    [],
  );

  const buildCoverRequest = useCallback(() => {
    if (!selectedOriginal) return null;
    const windows = barWindows;
    const linkHelix = includeHelixPacket && Boolean(helixPacket);
    const listenerActive = listenerMode === "user";
    const macroState = listenerActive ? listenerMacros : null;
    const resolvedSampleInfluence = clamp01(sampleInfluence);
    const resolvedStyleInfluence = clamp01(styleInfluence);
    const resolvedWeirdness =
      linkHelix && typeof helixPacket?.weirdness === "number"
        ? clamp01(helixPacket.weirdness)
        : clamp01(weirdness);
    const macroEnergy = macroState?.energy ?? 0.5;
    const macroSpace = macroState?.space ?? 0.5;
    const macroBrightness = macroState?.brightness ?? 0.5;
    const macroWeirdness = macroState?.weirdness ?? 0.5;
    const macroDrive = macroState?.drive ?? 0.5;
    const macroSampleInfluence = listenerActive
      ? clamp01(
          resolvedSampleInfluence +
            (macroEnergy - 0.5) * 0.3 +
            (macroDrive - 0.5) * 0.2 +
            (macroBrightness - 0.5) * 0.1,
        )
      : resolvedSampleInfluence;
    const macroStyleInfluence = listenerActive
      ? clamp01(
          resolvedStyleInfluence +
            (macroSpace - 0.5) * 0.35 +
            (macroBrightness - 0.5) * 0.2 +
            (macroEnergy - 0.5) * 0.1,
        )
      : resolvedStyleInfluence;
    const macroWeirdnessValue =
      listenerActive && !linkHelix
        ? clamp01(resolvedWeirdness + (macroWeirdness - 0.5) * 0.4)
        : resolvedWeirdness;
    const autoTextureId = autoMatch?.kb.id ?? null;
    const coverFlowTextureId = coverFlowPayload?.kbTexture ?? null;
    const resolvedTexture =
      kbTexture === "auto" ? autoTextureId ?? coverFlowTextureId : kbTexture;
    const tempoMeta = sessionTempo ?? selectedOriginal.tempo ?? readStoredTempo();
    const kbConfidence =
      kbTexture === "auto" && typeof autoMatch?.confidence === "number"
        ? autoMatch.confidence
        : undefined;
    const knowledgeFileIds = coverFlowPayload?.knowledgeFileIds;
    const forceRemote =
      Boolean(coverFlowPayload?.forceRemote) || !canFulfillLocally();
    const resolvedRenderPlan =
      renderPlanEnabled && renderPlan
        ? applyGroupOverrides(
            applyListenerFxOverlay(renderPlan, macroState),
            groupLevels,
            groupLocks,
          )
        : undefined;

    const coverRequest: CoverJobRequest = {
      originalId: selectedOriginal.id,
      barWindows: windows,
      linkHelix,
      helix: linkHelix && helixPacket ? helixPacket : undefined,
      kbTexture: resolvedTexture ?? null,
      sampleInfluence: macroSampleInfluence,
      styleInfluence: macroStyleInfluence,
      weirdness: macroWeirdnessValue,
      tempo: tempoMeta ?? undefined,
    };
    if (resolvedRenderPlan) {
      coverRequest.renderPlan = resolvedRenderPlan;
      if (renderPlanMeta) {
        coverRequest.planMeta = renderPlanMeta;
      }
    }
    if (typeof kbConfidence === "number") {
      coverRequest.kbConfidence = kbConfidence;
    }
    if (Array.isArray(knowledgeFileIds) && knowledgeFileIds.length > 0) {
      coverRequest.knowledgeFileIds = knowledgeFileIds;
    }
    if (forceRemote) {
      coverRequest.forceRemote = true;
    }
    const startLabel = windows[0]?.startBar ?? 1;
    const endLabel = (windows[0]?.endBar ?? 2) - 1;
    return { coverRequest, startLabel, endLabel, linkHelix };
  }, [
    barWindows,
    autoMatch,
    helixPacket,
    includeHelixPacket,
    kbTexture,
    listenerMacros,
    listenerMode,
    sampleInfluence,
    selectedOriginal,
    sessionTempo,
    styleInfluence,
    weirdness,
    coverFlowPayload,
    groupLevels,
    groupLocks,
    renderPlan,
    renderPlanEnabled,
    renderPlanMeta,
  ]);

  const loadRecipes = useCallback(
    async (search?: string) => {
      setRecipeError(null);
      setRecipeStatus(null);
      setRecipesLoading(true);
      try {
        const records = await fetchRecipes(search?.trim() || undefined);
        setRecipes(records ?? []);
        if (records?.length) {
          setRecipeStatus(`${records.length} recipe${records.length === 1 ? "" : "s"} loaded.`);
        } else {
          setRecipeStatus("No recipes saved yet.");
        }
      } catch (error) {
        setRecipeError(
          error instanceof Error ? error.message : "Failed to load recipes.",
        );
      } finally {
        setRecipesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadRecipes(recipeSearch);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [loadRecipes, recipeSearch]);

  useEffect(() => {
    if (!recipeParentId) return;
    if (recipeById.has(recipeParentId)) return;
    setRecipeParentId(null);
  }, [recipeById, recipeParentId]);

  useEffect(() => {
    setRecipeParentId(null);
  }, [selectedOriginal?.id]);

  const handleSaveRecipe = useCallback(async () => {
    setRecipeError(null);
    setRecipeStatus(null);
    const name = recipeName.trim();
    if (!name) {
      setRecipeError("Enter a recipe name before saving.");
      return;
    }
    if (!selectedOriginal) {
      setRecipeError("Select an original before saving a recipe.");
      return;
    }
    const bundle = buildCoverRequest();
    if (!bundle) {
      setRecipeError("Configure bar windows before saving a recipe.");
      return;
    }
    const coverRequest = {
      ...bundle.coverRequest,
      renderPlan: renderPlan ?? bundle.coverRequest.renderPlan,
    };
    if (renderPlan && renderPlanMeta) {
      coverRequest.planMeta = renderPlanMeta;
    }
    setRecipeSaving(true);
    try {
      await saveRecipe({
        name,
        coverRequest,
        seed: seed.trim() ? seed.trim() : undefined,
        notes: recipeNotes.trim() || undefined,
        featured: recipeFeatured,
        parentId: recipeParentId ?? undefined,
      });
      setRecipeStatus(`Saved recipe "${name}".`);
      setRecipeName("");
      setRecipeNotes("");
      setRecipeFeatured(false);
      setRecipeParentId(null);
      await loadRecipes(recipeSearch);
    } catch (error) {
      setRecipeError(
        error instanceof Error ? error.message : "Recipe save failed.",
      );
    } finally {
      setRecipeSaving(false);
    }
  }, [
    buildCoverRequest,
    loadRecipes,
    recipeName,
    recipeNotes,
    recipeFeatured,
    recipeParentId,
    recipeSearch,
    renderPlan,
    renderPlanMeta,
    seed,
    selectedOriginal,
  ]);

  const handleApplyRecipe = useCallback(
    (recipe: NoisegenRecipe) => {
      if (!selectedOriginal || selectedOriginal.id !== recipe.originalId) {
        toast({
          title: "Select the matching original",
          description: `Recipe ${recipe.name} expects ${recipe.originalId}.`,
        });
        return;
      }
      const request = recipe.coverRequest;
      const primaryWindow = request.barWindows?.[0];
      if (primaryWindow) {
        setStartBar(Math.max(1, Math.floor(primaryWindow.startBar)));
        setEndBar(
          Math.max(
            Math.floor(primaryWindow.endBar),
            Math.floor(primaryWindow.startBar) + 1,
          ),
        );
      }
      setSampleInfluence(
        clamp01(typeof request.sampleInfluence === "number" ? request.sampleInfluence : sampleInfluence),
      );
      setStyleInfluence(
        clamp01(typeof request.styleInfluence === "number" ? request.styleInfluence : styleInfluence),
      );
      setWeirdness(
        clamp01(typeof request.weirdness === "number" ? request.weirdness : weirdness),
      );
      if (request.kbTexture) {
        setKbTexture(request.kbTexture);
      } else {
        setKbTexture("auto");
      }
      if (request.renderPlan) {
        const { mergedLevels, mergedLocks } = resolveGroupSettings(
          request.renderPlan,
          groupLevels,
          groupLocks,
        );
        const nextPlan = applyGroupOverrides(
          request.renderPlan,
          mergedLevels,
          mergedLocks,
        );
        setGroupLevels(mergedLevels);
        setGroupLocks(mergedLocks);
        setRenderPlan(nextPlan);
        setRenderPlanDraft(JSON.stringify(nextPlan, null, 2));
        setRenderPlanMeta(request.planMeta ?? null);
        setRenderPlanEnabled(true);
        setRenderPlanOpen(true);
        setRenderPlanError(null);
      } else {
        setRenderPlan(null);
        setRenderPlanDraft("");
        setRenderPlanMeta(null);
        setRenderPlanEnabled(false);
      }
      if (request.tempo) {
        try {
          window.localStorage.setItem(
            TEMPO_STORAGE_KEY,
            JSON.stringify(request.tempo),
          );
        } catch {
          // ignore tempo persistence errors
        }
      }
      if (Array.isArray(request.knowledgeFileIds) && request.knowledgeFileIds.length) {
        writeCoverFlowPayload({
          knowledgeFileIds: request.knowledgeFileIds,
          kbTexture: request.kbTexture ?? null,
          trackId: selectedOriginal.id,
          trackName: selectedOriginal.title,
        });
      }
      if (recipe.seed != null) {
        setSeed(String(recipe.seed));
      } else {
        setSeed("");
      }
      setRecipeStatus(`Loaded recipe "${recipe.name}".`);
      setRecipeError(null);
    },
    [
      groupLevels,
      groupLocks,
      sampleInfluence,
      selectedOriginal,
      styleInfluence,
      toast,
      weirdness,
    ],
  );

  const handleForkRecipe = useCallback(
    (recipe: NoisegenRecipe) => {
      if (!selectedOriginal || selectedOriginal.id !== recipe.originalId) {
        toast({
          title: "Select the matching original",
          description: `Recipe ${recipe.name} expects ${recipe.originalId}.`,
        });
        return;
      }
      handleApplyRecipe(recipe);
      setRecipeParentId(recipe.id);
      setRecipeStatus(`Forking from "${recipe.name}".`);
      setRecipeError(null);
    },
    [handleApplyRecipe, selectedOriginal, toast],
  );

  const handleToggleFeatured = useCallback(
    async (recipe: NoisegenRecipe) => {
      setRecipeError(null);
      setRecipeStatus(null);
      setRecipeBusyId(recipe.id);
      try {
        const updated = await updateRecipe(recipe.id, {
          featured: !recipe.featured,
        });
        setRecipeStatus(
          `${updated.featured ? "Featured" : "Unfeatured"} "${updated.name}".`,
        );
        await loadRecipes(recipeSearch);
      } catch (error) {
        setRecipeError(
          error instanceof Error ? error.message : "Recipe update failed.",
        );
      } finally {
        setRecipeBusyId(null);
      }
    },
    [loadRecipes, recipeSearch],
  );

  const handleDeleteRecipe = useCallback(
    async (recipe: NoisegenRecipe) => {
      setRecipeError(null);
      setRecipeStatus(null);
      setRecipeBusyId(recipe.id);
      try {
        await deleteRecipe(recipe.id);
        setRecipeStatus(`Deleted recipe "${recipe.name}".`);
        await loadRecipes(recipeSearch);
      } catch (error) {
        setRecipeError(
          error instanceof Error ? error.message : "Recipe delete failed.",
        );
      } finally {
        setRecipeBusyId(null);
      }
    },
    [loadRecipes, recipeSearch],
  );

  const renderEditionNode = (node: EditionNode, depth = 0) => {
    const parent =
      node.recipe.parentId ? recipeById.get(node.recipe.parentId) : null;
    const planDeltas = summarizeEditionDelta(node.recipe, parent);
    const moodDeltas = summarizeMoodDelta(node.recipe, parent);
    const idiLabel = formatPercent(node.recipe.metrics?.idi);
    const intentLabel = formatPercent(
      node.recipe.receipt?.contract?.intentSimilarity,
    );
    const isMatch = selectedOriginal?.id === node.recipe.originalId;
    return (
      <div key={node.recipe.id} style={{ marginLeft: depth * 14 }}>
        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-slate-200">
                {node.recipe.name}
              </div>
              <div className="text-[10px] text-slate-500">
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
                variant="ghost"
                disabled={!isMatch}
                onClick={() => handleForkRecipe(node.recipe)}
              >
                Fork
              </Button>
            </div>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Plan Δ: {planDeltas.length ? planDeltas.join(", ") : "--"}
          </div>
          <div className="text-[10px] text-slate-400">
            Mood Δ: {moodDeltas.length ? moodDeltas.join(", ") : "--"}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
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

  const runPlanRanking = useCallback(async () => {
    setPlanRankError(null);
    setPlanRankStatus(null);
    setPlanRankCandidates([]);

    if (!selectedOriginal) {
      setPlanRankError("Select an original before ranking plans.");
      return;
    }
    if (!canFulfillLocally()) {
      setPlanRankError("Offline rendering is not supported in this browser.");
      return;
    }
    const bundle = buildCoverRequest();
    if (!bundle) {
      setPlanRankError("Configure bar windows before ranking plans.");
      return;
    }

    const count = Math.max(1, Math.min(6, Math.round(planRankCount)));
    const baseSeed = seed.trim() ? seed.trim() : selectedOriginal.id;
    const timestamp = Date.now().toString(36);
    const results: PlanRankCandidate[] = [];
    const previewWindows = buildPreviewWindows(
      bundle.coverRequest.barWindows,
      PLAN_RANK_PREVIEW_BARS,
    );
    setPlanRanking(true);

    setPlanRankStatus("Analyzing source for plan...");
    const analysisBundle = await resolvePlanAnalysis(bundle.coverRequest);

    for (let index = 0; index < count; index += 1) {
      const candidateId = `candidate-${index + 1}`;
      const seedValue = `${baseSeed}-${timestamp}-${index + 1}`;
      let candidate: PlanRankCandidate = {
        id: candidateId,
        seed: seedValue,
        status: "planning",
      };
      results.push(candidate);
      setPlanRankCandidates([...results]);
      setPlanRankStatus(`Generating plan ${index + 1} of ${count}...`);

      try {
        const candidateResult = await requestPlanCandidate(
          bundle.coverRequest,
          seedValue,
          analysisBundle,
        );
        const { mergedLevels, mergedLocks } = resolveGroupSettings(
          candidateResult.plan,
          groupLevels,
          groupLocks,
        );
        const plan = applyGroupOverrides(
          candidateResult.plan,
          mergedLevels,
          mergedLocks,
        );
        candidate = {
          ...candidate,
          plan,
          planMeta: candidateResult.planMeta,
          status: "scoring",
        };
        results[index] = candidate;
        setPlanRankCandidates([...results]);
        setPlanRankStatus(
          `Scoring plan ${index + 1} of ${count} (preview)...`,
        );

        const score = await scoreRenderPlan(
          { ...bundle.coverRequest, renderPlan: undefined },
          plan,
          { barWindows: previewWindows },
        );
        const idi = score.idi;
        const confidence = score.idiConfidence;
        const repetitionPenalty = computeRepetitionPenalty(plan, previewWindows);
        const weightedScore = Math.max(
          0,
          idi * confidence - repetitionPenalty * 0.25,
        );
        candidate = {
          ...candidate,
          status: "scored",
          idi,
          confidence,
          repetitionPenalty,
          score: weightedScore,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Plan ranking failed.";
        candidate = { ...candidate, status: "error", error: message };
      }

      results[index] = candidate;
      setPlanRankCandidates([...results]);
    }

    const best = results
      .filter((entry) => entry.status === "scored" && entry.plan)
      .sort((a, b) => (b.score ?? b.idi ?? 0) - (a.score ?? a.idi ?? 0))[0];
    if (best) {
      applyPlanCandidate(best);
    } else if (results.length > 0) {
      setPlanRankError("No plan scored successfully. Check the console or try fewer candidates.");
    }
    setPlanRanking(false);
    setPlanRankStatus(null);
  }, [
    applyPlanCandidate,
    buildCoverRequest,
    groupLevels,
    groupLocks,
    planRankCount,
    resolvePlanAnalysis,
    requestPlanCandidate,
    scoreRenderPlan,
    seed,
    selectedOriginal,
  ]);

  const weirdnessLocked = includeHelixPacket && Boolean(helixPacket);

  type SubmitCoverJobOptions = {
    coverRequest: CoverJobRequest;
    startLabel: number;
    endLabel: number;
    sourceLabel: string;
    allowLegacyFallback: boolean;
    fallbackPreset?: MoodPreset;
    numericSeed?: number;
  };

  const submitCoverJob = useCallback(
    async ({
      coverRequest,
      startLabel,
      endLabel,
      sourceLabel,
      allowLegacyFallback,
      fallbackPreset,
      numericSeed,
    }: SubmitCoverJobOptions) => {
      try {
        const response = await queueCoverJob(coverRequest);
        const requestSnapshot = response.request ?? coverRequest;
        const now = Date.now();
        const snapshot: CoverJob = {
          id: response.id,
          status: "processing",
          request: requestSnapshot,
          createdAt: now,
          updatedAt: now,
        };
        const startedAt = Date.now();
        setJob({
          id: response.id,
          status: "processing",
          mode: "cover",
          snapshot,
          sourceLabel,
          original: selectedOriginal,
          startedAt,
          forceRemote: requestSnapshot.forceRemote,
        });
        onRenderJobUpdate?.({
          jobId: response.id,
          status: "processing",
          original: selectedOriginal,
          previewUrl: null,
          sourceLabel,
          startedAt,
          evidence: snapshot.evidence,
        });
        setJobMessage(
          requestSnapshot.forceRemote
            ? "Queued for remote rendering"
            : "Queued for local rendering",
        );
        setRenderProgress({ pct: 0.05, stage: "Queued" });
        setLocalPreviewUrl(null);
        setFulfillingJobId(null);
        toast({
          title: `${sourceLabel} queued`,
          description: `Rendering ${selectedOriginal?.title ?? "song"} across bars ${startLabel}-${endLabel}.`,
        });
        return;
      } catch (error) {
        if (
          !allowLegacyFallback ||
          !fallbackPreset ||
          !selectedOriginal
        ) {
          throw error;
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[CoverCreator] cover job request failed, falling back to legacy generate", error);
        }
        setRenderProgress(null);
        setLocalPreviewUrl(null);
        setFulfillingJobId(null);
        try {
          const payload = {
            originalId: selectedOriginal.id,
            moodId: fallbackPreset.id,
            seed: numericSeed,
            helixPacket: includeHelixPacket ? helixPacket ?? undefined : undefined,
          };
          const legacyJob = await queueGeneration(payload);
          const startedAt = Date.now();
          setJob({
            id: legacyJob.jobId,
            status: "queued",
            mode: "legacy",
            sourceLabel: fallbackPreset.label,
            original: selectedOriginal,
            startedAt,
          });
          setJobMessage("Falling back to legacy generator");
          onRenderJobUpdate?.({
            jobId: legacyJob.jobId,
            status: "queued",
            original: selectedOriginal,
            previewUrl: null,
            sourceLabel: fallbackPreset.label,
            startedAt,
            evidence: undefined,
          });
          toast({
            title: "Legacy render queued",
            description: `${sourceLabel} is rendering using the legacy pipeline.`,
          });
        } catch (legacyError) {
          toast({
            title: "Cover job failed",
            description:
              legacyError instanceof Error
                ? legacyError.message
                : "Unable to queue cover job.",
            variant: "destructive",
          });
        }
      }
    },
    [helixPacket, includeHelixPacket, queueCoverJob, queueGeneration, selectedOriginal, toast],
  );

  useEffect(() => {
    const previous = lastPreviewUrlRef.current;
    if (previous && previous.startsWith("blob:") && previous !== localPreviewUrl) {
      URL.revokeObjectURL(previous);
    }
    lastPreviewUrlRef.current = localPreviewUrl ?? null;
    return () => {
      const current = lastPreviewUrlRef.current;
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
        lastPreviewUrlRef.current = null;
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!onRenderJobUpdate) return;
    if (!job) {
      onRenderJobUpdate(null);
      return;
    }
    const previewUrl = job.snapshot?.previewUrl ?? localPreviewUrl ?? null;
    onRenderJobUpdate({
      jobId: job.id,
      status: job.status,
      original: job.original ?? selectedOriginal,
      previewUrl,
      sourceLabel: job.sourceLabel,
      startedAt: job.startedAt,
      evidence: job.snapshot?.evidence,
    });
  }, [job, localPreviewUrl, onRenderJobUpdate, selectedOriginal]);

  useEffect(() => {
    if (!onRenderJobComplete) return;
    if (!job || job.status !== "ready") return;
    if (lastCompletedJobRef.current === job.id) return;
    lastCompletedJobRef.current = job.id;
    const previewUrl = job.snapshot?.previewUrl ?? localPreviewUrl ?? null;
    onRenderJobComplete({
      jobId: job.id,
      status: job.status,
      original: job.original ?? selectedOriginal,
      previewUrl,
      sourceLabel: job.sourceLabel,
      startedAt: job.startedAt,
      completedAt: Date.now(),
      evidence: job.snapshot?.evidence,
    });
  }, [job, localPreviewUrl, onRenderJobComplete, selectedOriginal]);

  const handleQueueGeneration = async (preset: MoodPreset) => {
    if (!selectedOriginal || isRequesting || isCoverJobPending) return;
    if (includeHelixPacket && !helixPacket) {
      toast({
        title: "Helix packet unavailable",
        description: "Open Helix Observables and start a run to capture the packet.",
        variant: "destructive",
      });
      return;
    }

    const bundle = buildCoverRequest();
    if (!bundle) return;
    const numericSeed = seed.trim() ? Number(seed.trim()) : undefined;

    await submitCoverJob({
      coverRequest: bundle.coverRequest,
      startLabel: bundle.startLabel,
      endLabel: bundle.endLabel,
      sourceLabel: preset.label,
      allowLegacyFallback: true,
      fallbackPreset: preset,
      numericSeed,
    });
  };


  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const triggerFromPlan = (token: string | null) => {
      if (!token || lastPlanTriggerRef.current === token) return;
      lastPlanTriggerRef.current = token;
      if (isCoverJobPending) {
        toast({
          title: "Renderer busy",
          description: "Please wait for the current cover job to finish queuing.",
        });
        return;
      }
      if (!selectedOriginal) {
        toast({
          title: "Plan render unavailable",
          description: "Select an original before executing render_cover.",
          variant: "destructive",
        });
        return;
      }
      const bundle = buildCoverRequest();
      if (!bundle) {
        toast({
          title: "Plan render unavailable",
          description: "Configure bar windows before executing render_cover.",
          variant: "destructive",
        });
        return;
      }
      void submitCoverJob({
        coverRequest: bundle.coverRequest,
        startLabel: bundle.startLabel,
        endLabel: bundle.endLabel,
        sourceLabel: "Helix plan",
        allowLegacyFallback: false,
      }).catch((error) => {
        toast({
          title: "Plan render failed",
          description: error instanceof Error ? error.message : "Unable to execute render_cover plan.",
          variant: "destructive",
        });
      });
    };

    const storageHandler = (event: StorageEvent) => {
      if (event.key === "noisegen:renderCover") {
        triggerFromPlan(typeof event.newValue === "string" ? event.newValue : null);
      }
    };

    window.addEventListener("storage", storageHandler);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("helix-exec");
      channel.addEventListener("message", (event) => {
        const record = event.data;
        if (!record || typeof record !== "object") return;
        const results = Array.isArray(record?.results) ? record.results : [];
        const triggered = results.some(
          (entry: { action?: { op?: string }; status?: string }) =>
            entry?.action?.op === "render_cover" && entry?.status === "applied",
        );
        if (triggered) {
          triggerFromPlan(typeof record?.planId === "string" ? record.planId : Date.now().toString(36));
        }
      });
    }

    return () => {
      window.removeEventListener("storage", storageHandler);
      channel?.close();
    };
  }, [buildCoverRequest, isCoverJobPending, selectedOriginal, submitCoverJob, toast]);

  const listenerModeButtons = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button
        size="sm"
        variant={listenerMode === "artist" ? "secondary" : "outline"}
        onClick={() => setListenerMode("artist")}
      >
        Artist
      </Button>
      <Button
        size="sm"
        variant={listenerMode === "user" ? "secondary" : "outline"}
        onClick={() => setListenerMode("user")}
      >
        User
      </Button>
    </div>
  );

  const macroControls = (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Energy</span>
          <span>{Math.round(listenerMacros.energy * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={listenerMacros.energy}
          onChange={(event) =>
            updateListenerMacro("energy", Number(event.target.value))
          }
          className="mt-1 h-1.5 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Space</span>
          <span>{Math.round(listenerMacros.space * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={listenerMacros.space}
          onChange={(event) =>
            updateListenerMacro("space", Number(event.target.value))
          }
          className="mt-1 h-1.5 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Brightness</span>
          <span>{Math.round(listenerMacros.brightness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={listenerMacros.brightness}
          onChange={(event) =>
            updateListenerMacro("brightness", Number(event.target.value))
          }
          className="mt-1 h-1.5 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Weirdness</span>
          <span>{Math.round(listenerMacros.weirdness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={listenerMacros.weirdness}
          onChange={(event) =>
            updateListenerMacro("weirdness", Number(event.target.value))
          }
          className="mt-1 h-1.5 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Drive</span>
          <span>{Math.round(listenerMacros.drive * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={listenerMacros.drive}
          onChange={(event) => updateListenerMacro("drive", Number(event.target.value))}
          className="mt-1 h-1.5 w-full accent-primary"
        />
      </div>
    </div>
  );

  const macroActionButtons = (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleListenerUndo}
        disabled={!listenerUndoRef.current}
      >
        Undo
      </Button>
      <Button size="sm" variant="ghost" onClick={handleListenerReset}>
        Reset
      </Button>
    </>
  );

  const macroActions = (
    <div className="mt-3 flex flex-wrap gap-2">{macroActionButtons}</div>
  );

  const groupPanel = (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stem groups
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Balance core groups and lock them before ranking plans.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {GROUP_KEYS.map((key) => {
          const level = clamp01(
            groupLevels[key] ?? DEFAULT_GROUP_LEVELS[key] ?? 0.5,
          );
          const locked = Boolean(groupLocks[key]);
          return (
            <div
              key={key}
              className="rounded-lg border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium text-slate-100">
                  {GROUP_LABELS[key]}
                </span>
                <div className="flex items-center gap-2">
                  <span>{Math.round(level * 100)}%</span>
                  <Switch
                    checked={locked}
                    onCheckedChange={(value) =>
                      handleGroupLockChange(key, value)
                    }
                  />
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={level}
                onChange={(event) =>
                  handleGroupLevelChange(key, Number(event.target.value))
                }
                className="mt-2 h-1.5 w-full accent-primary"
                aria-label={`${GROUP_LABELS[key]} level`}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Locks keep a group fixed when new plans are generated.
      </p>
    </div>
  );

  const timelineEditor = (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Timeline editor
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Edit windows, sections, and energy curve without JSON.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleAddWindow}>
          Add window
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
        <div className="text-[11px] text-slate-400">
          Bars {timelineRange.start}-{Math.max(timelineRange.start, timelineRange.end - 1)}
        </div>
        <div
          className="relative mt-2 h-14 overflow-hidden rounded-md border border-white/10"
          style={timelineGridStyle}
        >
          {(timelinePlan.global?.sections ?? []).map((section, index) => {
            const startBar = clampBarValue(section.startBar, timelineRange.start);
            const bars = clampBarValue(section.bars, 1);
            const left = clampPercent(
              ((startBar - timelineRange.start) / timelineTotalBars) * 100,
            );
            const width = clampPercent((bars / timelineTotalBars) * 100);
            return (
              <div
                key={`${section.name}-${index}`}
                className="absolute inset-y-0 rounded bg-emerald-500/10"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
          {timelinePlan.windows.map((window, index) => {
            const startBar = clampBarValue(window.startBar, timelineRange.start);
            const bars = clampBarValue(window.bars, 1);
            const left = clampPercent(
              ((startBar - timelineRange.start) / timelineTotalBars) * 100,
            );
            const width = clampPercent((bars / timelineTotalBars) * 100);
            return (
              <div
                key={`${startBar}-${bars}-${index}`}
                className="absolute top-6 h-6 rounded border border-sky-400/50 bg-sky-500/20 text-[10px] text-slate-100"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Window ${index + 1}`}
              >
                <span className="px-1">W{index + 1}</span>
              </div>
            );
          })}
          {(timelinePlan.global?.energyCurve ?? []).map((point, index) => {
            const bar = clampBarValue(point.bar, timelineRange.start);
            const left = clampPercent(
              ((bar - timelineRange.start) / timelineTotalBars) * 100,
            );
            return (
              <div
                key={`${bar}-${index}`}
                className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-amber-400"
                style={{ left: `${left}%` }}
                title={`Energy ${Math.round(clamp01(point.energy) * 100)}%`}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Windows
          </p>
        </div>
        {timelinePlan.windows.map((window, index) => {
          const startBar = clampBarValue(window.startBar, barWindowRange.start);
          const bars = clampBarValue(window.bars, 1);
          const texture = window.texture;
          const sampleValue =
            typeof texture?.sampleInfluence === "number"
              ? texture.sampleInfluence
              : sampleInfluence;
          const styleValue =
            typeof texture?.styleInfluence === "number"
              ? texture.styleInfluence
              : styleInfluence;
          const weirdnessValue =
            typeof texture?.weirdness === "number" ? texture.weirdness : weirdness;
          const kbValue =
            typeof texture?.kbTexture === "string" ? texture.kbTexture : "";
          return (
            <div
              key={`${startBar}-${bars}-${index}`}
              className="rounded-lg border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-semibold text-slate-100">Window {index + 1}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveWindow(index)}
                  disabled={timelinePlan.windows.length <= 1}
                >
                  Remove
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Start bar
                  <Input
                    type="number"
                    min={1}
                    value={startBar}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      updateWindow(index, (current) => ({
                        ...current,
                        startBar: clampBarValue(next, current.startBar),
                      }));
                    }}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Bars
                  <Input
                    type="number"
                    min={1}
                    value={bars}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      updateWindow(index, (current) => ({
                        ...current,
                        bars: clampBarValue(next, current.bars),
                      }));
                    }}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  KB texture
                  <select
                    value={kbValue}
                    onChange={(event) => updateWindowTextureId(index, event.target.value)}
                    className="mt-0.5 h-8 rounded border border-white/10 bg-slate-950/60 px-2 text-xs text-slate-100"
                    disabled={!kbTexturesReady && kbTextures.length === 0}
                  >
                    <option value="">Use cover texture</option>
                    {kbTextures.map((textureOption) => (
                      <option key={textureOption.id} value={textureOption.id}>
                        {textureOption.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-[11px] text-slate-400">
                  Sample influence
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={sampleValue}
                    onChange={(event) =>
                      updateWindowTextureValue(index, "sampleInfluence", Number(event.target.value))
                    }
                    className="mt-2 h-1.5 w-full accent-primary"
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  Style influence
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={styleValue}
                    onChange={(event) =>
                      updateWindowTextureValue(index, "styleInfluence", Number(event.target.value))
                    }
                    className="mt-2 h-1.5 w-full accent-primary"
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  Weirdness
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weirdnessValue}
                    onChange={(event) =>
                      updateWindowTextureValue(index, "weirdness", Number(event.target.value))
                    }
                    className="mt-2 h-1.5 w-full accent-primary"
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Audio atoms
                  <Input
                    value={formatIdList(window.material?.audioAtomIds)}
                    onChange={(event) =>
                      updateWindowMaterialList(index, "audioAtomIds", event.target.value)
                    }
                    placeholder="atom-1, atom-2"
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  MIDI motifs
                  <Input
                    value={formatIdList(window.material?.midiMotifIds)}
                    onChange={(event) =>
                      updateWindowMaterialList(index, "midiMotifIds", event.target.value)
                    }
                    placeholder="motif-1, motif-2"
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Groove templates
                  <Input
                    value={formatIdList(window.material?.grooveTemplateIds)}
                    onChange={(event) =>
                      updateWindowMaterialList(index, "grooveTemplateIds", event.target.value)
                    }
                    placeholder="groove-1, groove-2"
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Sections
          </p>
          <Button size="sm" variant="outline" onClick={handleAddSection}>
            Add section
          </Button>
        </div>
        {(timelinePlan.global?.sections ?? []).length ? (
          (timelinePlan.global?.sections ?? []).map((section, index) => (
            <div
              key={`${section.name}-${index}`}
              className="rounded-lg border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-semibold text-slate-100">Section {index + 1}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveSection(index)}>
                  Remove
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Name
                  <Input
                    value={section.name}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (!raw.trim()) return;
                      updateSection(index, (current) => ({
                        ...current,
                        name: raw,
                      }));
                    }}
                    placeholder={`Section ${index + 1}`}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Start bar
                  <Input
                    type="number"
                    min={1}
                    value={clampBarValue(section.startBar, barWindowRange.start)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      updateSection(index, (current) => ({
                        ...current,
                        startBar: clampBarValue(next, current.startBar),
                      }));
                    }}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Bars
                  <Input
                    type="number"
                    min={1}
                    value={clampBarValue(section.bars, 1)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      updateSection(index, (current) => ({
                        ...current,
                        bars: clampBarValue(next, current.bars),
                      }));
                    }}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
              </div>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-slate-500">No sections yet.</p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Energy curve
          </p>
          <Button size="sm" variant="outline" onClick={handleAddEnergyPoint}>
            Add point
          </Button>
        </div>
        {(timelinePlan.global?.energyCurve ?? []).length ? (
          (timelinePlan.global?.energyCurve ?? []).map((point, index) => (
            <div
              key={`${point.bar}-${index}`}
              className="rounded-lg border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-semibold text-slate-100">Point {index + 1}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveEnergyPoint(index)}>
                  Remove
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Bar
                  <Input
                    type="number"
                    min={1}
                    value={clampBarValue(point.bar, barWindowRange.start)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      updateEnergyPoint(index, (current) => ({
                        ...current,
                        bar: clampBarValue(next, current.bar),
                      }));
                    }}
                    className="h-8 bg-slate-950/60 text-xs"
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  Energy
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={clamp01(point.energy)}
                    onChange={(event) =>
                      updateEnergyPoint(index, (current) => ({
                        ...current,
                        energy: clamp01(Number(event.target.value)),
                      }))
                    }
                    className="mt-2 h-1.5 w-full accent-primary"
                  />
                </label>
              </div>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-slate-500">No energy points yet.</p>
        )}
      </div>
    </div>
  );

  const showCoverControls = !isListener || coverControlsEnabled;
  const emptyTitle = isListener
    ? "Select a song to start listening"
    : "Drop an original to start a Helix cover";
  const emptyDescription = isListener
    ? "Choose a song from the list to load the player on the right."
    : "Select a song in Listener (or drag one here) to start a Helix cover.";

  return (
    <div className="rounded-3xl border border-border bg-background/60 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/70 p-6 text-center",
            isOver ? "border-primary bg-primary/5" : undefined,
            selectedOriginal ? "ring-2 ring-primary/60" : undefined,
          )}
        >
          {selectedOriginal ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold text-slate-100">{selectedOriginal.title}</h3>
                <Button variant="ghost" size="icon" onClick={onClearSelection} aria-label="Clear selection">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedOriginal.artist}
                {formattedDuration ? `  •  ${formattedDuration}` : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {selectedOriginal.listens.toLocaleString()} listens
                </Badge>
                {sessionTempo ? (
                  <Badge variant="outline" className="border-sky-400/40 text-sky-200">
                    {`${Math.round(sessionTempo.bpm)} BPM · ${sessionTempo.timeSig ?? "4/4"}`}
                  </Badge>
                ) : null}
                {includeHelixPacket ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-emerald-400/40 text-emerald-300",
                      !helixPacket && "border-amber-400/40 text-amber-300",
                    )}
                  >
                    {helixPacket ? "Helix packet linked" : "Helix packet missing"}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <Sparkles className="mx-auto h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{emptyTitle}</h3>
              <p className="text-xs text-muted-foreground">{emptyDescription}</p>
            </div>
          )}
          {!isListener && coverFlowAttachmentCount ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {coverFlowAttachmentCount} knowledge stem{coverFlowAttachmentCount === 1 ? "" : "s"}
              </Badge>
              {coverFlowPayload?.trackName ? (
                <span className="text-slate-300">
                  From {coverFlowPayload.trackName}
                  {coverFlowPayload?.albumName ? ` · ${coverFlowPayload.albumName}` : ""}
                </span>
              ) : null}
              {coverFlowPayload?.kbTexture ? (
                <Badge variant="outline" className="border-sky-400/40 text-sky-200">
                  Texture {coverFlowPayload.kbTexture}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-4 lg:max-w-sm">
          {showCoverControls ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  inputMode="numeric"
                  pattern="\d*"
                  placeholder="Seed (optional)"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ""))}
                  className="max-w-[140px]"
                  aria-label="Generation seed"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    if (!selectedOriginal) return;
                    const preset = moodPresets[0];
                    if (preset) {
                      void handleQueueGeneration(preset);
                    }
                  }}
                  disabled={!selectedOriginal || isRequesting || isCoverJobPending}
                >
                  <Sparkles className="h-4 w-4" />
                  Quick render
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {moodPresets.length ? (
                  moodPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!selectedOriginal || isRequesting || isCoverJobPending}
                      onClick={() => void handleQueueGeneration(preset)}
                    >
                      {preset.label}
                      <Badge variant="secondary" className="ml-2 text-[10px] uppercase tracking-wider">
                        {preset.description ?? "Helix"}
                      </Badge>
                    </Button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mood presets are loading. Once ready, choose one to generate a Helix cover.
                  </p>
                )}
              </div>
            </>
          ) : null}

          {!isListener ? (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Listener mode
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Macro controls with A/B, undo, and reset.
                  </p>
                </div>
                {listenerModeButtons}
              </div>
              <div className="mt-3">{macroControls}</div>
              {macroActions}
            </div>
          ) : null}

          {showRemixTools ? (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Structure window
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span>Start</span>
                    <Input
                      type="number"
                      min={1}
                      value={startBar}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isNaN(next)) return;
                        const safe = Math.max(1, Math.min(endBar - 1, Math.round(next)));
                        setStartBar(safe);
                      }}
                      className="h-9 w-20"
                    />
                    <span>End</span>
                    <Input
                      type="number"
                      min={startBar + 1}
                      value={endBar}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isNaN(next)) return;
                        const safe = Math.max(startBar + 1, Math.round(next));
                        setEndBar(safe);
                      }}
                      className="h-9 w-20"
                    />
                    <span className="text-xs text-muted-foreground">(exclusive)</span>
                  </div>
                </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Texture
                </div>
                <select
                  value={kbTexture}
                  onChange={(event) => setKbTexture(event.target.value as KBTextureOption)}
                  className="mt-2 h-9 w-full rounded border border-border bg-background px-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={!kbTexturesReady && kbTextures.length === 0}
                >
                  <option value="auto">
                    {autoMatch
                      ? `Auto-match: ${autoMatch.kb.name} (${Math.round(autoMatch.confidence * 100)}%)`
                      : kbTexturesReady
                        ? "Auto-match"
                        : "Loading textures..."}
                  </option>
                  {kbTextures.map((texture) => (
                    <option key={texture.id} value={texture.id}>
                      {texture.name}
                    </option>
                  ))}
                </select>
                {kbTexture === "auto" && autoMatch ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Confidence {Math.round(autoMatch.confidence * 100)}% · {autoMatch.kb.id}
                  </p>
                ) : null}
                {kbTexture !== "auto" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Using {resolveTextureById(kbTextures, kbTexture)?.name ?? kbTexture}
                  </p>
                ) : null}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Sample influence</span>
                    <span>{Math.round(clamp01(sampleInfluence) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={sampleInfluence}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isNaN(value)) return;
                      setSampleInfluence(clamp01(value));
                    }}
                    className="mt-1 h-1.5 w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Style influence</span>
                    <span>{Math.round(clamp01(styleInfluence) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={styleInfluence}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isNaN(value)) return;
                      setStyleInfluence(clamp01(value));
                    }}
                    className="mt-1 h-1.5 w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Weirdness</span>
                    <span>
                      {Math.round(
                        clamp01(
                          weirdnessLocked && typeof helixPacket?.weirdness === "number"
                            ? helixPacket.weirdness
                            : weirdness,
                        ) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weirdness}
                    onChange={(event) => {
                      if (weirdnessLocked) return;
                      const value = Number(event.target.value);
                      if (Number.isNaN(value)) return;
                      setWeirdness(clamp01(value));
                    }}
                    disabled={weirdnessLocked}
                    className="mt-1 h-1.5 w-full accent-primary disabled:opacity-60"
                  />
                  {weirdnessLocked ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Locked to Helix packet ({Math.round(clamp01(helixPacket?.weirdness ?? 0) * 100)}%).
                    </p>
                  ) : null}
                </div>
              </div>
              </div>
            </div>
          ) : null}

          {showRemixLayer ? (
            <div className="space-y-4">
              {groupPanel}
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ingredients
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Pick atoms from your knowledge library to anchor the remix.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIngredientIds.length ? (
                      <Button size="sm" variant="ghost" onClick={handleClearIngredients}>
                        Clear
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setIngredientsOpen((current) => !current);
                      }}
                    >
                      {ingredientsOpen ? "Hide" : "Edit"}
                    </Button>
                  </div>
                </div>
                {selectedIngredientIds.length ? (
                  selectedIngredientNames.length === selectedIngredientIds.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedIngredientNames.map((name, index) => (
                        <Badge
                          key={`${name}-${index}`}
                          variant="secondary"
                          className="bg-slate-800/80 text-slate-200"
                        >
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      {selectedIngredientIds.length} ingredients selected.
                    </p>
                  )
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    No ingredients pinned yet.
                  </p>
                )}
                {ingredientsOpen ? (
                  <div className="mt-3 space-y-2">
                    {ingredientLoading ? (
                      <p className="text-[11px] text-muted-foreground">
                        Loading ingredients...
                      </p>
                    ) : null}
                    {ingredientError ? (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                        {ingredientError}
                      </div>
                    ) : null}
                    {ingredientFiles.length ? (
                      <div className="max-h-48 space-y-2 overflow-auto pr-2">
                        {ingredientFiles.map((file) => {
                          const checked = selectedIngredientIds.includes(file.id);
                          return (
                            <label
                              key={file.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-200"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleIngredient(file.id)}
                                />
                                <span className="text-slate-100">{file.name}</span>
                              </span>
                              {file.tags?.length ? (
                                <span className="text-[10px] text-slate-400">
                                  {file.tags.slice(0, 2).join(", ")}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Structure
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Shape the bar window and auto-pick a plan.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void runPlanRanking()}
                    disabled={planRanking || !selectedOriginal}
                  >
                    {planRanking ? "Picking..." : "Auto-pick"}
                  </Button>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Window {barWindowRange.start}-
                  {Math.max(barWindowRange.start, barWindowRange.end - 1)} (end exclusive).
                </p>
                {renderPlanSummary ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Sections {renderPlanSummary.sectionCount}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Energy points {renderPlanSummary.energyPoints}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Windows {renderPlanSummary.windowCount}
                    </Badge>
                  </div>
                ) : null}
                {renderPlan?.global?.sections?.length ? (
                  <div className="mt-3 space-y-2">
                    {renderPlan.global.sections.map((section, index) => (
                      <div
                        key={`${section.name}-${index}`}
                        className="flex items-center justify-between text-[11px] text-slate-300"
                      >
                        <span className="font-medium text-slate-100">{section.name}</span>
                        <span>
                          Bar {section.startBar} +{section.bars}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    No section map yet. Auto-pick will generate one.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-muted-foreground">Candidates</label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={planRankCount}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      setPlanRankCount(Math.max(1, Math.min(6, Math.round(next))));
                    }}
                    className="h-8 w-20 bg-slate-950/60 text-xs"
                  />
                  {planRankStatus ? (
                    <span className="text-[11px] text-muted-foreground">
                      {planRankStatus}
                    </span>
                  ) : null}
                </div>
                {planRankError ? (
                  <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    {planRankError}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {showPlanEditor ? (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    RenderPlan
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Inspect or edit per-window plans before rendering.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-white/20 text-slate-200",
                      renderPlanEnabled ? "border-emerald-400/50 text-emerald-200" : "",
                    )}
                  >
                    {renderPlanEnabled
                      ? "Plan enabled"
                      : renderPlan
                        ? "Plan loaded"
                        : "No plan"}
                  </Badge>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={renderPlanEnabled}
                      onChange={(event) => setRenderPlanEnabled(event.target.checked)}
                      disabled={!renderPlan}
                    />
                    Use plan
                  </label>
                  {canEditPlan ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenderPlanOpen((current) => !current)}
                    >
                      {renderPlanOpen ? "Hide" : "Edit"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {renderPlanSummary ? (
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Windows {renderPlanSummary.windowCount}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Texture {renderPlanSummary.textureCount}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      Material {renderPlanSummary.materialCount}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      EQ {renderPlanSummary.eqCount}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                      FX {renderPlanSummary.fxCount}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Render bars {barWindowRange.start}-{Math.max(barWindowRange.start, barWindowRange.end - 1)} (end exclusive)
                    {renderPlanSummary.minStart != null && renderPlanSummary.maxEnd != null
                      ? ` · Plan bars ${renderPlanSummary.minStart}-${Math.max(
                          renderPlanSummary.minStart,
                          renderPlanSummary.maxEnd - 1,
                        )}`
                      : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Global: bpm {renderPlanSummary.bpm ?? "--"} · sections {renderPlanSummary.sectionCount} · energy points {renderPlanSummary.energyPoints}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Paste a RenderPlan JSON to preview per-window routing.
                </p>
              )}
              {renderPlanError ? (
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  {renderPlanError}
                </div>
              ) : null}
              {renderPlanOpen && canEditPlan ? (
                <div className="mt-3 space-y-3">
                  {timelineEditor}
                  <textarea
                    className="min-h-[160px] w-full rounded-md border border-white/10 bg-black/40 p-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    placeholder='{"windows":[{"startBar":1,"bars":4,"texture":{"sampleInfluence":0.7}}]}'
                    value={renderPlanDraft}
                    onChange={(event) => setRenderPlanDraft(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={applyRenderPlanDraft}>
                      Apply plan
                    </Button>
                    <Button size="sm" variant="outline" onClick={formatRenderPlanDraft}>
                      Format JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void autoFillPlanAtoms()}
                      disabled={atomAutoFillRunning}
                    >
                      {atomAutoFillRunning ? "Filling atoms..." : "Auto-fill atoms"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearRenderPlanDraft}>
                      Clear
                    </Button>
                  </div>
                  {atomAutoFillStatus ? (
                    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-slate-200">
                      {atomAutoFillStatus}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Plan ranking
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Generate candidates from /api/ai/plan, score with immersion, apply the best.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void runPlanRanking()}
                    disabled={planRanking}
                  >
                    {planRanking ? "Ranking..." : "Generate + Rank"}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-slate-400">Candidates</label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={planRankCount}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) return;
                      setPlanRankCount(Math.max(1, Math.min(6, Math.round(next))));
                    }}
                    className="h-8 w-20 bg-slate-950/60 text-xs"
                  />
                  {planRankStatus ? (
                    <span className="text-[11px] text-slate-500">{planRankStatus}</span>
                  ) : null}
                </div>
                {planRankError ? (
                  <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    {planRankError}
                  </div>
                ) : null}
                {planRankCandidates.length ? (
                  <div className="mt-3 space-y-2">
                    {planRankCandidates.map((candidate) => {
                      const scoreLabel =
                        typeof candidate.score === "number"
                          ? `${Math.round(candidate.score * 100)}%`
                          : candidate.status === "scored"
                            ? "--"
                            : "";
                      return (
                        <div
                          key={candidate.id}
                          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-400">
                              Seed {candidate.seed}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
                                {candidate.status}
                              </Badge>
                              {candidate.status === "scored" ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-500/10 text-emerald-200"
                                >
                                  {scoreLabel || "scored"}
                                </Badge>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!candidate.plan}
                                onClick={() => applyPlanCandidate(candidate)}
                              >
                                Use
                              </Button>
                            </div>
                          </div>
                          {candidate.status === "scored" ? (
                            <div className="mt-1 text-[11px] text-slate-400">
                              IDI {Math.round((candidate.idi ?? 0) * 100)}% / conf{" "}
                              {Math.round((candidate.confidence ?? 0) * 100)}%
                              {typeof candidate.repetitionPenalty === "number"
                                ? ` / repeat ${Math.round(
                                    candidate.repetitionPenalty * 100,
                                  )}%`
                                : ""}
                            </div>
                          ) : null}
                          {candidate.status === "error" ? (
                            <div className="mt-1 text-[11px] text-amber-200">
                              {candidate.error}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-slate-500">
                    No candidates yet. Generate a few to rank.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {showRecipeTools ? (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recipes
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Save and recall RenderPlan + assets + seed.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadRecipes(recipeSearch)}
                  disabled={recipesLoading}
                >
                  {recipesLoading ? "Loading..." : "Refresh"}
                </Button>
              </div>

            <div className="mt-3 space-y-2">
              <Input
                placeholder="Recipe name"
                value={recipeName}
                onChange={(event) => setRecipeName(event.target.value)}
                className="h-9 bg-slate-950/50 text-sm"
              />
              <textarea
                className="min-h-[72px] w-full rounded-md border border-white/10 bg-black/40 p-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                placeholder="Notes (optional)"
                value={recipeNotes}
                onChange={(event) => setRecipeNotes(event.target.value)}        
              />
              {recipeParent ? (
                <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-200">
                  <div>
                    <div className="font-semibold">Forking from edition</div>
                    <div className="text-[10px] text-slate-400">
                      {recipeParent.name}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRecipeParentId(null)}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-200">
                <div>
                  <div className="font-semibold">Feature this edition</div>
                  <div className="text-[10px] text-slate-400">
                    Featured editions appear first for listeners.
                  </div>
                </div>
                <Switch
                  checked={recipeFeatured}
                  onCheckedChange={setRecipeFeatured}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSaveRecipe()}
                  disabled={recipeSaving || !recipeName.trim()}
                >
                  {recipeSaving ? "Saving..." : "Save recipe"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRecipeName("");
                    setRecipeNotes("");
                    setRecipeFeatured(false);
                    setRecipeParentId(null);
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search recipes"
                value={recipeSearch}
                onChange={(event) => setRecipeSearch(event.target.value)}
                className="h-8 bg-slate-950/60 text-xs"
              />
              {recipeStatus ? (
                <span className="text-[11px] text-slate-500">{recipeStatus}</span>
              ) : null}
            </div>
            {recipeError ? (
              <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {recipeError}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {recipesLoading ? (
                <p className="text-[11px] text-muted-foreground">Loading recipes...</p>
              ) : sortedRecipes.length ? (
                sortedRecipes.map((recipe) => {
                  const isMatch = selectedOriginal?.id === recipe.originalId;
                  const receiptChips = buildReceiptChips(recipe.receipt);
                  const violationPreview = formatViolationPreview(
                    recipe.receipt?.contract?.violations,
                  );
                  return (
                    <div
                      key={recipe.id}
                      className="rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-200">
                            {recipe.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {recipe.originalId} · {formatTimestamp(recipe.updatedAt)}
                          </div>
                          {recipe.featured ? (
                            <div className="mt-1">
                              <Badge
                                variant="secondary"
                                className="bg-amber-500/20 text-amber-100"
                              >
                                Featured
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!isMatch ? (
                            <Badge variant="outline" className="border-amber-400/40 text-amber-200">
                              Select original
                            </Badge>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isMatch}
                            onClick={() => handleApplyRecipe(recipe)}
                          >
                            Load
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!isMatch}
                            onClick={() => handleForkRecipe(recipe)}
                          >
                            Fork
                          </Button>
                          <Button
                            size="sm"
                            variant={recipe.featured ? "secondary" : "ghost"}
                            disabled={!isMatch || recipeBusyId === recipe.id}
                            onClick={() => void handleToggleFeatured(recipe)}
                          >
                            {recipe.featured ? "Unfeature" : "Feature"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={recipeBusyId === recipe.id}
                            onClick={() => void handleDeleteRecipe(recipe)}
                          >
                            {recipeBusyId === recipe.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                      {recipe.notes ? (
                        <div className="mt-2 text-[11px] text-slate-500">
                          {recipe.notes}
                        </div>
                      ) : null}
                      {recipe.receipt ? (
                        <div className="mt-2 rounded-md border border-slate-800/70 bg-slate-950/60 px-2 py-2 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                            <span>Receipt</span>
                            <span>{formatTimestamp(recipe.receipt.createdAt)}</span>
                          </div>
                          {receiptChips.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {receiptChips.map((chip) => (
                                <Badge
                                  key={`${recipe.id}-${chip}`}
                                  variant="secondary"
                                  className="bg-slate-800/80 text-slate-200"
                                >
                                  {chip}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] text-slate-500">
                              Receipt recorded.
                            </div>
                          )}
                          {violationPreview ? (
                            <div className="mt-1 text-[11px] text-amber-200">
                              Violations: {violationPreview}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-[11px] text-slate-500">No recipes saved yet.</p>
              )}
            </div>
            {recipesByOriginal.length ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Edition lineage
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {recipesByOriginal.length} edition
                    {recipesByOriginal.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {editionTree.length ? (
                    editionTree.map((node) => renderEditionNode(node, 0))
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      No lineage captured yet.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          ) : null}

          {showCoverControls || job ? (
            job ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <div className="text-sm font-semibold text-primary">
                  Generation {job.status === "error" ? "failed" : "status"}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {statusDisplay.map((item) => (
                    <div
                      key={item.status}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-wide",
                        item.error
                          ? "border-destructive text-destructive"
                          : item.active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
                      {item.status}
                    </div>
                  ))}
                </div>
                {jobMessage ? (
                  <div className="mt-3 text-xs text-muted-foreground">{jobMessage}</div>
                ) : null}
                {immersionCard}
                {renderProgress ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{renderProgress.stage}</span>
                      <span>{Math.round(clamp01(renderProgress.pct) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${Math.round(clamp01(renderProgress.pct) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {localPreviewUrl ? (
                  <div className="mt-3 text-xs">
                    <a
                      href={localPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Open preview
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                Pick a mood to send the song to the Helix render queue. Jobs update automatically.
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CoverCreator;
