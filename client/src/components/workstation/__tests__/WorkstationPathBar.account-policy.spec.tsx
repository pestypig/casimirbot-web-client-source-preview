// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HELIX_USER_ACCOUNT_POLICY, type HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import type { DocEquationContextArtifactV1 } from "@shared/contracts/doc-equation-context.v1";

const mocks = vi.hoisted(() => ({
  policy: null as HelixAccountCapabilityPolicy | null,
  open: vi.fn(), activate: vi.fn(), focus: vi.fn(), viewDoc: vi.fn(),
  currentPath: null as string | null,
  equation: null as DocEquationContextArtifactV1 | null,
}));
vi.mock("@/hooks/useHelixStartSettings", () => ({ useHelixStartSettings: () => ({ userSettings: { interfaceLanguage: "en" } }) }));
vi.mock("@/lib/i18n/interfaceText", () => ({ useInterfaceText: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/i18n/panelTitles", () => ({ getInterfacePanelTitle: (_t: unknown, _id: string, title: string) => title }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test-policy",
  readCachedAccountCapabilityPolicy: () => mocks.policy,
  fetchAccountCapabilityPolicy: async () => mocks.policy,
}));
vi.mock("@/store/useDocViewerStore", () => ({ useDocViewerStore: Object.assign(
  (select: (state: object) => unknown) => select({ mode: "doc", currentPath: mocks.currentPath, anchor: null }),
  { getState: () => ({ viewDoc: mocks.viewDoc }) },
) }));
vi.mock("@/store/useDocEquationContextStore", () => ({ useDocEquationContextStore: (select: (state: object) => unknown) => select({ latestContext: mocks.equation }) }));
vi.mock("@/store/useWorkstationLayoutStore", () => ({ useWorkstationLayoutStore: (select: (state: object) => unknown) => select({ openPanelInGroup: mocks.open, setActivePanel: mocks.activate, focusGroup: mocks.focus }) }));
import { WorkstationPathBar } from "../WorkstationPathBar";

const lock = (panelId: string) => { mocks.policy = { ...HELIX_USER_ACCOUNT_POLICY, locked_panels: [...HELIX_USER_ACCOUNT_POLICY.locked_panels, panelId] }; };
const enter = (path: string) => {
  fireEvent.change(screen.getByTestId("workstation-path-input"), { target: { value: path } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: "workstation.path.navigate" }));
const expectNoNavigation = () => {
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
  expect(mocks.focus).not.toHaveBeenCalled();
  expect(mocks.viewDoc).not.toHaveBeenCalled();
};

describe("WorkstationPathBar account admission", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    localStorage.clear();
    mocks.policy = HELIX_USER_ACCOUNT_POLICY;
    mocks.currentPath = null;
    mocks.equation = null;
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens and focuses an admitted typed panel", () => {
    render(<WorkstationPathBar activePanelId="docs-viewer" groupId="main" />);
    enter("workspace://workspace/panels/workstation-notes"); submit();
    expect(mocks.open).toHaveBeenCalledWith("main", "workstation-notes");
    expect(mocks.activate).toHaveBeenCalledWith("main", "workstation-notes");
    expect(mocks.focus).toHaveBeenCalledWith("main");
    expect(mocks.viewDoc).not.toHaveBeenCalled();
  });

  it("rejects an explicitly locked panel entered outside the suggestions", () => {
    lock("workstation-notes");
    render(<WorkstationPathBar activePanelId="docs-viewer" groupId="main" />);
    enter("workspace://workspace/panels/workstation-notes"); submit();
    expectNoNavigation();
  });

  it("reads the latest policy when the user submits a previously allowed destination", () => {
    render(<WorkstationPathBar activePanelId="docs-viewer" groupId="main" />);
    enter("workspace://workspace/panels/workstation-notes");
    lock("workstation-notes");
    submit();
    expectNoNavigation();
  });

  it("does not change the document when Docs is locked", () => {
    lock("docs-viewer");
    render(<WorkstationPathBar activePanelId="workstation-notes" groupId="main" />);
    enter("workspace://workspace/docs/example.md#section"); submit();
    expectNoNavigation();
  });

  it("rejects an equation route atomically if one associated panel is locked", () => {
    lock("scientific-calculator");
    mocks.currentPath = "docs/example.md";
    mocks.equation = {
      contractVersion: "doc_equation_context/v1", generatedAt: "2026-11-13T00:00:00Z",
      docPath: mocks.currentPath, equationId: "eq-example", equationLabel: "Example",
      uri: "workspace://workspace/docs/example.md#eq-example",
      pathRef: { root: "workspace", relativePath: mocks.currentPath, displaySegments: ["Workspace", "docs", "example.md"], virtualUri: "workspace://workspace/docs/example.md" },
      latex: "x", actionId: "inspect-example", actionKind: "calculator_ingest",
      badgeIds: [], openedPanels: ["workstation-notes", "scientific-calculator"], claimBoundaryNotes: [],
      commentaryHints: { summary: "Navigation fixture", scope: "theory_orientation", prohibitedClaims: [], suggestedExplanationFocus: [] },
    };
    render(<WorkstationPathBar activePanelId="docs-viewer" groupId="main" />);
    submit();
    expectNoNavigation();
  });

  it("allows an admitted experimental panel by direct path when launch suggestions hide it", () => {
    render(<WorkstationPathBar activePanelId="docs-viewer" groupId="main" />);
    enter("workspace://workspace/panels/workflow-demo-lab");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    submit();
    expect(mocks.activate).toHaveBeenCalledWith("main", "workflow-demo-lab");
  });
});
