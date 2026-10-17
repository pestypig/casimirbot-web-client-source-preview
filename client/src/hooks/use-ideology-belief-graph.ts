import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  IdeologyBeliefGraphConfig,
  IdeologyBeliefGraphResponse,
  IdeologyGuidanceResponse,
} from "@/lib/ideology-types";

export type IdeologyBeliefGraphRequest = Partial<
  Pick<
    IdeologyBeliefGraphConfig,
    | "rootFixed"
    | "includeSeeAlso"
    | "seeAlsoWeight"
    | "edgeMode"
    | "stepSize"
    | "maxIterations"
    | "thresholds"
    | "scoreClamp"
    | "trueIds"
    | "falseIds"
  > & {
    includeGraph: boolean;
    includeAttempts: boolean;
  }
>;

export function useIdeologyBeliefGraph(request: IdeologyBeliefGraphRequest = {}) {
  return useQuery({
    queryKey: ["/api/ethos/ideology/belief-graph", request],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/ethos/ideology/belief-graph", request);
      return (await res.json()) as IdeologyBeliefGraphResponse;
    },
    staleTime: 60_000,
  });
}


export function useIdeologyGuidance(request: {
  activePressures: string[];
  observedSignals?: string[];
  topK?: number;
}) {
  return useQuery({
    queryKey: ["/api/ethos/ideology/guidance", request],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/ethos/ideology/guidance", request);
      return (await res.json()) as IdeologyGuidanceResponse;
    },
    enabled: request.activePressures.length > 0,
    staleTime: 30_000,
  });
}
