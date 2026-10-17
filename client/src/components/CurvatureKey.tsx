import * as React from "react";

export function CurvatureKey() {
  const swatch = "inline-block w-3 h-3 rounded-full mr-2 align-middle";
  return (
    <div className="rounded-md border bg-card p-3 text-sm" role="region" aria-labelledby="curvature-key-title">
      <div id="curvature-key-title" className="font-semibold mb-2">Curvature Key</div>
      <div className="space-y-1" role="list">
        <div role="listitem"><span className={`${swatch} bg-sky-400`} aria-hidden="true"></span><span className="text-sky-400 font-medium">Contraction</span> (−β)</div>
        <div role="listitem"><span className={`${swatch} bg-orange-400`} aria-hidden="true"></span><span className="text-orange-400 font-medium">Expansion</span> (+β)</div>
        <div role="listitem"><span className={`${swatch} bg-violet-400`} aria-hidden="true"></span><span className="text-violet-400 font-medium">Interior tilt</span> (ε_tilt)</div>
      </div>
    </div>
  );
}