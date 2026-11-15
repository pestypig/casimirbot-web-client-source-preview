import React, { useEffect, useId, useState } from "react";
import { PHYSICS_GLYPH_ATOMS, PHYSICS_GLYPH_PARTICLES, PHYSICS_GLYPH_PRESETS, PHYSICS_GLYPH_THEORY_TITLES } from "@shared/physics-glyphs/catalog";
import type { PhysicsGlyphConfiguration, PhysicsGlyphPreset } from "@shared/physics-glyphs/contracts";
import { isPhysicsGlyphResultCurrent, serializePhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, fetchAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useDesktopStore } from "@/store/useDesktopStore";
import { ParticleGlyph } from "@/components/physics-glyphs/ParticleGlyph";
import { PhysicsGlyphDiagram } from "@/components/physics-glyphs/PhysicsGlyphDiagram";
import { projectPhysicsGlyphScene } from "@shared/physics-glyphs/projection";
import { PhysicsGlyphSandbox } from "@/components/physics-glyphs/PhysicsGlyphSandbox";
import { formatPhysicsGlyphMetricValue } from "@shared/physics-glyphs/format";
import { PhysicsGlyphChatConnection } from "@/components/physics-glyphs/PhysicsGlyphChatConnection";
import { PhysicsScenarioComposer } from "@/components/physics-glyphs/PhysicsScenarioComposer";
import { QuantumGlyphAnswer } from "@/components/physics-glyphs/QuantumGlyphAnswer";
import { PrepareFriendsSticker } from "@/components/physics-glyphs/PrepareFriendsSticker";

const button = "rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300";
function Range({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="space-y-2"><div className="flex justify-between gap-4"><label htmlFor={id}>{label}</label><output htmlFor={id} className="tabular-nums">{value} {unit}</output></div><input id={id} type="range" className="w-full accent-sky-300" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} /></div>;
}
function Parameters({ c, update }: { c: PhysicsGlyphConfiguration; update: (parameters: Record<string, string | number | boolean>) => void }) {
  switch (c.preset) {
    case "scenario": return <p className="text-sm text-slate-300">One declared scenario drives every perspective. Qualitative diagrams do not calculate physical results.</p>;
    case "feynman": return <p className="text-sm text-slate-300">Schematic amplitude graph · no numeric phase assigned.</p>;
    case "phase": return <><Range label="Relative phase" value={c.phaseDeg} min={0} max={360} unit="°" onChange={phaseDeg => update({ phaseDeg })} /><label className="flex items-center gap-2"><input type="checkbox" checked={c.pathRecord} onChange={e => update({ pathRecord: e.target.checked })} />Retain path record</label></>;
    case "atom": return <label>Element<select aria-label="Element" className="ml-3 rounded bg-slate-800 p-2" value={c.element} onChange={e => update({ element: e.target.value })}>{Object.entries(PHYSICS_GLYPH_ATOMS).map(([id, atom]) => <option value={id} key={id}>{atom.name} · {id}</option>)}</select></label>;
    case "spin": return <><label>Preparation<select className="ml-3 rounded bg-slate-800 p-2" aria-label="Spin preparation" value={c.preparation} onChange={e => update({ preparation: e.target.value })}><option value="up">Spin up along z</option><option value="transverse">Coherent transverse spin</option><option value="mixed">Unpolarized mixture</option></select></label>{c.preparation === "transverse" && <Range label="Spin relative phase" value={c.phaseDeg} min={0} max={360} unit="°" onChange={phaseDeg => update({ phaseDeg })} />}</>;
    case "current": return <><Range label="Electron drift / v₀" value={c.drift} min={-1} max={1} step={0.05} onChange={drift => update({ drift })} /><Range label="Spin polarization along z" value={c.polarization} min={-1} max={1} step={0.05} onChange={polarization => update({ polarization })} /></>;
    case "casimir": return <Range label="Plate separation" value={c.separationNm} min={100} max={1000} step={10} unit="nm" onChange={separationNm => update({ separationNm })} />;
    case "driven": return <Range label="Squeezing parameter" value={c.squeezing} min={0} max={1.5} step={0.05} onChange={squeezing => update({ squeezing })} />;
    case "barrier": return <Range label="Barrier width / ℓ₀" value={c.width} min={1} max={6} step={0.1} onChange={width => update({ width })} />;
  }
}
export default function PhysicsGlyphWorkspacePanel() {
  const store = usePhysicsGlyphWorkspaceStore();
  const [documentText, setDocumentText] = useState("");
  const [workbench, setWorkbench] = useState(false);
  const c = store.workspace.scene.configuration, preset = PHYSICS_GLYPH_PRESETS[c.preset];
  const current = isPhysicsGlyphResultCurrent(store.workspace), result = current ? store.workspace.result : null;
  const projection = projectPhysicsGlyphScene(store.workspace.scene);
  const selectedEntity = projection.entities.find(entity => entity.id === store.workspace.selectedEntityId);
  useEffect(() => { setDocumentText(""); setWorkbench(false); }, [store.profileKey]);
  useEffect(() => { setWorkbench(false); }, [store.presentationEpoch]);
  useEffect(() => {
    store.syncProfile();
    const sync = () => usePhysicsGlyphWorkspaceStore.getState().syncProfile();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, sync);
    void fetchAccountCapabilityPolicy().then(sync).catch(() => {});
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, sync);
  }, []);
  const dispatch = (command: Record<string, unknown>) => store.dispatch({ ...command, expectedRevision: store.workspace.scene.revision });
  const particle = PHYSICS_GLYPH_PARTICLES.find(p => p[0] === store.selectedParticle)!;
  const openBadge = (id: string) => {
    useTheoryBadgeGraphPanelStore.getState().setSelectedBadgeId(id);
    useTheoryBadgeGraphPanelStore.getState().setSelectedBadgeIds([id]);
    const layout = useWorkstationLayoutStore.getState();
    if (layout.mode === "workstation") layout.openPanelInActiveGroup("theory-badge-graph");
    else { useDesktopStore.getState().open("theory-badge-graph"); useDesktopStore.getState().focus("theory-badge-graph"); }
  };
  return <div className="min-h-full space-y-5 bg-slate-950 p-5 text-slate-100" data-testid="physics-glyph-workspace">
    <div hidden={workbench}><QuantumGlyphAnswer key={`${store.profileKey}:${store.presentationEpoch}`} scenario={c.preset === "scenario" ? c.scenario : null} onWorkbench={() => setWorkbench(true)} onAssumptionChange={(controlId, optionId) => dispatch({ type: "set_assumption", controlId, optionId })} /></div>
    {!workbench && store.error && <p role="alert" className="text-sm text-amber-200">{store.error}</p>}
    {c.preset === "scenario" && <PrepareFriendsSticker profileKey={store.profileKey} revision={store.workspace.scene.revision} />}
    <div hidden={!workbench} className="space-y-5">
    <button type="button" className="text-sm text-slate-400 hover:text-sky-200" onClick={() => setWorkbench(false)}>‹ Return to glyph answer</button>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Physics glyph workspace</h1><p className="mt-1 text-sm text-slate-300">Shared glyphs · explicit states · model-based results</p></div><div className="flex gap-2"><button className={button} onClick={store.save}>Save configuration</button><button className={button} onClick={store.reload}>Reload saved</button></div></header>
    <nav className="flex flex-wrap gap-2" aria-label="Physics presets">{Object.entries(PHYSICS_GLYPH_PRESETS).map(([id, definition]) => <button key={id} className={`${button} ${id === c.preset ? "bg-sky-900" : ""}`} aria-pressed={id === c.preset} onClick={() => dispatch({ type: "load_preset", preset: id as PhysicsGlyphPreset })}>{definition.title}</button>)}</nav>
    {store.error && <p role="alert" className="text-amber-200">{store.error}</p>}{store.notice && <p role="status" className="text-sky-200">{store.notice}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]"><main className="min-w-0 space-y-6">{c.preset !== "scenario" && <section className="space-y-4 rounded-lg border border-slate-700 p-4" aria-label="Scene parameters"><Parameters c={c} update={parameters => dispatch({ type: "set_parameters", parameters })} /></section>}
      {c.preset === "scenario" ? <PhysicsScenarioComposer key={store.profileKey} configuration={c} dispatch={dispatch}><section className="rounded-lg border border-slate-700 p-5" aria-label="Physics scene"><PhysicsGlyphDiagram configuration={c} result={result} onSelectParticle={store.selectParticle} /></section></PhysicsScenarioComposer> : <section className="rounded-lg border border-slate-700 p-5" aria-label="Physics scene"><PhysicsGlyphDiagram configuration={c} result={result} onSelectParticle={store.selectParticle} /></section>}
      <details><summary className="cursor-pointer">Particle alphabet</summary><div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">{PHYSICS_GLYPH_PARTICLES.map(p => <button type="button" className={`${button} flex flex-col items-center ${p[0] === particle[0] ? "bg-sky-900" : ""}`} aria-label={`Select ${p[2]}`} aria-pressed={p[0] === particle[0]} key={p[0]} onClick={() => store.selectParticle(p[0])}><ParticleGlyph id={p[0]} size={44} /><span>{p[1]}</span></button>)}</div></details>
    </main><aside className="space-y-5" aria-label="Scene inspector"><section className="space-y-3"><h2 className="font-semibold">Result inspector</h2><p className="text-sm text-slate-300">Scene revision {store.workspace.scene.revision} · {result ? result.representation.replaceAll("_", " ") : store.workspace.result ? "Result outdated" : "Not evaluated"}</p>
      {!result && <button className={button} onClick={() => dispatch({ type: "evaluate" })}>Calculate current scene</button>}
      {result && <><dl className="space-y-3">{result.metrics.map(metric => <div key={metric.id}><dt className="text-sm text-slate-300">{metric.label}</dt><dd className="font-mono tabular-nums" data-metric={metric.id}>{formatPhysicsGlyphMetricValue(metric)}</dd></div>)}</dl><p className="text-sm">{result.equation}</p><details><summary>{result.representation === "qualitative" ? "Composition identity" : "Calculation identity"}</summary><p className="mt-2 break-all text-xs">{result.operatorId} · version {result.operatorVersion} · scene {result.sceneId} · revision {result.sceneRevision}</p><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(result.inputs, null, 2)}</pre></details></>}
      <p className="text-sm text-slate-300">{preset.scope}</p><p className="text-xs text-slate-400">Educational model or reference configuration. No measurement or certification is asserted.</p></section>
      <section className="space-y-2"><h2 className="font-semibold">Selected particle</h2><div className="flex items-center gap-3"><ParticleGlyph id={particle[0]} size={44} /><p>{particle[2]} · {particle[1]}<br /><span className="text-sm text-slate-300">Spin {particle[5]} · charge {particle[4]} e</span></p></div><p className="text-xs text-slate-400">Particle identity is independent of the scene's quantum state.</p></section>
      <section className="space-y-2"><h2 className="font-semibold">Theory context</h2><p className="text-sm text-slate-300">Open registered concepts in the Theory Badge Graph. {c.preset === "scenario" ? "These links provide context for the declared mechanisms. They do not calculate or certify this scene." : "These links provide context; the local operator above supplies this scene's results."}</p>{projection.contextBadgeIds.map(id => <button className={`${button} block w-full break-words text-left`} key={id} onClick={() => openBadge(id)}>{PHYSICS_GLYPH_THEORY_TITLES[id] ?? id}</button>)}{!projection.contextBadgeIds.length && <p className="text-sm text-slate-400">Exact graph binding is not registered for this demo.</p>}</section>
      <section className="space-y-2" aria-label="Scene object inspector"><h2 className="font-semibold">Scene objects & states</h2>
        <div className="flex flex-wrap gap-2">{projection.entities.map(entity => <button key={entity.id} className={`${button} ${selectedEntity?.id === entity.id ? "bg-sky-900" : ""}`} aria-pressed={selectedEntity?.id === entity.id} onClick={() => dispatch({ type: "select_entity", entityId: entity.id })}>{entity.label}</button>)}</div>
        {selectedEntity && <div className="space-y-2"><p>{selectedEntity.label} · {selectedEntity.kind}</p><dl className="text-sm">{Object.entries(selectedEntity.properties).map(([key, value]) => <div className="flex flex-wrap justify-between gap-2" key={key}><dt className="text-slate-300">{key}</dt><dd>{String(value)}</dd></div>)}</dl>
          <ul className="space-y-1 text-sm text-slate-300">{projection.relationships.filter(edge => edge.from === selectedEntity.id || edge.to === selectedEntity.id).map((edge, i) => <li key={i}>{projection.entities.find(e => e.id === edge.from)?.label} · {edge.relation.replaceAll("_", " ")} · {projection.entities.find(e => e.id === edge.to)?.label}</li>)}</ul></div>}
      </section>
    </aside></div>
    <details><summary className="cursor-pointer">Workspace document</summary><div className="mt-3 space-y-3"><p className="text-sm text-slate-300">Copy or load a configuration and its temporary notation. Supplied inputs remain inputs; qualitative scenes do not run a numerical simulation.</p><button className={button} onClick={() => setDocumentText(serializePhysicsGlyphWorkspace(store.workspace))}>Show configuration JSON</button><textarea aria-label="Workspace configuration JSON" className="block min-h-40 w-full rounded border border-slate-600 bg-slate-900 p-3 font-mono text-sm" value={documentText} maxLength={262144} onChange={e => setDocumentText(e.target.value)} /><button className={button} onClick={() => store.importDocument(documentText)}>Load configuration JSON</button></div></details>
    <PhysicsGlyphChatConnection />
    <PhysicsGlyphSandbox key={`${store.profileKey}:${store.presentationEpoch}`} />
    </div>
  </div>;
}
