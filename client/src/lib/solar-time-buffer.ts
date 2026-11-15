/** Choose one missing sample, giving the playhead priority over prefetch. */
export function nextSolarBufferSlot(count:number,playhead:number,loaded:ReadonlySet<number>):number|null{
  if(!Number.isInteger(count)||count<1||!Number.isInteger(playhead)||
     playhead<0||playhead>=count)return null;
  if(!loaded.has(playhead))return playhead;
  for(let offset=1;offset<count;offset++){
    const next=(playhead+offset)%count;
    if(!loaded.has(next))return next;
  }
  return null;
}

/** Contiguous ready-pair spans for the white playback coverage line. */
export function solarBufferRuns(readySlots:readonly number[]):Array<{start:number;end:number}>{
  const runs:Array<{start:number;end:number}>=[];
  for(const slot of [...new Set(readySlots)].sort((a,b)=>a-b)){
    const last=runs[runs.length-1];
    if(last&&last.end===slot-1)last.end=slot;
    else runs.push({start:slot,end:slot});
  }
  return runs;
}

/** Storage admission failures should pause prefetch, never imply source absence. */
export function isSolarStorageBlock(message:string):boolean{
  return /^solar_export_resource_blocked: SOLAR_(?:CACHE_|REQUEST_BYTE_LIMIT)/.test(message);
}
