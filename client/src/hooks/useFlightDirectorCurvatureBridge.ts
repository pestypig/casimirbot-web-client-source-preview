import { useEffect, useMemo, useRef } from "react";
import { useEnergyPipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useFlightDirectorStore } from "@/store/useFlightDirectorStore";
import type { VacuumGapSweepRow } from "@shared/schema";

type FlowSample = {
  kappaMHz: number;
  timestamp_ms: number;
};

const toFinite = (value?: unknown): number | undefined => {
  if (value == null) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? (num as number) : undefined;
};

const pickKappaFromRow = (row?: Partial<VacuumGapSweepRow> | null): number | undefined => {
  if (!row) return undefined;
  return (
    toFinite(row.kappaEff_MHz) ??
    toFinite(row.kappa_MHz) ??
    (row.kappaEff_Hz != null ? toFinite(row.kappaEff_Hz / 1e6) : undefined) ??
    (row.kappa_Hz != null ? toFinite(row.kappa_Hz / 1e6) : undefined)
  );
};

const pickKappaFromPump = (pump?: Record<string, unknown> | null): number | undefined => {
  if (!pump || typeof pump !== "object") return undefined;
  return (
    toFinite((pump as any).kappaEff_MHz) ??
    toFinite((pump as any).kappa_MHz) ??
    ((pump as any).kappaEff_Hz != null ? toFinite(((pump as any).kappaEff_Hz as number) / 1e6) : undefined) ??
    ((pump as any).kappa_Hz != null ? toFinite(((pump as any).kappa_Hz as number) / 1e6) : undefined)
  );
};

const pickKappa = (pipeline?: EnergyPipelineState | null): number | undefined => {
  if (!pipeline) return undefined;

  const sweepRuntime = pipeline.sweep as { last?: VacuumGapSweepRow | null } | undefined;
  const sweepRows = Array.isArray(pipeline.vacuumGapSweepResults)
    ? (pipeline.vacuumGapSweepResults as VacuumGapSweepRow[])
    : [];
  const latestSweepRow = sweepRows.length ? sweepRows[sweepRows.length - 1] : undefined;

  return (
    pickKappaFromRow(sweepRuntime?.last) ??
    pickKappaFromRow(latestSweepRow) ??
    pickKappaFromPump((pipeline as any).pump) ??
    undefined
  );
};

/**
 * Samples curvature (kappa) and its time-derivative from the energy pipeline
 * and streams it into the flight director store so the nav PID can schedule
 * gains against a "viscosity" field.
 */
export function useFlightDirectorCurvatureBridge(): void {
  const { data: pipeline } = useEnergyPipeline({ staleTime: 800, refetchOnWindowFocus: false });

  const kappaMHz = useMemo(() => {
    const candidate = pickKappa(pipeline);
    return candidate != null && candidate > 0 ? candidate : undefined;
  }, [pipeline]);

  const lastSampleRef = useRef<FlowSample | null>(null);

  useEffect(() => {
    if (kappaMHz == null) {
      return;
    }
    const now = Date.now();
    const prev = lastSampleRef.current;
    let kappaDot = 0;
    if (prev && now > prev.timestamp_ms) {
      const dt_s = Math.max(1e-3, (now - prev.timestamp_ms) / 1000);
      kappaDot = (kappaMHz - prev.kappaMHz) / dt_s;
    }
    lastSampleRef.current = { kappaMHz, timestamp_ms: now };
    useFlightDirectorStore.getState().ingestCurvatureTelemetry({
      kappa_MHz: kappaMHz,
      kappaDot_MHz_s: kappaDot,
      timestamp_ms: now,
    });
  }, [kappaMHz]);
}
