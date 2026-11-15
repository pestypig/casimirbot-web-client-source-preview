// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextEncoder } from "node:util";
import { UnifiedQuantumGlyphAnswer } from "../UnifiedQuantumGlyphAnswer";
import { PhysicsGlyphSandbox } from "../PhysicsGlyphSandbox";
import { lightRotationV3, sealV3 } from "@shared/physics-glyphs/__tests__/scenario-v3-fixtures";
import { selectPhysicsScenarioV3Assumption } from "@shared/physics-glyphs/scenario-v3-contracts";
import { buildPhysicsScenarioV3Plan, renderPhysicsScenarioV3Plan } from "@shared/physics-glyphs/scenario-v3-presentation";
import { physicsGlyphMarkupRegistry, renderPhysicsGlyphMarkup } from "@shared/physics-glyphs/glyph-markup";
import { createPhysicsGlyphWorkspaceStore, usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { createPhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({ readCachedAccountProfileIdentity: () => ({ profileId: "v3-alice" }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
describe("one generated artifact in native and sandbox", () => {
  it("opens with the shared glyph markup, unfolds and reassesses a native control", () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    const scenario = lightRotationV3(), inspect = vi.fn();
    function Example() {
      const [s, set] = useState(scenario);
      return <UnifiedQuantumGlyphAnswer scenario={s} onWorkbench={inspect} onAssumptionChange={(c, o) => set(selectPhysicsScenarioV3Assumption(s, c, o)!)} />;
    }
    const view = render(<Example />);
    const expected = document.createElement("div"); expected.innerHTML = renderPhysicsScenarioV3Plan(buildPhysicsScenarioV3Plan(scenario), id => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry), 0, false);
    expect(view.container.querySelector("svg")?.outerHTML).toBe(expected.querySelector("svg")?.outerHTML);
    expect(screen.queryByText("A specified helicity", { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal Collective to macroscopic" }));
    expect(screen.getByText("A free body can respond", { exact: false })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Absorption assumption"), { target: { value: "off" } });
    expect(screen.getByText("This step's declared model is inapplicable", { exact: false })).toBeTruthy();
    fireEvent.click(view.container.querySelector('[data-mark-role="unresolved"]')!);
    expect(inspect).toHaveBeenCalledOnce();
  });
  it("preserves legacy storage and isolates v3 replay by profile", () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    let profile = "v3-alice";
    const store = createPhysicsGlyphWorkspaceStore({ identity: () => profile, storage: () => localStorage });
    store.getState().syncProfile(); store.getState().save();
    const key = store.getState().profileKey!, legacy = localStorage.getItem(key);
    expect(store.getState().importDocument(JSON.stringify({schema:"helix.physics_glyph_document.v3",configuration:{preset:"scenario",perspective:"quantum",scenario:lightRotationV3()}}))).toBe(true);
    expect(store.getState().save()).toBe(true);
    expect(localStorage.getItem(key)).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(`${key}:scenario-v3`)!).schema).toBe("helix.physics_glyph_document.v3");
    profile = "v3-bob"; store.getState().syncProfile();
    expect(store.getState().workspace.scene.configuration.preset).toBe("phase");
    profile = "v3-alice"; store.getState().syncProfile();
    expect(store.getState().workspace.scene.configuration).toMatchObject({ preset: "scenario", scenario: { schema: "helix.physics_scenario.v3" } });
  });
  it("automatically compiles the saved presentation into an opaque frame without granting commands", async () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    usePhysicsGlyphWorkspaceStore.setState({ workspace: createPhysicsGlyphWorkspace("automatic-v3"), profileKey: null });
    usePhysicsGlyphWorkspaceStore.getState().syncProfile();
    const store = usePhysicsGlyphWorkspaceStore.getState();
    store.importDocument(JSON.stringify({schema:"helix.physics_glyph_document.v3",configuration:{preset:"scenario",perspective:"quantum",scenario:sealV3(lightRotationV3())}}));
    render(<PhysicsGlyphSandbox />);
    const frame = await screen.findByTitle("Generated physics glyph display") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("renderV3");
    expect((screen.getByLabelText("Allow this preview to configure the scene") as HTMLInputElement).checked).toBe(false);
    const before = usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision;
    fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, data: { type: "helix.physics-glyph.command.v1", command: { type: "set_assumption", expectedRevision: before, controlId: "absorption_control", optionId: "off" } } }));
    await waitFor(() => expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision).toBe(before));
  });
});
