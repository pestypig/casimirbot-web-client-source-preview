// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SolarActiveRegionCatalog} from '../SolarActiveRegionCatalog';

afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

const report={
  schemaVersion:'solar-active-regions-current/1',complete:true,
  sourceUrl:'https://services.swpc.noaa.gov/text/srs.txt',
  sourceSha256:'a'.repeat(64),
  issuedAt:'2026-10-10T00:30:00Z',validAt:'2026-10-10T00:00:00Z',fetchedAt:'2026-10-10T13:00:00Z',
  regions:[
    {noaaNumber:4545,latitudeDeg:18,centralMeridianDistanceDeg:46,carringtonLongitudeDeg:222,location:'N18W46',spotCount:5,
      spotClass:'CAO',magneticClass:'BETA',areaMillionths:70,category:'sunspot'},
    {noaaNumber:4550,latitudeDeg:-12,centralMeridianDistanceDeg:-23,carringtonLongitudeDeg:159,location:'S12E23',spotCount:null,
      spotClass:null,magneticClass:null,areaMillionths:null,category:'plage'},
  ],
};

it('loads source-timed NOAA regions, distinguishes plage, and opens a report detail without image registration claims',async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>report}));
  vi.stubGlobal('fetch',fetch);
  const onShowMagnetogram=vi.fn();
  render(<SolarActiveRegionCatalog onShowMagnetogram={onShowMagnetogram}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:/NOAA 4545/})).toBeTruthy());
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/star-watcher/active-regions/current');
  expect(screen.getByText(/positions are report coordinates, not registered to the image above/)).toBeTruthy();
  expect(screen.getByText(/1 plage-only regions omitted/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/NOAA 4550/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/NOAA 4545/}));
  const detail=screen.getByRole('region',{name:'NOAA 4545 report details'});
  expect(detail.textContent).toContain('BETA');
  expect(detail.textContent).toContain('Carrington longitude: 222°');
  expect(detail.textContent).toContain('not a measured 3D magnetic field');
  fireEvent.click(screen.getByRole('button',{name:'View whole-disk magnetogram'}));
  expect(onShowMagnetogram).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link',{name:'Open NOAA source report'}).getAttribute('href')).toBe(report.sourceUrl);
});

it('rejects an incomplete report instead of displaying a partial catalog',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...report,complete:false})})));
  render(<SolarActiveRegionCatalog onShowMagnetogram={()=>{}}/>);
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('unavailable'));
  expect(screen.queryByRole('button',{name:/NOAA 4545/})).toBeNull();
});
