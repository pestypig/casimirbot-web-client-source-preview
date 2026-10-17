import React,{useEffect,useState} from 'react';
import {solarObservationFreshness} from '../../../shared/solar-observation-freshness';

export function SolarObservationFreshness(props:{acquiredAt?:string|null;fetchedAt?:string|null;replay:boolean}) {
  const [nowMs,setNowMs]=useState(()=>Date.now());
  useEffect(()=>{setNowMs(Date.now());const timer=window.setInterval(()=>setNowMs(Date.now()),30_000);return ()=>window.clearInterval(timer);},[props.acquiredAt,props.fetchedAt,props.replay]);
  const status=solarObservationFreshness({...props,nowMs});
  const labels={time_unverified:'Acquisition/fetch time unverified',archive_replay:'Archive replay',stale_archive:'Stale archive observation',recent_archive:'Recent archive observation'};
  return <div className="text-xs text-amber-200" role="status">
    <p>{labels[status.state]} · acquisition age {status.ageMs===null?'unavailable':`${(status.ageMs/3_600_000).toFixed(2)} hours`}</p>
    <p>Acquired: {status.acquiredAt ?? 'unavailable'} · fetched: {status.fetchedAt ?? 'unavailable'}</p>
    <p>Freshness display threshold: 2 hours; not a scientific acceptance limit. Fetching does not refresh acquisition time. Not a live measurement or authenticated source receipt.</p>
  </div>;
}
