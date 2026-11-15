import { useEffect, useState } from "react";
import { CivilizationWageAssessment } from "./CivilizationWageAssessment";
import { economicHistoryQuerySchema, economicHistoryReceiptSchema, ECONOMIC_METRIC_LABELS, type EconomicHistoryReceipt } from "@shared/civilization-economic-history";

export function CivilizationEconomicHistory({ countryIso3s }: { countryIso3s: string[] }) {
  const [open, setOpen] = useState(false);
  const latestYear = new Date().getUTCFullYear() - 1;
  const [endYear, setEndYear] = useState(latestYear);
  const [analysisMode, setAnalysisMode] = useState("retrospective");
  const today = new Date().toISOString().slice(0, 10);
  const [informationDay, setInformationDay] = useState(today);
  const [result, setResult] = useState<{ key: string; receipt: EconomicHistoryReceipt } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const parameters = new URLSearchParams({ countryIso3s: countryIso3s.join(","), startYear: String(endYear - 9), endYear: String(endYear), analysisMode });
  if (informationDay < today) parameters.set("reasoningAsOf", `${informationDay}T23:59:59.999Z`);
  const key = parameters.toString();
  const receipt = result?.key === key ? result.receipt : null;
  useEffect(() => {
    if (!open || countryIso3s.length === 0) return;
    const controller = new AbortController(); setError(null);
    fetch(`/api/civilization/geospatial/economy/history?${key}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("unavailable");
        const receipt = economicHistoryReceiptSchema.parse(await response.json());
        const expected = economicHistoryQuerySchema.parse({ countryIso3s, startYear: endYear - 9, endYear, analysisMode,
          ...(informationDay < today ? { reasoningAsOf: `${informationDay}T23:59:59.999Z` } : {}) });
        if (JSON.stringify(receipt.query) !== JSON.stringify(expected) ||
          receipt.window.startYear !== expected.startYear || receipt.window.endYear !== expected.endYear ||
          receipt.reasoningContext.analysisMode !== expected.analysisMode ||
          JSON.stringify(receipt.reasoningContext.countryScope) !== JSON.stringify(expected.countryIso3s) ||
          (expected.reasoningAsOf && Date.parse(receipt.reasoningContext.informationCutoff) !== Date.parse(expected.reasoningAsOf)))
          throw Error("economic_selection_mismatch");
        if (!controller.signal.aborted) setResult({ key, receipt });
      }).catch(() => { if (!controller.signal.aborted) setError({ key, message: "Economic history could not be loaded. Coverage remains unknown." }); });
    return () => controller.abort();
  }, [key, open, countryIso3s.length]);

  const downloadReceipt = () => {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `civilization-economy-${receipt.query.countryIso3s.join("-")}-${receipt.window.startYear}-${receipt.window.endYear}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <details className="mt-3 rounded border border-cyan-200/30 bg-cyan-100/5 p-2"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold text-cyan-100">Wages, wealth and spending · ten-year history</summary>
    {open && <>
      <CivilizationWageAssessment countryIso3s={countryIso3s} />
      <label className="mt-2 block">Reasoning <select aria-label="Economic reasoning mode" value={analysisMode} className="ml-1 rounded bg-slate-900 p-1" onChange={event => setAnalysisMode(event.target.value)}>
        <option value="retrospective">Historical review</option><option value="as_known_at">Information known at date</option>
        <option value="present">Present conditions</option><option value="forecast">Forecast context</option>
      </select></label>
      <label className="mt-1 block">Information cutoff <input aria-label="Economic information cutoff" type="date" min="1970-01-01" max={today} value={informationDay}
        className="ml-1 rounded bg-slate-900 p-1" onChange={event => {
          const value = event.target.value;
          if (!value || value > today || value < "1970-01-01") return;
          setInformationDay(value);
          setEndYear(current => Math.min(current, Number(value.slice(0, 4)) - 1));
        }} /></label>
      <label className="mt-2 block">Decade ending <select aria-label="Economic history end year" value={endYear}
        className="ml-1 rounded bg-slate-900 p-1" onChange={event => setEndYear(Number(event.target.value))}>
        {[...new Set([endYear, ...Array.from({ length: 11 }, (_, i) => Math.min(latestYear, Number(informationDay.slice(0, 4)) - 1) - i)])].filter(year => year >= 1969).sort((a, b) => b - a).map(year => <option key={year} value={year}>{year}</option>)}
      </select></label>
      <p className="mt-1 text-[10px] text-slate-300">Six-month review points. Annual figures are shared context for both halves, not half-year measurements. Past information cutoffs require archived releases and vintages; newer revisions are excluded.</p>
      {error?.key === key ? <p role="alert" className="mt-2 text-amber-100">{error.message}</p> : !receipt ? <p role="status">Loading economic evidence…</p> : <>
        <p className="mt-1 text-[10px] text-slate-400">{receipt.window.startYear}–{receipt.window.endYear} · collected {receipt.collectedAt.slice(0, 10)}</p>
        <p className="mt-1 text-[10px] text-slate-300">Information through {receipt.reasoningContext.informationCutoff.slice(0, 10)} · target {receipt.reasoningContext.targetDate}. {receipt.temporalExclusions.length} records excluded by time or source-mapping checks.</p>
        {receipt.query.countryIso3s.map(country => <article key={country} className="mt-2 border-t border-white/15 pt-2">
          <h4 className="font-semibold">{country} · economic evidence</h4>
          {receipt.providers.filter(provider => provider.countryIso3 === country).map(provider => <p key={provider.provider} className="mt-1 text-[10px]">
            <a href={provider.sourceUrl} target="_blank" rel="noreferrer" className="underline">{provider.provider}</a>: {provider.status.replaceAll("_", " ")}
            {provider.errorCode && ` · ${provider.errorCode}`}{provider.lastUpdated && ` · updated ${provider.lastUpdated}`}
          </p>)}
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[10px]">
            <caption className="mb-1 text-left text-slate-400">Annual consumption (current USD), CPI (2010=100) and scoped wage policies. Unknown values stay blank (—).</caption>
            <thead><tr><th scope="col">Review</th><th scope="col">Wage floor</th><th scope="col">Annual spending</th><th scope="col">CPI</th></tr></thead>
            <tbody>{receipt.checkpoints.filter(point => point.countryIso3 === country).map(point => {
              const annual = receipt.observations.filter(row => point.annualContextIds.includes(row.id));
              const consumption = annual.find(row => row.metric === "household_consumption");
              const cpi = annual.find(row => row.metric === "consumer_price_index");
              const policies = receipt.policies.filter(policy => point.policyIds.includes(policy.id) && policy.kind === "minimum_wage" && policy.rate !== null);
              return <tr key={`${point.year}:${point.half}`} className="border-t border-white/5 align-top">
                <th scope="row" className="py-1 pr-1 font-normal">{point.year} {point.half}</th>
                <td>{policies.length ? policies.map(policy => <a key={policy.id} href={policy.source.url} title={`${policy.title}. ${policy.scope}`} target="_blank" rel="noreferrer" className="block underline">{policy.rate} {policy.currency} {policy.rateUnit}</a>) : "—"}</td>
                <td>{consumption ? <a className="underline" href={consumption.source.url} target="_blank" rel="noreferrer">{consumption.value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 })}</a> : "—"}</td>
                <td>{cpi ? <a className="underline" href={cpi.source.url} target="_blank" rel="noreferrer">{cpi.value.toFixed(1)}</a> : "—"}</td>
              </tr>;
            })}</tbody>
          </table></div>
          {receipt.policies.filter(policy => policy.countryIso3 === country).map(policy => <p key={policy.id} className="mt-1 text-[10px] text-slate-400">{policy.title}: {policy.scope}. Effective {policy.effectiveFrom}; checked through {policy.verifiedThrough}. {policy.limitations.join(" ")}</p>)}
          <details className="mt-2"><summary className="cursor-pointer">Native series · wealth, income, wages and trade</summary>
            {receipt.observations.filter(row => row.countryIso3 === country).length === 0 && <p className="mt-1 text-amber-100">No source observations loaded. Policy records are shown separately.</p>}
            {receipt.observations.filter(row => row.countryIso3 === country).map(row => <div key={row.id} className="mt-1 border-t border-white/10 pt-1 text-[10px]">
              <a href={row.source.url} target="_blank" rel="noreferrer" className="underline">{ECONOMIC_METRIC_LABELS[row.metric]} · {row.periodStart}–{row.periodEnd}</a>
              <p>{row.value.toLocaleString(undefined, { maximumSignificantDigits: 8 })} {row.unit}{row.currency ? ` (${row.currency})` : ""} · {row.frequency} · {row.priceBasis}</p>
              <p className="text-slate-400">{row.populationScope} · {row.accountingBasis} · {row.evidenceKind.replaceAll("_", " ")}{row.sourceStatus ? ` · status ${row.sourceStatus}` : ""}</p>
              <p className="text-slate-400">{row.source.publisher} · {row.source.locator} · collected {row.source.collectedAt.slice(0, 10)} · published {row.source.publishedAt ?? "unknown"}</p>
            </div>)}
          </details>
          <details className="mt-2"><summary className="cursor-pointer text-amber-100">Coverage and source research needed</summary>
            {receipt.coverage.filter(row => row.countryIso3 === country).map(row => <p key={row.metric} className="mt-1 text-[10px]">{ECONOMIC_METRIC_LABELS[row.metric]}: {row.observationCount} observations; {row.coveredYears.length} years with evidence{row.metric === "minimum_wage" ? " (includes scoped policy records)" : ""}; missing {row.missingYears.join(", ") || "none in this window"}.</p>)}
            {receipt.researchRequests.filter(row => row.countryIso3 === country).map(row => <p key={row.metric} className="mt-1 text-[10px]"><a href={row.sourceGuideUrl} target="_blank" rel="noreferrer" className="underline">{ECONOMIC_METRIC_LABELS[row.metric]}</a>: {row.task}</p>)}
          </details>
        </article>)}
        <details className="mt-2"><summary className="cursor-pointer">Recent releases and dated current policy</summary>
          {!receipt.currentObservations.length && <p className="mt-1 text-amber-100">No recent source observations admitted. A forecast context does not imply a connected live feed.</p>}
          {receipt.currentObservations.map(row => <div key={row.id} className="mt-1 text-[10px]"><a href={row.source.url} target="_blank" rel="noreferrer" className="underline">{row.countryIso3} · {ECONOMIC_METRIC_LABELS[row.metric]} · {row.value} {row.unit}</a>
            <p>{row.frequency} · {row.periodStart}–{row.periodEnd} · source event {row.timeDetail?.providerTimestamp ?? "unknown"} · stated delay {row.timeDetail?.statedDelaySeconds ?? "unknown"} seconds</p></div>)}
          {receipt.currentPolicies.map(policy => <p key={policy.id} className="mt-1 text-[10px]"><a href={policy.source.url} target="_blank" rel="noreferrer" className="underline">{policy.countryIso3} · {policy.title}</a> · {policy.scope} · checked through {policy.verifiedThrough}</p>)}
        </details>
        <p className="mt-2 text-[10px] text-amber-100">{receipt.candidates.length + receipt.candidatePolicies.length} source candidates kept outside the history. Household, government and national wealth are separate measures; their coverage and country policy coverage are incomplete.</p>
        <details className="mt-2"><summary className="cursor-pointer">How reasoning should use this evidence</summary>
          <p className="mt-1">{receipt.reasoningContext.question}</p>
          <ol className="ml-4 list-decimal text-[10px]">{receipt.reasoningProcedure.map(step => <li key={step} className="mt-1">{step}</li>)}</ol>
          {receipt.reasoningContext.hypothesisTests.map(test => <details key={test.mechanism} className="mt-1 border-t border-white/10 pt-1 text-[10px]">
            <summary className="cursor-pointer">Test: {test.mechanism.replaceAll("_", " ")}</summary>
            <p>{test.hypothesis}</p><p>Alternatives: {test.alternatives.join("; ")}.</p><p>Evidence needed: {test.requiredEvidence.join("; ")}.</p><p className="text-amber-100">{test.avoidInference}</p>
          </details>)}
          <details className="mt-2 text-[10px]"><summary className="cursor-pointer">Robinhood and other market signals</summary>
            <p>Optional market context. Connection not verified by this read; country exposure must be sourced.</p>
            {receipt.reasoningContext.robinhood.requirements.map(rule => <p key={rule} className="mt-1">{rule}</p>)}
          </details>
          {receipt.interpretationLimits.map(limit => <p key={limit} className="mt-1 text-[10px] text-slate-400">{limit}</p>)}
        </details>
        <details className="mt-2"><summary className="cursor-pointer">Economic audit receipt</summary>
          <p className="text-[10px]">Read-only MCP: <code>helix_civilization_economic_history</code></p>
          <textarea aria-label="Economic history audit JSON" readOnly value={JSON.stringify(receipt, null, 2)} className="mt-1 h-48 w-full rounded bg-slate-950 p-2 font-mono text-[10px]" />
          <button type="button" onClick={downloadReceipt} className="mt-1 rounded border border-white/25 px-2 py-1">Download economic receipt</button>
        </details>
      </>}
    </>}
  </details>;
}
