import { useQuery } from "@tanstack/react-query";
import { fetchProofPack } from "@/lib/proof-pack";
import type { ProofPack } from "@shared/schema";

const GATEWAY_BACKOFF_MS = 60_000;
let proofPackGatewayRetryAfter = 0;

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

export type UseProofPackOptions = {
  refetchInterval?: number | false;
  staleTime?: number;
  enabled?: boolean;
};

export function useProofPack(options: UseProofPackOptions = {}) {
  return useQuery<ProofPack>({
    queryKey: ["/api/helix/pipeline/proofs"],
    queryFn: async ({ signal }) => {
      try {
        const pack = await fetchProofPack(signal);
        proofPackGatewayRetryAfter = 0;
        return pack;
      } catch (err) {
        if (isGatewayError(err)) {
          proofPackGatewayRetryAfter = Date.now() + GATEWAY_BACKOFF_MS;
        }
        throw err;
      }
    },
    refetchInterval: () => {
      if (options.refetchInterval === false) return false;
      const custom = typeof options.refetchInterval === "number"
        ? options.refetchInterval
        : 5_000;
      const now = Date.now();
      if (now < proofPackGatewayRetryAfter) {
        return Math.max(1_000, proofPackGatewayRetryAfter - now);
      }
      return custom;
    },
    staleTime: options.staleTime ?? 10_000,
    enabled: options.enabled ?? true,
    retry: false,
  });
}
