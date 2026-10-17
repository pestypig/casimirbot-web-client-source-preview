/**
 * Local camera-compensated region viewer. Keep source-frame measurement marks
 * separate from chart remapping; overlay coordinate and clipping conventions
 * live in docs/research/ferrofluid-alignment-overlay-workflow-v1.md.
 */
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {
  flattenSurfaceRegion,
  remapSurfaceRgba,
  sphereEquirectangularChart,
  type RgbaImage,
  type SurfaceImageMap,
  type SurfaceRegionBox,
} from '@shared/surface-registration';
import {surfaceMapFromFerrofluidManifestFrame} from '@shared/ferrofluid-camera-registration';

const CHART_WIDTH=512;
const CHART_HEIGHT=256;
const MAX_MANIFEST_BYTES=4*1024*1024;
const MAX_REGISTERED_FRAMES=240;

interface RegisteredFrame {
  image:string;
  timeS:number;
  timelineIndex:number;
  viewAngleDeg:number;
}

interface ParsedManifest {
  raw:unknown;
  sourceSha256:string;
  sourceWidth:number;
  sourceHeight:number;
  sampleRateHz:number;
  sampledFrames:number;
  targetRadius:number;
  originalChartWidth:number;
  originalChartHeight:number;
  frames:RegisteredFrame[];
  startTimeS:number;
}

interface RegisteredPatch {
  image:string;
  timeS:number;
  timelineIndex:number;
  viewAngleDeg:number;
  dataUrl:string;
  coverage:number;
}

function record(value:unknown,label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object.`);
  return value as Record<string,unknown>;
}
function finite(value:unknown,label:string):number{
  if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`${label} must be finite.`);
  return value;
}
function parseManifest(raw:unknown):ParsedManifest{
  const root=record(raw,'manifest');
  if(root.schema!=='codex.shared-surface-registration.v1')throw new TypeError('Unsupported registration manifest schema.');
  const source=record(root.source,'manifest.source');
  const dimensions=source.analysis_dimensions_px;
  if(!Array.isArray(dimensions)||dimensions.length!==2)throw new TypeError('Manifest analysis dimensions are missing.');
  const sourceWidth=finite(dimensions[0],'analysis width'),sourceHeight=finite(dimensions[1],'analysis height');
  if(!Number.isInteger(sourceWidth)||!Number.isInteger(sourceHeight)||sourceWidth<2||sourceHeight<2)throw new TypeError('Manifest analysis dimensions are invalid.');
  if(typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(source.sha256))throw new TypeError('Manifest source video hash is invalid.');
  const sampleRateHz=finite(source.sample_rate_hz,'sample rate');
  const sampledFrames=finite(source.sampled_frames,'sampled frame count');
  if(sampleRateHz<=0||!Number.isInteger(sampledFrames)||sampledFrames<2||sampledFrames>MAX_REGISTERED_FRAMES)throw new TypeError('Manifest timeline is outside supported bounds.');
  const target=record(root.target_model,'manifest.target_model');
  const targetRadius=finite(target.radius_sfm_units_median,'target radius');
  const chartDimensions=target.chart_dimensions_px;
  if(!Array.isArray(chartDimensions)||chartDimensions.length!==2)throw new TypeError('Manifest chart dimensions are missing.');
  const originalChartWidth=finite(chartDimensions[0],'chart width'),originalChartHeight=finite(chartDimensions[1],'chart height');
  if(targetRadius<=0||!Number.isInteger(originalChartWidth)||!Number.isInteger(originalChartHeight))throw new TypeError('Manifest target chart is invalid.');
  if(!Array.isArray(root.frames)||root.frames.length<2||root.frames.length>MAX_REGISTERED_FRAMES)throw new TypeError('Manifest registered-frame list is outside supported bounds.');
  const frames=root.frames.map((value,index)=>{
    const frame=record(value,`frames[${index}]`),camera=record(frame.camera,`frames[${index}].camera`);
    if(typeof frame.image!=='string'||!frame.image)throw new TypeError(`frames[${index}] image is missing.`);
    const timelineIndex=finite(frame.source_sample_timeline_frame_1_based,`frames[${index}] timeline index`);
    const timeS=finite(frame.time_s,`frames[${index}] time`);
    if(!Number.isInteger(timelineIndex)||timelineIndex<1||timelineIndex>sampledFrames||timeS<0)throw new TypeError(`frames[${index}] timeline data is invalid.`);
    return {image:frame.image,timeS,timelineIndex,
      viewAngleDeg:finite(camera.view_angle_from_mean_registered_view_deg,`frames[${index}] view angle`)};
  }).sort((a,b)=>a.timelineIndex-b.timelineIndex);
  if(new Set(frames.map(frame=>frame.timelineIndex)).size!==frames.length)throw new TypeError('Manifest has duplicate timeline frame indices.');
  const startTimeS=frames[0].timeS-(frames[0].timelineIndex-1)/sampleRateHz;
  return {raw,sourceSha256:source.sha256.toUpperCase(),sourceWidth,sourceHeight,sampleRateHz,sampledFrames,
    targetRadius,originalChartWidth,originalChartHeight,frames,startTimeS};
}

function toDataUrl(image:RgbaImage):string{
  const canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('2D canvas is unavailable.');
  context.putImageData(new ImageData(image.data,image.width,image.height),0,0);
  return canvas.toDataURL('image/png');
}

function regionCoverage(map:SurfaceImageMap,box:SurfaceRegionBox):number{
  let valid=0,total=0;
  for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){
    total++;
    if(map.valid[y*map.width+x])valid++;
  }
  return total?valid/total:0;
}

function seekVideo(video:HTMLVideoElement,timeS:number):Promise<void>{
  if(video.readyState<1)return new Promise((resolve,reject)=>{
    const failed=()=>{video.removeEventListener('loadedmetadata',ready);reject(new Error('Video metadata could not be read.'));};
    const ready=()=>{video.removeEventListener('error',failed);seekVideo(video,timeS).then(resolve,reject);};
    video.addEventListener('loadedmetadata',ready,{once:true});
    video.addEventListener('error',failed,{once:true});
  });
  if(timeS>=video.duration)throw new RangeError(`Video ends before the registered sample at ${timeS.toFixed(3)} s.`);
  if(!video.seeking&&Math.abs(video.currentTime-timeS)<1/120&&video.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>{cleanup();reject(new Error(`Timed out seeking to ${timeS.toFixed(3)} s.`));},10000);
    const cleanup=()=>{window.clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',failed);};
    const done=()=>{cleanup();resolve();};
    const failed=()=>{cleanup();reject(new Error('Video frame could not be decoded.'));};
    video.addEventListener('seeked',done,{once:true});
    video.addEventListener('error',failed,{once:true});
    video.currentTime=timeS;
  });
}

export default function FerrofluidSurfaceRegistrationViewer({videoUrl,videoSha256}:{videoUrl:string|null;videoSha256:string|null}){
  const videoRef=useRef<HTMLVideoElement>(null);
  const generation=useRef(0);
  const [manifest,setManifest]=useState<ParsedManifest|null>(null);
  const [manifestError,setManifestError]=useState<string|null>(null);
  const [maps,setMaps]=useState<Map<string,SurfaceImageMap>>(new Map());
  const [mapStatus,setMapStatus]=useState('Choose the local camera-registration manifest.');
  const [selectedTimeline,setSelectedTimeline]=useState(1);
  const [region,setRegion]=useState<SurfaceRegionBox|null>(null);
  const [drag,setDrag]=useState<{start:[number,number];end:[number,number]}|null>(null);
  const [currentChart,setCurrentChart]=useState<{image:RgbaImage;valid:Uint8Array}|null>(null);
  const [currentStatus,setCurrentStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [gallery,setGallery]=useState<RegisteredPatch[]>([]);
  const [galleryStatus,setGalleryStatus]=useState('');

  const validVideo=Boolean(manifest&&videoUrl&&videoSha256&&manifest.sourceSha256===videoSha256.toUpperCase());
  const frameByTimeline=useMemo(()=>new Map((manifest?.frames??[]).map(frame=>[frame.timelineIndex,frame])),[manifest]);
  const selectedFrame=frameByTimeline.get(selectedTimeline)??null;
  const selectedTimeS=manifest?manifest.startTimeS+(selectedTimeline-1)/manifest.sampleRateHz:null;
  const chart=useMemo(()=>sphereEquirectangularChart(manifest?.targetRadius??1,CHART_WIDTH,CHART_HEIGHT),[manifest?.targetRadius]);

  useEffect(()=>{
    if(!manifest){setMaps(new Map());return;}
    setMapStatus('Projecting registered camera views…');
    try{
      const projected=new Map<string,SurfaceImageMap>();
      for(const frame of manifest.frames){
        projected.set(frame.image,surfaceMapFromFerrofluidManifestFrame(manifest.raw,frame.image,chart).map);
      }
      setMaps(projected);
      setMapStatus(`${projected.size} registered views mapped; the missing timeline pose remains a gap.`);
      setSelectedTimeline(Math.min(...manifest.frames.map(frame=>frame.timelineIndex)));
      const namedRegion=Object.values(record(record(manifest.raw,'manifest').regions??{},'manifest.regions'))
        .map(value=>{try{return record(value,'manifest region').atlas_bbox_xyxy_px;}catch{return null;}})
        .find(value=>Array.isArray(value)&&value.length===4) as number[]|undefined;
      if(namedRegion){
        const [x0,y0,x1,y1]=namedRegion;
        setRegion({x0:Math.max(0,Math.min(CHART_WIDTH-1,Math.round(x0*CHART_WIDTH/manifest.originalChartWidth))),
          y0:Math.max(0,Math.min(CHART_HEIGHT-1,Math.round(y0*CHART_HEIGHT/manifest.originalChartHeight))),
          x1:Math.max(1,Math.min(CHART_WIDTH,Math.round(x1*CHART_WIDTH/manifest.originalChartWidth))),
          y1:Math.max(1,Math.min(CHART_HEIGHT,Math.round(y1*CHART_HEIGHT/manifest.originalChartHeight)))});
      }else setRegion({x0:Math.round(CHART_WIDTH*.3),y0:Math.round(CHART_HEIGHT*.25),
        x1:Math.round(CHART_WIDTH*.7),y1:Math.round(CHART_HEIGHT*.75)});
      setGallery([]);
    }catch(error){
      setMaps(new Map());
      setMapStatus(error instanceof Error?error.message:'Camera mapping failed.');
    }
  },[manifest]);

  const readManifest=async(file:File|null)=>{
    setManifest(null);setManifestError(null);setCurrentChart(null);setGallery([]);
    if(!file)return;
    if(file.size>MAX_MANIFEST_BYTES){setManifestError('Manifest exceeds the 4 MiB local-import limit.');return;}
    try{
      const parsed=parseManifest(JSON.parse(await file.text()));
      setManifest(parsed);setManifestError(null);
    }catch(error){setManifestError(error instanceof Error?error.message:'Registration manifest was rejected.');}
  };

  async function decodeRegisteredFrame(frame:RegisteredFrame,activeManifest:ParsedManifest,map:SurfaceImageMap){
    const video=videoRef.current;
    if(!video)throw new Error('Local video element is unavailable.');
    await seekVideo(video,frame.timeS);
    if(Math.abs(video.videoWidth/Math.max(1,video.videoHeight)-activeManifest.sourceWidth/activeManifest.sourceHeight)>0.002)
      throw new Error('Video aspect ratio does not match the registration manifest.');
    const canvas=document.createElement('canvas');
    canvas.width=activeManifest.sourceWidth;canvas.height=activeManifest.sourceHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('2D canvas is unavailable.');
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const source=context.getImageData(0,0,canvas.width,canvas.height);
    return remapSurfaceRgba({width:canvas.width,height:canvas.height,data:source.data},map);
  }

  useEffect(()=>{
    const token=++generation.current;
    if(!manifest||!selectedFrame||!validVideo||!maps.has(selectedFrame.image)){
      setCurrentChart(null);
      if(selectedFrame&&videoUrl&&manifest&&videoSha256&&manifest.sourceSha256!==videoSha256.toUpperCase())
        setCurrentStatus('Video SHA-256 does not match the manifest source; no frames were sampled.');
      return;
    }
    setBusy(true);setCurrentStatus(`Decoding ${selectedFrame.timeS.toFixed(3)} s locally…`);
    void decodeRegisteredFrame(selectedFrame,manifest,maps.get(selectedFrame.image)!)
      .then(result=>{if(generation.current===token){setCurrentChart(result);setCurrentStatus(`Registered ${selectedFrame.image} at ${selectedFrame.timeS.toFixed(3)} s · ${result.valid.reduce((a,b)=>a+b,0)} chart samples geometrically valid.`);}})
      .catch(error=>{if(generation.current===token){setCurrentChart(null);setCurrentStatus(error instanceof Error?error.message:'Frame registration failed.');}})
      .finally(()=>{if(generation.current===token)setBusy(false);});
    return()=>{generation.current++;};
  },[manifest,selectedFrame,selectedTimeline,validVideo,videoUrl,videoSha256,maps]);

  const currentPatch=useMemo(()=>currentChart&&region
    ?flattenSurfaceRegion(currentChart.image,currentChart.valid,CHART_HEIGHT,region):null,[currentChart,region]);
  const patchUrl=useMemo(()=>currentPatch?toDataUrl(currentPatch.image):null,[currentPatch]);
  const chartUrl=useMemo(()=>currentChart?toDataUrl(currentChart.image):null,[currentChart]);
  const patchCoverage=useMemo(()=>{
    if(!currentPatch)return 0;
    const n=currentPatch.valid.reduce((sum,value)=>sum+value,0);
    return currentPatch.valid.length?n/currentPatch.valid.length:0;
  },[currentPatch]);
  const geometricCoverage=useMemo(()=>region?manifest?.frames.map(frame=>({frame,coverage:maps.has(frame.image)?regionCoverage(maps.get(frame.image)!,region):0})):[],[manifest,maps,region]);
  const minimumCoverage=geometricCoverage?.length?Math.min(...geometricCoverage.map(item=>item.coverage)):0;

  const renderAll=async()=>{
    if(!manifest||!region||!validVideo)return;
    const token=++generation.current;
    setGallery([]);setBusy(true);setGalleryStatus('Rendering registered samples locally…');
    const rows:RegisteredPatch[]=[];
    try{
      for(let index=0;index<manifest.sampledFrames;index++){
        if(generation.current!==token)return;
        const timelineIndex=index+1;
        const frame=frameByTimeline.get(timelineIndex);
        if(!frame){
          rows.push({image:'NO CAMERA POSE',timeS:manifest.startTimeS+index/manifest.sampleRateHz,
            timelineIndex,viewAngleDeg:NaN,dataUrl:'',coverage:0});
        }else{
          const map=maps.get(frame.image);
          if(!map)continue;
          const result=await decodeRegisteredFrame(frame,manifest,map);
          const flattened=flattenSurfaceRegion(result.image,result.valid,CHART_HEIGHT,region);
          rows.push({image:frame.image,timeS:frame.timeS,timelineIndex,viewAngleDeg:frame.viewAngleDeg,
            dataUrl:toDataUrl(flattened.image),coverage:flattened.valid.reduce((sum,value)=>sum+value,0)/flattened.valid.length});
        }
        setGallery([...rows]);
        setGalleryStatus(`Rendered ${timelineIndex}/${manifest.sampledFrames} source timeline samples locally.`);
      }
      if(generation.current===token)setGalleryStatus('Complete. The missing-pose sample is retained in its original timeline position.');
    }catch(error){if(generation.current===token)setGalleryStatus(error instanceof Error?error.message:'Gallery render failed.');}
    finally{if(generation.current===token)setBusy(false);}
  };

  const pointFromPointer=(event:PointerEvent<HTMLDivElement>):[number,number]=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(CHART_WIDTH,Math.round((event.clientX-bounds.left)*CHART_WIDTH/bounds.width))),
      Math.max(0,Math.min(CHART_HEIGHT,Math.round((event.clientY-bounds.top)*CHART_HEIGHT/bounds.height)))];
  };
  const pointerDown=(event:PointerEvent<HTMLDivElement>)=>{event.currentTarget.setPointerCapture(event.pointerId);const point=pointFromPointer(event);setDrag({start:point,end:point});};
  const pointerMove=(event:PointerEvent<HTMLDivElement>)=>{if(drag)setDrag({...drag,end:pointFromPointer(event)});};
  const pointerUp=(event:PointerEvent<HTMLDivElement>)=>{
    if(!drag)return;
    const end=pointFromPointer(event),x0=Math.min(drag.start[0],end[0]),x1=Math.max(drag.start[0],end[0]);
    const y0=Math.min(drag.start[1],end[1]),y1=Math.max(drag.start[1],end[1]);
    if(x1-x0>=2&&y1-y0>=2){setRegion({x0,y0,x1,y1});setGallery([]);setGalleryStatus('Region changed; render the registered timeline again to refresh its patches.');}
    setDrag(null);
  };
  const displayBox=drag?{x0:Math.min(drag.start[0],drag.end[0]),x1:Math.max(drag.start[0],drag.end[0]),
    y0:Math.min(drag.start[1],drag.end[1]),y1:Math.max(drag.start[1],drag.end[1])}:region;

  return <section className="rounded border border-cyan-800 bg-slate-900/70 p-4 text-sm" aria-label="Local camera-compensated surface registration">
    <h2 className="font-medium text-cyan-200">Camera-compensated surface regions · local only</h2>
    <p className="mt-2 text-slate-300">Load the registration manifest generated for this exact video. The browser samples each registered time, removes estimated camera motion, and flattens the selected sphere-chart region. Decoded frames remain local; no frame or manifest is sent to a service.</p>
    <label className="mt-3 block text-xs">Registration manifest JSON
      <input type="file" accept=".json,application/json" aria-label="Open local camera registration manifest" className="mt-1 block w-full" onChange={event=>void readManifest(event.target.files?.[0]??null)}/>
    </label>
    {manifestError&&<p role="alert" className="mt-2 text-rose-300">{manifestError}</p>}
    {manifest&&<div className="mt-2 space-y-1 text-xs text-slate-300">
      <p>{manifest.frames.length}/{manifest.sampledFrames} camera poses · {CHART_WIDTH}×{CHART_HEIGHT} sphere chart · {mapStatus}</p>
      {!videoUrl&&<p className="text-amber-200">Choose the matching local video in the preview section above.</p>}
      {videoUrl&&!videoSha256&&<p className="text-amber-200">Waiting for the local video SHA-256 check.</p>}
      {videoSha256&&manifest.sourceSha256!==videoSha256.toUpperCase()&&<p className="text-rose-300">Video SHA-256 differs from the manifest source. Frame mapping is disabled.</p>}
      {validVideo&&<p className="text-emerald-300">Exact source SHA-256 match · video decoding remains in this browser tab.</p>}
    </div>}
    <video ref={videoRef} src={videoUrl??undefined} preload="auto" muted playsInline aria-hidden="true"
      className="pointer-events-none absolute h-px w-px opacity-0" />
    {manifest&&<>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="min-w-60 flex-1 text-xs">Source timeline sample {selectedTimeline}/{manifest.sampledFrames}
          <input type="range" min={1} max={manifest.sampledFrames} step={1} value={selectedTimeline}
            aria-label="Registered source timeline sample" className="mt-1 block w-full"
            onChange={event=>setSelectedTimeline(Number(event.target.value))}/>
        </label>
        <span className="text-xs text-slate-300">{selectedTimeS?.toFixed(3)} s{selectedFrame?` · view ${selectedFrame.viewAngleDeg.toFixed(1)}°`:' · NO CAMERA POSE'}</span>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(300px,512px)_minmax(220px,1fr)]">
        <div>
          <div className="relative w-full max-w-[512px] overflow-hidden border border-slate-600 bg-black" style={{aspectRatio:`${CHART_WIDTH}/${CHART_HEIGHT}`}}>
            {chartUrl&&<img src={chartUrl} alt="Camera-compensated equirectangular sphere chart" className="absolute inset-0 h-full w-full"/>}
            {(!currentChart||!validVideo||!selectedFrame)&&<div className="absolute inset-0 grid place-items-center bg-slate-950/80 p-4 text-center text-xs text-slate-300">{selectedFrame?'Choose the exact matching local video to render this chart.':'NO CAMERA POSE · source time is preserved; no flattened sample is inferred.'}</div>}
            {validVideo&&selectedFrame&&<div className="absolute inset-0 touch-none cursor-crosshair" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
              {displayBox&&<div className="pointer-events-none absolute border-2 border-amber-300" style={{left:`${displayBox.x0/CHART_WIDTH*100}%`,top:`${displayBox.y0/CHART_HEIGHT*100}%`,width:`${(displayBox.x1-displayBox.x0)/CHART_WIDTH*100}%`,height:`${(displayBox.y1-displayBox.y0)/CHART_HEIGHT*100}%`}}/>}
            </div>}
          </div>
          <p className="mt-1 text-xs text-slate-400">Transparent/black chart areas are outside the image bounds or otherwise unavailable; the validity and coverage numbers report usable samples. Drag a box to select a region; the amber outline is the crop.</p>
          <p className="mt-2 text-xs text-slate-300">{currentStatus}{busy?' · working':''}</p>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Flattened selected region</h3>
          {patchUrl&&<img src={patchUrl} alt="Latitude-corrected flattened surface region" className="max-h-72 max-w-full border border-slate-600 bg-black object-contain"/>}
          <p className="text-xs text-slate-300">Selected-frame region coverage: {(patchCoverage*100).toFixed(1)}% · minimum geometric coverage across {geometricCoverage?.length??0} registered views: {(minimumCoverage*100).toFixed(1)}%</p>
          <p className="text-xs text-amber-200">Coverage describes projection and image bounds only. It does not remove phone reflections, glass refraction, glare, or changing fluid texture. The current target pose is held fixed and the chart is not calibrated to the physical string/laser pole.</p>
          <button type="button" disabled={!validVideo||!region||busy||maps.size===0} onClick={()=>void renderAll()}
            className="rounded border border-cyan-600 px-3 py-1.5 text-xs disabled:opacity-40">Render all source timeline samples</button>
          <p className="text-xs text-slate-300">{galleryStatus}</p>
        </div>
      </div>
      {gallery.length>0&&<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {gallery.map(row=><article key={row.timelineIndex} className="min-w-0 rounded border border-slate-700 bg-slate-950 p-2">
          {row.dataUrl?<img src={row.dataUrl} alt={`Flattened region at ${row.timeS.toFixed(3)} seconds`} className="mx-auto h-28 w-full object-contain"/>:
            <div className="grid h-28 place-items-center text-center text-[10px] text-rose-300">NO CAMERA POSE</div>}
          <p className="mt-1 truncate text-center text-[10px] text-slate-300">{row.timeS.toFixed(3)} s · {Number.isFinite(row.viewAngleDeg)?`${row.viewAngleDeg.toFixed(1)}°`:row.image}</p>
          <p className="text-center text-[10px] text-slate-400">{(row.coverage*100).toFixed(0)}% geometric coverage</p>
        </article>)}
      </div>}
    </>}
    <p className="mt-3 text-xs text-amber-200">This is a camera-motion registration preview, not a physical surface reconstruction. Arbitrary SfM scale, uncalibrated focal length, refraction, and independent orb rotation remain unresolved.</p>
  </section>;
}
