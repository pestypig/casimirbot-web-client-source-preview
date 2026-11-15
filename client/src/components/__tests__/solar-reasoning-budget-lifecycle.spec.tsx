// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SolarReasoningBudget} from '../SolarReasoningBudget';
import {cacheAccountCapabilityPolicy} from '../../lib/workstation/accountCapabilityPolicy';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../../shared/helix-account-session';
const endpoint='/api/discord/solar/feed/reasoning';
const status={enabled:true,provider_available:true,budgets:[],results:[]};
const credential='solaredit_'+'A'.repeat(43); // Constructed inert fixture, never a service credential.
const initialDesktop=window.casimirDesktop;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function network(handler:(url:string,options:RequestInit)=>any=async()=>Response.json(status)){
  const fetcher=vi.fn((url:string,options:RequestInit={})=>handler(url,options));vi.stubGlobal('fetch',fetcher);return fetcher;
}
beforeEach(()=>cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-a'));
afterEach(()=>{cleanup();cacheAccountCapabilityPolicy(null,null);window.casimirDesktop=initialDesktop;vi.restoreAllMocks();vi.unstubAllGlobals();});
async function form(){return (await screen.findByRole('button',{name:'Authorize platform budget'})).closest('form')!;}
function fill(){
  fireEvent.change(screen.getByLabelText('Maximum platform cost (USD)'),{target:{value:'0.25'}});
  fireEvent.change(screen.getByLabelText('Maximum explanations'),{target:{value:'5'}});
  fireEvent.click(screen.getByRole('checkbox'));
}
const authorize=()=>screen.getByRole('button',{name:'Authorize platform budget'}) as HTMLButtonElement;
const posts=(fetcher:any)=>fetcher.mock.calls.filter(([,options]:any[])=>options.method==='POST');
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p>Budget renderer failed</p>:this.props.children;}
}
it('does not crash or expose spend controls for a malformed successful status response',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});network(async()=>Response.json({enabled:true}));
  render(<Boundary><SolarReasoningBudget/></Boundary>);
  await waitFor(()=>expect(screen.queryByText('Budget renderer failed')??screen.queryByText('Could not load the platform analysis budget.')).toBeTruthy());
  expect(screen.queryByText('Budget renderer failed')).toBeNull();expect(screen.queryByRole('button',{name:'Authorize platform budget'})).toBeNull();
});
it('clears shown and entered credentials, consent and limits when the account changes',async()=>{
  window.casimirDesktop={solarEditorial:vi.fn()} as any;
  let current='owner-a';network(async(_url,options)=>options.method==='POST'?Response.json({ok:true,id:'budget',worker_token:credential}):
    current==='owner-a'?Response.json(status):Response.json({error:'solar_operator_required'},{status:403}));
  render(<SolarReasoningBudget/>);await form();fill();fireEvent.click(authorize());
  await screen.findByLabelText('Show-once solar worker credential');
  fireEvent.change(screen.getByLabelText('Developer pilot credential'),{target:{value:credential}});
  act(()=>{current='owner-b';cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-b');});
  expect(screen.queryByLabelText('Show-once solar worker credential')).toBeNull();
  expect((screen.getByLabelText('Developer pilot credential') as HTMLInputElement).value).toBe('');
  await screen.findByText('Budget controls are available to the configured platform owner.');
  expect(screen.queryByRole('button',{name:'Authorize platform budget'})).toBeNull();
});
it('does not install a late status body after an A to B to A account round trip',async()=>{
  const body=deferred<any>();let count=0;let firstSignal:AbortSignal|undefined;
  network(async(_url,options)=>{if(++count===1){firstSignal=options.signal as AbortSignal;return {ok:true,status:200,json:()=>body.promise};}return Response.json({error:'solar_operator_required'},{status:403});});
  render(<SolarReasoningBudget/>);
  await act(async()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-b');cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-a');body.resolve(status);await body.promise;});
  expect(screen.queryByRole('button',{name:'Authorize platform budget'})).toBeNull();expect(firstSignal?.aborted).toBe(true);
});
it('discards a late authorization credential without refreshing for the previous account',async()=>{
  const body=deferred<any>();let current='owner-a';let signal:AbortSignal|undefined;
  const fetcher=network(async(_url,options)=>{
    if(options.method==='POST'){signal=options.signal as AbortSignal;return {ok:true,status:200,json:()=>body.promise};}
    return current==='owner-a'?Response.json(status):Response.json({error:'solar_operator_required'},{status:403});
  });render(<SolarReasoningBudget/>);const element=await form();fill();fireEvent.submit(element);
  act(()=>{current='owner-b';cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-b');});
  const calls=fetcher.mock.calls.length;
  await act(async()=>{body.resolve({ok:true,id:'budget',worker_token:credential});await body.promise;});
  expect(screen.queryByLabelText('Show-once solar worker credential')).toBeNull();expect(fetcher.mock.calls.length).toBe(calls);expect(signal?.aborted).toBe(true);
});
it('aborts an outstanding status request when the panel closes',()=>{
  let signal:AbortSignal|undefined;network(async(_url,options)=>{signal=options.signal as AbortSignal;return new Promise(()=>{});});
  const view=render(<SolarReasoningBudget/>);view.unmount();expect(signal?.aborted).toBe(true);
});
it.each(['disabled','domain-key-missing'])('rejects direct form submission when %s',async(mode)=>{
  const fetcher=network(async()=>Response.json({...status,enabled:mode!=='disabled',provider_available:false}));
  render(<SolarReasoningBudget/>);const element=await form();fill();
  if(mode==='domain-key-missing')fireEvent.change(screen.getByLabelText('Where to run the platform explanation'),{target:{value:'domain'}});
  expect(authorize().disabled).toBe(true);fireEvent.submit(element);expect(posts(fetcher)).toHaveLength(0);
});
it('does not create duplicate authorizations while one request is pending',async()=>{
  const fetcher=network(async(_url,options)=>options.method==='POST'?new Promise(()=>{}):Response.json(status));
  render(<SolarReasoningBudget/>);const element=await form();fill();fireEvent.submit(element);fireEvent.submit(element);expect(posts(fetcher)).toHaveLength(1);
});
it('does not overwrite a failed status refresh with a successful authorization status',async()=>{
  let authorized=false;network(async(_url,options)=>{
    if(options.method==='POST'){authorized=true;return Response.json({ok:true,id:'budget',worker_token:null});}
    return authorized?Response.json({error:'solar_operator_required'},{status:403}):Response.json(status);
  });render(<SolarReasoningBudget/>);const element=await form();fill();fireEvent.submit(element);
  await waitFor(()=>expect(screen.queryByText(/Platform budget authorized|Budget controls are available/)).toBeTruthy());
  expect(screen.queryByRole('button',{name:'Authorize platform budget'})).toBeNull();
  expect(screen.queryByText(/Platform budget authorized/)).toBeNull();
});
it('clears an entered native credential before the owner review settles and discards its late account result',async()=>{
  const result=deferred<any>();const native=vi.fn(()=>result.promise);window.casimirDesktop={solarEditorial:native} as any;
  network();render(<SolarReasoningBudget/>);await form();
  fireEvent.change(screen.getByLabelText('Developer pilot credential'),{target:{value:credential}});
  fireEvent.click(screen.getByRole('button',{name:'Review and start developer pilot'}));
  expect((screen.getByLabelText('Developer pilot credential') as HTMLInputElement).value).toBe('');
  await act(async()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,'owner-b');result.resolve({ok:true,state:'fixture-old-worker'});await result.promise;});
  expect(screen.queryByText(/fixture-old-worker/)).toBeNull();expect(native).toHaveBeenCalledTimes(1);
});
it('keeps a same-account policy refresh from discarding explicit form choices',async()=>{
  network();render(<SolarReasoningBudget/>);await form();fill();
  act(()=>cacheAccountCapabilityPolicy({...HELIX_USER_ACCOUNT_POLICY,feature_flags:[...HELIX_USER_ACCOUNT_POLICY.feature_flags,'solar_cache_management']},'owner-a'));
  expect((screen.getByLabelText('Maximum platform cost (USD)') as HTMLInputElement).value).toBe('0.25');expect(authorize().disabled).toBe(false);
});

it('renders bounded budget/results/delivery rows and stops only the selected budget',async()=>{
  let stopped=false;const fetcher=network(async(url,options)=>{
    if(options.method==='DELETE'){stopped=true;return Response.json({ok:true,revoked:true});}
    return Response.json({...status,payer:'platform',subscriber_allowance_charged:false,
      budgets:[{id:'fixture/budget',executor:'domain',maximum_micros:'1000000',committed_micros:'250000',maximum_calls:5,
        calls:1,active:!stopped,paused_reason:null,expires_at:'2099-01-01T00:00:00Z'}],
      results:[{id:'result',seq:'10',status:'completed',reported_micros:null,input_tokens:'24',output_tokens:'12',reserved_micros:'100'}],
      deliveries:[{result_id:'result',subscription_id:'subscription',status:'sent',message_id:'message'}]});
  });render(<SolarReasoningBudget/>);await form();
  expect(screen.getByText(/Committed\/reserved \$0.250000 of \$1.000000/)).toBeTruthy();
  expect(screen.getByText(/observed cost unknown/)).toBeTruthy();expect(screen.getByText(/Analysis delivery: sent/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Stop this budget'}));await screen.findByText('Platform analysis stopped.');
  const writes=fetcher.mock.calls.filter(([,options])=>options?.method==='DELETE');
  expect(writes).toHaveLength(1);expect(writes[0][0]).toBe(endpoint+'/budget/fixture%2Fbudget');expect(posts(fetcher)).toHaveLength(0);
});
it.each([
  ['Maximum platform cost (USD)','100.000001'],['Maximum explanations','1.5'],
  ['Expires after (hours, up to 168)','169'],['Expires after (hours, up to 168)','0.5'],
])('rejects an invalid %s value of %s before any request',async(label,value)=>{
  const fetcher=network();render(<SolarReasoningBudget/>);const element=await form();fill();
  fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.submit(element);
  expect(authorize().disabled).toBe(true);expect(posts(fetcher)).toHaveLength(0);
});
it('reports native bridge failure and restores controls without retaining the entered credential',async()=>{
  const native=vi.fn(async()=>{throw Error('fixture native bridge disconnected');});window.casimirDesktop={solarEditorial:native} as any;
  network();render(<SolarReasoningBudget/>);await form();
  fireEvent.change(screen.getByLabelText('Developer pilot credential'),{target:{value:credential}});
  fireEvent.click(screen.getByRole('button',{name:'Review and start developer pilot'}));
  await screen.findByText('Developer pilot request was not confirmed.');
  expect((screen.getByLabelText('Developer pilot credential') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('button',{name:'Stop developer pilot'}) as HTMLButtonElement).disabled).toBe(false);
  expect(native).toHaveBeenCalledTimes(1);
});
it('clears the shown credential when a successful authorization is followed by a non-JSON denial',async()=>{
  let created=false;network(async(_url,options)=>{
    if(options.method==='POST'){created=true;return Response.json({ok:true,id:'budget',worker_token:credential});}
    return created?new Response('Sign in',{status:401}):Response.json(status);
  });render(<SolarReasoningBudget/>);const element=await form();fill();fireEvent.submit(element);
  await screen.findByText('Budget controls are available to the configured platform owner.');
  expect(screen.queryByLabelText('Show-once solar worker credential')).toBeNull();
});
