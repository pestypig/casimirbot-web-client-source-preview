import {useEffect,useMemo,useRef,useState} from 'react';
import {FERROFLUID_TOY_START,runFerrofluidAnalogueToy,type FerrofluidAnalogueToyInput} from '@shared/ferrofluid-analogue-toy';
import {
  FERROFLUID_ARC_EVIDENCE,FERROFLUID_ARC_EVIDENCE_START,FERROFLUID_ARC_HYPOTHESES,
  runFerrofluidArcEvidenceModel,type FerrofluidArcEvidenceInput,
} from '@shared/ferrofluid-arc-evidence-model';
import {
  FERROFLUID_ARC_REPEAT_PAIR_TEMPLATE,auditFerrofluidArcRepeatSourceHashes,
  compareFerrofluidArcRepeatPair,ferrofluidArcRepeatPairSchema,hashFerrofluidArcSourceBlob,
  type FerrofluidArcRepeatPair,
} from '@shared/ferrofluid-arc-repeat-comparison';
import {FERROFLUID_ARC_VIDEO_IMAGE_PLANE,projectedArcSpanOverBodyWidthBounds} from '@shared/ferrofluid-arc-video-annotations';
import {EXTERNAL_ARC_CLIP,fitExternalArcCrownTimeSeries,fitExternalArcImagePlane,simulateExternalArcResponse} from '@shared/ferrofluid-external-arc-response';
import {fitTwoLagCrownTimeSeries} from '@shared/ferrofluid-external-two-lag-response';
import {CURRENT_EXTERNAL_ARC_EVIDENCE_JOIN,auditExternalArcEvidenceJoin} from '@shared/ferrofluid-external-evidence-join';
import {compareExternalArcCommonMethodSettings,compareExternalArcForcingControls} from '@shared/ferrofluid-external-forcing-controls';
import {idealDipoleScaleDegeneracy} from '@shared/ferrofluid-external-magnet-scenario';
import FerrofluidSurfaceRegistrationViewer from '../components/ferrofluid/FerrofluidSurfaceRegistrationViewer';

const controls:[keyof Omit<FerrofluidAnalogueToyInput,'schemaVersion'>,string,number,number,number][]=[
  ['sphereRadiusMm','Ferrofluid sphere radius · assumed mm',10,38,1],
  ['flaskOffsetXMm','Flask center offset from plate axis · mm',-12,12,0.5],
  ['plateToRingMm','Plate-to-ring center distance · assumed mm',20,100,1],
  ['nominalDialRpm','Stirrer dial setting · nominal RPM',0,1800,25],
  ['plateFieldRatio','Plate dipole strength · arbitrary ratio',0,2,0.05],
  ['surroundBiasXRatio','Surrounding field · arbitrary horizontal ratio',-1,1,0.05],
  ['gravityDisplayRatio','Gravity display bias · arbitrary ratio',0,1,0.05],
];

export default function FerrofluidAnaloguePanel(){
  const [input,setInput]=useState<FerrofluidAnalogueToyInput>(FERROFLUID_TOY_START);
  const result=useMemo(()=>runFerrofluidAnalogueToy(input),[input]);
  const [arcInput,setArcInput]=useState<FerrofluidArcEvidenceInput>(FERROFLUID_ARC_EVIDENCE_START);
  const arcResult=useMemo(()=>runFerrofluidArcEvidenceModel(arcInput),[arcInput]);
  const externalArcFit=useMemo(()=>fitExternalArcImagePlane(),[]);
  const externalCrownSeries=useMemo(()=>fitExternalArcCrownTimeSeries(),[]);
  const twoLagCandidate=useMemo(()=>fitTwoLagCrownTimeSeries(),[]);
  const externalEvidenceAudit=useMemo(()=>auditExternalArcEvidenceJoin(CURRENT_EXTERNAL_ARC_EVIDENCE_JOIN),[]);
  const forcingControls=useMemo(()=>compareExternalArcForcingControls(),[]);
  const commonMethodControls=useMemo(()=>compareExternalArcCommonMethodSettings(),[]);
  const idealScaleDegeneracy=useMemo(()=>idealDipoleScaleDegeneracy([0,0,0.125],[0,0,0.05],2),[]);
  const trackedControl=forcingControls.controls.find(row=>row.control==='tracked-approach')!;
  const timeControl=forcingControls.controls.find(row=>row.control==='time-ramp')!;
  const externalArcArtifact=useMemo(()=>({
    schemaVersion:'ferrofluid-external-arc-analysis/1',
    evidence:EXTERNAL_ARC_CLIP,
    modelSource:'shared/ferrofluid-external-arc-response.ts',
    measurementSource:'tools/analyze_ferrofluid_external_clip.py',
    fit:externalArcFit,
    crownSeriesCheck:externalCrownSeries,
    twoLagCandidate:{...twoLagCandidate,selectedForDisplayedCurve:false,
      reason:'Lower training error but worse same-clip validation error and no better method-range coverage'},
    physicalEvidenceJoin:{sources:CURRENT_EXTERNAL_ARC_EVIDENCE_JOIN,audit:externalEvidenceAudit},
    postHocForcingControls:forcingControls,
    commonDetectorSettingControls:commonMethodControls,
    idealFieldIdentifiabilityExample:idealScaleDegeneracy,
    claimBoundary:'Image-plane silhouette surrogate only; no measured local field, 3-D pose, fluid path, magnetic reconnection, or independent replication.',
  }),[externalArcFit,externalCrownSeries,twoLagCandidate,externalEvidenceAudit,forcingControls,commonMethodControls,idealScaleDegeneracy]);
  const externalArcSamples=useMemo(()=>externalArcFit.representative?
    simulateExternalArcResponse(externalArcFit.representative.parameters):[],[externalArcFit]);
  const [media,setMedia]=useState<{url:string;name:string;kind:'video'|'image';sha256?:string}|null>(null);
  const [repeatComparison,setRepeatComparison]=useState<ReturnType<typeof compareFerrofluidArcRepeatPair>|null>(null);
  const [repeatPair,setRepeatPair]=useState<FerrofluidArcRepeatPair|null>(null);
  const [repeatSourceHashes,setRepeatSourceHashes]=useState<string[]>([]);
  const [repeatSourceStatus,setRepeatSourceStatus]=useState<string|null>(null);
  const [repeatError,setRepeatError]=useState<string|null>(null);
  const mediaGeneration=useRef(0);
  const repeatSourceGeneration=useRef(0);
  const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>()=>{if(media)URL.revokeObjectURL(media.url);},[media]);
  const loadLocalMedia=async(file:File|null)=>{
    if(!file)return;
    const generation=++mediaGeneration.current;
    const url=URL.createObjectURL(file);
    const kind=file.type.startsWith('video/')?'video':'image';
    setMedia({url,name:file.name,kind});
    try{
      const bytes=await file.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
      if(mediaGeneration.current===generation)setMedia({url,name:file.name,kind,sha256});
    }catch{
      // Local preview remains available even if hashing is unsupported.
    }
  };
  const knownMediaRole=media?.sha256===FERROFLUID_ARC_EVIDENCE.arcClip.sha256?'owner arc clip':
    FERROFLUID_ARC_EVIDENCE.stills.find(still=>still.sha256===media?.sha256)?.role;
  const loadRepeatPair=async(file:File|null)=>{
    ++repeatSourceGeneration.current;
    setRepeatComparison(null);
    setRepeatPair(null);
    setRepeatSourceHashes([]);
    setRepeatSourceStatus(null);
    setRepeatError(null);
    if(!file)return;
    if(file.size>1024*1024){setRepeatError('Trial JSON exceeds the 1 MiB local-import limit.');return;}
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const pair=ferrofluidArcRepeatPairSchema.parse(parsed);
      setRepeatPair(pair);
      setRepeatComparison(compareFerrofluidArcRepeatPair(pair));
    }catch{
      setRepeatError('This file is not valid ferrofluid-arc-repeat-pair/2 JSON. No result was admitted.');
    }
  };
  const hashRepeatSources=async(files:FileList|null)=>{
    const generation=++repeatSourceGeneration.current;
    setRepeatSourceHashes([]);
    setRepeatSourceStatus(null);
    if(!files)return;
    if(files.length>8){setRepeatSourceStatus('Choose at most eight source files per audit.');return;}
    try{
      const digests:string[]=[];
      for(const file of Array.from(files)){
        digests.push(await hashFerrofluidArcSourceBlob(file));
      }
      if(repeatSourceGeneration.current===generation){
        setRepeatSourceHashes(digests);
        setRepeatSourceStatus(`${digests.length} local file${digests.length===1?'':'s'} hashed; no bytes uploaded.`);
      }
    }catch{
      if(repeatSourceGeneration.current===generation)
        setRepeatSourceStatus('Local source hashing failed; no file identity was verified.');
    }
  };
  const repeatSourceAudit=repeatPair&&repeatSourceHashes.length>0
    ?auditFerrofluidArcRepeatSourceHashes(repeatPair,repeatSourceHashes):null;
  const plateX=180-input.flaskOffsetXMm*3.2;
  const scoreSpan=Math.max(0.001,result.displayContrast);
  const idealPath=arcResult.geometry.offsetSweep.map((sample,index)=>`${index?'L':'M'}${20+index*5},${115-95*sample.relativeVerticalFieldAmplitude}`).join(' ');
  const gradientPath=arcResult.geometry.offsetSweep.map((sample,index)=>`${index?'L':'M'}${20+index*5},${115-95*sample.normalizedHorizontalGradientMagnitude}`).join(' ');
  const verticalGradientPath=arcResult.geometry.offsetSweep.map((sample,index)=>`${index?'L':'M'}${20+index*5},${115-95*sample.normalizedVerticalGradientMagnitude}`).join(' ');
  return <main className="h-full overflow-auto bg-slate-950 p-4 text-slate-100">
    <div className="mx-auto max-w-6xl space-y-4">
      <header><p className="text-xs uppercase tracking-widest text-cyan-300">Star Watcher · model plugin · A0</p>
        <h1 className="text-xl font-semibold">Ferrofluid globe analogue</h1>
        <p className="mt-1 text-sm text-slate-300">Software-only geometry and normalized magnetic-pattern sandbox for the reported bottle, suspended RC62 ring, glycerin/ferrofluid interface, and stir plate. No coil commands, surface-shape prediction, or solar-flare claim.</p></header>
      <details className="rounded border border-amber-800 bg-slate-900/70 p-4 text-sm" aria-label="External magnet arc response simulation">
        <summary className="cursor-pointer font-medium">External magnet response · image-plane simulation</summary>
        <p className="mt-2 text-slate-300">The private IMG_8196 clip is identified by SHA-256 <code className="break-all text-xs">{EXTERNAL_ARC_CLIP.sourceSha256}</code>. Three exploratory projected open-loop span ranges, divided by the detected body width in each source frame, constrain an effective lag-and-recovery model. This does not reconstruct the hidden fluid flow or field.</p>
        <p className="mt-2 text-xs text-amber-200">{EXTERNAL_ARC_CLIP.forcingProxy}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded bg-slate-950 p-2">
            <svg viewBox="0 0 360 170" role="img" aria-label="Simulated projected open-loop span and three exploratory video intervals" className="w-full">
              <path d="M32 12 V140 H346" fill="none" stroke="#64748b"/>
              <text x="35" y="158" fill="#94a3b8" fontSize="10">0 s</text><text x="310" y="158" fill="#94a3b8" fontSize="10">15.7 s</text>
              <text x="2" y="20" fill="#94a3b8" fontSize="10">0.35</text><text x="8" y="139" fill="#94a3b8" fontSize="10">0</text>
              {externalArcSamples.length>0&&<path d={externalArcSamples.filter((_,index)=>index%3===0).map((sample,index)=>`${index?'L':'M'}${32+310*sample.timeS/EXTERNAL_ARC_CLIP.durationS},${140-120*sample.openLoopSpanOverBodyWidth/0.35}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="2"/>}
              {externalArcSamples.length>0&&<path d={externalArcSamples.filter((_,index)=>index%3===0).map((sample,index)=>`${index?'L':'M'}${32+310*sample.timeS/EXTERNAL_ARC_CLIP.durationS},${140-120*sample.proximityProxy}`).join(' ')} fill="none" stroke="#c084fc" strokeWidth="1.5" strokeDasharray="4 3"/>}
              {EXTERNAL_ARC_CLIP.observations.map(row=>{
                const x=32+310*row.timeS/EXTERNAL_ARC_CLIP.durationS;
                return <g key={row.timeS}><line x1={x} x2={x} y1={140-120*(row.maxSpanPx/row.bodyWidthPx)/0.35} y2={140-120*(row.minSpanPx/row.bodyWidthPx)/0.35} stroke="#fbbf24" strokeWidth="7" opacity="0.7"/><text x={x+3} y="152" fill="#fbbf24" fontSize="9">{row.timeS}s</text></g>;
              })}
            </svg>
            <p className="text-xs text-slate-400">Cyan: predicted open-loop span / detected body width (left axis, 0–0.35). Violet dashed: projected approach index (separate 0–1 scale). Amber: reviewer-estimated span ranges, not millimetres or confidence intervals.</p>
          </div>
          <div className="space-y-2 text-xs text-slate-300">
            <p><strong>{externalArcFit.admissibleCount} / {externalArcFit.tested}</strong> tested parameter sets satisfy all three broad ranges at the nominal body threshold. Allowing the stated threshold-sensitivity envelope admits <strong>{externalArcFit.thresholdEnvelopeCompatibleCount} / {externalArcFit.tested}</strong>. Neither count is a probability or a uniquely identified mechanism.</p>
            <p>Within-clip leave-one-time-out: {externalArcFit.withinClipLeaveOneOut.map(row=>`${row.heldOutCompatibleCount}/${row.trainingCompatibleCount} recover ${row.heldOutTimeS} s`).join('; ')}. The 10-s range is weakly predicted from 0 and 8 s alone. This is a stress test, not an independent repeat; the forcing schedule was chosen from this same clip.</p>
            {externalArcFit.representative&&<p>Representative effective values: baseline span/body width {externalArcFit.representative.parameters.baselineSpanOverBodyWidth.toFixed(3)}; contraction factor {externalArcFit.representative.parameters.maxContractionFraction.toFixed(2)}; approach/recovery constants {externalArcFit.representative.parameters.approachTimeConstantS}/{externalArcFit.representative.parameters.recoveryTimeConstantS} s. These are silhouette parameters, not material properties.</p>}
            <p>Across compatible scenarios, 15-s predicted span/body width ranges {externalArcFit.predictedRatioRangeAt15S?.map(value=>value.toFixed(3)).join('–')??'unavailable'}. The clip instead has a changed contour, so that range cannot be scored as recovered open-loop span. {EXTERNAL_ARC_CLIP.lateObservation}</p>
            <p>Source-frame body widths: {EXTERNAL_ARC_CLIP.observations.map(row=>`${row.bodyWidthPx} px at ${row.timeS} s (threshold sweep ${row.bodyWidthMethodRangePx.join('–')} px)`).join('; ')}. Reproduce with <code>{EXTERNAL_ARC_CLIP.bodyScaleMethod}</code>. Camera motion, refraction and segmentation choices still limit precision.</p>
            <p>Exploratory crown-line time-series check: fit at even seconds, inspect seven other same-clip frames. Mean absolute span/body-width error <strong>{externalCrownSeries.validationMae.toFixed(3)}</strong> versus <strong>{externalCrownSeries.nullBaselineValidationMae.toFixed(3)}</strong> for a constant baseline; only <strong>{externalCrownSeries.validationWithinMethodRange}/7</strong> predictions lie inside the image-processing method ranges. The trend improves, but frame-level reproduction is <strong>not established</strong>.</p>
            <p>A two-stage suspension/interface lag candidate reduces training error but raises the seven-frame error to <strong>{twoLagCandidate.validationMae.toFixed(3)}</strong> (versus {externalCrownSeries.validationMae.toFixed(3)} for one state), with the same {twoLagCandidate.validationWithinMethodRange}/7 method-range coverage. It is <strong>not selected as an identified apparatus mechanism</strong>; ring pose, local field and interface motion are unmeasured.</p>
            <p>Post-hoc forcing control: on the same six fit frames and seven other frames, a generic elapsed-time ramp scores <strong>{timeControl.validationMae.toFixed(3)}</strong> nominal error with {timeControl.validationWithinMethodRange}/7 method-range hits; the tracked magnet/cork approach scores <strong>{trackedControl.validationMae.toFixed(3)}</strong> with {trackedControl.validationWithinMethodRange}/7. Both use the same one-lag parameter grid. Holding those fits fixed, the time-minus-approach error difference can range from {forcingControls.pairedTimeMinusTrackedMethodEnvelope.minimum.toFixed(4)} to {forcingControls.pairedTimeMinusTrackedMethodEnvelope.maximum.toFixed(4)} across independent detector-method intervals, crossing zero. This conservative envelope does not enforce one common detector setting across frames or refit each setting; it is not a confidence interval. The approach timing has <strong>no robust unique predictive advantage</strong> here. This is not an independent causal test.</p>
            <p>A stricter source-video check refits each schedule under one fixed black-hat detector setting for every frame. Elapsed time scores lower held-out error in <strong>{commonMethodControls.elapsedTimeNominalWins}/9</strong> settings and tracked approach in <strong>{commonMethodControls.trackedNominalWins}/9</strong>. These settings are correlated method choices on one clip, not nine independent experiments; the dark feature is still not confirmed as the same material contour in every frame.</p>
            <details><summary className="cursor-pointer text-cyan-300">Why the phone field cannot drive this video simulation</summary>
              <p className="mt-1">The phone CSV and IMG_8196 are separate captures without verified clock synchronization. The phone was about 17.8 cm from the stir-plate center, not at the crown; the CSV header gives no field unit. The 32 Hz phone component therefore cannot be assigned to this handheld-magnet approach or used as its local magnetic force.</p>
              <p className="mt-1">Reported measured-forcing input ready: <strong>{externalEvidenceAudit.forcingInputAdmitted?'yes':'no'}</strong>. Reported inputs ready for a physical solve: <strong>{externalEvidenceAudit.reportedInputsReadyForPhysicalSolve?'yes':'no'}</strong>. No source bytes or calibration are independently verified here, and no fluid solve is performed. Missing: {[...externalEvidenceAudit.missing,...externalEvidenceAudit.physicalMissing].join(' ')}</p>
            </details>
            <details><summary className="cursor-pointer text-cyan-300">Why one field value would not identify the magnet force</summary>
              <p className="mt-1">In an ideal far-field dipole example—not this measured apparatus—a 0.125 A·m² moment at 5 cm and a 1 A·m² moment at 10 cm both give the same axial field of {(idealScaleDegeneracy.baselineFieldTesla[2]*1000).toFixed(3)} mT. The spatial field gradient in the second case is only {idealScaleDegeneracy.exactGradientMagnitudeRatio.toFixed(2)} times the first. The handheld magnet moment, three-dimensional separation and local field are not measured here, so even a single field reading could not identify the force or reproduce the fluid response.</p>
            </details>
            <details><summary className="cursor-pointer text-cyan-300">Inspect projected approach trace</summary><p className="mt-1">{EXTERNAL_ARC_CLIP.projectedFeatureSeparation.map(row=>`${row.timeS}s: ${row.relativeYOverBodyWidth.toFixed(3)}`).join(' · ')}. This is a feature-origin index, not the surface gap, magnetic strength or magnet-to-fluid distance.</p></details>
            <details><summary className="cursor-pointer text-cyan-300">Inspect body-versus-cork image motion</summary>
              <p className="mt-1">At 2 s the detected body center minus tracked cork origin is {EXTERNAL_ARC_CLIP.bodyRelativeToCorkImageIndex.rows[0].xOverBodyWidth.toFixed(3)} body widths horizontally; at 10 s it is {EXTERNAL_ARC_CLIP.bodyRelativeToCorkImageIndex.rows.at(-1)!.xOverBodyWidth.toFixed(3)}. The paired change stays negative across five body thresholds ({Math.min(...Object.values(EXTERNAL_ARC_CLIP.bodyRelativeToCorkImageIndex.pairedTwoToTenSecondXChangeByBodyThreshold)).toFixed(3)} to {Math.max(...Object.values(EXTERNAL_ARC_CLIP.bodyRelativeToCorkImageIndex.pairedTwoToTenSecondXChangeByBodyThreshold)).toFixed(3)} widths), but the cork template score drops from 1.000 to about 0.85–0.87 during close approach. {EXTERNAL_ARC_CLIP.bodyRelativeToCorkImageIndex.meaning}</p>
            </details>
            <details><summary className="cursor-pointer text-cyan-300">Inspect crown-line frame check</summary><p className="mt-1">{externalCrownSeries.validationRows.map(row=>`${row.timeS}s observed ${row.observedRatio.toFixed(3)}, predicted ${row.predictedRatio.toFixed(3)}${row.withinMethodRange?' ✓':' outside method range'}`).join(' · ')}. {EXTERNAL_ARC_CLIP.crownLineMethod}. The selected dark component is not a verified material path.</p></details>
            <a className="inline-block text-cyan-300 underline" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(externalArcArtifact,null,2))}`} download="ferrofluid-external-arc-analysis-v1.json">Download reproducible analysis JSON</a>
            <p className="text-amber-200">No measured 3-D magnet distance, local vector field, ring pose, interface shape or independent run was used. The plate offset, string, magnet and fluid remain candidate causal paths. This fit is not a magnetic reconnection or jet simulation.</p>
          </div>
        </div>
      </details>
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(340px,1fr)]">
        <section className="rounded border border-slate-700 bg-slate-900/70 p-4" aria-label="Analogue geometry and field pattern">
          <h2 className="font-medium">Cross-section · illustrative</h2>
          <svg viewBox="0 0 360 360" role="img" aria-label="Spherical flask, suspended ring, ferrofluid interface and relative field-pattern samples" className="mt-2 w-full rounded bg-slate-950">
            <circle cx="180" cy="168" r="145" fill="#0c2340" stroke="#94a3b8" strokeWidth="3"/>
            <circle cx="180" cy="168" r="137" fill="none" stroke="#1d4e67"/>
            <line x1="180" y1="15" x2="180" y2="168" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="5 3"/>
            <circle cx="180" cy="168" r={input.sphereRadiusMm*3.2} fill="#222b31" stroke="#93a9b6" strokeWidth="2"/>
            {result.samples.map((sample,index)=>{
              const normalized=(sample.displayScore-result.meanDisplayScore)/scoreSpan;
              const r=input.sphereRadiusMm*3.2;
              const x=180+r*Math.sin(sample.angleRad),y=168-r*Math.cos(sample.angleRad);
              return <circle key={index} cx={x} cy={y} r="2.5" fill={normalized>0.1?'#f59e0b':normalized< -0.1?'#22d3ee':'#cbd5e1'}/>;
            })}
            <ellipse cx="180" cy="168" rx="28" ry="7" fill="none" stroke="#facc15" strokeWidth="5"/>
            <circle cx={plateX} cy="328" r="4" fill="#f97316"/>
            <path d="M100 332 H260" stroke="#64748b" strokeWidth="8"/>
            <text x="10" y="345" fill="#cbd5e1" fontSize="11">stir plate · field unmeasured</text>
            <text x="204" y="42" fill="#e2e8f0" fontSize="11">string + swivel</text>
          </svg>
          <p className="mt-2 text-xs text-slate-400">Amber/cyan dots show above/below-mean <em>display score</em> on one meridian. They are not observed fluid deformation or calibrated tesla values. The ring drawing is schematic.</p>
        </section>
        <section className="rounded border border-slate-700 bg-slate-900/70 p-4" aria-label="Toy model controls">
          <h2 className="font-medium">Change one assumption at a time</h2>
          <div className="mt-3 space-y-3">{controls.map(([key,label,min,max,step])=><label key={key} className="block text-xs text-slate-200">
            <span className="flex justify-between gap-2"><span>{label}</span><output>{input[key]}</output></span>
            <input type="range" aria-label={label} min={min} max={max} step={step} value={input[key]}
              onChange={event=>setInput(previous=>({...previous,[key]:Number(event.target.value)}))}
              className="mt-1 w-full accent-cyan-400"/>
          </label>)}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <p>Nominal dial frequency: <strong>{result.nominalDriveHz.toFixed(2)} Hz</strong></p>
            <p>Pattern contrast: <strong>{result.displayContrast.toFixed(2)}</strong> arbitrary</p>
            <p>Bottom minus top display score: <strong>{result.lowerMinusUpperDisplayScore.toFixed(2)}</strong></p>
            <p>Ring spin field change: <strong>none in ideal axial symmetry</strong></p>
          </div>
          <p className="mt-3 text-xs text-amber-200">{result.pointDipoleCaution?'The sphere is close to the RC62 ring relative to its size; point-dipole near-field error may be large. ':''}Dial RPM is not a measured rotor rate. Bias and gravity controls are dimensionless display parameters, not electromagnetic setpoints.</p>
        </section>
      </div>
      <section className="rounded border border-cyan-800 bg-slate-900/70 p-4 text-sm" aria-label="Measured arc evidence and candidate response">
        <h2 className="font-medium">Measured drive and candidate response</h2>
        <p className="mt-2 text-slate-300">The phone trace contains a dominant {FERROFLUID_ARC_EVIDENCE.magnetometer.earlierHz.toFixed(2)} Hz regime, a 230–240 s transition, and a {FERROFLUID_ARC_EVIDENCE.magnetometer.laterHz.toFixed(2)} Hz regime. The owner reports a stable arc from about 270 s until after 582 s and may have adjusted the dial while searching. Treating the phone frequency as the plate drive is an <strong>explicit working assumption</strong>, not measured rotor speed.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <p className="rounded bg-slate-950 p-2"><strong>200–230 s</strong><br/>28.98 Hz at phone<br/>Arc state unknown</p>
          <p className="rounded bg-slate-950 p-2"><strong>230–240 s</strong><br/>Frequency changes<br/>Dial may have moved</p>
          <p className="rounded bg-slate-950 p-2"><strong>270–582+ s</strong><br/>~32.46 Hz at phone<br/>Stable arc reported</p>
          <p className="rounded bg-slate-950 p-2"><strong>~586–588 s</strong><br/>Periodic field collapses<br/>Consistent with shutdown</p>
        </div>
        <p className="mt-2 text-xs text-amber-200">The 17.98 s arc video has not been synchronized to the 594.81 s magnetometer run. A visible loop is morphology, not a measured material path or magnetic reconnection.</p>
        <p className="mt-2 text-xs text-slate-300">Same-recording check: disjoint 10 s Bz fits from 270–550 s ranged {FERROFLUID_ARC_EVIDENCE.magnetometer.temporalHoldout.trainingFrequencyRangeHz.join('–')} Hz. The held-out 550–580 s segments were {FERROFLUID_ARC_EVIDENCE.magnetometer.temporalHoldout.heldOutFrequenciesHz.join(', ')} Hz, all within that training range. This supports <em>phone-signal frequency persistence only</em>; it is neither an independent repeat nor a held-out arc prediction.</p>
        <p className="mt-2 text-xs text-slate-300">Three-axis check: a single-frequency fit to Bx/By/Bz traces an ellipse in phone-vector space. Its minor/major ratio is {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.windows[0].minorOverMajor} at 28.98 Hz and about 0.53–0.54 in the later 32.46–32.48 Hz regime. The 270–550 s ten-second fits ranged {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.trainingRatioRange.join('–')}; held-out 550–580 s ratios were {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.heldOutRatios.join(', ')}, inside that range. This supports persistent <em>phone-signal polarization</em>, not verified rotor speed or a unique magnetic source.</p>
        <p className="mt-1 text-xs text-slate-400">The ellipse ratio is independent of a fixed rotation of the phone axes. The owner reports the phone was not moved, but orientation was not independently logged; motor harmonics, sampling aliases and other fields are not excluded.</p>
        <p className="mt-2 text-xs text-slate-300">Amplitude countercheck: the fitted phone-vector ellipse major axis is {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.windows[0].majorAxisAppUnits} app units at 200–230 s versus {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.windows[1].majorAxisAppUnits} at 270–300 s. The later observed band is therefore not simply a larger phone-signal amplitude in those windows. A 270–550 s ten-second training range of {FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.trainingMajorAxisAppUnitsRange.join('–')} did <strong>not</strong> contain every held-out 550–580 s amplitude ({FERROFLUID_ARC_EVIDENCE.magnetometer.vectorEllipse.heldOutMajorAxisAppUnits.join(', ')}). Frequency and ellipse shape persist better than amplitude in this one recording.</p>
        <p className="mt-1 text-xs text-amber-200">The CSV header omits field units, and a phone about 7 inches from the plate does not measure forcing at the ring or ferrofluid. This countercheck does not refute resonance, establish a jet threshold, or turn the separate clip into a synchronized measurement.</p>
        <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 text-xs" aria-label="Hypothetical coupled-mode sensitivity">
          <h3 className="font-medium text-cyan-200">Could a narrow mode favor the later frequency?</h3>
          <p className="mt-1 text-slate-300">Explore a single linear ring–line–fluid mode. The starting 32.46 Hz value is deliberately tuned to the later observed band as an example, not fitted from a displacement. Both controls are <strong>candidate</strong> parameters, not measured natural frequency or damping.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">{([
            ['candidateCoupledModeHz','Candidate coupled-mode frequency · Hz',20,40,0.02],
            ['candidateDampingRatio','Candidate damping ratio',0.005,0.5,0.005],
          ] as [keyof FerrofluidArcEvidenceInput,string,number,number,number][]).map(([key,label,min,max,step])=><label key={key} className="block">
            <span className="flex justify-between gap-2"><span>{label}</span><output>{arcInput[key]}</output></span>
            <input type="range" aria-label={label} min={min} max={max} step={step} value={arcInput[key] as number}
              onChange={event=>setArcInput(previous=>({...previous,[key]:Number(event.target.value)}))}
              className="mt-1 w-full accent-cyan-400"/>
          </label>)}</div>
          <p className="mt-2">Unit-force response: 28.98 Hz <strong>{arcResult.coupledModeSensitivity.earlierNormalizedResponse.toFixed(2)}</strong>; 32.46 Hz <strong>{arcResult.coupledModeSensitivity.laterNormalizedResponse.toFixed(2)}</strong>. Later/earlier ratio: <strong>{arcResult.coupledModeSensitivity.laterOverEarlierResponse.toFixed(2)}×</strong> (candidate Q = {arcResult.coupledModeSensitivity.qualityFactor.toFixed(1)}).</p>
          <p className="mt-1 text-amber-200">This ratio assumes equal forcing amplitudes at both frequencies, one unchanged linear mode, and that the phone bands track its drive. None is verified. There is no measured mode, displacement, arc threshold or early-band arc label; the calculation does not predict the jet or identify the offset.</p>
        </div>
        <a className="mt-2 inline-block text-xs text-cyan-300 underline" href={FERROFLUID_ARC_EVIDENCE.magnetometer.sourceUrl} target="_blank" rel="noreferrer">Open exact magnetometer CSV source</a>
      </section>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Offset and line hypothesis sweep">
        <div className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm">
          <h2 className="font-medium">Off-axis field geometry · hypothesis</h2>
          <p className="mt-2 text-slate-300">For an ideal horizontal point dipole rotating beneath an axial ring, the vertical-field component at the ring vanishes on the plate axis and increases with offset before falling again. Its horizontal gradient behaves differently. Both curves are dimensionless geometry sensitivities—not the real local field, ring force or jet likelihood.</p>
          <div className="mt-3 space-y-3">
            {([
              ['plateToRingMm','Candidate plate-to-ring height · mm',20,100,1],
              ['candidateOffsetMm','Candidate signed offset · mm',-60,60,0.5],
              ['candidateLineLengthMm','Candidate free nylon span · mm',20,100,1],
              ['candidateLineTensionN','Candidate line tension · N',0.001,0.15,0.001],
            ] as [keyof FerrofluidArcEvidenceInput,string,number,number,number][]).map(([key,label,min,max,step])=><label key={key} className="block text-xs">
              <span className="flex justify-between gap-2"><span>{label}</span><output>{arcInput[key]}</output></span>
              <input type="range" aria-label={label} min={min} max={max} step={step} value={arcInput[key] as number}
                onChange={event=>setArcInput(previous=>({...previous,[key]:Number(event.target.value)}))}
                className="mt-1 w-full accent-cyan-400"/>
            </label>)}
          </div>
          <svg viewBox="0 0 290 140" role="img" aria-label="Ideal vertical magnetic-field component versus offset divided by plate-to-ring height" className="mt-3 w-full rounded bg-slate-950">
            <path d="M20 115 H270 M20 115 V15" stroke="#64748b" fill="none"/>
            <path d={idealPath} stroke="#22d3ee" strokeWidth="2" fill="none"/>
            <path d={gradientPath} stroke="#c084fc" strokeWidth="2" strokeDasharray="4 3" fill="none"/>
            <path d={verticalGradientPath} stroke="#fb923c" strokeWidth="2" strokeDasharray="2 3" fill="none"/>
            {Math.abs(arcInput.candidateOffsetMm)<=arcInput.plateToRingMm&&
              <circle cx={20+250*Math.abs(arcInput.candidateOffsetMm)/arcInput.plateToRingMm} cy={115-95*arcResult.geometry.relativeVerticalFieldAmplitude} r="4" fill="#f59e0b"/>}
            <text x="26" y="132" fill="#cbd5e1" fontSize="9">0</text><text x="220" y="132" fill="#cbd5e1" fontSize="9">offset / height = 1</text>
          </svg>
          <p className="mt-1 text-xs text-slate-300"><span className="text-cyan-300">Solid cyan:</span> ideal |Bz| amplitude divided by the on-axis horizontal field scale. <span className="text-purple-300">Dashed purple:</span> ideal |∂Bz/∂x|. <span className="text-orange-300">Dotted orange:</span> ideal |∂Bz/∂z|. Both gradients use the same on-axis gradient scale.</p>
          <p className="mt-2 text-xs">At this candidate: relative vertical-field amplitude <strong>{arcResult.geometry.relativeVerticalFieldAmplitude.toFixed(3)}</strong>. The ideal component peaks at |offset| ≈ <strong>{arcResult.geometry.peakIdealVerticalFieldOffsetMm.toFixed(1)} mm</strong> for this assumed height; its 90%-of-peak geometry band is {arcResult.geometry.ninetyPercentPeakBandMm[0].toFixed(1)}–{arcResult.geometry.ninetyPercentPeakBandMm[1].toFixed(1)} mm.</p>
          <p className="mt-1 text-xs">At that same candidate, ideal signed horizontal/vertical gradient ratios are <strong>{arcResult.geometry.signedHorizontalGradientRatio.toFixed(3)} / {arcResult.geometry.signedVerticalGradientRatio.toFixed(3)}</strong>. In a hypothetical axial ring-dipole model, these are proportional to lateral/vertical force components at one drive phase; both reverse after half a cycle. The corresponding ideal direction is {arcResult.geometry.idealForceDirectionDeg.toFixed(1)}° from positive offset. The unknown plate and ring moments prevent an absolute force or nylon-deflection estimate.</p>
          <p className="mt-1 text-xs text-amber-200">The lateral gradient is zero at the |Bz| peak, while it is nonzero on axis; vertical forcing changes with offset. That helps test an orientation hypothesis but does not identify the jet-producing offset or actual 3D field.</p>
          {Math.abs(arcInput.candidateOffsetMm)>arcInput.plateToRingMm&&<p className="mt-1 text-xs text-slate-400">Candidate offset lies beyond the chart's offset / height = 1 range; no marker is plotted.</p>}
          <p className="mt-2 text-xs text-amber-200">This band does not identify the actual offset or the offset that makes a jet. The photo establishes off-axis placement, not the hidden plate magnet center or a calibrated distance. This candidate sweep is independent of the schematic cross-section above; its offset is measured from a hypothetical rotating plate dipole to the ring, not necessarily the flask center.</p>
          <p className="mt-2 text-xs text-slate-400">Across the explicitly allowed but <em>unmeasured</em> 20–100 mm height scenarios, even this ideal field-component peak moves from {arcResult.scenarioBounds.idealPeakOffsetMm.join(' to ')} mm. That is a scenario envelope, not an error bar on the apparatus or a jet prediction.</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm">
          <h2 className="font-medium">Nylon line and suspended ring · limiting check</h2>
          <p className="mt-2 text-slate-300">The parts list gives a 0.45 mm nylon line and 5.09 g RC62 ring. The line span, tension, wet loading, swivel boundary and magnetic lift are not measured. The calculation below asks whether a <em>dry, taut string</em> fundamental could equal the measured 32.46 Hz drive under the chosen assumptions.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded bg-slate-950 p-2">Dry-string fundamental at candidate tension<br/><strong>{arcResult.dryLineCheck.assumedFundamentalHz.toFixed(1)} Hz</strong></p>
            <p className="rounded bg-slate-950 p-2">Tension required for 32.46 Hz<br/><strong>{arcResult.dryLineCheck.tensionRequiredForMeasuredHzN.toFixed(4)} N</strong></p>
            <p className="rounded bg-slate-950 p-2">Ring weight in air<br/><strong>{arcResult.dryLineCheck.ringWeightInAirN.toFixed(4)} N</strong></p>
            <p className="rounded bg-slate-950 p-2">Simple pendulum frequency at candidate span<br/><strong>{arcResult.dryLineCheck.idealPendulumHz.toFixed(2)} Hz</strong></p>
          </div>
          <p className="mt-2 text-xs text-amber-200">At these defaults, 32.46 Hz would require dry-line tension only {(100*arcResult.dryLineCheck.requiredTensionOverRingWeight).toFixed(1)}% of the ring's weight in air. That makes a simple taut-string fundamental a weak explanation unless the line is strongly unloaded or wet/coupled dynamics change the mode. It does not rule out ring wobble, line forcing, fluid-interface modes or an arc driven at another frequency.</p>
          <p className="mt-2 text-xs text-slate-400">Sensitivity at this assumed line diameter/density: matching 32.46 Hz would require {arcResult.dryLineCheck.lineSpanSweep.map(row=>`${row.requiredDryTensionN.toFixed(4)} N at ${row.lengthMm} mm`).join('; ')}. These are inverse dry-line calculations, not measured tensions.</p>
          <p className="mt-2 text-xs text-slate-400">Nylon density 1140 kg/m³ and 50 mm span are hypothesis defaults, not measured material or geometry. No force amplitude, interface shape or flow direction is solved.</p>
        </div>
      </section>
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm" aria-label="Private local media comparison">
        <h2 className="font-medium">Compare the private clip or still locally</h2>
        <p className="mt-2 text-slate-300">Choose the supplied clip or a photo from this computer. Preview and SHA-256 identification stay in this browser session; media is not bundled into the plugin or sent to a service.</p>
        <div className="mt-3 rounded bg-slate-950 p-3 text-xs" aria-label="Exploratory clip image-plane annotations">
          <h3 className="font-medium text-cyan-200">Exploratory image-plane span · supplied clip</h3>
          <p className="mt-1 text-slate-300">One reviewer marked broad edge ranges on three extracted frames. The quantity below is apparent hook/arch horizontal span divided by visible ferrofluid-body width <em>in that frame</em>; it is not millimetres, velocity, or a tracked material path.</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-3">{FERROFLUID_ARC_VIDEO_IMAGE_PLANE.frames.map(frame=>{
            const [minimum,maximum]=projectedArcSpanOverBodyWidthBounds(frame);
            return <p key={frame.timeS} className="rounded border border-slate-700 p-2">{frame.timeS} s · projected ratio <strong>{minimum.toFixed(2)}–{maximum.toFixed(2)}</strong></p>;
          })}</div>
          <p className="mt-2 text-amber-200">The 0.5 s and 10 s exploratory ranges separate, but the camera reframes and curved glass distorts both outlines. No independent annotation, fixed camera, 3-D trajectory, ejection speed or fluid-return direction is established. Frames at 6 s and 15 s were not assigned this metric because their silhouettes are less reliable for the same comparison.</p>
        </div>
        <input className="mt-3 block w-full text-xs" type="file" accept="video/*,image/*" aria-label="Open local ferrofluid video or photo" onChange={event=>void loadLocalMedia(event.target.files?.[0]??null)}/>
        {media&&<div className="mt-3 space-y-2">
          <p className="text-xs">{media.name} · {media.sha256?(knownMediaRole?`Matched source: ${knownMediaRole}`:'Hash does not match the five identified stills or arc clip'):'Checking source hash or hash unavailable'}</p>
          {media.kind==='video'?<><video ref={videoRef} src={media.url} controls className="max-h-96 w-full rounded bg-black"/>
            {knownMediaRole==='owner arc clip'&&<div className="flex flex-wrap gap-2 text-xs">{FERROFLUID_ARC_EVIDENCE.arcClip.observations.map(observation=><button type="button" key={observation.timeS} className="rounded border border-slate-500 px-2 py-1" onClick={()=>{if(videoRef.current){videoRef.current.currentTime=observation.timeS;videoRef.current.pause();}}}>{observation.timeS}s · {observation.label}</button>)}</div>}</>
            :<img src={media.url} alt={`Local ferrofluid evidence: ${knownMediaRole??'unverified image'}`} className="max-h-96 rounded object-contain"/>}
        </div>}
        <p className="mt-2 text-xs text-slate-400">Identified sources: driven side, top placement, rest side, arc still, phone setup, and the 17.98 s clip. The clip camera moves and reframes, so apparent arc size across frames is not a calibrated displacement. Its container records 2026-10-02 while the CSV filename says 2026-10-04; clocks are unverified and the two sources are not assumed synchronized.</p>
      </section>
      <FerrofluidSurfaceRegistrationViewer
        videoUrl={media?.kind==='video'?media.url:null}
        videoSha256={media?.kind==='video'?media.sha256??null:null}
      />
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm" aria-label="Apparatus evidence ledger">
        <h2 className="font-medium">What this first plugin knows</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <p><strong>Part specifications:</strong> Nakpunar 250 mL bottle; K&J RC62 axial ring (19.05 × 9.52 × 3.17 mm); nominal MS-1L 200–1800 RPM; 0.45 mm nylon line. Product specifications are not as-built measurements.</p>
          <p><strong>Operator observations:</strong> Ring suspended near center; visible ferrofluid/glycerin interface; gravity sag; off-axis placement and an arc near a suspected line resonance; response to nearby magnets. Mechanisms remain hypotheses.</p>
          <p><strong>Missing for physical solve:</strong> Exact fluid volume and identity, inner glass geometry, local field maps, rotor speed/axis, line length/tension, viscosities, density contrast, interfacial tension, magnetization curve, temperature and synchronized video timing.</p>
        </div>
        <p className="mt-3 text-amber-200">Solar globe binding: none. A PFSS line drawing or equivalent dipole is not a laboratory vector-field command. A future surrounding-coil design requires a measured field basis, inverse solve and separate safety/actuation gate.</p>
      </section>
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm" aria-label="Discriminating arc hypotheses">
        <h2 className="font-medium">What would narrow the arc mechanism?</h2>
        <p className="mt-2 text-slate-300">The current recording supports a drive-regime association, but the dial may have moved and the arc video is a separate run. These alternatives are not ranked by the available evidence. Change one variable at a time and log negative trials as well as successful arcs.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">{FERROFLUID_ARC_HYPOTHESES.map(hypothesis=><article key={hypothesis.id} className="rounded bg-slate-950 p-3">
          <h3 className="font-medium text-cyan-200">{hypothesis.id.replaceAll('-',' ')}</h3>
          <p className="mt-2">{hypothesis.mechanism}</p>
          <p className="mt-2 text-slate-300"><strong>Control:</strong> {hypothesis.discriminatingControl}</p>
          <p className="mt-2 text-amber-200"><strong>Prediction:</strong> {hypothesis.expectedIfImportant}</p>
        </article>)}</div>
      </section>
      <details className="rounded border border-slate-700 bg-slate-900/70 p-4 text-sm" aria-label="Independent repeat-trial comparison">
        <summary className="cursor-pointer font-medium">Compare a future independent repeat · local JSON</summary>
        <p className="mt-2 text-slate-300">Download the blank two-run contract before repeating the experiment. Freeze <code>plannedContrast</code>, <code>predictedArcContrast</code>, matched-control tolerances, and any provisional assumptions before capture; replace nulls only with measured values and their uncertainties. Record both successful and negative trials. Offset, line-span and drive comparisons require distinct recordings and one resolved changed variable. A nuisance setting counts as matched only if its full difference plus both stated uncertainties fits its predeclared tolerance; overlapping uncertainty ranges alone do not suffice. Nothing is uploaded or used to command the plate.</p>
        <a className="mt-2 inline-block text-cyan-300 underline" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(FERROFLUID_ARC_REPEAT_PAIR_TEMPLATE,null,2))}`} download="ferrofluid-arc-repeat-pair-template.json">Download blank repeat-pair JSON</a>
        <input type="file" accept=".json,application/json" aria-label="Open local independent repeat-pair JSON" className="mt-3 block w-full text-xs" onChange={event=>void loadRepeatPair(event.target.files?.[0]??null)}/>
        {repeatPair&&<div className="mt-3 rounded bg-slate-950 p-3 text-xs">
          <label className="block">Check declared source files locally (control and candidate CSV/video)
            <input type="file" multiple aria-label="Open local repeat source files for hash verification" className="mt-1 block w-full" onChange={event=>void hashRepeatSources(event.target.files)}/>
          </label>
          {repeatSourceStatus&&<p className="mt-1">{repeatSourceStatus}</p>}
          {repeatSourceAudit&&<p className="mt-1">Declared file byte hashes matched: <strong>{repeatSourceAudit.matchedCount}/4</strong> · {repeatSourceAudit.allFourDeclaredFilesMatched?'all four distinct declarations have matching local bytes':'one or more declared sources are missing or duplicated'}.</p>}
          <p className="mt-1 text-amber-200">Streaming SHA-256 avoids loading whole videos into memory. A hash match identifies bytes only; it does not validate CSV/video contents, synchronize clocks, or prove preregistration.</p>
        </div>}
        {repeatError&&<p role="alert" className="mt-2 text-amber-200">{repeatError}</p>}
        {repeatComparison&&<div className="mt-3 rounded bg-slate-950 p-3">
          <p><strong>{repeatComparison.readyForDescriptiveContrast?'Descriptive contrast ready for source review':'Inconclusive pair'}</strong> · {repeatComparison.plannedContrast} · {repeatComparison.evidenceTier.replaceAll('-',' ')}</p>
          {repeatComparison.predictedArcContrast&&<p className="mt-1">Predicted arc labels: {repeatComparison.predictedArcContrast.replaceAll('-',' ')}</p>}
          {repeatComparison.arcContrast&&<p className="mt-1">Arc labels: {repeatComparison.arcContrast.replaceAll('-',' ')}</p>}
          {repeatComparison.predictionMatched!==null&&<p className="mt-1">Declared prediction {repeatComparison.predictionMatched?'matched':'did not match'} the entered labels.</p>}
          {repeatComparison.limitations.length>0&&<ul className="mt-2 list-disc space-y-1 pl-5">{repeatComparison.limitations.map(item=><li key={item}>{item}</li>)}</ul>}
          {repeatComparison.caveats.length>0&&<ul className="mt-2 list-disc space-y-1 pl-5 text-amber-200">{repeatComparison.caveats.map(item=><li key={item}>{item}</li>)}</ul>}
          <p className="mt-2 text-xs text-amber-200">The JSON comparison alone does not verify source bytes or preregistration time; the separate local audit can match declared hashes to selected file bytes only. Tolerances are operator-selected, not independently validated. Even a ready contrast is not causal proof, a jet simulation, or solar reconnection evidence.</p>
        </div>}
      </details>
      <section className="rounded border border-cyan-800 bg-slate-900/70 p-4 text-sm" aria-label="Arc formation research gate">
        <h2 className="font-medium">Arc formation · observed motion and next equation</h2>
        <p className="mt-2 text-slate-300">An owner-supplied 17.98-second video shows a dark hook above the main ferrofluid body extending into a curved arch. The owner reports that material travels outward and returns. Video identity and time-coded observations are retained in the apparatus research packet; this panel does not infer a measured flow speed or magnetic connectivity from the silhouette.</p>
        <p className="mt-2">Working mechanism: offset rotating plate field → ring/string and ferrofluid forcing → interface protrusion, possible circulation and return. The current colored-dot toy is static and cannot produce this motion.</p>
        <p className="mt-2 font-mono text-xs text-cyan-200">mₑ q̈ + c q̇ + k q = F cos(2πft)</p>
        <p className="mt-1 text-slate-300">A separate, unit-bearing mode-response calculator can test a measured resonance once effective mass, stiffness, damping, force amplitude and actual drive frequency are calibrated. It predicts only one generalized displacement and phase—not an arc, jet, return flow, Alfvén wave or solar reconnection.</p>
        <p className="mt-2 text-amber-200">Next gate: fixed-camera repeat, actual field/frequency trace, centered-versus-offset control, ring/string motion and a measured fluid interface. No hardware command is available here.</p>
      </section>
    </div>
  </main>;
}
