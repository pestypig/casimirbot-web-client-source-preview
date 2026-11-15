// @vitest-environment jsdom
import React from "react";
import { afterEach,beforeEach,describe,it,expect,vi } from "vitest";
import { act,cleanup,fireEvent,render,screen } from "@testing-library/react";
import { TextEncoder,TextDecoder } from "node:util";
import { PhysicsGlyphSandbox } from "../PhysicsGlyphSandbox";
import { createPhysicsGlyphWorkspaceStore, usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { createPhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { atomicGenerationFixture } from "@shared/physics-glyphs/__tests__/generation-record-fixtures";
import { defaultAtomicRequest } from "@shared/atomic-emission/contracts";
const identity=vi.hoisted(()=>({value:"bridge-alice"}));
vi.mock("@/lib/workstation/accountCapabilityPolicy",()=>({readCachedAccountProfileIdentity:()=>({profileId:identity.value})}));
beforeEach(()=>{vi.stubGlobal("TextEncoder",TextEncoder);vi.stubGlobal("TextDecoder",TextDecoder);localStorage.clear();identity.value="bridge-alice";usePhysicsGlyphWorkspaceStore.setState({workspace:createPhysicsGlyphWorkspace("bridge-test"),profileKey:null});usePhysicsGlyphWorkspaceStore.getState().syncProfile();usePhysicsGlyphWorkspaceStore.getState().dispatch({type:"compose_scenario",expectedRevision:0,scenario:atomicGenerationFixture()});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
describe("parent-scoped opt-in calculation bridge",()=>{
  it("ignores foreign frames and does not execute before opt-in",async()=>{
    const view=render(<PhysicsGlyphSandbox/>);fireEvent.click(screen.getByText("Generated display sandbox"));
    const iframe=view.container.querySelector("iframe")!;expect(iframe).toBeTruthy();
    const generation=iframe.srcdoc.match(/const generation=("[^"]+")/)![1];
    const w=usePhysicsGlyphWorkspaceStore.getState().workspace,request=defaultAtomicRequest();request.specificsOrigin="user";
    const data={type:"helix.physics-glyph.calculate.v1",generation:JSON.parse(generation),requestId:"first",sceneId:w.scene.id,sceneRevision:w.scene.revision,request:{operatorId:"super-model.coulomb-e1/1.0.0",operatorVersion:"1.0.0",request}};
    const post=vi.spyOn(iframe.contentWindow!,"postMessage");
    await act(async()=>{window.dispatchEvent(new MessageEvent("message",{source:window,data}));});expect(post.mock.calls.some(([data])=>(data as any).type==="helix.physics-glyph.calculation-result.v1")).toBe(false);
    await act(async()=>{window.dispatchEvent(new MessageEvent("message",{source:iframe.contentWindow,data}));});expect(post).toHaveBeenCalledWith(expect.objectContaining({result:{status:"disabled"}}),"*");
    expect(screen.getByLabelText("Enable calculations for this preview")).not.toBeChecked();
  });
  it("revokes permission on display rerun and profile replacement",()=>{
    render(<PhysicsGlyphSandbox/>);fireEvent.click(screen.getByText("Generated display sandbox"));
    fireEvent.click(screen.getByLabelText("Enable calculations for this preview"));expect(screen.getByLabelText("Enable calculations for this preview")).toBeChecked();
    fireEvent.click(screen.getByText("Run display"));expect(screen.getByLabelText("Enable calculations for this preview")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Enable calculations for this preview"));act(()=>{identity.value="bridge-bob";usePhysicsGlyphWorkspaceStore.getState().syncProfile();});expect(screen.getByLabelText("Enable calculations for this preview")).not.toBeChecked();
  });
});

function changedRequest() {
  const request = defaultAtomicRequest();
  request.detector.efficiency = 0.123;
  return { operatorId: "super-model.coulomb-e1/1.0.0", operatorVersion: "1.0.0", request };
}
it("does not commit a queued calculation after cached identity changes before store synchronization", async () => {
  render(<PhysicsGlyphSandbox />);
  vi.useFakeTimers();
  fireEvent.click(screen.getByLabelText("Enable calculations for this preview"));
  const commit = vi.spyOn(usePhysicsGlyphWorkspaceStore.getState(), "acceptCalculation");
  fireEvent.change(screen.getByLabelText("Bounded calculation request JSON"), { target: { value: JSON.stringify(changedRequest()) } });
  identity.value = "bridge-bob";
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(commit).not.toHaveBeenCalled();
});

it("does not retire the next profile scene when a stale control synchronizes the store", () => {
  const other = createPhysicsGlyphWorkspaceStore({ identity: () => "bridge-bob", storage: () => localStorage });
  other.getState().syncProfile();
  expect(other.getState().dispatch({ type: "compose_scenario", expectedRevision: 0, scenario: atomicGenerationFixture() }).ok).toBe(true);
  expect(other.getState().save()).toBe(true);
  render(<PhysicsGlyphSandbox />);
  fireEvent.click(screen.getByLabelText("Enable calculations for this preview"));
  const begin = vi.spyOn(usePhysicsGlyphWorkspaceStore.getState(), "beginCalculation");
  identity.value = "bridge-bob";
  fireEvent.change(screen.getByLabelText("Bounded calculation request JSON"), { target: { value: JSON.stringify(changedRequest()) } });
  expect(begin).not.toHaveBeenCalled();
  const current = usePhysicsGlyphWorkspaceStore.getState();
  expect(current.profileKey).toContain("bridge-bob");
  expect(current.workspace.interpretationStatus).toBeUndefined();
  expect(current.workspace.result).not.toBeNull();
});
