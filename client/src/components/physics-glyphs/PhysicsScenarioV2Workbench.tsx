import React, { useEffect, useState } from "react";
import type { PhysicsScenarioV2 } from "@shared/physics-glyphs/scenario-v2-contracts";
import { validatePhysicsScenarioV2 } from "@shared/physics-glyphs/scenario-v2-contracts";
import { V2_MARK_MEANINGS, V2_MECHANISMS, V2_SOURCES, V2_STATES } from "@shared/physics-glyphs/scenario-v2-catalog";

export function PhysicsScenarioV2Workbench({ scenario, perspective, dispatch, children }: { scenario: PhysicsScenarioV2; perspective: string; dispatch: (command: Record<string, unknown>) => void; children?: React.ReactNode }) {
  const [draft, setDraft] = useState(JSON.stringify(scenario, null, 2));
  const [checked, setChecked] = useState<ReturnType<typeof validatePhysicsScenarioV2> | null>(null);
  useEffect(() => { setDraft(JSON.stringify(scenario, null, 2)); setChecked(null); }, [scenario]);
  const assessment = validatePhysicsScenarioV2(scenario).coverage;
  const parse = () => { try { return JSON.parse(draft); } catch { return null; } };
  const button = "rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800";
  return <div className="space-y-4" aria-label="Scenario v2 workbench">
    <h2 className="text-lg font-semibold">{scenario.title}</h2><p>{scenario.question}</p>
    <p role="status">Question coverage: {assessment?.status}. This checks registered support for host-authored intent, not scientific truth or a measurement.</p>
    <div className="flex flex-wrap gap-2" aria-label="Scenario perspectives">{scenario.perspectives.map(p => <button className={button} key={p} aria-pressed={p === perspective} onClick={() => dispatch({ type: "set_parameters", parameters: { perspective: p } })}>{p}</button>)}</div>
    {children}
    <details><summary>Question requirements and gaps</summary><ul>{assessment?.requirements.map(r => <li key={r.id}><strong>{r.claim}</strong> · {r.status}{r.missing.length > 0 && <p>{r.missing.join("; ")}</p>}</li>)}</ul></details>
    <details><summary>Explicit states and supplied inputs</summary><div className="space-y-3">{scenario.states.map(st => <div key={st.id}><strong>{V2_STATES[st.conceptId].title}</strong> · {st.subjectId}<p>{st.valueId} · {st.status} · {st.provenance.kind}{st.provenance.reference ? ` · ${st.provenance.reference}` : ""}</p>{st.quantity && <p>{st.quantity.value === null ? "Unknown" : st.quantity.value} {st.quantity.unit}; uncertainty {st.quantity.uncertainty ?? "unspecified"}</p>}<p className="text-xs">{V2_STATES[st.conceptId].boundary} Source identity is unauthenticated; supplied inputs are not computed results.</p></div>)}</div></details>
    <details><summary>Diagram meanings and temporary notation</summary><dl>{Object.entries(V2_MARK_MEANINGS).map(([role, meaning]) => <div key={role}><dt>{role}</dt><dd>{meaning}</dd></div>)}</dl>{scenario.story.notationDefinitions.map(d => <p key={d.id}>{d.label} · {d.role} · {d.meaningRef} · document-local; not a registered physical definition</p>)}</details>
    <details><summary>Registered mechanisms and applicability</summary><div className="space-y-4">{scenario.mechanisms.map(m => {
      const definition = V2_MECHANISMS[m.conceptId];
      return <div key={m.id}><h3>{definition.title}</h3><p>{definition.explanation}</p><p>{definition.boundary}</p>
        <p className="text-xs">Required state concepts: {Object.entries(definition.roles).map(([role, rule]) => `${role} (${m.roles[role]}): ${rule.states.join(", ")}`).join("; ")}</p>
        <p className="text-xs">Excluded counterexamples: {definition.counterexamples.join("; ")}</p>
        <div className="flex flex-wrap gap-3">{definition.sourceIds.map(id => <a key={id} className="text-sm text-sky-300 underline" href={V2_SOURCES[id].url} target="_blank" rel="noreferrer">{V2_SOURCES[id].title}</a>)}</div>
      </div>;
    })}</div></details>
    <details><summary>Geometry, boundary conditions and scale models</summary><pre className="overflow-auto text-xs">{JSON.stringify({ geometry: scenario.geometry, boundaryConditions: scenario.boundaryConditions, observables: scenario.observables, scaleLinks: scenario.scaleLinks }, null, 2)}</pre></details>
    <details><summary>Edit v2 semantic document</summary><textarea aria-label="Scenario v2 draft JSON" className="min-h-64 w-full bg-slate-900 p-3 font-mono text-xs" maxLength={262144} value={draft} onChange={e => { setDraft(e.target.value); setChecked(null); }} />
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setChecked(validatePhysicsScenarioV2(parse()))}>Validate v2 draft</button>
        <button className={button} onClick={() => { const value = parse(), verdict = validatePhysicsScenarioV2(value); setChecked(verdict); if (verdict.valid && verdict.expectedBinding) { const bound = { ...value, binding: verdict.expectedBinding }; setDraft(JSON.stringify(bound, null, 2)); setChecked(validatePhysicsScenarioV2(bound)); } }}>Bind validated draft</button>
        <button className={button} onClick={() => { const value = parse(), verdict = validatePhysicsScenarioV2(value); setChecked(verdict); if (verdict.publicationReady) dispatch({ type: "compose_scenario", scenario: value, perspective }); }}>Publish v2 scene</button></div>
      {checked && <div role="status"><p>Structure: {checked.valid ? "valid" : "needs repair"}; publication: {checked.publicationReady ? "bound" : "needs repair or binding"}; coverage: {checked.coverage?.status ?? "unassessed"}</p>{[...checked.issues, ...checked.publicationIssues].map((issue, i) => <p key={i}>{issue.path}: {issue.code}</p>)}</div>}
    </details>
  </div>;
}
