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
    expect(desktopSource).toContain("isAccountPanelAccessible(panelId, accountPolicyRef.current)");
    expect(desktopSource).toContain('if (panelId === "device-check") return true;');
    expect(desktopSource).toContain("if (!canOpenPanelForAccount(panelId)) return;");
    expect(desktopSource).toContain("const panels = filterPanelsForAccount(viewState.panels);");
    expect(desktopSource).toContain("requestedFocusPanel && canOpenPanelForAccount(requestedFocusPanel)");
    expect(desktopSource).toContain("getPanelDef(panelId) && canOpenPanelForAccount(panelId)");
  });
});

it("guards desktop job completion and failure publication with the initiating account", () => {
  const job = desktopSource.slice(desktopSource.indexOf('case "run_job":'), desktopSource.indexOf('case "toggle_mobile_drawer":'));
  expect(job).toContain("const isJobAccountCurrent = captureAccountOperationScope();");
  expect(job.match(/if \(!isJobAccountCurrent\(\)\) return;/g)).toHaveLength(2);
  expect(job.indexOf("if (!isJobAccountCurrent()) return;")).toBeLessThan(job.indexOf("publish({"));
  expect(job.slice(job.indexOf("catch (error)")).indexOf("if (!isJobAccountCurrent()) return;")).toBeLessThan(
    job.slice(job.indexOf("catch (error)")).indexOf("publish({"),
  );
});
