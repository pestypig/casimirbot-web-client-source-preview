// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SolarMagneticBundleStorage} from './SolarMagneticBundleStorage';

const bundleId=`solar-magnetic-bundle:${'a'.repeat(64)}`;
vi.mock('../../../shared/solar-magnetic-comparison-bundle',()=>({
  prepareSolarMagneticComparisonBundle:vi.fn(async(payload:unknown)=>({bundleId,...(payload as object)})),
  verifySolarMagneticComparisonBundle:vi.fn(async(value:unknown)=>value),
}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('saves explicitly, reopens by exact ID, and checks account/claim identity',async()=>{
  const onReopen=vi.fn();
  const fetchMock=vi.fn(async(input:string,init?:RequestInit)=>{
    if(input==='/api/account/session')return new Response(JSON.stringify({session:{profile:{profile_id:'researcher'}},
      account_policy:{account_type:'developer'}}),{status:200});
    if(input==='/api/account/solar-research/magnetic-bundles'&&init?.method==='POST')
      return new Response(JSON.stringify({ok:true,saved:true,profileId:'researcher',bundleId,
        scientificAdmission:false,scienceRunAllowed:false}),{status:201});
    return new Response(JSON.stringify({ok:true,profileId:'researcher',bundleId,
      bundleJson:JSON.stringify({bundleId}),scientificAdmission:false,scienceRunAllowed:false}),{status:200});
  });
  vi.stubGlobal('fetch',fetchMock);
  render(<SolarMagneticBundleStorage payload={{schemaVersion:'solar-magnetic-comparison-bundle/1'} as any} onReopen={onReopen}/>);
  fireEvent.click(screen.getByText('Save comparison to profile'));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Retained magnetic comparison'));
  expect((fetchMock.mock.calls.find((call:any)=>call[1]?.method==='POST')?.[1] as RequestInit).body).toContain('expected_profile_id');
  fireEvent.click(screen.getByText('Reopen retained comparison'));
  await waitFor(()=>expect(onReopen).toHaveBeenCalledWith({bundleId}));
  expect(fetchMock.mock.calls.some((call:any)=>String(call[0]).includes(`bundleId=solar-magnetic-bundle%3A${'a'.repeat(64)}`))).toBe(true);
});

it('requires a signed-in developer before profile storage is touched',async()=>{
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({session:null,account_policy:{account_type:'user'}}),{status:200}));
  vi.stubGlobal('fetch',fetchMock);
  render(<SolarMagneticBundleStorage payload={{schemaVersion:'solar-magnetic-comparison-bundle/1'} as any} onReopen={vi.fn()}/>);
  fireEvent.click(screen.getByText('Save comparison to profile'));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('signed-in developer'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
