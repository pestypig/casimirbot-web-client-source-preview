import { describe, expect, it } from "vitest";

import {
  CONVERGENCE_MATURITY_LABEL,
  CONVERGENCE_PROOF_LABEL,
  CONVERGENCE_SOURCE_LABEL,
  buildConvergenceDebugSnapshot,
  hasConvergenceStateChanged,
} from "@/lib/helix/ask-convergence-display";
import type { ConvergenceStripState } from "@/lib/helix/reasoning-theater-convergence";

describe("ask convergence display", () => {
  it("formats context-capsule convergence source labels", () => {
    expect(CONVERGENCE_SOURCE_LABEL).toEqual({
      atlas_exact: "atlas exact",
      repo_exact: "repo exact",
      open_world: "open-world",
      unknown: "unknown",
    });
  });

  it("formats context-capsule convergence proof labels", () => {
    expect(CONVERGENCE_PROOF_LABEL).toEqual({
      confirmed: "confirmed",
      reasoned: "reasoned",
      hypothesis: "hypothesis",
      unknown: "unknown",
      fail_closed: "fail-closed",
    });
  });

  it("formats context-capsule convergence maturity labels", () => {
    expect(CONVERGENCE_MATURITY_LABEL).toEqual({
      exploratory: "exploratory",
      reduced_order: "reduced-order",
      diagnostic: "diagnostic",
      certified: "certified",
    });
  });

  it("builds a display-safe convergence debug snapshot", () => {
    expect(buildConvergenceDebugSnapshot(null)).toBeUndefined();
    expect(
      buildConvergenceDebugSnapshot({
        intent_domain: "science",
        intent_id: "intent-1",
        arbiter_mode: "route_first",
        claim_tier: "diagnostic",
        math_solver_maturity: "reduced_order",
        helix_ask_fail_reason: "needs_evidence",
        ignored: "not projected",
      }),
    ).toEqual({
      intent_domain: "science",
      intent_id: "intent-1",
      arbiter_mode: "route_first",
      claim_tier: "diagnostic",
      math_solver_maturity: "reduced_order",
      helix_ask_fail_reason: "needs_evidence",
    });
    expect(
      buildConvergenceDebugSnapshot({
        intent_domain: 42,
        helix_ask_fail_reason: null,
      }),
    ).toEqual({
      intent_domain: undefined,
      intent_id: undefined,
      arbiter_mode: undefined,
      claim_tier: undefined,
      math_solver_maturity: undefined,
      helix_ask_fail_reason: undefined,
    });
  });

  it("compares only visible convergence strip fields", () => {
    const base: ConvergenceStripState = {
      source: "repo_exact",
      proof: "reasoned",
      maturity: "diagnostic",
      phase: "verify",
      openWorldActive: false,
      ideologyAnchorNodeIds: ["node-a"],
      caption: "Ready",
      deltaPct: 12,
      canonicalSource: true,
      canonicalProof: true,
      canonicalMaturity: true,
      canonicalPhase: true,
      collapseEvent: "arbiter_commit",
      collapseToken: "collapse-1",
    };

    expect(hasConvergenceStateChanged(null, base)).toBe(true);
    expect(
      hasConvergenceStateChanged(base, {
        ...base,
        ideologyAnchorNodeIds: ["node-b"],
        collapseToken: "collapse-2",
      }),
    ).toBe(false);
    expect(hasConvergenceStateChanged(base, { ...base, caption: "Updated" })).toBe(true);
    expect(hasConvergenceStateChanged(base, { ...base, deltaPct: 13 })).toBe(true);
  });
});
