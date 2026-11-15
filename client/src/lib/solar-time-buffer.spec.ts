import {describe,expect,it} from 'vitest';
import {isSolarStorageBlock,nextSolarBufferSlot,solarBufferRuns} from './solar-time-buffer';

describe('solar time player buffer',()=>{
  it('loads the playhead first, then ahead, then earlier missing samples',()=>{
    const loaded=new Set<number>();
    expect(nextSolarBufferSlot(5,2,loaded)).toBe(2);
    loaded.add(2);
    expect(nextSolarBufferSlot(5,2,loaded)).toBe(3);
    loaded.add(3);loaded.add(4);
    expect(nextSolarBufferSlot(5,2,loaded)).toBe(0);
    loaded.add(0);loaded.add(1);
    expect(nextSolarBufferSlot(5,2,loaded)).toBeNull();
  });

  it('reprioritizes an uncached seek without discarding completed frames',()=>{
    const loaded=new Set([0,1,2,3]);
    expect(nextSolarBufferSlot(7,6,loaded)).toBe(6);
    expect([...loaded]).toEqual([0,1,2,3]);
    loaded.add(6);
    expect(nextSolarBufferSlot(7,6,loaded)).toBe(4);
  });

  it('marks only contiguous ready pairs and leaves gaps unfilled',()=>{
    expect(solarBufferRuns([5,1,0,3,3])).toEqual([
      {start:0,end:1},{start:3,end:3},{start:5,end:5},
    ]);
  });

  it('distinguishes storage admission from a missing source or a busy exporter',()=>{
    expect(isSolarStorageBlock('solar_export_resource_blocked: SOLAR_CACHE_QUOTA_REACHED')).toBe(true);
    expect(isSolarStorageBlock('solar_export_resource_blocked: SOLAR_CACHE_DISK_CAPACITY')).toBe(true);
    expect(isSolarStorageBlock('solar_export_resource_blocked: SOLAR_REQUEST_BYTE_LIMIT')).toBe(true);
    expect(isSolarStorageBlock('solar_export_resource_blocked: SOLAR_EXPORT_BUSY')).toBe(false);
    expect(isSolarStorageBlock('No AIA exposure returned for this time')).toBe(false);
  });
});
