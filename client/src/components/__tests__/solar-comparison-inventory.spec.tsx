// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import {it,expect,afterEach} from 'vitest';
import {SolarComparisonInventory} from '../SolarComparisonInventory';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
afterEach(cleanup);
const auditPath='.tmp/solar-comparison-input-inventory-iE3dx0/inventory.json';
it.skipIf(!existsSync(auditPath))('renders the actual retained local inventory without promoting it',async()=>{
  const text=await readFile(auditPath,'utf8');render(<SolarComparisonInventory/>);
  await act(async()=>fireEvent.change(screen.getByLabelText('Comparison input inventory'),{target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}}));
  expect(screen.getByText('author_solution')).toBeTruthy();
  expect(screen.getByText(/This inventory supplies no bound candidate/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('invalidates a pending inventory read when account policy changes',async()=>{
  render(<SolarComparisonInventory/>);let finish!:(text:string)=>void;
  fireEvent.change(screen.getByLabelText('Comparison input inventory'),{target:{files:[{size:100,text:()=>new Promise<string>(resolve=>{finish=resolve;})}]}});
  act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await act(async()=>finish('{}'));
  expect(screen.getByRole('alert').textContent).toContain('Account changed');
  expect(screen.queryByText(/Inventory inspection time:/)).toBeNull();
});
it('rejects oversized imports without reading them',async()=>{
  render(<SolarComparisonInventory/>);let reads=0;
  fireEvent.change(screen.getByLabelText('Comparison input inventory'),{target:{files:[{size:60001,text:async()=>{reads++;return '{}';}}]}});
  expect(reads).toBe(0);expect(screen.getByRole('alert').textContent).toContain('Invalid or oversized');
});
