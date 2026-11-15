import { captureAccountOperationScope } from "@/lib/workstation/accountOperationScope";
import { physicsCalculationRequestSchema } from "@shared/atomic-response/calculate";
import { PreviewCalculationGate,sandboxCalculationMessageSchema } from "@shared/physics-glyphs/calculation-bridge";
import React, { useEffect, useRef, useState } from "react";
import { createPhysicsGlyphSandboxDocument, PHYSICS_GLYPH_SANDBOX_EXAMPLE, readPhysicsGlyphSandboxCommand } from "@shared/physics-glyphs/sandbox";
import { observePhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";

export function PhysicsGlyphSandbox() {
  const gate=useRef(new PreviewCalculationGate());
  const generation=useRef(crypto.randomUUID());
  const [allowCalculations,setAllowCalculations]=useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const workspace = usePhysicsGlyphWorkspaceStore(state => state.workspace);
  const profileKey = usePhysicsGlyphWorkspaceStore(state => state.profileKey);
  const [code, setCode] = useState(PHYSICS_GLYPH_SANDBOX_EXAMPLE);
  const [document, setDocument] = useState<string | null>(null);
  const [documentProfileKey, setDocumentProfileKey] = useState<string | null>(null);
  const [allowCommands, setAllowCommands] = useState(false);
  const [requestText,setRequestText]=useState("");
  const [calculationNotice,setCalculationNotice]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { gate.current.revoke();generation.current=crypto.randomUUID();setAllowCalculations(false);setRequestText("");setCalculationNotice(null);setDocument(null); setCode(PHYSICS_GLYPH_SANDBOX_EXAMPLE); setAllowCommands(false); setError(null); }, [profileKey]);
  // The panel remounts this component on composition/profile changes. Counterfactuals
  // update its snapshot without replacing the document or enabling command authority.
  useEffect(() => {
    if (workspace.scene.configuration.preset === "scenario" && workspace.scene.configuration.scenario.schema === "helix.physics_scenario.v3") {
      setDocumentProfileKey(profileKey);
      setDocument(createPhysicsGlyphSandboxDocument(PHYSICS_GLYPH_SANDBOX_EXAMPLE, observePhysicsGlyphWorkspace(workspace),generation.current));
    }
  }, [profileKey]);
  const sendSnapshot = () => {
    usePhysicsGlyphWorkspaceStore.getState().syncProfile();
    const store = usePhysicsGlyphWorkspaceStore.getState();
    if (store.profileKey !== documentProfileKey) return;
    frame.current?.contentWindow?.postMessage({ type: "helix.physics-glyph.snapshot.v1", snapshot: observePhysicsGlyphWorkspace(store.workspace) }, "*");
  };
  useEffect(() => { sendSnapshot(); }, [workspace]);
  const queueCalculation=(request:unknown,onReply?:(reply:any)=>void)=>{
    const parsed=physicsCalculationRequestSchema.safeParse(request);if(!parsed.success){setCalculationNotice("Invalid bounded calculation request; no execution.");return;}
    usePhysicsGlyphWorkspaceStore.getState().syncProfile();
    const store=usePhysicsGlyphWorkspaceStore.getState();
    if(store.profileKey!==documentProfileKey)return;
    const isAccountCurrent=captureAccountOperationScope();
    const key=store.profileKey,revision=store.workspace.scene.revision,sceneId=store.workspace.scene.id,activeGeneration=generation.current;
    if(gate.current.enabled)store.beginCalculation(parsed.data);
    const current=()=>{const now=usePhysicsGlyphWorkspaceStore.getState();return isAccountCurrent()&&now.profileKey===key&&generation.current===activeGeneration&&now.workspace.scene.id===sceneId&&now.workspace.scene.revision===revision;};
    gate.current.submit(parsed.data,current).then(reply=>{if(!current())return;if(reply.status==="completed")reply.commitStatus=usePhysicsGlyphWorkspaceStore.getState().acceptCalculation(parsed.data,reply.output);if(reply.status==="rate-limited"){setAllowCalculations(false);setError(reply.reason);}setCalculationNotice(reply.commitStatus??reply.status);onReply?.(reply);});
  };

  useEffect(()=>()=>gate.current.revoke(),[]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      usePhysicsGlyphWorkspaceStore.getState().syncProfile();
      if (usePhysicsGlyphWorkspaceStore.getState().profileKey !== documentProfileKey) return;
      const calculation=sandboxCalculationMessageSchema.safeParse(event.data);
      if(calculation.success){const msg=calculation.data,store=usePhysicsGlyphWorkspaceStore.getState();
        if(msg.generation!==generation.current||msg.sceneId!==store.workspace.scene.id||msg.sceneRevision!==store.workspace.scene.revision)return;
        queueCalculation(msg.request,reply=>frame.current?.contentWindow?.postMessage({type:"helix.physics-glyph.calculation-result.v1",generation:msg.generation,requestId:msg.requestId,result:reply},"*"));return;
      }
      const parsed = readPhysicsGlyphSandboxCommand(event.data);
      if (!parsed.success) return;
      if (!allowCommands) { setError("Scene commands are disabled for this preview."); return; }
      const result = usePhysicsGlyphWorkspaceStore.getState().dispatch(parsed.data.command);
      setError(result.ok ? null : result.error ?? "Scene command rejected.");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [allowCommands, documentProfileKey]);
  return <details><summary className="cursor-pointer">Generated display sandbox</summary><div className="mt-3 space-y-3">
    <p className="text-sm text-slate-300">Use HelixGlyph.renderGlyph(id), formatMetric(metric), inspectCatalog(query), renderStory(snapshot, step), renderScenario(snapshot, perspective), and onScene(callback). The glyph-story and scenario renderers are shared with the panel. Scene commands can be enabled below.</p>
    {workspace.scene.configuration.preset === "scenario" && <button className="rounded border border-slate-600 px-3 py-2" onClick={() => setCode(PHYSICS_GLYPH_SANDBOX_EXAMPLE)}>Use shared scenario display</button>}
    <textarea aria-label="Display JavaScript" className="min-h-64 w-full rounded border border-slate-600 bg-slate-900 p-3 font-mono text-sm" maxLength={32768} value={code} onChange={event => setCode(event.target.value)} />
    <div className="flex flex-wrap items-center gap-4"><button className="rounded border border-slate-600 px-3 py-2" onClick={() => {
      try { gate.current.revoke();generation.current=crypto.randomUUID();setAllowCalculations(false);setDocumentProfileKey(usePhysicsGlyphWorkspaceStore.getState().profileKey); setDocument(createPhysicsGlyphSandboxDocument(code, observePhysicsGlyphWorkspace(usePhysicsGlyphWorkspaceStore.getState().workspace),generation.current)); setError(null); }
      catch { setError("Display code is too large."); }
    }}>Run display</button><label className="flex items-center gap-2"><input type="checkbox" checked={allowCommands} onChange={event => setAllowCommands(event.target.checked)} />Allow this preview to configure the scene</label></div>
    <label className="flex items-center gap-2"><input type="checkbox" checked={allowCalculations} onChange={event=>{setAllowCalculations(event.target.checked);if(event.target.checked)gate.current.enabled=true;else gate.current.revoke();}}/>Enable calculations for this preview</label>
    <details><summary>Calculation requests and model capabilities</summary><p>Optional deterministic calculation layer; no scene selection or scientific reinterpretation is performed here.</p><button onClick={()=>{const c=usePhysicsGlyphWorkspaceStore.getState().workspace.scene.configuration;const r=c.preset==="scenario"&&c.scenario.schema==="helix.physics_scenario.v3"?c.scenario.scientificRecord:null;const request=r?.sampledEvidence?.[0]?.request??(r?.calculations[0]?.inputJSON?{operatorId:r.calculations[0].operator,operatorVersion:r.calculations[0].version,request:JSON.parse(r.calculations[0].inputJSON)}:null);setRequestText(request?JSON.stringify(request,null,2):"{}");}}>Inspect declared calculation request</button><textarea aria-label="Bounded calculation request JSON" maxLength={32768} value={requestText} onChange={event=>{setRequestText(event.target.value);if(gate.current.enabled){try{queueCalculation(JSON.parse(event.target.value));}catch{setCalculationNotice("Request JSON is incomplete; no execution.");}}}} className="min-h-40 w-full bg-slate-900 font-mono"/><button onClick={()=>{try{queueCalculation(JSON.parse(requestText));}catch{setCalculationNotice("Invalid request JSON");}}}>Calculate declared request</button><p role="status">{calculationNotice}</p></details>
    <p className="text-xs">HelixGlyph.inspectModels(), requestCalculation(request), onCalculation(callback), getSampledArtifact(hash), renderSamples(result). 250 ms debounce; 120 starts/minute. New scientific interpretations return to Codex.</p>
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    {document && <iframe ref={frame} title="Generated physics glyph display" sandbox="allow-scripts" referrerPolicy="no-referrer" className="h-96 w-full rounded border border-slate-600" srcDoc={document} onLoad={sendSnapshot} />}
    <p className="text-xs text-slate-400">Preview output is a presentation. The result inspector remains tied to the registered calculation operator. Scene commands use HelixGlyph.sendCommand(command) with the current expectedRevision.</p>
  </div></details>;
}
