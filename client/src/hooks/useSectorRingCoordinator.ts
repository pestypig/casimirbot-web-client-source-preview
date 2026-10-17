import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useMetrics } from "@/hooks/use-metrics";

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const isFiniteNumber = (value: unknown): value is number => {
  const num = Number(value);
  return Number.isFinite(num);
};

const firstFinite = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (isFiniteNumber(value)) {
      return Number(value);
    }
  }
  return undefined;
};

const toMs = (value: unknown, unit: "ms" | "s" | "us" = "ms"): number | undefined => {
  if (!isFiniteNumber(value)) return undefined;
  const num = Number(value);
  switch (unit) {
    case "s":
      return num * 1000;
    case "us":
      return num / 1000;
    default:
      return num;
  }
};

const saneMs = (value: number | undefined): number | undefined => {
  if (!Number.isFinite(value)) return undefined;
  if (value === undefined || value <= 0) return undefined;
  return value;
};

const clampIndex = (index: number, total: number) => {
  if (!Number.isFinite(index) || total <= 0) return 0;
  const n = Math.floor(index);
  const wrapped = ((n % total) + total) % total;
  return wrapped;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type SectorResolved = {
  sectorsTotal: number;
  sectorsConcurrent: number;
  idxActive: number;
  dwell_ms?: number;
  burst_ms?: number;
  tauLC_ms?: number;
  dutyFR?: number;
  mode?: string;
};

export function useSectorRingCoordinator(opts?: {
  phase?: number;
  preferLiveIndex?: boolean;
  streakLen?: number;
}): SectorResolved {
  const preferLiveIndex = opts?.preferLiveIndex ?? true;

  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1000 });
  const { data: metrics } = useMetrics();
  const { data: metricsLive } = useQuery({
    queryKey: ["/api/helix/metrics"],
    refetchInterval: 1000,
  });


  const [localTick, setLocalTick] = React.useState<number>(() => nowMs());

  React.useEffect(() => {
    if (isFiniteNumber(opts?.phase)) return;
    if (typeof window === "undefined") return;
    let frame = 0;
    const step = () => {
      setLocalTick(nowMs());
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [opts?.phase]);

  const resolved = React.useMemo<SectorResolved>(() => {
    const metricsAny = metrics as Record<string, unknown> | undefined;
    const liveAny = metricsLive as Record<string, unknown> | undefined;
    const pipelineAny = pipeline as Record<string, unknown> | undefined;

    const lcMetrics = (liveAny?.lightCrossing as Record<string, unknown> | undefined) ??
      (metricsAny?.lightCrossing as Record<string, unknown> | undefined) ??
      {};
    const lcPipeline = (pipelineAny?.lightCrossing as Record<string, unknown> | undefined) ?? {};

    const sectorsTotalCandidate = firstFinite(
      lcMetrics?.sectorCount,
      lcMetrics?.sectorsTotal,
      metricsAny?.lightCrossing_sectorCount,
      metricsAny?.totalSectors,
      metricsAny?.sectorCount,
      (metricsAny?.pipeline as any)?.sectorsTotal,
      (metricsAny?.pipeline as any)?.sectorCount,
      lcPipeline?.sectorCount,
      lcPipeline?.sectorsTotal,
      pipelineAny?.sectorsTotal,
      pipelineAny?.sectorCount
    );
    const sectorsTotal = Math.max(1, Math.floor(sectorsTotalCandidate ?? PROMOTED_WARP_PROFILE.sectorCount));

    const sectorsConcurrentCandidate = firstFinite(
      lcMetrics?.activeSectors,
      lcMetrics?.sectorsConcurrent,
      metricsAny?.activeSectors,
      metricsAny?.sectorStrobing,
      (metricsAny?.pipeline as any)?.sectorsConcurrent,
      lcPipeline?.activeSectors,
      lcPipeline?.sectorsConcurrent,
      pipelineAny?.sectorsConcurrent,
      pipelineAny?.concurrentSectors
    );
    const sectorsConcurrent = Math.max(1, Math.min(sectorsTotal, Math.floor(sectorsConcurrentCandidate ?? 1)));

    const currentSectorCandidate = firstFinite(
      lcMetrics?.sectorIdx,
      lcMetrics?.sectorIndex,
      liveAny?.currentSector,
      metricsAny?.currentSector,
      metricsAny?.lightCrossing_sectorIndex,
      pipelineAny?.currentSector,
      lcPipeline?.sectorIdx,
      lcPipeline?.sectorIndex
    );

    const tauFromMetrics = saneMs(
      toMs(lcMetrics?.tauLC_ms, "ms") ??
        toMs(lcMetrics?.tau_ms, "ms") ??
        toMs(lcMetrics?.tauLC_s, "s")
    );
    const tauFromLive = saneMs(
      toMs((pipelineAny as any)?.tau_LC_ms, "ms") ??
        toMs(pipelineAny?.tauLC_ms, "ms") ??
        toMs(lcPipeline?.tauLC_ms, "ms") ??
        toMs(lcPipeline?.tau_ms, "ms") ??
        toMs(lcPipeline?.tauLC_s, "s")
    );
    const tauLC_ms = firstFinite(tauFromMetrics, tauFromLive);

    const burstFromMetrics = saneMs(toMs(lcMetrics?.burst_ms, "ms"));
    const burstFromPipeline = saneMs(
      toMs(pipelineAny?.burst_ms, "ms") ?? toMs(lcPipeline?.burst_ms, "ms")
    );
    const burst_ms = firstFinite(burstFromMetrics, burstFromPipeline);

    const dwellFromMetrics = saneMs(
      toMs(lcMetrics?.dwell_ms, "ms") ?? toMs(lcMetrics?.sectorPeriod_ms, "ms")
    );
    const dwellFromPipeline = saneMs(
      toMs(pipelineAny?.dwell_ms, "ms") ??
        toMs(pipelineAny?.sectorPeriod_ms, "ms") ??
        toMs(lcPipeline?.dwell_ms, "ms") ??
        toMs(lcPipeline?.sectorPeriod_ms, "ms")
    );
    const dwell_ms = firstFinite(dwellFromMetrics, dwellFromPipeline);

    const clampSafe = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : undefined);

    const dutyCalc =
      clampSafe(burst_ms) !== undefined &&
      clampSafe(dwell_ms) !== undefined &&
      dwell_ms! > 0
        ? clamp01((burst_ms! / dwell_ms!) * (sectorsConcurrent / sectorsTotal))
        : undefined;
    const dutyFallback = firstFinite(
      pipelineAny?.dutyEffectiveFR,
      metricsAny?.dutyEffectiveFR,
      liveAny?.dutyEffectiveFR
    );
    const dutyFR = dutyCalc ?? (Number.isFinite(dutyFallback) ? (dutyFallback as number) : undefined);

    const fGHz = Number(pipelineAny?.modulationFreq_GHz);
    const fHz = Number.isFinite(fGHz) && fGHz > 0 ? fGHz * 1e9 : 15e9;
    const Tm_s = 1 / fHz;
    const dwell_s = Number.isFinite(dwell_ms) ? (dwell_ms as number) / 1000 : undefined;
    const sectorPeriod_s = dwell_s ?? (sectorsTotal > 0 ? sectorsTotal * Tm_s : Tm_s);
    const sectorPeriod_ms = sectorPeriod_s * 1000;

    let phase01: number | undefined = undefined;
    if (isFiniteNumber(opts?.phase)) {
      phase01 = (opts!.phase as number) % 1;
    } else if (sectorPeriod_ms > 0) {
      const local = localTick % sectorPeriod_ms;
      phase01 = local / sectorPeriod_ms;
    } else {
      const t = nowMs() / 1000;
      phase01 = t - Math.floor(t);
    }
    if (phase01 < 0) phase01 += 1;
    phase01 = clamp01(phase01);

    const fallbackIndex = clampIndex(Math.floor(phase01 * sectorsTotal), sectorsTotal);
    const idxActive =
      preferLiveIndex && isFiniteNumber(currentSectorCandidate)
        ? clampIndex(currentSectorCandidate as number, sectorsTotal)
        : fallbackIndex;

    const mode = (pipelineAny?.currentMode ??
      metricsAny?.currentMode ??
      liveAny?.currentMode) as string | undefined;

    return {
      sectorsTotal,
      sectorsConcurrent,
      idxActive,
      dwell_ms: clampSafe(dwell_ms),
      burst_ms: clampSafe(burst_ms),
      tauLC_ms: clampSafe(tauLC_ms),
      dutyFR: clampSafe(dutyFR),
      mode,
    };
  }, [
    localTick,
    metrics,
    metricsLive,
    opts?.phase,
    pipeline,
    preferLiveIndex,
  ]);

  React.useEffect(() => {
    const setStrobingState = (window as any)?.setStrobingState;
    if (typeof setStrobingState === "function") {
      try {
        setStrobingState({
          sectorCount: resolved.sectorsTotal,
          currentSector: resolved.idxActive,
        });
      } catch {
        // Ignore, debug overlays will cope without the broadcast.
      }
    }
  }, [resolved.idxActive, resolved.sectorsTotal]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const helix: any = (window as any).helix ?? ((window as any).helix = {});
    helix.timing = helix.timing ?? {};
    helix.timing.dwell_ms = resolved.dwell_ms;
    helix.timing.burst_ms = resolved.burst_ms;
    helix.timing.tauLC_ms = resolved.tauLC_ms;
    helix.timing.sectorsTotal = resolved.sectorsTotal;
    helix.timing.sectorsConcurrent = resolved.sectorsConcurrent;
  }, [
    resolved.burst_ms,
    resolved.dwell_ms,
    resolved.tauLC_ms,
    resolved.sectorsConcurrent,
    resolved.sectorsTotal,
  ]);

  return resolved;
}

export default useSectorRingCoordinator;

