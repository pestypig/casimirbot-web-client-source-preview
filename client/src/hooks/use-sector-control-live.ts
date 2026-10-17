import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sectorControlLiveEventSchema, type SectorControlLiveEvent } from "@shared/schema";

type SectorControlLiveResponse = {
  event: (SectorControlLiveEvent & { source?: "server"; updatedAt?: number }) | null;
  meta?: {
    source?: string;
    hasEvent?: boolean;
    now?: number;
  };
};

export function useSectorControlLive(pollMs = 3000) {
  return useQuery<SectorControlLiveResponse>({
    queryKey: ["sector-control-live"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/helix/sector-control/live");
      const data = (await res.json()) as SectorControlLiveResponse;
      if (data?.event) {
        const parsed = sectorControlLiveEventSchema.safeParse(data.event);
        data.event = parsed.success ? { ...parsed.data, source: "server", updatedAt: data.event.updatedAt } : null;
      }
      return data;
    },
    refetchInterval: pollMs,
    staleTime: 0,
  });
}
