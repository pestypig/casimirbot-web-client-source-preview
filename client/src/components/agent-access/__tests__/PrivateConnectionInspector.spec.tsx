// @vitest-environment jsdom
import React from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {buildHelixAgentClientReadiness} from "@shared/helix-agent-client-readiness";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";
import {AGENT_CONNECTION_INVALIDATED_EVENT} from "@/lib/agent-access/connectionObservation";
import PrivateConnectionInspector from "../PrivateConnectionInspector";
import {clearPendingWorkstationGuidance,consumePendingWorkstationGuidance} from "@/lib/workstation/workstationGuidance";

const status=()=>{
  const readiness=buildHelixAgentClientReadiness({agentSelected:true,provider_application:"available",client_authorization:"active",
    client_presence:"online",catalog_sync:"current",thread_attachment:"attached",continuation_readiness:"polling",environment_readiness:"not_selected"});
  return {schema:"helix.agent_connection_status.v1",selected_client_profile:"codex_app",selected_profile_is_preference_only:true,
    client_kind_verified:false,authenticated_profile_ref:"private-profile",service_instance_ref:"private-service",oauth_binding_ref:null,
    authenticated_mcp_client_ref:"private-client",client_session_ref:"private-session",conversation_thread_ref:"private-thread",
    proof_basis:"authenticated_presence_tool",observed_at:new Date().toISOString(),heartbeat_expires_at:new Date(Date.now()+60000).toISOString(),
    authorization_changed_after_presence:false,catalog_reenumeration_required:false,catalog_recovery:"none",
    thread_observability_bridge:{negotiated_level:"tool_activity_only",declaration_basis:"authenticated_client_declaration",
      checkpoint_publication_status:"not_requested",checkpoint_freshness_window_seconds:null,checkpoint_retention:"none",checkpoint_revocation:"not_applicable",
      provider_thread_content_included:false,hidden_reasoning_included:false,activity_completeness_claimed:false},
    readiness,readiness_schema:readiness.schema,credential_included:false,oauth_subject_included:false,raw_claims_included:false,
    provider_thread_content_included:false,hidden_reasoning_included:false,environment_authority:false,mutation_authority:false,answer_authority:false,terminal_eligible:false};
};
const response=(body:unknown,code=200)=>({ok:code===200,status:code,json:async()=>body});
let fetcher:ReturnType<typeof vi.fn>,open:ReturnType<typeof vi.fn>;
beforeEach(()=>{fetcher=vi.fn();fetcher.mockImplementation(async()=>response(status()));open=vi.fn();vi.stubGlobal("fetch",fetcher);});
afterEach(()=>{cleanup();clearPendingWorkstationGuidance();vi.unstubAllGlobals();vi.useRealTimers();});
const mount=()=>render(<PrivateConnectionInspector scope="clock · private.1" onOpenSetup={open}/>);
const check=()=>fireEvent.click(screen.getByRole("button",{name:"Check connection status"}));
describe("private connection inspection",()=>{
  it("does nothing on open or target selection and navigates only on explicit setup",()=>{
    mount();expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox",{name:"AI app to inspect"}),{target:{value:"standard_mcp"}});
    expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Open connection setup"}));expect(open).toHaveBeenCalledTimes(1);expect(fetcher).not.toHaveBeenCalled();
    expect(consumePendingWorkstationGuidance()).toMatchObject({kind:"user_attention",panelId:"agent-access",targetId:"external-ai-connection-setup-standard-mcp"});
  });
  it("uses authenticated read-only status and projects no opaque refs or authority",async()=>{
    mount();check();await screen.findByText("Authorization");expect(screen.getByText("online")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("client_profile=codex_app"),expect.objectContaining({credentials:"same-origin",cache:"no-store"}));
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();expect(document.body.textContent).not.toContain("private-profile");
    expect(document.body.textContent).not.toContain("private-thread");expect(screen.getByText(/Package access is separate/)).toBeTruthy();
  });
  it.each(["wrong_profile","malformed","expired","missing_expiry","unproven"])("rejects %s response",async kind=>{
    const value=status();if(kind==="wrong_profile")value.selected_client_profile="standard_mcp";
    if(kind==="malformed")value.credential_included=true;
    if(kind==="expired")value.heartbeat_expires_at=new Date(Date.now()-1).toISOString();
    if(kind==="missing_expiry")value.heartbeat_expires_at=null as never;
    if(kind==="unproven")value.proof_basis="none";
    fetcher.mockResolvedValue(response(value));mount();check();await screen.findByText(/Connection status is unavailable/);
    expect(screen.queryByText("Authorization")).toBeNull();
  });
  it("clears data after 30 seconds without polling",async()=>{
    vi.useFakeTimers();mount();await act(async()=>check());expect(screen.getByText("online")).toBeTruthy();
    await act(async()=>vi.advanceTimersByTime(30000));expect(screen.queryByText("online")).toBeNull();
    expect(screen.getByText(/Connection status expired/)).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("expires sooner when presence expires",async()=>{
    vi.useFakeTimers();const value=status();value.heartbeat_expires_at=new Date(Date.now()+1000).toISOString();fetcher.mockResolvedValue(response(value));
    mount();await act(async()=>check());await act(async()=>vi.advanceTimersByTime(1000));expect(screen.queryByText("online")).toBeNull();
  });
  it.each(["account","revocation","profile","scope","unmount"])("discards a late response after %s change",async kind=>{
    let resolve!:(value:unknown)=>void;fetcher.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const view=mount();check();const signal=fetcher.mock.calls[0][1].signal;
    if(kind==="account")act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    if(kind==="revocation")act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    if(kind==="profile")fireEvent.change(screen.getByRole("combobox"),{target:{value:"standard_mcp"}});
    if(kind==="scope")view.rerender(<PrivateConnectionInspector scope="different package" onOpenSetup={open}/>);
    if(kind==="unmount")view.unmount();
    expect(signal.aborted).toBe(true);await act(async()=>resolve(response(status())));expect(screen.queryByText("online")).toBeNull();
  });
  it("clears already-visible data on account change",async()=>{
    mount();check();await screen.findByText("online");act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    expect(screen.queryByText("online")).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("clears a visible snapshot on invalidation without trusting event payload or polling",async()=>{
    const view=mount();check();await screen.findByText("online");
    act(()=>window.dispatchEvent(new CustomEvent(AGENT_CONNECTION_INVALIDATED_EVENT,{detail:{client_authorization:"active",client_presence:"online"}})));
    expect(screen.queryByText("Authorization")).toBeNull();expect(screen.getByText("Connection status has not been checked.")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);view.unmount();
    act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles signed-out and timeout responses without retaining readiness",async()=>{
    fetcher.mockResolvedValue(response(null,401));mount();check();await screen.findByText(/Sign in to check/);
    vi.useFakeTimers();fetcher.mockImplementation((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(Error("timeout")))));
    await act(async()=>check());await act(async()=>vi.advanceTimersByTime(10000));
    expect(screen.getByText(/Connection status is unavailable/)).toBeTruthy();expect(screen.getByRole("button",{name:"Check connection status"})).toBeEnabled();
  });
});
