import React,{useEffect,useMemo,useRef,useState} from 'react';
import {verifySolarResearchEvidencePackage,SOLAR_EVIDENCE_PACKAGE_MAX_BYTES} from '../../../shared/solar-research-evidence-package';
import {SolarObservationFreshness} from './SolarObservationFreshness';
import {SolarObservationProcessing} from './SolarObservationProcessing';
import {prepareSolarResearchFigure} from '../../../shared/solar-research-figure';
import {SolarObservationRaster} from './SolarObservationRaster';
import {decodeObservation} from '../../../public/solar-workstation-comparison.js';
import {SolarResearchPackageStorage} from './SolarResearchPackageStorage';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';
import {inspectSolarObservationSequence} from '../../../shared/solar-observation-sequence';
import {SolarEventEvidenceInspector} from './SolarEventEvidenceInspector';
import {recipeFromVerifiedSolarArchive,verifySolarDiskViewRecipe,type SolarDiskViewRecipe} from '../../../shared/solar-disk-view-recipe';

/** Independent replay inspector: never replaces active observations or acquires data. */
export function SolarResearchEvidenceReplay() {
  const [draft,setDraft]=useState(''),[message,setMessage]=useState('');
  const [verifiedPackageJson,setVerifiedPackageJson]=useState<string>();
  const [replay,setReplay]=useState<Awaited<ReturnType<typeof verifySolarResearchEvidencePackage>>>();
  const [figure,setFigure]=useState<Awaited<ReturnType<typeof prepareSolarResearchFigure>>>();
  const [frameIndex,setFrameIndex]=useState(0);
  const [replayPackageId,setReplayPackageId]=useState<string>();
  const [viewRecipe,setViewRecipe]=useState<SolarDiskViewRecipe>();
  const [viewRecipeDraft,setViewRecipeDraft]=useState('');
  const [viewRecipeMessage,setViewRecipeMessage]=useState('');
  const selectedFrame=replay?.archiveReplay?.frames[frameIndex];
  const pixels=useMemo(()=>selectedFrame?decodeObservation(selectedFrame):undefined,[selectedFrame]);
  const sequenceInspection=useMemo(()=>{
    if(!replay?.archiveReplay)return undefined;
    try{return {sequence:inspectSolarObservationSequence(replay.archiveReplay.frames),error:null};}
    catch{return {sequence:undefined,error:'Archive acquisition sequence unavailable: invalid or unsupported timestamps. No timing or correlation claim is admitted.'};}
  },[replay]);
  const sequence=sequenceInspection?.sequence;
  const revision=useRef(0);
  useEffect(()=>()=>{revision.current++;},[]);
  useEffect(()=>{
    const changed=()=>{revision.current++;setReplay(undefined);setVerifiedPackageJson(undefined);setReplayPackageId(undefined);setViewRecipe(undefined);setViewRecipeDraft('');setFigure(undefined);setDraft('');setMessage('Account changed; replay cleared.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
  },[]);
  useEffect(()=>{
    let current=true;
    setViewRecipe(undefined);
    if(replay?.archiveReplay&&replayPackageId)void recipeFromVerifiedSolarArchive(replayPackageId,replay.archiveReplay,frameIndex)
      .then(recipe=>{if(current)setViewRecipe(recipe);})
      .catch(()=>{if(current)setViewRecipeMessage('Selected frame cannot produce a verified view recipe.');});
    return ()=>{current=false;};
  },[replay,replayPackageId,frameIndex]);
  async function open(read:()=>Promise<string>) {
    const selected=++revision.current;setReplay(undefined);setVerifiedPackageJson(undefined);setReplayPackageId(undefined);setViewRecipe(undefined);setFigure(undefined);setMessage('Verifying local replay package…');
    try {
      const packageJson=await read();
      const result=await verifySolarResearchEvidencePackage(packageJson);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packageJson))),
        byte=>byte.toString(16).padStart(2,'0')).join('');
      if(selected!==revision.current)return;
      setFrameIndex(0);setReplay(result);setReplayPackageId(`solar-package:${digest}`);setVerifiedPackageJson(packageJson);
      setViewRecipeDraft('');setViewRecipeMessage('');
      setMessage('Content identities verified. Sources are not authenticated; scientific admission remains disabled.');
    } catch(error) {if(selected===revision.current)setMessage(error instanceof Error?error.message:'Replay rejected');}
  }
  async function reopenViewRecipe() {
    if(!replay?.archiveReplay||!replayPackageId){setViewRecipeMessage('Open the matching evidence package first.');return;}
    const selectedRevision=revision.current;
    const selectedPackageId=replayPackageId;
    try {
      if(new TextEncoder().encode(viewRecipeDraft).length>8_192)throw new Error('View recipe exceeds 8 KB');
      const requested=await verifySolarDiskViewRecipe(JSON.parse(viewRecipeDraft));
      if(selectedRevision!==revision.current)return;
      if(requested.packageId!==selectedPackageId)throw new Error('View recipe belongs to another package');
      const expected=await recipeFromVerifiedSolarArchive(selectedPackageId,replay.archiveReplay,requested.frameIndex);
      if(selectedRevision!==revision.current)return;
      if(requested.recipeId!==expected.recipeId)throw new Error('View recipe does not match this verified archive');
      setFrameIndex(requested.frameIndex);
      setViewRecipeMessage('Exact archived frame reopened. Field lines remain off; no model or observation join was performed.');
    } catch(error) {if(selectedRevision===revision.current)setViewRecipeMessage(error instanceof Error?error.message:'View recipe rejected');}
  }
  async function preparePaperArtifacts() {
    if(!replay)return;
    const selected=++revision.current;setFigure(undefined);setMessage('Preparing verified replay paper artifacts…');
    try {
      const result=await prepareSolarResearchFigure(replay.comparison);
      if(selected!==revision.current)return;
      setFigure(result);setMessage('Paper artifacts prepared locally from this replay record. No file saved or paper published.');
    } catch(error) {if(selected===revision.current)setMessage(error instanceof Error?error.message:'Paper artifact preparation rejected');}
  }
  return <section className="space-y-2 text-xs">
    <h3>Reopen portable evidence</h3>
    <p>Local file/paste inspection does not contact a server. Explicit profile reopening below reads a retained archive. Neither replaces the active feed or executes a model.</p>
    <SolarResearchPackageStorage packageJson={verifiedPackageJson} contextRevision={revision.current} onReopen={text=>{void open(async()=>text);}} />
    <input type="file" accept=".json,application/json" aria-label="Portable evidence package file" onChange={event=>{
      const file=event.target.files?.[0];event.target.value='';
      if(!file)return;
      void open(async()=>{if(file.size>SOLAR_EVIDENCE_PACKAGE_MAX_BYTES)throw new Error('Evidence package exceeds 9 MB');return file.text();});
    }} />
    <details><summary>Paste a portable evidence package</summary>
      <textarea aria-label="Portable evidence package draft" value={draft} onChange={event=>{
        revision.current++;setReplay(undefined);setVerifiedPackageJson(undefined);setFigure(undefined);setMessage('');setDraft(event.target.value);
      }} className="block w-full h-32 bg-slate-950" />
      <button type="button" onClick={()=>{void open(async()=>draft);}}>Verify portable evidence package</button>
    </details>
    <button type="button" onClick={()=>{revision.current++;setReplay(undefined);setVerifiedPackageJson(undefined);setReplayPackageId(undefined);setViewRecipe(undefined);setViewRecipeDraft('');setFigure(undefined);setDraft('');setMessage('Replay cleared.');}}>Clear portable replay</button>
    <p aria-live="polite">{message}</p>
    {replay&&<div>
      <p className="break-all">Index: {replay.indexId}</p>
      <p className="break-all">Comparison: {replay.manifest.comparison.recordId}</p>
      <p>Quantity: {replay.record.quantity}; units: {replay.record.units}; operator: {replay.record.operator}</p>
      <p className="break-all">Archive: {replay.manifest.observationArchive?.snapshotId??'Absent'}; paper context: {replay.manifest.literatureContextId??'Absent'}</p>
      <p>No physical image/interior join. No correlation score. Original FITS not included.</p>
      {replay.literatureReplay&&<section aria-label="Replayed paper context">
        <h4>Paper context, not source authentication</h4>
        <a href={replay.literatureReplay.context.paper.url} target="_blank" rel="noopener noreferrer">{replay.literatureReplay.context.paper.title}</a>
        <p>{replay.literatureReplay.context.paper.citation} · {replay.literatureReplay.context.paper.journal} · {replay.literatureReplay.context.paper.location}</p>
        <p>{replay.literatureReplay.context.distinction}</p>
        <ul>{replay.literatureReplay.context.limitations.map((text:string)=><li key={text}>{text}</li>)}</ul>
        <label>Replayed paper BibTeX<textarea aria-label="Replayed paper BibTeX" readOnly value={replay.literatureReplay.bibtex} className="block w-full h-32 bg-slate-950" /></label>
      </section>}
      {replay.benchmarkReplay?<section aria-label="Replayed benchmark selection">
        <h4>Declared benchmark selection</h4>
        <p>{replay.benchmarkReplay.selection.question}</p>
        <p>Declared freeze: {replay.benchmarkReplay.selection.frozenAt}; information cutoff: {replay.benchmarkReplay.selection.informationCutoff}.</p>
        <p>Calibration rows: {replay.benchmarkReplay.selection.calibrationRows.length}; evaluation rows: {replay.benchmarkReplay.selection.evaluationRows.length}; excluded rows: {replay.benchmarkReplay.selection.excludedRows.length}.</p>
        <p>No performance score or independent validation. Selection applies to inversion rows, not the image archive.</p>
        <label>Replayed benchmark selection JSON<textarea aria-label="Replayed benchmark selection JSON" readOnly value={replay.benchmarkReplay.planJson} className="block w-full h-32 bg-slate-950" /></label>
        <ul>{replay.benchmarkReplay.limitations.map(text=><li key={text}>{text}</li>)}</ul>
      </section>:<p>No benchmark selection included; no evaluation partition or performance is implied.</p>}
      {replay.archiveReplay&&<section aria-label="Portable archive frame context">
        <h4>{replay.archiveReplay.instrument} · {replay.archiveReplay.wavelength_A} Å archive context</h4>
        <section aria-label="Reproducible solar disk view recipe">
          <h5>Reproducible disk view · archived frame only</h5>
          <p>Image pixels are available only in the verified package. The recipe contains identities and display settings, not pixels. Catalog markers are contextual; magnetic field lines are off.</p>
          {viewRecipe?<><p className="break-all">View ID: {viewRecipe.recipeId}</p>
            <label>Current solar disk view recipe JSON<textarea aria-label="Current solar disk view recipe JSON" readOnly
              value={JSON.stringify(viewRecipe)} className="block w-full h-24 bg-slate-950" /></label></>:<p>Preparing frame identity…</p>}
          <label>Paste solar disk view recipe JSON<textarea aria-label="Paste solar disk view recipe JSON"
            value={viewRecipeDraft} onChange={event=>setViewRecipeDraft(event.target.value)} className="block w-full h-20 bg-slate-950" /></label>
          <button type="button" onClick={()=>{void reopenViewRecipe();}}>Reopen view recipe in this package</button>
          {viewRecipeMessage&&<p role="status">{viewRecipeMessage}</p>}
        </section>
        {replay.archiveReplay.selected_event_context&&<SolarEventEvidenceInspector archivedSelection
          event={{id:replay.archiveReplay.selected_event_context.eventId,
            event_type:replay.archiveReplay.selected_event_context.eventType,
            start_time:replay.archiveReplay.selected_event_context.eventStartUtc,
            end_time:replay.archiveReplay.selected_event_context.eventEndUtc??undefined,
            frm_name:replay.archiveReplay.selected_event_context.detectionMethod??undefined}}
          frame={replay.archiveReplay.frames[replay.archiveReplay.selected_event_context.selectedFrameIndex]}
          observation={replay.archiveReplay} />}
        {sequenceInspection?.error&&<p role="alert">{sequenceInspection.error}</p>}
        {sequence&&<div aria-label="Archive acquisition sequence diagnostic">
          <p>{sequence.frameCount} acquisition frame(s); observed span {sequence.observedSpanMs / 1000} s.
            Duplicate instants: {sequence.duplicateTimes}; reversed intervals: {sequence.reversedIntervals}.</p>
          <p>{sequence.frameCount===1?'Single acquisition: no time series.':
            !sequence.strictlyIncreasing?'Sequence is not strictly increasing; no reordering applied.':
            sequence.equalObservedSpacing?`Equal observed spacing: ${sequence.observedSpacingMs! / 1000} s; completeness unverified.`:
            'Irregular observed spacing; no interpolation applied.'}</p>
          <p>No temporal correlation admission. Acquisition timestamps do not establish calibrated, registered or independent samples.</p>
        </div>}
        <label>Archive raster frame <select aria-label="Portable archive raster frame" value={frameIndex}
          onChange={event=>{const index=Number(event.target.value);if(Number.isInteger(index)&&index>=0&&index<replay.archiveReplay!.frames.length)setFrameIndex(index);}}>
          {replay.archiveReplay.frames.map((frame,index)=><option key={frame.index} value={index}>{frame.index} · {frame.obstime}</option>)}
        </select></label>
        {selectedFrame&&pixels&&<figure>
          <SolarObservationRaster data={pixels} size={selectedFrame.grid_size} />
          <figcaption>Archived instrument pixels · {selectedFrame.obstime}. Square-root grayscale display, vertically flipped FITS rows; no WCS registration, co-rotation or calibrated radiance. Not a stellar-interior model image.</figcaption>
        </figure>}
        {replay.archiveReplay.frames.map(frame=><div key={frame.index}>
          <p>Frame {frame.index}; grid {frame.grid_size} × {frame.grid_size}; coordinates: {frame.coordinate_frame}</p>
          <SolarObservationFreshness acquiredAt={frame.obstime} fetchedAt={replay.archiveReplay!.meta.fetched_at_utc} replay />
          <SolarObservationProcessing frame={frame} />
          <p className="break-all">Declared FITS SHA256: {frame.fits_sha256}; verified display SHA256: {frame.display_sha256}</p>
        </div>)}
      </section>}
      <div className="overflow-x-auto"><table aria-label="Portable replay numerical comparison"><thead><tr>
        <th>Author row</th><th>Radius / BP04 R</th><th>Observed Δc²/c²</th><th>Quoted error</th><th>Primary prediction</th><th>Observed − primary</th>
      </tr></thead><tbody>{replay.record.rows.map(row=><tr key={row.authorRow}>
        <td>{row.authorRow}</td><td>{row.secondQuartileRadius}</td><td>{row.observed}</td><td>{row.quotedSolutionError}</td>
        <td>{row.primaryPrediction??'Missing'}</td><td>{row.residual??'Missing'}</td>
      </tr>)}</tbody></table></div>
      <ul>{replay.manifest.exclusions.map((text:string)=><li key={text}>{text}</li>)}</ul>
      <button type="button" onClick={()=>{void preparePaperArtifacts();}}>Prepare replay paper figure and table</button>
      {figure&&<section aria-label="Replay paper artifacts">
        <img alt="Replayed BiSON point estimates with quoted errors; not a joint confidence band" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.figureSvg)}`} className="w-full max-w-5xl" />
        <p>Points use second-quartile localization; quoted scalar errors are not covariance-aware uncertainty. No model is invented when predictions are absent.</p>
        {([['Replay paper figure SVG',figure.figureSvg],['Replay figure provenance JSON',figure.figureManifestJson],
          ['Replay numerical table CSV',figure.comparisonBundle.tableCsv],['Replay figure bundle JSON',JSON.stringify(figure)]] as const).map(([label,value])=>
            <label key={label}>{label}<textarea aria-label={label} readOnly value={value} className="block w-full h-32 bg-slate-950" /></label>)}
      </section>}
    </div>}
  </section>;
}
