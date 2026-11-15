// @vitest-environment jsdom
import React from 'react';
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react';
import {syntheticSolarPortablePackage} from '../../../../tests/fixtures/solar-portable-package';
vi.mock('@tanstack/react-query',()=>({useMutation:()=>({mutate:vi.fn(),isPending:false})}));
vi.mock('../SolarDiskCanvas',()=>({SolarDiskCanvas:()=>null}));
vi.mock('../SolarKhiNativeOverlay',()=>({SolarKhiNativeOverlay:()=>null}));
vi.mock('../SolarObservationRaster',()=>({SolarObservationRaster:()=>null}));
vi.mock('../SolarActiveRegionCatalog',()=>({SolarActiveRegionCatalog:()=>null}));
vi.mock('../DailySolarEvents',()=>({DailySolarEvents:()=>null}));
vi.mock('../SolarReasoningBudget',()=>({SolarReasoningBudget:()=>null}));
vi.mock('../GcnSourceConnection',()=>({GcnSourceConnection:()=>null}));
vi.mock('../SolarProfileComparison',()=>({SolarProfileComparison:({observationArchive}:any)=><p data-testid="selected-archive">{observationArchive?.archive_identity?.snapshotId??'none'}</p>}));
vi.mock('../SolarMagneticGlobe',()=>({SolarMagneticGlobe:()=>null}));
import {serializeObservationSnapshot} from '../../lib/solar-observation-replay';
import StarWatcherPanel from '../../pages/star-watcher-panel';
import {cacheAccountCapabilityPolicy} from '../../lib/workstation/accountCapabilityPolicy';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../../shared/helix-account-session';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const archive=JSON.parse(await syntheticSolarPortablePackage(true)).observationArchive;
const id='solar-source-image:'+'a'.repeat(64),otherId='solar-source-image:'+'b'.repeat(64);
const receipt={schemaVersion:'solar-observation-source-retained/1',acquisitionId:id,ownerProfileId:'profile-a',
  archiveId:archive.archive_identity.snapshotId,frameIndex:0,sourceFitsSha256:archive.frames[0].fits_sha256,
  sourceFitsBytes:4096,displaySha256:archive.frames[0].display_sha256,observedAtUtc:archive.frames[0].obstime,
  instrument:archive.instrument,wavelengthAngstrom:archive.wavelength_A,retainedAtUtc:'2026-09-27T01:00:00Z',
  providerIdentityAuthenticated:false,scientificAdmission:false};
const listing=(entries:any[]=[receipt])=>({schemaVersion:'solar-observation-source-list/1',entries,
  integrityStatus:'listed_receipts_not_reverified',scientificAdmission:false});
const response=(data:any)=>({ok:true,json:async()=>data,text:async()=>JSON.stringify(data)});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function network(list:any=async()=>response(listing()),read:any=async()=>response({receipt,archive})){
  const fetch=vi.fn(async(url:any,options:any)=>{
    if(String(url).endsWith('/observation-source/list'))return list(options);
    if(String(url).includes('/observation-source/retained?'))return read(options);
    return response({available:false,connected:false,driver_history_len:0});
  });vi.stubGlobal('fetch',fetch);return fetch;
}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-a');});
afterEach(()=>{cleanup();cacheAccountCapabilityPolicy(null,null);vi.restoreAllMocks();vi.unstubAllGlobals();});
function mount(){const view=render(<StarWatcherPanel/>);fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));return view;}
const select=()=>screen.getByLabelText('Retained solar source image') as HTMLSelectElement;
async function list(){fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));await waitFor(()=>expect(select().value).toBe(id));}
function reopen(){fireEvent.click(screen.getByRole('button',{name:'Reopen source and display'}));}
it('reopens the selected account-owned receipt with matching archive and frame',async()=>{
  network();mount();await list();reopen();
  await waitFor(()=>expect(screen.getByTestId('selected-archive').textContent).toBe(receipt.archiveId));
  expect(screen.getByText(/source FITS and display bytes rehashed/)).toBeTruthy();
});
it('clears retained choices when the cached account changes',async()=>{
  network();mount();await list();act(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-b'));
  expect(select().options).toHaveLength(1);expect(select().value).toBe('');
});
it('ignores a late list body after an A to B to A account round trip',async()=>{
  const body=deferred<any>();let signal:AbortSignal|undefined;
  network(async(options:any)=>{signal=options.signal;return {ok:true,json:()=>body.promise};});mount();
  fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));
  await act(async()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-b');cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-a');body.resolve(listing());await body.promise;});
  expect(select().options).toHaveLength(1);expect(signal?.aborted).toBe(true);
});
it('keeps the newest list when an older list body arrives last',async()=>{
  const body=deferred<any>();let calls=0;
  network(async()=>++calls===1?{ok:true,json:()=>body.promise}:response(listing([{...receipt,acquisitionId:otherId}])));mount();
  fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));
  fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));
  await waitFor(()=>expect(select().value).toBe(otherId));
  await act(async()=>{body.resolve(listing());await body.promise;});
  expect(select().value).toBe(otherId);
});
it('aborts an outstanding retained-list request on unmount',()=>{
  let signal:AbortSignal|undefined;network(async(options:any)=>{signal=options.signal;return new Promise(()=>{});});
  const view=mount();fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));view.unmount();expect(signal?.aborted).toBe(true);
});
it.each([
  ['another owner',listing([{...receipt,ownerProfileId:'profile-b'}])],
  ['invalid receipt shape',listing([{...receipt,acquisitionId:'invalid'}])],
])('does not list %s',async(_name,data)=>{
  network(async()=>response(data));mount();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'List retained source images'}));});
  expect(select().options).toHaveLength(1);
  expect(screen.getByText(/Retained image list unavailable/)).toBeTruthy();
});
it.each([
  ['owner',{ownerProfileId:'profile-b'},false],
  ['selected ID',{acquisitionId:otherId},false],
  ['archive ID',{archiveId:'solar-observation:'+'c'.repeat(64)},true],
  ['observation time',{observedAtUtc:'2026-09-27T02:00:00Z'},true],
  ['instrument',{instrument:'HMI'},true],
  ['wavelength',{wavelengthAngstrom:171},true],
  ['listed source bytes',{sourceFitsBytes:8192},false],
])('rejects a reopened %s mismatch before importing the archive',async(_name,delta,listChanged)=>{
  const changed={...receipt,...delta};
  network(async()=>response(listing([listChanged?changed:receipt])),async()=>response({receipt:changed,archive}));mount();await list();reopen();
  await waitFor(()=>expect(screen.getByText(/Retained image not reopened|Reopened solar-source-image/)).toBeTruthy());
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');
  expect(screen.getByText(/Retained image not reopened/)).toBeTruthy();
});
it('does not import an old selection after the user chooses another retained source',async()=>{
  const body=deferred<any>();let signal:AbortSignal|undefined;
  network(async()=>response(listing([receipt,{...receipt,acquisitionId:otherId}])),async(options:any)=>{signal=options.signal;return {ok:true,json:()=>body.promise};});
  mount();await list();reopen();fireEvent.change(select(),{target:{value:otherId}});
  await act(async()=>{body.resolve({receipt,archive});await body.promise;});
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');expect(signal?.aborted).toBe(true);
});

async function loadForFreeze(retainOverride?: (value:any,options:any)=>any,readOverride?: (value:any)=>any){
  const raw={...archive,archive_identity:undefined,frames:[{...archive.frames[0],
    wcs_header:{CTYPE1:'HPLN-TAN',CTYPE2:'HPLT-TAN'},
    registration_geometry:{observerCarringtonLongitudeDeg:75,observerCarringtonLatitudeDeg:6,
      observerDistanceMeters:1.5e11,solarRadiusMeters:6.96e8}}]};
  const saved=JSON.parse(await serializeObservationSnapshot(raw));
  const retained={...receipt,archiveId:saved.archive_identity.snapshotId};
  const payload={...raw,meta:{...raw.meta,source:'SunPy'},source_retention:{state:'staged',ticket:'a'.repeat(40),
    archiveId:retained.archiveId,frameCount:1,expiresAtUtc:'2026-09-27T02:00:00Z'}};
  const fetch=vi.fn(async(url:any,options:any)=>{
    const path=String(url);
    if(path.includes('/sunpy-export?'))return response(payload);
    if(path.endsWith('/observation-source/retain'))return retainOverride?retainOverride(retained,options):response(retained);
    if(path.includes('/observation-source/retained?'))return response(readOverride?readOverride({receipt:retained,archive:saved}):{receipt:retained,archive:saved});
    return response({available:true,connected:false,driver_history_len:0});
  });vi.stubGlobal('fetch',fetch);mount();
  await act(async()=>{}); // Wait for runtime-capability admission before requesting images.
  fireEvent.click(screen.getByRole('button',{name:'Load SunPy + HEK'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Verify current observation for magnetic globe'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Verify current observation for magnetic globe'}));
  return {fetch,retained};
}
it('retains and reopens matching source bytes when freezing a downloaded observation',async()=>{
  const {fetch}=await loadForFreeze();
  await waitFor(()=>expect(screen.getByText(/Retained source FITS and display bytes rehashed/)).toBeTruthy());
  expect(fetch.mock.calls.filter(([url])=>String(url).includes('/observation-source/retained?'))).toHaveLength(1);
});
it('keeps only the display archive when retention returns another owner',async()=>{
  const {fetch}=await loadForFreeze(value=>response({...value,ownerProfileId:'profile-b'}));
  await waitFor(()=>expect(screen.getByText(/Display archive only; source retention unavailable/)).toBeTruthy());
  expect(fetch.mock.calls.filter(([url])=>String(url).includes('/observation-source/retained?'))).toHaveLength(0);
  expect(screen.queryByText(/Owner-retained source FITS:/)).toBeNull();
});
it('keeps only the display archive when readback returns another retained source ID',async()=>{
  await loadForFreeze(undefined,value=>({...value,receipt:{...value.receipt,acquisitionId:otherId}}));
  await waitFor(()=>expect(screen.getByText(/Display archive only; source retention unavailable/)).toBeTruthy());
  expect(screen.queryByText(/Owner-retained source FITS:/)).toBeNull();
});
it('aborts retention and avoids follow-up readback after an account switch',async()=>{
  const body=deferred<any>();let signal:AbortSignal|undefined;
  const {fetch,retained}=await loadForFreeze((_value,options)=>{signal=options.signal;return {ok:true,json:()=>body.promise};});
  await waitFor(()=>expect(signal).toBeTruthy());
  await act(async()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-b');body.resolve(retained);await body.promise;});
  expect(signal?.aborted).toBe(true);
  expect(fetch.mock.calls.filter(([url])=>String(url).includes('/observation-source/retained?'))).toHaveLength(0);
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');
});
