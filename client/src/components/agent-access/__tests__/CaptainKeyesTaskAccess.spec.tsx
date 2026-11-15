// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptainKeyesTaskAccess } from "../CaptainKeyesTaskAccess";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { taskIntent, taskOwner } from "../../../../../server/services/discord/__tests__/discord-agent-task-fixture";
import { taskConfigurationFixture } from "@shared/__tests__/discord-task-configuration-fixture";

const id = "00000000-0000-4000-8000-000000000001";
const task = { schema:"casimir.discord_agent_task.v1", id, intent:taskIntent(), review_revision:"a".repeat(64),
  status:"review_required", version:1, created_at:"2026-10-23T16:00:00.000Z", updated_at:"2026-10-23T16:00:00.000Z",
  expires_at:"2026-10-23T20:00:00.000Z", reviewed_at:null, approved_revision:null, stopped_at:null,
  underlying_authority_granted:false, execution_enabled:false, verified_by_effect:false, voice_effect:null, provider_calls_started:0 };
const status = { ready:true, authority:"https://casimirbot.com", domain_profile_ref:taskOwner, write_scope:true, expires_at:new Date(Date.now()+600_000).toISOString() };
const response = (result:unknown, code=200) => new Response(JSON.stringify({ok:code===200,result}), { status:code, headers:{"Content-Type":"application/json"} });
beforeEach(() => { window.casimirDesktop = { getRuntimeSnapshot:vi.fn(async()=>undefined), openAuth0AccountLink:vi.fn(async()=>undefined), onAuth0AccountLinkCompletion:()=>()=>undefined }; });
afterEach(() => { cleanup(); delete window.casimirDesktop; vi.unstubAllGlobals(); vi.useRealTimers(); });
const inspect = async () => {
  await screen.findByText(/Connected/);
  fireEvent.change(screen.getByLabelText("Captain Keyes task ID"), {target:{value:id}});
  fireEvent.click(screen.getByRole("button",{name:"Inspect task"}));
  await screen.findByText(task.intent.declared_task_summary);
};
describe("Captain Keyes native owner controls", () => {
  it("shows the exact single IceCube alert contract without authorizing or publishing it", async () => {
    const action = { action_id: "action:icecube", kind: "neutrino_publish" as const,
      destination: { kind: "existing" as const, channel_id: task.intent.origin_channel_id },
      source_ref: "source:icecube" as const, native_event_id: "138650_22312058",
      revision_sha256: "b".repeat(64), artifact_id: "c".repeat(64), max_posts: 1 as const, reasoning: "none" as const };
    const alertTask = { ...task, intent: { ...task.intent, discord_session_ref: "discord-session:owner",
      declared_task_summary: "Publish one reviewed IceCube alert",
      sources: [{ access: "public" as const, kind: "icecube_alert" as const, source_ref: action.source_ref }],
      actions: [action] } };
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) =>
      response(JSON.parse(String(init?.body)).operation === "status" ? status : { task: alertTask }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CaptainKeyesTaskAccess/>);
    await screen.findByText(/Connected/);
    fireEvent.change(screen.getByLabelText("Captain Keyes task ID"), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect task" }));
    await screen.findByText(alertTask.intent.declared_task_summary);
    expect(screen.getByText(`Publish at most 1 IceCube alert (${action.native_event_id}) to channel ${action.destination.channel_id}, using ${action.source_ref}. Revision: ${action.revision_sha256}. Artifact: ${action.artifact_id}. No reasoning.`)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).operation)).toEqual(["status", "inspect"]);
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
  });

  it.each(["account invalidation", "unmount"])("does not open late authorization after %s", async boundary => {
    let release!: (result:Response)=>void;
    const pending=new Promise<Response>(resolve=>{release=resolve;});
    vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init?:RequestInit)=>
      JSON.parse(String(init?.body)).operation==="status"?response(status):pending));
    const {unmount}=render(<CaptainKeyesTaskAccess/>);await screen.findByText(/Connected/);
    fireEvent.click(screen.getByRole("button",{name:"Authorize access"}));
    if(boundary==="unmount") unmount();
    else act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    await act(async()=>release(response({schema:"casimir_desktop_auth0_account_link_start/1",ok:true,
      authorization_url:"https://fixture.invalid/authorize",expires_at:new Date(Date.now()+60_000).toISOString(),
      provider:"auth0",pkce:"S256",client_secret_used:false,bearer_included:false,subject_included:false})));
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
  });

  it("shows the exact existing-feed redirect and persistent lifetime without approving or operating it", async () => {
    const redirected = { ...task, intent: { ...task.intent, discord_session_ref: "discord-session:fixture", actions: [{
      action_id: "action:redirect", kind: "solar_redirect", source_ref: "source:hek", destination: { kind: "existing", channel_id: "123456789012345694" },
      expected: { channel_id: "123456789012345692", mode: "both", revision_sha256: "b".repeat(64) },
      history_policy: "preserve_mode_cursor_and_history", configuration_lifetime: "until_changed_or_disabled" }] } };
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => response(JSON.parse(String(init?.body)).operation === "status" ? status : { task: redirected }));
    vi.stubGlobal("fetch", fetchMock); render(<CaptainKeyesTaskAccess/>); await inspect();
    expect(screen.getByText(/Redirect the existing both HEK feed from channel 123456789012345692 to channel 123456789012345694/)).toBeInTheDocument();
    expect(screen.getByText(/preserve mode, event cursor and delivery history/)).toHaveTextContent("b".repeat(64));
    expect(screen.getByText(/Stop or task expiry does not undo a completed redirect/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).operation)).toEqual(["status", "inspect"]);
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
  });
  it.each([true,false])("shows the exact channel-update permission policy (specified=%s) without operating Discord",async specified=>{
    const updated={...task,intent:{...task.intent,actions:[{action_id:"action:update",kind:"channel_update",channel_id:task.intent.origin_channel_id,
      name:"solar-science",...(specified?{permission_policy:"preserve_existing"}:{})}]}};
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>response(JSON.parse(String(init?.body)).operation==="status"?status:{task:updated}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await inspect();
    expect(screen.getByText(specified?/retain existing channel permissions/:/permission policy unspecified; a new proposal and review are required/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(call=>JSON.parse(String(call[1]?.body)).operation)).toEqual(["status","inspect"]);
  });
  it.each([true,false])("shows independent reasoning-host selection (selected=%s) without starting reasoning", async selected => {
    const analysis = { ...task, intent: { ...task.intent, reasoning: { mode:"own_key",provider_ref:"provider:selected",
      connection_ref:"connection:owner",operations:["text_explanation"],max_provider_cost_micros:100000,max_explanations:5,
      ...(selected?{executor:{kind:"personal_harness",installation_ref:"installation:solar-owner"}}:{}) },
      actions:[{action_id:"action:analysis",kind:"analysis_post",source_refs:["source:hek"],
        destination:{kind:"existing",channel_id:task.intent.origin_channel_id},max_posts:5}] } };
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>response(JSON.parse(String(init?.body)).operation==="status"?status:{task:analysis}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await inspect();
    expect(screen.getByText(/Discord executor: CasimirBot service/)).toBeInTheDocument();
    expect(screen.getByText(selected?/Reasoning executor: personal harness · installation:solar-owner/:/Reasoning executor: Unspecified; a new proposal and review are required/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(call=>JSON.parse(String(call[1]?.body)).operation)).toEqual(["status","inspect"]);
  });
  it("reads saved setup explicitly through the native task connection and clears it on account invalidation", async () => {
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>response(JSON.parse(String(init?.body)).operation==="status"
      ? {...status,write_scope:false}:{configuration:taskConfigurationFixture(taskOwner)}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await screen.findByText(/Connected/);
    expect(fetchMock).toHaveBeenCalledOnce();expect(screen.queryByText(/Remembered for task proposals/)).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Load saved Discord setup"}));
    expect(await screen.findByText(/Remembered for task proposals/)).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({operation:"configuration"});
    expect(screen.getByRole("link",{name:"Manage remembered links"})).toHaveAttribute("href","https://casimirbot.com/discord/account-links");
    act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    expect(screen.queryByText(/Remembered for task proposals/)).toBeNull();
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
  });
  it("ignores a delayed configuration read after the local account changes", async () => {
    let release!:(r:Response)=>void;
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>JSON.parse(String(init?.body)).operation==="status"?response(status)
      :new Promise<Response>(resolve=>{release=resolve;}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await screen.findByText(/Connected/);
    fireEvent.click(screen.getByRole("button",{name:"Load saved Discord setup"}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
    act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    await act(async()=>release(response({configuration:taskConfigurationFixture(taskOwner)})));
    expect(screen.queryByText(/Remembered for task proposals/)).toBeNull();
  });
  it("shows the same reviewed alert cap for a subscription without authorizing or activating it", async () => {
    const subscribed = { ...task, intent: { ...task.intent, actions: [{ action_id: "action:subscribe", kind: "solar_subscribe",
      source_ref: "source:hek", destination: { kind: "existing", channel_id: "123456789012345698" }, event_types: ["fl"],
      max_posts: 5, initial_delivery: "new_since_activation" }] } };
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => response(JSON.parse(String(init?.body)).operation === "status" ? status : { task: subscribed }));
    vi.stubGlobal("fetch", fetchMock); render(<CaptainKeyesTaskAccess/>); await inspect();
    expect(await screen.findByText(/at most 5 alerts before expiry/)).toBeInTheDocument();
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).operation)).toEqual(["status", "inspect"]);
  });
  it("hides an unfinished disabled capability without imposing an account-type lock", async () => {
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({ok:false,error:"discord_task_connection_not_configured"}),
      {status:409,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("region",{name:"Captain Keyes tasks"})).toBeNull();
  });
  it("retires an expired native connection without starting another authorization", async () => {
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(Date.parse(status.expires_at)+1);
    vi.stubGlobal("fetch",vi.fn(async()=>response(status)));render(<CaptainKeyesTaskAccess/>);
    await screen.findByText(/Task access has expired/);
    expect(screen.getByRole("button",{name:"Inspect task"})).toBeDisabled();
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
  });
  it("starts no authorization or mutation on mount and preserves read-only Stop restrictions", async () => {
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>response(JSON.parse(String(init?.body)).operation==="status"?{...status,write_scope:false}:{task}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await inspect();
    expect(screen.getByRole("button",{name:"Stop this task"})).toBeDisabled();
    expect(window.casimirDesktop!.openAuth0AccountLink).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(call=>JSON.parse(String(call[1]?.body)).operation)).toEqual(["status","inspect"]);
  });
  it("requests fresh explicit access only after the owner clicks Authorize", async () => {
    const receipt={schema:"casimir_desktop_auth0_account_link_start/1",ok:true,authorization_url:"https://fixture.invalid/authorize",
      expires_at:"2026-10-23T20:00:00.000Z",provider:"auth0",pkce:"S256",client_secret_used:false,bearer_included:false,subject_included:false};
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>response(JSON.parse(String(init?.body)).operation==="status"?status:receipt));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await screen.findByText(/Connected/);
    fireEvent.click(screen.getByRole("button",{name:"Authorize access"}));
    await waitFor(()=>expect(window.casimirDesktop!.openAuth0AccountLink).toHaveBeenCalledWith(receipt.authorization_url));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({operation:"authorize",access:"read"});
  });
  it("requires inspection after an unknown Stop and never automatically retries it", async () => {
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
      const operation=JSON.parse(String(init?.body)).operation;
      return operation==="status"?response(status):operation==="inspect"?response({task})
        :new Response(JSON.stringify({ok:false,outcome_unknown:true}),{status:409,headers:{"Content-Type":"application/json"}});
    });
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await inspect();
    fireEvent.click(screen.getByRole("button",{name:"Stop this task"}));
    await screen.findByText(/Stop result is unknown/);expect(screen.getByRole("button",{name:"Stop this task"})).toBeDisabled();
    expect(fetchMock.mock.calls.filter(call=>JSON.parse(String(call[1]?.body)).operation==="stop")).toHaveLength(1);
  });
  it("drops a late old-account task result when account authority is invalidated", async () => {
    let release!:(response:Response)=>void;
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>JSON.parse(String(init?.body)).operation==="status"?response(status)
      :new Promise<Response>(resolve=>{release=resolve;}));
    vi.stubGlobal("fetch",fetchMock);render(<CaptainKeyesTaskAccess/>);await screen.findByText(/Connected/);
    fireEvent.change(screen.getByLabelText("Captain Keyes task ID"),{target:{value:id}});fireEvent.click(screen.getByRole("button",{name:"Inspect task"}));
    await waitFor(()=>expect(release).toBeTypeOf("function"));
    act(()=>window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    await act(async()=>release(response({task})));
    expect(screen.queryByText(task.intent.declared_task_summary)).toBeNull();
  });
});
