// @vitest-environment jsdom
import React from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {LiveConnectionSettings} from "../LiveConnectionSettings";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";
afterEach(()=>{cleanup();delete window.casimirDesktop;});
describe("GPT Live connection settings",()=>{
  it("labels launcher-supplied credentials without claiming they were saved for the profile",async()=>{
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:vi.fn(async(request:{action:string})=>
      request.action==="inspect"?{ok:true,code:"saved",state:{configured:true,source:"launcher"}}:
        {ok:true,code:"conversation_ready",conversation:{active:false,messages:[]}}) as never};
    render(<LiveConnectionSettings/>);
    await screen.findByText(/Key supplied by this launcher/);
    expect(screen.getByText(/not saved under your signed-in profile/)).toBeTruthy();
    expect(screen.queryByText(/Your saved key is encrypted/)).toBeNull();
  });
  it("removes displayed private conversation when the personal key changes",async()=>{
    let saved=false;
    const invoke=vi.fn(async(request:{action:string})=>{
      if(request.action==="inspect") return {ok:true,code:"saved",state:{configured:true,source:"saved"}};
      if(request.action==="conversation_inspect") return {ok:true,code:"conversation_ready",conversation:saved
        ?{active:false,messages:[]}:{active:true,messages:[{role:"assistant",text:"Old private answer"}]}};
      if(request.action==="save") {saved=true;return {ok:true,code:"saved",state:{configured:true,source:"saved"}};}
      return {ok:false,code:"request_rejected"};
    });
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    render(<LiveConnectionSettings/>);
    await screen.findByText(/Old private answer/);
    fireEvent.change(screen.getByLabelText("Replace OpenAI API key"),{target:{value:"sk-replacement_abcdefghijklmnopqrstuvwxyz"}});
    fireEvent.click(screen.getByRole("button",{name:"Save key"}));
    await waitFor(()=>expect(screen.queryByText(/Old private answer/)).toBeNull());
  });
  it("offers desktop guidance without collecting keys in a browser",()=>{
    render(<LiveConnectionSettings/>);
    expect(screen.queryByLabelText("OpenAI API key")).toBeNull();
    expect(screen.getByText(/updated desktop harness/)).toBeTruthy();
  });
  it("keeps key input masked, clears it after save and tests only on demand",async()=>{
    const invoke=vi.fn(async(request)=>request.action==="inspect"?{ok:true,code:"saved",state:{configured:false,source:"none"}}:
      {ok:true,code:request.action==="test"?"model_access_confirmed":"saved",state:{configured:true,source:"saved"}});
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    render(<LiveConnectionSettings/>);
    await screen.findByText("Not connected");
    const input=screen.getByLabelText("OpenAI API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input,{target:{value:"sk-test_fixture_abcdefghijklmnopqrstuvwxyz"}});
    fireEvent.click(screen.getByRole("button",{name:"Save key"}));
    await screen.findByText(/Key saved securely/);
    expect(input.value).toBe(""); expect(invoke.mock.calls.some(([r])=>r.action==="test")).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Test connection"}));
    await screen.findByText(/confirmed access to this model/);
  });
  it("tests managed chat only on demand without sending a key or switching runtime",async()=>{
    const invoke=vi.fn(async(request)=>({ok:true,code:request.action==="test_chat"?"agent_chat_confirmed":"saved",state:{configured:true,source:"saved"},cleanupConfirmed:true}));
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    render(<LiveConnectionSettings/>);
    await screen.findByText("Personal key saved");
    expect(invoke.mock.calls.some(([r])=>r.action==="test_chat")).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Test managed chat"}));
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith({action:"test_chat"}));
    await screen.findByText(/Helix Ask chat routing/);
    expect(invoke.mock.calls.every(([r])=>Object.keys(r).length===1)).toBe(true);
  });
  it("reports an unconfirmed room-session cleanup when the owner disconnects",async()=>{
    const invoke=vi.fn(async(request:{action:string})=>request.action==="inspect"
      ?{ok:true,code:"saved",state:{configured:true,source:"saved"}}
      :{ok:true,code:"disconnected",state:{configured:false,source:"none"},cleanupConfirmed:false});
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:invoke as never};
    render(<LiveConnectionSettings showManagedConversation={false}/>);
    await screen.findByText("Personal key saved");
    fireEvent.click(screen.getByRole("button",{name:"Remove key & disconnect"}));
    await screen.findByText(/earlier room interpreter session or active turn could not be confirmed closed/);
    expect(invoke).toHaveBeenCalledWith({action:"disconnect"});
  });
  it("clears drafts and ignores late state after account change",async()=>{
    let resolve!: (value:unknown)=>void;
    window.casimirDesktop={getRuntimeSnapshot:vi.fn(),liveConnection:vi.fn(()=>new Promise(r=>resolve=r)) as never};
    render(<LiveConnectionSettings/>);
    const input=screen.getByLabelText("OpenAI API key") as HTMLInputElement;
    fireEvent.change(input,{target:{value:"sk-private_draft_abcdefghijklmnopqrstuvwxyz"}});
    fireEvent(window,new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    resolve({ok:true,code:"saved",state:{configured:true,source:"saved"}});
    await waitFor(()=>expect(input.value).toBe(""));
    expect(screen.queryByText("Personal key saved")).toBeNull();
  });
});
