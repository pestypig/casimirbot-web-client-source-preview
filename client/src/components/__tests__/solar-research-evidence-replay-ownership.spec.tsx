// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
const verify=vi.hoisted(()=>vi.fn());
vi.mock('../../../../shared/solar-research-evidence-package',()=>({
  verifySolarResearchEvidencePackage:verify,SOLAR_EVIDENCE_PACKAGE_MAX_BYTES:9_000_000,
}));
import {SolarResearchEvidenceReplay} from '../SolarResearchEvidenceReplay';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
afterEach(()=>{cleanup();verify.mockReset();});
function deferred() {let resolve!:(value:unknown)=>void;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};}
const result={indexId:'old-index',record:{quantity:'test',units:'test',operator:'test',rows:[]},archiveReplay:null,
  manifest:{comparison:{recordId:'old-record'},observationArchive:null,literatureContextId:null,exclusions:[]}};
it('cannot republish an older verified result after draft replacement',async()=>{
  const pending=deferred();verify.mockReturnValue(pending.promise);render(<SolarResearchEvidenceReplay />);
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:'first'}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await act(async()=>{await Promise.resolve();});
  expect(verify).toHaveBeenCalledWith('first');
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:'second'}});
  await act(async()=>{pending.resolve(result);});
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText(/old-index/)).toBeNull();
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
});
it('cannot republish a pending verification after explicit clear',async()=>{
  const pending=deferred();verify.mockReturnValue(pending.promise);render(<SolarResearchEvidenceReplay />);
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await act(async()=>{await Promise.resolve();});
  fireEvent.click(screen.getByText('Clear portable replay'));
  await act(async()=>{pending.resolve(result);});
  expect(screen.getByText('Replay cleared.')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
});
it('offers explicit retention only after verification and clears it on replacement or account change',async()=>{
  verify.mockResolvedValue(result);render(<SolarResearchEvidenceReplay />);
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:'exact imported bytes'}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await act(async()=>{await Promise.resolve();await Promise.resolve();});
  expect(verify).toHaveBeenCalledWith('exact imported bytes');
  expect(screen.getByText('Retain evidence package in profile')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:'replacement'}});
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await act(async()=>{await Promise.resolve();await Promise.resolve();});
  expect(screen.getByText('Retain evidence package in profile')).toBeTruthy();
  act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
});
it('checks file size before reading or verifying',async()=>{
  render(<SolarResearchEvidenceReplay />);const text=vi.fn();
  fireEvent.change(screen.getByLabelText('Portable evidence package file'),{target:{files:[{size:9_000_001,text}]}});
  await act(async()=>{await Promise.resolve();});
  expect(screen.getByText('Evidence package exceeds 9 MB')).toBeTruthy();
  expect(text).not.toHaveBeenCalled();expect(verify).not.toHaveBeenCalled();
});
