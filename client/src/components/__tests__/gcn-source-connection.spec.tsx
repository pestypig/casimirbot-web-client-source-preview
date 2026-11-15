// @vitest-environment jsdom
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {GcnSourceConnection} from "../GcnSourceConnection";
import {gcnSourceStatus} from "../../../../server/services/neutrino-research/gcn-source-connection";
import {HELIX_USER_ACCOUNT_POLICY} from "../../../../shared/helix-account-session";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,cacheAccountCapabilityPolicy} from "../../lib/workstation/accountCapabilityPolicy";
beforeEach(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,"user-a"));
afterEach(()=>{cleanup();cacheAccountCapabilityPolicy(null,null);vi.unstubAllGlobals();});
it("saves only the selected owner's credentials, clears inputs and labels both activation and managed access honestly",async()=>{
  const status=gcnSourceStatus("user-a",false,true),fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>new Response(JSON.stringify(options?.method==="PUT"?{...status,credential_saved:true,mode:"own_gcn",state:"saved_inactive"}:status)));
  vi.stubGlobal("fetch",fetcher);render(<GcnSourceConnection/>);
  const id=await screen.findByLabelText("GCN client ID"),secret=screen.getByLabelText("GCN client secret");
  fireEvent.change(id,{target:{value:"fixture-client-id"}});fireEvent.change(secret,{target:{value:"fixture-not-a-real-secret"}});
  fireEvent.click(screen.getByRole("button",{name:"Save personal credentials"}));
  await screen.findByText(/Credentials saved encrypted for your account/);
  const put=fetcher.mock.calls.find(c=>c[1]?.method==="PUT")!;
  expect(JSON.parse(put[1]!.body as string)).toEqual({mode:"own_gcn",expected_profile_id:"user-a",credentials:{client_id:"fixture-client-id",client_secret:"fixture-not-a-real-secret"}});
  expect((id as HTMLInputElement).value).toBe("");expect((secret as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("button",{name:/Use CasimirBot-managed access/}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText("fixture-not-a-real-secret")).toBeNull();
});
it("clears entered credentials and rejects stale responses when the account changes",async()=>{
  const status=gcnSourceStatus("user-a",false,true);let resolve:(r:Response)=>void=()=>{};let writes=0;
  vi.stubGlobal("fetch",vi.fn(async(_url:unknown,options?:RequestInit)=>options?.method==="PUT"?(writes++,await new Promise<Response>(r=>{resolve=r;})):new Response(JSON.stringify(status))));
  render(<GcnSourceConnection/>);const id=await screen.findByLabelText("GCN client ID");
  fireEvent.change(id,{target:{value:"fixture-client-id"}});fireEvent.change(screen.getByLabelText("GCN client secret"),{target:{value:"fixture-not-a-real-secret"}});
  fireEvent.click(screen.getByRole("button",{name:"Save personal credentials"}));await waitFor(()=>expect(writes).toBe(1));
  fireEvent(window,new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
  resolve(new Response(JSON.stringify({...status,credential_saved:true,mode:"own_gcn",state:"saved_inactive"})));
  await waitFor(()=>expect(screen.queryByText(/Credentials saved encrypted for your account/)).toBeNull());
  expect((await screen.findByLabelText("GCN client secret") as HTMLInputElement).value).toBe("");
});
