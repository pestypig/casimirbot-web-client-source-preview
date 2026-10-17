import React from 'react';
import {SolarEvidenceStatus} from './SolarEvidenceStatus';
import {readSolarDisplayNormalization} from '../../../shared/solar-display-normalization';

export function SolarObservationProcessing({frame}:{frame?:{display_processing?:unknown;display_normalization?:unknown}}) {
  let context;
  try {context=readSolarDisplayNormalization(frame?.display_normalization,frame?.display_processing);}
  catch {return <SolarEvidenceStatus kind="Observation" availability="Rejected" limitations="Display processing context rejected. Do not use these pixels for quantitative comparison." />;}
  return <section aria-label="Observation processing context" className="text-xs space-y-1">
    <SolarEvidenceStatus kind="Observation" availability={frame?'Available':'Missing'}
      provenance="Metadata declarations only; source authentication not established."
      quantity="Normalized display pixels; not calibrated radiance."
      processing={context?.processingRecipe}
      uncertainty="Physical intensity uncertainty unavailable."
      reproduction="Display archive replay does not recover original FITS pixels."
      limitations="Observation display context only; no supported stellar-interior or physical brightness comparison." />
    <p>Display pixels are independently normalized and clipped, not calibrated radiance. Cross-frame brightness correlations and model-intensity residuals require a separate physical observation operator and calibrated source data.</p>
    {context?<>
      <p>Recorded display scale: {context.scale} · selection: {context.scaleSelection} · percentile: {context.percentile}.</p>
      <p>Declared FITS input unit: {context.inputUnitDeclared ?? 'Unavailable'} · declared EXPTIME: {context.fitsExptimeSecondsDeclared===null?'Unavailable':`${context.fitsExptimeSecondsDeclared} s`}.</p>
      <p>Recipe: {context.processingRecipe}. This display recipe applies no exposure correction or radiometric calibration. Clipped/original pixels cannot be recovered from this archive; metadata declarations are not authenticated calibration.</p>
    </>:<p className="text-amber-200">Normalization scale, input-unit and exposure context are unavailable in this legacy frame. No physical brightness comparison is supported.</p>}
  </section>;
}
