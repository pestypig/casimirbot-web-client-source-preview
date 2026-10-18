// @vitest-environment jsdom
import React from 'react';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SolarMagneticGlobe} from './SolarMagneticGlobe';
import {solarGlobalRadialMapContentId} from '../../../shared/solar-magnetic-dipole';
import {prepareSolarMagneticViewRecipe} from '../../../shared/solar-magnetic-view-recipe';
import {prepareSolarMagneticLosDiagnostic} from '../../../shared/solar-magnetic-los-diagnostic';
import {prepareSolarMagneticComparisonBundle} from '../../../shared/solar-magnetic-comparison-bundle';

const localBundlePath=resolve(process.cwd(),'.codex-build/solar-magnetic-source-20260928/gong-hmi-comparison-bundle-v1.json');

beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

function jsonFile(value:unknown){
  const file=new File([JSON.stringify(value)],'solar.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>JSON.stringify(value)});
  return file;
}

it('defaults to a clearly illustrative globe with no claimed current map',()=>{
  render(<SolarMagneticGlobe/>);
  expect(screen.getByText(/Illustrative axial dipole lines/)).toBeTruthy();
  expect(screen.getByText(/No global radial-field map or PFSS solution loaded/)).toBeTruthy();
  expect(screen.getByText(/WebGL is unavailable/)).toBeTruthy();
});

it('shows only catalog-located active regions and routes their selection without treating them as magnetic data',()=>{
  const onSelect=vi.fn();
  render(<SolarMagneticGlobe catalogEvents={[
    {ivorn:'ivo://hek/ar-1',event_type:'AR',hgc_x:-35,hgc_y:-12,start:'2026-09-28T16:00:00Z',noaa_ar:14534},
    {ivorn:'ivo://hek/ar-no-location',event_type:'AR',start:'2026-09-28T16:00:00Z'},
  ]} onCatalogEventSelect={onSelect}/>);
  expect(screen.getByLabelText('HEK active-region locations (1)')).toBeTruthy();
  expect(screen.getByText(/not measured magnetic vectors or inputs assimilated/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/NOAA 14534/}));
  expect(onSelect).toHaveBeenCalledWith('ivo://hek/ar-1');
});

it('shows local-map coverage and equivalent dipole without authenticating it',async()=>{
  render(<SolarMagneticGlobe/>);
  const longitudeCells=12,sineLatitudeCells=6;
  const map={schemaVersion:'solar-global-radial-map/1',source:{provider:'fixture',productId:'map-1',
    sourceUrl:'https://example.org/map',sha256:'a'.repeat(64),kind:'assimilated',
    inputStartUtc:'2026-09-27T00:00:00Z',inputEndUtc:'2026-09-28T00:00:00Z',retrievedAtUtc:'2026-09-28T01:00:00Z'},
    coordinateFrame:'Carrington',grid:'longitude_by_sine_latitude_cell_centers',units:'G',longitudeCells,sineLatitudeCells,
    radialGauss:Array.from({length:72},(_,index)=>20*(-1+(Math.floor(index/12)+0.5)/3)),
    observedMaskStatus:'provided',
    observedCellMask:Array.from({length:72},(_,index)=>index%2===0),
    sourceIdentityAuthenticated:false,scientificAdmission:false};
  fireEvent.change(screen.getByLabelText('Import global radial-field map'),{target:{files:[jsonFile(map)]}});
  await waitFor(()=>expect(screen.getByText(/Verified direct-input cell coverage: 50.0%/)).toBeTruthy());
  expect(screen.getByText(/Equivalent l=1 dipole from this map/)).toBeTruthy();
  expect(screen.getByText(/source identity is not authenticated/)).toBeTruthy();
});

it('does not turn an unavailable provider coverage mask into a zero-percent observation claim',async()=>{
  render(<SolarMagneticGlobe/>);
  const map={schemaVersion:'solar-global-radial-map/1',source:{provider:'fixture',productId:'map-unknown-mask',
    sourceUrl:'https://example.org/map',sha256:'b'.repeat(64),kind:'synoptic_derived',
    inputStartUtc:null,inputEndUtc:'2026-09-28T00:00:00Z',retrievedAtUtc:'2026-09-28T01:00:00Z'},
    coordinateFrame:'Carrington',grid:'longitude_by_sine_latitude_cell_centers',units:'G',
    longitudeCells:12,sineLatitudeCells:6,radialGauss:Array(72).fill(1),
    observedMaskStatus:'unavailable',observedCellMask:Array(72).fill(false),
    sourceIdentityAuthenticated:false,scientificAdmission:false};
  fireEvent.change(screen.getByLabelText('Import global radial-field map'),{target:{files:[jsonFile(map)]}});
  await waitFor(()=>expect(screen.getByText(/Direct-observation coverage unknown/)).toBeTruthy());
  expect(screen.queryByText(/coverage: 0.0%/)).toBeNull();
});

it('replays only a view recipe bound to the exact loaded map',async()=>{
  render(<SolarMagneticGlobe/>);
  const map={schemaVersion:'solar-global-radial-map/1',source:{provider:'fixture',productId:'map-recipe',
    sourceUrl:'https://example.org/map',sha256:'c'.repeat(64),kind:'synoptic_derived',
    inputStartUtc:null,inputEndUtc:'2026-09-28T00:00:00Z',retrievedAtUtc:'2026-09-28T01:00:00Z'},
    coordinateFrame:'Carrington',grid:'longitude_by_sine_latitude_cell_centers',units:'G',
    longitudeCells:12,sineLatitudeCells:6,radialGauss:Array.from({length:72},(_,index)=>index<36?-1:1),
    observedMaskStatus:'unavailable',observedCellMask:Array(72).fill(false),
    sourceIdentityAuthenticated:false,scientificAdmission:false};
  fireEvent.change(screen.getByLabelText('Import global radial-field map'),{target:{files:[jsonFile(map)]}});
  const mapId=await solarGlobalRadialMapContentId(map);
  await waitFor(()=>expect(screen.getByText(new RegExp(mapId))).toBeTruthy());
  const recipe=await prepareSolarMagneticViewRecipe({schemaVersion:'solar-magnetic-view-recipe/1',
    mapContentId:mapId,pfssModelId:null,coordinateFrame:'Carrington_display_cartesian',
    projection:'perspective',cameraPosition:[2.4,0.5,2.1],cameraTarget:'solar_center',
    fieldColorScale:'asinh_p98_abs_radial_gauss/1',showIllustrativeAxialDipole:true,
    showMapEquivalentDipole:false,showPfssLines:false,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeJoinAllowed:false});
  fireEvent.change(screen.getByLabelText('Import magnetic view recipe'),{target:{files:[jsonFile(recipe)]}});
  await waitFor(()=>expect(screen.getByText(new RegExp(`Replayed display settings ${recipe.recipeId}`))).toBeTruthy());
  expect((screen.getByLabelText('Illustrative axial dipole lines (not current data)') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Map-derived l=1 dipole approximation (not observed lines or PFSS)') as HTMLInputElement).checked).toBe(false);
  const {recipeId:_,...recipeBody}=recipe;
  const mismatched=await prepareSolarMagneticViewRecipe({...recipeBody,mapContentId:`solar-radial:${'d'.repeat(64)}`});
  fireEvent.change(screen.getByLabelText('Import magnetic view recipe'),{target:{files:[jsonFile(mismatched)]}});
  await waitFor(()=>expect(screen.getByText(/View recipe rejected: View recipe requires the exact loaded map/)).toBeTruthy());
});

it('keeps measured HMI LOS points distinct from PFSS lines and binds their diagnostic to the map',async()=>{
  render(<SolarMagneticGlobe/>);
  const map={schemaVersion:'solar-global-radial-map/1',source:{provider:'fixture',productId:'map-los',
    sourceUrl:'https://example.org/map',sha256:'e'.repeat(64),kind:'synoptic_derived',
    inputStartUtc:null,inputEndUtc:'2026-09-28T17:04:00Z',retrievedAtUtc:'2026-09-28T18:00:00Z'},
    coordinateFrame:'Carrington',grid:'longitude_by_sine_latitude_cell_centers',units:'G',
    longitudeCells:12,sineLatitudeCells:6,radialGauss:Array(72).fill(20),
    observedMaskStatus:'unavailable',observedCellMask:Array(72).fill(false),
    sourceIdentityAuthenticated:false,scientificAdmission:false};
  fireEvent.change(screen.getByLabelText('Import global radial-field map'),{target:{files:[jsonFile(map)]}});
  const mapId=await solarGlobalRadialMapContentId(map);
  await waitFor(()=>expect(screen.getByText(new RegExp(mapId))).toBeTruthy());
  const all={sampleCount:100,meanResidualGauss:1,medianAbsoluteResidualGauss:4,rootMeanSquareResidualGauss:8};
  const active={sampleCount:20,meanResidualGauss:2,medianAbsoluteResidualGauss:9,rootMeanSquareResidualGauss:15};
  const diagnostic=await prepareSolarMagneticLosDiagnostic({schemaVersion:'solar-magnetic-los-diagnostic/1',
    sourceMapContentId:mapId,mapSourceProductId:'map-los',mapSourceSha256:map.source.sha256,
    mapLatestContributorUtc:'2026-09-28T17:04:00Z',mapEarliestContributorUtc:null,
    hmi:{sourceUrl:'https://example.org/hmi.fits',sha256:'f'.repeat(64),drmsId:'hmi.test:1:magnetogram',
      observedAtUtc:'2026-09-28T16:18:31Z',qualityFlag:1024,instrument:'HMI_FRONT2',
      fieldComponent:'line_of_sight',units:'G',coordinateFrame:'helioprojective_WCS',
      observerCarringtonLongitudeDeg:325,observerCarringtonLatitudeDeg:6.8},
    projection:{method:'radial_map_times_exact_radial_line_of_sight_cosine_nearest_cell/1',
      mapCoordinateFrame:'Carrington',sampleStridePixels:32,minimumMu:0.5,activeThresholdGauss:20,
      fullDiskPixelCount:4096*4096,sampledPixelCount:1000,registeredDiskSampleCount:100,distinctMapCells:80},
    allRegistered:all,activeField:active,longitudeShiftControls:[
      {longitudeShiftDeg:90,activeFieldOnSameSamples:{...active,rootMeanSquareResidualGauss:18}},
      {longitudeShiftDeg:180,activeFieldOnSameSamples:{...active,rootMeanSquareResidualGauss:17}}],
    bothAboveThresholdCount:10,bothAboveThresholdSignAgreement:0.8,
    displayPoints:[{longitudeDeg:30,latitudeDeg:15,measuredLosGauss:40,projectedMapLosGauss:20,mu:0.8}],
    sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeValidationAllowed:false});
  fireEvent.change(screen.getByLabelText('Import measured HMI LOS diagnostic'),{target:{files:[jsonFile(diagnostic)]}});
  await waitFor(()=>expect(screen.getByText(/Active-field RMS difference 15.0 G/)).toBeTruthy());
  await waitFor(()=>expect(screen.getByText(/On the same 1 displayed active-field samples/)).toBeTruthy());
  expect(screen.getByText(/full-map radial projection RMS 20.0 G/)).toBeTruthy();
  expect((screen.getByLabelText('Measured HMI LOS comparison markers (not field lines)') as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/HMI quality flag is nonzero/)).toBeTruthy();
  await waitFor(()=>expect(screen.getByText(/View ID:/).textContent).toMatch(/solar-magnetic-view:/));
  const originalView=screen.getByText(/View ID:/).textContent;
  fireEvent.click(screen.getByLabelText('radial l=1 approximation'));
  await waitFor(()=>expect(screen.getByText(/View ID:/).textContent).not.toBe(originalView));
  expect((screen.getByLabelText('radial l=1 approximation') as HTMLInputElement).checked).toBe(true);
  const {diagnosticId:_,...body}=diagnostic;
  const altered=await prepareSolarMagneticLosDiagnostic({...body,mapSourceProductId:'different-map'});
  fireEvent.change(screen.getByLabelText('Import measured HMI LOS diagnostic'),{target:{files:[jsonFile(altered)]}});
  await waitFor(()=>expect(screen.getByText(/HMI diagnostic rejected: HMI LOS diagnostic is not bound/)).toBeTruthy());
});

it('loads an exact owner-retained HMI diagnostic only for its selected GONG globe map',async()=>{
  const acquisitionId=`magnetic-acquisition:${'a'.repeat(64)}`;
  const hmiAcquisitionId=`magnetic-acquisition:${'b'.repeat(64)}`;
  const map={schemaVersion:'solar-global-radial-map/1' as const,
    source:{provider:'NSO/GONG',productId:'selected-gong',sourceUrl:'https://example.org/gong.fits.gz',
      sha256:'c'.repeat(64),kind:'synoptic_derived' as const,inputStartUtc:null,
      inputEndUtc:'2026-09-28T17:04:00Z',retrievedAtUtc:'2026-09-28T19:00:00Z'},
    coordinateFrame:'Carrington' as const,grid:'longitude_by_sine_latitude_cell_centers' as const,
    units:'G' as const,longitudeCells:12,sineLatitudeCells:6,radialGauss:Array(72).fill(20),
    observedMaskStatus:'unavailable' as const,observedCellMask:Array(72).fill(false),
    sourceIdentityAuthenticated:false as const,scientificAdmission:false as const};
  const mapId=await solarGlobalRadialMapContentId(map),hmiSha='d'.repeat(64);
  const metric=(count:number)=>({sampleCount:count,meanResidualGauss:1,
    medianAbsoluteResidualGauss:2,rootMeanSquareResidualGauss:3});
  const diagnostic=await prepareSolarMagneticLosDiagnostic({schemaVersion:'solar-magnetic-los-diagnostic/1',
    sourceMapContentId:mapId,mapSourceProductId:map.source.productId,mapSourceSha256:map.source.sha256,
    mapLatestContributorUtc:map.source.inputEndUtc,mapEarliestContributorUtc:null,
    hmi:{sourceUrl:'https://example.org/fblos.fits',sha256:hmiSha,drmsId:'hmi.test:1:magnetogram',
      observedAtUtc:'2026-09-28T18:00:00Z',qualityFlag:1024,instrument:'HMI',
      fieldComponent:'line_of_sight',units:'G',coordinateFrame:'helioprojective_WCS',
      observerCarringtonLongitudeDeg:12,observerCarringtonLatitudeDeg:4},
    projection:{method:'radial_map_times_exact_radial_line_of_sight_cosine_nearest_cell/1',
      mapCoordinateFrame:'Carrington',sampleStridePixels:32,minimumMu:0.5,activeThresholdGauss:20,
      fullDiskPixelCount:4096*4096,sampledPixelCount:16_384,registeredDiskSampleCount:100,distinctMapCells:50},
    allRegistered:metric(100),activeField:metric(10),longitudeShiftControls:[
      {longitudeShiftDeg:90,activeFieldOnSameSamples:metric(10)},
      {longitudeShiftDeg:180,activeFieldOnSameSamples:metric(10)}],
    bothAboveThresholdCount:1,bothAboveThresholdSignAgreement:1,
    displayPoints:[{longitudeDeg:12,latitudeDeg:4,measuredLosGauss:24,projectedMapLosGauss:20,mu:0.8}],
    sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeValidationAllowed:false});
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input),body=url.includes('/account/session')
      ?{session:{profile:{profile_id:'owner-a'}},account_policy:{account_type:'developer'}}
      :url.includes('/display-map')
        ?{schemaVersion:'solar-magnetic-display-map-receipt/1',acquisition:{acquisitionId,sha256:map.source.sha256},map,scientificAdmission:false}
        :{schemaVersion:'solar-magnetic-owner-los-comparison/1',gongAcquisitionId:acquisitionId,hmiAcquisitionId,
          gongReceipt:{acquisitionId,sha256:map.source.sha256},
          hmiReceipt:{acquisitionId:hmiAcquisitionId,sha256:hmiSha,
            hmiHeader:{observedAtUtc:diagnostic.hmi.observedAtUtc,qualityFlag:1024}},
          map,diagnostic,scientificAdmission:false,quantitativeValidationAllowed:false};
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetcher);
  try{
    render(<SolarMagneticGlobe acquisitionId={acquisitionId} hmiAcquisitionId={hmiAcquisitionId}/>);
    await waitFor(()=>expect(screen.getAllByText(new RegExp(diagnostic.diagnosticId))).toHaveLength(2));
    expect(screen.getByText(/not a calibrated same-time validation/)).toBeTruthy();
    expect(fetcher.mock.calls.some(([url])=>String(url).includes('/los-comparison?'))).toBe(true);
  }finally{vi.unstubAllGlobals();}
});

it('imports a comparison bundle as one coherent local view without scientific admission',async()=>{
  render(<SolarMagneticGlobe/>);
  const map={schemaVersion:'solar-global-radial-map/1' as const,
    source:{provider:'fixture',productId:'bundle-map',sourceUrl:'https://example.org/map',
      sha256:'1'.repeat(64),kind:'synoptic_derived' as const,inputStartUtc:null,
      inputEndUtc:'2026-09-28T00:00:00Z',retrievedAtUtc:'2026-09-28T01:00:00Z'},
    coordinateFrame:'Carrington' as const,grid:'longitude_by_sine_latitude_cell_centers' as const,units:'G' as const,
    longitudeCells:12,sineLatitudeCells:6,radialGauss:Array.from({length:72},(_,i)=>i<36?-10:10),
    observedMaskStatus:'unavailable' as const,observedCellMask:Array(72).fill(false),
    sourceIdentityAuthenticated:false as const,scientificAdmission:false as const};
  const mapContentId=await solarGlobalRadialMapContentId(map);
  const view=await prepareSolarMagneticViewRecipe({schemaVersion:'solar-magnetic-view-recipe/1',
    mapContentId,pfssModelId:null,coordinateFrame:'Carrington_display_cartesian',projection:'perspective',
    cameraPosition:[2.4,0.5,2.1],cameraTarget:'solar_center',fieldColorScale:'asinh_p98_abs_radial_gauss/1',
    showIllustrativeAxialDipole:false,showMapEquivalentDipole:true,showPfssLines:false,
    sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeJoinAllowed:false});
  const bundle=await prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
    map,pfss:null,losDiagnostic:null,view,sourceIdentityAuthenticated:false,
    scientificAdmission:false,quantitativeValidationAllowed:false});
  fireEvent.change(screen.getByLabelText('Import magnetic comparison bundle'),{target:{files:[jsonFile(bundle)]}});
  await waitFor(()=>expect(screen.getByText(new RegExp(`Replayed local comparison bundle ${bundle.bundleId}`))).toBeTruthy());
  expect(screen.getByText(new RegExp(mapContentId))).toBeTruthy();
  expect((screen.getByLabelText('Map-derived l=1 dipole approximation (not observed lines or PFSS)') as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/Display-only research preview/)).toBeTruthy();
});

it.runIf(existsSync(localBundlePath))('replays the actual local GONG/PFSS/HMI bundle with all three identities and bounded residuals',async()=>{
  render(<SolarMagneticGlobe/>);
  const bundle=JSON.parse(readFileSync(localBundlePath,'utf8')) as {
    bundleId:string;pfss:{modelId:string};losDiagnostic:{diagnosticId:string};map:{source:{productId:string}};
  };
  fireEvent.change(screen.getByLabelText('Import magnetic comparison bundle'),{target:{files:[jsonFile(bundle)]}});
  await waitFor(()=>expect(screen.getByText(new RegExp(`Replayed local comparison bundle ${bundle.bundleId}`))).toBeTruthy(),
    {timeout:10_000});
  expect(screen.getByText(new RegExp(bundle.pfss.modelId))).toBeTruthy();
  expect(screen.getByText(new RegExp(bundle.losDiagnostic.diagnosticId))).toBeTruthy();
  expect(screen.getByText(new RegExp(bundle.map.source.productId))).toBeTruthy();
  await waitFor(()=>expect(screen.getByText(/On the same 686 displayed active-field samples/)).toBeTruthy(),
    {timeout:10_000});
  const residual=screen.getByText(/On the same 686 displayed active-field samples/).textContent??'';
  expect(residual).toContain('full-map radial projection RMS 67.5 G');
  expect(residual).toContain('radial l=1 projection RMS 72.9 G');
  expect(screen.getByText(/not an independently measured global solar moment/)).toBeTruthy();
  expect(screen.getByText(/Display-only research preview/)).toBeTruthy();
},15_000);
