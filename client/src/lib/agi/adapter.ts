import { apiRequest } from "@/lib/queryClient";
import type { AdapterRunRequest, AdapterRunResponse } from "@shared/schema";

export const ADAPTER_RUN_ENDPOINT = "/api/agi/adapter/run";

export async function runAdapter(
  payload: AdapterRunRequest,
  signal?: AbortSignal,
): Promise<AdapterRunResponse> {
  const res = await apiRequest("POST", ADAPTER_RUN_ENDPOINT, payload, signal);
  const json = (await res.json()) as AdapterRunResponse;
  return json;
}
