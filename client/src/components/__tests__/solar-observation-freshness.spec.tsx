// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,act,cleanup} from '@testing-library/react';
import {SolarObservationFreshness} from '../SolarObservationFreshness';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('ages an archive acquisition without treating a recent fetch as live',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-26T20:00:00Z'));
  render(<SolarObservationFreshness acquiredAt="2026-09-26T18:00:00Z" fetchedAt="2026-09-26T20:00:00Z" replay={false} />);
  expect(screen.getByText(/Recent archive observation/)).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  expect(screen.getByText(/Stale archive observation/)).toBeTruthy();
  expect(screen.getByText(/Not a live measurement/)).toBeTruthy();
});
