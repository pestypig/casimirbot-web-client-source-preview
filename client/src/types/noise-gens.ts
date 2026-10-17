export type Original = {
  id: string;
  title: string;
  artist: string;
  listens: number;
  duration: number;
  tempo?: TempoMeta;
  stemCount?: number;
  uploadedAt?: number;
  status?: "pending" | "ranked";
  processing?: ProcessingState;
};

export type PulseSource =
  | "drand"
  | "nist-beacon"
  | "curby"
  | "local-sky-photons";

export type TimeSkyContext = {
  publishedAt?: number;
  composedStart?: number;
  composedEnd?: number;
  timezone?: string;
  place?: string;
  placePrecision?: "exact" | "approximate" | "hidden";
  halobankSpanId?: string;
  skySignature?: string;
};

export type TimeSkyPulse = {
  source?: PulseSource;
  round?: string | number;
  pulseTime?: number;
  valueHash?: string;
  seedSalt?: string;
};

export type TimeSkyMeta = {
  context?: TimeSkyContext;
  pulse?: TimeSkyPulse;
  publishedAt?: number;
  composedStart?: number;
  composedEnd?: number;
  place?: string;
  skySignature?: string;
  pulseRound?: string | number;
  pulseHash?: string;
};

export type IntentContractRange = { min: number; max: number };

export type IntentContract = {
  version: 1;
  createdAt: number;
  updatedAt: number;
  invariants?: {
    tempoBpm?: number;
    timeSig?: TimeSig;
    key?: string;
    grooveTemplateIds?: string[];
    motifIds?: string[];
    stemLocks?: string[];
  };
  ranges?: {
    sampleInfluence?: IntentContractRange;
    styleInfluence?: IntentContractRange;
    weirdness?: IntentContractRange;
    reverbSend?: IntentContractRange;
    chorus?: IntentContractRange;
    arrangementMoves?: string[];
  };
  meaning?: {
    ideologyRootId?: string;
    allowedNodeIds?: string[];
  };
  provenancePolicy?: {
    storeTimeSky?: boolean;
    storePulse?: boolean;
    pulseSource?: PulseSource;
    placePrecision?: "exact" | "approximate" | "hidden";
  };
  notes?: string;
};

export type ListenerMacroLocks = {
  groove?: boolean;
  harmony?: boolean;
  drums?: boolean;
  bass?: boolean;
  music?: boolean;
  textures?: boolean;
  fx?: boolean;
};

export type ListenerMacros = {
  energy: number;
  space: number;
  texture: number;
  weirdness?: number;
  drive?: number;
  locks?: ListenerMacroLocks;
};

export type AbletonIntentSnapshot = {
  version: 1;
  source: {
    kind: "als" | "xml";
    fileName?: string;
  };
  createdAt: number;
  globals: {
    bpm?: number;
    timeSig?: string;
  };
  summary: {
    trackCount: number;
    audioTrackCount: number;
    midiTrackCount: number;
    returnTrackCount: number;
    groupTrackCount: number;
    deviceCount: number;
    locatorCount: number;
  };
  devices: Array<{ name: string; count: number }>;
  deviceIntent?: {
    eqPeaks?: Array<{ freq: number; q: number; gainDb: number }>;
    fx?: {
      reverbSend?: number;
      comp?: number;
      chorus?: number;
      delay?: number;
      sat?: number;
    };
    bounds?: {
      reverbSend?: { min: number; max: number };
      comp?: { min: number; max: number };
      chorus?: { min: number; max: number };
      delay?: { min: number; max: number };
      sat?: { min: number; max: number };
    };
  };
  automation?: {
    envelopeCount: number;
    pointCount: number;
    energyCurve?: Array<{ bar: number; energy: number }>;
  };
  tracks: Array<{
    name?: string;
    type: "audio" | "midi" | "return" | "group" | "master" | "unknown";
    devices: string[];
  }>;
  locators?: Array<{ name?: string; time?: number }>;
};

export type IntentSnapshotPreferences = {
  applyTempo?: boolean;
  applyMix?: boolean;
  applyAutomation?: boolean;
};

export type OriginalDetails = Original & {
  lyrics?: string;
  timeSky?: TimeSkyMeta;
  processing?: ProcessingState;
  playback?: PlaybackAsset[];
  intentSnapshot?: AbletonIntentSnapshot;
  intentSnapshotPreferences?: IntentSnapshotPreferences;
  intentContract?: IntentContract;
};

export type OriginalStem = {
  id: string;
  name: string;
  category?: string;
  mime: string;
  size: number;
  uploadedAt: number;
  waveformPeaks?: number[];
  waveformDurationMs?: number;
  sampleRate?: number;
  channels?: number;
  url: string;
};

export type PlaybackAsset = {
  id: string;
  label: string;
  codec: "aac" | "opus" | "mp3" | "wav";
  mime: string;
  size: number;
  uploadedAt: number;
  url: string;
};

export type NoisegenCapabilities = {
  ffmpeg: boolean;
  codecs: string[];
  store?: {
    backend: "fs" | "db";
  };
  storage?: {
    backend: "fs" | "replit" | "storage";
    driver?: "fs" | "s3";
  };
};

export type StemGroupSource = {
  id: string;
  codec: PlaybackAsset["codec"];
  mime: string;
  size: number;
  uploadedAt: number;
  url: string;
};

export type StemGroup = {
  id: string;
  label: string;
  category: string;
  sources: StemGroupSource[];
  defaultGain: number;
  offsetMs: number;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
};

export type StemPackStem = {
  id: string;
  name: string;
  category?: string;
  mime: string;
  size: number;
  uploadedAt: number;
  waveformDurationMs?: number;
  sampleRate?: number;
  channels?: number;
  defaultGain: number;
  offsetMs: number;
  url: string;
};

export type StemPack = {
  processing?: ProcessingState;
  groups: StemGroup[];
  stems: StemPackStem[];
};

export type ProcessingState = {
  status: JobStatus;
  detail?: string;
  updatedAt: number;
};

export type Generation = {
  id: string;
  originalId: string;
  title: string;
  mood: string;
  listens: number;
};

export type NoisegenRecipe = {
  id: string;
  name: string;
  originalId: string;
  createdAt: number;
  updatedAt: number;
  seed?: string | number;
  coverRequest: CoverJobRequest;
  notes?: string;
  featured?: boolean;
  parentId?: string;
  metrics?: {
    idi?: number;
  };
  receipt?: EditionReceipt;
};

export type EditionReceipt = {
  createdAt: number;
  contract?: {
    version?: number;
    hash?: string;
    intentSimilarity?: number;
    violations?: string[];
  };
  ideology?: {
    rootId?: string;
    allowedNodeIds?: string[];
    treeVersion?: number;
    mappingHash?: string;
  };
  provenance?: {
    timeSky?: TimeSkyMeta;
    pulse?: TimeSkyPulse;
    placePrecision?: "exact" | "approximate" | "hidden";
  };
  tools?: {
    plannerVersion?: string;
    modelVersion?: string;
    toolVersions?: Record<string, string>;
  };
};

export type MoodPreset = {
  id: string;
  label: string;
  style: number;
  sample: number;
  weird: number;
  description?: string;
};

export type RankRow = {
  id: string;
  title: string;
  listens: number;
  mood?: string;
  originalId?: string;
};

export type DragData = {
  id: string;
  title: string;
};

export type JobStatus = "queued" | "processing" | "ready" | "error";

export type ImmersionScores = import("@/lib/noise/immersion").ImmersionScores;

export type CoverEvidence = {
  idi: number;
  idiConfidence: number;
  immersion: ImmersionScores;
};

export type HelixPacket = {
  seed: string;
  rc: number;
  tau: number;
  lambda?: number;
  K: number;
  weirdness?: number;
  branch?: number;
  peaks: Array<{
    omega: number;
    gamma: number;
    alpha: number;
  }>;
};

export type TimeSig = `${number}/${number}`;

export type TempoMeta = {
  bpm: number;
  timeSig: TimeSig;
  offsetMs: number;
  barsInLoop?: number;
  quantized?: boolean;
};

export type BarWindow = {
  startBar: number;
  endBar: number;
};

export type RenderPlan = {
  global?: {
    bpm?: number;
    key?: string;
    sections?: Array<{ name: string; startBar: number; bars: number }>;
    energyCurve?: Array<{ bar: number; energy: number }>;
    locks?: ListenerMacroLocks;
    groups?: RenderPlanGroupLevels;
  };
  windows: Array<{
    startBar: number;
    bars: number;
    material?: {
      audioAtomIds?: string[];
      midiMotifIds?: string[];
      grooveTemplateIds?: string[];
      macroCurveIds?: string[];
      transposeSemitones?: number;
      timeStretch?: number;
    };
    texture?: {
      kbTexture?: string | { weights: Record<string, number> };
      sampleInfluence?: number;
      styleInfluence?: number;
      weirdness?: number;
      eqPeaks?: Array<{ freq: number; q: number; gainDb: number }>;
      fx?: {
        chorus?: number;
        sat?: number;
        reverbSend?: number;
        comp?: number;
        delay?: number;
      };
    };
  }>;
};

export type RenderPlanGroupKey = "drums" | "bass" | "music" | "textures" | "fx";
export type RenderPlanGroupLevels = Partial<Record<RenderPlanGroupKey, number>>;

export type PlanMeta = {
  plannerVersion?: string;
  modelVersion?: string | number;
  toolVersions?: Record<string, string>;
};

export type MidiNote = {
  startBeat: number;
  durationBeats: number;
  pitch: number;
  velocity?: number;
};

export type MidiMotif = {
  id?: string;
  name?: string;
  bars?: number;
  lengthBeats?: number;
  bpm?: number;
  timeSig?: TimeSig;
  swing?: number;
  quantize?: string | number;
  arp?: {
    mode?: "up" | "down" | "updown";
    rate?: string | number;
    gate?: number;
    octaves?: number;
  };
  synth?: {
    waveform?: "sine" | "triangle" | "square" | "sawtooth";
    detune?: number;
    attackMs?: number;
    decayMs?: number;
    sustain?: number;
    releaseMs?: number;
    gain?: number;
  };
  sampler?: {
    mode?: "single" | "multi";
    sourceId?: string;
    rootNote?: number;
    gain?: number;
    attackMs?: number;
    releaseMs?: number;
    startMs?: number;
    endMs?: number;
    map?: Array<{
      note: number;
      sourceId: string;
      rootNote?: number;
      gain?: number;
      startMs?: number;
      endMs?: number;
    }>;
  };
  notes: MidiNote[];
};

export type GrooveTemplate = {
  id?: string;
  name?: string;
  grid?: string | number;
  offsets?: number[];
  velocities?: number[];
  swing?: number;
};

export type MacroCurveTarget =
  | "gain"
  | "detune"
  | "attackMs"
  | "decayMs"
  | "releaseMs"
  | "sustain";

export type MacroCurvePoint = {
  beat: number;
  value: number;
};

export type MacroCurve = {
  id?: string;
  name?: string;
  target: MacroCurveTarget;
  points: MacroCurvePoint[];
};

export type KBTextureId = string;

export type KBTexture = {
  id: KBTextureId;
  name: string;
  barkProfile: number[];
  peaks?: Array<{
    f: number;
    q: number;
    gain: number;
  }>;
};

export type KBMatch = {
  kb: KBTexture;
  score: number;
  confidence: number;
};

export type CoverJobRequest = {
  originalId: string;
  barWindows: BarWindow[];
  linkHelix: boolean;
  helix?: HelixPacket;
  kbTexture?: KBTextureId | null;
  kbConfidence?: number;
  knowledgeFileIds?: string[];
  forceRemote?: boolean;
  sampleInfluence?: number;
  styleInfluence?: number;
  weirdness?: number;
  tempo?: TempoMeta;
  renderPlan?: RenderPlan;
  planMeta?: PlanMeta;
};

export type CoverJob = {
  id: string;
  status: JobStatus;
  request: CoverJobRequest;
  createdAt: number;
  updatedAt: number;
  previewUrl?: string;
  error?: string;
  evidence?: CoverEvidence;
};

export type KnowledgeAudioSource = {
  id: string;
  name: string;
  mime: string;
  url: string;
  projectId?: string;
};

export type KnowledgeMidiSource = {
  id: string;
  name: string;
  projectId?: string;
  motif: MidiMotif;
};

export type KnowledgeGrooveSource = {
  id: string;
  name: string;
  projectId?: string;
  groove: GrooveTemplate;
};

export type KnowledgeMacroSource = {
  id: string;
  name: string;
  projectId?: string;
  curves: MacroCurve[];
};

export type OriginalUpload = {
  title: string;
  creator: string;
  instrumental?: File;
  vocal?: File;
  stems?: File[];
  notes?: string;
  tempo?: TempoMeta;
};

export type NoiseFieldGateStatus = "pass" | "fail" | "unknown";

export type NoiseFieldGate = {
  status: NoiseFieldGateStatus;
  residuals: Record<string, number>;
  note?: string;
};

export type NoiseFieldConstraints = {
  laplacianRms: number;
  laplacianMaxAbs: number;
};

export type NoiseFieldThresholds = {
  laplacianRmsMax: number;
  laplacianMaxAbsMax: number;
};

export type NoiseFieldLoopAttempt = {
  iteration: number;
  accepted: boolean;
  gate: NoiseFieldGate;
  constraints: NoiseFieldConstraints;
};

export type NoiseFieldLoopRequest = {
  width?: number;
  height?: number;
  seed?: number;
  maxIterations?: number;
  stepSize?: number;
  thresholds?: Partial<NoiseFieldThresholds>;
  clamp?: { min: number; max: number };
  includeValues?: boolean;
};

export type NoiseFieldLoopResponse = {
  config: {
    width: number;
    height: number;
    seed: number;
    maxIterations: number;
    stepSize: number;
    thresholds: NoiseFieldThresholds;
    clamp?: { min: number; max: number } | null;
  };
  accepted: boolean;
  acceptedIteration: number | null;
  iterations: number;
  attempts: NoiseFieldLoopAttempt[];
  gate: NoiseFieldGate | null;
  constraints: NoiseFieldConstraints | null;
  finalState: {
    width: number;
    height: number;
    encoding: "row-major";
    values?: number[];
  };
  stats: { min: number; max: number; mean: number };
};
