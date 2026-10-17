import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGrRegionStats,
  type GrRegionStatsRequest,
} from "@/lib/gr-region-stats";

export interface UseGrRegionStatsOptions extends GrRegionStatsRequest {
  refetchMs?: number;
  enabled?: boolean;
}

export function useGrRegionStats(options: UseGrRegionStatsOptions = {}) {
  const {
    quality,
    dims,
    source,
    targetRegions,
    thetaBins,
    longBins,
    phaseBins,
    radialBins,
    longAxis,
    phase01,
    strobeHz,
    sectorPeriod_s,
    topN,
    maxVoxels,
    requireCertified,
    shockMode,
    advectScheme,
    refetchMs = 0,
    enabled = true,
  } = options;

  const request = useMemo<GrRegionStatsRequest>(
    () => ({
      quality,
      dims,
      source,
      targetRegions,
      thetaBins,
      longBins,
      phaseBins,
      radialBins,
      longAxis,
      phase01,
      strobeHz,
      sectorPeriod_s,
      topN,
      maxVoxels,
      requireCertified,
      shockMode,
      advectScheme,
    }),
    [
      quality,
      dims,
      source,
      targetRegions,
      thetaBins,
      longBins,
      phaseBins,
      radialBins,
      longAxis,
      phase01,
      strobeHz,
      sectorPeriod_s,
      topN,
      maxVoxels,
      requireCertified,
      shockMode,
      advectScheme,
    ],
  );

  const queryKey = useMemo(() => ["helix:gr-region-stats", request] as const, [request]);
  const refetchInterval =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : false;
  const staleTime =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : 0;

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchGrRegionStats(request, signal),
    enabled,
    refetchInterval,
    staleTime,
  });
}
