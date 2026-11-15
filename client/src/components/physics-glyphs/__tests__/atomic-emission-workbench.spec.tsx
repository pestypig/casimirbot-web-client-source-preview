// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextEncoder } from "node:util";
import { AtomicEmissionWorkbench } from "../AtomicEmissionWorkbench";
vi.stubGlobal("TextEncoder",TextEncoder);
afterEach(()=>{cleanup();localStorage.clear();});
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
function open(profile="test-atomic-alice") {render(<AtomicEmissionWorkbench key={profile} profileKey={profile}/>);fireEvent.click(screen.getByText("Super Model · atomic emission tool"));}
function editRecipe(fn:(r:any)=>void) {const field=screen.getByLabelText("Atomic calculation recipe JSON") as HTMLTextAreaElement;const r=JSON.parse(field.value);fn(r);fireEvent.change(field,{target:{value:JSON.stringify(r)}});}
describe("real atomic recipe UI binding",()=>{
  it("calculates, renders the existing glyph path, and invalidates evidence immediately on edit",()=>{
    open();click("Calculate atomic recipe");expect(screen.getByRole("region",{name:"Atomic calculation evidence"})).toBeTruthy();
    click("Reveal Transition");expect(screen.getByRole("region",{name:"Quantum glyph answer"})).toBeTruthy();
    editRecipe(r=>r.detector.efficiency=0);expect(screen.queryByRole("region",{name:"Atomic calculation evidence"})).toBeNull();click("Calculate atomic recipe");
    expect(screen.getByText("clickProbability").nextSibling?.textContent).toBe("0.0000000 1");
  });
  it("recomputes saved documents, rejects forged results, and isolates profile keys",()=>{
    open();click("Calculate atomic recipe");fireEvent.click(screen.getByText("Editable code cell and reproducible document"));click("Fill export code cell");click("Save atomic recipe");click("Show atomic document");
    const doc=JSON.parse((screen.getByLabelText("Atomic document JSON") as HTMLTextAreaElement).value);expect(doc.result.status).toBe("calculated");expect(doc.code).toContain("NOT EXECUTED");
    editRecipe(r=>r.detector.efficiency=0);click("Replay saved atomic recipe");expect(screen.getByText(/saved evidence independently recomputed/i)).toBeTruthy();
    doc.result.values.clickProbability.value=1;fireEvent.change(screen.getByLabelText("Atomic document JSON"),{target:{value:JSON.stringify(doc)}});click("Load atomic document");expect(screen.getByRole("alert").textContent).toMatch(/altered/);
    cleanup();open("test-atomic-bob");fireEvent.click(screen.getByText("Editable code cell and reproducible document"));click("Replay saved atomic recipe");expect(screen.getByRole("alert").textContent).toMatch(/No saved/);expect(screen.queryByRole("region",{name:"Atomic calculation evidence"})).toBeNull();
  });
  it("keeps code unexecuted and handles malformed recipes, source-only and unsupported providers",()=>{
    open();fireEvent.click(screen.getByText("Editable code cell and reproducible document"));const sentinel=vi.fn();vi.stubGlobal("atomicExploit",sentinel);
    fireEvent.change(screen.getByLabelText("Atomic export code cell"),{target:{value:"globalThis.atomicExploit();fetch('/secrets')"}});click("Calculate atomic recipe");expect(sentinel).not.toHaveBeenCalled();
    click("He I source data");click("Calculate atomic recipe");expect(screen.getByText(/database-derived ·/)).toBeTruthy();expect(screen.queryByText("clickProbability")).toBeNull();
    click("Neutral Fe capability gap");click("Calculate atomic recipe");expect(screen.getByText(/unsupported ·/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Atomic calculation recipe JSON"),{target:{value:"{"}});click("Calculate atomic recipe");expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByRole("region",{name:"Atomic calculation evidence"})).toBeNull();
  });
});
