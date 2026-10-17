import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { registerWebGLContext } from "@/lib/webgl/context-pool";
import { loadHullMetricsFromGLB, type HullMetrics } from "@/lib/hull-metrics";
import { HULL_DIM_MAX_M, HULL_DIM_MIN_M } from "@/lib/hull-guardrails";
import { HULL_PREVIEW_STORAGE_KEY } from "@/hooks/use-hull-preview-payload";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { applyHullBasisToDims, resolveHullBasis } from "@shared/hull-basis";
import { hashSignature, normalizeBasisForSignature } from "@/lib/card-signatures";
import type { BasisTransform, HullPreviewIndexedGeometry, HullPreviewLOD, HullPreviewPayload, LatticePrecomputeAttachment } from "@shared/schema";
import type { WebGLRenderer, Object3D, BufferGeometry } from "three";
import { Box3, BoxGeometry, Color, Group, Matrix4, MeshBasicMaterial, Sphere, Vector3 } from "three";
import { Box, Loader2, Ruler, Scan, StretchHorizontal, StretchVertical } from "lucide-react";
import { sha256Hex } from "@/utils/sha";

type Bounds = {
  size: Vector3;
  center: Vector3;
  radius: number;
};

type ScaleVec = [number, number, number];
type HullDims = { Lx_m: number; Ly_m: number; Lz_m: number };

const DEFAULT_MODEL = "/luma/needle-ellipsoid.glb";
const NEEDLE_HULL_DIMS: HullDims = { Lx_m: 1007, Ly_m: 264, Lz_m: 173 };
const NEEDLE_AXIS_GLTF = "/luma/needle-ellipsoid.glb";
const NEEDLE_BASIS_GLTF = "/luma/needle-ellipsoid-basis-swapped.glb";
const BASIS_IDENTITY: BasisTransform = {
  swap: { x: "x", y: "y", z: "z" },
  flip: { x: false, y: false, z: false },
  scale: [1, 1, 1],
};
// Swap x<-z, y stays with a flip and shrink, z<-x with expansion to undo the baked 0.5x scale.
const NEEDLE_BASIS_TRANSFORM: BasisTransform = {
  swap: { x: "z", y: "y", z: "x" },
  flip: { x: false, y: true, z: false },
  scale: [1, 0.8, 2],
};

const PRECOMPUTE_BASE_PATH = "/data/precomputed-lattice";
const PRECOMPUTE_LOOKUP_ORDER: Array<{ profile: string; preset: string }> = [
  { profile: "preview", preset: "medium" },
  { profile: "preview", preset: "high" },
  { profile: "card", preset: "card" },
  { profile: "card", preset: "high" },
];
const PRECOMPUTE_TRI_CAP = 250_000;

const clampScale = (value: number) => Math.min(3, Math.max(0.25, value));

const formatDim = (value?: number) => {
  if (!Number.isFinite(value)) return "n/a";
  const v = value as number;
  return Math.abs(v) >= 1 ? v.toFixed(3) : v.toExponential(2);
};

const formatArea = (value?: number) => {
  if (!Number.isFinite(value)) return "n/a";
  const v = value as number;
  return Math.abs(v) >= 1 ? v.toFixed(2) : v.toExponential(2);
};

const formatVolume = (value?: number) => {
  if (!Number.isFinite(value)) return "n/a";
  const v = value as number;
  if (v === 0) return "0";
  const exp = Math.log10(Math.abs(v));
  return exp > 3 ? `${(v / 1e3).toFixed(2)}k` : v.toFixed(2);
};

const GLB_DB_NAME = "hull-preview-glb";
const GLB_DB_STORE = "glb";
const GLB_BLOB_TYPE = "model/gltf-binary";
let glbDbPromise: Promise<IDBDatabase> | null = null;

const openPreviewGlbDb = () => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (glbDbPromise) return glbDbPromise;
  glbDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(GLB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GLB_DB_STORE)) {
        request.result.createObjectStore(GLB_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });
  return glbDbPromise;
};

const savePreviewGlbBuffer = async (key: string, buffer: ArrayBuffer) => {
  try {
    const db = await openPreviewGlbDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(GLB_DB_STORE, "readwrite");
      tx.objectStore(GLB_DB_STORE).put(buffer, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[ModelSilhouettePanel] Failed to persist GLB buffer", err);
  }
};

const loadPreviewGlbBuffer = async (key: string) => {
  try {
    const db = await openPreviewGlbDb();
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(GLB_DB_STORE, "readonly");
      const req = tx.objectStore(GLB_DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[ModelSilhouettePanel] Failed to load GLB buffer", err);
    return null;
  }
};

type HullPreviewUploadMeta = {
  glbUrl: string;
  meshHash: string;
  updatedAt: number;
};

const uploadHullPreviewGlb = async (params: {
  buffer: ArrayBuffer;
  meshHash?: string;
  name?: string;
}): Promise<HullPreviewUploadMeta | null> => {
  if (typeof fetch === "undefined") return null;
  try {
    const payload = new FormData();
    payload.append(
      "glb",
      new Blob([params.buffer], { type: GLB_BLOB_TYPE }),
      params.name ?? "hull.glb",
    );
    if (params.meshHash) {
      payload.append("meshHash", params.meshHash);
    }
    const res = await fetch("/api/helix/hull-preview/upload", {
      method: "POST",
      body: payload,
    });
    if (!res.ok) {
      console.warn("[ModelSilhouettePanel] GLB upload failed", res.status);
      return null;
    }
    const json = await res.json();
    const glbUrl = typeof json?.glbUrl === "string" ? json.glbUrl : null;
    const meshHash = typeof json?.meshHash === "string" ? json.meshHash : params.meshHash ?? null;
    const updatedAt =
      typeof json?.updatedAt === "number" && Number.isFinite(json.updatedAt) ? json.updatedAt : Date.now();
    if (!glbUrl || !meshHash) return null;
    return { glbUrl, meshHash, updatedAt };
  } catch (err) {
    console.warn("[ModelSilhouettePanel] GLB upload failed", err);
    return null;
  }
};

type IndexedGeometryBuild = {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  triangleCount: number;
  vertexCount: number;
  byteLength: number;
};

const computeBoundsFromPositions = (positions: Float32Array) => {
  if (!positions || positions.length < 3) return null;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return null;
  return {
    min: [min[0], min[1], min[2]] as [number, number, number],
    max: [max[0], max[1], max[2]] as [number, number, number],
  };
};

const mergeSceneGeometry = (root: Group | null): IndexedGeometryBuild | null => {
  if (!root) return null;
  const geometries: BufferGeometry[] = [];
  const world = new Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((node: any) => {
    if (!node?.isMesh || !node.geometry) return;
    const geom = (node.geometry as BufferGeometry).clone();
    node.updateWorldMatrix?.(true, true);
    world.copy(node.matrixWorld);
    geom.applyMatrix4(world);
    geometries.push(geom);
  });
  if (!geometries.length) return null;
  const merged = BufferGeometryUtils.mergeGeometries(geometries, true);
  geometries.forEach((g) => g.dispose?.());
  if (!merged) return null;
  const withIndex = merged.index ? merged : merged.toNonIndexed();
  if (!withIndex.getIndex()) {
    const posAttr = withIndex.getAttribute("position");
    if (posAttr) {
      const idx = Array.from({ length: posAttr.count }, (_, i) => i);
      withIndex.setIndex(idx);
    }
  }
  const deduped = BufferGeometryUtils.mergeVertices(withIndex, 1e-4) ?? withIndex;
  const positionAttr = deduped.getAttribute("position");
  if (!positionAttr) return null;
  const positions = new Float32Array(positionAttr.array as ArrayLike<number>);
  const indexAttr = deduped.getIndex();
  let indices: Uint32Array;
  if (indexAttr?.array) {
    const arr = indexAttr.array as ArrayLike<number>;
    indices = arr instanceof Uint32Array ? new Uint32Array(arr) : new Uint32Array(Array.from(arr, (v) => Number(v) ?? 0));
  } else {
    const vertCount = positionAttr.count;
    indices = new Uint32Array(vertCount);
    for (let i = 0; i < vertCount; i++) indices[i] = i;
  }
  const normalAttr = deduped.getAttribute("normal");
  const normals = normalAttr ? new Float32Array(normalAttr.array as ArrayLike<number>) : undefined;
  const bounds = computeBoundsFromPositions(positions);
  const triangleCount = Math.floor(indices.length / 3);
  const vertexCount = positionAttr.count;
  const byteLength = positions.byteLength + indices.byteLength + (normals?.byteLength ?? 0);
  deduped.dispose();
  if (withIndex !== deduped) withIndex.dispose?.();
  if (merged !== deduped && merged !== withIndex) merged.dispose?.();
  return { positions, indices, normals, bounds, triangleCount, vertexCount, byteLength };
};

const decimateIndexedGeometry = (
  geometry: IndexedGeometryBuild,
  targetTris: number,
): { geometry: IndexedGeometryBuild; decimation: NonNullable<HullPreviewLOD["decimation"]> } => {
  const triCount = Math.floor(geometry.indices.length / 3);
  const safeTarget = Math.max(1, Math.min(targetTris, triCount || targetTris));
  if (triCount <= safeTarget) {
    return {
      geometry,
      decimation: {
        targetTris: safeTarget,
        achievedTris: triCount,
        targetRatio: triCount > 0 ? safeTarget / triCount : undefined,
        method: "passthrough",
      },
    };
  }

  const stride = Math.max(1, Math.floor(triCount / safeTarget));
  const remap = new Map<number, number>();
  const outPositions: number[] = [];
  const outNormals: number[] | undefined = geometry.normals ? [] : undefined;
  const outIndices: number[] = [];
  const addVertex = (idx: number) => {
    let next = remap.get(idx);
    if (next === undefined) {
      next = remap.size;
      remap.set(idx, next);
      const base = idx * 3;
      outPositions.push(
        geometry.positions[base] ?? 0,
        geometry.positions[base + 1] ?? 0,
        geometry.positions[base + 2] ?? 0,
      );
      if (outNormals) {
        outNormals.push(
          geometry.normals?.[base] ?? 0,
          geometry.normals?.[base + 1] ?? 0,
          geometry.normals?.[base + 2] ?? 0,
        );
      }
    }
    outIndices.push(next);
  };

  for (let tri = 0; tri < triCount; tri += stride) {
    const base = tri * 3;
    addVertex(geometry.indices[base] ?? 0);
    addVertex(geometry.indices[base + 1] ?? 0);
    addVertex(geometry.indices[base + 2] ?? 0);
    if (outIndices.length / 3 >= safeTarget * 1.05) break;
  }

  if (outIndices.length < 3) {
    return {
      geometry,
      decimation: {
        targetTris: safeTarget,
        achievedTris: triCount,
        targetRatio: triCount > 0 ? safeTarget / triCount : undefined,
        method: "passthrough",
      },
    };
  }

  const positions = new Float32Array(outPositions);
  const indices = new Uint32Array(outIndices);
  const normals = outNormals ? new Float32Array(outNormals) : undefined;
  const bounds = computeBoundsFromPositions(positions);
  const achievedTris = Math.floor(indices.length / 3);
  const vertexCount = Math.floor(positions.length / 3);
  const byteLength = positions.byteLength + indices.byteLength + (normals?.byteLength ?? 0);
  return {
    geometry: { positions, indices, normals, bounds, triangleCount: achievedTris, vertexCount, byteLength },
    decimation: {
      targetTris: safeTarget,
      achievedTris,
      targetRatio: triCount > 0 ? safeTarget / triCount : undefined,
      method: "stride-sample",
    },
  };
};

const serializeIndexedGeometry = (geometry: IndexedGeometryBuild): HullPreviewIndexedGeometry => ({
  positions: Array.from(geometry.positions),
  indices: Array.from(geometry.indices),
  normals: geometry.normals ? Array.from(geometry.normals) : undefined,
  bounds: geometry.bounds ?? undefined,
  boundingBox: geometry.bounds ?? undefined,
  vertexCount: geometry.vertexCount,
  triangleCount: geometry.triangleCount,
  byteLength: geometry.byteLength,
});

const buildMeshHash = async (geometry: IndexedGeometryBuild, extras: number[] = []) => {
  const parts: Uint8Array[] = [
    new Uint8Array(geometry.positions.buffer),
    new Uint8Array(geometry.indices.buffer),
  ];
  if (geometry.normals) parts.push(new Uint8Array(geometry.normals.buffer));
  if (extras.length) {
    const extraBuf = new Float64Array(extras);
    parts.push(new Uint8Array(extraBuf.buffer));
  }
  const total = parts.reduce((sum, arr) => sum + arr.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const arr of parts) {
    combined.set(arr, offset);
    offset += arr.byteLength;
  }
  return sha256Hex(combined);
};

const computeBoundsSize = (bounds?: { min: [number, number, number]; max: [number, number, number] } | null) => {
  if (!bounds?.min || !bounds?.max) return null;
  return [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ] as [number, number, number];
};

const countDegenerateTriangles = (geometry: IndexedGeometryBuild | null) => {
  if (!geometry) return 0;
  const { positions, indices } = geometry;
  if (!positions?.length || !indices?.length) return 0;
  const vertCount = Math.floor(positions.length / 3);
  let culled = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] ?? 0;
    const b = indices[i + 1] ?? 0;
    const c = indices[i + 2] ?? 0;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      culled += 1;
      continue;
    }
    if (a < 0 || b < 0 || c < 0 || a >= vertCount || b >= vertCount || c >= vertCount) {
      culled += 1;
      continue;
    }
    if (a === b || b === c || c === a) {
      culled += 1;
      continue;
    }
    const aBase = a * 3;
    const bBase = b * 3;
    const cBase = c * 3;
    const abx = positions[bBase] - positions[aBase];
    const aby = positions[bBase + 1] - positions[aBase + 1];
    const abz = positions[bBase + 2] - positions[aBase + 2];
    const acx = positions[cBase] - positions[aBase];
    const acy = positions[cBase + 1] - positions[aBase + 1];
    const acz = positions[cBase + 2] - positions[aBase + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const areaSq = cx * cx + cy * cy + cz * cz;
    if (!Number.isFinite(areaSq) || areaSq <= 1e-14) {
      culled += 1;
    }
  }
  return culled;
};

const buildOfflineWarnings = (
  geometry: IndexedGeometryBuild | null,
  degenerateCount: number,
  extraReasons: string[] = [],
) => {
  if (!geometry) return [];
  const warnings: string[] = [];
  if (geometry.triangleCount > PRECOMPUTE_TRI_CAP) {
    warnings.push(
      `Triangles ${geometry.triangleCount.toLocaleString()} exceed offline cap ${PRECOMPUTE_TRI_CAP.toLocaleString()}.`,
    );
  }
  const size = computeBoundsSize(geometry.bounds ?? undefined);
  if (size) {
    const maxExtent = Math.max(Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2]));
    if (maxExtent > HULL_DIM_MAX_M) {
      warnings.push(`Extent ${maxExtent.toFixed(2)} m exceeds offline cap ${HULL_DIM_MAX_M} m.`);
    }
  }
  if (degenerateCount > 0) {
    warnings.push(`Detected ${degenerateCount} degenerate faces; offline precompute will cull them.`);
  }
  for (const reason of extraReasons) {
    warnings.push(`Precompute rejection: ${reason}`);
  }
  return Array.from(new Set(warnings));
};

const normalizePrecomputeMeta = (
  raw: any,
  metaPath: string,
  meshHash: string,
  basisSignature: string,
  profile: string,
  preset: string,
): LatticePrecomputeAttachment => {
  const rejectionReasons: string[] = Array.isArray(raw?.rejectionReasons)
    ? raw.rejectionReasons
    : Array.isArray(raw?.validation)
      ? raw.validation
      : [];
  const updatedAtRaw = raw?.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "number"
      ? updatedAtRaw
      : typeof updatedAtRaw === "string"
        ? Date.parse(updatedAtRaw)
        : Date.now();
  const meta = raw?.latticeMeta ?? raw?.meta ?? null;
  const frame = raw?.frame ?? meta?.frame ?? undefined;
  const assets = raw?.assets && typeof raw.assets === "object" ? raw.assets : undefined;
  return {
    meshHash,
    basisSignature,
    profileTag: raw?.frame?.profileTag ?? profile,
    preset: raw?.frame?.preset ?? preset,
    rejectionReasons,
    meta: meta ?? undefined,
    frame: frame ?? undefined,
    assets,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    sourcePath: metaPath,
  };
};

const lookupPrecomputeBundle = async (meshHash: string, basisSignature: string) => {
  if (typeof fetch === "undefined") return null;
  const dir = `${PRECOMPUTE_BASE_PATH}/${meshHash}_${basisSignature}`;
  for (const combo of PRECOMPUTE_LOOKUP_ORDER) {
    const stem = `${meshHash.slice(0, 8)}-${basisSignature.slice(0, 8)}-${combo.profile}-${combo.preset}`;
    const metaPath = `${dir}/${stem}.metadata.json`;
    try {
      const res = await fetch(metaPath, { cache: "no-cache" });
      if (!res.ok) continue;
      const raw = await res.json();
      return normalizePrecomputeMeta(raw, metaPath, meshHash, basisSignature, combo.profile, combo.preset);
    } catch {
      // ignore and continue search
    }
  }
  return null;
};

function computeBounds(object: Object3D): Bounds | null {
  const box = new Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return null;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = sphere?.radius ?? size.length() * 0.5;
  return { size, center, radius };
}

function BoundingBoxWire({ size, center, color = "#38bdf8" }: { size: Vector3; center: Vector3; color?: string }) {
  const geometry = useMemo(() => new BoxGeometry(size.x, size.y, size.z), [size.x, size.y, size.z]);
  return (
    <lineSegments position={[center.x, center.y, center.z]}>
      <edgesGeometry args={[geometry]} />
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function EllipsoidWire({
  radii,
  center,
  color = "#22c55e",
}: {
  radii: Vector3;
  center: Vector3;
  color?: string;
}) {
  return (
    <mesh position={[center.x, center.y, center.z]} scale={[radii.x, radii.y, radii.z]}>
      <sphereGeometry args={[1, 36, 24]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
    </mesh>
  );
}

function FitCamera({
  center,
  radius,
  orbitRef,
  token,
}: {
  center: Vector3 | null;
  radius: number | null;
  orbitRef: React.RefObject<any>;
  token: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!center || !radius) return;
    const dist = Math.max(1.2, radius * 2.4);
    camera.position.set(center.x + dist, center.y + dist * 0.4, center.z + dist);
    camera.near = Math.max(0.01, radius * 0.02);
    camera.far = Math.max(5000, radius * 10);
    camera.updateProjectionMatrix();
    if (orbitRef.current) {
      orbitRef.current.target.set(center.x, center.y, center.z);
      orbitRef.current.update();
    }
  }, [camera, center?.x, center?.y, center?.z, radius, token, orbitRef]);

  return null;
}

function ModelScene({
  model,
  baseBounds,
  scale,
  showEllipsoid,
  fitToken,
}: {
  model: Object3D | null;
  baseBounds: Bounds | null;
  scale: ScaleVec;
  showEllipsoid: boolean;
  fitToken: number;
}) {
  const orbitRef = useRef<any>(null);
  const scaleVec = useMemo(() => new Vector3(...scale), [scale]);
  const wireframeModel = useMemo(() => {
    if (!model) return null;
    const clone = model.clone(true);
    clone.traverse((node: any) => {
      if (node?.isMesh) {
        node.material = new MeshBasicMaterial({
          color: "#22c55e",
          wireframe: true,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        });
      }
    });
    return clone;
  }, [model]);

  const scaledSize = useMemo(() => (baseBounds ? baseBounds.size.clone().multiply(scaleVec) : null), [baseBounds, scaleVec]);
  const scaledCenter = useMemo(
    () => (baseBounds ? new Vector3(baseBounds.center.x * scale[0], baseBounds.center.y * scale[1], baseBounds.center.z * scale[2]) : null),
    [baseBounds, scale],
  );
  const fitRadius = useMemo(() => (baseBounds ? baseBounds.radius * Math.max(...scale) : null), [baseBounds, scale]);
  const gridSize = useMemo(() => Math.max(4, (scaledSize?.length() ?? 4) * 1.6), [scaledSize]);
  const gridY = useMemo(() => {
    if (!scaledCenter || !scaledSize) return 0;
    return scaledCenter.y - scaledSize.y / 2;
  }, [scaledCenter, scaledSize]);

  return (
    <>
      <color attach="background" args={["#0b1222"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 8, 6]} intensity={1.1} color={new Color("#b9dcff")} />
      <directionalLight position={[-6, 5, -3]} intensity={0.5} color={new Color("#7dd3fc")} />
      <pointLight position={[0, 6, 0]} intensity={0.5} color={new Color("#22c55e")} />

      {model ? (
        <group scale={scale} dispose={null}>
          <primitive object={model} />
          {wireframeModel ? <primitive object={wireframeModel} /> : null}
        </group>
      ) : null}

      {scaledSize && scaledCenter ? (
        <>
          <BoundingBoxWire size={scaledSize} center={scaledCenter} />
          {showEllipsoid ? <EllipsoidWire radii={scaledSize.clone().multiplyScalar(0.5)} center={scaledCenter} /> : null}
        </>
      ) : null}

      <gridHelper args={[gridSize, Math.max(8, Math.ceil(gridSize)), "#1f2937", "#334155"]} position={[0, gridY, 0]} />
      <axesHelper args={[Math.max(2, gridSize * 0.4)]} position={scaledCenter ? [scaledCenter.x, gridY, scaledCenter.z] : [0, gridY, 0]} />

      <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.08} />
      <FitCamera center={scaledCenter ?? baseBounds?.center ?? null} radius={fitRadius ?? baseBounds?.radius ?? null} orbitRef={orbitRef} token={fitToken} />
    </>
  );
}

export default function ModelSilhouettePanel() {
  const [urlInput, setUrlInput] = useState<string>(DEFAULT_MODEL);
  const [activeGlbUrl, setActiveGlbUrl] = useState<string>(DEFAULT_MODEL);
  const [modelName, setModelName] = useState<string>("needle-ellipsoid.glb");
  const [model, setModel] = useState<Group | null>(null);
  const [baseBounds, setBaseBounds] = useState<Bounds | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEllipsoid, setShowEllipsoid] = useState(true);
  const [scale, setScale] = useState<ScaleVec>([1, 1, 1]);
  const [fitToken, setFitToken] = useState(0);
  const [hullMetrics, setHullMetrics] = useState<HullMetrics | null>(null);
  const [hullMetricsLoading, setHullMetricsLoading] = useState(false);
  const [hullMetricsError, setHullMetricsError] = useState<string | null>(null);
  const [targetDims, setTargetDims] = useState<HullDims | null>(null);
  const [syncingPreview, setSyncingPreview] = useState(false);
  const [basis, setBasis] = useState<BasisTransform>(BASIS_IDENTITY);
  const [mergedGeometry, setMergedGeometry] = useState<IndexedGeometryBuild | null>(null);
  const [decimatedGeometry, setDecimatedGeometry] = useState<{
    geometry: IndexedGeometryBuild;
    decimation: NonNullable<HullPreviewLOD["decimation"]>;
  } | null>(null);
  const [meshHashState, setMeshHashState] = useState<{ meshHash?: string; basisSignature?: string } | null>(null);
  const [precomputeStatus, setPrecomputeStatus] = useState<{
    state: "idle" | "checking" | "found" | "missing" | "error";
    bundle?: LatticePrecomputeAttachment | null;
    detail?: string;
  }>({
    state: "idle",
    bundle: null,
  });
  const [offlineWarnings, setOfflineWarnings] = useState<string[]>([]);
  const [degenerateCount, setDegenerateCount] = useState<number>(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [autoPreviewPending, setAutoPreviewPending] = useState(false);
  const [autoFitPending, setAutoFitPending] = useState(false);

  const activeLoadCancelRef = useRef<(() => void) | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const uploadBufferRef = useRef<{ buffer: ArrayBuffer; name?: string } | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const releaseRendererRef = useRef<() => void>(() => {});
  const hullMeasureAbortRef = useRef<AbortController | null>(null);

  const scaleVec = useMemo(() => new Vector3(...scale), [scale]);
  const basisResolved = useMemo(() => resolveHullBasis(basis), [basis]);
  const baseHullDims = useMemo(() => {
    if (hullMetrics) {
      return new Vector3(hullMetrics.dims_m.Lx_m, hullMetrics.dims_m.Ly_m, hullMetrics.dims_m.Lz_m);
    }
    return baseBounds?.size ?? null;
  }, [hullMetrics, baseBounds]);
  const scaledSize = useMemo(() => {
    const size = baseHullDims ?? baseBounds?.size ?? null;
    return size ? size.clone().multiply(scaleVec) : null;
  }, [baseHullDims, baseBounds, scaleVec]);
  const scaledHullDims = useMemo(
    () => (baseHullDims ? baseHullDims.clone().multiply(scaleVec) : scaledSize),
    [baseHullDims, scaleVec, scaledSize],
  );
  const scaledCenter = useMemo(
    () => (baseBounds ? new Vector3(baseBounds.center.x * scale[0], baseBounds.center.y * scale[1], baseBounds.center.z * scale[2]) : null),
    [baseBounds, scale],
  );

  const ellipsoidRadii = useMemo(() => (scaledHullDims ? scaledHullDims.clone().multiplyScalar(0.5) : null), [scaledHullDims]);
  const boxVolume = useMemo(() => (scaledHullDims ? scaledHullDims.x * scaledHullDims.y * scaledHullDims.z : null), [scaledHullDims]);
  const ellipsoidVolume = useMemo(
    () => (ellipsoidRadii ? (4 / 3) * Math.PI * ellipsoidRadii.x * ellipsoidRadii.y * ellipsoidRadii.z : null),
    [ellipsoidRadii],
  );
  const hullDimsRaw = useMemo(() => {
    if (scaledHullDims) return { Lx_m: scaledHullDims.x, Ly_m: scaledHullDims.y, Lz_m: scaledHullDims.z };
    if (targetDims) return { ...targetDims };
    return null;
  }, [scaledHullDims, targetDims]);
  const basisAppliedDims = useMemo(
    () => (hullDimsRaw ? applyHullBasisToDims(hullDimsRaw, basisResolved) : null),
    [basisResolved, hullDimsRaw],
  );
  const basisAppliedDimsVec = useMemo(
    () => (basisAppliedDims ? new Vector3(basisAppliedDims.Lx_m, basisAppliedDims.Ly_m, basisAppliedDims.Lz_m) : null),
    [basisAppliedDims],
  );
  const rawHalfSize = useMemo(() => (scaledHullDims ? scaledHullDims.clone().multiplyScalar(0.5) : null), [scaledHullDims]);
  const applyBasisToVec = useCallback(
    (vec: Vector3 | null) => {
      if (!vec) return null;
      const pick = (axis: "x" | "y" | "z") => (axis === "x" ? vec.x : axis === "y" ? vec.y : vec.z);
      const { swap, flip, scale } = basisResolved;
      const x = pick(swap.x) * (flip.x ? -1 : 1) * scale[0];
      const y = pick(swap.y) * (flip.y ? -1 : 1) * scale[1];
      const z = pick(swap.z) * (flip.z ? -1 : 1) * scale[2];
      return new Vector3(x, y, z);
    },
    [basisResolved],
  );
  const basisCenter = useMemo(() => applyBasisToVec(scaledCenter), [applyBasisToVec, scaledCenter]);
  const basisHalfSize = useMemo(() => {
    const applied = applyBasisToVec(rawHalfSize);
    return applied ? new Vector3(Math.abs(applied.x), Math.abs(applied.y), Math.abs(applied.z)) : null;
  }, [applyBasisToVec, rawHalfSize]);
  const basisFitBounds = useMemo(() => {
    if (!basisCenter || !basisHalfSize) return null;
    return {
      min: [basisCenter.x - basisHalfSize.x, basisCenter.y - basisHalfSize.y, basisCenter.z - basisHalfSize.z] as [number, number, number],
      max: [basisCenter.x + basisHalfSize.x, basisCenter.y + basisHalfSize.y, basisCenter.z + basisHalfSize.z] as [number, number, number],
    };
  }, [basisCenter, basisHalfSize]);

  const modelClone = useMemo(() => (model ? model.clone(true) : null), [model]);

  const measureHull = useCallback(
    (url: string) => {
      hullMeasureAbortRef.current?.abort();
      const controller = new AbortController();
      hullMeasureAbortRef.current = controller;
      setHullMetricsLoading(true);
      setHullMetricsError(null);
      loadHullMetricsFromGLB(url, { signal: controller.signal })
        .then((metrics) => {
          if (controller.signal.aborted) return;
          setHullMetrics(metrics);
          setHullMetricsLoading(false);
          setTargetDims((prev) => prev ?? metrics.dims_m);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setHullMetrics(null);
          setHullMetricsLoading(false);
          const message =
            err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to measure hull";
          setHullMetricsError(message);
        });
    },
    [],
  );

  const captureFileBuffer = useCallback((file: File) => {
    file
      .arrayBuffer()
      .then((buffer) => {
        uploadBufferRef.current = { buffer, name: file.name };
      })
      .catch((err) => {
        console.warn("[ModelSilhouettePanel] Failed to read GLB file for persistence", err);
      });
  }, []);

  const loadModel = useCallback(
    (url: string, label?: string) => {
      setLoading(true);
      setLoadError(null);
      if (label) setModelName(label);
      setModel(null);
      setBaseBounds(null);

      const loader = new GLTFLoader();
      let cancelled = false;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;
          setModel(gltf.scene);
          const bounds = computeBounds(gltf.scene);
          setBaseBounds(bounds);
          setLoading(false);
          setFitToken((t) => t + 1);
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.error("[ModelSilhouettePanel] GLB load failed", err);
          setLoadError("Could not load GLB. Check URL or file permissions.");
          setLoading(false);
          setAutoPreviewPending(false);
          setIsDragActive(false);
        },
      );

      return () => {
        cancelled = true;
      };
    },
    [],
  );

  const startLoad = useCallback(
    (url: string, label?: string) => {
      activeLoadCancelRef.current?.();
      setTargetDims(null);
      setHullMetrics(null);
      setMergedGeometry(null);
      setDecimatedGeometry(null);
      setMeshHashState(null);
      setPrecomputeStatus({ state: "idle", bundle: null });
      setOfflineWarnings([]);
      setActiveGlbUrl(url);
      measureHull(url);
      activeLoadCancelRef.current = loadModel(url, label);
    },
    [loadModel, measureHull],
  );

  const applyNeedlePreset = useCallback(
    (variant: "axis" | "basis") => {
      const url = variant === "axis" ? NEEDLE_AXIS_GLTF : NEEDLE_BASIS_GLTF;
      const label = variant === "axis" ? "Needle ellipsoid (axis)" : "Needle ellipsoid (basis-swapped)";
      uploadBufferRef.current = null;
      setScale([1, 1, 1]);
      setBasis(variant === "axis" ? BASIS_IDENTITY : NEEDLE_BASIS_TRANSFORM);
      setUrlInput(url);
      setShowEllipsoid(true);
      startLoad(url, label);
      setTargetDims(null);
    },
    [startLoad],
  );

  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    let disposed = false;
    let revivedUrl: string | null = null;
    const restore = async () => {
      let loadedFromPreview = false;
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(HULL_PREVIEW_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as any;
            let glbUrl = typeof parsed?.glbUrl === "string" ? parsed.glbUrl : null;
            const meshHash = parsed?.meshHash ?? parsed?.mesh?.meshHash;
            if ((!glbUrl || glbUrl.startsWith("blob:")) && meshHash) {
              const buffer = await loadPreviewGlbBuffer(meshHash);
              if (buffer) {
                const rebuilt = URL.createObjectURL(new Blob([buffer], { type: GLB_BLOB_TYPE }));
                glbUrl = rebuilt;
                revivedUrl = rebuilt;
                objectUrlRef.current = rebuilt;
                parsed.glbUrl = rebuilt;
                window.localStorage.setItem(HULL_PREVIEW_STORAGE_KEY, JSON.stringify(parsed));
              }
            }
            if (glbUrl && !disposed) {
              loadedFromPreview = true;
              setUrlInput(glbUrl);
              setActiveGlbUrl(glbUrl);
              if (Array.isArray(parsed?.scale) && parsed.scale.length >= 3) {
                const s = parsed.scale.map((v: any) => (Number.isFinite(v) ? v : 1));
                setScale([s[0], s[1], s[2]]);
              }
              if (parsed?.basis) setBasis(parsed.basis as BasisTransform);
              if (parsed?.targetDims) setTargetDims(parsed.targetDims as HullDims);
              startLoad(glbUrl, glbUrl.split("/").pop() || "GLB");
            }
          }
        } catch {
          /* ignore preview restore errors */
        }
      }
      if (!loadedFromPreview && !disposed) {
        uploadBufferRef.current = null;
        startLoad(DEFAULT_MODEL, "needle-ellipsoid.glb");
      }
    };

    restore();
    return () => {
      disposed = true;
      activeLoadCancelRef.current?.();
      if (revivedUrl) {
        URL.revokeObjectURL(revivedUrl);
      }
    };
  }, [startLoad]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      activeLoadCancelRef.current?.();
      hullMeasureAbortRef.current?.abort();
      releaseRendererRef.current();
      releaseRendererRef.current = () => {};
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!model) {
      setMergedGeometry(null);
      setDecimatedGeometry(null);
      setDegenerateCount(0);
      return () => {
        cancelled = true;
      };
    }
    const merged = mergeSceneGeometry(model);
    if (!cancelled) {
      setMergedGeometry(merged);
      setDegenerateCount(countDegenerateTriangles(merged));
      if (merged) {
        const targetBudget =
          merged.triangleCount > 0
            ? Math.min(15000, Math.max(4000, Math.floor(merged.triangleCount * 0.25)))
            : 8000;
        const decimated = decimateIndexedGeometry(merged, targetBudget);
        setDecimatedGeometry(decimated);
      } else {
        setDecimatedGeometry(null);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [model]);

  useEffect(() => {
    let cancelled = false;
    const geometry = decimatedGeometry?.geometry ?? null;
    setOfflineWarnings(buildOfflineWarnings(mergedGeometry, degenerateCount));
    if (!geometry) {
      setMeshHashState(null);
      setPrecomputeStatus({ state: "idle", bundle: null });
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      setPrecomputeStatus((prev) => ({ state: "checking", bundle: prev.bundle ?? null }));
      try {
        const swapCode = (axis: "x" | "y" | "z") => (axis === "x" ? 0 : axis === "y" ? 1 : 2);
        const basisSignature = await hashSignature(normalizeBasisForSignature(basisResolved));
        const dimsVec =
          basisAppliedDimsVec ??
          scaledHullDims ??
          (targetDims ? new Vector3(targetDims.Lx_m, targetDims.Ly_m, targetDims.Lz_m) : null);
        const extras = [
          scale[0],
          scale[1],
          scale[2],
          swapCode(basisResolved.swap.x),
          swapCode(basisResolved.swap.y),
          swapCode(basisResolved.swap.z),
          basisResolved.flip.x ? 1 : 0,
          basisResolved.flip.y ? 1 : 0,
          basisResolved.flip.z ? 1 : 0,
          basisResolved.scale[0],
          basisResolved.scale[1],
          basisResolved.scale[2],
          ...(dimsVec ? [dimsVec.x, dimsVec.y, dimsVec.z] : []),
        ];
        const meshHash = await buildMeshHash(geometry, extras);
        if (cancelled) return;
        setMeshHashState({ meshHash, basisSignature });
        const existingBundle = precomputeStatus.bundle;
        if (
          existingBundle &&
          existingBundle.meshHash === meshHash &&
          existingBundle.basisSignature === basisSignature
        ) {
          const warnings = buildOfflineWarnings(mergedGeometry, degenerateCount, existingBundle.rejectionReasons ?? []);
          setOfflineWarnings(warnings);
          setPrecomputeStatus({ state: "found", bundle: existingBundle });
          return;
        }
        const bundle = await lookupPrecomputeBundle(meshHash, basisSignature);
        if (cancelled) return;
        const warnings = buildOfflineWarnings(mergedGeometry, degenerateCount, bundle?.rejectionReasons ?? []);
        setOfflineWarnings(warnings);
        setPrecomputeStatus(bundle ? { state: "found", bundle } : { state: "missing", bundle: null });
      } catch (err) {
        if (cancelled) return;
        setPrecomputeStatus({
          state: "error",
          bundle: null,
          detail: err instanceof Error ? err.message : "Failed to hash mesh",
        });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [decimatedGeometry, basisResolved, scale, targetDims, basisAppliedDimsVec, scaledHullDims, mergedGeometry, degenerateCount, precomputeStatus.bundle]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    captureFileBuffer(file);
    setBasis(BASIS_IDENTITY);
    setUrlInput(file.name);
    startLoad(objectUrl, file.name);
    setAutoPreviewPending(true);
    setAutoFitPending(true);
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    uploadBufferRef.current = null;
    setBasis(BASIS_IDENTITY);
    startLoad(trimmed, trimmed.split("/").pop() || "GLB");
    setAutoFitPending(true);
  };

  const handleLoadPreset = () => {
    const presetUrl = NEEDLE_AXIS_GLTF;
    setUrlInput(presetUrl);
    uploadBufferRef.current = null;
    setBasis(BASIS_IDENTITY);
    startLoad(presetUrl, presetUrl.split("/").pop() || "GLB");
    setAutoFitPending(true);
  };

  const handleDropFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    captureFileBuffer(file);
    setBasis(BASIS_IDENTITY);
    setUrlInput(file.name);
    setIsDragActive(false);
    startLoad(objectUrl, file.name);
    setAutoPreviewPending(true);
    setAutoFitPending(true);
  };

  const handleScaleChange = (axis: 0 | 1 | 2, value: number) => {
    setScale((prev) => {
      const next = [...prev] as ScaleVec;
      next[axis] = clampScale(value);
      return next;
    });
  };

  const handleResetScale = () => setScale([1, 1, 1]);
  const handleFitToSilhouette = () => {
    const baseDims =
      hullMetrics?.dims_m ??
      (baseBounds
        ? { Lx_m: baseBounds.size.x, Ly_m: baseBounds.size.y, Lz_m: baseBounds.size.z }
        : null);
    if (!baseDims || !targetDims) return;
    const { Lx_m: bx, Ly_m: by, Lz_m: bz } = baseDims;
    if (!(bx > 0 && by > 0 && bz > 0)) return;
    const next: ScaleVec = [
      clampScale(targetDims.Lx_m / bx),
      clampScale(targetDims.Ly_m / by),
      clampScale(targetDims.Lz_m / bz),
    ];
    setScale(next);
    setFitToken((t) => t + 1);
  };

  useEffect(() => {
    if (!autoFitPending) return;
    if (loading || hullMetricsLoading) return;
    if (!targetDims) return;
    const baseDims = hullMetrics?.dims_m ?? (baseBounds ? { Lx_m: baseBounds.size.x, Ly_m: baseBounds.size.y, Lz_m: baseBounds.size.z } : null);
    if (!baseDims) return;
    handleFitToSilhouette();
    setAutoFitPending(false);
  }, [autoFitPending, loading, hullMetricsLoading, targetDims, hullMetrics?.dims_m, baseBounds, handleFitToSilhouette]);
  const handleSaveHullPreview = useCallback(async () => {
    if (!activeGlbUrl) return;
    setSyncingPreview(true);
    try {
      const area_m2 = Number.isFinite(hullMetrics?.area_m2) ? (hullMetrics as HullMetrics).area_m2 : undefined;
      const area_m2_unc = Number.isFinite(hullMetrics?.areaUnc_m2) ? (hullMetrics as HullMetrics).areaUnc_m2 : undefined;
      const centerCanonical =
        basisCenter ?? scaledCenter ?? (baseBounds ? baseBounds.center.clone().multiply(scaleVec) : null);
      const dimsCanonical = basisAppliedDimsVec ?? scaledHullDims ?? (targetDims ? new Vector3(targetDims.Lx_m, targetDims.Ly_m, targetDims.Lz_m) : null);
      const halfCanonical = basisHalfSize ?? (dimsCanonical ? dimsCanonical.clone().multiplyScalar(0.5) : null);
      const dims =
        dimsCanonical || targetDims
          ? {
              Lx_m: dimsCanonical?.x ?? targetDims?.Lx_m ?? HULL_DIM_MIN_M,
              Ly_m: dimsCanonical?.y ?? targetDims?.Ly_m ?? HULL_DIM_MIN_M,
              Lz_m: dimsCanonical?.z ?? targetDims?.Lz_m ?? HULL_DIM_MIN_M,
            }
          : undefined;
      const obb =
        centerCanonical && halfCanonical
          ? {
              center: [centerCanonical.x, centerCanonical.y, centerCanonical.z] as [number, number, number],
              halfSize: [halfCanonical.x, halfCanonical.y, halfCanonical.z] as [number, number, number],
              axes: [
                basisResolved.right as [number, number, number],
                basisResolved.up as [number, number, number],
                basisResolved.forward as [number, number, number],
              ] as [[number, number, number], [number, number, number], [number, number, number]],
            }
          : undefined;
      const fitBounds = basisFitBounds ?? undefined;

      const lodFull: HullPreviewLOD = {
        tag: "full",
        glbUrl: activeGlbUrl,
        triangleCount: hullMetrics?.triangleCount ?? undefined,
        vertexCount: hullMetrics?.vertexCount ?? undefined,
        fitBounds,
      };

      const swapCode = (axis: "x" | "y" | "z") => (axis === "x" ? 0 : axis === "y" ? 1 : 2);
      const basisSignatureParts = [
        swapCode(basisResolved.swap.x),
        swapCode(basisResolved.swap.y),
        swapCode(basisResolved.swap.z),
        basisResolved.flip.x ? 1 : 0,
        basisResolved.flip.y ? 1 : 0,
        basisResolved.flip.z ? 1 : 0,
        basisResolved.scale[0],
        basisResolved.scale[1],
        basisResolved.scale[2],
      ];

      const merged = mergedGeometry ?? mergeSceneGeometry(model);
      let coarseGeometry = decimatedGeometry?.geometry ?? null;
      let decimation = decimatedGeometry?.decimation ?? null;
      if (!coarseGeometry && merged) {
        const targetBudget =
          merged.triangleCount > 0
            ? Math.min(15000, Math.max(4000, Math.floor(merged.triangleCount * 0.25)))
            : 8000;
        const decimated = decimateIndexedGeometry(merged, targetBudget);
        coarseGeometry = decimated.geometry;
        decimation = decimated.decimation;
      }

      let meshHash: string | undefined = meshHashState?.meshHash;
      if (!meshHash && coarseGeometry) {
        meshHash = await buildMeshHash(coarseGeometry, [
          scale[0],
          scale[1],
          scale[2],
          ...basisSignatureParts,
          ...(dims ? [dims.Lx_m, dims.Ly_m, dims.Lz_m] : []),
        ]);
      }

      const uploadMeta = uploadBufferRef.current?.buffer
        ? await uploadHullPreviewGlb({
            buffer: uploadBufferRef.current.buffer,
            meshHash,
            name: uploadBufferRef.current.name,
          })
        : null;
      const resolvedGlbUrl = uploadMeta?.glbUrl ?? activeGlbUrl;
      const resolvedMeshHash = meshHash ?? uploadMeta?.meshHash;
      const previewUpdatedAt = uploadMeta?.updatedAt ?? Date.now();
      if (resolvedGlbUrl !== lodFull.glbUrl) {
        lodFull.glbUrl = resolvedGlbUrl;
      }
      meshHash = resolvedMeshHash;

      let lodCoarse: HullPreviewLOD | undefined;
      if (coarseGeometry) {
        lodCoarse = {
          tag: "coarse",
          glbUrl: resolvedGlbUrl,
          meshHash,
          triangleCount: coarseGeometry.triangleCount,
          vertexCount: coarseGeometry.vertexCount,
          byteLength: coarseGeometry.byteLength,
          indexedGeometry: serializeIndexedGeometry(coarseGeometry),
          decimation: decimation ?? undefined,
          fitBounds,
        };
      }

      if (merged) {
        lodFull.meshHash = lodFull.meshHash ?? meshHash;
        lodFull.triangleCount = lodFull.triangleCount ?? merged.triangleCount;
        lodFull.vertexCount = lodFull.vertexCount ?? merged.vertexCount;
        lodFull.byteLength = lodFull.byteLength ?? merged.byteLength;
      }

      const lods: HullPreviewLOD[] = [];
      if (lodCoarse) lods.push(lodCoarse);
      lods.push(lodFull);

      const storeKey = meshHash ?? lodFull.meshHash;
      if (storeKey && uploadBufferRef.current?.buffer) {
        await savePreviewGlbBuffer(storeKey, uploadBufferRef.current.buffer);
      }

      const payload: HullPreviewPayload = {
        version: "v1",
        glbUrl: resolvedGlbUrl,
        meshHash,
        basis,
        scale: [scale[0], scale[1], scale[2]] as [number, number, number],
        targetDims: dims,
        hullMetrics: hullMetrics ?? null,
        area_m2,
        areaUnc_m2: area_m2_unc,
        updatedAt: previewUpdatedAt,
        obb,
        provenance: "preview",
        clampReasons: [],
        precomputed: precomputeStatus.bundle ?? null,
        mesh: {
          glbUrl: resolvedGlbUrl,
          meshHash,
          basis,
          obb,
          lods,
          coarseLod: lodCoarse,
          fullLod: lodFull,
          provenance: "preview",
          clampReasons: [],
        },
        lods,
        lodCoarse,
        lodFull,
      };

      const serialized = JSON.stringify(payload);
      localStorage.setItem(HULL_PREVIEW_STORAGE_KEY, serialized);
      window.dispatchEvent(new CustomEvent("phoenix-hull-preview"));
    } catch (err) {
      console.warn("[ModelSilhouettePanel] failed to sync hull preview", err);
    } finally {
      setSyncingPreview(false);
    }
  }, [
    activeGlbUrl,
    baseBounds,
    basis,
    basisAppliedDimsVec,
    basisCenter,
    basisHalfSize,
    basisFitBounds,
    basisResolved,
    hullMetrics,
    model,
    mergedGeometry,
    decimatedGeometry,
    meshHashState?.meshHash,
    meshHashState?.basisSignature,
    precomputeStatus.bundle,
    scaledHullDims,
    scale,
    targetDims,
  ]);

  useEffect(() => {
    if (!autoPreviewPending) return;
    if (loading || hullMetricsLoading || syncingPreview) return;
    if (!activeGlbUrl) return;
    const dimsReady = Boolean(targetDims || hullMetrics || baseBounds);
    if (!dimsReady) return;
    (async () => {
      try {
        await handleSaveHullPreview();
      } finally {
        setAutoPreviewPending(false);
      }
    })();
  }, [autoPreviewPending, loading, hullMetricsLoading, syncingPreview, activeGlbUrl, targetDims, hullMetrics, baseBounds, handleSaveHullPreview]);

  const handleCanvasCreated = useCallback((state: RootState) => {
    const renderer = state.gl as WebGLRenderer;
    rendererRef.current = renderer;
    releaseRendererRef.current();
    releaseRendererRef.current = () => {};
    const canvas = renderer.domElement;

    const onLost = (event: Event) => {
      event.preventDefault();
      console.warn("[ModelSilhouettePanel] WebGL context lost");
    };
    const onRestored = () => {
      console.info("[ModelSilhouettePanel] WebGL context restored");
    };

    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);

    const release = registerWebGLContext(renderer.getContext(), {
      label: "ModelSilhouettePanel",
      onDispose: () => {
        canvas.removeEventListener("webglcontextlost", onLost, false);
        canvas.removeEventListener("webglcontextrestored", onRestored, false);
        try {
          renderer.forceContextLoss?.();
        } catch (err) {
          console.warn("[ModelSilhouettePanel] forceContextLoss failed", err);
        }
        renderer.dispose();
      },
    });

    releaseRendererRef.current = release;
  }, []);

  const scaledDimsLabel =
    scaledHullDims && scaledCenter
      ? `${formatDim(scaledHullDims.x)} x ${formatDim(scaledHullDims.y)} x ${formatDim(scaledHullDims.z)} (center ${formatDim(scaledCenter.x)}, ${formatDim(scaledCenter.y)}, ${formatDim(scaledCenter.z)})`
      : "n/a";
  const basisDimsLabel =
    basisAppliedDims && basisCenter
      ? `${formatDim(basisAppliedDims.Lx_m)} x ${formatDim(basisAppliedDims.Ly_m)} x ${formatDim(basisAppliedDims.Lz_m)} (basis center ${formatDim(basisCenter.x)}, ${formatDim(basisCenter.y)}, ${formatDim(basisCenter.z)})`
      : basisAppliedDims
        ? `${formatDim(basisAppliedDims.Lx_m)} x ${formatDim(basisAppliedDims.Ly_m)} x ${formatDim(basisAppliedDims.Lz_m)}`
        : "n/a";
  const basisSwapLabel = `${basisResolved.swap.x.toUpperCase()}→X, ${basisResolved.swap.y.toUpperCase()}→Y, ${basisResolved.swap.z.toUpperCase()}→Z`;
  const basisFlipLabel = (["x", "y", "z"] as const)
    .filter((axis) => basisResolved.flip[axis])
    .map((axis) => axis.toUpperCase())
    .join(", ");
  const basisScaleLabel = `${basisResolved.scale[0].toFixed(2)} / ${basisResolved.scale[1].toFixed(2)} / ${basisResolved.scale[2].toFixed(2)}`;

  const sceneBounds = useMemo<Bounds | null>(() => {
    if (!baseBounds) return null;
    if (!baseHullDims) return baseBounds;
    return {
      size: baseHullDims.clone(),
      center: baseBounds.center.clone(),
      radius: baseBounds.radius,
    };
  }, [baseBounds, baseHullDims]);

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Helix start: shape / bbox</p>
          <h1 className="text-2xl font-semibold text-white">Silhouette Stretch Panel</h1>
          <p className="text-sm text-slate-300">
            Load any GLB, measure its hull silhouette (PCA OBB), and overlay an ellipsoid while stretching axes independently.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-white/5 px-2 py-1">Grid + axes on by default</span>
            <span className="rounded-full bg-white/5 px-2 py-1">Ellipsoid overlay can be toggled</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-xs">
          <Badge variant="outline" className="border-cyan-400/50 bg-cyan-400/10 text-cyan-100">
            {modelName}
          </Badge>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
              <Ruler className="h-3.5 w-3.5" />
              Measured bbox
            </div>
            <div className="text-sm font-semibold text-white">{scaledDimsLabel}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
              <StretchHorizontal className="h-3 w-3 text-emerald-300" />
              Basis swap / flip
            </div>
            <div className="text-sm font-semibold text-white">{basisSwapLabel}</div>
            <div className="text-[11px] text-slate-400">
              Flip: {basisFlipLabel || "none"} · Scale: {basisScaleLabel}
            </div>
            <div className="text-[11px] text-slate-400">Basis dims: {basisDimsLabel}</div>
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 px-5 py-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <Scan className="h-5 w-5 text-cyan-300" />
              GLB viewport
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge className="border-white/10 bg-white/10 text-slate-100" variant="outline">
                Axes + grid
              </Badge>
              <Badge className="border-emerald-400/40 bg-emerald-400/10 text-emerald-100" variant="outline">
                Ellipsoid {showEllipsoid ? "on" : "off"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div
              className={`h-[480px] overflow-hidden rounded-xl border ${isDragActive ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-[#0b1222]"}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
                if (!isDragActive) setIsDragActive(true);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = Array.from(event.dataTransfer?.files ?? []).find((f) =>
                  f.name.toLowerCase().endsWith(".glb"),
                );
                handleDropFile(file ?? null);
              }}
            >
              <Canvas camera={{ position: [3, 2, 3], fov: 55 }} onCreated={handleCanvasCreated}>
                <ModelScene model={modelClone} baseBounds={sceneBounds} scale={scale} showEllipsoid={showEllipsoid} fitToken={fitToken} />
              </Canvas>
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-cyan-200" />
                  <span className="text-sm text-cyan-100">Loading GLB...</span>
                </div>
              ) : null}
              {isDragActive ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-emerald-500/10">
                  <div className="rounded-lg border border-emerald-400/60 bg-emerald-600/20 px-4 py-3 text-center text-sm text-emerald-50 shadow-lg">
                    Drop a .glb to auto-measure and save a hull preview
                  </div>
                </div>
              ) : null}
            </div>
            {loadError ? (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{loadError}</div>
            ) : (
              <div className="mt-3 text-xs text-slate-400">Uses native units from the GLB; scaling stays centered to preserve silhouette.</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Box className="h-5 w-5 text-sky-300" />
                Load a model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                <Label htmlFor="glb-url" className="text-xs uppercase tracking-wide text-slate-400">
                  GLB URL
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="glb-url"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    className="flex-1 bg-slate-900/70"
                    placeholder="https://.../model.glb"
                  />
                  <Button size="sm" onClick={handleUrlSubmit} disabled={loading}>
                    Load
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleLoadPreset}
                    disabled={loading}
                  >
                    Needle preset
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="glb-file" className="text-xs uppercase tracking-wide text-slate-400">
                  Or drop a .glb file
                </Label>
                <Input id="glb-file" type="file" accept=".glb" onChange={handleFileChange} className="bg-slate-900/70" />
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="uppercase tracking-wide text-slate-400">Needle hull ellipsoid presets</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-200">1007 × 264 × 173 m</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => applyNeedlePreset("axis")} disabled={loading}>
                    Load axis-aligned
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyNeedlePreset("basis")} disabled={loading}>
                    Load basis-swapped
                  </Button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  Loads the card fixtures sized to the needle hull and presets target dims so overlays and the hull preview match.
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span>Ellipsoid overlay</span>
                <Switch checked={showEllipsoid} onCheckedChange={setShowEllipsoid} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-white/5 px-2 py-1">Active: {modelName}</span>
                <span className="rounded-full bg-white/5 px-2 py-1">BBox {scaledSize ? "ready" : "pending"}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="uppercase tracking-wide text-slate-400">Offline precompute</span>
                  <Badge
                    variant="outline"
                    className={
                      precomputeStatus.state === "found"
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                        : precomputeStatus.state === "checking"
                          ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                          : precomputeStatus.state === "error"
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                            : "border-slate-400/40 bg-slate-500/10 text-slate-100"
                    }
                  >
                    {precomputeStatus.state === "found"
                      ? "Available"
                      : precomputeStatus.state === "checking"
                        ? "Checking..."
                        : precomputeStatus.state === "error"
                          ? "Error"
                          : "Not found"}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {meshHashState?.meshHash
                    ? `mesh ${meshHashState.meshHash.slice(0, 8)}… · basis ${meshHashState?.basisSignature?.slice(0, 8) ?? "—"}`
                    : "Waiting for mesh hash..."}
                </div>
                {precomputeStatus.bundle?.sourcePath ? (
                  <div className="text-[11px] text-slate-500">{precomputeStatus.bundle.sourcePath}</div>
                ) : null}
                <div className="mt-2 text-[11px] text-slate-500">
                  Auto-attaches precomputed lattice assets on upload; looks in {PRECOMPUTE_BASE_PATH}.
                </div>
                {offlineWarnings.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-amber-100">
                    {offlineWarnings.map((warning, idx) => (
                      <li key={`${warning}-${idx}`}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-[11px] text-slate-500">Within offline limits.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <StretchHorizontal className="h-5 w-5 text-emerald-300" />
                Non-uniform scale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {(["X (length)", "Y (height)", "Z (width)"] as const).map((label, idx) => (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-2">
                      {idx === 0 ? <StretchHorizontal className="h-4 w-4 text-cyan-300" /> : idx === 1 ? <StretchVertical className="h-4 w-4 text-emerald-300" /> : <Ruler className="h-4 w-4 text-indigo-300" />}
                      {label}
                    </span>
                    <span className="font-mono text-white">{scale[idx].toFixed(2)}x</span>
                  </div>
                  <Slider
                    value={[scale[idx]]}
                    min={0.25}
                    max={3}
                    step={0.01}
                    onValueChange={(values) => handleScaleChange(idx as 0 | 1 | 2, values[0] ?? scale[idx])}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleResetScale}>
                  Reset scales
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFitToken((t) => t + 1)}>
                  Refit view
                </Button>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] uppercase tracking-wide text-slate-400">Fit to silhouette (hull OBB)</div>
                  <Button size="sm" onClick={handleFitToSilhouette} disabled={hullMetricsLoading || !targetDims}>
                    {hullMetricsLoading ? "Measuring..." : "Fit to silhouette"}
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {(["Lx_m", "Ly_m", "Lz_m"] as const).map((key) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-slate-200"
                    >
                      <span className="text-slate-300">{key.replace("_m", "").toUpperCase()}</span>
                      <Input
                        type="number"
                        min={HULL_DIM_MIN_M}
                        max={HULL_DIM_MAX_M}
                        step="0.01"
                        value={targetDims?.[key] ?? ""}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          setTargetDims((prev) => {
                            const base: HullDims =
                              prev ??
                              (baseHullDims
                                ? { Lx_m: baseHullDims.x, Ly_m: baseHullDims.y, Lz_m: baseHullDims.z }
                                : { Lx_m: HULL_DIM_MIN_M, Ly_m: HULL_DIM_MIN_M, Lz_m: HULL_DIM_MIN_M });
                            const clamped = Number.isFinite(raw)
                              ? Math.min(HULL_DIM_MAX_M, Math.max(HULL_DIM_MIN_M, Math.abs(raw)))
                              : (base as any)[key];
                            return { ...base, [key]: clamped };
                          });
                        }}
                        className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-right text-white focus:border-sky-400"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {hullMetricsError
                    ? `Hull metric error: ${hullMetricsError}`
                    : "Scales axes so the measured hull silhouette (PCA OBB) matches the target dims; uses full GLB skin, not the ellipsoid surrogate."}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleSaveHullPreview} disabled={!activeGlbUrl || syncingPreview}>
                    {syncingPreview ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      "Save hull preview"
                    )}
                  </Button>
                  <span className="text-[11px] text-slate-400">
                    Saves URL, scale, and measured dimensions/area for hull developer tools (local only).
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Ruler className="h-5 w-5 text-amber-300" />
                Measurements
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm text-slate-200">
          <Metric label="Scaled hull dims" value={scaledHullDims ? `${formatDim(scaledHullDims.x)} x ${formatDim(scaledHullDims.y)} x ${formatDim(scaledHullDims.z)}` : "n/a"} hint="Hull OBB * per-axis scale" />
          <Metric
            label="Basis-applied dims"
            value={basisAppliedDims ? `${formatDim(basisAppliedDims.Lx_m)} x ${formatDim(basisAppliedDims.Ly_m)} x ${formatDim(basisAppliedDims.Lz_m)}` : "n/a"}
            hint="Swap/flip/scale applied (target dims sent to preview)"
          />
          <Metric label="BBox volume" value={boxVolume !== null && boxVolume !== undefined ? `${formatVolume(boxVolume)}^3` : "n/a"} hint="Derived from scaled hull" />
          <Metric label="Ellipsoid radii" value={ellipsoidRadii ? `${formatDim(ellipsoidRadii.x)}, ${formatDim(ellipsoidRadii.y)}, ${formatDim(ellipsoidRadii.z)}` : "n/a"} hint="Half of hull dims" />
          <Metric label="Ellipsoid volume" value={ellipsoidVolume !== null && ellipsoidVolume !== undefined ? `${formatVolume(ellipsoidVolume)}` : "n/a"} hint="4/3 pi * abc" />
          <Metric label="Center" value={scaledCenter ? `${formatDim(scaledCenter.x)}, ${formatDim(scaledCenter.y)}, ${formatDim(scaledCenter.z)}` : "n/a"} hint="After scaling" />
          <Metric label="Fit radius" value={sceneBounds ? formatDim(sceneBounds.radius * Math.max(...scale)) : "n/a"} hint="Used for camera fit" />
              <Metric label="Hull area (raw)" value={hullMetrics ? `${formatArea(hullMetrics.area_m2)} m^2` : "n/a"} hint="Measured on GLB skin (unscaled)" />
              <Metric
                label="Mesh stats"
                value={hullMetrics ? `${hullMetrics.triangleCount} tris / ${hullMetrics.vertexCount} verts` : "n/a"}
                hint={hullMetrics ? `Method: ${hullMetrics.method}` : "Load a GLB to measure"}
              />
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
