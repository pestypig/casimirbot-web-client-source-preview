import { clampHullDims } from "@/lib/hull-guardrails";
import type { EnergyPipelineSnapshot } from "@/hooks/use-energy-pipeline";
import { applyHullBasisToDims, resolveHullBasis, HULL_BASIS_IDENTITY, type HullBasisResolved } from "@shared/hull-basis";
import type { HullPreviewOBB, HullPreviewPayload } from "@shared/schema";

const PREVIEW_STALE_MS = 24 * 60 * 60 * 1000; // 24h, matches helix-core backend guard

export type HullDimsEffectiveSource = "preview" | "pipeline" | "authority";

export type HullDimsEffective = {
  Lx_m: number;
  Ly_m: number;
  Lz_m: number;
  basis: HullBasisResolved;
  source: HullDimsEffectiveSource;
};

const dimsFromObb = (obb?: HullPreviewOBB | null) => {
  const half = obb?.halfSize;
  if (!half || !Array.isArray(half) || half.length < 3) return null;
  return coerceHullDims({
    Lx_m: (half[0] ?? 0) * 2,
    Ly_m: (half[1] ?? 0) * 2,
    Lz_m: (half[2] ?? 0) * 2,
  });
};

const coerceHullDims = (raw: any | undefined | null) => {
  if (!raw || typeof raw !== "object") return null;
  const pick = (primary?: number, secondary?: number, ellipsoid?: number) => {
    const finitePrimary = Number.isFinite(primary as number) ? (primary as number) : undefined;
    const finiteSecondary = Number.isFinite(secondary as number) ? (secondary as number) : undefined;
    if (finitePrimary != null) return finitePrimary;
    if (finiteSecondary != null) return finiteSecondary;
    return Number.isFinite(ellipsoid as number) ? (ellipsoid as number) * 2 : undefined;
  };
  const clamped = clampHullDims({
    Lx_m: pick((raw as any).Lx_m, (raw as any).x, (raw as any).a),
    Ly_m: pick((raw as any).Ly_m, (raw as any).y, (raw as any).b),
    Lz_m: pick((raw as any).Lz_m, (raw as any).z, (raw as any).c),
  });
  if (clamped.Lx_m && clamped.Ly_m && clamped.Lz_m) {
    return { Lx_m: clamped.Lx_m, Ly_m: clamped.Ly_m, Lz_m: clamped.Lz_m };
  }
  return null;
};

export function resolveHullDimsEffective({
  previewPayload,
  pipelineSnapshot,
  authorityFallbackDims,
  staleAfterMs = PREVIEW_STALE_MS,
  nowMs,
}: {
  previewPayload?: HullPreviewPayload | null;
  pipelineSnapshot?: EnergyPipelineSnapshot | null | undefined;
  authorityFallbackDims?: { Lx_m: number; Ly_m: number; Lz_m: number } | null;
  staleAfterMs?: number;
  nowMs?: number;
}): HullDimsEffective | null {
  const now = Number.isFinite(nowMs as number) ? (nowMs as number) : Date.now();
  const previewBasis = previewPayload?.mesh?.basis ?? previewPayload?.basis;
  const previewBasisResolved = resolveHullBasis(previewBasis, previewPayload?.scale);
  const previewClamped =
    (Array.isArray(previewPayload?.clampReasons) && previewPayload.clampReasons.length > 0) ||
    (Array.isArray(previewPayload?.mesh?.clampReasons) && (previewPayload.mesh?.clampReasons?.length ?? 0) > 0);
  const previewUpdatedAt = Number.isFinite(previewPayload?.updatedAt as number)
    ? (previewPayload?.updatedAt as number)
    : null;
  const previewStale =
    previewUpdatedAt != null && staleAfterMs > 0 ? now - previewUpdatedAt > staleAfterMs : false;
  const targetDimsPreview = coerceHullDims(previewPayload?.targetDims);
  const obbDimsRaw = dimsFromObb(previewPayload?.mesh?.obb ?? previewPayload?.obb);
  const hullMetricDimsRaw = coerceHullDims(previewPayload?.hullMetrics?.dims_m);
  let previewDims: HullDimsEffective | null = null;
  if (!previewClamped && !previewStale) {
    if (targetDimsPreview) {
      previewDims = { ...targetDimsPreview, basis: previewBasisResolved, source: "preview" };
    } else if (obbDimsRaw) {
      const aligned = applyHullBasisToDims(obbDimsRaw, previewBasisResolved);
      previewDims = { ...aligned, basis: previewBasisResolved, source: "preview" };
    } else if (hullMetricDimsRaw) {
      const aligned = applyHullBasisToDims(hullMetricDimsRaw, previewBasisResolved);
      previewDims = { ...aligned, basis: previewBasisResolved, source: "preview" };
    }
  }
  if (previewDims) {
    return previewDims;
  }

  const fromPipeline = coerceHullDims(pipelineSnapshot?.hull);
  if (fromPipeline) {
    return { ...applyHullBasisToDims(fromPipeline, HULL_BASIS_IDENTITY), basis: HULL_BASIS_IDENTITY, source: "pipeline" };
  }

  const fromAuthority = coerceHullDims(authorityFallbackDims);
  if (fromAuthority) {
    return {
      ...applyHullBasisToDims(fromAuthority, HULL_BASIS_IDENTITY),
      basis: HULL_BASIS_IDENTITY,
      source: "authority",
    };
  }

  return null;
}
