// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivateClockMcpPermission from "../PrivateClockMcpPermission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const installationRef = "environment_installation:11111111-1111-4111-8111-111111111111";
const state = (allowed = false) => ({ schema: "casimirbot.private_clock_mcp_permission.v1", allowed, transportReady: false,
  installationRef: allowed ? installationRef : null, clientRef: "fixture:client", expiresAt: allowed ? "2026-10-01T00:00:00.000Z" : null });
const setup = (onOpenSetup?: () => void) => {
  const inspect = vi.fn(async () => state()), grant = vi.fn(async (_ref: string) => state(true)), revoke = vi.fn(async () => ({ revoked: true }));
  window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getPrivateClockMcpPermission: inspect,
    grantPrivateClockMcpPermission: grant, revokePrivateClockMcpPermission: revoke };
  render(<PrivateClockMcpPermission installationRef={installationRef} blocked={false} onOpenSetup={onOpenSetup} />);
  return { inspect, grant, revoke };
};
afterEach(() => { cleanup(); delete window.casimirDesktop; vi.useRealTimers(); });
describe("Home MCP clock permission", () => {
  it.each(["timer", "focus"])("withdraws expired presentation on %s without renewal or native operations", async trigger => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-27T18:00:00Z"));
    let s!: ReturnType<typeof setup>;
    await act(async () => { s = setup(); });
    s.grant.mockResolvedValueOnce({ ...state(true), expiresAt: new Date(Date.now() + 500).toISOString() });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow MCP clock reads" })); });
    expect(screen.getByText(/Clock permission allowed/)).toBeTruthy();
    act(() => {
      if (trigger === "timer") vi.advanceTimersByTime(500);
      else { vi.setSystemTime(new Date(Date.now() + 501)); window.dispatchEvent(new Event("focus")); }
    });
    expect(screen.queryByText(/Clock permission allowed/)).toBeNull();
    expect(screen.getByText(/Clock permission expired/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow MCP clock reads" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop and revoke MCP clock access" })).not.toBeDisabled();
    expect(s.inspect).toHaveBeenCalledTimes(1); expect(s.grant).toHaveBeenCalledTimes(1);
    expect(s.revoke).not.toHaveBeenCalled();
  });
  it("opens native setup without granting or revoking clock access", async () => {
    const open = vi.fn(); const s = setup(open);
    await screen.findByText(/Clock permission not confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Open native connection setup" }));
    expect(open).toHaveBeenCalledOnce();
    expect(s.grant).not.toHaveBeenCalled(); expect(s.revoke).not.toHaveBeenCalled();
    expect(screen.getByText(/A ready transport does not confirm/)).toBeTruthy();
  });
  it("requires an explicit action and distinguishes permission from transport readiness", async () => {
    const s = setup(); const allow = await screen.findByRole("button", { name: "Allow MCP clock reads" });
    await screen.findByText(/Clock permission not confirmed/); expect(s.grant).not.toHaveBeenCalled();
    fireEvent.click(allow); await screen.findByText(/Clock permission allowed/);
    expect(s.grant).toHaveBeenCalledWith(installationRef); expect(screen.getByText(/Transport needs connection or refresh/)).toBeTruthy();
  });
  it("keeps Stop available during an unfinished grant and ignores its late response", async () => {
    const s = setup(); await screen.findByText(/Clock permission not confirmed/);
    let finish!: (value: ReturnType<typeof state>) => void;
    s.grant.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Allow MCP clock reads" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop and revoke MCP clock access" }));
    await screen.findByText("Clock access revoked; active clock work stopped.");
    await act(async () => { finish(state(true)); });
    expect(screen.queryByText(/Clock permission allowed/)).toBeNull(); expect(s.revoke).toHaveBeenCalledTimes(1);
  });
  it("clears permission presentation on account changes", async () => {
    const s = setup(); await screen.findByText(/Clock permission not confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Allow MCP clock reads" })); await screen.findByText(/Clock permission allowed/);
    act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    expect(screen.queryByText(/Clock permission allowed/)).toBeNull(); expect(s.grant).toHaveBeenCalledTimes(1);
  });
  it("reports uncertain withdrawal without claiming it succeeded", async () => {
    const s = setup(); s.revoke.mockRejectedValueOnce(Error("fixture"));
    fireEvent.click(screen.getByRole("button", { name: "Stop and revoke MCP clock access" }));
    await screen.findByText(/Revocation or cleanup could not be confirmed/);
    expect(screen.queryByText("Clock access revoked; active clock work stopped.")).toBeNull();
  });
});
