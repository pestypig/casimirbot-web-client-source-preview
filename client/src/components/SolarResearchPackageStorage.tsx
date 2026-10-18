import React,{useEffect,useRef,useState} from 'react';
import {verifySolarResearchEvidencePackage} from '../../../shared/solar-research-evidence-package';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';
import {solarPackageCatalogSchema,type SolarPackageCatalog} from '../../../shared/solar-package-catalog';

async function packageId(text:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return 'solar-package:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function SolarResearchPackageStorage({packageJson,onReopen,contextRevision=0}:{
  packageJson?:string;onReopen?:(text:string)=>void;contextRevision?:number;
}) {
  const [id,setId]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [catalog,setCatalog]=useState<SolarPackageCatalog|null>(null);
  const request=useRef<AbortController>();
  const epoch=useRef(0);
  function invalidate() {epoch.current++;request.current?.abort();setBusy(false);}
  useEffect(()=>{
    invalidate();setMessage('');setCatalog(null);
    return ()=>{epoch.current++;request.current?.abort();};
  },[packageJson,contextRevision]);
  useEffect(()=>{
    const changed=()=>{invalidate();setId('');setCatalog(null);setMessage('Account changed. Check any uncertain save before retrying.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>{epoch.current++;request.current?.abort();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);
  async function list(offset=0) {
    if(busy)return;
    const selected=++epoch.current,controller=new AbortController();request.current=controller;
    const current=()=>selected===epoch.current&&!controller.signal.aborted;
    setBusy(true);setCatalog(null);setMessage('Checking signed-in developer account…');
    try {
      const response=await fetch('/api/account/session',{signal:controller.signal});
      if(!response.ok)throw new Error('Account status unavailable');
      const account=await response.json(),profileId=account.session?.profile?.profile_id;
      if(!current())return;
      if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('A signed-in developer account is required');
      const reply=await fetch(`/api/account/solar-research/packages?${new URLSearchParams({expected_profile_id:profileId,offset:String(offset),limit:'10'})}`,{signal:controller.signal});
      const result=await reply.json();if(!current())return;
      if(!reply.ok||result.ok!==true)throw new Error(result.error??'Package catalog unavailable');
      const {ok,profileId:returnedProfile,...payload}=result;
      if(returnedProfile!==profileId)throw new Error('Package catalog account changed');
      const page=solarPackageCatalogSchema.parse(payload);
      if(page.offset!==offset||page.packages.length>10)throw new Error('Package catalog page rejected');
      setCatalog(page);setMessage('Selected retained package page verified; other pages not inspected. No scientific admission.');
    }catch(error){if(current())setMessage(error instanceof Error?error.message:'Package catalog unavailable');}
    finally{if(current())setBusy(false);}
  }
  async function operate(save:boolean) {
    if(busy || (save&&!packageJson))return;
    const selected=++epoch.current,controller=new AbortController();request.current=controller;
    const current=()=>selected===epoch.current&&!controller.signal.aborted;
    const selectedId=id,selectedPackage=packageJson;
    setBusy(true);setMessage('Checking signed-in developer account…');
    try {
      if(!save&&!/^solar-package:[a-f0-9]{64}$/.test(selectedId))throw new Error('An exact retained package ID is required');
      const accountResponse=await fetch('/api/account/session',{signal:controller.signal});
      if(!accountResponse.ok)throw new Error('Account status unavailable');
      const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
      if(!current())return;
      if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('A signed-in developer account is required');
      let expectedId=selectedId,expectedIndex:string|undefined;
      if(save) {
        const verified=await verifySolarResearchEvidencePackage(selectedPackage!);
        expectedIndex=verified.indexId;expectedId=await packageId(selectedPackage!);
        if(!current())return;
      }
      const response=await fetch(save?'/api/account/solar-research/packages':
        `/api/account/solar-research/packages?${new URLSearchParams({expected_profile_id:profileId,packageId:expectedId})}`,
        save?{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
          body:JSON.stringify({expected_profile_id:profileId,packageJson:selectedPackage})}:{signal:controller.signal});
      const result=await response.json();
      if(!current())return;
      if(!response.ok||!result.ok)throw new Error(result.error??result.receipt?.error??'Package archive unavailable');
      if(result.profileId!==profileId||result.packageId!==expectedId||result.scientificAdmission!==false||result.scienceRunAllowed!==false)
        throw new Error('Package response identity or claim boundary rejected');
      if(save) {
        if(!result.saved||result.indexId!==expectedIndex)throw new Error('Package save receipt rejected');
        setId(expectedId);setMessage(`Retained package: ${expectedId}. No scientific admission.`);
      } else {
        if(typeof result.packageJson!=='string')throw new Error('Package archive content missing');
        const verified=await verifySolarResearchEvidencePackage(result.packageJson);
        if(verified.indexId!==result.indexId||await packageId(result.packageJson)!==expectedId)throw new Error('Package archive integrity rejected');
        if(!current())return;
        setMessage('Verified retained package reopened. Archive context, not a live measurement.');onReopen?.(result.packageJson);
      }
    } catch(error) {if(current())setMessage(error instanceof Error?error.message:'Package archive unavailable');}
    finally {if(current())setBusy(false);}
  }
  return <section className="space-y-2 text-xs" aria-label="Profile evidence package storage">
    <p>Profile archive access is explicit and developer-only. Account quota still applies; no MCP consent or model execution is granted.</p>
    <button type="button" disabled={busy} onClick={()=>void list()}>List retained evidence packages</button>
    {catalog&&<div aria-label="Retained evidence package catalog">
      <p>{catalog.totalPackages} owner package manifest(s); this page is verified. Ordered by exact package ID, not acquisition date. Integrity verification is not source authentication.</p>
      {catalog.packages.map(item=><div key={item.packageId}>
        <button type="button" disabled={busy} onClick={()=>{invalidate();setId(item.packageId);setMessage('Package selected; reopen explicitly to inspect its contents.');}}>Select {item.packageId}</button>
        <p>{item.comparisonRows} comparison rows · {item.totalBytes} bytes · archive {item.archiveId??'absent'} · literature {item.literatureId??'absent'} · benchmark {item.benchmarkId??'absent'}</p>
      </div>)}
      {catalog.nextOffset!==null&&<button type="button" disabled={busy} onClick={()=>void list(catalog.nextOffset!)}>Next retained package page</button>}
    </div>}
    {packageJson&&<button type="button" disabled={busy} onClick={()=>void operate(true)}>Retain evidence package in profile</button>}
    <label>Retained evidence package ID<input aria-label="Retained evidence package ID" value={id} onChange={event=>{
      invalidate();setMessage('');setId(event.target.value);
    }} className="block w-full bg-slate-950" /></label>
    {onReopen&&<button type="button" disabled={busy} onClick={()=>void operate(false)}>Reopen retained evidence package</button>}
    <p aria-live="polite">{message}</p>
  </section>;
}
