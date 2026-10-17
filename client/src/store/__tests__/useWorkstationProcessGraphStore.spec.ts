import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKSTATION_PROCESS_GRAPH_PERSIST_DEBOUNCE_MS,
} from "@/lib/workstation/processGraph/processGraphPersistence";
import { createInitialWorkstationProcessGraphState } from "@/lib/workstation/processGraph/processGraphReducer";
import {
  flushQueuedWorkstationProcessGraphEvents,
  flushWorkstationProcessGraphPersistence,
  recordWorkstationProcessGraphEvent,
  useWorkstationProcessGraphStore,
} from "../useWorkstationProcessGraphStore";

describe("workstation process graph store batching", () => {
  beforeEach(() => {
    flushQueuedWorkstationProcessGraphEvents();
    flushWorkstationProcessGraphPersistence();
    useWorkstationProcessGraphStore.setState({
      graph: createInitialWorkstationProcessGraphState("session:batch"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves ordered operation events and terminal failure state", () => {
    recordWorkstationProcessGraphEvent({
      type: "operation.started",
      operationId: "operation-1",
      operationKind: "search",
      traceId: "trace-1",
      ts: "2026-05-15T10:00:00.000Z",
    });
    recordWorkstationProcessGraphEvent({
      type: "operation.completed",
      operationId: "operation-1",
      operationKind: "search",
      traceId: "trace-1",
      ts: "2026-05-15T10:01:00.000Z",
    });
    recordWorkstationProcessGraphEvent({
      type: "operation.failed",
      operationId: "operation-2",
      operationKind: "index",
      traceId: "trace-2",
      ts: "2026-05-15T10:02:00.000Z",
    });

    flushQueuedWorkstationProcessGraphEvents();
    const graph = useWorkstationProcessGraphStore.getState().graph;
    const timeline = graph.timeline.map((id) => graph.timelineEntries[id]?.label);

    expect(graph.revision).toBe(3);
    expect(graph.nodes["operation:operation-1"].status).toBe("completed");
    expect(graph.nodes["operation:operation-2"].status).toBe("failed");
    expect(timeline).toEqual([
      "operation failed: index",
      "operation completed: search",
      "operation started: search",
    ]);
  });

  it("flushes pending artifacts before building the Helix Ask context pack", () => {
    recordWorkstationProcessGraphEvent({
      type: "artifact.attached",
      artifactId: "artifact-queued",
      artifactKind: "receipt",
      label: "Queued receipt",
      traceId: "trace-queued",
      ts: "2026-05-15T10:00:00.000Z",
    });

    const pack = useWorkstationProcessGraphStore.getState().getContextPack();

    expect(pack.recentArtifacts).toEqual([
      expect.objectContaining({ label: "Queued receipt", artifactKind: "receipt" }),
    ]);
  });

  it("coalesces consecutive semantically identical focus notifications", () => {
    const focus = {
      type: "panel.focused" as const,
      panelId: "docs-viewer",
      traceId: "trace-focus",
      ts: "2026-05-15T10:00:00.000Z",
    };
    recordWorkstationProcessGraphEvent(focus);
    recordWorkstationProcessGraphEvent(focus);

    flushQueuedWorkstationProcessGraphEvents();

    expect(useWorkstationProcessGraphStore.getState().graph.revision).toBe(1);
  });

  it("debounces multiple semantic updates into one storage write", () => {
    vi.useFakeTimers();
    flushWorkstationProcessGraphPersistence();
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    useWorkstationProcessGraphStore.getState().dispatch({
      type: "job.started",
      jobId: "job-1",
      label: "Job 1",
      ts: "2026-05-15T10:00:00.000Z",
    });
    useWorkstationProcessGraphStore.getState().dispatch({
      type: "job.completed",
      jobId: "job-1",
      label: "Job 1",
      ts: "2026-05-15T10:01:00.000Z",
    });

    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WORKSTATION_PROCESS_GRAPH_PERSIST_DEBOUNCE_MS - 1);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
