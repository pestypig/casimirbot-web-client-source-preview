import { describe, expect, it } from "vitest";
import {
  buildContextCapsuleFingerprint,
  buildContextCapsuleFingerprintFromStampLines,
  createContextCapsuleAutomaton,
  extractContextCapsuleIdsFromText,
  injectContextCapsuleCommit,
  isContextCapsuleReplayActive,
  serializeContextCapsuleBits,
  stepContextCapsuleAutomaton,
} from "@shared/helix-context-capsule";

describe("context capsule primitives", () => {
  it("extracts normalized capsule ids from free text", () => {
    const ids = extractContextCapsuleIdsFromText(
      "use hxcap-abc123 and HXCAP-ABC123 then HXCAP-FFFF9999 and hxfp-00AB12",
    );
    expect(ids).toEqual(["HXCAP-ABC123", "HXCAP-FFFF9999", "HXFP-00AB12"]);
  });

  it("enforces strict replay-active predicate", () => {
    expect(
      isContextCapsuleReplayActive({ source: "atlas_exact", proofPosture: "reasoned" }),
    ).toBe(true);
    expect(
      isContextCapsuleReplayActive({ source: "repo_exact", proofPosture: "confirmed" }),
    ).toBe(true);
    expect(
      isContextCapsuleReplayActive({ source: "open_world", proofPosture: "confirmed" }),
    ).toBe(false);
    expect(
      isContextCapsuleReplayActive({ source: "atlas_exact", proofPosture: "hypothesis" }),
    ).toBe(false);
  });

  it("is deterministic for identical seed and controls", () => {
    const controls = { source: "repo_exact", proof: "reasoned", maturity: "diagnostic" } as const;
    let a = createContextCapsuleAutomaton({
      seed: 42,
      width: 80,
      height: 16,
      source: controls.source,
    });
    let b = createContextCapsuleAutomaton({
      seed: 42,
      width: 80,
      height: 16,
      source: controls.source,
    });
    for (let i = 0; i < 12; i += 1) {
      a = stepContextCapsuleAutomaton(a, controls);
      b = stepContextCapsuleAutomaton(b, controls);
    }
    expect(serializeContextCapsuleBits(a)).toEqual(serializeContextCapsuleBits(b));
  });

  it("injects commit pulses deterministically", () => {
    const base = createContextCapsuleAutomaton({ seed: 99, width: 32, height: 8, source: "atlas_exact" });
    const arbiter = injectContextCapsuleCommit(base, "arbiter_commit");
    const proof = injectContextCapsuleCommit(base, "proof_commit");
    expect(serializeContextCapsuleBits(arbiter)).not.toEqual(serializeContextCapsuleBits(base));
    expect(serializeContextCapsuleBits(proof)).not.toEqual(serializeContextCapsuleBits(base));
    expect(serializeContextCapsuleBits(arbiter)).not.toEqual(serializeContextCapsuleBits(proof));
  });

  it("builds a deterministic visual fingerprint from stamp bits", () => {
    let state = createContextCapsuleAutomaton({ seed: 314, width: 80, height: 16, source: "repo_exact" });
    state = stepContextCapsuleAutomaton(state, {
      source: "repo_exact",
      proof: "reasoned",
      maturity: "diagnostic",
    });
    const bits = serializeContextCapsuleBits(state);
    const a = buildContextCapsuleFingerprint({ bits, width: 80, height: 16 });
    const b = buildContextCapsuleFingerprint({ bits, width: 80, height: 16 });
    expect(a).toEqual(b);
    expect(a.startsWith("HXFP-")).toBe(true);
  });

  it("extracts fingerprint from pasted visual stamp lines", () => {
    const lines = ["##..#..#..", ".#.#..##..", "###...#..."];
    const fingerprint = buildContextCapsuleFingerprintFromStampLines(lines);
    const ids = extractContextCapsuleIdsFromText(`notes\n${lines.join("\n")}\nmore notes`);
    expect(ids).toContain(fingerprint);
  });
});
