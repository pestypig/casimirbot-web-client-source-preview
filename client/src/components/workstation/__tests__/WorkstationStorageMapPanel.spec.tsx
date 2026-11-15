// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHelixWorkspaceStorageAuthority, summarizeHelixWorkspaceStorage, withHelixWorkspaceStorageAuthority, type HelixWorkspaceStorageStatus } from "@shared/helix-workspace-storage-status";
const mocks = vi.hoisted(() => ({ artifacts: {}, identity: { profileId: "profile:a", revision: 0 } }));
vi.mock("@/hooks/useHelixStartSettings", () => ({ useHelixStartSettings: () => ({ userSettings: { interfaceLanguage: "en" } }) }));
vi.mock("@/lib/i18n/interfaceText", () => ({ useInterfaceText: () => ({ t: (key: string) => key }) }));
vi.mock("@/store/useWorkspaceMemoryRegistryStore", () => ({ useWorkspaceMemoryRegistryStore: (select: (value: object) => unknown) => select({ artifacts: mocks.artifacts }) }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test-account-policy",
  readCachedAccountProfileIdentity: () => ({ ...mocks.identity }),
}));
import WorkstationStorageMapPanel from "../WorkstationStorageMapPanel";

const status = (label = "Current storage"): HelixWorkspaceStorageStatus => {
  const records = [withHelixWorkspaceStorageAuthority({
    artifact_id: "star_watcher.solar_download_requests", label,
    artifact_type: "workspace_storage" as const, owner_scope: "profile" as const,
    storage_backend: "desktop_local" as const, sync_status: "local_only" as const,
    status: "available" as const, path_ref: "casimirbot://solar-observations/downloads",
    size_bytes: 1024, approximate: false, observed: true,
    diagnostics: { shared_solar_quota_bytes: 2048, request_count: 2 },
  })];
  return { schema_version: "helix.workspace_storage_status.v1", generated_at: "2026-11-13T00:00:00Z", records, summary: summarizeHelixWorkspaceStorage(records), authority: buildHelixWorkspaceStorageAuthority() };
};
type Pending = { signal?: AbortSignal; resolve: (response: Response) => void };
let pending: Pending[];
let fetchMock: ReturnType<typeof vi.fn>;
const reply = async (index: number, label?: string) => {
  await act(async () => pending[index].resolve({ ok: true, json: async () => status(label) } as Response));
};
const switchProfile = () => {
  mocks.identity = { profileId: "profile:b", revision: 1 };
  window.dispatchEvent(new Event("test-account-policy"));
};
describe("storage refresh lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); sessionStorage.clear();
    mocks.identity = { profileId: "profile:a", revision: 0 };
    pending = [];
    fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>(resolve => pending.push({ resolve, signal: init?.signal ?? undefined })));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("waits ten seconds after mounting instead of refetching immediately after each response", async () => {
    render(<WorkstationStorageMapPanel />);
    await reply(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Desktop local data").length).toBeGreaterThan(0);
    expect(screen.getByText("Shared solar-data quota: 2 KiB")).toBeTruthy();
    expect(screen.getByText("Temporary download folders: 2")).toBeTruthy();
    expect(screen.getByText(/does not recheck FITS source hashes/)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(9999));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a periodic refresh when the panel closes", async () => {
    const view = render(<WorkstationStorageMapPanel />);
    await reply(0);
    await act(async () => vi.advanceTimersByTime(10000));
    const periodic = pending.at(-1)!;
    view.unmount();
    expect(periodic.signal?.aborted).toBe(true);
    const calls = fetchMock.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(20000));
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("retires an outstanding refresh before an explicit replacement", () => {
    render(<WorkstationStorageMapPanel />);
    fireEvent.click(screen.getByRole("button", { name: "storageMap.action.refreshAria" }));
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending[1].signal?.aborted).toBe(false);
  });

  it("clears the old profile's inventory and refreshes on account change", async () => {
    render(<WorkstationStorageMapPanel />);
    await reply(0, "Old account storage");
    expect(screen.getAllByText("Old account storage").length).toBeGreaterThan(0);
    act(switchProfile);
    expect(screen.queryAllByText("Old account storage")).toHaveLength(0);
    await reply(pending.length - 1, "New account storage");
    expect(screen.getAllByText("New account storage").length).toBeGreaterThan(0);
  });

  it("discards a late JSON body from an account retired while the body was pending", async () => {
    let finishBody!: (body: HelixWorkspaceStorageStatus) => void;
    render(<WorkstationStorageMapPanel />);
    await act(async () => pending[0].resolve({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) } as Response));
    act(switchProfile);
    await act(async () => finishBody(status("Retired response")));
    expect(screen.queryAllByText("Retired response")).toHaveLength(0);
  });
});
