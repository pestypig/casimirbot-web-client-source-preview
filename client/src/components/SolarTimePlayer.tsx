import React from 'react';
import {Quaternion} from 'three';
import {robPfssParentReceiptSchema,robPfssRangeSchema,robPfssRetainedReceiptSchema,robPfssSnapshotSchema,
  type RobPfssSnapshot} from '../../../shared/solar-rob-pfss';
import {solarObservationSourceReceiptSchema} from '../../../shared/solar-observation-source';
import {solarTimePlaybackReadViewSchema,solarTimePlaybackSaveSchema,
  solarTimePlaybackListSchema,
  type SolarTimePlaybackManifest} from '../../../shared/solar-time-playback';
import {solarGlobalRadialMapSchema} from '../../../shared/solar-magnetic-dipole';
import {fetchAccountCapabilityPolicy,readCachedAccountProfileIdentity,HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT}
  from '../lib/workstation/accountCapabilityPolicy';
import {serializeObservationSnapshot,validateObservationReplay} from '../lib/solar-observation-replay';
import {fetchSolarSourceJson} from '../lib/solar-source-fetch';
import {earthViewPose} from '../lib/solar-earth-view-pose';
import {isSolarStorageBlock,nextSolarBufferSlot,solarBufferRuns} from '../lib/solar-time-buffer';
import {SolarTemporalMagneticGlobe,type EarthFacingArchiveFrame} from './SolarMagneticGlobe';
import {SolarObservationRaster} from './SolarObservationRaster';
import {SolarDailyMoviePlayer} from './SolarDailyMoviePlayer';

const DAY=86_400_000;
const MODEL_MAX_AGE=12*3_600_000;
const MAX_SLOTS=64;
const RETAINED_SET_MAX_SLOTS=12;
const SYNODIC_DAYS=27.275261151446653;
type ModelEntry=ReturnType<typeof robPfssRangeSchema.parse>['entries'][number];
type ImagePolicy='at-or-before'|'nearest';
type Slot={requestedMs:number;imagePolicy:ImagePolicy};
type RetainedSlot={imageId:string;modelId:string;parentSha256:string;
  archiveId:string;sourceFitsSha256:string;modelSha256:string};
type Loaded={image:EarthFacingArchiveFrame|null;model:RobPfssSnapshot|null;
  rotationDeg:number|null;modelStatus:string;error:string|null;
  sourceTicket:string|null;parentSha256:string|null;
  retained:RetainedSlot|null};
function hasDisplayPair(value:Loaded|undefined):boolean{
  return !!value?.image&&!!value.model&&value.rotationDeg!==null&&!!value.parentSha256;
}
function wallDuration(ms:number):string{
  const seconds=Math.max(0,ms/1000);
  const minutes=Math.floor(seconds/60);
  return `${minutes}:${String(Math.floor(seconds%60)).padStart(2,'0')}.${Math.floor((seconds%1)*10)}`;
}

function utcInputMs(value:string){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))return null;
  const ms=Date.parse(`${value}Z`);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===value.padEnd(19,':00')?ms:null;
}
function slotsBetween(start:number,end:number,requestedStepDays:number,imagePolicy:ImagePolicy):Slot[]{
  const step=requestedStepDays*DAY;
  const slots:Slot[]=[{requestedMs:start,imagePolicy}];
  for(let at=start+step;at<end-1;at+=step)slots.push({requestedMs:Math.round(at),imagePolicy});
  slots.push({requestedMs:end,imagePolicy});
  return slots;
}
function signedLongitudeDeltaDeg(from:number,to:number):number{
  return ((to-from+540)%360)-180;
}
/** Observer-frame display geometry, interpolated only between source WCS geometries. */
function earthViewObserverAt(slots:Slot[],cache:Map<number,Loaded>,timeMs:number){
  const first=cache.get(0)?.image;
  if(!first)return null;
  let longitude=first.observer.observerCarringtonLongitudeDeg;
  let latitude=first.observer.observerCarringtonLatitudeDeg;
  let travel=0;
  for(let slot=1;slot<slots.length;slot++){
    const next=cache.get(slot)?.image;
    if(!next)break;
    const nextLongitude=next.observer.observerCarringtonLongitudeDeg;
    const delta=signedLongitudeDeltaDeg(longitude,nextLongitude);
    const interval=slots[slot].requestedMs-slots[slot-1].requestedMs;
    if(timeMs<slots[slot].requestedMs){
      const fraction=Math.max(0,Math.min(1,(timeMs-slots[slot-1].requestedMs)/interval));
      const traveled=travel+delta*fraction;
      return {reference:first.observer,travelDeg:traveled,
        observer:{observerCarringtonLongitudeDeg:first.observer.observerCarringtonLongitudeDeg+traveled,
          observerCarringtonLatitudeDeg:latitude+
            (next.observer.observerCarringtonLatitudeDeg-latitude)*fraction}};
    }
    travel+=delta;longitude=nextLongitude;
    latitude=next.observer.observerCarringtonLatitudeDeg;
  }
  return {reference:first.observer,travelDeg:travel,
    observer:{observerCarringtonLongitudeDeg:first.observer.observerCarringtonLongitudeDeg+travel,
      observerCarringtonLatitudeDeg:latitude}};
}
function slotAtTime(slots:Slot[],timeMs:number):number{
  let low=0,high=slots.length-1;
  while(low<high){
    const middle=Math.ceil((low+high)/2);
    if(slots[middle].requestedMs<=timeMs)low=middle;
    else high=middle-1;
  }
  return low;
}
function sourceWindow(ms:number,policy:ImagePolicy){
  return {start:new Date(ms-150_000).toISOString(),
    end:new Date(ms+(policy==='nearest'?150_000:0)).toISOString()};
}
function monthWindow(ms:number){
  const date=new Date(ms),start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1);
  const end=Math.min(Date.now(),Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)-1000);
  return {key:new Date(start).toISOString().slice(0,7),start:new Date(start).toISOString(),
    end:new Date(end).toISOString()};
}
async function responseJson(url:string,signal:AbortSignal){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal});
  const body=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String(body.error??`HTTP ${response.status}`));
  return body;
}
async function postJson(url:string,body:Record<string,unknown>,signal:AbortSignal){
  const response=await fetch(url,{method:'POST',credentials:'include',signal,
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String(value.error??`HTTP ${response.status}`));
  return value;
}

async function retainSourcePair(loaded:Loaded,signal:AbortSignal):Promise<{owner:string;retained:RetainedSlot}>{
  if(!loaded.image||!loaded.model||!loaded.parentSha256||!loaded.sourceTicket)
    throw new Error('Complete source pair and live image ticket required');
  let owner=readCachedAccountProfileIdentity().profileId;
  if(!owner){await fetchAccountCapabilityPolicy();owner=readCachedAccountProfileIdentity().profileId;}
  if(!owner)throw new Error('Sign in to retain this source pair.');
  const image=solarObservationSourceReceiptSchema.parse(await postJson(
    '/api/star-watcher/observation-source/retain',
    {ticket:loaded.sourceTicket,frameIndex:loaded.image.frameIndex},signal));
  if(image.ownerProfileId!==owner||image.archiveId!==loaded.image.archiveId||
     image.sourceFitsSha256!==loaded.image.declaredFitsSha256||
     image.displaySha256!==loaded.image.displaySha256||
     image.observedAtUtc!==loaded.image.observedAtUtc)
    throw new Error('Retained AIA source differs from displayed frame');
  const model=robPfssRetainedReceiptSchema.parse(await postJson(
    '/api/star-watcher/rob-pfss/retain',{
      dateUtc:loaded.model.relativePath.slice(0,10).replaceAll('/','-'),
      relativePath:loaded.model.relativePath,expectedSha256:loaded.model.sourceSha256,
      expectedCatalogSha256:loaded.model.catalogSha256},signal));
  if(model.ownerProfileId!==owner||model.sourceSha256!==loaded.model.sourceSha256||
     model.catalogSha256!==loaded.model.catalogSha256||
     model.fitsDateObsUtc!==loaded.model.fitsDateObsUtc)
    throw new Error('Retained ROB source differs from displayed model');
  const parent=robPfssParentReceiptSchema.parse(await postJson(
    '/api/star-watcher/rob-pfss/parent/retain',
    {acquisitionId:model.acquisitionId},signal));
  if(parent.ownerProfileId!==owner||parent.modelAcquisitionId!==model.acquisitionId||
     parent.modelSha256!==model.sourceSha256||parent.parentSha256!==loaded.parentSha256)
    throw new Error('Retained GONG candidate differs from displayed parent');
  return {owner,retained:{imageId:image.acquisitionId,modelId:model.acquisitionId,
    parentSha256:parent.parentSha256,archiveId:image.archiveId,
    sourceFitsSha256:image.sourceFitsSha256,modelSha256:model.sourceSha256}};
}

function subscribePlayerAccount(onChange:()=>void){
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,onChange);
  return()=>window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,onChange);
}
function playerAccountSnapshot(){
  return JSON.stringify(readCachedAccountProfileIdentity());
}
export function SolarTimePlayer(){
  // Retire buffered data, playback and pending reads even for an A -> B -> A
  // identity round trip. A policy-only refresh keeps this account's selection.
  const accountKey=React.useSyncExternalStore(subscribePlayerAccount,
    playerAccountSnapshot,playerAccountSnapshot);
  const [fidelity,setFidelity]=React.useState<'daily-movie'|'sampled-fits'>('daily-movie');
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2 text-xs">
      <button type="button" aria-pressed={fidelity==='daily-movie'} onClick={()=>setFidelity('daily-movie')}
        className="rounded border border-cyan-500 px-3 py-1">Daily movie · all available frames</button>
      <button type="button" aria-pressed={fidelity==='sampled-fits'} onClick={()=>setFidelity('sampled-fits')}
        className="rounded border border-cyan-500 px-3 py-1">Sampled FITS · selectable spacing</button>
    </div>
    <React.Fragment key={accountKey}>
      {fidelity==='daily-movie'?<SolarDailyMoviePlayer/>:<SolarSampledTimePlayer/>}
    </React.Fragment>
  </div>;
}

function SolarSampledTimePlayer(){
  const [startInput,setStartInput]=React.useState('2026-09-21T15:38:05');
  const [endInput,setEndInput]=React.useState('2026-10-17T05:28:52');
  const [stepDays,setStepDays]=React.useState(3);
  const [preparedStepDays,setPreparedStepDays]=React.useState(3);
  const [imagePolicy,setImagePolicy]=React.useState<ImagePolicy>('at-or-before');
  const [keepDownloadedSet,setKeepDownloadedSet]=React.useState(true);
  const [preparedKeepDownloadedSet,setPreparedKeepDownloadedSet]=React.useState(false);
  const [speed,setSpeed]=React.useState<'realtime'|'rotation10m'|'rotation1m'|'fit30s'|'fit15s'>('fit30s');
  const [slots,setSlots]=React.useState<Slot[]>([]);
  const [index,setIndex]=React.useState(0);
  const [playheadMs,setPlayheadMs]=React.useState(0);
  const playheadRef=React.useRef(0);
  const fieldRotationRef=React.useRef(0);
  const fieldPoseRef=React.useRef(new Quaternion());
  const [playing,setPlaying]=React.useState(false);
  const [playWhenReady,setPlayWhenReady]=React.useState(false);
  const [preparedImageCount,setPreparedImageCount]=React.useState(0);
  const [revision,setRevision]=React.useState(0);
  const [storageHold,setStorageHold]=React.useState<{slot:number;reason:string}|null>(null);
  const [message,setMessage]=React.useState('Choose two UTC instants, then prepare a bounded AIA 193 Å / ROB timeline.');
  const cache=React.useRef(new Map<number,Loaded>());
  const retainedSlots=React.useRef(new Map<number,RetainedSlot>());
  const pending=React.useRef(new Map<number,AbortController>());
  const retentionRequest=React.useRef<AbortController|null>(null);
  const [retaining,setRetaining]=React.useState(false);
  const [retentionMessage,setRetentionMessage]=React.useState('Buffered frames are transient until explicitly retained.');
  const [offlineManifest,setOfflineManifest]=React.useState<SolarTimePlaybackManifest|null>(null);
  const [manifestInput,setManifestInput]=React.useState('');
  const [manifestBusy,setManifestBusy]=React.useState(false);
  const [manifestMessage,setManifestMessage]=React.useState('No retained time-window checkpoint is open.');
  const [savedList,setSavedList]=React.useState<ReturnType<typeof solarTimePlaybackListSchema.parse>['entries']>([]);
  const manifestRequest=React.useRef<AbortController|null>(null);
  const autoSavedGeneration=React.useRef(-1);
  const monthCache=React.useRef(new Map<string,Promise<ModelEntry[]>>());
  const modelPairCache=React.useRef(new Map<string,{model:RobPfssSnapshot;
    rotationDeg:number|null;parentSha256:string|null;modelStatus:string}>());
  const generation=React.useRef(0);
  const currentIndex=React.useRef(index);
  currentIndex.current=index;
  const selected=cache.current.get(index);
  const current=slots[index];
  const rangeMs=slots.length>1?slots[slots.length-1].requestedMs-slots[0].requestedMs:0;
  const rate=speed==='realtime'?1:speed==='rotation10m'?SYNODIC_DAYS*DAY/600_000:
    speed==='rotation1m'?SYNODIC_DAYS*DAY/60_000:
    rangeMs/(speed==='fit15s'?15_000:30_000);
  const setEarthViewPose=(timeMs:number)=>{
    // The source image is held between exposures. Hold its model display pose too:
    // interpolating a static PFSS geometry at every tick implied unmeasured evolution.
    const heldSampleTime=slots[slotAtTime(slots,timeMs)]?.requestedMs??timeMs;
    const geometry=earthViewObserverAt(slots,cache.current,heldSampleTime);
    if(!geometry)return;
    fieldRotationRef.current=geometry.travelDeg*Math.PI/180;
    fieldPoseRef.current.copy(earthViewPose(geometry.reference,geometry.observer));
  };
  const seek=(timeMs:number)=>{
    if(!slots.length)return;
    const bounded=Math.max(slots[0].requestedMs,Math.min(timeMs,slots[slots.length-1].requestedMs));
    playheadRef.current=bounded;
    setEarthViewPose(bounded);
    setPlayheadMs(bounded);
    setIndex(slotAtTime(slots,bounded));
  };

  const prepare=()=>{
    const start=utcInputMs(startInput),end=utcInputMs(endInput);
    if(start===null||end===null||start<Date.parse('2010-01-01T00:00:00Z')||
       end<=start||end>Date.now()){
      setMessage('Enter two valid past UTC instants after 2010, with the end after the start.');return;
    }
    const requestedCount=Math.ceil((end-start)/(stepDays*DAY))+1;
    if(requestedCount>MAX_SLOTS){
      setMessage(`This range needs about ${requestedCount} samples at the requested spacing. Choose a shorter range or wider spacing (${MAX_SLOTS} samples maximum).`);
      return;
    }
    const next=slotsBetween(start,end,stepDays,imagePolicy);
    if(keepDownloadedSet&&next.length>RETAINED_SET_MAX_SLOTS){
      setMessage(`This range has ${next.length} samples. For an automatically retained set, choose wider spacing (${RETAINED_SET_MAX_SLOTS} samples maximum), or turn off Keep downloaded set.`);
      return;
    }
    generation.current++;
    for(const controller of pending.current.values())controller.abort();
    retentionRequest.current?.abort();retentionRequest.current=null;setRetaining(false);
    manifestRequest.current?.abort();manifestRequest.current=null;setManifestBusy(false);
    pending.current.clear();cache.current.clear();monthCache.current.clear();modelPairCache.current.clear();retainedSlots.current.clear();
    setStorageHold(null);
    setRetentionMessage(keepDownloadedSet?'Each complete source pair will be retained while its source ticket is live.':'Buffered frames are transient until explicitly retained.');
    setOfflineManifest(null);
    playheadRef.current=start;
    fieldRotationRef.current=0;
    fieldPoseRef.current.identity();
    setPlaying(false);setPlayWhenReady(false);setPreparedImageCount(0);
    setIndex(0);setPlayheadMs(start);setSlots(next);setPreparedStepDays(stepDays);
    setPreparedKeepDownloadedSet(keepDownloadedSet);
    setRevision(value=>value+1);
    setMessage(`${next.length} requested instants, ${((end-start)/DAY).toFixed(2)} solar days. ${imagePolicy==='at-or-before'?'Each image is observed at or before its playhead.':'Nearest-frame inspection may show future context.'} Actual source times remain visible.`);
  };

  const monthlyEntries=React.useCallback(async(ms:number,signal:AbortSignal)=>{
    const window=monthWindow(ms);
    let promise=monthCache.current.get(window.key);
    if(!promise){
      const params=new URLSearchParams({startUtc:window.start,endUtc:window.end});
      // The month index is a compact source listing, shared by all samples in that month.
      promise=responseJson(`/api/star-watcher/rob-pfss/range?${params}`,signal)
        .then(value=>{
          const parsed=robPfssRangeSchema.parse(value);
          if(parsed.months.some(month=>month.status==='unavailable')||parsed.truncated)
            throw new Error('ROB month index incomplete');
          return parsed.entries;
        });
      monthCache.current.set(window.key,promise);
      promise.catch(()=>{if(monthCache.current.get(window.key)===promise)monthCache.current.delete(window.key);});
    }
    return promise;
  },[]);

  const load=React.useCallback(async(slotIndex:number)=>{
    if(cache.current.has(slotIndex)||pending.current.has(slotIndex)||!slots[slotIndex])return;
    const controller=new AbortController(),epoch=generation.current,
      {requestedMs:requested,imagePolicy:policy}=slots[slotIndex];
    pending.current.set(slotIndex,controller);setRevision(value=>value+1);
    try{
      const savedSlot=offlineManifest?.slots[slotIndex];
      if(savedSlot){
        if(savedSlot.state==='unresolved'){
          if(generation.current===epoch&&!controller.signal.aborted)
            cache.current.set(slotIndex,{image:null,model:null,rotationDeg:null,
              modelStatus:'Retained checkpoint has no source pair for this requested slot.',
              error:`Unresolved when saved: ${savedSlot.reason}; source absence not verified`,
              sourceTicket:null,parentSha256:null,retained:null});
          return;
        }
        let owner=readCachedAccountProfileIdentity().profileId;
        if(!owner){await fetchAccountCapabilityPolicy();owner=readCachedAccountProfileIdentity().profileId;}
        if(!owner)throw new Error('Sign in to reopen retained solar sources.');
        const [imageRaw,modelRaw,parentRaw]=await Promise.all([
          responseJson(`/api/star-watcher/observation-source/retained?${new URLSearchParams({acquisitionId:savedSlot.imageId})}`,controller.signal),
          responseJson(`/api/star-watcher/rob-pfss/retained?${new URLSearchParams({expected_profile_id:owner,acquisitionId:savedSlot.modelId})}`,controller.signal),
          responseJson(`/api/star-watcher/rob-pfss/parent?${new URLSearchParams({expected_profile_id:owner,acquisitionId:savedSlot.modelId})}`,controller.signal),
        ]);
        const imageReceipt=solarObservationSourceReceiptSchema.parse(imageRaw.receipt);
        const archive=await validateObservationReplay(imageRaw.archive);
        const frame=archive.frames[imageReceipt.frameIndex];
        const model=robPfssSnapshotSchema.parse(modelRaw.snapshot);
        const modelReceipt=robPfssRetainedReceiptSchema.parse(modelRaw.receipt);
        const parent=robPfssParentReceiptSchema.parse(parentRaw.receipt);
        // A self-consistent archive or receipt is not enough: join every
        // displayed layer to this owner's exact retained checkpoint.
        if(!frame?.wcs_header||!frame.registration_geometry||
           offlineManifest.ownerProfileId!==owner||
           imageReceipt.ownerProfileId!==owner||
           imageReceipt.archiveId!==savedSlot.archiveId||
           archive.archive_identity?.snapshotId!==savedSlot.archiveId||
           archive.instrument!==imageReceipt.instrument||
           archive.wavelength_A!==imageReceipt.wavelengthAngstrom||
           frame.index!==imageReceipt.frameIndex||
           frame.fits_sha256!==imageReceipt.sourceFitsSha256||
           frame.display_sha256!==imageReceipt.displaySha256||
           frame.obstime!==imageReceipt.observedAtUtc||
           imageReceipt.acquisitionId!==savedSlot.imageId||
           imageReceipt.frameIndex!==savedSlot.imageFrameIndex||
           imageReceipt.instrument!==savedSlot.imageInstrument||
           imageReceipt.wavelengthAngstrom!==savedSlot.imageWavelengthAngstrom||
           imageReceipt.sourceFitsSha256!==savedSlot.imageFitsSha256||
           imageReceipt.displaySha256!==savedSlot.imageDisplaySha256||
           imageReceipt.observedAtUtc!==savedSlot.imageObservedAtUtc||
           modelReceipt.ownerProfileId!==owner||
           modelReceipt.acquisitionId!==savedSlot.modelId||
           modelReceipt.sourceSha256!==model.sourceSha256||
           modelReceipt.catalogSha256!==model.catalogSha256||
           modelReceipt.relativePath!==model.relativePath||
           modelReceipt.fitsDateObsUtc!==model.fitsDateObsUtc||
           model.sourceSha256!==savedSlot.modelSha256||
           model.catalogSha256!==savedSlot.catalogSha256||
           model.fitsDateObsUtc!==savedSlot.modelFitsDateObsUtc||
           parent.ownerProfileId!==owner||
           parent.modelSha256!==model.sourceSha256||
           parent.modelFitsDateObsUtc!==model.fitsDateObsUtc||
           parent.parentRecordKey!==model.sourceMapRecordKey||
           parent.mapEpochUtc!==savedSlot.gongMapEpochUtc||
           parent.parentSha256!==savedSlot.gongCandidateSha256||
           parent.modelAcquisitionId!==savedSlot.modelId)
          throw new Error('Retained playback source differs from manifest');
        const image:EarthFacingArchiveFrame={archiveId:imageReceipt.archiveId,
          instrument:archive.instrument,wavelengthAngstrom:archive.wavelength_A,
          frameIndex:imageReceipt.frameIndex,observedAtUtc:frame.obstime,
          displaySha256:frame.display_sha256,declaredFitsSha256:frame.fits_sha256,
          gridSize:frame.grid_size,mapBase64:frame.map_b64,
          wcsHeader:frame.wcs_header,observer:frame.registration_geometry};
        if(controller.signal.aborted||generation.current!==epoch||
           readCachedAccountProfileIdentity().profileId!==owner)return;
        const retained:RetainedSlot={imageId:savedSlot.imageId,modelId:savedSlot.modelId,
          parentSha256:savedSlot.gongCandidateSha256,archiveId:savedSlot.archiveId,
          sourceFitsSha256:savedSlot.imageFitsSha256,modelSha256:savedSlot.modelSha256};
        retainedSlots.current.set(slotIndex,retained);
        cache.current.set(slotIndex,{image,model,
          rotationDeg:parent.displayRotation.earthCarringtonLongitudeApproxDeg,
          modelStatus:`Reopened retained ROB ${model.fitsDateObsUtc}; GONG candidate ${parent.parentSha256.slice(0,12)}…; display rotation approximate.`,
          error:null,sourceTicket:null,parentSha256:parent.parentSha256,retained});
        setMessage(`Reopened and rehashed selected source pair for ${savedSlot.requestedAtUtc}.`);
        return;
      }
      const window=sourceWindow(requested,policy);
      const params=new URLSearchParams({...window,targetTime:new Date(requested).toISOString(),
        targetPolicy:policy,
        instrument:'AIA',wave:'193',maxFrames:'1',
        gridSize:'192',includeEvents:'false',bridge:'off'});
      const payload=await fetchSolarSourceJson(`/api/star-watcher/sunpy-export?${params}`,controller.signal,{
        onBusy:()=>{
          if(!controller.signal.aborted&&generation.current===epoch&&slotIndex===currentIndex.current)
            setMessage('SunPy is exporting another frame. Waiting for its bounded export to finish; seeking cancels this wait.');
        },
      });
      if(!Array.isArray(payload.frames)||payload.frames.length===0){
        const meta=payload.meta&&typeof payload.meta==='object'?
          payload.meta as Record<string,unknown>:{};
        throw new Error(`No AIA exposure returned for this time: ${String(meta.frames_missing_reason??meta.reason??payload.reason??'source unavailable')}`);
      }
      if(payload.meta&&typeof payload.meta==='object'&&
         (payload.meta as Record<string,unknown>).fallback_applied)
        throw new Error('AIA source substituted another time window');
      const archive=await validateObservationReplay(JSON.parse(await serializeObservationSnapshot(payload)));
      const frame=archive.frames.reduce((best,item)=>
        Math.abs(Date.parse(item.obstime)-requested)<Math.abs(Date.parse(best.obstime)-requested)?item:best);
      if(Math.abs(Date.parse(frame.obstime)-requested)>150_000||
         (policy==='at-or-before'&&Date.parse(frame.obstime)>requested)||
         !frame.wcs_header||!frame.registration_geometry||
         !archive.archive_identity)throw new Error('No WCS-qualified AIA exposure within 2.5 minutes');
      const image:EarthFacingArchiveFrame={archiveId:archive.archive_identity.snapshotId,
        instrument:archive.instrument,wavelengthAngstrom:archive.wavelength_A,
        frameIndex:frame.index,observedAtUtc:frame.obstime,displaySha256:frame.display_sha256,
        declaredFitsSha256:frame.fits_sha256,gridSize:frame.grid_size,
        mapBase64:frame.map_b64,wcsHeader:frame.wcs_header,observer:frame.registration_geometry};
      const staged=payload.source_retention&&typeof payload.source_retention==='object'?
        payload.source_retention as Record<string,unknown>:null;
      const sourceTicket=staged?.state==='staged'&&staged.archiveId===image.archiveId&&
        typeof staged.ticket==='string'?staged.ticket:null;
      let model:RobPfssSnapshot|null=null,rotationDeg:number|null=null;
      let parentSha256:string|null=null;
      let modelStatus='No qualifying ROB model in the preceding 12 hours.';
      try{
        const imageMs=Date.parse(image.observedAtUtc);
        const modelCutoff=policy==='at-or-before'?requested:imageMs;
        const lookback=modelCutoff-MODEL_MAX_AGE;
        const entries=[...await monthlyEntries(modelCutoff,controller.signal)];
        if(monthWindow(lookback).key!==monthWindow(modelCutoff).key)
          entries.push(...await monthlyEntries(lookback,controller.signal));
        const candidate=entries.filter(entry=>{
          const at=Date.parse(entry.magnetogramTimeHintUtc);
          return at<=modelCutoff&&at>=lookback;
        }).sort((a,b)=>b.magnetogramTimeHintUtc.localeCompare(a.magnetogramTimeHintUtc))[0];
        if(candidate){
          const key=`${candidate.relativePath}:${candidate.catalogSha256}`;
          let cached=modelPairCache.current.get(key);
          if(!cached){
            const dateUtc=candidate.relativePath.slice(0,10).replaceAll('/','-');
            const query=new URLSearchParams({dateUtc,relativePath:candidate.relativePath,
              expectedCatalogSha256:candidate.catalogSha256});
            const pair=await responseJson(`/api/star-watcher/rob-pfss/playback-pair?${query}`,controller.signal);
            const verified=robPfssSnapshotSchema.parse(pair.snapshot);
            if(verified.relativePath!==candidate.relativePath||
               verified.catalogSha256!==candidate.catalogSha256)throw new Error('ROB model index identity changed');
            let parentRotation:number|null=null,parentHash:string|null=null;
            let status=`ROB ${verified.fitsDateObsUtc}; GONG candidate unavailable, so lines are hidden.`;
            if(pair.parent){
              const parent=pair.parent as Record<string,unknown>;
              const receipt=robPfssParentReceiptSchema.parse(parent.receipt);
              const map=solarGlobalRadialMapSchema.parse(parent.map);
              if(receipt.modelSha256!==verified.sourceSha256||map.source.sha256!==receipt.parentSha256)
                throw new Error('GONG candidate does not match ROB model identity');
              parentRotation=receipt.displayRotation.earthCarringtonLongitudeApproxDeg;
              parentHash=receipt.parentSha256;
              status=`ROB ${verified.fitsDateObsUtc}; GONG candidate ${receipt.parentSha256.slice(0,12)}…; display rotation approximate.`;
            }
            cached={model:verified,rotationDeg:parentRotation,parentSha256:parentHash,modelStatus:status};
            modelPairCache.current.set(key,cached);
          }
          const verified=cached.model;
          const verifiedMs=Date.parse(verified.fitsDateObsUtc);
          if(!Number.isFinite(verifiedMs)||verifiedMs>modelCutoff||verifiedMs<lookback)
            throw new Error('ROB FITS time falls outside the selected model clock');
          model=verified;
          rotationDeg=cached.rotationDeg;parentSha256=cached.parentSha256;
          modelStatus=cached.modelStatus+(policy==='nearest'&&imageMs>requested?
            ' Future image context; excluded from causal prediction.':'');
        }
      }catch(error){
        if(controller.signal.aborted)throw error;
        modelStatus=`Model gap: ${error instanceof Error?error.message:'source unavailable'}`;
      }
      if(controller.signal.aborted||generation.current!==epoch)return;
      const prior=retainedSlots.current.get(slotIndex);
      const retained=prior&&model&&parentSha256&&prior.archiveId===image.archiveId&&
        prior.sourceFitsSha256===image.declaredFitsSha256&&
        prior.modelSha256===model.sourceSha256&&prior.parentSha256===parentSha256?prior:null;
      const loaded:Loaded={image,model,rotationDeg,modelStatus,error:null,
        sourceTicket,parentSha256,retained};
      cache.current.set(slotIndex,loaded);
      if(slotIndex===currentIndex.current)
        setMessage(`Buffered ${new Date(requested).toISOString()} with observed AIA ${image.observedAtUtc}.`);
      if(preparedKeepDownloadedSet&&hasDisplayPair(loaded)&&!retained){
        try{
          setRetentionMessage(`Retaining source pair ${slotIndex+1}/${slots.length} while its image ticket is live…`);
          const saved=await retainSourcePair(loaded,controller.signal);
          if(!controller.signal.aborted&&generation.current===epoch&&
             readCachedAccountProfileIdentity().profileId===saved.owner){
            retainedSlots.current.set(slotIndex,saved.retained);
            if(cache.current.get(slotIndex)===loaded)
              cache.current.set(slotIndex,{...loaded,retained:saved.retained});
            setRetentionMessage(`Kept ${retainedSlots.current.size}/${slots.length} owner-scoped AIA, ROB and GONG source pairs. Save the range checkpoint when ready.`);
          }
        }catch(error){
          if(!controller.signal.aborted&&generation.current===epoch)
            setRetentionMessage(`Sample ${slotIndex+1} loaded but retention is incomplete: ${error instanceof Error?error.message:'source unavailable'}. Reload it before the source ticket expires.`);
        }
      }
    }catch(error){
      if(!controller.signal.aborted&&generation.current===epoch){
        const reason=error instanceof Error?error.message:'AIA source unavailable';
        cache.current.set(slotIndex,{image:null,model:null,rotationDeg:null,modelStatus:'Model not loaded',
          error:reason,
          sourceTicket:null,parentSha256:null,retained:null});
        if(isSolarStorageBlock(reason))setStorageHold({slot:slotIndex,reason});
        if(slotIndex===currentIndex.current||isSolarStorageBlock(reason))
          setMessage(`${isSolarStorageBlock(reason)?'Storage blocked buffering':'Gap'} at ${new Date(requested).toISOString()}: ${reason}`);
      }
    }finally{
      if(pending.current.get(slotIndex)===controller){pending.current.delete(slotIndex);setRevision(value=>value+1);}
    }
  },[slots,monthlyEntries,offlineManifest,preparedKeepDownloadedSet]);

  const retainSelected=async()=>{
    const slotIndex=index,loaded=cache.current.get(slotIndex),epoch=generation.current;
    if(!loaded?.image||!loaded.model||!loaded.parentSha256||!loaded.sourceTicket)return;
    retentionRequest.current?.abort();
    const controller=new AbortController();retentionRequest.current=controller;setRetaining(true);
    setRetentionMessage('Retaining selected AIA, ROB and GONG source bytes…');
    try{
      const {owner,retained}=await retainSourcePair(loaded,controller.signal);
      if(controller.signal.aborted||generation.current!==epoch||
         readCachedAccountProfileIdentity().profileId!==owner)return;
      retainedSlots.current.set(slotIndex,retained);
      if(cache.current.get(slotIndex)===loaded)cache.current.set(slotIndex,{...loaded,retained});
      setRevision(value=>value+1);
      setRetentionMessage(`Retained selected source pair: AIA ${retained.imageId}; ROB ${retained.modelId}; GONG candidate ${retained.parentSha256}. Reopening and time-window manifest are separate checks.`);
    }catch(error){
      if(!controller.signal.aborted)setRetentionMessage(
        `Retention incomplete: ${error instanceof Error?error.message:'source unavailable'}. Earlier source components may already be retained; reload this frame if its image ticket expired.`);
    }finally{
      if(retentionRequest.current===controller){retentionRequest.current=null;setRetaining(false);}
    }
  };

  const saveCheckpoint=async()=>{
    if(slots.length<2||retainedSlots.current.size===0)return;
    manifestRequest.current?.abort();const controller=new AbortController();
    manifestRequest.current=controller;setManifestBusy(true);
    try{
      const input=solarTimePlaybackSaveSchema.parse({
        startUtc:new Date(slots[0].requestedMs).toISOString(),
        endUtc:new Date(slots[slots.length-1].requestedMs).toISOString(),
        imagePolicy:slots[0].imagePolicy,requestedStepDays:preparedStepDays,
        slots:slots.map((slot,slotIndex)=>{
          const retained=retainedSlots.current.get(slotIndex),requestedAtUtc=new Date(slot.requestedMs).toISOString();
          return retained?{state:'retained_pair',requestedAtUtc,
            imageId:retained.imageId,modelId:retained.modelId,
            expectedImageFitsSha256:retained.sourceFitsSha256,
            expectedModelSha256:retained.modelSha256,
            expectedParentSha256:retained.parentSha256}:{
            state:'unresolved',requestedAtUtc,
            reason:cache.current.get(slotIndex)?.error?'client_observed_gap':'not_retained'};
        }),
      });
      const saved=solarTimePlaybackReadViewSchema.parse(await postJson(
        '/api/star-watcher/time-playback/retain',input,controller.signal));
      const reopened=solarTimePlaybackReadViewSchema.parse(await responseJson(
        `/api/star-watcher/time-playback/retained?${new URLSearchParams({manifestId:saved.manifestId})}`,
        controller.signal));
      if(saved.manifestId!==reopened.manifestId||
         JSON.stringify(saved.slots)!==JSON.stringify(reopened.slots))
        throw new Error('Saved timeline differs from immediate source-byte readback');
      if(controller.signal.aborted)return;
      setManifestInput(saved.manifestId);
      setManifestMessage(`Saved and rehashed ${saved.slots.filter(slot=>slot.state==='retained_pair').length}/${saved.slots.length} selected pairs in ${saved.manifestId}. Unresolved slots are not verified source absence.`);
    }catch(error){if(!controller.signal.aborted)setManifestMessage(
      `Checkpoint incomplete: ${error instanceof Error?error.message:'source unavailable'}`);}
    finally{if(manifestRequest.current===controller){manifestRequest.current=null;setManifestBusy(false);}}
  };
  const listCheckpoints=async()=>{
    manifestRequest.current?.abort();const controller=new AbortController();
    manifestRequest.current=controller;setManifestBusy(true);
    try{
      const list=solarTimePlaybackListSchema.parse(await responseJson(
        '/api/star-watcher/time-playback/retained-list',controller.signal));
      if(controller.signal.aborted)return;
      setSavedList(list.entries);
      setManifestMessage(`${list.entries.length} owner-scoped checkpoint IDs listed; source bytes rehash on open.`);
    }catch(error){if(!controller.signal.aborted)setManifestMessage(
      error instanceof Error?error.message:'Checkpoint list unavailable');}
    finally{if(manifestRequest.current===controller){manifestRequest.current=null;setManifestBusy(false);}}
  };
  const openCheckpoint=async()=>{
    manifestRequest.current?.abort();const controller=new AbortController();
    manifestRequest.current=controller;setManifestBusy(true);
    try{
      const expectedManifestId=manifestInput.trim();
      let owner=readCachedAccountProfileIdentity().profileId;
      if(!owner){await fetchAccountCapabilityPolicy();owner=readCachedAccountProfileIdentity().profileId;}
      if(controller.signal.aborted)return;
      if(!owner)throw new Error('Sign in to reopen retained solar sources.');
      const manifest=solarTimePlaybackReadViewSchema.parse(await responseJson(
        `/api/star-watcher/time-playback/retained?${new URLSearchParams({manifestId:expectedManifestId})}`,
        controller.signal));
      if(controller.signal.aborted)return;
      if(manifest.ownerProfileId!==owner||manifest.manifestId!==expectedManifestId)
        throw new Error('Checkpoint identity differs from the selected owner and ID');
      generation.current++;
      for(const request of pending.current.values())request.abort();
      retentionRequest.current?.abort();pending.current.clear();cache.current.clear();
      retainedSlots.current.clear();monthCache.current.clear();modelPairCache.current.clear();
      setStorageHold(null);
      manifest.slots.forEach((slot,slotIndex)=>{
        if(slot.state==='retained_pair')retainedSlots.current.set(slotIndex,{
          imageId:slot.imageId,modelId:slot.modelId,parentSha256:slot.gongCandidateSha256,
          archiveId:slot.archiveId,sourceFitsSha256:slot.imageFitsSha256,
          modelSha256:slot.modelSha256});
      });
      setOfflineManifest(manifest);setSlots(manifest.slots.map(slot=>({
        requestedMs:Date.parse(slot.requestedAtUtc),imagePolicy:manifest.imagePolicy})));
      setStartInput(manifest.startUtc.slice(0,19));setEndInput(manifest.endUtc.slice(0,19));
      setImagePolicy(manifest.imagePolicy);setStepDays(manifest.requestedStepDays);
      setPreparedKeepDownloadedSet(false);
      setPreparedStepDays(manifest.requestedStepDays);
      playheadRef.current=Date.parse(manifest.startUtc);
      fieldRotationRef.current=0;
      fieldPoseRef.current.identity();
      setIndex(0);setPlayheadMs(playheadRef.current);setPlaying(false);setPlayWhenReady(false);
      setPreparedImageCount(0);setRevision(value=>value+1);
      setManifestMessage(`Opened ${manifest.manifestId}; ${manifest.coverage}. Each selected pair rehashes again when viewed.`);
    }catch(error){if(!controller.signal.aborted)setManifestMessage(
      `Checkpoint unavailable: ${error instanceof Error?error.message:'source unavailable'}`);}
    finally{if(manifestRequest.current===controller){manifestRequest.current=null;setManifestBusy(false);}}
  };

  React.useEffect(()=>{
    if(!preparedKeepDownloadedSet||slots.length<2||retainedSlots.current.size!==slots.length||
       pending.current.size||manifestBusy||autoSavedGeneration.current===generation.current)return;
    autoSavedGeneration.current=generation.current;
    void saveCheckpoint();
  },[preparedKeepDownloadedSet,slots,revision,manifestBusy]);

  React.useEffect(()=>{
    if(!slots.length)return;
    // The SunPy exporter is shared. Fill one slot at a time, ahead of the
    // playhead first, then earlier gaps. A seek reprioritizes the request.
    const wanted=nextSolarBufferSlot(slots.length,index,new Set(cache.current.keys()));
    for(const [slot,controller] of pending.current){
      if(slot!==wanted){
        controller.abort();pending.current.delete(slot);
        // Month-index promises share the canceled request's AbortSignal.
        monthCache.current.clear();
      }
    }
    if(storageHold&&wanted!==index)return;
    if(wanted!==null&&!pending.current.has(wanted))void load(wanted);
  },[slots,index,revision,load,storageHold]);
  React.useEffect(()=>{
    if(!playWhenReady||slots.length<2)return;
    const uniqueImages=new Set(slots.map((_,slot)=>{
      const image=cache.current.get(slot)?.image;
      return image?`${image.archiveId}:${image.frameIndex}:${image.displaySha256}`:null;
    }).filter(Boolean));
    if(preparedImageCount>=uniqueImages.size&&slots.every((_,slot)=>hasDisplayPair(cache.current.get(slot)))){
      setPlayWhenReady(false);
      setPlaying(true);
    }
  },[playWhenReady,slots,revision,preparedImageCount]);
  React.useEffect(()=>{
    if(!playing||slots.length<2)return;
    const end=slots[slots.length-1].requestedMs;
    const startWall=performance.now(),startSolar=playheadRef.current;
    let animation=0,lastPaint=0;
    const tick=(now:number)=>{
      animation=window.requestAnimationFrame(tick);
      if(now-lastPaint<32)return;
      lastPaint=now;
      const at=playheadRef.current;
      if(at>=end){setPlaying(false);return;}
      const sourceIndex=slotAtTime(slots,at);
      const source=cache.current.get(sourceIndex);
      if(source?.error&&isSolarStorageBlock(source.error)){setPlaying(false);return;}
      if(!source)return;
      const next=Math.min(end,startSolar+Math.max(0,now-startWall)*rate);
      if(next<=at)return;
      playheadRef.current=next;
      setEarthViewPose(next);
      setPlayheadMs(next);
      setIndex(slotAtTime(slots,next));
      if(next>=end)setPlaying(false);
    };
    animation=window.requestAnimationFrame(tick);
    return()=>window.cancelAnimationFrame(animation);
  },[playing,slots,revision,rate]);
  React.useEffect(()=>()=>{
    generation.current++;for(const controller of pending.current.values())controller.abort();
    retentionRequest.current?.abort();
    manifestRequest.current?.abort();
    pending.current.clear();cache.current.clear();monthCache.current.clear();modelPairCache.current.clear();
  },[]);

  const raster=React.useMemo(()=>{
    const image=selected?.image;if(!image)return null;
    try{return new Float32Array(Uint8Array.from(atob(image.mapBase64),value=>value.charCodeAt(0)).buffer);}
    catch{return null;}
  },[selected?.image]);
  const readySlots=[...cache.current.entries()].filter(([,value])=>hasDisplayPair(value))
    .map(([slot])=>slot).sort((a,b)=>a-b);
  const preloadImages=React.useMemo(()=>slots.flatMap((_,slot)=>{
    const image=cache.current.get(slot)?.image;return image?[image]:[];
  }),[slots,revision]);
  const uniqueImageCount=new Set(preloadImages.map(image=>
    `${image.archiveId}:${image.frameIndex}:${image.displaySha256}`)).size;
  const readyRuns=solarBufferRuns(readySlots);
  const sourceReady=slots.length>1&&readySlots.length===slots.length;
  const allReady=sourceReady&&preparedImageCount>=uniqueImageCount;
  const gapCount=[...cache.current.values()].filter(value=>!hasDisplayPair(value)&&!!value.error).length;
  const durationMs=slots.length>1?(slots[slots.length-1].requestedMs-slots[0].requestedMs)/rate:0;
  const sampleViewingGapMs=slots.length>1?(slots[1].requestedMs-slots[0].requestedMs)/rate:0;
  const elapsedSolarMs=slots.length?playheadMs-slots[0].requestedMs:0;
  const boundary=slots[index]?.requestedMs??0;
  const blendSolarMs=index>0?Math.min((boundary-slots[index-1].requestedMs)/4,rate*800):0;
  const previous=index>0?cache.current.get(index-1):undefined;
  const fading=playing&&!!previous&&hasDisplayPair(previous)&&hasDisplayPair(selected)&&
    blendSolarMs>0&&playheadMs>=boundary&&playheadMs<boundary+blendSolarMs;
  const modelChanging=fading&&previous?.model?.sourceSha256!==selected?.model?.sourceSha256;
  const blendAlpha=fading?Math.max(0,Math.min(1,(playheadMs-boundary)/blendSolarMs)):1;
  const imageAge=selected?.image?
    (Date.parse(selected.image.observedAtUtc)-playheadMs)/1000:null;
  const modelAge=selected?.model?
    (playheadMs-Date.parse(selected.model.fitsDateObsUtc))/3600000:null;
  return <section aria-label="Star Watcher solar time player" className="space-y-3 rounded-xl border border-cyan-700/40 bg-slate-950/80 p-4 text-slate-200">
    <div><h2 className="text-lg font-semibold">Solar magnetic globe time player</h2>
      <p className="text-xs text-slate-400">Observed AIA 193 Å frames and sampled ROB PFSS model snapshots use separate source clocks. Playback never invents intermediate magnetic lines.</p></div>
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="grid gap-1">Start UTC<input type="datetime-local" step="1" value={startInput}
        onChange={event=>setStartInput(event.target.value)} className="rounded border border-slate-600 bg-slate-900 p-1"/></label>
      <label className="grid gap-1">End UTC<input type="datetime-local" step="1" value={endInput}
        onChange={event=>setEndInput(event.target.value)} className="rounded border border-slate-600 bg-slate-900 p-1"/></label>
      <label className="grid gap-1">Image selection<select value={imagePolicy}
        onChange={event=>setImagePolicy(event.target.value as ImagePolicy)} className="rounded border border-slate-600 bg-slate-900 p-1">
        <option value="at-or-before">At or before playhead (causal)</option>
        <option value="nearest">Nearest exposure (inspection)</option>
      </select></label>
      <label className="grid gap-1">Requested sample spacing<select value={stepDays}
        onChange={event=>setStepDays(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-900 p-1">
        <option value={1/1440}>1 solar minute</option><option value={3/1440}>3 solar minutes</option>
        <option value={10/1440}>10 solar minutes</option><option value={1/24}>1 solar hour</option>
        <option value={0.25}>6 solar hours</option><option value={0.5}>12 solar hours</option>
        <option value={1}>1 solar day</option><option value={3}>3 solar days</option>
      </select></label>
      <label className="flex max-w-64 items-center gap-2"><input type="checkbox" checked={keepDownloadedSet}
        onChange={event=>setKeepDownloadedSet(event.target.checked)}/>
        Keep downloaded set and save a replay checkpoint (up to {RETAINED_SET_MAX_SLOTS} samples)</label>
      <button type="button" onClick={prepare} className="rounded border border-cyan-500 px-3 py-1">Prepare range</button>
    </div>
    {slots.length>0&&<div className="space-y-2 rounded border border-slate-700 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>{
          if(playing||playWhenReady){setPlaying(false);setPlayWhenReady(false);return;}
          if(playheadRef.current>=slots[slots.length-1].requestedMs)seek(slots[0].requestedMs);
          if(allReady)setPlaying(true);else setPlayWhenReady(true);
        }} className="rounded border border-cyan-500 px-2 py-1">{playing?'Pause':playWhenReady?'Cancel queued play':'Play'}</button>
        <button type="button" onClick={()=>{setPlaying(false);seek(slots[0].requestedMs);}} className="rounded border border-slate-600 px-2 py-1">First frame</button>
        <button type="button" onClick={()=>{setPlaying(false);seek(slots[Math.max(0,index-1)].requestedMs);}} className="rounded border border-slate-600 px-2 py-1">←</button>
        <button type="button" onClick={()=>{setPlaying(false);seek(slots[Math.min(slots.length-1,index+1)].requestedMs);}} className="rounded border border-slate-600 px-2 py-1">→</button>
        <button type="button" onClick={()=>{setPlaying(false);seek(slots[slots.length-1].requestedMs);}} className="rounded border border-slate-600 px-2 py-1">Last frame</button>
        <label>Speed <select value={speed} onChange={event=>setSpeed(event.target.value as typeof speed)} className="rounded border border-slate-600 bg-slate-900 p-1">
          <option value="fit30s">Fit selected range / 30 seconds</option>
          <option value="fit15s">Fit selected range / 15 seconds</option>
          <option value="realtime">Real elapsed time (1×)</option>
          <option value="rotation10m">One mean Carrington recurrence / 10 min</option>
          <option value="rotation1m">One mean Carrington recurrence / 1 min</option>
        </select></label>
      </div>
      <p role="status">Solar range {((slots[slots.length-1].requestedMs-slots[0].requestedMs)/DAY).toFixed(4)} days · viewing time {wallDuration(elapsedSolarMs/rate)} / {wallDuration(durationMs)} at selected speed · source changes about every {wallDuration(sampleViewingGapMs)} (last interval may differ) · {allReady?'all source pairs and globe textures ready for an uninterrupted run':`${readySlots.length}/${slots.length} source pairs and ${preparedImageCount}/${uniqueImageCount} distinct globe textures ready; Play waits for both${gapCount?`; ${gapCount} source gap${gapCount===1?'':'s'} need review`:''}`}.</p>
      <div className="space-y-1">
        <div role="img" aria-label={`${readySlots.length} of ${slots.length} image and magnetic-field pairs buffered`}
          className="relative h-1 overflow-hidden rounded bg-slate-700">
          {readyRuns.map(run=><span key={run.start} className="absolute top-0 h-full bg-white"
            style={{left:`${100*run.start/slots.length}%`,
              width:`${100*(run.end-run.start+1)/slots.length}%`}}/>)}
        </div>
        <input type="range" aria-label="Solar time playhead" min={slots[0].requestedMs}
          max={slots[slots.length-1].requestedMs} step={1000} value={playheadMs}
          onChange={event=>{setPlaying(false);seek(Number(event.target.value));}} className="w-full"/>
      </div>
      <p>Playhead {new Date(playheadMs).toISOString()} · held source sample {current?new Date(current.requestedMs).toISOString():'—'} · {current?.imagePolicy==='at-or-before'?'causal source selection':'nearest-frame inspection'} · sample {index+1}/{slots.length} · ready pairs {readySlots.length}/{slots.length} (white line) · retained source pairs {retainedSlots.current.size}/{slots.length} · {storageHold?'storage blocked ahead':pending.current.has(index)?'loading current frame':playing&&index<slots.length-1&&!cache.current.has(index+1)?'buffering next frame':playing?'playing':pending.current.size?'loading ahead':'paused'}.</p>
      <p className="text-slate-400">The UTC playhead advances continuously after all selected sources are buffered. AIA textures change only at their requested samples; a PFSS geometry remains held until a different source model is selected. A fade is a display transition, not a measured intermediate image or solved intermediate field.</p>
      <p className="text-slate-400">Earth-view camera fixed. Each AIA texture uses its own WCS observer longitude. The held PFSS lines keep a fixed {(-fieldRotationRef.current*180/Math.PI).toFixed(2)}° observer-frame display pose until the next source sample; there is no between-sample magnetic motion. With wide image spacing, the held image and lines are a sparse comparison, not a continuous solar measurement.</p>
      {fading&&<p className="text-amber-200">Display transition: previous sample {new Date(slots[index-1].requestedMs).toISOString()} → current sample {new Date(boundary).toISOString()}, {Math.round(blendAlpha*100)}% current. Both source times remain distinct.</p>}
      <p className="text-slate-400">Completed frames stay in memory while this range is open. Preparing another range clears the playback buffer. {preparedKeepDownloadedSet?'This range retains each complete source pair as it loads, then saves an owner-scoped checkpoint and verifies its source bytes.':'Use Retain displayed source pair and Save sampled checkpoint to keep source bytes for replay.'}</p>
      {storageHold&&<div role="status" className="space-y-1 text-amber-300">
        <p>Loading ahead paused at sample {storageHold.slot+1}: {storageHold.reason}. This is a storage limit, not a missing solar observation.</p>
        <button type="button" onClick={()=>{cache.current.delete(storageHold.slot);
          setIndex(storageHold.slot);setStorageHold(null);setRevision(value=>value+1);}}
          className="rounded border border-amber-500 px-2 py-1">Retry buffering after freeing storage</button>
      </div>}
      {gapCount>0&&<button type="button" onClick={()=>{
        for(const [slot,value] of cache.current)if(value.error&&!hasDisplayPair(value))cache.current.delete(slot);
        setStorageHold(null);setRevision(value=>value+1);
      }} className="rounded border border-amber-500 px-2 py-1">Retry unresolved samples</button>}
      {selected?.error&&storageHold?.slot!==index&&<button type="button" onClick={()=>{cache.current.delete(index);
        setRevision(value=>value+1);}} className="rounded border border-amber-500 px-2 py-1">Retry gap</button>}
      {selected?.image&&<button type="button" onClick={()=>{retentionRequest.current?.abort();
        cache.current.delete(index);setRevision(value=>value+1);}}
        className="rounded border border-slate-600 px-2 py-1">Reload current source</button>}
      <button type="button" disabled={retaining||pending.current.has(index)||!selected?.image||!selected?.model||
        !selected?.sourceTicket||!selected?.parentSha256||!!selected?.retained}
        onClick={()=>void retainSelected()} className="rounded border border-cyan-500 px-2 py-1 disabled:opacity-40">Retain displayed source pair</button>
      <p>{selected?.retained?'Selected AIA FITS, ROB FITS/index and GONG candidate retained under owner-scoped IDs.':'Selected source bytes are not yet retained for replay.'}</p>
      <p role="status">{retentionMessage}</p>
    </div>}
    <div className="space-y-2 rounded border border-slate-700 p-2 text-xs">
      <p className="font-medium">Retained timeline checkpoint</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={manifestBusy||slots.length<2||retainedSlots.current.size===0}
          onClick={()=>void saveCheckpoint()} className="rounded border border-cyan-500 px-2 py-1 disabled:opacity-40">Save sampled checkpoint</button>
        <button type="button" disabled={manifestBusy} onClick={()=>void listCheckpoints()}
          className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">List saved checkpoints</button>
        <button type="button" disabled={manifestBusy||!/^solar-time-playback:[a-f0-9]{64}$/.test(manifestInput.trim())}
          onClick={()=>void openCheckpoint()} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">Open and verify checkpoint</button>
      </div>
      <label className="grid gap-1">Checkpoint ID<input value={manifestInput}
        onChange={event=>setManifestInput(event.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-900 p-1"/></label>
      {savedList.length>0&&<select aria-label="Saved solar time checkpoints" value=""
        onChange={event=>setManifestInput(event.target.value)}
        className="max-w-full rounded border border-slate-600 bg-slate-900 p-1">
        <option value="">Choose a saved checkpoint</option>
        {savedList.map(item=><option key={item.manifestId} value={item.manifestId}>
          {item.startUtc} → {item.endUtc} · {item.retainedPairCount}/{item.slotCount} pairs
        </option>)}
      </select>}
      <p role="status">{manifestMessage}</p>
    </div>
    <p role="status" className="text-xs text-amber-100">{message}</p>
    <SolarTemporalMagneticGlobe key={generation.current} image={(fading?previous:selected)?.image??null}
      referenceImage={cache.current.get(0)?.image??null} fieldPoseRef={fieldPoseRef}
      snapshot={(fading?previous:selected)?.model??null}
      rotationDeg={(fading?previous:selected)?.rotationDeg??null}
      nextImage={fading?selected?.image??null:null}
      nextSnapshot={modelChanging?selected?.model??null:null}
      nextRotationDeg={modelChanging?selected?.rotationDeg??null:null} blendAlpha={blendAlpha}
      preloadImages={preloadImages} onPrepared={setPreparedImageCount}/>
    <div className="grid gap-3 text-xs md:grid-cols-2">
      <div className="space-y-1 rounded border border-slate-700 p-2">
        <p className="font-medium">AIA 193 Å source frame</p>
        {raster&&selected?.image?<SolarObservationRaster data={raster} size={selected.image.gridSize} palette="sdo_aia193_lct_sqrt/1"/>:null}
        <p>{selected?.image?`Observed ${selected.image.observedAtUtc}; signed observation minus playhead offset ${imageAge?.toFixed(1)} s${imageAge!==null&&imageAge>0?' (future context, not a causal frame)':''}; display SHA-256 ${selected.image.displaySha256}; declared FITS SHA-256 ${selected.image.declaredFitsSha256}.`:
          selected?.error?`Source gap: ${selected.error}`:'Waiting for a source-qualified frame.'}</p>
      </div>
      <div className="space-y-1 rounded border border-slate-700 p-2">
        <p className="font-medium">Magnetic-model source</p>
        <p>{selected?.modelStatus??'Waiting for model lookup.'}</p>
        {selected?.model&&<p>Model source SHA-256 {selected.model.sourceSha256}; signed age at playhead {modelAge?.toFixed(2)} h{modelAge!==null&&modelAge<0?' (future model context)':''}; {selected.model.lines.length} of {selected.model.totalLines} lines sampled. Exact solver-input bytes and quantitative image registration remain unverified.</p>}
      </div>
    </div>
    <p className="text-[11px] text-slate-400">The optional Carrington speed presets only scale the playback clock; Earth-view pose now follows source WCS observer longitudes. Neither a fixed PFSS snapshot nor the pose interpolation models evolving solar magnetism or latitude-dependent rotation. Buffered frames are transient until retained. A saved checkpoint records only selected retained slots; unresolved slots do not prove source absence.</p>
  </section>;
}
