// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextEncoder } from "node:util";
import { FriendArtifactWorkspace } from "../../workstation/friends-parties/FriendArtifactWorkspace";
import { QuantumGlyphAnswer } from "../QuantumGlyphAnswer";
import { SampledLayers } from "../SampledLayers";
import { createPhysicsGlyphWorkspaceStore, usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { createPhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { lightRotationV3 } from "@shared/physics-glyphs/__tests__/scenario-v3-fixtures";
import { friendGlyphArtifactSchema } from "@shared/helix-friend-board";
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({ HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test:profile-changed", readCachedAccountProfileIdentity: () => ({ profileId: "copy-fixture" }) }));
vi.mock("@shared/physics-glyphs/sampled-layers", () => ({ renderSampledLayer: (result: { operatorId: string }) => `<p>${result.operatorId}</p>` }));
beforeEach(() => {
  vi.stubGlobal("TextEncoder", TextEncoder);
  localStorage.clear();
  usePhysicsGlyphWorkspaceStore.setState({ workspace: createPhysicsGlyphWorkspace("main-fixture"), profileKey: null });
  usePhysicsGlyphWorkspaceStore.getState().syncProfile();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const copyStore = () => createPhysicsGlyphWorkspaceStore({ identity: () => "copy-fixture", storage: () => ({ getItem: () => null, setItem: () => {} }) });
it("does not retire a received v3 copy because the main workspace has the same question", () => {
  const scenario = lightRotationV3();
  const artifact = friendGlyphArtifactSchema.parse({ schema: "helix.friend_glyph_artifact.v1", kind: "physics_glyph", generation_id: "11111111-1111-4111-8111-111111111111", renderer: "physics-glyph-story.v1", document: { schema: "helix.physics_glyph_document.v3", configuration: { preset: "scenario", scenario, perspective: "quantum" } } });
  usePhysicsGlyphWorkspaceStore.getState().importDocument(JSON.stringify(artifact.document));
  const main = usePhysicsGlyphWorkspaceStore.getState().workspace;
  usePhysicsGlyphWorkspaceStore.setState({ workspace: { ...main, interpretationStatus: "needs-reinterpretation" } });
  render(<FriendArtifactWorkspace artifact={artifact} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Unfold the quantum relations" })).toBeTruthy();
  expect(screen.queryByText(/Inputs changed: prior evidence/)).toBeNull();
  expect(usePhysicsGlyphWorkspaceStore.getState().workspace.interpretationStatus).toBe("needs-reinterpretation");
});
it("uses the copy's own retired state through the answer wrapper", () => {
  const scenario = lightRotationV3(), copy = copyStore();
  copy.getState().importDocument(JSON.stringify({ schema: "helix.physics_glyph_document.v3", configuration: { preset: "scenario", scenario, perspective: "quantum" } }));
  copy.setState({ workspace: { ...copy.getState().workspace, interpretationStatus: "needs-reinterpretation" } });
  render(<QuantumGlyphAnswer scenario={scenario} onWorkbench={() => {}} workspaceStore={copy} />);
  expect(screen.getByText(/Inputs changed: prior evidence/)).toBeTruthy();
});
it.each([false, true])("reads sampled sidecars only from the selected store (copy has sidecar: %s)", present => {
  // Synthetic display-only record and payload; no scientific replay or certificate claim.
  const scenario = { ...lightRotationV3(), scientificRecord: { sceneHash: "same-scene", sampledEvidence: [{ id: "sample-fixture", sha256: "sidecar", request: { operatorId: "fixture" } }] } } as never;
  const copy = copyStore();
  const configure = (store: typeof copy, marker: string | null) => store.setState({ workspace: { ...store.getState().workspace,
    scene: { ...store.getState().workspace.scene, configuration: { preset: "scenario", scenario, perspective: "quantum" } },
    sampledArtifacts: marker ? { sidecar: { operatorId: marker, shape: [2, 2] } as never } : {},
  } });
  configure(usePhysicsGlyphWorkspaceStore, "main-sidecar-must-stay-private");
  configure(copy, present ? "copy-sidecar" : null);
  render(<SampledLayers scenario={scenario} workspaceStore={copy} />);
  expect(screen.queryByText("main-sidecar-must-stay-private")).toBeNull();
  if (present) expect(screen.getByText("copy-sidecar")).toBeTruthy();
  else expect(screen.getByText(/Sampled artifact unavailable/)).toBeTruthy();
});
