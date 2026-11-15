import React from "react";
import {gcnSourceStatusSchema,gcnCredentialInputSchema,type GcnSourceStatus} from "../../../shared/gcn-source-connection";
import {gcnPrivateAccessSchema} from "../../../shared/gcn-private-access";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,readCachedAccountProfileIdentity} from "@/lib/workstation/accountCapabilityPolicy";

const endpoint="/api/star-watcher/source-connections/gcn";
export function GcnSourceConnection(){
  const [view,setView]=React.useState<GcnSourceStatus|null>(null),[clientId,setClientId]=React.useState(""),
    [secret,setSecret]=React.useState(""),[message,setMessage]=React.useState(""),[busy,setBusy]=React.useState(false),
    [revision,setRevision]=React.useState(0);
  const [privateReview,setPrivateReview]=React.useState(false);
  const generation=React.useRef(0);
  const mutation=React.useRef<{controller:AbortController;timer:number}|null>(null);
  const retireMutation=()=>{
    const request=mutation.current;if(!request)return;
    window.clearTimeout(request.timer);request.controller.abort();mutation.current=null;
  };
  const beginMutation=()=>{
    const controller=new AbortController();
    const request={controller,timer:window.setTimeout(()=>controller.abort(),15000)};
    mutation.current=request;return request;
  };
  React.useEffect(()=>{
    const changed=()=>{generation.current++;retireMutation();setView(null);setClientId("");setSecret("");setPrivateReview(false);setMessage("");setBusy(false);setRevision(r=>r+1);};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return()=>{generation.current++;retireMutation();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);
  React.useEffect(()=>{
    const controller=new AbortController(),at=generation.current,owner=readCachedAccountProfileIdentity().profileId;
    void fetch(endpoint,{credentials:"same-origin",cache:"no-store",signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error(response.status===409?"website":"account");
      const value=gcnSourceStatusSchema.parse(await response.json());
      if(!owner||value.profile_id!==owner||readCachedAccountProfileIdentity().profileId!==owner)throw Error('account');
      if(at===generation.current&&!controller.signal.aborted){setView(value);setMessage("");}
    }).catch(error=>{if(at!==generation.current||controller.signal.aborted)return;
      setMessage(error instanceof Error&&error.message==="website"?"Manage GCN credentials on the CasimirBot website.":"Sign in on the website to manage your GCN connection, or retry if the service is unavailable.");});
    return()=>controller.abort();
  },[revision]);
  const change=async(mode:"own_gcn"|"public_catalog")=>{
    if(!view||busy||mutation.current||view.profile_id!==readCachedAccountProfileIdentity().profileId)return;
    if(mode==='own_gcn'&&(!view.storage_available||!gcnCredentialInputSchema.safeParse({client_id:clientId,client_secret:secret}).success))return;
    const at=generation.current,request=beginMutation();setBusy(true);setMessage("");
    const body=mode==="own_gcn"?{mode,expected_profile_id:view.profile_id,credentials:{client_id:clientId,client_secret:secret}}:
      {mode,expected_profile_id:view.profile_id};
    // Clear both fields immediately; never persist secrets in browser storage.
    setClientId("");setSecret("");
    try{const response=await fetch(endpoint,{method:"PUT",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:request.controller.signal});
      if(!response.ok)throw Error("save_failed");const next=gcnSourceStatusSchema.parse(await response.json());
      if(at!==generation.current||request.controller.signal.aborted)return;
      if(next.profile_id!==view.profile_id||next.profile_id!==readCachedAccountProfileIdentity().profileId)throw Error("account_changed");
      setView(next);setMessage(mode==="own_gcn"?"Credentials saved encrypted for your account. A personal stream is not running; activation still needs qualification.":"Personal GCN credentials removed. Public catalog browsing remains available.");
    }catch{if(at===generation.current)setMessage("Update was not confirmed. Refresh the connection status before trying again.");}
    finally{window.clearTimeout(request.timer);if(mutation.current===request)mutation.current=null;
      if(at===generation.current)setBusy(false);}
  };
  const privateChange=async(mode:"own_gcn"|"platform_managed"|"stop")=>{
    if(!view||busy||mutation.current||view.profile_id!==readCachedAccountProfileIdentity().profileId)return;
    if(mode!=="stop"&&(!privateReview||!view.private_access.eligible||(mode==='own_gcn'&&!view.credential_saved)))return;
    if(mode!=="stop"&&(!view.private_access.expires_at||Date.parse(view.private_access.expires_at)<=Date.now())){
      setPrivateReview(false);setMessage('Private access window expired. Refresh connection status before reviewing again.');return;
    }
    const at=generation.current,request=beginMutation();setBusy(true);setMessage("");setPrivateReview(false);
    try{
      const response=await fetch(`${endpoint}/private${mode==="stop"?`?expected_profile_id=${encodeURIComponent(view.profile_id)}`:""}`,{
        method:mode==="stop"?"DELETE":"PUT",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},
        ...(mode!=="stop"?{body:JSON.stringify({expected_profile_id:view.profile_id,mode,accept:true,policy:"gcn.private_access.v1"})}:{}),signal:request.controller.signal});
      if(!response.ok)throw Error("not_activated");
      const access=gcnPrivateAccessSchema.parse(await response.json());
      if(at!==generation.current||request.controller.signal.aborted)return;
      if(view.profile_id!==readCachedAccountProfileIdentity().profileId)throw Error('account_changed');
      if(mode==='stop'){
        if(access.leases.some(lease=>lease.state==='active'))throw Error('stop_not_confirmed');
      }else if(access.expires_at!==view.private_access.expires_at||!access.eligible||
        !access.leases.some(lease=>lease.mode===mode&&lease.state==='active'&&
          lease.expires_at===view.private_access.expires_at&&Date.parse(lease.expires_at)>Date.now())){
        throw Error('reviewed_lease_not_confirmed');
      }
      setPrivateReview(false);setRevision(r=>r+1);setMessage(mode==="stop"?"Private source access stopped. The worker rechecks within 30 seconds.":"Private access approved for the displayed window. Provider connection readiness is shown separately.");
    }catch{if(at===generation.current)setMessage("Private access change was not confirmed. Refresh status before trying again.");}
    finally{window.clearTimeout(request.timer);if(mutation.current===request)mutation.current=null;
      if(at===generation.current)setBusy(false);}
  };
  return <section aria-label="GCN account connection" className="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs space-y-2">
    <h3 className="text-sm font-medium text-slate-100">GCN neutrino alerts · account access</h3>
    <p>Public retained alerts and sky artifacts are available without your own GCN login. Shared feed ingestion is paid by CasimirBot operations; receiving the same public event does not debit each subscriber.</p>
    <p>Personal GCN connection: {view?.credential_saved?view.verified_at_provider?"saved encrypted · private connection listening":"saved encrypted · inactive":"none saved"}. Bring your public-consumer credentials to configure your own source connection.</p>
    <a href="https://gcn.nasa.gov/quickstart" target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Create or manage your GCN credentials</a>
    {view?<>
      <label className="block" htmlFor="gcn-client-id">GCN client ID</label>
      <input id="gcn-client-id" type="password" autoComplete="off" spellCheck={false} value={clientId}
        disabled={busy||!view.storage_available} onChange={e=>setClientId(e.target.value)} className="w-full rounded border border-slate-600 bg-slate-950 p-2" />
      <label className="block" htmlFor="gcn-client-secret">GCN client secret</label>
      <input id="gcn-client-secret" type="password" autoComplete="new-password" spellCheck={false} value={secret}
        disabled={busy||!view.storage_available} onChange={e=>setSecret(e.target.value)} className="w-full rounded border border-slate-600 bg-slate-950 p-2" />
      {!view.storage_available?<p>Encrypted account storage is unavailable on this host. Credentials cannot be submitted.</p>:null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy||!view.storage_available||!gcnCredentialInputSchema.safeParse({client_id:clientId,client_secret:secret}).success} onClick={()=>void change("own_gcn")} className="rounded border p-2">Save personal credentials</button>
        <button type="button" disabled={busy||!view.credential_saved} onClick={()=>void change("public_catalog")} className="rounded border p-2">Remove personal connection</button>
      </div>
    </>:null}
    <button type="button" disabled className="rounded border p-2">Use CasimirBot-managed access · not available yet</button>
    <p>Managed access will require a GCN-specific subscription benefit and approved resource budget. An AI-text subscription alone does not enable it. Optional reasoning has its own consent and model allowance; using personal credentials does not debit a managed allowance.</p>
    {view?.private_access.eligible||view?.private_access.leases.length?<div className="rounded border border-amber-700 p-3 space-y-2">
      <h4 className="font-medium">Private four-hour source qualification</h4>
      <p>Ends: {view.private_access.expires_at}. One personal connection and one managed-source grant for this account. Personal intake is capped at 64 notices. The initial personal check may replay only the last retained notice per partition.</p>
      <p>Personal access lets CasimirBot’s domain and existing Discord worker use your saved public-consumer credentials for this bounded connection. Managed access uses the platform’s shared public feed. No subscriber debit, paid reasoning or Discord posting is authorized here.</p>
      {view.private_access.leases.map(lease=><p key={lease.id}>{lease.mode==="own_gcn"?"Personal":"Managed"}: {lease.state} · provider {lease.provider_state} · {lease.committed_records} committed notices · {lease.last_seen_at??"waiting for worker"}</p>)}
      <label className="flex gap-2"><input type="checkbox" checked={privateReview} onChange={e=>setPrivateReview(e.target.checked)}/>I approve the source access described above until the displayed expiry.</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy||!privateReview||!view.private_access.eligible||!view.credential_saved} onClick={()=>void privateChange("own_gcn")} className="rounded border p-2">Approve personal source qualification</button>
        <button type="button" disabled={busy||!privateReview||!view.private_access.eligible} onClick={()=>void privateChange("platform_managed")} className="rounded border p-2">Approve managed source qualification</button>
        <button type="button" disabled={busy||!view.private_access.leases.length} onClick={()=>void privateChange("stop")} className="rounded border p-2">Stop private source access</button>
      </div>
    </div>:null}
    <p>Saving credentials alone does not start a stream or change Discord delivery. Super-Kamiokande ingestion is still in specification.</p>
    <button type="button" disabled={busy} className="underline" onClick={()=>{generation.current++;retireMutation();setPrivateReview(false);setClientId("");setSecret("");setMessage("");setView(null);setRevision(r=>r+1);}}>Refresh connection status</button>
    {message?<p role="status">{message}</p>:null}
    {!view?<a href="https://casimirbot.com/account#star-watcher-gcn" target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Open Star Watcher account access on the website</a>:null}
  </section>;
}
