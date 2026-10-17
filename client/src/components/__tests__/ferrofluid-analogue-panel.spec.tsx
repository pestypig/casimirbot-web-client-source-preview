// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import FerrofluidAnaloguePanel from '../../pages/ferrofluid-analogue-panel';

afterEach(cleanup);

it('exposes an honest toy with separate offset and surround controls',()=>{
  render(<FerrofluidAnaloguePanel/>);
  expect(screen.getByText('Ferrofluid globe analogue')).toBeTruthy();
  expect(screen.getByText(/No coil commands, surface-shape prediction/)).toBeTruthy();
  expect(screen.getByText(/Solar globe binding: none/)).toBeTruthy();
  expect(screen.getByText(/current colored-dot toy is static/)).toBeTruthy();
  expect(screen.getByText(/predicts only one generalized displacement and phase/)).toBeTruthy();
  expect(screen.getByLabelText('Local camera-compensated surface registration')).toBeTruthy();
  expect(screen.getByLabelText('Open local camera registration manifest')).toBeTruthy();
  expect(screen.getByText(/no frame or manifest is sent to a service/)).toBeTruthy();
  const offset=screen.getByRole('slider',{name:/Flask center offset/});
  fireEvent.change(offset,{target:{value:'7'}});
  expect((offset as HTMLInputElement).value).toBe('7');
  expect(screen.getByRole('slider',{name:/Surrounding field/})).toBeTruthy();
});

it('exposes measured provenance and updates the bounded offset hypothesis',()=>{
  render(<FerrofluidAnaloguePanel/>);
  expect(screen.getByText(/The phone trace contains a dominant/)).toBeTruthy();
  expect(screen.getByText(/The 17.98 s arc video has not been synchronized/)).toBeTruthy();
  expect(screen.getByText(/container records 2026-10-02 while the CSV filename says 2026-10-04/)).toBeTruthy();
  expect(screen.getByText(/One reviewer marked broad edge ranges/)).toBeTruthy();
  expect(screen.getByText(/No independent annotation, fixed camera/)).toBeTruthy();
  expect(screen.getByText(/Same-recording check: disjoint 10 s Bz fits/)).toBeTruthy();
  expect(screen.getByText(/Three-axis check: a single-frequency fit/)).toBeTruthy();
  expect(screen.getByText(/Amplitude countercheck: the fitted phone-vector ellipse major axis/)).toBeTruthy();
  expect(screen.getByText(/Frequency and ellipse shape persist better than amplitude/)).toBeTruthy();
  expect(screen.getByText(/starting 32.46 Hz value is deliberately tuned/)).toBeTruthy();
  expect(screen.getByText(/This ratio assumes equal forcing amplitudes/)).toBeTruthy();
  const mode=screen.getByRole('slider',{name:/Candidate coupled-mode frequency/});
  fireEvent.change(mode,{target:{value:'28.98'}});
  expect((mode as HTMLInputElement).value).toBe('28.98');
  expect(screen.getByText(/This band does not identify the actual offset/)).toBeTruthy();
  expect(screen.getByText(/These alternatives are not ranked by the available evidence/)).toBeTruthy();
  expect(screen.getByRole('link',{name:'Open exact magnetometer CSV source'}).getAttribute('href')).toContain('1CN2kiOEaU2rsQDE2nLnRJ3yYGKLzIntZ');
  const offset=screen.getByRole('slider',{name:/Candidate signed offset/});
  fireEvent.change(offset,{target:{value:'0'}});
  expect((offset as HTMLInputElement).value).toBe('0');
  expect(screen.getByText('0.000')).toBeTruthy();
});

it('keeps a blank independent-repeat import inconclusive',async()=>{
  render(<FerrofluidAnaloguePanel/>);
  const download=screen.getByRole('link',{name:'Download blank repeat-pair JSON'});
  const href=download.getAttribute('href')??'';
  expect(href).toContain('data:application/json');
  const template=decodeURIComponent(href.split(',')[1]);
  expect(JSON.parse(template).schemaVersion).toBe('ferrofluid-arc-repeat-pair/2');
  expect(JSON.parse(template).declaredPreregisteredBeforeBothCaptures).toBe(false);
  expect(JSON.parse(template).matchedControlTolerance.plateToRingHeightMm).toBe(null);
  expect(JSON.parse(template).predictedArcContrast).toBe(null);
  expect(JSON.parse(template).assumptions.phoneFrequencyTracksRotor).toBe(false);
  const file=new File([template],'repeat-pair.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>template});
  fireEvent.change(screen.getByLabelText('Open local independent repeat-pair JSON'),{target:{files:[file]}});
  expect(await screen.findByText(/Inconclusive pair/)).toBeTruthy();
  expect(screen.getByLabelText('Open local repeat source files for hash verification')).toBeTruthy();
  expect(screen.getByText(/Streaming SHA-256 avoids loading whole videos/)).toBeTruthy();
  expect(screen.getByText(/does not verify source bytes or preregistration time/)).toBeTruthy();
});

it('shows the external-clip surrogate without promoting it to a field or jet solve',()=>{
  render(<FerrofluidAnaloguePanel/>);
  expect(screen.getByText('External magnet response · image-plane simulation')).toBeTruthy();
  expect(screen.getByText('5 / 600')).toBeTruthy();
  expect(screen.getByText(/Inspect projected approach trace/)).toBeTruthy();
  expect(screen.getByText(/frame-level reproduction is/)).toBeTruthy();
  expect(screen.getByText(/not selected as an identified apparatus mechanism/)).toBeTruthy();
  expect(screen.getByText(/not a magnetic reconnection or jet simulation/)).toBeTruthy();
  expect(screen.getByRole('img',{name:/Simulated projected open-loop span/})).toBeTruthy();
  const download=screen.getByRole('link',{name:'Download reproducible analysis JSON'});
  const artifact=JSON.parse(decodeURIComponent((download.getAttribute('href')??'').split(',')[1]));
  expect(artifact.schemaVersion).toBe('ferrofluid-external-arc-analysis/1');
  expect(artifact.evidence.sourceSha256).toBe('9692FB9D3873E52B17F868C0FA29D1235FED2DCF1D58D435DC974594EED96E3B');
  expect(artifact.fit.measuredFieldInput).toBe(false);
  expect(artifact.crownSeriesCheck.validationWithinMethodRange).toBe(1);
  expect(artifact.twoLagCandidate.selectedForDisplayedCurve).toBe(false);
});
