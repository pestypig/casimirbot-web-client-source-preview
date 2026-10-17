import { useQuery } from "@tanstack/react-query";
import type { GrEvaluation } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type UseGrEvaluationOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

const GATEWAY_BACKOFF_MS = 60_000;
let grEvaluationUnavailable = false;
let grEvaluationRetryAfter = 0;

const isGatewayError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes(" 502") ||
    normalized.includes(" 503") ||
    normalized.includes(" 504") ||
    normalized.includes("bad gateway") ||
    normalized.includes("upstream")
  );
};

const isNotFoundError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.includes("404") || message.toLowerCase().includes("api_not_found");
};

async function fetchGrEvaluation(): Promise<GrEvaluation | null> {
  if (grEvaluationUnavailable) return null;
  if (Date.now() < grEvaluationRetryAfter) return null;
  try {
    const response = await apiRequest("GET", "/api/helix/gr-evaluation");
    grEvaluationRetryAfter = 0;
    return (await response.json()) as GrEvaluation;
  } catch (err) {
    if (isNotFoundError(err)) {
      grEvaluationUnavailable = true;
      return null;
    }
    if (isGatewayError(err)) {
      grEvaluationRetryAfter = Date.now() + GATEWAY_BACKOFF_MS;
      return null;
    }
    throw err;
  }
}

export function useGrEvaluation(options?: UseGrEvaluationOptions) {
  return useQuery({
    queryKey: ["helix:gr-evaluation"],
    queryFn: fetchGrEvaluation,
    refetchInterval: () => {
      if (grEvaluationUnavailable) return false;
      if (options?.refetchInterval === false) return false;
      const custom =
        typeof options?.refetchInterval === "number" ? options.refetchInterval : 3_000;
      const now = Date.now();
      if (now < grEvaluationRetryAfter) {
        return Math.max(1_000, grEvaluationRetryAfter - now);
      }
      return custom;
    },
    enabled: options?.enabled ?? true,
    retry: false,
  });
}
