import { apiRequest } from "@/lib/queryClient";

export type HullAssetSource = "repo" | "upload";

export type HullAssetEntry = {
  id: string;
  label: string;
  url: string;
  source: HullAssetSource;
  meshHash?: string;
  updatedAt?: number;
};

export type HullAssetsResponse = {
  kind: "hull-assets";
  repo: HullAssetEntry[];
  uploads: HullAssetEntry[];
};

export async function fetchHullAssets(signal?: AbortSignal): Promise<HullAssetsResponse> {
  const res = await apiRequest("GET", "/api/helix/hull-preview/assets", undefined, signal);
  const json = await res.json();
  if (!json || json.kind !== "hull-assets") {
    throw new Error("Invalid hull-assets payload");
  }
  return json as HullAssetsResponse;
}
