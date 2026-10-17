import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMetrics } from "@/hooks/use-metrics";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { C as c } from "@/lib/physics-const";
import PipelineCongruenceBadge from "@/components/common/PipelineCongruenceBadge";
import {
  CURVATURE_MARGIN_THRESHOLD,
  DEFAULT_SECTOR_SHELL_BASE,
  type CurvatureDirective,
  type SectorShellEnvelope,
  computeDriveNorm,
  curvatureDirectiveChanged,
  mapDriveToCurvatureDirective,
  mapDriveToSectorShell,
  sectorShellChanged,
} from "@/lib/curvature-directive";
import { useHull3DSharedStore } from "@/store/useHull3DSharedStore";

type Props = {
  mode?: string;
  shift?: {
    epsilonTilt: number;
    betaTiltVec: [number, number, number];
    gTarget: number;
    R_geom: number;
    gEff_check: number;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const dbToLin = (db: number) => Math.pow(10, (db || 0) / 20);
const SHIFT_VECTOR_SOURCE = "shift-vector-panel" as const;
const NATARIO_K_TOL = 1e-6;
const fmt = (x: number, d = 3) => Number.isFinite(x) ? x.toExponential(d) : "—";
const fstd = (x: number, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "—";

export function ShiftVectorPanel({ mode, shift }: Props) {
  const { data: metrics } = useMetrics();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 4000, staleTime: 2000 });
  const setSectorGrid3D = useHull3DSharedStore((state) => state.setSectorGrid3D);
  const hullPhysics = useHull3DSharedStore((s) => s.physics);
  const baseSectorShellRef = useRef<SectorShellEnvelope | null>(null);
  const [busTiltSample, setBusTiltSample] = useState<{
    enabled: boolean;
    magnitude: number;
    dir?: number[];
    alpha?: number;
    source?: string;
    updatedAt: number;
  } | null>(null);
  const [natarioDiag, setNatarioDiag] = useState<{ divMax: number; gateEnabled: boolean }>({
    divMax: 0,
    gateEnabled: true,
  });

  useEffect(() => {
    if (!baseSectorShellRef.current) {
      const { overlays } = useHull3DSharedStore.getState();
      const base = overlays?.sectorGrid3D ?? DEFAULT_SECTOR_SHELL_BASE;
      baseSectorShellRef.current = {
        shellR0: base.shellR0,
        shellR1: base.shellR1,
        rInner: base.rInner,
        rOuter: base.rOuter,
        halfHeight: base.halfHeight,
      };
    }
  }, []);

  useEffect(() => {
    const handlerId = subscribe("natario:diagnostics", (payload: any) => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const divMax = Number(payload.divMax);
      setNatarioDiag({
        divMax: Number.isFinite(divMax) ? Math.abs(divMax) : 0,
        gateEnabled: payload.gateEnabled !== false,
      });
    });
    return () => {
      unsubscribe(handlerId);
    };
  }, []);
  
  // Debug logging
  console.debug("[ShiftVectorPanel] Props:", { mode, shift });
  console.debug("[ShiftVectorPanel] Metrics shiftVector data:", metrics?.shiftVector);
  
  // Compute fallback values based on mode and hull geometry (for when metrics aren't loaded yet)
  const G = 9.80665; // m/s²
  
  const gTargets: Record<string, number> = {
    hover: 0.10 * G,
    taxi: 0.10 * G,
    nearzero: 0.08 * G,
    cruise: 0.05 * G,
    emergency: 0.30 * G,
    standby: 0.00 * G,
  };
  
  const effectiveMode = (mode ?? pipeline?.currentMode ?? "standby").toLowerCase();

  const hullRadius = useMemo(() => {
    const hull = pipeline?.hull;
    if (!hull) return null;
    const axisFrom = (primary?: number, fallback?: number) => {
      if (Number.isFinite(primary)) return Math.abs(primary as number);
      if (Number.isFinite(fallback)) return Math.abs(fallback as number);
      return null;
    };
    const a = axisFrom(hull.a, hull.Lx_m ? hull.Lx_m / 2 : undefined);
    const b = axisFrom(hull.b, hull.Ly_m ? hull.Ly_m / 2 : undefined);
    const cAxis = axisFrom(hull.c, hull.Lz_m ? hull.Lz_m / 2 : undefined);
    if (a && b && cAxis) {
      return Math.cbrt(a * b * cAxis);
    }
    return null;
  }, [
    pipeline?.hull?.a,
    pipeline?.hull?.b,
    pipeline?.hull?.c,
    pipeline?.hull?.Lx_m,
    pipeline?.hull?.Ly_m,
    pipeline?.hull?.Lz_m,
  ]);

  const fallbackGTarget = gTargets[effectiveMode] ?? 0;
  const fallbackRGeom = hullRadius ?? Math.cbrt(503.5 * 132.0 * 86.5); // ∛(a·b·c)
  const fallbackEpsilonTilt = Math.min(5e-7, Math.max(0, (fallbackGTarget * fallbackRGeom) / (c * c)));
  const fallbackBetaTiltVec: [number, number, number] = [0, -1, 0];
  const fallbackGEffCheck = (fallbackEpsilonTilt * c * c) / fallbackRGeom;

  // Use live metrics data first, then props, then fallback calculations
  const liveShift = metrics?.shiftVector;
  const propShift = shift;

  // Helper: pick a numeric value with preference rules and record source
  const pickNum = (live: any, prop: any, fb: number, preferPositive = false) => {
    const isNum = (v: any) => typeof v === 'number' && Number.isFinite(v);
    const wantPos = preferPositive && fb > 0;
    if (isNum(live) && (!wantPos || live > 0)) return { value: live as number, source: 'live' as const };
    if (isNum(prop) && (!wantPos || prop > 0)) return { value: prop as number, source: 'props' as const };
    return { value: fb, source: 'computed' as const };
  };

  // Helper: pick a 3-vector
  const pickVec3 = (live: any, prop: any, fb: [number, number, number]) => {
    const ok = (v: any) => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));
    if (ok(live)) return { value: live as [number, number, number], source: 'live' as const };
    if (ok(prop)) return { value: prop as [number, number, number], source: 'props' as const };
    return { value: fb, source: 'computed' as const };
  };

  // Prefer positive gTarget in modes with nonzero fallback (so Near-Zero won’t show 0 from live)
  const gTargetPick = pickNum(liveShift?.gTarget, propShift?.gTarget, fallbackGTarget, true);
  const RGeomPick = pickNum(liveShift?.R_geom, propShift?.R_geom, fallbackRGeom, true);
  const epsPick = pickNum(liveShift?.epsilonTilt, propShift?.epsilonTilt, fallbackEpsilonTilt, true);
  const betaPick = pickVec3(liveShift?.betaTiltVec, propShift?.betaTiltVec, fallbackBetaTiltVec);
  const gEffPick = pickNum(liveShift?.gEff_check, propShift?.gEff_check, fallbackGEffCheck, true);

  const displayShift = {
    gTarget: gTargetPick.value,
    R_geom: RGeomPick.value,
    epsilonTilt: epsPick.value,
    betaTiltVec: betaPick.value,
    gEff_check: gEffPick.value,
  };

  console.debug("[ShiftVectorPanel] Final display values:", displayShift);

  const betaVec = displayShift.betaTiltVec;

  const tiltDirective = useMemo(() => {
    if (!betaVec) return { enabled: false as const };
    const dir2: [number, number] = [betaVec[0] ?? 0, betaVec[1] ?? 0];
    const len = Math.hypot(dir2[0], dir2[1]);
    if (!Number.isFinite(len) || len < 1e-6) {
      return { enabled: false as const };
    }
    const magnitude = Math.min(1, Math.abs(displayShift.epsilonTilt) / 5e-7);
    return {
      enabled: true as const,
      dir: [dir2[0] / len, dir2[1] / len] as [number, number],
      magnitude,
      alpha: 0.85,
      meta: {
        mode: effectiveMode,
        gTarget: displayShift.gTarget,
        epsilonTilt: displayShift.epsilonTilt,
        rGeom: displayShift.R_geom,
      },
    };
  }, [betaVec, displayShift.epsilonTilt, displayShift.gTarget, displayShift.R_geom, effectiveMode]);

  const baseTiltMagnitude = tiltDirective.enabled ? clamp(tiltDirective.magnitude ?? 0, 0, 1) : 0;
  const driveNorm = useMemo(
    () =>
      computeDriveNorm({
        tiltMagnitude: baseTiltMagnitude,
        epsilonTilt: displayShift.epsilonTilt,
        epsilonCeiling: 5e-7,
        gTarget: displayShift.gTarget,
        gCeiling: 0.15 * G,
      }),
    [displayShift.epsilonTilt, displayShift.gTarget, baseTiltMagnitude]
  );
  const natarioDivMax = natarioDiag?.divMax ?? 0;
  const natarioClamp = clamp01(1 - natarioDivMax / NATARIO_K_TOL);
  const driveNormPhys = baseTiltMagnitude * natarioClamp;
  const driveNormForShell = natarioDiag?.gateEnabled === false ? driveNorm : driveNormPhys;
  // Visual-only gain from Viz HUD (safe display scaling)
  const visualGain = useMemo(() => {
    const y = Number.isFinite(hullPhysics?.yGain) ? hullPhysics!.yGain : 1;
    const lin = dbToLin(Number(hullPhysics?.trimDb ?? 0));
    const raw = Math.max(0, y) * lin;
    return hullPhysics?.locked ? 1 : raw;
  }, [hullPhysics?.yGain, hullPhysics?.trimDb, hullPhysics?.locked]);
  const activeTiltDirective = useMemo(
    () =>
      tiltDirective.enabled
        ? { ...tiltDirective, magnitude: driveNorm }
        : tiltDirective,
    [tiltDirective, driveNorm]
  );
  const tiltMagnitude = activeTiltDirective.enabled ? clamp(activeTiltDirective.magnitude ?? 0, 0, 1) : 0;

  const curvatureDirective = useMemo<CurvatureDirective>(() => {
    if (!activeTiltDirective.enabled) {
      return { enabled: false };
    }
    return mapDriveToCurvatureDirective(driveNorm, {
      palette: "diverging",
      marginThreshold: CURVATURE_MARGIN_THRESHOLD,
    });
  }, [driveNorm, activeTiltDirective.enabled]);

  const sectorGridDirective = useMemo<SectorShellEnvelope | null>(() => {
    if (!activeTiltDirective.enabled) return null;
    const baseShell = baseSectorShellRef.current ?? DEFAULT_SECTOR_SHELL_BASE;
    // Apply display gain only to shell mapping (no physics changes)
    const driveDisplay = clamp01(driveNormForShell * visualGain);
    return mapDriveToSectorShell(driveDisplay, baseShell);
  }, [driveNormForShell, driveNormPhys, visualGain, activeTiltDirective.enabled]);

  // Publish viz ledger for diagnostics (gainPhysics × gainVisual → gainDisplay)
  useEffect(() => {
    const driveDisplay = clamp01(driveNormForShell * visualGain);
    try {
      publish("hull3d:viz:ledger", {
        gainPhysics: driveNormPhys,
        gainVisual: visualGain,
        gainDisplay: driveDisplay,
      });
    } catch {}
  }, [driveNormForShell, driveNormPhys, visualGain]);

  const lastCurvatureDirective = useRef<CurvatureDirective | null>(null);
  const lastSectorGridDirective = useRef<SectorShellEnvelope | null>(null);

  useEffect(() => {
    const previous = lastCurvatureDirective.current;

    if (!curvatureDirective.enabled) {
      if (previous?.enabled) {
        publish("hull3d:overlay:curvature", { enabled: false, source: SHIFT_VECTOR_SOURCE });
      }
      lastCurvatureDirective.current = curvatureDirective;
      return;
    }

    if (!previous || curvatureDirectiveChanged(previous, curvatureDirective)) {
      lastCurvatureDirective.current = curvatureDirective;
      publish("hull3d:overlay:curvature", {
        ...curvatureDirective,
        source: SHIFT_VECTOR_SOURCE,
      });
    }
  }, [curvatureDirective]);

  useEffect(() => {
    if (!sectorGridDirective) {
      lastSectorGridDirective.current = null;
      return;
    }
    const previous = lastSectorGridDirective.current;
    if (previous && !sectorShellChanged(previous, sectorGridDirective)) {
      return;
    }

    lastSectorGridDirective.current = sectorGridDirective;

    setSectorGrid3D((current) => ({
      ...current,
      shellR0: sectorGridDirective.shellR0,
      shellR1: sectorGridDirective.shellR1,
      rInner: sectorGridDirective.rInner,
      rOuter: sectorGridDirective.rOuter,
      halfHeight: sectorGridDirective.halfHeight,
    }));
  }, [sectorGridDirective, setSectorGrid3D]);

  useEffect(() => {
    return () => {
      if (lastCurvatureDirective.current?.enabled) {
        publish("hull3d:overlay:curvature", { enabled: false, source: SHIFT_VECTOR_SOURCE });
      }
    };
  }, []);

  useEffect(() => {
    if (activeTiltDirective.enabled) {
      publish("hull3d:tilt", {
        enabled: true,
        dir: activeTiltDirective.dir,
        magnitude: activeTiltDirective.magnitude,
        alpha: activeTiltDirective.alpha,
        source: SHIFT_VECTOR_SOURCE,
        ...activeTiltDirective.meta,
      });
      return () => {
        publish("hull3d:tilt", { enabled: false, source: SHIFT_VECTOR_SOURCE });
      };
    }
    publish("hull3d:tilt", { enabled: false, source: SHIFT_VECTOR_SOURCE });
    return undefined;
  }, [activeTiltDirective]);

  useEffect(() => {
    return () => {
      publish("hull3d:tilt", { enabled: false, source: SHIFT_VECTOR_SOURCE });
    };
  }, []);

  useEffect(() => {
    const handlerId = subscribe("hull3d:tilt", (payload: any) => {
      if (!payload || typeof payload !== "object") {
        setBusTiltSample(null);
        return;
      }
      const dirRaw = Array.isArray(payload.dir) ? payload.dir.filter((n: unknown) => Number.isFinite(n as number)) : undefined;
      const mag = Number(payload.magnitude);
      setBusTiltSample({
        enabled: Boolean(payload.enabled),
        magnitude: Number.isFinite(mag) ? mag : 0,
        dir: dirRaw && dirRaw.length > 0 ? (dirRaw as number[]) : undefined,
        alpha: typeof payload.alpha === "number" ? payload.alpha : undefined,
        source: typeof payload.source === "string" ? payload.source : undefined,
        updatedAt: Date.now(),
      });
    });
    return () => {
      unsubscribe(handlerId);
    };
  }, []);

  const busBadgeLabel = useMemo(() => {
    if (!busTiltSample) return "BUS —";
    const magText = busTiltSample.magnitude.toFixed(2);
    return busTiltSample.enabled ? `BUS · ${magText}` : `BUS idle`;
  }, [busTiltSample]);

  const busBadgeClass = busTiltSample?.enabled
    ? "border-emerald-400/80 text-emerald-200"
    : "border-slate-600 text-slate-400";

  const busTooltip = useMemo(() => {
    if (!busTiltSample) return "No hull3d:tilt bus activity yet.";
    const dirText = busTiltSample.dir
      ? `[${busTiltSample.dir.slice(0, 3).map((v) => v.toFixed(2)).join(", ")}]`
      : "—";
    const alphaText = busTiltSample.alpha !== undefined ? busTiltSample.alpha.toFixed(2) : "—";
    const source = busTiltSample.source ?? "unknown";
    return `source: ${source}\ndir: ${dirText}\nmag: ${busTiltSample.magnitude.toFixed(3)}\nalpha: ${alphaText}`;
  }, [busTiltSample]);

  const hasLiveData = !!(liveShift && Object.keys(liveShift).length > 0);
  const hasPropData = !!(propShift && Object.keys(propShift).length > 0);
  const ok = hasLiveData || hasPropData || fallbackGTarget > 0; // Show panel if we have any data

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Shift Vector - Interior Gravity
          <Badge variant="outline" className="border-cyan-400 text-cyan-300">
            {(mode ?? pipeline?.currentMode ?? "-").toUpperCase()}
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={`border px-2 ${busBadgeClass}`}>
                  {busBadgeLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="whitespace-pre text-xs">
                {busTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <PipelineCongruenceBadge
          label="curvature"
          meta={pipeline?.curvatureMeta}
          className="mt-2"
        />
        <CardDescription>Gentle Natário tilt (β-gradient) for cabin "down".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!ok && (
          <div className="text-slate-400">
            No shift-vector data (mode: {(mode ?? pipeline?.currentMode ?? "standby").toUpperCase()}).
          </div>
        )}

        {ok && (
          <>
            <div className="p-3 bg-slate-950 rounded-lg font-mono">
              <div className="text-slate-300">Equations</div>
              <div className="text-slate-400 mt-1">
                ε<sub>tilt</sub> = (g<sub>target</sub> · R<sub>geom</sub>)/c²<br/>
                R<sub>geom</sub> = (a·b·c)<sup>1/3</sup><br/>
                g<sub>eff</sub> = ε<sub>tilt</sub> · c² / R<sub>geom</sub>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 bg-slate-950 rounded">
                <div className="text-slate-400">g<sub>target</sub></div>
                <div className="text-violet-400">{fstd(displayShift.gTarget, 3)} m/s²</div>
                <div className="text-xs text-slate-500">{gTargetPick.source}</div>
              </div>
              <div className="p-3 bg-slate-950 rounded">
                <div className="text-slate-400">R<sub>geom</sub></div>
                <div className="text-cyan-300">{fstd(displayShift.R_geom, 1)} m</div>
                <div className="text-xs text-slate-500">{RGeomPick.source}</div>
              </div>
              <div className="p-3 bg-slate-950 rounded">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <div className="text-slate-400">ε<sub>tilt</sub> (dimensionless)</div>
                      <div className="text-violet-400">{fmt(displayShift.epsilonTilt, 3)}</div>
                      <div className="text-xs text-slate-500">{epsPick.source}</div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Kept ≪ 1e-6 ("whisper" regime) to preserve QI headroom and keep tilt visual-only inside.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="p-3 bg-slate-950 rounded">
                <div className="text-slate-400">β⃗<sub>tilt</sub></div>
                <div className="text-violet-400">[{displayShift.betaTiltVec.join(", ")}]</div>
                <div className="text-xs text-slate-500">{betaPick.source}</div>
              </div>
              <div className="col-span-2 p-3 bg-slate-950 rounded">
                <div className="text-slate-400">g<sub>eff</sub> (check)</div>
                <div className="text-amber-300">{fstd(displayShift.gEff_check, 3)} m/s²</div>
                <div className="text-xs text-slate-500">{gEffPick.source}</div>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Moral note: "Down" is chosen, not imposed. A tiny inclination aligns the cabin with life—just enough to stand, never enough to strain.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
