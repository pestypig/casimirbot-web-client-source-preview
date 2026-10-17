import {useMemo,useState,type PointerEvent} from 'react';
import {
  flattenSurfaceRegion,
  remapSurfaceRgba,
  sphereEquirectangularChart,
  type RgbaImage,
  type SurfaceRegionBox,
} from '@shared/surface-registration';
import {solarSurfaceImageMapFromWcs,type SolarObserverGeometry} from '@shared/solar-surface-registration';

// The source SunPy grids are capped at 192×192; 256×128 preserves enough
// chart detail for region comparison without oversampling every time sample.
const CHART_WIDTH=256;
const CHART_HEIGHT=128;
interface SolarFrame {
  index:number;
  obstime:string;
  grid_size?:number;
  map_b64?:string|null;
  wcs_header?:Record<string,unknown>|null;
  registration_geometry?:SolarObserverGeometry|null;
}
interface FlatPatch {index:number;obstime:string;url:string;coverage:number;error?:string}

function record(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function dataUrl(image:RgbaImage):string{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');if(!context)throw new Error('2D canvas is unavailable.');
  context.putImageData(new ImageData(image.data,image.width,image.height),0,0);return canvas.toDataURL('image/png');
}
function sourceImage(frame:SolarFrame):RgbaImage{
  if(!Number.isInteger(frame.grid_size)||!frame.grid_size||frame.grid_size<2||frame.grid_size>512||
    typeof frame.map_b64!=='string')throw new TypeError('Selected solar frame has no supported image grid.');
  const bytes=Uint8Array.from(atob(frame.map_b64),character=>character.charCodeAt(0));
  if(bytes.byteLength!==frame.grid_size*frame.grid_size*4)throw new TypeError('Solar frame byte count does not match its image grid.');
  const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  const pixels=new Uint8ClampedArray(values.length*4);
  for(let index=0;index<values.length;index++){
    const value=Number.isFinite(values[index])?Math.max(0,Math.min(1,values[index])):0;
    const byte=Math.round(value*255),offset=index*4;
    pixels[offset]=byte;pixels[offset+1]=byte;pixels[offset+2]=byte;pixels[offset+3]=255;
  }
  return {width:frame.grid_size,height:frame.grid_size,data:pixels};
}
function registeredImage(frame:SolarFrame,chart:ReturnType<typeof sphereEquirectangularChart>){
  const header=record(frame.wcs_header),geometry=frame.registration_geometry;
  if(!header||!geometry)throw new TypeError('Frame lacks native WCS or observer geometry; this frame cannot be surface-registered.');
  const source=sourceImage(frame);
  const map=solarSurfaceImageMapFromWcs(chart,source.width,source.height,header,geometry);
  return remapSurfaceRgba(source,map);
}
function coverage(frame:SolarFrame,chart:ReturnType<typeof sphereEquirectangularChart>,box:SurfaceRegionBox):number{
  const result=registeredImage(frame,chart);let valid=0,total=0;
  for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){
    total++;if(result.valid[y*CHART_WIDTH+x])valid++;
  }
  return total?valid/total:0;
}

export function SolarSurfaceRegistrationViewer({frames,selectedFrameIndex}:{frames:readonly SolarFrame[];selectedFrameIndex:number}){
  const chart=useMemo(()=>sphereEquirectangularChart(1,CHART_WIDTH,CHART_HEIGHT),[]);
  const [region,setRegion]=useState<SurfaceRegionBox>({x0:77,y0:16,x1:179,y1:112});
  const [drag,setDrag]=useState<{start:[number,number];end:[number,number]}|null>(null);
  const [gallery,setGallery]=useState<FlatPatch[]>([]);
  const [status,setStatus]=useState('Select a region in the Carrington chart to compare it across the observations.');
  const frame=frames[selectedFrameIndex];
  const current=useMemo(()=>{
    if(!frame)return {image:null as RgbaImage|null,valid:null as Uint8Array|null,error:'No selected observation frame.'};
    try{const result=registeredImage(frame,chart);return {image:result.image,valid:result.valid,error:null};}
    catch(error){return {image:null,valid:null,error:error instanceof Error?error.message:'Solar surface projection failed.'};}
  },[frame,chart]);
  const currentUrl=useMemo(()=>current.image?dataUrl(current.image):null,[current.image]);
  const patch=useMemo(()=>current.image&&current.valid?flattenSurfaceRegion(current.image,current.valid,CHART_HEIGHT,region):null,
    [current.image,current.valid,region]);
  const patchUrl=useMemo(()=>patch?dataUrl(patch.image):null,[patch]);
  const patchCoverage=patch?patch.valid.reduce((sum,value)=>sum+value,0)/patch.valid.length:0;
  const coverageRows=useMemo(()=>frames.map(item=>{
    try{return {frame:item,coverage:coverage(item,chart,region),error:null};}
    catch(error){return {frame:item,coverage:0,error:error instanceof Error?error.message:'WCS unavailable'};}
  }),[frames,chart,region]);
  const minimumCoverage=coverageRows.length?Math.min(...coverageRows.map(row=>row.coverage)):0;

  const point=(event:PointerEvent<HTMLDivElement>):[number,number]=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(CHART_WIDTH,Math.round((event.clientX-bounds.left)*CHART_WIDTH/bounds.width))),
      Math.max(0,Math.min(CHART_HEIGHT,Math.round((event.clientY-bounds.top)*CHART_HEIGHT/bounds.height)))];
  };
  const down=(event:PointerEvent<HTMLDivElement>)=>{event.currentTarget.setPointerCapture(event.pointerId);const p=point(event);setDrag({start:p,end:p});};
  const move=(event:PointerEvent<HTMLDivElement>)=>{if(drag)setDrag({...drag,end:point(event)});};
  const up=(event:PointerEvent<HTMLDivElement>)=>{
    if(!drag)return;const end=point(event),x0=Math.min(drag.start[0],end[0]),x1=Math.max(drag.start[0],end[0]);
    const y0=Math.min(drag.start[1],end[1]),y1=Math.max(drag.start[1],end[1]);
    if(x1-x0>=2&&y1-y0>=2){setRegion({x0,y0,x1,y1});setGallery([]);setStatus('Region changed. Render the selected patch across the observation sequence.');}
    setDrag(null);
  };
  const drawBox=drag?{x0:Math.min(drag.start[0],drag.end[0]),x1:Math.max(drag.start[0],drag.end[0]),
    y0:Math.min(drag.start[1],drag.end[1]),y1:Math.max(drag.start[1],drag.end[1])}:region;
  const renderAll=()=>{
    const patches=frames.map(item=>{
      try{const result=registeredImage(item,chart),flat=flattenSurfaceRegion(result.image,result.valid,CHART_HEIGHT,region);
        return {index:item.index,obstime:item.obstime,url:dataUrl(flat.image),coverage:flat.valid.reduce((sum,value)=>sum+value,0)/flat.valid.length};}
      catch(error){return {index:item.index,obstime:item.obstime,url:'',coverage:0,error:error instanceof Error?error.message:'WCS unavailable'};}
    });
    setGallery(patches);setStatus(`Rendered ${patches.filter(item=>item.url).length}/${frames.length} WCS-registered Carrington patches.`);
  };

  return <section className="space-y-3 rounded border border-indigo-800 bg-slate-900/70 p-3 text-xs" aria-label="WCS-registered solar surface regions">
    <div><h3 className="font-medium text-indigo-200">Shared Carrington surface region · observation WCS</h3>
      <p className="mt-1 text-slate-300">Each observed frame is projected from its own native HPLN/HPLT WCS and observer geometry into the same Carrington coordinates. This removes changing disk-view geometry while retaining the Sun’s surface coordinate frame; differential rotation and evolving features remain separate.</p></div>
    {current.error?<p role="status" className="text-amber-200">{current.error}</p>:<p className="text-emerald-300">WCS projected · {frame?.obstime} · source image {frame?.grid_size}×{frame?.grid_size}</p>}
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,512px)_minmax(200px,1fr)]">
      <div>
        <div className="relative w-full max-w-[512px] overflow-hidden border border-slate-600 bg-black" style={{aspectRatio:`${CHART_WIDTH}/${CHART_HEIGHT}`}}>
          {currentUrl&&<img src={currentUrl} alt="Native solar observation resampled to Carrington longitude and latitude" className="absolute inset-0 h-full w-full"/>}
          <div className="absolute inset-0 touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {drawBox&&<div className="pointer-events-none absolute border-2 border-amber-300" style={{left:`${drawBox.x0/CHART_WIDTH*100}%`,top:`${drawBox.y0/CHART_HEIGHT*100}%`,width:`${(drawBox.x1-drawBox.x0)/CHART_WIDTH*100}%`,height:`${(drawBox.y1-drawBox.y0)/CHART_HEIGHT*100}%`}}/>}
          </div>
        </div>
        <p className="mt-1 text-slate-400">Transparent chart pixels are outside this observation’s visible disk or source bounds.</p>
      </div>
      <div className="space-y-2">
        <h4 className="font-medium">Flattened selected region</h4>
        {patchUrl&&<img src={patchUrl} alt="Latitude-corrected Carrington surface patch" className="max-h-56 max-w-full border border-slate-600 bg-black object-contain"/>}
        <p className="text-slate-300">Selected-frame coverage: {(patchCoverage*100).toFixed(1)}% · minimum across {frames.length} observation frames: {(minimumCoverage*100).toFixed(1)}%</p>
        <button type="button" disabled={!frames.length} onClick={renderAll} className="rounded border border-indigo-500 px-2 py-1 disabled:opacity-40">Render region across observation timeline</button>
        <p role="status" className="text-slate-400">{status}</p>
      </div>
    </div>
    {gallery.length>0&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {gallery.map(item=><article key={item.index} className="rounded border border-slate-700 bg-slate-950 p-2">
        {item.url?<img src={item.url} alt={`Carrington registered patch ${item.obstime}`} className="mx-auto h-28 w-full object-contain"/>:
          <div className="grid h-28 place-items-center text-center text-amber-200">WCS unavailable</div>}
        <p className="mt-1 text-center text-[10px] text-slate-300">{item.obstime}</p>
        <p className="text-center text-[10px] text-slate-400">{(item.coverage*100).toFixed(0)}% geometrically visible</p>
      </article>)}
    </div>}
    <p className="text-amber-200">Display-normalized intensity only. Coverage is geometric, not a quality or feature-tracking score. Carrington registration assumes a spherical photosphere and rigid Carrington coordinates; it does not determine differential rotation or prove that a feature persists.</p>
  </section>;
}
