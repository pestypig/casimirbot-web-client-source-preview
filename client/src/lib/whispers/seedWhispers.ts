import type { TLumaContext, TLumaWhisper } from "@shared/whispers";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { normalizeHash } from "./hashes";
import { ETHOS_SEEDS } from "./seedWhispers-ethos";

type Tone = "quiet" | "warn" | "celebrate";

export type WhisperSeed = {
  id: string;
  hashes: string[];
  tone: Tone;
  title: string;
  body: string;
  action?: string;
  mode?: "bubble" | "speak" | "both";
  tags?: string[];
  deepen?: { label: string; href: string }[];
  when(ctx: CombinedContext): boolean;
  score(ctx: CombinedContext): number;
};

type SpectrumContext = {
  a_eff_nm?: number;
  showGeom?: boolean;
  showDCE?: boolean;
  showTimeLoop?: boolean;
  etaDCE?: number;
  sectors?: number;
  effDuty?: number;
  duty?: number;
  gamma_geo?: number;
  qSpoilingFactor?: number;
  qCavity?: number;
  badge984?: boolean;
};

type SweepContext = {
  subThresholdMargin?: number;
  rho?: number;
  rhoCutoff?: number;
  phaseWindows?: number;
  depthViolation?: boolean;
  clipped?: boolean;
  jitterCollapse?: boolean;
  jitterSamples?: number;
};

type EnergyContext = {
  dutyEffectiveFR?: number;
  sectorCount?: number;
  gammaGeo?: number;
  gammaVanDenBroeck?: number;
  zeta?: number;
  qSpoilingFactor?: number;
  qCavity?: number;
  tsRatio?: number;
};

type CombinedContext = {
  hash: string;
  spectrum?: SpectrumContext;
  sweep?: SweepContext;
  energy?: EnergyContext;
  signals?: TLumaContext["signals"];
  pipeline?: EnergyPipelineState | null;
};

export type SeedEvaluationContext = {
  hash: string;
  signals?: TLumaContext["signals"];
  pipeline?: EnergyPipelineState | null;
  panelCtx?: Record<string, unknown> | null;
  pinned?: boolean;
};

const TONE_TO_SEVERITY: Record<Tone, TLumaWhisper["severity"]> = {
  quiet: "hint",
  warn: "warn",
  celebrate: "info",
};

const MAX_SEEDS_PER_PANEL = 4;

const near = (x: number | undefined, y: number, eps = 5e-4) =>
  typeof x === "number" && Number.isFinite(x) && Math.abs(x - y) <= eps;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const BASE_SEEDS: WhisperSeed[] = [
  {
    id: "S-0984",
    hashes: ["#spectrum"],
    tone: "celebrate",
    title: "Cutoff kissed",
    body:
      "The bowl fits the sky. Geometry set the horizon (lambda_cut = 2*a_eff); hold Q and ports steady while you savor the gain.",
    tags: ["geometry", "cutoff", "moral"],
    when: (ctx) => near(ctx.spectrum?.a_eff_nm, 0.984),
    score: () => 0.9,
  },
  {
    id: "S-DCE-RINGS",
    hashes: ["#spectrum"],
    tone: "quiet",
    title: "Sidebands aligned",
    body:
      "Omega ≈ 2·f0 and η_DCE is carrying pair gain—hold the bias here and skip the ripples past cutoff.",
    tags: ["dce", "sidebands"],
    when: (ctx) => Boolean(ctx.spectrum?.showDCE) && (ctx.spectrum?.etaDCE ?? 0) > 0.15,
    score: (ctx) => {
      const eta = ctx.spectrum?.etaDCE ?? 0;
      return clamp01(eta / 0.4);
    },
  },
  {
    id: "S-TIME-LOOP",
    hashes: ["#spectrum", "#energy"],
    tone: "quiet",
    title: "Average the river",
    body:
      "Sectoring changes the timing average. A large TS ratio is a timing diagnostic; it does not verify the stress tensor or GR closure.",
    tags: ["duty", "ts", "proxy"],
    when: (ctx) => {
      const sectors = ctx.energy?.sectorCount ?? ctx.spectrum?.sectors ?? 0;
      const effDuty = ctx.energy?.dutyEffectiveFR ?? ctx.spectrum?.effDuty ?? 0;
      return sectors >= 200 && effDuty > 0 && effDuty < 3e-5;
    },
    score: () => 0.6,
  },
  {
    id: "P-MARGIN-THIN",
    hashes: ["#sweep"],
    tone: "warn",
    title: "Leaf's edge",
    body:
      "On the leaf's edge, step softer. Sub-threshold headroom is thin--nudge phi or m to rebuild margin before exploring further.",
    tags: ["safety", "phi", "depth"],
    when: (ctx) => {
      const margin = ctx.sweep?.subThresholdMargin;
      return typeof margin === "number" && margin <= 0.02 && margin >= 0;
    },
    score: (ctx) => {
      const margin = ctx.sweep?.subThresholdMargin ?? 0.02;
      return clamp01((0.02 - margin) / 0.02);
    },
  },
  {
    id: "P-RHO-GUARD",
    hashes: ["#sweep"],
    tone: "warn",
    title: "Wanting is not the path",
    body:
      "rho is pressing the guard. Back off depth or raise Q; stable kappa comes from margin, not insistence.",
    tags: ["rho", "guardrail"],
    when: (ctx) => {
      const rho = ctx.sweep?.rho;
      return typeof rho === "number" && rho >= 0.45;
    },
    score: (ctx) => {
      const rho = ctx.sweep?.rho ?? 0.45;
      const cutoff = ctx.sweep?.rhoCutoff ?? 0.9;
      return clamp01((rho - 0.45) / Math.max(0.01, cutoff - 0.45));
    },
  },
  {
    id: "P-LW-COLLAPSE",
    hashes: ["#sweep"],
    tone: "warn",
    title: "Breath narrows",
    body:
      "Effective linewidth is collapsing. Re-center Omega near 2*f0, widen the phase window, or reduce modulation depth.",
    tags: ["linewidth", "detune", "phase"],
    when: (ctx) => Boolean(ctx.sweep?.jitterCollapse),
    score: () => 0.95,
  },
  {
    id: "P-GUARD-CLIP",
    hashes: ["#sweep"],
    tone: "quiet",
    title: "Cup is full",
    body:
      "Gain is clipped by the visual guard. Hold the plateau; use it to re-map stable phi before raising ceilings.",
    tags: ["visual", "clip"],
    when: (ctx) => Boolean(ctx.sweep?.clipped),
    score: () => 0.7,
  },
  {
    id: "P-PHI-WINDOWS",
    hashes: ["#sweep"],
    tone: "quiet",
    title: "Two doors, one room",
    body:
      "Complementary phi windows sample the same room. If one jitters, try the other to keep kappa_eff above floor.",
    tags: ["phase", "windows"],
    when: (ctx) => (ctx.sweep?.phaseWindows ?? 0) >= 2,
    score: (ctx) => clamp01(((ctx.sweep?.phaseWindows ?? 2) - 1) / 2),
  },
  {
    id: "E-GAMMA-GEO",
    hashes: ["#energy", "#spectrum"],
    tone: "quiet",
    title: "Blue-shift grace",
    body:
      "The displayed geometric gain is a modeled factor. Check the source geometry and selected-run claim locks before using it as evidence.",
    tags: ["gamma", "storage"],
    when: (ctx) => {
      const gamma = ctx.energy?.gammaGeo ?? ctx.spectrum?.gamma_geo;
      return typeof gamma === "number" && gamma >= 20;
    },
    score: () => 0.6,
  },
  {
    id: "E-PORTS-ROUGH",
    hashes: ["#energy", "#spectrum"],
    tone: "quiet",
    title: "Quiet the edges",
    body:
      "Ports and roughness sap Q. Smooth the bowl and couplers; less hiss, more song.",
    tags: ["q", "materials", "ports"],
    when: (ctx) => {
      const spoil = ctx.energy?.qSpoilingFactor ?? ctx.spectrum?.qSpoilingFactor;
      return typeof spoil === "number" && spoil < 1;
    },
    score: (ctx) => {
      const spoil = ctx.energy?.qSpoilingFactor ?? ctx.spectrum?.qSpoilingFactor ?? 1;
      return clamp01(1 - spoil);
    },
  },
  {
    id: "X-LEDGER-PROXY",
    hashes: ["#spectrum", "#sweep", "#energy"],
    tone: "quiet",
    title: "Many beats, one note",
    body:
      "TS ratio describes timing separation. Curvature and GR validity require the source tensor and closure evidence.",
    tags: ["proxy", "hf-gr"],
    when: (ctx) => (ctx.energy?.tsRatio ?? 0) > 10,
    score: (ctx) => clamp01(((ctx.energy?.tsRatio ?? 10) - 10) / 40),
  },
  {
    id: "X-PAPERS-DCE",
    hashes: ["#spectrum"],
    tone: "quiet",
    title: "Concavity keeps the breath",
    body:
      "Curved cavities store and steer the breath; start here for the geometry-amplified DCE trail.",
    deepen: [{ label: "Open papers", href: "/api/papers" }],
    tags: ["papers", "dce", "geometry"],
    when: (ctx) => Boolean(ctx.spectrum?.showGeom),
    score: () => 0.35,
  },
  {
    id: "X-POTATO",
    hashes: ["#sweep", "#energy"],
    tone: "quiet",
    title: "Nature's yardstick",
    body:
      "Compare the kappa_drive and kappa_body proxies in Theory Badge Graph, with their units and assumptions visible.",
    tags: ["yardstick", "units"],
    when: () => true,
    score: () => 0.2,
  },
];

const seeds: WhisperSeed[] = [...BASE_SEEDS, ...ETHOS_SEEDS];

function collectSpectrumContext(
  hash: string,
  panelCtx: Record<string, unknown> | null | undefined,
): SpectrumContext | undefined {
  if (hash !== "#spectrum" || !panelCtx) return undefined;
  const ctx = panelCtx as SpectrumContext;
  return {
    a_eff_nm: toNumber(ctx.a_eff_nm),
    showGeom: Boolean(ctx.showGeom),
    showDCE: Boolean(ctx.showDCE),
    showTimeLoop: Boolean(ctx.showTimeLoop),
    etaDCE: toNumber(ctx.etaDCE),
    sectors: toNumber(ctx.sectors),
    effDuty: toNumber(ctx.effDuty),
    duty: toNumber(ctx.duty),
    gamma_geo: toNumber(ctx.gamma_geo),
    qSpoilingFactor: toNumber(ctx.qSpoilingFactor),
    qCavity: toNumber(ctx.qCavity),
    badge984: Boolean(ctx.badge984),
  };
}

function collectSweepContext(
  hash: string,
  panelCtx: Record<string, unknown> | null | undefined,
): SweepContext | undefined {
  if (hash !== "#sweep" || !panelCtx) return undefined;
  const ctx = panelCtx as SweepContext;
  return {
    subThresholdMargin: toNumber(ctx.subThresholdMargin),
    rho: toNumber(ctx.rho),
    rhoCutoff: toNumber(ctx.rhoCutoff),
    phaseWindows: toNumber(ctx.phaseWindows),
    depthViolation: Boolean(ctx.depthViolation),
    clipped: Boolean(ctx.clipped),
    jitterCollapse: Boolean(ctx.jitterCollapse),
    jitterSamples: toNumber(ctx.jitterSamples),
  };
}

function collectEnergyContext(
  pipeline: EnergyPipelineState | null | undefined,
  signals: TLumaContext["signals"] | undefined,
  spectrum: SpectrumContext | undefined,
): EnergyContext | undefined {
  if (!pipeline && !signals) {
    return spectrum
      ? {
          gammaGeo: spectrum.gamma_geo,
          qSpoilingFactor: spectrum.qSpoilingFactor,
          qCavity: spectrum.qCavity,
        }
      : undefined;
  }

  const duty =
    toNumber(pipeline?.dutyEffectiveFR) ??
    toNumber(pipeline?.dutyEffective_FR) ??
    toNumber(pipeline?.dutyShip) ??
    toNumber(signals?.dutyEffectiveFR);
  const sectorCount =
    toNumber(pipeline?.sectorCount) ??
    toNumber(pipeline?.sectors) ??
    toNumber(pipeline?.sectorsTotal);
  const gammaGeo =
    toNumber(pipeline?.gammaGeo) ?? toNumber(signals?.gammaGeo) ?? spectrum?.gamma_geo;
  const gammaVanDenBroeck = toNumber(pipeline?.gammaVanDenBroeck);
  const zeta = toNumber(signals?.zeta) ?? toNumber(pipeline?.zeta);
  const qSpoilingFactor =
    toNumber(pipeline?.qSpoilingFactor) ?? toNumber(pipeline?.deltaAOverA) ?? spectrum?.qSpoilingFactor;
  const qCavity =
    toNumber(pipeline?.qCavity) ?? toNumber(signals?.qCavity) ?? spectrum?.qCavity;

  const modulationFreq_GHz =
    toNumber(pipeline?.modulationFreq_GHz) ?? toNumber(signals?.modulationFreq_GHz);
  const tauLC_s = toNumber(pipeline?.tau_LC_ms);
  const tauLC = Number.isFinite(tauLC_s) ? tauLC_s! / 1e3 : undefined;
  const period =
    Number.isFinite(modulationFreq_GHz) && modulationFreq_GHz! > 0
      ? 1 / (modulationFreq_GHz! * 1e9)
      : undefined;
  const tsRatio =
    typeof tauLC === "number" && typeof period === "number" && period > 0
      ? tauLC / period
      : undefined;

  return {
    dutyEffectiveFR: duty,
    sectorCount,
    gammaGeo,
    gammaVanDenBroeck,
    zeta,
    qSpoilingFactor,
    qCavity,
    tsRatio,
  };
}

function buildCombinedContext(ctx: SeedEvaluationContext): CombinedContext {
  const canonicalHash = normalizeHash(ctx.hash);
  const spectrum = collectSpectrumContext(canonicalHash, ctx.panelCtx);
  const sweep = collectSweepContext(canonicalHash, ctx.panelCtx);
  const energy = collectEnergyContext(ctx.pipeline, ctx.signals, spectrum);
  return {
    hash: canonicalHash,
    spectrum,
    sweep,
    energy,
    signals: ctx.signals,
    pipeline: ctx.pipeline ?? null,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeWhen(seed: WhisperSeed, ctx: CombinedContext): boolean {
  try {
    return seed.when(ctx);
  } catch (error) {
    console.warn(`[luma-whispers] seed '${seed.id}' evaluation failed`, error);
    return false;
  }
}

function toWhisper(seed: WhisperSeed): TLumaWhisper {
  const severity = TONE_TO_SEVERITY[seed.tone] ?? "hint";
  const tags = [
    `tone:${seed.tone}`,
    ...seed.hashes.map((hash) => normalizeHash(hash)),
    ...(seed.tags ?? []),
  ];
  const refs = seed.deepen?.map((item) => item.href) ?? [];

  return {
    id: seed.id,
    tags,
    hashes: seed.hashes.map((hash) => normalizeHash(hash)),
    severity,
    mode: seed.mode ?? "bubble",
    moral: seed.title,
    body: seed.body,
    action: seed.action,
    score: 0.5,
    source: "local",
    rule: {
      anyHash: seed.hashes.map((hash) => normalizeHash(hash)),
    },
    refs,
  };
}

export function scoreWhisper(
  seed: WhisperSeed,
  { hash, ctx, pinned = false }: { hash: string; ctx: CombinedContext; pinned?: boolean },
): number {
  const canonicalHash = normalizeHash(hash);
  const hashHit = seed.hashes.some((candidate) => normalizeHash(candidate) === canonicalHash) ? 1 : 0;
  if (hashHit === 0) {
    return 0;
  }

  if (!safeWhen(seed, ctx)) {
    return 0;
  }

  let baseScore = 0;
  try {
    baseScore = clamp01(seed.score(ctx));
  } catch {
    baseScore = 0;
  }

  const sHash = 0.5 * hashHit;
  const sCtx = 0.4 * baseScore;
  const sPin = 0.1 * (pinned ? 1 : 0);

  return sHash + sCtx + sPin;
}

export function evaluateSeedWhispers(ctx: SeedEvaluationContext): TLumaWhisper[] {
  const combined = buildCombinedContext(ctx);
  const canonicalHash = combined.hash;
  if (!canonicalHash) {
    return [];
  }

  const scored = seeds
    .filter((seed) => seed.hashes.some((hash) => normalizeHash(hash) === canonicalHash))
    .map((seed) => ({
      seed,
      score: scoreWhisper(seed, { hash: canonicalHash, ctx: combined, pinned: ctx.pinned }),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SEEDS_PER_PANEL);

  return scored.map(({ seed }) => toWhisper(seed));
}
