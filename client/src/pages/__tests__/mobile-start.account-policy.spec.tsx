// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { HELIX_WORKSTATION_ACTION_EVENT } from "@/lib/workstation/workstationActionContract";
import { useMobileAppStore } from "@/store/useMobileAppStore";

const mocks = vi.hoisted(() => ({
  identity: { profileId: "profile-a", revision: 0 },
  policy: null as HelixAccountCapabilityPolicy | null,
  emit: vi.fn(),
  execute: vi.fn(),
  runJob: vi.fn(),
}));

vi.mock("@/lib/desktop/panelRegistry", () => {
  const panelRegistry = ["star-watcher", "code-admin", "workflow-demo-lab"].map((id) => ({
    id,
    title: id === "star-watcher" ? "Star Watcher" : id === "workflow-demo-lab" ? "Workflow Demo Lab" : "Code Admin",
    loader: async () => ({ default: () => null }),
  }));
  return { panelRegistry, getPanelDef: (id: string) => panelRegistry.find((panel) => panel.id === id) };
});
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "helix-account-capability-policy-changed",
  readCachedAccountProfileIdentity: () => ({ ...mocks.identity }),
  readCachedAccountCapabilityPolicy: () => mocks.policy,
  fetchAccountCapabilityPolicy: async () => mocks.policy,
}));
vi.mock("@/hooks/useHelixStartSettings", () => ({
  PROFILE_STORAGE_KEY: "test-profile",
  useHelixStartSettings: () => ({ userSettings: { interfaceLanguage: "en" }, updateSettings: vi.fn() }),
}));
vi.mock("@/hooks/useHelixSettingsDialog", () => ({
  useHelixSettingsDialog: () => ({ settingsOpen: false, settingsTab: "preferences",
    setSettingsTab: vi.fn(), openSettings: vi.fn(), handleSettingsOpenChange: vi.fn() }),
}));
vi.mock("@/lib/i18n/interfaceText", () => ({ useInterfaceText: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/i18n/panelTitles", () => ({
  getInterfacePanelTitle: (_t: unknown, _id: string, title: string) => title,
}));
vi.mock("@/lib/luma-mood-theme", () => ({ useLumaMoodTheme: () => ({ mood: "calm" }) }));
vi.mock("@/lib/surfacekit/generateSurface", () => ({ generateSurfaceRecipe: () => ({}) }));
vi.mock("@/lib/workstation/processGraph/startProcessGraphCapture", () => ({
  startProcessGraphCapture: () => vi.fn(),
}));
vi.mock("@/lib/workstation/performance/startWorkstationPerformanceSampler", () => ({
  startWorkstationPerformanceSampler: () => vi.fn(),
}));
vi.mock("@/lib/essence/activityReporter", () => ({ recordPanelActivity: vi.fn() }));
vi.mock("@/lib/workstation/workstationActionLiveEvents", () => ({
  createWorkstationActionTraceId: () => "trace:mobile-test",
  emitWorkstationActionLiveEvent: mocks.emit,
}));
vi.mock("@/lib/workstation/workstationActionExecutor", () => ({
  executeWorkstationActionWithLedger: mocks.execute,
}));
vi.mock("@/lib/workstation/jobExecutor", () => ({ runWorkstationJob: mocks.runJob }));
vi.mock("@/lib/workstation/setupExecutionReceiptPost", () => ({
  maybePostSituationRoomSetupExecutionReceipt: vi.fn(),
}));
vi.mock("@/store/useWorkstationLayoutStore", () => {
  const state = {
    setMobileDrawerOpen: vi.fn(), toggleMobileDrawer: vi.fn(), setMobileDrawerSnap: vi.fn(),
  };
  return { useWorkstationLayoutStore: Object.assign(
    (select: (value: typeof state) => unknown) => select(state),
    { getState: () => state },
  ) };
});
vi.mock("@/components/mobile/MobilePanelHost", () => ({
  MobilePanelHost: ({ panelId }: { panelId: string }) => <div data-testid="mobile-panel">{panelId}</div>,
}));
vi.mock("@/components/surface/SurfaceStack", () => ({ SurfaceStack: () => null }));
vi.mock("@/components/workstation/ProcessGraphSurfaceLayer", () => ({ ProcessGraphSurfaceLayer: () => null }));
vi.mock("@/components/helix/ask-console/HelixAskConsole", () => ({ HelixAskConsole: () => null }));
vi.mock("@/components/workstation/mobile/MobileHelixAskDrawer", () => ({ MobileHelixAskDrawer: () => null }));
vi.mock("@/components/HelixSettingsDialogContent", () => ({ HelixSettingsDialogContent: () => null }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ useLocation: () => ["/mobile", vi.fn()] }));

import { writeExperimentalLaunchPanels } from "@/lib/workstation/experimentalLaunchPanels";

import MobileStartPage from "../mobile-start";

const lockedPolicy = (): HelixAccountCapabilityPolicy => ({
  ...HELIX_USER_ACCOUNT_POLICY,
  locked_panels: [...HELIX_USER_ACCOUNT_POLICY.locked_panels, "star-watcher"],
});
const sendAction = (action: string, panelId: string) => {
  act(() => window.dispatchEvent(new CustomEvent(HELIX_WORKSTATION_ACTION_EVENT, {
    detail: { action, panel_id: panelId },
  })));
};

beforeEach(() => {
  mocks.identity = { profileId: "profile-a", revision: 0 };
  mocks.policy = lockedPolicy();
  useMobileAppStore.setState({ stack: [], activeId: undefined });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("denies a locked mobile open, admits normal Star Watcher, then unmounts it on lock", () => {
  render(<MobileStartPage />);

  sendAction("open_panel", "star-watcher");
  expect(mocks.emit).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false,
    message: "Panel unavailable: star-watcher" }));
  expect(useMobileAppStore.getState().stack).toHaveLength(0);

  mocks.policy = HELIX_USER_ACCOUNT_POLICY;
  act(() => window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed", {
    detail: { account_policy: mocks.policy },
  })));
  sendAction("open_panel", "star-watcher");
  expect(mocks.emit).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }));
  expect(screen.getByTestId("mobile-panel").textContent).toBe("star-watcher");
  sendAction("open_panel", "code-admin");
  expect(mocks.emit).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false,
    message: "Panel unavailable: code-admin" }));
  expect(screen.getByTestId("mobile-panel").textContent).toBe("star-watcher");

  mocks.policy = lockedPolicy();
  act(() => window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed", {
    detail: { account_policy: mocks.policy },
  })));
  expect(screen.queryByTestId("mobile-panel")).toBeNull();
  expect(useMobileAppStore.getState().stack.map((entry) => entry.panelId)).toEqual(["star-watcher"]);
  sendAction("focus_panel", "star-watcher");
  expect(mocks.emit).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
  act(() => window.dispatchEvent(new CustomEvent(HELIX_WORKSTATION_ACTION_EVENT, {
    detail: { action: "run_panel_action", panel_id: "star-watcher", action_id: "open" },
  })));
  expect(mocks.emit).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false,
    message: "Panel unavailable: star-watcher" }));
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("publishes the completed job outcome and passes current account panel admission to the executor", async () => {
  mocks.policy = HELIX_USER_ACCOUNT_POLICY;
  let finishJob!: (value: { job_id: string; ok: boolean; step_receipts: unknown[] }) => void;
  mocks.runJob.mockReturnValueOnce(new Promise((resolve) => { finishJob = resolve; }));
  render(<MobileStartPage />);

  act(() => window.dispatchEvent(new CustomEvent(HELIX_WORKSTATION_ACTION_EVENT, {
    detail: { action: "run_job", payload: { preferred_panels: ["code-admin"] } },
  })));
  expect(mocks.runJob).toHaveBeenCalledOnce();
  expect(mocks.emit).not.toHaveBeenCalled();
  const request = mocks.runJob.mock.calls[0][0];
  expect(request.canUsePanel("star-watcher")).toBe(true);
  expect(request.canUsePanel("code-admin")).toBe(false);

  mocks.policy = lockedPolicy();
  act(() => window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed", {
    detail: { account_policy: mocks.policy },
  })));
  expect(request.canUsePanel("star-watcher")).toBe(false);

  await act(async () => finishJob({ job_id: "job:blocked", ok: false, step_receipts: [
    { panel_id: "code-admin", ok: false, message: "Panel unavailable: code-admin" },
  ] }));
  await waitFor(() => expect(mocks.emit).toHaveBeenCalledWith(expect.objectContaining({
    ok: false,
    message: "Job job:blocked steps failed or partially completed.",
    artifact: expect.objectContaining({ job_id: "job:blocked" }),
  })));
});


it("hides unfinished panels by default and updates the launch list immediately on opt-in", () => {
  mocks.policy = HELIX_USER_ACCOUNT_POLICY;
  render(<MobileStartPage />);
  expect(screen.queryByText("Workflow Demo Lab")).toBeNull();
  expect(screen.getAllByText("Star Watcher").length).toBeGreaterThan(0);
  act(() => writeExperimentalLaunchPanels(true));
  expect(screen.getAllByText("Workflow Demo Lab").length).toBeGreaterThan(0);
  expect(screen.queryByText("Code Admin")).toBeNull();
  act(() => writeExperimentalLaunchPanels(false));
  expect(screen.queryByText("Workflow Demo Lab")).toBeNull();
});

it.each(["success", "error", "returned"])("does not publish an old account job after switch: %s", async (outcome) => {
  mocks.policy = HELIX_USER_ACCOUNT_POLICY;
  let finish!: (value: unknown) => void;
  let fail!: (error: Error) => void;
  mocks.runJob.mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  render(<MobileStartPage />);
  act(() => window.dispatchEvent(new CustomEvent(HELIX_WORKSTATION_ACTION_EVENT, {
    detail: { action: "run_job", payload: { preferred_panels: ["star-watcher"] } },
  })));
  expect(mocks.runJob).toHaveBeenCalledOnce();
  mocks.identity = { profileId: outcome === "returned" ? "profile-a" : "profile-b", revision: 2 };
  await act(async () => {
    if (outcome === "error") fail(new Error("Old account details"));
    else finish({ job_id: "old-account-job", ok: true, step_receipts: [{ artifact: { text: "Old account details" } }] });
  });
  expect(mocks.emit).not.toHaveBeenCalled();
});
