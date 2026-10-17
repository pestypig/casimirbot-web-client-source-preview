import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildMathNodeIndex,
  resolveMathStageGate,
  type MathStageGate,
  type MathStageRequirement,
  type MathGraphResponse,
} from "@/lib/math-stage-gate";

export function useMathStageGate(
  requirements: ReadonlyArray<MathStageRequirement>,
  options: { staleTime?: number } = {},
): MathStageGate & { pending: boolean } {
  const query = useQuery({
    queryKey: ["/api/helix/math/graph"],
    staleTime: options.staleTime ?? 30_000,
  });
  const graph = query.data as MathGraphResponse | undefined;
  const index = useMemo(() => buildMathNodeIndex(graph?.root), [graph?.root]);
  const gate = useMemo(
    () => resolveMathStageGate(index, requirements),
    [index, requirements],
  );
  const pending = query.isLoading || query.isFetching;
  return { ...gate, pending };
}
