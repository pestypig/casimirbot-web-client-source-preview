// @vitest-environment jsdom
import React from "react";
import { afterEach,describe,it,expect,vi } from "vitest";
import { cleanup,render,screen,fireEvent } from "@testing-library/react";
import { TextEncoder } from "node:util";
import { hydrogenGasSceneFixture } from "@shared/atomic-response/__tests__/explanation-fixture";
import { UnifiedQuantumGlyphAnswer } from "../UnifiedQuantumGlyphAnswer";
import { createPhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
vi.stubGlobal("TextEncoder",TextEncoder);
vi.mock("@/lib/workstation/accountCapabilityPolicy",()=>({readCachedAccountProfileIdentity:()=>({profileId:null})}));
afterEach(()=>{cleanup();localStorage.clear();});
describe("question-first quantum-to-classical gas answer",()=>{
  it("unfolds the actual response and inspects assumptions, tiny numbers and replayed evidence without a configurator",()=>{
    const s=hydrogenGasSceneFixture();render(<UnifiedQuantumGlyphAnswer scenario={s} onWorkbench={()=>{}}/>);
    fireEvent.click(screen.getByRole("button",{name:"Reveal Classical observables"}));expect(screen.getByText(/4\.4030.*e-20/,{selector:"p"})).toBeTruthy();
    fireEvent.click(screen.getByText("Scientific details for this answer"));expect(screen.getByText(`Original question: ${s.question}`)).toBeTruthy();
    fireEvent.click(screen.getByText("All committed inputs, origins, units and uncertainties"));expect(screen.getAllByText(/explicitly-assumed/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Calculation evidence and exported code"));expect(screen.getAllByText(/replayed/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button",{name:"Calculate atomic recipe"})).toBeNull();expect(screen.queryByRole("combobox",{name:"Atomic element identity"})).toBeNull();
  });
  it("retains exact scientific record in profile-scoped save/replay without leaking between users",()=>{
    let profile="gas-alice";const store=createPhysicsGlyphWorkspaceStore({identity:()=>profile,storage:()=>localStorage});store.getState().syncProfile();const s=hydrogenGasSceneFixture();
    expect(store.getState().dispatch({type:"compose_scenario",expectedRevision:store.getState().workspace.scene.revision,scenario:s}).ok).toBe(true);expect(store.getState().save()).toBe(true);
    profile="gas-bob";store.getState().syncProfile();expect(JSON.stringify(store.getState().workspace)).not.toContain(s.scientificRecord!.generationId);
    profile="gas-alice";store.getState().syncProfile();expect(JSON.stringify(store.getState().workspace)).toContain(s.scientificRecord!.calculations[0].receiptHash);
  });
});
