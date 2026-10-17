// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import StarHydrostaticPanel from '../../pages/star-hydrostatic-panel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('discloses the actual reduced-order solver and time/uncertainty limits',()=>{
  vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
  render(<StarHydrostaticPanel />);
  expect(screen.getByText(/Both solver selections currently use the polytrope builder/)).toBeTruthy();
  expect(screen.getByText(/no stellar evolutionary time integration/)).toBeTruthy();
  expect(screen.getByText(/not an evolving solar baseline/)).toBeTruthy();
  expect(screen.getByText(/No observational fit, covariance/)).toBeTruthy();
});
