// @vitest-environment jsdom
import React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";
const mocks=vi.hoisted(()=>({openPanel:vi.fn()}));
vi.mock("@/store/useWorkstationLayoutStore",()=>({useWorkstationLayoutStore:(selector:any)=>selector({openPanelInActiveGroup:mocks.openPanel})}));
import PrivateAskConnectionMenu from "../PrivateAskConnectionMenu";
import {HELIX_PRIVATE_API_CHAT_OPEN_EVENT} from "../ConsoleConversationEvents";
const directory=()=>({schema:"helix.environment_connector.private_directory.v1",policy_revision:"private:3",
  policy_expires_at:new Date(Date.now()+60000).toISOString(),packages:[],public_release:false});
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{mocks.openPanel.mockReset();fetcher=vi.fn();fetcher.mockResolvedValue({ok:true,json:async()=>directory()});vi.stubGlobal("fetch",fetcher);});
afterEach(()=>{cleanup();delete window.casimirDesktop;vi.useRealTimers();vi.unstubAllGlobals();});
const mount=(enabled=true)=>render(<PrivateAskConnectionMenu enabled={enabled} scope="codex"/>);
const open=()=>fireEvent.click(screen.getByRole("button",{name:"Configure connection"}));
describe("private Ask connection entry",()=>{
  it("is absent and sends no requests without developer presentation admission",()=>{
    mount(false);expect(screen.queryByRole("button")).toBeNull();expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks only private policy on explicit open, reuses inspector, and navigates without side effects",async()=>{
    mount();expect(fetcher).not.toHaveBeenCalled();open();await screen.findByRole("button",{name:"Check connection status"});
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe("/api/agi/environment-connectors/private/directory/packages");
    expect(fetcher.mock.calls[0][1]).toEqual(expect.objectContaining({credentials:"same-origin",cache:"no-store"}));
    expect(screen.getByRole("dialog")).toBeTruthy();expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button",{name:"Cloud Agent DM"})).toBeNull();
    expect(screen.getByText(/Codex App tasks keep their own connection/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Open connection setup"}));
    expect(mocks.openPanel).toHaveBeenCalledWith("agent-access");expect(fetcher).toHaveBeenCalledTimes(1);
    await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("opens a separate private managed chat without sending the Ask composer or room context",async()=>{
    const invoke=vi.fn(async(request:{action:string;prompt?:string})=>{
      if(request.action==="inspect")return {ok:true,code:"saved",state:{configured:true,source:"saved"}};
      if(request.action==="conversation_inspect")return {ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}};
      return {ok:true,code:"conversation_ready",conversation:{active:true,messages:[
        {role:"user",text:request.prompt},{role:"assistant",text:"Private preview reply"}]}};
    });
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    const submitted=vi.fn();render(<form onSubmit={submitted}><PrivateAskConnectionMenu enabled scope="codex"/></form>);
    open();expect(await screen.findByLabelText("Gemini API key")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    await waitFor(()=>expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Message to private agent"),{target:{value:"Private question"}});
    fireEvent.click(screen.getByRole("button",{name:"Send private message"}));
    await screen.findByText(/Private preview reply/);
    expect(submitted).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({action:"conversation_send",prompt:"Private question"}));
    expect(invoke.mock.calls.every(([request])=>!Object.keys(request).some(key=>["room_id","roomId","task_id","sessionId","key"].includes(key)))).toBe(true);
  });
  it("opens native private API chat directly without requiring the MCP directory",async()=>{
    const invoke=vi.fn(async(request:{action:string})=>request.action==="inspect"
      ? {ok:true,code:"saved",state:{configured:true,source:"saved"}}
      : {ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}});
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    const submitted=vi.fn();render(<form onSubmit={submitted}><PrivateAskConnectionMenu enabled scope="codex"/></form>);
    const entry=screen.getByRole("button",{name:"Cloud Agent DM"});
    entry.focus();fireEvent.click(entry);
    await waitFor(()=>expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    expect(screen.getByRole("dialog")).toHaveTextContent("bounded clock and public-context reads");
    expect(fetcher).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Close"}));
    await waitFor(()=>expect(document.activeElement).toBe(entry));
  });
  it("routes the room's private API entry to the Console channel when available",()=>{
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:vi.fn() as never};
    const select=vi.fn();
    render(<PrivateAskConnectionMenu enabled scope="codex" onSelectPrivateApiChat={select}/>);
    expect(screen.queryByRole("button",{name:"Cloud Agent DM"})).toBeNull();
    act(()=>window.dispatchEvent(new Event(HELIX_PRIVATE_API_CHAT_OPEN_EVENT)));
    expect(select).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps an unsent private API draft across navigation but clears it on account change",async()=>{
    const invoke=vi.fn(async(request:{action:string})=>request.action==="inspect"
      ? {ok:true,code:"saved",state:{configured:true,source:"saved"}}
      : {ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}});
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    mount();
    fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    const draft=await screen.findByLabelText("Message to private agent") as HTMLTextAreaElement;
    await waitFor(()=>expect(draft).not.toBeDisabled());
    fireEvent.change(draft,{target:{value:"Unsent private idea"}});
    fireEvent.click(screen.getByRole("button",{name:"Close"}));
    fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    expect((screen.getByLabelText("Message to private agent") as HTMLTextAreaElement).value).toBe("Unsent private idea");
    expect(invoke.mock.calls.some(([request])=>request.action==="conversation_send")).toBe(false);
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    expect((screen.getByLabelText("Message to private agent") as HTMLTextAreaElement).value).toBe("");
  });
  it("accepts room navigation into the private API chat without sending room context",async()=>{
    const invoke=vi.fn(async(request:{action:string})=>request.action==="inspect"
      ? {ok:true,code:"saved",state:{configured:true,source:"saved"}}
      : {ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}});
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    mount();
    act(()=>window.dispatchEvent(new Event(HELIX_PRIVATE_API_CHAT_OPEN_EVENT)));
    await waitFor(()=>expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    expect(fetcher).not.toHaveBeenCalled();
    expect(invoke.mock.calls.every(([request])=>!Object.keys(request).some(key=>["room_id","roomId","task_id","sessionId"].includes(key)))).toBe(true);
  });
  it("stops a pending managed turn when switching back to connection setup",async()=>{
    let release!:(value:unknown)=>void;
    const invoke=vi.fn((request:{action:string;turn_id?:string})=>{
      if(request.action==="inspect")return Promise.resolve({ok:true,code:"saved",state:{configured:true,source:"saved"}});
      if(request.action==="conversation_inspect")return Promise.resolve({ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}});
      if(request.action==="conversation_stop")return Promise.resolve({ok:true,code:"conversation_stopped"});
      return new Promise(resolve=>{release=resolve;});
    });
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    mount();open();fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    await waitFor(()=>expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Message to private agent"),{target:{value:"Pending private turn"}});
    fireEvent.click(screen.getByRole("button",{name:"Send private message"}));
    const sent=invoke.mock.calls.find(([request])=>request.action==="conversation_send")?.[0];
    fireEvent.click(screen.getByRole("button",{name:"Connections"}));
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith({action:"conversation_stop",turn_id:sent?.turn_id}));
    await act(async()=>release({ok:true,code:"conversation_ready",conversation:{active:true,messages:[
      {role:"assistant",text:"Late private answer"}]}}));
    expect(screen.queryByText(/Late private answer/)).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("keeps a managed turn open when only the MCP inspector policy expires",async()=>{
    const now=Date.now();
    fetcher.mockResolvedValue({ok:true,json:async()=>({...directory(),policy_expires_at:new Date(now+1000).toISOString()})});
    let finishTurn!:(value:unknown)=>void;
    const invoke=vi.fn((request:{action:string})=>{
      if(request.action==="inspect")return Promise.resolve({ok:true,code:"saved",state:{configured:true,source:"saved"}});
      if(request.action==="conversation_inspect")return Promise.resolve({ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}});
      if(request.action==="conversation_stop")return Promise.resolve({ok:true,code:"conversation_stopped"});
      return new Promise(resolve=>{finishTurn=resolve;});
    });
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    mount();open();fireEvent.click(screen.getByRole("button",{name:"Cloud Agent DM"}));
    await waitFor(()=>expect(screen.getByLabelText("Message to private agent")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Message to private agent"),{target:{value:"Keep this private turn"}});
    fireEvent.click(screen.getByRole("button",{name:"Send private message"}));
    await waitFor(()=>expect(invoke.mock.calls.some(([request])=>request.action==="conversation_send")).toBe(true));
    const clock=vi.spyOn(Date,"now").mockReturnValue(now+1001);
    try{
      fireEvent(window,new Event("focus"));
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.queryByText("Stopping the managed turn…")).toBeNull();
      expect(invoke.mock.calls.some(([request])=>request.action==="conversation_stop")).toBe(false);
      await act(async()=>finishTurn({ok:true,code:"conversation_ready",conversation:{active:true,messages:[
        {role:"user",text:"Keep this private turn"},{role:"assistant",text:"Private answer retained"}]}}));
      expect(screen.getByText(/Private answer retained/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button",{name:"Connections"}));
      expect(screen.getByRole("button",{name:"Recheck private setup"})).toBeTruthy();
      expect(screen.queryByRole("button",{name:"Check connection status"})).toBeNull();
    }finally{clock.mockRestore();}
  });
  it.each(["denied","malformed","expired"])("keeps inspector absent for %s policy",async kind=>{
    const value=directory();if(kind==="malformed")value.public_release=true;
    if(kind==="expired")value.policy_expires_at=new Date(Date.now()-1).toISOString();
    fetcher.mockResolvedValue({ok:kind!=="denied",json:async()=>value});mount();open();await screen.findByText(/Private connection setup is unavailable/);
    expect(screen.queryByRole("button",{name:"Check connection status"})).toBeNull();
  });
  it.each(["account","scope","gate","unmount"])("rejects late policy after %s change",async kind=>{
    let resolve!:(value:unknown)=>void;fetcher.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const view=mount();open();const signal=fetcher.mock.calls[0][1].signal;
    if(kind==="account")act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    if(kind==="scope")view.rerender(<PrivateAskConnectionMenu enabled scope="different-runtime"/>);
    if(kind==="gate")view.rerender(<PrivateAskConnectionMenu enabled={false} scope="codex"/>);
    if(kind==="unmount")view.unmount();
    expect(signal.aborted).toBe(true);await act(async()=>resolve({ok:true,json:async()=>directory()}));
    expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByRole("button",{name:"Check connection status"})).toBeNull();
  });
  it("closes at policy expiry without polling",async()=>{
    vi.useFakeTimers();mount();await act(async()=>open());expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async()=>vi.advanceTimersByTime(60000));expect(screen.queryByRole("dialog")).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("returns focus on explicit close and does not submit the surrounding composer",async()=>{
    const submitted=vi.fn();render(<form onSubmit={submitted}><PrivateAskConnectionMenu enabled scope="codex"/></form>);
    const trigger=screen.getByRole("button",{name:"Configure connection"});trigger.focus();open();
    await screen.findByRole("button",{name:"Check connection status"});fireEvent.click(screen.getByRole("button",{name:"Close"}));
    await waitFor(()=>expect(document.activeElement).toBe(trigger));expect(submitted).not.toHaveBeenCalled();
  });
});
