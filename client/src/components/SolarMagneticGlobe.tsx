import React from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Line,OrbitControls} from '@react-three/drei';
import {BufferGeometry,Color,DataTexture,Float32BufferAttribute,LinearFilter,PointsMaterial,Quaternion,RGBAFormat,SRGBColorSpace,UnsignedByteType,Vector3} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {deriveSolarEquivalentDipole,solarGlobalRadialMapContentId,solarGlobalRadialMapSchema,type SolarGlobalRadialMap} from '../../../shared/solar-magnetic-dipole';
import {verifySolarPfssGeometry,type SolarPfssGeometry} from '../../../shared/solar-pfss-geometry';
import {verifySolarMagneticLosDiagnostic,type SolarMagneticLosDiagnostic} from '../../../shared/solar-magnetic-los-diagnostic';
import {prepareSolarMagneticViewRecipe,verifySolarMagneticViewRecipe,
  type SolarMagneticViewRecipe,type SolarMagneticViewRecipePayload} from '../../../shared/solar-magnetic-view-recipe';
import {prepareSolarMagneticComparisonBundle,verifySolarMagneticComparisonBundle} from '../../../shared/solar-magnetic-comparison-bundle';
import {verifySolarSphereRegistration,type SolarSphereRegistration} from '../../../shared/solar-sphere-registration';
import {buildSolarSphereScene,type SolarSphereScene} from '../../../shared/solar-sphere-scene';
import {compareDisplayedHmiLosToMapL1,projectRadialL1ToLos} from '../../../shared/solar-magnetic-dipole-los-comparison';
import {solarActiveRegionMarkers,type SolarActiveRegionEvent,type SolarActiveRegionMarker} from '../../../shared/solar-active-region-markers';
import {SolarMagneticBundleStorage} from './SolarMagneticBundleStorage';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';

const MAX_FILE_BYTES=4_000_000;
const MAX_RETAINED_BUNDLE_BYTES=1_500_000;
const radius=1;
const initialCamera:[number,number,number]=[0.45,0.9,3.4];

function CameraPose({position,controls}:{position:[number,number,number];controls:React.RefObject<OrbitControlsImpl|null>}){
  const {camera}=useThree();
  React.useEffect(()=>{
    camera.position.set(...position);camera.lookAt(0,0,0);
    controls.current?.update();
  },[camera,controls,position]);
  return null;
}

function xyz(r:number,latitude:number,longitude:number):[number,number,number] {
  const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180;
  return [r*Math.cos(lat)*Math.cos(lon),r*Math.sin(lat),r*Math.cos(lat)*Math.sin(lon)];
}

function makeTexture(map:SolarGlobalRadialMap) {
  const pixels=new Uint8Array(map.longitudeCells*map.sineLatitudeCells*4);
  const sortedMagnitudes=map.radialGauss.map(Math.abs).sort((a,b)=>a-b);
  const scale=Math.max(1,sortedMagnitudes[Math.floor(0.98*(sortedMagnitudes.length-1))]);
  for(let j=0;j<map.sineLatitudeCells;j++)for(let i=0;i<map.longitudeCells;i++){
    const k=j*map.longitudeCells+i;
    // Three's sphere u grows toward decreasing Carrington longitude in our xyz frame.
    // DataTexture starts at the south/bottom row; the source grid is south-to-north.
    const p=(j*map.longitudeCells+(map.longitudeCells-1-i))*4;
    const normalized=Math.asinh(map.radialGauss[k]/(scale/4))/Math.asinh(4);
    const strength=Math.min(1,Math.abs(normalized));
    const contrast=map.observedMaskStatus==='provided'&&!map.observedCellMask[k]?0.78:1;
    pixels[p]=Math.round((normalized>0.06?55+185*strength:35)*contrast);
    pixels[p+1]=Math.round(45*contrast);
    pixels[p+2]=Math.round((normalized< -0.06?65+185*strength:48)*contrast);
    pixels[p+3]=255;
  }
  const texture=new DataTexture(pixels,map.longitudeCells,map.sineLatitudeCells,RGBAFormat,UnsignedByteType);
  texture.colorSpace=SRGBColorSpace;
  texture.magFilter=LinearFilter;
  texture.minFilter=LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

function DipoleLines({color,opacity}:{color:string;opacity:number}){
  const loops=React.useMemo(()=>[1.2,1.4,1.6].flatMap((shell)=>[0,45,90,135].map((azimuth)=>{
    const points:[number,number,number][]=[];
    for(let index=0;index<=96;index++){
      const theta=index*Math.PI/96,r=shell*Math.sin(theta)**2;
      if(r<1.015)continue;
      points.push(xyz(r,90-theta*180/Math.PI,azimuth));
    }
    return points;
  })),[]);
  return <>{loops.map((points,index)=><Line key={index} points={points} color={color} lineWidth={1.2} transparent opacity={opacity} />)}</>;
}

function ObservedLosResidualMarkers({diagnostic,dipoleVector,colorBasis}:{diagnostic:SolarMagneticLosDiagnostic;
  dipoleVector:[number,number,number]|null;colorBasis:'map_residual'|'radial_l1_residual'}){
  const {geometry,material}=React.useMemo(()=>{
    const positions:number[]=[],colors:number[]=[];
    const low=new Color('#a7f3d0'),high=new Color('#fb923c');
    for(const point of diagnostic.displayPoints){
      positions.push(...xyz(1.025,point.latitudeDeg,point.longitudeDeg));
      const projected=colorBasis==='radial_l1_residual'&&dipoleVector
        ?projectRadialL1ToLos(dipoleVector,point.latitudeDeg,point.longitudeDeg,point.mu)
        :point.projectedMapLosGauss;
      const strength=Math.min(1,Math.abs(point.measuredLosGauss-projected)/100);
      const color=low.clone().lerp(high,strength);
      colors.push(color.r,color.g,color.b);
    }
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
    return {geometry,material:new PointsMaterial({size:0.03,sizeAttenuation:true,vertexColors:true})};
  },[diagnostic,dipoleVector,colorBasis]);
  React.useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  return <points geometry={geometry} material={material}/>;
}

function MagneticScene({map,model,diagnostic,registration,showRegistration,selectedAnchorIndex,onAnchorSelect,dipole,showDipole,showDerivedDipole,showPfss,showLos,losColorBasis,catalogMarkers,showCatalogMarkers,selectedCatalogEventId,onCatalogEventSelect,cameraPosition,onCameraChange}:{map:SolarGlobalRadialMap|null;
  model:SolarPfssGeometry|null;dipole:ReturnType<typeof deriveSolarEquivalentDipole>|null;
  diagnostic:SolarMagneticLosDiagnostic|null;showDipole:boolean;showDerivedDipole:boolean;showPfss:boolean;showLos:boolean;
  registration:SolarSphereRegistration|null;showRegistration:boolean;
  selectedAnchorIndex:number|null;onAnchorSelect:(index:number)=>void;
  losColorBasis:'map_residual'|'radial_l1_residual';
  catalogMarkers:SolarActiveRegionMarker[];showCatalogMarkers:boolean;selectedCatalogEventId:string|null;
  onCatalogEventSelect?:(id:string)=>void;
  cameraPosition:[number,number,number];onCameraChange:(position:[number,number,number])=>void}){
  const controls=React.useRef<OrbitControlsImpl|null>(null);
  const {camera}=useThree();
  const texture=React.useMemo(()=>map?makeTexture(map):null,[map]);
  const dipoleOrientation=React.useMemo(()=>{
    if(!dipole || dipole.magnitudeGauss<1e-6)return null;
    const [x,y,z]=dipole.vectorGauss;
    return new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(x,z,y).normalize());
  },[dipole]);
  React.useEffect(()=>()=>{texture?.dispose();},[texture]);
  return <>
    <ambientLight intensity={0.85}/><directionalLight position={[3,4,5]} intensity={1.3}/>
    <mesh>
      <sphereGeometry args={[radius,64,32]}/>
      {texture?<meshBasicMaterial key="radial-map" map={texture}/>:<meshStandardMaterial key="illustrative" color="#cba64f" roughness={1}/>}
    </mesh>
    {showDipole&&<DipoleLines color="#71d7ed" opacity={0.55}/>}
    {showDerivedDipole&&dipoleOrientation&&<group quaternion={dipoleOrientation}><DipoleLines color="#f4d572" opacity={0.8}/></group>}
    {showPfss&&model?.lines.map(line=><Line key={line.lineId}
      points={line.points.map(([r,lat,lon])=>xyz(r,lat,lon))}
      color={line.polarity==='positive'?'#f6a65f':line.polarity==='negative'?'#7595ff':'#b5bbc5'}
      lineWidth={1.4} transparent opacity={0.8}/>)}
    {showLos&&diagnostic&&<ObservedLosResidualMarkers diagnostic={diagnostic} dipoleVector={dipole?.vectorGauss??null} colorBasis={losColorBasis}/>}
    {showRegistration&&registration?.anchors.map((anchor,index)=><mesh key={`hmi-geometry-${index}`}
      position={xyz(1.055,anchor.carringtonLatitudeDeg,anchor.carringtonLongitudeDeg)}
      onClick={event=>{event.stopPropagation();onAnchorSelect(index);}}>
      <sphereGeometry args={[selectedAnchorIndex===index?0.037:0.017,8,6]}/>
      <meshBasicMaterial color={selectedAnchorIndex===index?'#ffffff':'#a3e635'}/>
    </mesh>)}
    {showCatalogMarkers&&catalogMarkers.map(marker=><mesh key={marker.id}
      position={xyz(1.045,marker.latitudeDeg,marker.longitudeDeg)}
      onClick={event=>{event.stopPropagation();onCatalogEventSelect?.(marker.id);}}>
      <sphereGeometry args={[selectedCatalogEventId===marker.id?0.055:0.038,12,8]}/>
      <meshBasicMaterial color={selectedCatalogEventId===marker.id?'#fef08a':'#facc15'}/>
    </mesh>)}
    <OrbitControls ref={controls} enablePan={false} minDistance={2.3} maxDistance={9}
      onEnd={()=>onCameraChange(camera.position.toArray().map(value=>Number(value.toFixed(4))) as [number,number,number])}/>
    <CameraPose position={cameraPosition} controls={controls}/>
  </>;
}

async function readJsonFile(file:File):Promise<unknown>{
  if(file.size>MAX_FILE_BYTES)throw new Error('File exceeds 4 MB display limit');
  return JSON.parse(await file.text()) as unknown;
}

export function SolarMagneticGlobe({acquisitionId,hmiAcquisitionId,catalogEvents=[],selectedCatalogEventId=null,onCatalogEventSelect}:{
  acquisitionId?:string|null;hmiAcquisitionId?:string|null;catalogEvents?:readonly SolarActiveRegionEvent[];
  selectedCatalogEventId?:string|null;onCatalogEventSelect?:(id:string)=>void}={}){
  const [map,setMap]=React.useState<SolarGlobalRadialMap|null>(null);
  const [mapContentId,setMapContentId]=React.useState<string|null>(null);
  const [loadedGongAcquisitionId,setLoadedGongAcquisitionId]=React.useState<string|null>(null);
  const accountEpoch=React.useRef(0);
  const [model,setModel]=React.useState<SolarPfssGeometry|null>(null);
  const [diagnostic,setDiagnostic]=React.useState<SolarMagneticLosDiagnostic|null>(null);
  const [registration,setRegistration]=React.useState<SolarSphereRegistration|null>(null);
  const [showRegistration,setShowRegistration]=React.useState(true);
  const [selectedAnchorIndex,setSelectedAnchorIndex]=React.useState<number|null>(null);
  const [showDipole,setShowDipole]=React.useState(true);
  const [showDerivedDipole,setShowDerivedDipole]=React.useState(false);
  const [showPfss,setShowPfss]=React.useState(true);
  const [showLos,setShowLos]=React.useState(true);
  const [showCatalogMarkers,setShowCatalogMarkers]=React.useState(true);
  const catalogMarkers=React.useMemo(()=>solarActiveRegionMarkers(catalogEvents),[catalogEvents]);
  const [losColorBasis,setLosColorBasis]=React.useState<'map_residual'|'radial_l1_residual'>('map_residual');
  const [l1LosComparison,setL1LosComparison]=React.useState<Awaited<ReturnType<typeof compareDisplayedHmiLosToMapL1>>|null>(null);
  const [cameraPosition,setCameraPosition]=React.useState<[number,number,number]>(initialCamera);
  const [viewRecipe,setViewRecipe]=React.useState<SolarMagneticViewRecipe|null>(null);
  const [sphereScene,setSphereScene]=React.useState<SolarSphereScene|null>(null);
  const [mcpImportRequest,setMcpImportRequest]=React.useState<null|{requestId:string;viewInstanceId:string;
    expectedRevision:number;expiresAtMs:number}>(null);
  const [localGongFile,setLocalGongFile]=React.useState<File|null>(null);
  const [selectedMcpImport,setSelectedMcpImport]=React.useState<null|{
    fileName:string;bundle:Awaited<ReturnType<typeof verifySolarMagneticComparisonBundle>>}>(null);
  const [mcpImportMessage,setMcpImportMessage]=React.useState('');
  const [mcpImportBusy,setMcpImportBusy]=React.useState(false);
  const mcpImportRequestId=React.useRef<string|null>(null);
  const [message,setMessage]=React.useState('No global radial-field map or PFSS solution loaded.');
  const [webglAvailable,setWebglAvailable]=React.useState(false);
  const globeElement=React.useRef<HTMLDivElement>(null);
  const presentationViewId=React.useRef(crypto.randomUUID());
  const presentationRevision=React.useRef(0);
  const presentationApplying=React.useRef(false);
  const presentationPendingAck=React.useRef<null|{requestId:string;bundleId:string;mapContentId:string;
    pfssModelId:string|null;viewRecipeId:string;epoch:number}>(null);
  const presentationAckTimeout=React.useRef<number|null>(null);
  const clearPresentationAckTimeout=()=>{
    if(presentationAckTimeout.current!==null){window.clearTimeout(presentationAckTimeout.current);
      presentationAckTimeout.current=null;}
  };
  const reportPresentationRejection=(requestId:string,
    reason:'renderer_unavailable'|'renderer_view_changed'|'renderer_timeout'|'renderer_rejected')=>{
    void fetch('/api/account/solar-research/magnetic-presentation/reject',{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({viewInstanceId:presentationViewId.current,requestId,reason}),
    }).catch(()=>{});
  };
  const markHumanChange=(event?:React.SyntheticEvent)=>{
    if(event?.target instanceof Element&&event.target.closest('[data-preserve-view-revision]'))return;
    presentationRevision.current++;
    if(presentationPendingAck.current){reportPresentationRejection(presentationPendingAck.current.requestId,'renderer_view_changed');
      clearPresentationAckTimeout();presentationPendingAck.current=null;presentationApplying.current=false;
      setMessage('MCP magnetic display cancelled: the globe changed before acknowledgement.');}
  };
  React.useEffect(()=>{
    try {const canvas=document.createElement('canvas');setWebglAvailable(Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl')));}
    catch {setWebglAvailable(false);}
  },[]);
  React.useEffect(()=>{
    const changed=()=>{accountEpoch.current++;setMap(null);setMapContentId(null);setLoadedGongAcquisitionId(null);setModel(null);setDiagnostic(null);setRegistration(null);setSelectedAnchorIndex(null);
      clearPresentationAckTimeout();presentationPendingAck.current=null;presentationApplying.current=false;presentationRevision.current++;
      setMcpImportRequest(null);setSelectedMcpImport(null);setLocalGongFile(null);setMcpImportBusy(false);
      setMcpImportMessage('Account changed; selected import cleared.');
      setMessage('Account changed; magnetic inputs cleared.');};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
    return()=>window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
  },[]);
  React.useEffect(()=>{
    if(!acquisitionId)return;
    const controller=new AbortController(),epoch=accountEpoch.current;
    void (async()=>{
      try{
        setMessage('Inspecting retained GONG FITS and preparing a display-only radial map…');
        const accountResponse=await fetch('/api/account/session',{credentials:'include',signal:controller.signal});
        if(!accountResponse.ok)throw new Error('Developer profile unavailable');
        const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
        if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('Developer profile required');
        const response=await fetch(`/api/star-watcher/magnetic-archive/display-map?${new URLSearchParams({
          expected_profile_id:profileId,acquisitionId})}`,{credentials:'include',signal:controller.signal});
        if(!response.ok)throw new Error(`FITS display-map preparation failed (${response.status})`);
        const result=await response.json();
        if(result?.schemaVersion!=='solar-magnetic-display-map-receipt/1'||
            result?.acquisition?.acquisitionId!==acquisitionId||result?.scientificAdmission!==false)
          throw new Error('Display-map receipt identity rejected');
        const parsed=solarGlobalRadialMapSchema.parse(result.map);
        if(parsed.source.sha256!==result.acquisition.sha256)throw new Error('FITS source hash mismatch');
        const contentId=await solarGlobalRadialMapContentId(parsed);
        if(controller.signal.aborted||epoch!==accountEpoch.current)return;
        setMap(parsed);setMapContentId(contentId);setLoadedGongAcquisitionId(acquisitionId);setModel(null);setDiagnostic(null);setRegistration(null);
        setShowDipole(false);setShowDerivedDipole(deriveSolarEquivalentDipole(parsed).magnitudeGauss>=1e-6);
        setMessage(`Loaded GONG display map from ${acquisitionId}; map epoch is from the FITS header, but contributor interval and quality remain unverified.`);
      }catch(error){if(!controller.signal.aborted)setMessage(`GONG display map rejected: ${error instanceof Error?error.message:'unknown failure'}`);}
    })();
    return()=>controller.abort();
  },[acquisitionId]);
  React.useEffect(()=>{
    if(!acquisitionId||!hmiAcquisitionId||loadedGongAcquisitionId!==acquisitionId||!mapContentId)return;
    const controller=new AbortController(),epoch=accountEpoch.current;
    void (async()=>{
      try{
        setMessage('Rechecking exact owner-retained GONG and HMI bytes; preparing an exploratory visible-disk LOS comparison…');
        const accountResponse=await fetch('/api/account/session',{credentials:'include',signal:controller.signal});
        if(!accountResponse.ok)throw new Error('Developer profile unavailable');
        const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
        if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('Developer profile required');
        const response=await fetch(`/api/star-watcher/magnetic-archive/los-comparison?${new URLSearchParams({
          expected_profile_id:profileId,gongAcquisitionId:acquisitionId,hmiAcquisitionId})}`,
          {credentials:'include',signal:controller.signal});
        if(!response.ok)throw new Error(`HMI LOS preparation unavailable (${response.status})`);
        const result=await response.json();
        if(result?.schemaVersion!=='solar-magnetic-owner-los-comparison/1'||
            result?.gongAcquisitionId!==acquisitionId||result?.hmiAcquisitionId!==hmiAcquisitionId||
            result?.gongReceipt?.acquisitionId!==acquisitionId||result?.hmiReceipt?.acquisitionId!==hmiAcquisitionId||
            result?.scientificAdmission!==false||result?.quantitativeValidationAllowed!==false)
          throw new Error('LOS comparison receipt identity rejected');
        const checkedMap=solarGlobalRadialMapSchema.parse(result.map);
        const checkedMapId=await solarGlobalRadialMapContentId(checkedMap);
        const parsed=await verifySolarMagneticLosDiagnostic(result.diagnostic);
        if(checkedMapId!==mapContentId||parsed.sourceMapContentId!==mapContentId||
            checkedMap.source.sha256!==result.gongReceipt.sha256||
            parsed.hmi.sha256!==result.hmiReceipt.sha256||
            parsed.hmi.observedAtUtc!==result.hmiReceipt.hmiHeader?.observedAtUtc||
            parsed.hmi.qualityFlag!==result.hmiReceipt.hmiHeader?.qualityFlag)
          throw new Error('LOS diagnostic source binding rejected');
        if(controller.signal.aborted||epoch!==accountEpoch.current)return;
        setDiagnostic(parsed);setRegistration(null);setShowLos(true);
        setMessage(`Loaded owner-byte-checked HMI LOS diagnostic ${parsed.diagnosticId}; HMI QUALITY ${parsed.hmi.qualityFlag} is not interpreted, and this is not a calibrated same-time validation.`);
      }catch(error){if(!controller.signal.aborted&&epoch===accountEpoch.current)
        setMessage(`HMI LOS comparison rejected: ${error instanceof Error?error.message:'unknown failure'}`);}
    })();
    return()=>controller.abort();
  },[acquisitionId,hmiAcquisitionId,loadedGongAcquisitionId,mapContentId]);
  const dipole=React.useMemo(()=>map?deriveSolarEquivalentDipole(map):null,[map]);
  React.useEffect(()=>{
    let cancelled=false;
    setL1LosComparison(null);
    if(map&&diagnostic)void compareDisplayedHmiLosToMapL1(map,diagnostic).then(value=>{
      if(!cancelled)setL1LosComparison(value);
    }).catch(()=>{if(!cancelled)setMessage('HMI l=1 comparison rejected: source binding did not verify.');});
    return ()=>{cancelled=true;};
  },[map,diagnostic]);
  React.useEffect(()=>{
    let cancelled=false;
    const recipe:SolarMagneticViewRecipePayload={schemaVersion:'solar-magnetic-view-recipe/1',
      mapContentId, pfssModelId:model?.modelId??null,
      coordinateFrame:'Carrington_display_cartesian',projection:'perspective',cameraPosition,
      cameraTarget:'solar_center',fieldColorScale:'asinh_p98_abs_radial_gauss/1',
      showIllustrativeAxialDipole:showDipole,showMapEquivalentDipole:Boolean(dipole&&dipole.magnitudeGauss>=1e-6&&showDerivedDipole),
      showPfssLines:Boolean(model&&showPfss),
      ...(diagnostic?{losDiagnosticId:diagnostic.diagnosticId,showLosMarkers:showLos}:{}),
      ...(diagnostic&&losColorBasis==='radial_l1_residual'?{losMarkerColorBasis:losColorBasis}:{}),
      sourceIdentityAuthenticated:false,
      scientificAdmission:false,quantitativeJoinAllowed:false};
    setViewRecipe(null);
    void prepareSolarMagneticViewRecipe(recipe).then(value=>{if(!cancelled)setViewRecipe(value);});
    return ()=>{cancelled=true;};
  },[mapContentId,model,diagnostic,dipole,showDipole,showDerivedDipole,showPfss,showLos,losColorBasis,cameraPosition]);
  React.useEffect(()=>{
    let cancelled=false;setSphereScene(null);
    if(map&&viewRecipe)void prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
      map,pfss:model,losDiagnostic:diagnostic,...(registration?{registration}:{}),view:viewRecipe,
      sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeValidationAllowed:false})
      .then(buildSolarSphereScene).then(scene=>{if(!cancelled)setSphereScene(scene);})
      .catch(()=>{if(!cancelled)setSphereScene(null);});
    return()=>{cancelled=true;};
  },[map,model,diagnostic,registration,viewRecipe]);
  React.useEffect(()=>{if(!presentationApplying.current)presentationRevision.current++;},
    [mapContentId,model,diagnostic,showDipole,showDerivedDipole,showPfss,showLos,losColorBasis,cameraPosition]);
  React.useEffect(()=>{
    const controller=new AbortController();let busy=false;
    const base='/api/account/solar-research/magnetic-presentation';
    async function poll(){
      if(busy||controller.signal.aborted||presentationApplying.current)return;
      busy=true;const epoch=accountEpoch.current;let pendingRequestId:string|null=null;
      try{
        const revision=presentationRevision.current,viewInstanceId=presentationViewId.current;
        const presence=await fetch(`${base}/presence`,{method:'POST',credentials:'include',
          headers:{'Content-Type':'application/json'},signal:controller.signal,
          body:JSON.stringify({viewInstanceId,revision})});
        if(!presence.ok||controller.signal.aborted||epoch!==accountEpoch.current)return;
        const pendingResponse=await fetch(`${base}/pending?${new URLSearchParams({viewInstanceId})}`,
          {credentials:'include',signal:controller.signal});
        if(!pendingResponse.ok||controller.signal.aborted||epoch!==accountEpoch.current)return;
        const importResponse=await fetch(`${base}/import/pending?${new URLSearchParams({viewInstanceId})}`,
          {credentials:'include',signal:controller.signal});
        if(!importResponse.ok||controller.signal.aborted||epoch!==accountEpoch.current)return;
        const importRequest=(await importResponse.json()).request as null|{requestId:string;viewInstanceId:string;
          expectedRevision:number;expiresAtMs:number};
        if(importRequest&&importRequest.expectedRevision===revision&&importRequest.viewInstanceId===viewInstanceId){
          setMcpImportRequest(previous=>previous?.requestId===importRequest.requestId?previous:importRequest);
          if(mcpImportRequestId.current!==importRequest.requestId){mcpImportRequestId.current=importRequest.requestId;
            setSelectedMcpImport(null);setLocalGongFile(null);
            setMcpImportMessage('MCP requested a local JSON bundle. Select a file, then separately confirm profile retention.');}
        }else if(mcpImportRequestId.current){mcpImportRequestId.current=null;setMcpImportRequest(null);
          setSelectedMcpImport(null);setLocalGongFile(null);}
        const pending=(await pendingResponse.json()).request as null|{requestId:string;expectedRevision:number;
          bundleId:string;expected:{bundleId:string;mapContentId:string;pfssModelId:string|null;viewRecipeId:string}};
        if(!pending||pending.expectedRevision!==presentationRevision.current)return;
        pendingRequestId=pending.requestId;
        if(!globeElement.current?.querySelector('canvas'))throw new Error('WebGL globe is not rendered');
        const accountResponse=await fetch('/api/account/session',{credentials:'include',signal:controller.signal});
        if(!accountResponse.ok)throw new Error('Developer session unavailable');
        const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
        if(controller.signal.aborted||epoch!==accountEpoch.current)return;
        if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('Developer profile required');
        const response=await fetch(`/api/account/solar-research/magnetic-bundles?${new URLSearchParams({
          expected_profile_id:profileId,bundleId:pending.bundleId})}`,
          {credentials:'include',signal:controller.signal});
        if(!response.ok)throw new Error(`Retained bundle unavailable (${response.status})`);
        const result=await response.json();
        if(result.ok!==true||result.profileId!==profileId||result.bundleId!==pending.bundleId||
           result.scientificAdmission!==false||result.scienceRunAllowed!==false||
           typeof result.bundleJson!=='string')throw new Error('Retained bundle identity rejected');
        const bundle=await verifySolarMagneticComparisonBundle(JSON.parse(result.bundleJson));
        const contentId=await solarGlobalRadialMapContentId(bundle.map);
        if(bundle.bundleId!==pending.expected.bundleId||contentId!==pending.expected.mapContentId||
           (bundle.pfss?.modelId??null)!==pending.expected.pfssModelId||
           bundle.view.recipeId!==pending.expected.viewRecipeId)
          throw new Error('Presentation request does not match retained bundle');
        if(controller.signal.aborted||epoch!==accountEpoch.current)return;
        if(presentationRevision.current!==pending.expectedRevision)
          throw new Error('Globe changed while retained bundle was loading');
        presentationApplying.current=true;
        presentationPendingAck.current={requestId:pending.requestId,bundleId:bundle.bundleId,mapContentId:contentId,
          pfssModelId:bundle.pfss?.modelId??null,viewRecipeId:bundle.view.recipeId,epoch};
        await applyBundle(bundle,contentId);
        if(presentationPendingAck.current?.requestId!==pending.requestId)return;
        presentationAckTimeout.current=window.setTimeout(()=>{
          if(presentationPendingAck.current?.requestId!==pending.requestId)return;
          presentationPendingAck.current=null;presentationApplying.current=false;presentationRevision.current++;
          reportPresentationRejection(pending.requestId,'renderer_timeout');
          setMessage('MCP magnetic display was not acknowledged; the request will be rejected on the next view check.');
        },12000);
      }catch(error){if(!controller.signal.aborted&&epoch===accountEpoch.current)
        setMessage(`MCP magnetic display rejected: ${error instanceof Error?error.message:'unknown failure'}`);
        if(pendingRequestId&&!controller.signal.aborted&&epoch===accountEpoch.current)
          reportPresentationRejection(pendingRequestId,error instanceof Error&&error.message==='WebGL globe is not rendered'?
            'renderer_unavailable':error instanceof Error&&error.message==='Globe changed while retained bundle was loading'?
            'renderer_view_changed':'renderer_rejected');
        clearPresentationAckTimeout();presentationPendingAck.current=null;presentationApplying.current=false;}
      finally{busy=false;}
    }
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    return()=>{controller.abort();window.clearInterval(timer);clearPresentationAckTimeout();presentationPendingAck.current=null;
      presentationApplying.current=false;
      void fetch(`${base}/close`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({viewInstanceId:presentationViewId.current}),keepalive:true}).catch(()=>{});};
  },[]);
  React.useEffect(()=>{
    const pending=presentationPendingAck.current;
    if(!pending||pending.epoch!==accountEpoch.current||!webglAvailable||
       !globeElement.current?.querySelector('canvas')||
       mapContentId!==pending.mapContentId||(model?.modelId??null)!==pending.pfssModelId||
       viewRecipe?.recipeId!==pending.viewRecipeId)return;
    let cancelled=false;
    const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(cancelled||pending!==presentationPendingAck.current)return;
      void (async()=>{
        try{
          const response=await fetch('/api/account/solar-research/magnetic-presentation/ack',{
            method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({viewInstanceId:presentationViewId.current,requestId:pending.requestId,
              observed:{bundleId:pending.bundleId,mapContentId:pending.mapContentId,
                pfssModelId:pending.pfssModelId,viewRecipeId:pending.viewRecipeId}})});
          if(!response.ok)throw new Error(`Display acknowledgement rejected (${response.status})`);
          if(!cancelled&&pending===presentationPendingAck.current){
            clearPresentationAckTimeout();
            presentationRevision.current++;presentationPendingAck.current=null;presentationApplying.current=false;
            setMessage(`Displayed owner-retained comparison ${pending.bundleId} · view ${pending.viewRecipeId}. Modeled PFSS; no scientific admission.`);
          }
        }catch(error){if(!cancelled){clearPresentationAckTimeout();presentationPendingAck.current=null;presentationApplying.current=false;
          setMessage(`MCP magnetic display acknowledgement failed: ${error instanceof Error?error.message:'unknown failure'}`);}}
      })();
    }));
    return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[mapContentId,model,viewRecipe,webglAvailable]);
  async function loadMap(file:File){
    try{
      const parsed=solarGlobalRadialMapSchema.parse(await readJsonFile(file));
      const contentId=await solarGlobalRadialMapContentId(parsed);
      setMap(parsed);setMapContentId(contentId);setLoadedGongAcquisitionId(null);setModel(null);setDiagnostic(null);setRegistration(null);setShowDipole(false);
      setLosColorBasis('map_residual');
      setShowDerivedDipole(deriveSolarEquivalentDipole(parsed).magnitudeGauss>=1e-6);
      setMessage(`Loaded local derived map ${parsed.source.productId}; source identity is not authenticated.`);
    }catch(error){setMessage(`Map rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function loadModel(file:File){
    try{
      if(!map)throw new Error('Load its source radial-field map first');
      const parsed=await verifySolarPfssGeometry(await readJsonFile(file));
      if(parsed.sourceMapProductId!==map.source.productId||parsed.sourceMapSha256!==map.source.sha256||parsed.sourceMapContentId!==mapContentId)
        throw new Error('PFSS source-map identity does not match the loaded map');
      setModel(parsed);setMessage(`Loaded content-checked PFSS geometry ${parsed.modelId}; upstream source remains unauthenticated.`);
    }catch(error){setMessage(`PFSS rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function loadDiagnostic(file:File){
    try{
      if(!map)throw new Error('Load its source radial-field map first');
      const parsed=await verifySolarMagneticLosDiagnostic(await readJsonFile(file));
      if(parsed.sourceMapContentId!==mapContentId||parsed.mapSourceProductId!==map.source.productId||
          parsed.mapSourceSha256!==map.source.sha256)
        throw new Error('HMI LOS diagnostic is not bound to the loaded radial map');
      setDiagnostic(parsed);setRegistration(null);setShowLos(true);
      setMessage(`Loaded content-checked HMI LOS diagnostic ${parsed.diagnosticId}; upstream source bytes are not browser-authenticated.`);
    }catch(error){setMessage(`HMI diagnostic rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function loadRegistration(file:File){
    try{
      if(!diagnostic)throw new Error('Load the matching measured HMI LOS diagnostic first');
      const parsed=await verifySolarSphereRegistration(await readJsonFile(file));
      if(parsed.source.fitsSha256!==diagnostic.hmi.sha256||
          parsed.source.productId!==diagnostic.hmi.drmsId||
          parsed.source.observedAtUtc!==diagnostic.hmi.observedAtUtc||
          parsed.source.qualityFlag!==diagnostic.hmi.qualityFlag)
        throw new Error('Registration does not match the loaded HMI source');
      setRegistration(parsed);setShowRegistration(true);setSelectedAnchorIndex(null);
      setMessage(`Loaded geometry-only HMI registration ${parsed.registrationId}; no far-side observation or magnetic fit.`);
    }catch(error){setMessage(`Sphere registration rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function loadView(file:File){
    try{
      const recipe=await verifySolarMagneticViewRecipe(await readJsonFile(file));
      if(recipe.mapContentId!==mapContentId||recipe.pfssModelId!==(model?.modelId??null)||
          (recipe.losDiagnosticId??null)!==(diagnostic?.diagnosticId??null))
        throw new Error('View recipe requires the exact loaded map, PFSS model and HMI diagnostic IDs');
      if(recipe.showMapEquivalentDipole&&(!dipole||dipole.magnitudeGauss<1e-6))
        throw new Error('Map-equivalent dipole is undefined for this loaded map');
      setShowDipole(recipe.showIllustrativeAxialDipole);
      setShowDerivedDipole(recipe.showMapEquivalentDipole);
      setShowPfss(recipe.showPfssLines);
      setShowLos(recipe.showLosMarkers??false);
      setLosColorBasis(recipe.losMarkerColorBasis??'map_residual');
      setCameraPosition(recipe.cameraPosition);
      setMessage(`Replayed display settings ${recipe.recipeId}; no source or model authentication implied.`);
    }catch(error){setMessage(`View recipe rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function applyBundle(bundle:Awaited<ReturnType<typeof verifySolarMagneticComparisonBundle>>,verifiedMapContentId?:string){
      const nextMapId=verifiedMapContentId??await solarGlobalRadialMapContentId(bundle.map);
      setMap(bundle.map);setMapContentId(nextMapId);
      setModel(bundle.pfss);setDiagnostic(bundle.losDiagnostic);setRegistration(bundle.registration??null);setShowRegistration(true);setSelectedAnchorIndex(null);
      setShowDipole(bundle.view.showIllustrativeAxialDipole);
      setShowDerivedDipole(bundle.view.showMapEquivalentDipole);
      setShowPfss(bundle.view.showPfssLines);
      setShowLos(bundle.view.showLosMarkers??false);
      setLosColorBasis(bundle.view.losMarkerColorBasis??'map_residual');
      setCameraPosition(bundle.view.cameraPosition);
      setMessage(`Replayed local comparison bundle ${bundle.bundleId}; source identities and scientific fit remain unverified.`);
  }
  async function loadBundle(file:File){
    try{
      const bundle=await verifySolarMagneticComparisonBundle(await readJsonFile(file));
      await applyBundle(bundle);
    }catch(error){setMessage(`Comparison bundle rejected: ${error instanceof Error?error.message:'invalid JSON'}`);}
  }
  async function exportBundle(){
    if(!map||!viewRecipe)return;
    try{
      const bundle=await prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
        map,pfss:model,losDiagnostic:diagnostic,...(registration?{registration}:{}),view:viewRecipe,
        sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeValidationAllowed:false});
      const objectUrl=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=objectUrl;
      link.download=`${bundle.bundleId}.json`;document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),0);
      setMessage(`Exported local comparison bundle ${bundle.bundleId}; this is not provider authentication or validation.`);
    }catch(error){setMessage(`Comparison bundle export rejected: ${error instanceof Error?error.message:'invalid state'}`);}
  }
  function exportView(){
    if(!viewRecipe)return;
    const objectUrl=URL.createObjectURL(new Blob([JSON.stringify(viewRecipe,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=objectUrl;
    link.download=`${viewRecipe.recipeId}.json`;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),0);
  }
  function rejectMcpImport(reason:'cancelled'|'invalid_file'|'storage_failed'|'account_changed'|'renderer_rejected'){
    const pending=mcpImportRequest;if(!pending)return;
    void fetch('/api/account/solar-research/magnetic-presentation/import/reject',{method:'POST',
      credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({viewInstanceId:pending.viewInstanceId,requestId:pending.requestId,reason})}).catch(()=>{});
    mcpImportRequestId.current=null;setMcpImportRequest(null);setSelectedMcpImport(null);setLocalGongFile(null);
    if(reason==='cancelled')setMcpImportMessage('MCP magnetic bundle import cancelled.');
    else if(reason==='invalid_file')setMcpImportMessage('The selected file did not pass local bundle validation.');
    else if(reason==='account_changed')setMcpImportMessage('Account changed before the import completed.');
    else if(reason==='storage_failed')setMcpImportMessage('Profile retention or server readback failed; no retained receipt was issued.');
  }
  async function selectMcpImport(file:File){
    setSelectedMcpImport(null);setLocalGongFile(null);
    if(file.name.toLowerCase().endsWith('.fits.gz')){
      if(file.size>32_000_000){setMcpImportMessage('Compressed GONG FITS exceeds the 32 MB conversion limit.');
        rejectMcpImport('invalid_file');return;}
      setLocalGongFile(file);setMcpImportMessage(`${file.name} selected. Conversion will upload it to this app server after you confirm that step.`);return;
    }
    setMcpImportMessage('Checking selected JSON bundle locally…');
    try{
      if(file.size>MAX_RETAINED_BUNDLE_BYTES)throw new Error('Bundle exceeds the 1.5 MB profile-retention limit');
      const bundle=await verifySolarMagneticComparisonBundle(JSON.parse(await file.text()));
      setSelectedMcpImport({fileName:file.name,bundle});
      setMcpImportMessage(`Verified ${file.name} · ${bundle.bundleId}. Review this bundle, then confirm profile retention.`);
    }catch(error){setMcpImportMessage(`Selected file rejected: ${error instanceof Error?error.message:'invalid JSON'}`);
      rejectMcpImport('invalid_file');}
  }
  async function convertSelectedLocalGong(){
    const pending=mcpImportRequest,file=localGongFile;
    if(!pending||!file||mcpImportBusy)return;
    const epoch=accountEpoch.current;setMcpImportBusy(true);setMcpImportMessage('Checking developer session before local GONG conversion…');
    try{
      const accountResponse=await fetch('/api/account/session',{credentials:'include'});
      if(!accountResponse.ok)throw new Error('Developer profile unavailable');
      const account=await accountResponse.json();
      if(!account.session?.profile?.profile_id||account.account_policy?.account_type!=='developer')
        throw new Error('A signed-in developer account is required');
      if(epoch!==accountEpoch.current||mcpImportRequestId.current!==pending.requestId)
        throw new Error('Account or import request changed before conversion');
      const form=new FormData();form.append('file',file,file.name);
      const response=await fetch('/api/star-watcher/magnetic-archive/convert-local-gong',{method:'POST',credentials:'include',body:form});
      const result=await response.json();
      if(!response.ok||result.schemaVersion!=='solar-magnetic-local-gong-conversion/1'||
          result.scientificAdmission!==false||result.conversion?.sourceIdentityAuthenticated!==false||
          result.conversion?.method!=='gong_sine_latitude_linear/1')
        throw new Error(result.error??'Local GONG conversion receipt rejected');
      const convertedMap=solarGlobalRadialMapSchema.parse(result.map);
      if(convertedMap.source.sha256!==result.conversion.sha256||convertedMap.sourceIdentityAuthenticated!==false||
          convertedMap.scientificAdmission!==false)throw new Error('Converted map provenance or claim boundary rejected');
      const contentId=await solarGlobalRadialMapContentId(convertedMap);
      const derived=deriveSolarEquivalentDipole(convertedMap);
      const view=await prepareSolarMagneticViewRecipe({schemaVersion:'solar-magnetic-view-recipe/1',
        mapContentId:contentId,pfssModelId:null,coordinateFrame:'Carrington_display_cartesian',projection:'perspective',
        cameraPosition:initialCamera,cameraTarget:'solar_center',fieldColorScale:'asinh_p98_abs_radial_gauss/1',
        showIllustrativeAxialDipole:false,showMapEquivalentDipole:derived.magnitudeGauss>=1e-6,
        showPfssLines:false,sourceIdentityAuthenticated:false,scientificAdmission:false,quantitativeJoinAllowed:false});
      const bundle=await prepareSolarMagneticComparisonBundle({schemaVersion:'solar-magnetic-comparison-bundle/1',
        map:convertedMap,pfss:null,losDiagnostic:null,view,sourceIdentityAuthenticated:false,
        scientificAdmission:false,quantitativeValidationAllowed:false});
      if(epoch!==accountEpoch.current||mcpImportRequestId.current!==pending.requestId)return;
      setLocalGongFile(null);setSelectedMcpImport({fileName:file.name,bundle});
      setMcpImportMessage(`Converted ${file.name} to a content-checked surface-map bundle. The FITS header says GONG, but source identity is not authenticated; this file contains no coronal field-line solution.`);
    }catch(error){setMcpImportMessage(`Local GONG conversion failed: ${error instanceof Error?error.message:'unknown failure'}`);
      rejectMcpImport('invalid_file');}
    finally{setMcpImportBusy(false);}
  }
  async function retainSelectedMcpImport(){
    const pending=mcpImportRequest,selected=selectedMcpImport;
    if(!pending||!selected||mcpImportBusy)return;
    const epoch=accountEpoch.current;setMcpImportBusy(true);setMcpImportMessage('Checking developer profile and retaining the confirmed bundle…');
    try{
      const accountResponse=await fetch('/api/account/session',{credentials:'include'});
      if(!accountResponse.ok)throw new Error('Developer profile unavailable');
      const account=await accountResponse.json(),profileId=account.session?.profile?.profile_id;
      if(!profileId||account.account_policy?.account_type!=='developer')throw new Error('A signed-in developer account is required');
      if(epoch!==accountEpoch.current||mcpImportRequestId.current!==pending.requestId)
        throw new Error('Account or import request changed before confirmation');
      const bundle=selected.bundle;
      const storedResponse=await fetch('/api/account/solar-research/magnetic-bundles',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_profile_id:profileId,bundleJson:JSON.stringify(bundle)})});
      let stored=await storedResponse.json();
      if(storedResponse.status===409&&stored.error==='solar_magnetic_bundle_already_retained'){
        const readbackResponse=await fetch(`/api/account/solar-research/magnetic-bundles?${new URLSearchParams({
          expected_profile_id:profileId,bundleId:bundle.bundleId})}`,{credentials:'include'});
        const readback=await readbackResponse.json();
        if(!readbackResponse.ok||readback.ok!==true||readback.profileId!==profileId||
            readback.bundleId!==bundle.bundleId||readback.scientificAdmission!==false||
            readback.scienceRunAllowed!==false||typeof readback.bundleJson!=='string')
          throw new Error('Existing retained bundle could not be verified');
        const existing=await verifySolarMagneticComparisonBundle(JSON.parse(readback.bundleJson));
        if(existing.bundleId!==bundle.bundleId)throw new Error('Existing retained bundle identity rejected');
        stored={...readback,saved:true};
      }
      if(!storedResponse.ok&&stored.saved!==true||stored.ok!==true||stored.profileId!==profileId||
          stored.bundleId!==bundle.bundleId||stored.saved!==true||stored.scientificAdmission!==false||
          stored.scienceRunAllowed!==false)throw new Error(stored.error??'Profile retention receipt rejected');
      const observed={bundleId:bundle.bundleId,mapContentId:bundle.view.mapContentId,
        pfssModelId:bundle.pfss?.modelId??null,viewRecipeId:bundle.view.recipeId};
      const ackResponse=await fetch('/api/account/solar-research/magnetic-presentation/import/ack',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({viewInstanceId:pending.viewInstanceId,
          requestId:pending.requestId,expectedRevision:pending.expectedRevision,observed})});
      const ack=await ackResponse.json();
      if(!ackResponse.ok||ack.ok!==true||ack.scientificAdmission!==false||ack.sourceIdentityAuthenticated!==false||
          ack.request?.state!=='retained'||ack.request?.bundleId!==bundle.bundleId)
        throw new Error(ack.error??'Retained bundle readback acknowledgement rejected');
      if(epoch!==accountEpoch.current)return;
      mcpImportRequestId.current=null;setMcpImportRequest(null);setSelectedMcpImport(null);
      setMcpImportMessage(`Retained ${bundle.bundleId} for this developer profile. MCP must request display separately; no scientific admission.`);
    }catch(error){setMcpImportMessage(`Import retention failed: ${error instanceof Error?error.message:'unknown failure'}`);
      rejectMcpImport('storage_failed');}
    finally{setMcpImportBusy(false);}
  }
  return <section aria-label="3D magnetic globe" onPointerDownCapture={markHumanChange}
    onClickCapture={markHumanChange} onChangeCapture={markHumanChange}
    onKeyDownCapture={markHumanChange} onWheelCapture={markHumanChange}
    className="space-y-3 rounded-lg border border-cyan-700/40 bg-slate-950 p-3 text-xs text-slate-200">
    <div><h3 className="text-sm font-semibold text-cyan-100">3D magnetic globe</h3>
      <p className="mt-1 text-slate-400">Carrington coordinates · drag to rotate, scroll to zoom. Front is a map coordinate, not an Earth-view ephemeris.</p></div>
    <p className="text-slate-400">Surface colors: red positive / blue negative radial field (display-normalized); when a direct-input mask is supplied, dimmer cells are not marked observed. Cyan lines are illustrative axial; gold lines show the map's l=1 dipole axis with arbitrary loop extent, not a PFSS extrapolation. Orange/blue/gray lines are PFSS models. Mint-to-orange dots are measured HMI LOS residual samples; yellow points are HEK catalog active-region locations. Neither dots nor points are measured field lines.</p>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.65fr)]">
      <div ref={globeElement} className="h-[440px] overflow-hidden rounded border border-slate-700 bg-black">
        {webglAvailable?<Canvas camera={{position:initialCamera,fov:50}} dpr={[1,1.5]}><MagneticScene map={map} model={model} diagnostic={diagnostic} registration={registration} showRegistration={showRegistration} selectedAnchorIndex={selectedAnchorIndex} onAnchorSelect={setSelectedAnchorIndex} dipole={dipole} showDipole={showDipole} showDerivedDipole={showDerivedDipole} showPfss={showPfss} showLos={showLos} losColorBasis={losColorBasis} catalogMarkers={catalogMarkers} showCatalogMarkers={showCatalogMarkers} selectedCatalogEventId={selectedCatalogEventId} onCatalogEventSelect={onCatalogEventSelect} cameraPosition={cameraPosition} onCameraChange={setCameraPosition}/></Canvas>
          :<div className="grid h-full place-items-center p-5 text-center text-slate-400">WebGL is unavailable. Magnetic metadata and imports remain accessible.</div>}
      </div>
      <div className="space-y-3">
        {mcpImportRequest&&<div data-preserve-view-revision className="space-y-2 rounded border border-amber-600/60 bg-amber-950/20 p-2">
          <p className="font-medium text-amber-100">MCP requested a local magnetic bundle</p>
          <p className="text-slate-300">Choose a comparison JSON bundle, or select a compressed GONG FITS file and explicitly start conversion. The conversion uploads the selected file to this app server; profile retention requires a separate confirmation. A surface magnetogram does not contain coronal field lines.</p>
          <label className="block">Select comparison JSON bundle or compressed GONG FITS
            <input type="file" accept="application/json,.json,.fits.gz,application/gzip" aria-label="Select magnetic bundle for MCP import" className="mt-1 block w-full text-xs"
              onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void selectMcpImport(file);event.currentTarget.value='';}} />
          </label>
          {localGongFile&&<button type="button" disabled={mcpImportBusy} onClick={()=>void convertSelectedLocalGong()}
            className="rounded border border-amber-500 px-2 py-1 disabled:opacity-50">Upload selected GONG FITS and convert to map bundle</button>}
          {selectedMcpImport&&<div className="break-all rounded border border-slate-700 p-2 text-slate-300">
            <p>Selected file: {selectedMcpImport.fileName}</p><p>Bundle: {selectedMcpImport.bundle.bundleId}</p>
            <p>Map: {selectedMcpImport.bundle.view.mapContentId} · PFSS: {selectedMcpImport.bundle.pfss?.modelId??'none'} · view: {selectedMcpImport.bundle.view.recipeId}</p>
            <p>This confirms profile storage only. It will not display the bundle until MCP issues the separate exact-ID show request.</p>
          </div>}
          <button type="button" disabled={!selectedMcpImport||mcpImportBusy} onClick={()=>void retainSelectedMcpImport()}
            className="rounded border border-amber-500 px-2 py-1 disabled:opacity-50">Confirm and retain to developer profile</button>
          <button type="button" disabled={mcpImportBusy} onClick={()=>rejectMcpImport('cancelled')}
            className="ml-2 rounded border border-slate-600 px-2 py-1 disabled:opacity-50">Cancel</button>
          {mcpImportMessage&&<p role="status" className="break-all text-slate-300">{mcpImportMessage}</p>}
        </div>}
        {!mcpImportRequest&&mcpImportMessage&&<p role="status" className="break-all rounded border border-slate-700 p-2 text-slate-300">{mcpImportMessage}</p>}
        <div className="space-y-2 rounded border border-cyan-700/50 p-2">
          <p className="font-medium text-cyan-100">One-step local comparison replay</p>
          <label className="block">Import magnetic comparison bundle JSON
            <input type="file" accept="application/json,.json" aria-label="Import magnetic comparison bundle" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadBundle(file);event.currentTarget.value='';}}/>
          </label>
          <button type="button" disabled={!map||!viewRecipe} onClick={()=>{void exportBundle();}} className="rounded border border-cyan-600 px-2 py-1 disabled:opacity-50">Export comparison bundle JSON</button>
          <SolarMagneticBundleStorage payload={map&&viewRecipe?{schemaVersion:'solar-magnetic-comparison-bundle/1',
            map,pfss:model,losDiagnostic:diagnostic,...(registration?{registration}:{}),view:viewRecipe,sourceIdentityAuthenticated:false,
            scientificAdmission:false,quantitativeValidationAllowed:false}:null} onReopen={bundle=>{void applyBundle(bundle);}} />
          <p className="text-slate-400">Loads matching local map, PFSS, measured LOS diagnostic and camera together. Content IDs check replay consistency, not provider authenticity or physical validity.</p>
        </div>
        <details className="space-y-2 rounded border border-slate-700 p-2">
          <summary className="cursor-pointer font-medium">Advanced · inspect or replace individual inputs</summary>
        <div className="rounded border border-slate-700 p-2"><label className="block font-medium">Global radial-field map JSON
          <input type="file" accept="application/json,.json" aria-label="Import global radial-field map" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadMap(file);event.currentTarget.value='';}}/>
        </label><p className="mt-1 text-slate-400">Derived synoptic or assimilated map. Direct-input coverage is shown only if a provider mask is available.</p></div>
        <div className="rounded border border-slate-700 p-2"><label className="block font-medium">PFSS field-line geometry JSON
          <input type="file" accept="application/json,.json" aria-label="Import PFSS field-line geometry" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadModel(file);event.currentTarget.value='';}}/>
        </label><p className="mt-1 text-slate-400">Model-derived lines only. Requires matching source-product, source-byte hash and local map-content ID; not a direct coronal field measurement.</p></div>
        <div className="rounded border border-slate-700 p-2"><label className="block font-medium">Measured HMI LOS diagnostic JSON
          <input type="file" accept="application/json,.json" aria-label="Import measured HMI LOS diagnostic" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadDiagnostic(file);event.currentTarget.value='';}}/>
        </label><p className="mt-1 text-slate-400">Independent disk measurement projected against this map; not a same-time or uncertainty-normalized validation.</p></div>
        <div className="rounded border border-lime-700/50 p-2"><label className="block font-medium">HMI image-to-sphere registration JSON
          <input type="file" accept="application/json,.json" aria-label="Import HMI sphere registration" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadRegistration(file);event.currentTarget.value='';}}/>
        </label><p className="mt-1 text-slate-400">Requires the matching HMI diagnostic. Lime anchors are sampled visible-disk WCS geometry, not a full-pixel footprint, far-side observation or magnetic vector.</p></div>
        </details>
        <p className="border-t border-slate-800 pt-2 font-medium text-slate-100">Observed and catalogued</p>
        <label className="flex gap-2"><input type="checkbox" checked={showLos} disabled={!diagnostic} onChange={event=>setShowLos(event.target.checked)}/>Measured HMI LOS comparison markers (not field lines)</label>
        <label className="flex gap-2"><input type="checkbox" checked={showRegistration} disabled={!registration} onChange={event=>setShowRegistration(event.target.checked)}/>HMI visible-disk geometry anchors ({registration?.anchors.length??0})</label>
        <div className="rounded border border-amber-700/40 p-2">
          <label className="flex gap-2"><input type="checkbox" checked={showCatalogMarkers} onChange={event=>setShowCatalogMarkers(event.target.checked)}/>HEK active-region locations ({catalogMarkers.length})</label>
          <p className="mt-1 text-slate-400">Yellow points are catalog-reported Carrington locations, not measured magnetic vectors or inputs assimilated into this map. Event times and map time support may differ. Missing coordinates are omitted, never inferred from disk position.</p>
          {showCatalogMarkers&&catalogMarkers.length>0&&<div className="mt-2 max-h-28 space-y-1 overflow-auto">{catalogMarkers.map(marker=><button key={marker.id} type="button"
            onClick={()=>onCatalogEventSelect?.(marker.id)} className="block w-full rounded border border-amber-800/50 px-2 py-1 text-left text-amber-100 hover:bg-amber-900/20">
            {marker.noaaAr?`NOAA ${marker.noaaAr}`:'HEK active region'} · {marker.startUtc} · {marker.longitudeDeg.toFixed(1)}°/{marker.latitudeDeg.toFixed(1)}°
          </button>)}</div>}
        </div>
        <p className="border-t border-slate-800 pt-2 font-medium text-slate-100">Derived global surface</p>
        <p className="text-slate-400">The map assembles or estimates a full-sphere radial boundary; it is not a simultaneous whole-Sun measurement.</p>
        <label className="flex gap-2"><input type="checkbox" checked={showDerivedDipole} disabled={!dipole || dipole.magnitudeGauss<1e-6} onChange={event=>setShowDerivedDipole(event.target.checked)}/>Map-derived l=1 dipole approximation (not observed lines or PFSS)</label>
        <p className="border-t border-slate-800 pt-2 font-medium text-slate-100">Modeled corona</p>
        <label className="flex gap-2"><input type="checkbox" checked={showPfss} disabled={!model} onChange={event=>setShowPfss(event.target.checked)}/>Imported PFSS model lines</label>
        <p className="border-t border-slate-800 pt-2 font-medium text-slate-100">Conceptual illustration</p>
        <label className="flex gap-2"><input type="checkbox" checked={showDipole} onChange={event=>setShowDipole(event.target.checked)}/>Illustrative axial dipole lines (not current data)</label>
        {diagnostic&&<fieldset className="rounded border border-slate-700 p-2"><legend className="px-1 text-slate-300">Color HMI dots by absolute residual against</legend>
          <label className="mr-3 inline-flex gap-1"><input type="radio" name="los-color-basis" checked={losColorBasis==='map_residual'} onChange={()=>setLosColorBasis('map_residual')}/>full radial map</label>
          <label className="inline-flex gap-1"><input type="radio" name="los-color-basis" checked={losColorBasis==='radial_l1_residual'} onChange={()=>setLosColorBasis('radial_l1_residual')}/>radial l=1 approximation</label>
        </fieldset>}
        <button type="button" disabled={!diagnostic} onClick={()=>{
          if(diagnostic)setCameraPosition(xyz(3.5,diagnostic.hmi.observerCarringtonLatitudeDeg,
            diagnostic.hmi.observerCarringtonLongitudeDeg).map(value=>Number(value.toFixed(4))) as [number,number,number]);
        }} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50">Face HMI observer</button>
        <button type="button" disabled={!model} onClick={()=>setCameraPosition(position=>{
          const distance=Math.hypot(...position);
          const fitted=Math.max(6.5,model ? model.solver.sourceSurfaceRadiusSolar*2.6 : 6.5);
          return position.map(value=>Number((value*fitted/distance).toFixed(4))) as [number,number,number];
        })} className="ml-2 rounded border border-slate-600 px-2 py-1 disabled:opacity-50">Fit full corona</button>
        <div className="space-y-2 rounded border border-slate-700 p-2">
          <p className="font-medium">Reproducible display view</p>
          <p className="break-all text-slate-400">View ID: {viewRecipe?.recipeId??'preparing…'}</p>
          <button type="button" disabled={!viewRecipe} onClick={exportView} className="rounded border border-cyan-600 px-2 py-1 disabled:opacity-50">Export view recipe JSON</button>
          <label className="block">Import view recipe JSON
            <input type="file" accept="application/json,.json" aria-label="Import magnetic view recipe" className="mt-1 block w-full text-xs" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void loadView(file);event.currentTarget.value='';}}/>
          </label>
          <p className="text-slate-400">Replays the camera and magnetic layers only after the matching map, model and optional HMI diagnostic are loaded. The transient HEK active-region overlay is not saved by this recipe or comparison bundle. A view ID is not an observation or scientific validation.</p>
        </div>
        <p role="status" className="text-amber-200">{message}</p>
      </div>
    </div>
    {map&&<div className="space-y-1 break-all rounded border border-slate-800 p-2 text-slate-300">
      <p>Map: {map.source.provider} · {map.source.productId} · {map.source.kind} · declared earliest input {map.source.inputStartUtc ?? 'unavailable'} · reference/input-end time {map.source.inputEndUtc}. For a GONG synoptic map, the contributing-observation interval is not verified by this header time.</p>
      <p>Local normalized-map content ID: {mapContentId}</p>
      <p>{dipole?.observedAreaFraction===null?'Direct-observation coverage unknown (provider cell mask unavailable).':`Verified direct-input cell coverage: ${((dipole?.observedAreaFraction??0)*100).toFixed(1)}%.`} This assembled map is not a direct simultaneous full-Sun observation.</p>
      <p>Equivalent l=1 dipole from this map: {dipole?.magnitudeGauss.toFixed(2)} G (m/R☉³); vector [{dipole?.vectorGauss.map(value=>value.toFixed(2)).join(', ')}] G. This is not an independently measured global solar moment.</p>
      <p>Source: {map.source.sourceUrl.includes('.invalid/')?'local uploaded file; no provider URL verified':<a className="text-cyan-300 underline" href={map.source.sourceUrl} target="_blank" rel="noreferrer">open provider record</a>} · declared SHA-256 {map.source.sha256}</p>
    </div>}
    {model&&<p className="break-all text-slate-400">PFSS: {model.solver.name} {model.solver.version} · run {model.solver.runAtUtc} · grid {model.solver.grid.longitudeCells}×{model.solver.grid.sineLatitudeCells}×{model.solver.grid.radialCells} · source surface {model.solver.sourceSurfaceRadiusSolar} R☉ · {model.lines.length} displayed lines, {model.solver.tracing.rejectedLines} rejected · model ID {model.modelId}</p>}
    {diagnostic&&<div className="space-y-1 break-all rounded border border-slate-800 p-2 text-slate-300">
      <p>HMI measured LOS at {diagnostic.hmi.observedAtUtc} · {diagnostic.hmi.instrument} · observer Carrington {diagnostic.hmi.observerCarringtonLongitudeDeg.toFixed(2)}° / {diagnostic.hmi.observerCarringtonLatitudeDeg.toFixed(2)}° · quality flag {diagnostic.hmi.qualityFlag} · DRMS {diagnostic.hmi.drmsId}</p>
      <p>{diagnostic.projection.registeredDiskSampleCount} registered disk samples; {diagnostic.activeField.sampleCount} active-field samples; {diagnostic.displayPoints.length} plotted. Active-field RMS difference {diagnostic.activeField.rootMeanSquareResidualGauss.toFixed(1)} G (90°/180° shifted-map controls {diagnostic.longitudeShiftControls.map(control=>control.activeFieldOnSameSamples.rootMeanSquareResidualGauss.toFixed(1)).join(' / ')} G).</p>
      {l1LosComparison&&<p>On the same {l1LosComparison.sampleCount} displayed active-field samples: measured HMI LOS minus full-map radial projection RMS {l1LosComparison.mapProjectedLosRmsGauss.toFixed(1)} G; minus radial l=1 projection RMS {l1LosComparison.radialL1ProjectedLosRmsGauss.toFixed(1)} G. The l=1 calculation uses 2(m·r̂)μ and omits horizontal dipole field; this selected subset cannot measure the global dipole moment.</p>}
      <p>HMI FITS declared SHA-256 {diagnostic.hmi.sha256} · diagnostic ID {diagnostic.diagnosticId}</p>
      <p className="text-amber-200">HMI observation {diagnostic.hmi.observedAtUtc}; map reference/input-end field {diagnostic.mapLatestContributorUtc}, declared earliest input {diagnostic.mapEarliestContributorUtc??'unknown'}. The GONG contributing-observation interval is unverified. {diagnostic.hmi.qualityFlag!==0?'HMI quality flag is nonzero. ':''}Matched uncertainties are not supplied. These residuals are exploratory, not a calibrated or simultaneous model–observation validation.</p>
    </div>}
    {registration&&<div className="space-y-1 break-all rounded border border-lime-700/40 p-2 text-slate-300">
      <p>HMI sphere registration {registration.registrationId} · image {registration.source.observedAtUtc} · FITS SHA-256 {registration.source.fitsSha256}</p>
      <p>WCS sample grid: {registration.geometry.validOnDiskCount}/81 visible-disk samples, {registration.geometry.offDiskCount} off-disk, {registration.geometry.rejectedOnDiskCount} rejected; {registration.anchors.length} displayed anchors. Maximum image→Carrington→image round-trip error {registration.geometry.maxRoundTripErrorPixels.toExponential(2)} pixels.</p>
      <p className="text-amber-200">Quality {registration.coverage.qualityStatus.replaceAll('_',' ')}; visible-hemisphere geometry only. The source bytes were hashed locally, not provider-authenticated. No full-pixel coverage, far-side observation, coronal height or calibrated magnetic fit is established.</p>
      <details className="mt-2"><summary className="cursor-pointer text-lime-200">Inspect sampled HMI image ↔ sphere anchors</summary>
        <p className="my-1">Image-plane sample schematic, not the HMI pixel image or an exact limb outline. Select a numbered sample to highlight the same Carrington point on the globe.</p>
        <svg role="img" aria-label="HMI sampled image-plane geometry" viewBox={`0 0 ${registration.source.width} ${registration.source.height}`} className="h-48 w-48 border border-slate-700 bg-black">
          {registration.anchors.map((anchor,index)=><circle key={index} cx={anchor.pixelX} cy={anchor.pixelY}
            r={selectedAnchorIndex===index?registration.source.width/42:registration.source.width/72}
            fill={selectedAnchorIndex===index?'#ffffff':'#a3e635'}><title>{`Anchor ${index+1}: image pixel ${anchor.pixelX.toFixed(1)}, ${anchor.pixelY.toFixed(1)}`}</title></circle>)}
        </svg>
        <div className="mt-1 max-h-28 overflow-auto">{registration.anchors.map((anchor,index)=><button key={index} type="button"
          onClick={()=>setSelectedAnchorIndex(index)} aria-pressed={selectedAnchorIndex===index}
          className="mr-1 mb-1 rounded border border-lime-800 px-1 py-0.5 hover:bg-lime-900/20">#{index+1}</button>)}</div>
        {selectedAnchorIndex!==null&&registration.anchors[selectedAnchorIndex]&&<p>Anchor {selectedAnchorIndex+1}: HMI pixel {registration.anchors[selectedAnchorIndex].pixelX.toFixed(1)}, {registration.anchors[selectedAnchorIndex].pixelY.toFixed(1)} ↔ Carrington {registration.anchors[selectedAnchorIndex].carringtonLongitudeDeg.toFixed(2)}°/{registration.anchors[selectedAnchorIndex].carringtonLatitudeDeg.toFixed(2)}°; round-trip error {registration.anchors[selectedAnchorIndex].roundTripErrorPixels.toExponential(2)} px.</p>}
      </details>
    </div>}
    {sphereScene&&<div className="space-y-1 break-all rounded border border-cyan-700/40 p-2 text-slate-300" aria-label="Solar sphere scene identity">
      <p>Sphere scene {sphereScene.sceneId} · bundle {sphereScene.bundleId}</p>
      <p>{sphereScene.layers.map(item=>`${item.kind}: ${item.claim} (${item.observedAtUtc??'model time not an observation'})`).join(' · ')}</p>
      <p className="text-amber-200">This is an exact-ID layer index for the current view, not a simultaneous observed whole Sun or an independent magnetic-model validation. MCP can inspect it only after the matching bundle is retained for this profile.</p>
    </div>}
    <p className="text-amber-200">Display-only research preview. Local JSON schema and model-content checks do not authenticate providers or admit these products into MESA/solar-calibration evidence.</p>
  </section>;
}
