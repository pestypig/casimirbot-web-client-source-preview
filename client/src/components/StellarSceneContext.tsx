import React from 'react';
import {prepareStellarSceneParameters,stellarSceneDisplayAuthority,verifyStellarSceneParameters,
  type StellarSceneParameters} from '../../../shared/stellar-scene-parameters';

const maxBytes=256_000;
const emptyParameters={mass:null,age:null,metallicity:null,radius:null,rotationPeriod:null,effectiveTemperature:null};

export function StellarSceneContext(){
  const [scene,setScene]=React.useState<StellarSceneParameters|null>(null);
  const [message,setMessage]=React.useState('No stellar scene loaded.');
  const loadSunScaffold=async()=>{
    const next=await prepareStellarSceneParameters({schemaVersion:'stellar-scene-parameters/1',
      target:{objectId:'Sun',displayName:'Sun · planning scaffold',solarSystemSun:true,
        spectralClass:'G',luminosityClass:'V',classificationBasis:'illustrative_input',
        classificationSourceId:'sun-planning-scaffold',evolutionaryStage:'main_sequence',
        stageBasis:'illustrative_input',stageSourceId:'sun-planning-scaffold'},
      parameters:emptyParameters,layers:[],solarReference:null,solarSphereSceneId:null,
      fullSurfaceObserved:false,stellarEvolutionCalibrated:false,
      modelObservationComparisonAdmitted:false,scientificAdmission:false,sourceIdentityAuthenticated:false});
    setScene(next);setMessage('Loaded a Sun planning scaffold: no observations or MESA model are attached.');
  };
  const loadFile=async(file:File|undefined)=>{
    if(!file)return;
    try{
      if(file.size>maxBytes)throw new Error('Scene JSON exceeds the 256 KB limit');
      const next=await verifyStellarSceneParameters(JSON.parse(await file.text()));
      setScene(next);setMessage(`Verified local scene content ID ${next.sceneId}; sources remain unauthenticated.`);
    }catch(error){setMessage(`Scene rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  };
  const authority=scene?stellarSceneDisplayAuthority(scene):null;
  return <section aria-label="Stellar scene context" className="space-y-2 rounded border border-violet-700/40 bg-slate-950/70 p-3 text-xs text-slate-300">
    <h2 className="text-sm font-semibold text-slate-100">Stellar scene · comparison context</h2>
    <p className="text-slate-400">The Sun is the reference target. Other stellar classes can be described with the same parameter and evidence fields, but a reconstructed or unresolved surface is not a directly observed solar-style disk.</p>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={()=>void loadSunScaffold()} className="rounded border border-violet-600 px-2 py-1 text-violet-100">Load Sun planning scaffold</button>
      <label>Import exact-ID stellar scene JSON <input type="file" accept="application/json,.json" aria-label="Import stellar scene JSON"
        onChange={event=>{void loadFile(event.target.files?.[0]);event.target.value='';}} className="ml-2 max-w-60 text-xs" /></label>
    </div>
    <p role="status" className="break-all text-amber-200">{message}</p>
    {scene&&<div className="space-y-1 break-all" aria-label="Loaded stellar scene">
      <p>Scene ID: {scene.sceneId}</p>
      <p>Target: {scene.target.displayName} · {scene.target.spectralClass??'spectral class unknown'}{scene.target.luminosityClass??''} · {scene.target.evolutionaryStage.replaceAll('_',' ')}</p>
      <p>Class basis: {scene.target.classificationBasis??'unavailable'} · evolutionary stage basis: {scene.target.stageBasis}</p>
      <p>Parameters: {Object.entries(scene.parameters).map(([name,value])=>
        `${name} ${value?`${value.value} ${value.unit} (${value.basis}; ${value.uncertainty===null?'uncertainty unavailable':`±${value.uncertainty}`})`:'unavailable'}`).join(' · ')}</p>
      <p>Solar model reference: {scene.solarReference?`${scene.solarReference.runId} (${scene.solarReference.maturity}; declared, not admitted)`:'none attached'} · Solar sphere scene: {scene.solarSphereSceneId??'none attached'}</p>
      <p>Layers: {authority?.layerCount??0} · unresolved integrated: {authority?.unresolvedLayerCount??0} · registered solar disk: {authority?.registeredSolarDisk?'yes, sampled geometry only':'no'}</p>
      {scene.layers.map(item=><p key={`${item.kind}:${item.productId}`}>{item.kind}: {item.productId} · {item.basis} · {item.spatialSupport} · {item.observedAtUtc??'no observation time'} · uncertainty {item.uncertaintyStatus.replaceAll('_',' ')}</p>)}
      <p className="text-amber-200">No observed whole sphere or admitted model–observation comparison. This local scene is a typed research index; it does not execute StarSim/MESA, authenticate supplied sources, retain a profile record, or expose an MCP read yet.</p>
    </div>}
  </section>;
}
