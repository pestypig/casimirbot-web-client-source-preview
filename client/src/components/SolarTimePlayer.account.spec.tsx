// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../shared/helix-account-session';
import {cacheAccountCapabilityPolicy} from '../lib/workstation/accountCapabilityPolicy';
import {SolarTimePlayer} from './SolarTimePlayer';

vi.mock('./SolarMagneticGlobe',()=>({SolarTemporalMagneticGlobe:()=>null}));
vi.mock('./SolarObservationRaster',()=>({SolarObservationRaster:()=>null}));
vi.mock('./SolarDailyMoviePlayer',()=>({SolarDailyMoviePlayer:()=>null}));
const checkpoint=`solar-time-playback:${'a'.repeat(64)}`;
const list={schemaVersion:'solar-time-playback-list/1',entries:[{
  manifestId:checkpoint,startUtc:'2026-09-01T00:00:00.000Z',endUtc:'2026-09-02T00:00:00.000Z',
  savedAtUtc:'2026-09-03T00:00:00.000Z',coverage:'complete_selected_slots',
  retainedPairCount:2,slotCount:2,
}],integrityStatus:'manifest_metadata_only_sources_not_rehashed'};
function setup(){
  render(<SolarTimePlayer/>);
  fireEvent.click(screen.getByRole('button',{name:/Sampled FITS/}));
}
function account(id:string|null){
  act(()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,id);});
}
async function loadList(){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>list}));
  fireEvent.click(screen.getByRole('button',{name:'List saved checkpoints'}));
  await screen.findByLabelText('Saved solar time checkpoints');
  fireEvent.change(screen.getByLabelText('Saved solar time checkpoints'),{target:{value:checkpoint}});
}
beforeEach(()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-a');});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('clears the previous profile checkpoint list and selection without leaving sampled mode',async()=>{
  setup();await loadList();account('profile-b');
  expect(screen.queryByLabelText('Saved solar time checkpoints')).toBeNull();
  expect((screen.getByLabelText('Checkpoint ID') as HTMLInputElement).value).toBe('');
  expect(screen.getByText('No retained time-window checkpoint is open.')).toBeTruthy();
});

it('aborts an old profile read and ignores a body that completes after the switch',async()=>{
  let finish!:(value:unknown)=>void;
  const body=new Promise(resolve=>{finish=resolve;});
  const json=vi.fn(()=>body);
  const fetcher=vi.fn().mockResolvedValue({ok:true,json});vi.stubGlobal('fetch',fetcher);
  setup();fireEvent.click(screen.getByRole('button',{name:'List saved checkpoints'}));
  await waitFor(()=>expect(json).toHaveBeenCalledOnce());
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  account('profile-b');expect(signal.aborted).toBe(true);
  await act(async()=>{finish(list);await body;});
  expect(screen.queryByLabelText('Saved solar time checkpoints')).toBeNull();
  expect(screen.getByText('No retained time-window checkpoint is open.')).toBeTruthy();
});

it('retires a checkpoint across an A to B to A round trip in one event batch',async()=>{
  setup();await loadList();
  act(()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-b');
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'profile-a');});
  expect(screen.queryByLabelText('Saved solar time checkpoints')).toBeNull();
  expect((screen.getByLabelText('Checkpoint ID') as HTMLInputElement).value).toBe('');
});

it('clears retained checkpoint metadata on sign out',async()=>{
  setup();await loadList();account(null);
  expect(screen.queryByLabelText('Saved solar time checkpoints')).toBeNull();
});

it('preserves the selected checkpoint during a same-profile policy refresh',async()=>{
  setup();await loadList();
  act(()=>{cacheAccountCapabilityPolicy({...HELIX_USER_ACCOUNT_POLICY,
    locked_features:[...HELIX_USER_ACCOUNT_POLICY.locked_features,'unrelated_test_lock']},'profile-a');});
  expect(screen.getByLabelText('Saved solar time checkpoints')).toBeTruthy();
  expect((screen.getByLabelText('Checkpoint ID') as HTMLInputElement).value).toBe(checkpoint);
});
