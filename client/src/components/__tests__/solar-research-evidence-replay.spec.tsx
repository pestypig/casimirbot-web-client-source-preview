// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {loadLocalPrimaryObservation} from '../../../../server/services/solar-research/primary-observation';
import {prepareSolarResearchExport} from '../../../../shared/solar-research-export';
import {prepareSolarResearchEvidencePackage} from '../../../../shared/solar-research-evidence-package';
import {prepareSolarResearchLiterature} from '../../../../shared/solar-research-literature';
import {prepareSolarBenchmarkSelection} from '../../../../shared/solar-research-benchmark';
import {SolarResearchEvidenceReplay} from '../SolarResearchEvidenceReplay';
import * as sequenceDiagnostic from '../../../../shared/solar-observation-sequence';
import {syntheticSolarPortablePackage} from '../../../../tests/fixtures/solar-portable-package';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const syntheticPackageJson=await syntheticSolarPortablePackage(true);
const source='.tmp/solar-live-evidence-yJ7Mk1/verified-replay.json';
const present=existsSync(source)&&existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
it('isolates a rejected timing diagnostic without losing verified comparison evidence',async()=>{
  vi.stubGlobal('crypto',webcrypto);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.spyOn(sequenceDiagnostic,'inspectSolarObservationSequence').mockImplementation(()=>{throw new Error('Invalid acquisition calendar time');});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  render(<SolarResearchEvidenceReplay />);
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:syntheticPackageJson}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Archive acquisition sequence unavailable'));
  expect(screen.getByRole('table',{name:'Portable replay numerical comparison'})).toBeTruthy();
  expect(screen.queryByLabelText('Archive acquisition sequence diagnostic')).toBeNull();
  expect(screen.getByText('Retain evidence package in profile')).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it('retains the exact verified imported bytes only after an explicit save',async()=>{
  const original=syntheticPackageJson;
  const packageJson=' \n'+original+'\n\t';
  const indexId=JSON.parse(original).index.indexId;
  const packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
  expect(packageId).not.toBe('solar-package:'+createHash('sha256').update(original).digest('hex'));
  const reply=(body:unknown)=>({ok:true,json:async()=>body});
  const fetcher=vi.fn()
    .mockResolvedValueOnce(reply({session:{profile:{profile_id:'test-profile'}},account_policy:{account_type:'developer'}}))
    .mockResolvedValueOnce(reply({ok:true,saved:true,profileId:'test-profile',packageId,indexId,
      scientificAdmission:false,scienceRunAllowed:false}));
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',fetcher);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  render(<SolarResearchEvidenceReplay />);
  expect(screen.queryByText('Retain evidence package in profile')).toBeNull();
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:packageJson}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByText('Retain evidence package in profile')).toBeTruthy());
  expect(screen.getByText(`Index: ${indexId}`)).toBeTruthy();
  expect(screen.getByText('Single acquisition: no time series.')).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Retain evidence package in profile'));
  await waitFor(()=>expect(screen.getByText(/Retained package:/)).toBeTruthy());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe('/api/account/solar-research/packages');
  expect(fetcher.mock.calls[1][1].method).toBe('POST');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expected_profile_id:'test-profile',packageJson});
  expect((screen.getByLabelText('Retained evidence package ID') as HTMLInputElement).value).toBe(packageId);
});
it('makes a replayed event/image selection inspectable without treating it as a live HEK feed',async()=>{
  vi.stubGlobal('crypto',webcrypto);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  render(<SolarResearchEvidenceReplay />);
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),
    {target:{value:await syntheticSolarPortablePackage(true,true)}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByRole('region',{name:'Selected event image context'})).toBeTruthy());
  const inspector=screen.getByRole('region',{name:'Selected event image context'});
  expect(inspector.textContent).toContain('AR_fixture');
  expect(inspector.textContent).toContain('Saved selection image');
  expect(inspector.textContent).toContain('fixture method');
  expect(inspector.textContent).toContain('within reported interval: yes');
  expect(inspector.textContent).toContain('replay preserves this selection only');
  expect(fetcher).not.toHaveBeenCalled();
});
it('exports and reopens an exact frame recipe without acquiring or running a model',async()=>{
  vi.stubGlobal('crypto',webcrypto);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  render(<SolarResearchEvidenceReplay />);
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:syntheticPackageJson}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByLabelText('Current solar disk view recipe JSON')).toBeTruthy());
  const recipe=JSON.parse((screen.getByLabelText('Current solar disk view recipe JSON') as HTMLTextAreaElement).value);
  expect(recipe.fieldLines).toBe('off');expect(recipe.quantitativeJoinAllowed).toBe(false);
  fireEvent.change(screen.getByLabelText('Paste solar disk view recipe JSON'),{target:{value:JSON.stringify(recipe)}});
  fireEvent.click(screen.getByText('Reopen view recipe in this package'));
  await waitFor(()=>expect(screen.getByText(/Exact archived frame reopened/)).toBeTruthy());
  expect(fetcher).not.toHaveBeenCalled();
});
it.skipIf(!present)('reopens actual data without a current session and rejects changed package evidence',async()=>{
  vi.stubGlobal('crypto',webcrypto);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const putImageData=vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData,
  } as unknown as CanvasRenderingContext2D);
  const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
  const bundle=await prepareSolarResearchExport(record),archive=JSON.parse(readFileSync(source,'utf8'));
  const literature=await prepareSolarResearchLiterature(bundle);
  const benchmark=await prepareSolarBenchmarkSelection(bundle,{schemaVersion:'solar-benchmark-selection/1',recordId:bundle.recordId,
    question:'Replay UI test: declared selection only',frozenAt:'2026-09-26T23:00:00Z',informationCutoff:'2026-09-26T20:00:00Z',
    observationAvailableAt:'2026-09-26T19:00:00Z',kernelsAvailableAt:'2026-09-26T19:00:00Z',modelAvailableAt:null,
    calibrationRows:[],evaluationRows:record.rows.map(row=>row.authorRow),excludedRows:[],
    availabilityProvenance:'operator_declared_not_authenticated',freezeAuthority:'content_identity_only_not_authenticated_preregistration'});
  const prepared=await prepareSolarResearchEvidencePackage(bundle,archive,{literature,benchmark});
  render(<SolarResearchEvidenceReplay />);
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:prepared.packageJson}});
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByRole('table',{name:'Portable replay numerical comparison'})).toBeTruthy());
  expect(screen.getAllByRole('row')).toHaveLength(38);
  expect(screen.getByText(`Index: ${prepared.indexId}`)).toBeTruthy();
  expect(screen.getByText(`Comparison: ${bundle.recordId}`)).toBeTruthy();
  expect(screen.getByRole('link',{name:'Fresh insights on the structure of the solar core'}).getAttribute('href')).toBe('https://arxiv.org/abs/0905.0651v2');
  expect((screen.getByLabelText('Replayed paper BibTeX') as HTMLTextAreaElement).value).toBe(literature!.bibtex);
  expect((screen.getByLabelText('Replayed benchmark selection JSON') as HTMLTextAreaElement).value).toBe(benchmark.planJson);
  expect(screen.getByRole('region',{name:'Portable archive frame context'})).toBeTruthy();
  expect(screen.getByText(/Acquired: 2026-09-26T22:27:04.842Z/)).toBeTruthy();
  expect(screen.getByText(/Recorded display scale: 2106.58349609375/)).toBeTruthy();
  expect(screen.getByLabelText('Observed solar instrument raster').getAttribute('width')).toBe('32');
  expect(putImageData).toHaveBeenCalledOnce();
  expect(putImageData.mock.calls[0][0].data).toHaveLength(32*32*4);
  fireEvent.click(screen.getByText('Prepare replay paper figure and table'));
  await waitFor(()=>expect(screen.getByLabelText('Replay numerical table CSV')).toBeTruthy());
  expect((screen.getByLabelText('Replay numerical table CSV') as HTMLTextAreaElement).value).toBe(bundle.tableCsv);
  const manifest=JSON.parse((screen.getByLabelText('Replay figure provenance JSON') as HTMLTextAreaElement).value);
  expect(manifest.recordId).toBe(bundle.recordId);
  expect(manifest.modelDifference).toBeNull();
  const changed=JSON.parse(prepared.packageJson);changed.comparison.tableCsv+='wrong';
  fireEvent.change(screen.getByLabelText('Portable evidence package draft'),{target:{value:JSON.stringify(changed)}});
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByLabelText('Replay paper figure SVG')).toBeNull();
  fireEvent.click(screen.getByText('Verify portable evidence package'));
  await waitFor(()=>expect(screen.getByText(/mismatch/)).toBeTruthy());
  expect(fetcher).not.toHaveBeenCalled();
});
