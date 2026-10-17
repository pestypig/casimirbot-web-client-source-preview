import { describe, expect, it } from "vitest";
import {
  applyWorkstationProcessGraphEvent,
  createInitialWorkstationProcessGraphState,
} from "../processGraphReducer";
import { renderWorkstationProcessGraphSvg } from "../renderProcessGraphSvg";

describe("workstation process graph svg renderer", () => {
  it("escapes visible SVG text and applies ambient caps", () => {
    let state = createInitialWorkstationProcessGraphState("session:test");
    for (let idx = 0; idx < 30; idx += 1) {
      state = applyWorkstationProcessGraphEvent(state, {
        type: "panel.opened",
        panelId: `panel-${idx}`,
        label: `Panel ${idx}`,
        ts: `2026-05-15T10:${String(idx % 60).padStart(2, "0")}:00.000Z`,
      });
    }
    state = applyWorkstationProcessGraphEvent(state, {
      type: "panel.opened",
      panelId: "docs-viewer",
      label: `<script>alert("x")</script>`,
      ts: "2026-05-15T11:00:00.000Z",
    });

    const svg = renderWorkstationProcessGraphSvg({
      graph: state,
      density: "ambient",
      labels: "full",
      maxNodes: 200,
      maxEdges: 200,
    });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect((svg.match(/<text /g) ?? []).length).toBeLessThanOrEqual(18);
  });
});
