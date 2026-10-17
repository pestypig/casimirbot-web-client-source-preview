import React from 'react';

/** Presentation only: supplied labels never grant scientific or access authority. */
export function SolarEvidenceStatus({kind,availability,provenance,quantity,coordinates,processing,uncertainty,reproduction,limitations}:{
  kind:'Observation'|'Derived diagnostic'|'Illustration'|'Operational telemetry';
  availability:'Missing'|'Available'|'Rejected'|'Loading';
  provenance?:string;quantity?:string;coordinates?:string;processing?:string;
  uncertainty?:string;reproduction?:string;limitations:string;
}) {
  return <section aria-label={`${kind} evidence handling`} className="rounded border border-slate-700 p-3 text-xs space-y-2">
    <p className="font-semibold">{kind} · {availability}</p>
    <p>{limitations}</p>
    <details><summary className="cursor-pointer">Evidence handling details</summary>
      <dl className="mt-2 space-y-1">
        {Object.entries({Provenance:provenance,Quantity:quantity,Coordinates:coordinates,Processing:processing,
          Uncertainty:uncertainty,Reproduction:reproduction}).map(([label,value])=><div key={label}>
          <dt className="inline font-semibold">{label}: </dt><dd className="inline">{value||'Unavailable / not established'}</dd>
        </div>)}
        <div><dt className="inline font-semibold">Validation: </dt><dd className="inline">This presentation does not authenticate sources, certify a solver, or grant scientific admission.</dd></div>
      </dl>
    </details>
  </section>;
}
