import { beforeAll, describe, expect, it } from "vitest";

let TurnLoopHarness: typeof import("@/lib/helix/turn-loop-harness").TurnLoopHarness;
let runTurnLoopHarnessScenario: typeof import("@/lib/helix/turn-loop-harness").runTurnLoopHarnessScenario;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ TurnLoopHarness, runTurnLoopHarnessScenario } = await import("@/lib/helix/turn-loop-harness"));
});

describe("TurnLoopHarness", () => {
  it("seals only when all gate conditions are simultaneously true", () => {
    const harness = new TurnLoopHarness({ turnKey: "voice:test-seal" });
    harness.ingestSegment({ atMs: 1_000, text: "What is a system?" });
    harness.updateTransport({ atMs: 4_000, sttQueueDepth: 1, sttInFlight: false, heldPending: false });
    expect(harness.tick(4_200).sealed).toBe(false);

    harness.updateTransport({ atMs: 4_300, sttQueueDepth: 0, sttInFlight: true, heldPending: false });
    expect(harness.tick(4_500).sealed).toBe(false);

    harness.updateTransport({ atMs: 4_600, sttQueueDepth: 0, sttInFlight: false, heldPending: true });
    expect(harness.tick(4_700).sealed).toBe(false);

    harness.updateTransport({ atMs: 4_800, sttQueueDepth: 0, sttInFlight: false, heldPending: false });
    const seal = harness.tick(5_000);
    expect(seal.sealed).toBe(true);
    expect(seal.state.phase).toBe("sealed");
    expect(seal.state.sealedRevision).toBe(1);
    expect(seal.state.sealToken).toMatch(/^seal-1-/);
  });

  it("suppresses stale attempt completion after interruption and reseal", () => {
    const harness = new TurnLoopHarness({ turnKey: "voice:test-interrupt" });
    harness.ingestSegment({ atMs: 0, text: "What is a system?" });
    harness.tick(3_500);
    const a1 = harness.startAttempt({
      atMs: 3_550,
      attemptId: "attempt-r1",
      prompt: "What is a system?",
      dispatchPromptHash: "hash-r1",
    });
    expect(a1?.status).toBe("running");

    harness.interrupt({
      atMs: 3_700,
      transcript: "Make it about quantum inequality.",
      detail: "barge_in_hard_cut",
    });
    expect(harness.getState().phase).toBe("draft");
    expect(harness.getState().transcriptRevision).toBe(2);

    harness.tick(7_200);
    expect(harness.getState().phase).toBe("sealed");
    expect(harness.getState().sealedRevision).toBe(2);

    const staleResult = harness.resolveAttempt({
      atMs: 7_250,
      attemptId: "attempt-r1",
      finalText: "A stale final that should be suppressed.",
    });
    expect(staleResult.accepted).toBe(false);
    expect(staleResult.suppressionCause).toBe("sealed_revision_mismatch");
  });

  it("runs newest authoritative attempt after stale suppression without soft lock", () => {
    const result = runTurnLoopHarnessScenario(
      [
        { kind: "segment", atMs: 0, text: "What is a system?" },
        { kind: "tick", atMs: 3_500 },
        {
          kind: "start_attempt",
          atMs: 3_510,
          attemptId: "attempt-r1",
          prompt: "What is a system?",
          dispatchPromptHash: "hash-r1",
        },
        {
          kind: "interrupt",
          atMs: 3_700,
          transcript: "Make it about quantum inequality.",
          detail: "barge_in_hard_cut",
        },
        { kind: "tick", atMs: 7_300 },
        {
          kind: "resolve_attempt",
          atMs: 7_350,
          attemptId: "attempt-r1",
          finalText: "Stale completion.",
        },
        {
          kind: "start_attempt",
          atMs: 7_360,
          attemptId: "attempt-r2",
          prompt: "What is a system? Make it about quantum inequality.",
          dispatchPromptHash: "hash-r2",
        },
        {
          kind: "resolve_attempt",
          atMs: 7_650,
          attemptId: "attempt-r2",
          finalText: "A quantum system is a system constrained by quantum mechanics.",
        },
      ],
      { turnKey: "voice:test-no-soft-lock" },
    );

    const staleSuppression = result.events.find(
      (event) => event.kind === "attempt_suppressed" && event.attemptId === "attempt-r1",
    );
    expect(staleSuppression?.suppressionCause).toBe("sealed_revision_mismatch");

    const finalEvent = result.events.find(
      (event) => event.kind === "attempt_finalized" && event.attemptId === "attempt-r2",
    );
    expect(finalEvent?.finalSource).toBe("normal_reasoning");
    expect(finalEvent?.revision).toBe(2);

    const runningAttempts = result.attempts.filter((attempt) => attempt.status === "running");
    expect(runningAttempts).toHaveLength(0);
    expect(result.state.phase).toBe("sealed");
    expect(result.state.sealedRevision).toBe(2);

    const eventSeq = result.events.map((event) => event.seq);
    for (let index = 1; index < eventSeq.length; index += 1) {
      expect(eventSeq[index]).toBeGreaterThan(eventSeq[index - 1]);
    }
  });
});
