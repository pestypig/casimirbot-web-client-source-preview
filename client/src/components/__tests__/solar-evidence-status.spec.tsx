// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {SolarEvidenceStatus} from '../SolarEvidenceStatus';
afterEach(cleanup);
it('keeps missing fields unavailable without manufacturing quality or validation',()=>{
  render(<SolarEvidenceStatus kind="Observation" availability="Missing" limitations="No acquisition loaded." />);
  expect(screen.getByText('Observation · Missing')).toBeTruthy();
  expect(screen.getAllByText('Unavailable / not established')).toHaveLength(6);
  expect(screen.getByText(/does not authenticate sources/)).toBeTruthy();
  expect(screen.queryByText('0%')).toBeNull();
});
it('separates illustrative availability from scientific authority',()=>{
  render(<SolarEvidenceStatus kind="Illustration" availability="Available" provenance="Local toy state" limitations="Not stellar evolution." />);
  expect(screen.getByText('Illustration · Available')).toBeTruthy();
  expect(screen.getByText('Local toy state')).toBeTruthy();
  expect(screen.getByText('Not stellar evolution.')).toBeTruthy();
});
it('can explicitly reject a diagnostic and preserve its uncertainty limitation',()=>{
  render(<SolarEvidenceStatus kind="Derived diagnostic" availability="Rejected" uncertainty="Covariance absent" limitations="Units incompatible" />);
  expect(screen.getByText('Derived diagnostic · Rejected')).toBeTruthy();
  expect(screen.getByText('Covariance absent')).toBeTruthy();
});
