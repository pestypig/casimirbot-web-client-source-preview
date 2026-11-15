// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { cacheAccountCapabilityPolicy } from "../accountCapabilityPolicy";
const mocks = vi.hoisted(() => ({ receipt: vi.fn(), event: vi.fn() }));
vi.mock("@/store/useWorkstationClipboardStore", () => ({
  useWorkstationClipboardStore: { getState: () => ({ addReceipt: mocks.receipt }) },
}));
vi.mock("@/lib/helix/liveEventsBus", () => ({ emitHelixAskLiveEvent: mocks.event }));
import { readClipboardWithReceipt, writeClipboardWithReceipt } from "../workstationClipboard";
beforeEach(() => {
  vi.clearAllMocks();
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-a");
});
afterEach(() => vi.unstubAllGlobals());
it.each(["read", "write"])("discards late clipboard %s across an account round trip", async (operation) => {
  let finish!: (value?: string) => void;
  const pendingClipboard = new Promise<string | undefined>((resolve) => { finish = resolve; });
  vi.stubGlobal("navigator", { clipboard: { readText: () => pendingClipboard, writeText: () => pendingClipboard } });
  const pending = operation === "read"
    ? readClipboardWithReceipt({ source: "test" })
    : writeClipboardWithReceipt({ source: "test", text: "old account text" });
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-b");
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile-a");
  finish("old account text");
  expect(await pending).toBe(operation === "read" ? null : false);
  expect(mocks.receipt).not.toHaveBeenCalled();
  expect(mocks.event).not.toHaveBeenCalled();
});
it("records normal clipboard reads and writes in the unchanged account", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { readText: async () => "current text", writeText } });
  expect(await writeClipboardWithReceipt({ source: "test", text: "current text" })).toBe(true);
  expect(await readClipboardWithReceipt({ source: "test" })).toBe("current text");
  expect(writeText).toHaveBeenCalledWith("current text");
  expect(mocks.receipt.mock.calls.map(([receipt]) => receipt.direction)).toEqual(["write", "read"]);
  expect(mocks.event).toHaveBeenCalledTimes(2);
});
