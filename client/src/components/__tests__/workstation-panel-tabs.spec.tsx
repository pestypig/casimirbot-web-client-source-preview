import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tabsPath = path.resolve(process.cwd(), "client/src/components/workstation/WorkstationPanelTabs.tsx");
const stagePlayPath = path.resolve(process.cwd(), "client/src/components/panels/StagePlayBadgeGraphPanel.tsx");

describe("WorkstationPanelTabs layering", () => {
  it("keeps the launch panel picker above Stage Play panel overlays", () => {
    const tabsSource = fs.readFileSync(tabsPath, "utf8");
    const stagePlaySource = fs.readFileSync(stagePlayPath, "utf8");

    expect(tabsSource).toContain("top-8 z-[90] w-72");
    expect(tabsSource).toContain("workstation.panelPicker.title");
    expect(tabsSource).not.toContain("Job-ready");
    expect(tabsSource).not.toContain("Helix Start Settings");
    expect(tabsSource).not.toContain("open-helix-settings");
    expect(stagePlaySource).toContain("fixed z-[80]");
  });
});
