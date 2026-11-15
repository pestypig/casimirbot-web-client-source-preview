import React from "react";
import {solarCitationHref} from "@/lib/solar-catalog-view";
import { neutrinoArtifactSchema, neutrinoReportSchema, type NeutrinoArtifact, type NeutrinoReport } from "../../../shared/neutrino-alerts";
type Catalog={reports:NeutrinoReport[];artifacts:NeutrinoArtifact[]};
export function NeutrinoArtifacts({dayUtc}:{dayUtc:string|null}) {
  const [catalog,setCatalog]=React.useState<Catalog|null>(null),[failed,setFailed]=React.useState(false);
  React.useEffect(()=>{
    const controller=new AbortController();let busy=false;
    const load=async()=>{if(busy)return;busy=true;try{
      const end=dayUtc?Date.parse(`${dayUtc}T00:00:00Z`)+86400_000:Date.now();
      // These alerts occur only a few times a month. Default browse spans 30 days, not one solar day.
      const start=end-(dayUtc?86400_000:30*86400_000),q=new URLSearchParams({start:new Date(start).toISOString(),end:new Date(end).toISOString()});
      const response=await fetch(`/api/star-watcher/neutrinos/domain?${q}`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw Error("unavailable");const result=await response.json();
      if(result.ok!==true||result.schema!=="casimir.public_neutrinos.v1"||result.window?.start!==q.get("start")||result.window?.end!==q.get("end")||
        !Array.isArray(result.reports)||result.reports.length>256||!Array.isArray(result.artifacts)||result.artifacts.length>32)throw Error("invalid");
      const next={reports:result.reports.map((r:unknown)=>neutrinoReportSchema.parse(r)),artifacts:result.artifacts.map((a:unknown)=>neutrinoArtifactSchema.parse(a))};
      if(!controller.signal.aborted){setCatalog(next);setFailed(false);}
    }catch{if(!controller.signal.aborted)setFailed(true);}finally{busy=false;}};
    setCatalog(null);void load();const interval=window.setInterval(load,300_000);return()=>{controller.abort();window.clearInterval(interval);};
  },[dayUtc]);
  const media=(a:NeutrinoArtifact,name:string)=>`https://casimirbot.com/api/star-watcher/neutrinos/artifacts/${a.id}/${name}`;
  return <section className="mt-4 rounded-lg border border-slate-700 p-4" aria-label="IceCube neutrino alerts">
    <h3 className="font-semibold">IceCube neutrino alerts</h3>
    <p className="text-sm text-slate-400">High-energy track candidates from IceCube / NASA GCN. Possible solar coincidences are context only; solar origin and causation are not established.</p>
    <p className="text-xs text-slate-400">Retained reports {dayUtc?`for ${dayUtc} UTC`:"from the last 30 days"}. Coverage may be incomplete. This view does not enable Discord delivery.</p>
    {failed?<p role="status">The retained alert catalog is unavailable.</p>:!catalog?<p role="status">Loading retained alerts…</p>:!catalog.reports.length?<p>No retained alerts in this window.</p>:null}
    {catalog?.reports.map(r=>{const a=catalog.artifacts.find(a=>a.report.nativeId===r.nativeId&&a.report.revisionSha256===r.revisionSha256);return <details key={`${r.nativeId}:${r.revisionSha256}`} className="mt-3">
      <summary>{r.eventName??r.nativeId} · {r.stream} · revision {r.revision} · {r.state}</summary>
      <dl className="text-sm"><dt>Detector arrival (UTC)</dt><dd>{r.detectedAt}</dd><dt>GCN publication / first seen</dt><dd>{r.publishedAt} / {r.firstSeenAt}</dd>
        <dt>Estimated particle energy</dt><dd>{r.energyTeV===null?"Not reported":`${r.energyTeV} TeV`}</dd>
        <dt>Direction (equatorial J2000)</dt><dd>RA {r.raDeg??"unknown"}°, Dec {r.decDeg??"unknown"}°; reported radius {r.errorRadiusDeg??"unknown"}°, containment {r.containmentProbability===null?"unknown":`${100*r.containmentProbability}%`}; systematics {r.systematicIncluded===null?"unknown":r.systematicIncluded?"included":"excluded"}</dd>
        <dt>Astrophysical probability / background false-alarm rate</dt><dd>{r.pAstro===null?"Not reported":`${(100*r.pAstro).toFixed(2)}%`} / {r.falseAlarmRate?`${r.falseAlarmRate.value} ${r.falseAlarmRate.unit}`:"Not reported"}</dd>
      </dl>
      <p className="text-xs">p_astro is not a probability of solar origin. Particle energy is not total flare energy.</p>
      <a href={solarCitationHref(r.citation)} target="_blank" rel="noreferrer">GCN source notice</a>
      {a?<><p className="mt-2">Sun separation {a.context.direction.separationDeg?.toFixed(2)??"unknown"}° · {a.context.direction.circularApproximation.replaceAll("_"," ")}</p>
        <img loading="lazy" src={media(a,"sky.png")} alt={`Sky context for ${r.nativeId}; cell-center preview, not a containment boundary`} className="w-full max-w-3xl"/>
        <p><a href={media(a,"manifest.json")} target="_blank" rel="noreferrer">Artifact manifest</a>{a.map.state==="retained"?<> · <a href={media(a,"map.fits.gz")}>Original probability map (FITS)</a></>:<> · Map {a.map.state.replaceAll("_"," ")}</>}</p>
        {a.map.identityEvidence?<a href={`https://gcn.nasa.gov/circulars/${a.map.identityEvidence.circularId}`} target="_blank" rel="noreferrer">GCN Circular {a.map.identityEvidence.circularId}</a>:null}
        <p className="text-sm">{a.context.label}. Frozen window: {a.context.start} – {a.context.end}; coverage {a.context.coverage.replaceAll("_"," ")}. No emission timestamp or association significance is inferred.</p>
        <ul>{a.context.events.map(e=><li key={`${e.source}:${e.id}`}>{e.source} · {e.id} · {e.observedStart} · possible temporal coincidence</li>)}</ul>
        <ul>{a.context.patrolArtifacts.map(p=><li key={p.id}>Retained solar patrol context · {p.start} – {p.end} · <a
          href={`https://casimirbot.com/api/star-watcher/hek-reel/${p.id}.mp4`} target="_blank" rel="noreferrer">Movie</a> · <a
          href={`https://casimirbot.com/api/star-watcher/patrol/reels/${p.id}`} target="_blank" rel="noreferrer">Source manifest</a> · possible coincidence only</li>)}</ul>
        <p className="text-xs break-all">Artifact {a.id} · sky PNG SHA-256 {a.skyPngSha256}</p>
      </>:<p>Context artifact not retained for this revision.</p>}
    </details>;})}
  </section>;
}
