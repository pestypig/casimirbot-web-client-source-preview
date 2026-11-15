// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectionHealthPanel, { ConnectionHealthProvider } from "../ConnectionHealthPanel";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_DEVELOPER_ACCOUNT_POLICY, HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { connectionFixture, tunnelFixture } from "../../../../../tests/fixtures/local-personal-connection";

const opened = vi.fn();
const chat = vi.hoisted(() => ({ activeId: null as string | null }));
vi.mock("@/store/useWorkstationLayoutStore", () => ({useWorkstationLayoutStore:(select:any)=>select({openPanelInActiveGroup:opened})}));
vi.mock("@/store/useAgiChatStore", () => ({useAgiChatStore:(select:any)=>select({activeId:chat.activeId})}));
const notices = vi.fn();
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
  constructor(title: string, options?: NotificationOptions) { notices(title, options); }
}

beforeEach(() => {
  opened.mockReset(); notices.mockReset(); chat.activeId = null; window.localStorage.clear();
  cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY);
  vi.stubGlobal("Notification", FakeNotification);
  vi.stubGlobal("crypto", {subtle:{digest:vi.fn(async (_algorithm: AlgorithmIdentifier, input: BufferSource) => {
    const bytes = new Uint8Array(input as ArrayBuffer);
    return new Uint8Array(32).fill(bytes.reduce((sum, byte) => (sum + byte) % 256, 0)).buffer;
  })}});
  window.casimirDesktop = {getRuntimeSnapshot:vi.fn(),getMcpTunnelState:vi.fn(async()=>tunnelFixture()),
    getPrivateDevUpdateState:vi.fn(async()=>({runningBuild:"release-main-r164",selectedBuild:"release-main-r164",pendingBuild:null})),
    onMcpTunnelState:vi.fn(()=>()=>{})};
  vi.stubGlobal("fetch", vi.fn(async()=>({ok:true,status:200,json:async()=>connectionFixture()})));
});
afterEach(() => {cleanup(); cacheAccountCapabilityPolicy(null); vi.unstubAllGlobals(); delete window.casimirDesktop;});

describe("Connection Health panel lifecycle", () => {
  it("keeps checking and announces an actionable change while Agent Access is closed", async () => {
    window.localStorage.setItem("casimirbot.connection_health.purpose.v1", "personal_mcp");
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    let state: unknown = tunnelFixture();
    let emitNativeChange: (() => void) | null = null;
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementation(async () => state);
    vi.mocked(window.casimirDesktop!.onMcpTunnelState!).mockImplementation(callback => {
      emitNativeChange = () => callback(state as never);
      return () => {};
    });
    render(<ConnectionHealthProvider><div>Desktop open; Agent Access closed</div></ConnectionHealthProvider>);
    await waitFor(() => expect(window.localStorage.getItem("casimirbot.connection_health.v1")).toContain("identityHash"));
    state = {...tunnelFixture(), status:"degraded", ready:false, healthy:false, processRunning:false};
    await act(async () => emitNativeChange?.());
    await screen.findByRole("alert");
    expect(screen.getByText("Desktop open; Agent Access closed")).toBeTruthy();
    expect(notices).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", {name:"View connection health"}));
    expect(opened).toHaveBeenCalledWith("agent-access");
  });
  it("announces a verified account's degradation on the first check after restart", async () => {
    window.localStorage.setItem("casimirbot.connection_health.purpose.v1", "personal_mcp");
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    let state: unknown = tunnelFixture();
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementation(async () => state);
    const first = render(<ConnectionHealthProvider><div>Desktop open</div></ConnectionHealthProvider>);
    await waitFor(() => expect(window.localStorage.getItem("casimirbot.connection_health.v1")).toContain("identityHash"));
    first.unmount();
    state = {...tunnelFixture(), status:"degraded", ready:false, healthy:false, processRunning:false};
    render(<ConnectionHealthProvider><div>Desktop reopened</div></ConnectionHealthProvider>);
    await screen.findByRole("alert");
    expect(screen.getByText("Desktop reopened")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Connection change");
    expect(notices).toHaveBeenCalledTimes(1);
  });
  it("does not attribute a prior account's saved health to a new account after restart", async () => {
    window.localStorage.setItem("casimirbot.connection_health.purpose.v1", "personal_mcp");
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    let profile = connectionFixture().authenticated_profile_ref;
    let state: unknown = tunnelFixture();
    vi.stubGlobal("fetch", vi.fn(async () => ({ok:true,status:200,json:async () => ({
      ...connectionFixture(), authenticated_profile_ref:profile,
    })})));
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementation(async () => state);
    const first = render(<ConnectionHealthPanel />);
    await waitFor(() => expect(window.localStorage.getItem("casimirbot.connection_health.v1")).toContain("identityHash"));
    first.unmount();
    profile = "another-account-profile-ref";
    state = {...tunnelFixture(), status:"degraded", ready:false, healthy:false, processRunning:false};
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: native transition");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Last verified client presence for this account:/)).toBeNull();
    expect(notices).not.toHaveBeenCalled();
  });
  it("shows the first blocker and routes to its existing human control", async () => {
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockResolvedValueOnce({ ...tunnelFixture(), status:"blocked", ready:false, healthy:false, processRunning:false });
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: native setup");
    fireEvent.click(screen.getByRole("button",{name:"Open recovery control"}));
    expect(opened).toHaveBeenCalledWith("device-check");
    expect(notices).not.toHaveBeenCalled();
  });
  it("names the native checkpoint when its inspection stalls", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementation(() => new Promise(() => {}));
      render(<ConnectionHealthPanel />);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_050); });
      expect(screen.getByText("First blocker: native unverified")).toBeTruthy();
      expect(screen.queryByText(/Connection inspection is unavailable/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("names the service checkpoint when its readiness request stalls", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      render(<ConnectionHealthPanel />);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_050); });
      expect(screen.getByText("First blocker: service read")).toBeTruthy();
      expect(screen.getByText(/local account readiness check failed \(network error\)/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
  it("shows ordinary-account status without invoking the private developer tunnel", async () => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY);
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: required tool");
    expect(window.casimirDesktop?.getMcpTunnelState).not.toHaveBeenCalled();
    expect(screen.getByText("external OAuth connection")).toBeTruthy();
  });
  it("routes an ordinary installed profile through personal Codex and computer approval", async () => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY);
    window.casimirDesktop = {...window.casimirDesktop!,
      personalMcpP1Connection: vi.fn(async () => ({available:true,phase:"ready"})),
      personalMcpDeviceRegistration: vi.fn(async () => ({available:true,phase:"not_approved"}))};
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: device approval");
    expect(screen.getByRole("combobox", {name:"Connection route"})).toHaveProperty("value", "local_stdio");
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes("connection_route=local_stdio"))).toBe(true);
    expect(window.casimirDesktop?.getMcpTunnelState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name:"Open recovery control"}));
    expect(opened).toHaveBeenCalledWith("account-session");
    vi.mocked(window.casimirDesktop!.personalMcpDeviceRegistration!).mockResolvedValue({available:true,phase:"approved"});
    fireEvent.click(screen.getByRole("button", {name:"Check again"}));
    await screen.findByText("First blocker: required tool");
  });
  it("does not notify or suggest reapproval when a healthy ordinary task goes idle", async () => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY);
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    window.casimirDesktop = {...window.casimirDesktop!,
      personalMcpP1Connection: vi.fn(async () => ({available:true,phase:"ready"})),
      personalMcpDeviceRegistration: vi.fn(async () => ({available:true,phase:"approved"}))};
    let idle = false;
    vi.stubGlobal("fetch", vi.fn(async () => ({ok:true,status:200,json:async () => idle
      ? {...connectionFixture(),proof_basis:"none",authenticated_mcp_client_ref:null,
        client_session_ref:null,observed_at:null,heartbeat_expires_at:null,
        readiness:{...connectionFixture().readiness,client_presence:"offline",
          client_authorization:"missing"}}
      : connectionFixture()})));
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: required tool");
    idle = true;
    fireEvent.click(screen.getByRole("button", {name:"Check again"}));
    await screen.findByText("First blocker: protected read");
    expect(screen.getByText(/saved approval and pairing are not disproven/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(notices).not.toHaveBeenCalled();
  });
  it("lets a developer inspect the external route without querying private transport", async () => {
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: exact task");
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockClear();
    fireEvent.change(screen.getByLabelText("Connection route"), {target:{value:"external_oauth"}});
    await screen.findByText("external OAuth connection");
    expect(window.casimirDesktop?.getMcpTunnelState).not.toHaveBeenCalled();
  });
  it("notifies once after healthy-to-actionable change, then keeps Stop quiet", async () => {
    let state: unknown = tunnelFixture();
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementation(async()=>state);
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: exact task");
    fireEvent.change(screen.getByLabelText("Connection purpose"), {target:{value:"personal_mcp"}});
    await screen.findByText("First blocker: required tool");
    const saved = window.localStorage.getItem("casimirbot.connection_health.v1") ?? "";
    expect(saved).toContain("identityHash");
    expect(saved).not.toContain(connectionFixture().authenticated_profile_ref);
    expect(saved).not.toContain(connectionFixture().service_instance_ref);
    expect(saved).not.toContain(connectionFixture().authenticated_mcp_client_ref);
    fireEvent.click(screen.getByRole("button",{name:"Enable Windows connection notices"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Turn off Windows connection notices"})).toBeTruthy());
    state = {...tunnelFixture(), status:"degraded", ready:false, healthy:false, processRunning:false};
    fireEvent.click(screen.getByRole("button",{name:"Check again"}));
    await screen.findByText("First blocker: native transition");
    expect(screen.getByRole("alert").textContent).toContain("Connection change");
    expect(notices).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Check again"}));
    await waitFor(()=>expect(notices).toHaveBeenCalledTimes(1));
    state = {...tunnelFixture(), status:"stopped", ready:false, healthy:false, processRunning:false,
      recovery:{...tunnelFixture().recovery,lastReason:"operator_stop"}};
    fireEvent.click(screen.getByRole("button",{name:"Check again"}));
    await screen.findByText("First blocker: operator stop");
    expect(notices).toHaveBeenCalledTimes(1);
  });
  it("notifies about a selected EXE mismatch while retaining current client presence", async () => {
    window.localStorage.setItem("casimirbot.connection_health.purpose.v1", "personal_mcp");
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    let selectedBuild = "release-main-r164";
    vi.mocked(window.casimirDesktop!.getPrivateDevUpdateState!).mockImplementation(async () => ({
      runningBuild:"release-main-r164", selectedBuild, pendingBuild:null,
    }));
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: required tool");
    await waitFor(() => expect(window.localStorage.getItem("casimirbot.connection_health.v1")).toContain("identityHash"));
    selectedBuild = "release-main-r165";
    fireEvent.click(screen.getByRole("button", {name:"Check again"}));
    await screen.findByText("First blocker: package");
    expect(screen.getAllByText("current")).toHaveLength(2);
    expect(notices).toHaveBeenCalledTimes(1);
  });
  it("keeps safe last-known state visible and notices a later protected-read outage", async () => {
    window.localStorage.setItem("casimirbot.connection_health.purpose.v1", "personal_mcp");
    window.localStorage.setItem("casimirbot.connection_health.windows_notices.v1", "true");
    let reachable = true;
    vi.stubGlobal("fetch", vi.fn(async () => reachable
      ? {ok:true,status:200,json:async () => connectionFixture()}
      : {ok:false,status:503,json:async () => null}));
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: required tool");
    await waitFor(() => expect(screen.getByText(/Last verified client presence for this account:/)).toBeTruthy());
    reachable = false;
    fireEvent.click(screen.getByRole("button", {name:"Check again"}));
    await screen.findByText("First blocker: service read");
    expect(screen.getByText(/Last verified client presence for this account:/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Connection change");
    expect(notices).toHaveBeenCalledTimes(1);
  });
  it("keeps the Windows option off when permission is denied", async () => {
    FakeNotification.permission = "denied";
    FakeNotification.requestPermission.mockResolvedValueOnce("denied");
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: exact task");
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Enable Windows connection notices"})));
    expect(window.localStorage.getItem("casimirbot.connection_health.windows_notices.v1")).toBeNull();
    FakeNotification.permission = "granted";
  });
  it("does not carry a prior account's last-known connection into the next account", async () => {
    let profile = connectionFixture().authenticated_profile_ref;
    vi.stubGlobal("fetch", vi.fn(async()=>({ok:true,status:200,json:async()=>({...connectionFixture(),authenticated_profile_ref:profile})})));
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: exact task");
    fireEvent.change(screen.getByLabelText("Connection purpose"), {target:{value:"personal_mcp"}});
    await screen.findByText("First blocker: required tool");
    const first = window.localStorage.getItem("casimirbot.connection_health.v1");
    profile = "different-authenticated-profile-ref";
    fireEvent.click(screen.getByRole("button",{name:"Check again"}));
    await waitFor(()=>expect(window.localStorage.getItem("casimirbot.connection_health.v1")).not.toBe(first));
    expect(notices).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("verifies the existing accepted pairing and runtime binding only for the same protected task", async () => {
    chat.activeId = "chat-fixture";
    const at = Date.now();
    const task = "task-fixture";
    const byte = new TextEncoder().encode(task).reduce((sum, value) => (sum + value) % 256, 0);
    const taskHash = byte.toString(16).padStart(2, "0").repeat(32);
    const binding = {schema:"helix.reasoning_task_binding.v1",reasoning_binding_id:"binding:fixture",pairing_id:"pairing:fixture",
      binding_epoch:1,status:"active",service_instance_ref:"fixture-service",authenticated_profile_ref:"fixture-profile",
      authenticated_mcp_client_ref:"fixture-client",client_session_ref:"fixture-session",provider_thread_ref_hash:taskHash,
      helix_conversation_id:"chat-fixture",mission_id:null,run_id:null,reasoning_role:"principal",continuation_transport:"polling",
      negotiated_observability_level:"tool_activity_only",created_by:"signed_in_operator",
      created_at:new Date(at-60_000).toISOString(),expires_at:new Date(at+60_000).toISOString(),
      claimed_at:new Date(at-50_000).toISOString(),revoked_at:null,provider_thread_content_included:false,
      hidden_reasoning_included:false,execution_authority:false,evidence_authority:false,answer_authority:false,terminal_eligible:false};
    const pairing = {schema:"helix.pairing_status.v1",id:"pairing:fixture",revision:1,destinationDigest:"b".repeat(64),
      chatId:"chat-fixture",environment:null,state:"accepted",createdAt:new Date(at-120_000).toISOString(),
      invitationExpiresAt:new Date(at-60_000).toISOString(),pairingExpiresAt:new Date(at+60_000).toISOString(),
      acceptedAt:new Date(at-50_000).toISOString(),revokedAt:null,executionAuthority:false,answerAuthority:false};
    vi.stubGlobal("fetch",vi.fn(async(input: RequestInfo | URL)=>{
      const path = String(input);
      return {ok:true,status:200,json:async()=>path.includes("reasoning-bindings/current") ? {ok:true,binding}
        : path.includes("reasoning-pairings/") ? {ok:true,pairing}
        : {...connectionFixture(at),conversation_thread_ref:task}};
    }));
    render(<ConnectionHealthPanel />);
    await screen.findByText("First blocker: none");
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(call=>String(call[0]).includes("reasoning-pairings/"))).toBe(true);
  });
});
