import { describe, expect, it } from "vitest";
import {
  answerNoteForCompactToolTraceItems,
  buildAskLiveEventLogDetailPayload,
  buildAskLiveEventLogExport,
  buildCompactToolTraceDisclosure,
  cleanHelixRenderedFinalAnswerText,
  cleanHelixRenderedQuestionText,
  classifyCompactToolTraceAction,
  formatAskLiveEventLogLine,
  HELIX_ASK_PROGRESS_PLACEHOLDER_TEXT,
  isHelixAskProgressPlaceholderText,
  normalizedDebugReplyText,
  parseAskLiveEventTimestampMs,
  parseHelixAskQueuedQuestionsInput,
  readAskLiveEventIdentity,
  readEventMetaString,
  readHelixAskDebugContextFromMeta,
  resolveAskLiveEventTimestampMs,
  safeJsonStringify,
  summarizeHelixAgentRuntimeLoopForCopy,
  summarizeHelixDebugArtifactsForCopy,
  summarizeHelixDebugObservationForCopy,
  type AskLiveEventEntry,
} from "@/lib/helix/ask-debug-event-display";

describe("Helix Ask debug event display", () => {
  it("formats live event log lines with stable labels and clipped text", () => {
    const event: AskLiveEventEntry = {
      id: "event-1",
      text: `Observation ${"x".repeat(260)}`,
      tool: "helix.ask.route.product",
      tsMs: Date.UTC(2026, 0, 2, 3, 4, 5, 678),
      seq: 4.8,
      durationMs: 12.6,
      meta: {
        stage: "route",
        status: "ok",
        detail: "terminal",
      },
    };

    expect(formatAskLiveEventLogLine(event)).toBe(
      `[03:04:05.678] tool=route product | stage=route | status=ok | detail=terminal | seq=4 | dur=13ms | text=Observation ${"x".repeat(205)}...`,
    );
  });

  it("builds newline exports and leaves an empty event list empty", () => {
    expect(buildAskLiveEventLogExport([])).toBe("");
    expect(
      buildAskLiveEventLogExport([
        { id: "event-1", text: "first", tool: "helix.ask.first", tsMs: 0 },
        { id: "event-2", text: "second", tool: "custom.tool", tsMs: 1 },
      ]),
    ).toBe(
      [
        "[00:00:00.000] tool=first | text=first",
        "[00:00:00.001] tool=custom.tool | text=second",
      ].join("\n"),
    );
  });

  it("renders detail payloads with normalized timestamps, durations, and circular metadata", () => {
    const meta: Record<string, unknown> = { stage: "loop" };
    meta.self = meta;
    const detail = JSON.parse(
      buildAskLiveEventLogDetailPayload({
        id: "event-3",
        text: "payload",
        tool: "helix.ask.detail",
        ts: "2026-01-02T03:04:05.000Z",
        seq: 7,
        durationMs: 4.6,
        meta,
      }),
    ) as Record<string, unknown>;

    expect(detail).toMatchObject({
      id: "event-3",
      ts: "2026-01-02T03:04:05.000Z",
      tsMs: Date.UTC(2026, 0, 2, 3, 4, 5),
      tool: "helix.ask.detail",
      seq: 7,
      durationMs: 5,
      text: "payload",
    });
    expect(detail.meta).toMatchObject({ stage: "loop", self: "[Circular]" });
  });

  it("stringifies debug payloads with circular references and bigints without owning export authority", () => {
    const payload: Record<string, unknown> = { count: 3n };
    payload.self = payload;

    expect(JSON.parse(safeJsonStringify(payload))).toEqual({
      count: "3",
      self: "[Circular]",
    });
  });

  it("reads timestamp and metadata aliases without defaulting to UI state", () => {
    expect(resolveAskLiveEventTimestampMs({ id: "event-4", text: "", tsMs: 42 })).toBe(42);
    expect(resolveAskLiveEventTimestampMs({ id: "event-5", text: "", ts: "bad" })).toBeNull();
    expect(parseAskLiveEventTimestampMs(42.8)).toBe(42);
    expect(parseAskLiveEventTimestampMs(" 42.8 ")).toBe(42);
    expect(parseAskLiveEventTimestampMs("2026-01-02T03:04:05.000Z")).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(readEventMetaString({ trace_id: " trace-1 ", traceId: "trace-2" }, ["traceId", "trace_id"])).toBe(
      "trace-2",
    );
    expect(readEventMetaString({ trace_id: " trace-1 " }, ["traceId", "trace_id"])).toBe("trace-1");
    expect(readEventMetaString(undefined, ["traceId"])).toBeNull();
    expect(
      readAskLiveEventIdentity({
        id: "event-identity",
        text: "identity",
        meta: {
          active_turn_id: " turn-active ",
          ask_trace_id: " trace-active ",
        },
      }),
    ).toEqual({ turnId: "turn-active", traceId: "trace-active" });
    expect(readAskLiveEventIdentity({ id: "event-no-identity", text: "identity" })).toEqual({
      turnId: null,
      traceId: null,
    });
  });

  it("preserves queued prompt input as a single normalized turn", () => {
    const prompt = "First instruction\r\n\r\n---\r\nQuestion 2: keep this as content";

    expect(parseHelixAskQueuedQuestionsInput(prompt)).toEqual([
      "First instruction\n\n---\nQuestion 2: keep this as content",
    ]);
    expect(parseHelixAskQueuedQuestionsInput("   \n")).toEqual([]);
  });

  it("cleans rendered debug question and final-answer labels without choosing the debug target", () => {
    expect(cleanHelixRenderedQuestionText("2 Question QUESTION Current whitepaper? USER PROMPT")).toBe(
      "Current whitepaper?",
    );
    expect(cleanHelixRenderedQuestionText("   ")).toBeNull();
    expect(
      cleanHelixRenderedFinalAnswerText(
        "Final answer FINAL Compound answer body COMPOUND EVIDENCE SYNTHESIS ANSWER",
      ),
    ).toBe("Compound answer body");
    expect(cleanHelixRenderedFinalAnswerText("Final answer final 3 + 5 = 8 workstation tool evaluation")).toBe(
      "3 + 5 = 8",
    );
    expect(normalizedDebugReplyText("  A\n\n  compact\tanswer  ")).toBe("A compact answer");
    expect(normalizedDebugReplyText(42)).toBe("42");
  });

  it("recognizes the shared in-progress placeholder without owning reply lifecycle behavior", () => {
    expect(HELIX_ASK_PROGRESS_PLACEHOLDER_TEXT).toBe("Reasoning in progress...");
    expect(isHelixAskProgressPlaceholderText(" reasoning in progress... ")).toBe(true);
    expect(isHelixAskProgressPlaceholderText("Reasoning complete.")).toBe(false);
    expect(isHelixAskProgressPlaceholderText(null)).toBe(false);
  });

  it("reads debug context from event metadata without choosing a debug export target", () => {
    const envelope = { contextFiles: ["docs/current.md"], contextFileCount: 1, source: "server" };

    expect(readHelixAskDebugContextFromMeta({ helixDebugContext: envelope })).toBe(envelope);
    expect(
      readHelixAskDebugContextFromMeta({
        contextFiles: ["docs/current.md", "docs/current.md", "docs/Other.md"],
        evidenceRefs: ["docs/current.md", "docs/other.md", 42],
      }),
    ).toEqual({
      contextFiles: ["docs/current.md", "docs/Other.md"],
      contextFileCount: 2,
    });
    expect(readHelixAskDebugContextFromMeta({ contextFiles: [], evidenceRefs: [42] })).toBeNull();
  });

  it("builds compact tool trace disclosure copy without owning debug export authority", () => {
    expect(classifyCompactToolTraceAction("scientific-calculator", "solve_expression")).toMatchObject({
      role: "scalar_solver",
      authority: "numeric_observation",
    });
    expect(classifyCompactToolTraceAction("docs-viewer", "lookup_source")).toMatchObject({
      role: "source_lookup",
      authority: "source_evidence",
    });
    expect(
      answerNoteForCompactToolTraceItems([
        { role: "source_lookup" },
        { role: "scalar_solver" },
      ]),
    ).toBe("Evidence note: source lookup supplied evidence; Scientific Calculator receipts supplied the numeric result.");

    expect(
      buildCompactToolTraceDisclosure(
        {
          workstation_actions: [
            { panel_id: "docs-viewer", action_id: "lookup_source" },
            { panel_id: "scientific-calculator", action_id: "solve_expression" },
            { action: "restore_view_state" },
          ],
        },
        "turn-1",
      ),
    ).toMatchObject({
      schema: "helix.ask_tool_trace_disclosure.v1",
      disclosureId: "turn-1:tool_trace_disclosure",
      turnId: "turn-1",
      action_keys: [
        "docs-viewer.lookup_source",
        "scientific-calculator.solve_expression",
        "workstation.restore_view_state",
      ],
      assistant_answer: false,
      terminal_eligible: false,
    });
  });

  it("summarizes debug observations and artifacts without selecting a debug target", () => {
    expect(
      summarizeHelixDebugObservationForCopy({
        artifact_id: "artifact-1",
        kind: "tool_observation",
        status: "ok",
        ok: true,
        payload: { schema: "helix.observation.v1" },
      }),
    ).toEqual({
      artifact_id: "artifact-1",
      kind: "tool_observation",
      schema: "helix.observation.v1",
      status: "ok",
      ok: true,
    });

    expect(
      summarizeHelixDebugArtifactsForCopy([
        {
          artifact_id: "artifact-2",
          kind: "calculator",
          source_scope: "workstation",
          payload: {
            schema: "helix.calc.v1",
            toolName: "scientific-calculator.solve_expression",
            expression: "8*9",
            result: "72",
            supports_goal: true,
            compound_dependency_turn_plan: {
              rail_status: "satisfied",
              typed_affordance_binding: {
                status: "bound",
                bound_expression: "8*9",
                missing_variables: [],
              },
            },
            text: `result ${"x".repeat(260)}`,
          },
        },
      ])[0],
    ).toMatchObject({
      artifact_id: "artifact-2",
      kind: "calculator",
      source_scope: "workstation",
      payload_schema: "helix.calc.v1",
      tool_name: "scientific-calculator.solve_expression",
      expression: "8*9",
      result: "72",
      supports_goal: true,
      compound_rail_status: "satisfied",
      typed_affordance_binding_status: "bound",
      bound_calculator_expression: "8*9",
      missing_calculator_variables: [],
    });
  });

  it("summarizes agent runtime loop iterations with bounded observations", () => {
    expect(
      summarizeHelixAgentRuntimeLoopForCopy({
        schema: "helix.agent_runtime_loop.v1",
        status: "complete",
        selected_capability: "scientific-calculator.solve_expression",
        executed_tool_call_count: 1,
        iterations: [
          {
            iteration: 3,
            decision_id: "decision-1",
            chosen_capability: "scientific-calculator.solve_expression",
            executed_action_key: "calculator:solve",
            observed_artifact_refs: Array.from({ length: 10 }, (_, index) => `artifact-${index}`),
            tool_observation: {
              artifact_id: "artifact-result",
              payload: { schema: "helix.calc.result.v1", ok: true },
            },
          },
        ],
      }),
    ).toMatchObject({
      schema: "helix.agent_runtime_loop.v1",
      status: "complete",
      selected_capability: "scientific-calculator.solve_expression",
      executed_tool_call_count: 1,
      iteration_count: 1,
      iterations: [
        {
          iteration: 3,
          decision_id: "decision-1",
          chosen_capability: "scientific-calculator.solve_expression",
          executed_action_key: "calculator:solve",
          observed_artifact_refs: [
            "artifact-0",
            "artifact-1",
            "artifact-2",
            "artifact-3",
            "artifact-4",
            "artifact-5",
            "artifact-6",
            "artifact-7",
          ],
          tool_observation: {
            artifact_id: "artifact-result",
            schema: "helix.calc.result.v1",
            ok: true,
          },
        },
      ],
    });
  });
});
