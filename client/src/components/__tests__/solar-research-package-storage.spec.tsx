// @vitest-environment jsdom
import React from 'react';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SolarResearchPackageStorage} from '../SolarResearchPackageStorage';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
import {syntheticSolarPortablePackage} from '../../../../tests/fixtures/solar-portable-package';
const packageJson=await syntheticSolarPortablePackage(true);
const realPackagePath=process.env.SOLAR_PACKAGE_REPLAY_FIXTURE||'.tmp/solar-evidence-package-g7mHIT/portable-evidence.json';
const id='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
const indexId=JSON.parse(packageJson).index.indexId;
const account={session:{profile:{profile_id:'test-profile'}},account_policy:{account_type:'developer'}};
const reply=(body:unknown,ok=true)=>({ok,json:async()=>body});
const result={ok:true,saved:true,profileId:'test-profile',packageId:id,indexId,scientificAdmission:false,scienceRunAllowed:false,packageJson};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function setup(fetcher:any) {vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',fetcher);}
it('never fetches automatically and saves only a verified exact package on click',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(result));setup(fetcher);
  render(<SolarResearchPackageStorage packageJson={packageJson}/>);expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Retain evidence package in profile'));
  await waitFor(()=>expect(screen.getByText(/Retained package:/)).toBeTruthy());
  expect(fetcher.mock.calls[1][0]).toBe('/api/account/solar-research/packages');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expected_profile_id:'test-profile',packageJson});
  expect((screen.getByLabelText('Retained evidence package ID') as HTMLInputElement).value).toBe(id);
});
it('reopens only owner/identity/recipe-verified archive bytes',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(result));setup(fetcher);
  const onReopen=vi.fn();render(<SolarResearchPackageStorage onReopen={onReopen}/>);
  fireEvent.change(screen.getByLabelText('Retained evidence package ID'),{target:{value:id}});
  fireEvent.click(screen.getByText('Reopen retained evidence package'));
  await waitFor(()=>expect(onReopen).toHaveBeenCalledWith(packageJson));
  expect(fetcher.mock.calls[1][0]).toContain('expected_profile_id=test-profile');
});
it('does not reopen an identity-substituted response',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply({...result,packageId:'solar-package:'+'0'.repeat(64)}));setup(fetcher);
  const onReopen=vi.fn();render(<SolarResearchPackageStorage onReopen={onReopen}/>);
  fireEvent.change(screen.getByLabelText('Retained evidence package ID'),{target:{value:id}});
  fireEvent.click(screen.getByText('Reopen retained evidence package'));
  await waitFor(()=>expect(screen.getByText(/response identity/)).toBeTruthy());expect(onReopen).not.toHaveBeenCalled();
});
it('rejects user policy before archive requests',async()=>{
  const fetcher=vi.fn().mockResolvedValue(reply({...account,account_policy:{account_type:'user'}}));setup(fetcher);
  render(<SolarResearchPackageStorage packageJson={packageJson}/>);
  fireEvent.click(screen.getByText('Retain evidence package in profile'));
  await waitFor(()=>expect(screen.getByText('A signed-in developer account is required')).toBeTruthy());
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('cannot publish a late archive response after account change',async()=>{
  let resolve!:(value:any)=>void;const pending=new Promise(done=>{resolve=done;});
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockReturnValueOnce(pending);setup(fetcher);
  const onReopen=vi.fn();render(<SolarResearchPackageStorage onReopen={onReopen}/>);
  fireEvent.change(screen.getByLabelText('Retained evidence package ID'),{target:{value:id}});
  fireEvent.click(screen.getByText('Reopen retained evidence package'));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await act(async()=>resolve(reply(result)));
  expect(onReopen).not.toHaveBeenCalled();expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});
it('cannot claim a late save receipt after input replacement',async()=>{
  let resolve!:(value:any)=>void;const pending=new Promise(done=>{resolve=done;});
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockReturnValueOnce(pending);setup(fetcher);
  const {rerender}=render(<SolarResearchPackageStorage packageJson={packageJson}/>);
  fireEvent.click(screen.getByText('Retain evidence package in profile'));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  rerender(<SolarResearchPackageStorage packageJson={packageJson+' '}/>);
  await act(async()=>resolve(reply(result)));
  expect(screen.queryByText(/Retained package:/)).toBeNull();
});
const catalog={ok:true,profileId:'test-profile',schemaVersion:'solar-package-catalog/1',offset:0,totalPackages:1,nextOffset:null,
  order:'package_id_lexicographic',scientificAdmission:false,scienceRunAllowed:false,
  packages:[{packageId:id,indexId,totalBytes:Buffer.byteLength(packageJson),comparisonRecordId:JSON.parse(packageJson).comparison.recordId,
    comparisonRows:37,archiveId:JSON.parse(packageJson).observationArchive.archive_identity.snapshotId,
    literatureId:JSON.parse(packageJson).literature?.associationId??null,benchmarkId:null,
    artifactIntegrityVerified:true,sourceIdentityAuthenticated:false,scientificAdmission:false,scienceRunAllowed:false}]};
it('lists only on explicit request and selects an exact package without silently reopening it',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(catalog));setup(fetcher);
  const onReopen=vi.fn();render(<SolarResearchPackageStorage onReopen={onReopen}/>);expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('List retained evidence packages'));
  await waitFor(()=>expect(screen.getByText('Select '+id)).toBeTruthy());
  expect(fetcher.mock.calls[1][0]).toContain('limit=10');fireEvent.click(screen.getByText('Select '+id));
  expect((screen.getByLabelText('Retained evidence package ID') as HTMLInputElement).value).toBe(id);
  expect(onReopen).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects a catalog claiming scientific admission',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply({...catalog,scientificAdmission:true}));setup(fetcher);
  render(<SolarResearchPackageStorage/>);fireEvent.click(screen.getByText('List retained evidence packages'));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(screen.queryByText('Checking signed-in developer account…')).toBeNull());
  expect(screen.queryByText('Select '+id)).toBeNull();
});
it('does not show a late catalog after account change',async()=>{
  let resolve!:(value:any)=>void;const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockReturnValueOnce(new Promise(done=>{resolve=done;}));setup(fetcher);
  render(<SolarResearchPackageStorage/>);fireEvent.click(screen.getByText('List retained evidence packages'));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));await act(async()=>resolve(reply(catalog)));
  expect(screen.queryByText('Select '+id)).toBeNull();expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});
it.skipIf(!existsSync(realPackagePath))('reopens an optional retained real package with exact bytes',async()=>{
  const realPackageJson=readFileSync(realPackagePath,'utf8');
  const realId='solar-package:'+createHash('sha256').update(realPackageJson).digest('hex');
  const realResult={...result,packageId:realId,indexId:JSON.parse(realPackageJson).index.indexId,packageJson:realPackageJson};
  const fetcher=vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(realResult));setup(fetcher);
  const onReopen=vi.fn();render(<SolarResearchPackageStorage onReopen={onReopen}/>);
  fireEvent.change(screen.getByLabelText('Retained evidence package ID'),{target:{value:realId}});
  fireEvent.click(screen.getByText('Reopen retained evidence package'));
  await waitFor(()=>expect(onReopen).toHaveBeenCalledWith(realPackageJson));
});
