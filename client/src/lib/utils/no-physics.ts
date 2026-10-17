
// utils/no-physics.ts
export function withoutPhysics(u:any){
  if (!u || typeof u !== 'object') return u;
  const block = new Set([
    'thetaScale','thetaUniform','thetaScaleExpected',
    'gammaGeo','qSpoilingFactor','deltaAOverA','gammaVdB','gammaVanDenBroeck',
    'sectorCount','sectors','sectorIdx',
    'tauLC_ms','dwell_ms','burst_ms','phase','onWindow',
    'dutyUsed','dutyEffectiveFR','dutyFR','dutyFR_slice','dutyFR_ship',
    'physicsParityMode','ridgeMode',
    'axesHull','axesMeters','wallWidth_rho','wallWidth_m',
    'metricMode','useMetric','gSpatialDiag','gSpatialSym','lapseN','shiftBeta','viewForward','g0i'
  ]);
  const out:any = {}; for (const k of Object.keys(u)) if (!block.has(k)) out[k]=u[k]; return out;
}
