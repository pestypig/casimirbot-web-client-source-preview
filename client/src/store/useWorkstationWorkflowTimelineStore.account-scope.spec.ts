/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useWorkstationWorkflowTimelineStore } from "@/store/useWorkstationWorkflowTimelineStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
});

describe("workstation workflow timeline account scope", () => {
  it("does not show another account's activity or import the legacy shared timeline", () => {
    localStorage.setItem("workstation-workflow-timeline:v1", JSON.stringify({
      state: { entries: [{ id: "legacy", ts: "2026-10-01", lane: "notes", label: "Old private note" }] },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationWorkflowTimelineStore.getState().entries).toEqual([]);
    useWorkstationWorkflowTimelineStore.getState().addEntry({ lane: "notes", label: "Alpha note" });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useWorkstationWorkflowTimelineStore.getState().entries).toEqual([]);
    useWorkstationWorkflowTimelineStore.getState().addEntry({ lane: "notes", label: "Beta note" });

    cacheAccountCapabilityPolicy(null, null);
    expect(useWorkstationWorkflowTimelineStore.getState().entries).toEqual([]);
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationWorkflowTimelineStore.getState().entries.map((entry) => entry.label))
      .toEqual(["Alpha note"]);
    expect(localStorage.getItem("workstation-workflow-timeline:v1")).toContain("Old private note");
    expect(localStorage.getItem("workstation-workflow-timeline:v2:profile:profile%3Aalpha"))
      .toContain("Alpha note");
    expect(localStorage.getItem("workstation-workflow-timeline:v2:profile:profile%3Abeta"))
      .toContain("Beta note");
  });
});
