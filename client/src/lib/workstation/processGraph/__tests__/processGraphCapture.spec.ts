import { describe, expect, it } from "vitest";
import { diffProcessGraphPanelSnapshots } from "../startProcessGraphCapture";

describe("workstation process graph panel capture", () => {
  it("ignores unrelated store mutations and repeated focus", () => {
    const snapshot = {
      panelIds: new Set(["docs-viewer", "workstation-notes"]),
      activePanelId: "docs-viewer",
    };

    expect(diffProcessGraphPanelSnapshots(snapshot, snapshot)).toEqual([]);
    expect(
      diffProcessGraphPanelSnapshots(snapshot, {
        panelIds: new Set(snapshot.panelIds),
        activePanelId: "docs-viewer",
      }),
    ).toEqual([]);
  });

  it("emits one focus event for an actual active-panel transition", () => {
    const events = diffProcessGraphPanelSnapshots(
      {
        panelIds: new Set(["docs-viewer", "workstation-notes"]),
        activePanelId: "docs-viewer",
      },
      {
        panelIds: new Set(["docs-viewer", "workstation-notes"]),
        activePanelId: "workstation-notes",
      },
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "panel.focused", panelId: "workstation-notes" }),
    ]);
  });
});
