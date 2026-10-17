/* eslint-disable no-restricted-globals */
import { computeImmersion } from "@/lib/noise/immersion";
import type { ImmersionScores } from "@/lib/noise/immersion";
import type {
  BarWindow,
  HelixPacket,
  KnowledgeAudioSource,
  KnowledgeGrooveSource,
  KnowledgeMacroSource,
  KnowledgeMidiSource,
  GrooveTemplate,
  MacroCurve,
  MidiMotif,
  RenderPlan,
  TempoMeta,
} from "@/types/noise-gens";
import type { TextureFingerprint } from "@/lib/noise/texture-map";
import { textureFrom, createDeterministicRng } from "@/lib/noise/texture-map";
import {
  makeGrid,
  barBoundaries,
  blockSplitsByBoundaries,
  BeatLockedLFO,
  type TimeSig,
} from "@/lib/noise/beat-scheduler";

type CoverRenderRequest = {
  t: "render";
  jobId: string;
  original: {
    instrumentalUrl?: string;
    vocalUrl?: string;
    instrumentalStems?: Array<{ url: string; name?: string }>;
  };
  tempo: TempoMeta;
  barWindows: BarWindow[];
  helix?: HelixPacket;
  kbTexture?: string | null;
  sampleInfluence: number;
  styleInfluence: number;
  weirdness: number;
  renderPlan?: RenderPlan;
  knowledgeAudio?: KnowledgeAudioSource[];
  midiMotifs?: KnowledgeMidiSource[];
  grooveTemplates?: KnowledgeGrooveSource[];
  macroCurves?: KnowledgeMacroSource[];
  sampleRate?: number;
};

type AbortRequest = { t: "abort"; jobId?: string };

type WorkerInbound = CoverRenderRequest | AbortRequest;

type WorkerProgress = { t: "progress"; pct: number; stage: string };
type WorkerReady = { t: "ready"; wavBlob: Blob; duration: number; immersion: ImmersionScores };
type WorkerError = { t: "error"; error: string };

type WorkerOutbound = WorkerProgress | WorkerReady | WorkerError;

type ManifestRecord = Record<string, TextureFingerprint>;
type AudioAtomBank = Map<string, AudioBuffer>;
type MidiMotifBank = Map<string, MidiMotif>;
type GrooveTemplateBank = Map<string, GrooveTemplate>;
type MacroCurveBank = Map<string, MacroCurve[]>;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let manifestPromise: Promise<ManifestRecord> | null = null;
const impulseCache = new Map<string, Promise<AudioBuffer>>();
let abortToken: string | null = null;
const CHORUS_BASE_DELAY = 0.015;

ctx.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const message = event.data;
  if (!message) return;
  if (message.t === "abort") {
    abortToken = message.jobId ?? abortToken;
    return;
  }
  if (message.t === "render") {
    abortToken = null;
    handleRender(message).catch((error) => {
      postError(error instanceof Error ? error.message : "cover render failed");
    });
  }
};

async function handleRender(request: CoverRenderRequest) {
  const { jobId } = request;
  try {
    ensureOfflineContextAvailable();
    postProgress(0.05, "Loading texture manifest");
    const manifest = await loadManifest();
    checkAborted(jobId);

    let tempo = sanitizeTempo(request.tempo);
    tempo = applyPlanTempoOverride(tempo, request.renderPlan?.global?.bpm);
    const barWindows = sanitizeBarWindows(request.barWindows, tempo);
    if (!barWindows.length) {
      throw new Error("No valid bar windows provided");
    }

    postProgress(
      0.1,
      request.original.instrumentalUrl ? "Fetching mix" : "Mixing stems",
    );
    const instrumental = await resolveInstrumentalBuffer(request.original);
    checkAborted(jobId);

    const vocal = request.original.vocalUrl ? await fetchAudioBuffer(request.original.vocalUrl) : null;
    checkAborted(jobId);

    const sampleRate =
      request.sampleRate && Number.isFinite(request.sampleRate)
        ? Math.max(22_050, Math.min(request.sampleRate, 96_000))
        : instrumental.sampleRate;

    const helixPeaks = extractHelixPeaks(request.helix);
    const baseSampleInfluence = clamp01(request.sampleInfluence);
    const baseStyleInfluence = clamp01(request.styleInfluence);
    const baseWeirdness = clamp01(request.weirdness);
    const baseKbTexture = request.kbTexture ? manifest[request.kbTexture] : undefined;
    const rawPlanWindows = request.renderPlan?.windows;
    const planWindows = Array.isArray(rawPlanWindows) ? rawPlanWindows : [];
    const usePlan = planWindows.length > 0;
    const renderWindows = usePlan
      ? resolveRenderWindows(barWindows, planWindows, tempo)
      : barWindows;
    const planSections = usePlan
      ? applySectionGrammar(
          normalizeSections(request.renderPlan?.global?.sections),
          renderWindows,
        )
      : [];
    const energyCurve = normalizeEnergyCurve(
      request.renderPlan?.global?.energyCurve,
    );
    const enforcedPlanWindows = usePlan
      ? applyMotifSchedule(planWindows, planSections)
      : planWindows;
    const planWindowMap = usePlan
      ? buildPlanWindowMap(enforcedPlanWindows)
      : null;
    const midiMotifBank = usePlan
      ? buildMidiMotifBank(request.midiMotifs)
      : new Map<string, MidiMotif>();
    const samplerSourceIds = usePlan
      ? collectSamplerSourceIds(midiMotifBank)
      : [];
    const audioAtomBank = usePlan
      ? await loadAudioAtomBank(
          request.knowledgeAudio,
          enforcedPlanWindows,
          samplerSourceIds,
        )
      : new Map<string, AudioBuffer>();
    const grooveTemplateBank = usePlan
      ? buildGrooveTemplateBank(request.grooveTemplates)
      : new Map<string, GrooveTemplate>();
    const macroCurveBank = usePlan
      ? buildMacroCurveBank(request.macroCurves)
      : new Map<string, MacroCurve[]>();
    checkAborted(jobId);

    postProgress(0.18, usePlan ? "Preparing window textures" : "Blending texture");
    let baseTexture: ReturnType<typeof textureFrom> | null = null;
    let baseImpulse: AudioBuffer | null = null;
    if (!usePlan) {
      const seed = computeSeed(
        request.helix,
        baseSampleInfluence,
        baseStyleInfluence,
        baseWeirdness,
      );
      baseTexture = textureFrom(helixPeaks, baseKbTexture, {
        sampleInfluence: baseSampleInfluence,
        styleInfluence: baseStyleInfluence,
        weirdness: baseWeirdness,
        seed,
      });
      baseImpulse = await loadImpulse(baseTexture.irName, sampleRate);
      checkAborted(jobId);
    }

    postProgress(0.26, usePlan ? "Rendering plan windows" : "Rendering bars");
    const segments = [];
    let totalLength = 0;
    let lastEnergy: number | null = null;
    let lastSection: string | null = null;

    for (let index = 0; index < renderWindows.length; index += 1) {
      const window = renderWindows[index];
      const pct = 0.26 + (0.6 * index) / Math.max(1, renderWindows.length);     
      const sectionLabel = resolveSectionLabel(planSections, window);
      const stageLabel = sectionLabel
        ? `Rendering ${sectionLabel} bars ${window.startBar}-${window.endBar - 1}`
        : `Rendering bars ${window.startBar}-${window.endBar - 1}`;
      postProgress(pct, stageLabel);

      const planWindow = usePlan
        ? resolvePlanWindow(planWindowMap, window)
        : undefined;
      const rawEnergy = resolveWindowEnergy(window, energyCurve);
      const maxDelta =
        sectionLabel && lastSection && sectionLabel !== lastSection
          ? ENERGY_DELTA_SECTION_CHANGE
          : ENERGY_DELTA_IN_SECTION;
      const windowEnergy = enforceEnergyContinuity(
        rawEnergy,
        lastEnergy,
        maxDelta,
      );
      if (windowEnergy != null) {
        lastEnergy = windowEnergy;
      }
      if (sectionLabel) {
        lastSection = sectionLabel;
      }
      const texture = usePlan
        ? buildWindowTexture({
            window,
            planWindowMap,
            helix: request.helix,
            helixPeaks,
            baseKbTexture,
            baseSampleInfluence,
            baseStyleInfluence,
            baseWeirdness,
            manifest,
            energy: windowEnergy ?? undefined,
          })
        : baseTexture!;
      const impulse = usePlan
        ? await loadImpulse(texture.irName, sampleRate)
        : baseImpulse!;
      checkAborted(jobId);

      const segment = await renderWindow({
        window,
        instrumental,
        vocal,
        tempo,
        sampleRate,
        texture,
        impulse,
        material: planWindow?.material,
        audioAtoms: audioAtomBank,
        midiMotifs: midiMotifBank,
        grooveTemplates: grooveTemplateBank,
        macroCurves: macroCurveBank,
        energy: windowEnergy ?? undefined,
        jobId,
      });
      segments.push(segment);
      totalLength += segment.length;
      checkAborted(jobId);
    }

    postProgress(0.88, "Assembling mixdown");
    const mixed = mergeSegments(segments, sampleRate);
    const duration = mixed.length / sampleRate;

    const mono = bufferToMono(mixed);
    const immersion = computeImmersion(mono, sampleRate, tempo, undefined, helixPeaks);

    postProgress(0.94, "Exporting WAV");
    const wavBlob = bufferToWavBlob(mixed, sampleRate);

    postProgress(1, "Ready");
    ctx.postMessage({ t: "ready", wavBlob, duration, immersion } satisfies WorkerReady);
  } catch (error) {
    postError(error instanceof Error ? error.message : "cover render failed");
  }
}

function ensureOfflineContextAvailable() {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("Offline audio context unavailable in this browser");
  }
}

type MaybeClosableOfflineAudioContext = OfflineAudioContext & { close?: () => Promise<void> };

async function closeOfflineContext(context: OfflineAudioContext) {
  const maybeClose = (context as MaybeClosableOfflineAudioContext).close;
  if (typeof maybeClose === "function") {
    await maybeClose.call(context);
  }
}

function checkAborted(jobId: string) {
  if (!abortToken) return;
  if (abortToken === jobId || abortToken === "*") {
    throw new Error("render aborted");
  }
}

function postProgress(pct: number, stage: string) {
  ctx.postMessage({ t: "progress", pct: clamp01(pct), stage } satisfies WorkerProgress);
}

function postError(error: string) {
  ctx.postMessage({ t: "error", error } satisfies WorkerError);
}

async function loadManifest(): Promise<ManifestRecord> {
  if (!manifestPromise) {
    manifestPromise = fetch("/kb-textures/manifest.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load texture manifest (${res.status})`);
        }
        return res.json() as Promise<ManifestRecord>;
      })
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

async function loadImpulse(irName: string, sampleRate: number): Promise<AudioBuffer> {
  const cacheKey = `${irName}:${sampleRate}`;
  let cached = impulseCache.get(cacheKey);
  if (!cached) {
    cached = fetch(`/kb-textures/irs/${encodeURIComponent(irName)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load impulse response ${irName}`);
        const arrayBuffer = await res.arrayBuffer();
        const context = new OfflineAudioContext(2, 1, sampleRate);
        const buffer = await context.decodeAudioData(arrayBuffer);
        await closeOfflineContext(context);
        return buffer;
      })
      .catch((error) => {
        impulseCache.delete(cacheKey);
        throw error;
      });
    impulseCache.set(cacheKey, cached);
  }
  return cached;
}

async function fetchAudioBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio source (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const context = new OfflineAudioContext(2, 1, 44100);
  const audioBuffer = await context.decodeAudioData(buffer);
  await closeOfflineContext(context);
  return audioBuffer;
}

async function mixBuffers(buffers: AudioBuffer[]): Promise<AudioBuffer> {
  if (!buffers.length) {
    throw new Error("No stem buffers available to mix.");
  }
  if (buffers.length === 1) {
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
  await closeOfflineContext(context);
  return mixed;
}

async function resolveInstrumentalBuffer(
  original: CoverRenderRequest["original"],
): Promise<AudioBuffer> {
  if (original.instrumentalUrl) {
    return fetchAudioBuffer(original.instrumentalUrl);
  }
  const stems = original.instrumentalStems ?? [];
  if (!stems.length) {
    throw new Error("No instrumental source available for rendering.");
  }
  const buffers = await Promise.all(stems.map((stem) => fetchAudioBuffer(stem.url)));
  return mixBuffers(buffers);
}

async function loadAudioAtomBank(
  knowledgeAudio: KnowledgeAudioSource[] | undefined,
  planWindows: RenderPlan["windows"] | undefined,
  extraIds: string[] = [],
): Promise<AudioAtomBank> {
  const bank: AudioAtomBank = new Map();
  if (!knowledgeAudio?.length || !planWindows?.length) return bank;

  const requested = collectMaterialIds(planWindows);
  if (extraIds.length) {
    requested.push(...extraIds);
  }
  if (!requested.length) return bank;

  const sourcesByKey = new Map<string, KnowledgeAudioSource>();
  for (const source of knowledgeAudio) {
    const idKey = normalizeMaterialKey(source.id);
    if (idKey) sourcesByKey.set(idKey, source);
    const nameKey = normalizeMaterialKey(source.name);
    if (nameKey) sourcesByKey.set(nameKey, source);
  }

  const bufferById = new Map<string, AudioBuffer>();
  const requestedKeys = new Set<string>(
    requested.map(normalizeMaterialKey).filter(Boolean),
  );
  for (const key of requestedKeys) {
    if (bank.has(key)) continue;
    const source = sourcesByKey.get(key);
    if (!source) continue;
    let buffer = bufferById.get(source.id);
    if (!buffer) {
      buffer = await fetchAudioBuffer(source.url);
      bufferById.set(source.id, buffer);
    }
    bank.set(key, buffer);
    const idKey = normalizeMaterialKey(source.id);
    if (idKey) bank.set(idKey, buffer);
    const nameKey = normalizeMaterialKey(source.name);
    if (nameKey) bank.set(nameKey, buffer);
  }

  return bank;
}

function buildMidiMotifBank(
  sources: KnowledgeMidiSource[] | undefined,
): MidiMotifBank {
  const bank: MidiMotifBank = new Map();
  if (!sources?.length) return bank;
  for (const source of sources) {
    if (!source?.motif) continue;
    const idKey = normalizeMaterialKey(source.id);
    if (idKey) bank.set(idKey, source.motif);
    const nameKey = normalizeMaterialKey(source.name);
    if (nameKey) bank.set(nameKey, source.motif);
  }
  return bank;
}

function buildGrooveTemplateBank(
  sources: KnowledgeGrooveSource[] | undefined,
): GrooveTemplateBank {
  const bank: GrooveTemplateBank = new Map();
  if (!sources?.length) return bank;
  for (const source of sources) {
    if (!source?.groove) continue;
    const idKey = normalizeMaterialKey(source.id);
    if (idKey) bank.set(idKey, source.groove);
    const nameKey = normalizeMaterialKey(source.name);
    if (nameKey) bank.set(nameKey, source.groove);
    const grooveId = normalizeMaterialKey(source.groove.id);
    if (grooveId) bank.set(grooveId, source.groove);
    const grooveName = normalizeMaterialKey(source.groove.name);
    if (grooveName) bank.set(grooveName, source.groove);
  }
  return bank;
}

const addMacroCurves = (
  bank: MacroCurveBank,
  key: string | undefined,
  curves: MacroCurve[],
) => {
  const normalized = normalizeMaterialKey(key);
  if (!normalized) return;
  const existing = bank.get(normalized) ?? [];
  const seen = new Set(
    existing.map((curve) => curve.id ?? curve.name ?? curve.target),
  );
  for (const curve of curves) {
    const identity = curve.id ?? curve.name ?? curve.target;
    if (seen.has(identity)) continue;
    seen.add(identity);
    existing.push(curve);
  }
  bank.set(normalized, existing);
};

function buildMacroCurveBank(
  sources: KnowledgeMacroSource[] | undefined,
): MacroCurveBank {
  const bank: MacroCurveBank = new Map();
  if (!sources?.length) return bank;
  for (const source of sources) {
    const curves = source?.curves ?? [];
    if (!curves.length) continue;
    addMacroCurves(bank, source.id, curves);
    addMacroCurves(bank, source.name, curves);
    for (const curve of curves) {
      addMacroCurves(bank, curve.id, [curve]);
      addMacroCurves(bank, curve.name, [curve]);
    }
  }
  return bank;
}

type RenderWindowParams = {
  window: BarWindow;
  instrumental: AudioBuffer;
  vocal: AudioBuffer | null;
  tempo: TempoMeta;
  sampleRate: number;
  texture: ReturnType<typeof textureFrom>;
  impulse: AudioBuffer;
  material?: RenderPlanWindow["material"];
  audioAtoms?: AudioAtomBank;
  midiMotifs?: MidiMotifBank;
  grooveTemplates?: GrooveTemplateBank;
  macroCurves?: MacroCurveBank;
  energy?: number;
  jobId: string;
};

async function renderWindow({
  window,
  instrumental,
  vocal,
  tempo,
  sampleRate,
  texture,
  impulse,
  material,
  audioAtoms,
  midiMotifs,
  grooveTemplates,
  macroCurves,
  energy,
  jobId,
}: RenderWindowParams): Promise<AudioBuffer> {
  const { startTimeSec, durationSec } = windowToSeconds(window, tempo);
  const frameCount = Math.max(1, Math.ceil(durationSec * sampleRate));
  const renderDurationSec = frameCount / sampleRate;
  const grid = makeGrid(sampleRate, tempo.bpm, tempo.timeSig as TimeSig, tempo.offsetMs);
  const windowStartSample = Math.round(startTimeSec * sampleRate);
  const windowEndSample = windowStartSample + frameCount;
  const barMarkers = barBoundaries(grid, windowStartSample, windowEndSample)
    .map((idx) => idx - windowStartSample)
    .filter((idx) => idx > 0 && idx < frameCount)
    .sort((a, b) => a - b);
  const chorusConfig = {
    rate: clamp(texture.chorus.rate, 0.05, 4),
    depth: clamp(texture.chorus.depth, 0.0005, 0.01),
  };
  const chorusCurve =
    frameCount > 1
      ? buildBeatLockedDelayCurve(frameCount, sampleRate, tempo.bpm, chorusConfig.rate, chorusConfig.depth, barMarkers)
      : null;

  const context = new OfflineAudioContext({
    numberOfChannels: 2,
    length: frameCount,
    sampleRate,
  });

  // Pre-headroom
  const preGain = context.createGain();
  const energyAmount = resolveEnergyAmount(energy);
  const preGainDb =
    energyAmount == null
      ? -3
      : clamp(-3 + (energyAmount - 0.5) * 4, -6, 0);
  preGain.gain.value = dbToGain(preGainDb);

  if (material && audioAtoms && audioAtoms.size) {
    scheduleMaterialAtoms({
      context,
      material,
      audioAtoms,
      destination: preGain,
      durationSec,
    });
  }
    if (material && midiMotifs && midiMotifs.size) {
      const grooveTemplate = resolveGrooveTemplate(material, grooveTemplates);
      const macroCurvesForWindow = resolveMacroCurves(material, macroCurves);
      scheduleMidiMotifs({
        context,
        material,
        midiMotifs,
        audioAtoms,
        destination: preGain,
        durationSec,
        tempo,
        windowBars: Math.max(1, window.endBar - window.startBar),
        grooveTemplate,
      macroCurves: macroCurvesForWindow,
    });
  }

  const eqOutput = applyEq(context, preGain, texture.eqPeaks);
  const chorus = applyChorus(
    context,
    eqOutput,
    chorusConfig,
    chorusCurve ? { curve: chorusCurve, duration: renderDurationSec } : undefined,
  );
  const saturator = applySaturation(context, chorus.output, texture.sat.drive);
  const compressor = context.createDynamicsCompressor();
  const compAmount = resolveFxAmount(texture.comp);
  compressor.threshold.value =
    compAmount == null ? -12 : lerp(-18, -8, compAmount);
  compressor.ratio.value = compAmount == null ? 2.6 : lerp(1.6, 4.5, compAmount);
  compressor.attack.value = 0.006;
  compressor.release.value = 0.24;
  saturator.connect(compressor);

  const reverbGain = context.createGain();
  const reverbSend = resolveFxAmount(texture.reverbSend);
  const reverbGainValue =
    reverbSend == null
      ? 0.22 + clamp01(texture.sat.drive) * 0.18
      : clamp(0.05 + reverbSend * 0.55, 0.05, 0.6);
  reverbGain.gain.value = reverbGainValue;
  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  eqOutput.connect(convolver);
  convolver.connect(reverbGain);

  const dryGain = context.createGain();
  dryGain.gain.value =
    reverbSend == null
      ? 0.84
      : clamp(0.95 - reverbSend * 0.45, 0.35, 0.95);
  compressor.connect(dryGain);

  const masterGain = context.createGain();
  masterGain.gain.value = dbToGain(2.6);

  dryGain.connect(masterGain);
  reverbGain.connect(masterGain);

  applyWindowFades(masterGain.gain, durationSec);

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -0.8;
  limiter.knee.value = 1.5;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  masterGain.connect(limiter);
  limiter.connect(context.destination);

  const rng = createDeterministicRng(Math.floor(startTimeSec * 10_000));
  const instSource = context.createBufferSource();
  instSource.buffer = instrumental;
  instSource.start(0, startTimeSec, durationSec);
  instSource.connect(preGain);

  if (vocal) {
    const vocalSource = context.createBufferSource();
    vocalSource.buffer = vocal;
    vocalSource.start(0, startTimeSec, durationSec);
    const vocalGain = context.createGain();
    vocalGain.gain.value = 0.42 + rng.next() * 0.1;
    vocalSource.connect(vocalGain);
    vocalGain.connect(preGain);
  }

  chorus.lfo.start(0);
  checkAborted(jobId);
  const buffer = await context.startRendering();
  chorus.lfo.stop();
  return buffer;
}

function mergeSegments(buffers: AudioBuffer[], sampleRate: number): AudioBuffer {
  if (!buffers.length) {
    return new AudioBuffer({ length: sampleRate, numberOfChannels: 2, sampleRate });
  }

  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.length, 0);
  const merged = new AudioBuffer({ length: totalLength, numberOfChannels: channels, sampleRate });

  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < channels; channel += 1) {
      const destination = new Float32Array(buffer.length);
      if (channel < buffer.numberOfChannels) {
        buffer.copyFromChannel(destination, channel, 0);
      }
      merged.copyToChannel(destination, channel, offset);
    }
    offset += buffer.length;
  }
  return merged;
}

function bufferToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = Math.max(1, buffer.numberOfChannels);
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const channelData = new Float32Array(length);
    buffer.copyFromChannel(channelData, channel, 0);
    for (let i = 0; i < length; i += 1) {
      mono[i] += channelData[i];
    }
  }
  if (channels > 1) {
    for (let i = 0; i < length; i += 1) {
      mono[i] /= channels;
    }
  }
  return mono;
}

function applyEq(context: OfflineAudioContext, input: AudioNode, peaks: readonly { f: number; q: number; gain: number }[]) {
  if (!peaks.length) {
    return input;
  }
  let node: AudioNode = input;
  for (const peak of peaks) {
    const filter = context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = peak.f;
    filter.Q.value = peak.q;
    filter.gain.value = peak.gain;
    node.connect(filter);
    node = filter;
  }
  return node;
}

type LFOHandle = { start(when?: number): void; stop(when?: number): void };

function applyChorus(
  context: OfflineAudioContext,
  input: AudioNode,
  config: { rate: number; depth: number },
  automation?: { curve: Float32Array; duration: number },
) {
  const chorusInput = context.createGain();
  const delay = context.createDelay(0.05);
  const baseDelay = CHORUS_BASE_DELAY;
  delay.delayTime.value = baseDelay;

  const wetGain = context.createGain();
  wetGain.gain.value = 0.28;

  let lfoHandle: LFOHandle;
  if (automation?.curve && automation.curve.length > 1) {
    delay.delayTime.cancelScheduledValues(0);
    delay.delayTime.setValueAtTime(baseDelay, 0);
    delay.delayTime.setValueCurveAtTime(automation.curve, 0, automation.duration);
    lfoHandle = {
      start: () => {},
      stop: () => {},
    };
  } else {
    const lfo = context.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = clamp(config.rate, 0.05, 4);

    const lfoGain = context.createGain();
    lfoGain.gain.value = clamp(config.depth, 0.0005, 0.01);

    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfoHandle = lfo;
  }

  input.connect(chorusInput);
  chorusInput.connect(delay);
  delay.connect(wetGain);

  const output = context.createGain();
  chorusInput.connect(output);
  wetGain.connect(output);

  return { input: chorusInput, output, lfo: lfoHandle };
}

function applySaturation(context: OfflineAudioContext, input: AudioNode, drive: number) {
  const shaper = context.createWaveShaper();
  shaper.curve = createSaturationCurve(drive);
  input.connect(shaper);
  return shaper;
}

function buildBeatLockedDelayCurve(
  frameCount: number,
  sampleRate: number,
  bpm: number,
  rateHz: number,
  depth: number,
  boundaries: number[],
): Float32Array {
  const curve = new Float32Array(frameCount);
  if (frameCount <= 0) return curve;

  const baseDelay = CHORUS_BASE_DELAY;
  const beatsPerSecond = bpm / 60;
  if (!Number.isFinite(rateHz) || rateHz <= 0 || !Number.isFinite(depth) || depth <= 0 || beatsPerSecond <= 0) {
    curve.fill(baseDelay);
    return curve;
  }

  const sortedBoundaries = [...boundaries]
    .map((idx) => Math.round(idx))
    .filter((idx) => idx > 0 && idx < frameCount)
    .sort((a, b) => a - b);

  const uniqueBoundaries: number[] = [];
  for (const idx of sortedBoundaries) {
    if (uniqueBoundaries.length === 0 || uniqueBoundaries[uniqueBoundaries.length - 1] !== idx) {
      uniqueBoundaries.push(idx);
    }
  }

  const ratio = rateHz / beatsPerSecond;
  const lfo = new BeatLockedLFO(sampleRate, bpm, ratio, 1, 0);
  const splits = blockSplitsByBoundaries(0, frameCount, uniqueBoundaries);

  let cursor = 0;
  let boundaryIdx = 0;
  for (const segment of splits) {
    if (segment <= 0) continue;
    const { phase0, dphi } = lfo.advance(segment);
    for (let i = 0; i < segment; i += 1) {
      curve[cursor + i] = baseDelay + Math.sin(phase0 + dphi * i) * depth;
    }
    cursor += segment;
    while (boundaryIdx < uniqueBoundaries.length && uniqueBoundaries[boundaryIdx] <= cursor) {
      if (Math.abs(uniqueBoundaries[boundaryIdx] - cursor) <= 1) {
        lfo.reset(0);
      }
      boundaryIdx += 1;
    }
  }

  if (cursor < frameCount) {
    for (let i = cursor; i < frameCount; i += 1) {
      curve[i] = baseDelay;
    }
  }

  return curve;
}

function applyWindowFades(gain: AudioParam, durationSec: number) {
  const fade = Math.min(0.03, durationSec / 6);
  if (fade <= 0) return;
  gain.setValueAtTime(0, 0);
  gain.linearRampToValueAtTime(1, fade);
  gain.setValueAtTime(1, Math.max(fade, durationSec - fade));
  gain.linearRampToValueAtTime(0, durationSec);
}

function createSaturationCurve(drive: number) {
  const amount = clamp(drive, 0.05, 1.5);
  const samples = 1024;
  const curve = new Float32Array(samples);
  const k = amount * 2 + 0.5;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function bufferToWavBlob(buffer: AudioBuffer, sampleRate: number): Blob {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2;
  const wavBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(wavBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  let offset = 44;
  const channelData = Array.from({ length: numChannels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = channelData[channel][i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function sanitizeTempo(raw: TempoMeta): TempoMeta {
  const bpm = clamp(Number(raw?.bpm) || 120, 40, 240);
  const timeSig = typeof raw?.timeSig === "string" && /^\d+\/\d+$/.test(raw.timeSig) ? raw.timeSig : "4/4";
  const offsetMs = clampNumber(raw?.offsetMs ?? 0, -2000, 2000);
  const barsInLoop = raw?.barsInLoop && Number.isFinite(raw.barsInLoop) ? Math.max(1, Math.min(512, raw.barsInLoop)) : undefined;
  return { bpm, timeSig, offsetMs, barsInLoop, quantized: raw?.quantized ?? true };
}

function applyPlanTempoOverride(tempo: TempoMeta, bpm?: number): TempoMeta {
  if (typeof bpm !== "number" || !Number.isFinite(bpm)) return tempo;
  return { ...tempo, bpm: clampNumber(bpm, 40, 240) };
}

function sanitizeBarWindows(windows: BarWindow[], tempo: TempoMeta): BarWindow[] {
  const seen = new Set<string>();
  const sanitized: BarWindow[] = [];
  for (const window of windows) {
    const startBar = Math.max(1, Math.floor(window.startBar));
    const endBar = Math.max(startBar + 1, Math.floor(window.endBar));
    const key = `${startBar}:${endBar}`;
    if (!seen.has(key)) {
      sanitized.push({ startBar, endBar });
      seen.add(key);
    }
  }
  sanitized.sort((a, b) => a.startBar - b.startBar || a.endBar - b.endBar);
  return sanitized;
}

type RenderPlanWindow = RenderPlan["windows"][number];

const planWindowKey = (startBar: number, bars: number) => `${startBar}:${bars}`;

const buildPlanWindowMap = (windows: RenderPlan["windows"]) => {
  const map = new Map<string, RenderPlanWindow>();
  for (const window of windows) {
    if (!window) continue;
    const startBar = Number(window.startBar);
    const bars = Number(window.bars);
    if (!Number.isFinite(startBar) || !Number.isFinite(bars) || bars <= 0) {
      continue;
    }
    map.set(planWindowKey(Math.floor(startBar), Math.floor(bars)), window);
  }
  return map;
};

const resolveRenderWindows = (
  requested: BarWindow[],
  planWindows: RenderPlan["windows"] | undefined,
  tempo: TempoMeta,
) => {
  if (!Array.isArray(planWindows) || planWindows.length === 0) return requested;
  const rawPlanWindows = planWindows.map((window) => ({
    startBar: window.startBar,
    endBar: window.startBar + window.bars,
  }));
  const sanitizedPlans = sanitizeBarWindows(rawPlanWindows, tempo);
  const filteredPlans = sanitizedPlans.filter((planWindow) =>
    requested.some(
      (jobWindow) =>
        planWindow.startBar >= jobWindow.startBar &&
        planWindow.endBar <= jobWindow.endBar,
    ),
  );
  return filteredPlans.length ? filteredPlans : requested;
};

const resolvePlanWindow = (
  planWindowMap: Map<string, RenderPlanWindow> | null,
  window: BarWindow,
) => {
  if (!planWindowMap) return undefined;
  const bars = Math.max(1, Math.floor(window.endBar - window.startBar));
  return planWindowMap.get(planWindowKey(Math.floor(window.startBar), bars));
};

type EnergyPoint = { bar: number; energy: number };
type PlanEnergyCurve = NonNullable<RenderPlan["global"]>["energyCurve"];
type PlanSections = NonNullable<RenderPlan["global"]>["sections"];
type PlanSection = { name: string; startBar: number; bars: number };

const normalizeEnergyCurve = (
  energyCurve: PlanEnergyCurve | undefined,
): EnergyPoint[] => {
  if (!Array.isArray(energyCurve)) return [];
  const byBar = new Map<number, number>();
  for (const point of energyCurve) {
    const bar = Math.max(1, Math.floor(point.bar));
    const energy = Number(point.energy);
    if (!Number.isFinite(energy)) continue;
    byBar.set(bar, clamp01(energy));
  }
  return Array.from(byBar.entries())
    .sort(([a], [b]) => a - b)
    .map(([bar, energy]) => ({ bar, energy }));
};

const resolveEnergyAtBar = (curve: EnergyPoint[], bar: number) => {
  if (!curve.length) return null;
  let resolved = curve[0].energy;
  for (const point of curve) {
    if (point.bar > bar) break;
    resolved = point.energy;
  }
  return resolved;
};

const resolveWindowEnergy = (window: BarWindow, curve: EnergyPoint[]) => {      
  if (!curve.length) return null;
  const startBar = Math.max(1, Math.floor(window.startBar));
  const endBar = Math.max(startBar + 1, Math.floor(window.endBar));
  let sum = 0;
  let count = 0;
  for (let bar = startBar; bar < endBar; bar += 1) {
    const energy = resolveEnergyAtBar(curve, bar);
    if (energy == null) continue;
    sum += energy;
    count += 1;
  }
  return count ? sum / count : null;
};

const enforceEnergyContinuity = (
  value: number | null,
  previous: number | null,
  maxDelta: number,
) => {
  if (value == null) return null;
  if (previous == null) return clamp01(value);
  return clamp01(clamp(value, previous - maxDelta, previous + maxDelta));
};

const ENERGY_DELTA_IN_SECTION = 0.2;
const ENERGY_DELTA_SECTION_CHANGE = 0.35;

const normalizeSections = (
  sections: PlanSections | undefined,
): PlanSection[] => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => {
      const name = typeof section.name === "string" ? section.name.trim() : "";
      const startBar = Math.max(1, Math.floor(section.startBar));
      const bars = Math.max(1, Math.floor(section.bars));
      if (!name) return null;
      return { name, startBar, bars };
    })
    .filter((section): section is PlanSection => Boolean(section))
    .sort((a, b) => a.startBar - b.startBar);
};

const buildSectionNames = (count: number) => {
  if (count <= 2) return ["intro", "outro"];
  if (count === 3) return ["intro", "verse", "outro"];
  if (count === 4) return ["intro", "verse", "build", "outro"];
  if (count === 5) return ["intro", "verse", "build", "drop", "outro"];
  return ["intro", "verse", "build", "drop", "bridge", "outro"];
};

const buildSectionsFromWindows = (windows: BarWindow[]): PlanSection[] => {
  if (!windows.length) return [];
  const sorted = [...windows].sort(
    (a, b) => a.startBar - b.startBar || a.endBar - b.endBar,
  );
  const names = buildSectionNames(sorted.length);
  const segmentCount = Math.min(names.length, sorted.length);
  const base = Math.floor(sorted.length / segmentCount);
  const remainder = sorted.length % segmentCount;
  const segments = names.slice(0, segmentCount).map((name, index) => ({
    name,
    count: base + (index < remainder ? 1 : 0),
  }));
  const result: PlanSection[] = [];
  let cursor = 0;
  for (const segment of segments) {
    if (segment.count <= 0) continue;
    const slice = sorted.slice(cursor, cursor + segment.count);
    if (!slice.length) continue;
    const startBar = slice[0].startBar;
    const endBar = slice[slice.length - 1].endBar;
    result.push({
      name: segment.name,
      startBar,
      bars: Math.max(1, endBar - startBar),
    });
    cursor += segment.count;
  }
  return result;
};

const sectionsCoverWindows = (sections: PlanSection[], windows: BarWindow[]) => {
  if (!sections.length || !windows.length) return false;
  let sectionIndex = 0;
  const sorted = [...sections].sort(
    (a, b) => a.startBar - b.startBar || a.bars - b.bars,
  );
  for (const window of windows) {
    const startBar = Math.max(1, Math.floor(window.startBar));
    while (
      sectionIndex < sorted.length &&
      startBar >= sorted[sectionIndex].startBar + sorted[sectionIndex].bars
    ) {
      sectionIndex += 1;
    }
    const section = sorted[sectionIndex];
    if (!section) return false;
    if (startBar < section.startBar) return false;
    if (startBar >= section.startBar + section.bars) return false;
  }
  return true;
};

const applySectionGrammar = (
  sections: PlanSection[],
  windows: BarWindow[],
) => {
  if (!windows.length) return sections;
  if (!sections.length || !sectionsCoverWindows(sections, windows)) {
    return buildSectionsFromWindows(windows);
  }
  const grammarNames = buildSectionNames(sections.length);
  return sections.map((section, index) => ({
    ...section,
    name: grammarNames[index] ?? section.name,
  }));
};

const normalizePlanWindowRange = (window: RenderPlanWindow) => {
  const startBar = Math.max(1, Math.floor(window.startBar));
  const bars = Math.max(1, Math.floor(window.bars));
  return { startBar, endBar: startBar + bars, bars };
};

const sanitizeMotifIds = (ids: string[] | undefined) => {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
};

const normalizeMotifIds = (ids: string[] | undefined) =>
  sanitizeMotifIds(ids).map((entry) => normalizeMaterialKey(entry));

const mergeMotifIds = (base: string[], existing: string[]) => {
  const merged: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const key = normalizeMaterialKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(value);
  };
  base.forEach(push);
  existing.forEach(push);
  return merged;
};

const areMotifListsEquivalent = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (normalizeMaterialKey(left[index]) !== normalizeMaterialKey(right[index])) {
      return false;
    }
  }
  return true;
};

const buildMotifSchedule = (
  windows: RenderPlanWindow[],
  sections: PlanSection[],
) => {
  const counts = new Map<string, Map<string, { count: number; ids: string[] }>>();
  for (const window of windows) {
    const ids = sanitizeMotifIds(window.material?.midiMotifIds);
    if (!ids.length) continue;
    const normalized = normalizeMotifIds(ids);
    if (!normalized.length) continue;
    const key = normalized.join("|");
    const range = normalizePlanWindowRange(window);
    const section = resolveSectionLabel(sections, range);
    if (!section) continue;
    const bucket = counts.get(section) ?? new Map();
    const entry = bucket.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      bucket.set(key, { count: 1, ids });
    }
    counts.set(section, bucket);
  }
  const schedule = new Map<string, string[]>();
  let lastIds: string[] | null = null;
  for (const section of sections) {
    const bucket = counts.get(section.name);
    let winner: { count: number; ids: string[] } | null = null;
    if (bucket) {
      for (const candidate of bucket.values()) {
        if (!winner || candidate.count > winner.count) {
          winner = candidate;
        }
      }
    }
    const picked: string[] | null = winner?.ids ?? lastIds;
    if (picked?.length) {
      schedule.set(section.name, picked);
      lastIds = picked;
    }
  }
  return schedule;
};

const applyMotifSchedule = (
  windows: RenderPlanWindow[],
  sections: PlanSection[],
) => {
  if (!windows.length || !sections.length) return windows;
  const schedule = buildMotifSchedule(windows, sections);
  if (!schedule.size) return windows;
  return windows.map((window) => {
    const range = normalizePlanWindowRange(window);
    const section = resolveSectionLabel(sections, range);
    if (!section) return window;
    const scheduled = schedule.get(section);
    if (!scheduled?.length) return window;
    const existing = sanitizeMotifIds(window.material?.midiMotifIds);
    const merged = existing.length
      ? mergeMotifIds(scheduled, existing)
      : [...scheduled];
    if (existing.length && areMotifListsEquivalent(existing, merged)) {
      return window;
    }
    const material = { ...(window.material ?? {}) };
    material.midiMotifIds = merged;
    return { ...window, material };
  });
};

const resolveSectionLabel = (
  sections: PlanSection[],
  window: BarWindow,
) => {
  if (!sections.length) return null;
  const startBar = Math.max(1, Math.floor(window.startBar));
  for (const section of sections) {
    const endBar = section.startBar + section.bars;
    if (startBar >= section.startBar && startBar < endBar) {
      return section.name;
    }
  }
  return null;
};

const resolvePlanKbTexture = (
  input: NonNullable<RenderPlanWindow["texture"]>["kbTexture"] | undefined,
  manifest: ManifestRecord,
  fallback?: TextureFingerprint,
) => {
  if (!input) return fallback;
  if (typeof input === "string") {
    return manifest[input] ?? fallback;
  }
  const weights = input?.weights;
  if (!weights || typeof weights !== "object") return fallback;
  let bestKey: string | null = null;
  let bestWeight = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(weights)) {
    if (!Number.isFinite(value)) continue;
    if (value > bestWeight) {
      bestWeight = value;
      bestKey = key;
    }
  }
  if (bestKey && manifest[bestKey]) {
    return manifest[bestKey];
  }
  return fallback;
};

const normalizeMaterialKey = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const resolveGrooveTemplate = (
  material: RenderPlanWindow["material"] | undefined,
  bank: GrooveTemplateBank | undefined,
) => {
  if (!material?.grooveTemplateIds?.length || !bank?.size) return null;
  for (const rawId of material.grooveTemplateIds) {
    const key = normalizeMaterialKey(rawId);
    if (!key) continue;
    const groove = bank.get(key);
    if (groove) return groove;
  }
  return null;
};

const resolveMacroCurves = (
  material: RenderPlanWindow["material"] | undefined,
  bank: MacroCurveBank | undefined,
): MacroCurve[] => {
  if (!material?.macroCurveIds?.length || !bank?.size) return [];
  const curves: MacroCurve[] = [];
  const seen = new Set<string>();
  for (const rawId of material.macroCurveIds) {
    const key = normalizeMaterialKey(rawId);
    if (!key) continue;
    const bucket = bank.get(key);
    if (!bucket?.length) continue;
    for (const curve of bucket) {
      const identity = curve.id ?? curve.name ?? curve.target;
      if (seen.has(identity)) continue;
      seen.add(identity);
      curves.push(curve);
    }
  }
  return curves;
};

const collectMaterialIds = (windows: RenderPlan["windows"]) => {
  const ids: string[] = [];
  for (const window of windows) {
    if (!window?.material) continue;
    if (Array.isArray(window.material.audioAtomIds)) {
      ids.push(...window.material.audioAtomIds);
    }
    if (Array.isArray(window.material.midiMotifIds)) {
      ids.push(...window.material.midiMotifIds);
    }
  }
  return ids;
};

const collectSamplerSourceIds = (midiMotifs: MidiMotifBank): string[] => {
  if (!midiMotifs.size) return [];
  const ids = new Set<string>();
  for (const motif of midiMotifs.values()) {
    const sampler = motif?.sampler;
    if (!sampler) continue;
    if (sampler.sourceId) {
      ids.add(sampler.sourceId);
    }
    if (Array.isArray(sampler.map)) {
      for (const entry of sampler.map) {
        if (entry?.sourceId) {
          ids.add(entry.sourceId);
        }
      }
    }
  }
  return Array.from(ids);
};

type WindowTextureRequest = {
  window: BarWindow;
  planWindowMap: Map<string, RenderPlanWindow> | null;
  helix: HelixPacket | undefined;
  helixPeaks: Array<{ f: number; q: number; gain: number }>;
  baseKbTexture: TextureFingerprint | undefined;
  baseSampleInfluence: number;
  baseStyleInfluence: number;
  baseWeirdness: number;
  manifest: ManifestRecord;
  energy?: number;
};

const buildWindowTexture = ({
  window,
  planWindowMap,
  helix,
  helixPeaks,
  baseKbTexture,
  baseSampleInfluence,
  baseStyleInfluence,
  baseWeirdness,
  manifest,
  energy,
}: WindowTextureRequest) => {
  const planWindow = resolvePlanWindow(planWindowMap, window);
  const textureConfig = planWindow?.texture;
  const energyLevel = resolveEnergyAmount(energy);
  const sampleInfluence = clamp01(
    textureConfig?.sampleInfluence ??
      applyEnergyToInfluence(baseSampleInfluence, energyLevel, 0.2),
  );
  const styleInfluence = clamp01(
    textureConfig?.styleInfluence ??
      applyEnergyToInfluence(baseStyleInfluence, energyLevel, -0.15),
  );
  const weirdness = clamp01(
    textureConfig?.weirdness ??
      applyEnergyToInfluence(baseWeirdness, energyLevel, 0.25),
  );
  const kbTexture = resolvePlanKbTexture(
    textureConfig?.kbTexture,
    manifest,
    baseKbTexture,
  );
  const seed = computeSeed(helix, sampleInfluence, styleInfluence, weirdness);
  return textureFrom(helixPeaks, kbTexture, {
    sampleInfluence,
    styleInfluence,
    weirdness,
    seed,
    eqPeaks: textureConfig?.eqPeaks,
    fx: textureConfig?.fx,
  });
};

type ScheduleMaterialAtomsParams = {
  context: OfflineAudioContext;
  material: RenderPlanWindow["material"];
  audioAtoms: AudioAtomBank;
  destination: AudioNode;
  durationSec: number;
};

const scheduleMaterialAtoms = ({
  context,
  material,
  audioAtoms,
  destination,
  durationSec,
}: ScheduleMaterialAtomsParams) => {
  const buffers = resolveMaterialBuffers(material, audioAtoms);
  if (!buffers.length) return;

  const playbackRate = resolveMaterialPlaybackRate(material);
  const spacingSec = durationSec / Math.max(1, buffers.length + 1);
  const gainValue = clamp(0.25 / Math.sqrt(buffers.length), 0.05, 0.35);

  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = buffers[index];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(destination);

    const startAt = Math.min(
      spacingSec * index,
      Math.max(0, durationSec - 0.01),
    );
    const remaining = Math.max(0.01, durationSec - startAt);
    const effectiveDuration = buffer.duration / Math.max(0.01, playbackRate);
    if (effectiveDuration < remaining) {
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
    }
    source.start(startAt, 0, remaining);
  }
};

type MidiNoteEvent = {
  startBeat: number;
  durationBeats: number;
  pitch: number;
  velocity: number;
};

type SynthSettings = {
  waveform: OscillatorType;
  detune: number;
  attackSec: number;
  decaySec: number;
  sustain: number;
  releaseSec: number;
  gain: number;
};

type SamplerSettings = {
  gain: number;
  detune: number;
  attackSec: number;
  releaseSec: number;
};

type SamplerEntry = {
  note: number;
  rootNote: number;
  buffer: AudioBuffer;
  gain: number;
  startSec: number;
  endSec: number;
};

type SamplerPlan = {
  settings: SamplerSettings;
  entries: SamplerEntry[];
};

const DEFAULT_MIDI_VELOCITY = 0.8;
const DEFAULT_MIDI_GAIN = 0.18;
const DEFAULT_MIDI_GATE = 0.85;
const DEFAULT_QUANTIZE_BEATS = 0.25;
const DEFAULT_SAMPLE_GAIN = 0.55;
const DEFAULT_SAMPLE_ATTACK_SEC = 0.008;
const DEFAULT_SAMPLE_RELEASE_SEC = 0.14;
const DEFAULT_SAMPLE_ROOT_NOTE = 60;

const parseStepBeats = (value: string | number | undefined, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const fraction = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fraction) {
      const num = Number(fraction[1]);
      const den = Number(fraction[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return (4 * num) / den;
      }
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
};

const resolveLoopBeats = (motif: MidiMotif, beatsPerBar: number) => {
  if (typeof motif.lengthBeats === "number" && motif.lengthBeats > 0) {
    return motif.lengthBeats;
  }
  if (typeof motif.bars === "number" && motif.bars > 0) {
    return motif.bars * beatsPerBar;
  }
  let maxEnd = 0;
  for (const note of motif.notes) {
    const end = note.startBeat + note.durationBeats;
    if (Number.isFinite(end)) {
      maxEnd = Math.max(maxEnd, end);
    }
  }
  return maxEnd > 0 ? maxEnd : beatsPerBar * 4;
};

const quantizeBeat = (value: number, grid: number) => {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
};

const applySwing = (value: number, grid: number, swing: number) => {
  if (grid <= 0 || swing <= 0) return value;
  const index = Math.round(value / grid);
  if (index % 2 === 1) {
    return value + grid * clamp01(swing) * 0.5;
  }
  return value;
};

const quantizeDuration = (value: number, grid: number) => {
  if (grid <= 0) return Math.max(0.05, value);
  return Math.max(grid * 0.25, Math.round(value / grid) * grid);
};

const buildArpPattern = (pitches: number[], mode: string | undefined) => {
  if (!pitches.length) return [];
  const unique = Array.from(new Set(pitches)).sort((a, b) => a - b);
  if (mode === "down") return unique.slice().reverse();
  if (mode === "updown") {
    const up = unique.slice();
    const down = unique.slice(1, -1).reverse();
    return up.concat(down.length ? down : up);
  }
  return unique;
};

const resolveSynthSettings = (motif: MidiMotif): SynthSettings => {
  const waveformRaw = motif.synth?.waveform;
  const waveform =
    waveformRaw === "sine" ||
    waveformRaw === "triangle" ||
    waveformRaw === "square" ||
    waveformRaw === "sawtooth"
      ? waveformRaw
      : "triangle";
  const detune = clampNumber(motif.synth?.detune ?? 0, -1200, 1200);
  const attackSec = clampNumber((motif.synth?.attackMs ?? 8) / 1000, 0.001, 1);
  const decaySec = clampNumber((motif.synth?.decayMs ?? 80) / 1000, 0.001, 1);
  const sustain = clamp01(motif.synth?.sustain ?? 0.6);
  const releaseSec = clampNumber((motif.synth?.releaseMs ?? 120) / 1000, 0.001, 2);
  const gain = clamp01(motif.synth?.gain ?? DEFAULT_MIDI_GAIN);
  return { waveform, detune, attackSec, decaySec, sustain, releaseSec, gain };
};

const resolveSamplerSettings = (motif: MidiMotif): SamplerSettings => {
  const sampler = motif.sampler;
  const attackMs =
    typeof sampler?.attackMs === "number"
      ? sampler.attackMs
      : DEFAULT_SAMPLE_ATTACK_SEC * 1000;
  const releaseMs =
    typeof sampler?.releaseMs === "number"
      ? sampler.releaseMs
      : DEFAULT_SAMPLE_RELEASE_SEC * 1000;
  return {
    gain: clampNumber(sampler?.gain ?? DEFAULT_SAMPLE_GAIN, 0, 2),
    detune: 0,
    attackSec: clampNumber(attackMs / 1000, 0.001, 2),
    releaseSec: clampNumber(releaseMs / 1000, 0.01, 3),
  };
};

const buildSamplerEntries = (
  motif: MidiMotif,
  audioAtoms: AudioAtomBank,
): SamplerEntry[] => {
  const sampler = motif.sampler;
  if (!sampler) return [];
  const entries: SamplerEntry[] = [];
  const baseStartMs =
    typeof sampler.startMs === "number" ? sampler.startMs : 0;
  const baseEndMs =
    typeof sampler.endMs === "number" ? sampler.endMs : undefined;
  const addEntry = (params: {
    sourceId: string;
    note: number;
    rootNote: number;
    gain?: number;
    startMs?: number;
    endMs?: number;
  }) => {
    const key = normalizeMaterialKey(params.sourceId);
    if (!key) return;
    const buffer = audioAtoms.get(key);
    if (!buffer) return;
    const startMs = params.startMs ?? baseStartMs;
    const endMs =
      params.endMs ?? baseEndMs ?? Math.max(0, buffer.duration * 1000);
    const startSec = clampNumber(startMs / 1000, 0, buffer.duration);
    const endSec = clampNumber(endMs / 1000, startSec, buffer.duration);
    if (!(endSec > startSec)) return;
    const note = clampNumber(params.note, 0, 127);
    const rootNote = clampNumber(params.rootNote, 0, 127);
    entries.push({
      note,
      rootNote,
      buffer,
      gain: clampNumber(params.gain ?? 1, 0, 2),
      startSec,
      endSec,
    });
  };
  if (Array.isArray(sampler.map) && sampler.map.length) {
    for (const entry of sampler.map) {
      if (!entry?.sourceId) continue;
      const note = clampNumber(entry.note, 0, 127);
      addEntry({
        sourceId: entry.sourceId,
        note,
        rootNote:
          typeof entry.rootNote === "number"
            ? entry.rootNote
            : note,
        gain: entry.gain,
        startMs: entry.startMs,
        endMs: entry.endMs,
      });
    }
  }
  if (!entries.length && sampler.sourceId) {
    const rootNote =
      typeof sampler.rootNote === "number"
        ? sampler.rootNote
        : DEFAULT_SAMPLE_ROOT_NOTE;
    addEntry({
      sourceId: sampler.sourceId,
      note: rootNote,
      rootNote,
      startMs: sampler.startMs,
      endMs: sampler.endMs,
    });
  }
  return entries;
};

const pickSamplerEntry = (
  entries: SamplerEntry[],
  pitch: number,
): SamplerEntry | null => {
  if (!entries.length) return null;
  let best = entries[0];
  let bestDelta = Math.abs(pitch - best.note);
  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i];
    const delta = Math.abs(pitch - entry.note);
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best;
};

const resolveGrooveGrid = (
  groove: GrooveTemplate | null | undefined,
  fallbackGrid: number,
) => parseStepBeats(groove?.grid, fallbackGrid);

const applyGrooveTemplate = (
  events: MidiNoteEvent[],
  groove: GrooveTemplate | null | undefined,
  grid: number,
) => {
  if (!groove) return events;
  const offsets = groove.offsets ?? [];
  const velocities = groove.velocities ?? [];
  const swing = clamp01(groove.swing ?? 0);
  const stepBeats = resolveGrooveGrid(groove, grid);
  if (stepBeats <= 0) return events;
  if (!offsets.length && !velocities.length && swing <= 0) return events;
  return events.map((event) => {
    let startBeat = event.startBeat;
    if (swing > 0) {
      startBeat = applySwing(startBeat, stepBeats, swing);
    }
    if (offsets.length) {
      const index = Math.floor(startBeat / stepBeats) % offsets.length;
      const offset = clamp(offsets[index] ?? 0, -0.5, 0.5) * stepBeats;
      startBeat = Math.max(0, startBeat + offset);
    }
    let velocity = event.velocity;
    if (velocities.length) {
      const index = Math.floor(startBeat / stepBeats) % velocities.length;
      const scale = clamp(velocities[index] ?? 1, 0, 2);
      velocity = clamp01(velocity * scale);
    }
    return { ...event, startBeat, velocity };
  });
};

type MacroState = {
  gain?: number;
  detune?: number;
  attackSec?: number;
  decaySec?: number;
  releaseSec?: number;
  sustain?: number;
};

const resolveMacroValue = (
  curve: MacroCurve,
  beat: number,
  windowBeats: number,
) => {
  const points = curve.points ?? [];
  if (!points.length) return null;
  const maxBeat = windowBeats > 0 ? windowBeats : points[points.length - 1].beat;
  const localBeat = maxBeat > 0 ? beat % maxBeat : beat;
  if (localBeat <= points[0].beat) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (localBeat <= next.beat) {
      const span = Math.max(0.0001, next.beat - prev.beat);
      const t = clamp01((localBeat - prev.beat) / span);
      return prev.value + (next.value - prev.value) * t;
    }
  }
  return points[points.length - 1].value;
};

const resolveMacroState = (
  curves: MacroCurve[] | undefined,
  beat: number,
  windowBeats: number,
): MacroState => {
  const state: MacroState = {};
  if (!curves?.length) return state;
  for (const curve of curves) {
    const value = resolveMacroValue(curve, beat, windowBeats);
    if (value == null) continue;
    switch (curve.target) {
      case "gain":
        state.gain = value;
        break;
      case "detune":
        state.detune = value;
        break;
      case "attackMs":
        state.attackSec = value / 1000;
        break;
      case "decayMs":
        state.decaySec = value / 1000;
        break;
      case "releaseMs":
        state.releaseSec = value / 1000;
        break;
      case "sustain":
        state.sustain = value;
        break;
    }
  }
  return state;
};

const applyMacroState = (base: SynthSettings, state: MacroState): SynthSettings => {
  const gainMultiplier =
    typeof state.gain === "number" ? clamp(state.gain, 0, 2) : 1;
  const detuneOffset =
    typeof state.detune === "number" ? clamp(state.detune, -1200, 1200) : 0;
  const attackSec =
    typeof state.attackSec === "number"
      ? clamp(state.attackSec, 0.001, 2)
      : base.attackSec;
  const decaySec =
    typeof state.decaySec === "number"
      ? clamp(state.decaySec, 0.001, 2)
      : base.decaySec;
  const releaseSec =
    typeof state.releaseSec === "number"
      ? clamp(state.releaseSec, 0.001, 3)
      : base.releaseSec;
  const sustain =
    typeof state.sustain === "number" ? clamp01(state.sustain) : base.sustain;
  return {
    ...base,
    detune: clamp(base.detune + detuneOffset, -1200, 1200),
    gain: clamp01(base.gain * gainMultiplier),
    attackSec,
    decaySec,
    releaseSec,
    sustain,
  };
};

const applyMacroStateToSampler = (
  base: SamplerSettings,
  state: MacroState,
): SamplerSettings => {
  const gainMultiplier =
    typeof state.gain === "number" ? clamp(state.gain, 0, 2) : 1;
  const detuneOffset =
    typeof state.detune === "number" ? clamp(state.detune, -1200, 1200) : 0;
  const attackSec =
    typeof state.attackSec === "number"
      ? clamp(state.attackSec, 0.001, 2)
      : base.attackSec;
  const releaseSec =
    typeof state.releaseSec === "number"
      ? clamp(state.releaseSec, 0.01, 3)
      : base.releaseSec;
  return {
    ...base,
    detune: clamp(base.detune + detuneOffset, -1200, 1200),
    gain: clamp(base.gain * gainMultiplier, 0, 2),
    attackSec,
    releaseSec,
  };
};

const buildMotifEvents = (
  motif: MidiMotif,
  tempo: TempoMeta,
  windowBars: number,
  material: RenderPlanWindow["material"] | undefined,
  grooveTemplate: GrooveTemplate | null | undefined,
): { events: MidiNoteEvent[]; loopBeats: number } => {
  const beatsPerBar = Number(tempo.timeSig.split("/")[0] || "4");
  const windowBeats = windowBars * beatsPerBar;
  const grid = parseStepBeats(motif.quantize, DEFAULT_QUANTIZE_BEATS);
  const swing = clamp01(motif.swing ?? 0);
  const stretch = clampNumber(material?.timeStretch ?? 1, 0.25, 4);
  const transpose = clampNumber(material?.transposeSemitones ?? 0, -24, 24);
  const loopBeats = resolveLoopBeats(motif, beatsPerBar) * stretch;

  const events: MidiNoteEvent[] = [];
  const avgVelocity =
    motif.notes.reduce((acc, note) => acc + (note.velocity ?? DEFAULT_MIDI_VELOCITY), 0) /
    Math.max(1, motif.notes.length);

  if (motif.arp) {
    const octaveCount = clampNumber(motif.arp.octaves ?? 1, 1, 4);
    const chordPitches: number[] = [];
    for (const note of motif.notes) {
      chordPitches.push(note.pitch);
    }
    const basePattern = buildArpPattern(chordPitches, motif.arp.mode);
    const arpPattern: number[] = [];
    for (let octave = 0; octave < octaveCount; octave += 1) {
      for (const pitch of basePattern) {
        arpPattern.push(pitch + octave * 12);
      }
    }
    if (!arpPattern.length) {
      arpPattern.push(60);
    }
    const rateBeats = parseStepBeats(motif.arp.rate, grid);
    const gate = clampNumber(motif.arp.gate ?? DEFAULT_MIDI_GATE, 0.05, 1);
    const steps = Math.max(1, Math.ceil(loopBeats / rateBeats));
    for (let step = 0; step < steps; step += 1) {
      const baseStart = step * rateBeats;
      const startBeat = applySwing(baseStart, rateBeats, swing);
      const durationBeats = Math.max(0.05, rateBeats * gate);
      const pitch = arpPattern[step % arpPattern.length] + transpose;
      events.push({
        startBeat,
        durationBeats,
        pitch,
        velocity: clamp01(avgVelocity),
      });
    }
  } else {
    for (const note of motif.notes) {
      const startBeat = applySwing(
        quantizeBeat(note.startBeat, grid),
        grid,
        swing,
      );
      const durationBeats = quantizeDuration(note.durationBeats, grid);
      events.push({
        startBeat,
        durationBeats,
        pitch: note.pitch + transpose,
        velocity: clamp01(note.velocity ?? DEFAULT_MIDI_VELOCITY),
      });
    }
  }

  const repeated: MidiNoteEvent[] = [];
  if (loopBeats <= 0 || windowBeats <= 0) {
    return { events: [], loopBeats: Math.max(loopBeats, 1) };
  }
  const loops = Math.max(1, Math.ceil(windowBeats / loopBeats));
  for (let loop = 0; loop < loops; loop += 1) {
    const offset = loop * loopBeats;
    for (const event of events) {
      const startBeat = event.startBeat + offset;
      if (startBeat >= windowBeats) continue;
      repeated.push({ ...event, startBeat });
    }
  }
  const grooved = applyGrooveTemplate(repeated, grooveTemplate, grid);
  return { events: grooved, loopBeats };
};

const scheduleSynthNote = (
  context: OfflineAudioContext,
  destination: AudioNode,
  startSec: number,
  durationSec: number,
  pitch: number,
  velocity: number,
  synth: SynthSettings,
) => {
  if (!Number.isFinite(startSec) || !Number.isFinite(durationSec)) return;
  const safeDuration = Math.max(0.02, durationSec);
  const noteEnd = startSec + safeDuration;
  const attackEnd = startSec + synth.attackSec;
  const decayEnd = attackEnd + synth.decaySec;
  const releaseStart = Math.max(decayEnd, noteEnd - synth.releaseSec);

  const osc = context.createOscillator();
  osc.type = synth.waveform;
  osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
  if (synth.detune) {
    osc.detune.value = synth.detune;
  }

  const gain = context.createGain();
  const baseGain = clamp01(velocity) * synth.gain;
  gain.gain.setValueAtTime(0, startSec);
  gain.gain.linearRampToValueAtTime(baseGain, attackEnd);
  gain.gain.linearRampToValueAtTime(baseGain * synth.sustain, decayEnd);
  gain.gain.setValueAtTime(baseGain * synth.sustain, releaseStart);
  gain.gain.linearRampToValueAtTime(0, noteEnd);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(startSec);
  osc.stop(noteEnd + 0.05);
};

const scheduleSamplerNote = (
  context: OfflineAudioContext,
  destination: AudioNode,
  entry: SamplerEntry,
  startSec: number,
  durationSec: number,
  pitch: number,
  velocity: number,
  settings: SamplerSettings,
) => {
  if (!Number.isFinite(startSec) || !Number.isFinite(durationSec)) return;
  const safeStart = Math.max(0, startSec);
  const baseDuration = Math.max(0.02, durationSec);
  const pitchOffset = pitch - entry.rootNote;
  const playbackRate = clamp(Math.pow(2, pitchOffset / 12), 0.25, 4);
  const segmentDuration = Math.max(0.01, entry.endSec - entry.startSec);
  const segmentPlayDuration = segmentDuration / playbackRate;
  const shouldLoop =
    segmentDuration > 0.05 && baseDuration > segmentPlayDuration + 0.02;
  const noteDuration = shouldLoop
    ? baseDuration
    : Math.min(baseDuration, segmentPlayDuration);
  const noteEnd = safeStart + noteDuration;
  const attackSec = Math.min(settings.attackSec, noteDuration * 0.6);
  const releaseSec = Math.min(settings.releaseSec, noteDuration * 0.8);
  const attackEnd = safeStart + attackSec;
  const releaseStart = Math.max(attackEnd, noteEnd - releaseSec);

  const source = context.createBufferSource();
  source.buffer = entry.buffer;
  source.playbackRate.value = playbackRate;
  if (settings.detune) {
    source.detune.value = settings.detune;
  }
  if (shouldLoop) {
    source.loop = true;
    source.loopStart = entry.startSec;
    source.loopEnd = entry.endSec;
  }

  const gain = context.createGain();
  const baseGain = clamp(
    settings.gain * entry.gain * clamp01(velocity),
    0,
    1.5,
  );
  gain.gain.setValueAtTime(0, safeStart);
  gain.gain.linearRampToValueAtTime(baseGain, attackEnd);
  gain.gain.setValueAtTime(baseGain, releaseStart);
  gain.gain.linearRampToValueAtTime(0, noteEnd);

  source.connect(gain);
  gain.connect(destination);
  source.start(safeStart, entry.startSec);
  source.stop(noteEnd + 0.05);
};

type ScheduleMidiMotifsParams = {
  context: OfflineAudioContext;
  material: RenderPlanWindow["material"];
  midiMotifs: MidiMotifBank;
  audioAtoms?: AudioAtomBank;
  destination: AudioNode;
  durationSec: number;
  tempo: TempoMeta;
  windowBars: number;
  grooveTemplate?: GrooveTemplate | null;
  macroCurves?: MacroCurve[];
};

const scheduleMidiMotifs = ({
  context,
  material,
  midiMotifs,
  audioAtoms,
  destination,
  durationSec,
  tempo,
  windowBars,
  grooveTemplate,
  macroCurves,
}: ScheduleMidiMotifsParams) => {
  if (!material?.midiMotifIds?.length || midiMotifs.size === 0) return;
  const beatSeconds = 60 / tempo.bpm;
  const beatsPerBar = Number(tempo.timeSig.split("/")[0] || "4");
  const windowBeats = Math.max(1, windowBars * beatsPerBar);
  const synthCache = new Map<MidiMotif, SynthSettings>();
  const samplerCache = new Map<MidiMotif, SamplerPlan | null>();
  for (const rawId of material.midiMotifIds) {
    const key = normalizeMaterialKey(rawId);
    if (!key) continue;
    const motif = midiMotifs.get(key);
    if (!motif) continue;
    const { events } = buildMotifEvents(
      motif,
      tempo,
      windowBars,
      material,
      grooveTemplate,
    );
    if (!events.length) continue;
    let samplerPlan: SamplerPlan | null = null;
    if (audioAtoms && audioAtoms.size && motif.sampler) {
      samplerPlan = samplerCache.get(motif) ?? null;
      if (samplerPlan === null && !samplerCache.has(motif)) {
        const entries = buildSamplerEntries(motif, audioAtoms);
        samplerPlan = entries.length
          ? { entries, settings: resolveSamplerSettings(motif) }
          : null;
        samplerCache.set(motif, samplerPlan);
      }
    }
    let synth = synthCache.get(motif);
    if (!synth && !samplerPlan) {
      synth = resolveSynthSettings(motif);
      synthCache.set(motif, synth);
    }
    for (const event of events) {
      const startSec = event.startBeat * beatSeconds;
      if (startSec >= durationSec) continue;
      const noteDurationSec = event.durationBeats * beatSeconds;
      const remaining = Math.max(0.02, durationSec - startSec);
      const clampedDuration = Math.min(noteDurationSec, remaining);
      const macroState = resolveMacroState(macroCurves, event.startBeat, windowBeats);
      if (samplerPlan) {
        const entry = pickSamplerEntry(samplerPlan.entries, event.pitch);
        if (!entry) continue;
        const samplerSettings = applyMacroStateToSampler(
          samplerPlan.settings,
          macroState,
        );
        scheduleSamplerNote(
          context,
          destination,
          entry,
          startSec,
          clampedDuration,
          event.pitch,
          event.velocity,
          samplerSettings,
        );
      } else if (synth) {
        const synthForEvent = applyMacroState(synth, macroState);
        scheduleSynthNote(
          context,
          destination,
          startSec,
          clampedDuration,
          event.pitch,
          event.velocity,
          synthForEvent,
        );
      }
    }
  }
};

const resolveMaterialPlaybackRate = (
  material: RenderPlanWindow["material"],
) => {
  const semitones = clampNumber(material?.transposeSemitones ?? 0, -24, 24);
  const stretch = clampNumber(material?.timeStretch ?? 1, 0.25, 4);
  const rate = Math.pow(2, semitones / 12) / stretch;
  return clamp(rate, 0.25, 4);
};

const resolveMaterialBuffers = (
  material: RenderPlanWindow["material"],
  audioAtoms: AudioAtomBank,
) => {
  const ids: string[] = [];
  if (Array.isArray(material?.audioAtomIds)) {
    ids.push(...material.audioAtomIds);
  }
  if (Array.isArray(material?.midiMotifIds)) {
    ids.push(...material.midiMotifIds);
  }
  const buffers: AudioBuffer[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = normalizeMaterialKey(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const buffer = audioAtoms.get(key);
    if (buffer) {
      buffers.push(buffer);
    }
  }
  return buffers;
};

function windowToSeconds(window: BarWindow, tempo: TempoMeta) {
  const beatsPerBar = Number.parseInt(tempo.timeSig.split("/")[0] || "4", 10);
  const msPerBeat = 60_000 / tempo.bpm;
  const msPerBar = msPerBeat * beatsPerBar;
  const startTimeMs = tempo.offsetMs + (window.startBar - 1) * msPerBar;
  const durationMs = (window.endBar - window.startBar) * msPerBar;
  return {
    startTimeSec: Math.max(0, startTimeMs / 1000),
    durationSec: Math.max(0.01, durationMs / 1000),
  };
}

function extractHelixPeaks(packet: HelixPacket | undefined | null) {
  if (!packet?.peaks?.length) return [];
  return packet.peaks.map((peak) => ({
    f: clampNumber((peak.omega ?? 0) / (2 * Math.PI), 40, 19_500),
    q: clampNumber(1 / Math.max(0.001, peak.gamma ?? 0.4), 0.2, 18),
    gain: clamp01((peak.alpha ?? 0.2) * 0.8 + 1),
  }));
}

function computeSeed(
  helix: HelixPacket | undefined,
  sampleInfluence: number,
  styleInfluence: number,
  weirdness: number,
): number {
  let seed = 0x9e3779b1;
  if (helix?.seed) {
    seed ^= hashString(helix.seed);
  }
  if (typeof helix?.branch === "number") {
    seed ^= Math.trunc(helix.branch * 0x9e3779b97f4a7c15) & 0xffffffff;
  }
  seed ^= Math.trunc(sampleInfluence * 1_000_003);
  seed ^= Math.trunc(styleInfluence * 1_000_033);
  seed ^= Math.trunc(weirdness * 1_000_079);
  return seed >>> 0;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function resolveEnergyAmount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp01(value);
}

function applyEnergyToInfluence(
  base: number,
  energy: number | null,
  scale: number,
) {
  if (energy == null) return base;
  return base + (energy - 0.5) * scale;
}

function resolveFxAmount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp01(value);
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function clampNumber(value: number, min: number, max: number) {
  return clamp(Number(value) || 0, min, max);
}

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

export {};
