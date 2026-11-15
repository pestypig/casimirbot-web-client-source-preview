import React, { useEffect, useState } from "react";
import { type PhysicsScenarioV3, validatePhysicsScenarioV3 } from "@shared/physics-glyphs/scenario-v3-contracts";

export function PhysicsScenarioV3Workbench({ scenario, dispatch, children }: {
  scenario: PhysicsScenarioV3; dispatch: (command: Record<string, unknown>) => void; children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(JSON.stringify(scenario, null, 2));
  const [checked, setChecked] = useState<ReturnType<typeof validatePhysicsScenarioV3> | null>(null);
  useEffect(() => { setDraft(JSON.stringify(scenario, null, 2)); setChecked(null); }, [scenario]);
  const coverage = validatePhysicsScenarioV3(scenario).coverage;
  const parse = () => { try { return JSON.parse(draft); } catch { return null; } };
  return <section aria-label="Unified scenario workbench" className="space-y-4">
    <h2 className="text-lg font-semibold">{scenario.title}</h2><p>{scenario.question}</p>
    <p role="status">Question coverage: {coverage?.status}. Physical support: referenced or proposed models, not scientific verification. Presentation: {coverage?.presentationCoverage.status}.</p>
    {scenario.controls.map(c => <label key={c.id} className="block">{c.label}<select className="ml-2 bg-slate-800 p-2" aria-label={c.label} value={c.options.find(o => o.value === scenario.properties.find(p => p.id === c.propertyId)?.value)?.id ?? ""} onChange={e => dispatch({ type: "set_assumption", controlId: c.id, optionId: e.target.value })}>{c.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>)}
    {children}
    <details><summary>Model support and question gaps</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(coverage, null, 2)}</pre></details>
    <details><summary>Physical properties, sources and scale connections</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ objects: scenario.objects, properties: scenario.properties, models: scenario.models, relations: scenario.relations, sources: scenario.sources }, null, 2)}</pre></details>
    <details><summary>Edit unified scenario document</summary><textarea aria-label="Scenario v3 draft JSON" className="min-h-64 w-full bg-slate-900 p-3 font-mono text-xs" maxLength={65536} value={draft} onChange={e => { setDraft(e.target.value); setChecked(null); }} />
      <div className="flex gap-3"><button onClick={() => setChecked(validatePhysicsScenarioV3(parse()))}>Validate v3 draft</button><button onClick={() => { const value = parse(), verdict = validatePhysicsScenarioV3(value); setChecked(verdict); if (verdict.valid && verdict.expectedBinding) { const bound = { ...value, binding: verdict.expectedBinding }; setDraft(JSON.stringify(bound, null, 2)); setChecked(validatePhysicsScenarioV3(bound)); } }}>Bind validated draft</button><button onClick={() => { const value = parse(), verdict = validatePhysicsScenarioV3(value); setChecked(verdict); if (verdict.publicationReady) dispatch({ type: "compose_scenario", scenario: value }); }}>Publish v3 scene</button></div>
      {checked && <div role="status">Structure: {checked.valid ? "valid" : "needs repair"}; publication: {checked.publicationReady ? "bound" : "needs binding or repair"}{[...checked.issues, ...checked.publicationIssues].map((i, n) => <p key={n}>{i.path}: {i.code}</p>)}</div>}
    </details>
  </section>;
}
