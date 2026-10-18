// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {describe,it,expect,afterEach} from 'vitest';
import {SolarComparisonReadiness} from '../SolarComparisonReadiness';
afterEach(cleanup);
describe('solar comparison requirements without authority promotion',()=>{
  it('reports missing session selections, not an invented filesystem inventory',()=>{
    render(<SolarComparisonReadiness observedLoaded={false} modelLoaded={false} contextLoaded={false}/>);
    expect(screen.getByText('No radial model imported in this session.')).toBeTruthy();
    expect(screen.getByText('No radial observation imported in this session.')).toBeTruthy();
    expect(screen.getByText(/does not scan disk/)).toBeTruthy();
    expect(screen.getByText(/model minus observation at identical samples/)).toBeTruthy();
    expect(screen.getByText(/observed minus primary prediction/)).toBeTruthy();
    expect(screen.getByText(/partial reference table cannot be made complete/)).toBeTruthy();
  });
  it('does not turn loaded display inputs or imagery into physical comparison readiness',()=>{
    render(<SolarComparisonReadiness observedLoaded modelLoaded contextLoaded/>);
    expect(screen.getByText(/solver provenance not established/)).toBeTruthy();
    expect(screen.getByText(/inversion\/operator binding not established/)).toBeTruthy();
    expect(screen.getByText(/does not verify its identity/)).toBeTruthy();
    expect(screen.getByText(/EUV imagery is not a measurement/)).toBeTruthy();
    expect(screen.getByText(/No G1 admission, fit score or lifetime claim/)).toBeTruthy();
  });
});
