import React from 'react';
import {SolarComparisonInventory} from './SolarComparisonInventory';

/** Session readiness guidance, not a filesystem inventory or scientific gate. */
export function SolarComparisonReadiness({observedLoaded,modelLoaded,contextLoaded}:{
  observedLoaded:boolean;modelLoaded:boolean;contextLoaded:boolean;
}) {
  return <section aria-labelledby="solar-comparison-readiness-title" className="rounded-lg border border-slate-700 p-4 space-y-3">
    <h2 id="solar-comparison-readiness-title" className="text-lg font-semibold">Solar comparison input readiness</h2>
    <p className="text-sm text-slate-300">Target: one reproducible helioseismic sound-speed comparison. Session imports below are display inputs, not authenticated MESA runs or a calibrated solar baseline.</p>
    <dl className="grid gap-3 sm:grid-cols-2 text-sm">
      <div><dt className="font-semibold">Model</dt><dd>{modelLoaded?'Radial display input loaded; solver provenance not established.':'No radial model imported in this session.'}</dd></div>
      <div><dt className="font-semibold">Observations</dt><dd>{observedLoaded?'Radial display input loaded; inversion/operator binding not established.':'No radial observation imported in this session.'}</dd></div>
      <div><dt className="font-semibold">SunPy context</dt><dd>{contextLoaded?'Context archive supplied; this readiness view does not verify its identity.':'No context archive supplied.'} EUV imagery is not a measurement of the 1D interior.</dd></div>
      <div><dt className="font-semibold">Comparison authority</dt><dd>Matching display inputs can produce a dimensional diagnostic only. No G1 admission, fit score or lifetime claim.</dd></div>
    </dl>
    <SolarComparisonInventory />
    <div className="rounded border border-slate-700 p-3 text-sm space-y-2">
      <h3 className="font-semibold">Keep the two comparison products distinct</h3>
      <p>Radial overlay below: model minus observation at identical samples and dimensional units. This is not a helioseismic forward calculation.</p>
      <p>BiSON primary-term diagnostic: kernel-weighted candidate/reference sound-speed difference, followed by observed minus primary prediction. Residuals are dimensionless and omit cross terms unless separately supplied.</p>
      <p className="text-slate-400">Required historical reference support spans the selected averaging kernels, not just their displayed localization radii. A partial reference table cannot be made complete by plotting it beside the measurements.</p>
    </div>
    <details>
      <summary className="cursor-pointer font-semibold text-sm">Required inputs for the real sound-speed comparison</summary>
      <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300 mt-3">
        <li>Actual zero-transport MESA candidate: frozen inlists, solver/runtime version, solar age, convergence/termination receipt, output hashes and physical units. A parser fixture cannot substitute.</li>
        <li>Source-matched BP04 reference sound speed and Gamma1, historical radius 695980000 m, and complete selected-kernel support. Do not clip, extrapolate or substitute an assumed EOS.</li>
        <li>Bound author solution and averaging kernels; apply the declared primary-term operator to the candidate/reference difference, not direct subtraction of a raw stellar profile from inversion rows.</li>
        <li>Explicit density/cross-term treatment and covariance/systematic-error policy before uncertainty-aware scoring. Quoted row errors alone are not a joint confidence band.</li>
        <li>Save exact input identities, recipe, predicted observable and residual convention; reproduce the same record in replay, exports and an authorized read-only MCP retrieval.</li>
      </ol>
    </details>
    <p className="text-xs text-slate-400">This view reports current session selections and requirements only; it does not scan disk, launch MESA, validate an operator, or grant MCP consent. Packaging is a separate milestone.</p>
  </section>;
}
