import type {
  CoverEvidence,
  CoverJob,
  ImmersionScores,
  KnowledgeAudioSource,
  KnowledgeGrooveSource,
  KnowledgeMacroSource,
  KnowledgeMidiSource,
  MidiMotif,
  BarWindow,
  RenderPlan,
  TempoMeta,
  CoverJobRequest,
  OriginalStem,
} from "@/types/noise-gens";
import { listKnowledgeFiles } from "@/lib/agi/knowledge-store";
import { isAudioKnowledgeFile } from "@/lib/knowledge/audio";
import { normalizeMidiMotifPayload } from "@/lib/noise/midi-motif";
import { parseMidiFile } from "@/lib/noise/midi-file";
import {
  normalizeGrooveTemplatePayload,
  normalizeMacroCurvePayload,
} from "@/lib/noise/symbolic-templates";
import { apiRequest } from "@/lib/queryClient";
import { fetchOriginalStems } from "@/lib/api/noiseGens";

const WORKER_URL = new URL("../../workers/cover-worker.ts", import.meta.url);
const TEMPO_STORAGE_KEY = "noisegen:tempo";

type CoverWorkerProgress = { t: "progress"; pct: number; stage: string };
type CoverWorkerReady = { t: "ready"; wavBlob: Blob; duration: number; immersion: ImmersionScores };
type CoverWorkerError = { t: "error"; error: string };

type CoverWorkerEvent = CoverWorkerProgress | CoverWorkerReady | CoverWorkerError;

type UploadPreviewFn = (blob: Blob) => Promise<string>;

type InstrumentalStemSource = { url: string; name?: string };
type ResolvedOriginalAudio = {
  instrumentalUrl?: string;
  vocalUrl?: string;
  instrumentalStems?: InstrumentalStemSource[];
};

export interface FulfillOptions {
  onProgress?: (pct: number, stage: string) => void;
  uploadPreview?: UploadPreviewFn;
  signal?: AbortSignal;
}

export interface FulfillResult {
  previewUrl: string;
  blob: Blob;
  duration: number;
  evidence: CoverEvidence;
}

export type RenderPlanScore = {
  idi: number;
  idiConfidence: number;
  immersion: ImmersionScores;
  duration: number;
};

const SCORE_CACHE_LIMIT = 24;
const scoreCache = new Map<string, RenderPlanScore>();
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

const normalizeIdList = (list?: string[]) => {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(list.map((entry) => (typeof entry === "string" ? entry.trim() : ""))),
  )
    .filter(Boolean)
    .sort();
};

const buildScoreCacheKey = (
  request: CoverJobRequest,
  renderPlan: RenderPlan,
  barWindows: BarWindow[],
) =>
  JSON.stringify({
    originalId: request.originalId,
    tempo: request.tempo ?? null,
    barWindows,
    kbTexture: request.kbTexture ?? null,
    sampleInfluence: request.sampleInfluence ?? 0.7,
    styleInfluence: request.styleInfluence ?? 0.3,
    weirdness: request.weirdness ?? 0.2,
    knowledgeFileIds: normalizeIdList(request.knowledgeFileIds),
    renderPlan,
  });

const shouldExcludeStemName = (value?: string) => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return STEM_EXCLUDE_TOKENS.some((token) => normalized.includes(token));
};

const selectInstrumentalStems = (
  stems: OriginalStem[],
): InstrumentalStemSource[] => {
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
  const selected = filtered.length ? filtered : stems;
  return selected.map((stem) => ({ url: stem.url, name: stem.name }));
};

export function canFulfillLocally(): boolean {
  if (typeof window === "undefined") return false;
  return typeof Worker !== "undefined" && typeof (window as Window & typeof globalThis).OfflineAudioContext !== "undefined";
}

export async function fulfillCoverJob(job: CoverJob, options: FulfillOptions = {}): Promise<FulfillResult> {
  if (!canFulfillLocally()) {
    throw new Error("Offline rendering is not supported in this browser");
  }

  const worker = new Worker(WORKER_URL, { type: "module", name: `cover-job:${job.id}` });
  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    worker.onerror = null;
    worker.onmessage = null;
    worker.terminate();
  };

  const tempo = resolveTempo(job);
  const original = await resolveOriginalAudio(job.request.originalId);
  const materialIds = collectMaterialIds(job.request.renderPlan);
  const baseKnowledgeIds = mergeKnowledgeIds(
    job.request.knowledgeFileIds,
    materialIds,
  );
  const needsStemAudio = materialIds.some(
    (id) => typeof id === "string" && id.trim().toLowerCase().startsWith("stem:"),
  );
  const [midiMotifs, grooveTemplates, macroCurves] = await Promise.all([
    resolveKnowledgeMotifs(baseKnowledgeIds),
    resolveKnowledgeGrooves(baseKnowledgeIds),
    resolveKnowledgeMacros(baseKnowledgeIds),
  ]);
  const samplerSourceIds = collectSamplerSourceIds(midiMotifs);
  const audioKnowledgeIds = mergeKnowledgeIds(
    baseKnowledgeIds,
    samplerSourceIds,
  );
  const [knowledgeAudio, serverStems] = await Promise.all([
    resolveKnowledgeAudio(audioKnowledgeIds),
    needsStemAudio ? resolveServerStemAudio(job.request.originalId) : [],
  ]);
  const mergedKnowledgeAudio = [
    ...knowledgeAudio.sources,
    ...serverStems,
  ];
  const payload = {
    t: "render" as const,
    jobId: job.id,
    original,
    tempo,
    barWindows: job.request.barWindows,
    helix: job.request.helix,
    kbTexture: job.request.kbTexture ?? null,
    sampleInfluence: job.request.sampleInfluence ?? 0.7,
    styleInfluence: job.request.styleInfluence ?? 0.3,
    weirdness: job.request.weirdness ?? 0.2,
    renderPlan: job.request.renderPlan,
    knowledgeAudio: mergedKnowledgeAudio,
    midiMotifs,
    grooveTemplates,
    macroCurves,
  };

  const ready = new Promise<FulfillResult>((resolve, reject) => {
    worker.onerror = (event) => {
      cleanup();
      reject(event instanceof ErrorEvent ? event.error ?? new Error(event.message) : new Error("cover worker error"));
    };

    worker.onmessage = (event: MessageEvent<CoverWorkerEvent>) => {
      const message = event.data;
      if (!message) return;
      if (message.t === "progress") {
        options.onProgress?.(message.pct, message.stage);
        return;
      }
      if (message.t === "error") {
        cleanup();
        reject(new Error(message.error || "cover render failed"));
        return;
      }
      if (message.t === "ready") {
        cleanup();
        resolve(handleReady(message, job, options.uploadPreview));
      }
    };
  });

  const abortListener = () => {
    worker.postMessage({ t: "abort", jobId: job.id });
    cleanup();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortListener();
      throw new DOMException("Render aborted", "AbortError");
    }
    options.signal.addEventListener("abort", abortListener, { once: true });
  }

  worker.postMessage(payload);

  try {
    const result = await ready;
    await apiRequest(
      "PUT",
      `/api/noise-gens/jobs/${encodeURIComponent(job.id)}/ready`,
      { previewUrl: result.previewUrl, evidence: result.evidence },
    );
    return result;
  } finally {
    knowledgeAudio.revoke();
    options.signal?.removeEventListener?.("abort", abortListener);
    cleanup();
  }
}

export async function scoreRenderPlan(
  request: CoverJobRequest,
  renderPlan: RenderPlan,
  options: FulfillOptions & { barWindows?: BarWindow[] } = {},
): Promise<RenderPlanScore> {
  if (!canFulfillLocally()) {
    throw new Error("Offline rendering is not supported in this browser");
  }

  const renderWindows = options.barWindows ?? request.barWindows;
  const cacheKey = buildScoreCacheKey(request, renderPlan, renderWindows);
  const cached = scoreCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const worker = new Worker(WORKER_URL, { type: "module", name: `cover-score:${request.originalId}` });
  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    worker.onerror = null;
    worker.onmessage = null;
    worker.terminate();
  };

  const tempo = resolveTempoFromRequest(request);
  const original = await resolveOriginalAudio(request.originalId);
  const materialIds = collectMaterialIds(renderPlan);
  const baseKnowledgeIds = mergeKnowledgeIds(
    request.knowledgeFileIds,
    materialIds,
  );
  const needsStemAudio = materialIds.some(
    (id) => typeof id === "string" && id.trim().toLowerCase().startsWith("stem:"),
  );
  const [midiMotifs, grooveTemplates, macroCurves] = await Promise.all([
    resolveKnowledgeMotifs(baseKnowledgeIds),
    resolveKnowledgeGrooves(baseKnowledgeIds),
    resolveKnowledgeMacros(baseKnowledgeIds),
  ]);
  const samplerSourceIds = collectSamplerSourceIds(midiMotifs);
  const audioKnowledgeIds = mergeKnowledgeIds(
    baseKnowledgeIds,
    samplerSourceIds,
  );
  const [knowledgeAudio, serverStems] = await Promise.all([
    resolveKnowledgeAudio(audioKnowledgeIds),
    needsStemAudio ? resolveServerStemAudio(request.originalId) : [],
  ]);
  const mergedKnowledgeAudio = [
    ...knowledgeAudio.sources,
    ...serverStems,
  ];
  const jobId = `plan-score:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  const payload = {
    t: "render" as const,
    jobId,
    original,
    tempo,
    barWindows: renderWindows,
    helix: request.helix,
    kbTexture: request.kbTexture ?? null,
    sampleInfluence: request.sampleInfluence ?? 0.7,
    styleInfluence: request.styleInfluence ?? 0.3,
    weirdness: request.weirdness ?? 0.2,
    renderPlan,
    knowledgeAudio: mergedKnowledgeAudio,
    midiMotifs,
    grooveTemplates,
    macroCurves,
  };

  const ready = new Promise<RenderPlanScore>((resolve, reject) => {
    worker.onerror = (event) => {
      cleanup();
      reject(event instanceof ErrorEvent ? event.error ?? new Error(event.message) : new Error("cover worker error"));
    };

    worker.onmessage = (event: MessageEvent<CoverWorkerEvent>) => {
      const message = event.data;
      if (!message) return;
      if (message.t === "progress") {
        options.onProgress?.(message.pct, message.stage);
        return;
      }
      if (message.t === "error") {
        cleanup();
        reject(new Error(message.error || "cover render failed"));
        return;
      }
      if (message.t === "ready") {
        cleanup();
        resolve({
          idi: message.immersion.idi,
          idiConfidence: message.immersion.confidence,
          immersion: message.immersion,
          duration: message.duration,
        });
      }
    };
  });

  const abortListener = () => {
    worker.postMessage({ t: "abort", jobId });
    cleanup();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortListener();
      throw new DOMException("Render aborted", "AbortError");
    }
    options.signal.addEventListener("abort", abortListener, { once: true });
  }

  worker.postMessage(payload);

  try {
    const result = await ready;
    scoreCache.set(cacheKey, result);
    if (scoreCache.size > SCORE_CACHE_LIMIT) {
      const oldestKey = scoreCache.keys().next().value;
      if (oldestKey) {
        scoreCache.delete(oldestKey);
      }
    }
    return result;
  } finally {
    knowledgeAudio.revoke();
    options.signal?.removeEventListener?.("abort", abortListener);
    cleanup();
  }
}

async function handleReady(message: CoverWorkerReady, _job: CoverJob, uploadPreview?: UploadPreviewFn): Promise<FulfillResult> {
  const blob = message.wavBlob;
  const duration = message.duration;
  const previewUrl = uploadPreview ? await uploadPreview(blob) : URL.createObjectURL(blob);
  const evidence: CoverEvidence = {
    idi: message.immersion.idi,
    idiConfidence: message.immersion.confidence,
    immersion: message.immersion,
  };
  return { previewUrl, blob, duration, evidence };
}

async function pickFirstAvailable(
  candidates: string[],
): Promise<string | null> {
  for (const url of candidates) {
    if (await resourceExists(url)) {
      return url;
    }
  }
  return null;
}

async function resolveOriginalAudio(
  originalId: string,
): Promise<ResolvedOriginalAudio> {
  const slug = encodeURIComponent(originalId.toLowerCase());
  const instrumentalUrl = await pickFirstAvailable([
    `/api/noise-gens/originals/${slug}/instrumental`,
    `/originals/${slug}/instrumental.wav`,
    `/audio/originals/${slug}/instrumental.wav`,
  ]);
  if (instrumentalUrl) {
    const vocalUrl =
      (await pickFirstAvailable([
        `/api/noise-gens/originals/${slug}/vocal`,
        `/originals/${slug}/vocal.wav`,
        `/audio/originals/${slug}/vocal.wav`,
      ])) ?? undefined;
    return { instrumentalUrl, vocalUrl };
  }
  try {
    const stems = await fetchOriginalStems(originalId);
    const instrumentalStems = selectInstrumentalStems(stems);
    if (instrumentalStems.length > 0) {
      const vocalUrl =
        (await pickFirstAvailable([
          `/api/noise-gens/originals/${slug}/vocal`,
          `/originals/${slug}/vocal.wav`,
          `/audio/originals/${slug}/vocal.wav`,
        ])) ?? undefined;
      return { instrumentalStems, vocalUrl };
    }
  } catch {
    // fall through to default
  }
  return {
    instrumentalUrl:
      (await pickFirstAvailable([
        "/api/noise-gens/originals/default/instrumental",
        "/originals/default/instrumental.wav",
        "/audio/originals/default/instrumental.wav",
      ])) ?? "/originals/default/instrumental.wav",
    vocalUrl:
      (await pickFirstAvailable([
        "/api/noise-gens/originals/default/vocal",
        "/originals/default/vocal.wav",
        "/audio/originals/default/vocal.wav",
      ])) ?? undefined,
  };
}

type KnowledgeAudioLookup = {
  sources: KnowledgeAudioSource[];
  revoke: () => void;
};

const revokeObjectUrls = (urls: string[]) => {
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore revoke failures
    }
  }
};

async function resolveKnowledgeAudio(
  knowledgeFileIds?: string[],
): Promise<KnowledgeAudioLookup> {
  if (!Array.isArray(knowledgeFileIds) || knowledgeFileIds.length === 0) {
    return { sources: [], revoke: () => {} };
  }
  if (typeof window === "undefined" || typeof URL === "undefined") {
    return { sources: [], revoke: () => {} };
  }
  try {
    const files = await listKnowledgeFiles();
    const audioFiles = files
      .filter(isAudioKnowledgeFile)
      .filter((record) => !isMidiCandidate(record));
    const byId = new Map(audioFiles.map((record) => [record.id, record]));
    const sources: KnowledgeAudioSource[] = [];
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const rawId of knowledgeFileIds) {
      const id = typeof rawId === "string" ? rawId.trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const record = byId.get(id);
      if (!record) continue;
      const url = URL.createObjectURL(record.data);
      urls.push(url);
      sources.push({
        id: record.id,
        name: record.name,
        mime: record.mime,
        url,
        projectId: record.projectId,
      });
    }
    return { sources, revoke: () => revokeObjectUrls(urls) };
  } catch {
    return { sources: [], revoke: () => {} };
  }
}

const stemAudioCache = new Map<string, Promise<KnowledgeAudioSource[]>>();

async function resolveServerStemAudio(
  originalId: string,
): Promise<KnowledgeAudioSource[]> {
  const key = typeof originalId === "string" ? originalId.trim() : "";
  if (!key) return [];
  let cached = stemAudioCache.get(key);
  if (!cached) {
    cached = fetchOriginalStems(key)
      .then((stems) =>
        stems.map((stem) => ({
          id: `stem:${stem.id}`,
          name: `stem:${stem.id}`,
          mime: stem.mime,
          url: stem.url,
          projectId: `original:${key}`,
        })),
      )
      .catch(() => []);
    stemAudioCache.set(key, cached);
  }
  return cached;
}

const normalizeMotifKey = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isJsonCandidate = (record: { mime?: string; name?: string; kind?: string }) => {
  if (record.kind === "json") return true;
  if (record.mime?.includes("json")) return true;
  if (record.mime?.startsWith("text/")) return true;
  if (record.name?.toLowerCase().endsWith(".json")) return true;
  return false;
};

const isMidiCandidate = (record: { mime?: string; name?: string }) => {
  const name = record.name?.toLowerCase() ?? "";
  if (record.mime?.includes("midi")) return true;
  if (name.endsWith(".mid") || name.endsWith(".midi")) return true;
  return false;
};

const isMotifCandidate = (record: { mime?: string; name?: string; kind?: string }) =>
  isJsonCandidate(record) || isMidiCandidate(record);

const isSymbolicCandidate = isJsonCandidate;

async function resolveKnowledgeMotifs(
  knowledgeFileIds?: string[],
): Promise<KnowledgeMidiSource[]> {
  if (!Array.isArray(knowledgeFileIds) || knowledgeFileIds.length === 0) {
    return [];
  }
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const files = await listKnowledgeFiles();
    const byKey = new Map<string, (typeof files)[number]>();
    for (const record of files) {
      const idKey = normalizeMotifKey(record.id);
      if (idKey) byKey.set(idKey, record);
      const nameKey = normalizeMotifKey(record.name);
      if (nameKey) byKey.set(nameKey, record);
    }
    const motifs: KnowledgeMidiSource[] = [];
    const processed = new Set<string>();
    for (const rawId of knowledgeFileIds) {
      const key = normalizeMotifKey(rawId);
      if (!key) continue;
      const record = byKey.get(key);
      if (!record || processed.has(record.id)) continue;
      processed.add(record.id);
      if (!isMotifCandidate(record)) continue;
      let motif: MidiMotif | null = null;
      try {
        if (isMidiCandidate(record)) {
          const buffer = await record.data.arrayBuffer();
          motif = parseMidiFile(buffer, record.name);
        } else if (isJsonCandidate(record)) {
          const text = await record.data.text();
          const parsed = JSON.parse(text);
          motif = normalizeMidiMotifPayload(parsed, record.name);
        }
      } catch {
        continue;
      }
      if (!motif) continue;
      motifs.push({
        id: record.id,
        name: record.name,
        projectId: record.projectId,
        motif: motif as MidiMotif,
      });
    }
    return motifs;
  } catch {
    return [];
  }
}

async function resolveKnowledgeGrooves(
  knowledgeFileIds?: string[],
): Promise<KnowledgeGrooveSource[]> {
  if (!Array.isArray(knowledgeFileIds) || knowledgeFileIds.length === 0) {
    return [];
  }
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const files = await listKnowledgeFiles();
    const byKey = new Map<string, (typeof files)[number]>();
    for (const record of files) {
      const idKey = normalizeMotifKey(record.id);
      if (idKey) byKey.set(idKey, record);
      const nameKey = normalizeMotifKey(record.name);
      if (nameKey) byKey.set(nameKey, record);
    }
    const grooves: KnowledgeGrooveSource[] = [];
    const processed = new Set<string>();
    for (const rawId of knowledgeFileIds) {
      const key = normalizeMotifKey(rawId);
      if (!key) continue;
      const record = byKey.get(key);
      if (!record || processed.has(record.id)) continue;
      processed.add(record.id);
      if (!isSymbolicCandidate(record)) continue;
      let parsed: unknown;
      try {
        const text = await record.data.text();
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      const groove = normalizeGrooveTemplatePayload(parsed, record.name);
      if (!groove) continue;
      grooves.push({
        id: record.id,
        name: record.name,
        projectId: record.projectId,
        groove,
      });
    }
    return grooves;
  } catch {
    return [];
  }
}

async function resolveKnowledgeMacros(
  knowledgeFileIds?: string[],
): Promise<KnowledgeMacroSource[]> {
  if (!Array.isArray(knowledgeFileIds) || knowledgeFileIds.length === 0) {
    return [];
  }
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const files = await listKnowledgeFiles();
    const byKey = new Map<string, (typeof files)[number]>();
    for (const record of files) {
      const idKey = normalizeMotifKey(record.id);
      if (idKey) byKey.set(idKey, record);
      const nameKey = normalizeMotifKey(record.name);
      if (nameKey) byKey.set(nameKey, record);
    }
    const macros: KnowledgeMacroSource[] = [];
    const processed = new Set<string>();
    for (const rawId of knowledgeFileIds) {
      const key = normalizeMotifKey(rawId);
      if (!key) continue;
      const record = byKey.get(key);
      if (!record || processed.has(record.id)) continue;
      processed.add(record.id);
      if (!isSymbolicCandidate(record)) continue;
      let parsed: unknown;
      try {
        const text = await record.data.text();
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      const curves = normalizeMacroCurvePayload(parsed, record.name);
      if (!curves?.length) continue;
      macros.push({
        id: record.id,
        name: record.name,
        projectId: record.projectId,
        curves,
      });
    }
    return macros;
  } catch {
    return [];
  }
}

function collectMaterialIds(plan?: RenderPlan): string[] {
  if (!plan?.windows?.length) return [];
  const ids: string[] = [];
  for (const window of plan.windows) {
    if (!window?.material) continue;
    if (Array.isArray(window.material.audioAtomIds)) {
      ids.push(...window.material.audioAtomIds);
    }
    if (Array.isArray(window.material.midiMotifIds)) {
      ids.push(...window.material.midiMotifIds);
    }
    if (Array.isArray(window.material.grooveTemplateIds)) {
      ids.push(...window.material.grooveTemplateIds);
    }
    if (Array.isArray(window.material.macroCurveIds)) {
      ids.push(...window.material.macroCurveIds);
    }
  }
  return ids;
}

function collectSamplerSourceIds(
  motifs: KnowledgeMidiSource[] | undefined,
): string[] {
  if (!motifs?.length) return [];
  const ids = new Set<string>();
  const pushId = (value?: string) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) ids.add(trimmed);
  };
  for (const source of motifs) {
    const sampler = source?.motif?.sampler;
    if (!sampler) continue;
    pushId(sampler.sourceId);
    if (Array.isArray(sampler.map)) {
      for (const entry of sampler.map) {
        pushId(entry?.sourceId);
      }
    }
  }
  return Array.from(ids);
}

function mergeKnowledgeIds(baseIds?: string[], extraIds?: string[]) {
  const merged = new Set<string>();
  const pushIds = (values?: string[]) => {
    if (!Array.isArray(values)) return;
    for (const raw of values) {
      const id = typeof raw === "string" ? raw.trim() : "";
      if (id) merged.add(id);
    }
  };
  pushIds(baseIds);
  pushIds(extraIds);
  return Array.from(merged);
}

const resourceCache = new Map<string, Promise<boolean>>();

async function resourceExists(url: string): Promise<boolean> {
  let cached = resourceCache.get(url);
  if (!cached) {
    cached = fetch(url, { method: "HEAD" })
      .then((res) => res.ok)
      .catch(() => false);
    resourceCache.set(url, cached);
  }
  return cached;
}

function resolveTempo(job: CoverJob): TempoMeta {
  return resolveTempoFromRequest(job.request);
}

function resolveTempoFromRequest(request: CoverJobRequest): TempoMeta {
  const fromRequest = request.tempo;
  const fromStorage = readStoredTempo();
  const candidate = fromRequest ?? fromStorage;
  if (candidate) {
    return {
      bpm: clampNumber(candidate.bpm, 40, 240),
      timeSig: sanitizeTimeSig(candidate.timeSig),
      offsetMs: clampNumber(candidate.offsetMs ?? 0, -2000, 2000),
      barsInLoop: candidate.barsInLoop,
      quantized: candidate.quantized ?? true,
    };
  }
  return {
    bpm: 120,
    timeSig: "4/4",
    offsetMs: 0,
    barsInLoop: 8,
    quantized: true,
  };
}

function readStoredTempo(): TempoMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEMPO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.bpm !== "number" || typeof parsed.timeSig !== "string") return null;
    return parsed as TempoMeta;
  } catch {
    return null;
  }
}

function sanitizeTimeSig(value: string | undefined): TempoMeta["timeSig"] {
  if (!value || !/^\d+\/\d+$/.test(value)) return "4/4";
  return value as TempoMeta["timeSig"];
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
