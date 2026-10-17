import { describe, expect, it } from "vitest";
import {
  applyWorkstationProcessGraphEvent,
  buildWorkstationProcessGraphSnapshot,
  createInitialWorkstationProcessGraphState,
} from "../processGraphReducer";

describe("workstation process graph snapshot", () => {
  it("returns a deterministic read-only artifact shape", () => {
    const withJob = applyWorkstationProcessGraphEvent(createInitialWorkstationProcessGraphState("session:test"), {
      type: "job.started",
      jobId: "job-1",
      label: "Translate source",
      traceId: "trace-job",
      panelId: "situation-room-pipelines",
      ts: "2026-05-15T10:00:00.000Z",
    });
    const snapshot = buildWorkstationProcessGraphSnapshot(withJob, { maxNodes: 20 });

    expect(snapshot).toMatchObject({
      kind: "workstation_process_graph_snapshot",
      schemaVersion: "helix.workstation.process_graph.snapshot/v1",
      sessionId: "session:test",
    });
    expect(snapshot.summary.activeJobs).toBe(1);
    expect(snapshot.nodes.some((node) => node.kind === "job" && node.jobId === "job-1")).toBe(true);
  });

  it("drops hidden reasoning and private scratch fields from snapshots", () => {
    const state = applyWorkstationProcessGraphEvent(createInitialWorkstationProcessGraphState("session:test"), {
      type: "tool.completed",
      tool: "docs-viewer.inspect",
      traceId: "trace-hidden_reasoning",
      panelId: "docs-viewer",
      label: "chain_of_thought should not surface",
      artifact: {
        kind: "doc_context",
        title: "scratchpad should not surface",
        hidden_reasoning: "private",
        nested: {
          chain_of_thought: "private",
          visible: "allowed",
        },
      },
      ts: "2026-05-15T10:00:00.000Z",
    });
    const snapshot = buildWorkstationProcessGraphSnapshot(state, { includeTimeline: true });
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("hidden_reasoning");
    expect(serialized).not.toContain("chain_of_thought");
    expect(serialized).not.toContain("scratchpad");
  });
});
