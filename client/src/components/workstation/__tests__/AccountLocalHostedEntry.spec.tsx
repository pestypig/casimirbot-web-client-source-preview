// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountSessionPanel from "../AccountSessionPanel";
import { HELIX_DEVELOPER_ACCOUNT_POLICY, HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
const lifecycle=vi.hoisted(()=>({mount:vi.fn(),unmount:vi.fn()}));
vi.mock("@/components/agent-access/LocalHostedSubscription",()=>({LocalHostedSubscription:()=>{
  React.useEffect(()=>{lifecycle.mount();return ()=>lifecycle.unmount();},[]);
  return <section aria-label="Synthetic hosted entry">Synthetic hosted entry</section>;
}}));
vi.mock("@/components/auth/GoogleSignInButton",()=>({GoogleSignInButton:()=>null}));
vi.mock("@/components/auth/Auth0SignInButton",()=>({Auth0SignInButton:()=>null}));
vi.mock("@/components/workstation/BrokerageConnectionsCard",()=>({BrokerageConnectionsCard:()=>null}));
const status=(account:"developer"|"user",sessionId="fixture-session",profileId="fixture-profile")=>({
  schema:"helix.account_session_status.v1",ok:true,account_policy:account==="developer"?HELIX_DEVELOPER_ACCOUNT_POLICY:HELIX_USER_ACCOUNT_POLICY,
  session:{session_id:sessionId,profile:{profile_id:profileId,display_name:"Synthetic setup account",email:null,auth_mode:"local_dev_profile",provider:"local"},
    status:"active",memory_scope:"session_only",created_at:"2026-09-27T00:00:00Z",updated_at:"2026-09-27T00:00:00Z"},
  linked_accounts:[],profile_ingress_tokens:[],profile_ingress_usage:{request_count:0,accepted_count:0,rejected_count:0,estimated_token_count:0,last_event_at:null},
  usage:{thread_count:0,item_count:0,answer_count:0,tool_observation_count:0,validation_count:0,estimated_token_count:0,window_started_at:"",window_ended_at:""},
  auth_boundary:{credential_collection_allowed_in_agents:false,raw_password_stored:false,discord_bot_password_collection_allowed:false,recommended_flow:"web_auth_or_oauth_link"},
});
let current:any;
beforeEach(()=>{lifecycle.mount.mockReset();lifecycle.unmount.mockReset();current=status("developer");
  window.casimirDesktop={getRuntimeSnapshot:vi.fn()};
  vi.stubGlobal("fetch",vi.fn(async(input)=>new Response(JSON.stringify(String(input).startsWith("/api/account/session")?current:
    {sessions:[],archives:[],jobs:[]}),{status:200,headers:{"Content-Type":"application/json"}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete window.casimirDesktop;localStorage.clear();});
const refresh=()=>fireEvent.click(screen.getAllByRole("button",{name:"Refresh"})[0]);
describe("private developer account hosted slot",()=>{
  it("unmounts previous term view on same-profile session replacement and profile replacement",async()=>{
    render(<AccountSessionPanel/>);await screen.findByRole("region",{name:"Synthetic hosted entry"});expect(lifecycle.mount).toHaveBeenCalledTimes(1);
    current=status("developer","replacement-session");refresh();
    await waitFor(()=>expect(lifecycle.mount).toHaveBeenCalledTimes(2));expect(lifecycle.unmount).toHaveBeenCalledTimes(1);
    current=status("developer","third-session","another-profile");refresh();
    await waitFor(()=>expect(lifecycle.mount).toHaveBeenCalledTimes(3));expect(lifecycle.unmount).toHaveBeenCalledTimes(2);
  });
  it("removes the local hosted entry when developer session becomes public user",async()=>{
    render(<AccountSessionPanel/>);await screen.findByRole("region",{name:"Synthetic hosted entry"});
    current=status("user");refresh();await waitFor(()=>expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull());
    expect(lifecycle.unmount).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary user and no-session entries invisible",async()=>{
    current=status("user");render(<AccountSessionPanel/>);await screen.findByText("Synthetic setup account");
    expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull();
    current={...status("developer"),session:null};refresh();await waitFor(()=>expect(screen.queryByText("Synthetic setup account")).toBeNull());
    expect(lifecycle.mount).not.toHaveBeenCalled();
  });
});
