import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurvatureBrick, type CurvatureQuality, type CurvatureBrickRequest, type CurvatureBrickDecoded } from "@/lib/curvature-brick";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import type { EnergyPipelineState } from "./use-energy-pipeline";

export interface UseCurvatureBrickOptions {
  quality?: CurvatureQuality;
  clampQI?: boolean;
  beta0?: number;
  betaMax?: number;
  refetchMs?: number;
}

export interface CurvatureSample extends CurvatureBrickDecoded {
  dutyFR: number;
  tauLC_s: number;
  Tm_s: number;
}

const pickPipelineNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function useCurvatureBrick(options: UseCurvatureBrickOptions = {}) {
  const {
    quality = "medium",
    clampQI = true,
    beta0 = 1,
    betaMax = 12,
    refetchMs = 80,
  } = options;
  const queryClient = useQueryClient();
  const pipeline = queryClient.getQueryData<EnergyPipelineState>(["/api/helix/pipeline"]);

  const sectorCount = pipeline?.sectorCount ?? pipeline?.sectorsTotal ?? PROMOTED_WARP_PROFILE.sectorCount;
  const dutyFR = pickPipelineNumber(
    pipeline?.dutyEffectiveFR ?? pipeline?.dutyCycle,
    PROMOTED_WARP_PROFILE.dutyShip,
  );
  const gammaGeo = pickPipelineNumber(pipeline?.gammaGeo, PROMOTED_WARP_PROFILE.gammaGeo);
  const gammaVdB =
    pickPipelineNumber(
      (pipeline as any)?.gammaVanDenBroeck_mass ??
        pipeline?.gammaVanDenBroeck ??
        (pipeline as any)?.gammaVdB ??
        (pipeline as any)?.gammaVanDenBroeck_vis,
      PROMOTED_WARP_PROFILE.gammaVanDenBroeck
    );
  const modulationFreq = pickPipelineNumber(pipeline?.modulationFreq_GHz, 15);
  const tauLC_ms =
    pickPipelineNumber(
      (pipeline as any)?.lightCrossing?.tauLC_ms ??
        (pipeline as any)?.lightCrossing?.tau_ms ??
        (pipeline as any)?.tau_LC_ms ??
        (pipeline as any)?.tauLC_ms,
      3.34
    );
  const tauLC_s = tauLC_ms / 1000;
  const Tm_s = modulationFreq > 0 ? 1 / (modulationFreq * 1e9) : 1 / (15e9);

  const phase01 = useDriveSyncStore((s) => s.phase01);
  const splitEnabled = useDriveSyncStore((s) => s.splitEnabled);
  const splitFrac = useDriveSyncStore((s) => s.splitFrac);
  const sigmaSectors = useDriveSyncStore((s) => s.sigmaSectors);
  const qSpoil = useDriveSyncStore((s) => s.q);
  const zeta = useDriveSyncStore((s) => s.zeta);
  const ampBase = useDriveSyncStore((s) => s.ampBase);

  const sigmaSector = useMemo(() => {
    const total = Math.max(1, Math.floor(sectorCount));
    return Math.max(1e-3, sigmaSectors / total);
  }, [sigmaSectors, sectorCount]);

  const request = useMemo<CurvatureBrickRequest>(() => ({
    quality,
    phase01,
    sigmaSector,
    splitEnabled,
    splitFrac,
    dutyFR: Math.max(dutyFR, 1e-8),
    tauLC_s,
    Tm_s,
    beta0,
    betaMax,
    zeta,
    q: Math.max(qSpoil, 0),
    gammaGeo: Math.max(gammaGeo, 1e-3),
    gammaVdB: Math.max(gammaVdB, 1e-6),
    ampBase: Math.max(ampBase, 0),
    clampQI,
  }), [
    quality,
    phase01,
    sigmaSector,
    splitEnabled,
    splitFrac,
    dutyFR,
    tauLC_s,
    Tm_s,
    beta0,
    betaMax,
    zeta,
    qSpoil,
    gammaGeo,
    gammaVdB,
    ampBase,
    clampQI,
  ]);

  const queryKey = useMemo(() => ["helix:curvature-brick", request] as const, [request]);

  const query = useQuery<CurvatureBrickDecoded>({
    queryKey,
    queryFn: ({ signal }) => fetchCurvatureBrick(request, signal),
    enabled: Boolean(pipeline),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });

  const sample: CurvatureSample | undefined = useMemo(() => {
    if (!query.data) return undefined;
    return {
      ...query.data,
      dutyFR: Math.max(dutyFR, 1e-8),
      tauLC_s,
      Tm_s,
    };
  }, [query.data, dutyFR, tauLC_s, Tm_s]);

  return {
    ...query,
    sample,
  };
}
