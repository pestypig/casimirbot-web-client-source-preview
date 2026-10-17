// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {SolarObservationProcessing} from '../SolarObservationProcessing';

afterEach(cleanup);
const context={schemaVersion:'solar-display-normalization/1',processingRecipe:'sunpy_resample_percentile_99_5_clip_v1',
  scale:200,scaleSelection:'positive_pixel_percentile',percentile:99.5,inputUnitDeclared:'DN',fitsExptimeSecondsDeclared:2,
  exposureCorrectionApplied:false,radiometricCalibrationApplied:false,clippedToUnitInterval:true,
  originalPixelsRecoverable:false,sourceIdentityAuthenticated:false};
it('does not invent calibration for a legacy frame',()=>{
  render(<SolarObservationProcessing frame={{display_processing:context.processingRecipe}} />);
  expect(screen.getByText(/unavailable in this legacy frame/)).toBeTruthy();
  expect(screen.getByText(/Cross-frame brightness correlations/)).toBeTruthy();
});
it('renders recorded context as declarations, not physical intensity authority',()=>{
  const {rerender}=render(<SolarObservationProcessing frame={{display_processing:context.processingRecipe,display_normalization:context}} />);
  expect(screen.getByText(/Recorded display scale: 200/)).toBeTruthy();
  expect(screen.getByText(/Declared FITS input unit: DN.*EXPTIME: 2 s/)).toBeTruthy();
  expect(screen.getByText(/metadata declarations are not authenticated calibration/)).toBeTruthy();
  rerender(<SolarObservationProcessing frame={{display_processing:context.processingRecipe,
    display_normalization:{...context,inputUnitDeclared:null,fitsExptimeSecondsDeclared:null}}} />);
  expect(screen.getByText(/Declared FITS input unit: Unavailable.*EXPTIME: Unavailable/)).toBeTruthy();
});
it('rejects recipe mismatch or calibration promotion visibly',()=>{
  render(<SolarObservationProcessing frame={{display_processing:context.processingRecipe,
    display_normalization:{...context,radiometricCalibrationApplied:true}}} />);
  expect(screen.getByText(/Display processing context rejected/)).toBeTruthy();
  expect(screen.queryByText(/Recorded display scale/)).toBeNull();
});
