import { beforeAll, describe, expect, it } from "vitest";
import type { ContextCapsuleSummary } from "@shared/helix-context-capsule";

let compareContextCapsuleSummariesByRank: typeof import("@/components/helix/HelixAskPill").compareContextCapsuleSummariesByRank;
let upsertContextCapsuleLedger: typeof import("@/components/helix/HelixAskPill").upsertContextCapsuleLedger;
let buildSelectedContextCapsuleIds: typeof import("@/components/helix/HelixAskPill").buildSelectedContextCapsuleIds;
let deriveSessionCapsuleState: typeof import("@/components/helix/HelixAskPill").deriveSessionCapsuleState;

function makeSummary(args: {
  id: string;
  createdAtTsMs: number;
  proofPosture?: ContextCapsuleSummary["convergence"]["proofPosture"];
  maturity?: ContextCapsuleSummary["convergence"]["maturity"];
  proofVerdict?: ContextCapsuleSummary["commit"]["proof_verdict"];
  integrityOk?: boolean | null;
}): ContextCapsuleSummary {
  return {
    version: "v1",
    capsuleId: `HXCAP-${args.id}`,
    fingerprint: `HXFP-${args.id}`,
    createdAtTsMs: args.createdAtTsMs,
    traceId: null,
    runId: null,
    convergence: {
      source: "repo_exact",
      proofPosture: args.proofPosture ?? "reasoned",
      maturity: args.maturity ?? "diagnostic",
      phase: "debrief",
      collapseEvent: null,
    },
    commit: {
      events: [],
      proof_verdict: args.proofVerdict ?? "UNKNOWN",
      certificate_hash: null,
      certificate_integrity_ok: args.integrityOk ?? null,
    },
    stamp: {
      rulePreset: "diagnostic",
      tickHz: 1,
      seed: 1,
      gridW: 10,
      gridH: 3,
      finalBits: "0".repeat(30),
    },
    stamp_lines: ["..........", "..........", ".........."],
    safety: {
      strict_core: true,
      replay_active: true,
      fail_closed: false,
    },
  };
}

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({
    compareContextCapsuleSummariesByRank,
    upsertContextCapsuleLedger,
    buildSelectedContextCapsuleIds,
    deriveSessionCapsuleState,
  } = await import("@/components/helix/HelixAskPill"));
});

describe("context capsule additive ledger", () => {
  it("orders summaries by deterministic confidence tuple", () => {
    const high = makeSummary({
      id: "A00001",
      createdAtTsMs: 10,
      proofPosture: "confirmed",
      maturity: "certified",
      proofVerdict: "PASS",
      integrityOk: true,
    });
    const low = makeSummary({
      id: "A00002",
      createdAtTsMs: 20,
      proofPosture: "hypothesis",
      maturity: "exploratory",
      proofVerdict: "FAIL",
      integrityOk: false,
    });

    expect(compareContextCapsuleSummariesByRank(high, low)).toBeLessThan(0);
    expect(compareContextCapsuleSummariesByRank(low, high)).toBeGreaterThan(0);
  });

  it("evicts lowest-ranked entry first at cap 12", () => {
    const low = makeSummary({
      id: "B00000",
      createdAtTsMs: 1,
      proofPosture: "unknown",
      maturity: "exploratory",
      proofVerdict: "FAIL",
      integrityOk: false,
    });
    let entries = upsertContextCapsuleLedger({
      entries: [],
      summary: low,
      maxEntries: 12,
      nowMs: 1,
    });

    for (let index = 1; index <= 12; index += 1) {
      entries = upsertContextCapsuleLedger({
        entries,
        summary: makeSummary({
          id: `B${String(index).padStart(5, "0")}`,
          createdAtTsMs: 100 + index,
          proofPosture: "reasoned",
          maturity: "diagnostic",
          proofVerdict: "PASS",
          integrityOk: true,
        }),
        maxEntries: 12,
        nowMs: 100 + index,
      });
    }

    expect(entries).toHaveLength(12);
    expect(entries.some((entry) => entry.id === low.fingerprint)).toBe(false);
  });

  it("builds selected ids as inline-first union with dedup and recency-aware ledger fallback", () => {
    const high = makeSummary({
      id: "C00001",
      createdAtTsMs: 100,
      proofPosture: "confirmed",
      maturity: "diagnostic",
      proofVerdict: "PASS",
      integrityOk: true,
    });
    const lower = makeSummary({
      id: "C00002",
      createdAtTsMs: 90,
      proofPosture: "reasoned",
      maturity: "diagnostic",
      proofVerdict: "UNKNOWN",
      integrityOk: null,
    });

    const entries = [
      { id: lower.fingerprint, summary: lower, pinned: false, pinnedAtMs: null, touchedAtMs: 1 },
      { id: high.fingerprint, summary: high, pinned: false, pinnedAtMs: null, touchedAtMs: 2 },
    ];

    const selected = buildSelectedContextCapsuleIds({
      ledgerEntries: entries,
      inlineCapsuleIds: [lower.fingerprint, "HXFP-C99999"],
      maxIds: 12,
    });

    expect(selected).toEqual([lower.fingerprint, "HXFP-C99999", high.fingerprint]);
  });

  it("respects maxIds while keeping inline explicit ids first", () => {
    const one = makeSummary({
      id: "D00001",
      createdAtTsMs: 100,
    });
    const two = makeSummary({
      id: "D00002",
      createdAtTsMs: 101,
    });
    const entries = [
      { id: one.fingerprint, summary: one, pinned: false, pinnedAtMs: null, touchedAtMs: 1 },
      { id: two.fingerprint, summary: two, pinned: false, pinnedAtMs: null, touchedAtMs: 2 },
    ];
    const selected = buildSelectedContextCapsuleIds({
      ledgerEntries: entries,
      inlineCapsuleIds: [one.fingerprint],
      maxIds: 2,
    });
    expect(selected).toEqual([one.fingerprint, two.fingerprint]);
  });

  it("derives session capsule from latest touched entry with deterministic confidence band", () => {
    const olderStrong = makeSummary({
      id: "E00001",
      createdAtTsMs: 100,
      proofPosture: "confirmed",
      maturity: "certified",
      proofVerdict: "PASS",
      integrityOk: true,
    });
    const latestWeak = makeSummary({
      id: "E00002",
      createdAtTsMs: 101,
      proofPosture: "unknown",
      maturity: "exploratory",
      proofVerdict: "UNKNOWN",
      integrityOk: null,
    });
    const state = deriveSessionCapsuleState([
      { id: olderStrong.fingerprint, summary: olderStrong, pinned: false, pinnedAtMs: null, touchedAtMs: 120 },
      { id: latestWeak.fingerprint, summary: latestWeak, pinned: false, pinnedAtMs: null, touchedAtMs: 240 },
    ]);

    expect(state?.id).toBe(latestWeak.fingerprint);
    expect(state?.summary.fingerprint).toBe(latestWeak.fingerprint);
    expect(state?.confidenceBand).toBe("uncertain");
  });

  it("classifies reasoned PASS capsules as reinforcing in session capsule state", () => {
    const reasonedPass = makeSummary({
      id: "E00003",
      createdAtTsMs: 200,
      proofPosture: "reasoned",
      maturity: "diagnostic",
      proofVerdict: "PASS",
      integrityOk: true,
    });
    const state = deriveSessionCapsuleState([
      { id: reasonedPass.fingerprint, summary: reasonedPass, pinned: false, pinnedAtMs: null, touchedAtMs: 300 },
    ]);
    expect(state?.confidenceBand).toBe("reinforcing");
  });
});
