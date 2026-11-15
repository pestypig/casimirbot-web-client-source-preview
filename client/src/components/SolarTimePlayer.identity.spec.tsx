// @vitest-environment jsdom
import React from 'react';
import {createHash} from 'node:crypto';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HELIX_USER_ACCOUNT_POLICY} from '../../../shared/helix-account-session';
import {cacheAccountCapabilityPolicy} from '../lib/workstation/accountCapabilityPolicy';
import {serializeObservationSnapshot} from '../lib/solar-observation-replay';
import {SolarTimePlayer} from './SolarTimePlayer';

const view=vi.hoisted(()=>({render:vi.fn()}));
vi.mock('./SolarMagneticGlobe',()=>({SolarTemporalMagneticGlobe:(props:unknown)=>{view.render(props);return null;}}));
vi.mock('./SolarObservationRaster',()=>({SolarObservationRaster:()=>null}));
vi.mock('./SolarDailyMoviePlayer',()=>({SolarDailyMoviePlayer:()=>null}));
const time='2026-09-21T15:38:05.000Z',end='2026-09-22T15:38:05.000Z';
const modelTime='2026-09-21T15:04:00.000Z',owner='playback-owner';
const imageId=`solar-source-image:${'a'.repeat(64)}`,modelId=`rob-pfss-acquisition:${'b'.repeat(64)}`;
const manifestId=`solar-time-playback:${'c'.repeat(64)}`;
const recordKey='mrbqs260921t1504c2316_021',relativePath=`2026/09/21/${recordKey}`;
async function archive(fitsHash='d'.repeat(64)){
  const bytes=Buffer.alloc(32*32*4);
  return JSON.parse(await serializeObservationSnapshot({instrument:'AIA',wavelength_A:193,
    meta:{observed_mode:'observed'},frames:[{grid_size:32,map_b64:bytes.toString('base64'),
      obstime:time,coordinate_frame:'native_instrument_pixel_grid',fits_sha256:fitsHash,
      display_sha256:createHash('sha256').update(bytes).digest('hex'),
      wcs_header:{CTYPE1:'HPLN-TAN',CTYPE2:'HPLT-TAN'},
      registration_geometry:{observerCarringtonLongitudeDeg:75,observerCarringtonLatitudeDeg:6,
        observerDistanceMeters:1.5e11,solarRadiusMeters:6.96e8}}]}));
}
async function fixtures(){
  const imageArchive=await archive();
  const frame=imageArchive.frames[0];
  const imageReceipt={schemaVersion:'solar-observation-source-retained/1',acquisitionId:imageId,
    ownerProfileId:owner,archiveId:imageArchive.archive_identity.snapshotId,frameIndex:0,
    sourceFitsSha256:frame.fits_sha256,sourceFitsBytes:2880,displaySha256:frame.display_sha256,
    observedAtUtc:time,instrument:'AIA',wavelengthAngstrom:193,retainedAtUtc:time,
    providerIdentityAuthenticated:false,scientificAdmission:false};
  const commonModel={catalogUrl:'https://example.org/list.txt',catalogSha256:'e'.repeat(64),
    catalogBytes:100,catalogCheckedAtUtc:time,relativePath,modelUrl:'https://example.org/model.fits',
    sourceSha256:'f'.repeat(64),sourceBytes:2880,retrievedAtUtc:time,
    magnetogramTimeHintUtc:modelTime,fitsDateObsUtc:modelTime,scientificAdmission:false};
  const model={...commonModel,schemaVersion:'solar-rob-pfss-snapshot/3',
    sourceObservatory:'Royal Observatory of Belgium',inputNetwork:'NSO/GONG NETWORK',
    sourceMapRecordKey:recordKey,sourceMapBytesIncluded:false,sourceMapSolverInputHashKnown:false,
    coordinateFrame:'ROB_earth_reference_unrotated_JHV_axis_convention',coordinateRegistrationVerified:false,
    units:'solar_radii_degrees',encoding:'ROB_unsigned_short_cartesian/1',totalLines:1,pointsPerLine:40,
    displaySelection:'uniform_index_stride_max_96/1',lines:[{lineIndex:0,topology:'closed',
      polarity:'positive',encodedStrengthAtFirstPoint:0.5,points:Array.from({length:40},()=>[1,0,0])}],
    farSideDirectlyObserved:false,sameTimeWholeSunObserved:false,coronalLinesMeasured:false,
    sourceIdentityAuthenticated:false};
  const modelReceipt={...commonModel,schemaVersion:'solar-rob-pfss-retained/2',acquisitionId:modelId,
    ownerProfileId:owner,parentMagnetogramRetained:false};
  const parent={schemaVersion:'solar-rob-pfss-parent-candidate/1',modelAcquisitionId:modelId,
    modelSha256:model.sourceSha256,modelFitsDateObsUtc:modelTime,parentRecordKey:recordKey,
    parentSourceUrl:'https://example.org/parent.fits.gz',parentSha256:'1'.repeat(64),parentBytes:2880,
    retrievedAtUtc:time,mapEpochUtc:modelTime,carringtonRotation:2316,rawShape:[180,360],units:'Gauss',
    wcs:{name:'Carrington Cylin-equal-area',longitudeType:'CRLN-CEA',latitudeType:'CRLT-CEA',
      crpix1:1,crpix2:90,crval1:0,crval2:0,cdelt1:1,cdelt2:1},
    displayRotation:{method:'GONG_CRNOW_LONGADJ_integer_degree_approximation',crnow:2316,longAdjDeg:0,
      earthCarringtonLongitudeApproxDeg:0,independentEphemerisVerified:false},ownerProfileId:owner,
    matchBasis:'exact_filename_stem_and_header_time_only',rightsStatus:'provider_terms_not_evaluated',
    sourceIdentityAuthenticated:false,modelInputBytesProven:false,coordinateRegistrationVerified:false,
    contributorIntervalKnown:false,farSideDirectlyObserved:false,scientificAdmission:false};
  const slot={state:'retained_pair',requestedAtUtc:time,imageId,archiveId:imageReceipt.archiveId,
    imageFrameIndex:0,imageInstrument:'AIA',imageWavelengthAngstrom:193,
    imageSourceDisplayGeometryAudit:'unavailable',imageObservedAtUtc:time,
    imageFitsSha256:imageReceipt.sourceFitsSha256,imageDisplaySha256:imageReceipt.displaySha256,
    modelId,modelFitsDateObsUtc:modelTime,modelSha256:model.sourceSha256,catalogSha256:model.catalogSha256,
    gongCandidateSha256:parent.parentSha256,gongMapEpochUtc:modelTime,gongLastContributorUtc:null,
    gongContributingFileCount:null,gongContributorIntervalKnown:false,gongPerPixelObservationTimesIncluded:false,
    imageOffsetSeconds:0,modelAgeSeconds:2045,modelInputBytesProven:false,farSideDirectlyObserved:false,
    sameTimeWholeSunObserved:false};
  const manifest={schemaVersion:'solar-time-playback/1',manifestId,ownerProfileId:owner,savedAtUtc:time,
    startUtc:time,endUtc:end,imagePolicy:'at-or-before',requestedStepDays:1,coverage:'partial_selected_slots',
    slots:[slot,{state:'unresolved',requestedAtUtc:end,reason:'not_retained',sourceAbsenceVerified:false}],
    clockBasis:'requested_UTC_playhead_separate_from_AIA_observation_ROB_FITS_and_GONG_contributor',
    selectionBasis:'bounded_requested_samples_not_every_available_exposure_or_model',
    modelInputBytesProven:false,coordinateRegistrationVerified:false,farSideDirectlyObserved:false,
    scientificAdmission:false,retainedSourceBytesRehashed:true,unresolvedSlotsAreSourceAbsenceProof:false};
  return {manifest,imageArchive,imageReceipt,model,modelReceipt,parent};
}
type Fixture=Awaited<ReturnType<typeof fixtures>>;
function open(f:Fixture){
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);let value:unknown;
    if(url.includes('/time-playback/retained?'))value=f.manifest;
    else if(url.includes('/observation-source/retained?'))value={receipt:f.imageReceipt,archive:f.imageArchive};
    else if(url.includes('/rob-pfss/retained?'))value={receipt:f.modelReceipt,snapshot:f.model};
    else if(url.includes('/rob-pfss/parent?'))value={receipt:f.parent};
    else throw new Error(`Unexpected request ${url}`);
    return {ok:true,json:async()=>value};
  });vi.stubGlobal('fetch',fetcher);
  render(<SolarTimePlayer/>);fireEvent.click(screen.getByRole('button',{name:/Sampled FITS/}));
  fireEvent.change(screen.getByLabelText('Checkpoint ID'),{target:{value:manifestId}});
  fireEvent.click(screen.getByRole('button',{name:'Open and verify checkpoint'}));
  return fetcher;
}
beforeEach(()=>{cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY,owner);view.render.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('displays a matching retained pair and keeps an unresolved slot labeled as unverified absence',async()=>{
  const f=await fixtures();open(f);
  await waitFor(()=>expect(view.render.mock.calls.some(([props])=>props.image&&props.snapshot)).toBe(true));
  const props=view.render.mock.calls.findLast(([props])=>props.image)?.[0];
  expect(props.image).toMatchObject({archiveId:f.imageReceipt.archiveId,displaySha256:f.imageReceipt.displaySha256});
  expect(props.snapshot.sourceSha256).toBe(f.model.sourceSha256);
  expect(screen.getAllByText(/unresolved slots.*not.*source absence/i).length).toBeGreaterThan(0);
});
const mismatches:Array<[string,(f:Fixture)=>void|Promise<void>]>=[
  ['different valid display archive',async f=>{f.imageArchive=await archive('9'.repeat(64));}],
  ['receipt archive ID',f=>{f.imageReceipt.archiveId=`solar-observation:${'9'.repeat(64)}`;}],
  ['manifest archive ID',f=>{const slot=f.manifest.slots[0];
    if (!('archiveId' in slot)) throw new Error('Expected a resolved source slot in this fixture');
    slot.archiveId=`solar-observation:${'9'.repeat(64)}`;}],
  ['image owner',f=>{f.imageReceipt.ownerProfileId='another-owner';}],
  ['model owner',f=>{f.modelReceipt.ownerProfileId='another-owner';}],
  ['model receipt ID',f=>{f.modelReceipt.acquisitionId=`rob-pfss-acquisition:${'9'.repeat(64)}`;}],
  ['catalog identity',f=>{f.model.catalogSha256='9'.repeat(64);}],
  ['parent owner',f=>{f.parent.ownerProfileId='another-owner';}],
  ['parent model hash',f=>{f.parent.modelSha256='9'.repeat(64);}],
  ['parent model time',f=>{f.parent.modelFitsDateObsUtc=end;}],
  ['parent map epoch',f=>{f.parent.mapEpochUtc=end;}],
];
it.each(mismatches)('rejects a mismatched %s before rendering source data',async(_label,alter)=>{
  const f=await fixtures();await alter(f);open(f);
  await waitFor(()=>expect(screen.queryAllByText(
    /Reopened and rehashed selected source pair|Retained playback source differs from manifest/).length).toBeGreaterThan(0));
  expect(view.render.mock.calls.some(([props])=>props.image||props.snapshot)).toBe(false);
  expect(screen.getAllByText(/Retained playback source differs from manifest/).length).toBeGreaterThan(0);
});
it.each(['owner','ID'])('rejects a checkpoint with the wrong %s before fetching its sources',async(field)=>{
  const f=await fixtures();
  if(field==='owner')f.manifest.ownerProfileId='another-owner';
  else f.manifest.manifestId=`solar-time-playback:${'9'.repeat(64)}`;
  const fetcher=open(f);
  await waitFor(()=>expect(fetcher.mock.calls.length>1||
    screen.queryByText(/Checkpoint identity differs from the selected owner and ID/)!==null).toBe(true));
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(screen.getByText(/Checkpoint identity differs from the selected owner and ID/)).toBeTruthy();
  expect(view.render.mock.calls.some(([props])=>props.image||props.snapshot)).toBe(false);
});
