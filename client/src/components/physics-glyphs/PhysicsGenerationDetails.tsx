import React from "react";
import type { PhysicsScenarioV3 } from "@shared/physics-glyphs/scenario-v3-contracts";
import { assessPhysicsGenerationRecord } from "@shared/physics-glyphs/generation-record";

export function PhysicsGenerationDetails({scenario,assessment}:{scenario:PhysicsScenarioV3;assessment:ReturnType<typeof assessPhysicsGenerationRecord>}) {
  const record=scenario.scientificRecord;
  return <details className="mt-4 rounded border border-slate-800 p-3 text-sm" aria-label="Scientific generation details"><summary className="cursor-pointer text-slate-300">Scientific details for this answer</summary>
    <div className="mt-3 space-y-3"><p className="whitespace-pre-wrap">Original question: {scenario.question}</p>
      <p>Declared-model coverage and scientific evidence are separate. Criteria below are the host's public assessments; a bounded operator replay does not establish empirical correctness.</p>
      {!record?<p>No scientific generation record is attached to this answer, or it was retired after a scene edit. Existing scene properties and sources remain inspectable in the workbench. No criteria checks or calculations are inferred.</p>:<>
        <p>Generation {record.generationId} · revision {record.revision} · {assessment.status} · {record.conclusion.status}</p>
        <p>{record.publicSummary}</p><p>Observable: {record.interpretedObservable} · Scope: {record.requestedScope}</p>
        <p>Model selection: {record.modelSelectionReason}</p>
        <details><summary>States, frame, geometry, apparatus and unknowns</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({objects:scenario.objects,scope:record.scope,atomic:record.atomic},null,2)}</pre></details>
        <section aria-label="Applicable scientific criteria"><h3>Applicable criteria</h3><ul className="space-y-2">{record.criteria.map(c=><li key={c.id}><strong>{c.id}: {c.status}</strong> · {c.reason}<span className="block text-xs text-slate-400">Requirements: {c.requirementIds.join(", ")||"all"} · laws: {c.lawIds.join(", ")||"none"} · primary references: {c.sourceIds?.join(", ")||"none"} · evidence: {c.evidenceIds.join(", ")||"host assessment; no calculation"}</span></li>)}</ul></section>
        <details><summary>All committed inputs, origins, units and uncertainties</summary><ul className="space-y-2">{record.materials.map(m=><li key={m.id}><strong>{m.propertyId}</strong>: {m.value===null?"unknown":String(m.value)} {m.unit??""} · {m.origin}{m.uncertainty!==null?` ±${m.uncertainty}`:" · uncertainty unprovided"}<br/>{m.meaning} · {m.stateDomain}<br/>Sources: {m.sourceIds.join(", ")||"none"} · evidence: {m.evidenceId??"none"}</li>)}</ul></details>
        <details><summary>Actual models, laws, sources and glyph-to-question mapping</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({models:scenario.models,laws:record.laws,sources:scenario.sources,mappings:record.mappings},null,2)}</pre></details>
        <details><summary>Calculation evidence and exported code</summary>{!record.calculations.length?<p>Qualitative answer: no calculation was executed or claimed.</p>:record.calculations.map(c=><section key={c.id}><h3>{c.operator} · {c.version} · {c.execution}</h3><p>{c.execution==="not-executed"?"Export text only; not executed.":c.execution==="external-reported"?"External receipt reported by host; not independently replayed here.":c.execution==="replay-verified-atomic"?"Fixed atomic operator independently replayed against exact inputs; diagnostic model limits apply. Legacy evidence format.":"Admitted versioned operator replay checked against the committed model, state, domain, input and named quantity identities. This establishes bounded model consistency, not empirical correctness."}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(c,null,2)}</pre></section>)}</details>
        <p>{record.conclusion.summary}</p><ul>{[...record.limitations,...record.remainingSpecifics].map((v,i)=><li key={i}>{v}</li>)}</ul>
        {assessment.issues.length>0&&<p role="alert">Invalid or stale scientific record: {assessment.issues.map(i=>i.code).join("; ")}</p>}
        <p className="text-xs text-slate-400">{assessment.meaning}</p><p className="break-all text-xs">Question {record.questionHash} · scene {record.sceneHash} · record {assessment.recordHash}</p>
      </>}
    </div>
  </details>;
}
