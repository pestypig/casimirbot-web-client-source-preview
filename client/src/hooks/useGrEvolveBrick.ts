import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGrEvolveBrick,
  type GrEvolveBrickDecoded,
  type GrEvolveBrickRequest,
} from "@/lib/gr-evolve-brick";
import type { CurvatureQuality } from "@/lib/curvature-brick";

export interface UseGrEvolveBrickOptions {
  quality?: CurvatureQuality;
  dims?: [number, number, number];
  time_s?: number;
  dt_s?: number;
  steps?: number;
  iterations?: number;
  tolerance?: number;
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
  refetchMs?: number;
}

export function useGrEvolveBrick(options: UseGrEvolveBrickOptions = {}) {
  const {
    quality = "low",
    dims,
    time_s,
    dt_s,
    steps,
    iterations,
    tolerance,
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
    refetchMs = 2000,
  } = options;

  const request = useMemo<GrEvolveBrickRequest>(
    () => ({
      quality,
      dims,
      time_s,
      dt_s,
      steps,
      iterations,
      tolerance,
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
    }),
    [
      quality,
      dims,
      time_s,
      dt_s,
      steps,
      iterations,
      tolerance,
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
    ],
  );

  const queryKey = useMemo(() => ["helix:gr-evolve-brick", request] as const, [request]);

  return useQuery<GrEvolveBrickDecoded>({
    queryKey,
    queryFn: ({ signal }) => fetchGrEvolveBrick(request, signal),
    refetchInterval: refetchMs,
    staleTime: refetchMs,
  });
}
