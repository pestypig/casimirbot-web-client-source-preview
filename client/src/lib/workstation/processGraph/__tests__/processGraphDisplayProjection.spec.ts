import { describe, expect, it } from "vitest";
import {
  createWorkstationProcessGraphDisplaySelector,
} from "../processGraphDisplayProjection";
import {
  applyWorkstationProcessGraphEvent,
  createInitialWorkstationProcessGraphState,
} from "../processGraphReducer";

describe("workstation process graph display projection", () => {
  it("keeps the projection stable for timeline and view-only changes", () => {
    const graph = applyWorkstationProcessGraphEvent(
      createInitialWorkstationProcessGraphState("session:projection"),
      {
        type: "panel.opened",
        panelId: "docs-viewer",
        ts: "2026-05-15T10:00:00.000Z",
      },
    );
    const select = createWorkstationProcessGraphDisplaySelector({ maxNodes: 18, maxEdges: 28 });
    const first = select({ graph });
    const viewOnly = {
      ...graph,
      revision: graph.revision + 1,
      view: { focusedNodeId: "panel:docs-viewer" },
      timeline: [...graph.timeline, "view-only-entry"],
      timelineEntries: {
        ...graph.timelineEntries,
        "view-only-entry": {
          id: "view-only-entry",
          ts: "2026-05-15T10:01:00.000Z",
          label: "view only",
        },
      },
    };

    expect(select({ graph: viewOnly })).toBe(first);
  });

  it("changes the projection when a rendered node changes", () => {
    const graph = createInitialWorkstationProcessGraphState("session:projection");
    const select = createWorkstationProcessGraphDisplaySelector({ maxNodes: 18, maxEdges: 28 });
    const first = select({ graph });
    const changed = applyWorkstationProcessGraphEvent(graph, {
      type: "panel.focused",
      panelId: "docs-viewer",
      ts: "2026-05-15T10:00:00.000Z",
    });

    expect(select({ graph: changed })).not.toBe(first);
  });
});
