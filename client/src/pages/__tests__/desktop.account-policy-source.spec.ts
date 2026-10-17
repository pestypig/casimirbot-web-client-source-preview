import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const desktopSource = readFileSync(join(process.cwd(), "client/src/pages/desktop.tsx"), "utf8");

describe("desktop account policy startup guards", () => {
  it("loads account policy before restoring saved workstation URLs", () => {
    expect(desktopSource).toContain("const viewState = initialWorkstationView;");
    expect(desktopSource).toContain("await fetchAccountCapabilityPolicy()");
    expect(desktopSource.indexOf("const viewState = initialWorkstationView;")).toBeLessThan(
      desktopSource.indexOf("applyWorkstationViewState(viewState);"),
    );
    expect(desktopSource.indexOf("await fetchAccountCapabilityPolicy()")).toBeLessThan(
      desktopSource.indexOf("applyWorkstationViewState(viewState);"),
    );
  });

  it("filters restored, opened, focused, and synced panels through account policy", () => {
    expect(desktopSource).toContain("resolveHelixAccountPanelAccess(accountPolicyRef.current, panelId)");
    expect(desktopSource).toContain('if (panelId === "device-check") return true;');
    expect(desktopSource).toContain("if (!canOpenPanelForAccount(panelId)) return;");
    expect(desktopSource).toContain("const panels = filterPanelsForAccount(viewState.panels);");
    expect(desktopSource).toContain("requestedFocusPanel && canOpenPanelForAccount(requestedFocusPanel)");
    expect(desktopSource).toContain("getPanelDef(panelId) && canOpenPanelForAccount(panelId)");
  });
});
