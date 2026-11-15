import {describe,expect,it,vi} from 'vitest';
import {fetchSolarSourceJson} from '../client/src/lib/solar-source-fetch';

function jsonResponse(status:number,value:Record<string,unknown>){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
}

describe('solar time-player source acquisition',()=>{
  it('waits for a transient export lock and retries the same request',async()=>{
    const fetcher=vi.fn()
      .mockResolvedValueOnce(jsonResponse(429,{error:'solar_export_resource_blocked',message:'SOLAR_EXPORT_BUSY'}))
      .mockResolvedValueOnce(jsonResponse(200,{frames:[{obstime:'2026-10-17T05:30:04.842Z'}]}));
    const wait=vi.fn().mockResolvedValue(undefined);
    const signal=new AbortController().signal;
    const result=await fetchSolarSourceJson('/same-target',signal,
      {fetcher:fetcher as typeof fetch,retryDelaysMs:[1],wait});
    expect(result.frames).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/same-target','/same-target']);
    expect(wait).toHaveBeenCalledWith(1,signal);
  });

  it('does not retry a disk-capacity or source error',async()=>{
    const fetcher=vi.fn().mockResolvedValue(jsonResponse(507,
      {error:'solar_export_resource_blocked',message:'SOLAR_CACHE_DISK_CAPACITY'}));
    await expect(fetchSolarSourceJson('/target',new AbortController().signal,
      {fetcher:fetcher as typeof fetch,retryDelaysMs:[1]}))
      .rejects.toThrow('SOLAR_CACHE_DISK_CAPACITY');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a long occupied export as a wait rather than a source gap',async()=>{
    let attempts=0;
    const fetcher=vi.fn(async()=>jsonResponse(++attempts<=36?429:200,
      attempts<=36?{error:'solar_export_resource_blocked',message:'SOLAR_EXPORT_BUSY'}:{frames:[{}]}));
    const wait=vi.fn().mockResolvedValue(undefined);
    const onBusy=vi.fn();
    const result=await fetchSolarSourceJson('/same-target',new AbortController().signal,
      {fetcher:fetcher as typeof fetch,wait,onBusy});
    expect(result.frames).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(37);
    expect(wait).toHaveBeenCalledTimes(36);
    expect(onBusy).toHaveBeenCalledTimes(36);
  });

  it('does not retry after the playhead abandons the request',async()=>{
    const controller=new AbortController();
    const fetcher=vi.fn().mockResolvedValue(jsonResponse(429,
      {error:'solar_export_resource_blocked',message:'SOLAR_EXPORT_BUSY'}));
    const wait=vi.fn().mockImplementation(async()=>{
      controller.abort();throw new DOMException('Aborted','AbortError');
    });
    await expect(fetchSolarSourceJson('/target',controller.signal,
      {fetcher:fetcher as typeof fetch,retryDelaysMs:[1],wait})).rejects.toMatchObject({name:'AbortError'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
