import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useFieldProbe } from "@/hooks/use-field-probe";
import { useHullPreviewPayload } from "@/hooks/use-hull-preview-payload";
import { resolveHullDimsEffective } from "@/lib/resolve-hull-dims";
import {
  colorizeFieldProbe,
  colorizeWireframeOverlay,
  resolveWireframeOverlay,
  type WireframeOverlayResult,
} from "@/lib/resolve-wireframe-overlay";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Group, Object3D } from "three";
import { Box3, BufferAttribute, BufferGeometry, Color, MeshBasicMaterial, MeshStandardMaterial, Sphere, Vector3 } from "three";
import { Gauge, Info, Loader2, Radar, Scan, Sparkles } from "lucide-react";

type Bounds = { size: Vector3; center: Vector3; radius: number };

type GeometrySample = {
  count: number;
  rhoRange?: [number, number];
  dispRange?: [number, number];
  geometryKind?: string;
  geometrySource?: string;
  basisApplied?: any;
  meshHash?: string;
  clampReasons?: string[];
  hullDims?: { Lx_m?: number; Ly_m?: number; Lz_m?: number };
  sampleHull?: { Lx_m?: number; Ly_m?: number; Lz_m?: number };
  cacheHit?: boolean;
  previewUpdatedAt?: number | null;
  ts: number;
};

const DEFAULT_MODEL = "/luma/Butler.glb";

function computeBounds(object: Object3D | null): Bounds | null {
  if (!object) return null;
  const box = new Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return null;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = sphere?.radius ?? size.length() * 0.5;
  return { size, center, radius };
}

function FitCamera({
  center,
  radius,
  orbitRef,
}: {
  center: Vector3 | null;
  radius: number | null;
  orbitRef: React.RefObject<any>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!center || !radius) return;
    const dist = Math.max(4, radius * 2.4);
    camera.position.set(center.x + dist, center.y + dist * 0.35, center.z + dist);
    camera.near = Math.max(0.01, dist * 0.001);
    camera.far = Math.max(camera.near + 10, dist * 6);
    camera.updateProjectionMatrix();
    if (orbitRef.current) {
      orbitRef.current.target.set(center.x, center.y, center.z);
      orbitRef.current.update();
    }
  }, [camera, center?.x, center?.y, center?.z, radius, orbitRef]);

  return null;
}

function HullScene({
  model,
  bounds,
  scale,
  hullDims,
  showNatario,
  showAlcubierre,
  showWireframe,
  wireframeGeometry,
  wireframeColor,
  wireframeAlpha,
  wireframeWidth,
}: {
  model: Group | null;
  bounds: Bounds | null;
  scale: [number, number, number];
  hullDims: { Lx_m: number; Ly_m: number; Lz_m: number } | null;
  showNatario: boolean;
  showAlcubierre: boolean;
  showWireframe: boolean;
  wireframeGeometry: BufferGeometry | null;
  wireframeColor?: [number, number, number] | string;
  wireframeAlpha?: number;
  wireframeWidth?: number;
}) {
  const orbitRef = useRef<any>(null);
  const scaleVec = useMemo(() => new Vector3(...scale), [scale]);
  const wireColor = useMemo(() => {
    if (Array.isArray(wireframeColor)) {
      return new Color().setRGB(wireframeColor[0] ?? 0.13, wireframeColor[1] ?? 0.83, wireframeColor[2] ?? 0.62);
    }
    return new Color(wireframeColor ?? "#22c55e");
  }, [wireframeColor]);
  const hasVertexColors = useMemo(
    () => Boolean(wireframeGeometry?.getAttribute?.("color")),
    [wireframeGeometry],
  );

  const shadedModel = useMemo(() => {
    if (!model) return null;
    const clone = model.clone(true);
    clone.traverse((node: any) => {
      if (node?.isMesh) {
        node.material = new MeshStandardMaterial({
          color: new Color("#111827"),
          metalness: 0.1,
          roughness: 0.65,
          opacity: 0.95,
          transparent: true,
        });
      }
    });
    return clone;
  }, [model]);

  const wireframeModel = useMemo(() => {
    if (!model) return null;
    const clone = model.clone(true);
    clone.traverse((node: any) => {
      if (node?.isMesh) {
        node.material = new MeshBasicMaterial({
          color: "#22c55e",
          wireframe: true,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
      }
    });
    return clone;
  }, [model]);

  const scaledSize = useMemo(() => (bounds ? bounds.size.clone().multiply(scaleVec) : null), [bounds, scaleVec]);
  const scaledCenter = useMemo(
    () => (bounds ? new Vector3(bounds.center.x * scale[0], bounds.center.y * scale[1], bounds.center.z * scale[2]) : null),
    [bounds, scale],
  );
  const fitRadius = useMemo(() => (bounds ? bounds.radius * Math.max(...scale) : null), [bounds, scale]);
  const hullScale = useMemo(
    () => (hullDims ? [hullDims.Lx_m, hullDims.Ly_m, hullDims.Lz_m] as [number, number, number] : null),
    [hullDims],
  );

  const gridSize = useMemo(() => Math.max(6, (scaledSize?.length() ?? 6) * 1.6), [scaledSize]);
  const gridY = useMemo(() => (scaledCenter && scaledSize ? scaledCenter.y - scaledSize.y / 2 : 0), [scaledCenter, scaledSize]);

  return (
    <>
      <color attach="background" args={["#060915"]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 7, 6]} intensity={1.05} color={new Color("#93c5fd")} />
      <directionalLight position={[-6, 5, -6]} intensity={0.6} color={new Color("#34d399")} />
      <pointLight position={[0, 4, 0]} intensity={0.6} color={new Color("#22d3ee")} />

      {shadedModel ? <group scale={scale} dispose={null}><primitive object={shadedModel} /></group> : null}
      {showWireframe && wireframeGeometry ? (
        <lineSegments geometry={wireframeGeometry} renderOrder={2}>
          <lineBasicMaterial
            color={hasVertexColors ? "#ffffff" : wireColor}
            vertexColors={hasVertexColors}
            transparent
            opacity={wireframeAlpha ?? 0.75}
            linewidth={Math.max(1, Math.min(4, wireframeWidth ?? 1))}
            depthTest
            depthWrite={false}
          />
        </lineSegments>
      ) : null}
      {showWireframe && !wireframeGeometry && wireframeModel ? (
        <group scale={scale} dispose={null}>
          <primitive object={wireframeModel} />
        </group>
      ) : null}

      {!shadedModel && hullScale ? (
        <mesh scale={hullScale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#111827" metalness={0.05} roughness={0.75} />
        </mesh>
      ) : null}

      {showNatario && hullScale ? (
        <mesh scale={[hullScale[0] * 0.55, hullScale[1] * 0.55, hullScale[2] * 0.55]}>
          <sphereGeometry args={[0.5, 28, 20]} />
          <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.7} />
        </mesh>
      ) : null}

      {showAlcubierre && hullScale ? (
        <mesh scale={[hullScale[0] * 0.62, hullScale[1] * 0.62, hullScale[2] * 0.62]}>
          <sphereGeometry args={[0.55, 28, 20]} />
          <meshStandardMaterial color="#7c3aed" transparent opacity={0.12} emissive="#a855f7" emissiveIntensity={0.25} />
        </mesh>
      ) : null}

      <gridHelper args={[gridSize, Math.max(6, Math.ceil(gridSize / 4)), "#1f2937", "#334155"]} position={[0, gridY, 0]} />
      <axesHelper args={[Math.max(2, gridSize * 0.35)]} position={scaledCenter ? [scaledCenter.x, gridY, scaledCenter.z] : [0, gridY, 0]} />

      <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08} />
      <FitCamera center={scaledCenter ?? bounds?.center ?? null} radius={fitRadius ?? bounds?.radius ?? null} orbitRef={orbitRef} />
    </>
  );
}

const toFinite = (value: unknown): number | undefined => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const fmtMeters = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "-";
  const v = value as number;
  return Math.abs(v) >= 1 ? `${v.toFixed(2)} m` : `${v.toExponential(2)} m`;
};

const fmtArea = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return "-";
  const v = value as number;
  return `${v.toFixed(2)} m^2`;
};

const fmtNumber = (value?: number | null, digits = 3) => {
  if (!Number.isFinite(value as number)) return "-";
  return (value as number).toFixed(digits);
};

const sampleRange = (arr: any): [number, number] | undefined => {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const limit = Math.min(arr.length, 2000);
  for (let i = 0; i < limit; i++) {
    const n = Number(arr[i]);
    if (!Number.isFinite(n)) continue;
    lo = Math.min(lo, n);
    hi = Math.max(hi, n);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  return [lo, hi];
};

export default function HullMetricsVisPanel() {
  const hullPreview = useHullPreviewPayload();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1000 });

  const [model, setModel] = useState<Group | null>(null);
  const [baseBounds, setBaseBounds] = useState<Bounds | null>(null);
  const [modelName, setModelName] = useState<string>("Hull preview");
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNatario, setShowNatario] = useState(true);
  const [showAlcubierre, setShowAlcubierre] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [wireframeLod, setWireframeLod] = useState<"preview" | "high">("preview");
  const [useFieldProbeColors, setUseFieldProbeColors] = useState(false);

  const [geometryEnabled, setGeometryEnabled] = useState(false);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometrySample, setGeometrySample] = useState<GeometrySample | null>(null);

  const hullDimsResolved = useMemo(
    () => resolveHullDimsEffective({ previewPayload: hullPreview, pipelineSnapshot: pipeline as any }),
    [hullPreview, pipeline],
  );
  const hullDims = hullDimsResolved
    ? { Lx_m: hullDimsResolved.Lx_m, Ly_m: hullDimsResolved.Ly_m, Lz_m: hullDimsResolved.Lz_m }
    : null;

  const hullArea = useMemo(
    () =>
      hullPreview?.hullMetrics?.area_m2 ??
      hullPreview?.area_m2 ??
      toFinite((pipeline as any)?.hullArea_m2 ?? (pipeline as any)?.tiles?.hullArea_m2),
    [hullPreview?.hullMetrics?.area_m2, hullPreview?.area_m2, pipeline],
  );

  const previewScale = useMemo(() => {
    const raw = hullPreview?.scale;
    if (Array.isArray(raw) && raw.length >= 3) {
      const nums = raw.slice(0, 3).map((v) => (Number.isFinite(v) ? (v as number) : 1));
      return nums as [number, number, number];
    }
    return [1, 1, 1] as [number, number, number];
  }, [hullPreview?.scale]);
  const wireframeOverlay = useMemo<WireframeOverlayResult>(() => {
    const targetDims = hullDims
      ? { Lx_m: hullDims.Lx_m, Ly_m: hullDims.Ly_m, Lz_m: hullDims.Lz_m }
      : null;
    return resolveWireframeOverlay(hullPreview, {
      lod: wireframeLod,
      targetDims,
      maxPreviewTriangles: 25000,
      maxHighTriangles: 90000,
      maxEdges: 180000,
    });
  }, [hullPreview, wireframeLod, hullDims]);
  const wireframeClampLabel = useMemo(() => {
    if (!wireframeOverlay.clampReasons.length) return null;
    const labels = wireframeOverlay.clampReasons.map((reason) => {
      if (reason === "overlay:missingMesh") return "Preview mesh missing";
      if (reason === "overlay:missingLod") return "LOD unavailable";
      if (reason === "overlay:missingGeometry") return "Indexed geometry missing";
      if (reason === "overlay:overBudget") return "LOD over budget";
      if (reason === "overlay:decimationOverBudget") return "Decimation over budget";
      if (reason === "overlay:payloadTooLarge") return "Upload size clamped";
      if (reason === "overlay:lineWidthClamped") return "Line width capped";
      if (reason === "overlay:indicesMissing") return "No indices (fallback)";
      return reason;
    });
    return labels.join(", ");
  }, [wireframeOverlay.clampReasons]);
  const { result: fieldProbe, loading: fieldProbeLoading } = useFieldProbe({
    overlay: wireframeOverlay.overlay,
    preview: hullPreview,
    pipeline,
    enabled: showWireframe && useFieldProbeColors && !!wireframeOverlay.overlay,
  });
  const wireframeColors = useMemo(() => {
    if (!wireframeOverlay.overlay || !showWireframe) return null;
    if (useFieldProbeColors && fieldProbe?.values?.length) {
      const { colors } = colorizeFieldProbe(fieldProbe.values, { absMax: fieldProbe.stats?.absMax });
      return colors;
    }
    const sectorTotal = Math.max(
      1,
      toFinite((pipeline as any)?.sectorCount ?? (pipeline as any)?.totalSectors ?? 16) ?? 16,
    );
    const live = Math.max(1, Math.min(sectorTotal, Math.round(
      Number((pipeline as any)?.sectorsConcurrent ?? (pipeline as any)?.liveSectors ?? sectorTotal)
    )));
    const duty = Number((pipeline as any)?.dutyCycle ?? (pipeline as any)?.duty ?? 0.25);
    const tilesVec = (pipeline as any)?.tiles?.perSector ?? (pipeline as any)?.tilesPerSectorVector;
    const { colors } = colorizeWireframeOverlay(wireframeOverlay.overlay, {
      totalSectors: sectorTotal,
      liveSectors: live,
      sectorCenter01: 0.5,
      gaussianSigma: 0.35 / sectorTotal,
      sectorFloor: 0.08,
      lumpExp: 1.1,
      duty: Number.isFinite(duty) ? duty : 0.25,
      gateView: 1,
      syncMode: 1,
      tilesPerSectorVector: tilesVec,
    });
    return colors;
  }, [wireframeOverlay.overlay, showWireframe, pipeline, useFieldProbeColors, fieldProbe?.values, fieldProbe?.stats?.absMax]);

  const wireframeGeometry = useMemo(() => {
    if (!wireframeOverlay.overlay || !showWireframe) return null;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(wireframeOverlay.overlay.positions, 3));
    if (wireframeColors && wireframeColors.length === wireframeOverlay.overlay.positions.length) {
      geo.setAttribute("color", new BufferAttribute(wireframeColors, 3));
    }
    return geo;
  }, [wireframeOverlay.overlay, showWireframe, wireframeColors]);
  useEffect(() => () => wireframeGeometry?.dispose(), [wireframeGeometry]);

  const natarioMetrics = useMemo(() => {
    const nat = (pipeline as any)?.natario ?? {};
    return {
      shift: toFinite(nat?.shiftVectorField?.amplitude ?? nat?.beta0 ?? nat?.beta),
      gammaGeo: toFinite((pipeline as any)?.gammaGeo ?? nat?.gammaGeo),
      gammaVdb: toFinite((pipeline as any)?.gammaVanDenBroeck ?? (pipeline as any)?.gammaVdB ?? nat?.gammaVanDenBroeck),
      qSpoil: toFinite((pipeline as any)?.qSpoilingFactor ?? (pipeline as any)?.q ?? nat?.q),
      tsRatio: toFinite((pipeline as any)?.TS_ratio ?? (pipeline as any)?.tsRatio),
      sectorCount: toFinite((pipeline as any)?.sectorCount ?? (pipeline as any)?.totalSectors),
    };
  }, [pipeline]);

  useEffect(() => {
    const url = hullPreview?.glbUrl || DEFAULT_MODEL;
    const label = url.split("/").pop() || "Hull preview";
    setModelName(label);
    setLoadingModel(true);
    setLoadError(null);
    const loader = new GLTFLoader();
    let cancelled = false;
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        setModel(gltf.scene);
        setBaseBounds(computeBounds(gltf.scene));
        setLoadingModel(false);
      },
      undefined,
      () => {
        if (cancelled) return;
        setModel(null);
        setBaseBounds(null);
        setLoadError("Could not load hull preview (GLB).");
        setLoadingModel(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hullPreview?.glbUrl]);

  const sampleGeometry = useCallback(async () => {
    setGeometryLoading(true);
    setGeometryError(null);
    try {
      const previewPayload = hullPreview
        ? {
            version: hullPreview.version,
            meshHash: hullPreview.meshHash ?? hullPreview.mesh?.meshHash,
            basis: hullPreview.mesh?.basis ?? hullPreview.basis,
            obb: hullPreview.mesh?.obb ?? hullPreview.obb,
            targetDims: hullPreview.targetDims,
            hullMetrics: hullPreview.hullMetrics,
            scale: hullPreview.scale,
            updatedAt: hullPreview.updatedAt,
            clampReasons: hullPreview.clampReasons,
            provenance: hullPreview.provenance,
            mesh: hullPreview.mesh
              ? {
                  meshHash: hullPreview.mesh.meshHash,
                  basis: hullPreview.mesh.basis,
                  obb: hullPreview.mesh.obb,
                  clampReasons: hullPreview.mesh.clampReasons,
                  provenance: hullPreview.mesh.provenance,
                }
              : undefined,
          }
        : undefined;
      const res = await fetch("/api/helix/field-geometry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometryKind: "ellipsoid", nTheta: 12, nPhi: 24, preview: previewPayload }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const sample: GeometrySample = {
        count: Number(json?.count) || 0,
        geometryKind: typeof json?.geometryKind === "string" ? json.geometryKind : "ellipsoid",
        geometrySource: typeof json?.geometrySource === "string" ? json.geometrySource : undefined,
        basisApplied: json?.basisApplied,
        meshHash: typeof json?.meshHash === "string" ? json.meshHash : undefined,
        clampReasons: Array.isArray(json?.clampReasons)
          ? (json.clampReasons as any[]).filter((c) => typeof c === "string")
          : undefined,
        hullDims: typeof json?.hullDims === "object" ? json.hullDims : undefined,
        sampleHull: typeof json?.sampleHull === "object" ? json.sampleHull : undefined,
        cacheHit: Boolean(json?.cache?.hit),
        previewUpdatedAt: typeof json?.previewUpdatedAt === "number" ? json.previewUpdatedAt : null,
        rhoRange: sampleRange(json?.data?.rho),
        dispRange: sampleRange(json?.data?.disp),
        ts: Date.now(),
      };
      setGeometrySample(sample);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sample geometry";
      setGeometryError(message);
    } finally {
      setGeometryLoading(false);
    }
  }, [hullPreview]);

  useEffect(() => {
    if (!geometryEnabled) return;
    sampleGeometry();
  }, [geometryEnabled, sampleGeometry]);

  const hullLabel =
    hullPreview?.glbUrl?.length && hullPreview.glbUrl !== DEFAULT_MODEL
      ? "External hull preview"
      : "Default hull preview";

  const hullDimsLabel = hullDims
    ? `${fmtMeters(hullDims.Lx_m)} x ${fmtMeters(hullDims.Ly_m)} x ${fmtMeters(hullDims.Lz_m)}`
    : "No hull dims yet";
  const hullDimsSourceLabel = hullDimsResolved?.source ?? null;

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-300">Helix start: hull metric vis</p>
          <h1 className="text-2xl font-semibold text-white">Hull Metrics Visualization</h1>
          <p className="text-sm text-slate-300">
            Read-only hull viewer that mirrors the shared Phoenix/Model silhouette payload, overlays Natario and Alcubierre shells, and
            surfaces live warp metrics without touching the pipeline.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-white/5 px-2 py-1">Local storage sync</span>
            <span className="rounded-full bg-white/5 px-2 py-1">Overlays: Natario + Alcubierre</span>
            <span className="rounded-full bg-white/5 px-2 py-1">Optional field-geometry sampler</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-xs">
          <Badge variant="outline" className="border-emerald-400/50 bg-emerald-400/10 text-emerald-100">
            {hullLabel}
          </Badge>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
              <Scan className="h-3.5 w-3.5" />
              Hull dims
            </div>
            <div className="text-sm font-semibold text-white">{hullDimsLabel}</div>
            {hullDimsSourceLabel ? (
              <div className="text-[11px] text-slate-500">Source: {hullDimsSourceLabel}</div>
            ) : null}
            {hullArea ? <div className="text-[11px] text-slate-400">Area {fmtArea(hullArea)}</div> : null}
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 px-5 py-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <Radar className="h-5 w-5 text-emerald-300" />
            Hull viewport
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <Badge className="border-white/10 bg-white/10 text-slate-100" variant="outline">
              {modelName}
            </Badge>
            <label className="flex items-center gap-1">
              <Switch checked={showWireframe} onCheckedChange={setShowWireframe} />
              <span>Wireframe</span>
            </label>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setWireframeLod("preview")}
                className={cn(
                  "rounded px-2 py-1",
                  wireframeLod === "preview" ? "bg-emerald-700 text-white" : "bg-slate-800 text-slate-200"
                )}
                title="Coarse LOD overlay; caps line width"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setWireframeLod("high")}
                className={cn(
                  "rounded px-2 py-1",
                  wireframeLod === "high" ? "bg-emerald-700 text-white" : "bg-slate-800 text-slate-200"
                )}
                title="Higher-detail overlay with clamped thickness"
              >
                High
              </button>
            </div>
            <label className="flex items-center gap-1">
              <Switch
                checked={useFieldProbeColors}
                onCheckedChange={setUseFieldProbeColors}
                disabled={!wireframeOverlay.overlay}
              />
              <span>Field probe</span>
            </label>
            {useFieldProbeColors && fieldProbeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
            ) : null}
            {wireframeOverlay.overlay?.meshHash ? (
              <Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/10 text-emerald-100">
                Mesh {wireframeOverlay.overlay.meshHash.slice(0, 8)}
              </Badge>
            ) : null}
            {wireframeClampLabel ? (
              <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                {wireframeClampLabel}
              </Badge>
            ) : null}
            {useFieldProbeColors && fieldProbe?.stats ? (
              <Badge variant="outline" className="border-sky-400/40 bg-sky-400/10 text-sky-100">
                |theta| max {fieldProbe.stats.absMax.toFixed(2)}
              </Badge>
            ) : null}
            {!wireframeOverlay.overlay && showWireframe ? (
              <Badge variant="outline" className="border-slate-400/30 bg-slate-400/10 text-slate-100">
                Fallback: geometric shells
              </Badge>
            ) : null}
            <label className="flex items-center gap-1">
                <Switch checked={showNatario} onCheckedChange={setShowNatario} />
                <span>Natario</span>
              </label>
              <label className="flex items-center gap-1">
                <Switch checked={showAlcubierre} onCheckedChange={setShowAlcubierre} />
                <span>Alcubierre</span>
              </label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center rounded-full border border-white/15 bg-white/5 p-1 text-slate-200 transition hover:border-emerald-300 hover:text-emerald-200"
                      aria-label="Overlay scale details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Natario overlay uses 55% of the hull radii; Alcubierre overlay uses 62% (bbox-based) so the cyan/purple shells match the default warp bubble assumptions.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="h-[480px] overflow-hidden rounded-xl border border-white/10 bg-[#0b1222]">
              <Canvas camera={{ position: [4, 3, 4], fov: 55 }}>
                <HullScene
                  model={model}
                  bounds={baseBounds}
                  scale={previewScale}
                hullDims={hullDims}
                showNatario={showNatario}
                showAlcubierre={showAlcubierre}
                showWireframe={showWireframe}
                wireframeGeometry={wireframeGeometry}
                wireframeColor={wireframeOverlay.overlay?.color}
                wireframeAlpha={wireframeOverlay.overlay?.alpha}
                wireframeWidth={wireframeOverlay.overlay?.lineWidth}
              />
              </Canvas>
              {loadingModel ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-200" />
                  <span className="text-sm text-emerald-100">Loading GLB...</span>
                </div>
              ) : null}
            </div>
            {loadError ? (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                {loadError}
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-400">
                Uses the same preview payload as Phoenix/Model silhouette. GLB is rendered read-only; overlays stay decoupled from the live
                3D hull viewer.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5 text-sky-300" />
                Natario / Alcubierre metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Metric label="Shift amplitude (beta)" value={fmtNumber(natarioMetrics.shift, 3)} hint="natario.shiftVectorField.amplitude" />
                <Metric label="gamma_geo" value={fmtNumber(natarioMetrics.gammaGeo, 2)} hint="pipeline.gammaGeo" />
                <Metric label="gamma_vdb" value={fmtNumber(natarioMetrics.gammaVdb, 2)} hint="pipeline.gammaVanDenBroeck" />
                <Metric label="q_spoil" value={fmtNumber(natarioMetrics.qSpoil, 3)} hint="pipeline.qSpoilingFactor" />
                <Metric label="TS_ratio" value={fmtNumber(natarioMetrics.tsRatio, 2)} hint="TS_ratio" />
                <Metric label="Sectors" value={fmtNumber(natarioMetrics.sectorCount, 0)} hint="sectorCount" />
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                Natario overlay is a cyan wireframe shell; Alcubierre overlay is a translucent purple bubble scaled to the hull OBB.
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Gauge className="h-5 w-5 text-emerald-300" />
                Field geometry sampler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">/api/helix/field-geometry</div>
            <div className="text-sm text-white">Lightweight sampler (JSON)</div>
          </div>
                <Switch checked={geometryEnabled} onCheckedChange={setGeometryEnabled} />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={sampleGeometry} disabled={geometryLoading}>
                  {geometryLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sampling...
                    </>
                  ) : (
                    "Sample once"
                  )}
                </Button>
                <span className="text-xs text-slate-400">
                  Disabled by default; uses small nTheta/nPhi to avoid heavy payloads.
                </span>
              </div>
              {geometryError ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{geometryError}</div>
              ) : null}
              {geometrySample ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {geometrySample.geometrySource ? (
                      <Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/10 text-emerald-100">
                        Source: {geometrySample.geometrySource}
                      </Badge>
                    ) : null}
                    {geometrySample.meshHash ? (
                      <Badge variant="outline" className="border-sky-400/40 bg-sky-400/10 text-sky-100">
                        Mesh {geometrySample.meshHash.slice(0, 8)}
                      </Badge>
                    ) : null}
                    {geometrySample.cacheHit ? (
                      <Badge variant="outline" className="border-indigo-400/40 bg-indigo-400/10 text-indigo-100">
                        Cache hit
                      </Badge>
                    ) : null}
                    {geometrySample.previewUpdatedAt ? (
                      <span className="rounded-full bg-white/5 px-2 py-1">
                        Preview {new Date(geometrySample.previewUpdatedAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                    {geometrySample.clampReasons?.length ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-100">
                        Clamp: {geometrySample.clampReasons.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  {geometrySample.basisApplied ? (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
                      <div>Basis swap: {geometrySample.basisApplied?.swap ? `${geometrySample.basisApplied.swap.x}/${geometrySample.basisApplied.swap.y}/${geometrySample.basisApplied.swap.z}` : "x/y/z"}</div>
                      <div>Flip: {geometrySample.basisApplied?.flip ? ["x","y","z"].map((axis) => geometrySample.basisApplied.flip[axis as "x"|"y"|"z"] ? axis : null).filter(Boolean).join(", ") || "none" : "none"}</div>
                      {Array.isArray(geometrySample.basisApplied?.scale) ? (
                        <div>Scale: {(geometrySample.basisApplied.scale as number[]).map((v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "1.00")).slice(0, 3).join(", ")}</div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <Metric label="Samples" value={geometrySample.count.toString()} hint={geometrySample.geometryKind ?? "ellipsoid"} />
                    <Metric
                      label="rho range"
                      value={
                        geometrySample.rhoRange ? `${geometrySample.rhoRange[0].toExponential(2)} ... ${geometrySample.rhoRange[1].toExponential(2)}` : "n/a"
                      }
                      hint="harmonic rho"
                    />
                    <Metric
                      label="Disp range"
                      value={
                        geometrySample.dispRange ? `${geometrySample.dispRange[0].toExponential(2)} ... ${geometrySample.dispRange[1].toExponential(2)}` : "n/a"
                      }
                      hint="displacement"
                    />
                    <Metric label="Sampled at" value={new Date(geometrySample.ts).toLocaleTimeString()} hint="local" />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">Sampling not run yet. Toggle on or hit Sample once to fetch geometry.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-base font-semibold text-white">{value}</div>
      {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
