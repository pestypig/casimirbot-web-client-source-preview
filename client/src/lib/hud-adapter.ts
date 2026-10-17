// hud-adapter.ts
// Bridges EnergyPipelineState → HUD-friendly, drift-proof fields.
// Drop this in your HUD layer and import from all cards instead of poking
// at raw pipeline fields directly.

/*
  Usage in a React card:

  import { toHUDModel, si, zetaStatusColor } from "./hud-adapter";
  const hud = toHUDModel(stateFromServerOrGlobal());
  return (
    <Card>
      <h3>Power</h3>
      <div>{si(hud.powerMW, 'MW')}</div>
      <p className={`text-${zetaStatusColor(hud.zetaStatus)}`}>ζ {hud.zeta.toFixed(2)} ({hud.zetaStatus})</p>
    </Card>
  );
*/

import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

// --- Types that mirror your pipeline but keep only what HUDs need ---
export type PipelineLike = {
  // core numbers
  P_avg?: number;                 // MW (ship average)
  P_loss_raw?: number;            // W per tile (instantaneous ON)
  N_tiles?: number;               // total tiles
  tilesPerSector?: number;        // computed per pipeline (optional)
  activeSectors?: number;         // concurrent sectors used this mode (optional)
  sectorCount?: number;           // total sectors (defaults to promoted profile)
  concurrentSectors?: number;     // concurrent live sectors (1-2)
  activeFraction?: number;        // = activeSectors / sectorCount
  dutyCycle?: number;             // UI duty (mode description)
  dutyBurst?: number;             // default promoted duty
  dutyEffective_FR?: number;      // ship-wide duty (server precomputed)
  // New MODE_CONFIGS-style fields (optional)
  sectorsTotal?: number;          // total grid sectors (defaults to promoted profile)
  sectorsConcurrent?: number;     // concurrent sectors from config
  localBurstFrac?: number;        // per-sector ON window fraction
  // geometry/time
  hull?: { Lx_m: number; Ly_m: number; Lz_m: number; wallThickness_m?: number };
  strobeHz?: number;
  sectorPeriod_ms?: number;
  TS_ratio?: number;              // conservative (longest)
  TS_long?: number;
  TS_geom?: number;
  // physics knobs + mass
  gammaGeo?: number;
  qMechanical?: number;
  qCavity?: number;
  gammaVanDenBroeck?: number;
  M_exotic?: number;              // kg
  zeta?: number;                  // Ford–Roman proxy
  fordRomanCompliance?: boolean;
  overallStatus?: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  // extras we exposed for clients
  modelMode?: 'calibrated' | 'raw';
  dutyShip?: number;
};

export type HUDModel = {
  // Power
  powerMW: number;          // average ship power in MW
  powerCryoMW: number;      // thermal load including idle losses in MW
  powerOnW: number;         // instantaneous ON power (ship) in W
  // Duty / sectors
  dutyShip: number;         // authoritative ship-wide duty
  dutyBurst: number;
  sectorsConcurrent: number;
  sectorsTotal: number;
  tilesTotal: number;
  tilesPerSector: number;
  // Safety
  zeta: number;
  zetaStatus: 'PASS' | 'WARN' | 'FAIL';
  overallStatus: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  // Time scales
  strobeHz: number;
  sectorPeriod_ms: number;
  TS_long: number;
  TS_geom: number;
  TS_wall: number;           // if caller provides, otherwise derived from wallThickness
  isHomogenized: boolean;    // TS_long > 1e3 (fast-average regime vs borderline)
  // Mass/knobs
  exoticMassKg: number;
  gammaGeo: number;
  gammaVdB: number;
  qMech: number;
  qCavity: number;
  // Badges/helpers
  modeTag: string;           // from modelMode
  parametersClamped: boolean; // any parameters hit policy limits during calibration
};

const SECTORS_TOTAL = PROMOTED_WARP_PROFILE.sectorCount;
const DUTY_BURST_DEFAULT = PROMOTED_WARP_PROFILE.dutyCycle;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function toHUDModel(s: PipelineLike): HUDModel {
  const sectorsTotal = s.sectorsTotal ?? s.sectorCount ?? SECTORS_TOTAL;
  const sectorsConcurrent =
    s.sectorsConcurrent ?? s.concurrentSectors ?? s.activeSectors ?? 1;
  const localBurstFrac = s.localBurstFrac ?? s.dutyBurst ?? DUTY_BURST_DEFAULT;

  // If computing FR duty here, mirror the same formula (per-sector ON window × fraction live):
  const dutyFRDerived = clamp01(localBurstFrac * (sectorsConcurrent / sectorsTotal));
  const dutyShip = s.dutyShip ?? s.dutyEffective_FR ?? dutyFRDerived;
  const dutyBurst = s.dutyBurst ?? localBurstFrac;

  // instantaneous ship power during ON window
  const powerOnW = (s.P_loss_raw ?? 0) * (s.N_tiles ?? 0);

  // time scales
  const strobeHz = s.strobeHz ?? 1000;
  const sectorPeriod_ms = s.sectorPeriod_ms ?? (1000 / strobeHz);
  const TS_long = s.TS_long ?? s.TS_ratio ?? 0;
  const TS_geom = s.TS_geom ?? TS_long;

  // TS_wall: derive if not present
  const wall = s.hull?.wallThickness_m ?? 1.0;
  const T_m = 1 / (strobeHz * Math.max(1, sectorsTotal)); // rough UI scale
  const TS_wall = (wall / 299_792_458) / (T_m || 1);

  // ζ status
  const zetaVal = s.zeta ?? 0;
  const zetaStatus: HUDModel['zetaStatus'] =
    zetaVal < 0.8 ? 'PASS' : (zetaVal < 1.0 ? 'WARN' : 'FAIL');

  // tiles/sector
  const tilesTotal = s.N_tiles ?? 0;
  const tilesPerSector =
    s.tilesPerSector ??
    Math.max(1, Math.floor(tilesTotal / (sectorsTotal || SECTORS_TOTAL)));

  return {
    powerMW: s.P_avg ?? 0,
    powerCryoMW: (s as any).P_cryo_MW ?? (s.P_avg ?? 0), // thermal load including idle losses
    powerOnW,
    dutyShip,
    dutyBurst,
    sectorsConcurrent,
    sectorsTotal,
    tilesTotal,
    tilesPerSector,
    zeta: zetaVal,
    zetaStatus,
    overallStatus: s.overallStatus ?? 'NOMINAL',
    strobeHz,
    sectorPeriod_ms,
    TS_long,
    TS_geom,
    TS_wall,
    isHomogenized: (s as any).isHomogenized ?? (TS_long > 1e3), // fast-average regime flag
    exoticMassKg: s.M_exotic ?? 0,
    gammaGeo: s.gammaGeo ?? 0,
    gammaVdB: s.gammaVanDenBroeck ?? 0,
    qMech: s.qMechanical ?? 0,
    qCavity: s.qCavity ?? 0,
    modeTag: s.modelMode === 'raw' ? 'RAW' : 'CAL',
    parametersClamped: (s as any).parametersClamped ?? false
  };
}

// --- Formatting helpers ---
export function si(n: number, unit = '', digits = 3): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const map: [number, string][] = [
    [1e-24,'y'],[1e-21,'z'],[1e-18,'a'],[1e-15,'f'],[1e-12,'p'],[1e-9,'n'],
    [1e-6,'µ'],[1e-3,'m'],[1,''],[1e3,'k'],[1e6,'M'],[1e9,'G'],[1e12,'T']
  ];
  let scale = 1, sym = '';
  for (let i = 0; i < map.length; i++) {
    if (abs < map[i][0]) break;
    scale = map[i][0]; sym = map[i][1];
  }
  return `${(n/scale).toFixed(digits)} ${sym}${unit}`.trim();
}

export function zetaStatusColor(s: HUDModel['zetaStatus']): 'green-500'|'amber-500'|'red-500' {
  return s === 'PASS' ? 'green-500' : s === 'WARN' ? 'amber-500' : 'red-500';
}

// --- REST normalizer (if HUDs fetch /metrics) ---
// Matches GET /api/helix/metrics shape from the server and derives the rest.
export type HelixMetricsResponse = {
  energyOutput: number;            // MW
  exoticMass: number;              // kg
  fordRoman: { value: number; limit?: number; status: 'PASS'|'FAIL' };
  activeTiles: number;
  totalTiles: number;
  timeScaleRatio: number;
  overallStatus: 'NOMINAL'|'WARNING'|'CRITICAL';
  curvatureMax?: number;

  // Optional extras if server adds them later:
  gammaGeo?: number;
  gammaVanDenBroeck?: number;
  qCavity?: number;
  modelMode?: 'calibrated'|'raw';
  dutyEffectiveFR?: number;        // ship-wide duty if provided
  dutyGlobal?: number;             // UI duty if provided
  strobeHz?: number;
  sectorPeriod_ms?: number;
  TS_long?: number;
  TS_geom?: number;
  TS_wall?: number;
};

export function fromRest(r: HelixMetricsResponse): HUDModel {
  const sectorsTotal = SECTORS_TOTAL;
  const localBurstFrac = DUTY_BURST_DEFAULT;

  // Derive sectorsConcurrent from dutyEffectiveFR if present; else default to 1
  const sectorsConcurrent = (() => {
    if (typeof r.dutyEffectiveFR === 'number' && isFinite(r.dutyEffectiveFR) && r.dutyEffectiveFR > 0) {
      const est = Math.round((r.dutyEffectiveFR / localBurstFrac) * sectorsTotal);
      return Math.min(sectorsTotal, Math.max(1, est));
    }
    return 1;
  })();

  const tilesPerSector = Math.max(1, Math.floor((r.totalTiles || 0) / sectorsTotal));
  const dutyShip = r.dutyEffectiveFR ??
                   clamp01(localBurstFrac * (sectorsConcurrent / sectorsTotal));

  const TS_long = r.TS_long ?? r.timeScaleRatio ?? 0;
  const TS_geom = r.TS_geom ?? TS_long;

  return {
    powerMW: r.energyOutput,
    powerCryoMW: r.energyOutput, // fallback to same value if not available
    powerOnW: 0, // server can add this later; keep 0 for now
    dutyShip,
    dutyBurst: localBurstFrac,
    sectorsConcurrent,
    sectorsTotal,
    tilesTotal: r.totalTiles,
    tilesPerSector,
    zeta: r.fordRoman.value,
    zetaStatus: r.fordRoman.status === 'PASS' ? 'PASS' : 'FAIL',
    overallStatus: r.overallStatus,
    strobeHz: r.strobeHz ?? 1000,
    sectorPeriod_ms: r.sectorPeriod_ms ?? (1000 / (r.strobeHz ?? 1000)),
    TS_long,
    TS_geom,
    TS_wall: r.TS_wall ?? TS_long, // fallback
    isHomogenized: (r as any).isHomogenized ?? (TS_long > 1e3), // fast-average regime flag
    exoticMassKg: r.exoticMass,
    gammaGeo: r.gammaGeo ?? 0,
    gammaVdB: r.gammaVanDenBroeck ?? 0,
    qMech: 0,
    qCavity: r.qCavity ?? 0,
    modeTag: r.modelMode === 'raw' ? 'RAW' : 'CAL',
    parametersClamped: (r as any).parametersClamped ?? false
  };
}

// --- Sanity checks the HUD can show as tooltips ---
export function checks(h: HUDModel) {
  const out: string[] = [];
  if (h.dutyShip <= 0 || h.dutyShip > 1) out.push("Duty out of physical range (0 < d_ship <= 1).");
  if (h.sectorsConcurrent < 0 || h.sectorsConcurrent > h.sectorsTotal) {
    out.push(`S_live outside [0,${h.sectorsTotal}].`);
  }
  if (h.powerMW < 0) out.push('Negative average power.');
  if (!isFinite(h.zeta)) out.push('ζ not finite.');
  return out;
}
