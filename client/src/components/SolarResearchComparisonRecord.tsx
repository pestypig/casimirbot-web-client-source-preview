import React, { useEffect, useRef, useState } from 'react';
import { SolarPrimaryComparisonRecordSchema, type SolarPrimaryComparisonRecord } from '../../../shared/solar-research-comparison';
import { prepareSolarResearchExport, verifySolarResearchExport } from '../../../shared/solar-research-export';
import { prepareSolarResearchFigure } from '../../../shared/solar-research-figure';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';
import {prepareSolarBenchmarkSelection} from '../../../shared/solar-research-benchmark';
import {prepareSolarResearchLiterature} from '../../../shared/solar-research-literature';
import {SolarResearchEvidenceIndex} from './SolarResearchEvidenceIndex';

export function SolarResearchComparisonRecord({observationArchive,selectedRecordId,selectedLocalBundle}:{observationArchive?:unknown;selectedRecordId?:string;selectedLocalBundle?:unknown}={}) {
  const [record,setRecord]=useState<SolarPrimaryComparisonRecord>();
  const [message,setMessage]=useState('No research record loaded. No model result is implied.');
  const [recordInput,setRecordInput]=useState('');
  const generation=useRef(0);
  const [prepared,setPrepared]=useState<Awaited<ReturnType<typeof prepareSolarResearchExport>>>();
  const [exportMessage,setExportMessage]=useState('');
  const [figure,setFigure]=useState<Awaited<ReturnType<typeof prepareSolarResearchFigure>>>();
  const [literature,setLiterature]=useState<Awaited<ReturnType<typeof prepareSolarResearchLiterature>>>();
  const [retentionMessage,setRetentionMessage]=useState('');
  const [retaining,setRetaining]=useState(false);
  const retentionRequest=useRef<AbortController>();
  const [archive,setArchive]=useState<Array<{recordId:string;createdAt:string;fixtureOnly:boolean}>>([]);
  const [archiveNext,setArchiveNext]=useState<number|null>(null);
  const [benchmarkInput,setBenchmarkInput]=useState('');
  const [benchmark,setBenchmark]=useState<Awaited<ReturnType<typeof prepareSolarBenchmarkSelection>>>();
  const [benchmarkMessage,setBenchmarkMessage]=useState('');
  const benchmarkGeneration=useRef(0);
  async function prepareBenchmark() {
    if(!prepared)return;
    const selected=generation.current;const attempt=++benchmarkGeneration.current;
    setBenchmark(undefined);setBenchmarkMessage('Checking declared frozen selection…');
    try {
      if(new TextEncoder().encode(benchmarkInput).length>64_000)throw new Error('Benchmark selection exceeds 64 KB');
      const output=await prepareSolarBenchmarkSelection(prepared,JSON.parse(benchmarkInput));
      if(selected!==generation.current || attempt!==benchmarkGeneration.current)return;
      setBenchmark(output);setBenchmarkMessage('Selection replay prepared locally. Freeze/availability declarations are not authenticated preregistration; no validation score or scientific admission.');
    } catch(error) {
      if(selected===generation.current && attempt===benchmarkGeneration.current)setBenchmarkMessage(error instanceof Error?error.message:'Selection rejected');
    }
  }
  useEffect(()=>{
    const invalidate=()=>{generation.current++;benchmarkGeneration.current++;retentionRequest.current?.abort();};
    const changed=()=>{
      invalidate();setRecord(undefined);setRecordInput('');setPrepared(undefined);setFigure(undefined);setLiterature(undefined);
      setExportMessage('');setBenchmark(undefined);setBenchmarkInput('');setBenchmarkMessage('');
      setMessage('Account changed; research record and derived artifacts cleared.');
      setRetaining(false);setArchive([]);setArchiveNext(null);setRetentionMessage('Account changed; any in-flight retention outcome must be checked before retrying.');
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>{invalidate();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);
  async function openArchive(recordId?:string,offset=0) {
    if(retaining)return;
    const selected=generation.current;
    const request=new AbortController();retentionRequest.current=request;
    setRetaining(true);setRetentionMessage('Reading signed-in research archive…');
    if(!recordId){setArchive([]);setArchiveNext(null);}
    try {
      const accountResponse=await fetch('/api/account/session',{signal:request.signal});
      if(!accountResponse.ok)throw new Error('Account status unavailable');
      const account=await accountResponse.json();const profileId=account.session?.profile?.profile_id;
      if(!profileId || account.account_policy?.account_type!=='developer')throw new Error('A signed-in developer account is required for research archive access');
      if(request.signal.aborted || selected!==generation.current)return;
      const query=new URLSearchParams({expected_profile_id:profileId,...(recordId?{recordId}:{offset:String(offset),limit:'10'})});
      const response=await fetch(`/api/account/solar-research/records?${query}`,{signal:request.signal});
      const result=await response.json();
      if(request.signal.aborted || selected!==generation.current)return;
      if(!response.ok || !result.ok || result.profileId!==profileId)throw new Error(result.error ?? 'Archive response owner rejected');
      if(recordId) {
        const verified=await verifySolarResearchExport(result.bundle);
        if(verified.recordId!==recordId || result.recordId!==recordId)throw new Error('Archive record identity rejected');
        if(request.signal.aborted || selected!==generation.current)return;
        const text=JSON.stringify(result.bundle);
        await ingest({size:new TextEncoder().encode(text).length,text:async()=>text});
      } else {
        if(!Array.isArray(result.records) || result.records.length>10 || result.records.some((item:any)=>
          !/^solar-primary:[a-f0-9]{64}$/.test(item.recordId) || typeof item.createdAt!=='string' || typeof item.fixtureOnly!=='boolean'))
          throw new Error('Archive inventory rejected');
        if(result.nextOffset!==null && (!Number.isInteger(result.nextOffset)||result.nextOffset<0||result.nextOffset>99))
          throw new Error('Archive pagination rejected');
        setArchive(result.records);setArchiveNext(result.nextOffset);
        setRetentionMessage(`${result.totalRecords} verified retained records; ${result.rejectedCount} rejected entries. Archive integrity is not scientific admission.`);
      }
    } catch(error) {
      if(!request.signal.aborted && selected===generation.current)setRetentionMessage(error instanceof Error?error.message:'Archive unavailable');
    } finally {if(retentionRequest.current===request)setRetaining(false);}
  }
  useEffect(() => {
    if (selectedRecordId) void openArchive(selectedRecordId);
  }, [selectedRecordId]);
  useEffect(() => {
    if (!selectedLocalBundle) return;
    const text = JSON.stringify(selectedLocalBundle);
    void ingest({ size: new TextEncoder().encode(text).length, text: async () => text });
  }, [selectedLocalBundle]);
  async function retain() {
    if(!prepared || retaining)return;
    const bundle=prepared;const selected=generation.current;
    const request=new AbortController();retentionRequest.current=request;
    setRetaining(true);setRetentionMessage('Checking signed-in developer account…');
    try {
      const accountResponse=await fetch('/api/account/session',{signal:request.signal});
      if(!accountResponse.ok)throw new Error('Account status unavailable');
      const account=await accountResponse.json();
      const profileId=account.session?.profile?.profile_id;
      if(!profileId || account.account_policy?.account_type!=='developer')throw new Error('A signed-in developer account is required for research retention');
      if(request.signal.aborted || selected!==generation.current)return;
      const response=await fetch('/api/account/solar-research/records',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expected_profile_id:profileId,bundle}),signal:request.signal});
      const result=await response.json();
      if(request.signal.aborted || selected!==generation.current)return;
      if(!response.ok || !result.ok || !result.saved)throw new Error(result.error ?? result.receipt?.error ?? 'Research retention failed');
      if(result.recordId!==bundle.recordId || result.scienceRunAllowed!==false || result.admissionAllowed!==false)
        throw new Error('Retention receipt identity or claim boundary rejected');
      setRetentionMessage(`Retained in profile ${profileId}: ${result.recordId}. No scientific admission or solver execution.`);
    } catch(error) {
      if(!request.signal.aborted && selected===generation.current)setRetentionMessage(error instanceof Error?error.message:'Retention unavailable');
    } finally {
      if(retentionRequest.current===request)setRetaining(false);
    }
  }
  async function prepare() {
    if (!record) return;
    const selected=generation.current;
    setPrepared(undefined);setFigure(undefined);setLiterature(undefined);setExportMessage('Preparing artifacts…');
    setBenchmark(undefined);setBenchmarkMessage('');
    try {
      const output=await prepareSolarResearchExport(record);
      const figureOutput=await prepareSolarResearchFigure(output);
      const literatureOutput=await prepareSolarResearchLiterature(output);
      if (selected!==generation.current) return;
      setPrepared(output);setFigure(figureOutput);setLiterature(literatureOutput);setExportMessage('Artifacts prepared locally; no file has been saved or published.');
    } catch(error) {
      if (selected===generation.current) setExportMessage(error instanceof Error?error.message:'Export preparation failed');
    }
  }
  async function ingest(file?: Pick<File,'size'|'text'>) {
    if (!file) return;
    const selected=++generation.current;
    retentionRequest.current?.abort();setRetaining(false);setRetentionMessage('');
    setBenchmark(undefined);setBenchmarkInput('');setBenchmarkMessage('');
    setPrepared(undefined);setFigure(undefined);setLiterature(undefined);setExportMessage('');
    setRecord(undefined);setMessage('Reading selected record…');
    try {
      if (file.size>64_000) throw new Error('Research record exceeds 64 KB');
      const text=await file.text();
      if (new TextEncoder().encode(text).length>64_000) throw new Error('Research record exceeds 64 KB');
      const input=JSON.parse(text);
      const isBundle=input && typeof input==='object' && 'recordId' in input;
      const verified=isBundle?await verifySolarResearchExport(input):undefined;
      const parsed=SolarPrimaryComparisonRecordSchema.safeParse(verified?.record ?? input);
      if (!parsed.success) throw new Error('Invalid research record: provenance, conventions or residuals rejected');
      if (selected!==generation.current) return;
      setRecord(parsed.data);setMessage((verified?'Bundle integrity verified; source identity remains declared. ':'')+(parsed.data.modelDifference
        ? 'Primary-term diagnostic only; not a complete observational residual or G1 acceptance.'
        : 'Observations loaded. Model/reference difference missing; predictions and residuals unavailable.'));
    } catch(error) {
      if (selected===generation.current) setMessage(error instanceof Error?error.message:'Record rejected');
    }
  }
  return <section className="space-y-3 border-t border-slate-700 pt-4">
    <h3 className="font-semibold">Operator-aware research record</h3>
    <p className="text-sm text-slate-400">Local replay of solar-primary-comparison-record/1. Source identities are declarations, not scientific admission. This view does not execute a solver or averaging kernels.</p>
    <label className="block text-sm">Research comparison record or export bundle (maximum 64 KB)
      <input aria-label="Research comparison record" type="file" accept=".json,application/json"
        className="block w-full" onChange={event=>{const file=event.target.files?.[0];event.target.value='';void ingest(file);}} />
    </label>
    <details className="space-y-2">
      <summary>Paste a research record or replay bundle</summary>
      <p className="text-xs text-slate-400">Local import only; no network upload or profile save. The same 64 KB, provenance and replay-integrity checks apply as file import. Editing this draft does not replace the loaded record until you import it.</p>
      <label className="block text-sm">Research record JSON
        <textarea aria-label="Pasted research record JSON" maxLength={64000} value={recordInput}
          onChange={event=>setRecordInput(event.target.value)} className="block w-full h-32 bg-slate-950 text-xs" />
      </label>
      <button type="button" disabled={!recordInput.trim()} onClick={()=>{
        const text=recordInput;
        void ingest({size:new TextEncoder().encode(text).length,text:async()=>text});
      }}>Import pasted research JSON</button>
      <button type="button" disabled={!recordInput} onClick={()=>setRecordInput('')}>Clear import draft</button>
    </details>
    <p aria-live="polite" className="text-sm text-amber-200">{message}</p>
    <button type="button" disabled={retaining} className="border border-slate-600 rounded px-3 py-2 text-sm"
      onClick={()=>{void openArchive();}}>List retained research comparisons</button>
    {archive.length>0 && <ul className="text-xs space-y-2">{archive.map(item=><li key={item.recordId} className="break-all">
      <button type="button" disabled={retaining} onClick={()=>{void openArchive(item.recordId);}}>Reopen {item.recordId}</button>
      <span> · created {item.createdAt}{item.fixtureOnly?' · UI fixture, not scientific evidence':''}</span>
    </li>)}</ul>}
    {archiveNext!==null && <button type="button" disabled={retaining} onClick={()=>{void openArchive(undefined,archiveNext);}}>Next archive page</button>}
    <p aria-live="polite" className="text-xs text-slate-400">{retentionMessage}</p>
    {record && <>
      {record.fixtureOnly && <p className="text-amber-200 font-semibold">UI TEST FIXTURE — not scientific evidence</p>}
      <dl className="text-xs space-y-1 break-all">
        <dt>Record creation time (not observation acquisition)</dt><dd>{record.createdAt}</dd>
        <dt>Observation identity / SHA256</dt><dd>{record.observation.id} / {record.observation.sha256}</dd>
        <dt>Kernel identity / SHA256</dt><dd>{record.kernels.id} / {record.kernels.sha256}</dd>
        <dt>Operator / source SHA256</dt><dd>{record.operator} / {record.operatorSha256}</dd>
        <dt>Model/reference difference</dt><dd>{record.modelDifference?`${record.modelDifference.id} / ${record.modelDifference.sha256}`:'Unavailable'}</dd>
        <dt>Quantity and coordinates</dt><dd>Δc² / BP04 c² · dimensionless · r / historical BP04 radius ({record.referenceRadiusM} m)</dd>
        <dt>Required full kernel support</dt><dd>{record.fullKernelSupport.join(' to ')}</dd>
      </dl>
      <p className="text-sm text-amber-200">Quoted solution errors only; covariance and systematic errors unavailable. Cross terms omitted; reference profile unbound. No fit score or acceptance decision.</p>
      <div className="overflow-x-auto max-h-80">
        <table className="text-xs w-full"><caption>Observed inversion and primary-term diagnostic (observed minus prediction)</caption>
          <thead><tr>{['Author row','Localization r/R (second quartile)','Observed Δc²/c²','Quoted error','Primary prediction','Residual'].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
          <tbody>{record.rows.map(row=><tr key={row.authorRow}>
            {[row.authorRow,row.secondQuartileRadius,row.observed,row.quotedSolutionError,row.primaryPrediction,row.residual].map((value,index)=><td key={index} className="p-2">{value===null?'Unavailable':value}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <button type="button" className="border border-slate-600 rounded px-3 py-2 text-sm" onClick={()=>{void prepare();}}>Prepare replay JSON and table CSV</button>
      <p aria-live="polite" className="text-xs text-slate-400">{exportMessage}</p>
      {prepared && <button type="button" disabled={retaining} className="border border-slate-600 rounded px-3 py-2 text-sm"
        onClick={()=>{void retain();}}>Retain comparison in developer profile</button>}
      {figure && <figure>
        <img className="w-full max-w-5xl" style={{width:'100%',maxWidth:960,height:'auto'}} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.figureSvg)}`}
          alt="BiSON primary-term diagnostic: observed point estimates with quoted vertical errors; no joint confidence band or fit decision" />
        <figcaption className="text-xs text-amber-200">Unconnected point estimates at second-quartile localization radii, not a resolved radial profile. Figure identity and recipe are retained in its manifest. Prediction and residual uncertainty are not bound.</figcaption>
      </figure>}
      {prepared && <section id="solar-compare-package" aria-label="Prepare a research evidence package" className="space-y-2 scroll-mt-24 rounded border border-cyan-700/50 p-3">
        <h3 className="text-sm font-semibold">Connect this record to observation context</h3>
        <p className="text-xs text-slate-300">The prepared comparison stays separate from the selected SunPy image and HEK event. Package them together only as replayable context; this does not calculate a solar-interior correlation.</p>
        <SolarResearchEvidenceIndex bundle={prepared} archive={observationArchive} literature={literature} benchmark={benchmark} />
      </section>}
      {prepared && <details className="space-y-2">
        <summary>Inspect prepared artifacts</summary>
        <p className="text-xs break-all">Content identity: {prepared.recordId}</p>
        <p className="text-xs text-amber-200">Keep the manifest with the table. Missing predictions are empty cells, not zeros. Check source reuse terms before sharing author-derived data.</p>
        {literature?<section className="text-xs space-y-2">
          <p>Paper context: <a href="https://arxiv.org/abs/0905.0651v2" target="_blank" rel="noopener noreferrer">Basu et al. (2009), Fresh insights on the structure of the solar core</a> · Section III and Table 3.</p>
          <p>Relative author-file c² solutions are not the absolute Table 3 profiles. This citation is method/row-alignment context, not source authentication, redistribution permission or intervention validation.</p>
          <label className="block">Paper-context replay bundle JSON<textarea aria-label="Paper-context replay bundle JSON" readOnly value={JSON.stringify(literature)} className="block w-full h-32 bg-slate-950 text-xs" /></label>
          <label className="block">Paper citation BibTeX<textarea aria-label="Paper citation BibTeX" readOnly value={literature.bibtex} className="block w-full h-32 bg-slate-950 text-xs" /></label>
        </section>:<p className="text-xs text-amber-200">No mapped paper-context sidecar for these source identities. A citation is not inferred from visual or numerical similarity.</p>}
        <label className="block text-sm">Declared frozen benchmark selection JSON (solar-benchmark-selection/1)
          <textarea aria-label="Benchmark selection JSON" maxLength={64000} value={benchmarkInput}
            onChange={event=>{benchmarkGeneration.current++;setBenchmarkInput(event.target.value);setBenchmark(undefined);setBenchmarkMessage('');}}
            className="block w-full h-32 bg-slate-950 text-xs" />
        </label>
        <p className="text-xs text-amber-200">Account for every author row; declare calibration/evaluation/exclusions, freeze and information-cutoff times, and input availability. Overlapping kernels are not independent holdout samples.</p>
        <button type="button" onClick={()=>{benchmarkGeneration.current++;setBenchmark(undefined);setBenchmarkMessage('Fill the placeholders before validation; this template is not a frozen study.');
          setBenchmarkInput(JSON.stringify({schemaVersion:'solar-benchmark-selection/1',recordId:prepared.recordId,question:'DECLARE THE RESEARCH QUESTION',
            frozenAt:'DECLARE UTC FREEZE TIME',informationCutoff:'DECLARE UTC INFORMATION CUTOFF',observationAvailableAt:'DECLARE UTC AVAILABILITY',
            kernelsAvailableAt:'DECLARE UTC AVAILABILITY',modelAvailableAt:record.modelDifference?'DECLARE UTC AVAILABILITY':null,
            calibrationRows:[],evaluationRows:record.rows.map(row=>row.authorRow),excludedRows:[],
            availabilityProvenance:'operator_declared_not_authenticated',freezeAuthority:'content_identity_only_not_authenticated_preregistration'},null,2));
        }}>Build editable selection template</button>
        <button type="button" onClick={()=>{void prepareBenchmark();}}>Prepare frozen selection replay</button>
        <p className="text-xs text-amber-200">{benchmarkMessage}</p>
        {benchmark && <label className="block text-sm">Benchmark replay bundle JSON
          <textarea aria-label="Benchmark replay bundle JSON" readOnly value={JSON.stringify(benchmark)} className="block w-full h-32 bg-slate-950 text-xs" />
        </label>}
        {([['Complete replay bundle JSON',JSON.stringify(prepared)],['Replay record JSON',prepared.recordJson],['Numerical table CSV',prepared.tableCsv],['Provenance manifest JSON',prepared.manifestJson]] as const).map(([label,text])=><label key={label} className="block text-sm">{label}
          <textarea aria-label={label} readOnly value={text} className="block w-full h-32 bg-slate-950 text-xs" />
        </label>)}
        {figure && ([['Paper figure SVG',figure.figureSvg],['Figure provenance manifest JSON',figure.figureManifestJson],['Complete figure replay bundle JSON',JSON.stringify(figure)]] as const).map(([label,text])=><label key={label} className="block text-sm">{label}
          <textarea aria-label={label} readOnly value={text} className="block w-full h-32 bg-slate-950 text-xs" />
        </label>)}
      </details>}
    </>}
  </section>;
}
