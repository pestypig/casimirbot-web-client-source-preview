import { describe, expect, it } from "vitest";
import type { HelixCausalTurnEvent } from "@shared/helix-causal-turn-timeline";
import {
  buildReasoningBattleAmbientState,
  buildReasoningBattleBeats,
  reasoningBattleBeatPrimitive,
  reasoningBattleBeatClassName,
  type ReasoningBattleBeat,
  type ReasoningBattleBeatKind,
  type ReasoningBattleLane,
} from "../reasoning-battle-stage";

function event(input: Partial<HelixCausalTurnEvent> & Pick<HelixCausalTurnEvent, "stage" | "sequence">): HelixCausalTurnEvent {
  const { stage, sequence, ...rest } = input;
  return {
    schema: "helix.causal_turn_event.v1",
    turn_id: "turn-a",
    event_id: `turn-a:event:${sequence}:${stage}`,
    sequence,
    stage,
    producer: "model",
    input_refs: [],
    output_refs: [],
    status: "succeeded",
    assistant_answer: false,
    raw_content_included: false,
    ...rest,
  };
}

function labels(beats: ReasoningBattleBeat[]): string[] {
  return beats.map((beat: ReasoningBattleBeat) => `${beat.impact > 0 ? "+" : beat.impact < 0 ? "-" : ""}${beat.label}`);
}

describe("reasoning battle stage", () => {
  it("builds identical beats for identical timeline input", () => {
    const timelineEvents = [
      event({ sequence: 1, stage: "goal_classified" }),
      event({ sequence: 2, stage: "model_step_decided" }),
      event({ sequence: 3, stage: "terminal_artifact_selected" }),
    ];

    const left = buildReasoningBattleBeats({ timelineEvents, liveEvents: [], nowMs: 123 });
    const right = buildReasoningBattleBeats({ timelineEvents, liveEvents: [], nowMs: 123 });

    expect(right).toEqual(left);
  });

  it("changes beat order and ids when the causal sequence changes", () => {
    const first = buildReasoningBattleBeats({
      timelineEvents: [
        event({ sequence: 1, stage: "goal_classified" }),
        event({ sequence: 2, stage: "tool_observation_created" }),
      ],
      liveEvents: [],
      nowMs: 123,
    });
    const second = buildReasoningBattleBeats({
      timelineEvents: [
        event({ sequence: 1, stage: "tool_observation_created" }),
        event({ sequence: 2, stage: "goal_classified" }),
      ],
      liveEvents: [],
      nowMs: 123,
    });

    expect(labels(first)).toEqual(["+orient", "+tool"]);
    expect(labels(second)).toEqual(["+tool", "+orient"]);
    expect(second.map((beat: ReasoningBattleBeat) => beat.id)).not.toEqual(
      first.map((beat: ReasoningBattleBeat) => beat.id),
    );
  });

  it("maps blocked coverage gates to gap pressure", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [
        event({
          sequence: 1,
          stage: "coverage_gate_evaluated",
          status: "blocked",
          reason_code: "missing_evidence",
        }),
      ],
      liveEvents: [],
      nowMs: 123,
    });

    expect(beats[0]).toMatchObject({
      lane: "ambiguity",
      kind: "gap",
      label: "gap",
      impact: -2,
      raw_content_included: false,
    });
  });

  it("maps tool observations without copying raw event content", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [
        event({
          sequence: 1,
          stage: "tool_observation_created",
          public_summary: "Sensitive raw observation text should not become the popup.",
        }),
      ],
      liveEvents: [],
      nowMs: 123,
    });

    expect(labels(beats)).toEqual(["+tool"]);
    expect(beats[0]?.label).not.toContain("Sensitive");
  });

  it("maps stale route labels to stale pressure", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [
        event({
          sequence: 1,
          stage: "route_label_set",
          status: "superseded",
          reason_code: "stale_route_label",
        }),
      ],
      liveEvents: [],
      nowMs: 123,
    });

    expect(beats[0]).toMatchObject({
      lane: "ambiguity",
      kind: "recoil",
      label: "stale",
      impact: -2,
    });
  });

  it("maps terminal selection to settle", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [event({ sequence: 1, stage: "terminal_artifact_selected" })],
      liveEvents: [],
      nowMs: 123,
    });

    expect(labels(beats)).toEqual(["+settle"]);
  });

  it("maps theater proof and integrity hard stops to sealed pressure", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [],
      liveEvents: [],
      theaterState: {
        trace_id: "trace-a",
        suppression_reason: "contract_violation",
        telemetry: {
          proof_verdict: "FAIL",
          certificate_integrity_ok: false,
        },
        scenario_id: "scenario-a",
      },
      nowMs: 123,
    });

    expect(labels(beats)).toEqual(["-sealed", "-sealed"]);
    expect(beats.every((beat: ReasoningBattleBeat) => beat.raw_content_included === false)).toBe(true);
  });

  it("bounds and deduplicates beat output", () => {
    const timelineEvents = Array.from({ length: 14 }, (_: unknown, index: number) =>
      event({ sequence: index + 1, stage: "model_step_decided" }),
    );
    const allBeats = buildReasoningBattleBeats({ timelineEvents, liveEvents: [], nowMs: 123 });
    const nextBeats = buildReasoningBattleBeats({
      timelineEvents,
      liveEvents: [],
      previousBeatIds: new Set(allBeats.map((beat: ReasoningBattleBeat) => beat.id)),
      nowMs: 123,
    });

    expect(allBeats).toHaveLength(10);
    expect(nextBeats).toHaveLength(4);
    expect(new Set(allBeats.map((beat: ReasoningBattleBeat) => beat.id)).size).toBe(10);
  });

  it("never copies final answer or raw model text into beat labels", () => {
    const beats = buildReasoningBattleBeats({
      timelineEvents: [
        event({
          sequence: 1,
          stage: "visible_response_written",
          public_summary: "selected_final_answer assistant_answer raw model text",
        }),
      ],
      liveEvents: [],
      nowMs: 123,
    });

    expect(beats[0]?.label).toBe("final");
    expect(JSON.stringify(beats)).not.toContain("selected_final_answer");
    expect(JSON.stringify(beats)).not.toContain("raw model text");
  });

  it("uses static classes when reduced motion is requested", () => {
    const beat = buildReasoningBattleBeats({
      timelineEvents: [event({ sequence: 1, stage: "repo_evidence_observation_created" })],
      liveEvents: [],
      nowMs: 123,
    })[0]!;

    expect(reasoningBattleBeatClassName(beat, true)).toContain("reasoning-battle-pop--static");
    expect(reasoningBattleBeatClassName(beat, true)).not.toContain("reasoning-battle-pop--float");
  });

  it("maps every beat kind to a replay-safe visual primitive", () => {
    const expected: Record<ReasoningBattleBeatKind, string> = {
      orient: "pulse",
      arm: "spark",
      strike: "slash",
      observe: "pulse",
      clarify: "pulse",
      support: "pulse",
      gap: "notch",
      block: "gate",
      recoil: "recoil",
      repair: "spark",
      settle: "settle",
      seal: "ring",
    };

    for (const [kind, primitiveKind] of Object.entries(expected) as Array<[ReasoningBattleBeatKind, string]>) {
      const lane: ReasoningBattleLane =
        kind === "gap" || kind === "block" || kind === "recoil" || kind === "seal"
          ? "ambiguity"
          : kind === "settle"
            ? "terminal"
            : "orb";
      const primitive = reasoningBattleBeatPrimitive({
        kind,
        lane,
        impact: lane === "ambiguity" ? -2 : 2,
      });
      expect(primitive).toMatchObject({
        kind: primitiveKind,
        lane,
        raw_content_included: false,
      });
    }
  });

  it("categorizes the interval after a model decision as model waiting", () => {
    const state = buildReasoningBattleAmbientState({
      timelineEvents: [event({ sequence: 1, stage: "model_step_decided", timestamp_ms: 1000 })],
      liveEvents: [],
      nowMs: 2500,
    });

    expect(state).toMatchObject({
      kind: "waiting_model",
      lane: "orb",
      label: "thinking",
      elapsed_ms: 1500,
      raw_content_included: false,
    });
  });

  it("categorizes stale blocked intervals as quiet pressure-free waiting", () => {
    const state = buildReasoningBattleAmbientState({
      timelineEvents: [event({ sequence: 1, stage: "runtime_tool_dispatched", timestamp_ms: 1000 })],
      liveEvents: [],
      nowMs: 8000,
    });

    expect(state).toMatchObject({
      kind: "quiet",
      lane: "neutral",
      label: "quiet",
      stale: true,
      intensity: 3,
      raw_content_included: false,
    });
  });

  it("categorizes terminal intervals as settled", () => {
    const state = buildReasoningBattleAmbientState({
      timelineEvents: [event({ sequence: 1, stage: "visible_response_written", timestamp_ms: 1000 })],
      liveEvents: [],
      nowMs: 9000,
    });

    expect(state).toMatchObject({
      kind: "settled",
      lane: "terminal",
      label: "settled",
      intensity: 0,
      stale: false,
      raw_content_included: false,
    });
  });
});
