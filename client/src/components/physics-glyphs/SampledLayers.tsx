import React, { useState } from "react";
import type { PhysicsScenarioV3 } from "@shared/physics-glyphs/scenario-v3-contracts";
import { renderSampledLayer } from "@shared/physics-glyphs/sampled-layers";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
export function SampledLayers({scenario,workspaceStore=usePhysicsGlyphWorkspaceStore}:{scenario:PhysicsScenarioV3;workspaceStore?:typeof usePhysicsGlyphWorkspaceStore}){
  const [indices,setIndices]=useState<Record<string,number>>({});
  const workspace=workspaceStore(s=>s.workspace),refs=scenario.scientificRecord?.sampledEvidence??[];
  if(!refs.length)return null;
  const c=workspace.scene.configuration,same=c.preset==="scenario"&&c.scenario.schema==="helix.physics_scenario.v3"&&c.scenario.scientificRecord?.sceneHash===scenario.scientificRecord?.sceneHash;
  return <details><summary>Optional calculated layers</summary>{refs.map(ref=>{const payload=same?workspace.sampledArtifacts?.[ref.sha256]:null;return <section key={ref.id}>{payload?<div>{payload.shape.length===1&&<label>Calculated playback sample<input aria-label={`Playback sample ${ref.id}`} type="range" min={0} max={payload.shape[0]-1} value={indices[ref.id]??payload.shape[0]-1} onChange={event=>setIndices({...indices,[ref.id]:Number(event.target.value)})}/></label>}<div dangerouslySetInnerHTML={{__html:renderSampledLayer(payload,indices[ref.id])}}/></div>:<p>Sampled artifact unavailable; request the exact declared calculation. {ref.request.operatorId}</p>}</section>;})}</details>;
}
