import type { HullPreviewPayload } from "@shared/schema";
import type { HullAssetEntry } from "@/lib/hull-assets";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";

export type PreviewHullDims = { Lx_m: number; Ly_m: number; Lz_m: number };
const LEGACY_HULL_DIMS: PreviewHullDims = { Lx_m: 1007, Ly_m: 264, Lz_m: 173 };

const firstFinite = (...values: unknown[]): number | null => {
  for (const value of values) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
};

export function resolveLiveHullDims(
  pipeline: EnergyPipelineState | null | undefined,
  authority: PreviewHullDims,
): PreviewHullDims {
  const hull = (pipeline as any)?.hull ?? {};
  const axes = [
    firstFinite(hull.a, (pipeline as any)?.a),
    firstFinite(hull.b, (pipeline as any)?.b),
    firstFinite(hull.c, (pipeline as any)?.c),
  ];
  if (axes.every((value) => value != null && value > 0)) {
    return { Lx_m: axes[0]! * 2, Ly_m: axes[1]! * 2, Lz_m: axes[2]! * 2 };
  }
  const lengths = [
    firstFinite(hull.Lx_m, (pipeline as any)?.Lx_m),
    firstFinite(hull.Ly_m, (pipeline as any)?.Ly_m),
    firstFinite(hull.Lz_m, (pipeline as any)?.Lz_m),
  ];
  if (lengths.every((value) => value != null && value > 0)) {
    return { Lx_m: lengths[0]!, Ly_m: lengths[1]!, Lz_m: lengths[2]! };
  }
  if ([authority.Lx_m, authority.Ly_m, authority.Lz_m].every((value) => Number.isFinite(value) && value > 0)) {
    return authority;
  }
  return LEGACY_HULL_DIMS;
}

export function previewMatchesAsset(
  preview: HullPreviewPayload | null | undefined,
  asset: HullAssetEntry | null,
): boolean {
  if (!preview || !asset) return false;
  const previewMeshHash = preview.meshHash ?? preview.mesh?.meshHash ?? null;
  if (asset.meshHash && previewMeshHash && asset.meshHash === previewMeshHash) return true;
  const previewUrl = preview.glbUrl ?? preview.mesh?.glbUrl ?? null;
  return Boolean(previewUrl && previewUrl === asset.url);
}

export function resolvePreviewDims(preview: HullPreviewPayload | null | undefined): PreviewHullDims | null {
  if (!preview) return null;
  const target = preview.targetDims ?? preview.hullMetrics?.dims_m ?? null;
  if (target && Number.isFinite(target.Lx_m) && Number.isFinite(target.Ly_m) && Number.isFinite(target.Lz_m)) {
    return { Lx_m: target.Lx_m, Ly_m: target.Ly_m, Lz_m: target.Lz_m };
  }
  const obb = preview.obb ?? preview.mesh?.obb ?? null;
  if (obb?.halfSize && Array.isArray(obb.halfSize) && obb.halfSize.length >= 3) {
    const [hx, hy, hz] = obb.halfSize;
    if ([hx, hy, hz].every((value) => Number.isFinite(value))) {
      return { Lx_m: hx * 2, Ly_m: hy * 2, Lz_m: hz * 2 };
    }
  }
  return null;
}

export function resolveDriveDirFromHullDims(dims: PreviewHullDims | null): [number, number, number] {
  const fallback: [number, number, number] = [1, 0, 0];
  if (!dims) return fallback;
  const values = [dims.Lx_m, dims.Ly_m, dims.Lz_m];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return fallback;
  let maxIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[maxIndex]) maxIndex = index;
  }
  if (maxIndex === 1) return [0, 1, 0];
  if (maxIndex === 2) return [0, 0, 1];
  return fallback;
}

export function buildPreviewArtifacts(preview: HullPreviewPayload) {
  const meshHash = preview.mesh?.meshHash ?? preview.meshHash ?? undefined;
  const previewMesh = preview.mesh ?? (meshHash
    ? {
        meshHash,
        glbUrl: preview.glbUrl,
        basis: preview.basis,
        obb: preview.obb,
        lods: preview.lods,
        coarseLod: preview.lodCoarse,
        fullLod: preview.lodFull,
        provenance: preview.provenance,
        clampReasons: preview.clampReasons,
      }
    : undefined);
  const precomputed = preview.precomputed ?? null;
  const latticeHashes = precomputed?.meta?.hashes ??
    (precomputed?.frame as any)?.hashes ??
    (precomputed as any)?.hashes ?? undefined;
  const sdfHash = latticeHashes?.sdf ??
    (precomputed as any)?.sdf?.key ??
    (precomputed as any)?.sdf?.hash ?? null;
  const previewSdf = sdfHash || precomputed?.frame
    ? {
        key: sdfHash ?? undefined,
        hash: sdfHash ?? undefined,
        clampReasons: precomputed?.frame?.clampReasons ??
          precomputed?.meta?.frame?.clampReasons ??
          (precomputed as any)?.clampReasons,
        stats: precomputed?.meta?.stats,
      }
    : undefined;
  const previewLattice = precomputed?.meta || precomputed?.frame
    ? {
        enabled: precomputed?.meta?.enabled ?? true,
        frame: precomputed?.frame ?? precomputed?.meta?.frame,
        hashes: latticeHashes,
        band_m: precomputed?.meta?.band_m,
        stats: precomputed?.meta?.stats,
        driveLadder: precomputed?.meta?.driveLadder,
        clampReasons: precomputed?.frame?.clampReasons ??
          precomputed?.meta?.frame?.clampReasons ??
          (precomputed as any)?.clampReasons,
      }
    : undefined;
  return { previewMesh, previewSdf, previewLattice };
}
