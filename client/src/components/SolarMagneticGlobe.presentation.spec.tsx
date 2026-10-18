// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {solarGlobalRadialMapContentId,solarGlobalRadialMapSchema} from '../../../shared/solar-magnetic-dipole';
import {prepareSolarMagneticViewRecipe} from '../../../shared/solar-magnetic-view-recipe';
import {prepareSolarMagneticComparisonBundle} from '../../../shared/solar-magnetic-comparison-bundle';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';

vi.mock('@react-three/fiber',()=>({Canvas:()=>React.createElement('canvas',{'aria-label':'rendered globe'}),useThree:()=>({})}));
vi.mock('@react-three/drei',()=>({Line:()=>null,OrbitControls:()=>null}));
import {SolarMagneticGlobe} from './SolarMagneticGlobe';

beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as any);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('loads the owner-retained exact bundle through the UI route and acknowledges its rendered identities',async()=>{
  const map=solarGlobalRadialMapSchema.parse({schemaVersion:'solar-global-radial-map/1',
    source:{provider:'fixture',productId:'presentation',sourceUrl:'https://example.org/map',
      sha256:'a'.repeat(64),kind:'synoptic_derived',inputStartUtc:null,inputEndUtc:'2026-09-28T17:04:00Z',
      retrievedAtUtc:'2026-09-28T18:00:00Z'},coordinateFrame:'Carrington',
    grid:'longitude_by_sine_latitude_cell_centers',units:'G',longitudeCells:12,sineLatitudeCells:6,
    radialGauss:Array.from({length:72},(_,i)=>i<36?-10:10),observedMaskStatus:'unavailable',
    observedCellMask:Array(72).fill(false),sourceIdentityAuthenticated:false,scientificAdmission:false});
  const mapContentId=await solarGlobalRadialMapContentId(map);
  const view=await prepareSolarMagneticViewRecipe({schemaVersion:'solar-magnetic-view-recipe/1',
    mapContentId,pfssModelId:null,coordinateFrame:'Carrington_display_cartesian',projection:'perspective',
    cameraPosition:[0.45,0.9,3.4],cameraTarget:'solar_center',
    fieldColorScale:'asinh_p98_abs_radial_gauss/1',showIllustrativeAxialDipole:false,
    showMapEquivalentDipole:true,showPfssLines:false,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeJoinAllowed:false});
  const bundle=await prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
    map,pfss:null,losDiagnostic:null,view,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeValidationAllowed:false});
  const requestId='22222222-2222-4222-8222-222222222222';
  let revision=0;let ack:unknown;
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    const json=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
    if(url.endsWith('/magnetic-presentation/presence')){
      revision=JSON.parse(String(init?.body)).revision;return json({ok:true});
    }
    if(url.includes('/magnetic-presentation/pending?'))
      return json({ok:true,request:{requestId,expectedRevision:revision,bundleId:bundle.bundleId,
        expected:{bundleId:bundle.bundleId,mapContentId,pfssModelId:null,viewRecipeId:view.recipeId}}});
    if(url==='/api/account/session')
      return json({session:{profile:{profile_id:'profile-one'}},account_policy:{account_type:'developer'}});
    if(url.startsWith('/api/account/solar-research/magnetic-bundles?'))
      return json({ok:true,profileId:'profile-one',bundleId:bundle.bundleId,bundleJson:JSON.stringify(bundle),
        scientificAdmission:false,scienceRunAllowed:false});
    if(url.endsWith('/magnetic-presentation/ack')){
      ack=JSON.parse(String(init?.body));return json({ok:true,request:{state:'displayed'}});
    }
    if(url.endsWith('/magnetic-presentation/close'))return json({ok:true});
    throw new Error('unexpected fetch '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<SolarMagneticGlobe/>);
  await waitFor(()=>expect(screen.getByText(/Displayed owner-retained comparison/)).toBeTruthy(),{timeout:10000});
  expect(ack).toMatchObject({requestId,observed:{bundleId:bundle.bundleId,mapContentId,
    pfssModelId:null,viewRecipeId:view.recipeId}});
  vi.unstubAllGlobals();
});

it('does not load or acknowledge an MCP request when WebGL is unavailable',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.endsWith('/magnetic-presentation/presence'))
      return {ok:true,json:async()=>({ok:true})};
    if(url.includes('/magnetic-presentation/pending?'))
      return {ok:true,json:async()=>({request:{requestId:'22222222-2222-4222-8222-222222222222',
        expectedRevision:1,bundleId:'solar-magnetic-bundle:'+'a'.repeat(64)}})};
    if(url.endsWith('/magnetic-presentation/close'))
      return {ok:true,json:async()=>({ok:true})};
    if(url.endsWith('/magnetic-presentation/reject'))
      return {ok:true,json:async()=>({ok:true})};
    throw new Error('unexpected fetch '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<SolarMagneticGlobe/>);
  await waitFor(()=>expect(screen.getByText(/WebGL globe is not rendered/)).toBeTruthy());
  expect(fetcher.mock.calls.some(([url])=>String(url).includes('/magnetic-bundles?'))).toBe(false);
  expect(fetcher.mock.calls.some(([url])=>String(url).endsWith('/magnetic-presentation/ack'))).toBe(false);
  expect(fetcher.mock.calls.some(([url,options])=>String(url).endsWith('/magnetic-presentation/reject')&&
    JSON.parse(String(options?.body)).reason==='renderer_unavailable')).toBe(true);
  vi.unstubAllGlobals();
});

it('does not replace a human-changed globe while the retained bundle is loading',async()=>{
  const map=solarGlobalRadialMapSchema.parse({schemaVersion:'solar-global-radial-map/1',
    source:{provider:'fixture',productId:'concurrent-change',sourceUrl:'https://example.org/map',
      sha256:'a'.repeat(64),kind:'synoptic_derived',inputStartUtc:null,inputEndUtc:'2026-09-28T17:04:00Z',
      retrievedAtUtc:'2026-09-28T18:00:00Z'},coordinateFrame:'Carrington',
    grid:'longitude_by_sine_latitude_cell_centers',units:'G',longitudeCells:12,sineLatitudeCells:6,
    radialGauss:Array(72).fill(0),observedMaskStatus:'unavailable',
    observedCellMask:Array(72).fill(false),sourceIdentityAuthenticated:false,scientificAdmission:false});
  const mapContentId=await solarGlobalRadialMapContentId(map);
  const view=await prepareSolarMagneticViewRecipe({schemaVersion:'solar-magnetic-view-recipe/1',
    mapContentId,pfssModelId:null,coordinateFrame:'Carrington_display_cartesian',projection:'perspective',
    cameraPosition:[0.45,0.9,3.4],cameraTarget:'solar_center',
    fieldColorScale:'asinh_p98_abs_radial_gauss/1',showIllustrativeAxialDipole:false,
    showMapEquivalentDipole:false,showPfssLines:false,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeJoinAllowed:false});
  const bundle=await prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
    map,pfss:null,losDiagnostic:null,view,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeValidationAllowed:false});
  let resolveAccount!:(value:unknown)=>void,accountStarted=false,revision=0;
  const accountGate=new Promise(resolve=>{resolveAccount=resolve;});
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),json=(body:unknown)=>({ok:true,status:200,json:async()=>body});
    if(url.endsWith('/magnetic-presentation/presence')){
      revision=JSON.parse(String(init?.body)).revision;return json({ok:true});
    }
    if(url.includes('/magnetic-presentation/pending?'))
      return json({ok:true,request:{requestId:'22222222-2222-4222-8222-222222222222',
        expectedRevision:revision,bundleId:bundle.bundleId,
        expected:{bundleId:bundle.bundleId,mapContentId,pfssModelId:null,viewRecipeId:view.recipeId}}});
    if(url==='/api/account/session'){accountStarted=true;return accountGate as Promise<any>;}
    if(url.startsWith('/api/account/solar-research/magnetic-bundles?'))
      return json({ok:true,profileId:'profile-one',bundleId:bundle.bundleId,
        bundleJson:JSON.stringify(bundle),scientificAdmission:false,scienceRunAllowed:false});
    if(url.endsWith('/magnetic-presentation/reject')||url.endsWith('/magnetic-presentation/close'))
      return json({ok:true});
    throw new Error('unexpected fetch '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<SolarMagneticGlobe/>);
  await waitFor(()=>expect(accountStarted).toBe(true));
  fireEvent.click(screen.getByLabelText(/Illustrative axial dipole lines/));
  resolveAccount({ok:true,json:async()=>({session:{profile:{profile_id:'profile-one'}},
    account_policy:{account_type:'developer'}})});
  await waitFor(()=>expect(screen.getByText(/Globe changed while retained bundle was loading/)).toBeTruthy());
  expect(screen.queryByText(/Map: fixture/)).toBeNull();
  expect(fetcher.mock.calls.some(([url])=>String(url).endsWith('/magnetic-presentation/ack'))).toBe(false);
  expect(fetcher.mock.calls.some(([url,options])=>String(url).endsWith('/magnetic-presentation/reject')&&
    JSON.parse(String(options?.body)).reason==='renderer_view_changed')).toBe(true);
  vi.unstubAllGlobals();
});

it('stops before owner bundle fetch if the account changes during session inspection',async()=>{
  let resolveAccount!:(value:unknown)=>void,accountStarted=false,revision=0;
  const accountGate=new Promise(resolve=>{resolveAccount=resolve;});
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),json=(body:unknown)=>({ok:true,status:200,json:async()=>body});
    if(url.endsWith('/magnetic-presentation/presence')){
      revision=JSON.parse(String(init?.body)).revision;return json({ok:true});
    }
    if(url.includes('/magnetic-presentation/pending?'))
      return json({ok:true,request:{requestId:'22222222-2222-4222-8222-222222222222',
        expectedRevision:revision,bundleId:'solar-magnetic-bundle:'+'a'.repeat(64)}});
    if(url==='/api/account/session'){accountStarted=true;return accountGate as Promise<any>;}
    if(url.endsWith('/magnetic-presentation/close'))return json({ok:true});
    throw new Error('unexpected post-switch fetch '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<SolarMagneticGlobe/>);
  await waitFor(()=>expect(accountStarted).toBe(true));
  await act(async()=>{
    window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    resolveAccount(jsonSession());
    await accountGate;
    await Promise.resolve();
  });
  expect(screen.getByText(/Account changed; magnetic inputs cleared/)).toBeTruthy();
  expect(fetcher.mock.calls.some(([url])=>String(url).includes('/magnetic-bundles?'))).toBe(false);
  expect(fetcher.mock.calls.some(([url])=>String(url).endsWith('/magnetic-presentation/ack'))).toBe(false);
  vi.unstubAllGlobals();
});

function jsonSession(){
  return {ok:true,status:200,json:async()=>({session:{profile:{profile_id:'profile-one'}},
    account_policy:{account_type:'developer'}})};
}
