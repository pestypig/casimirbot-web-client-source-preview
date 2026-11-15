import { SampledLayers } from "./SampledLayers";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import React, { useMemo, useState } from "react";
import type { PhysicsScenarioV3 } from "@shared/physics-glyphs/scenario-v3-contracts";
import { buildPhysicsScenarioV3Plan, renderPhysicsScenarioV3Plan } from "@shared/physics-glyphs/scenario-v3-presentation";
import { renderPhysicsGlyphMarkup, physicsGlyphMarkupRegistry } from "@shared/physics-glyphs/glyph-markup";
import { PhysicsGenerationDetails } from "./PhysicsGenerationDetails";

export function UnifiedQuantumGlyphAnswer({ scenario, onWorkbench, onAssumptionChange, workspaceStore = usePhysicsGlyphWorkspaceStore }: {
  scenario: PhysicsScenarioV3; onWorkbench: () => void; onAssumptionChange?: (controlId: string, optionId: string) => void;
  workspaceStore?: typeof usePhysicsGlyphWorkspaceStore;
}) {
  const [step, setStep] = useState(0);
  const workspace=workspaceStore(s=>s.workspace);
  const plan = useMemo(() => buildPhysicsScenarioV3Plan(scenario), [scenario]), count = plan.presentation.steps.length;
  if(workspace.interpretationStatus==="needs-reinterpretation"&&workspace.scene.configuration.preset==="scenario"&&workspace.scene.configuration.scenario.question===scenario.question)return <section aria-label="Quantum glyph answer"><p>Inputs changed: prior evidence and captions are retired. Codex must review the new scientific interpretation.</p></section>;
  return <section aria-label="Quantum glyph answer" className="relative min-h-80 rounded-2xl bg-slate-950 px-4 py-8 text-slate-100">
    <button aria-label="Open physics workbench" className="absolute right-2 top-2 px-3 py-1" onClick={onWorkbench}>···</button>
    <button type="button" className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-sky-300"
      aria-label={count ? step === 0 ? "Unfold the quantum relations" : "Continue the physical explanation" : "Inspect the unresolved question"}
      onClick={event => { if (!count || (event.target as Element).closest?.('[data-mark-role="unresolved"]')) onWorkbench(); else setStep(n => n >= count ? 0 : n + 1); }}>
      <div dangerouslySetInnerHTML={{ __html: renderPhysicsScenarioV3Plan(plan, id => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry), step, false) }} />
    </button>
    <div className="mt-4 flex justify-center gap-2" aria-label={`Guided path: ${step} of ${count} relations revealed`}>
      {Array.from({ length: count + 1 }, (_, i) => <button key={i} className="h-2 w-2 rounded-full bg-slate-500" aria-label={i ? `Reveal ${plan.presentation.steps[i - 1].title}` : "Return to quantum glyphs"} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)} />)}
    </div>
    {step > 0 && <div className="mt-4 flex flex-wrap gap-3" aria-label="Scenario assumptions">{scenario.controls.map(c => <label key={c.id} className="text-sm">{c.label}
      <select aria-label={c.label} className="ml-2 rounded bg-slate-800 p-2" value={c.options.find(o => o.value === scenario.properties.find(p => p.id === c.propertyId)?.value)?.id ?? ""} onChange={e => onAssumptionChange?.(c.id, e.target.value)}>
        {c.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select></label>)}</div>}
    {step>0&&<SampledLayers scenario={scenario} workspaceStore={workspaceStore}/>}
    <PhysicsGenerationDetails scenario={scenario} assessment={plan.coverage.scientificRecord} />
  </section>;
}
