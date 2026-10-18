// @vitest-environment jsdom
import React from 'react';
import {syntheticSolarPortablePackage} from '../../../../tests/fixtures/solar-portable-package';
import {createSolarEventImageSelection} from '../../../../shared/solar-event-image-selection';
import {createSolarGoesFrameWindow} from '../../../../shared/solar-goes-frame-window';
import {serializeObservationSnapshot} from '../../../../shared/solar-observation-replay';
import {webcrypto} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react';
vi.mock('@tanstack/react-query',()=>({useMutation:()=>({mutate:vi.fn(),isPending:false})}));
vi.mock('../SolarDiskCanvas',()=>({SolarDiskCanvas:()=>null}));
vi.mock('../SolarKhiNativeOverlay',()=>({SolarKhiNativeOverlay:()=>null}));
vi.mock('../SolarObservationRaster',()=>({SolarObservationRaster:()=>null}));
vi.mock('../SolarCacheManager',()=>({SolarCacheManager:()=>null}));
vi.mock('../SolarActiveRegionCatalog',()=>({SolarActiveRegionCatalog:()=>null}));
vi.mock('../SolarProfileComparison',()=>({SolarProfileComparison:({observationArchive}:any)=><p data-testid="selected-archive">{observationArchive?.archive_identity?.snapshotId??'none'}</p>}));
import StarWatcherPanel from '../../pages/star-watcher-panel';
import {getPanelDef} from '../../lib/desktop/panelRegistry';
import {isSolarSpecialistLaunchPanel} from '../../lib/workstation/solarSpecialistPanels';
import {useWorkstationLayoutStore} from '../../store/useWorkstationLayoutStore';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const packageData=JSON.parse(await syntheticSolarPortablePackage(true));
const text=JSON.stringify(packageData.observationArchive);
afterEach(()=>{cleanup();window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));vi.restoreAllMocks();vi.unstubAllGlobals();});
function network(){const fetch=vi.fn(async(url:any)=>String(url).includes('runtime-capability')
  ?{ok:true,json:async()=>({available:false,reason:'test-runtime-unavailable'})}
  :{ok:true,text:async()=>JSON.stringify({driver_history_len:0})});vi.stubGlobal('fetch',fetch);vi.stubGlobal('crypto',webcrypto);return fetch;}
it('keeps ingest diagnostics available but collapsed on first render',()=>{
  network();render(<StarWatcherPanel/>);
  const summary=screen.getByText(/Advanced · ingest diagnostics/);
  const details=summary.closest('details');
  expect(details?.open).toBe(false);
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
  expect(screen.getByRole('button',{name:'Mem snapshot'})).toBeTruthy();
});
it('starts at the disk and routes through a categorized directory',async()=>{
  network();render(<StarWatcherPanel/>);
  expect(screen.getByRole('region',{name:'Solar disk and imagery'})).toBeTruthy();
  expect(screen.getByText('Illustrative disk · no observed image loaded')).toBeTruthy();
  const directory=screen.getByRole('navigation',{name:'Star Watcher directory'});
  expect(directory.querySelectorAll('button')).toHaveLength(8);
  expect(screen.getByRole('button',{name:/Solar disk Current image/}).getAttribute('aria-current')).toBe('page');
  for(const id of ['solar-observe','solar-replay','solar-compare','solar-diagnostics'])
    expect(document.getElementById(id)).toBeTruthy();
  expect(document.getElementById('solar-observe')!.closest('[hidden]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  expect(screen.getByRole('button',{name:/Imagery & sources Channels/}).getAttribute('aria-current')).toBe('page');
  expect(document.getElementById('solar-observe')!.closest('[hidden]')).toBeFalsy();
  fireEvent.click(screen.getByRole('button',{name:'Inspect events'}));
  expect(screen.getByRole('button',{name:/Events HEK reports/}).getAttribute('aria-current')).toBe('page');
  expect(document.getElementById('solar-events')!.closest('[hidden]')).toBeFalsy();
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  expect(screen.getByRole('region',{name:'Build an event evidence package'})).toBeTruthy();
  await waitFor(()=>expect(screen.getByRole('region',{name:'Stellar scene context'})).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:/Diagnostics Derived/}));
  expect(screen.getByRole('button',{name:/Diagnostics Derived/}).getAttribute('aria-current')).toBe('page');
  expect(screen.getByText('5-minute Bins (SunPy Bridge)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Reports Copyable/}));
  expect(document.getElementById('solar-report')!.closest('[hidden]')).toBeFalsy();
});
it('switches the primary surface between the disk and the 3D globe',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  network();render(<StarWatcherPanel/>);
  expect(screen.getByRole('region',{name:'Solar disk and imagery'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'3D magnetic globe'}));
  await waitFor(()=>expect(screen.getByRole('region',{name:'3D magnetic globe'})).toBeTruthy(),{timeout:30000});
  expect(screen.getByLabelText('Import magnetic comparison bundle')).toBeTruthy();
  expect(screen.getByText('Advanced · inspect or replace individual inputs').closest('details')?.open).toBe(false);
  expect(screen.queryByRole('region',{name:'Solar disk and imagery'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Solar disk'}));
  expect(screen.getByRole('region',{name:'Solar disk and imagery'})).toBeTruthy();
});
it('defaults to the HMI sunspot disk and exposes the separate whole-disk magnetogram',async()=>{
  const sha='c'.repeat(64);
  const preview=(channel:'hmiContinuum'|'hmiMag')=>({schemaVersion:'solar-live-preview/2',channel,
    label:channel==='hmiContinuum'?'HMI continuum intensitygram (gray)':'HMI magnetogram',productKind:'browse_image',
    source:'NASA/SDO',sourceId:'sdo',selectionReason:'preferred_fresh',instrument:'HMI',wavelength_A:null,
    sourceUrl:`https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_${channel==='hmiContinuum'?'HMII':'HMIB'}.jpg`,
    imageUrl:`/api/star-watcher/live-preview/image?channel=${channel}&source=sdo&sha256=${sha}`,sha256:sha,
    retrievedAt:'2026-10-10T13:00:00Z',upstreamLastModifiedAt:'2026-10-10T12:55:00Z',observationAt:null,upstreamImageId:null,
    stale:false,scienceRunAllowed:false,quantitativeComparisonAllowed:false});
  const fetch=vi.fn(async(url:any)=>String(url).includes('live-preview?channel=')
    ?{ok:true,json:async()=>preview(String(url).includes('hmiMag')?'hmiMag':'hmiContinuum')}
    :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})});
  vi.stubGlobal('fetch',fetch);
  render(<StarWatcherPanel/>);
  await waitFor(()=>expect(screen.getByAltText('HMI continuum intensitygram (gray) browse image from NASA/SDO')).toBeTruthy());
  expect(screen.getByRole('button',{name:'Sunspot intensitygram'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(/observation time not verified/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Whole-disk magnetogram'}));
  await waitFor(()=>expect(screen.getByAltText('HMI magnetogram browse image from NASA/SDO')).toBeTruthy());
  expect(screen.getByRole('button',{name:'Whole-disk magnetogram'}).getAttribute('aria-pressed')).toBe('true');
});
it('only overlays NOAA positions after explicitly loading the exact registered HMI image',async()=>{
  const browseSha='c'.repeat(64),registeredSha='a'.repeat(64);
  const preview={schemaVersion:'solar-live-preview/2',channel:'hmiContinuum',label:'HMI continuum intensitygram (gray)',productKind:'browse_image',
    source:'NASA/SDO',sourceId:'sdo',selectionReason:'preferred_fresh',instrument:'HMI',wavelength_A:null,
    sourceUrl:'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMII.jpg',
    imageUrl:`/api/star-watcher/live-preview/image?channel=hmiContinuum&source=sdo&sha256=${browseSha}`,sha256:browseSha,
    retrievedAt:'2026-10-10T13:00:00Z',upstreamLastModifiedAt:'2026-10-10T12:55:00Z',observationAt:null,upstreamImageId:null,
    stale:false,scienceRunAllowed:false,quantitativeComparisonAllowed:false};
  const registered={schemaVersion:'solar-registered-active-regions/1',
    image:{...preview,source:'Helioviewer / NASA SDO HMI',sourceId:'helioviewer-hmi',upstreamImageId:'12345',
      sourceUrl:'https://api.helioviewer.org/v2/downloadImage/?id=12345&width=512&type=jpg',
      imageUrl:`/api/star-watcher/live-preview/image?channel=hmiContinuum&source=helioviewer-hmi&sha256=${registeredSha}`,
      sha256:registeredSha,observationAt:'2026-10-10T12:00:00.000Z',widthPx:512,heightPx:512},
    report:{sourceUrl:'https://services.swpc.noaa.gov/text/srs.txt',sourceSha256:'b'.repeat(64),
      issuedAt:'2026-10-10T00:30:00.000Z',validAt:'2026-10-10T00:00:00.000Z',fetchedAt:'2026-10-10T13:00:00.000Z'},
    wcs:{headerUrl:'https://api.helioviewer.org/v2/getJP2Header/?id=12345',headerSha256:'d'.repeat(64),
      headerObservationAt:'2026-10-10T12:00:00.000Z',nativeWidthPx:4096,nativeHeightPx:4096,
      qualityFlag:0,qualityInterpretation:'numeric_flag_only_not_science_admission'},
    registration:{method:'noaa_srs_carrington_hpc_tan',rotationAssumption:'fixed_carrington_longitude',timeDeltaSeconds:43200,
      maxAbsTimeDeltaSeconds:129600,positionSemantics:'approximate_report_location_not_spot_centroid',pixelOrigin:'top_left',
      scienceRunAllowed:false,quantitativeComparisonAllowed:false},
    regions:[{noaaNumber:4545,latitudeDeg:18,centralMeridianDistanceDeg:46,carringtonLongitudeDeg:222,
      location:'N18W46',spotCount:5,spotClass:'Cao',magneticClass:'Beta',areaMillionths:70,category:'sunspot',
      visible:true,xPx:300,yPx:200,omissionReason:null}]};
  let registrationBody:unknown=registered;
  const fetch=vi.fn(async(url:any)=>String(url).includes('/active-regions/registered?')
    ?{ok:true,json:async()=>registrationBody}
    :String(url).includes('live-preview?channel=')
      ?{ok:true,json:async()=>preview}
      :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})});
  vi.stubGlobal('fetch',fetch);
  render(<StarWatcherPanel/>);
  await waitFor(()=>expect(screen.getByAltText('HMI continuum intensitygram (gray) browse image from NASA/SDO')).toBeTruthy());
  expect(screen.queryByRole('button',{name:'Projected NOAA 4545 on HMI image'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Show registered NOAA labels'}));
  await waitFor(()=>expect(screen.getByRole('region',{name:'Registered NOAA region view'})).toBeTruthy());
  expect(screen.queryByAltText('HMI continuum intensitygram (gray) browse image from NASA/SDO')).toBeNull();
  expect(screen.getByRole('img',{name:/Exact Helioviewer HMI image/}).getAttribute('src')).toBe(registered.image.imageUrl);
  expect(screen.getByText(/large time offset makes each marker coarse context/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Projected NOAA 4545 on HMI image'}));
  expect(screen.getByRole('button',{name:/NOAA 4545 N18W46 projected on image/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'Return to latest image'}));
  await waitFor(()=>expect(screen.getByAltText('HMI continuum intensitygram (gray) browse image from NASA/SDO')).toBeTruthy());
  expect(screen.queryByRole('button',{name:'Projected NOAA 4545 on HMI image'})).toBeNull();
  expect(fetch.mock.calls.some(([url])=>String(url)==='/api/star-watcher/active-regions/registered?channel=hmiContinuum')).toBe(true);
  registrationBody={...registered,image:{...registered.image,imageUrl:'/unbound-image.jpg'}};
  fireEvent.click(screen.getByRole('button',{name:'Show registered NOAA labels'}));
  await waitFor(()=>expect(screen.getByText(/Exact image\/report registration unavailable/)).toBeTruthy());
  expect(screen.queryByRole('button',{name:'Projected NOAA 4545 on HMI image'})).toBeNull();
  expect(screen.getByAltText('HMI continuum intensitygram (gray) browse image from NASA/SDO')).toBeTruthy();
});
const registeredBundlePath='.codex-build/solar-magnetic-source-20260928/gong-hmi-sphere-comparison-bundle-v2.json';
it.skipIf(!existsSync(registeredBundlePath))('shows the same HMI registration and explicit coverage limits in the globe',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const json=readFileSync(registeredBundlePath,'utf8');
  network();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'3D magnetic globe'}));
  await waitFor(()=>expect(screen.getByLabelText('Import magnetic comparison bundle')).toBeTruthy(),{timeout:30000});
  fireEvent.change(screen.getByLabelText('Import magnetic comparison bundle'),
    {target:{files:[{size:Buffer.byteLength(json),text:async()=>json}]}});
  await waitFor(()=>expect(screen.getByText(/HMI sphere registration solar-sphere-registration:3c5c22c/)).toBeTruthy());
  await waitFor(()=>expect(screen.getByLabelText('Solar sphere scene identity').textContent).toMatch(/solar-sphere-scene:[a-f0-9]{64}/));
  expect(screen.getByText(/29\/81 visible-disk samples, 52 off-disk/)).toBeTruthy();
  expect(screen.getByText(/No full-pixel coverage, far-side observation, coronal height or calibrated magnetic fit/)).toBeTruthy();
  expect(screen.getByRole('checkbox',{name:/HMI visible-disk geometry anchors \(25\)/})).toBeTruthy();
  fireEvent.click(screen.getByText('Inspect sampled HMI image ↔ sphere anchors'));
  expect(screen.getByRole('img',{name:'HMI sampled image-plane geometry'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'#1'}));
  expect(screen.getByText(/Anchor 1: HMI pixel .* ↔ Carrington/)).toBeTruthy();
});
it('routes a located HEK-only active region from the globe to its event inspector',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const eventId='ivo://hek/test-active-region';
  const event={id:eventId,ivorn:eventId,event_type:'AR',hgc_x:-35,hgc_y:-12,
    start_time:'2026-09-28T16:00:00Z',end_time:'2026-09-28T17:00:00Z',noaa_ar:14534};
  const preview={schemaVersion:'solar-live-preview/2',channel:'aia193',label:'AIA 193 Å',productKind:'browse_image',
    source:'NASA/SDO',sourceId:'sdo',selectionReason:'preferred_fresh',instrument:'AIA',wavelength_A:193,
    sourceUrl:'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
    imageUrl:'/api/star-watcher/live-preview/image?channel=aia193&source=sdo&sha256='+'a'.repeat(64),sha256:'a'.repeat(64),
    retrievedAt:'2026-09-28T10:00:00Z',upstreamLastModifiedAt:null,observationAt:null,upstreamImageId:null,stale:false,scienceRunAllowed:false,
    quantitativeComparisonAllowed:false};
  const fetch=vi.fn(async(url:any)=>String(url).includes('/sunpy-export?')
    ?{ok:true,text:async()=>JSON.stringify({instrument:'AIA',wavelength_A:193,frames:[],events:[event],
      meta:{source:'HEK-only test response'}})}
    :String(url).includes('live-preview?')
      ?{ok:true,json:async()=>preview}
    :String(url).includes('runtime-capability')
      ?{ok:true,json:async()=>({available:false,reason:'test-runtime-unavailable'})}
      :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})});
  vi.stubGlobal('fetch',fetch);
  render(<StarWatcherPanel/>);
  fireEvent.change(screen.getByLabelText('Solar disk channel'),{target:{value:'aia193'}});
  await waitFor(()=>expect(screen.getByAltText(/AIA 193 Å browse image from NASA\/SDO/)).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  fireEvent.click(screen.getByText(/Source and event options/));
  fireEvent.click(screen.getByRole('button',{name:'HEK-only (maxFrames=0)'}));
  fireEvent.click(screen.getByRole('button',{name:'Load SunPy + HEK'}));
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>String(url).includes('/sunpy-export?'))).toBe(true));
  await waitFor(()=>expect(screen.getByText('HEK event catalog · no image frame')).toBeTruthy());
  expect(screen.queryByAltText(/browse image from NASA\/SDO/)).toBeNull();
  expect(screen.getByText('Catalog-only disk · no observed image loaded')).toBeTruthy();
  expect(screen.getByText(/latest browse preview is hidden because it is not an image of this search window/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'3D magnetic globe'}));
  await waitFor(()=>expect(screen.getByLabelText('HEK active-region locations (1)')).toBeTruthy(),{timeout:30000});
  fireEvent.click(screen.getByRole('button',{name:/NOAA 14534/}));
  expect(screen.getByRole('button',{name:/Events HEK reports/}).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('region',{name:'Selected event image context'}).textContent).toContain(eventId);
});
it('opens data-source settings from the header while leaving a saved observation distinct from the live preview',async()=>{
  const preview={schemaVersion:'solar-live-preview/2',channel:'aia193',label:'AIA 193 Å',productKind:'browse_image',
    source:'NASA/SDO',sourceId:'sdo',selectionReason:'preferred_fresh',instrument:'AIA',wavelength_A:193,
    sourceUrl:'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
    imageUrl:'/api/star-watcher/live-preview/image?channel=aia193&source=sdo&sha256='+'a'.repeat(64),sha256:'a'.repeat(64),
    retrievedAt:'2026-09-28T10:00:00Z',upstreamLastModifiedAt:null,observationAt:null,upstreamImageId:null,stale:false,scienceRunAllowed:false,
    quantitativeComparisonAllowed:false};
  const fetch=vi.fn(async(url:any)=>String(url).includes('live-preview?')
    ?{ok:true,json:async()=>preview}
    :String(url).includes('source-connections/jsoc')
      ?{ok:true,json:async()=>({schemaVersion:'solar-jsoc-session-connection/1',connected:false,connectionId:null,maskedEmail:null,storage:'server_session_memory',verifiedAtProvider:false})}
      :{ok:true,json:async()=>({available:false,reason:'test-runtime-unavailable'}),text:async()=>JSON.stringify({driver_history_len:0})});
  vi.stubGlobal('fetch',fetch);
  render(<StarWatcherPanel/>);
  fireEvent.change(screen.getByLabelText('Solar disk channel'),{target:{value:'aia193'}});
  await waitFor(()=>expect(screen.getByAltText(/AIA 193 Å browse image from NASA\/SDO/)).toBeTruthy());
  expect(screen.getByText(/observation time not verified/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Data sources & access'}));
  expect(screen.getByRole('region',{name:'Data sources and access'})).toBeTruthy();
  expect(screen.getByText(/API keys and persistent provider credentials are not accepted/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Imagery & sources Channels/}));
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
  await waitFor(()=>expect(screen.queryByAltText(/browse image from NASA\/SDO/)).toBeNull());
  expect(screen.getByText(/Current NOAA daily regions are hidden during observation replay/)).toBeTruthy();
});
it('labels a fresh SUVI fallback as context rather than an AIA-equivalent measurement',async()=>{
  const sha='b'.repeat(64);
  const preview={schemaVersion:'solar-live-preview/2',channel:'aia193',label:'SUVI 195 Å',
    productKind:'browse_image',source:'NOAA/SWPC SUVI primary',sourceId:'suvi-primary',
    selectionReason:'preferred_stale',instrument:'SUVI',wavelength_A:195,
    sourceUrl:'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/latest.png',
    imageUrl:`/api/star-watcher/live-preview/image?channel=aia193&source=suvi-primary&sha256=${sha}`,
    sha256:sha,retrievedAt:'2026-09-30T10:01:00Z',upstreamLastModifiedAt:'2026-09-30T10:00:00Z',
    observationAt:null,upstreamImageId:null,stale:false,scienceRunAllowed:false,quantitativeComparisonAllowed:false};
  vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).includes('live-preview?')
    ?{ok:true,json:async()=>preview}
    :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})}));
  render(<StarWatcherPanel/>);
  fireEvent.change(screen.getByLabelText('Solar disk channel'),{target:{value:'aia193'}});
  await waitFor(()=>expect(screen.getByAltText('SUVI 195 Å browse image from NOAA/SWPC SUVI primary')).toBeTruthy());
  expect(screen.getByText(/Fallback EUV source · published/)).toBeTruthy();
  expect(screen.getByText(/SUVI EUV context, not an AIA-equivalent measurement/)).toBeTruthy();
});
it('shows the Helioviewer HMI fallback with its actual observation time and browse-only status',async()=>{
  const sha='d'.repeat(64);
  const preview={schemaVersion:'solar-live-preview/2',channel:'hmiContinuum',label:'HMI continuum intensitygram (Helioviewer)',
    productKind:'browse_image',source:'Helioviewer / NASA SDO HMI',sourceId:'helioviewer-hmi',
    selectionReason:'preferred_stale',instrument:'HMI',wavelength_A:null,
    sourceUrl:'https://api.helioviewer.org/v2/downloadImage/?id=192879714&width=512&type=jpg',
    imageUrl:`/api/star-watcher/live-preview/image?channel=hmiContinuum&source=helioviewer-hmi&sha256=${sha}`,
    sha256:sha,retrievedAt:'2026-10-10T18:02:00.000Z',upstreamLastModifiedAt:null,
    observationAt:'2026-10-10T15:59:00.000Z',upstreamImageId:'192879714',
    stale:false,scienceRunAllowed:false,quantitativeComparisonAllowed:false};
  vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).includes('live-preview?')
    ?{ok:true,json:async()=>preview}
    :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})}));
  render(<StarWatcherPanel/>);
  await waitFor(()=>expect(screen.getByAltText('HMI continuum intensitygram (Helioviewer) browse image from Helioviewer / NASA SDO HMI')).toBeTruthy());
  expect(screen.getByText(/HMI alternate source · observed 2026-10-10T15:59:00.000Z/)).toBeTruthy();
  expect(screen.getByText(/Helioviewer-rendered HMI intensitygram/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Imagery & sources Channels/}));
  expect(screen.getByText(/Observation time: 2026-10-10T15:59:00.000Z/)).toBeTruthy();
  expect(screen.getByText(/this JPEG is a browse product, not calibrated FITS/)).toBeTruthy();
});
it('keeps a Helioviewer HMI magnetogram distinct from an intensitygram and a 3D field',async()=>{
  const sha='e'.repeat(64);
  const preview={schemaVersion:'solar-live-preview/2',channel:'hmiMag',label:'HMI magnetogram (Helioviewer)',
    productKind:'browse_image',source:'Helioviewer / NASA SDO HMI',sourceId:'helioviewer-hmi-mag',
    selectionReason:'preferred_stale',instrument:'HMI',wavelength_A:null,
    sourceUrl:'https://api.helioviewer.org/v2/downloadImage/?id=192879715&width=512&type=jpg',
    imageUrl:`/api/star-watcher/live-preview/image?channel=hmiMag&source=helioviewer-hmi-mag&sha256=${sha}`,
    sha256:sha,retrievedAt:'2026-10-10T18:02:00.000Z',upstreamLastModifiedAt:null,
    observationAt:'2026-10-10T16:02:00.000Z',upstreamImageId:'192879715',
    stale:false,scienceRunAllowed:false,quantitativeComparisonAllowed:false};
  vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).includes('live-preview?')
    ?{ok:true,json:async()=>preview}
    :{ok:true,json:async()=>({connected:false}),text:async()=>JSON.stringify({driver_history_len:0})}));
  render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Whole-disk magnetogram'}));
  await waitFor(()=>expect(screen.getByAltText('HMI magnetogram (Helioviewer) browse image from Helioviewer / NASA SDO HMI')).toBeTruthy());
  expect(screen.getByText(/Helioviewer-rendered HMI line-of-sight magnetogram/)).toBeTruthy();
  expect(screen.getByText(/Not calibrated science data, a saved observation, or a 3D magnetic reconstruction/)).toBeTruthy();
});
it('keeps specialist solar panels reachable from Star Watcher but out of the launch picker',()=>{
  network();
  const open=vi.spyOn(useWorkstationLayoutStore.getState(),'openPanelInActiveGroup').mockImplementation(()=>{});
  render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:/Models & concepts Specialist/}));
  for(const section of ['Reduced-order structure','Exploratory transport','Illustrations & mission concepts'])
    expect(screen.getByRole('region',{name:section})).toBeTruthy();
  expect(screen.getByText(/These are standalone research tools, not connected model adapters/)).toBeTruthy();
  expect(screen.getAllByText(/Scene binding: No /)).toHaveLength(6);
  expect(screen.getByText(/casimirbot\.solar\.deepmix-scanner · v1\.0\.0/)).toBeTruthy();
  expect(screen.getAllByText('Output: deepmix-toy-run/1')).toHaveLength(2);
  for(const id of ['star-hydrostatic','solar-globe','deepmix-solar','deepmix-sweetspot','deepmix-globe','ferrofluid-analogue']){
    expect(isSolarSpecialistLaunchPanel(id)).toBe(true);
    expect(getPanelDef(id)?.startHidden).not.toBe(true);
    expect(getPanelDef(id)?.loader).toBeTypeOf('function');
  }
  fireEvent.click(screen.getByRole('button',{name:'Open Hydrostatic Equilibrium'}));
  expect(open).toHaveBeenCalledWith('star-hydrostatic');
  fireEvent.click(screen.getByRole('button',{name:'Open Solar Globe'}));
  expect(open).toHaveBeenCalledWith('solar-globe');
});
it('shows an event-to-package path with live selection status and working section targets',async()=>{
  network();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  const path=screen.getByRole('region',{name:'Build an event evidence package'});
  await waitFor(()=>expect(path.textContent).toContain('Packaged SunPy unavailable; local replay is available'));
  expect(path.textContent).toContain('No event/frame selection');
  for(const id of ['solar-observe','solar-events','solar-research-catalog','solar-compare'])
    expect(document.getElementById(id)).toBeTruthy();
  const events=document.getElementById('solar-events')!;
  const replay=document.getElementById('solar-replay')!;
  replay.scrollIntoView=vi.fn();
  fireEvent.click(screen.getByRole('button',{name:'Open local replay'}));
  await waitFor(()=>expect(replay.scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'}));
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  events.scrollIntoView=vi.fn();
  fireEvent.click(screen.getByRole('button',{name:'Open event inspector'}));
  await waitFor(()=>expect(events.scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'}));
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
  await waitFor(()=>expect(path.textContent).toContain('Image frames loaded'));
  fireEvent.click(screen.getByRole('button',{name:/Imagery & sources Channels/}));
  expect(screen.getByRole('region',{name:'Observation and flare timeline'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  expect(path.textContent).toContain('No event/frame selection');
  const selected=structuredClone(packageData.observationArchive);
  delete selected.archive_identity;
  selected.selected_event_context=createSolarEventImageSelection({id:'ivo://helio-informatics.org/FL_UI_1',
    event_type:'FL',start_time:selected.frames[0].obstime},0,selected.frames.length);
  const selectedText=await serializeObservationSnapshot(selected);
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(selectedText),text:async()=>selectedText}]}});
  await waitFor(()=>expect(path.textContent).toContain('Bounded selection ready'));
});
it('replays one exact frame/event/GOES selection across disk, graphs, research and globe without a positional inference',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const selected=structuredClone(packageData.observationArchive);
  delete selected.archive_identity;
  const acquired=selected.frames[0].obstime as string;
  const eventId='ivo://hek/FL_replay_context';
  selected.selected_event_context=createSolarEventImageSelection({id:eventId,event_type:'FL',
    start_time:acquired,end_time:'2026-09-27T00:05:00Z'},0,selected.frames.length);
  selected.selected_goes_window=createSolarGoesFrameWindow({frames:selected.frames,selectedFrameIndex:0,
    bins:[{start:'2026-09-26T23:55:00Z',end:acquired,mean_long:1e-7}]});
  const replay=await serializeObservationSnapshot(selected);
  const snapshotId=JSON.parse(replay).archive_identity.snapshotId as string;
  network();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),
    {target:{files:[{size:Buffer.byteLength(replay),text:async()=>replay}]}});
  await waitFor(()=>expect(screen.getByTestId('selected-archive').textContent).toBe(snapshotId));
  fireEvent.click(screen.getByRole('button',{name:'Solar disk'}));
  expect(screen.getByText(/1 selected event\/frame · 1 aligned GOES bins/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Graphs & timing'}));
  const graphs=screen.getByRole('region',{name:'Solar graphs and timing'});
  expect(graphs.textContent).toContain(eventId);
  expect(graphs.textContent).toContain(snapshotId);
  expect(graphs.querySelector('[aria-label="1 GOES XRS five-minute bins and 1 catalog flare windows aligned with the selected image frame"]')).toBeTruthy();
  expect(graphs.textContent).toContain('Time co-occurrence only');
  fireEvent.click(screen.getByRole('button',{name:'3D magnetic globe'}));
  await waitFor(()=>expect(screen.getByRole('region',{name:'3D magnetic globe'})).toBeTruthy(),{timeout:30000});
  expect(screen.getByText(/no WCS-validated positional link from the current image/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  expect(screen.getByTestId('selected-archive').textContent).toBe(snapshotId);
});
it('jumps directly to package controls when prepared and to comparison setup otherwise',async()=>{
  network();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:/Research records Interior/}));
  const fallback=document.getElementById('solar-compare')!;
  fallback.scrollIntoView=vi.fn();
  const action=screen.getByRole('button',{name:'Open package controls'});
  fireEvent.click(action);
  await waitFor(()=>expect(fallback.scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'}));

  const packageControls=document.createElement('section');
  packageControls.id='solar-compare-package';
  packageControls.scrollIntoView=vi.fn();
  document.body.appendChild(packageControls);
  fireEvent.click(action);
  await waitFor(()=>expect(packageControls.scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'}));
  packageControls.remove();
});
it('shows the default source selection while keeping specialist search controls expandable',()=>{
  network();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  const summary=screen.getByText(/Source and event options · AIA 193 Å · 3 frame\(s\)/);
  const details=summary.closest('details');
  expect(details?.open).toBe(false);
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
  expect(screen.getByText('Event types')).toBeTruthy();
  expect(screen.getByRole('button',{name:'HEK-only (maxFrames=0)'})).toBeTruthy();
});
it('reopens the actual imported observation after panel navigation and rechecks runtime without reacquisition',async()=>{
  const fetch=network();const first=render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
  await waitFor(()=>expect(screen.getByTestId('selected-archive').textContent).toMatch(/^solar-observation:/));
  const id=screen.getByTestId('selected-archive').textContent;first.unmount();render(<StarWatcherPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  expect(screen.getByTestId('selected-archive').textContent).toBe(id);
  expect(screen.getAllByText(/Previously loaded observation restored/).length).toBeGreaterThan(0);
  await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>String(url).includes('runtime-capability'))).toHaveLength(2));
  expect(fetch.mock.calls.some(([url])=>String(url).includes('sunpy-export'))).toBe(false);
  expect(screen.getByText(/^Archive replay · acquisition age/)).toBeTruthy();
  expect(screen.getByText(/Fetching does not refresh acquisition time/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Clear loaded observation'}));
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
  await waitFor(()=>expect(screen.getByTestId('selected-archive').textContent).toBe(id));
  act(()=>{window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));});
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');
});
it('does not republish a pending file read after an account-policy change',async()=>{
  network();render(<StarWatcherPanel/>);let finish!:(value:string)=>void;
  fireEvent.click(screen.getByRole('button',{name:'Browse imagery'}));
  fireEvent.change(screen.getByLabelText('Replay observation JSON (local file, maximum 8 MB)'),{target:{files:[{size:Buffer.byteLength(text),text:()=>new Promise<string>(resolve=>{finish=resolve;})}]}});
  act(()=>{window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));});
  await act(async()=>{finish(text);});
  expect(screen.getByTestId('selected-archive').textContent).toBe('none');
});
