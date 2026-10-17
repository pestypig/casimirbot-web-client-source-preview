import { useEffect, useMemo, useRef, useState } from "react";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

type LC = { burst_ms?: number; dwell_ms?: number; phase?: number; sectorCount?: number };

export function useActiveTiles(opts: {
  totalTiles?: number;              // from pipeline or metrics
  totalSectors: number;             // defaults to promoted profile when absent upstream
  concurrentSectors: number;        // concurrent live sectors
  dutyEffectiveFR: number;          // from your lc-based compute
  tilesPerSector?: number;          // optional override (server)
  lc?: LC;
  serverActiveTiles?: number;       // optional for drift check
  ema?: number;                     // 0..1 smoothing (default .35)
}) {
  const {
    totalTiles,
    totalSectors,
    concurrentSectors,
    dutyEffectiveFR,
    tilesPerSector,
    lc,
    serverActiveTiles,
    ema = 0.35,
  } = opts;

  // Sanity check for light-crossing loop parameters
  useEffect(() => {
    const bad =
      !Number.isFinite(lc?.phase) ||
      !Number.isFinite(lc?.burst_ms) ||
      !Number.isFinite(lc?.dwell_ms) ||
      (Number.isFinite(lc?.dwell_ms) && Number(lc!.dwell_ms) <= 0);
    if (lc && bad) {
      console.warn("[HELIX] LC loop missing/invalid timing — 'now' tiles will be flat", {
        phase: lc?.phase,
        burst_ms: lc?.burst_ms,
        dwell_ms: lc?.dwell_ms,
      });
    }
  }, [lc?.phase, lc?.burst_ms, lc?.dwell_ms]);

  // Hardened input sanitization
  const totalTilesNum = Number(totalTiles);
  const T       = Math.max(0, Number.isFinite(totalTilesNum) ? totalTilesNum : 0);
  const dutyNum = Number(dutyEffectiveFR);
  const fr      = Math.max(0, Math.min(1, Number.isFinite(dutyNum) ? dutyNum : 0));
  const S_total = Math.max(1, Math.floor(Number(totalSectors) || 1));
  const S_live  = Math.max(1, Math.floor(Number(concurrentSectors) || 1));
  const EMA     = Math.min(1, Math.max(0, Number(ema)));

  // Warn if dutyEffectiveFR was computed with different sector assumptions
  useEffect(() => {
    if (lc?.sectorCount && lc.sectorCount !== S_total) {
      console.warn("[HELIX] Sector count mismatch between dutyEffectiveFR calculation and hook:", {
        hookSectors: S_total,
        lcSectors: lc.sectorCount,
        note: "This may cause drift in avgTiles calculation",
      });
    }
  }, [S_total, lc?.sectorCount]);

  // average (FR) energized tiles across the whole ship
  const avgTiles = useMemo(() => Math.round(T * fr), [T, fr]);

  // local burst fraction
  const burstLocal = useMemo(() => {
    if (
      !lc ||
      !Number.isFinite(lc.burst_ms) ||
      !Number.isFinite(lc.dwell_ms) ||
      Number(lc.dwell_ms) <= 0
    ) return PROMOTED_WARP_PROFILE.dutyCycle;
    return Math.max(0, Math.min(1, Number(lc.burst_ms) / Number(lc.dwell_ms)));
  }, [lc?.burst_ms, lc?.dwell_ms]);

  // instantaneous gate
  const inBurstNow = useMemo(() => {
    if (
      !lc ||
      !Number.isFinite(lc.phase) ||
      !Number.isFinite(lc.burst_ms) ||
      !Number.isFinite(lc.dwell_ms) ||
      Number(lc.dwell_ms) <= 0
    ) return false;
    const dwell = Number(lc.dwell_ms);
    const t = Number(lc.phase) % dwell;
    return t < Number(lc.burst_ms);
  }, [lc?.phase, lc?.burst_ms, lc?.dwell_ms]);

  const instBase = (tilesPerSector ?? Math.floor(T / S_total));
  const instantTiles = (inBurstNow ? instBase * S_live * burstLocal : 0);

  // EMA smoothing for "now"
  const [instantSmooth, setInstantSmooth] = useState(0);
  useEffect(() => {
    const target = Number.isFinite(instantTiles) ? instantTiles : 0;
    setInstantSmooth(prev => prev + EMA * (target - prev));
  }, [instantTiles, EMA]);

  // drift monitor (warn if server vs derived >5% for 3 consecutive samples)
  const badStreak = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(serverActiveTiles) || !Number.isFinite(avgTiles)) return;
    const srv = Number(serverActiveTiles), drv = Number(avgTiles);
    const rel = Math.abs(srv - drv) / Math.max(1, drv);
    badStreak.current = rel > 0.05 ? badStreak.current + 1 : 0;
    if (badStreak.current >= 3) {
      console.warn("[HELIX] ActiveTiles drift >5% for 3+ samples:", { server: srv, derived: drv, rel });
      badStreak.current = 0;
    }
  }, [serverActiveTiles, avgTiles]);

  return {
    avgTiles,                                  // integer
  instantTiles: Number.isFinite(Number(instantTiles)) ? Number(instantTiles) : 0,   // fractional by design
  instantTilesSmooth: Math.round(Number.isFinite(instantSmooth) ? instantSmooth : 0),
    burstLocal,
    inBurstNow,
  };
}

