import React from 'react';
import {Canvas} from '@react-three/fiber';
import {Line,OrbitControls} from '@react-three/drei';
import {CanvasTexture,SRGBColorSpace,VideoTexture} from 'three';
import {robPfssRangeSchema,robPfssSnapshotSchema,type RobPfssSnapshot}
  from '../../../shared/solar-rob-pfss';
import {robPfssParentReceiptSchema} from '../../../shared/solar-rob-pfss';
import {solarGongPfssDaySchema,type SolarGongPfssDay} from '../../../shared/solar-gong-pfss-day';
import {solarPfssGeometrySchema,type SolarPfssGeometry} from '../../../shared/solar-pfss-geometry';
import {solarDailyMoviePairSchema,type SolarDailyMoviePairManifest}
  from '../../../shared/solar-daily-movie-pairs';

type Manifest={schemaVersion:'sdo-aia193-daily-movie/1';dateUtc:string;movieSourceUrl:string;
  frameIndexSourceUrl:string;movieSha256:string;movieBytes:number;frameTimesUtc:string[];
  frameCount:number;retainedAtUtc:string};
type HmiManifest={schemaVersion:'sdo-hmi-los-daily-browse-movie/1';dateUtc:string;
  movieSourceUrl:string;frameIndexSourceUrl:string;movieSha256:string;movieBytes:number;
  frameTimesUtc:string[];frameCount:number;
  measurementClass:'photospheric_los_browse_visualization_not_calibrated_fits'};
type Entry=ReturnType<typeof robPfssRangeSchema.parse>['entries'][number];
type ModelResult={snapshot:RobPfssSnapshot|null;rotationDeg:number|null;status:string};
const MODEL_MAX_AGE_MS=12*3_600_000;
const LOCAL_MODEL_MAX_AGE_MS=2*3_600_000;
const HMI_DISPLAY_MAX_GAP_MS=10*60_000;
const vertexShader=`varying vec3 point; void main(){point=position;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`uniform sampler2D frame; uniform sampler2D hmiFrame;
  uniform float magneticBlend; varying vec3 point;
  void main(){if(point.z<0.0)discard;
    vec2 uv=vec2(0.5+point.x*0.399,0.5+point.y*0.399);
    gl_FragColor=mix(texture2D(frame,uv),texture2D(hmiFrame,uv),magneticBlend);}`;
function xyz(r:number,latitude:number,longitude:number):[number,number,number]{
  const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180;
  return [r*Math.cos(lat)*Math.cos(lon),r*Math.sin(lat),r*Math.cos(lat)*Math.sin(lon)];
}
type DisplayLine={key:string;topology:'open'|'closed'|'unclassified';polarity:string;points:Array<[number,number,number]>};
function Globe({video,hmiCanvas,hmiRevision,magneticBlend,lines,rotationDeg,showCorona}:{video:HTMLVideoElement;
  hmiCanvas:HTMLCanvasElement|null;hmiRevision:number;magneticBlend:number;
  lines:DisplayLine[]|null;rotationDeg:number|null;showCorona:boolean}){
  const texture=React.useMemo(()=>{const value=new VideoTexture(video);value.colorSpace=SRGBColorSpace;
    // A paused decoded first frame does not necessarily trigger VideoTexture's
    // requestVideoFrameCallback; upload it explicitly before Play is pressed.
    if(video.readyState>=video.HAVE_CURRENT_DATA)value.needsUpdate=true;
    return value;},[video]);
  React.useEffect(()=>()=>texture.dispose(),[texture]);
  React.useEffect(()=>{
    const update=()=>{if(video.readyState>=video.HAVE_CURRENT_DATA)texture.needsUpdate=true;};
    video.addEventListener('loadeddata',update);video.addEventListener('seeked',update);
    update();
    return()=>{video.removeEventListener('loadeddata',update);video.removeEventListener('seeked',update);};
  },[video,texture]);
  const hmiTexture=React.useMemo(()=>{
    if(!hmiCanvas)return null;
    const value=new CanvasTexture(hmiCanvas);value.colorSpace=SRGBColorSpace;
    return value;
  },[hmiCanvas]);
  React.useEffect(()=>()=>hmiTexture?.dispose(),[hmiTexture]);
  React.useEffect(()=>{if(hmiTexture)hmiTexture.needsUpdate=true;},[hmiTexture,hmiRevision]);
  const uniforms=React.useMemo(()=>({frame:{value:texture},
    hmiFrame:{value:hmiTexture??texture},magneticBlend:{value:hmiTexture?magneticBlend:0}}),
    [texture,hmiTexture,magneticBlend]);
  return <>
    <ambientLight intensity={0.8}/>
    {/* This plane is fixed to the Earth observer, and is not a 3D corona reconstruction. */}
    {/* Match the disk's apparent size after the farther plane's perspective projection. */}
    {showCorona&&<mesh position={[0,0,-1.12]}><planeGeometry args={[3.46,3.46]}/>
      <meshBasicMaterial map={texture} depthWrite={false}/></mesh>}
    <mesh><sphereGeometry args={[0.998,96,48]}/><meshBasicMaterial color="#1b1c20"/></mesh>
    <mesh><sphereGeometry args={[1,128,64]}/>
      <shaderMaterial key={texture.uuid} uniforms={uniforms} vertexShader={vertexShader}
        fragmentShader={fragmentShader} depthWrite={true}/></mesh>
    {lines&&rotationDeg!==null&&lines.map(line=><Line key={line.key}
      points={line.points.map(([r,lat,lon])=>xyz(r,lat,(lon+rotationDeg)%360))}
      color={line.topology==='closed'?'#e2e8f0':line.polarity==='negative'?'#7298ff':'#f17f7f'}
      lineWidth={1.2} transparent opacity={0.82}/>)}
    <OrbitControls enablePan={false} minDistance={2.4} maxDistance={9}/>
  </>;
}
async function json(url:string,signal:AbortSignal):Promise<Record<string,unknown>>{
  const response=await fetch(url,{credentials:'include',cache:'no-store',signal});
  const value=await response.json() as Record<string,unknown>;
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(!response.ok)throw new Error(String(value.error??`HTTP ${response.status}`));
  return value;
}
async function sha256(bytes:ArrayBuffer){
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(value=>value.toString(16).padStart(2,'0')).join('');
}
function candidateAt(entries:Entry[],atMs:number){
  return entries.filter(entry=>{const t=Date.parse(entry.magnetogramTimeHintUtc);
    return t<=atMs&&t>=atMs-MODEL_MAX_AGE_MS;}).at(-1)??null;
}
export function SolarDailyMoviePlayer(){
  const [dateUtc,setDateUtc]=React.useState(()=>new Date(Date.now()-2*86_400_000).toISOString().slice(0,10));
  const [manifest,setManifest]=React.useState<Manifest|null>(null);
  const [video,setVideo]=React.useState<HTMLVideoElement|null>(null);
  const [hmiManifest,setHmiManifest]=React.useState<HmiManifest|null>(null);
  const [pairManifest,setPairManifest]=React.useState<SolarDailyMoviePairManifest|null>(null);
  const [hmiCanvas,setHmiCanvas]=React.useState<HTMLCanvasElement|null>(null);
  const [hmiReady,setHmiReady]=React.useState(false);
  const [hmiFrameIndex,setHmiFrameIndex]=React.useState(-1);
  const [hmiRevision,setHmiRevision]=React.useState(0);
  const [bufferedHmiCount,setBufferedHmiCount]=React.useState(0);
  const [bufferedHmiPrefix,setBufferedHmiPrefix]=React.useState(0);
  const [hmiFetchRevision,setHmiFetchRevision]=React.useState(0);
  const [hmiLoading,setHmiLoading]=React.useState(false);
  const [buffering,setBuffering]=React.useState(false);
  const [hmiStatus,setHmiStatus]=React.useState('HMI browse movie not loaded.');
  const [magneticBlend,setMagneticBlend]=React.useState(0.4);
  const [ready,setReady]=React.useState(false);
  const [frameIndex,setFrameIndex]=React.useState(0);
  const [playing,setPlaying]=React.useState(false);
  const [durationSeconds,setDurationSeconds]=React.useState(30);
  const [showCorona,setShowCorona]=React.useState(true);
  const [status,setStatus]=React.useState('Choose a UTC day and load its official AIA 193 Å daily movie.');
  const [entries,setEntries]=React.useState<Entry[]>([]);
  const [models,setModels]=React.useState<Map<string,ModelResult>>(new Map());
  const [localDay,setLocalDay]=React.useState<SolarGongPfssDay|null>(null);
  const [localModels,setLocalModels]=React.useState<Map<string,SolarPfssGeometry>>(new Map());
  const [modelIndexStatus,setModelIndexStatus]=React.useState('Model index not loaded.');
  const controller=React.useRef<AbortController|null>(null);
  const blobUrl=React.useRef<string|null>(null);
  const hmiFrames=React.useRef(new Map<number,{blob:Blob;sha256:string;sourceUrl:string}>());
  const failedHmiFrames=React.useRef(new Set<number>());
  const displayedHmiIndex=React.useRef(-1);
  const frameTime=manifest?.frameTimesUtc[Math.min(frameIndex,manifest.frameCount-1)]??null;
  const currentPair=pairManifest?.pairs[frameIndex]??null;
  const nearestHmiTime=currentPair?.hmiTimeUtc??null;
  const hmiShownTime=hmiFrameIndex>=0?
    hmiManifest?.frameTimesUtc[Math.min(hmiFrameIndex,hmiManifest.frameCount-1)]??null:null;
  const shownHmiReceipt=hmiFrames.current.get(hmiFrameIndex)??null;
  const hmiGapMinutes=frameTime&&hmiShownTime?
    Math.abs(Date.parse(frameTime)-Date.parse(hmiShownTime))/60_000:null;
  const hmiDisplayAllowed=hmiReady&&currentPair?.withinDisplayWindow===true&&
    hmiFrameIndex===currentPair.hmiFrameIndex&&
    frameTime!==null&&hmiShownTime!==null&&
    Math.abs(Date.parse(frameTime)-Date.parse(hmiShownTime))<=HMI_DISPLAY_MAX_GAP_MS;
  const canPlay=ready&&!hmiLoading&&(!hmiManifest||
    bufferedHmiPrefix>=Math.min(12,hmiManifest.frameCount))&&
    (!localDay||localModels.size===localDay.modelCount);
  const candidate=frameTime?candidateAt(entries,Date.parse(frameTime)):null;
  const model=candidate?models.get(candidate.relativePath):null;
  const validModel=model?.snapshot&&frameTime&&
    Date.parse(model.snapshot.fitsDateObsUtc)<=Date.parse(frameTime)&&
    Date.parse(frameTime)-Date.parse(model.snapshot.fitsDateObsUtc)<=MODEL_MAX_AGE_MS?model:null;
  const localEntry=localDay&&frameTime?[...localDay.entries].reverse().find(entry=>{
    const age=Date.parse(frameTime)-Date.parse(entry.epochUtc);
    return age>=0&&age<=LOCAL_MODEL_MAX_AGE_MS;})??null:null;
  const localModel=localEntry?localModels.get(localEntry.modelId)??null:null;
  const displayLines:DisplayLine[]|null=localDay?
    localModel?.lines.map(line=>({...line,key:`${localModel.modelId}-${line.lineId}`}))??null:
    validModel?.snapshot?.lines.map(line=>({...line,key:`${validModel.snapshot!.sourceSha256}-${line.lineIndex}`}))??null;
  const displayRotation=localDay?localModel?localEntry!.displayRotationDeg:null:
    validModel?.rotationDeg??null;
  const sourceCadenceMinutes=manifest&&manifest.frameCount>1?
    (Date.parse(manifest.frameTimesUtc.at(-1)!)-Date.parse(manifest.frameTimesUtc[0]))/
      (manifest.frameCount-1)/60_000:null;
  React.useEffect(()=>()=>{controller.current?.abort();
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);},[]);
  React.useEffect(()=>{
    if(!video||!manifest)return;
    let cancelled=false;let callback=0;
    const update=(mediaTime:number)=>{
      if(cancelled||!Number.isFinite(video.duration)||video.duration<=0)return;
      const index=Math.min(manifest.frameCount-1,Math.max(0,
        Math.floor(mediaTime/video.duration*manifest.frameCount)));
      setFrameIndex(previous=>previous===index?previous:index);
    };
    const pump=(_now:number,metadata:VideoFrameCallbackMetadata)=>{
      update(metadata.mediaTime);if(!cancelled)callback=video.requestVideoFrameCallback(pump);
    };
    if('requestVideoFrameCallback' in video)callback=video.requestVideoFrameCallback(pump);
    const onSeek=()=>update(video.currentTime);
    const onEnd=()=>{setPlaying(false);setBuffering(false);};
    video.addEventListener('seeked',onSeek);video.addEventListener('ended',onEnd);
    return()=>{cancelled=true;if(callback)video.cancelVideoFrameCallback(callback);
      video.removeEventListener('seeked',onSeek);video.removeEventListener('ended',onEnd);};
  },[video,manifest]);
  React.useEffect(()=>{
    if(!video||!Number.isFinite(video.duration)||video.duration<=0)return;
    video.playbackRate=video.duration/durationSeconds;
  },[video,ready,durationSeconds]);
  React.useEffect(()=>{
    if(!hmiCanvas||!hmiManifest||!currentPair)return;
    const index=currentPair.hmiFrameIndex;
    if(displayedHmiIndex.current===index)return;
    const retained=hmiFrames.current.get(index);
    if(!retained){setHmiReady(false);return;}
    let cancelled=false;
    setHmiReady(false);
    void createImageBitmap(retained.blob).then(bitmap=>{
      if(cancelled){bitmap.close();return;}
      if(bitmap.width!==1024||bitmap.height!==1024){
        bitmap.close();setHmiStatus(`HMI frame ${index+1} has unexpected dimensions.`);return;
      }
      const context=hmiCanvas.getContext('2d');
      if(!context){bitmap.close();setHmiStatus('HMI canvas unavailable.');return;}
      context.drawImage(bitmap,0,0,hmiCanvas.width,hmiCanvas.height);
      bitmap.close();displayedHmiIndex.current=index;
      setHmiFrameIndex(index);setHmiRevision(previous=>previous+1);
      setHmiReady(true);
    }).catch(()=>{if(!cancelled)setHmiStatus(`HMI frame ${index+1} failed to decode.`);});
    return()=>{cancelled=true;};
  },[hmiCanvas,hmiManifest,currentPair?.hmiFrameIndex,hmiFetchRevision]);
  React.useEffect(()=>{
    if(!playing||!video||!currentPair)return;
    const index=currentPair.hmiFrameIndex;
    if(hmiFrames.current.has(index)||failedHmiFrames.current.has(index)){
      if(buffering&&video.paused&&!video.ended)void video.play().catch(()=>setPlaying(false));
      if(buffering)setBuffering(false);
    }else{
      if(!video.paused)video.pause();
      if(!buffering)setBuffering(true);
    }
  },[playing,video,currentPair?.hmiFrameIndex,hmiFetchRevision,buffering]);
  const load=async()=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setPlaying(false);setBuffering(false);setReady(false);setManifest(null);setEntries([]);setModels(new Map());
    setLocalDay(null);setLocalModels(new Map());
    setHmiReady(false);setHmiManifest(null);setPairManifest(null);setHmiFrameIndex(-1);
    setBufferedHmiCount(0);setBufferedHmiPrefix(0);setHmiFetchRevision(0);
    setHmiLoading(true);
    hmiFrames.current.clear();failedHmiFrames.current.clear();
    displayedHmiIndex.current=-1;
    setHmiStatus('Loading the dated NASA HMI browse index…');
    setModelIndexStatus('Loading ROB source index…');setStatus('Downloading official daily movie and UTC frame index…');
    if(video)video.pause();
    if(blobUrl.current){URL.revokeObjectURL(blobUrl.current);blobUrl.current=null;}
    try{
      const raw=await json(`/api/star-watcher/daily-movie/manifest?${new URLSearchParams({dateUtc})}`,abort.signal);
      const next=raw as Manifest;
      if(next.schemaVersion!=='sdo-aia193-daily-movie/1'||next.dateUtc!==dateUtc||
         next.frameTimesUtc?.length!==next.frameCount||next.frameCount<2)
        throw new Error('Movie manifest identity or frame index invalid');
      const mediaUrl=`/api/star-watcher/daily-movie/media?${new URLSearchParams({dateUtc,sha256:next.movieSha256})}`;
      const response=await fetch(mediaUrl,{credentials:'include',signal:abort.signal});
      if(!response.ok)throw new Error(`Movie bytes HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==next.movieBytes||await sha256(bytes)!==next.movieSha256)
        throw new Error('Downloaded movie bytes differ from retained manifest');
      if(abort.signal.aborted)return;
      blobUrl.current=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
      setFrameIndex(0);setManifest(next);setStatus(`Retained and verified ${next.frameCount} timestamped NASA frames (${(bytes.byteLength/1e6).toFixed(1)} MB).`);
      void (async()=>{
        try{
          const hmi=await json(`/api/star-watcher/daily-movie/hmi-manifest?${new URLSearchParams({dateUtc})}`,abort.signal) as HmiManifest;
          if(hmi.schemaVersion!=='sdo-hmi-los-daily-browse-movie/1'||hmi.dateUtc!==dateUtc||
             hmi.frameTimesUtc?.length!==hmi.frameCount||hmi.frameCount<2||
             hmi.measurementClass!=='photospheric_los_browse_visualization_not_calibrated_fits')
            throw new Error('HMI movie manifest identity or frame index invalid');
          if(abort.signal.aborted)return;
          setHmiManifest(hmi);
          const pairing=solarDailyMoviePairSchema.parse(await json(
            `/api/star-watcher/daily-movie/pairs?${new URLSearchParams({dateUtc})}`,abort.signal));
          if(pairing.aiaMovieSha256!==next.movieSha256||pairing.hmiMovieSha256!==hmi.movieSha256||
             pairing.pairs.length!==next.frameCount||
             pairing.pairs.some((pair,index)=>pair.aiaFrameIndex!==index||
               pair.aiaTimeUtc!==next.frameTimesUtc[index]||
               pair.hmiTimeUtc!==hmi.frameTimesUtc[pair.hmiFrameIndex]))
            throw new Error('AIA–HMI source pairing changed');
          if(abort.signal.aborted)return;
          setPairManifest(pairing);setHmiLoading(false);
          const matched=pairing.pairs.filter(pair=>pair.withinDisplayWindow).length;
          setHmiStatus(`Retained ${hmi.frameCount} dated HMI source times; fetching exact browse JPEGs (0/${hmi.frameCount} buffered). ${matched}/${pairing.pairs.length} AIA frames paired within 10 min.`);
          let nextIndex=0,retainedCount=0,failedCount=0;
          const worker=async()=>{
            while(!abort.signal.aborted){
              const index=nextIndex++;if(index>=hmi.frameCount)return;
              try{
                const url=`/api/star-watcher/daily-movie/hmi-frame?${new URLSearchParams({
                  dateUtc,index:String(index),sha256:hmi.movieSha256})}`;
                const response=await fetch(url,{credentials:'include',cache:'no-store',signal:abort.signal});
                if(!response.ok)throw new Error(`HTTP ${response.status}`);
                const bytes=await response.arrayBuffer();
                const hash=await sha256(bytes);
                const clock=hmi.frameTimesUtc[index].slice(11,19).replaceAll(':','');
                const sourceUrl=`${hmi.frameIndexSourceUrl}${dateUtc.replaceAll('-','')}_${clock}_1024_HMIB.jpg`;
                if(response.headers.get('X-Solar-Frame-Sha256')!==hash||
                   response.headers.get('X-Solar-Frame-Time-Utc')!==hmi.frameTimesUtc[index]||
                   response.headers.get('X-Solar-Frame-Source-Url')!==sourceUrl)
                  throw new Error('HMI JPEG source receipt mismatch');
                if(abort.signal.aborted)return;
                hmiFrames.current.set(index,{blob:new Blob([bytes],{type:'image/jpeg'}),
                  sha256:hash,sourceUrl});
                retainedCount++;setBufferedHmiCount(retainedCount);
                let prefix=0;while(hmiFrames.current.has(prefix)||failedHmiFrames.current.has(prefix))prefix++;
                setBufferedHmiPrefix(prefix);
                setHmiFetchRevision(previous=>previous+1);
              }catch(error){
                if(abort.signal.aborted)return;
                failedHmiFrames.current.add(index);failedCount++;
                let prefix=0;while(hmiFrames.current.has(prefix)||failedHmiFrames.current.has(prefix))prefix++;
                setBufferedHmiPrefix(prefix);
                setHmiFetchRevision(previous=>previous+1);
                setHmiStatus(`HMI frame ${index+1} unavailable: ${error instanceof Error?error.message:'source error'}. ${retainedCount}/${hmi.frameCount} buffered.`);
              }
              if(!failedCount)setHmiStatus(`Buffered ${retainedCount}/${hmi.frameCount} exact HMI JPEGs; ${matched}/${pairing.pairs.length} AIA frames have a source pair within 10 min.`);
            }
          };
          void Promise.all(Array.from({length:Math.min(6,hmi.frameCount)},()=>worker()))
            .then(()=>{if(!abort.signal.aborted)setHmiStatus(
              `Retained ${retainedCount}/${hmi.frameCount} exact HMI JPEGs${failedCount?` (${failedCount} unavailable)`:''}; ${matched}/${pairing.pairs.length} AIA frames paired within 10 min.`);});
        }catch(error){if(!abort.signal.aborted){setHmiLoading(false);setHmiStatus(
          `HMI browse movie unavailable: ${error instanceof Error?error.message:'source unavailable'}`);}}
      })();
      const start=new Date(Date.parse(next.frameTimesUtc[0])-MODEL_MAX_AGE_MS).toISOString();
      const end=next.frameTimesUtc.at(-1)!;
      try{
        const dayResponse=await fetch(`/api/star-watcher/gong-pfss/day?${new URLSearchParams({dateUtc})}`,
          {credentials:'include',cache:'no-store',signal:abort.signal});
        if(abort.signal.aborted)return;
        if(dayResponse.ok){
          const day=solarGongPfssDaySchema.parse(await dayResponse.json());
          if(abort.signal.aborted)return;
          if(day.dateUtc!==dateUtc)throw new Error('GONG/PFSS day identity changed');
          setLocalDay(day);
          setModelIndexStatus(`Loading ${day.modelCount} independent GONG/PFSS solves; archive hours absent: ${day.missingHours.join(', ')||'none'}.`);
          const results=new Map<string,SolarPfssGeometry>();
          for(const entry of day.entries){
            if(abort.signal.aborted)return;
            const response=await json(`/api/star-watcher/gong-pfss/model?${new URLSearchParams({dateUtc,modelId:entry.modelId})}`,abort.signal);
            if(response.dayId!==day.dayId||!response.entry||
               (response.entry as Record<string,unknown>).modelSha256!==entry.modelSha256)
              throw new Error('GONG/PFSS source receipt changed');
            const geometry=solarPfssGeometrySchema.parse(response.model);
            if(geometry.modelId!==entry.modelId||geometry.sourceMapContentId!==entry.mapContentId||
               geometry.lines.length!==entry.lineCount)throw new Error('GONG/PFSS model identity changed');
            results.set(entry.modelId,geometry);setLocalModels(new Map(results));
            setModelIndexStatus(`${results.size}/${day.modelCount} source-backed GONG/PFSS solves loaded; ${day.missingHours.length} archive hours absent.`);
          }
          return;
        }
        if(dayResponse.status!==404)throw new Error(`GONG/PFSS day HTTP ${dayResponse.status}`);
        const catalog=robPfssRangeSchema.parse(await json(`/api/star-watcher/rob-pfss/range?${
          new URLSearchParams({startUtc:start,endUtc:end})}`,abort.signal));
        if(catalog.truncated||catalog.months.some(month=>month.status==='unavailable'))
          throw new Error('ROB model index incomplete');
        if(abort.signal.aborted)return;
        setEntries(catalog.entries);
        const selected=new Map<string,Entry>();
        for(const time of next.frameTimesUtc){const entry=candidateAt(catalog.entries,Date.parse(time));
          if(entry)selected.set(entry.relativePath,entry);}
        setModelIndexStatus(`${selected.size} distinct ROB candidates for ${next.frameCount} image frames; loading source pairs.`);
        const results=new Map<string,ModelResult>();
        for(const entry of selected.values()){
          if(abort.signal.aborted)return;
          try{
            const query=new URLSearchParams({dateUtc:entry.relativePath.slice(0,10).replaceAll('/','-'),
              relativePath:entry.relativePath,expectedCatalogSha256:entry.catalogSha256});
            const pair=await json(`/api/star-watcher/rob-pfss/playback-pair?${query}`,abort.signal);
            const snapshot=robPfssSnapshotSchema.parse(pair.snapshot);
            if(snapshot.relativePath!==entry.relativePath||snapshot.catalogSha256!==entry.catalogSha256)
              throw new Error('ROB model identity changed');
            const parent=pair.parent&&typeof pair.parent==='object'?pair.parent as Record<string,unknown>:null;
            const receipt=parent?robPfssParentReceiptSchema.parse(parent.receipt):null;
            const rotationDeg=receipt?.modelSha256===snapshot.sourceSha256?
              receipt.displayRotation.earthCarringtonLongitudeApproxDeg:null;
            results.set(entry.relativePath,{snapshot,rotationDeg,
              status:rotationDeg===null?'GONG candidate missing; lines hidden.':'GONG candidate checked; angular registration approximate.'});
          }catch(error){
            if(abort.signal.aborted)return;
            results.set(entry.relativePath,{snapshot:null,rotationDeg:null,
            status:error instanceof Error?error.message:'Model unavailable'});}
          setModels(new Map(results));
          setModelIndexStatus(`${results.size}/${selected.size} ROB candidates loaded; image playback stays independent.`);
        }
      }catch(error){if(!abort.signal.aborted)setModelIndexStatus(
        `ROB index unavailable: ${error instanceof Error?error.message:'source unavailable'}. Movie remains usable.`);}
    }catch(error){if(!abort.signal.aborted){setHmiLoading(false);setStatus(
      `Daily movie unavailable: ${error instanceof Error?error.message:'source unavailable'}`);}}
  };
  const play=async()=>{
    if(!video||!canPlay)return;
    const restart=video.ended||video.currentTime>=video.duration-0.05;
    if(restart){video.currentTime=0;setFrameIndex(0);}
    video.playbackRate=video.duration/durationSeconds;
    try{await video.play();setPlaying(true);
      setStatus(`Retained and verified ${manifest?.frameCount??'—'} timestamped NASA frames (${manifest?(manifest.movieBytes/1e6).toFixed(1):'—'} MB).`);
    }catch(error){video.pause();setStatus(
      `Playback could not start: ${error instanceof Error?error.message:'video error'}`);setPlaying(false);}
  };
  return <section aria-label="NASA daily movie magnetic globe" className="space-y-3 rounded border border-cyan-700/50 p-3 text-xs">
    <h3 className="font-semibold text-cyan-100">Dated AIA 193 Å and HMI magnetogram movies</h3>
    <p className="text-slate-400">Pair NASA’s separate Earth-facing AIA and HMI browse frame clocks. The HMI view shows photospheric line-of-sight polarity; its JPEG frames are not calibrated FITS data or a 3D coronal measurement.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">UTC day<input type="date" value={dateUtc} max={new Date().toISOString().slice(0,10)}
        onChange={event=>setDateUtc(event.target.value)} className="rounded border border-slate-600 bg-slate-900 p-1"/></label>
      <button type="button" onClick={()=>void load()} className="rounded border border-cyan-500 px-2 py-1">Load daily movie</button>
      <label className="grid gap-1">Viewing duration<select value={durationSeconds}
        onChange={event=>setDurationSeconds(Number(event.target.value))}
        className="rounded border border-slate-600 bg-slate-900 p-1">
        <option value={7}>Original movie · 7 s</option><option value={15}>Study · 15 s</option>
        <option value={30}>Study · 30 s</option><option value={60}>Study · 60 s</option>
      </select></label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={showCorona}
        onChange={event=>setShowCorona(event.target.checked)}/>Earth-view off-limb corona plane</label>
      <label className="grid gap-1">HMI on globe · {Math.round(magneticBlend*100)}%
        <input type="range" min={0} max={100} value={Math.round(magneticBlend*100)}
          onChange={event=>setMagneticBlend(Number(event.target.value)/100)} disabled={!hmiManifest}
          aria-label="HMI magnetogram overlay opacity"/></label>
    </div>
    <p role="status">{status}</p><p role="status">{hmiStatus}</p><p role="status">{modelIndexStatus}</p>
    <video key={blobUrl.current??'empty'} ref={setVideo} src={blobUrl.current??undefined}
      muted playsInline preload="auto" className="absolute h-px w-px opacity-0 pointer-events-none"
      onLoadedMetadata={event=>{const element=event.currentTarget;
        if(Number.isFinite(element.duration)&&element.duration>0)
          element.currentTime=Math.min(0.01,element.duration/100);}}
      onLoadedData={()=>setReady(true)} onSeeked={()=>setReady(true)}/>
    <div className={hmiManifest?'flex items-center gap-3 rounded border border-slate-700 bg-black p-2':'hidden'}>
      <canvas ref={setHmiCanvas} width={1024} height={1024}
        aria-label="Exact indexed HMI line-of-sight magnetogram browse frame"
        className="h-28 w-28 shrink-0 object-contain"/>
      <span className="text-slate-300">HMI measured photospheric LOS field · exact cached JPEG source frame. Blend it with the AIA globe using the opacity control; PFSS lines are a separate model.</span>
    </div>
    <div className="h-[440px] overflow-hidden rounded border border-slate-700 bg-black">
      {ready&&video?<Canvas camera={{position:[0,0,3.5],fov:50}} dpr={[1,1.5]}>
        <Globe video={video} hmiCanvas={hmiCanvas} hmiRevision={hmiRevision}
          magneticBlend={hmiDisplayAllowed?magneticBlend:0} lines={displayLines}
          rotationDeg={displayRotation} showCorona={showCorona}/></Canvas>
        :<div className="grid h-full place-items-center text-slate-400">Load a verified movie to show its Earth-facing frames.</div>}
    </div>
    {manifest&&<><div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!canPlay&&!playing} onClick={()=>playing?(video?.pause(),setPlaying(false),setBuffering(false)):void play()}
        className="rounded border border-cyan-500 px-2 py-1 disabled:opacity-40">{playing?'Pause':'Play'}</button>
      <input type="range" aria-label="Daily movie frame" min={0} max={manifest.frameCount-1} value={frameIndex}
        onChange={event=>{if(!video||!Number.isFinite(video.duration))return;
          video.pause();setPlaying(false);setBuffering(false);const target=Number(event.target.value);
          video.currentTime=(target+0.1)/manifest.frameCount*video.duration;setFrameIndex(target);}}
        className="min-w-48 flex-1"/>
      <span>Frame {frameIndex+1}/{manifest.frameCount}</span></div>
      {hmiManifest&&<><div role="progressbar" aria-label="Contiguous HMI source preparation"
        aria-valuemin={0} aria-valuemax={hmiManifest.frameCount} aria-valuenow={bufferedHmiPrefix}
        className="h-1 rounded bg-slate-800"><div className="h-full rounded bg-slate-200"
          style={{width:`${100*bufferedHmiPrefix/hmiManifest.frameCount}%`}}/></div>
        <p>HMI source preparation {bufferedHmiPrefix}/{hmiManifest.frameCount} contiguous requests complete · {bufferedHmiCount} retained JPEGs{buffering?' · waiting for the next indexed frame':''}.</p></>}
      <p>Observed image {frameTime??'—'} · mean source interval ≈ {sourceCadenceMinutes?.toFixed(1)??'—'} solar min · display ≈ {(manifest.frameCount/durationSeconds).toFixed(1)} distinct frames/viewing s.</p>
      <p>Distinct source states over {durationSeconds} viewing s: AIA {manifest.frameCount} · HMI {hmiManifest?.frameCount??'loading'} ({hmiManifest?(hmiManifest.frameCount/durationSeconds).toFixed(1):'—'}/viewing s) · {localDay?'GONG/PFSS':'ROB PFSS'} {localDay?localModels.size:models.size} currently loaded. Renderer refresh rate does not increase any source count.</p>
      <p>HMI browse frame {hmiShownTime??'—'} · nearest indexed source frame {nearestHmiTime??'—'} · nearest source offset {currentPair?.signedOffsetSeconds??'—'} s · displayed offset {hmiGapMinutes?.toFixed(1)??'—'} min. {hmiDisplayAllowed?'Earth-facing overlay available.':'Overlay withheld until the exact indexed HMI JPEG is decoded.'}{shownHmiReceipt?` Source SHA-256 ${shownHmiReceipt.sha256.slice(0,16)}…`:''}</p>
      {localDay?<p>{localEntry?localModel?
        `Held local GONG/PFSS ${localEntry.epochUtc} · age ${((Date.parse(frameTime!)-Date.parse(localEntry.epochUtc))/3_600_000).toFixed(2)} h · ${localEntry.lineCount} lines · map ${localEntry.sourceSha256.slice(0,12)}… · model ${localEntry.modelId.slice(11,23)}… · 2.5 R☉ current-free solve; Earth registration approximate.`:
        'Source-backed model still loading; lines hidden.':
        'No GONG map within the preceding two hours; lines hidden.'}</p>:<p>{candidate?validModel?.snapshot?
        `Held ROB PFSS ${validModel.snapshot.fitsDateObsUtc} · age ${((Date.parse(frameTime!)-Date.parse(validModel.snapshot.fitsDateObsUtc))/3_600_000).toFixed(2)} h · ${validModel.status}`:
        model?.status??'ROB candidate loading; lines hidden until its source pair resolves.':
        'No ROB candidate within the preceding 12 hours; lines hidden.'}</p>}
      {localDay&&<p>GONG archive {localDay.catalogUrl} · catalog SHA-256 {localDay.catalogSha256.slice(0,16)}… · {localDay.modelCount} independent maps and solves · missing UTC hours {localDay.missingHours.join(', ')||'none'} · each map is assembled from observations at different times. Local solve is a model, not a measured coronal field.</p>}
      <p className="text-slate-400">The sphere’s visible disk and off-limb plane use the same AIA frame. The HMI blend is an exact timestamped browse JPEG with approximate disk registration. The plane stays in the Earth observer direction while the camera orbits; it is 2D coronal emission, not a measured 3D height map. PFSS lines use an independent GONG-derived model clock and change only when its source model changes. They are not derived from the HMI frames; image frames never generate synthetic field lines.</p>
      <p className="text-slate-500">Sources: <a href={manifest.movieSourceUrl} target="_blank" rel="noreferrer" className="underline">NASA daily MP4</a> · <a href={manifest.frameIndexSourceUrl} target="_blank" rel="noreferrer" className="underline">NASA UTC JPEG index</a> · retained SHA-256 {manifest.movieSha256.slice(0,16)}…</p>
      {hmiManifest&&<p className="text-slate-500">HMI source: <a href={hmiManifest.movieSourceUrl} target="_blank" rel="noreferrer" className="underline">NASA HMI browse MP4</a> · retained SHA-256 {hmiManifest.movieSha256.slice(0,16)}…{pairManifest&&<> · pair ID {pairManifest.pairId}</>}</p>}
    </>}
  </section>;
}
