// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {GcnSourceConnection} from '../GcnSourceConnection';
import {gcnSourceStatus} from '../../../../server/services/neutrino-research/gcn-source-connection';
import {cacheAccountCapabilityPolicy} from '../../lib/workstation/accountCapabilityPolicy';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../../shared/helix-account-session';
const base=gcnSourceStatus('user-a',true,true);
const expires=new Date(Date.now()+3600_000).toISOString();
const status={...base,private_access:{...base.private_access,eligible:true,reason:'private_owner_pilot',expires_at:expires}};
const access={...status.private_access,leases:[{id:'a'.repeat(64),mode:'platform_managed',expires_at:expires,state:'active',
  provider_state:'waiting',last_seen_at:null,committed_records:0}]};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
const json=(value:unknown)=>Response.json(value);
beforeEach(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'user-a'));
afterEach(()=>{cleanup();cacheAccountCapabilityPolicy(null,null);vi.restoreAllMocks();vi.unstubAllGlobals();});
function fill(){fireEvent.change(screen.getByLabelText('GCN client ID'),{target:{value:'fixture-client-id'}});
  fireEvent.change(screen.getByLabelText('GCN client secret'),{target:{value:'fixture-not-a-real-secret'}});}
it('does not display another account connection from a successful status response',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>json({...status,profile_id:'user-b'})));render(<GcnSourceConnection/>);
  await act(async()=>{});expect(screen.queryByLabelText('GCN client ID')).toBeNull();
  expect(screen.getByText(/Sign in on the website/)).toBeTruthy();
});
it.each(['account','unmount'])('aborts an outstanding credential write on %s',async(mode)=>{
  const body=deferred<any>();let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn(async(_url:any,options:RequestInit)=>{
    if(options.method==='PUT'){signal=options.signal as AbortSignal;return {ok:true,json:()=>body.promise};}return json(status);
  }));const view=render(<GcnSourceConnection/>);await screen.findByLabelText('GCN client ID');fill();
  fireEvent.click(screen.getByRole('button',{name:'Save personal credentials'}));
  if(mode==='unmount')view.unmount();else act(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'user-b'));
  expect(signal?.aborted).toBe(true);
  await act(async()=>{body.resolve(status);await body.promise;});expect(screen.queryByText(/Credentials saved encrypted for your account/)).toBeNull();
});
it('requires a new private review after refreshing the displayed access window',async()=>{
  const fetcher=vi.fn(async()=>json(status));vi.stubGlobal('fetch',fetcher);render(<GcnSourceConnection/>);
  const review=await screen.findByRole('checkbox');fireEvent.click(review);
  fireEvent.click(screen.getByRole('button',{name:'Refresh connection status'}));
  await screen.findByRole('checkbox');expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button',{name:'Approve managed source qualification'}) as HTMLButtonElement).disabled).toBe(true);
});
it.each([
  ['malformed',{}],['changed expiry',{...access,expires_at:new Date(Date.now()+7200_000).toISOString()}],
  ['wrong mode',{...access,leases:[{...access.leases[0],mode:'own_gcn'}]}],
])('does not claim private activation from a %s receipt',async(_name,result)=>{
  let reads=0;const fetcher=vi.fn(async(_url:any,options:RequestInit)=>options.method==='PUT'?json(result):++reads===1?json(status):new Promise(()=>{}));
  vi.stubGlobal('fetch',fetcher);render(<GcnSourceConnection/>);fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Approve managed source qualification'}));
  await waitFor(()=>expect(screen.queryByText(/Private access approved|Private access change was not confirmed/)).toBeTruthy());
  expect(screen.queryByText(/Private access approved/)).toBeNull();expect(reads).toBe(1);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('validates a matching private lease without treating its provider as connected',async()=>{
  let reads=0;vi.stubGlobal('fetch',vi.fn(async(_url:any,options:RequestInit)=>options.method==='PUT'?json(access):++reads===1?json(status):new Promise(()=>{})));
  render(<GcnSourceConnection/>);fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Approve managed source qualification'}));
  await screen.findByText(/Private access approved for the displayed window/);
  expect(screen.getByText(/Provider connection readiness is shown separately/)).toBeTruthy();
});
it('aborts a pending private activation when its account changes',async()=>{
  let signal:AbortSignal|undefined;vi.stubGlobal('fetch',vi.fn(async(_url:any,options:RequestInit)=>{
    if(options.method==='PUT'){signal=options.signal as AbortSignal;return new Promise(()=>{});}return json(status);
  }));render(<GcnSourceConnection/>);fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Approve managed source qualification'}));
  act(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'user-b'));expect(signal?.aborted).toBe(true);
});

it.each([false,true])('confirms Stop only when no active private lease remains (active=%s)',async(active)=>{
  let reads=0;const fetcher=vi.fn(async(_url:any,options:RequestInit)=>options.method==='DELETE'
    ?json({...access,leases:[{...access.leases[0],state:active?'active':'stopped'}]})
    :++reads===1?json({...status,private_access:access}):new Promise(()=>{}));
  vi.stubGlobal('fetch',fetcher);render(<GcnSourceConnection/>);
  fireEvent.click(await screen.findByRole('button',{name:'Stop private source access'}));
  await screen.findByText(active?/Private access change was not confirmed/:/Private source access stopped/);
  const write=fetcher.mock.calls.find(([,options])=>options.method==='DELETE');
  expect(write?.[0]).toBe('/api/star-watcher/source-connections/gcn/private?expected_profile_id=user-a');
  if(active)expect(screen.queryByText(/Private source access stopped/)).toBeNull();
});
it('does not submit malformed credential fields',async()=>{
  const fetcher=vi.fn(async()=>json(status));vi.stubGlobal('fetch',fetcher);render(<GcnSourceConnection/>);
  await screen.findByLabelText('GCN client ID');fill();fireEvent.change(screen.getByLabelText('GCN client secret'),{target:{value:'short'}});
  const button=screen.getByRole('button',{name:'Save personal credentials'}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);fireEvent.click(button);expect(fetcher.mock.calls).toHaveLength(1);
});
it('requires status recovery instead of submitting an expired access window',async()=>{
  const expired={...status,private_access:{...status.private_access,expires_at:'2000-01-01T00:00:00Z'}};
  const fetcher=vi.fn(async()=>json(expired));vi.stubGlobal('fetch',fetcher);render(<GcnSourceConnection/>);
  fireEvent.click(await screen.findByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Approve managed source qualification'}));
  expect(fetcher.mock.calls).toHaveLength(1);expect(screen.getByText(/Private access window expired/)).toBeTruthy();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
