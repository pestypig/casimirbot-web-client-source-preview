// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_SIGNED_OUT_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { usePersonalMcpSavedResume } from "../usePersonalMcpSavedResume";

const fetchPolicy = vi.hoisted(() => vi.fn());
const profile = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "helix-account-capability-policy-changed",
  fetchAccountCapabilityPolicy: fetchPolicy,
  readCachedAccountProfileIdentity: () => ({ profileId: profile.id, revision: 0 }),
}));

const ordinaryPolicy = { ...HELIX_SIGNED_OUT_ACCOUNT_POLICY,
  account_type: "user" as const };

function TestShell() {
  usePersonalMcpSavedResume();
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchPolicy.mockReset();
  profile.id = null;
  delete window.casimirDesktop;
});

describe("saved personal Codex connection on desktop load", () => {
  it("resumes an ordinary account's saved grant once without opening approval", async () => {
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    const connect = vi.fn(async (action: string) => action === "inspect"
      ? { available: true, phase: "ready" }
      : { available: true, phase: "reconnected" });
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await waitFor(() => expect(connect).toHaveBeenCalledWith("resume"));
    window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed",
      { detail: { account_policy: ordinaryPolicy,
        account_profile_id: "auth0:ordinary-one" } }));
    expect(connect.mock.calls.filter(([action]) => action === "resume")).toHaveLength(1);
    expect(connect).not.toHaveBeenCalledWith("start");
  });

  it("waits for an ordinary policy and leaves developer or signed-out sessions alone", async () => {
    fetchPolicy.mockResolvedValue(HELIX_SIGNED_OUT_ACCOUNT_POLICY);
    const connect = vi.fn(async () => ({ available: true, phase: "ready" }));
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await waitFor(() => expect(fetchPolicy).toHaveBeenCalledTimes(1));
    expect(connect).not.toHaveBeenCalled();
    profile.id = "auth0:ordinary-one";
    window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed",
      { detail: { account_policy: ordinaryPolicy,
        account_profile_id: "auth0:ordinary-one" } }));
    await waitFor(() => expect(connect).toHaveBeenCalledWith("resume"));
  });

  it("does not resume or grant access when native setup is unavailable", async () => {
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    const connect = vi.fn(async () => ({ available: false, phase: "website_unavailable" }));
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await waitFor(() => expect(connect).toHaveBeenCalledWith("inspect"));
    expect(connect).not.toHaveBeenCalledWith("resume");
    expect(connect).not.toHaveBeenCalledWith("start");
  });

  it("drops an old profile inspection and resumes only after the new profile is current", async () => {
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    let finishFirst!: (value: { available: boolean; phase: string }) => void;
    const first = new Promise<{ available: boolean; phase: string }>(resolve => {
      finishFirst = resolve;
    });
    let inspections = 0;
    const connect = vi.fn(async (action: string) => {
      if (action === "inspect") return ++inspections === 1
        ? first : { available: true, phase: "ready" };
      return { available: true, phase: "reconnected" };
    });
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await waitFor(() => expect(inspections).toBe(1));
    await act(async () => {
      profile.id = "auth0:ordinary-two";
      window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed",
        { detail: { account_policy: ordinaryPolicy,
          account_profile_id: "auth0:ordinary-two" } }));
      finishFirst({ available: true, phase: "ready" });
    });
    await waitFor(() => expect(inspections).toBe(2));
    await waitFor(() => expect(connect.mock.calls.filter(([action]) => action === "resume"))
      .toHaveLength(1));
  });

  it("retries a transient busy resume without opening a new approval", async () => {
    vi.useFakeTimers();
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    let resumes = 0;
    const connect = vi.fn(async (action: string) => action === "inspect"
      ? { available: true, phase: "ready" }
      : { available: true, phase: ++resumes === 1 ? "busy" : "reconnected" });
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await act(async () => { await Promise.resolve(); });
    expect(resumes).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(resumes).toBe(2);
    expect(connect).not.toHaveBeenCalledWith("start");
  });

  it("cancels a transient retry when the account signs out", async () => {
    vi.useFakeTimers();
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    const connect = vi.fn(async () => ({ available: false,
      phase: "website_unavailable" }));
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await act(async () => { await Promise.resolve(); });
    expect(connect).toHaveBeenCalledTimes(1);
    profile.id = null;
    window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed",
      { detail: { account_policy: HELIX_SIGNED_OUT_ACCOUNT_POLICY,
        account_profile_id: null } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a reconnect whose outcome is unknown", async () => {
    vi.useFakeTimers();
    fetchPolicy.mockResolvedValue(ordinaryPolicy);
    profile.id = "auth0:ordinary-one";
    const connect = vi.fn(async (action: string) => {
      if (action === "inspect") return { available: true, phase: "ready" };
      throw new Error("connection closed after resume started");
    });
    window.casimirDesktop = { getRuntimeSnapshot: async () => null,
      personalMcpP1Connection: connect };
    render(<TestShell />);
    await act(async () => { await Promise.resolve(); });
    expect(connect).toHaveBeenCalledWith("resume");
    await act(async () => { await vi.advanceTimersByTimeAsync(4_500); });
    expect(connect.mock.calls.filter(([action]) => action === "resume")).toHaveLength(1);
  });
});
