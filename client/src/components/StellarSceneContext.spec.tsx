// @vitest-environment jsdom
import React from 'react';
import {webcrypto} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {StellarSceneContext} from './StellarSceneContext';

if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shows a solar planning scaffold with no false observed/model authority',async()=>{
  render(<StellarSceneContext/>);
  fireEvent.click(screen.getByRole('button',{name:'Load Sun planning scaffold'}));
  await waitFor(()=>expect(screen.getByLabelText('Loaded stellar scene').textContent).toMatch(/stellar-scene:[a-f0-9]{64}/));
  expect(screen.getByText(/no observations or MESA model are attached/i)).toBeTruthy();
  expect(screen.getByText(/No observed whole sphere or admitted model–observation comparison/)).toBeTruthy();
});
it('rejects an unverified local scene file',async()=>{
  render(<StellarSceneContext/>);
  const file=new File(['{"sceneId":"forged"}'],'scene.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>'{"sceneId":"forged"}'});
  fireEvent.change(screen.getByLabelText('Import stellar scene JSON'),{target:{files:[file]}});
  await waitFor(()=>expect(screen.getByRole('status').textContent).toMatch(/Scene rejected/));
  expect(screen.queryByLabelText('Loaded stellar scene')).toBeNull();
});
