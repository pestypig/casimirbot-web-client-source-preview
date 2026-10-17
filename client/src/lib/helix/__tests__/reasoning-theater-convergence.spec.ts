import { describe, expect, it } from "vitest";
import { deriveConvergenceStripState, getConvergencePhaseOrder } from "@/lib/helix/reasoning-theater-convergence";

describe("reasoning theater convergence strip", () => {
  it("classifies source as atlas_exact when exact provenance includes atlas signal", () => {
    const state = deriveConvergenceStripState({
      events: [
        {
          id: "evt-1",
          stage: "Retrieval channels",
          meta: {
            retrieval: {
              retrievalRoute: "retrieval:repo",
              has_exact_provenance: true,
              atlas_exact: true,
            },
          },
        },
      ],
      frontierAction: "small_gain",
      frontierDeltaPct: 1.25,
    });
    expect(state.source).toBe("atlas_exact");
    expect(state.canonicalSource).toBe(true);
  });

  it("classifies source as repo_exact for exact non-atlas provenance", () => {
    const state = deriveConvergenceStripState({
      events: [
        {
          id: "evt-2",
          stage: "Retrieval channels",
          meta: {
            retrieval: {
              retrievalRoute: "retrieval:repo",
              has_exact_provenance: true,
              atlas_exact: false,
              atlasHits: 0,
              zone_hint: "owned_frontier",
            },
          },
        },
      ],
      frontierAction: "small_gain",
      frontierDeltaPct: 0.9,
    });
    expect(state.source).toBe("repo_exact");
    expect(state.canonicalSource).toBe(true);
  });

  it("classifies source as open_world when bypass route is active", () => {
    const state = deriveConvergenceStripState({
      events: [
        {
          id: "evt-3",
          stage: "Open-world mode",
          meta: {
            retrievalRoute: "retrieval:open_world",
            retrieval: {
              retrievalRoute: "retrieval:open_world",
              openWorldBypassMode: true,
            },
          },
        },
      ],
      frontierAction: "steady",
      frontierDeltaPct: 0,
    });
    expect(state.source).toBe("open_world");
    expect(state.openWorldActive).toBe(true);
  });

  it("renders explicit unknown when provenance is missing", () => {
    const state = deriveConvergenceStripState({
      events: [
        {
          id: "evt-4",
          stage: "Retrieval channels",
          meta: {
            retrieval: {
              retrievalRoute: "retrieval:repo",
              has_exact_provenance: false,
            },
          },
        },
      ],
      frontierAction: "steady",
      frontierDeltaPct: 0.1,
    });
    expect(state.source).toBe("unknown");
    expect(state.canonicalSource).toBe(true);
  });

  it("enforces fail_closed precedence from verification/integrity/fail reason", () => {
    const failReasonState = deriveConvergenceStripState({
      events: [
        {
          id: "evt-5",
          stage: "Arbiter",
          meta: {
            epistemic: {
              fail_reason: "STRICT_CONTRACT_FAIL",
            },
          },
        },
      ],
      frontierAction: "large_loss",
      frontierDeltaPct: -5.4,
    });
    expect(failReasonState.proof).toBe("fail_closed");

    const integrityState = deriveConvergenceStripState({
      events: [
        {
          id: "evt-6",
          stage: "Verify proof",
          meta: {
            verification: {
              proof_verdict: "PASS",
              certificate_integrity_ok: false,
            },
          },
        },
      ],
      frontierAction: "large_loss",
      frontierDeltaPct: -4.2,
    });
    expect(integrityState.proof).toBe("fail_closed");
  });

  it("maps maturity from canonical claim tier", () => {
    const exploratory = deriveConvergenceStripState({
      events: [
        {
          id: "evt-7",
          stage: "Arbiter",
          meta: {
            epistemic: {
              claim_tier: "exploratory",
            },
          },
        },
      ],
      frontierAction: "small_gain",
      frontierDeltaPct: 0.4,
    });
    expect(exploratory.maturity).toBe("exploratory");

    const certified = deriveConvergenceStripState({
      events: [
        {
          id: "evt-8",
          stage: "Arbiter",
          meta: {
            epistemic: {
              claim_tier: "certified",
              certifying: true,
            },
          },
        },
      ],
      frontierAction: "small_gain",
      frontierDeltaPct: 0.7,
    });
    expect(certified.maturity).toBe("certified");
    expect(certified.proof).toBe("confirmed");
  });

  it("detects collapse events only on commit points", () => {
    const arbiterCommit = deriveConvergenceStripState({
      events: [
        {
          id: "evt-9",
          stage: "Arbiter",
          meta: {
            convergence_commit: "arbiter_commit",
          },
        },
      ],
      frontierAction: "small_gain",
      frontierDeltaPct: 1.1,
    });
    expect(arbiterCommit.collapseEvent).toBe("arbiter_commit");
    expect(arbiterCommit.collapseToken).toContain("arbiter_commit");

    const nonCommit = deriveConvergenceStripState({
      events: [
        {
          id: "evt-10",
          stage: "Retrieval channels",
          meta: {
            retrieval: { has_exact_provenance: false },
          },
        },
      ],
      frontierAction: "steady",
      frontierDeltaPct: 0,
    });
    expect(nonCommit.collapseEvent).toBeNull();
  });

  it("is deterministic for identical input traces", () => {
    const input = {
      events: [
        {
          id: "evt-11",
          stage: "Retrieval channels",
          meta: {
            retrieval: {
              retrievalRoute: "retrieval:repo",
              has_exact_provenance: true,
              atlas_exact: false,
            },
            epistemic: {
              claim_tier: "diagnostic",
              arbiter_mode: "repo_grounded",
            },
            phase: "retrieve",
          },
        },
      ],
      frontierAction: "small_gain" as const,
      frontierDeltaPct: 2.2,
    };
    const a = deriveConvergenceStripState(input);
    const b = deriveConvergenceStripState(input);
    expect(a).toEqual(b);
  });

  it("exports the stable phase order for phase tick rendering", () => {
    expect(getConvergencePhaseOrder()).toEqual([
      "observe",
      "plan",
      "retrieve",
      "gate",
      "synthesize",
      "verify",
      "execute",
      "debrief",
    ]);
  });
});
