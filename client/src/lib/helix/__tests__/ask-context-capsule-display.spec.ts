import { describe, expect, it } from "vitest";
import {
  SESSION_CAPSULE_CONFIDENCE_LABEL,
  buildContextCapsuleCopyText,
  buildContextCapsuleStampDataUri,
  resolveSessionCapsuleConfidenceBand,
  resolveContextCapsulePalette,
  stripContextCapsuleTokensFromText,
} from "@/lib/helix/ask-context-capsule-display";
import type { ContextCapsuleSummary } from "@shared/helix-context-capsule";
import type { ConvergenceStripState } from "@/lib/helix/reasoning-theater-convergence";

const baseState: ConvergenceStripState = {
  source: "none",
  proof: "unknown",
  maturity: "exploratory",
  phase: "idle",
  openWorldActive: false,
  caption: "Idle",
  deltaPct: 0,
};

describe("Helix Ask context capsule display", () => {
  it("strips inline context capsule tokens while preserving ordinary text", () => {
    expect(stripContextCapsuleTokensFromText("Use HXCAP-ABC123 for this turn")).toBe("Use for this turn");
    expect(stripContextCapsuleTokensFromText("  no capsule token  ")).toBe("no capsule token");
  });

  it("maps convergence source and proof to display palettes", () => {
    expect(resolveContextCapsulePalette({ ...baseState, proof: "fail_closed" })).toEqual({ r: 239, g: 68, b: 68 });
    expect(resolveContextCapsulePalette({ ...baseState, source: "open_world" })).toEqual({ r: 244, g: 114, b: 182 });
    expect(resolveContextCapsulePalette({ ...baseState, source: "atlas_exact" })).toEqual({ r: 34, g: 211, b: 238 });
    expect(resolveContextCapsulePalette({ ...baseState, source: "repo_exact" })).toEqual({ r: 56, g: 189, b: 248 });
    expect(resolveContextCapsulePalette(baseState)).toEqual({ r: 148, g: 163, b: 184 });
  });

  it("formats session capsule confidence labels", () => {
    expect(SESSION_CAPSULE_CONFIDENCE_LABEL).toEqual({
      reinforcing: "reinforcing",
      building: "building",
      uncertain: "uncertain",
    });
  });

  it("resolves session capsule confidence bands from proof posture and certificate state", () => {
    const summary = {
      convergence: {
        proofPosture: "confirmed",
        maturity: "diagnostic",
      },
      commit: {
        proof_verdict: "UNKNOWN",
        certificate_integrity_ok: null,
      },
    } as ContextCapsuleSummary;

    expect(resolveSessionCapsuleConfidenceBand(summary)).toBe("reinforcing");
    expect(
      resolveSessionCapsuleConfidenceBand({
        ...summary,
        convergence: { ...summary.convergence, proofPosture: "reasoned" },
        commit: { ...summary.commit, proof_verdict: "PASS" },
      } as ContextCapsuleSummary),
    ).toBe("reinforcing");
    expect(
      resolveSessionCapsuleConfidenceBand({
        ...summary,
        convergence: { ...summary.convergence, proofPosture: "hypothesis" },
      } as ContextCapsuleSummary),
    ).toBe("building");
    expect(
      resolveSessionCapsuleConfidenceBand({
        ...summary,
        convergence: { ...summary.convergence, proofPosture: "fail_closed" },
      } as ContextCapsuleSummary),
    ).toBe("uncertain");
    expect(
      resolveSessionCapsuleConfidenceBand({
        ...summary,
        commit: { ...summary.commit, certificate_integrity_ok: false },
      } as ContextCapsuleSummary),
    ).toBe("uncertain");
  });

  it("builds compact context capsule copy text from stamp and convergence summary", () => {
    const summary = {
      stamp: {
        finalBits: "111111111111111111111111111111",
        gridW: 10,
        gridH: 3,
      },
      commit: {
        proof_verdict: "PASS",
      },
      convergence: {
        source: "repo_exact",
      },
    } as ContextCapsuleSummary;

    expect(buildContextCapsuleCopyText(summary)).toBe(
      ["##########", "##########", "##########", "proof:PASS  src:repo_exact"].join("\n"),
    );
  });

  it("builds SVG data URIs for context capsule stamps", () => {
    const uri = buildContextCapsuleStampDataUri({
      finalBits: "1010",
      gridW: 2,
      gridH: 2,
    } as ContextCapsuleSummary["stamp"]);
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length));
    expect(svg).toContain('viewBox="0 0 2 2"');
    expect(svg).toContain('fill="#071525"');
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1" fill="#D4F4FF" />');
    expect(svg).toContain('<rect x="0" y="1" width="1" height="1" fill="#D4F4FF" />');
    expect(svg).not.toContain('<rect x="1" y="0" width="1" height="1" fill="#D4F4FF" />');
  });
});
