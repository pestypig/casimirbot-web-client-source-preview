import React, { useEffect, useState } from "react";
import type { PhysicsGlyphConfiguration } from "@shared/physics-glyphs/contracts";
import { createHandTableScenario } from "@shared/physics-glyphs/scenario-example";
import { validatePhysicsScenario } from "@shared/physics-glyphs/scenario-contracts";
import { buildPhysicsScenarioPresentation, inspectPhysicsScenarioLibrary } from "@shared/physics-glyphs/scenario-presentation";
import { SCENARIO_STATE_CATALOG } from "@shared/physics-glyphs/scenario-catalog";
import { PhysicsScenarioV2Workbench } from "./PhysicsScenarioV2Workbench";
import { PhysicsScenarioV3Workbench } from "./PhysicsScenarioV3Workbench";

const button = "rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800";
export function PhysicsScenarioComposer({ configuration: c, dispatch, children }: {
  configuration: Extract<PhysicsGlyphConfiguration, { preset: "scenario" }>; dispatch: (command: Record<string, unknown>) => void; children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(""), [query, setQuery] = useState("");
  const [validation, setValidation] = useState<ReturnType<typeof validatePhysicsScenario> | null>(null);
  const scenarioKey = JSON.stringify(c.scenario);
  useEffect(() => { setDraft(""); setValidation(null); }, [scenarioKey]);
  if (c.scenario.schema === "helix.physics_scenario.v3") return <PhysicsScenarioV3Workbench scenario={c.scenario} dispatch={dispatch}>{children}</PhysicsScenarioV3Workbench>;
  if (c.scenario.schema === "helix.physics_scenario.v2") return <PhysicsScenarioV2Workbench scenario={c.scenario} perspective={c.perspective} dispatch={dispatch}>{children}</PhysicsScenarioV2Workbench>;
  const plan = buildPhysicsScenarioPresentation(c.scenario, c.perspective);
  const stages = c.scenario.states.filter(s => s.conceptId === "contact.geometry");
  const legacyScenario = c.scenario;
  const parse = () => { try { return JSON.parse(draft); } catch { return null; } };
  return <div className="space-y-4" aria-label="Scenario composer controls">
    <p className="text-xs text-slate-400">Question coverage: unassessed for this legacy document. Semantic validity does not establish that it answers the question.</p>
    <h2 className="text-lg font-semibold">{c.scenario.title}</h2><p>{c.scenario.question}</p>
    <div className="flex flex-wrap gap-2" aria-label="Scenario perspectives">{c.scenario.perspectives.map(p => <button key={p} className={button} aria-pressed={p === c.perspective}
      onClick={() => dispatch({ type: "set_parameters", parameters: { perspective: p } })}>{({ everyday: "Everyday", atomic: "Atomic", quantum: "Quantum states", interaction: "Standard Model" })[p]}</button>)}</div>
    <div className="flex flex-wrap gap-3">{stages.map(stage => { const label = stages.length === 1 ? "Contact stage" : `Contact stage · ${c.scenario.objects.find(o => o.id === stage.subjectId)?.label}`; return <label key={stage.id} className="block">{label}<select aria-label={label} className="ml-3 rounded bg-slate-800 p-2" value={stage.valueId} onChange={e => dispatch({
      type: "compose_scenario", perspective: c.perspective, scenario: { ...legacyScenario, states: legacyScenario.states.map(s => s.id === stage.id ? { ...s, valueId: e.target.value, classification: "assumed", provenance: "assumption" } : s) },
    })}>{Object.entries(SCENARIO_STATE_CATALOG["contact.geometry"].values).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>; })}</div>
    {children}
    <details><summary className="cursor-pointer">Explicit states & assumptions</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm [&_th]:p-2 [&_td]:p-2"><thead><tr><th>Object</th><th>State</th><th>Value</th><th>Classification</th><th>Provenance</th></tr></thead><tbody>{plan.states.map(s => <tr key={s.id} className="border-t border-slate-700"><td>{s.subject}</td><td>{s.title}</td><td>{s.value}</td><td>{s.classification}</td><td>{s.provenance.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details>
    <details><summary className="cursor-pointer">Mechanisms & boundaries</summary><div className="mt-3 space-y-3">{plan.mechanisms.map(m => <div key={m.id}><h3>{m.title} · {m.classification.replaceAll("_", " ")}</h3><p className="text-sm text-slate-300">{m.explanation}</p><p className="text-xs text-slate-400">{m.boundary}</p></div>)}<div className="flex flex-wrap gap-3">{plan.sources.map(s => <a key={s.id} className="text-sm text-sky-300 underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</div></div></details>
    <details><summary className="cursor-pointer">Compose a scenario</summary><div className="mt-3 space-y-3"><p className="text-sm text-slate-300">Inspect the reusable catalog, declare a scenario, validate it, then publish it. Your connected reasoning agent can use the same catalog and typed command. The composer does not infer a material or solve a wavefunction from the question.</p>
      <label className="block">Catalog search<input aria-label="Scenario catalog search" value={query} maxLength={160} onChange={e => setQuery(e.target.value)} className="ml-3 rounded bg-slate-800 p-2" /></label>
      <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs">{JSON.stringify(inspectPhysicsScenarioLibrary(query), null, 2)}</pre>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setDraft(JSON.stringify(c.scenario, null, 2))}>Edit current scenario</button><button className={button} onClick={() => setDraft(JSON.stringify(createHandTableScenario(), null, 2))}>Start hand & table draft</button></div>
      <textarea aria-label="Scenario draft JSON" className="min-h-64 w-full rounded border border-slate-600 bg-slate-900 p-3 font-mono text-xs" maxLength={65536} value={draft} onChange={e => { setDraft(e.target.value); setValidation(null); }} />
      <div className="flex gap-3"><button className={button} onClick={() => setValidation(validatePhysicsScenario(parse()))}>Validate scenario</button><button className={button} onClick={() => { const value = parse(), checked = validatePhysicsScenario(value); setValidation(checked); if (checked.valid) dispatch({ type: "compose_scenario", scenario: value }); }}>Publish scenario</button></div>
      {validation && <div role="status"><p>{validation.valid ? "Scenario matches the registered semantic contract. This is not empirical validation." : "Scenario needs repair."}</p>{validation.issues.map((i, n) => <p className="text-sm text-amber-200" key={n}>{i.path}: {i.code}</p>)}</div>}
    </div></details>
  </div>;
}
