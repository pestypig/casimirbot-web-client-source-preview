import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCasimirTileSummary,
  type CasimirTileSummaryRequest,
} from "@/lib/casimir-tile-summary";

export interface UseCasimirTileSummaryOptions extends CasimirTileSummaryRequest {
  refetchMs?: number;
  enabled?: boolean;
}

export function useCasimirTileSummary(options: UseCasimirTileSummaryOptions = {}) {
  const { dims, refetchMs = 0, enabled = true } = options;
  const request = useMemo<CasimirTileSummaryRequest>(
    () => ({ dims }),
    [dims],
  );
  const queryKey = useMemo(() => ["helix:casimir-tile-summary", request] as const, [request]);
  const refetchInterval =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : false;
  const staleTime =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : 0;

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchCasimirTileSummary(request, signal),
    enabled,
    refetchInterval,
    staleTime,
  });
}
