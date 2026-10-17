import { apiRequest } from "@/lib/queryClient";
import type { CasimirTileSummary } from "@shared/schema";

export interface CasimirTileSummaryRequest {
  dims?: [number, number, number];
}

const buildQuery = (request: CasimirTileSummaryRequest) => {
  const params = new URLSearchParams();
  if (request.dims) params.set("dims", request.dims.join("x"));
  return params.toString();
};

export async function fetchCasimirTileSummary(
  request: CasimirTileSummaryRequest,
  signal?: AbortSignal,
): Promise<CasimirTileSummary> {
  const query = buildQuery(request);
  const res = await apiRequest(
    "GET",
    `/api/helix/casimir-tile-summary${query ? `?${query}` : ""}`,
    undefined,
    signal,
  );
  const json = await res.json();
  if (!json || json.kind !== "casimir-tile-summary") {
    throw new Error("Invalid casimir-tile-summary payload");
  }
  return json as CasimirTileSummary;
}
