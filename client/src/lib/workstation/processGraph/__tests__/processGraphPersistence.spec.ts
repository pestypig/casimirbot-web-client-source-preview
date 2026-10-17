import { describe, expect, it } from "vitest";
import { buildProcessGraphContextPack } from "../buildProcessGraphContextPack";
import {
  hydrateWorkstationProcessGraph,
  isPersistableProcessGraphChange,
  serializeWorkstationProcessGraph,
  WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION,
} from "../processGraphPersistence";
import {
  applyWorkstationProcessGraphEvent,
  createInitialWorkstationProcessGraphState,
} from "../processGraphReducer";

describe("workstation process graph persistence", () => {
  it("migrates the legacy full graph and preserves meaningful context after reload", () => {
    let graph = createInitialWorkstationProcessGraphState("session:legacy");
    graph = applyWorkstationProcessGraphEvent(graph, {
      type: "tool.failed",
      tool: "docs-viewer.search_docs",
      traceId: "trace-failed",
      label: "Docs search failed",
      ts: "2026-05-15T10:00:00.000Z",
    });
    graph = applyWorkstationProcessGraphEvent(graph, {
      type: "artifact.attached",
      artifactId: "artifact-1",
      artifactKind: "search_receipt",
      label: "Search receipt",
      sourceNodeId: "tool:docs-viewer.search_docs",
      traceId: "trace-failed",
      ts: "2026-05-15T10:01:00.000Z",
    });
    graph.nodes["tool:docs-viewer.search_docs"].meta = { oversized: "x".repeat(20_000) };
    const legacy = JSON.stringify({ version: 0, state: { graph } });

    const hydrated = hydrateWorkstationProcessGraph(legacy);
    const pack = buildProcessGraphContextPack(hydrated.graph);
    const compact = serializeWorkstationProcessGraph(hydrated.graph);

    expect(hydrated.migrated).toBe(true);
    expect(pack.summary.failedItems).toBe(1);
    expect(pack.recentArtifacts[0]?.artifactKind).toBe("search_receipt");
    expect(compact.length).toBeLessThan(legacy.length);
    expect(JSON.parse(compact).version).toBe(WORKSTATION_PROCESS_GRAPH_PERSISTENCE_VERSION);
    expect(compact).not.toContain("oversized");
  });

  it("does not schedule persistence for view-only changes", () => {
    const previous = createInitialWorkstationProcessGraphState("session:view");
    const next = {
      ...previous,
      revision: previous.revision + 1,
      view: { ...previous.view, focusedNodeId: "helix:ask" },
    };

    expect(isPersistableProcessGraphChange(previous, next)).toBe(false);
  });
});
