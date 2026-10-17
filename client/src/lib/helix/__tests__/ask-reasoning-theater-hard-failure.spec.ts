import { describe, expect, it } from "vitest";
import { readReasoningTheaterHardFailureSignals } from "@/lib/helix/ask-reasoning-theater-hard-failure";

describe("ask reasoning theater hard failure", () => {
  it("extracts unique hard-failure reasons from terminal audits and reviews", () => {
    const signals = readReasoningTheaterHardFailureSignals({
      resolved_turn_summary: {
        final_status: "final_answer",
        terminal_error_code: "direct_answer_unavailable",
      },
      observation_review: {
        runtime_next_action: "fail_closed",
        missing_piece: "direct_answer_unavailable",
      },
      poison_audit: {
        ok: false,
        violations: [
          {
            kind: "terminal_artifact_forbidden_by_route_contract",
          },
        ],
      },
      current_turn_events: [
        {
          type: "turn_completed",
          status: "failed",
        },
      ],
    });

    expect(signals.failed).toBe(true);
    expect(signals.reasons).toEqual([
      "poison_audit.ok_false",
      "terminal_artifact_forbidden_by_route_contract",
      "direct_answer_unavailable",
      "observation_review.fail_closed",
      "event.turn_completed.failed",
    ]);
  });

  it("extracts live-event and event-meta failures without duplicating reasons", () => {
    const signals = readReasoningTheaterHardFailureSignals(
      {
        terminal_error_code: "direct_answer_unavailable",
      },
      [
        {
          type: "turn_completed",
          status: "failed",
          error_code: "direct_answer_unavailable",
          meta: {
            visible_projection_invariant: {
              violations: ["terminal_artifact_forbidden_by_route_contract"],
            },
          },
        },
      ],
    );

    expect(signals.failed).toBe(true);
    expect(signals.reasons).toEqual([
      "direct_answer_unavailable",
      "turn_completed failed direct_answer_unavailable",
      "terminal_artifact_forbidden_by_route_contract",
    ]);
  });

  it("bounds returned reasons for noisy payloads", () => {
    const signals = readReasoningTheaterHardFailureSignals({
      current_turn_events: Array.from({ length: 12 }, (_, index) => ({
        type: `terminal-authority-${index}`,
        status: "failed",
      })),
    });

    expect(signals.failed).toBe(true);
    expect(signals.reasons).toHaveLength(8);
    expect(signals.reasons[0]).toBe("event.terminal-authority-0.failed");
  });

  it("does not fail for clean or malformed records", () => {
    expect(readReasoningTheaterHardFailureSignals(null).failed).toBe(false);
    expect(readReasoningTheaterHardFailureSignals({ current_turn_events: [{ status: "ok" }] })).toEqual({
      failed: false,
      reasons: [],
    });
  });
});
