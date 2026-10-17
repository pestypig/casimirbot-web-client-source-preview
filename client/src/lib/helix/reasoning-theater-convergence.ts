import type { ReasoningTheaterFrontierAction } from "@/lib/helix/reasoning-theater-config";

export type ConvergenceSourceState = "atlas_exact" | "repo_exact" | "open_world" | "unknown";
export type ConvergenceProofState =
  | "confirmed"
  | "reasoned"
  | "hypothesis"
  | "unknown"
  | "fail_closed";
export type ConvergenceMaturityState =
  | "exploratory"
  | "reduced_order"
  | "diagnostic"
  | "certified";
export type ConvergenceCollapseEvent = "arbiter_commit" | "proof_commit";
export type ConvergencePhase =
  | "observe"
  | "plan"
  | "retrieve"
  | "gate"
  | "synthesize"
  | "verify"
  | "execute"
  | "debrief";

export type ConvergenceEvent = {
  id?: string;
  stage?: string;
  detail?: string;
  text?: string;
  ts?: string | number;
  tsMs?: number;
  meta?: Record<string, unknown>;
};

export type ConvergenceProof = {
  verdict?: "PASS" | "FAIL";
  certificate?: { certificateHash?: string | null; integrityOk?: boolean | null } | null;
};

export type ConvergenceDebug = {
  intent_domain?: string;
  intent_id?: string;
  arbiter_mode?: string;
  claim_tier?: string;
  math_solver_maturity?: string;
  helix_ask_fail_reason?: string | null;
};

export type ConvergenceStripState = {
  source: ConvergenceSourceState;
  proof: ConvergenceProofState;
  maturity: ConvergenceMaturityState;
  phase: ConvergencePhase;
  openWorldActive: boolean;
  ideologyAnchorNodeIds: string[];
  caption: string;
  deltaPct: number;
  canonicalSource: boolean;
  canonicalProof: boolean;
  canonicalMaturity: boolean;
  canonicalPhase: boolean;
  collapseEvent: ConvergenceCollapseEvent | null;
  collapseToken: string | null;
};

export type ConvergenceStripInput = {
  events: ConvergenceEvent[];
  frontierAction: ReasoningTheaterFrontierAction;
  frontierDeltaPct: number;
  proof?: ConvergenceProof | null;
  debug?: ConvergenceDebug | null;
  fallbackPhase?: ConvergencePhase;
};

const PHASE_ORDER: ConvergencePhase[] = [
  "observe",
  "plan",
  "retrieve",
  "gate",
  "synthesize",
  "verify",
  "execute",
  "debrief",
];

const SOURCE_LABEL: Record<ConvergenceSourceState, string> = {
  atlas_exact: "atlas exact",
  repo_exact: "repo exact",
  open_world: "open-world",
  unknown: "unknown",
};

const PROOF_LABEL: Record<ConvergenceProofState, string> = {
  confirmed: "confirmed",
  reasoned: "reasoned",
  hypothesis: "hypothesis",
  unknown: "unknown",
  fail_closed: "fail-closed",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function asClaimTier(value: unknown): ConvergenceMaturityState | null {
  const raw = readString(value).toLowerCase().replace(/[-\s]/g, "_");
  if (!raw) return null;
  if (raw === "exploratory") return "exploratory";
  if (raw === "reduced_order") return "reduced_order";
  if (raw === "diagnostic") return "diagnostic";
  if (raw === "certified") return "certified";
  return null;
}

function asPhase(value: unknown): ConvergencePhase | null {
  const raw = readString(value).toLowerCase();
  if (raw === "observe") return "observe";
  if (raw === "plan") return "plan";
  if (raw === "retrieve") return "retrieve";
  if (raw === "gate") return "gate";
  if (raw === "synthesize") return "synthesize";
  if (raw === "verify") return "verify";
  if (raw === "execute") return "execute";
  if (raw === "debrief") return "debrief";
  return null;
}

function normalizeDeltaPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function resolveLatestMeta(events: ConvergenceEvent[]): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = asRecord(events[i]?.meta);
    if (meta) return meta;
  }
  return null;
}

function resolveLatestMetaSection(
  events: ConvergenceEvent[],
  key: "retrieval" | "epistemic" | "verification" | "intent",
): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = asRecord(events[i]?.meta);
    if (!meta) continue;
    const section = asRecord(meta[key]);
    if (section) return section;
  }
  return null;
}

function readMetaAtlasHits(meta: Record<string, unknown> | null): number {
  if (!meta) return 0;
  const direct = readNumber(meta.atlasHits);
  if (direct !== null) return direct;
  const channelHits = asRecord(meta.channelHits ?? meta.retrieval_channel_hits);
  if (!channelHits) return 0;
  const atlas = readNumber(channelHits.atlas);
  return atlas ?? 0;
}

function containsOpenWorldRoute(value: string): boolean {
  return value.toLowerCase().includes("open_world");
}

function resolveSourceState(events: ConvergenceEvent[]): {
  source: ConvergenceSourceState;
  canonical: boolean;
  openWorldActive: boolean;
} {
  const retrieval = resolveLatestMetaSection(events, "retrieval");
  const latestMeta = resolveLatestMeta(events);
  const route =
    readString(retrieval?.retrievalRoute ?? retrieval?.retrieval_route) ||
    readString(latestMeta?.retrievalRoute ?? latestMeta?.retrieval_route);
  const openWorldFlag =
    readBool(retrieval?.openWorldBypassMode ?? retrieval?.open_world_bypass_mode) ??
    readBool(latestMeta?.openWorldBypassMode ?? latestMeta?.open_world_bypass_mode);
  const openWorldActive = openWorldFlag === true || containsOpenWorldRoute(route);
  if (openWorldActive) {
    return { source: "open_world", canonical: true, openWorldActive: true };
  }

  const hasExact =
    readBool(retrieval?.has_exact_provenance ?? retrieval?.hasExactProvenance) ??
    readBool(latestMeta?.has_exact_provenance ?? latestMeta?.hasExactProvenance);
  const zoneHint =
    readString(retrieval?.zone_hint ?? retrieval?.zoneHint).toLowerCase() ||
    readString(latestMeta?.zone_hint ?? latestMeta?.zoneHint).toLowerCase();
  const atlasExact =
    readBool(retrieval?.atlas_exact ?? retrieval?.atlasExact) ??
    readBool(latestMeta?.atlas_exact ?? latestMeta?.atlasExact);
  const atlasHits = readMetaAtlasHits(retrieval ?? latestMeta);

  if (hasExact === true) {
    const mapped = atlasExact === true || atlasHits > 0 || zoneHint === "mapped_connected";
    return {
      source: mapped ? "atlas_exact" : "repo_exact",
      canonical: true,
      openWorldActive: false,
    };
  }

  if (hasExact === false || retrieval !== null) {
    return { source: "unknown", canonical: true, openWorldActive: false };
  }

  return { source: "unknown", canonical: false, openWorldActive: false };
}

function resolveProofState(input: {
  events: ConvergenceEvent[];
  proof?: ConvergenceProof | null;
  debug?: ConvergenceDebug | null;
}): { proof: ConvergenceProofState; canonical: boolean } {
  const epistemic = resolveLatestMetaSection(input.events, "epistemic");
  const verification = resolveLatestMetaSection(input.events, "verification");
  const latestMeta = resolveLatestMeta(input.events);
  const failReason =
    readString(epistemic?.fail_reason ?? latestMeta?.fail_reason ?? input.debug?.helix_ask_fail_reason) ||
    "";
  const proofVerdict =
    readString(
      verification?.proof_verdict ??
        latestMeta?.proof_verdict ??
        input.proof?.verdict,
    ).toUpperCase() || "";
  const certificateIntegrity =
    readBool(
      verification?.certificate_integrity_ok ??
        latestMeta?.certificate_integrity_ok ??
        input.proof?.certificate?.integrityOk,
    );
  const suppression = readString(latestMeta?.suppressionReason ?? latestMeta?.suppression_reason).toLowerCase();
  const failClosedBySuppression =
    suppression === "missing_evidence" || suppression === "contract_violation";
  if (
    failReason ||
    proofVerdict === "FAIL" ||
    certificateIntegrity === false ||
    failClosedBySuppression
  ) {
    return { proof: "fail_closed", canonical: true };
  }
  if (proofVerdict === "PASS" && certificateIntegrity === true) {
    return { proof: "confirmed", canonical: true };
  }

  const claimTier = asClaimTier(
    epistemic?.claim_tier ?? latestMeta?.claim_tier ?? input.debug?.claim_tier,
  );
  const certifying =
    readBool(epistemic?.certifying ?? latestMeta?.certifying) ??
    false;
  if (claimTier === "certified" && certifying) {
    return { proof: "confirmed", canonical: true };
  }
  if (claimTier === "diagnostic" || claimTier === "reduced_order") {
    return { proof: "reasoned", canonical: true };
  }
  if (claimTier === "exploratory") {
    return { proof: "hypothesis", canonical: true };
  }

  const arbiterMode = readString(epistemic?.arbiter_mode ?? latestMeta?.arbiter_mode ?? input.debug?.arbiter_mode);
  if (arbiterMode === "clarify") {
    return { proof: "unknown", canonical: true };
  }
  return { proof: "unknown", canonical: false };
}

function resolveMaturity(input: {
  events: ConvergenceEvent[];
  debug?: ConvergenceDebug | null;
}): { maturity: ConvergenceMaturityState; canonical: boolean } {
  const epistemic = resolveLatestMetaSection(input.events, "epistemic");
  const latestMeta = resolveLatestMeta(input.events);
  const direct =
    asClaimTier(epistemic?.claim_tier) ??
    asClaimTier(latestMeta?.claim_tier) ??
    asClaimTier(input.debug?.claim_tier) ??
    asClaimTier(input.debug?.math_solver_maturity);
  if (direct) return { maturity: direct, canonical: true };
  return { maturity: "diagnostic", canonical: false };
}

function resolvePhase(input: {
  events: ConvergenceEvent[];
  fallback: ConvergencePhase;
}): { phase: ConvergencePhase; canonical: boolean } {
  for (let i = input.events.length - 1; i >= 0; i -= 1) {
    const event = input.events[i];
    const meta = asRecord(event?.meta);
    const metaPhase = asPhase(meta?.phase ?? meta?.phase_tick);
    if (metaPhase) {
      return { phase: metaPhase, canonical: true };
    }
    const stage = `${readString(event?.stage)} ${readString(event?.detail)} ${readString(event?.text)}`.toLowerCase();
    if (!stage) continue;
    if (stage.includes("debrief") || stage.includes("final")) return { phase: "debrief", canonical: false };
    if (stage.includes("verify proof")) return { phase: "verify", canonical: false };
    if (stage.includes("arbiter") || stage.includes("atlas gate")) return { phase: "gate", canonical: false };
    if (stage.includes("retrieval")) return { phase: "retrieve", canonical: false };
    if (stage.includes("plan")) return { phase: "plan", canonical: false };
  }
  return { phase: input.fallback, canonical: false };
}

function resolveIdeologyAnchors(input: {
  events: ConvergenceEvent[];
  debug?: ConvergenceDebug | null;
}): string[] {
  const intent = resolveLatestMetaSection(input.events, "intent");
  const latestMeta = resolveLatestMeta(input.events);
  const explicit = readStringArray(intent?.ideology_anchor_node_ids ?? latestMeta?.ideology_anchor_node_ids);
  if (explicit.length > 0) return explicit;
  const domain =
    readString(intent?.intent_domain ?? latestMeta?.intent_domain ?? input.debug?.intent_domain).toLowerCase();
  const intentId =
    readString(intent?.intent_id ?? latestMeta?.intent_id ?? input.debug?.intent_id).toLowerCase();
  if (domain.includes("ideology") || domain.includes("governance") || intentId.includes("ideology")) {
    return ["truth-convergence-pathways"];
  }
  return [];
}

function resolveCollapseCommit(events: ConvergenceEvent[]): {
  event: ConvergenceCollapseEvent | null;
  token: string | null;
} {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const meta = asRecord(event?.meta);
    const explicit = readString(meta?.convergence_commit).toLowerCase();
    if (explicit === "arbiter_commit" || explicit === "proof_commit") {
      const token = `${event.id ?? i}:${explicit}:${readString(event.ts) || event.tsMs || ""}`;
      return { event: explicit as ConvergenceCollapseEvent, token };
    }
    const stage = readString(event?.stage).toLowerCase();
    if (stage === "arbiter") {
      const token = `${event.id ?? i}:arbiter_commit:${readString(event.ts) || event.tsMs || ""}`;
      return { event: "arbiter_commit", token };
    }
    if (stage === "verify proof") {
      const token = `${event.id ?? i}:proof_commit:${readString(event.ts) || event.tsMs || ""}`;
      return { event: "proof_commit", token };
    }
  }
  return { event: null, token: null };
}

export function resolveConvergenceCaption(state: {
  source: ConvergenceSourceState;
  proof: ConvergenceProofState;
  deltaPct: number;
}): string {
  const delta = normalizeDeltaPct(state.deltaPct);
  const signed = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  return `${SOURCE_LABEL[state.source]} -> ${PROOF_LABEL[state.proof]} -> ${signed}`;
}

export function getConvergencePhaseOrder(): ConvergencePhase[] {
  return PHASE_ORDER.slice();
}

export function deriveConvergenceStripState(input: ConvergenceStripInput): ConvergenceStripState {
  const sourceState = resolveSourceState(input.events);
  const proofState = resolveProofState({ events: input.events, proof: input.proof, debug: input.debug });
  const maturityState = resolveMaturity({ events: input.events, debug: input.debug });
  const phaseState = resolvePhase({
    events: input.events,
    fallback: input.fallbackPhase ?? "observe",
  });
  const ideologyAnchors = resolveIdeologyAnchors({ events: input.events, debug: input.debug });
  const collapse = resolveCollapseCommit(input.events);
  const deltaPct = normalizeDeltaPct(input.frontierDeltaPct);
  return {
    source: sourceState.source,
    proof: proofState.proof,
    maturity: maturityState.maturity,
    phase: phaseState.phase,
    openWorldActive: sourceState.openWorldActive,
    ideologyAnchorNodeIds: ideologyAnchors,
    caption: resolveConvergenceCaption({
      source: sourceState.source,
      proof: proofState.proof,
      deltaPct,
    }),
    deltaPct,
    canonicalSource: sourceState.canonical,
    canonicalProof: proofState.canonical,
    canonicalMaturity: maturityState.canonical,
    canonicalPhase: phaseState.canonical,
    collapseEvent: collapse.event,
    collapseToken: collapse.token,
  };
}
