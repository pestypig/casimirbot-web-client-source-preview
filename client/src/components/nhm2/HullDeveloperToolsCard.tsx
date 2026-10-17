import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useEnergyPipeline, useUpdatePipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useHullPreviewPayload } from "@/hooks/use-hull-preview-payload";
import { loadHullMetricsFromGLB } from "@/lib/hull-metrics";
import { clampHullArea, clampHullDims, clampHullThickness, HULL_DIM_MIN_M } from "@/lib/hull-guardrails";

type HullDims = { Lx_m: number; Ly_m: number; Lz_m: number; wallThickness_m?: number };
type HullLibraryEntry = {
  id: string;
  name: string;
  hull: HullDims;
  hullAreaOverride_m2?: number;
  hullAreaOverride_uncertainty_m2?: number;
  hullAreaPerSector_m2?: number[];
  sectorCount?: number;
  glbUrl?: string;
  note?: string;
  source?: "preset" | "silhouette" | "glb";
};

const LIBRARY_KEY = "hullLibrary";
const NEEDLE_PRESET: HullLibraryEntry = {
  id: "preset-needle-mk1",
  name: "Needle Hull (Mk1)",
  hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
  source: "preset",
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

function normalizeDims(raw: unknown): HullDims | null {
  if (!raw || typeof raw !== "object") return null;
  const dims = raw as Partial<HullDims>;
  const clamped = clampHullDims(dims);
  if (clamped.Lx_m == null || clamped.Ly_m == null || clamped.Lz_m == null) return null;
  return {
    Lx_m: clamped.Lx_m,
    Ly_m: clamped.Ly_m,
    Lz_m: clamped.Lz_m,
    wallThickness_m: clampHullThickness(dims.wallThickness_m),
  };
}

function normalizeEntry(raw: unknown): HullLibraryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<HullLibraryEntry>;
  const hull = normalizeDims(entry.hull);
  if (!hull) return null;
  const areaPerSector = Array.isArray(entry.hullAreaPerSector_m2)
    ? entry.hullAreaPerSector_m2.map((area) => clampHullArea(area, true) ?? 0)
    : undefined;
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : nanoid(10),
    name: typeof entry.name === "string" && entry.name ? entry.name : "Saved hull",
    hull,
    hullAreaOverride_m2: clampHullArea(entry.hullAreaOverride_m2),
    hullAreaOverride_uncertainty_m2: clampHullArea(entry.hullAreaOverride_uncertainty_m2, true),
    hullAreaPerSector_m2: areaPerSector,
    sectorCount: finite(entry.sectorCount),
    glbUrl: typeof entry.glbUrl === "string" ? entry.glbUrl : undefined,
    note: typeof entry.note === "string" ? entry.note : undefined,
    source: entry.source === "preset" || entry.source === "silhouette" || entry.source === "glb"
      ? entry.source : undefined,
  };
}

function readLibrary(): HullLibraryEntry[] {
  if (typeof window === "undefined") return [NEEDLE_PRESET];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(parsed)
      ? parsed.map(normalizeEntry).filter((entry): entry is HullLibraryEntry => entry != null)
      : [];
    return entries.some((entry) => entry.id === NEEDLE_PRESET.id)
      ? entries : [NEEDLE_PRESET, ...entries];
  } catch {
    return [NEEDLE_PRESET];
  }
}

function buildHullPayload(entry: HullLibraryEntry, wallThickness: number | undefined) {
  const raw = entry.hull;
  const hull = normalizeDims(raw) ?? {
    Lx_m: HULL_DIM_MIN_M, Ly_m: HULL_DIM_MIN_M, Lz_m: HULL_DIM_MIN_M,
  };
  const thickness = clampHullThickness(wallThickness ?? raw.wallThickness_m);
  const area = clampHullArea(entry.hullAreaOverride_m2);
  const uncertainty = clampHullArea(entry.hullAreaOverride_uncertainty_m2, true);
  const sectorAreas = entry.hullAreaPerSector_m2?.map((value) => clampHullArea(value, true) ?? 0);
  const payload = {
    hull: {
      Lx_m: hull.Lx_m,
      Ly_m: hull.Ly_m,
      Lz_m: hull.Lz_m,
      a: hull.Lx_m * 0.5,
      b: hull.Ly_m * 0.5,
      c: hull.Lz_m * 0.5,
      ...(thickness != null ? { wallThickness_m: thickness } : {}),
    },
    ...(area != null ? { hullAreaOverride_m2: area } : {}),
    ...(uncertainty != null ? { hullAreaOverride_uncertainty_m2: uncertainty } : {}),
    ...(sectorAreas?.some((value) => value > 0) ? { hullAreaPerSector_m2: sectorAreas } : {}),
  };
  const warnings: string[] = [];
  for (const axis of ["Lx_m", "Ly_m", "Lz_m"] as const) {
    if (raw[axis] !== hull[axis]) warnings.push(`${axis} clamped to ${hull[axis]} m`);
  }
  if (wallThickness != null && thickness !== wallThickness) warnings.push("wall thickness clamped");
  if (entry.hullAreaOverride_m2 != null && area !== entry.hullAreaOverride_m2) warnings.push("area clamped");
  return { payload, warnings };
}

const format = (value: number | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);

export default function HullDeveloperToolsCard({ onOpenEditor }: { onOpenEditor: () => void }) {
  const preview = useHullPreviewPayload();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 5000 });
  const updatePipeline = useUpdatePipeline();
  const [library, setLibrary] = useState(readLibrary);
  const [glbUrlInput, setGlbUrlInput] = useState("");
  const [measuredEntry, setMeasuredEntry] = useState<HullLibraryEntry | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch {
      setStatus("Local hull library could not be saved in this browser.");
    }
  }, [library]);

  const previewEntry = useMemo(() => {
    const metrics = preview?.hullMetrics;
    const hull = normalizeDims(metrics?.dims_m ?? preview?.targetDims);
    if (!hull) return null;
    return normalizeEntry({
      id: "current-preview",
      name: "Current Model Silhouette preview",
      hull,
      hullAreaOverride_m2: metrics?.area_m2 ?? preview?.area_m2,
      hullAreaOverride_uncertainty_m2: metrics?.areaUnc_m2 ?? preview?.areaUnc_m2,
      glbUrl: preview?.glbUrl,
      source: "silhouette",
    });
  }, [preview]);

  const addToLibrary = (entry: HullLibraryEntry | null, name: string) => {
    if (!entry) return;
    setLibrary((current) => [{ ...entry, id: nanoid(10), name }, ...current]);
    setStatus(`${name} saved locally. No pipeline update was made.`);
  };

  const measureUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setMeasuring(true);
    setStatus(null);
    try {
      const metrics = await loadHullMetricsFromGLB(trimmed, {
        sectorCount: typeof pipeline?.sectorCount === "number" ? Math.max(1, Math.floor(pipeline.sectorCount)) : 400,
      });
      const entry = normalizeEntry({
        id: "measured-glb",
        name: "Measured GLB",
        hull: metrics.dims_m,
        hullAreaOverride_m2: metrics.area_m2,
        hullAreaOverride_uncertainty_m2: metrics.areaUnc_m2,
        hullAreaPerSector_m2: metrics.areaPerSector_m2,
        sectorCount: metrics.sectorCount,
        glbUrl: trimmed,
        source: "glb",
      });
      setMeasuredEntry(entry);
      setStatus(entry ? `Measured ${metrics.triangleCount} triangles; preview only.` : "GLB metrics were invalid.");
    } catch (error) {
      setStatus(`GLB measurement failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMeasuring(false);
    }
  };

  const apply = async (entry: HullLibraryEntry) => {
    const { payload, warnings } = buildHullPayload(entry, finite(pipeline?.hull?.wallThickness_m));
    setStatus(`Applying ${entry.name} to the live pipeline...`);
    try {
      const result = await updatePipeline.mutateAsync(payload as Partial<EnergyPipelineState>);
      const area = clampHullArea(finite(result?.hullArea_m2)) ?? payload.hullAreaOverride_m2;
      const source = typeof result?.__hullAreaSource === "string" ? result.__hullAreaSource : "unreported";
      setStatus(`Applied to live pipeline. Area ${format(area)} m² (${source}).${warnings.length ? ` ${warnings.join("; ")}.` : ""}`);
    } catch (error) {
      setStatus(`Pipeline update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="space-y-4 text-sm text-slate-100">
      <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
        Hull measurements and local presets are developer geometry inputs. Applying one updates the live pipeline's
        ellipsoid surrogate and area override; it does not change the selected NHM2 solve or prove a warp source.
      </p>
      <div className="rounded border border-slate-700 p-3">
        <h3 className="font-semibold">Model Silhouette preview</h3>
        <p className="text-xs text-slate-400">Upload, basis, scale, and fit controls remain in the on-demand Model Silhouette editor.</p>
        <button className="mt-2 rounded border border-slate-500 px-3 py-1 text-xs" onClick={onOpenEditor}>
          Open Model Silhouette editor
        </button>
        <p className="mt-2 text-xs">GLB: {preview?.glbUrl ?? "none"}</p>
        <p className="text-xs">Mesh hash: {preview?.meshHash ?? "none"}</p>
        <p className="text-xs">Target: {preview?.targetDims ? `${format(preview.targetDims.Lx_m)} × ${format(preview.targetDims.Ly_m)} × ${format(preview.targetDims.Lz_m)} m` : "none"}</p>
        <p className="text-xs">Dimensions used by Apply: {previewEntry ? `${format(previewEntry.hull.Lx_m)} × ${format(previewEntry.hull.Ly_m)} × ${format(previewEntry.hull.Lz_m)} m` : "none"} ({preview?.hullMetrics ? "GLB metrics" : "preview target"})</p>
        <p className="text-xs">Measured area: {format(previewEntry?.hullAreaOverride_m2)} m²; uncertainty: {format(previewEntry?.hullAreaOverride_uncertainty_m2)} m²</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded border border-slate-500 px-3 py-1" disabled={!preview?.targetDims}
            onClick={() => addToLibrary(normalizeEntry({ id: "preview-target", name: "Silhouette target", hull: preview?.targetDims, source: "silhouette" }), `Silhouette target ${new Date().toISOString()}`)}>
            Save target
          </button>
          <button className="rounded border border-slate-500 px-3 py-1" disabled={!previewEntry}
            onClick={() => addToLibrary(previewEntry, `GLB hull ${new Date().toISOString()}`)}>
            Save current preview
          </button>
          <button className="rounded border border-emerald-500 px-3 py-1 text-emerald-200" disabled={!previewEntry || updatePipeline.isPending}
            onClick={() => previewEntry && void apply(previewEntry)}>
            Apply current preview to live pipeline
          </button>
        </div>
      </div>
      <div className="rounded border border-slate-700 p-3">
        <h3 className="font-semibold">Measure a GLB URL</h3>
        <p className="text-xs text-slate-400">Direct measurement uses the file's native units and axes. Use Model Silhouette for scale, basis, and fit adjustments.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="min-w-64 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1" value={glbUrlInput}
            onChange={(event) => setGlbUrlInput(event.target.value)} placeholder="/path/to/hull.glb" />
          <button className="rounded border border-slate-500 px-3 py-1" disabled={measuring || !glbUrlInput.trim()}
            onClick={() => void measureUrl(glbUrlInput)}>{measuring ? "Measuring..." : "Measure"}</button>
        </div>
        {measuredEntry ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>{format(measuredEntry.hull.Lx_m)} × {format(measuredEntry.hull.Ly_m)} × {format(measuredEntry.hull.Lz_m)} m; area {format(measuredEntry.hullAreaOverride_m2)} m²</span>
          <button className="rounded border border-slate-500 px-2 py-1" onClick={() => addToLibrary(measuredEntry, `GLB hull ${new Date().toISOString()}`)}>Save</button>
          <button className="rounded border border-emerald-500 px-2 py-1 text-emerald-200" disabled={updatePipeline.isPending}
            onClick={() => void apply(measuredEntry)}>Apply to live pipeline</button>
          <button className="rounded border border-slate-500 px-2 py-1" onClick={() => setMeasuredEntry(null)}>Use current preview</button>
        </div> : null}
      </div>
      <div className="rounded border border-slate-700 p-3">
        <h3 className="font-semibold">Local hull library</h3>
        <p className="text-xs text-slate-400">Existing Phoenix library entries use the same local storage key. The Needle preset is illustrative.</p>
        <div className="mt-2 max-h-64 space-y-2 overflow-auto">
          {library.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2 text-xs">
            <span>{entry.name} · {format(entry.hull.Lx_m)} × {format(entry.hull.Ly_m)} × {format(entry.hull.Lz_m)} m · area {format(entry.hullAreaOverride_m2)} m²</span>
            <span className="flex gap-2">
              {entry.glbUrl ? <button className="rounded border border-slate-500 px-2 py-1" disabled={measuring}
                onClick={() => { setGlbUrlInput(entry.glbUrl ?? ""); void measureUrl(entry.glbUrl ?? ""); }}>Remeasure GLB</button> : null}
              <button className="rounded border border-emerald-500 px-2 py-1 text-emerald-200" disabled={updatePipeline.isPending}
                onClick={() => void apply(entry)}>Apply</button>
            </span>
          </div>)}
        </div>
      </div>
      <p className="text-xs text-slate-400">Live pipeline area: {format(finite(pipeline?.hullArea_m2))} m² ({pipeline?.__hullAreaSource ?? "unreported"}).</p>
      {status ? <p role="status" className="rounded border border-slate-700 p-2 text-xs">{status}</p> : null}
    </div>
  );
}
