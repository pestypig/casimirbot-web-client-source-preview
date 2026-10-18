import React from 'react';
import { solarMagneticArchiveSearchSchema,solarMagneticArchiveAcquisitionReceiptSchema,
  solarMagneticArchiveAcquisitionListSchema,type SolarMagneticArchiveSearch,
  type SolarMagneticArchiveAcquisitionReceipt,type SolarMagneticArchiveAcquisitionList } from '../../../shared/solar-magnetic-archive-directory';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';

const providerNames = { nso_gong: 'NSO/GONG', lmsal_sdo: 'LMSAL / SDO-HMI' } as const;
const kindNames = { derived_global_radial_map: 'Derived global radial-field map',
  measured_visible_disk_los: 'Measured visible-disk line-of-sight magnetogram' } as const;
function receiptQuality(item:SolarMagneticArchiveAcquisitionReceipt){
  return item.hmiHeader
    ?`FITS extension DATE-OBS ${item.hmiHeader.observedAtUtc} · HMI QUALITY ${item.hmiHeader.qualityFlag} (${item.hmiHeader.qualityFlag===0?'zero':'nonzero'}; bits not interpreted) · header DRMS_ID ${item.hmiHeader.drmsId??'unavailable'}`
    :'FITS observation time and quality uninspected';
}

export function SolarMagneticArchiveDirectory({onOpenGongMap,onCompareHmi,gongAcquisitionId}:{
  onOpenGongMap?:(acquisitionId:string)=>void;
  onCompareHmi?:(acquisitionId:string)=>void;
  gongAcquisitionId?:string|null;
}={}) {
  const [dateUtc, setDateUtc] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = React.useState<SolarMagneticArchiveSearch | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acquiring, setAcquiring] = React.useState<string|null>(null);
  const [receipt,setReceipt]=React.useState<SolarMagneticArchiveAcquisitionReceipt|null>(null);
  const [retained,setRetained]=React.useState<SolarMagneticArchiveAcquisitionList|null>(null);
  const [retainedMessage,setRetainedMessage]=React.useState('Checking retained source receipts…');
  const [message, setMessage] = React.useState('Choose a UTC day to search the provider catalogs. Search does not download FITS.');
  const request = React.useRef<AbortController | null>(null);
  const retainedRequest=React.useRef<AbortController|null>(null);
  const accountEpoch=React.useRef(0);
  React.useEffect(() => () => request.current?.abort(), []);
  async function loadRetained(){
    retainedRequest.current?.abort();
    const controller=new AbortController();retainedRequest.current=controller;
    setRetainedMessage('Checking retained source receipts…');
    try{
      const accountResponse=await fetch('/api/account/session',{credentials:'include',signal:controller.signal});
      if(!accountResponse.ok)throw new Error('Developer profile unavailable');
      const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
      if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('Developer profile required');
      const response=await fetch(`/api/star-watcher/magnetic-archive/acquisitions?${new URLSearchParams({expected_profile_id:profileId})}`,
        {credentials:'include',signal:controller.signal});
      if(!response.ok)throw new Error(`Retained source list unavailable (${response.status})`);
      const parsed=solarMagneticArchiveAcquisitionListSchema.parse(await response.json());
      if(!controller.signal.aborted){setRetained(parsed);setRetainedMessage(`${parsed.acquisitions.length} retained source receipt${parsed.acquisitions.length===1?'':'s'}${parsed.truncated?' shown (latest 100)':''}; source bytes are reverified only when opened.`);}
    }catch(error){if(!controller.signal.aborted){setRetained(null);setRetainedMessage(error instanceof Error?error.message:'Retained source list unavailable');}}
    finally{if(retainedRequest.current===controller)retainedRequest.current=null;}
  }
  React.useEffect(()=>{
    void loadRetained();
    const changed=()=>{accountEpoch.current++;request.current?.abort();retainedRequest.current?.abort();setResult(null);setReceipt(null);setRetained(null);setAcquiring(null);
      setRetainedMessage('Account changed; refresh retained sources for the current profile.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return()=>{request.current?.abort();retainedRequest.current?.abort();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);

  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult(null);
    setReceipt(null);
    setMessage('Checking provider catalogs; no data files are being downloaded.');
    try {
      const response = await fetch(`/api/star-watcher/magnetic-archive/search?${new URLSearchParams({ dateUtc })}`,
        { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 400 ? 'Choose a valid UTC date from 2010 through today.' :
        response.status === 403 ? 'Developer session required for archive search.' : 'Archive search request failed.');
      const parsed = solarMagneticArchiveSearchSchema.parse(await response.json());
      if (!controller.signal.aborted) {
        setResult(parsed);
        setMessage(`${parsed.products.length} provider file${parsed.products.length === 1 ? '' : 's'} listed; observation times and quality remain unverified until FITS inspection.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Archive search failed.');
    } finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }

  async function acquire(product:SolarMagneticArchiveSearch['products'][number]){
    const key=`${product.provider}:${product.providerRecordKey}`;
    const epoch=accountEpoch.current;
    setAcquiring(key);setReceipt(null);
    setMessage(`Downloading ${product.filename} with a fixed-provider byte and disk limit…`);
    try{
      const response=await fetch('/api/star-watcher/magnetic-archive/acquire',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({dateUtc:result?.dateUtc,provider:product.provider,providerRecordKey:product.providerRecordKey}),
      });
      if(!response.ok)throw new Error(`Acquisition failed (${response.status}); the provider may be unavailable or disk capacity insufficient.`);
      const next=solarMagneticArchiveAcquisitionReceiptSchema.parse(await response.json());
      if(epoch!==accountEpoch.current)return;
      if(next.provider!==product.provider||next.providerRecordKey!==product.providerRecordKey)
        throw new Error('Acquisition receipt identity mismatch.');
      setReceipt(next);
      setMessage(`Retained ${next.bytes.toLocaleString()} source bytes with SHA-256 ${next.sha256.slice(0,12)}…; ${receiptQuality(next)}. No science admission.`);
      void loadRetained();
    }catch(error){if(epoch===accountEpoch.current)setMessage(error instanceof Error?error.message:'Acquisition failed.');}
    finally{if(epoch===accountEpoch.current)setAcquiring(null);}
  }

  function productCard(product:SolarMagneticArchiveSearch['products'][number]){
    return <li key={`${product.provider}:${product.providerRecordKey}`} className="rounded border border-slate-700 bg-slate-950/70 p-2">
      <p className="font-medium text-cyan-100">{kindNames[product.kind]} · {providerNames[product.provider]}</p>
      <p className="break-all font-mono text-slate-200">{product.providerRecordKey}</p>
      <p className="mt-1 text-slate-400">Filename time hint: {product.filenameTimeHintUtc ?? 'none'} · provider last-modified: {product.upstreamModifiedAt??'unknown'} (not observation time) · FITS observation time: uninspected · quality: uninspected · bytes: {product.byteSize ?? 'unknown'}</p>
      <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-cyan-200 underline">Open provider FITS (may download)</a>
      <button type="button" disabled={!!acquiring} onClick={()=>void acquire(product)}
        className="ml-2 rounded border border-cyan-600 px-2 py-1 text-cyan-100 disabled:opacity-50">
        {acquiring===`${product.provider}:${product.providerRecordKey}`?'Acquiring…':'Acquire exact source bytes'}</button>
    </li>;
  }

  return <section aria-label="Magnetic data directory" className="rounded border border-cyan-700/40 bg-slate-900/60 p-3 text-xs space-y-3">
    <div>
      <h3 className="text-sm font-medium text-cyan-100">Find magnetic data for the globe</h3>
      <p className="mt-1 text-slate-400">Start with the research quantity, then inspect provider records before downloading or building a comparison. This directory does not turn a catalog listing into an observation.</p>
      <p className="mt-1 break-all text-slate-400">Selected GONG globe source: {gongAcquisitionId??'none — open a retained GONG map before comparing HMI LOS pixels'}.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded border border-slate-700 p-2"><p className="font-medium text-slate-100">Global boundary candidate</p>
        <p className="mt-1 text-slate-400">NSO/GONG synoptic radial-field FITS. Derived over time; far-side and polar coverage need inspection.</p></div>
      <div className="rounded border border-slate-700 p-2"><p className="font-medium text-slate-100">Visible-disk measurement candidate</p>
        <p className="mt-1 text-slate-400">SDO/HMI line-of-sight FITS via LMSAL. Not a measured global radial map or coronal line.</p></div>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-slate-300">UTC date
        <input aria-label="Magnetic archive UTC date" type="date" value={dateUtc} max={new Date().toISOString().slice(0, 10)}
          onChange={event => setDateUtc(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" />
      </label>
      <button type="button" disabled={loading || !dateUtc} onClick={() => void search()}
        className="rounded border border-cyan-500/60 bg-cyan-900/30 px-3 py-2 text-cyan-100 disabled:opacity-50">{loading ? 'Searching…' : 'Search provider records'}</button>
    </div>
    <p role="status" className="text-amber-100">{message}</p>
    <div className="rounded border border-slate-700 p-2" aria-label="Retained magnetic source receipts">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium text-slate-100">Retained acquisitions</h4>
        <button type="button" onClick={()=>void loadRetained()} className="rounded border border-cyan-600 px-2 py-1 text-cyan-100">Refresh retained</button></div>
      <p role="status" className="mt-1 text-slate-400">{retainedMessage}</p>
      {retained&&retained.acquisitions.length>0&&<ol className="mt-2 max-h-48 space-y-1 overflow-auto">
        {retained.acquisitions.map(item=><li key={item.acquisitionId} className="break-all rounded border border-slate-700 p-2">
          <p className="font-medium text-cyan-100">{providerNames[item.provider]} · {item.dateUtc} · {kindNames[item.kind]}</p>
          <p className="font-mono text-slate-300">{item.providerRecordKey}</p>
          <p className="font-mono text-slate-300">{item.acquisitionId}</p>
          <p className="text-slate-400">Retained {item.retrievedAtUtc} · provider last-modified {item.upstreamModifiedAt??'unknown'} (not observation time) · {item.bytes.toLocaleString()} bytes · {receiptQuality(item)} · reuse terms unevaluated</p>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">Original provider file (may download)</a>
          {item.provider==='nso_gong'&&onOpenGongMap&&<button type="button" className="mt-1 rounded border border-cyan-500 px-2 py-1 text-cyan-100"
            onClick={()=>onOpenGongMap(item.acquisitionId)}>Reverify and open GONG display map</button>}
          {item.provider==='lmsal_sdo'&&onCompareHmi&&<button type="button" disabled={!gongAcquisitionId}
            title={!gongAcquisitionId?'Open a retained GONG map first':undefined}
            className="mt-1 rounded border border-cyan-500 px-2 py-1 text-cyan-100 disabled:opacity-50"
            onClick={()=>onCompareHmi(item.acquisitionId)}>Compare retained HMI LOS to selected GONG map</button>}
        </li>)}
      </ol>}
    </div>
    {result && <div className="space-y-3">
      <p className="text-slate-400">Checked {result.checkedAtUtc}. File-name times are hints, not FITS observation times. Search results have no downloaded bytes, content hash, quality inspection or scientific admission.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {result.providers.map(provider => <div key={provider.provider} className="rounded border border-slate-700 p-2">
          <p className="font-medium text-slate-100">{providerNames[provider.provider]} · {provider.status.replaceAll('_', ' ')}</p>
          <p className="mt-1 text-slate-400">{provider.reason === 'none' ? 'Catalog path responded.' : provider.reason === 'transport_error' ? 'Transport failed; this does not establish that the data are absent.' : provider.reason.replaceAll('_', ' ')}</p>
          <a href={provider.catalogUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-cyan-200 underline">Open provider catalog/path</a>
          <p className="mt-1 text-slate-400">Reuse/redistribution terms have not been evaluated.</p>
          <a href={provider.providerInformationUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-cyan-200 underline">Provider data information</a>
        </div>)}
      </div>
      {result.truncated && <p className="text-amber-200">Showing the latest 24 GONG filename entries for this day; the provider directory may contain more.</p>}
      {result.products.length === 0 ? <p className="text-slate-400">No provider file was confirmed by this bounded search. Check each provider status before interpreting absence.</p> : <>
        <div>
          <h4 className="mb-1 font-medium text-slate-100">Visible-disk HMI measurement</h4>
          {result.products.some(product=>product.provider==='lmsal_sdo')
            ?<ol className="space-y-2" aria-label="HMI visible-disk products">{result.products.filter(product=>product.provider==='lmsal_sdo').map(productCard)}</ol>
            :<p className="text-slate-400">No HMI file confirmed; inspect provider status above.</p>}
        </div>
        <div>
          <h4 className="mb-1 font-medium text-slate-100">GONG global radial-map candidates ({result.products.filter(product=>product.provider==='nso_gong').length})</h4>
          <ol className="max-h-80 space-y-2 overflow-auto" aria-label="GONG global radial-map products">
            {result.products.filter(product=>product.provider==='nso_gong').map(productCard)}
          </ol>
        </div>
      </>}
      {receipt&&<div className="break-all rounded border border-emerald-700/60 p-2 text-emerald-100" aria-label="Magnetic acquisition receipt">
        <p>Raw source retained · {receipt.acquisitionId}</p><p>SHA-256 {receipt.sha256} · {receipt.bytes.toLocaleString()} bytes · retrieved {receipt.retrievedAtUtc} · provider last-modified {receipt.upstreamModifiedAt??'unknown'} (not observation time)</p>
        <p>{receiptQuality(receipt)}. Reuse rights: unevaluated. Not yet a globe input or scientific admission.</p>
        {receipt.provider==='nso_gong'&&onOpenGongMap&&<button type="button" className="mt-2 rounded border border-cyan-400 px-2 py-1 text-cyan-100"
          onClick={()=>onOpenGongMap(receipt.acquisitionId)}>Prepare and open GONG display map on globe</button>}
        {receipt.provider==='lmsal_sdo'&&onCompareHmi&&<button type="button" disabled={!gongAcquisitionId}
          title={!gongAcquisitionId?'Open a retained GONG map first':undefined}
          className="mt-2 rounded border border-cyan-400 px-2 py-1 text-cyan-100 disabled:opacity-50"
          onClick={()=>onCompareHmi(receipt.acquisitionId)}>Prepare HMI LOS comparison on selected globe</button>}
      </div>}
      <p className="text-amber-200">For the current globe, inspect the retained FITS and run the bounded GONG/HMI preparation pipeline. A provider listing or raw-byte receipt alone cannot load or validate the globe.</p>
    </div>}
  </section>;
}
