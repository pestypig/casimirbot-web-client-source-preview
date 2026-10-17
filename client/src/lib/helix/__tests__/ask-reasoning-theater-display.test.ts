import { describe, expect, it } from "vitest";

import {
  REASONING_THEATER_ARCHETYPE_LABEL,
  REASONING_THEATER_CERTAINTY_LABEL,
  REASONING_THEATER_MEDAL_ASSET,
  REASONING_THEATER_MEDAL_LABEL,
  REASONING_THEATER_PHASE_LABEL,
  REASONING_THEATER_SUPPRESSION_REASONS,
  REASONING_THEATER_STANCE_META,
  REASONING_THEATER_SUPPRESSION_LABEL,
  buildMirekReasoningDisplayGrid,
  buildReasoningTheaterParticlesFromMirekArtifact,
  buildReasoningTheaterFrontierParticles,
  mirekCellGridClassName,
  mirekCellParticleClassName,
  mirekReasoningDisplayDensity,
  resolveReasoningTheaterCertaintyClass,
  resolveReasoningTheaterMedal,
  resolveReasoningTheaterPhase,
  resolveReasoningTheaterSuppressionReason,
  type ReasoningTheaterMedalStateSnapshot,
} from "@/lib/helix/ask-reasoning-theater-display";
import type { MirekReasoningArtifactV1 } from "@shared/helix-reasoning-mirek";

describe("ask reasoning theater display", () => {
  it("formats stance labels and meter classes", () => {
    expect(REASONING_THEATER_STANCE_META.winning).toEqual({
      badge: "text-emerald-200",
      bar: "bg-emerald-300/80",
      label: "Winning",
    });
    expect(REASONING_THEATER_STANCE_META.fail_closed).toEqual({
      badge: "text-rose-200",
      bar: "bg-rose-300/80",
      label: "Fail-closed",
    });
  });

  it("formats reasoning theater state labels", () => {
    expect(REASONING_THEATER_ARCHETYPE_LABEL.missing_evidence).toBe("missing evidence");
    expect(REASONING_THEATER_PHASE_LABEL.synthesize).toBe("synthesize");
    expect(REASONING_THEATER_CERTAINTY_LABEL.hypothesis).toBe("hypothesis");
    expect(REASONING_THEATER_SUPPRESSION_LABEL.agi_overload_admission_control).toBe(
      "agi overload admission control",
    );
  });

  it("resolves certainty class display buckets from text and hit counts", () => {
    expect(
      resolveReasoningTheaterCertaintyClass({
        allText: "verdict: pass integrity: ok",
        suppressionReason: null,
        passHits: 0,
        failHits: 0,
        evidenceHits: 0,
        ambiguityHits: 0,
      }),
    ).toBe("confirmed");
    expect(
      resolveReasoningTheaterCertaintyClass({
        allText: "candidate hypothesis",
        suppressionReason: null,
        passHits: 3,
        failHits: 0,
        evidenceHits: 1,
        ambiguityHits: 0,
      }),
    ).toBe("hypothesis");
    expect(
      resolveReasoningTheaterCertaintyClass({
        allText: "evidence received",
        suppressionReason: null,
        passHits: 0,
        failHits: 0,
        evidenceHits: 1,
        ambiguityHits: 0,
      }),
    ).toBe("reasoned");
    expect(
      resolveReasoningTheaterCertaintyClass({
        allText: "missing source",
        suppressionReason: "missing_evidence",
        passHits: 10,
        failHits: 0,
        evidenceHits: 10,
        ambiguityHits: 0,
      }),
    ).toBe("unknown");
  });

  it("resolves suppression reasons from deterministic display text patterns", () => {
    expect(resolveReasoningTheaterSuppressionReason("voice_context_ineligible")).toBe(
      "context_ineligible",
    );
    expect(resolveReasoningTheaterSuppressionReason("mission rate limited")).toBe(
      "mission_rate_limited",
    );
    expect(resolveReasoningTheaterSuppressionReason("AGI overload admission control")).toBe(
      "agi_overload_admission_control",
    );
    expect(resolveReasoningTheaterSuppressionReason("ordinary reasoning progress")).toBeNull();
    expect(REASONING_THEATER_SUPPRESSION_REASONS.has("contract_violation")).toBe(true);
  });

  it("resolves reasoning theater phase from text and structured tool labels", () => {
    expect(resolveReasoningTheaterPhase("final answer is ready", [])).toBe("debrief");
    expect(resolveReasoningTheaterPhase("checking certificate integrity", [])).toBe("verify");
    expect(resolveReasoningTheaterPhase("need context files", [])).toBe("retrieve");
    expect(resolveReasoningTheaterPhase("ordinary observation", [{ tool: "search.retrieve" }])).toBe(
      "retrieve",
    );
    expect(resolveReasoningTheaterPhase("ordinary observation", [{ tool: "route.plan" }])).toBe(
      "plan",
    );
    expect(resolveReasoningTheaterPhase("ordinary observation", [])).toBe("observe");
  });

  it("resolves theater medal events from deterministic state transitions", () => {
    const base: ReasoningTheaterMedalStateSnapshot = {
      stance: "contested",
      archetype: "ambiguity",
      phase: "observe",
      certaintyClass: "reasoned",
      suppressionReason: null,
      ambiguityPressure: 0.5,
      passHits: 1,
      evidenceHits: 1,
    };

    expect(resolveReasoningTheaterMedal({ current: { ...base, phase: "retrieve" }, previous: null })).toEqual({
      medal: "scout",
      reason: "Retrieval/search engaged.",
    });
    expect(
      resolveReasoningTheaterMedal({
        current: { ...base, stance: "fail_closed", suppressionReason: "contract_violation" },
        previous: base,
      }),
    ).toEqual({
      medal: "seal",
      reason: "Constraint block/fail-closed activated.",
    });
    expect(
      resolveReasoningTheaterMedal({
        current: { ...base, evidenceHits: 4 },
        previous: base,
      }),
    ).toEqual({
      medal: "anchor",
      reason: "Grounding/evidence improved.",
    });
    expect(
      resolveReasoningTheaterMedal({
        current: { ...base, stance: "winning", certaintyClass: "confirmed" },
        previous: base,
      }),
    ).toEqual({
      medal: "crown",
      reason: "Verified conclusion reached.",
    });
    expect(resolveReasoningTheaterMedal({ current: base, previous: base })).toBeNull();
  });

  it("formats medal labels and asset paths", () => {
    expect(REASONING_THEATER_MEDAL_LABEL.scout).toBe("Scout");
    expect(REASONING_THEATER_MEDAL_LABEL.crown).toBe("Crown");
    expect(REASONING_THEATER_MEDAL_ASSET.scout).toBe("/reasoning-theater/medals/scout.svg");
    expect(REASONING_THEATER_MEDAL_ASSET.crown).toBe("/reasoning-theater/medals/crown.svg");
  });

  it("formats Mirek cell visual classes", () => {
    expect(mirekCellParticleClassName("proof")).toContain("bg-violet-200/90");
    expect(mirekCellParticleClassName("blocked")).toContain("bg-rose-300/90");
    expect(mirekCellParticleClassName("empty")).toContain("bg-sky-200/65");
    expect(mirekCellGridClassName("proof")).toContain("bg-white");
    expect(mirekCellGridClassName("gap")).toContain("bg-amber-100/80");
    expect(mirekCellGridClassName("context")).toContain("bg-white/55");
  });

  it("builds deterministic frontier particle nodes", () => {
    expect(buildReasoningTheaterFrontierParticles(42, 3)).toEqual([
      {
        id: "frontier-particle-0",
        phaseOffsetMs: 586,
        baseRadiusPx: 3.6122241225093603,
      },
      {
        id: "frontier-particle-1",
        phaseOffsetMs: 153,
        baseRadiusPx: 3.5469013242051,
      },
      {
        id: "frontier-particle-2",
        phaseOffsetMs: 591,
        baseRadiusPx: 3.1482825789600613,
      },
    ]);
  });

  it("projects Mirek artifact cells into deterministic theater particles", () => {
    const artifact = {
      finalFrameHash: "frame-123",
      grid: {
        width: 4,
        height: 2,
        cells: [
          { id: "objective:1", x: 0, y: 0, kind: "objective", opacity: 1.4 },
          { id: "evidence:1", x: 3, y: 1, kind: "evidence", opacity: -0.2 },
          { id: "support:1", x: 1, y: 1, kind: "support", opacity: 0.5 },
        ],
      },
    } as MirekReasoningArtifactV1;

    expect(buildReasoningTheaterParticlesFromMirekArtifact(artifact)).toEqual([
      {
        id: "objective:1",
        leftPct: 12.5,
        topPct: 25,
        sizePx: 5,
        opacity: 1,
        delayS: 0.656,
        durationS: 2.7409999999999997,
        kind: "objective",
      },
      {
        id: "evidence:1",
        leftPct: 87.5,
        topPct: 75,
        sizePx: 3.9,
        opacity: 0,
        delayS: 0.716,
        durationS: 1.9209999999999998,
        kind: "evidence",
      },
      {
        id: "support:1",
        leftPct: 37.5,
        topPct: 75,
        sizePx: 3,
        opacity: 0.5,
        delayS: 0.408,
        durationS: 2.093,
        kind: "support",
      },
    ]);
  });

  it("builds deterministic Mirek display grids from artifact and theater snapshots", () => {
    const artifact = {
      finalFrameHash: "grid-frame-123",
      source: {
        provenanceMode: "strict_exact",
      },
      state: {
        phase: "retrieve",
        certaintyClass: "reasoned",
      },
      grid: {
        width: 4,
        height: 3,
        cells: [
          { id: "objective:1", x: 1, y: 1, kind: "objective", opacity: 0.9 },
          { id: "proof:1", x: 3, y: 2, kind: "proof", opacity: 0.7 },
        ],
      },
    } as MirekReasoningArtifactV1;
    const theater = {
      stance: "contested",
      momentum: 0.6,
      ambiguityPressure: 0.2,
    };

    expect(mirekReasoningDisplayDensity(artifact, theater)).toBe(0.48);

    const grid = buildMirekReasoningDisplayGrid(artifact, theater);
    expect(grid.width).toBe(4);
    expect(grid.height).toBe(3);
    expect(grid.cells).toHaveLength(12);
    expect(grid.cells.filter((cell) => cell.semantic)).toEqual([
      expect.objectContaining({
        id: "mirek-display-5",
        x: 1,
        y: 1,
        kind: "objective",
        active: true,
      }),
      expect.objectContaining({
        id: "mirek-display-11",
        x: 3,
        y: 2,
        kind: "proof",
        active: true,
      }),
    ]);
    expect(grid.cells.map((cell) => Number(cell.intensity.toFixed(3)))).toEqual([
      0.648,
      0.839,
      0.758,
      0.007,
      0.091,
      1,
      0.027,
      0.756,
      0.648,
      0.847,
      0.907,
      0.909,
    ]);
  });
});
