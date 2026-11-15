// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/components/workstation/BrokerageConnectionsCard",()=>({BrokerageConnectionsCard:()=><section aria-label="Synthetic brokerage connection"/>}));
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
  window.casimirDesktop={getRuntimeSnapshot:vi.fn(),localDeveloperAccess:vi.fn(async()=>({phase:"inactive",detail:"No active grant"}))};
  vi.stubGlobal("fetch",vi.fn(async(input)=>new Response(JSON.stringify(String(input).startsWith("/api/account/session")?current:
    {sessions:[],archives:[],jobs:[]}),{status:200,headers:{"Content-Type":"application/json"}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete window.casimirDesktop;localStorage.clear();});
const refresh=()=>fireEvent.click(screen.getAllByRole("button",{name:"Refresh"})[0]);
describe("private developer account hosted slot",()=>{
  it("clears the account after confirmed sign-out even when its follow-up status read fails",async()=>{
    let signedOut=false;
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);
      if(url==="/api/account/session/sign-out") signedOut=true;
      if(url==="/api/account/session" && signedOut) return new Response(null,{status:503});
      return new Response(JSON.stringify(url.startsWith("/api/account/session")?current:
        {sessions:[],archives:[],jobs:[]}),{status:200});
    }));
    render(<AccountSessionPanel/>);await screen.findByText("Synthetic setup account");
    fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
    await screen.findByText("status 503");
    expect(screen.queryByText("Synthetic setup account")).toBeNull();
    expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull();
  });

  it("refreshes sign-out while an old ancillary read is pending and ignores its later result",async()=>{
    let release!: (response: Response)=>void;
    const oldDiscord=new Promise<Response>(resolve=>{release=resolve;});
    let discordReads=0;
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);
      if(url==="/api/account/session/sign-out") current={...status("user"),session:null};
      if(url==="/api/discord/sessions" && ++discordReads===1) return oldDiscord;
      return new Response(JSON.stringify(url.startsWith("/api/account/session")?current:
        {sessions:[],archives:[],jobs:[]}),{status:200});
    });
    vi.stubGlobal("fetch",fetcher);render(<AccountSessionPanel/>);
    await screen.findByText("Synthetic setup account");
    fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
    await waitFor(()=>expect(screen.queryByText("Synthetic setup account")).toBeNull());
    await act(async()=>release(new Response(JSON.stringify({sessions:[]}),{status:200})));
    expect(fetcher.mock.calls.some(([url])=>String(url).includes("profile_id=fixture-profile"))).toBe(false);
    expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull();
  });

  it("does not restore a delayed account observation after sign-out supersedes it",async()=>{
    let release!: (response: Response)=>void;
    const oldAccount=new Promise<Response>(resolve=>{release=resolve;});
    let accountReads=0;
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);
      if(url==="/api/account/session/sign-out") current={...status("user"),session:null};
      if(url==="/api/account/session" && ++accountReads===2) return oldAccount;
      return new Response(JSON.stringify(url.startsWith("/api/account/session")?current:
        {sessions:[],archives:[],jobs:[]}),{status:200});
    }));
    render(<AccountSessionPanel/>);await screen.findByText("Synthetic setup account");
    await screen.findByRole("button",{name:"Refresh"});refresh();
    await waitFor(()=>expect(accountReads).toBe(2));
    fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
    await waitFor(()=>expect(screen.queryByText("Synthetic setup account")).toBeNull());
    await act(async()=>release(new Response(JSON.stringify(status("developer")),{status:200})));
    expect(screen.queryByText("Synthetic setup account")).toBeNull();
    expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull();
  });

  it("exposes the existing native Captain Keyes authorization controls to an ordinary account without unlocking pipelines",async()=>{
    current=status("user");
    window.casimirDesktop={...window.casimirDesktop!,openAuth0AccountLink:vi.fn(async()=>undefined)};
    const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>new Response(JSON.stringify(
      String(input)==="/api/account/discord-tasks"?{ok:true,result:{ready:false,authority:"https://casimirbot.com",domain_profile_ref:null,write_scope:false,expires_at:null}}:
      String(input).startsWith("/api/account/session")?current:{sessions:[],archives:[],jobs:[]}),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetcher);render(<AccountSessionPanel/>);
    await screen.findByRole("region",{name:"Captain Keyes tasks"});
    expect(screen.getByText("Task access is not connected.")).toBeTruthy();
    expect((screen.getByRole("button",{name:"Authorize access"}) as HTMLButtonElement).disabled).toBe(false);
    expect(window.casimirDesktop.openAuth0AccountLink).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.filter(([url])=>String(url)==="/api/account/discord-tasks").every(([,init])=>JSON.parse(String(init?.body)).operation==="status")).toBe(true);
    expect(HELIX_USER_ACCOUNT_POLICY.account_type).toBe("user");
  });
  it("does not present signed-out controls while the account is loading, and publishes the account before unrelated reads finish",async()=>{
    let releaseAccount!: (response: Response)=>void;
    const accountGate=new Promise<Response>((resolve)=>{releaseAccount=resolve;});
    const pendingAncillary=new Promise<Response>(()=>{});
    vi.stubGlobal("fetch",vi.fn((input)=>String(input)==="/api/account/session"
      ? accountGate : pendingAncillary));
    render(<AccountSessionPanel/>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("Synthetic setup account")).toBeNull();
    releaseAccount(new Response(JSON.stringify(status("developer")),{status:200,
      headers:{"Content-Type":"application/json"}}));
    await screen.findByText("Synthetic setup account");
  });
  it("shows private USB recovery before a signed-in profile gains developer policy",async()=>{
    current=status("user");render(<AccountSessionPanel/>);
    await screen.findByText("Synthetic setup account");
    await screen.findByRole("region",{name:"Local developer USB access"});
    current=status("developer");refresh();
    await screen.findByRole("region",{name:"Local developer USB access"});
    current={...status("developer"),session:null};
    refresh();
    await waitFor(()=>expect(screen.queryByRole("region",{name:"Local developer USB access"})).toBeNull());
  });
  it("does not expose private USB recovery when the native bridge is absent",async()=>{
    window.casimirDesktop={getRuntimeSnapshot:vi.fn()};
    current=status("user");render(<AccountSessionPanel/>);
    await screen.findByText("Synthetic setup account");
    expect(screen.queryByRole("region",{name:"Local developer USB access"})).toBeNull();
  });
  it("unmounts previous term view on same-profile session replacement and profile replacement",async()=>{
    render(<AccountSessionPanel/>);await screen.findByRole("region",{name:"Synthetic hosted entry"});
    await waitFor(()=>expect(lifecycle.mount).toHaveBeenCalledTimes(1));
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
  it("honors an explicit hosted-budget feature lock even for a developer session",async()=>{
    render(<AccountSessionPanel/>);await screen.findByRole("region",{name:"Synthetic hosted entry"});
    current={...status("developer"),account_policy:{...HELIX_DEVELOPER_ACCOUNT_POLICY,
      locked_features:[...HELIX_DEVELOPER_ACCOUNT_POLICY.locked_features,"local_hosted_budget"]}};
    refresh();
    await waitFor(()=>expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull());
    expect(lifecycle.unmount).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary user and no-session entries invisible",async()=>{
    current=status("user");render(<AccountSessionPanel/>);await screen.findByText("Synthetic setup account");
    expect(screen.queryByRole("region",{name:"Synthetic hosted entry"})).toBeNull();
    expect(screen.getByRole("region",{name:"Synthetic brokerage connection"})).toBeVisible();
    current={...status("developer"),session:null};refresh();await waitFor(()=>expect(screen.queryByText("Synthetic setup account")).toBeNull());
    expect(screen.queryByRole("region",{name:"Synthetic brokerage connection"})).toBeNull();
    expect(lifecycle.mount).not.toHaveBeenCalled();
  });
  it("keeps profile connection controls available to ordinary signed-in owners",async()=>{
    render(<AccountSessionPanel/>);
    await screen.findByRole("region",{name:"Synthetic brokerage connection"});
    current=status("user");refresh();
    await waitFor(()=>expect(screen.getByRole("region",{name:"Synthetic brokerage connection"})).toBeVisible());
    current={...status("user"),account_policy:{...HELIX_USER_ACCOUNT_POLICY,
      locked_features:[...HELIX_USER_ACCOUNT_POLICY.locked_features,"profile_connections"]}};
    refresh();
    await waitFor(()=>expect(screen.queryByRole("region",{name:"Synthetic brokerage connection"})).toBeNull());
  });
});
