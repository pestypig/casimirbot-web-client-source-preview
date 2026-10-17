import { useQuery } from "@tanstack/react-query";
import type { GrConstraintContract } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type UseGrConstraintContractOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

const GATEWAY_BACKOFF_MS = 60_000;
let grConstraintContractUnavailable = false;
let grConstraintContractRetryAfter = 0;

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
  const message = err instanceof Error ? err.message : String(err);
  if (!message) return false;
  return message.includes("404") || message.toLowerCase().includes("api_not_found");
};

async function fetchGrConstraintContract(): Promise<GrConstraintContract | null> {
  if (grConstraintContractUnavailable) return null;
  if (Date.now() < grConstraintContractRetryAfter) return null;
  try {
    const response = await apiRequest("GET", "/api/helix/gr-constraint-contract");
    grConstraintContractRetryAfter = 0;
    return (await response.json()) as GrConstraintContract;
  } catch (err) {
    if (isNotFoundError(err)) {
      grConstraintContractUnavailable = true;
      return null;
    }
    if (isGatewayError(err)) {
      grConstraintContractRetryAfter = Date.now() + GATEWAY_BACKOFF_MS;
      return null;
    }
    throw err;
  }
}

export function useGrConstraintContract(options?: UseGrConstraintContractOptions) {
  return useQuery({
    queryKey: ["helix:gr-constraint-contract"],
    queryFn: fetchGrConstraintContract,
    refetchInterval: () => {
      if (grConstraintContractUnavailable) return false;
      if (options?.refetchInterval === false) return false;
      const custom = typeof options?.refetchInterval === "number"
        ? options.refetchInterval
        : 2000;
      const now = Date.now();
      if (now < grConstraintContractRetryAfter) {
        return Math.max(1_000, grConstraintContractRetryAfter - now);
      }
      return custom;
    },
    enabled: options?.enabled ?? true,
  });
}

