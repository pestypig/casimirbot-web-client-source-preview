import { describe, expect, it } from "vitest";

import {
  buildLatestWinsContextCapsuleIds,
  buildSelectedContextCapsuleIds,
  compareContextCapsuleSummariesByRank,
  deriveSessionCapsuleState,
  upsertContextCapsuleLedger,
  type ContextCapsuleLedgerEntry,
} from "@/lib/helix/ask-context-capsule-ledger";
import type { ContextCapsuleSummary } from "@shared/helix-context-capsule";

function summary(input: {
  id: string;
  fingerprint?: string;
  createdAtTsMs?: number;
  proofPosture?: ContextCapsuleSummary["convergence"]["proofPosture"];
  maturity?: ContextCapsuleSummary["convergence"]["maturity"];
  proofVerdict?: ContextCapsuleSummary["commit"]["proof_verdict"];
  integrityOk?: boolean | null;
}): ContextCapsuleSummary {
  return {
    version: "v1",
    capsuleId: input.id,
    fingerprint: input.fingerprint ?? input.id.replace("HXCAP-", "HXFP-"),
    createdAtTsMs: input.createdAtTsMs ?? 1000,
    traceId: null,
    runId: null,
    convergence: {
      source: "repo_exact",
      proofPosture: input.proofPosture ?? "reasoned",
      maturity: input.maturity ?? "diagnostic",
      phase: "synthesize",
      collapseEvent: null,
    },
    commit: {
      events: [],
      proof_verdict: input.proofVerdict ?? "UNKNOWN",
      certificate_hash: null,
      certificate_integrity_ok: input.integrityOk ?? null,
    },
    stamp: {
      rulePreset: input.maturity ?? "diagnostic",
      tickHz: 20,
      seed: 1,
      gridW: 10,
      gridH: 10,
      finalBits: "..........",
    },
    stamp_lines: [".........."],
    safety: {
      strict_core: true,
      replay_active: false,
      fail_closed: false,
    },
  };
}

function entry(args: {
  id: string;
  touchedAtMs: number;
  pinned?: boolean;
  pinnedAtMs?: number | null;
  summary?: ContextCapsuleSummary;
}): ContextCapsuleLedgerEntry {
  return {
    id: args.id,
    summary: args.summary ?? summary({ id: args.id }),
    pinned: args.pinned ?? false,
    pinnedAtMs: args.pinnedAtMs ?? null,
    touchedAtMs: args.touchedAtMs,
  };
}

describe("context capsule ledger", () => {
  it("ranks summaries by proof posture, maturity, proof verdict, integrity, creation time, and fingerprint", () => {
    const confirmed = summary({
      id: "HXCAP-CONF01",
      proofPosture: "confirmed",
      maturity: "exploratory",
      proofVerdict: "FAIL",
      createdAtTsMs: 1,
    });
    const diagnostic = summary({
      id: "HXCAP-DIAG01",
      proofPosture: "reasoned",
      maturity: "diagnostic",
      proofVerdict: "PASS",
      integrityOk: true,
      createdAtTsMs: 2,
    });
    const exploratory = summary({
      id: "HXCAP-EXPL01",
      proofPosture: "reasoned",
      maturity: "exploratory",
      proofVerdict: "PASS",
      integrityOk: true,
      createdAtTsMs: 3,
    });

    expect([exploratory, diagnostic, confirmed].sort(compareContextCapsuleSummariesByRank)).toEqual([
      confirmed,
      diagnostic,
      exploratory,
    ]);
  });

  it("upserts summaries, preserves pins, and evicts the lowest unpinned entry", () => {
    const pinned = entry({
      id: "HXCAP-PIN001",
      touchedAtMs: 10,
      pinned: true,
      pinnedAtMs: 10,
      summary: summary({ id: "HXCAP-PIN001", proofPosture: "unknown" }),
    });
    const weak = entry({
      id: "HXCAP-WEAK01",
      touchedAtMs: 20,
      summary: summary({ id: "HXCAP-WEAK01", proofPosture: "fail_closed" }),
    });

    const next = upsertContextCapsuleLedger({
      entries: [pinned, weak],
      summary: summary({
        id: "HXCAP-NEW001",
        proofPosture: "reasoned",
        maturity: "certified",
        proofVerdict: "PASS",
      }),
      maxEntries: 2,
      nowMs: 30,
    });

    expect(next.map((item) => item.id)).toEqual(["HXCAP-PIN001", "HXFP-NEW001"]);
    expect(next.find((item) => item.id === "HXCAP-PIN001")?.pinned).toBe(true);
    expect(next.find((item) => item.id === "HXFP-NEW001")?.touchedAtMs).toBe(30);
  });

  it("selects inline capsule ids before ledger entries and dedupes normalized ids", () => {
    const ledger = [
      entry({ id: "HXCAP-LED001", touchedAtMs: 10 }),
      entry({ id: "HXCAP-LED002", touchedAtMs: 20, pinned: true, pinnedAtMs: 20 }),
    ];

    expect(buildSelectedContextCapsuleIds({
      ledgerEntries: ledger,
      inlineCapsuleIds: ["HXCAP-LED001", "inline3"],
      maxIds: 3,
    })).toEqual(["HXCAP-LED001", "HXCAP-INLINE3", "HXCAP-LED002"]);
  });

  it("mixes recent and high-confidence ledger entries for latest-wins selection", () => {
    const recent = entry({
      id: "HXCAP-RECENT",
      touchedAtMs: 30,
      summary: summary({ id: "HXCAP-RECENT", proofPosture: "unknown" }),
    });
    const secondRecent = entry({
      id: "HXCAP-SECOND",
      touchedAtMs: 20,
      summary: summary({ id: "HXCAP-SECOND", proofPosture: "unknown" }),
    });
    const strongest = entry({
      id: "HXCAP-STRONG",
      touchedAtMs: 5,
      summary: summary({ id: "HXCAP-STRONG", proofPosture: "confirmed", maturity: "certified" }),
    });

    expect(buildLatestWinsContextCapsuleIds({
      ledgerEntries: [strongest, secondRecent, recent],
      maxIds: 3,
    })).toEqual(["HXCAP-RECENT", "HXCAP-SECOND", "HXCAP-STRONG"]);
  });

  it("projects the latest touched session capsule state with a confidence band", () => {
    const latest = entry({
      id: "HXCAP-LATEST",
      touchedAtMs: 50,
      summary: summary({ id: "HXCAP-LATEST", proofPosture: "confirmed", maturity: "certified" }),
    });

    expect(deriveSessionCapsuleState([
      entry({ id: "HXCAP-OLDER1", touchedAtMs: 10 }),
      latest,
    ])).toMatchObject({
      id: "HXCAP-LATEST",
      confidenceBand: "reinforcing",
    });
  });
});
