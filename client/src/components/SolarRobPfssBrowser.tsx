import React from 'react';
import {robPfssCatalogSchema,robPfssSnapshotSchema,robPfssRetainedReceiptSchema,
  robPfssRetainedListSchema,robPfssParentReceiptSchema,type RobPfssRetainedReceipt,
  type RobPfssParentReceipt,type RobPfssSnapshot} from '../../../shared/solar-rob-pfss';
import {solarGlobalRadialMapSchema,type SolarGlobalRadialMap} from '../../../shared/solar-magnetic-dipole';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,fetchAccountCapabilityPolicy,
  readCachedAccountProfileIdentity} from '../lib/workstation/accountCapabilityPolicy';

/** Explicit source selection keeps movie time distinct from model-input time. */
export function SolarRobPfssBrowser({onSnapshot,onParentMap,onParentRotation,onParentReceipt}:{
  onSnapshot:(snapshot:RobPfssSnapshot|null)=>void;
  onParentMap:(map:SolarGlobalRadialMap|null)=>void;
  onParentRotation:(angleDeg:number|null)=>void;
  onParentReceipt:(receipt:RobPfssParentReceipt|null)=>void}){
  const [dateUtc,setDateUtc]=React.useState(()=>new Date().toISOString().slice(0,10));
  const [catalog,setCatalog]=React.useState<ReturnType<typeof robPfssCatalogSchema.parse>|null>(null);
  const [selected,setSelected]=React.useState<RobPfssSnapshot|null>(null);
  const [receipt,setReceipt]=React.useState<RobPfssRetainedReceipt|null>(null);
  const [parentReceipt,setParentReceipt]=React.useState<RobPfssParentReceipt|null>(null);
  React.useEffect(()=>{onParentReceipt(parentReceipt);},[parentReceipt,onParentReceipt]);
  const [retained,setRetained]=React.useState<RobPfssRetainedReceipt[]>([]);
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState('Choose a UTC date to inspect the ROB PFSS model index.');
  const request=React.useRef<AbortController|null>(null);
  const activeProfile=React.useRef(readCachedAccountProfileIdentity());
  const retireRequest=React.useCallback(()=>{
    request.current?.abort();request.current=null;setBusy(false);
  },[]);
  React.useEffect(()=>{
    const changed=()=>{const next=readCachedAccountProfileIdentity();
      if(next.profileId===activeProfile.current.profileId&&next.revision===activeProfile.current.revision)return;
      activeProfile.current=next;retireRequest();
      setMessage('Account changed; select this profile’s retained models or search again.');
      setCatalog(null);setSelected(null);setReceipt(null);
      setParentReceipt(null);setRetained([]);onSnapshot(null);onParentMap(null);onParentRotation(null);};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return()=>{request.current?.abort();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[onSnapshot,onParentMap,onParentRotation,retireRequest]);
  async function search(){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setCatalog(null);setSelected(null);setReceipt(null);setParentReceipt(null);
    onSnapshot(null);onParentMap(null);onParentRotation(null);
    setMessage('Reading fixed ROB monthly index; no model FITS downloaded.');
    try{
      const response=await fetch(`/api/star-watcher/rob-pfss/catalog?${new URLSearchParams({dateUtc})}`,
        {credentials:'include',signal:controller.signal});
      if(!response.ok)throw new Error(`ROB index unavailable (${response.status})`);
      const value=robPfssCatalogSchema.parse(await response.json());
      if(controller.signal.aborted)return;
      setCatalog(value);setMessage(value.status==='unavailable'
        ? 'ROB index could not be checked; model availability is unknown.'
        :value.status==='no_product_at_path'
          ? 'No model for this UTC date was listed at the checked ROB index.'
          :`${value.entries.length} model record${value.entries.length===1?'':'s'} listed; publication cadence is not assumed.`);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'ROB index unavailable');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function load(relativePath:string,expectedSha256?:string){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setMessage('Downloading and decoding bounded ROB PFSS FITS model…');
    try{
      const modelDateUtc=relativePath.slice(0,10).replaceAll('/','-');
      const response=await fetch(`/api/star-watcher/rob-pfss/snapshot?${new URLSearchParams({dateUtc:modelDateUtc,relativePath,
        ...(expectedSha256?{expectedSha256}:{}),
        ...(catalog?.catalogSha256?{expectedCatalogSha256:catalog.catalogSha256}:{})})}`,
        {credentials:'include',signal:controller.signal});
      if(!response.ok)throw new Error(`ROB model unavailable (${response.status})`);
      const value=robPfssSnapshotSchema.parse(await response.json());
      if(value.relativePath!==relativePath||
         (catalog?.catalogSha256&&value.catalogSha256!==catalog.catalogSha256)||
         (expectedSha256?value.sourceSha256!==expectedSha256:!catalog?.entries.some(entry=>
           entry.relativePath===relativePath&&entry.magnetogramTimeHintUtc===value.magnetogramTimeHintUtc)))
        throw new Error('ROB model and catalog identity differ');
      if(controller.signal.aborted)return;
      setSelected(value);onSnapshot(value);
      setReceipt(null);setParentReceipt(null);onParentMap(null);onParentRotation(null);
      setMessage(`ROB model ${value.fitsDateObsUtc}: ${value.lines.length} sampled of ${value.totalLines} lines; source SHA-256 ${value.sourceSha256.slice(0,12)}…`);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'ROB model unavailable');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function profileId(){
    let value=readCachedAccountProfileIdentity().profileId;
    if(!value){await fetchAccountCapabilityPolicy();value=readCachedAccountProfileIdentity().profileId;}
    if(!value)throw new Error('Sign in to retain or reopen ROB model bytes.');
    return value;
  }
  async function listRetained(){
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const owner=await profileId();
      const response=await fetch(`/api/star-watcher/rob-pfss/retained-list?${new URLSearchParams({expected_profile_id:owner})}`,
        {credentials:'include',signal:controller.signal});
      if(!response.ok)throw new Error(`Saved ROB models unavailable (${response.status})`);
      const value=robPfssRetainedListSchema.parse(await response.json());
      if(controller.signal.aborted||readCachedAccountProfileIdentity().profileId!==owner)return;
      if(value.entries.some(item=>item.ownerProfileId!==owner))
        throw new Error('Saved ROB model owner differs from the selected profile');
      setRetained(value.entries);setMessage(`${value.entries.length} retained ROB model${value.entries.length===1?'':'s'} listed; source bytes are verified when reopened.`);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Saved ROB models unavailable');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function retain(){
    if(!selected)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const owner=await profileId();
      const response=await fetch('/api/star-watcher/rob-pfss/retain',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({dateUtc:selected.relativePath.slice(0,10).replaceAll('/','-'),
          relativePath:selected.relativePath,expectedSha256:selected.sourceSha256,
          expectedCatalogSha256:selected.catalogSha256})});
      if(!response.ok)throw new Error(`Exact ROB model retention failed (${response.status})`);
      const value=robPfssRetainedReceiptSchema.parse(await response.json());
      if(value.sourceSha256!==selected.sourceSha256||value.catalogSha256!==selected.catalogSha256||
         value.ownerProfileId!==owner)
        throw new Error('Retained ROB model identity differs from selected model');
      if(controller.signal.aborted||readCachedAccountProfileIdentity().profileId!==owner)return;
      setReceipt(value);setRetained(previous=>[value,...previous.filter(item=>item.acquisitionId!==value.acquisitionId)]);
      setMessage(`Retained ROB FITS ${value.sourceSha256.slice(0,12)}… and index ${value.catalogSha256.slice(0,12)}… bytes.`);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'ROB model retention failed');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function reopen(item:RobPfssRetainedReceipt){
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const owner=await profileId();
      const response=await fetch(`/api/star-watcher/rob-pfss/retained?${new URLSearchParams({
        expected_profile_id:owner,acquisitionId:item.acquisitionId})}`,
        {credentials:'include',signal:controller.signal});
      if(!response.ok)throw new Error(`Retained ROB model unavailable (${response.status})`);
      const raw=await response.json();
      const verifiedReceipt=robPfssRetainedReceiptSchema.parse(raw.receipt);
      const snapshot=robPfssSnapshotSchema.parse(raw.snapshot);
      if(item.ownerProfileId!==owner||verifiedReceipt.ownerProfileId!==owner||
         verifiedReceipt.acquisitionId!==item.acquisitionId||
         verifiedReceipt.sourceSha256!==item.sourceSha256||
         verifiedReceipt.catalogSha256!==item.catalogSha256||
         verifiedReceipt.relativePath!==item.relativePath||
         verifiedReceipt.fitsDateObsUtc!==item.fitsDateObsUtc||
         verifiedReceipt.fitsDateObsUtc!==snapshot.fitsDateObsUtc||
         verifiedReceipt.sourceSha256!==snapshot.sourceSha256||
         verifiedReceipt.catalogSha256!==snapshot.catalogSha256||
         snapshot.relativePath!==verifiedReceipt.relativePath)
        throw new Error('Retained ROB model identity mismatch');
      if(controller.signal.aborted||readCachedAccountProfileIdentity().profileId!==owner)return;
      setSelected(snapshot);setReceipt(verifiedReceipt);setParentReceipt(null);
      onSnapshot(snapshot);onParentMap(null);onParentRotation(null);
      setMessage(`Reopened verified ROB FITS and index bytes captured ${verifiedReceipt.retrievedAtUtc}.`);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Retained ROB model unavailable');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function readParent(item:RobPfssRetainedReceipt,controller:AbortController){
    const owner=await profileId();
    const response=await fetch(`/api/star-watcher/rob-pfss/parent?${new URLSearchParams({
      expected_profile_id:owner,acquisitionId:item.acquisitionId})}`,
      {credentials:'include',signal:controller.signal});
    if(!response.ok)throw new Error(`Retained GONG map unavailable (${response.status})`);
    const raw=await response.json();
    const parent=robPfssParentReceiptSchema.parse(raw.receipt);
    const map=solarGlobalRadialMapSchema.parse(raw.map);
    if(parent.modelAcquisitionId!==item.acquisitionId||parent.modelSha256!==item.sourceSha256||
       map.source.sha256!==parent.parentSha256||map.source.sourceUrl!==parent.parentSourceUrl)
      throw new Error('GONG map and ROB model receipt identity mismatch');
    if(controller.signal.aborted||readCachedAccountProfileIdentity().profileId!==owner)return;
    setParentReceipt(parent);onParentMap(map);
    onParentRotation(parent.displayRotation.earthCarringtonLongitudeApproxDeg);
    setMessage(`Reopened candidate GONG mrbqs map: ${parent.mapEpochUtc}; source SHA-256 ${parent.parentSha256.slice(0,12)}…`);
  }
  async function retainParent(){
    if(!receipt)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const owner=await profileId();
      const response=await fetch('/api/star-watcher/rob-pfss/parent/retain',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        signal:controller.signal,body:JSON.stringify({acquisitionId:receipt.acquisitionId})});
      if(!response.ok)throw new Error(`GONG map acquisition failed (${response.status})`);
      const parent=robPfssParentReceiptSchema.parse(await response.json());
      if(parent.modelAcquisitionId!==receipt.acquisitionId||parent.ownerProfileId!==owner)
        throw new Error('GONG parent receipt identity mismatch');
      if(controller.signal.aborted||readCachedAccountProfileIdentity().profileId!==owner)return;
      await readParent(receipt,controller);
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'GONG map acquisition failed');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  async function reopenParent(){
    if(!receipt)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{await readParent(receipt,controller);}
    catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Retained GONG map unavailable');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  return <div className="space-y-2 rounded border border-violet-700/50 p-2">
    <p className="font-medium text-violet-100">ROB whole-Sun PFSS model archive</p>
    <p className="text-slate-400">These are computed field lines from a GONG boundary. Before a paired map is opened, line longitude is in ROB's unrotated Earth-reference display frame on an illustrative sphere. The separately acquired Star Watcher mrzqs map is not placed beneath those lines.</p>
    <div className="flex items-end gap-2"><label className="grid gap-1">Model UTC date
      <input type="date" aria-label="ROB PFSS UTC date" value={dateUtc} max={new Date().toISOString().slice(0,10)}
        onChange={event=>{retireRequest();setDateUtc(event.target.value);
          setCatalog(null);setSelected(null);setReceipt(null);setParentReceipt(null);
          onSnapshot(null);onParentMap(null);onParentRotation(null);
          setMessage('Choose Find models to inspect this UTC date.');}}
        className="rounded border border-slate-600 bg-slate-950 p-1"/></label>
      <button type="button" disabled={busy} onClick={()=>void search()} className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">Find models</button></div>
    <p role="status" className="text-amber-100">{message}</p>
    {catalog&&<p className="break-all text-slate-400">ROB index {catalog.catalogUrl} · checked {catalog.checkedAtUtc} · {catalog.catalogSha256?`SHA-256 ${catalog.catalogSha256}`:'bytes unavailable'}.</p>}
    {catalog&&<div className="max-h-36 space-y-1 overflow-auto">{catalog.entries.map(entry=><button
      key={entry.relativePath} type="button" disabled={busy} onClick={()=>void load(entry.relativePath)}
      className="block w-full rounded border border-slate-700 px-2 py-1 text-left text-violet-100 disabled:opacity-50">
      {entry.magnetogramTimeHintUtc} · {entry.relativePath}</button>)}
      {catalog.truncated&&<p className="text-amber-200">Showing the latest 32 records for this date.</p>}</div>}
    <div className="flex flex-wrap gap-2">
      {selected&&<button type="button" disabled={busy} onClick={()=>void load(selected.relativePath,selected.sourceSha256)}
        className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">Recheck public FITS hash</button>}
      {selected&&!receipt&&<button type="button" disabled={busy} onClick={()=>void retain()}
        className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">Retain model and index bytes</button>}
      {receipt&&!parentReceipt&&<button type="button" disabled={busy} onClick={()=>void retainParent()}
        className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">Retain matching-name GONG map</button>}
      {receipt&&!parentReceipt&&<button type="button" disabled={busy} onClick={()=>void reopenParent()}
        className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">Open retained GONG map</button>}
      <button type="button" disabled={busy} onClick={()=>void listRetained()}
        className="rounded border border-violet-500 px-2 py-1 disabled:opacity-50">List retained models</button>
    </div>
    {retained.length>0&&<div className="max-h-36 space-y-1 overflow-auto">{retained.map(item=><button
      type="button" key={item.acquisitionId} disabled={busy} onClick={()=>void reopen(item)}
      className="block w-full rounded border border-slate-700 px-2 py-1 text-left text-violet-100 disabled:opacity-50">
      Reopen {item.fitsDateObsUtc} · {item.sourceSha256.slice(0,12)}…</button>)}</div>}
    {selected&&<p className="break-all text-slate-400">FITS DATE-OBS {selected.fitsDateObsUtc} · fetched {selected.retrievedAtUtc} · source {selected.modelUrl} · SHA-256 {selected.sourceSha256}. Selected from ROB index {selected.catalogUrl} · index SHA-256 {selected.catalogSha256} · checked {selected.catalogCheckedAtUtc}. {receipt?'Exact model FITS and index bytes are retained in this profile’s local solar cache.':'Use Retain model and index bytes to preserve both sources for replay.'} {parentReceipt?'A matching-name GONG map candidate is retained.':'The GONG map candidate is not yet opened.'} Far-side field is not a simultaneous direct observation.</p>}
    {parentReceipt&&<p className="break-all text-slate-400">Candidate GONG boundary: {parentReceipt.parentSourceUrl} · map time {parentReceipt.mapEpochUtc} · SHA-256 {parentReceipt.parentSha256}. The display rotates ROB line longitude by about {parentReceipt.displayRotation.earthCarringtonLongitudeApproxDeg.toFixed(2)}° from the GONG CRNOW/LONGADJ header; JHelioviewer uses an independent Earth ephemeris, so this is an approximate display transform. The name and time match, but ROB does not publish the input-byte hash. Map-to-line registration and far-side direct coverage remain unverified.</p>}
    {parentReceipt?.temporalSupport&&<p className="break-all text-slate-400">GONG header time support: last contributor {parentReceipt.temporalSupport.lastContributorUtc??'not declared'}; contributing files {parentReceipt.temporalSupport.contributingFileCount??'not declared'}{parentReceipt.temporalSupport.contributorFileListRecordKey?` · file-list record ${parentReceipt.temporalSupport.contributorFileListRecordKey}`:''}. The start of the contributor interval and per-pixel observation times are unavailable from these retained bytes. A full-longitude map grid does not make the far side a simultaneous direct observation.</p>}
  </div>;
}
