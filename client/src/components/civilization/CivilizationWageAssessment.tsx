import { useEffect, useRef, useState } from "react";
import { wageAssessmentPackSchema, type WageAssessmentPack, type WageAssessmentReceipt } from "@shared/civilization-wage-assessment";
import { createWageAssessmentExample } from "@shared/civilization-wage-assessment-example";
import { verifyCivilizationWageReceipt } from "@/lib/civilization-wage-receipt";

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export function CivilizationWageAssessment({ countryIso3s }: { countryIso3s: string[] }) {
  const [pack, setPack] = useState<WageAssessmentPack | null>(null);
  const [receipt, setReceipt] = useState<WageAssessmentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const countryKey = countryIso3s.join(",");
  useEffect(() => {
    generation.current++; controller.current?.abort(); setPack(null); setReceipt(null); setError(null); setBusy(false);
    return () => { generation.current++; controller.current?.abort(); };
  }, [countryKey]);
  const load = (next: WageAssessmentPack) => {
    generation.current++; controller.current?.abort(); setReceipt(null); setBusy(false);
    if (!countryIso3s.includes(next.countryIso3)) { setPack(null); setError("The assessment country must match one of the selected countries."); return; }
    setError(null); setPack(next);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const token = ++generation.current; controller.current?.abort(); setReceipt(null); setBusy(false);
    try {
      if (file.size > 200000) throw Error("large");
      const text = await file.text();
      if (token !== generation.current) return;
      load(wageAssessmentPackSchema.parse(JSON.parse(text)));
    } catch {
      if (token === generation.current) { setPack(null); setError("Assessment data could not be read. Use the versioned template, valid fields and at most 200 KB."); }
    }
  };
  const calculate = async () => {
    if (!pack) return;
    const token = ++generation.current; controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    setBusy(true); setError(null); setReceipt(null);
    try {
      const response = await fetch("/api/civilization/geospatial/economy/wage-assessment", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pack), signal: nextController.signal,
      });
      if (!response.ok) throw Error("unavailable");
      const result = await verifyCivilizationWageReceipt(await response.json(), pack);
      if (token === generation.current && !nextController.signal.aborted) setReceipt(result);
    } catch {
      if (token === generation.current && !nextController.signal.aborted) setError("The assessment could not be calculated. Check the data, information cutoff and server connection.");
    } finally { if (token === generation.current) setBusy(false); }
  };
  const visiblePack = pack && countryIso3s.includes(pack.countryIso3) ? pack : null;
  const result = receipt && visiblePack && receipt.pack.assessmentId === visiblePack.assessmentId && receipt.pack.countryIso3 === visiblePack.countryIso3 ? receipt.calculation : null;
  return <details className="mt-3 rounded border border-emerald-200/30 p-2">
    <summary className="cursor-pointer font-semibold text-emerald-100">Assess wage thresholds · household needs and first hires</summary>
    <p className="mt-1 text-[10px] text-slate-300">Compare a declared wage grid against household needs, hiring cash flow and explicit policy limits. Country response estimates are needed before comparing national outcomes.</p>
    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
      <button type="button" disabled={!countryIso3s.length} className="rounded border border-white/25 px-2 py-1"
        onClick={() => load(createWageAssessmentExample(countryIso3s[0]))}>Load hypothetical example</button>
      <label className="rounded border border-white/25 px-2 py-1">Import assessment data <input aria-label="Import wage assessment data" type="file" accept=".json,application/json"
        className="mt-1 block w-full" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    </div>
    {error && <p role="alert" className="mt-2 text-amber-100">{error}</p>}
    {visiblePack && <>
      <div className="mt-2 text-[10px] text-slate-300">
        <p className="font-semibold">Declared inputs · {visiblePack.countryIso3} · {visiblePack.currency === "XXX" ? "unspecified money units" : visiblePack.currency}</p>
        <p>{visiblePack.sampleDescription}</p><p>{visiblePack.region} · {visiblePack.sector}</p>
        <p>Information cutoff {visiblePack.informationCutoff.slice(0, 10)} · prices at {visiblePack.priceReferenceDate}</p>
        <p>Tested hourly wages: {visiblePack.candidateWagesPerHour.join(", ")} · baseline {visiblePack.baselineWagePerHour}</p>
        <p>{visiblePack.households.length} household groups · {visiblePack.hiringCases.length} hiring cases · {visiblePack.responseScenarios.length} country response scenarios</p>
        <details className="mt-1"><summary className="cursor-pointer">Review policy limits and assumptions</summary>
          <p>Required household coverage {percent(visiblePack.limits.minimumHouseholdCoverageFraction)}; feasible hires {percent(visiblePack.limits.minimumHireFeasibilityFraction)}.</p>
          <p>Employment change at least {percent(visiblePack.limits.minimumEmploymentChangeFraction)}; firm-entry change at least {percent(visiblePack.limits.minimumFirmEntryChangeFraction)}.</p>
          <p>Annual public cost change at most {visiblePack.limits.maximumAnnualPublicCostChange}; real household income change at least {visiblePack.limits.minimumRealIncomeChangePerHouseholdPerMonth} per month.</p>
          <p>Country comparisons use the worst submitted income lower bound across {visiblePack.horizonsMonths.join(", ")} month horizons. These limits are declared choices.</p>
          {visiblePack.households.map(row => <p key={row.id} className="mt-1">{row.label}: {row.normalPaidHoursPerMonth} normal paid hours/month, other net income {row.otherNetIncomePerMonth}, essential costs {row.essentialCostsPerMonth}.</p>)}
          {visiblePack.hiringCases.map(row => <p key={row.id} className="mt-1">{row.label}: onboarding cost {row.upfrontOnboardingCost}, working capital {row.availableWorkingCapital}, monthly real discount rate {percent(row.monthlyRealDiscountRate)}, {row.months.length} modeled months.</p>)}
        </details>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        <button type="button" disabled={busy} onClick={() => void calculate()} className="rounded border border-emerald-200/40 px-2 py-1">{busy ? "Calculating…" : "Calculate wage assessment"}</button>
        <button type="button" onClick={() => download(visiblePack, `wage-assessment-${visiblePack.assessmentId}.json`)} className="rounded border border-white/25 px-2 py-1">Download replay data</button>
      </div>
    </>}
    {result && receipt && <div className="mt-2 text-[10px]" aria-label="Wage assessment results">
      <p className="font-semibold">Accounting passes at tested hourly wages: {result.accountingPassingWages.join(", ") || "none"}</p>
      <p className="mt-1 text-amber-100">{result.status === "accounting_only" ? "National comparison unavailable: country response estimates are missing." : result.status === "response_gaps" ? "National comparison incomplete: some country responses are missing." : "Country comparison is conditional on the submitted estimates and policy limits."}</p>
      {!!result.conditionalBestTestedWages.length && <p className="mt-1">Best tested candidates under the declared objective: {result.conditionalBestTestedWages.join(", ")}. This is a conditional scenario result.</p>}
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><caption className="text-left text-slate-400">Declared inputs; no national policy recommendation.</caption>
        <thead><tr><th scope="col">Hourly floor</th><th scope="col">Household needs met</th><th scope="col">Feasible hires</th><th scope="col">Worst income change/month</th><th scope="col">Declared limits</th></tr></thead>
        <tbody>{result.candidates.map(row => <tr key={row.wagePerHour} className="border-t border-white/10"><th scope="row" className="py-1 font-normal">{row.wagePerHour}</th><td>{percent(row.householdCoverageFraction)}</td><td>{percent(row.hireFeasibilityFraction)}</td><td>{row.worstCaseIncomeChangeLowerBound ?? "unknown"}</td><td>{row.conditionalEligible ? "pass under assumptions" : row.checks.some(check => check.verdict === "fail") ? "fails a stated limit" : "unknown"}</td></tr>)}</tbody>
      </table></div>
      <details className="mt-2"><summary className="cursor-pointer">Cash shortfalls and household gaps</summary>
        {result.householdThresholds.map(row => <p key={row.id}>{row.id}: lowest tested wage meeting needs {row.lowestTestedWageMeetingNeeds ?? "none"}; passing points {row.meetingNeedsWages.join(", ") || "none"}.</p>)}
        {result.hiringThresholds.map(row => <p key={row.id}>{row.id}: highest tested feasible wage {row.highestTestedFeasibleWage ?? "none"}.</p>)}
        {result.candidates.map(row => <div key={row.wagePerHour} className="mt-1 border-t border-white/10 pt-1">At {row.wagePerHour}/hour · weighted household shortfall {row.weightedHouseholdShortfallPerMonth}/month
          {row.hiringCases?.map(hire => <p key={hire.id}>{hire.id}: NPV {hire.npv}; peak cash shortfall {hire.peakCashShortfall}; working-capital gap {hire.workingCapitalGap}.</p>)}
        </div>)}
      </details>
      <details className="mt-2"><summary className="cursor-pointer">Reproducibility and limitations</summary>
        <p>{result.algorithmVersion}</p><p className="break-all">Input SHA-256: {receipt.inputSha256}</p>
        <p>Hashes identify content and do not validate sources or causal models.</p>
        {result.interpretation.map(value => <p key={value} className="mt-1 text-slate-400">{value}</p>)}
        <button type="button" className="mt-2 rounded border border-white/25 px-2 py-1" onClick={() => download(receipt, `wage-assessment-receipt-${result.assessmentId}.json`)}>Download assessment receipt</button>
      </details>
    </div>}
  </details>;
}
