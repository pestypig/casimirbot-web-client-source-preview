import { describe, expect, it } from "vitest";

import {
  askLiveEventBelongsToActiveTurn,
  buildAskLiveAgenticEventRows,
  buildHelixActiveTurnStreamRows,
  buildHelixActiveTurnTranscriptRows,
  createHelixAskConsoleStreamIngressDebug,
  incrementHelixAskConsoleDropReason,
} from "@/lib/helix/ask-active-turn-stream";

describe("ask active turn stream", () => {
  it("creates console stream ingress debug counters with normalized ids", () => {
    expect(
      createHelixAskConsoleStreamIngressDebug({
        turnId: " turn-1 ",
        traceId: " trace-1 ",
        startedAtMs: 12.7,
      }),
    ).toMatchObject({
      schema: "helix.ask.console_stream_ingress_debug.v1",
      turnId: "turn-1",
      traceId: "trace-1",
      startedAtMs: 12,
      rawStreamPacketCount: 0,
      droppedReasons: {},
    });
  });

  it("increments dropped reason counts without mutating the previous object", () => {
    const previous = { old: 2 };
    const next = incrementHelixAskConsoleDropReason(previous, " invalid_transcript_record ");
    const fallback = incrementHelixAskConsoleDropReason(next, " ");

    expect(previous).toEqual({ old: 2 });
    expect(next).toEqual({ old: 2, invalid_transcript_record: 1 });
    expect(fallback).toEqual({ old: 2, invalid_transcript_record: 1, unknown: 1 });
  });

  it("matches active live events by turn or trace identity before timestamp fallback", () => {
    expect(
      askLiveEventBelongsToActiveTurn({
        activeTurnId: "turn-1",
        activeTraceId: "trace-1",
        event: {
          id: "event-1",
          ts: "2026-07-01T12:00:00.000Z",
          text: "working",
          meta: { turn_id: "turn-1" },
        },
      }),
    ).toBe(true);

    expect(
      askLiveEventBelongsToActiveTurn({
        activeTurnId: "turn-1",
        activeTraceId: "trace-1",
        activeStartedAtMs: Date.parse("2026-07-01T12:00:00.000Z"),
        event: {
          id: "event-2",
          ts: "2026-07-01T12:00:01.000Z",
          text: "stale",
          meta: { trace_id: "trace-older" },
        },
      }),
    ).toBe(false);
  });

  it("admits timestamp-only active live events started near the active turn", () => {
    const activeStartedAtMs = Date.parse("2026-07-01T12:00:00.000Z");

    expect(
      askLiveEventBelongsToActiveTurn({
        activeStartedAtMs,
        event: {
          id: "event-near",
          ts: "2026-07-01T11:59:59.600Z",
          text: "near start",
          meta: {},
        },
      }),
    ).toBe(true);

    expect(
      askLiveEventBelongsToActiveTurn({
        activeStartedAtMs,
        event: {
          id: "event-old",
          ts: "2026-07-01T11:59:59.000Z",
          text: "old",
          meta: {},
        },
      }),
    ).toBe(false);
  });

  it("keeps meaningful tool and model re-entry events visible in active stream rows", () => {
    const eventRows = buildAskLiveAgenticEventRows([
      {
        id: "tool-request",
        ts: "2026-07-01T12:00:01.000Z",
        text: "Tool request: scholarly-research.lookup_papers for NHM2 evidence.",
        meta: { source_event_type: "tool_request", turn_id: "ask:active" },
      },
      {
        id: "tool-observation",
        ts: "2026-07-01T12:00:02.000Z",
        text: "Tool observation: paper metadata retrieved.",
        meta: { source_event_type: "tool_observation", turn_id: "ask:active" },
      },
      {
        id: "model-reentry",
        ts: "2026-07-01T12:00:03.000Z",
        text: "Model re-entry: reasoning continues with retrieved observation.",
        meta: { source_event_type: "model_reentry", turn_id: "ask:active" },
      },
    ]);

    expect(eventRows.map((row) => row.label)).toEqual(["Observation", "Observation", "Observation"]);

    const streamRows = buildHelixActiveTurnStreamRows({
      question: "Find the current NHM2 whitepaper evidence.",
      eventRows,
    });

    expect(streamRows.map((row) => row.source)).toEqual(["question", "agent_work", "agent_work", "agent_work"]);
    expect(streamRows.map((row) => row.text).join("\n")).toContain("Tool request");
    expect(streamRows.map((row) => row.text).join("\n")).toContain("scholarly research.lookup papers");
    expect(streamRows.map((row) => row.text).join("\n")).toContain("paper metadata retrieved");
    expect(streamRows.map((row) => row.text).join("\n")).toContain("reasoning continues");
  });

  it("projects active live events through the same transcript rows used by completed turns", () => {
    const rows = buildHelixActiveTurnTranscriptRows({
      replyId: "ask:active",
      activeTurnId: "ask:active",
      activeTraceId: "trace:active",
      events: [
        {
          id: "tool-request",
          ts: "2026-07-01T12:00:01.000Z",
          text: "Request scholarly-research.lookup_papers.",
          tool: "scholarly-research.lookup_papers",
          meta: {
            source_event_type: "tool_request",
            turn_id: "ask:active",
            trace_id: "trace:active",
            status: "requested",
          },
        },
        {
          id: "tool-observation",
          ts: "2026-07-01T12:00:02.000Z",
          text: "Paper metadata retrieved.",
          tool: "scholarly-research.lookup_papers",
          meta: {
            source_event_type: "tool_observation",
            turn_id: "ask:active",
            trace_id: "trace:active",
            status: "observed",
          },
        },
        {
          id: "model-reentry",
          ts: "2026-07-01T12:00:03.000Z",
          text: "Model re-entry used the observation packet.",
          meta: {
            source_event_type: "model_reentry",
            turn_id: "ask:active",
            trace_id: "trace:active",
            status: "completed",
          },
        },
      ],
    });

    expect(rows.map((row) => row.label)).toEqual(["Tool Request", "Tool Observation", "Model Re-entry"]);
    expect(rows.map((row) => row.text).join("\n")).toContain("Paper metadata retrieved");
  });

  it("normalizes live-event lane source metadata for active transcript rows", () => {
    const rows = buildHelixActiveTurnTranscriptRows({
      replyId: "ask:active-lane-goal",
      activeTurnId: "ask:active-lane-goal",
      activeTraceId: "trace:active-lane-goal",
      events: [
        {
          id: "goal-lane",
          ts: "2026-07-01T12:00:04.000Z",
          text: "Goal-bound lane session: live_translation; latest chunk chunk-active; lane output remains observation-only.",
          tool: "live_translation",
          meta: {
            source_event_type: "lane_goal_binding",
            turn_id: "ask:active-lane-goal",
            trace_id: "trace:active-lane-goal",
            lane: "live_translation",
            stepId: "lane_goal_binding",
            status: "pending",
            selectedRuntimeAgentProvider: "codex",
            adapterBoundary: "helix_agent_provider_edge",
            sourceId: "docs:active",
            sourceHash: "sha256:active-doc",
            sourceKind: "docs",
            sourceTextHash: "sha256:active-source-text",
            sourceTextCharCount: 2048,
            sourceIdentityKey:
              "docs:active::sha256:active-doc::sha256:active-source-text::2048::docs::docs_chunk::es-US::es",
            sourceProjectionTarget: "docs_chunk",
            accountLocale: "es-US",
            latestProjectionTarget: "docs_chunk",
            targetLanguage: "es",
            latestChunkId: "chunk-active",
            latestDedupeKey: "docs:active:chunk-active:es",
            latestSourceEventId: "docs:active:event-1",
            latestFreshnessStatus: "fresh",
            materializedMailLoopEvidence: true,
            latestCancelRequested: true,
          },
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: "Goal Lane",
      text: expect.stringContaining("Goal-bound lane session"),
      meta: expect.stringContaining("source docs:active"),
      status: "pending",
    });
    expect(rows[0]?.meta).toContain("projection docs_chunk");
    expect(rows[0]?.meta).toContain("runtime provider codex");
    expect(rows[0]?.meta).toContain("adapter boundary helix_agent_provider_edge");
    expect(rows[0]?.meta).toContain("source hash sha256:active-doc");
    expect(rows[0]?.meta).toContain("source kind docs");
    expect(rows[0]?.meta).toContain("source payload hash sha256:active-source-text");
    expect(rows[0]?.meta).toContain("source payload chars 2048");
    expect(rows[0]?.meta).toContain(
      "source identity key docs:active::sha256:active-doc::sha256:active-source-text::2048::docs::docs_chunk::es-US::es",
    );
    expect(rows[0]?.meta).toContain("source projection docs_chunk");
    expect(rows[0]?.meta).toContain("account locale es-US");
    expect(rows[0]?.meta).toContain("target es");
    expect(rows[0]?.meta).toContain("chunk chunk-active");
    expect(rows[0]?.meta).toContain("dedupe docs:active:chunk-active:es");
    expect(rows[0]?.meta).toContain("source event docs:active:event-1");
    expect(rows[0]?.meta).toContain("freshness fresh");
    expect(rows[0]?.meta).toContain("materialized mail evidence true");
    expect(rows[0]?.meta).toContain("cancelled");
    expect(rows[0]?.meta).not.toContain("source text");
  });
});
