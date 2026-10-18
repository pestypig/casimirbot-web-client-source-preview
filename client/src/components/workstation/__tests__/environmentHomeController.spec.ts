// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {startEnvironmentHomeController} from "../environmentHomeController";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";

let grid:HTMLDivElement,tiles:HTMLButtonElement[],pad:Gamepad,stop:()=>void;
let callbacks:Map<number,FrameRequestCallback>,nextFrame:number;
const frame=()=>{const ready=[...callbacks.values()];callbacks.clear();ready.forEach(fn=>fn(0));};
const press=(...indexes:number[])=>{pad={...pad,buttons:Array.from({length:16},(_,i)=>({pressed:indexes.includes(i),touched:false,value:indexes.includes(i)?1:0}))};};
beforeEach(()=>{
  callbacks=new Map();nextFrame=0;
  vi.spyOn(window,"requestAnimationFrame").mockImplementation(fn=>{callbacks.set(++nextFrame,fn);return nextFrame;});
  vi.spyOn(window,"cancelAnimationFrame").mockImplementation(id=>{callbacks.delete(id);});
  vi.spyOn(document,"hasFocus").mockReturnValue(true);
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  vi.spyOn(HTMLElement.prototype,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  pad={index:0,id:"fixture-pad",mapping:"standard",connected:true,buttons:[],axes:[0,0],timestamp:0} as unknown as Gamepad;
  vi.stubGlobal("navigator",{getGamepads:()=>[pad]});
  grid=document.createElement("div");grid.style.gridTemplateColumns="100px 100px";
  grid.innerHTML='<button data-home-tile-primary>Store</button><button data-home-tile-primary>Account</button><button data-home-tile-primary>Harness</button><button data-home-tile-primary>Package</button><button>Install</button>';
  document.body.append(grid);tiles=Array.from(grid.querySelectorAll<HTMLButtonElement>("[data-home-tile-primary]"));
  tiles[0].focus();stop=startEnvironmentHomeController(grid);
});
afterEach(()=>{stop();document.body.replaceChildren();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("Home controller input",()=>{
  it("requires neutral input, moves focus and activates once per released press",()=>{
    const click=vi.fn();tiles[1].addEventListener("click",click);
    press(15);frame();expect(document.activeElement).toBe(tiles[0]);
    press();frame();press(15);frame();expect(document.activeElement).toBe(tiles[1]);
    frame();expect(document.activeElement).toBe(tiles[1]);
    press();frame();press(0);frame();frame();expect(click).toHaveBeenCalledTimes(1);
    press();frame();press(0);frame();expect(click).toHaveBeenCalledTimes(2);
  });
  it("uses rendered column count and left-stick threshold",()=>{
    frame();pad={...pad,axes:[0,0.8]};frame();expect(document.activeElement).toBe(tiles[2]);
    pad={...pad,axes:[0,0]};frame();pad={...pad,axes:[0,-0.8]};frame();expect(document.activeElement).toBe(tiles[0]);
  });
  it.each(["blur","dialog","device","hidden"])("requires neutral after %s interruption",kind=>{
    const click=vi.fn();tiles[0].addEventListener("click",click);frame();
    let dialog:HTMLElement|undefined;
    if(kind==="blur")window.dispatchEvent(new Event("blur"));
    if(kind==="device")pad={...pad,id:"replacement"};
    if(kind==="dialog"){dialog=document.createElement("div");dialog.setAttribute("role","dialog");document.body.append(dialog);}
    if(kind==="hidden")vi.mocked(document.hasFocus).mockReturnValue(false);
    press(0);frame();dialog?.remove();vi.mocked(document.hasFocus).mockReturnValue(true);frame();
    expect(click).not.toHaveBeenCalled();press();frame();press(0);frame();expect(click).toHaveBeenCalledTimes(1);
  });
  it("ignores non-primary controls and conflicting or unmapped input",()=>{
    const install=grid.querySelector<HTMLButtonElement>("button:not([data-home-tile-primary])")!;
    const clicked=vi.fn();install.addEventListener("click",clicked);frame();install.focus();press(0);frame();expect(clicked).not.toHaveBeenCalled();
    tiles[0].focus();press();frame();press(0,15);frame();press(15);frame();expect(document.activeElement).toBe(tiles[0]);
    press();frame();pad={...pad,mapping:""};press(15);frame();expect(document.activeElement).toBe(tiles[0]);
  });
  it("stops immediately on account events and cancels the scheduled frame",()=>{
    frame();window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    press(15);frame();expect(document.activeElement).toBe(tiles[0]);expect(callbacks.size).toBe(0);
  });
  it("does not act after cleanup",()=>{
    frame();stop();press(15);frame();expect(callbacks.size).toBe(0);expect(document.activeElement).toBe(tiles[0]);
  });
});
