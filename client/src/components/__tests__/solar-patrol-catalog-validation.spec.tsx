// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p>Catalog renderer failed</p>:this.props.children;}
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}

import {SolarPatrolArtifacts} from '../SolarPatrolArtifacts';
const report={source:'NASA_DONKI',id:'donki:2026-10-20T12:00:00-CME-001',nativeId:'2026-10-20T12:00:00-CME-001',version:1,revisionSha256:'a'.repeat(64),
  occurredAt:'2026-10-20T12:00:00Z',submittedAt:null,firstSeenAt:'2026-10-20T12:01:00Z',fetchedAt:'2026-10-20T12:01:00Z',
  citation:'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/1/-1',note:'Synthetic patrol report.',sourceLocation:null,activeRegion:null,instruments:[],linkedEvents:[],analysis:null};
const catalog={ok:true,schema:'casimir.public_solar_patrol.v1',window:{start:'2026-10-20T00:00:00.000Z',end:'2026-10-21T00:00:00.000Z'},
  reports:[report],reels:[],coverage:{status:'retained_only',fetchedAt:null}};
it.each([
  ['missing coverage',{...catalog,coverage:null}],['null report',{...catalog,reports:[null]}],
  ['malformed reel',{...catalog,reels:[{reelId:'b'.repeat(64),outputSha256:'c'.repeat(64),patrol:{}}]}],
])('rejects %s without crashing',async(_name,value)=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});vi.stubGlobal('fetch',vi.fn(async()=>Response.json(value)));
  render(<Boundary><SolarPatrolArtifacts dayUtc="2026-10-20"/></Boundary>);
  await waitFor(()=>expect(screen.queryByText('Catalog renderer failed')??screen.queryByText(/Patrol read unavailable/)).toBeTruthy());
  expect(screen.queryByText('Catalog renderer failed')).toBeNull();expect(screen.queryByText(/Synthetic patrol report/)).toBeNull();
});
it('does not display a catalog returned for the wrong requested window',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...catalog,window:{start:'2026-10-19T00:00:00.000Z',end:'2026-10-20T00:00:00.000Z'}})));
  render(<SolarPatrolArtifacts dayUtc="2026-10-20"/>);await act(async()=>{});
  expect(screen.queryByText(/Synthetic patrol report/)).toBeNull();expect(screen.getByText(/Patrol read unavailable/)).toBeTruthy();
});
it('does not expose a script citation as a source link',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...catalog,reports:[{...report,citation:'javascript:alert(1)'}]})));
  render(<SolarPatrolArtifacts dayUtc="2026-10-20"/>);await act(async()=>{});
  expect(screen.queryByRole('link',{name:'NASA source report'})).toBeNull();
});
it('discards a late domain response after selecting the local artifact catalog',async()=>{
  const old=deferred<any>();vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/domain?')?{ok:true,json:()=>old.promise}:
    Response.json({...catalog,reports:[{...report,note:'Current local report.'}]})));
  render(<SolarPatrolArtifacts dayUtc="2026-10-20"/>);
  fireEvent.change(screen.getByLabelText('Patrol artifact catalog'),{target:{value:'installation'}});await screen.findByText(/Current local report/);
  await act(async()=>{old.resolve(catalog);await old.promise;});expect(screen.queryByText(/Synthetic patrol report/)).toBeNull();
});
