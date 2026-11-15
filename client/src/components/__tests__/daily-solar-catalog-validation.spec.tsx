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

vi.mock('../SolarPatrolArtifacts',()=>({SolarPatrolArtifacts:()=>null}));
vi.mock('../NeutrinoArtifacts',()=>({NeutrinoArtifacts:()=>null}));
vi.mock('../SolarComparisonResult',()=>({SolarComparisonResult:()=>null}));
import {DailySolarEvents} from '../DailySolarEvents';
const event={ivorn:'ivo://hek/test',event_type:'FL',start:'2026-10-20T12:00:00Z',end:'2026-10-20T12:01:00Z',references:[]};
const catalog={ok:true,mode:'rolling24h',windowStartUtc:'2026-10-20T00:00:00.000Z',windowEndUtc:'2026-10-21T00:00:00.000Z',complete:true,refreshFailed:false,events:[event],reel:null};
it.each([
  ['null event',{...catalog,events:[null]}],
  ['malformed references',{...catalog,events:[{...event,references:{}}]}],
  ['malformed reel',{...catalog,reel:{reelId:'a'.repeat(64)}}],
])('rejects a %s without crashing the workbench',async(_name,value)=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});vi.stubGlobal('fetch',vi.fn(async()=>Response.json(value)));
  render(<Boundary><DailySolarEvents/></Boundary>);
  await waitFor(()=>expect(screen.queryByText('Catalog renderer failed')??screen.queryByText(/Daily catalog refresh is unavailable/)).toBeTruthy());
  expect(screen.queryByText('Catalog renderer failed')).toBeNull();expect(screen.queryByText(event.ivorn)).toBeNull();
});
it.each(['wrong day','wrong mode'])('rejects %s returned for an explicitly selected archive day',async(kind)=>{
  const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('dateUtc=')
    ?{...catalog,mode:kind==='wrong mode'?'rolling24h':'utcDay',windowStartUtc:kind==='wrong day'?'2026-10-19T00:00:00.000Z':catalog.windowStartUtc,
      windowEndUtc:kind==='wrong day'?'2026-10-20T00:00:00.000Z':catalog.windowEndUtc,events:[{...event,ivorn:'ivo://hek/wrong-selection'}]}:catalog));
  vi.stubGlobal('fetch',fetcher);render(<DailySolarEvents/>);await screen.findByText(event.ivorn);
  fireEvent.change(screen.getByLabelText('UTC archive day'),{target:{value:'2026-10-20'}});
  await act(async()=>{});expect(screen.queryByText('ivo://hek/wrong-selection')).toBeNull();
  expect(screen.getByText(/Daily catalog refresh is unavailable/)).toBeTruthy();
});
it('does not embed a declared movie on a non-default provider port',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...catalog,events:[{...event,references:[{name:null,type:'movie',url:'https://sdowww.lmsal.com:8443/sdomedia/ssw/test.mp4'}]}]})));
  render(<DailySolarEvents/>);await screen.findByText(event.ivorn);expect(screen.queryByLabelText('Selected HEK linked event movie')).toBeNull();
});
it('discards a late old-day body after another day is selected',async()=>{
  const old=deferred<any>();vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('2026-10-19')?{ok:true,json:()=>old.promise}:
    Response.json(url.includes('dateUtc=')?{...catalog,mode:'utcDay',events:[{...event,ivorn:'ivo://hek/current-day'}]}:catalog)));
  render(<DailySolarEvents/>);await screen.findByText(event.ivorn);
  fireEvent.change(screen.getByLabelText('UTC archive day'),{target:{value:'2026-10-19'}});
  fireEvent.change(screen.getByLabelText('UTC archive day'),{target:{value:'2026-10-20'}});
  await screen.findByText('ivo://hek/current-day');
  await act(async()=>{old.resolve({...catalog,mode:'utcDay',events:[{...event,ivorn:'ivo://hek/old-day'}]});await old.promise;});
  expect(screen.queryByText('ivo://hek/old-day')).toBeNull();expect(screen.getByText('ivo://hek/current-day')).toBeTruthy();
});
