// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render as testingRender, screen, waitFor } from "@testing-library/react";
import comparison from "../../../../../examples/helix-physics-glyphs/cushion-table-comparison.scenario.json";
import { physicsScenarioSchema } from "@shared/physics-glyphs/scenario-contracts";
import { springFixture, electrostaticFixture, sealV2 } from "@shared/physics-glyphs/__tests__/scenario-v2-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PhysicsGlyphWorkspacePanel from "@/components/workstation/PhysicsGlyphWorkspacePanel";
import { createPhysicsGlyphWorkspaceStore, usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { createPhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { executePhysicsGlyphPanelAction } from "@/lib/workstation/physicsGlyphActionAdapter";
import { TextEncoder } from "node:util";
import { PHYSICS_GLYPH_CLIENT_PROTOCOL } from "@shared/physics-glyphs/client-protocol";
import { attachPhysicsGlyphAskContext } from "@/lib/workstation/physicsGlyphAskContext";
import { buildHelixAskSubmitBackendEntrypointRoutePlan } from "@/components/helix/ask-console/HelixAskSubmitBackendEntrypointOptions";
const profileIdentity = vi.hoisted(() => ({ value: null as string | null | undefined }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  readCachedAccountProfileIdentity: () => ({ profileId: profileIdentity.value }),
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test-profile-change",
  fetchAccountCapabilityPolicy: () => Promise.resolve({}),
}));
vi.mock("@/store/useDesktopStore", () => ({ useDesktopStore: { getState: () => ({ open: vi.fn(), focus: vi.fn() }) } }));
vi.mock("@/store/useWorkstationLayoutStore", () => ({ useWorkstationLayoutStore: { getState: () => ({ mode: "workstation", openPanelInActiveGroup: vi.fn() }) } }));
beforeEach(() => {
  profileIdentity.value = null;
  localStorage.clear();
  usePhysicsGlyphWorkspaceStore.setState({ workspace: createPhysicsGlyphWorkspace("test-panel"), profileKey: null, error: null, notice: null });
  usePhysicsGlyphWorkspaceStore.getState().syncProfile();
});
afterEach(cleanup);
// Existing full-workbench contracts remain covered behind the new explicit entry.
function render(ui: React.ReactElement) {
  const result = testingRender(ui);
  fireEvent.click(screen.getByRole("button", { name: "Open physics workbench" }));
  return result;
}
describe("physics glyph workspace panel and typed actions", () => {
  it("keeps v2 saves separate and retires document-local notation on replacement and profile change", () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    let identity: string = "v2-alice";
    const store = createPhysicsGlyphWorkspaceStore({ identity: () => identity, storage: () => localStorage });
    store.getState().syncProfile(); store.getState().save();
    const legacyKey = store.getState().profileKey!, legacyBytes = localStorage.getItem(legacyKey);
    const s = springFixture();
    s.story.notationDefinitions = [{ id: "notation.local", label: "Local energy", role: "energy_transfer", meaningRef: "spring.elastic_restoration", primitives: [{ kind: "circle", center: [.5,.5], radius: .2 }] }];
    s.story.marks = [{ definitionId: "notation.local", subjectIds: ["spring"], x: .2, y: .3, revealAt: 2 }]; sealV2(s);
    expect(store.getState().dispatch({ type: "compose_scenario", expectedRevision: 0, scenario: s }).ok).toBe(true);
    expect(store.getState().save()).toBe(true);
    expect(localStorage.getItem(legacyKey)).toBe(legacyBytes);
    expect(JSON.parse(localStorage.getItem(`${legacyKey}:scenario-v2`)!).schema).toBe("helix.physics_glyph_document.v2");
    const restored = createPhysicsGlyphWorkspaceStore({ identity: () => identity, storage: () => localStorage }); restored.getState().syncProfile();
    expect(JSON.stringify(restored.getState().workspace)).toContain("notation.local");
    const epoch = store.getState().presentationEpoch;
    const next = electrostaticFixture();
    expect(store.getState().dispatch({ type: "compose_scenario", expectedRevision: 1, scenario: next }).ok).toBe(true);
    expect(JSON.stringify(store.getState().workspace)).not.toContain("notation.local"); expect(store.getState().presentationEpoch).toBeGreaterThan(epoch);
    identity = "v2-bob"; store.getState().syncProfile(); expect(JSON.stringify(store.getState().workspace)).not.toContain("notation.local");
    identity = "v2-alice"; store.getState().syncProfile(); expect(JSON.stringify(store.getState().workspace)).toContain("notation.local");
  });
  it("opens v2 with glyphs, reveals a spring and exposes meanings and gaps in the workbench", () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    const s = springFixture(); s.intent.requirements.push({ id: "numerical_force", claim: "Calculate force", domain: "other", subjectIds: ["spring"], mechanismIds: [], requiredConceptIds: [], gap: "No numerical operator executed" }); sealV2(s);
    const store = usePhysicsGlyphWorkspaceStore.getState(); store.dispatch({ type: "compose_scenario", expectedRevision: 0, scenario: s });
    const { container } = testingRender(<PhysicsGlyphWorkspacePanel />);
    const answer = screen.getByRole("region", { name: "Quantum glyph answer" });
    expect(answer.querySelector('[data-mark-role="identity"]')).toBeTruthy(); expect(answer.querySelector('[data-mark-role="unresolved"]')).toBeTruthy(); expect(answer.querySelector('[data-family="spring"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal Elastic restoration" }));
    expect(container.querySelector('[data-family="spring"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open physics workbench" }));
    expect(screen.getByText(/Question coverage: partial/)).toBeTruthy(); expect(screen.getByText("Diagram meanings and temporary notation")).toBeTruthy();
  });
  it("opens with glyphs only and restarts the guided path for every successful composition", () => {
    const scenario = physicsScenarioSchema.parse(comparison);
    const store = usePhysicsGlyphWorkspaceStore.getState();
    store.dispatch({ type: "compose_scenario", expectedRevision: store.workspace.scene.revision, scenario });
    const { container } = testingRender(<PhysicsGlyphWorkspacePanel />);
    expect(screen.queryByRole("heading", { name: "Result inspector" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Physics presets" })).toBeNull();
    expect(container.querySelector('[data-glyph-story-step="0"]')).toBeTruthy();
    expect(container.querySelector('[data-story-caption]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unfold the quantum relations" }));
    expect(container.querySelector('[data-glyph-story-step="1"]')).toBeTruthy();
    expect(container.querySelector('[data-story-caption]')?.textContent).toContain("Electromagnetic interaction");
    fireEvent.click(screen.getByRole("button", { name: "Open physics workbench" }));
    expect(screen.getByRole("heading", { name: "Result inspector" })).toBeTruthy();
    act(() => {
      const state = usePhysicsGlyphWorkspaceStore.getState();
      state.selectParticle("mu");
      state.dispatch({ type: "select_entity", expectedRevision: state.workspace.scene.revision, entityId: "object.hand" });
    });
    const revision = usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision;
    act(() => { executePhysicsGlyphPanelAction("command", { command: { type: "compose_scenario", expectedRevision: revision, scenario } }); });
    expect(screen.queryByRole("heading", { name: "Result inspector" })).toBeNull();
    expect(container.querySelector('[data-glyph-story-step="0"]')).toBeTruthy();
    expect(container.querySelector('[data-story-caption]')).toBeNull();
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ scenario });
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.selectedEntityId).toBeNull();
    expect(usePhysicsGlyphWorkspaceStore.getState().selectedParticle).toBe("e");
  });
  it("keeps four scenario perspectives synchronized and validates a draft before publication", async () => {
    const { container } = render(<PhysicsGlyphWorkspacePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Scenario composer" }));
    let configuration = usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration;
    if (configuration.preset !== "scenario") throw new Error("Scenario not loaded");
    const original = configuration.scenario;
    for (const [label, id] of [["Everyday", "everyday"], ["Atomic", "atomic"], ["Quantum states", "quantum"], ["Standard Model", "interaction"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(container.querySelector(`[data-scenario-perspective="${id}"]`)).toBeTruthy();
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ scenario: original, perspective: id });
      expect(container.querySelector("[data-metric]")).toBeNull();
    }
    fireEvent.change(screen.getByLabelText("Contact stage"), { target: { value: "approaching" } });
    configuration = usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration;
    if (configuration.preset !== "scenario") throw new Error("Scenario not retained");
    if (configuration.scenario.schema !== "helix.physics_scenario.v1") throw new Error("Expected the legacy contact scenario");
    expect(configuration.scenario.states.find(s => s.conceptId === "contact.geometry")?.valueId).toBe("approaching");
    fireEvent.click(screen.getByRole("button", { name: "Open physics workbench" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit current scenario" }));
    const broken = structuredClone(configuration.scenario);
    broken.states = broken.states.filter(s => s.conceptId !== "electron.spin");
    fireEvent.change(screen.getByLabelText("Scenario draft JSON"), { target: { value: JSON.stringify(broken) } });
    const before = usePhysicsGlyphWorkspaceStore.getState().workspace;
    fireEvent.click(screen.getByRole("button", { name: "Publish scenario" }));
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace).toBe(before);
    expect(screen.getByText("Scenario needs repair.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Particles & phase" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload saved" }));
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toEqual(configuration);
  });
  it("connects external chat only on request and retires the connection on an account change", async () => {
    profileIdentity.value = "alice";
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: true, json: async () => String(url).endsWith("register")
        ? { ok: true, protocol: PHYSICS_GLYPH_CLIENT_PROTOCOL, peerId: "00000000-0000-4000-8000-000000000001", token: "test-token" } : { ok: true, job: null } };
    }));
    try {
      render(<PhysicsGlyphWorkspacePanel />);
      expect(requests).toHaveLength(0);
      expect(attachPhysicsGlyphAskContext()).toEqual({});
      fireEvent.click(screen.getByRole("button", { name: "Connect Helix Ask & external chat" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Disconnect chat" })).toBeTruthy());
      await waitFor(() => expect(screen.getByText(/Connected chats on this account/)).toBeTruthy());
      expect(attachPhysicsGlyphAskContext()).toMatchObject({ physicsGlyphs: { automaticScenarios: true } });
      for (const question of ["Why can't my hand go through the table?", "Do not change the panel; explain only.",
        "Later I might compose a scene.", 'The screen says "compose a scene"; explain it.', "What is the weather?"]) {
        const plan = buildHelixAskSubmitBackendEntrypointRoutePlan({ question, turnId: "ask:physics-ui", threadId: "physics-ui",
          manualCanaryEnabled: false });
        expect(plan.useBackendAskTurnEntrypoint).toBe(true);
        // Backend/model own semantic choice; the client only chooses the request path.
        expect(plan.routeMetadata?.mandatory_next_tool).toBeUndefined();
      }
      expect(attachPhysicsGlyphAskContext(undefined, "isolated")).toEqual({});
      expect(JSON.stringify(attachPhysicsGlyphAskContext())).not.toContain("test-token");
      fireEvent.click(screen.getByLabelText("Automatic physics scenarios in Helix Ask"));
      expect(attachPhysicsGlyphAskContext()).toEqual({});
      fireEvent.click(screen.getByLabelText("Automatic physics scenarios in Helix Ask"));
      expect(requests.find(r => r.url.endsWith("register"))?.body.expectedProfileId).toBe("alice");
      expect(requests.find(r => r.url.endsWith("register"))?.body.protocol).toEqual(PHYSICS_GLYPH_CLIENT_PROTOCOL);
      profileIdentity.value = "bob";
      fireEvent(window, new Event("test-profile-change"));
      expect(attachPhysicsGlyphAskContext()).toEqual({});
      fireEvent.click(screen.getByRole("button", { name: "Open physics workbench" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Connect Helix Ask & external chat" })).toBeTruthy());
      await waitFor(() => expect(requests.some(r => r.url.endsWith("disconnect"))).toBe(true));
      expect(requests.filter(r => r.url.endsWith("register"))).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("requires sign-in for external chat while keeping guest scene controls available", async () => {
    render(<PhysicsGlyphWorkspacePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Helix Ask & external chat" }));
    await waitFor(() => expect(screen.getByText("Sign in to connect this panel to external chat.")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Relative phase"), { target: { value: "180" } });
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 180 });
  });
  it("retires an incompatible service connection without dropping the scientific record or polling", async () => {
    profileIdentity.value = "alice";
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      requests.push(String(url));
      return { ok: true, json: async () => String(url).endsWith("register")
        ? { ok: true, peerId: "00000000-0000-4000-8000-000000000001", token: "test-token" } : { ok: true } };
    }));
    try {
      render(<PhysicsGlyphWorkspacePanel />);
      fireEvent.click(screen.getByRole("button", { name: "Connect Helix Ask & external chat" }));
      await waitFor(() => expect(screen.getByText(/different physics-generation versions/)).toBeTruthy());
      expect(requests.some(url => url.endsWith("poll"))).toBe(false);
      await waitFor(() => expect(requests.some(url => url.endsWith("disconnect"))).toBe(true));
      expect(attachPhysicsGlyphAskContext()).toEqual({});
    } finally { vi.unstubAllGlobals(); }
  });
  it("retires a prior profile's sandbox before it can configure the next profile", async () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    try {
      render(<PhysicsGlyphWorkspacePanel />);
      fireEvent.click(screen.getByRole("button", { name: "Run display" }));
      const frame = screen.getByTitle("Generated physics glyph display") as HTMLIFrameElement;
      fireEvent.click(screen.getByLabelText("Allow this preview to configure the scene"));
      profileIdentity.value = "bob";
      fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, data: {
        type: "helix.physics-glyph.command.v1", command: { type: "set_parameters", expectedRevision: 0, parameters: { phaseDeg: 180 } },
      } }));
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 0 });
      await waitFor(() => expect(screen.queryByTitle("Generated physics glyph display")).toBeNull());
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps generated displays opaque and accepts scene commands only from the enabled active frame", async () => {
    vi.stubGlobal("TextEncoder", TextEncoder);
    try {
      render(<PhysicsGlyphWorkspacePanel />);
      fireEvent.click(screen.getByRole("button", { name: "Run display" }));
      const frame = screen.getByTitle("Generated physics glyph display") as HTMLIFrameElement;
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      const event = (source: MessageEventSource | null) => new MessageEvent("message", { source, data: {
        type: "helix.physics-glyph.command.v1", command: { type: "set_parameters", expectedRevision: 0, parameters: { phaseDeg: 180 } },
      } });
      fireEvent(window, event(frame.contentWindow));
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision).toBe(0);
      fireEvent.click(screen.getByLabelText("Allow this preview to configure the scene"));
      fireEvent(window, event(window));
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision).toBe(0);
      fireEvent(window, event(frame.contentWindow));
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 180 });
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision).toBe(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("uses the same command path for slider and tool configuration, save/reload and stale-result display", async () => {
    const { container } = render(<PhysicsGlyphWorkspacePanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Calculate current scene" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Relative phase"), { target: { value: "180" } });
    const fromPanel = usePhysicsGlyphWorkspaceStore.getState().workspace;
    expect(container.querySelector('[data-metric="p1"]')?.textContent).toContain("1.00000");
    expect(executePhysicsGlyphPanelAction("command", { command: { type: "set_parameters", expectedRevision: fromPanel.scene.revision, parameters: { phaseDeg: 180 } } }).ok).toBe(true);
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.result?.metrics).toEqual(fromPanel.result?.metrics);
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    fireEvent.change(screen.getByLabelText("Relative phase"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Reload saved" }));
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 180 });
    const revision = usePhysicsGlyphWorkspaceStore.getState().workspace.scene.revision;
    executePhysicsGlyphPanelAction("command", { command: { type: "set_parameters", expectedRevision: revision, parameters: { phaseDeg: 90 }, evaluate: false } });
    await waitFor(() => expect(container.querySelector('[data-metric="p1"]')).toBeNull());
    expect(executePhysicsGlyphPanelAction("inspect", {}).artifact?.result).toBeNull();
  });
  it("renders every preset with shared parameter/result components", () => {
    render(<PhysicsGlyphWorkspacePanel />);
    for (const title of ["Atomic structure", "Spin state", "Current & spin moments", "Static Casimir", "Driven photon pairs", "Barrier & weak reaction", "Particles & phase"]) {
      fireEvent.click(screen.getByRole("button", { name: title }));
      expect(screen.getByRole("heading", { name: "Result inspector" })).toBeTruthy();
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace.result?.metrics.length).toBeGreaterThan(0);
    }
  });
  it("rejects arbitrary text and extra action arguments without invoking commands", () => {
    const before = usePhysicsGlyphWorkspaceStore.getState().workspace;
    expect(executePhysicsGlyphPanelAction("command", { command: "set phase to 180" }).ok).toBe(false);
    expect(executePhysicsGlyphPanelAction("inspect", { code: "anything" }).ok).toBe(false);
    expect(executePhysicsGlyphPanelAction("command", { command: { type: "inspect" }, profileId: "other" }).ok).toBe(false);
    expect(usePhysicsGlyphWorkspaceStore.getState().workspace).toBe(before);
    for (const prompt of ["Explain setting phase to 180", "Do not set phase to 180", "Later we could set phase to 180", "Yesterday I set phase to 180", 'The screen says "set phase to 180"', "Explain the scene and perhaps change phase later"]) {
      expect(executePhysicsGlyphPanelAction("command", { command: prompt }).ok).toBe(false);
      expect(usePhysicsGlyphWorkspaceStore.getState().workspace).toBe(before);
    }
  });
  it("isolates profiles and fails honestly on invalid documents and storage failures", () => {
    let identity: string | null | undefined = "alice";
    const memory = new Map<string, string>();
    const store = createPhysicsGlyphWorkspaceStore({ identity: () => identity, storage: () => ({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } }) });
    store.getState().syncProfile();
    store.getState().dispatch({ type: "set_parameters", expectedRevision: 0, parameters: { phaseDeg: 180 } });
    expect(store.getState().save()).toBe(true);
    identity = "bob"; store.getState().syncProfile();
    expect(store.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 0 });
    expect(store.getState().reload()).toBe(false);
    identity = "alice"; store.getState().syncProfile();
    expect(store.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 180 });
    const before = store.getState().workspace;
    expect(store.getState().importDocument('{"schema":"unknown"}')).toBe(false);
    expect(store.getState().workspace).toBe(before);
    identity = undefined; store.getState().syncProfile(); expect(store.getState().save()).toBe(false);
    expect(store.getState().workspace.scene.configuration).toMatchObject({ phaseDeg: 0 });
    const broken = createPhysicsGlyphWorkspaceStore({ identity: () => null, storage: () => { throw new Error("storage blocked"); } });
    expect(broken.getState().save()).toBe(false);
  });
});
