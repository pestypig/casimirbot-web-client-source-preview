// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {NeutrinoArtifacts} from '../NeutrinoArtifacts';
const report={schema:'casimir.icecube_report.v1',source:'ICECUBE_GCN',nativeId:'123_456',eventName:'IceCube-261020A',
  revision:0,revisionSha256:'a'.repeat(64),sourceBytesSha256:'b'.repeat(64),transport:'gcn_json',sourceSchema:null,
  state:'initial',tense:'test',stream:'Gold',detectedAt:'2026-10-20T12:00:00Z',publishedAt:'2026-10-20T12:01:00Z',
  firstSeenAt:'2026-10-20T12:02:00Z',fetchedAt:'2026-10-20T12:02:00Z',raDeg:1,decDeg:2,coordinateFrame:'equatorial_J2000',
  errorRadiusDeg:null,containmentProbability:null,systematicIncluded:null,energyTeV:null,pAstro:null,falseAlarmRate:null,
  mapUrl:null,citation:'https://gcn.nasa.gov/circulars/123'};
const window={start:'2026-10-20T00:00:00.000Z',end:'2026-10-21T00:00:00.000Z'};
const catalog={ok:true,schema:'casimir.public_neutrinos.v1',window,reports:[report],artifacts:[]};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('shows an exact-window retained report without claiming solar origin or a retained map',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(catalog)));render(<NeutrinoArtifacts dayUtc="2026-10-20"/>);
  await screen.findByText(/IceCube-261020A/);expect(screen.getByRole('link',{name:'GCN source notice'}).getAttribute('href')).toBe(report.citation);
  expect(screen.getByText(/p_astro is not a probability of solar origin/)).toBeTruthy();expect(screen.getByText('Context artifact not retained for this revision.')).toBeTruthy();
});
it('does not render a script citation as a GCN source link',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...catalog,reports:[{...report,citation:'javascript:alert(1)'}]})));
  render(<NeutrinoArtifacts dayUtc="2026-10-20"/>);await act(async()=>{});expect(screen.queryByRole('link',{name:'GCN source notice'})).toBeNull();
});
it('rejects a returned window that differs from the requested day',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(catalog)));render(<NeutrinoArtifacts dayUtc="2026-10-19"/>);
  await screen.findByText('The retained alert catalog is unavailable.');expect(screen.queryByText(/IceCube-261020A/)).toBeNull();
});
