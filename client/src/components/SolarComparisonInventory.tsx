import React,{useEffect,useRef,useState} from 'react';
import {SolarComparisonInputInventory,type SolarComparisonInputInventoryView} from '../../../shared/solar-comparison-input-inventory';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';
export function SolarComparisonInventory(){
  const [inventory,setInventory]=useState<SolarComparisonInputInventoryView>();
  const [error,setError]=useState('');const generation=useRef(0);const picker=useRef<HTMLInputElement>(null);
  useEffect(()=>{const clear=()=>{generation.current++;setInventory(undefined);setError('Account changed; input inventory cleared.');if(picker.current)picker.current.value='';};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);
    return()=>{generation.current++;window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);};},[]);
  async function load(file?:File){const request=++generation.current;setInventory(undefined);setError('');
    try{if(!file||file.size>60_000)throw Error('Choose an input inventory JSON no larger than 60 KB.');
      const text=await file.text();if(new TextEncoder().encode(text).byteLength>60_000)throw Error('Inventory exceeds 60 KB.');
      const parsed=SolarComparisonInputInventory.parse(JSON.parse(text));if(request===generation.current)setInventory(parsed);
    }catch{if(request===generation.current)setError('Invalid or oversized input inventory; no scientific authority accepted.');}}
  return <div className="space-y-2 text-sm">
    <label>Inspect saved input inventory (local JSON, maximum 60 KB)
      <input ref={picker} aria-label="Comparison input inventory" type="file" accept=".json,application/json"
        className="block w-full" onChange={event=>{void load(event.target.files?.[0]);}}/></label>
    <p className="text-xs text-slate-400">Imported audit declarations, not a live disk scan or authenticated solver provenance. File hashes are displayed, not independently checked here.</p>
    {error&&<p role="alert" className="text-amber-200">{error}</p>}
    {inventory&&<div className="space-y-2">
      <p>Inventory inspection time: {inventory.inspectedAt}</p><p>{inventory.scope}</p>
      <ul className="space-y-2">{inventory.inputs.map(row=><li key={row.role} className="break-all">
        <strong>{row.role}</strong>: {row.file} · {row.bytes} bytes<br/>Declared SHA-256: {row.sha256}
      </li>)}</ul>
      <p className="text-amber-200">This inventory supplies no bound candidate, reference, prediction or residual. No science execution or G1 admission is authorized.</p>
    </div>}
  </div>;
}
