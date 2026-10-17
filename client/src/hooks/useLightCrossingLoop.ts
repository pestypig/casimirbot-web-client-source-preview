import { useEffect, useMemo, useRef, useState } from "react";

type HullLike = { a: number; b: number; c: number };
type Args = {
  sectorStrobing?: number;      // S (e.g., 1 or 400)
  currentSector?: number;       // server index (0..S-1)
  sectorPeriod_ms?: number;     // dwell per sector
  duty?: number;                // global duty (0..1)
  freqGHz?: number;             // tile modulation frequency
  hull?: HullLike;              // ellipsoid axes (meters)
  wallWidth_m?: number;         // physical wall thickness
  localBurstFrac?: number;      // local RF burst fraction (mode-specific)
};

export function useLightCrossingLoop({
  sectorStrobing = 1,
  currentSector = 0,
  sectorPeriod_ms = 1,
  duty = 0.14,
  freqGHz = 15,
  hull,
  wallWidth_m = 1.0,  // Paper-authentic: ~1.0m (0.3 booster + 0.5 lattice + 0.2 service)
  localBurstFrac = 0.01,  // default 1% burst duty
}: Partial<Args> = {}) {
  // --- Light-crossing estimate (choose the *shortest relevant* length scale)
  // Using the wall thickness gives a strict local bound; feel free to swap
  // to min semi-axis or mean chord if you want a different control policy.
  const c = 299_792_458;
  const L_m = Math.max(1e-6, wallWidth_m); // clamp
  const tauLC_ms = (L_m / c) * 1e3;        // ms

  // --- Mode-aware local ON window inside each sector's dwell (authentic physics)
  const dwell_ms = Math.max(0.01, sectorPeriod_ms);
  const burst_ms = Math.max(tauLC_ms, dwell_ms * Math.max(0, Math.min(1, localBurstFrac))); // enforce τLC bound

  // --- Phase clock synced to server's sector pointer
  const [phase, setPhase] = useState(0);           // 0..1 within current sector
  const [sectorIdx, setSectorIdx] = useState(currentSector % Math.max(1, sectorStrobing));
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(performance.now());

  // keep clock continuous but snap when server index jumps
  useEffect(() => {
    setSectorIdx(currentSector % Math.max(1, sectorStrobing));
    t0Ref.current = performance.now(); // realign start of dwell
  }, [currentSector, sectorStrobing]);

  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const dt = now - t0Ref.current;
      const φ = (dt % dwell_ms) / dwell_ms; // 0..1
      setPhase(φ);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [dwell_ms]);

  const onWindow = useMemo(() => {
    // center a burst window of width = burst_ms inside the dwell
    const half = (burst_ms / dwell_ms) / 2; // fraction
    const center = 0.5;
    const dist = Math.abs(phase - center);
    return dist <= half;
  }, [phase, burst_ms, dwell_ms]);

  // simple 200ms latch for the UI badge (does NOT affect physics)
  const [onWindowDisplay, setOnWindowDisplay] = useState(false);
  useEffect(() => {
    if (onWindow) {
      setOnWindowDisplay(true);
      const t = setTimeout(() => setOnWindowDisplay(false), 200);
      return () => clearTimeout(t);
    }
  }, [onWindow]);

  // Calculate cycles per burst for meaningful RF energy
  const cyclesPerBurst = (burst_ms * 1e-3) * (freqGHz * 1e9);

  return {
    // shared timeline
    sectorIdx,
    sectorCount: Math.max(1, sectorStrobing),
    phase,            // 0..1 within dwell
    dwell_ms,
    tauLC_ms,
    burst_ms,
    duty,
    freqGHz,
    cyclesPerBurst,   // RF cycles per burst window
    onWindow,         // boolean: raw physics ON window (for WarpEngine sync)
    onWindowRaw: onWindow,  // explicit alias for authentic physics
    onWindowDisplay, // UI latch: stable display state for labels
  };
}