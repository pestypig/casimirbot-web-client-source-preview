import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  IdeologyArtifactSearchParams,
  IdeologyArtifactSearchResponse
} from "@shared/ideology/ideology-artifacts";

const buildSearchParams = (params: IdeologyArtifactSearchParams) => {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.panelId) search.set("panelId", params.panelId);
  if (params.nodeId) search.set("nodeId", params.nodeId);
  if (params.tags && params.tags.length > 0) {
    search.set("tags", params.tags.join(","));
  }
  if (typeof params.limit === "number") {
    search.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    search.set("offset", String(params.offset));
  }
  return search.toString();
};

export function useIdeologyArtifacts(options: IdeologyArtifactSearchParams = {}) {
  const tagKey = options.tags?.join(",") ?? "";
  const request = useMemo(
    () => ({
      query: options.query?.trim() || undefined,
      panelId: options.panelId?.trim() || undefined,
      nodeId: options.nodeId?.trim() || undefined,
      tags: options.tags?.map((tag) => tag.trim()).filter(Boolean),
      limit: options.limit,
      offset: options.offset
    }),
    [options.query, options.panelId, options.nodeId, tagKey, options.limit, options.offset]
  );

  const queryKey = useMemo(
    () => ["/api/ethos/artifacts", request],
    [request]
  );

  const queryEnabled =
    Boolean(request.panelId || request.nodeId || request.query) ||
    Boolean(request.tags?.length);

  return useQuery({
    queryKey,
    enabled: queryEnabled,
    queryFn: async () => {
      const queryString = buildSearchParams(request);
      const url = queryString ? `/api/ethos/artifacts?${queryString}` : "/api/ethos/artifacts";
      const res = await apiRequest("GET", url);
      return (await res.json()) as IdeologyArtifactSearchResponse;
    }
  });
}
