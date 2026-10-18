import React,{useEffect,useRef,useState} from 'react';
import {prepareSolarResearchEvidenceIndex} from '../../../shared/solar-research-evidence-index';
import {prepareSolarResearchEvidencePackage,verifySolarResearchEvidencePackage} from '../../../shared/solar-research-evidence-package';
import {SolarResearchPackageStorage} from './SolarResearchPackageStorage';

export function SolarResearchEvidenceIndex({bundle,archive,literature,benchmark}:{bundle:unknown;archive?:unknown;literature?:unknown;benchmark?:unknown}) {
  const selectedEventId=(archive as {selected_event_context?:{eventId?:unknown}}|null|undefined)?.selected_event_context?.eventId;
  const [output,setOutput]=useState<Awaited<ReturnType<typeof prepareSolarResearchEvidenceIndex>>>();
  const [packageJson,setPackageJson]=useState<string>();
  const [reopened,setReopened]=useState<{indexId:string;recordId:string;archiveId:string|null;eventId:string|null}>();
  const [message,setMessage]=useState('');const revision=useRef(0);
  useEffect(()=>{revision.current++;setOutput(undefined);setPackageJson(undefined);setReopened(undefined);setMessage('');return()=>{revision.current++;};},[bundle,archive,literature,benchmark]);
  async function prepare() {
    const selected=++revision.current;setOutput(undefined);setPackageJson(undefined);setMessage('Verifying referenced artifacts…');
    try {
      const result=await prepareSolarResearchEvidenceIndex(bundle,archive,{literature,benchmark});
      if(selected!==revision.current)return;
      setOutput(result);setMessage('Local evidence index prepared. Context only: no physical join, correlation score or scientific admission. No file saved.');
    } catch(error) {if(selected===revision.current)setMessage(error instanceof Error?error.message:'Evidence index rejected');}
  }
  async function preparePackage() {
    const selected=++revision.current;setPackageJson(undefined);setReopened(undefined);setMessage('Verifying portable replay inputs…');
    try {
      const result=await prepareSolarResearchEvidencePackage(bundle,archive,{literature,benchmark});
      if(selected!==revision.current)return;
      setPackageJson(result.packageJson);setMessage('Portable local replay package prepared. Display pixels, not original FITS. No physical join, network request or file save.');
    } catch(error) {if(selected===revision.current)setMessage(error instanceof Error?error.message:'Evidence package rejected');}
  }
  async function reopen(text:string) {
    const selected=revision.current;
    try {
      const verified=await verifySolarResearchEvidencePackage(text);
      if(selected!==revision.current)return;
      setReopened({indexId:verified.indexId,recordId:verified.manifest.comparison.recordId,
        archiveId:verified.archiveReplay?.archive_identity?.snapshotId??null,
        eventId:verified.archiveReplay?.selected_event_context?.eventId??null});
    } catch(error) {if(selected===revision.current)setMessage(error instanceof Error?error.message:'Retained package replay rejected');}
  }
  return <section className="space-y-2 text-xs">
    <button type="button" onClick={()=>{void prepare();}}>Prepare interconnected evidence index</button>
    <button type="button" onClick={()=>{void preparePackage();}}>Prepare portable evidence replay package</button>
    <p>{archive===undefined?'No observation archive selected; image context will be absent.':'Current observation will be verified and indexed as archive context, not a live measurement.'}</p>
    {archive!==undefined&&<p>{typeof selectedEventId==='string'
      ? `Selected event ${selectedEventId} will be included as a contextual catalog assertion if the package verifies.`
      : 'No event is selected for this package. Select a HEK event and image frame in Star Watcher before preparing it.'}</p>}
    <p aria-live="polite">{message}</p>
    {output&&<label className="block">Interconnected evidence index JSON
      <textarea aria-label="Interconnected evidence index JSON" readOnly value={JSON.stringify(output)} className="block w-full h-32 bg-slate-950 text-xs" />
    </label>}
    {packageJson&&<label>Portable evidence replay package JSON
      <textarea aria-label="Portable evidence replay package JSON" readOnly value={packageJson} className="block w-full h-32 bg-slate-950 text-xs" />
    </label>}
    {packageJson&&<SolarResearchPackageStorage packageJson={packageJson} onReopen={text=>{void reopen(text);}} />}
    {reopened&&<section aria-label="Reopened profile evidence summary" className="space-y-1 break-all rounded border border-slate-700 p-2">
      <p>Reopened from the signed-in profile; nested content identities verified. This is archive context, not a fresh acquisition or scientific admission.</p>
      <p>Index: {reopened.indexId}</p><p>Comparison: {reopened.recordId}</p>
      <p>Image archive: {reopened.archiveId??'absent'}; selected event: {reopened.eventId??'absent'}.</p>
      <p>No quantitative image/interior join or model fit.</p>
    </section>}
  </section>;
}
