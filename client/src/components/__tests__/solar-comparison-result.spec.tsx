// @vitest-environment jsdom
import React from "react";
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {SolarComparisonResult} from "../SolarComparisonResult";
import {solveSolarComparison} from "../../../../server/services/solar-research/solar-comparison-operator";
import {comparisonInput} from "../../../../server/services/solar-research/__tests__/fixtures/solar-comparison-fixture";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows dated measured TSI separately from archival rates and missing live neutrinos",async()=>{
  const result=solveSolarComparison(comparisonInput(),7,"2026-10-28T14:00:00Z",null,"partial");
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({schema:"casimir.solar_comparison_view.v1",observedAt:"2026-10-28T14:00:00Z",
    result,state:"current",lastCheckedAt:"2026-10-28T14:00:00Z",error:null,answerAuthority:false,executionEnabled:false,fundingAuthority:false})));
  vi.stubGlobal("fetch",fetcher);render(<SolarComparisonResult/>);
  await waitFor(()=>expect(screen.getByText(/1362.3078 ± 0.3406/)).toBeTruthy());
  expect(screen.getByText(/No live solar-fusion neutrino measurement/)).toBeTruthy();
  expect(screen.getByText(/current irradiance is not paired/)).toBeTruthy();
  expect(screen.getByText(/coverage: partial/)).toBeTruthy();
  expect(screen.getByRole("link",{name:"Exact result and source hashes"}).getAttribute("href")).toContain(result.id);
});
it("distinguishes a failed initial source acquisition from a loading state",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({schema:"casimir.solar_comparison_view.v1",observedAt:"2026-10-28T14:00:00Z",
    result:null,state:"refresh_failed",lastCheckedAt:null,error:"source_unavailable",answerAuthority:false,executionEnabled:false,fundingAuthority:false}))));
  render(<SolarComparisonResult/>);await waitFor(()=>expect(screen.getByText(/source refresh failed/)).toBeTruthy());
});
