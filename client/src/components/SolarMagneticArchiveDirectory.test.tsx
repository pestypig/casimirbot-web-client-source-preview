// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SolarMagneticArchiveDirectory } from './SolarMagneticArchiveDirectory';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const emptyList={schemaVersion:'solar-magnetic-archive-acquisition-list/1',acquisitions:[],
  integrityStatus:'listed_receipts_not_reverified',truncated:false,scientificAdmission:false};
const account={session:{profile:{profile_id:'profile-1'}},account_policy:{account_type:'developer'}};

it('searches only on request and presents discovery without claiming acquisition', async () => {
  const fetcher = vi.fn(async (url:string) => new Response(JSON.stringify(url==='/api/account/session'?account:
    url.includes('/magnetic-archive/acquisitions')?emptyList:{
    schemaVersion: 'solar-magnetic-archive-search/1', dateUtc: '2026-09-28',
    checkedAtUtc: '2026-09-28T18:00:00.000Z',
    providers: [
      { provider: 'nso_gong', status: 'available', catalogUrl: 'https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/', providerInformationUrl:'https://nso.edu/data/nisp-data/synoptic-maps/', rightsStatus:'provider_terms_not_evaluated', reason: 'none' },
      { provider: 'lmsal_sdo', status: 'unavailable', catalogUrl: 'https://suntoday.lmsal.com/sdomedia/SunInTime/2026/09/28/fblos.fits', providerInformationUrl:'https://sdo.gsfc.nasa.gov/data/', rightsStatus:'provider_terms_not_evaluated', reason: 'transport_error' },
    ],
    products: [{ provider: 'nso_gong', providerRecordKey: 'mrzqs260928t1704c2316_265.fits.gz',
      kind: 'derived_global_radial_map', sourceUrl: 'https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/mrzqs260928t1704c2316_265.fits.gz',
      filename: 'mrzqs260928t1704c2316_265.fits.gz', filenameTimeHintUtc: '2026-09-28T17:04:00.000Z',
      observedAtUtc: null, upstreamModifiedAt: null, byteSize: null, contentSha256: null,
      qualityStatus: 'not_inspected', acquisitionState: 'not_downloaded' }],
    truncated: false, sourceIdentityAuthenticated: false, scientificAdmission: false,
    claimCeiling: 'catalog_discovery_only_not_measured_global_field_or_validated_model',
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  render(<SolarMagneticArchiveDirectory />);
  expect(fetcher.mock.calls.every(([url])=>!url.includes('/magnetic-archive/search'))).toBe(true);
  fireEvent.change(screen.getByLabelText('Magnetic archive UTC date'), { target: { value: '2026-09-28' } });
  fireEvent.click(screen.getByText('Search provider records'));
  await waitFor(() => expect(screen.getByText(/1 provider file listed/)).toBeTruthy());
  expect(fetcher.mock.calls.some(([url])=>url.includes('/magnetic-archive/search?dateUtc=2026-09-28'))).toBe(true);
  expect(screen.getByText(/Transport failed; this does not establish/)).toBeTruthy();
  expect(screen.getByText(/Search results have no downloaded bytes/)).toBeTruthy();
  expect(screen.getByText(/provider listing or raw-byte receipt alone cannot load or validate/i)).toBeTruthy();
  expect(screen.getByText('Open provider FITS (may download)')).toBeTruthy();
});

it('keeps the HMI visible-disk candidate outside the scrollable GONG map list',async()=>{
  const day='2026-09-28';
  const gong='mrzqs260928t1704c2316_265.fits.gz';
  const search={schemaVersion:'solar-magnetic-archive-search/1',dateUtc:day,checkedAtUtc:`${day}T18:00:00.000Z`,
    providers:[{provider:'nso_gong',status:'available',catalogUrl:'https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/',
      providerInformationUrl:'https://nso.edu/data/nisp-data/synoptic-maps/',rightsStatus:'provider_terms_not_evaluated',reason:'none'},
      {provider:'lmsal_sdo',status:'available',catalogUrl:'https://suntoday.lmsal.com/sdomedia/SunInTime/2026/09/28/fblos.fits',
        providerInformationUrl:'https://sdo.gsfc.nasa.gov/data/',rightsStatus:'provider_terms_not_evaluated',reason:'none'}],
    products:[{provider:'nso_gong',providerRecordKey:gong,kind:'derived_global_radial_map',
      sourceUrl:`https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/${gong}`,filename:gong,
      filenameTimeHintUtc:`${day}T17:04:00.000Z`,observedAtUtc:null,upstreamModifiedAt:null,
      byteSize:null,contentSha256:null,qualityStatus:'not_inspected',acquisitionState:'not_downloaded'},
      {provider:'lmsal_sdo',providerRecordKey:`SunInTime/${day}/fblos.fits`,kind:'measured_visible_disk_los',
        sourceUrl:'https://suntoday.lmsal.com/sdomedia/SunInTime/2026/09/28/fblos.fits',filename:'fblos.fits',
        filenameTimeHintUtc:null,observedAtUtc:null,upstreamModifiedAt:null,
        byteSize:null,contentSha256:null,qualityStatus:'not_inspected',acquisitionState:'not_downloaded'}],
    truncated:false,sourceIdentityAuthenticated:false,scientificAdmission:false,
    claimCeiling:'catalog_discovery_only_not_measured_global_field_or_validated_model'};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/account/session'?account:
    url.includes('/magnetic-archive/acquisitions')?emptyList:search),{status:200})));
  render(<SolarMagneticArchiveDirectory/>);
  fireEvent.change(screen.getByLabelText('Magnetic archive UTC date'),{target:{value:day}});
  fireEvent.click(screen.getByText('Search provider records'));
  await waitFor(()=>expect(screen.getByText(/2 provider files listed/)).toBeTruthy());
  const hmi=screen.getByRole('list',{name:'HMI visible-disk products'});
  const gongList=screen.getByRole('list',{name:'GONG global radial-map products'});
  expect(hmi.textContent).toContain('SunInTime/2026-09-28/fblos.fits');
  expect(gongList.textContent).toContain(gong);
  expect(hmi.compareDocumentPosition(gongList)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('acquires a selected record explicitly and offers the GONG globe handoff by exact receipt ID',async()=>{
  const key='mrzqs260928t1704c2316_265.fits.gz',id=`magnetic-acquisition:${'a'.repeat(64)}`;
  const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/account/session'?account:
    url.includes('/magnetic-archive/acquisitions')?emptyList:url.includes('/acquire')?{
    schemaVersion:'solar-magnetic-archive-acquisition/1',acquisitionId:id,dateUtc:'2026-09-28',
    provider:'nso_gong',providerRecordKey:key,kind:'derived_global_radial_map',
    sourceUrl:`https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/${key}`,
    retrievedAtUtc:'2026-09-28T19:00:00.000Z',sha256:'b'.repeat(64),bytes:242450,
    upstreamModifiedAt:null,observedAtUtc:null,qualityStatus:'not_inspected',
    rightsStatus:'provider_terms_not_evaluated',scientificAdmission:false,
    claimCeiling:'downloaded_bytes_only_not_inspected_fits_or_validated_field',
  }:{
    schemaVersion:'solar-magnetic-archive-search/1',dateUtc:'2026-09-28',checkedAtUtc:'2026-09-28T18:00:00.000Z',
    providers:[{provider:'nso_gong',status:'available',catalogUrl:'https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/',
      providerInformationUrl:'https://nso.edu/data/nisp-data/synoptic-maps/',rightsStatus:'provider_terms_not_evaluated',reason:'none'},
      {provider:'lmsal_sdo',status:'unavailable',catalogUrl:'https://suntoday.lmsal.com/sdomedia/SunInTime/2026/09/28/fblos.fits',
        providerInformationUrl:'https://sdo.gsfc.nasa.gov/data/',rightsStatus:'provider_terms_not_evaluated',reason:'transport_error'}],
    products:[{provider:'nso_gong',providerRecordKey:key,kind:'derived_global_radial_map',
      sourceUrl:`https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/${key}`,filename:key,
      filenameTimeHintUtc:'2026-09-28T17:04:00.000Z',observedAtUtc:null,upstreamModifiedAt:null,
      byteSize:null,contentSha256:null,qualityStatus:'not_inspected',acquisitionState:'not_downloaded'}],
    truncated:false,sourceIdentityAuthenticated:false,scientificAdmission:false,
    claimCeiling:'catalog_discovery_only_not_measured_global_field_or_validated_model',
  }),{status:url.includes('/acquire')?201:200}));
  vi.stubGlobal('fetch',fetcher);
  const open=vi.fn();render(<SolarMagneticArchiveDirectory onOpenGongMap={open}/>);
  fireEvent.change(screen.getByLabelText('Magnetic archive UTC date'),{target:{value:'2026-09-28'}});
  fireEvent.click(screen.getByText('Search provider records'));
  await waitFor(()=>expect(screen.getByText('Acquire exact source bytes')).toBeTruthy());
  fireEvent.click(screen.getByText('Acquire exact source bytes'));
  await waitFor(()=>expect(screen.getByLabelText('Magnetic acquisition receipt')).toBeTruthy());
  fireEvent.click(screen.getByText('Prepare and open GONG display map on globe'));
  expect(open).toHaveBeenCalledWith(id);
  expect(fetcher.mock.calls.some(([url])=>url.includes('/magnetic-archive/acquisitions?expected_profile_id=profile-1'))).toBe(true);
});

it('reopens a retained GONG receipt without a new provider search and clears it on account change',async()=>{
  const id=`magnetic-acquisition:${'c'.repeat(64)}`;
  const receipt={schemaVersion:'solar-magnetic-archive-acquisition/1',acquisitionId:id,dateUtc:'2026-09-28',
    provider:'nso_gong',providerRecordKey:'mrzqs260928t1704c2316_265.fits.gz',kind:'derived_global_radial_map',
    sourceUrl:'https://magmap.nso.edu/oQR/zqs/202609/mrzqs260928/mrzqs260928t1704c2316_265.fits.gz',
    retrievedAtUtc:'2026-09-28T19:00:00.000Z',sha256:'d'.repeat(64),bytes:242450,
    upstreamModifiedAt:null,observedAtUtc:null,qualityStatus:'not_inspected',rightsStatus:'provider_terms_not_evaluated',
    scientificAdmission:false,claimCeiling:'downloaded_bytes_only_not_inspected_fits_or_validated_field'};
  const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/account/session'?account:
    {...emptyList,acquisitions:[receipt]}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  const open=vi.fn();render(<SolarMagneticArchiveDirectory onOpenGongMap={open}/>);
  await waitFor(()=>expect(screen.getByText(/1 retained source receipt/)).toBeTruthy());
  fireEvent.click(screen.getByText('Reverify and open GONG display map'));
  expect(open).toHaveBeenCalledWith(id);
  expect(fetcher.mock.calls.every(([url])=>!url.includes('/magnetic-archive/search'))).toBe(true);
  fireEvent(window,new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
  await waitFor(()=>expect(screen.queryByText('Reverify and open GONG display map')).toBeNull());
  expect(screen.getByText(/Account changed; refresh retained sources/)).toBeTruthy();
});

it('shows an HMI extension time and nonzero quality flag without treating it as a globe map',async()=>{
  const receipt={schemaVersion:'solar-magnetic-archive-acquisition/1',
    acquisitionId:`magnetic-acquisition:${'e'.repeat(64)}`,dateUtc:'2026-09-28',provider:'lmsal_sdo',
    providerRecordKey:'SunInTime/2026-09-28/fblos.fits',kind:'measured_visible_disk_los',
    sourceUrl:'https://suntoday.lmsal.com/sdomedia/SunInTime/2026/09/28/fblos.fits',
    retrievedAtUtc:'2026-09-28T21:00:00.000Z',sha256:'f'.repeat(64),bytes:7764480,
    upstreamModifiedAt:null,observedAtUtc:'2026-09-28T20:23:01.400Z',qualityStatus:'header_quality_nonzero',
    hmiHeader:{hduIndex:1,extensionType:'compressed_binary_table_image',observedAtUtc:'2026-09-28T20:23:01.400Z',
      qualityFlag:1024,drmsId:'lm_jps.m45s_nrt:11120854:magnetogram',
      qualityInterpretation:'numeric_flag_only_not_science_admission'},
    rightsStatus:'provider_terms_not_evaluated',scientificAdmission:false,
    claimCeiling:'downloaded_bytes_and_header_flag_only_not_validated_field'};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/account/session'?account:
    {...emptyList,acquisitions:[receipt]}),{status:200})));
  render(<SolarMagneticArchiveDirectory onOpenGongMap={vi.fn()}/>);
  await waitFor(()=>expect(screen.getByText(/HMI QUALITY 1024 \(nonzero; bits not interpreted\)/)).toBeTruthy());
  expect(screen.getByText(/header DRMS_ID lm_jps\.m45s_nrt:11120854:magnetogram/)).toBeTruthy();
  expect(screen.queryByText('Reverify and open GONG display map')).toBeNull();
  expect(screen.getByText(/reuse terms unevaluated/)).toBeTruthy();
});
