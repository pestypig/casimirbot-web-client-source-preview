import React from "react";
import type { PhysicsGlyphConfiguration, PhysicsGlyphResult } from "@shared/physics-glyphs/contracts";
import { PHYSICS_GLYPH_ATOMS } from "@shared/physics-glyphs/catalog";
import { ParticleGlyph } from "./ParticleGlyph";
import { buildPhysicsScenarioPresentation, renderPhysicsScenarioHtml } from "@shared/physics-glyphs/scenario-presentation";
import { renderPhysicsGlyphMarkup, physicsGlyphMarkupRegistry } from "@shared/physics-glyphs/glyph-markup";
import { buildPhysicsScenarioV2Plan, renderPhysicsScenarioV2Plan } from "@shared/physics-glyphs/scenario-v2-presentation";
import { buildPhysicsScenarioV3Plan, renderPhysicsScenarioV3Plan } from "@shared/physics-glyphs/scenario-v3-presentation";

function Probability({ label, value }: { label: string; value: number }) {
  return <div className="space-y-2"><div className="flex justify-between gap-3"><span>{label}</span><span className="tabular-nums">{(value * 100).toFixed(1)}%</span></div>
    <div className="h-3 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-300" style={{ width: `${value * 100}%` }} /></div></div>;
}
export function PhysicsGlyphDiagram({ configuration: c, result, onSelectParticle }: {
  configuration: PhysicsGlyphConfiguration; result: PhysicsGlyphResult | null; onSelectParticle: (id: "e" | "photon" | "nue") => void;
}) {
  const value = (id: string) => result?.metrics.find(metric => metric.id === id)?.value;
  const face = (id: "e" | "photon" | "nue", label: string, phaseDeg?: number) => <button type="button" className="flex flex-col items-center gap-2 rounded-lg p-2 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" onClick={() => onSelectParticle(id)} aria-label={`Inspect ${label}`}>
    <ParticleGlyph id={id} phaseDeg={phaseDeg} /><span>{label}</span></button>;
  switch (c.preset) {
    case "scenario": return <div dangerouslySetInnerHTML={{ __html: c.scenario.schema === "helix.physics_scenario.v3"
      ? renderPhysicsScenarioV3Plan(buildPhysicsScenarioV3Plan(c.scenario, c.perspective), id => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry), c.scenario.presentation.steps.length)
      : c.scenario.schema === "helix.physics_scenario.v2"
      ? renderPhysicsScenarioV2Plan(buildPhysicsScenarioV2Plan(c.scenario, c.perspective), id => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry), c.scenario.story.steps.length)
      : renderPhysicsScenarioHtml(buildPhysicsScenarioPresentation(c.scenario, c.perspective), id => renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry)) }} />;
    case "feynman": return <div className="space-y-3"><div className="flex justify-around"><div className="text-center"><ParticleGlyph id="e" /><p>e⁻</p></div><div className="text-center"><ParticleGlyph id="mu" /><p>μ⁻</p></div></div>
      <svg viewBox="0 0 500 180" className="w-full text-sky-200" role="img" aria-label="Schematic electron muon scattering with an internal virtual photon, not spacetime trajectories">
        <path d="M120 10L170 90L120 170M380 10L330 90L380 170" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M170 90Q180 70 190 90T210 90T230 90T250 90T270 90T290 90T310 90T330 90" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <text x="250" y="60" textAnchor="middle" fill="currentColor">γ* · internal</text><circle cx="170" cy="90" r="4" fill="currentColor" /><circle cx="330" cy="90" r="4" fill="currentColor" />
      </svg><div className="flex justify-around"><div className="text-center"><ParticleGlyph id="e" /><p>e⁻</p></div><div className="text-center"><ParticleGlyph id="mu" /><p>μ⁻</p></div></div><p className="text-center text-sm text-slate-300">No numerical amplitude or phase has been calculated.</p></div>;
    case "phase": return <div className="space-y-6" aria-label="Two-path interference scene">
      <div className="flex justify-center">{face("photon", "Input photon")}</div><p className="text-center text-sm text-slate-300">One photon · two path components of its shared state</p>
      <div className="grid grid-cols-2 gap-8 text-center"><div>{face("photon", "Path A · reference 0°", c.pathRecord ? undefined : 0)}</div><div>{face("photon", `Path B · ${c.phaseDeg}°`, c.pathRecord ? undefined : c.phaseDeg)}</div></div>
      <p className="text-center text-slate-300">{c.pathRecord ? "Path record retained · coherence removed" : "Coherent recombination · balanced paths"}</p>
      {result && <div className="grid gap-5 sm:grid-cols-2"><Probability label="Detector 0" value={value("p0")!} /><Probability label="Detector 1" value={value("p1")!} /></div>}
    </div>;
    case "atom": {
      const atom = PHYSICS_GLYPH_ATOMS[c.element];
      return <div className="space-y-5" aria-label={`${atom.name} orbital occupations`}><p className="text-lg">{c.element} · {atom.name} · {atom.configuration}</p>
        {atom.core > 0 && <div className="rounded-lg border border-slate-600 p-3">Collapsed core · {atom.core} electrons</div>}
        {atom.shells.map(shell => <div key={shell.label}><p className="mb-2">{shell.label}</p><div className="flex flex-wrap gap-2">{shell.occupancy.map((count, i) => <div key={i} className="flex min-h-20 min-w-16 items-center justify-center rounded border border-slate-500" aria-label={`${shell.label} orbital ${i + 1}: ${count} electrons`}>
          {count === 0 ? "Empty" : <>{Array.from({ length: count }, (_, j) => <div key={j} className="flex flex-col items-center"><ParticleGlyph id="e" size={30} /><span>{j === 0 ? "↑z" : "↓z"}</span></div>)}</>}
        </div>)}</div></div>)}<p className="text-sm text-slate-300">One basis-state occupancy pattern. Paired electrons belong to a shared state.</p></div>;
    }
    case "spin": return <div className="space-y-5">{face("e", "Electron spin", c.preparation === "transverse" ? c.phaseDeg : undefined)}
      <p>{c.preparation === "mixed" ? "Unpolarized mixture · zero Bloch polarization" : c.preparation === "up" ? "Pure spin up along z" : `Coherent transverse state · phase ${c.phaseDeg}° relative to +x`}</p>
      {result && <><Probability label="Measurement +x" value={value("px")!} /><Probability label="Measurement +z" value={value("pz")!} /></>}</div>;
    case "current": return <div className="space-y-5">{face("e", "Electron ensemble")}<div className="flex justify-around gap-4 text-center"><div><p>Electron drift</p><p className="text-3xl">{c.drift === 0 ? "·" : c.drift > 0 ? "→" : "←"}</p><p>{c.drift.toFixed(2)} v₀</p></div><div><p>Conventional current</p><p className="text-3xl">{c.drift === 0 ? "·" : c.drift > 0 ? "←" : "→"}</p></div><div><p>Spin polarization along z</p><p className="text-3xl">{c.polarization === 0 ? "↑↓" : c.polarization > 0 ? "↑" : "↓"}</p></div></div>
      {result && <><Probability label="↑z population" value={value("up")!} /><Probability label="↓z population" value={value("down")!} /></>}</div>;
    case "casimir": return <div className="space-y-4"><p className="text-center">EM ground state · n = 0 · no outgoing photons</p>
      <svg viewBox="0 0 500 220" role="img" aria-label={`Stationary ideal plates separated by ${c.separationNm} nm; schematic field curves and inward force arrows`} className="w-full text-sky-200">
        <rect x="120" y="30" width="10" height="145" fill="currentColor" /><rect x="370" y="30" width="10" height="145" fill="currentColor" />
        {[60, 100, 140].map(y => <path key={y} d={`M135 ${y} Q190 ${y - 30} 250 ${y} T365 ${y}`} stroke="currentColor" fill="none" opacity="0.5" />)}
        <text x="75" y="108" fill="currentColor" fontSize="28">→</text><text x="400" y="108" fill="currentColor" fontSize="28">←</text><text x="250" y="210" textAnchor="middle" fill="currentColor">a = {c.separationNm} nm · geometry schematic</text>
      </svg></div>;
    case "driven": return <div className="space-y-5"><p className="text-center">External drive → two-mode field state</p><div className="flex justify-around">{face("photon", "Mode 1")}{face("photon", "Mode 2")}</div><p className="text-center">{c.squeezing === 0 ? "Vacuum · zero excess occupation" : "Correlated mode occupations · drive supplies energy"}</p><p className="text-sm text-slate-300">Faces identify the modes. Their number is not a photon-count sample.</p></div>;
    case "barrier": return <div className="space-y-5"><svg viewBox="0 0 500 180" className="w-full text-sky-200" role="img" aria-label="Rectangular barrier with energy below its height; dimensionless schematic">
      <path d={`M30 140H130V35H${150 + c.width * 40}V140H470`} stroke="currentColor" fill="none" strokeWidth="2" />
      <path d="M30 108H470" stroke="currentColor" fill="none" strokeDasharray="5 4" /><text x="35" y="98" fill="currentColor">E/V₀ = 0.30</text><text x="250" y="174" fill="currentColor" textAnchor="middle">Width = {c.width.toFixed(1)} ℓ₀</text></svg>
      {result && <Probability label="Transmission" value={value("transmission")!} />}<div className="rounded-lg border border-slate-600 p-4 text-center"><p>Separate schematic reaction</p><p className="mt-3">p + p → weak fusion + binding → d + e⁺ + νₑ</p><div className="flex justify-center">{face("nue", "Electron neutrino")}</div><p className="text-sm text-slate-300">No fusion rate or free-proton intermediate is calculated.</p></div></div>;
  }
}
