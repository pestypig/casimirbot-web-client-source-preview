/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(), heartbeat: vi.fn(), identity: { profileId: "profile:self", revision: 0 },
  policy: { feature_flags: ["friends_parties"], locked_features: [] as string[] },
}));
vi.mock("../FriendsPartiesApi", () => ({ friendsPartiesApi: mocks }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "account-changed",
  fetchAccountCapabilityPolicy: async () => mocks.policy,
  readCachedAccountCapabilityPolicy: () => mocks.policy,
  readCachedAccountProfileIdentity: () => ({ ...mocks.identity }),
}));
import { useWorkstationSocialPresence } from "../useWorkstationSocialPresence";
describe("workstation presence outside the Friends panel", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    mocks.identity = { profileId: "profile:self", revision: 0 };
    mocks.policy.locked_features = [];
    mocks.list.mockResolvedValue({ profile: { profile_id: "profile:self" }, party: null });
    mocks.heartbeat.mockResolvedValue({});
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it("heartbeats immediately, renews while running and stops on unmount", async () => {
    const { unmount } = renderHook(useWorkstationSocialPresence);
    await act(async () => {});
    expect(mocks.heartbeat).toHaveBeenCalledWith("online");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
  });
  it("projects party membership without needing the social panel", async () => {
    mocks.list.mockResolvedValue({ profile: { profile_id: "profile:self" }, party: { party_id: "party:one" } });
    renderHook(useWorkstationSocialPresence);
    await act(async () => {});
    expect(mocks.heartbeat).toHaveBeenCalledWith("in_party");
  });
  it("does not publish when locked or signed out", async () => {
    mocks.policy.locked_features = ["friends_parties"];
    renderHook(useWorkstationSocialPresence);
    await act(async () => {});
    expect(mocks.list).not.toHaveBeenCalled();
    mocks.policy.locked_features = [];
    mocks.identity.profileId = "";
    await act(async () => { window.dispatchEvent(new Event("account-changed")); });
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("discards a pending old-profile result on sign-out", async () => {
    let finish!: (value: unknown) => void;
    mocks.list.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderHook(useWorkstationSocialPresence);
    await act(async () => {});
    mocks.identity = { profileId: "", revision: 1 };
    await act(async () => { finish({ profile: { profile_id: "profile:self" }, party: null }); });
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
