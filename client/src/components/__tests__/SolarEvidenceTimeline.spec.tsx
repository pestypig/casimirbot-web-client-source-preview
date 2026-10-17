// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {buildSolarEvidenceTimeline,SolarEvidenceTimeline,solarUtcMs} from '../SolarEvidenceTimeline';

afterEach(cleanup);

const frames=[{obstime:'2026-09-30T12:00:00'},{obstime:'2026-09-30T12:10:00Z'}];
const bins=[
  {start:'2026-09-30T12:00:00',mean_long:1e-7},
  {start:'2026-09-30T12:05:00Z',mean_long:8e-6},
  {start:'2026-09-30T12:10:00Z',mean_long:1e-6},
  {start:'2026-09-30T12:15:00Z',mean_long:-1},
];
const events=[{id:'flare-1',event_type:'FL',start_time:'2026-09-30T12:04:00Z',
  end_time:'2026-09-30T12:08:00Z',goes_class:'C8.6'},
  {id:'region-1',event_type:'AR',start_time:'2026-09-30T12:00:00Z'}];

it('interprets SunPy naive ISO timestamps as UTC, not browser-local time',()=>{
  expect(solarUtcMs('2026-09-30T12:00:00')).toBe(Date.parse('2026-09-30T12:00:00Z'));
  expect(solarUtcMs('2026-09-30 12:00:00')).toBeNull();
});

it('aligns dated frames, GOES XRS samples and only HEK flare intervals without inventing missing flux',()=>{
  const timeline=buildSolarEvidenceTimeline({frames,currentFrameIndex:1,goesBins:bins,events});
  expect(timeline).not.toBeNull();
  expect(timeline?.fluxCount).toBe(3);
  expect(timeline?.flares).toEqual([expect.objectContaining({id:'flare-1',label:'C8.6'})]);
  expect(timeline?.cursorTime).toBe('2026-09-30T12:10:00.000Z');
  expect(timeline!.cursorX!).toBeGreaterThan(timeline!.flares[0].x);
  expect(buildSolarEvidenceTimeline({frames:[],currentFrameIndex:0,goesBins:bins,events})).toBeNull();
});

it('labels the temporal join as co-occurrence and shows absent GOES samples explicitly',()=>{
  const onFrameSelect=vi.fn();
  render(<SolarEvidenceTimeline frames={frames} currentFrameIndex={0} goesBins={[]}
    events={events} onFrameSelect={onFrameSelect}/>);
  expect(screen.getByRole('img',{name:/0 GOES XRS five-minute bins and 1 catalog flare windows/})).toBeTruthy();
  expect(screen.getByText(/No GOES XRS samples overlap/)).toBeTruthy();
  expect(screen.getByText(/Time co-occurrence only/)).toBeTruthy();
  fireEvent.change(screen.getByRole('slider',{name:'Image frame in observation timeline'}),{target:{value:'1'}});
  expect(onFrameSelect).toHaveBeenCalledWith(1);
});
