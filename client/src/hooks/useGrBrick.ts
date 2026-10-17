import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurvatureQuality } from "@/lib/curvature-brick";
import {
  fetchGrEvolveBrick,
  type GrEvolveBrickDecoded,
  type GrEvolveBrickRequest,
} from "@/lib/gr-evolve-brick";
import type { EnergyPipelineState } from "./use-energy-pipeline";

export interface UseGrBrickOptions {
  quality?: CurvatureQuality;
  dims?: [number, number, number];
  time_s?: number;
  dt_s?: number;
  steps?: number;
  iterations?: number;
  tolerance?: number;
  koEps?: number;
  koTargets?: "gauge" | "all";
  shockMode?: "off" | "diagnostic" | "stabilize";
  advectScheme?: "centered" | "upwind1";
  lapseKappa?: number;
  shiftEta?: number;
  shiftGamma?: number;
  advect?: boolean;
  order?: 2 | 4;
  boundary?: "clamp" | "periodic";
  includeExtra?: boolean;
  includeMatter?: boolean;
  includeKij?: boolean;
  driveDir?: [number, number, number] | null;
  dutyFR?: number;
  q?: number;
  gammaGeo?: number;
  gammaVdB?: number;
  zeta?: number;
  phase01?: number;
  refetchMs?: number;
  enabled?: boolean;
}

export function useGrBrick(options: UseGrBrickOptions = {}) {
  const {
    quality = "low",
    dims,
    time_s,
    dt_s,
    steps,
    iterations,
    tolerance,
    koEps,
    koTargets,
    shockMode,
    advectScheme,
    lapseKappa,
    shiftEta,
    shiftGamma,
    advect,
    order,
    boundary,
    includeExtra,
    includeMatter,
    includeKij,
    driveDir,
    dutyFR,
    q,
    gammaGeo,
    gammaVdB,
    zeta,
    phase01,
    refetchMs = 2000,
    enabled,
  } = options;
  const queryClient = useQueryClient();
  const pipeline = queryClient.getQueryData<EnergyPipelineState>(["/api/helix/pipeline"]);

  const request = useMemo<GrEvolveBrickRequest>(
    () => ({
      quality,
      dims,
      time_s,
      dt_s,
      steps,
      iterations,
      tolerance,
      koEps,
      koTargets,
      shockMode,
      advectScheme,
      lapseKappa,
      shiftEta,
      shiftGamma,
      advect,
      order,
      boundary,
      includeExtra,
      includeMatter,
      includeKij,
      driveDir,
      dutyFR,
      q,
      gammaGeo,
      gammaVdB,
      zeta,
      phase01,
    }),
    [
      quality,
      dims,
      time_s,
      dt_s,
      steps,
      iterations,
      tolerance,
      koEps,
      koTargets,
      shockMode,
      advectScheme,
      lapseKappa,
      shiftEta,
      shiftGamma,
      advect,
      order,
      boundary,
      includeExtra,
      includeMatter,
      includeKij,
      driveDir,
      dutyFR,
      q,
      gammaGeo,
      gammaVdB,
      zeta,
      phase01,
    ],
  );

  const queryKey = useMemo(() => ["helix:gr-evolve-brick", request] as const, [request]);
  const enabledResolved = (enabled ?? true) && pipeline?.grEnabled !== false;
  const refetchInterval =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : false;
  const staleTime =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : 0;

  return useQuery<GrEvolveBrickDecoded>({
    queryKey,
    queryFn: ({ signal }) => fetchGrEvolveBrick(request, signal),
    enabled: enabledResolved,
    refetchInterval,
    staleTime,
  });
}
