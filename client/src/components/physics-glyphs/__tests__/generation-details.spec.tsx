// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextEncoder } from "node:util";
import { UnifiedQuantumGlyphAnswer } from "../UnifiedQuantumGlyphAnswer";
import { atomicGenerationFixture, lightGenerationFixture, sealGeneration } from "@shared/physics-glyphs/__tests__/generation-record-fixtures";
import { createPhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
vi.stubGlobal("TextEncoder",TextEncoder);
vi.mock("@/lib/workstation/accountCapabilityPolicy",()=>({readCachedAccountProfileIdentity:()=>({profileId:null}),HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT:"test-profile",fetchAccountCapabilityPolicy:()=>Promise.resolve({})}));
afterEach(()=>{cleanup();localStorage.clear();});
describe("actual question generation details",()=>{
  it("inspects the exact answer's record, scientific choices and real calculation evidence",()=>{
    const scenario=atomicGenerationFixture();render(<UnifiedQuantumGlyphAnswer scenario={scenario} onWorkbench={()=>{}}/>);
    fireEvent.click(screen.getByText("Scientific details for this answer"));expect(screen.getByText(`Original question: ${scenario.question}`)).toBeTruthy();expect(screen.getByText(/fixture-h1-specific-question/)).toBeTruthy();
    expect(screen.getByRole("region",{name:"Applicable scientific criteria"})).toBeTruthy();
    fireEvent.click(screen.getByText("Actual models, laws, sources and glyph-to-question mapping"));expect(screen.getByText(/physics.atomic.procedural_e1_operator/)).toBeTruthy();
    fireEvent.click(screen.getByText("Calculation evidence and exported code"));expect(screen.getByText(/Admitted versioned operator replay checked/)).toBeTruthy();
    expect(screen.queryByRole("combobox",{name:"Atomic element identity"})).toBeNull();expect(screen.queryByRole("button",{name:"Calculate atomic recipe"})).toBeNull();
  });
  it("shows no calculation for a qualitative generation, and never executes code/export text",()=>{
    const scenario=lightGenerationFixture();scenario.scientificRecord!.calculations.push({id:"unexecuted-export",operator:"owner-proposed-recipe",version:"draft",execution:"not-executed",inputJSON:null,outputJSON:null,receiptHash:null,sourceIds:[],code:"globalThis.generationExploit(); fetch('/private')",checks:[],limits:["No admitted executor; text only"]});
    const spy=vi.fn();vi.stubGlobal("generationExploit",spy);render(<UnifiedQuantumGlyphAnswer scenario={sealGeneration(scenario)} onWorkbench={()=>{}}/>);fireEvent.click(screen.getByText("Scientific details for this answer"));fireEvent.click(screen.getByText("Calculation evidence and exported code"));expect(screen.getByText("Export text only; not executed.")).toBeTruthy();expect(spy).not.toHaveBeenCalled();
  });
  it("preserves a generation in profile-scoped save/replay and never loads another profile's record",()=>{
    let profile="generation-alice";const store=createPhysicsGlyphWorkspaceStore({identity:()=>profile,storage:()=>localStorage});store.getState().syncProfile();
    const s=atomicGenerationFixture();expect(store.getState().dispatch({type:"compose_scenario",expectedRevision:store.getState().workspace.scene.revision,scenario:s}).ok).toBe(true);expect(store.getState().save()).toBe(true);
    profile="generation-bob";store.getState().syncProfile();expect(JSON.stringify(store.getState().workspace)).not.toContain("fixture-h1-specific-question");
    profile="generation-alice";store.getState().syncProfile();expect(JSON.stringify(store.getState().workspace)).toContain(s.scientificRecord!.sceneHash);
  });
});
