// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalPersonalConnectionSetup from "../LocalPersonalConnectionSetup";
import { HELIX_DEVELOPER_ACCOUNT_POLICY, HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { connectionFixture, tunnelFixture, installationFixture, permissionFixture } from "../../../../../tests/fixtures/local-personal-connection";
const mocks=vi.hoisted(()=>({open:vi.fn()}));
vi.mock("@/store/useWorkstationLayoutStore",()=>({useWorkstationLayoutStore:(selector:any)=>selector({openPanelInActiveGroup:mocks.open})}));
beforeEach(()=>{
  mocks.open.mockReset();
  cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY);
  vi.stubGlobal("crypto",{subtle:{digest:vi.fn(async()=>new Uint8Array(32).buffer)}});
  window.casimirDesktop={getRuntimeSnapshot:vi.fn(),getMcpTunnelState:vi.fn(async()=>tunnelFixture()),
    getPrivateEnvironmentState:vi.fn(async()=>installationFixture()),getPrivateClockMcpPermission:vi.fn(async()=>permissionFixture()),
    recoverPrivateClockObservation:vi.fn(async()=>({state:"empty",fresh:false,legacyRecords:0})),
    startMcpTunnel:vi.fn(),grantPrivateClockMcpPermission:vi.fn(),observePrivateClock:vi.fn()};
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>connectionFixture()})));
});
afterEach(()=>{cleanup();cacheAccountCapabilityPolicy(null);vi.unstubAllGlobals();vi.useRealTimers();delete window.casimirDesktop;});
const inspect=()=>fireEvent.click(screen.getByRole("button",{name:"Inspect / resume connection"}));
describe("local Connect Codex",()=>{
  it("keeps the private installed clock qualification out of an ordinary account",()=>{
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY);
    render(<LocalPersonalConnectionSetup/>);
    expect(screen.queryByRole("region",{name:"Connect Codex locally"})).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    act(()=>cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY));
    expect(screen.getByRole("region",{name:"Connect Codex locally"})).toBeTruthy();
    act(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY));
    expect(screen.queryByRole("region",{name:"Connect Codex locally"})).toBeNull();
  });
  it("retains an inspection across identical native tunnel notifications",async()=>{
    let notify!:(value:unknown)=>void;
    Object.defineProperty(window.casimirDesktop,"onMcpTunnelState",{value:vi.fn((listener:(value:unknown)=>void)=>{notify=listener;return()=>{};})});
    render(<LocalPersonalConnectionSetup/>);inspect();
    await screen.findByText("Current installation grant");
    act(()=>notify(tunnelFixture()));
    expect(screen.queryByText("Current installation grant")).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    act(()=>notify({...tunnelFixture(),ready:false,healthy:false,status:"degraded"}));
    expect(screen.queryByText("Current installation grant")).toBeNull();
  });
  it("releases Inspect after identity hashing stalls and ignores its late completion",async()=>{
    vi.useFakeTimers();
    let finish!:(value:ArrayBuffer)=>void;
    vi.mocked(crypto.subtle.digest).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<LocalPersonalConnectionSetup/>);
    await act(async()=>inspect());
    expect(crypto.subtle.digest).toHaveBeenCalled();
    await act(async()=>vi.advanceTimersByTime(10000));
    expect((screen.getByRole("button",{name:"Inspect / resume connection"}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Inspection unavailable/)).toBeTruthy();
    await act(async()=>finish(new Uint8Array(32).buffer));
    expect(screen.queryByText("Current installation grant")).toBeNull();
    await act(async()=>inspect());
    expect(screen.queryByText("Current installation grant")).not.toBeNull();
  });
  it("bounds a stalled native read and does not overwrite a successful retry",async()=>{
    vi.useFakeTimers();
    let finish!:(value:ReturnType<typeof tunnelFixture>)=>void;
    vi.mocked(window.casimirDesktop!.getMcpTunnelState!).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<LocalPersonalConnectionSetup/>);
    await act(async()=>inspect());
    await act(async()=>vi.advanceTimersByTime(10000));
    expect((screen.getByRole("button",{name:"Inspect / resume connection"}) as HTMLButtonElement).disabled).toBe(false);
    await act(async()=>inspect());
    expect(screen.queryByText("Current installation grant")).not.toBeNull();
    await act(async()=>finish({...tunnelFixture(),ready:false,healthy:false,status:"degraded"}));
    expect(screen.queryByText("Current installation grant")).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.casimirDesktop!.startMcpTunnel).not.toHaveBeenCalled();
  });
  it("invalidates malformed notifications and reopens without remembered readiness",async()=>{
    let notify!:(value:unknown)=>void;
    const remove=vi.fn();
    Object.defineProperty(window.casimirDesktop,"onMcpTunnelState",{value:vi.fn((listener:(value:unknown)=>void)=>{notify=listener;return remove;})});
    const view=render(<LocalPersonalConnectionSetup/>);inspect();
    await screen.findByText("Current installation grant");
    act(()=>notify({ready:true}));
    expect(screen.queryByText("Current installation grant")).toBeNull();
    expect((screen.getByRole("button",{name:"Inspect / resume connection"}) as HTMLButtonElement).disabled).toBe(false);
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    render(<LocalPersonalConnectionSetup/>);
    expect(screen.queryByText("Current installation grant")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    inspect();
    await screen.findByText("Current installation grant");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("resumes from durable observations without starting, granting, or observing",async()=>{
    render(<LocalPersonalConnectionSetup/>);expect(fetch).not.toHaveBeenCalled();inspect();
    await screen.findByText("Current installation grant");
    expect(window.casimirDesktop!.startMcpTunnel).not.toHaveBeenCalled();
    expect(window.casimirDesktop!.grantPrivateClockMcpPermission).not.toHaveBeenCalled();
    expect(window.casimirDesktop!.observePrivateClock).not.toHaveBeenCalled();
    expect(screen.getByText("Exact clock tool availability")).toBeTruthy();
    expect(document.body.textContent).not.toContain("fixture-client");
    fireEvent.click(screen.getByRole("button",{name:"Open next control"}));expect(mocks.open).toHaveBeenCalledWith("environment-home");
  });
  it("opens protected bootstrap when MCP and native inspection are unavailable",()=>{
    delete window.casimirDesktop;render(<LocalPersonalConnectionSetup/>);
    fireEvent.click(screen.getByRole("button",{name:"Open protected native setup"}));
    expect(mocks.open).toHaveBeenCalledWith("device-check");expect(fetch).not.toHaveBeenCalled();
  });
  it("suppresses late inspection after revoke without accepting event payload",async()=>{
    let resolve!:(value:unknown)=>void;vi.mocked(fetch).mockImplementation(()=>new Promise(done=>{resolve=done;}) as any);
    render(<LocalPersonalConnectionSetup/>);inspect();
    act(()=>window.dispatchEvent(new CustomEvent(AGENT_CONNECTION_INVALIDATED_EVENT,{detail:{grant:"current"}})));
    await act(async()=>resolve({ok:true,json:async()=>connectionFixture()}));
    expect(screen.queryByText("Current installation grant")).toBeNull();expect(screen.getByText(/Inspect again before continuing/)).toBeTruthy();
  });
  it("clears at expiry without automatic repair or poll",async()=>{
    vi.useFakeTimers();render(<LocalPersonalConnectionSetup/>);await act(async()=>inspect());
    await act(async()=>vi.advanceTimersByTime(30000));
    expect(screen.queryByText("Current installation grant")).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.casimirDesktop!.startMcpTunnel).not.toHaveBeenCalled();
  });
});
