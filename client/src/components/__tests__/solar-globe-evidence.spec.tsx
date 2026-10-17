// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {SolarGlobePanel} from '../SolarGlobePanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('labels the actual Globe animation as an illustration, not an evolution run',()=>{
  // jsdom lacks the layout observer used by the real Radix slider.
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  render(<SolarGlobePanel />);
  expect(screen.getByText('Illustration · Available')).toBeTruthy();
  expect(screen.getByText(/Animation seconds, not stellar evolutionary time/)).toBeTruthy();
  expect(screen.getByText(/radius deviations visually magnified ninefold/)).toBeTruthy();
  expect(screen.getByText(/not a conservative stellar evolution solution/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Inject H'})).toBeTruthy();
});
