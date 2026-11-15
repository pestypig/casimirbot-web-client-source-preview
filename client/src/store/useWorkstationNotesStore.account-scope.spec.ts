/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
  useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
});

describe("Workstation Notes account scope", () => {
  it("keeps signed-in account notes separate and leaves legacy shared notes untouched", () => {
    localStorage.setItem("workstation-notes:v1", JSON.stringify({
      state: { notes: { legacy: { id: "legacy", title: "Old note", topic: "legacy",
        body: "legacy body", citations: [], snippets: [], created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z" } },
        order: ["legacy"], active_note_id: "legacy" },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationNotesStore.getState().notes).toEqual({});
    const alpha = useWorkstationNotesStore.getState().createManualNote({
      title: "Alpha note", body: "alpha private body",
    });
    expect(useWorkspaceMemoryRegistryStore.getState().artifacts[
      `workstation-note:workstation-notes:v2:profile:profile%3Aalpha:${alpha.id}`
    ]).toMatchObject({ owner_scope: "profile", profile_id: "profile:alpha" });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useWorkstationNotesStore.getState().notes).toEqual({});
    const beta = useWorkstationNotesStore.getState().createManualNote({
      title: "Beta note", body: "beta private body",
    });
    expect(useWorkstationNotesStore.getState().notes[alpha.id]).toBeUndefined();

    cacheAccountCapabilityPolicy(null, null);
    expect(useWorkstationNotesStore.getState().notes).toEqual({});
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationNotesStore.getState().notes[alpha.id]?.body).toBe("alpha private body");
    expect(useWorkstationNotesStore.getState().notes[beta.id]).toBeUndefined();
    expect(localStorage.getItem("workstation-notes:v1")).toContain("legacy body");
  });

});
