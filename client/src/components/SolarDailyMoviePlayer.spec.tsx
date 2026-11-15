// @vitest-environment jsdom
import React from 'react';
import {createHash} from 'node:crypto';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SolarDailyMoviePlayer} from './SolarDailyMoviePlayer';
vi.mock('@react-three/fiber',()=>({Canvas:()=>null}));
vi.mock('@react-three/drei',()=>({Line:()=>null,OrbitControls:()=>null}));
const date='2026-09-21',time=`${date}T15:04:00.000Z`;
const movieBytes=new Uint8Array([0,1,2,3]);
const movieHash=createHash('sha256').update(movieBytes).digest('hex');
const modelId=`solar-pfss:${'a'.repeat(64)}`;
const entry={epochUtc:time,productId:'mrzqs260921t1504c2316_021',
  sourceUrl:'https://example.org/mrzqs260921t1504c2316_021.fits.gz',sourceSha256:'b'.repeat(64),
  sourceBytes:2880,mapSha256:'c'.repeat(64),mapContentId:`solar-radial:${'d'.repeat(64)}`,
  payloadSha256:'e'.repeat(64),modelSha256:'f'.repeat(64),modelId,lineCount:1,
  solver:{name:'fixture',version:'1',sourceSurfaceRadiusSolar:2.5,runAtUtc:time,boundaryProcessing:'fixture',
    grid:{longitudeCells:12,sineLatitudeCells:6,radialCells:4},tracing:{name:'fixture',
      seedRadiusSolar:1,seedPattern:'fixture',maxSteps:10,stepSize:0.1,rejectedLines:0}},
  displayRotationDeg:0,rotationMethod:'GONG_CRNOW_LONGADJ_integer_degree_approximation',
  coordinateRegistrationVerified:false};
const day={schemaVersion:'solar-gong-pfss-day/1',dayId:`solar-gong-pfss-day:${'1'.repeat(64)}`,
  dateUtc:date,catalogUrl:'https://example.org/',catalogSha256:'2'.repeat(64),modelCount:1,
  missingHours:Array.from({length:24},(_,i)=>i).filter(i=>i!==15),
  boundaryMeaning:'fixture synoptic map',fieldMeaning:'fixture model',sourceIdentityAuthenticated:false,
  scientificAdmission:false,entries:[entry]};
const catalog={schemaVersion:'solar-rob-pfss-range/1',startUtc:time,endUtc:time,checkedAtUtc:time,
  months:[],entries:[{relativePath:'2026/09/21/mrbqs260921t1504c2316_021',
    magnetogramTimeHintUtc:time,modelUrl:'https://example.org/model.fits',catalogSha256:'3'.repeat(64)}],
  truncated:false,cadenceClaim:'irregular_publication_observed_from_catalog_only',
  sourceIdentityAuthenticated:false,scientificAdmission:false};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function response(value:unknown,status=200){return {ok:status<400,status,json:async()=>value};}
function harness(kind:'day'|'rob'){
  const pending=deferred<unknown>();let pendingSignal:AbortSignal|undefined;
  let pendingStarted=false,manifestCount=0;
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.includes('/daily-movie/manifest?')){
      if(++manifestCount>1)return new Promise(()=>{});
      return response({schemaVersion:'sdo-aia193-daily-movie/1',dateUtc:date,
        movieSourceUrl:'https://example.org/daily.mp4',frameIndexSourceUrl:'https://example.org/',
        movieSha256:movieHash,movieBytes:movieBytes.length,
        frameTimesUtc:[time,`${date}T15:05:00.000Z`],frameCount:2,retainedAtUtc:time});
    }
    if(url.includes('/daily-movie/media?'))return {ok:true,arrayBuffer:async()=>movieBytes.buffer.slice(0)};
    if(url.includes('/daily-movie/hmi-manifest?'))return response({error:'fixture_hmi_unavailable'},404);
    if(url.includes('/gong-pfss/day?')){
      if(kind==='rob')return response({},404);
      pendingSignal=init?.signal as AbortSignal;pendingStarted=true;
      return {ok:true,status:200,json:()=>pending.promise};
    }
    if(url.includes('/gong-pfss/model?'))return response({error:'fixture_model_unavailable'},404);
    if(url.includes('/rob-pfss/range?'))return response(catalog);
    if(url.includes('/rob-pfss/playback-pair?')){
      pendingSignal=init?.signal as AbortSignal;pendingStarted=true;
      return {ok:true,status:200,json:()=>pending.promise};
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  });
  vi.stubGlobal('fetch',fetcher);
  const mounted=render(<SolarDailyMoviePlayer/>);
  fireEvent.change(screen.getByLabelText('UTC day'),{target:{value:date}});
  fireEvent.click(screen.getByRole('button',{name:'Load daily movie'}));
  return {pending,fetcher,mounted,started:()=>pendingStarted,signal:()=>pendingSignal};
}
beforeEach(()=>{
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  vi.stubGlobal('URL',class extends URL {
    static createObjectURL=vi.fn(()=>'blob:fixture');
    static revokeObjectURL=vi.fn();
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('keeps a checked current-day catalog visible even when its model is unavailable',async()=>{
  const h=harness('day');await waitFor(()=>expect(h.started()).toBe(true));
  await act(async()=>{h.pending.resolve(day);await h.pending.promise;});
  expect(await screen.findByText(/GONG archive.*https:\/\/example.org/)).toBeTruthy();
  expect(screen.getByText(/fixture_model_unavailable/)).toBeTruthy();
  expect(h.fetcher.mock.calls.some(([url])=>String(url).includes('/gong-pfss/model?'))).toBe(true);
});
it('ignores an old day JSON body after loading another movie',async()=>{
  const h=harness('day');await waitFor(()=>expect(h.started()).toBe(true));
  fireEvent.change(screen.getByLabelText('UTC day'),{target:{value:'2026-09-22'}});
  fireEvent.click(screen.getByRole('button',{name:'Load daily movie'}));
  expect(h.signal()?.aborted).toBe(true);
  await act(async()=>{h.pending.resolve(day);await h.pending.promise;});
  expect(screen.getByText('Loading ROB source index…')).toBeTruthy();
  expect(screen.queryByText(/Loading 1 independent GONG\/PFSS solves/)).toBeNull();
  expect(h.fetcher.mock.calls.some(([url])=>String(url).includes('/gong-pfss/model?'))).toBe(false);
});
it('ignores an old ROB pair failure after loading another movie',async()=>{
  const h=harness('rob');await waitFor(()=>expect(h.started()).toBe(true));
  fireEvent.click(screen.getByRole('button',{name:'Load daily movie'}));
  expect(h.signal()?.aborted).toBe(true);
  await act(async()=>{h.pending.reject(new Error('old pair body failed'));await h.pending.promise.catch(()=>{});});
  expect(screen.getByText('Loading ROB source index…')).toBeTruthy();
  expect(screen.queryByText(/1\/1 ROB candidates loaded/)).toBeNull();
});
it('reports a current ROB pair failure without representing it as model data',async()=>{
  const h=harness('rob');await waitFor(()=>expect(h.started()).toBe(true));
  await act(async()=>{h.pending.reject(new Error('current pair failed'));await h.pending.promise.catch(()=>{});});
  expect(await screen.findByText('current pair failed')).toBeTruthy();
  expect(screen.getByText(/1\/1 ROB candidates loaded/)).toBeTruthy();
  expect(screen.queryByText(/Held ROB PFSS/)).toBeNull();
});
it('aborts acquisition and releases the retained media URL on unmount',async()=>{
  const h=harness('day');await waitFor(()=>expect(h.started()).toBe(true));
  h.mounted.unmount();expect(h.signal()?.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
  await act(async()=>{h.pending.resolve(day);await h.pending.promise;});
  expect(h.fetcher.mock.calls.some(([url])=>String(url).includes('/gong-pfss/model?'))).toBe(false);
});
