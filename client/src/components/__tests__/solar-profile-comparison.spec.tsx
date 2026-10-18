// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { SolarProfileComparison } from '../SolarProfileComparison';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '../../lib/workstation/accountCapabilityPolicy';
afterEach(cleanup);
const profile = (sourceKind: string) => ({schemaVersion:'solar-radial-display/1',sourceKind,
  label:sourceKind,quantity:'density',units:'kg/m3',referenceRadiusM:695980000,
  sourceSha256:'a'.repeat(64),points:[{r:0.1,value:3},{r:0.5,value:1}]});
const file = (value: unknown) => ({size:100, text:async () => JSON.stringify(value)});
describe('integrated solar profile comparison', () => {
  it('clears both profile sides and rejects a late read after account changes', async () => {
    render(<SolarProfileComparison />);
    fireEvent.change(screen.getByLabelText('Observed radial profile'),{target:{files:[file(profile('observed'))]}});
    fireEvent.change(screen.getByLabelText('Model radial profile'),{target:{files:[file(profile('model'))]}});
    await waitFor(()=>expect(screen.getByRole('img',{name:'Dimensional radial residual'})).toBeTruthy());
    let finish!:(value:string)=>void;
    fireEvent.change(screen.getByLabelText('Model radial profile'),{target:{files:[{size:100,text:()=>new Promise<string>(resolve=>{finish=resolve;})}]}});
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    expect(screen.queryByRole('img',{name:'Observed radial plot'})).toBeNull();
    await act(async()=>{finish(JSON.stringify({...profile('model'),label:'Previous account model'}));});
    expect(screen.queryByText('Previous account model')).toBeNull();
    expect(screen.queryByRole('img',{name:'Dimensional radial residual'})).toBeNull();
    expect(screen.getByText('Account changed; imported radial profiles cleared.')).toBeTruthy();
  });
  it('starts without invented model results', () => {
    render(<SolarProfileComparison />);
    expect(screen.getByRole('status').textContent).toContain('Waiting for compatible');
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('renders aligned imported profiles and residuals', async () => {
    render(<SolarProfileComparison />);
    fireEvent.change(screen.getByLabelText('Observed radial profile'), {target:{files:[file(profile('observed'))]}});
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[file(profile('model'))]}});
    await waitFor(() => expect(screen.getByRole('img',{name:'Dimensional radial residual'})).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('G1 acceptance are not evaluated');
  });
  it('blocks incompatible radius conventions', async () => {
    render(<SolarProfileComparison />);
    fireEvent.change(screen.getByLabelText('Observed radial profile'), {target:{files:[file(profile('observed'))]}});
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[file({...profile('model'),referenceRadiusM:695700000})]}});
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('mismatch'));
    expect(screen.queryByRole('img',{name:'Dimensional radial residual'})).toBeNull();
  });
  it('rejects demo and oversized files', async () => {
    render(<SolarProfileComparison />);
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[file(profile('demo'))]}});
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('demo data is not evidence'));
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[{size:2000001}]}});
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 MB'));
  });
  it('does not let a late file read replace a newer selection', async () => {
    render(<SolarProfileComparison />);
    let finish!: (value: string) => void;
    const slow = {size:100, text:() => new Promise<string>(resolve => { finish = resolve; })};
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[slow]}});
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[file({...profile('model'),label:'Newest selected model'})]}});
    await waitFor(() => expect(screen.getByText('Newest selected model')).toBeTruthy());
    finish(JSON.stringify({...profile('model'),label:'Stale model'}));
    await waitFor(() => expect(screen.getByText('Newest selected model')).toBeTruthy());
    expect(screen.queryByText('Stale model')).toBeNull();
  });
  it('removes old residuals while a replacement is still being read', async () => {
    render(<SolarProfileComparison />);
    fireEvent.change(screen.getByLabelText('Observed radial profile'), {target:{files:[file(profile('observed'))]}});
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[file(profile('model'))]}});
    await waitFor(() => expect(screen.getByRole('img',{name:'Dimensional radial residual'})).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Model radial profile'), {target:{files:[{size:100,text:() => new Promise(() => {})}]}});
    expect(screen.queryByRole('img',{name:'Dimensional radial residual'})).toBeNull();
  });
});
