import React, {useEffect,useRef,useState} from "react";
import {MessageCircle,MoreHorizontal} from "lucide-react";
import {environmentHomeDirectorySchema} from "@shared/desktop-environment-home";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import PrivateConnectionInspector from "@/components/agent-access/PrivateConnectionInspector";
import {LiveConnectionSettings} from "@/components/agent-access/LiveConnectionSettings";
import {GeminiConnectionSettings} from "@/components/agent-access/GeminiConnectionSettings";
import {ManagedConversationPreview} from "@/components/agent-access/ManagedConversationPreview";
import {useWorkstationLayoutStore} from "@/store/useWorkstationLayoutStore";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";
import {HELIX_PRIVATE_API_CHAT_OPEN_EVENT} from "./ConsoleConversationEvents";

export default function PrivateAskConnectionMenu({enabled,scope,onSelectPrivateApiChat}:{
  enabled:boolean;scope:string;onSelectPrivateApiChat?:()=>void;
}){
  const openPanel=useWorkstationLayoutStore(state=>state.openPanelInActiveGroup);
  const nativeManagedChatAvailable=typeof window!=="undefined" && Boolean(window.casimirDesktop?.liveConnection);
  const [open,setOpen]=useState(false),[expires,setExpires]=useState<number|null>(null);
  const [section,setSection]=useState<"connections"|"managed-chat">("connections");
  const [message,setMessage]=useState("");
  const [managedDraft,setManagedDraft]=useState("");
  const generation=useRef(0),controller=useRef<AbortController|null>(null),trigger=useRef<HTMLButtonElement>(null);
  const managedTrigger=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null);
  const close=()=>{generation.current++;controller.current?.abort();controller.current=null;setOpen(false);setExpires(null);setSection("connections");};
  useEffect(()=>{
    const reset=()=>{close();setManagedDraft("");};
    reset();window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,reset);
    return()=>{generation.current++;controller.current?.abort();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,reset);};
  },[enabled,scope]);
  useEffect(()=>{
    if(expires===null)return;
    const expire=()=>{
      // The directory lease gates the inspector, not the native, account-bound
      // Agents API conversation. Do not unmount a paid turn when it expires.
      if(section==="managed-chat"){
        setExpires(null);
        setMessage("Private connection setup expired. Recheck it before using the MCP inspector.");
      }else close();
    };
    const timer=window.setTimeout(expire,Math.max(0,expires-Date.now()));
    const returned=()=>{if(Date.now()>=expires)expire();};
    window.addEventListener("focus",returned);document.addEventListener("visibilitychange",returned);
    return()=>{window.clearTimeout(timer);window.removeEventListener("focus",returned);document.removeEventListener("visibilitychange",returned);};
  },[expires,section]);
  const checkPolicy=async()=>{
    if(!enabled)return;
    controller.current?.abort();
    const id=++generation.current,abort=new AbortController();controller.current=abort;
    setExpires(null);setMessage("Checking private connection setup availability…");
    const timer=window.setTimeout(()=>abort.abort(),10000);
    try{
      const response=await fetch("/api/agi/environment-connectors/private/directory/packages",{credentials:"same-origin",cache:"no-store",signal:abort.signal});
      if(!response.ok)throw Error("private_setup_unavailable");
      const value=environmentHomeDirectorySchema.parse(await response.json()),expiry=Date.parse(value.policy_expires_at);
      if(id!==generation.current)return;
      abort.signal.throwIfAborted();
      if(expiry<=Date.now())throw Error("private_setup_expired");
      setExpires(expiry);setMessage("");
    }catch{if(id===generation.current)setMessage("Private connection setup is unavailable. Check your developer account and local harness.");}
    finally{window.clearTimeout(timer);if(id===generation.current)controller.current=null;}
  };
  const show=()=>{if(!enabled||open)return;returnFocus.current=trigger.current;setSection("connections");setOpen(true);void checkPolicy();};
  const showManaged=()=>{if(!enabled||!nativeManagedChatAvailable||open)return;
    returnFocus.current=managedTrigger.current;setSection("managed-chat");setMessage("");setOpen(true);};
  useEffect(()=>{
    const openFromConsole=()=>{if(onSelectPrivateApiChat&&nativeManagedChatAvailable&&enabled)onSelectPrivateApiChat();else showManaged();};
    window.addEventListener(HELIX_PRIVATE_API_CHAT_OPEN_EVENT,openFromConsole);
    return()=>window.removeEventListener(HELIX_PRIVATE_API_CHAT_OPEN_EVENT,openFromConsole);
  },[enabled,nativeManagedChatAvailable,open,onSelectPrivateApiChat]);
  if(!enabled)return null;
  return <>
    <button ref={trigger} type="button" aria-label="Configure connection" aria-haspopup="dialog" aria-expanded={open&&section==="connections"}
      data-helix-ask-action-item="true" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-white/10 px-3 text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300"
      onClick={()=>void show()}><MoreHorizontal className="h-4 w-4" aria-hidden="true"/></button>
    {nativeManagedChatAvailable&&!onSelectPrivateApiChat?<button ref={managedTrigger} type="button" aria-label="Cloud Agent DM" aria-haspopup="dialog"
      aria-expanded={open&&section==="managed-chat"} data-helix-ask-action-item="true"
      data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-cyan-300/20 px-3 text-xs text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300"
      onClick={showManaged}><MessageCircle className="h-4 w-4" aria-hidden="true"/>Cloud Agent DM</button>:null}
    <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-slate-950 text-slate-100"
        onCloseAutoFocus={event=>{event.preventDefault();returnFocus.current?.focus();}}>
        <DialogHeader><DialogTitle>Helix Console connections</DialogTitle>
          <DialogDescription>Manage your personal provider keys and MCP connections from any chat. Room provider access and program grants have separate owner controls. Codex App tasks keep their own connection.</DialogDescription></DialogHeader>
        <nav aria-label="Helix Console connection views" className="flex gap-2 text-sm">
          <button type="button" aria-current={section==="connections"?"page":undefined} onClick={()=>setSection("connections")}
            className="rounded-lg border border-cyan-300/30 px-3 py-2">Connections</button>
          {nativeManagedChatAvailable&&!onSelectPrivateApiChat?<button type="button" aria-current={section==="managed-chat"?"page":undefined} onClick={()=>setSection("managed-chat")}
            className="rounded-lg border border-cyan-300/30 px-3 py-2">Cloud Agent DM</button>:null}
        </nav>
        {section==="connections"?<>
          {open && <LiveConnectionSettings showManagedConversation={false}/>}
          {open && <GeminiConnectionSettings/>}
          <h3 className="font-semibold">External MCP connection</h3>
          {expires!==null?<PrivateConnectionInspector scope={`Helix Ask · ${scope}`} onOpenSetup={()=>{close();openPanel("agent-access");}}/>
            :<><p role="status">{message}</p><button type="button" disabled={message.startsWith("Checking")}
              onClick={()=>void checkPolicy()} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Recheck private setup</button></>}
        </>:<>
          <p className="text-xs text-slate-300">This uses your own OpenAI key for a private Agents API conversation with bounded clock and public-context reads. It does not read room messages or directly steer a Codex App task.</p>
          <ManagedConversationPreview retainedDraft={managedDraft} onRetainedDraftChange={setManagedDraft}/>
          <button type="button" onClick={()=>setSection("connections")} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Set up OpenAI key</button>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
