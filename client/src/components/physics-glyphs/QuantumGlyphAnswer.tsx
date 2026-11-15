import React, { useState } from "react";
import { UnifiedQuantumGlyphAnswer } from "./UnifiedQuantumGlyphAnswer";
import type { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import type { PhysicsScenarioDocument } from "@shared/physics-glyphs/scenario-contracts";
import { buildPhysicsScenarioV2Plan, renderPhysicsScenarioV2Plan } from "@shared/physics-glyphs/scenario-v2-presentation";
import { buildPhysicsScenarioPresentation } from "@shared/physics-glyphs/scenario-presentation";
import { buildQuantumGlyphStory, renderQuantumGlyphStory } from "@shared/physics-glyphs/glyph-story";
import { renderPhysicsGlyphMarkup, physicsGlyphMarkupRegistry } from "@shared/physics-glyphs/glyph-markup";

export function QuantumGlyphAnswer({ scenario, onWorkbench, onAssumptionChange, workspaceStore }: { scenario: PhysicsScenarioDocument | null; onWorkbench: () => void; onAssumptionChange?: (controlId: string, optionId: string) => void; workspaceStore?: typeof usePhysicsGlyphWorkspaceStore }) {
  const [step, setStep] = useState(0);
  if (scenario?.schema === "helix.physics_scenario.v3") return <UnifiedQuantumGlyphAnswer scenario={scenario} onWorkbench={onWorkbench} onAssumptionChange={onAssumptionChange} workspaceStore={workspaceStore} />;
  const v2Plan = scenario?.schema === "helix.physics_scenario.v2" ? buildPhysicsScenarioV2Plan(scenario) : null;
  const story = v2Plan ?? (scenario ? buildQuantumGlyphStory(scenario as Extract<PhysicsScenarioDocument, { schema: "helix.physics_scenario.v1" }>, buildPhysicsScenarioPresentation(scenario as Extract<PhysicsScenarioDocument, { schema: "helix.physics_scenario.v1" }>, "everyday")) : null);
  const count = story?.steps.length ?? 0;
  const glyph = (id: string) => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry);
  const action = count === 0 ? "Inspect the unresolved question" : step === count ? "Restart the quantum path" : step === 0 ? "Unfold the quantum relations" : "Continue toward the macroscopic response";
  return <section className="group relative min-h-80 rounded-2xl bg-slate-950 px-2 py-8 text-slate-100" aria-label="Quantum glyph answer">
    <div className="absolute right-2 top-2 flex gap-1 opacity-30 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {step > 0 && <button type="button" aria-label="Previous relation" title="Previous relation" className="rounded px-3 py-1 hover:bg-slate-800 focus-visible:outline" onClick={() => setStep(n => Math.max(0, n - 1))}>‹</button>}
      <button type="button" aria-label="Open physics workbench" title="Inspect states, tools and display code" className="rounded px-3 py-1 hover:bg-slate-800 focus-visible:outline" onClick={onWorkbench}>···</button>
    </div>
    {story ? <>
      <button type="button" className="block w-full cursor-pointer rounded-2xl text-left focus-visible:outline focus-visible:outline-sky-300" aria-label={action} onClick={event => {
        if (!count || (event.target as Element).closest?.('[data-mark-role="unresolved"]')) onWorkbench();
        else setStep(n => n >= count ? 0 : n + 1);
      }}>
        <div dangerouslySetInnerHTML={{ __html: v2Plan ? renderPhysicsScenarioV2Plan(v2Plan, glyph, step) : renderQuantumGlyphStory(story as ReturnType<typeof buildQuantumGlyphStory>, glyph, step) }} />
      </button>
      <div className="mt-5 flex justify-center gap-2" aria-label={`Guided path: ${step} of ${count} relations revealed`}>
        {Array.from({ length: count + 1 }, (_, index) => <button key={index} type="button" aria-label={index === 0 ? "Return to quantum glyphs" : `Reveal ${story.steps[index - 1].title}`} aria-current={index === step ? "step" : undefined}
          className={`h-1.5 w-1.5 rounded-full focus-visible:outline focus-visible:outline-sky-300 ${index === step ? "bg-sky-200" : "bg-slate-700 hover:bg-slate-400"}`} onClick={() => setStep(index)} />)}
      </div>
      {step > 0 && <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-relaxed text-slate-500">Qualitative explanatory path · representative glyphs, not particle counts. Inspect the workbench for assumptions, unknowns and provenance.</p>}
    </> : <div className="flex min-h-64 items-center justify-center" aria-label="Awaiting a scenario from your connected chat"><span className="sr-only">Ask your connected Codex chat to compose a scenario. Open the workbench to connect the panel.</span></div>}
  </section>;
}
