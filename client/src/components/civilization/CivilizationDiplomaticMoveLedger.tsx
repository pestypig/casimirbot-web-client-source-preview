import { useEffect, useState } from "react";
import { diplomaticLedgerQuerySchema, diplomaticLedgerReceiptSchema, type DiplomaticLedgerReceipt } from "@shared/civilization-diplomatic-move-ledger";

const words = (value: string) => value.replaceAll("_", " ");
export function CivilizationDiplomaticMoveLedger({ countryIso3s }: { countryIso3s: string[] }) {
  const countries = countryIso3s.join(",");
  const [issueId, setIssueId] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ key: string; receipt: DiplomaticLedgerReceipt } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams({ countryIso3s: countries, offset: String(offset), limit: "10" });
  if (issueId) query.set("issueIds", issueId);
  const requestKey = query.toString();
  const receipt = result?.key === requestKey ? result.receipt : null;
  useEffect(() => { setOffset(0); }, [countries, issueId]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`/api/civilization/geospatial/diplomacy/move-ledger?${requestKey}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("ledger_unavailable");
        const parsed = diplomaticLedgerReceiptSchema.parse(await response.json());
        const expected = diplomaticLedgerQuerySchema.parse({ countryIso3s: countries ? countries.split(",") : [],
          issueIds: issueId ? [issueId] : [], offset, limit: 10 });
        if (JSON.stringify(parsed.query) !== JSON.stringify(expected)) throw Error("ledger_selection_mismatch");
        if (!controller.signal.aborted) setResult({ key: requestKey, receipt: parsed });
      }).catch(() => { if (!controller.signal.aborted) setError("The diplomatic ledger could not be loaded. Evidence remains unknown."); });
    return () => controller.abort();
  }, [requestKey]);
  const downloadReceipt = () => {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `civilization-move-ledger-${receipt.datasetRevision}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <details className="mt-3 rounded border border-cyan-200/30 bg-cyan-100/5 p-2" open>
    <summary className="cursor-pointer font-semibold text-cyan-100">Dated diplomatic moves</summary>
    <p className="mt-1 text-slate-300">Records involving either selected country. Each actor keeps its own authority and choices.</p>
    <p className="text-[10px] text-slate-400">Same-day display order does not establish a sequence or an exchange.</p>
    <label className="mt-2 block">Move issue <select aria-label="Diplomatic move issue" value={issueId}
      className="ml-1 rounded bg-slate-900 p-1" onChange={event => setIssueId(event.target.value)}>
      <option value="">All pilot issues</option><option value="energy_trade">Energy trade</option>
      <option value="humanitarian_cooperation">Humanitarian cooperation</option><option value="regional_security">Regional security</option>
    </select></label>
    {error ? <p role="alert" className="mt-2 text-amber-100">{error}</p> : !receipt ? <p role="status">Loading dated records…</p> : <>
      <p className="mt-2 text-[10px] text-slate-400">As of {receipt.asOf} · curated through {receipt.reviewedThrough} · {receipt.datasetRevision}</p>
      <p>{receipt.coverage.reviewedMatching} reviewed records · {receipt.coverage.candidateMatching} candidates · {receipt.coverage.omittedBefore + receipt.coverage.omittedAfter} records outside this page</p>
      {!receipt.coverage.totalMatching && <p className="mt-2 text-amber-100">No records in this pilot selection. This does not establish that no moves occurred.</p>}
      {[...receipt.events, ...receipt.candidates].sort((a,b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? "") || a.id.localeCompare(b.id)).map(event => <article key={event.id}
        className={`mt-2 rounded border p-2 ${event.review.state === "reviewed" ? "border-emerald-200/25" : "border-dashed border-amber-200/45"}`}>
        <div className="font-semibold">{event.eventDate ?? "Event date unknown"} · {event.title}</div>
        <div className="text-[10px]">{event.id} · {words(event.kind)} · {event.review.state === "reviewed" ? "Reviewed source claim" : "Candidate · not admitted country evidence"}</div>
        <p className="mt-1">{event.summary}</p>
        <details className="mt-1"><summary className="cursor-pointer underline">Sources, authority and status</summary>
          <p>Event date: {event.eventDate ?? "unknown"} ({words(event.eventDatePrecision)}). Published: {event.publicationDate ?? "unknown"}.</p>
          {event.actorIds.map(id => { const actor = receipt.actors.find(a => a.id === id); return actor && <p key={id} className="mt-1"><strong>{actor.name}</strong> · {actor.institution}<br />Controls: {actor.authorityScope}<br />Limits: {actor.authorityLimits}</p>; })}
          {!!event.affectedActorIds.length && <p>Affected or independent actors: {event.affectedActorIds.map(id => receipt.actors.find(a => a.id === id)?.name ?? id).join("; ")}</p>}
          <p className="mt-1">Legal: {event.legalStatus}</p><p>Operating: {event.operatingStatus}</p>
          {event.expiresAt && <p>Expires: {event.expiresAt}</p>}
          {event.conditions.map((condition,i) => <p key={i}>Condition: {condition}</p>)}
          {event.sourceIds.map(id => { const source = receipt.sources.find(s => s.id === id); return source && <div key={id} className="mt-2 border-t border-slate-500/30 pt-1">
            <a href={source.url} target="_blank" rel="noreferrer" className="underline">{source.publisher} · {source.locator}</a>
            {source.originalUrl && <a href={source.originalUrl} target="_blank" rel="noreferrer" className="ml-1 underline">Original post</a>}
            <p>Published {source.publicationDate ?? "unknown"} · {source.language} · {words(source.translation)} · {words(source.reviewStatus)}</p>
            <p>Accessed {source.accessedAt} · original-byte hash {source.originalContentSha256 ?? "not retained"}</p>
            {source.video && <p>Video: {source.video.channel} · uploaded {source.video.uploadedAt ?? "unknown"} · clip {source.video.startSeconds ?? "unknown"}–{source.video.endSeconds ?? "unknown"} seconds · {source.video.reviewed ? "reviewed" : "not reviewed"}</p>}
            {source.extraction && <p>Discovery only: {source.extraction.provider} / {source.extraction.model}</p>}
          </div>; })}
          <p className="mt-2">Review: {event.review.reviewedAt} · {event.review.reviewer} · {event.review.scope}</p>
          {event.review.gaps.map((gap,i) => <p key={i} className="text-amber-100">Gap: {gap}</p>)}
        </details>
      </article>)}
      {!!receipt.links.length && <details className="mt-2"><summary className="cursor-pointer font-semibold">Connections between records</summary>
        {receipt.links.map(link => <div key={link.id} className={`mt-2 border-l-2 pl-2 ${link.status === "possible_sequence" ? "border-dashed border-amber-300" : "border-cyan-200"}`}>
          <strong>{words(link.status)}</strong><p className="text-[10px]">{link.fromEventId} → {link.toEventId}</p><p>{link.claim}</p>
          <p>Alternative: {link.alternativeExplanation}</p><p>Needed: {link.verificationToChangeStatus}</p>
          {link.sourceIds.map(id => { const source = receipt.sources.find(s => s.id === id); return source && <a key={id} href={source.url} target="_blank" rel="noreferrer" className="mr-2 underline">{source.publisher}</a>; })}
        </div>)}
      </details>}
      <details className="mt-2"><summary className="cursor-pointer font-semibold">Unified reasoning and sovereign choices</summary>
        <p className="mt-1">{receipt.reasoningFrame.unifiedCounterfactual}</p><p className="mt-1">{receipt.reasoningFrame.sovereignFeasibility}</p><p className="mt-1">{receipt.reasoningFrame.informationBoundary}</p>
      </details>
      {!!receipt.nextMoves.length && <details className="mt-2"><summary className="cursor-pointer font-semibold">Bounded next questions</summary>
        {receipt.nextMoves.map(move => <div key={move.id} className="mt-2 border-t border-cyan-200/20 pt-2">
          <strong>{receipt.actors.find(a => a.id === move.controllerActorId)?.name}</strong><p>{move.action}</p>
          <p>Required response: {move.requiredResponse}</p><p>Prerequisites: {move.prerequisites.join(" ")}</p>
          <p>Verify: {move.verification}</p><p>Exit or revise: {move.exitCondition}</p>
          <p className="mt-1"><strong>Shared-objective comparison (counterfactual):</strong> {move.unifiedCounterfactual.declaredCommonObjective}</p>
          <p>Possible shared gain: {move.unifiedCounterfactual.possibleSharedGain}</p><p>Assumptions: {move.unifiedCounterfactual.assumptions.join(" ")}</p>
          <p>Stated interest: {move.sovereignInterest.statedInterest}</p><p>Private motives: unknown.</p>
          <p>Interest evidence: {words(move.sovereignInterest.interestStatus)}. {move.sovereignInterest.allianceAndInstitutionalConstraints}</p>
          <p>Retained choices: {move.sovereignInterest.preservedAlternatives.join(" ")}</p><p>{move.sovereignInterest.refusalAndConsent}</p><p>{move.sovereignInterest.coercionRisk}</p>
          <p>Open gates: {move.openGates.join(" ")}</p><p>{move.outsideScope}</p><p className="text-[10px]">Basis: {move.basisEventIds.join(", ")}</p>
        </div>)}
      </details>}
      <details className="mt-2"><summary className="cursor-pointer">Coverage gaps and audit receipt</summary>
        {receipt.gaps.map((gap,i) => <p key={i} className="mt-1 text-amber-100">{gap}</p>)}
        <p>{receipt.coverage.omittedLinks} links and {receipt.coverage.omittedMoves} moves omitted because their full basis is outside this page.</p>
        <p className="mt-1 break-all text-[10px]">Dataset SHA-256: {receipt.datasetSha256}<br />Receipt SHA-256: {receipt.receiptSha256}</p>
        <p className="mt-1">Read-only MCP: <code>helix_civilization_diplomatic_move_ledger</code></p>
        <pre className="whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(receipt.query, null, 2)}</pre>
        <details className="mt-1"><summary className="cursor-pointer underline">View audit JSON for copying</summary>
          <p>Select and copy this receipt when using the desktop panel.</p>
          <textarea aria-label="Diplomatic ledger audit JSON" readOnly value={JSON.stringify(receipt, null, 2)}
            className="mt-1 h-48 w-full rounded bg-slate-950 p-2 font-mono text-[10px]" />
        </details>
        <button type="button" onClick={downloadReceipt} className="mt-1 rounded border px-2 py-1">Download audit receipt</button>
      </details>
      <div className="mt-2 flex gap-2">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))} className="rounded border px-2 disabled:opacity-40">Previous</button>
        <button disabled={receipt.coverage.nextOffset === null} onClick={() => setOffset(receipt.coverage.nextOffset!)} className="rounded border px-2 disabled:opacity-40">Next</button>
      </div>
    </>}
  </details>;
}
