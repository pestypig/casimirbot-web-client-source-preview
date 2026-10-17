import type { MirekCellKind, MirekReasoningArtifactV1 } from "@shared/helix-reasoning-mirek";
import { hash32 } from "@/lib/helix/ask-stable-hash";

export type ReasoningTheaterParticle = {
  id: string;
  leftPct: number;
  topPct: number;
  sizePx: number;
  opacity: number;
  delayS: number;
  durationS: number;
  kind: MirekCellKind;
};

export type MirekReasoningDisplayGridCell = {
  id: string;
  x: number;
  y: number;
  kind: MirekCellKind;
  active: boolean;
  semantic: boolean;
  intensity: number;
};

export type MirekReasoningDisplayGrid = {
  width: number;
  height: number;
  cells: MirekReasoningDisplayGridCell[];
};

export const REASONING_THEATER_STANCE_META: Record<
  string,
  { badge: string; bar: string; label: string }
> = {
  winning: {
    badge: "text-emerald-200",
    bar: "bg-emerald-300/80",
    label: "Winning",
  },
  contested: {
    badge: "text-sky-200",
    bar: "bg-sky-300/80",
    label: "Contested",
  },
  losing: {
    badge: "text-amber-200",
    bar: "bg-amber-300/80",
    label: "Losing",
  },
  fail_closed: {
    badge: "text-rose-200",
    bar: "bg-rose-300/80",
    label: "Fail-closed",
  },
};

export const REASONING_THEATER_ARCHETYPE_LABEL: Record<string, string> = {
  ambiguity: "ambiguity",
  missing_evidence: "missing evidence",
  coverage_gap: "coverage gap",
  contradiction: "contradiction",
  overload: "overload",
};

export const REASONING_THEATER_PHASE_LABEL: Record<string, string> = {
  observe: "observe",
  plan: "plan",
  retrieve: "retrieve",
  gate: "gate",
  synthesize: "synthesize",
  verify: "verify",
  execute: "execute",
  debrief: "debrief",
};

export const REASONING_THEATER_CERTAINTY_LABEL: Record<string, string> = {
  confirmed: "confirmed",
  reasoned: "reasoned",
  hypothesis: "hypothesis",
  unknown: "unknown",
};

export type ReasoningTheaterCertaintyClass =
  | "confirmed"
  | "reasoned"
  | "hypothesis"
  | "unknown";

export type ReasoningTheaterSuppressionReason =
  | "context_ineligible"
  | "dedupe_cooldown"
  | "mission_rate_limited"
  | "voice_rate_limited"
  | "voice_budget_exceeded"
  | "voice_backend_error"
  | "missing_evidence"
  | "contract_violation"
  | "agi_overload_admission_control";

export type ReasoningTheaterPhase =
  | "observe"
  | "plan"
  | "retrieve"
  | "gate"
  | "synthesize"
  | "verify"
  | "execute"
  | "debrief";

export type ReasoningTheaterMedal =
  | "scout"
  | "anchor"
  | "lattice"
  | "prism"
  | "fracture"
  | "stitch"
  | "relay"
  | "gate"
  | "seal"
  | "lantern"
  | "valve"
  | "crown";

export type ReasoningTheaterMedalEvent = {
  medal: ReasoningTheaterMedal;
  reason: string;
};

export type ReasoningTheaterMedalStateSnapshot = {
  stance: string;
  archetype: string;
  phase: ReasoningTheaterPhase;
  certaintyClass: ReasoningTheaterCertaintyClass;
  suppressionReason: string | null;
  ambiguityPressure: number;
  passHits: number;
  evidenceHits: number;
};

export type MirekReasoningDisplayTheaterSnapshot = {
  stance: string;
  momentum: number;
  ambiguityPressure: number;
};

const REASONING_THEATER_SUPPRESSION_PATTERNS: Array<{
  reason: ReasoningTheaterSuppressionReason;
  pattern: RegExp;
}> = [
  { reason: "context_ineligible", pattern: /context[_\s-]?ineligible|voice_context_ineligible/i },
  { reason: "dedupe_cooldown", pattern: /dedupe[_\s-]?cooldown/i },
  { reason: "mission_rate_limited", pattern: /mission[_\s-]?rate[_\s-]?limited/i },
  { reason: "voice_rate_limited", pattern: /voice[_\s-]?rate[_\s-]?limited/i },
  { reason: "voice_budget_exceeded", pattern: /voice[_\s-]?budget[_\s-]?exceeded/i },
  { reason: "voice_backend_error", pattern: /voice[_\s-]?backend[_\s-]?error/i },
  { reason: "missing_evidence", pattern: /missing[_\s-]?evidence/i },
  { reason: "contract_violation", pattern: /contract[_\s-]?violation/i },
  { reason: "agi_overload_admission_control", pattern: /agi[_\s-]?overload[_\s-]?admission[_\s-]?control/i },
];

export const REASONING_THEATER_SUPPRESSION_REASONS = new Set<ReasoningTheaterSuppressionReason>([
  "context_ineligible",
  "dedupe_cooldown",
  "mission_rate_limited",
  "voice_rate_limited",
  "voice_budget_exceeded",
  "voice_backend_error",
  "missing_evidence",
  "contract_violation",
  "agi_overload_admission_control",
]);

export function resolveReasoningTheaterSuppressionReason(
  text: string,
): ReasoningTheaterSuppressionReason | null {
  for (const entry of REASONING_THEATER_SUPPRESSION_PATTERNS) {
    if (entry.pattern.test(text)) return entry.reason;
  }
  return null;
}

export function resolveReasoningTheaterPhase(
  allText: string,
  events: Array<{ tool?: string | null | undefined }>,
): ReasoningTheaterPhase {
  const toolText = events
    .map((event) => event.tool ?? "")
    .join(" ")
    .toLowerCase();
  if (/\b(debrief|wrap[-\s]?up|final summary|final answer)\b/i.test(allText) || /\bdebrief\b/.test(toolText)) {
    return "debrief";
  }
  if (/\b(execute|run tool|action required|apply now)\b/i.test(allText) || /\bexecute\b/.test(toolText)) {
    return "execute";
  }
  if (/\b(verify|verification|proof|certificate|integrity)\b/i.test(allText) || /\bverify\b/.test(toolText)) {
    return "verify";
  }
  if (/\b(gate|gating|threshold)\b/i.test(allText) || /\bgate\b/.test(toolText)) {
    return "gate";
  }
  if (/\b(synthes|compose|assemble|combine answer)\w*/i.test(allText) || /\bsynthes/i.test(toolText)) {
    return "synthesize";
  }
  if (/\b(retrieve|search|lookup|resonance|context files?)\b/i.test(allText) || /\bretrieve|search/.test(toolText)) {
    return "retrieve";
  }
  if (/\b(plan|intent|router|strategy)\b/i.test(allText) || /\bplan|intent/.test(toolText)) {
    return "plan";
  }
  return "observe";
}

export function resolveReasoningTheaterMedal(input: {
  current: ReasoningTheaterMedalStateSnapshot;
  previous: ReasoningTheaterMedalStateSnapshot | null;
}): ReasoningTheaterMedalEvent | null {
  const { current, previous } = input;
  if (!previous) {
    if (current.phase === "retrieve") {
      return { medal: "scout", reason: "Retrieval/search engaged." };
    }
    if (current.phase === "observe" && (current.certaintyClass === "unknown" || current.certaintyClass === "hypothesis")) {
      return { medal: "lantern", reason: "Uncertainty surfaced explicitly." };
    }
    return null;
  }

  if (
    (previous.suppressionReason !== current.suppressionReason && current.suppressionReason) ||
    (previous.stance !== "fail_closed" && current.stance === "fail_closed")
  ) {
    return { medal: "seal", reason: "Constraint block/fail-closed activated." };
  }
  if (previous.archetype !== "contradiction" && current.archetype === "contradiction") {
    return { medal: "fracture", reason: "Contradiction surfaced." };
  }
  if (previous.archetype === "contradiction" && current.archetype !== "contradiction") {
    return { medal: "stitch", reason: "Contradiction reconciled." };
  }
  if (previous.archetype !== "overload" && current.archetype === "overload") {
    return { medal: "valve", reason: "Pressure handling/rate control engaged." };
  }
  if (previous.phase !== current.phase && current.phase === "retrieve") {
    return { medal: "scout", reason: "Moved into retrieval phase." };
  }
  if (
    current.evidenceHits >= previous.evidenceHits + 2 ||
    (previous.archetype === "missing_evidence" && current.archetype !== "missing_evidence")
  ) {
    return { medal: "anchor", reason: "Grounding/evidence improved." };
  }
  if (previous.archetype === "coverage_gap" && current.archetype !== "coverage_gap") {
    return { medal: "lattice", reason: "Coverage gap reduced." };
  }
  if (current.ambiguityPressure + 0.12 < previous.ambiguityPressure && current.archetype === "ambiguity") {
    return { medal: "prism", reason: "Ambiguity resolving into distinction." };
  }
  if (previous.phase !== current.phase && (current.phase === "gate" || current.phase === "verify")) {
    return { medal: "gate", reason: "Verification threshold encountered." };
  }
  if (current.passHits > previous.passHits && (current.phase === "gate" || current.phase === "verify")) {
    return { medal: "gate", reason: "Gate/verification progress recorded." };
  }
  if (previous.phase !== current.phase && (current.phase === "synthesize" || current.phase === "execute")) {
    return { medal: "relay", reason: "Reasoning relayed into next stage." };
  }
  if (
    (previous.certaintyClass !== "confirmed" &&
      current.certaintyClass === "confirmed" &&
      current.stance === "winning") ||
    (previous.phase !== "debrief" &&
      current.phase === "debrief" &&
      current.certaintyClass === "confirmed")
  ) {
    return { medal: "crown", reason: "Verified conclusion reached." };
  }
  if (
    previous.phase !== "observe" &&
    current.phase === "observe" &&
    (current.certaintyClass === "unknown" || current.certaintyClass === "hypothesis")
  ) {
    return { medal: "lantern", reason: "Observation uncertainty surfaced." };
  }
  return null;
}

export function resolveReasoningTheaterCertaintyClass(input: {
  allText: string;
  suppressionReason: string | null;
  passHits: number;
  failHits: number;
  evidenceHits: number;
  ambiguityHits: number;
}): ReasoningTheaterCertaintyClass {
  if (input.suppressionReason === "missing_evidence" || input.suppressionReason === "contract_violation") {
    return "unknown";
  }
  if (/\b(confirmed|finalized|verdict:\s*pass|integrity:\s*ok|certificate:\s*[a-f0-9]{8,})\b/i.test(input.allText)) {
    return "confirmed";
  }
  if (/\b(hypothes|maybe|possible|candidate|speculat)\w*/i.test(input.allText)) {
    return "hypothesis";
  }
  if (input.evidenceHits > 0 || input.passHits > input.failHits) {
    return "reasoned";
  }
  if (input.ambiguityHits > 0 || input.failHits > 0) {
    return "unknown";
  }
  return "reasoned";
}

export const REASONING_THEATER_SUPPRESSION_LABEL: Record<string, string> = {
  context_ineligible: "context ineligible",
  dedupe_cooldown: "dedupe cooldown",
  mission_rate_limited: "mission rate limited",
  voice_rate_limited: "voice rate limited",
  voice_budget_exceeded: "voice budget exceeded",
  voice_backend_error: "voice backend error",
  missing_evidence: "missing evidence",
  contract_violation: "contract violation",
  agi_overload_admission_control: "agi overload admission control",
};

export const REASONING_THEATER_MEDAL_LABEL: Record<string, string> = {
  scout: "Scout",
  anchor: "Anchor",
  lattice: "Lattice",
  prism: "Prism",
  fracture: "Fracture",
  stitch: "Stitch",
  relay: "Relay",
  gate: "Gate",
  seal: "Seal",
  lantern: "Lantern",
  valve: "Valve",
  crown: "Crown",
};

export const REASONING_THEATER_MEDAL_ASSET: Record<string, string> = {
  scout: "/reasoning-theater/medals/scout.svg",
  anchor: "/reasoning-theater/medals/anchor.svg",
  lattice: "/reasoning-theater/medals/lattice.svg",
  prism: "/reasoning-theater/medals/prism.svg",
  fracture: "/reasoning-theater/medals/fracture.svg",
  stitch: "/reasoning-theater/medals/stitch.svg",
  relay: "/reasoning-theater/medals/relay.svg",
  gate: "/reasoning-theater/medals/gate.svg",
  seal: "/reasoning-theater/medals/seal.svg",
  lantern: "/reasoning-theater/medals/lantern.svg",
  valve: "/reasoning-theater/medals/valve.svg",
  crown: "/reasoning-theater/medals/crown.svg",
};

export type ReasoningTheaterFrontierParticleNode = {
  id: string;
  phaseOffsetMs: number;
  baseRadiusPx: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildReasoningTheaterFrontierParticles(
  seed: number,
  count: number,
): ReasoningTheaterFrontierParticleNode[] {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  const nodes: ReasoningTheaterFrontierParticleNode[] = [];
  for (let i = 0; i < count; i += 1) {
    nodes.push({
      id: `frontier-particle-${i}`,
      phaseOffsetMs: Math.round(rng() * 1200),
      baseRadiusPx: 2 + rng() * 2.4,
    });
  }
  return nodes;
}

export function buildReasoningTheaterParticlesFromMirekArtifact(
  artifact: MirekReasoningArtifactV1,
): ReasoningTheaterParticle[] {
  const width = Math.max(1, artifact.grid.width);
  const height = Math.max(1, artifact.grid.height);
  return artifact.grid.cells.map((cell, index) => {
    const roleSize =
      cell.kind === "objective" || cell.kind === "proof" || cell.kind === "blocked"
        ? 4.4
        : cell.kind === "evidence"
          ? 3.8
          : cell.kind === "support"
            ? 2.8
            : 2.2;
    const jitter = (hash32(`${artifact.finalFrameHash}:${cell.id}:${index}`) % 9) / 10;
    return {
      id: cell.id,
      leftPct: Math.round(((cell.x + 0.5) / width) * 1000) / 10,
      topPct: Math.round(((cell.y + 0.5) / height) * 1000) / 10,
      sizePx: roleSize + jitter,
      opacity: clamp01(cell.opacity),
      delayS: (hash32(`${cell.id}:delay`) % 900) / 1000,
      durationS: 1.2 + (hash32(`${cell.id}:duration`) % 1800) / 1000,
      kind: cell.kind,
    };
  });
}

export function mirekReasoningDisplayDensity(
  artifact: MirekReasoningArtifactV1,
  theater: MirekReasoningDisplayTheaterSnapshot,
): number {
  const provenanceBase =
    artifact.source.provenanceMode === "strict_exact"
      ? 0.36
      : artifact.source.provenanceMode === "derived"
        ? 0.31
        : 0.25;
  const phaseBoost =
    artifact.state.phase === "retrieve" || artifact.state.phase === "synthesize"
      ? 0.07
      : artifact.state.phase === "verify" || artifact.state.phase === "execute"
        ? 0.04
        : 0.02;
  const pressureBoost = theater.stance === "contested" ? 0.06 : theater.stance === "fail_closed" ? -0.04 : 0;
  return clampNumber(
    provenanceBase + phaseBoost + pressureBoost + theater.momentum * 0.08 - theater.ambiguityPressure * 0.03,
    0.22,
    0.48,
  );
}

function countMirekAliveNeighbors(cells: Uint8Array, width: number, height: number, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      count += cells[ny * width + nx] ?? 0;
    }
  }
  return count;
}

export function buildMirekReasoningDisplayGrid(
  artifact: MirekReasoningArtifactV1,
  theater: MirekReasoningDisplayTheaterSnapshot,
): MirekReasoningDisplayGrid {
  const width = artifact.grid.width;
  const height = artifact.grid.height;
  const total = width * height;
  const alive = new Uint8Array(total);
  const intensity = new Float32Array(total);
  const kinds: MirekCellKind[] = Array.from({ length: total }, () => "context");
  const semantic = new Uint8Array(total);
  const density = mirekReasoningDisplayDensity(artifact, theater);
  for (let index = 0; index < total; index += 1) {
    const seedRatio = (hash32(`${artifact.finalFrameHash}:display:${index}`) % 10_000) / 10_000;
    const active = seedRatio < density;
    alive[index] = active ? 1 : 0;
    intensity[index] = active ? 0.24 + seedRatio * 0.38 : 0.05;
  }
  for (const cell of artifact.grid.cells) {
    const index = cell.y * width + cell.x;
    if (index < 0 || index >= total) continue;
    alive[index] = 1;
    semantic[index] = 1;
    kinds[index] = cell.kind;
    intensity[index] = Math.max(intensity[index] ?? 0, clamp01(0.52 + cell.opacity * 0.48));
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighborIndex = ny * width + nx;
        alive[neighborIndex] = 1;
        intensity[neighborIndex] = Math.max(intensity[neighborIndex] ?? 0, 0.28 + cell.opacity * 0.22);
      }
    }
  }

  const survive =
    artifact.state.certaintyClass === "confirmed" || artifact.state.certaintyClass === "reasoned"
      ? new Set([2, 3, 4])
      : new Set([2, 3]);
  const born =
    artifact.state.phase === "retrieve" || artifact.state.phase === "synthesize"
      ? new Set([3, 6])
      : artifact.state.phase === "verify" || artifact.state.phase === "execute"
        ? new Set([3, 4])
        : new Set([3]);
  const ticks = clampNumber(Math.round(5 + theater.momentum * 4 + theater.ambiguityPressure * 2), 4, 10);
  for (let tick = 0; tick < ticks; tick += 1) {
    const next = new Uint8Array(total);
    const nextIntensity = new Float32Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const neighbors = countMirekAliveNeighbors(alive, width, height, x, y);
        const keepSemantic = semantic[index] === 1;
        const willLive = keepSemantic || (alive[index] ? survive.has(neighbors) : born.has(neighbors));
        next[index] = willLive ? 1 : 0;
        const neighborGlow = clamp01(neighbors / 8);
        nextIntensity[index] = willLive
          ? clamp01((intensity[index] ?? 0.2) * 0.78 + 0.16 + neighborGlow * 0.18)
          : clamp01((intensity[index] ?? 0.05) * 0.55);
      }
    }
    alive.set(next);
    intensity.set(nextIntensity);
  }

  const cells: MirekReasoningDisplayGridCell[] = [];
  for (let index = 0; index < total; index += 1) {
    cells.push({
      id: `mirek-display-${index}`,
      x: index % width,
      y: Math.floor(index / width),
      kind: kinds[index] ?? "context",
      active: alive[index] === 1,
      semantic: semantic[index] === 1,
      intensity: clamp01(intensity[index] ?? 0),
    });
  }
  return { width, height, cells };
}

export function mirekCellParticleClassName(kind: MirekCellKind): string {
  switch (kind) {
    case "objective":
      return "bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.5)]";
    case "evidence":
      return "bg-emerald-200/85 shadow-[0_0_10px_rgba(110,231,183,0.45)]";
    case "support":
      return "bg-cyan-200/80 shadow-[0_0_8px_rgba(103,232,249,0.4)]";
    case "gap":
      return "bg-amber-200/85 shadow-[0_0_10px_rgba(252,211,77,0.45)]";
    case "conflict":
      return "bg-orange-300/85 shadow-[0_0_10px_rgba(253,186,116,0.45)]";
    case "proof":
      return "bg-violet-200/90 shadow-[0_0_12px_rgba(221,214,254,0.55)]";
    case "blocked":
      return "bg-rose-300/90 shadow-[0_0_12px_rgba(253,164,175,0.55)]";
    case "afterglow":
      return "bg-slate-300/45";
    case "context":
    case "empty":
    default:
      return "bg-sky-200/65 shadow-[0_0_8px_rgba(186,230,253,0.28)]";
  }
}

export function mirekCellGridClassName(kind: MirekCellKind): string {
  switch (kind) {
    case "proof":
      return "bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]";
    case "objective":
      return "bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.55)]";
    case "evidence":
      return "bg-white/85 shadow-[0_0_9px_rgba(209,250,229,0.5)]";
    case "support":
      return "bg-cyan-100/80 shadow-[0_0_8px_rgba(207,250,254,0.45)]";
    case "gap":
      return "bg-amber-100/80 shadow-[0_0_8px_rgba(254,243,199,0.45)]";
    case "conflict":
      return "bg-orange-100/80 shadow-[0_0_9px_rgba(255,237,213,0.45)]";
    case "blocked":
      return "bg-rose-100/85 shadow-[0_0_10px_rgba(255,228,230,0.5)]";
    case "afterglow":
      return "bg-white/35 shadow-[0_0_6px_rgba(255,255,255,0.25)]";
    case "context":
    case "empty":
    default:
      return "bg-white/55 shadow-[0_0_6px_rgba(255,255,255,0.3)]";
  }
}
