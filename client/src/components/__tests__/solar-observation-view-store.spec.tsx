// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect} from 'vitest';
import {render,screen,act,cleanup} from '@testing-library/react';
import {createSolarObservationViewStore,useSolarObservationView} from '../../lib/solar-observation-view-store';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
afterEach(cleanup);
it('retains exact acquisition/identity across navigation without a network or storage operation',()=>{
  const target=new EventTarget();const store=createSolarObservationViewStore<any>(8000000,target);
  const data={archive_identity:{snapshotId:'test-only'},frames:[{obstime:'2026-09-26T18:00:00Z'}]};
  function View(){const [value]=useSolarObservationView(store);return <p>{value?.frames[0].obstime??'empty'}</p>;}
  try {
    store.set(data);data.frames[0].obstime='mutated-caller';
    const mounted=render(<View/>);expect(screen.getByText('2026-09-26T18:00:00Z')).toBeTruthy();mounted.unmount();
    render(<View/>);expect(screen.getByText('2026-09-26T18:00:00Z')).toBeTruthy();
    expect(store.getSnapshot().archive_identity.snapshotId).toBe('test-only');
    act(()=>{target.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));});
    expect(screen.getByText('empty')).toBeTruthy();
  }finally{store.dispose();}
});
it('clears an observation when account policy changes while the panel is unmounted',()=>{
  const target=new EventTarget(),store=createSolarObservationViewStore<{id:string}>(64,target);
  try{store.set({id:'first-account'});target.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    expect(store.getSnapshot()).toBeNull();}finally{store.dispose();}
});
it('bounds UTF-8 bytes and retains the previous selection on oversized or unserializable input',()=>{
  const store=createSolarObservationViewStore<any>(30,null);
  try{
    store.set({id:'old'});expect(()=>store.set({id:'界'.repeat(10)})).toThrow('retained-view limit');
    expect(store.getSnapshot()).toEqual({id:'old'});
    const circular:any={};circular.self=circular;expect(()=>store.set(circular)).toThrow();
    expect(store.getSnapshot()).toEqual({id:'old'});
    store.set(previous=>({...previous,ok:true}));expect(store.getSnapshot()).toEqual({id:'old',ok:true});
  }finally{store.dispose();}
});
