import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BufferGeometry, Matrix4, Quaternion, Vector3 } from "three";
import { clampHullArea, clampHullDims, HULL_AREA_MIN_M2, HULL_DIM_MIN_M } from "./hull-guardrails";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

type AxisLabel = "x" | "y" | "z";

export type HullMetricsOptions = {
  unitScale?: number;
  axisSwap?: { x?: AxisLabel; y?: AxisLabel; z?: AxisLabel };
  axisFlip?: { x?: boolean; y?: boolean; z?: boolean };
  previewScale?: [number, number, number];
  previewRotationQuat?: [number, number, number, number];
  previewOffset?: [number, number, number];
  areaUncertaintyRatio?: number;
  signal?: AbortSignal;
  sectorCount?: number;
};

export type HullMetrics = {
  dims_m: { Lx_m: number; Ly_m: number; Lz_m: number };
  area_m2: number;
  areaUnc_m2?: number;
  method: "OBB_PCA";
  areaRatio?: number;
  areaPerSector_m2?: number[];
  sectorCount?: number;
  triangleCount: number;
  vertexCount: number;
};

const DEFAULT_AXIS_MAP: { x: AxisLabel; y: AxisLabel; z: AxisLabel } = { x: "x", y: "y", z: "z" };
const EPS = 1e-12;

const isFiniteVec = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const validateAxisMap = (map?: HullMetricsOptions["axisSwap"]) => {
  if (!map) return DEFAULT_AXIS_MAP;
  const merged = {
    x: map.x ?? DEFAULT_AXIS_MAP.x,
    y: map.y ?? DEFAULT_AXIS_MAP.y,
    z: map.z ?? DEFAULT_AXIS_MAP.z,
  };
  const set = new Set([merged.x, merged.y, merged.z]);
  return set.size === 3 ? merged : DEFAULT_AXIS_MAP;
};

const buildPreviewMatrix = (opts: HullMetricsOptions) => {
  const scale = opts.previewScale ?? [1, 1, 1];
  const offset = opts.previewOffset ?? [0, 0, 0];
  const rot = opts.previewRotationQuat ?? [0, 0, 0, 1];
  const matrix = new Matrix4();
  matrix.compose(
    new Vector3(offset[0], offset[1], offset[2]),
    new Quaternion(rot[0], rot[1], rot[2], rot[3]).normalize(),
    new Vector3(scale[0], scale[1], scale[2]),
  );
  return matrix;
};

const remapAxes = (v: Vector3, map: { x: AxisLabel; y: AxisLabel; z: AxisLabel }, flip: HullMetricsOptions["axisFlip"]) => {
  const fx = flip?.x ? -1 : 1;
  const fy = flip?.y ? -1 : 1;
  const fz = flip?.z ? -1 : 1;
  const source = { x: v.x, y: v.y, z: v.z };
  v.set(
    source[map.x] * fx,
    source[map.y] * fy,
    source[map.z] * fz,
  );
  return v;
};

const symmetricEigenDecomposition = (mat: [number, number, number, number, number, number]) => {
  // mat = [m00, m01, m02, m11, m12, m22] (symmetric)
  const m = new Float64Array([
    mat[0], mat[1], mat[2],
    mat[1], mat[3], mat[4],
    mat[2], mat[4], mat[5],
  ]);
  const v = new Float64Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);

  const idx = (r: number, c: number) => 3 * r + c;
  const get = (r: number, c: number) => m[idx(r, c)];
  const set = (r: number, c: number, val: number) => { m[idx(r, c)] = val; m[idx(c, r)] = val; };

  for (let iter = 0; iter < 32; iter++) {
    const m01 = Math.abs(get(0, 1));
    const m02 = Math.abs(get(0, 2));
    const m12 = Math.abs(get(1, 2));
    let p = 0, q = 1, max = m01;
    if (m02 > max) { max = m02; p = 0; q = 2; }
    if (m12 > max) { max = m12; p = 1; q = 2; }
    if (max < 1e-15) break;

    const mpq = get(p, q);
    const tau = (get(q, q) - get(p, p)) / (2 * mpq);
    const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    const app = get(p, p);
    const aqq = get(q, q);
    set(p, p, app - t * mpq);
    set(q, q, aqq + t * mpq);
    set(p, q, 0);

    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = get(r, p);
      const arq = get(r, q);
      set(r, p, c * arp - s * arq);
      set(r, q, c * arq + s * arp);
    }

    for (let r = 0; r < 3; r++) {
      const vrp = v[idx(r, p)];
      const vrq = v[idx(r, q)];
      v[idx(r, p)] = c * vrp - s * vrq;
      v[idx(r, q)] = c * vrq + s * vrp;
    }
  }

  const eigVals: [number, number, number] = [m[0], m[4], m[8]];
  const eigVecs: [Vector3, Vector3, Vector3] = [
    new Vector3(v[0], v[3], v[6]),
    new Vector3(v[1], v[4], v[7]),
    new Vector3(v[2], v[5], v[8]),
  ];

  const order = [0, 1, 2].sort((a, b) => eigVals[b] - eigVals[a]);
  return {
    values: order.map((i) => eigVals[i]) as [number, number, number],
    vectors: order.map((i) => eigVecs[i].normalize()) as [Vector3, Vector3, Vector3],
  };
};

const ellipsoidArea = (a: number, b: number, c: number) => {
  if (!(a > 0 && b > 0 && c > 0)) return NaN;
  const p = 1.6075;
  const mean = (Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3;
  return 4 * Math.PI * Math.pow(mean, 1 / p);
};

const buildAbortError = () => {
  try { return new DOMException("Aborted", "AbortError"); } catch { return new Error("Aborted"); }
};

export async function loadHullMetricsFromGLB(glbUrl: string, opts: HullMetricsOptions = {}): Promise<HullMetrics> {
  if (opts.signal?.aborted) throw buildAbortError();
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbUrl);
  if (opts.signal?.aborted) throw buildAbortError();

  gltf.scene.updateMatrixWorld(true);

  const axisMap = validateAxisMap(opts.axisSwap);
  const axisFlip = opts.axisFlip;
  const unitScale = Number.isFinite(opts.unitScale) && (opts.unitScale as number) > 0 ? (opts.unitScale as number) : 1;
  const previewMatrix = buildPreviewMatrix(opts);
  const sectorCount = Math.max(1, Math.floor(opts.sectorCount ?? PROMOTED_WARP_PROFILE.sectorCount));
  const areaBySector = new Array(sectorCount).fill(0);

  let sumX = 0, sumY = 0, sumZ = 0;
  let sumXX = 0, sumXY = 0, sumXZ = 0, sumYY = 0, sumYZ = 0, sumZZ = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let area_m2 = 0;

  const buffers: Array<{ vertices: Float64Array; valid: Uint8Array; count: number }> = [];
  const scratch = new Vector3();
  const d1 = new Vector3();
  const d2 = new Vector3();
  const cross = new Vector3();
  const world = new Matrix4();

  gltf.scene.traverse((node) => {
    // @ts-expect-error drei loaders mark meshes with isMesh
    if (!node?.isMesh) return;
    const mesh = node as { geometry?: BufferGeometry; matrixWorld: Matrix4; updateWorldMatrix: (a: boolean, b: boolean) => void };
    const geometry = mesh.geometry;
    if (!geometry) return;

    mesh.updateWorldMatrix(true, true);
    world.copy(previewMatrix).multiply(mesh.matrixWorld);

    const position = geometry.getAttribute("position");
    if (!position) return;

    const verts = new Float64Array(position.count * 3);
    const valid = new Uint8Array(position.count);

    for (let i = 0; i < position.count; i++) {
      scratch.fromBufferAttribute(position, i);
      scratch.applyMatrix4(world);
      remapAxes(scratch, axisMap, axisFlip);
      scratch.multiplyScalar(unitScale);
      if (!isFiniteVec(scratch)) continue;

      const idx = i * 3;
      verts[idx] = scratch.x;
      verts[idx + 1] = scratch.y;
      verts[idx + 2] = scratch.z;
      valid[i] = 1;

      sumX += scratch.x; sumY += scratch.y; sumZ += scratch.z;
      sumXX += scratch.x * scratch.x;
      sumXY += scratch.x * scratch.y;
      sumXZ += scratch.x * scratch.z;
      sumYY += scratch.y * scratch.y;
      sumYZ += scratch.y * scratch.z;
      sumZZ += scratch.z * scratch.z;
      vertexCount += 1;
    }

    const index = geometry.getIndex();
    const indexArray = index ? (index.array as ArrayLike<number>) : null;
    const triCount = indexArray ? Math.floor(indexArray.length / 3) : Math.floor(position.count / 3);

    for (let i = 0; i < triCount; i++) {
      const i0 = indexArray ? indexArray[i * 3] : i * 3;
      const i1 = indexArray ? indexArray[i * 3 + 1] : i * 3 + 1;
      const i2 = indexArray ? indexArray[i * 3 + 2] : i * 3 + 2;
      if (i0 == null || i1 == null || i2 == null) continue;
      if (valid[i0] !== 1 || valid[i1] !== 1 || valid[i2] !== 1) continue;

      scratch.fromArray(verts, i0 * 3);
      d1.fromArray(verts, i1 * 3);
      d2.fromArray(verts, i2 * 3);

      const v0x = scratch.x, v0y = scratch.y, v0z = scratch.z;
      const v1x = d1.x, v1y = d1.y, v1z = d1.z;
      const v2x = d2.x, v2y = d2.y, v2z = d2.z;

      d1.sub(scratch);
      d2.sub(scratch);
      cross.copy(d1).cross(d2);
      const triArea = 0.5 * cross.length();
      if (Number.isFinite(triArea)) {
        area_m2 += triArea;
        triangleCount += 1;
        const cx = (v0x + v1x + v2x) / 3;
        const cz = (v0z + v1z + v2z) / 3;
        const theta = Math.atan2(cz, cx);
        const u = (theta < 0 ? theta + 2 * Math.PI : theta) / (2 * Math.PI);
        const sectorIdx = Math.min(sectorCount - 1, Math.floor(u * sectorCount));
        areaBySector[sectorIdx] += triArea;
      }
    }

    buffers.push({ vertices: verts, valid, count: position.count });
  });

  if (vertexCount === 0) {
    throw new Error("No valid vertices found in GLB");
  }

  const n = vertexCount;
  const meanX = sumX / n, meanY = sumY / n, meanZ = sumZ / n;
  const cov: [number, number, number, number, number, number] = [
    sumXX / n - meanX * meanX,
    sumXY / n - meanX * meanY,
    sumXZ / n - meanX * meanZ,
    sumYY / n - meanY * meanY,
    sumYZ / n - meanY * meanZ,
    sumZZ / n - meanZ * meanZ,
  ];

  const eig = symmetricEigenDecomposition(cov);
  const [axis0, axis1, axis2] = eig.vectors;

  let min0 = Infinity, max0 = -Infinity;
  let min1 = Infinity, max1 = -Infinity;
  let min2 = Infinity, max2 = -Infinity;

  for (const buf of buffers) {
    const { vertices, valid, count } = buf;
    for (let i = 0; i < count; i++) {
      if (valid[i] !== 1) continue;
      const x = vertices[i * 3];
      const y = vertices[i * 3 + 1];
      const z = vertices[i * 3 + 2];
      const p0 = axis0.x * x + axis0.y * y + axis0.z * z;
      const p1 = axis1.x * x + axis1.y * y + axis1.z * z;
      const p2 = axis2.x * x + axis2.y * y + axis2.z * z;
      if (p0 < min0) min0 = p0;
      if (p0 > max0) max0 = p0;
      if (p1 < min1) min1 = p1;
      if (p1 > max1) max1 = p1;
      if (p2 < min2) min2 = p2;
      if (p2 > max2) max2 = p2;
    }
  }

  const Lx_m = max0 - min0;
  const Ly_m = max1 - min1;
  const Lz_m = max2 - min2;

  const clampedDims = clampHullDims({
    Lx_m: Number.isFinite(Lx_m) && Lx_m > EPS ? Lx_m : undefined,
    Ly_m: Number.isFinite(Ly_m) && Ly_m > EPS ? Ly_m : undefined,
    Lz_m: Number.isFinite(Lz_m) && Lz_m > EPS ? Lz_m : undefined,
  });

  const dims_m = {
    Lx_m: clampedDims.Lx_m ?? HULL_DIM_MIN_M,
    Ly_m: clampedDims.Ly_m ?? HULL_DIM_MIN_M,
    Lz_m: clampedDims.Lz_m ?? HULL_DIM_MIN_M,
  };

  const area_m2_clamped = clampHullArea(area_m2) ?? HULL_AREA_MIN_M2;
  const areaUnc_m2 = clampHullArea(
    Number.isFinite(opts.areaUncertaintyRatio) && (opts.areaUncertaintyRatio as number) > 0
      ? area_m2 * (opts.areaUncertaintyRatio as number)
      : undefined,
    true,
  );

  const ellipsoidArea_m2 = ellipsoidArea(dims_m.Lx_m * 0.5, dims_m.Ly_m * 0.5, dims_m.Lz_m * 0.5);
  const areaRatio = Number.isFinite(ellipsoidArea_m2) && ellipsoidArea_m2 > EPS ? area_m2_clamped / ellipsoidArea_m2 : undefined;
  const areaPerSector_m2 = areaBySector.length ? areaBySector.map((v) => Number.isFinite(v) ? v : 0) : undefined;

  return {
    dims_m,
    area_m2: area_m2_clamped,
    areaUnc_m2,
    method: "OBB_PCA",
    areaRatio,
    areaPerSector_m2,
    sectorCount,
    triangleCount,
    vertexCount,
  };
}

