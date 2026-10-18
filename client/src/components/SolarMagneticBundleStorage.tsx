import React from 'react';
import {prepareSolarMagneticComparisonBundle,verifySolarMagneticComparisonBundle,
  type SolarMagneticComparisonBundlePayload} from '../../../shared/solar-magnetic-comparison-bundle';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';

/** Explicit owner-profile save/reopen; the MCP connection remains independently authorized. */
export function SolarMagneticBundleStorage({payload,onReopen}:{
  payload:SolarMagneticComparisonBundlePayload|null;onReopen:(bundle:Awaited<ReturnType<typeof verifySolarMagneticComparisonBundle>>)=>void;
}){
  const [id,setId]=React.useState(''),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(false);
  const request=React.useRef<AbortController>();
  const epoch=React.useRef(0);
  React.useEffect(()=>{
    const changed=()=>{epoch.current++;request.current?.abort();setId('');setBusy(false);
      setMessage('Account changed. Check any uncertain save before retrying.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>{epoch.current++;request.current?.abort();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);
  async function operate(save:boolean){
    if(busy||save&&!payload)return;
    const selected=++epoch.current,controller=new AbortController();request.current=controller;
    const current=()=>selected===epoch.current&&!controller.signal.aborted;
    setBusy(true);setMessage('Checking signed-in developer account…');
    try{
      const selectedId=id;
      if(!save&&!/^solar-magnetic-bundle:[a-f0-9]{64}$/.test(selectedId))
        throw new Error('An exact retained bundle ID is required');
      const accountResponse=await fetch('/api/account/session',{signal:controller.signal});
      if(!accountResponse.ok)throw new Error('Account status unavailable');
      const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
      if(!current())return;
      if(!profileId||account.account_policy?.account_type!=='developer')
        throw new Error('A signed-in developer account is required');
      const bundle=save?await prepareSolarMagneticComparisonBundle(payload!):null;
      if(!current())return;
      const expectedId=bundle?.bundleId??selectedId;
      const response=await fetch(save?'/api/account/solar-research/magnetic-bundles':
        `/api/account/solar-research/magnetic-bundles?${new URLSearchParams({expected_profile_id:profileId,bundleId:expectedId})}`,
        save?{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
          body:JSON.stringify({expected_profile_id:profileId,bundleJson:JSON.stringify(bundle)})}:{signal:controller.signal});
      const result=await response.json();if(!current())return;
      if(!response.ok||result.ok!==true)throw new Error(result.error??'Magnetic bundle archive unavailable');
      if(result.profileId!==profileId||result.bundleId!==expectedId||result.scientificAdmission!==false||
        result.scienceRunAllowed!==false)throw new Error('Bundle response identity or claim boundary rejected');
      if(save){
        if(result.saved!==true)throw new Error('Bundle save receipt rejected');
        setId(expectedId);setMessage(`Retained magnetic comparison ${expectedId}. No scientific admission.`);
      }else{
        if(typeof result.bundleJson!=='string')throw new Error('Bundle archive content missing');
        const reopened=await verifySolarMagneticComparisonBundle(JSON.parse(result.bundleJson));
        if(!current())return;
        if(reopened.bundleId!==expectedId)throw new Error('Bundle archive integrity rejected');
        onReopen(reopened);setMessage('Verified retained magnetic comparison reopened; source authenticity and fit remain unverified.');
      }
    }catch(error){if(current())setMessage(error instanceof Error?error.message:'Magnetic bundle archive unavailable');}
    finally{if(current())setBusy(false);}
  }
  return <div className="space-y-2 border-t border-slate-700 pt-2" aria-label="Profile magnetic bundle storage">
    <p className="text-slate-400">Optional developer-profile retention. Saving does not grant MCP access or scientific admission.</p>
    <button type="button" disabled={busy||!payload} onClick={()=>void operate(true)} className="rounded border border-cyan-600 px-2 py-1 disabled:opacity-50">Save comparison to profile</button>
    <label className="block">Retained bundle ID
      <input aria-label="Retained magnetic bundle ID" value={id} onChange={event=>setId(event.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-900 p-1" placeholder="solar-magnetic-bundle:…" />
    </label>
    <button type="button" disabled={busy} onClick={()=>void operate(false)} className="rounded border border-cyan-600 px-2 py-1 disabled:opacity-50">Reopen retained comparison</button>
    {message&&<p role="status" className="break-all text-slate-300">{message}</p>}
  </div>;
}
