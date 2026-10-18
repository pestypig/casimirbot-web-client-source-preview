import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnergyPipeline, useUpdatePipeline } from "@/hooks/use-energy-pipeline";
import { useHullPreviewPayload } from "@/hooks/use-hull-preview-payload";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { fetchHullAssets } from "@/lib/hull-assets";
import {
  buildPreviewArtifacts,
  previewMatchesAsset,
  resolveDriveDirFromHullDims,
  resolveLiveHullDims,
  resolvePreviewDims,
} from "@/lib/hull-preview-artifacts";
import type { HullPreviewPayload } from "@shared/schema";
import { Button } from "@/components/ui/button";

type GeometrySource = "pipeline" | "repo" | "upload";

const format = (value: number) => Number.isFinite(value) ? value.toFixed(1) : "unreported";

export default function GeometrySourceDeveloperCard() {
  const { state: solveState } = useNhm2SolveState();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 5000 });
  const updatePipeline = useUpdatePipeline();
  const hullPreviewPayload = useHullPreviewPayload();
  const assetsQuery = useQuery({
    queryKey: ["helix:hull-assets"],
    queryFn: ({ signal }) => fetchHullAssets(signal),
    staleTime: 30_000,
  });
  const [source, setSource] = useState<GeometrySource>("pipeline");
  const [assetId, setAssetId] = useState("");
  const [usePreviewObb, setUsePreviewObb] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const repoAssets = assetsQuery.data?.repo ?? [];
  const uploadAssets = assetsQuery.data?.uploads ?? [];
  const assets = source === "repo" ? repoAssets : source === "upload" ? uploadAssets : [];
  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? null;
  const authority = solveState.geometry.authority;
  const hullDims = useMemo(() => resolveLiveHullDims(pipeline, authority), [
    pipeline, authority.Lx_m, authority.Ly_m, authority.Lz_m,
  ]);
  const pipelinePreview = ((pipeline as any)?.geometryPreview?.preview as HullPreviewPayload | null) ?? null;
  const previewCandidate = selectedAsset
    ? previewMatchesAsset(pipelinePreview, selectedAsset) ? pipelinePreview
      : previewMatchesAsset(hullPreviewPayload, selectedAsset) ? hullPreviewPayload : null
    : null;
  const previewDims = resolvePreviewDims(previewCandidate);

  useEffect(() => {
    if (source === "pipeline" || selectedAsset || !assets.length) return;
    setAssetId(assets[0].id);
  }, [source, selectedAsset, assets]);
  useEffect(() => setStatus(null), [source, assetId]);

  const apply = async () => {
    const driveDir = resolveDriveDirFromHullDims(previewDims ?? hullDims);
    let payload: Record<string, unknown>;
    if (source === "pipeline") {
      payload = {
        preview: null, previewMesh: null, previewSdf: null, previewLattice: null,
        warpGeometryKind: "ellipsoid", warpFieldType: "alcubierre",
        dynamicConfig: { warpFieldType: "alcubierre" }, driveDir, grEnabled: true,
      };
    } else {
      if (!selectedAsset) return;
      const preview: HullPreviewPayload = previewCandidate ?? {
        version: "v1",
        glbUrl: selectedAsset.url,
        meshHash: selectedAsset.meshHash,
        updatedAt: Date.now(),
        provenance: "preview",
      };
      const { previewMesh, previewSdf, previewLattice } = buildPreviewArtifacts(preview);
      payload = {
        preview, previewMesh, previewSdf, previewLattice,
        warpGeometryKind: "sdf", warpFieldType: "alcubierre",
        dynamicConfig: { warpFieldType: "alcubierre" }, driveDir, grEnabled: true,
        warpGeometryAssetId: selectedAsset.meshHash ?? selectedAsset.id,
      };
      if (usePreviewObb && previewDims) payload.hull = previewDims;
    }
    setStatus("Applying geometry to the live pipeline…");
    try {
      await updatePipeline.mutateAsync(payload as any);
      setStatus("Live pipeline accepted the geometry update. This is not selected-run NHM2 evidence.");
    } catch (error) {
      setStatus(`Pipeline update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const previewUrl = (pipeline as any)?.geometryPreview?.preview?.glbUrl ??
    (pipeline as any)?.geometryPreview?.mesh?.glbUrl ?? null;
  const meshHash = (pipeline as any)?.geometryPreview?.mesh?.meshHash ??
    (pipeline as any)?.geometryPreview?.preview?.meshHash ?? null;

  return <section className="space-y-4 rounded border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
    <div>
      <h3 className="font-semibold">Geometry source developer controls</h3>
      <p className="text-xs text-amber-200">
        Apply writes the live pipeline's geometry, Alcubierre field selection, drive direction, and GR enablement.
        It does not amend the frozen NHM2 candidate or authenticate a metric, source tensor, or selected-run receipt.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span>Geometry source</span>
        <select className="block w-full rounded border border-slate-700 bg-slate-900 p-2" value={source}
          onChange={(event) => setSource(event.target.value as GeometrySource)}>
          <option value="pipeline">Pipeline ellipsoid</option>
          <option value="repo">Repository GLB</option>
          <option value="upload">Uploaded GLB</option>
        </select>
      </label>
      {source !== "pipeline" && <label className="space-y-1 text-xs">
        <span>Asset</span>
        <select className="block w-full rounded border border-slate-700 bg-slate-900 p-2"
          value={selectedAsset?.id ?? ""} onChange={(event) => setAssetId(event.target.value)} disabled={!assets.length}>
          {assets.length ? assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)
            : <option value="">No assets available</option>}
        </select>
      </label>}
    </div>
    {assetsQuery.error instanceof Error && <p className="text-xs text-amber-200">Asset list: {assetsQuery.error.message}</p>}
    {source !== "pipeline" && <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={usePreviewObb} disabled={!previewDims}
        onChange={(event) => setUsePreviewObb(event.target.checked)} /> Use matching preview dimensions
    </label>}
    {source !== "pipeline" && !previewDims && <p className="text-xs text-slate-400">Matching preview dimensions: unreported</p>}
    {previewDims && <p className="text-xs text-slate-400">
      Preview dimensions: {format(previewDims.Lx_m)} × {format(previewDims.Ly_m)} × {format(previewDims.Lz_m)} m
    </p>}
    <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
      <span>Current kind: {(pipeline as any)?.warpGeometryKind ?? "unreported"}</span>
      <span>Hull dimensions: {format(hullDims.Lx_m)} × {format(hullDims.Ly_m)} × {format(hullDims.Lz_m)} m</span>
      <span>Repository assets: {repoAssets.length}; uploads: {uploadAssets.length}</span>
      <span>Current mesh hash: {meshHash ?? "unreported"}</span>
      <span>Current preview: {previewUrl ?? "unreported"}</span>
      <span>Selected asset: {selectedAsset?.label ?? "none"}</span>
    </div>
    <Button size="sm" disabled={updatePipeline.isPending || (source !== "pipeline" && !selectedAsset)}
      onClick={() => void apply()}>Apply geometry to live pipeline</Button>
    {status && <p className="text-xs text-slate-300">{status}</p>}
  </section>;
}
