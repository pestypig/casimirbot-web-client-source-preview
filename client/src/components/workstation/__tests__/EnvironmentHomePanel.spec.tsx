// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentHomePanel from "../EnvironmentHomePanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
const mocks = vi.hoisted(() => ({ openPanel: vi.fn() }));
vi.mock("@/store/useWorkstationLayoutStore", () => ({useWorkstationLayoutStore:(selector:any)=>selector({openPanelInActiveGroup:mocks.openPanel})}));
const row = () => ({package_version_id:"connector_package_version:com.casimirbot.system.clock:1.0.0",package_id:"com.casimirbot.system.clock",
  package_version:"1.0.0",publisher_id:"publisher:casimirbot",content_hash:`sha256:${"a".repeat(64)}`,lifecycle_status:"active",
  installation_artifact:{version:"1.0.0-private.1",archive_sha256:"b".repeat(64),review_revision:"review:private"},
  install_available:true,runtime_available:false,provider_required:false,subscription_required:false,
  host_compatibility:["node:20+","windows"],trust:{package_provenance:"first_party",security_review:"private_review"}});
const directory = () => ({schema:"helix.environment_connector.private_directory.v1",policy_revision:"private:3",
  policy_expires_at:new Date(Date.now()+60000).toISOString(),packages:[row()],public_release:false});
const state = () => ({schema:"casimirbot.private_environment_state.v1",packageId:"com.casimirbot.system.clock",version:"1.0.0-private.1",
  artifactSha256:"b".repeat(64),status:"not_installed",installAvailable:true,runtimeAvailable:false,connected:false,granted:false});
let readState: ReturnType<typeof vi.fn>, install: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Element.prototype.scrollIntoView=vi.fn();
  mocks.openPanel.mockReset(); readState=vi.fn(async()=>state()); install=vi.fn(async()=>({...state(),status:"installed_stopped",installationRef:"install:private"}));
  window.casimirDesktop={getRuntimeSnapshot:vi.fn(),getPrivateEnvironmentState:readState,installPrivateEnvironmentPackage:install};
  fetcher=vi.fn(async()=>({ok:true,json:async()=>directory()})); vi.stubGlobal("fetch",fetcher);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();delete window.casimirDesktop;});

describe("private Environment Home",()=>{
  it("orients an unsigned user without implying managed model access",async()=>{
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    render(<EnvironmentHomePanel/>);
    expect(screen.getByRole("region",{name:"Choose how to start"})).toBeInTheDocument();
    expect(screen.getByText("Free personal tools")).toBeInTheDocument();
    expect(screen.getByText("Use my AI connection")).toBeInTheDocument();
    expect(screen.getByText("Hosted rooms")).toBeInTheDocument();
    expect(screen.getByText("CasimirBot-managed AI")).toBeInTheDocument();
    expect(screen.getByText(/hosted-room pilot uses a separate subscription and can work without model calls/)).toBeInTheDocument();
    expect(screen.getByText(/no-key option is planned for eligible subscriptions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Set up AI connection"}));
    expect(mocks.openPanel).toHaveBeenCalledWith("agent-access");
  });
  it("takes a native user to the installed account-link control without offering a managed key",async()=>{
    const openPublisherAccount=vi.fn(async()=>({opened:true}));
    window.casimirDesktop={...window.casimirDesktop!,openPublisherAccount};
    render(<EnvironmentHomePanel/>);
    fireEvent.click(screen.getByRole("button",{name:"Connect website account"}));
    expect(mocks.openPanel).toHaveBeenCalledWith("account-session");
    expect(openPublisherAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:/Use CasimirBot-managed AI/})).toBeNull();
  });
  it("keeps the installed account path available on an older native build",async()=>{
    render(<EnvironmentHomePanel/>);
    const connect = screen.getByRole("button",{name:"Connect website account"});
    expect(connect).not.toBeDisabled();
    fireEvent.click(connect);
    expect(mocks.openPanel).toHaveBeenCalledWith("account-session");
  });
  it("opens the default workspace panels without catalog or sign-in authority",async()=>{
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    render(<EnvironmentHomePanel/>);
    await screen.findByText(/private catalog is unavailable/);
    const panels = [
      ["Agent Access", "agent-access"],
      ["Connections, Billing & Security", "connections-billing-security"],
      ["Star Watcher", "star-watcher"],
      ["Civilization Bounds Roadmap", "civilization-bounds-roadmap"],
    ] as const;
    for (const [label,id] of panels) {
      fireEvent.click(screen.getByRole("button",{name:new RegExp(`^${label}`)}));
      expect(mocks.openPanel).toHaveBeenLastCalledWith(id);
    }
    expect(install).not.toHaveBeenCalled();
  });
  it("opens a read-only Minecraft setup tile without calling the launch route",async()=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    const selection=vi.fn(async()=>({ok:false,status:409,json:async()=>({error:"minecraft_saved_loopback_selection_required"})}));
    vi.stubGlobal("fetch",selection);
    const tile=screen.getByRole("button",{name:/Minecraft Adapter Inspect saved local setup/});
    fireEvent.click(tile);
    await screen.findByText("No saved loopback address");
    expect(selection).toHaveBeenCalledTimes(1);
    expect(selection.mock.calls[0][0]).toContain("/selection");
    expect(screen.queryByRole("button",{name:/Start prepared session|Launch Minecraft/})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Close Minecraft Adapter setup"}));
    expect(document.activeElement).toBe(tile);
  });
  it("routes Minecraft's Configure connection menu to existing Agent Access",async()=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    const trigger=screen.getByRole("button",{name:"Options for Minecraft Adapter"});
    trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown"});
    expect(document.activeElement).toBe(screen.getByRole("menuitem",{name:"Inspect setup"}));
    fireEvent.click(screen.getByRole("menuitem",{name:"Configure connection"}));
    expect(mocks.openPanel).toHaveBeenCalledWith("agent-access");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("opens the options menu at either end and navigates without invoking actions",async()=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    const trigger=screen.getByRole("button",{name:"Options for System Clock"});
    trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown"});
    const first=screen.getByRole("menuitem",{name:"Package details"});
    const last=screen.getByRole("menuitem",{name:"Configure connection"});
    expect(trigger).toHaveAttribute("aria-controls",screen.getByRole("menu").id);
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first,{key:"ArrowUp"});expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last,{key:"ArrowDown"});expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first,{key:"End"});expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last,{key:"Home"});expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first,{key:"Escape"});expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);expect(trigger).toHaveAttribute("aria-expanded","false");
    fireEvent.keyDown(trigger,{key:"ArrowUp"});
    expect(document.activeElement).toBe(screen.getByRole("menuitem",{name:"Configure connection"}));
    expect(install).not.toHaveBeenCalled();expect(mocks.openPanel).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])("dismisses Tab without trapping native focus traversal (shift=%s)",async shiftKey=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    const trigger=screen.getByRole("button",{name:"Options for System Clock"});
    fireEvent.click(trigger);
    const item=screen.getByRole("menuitem",{name:"Package details"});
    expect(document.activeElement).toBe(item);
    const event=new KeyboardEvent("keydown",{key:"Tab",shiftKey,bubbles:true,cancelable:true});
    fireEvent(item,event);
    expect(event.defaultPrevented).toBe(false);expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);expect(install).not.toHaveBeenCalled();
  });
  it("preserves outside focus and options focus return with controller mode enabled",async()=>{
    vi.stubGlobal("navigator",{getGamepads:()=>[]});
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    fireEvent.click(screen.getByRole("button",{name:"Use controller"}));
    const trigger=screen.getByRole("button",{name:"Options for System Clock"});
    fireEvent.click(trigger);
    const outside=screen.getByRole("button",{name:"Refresh environment catalog"});
    fireEvent.pointerDown(outside);outside.focus();
    expect(screen.queryByRole("menu")).toBeNull();expect(document.activeElement).toBe(outside);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem",{name:"Configure connection"}));
    expect(document.activeElement).toBe(screen.getByRole("region",{name:"System Clock details"}));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem",{name:"Configure connection"}));
    expect(document.activeElement).toBe(screen.getByRole("region",{name:"System Clock details"}));
    fireEvent.click(screen.getByRole("button",{name:"Close details"}));expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);act(()=>outside.focus());
    expect(screen.queryByRole("menu")).toBeNull();expect(document.activeElement).toBe(outside);
    expect(install).not.toHaveBeenCalled();
  });
  it("removes an open menu on account invalidation without retaining a selectable action",async()=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    fireEvent.click(screen.getByRole("button",{name:"Options for System Clock"}));
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await screen.findByText(/private catalog is unavailable/);
    expect(screen.queryByRole("menu")).toBeNull();expect(screen.queryByRole("menuitem")).toBeNull();expect(install).not.toHaveBeenCalled();
  });
  it("wraps sparse Store rows when the grid has more columns than tiles",async()=>{
    const data=directory();data.packages.push({...row(),package_id:"com.casimirbot.other.clock",package_version_id:"connector_package_version:com.casimirbot.other.clock:1.0.0"});
    fetcher.mockResolvedValue({ok:true,json:async()=>data});
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    fireEvent.click(screen.getByRole("button",{name:/Environment Store Browse/}));
    screen.getByLabelText("Environment tiles").style.gridTemplateColumns="100px 100px 100px";
    const first=screen.getByRole("button",{name:/System Clock 1.0.0-private/});
    const second=screen.getByRole("button",{name:/Other Clock 1.0.0-private/});
    first.focus();fireEvent.keyDown(first,{key:"ArrowUp"});expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second,{key:"ArrowDown"});expect(document.activeElement).toBe(first);
    expect(install).not.toHaveBeenCalled();
  });
  it("starts controller navigation only by opt-in and clears it on account change",async()=>{
    const pads=vi.fn(()=>[]);vi.stubGlobal("navigator",{getGamepads:pads});
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    expect(pads).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Use controller"}));
    expect(screen.getByRole("button",{name:"Stop controller navigation"})).toHaveAttribute("aria-pressed","true");
    expect(document.activeElement).toBe(screen.getByRole("button",{name:/Environment Store Browse/}));
    fireEvent.click(screen.getByRole("button",{name:/Environment Store Browse/}));
    expect(document.activeElement).toBe(screen.getByRole("button",{name:/System Clock 1.0.0-private/}));
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await screen.findByRole("button",{name:"Use controller"});
    expect(screen.queryByText(/Connect a standard controller/)).toBeNull();
    expect(install).not.toHaveBeenCalled();
  });
  it("keeps the controller toggle disabled when the browser API is absent",async()=>{
    vi.stubGlobal("navigator",{});render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    expect(screen.getByRole("button",{name:"Use controller"})).toBeDisabled();
  });
  it("ends controller navigation when catalog approval expires",async()=>{
    vi.useFakeTimers();vi.stubGlobal("navigator",{getGamepads:()=>[]});
    await act(async()=>{render(<EnvironmentHomePanel/>);});
    fireEvent.click(screen.getByRole("button",{name:"Use controller"}));
    expect(screen.getByRole("button",{name:"Stop controller navigation"})).toBeEnabled();
    await act(async()=>vi.advanceTimersByTime(60000));
    expect(screen.getByRole("button",{name:"Use controller"})).toBeDisabled();
    expect(screen.queryByText(/Connect a standard controller/)).toBeNull();
  });
  it("shows confirmed removal as not installed and keeps new installation subject to catalog eligibility",async()=>{
    const ref="environment_installation:00000000-0000-4000-8000-000000000001";
    readState.mockResolvedValue({...state(),status:"installed_stopped",installationRef:ref});
    const selection={packageId:state().packageId,version:state().version,artifactSha256:state().artifactSha256,installationRef:ref};
    const lookup=vi.fn(async()=>({status:"selected",selection}));
    const remove=vi.fn(async()=>{lookup.mockResolvedValue({status:"not_installed"} as never);return {status:"removed",receipt:{
      schema:"casimirbot.environment_package_removal.v1",packageId:selection.packageId,artifactSha256:selection.artifactSha256,
      installationRef:ref,selected:false,codeFilesRemoved:true,removedFileCount:4,userDataPreserved:true,observationHistoryPreserved:true}};});
    window.casimirDesktop={...window.casimirDesktop!,getPrivateEnvironmentRemovalState:lookup,removePrivateEnvironmentPackage:remove};
    render(<EnvironmentHomePanel/>);await screen.findByText("System Clock 1.0.0-private.1 is installed.");
    fireEvent.click(screen.getByRole("button",{name:"Remove clock package"}));
    await screen.findByText("Package removed. Saved observations and personal data were kept.");
    expect(screen.getByText("Not installed")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Install reviewed package"})).toBeEnabled();expect(install).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"Run"})).toBeDisabled();
  });
  it("keeps owner cleanup available when the catalog is unavailable",async()=>{
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    const inspectRemoval=vi.fn(async()=>({status:"selected",selection:{packageId:"com.casimirbot.system.clock",version:"1.0.0-private.1",
      artifactSha256:"b".repeat(64),installationRef:"environment_installation:00000000-0000-4000-8000-000000000001"}}));
    window.casimirDesktop={...window.casimirDesktop!,getPrivateEnvironmentRemovalState:inspectRemoval,removePrivateEnvironmentPackage:vi.fn()};
    render(<EnvironmentHomePanel/>);await screen.findByText(/private catalog is unavailable/);
    await screen.findByText("System Clock 1.0.0-private.1 is installed.");
    expect(screen.getByRole("button",{name:"Remove clock package"})).toBeEnabled();expect(readState).not.toHaveBeenCalled();
  });
  it("serializes the initial install and cleanup lookups",async()=>{
    let finish!: (value:unknown)=>void; readState.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
    const inspectRemoval=vi.fn(async()=>({status:"not_installed"}));
    window.casimirDesktop={...window.casimirDesktop!,getPrivateEnvironmentRemovalState:inspectRemoval,removePrivateEnvironmentPackage:vi.fn()};
    render(<EnvironmentHomePanel/>);await waitFor(()=>expect(readState).toHaveBeenCalledTimes(1));
    expect(inspectRemoval).not.toHaveBeenCalled();await act(async()=>finish(state()));
    await screen.findByText("No selected clock package.");expect(inspectRemoval).toHaveBeenCalledTimes(1);
  });
  it("offers the separate clock check only with an installed tuple and complete native bridge, preserving Stop on catalog loss",async()=>{
    let ready!: (value:unknown)=>void;
    const prepare=vi.fn(()=>new Promise(resolve=>{ready=resolve;})), observe=vi.fn(), stop=vi.fn(async()=>undefined);
    window.casimirDesktop={...window.casimirDesktop!,preparePrivateClock:prepare,observePrivateClock:observe,
      recoverPrivateClockObservation:vi.fn(),stopPrivateClock:stop};
    readState.mockResolvedValue({...state(),status:"installed_stopped",installationRef:"install:private"});
    render(<EnvironmentHomePanel/>);await screen.findByRole("button",{name:"Read clock once"});
    expect(prepare).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Run"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Read clock once"}));
    expect(screen.getByRole("button",{name:"Verify / reinstall"})).toBeDisabled();
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    fireEvent.click(screen.getByRole("button",{name:"Refresh environment catalog"}));
    await screen.findByText(/private catalog is unavailable/);await screen.findByText("Clock stopped.");
    expect(screen.getByRole("button",{name:"Read clock once"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Stop clock"})).toBeEnabled();
    await act(async()=>ready({ready:true,installationRef:"install:private"}));
    expect(observe).not.toHaveBeenCalled();expect(stop).toHaveBeenCalledTimes(1);
  });
  it("keeps controls serialized during history lookup without claiming a running clock",async()=>{
    let finish!: (value:unknown)=>void;
    const history=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
    const prepare=vi.fn(), observe=vi.fn(), stop=vi.fn(async()=>undefined);
    window.casimirDesktop={...window.casimirDesktop!,preparePrivateClock:prepare,observePrivateClock:observe,
      recoverPrivateClockObservation:history,stopPrivateClock:stop};
    readState.mockResolvedValue({...state(),status:"installed_stopped",installationRef:"install:private"});
    render(<EnvironmentHomePanel/>);await screen.findByText("Installed · stopped");
    fireEvent.click(screen.getByRole("button",{name:"Load last request history"}));
    expect(screen.getByText("Installed · clock controls busy")).toBeTruthy();
    expect(screen.queryByText("Installed · clock check active")).toBeNull();
    expect(screen.getByRole("button",{name:"Verify / reinstall"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Read clock once"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Stop clock"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:"Read clock once"}));
    fireEvent.click(screen.getByRole("button",{name:"Verify / reinstall"}));
    expect(prepare).not.toHaveBeenCalled();expect(observe).not.toHaveBeenCalled();expect(install).not.toHaveBeenCalled();
    await act(async()=>finish({state:"empty",fresh:false,legacyRecords:0}));
    await screen.findByText("No saved clock requests for this installation.");
    expect(screen.getByText("Installed · stopped")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Verify / reinstall"})).toBeEnabled();
    expect(screen.getByRole("button",{name:"Read clock once"})).toBeEnabled();
    expect(history).toHaveBeenCalledTimes(1);expect(stop).not.toHaveBeenCalled();
  });
  it("does not offer a partial native clock bridge",async()=>{
    window.casimirDesktop={...window.casimirDesktop!,preparePrivateClock:vi.fn()};
    readState.mockResolvedValue({...state(),status:"installed_stopped",installationRef:"install:private"});
    render(<EnvironmentHomePanel/>);await screen.findByText("Installed · stopped");
    expect(screen.queryByRole("button",{name:"Read clock once"})).toBeNull();
  });
  it.each(["artifact","withdrawn"])("does not offer a clock check for a %s mismatch",async kind=>{
    window.casimirDesktop={...window.casimirDesktop!,preparePrivateClock:vi.fn(),observePrivateClock:vi.fn(),
      recoverPrivateClockObservation:vi.fn(),stopPrivateClock:vi.fn()};
    const data=directory();if(kind==="withdrawn")data.packages[0].lifecycle_status="withdrawn";
    fetcher.mockResolvedValue({ok:true,json:async()=>data});
    readState.mockResolvedValue({...state(),status:"installed_stopped",installationRef:"install:private",artifactSha256:kind==="artifact"?"c".repeat(64):"b".repeat(64)});
    render(<EnvironmentHomePanel/>);await screen.findByRole("button",{name:/System Clock 1.0.0-private/});
    expect(screen.queryByRole("button",{name:"Read clock once"})).toBeNull();
  });
  it("shows built-ins and metadata tiles without installing or executing on open",async()=>{
    render(<EnvironmentHomePanel/>); await screen.findByText("Not installed");
    expect(screen.getByRole("button",{name:"Run"})).toBeDisabled(); expect(install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/Account Your identity/})); expect(mocks.openPanel).toHaveBeenCalledWith("account-session");
    fireEvent.click(screen.getByRole("button",{name:/Local Harness Connections/})); expect(mocks.openPanel).toHaveBeenCalledWith("local-harness");
    fireEvent.click(screen.getByRole("button",{name:/Environment Store Browse/})); expect(screen.getByRole("heading",{name:"Environment Store"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Back to Home"})); expect(screen.getByRole("heading",{name:"Home"})).toBeTruthy();
  });
  it("installs only on explicit action and keeps execution and grants separate",async()=>{
    render(<EnvironmentHomePanel/>); await screen.findByText("Not installed");
    fireEvent.click(screen.getByRole("button",{name:"Install reviewed package"}));
    await screen.findByText("Installed · stopped"); expect(install).toHaveBeenCalledWith();
    expect(screen.getByRole("button",{name:"Run"})).toBeDisabled();
  });
  it("moves keyboard focus between primary tiles without activating them",async()=>{
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");
    const store=screen.getByRole("button",{name:/Environment Store Browse/}), account=screen.getByRole("button",{name:/Account Your identity/});
    store.focus();fireEvent.keyDown(store,{key:"ArrowRight"});expect(document.activeElement).toBe(account);
    expect(mocks.openPanel).not.toHaveBeenCalled();expect(install).not.toHaveBeenCalled();
  });
  it("clears current availability when approval expires while the panel remains open",async()=>{
    vi.useFakeTimers();
    await act(async()=>{render(<EnvironmentHomePanel/>);});
    expect(screen.getByText("Not installed")).toBeTruthy();
    await act(async()=>{vi.advanceTimersByTime(60001);});
    expect(screen.getByText(/Catalog approval has expired/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Install reviewed package"})).toBeNull();
  });
  it("uses the overflow connection affordance without a key form or implicit action",async()=>{
    render(<EnvironmentHomePanel/>); await screen.findByText("Not installed");
    fireEvent.click(screen.getByRole("button",{name:"Options for System Clock"}));
    fireEvent.click(screen.getByRole("menuitem",{name:"Configure connection"}));
    expect(screen.getByText(/No API key or CasimirBot subscription is needed/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull(); expect(install).not.toHaveBeenCalled();
    const details=screen.getByRole("region",{name:"System Clock details"});
    expect(document.activeElement).toBe(details);
    expect(details.scrollIntoView).toHaveBeenCalledWith({block:"start",behavior:"auto"});
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Open protected native setup"}));
    expect(mocks.openPanel).toHaveBeenCalledWith("device-check");expect(install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Close details"}));
    expect(document.activeElement).toBe(screen.getByRole("button",{name:"Options for System Clock"}));
  });
  it.each(["hash","version","package","unavailable"])("rejects a native %s mismatch",async kind=>{
    const value={...state(),status:"installed_stopped"};
    if(kind==="hash")value.artifactSha256="c".repeat(64);
    if(kind==="version")value.version="9.0.0";
    if(kind==="package")value.packageId="other.package";
    if(kind==="unavailable"){value.status="unavailable";value.installAvailable=false;}
    readState.mockResolvedValue(value);render(<EnvironmentHomePanel/>);
    await waitFor(()=>expect(screen.queryByText("Checking your local packages…")).toBeNull());
    expect(screen.getByRole("button",{name:"Install reviewed package"})).toBeDisabled();
    expect(screen.queryByText("Installed · stopped")).toBeNull();
  });
  it("does not infer local installation in a browser without the native bridge",async()=>{
    delete window.casimirDesktop;render(<EnvironmentHomePanel/>);await screen.findByText("Installation status unavailable");
    expect(screen.getByRole("button",{name:"Install reviewed package"})).toBeDisabled();
    expect(screen.getByText(/Open the Windows desktop harness/)).toBeTruthy();
  });
  it.each(["expired","offline","invalid","duplicate"])("denies a %s catalog",async kind=>{
    const data=directory();
    if(kind==="expired")data.policy_expires_at=new Date(Date.now()-1000).toISOString();
    if(kind==="invalid")data.packages[0].runtime_available=true;
    if(kind==="duplicate")data.packages.push(row());
    fetcher.mockResolvedValue({ok:kind!=="offline",json:async()=>data});
    render(<EnvironmentHomePanel/>);await screen.findByText(/private catalog is unavailable/);
    expect(screen.queryByRole("button",{name:"Install reviewed package"})).toBeNull();expect(install).not.toHaveBeenCalled();
  });
  it("denies a withdrawn record even if the advertised install flag remains true",async()=>{
    const data=directory();data.packages[0].lifecycle_status="withdrawn";fetcher.mockResolvedValue({ok:true,json:async()=>data});
    render(<EnvironmentHomePanel/>);await screen.findByText("Unavailable");expect(screen.getByRole("button",{name:"Install reviewed package"})).toBeDisabled();
  });
  it("clears old installed status when refresh fails",async()=>{
    readState.mockResolvedValue({...state(),status:"installed_stopped"});render(<EnvironmentHomePanel/>);await screen.findByText("Installed · stopped");
    fetcher.mockRejectedValueOnce(Error("offline"));fireEvent.click(screen.getByRole("button",{name:"Refresh environment catalog"}));
    await screen.findByText(/private catalog is unavailable/);expect(screen.queryByText("Installed · stopped")).toBeNull();
  });
  it("discards an installation response after account invalidation",async()=>{
    let resolve!: (value:unknown)=>void;install.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");fireEvent.click(screen.getByRole("button",{name:"Install reviewed package"}));
    fetcher.mockResolvedValue({ok:false,json:async()=>({})});
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await screen.findByText(/private catalog is unavailable/);
    await act(async()=>resolve({...state(),status:"installed_stopped"}));
    expect(screen.queryByText("Installed · stopped")).toBeNull();
  });
  it("renders publisher text as text, without repository HTML or imagery",async()=>{
    const data=directory();data.packages[0].publisher_id="<img src=x onerror=alert(1)>";fetcher.mockResolvedValue({ok:true,json:async()=>data});
    const view=render(<EnvironmentHomePanel/>);await screen.findByText("Not installed");fireEvent.click(screen.getByRole("button",{name:/System Clock 1.0.0-private/}));
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();expect(view.container.querySelector("img")).toBeNull();
  });
});
