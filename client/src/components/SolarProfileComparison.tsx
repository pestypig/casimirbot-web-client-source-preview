import React, { useEffect, useRef, useState } from 'react';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '../lib/workstation/accountCapabilityPolicy';
import { SolarResearchComparisonRecord } from './SolarResearchComparisonRecord';
import { SolarComparisonReadiness } from './SolarComparisonReadiness';
import { SolarEvidenceStatus } from './SolarEvidenceStatus';
import { compareProfiles, validateProfile, type SolarRadialDisplayProfile } from '../../../public/solar-workstation-comparison.js';

const profileGridStyle: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
};

function ProfilePlot({ label, points, units }: {
  label: string; points?: Array<{r: number; value: number}>; units?: string;
}) {
  if (!points) return <p className="text-sm text-slate-400">No compatible data loaded.</p>;
  const values = points.map(p => p.value);
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const line = points.map(p => `${40 + p.r * 490},${210 - (p.value - low) / span * 170}`).join(' ');
  return <svg role="img" aria-label={label} viewBox="0 0 550 250" className="w-full bg-slate-950 rounded">
    <path d="M40 25 V210 H535" fill="none" stroke="#64748b" />
    <polyline points={line} fill="none" stroke="#67e8f9" strokeWidth="2" />
    <text x="44" y="20" fill="#cbd5e1" fontSize="12">{units} · range {low.toPrecision(3)} to {high.toPrecision(3)}</text>
    <text x="44" y="238" fill="#cbd5e1" fontSize="12">r / declared reference radius</text>
  </svg>;
}

export function SolarProfileComparison({observationArchive,selectedRecordId,selectedLocalBundle}:{observationArchive?:unknown;selectedRecordId?:string;selectedLocalBundle?:unknown}={}) {
  const [observed, setObserved] = useState<SolarRadialDisplayProfile>();
  const [model, setModel] = useState<SolarRadialDisplayProfile>();
  const [error, setError] = useState('');
  const importGeneration = useRef({ observed: 0, model: 0 });
  useEffect(() => {
    const invalidate=()=>{importGeneration.current.observed++;importGeneration.current.model++;};
    const changed=()=>{invalidate();setObserved(undefined);setModel(undefined);setError('Account changed; imported radial profiles cleared.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return ()=>{invalidate();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);};
  },[]);
  async function ingest(file: File | undefined, kind: 'observed' | 'model') {
    const generation = ++importGeneration.current[kind];
    // A new selection immediately removes the old side from comparison.
    if (kind === 'observed') setObserved(undefined); else setModel(undefined);
    setError('');
    try {
      if (!file || file.size > 2_000_000) throw new Error('Select a JSON file no larger than 2 MB');
      const profile = validateProfile(JSON.parse(await file.text()));
      if (generation !== importGeneration.current[kind]) return;
      if (profile.sourceKind !== kind) throw new Error(`Expected ${kind} data; demo data is not evidence`);
      if (kind === 'observed') setObserved(profile); else setModel(profile);
      setError('');
    } catch (failure) {
      if (generation !== importGeneration.current[kind]) return;
      // Invalidate the selected side rather than quietly retaining stale results.
      if (kind === 'observed') setObserved(undefined); else setModel(undefined);
      setError(failure instanceof Error ? failure.message : 'Invalid profile');
    }
  }
  let residuals: Array<{r: number; value: number}> | undefined;
  let blocked = '';
  if (observed && model) {
    try { residuals = compareProfiles(observed, model); }
    catch (failure) { blocked = failure instanceof Error ? failure.message : 'Comparison rejected'; }
  }
  return <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3">
    <SolarComparisonReadiness observedLoaded={!!observed} modelLoaded={!!model}
      contextLoaded={observationArchive!==undefined&&observationArchive!==null} />
    <h2 className="text-lg font-semibold">Stellar structure comparison</h2>
    <SolarEvidenceStatus kind="Derived diagnostic" availability={residuals?'Available':blocked||error?'Rejected':'Missing'}
      provenance="Imported source hashes are declarations, not authenticated solver receipts."
      quantity={model?`${model.quantity} · ${model.units}`:undefined}
      coordinates="r / declared reference radius; comparison requires identical samples."
      processing="Dimensional model minus observation; not a helioseismic forward operator."
      uncertainty="Observational uncertainties and covariance are not evaluated."
      limitations="No calibrated baseline, fit score, lifetime claim or G1 admission is implied." />
    <p className="text-xs text-amber-200">Plots use independent vertical scales. Similar shapes do not establish equal magnitudes or scientific agreement; compare the displayed ranges and numerical residual.</p>
    <p className="text-sm text-slate-400">Import solar-radial-display/1 JSON. Source hashes are declarations, not authenticated solver receipts. A 1D interior is not an EUV image prediction. This diagnostic does not admit a G1 baseline.</p>
    <div className="grid min-w-0 gap-4" style={profileGridStyle}>
      {(['observed', 'model'] as const).map(kind => <label key={kind} className="min-w-0 space-y-2 text-sm">
        {kind === 'observed' ? 'Observed radial profile' : 'Model radial profile'}
        <input aria-label={kind === 'observed' ? 'Observed radial profile' : 'Model radial profile'}
          type="file" accept=".json,application/json" className="block w-full"
          onChange={event => { void ingest(event.target.files?.[0], kind); }} />
      </label>)}
    </div>
    <div className="grid min-w-0 gap-4" style={profileGridStyle}>
      {([observed, model] as const).map((profile, i) => <div key={i} className="min-w-0 space-y-2">
        <h3>{profile?.label ?? (i === 0 ? 'Observed structure' : 'Model structure')}</h3>
        <ProfilePlot label={i === 0 ? 'Observed radial plot' : 'Model radial plot'} points={profile?.points} units={profile?.units} />
        {profile && <p className="text-xs break-all text-slate-400">Reference radius: {profile.referenceRadiusM} m · source SHA256: {profile.sourceSha256}</p>}
      </div>)}
    </div>
    <h3>Model − observation</h3>
    <ProfilePlot label="Dimensional radial residual" points={residuals} units={model?.units} />
    <p role="status" className="text-sm text-amber-200">{error || blocked || (residuals
      ? 'Aligned dimensional residual only; observational uncertainties and G1 acceptance are not evaluated.'
      : 'Waiting for compatible observed and model profiles. No calibrated baseline is implied.')}</p>
    <SolarResearchComparisonRecord observationArchive={observationArchive} selectedRecordId={selectedRecordId} selectedLocalBundle={selectedLocalBundle} />
    <SolarResearchEvidenceReplay />
  </section>;
}
import {SolarResearchEvidenceReplay} from './SolarResearchEvidenceReplay';
