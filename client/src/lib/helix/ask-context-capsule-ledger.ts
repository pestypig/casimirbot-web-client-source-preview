import {
  resolveSessionCapsuleConfidenceBand,
  type SessionCapsuleConfidenceBand,
} from "@/lib/helix/ask-context-capsule-display";
import {
  extractContextCapsuleIdsFromText,
  normalizeContextCapsuleId,
  type ContextCapsuleConvergence,
  type ContextCapsuleSummary,
} from "@shared/helix-context-capsule";

export const HELIX_CONTEXT_CAPSULE_MAX_IDS = 12;

export type ContextCapsuleLedgerEntry = {
  id: string;
  summary: ContextCapsuleSummary;
  pinned: boolean;
  pinnedAtMs: number | null;
  touchedAtMs: number;
};

export type SessionCapsuleState = {
  id: string;
  summary: ContextCapsuleSummary;
  confidenceBand: SessionCapsuleConfidenceBand;
};

const CONTEXT_CAPSULE_PROOF_POSTURE_SCORE: Record<ContextCapsuleConvergence["proofPosture"], number> = {
  confirmed: 5,
  reasoned: 4,
  hypothesis: 3,
  unknown: 2,
  fail_closed: 1,
};

const CONTEXT_CAPSULE_MATURITY_SCORE: Record<ContextCapsuleConvergence["maturity"], number> = {
  certified: 4,
  diagnostic: 3,
  reduced_order: 2,
  exploratory: 1,
};

const CONTEXT_CAPSULE_PROOF_VERDICT_SCORE: Record<ContextCapsuleSummary["commit"]["proof_verdict"], number> = {
  PASS: 3,
  UNKNOWN: 2,
  FAIL: 1,
};

export function deriveSessionCapsuleState(
  entries: ContextCapsuleLedgerEntry[],
): SessionCapsuleState | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const latest = [...entries].sort((a, b) => {
    const touchedDelta = b.touchedAtMs - a.touchedAtMs;
    if (touchedDelta !== 0) return touchedDelta;
    const createdDelta = b.summary.createdAtTsMs - a.summary.createdAtTsMs;
    if (createdDelta !== 0) return createdDelta;
    return a.id.localeCompare(b.id);
  })[0];
  return {
    id: latest.id,
    summary: latest.summary,
    confidenceBand: resolveSessionCapsuleConfidenceBand(latest.summary),
  };
}

function resolveContextCapsuleLedgerId(
  summary: Pick<ContextCapsuleSummary, "fingerprint" | "capsuleId">,
): string | null {
  return (
    normalizeContextCapsuleId(summary.fingerprint) ??
    normalizeContextCapsuleId(summary.capsuleId)
  );
}

export function compareContextCapsuleSummariesByRank(
  a: ContextCapsuleSummary,
  b: ContextCapsuleSummary,
): number {
  const proofPostureDelta =
    CONTEXT_CAPSULE_PROOF_POSTURE_SCORE[b.convergence.proofPosture] -
    CONTEXT_CAPSULE_PROOF_POSTURE_SCORE[a.convergence.proofPosture];
  if (proofPostureDelta !== 0) return proofPostureDelta;

  const maturityDelta =
    CONTEXT_CAPSULE_MATURITY_SCORE[b.convergence.maturity] -
    CONTEXT_CAPSULE_MATURITY_SCORE[a.convergence.maturity];
  if (maturityDelta !== 0) return maturityDelta;

  const proofVerdictDelta =
    CONTEXT_CAPSULE_PROOF_VERDICT_SCORE[b.commit.proof_verdict] -
    CONTEXT_CAPSULE_PROOF_VERDICT_SCORE[a.commit.proof_verdict];
  if (proofVerdictDelta !== 0) return proofVerdictDelta;

  const integrityScoreA =
    a.commit.certificate_integrity_ok === true ? 2 : a.commit.certificate_integrity_ok === false ? 0 : 1;
  const integrityScoreB =
    b.commit.certificate_integrity_ok === true ? 2 : b.commit.certificate_integrity_ok === false ? 0 : 1;
  const integrityDelta = integrityScoreB - integrityScoreA;
  if (integrityDelta !== 0) return integrityDelta;

  const createdAtDelta = b.createdAtTsMs - a.createdAtTsMs;
  if (createdAtDelta !== 0) return createdAtDelta;

  return a.fingerprint.localeCompare(b.fingerprint);
}

function compareContextCapsuleLedgerEntriesByRank(
  a: ContextCapsuleLedgerEntry,
  b: ContextCapsuleLedgerEntry,
): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  return compareContextCapsuleSummariesByRank(a.summary, b.summary);
}

function compareContextCapsuleLedgerEntriesForSelection(
  a: ContextCapsuleLedgerEntry,
  b: ContextCapsuleLedgerEntry,
): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  const touchedDelta = b.touchedAtMs - a.touchedAtMs;
  if (touchedDelta !== 0) return touchedDelta;
  if (a.pinnedAtMs !== b.pinnedAtMs) {
    return (b.pinnedAtMs ?? 0) - (a.pinnedAtMs ?? 0);
  }
  return compareContextCapsuleSummariesByRank(a.summary, b.summary);
}

export function upsertContextCapsuleLedger(args: {
  entries: ContextCapsuleLedgerEntry[];
  summary: ContextCapsuleSummary;
  pin?: boolean;
  maxEntries?: number;
  nowMs?: number;
}): ContextCapsuleLedgerEntry[] {
  const maxEntries = Math.max(
    1,
    Math.min(args.maxEntries ?? HELIX_CONTEXT_CAPSULE_MAX_IDS, HELIX_CONTEXT_CAPSULE_MAX_IDS),
  );
  const nowMs = args.nowMs ?? Date.now();
  const capsuleId = resolveContextCapsuleLedgerId(args.summary);
  if (!capsuleId) {
    return [...args.entries].sort(compareContextCapsuleLedgerEntriesByRank).slice(0, maxEntries);
  }

  const existingIndex = args.entries.findIndex((entry) => entry.id === capsuleId);
  const pin = args.pin === true;
  const nextEntries = [...args.entries];
  if (existingIndex >= 0) {
    const existing = nextEntries[existingIndex];
    nextEntries[existingIndex] = {
      ...existing,
      summary: args.summary,
      pinned: existing.pinned || pin,
      pinnedAtMs: existing.pinnedAtMs ?? (pin ? nowMs : null),
      touchedAtMs: nowMs,
    };
  } else {
    nextEntries.push({
      id: capsuleId,
      summary: args.summary,
      pinned: pin,
      pinnedAtMs: pin ? nowMs : null,
      touchedAtMs: nowMs,
    });
  }

  while (nextEntries.length > maxEntries) {
    const evictionPool = nextEntries.some((entry) => !entry.pinned)
      ? nextEntries.filter((entry) => !entry.pinned)
      : nextEntries;
    const lowest = [...evictionPool]
      .sort((a, b) => compareContextCapsuleSummariesByRank(a.summary, b.summary))
      .at(-1);
    if (!lowest) break;
    const dropIndex = nextEntries.findIndex((entry) => entry.id === lowest.id);
    if (dropIndex < 0) break;
    nextEntries.splice(dropIndex, 1);
  }

  return nextEntries.sort(compareContextCapsuleLedgerEntriesByRank).slice(0, maxEntries);
}

export function buildSelectedContextCapsuleIds(args: {
  ledgerEntries: ContextCapsuleLedgerEntry[];
  prompt?: string;
  inlineCapsuleIds?: string[];
  maxIds?: number;
}): string[] {
  const maxIds = Math.max(
    1,
    Math.min(args.maxIds ?? HELIX_CONTEXT_CAPSULE_MAX_IDS, HELIX_CONTEXT_CAPSULE_MAX_IDS),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const normalized = normalizeContextCapsuleId(value ?? null);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const inlineIds = args.inlineCapsuleIds ?? extractContextCapsuleIdsFromText(args.prompt ?? "");
  for (const inlineId of inlineIds) {
    push(inlineId);
    if (out.length >= maxIds) return out;
  }

  const orderedLedger = [...args.ledgerEntries].sort(compareContextCapsuleLedgerEntriesForSelection);
  for (const entry of orderedLedger) {
    push(entry.id);
    if (out.length >= maxIds) return out;
  }

  return out;
}

export function buildLatestWinsContextCapsuleIds(args: {
  ledgerEntries: ContextCapsuleLedgerEntry[];
  prompt?: string;
  inlineCapsuleIds?: string[];
  maxIds?: number;
}): string[] {
  const maxIds = Math.max(
    1,
    Math.min(args.maxIds ?? HELIX_CONTEXT_CAPSULE_MAX_IDS, HELIX_CONTEXT_CAPSULE_MAX_IDS),
  );
  const inlineIds = args.inlineCapsuleIds ?? extractContextCapsuleIdsFromText(args.prompt ?? "");
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const normalized = normalizeContextCapsuleId(value ?? null);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };
  for (const inlineId of inlineIds) {
    push(inlineId);
    if (out.length >= maxIds) return out;
  }
  const recencySorted = [...args.ledgerEntries].sort(compareContextCapsuleLedgerEntriesForSelection);
  const confidenceSorted = [...args.ledgerEntries].sort(compareContextCapsuleLedgerEntriesByRank);
  let recencyIndex = 0;
  let confidenceIndex = 0;
  while (out.length < maxIds && (recencyIndex < recencySorted.length || confidenceIndex < confidenceSorted.length)) {
    for (let step = 0; step < 2 && recencyIndex < recencySorted.length && out.length < maxIds; step += 1) {
      push(recencySorted[recencyIndex]?.id);
      recencyIndex += 1;
    }
    if (confidenceIndex < confidenceSorted.length && out.length < maxIds) {
      push(confidenceSorted[confidenceIndex]?.id);
      confidenceIndex += 1;
    }
  }
  return out.slice(0, maxIds);
}
