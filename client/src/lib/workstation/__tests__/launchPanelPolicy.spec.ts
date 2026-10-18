import { describe, expect, it } from "vitest";
import {
  isDiscoverableLaunchPanel,
  isLegacyDebugPanel,
  isLockedLaunchPanel,
  isUnfinishedPanel,
  isUserLaunchPanel,
} from "@/lib/workstation/launchPanelPolicy";

describe("launchPanelPolicy", () => {
  it("includes workstation notes in the user launch panel list", () => {
    expect(isUserLaunchPanel("workstation-notes")).toBe(true);
  });

  it("keeps situation room panels outside the public user launch list", () => {
    expect(isUserLaunchPanel("situation-room-sources")).toBe(false);
    expect(isUserLaunchPanel("situation-room-pipelines")).toBe(false);
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
      "helix-noise-gens",
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
      expect(isDiscoverableLaunchPanel(panelId)).toBe(true);
    }
  });
});
