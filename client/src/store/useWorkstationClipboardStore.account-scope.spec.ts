/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  cacheAccountCapabilityPolicy,
  HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
} from "@/lib/workstation/accountCapabilityPolicy";
import {
  clipboardStorageKeyForProfile,
  useWorkstationClipboardStore,
} from "@/store/useWorkstationClipboardStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
});

describe("workstation clipboard history account scope", () => {
  it("separates account receipts and leaves shared legacy content unclaimed", () => {
    localStorage.setItem("workstation-clipboard-history:v1", JSON.stringify({
      state: { receipts: [{ id: "legacy", text: "Old private clipboard" }] },
      version: 0,
    }));

    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationClipboardStore.getState().receipts).toEqual([]);
    useWorkstationClipboardStore.getState().addReceipt({
      id: "alpha", direction: "copy", text: "Alpha clipboard", source: "test",
    });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useWorkstationClipboardStore.getState().receipts).toEqual([]);
    useWorkstationClipboardStore.getState().addReceipt({
      id: "beta", direction: "paste", text: "Beta clipboard", source: "test",
    });

    cacheAccountCapabilityPolicy(null, null);
    expect(useWorkstationClipboardStore.getState().receipts).toEqual([]);
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationClipboardStore.getState().receipts.map((receipt) => receipt.text))
      .toEqual(["Alpha clipboard"]);
    expect(localStorage.getItem("workstation-clipboard-history:v1"))
      .toContain("Old private clipboard");
    expect(localStorage.getItem(clipboardStorageKeyForProfile("profile:alpha")))
      .toContain("Alpha clipboard");
    expect(localStorage.getItem(clipboardStorageKeyForProfile("profile:beta")))
      .toContain("Beta clipboard");
  });

  it("does not hydrate previously persisted unresolved receipts", () => {
    const unresolvedKey = clipboardStorageKeyForProfile(undefined);
    localStorage.setItem(unresolvedKey, JSON.stringify({
      state: { receipts: [{ id: "unresolved", text: "Unassigned clipboard" }] },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    window.dispatchEvent(new StorageEvent("storage", {
      key: HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
    }));
    expect(useWorkstationClipboardStore.getState().receipts).toEqual([]);
  });
});
