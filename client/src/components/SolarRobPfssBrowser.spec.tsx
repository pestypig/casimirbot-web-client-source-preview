// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../shared/helix-account-session';
import {cacheAccountCapabilityPolicy} from '../lib/workstation/accountCapabilityPolicy';
import {SolarRobPfssBrowser} from './SolarRobPfssBrowser';
const owner='rob-owner',time='2026-09-21T15:04:00.000Z';
const common={catalogUrl:'https://example.org/list.txt',catalogSha256:'a'.repeat(64),
  catalogBytes:100,catalogCheckedAtUtc:time,relativePath:'2026/09/21/mrbqs260921t1504c2316_021',
  modelUrl:'https://example.org/model.fits',sourceSha256:'b'.repeat(64),sourceBytes:2880,
  retrievedAtUtc:time,fitsDateObsUtc:time,magnetogramTimeHintUtc:time,scientificAdmission:false};
const receipt={...common,schemaVersion:'solar-rob-pfss-retained/2',
  acquisitionId:`rob-pfss-acquisition:${'c'.repeat(64)}`,ownerProfileId:owner,parentMagnetogramRetained:false};
const snapshot={...common,schemaVersion:'solar-rob-pfss-snapshot/3',
  sourceObservatory:'Royal Observatory of Belgium',inputNetwork:'NSO/GONG NETWORK',
  sourceMapRecordKey:'mrbqs260921t1504c2316_021',sourceMapBytesIncluded:false,
  sourceMapSolverInputHashKnown:false,coordinateFrame:'ROB_earth_reference_unrotated_JHV_axis_convention',
  coordinateRegistrationVerified:false,units:'solar_radii_degrees',encoding:'ROB_unsigned_short_cartesian/1',
  totalLines:1,pointsPerLine:40,displaySelection:'uniform_index_stride_max_96/1',
  lines:[{lineIndex:0,topology:'closed',polarity:'positive',encodedStrengthAtFirstPoint:0.5,
    points:Array.from({length:40},()=>[1,0,0])}],farSideDirectlyObserved:false,
  sameTimeWholeSunObserved:false,coronalLinesMeasured:false,sourceIdentityAuthenticated:false};
function list(entries=[receipt]){return {schemaVersion:'solar-rob-pfss-retained-list/1',entries,
  integrityStatus:'listed_receipts_not_reverified',truncated:false,scientificAdmission:false};}
function json(value:unknown){return {ok:true,status:200,json:async()=>value};}
function setup(){const onSnapshot=vi.fn();render(<SolarRobPfssBrowser onSnapshot={onSnapshot}
  onParentMap={vi.fn()} onParentRotation={vi.fn()} onParentReceipt={vi.fn()}/>);return onSnapshot;}
async function chooseSaved(){fireEvent.click(screen.getByRole('button',{name:'List retained models'}));
  fireEvent.click(await screen.findByRole('button',{name:/^Reopen /}));}
beforeEach(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,owner));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('lists and reopens an exact model under the selected owner',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json(list())).mockResolvedValueOnce(json({receipt,snapshot})));
  const onSnapshot=setup();await chooseSaved();
  await screen.findByText(/Reopened verified ROB FITS/);
  expect(onSnapshot).toHaveBeenCalledWith(snapshot);
});
it('rejects list entries attributed to another owner',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json(list([{...receipt,ownerProfileId:'other'}]))));
  setup();fireEvent.click(screen.getByRole('button',{name:'List retained models'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'List retained models'}) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole('button',{name:/^Reopen /})).toBeNull();
  expect(screen.getByText(/Saved ROB model owner differs/)).toBeTruthy();
});
it.each(['owner','hash','time','catalog'])('rejects a reopened %s that differs from the selected retained record',async(field)=>{
  const changedReceipt={...receipt},changedSnapshot={...snapshot};
  if(field==='owner')changedReceipt.ownerProfileId='other';
  if(field==='hash'){changedReceipt.sourceSha256='9'.repeat(64);changedSnapshot.sourceSha256='9'.repeat(64);}
  if(field==='time'){changedReceipt.fitsDateObsUtc='2026-09-21T16:04:00.000Z';changedSnapshot.fitsDateObsUtc=changedReceipt.fitsDateObsUtc;}
  if(field==='catalog'){changedReceipt.catalogSha256='9'.repeat(64);changedSnapshot.catalogSha256='9'.repeat(64);}
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json(list())).mockResolvedValueOnce(json({receipt:changedReceipt,snapshot:changedSnapshot})));
  const onSnapshot=setup();await chooseSaved();
  await waitFor(()=>expect((screen.getByRole('button',{name:'List retained models'}) as HTMLButtonElement).disabled).toBe(false));
  expect(onSnapshot.mock.calls.some(([value])=>value!==null)).toBe(false);
  expect(screen.getByText(/Retained ROB model identity mismatch/)).toBeTruthy();
});
it.each(['date','account'])('allows recovery immediately when the %s changes during an unresolved request',async(kind)=>{
  let resolve!:(value:unknown)=>void;const pending=new Promise(yes=>{resolve=yes;});
  const fetcher=vi.fn().mockReturnValue(pending);vi.stubGlobal('fetch',fetcher);
  setup();fireEvent.click(screen.getByRole('button',{name:'Find models'}));
  const button=screen.getByRole('button',{name:'Find models'}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  if(kind==='date')fireEvent.change(screen.getByLabelText('ROB PFSS UTC date'),{target:{value:'2026-09-21'}});
  else act(()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'other');});
  expect(signal.aborted).toBe(true);
  expect(button.disabled).toBe(false);
  await act(async()=>{resolve(json({}));await pending;});
  expect(screen.queryByRole('button',{name:/^Reopen /})).toBeNull();
  expect(button.disabled).toBe(false);
});
