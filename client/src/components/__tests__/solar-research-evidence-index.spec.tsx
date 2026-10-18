// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {loadLocalPrimaryObservation} from '../../../../server/services/solar-research/primary-observation';
import {prepareSolarResearchExport} from '../../../../shared/solar-research-export';
import {createSolarEventImageSelection} from '../../../../shared/solar-event-image-selection';
import {syntheticSolarPortablePackage} from '../../../../tests/fixtures/solar-portable-package';
import {SolarResearchEvidenceIndex} from '../SolarResearchEvidenceIndex';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const source='.tmp/solar-live-evidence-yJ7Mk1/verified-replay.json';
const present=existsSync(source)&&existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&
  existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
it.skipIf(!present)('prepares only on explicit click and invalidates an index after archive replacement',async()=>{
  vi.stubGlobal('crypto',webcrypto);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
  const bundle=await prepareSolarResearchExport(record),archive=JSON.parse(readFileSync(source,'utf8'));
  const {rerender}=render(<SolarResearchEvidenceIndex bundle={bundle} archive={archive} />);
  expect(screen.queryByLabelText('Interconnected evidence index JSON')).toBeNull();
  fireEvent.click(screen.getByText('Prepare interconnected evidence index'));
  await waitFor(()=>expect(screen.getByLabelText('Interconnected evidence index JSON')).toBeTruthy());
  const result=JSON.parse((screen.getByLabelText('Interconnected evidence index JSON') as HTMLTextAreaElement).value);
  expect(JSON.parse(result.manifestJson).observationArchive.snapshotId).toBe(archive.archive_identity.snapshotId);
  rerender(<SolarResearchEvidenceIndex bundle={bundle} />);
  expect(screen.queryByLabelText('Interconnected evidence index JSON')).toBeNull();
  fireEvent.click(screen.getByText('Prepare interconnected evidence index'));
  await waitFor(()=>expect(screen.getByLabelText('Interconnected evidence index JSON')).toBeTruthy());
  const replaced=JSON.parse((screen.getByLabelText('Interconnected evidence index JSON') as HTMLTextAreaElement).value);
  expect(JSON.parse(replaced.manifestJson).observationArchive).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Prepare portable evidence replay package'));
  await waitFor(()=>expect(screen.getByLabelText('Portable evidence replay package JSON')).toBeTruthy());
  const portable=JSON.parse((screen.getByLabelText('Portable evidence replay package JSON') as HTMLTextAreaElement).value);
  expect(portable.observationArchive).toBeNull();
  expect(portable.comparison.recordId).toBe(bundle.recordId);
  rerender(<SolarResearchEvidenceIndex bundle={bundle} archive={archive} />);
  expect(screen.queryByLabelText('Portable evidence replay package JSON')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('prepares a selected event and image as bounded package context, then clears it when the selection changes',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const original=JSON.parse(await syntheticSolarPortablePackage(true));
  const archive=structuredClone(original.observationArchive);
  delete archive.archive_identity;
  const selection=createSolarEventImageSelection({id:'ivo://hek/FL-ui-example',event_type:'FL',
    start_time:archive.frames[0].obstime,frm_name:'catalog reporter'},0,archive.frames.length)!;
  archive.selected_event_context=selection;
  const {rerender}=render(<SolarResearchEvidenceIndex bundle={original.comparison} archive={archive} />);
  expect(screen.getByText(/Selected event ivo:\/\/hek\/FL-ui-example will be included/)).toBeTruthy();
  fireEvent.click(screen.getByText('Prepare portable evidence replay package'));
  await waitFor(()=>expect(screen.getByLabelText('Portable evidence replay package JSON')).toBeTruthy());
  const packaged=JSON.parse((screen.getByLabelText('Portable evidence replay package JSON') as HTMLTextAreaElement).value);
  expect(packaged.observationArchive.selected_event_context).toEqual(selection);
  expect(packaged.observationArchive.events).toEqual([]);
  expect(JSON.parse(packaged.index.manifestJson).observationArchive.selectedEventContext).toEqual(selection);
  expect(packaged.index.indexId).toMatch(/^solar-evidence-index:[a-f0-9]{64}$/);

  const withoutSelection=structuredClone(archive);
  delete withoutSelection.selected_event_context;
  rerender(<SolarResearchEvidenceIndex bundle={original.comparison} archive={withoutSelection} />);
  expect(screen.queryByLabelText('Portable evidence replay package JSON')).toBeNull();
  fireEvent.click(screen.getByText('Prepare portable evidence replay package'));
  await waitFor(()=>expect(screen.getByLabelText('Portable evidence replay package JSON')).toBeTruthy());
  const replacement=JSON.parse((screen.getByLabelText('Portable evidence replay package JSON') as HTMLTextAreaElement).value);
  expect(replacement.observationArchive.selected_event_context).toBeUndefined();
  expect(JSON.parse(replacement.index.manifestJson).observationArchive.selectedEventContext).toBeUndefined();
  expect(replacement.index.indexId).not.toBe(packaged.index.indexId);
});

it('reopens the exact retained package beside the preparation controls without promoting its claim',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const original=JSON.parse(await syntheticSolarPortablePackage(true));
  const archive=structuredClone(original.observationArchive);
  delete archive.archive_identity;
  archive.selected_event_context=createSolarEventImageSelection({id:'ivo://hek/AR-reopen',event_type:'AR',
    start_time:archive.frames[0].obstime,frm_name:'catalog reporter'},0,archive.frames.length)!;
  const {rerender}=render(<SolarResearchEvidenceIndex bundle={original.comparison} archive={archive} />);
  fireEvent.click(screen.getByText('Prepare portable evidence replay package'));
  await waitFor(()=>expect(screen.getByLabelText('Portable evidence replay package JSON')).toBeTruthy());
  const packageJson=(screen.getByLabelText('Portable evidence replay package JSON') as HTMLTextAreaElement).value;
  const packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
  const indexId=JSON.parse(packageJson).index.indexId;
  const fetcher=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>({session:{profile:{profile_id:'test-profile'}},account_policy:{account_type:'developer'}})})
    .mockResolvedValueOnce({ok:true,json:async()=>({ok:true,profileId:'test-profile',packageId,indexId,
      scientificAdmission:false,scienceRunAllowed:false,packageJson})});
  vi.stubGlobal('fetch',fetcher);
  fireEvent.change(screen.getByLabelText('Retained evidence package ID'),{target:{value:packageId}});
  fireEvent.click(screen.getByText('Reopen retained evidence package'));
  await waitFor(()=>expect(screen.getByRole('region',{name:'Reopened profile evidence summary'}).textContent)
    .toContain('ivo://hek/AR-reopen'));
  const summary=screen.getByRole('region',{name:'Reopened profile evidence summary'});
  expect(summary.textContent).toContain('No quantitative image/interior join or model fit.');
  expect(summary.textContent).toContain('solar-observation:');
  expect(fetcher).toHaveBeenCalledTimes(2);

  const replaced=structuredClone(archive);
  delete replaced.selected_event_context;
  rerender(<SolarResearchEvidenceIndex bundle={original.comparison} archive={replaced} />);
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Reopened profile evidence summary'})).toBeNull());
});
