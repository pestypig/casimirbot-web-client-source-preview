import { describe, expect, it } from "vitest";
import {
  buildReasoningBattleAnswerTint,
  reasoningBattleAmbientClassName,
  reasoningBattleAmbientMarkerClassName,
  reasoningBattleBeatHeightPx,
  reasoningBattleBeatPositionPct,
  reasoningBattlePrimitiveClassName,
  reasoningBattlePrimitiveStyle,
} from "../ask-reasoning-battle-display";
import type {
  ReasoningBattleAmbientState,
  ReasoningBattleBeat,
  ReasoningBattleVisualPrimitive,
} from "../reasoning-battle-stage";

const beat: ReasoningBattleBeat = {
  id: "beat:test",
  kind: "tool_progress",
  lane: "orb",
  label: "tool",
  impact: 2,
  progress_delta: 2,
  pressure_delta: 0,
  ttl_ms: 900,
  created_at_ms: 100,
  raw_content_included: false,
};

const primitive: ReasoningBattleVisualPrimitive = {
  kind: "spark",
  lane: "orb",
  intensity: 2,
  direction: "forward",
};

const ambient: ReasoningBattleAmbientState = {
  kind: "running",
  lane: "orb",
  stage: "tool",
  label: "running",
  intensity: 2,
  elapsed_ms: 1200,
};

describe("ask reasoning battle display helpers", () => {
  it("projects deterministic beat position and height", () => {
    expect(reasoningBattleBeatPositionPct(beat)).toBe(reasoningBattleBeatPositionPct(beat));
    expect(reasoningBattleBeatPositionPct(beat)).toBeGreaterThanOrEqual(10);
    expect(reasoningBattleBeatPositionPct(beat)).toBeLessThanOrEqual(58);
    expect(reasoningBattleBeatHeightPx(beat)).toBeLessThan(0);
  });

  it("formats primitive classes and motion styles", () => {
    expect(reasoningBattlePrimitiveClassName(primitive)).toContain("bg-emerald");
    const animated = reasoningBattlePrimitiveStyle({ beat, primitive, reducedMotion: false });
    expect(animated.left).toMatch(/%$/);
    expect(animated.animation).toContain("helixReasoningBattlePrimitive");
    expect(animated["--battle-primitive-scale"]).toBe("1.18");

    const reduced = reasoningBattlePrimitiveStyle({ beat, primitive, reducedMotion: true });
    expect(reduced.animation).toBeUndefined();
    expect(reduced.transform).toContain("translate3d");
  });

  it("formats ambient classes without owning runtime state", () => {
    expect(reasoningBattleAmbientClassName(ambient, false)).toContain("animate-pulse");
    expect(reasoningBattleAmbientClassName(ambient, true)).not.toContain("animate-pulse");
    expect(reasoningBattleAmbientMarkerClassName(ambient, false)).toContain("bg-emerald");
  });

  it("builds answer tint from battle state", () => {
    const tint = buildReasoningBattleAnswerTint({ beats: [beat], ambient });
    expect(tint?.label).toBe("constructive");
    expect(tint?.palette).toMatch(/^rgb\(/);
    expect(tint?.style.background).toContain("linear-gradient");

    expect(buildReasoningBattleAnswerTint({
      beats: [],
      ambient: { ...ambient, kind: "idle", intensity: 0 },
    })).toBeNull();
  });
});
