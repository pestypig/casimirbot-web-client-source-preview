import React from "react";
import { solarComparisonViewSchema, type SolarComparisonView } from "../../../shared/solar-comparison";

export function SolarComparisonResult() {
  const [view,setView] = React.useState<SolarComparisonView|null>(null), [error,setError] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController(); let busy = false;
    const load = async () => {
      if (busy) return; busy = true;
      try {
        const response = await fetch("/api/star-watcher/comparison/domain",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
        if (!response.ok) throw Error("unavailable");
        const next = solarComparisonViewSchema.parse(await response.json());
        if (!controller.signal.aborted) {setView(next);setError(false);}
      } catch {if (!controller.signal.aborted) setError(true);} finally {busy=false;}
    };
    void load(); const timer = window.setInterval(() => {void load();},60_000);
    return () => {controller.abort();window.clearInterval(timer);};
  },[]);
  const r = view?.result;
  return <section aria-label="Platform solar comparison" className="mt-4 rounded border border-cyan-800 p-3 text-xs">
    <h3 className="text-sm font-semibold">Platform solar comparison</h3>
    {error && <p role="status" className="text-amber-200">Platform refresh unavailable. {r ? "Showing the last loaded result." : "No result loaded."}</p>}
    {r ? <>
      <p>TSIS daily mean on {r.irradiance.nominalDay}: <strong>{r.irradiance.tsi1auWm2.toFixed(4)} ± {r.irradiance.uncertainty1sigmaWm2.toFixed(4)} W/m²</strong> at 1 AU (1σ){r.irradiance.provisional ? " · provisional" : ""}.</p>
      <p>Isotropic-equivalent luminosity: {r.irradiance.isotropicEquivalentLuminosityW.toExponential(4)} ± {r.irradiance.luminosity1sigmaW.toExponential(2)} W. Propagated irradiance uncertainty; viewing geometry and model error are additional.</p>
      <p>Archival 2011–2015 comparison: {r.archival.pairedBins}/{r.archival.totalBins} bins; distance-normalized Pearson r = {r.archival.normalizedPearson?.toFixed(3) ?? "undefined"}. Significance and full uncertainty have not been established.</p>
      <p className="text-amber-100">No live solar-fusion neutrino measurement. HEK reports update solar context, without inferring a live neutrino flux or emission time.</p>
      <p>Status: {view?.state.replaceAll("_"," ")} · {r.change.replaceAll("_"," ")} · calculated {r.computedAt}.</p>
      <p>Retained HEK catalog coverage: {r.solarContext.coverage}. Report revisions supply context, not a count of independent physical events.</p>
      <p>TSI and neutrino bins cover different periods; the current irradiance is not paired with the historical neutrino rates.</p>
      <div className="mt-2 flex flex-wrap gap-3 text-cyan-200">
        <a href={r.sources.tsis} target="_blank" rel="noreferrer">LASP TSIS/TIM source</a>
        <a href={`https://casimirbot.com/api/star-watcher/comparison/results/${r.id}`} target="_blank" rel="noreferrer">Exact result and source hashes</a>
        <a href={`https://casimirbot.com/api/star-watcher/comparison/inputs/${r.inputId}`} target="_blank" rel="noreferrer">Retained public inputs for replay</a>
        {r.previousId && <a href={`https://casimirbot.com/api/star-watcher/comparison/results/${r.previousId}`} target="_blank" rel="noreferrer">Previous result</a>}
      </div>
    </> : <p>{view?.state === "refresh_failed" ? "The platform source refresh failed; no calculation is available." : view ? "No platform calculation has been retained yet." : "Loading the retained platform calculation…"}</p>}
  </section>;
}
