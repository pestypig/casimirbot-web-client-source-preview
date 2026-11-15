import { describe, expect, it } from "vitest";
import {
  HELIX_USER_ACCOUNT_POLICY,
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_DISCOVERABLE_WORKSTATION_PANEL_IDS,
  HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS,
  resolveHelixAccountPanelAccess,
} from "@shared/helix-account-session";
import { HELIX_REGISTERED_WORKSTATION_PANEL_IDS } from "@shared/helix-workstation-panel-ids.generated";
import { getPanelDef, panelRegistry } from "@/lib/desktop/panelRegistry";
import {
  isAccountLaunchPanel,
  isAccountPanelAccessible,
  isDiscoverableLaunchPanel,
  isLegacyDebugPanel,
  isLockedLaunchPanel,
  isUnfinishedPanel,
  isUserLaunchPanel,
} from "@/lib/workstation/launchPanelPolicy";

describe("launchPanelPolicy", () => {
  it("launches local Noise Gen in the same workstation for ordinary and developer accounts", () => {
    const panel = getPanelDef("helix-noise-gens");
    expect(panel?.pinned).toBe(true);
    expect(panel?.startHidden).not.toBe(true);
    expect(isUserLaunchPanel("helix-noise-gens")).toBe(true);
    expect(isDiscoverableLaunchPanel("helix-noise-gens")).toBe(true);
    for (const policy of [HELIX_USER_ACCOUNT_POLICY, HELIX_DEVELOPER_ACCOUNT_POLICY]) {
      expect(isAccountPanelAccessible("helix-noise-gens", policy)).toBe(true);
      expect(isAccountLaunchPanel("helix-noise-gens", policy)).toBe(true);
      expect(isAccountLaunchPanel("helix-noise-gens", { ...policy,
        locked_panels: [...policy.locked_panels, "helix-noise-gens"] })).toBe(false);
    }
  });
  it("includes workstation notes in the user launch panel list", () => {
    expect(isUserLaunchPanel("workstation-notes")).toBe(true);
  });

  it("shows new panels unless they are explicitly hidden", () => {
    expect(isUserLaunchPanel("situation-room-sources")).toBe(true);
    expect(isUserLaunchPanel("situation-room-pipelines")).toBe(false);
    expect(isUserLaunchPanel("civilization-bounds-roadmap")).toBe(true);
    expect(HELIX_USER_ACCOUNT_POLICY.allowed_panels).toEqual(["*"]);
  });

  it("separates launcher visibility from direct panel permission", () => {
    const hidden = new Set<string>(HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS);
    const locked = new Set(HELIX_USER_ACCOUNT_POLICY.locked_panels);
    for (const panel of panelRegistry) {
      expect(isUserLaunchPanel(panel.id), panel.id).toBe(!hidden.has(panel.id));
      expect(
        resolveHelixAccountPanelAccess(HELIX_USER_ACCOUNT_POLICY, panel.id).state,
        panel.id,
      ).toBe(locked.has(panel.id) ? "locked" : "available");
    }
    expect(isUserLaunchPanel("fruition-calculator")).toBe(false);
    expect(isAccountPanelAccessible("fruition-calculator", HELIX_USER_ACCOUNT_POLICY)).toBe(true);
    expect(isAccountLaunchPanel("fruition-calculator", HELIX_USER_ACCOUNT_POLICY)).toBe(false);
    expect(isAccountPanelAccessible("code-admin", {
      ...HELIX_USER_ACCOUNT_POLICY, locked_panels: [],
    })).toBe(false);
  });

  it("classifies every panel hidden from the launcher", () => {
    const contextualPanels = new Set(["electron-orbital"]);
    const hiddenAtStartup = panelRegistry.filter((panel) => panel.startHidden);
    expect(hiddenAtStartup.length).toBeGreaterThan(0);
    for (const panel of hiddenAtStartup) {
      const lockedForUsers = HELIX_USER_ACCOUNT_POLICY.locked_panels.includes(panel.id);
      const contextual = contextualPanels.has(panel.id);
      expect(lockedForUsers || contextual, panel.id).toBe(true);
      expect(lockedForUsers && contextual, panel.id).toBe(false);
      expect(resolveHelixAccountPanelAccess(
        HELIX_USER_ACCOUNT_POLICY, panel.id,
      ).state).toBe(contextual ? "available" : "locked");
      expect(resolveHelixAccountPanelAccess(
        HELIX_DEVELOPER_ACCOUNT_POLICY, panel.id,
      ).state).toBe("available");
    }
    expect(isAccountLaunchPanel("electron-orbital", HELIX_USER_ACCOUNT_POLICY))
      .toBe(true);
  });

  it("discovers every user-visible registered panel in the agent catalog", () => {
    expect([...HELIX_REGISTERED_WORKSTATION_PANEL_IDS].sort()).toEqual(
      panelRegistry.map((panel) => panel.id).sort());
    expect([...HELIX_USER_DISCOVERABLE_WORKSTATION_PANEL_IDS].sort()).toEqual(
      panelRegistry.map((panel) => panel.id)
        .filter((id) => !HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS.includes(id as
          (typeof HELIX_USER_HIDDEN_WORKSTATION_PANEL_IDS)[number])).sort());
  });

  it("honors explicit panel locks while preserving legacy finite-policy fallback", () => {
    const stalePolicy = { ...HELIX_USER_ACCOUNT_POLICY, allowed_panels: ["environment-home"] };
    expect(isAccountLaunchPanel("star-watcher", stalePolicy)).toBe(true);
    expect(isAccountLaunchPanel("star-watcher", {
      ...stalePolicy,
      locked_panels: [...stalePolicy.locked_panels, "star-watcher"],
    })).toBe(false);
    expect(isAccountLaunchPanel("star-watcher", HELIX_USER_ACCOUNT_POLICY)).toBe(true);
    expect(isAccountLaunchPanel("helix-noise-gens", HELIX_USER_ACCOUNT_POLICY)).toBe(true);
    expect(isAccountLaunchPanel("helix-noise-gens", {
      ...HELIX_USER_ACCOUNT_POLICY,
      locked_panels: [],
    })).toBe(true);
    expect(isAccountLaunchPanel("helix-noise-gens", HELIX_DEVELOPER_ACCOUNT_POLICY)).toBe(true);
    expect(isAccountLaunchPanel("not-a-real-panel", HELIX_DEVELOPER_ACCOUNT_POLICY)).toBe(false);
  });

  it("keeps the Live Answer panel outside the public user launch list", () => {
    expect(isUserLaunchPanel("live-answer-environment")).toBe(false);
  });

  it("includes only the requested workstation utility panels", () => {
    expect(isUserLaunchPanel("image-lens")).toBe(true);
    expect(isUserLaunchPanel("document-image-lens")).toBe(false);
    expect(isUserLaunchPanel("workstation-clipboard-history")).toBe(true);
    expect(isUserLaunchPanel("workstation-workflow-timeline")).toBe(false);
    expect(isUserLaunchPanel("workstation-task-manager")).toBe(true);
    expect(isUserLaunchPanel("workstation-storage-map")).toBe(true);
    expect(isUserLaunchPanel("scientific-calculator")).toBe(true);
    expect(isUserLaunchPanel("agi-task-history")).toBe(true);
    expect(isUserLaunchPanel("narrator")).toBe(true);
    expect(isUserLaunchPanel("docs-viewer")).toBe(true);
    expect(isUserLaunchPanel("account-session")).toBe(true);
    expect(isUserLaunchPanel("device-check")).toBe(true);
  });

  it("includes the theory badge graph in launch panels", () => {
    expect(isUserLaunchPanel("theory-badge-graph")).toBe(true);
  });

  it("includes the postulate board in public launch panels", () => {
    expect(isUserLaunchPanel("postulate-board")).toBe(true);
    expect(isLockedLaunchPanel("postulate-board")).toBe(false);
  });

  it("includes the workflow demo lab in public launch panels", () => {
    expect(isUserLaunchPanel("workflow-demo-lab")).toBe(true);
    expect(isUnfinishedPanel("workflow-demo-lab")).toBe(false);
    expect(isLockedLaunchPanel("workflow-demo-lab")).toBe(false);
    expect(isDiscoverableLaunchPanel("workflow-demo-lab")).toBe(true);
  });

  it("includes the Moral Badge Graph but not the Fruition Calculator in public launch panels", () => {
    expect(isUserLaunchPanel("moral-graph")).toBe(true);
    expect(isUserLaunchPanel("fruition-calculator")).toBe(false);
  });

  it("keeps the Stage Play Badge Graph outside public launch panels", () => {
    expect(isUserLaunchPanel("stage-play-badge-graph")).toBe(false);
  });

  it("offers the core workspace panels to signed-out users", () => {
    for (const id of ["environment-home", "agent-access", "connections-billing-security", "star-watcher", "civilization-bounds-roadmap"]) {
      expect(isUserLaunchPanel(id)).toBe(true);
      expect(isLockedLaunchPanel(id)).toBe(false);
    }
  });

  it("keeps Essence Console as a legacy/debug panel outside default launch", () => {
    expect(isUserLaunchPanel("agi-essence-console")).toBe(false);
    expect(isLegacyDebugPanel("agi-essence-console")).toBe(true);
  });

  it("keeps mission ethos panels outside public launch panels", () => {
    expect(isUserLaunchPanel("mission-ethos")).toBe(false);
    expect(isUnfinishedPanel("mission-ethos")).toBe(true);
    expect(isUserLaunchPanel("mission-ethos-source")).toBe(false);
    expect(isUnfinishedPanel("mission-ethos-source")).toBe(true);
  });

  it("keeps unknown ids out of the launch panel list", () => {
    expect(isUserLaunchPanel("not-a-real-panel")).toBe(false);
  });

  it("keeps unfinished panels out of the user launch panel list", () => {
    const unfinishedPanels = [
      "agi-contribution-workbench",
      "code-admin",
      "document-image-lens",
      "live-answer-environment",
      "mission-ethos",
      "mission-ethos-source",
      "rag-admin",
      "situation-room-pipelines",
      "stage-play-badge-graph",
      "workstation-workflow-timeline",
    ];

    for (const panelId of unfinishedPanels) {
      expect(isUnfinishedPanel(panelId)).toBe(true);
      expect(isUserLaunchPanel(panelId)).toBe(false);
      expect(isLockedLaunchPanel(panelId)).toBe(true);
      expect(isDiscoverableLaunchPanel(panelId)).toBe(false);
    }
  });

  it("keeps the launcher and account policy hidden sets aligned", () => {
    for (const panelId of HELIX_USER_ACCOUNT_POLICY.locked_panels) {
      expect(getPanelDef(panelId)).toBeDefined();
      expect(isUserLaunchPanel(panelId)).toBe(false);
      expect(isDiscoverableLaunchPanel(panelId)).toBe(false);
    }
  });
});
