/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
});

describe("workspace memory registry account scope", () => {
  it("does not display another account's artifact titles or import legacy metadata", () => {
    localStorage.setItem("helix-workspace-memory-registry:v1", JSON.stringify({
      state: { artifacts: { legacy: { artifact_id: "legacy", title: "Old note title" } } },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkspaceMemoryRegistryStore.getState().listArtifacts()).toEqual([]);
    useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
      artifact_id: "workstation-note:alpha",
      artifact_type: "workstation_note",
      storage_key: "workstation-notes:v2:profile:profile%3Aalpha",
      storage_backend: "localStorage",
      owner_scope: "profile",
      profile_id: "profile:alpha",
      title: "Alpha private note",
    });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useWorkspaceMemoryRegistryStore.getState().listArtifacts()).toEqual([]);
    useWorkspaceMemoryRegistryStore.getState().upsertArtifact({
      artifact_id: "workstation-note:beta",
      artifact_type: "workstation_note",
      storage_key: "workstation-notes:v2:profile:profile%3Abeta",
      storage_backend: "localStorage",
      owner_scope: "profile",
      profile_id: "profile:beta",
      title: "Beta private note",
    });

    cacheAccountCapabilityPolicy(null, null);
    expect(useWorkspaceMemoryRegistryStore.getState().listArtifacts()).toEqual([]);
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkspaceMemoryRegistryStore.getState().listArtifacts().map((artifact) => artifact.title))
      .toEqual(["Alpha private note"]);
    expect(localStorage.getItem("helix-workspace-memory-registry:v1"))
      .toContain("Old note title");
  });
});
