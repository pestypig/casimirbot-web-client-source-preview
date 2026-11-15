// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(async () => true),
  paste: vi.fn(),
  event: vi.fn(),
  procedure: vi.fn(),
  execute: vi.fn(),
  open: vi.fn(),
  focus: vi.fn(),
  ask: vi.fn(),
  saveNote: vi.fn((note: { title: string }) => note),
}));

vi.mock("@/lib/desktop/panelRegistry", () => ({
  panelRegistry: [
    { id: "code-admin", workstationCapabilities: { v1_job_ready: true } },
    { id: "star-watcher", workstationCapabilities: { v1_job_ready: true } },
  ],
}));
vi.mock("@/lib/workstation/panelCapabilities", () => ({
  getWorkstationPanelCapabilities: () => ({ can_run_action: true, safe_actions: ["open"], actions: [{ id: "open" }] }),
}));
vi.mock("@/lib/workstation/panelActionAdapters", () => ({ executeHelixPanelAction: mocks.execute }));
vi.mock("@/lib/docs/paperReadCommand", () => ({
  findBestDocForTopic: () => null,
  findRandomPaperForTopic: () => null,
}));
vi.mock("@/lib/helix/ask-prompt-launch", () => ({ launchHelixAskPrompt: mocks.ask }));
vi.mock("@/lib/workstation/workstationClipboard", () => ({
  writeClipboardWithReceipt: mocks.copy,
  recordClipboardReceipt: mocks.paste,
}));
vi.mock("@/lib/helix/liveEventsBus", () => ({ emitHelixAskLiveEvent: mocks.event }));
vi.mock("@/lib/workstation/proceduralPlaybackContract", () => ({ emitHelixWorkstationProceduralStep: mocks.procedure }));
vi.mock("@/store/useWorkstationNotesStore", () => ({
  useWorkstationNotesStore: { getState: () => ({ upsertWorkflowNote: mocks.saveNote }) },
}));

import { cacheAccountCapabilityPolicy } from "../accountCapabilityPolicy";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";

import { runWorkstationJob } from "../jobExecutor";

const executionContext = {
  openPanel: mocks.open,
  focusPanel: mocks.focus,
  closePanel: vi.fn(),
  openSettings: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copy.mockReset().mockResolvedValue(true);
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-a");
  mocks.execute.mockReturnValue({ ok: true, message: "Opened." });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "# Paper\nStar watcher research." })));
});

it("records a denied generic panel step without running its action", async () => {
  const result = await runWorkstationJob({
    contextId: "test",
    payload: { preferred_panels: ["code-admin", "star-watcher"], max_steps: 2 },
    executionContext,
    canUsePanel: (panelId) => panelId === "star-watcher",
  });

  expect(result.ok).toBe(false);
  expect(result.step_receipts).toEqual([
    expect.objectContaining({ panel_id: "code-admin", ok: false, message: "Panel unavailable: code-admin" }),
    expect.objectContaining({ panel_id: "star-watcher", ok: true }),
  ]);
  expect(mocks.execute).toHaveBeenCalledOnce();
  expect(mocks.execute.mock.calls[0][0].panel_id).toBe("star-watcher");
});

it("omits hidden panels from an automatically selected job", async () => {
  const result = await runWorkstationJob({
    contextId: "test",
    payload: {},
    executionContext,
    canUsePanel: (panelId) => panelId === "star-watcher",
  });

  expect(result.ok).toBe(true);
  expect(result.step_receipts.map((receipt) => receipt.panel_id)).toEqual(["star-watcher"]);
  expect(mocks.execute).toHaveBeenCalledOnce();
});

it("runs the research workflow through public panels without opening hidden developer panels", async () => {
  const result = await runWorkstationJob({
    contextId: "test",
    payload: { workflow: "observable_research_pipeline", objective: "star watcher" },
    executionContext,
    canUsePanel: (panelId) => !["workstation-workflow-timeline", "agi-essence-console"].includes(panelId),
  });

  expect(result.ok).toBe(true);
  expect(mocks.open.mock.calls.map(([panelId]) => panelId)).toEqual([
    "docs-viewer", "workstation-notes", "workstation-clipboard-history",
  ]);
  expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ panelId: "workstation-notes" }));
  expect(result.step_receipts[0]).toEqual(expect.objectContaining({
    ok: true,
    artifact: expect.objectContaining({ requested_panels: [
      "docs-viewer", "workstation-notes", "workstation-clipboard-history",
    ] }),
  }));
});

it("fails closed before the research workflow runs if a required panel is unavailable", async () => {
  const result = await runWorkstationJob({
    contextId: "test",
    payload: { workflow: "observable_research_pipeline" },
    executionContext,
    canUsePanel: (panelId) => panelId !== "workstation-notes",
  });

  expect(result.ok).toBe(false);
  expect(result.step_receipts[0].message).toBe("Required panel unavailable: workstation-notes");
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.saveNote).not.toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
});

it("does not save a note or queue Ask after account access is revoked during a document read", async () => {
  let finishFetch!: (value: { ok: boolean; text: () => Promise<string> }) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishFetch = resolve; })));
  let accessCurrent = true;
  const pending = runWorkstationJob({
    contextId: "test",
    payload: { workflow: "observable_research_pipeline", objective: "star watcher" },
    executionContext,
    canUsePanel: (panelId) => accessCurrent && panelId !== "agi-essence-console",
  });

  accessCurrent = false;
  finishFetch({ ok: true, text: async () => "# Paper\nStar watcher research." });
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(result.step_receipts.at(-1)?.message).toContain("Required panel unavailable");
  expect(mocks.saveNote).not.toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
});

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("stops a same-policy account switch during a document read (return to original: %s)", async (returnToOriginal) => {
  let finishFetch!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishFetch = resolve; })));
  const pending = runWorkstationJob({
    contextId: "test", payload: { workflow: "observable_research_pipeline", objective: "star watcher" },
    executionContext, canUsePanel: () => true,
  });
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-b");
  if (returnToOriginal) cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-a");
  const eventCount = mocks.event.mock.calls.length;
  const procedureCount = mocks.procedure.mock.calls.length;
  finishFetch({ ok: true, text: async () => "# Paper\nStar watcher research." });
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(mocks.copy).not.toHaveBeenCalled();
  expect(mocks.saveNote).not.toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.event).toHaveBeenCalledTimes(eventCount);
  expect(mocks.procedure).toHaveBeenCalledTimes(procedureCount);
});

it.each(["account", "policy"])("stops after clipboard completion when %s admission changes", async (change) => {
  let finishCopy!: (value: boolean) => void;
  mocks.copy.mockImplementationOnce(() => new Promise((resolve) => { finishCopy = resolve; }));
  let allowed = true;
  const pending = runWorkstationJob({
    contextId: "test", payload: { workflow: "observable_research_pipeline", objective: "star watcher" },
    executionContext, canUsePanel: () => allowed,
  });
  await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce());
  if (change === "account") cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-b");
  else allowed = false;
  const eventCount = mocks.event.mock.calls.length;
  const procedureCount = mocks.procedure.mock.calls.length;
  finishCopy(true);
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(mocks.copy).toHaveBeenCalledOnce();
  expect(mocks.paste).not.toHaveBeenCalled();
  expect(mocks.saveNote).not.toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.procedure).toHaveBeenCalledTimes(procedureCount);
  if (change === "account") expect(mocks.event).toHaveBeenCalledTimes(eventCount);
});
