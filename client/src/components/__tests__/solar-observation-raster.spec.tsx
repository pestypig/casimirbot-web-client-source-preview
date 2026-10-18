// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,cleanup} from '@testing-library/react';
import {existsSync,readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {SolarObservationRaster} from '../SolarObservationRaster';
import {validateObservationReplay} from '../../../../shared/solar-observation-replay';
import {decodeObservation} from '../../../../public/solar-workstation-comparison.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function canvas() {
  const put=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:put,
  } as unknown as CanvasRenderingContext2D);return put;
}
it('uses the stated square-root grayscale and FITS row flip, with no column reversal',()=>{
  const put=canvas();render(<SolarObservationRaster size={2} data={new Float32Array([0,1,.25,0])} />);
  expect(Array.from(put.mock.calls[0][0].data)).toEqual([
    128,128,128,255,0,0,0,255,0,0,0,255,255,255,255,255,
  ]);
});
const source='.tmp/solar-live-evidence-yJ7Mk1/verified-replay.json';
it.skipIf(!existsSync(source))('matches every pixel of the hash-verified real archive without resampling or clipping the disk',async()=>{
  vi.stubGlobal('crypto',webcrypto);const put=canvas();
  const archive=await validateObservationReplay(JSON.parse(readFileSync(source,'utf8')));
  const frame=archive.frames[0];const size=frame.grid_size;
  render(<SolarObservationRaster size={size} data={decodeObservation(frame)} />);
  const displayed=put.mock.calls[0][0].data as Uint8ClampedArray;
  const original=Buffer.from(frame.map_b64,'base64');
  for(let row=0;row<size;row++)for(let column=0;column<size;column++) {
    const input=original.readFloatLE((row*size+column)*4);
    const value=Math.round(255*Math.sqrt(input));
    const offset=((size-1-row)*size+column)*4;
    expect(Array.from(displayed.slice(offset,offset+4))).toEqual([value,value,value,255]);
  }
  expect(put).toHaveBeenCalledOnce();
  expect(archive.archive_identity?.snapshotId).toBe('solar-observation:3d6b74885c690b6af8787b0f40b5f192acaef8f52714036b7f3fbadf57703d3a');
});
