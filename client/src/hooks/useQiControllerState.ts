import { useQuery } from "@tanstack/react-query";
import type { QiControllerState } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type UseQiControllerStateOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

let qiControllerUnavailable = false;

const isQiNotFoundError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  if (!message) return false;
  return message.includes("404") || message.toLowerCase().includes("api_not_found");
};

async function fetchQiControllerState(): Promise<QiControllerState | null> {
  if (qiControllerUnavailable) return null;
  try {
    const response = await apiRequest("GET", "/api/qi/controller-state");
    return (await response.json()) as QiControllerState;
  } catch (err) {
    if (isQiNotFoundError(err)) {
      qiControllerUnavailable = true;
      return null;
    }
    throw err;
  }
}

export function useQiControllerState(options?: UseQiControllerStateOptions) {
  return useQuery({
    queryKey: ["qi-controller-state"],
    queryFn: fetchQiControllerState,
    refetchInterval: qiControllerUnavailable ? false : options?.refetchInterval ?? 1500,
    enabled: options?.enabled ?? true,
  });
}
