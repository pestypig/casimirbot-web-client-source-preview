// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {solarHekEventRecordUrl} from '../../../../shared/solar-hek-event-link';
import {SolarEventEvidenceInspector} from '../SolarEventEvidenceInspector';

afterEach(cleanup);

it('links a declared IVORN to its HEK registry lookup without claiming verification',()=>{
  const id='ivo://helio-informatics.org/FL_SSWLatestEvents_gev_20250507_1855';
  render(<SolarEventEvidenceInspector event={{id,event_type:'FL',start_time:'2025-05-07T18:55:00Z'}}
    frame={{obstime:'2025-05-07T18:56:00Z'}} observation={{instrument:'AIA',wavelength_A:193}} />);
  const link=screen.getByRole('link',{name:'Look up declared IVORN in the HEK event registry'}) as HTMLAnchorElement;
  expect(link.href).toBe(solarHekEventRecordUrl(id));
  expect(link.rel).toContain('noopener');
  expect(screen.getByText(/registry content and revision not checked/)).toBeTruthy();
  expect(screen.getByText(/does not establish causation/)).toBeTruthy();
});

it('does not produce an external lookup from a missing, malformed or unbounded identifier',()=>{
  for (const id of ['local-event-1','ivo://bad.example/<script>',`ivo://example.org/${'x'.repeat(513)}`])
    expect(solarHekEventRecordUrl(id)).toBeNull();
  render(<SolarEventEvidenceInspector event={{id:'local-event-1',event_type:'FL'}} frame={null} observation={null} />);
  expect(screen.queryByRole('link',{name:/HEK event registry/})).toBeNull();
});

it('shows bounded HEK-declared references as unverified navigation, not evidence',()=>{
  render(<SolarEventEvidenceInspector event={{id:'ivo://helio-informatics.org/AR_one',event_type:'AR',
    reference_urls:['N/A','https://example.org/context','javascript:alert(1)','https://example.org/context']}}
    frame={null} observation={null} />);
  const links=screen.getAllByRole('link',{name:/Reference 1/});
  expect(links).toHaveLength(1);
  expect((links[0] as HTMLAnchorElement).href).toBe('https://example.org/context');
  expect((links[0] as HTMLAnchorElement).rel).toContain('noopener');
  expect(screen.getByText(/destinations, content and revisions not verified/)).toBeTruthy();
  expect(screen.queryByRole('link',{name:/Reference 2/})).toBeNull();
});
