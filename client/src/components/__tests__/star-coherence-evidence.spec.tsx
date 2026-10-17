// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
vi.mock('@/hooks/useDebateTelemetry',()=>({useCoherenceTelemetry:()=>({data:null,status:'ready',error:null,refresh:vi.fn()})}));
import {StarCoherencePanel} from '../agi/StarCoherencePanel';
afterEach(()=>{cleanup();window.localStorage.clear();});
it('does not promote session gate terminology to stellar measurement authority',()=>{
  render(<StarCoherencePanel />);
  expect(screen.getByText('Operational telemetry · Missing')).toBeTruthy();
  expect(screen.getByText(/not physical stellar equilibrium/)).toBeTruthy();
  expect(screen.getByText(/default hold\/threshold values are not observations/)).toBeTruthy();
});
