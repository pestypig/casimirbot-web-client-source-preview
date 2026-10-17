import { useEffect, useMemo, useState } from "react";
import type { WireframeContactPatch, WireframeOverlayBuffers } from "@/lib/resolve-wireframe-overlay";
import type { HullPreviewPayload } from "@shared/schema";
import type { HullBasisResolved } from "@shared/hull-basis";

type FieldProbeStats = { min: number; max: number; mean: number; absMax: number; absMean?: number };

export type FieldProbeResult = {
  values: Float32Array;
  patches: WireframeContactPatch[];
  stats: FieldProbeStats;
  fieldThreshold: number;
  gradientThreshold: number;
  meta: {
    geometrySource?: string;
    basisApplied?: HullBasisResolved;
    meshHash?: string;
    cache?: { hit?: boolean; key?: string; ageMs?: number };
    previewUpdatedAt?: number | null;
    clampReasons?: string[];
  };
  updatedAt: number;
};

const CACHE_TTL_MS = 1200;
const probeCache = new Map<string, FieldProbeResult>();

const finite = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizePatches = (raw: any): WireframeContactPatch[] => {
  if (!Array.isArray(raw)) return [];
  const patches: WireframeContactPatch[] = [];
  for (const p of raw) {
    const sector = Number((p as any)?.sector);
    if (!Number.isFinite(sector)) continue;
    patches.push({
      sector,
      gateAvg: Number((p as any)?.gateAvg ?? (p as any)?.avg ?? 0),
      gateMin: Number((p as any)?.gateMin ?? (p as any)?.min ?? 0),
      gateMax: Number((p as any)?.gateMax ?? (p as any)?.max ?? 0),
      count: Math.max(0, Math.floor(Number((p as any)?.count ?? 0))),
      blanketAvg: Number.isFinite((p as any)?.blanketAvg) ? Number((p as any)?.blanketAvg) : undefined,
      blanketMin: Number.isFinite((p as any)?.blanketMin) ? Number((p as any)?.blanketMin) : undefined,
      blanketMax: Number.isFinite((p as any)?.blanketMax) ? Number((p as any)?.blanketMax) : undefined,
    });
  }
  return patches;
};

const buildPreviewStub = (preview?: HullPreviewPayload | null) => {
  if (!preview) return undefined;
  return {
    version: preview.version,
    meshHash: preview.meshHash ?? preview.mesh?.meshHash,
    basis: preview.mesh?.basis ?? preview.basis,
    obb: preview.mesh?.obb ?? preview.obb,
    targetDims: preview.targetDims,
    hullMetrics: preview.hullMetrics,
    scale: preview.scale,
    updatedAt: preview.updatedAt,
    clampReasons: preview.clampReasons,
    provenance: preview.provenance,
    mesh: preview.mesh
      ? {
          meshHash: preview.mesh.meshHash,
          basis: preview.mesh.basis,
          obb: preview.mesh.obb,
          clampReasons: preview.mesh.clampReasons,
        }
      : undefined,
  };
};

const safeSeq = (snapshot: any): string => {
  const candidates = [
    (snapshot as any)?.seq,
    (snapshot as any)?.__ts,
    (snapshot as any)?.__tick,
    (snapshot as any)?.timestamp,
  ];
  const found = candidates.find((v) => Number.isFinite(v));
  return found !== undefined ? String(found) : "na";
};

export function useFieldProbe({
  overlay,
  preview,
  pipeline,
  enabled,
  fieldThreshold = 0.4,
  gradientThreshold = 0.22,
}: {
  overlay: WireframeOverlayBuffers | null;
  preview?: HullPreviewPayload | null;
  pipeline?: any;
  enabled?: boolean;
  fieldThreshold?: number;
  gradientThreshold?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FieldProbeResult | null>(null);

  const totals = useMemo(() => {
    const total = Math.max(
      1,
      Math.floor(
        Number((pipeline as any)?.sectorCount ?? (pipeline as any)?.totalSectors ?? (pipeline as any)?.sectors ?? 16),
      ),
    );
    const live = Math.max(
      1,
      Math.min(
        total,
        Math.floor(
          Number(
            (pipeline as any)?.concurrentSectors ??
              (pipeline as any)?.sectorsConcurrent ??
              (pipeline as any)?.liveSectors ??
              (pipeline as any)?.sectorsLive ??
              total,
          ),
        ),
      ),
    );
    return { total, live };
  }, [pipeline]);

  const cacheKey = useMemo(() => {
    if (!enabled || !overlay) return null;
    return [
      "probe",
      overlay.key,
      overlay.meshHash ?? "none",
      totals.total,
      totals.live,
      fieldThreshold.toFixed(3),
      gradientThreshold.toFixed(3),
      safeSeq(pipeline),
    ].join("|");
  }, [enabled, overlay, totals.total, totals.live, fieldThreshold, gradientThreshold, pipeline]);

  useEffect(() => {
    if (!cacheKey || !overlay || !enabled) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = probeCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
      setResult(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const body = {
      preview: buildPreviewStub(preview),
      overlay: {
        positions: Array.from(overlay.positions),
        meshHash: overlay.meshHash,
        lod: overlay.lod,
        aligned: true,
      },
      params: {
        totalSectors: totals.total,
        liveSectors: totals.live,
        fieldThreshold,
        gradientThreshold,
      },
    };

    const run = async () => {
      try {
        const res = await fetch("/api/helix/field-probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const values = Array.isArray(json?.values) ? Float32Array.from(json.values as number[]) : new Float32Array(0);
        const statsRaw = (json as any)?.stats ?? {};
        const stats: FieldProbeStats = {
          min: finite(statsRaw.min),
          max: finite(statsRaw.max),
          mean: finite(statsRaw.mean),
          absMax: finite(statsRaw.absMax),
          absMean: finite(statsRaw.absMean),
        };
        const next: FieldProbeResult = {
          values,
          patches: normalizePatches((json as any)?.patches),
          stats,
          fieldThreshold: Number((json as any)?.fieldThreshold) || fieldThreshold,
          gradientThreshold: Number((json as any)?.gradientThreshold) || gradientThreshold,
          meta: {
            geometrySource: (json as any)?.geometrySource,
            basisApplied: (json as any)?.basisApplied,
            meshHash: (json as any)?.meshHash,
            cache: (json as any)?.cache,
            previewUpdatedAt: (json as any)?.previewUpdatedAt,
            clampReasons: Array.isArray((json as any)?.clampReasons) ? (json as any)?.clampReasons : undefined,
          },
          updatedAt: Date.now(),
        };
        probeCache.set(cacheKey, next);
        setResult(next);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Field probe failed";
        setError(msg);
        setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [
    cacheKey,
    enabled,
    fieldThreshold,
    gradientThreshold,
    overlay,
    pipeline,
    preview,
    totals.live,
    totals.total,
  ]);

  return { result, loading, error };
}
