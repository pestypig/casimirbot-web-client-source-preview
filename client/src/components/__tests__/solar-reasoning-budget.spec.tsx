// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {SolarReasoningBudget} from "../SolarReasoningBudget";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("does not authorize a dollar of spend until limits and explicit consent are supplied",async()=>{
  const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>Response.json(init?.method==="POST"?{ok:true,id:"budget"}:{enabled:true,provider_available:false,budgets:[],results:[]}));
  vi.stubGlobal("fetch",fetcher);render(<SolarReasoningBudget/>);
  const button=await screen.findByRole("button",{name:"Authorize platform budget"});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Maximum platform cost (USD)"),{target:{value:"0.25"}});
  fireEvent.change(screen.getByLabelText("Maximum explanations"),{target:{value:"5"}});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(button);
  await waitFor(()=>expect(fetcher.mock.calls.filter(([,i])=>i?.method==="POST")).toHaveLength(1));
  const body=JSON.parse(fetcher.mock.calls.find(([,i])=>i?.method==="POST")![1]!.body as string);
  expect(body).toMatchObject({executor:"developer_harness",maximum_micros:250000,maximum_calls:5,consent:"platform_funded_explanations_only"});
  expect(JSON.stringify(body)).not.toMatch(/term_id|subscription_id|api_key/);
});
it("shows ordinary viewers the free channel opt-in without exposing operator budgets",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:"solar_operator_required"},{status:403})));
  render(<SolarReasoningBudget/>);
  await screen.findByText("Budget controls are available to the configured platform owner.");
  expect(screen.queryByRole("button",{name:"Authorize platform budget"})).toBeNull();
  expect(screen.getByText(/subscriber allowance/)).toBeTruthy();
});
