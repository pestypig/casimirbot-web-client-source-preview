import * as React from "react";
import { clampHullDims } from "@/lib/hull-guardrails";
import { hullPreviewPayloadSchema, type HullPreviewPayload, type HullPreviewMetrics } from "@shared/schema";

export const HULL_PREVIEW_STORAGE_KEY = "phoenixHullPreview";
const PREVIEW_EVENT_NAME = "phoenix-hull-preview";
const DEFAULT_PREVIEW_GLB_URL = "/luma/Butler.glb";

const toFinite = (value: unknown): number | undefined => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

function normalizeDims(raw: any): HullPreviewPayload["targetDims"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = {
    Lx_m: toFinite((raw as any).Lx_m ?? (raw as any).x),
    Ly_m: toFinite((raw as any).Ly_m ?? (raw as any).y),
    Lz_m: toFinite((raw as any).Lz_m ?? (raw as any).z),
  };
  const clamped = clampHullDims(candidate);
  if (clamped.Lx_m && clamped.Ly_m && clamped.Lz_m) {
    return { Lx_m: clamped.Lx_m, Ly_m: clamped.Ly_m, Lz_m: clamped.Lz_m };
  }
  return undefined;
}

function normalizeScale(raw: unknown): [number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 3) return undefined;
  const values = raw.slice(0, 3).map((v) => toFinite(v) ?? 1);
  if (values.some((v) => !Number.isFinite(v))) return undefined;
  return [values[0], values[1], values[2]];
}

function normalizeHullMetrics(raw: any): HullPreviewMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const dims = normalizeDims((raw as any).dims_m);
  if (!dims) return null;
  return {
    ...raw,
    dims_m: dims,
  } as HullPreviewMetrics;
}

function parsePayload(raw: string | null): HullPreviewPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    const updatedAt =
      typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();
    const glbUrl = typeof parsed?.glbUrl === "string" ? parsed.glbUrl : undefined;
    const scale = normalizeScale(parsed?.scale);
    const targetDims = normalizeDims(parsed?.targetDims ?? parsed?.dims ?? parsed?.obb ?? parsed?.hull);
    const hullMetrics = normalizeHullMetrics(parsed?.hullMetrics);
    const area_m2 = toFinite(parsed?.area_m2);
    const areaUnc_m2 = toFinite(parsed?.areaUnc_m2);
    const candidate = {
      ...parsed,
      glbUrl,
      scale,
      targetDims,
      hullMetrics,
      area_m2,
      areaUnc_m2,
      updatedAt,
    };
    const result = hullPreviewPayloadSchema.safeParse(candidate);
    if (result.success) {
      return result.data;
    }
    console.warn("[useHullPreviewPayload] failed schema validation", result.error);
    return null;
  } catch (err) {
    console.warn("[useHullPreviewPayload] failed to parse preview payload", err);
    return null;
  }
}

function ensureDefaultPreviewPayload(): HullPreviewPayload | null {
  if (typeof window === "undefined") return null;
  const existing = parsePayload(window.localStorage.getItem(HULL_PREVIEW_STORAGE_KEY));
  if (existing?.glbUrl) return existing;
  const payload: HullPreviewPayload = {
    ...(existing ?? {}),
    version: existing?.version ?? "v1",
    glbUrl: DEFAULT_PREVIEW_GLB_URL,
    provenance: existing?.provenance ?? "preview",
    updatedAt: Number.isFinite(existing?.updatedAt as number) ? (existing?.updatedAt as number) : Date.now(),
  };
  try {
    window.localStorage.setItem(HULL_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT_NAME));
  } catch (err) {
    console.warn("[useHullPreviewPayload] failed to seed default preview payload", err);
  }
  return payload;
}

export function useHullPreviewPayload() {
  const [payload, setPayload] = React.useState<HullPreviewPayload | null>(null);
  const lastTsRef = React.useRef<number>(0);

  const refresh = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const next = ensureDefaultPreviewPayload();
    if (!next) return;
    const updatedAt = Number(next.updatedAt ?? 0);
    if (!Number.isFinite(updatedAt) || updatedAt <= lastTsRef.current) return;
    lastTsRef.current = updatedAt;
    setPayload(next);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    refresh();
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    window.addEventListener(PREVIEW_EVENT_NAME, handler as any);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(PREVIEW_EVENT_NAME, handler as any);
    };
  }, [refresh]);

  return payload;
}
