import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { subscribeDriveIntent, type DriveIntentState } from "@/lib/drive-intent-channel";
import { queryClient } from "@/lib/queryClient";
import {
  useHull3DSharedStore,
  type HullCameraState,
  type HullSpacetimeGridPrefs,
  type HullVolumeDomain,
  type HullVolumeSource,
} from "@/store/useHull3DSharedStore";
import {
  curvaturePaletteIndex,
  isCurvatureDirectiveEnabled,
  type CurvatureDirective,
} from "@/lib/curvature-directive";
import { colorizeWireframeOverlay, type WireframeContactPatch, type WireframeOverlayBuffers } from "@/lib/resolve-wireframe-overlay";
import { divergeThetaColor, resolveSpacetimeGridThetaNorm } from "@/lib/spacetime-grid";
import { encodeHullDistanceTsdfRG8, type HullDistanceGrid } from "@/lib/lattice-sdf";
import type { HullSurfaceVoxelVolume } from "@/lib/lattice-surface";
import type { LatticeFrame, LatticeProfileTag, LatticeQualityPreset } from "@/lib/lattice-frame";
import { LATTICE_PROFILE_PERF, estimateLatticeUploadBytes } from "@/lib/lattice-perf";
import { buildFluxStreamlines, type FluxStreamlineSettings, type FluxVectorField } from "@/lib/flux-streamlines";
import {
  OBSERVER_DIRECTION_OVERLAY_CHANNEL,
  OBSERVER_ROBUST_SELECTION_CHANNEL,
  buildObserverDirectionField,
  buildObserverFrameField,
  type ObserverDirectionOverlayConfig,
  type ObserverConditionKey,
  type ObserverFrameKey,
  type ObserverRobustSelection,
} from "@/lib/stress-energy-brick";
import {
  DEFAULT_GEODESIC_DIAGNOSTICS_CHANNEL,
  DEFAULT_METRIC_VOLUME_CHANNEL,
  type HullGeodesicDiagnostics,
  type HullMetricVolumeContract,
} from "@/lib/metric-volume-contract";
import { metricModeFromWarpFieldType, type MetricModeId } from "@shared/metric-eval";
import type { WarpFieldType } from "@shared/schema";



/**



 * Hull3DRenderer



 * ---------------------------------------------------------------------------



 * WebGL2 volume renderer for the theta (Hull 3D) view. The renderer manages:



 *   - Radial LUT (1 x RADIAL_SIZE) sampling dTopHatDr in metric space



 */







const RADIAL_SIZE = 256;



const RADIAL_METRIC_RADIUS = 1;



const RADIAL_SAMPLE_R_MAX = 1.8;



const RADIAL_LUT_SCALE = (RADIAL_SIZE - 1) / RADIAL_SAMPLE_R_MAX;



const RING_SIZE = 2048;



const TWO_PI = Math.PI * 2;



const DEFAULT_DOMAIN_SCALE = 1.3;
const DOMAIN_GRID_MAX_LINES = 900;



const DEFAULT_OPACITY_WINDOW: [number, number] = [0.05, 0.35];



const DEFAULT_EMA_ALPHA = 0.12;



const AVG_UPDATE_INTERVAL_MS = 1000 / 20; // ~20 Hz (within 15-30 Hz target)



const INV16PI = 1 / (16 * Math.PI);

const CURVATURE_GAIN_MAX = 6;

const CURVATURE_BOOST_MAX = 40;

const LATTICE_UPLOAD_BUDGET_MBPS: Record<LatticeProfileTag, number> = Object.freeze({
  preview: 64,
  card: 256,
});

// Prefer half-float uploads once the float32 packed volume crosses this size.
const LATTICE_PREFER_HALF_FLOAT_UPLOAD_BYTES = 64 * 1024 * 1024;

const LATTICE_UPLOAD_MAX_DT_SEC = 0.25;

const SKYBOX_CONFIG_URL = "/skybox/warp-skybox.lut.json";
const SKYBOX_MAX_STEPS = 96;

type SkyboxConfig = {
  texture: string;
  exposure: number;
  rotation_deg: number;
  steps: number;
  step_scale: number;
  bend: number;
  shift_scale: number;
  max_dist: number;
};

const DEFAULT_SKYBOX_CONFIG: SkyboxConfig = {
  texture: "/skybox/warp-skybox.png",
  exposure: 1.1,
  rotation_deg: 0,
  steps: 48,
  step_scale: 0.06,
  bend: 0.7,
  shift_scale: 0.85,
  max_dist: 6.0,
};

const normalizeSkyboxConfig = (raw?: Partial<SkyboxConfig> | null): SkyboxConfig => {
  const src = raw && typeof raw === "object" ? raw : {};
  const numberFrom = (value: unknown, fallback: number, min?: number, max?: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };
  const stringFrom = (value: unknown, fallback: string) =>
    typeof value === "string" && value.length ? value : fallback;
  const steps = Math.round(
    numberFrom((src as SkyboxConfig).steps, DEFAULT_SKYBOX_CONFIG.steps, 1, SKYBOX_MAX_STEPS)
  );
  return {
    texture: stringFrom((src as SkyboxConfig).texture, DEFAULT_SKYBOX_CONFIG.texture),
    exposure: numberFrom((src as SkyboxConfig).exposure, DEFAULT_SKYBOX_CONFIG.exposure, 0.1, 8),
    rotation_deg: numberFrom(
      (src as SkyboxConfig).rotation_deg,
      DEFAULT_SKYBOX_CONFIG.rotation_deg,
      -180,
      180
    ),
    steps,
    step_scale: numberFrom(
      (src as SkyboxConfig).step_scale,
      DEFAULT_SKYBOX_CONFIG.step_scale,
      0.005,
      0.4
    ),
    bend: numberFrom((src as SkyboxConfig).bend, DEFAULT_SKYBOX_CONFIG.bend, 0, 4),
    shift_scale: numberFrom(
      (src as SkyboxConfig).shift_scale,
      DEFAULT_SKYBOX_CONFIG.shift_scale,
      0,
      4
    ),
    max_dist: numberFrom(
      (src as SkyboxConfig).max_dist,
      DEFAULT_SKYBOX_CONFIG.max_dist,
      1,
      20
    ),
  };
};

const latticeRailsForProfile = (tag?: LatticeProfileTag) =>
  LATTICE_PROFILE_PERF[tag ?? "preview"] ?? LATTICE_PROFILE_PERF.preview;

const wrapPhase01 = (value: number) => {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
};

const VOLUME_SOURCE_TO_INDEX: Record<Hull3DVolumeSource, 0 | 1 | 2> = {
  analytic: 0,
  lattice: 1,
  brick: 2,
};

const shortestPhaseDelta = (nextValue: number, prevValue: number) => {
  let delta = nextValue - prevValue;
  if (delta > 0.5) delta -= 1;
  if (delta <= -0.5) delta += 1;
  return delta;
};







type OverlayFlagKey =



  | "showHeatmapRing"



  | "showShellBands"



  | "showPhaseTracer"



  | "showReciprocity";







type OverlayToggleFlags = Partial<Record<OverlayFlagKey, boolean>>;







const OVERLAY_QUERY_KEY = ["helix:overlays"] as const;

type CurvStampGPU = {
  center?: [number, number, number];
  size?: [number, number, number];
  value?: number;
  format?: "float" | "byte";
};

declare global {
  interface Window {
    __hullCurvStampGPU?: CurvStampGPU;
  }
}

function stampCurvTex3D(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  dims: [number, number, number],
  opts?: CurvStampGPU,
) {
  if (!tex || !opts) return;
  const [nx, ny, nz] = dims;
  if (nx <= 0 || ny <= 0 || nz <= 0) return;

  const center = opts.center ?? [0.82, 0.18, 0.72];
  const size = opts.size ?? [0.05, 0.05, 0.05];
  const value = Math.min(1, Math.max(0, opts.value ?? 1));
  const format = opts.format ?? "float";

  const ix = Math.max(0, Math.min(nx - 1, Math.floor(center[0] * nx)));
  const iy = Math.max(0, Math.min(ny - 1, Math.floor(center[1] * ny)));
  const iz = Math.max(0, Math.min(nz - 1, Math.floor(center[2] * nz)));
  const sx = Math.max(1, Math.floor(size[0] * nx));
  const sy = Math.max(1, Math.floor(size[1] * ny));
  const sz = Math.max(1, Math.floor(size[2] * nz));

  const x0 = Math.max(0, Math.min(nx - sx, ix - (sx >> 1)));
  const y0 = Math.max(0, Math.min(ny - sy, iy - (sy >> 1)));
  const z0 = Math.max(0, Math.min(nz - sz, iz - (sz >> 1)));

  const prevBinding = gl.getParameter(gl.TEXTURE_BINDING_3D) as WebGLTexture | null;
  const prevAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  if (format === "float") {
    const buf = new Float32Array(sx * sy * sz);
    buf.fill(value);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, x0, y0, z0, sx, sy, sz, gl.RED, gl.FLOAT, buf);
  } else {
    const buf = new Uint8Array(sx * sy * sz);
    buf.fill(Math.round(value * 255));
    gl.texSubImage3D(gl.TEXTURE_3D, 0, x0, y0, z0, sx, sy, sz, gl.RED, gl.UNSIGNED_BYTE, buf);
  }

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, prevAlignment);
  gl.bindTexture(gl.TEXTURE_3D, prevBinding);
}







const DEFAULT_OVERLAY_FLAGS: OverlayToggleFlags = Object.freeze({
  showPhaseTracer: true,
});







function readOverlayFlags(): OverlayToggleFlags {



  try {



    return (



      (queryClient.getQueryData(OVERLAY_QUERY_KEY) as OverlayToggleFlags | undefined) ??



      DEFAULT_OVERLAY_FLAGS



    );



  } catch {



    return DEFAULT_OVERLAY_FLAGS;



  }



}











export type Hull3DRendererMode = "instant" | "average" | "blend";

export type Hull3DSkyboxMode = "off" | "flat" | "geodesic";



export type Hull3DQualityPreset = "auto" | "low" | "medium" | "high";



export type Hull3DVolumeViz =
  | "theta_gr"
  | "rho_gr"
  | "theta_drive"
  | "shear_gr"
  | "vorticity_gr"
  | "alpha";







export type Hull3DVolumeDomain = HullVolumeDomain;
export type Hull3DVolumeSource = HullVolumeSource;



const VOLUME_VIZ_TO_INDEX: Record<Hull3DVolumeViz, 0 | 1 | 2 | 3 | 4 | 5> = {



  theta_gr: 0,



  rho_gr: 1,



  theta_drive: 2,



  shear_gr: 3,



  vorticity_gr: 4,
  alpha: 5,



};



const VOLUME_DOMAIN_TO_INDEX: Record<HullVolumeDomain, 0 | 1> = {



  wallBand: 0,



  bubbleBox: 1,



};







export type HullGeometryMode = "ellipsoid" | "radial" | "sdf";

export type HullGateSource = "schedule" | "blanket" | "combined";

export interface Hull3DQualityOverrides {



  voxelDensity?: "low" | "medium" | "high";



  raySteps?: number;



  stepBias?: number;



}

export type HullDomainGridPrefs = {
  enabled?: boolean;
  spacing_m?: number;
  alpha?: number;
  color?: [number, number, number];
};

export type HullDemoGridPrefs = {
  enabled?: boolean;
  mode?: "replace" | "overlay";
  showLines?: boolean;
  showNodes?: boolean;
  pointSize?: number;
  lineAlpha?: number;
  pointAlpha?: number;
  pulseRate?: number;
  breathAmp?: number;
  breathRate?: number;
  alphaMin?: number;
};








export interface Hull3DOverlayState {



  phase?: number;



  kInvariants?: {



    enabled?: boolean;



    mode?: 0 | 1 | 2;



    gain?: number;



    alpha?: number;



  };



  thetaIso?: {



    enabled?: boolean;



    step: number;



    width?: number;



    opacity?: number;



  };



  fordRoman?: {



    enabled?: boolean;



    tauLC: number;



    burst: number;



    dwell: number;



    alpha?: number;



  };



  sectorArc?: {



    enabled?: boolean;



    radiusPx?: number;



    widthPx?: number;



    gapPx?: number;



    instantAlpha?: number;



    emaAlpha?: number;



  };



  sectorGrid?: {

    enabled?: boolean;

    mode?: "instant" | "ema" | "split";

    alpha?: number;

    isoAlpha?: number;

    phaseHue?: number;

    dutyWindow?: [number, number];

  };



  tilt?: {



    enabled?: boolean;



    dir?: [number, number];



    magnitude?: number;



    alpha?: number;



    gain?: number; // [tilt-gain]



    gainMode?: "manual" | "curvature"; // [tilt-gain]



  };



  greens?: {



    enabled?: boolean;



    texture?: WebGLTexture | null;



    sizePx?: [number, number];



    originPx?: [number, number];



    range?: [number, number];



    alpha?: number;



  };

  // Tensor-energy overlay: |T00| volume composited during ray-march
  t00?: {
    enabled?: boolean;
    alpha?: number; // 0..1 overlay opacity contribution per step
    gain?: number;  // transfer gain scalar
    range?: [number, number]; // optional display range (min,max)
  };

  curvature?: CurvatureDirective;
  domainGrid?: HullDomainGridPrefs;



  spacetimeGrid?: HullSpacetimeGridPrefs;
  demoGrid?: HullDemoGridPrefs;

}

export interface Hull3DSkyboxState {
  mode?: Hull3DSkyboxMode;
  exposure?: number;
}

export type FluxStreamlineConfig = {
  enabled?: boolean;
  seedCount?: number;
  seedRadius?: number;
  seedSpread?: number;
  stepCount?: number;
  stepScale?: number;
  minSpeedFraction?: number;
  bidirectional?: boolean;
  seed?: number;
};







type Overlay3DState = {
  mode: 0 | 1 | 2 | 3;
  mix: number;
  alpha: number;
  thick: number;
  gain: number;
  hue: number;
  phase01: number;
};


type CurvatureBrickMessage = {



  version: number;



  updatedAt: number;



  dims: [number, number, number];



  data: Float32Array;



  qiMargin?: Float32Array;



  emaAlpha?: number;



  residualMin?: number;



  residualMax?: number;



};

type MetricVolumeMessage = HullMetricVolumeContract & {
  channels?: Record<string, { data?: Float32Array | ArrayBuffer | ArrayLike<number>; min?: number; max?: number }>;
};

type LatticeStrobeHist = {
  vertices: Float32Array;
  triangles: Float32Array;
  triangleArea: Float32Array;
  triangleAreaTotal: number;
  triangleArea01: Float32Array;
  sectorCount: number;
};

type LatticeStrobeCoverage = {
  area: Float32Array;
  area01: Float32Array;
  vertices: Float32Array;
  vertices01: Float32Array;
  triangles: Float32Array;
  triangles01: Float32Array;
};

type LatticeStrobeState = {
  hash: string;
  source: "preview" | "fallback";
  lod: "preview" | "high";
  meshHash?: string;
  sectorCount?: number;
  triangleCount?: number;
  vertexCount?: number;
  clampReasons?: string[];
  hist?: LatticeStrobeHist | null;
  weights?: Float32Array | null;
  coverage?: LatticeStrobeCoverage | null;
} | null;

type PreviewMeshTextureSource = TexImageSource;

export type HullPreviewMeshPayload = {
  key: string;
  positions: Float32Array;
  indices?: Uint32Array | Uint16Array | null;
  uvs?: Float32Array | null;
  texture?: PreviewMeshTextureSource | null;
  color?: [number, number, number, number];
};

export interface Hull3DRendererState {



  axes: [number, number, number];



  geometry?: HullGeometryMode;



  hullRadiusLUT?: Float32Array | null;



  hullRadiusLUTSize?: [number, number] | null;



  hullRadiusMax?: number;



  hullSDF?: Float32Array | Uint8Array | null;



  hullSDFDims?: [number, number, number] | null;



  hullSDFBounds?: [number, number, number] | undefined;



  hullSDFBand?: number;



  hullSDFFormat?: "float" | "byte";



  R: number;



  sigma: number;



  beta: number;



  ampChain: number;

  exoticMass_kg?: number;

  exoticMassTarget_kg?: number;



  gate: number;



  gateView: number;



  gateSource?: HullGateSource;



  tilesPerSectorVector?: ArrayLike<number> | null;



  fActive: number;



  duty: number;



  // Multiplies volumetric densityScale to brighten/dim quickly (1 = neutral)



  exposure?: number;



  gaussianSigma: number;



  sectorCenter01: number;



  totalSectors: number;



  liveSectors: number;



  sectorFloor: number;



  lumpExp: number;



  splitEnabled: boolean;



  splitFrac: number;



  syncMode: number;



  phase01: number;



  phaseSign?: number;

  thetaSign?: number;



  // UI toggles



  showSectorRing: boolean;



  showGhostSlice: boolean;



  followPhase: boolean;



  volumeViz?: Hull3DVolumeViz;



  volumeDomain?: Hull3DVolumeDomain;
  volumeSource?: Hull3DVolumeSource;
  warpFieldType?: WarpFieldType;



  domainScale?: number;



  opacityWindow?: [number, number];



  camera?: HullCameraState | null;



  boundsProfile?: "tight" | "wide";



  blendFactor: number; // 0 = instant, 1 = average



  freeze: boolean;



  showSurfaceOverlay: boolean;



  betaOverlayEnabled?: boolean;



  betaTarget_ms2?: number;



  comfort_ms2?: number;



  hullDims?: [number, number, number];



  betaTexture?: WebGLTexture | null;



  betaUniform_ms2?: number;



  betaSampler?: ((u: number, v: number) => number) | null;



  // Diagnostics



  timeSec: number;



  bubbleStatus?: "NOMINAL" | "WARNING" | "CRITICAL";



  // Canvas aspect (provided by panel to keep camera in sync)



  aspect: number;



  vizFloorThetaGR?: number;



  vizFloorRhoGR?: number;



  vizFloorThetaDrive?: number;



  wireframeOverlay?: WireframeOverlayBuffers | null;
  previewMesh?: HullPreviewMeshPayload | null;



  overlays?: Hull3DOverlayState;
  skybox?: Hull3DSkyboxState;
  fluxStreamlines?: FluxStreamlineConfig;

  latticeFrame?: LatticeFrame | null;

  latticePreset?: LatticeQualityPreset;

  latticeProfileTag?: LatticeProfileTag;

  latticeClampReasons?: string[];

  latticeStrobe?: LatticeStrobeState;
  latticeSdf?: HullDistanceGrid | null;
  latticeVolume?: HullSurfaceVoxelVolume | null;
  latticeWeightMode?: "dynamic" | "baked";
  latticeWorldToLattice?: Float32Array | null;
  latticeMin?: [number, number, number] | null;
  latticeSize?: [number, number, number] | null;



}







export interface Hull3DRendererOptions {



  quality?: Hull3DQualityPreset;



  qualityOverrides?: Hull3DQualityOverrides;



  emaAlpha?: number;



}







type QualityProfile = {



  dims: [number, number, number];



  maxSteps: number;



  stepBias: number;



};



type QualityBudget = {



  maxDims: [number, number, number];



  minDims: [number, number, number];



  maxSteps: number;



  minSteps: number;



};



const QUALITY_PROFILES: Record<Exclude<Hull3DQualityPreset, "auto">, QualityProfile> = {



  low:    { dims: [128, 96, 128],  maxSteps: 56, stepBias: 0.65 },



  medium: { dims: [192, 144, 192], maxSteps: 72, stepBias: 0.52 },



  high:   { dims: [256, 192, 256], maxSteps: 96, stepBias: 0.42 },



};







const QUALITY_BUDGETS: Record<Exclude<Hull3DQualityPreset, "auto">, QualityBudget> = {



  low:    { maxDims: [160, 128, 160], minDims: [96, 72, 96], maxSteps: 72, minSteps: 24 },



  medium: { maxDims: [208, 156, 208], minDims: [112, 84, 112], maxSteps: 96, minSteps: 32 },



  high:   { maxDims: [256, 192, 256], minDims: [128, 96, 128], maxSteps: 128, minSteps: 40 },



};



const AUTO_QUALITY_BUDGET: QualityBudget = QUALITY_BUDGETS.medium;



const DEFAULT_BETA_TARGET = 9.80665;



const DEFAULT_COMFORT = 0.4 * 9.80665;







type Vec3 = [number, number, number];







const clamp = (x: number, min = -Infinity, max = Infinity) => Math.min(Math.max(x, min), max); // [tilt-gain]


// [tilt-gain] Dev console recipes (window.__tilt*) keep tilt gain falsifiable without UI toggles.

if (typeof window !== "undefined") { // [tilt-gain]



  // [tilt-gain] window.__surfaceDebugEcho = true;



  // [tilt-gain] window.__tiltBusScale = 1.0;



  // [tilt-gain] window.__tiltGainFactor = 1.0;



  // [tilt-gain] window.__tiltGainMode = "curvature"; // or "manual"



  // [tilt-gain] window.__tiltGainManual = 1.0;



  // [tilt-gain] window.dispatchEvent(new CustomEvent("hull3d:tilt", { detail: { enabled: true, dir: [0.707, 0.707], magnitude: 1, alpha: 1 } }));



  const tiltDev = window as any; // [tilt-gain]



  tiltDev.__tiltGainMode = tiltDev.__tiltGainMode ?? "curvature"; // [tilt-gain]



  tiltDev.__tiltGainManual = tiltDev.__tiltGainManual ?? 0.65; // [tilt-gain]



  tiltDev.__tiltGainFactor = tiltDev.__tiltGainFactor ?? 1.0; // [tilt-gain]



  tiltDev.__tiltBusScale = tiltDev.__tiltBusScale ?? 1.0; // [tilt-gain]



} // [tilt-gain]



class UniformCache {



  private readonly f1 = new Map<WebGLUniformLocation, number>();



  private readonly i1 = new Map<WebGLUniformLocation, number>();



  set1f(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, value: number) {



    if (!loc) return;



    if (this.f1.get(loc) === value) return;



    gl.uniform1f(loc, value);



    this.f1.set(loc, value);



  }



  set1i(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, value: number) {



    if (!loc) return;



    if (this.i1.get(loc) === value) return;



    gl.uniform1i(loc, value);



    this.i1.set(loc, value);



  }



}



const lerp = (a: number, b: number, t: number) => a + (b - a) * t;







const identity = (): Float32Array => {



  const m = new Float32Array(16);



  m[0] = m[5] = m[10] = m[15] = 1;



  return m;



};







const multiply = (out: Float32Array, a: Float32Array, b: Float32Array) => {



  for (let i = 0; i < 4; i++) {



    const ai0 = a[i]; const ai1 = a[i + 4]; const ai2 = a[i + 8]; const ai3 = a[i + 12];



    out[i]      = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];



    out[i + 4]  = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];



    out[i + 8]  = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];



    out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];



  }



  return out;



};







const perspective = (out: Float32Array, fovy: number, aspect: number, near: number, far: number) => {



  const f = 1.0 / Math.tan(fovy / 2);



  out.fill(0);



  out[0] = f / aspect;



  out[5] = f;



  out[10] = (far + near) / (near - far);



  out[11] = -1;



  out[14] = (2 * far * near) / (near - far);



  return out;



};







const lookAt = (out: Float32Array, eye: Vec3, center: Vec3, up: Vec3) => {



  let [ex, ey, ez] = eye;



  let [cx, cy, cz] = center;



  let [ux, uy, uz] = up;



  let zx = ex - cx;



  let zy = ey - cy;



  let zz = ez - cz;



  const zLen = Math.hypot(zx, zy, zz) || 1;



  zx /= zLen; zy /= zLen; zz /= zLen;



  let xx = uy * zz - uz * zy;



  let xy = uz * zx - ux * zz;



  let xz = ux * zy - uy * zx;



  const xLen = Math.hypot(xx, xy, xz) || 1;



  xx /= xLen; xy /= xLen; xz /= xLen;



  let yx = zy * xz - zz * xy;



  let yy = zz * xx - zx * xz;



  let yz = zx * xy - zy * xx;



  out[0] = xx; out[4] = xy; out[8] = xz;  out[12] = -(xx * ex + xy * ey + xz * ez);



  out[1] = yx; out[5] = yy; out[9] = yz;  out[13] = -(yx * ex + yy * ey + yz * ez);



  out[2] = zx; out[6] = zy; out[10] = zz; out[14] = -(zx * ex + zy * ey + zz * ez);



  out[3] = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;



  return out;



};







const invert = (out: Float32Array, m: Float32Array) => {



  const inv = new Float32Array(16);



  inv[0]  = m[5]  * m[10] * m[15] - m[5]  * m[11] * m[14] - m[9]  * m[6]  * m[15] +



            m[9]  * m[7]  * m[14] + m[13] * m[6]  * m[11] - m[13] * m[7]  * m[10];



  inv[4]  = -m[4]  * m[10] * m[15] + m[4]  * m[11] * m[14] + m[8]  * m[6]  * m[15] -



            m[8]  * m[7]  * m[14] - m[12] * m[6]  * m[11] + m[12] * m[7]  * m[10];



  inv[8]  = m[4]  * m[9]  * m[15] - m[4]  * m[11] * m[13] - m[8]  * m[5]  * m[15] +



            m[8]  * m[7]  * m[13] + m[12] * m[5]  * m[11] - m[12] * m[7]  * m[9];



  inv[12] = -m[4]  * m[9]  * m[14] + m[4]  * m[10] * m[13] + m[8]  * m[5]  * m[14] -



            m[8]  * m[6]  * m[13] - m[12] * m[5]  * m[10] + m[12] * m[6]  * m[9];



  inv[1]  = -m[1]  * m[10] * m[15] + m[1]  * m[11] * m[14] + m[9]  * m[2]  * m[15] -



            m[9]  * m[3]  * m[14] - m[13] * m[2]  * m[11] + m[13] * m[3]  * m[10];



  inv[5]  = m[0]  * m[10] * m[15] - m[0]  * m[11] * m[14] - m[8]  * m[2]  * m[15] +



            m[8]  * m[3]  * m[14] + m[12] * m[2]  * m[11] - m[12] * m[3]  * m[10];



  inv[9]  = -m[0]  * m[9]  * m[15] + m[0]  * m[11] * m[13] + m[8]  * m[1]  * m[15] -



            m[8]  * m[3]  * m[13] - m[12] * m[1]  * m[11] + m[12] * m[3]  * m[9];



  inv[13] = m[0]  * m[9]  * m[14] - m[0]  * m[10] * m[13] - m[8]  * m[1]  * m[14] +



            m[8]  * m[2]  * m[13] + m[12] * m[1]  * m[10] - m[12] * m[2]  * m[9];



  inv[2]  = m[1]  * m[6]  * m[15] - m[1]  * m[7]  * m[14] - m[5]  * m[2]  * m[15] +



            m[5]  * m[3]  * m[14] + m[13] * m[2]  * m[7]  - m[13] * m[3]  * m[6];



  inv[6]  = -m[0]  * m[6]  * m[15] + m[0]  * m[7]  * m[14] + m[4]  * m[2]  * m[15] -



            m[4]  * m[3]  * m[14] - m[12] * m[2]  * m[7]  + m[12] * m[3]  * m[6];



  inv[10] = m[0]  * m[5]  * m[15] - m[0]  * m[7]  * m[13] - m[4]  * m[1]  * m[15] +



            m[4]  * m[3]  * m[13] + m[12] * m[1]  * m[7]  - m[12] * m[3]  * m[5];



  inv[14] = -m[0]  * m[5]  * m[14] + m[0]  * m[6]  * m[13] + m[4]  * m[1]  * m[14] -



            m[4]  * m[2]  * m[13] - m[12] * m[1]  * m[6]  + m[12] * m[2]  * m[5];



  inv[3]  = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] -



            m[5] * m[3] * m[10] - m[9] * m[2] * m[7]  + m[9] * m[3] * m[6];



  inv[7]  = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] +



            m[4] * m[3] * m[10] + m[8] * m[2] * m[7]  - m[8] * m[3] * m[6];



  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] -



            m[4] * m[3] * m[9] - m[8] * m[1] * m[7]  + m[8] * m[3] * m[5];



  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] +



            m[4] * m[2] * m[9] + m[8] * m[1] * m[6]  - m[8] * m[2] * m[5];



  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];



  if (Math.abs(det) < 1e-8) return null;



  det = 1.0 / det;



  for (let i = 0; i < 16; i++) out[i] = inv[i] * det;



  return out;



};







const sech2 = (x: number) => {



  const c = Math.cosh(x);



  return 1 / (c * c);



};







const dTopHatDr = (r: number, sigma: number, R: number) => {



  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));



  return sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R))) / den;



};







const buildRadialLUT = (sigma: number, RMetric: number, rMax: number) => {



  const lut = new Float32Array(RADIAL_SIZE);



  const maxRadius = Math.max(rMax, 1e-6);



  for (let i = 0; i < RADIAL_SIZE; i++) {



    const t = i / (RADIAL_SIZE - 1);



    const r = t * maxRadius;



    const sample = dTopHatDr(r, sigma, RMetric);



    lut[i] = Number.isFinite(sample) ? sample : 0;



  }



  return lut;



};







const rotateWeights = (weights: Float32Array, phase01: number) => {



  const shifted = new Float32Array(weights.length);



  const phase = ((phase01 % 1) + 1) % 1;



  const offset = phase * weights.length;



  for (let i = 0; i < weights.length; i++) {



    const idx = (i + offset) % weights.length;



    const i0 = Math.floor(idx);



    const t = idx - i0;



    const i1 = (i0 + 1) % weights.length;



    const w0 = weights[i0];



    const w1 = weights[i1];



    shifted[i] = w0 + (w1 - w0) * t;



  }



  return shifted;



};







const createTexture2D = (gl: WebGL2RenderingContext) => {



  const tex = gl.createTexture();



  if (!tex) throw new Error("Failed to allocate texture");



  gl.bindTexture(gl.TEXTURE_2D, tex);



  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);



  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);



  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



  gl.bindTexture(gl.TEXTURE_2D, null);



  return tex;



};







const createTexture3D = (gl: WebGL2RenderingContext) => {



  const tex = gl.createTexture();



  if (!tex) throw new Error("Failed to allocate texture3D");



  gl.bindTexture(gl.TEXTURE_3D, tex);



  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);



  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);



  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);



  gl.bindTexture(gl.TEXTURE_3D, null);



  return tex;



};

const clearGlErrors = (gl: WebGL2RenderingContext) => {
  // Drain any previously-raised errors so subsequent checks are meaningful.
  // WebGL returns one error at a time.
  for (let i = 0; i < 32; i++) {
    const err = gl.getError();
    if (err === gl.NO_ERROR) return;
  }
};

type LatticeAtlasLayout = {
  tilesX: number;
  tilesY: number;
  width: number;
  height: number;
};

const computeLatticeAtlasLayout = (
  dims: [number, number, number],
  maxTextureSize: number,
): LatticeAtlasLayout | null => {
  const [nx, ny, nz] = dims;
  if (nx <= 0 || ny <= 0 || nz <= 0) return null;
  const maxTilesX = Math.max(1, Math.floor(maxTextureSize / nx));
  const maxTilesY = Math.max(1, Math.floor(maxTextureSize / ny));
  if (maxTilesX <= 0 || maxTilesY <= 0) return null;

  let tilesX = Math.max(1, Math.min(maxTilesX, Math.ceil(Math.sqrt(nz))));
  let tilesY = Math.ceil(nz / tilesX);
  if (tilesY > maxTilesY) {
    tilesX = maxTilesX;
    tilesY = Math.ceil(nz / tilesX);
    if (tilesY > maxTilesY) return null;
  }
  return { tilesX, tilesY, width: tilesX * nx, height: tilesY * ny };
};

const float32BitsToFloat16Bits = (bits: number) => {
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const frac = bits & 0x7fffff;

  if (exp === 0) {
    // Flush float32 subnormals to zero (sufficient for our fields)
    return sign;
  }
  if (exp === 0xff) {
    if (frac === 0) return sign | 0x7c00; // inf
    const payload = frac >>> 13;
    return sign | 0x7c00 | (payload ? payload : 1); // NaN (ensure mantissa != 0)
  }

  const halfExp = exp - 127 + 15;
  if (halfExp >= 0x1f) {
    return sign | 0x7c00; // overflow -> inf
  }
  if (halfExp <= 0) {
    if (halfExp < -10) return sign; // underflow -> 0
    const mantissa = frac | 0x800000;
    const shift = 1 - halfExp;
    let halfFrac = mantissa >>> (shift + 13);
    const roundBit = (mantissa >>> (shift + 12)) & 1;
    const restMask = (1 << (shift + 12)) - 1;
    const rest = mantissa & restMask;
    if (roundBit && (rest || (halfFrac & 1))) halfFrac++;
    return sign | (halfFrac & 0x3ff);
  }

  let halfFrac = frac >>> 13;
  const roundBit = (frac >>> 12) & 1;
  const rest = frac & 0xfff;
  if (roundBit && (rest || (halfFrac & 1))) halfFrac++;
  let halfExpBits = halfExp << 10;
  if (halfFrac === 0x400) {
    halfFrac = 0;
    halfExpBits += 1 << 10;
    if (halfExpBits >= 0x7c00) return sign | 0x7c00;
  }
  return sign | halfExpBits | (halfFrac & 0x3ff);
};

type LatticeVolumeUploadBackend = "tex3d" | "atlas2d";

type LatticeVolumeUploadFormat = {
  backend: LatticeVolumeUploadBackend;
  packedRG: boolean;
  internalFormat: number;
  format: number;
  type: number;
  filter: number;
  label: string;
  atlas?: LatticeAtlasLayout;
};

type LatticeVolumeUploadState = {
  hash: string;
  dims: [number, number, number];
  format: LatticeVolumeUploadFormat;
  nextSlice: number;
  lastUploadAtMs: number;
  scratchF32?: Float32Array;
  scratchU16?: Uint16Array;
};

type LatticeUploadTelemetry = {
  profileTag: LatticeProfileTag;
  voxelCount: number;
  bytes: number;
  budgetBytes: number;
  budgetVoxels: number;
  formatLabel: string | null;
  backend: LatticeVolumeUploadBackend | null;
  uploadedAtMs: number;
  skippedReason?: string | null;
  downgradeReason?: string | null;
};

type LatticeSdfUploadState = {
  key: string;
  dims: [number, number, number];
  backend: LatticeVolumeUploadBackend;
  nextSlice: number;
  lastUploadAtMs: number;
  atlas?: LatticeAtlasLayout;
  data?: Uint8Array;
};

type LatticeDfdrUploadState = {
  hash: string;
  dims: [number, number, number];
  backend: LatticeVolumeUploadBackend;
  internalFormat: number;
  format: number;
  type: number;
  filter: number;
  nextSlice: number;
  lastUploadAtMs: number;
  atlas?: LatticeAtlasLayout;
  scratchF32?: Float32Array;
  scratchU16?: Uint16Array;
};







const compileShader = (gl: WebGL2RenderingContext, type: number, src: string) => {



  const shader = gl.createShader(type);



  if (!shader) throw new Error("Failed to create shader");



  gl.shaderSource(shader, src);



  gl.compileShader(shader);



  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);



  if (!ok) {



    const info = gl.getShaderInfoLog(shader);



    gl.deleteShader(shader);



    throw new Error(`Shader compile failed: ${info || "no info log"}`);



  }



  return shader;



};







const linkProgram = (gl: WebGL2RenderingContext, label: string, vsSrc: string, fsSrc: string) => {



  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);



  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);



  const prog = gl.createProgram();



  if (!prog) {



    gl.deleteShader(vs);



    gl.deleteShader(fs);



    throw new Error("Failed to create program");



  }



  gl.attachShader(prog, vs);



  gl.attachShader(prog, fs);



  gl.linkProgram(prog);



  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);



  gl.deleteShader(vs);



  gl.deleteShader(fs);



  if (!ok) {



    const info = gl.getProgramInfoLog(prog);



    gl.deleteProgram(prog);



    throw new Error(`${label} link failed: ${info || "no info log"}`);



  }



  return prog;



};







const RAYMARCH_VS = `#version 300 es

layout(location=0) in vec2 a_pos;

out vec2 v_ndc;

void main() {

  v_ndc = a_pos;

  gl_Position = vec4(a_pos, 0.0, 1.0);

}

`;


const RAYMARCH_FS = `#version 300 es



precision highp float;



precision highp sampler3D;



precision highp sampler2D;



in vec2 v_ndc;



layout(location=0) out vec4 outColor;



layout(location=1) out vec4 outAux;

layout(location=2) out vec4 outId;


uniform sampler3D u_volume;
uniform sampler3D u_gateVolume;



uniform sampler2D u_ringInstant;



uniform sampler2D u_ringAverage;



uniform sampler2D u_radialLUT;
uniform sampler2D u_volumeAtlas;



uniform sampler3D u_curvTex;
uniform sampler3D u_t00Tex;



uniform float u_curvGain;
uniform float u_t00Alpha;
uniform float u_t00Gain;



uniform float u_curvAlpha;



uniform int u_curvPaletteMode;

uniform bool u_curvDebugOnly;

uniform int u_curvDebugMode;

uniform float u_curvBoost;

uniform vec2 u_curvRange;
uniform vec2 u_t00Range;







uniform vec3 u_axes;



uniform float u_domainScale;



 uniform float u_beta;
 uniform int u_metricMode;



uniform float u_ampChain;



uniform float u_gate;



uniform float u_gate_view;



uniform float u_fActive;



uniform float u_lumpExp;



uniform bool u_hasLatticeVolume;
uniform mat4 u_worldToLattice;
uniform vec3 u_latticeMin;
uniform vec3 u_latticeSize;
uniform bool u_latticePacked;
uniform bool u_latticeUseAtlas;
uniform int u_latticeDynamicWeights;
uniform vec3 u_latticeDims;
uniform vec2 u_latticeAtlasTiles;
uniform vec2 u_latticeSliceInvSize;
uniform bool u_hasLatticeSdf;
uniform float u_latticeSdfBand_m;
uniform sampler3D u_latticeSdf;
uniform sampler2D u_latticeSdfAtlas;

vec2 sampleLatticeAtlas(vec3 uvw) {
  vec2 tileCount = max(u_latticeAtlasTiles, vec2(1.0));
  vec2 invTile = 1.0 / tileCount;
  float depth = max(u_latticeDims.z, 1.0);
  float zf = clamp(uvw.z, 0.0, 1.0) * (depth - 1.0);
  float z0 = floor(zf);
  float z1 = min(z0 + 1.0, depth - 1.0);
  float t = zf - z0;

  vec2 uv = clamp(
    uvw.xy,
    u_latticeSliceInvSize * 0.5,
    vec2(1.0) - u_latticeSliceInvSize * 0.5
  );

  vec2 tile0 = vec2(mod(z0, tileCount.x), floor(z0 / tileCount.x));
  vec2 tile1 = vec2(mod(z1, tileCount.x), floor(z1 / tileCount.x));
  vec2 uv0 = (tile0 + uv) * invTile;
  vec2 uv1 = (tile1 + uv) * invTile;
  vec4 s0 = texture(u_volumeAtlas, uv0);
  vec4 s1 = texture(u_volumeAtlas, uv1);
  return mix(s0.rg, s1.rg, t);
}

vec2 sampleLattice(vec3 uvw) {
  if (!u_hasLatticeVolume) return vec2(0.0);
  if (u_latticeUseAtlas) return sampleLatticeAtlas(uvw);
  if (u_latticePacked) return texture(u_volume, uvw).rg;
  return vec2(texture(u_volume, uvw).r, texture(u_gateVolume, uvw).r);
}

float unpackRG8To01(vec2 rg) {
  float hi = rg.r * 255.0;
  float lo = rg.g * 255.0;
  return (hi * 256.0 + lo) / 65535.0;
}

vec2 sampleLatticeSdfAtlas(vec3 uvw) {
  vec2 tileCount = max(u_latticeAtlasTiles, vec2(1.0));
  vec2 invTile = 1.0 / tileCount;
  float depth = max(u_latticeDims.z, 1.0);
  float zf = clamp(uvw.z, 0.0, 1.0) * (depth - 1.0);
  float z0 = floor(zf);
  float z1 = min(z0 + 1.0, depth - 1.0);
  float t = zf - z0;

  vec2 uv = clamp(
    uvw.xy,
    u_latticeSliceInvSize * 0.5,
    vec2(1.0) - u_latticeSliceInvSize * 0.5
  );

  vec2 tile0 = vec2(mod(z0, tileCount.x), floor(z0 / tileCount.x));
  vec2 tile1 = vec2(mod(z1, tileCount.x), floor(z1 / tileCount.x));
  vec2 uv0 = (tile0 + uv) * invTile;
  vec2 uv1 = (tile1 + uv) * invTile;
  vec2 s0 = texture(u_latticeSdfAtlas, uv0).rg;
  vec2 s1 = texture(u_latticeSdfAtlas, uv1).rg;
  return mix(s0, s1, t);
}

vec2 sampleLatticeSdf(vec3 uvw) {
  if (!u_hasLatticeSdf || u_latticeSdfBand_m <= 0.0) return vec2(1e9, 0.0);
  vec2 rg = u_latticeUseAtlas ? sampleLatticeSdfAtlas(uvw) : texture(u_latticeSdf, uvw).rg;
  float band = max(u_latticeSdfBand_m, 1e-6);
  float u01 = unpackRG8To01(rg);
  float signedDist = (u01 * 2.0 - 1.0) * band;
  float bandWeight = clamp(1.0 - abs(signedDist) / band, 0.0, 1.0);
  return vec2(signedDist, bandWeight);
}



uniform float u_phase01;



uniform float u_phaseSign;

uniform float u_thetaSign;



uniform float u_blend;



uniform float u_densityScale;



uniform float u_stepBias;



uniform int u_maxSteps;



uniform float u_radialScale;



uniform float u_radialMax;



uniform float u_invR;



uniform float u_timeSec;



uniform float u_sigma; // sigma for analytic df in test modes



uniform float u_grThetaGain;



uniform float u_grRhoGain;



uniform float u_vizFloorThetaGR;



uniform float u_vizFloorRhoGR;



uniform float u_vizFloorThetaDrive;







// Diagnostics: allow bypassing ring gating to test visibility



uniform int u_forceFlatGate;



// Diagnostics: toggle a simple debug color to verify shader path



uniform int u_debugMode;



// Diagnostics: band sampling modes for probe FBO



uniform int u_probeMode;



uniform float u_probeGain;



// Test harness controls (dev only)



uniform int u_testMode;



uniform float u_baseScale;



// New: independent overlays/flags



uniform int   u_overlayMode;   // 0=off,1=fog3d,2=isoShell_dfdr,3=phaseStreaks



uniform float u_overlayMix;    // 0 instant, 1 EMA



uniform float u_overlayAlpha;  // blend factor for overlay tint



uniform float u_overlayThick;  // radial half-thickness (fraction of R)



uniform float u_overlayGain;   // intensity gain



uniform float u_overlayHue;    // base hue offset



uniform float u_overlayPhase;  // phase offset for streaks



uniform int   u_sectorGridMode;  // 0=off,1=instant,2=ema,3=split-outline



uniform float u_sectorGridAlpha;



uniform float u_sectorIsoAlpha;



uniform vec2  u_sectorDutyWindow;



uniform int u_ringOverlay;    // 1 to add a thin ring band at rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â R



uniform int u_grayMode;       // 1 to force grayscale volume



uniform int u_volumeSource;   // 0 analytic, 1 lattice, 2 brick
uniform int u_volumeViz;      // 0 theta_GR, 1 rho_GR, 2 theta_Drive, 3 shear_GR, 4 vorticity_GR, 5 alpha



uniform int u_volumeDomain;   // 0=wallBand, 1=bubbleBox



uniform vec2 u_opacityWindow; // [min,max] opacity window for bubble domain



// Distribution-aware ring overlay controls



uniform int   u_ringOverlayMode;   // 0=locator, 1=weighted, 2=field-coded



uniform float u_ringOverlayBlend;  // 0..1 mixing instant/average weights



uniform float u_ringOverlayAlpha;  // 0..1 overlay opacity



uniform float u_ringOverlayWidth;  // radial belt thickness



uniform int   u_ringOverlayField;  // -1=follow volume viz, otherwise explicit field







uniform vec3 u_cameraPos;



uniform mat4 u_invViewProj;










const float INV_TAU = 0.15915494309189535;
const float INV16PI = 0.019894367886486918;
const float SHELL_STEP_METRIC = 0.006;



const int RADIAL_LAST = ${RADIAL_SIZE - 1};

const float CURV_ALPHA_K = 6.0;







struct KFastOut {



  float thetaGR;



  float rhoGR;



  float K2;



  float KijKij;



};







KFastOut kfast(float dfdr, vec3 rhat, float beta) {



  vec3 grad = dfdr * rhat;



  float dfx = grad.x;



  float dfy = grad.y;



  float dfz = grad.z;



  float Kxx = -beta * dfx;



  float Kxy = -0.5 * beta * dfy;



  float Kxz = -0.5 * beta * dfz;



  float theta = beta * dfx;



  float K2 = theta * theta;



  float KijKij = Kxx * Kxx + 2.0 * (Kxy * Kxy + Kxz * Kxz);



  KFastOut o;



  o.thetaGR = theta;



  o.rhoGR = (K2 - KijKij) * INV16PI;



  o.K2 = K2;



  o.KijKij = KijKij;



  return o;



}







float encodeLogVis(float v) {



  float logv = log2(max(v, 1e-36));



  return clamp((logv + 60.0) / 100.0, 0.0, 1.0);



}







vec3 diverge(float x) {



  float t = clamp(0.5 * (x + 1.0), 0.0, 1.0);



  vec3 cold = vec3(0.05, 0.2, 0.5);



  vec3 mid  = vec3(0.94, 0.96, 0.95);



  vec3 warm = vec3(0.98, 0.7, 0.1);



  if (t < 0.5) {



    float f = t / 0.5;



    return mix(cold, mid, f);



  } else {



    float f = (t - 0.5) / 0.5;



    return mix(mid, warm, f);



  }



}







vec3 purpleMap(float s) {



  float t = clamp(-s, 0.0, 1.0);



  vec3 base = vec3(0.92, 0.92, 0.98);



  vec3 purp = vec3(0.58, 0.25, 0.93);



  return mix(base, purp, t);



}






vec3 hsv2rgb(vec3 hsv) {
  vec3 p = abs(fract(hsv.xxx + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0);
  return hsv.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), hsv.y);
}

float shellWindow(float rNorm, float halfWidth) {
  float hw = clamp(halfWidth, 0.002, 0.6);
  float inner = smoothstep(1.0 - hw * 1.4, 1.0 - hw * 0.25, rNorm);
  float outer = 1.0 - smoothstep(1.0 + hw * 0.25, 1.0 + hw * 1.4, rNorm);
  return clamp(inner * outer, 0.0, 1.0);
}

float hueForAngle(float angle01, float baseHue) {
  return fract(baseHue + angle01);
}




float fetchRingWeight(sampler2D tex, float a01) {



  float u = fract(a01);



  return texture(tex, vec2(u, 0.5)).r;



}

vec3 curvaturePalette(float t, int mode) {
  t = clamp(t, 0.0, 1.0);
  if (mode == 1) {
    float x = clamp(t * 2.0 - 1.0, -1.0, 1.0);
    vec3 cold = vec3(0.12, 0.25, 0.92);
    vec3 warm = vec3(0.92, 0.28, 0.18);
    vec3 mid = vec3(0.96, 0.96, 0.96);
    if (x >= 0.0) {
      return mix(mid, warm, clamp(x, 0.0, 1.0));
    }
    return mix(mid, cold, clamp(-x, 0.0, 1.0));
  }
  if (mode == 2) {
    vec3 w0 = vec3(0.26, 0.05, 0.10);
    vec3 w1 = vec3(0.58, 0.15, 0.14);
    vec3 w2 = vec3(0.94, 0.52, 0.18);
    vec3 w3 = vec3(1.00, 0.86, 0.48);
    float segWarm = clamp(t * 3.0, 0.0, 3.0);
    vec3 warmColor = mix(w0, w1, clamp(segWarm, 0.0, 1.0));
    warmColor = mix(warmColor, w2, clamp(segWarm - 1.0, 0.0, 1.0));
    warmColor = mix(warmColor, w3, clamp(segWarm - 2.0, 0.0, 1.0));
    return warmColor;
  }
  vec3 c0 = vec3(0.08, 0.20, 0.80);
  vec3 c1 = vec3(0.05, 0.65, 0.88);
  vec3 c2 = vec3(0.98, 0.90, 0.25);
  vec3 c3 = vec3(0.92, 0.20, 0.12);
  float seg = clamp(t * 3.0, 0.0, 3.0);
  vec3 color = mix(c0, c1, clamp(seg, 0.0, 1.0));
  color = mix(color, c2, clamp(seg - 1.0, 0.0, 1.0));
  color = mix(color, c3, clamp(seg - 2.0, 0.0, 1.0));
  return color;
}

float symLog01(float x, float boost) {
  float safeBoost = max(1.0, boost);
  float ax = clamp(abs(x), 0.0, 1.0);
  float denom = log(1.0 + safeBoost);
  float numer = log(1.0 + safeBoost * ax);
  float scaled = denom > 1e-6 ? numer / denom : ax;
  float signTerm = (x >= 0.0) ? 1.0 : -1.0;
  return 0.5 + 0.5 * signTerm * scaled;
}








float a01_metric(vec3 pMetric) {



  float ang = atan(pMetric.z, pMetric.x);



  float a01 = ang * INV_TAU;



  return fract(a01);



}







float sampleRadialLUTMetric(float r) {



  if (r > u_radialMax || isnan(r) || isinf(r)) {



    return 0.0;



  }



  float idx = clamp(r * u_radialScale, 0.0, float(RADIAL_LAST));



  float texSize = float(RADIAL_LAST) + 1.0;



  float u = (idx + 0.5) / texSize;



  return texture(u_radialLUT, vec2(u, 0.5)).r;



}







// Analytic helpers (avoid LUT for test modes to validate pipeline)



float coshF(float x) { float ex = exp(x); float eix = exp(-x); return 0.5 * (ex + eix); }



float tanhF(float x) { float e2 = exp(2.0 * x); return (e2 - 1.0) / (e2 + 1.0); }



float sech2F(float x) { float c = coshF(x); return 1.0 / (c * c); }



float dTopHatDr_metric(float r, float sigma, float R) {



  float den = max(1e-8, 2.0 * tanhF(sigma * R));



  return sigma * (sech2F(sigma * (r + R)) - sech2F(sigma * (r - R))) / den;



}







bool intersectAABB(vec3 ro, vec3 rd, vec3 boundsMin, vec3 boundsMax, out float t0, out float t1) {



  vec3 invDir = 1.0 / rd;



  vec3 tMin = (boundsMin - ro) * invDir;



  vec3 tMax = (boundsMax - ro) * invDir;



  vec3 tNear = min(tMin, tMax);



  vec3 tFar  = max(tMin, tMax);



  t0 = max(max(tNear.x, tNear.y), tNear.z);



  t1 = min(min(tFar.x,  tFar.y),  tFar.z);



  return t1 >= max(t0, 0.0);



}







bool intersectEllipsoid(vec3 ro, vec3 rd, vec3 axes, out float t0, out float t1) {



  vec3 o = ro / axes;



  vec3 d = rd / axes;



  float A = dot(d, d);



  float B = 2.0 * dot(o, d);



  float C = dot(o, o) - 1.0;



  float disc = B * B - 4.0 * A * C;



  if (disc < 0.0) return false;



  float s = sqrt(max(disc, 0.0));



  float denom = 2.0 * A;



  if (denom == 0.0) return false;



  float tA = (-B - s) / denom;



  float tB = (-B + s) / denom;



  if (tA > tB) {



    float tmp = tA;



    tA = tB;



    tB = tmp;



  }



  t0 = tA;



  t1 = tB;



  return t1 > max(t0, 0.0);



}



void main() {



  vec4 nearH = u_invViewProj * vec4(v_ndc, -1.0, 1.0);



  nearH /= max(nearH.w, 1e-6);



  vec3 rayOrigin = u_cameraPos;



  vec4 farH = u_invViewProj * vec4(v_ndc, 1.0, 1.0);



  farH /= max(farH.w, 1e-6);



  vec3 rayDir = normalize(farH.xyz - rayOrigin);







  vec3 axesSafe = max(abs(u_axes), vec3(1e-6));
  float metricSpeed = length(rayDir / axesSafe) * u_invR;
  float shellStepMax = SHELL_STEP_METRIC / max(metricSpeed, 1e-6);



  vec3 bounds = axesSafe * u_domainScale;



  float tEnter, tExit;



  bool hitBounds = intersectAABB(rayOrigin, rayDir, -bounds, bounds, tEnter, tExit);



  if (!hitBounds) {



    float ellT0, ellT1;



    if (intersectEllipsoid(rayOrigin, rayDir, bounds, ellT0, ellT1)) {



      hitBounds = true;



      tEnter = max(ellT0, 0.0);



      tExit = ellT1;



    }



  }



  bool rayHit = hitBounds;



  if (!hitBounds) {



    if (u_testMode != 0) {



      tEnter = 0.0;



      tExit = max(length(bounds) * 2.0, 1.0);



    } else {



      discard;



    }



  }



  float t = max(tEnter, 0.0);



  float segLen = max(tExit - t, 1e-4);



  float dtBase = max(1e-4, segLen / float(u_maxSteps));



  vec4 accum = vec4(0.0);
  // ID mask channels: hull shell, warp grid, ring overlay.
  float idHull = 0.0;
  float idWarpGrid = 0.0;
  float idRing = 0.0;



  float bandHits = 0.0;



  float bandWeight = 0.0;



  float bandSamples = 0.0;



  float bandLuma = 0.0;



  float sumAbsDf = 0.0;



  float sumGate = 0.0;



  float sumTheta = 0.0;



  float sampleCount = 0.0;



  float diagRawMax = 0.0;



  float diagBoostMax = 0.0;



  float diagDensityMax = 0.0;



  float diagDriveMax = 0.0;



  float auxThetaPeak = 0.0;



  float auxRhoMin = 0.0;



  float auxMixPeak = 0.0;



  float auxKijPeak = 0.0;



  vec3 curvRgbAcc = vec3(0.0);



  float curvAacc = 0.0;



  float curvMIP = 0.0;



  float curvSignAtMIP = 1.0;



  float curvSpan = max(1e-6, max(abs(u_curvRange.x), abs(u_curvRange.y)));



  float curvSpanInv = 1.0 / curvSpan;



  float curvAlphaScale = clamp(u_curvAlpha, 0.0, 1.0);



  float curvBoost = max(1.0, u_curvBoost);



  bool curvOverlayActive = curvAlphaScale > 1e-5;



  bool curvDebugActive = u_curvDebugOnly;



  bool curvCompositeActive = curvOverlayActive || (curvDebugActive && u_curvDebugMode == 0);



  bool curvAnyActive = curvOverlayActive || curvDebugActive;



  bool curvMIPActive = curvDebugActive && u_curvDebugMode == 1;







  // Optional debug: show a simple gradient if requested (mode 1)



  if (u_debugMode == 1) {



    float u = 0.5 * (v_ndc.x + 1.0);



    float v = 0.5 * (v_ndc.y + 1.0);



    outColor = vec4(u, v, 0.2, 1.0);



    outAux = vec4(0.0);



    outId = vec4(0.0);



    return;



  }



  for (int i = 0; i < u_maxSteps; i++) {



    // In test modes, don't terminate early on accumulated alpha so we can fully sample the band



    if (t > tExit || (u_testMode == 0 && accum.a >= 0.98)) break;



    vec3 pos = rayOrigin + rayDir * t;



    vec3 gridCentered = pos / bounds;
    bool brickVolume = (u_volumeSource == 2);
    float t00Value = 0.0;
    if (brickVolume) {
      vec3 t00UVW = clamp(gridCentered * 0.5 + 0.5, 0.0, 1.0);
      float t00Raw = texture(u_t00Tex, t00UVW).r;
      float t00Span = max(1e-12, max(abs(u_t00Range.x), abs(u_t00Range.y)));
      t00Value = t00Raw / t00Span;
    }
    vec3 latticeUVW = clamp(gridCentered * 0.5 + 0.5, 0.0, 1.0);
    if (u_hasLatticeVolume) {
      vec4 lp = u_worldToLattice * vec4(pos, 1.0);
      latticeUVW = clamp((lp.xyz - u_latticeMin) / u_latticeSize, 0.0, 1.0);
    }
    vec2 latticeSample = sampleLattice(latticeUVW);
    float driveSample = latticeSample.x;
    float gateSample = latticeSample.y;
    vec2 sdfSample = sampleLatticeSdf(latticeUVW);
    float sdfSigned = sdfSample.x;
    float sdfBand = sdfSample.y;



    if (max(abs(gridCentered.x), max(abs(gridCentered.y), abs(gridCentered.z))) > 1.0) {



      t += dtBase;



      continue;



    }



    vec3 pMetric = vec3(



      pos.x / axesSafe.x,



      pos.y / axesSafe.y,



      pos.z / axesSafe.z



    ) * u_invR;



    float rMetric = length(pMetric);



    // Debug belt overlay: locator, weighted, or field-coded band near the shell radius



    if (u_debugMode == 2 || u_ringOverlay == 1) {



      float bandWidth = clamp(u_ringOverlayWidth, 0.002, 0.20);



      float band = smoothstep(1.0 + bandWidth, 1.0, rMetric) * (1.0 - smoothstep(1.0, 1.0 - bandWidth, rMetric));



      float edgeAlpha = band * clamp(u_ringOverlayAlpha, 0.02, 1.0);



      vec3 overlayColor = vec3(band);



      int overlayMode = max(0, u_ringOverlayMode);



      if (overlayMode == 1 || overlayMode == 2) {



        float blendT = clamp(u_ringOverlayBlend, 0.0, 1.0);



        float wMix = gateSample;
        if (!u_hasLatticeVolume || u_latticeDynamicWeights != 0) {
          float a01Base = a01_metric(pMetric);
          float aInstant = fract(a01Base + u_phaseSign * u_phase01);
          float wInstant = fetchRingWeight(u_ringInstant, aInstant);
          float wAverage = fetchRingWeight(u_ringAverage, a01Base);
          wMix = mix(wInstant, wAverage, blendT);
        }



        if (overlayMode == 1) {



          float luma = clamp(pow(max(wMix, 0.0), 0.7), 0.0, 1.0);



          vec3 tintInstant = vec3(1.00, 0.62, 0.20);



          vec3 tintAverage = vec3(0.20, 0.78, 1.00);



          vec3 tint = mix(tintInstant, tintAverage, blendT);



          overlayColor = mix(vec3(0.0), tint, luma);



          edgeAlpha *= luma;



        } else {



          float dfLutShell = sampleRadialLUTMetric(rMetric);



          float dfShell = (u_testMode == 3 || u_testMode == 6)



            ? dTopHatDr_metric(rMetric, max(u_sigma, 1e-6), 1.0)



            : dfLutShell;



          vec3 dirShell = (rMetric > 1e-6) ? (pMetric / rMetric) : vec3(0.0);



          float base = dirShell.x * dfShell;



          float fActiveSafe = max(u_fActive, 1e-6);



          float activeScale = inversesqrt(fActiveSafe);



          float gateExponent = max(0.5, u_lumpExp);



          float gateWF = 1.0;
          if (u_forceFlatGate == 0) {
            gateWF = pow(activeScale * sqrt(max(wMix, 0.0)), gateExponent);
          }

          float gateMask = u_hasLatticeVolume ? max(gateSample, 0.0) : 1.0;
          float gateWeight = (!u_hasLatticeVolume || u_latticeDynamicWeights != 0) ? gateMask * gateWF : gateMask;



          float dfy = dfShell * dirShell.y;



          float dfz = dfShell * dirShell.z;



          float gateGR = (u_hasLatticeVolume && u_latticeDynamicWeights == 0) ? gateMask : 1.0;
          float thetaGR = u_beta * base * gateGR;



          float Kxx = -u_beta * base * gateGR;



          float Kxy = -0.5 * u_beta * dfy * gateGR;



          float Kxz = -0.5 * u_beta * dfz * gateGR;



          float K2 = Kxx * Kxx;



          float KijKij = Kxx * Kxx + 2.0 * Kxy * Kxy + 2.0 * Kxz * Kxz;



          float rhoGR = (K2 - KijKij) * INV16PI;



          float sigma2 = max(KijKij - (K2 / 3.0), 0.0);



          float vorticity = u_beta * sqrt(dfy * dfy + dfz * dfz);
          if (u_metricMode == 2) {
            vorticity = 0.0;
          }



          float sdfBlend = clamp(sdfBand, 0.0, 1.0);
          sdfBlend *= sdfBlend;
          float driveAnalytic = thetaGR * u_ampChain * gateWeight;
          float thetaDrive = driveAnalytic * u_gate_view;

          if (u_hasLatticeVolume) {
            float driveWeighted = driveSample;
            if (u_latticeDynamicWeights != 0 && u_forceFlatGate == 0) {
              driveWeighted *= gateWF;
            }
            float driveSharpened = mix(driveWeighted, driveAnalytic, sdfBlend);
            thetaDrive = driveSharpened * max(u_gate_view, 0.0);
          }

          thetaGR *= u_thetaSign;
          thetaDrive *= u_thetaSign;



          int fieldSel = (u_ringOverlayField < 0) ? u_volumeViz : u_ringOverlayField;



          float fieldValue = thetaGR;
          if (brickVolume) {
            fieldValue = t00Value;
          } else if (fieldSel == 1) {
            fieldValue = rhoGR;
          } else if (fieldSel == 2) {
            fieldValue = thetaDrive;
          } else if (fieldSel == 3) {
            fieldValue = sigma2;
          } else if (fieldSel == 4) {
            fieldValue = vorticity;
          } else if (fieldSel == 5) {
            fieldValue = driveSample;
          }



          float boost = max(u_grThetaGain, 1e-12);
          if (brickVolume) {
            boost = 1.0;
          } else if (fieldSel == 1 || fieldSel == 3) {
            boost = max(u_grRhoGain, 1e-12);
          }



          float viz = clamp(fieldValue * boost * u_densityScale, -1.5, 1.5);



          overlayColor = (fieldSel == 1) ? purpleMap(viz) : diverge(viz);



        }



      }



      idRing = max(idRing, step(1e-4, edgeAlpha));
      accum.rgb += (1.0 - accum.a) * overlayColor * edgeAlpha;



      accum.a += (1.0 - accum.a) * edgeAlpha;



      t += dtBase;



      if (u_debugMode == 2) { continue; }



    }



    float dfLut = sampleRadialLUTMetric(rMetric);



    // For test modes, allow analytic fallback to validate df independent of LUT upload



    float df = (u_testMode == 3 || u_testMode == 6)



      ? dTopHatDr_metric(rMetric, max(u_sigma, 1e-6), 1.0)



      : dfLut;



    vec3 dir = (rMetric > 1e-6) ? (pMetric / rMetric) : vec3(0.0);



    float cosX = dir.x;



    float base = cosX * df;



    float dfy = df * dir.y;



    float dfz = df * dir.z;



    float wSafe = 1.0;
    if (u_forceFlatGate == 0 && (!u_hasLatticeVolume || u_latticeDynamicWeights != 0)) {
      float a01Base = a01_metric(pMetric);
      float aInstant = fract(a01Base + u_phaseSign * u_phase01);
      float wInstant = fetchRingWeight(u_ringInstant, aInstant);
      float wAvg = fetchRingWeight(u_ringAverage, a01Base);
      float wNorm = mix(wInstant, wAvg, clamp(u_blend, 0.0, 1.0));
      wSafe = max(wNorm, 0.0);
    }

    float gateWF = 1.0;
    if (u_forceFlatGate == 0 && (!u_hasLatticeVolume || u_latticeDynamicWeights != 0)) {
      float fActiveSafe = max(u_fActive, 1e-6);
      float activeScale = inversesqrt(fActiveSafe);
      float gateLump = max(0.5, u_lumpExp);
      gateWF = pow(activeScale * sqrt(wSafe), gateLump);
    }
    float gateMask = u_hasLatticeVolume ? max(gateSample, 0.0) : 1.0;
    float gateWeight = (!u_hasLatticeVolume || u_latticeDynamicWeights != 0) ? gateMask * gateWF : gateMask;



    KFastOut k = kfast(df, dir, u_beta);



    float thetaGR = k.thetaGR;



    float thetaDrive = thetaGR * u_ampChain * u_gate_view * gateWeight;
    if (u_hasLatticeVolume) {
      float sdfBlend = clamp(sdfBand, 0.0, 1.0);
      sdfBlend *= sdfBlend;
      float driveAnalytic = thetaGR * u_ampChain * gateWeight;
      float driveWeighted = driveSample;
      if (u_latticeDynamicWeights != 0 && u_forceFlatGate == 0) {
        driveWeighted *= gateWF;
      }
      float driveSharpened = mix(driveWeighted, driveAnalytic, sdfBlend);
      thetaDrive = driveSharpened * max(u_gate_view, 0.0);
    }

    thetaGR *= u_thetaSign;
    thetaDrive *= u_thetaSign;



    float K2 = k.K2;



    float KijKij = k.KijKij;



    float rhoGR = k.rhoGR;



    float sigma2 = max(KijKij - (K2 / 3.0), 0.0);



    float vorticity = u_beta * sqrt(dfy * dfy + dfz * dfz);
    if (u_metricMode == 2) {
      vorticity = 0.0;
    }



    float kmix = KijKij - K2;



    if (abs(thetaGR) > abs(auxThetaPeak)) {



      auxThetaPeak = thetaGR;



    }



    if (rhoGR < auxRhoMin) {



      auxRhoMin = rhoGR;



    }



    if (abs(kmix) > abs(auxMixPeak)) {



      auxMixPeak = kmix;



    }



    if (KijKij > auxKijPeak) {



      auxKijPeak = KijKij;



    }



    float fieldValue = thetaGR;
    if (brickVolume) {
      fieldValue = t00Value;
    } else if (u_volumeViz == 1) {
      fieldValue = rhoGR;
    } else if (u_volumeViz == 2) {
      fieldValue = thetaDrive;
    } else if (u_volumeViz == 3) {
      fieldValue = sigma2;
    } else if (u_volumeViz == 4) {
      fieldValue = vorticity;
    } else if (u_volumeViz == 5) {
      fieldValue = driveSample;
    }



    float floorV = u_vizFloorThetaGR;
    if (brickVolume) {
      floorV = 0.0;
    } else if (u_volumeViz == 1) {
      floorV = u_vizFloorRhoGR;
    } else if (u_volumeViz == 2) {
      floorV = u_vizFloorThetaDrive;
    } else if (u_volumeViz == 3) {
      floorV = u_vizFloorRhoGR;
    } else if (u_volumeViz == 4) {
      floorV = u_vizFloorThetaGR;
    } else if (u_volumeViz == 5) {
      floorV = 0.0;
    }



    float clampedValue = fieldValue;



    if (floorV > 0.0) {



      float mag = abs(clampedValue);



      if (mag < floorV) {



        clampedValue = (clampedValue < 0.0) ? -floorV : floorV;



      }



    }



    if (u_volumeDomain == 1 && !brickVolume) {



      fieldValue = thetaDrive;



      clampedValue = thetaDrive;



    }



    sampleCount += 1.0;



    float bandWindow = smoothstep(1.03, 1.00, rMetric) * (1.0 - smoothstep(1.00, 0.97, rMetric));
    if (u_hasLatticeSdf && u_latticeSdfBand_m > 0.0) {
      float bandEdge = max(u_latticeSdfBand_m, 1e-6);
      float ad = abs(sdfSigned);
      bandWindow = 1.0 - smoothstep(bandEdge * 0.85, bandEdge, ad);
    }



    if (bandWindow > 1e-4) {



      bandHits += 1.0;



      bandWeight += bandWindow;



      bandSamples += 1.0;



      sumAbsDf += abs(df);



      sumGate += gateWF;



      sumTheta += abs(thetaDrive);



    }



    float displayValue = clampedValue;



    if (!brickVolume) {
      if (u_volumeDomain != 1 && u_volumeViz == 0) {
        float thetaBoost = max(u_grThetaGain, 1e-12);
        displayValue = thetaGR * thetaBoost;
      } else if (u_volumeDomain != 1 && u_volumeViz == 1) {
        float rhoBoost = max(u_grRhoGain, 1e-12);
        displayValue = rhoGR * rhoBoost;
      } else if (u_volumeDomain != 1 && u_volumeViz == 3) {
        float rhoBoost = max(u_grRhoGain, 1e-12);
        displayValue = sigma2 * rhoBoost;
      } else if (u_volumeDomain != 1 && u_volumeViz == 4) {
        float thetaBoost = max(u_grThetaGain, 1e-12);
        displayValue = vorticity * thetaBoost;
      }
    }



    float densitySource = abs(displayValue);



    diagDriveMax = max(diagDriveMax, abs(thetaDrive));



    diagRawMax = max(diagRawMax, abs(fieldValue));



    diagBoostMax = max(diagBoostMax, abs(displayValue));



    diagDensityMax = max(diagDensityMax, densitySource);







    float absDf = abs(df);



    float wallBand = smoothstep(0.2, 1.0, clamp(absDf / (1e-6 + u_radialMax), 0.0, 1.0));



    float stepScale = mix(0.55, 1.4, clamp(1.0 - min(absDf, 12.0) * u_stepBias, 0.0, 1.0));



    float adaptiveScale = mix(stepScale, stepScale * 0.35, wallBand);



    float stepLen = dtBase * adaptiveScale;
    if (bandWindow > 1e-4) {
      stepLen = min(stepLen, shellStepMax);
    }

    // Step policy guard: avoid skipping the thin shell on head-on rays.
    float shellStepMin = max(1e-4, shellStepMax * 0.25);
    float dMetricToBand = 0.0;
    if (rMetric < 0.97) {
      dMetricToBand = 0.97 - rMetric;
    } else if (rMetric > 1.03) {
      dMetricToBand = rMetric - 1.03;
    }
    if (dMetricToBand > 0.0 && dMetricToBand < 0.20) {
      float guardCap = max(shellStepMin, (dMetricToBand / max(metricSpeed, 1e-6)) * 0.75);
      stepLen = min(stepLen, guardCap);
    }
    if (u_hasLatticeSdf && u_latticeSdfBand_m > 0.0) {
      float bandEdge = max(u_latticeSdfBand_m, 1e-6);
      float ad = abs(sdfSigned);
      float dToBand = max(0.0, ad - bandEdge * 0.25);
      float hullCap = max(shellStepMin, dToBand * 0.75);
      stepLen = min(stepLen, hullCap);
    }
    stepLen = max(stepLen, shellStepMin);







    if (u_probeMode != 0) {



      if (bandWindow > 1e-4) {



        float probeField = abs(displayValue);



        float L = clamp(probeField * u_probeGain, 0.0, 1.0);



        bandLuma += L * bandWindow;



      }



      t += stepLen;



      continue;



    }







    if (u_debugMode == 3 || (u_grayMode == 1 && u_debugMode != 4)) {



      float L = clamp(abs(displayValue) * u_densityScale * 0.8, 0.0, 1.0);



      float alpha = L;



      vec3 color = vec3(L);



      accum.rgb += (1.0 - accum.a) * color * alpha;



      accum.a += (1.0 - accum.a) * alpha;



      t += stepLen;



      continue;



    }







    float density = clamp(densitySource * u_densityScale * 1.15, 0.0, 1.2);



    float vis = clamp(displayValue * u_densityScale, -1.5, 1.5);



    float opacityGate = 1.0;

    float a01Overlay = a01_metric(pMetric);
    float aInstant = fract(a01Overlay + u_phaseSign * u_phase01);
    float wInstant = fetchRingWeight(u_ringInstant, aInstant);
    float wAvg = fetchRingWeight(u_ringAverage, a01Overlay);



    if (u_volumeDomain == 1) {



      float owMin = max(1e-6, u_opacityWindow.x);



      float owMax = max(owMin + 1e-4, u_opacityWindow.y);



      opacityGate = smoothstep(owMin, owMax, abs(vis));



    }



    vec3 color = (u_volumeDomain == 1 || u_volumeViz != 1)



      ? diverge(vis)



      : purpleMap(vis);



    if (curvAnyActive) {
      vec3 sampleUVW = clamp(gridCentered * 0.5 + 0.5, 0.0, 1.0);
      float residual = texture(u_curvTex, sampleUVW).r;
      float unitResidual = clamp(residual * curvSpanInv, -1.0, 1.0);
      float boosted = symLog01(unitResidual * u_curvGain, curvBoost);
      vec3 curvColor = curvaturePalette(boosted, u_curvPaletteMode);
      float mag = abs(unitResidual);
      float aStep = curvAlphaScale * (1.0 - exp(-CURV_ALPHA_K * mag * stepLen));
      if (curvCompositeActive && aStep > 0.0) {
        float remain = 1.0 - curvAacc;
        float contrib = remain * aStep;
        curvRgbAcc += curvColor * contrib;
        curvAacc += contrib;
      }
      if (curvMIPActive && mag > curvMIP) {
        curvMIP = mag;
        curvSignAtMIP = (unitResidual >= 0.0) ? 1.0 : -1.0;
      }
    }



    // Step-length compensated alpha so opacity tracks optical depth vs sample count.
    float alpha = (1.0 - exp(-density * 1.6 * stepLen)) * opacityGate;

    // T00 overlay: sample |T00| field and tint as fog based on transfer
    if (u_t00Alpha > 1e-5) {
      vec3 t00UVW = clamp(gridCentered * 0.5 + 0.5, 0.0, 1.0);
      float t00v = abs(texture(u_t00Tex, t00UVW).r);
      float span = max(1e-12, max(abs(u_t00Range.x), abs(u_t00Range.y)));
      float unit = clamp(t00v / span, 0.0, 1.0);
      // simple 2-stop tf: blue->yellow
      vec3 t00Tint = mix(vec3(0.1, 0.2, 0.8), vec3(1.0, 0.9, 0.3), unit);
      float fog = clamp(unit * max(0.0, u_t00Gain), 0.0, 1.0) * clamp(u_t00Alpha, 0.0, 1.0);
      color = mix(color, t00Tint, fog);
      alpha = clamp(alpha + fog * 0.35 * opacityGate, 0.0, 1.0);
    }



    // Time-dilation cue: slower pulse where lapse (alpha) drops.
    if (u_volumeViz == 5 && u_hasLatticeVolume) {
      float alphaField = clamp(driveSample, 0.0, 1.0);
      float deficit = clamp(1.0 - alphaField, 0.0, 1.0);
      float rate = mix(0.2, 1.0, alphaField);
      float phase = u_timeSec * 2.2 * rate + rMetric * 3.5;
      float pulse = 0.5 + 0.5 * sin(phase);
      float cue = pulse * deficit * opacityGate;
      float cueBlend = clamp(cue * 0.35, 0.0, 0.35);
      vec3 cueTint = vec3(1.0, 0.78, 0.4);
      color = mix(color, cueTint, cueBlend);
      alpha = clamp(alpha + cueBlend * 0.5, 0.0, 1.0);
    }

    if (bandWindow > 1e-4 && alpha > 1e-4) {
      idHull = 1.0;
    }

    if (u_overlayMode != 0 && u_overlayAlpha > 1e-5) {
      float overlayShell = shellWindow(rMetric, max(u_overlayThick, 0.003));
      if (overlayShell > 1e-5) {
        float mixT = clamp(u_overlayMix, 0.0, 1.0);
        float wBlend = clamp(mix(wInstant, wAvg, mixT), 0.0, 1.0);
        float sectorWeight = mix(0.18, 1.0, pow(wBlend, 0.55));
        float gain = clamp(u_overlayGain, 0.0, 16.0);
        float overlayAlpha = clamp(u_overlayAlpha, 0.0, 1.0) * opacityGate;
        float baseStrength = overlayShell * sectorWeight * gain;
        if (baseStrength > 1e-5 && overlayAlpha > 0.0) {
          if (u_overlayMode == 1) {
            vec3 tint = hsv2rgb(vec3(fract(u_overlayHue), 0.55, 1.0));
            float fog = clamp(baseStrength, 0.0, 1.6) * overlayAlpha;
            color = mix(color, tint, fog);
            alpha = 1.0 - (1.0 - alpha) * exp(-fog * 1.4);
          } else if (u_overlayMode == 2) {
            float dfMag = clamp(abs(df), 0.0, 8.0);
            float dfNorm = dfMag / (1.0 + dfMag);
            float weight = overlayAlpha * baseStrength * (0.35 + 0.65 * dfNorm);
            vec3 tint = hsv2rgb(vec3(fract(u_overlayHue), 0.75, 1.0));
            color += tint * weight;
            alpha = clamp(alpha + weight * 0.55, 0.0, 1.0);
          } else if (u_overlayMode == 3) {
            float phase = fract(aInstant + u_overlayPhase);
            float streakProfile = pow(1.0 - abs(phase * 2.0 - 1.0), 6.0);
            float weight = overlayAlpha * baseStrength * max(0.2, streakProfile);
            float hue = hueForAngle(phase, u_overlayHue);
            vec3 tint = hsv2rgb(vec3(hue, 0.85, 1.0));
            float blend = clamp(weight, 0.0, 1.0);
            color = mix(color, tint, blend);
            alpha = clamp(alpha + weight * 0.3, 0.0, 1.0);
          }
        }
      }
    }



    if (u_sectorGridMode != 0 && u_sectorGridAlpha > 1e-4) {
      float rotPhase = fract(aInstant);
      float dutyStart = clamp(u_sectorDutyWindow.x, 0.0, 1.0);
      float dutyEnd = clamp(u_sectorDutyWindow.y, dutyStart, 1.0);
      float dutyActive = step(dutyStart, rotPhase) * step(rotPhase, dutyEnd);
      float gridWeight = 0.0;
      if (u_sectorGridMode == 1) {
        gridWeight = texture(u_ringInstant, vec2(rotPhase, 0.5)).r;
      } else if (u_sectorGridMode == 2) {
        gridWeight = texture(u_ringAverage, vec2(rotPhase, 0.5)).r;
      } else {
        float instant = texture(u_ringInstant, vec2(rotPhase, 0.5)).r;
        float ema = texture(u_ringAverage, vec2(rotPhase, 0.5)).r;
        gridWeight = mix(ema, instant, dutyActive);
      }
      float belt = shellWindow(rMetric, max(u_overlayThick, 0.003));
      float gridAlpha = belt * u_sectorGridAlpha * clamp(gridWeight, 0.0, 1.0);
      idWarpGrid = max(idWarpGrid, step(1e-4, gridAlpha));
      if (gridAlpha > 1e-4) {
        float hue = hueForAngle(rotPhase, u_overlayHue);
        vec3 tint = hsv2rgb(vec3(hue, 0.65, 1.0));
        accum.rgb += (1.0 - accum.a) * tint * gridAlpha;
        accum.a = clamp(accum.a + gridAlpha, 0.0, 1.0);
      }
      if (u_sectorIsoAlpha > 1e-5) {
        float seam = smoothstep(0.0, 0.015, abs(rotPhase - 0.5));
        float iso = seam * belt * u_sectorIsoAlpha;
        idWarpGrid = max(idWarpGrid, step(1e-4, iso));
        if (iso > 1e-5) {
          accum.rgb += (1.0 - accum.a) * vec3(0.18, 0.22, 0.98) * iso;
          accum.a = clamp(accum.a + iso, 0.0, 1.0);
        }
      }
    }



    accum.rgb += (1.0 - accum.a) * color * alpha;



    accum.a += (1.0 - accum.a) * alpha;



    t += stepLen;



  }



  if (u_curvDebugOnly) {
    if (curvMIPActive) {
      float signedPeak = curvSignAtMIP * curvMIP;
      float tone = symLog01(signedPeak * u_curvGain, curvBoost);
      vec3 rgb = curvaturePalette(tone, u_curvPaletteMode);
      outColor = vec4(rgb, 1.0);
    } else {
      float alpha = clamp(curvAacc, 0.0, 1.0);
      outColor = vec4(curvRgbAcc, alpha);
    }
    outAux = vec4(0.0);
    outId = vec4(0.0);
    return;
  }

  if (curvOverlayActive && curvAacc > 1e-5) {
    float overlayAlpha = clamp(curvAacc, 0.0, 1.0);
    accum.rgb = mix(accum.rgb, curvRgbAcc, overlayAlpha);
  }

  if (u_hasLatticeVolume) {
    vec2 latticeProbe = sampleLattice(vec3(0.5));
    float driveProbe = latticeProbe.x;
    float gateProbe = latticeProbe.y;
    auxMixPeak = max(auxMixPeak, gateProbe);
    diagDriveMax = max(diagDriveMax, driveProbe);
  }

  if (u_debugMode == 4) {



    float rawVis = encodeLogVis(diagRawMax);



    float boostVis = encodeLogVis(diagBoostMax);



    float densityVis = encodeLogVis(diagDensityMax);



    float driveVis = encodeLogVis(diagDriveMax);



    outColor = vec4(rawVis, boostVis, densityVis, driveVis);



    outAux = vec4(0.0);



    outId = vec4(0.0);



    return;



  }



  if (u_testMode != 0) {



    float coverage = bandHits > 0.0 ? 1.0 : 0.0;



    float normBandSamples = max(bandSamples, 1e-6);



  // Amplify df visibility in test mode so 8-bit readback registers nonzero



  float meanDf = bandHits > 0.0 ? clamp(sumAbsDf / normBandSamples * 1.5, 0.0, 1.0) : 0.0;



  float meanGate = bandHits > 0.0 ? clamp(sumGate / normBandSamples * 0.2, 0.0, 1.0) : 0.0;



  // In test mode 6, amplify ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ magnitude to clear 8-bit quantization and frame averaging



  float thetaScale = (u_testMode == 6) ? 2e-14 : 1e-15;



  float meanTheta = bandHits > 0.0 ? clamp(sumTheta / normBandSamples * thetaScale, 0.0, 1.0) : 0.0;



    vec4 testOut = vec4(0.0);



    if (u_testMode == 1) {



      testOut = vec4(1.0);



    } else if (u_testMode == 2) {



      testOut = vec4(vec3(coverage), coverage);



    } else if (u_testMode == 3) {



      testOut = vec4(vec3(meanDf), coverage);



    } else if (u_testMode == 4) {



      testOut = vec4(vec3(meanGate), coverage);



    } else if (u_testMode == 5) {



      float baseOnly = clamp(abs(u_baseScale) * 1e-15, 0.0, 1.0);



      testOut = vec4(vec3(baseOnly), 1.0);



    } else if (u_testMode == 6) {



      // Derive a visibility proxy from df and base scaling so harness can register nonzero



      // even when meanTheta is very small due to averaging/quantization. Test-only.



      float proxy = (bandHits > 0.0)



        ? clamp(meanDf * abs(u_baseScale) * 2e-14, 0.0, 1.0)



        : 0.0;



      float thetaVis = max(meanTheta, proxy);



      testOut = vec4(vec3(thetaVis), 1.0);



    } else if (u_testMode == 7) {



      testOut = vec4(rayHit ? 1.0 : 0.0, 0.0, 0.0, rayHit ? 1.0 : 0.0);



    }



    outColor = testOut;



    outAux = vec4(auxThetaPeak, auxRhoMin, auxMixPeak, auxKijPeak);



    outId = vec4(0.0);



    return;



  }



  if (u_probeMode != 0) {



    float coverage = sampleCount > 0.0 ? clamp(bandHits / sampleCount, 0.0, 1.0) : 0.0;



    float meanL = bandWeight > 1e-6 ? bandLuma / bandWeight : 0.0;



    outColor = vec4(vec3(meanL), coverage);



    outAux = vec4(auxThetaPeak, auxRhoMin, auxMixPeak, auxKijPeak);



    outId = vec4(0.0);



    return;



  }







  outColor = vec4(accum.rgb, clamp(accum.a, 0.0, 1.0));



  outAux = vec4(auxThetaPeak, auxRhoMin, auxMixPeak, auxKijPeak);

  float idHit = (rayHit && accum.a > 0.02) ? 1.0 : 0.0;
  vec3 idMask = vec3(idHull, idWarpGrid, idRing) * idHit;
  outId = vec4(idMask, 1.0);

}



`;







const POST_VS = RAYMARCH_VS;







const buildPostFs = (enableSpaceGrid: boolean) => `#version 300 es
#define ENABLE_SPACETIME_GRID ${enableSpaceGrid ? 1 : 0}

precision highp float;

precision highp sampler2D;
precision highp sampler3D;
#if ENABLE_SPACETIME_GRID
#endif







in vec2 v_ndc;



out vec4 outColor;







uniform sampler2D u_colorTex;



uniform sampler2D u_auxTex;



uniform sampler2D u_idTex;



uniform sampler2D u_ringInstantTex;



uniform sampler2D u_ringAverageTex;



uniform sampler2D u_greensTex;

uniform sampler2D u_envMap;
uniform int u_skyboxEnabled;
uniform int u_skyboxMode; // 0 off, 1 flat, 2 geodesic
uniform float u_skyboxExposure;
uniform int u_geoSteps;
uniform float u_geoStep;
uniform float u_geoBend;
uniform float u_geoShift;
uniform float u_geoMaxDist;
uniform sampler3D u_geoFieldTex;
uniform int u_geoFieldMode; // 0 off, 1 t00, 2 curvature
uniform vec2 u_geoFieldRange;
uniform float u_envRotation;
uniform mat4 u_invViewProj;
uniform vec3 u_cameraPos;
uniform vec3 u_axes;
uniform float u_domainScale;
uniform float u_R;
uniform float u_sigma;
uniform float u_beta;
uniform int u_metricMode;
uniform int u_geoScientific;
uniform int u_metricFieldEnabled;
uniform sampler3D u_metricABTex;
uniform sampler3D u_metricGammaTex;
uniform vec3 u_metricDims;

#if ENABLE_SPACETIME_GRID
uniform sampler3D u_spaceGridSdf;



uniform sampler2D u_spaceGridSdfAtlas;
#endif







uniform vec2 u_resolution;



uniform float u_phase;







uniform int u_showKHeat;



uniform int u_kMode;



uniform float u_kGain;



uniform float u_kAlpha;







uniform int u_showThetaIso;



uniform float u_isoStep;



uniform float u_isoWidth;



uniform float u_isoOpacity;







uniform int u_showFR;



uniform float u_tauLC;



uniform float u_burst;



uniform float u_dwell;



uniform float u_frAlpha;



uniform int u_showRecLamp;







uniform int u_showSectorArc;



uniform float u_arcRadiusPx;



uniform float u_arcWidthPx;



uniform float u_arcGapPx;



uniform float u_arcInstantAlpha;



uniform float u_arcEmaAlpha;







uniform int u_showTilt;



uniform vec2 u_tiltDir;



uniform float u_tiltMag;

uniform float u_tiltAlpha;



uniform int u_showGreens;



uniform vec2 u_greensSizePx;



uniform vec2 u_greensOriginPx;



uniform vec2 u_greensRange;



uniform float u_greensAlpha;

vec3 diverge(float t);

#if ENABLE_SPACETIME_GRID
uniform int   u_spaceGridEnabled;
uniform int   u_spaceGridMode; // 0 slice, 1 surface, 2 volume
uniform int   u_spaceGridHasSdf;
uniform int   u_spaceGridColorBy; // 0 thetaSign, 1 thetaMag, 2 warpStrength
uniform float u_spaceGridSpacing;
uniform float u_spaceGridWarp;
uniform float u_spaceGridFalloff;
uniform float u_spaceGridThetaNorm;
uniform float u_spaceGridDomainScale;
uniform mat4  u_spaceGridWorldToLattice;
uniform vec3  u_spaceGridLatticeMin;
uniform vec3  u_spaceGridLatticeSize;
uniform vec3  u_spaceGridDims;
uniform vec2  u_spaceGridAtlasTiles;
uniform vec2  u_spaceGridSliceInvSize;
uniform int   u_spaceGridUseAtlas;
#endif










#if ENABLE_SPACETIME_GRID
float aaGrid(vec2 coord, vec2 fwidthScale) {
  vec2 dist = abs(fract(coord) - 0.5);
  vec2 fw = fwidthScale * 1.5;
  float gx = 1.0 - smoothstep(0.0, fw.x, dist.x);
  float gy = 1.0 - smoothstep(0.0, fw.y, dist.y);
  return clamp(max(gx, gy), 0.0, 1.0);
}

vec3 spaceGridDiverge(float t) {
  float u = clamp(0.5 + 0.5 * t, 0.0, 1.0);
  vec3 cold = vec3(0.20, 0.42, 0.85);
  vec3 mid = vec3(0.92, 0.95, 0.96);
  vec3 warm = vec3(0.95, 0.52, 0.18);
  if (u < 0.5) {
    float f = u / 0.5;
    return mix(cold, mid, f);
  } else {
    float f = (u - 0.5) / 0.5;
    return mix(mid, warm, f);
  }
}

float sampleSpaceGridSdfAtlas(vec3 uvw) {
  vec2 tileCount = max(u_spaceGridAtlasTiles, vec2(1.0));
  vec2 invTile = 1.0 / tileCount;
  float depth = max(u_spaceGridDims.z, 1.0);
  float zf = clamp(uvw.z, 0.0, 1.0) * (depth - 1.0);
  float z0 = floor(zf);
  float z1 = min(z0 + 1.0, depth - 1.0);
  float t = zf - z0;

  vec2 uv = clamp(uvw.xy, u_spaceGridSliceInvSize * 0.5, vec2(1.0) - u_spaceGridSliceInvSize * 0.5);
  vec2 tile0 = vec2(mod(z0, tileCount.x), floor(z0 / tileCount.x));
  vec2 tile1 = vec2(mod(z1, tileCount.x), floor(z1 / tileCount.x));
  vec2 uv0 = (tile0 + uv) * invTile;
  vec2 uv1 = (tile1 + uv) * invTile;
  float s0 = texture(u_spaceGridSdfAtlas, uv0).r;
  float s1 = texture(u_spaceGridSdfAtlas, uv1).r;
  return mix(s0, s1, t);
}

float sampleSpaceGridSdf(vec3 uvw) {
  if (u_spaceGridHasSdf == 0) return 1e9;
  if (u_spaceGridUseAtlas != 0) return sampleSpaceGridSdfAtlas(uvw);
  return texture(u_spaceGridSdf, uvw).r;
}

vec3 applySpacetimeGrid(
  vec3 baseColor,
  vec2 uv,
  vec2 resolution,
  float theta,
  int colorBy,
  float spacing,
  float warpStrength,
  float falloff,
  float thetaNorm,
  int hasSdf,
  int mode
) {
  float norm = max(thetaNorm, 1e-6);
  float thetaScaled = theta / norm;
  float thetaMag = clamp(abs(thetaScaled), 0.0, 4.0);
  float thetaSat = clamp(thetaScaled, -2.0, 2.0);
  float thetaWarp = -clamp(thetaScaled, -1.0, 1.0);
  vec2 px = 1.0 / max(resolution, vec2(1.0));
  vec2 uvCentered = uv - 0.5;
  vec2 aspect = vec2(resolution.x / max(resolution.y, 1.0), 1.0);
  vec2 radial = uvCentered * aspect;
  float radialLen = length(radial);
  vec2 radialDir = radialLen > 1e-5 ? radial / radialLen : vec2(1.0, 0.0);

  vec3 pWorld = vec3(v_ndc.x, v_ndc.y, 0.0) * u_spaceGridDomainScale;
  vec4 lp = u_spaceGridWorldToLattice * vec4(pWorld, 1.0);
  vec3 pLocal = lp.xyz;
  vec2 absP = abs(pLocal.xy);
  float analyticSigned = max(absP.x, absP.y) - (0.45 * u_spaceGridDomainScale);
  float sdfSigned = analyticSigned;
  float sdfAbs = abs(analyticSigned);

  if (hasSdf != 0) {
    vec3 uvw = (pLocal - u_spaceGridLatticeMin) / u_spaceGridLatticeSize;
    bool inBounds = all(greaterThanEqual(uvw, vec3(0.0))) && all(lessThanEqual(uvw, vec3(1.0)));
    if (inBounds) {
      float s = sampleSpaceGridSdf(uvw);
      sdfSigned = s;
      sdfAbs = abs(s);
    } else {
      hasSdf = 0;
    }
  }

  float targetOffset = spacing;
  float distForFall = (mode == 1) ? abs(sdfSigned - targetOffset) : sdfAbs;
  float fall = exp(-distForFall / max(falloff, 1e-3));
  if (hasSdf == 0) {
    fall *= 0.85;
  }

  vec2 pWarp = uvCentered + radialDir * (warpStrength * fall * thetaWarp);
  float spacingNorm = max(1e-4, spacing * 0.25);
  vec2 gridUV = pWarp / spacingNorm;
  vec2 fw = fwidth(gridUV) + px * 0.5;
  float gridMask = aaGrid(gridUV, fw) * fall;

  if (mode == 1) {
    float shellBand = max(spacing * 0.35, falloff * 0.25);
    shellBand = max(shellBand, 1e-3);
    float shellMask = 1.0 - smoothstep(shellBand, shellBand * 2.0, distForFall);
    gridMask *= shellMask;
  }

  float colorParam = (colorBy == 2) ? thetaMag * warpStrength : (colorBy == 1 ? thetaMag : thetaSat);
  vec3 gridColor = spaceGridDiverge(colorParam);
  float blend = gridMask * 0.75;
  if (mode == 1) {
    vec3 additive = baseColor + gridColor * blend;
    return min(additive, vec3(1.0));
  }
  return mix(baseColor, gridColor, blend);
}
#endif
const float INV_TAU = 0.15915494309189535;





const float PI = 3.141592653589793;
const float TWO_PI_F = 6.283185307179586;

float tanhF(float x) {

  float ex = exp(x);

  float exInv = exp(-x);

  float denom = max(ex + exInv, 1e-6);

  return (ex - exInv) / denom;

}

float sech2F(float x) {

  float c = cosh(x);

  return 1.0 / max(c * c, 1e-6);

}

float shapeF(float r, float sigma, float R) {

  float den = max(1e-6, 2.0 * tanhF(sigma * R));

  float tPlus = tanhF(sigma * (r + R));

  float tMinus = tanhF(sigma * (r - R));

  return (tPlus - tMinus) / den;

}

float dTopHatDr(float r, float sigma, float R) {

  float den = max(1e-6, 2.0 * tanhF(sigma * R));

  return sigma * (sech2F(sigma * (r + R)) - sech2F(sigma * (r - R))) / den;

}

vec2 envMapUV(vec3 dir) {

  float phi = atan(dir.z, dir.x) + u_envRotation;

  float u = fract(0.5 + phi / TWO_PI_F);

  float v = 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / PI;

  return vec2(u, clamp(v, 0.0, 1.0));

}

vec3 sampleSkybox(vec3 dir) {

  vec2 uv = envMapUV(normalize(dir));

  return texture(u_envMap, uv).rgb;

}

vec3 viewRayDir(vec2 ndc) {

  vec4 farH = u_invViewProj * vec4(ndc, 1.0, 1.0);

  farH /= max(farH.w, 1e-6);

  return normalize(farH.xyz - u_cameraPos);

}

float sampleGeoFieldSigned(vec3 pos, vec3 bounds) {

  if (u_geoFieldMode == 0) return 0.0;

  vec3 gridCentered = pos / bounds;
  vec3 absGrid = abs(gridCentered);
  if (max(absGrid.x, max(absGrid.y, absGrid.z)) > 1.0) return 0.0;

  vec3 uvw = clamp(gridCentered * 0.5 + 0.5, 0.0, 1.0);
  float raw = texture(u_geoFieldTex, uvw).r;
  float span = max(1e-12, max(abs(u_geoFieldRange.x), abs(u_geoFieldRange.y)));
  return clamp(raw / span, -1.0, 1.0);

}

vec3 integrateGeodesic(vec3 origin, vec3 dir, float betaAmp) {

  vec3 pos = origin;

  vec3 p = normalize(dir);

  float pt = -1.0;

  vec3 axesSafe = max(abs(u_axes), vec3(1e-4));
  vec3 bounds = axesSafe * max(u_domainScale, 1e-3);

  vec3 invAxes = 1.0 / axesSafe;

  vec3 invAxesSq = invAxes * invAxes;

  float R = max(u_R, 1e-4);

  float exitRs = R * max(u_geoMaxDist, 1.0);

  float step = max(u_geoStep, 1e-5);

  for (int i = 0; i < ${SKYBOX_MAX_STEPS}; i++) {

    if (i >= u_geoSteps) break;

    float fieldSigned = 1.0;
    float fieldMag = 1.0;
    if (u_geoFieldMode != 0) {
      fieldSigned = sampleGeoFieldSigned(pos, bounds);
      fieldMag = clamp(abs(fieldSigned), 0.0, 1.0);
    }
    float bendScale = max(u_geoBend, 0.0) * fieldSigned;
    float shiftScale = max(u_geoShift, 0.0) * fieldMag;

    vec3 pMetric = pos * invAxes;

    float rs = length(pMetric);

    float f = shapeF(rs, u_sigma, R);

    float dfdr = dTopHatDr(rs, u_sigma, R);

    vec3 dirRadial = (rs > 1e-6) ? normalize(pMetric) : vec3(1.0, 0.0, 0.0);

    vec3 shiftDir = (u_metricMode == 2) ? dirRadial : vec3(-1.0, 0.0, 0.0);

    float betaScaled = betaAmp * shiftScale;

    float bMag = betaScaled * f;

    vec3 beta = shiftDir * bMag;

    // Irrotational mode uses radial shift; gradient ignores direction derivatives.
    vec3 gradB = betaScaled * dfdr * (pos * invAxesSq) / max(rs, 1e-6);

    gradB *= bendScale;

    float betaDotP = dot(beta, p);

    float pAlong = dot(p, shiftDir);

    vec3 dx1 = p - (pt + betaDotP) * beta;

    vec3 dp1 = (pt + betaDotP) * pAlong * gradB;

    vec3 xm = pos + 0.5 * step * dx1;

    vec3 pm = p + 0.5 * step * dp1;

    pMetric = xm * invAxes;

    rs = length(pMetric);

    f = shapeF(rs, u_sigma, R);

    dfdr = dTopHatDr(rs, u_sigma, R);

    dirRadial = (rs > 1e-6) ? normalize(pMetric) : vec3(1.0, 0.0, 0.0);

    shiftDir = (u_metricMode == 2) ? dirRadial : vec3(-1.0, 0.0, 0.0);

    bMag = betaScaled * f;

    beta = shiftDir * bMag;

    gradB = betaScaled * dfdr * (xm * invAxesSq) / max(rs, 1e-6);

    gradB *= bendScale;

    float betaDotP2 = dot(beta, pm);

    float pAlong2 = dot(pm, shiftDir);

    vec3 dx2 = pm - (pt + betaDotP2) * beta;

    vec3 dp2 = (pt + betaDotP2) * pAlong2 * gradB;

    pos += step * dx2;

    p += step * dp2;

    float p2 = max(dot(p, p), 1e-9);

    float bdotp = dot(beta, p);

    float A = max(p2 - bdotp * bdotp, 1e-6);

    float scale = (sqrt(p2) + pt * bdotp) / A;

    p *= scale;

    if (length(pos * invAxes) > exitRs && u_geoMaxDist > 0.0) break;

  }

  return normalize(p);

}

float mget(mat4 m, int row, int col) {
  return m[col][row];
}

float comp4(vec4 v, int i) {
  return i == 0 ? v.x : (i == 1 ? v.y : (i == 2 ? v.z : v.w));
}

vec3 metricBounds() {
  vec3 axesSafe = max(abs(u_axes), vec3(1e-4));
  return axesSafe * max(u_domainScale, 1e-3);
}

bool sampleMetricPrimitive(vec3 pos, out float alpha, out vec3 beta, out vec3 gammaDiag) {
  alpha = 1.0;
  beta = vec3(0.0);
  gammaDiag = vec3(1.0);
  if (u_metricFieldEnabled == 0) return false;
  vec3 bounds = metricBounds();
  vec3 centered = pos / bounds;
  bool inBounds = max(abs(centered.x), max(abs(centered.y), abs(centered.z))) <= 1.0;
  vec3 uvw = clamp(centered * 0.5 + 0.5, 0.0, 1.0);
  vec4 ab = texture(u_metricABTex, uvw);
  vec4 gg = texture(u_metricGammaTex, uvw);
  alpha = max(ab.w, 1e-6);
  beta = ab.xyz;
  gammaDiag = max(gg.xyz, vec3(1e-6));
  return inBounds;
}

void buildMetricMatrices(float alpha, vec3 beta, vec3 gammaDiag, out mat4 g, out mat4 gInv) {
  float invA2 = 1.0 / max(alpha * alpha, 1e-12);
  float invGx = 1.0 / max(gammaDiag.x, 1e-12);
  float invGy = 1.0 / max(gammaDiag.y, 1e-12);
  float invGz = 1.0 / max(gammaDiag.z, 1e-12);

  float g00 = -(alpha * alpha) +
    gammaDiag.x * beta.x * beta.x +
    gammaDiag.y * beta.y * beta.y +
    gammaDiag.z * beta.z * beta.z;
  float g01 = gammaDiag.x * beta.x;
  float g02 = gammaDiag.y * beta.y;
  float g03 = gammaDiag.z * beta.z;

  g = mat4(0.0);
  g[0][0] = g00;
  g[1][0] = g01;
  g[2][0] = g02;
  g[3][0] = g03;
  g[0][1] = g01;
  g[1][1] = gammaDiag.x;
  g[0][2] = g02;
  g[2][2] = gammaDiag.y;
  g[0][3] = g03;
  g[3][3] = gammaDiag.z;

  gInv = mat4(0.0);
  gInv[0][0] = -invA2;
  gInv[0][1] = beta.x * invA2;
  gInv[0][2] = beta.y * invA2;
  gInv[0][3] = beta.z * invA2;
  gInv[1][0] = beta.x * invA2;
  gInv[2][0] = beta.y * invA2;
  gInv[3][0] = beta.z * invA2;
  gInv[1][1] = invGx - beta.x * beta.x * invA2;
  gInv[2][2] = invGy - beta.y * beta.y * invA2;
  gInv[3][3] = invGz - beta.z * beta.z * invA2;
  gInv[1][2] = -beta.x * beta.y * invA2;
  gInv[2][1] = gInv[1][2];
  gInv[1][3] = -beta.x * beta.z * invA2;
  gInv[3][1] = gInv[1][3];
  gInv[2][3] = -beta.y * beta.z * invA2;
  gInv[3][2] = gInv[2][3];
}

float metricPartial(mat4 dgdx, mat4 dgdy, mat4 dgdz, int derivIdx, int row, int col) {
  if (derivIdx == 1) return mget(dgdx, row, col);
  if (derivIdx == 2) return mget(dgdy, row, col);
  if (derivIdx == 3) return mget(dgdz, row, col);
  return 0.0;
}

float solveNullK0(mat4 g, vec3 spatial) {
  float sx = spatial.x;
  float sy = spatial.y;
  float sz = spatial.z;
  float A = mget(g, 0, 0);
  float B = 2.0 * (mget(g, 0, 1) * sx + mget(g, 0, 2) * sy + mget(g, 0, 3) * sz);
  float C =
    mget(g, 1, 1) * sx * sx +
    mget(g, 2, 2) * sy * sy +
    mget(g, 3, 3) * sz * sz +
    2.0 * (
      mget(g, 1, 2) * sx * sy +
      mget(g, 1, 3) * sx * sz +
      mget(g, 2, 3) * sy * sz
    );
  float disc = max(B * B - 4.0 * A * C, 0.0);
  float root = sqrt(disc);
  float denom = abs(2.0 * A) > 1e-12 ? 2.0 * A : (A < 0.0 ? -2e-12 : 2e-12);
  float r1 = (-B - root) / denom;
  float r2 = (-B + root) / denom;
  bool r1Finite = !(isnan(r1) || isinf(r1));
  bool r2Finite = !(isnan(r2) || isinf(r2));
  if (r1 > 0.0 && r1Finite) return r1;
  if (r2 > 0.0 && r2Finite) return r2;
  if (r1Finite) return r1;
  if (r2Finite) return r2;
  return 1.0;
}

void sampleMetricAndDerivativesScientific(
  vec3 pos,
  out mat4 g,
  out mat4 gInv,
  out mat4 dgdx,
  out mat4 dgdy,
  out mat4 dgdz,
  out float gradNorm
) {
  float alpha;
  vec3 beta;
  vec3 gammaDiag;
  sampleMetricPrimitive(pos, alpha, beta, gammaDiag);
  buildMetricMatrices(alpha, beta, gammaDiag, g, gInv);

  vec3 bounds = metricBounds();
  vec3 dims = max(u_metricDims, vec3(1.0));
  vec3 h = max((2.0 * bounds) / dims, vec3(1e-5));

  float aPx; vec3 bPx; vec3 gPx;
  float aMx; vec3 bMx; vec3 gMx;
  float aPy; vec3 bPy; vec3 gPy;
  float aMy; vec3 bMy; vec3 gMy;
  float aPz; vec3 bPz; vec3 gPz;
  float aMz; vec3 bMz; vec3 gMz;
  sampleMetricPrimitive(pos + vec3(h.x, 0.0, 0.0), aPx, bPx, gPx);
  sampleMetricPrimitive(pos - vec3(h.x, 0.0, 0.0), aMx, bMx, gMx);
  sampleMetricPrimitive(pos + vec3(0.0, h.y, 0.0), aPy, bPy, gPy);
  sampleMetricPrimitive(pos - vec3(0.0, h.y, 0.0), aMy, bMy, gMy);
  sampleMetricPrimitive(pos + vec3(0.0, 0.0, h.z), aPz, bPz, gPz);
  sampleMetricPrimitive(pos - vec3(0.0, 0.0, h.z), aMz, bMz, gMz);

  mat4 gxP; mat4 gxI;
  mat4 gxM; mat4 gxMI;
  mat4 gyP; mat4 gyI;
  mat4 gyM; mat4 gyMI;
  mat4 gzP; mat4 gzI;
  mat4 gzM; mat4 gzMI;
  buildMetricMatrices(aPx, bPx, gPx, gxP, gxI);
  buildMetricMatrices(aMx, bMx, gMx, gxM, gxMI);
  buildMetricMatrices(aPy, bPy, gPy, gyP, gyI);
  buildMetricMatrices(aMy, bMy, gMy, gyM, gyMI);
  buildMetricMatrices(aPz, bPz, gPz, gzP, gzI);
  buildMetricMatrices(aMz, bMz, gMz, gzM, gzMI);

  dgdx = (gxP - gxM) / (2.0 * h.x);
  dgdy = (gyP - gyM) / (2.0 * h.y);
  dgdz = (gzP - gzM) / (2.0 * h.z);
  gradNorm = length(vec3(
    metricPartial(dgdx, dgdy, dgdz, 1, 0, 0),
    metricPartial(dgdx, dgdy, dgdz, 2, 0, 0),
    metricPartial(dgdx, dgdy, dgdz, 3, 0, 0)
  ));
}

void geodesicAccelScientific(vec3 pos, vec4 k4, out vec4 accel, out float gradNorm) {
  mat4 g;
  mat4 gInv;
  mat4 dgdx;
  mat4 dgdy;
  mat4 dgdz;
  sampleMetricAndDerivativesScientific(pos, g, gInv, dgdx, dgdy, dgdz, gradNorm);
  accel = vec4(0.0);
  for (int mu = 0; mu < 4; mu++) {
    float accumMu = 0.0;
    for (int nu = 0; nu < 4; nu++) {
      float accumNu = 0.0;
      for (int a = 0; a < 4; a++) {
        for (int b = 0; b < 4; b++) {
          float dABNu = metricPartial(dgdx, dgdy, dgdz, a, b, nu);
          float dBANu = metricPartial(dgdx, dgdy, dgdz, b, a, nu);
          float dNuAB = metricPartial(dgdx, dgdy, dgdz, nu, a, b);
          float ka = comp4(k4, a);
          float kb = comp4(k4, b);
          accumNu += (dABNu + dBANu - dNuAB) * ka * kb;
        }
      }
      accumMu += 0.5 * mget(gInv, mu, nu) * accumNu;
    }
    if (mu == 0) accel.x = -accumMu;
    else if (mu == 1) accel.y = -accumMu;
    else if (mu == 2) accel.z = -accumMu;
    else accel.w = -accumMu;
  }
}

void rk4Scientific(
  vec4 x4,
  vec4 k4,
  float h,
  out vec4 xNext,
  out vec4 kNext,
  out float gradOut
) {
  vec4 a1; float g1;
  geodesicAccelScientific(x4.yzw, k4, a1, g1);
  vec4 x2 = x4 + 0.5 * h * k4;
  vec4 k2In = k4 + 0.5 * h * a1;
  vec4 a2; float g2;
  geodesicAccelScientific(x2.yzw, k2In, a2, g2);
  vec4 x3 = x4 + 0.5 * h * k2In;
  vec4 k3In = k4 + 0.5 * h * a2;
  vec4 a3; float g3;
  geodesicAccelScientific(x3.yzw, k3In, a3, g3);
  vec4 x4End = x4 + h * k3In;
  vec4 k4In = k4 + h * a3;
  vec4 a4; float g4;
  geodesicAccelScientific(x4End.yzw, k4In, a4, g4);
  xNext = x4 + (h / 6.0) * (k4 + 2.0 * k2In + 2.0 * k3In + k4In);
  kNext = k4 + (h / 6.0) * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
  gradOut = 0.25 * (g1 + g2 + g3 + g4);
}

vec3 integrateGeodesicScientific(vec3 origin, vec3 dir) {
  vec4 x4 = vec4(0.0, origin);
  vec3 spatial = normalize(dir);
  mat4 g0; mat4 gInv0; mat4 dgx0; mat4 dgy0; mat4 dgz0; float grad0;
  sampleMetricAndDerivativesScientific(origin, g0, gInv0, dgx0, dgy0, dgz0, grad0);
  vec4 k4 = vec4(solveNullK0(g0, spatial), spatial);
  float baseStep = max(u_geoStep, 1e-5);
  vec3 bounds = metricBounds();
  float exitRs = max(u_R, 1e-4) * max(u_geoMaxDist, 1.0);
  for (int i = 0; i < ${SKYBOX_MAX_STEPS}; i++) {
    if (i >= u_geoSteps) break;
    vec4 acc; float gradCurr;
    geodesicAccelScientific(x4.yzw, k4, acc, gradCurr);
    float h = clamp(baseStep / (1.0 + 0.6 * gradCurr), baseStep * 0.2, baseStep * 1.5);
    vec4 xNext; vec4 kNext; float gradOut;
    rk4Scientific(x4, k4, h, xNext, kNext, gradOut);
    x4 = xNext;
    k4 = kNext;
    mat4 gNow; mat4 gInvNow; mat4 dgxNow; mat4 dgyNow; mat4 dgzNow; float gradNow;
    sampleMetricAndDerivativesScientific(x4.yzw, gNow, gInvNow, dgxNow, dgyNow, dgzNow, gradNow);
    float k0 = solveNullK0(gNow, k4.yzw);
    k4.x = k0;
    vec3 spatialNow = k4.yzw;
    float mag = max(length(spatialNow), 1e-8);
    k4.yzw = spatialNow / mag;
    if (length(x4.yzw / max(bounds, vec3(1e-4))) > exitRs && u_geoMaxDist > 0.0) break;
  }
  return normalize(k4.yzw);
}




float saturate(float v) {



  return clamp(v, 0.0, 1.0);



}

vec3 srgbToLinear(vec3 c) {
  vec3 clamped = max(c, 0.0);
  vec3 low = clamped / 12.92;
  vec3 high = pow((clamped + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), clamped));
}

vec3 linearToSrgb(vec3 c) {
  vec3 clamped = max(c, 0.0);
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 gradeHalo(vec3 c) {
  const float exposure = 1.0;
  const float contrast = 1.0;
  const float saturation = 1.0;

  c *= exposure;
  c = acesFilm(c);
  c = (c - 0.5) * contrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  return clamp(c, 0.0, 1.0);
}

float luma709(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 fxaa(sampler2D tex, vec2 fragCoord, vec2 resolution) {
  vec2 invRes = 1.0 / max(resolution, vec2(1.0));
  vec3 rgbNW = texture(tex, (fragCoord + vec2(-1.0, -1.0)) * invRes).rgb;
  vec3 rgbNE = texture(tex, (fragCoord + vec2(1.0, -1.0)) * invRes).rgb;
  vec3 rgbSW = texture(tex, (fragCoord + vec2(-1.0, 1.0)) * invRes).rgb;
  vec3 rgbSE = texture(tex, (fragCoord + vec2(1.0, 1.0)) * invRes).rgb;
  vec3 rgbM = texture(tex, fragCoord * invRes).rgb;

  float lumaNW = luma709(rgbNW);
  float lumaNE = luma709(rgbNE);
  float lumaSW = luma709(rgbSW);
  float lumaSE = luma709(rgbSE);
  float lumaM = luma709(rgbM);

  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  float lumaRange = lumaMax - lumaMin;

  const float EDGE_THRESHOLD = 0.166;
  const float EDGE_THRESHOLD_MIN = 1.0 / 12.0;
  if (lumaRange < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD)) {
    return rgbM;
  }

  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

  const float FXAA_REDUCE_MIN = 1.0 / 128.0;
  const float FXAA_REDUCE_MUL = 1.0 / 8.0;
  const float FXAA_SPAN_MAX = 4.0;

  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-FXAA_SPAN_MAX), vec2(FXAA_SPAN_MAX)) * invRes;

  vec3 rgbA = 0.5 * (
    texture(tex, fragCoord * invRes + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(tex, fragCoord * invRes + dir * (2.0 / 3.0 - 0.5)).rgb
  );

  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(tex, fragCoord * invRes + dir * -0.5).rgb +
    texture(tex, fragCoord * invRes + dir * 0.5).rgb
  );

  float lumaB = luma709(rgbB);
  if (lumaB < lumaMin || lumaB > lumaMax) {
    return rgbA;
  }

  return rgbB;
}

const float BAYER4[16] = float[16](
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0
);

float bayer4x4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = x + y * 4;
  return (BAYER4[idx] + 0.5) / 16.0;
}

const float DITHER_STRENGTH = 1.0 / 255.0;



vec3 magma(float t) {



  float u = saturate(t);



  vec3 c0 = vec3(0.001, 0.000, 0.015);



  vec3 c1 = vec3(0.180, 0.062, 0.356);



  vec3 c2 = vec3(0.976, 0.983, 0.643);



  vec3 mid = mix(c0, c1, smoothstep(0.0, 0.6, u));



  return mix(mid, c2, smoothstep(0.4, 1.0, u));



}







vec3 diverge(float t) {



  float u = saturate(0.5 + 0.5 * t);



  vec3 cold = vec3(0.20, 0.42, 0.85);



  vec3 mid = vec3(0.92, 0.95, 0.96);



  vec3 warm = vec3(0.95, 0.52, 0.18);



  if (u < 0.5) {



    float f = u / 0.5;



    return mix(cold, mid, f);



  } else {



    float f = (u - 0.5) / 0.5;



    return mix(mid, warm, f);



  }



}







float strokeSegment(vec2 p, vec2 a, vec2 b, float halfWidth) {



  vec2 pa = p - a;



  vec2 ba = b - a;



  float len2 = dot(ba, ba);



  if (len2 < 1e-6) {



    return 0.0;



  }



  float h = clamp(dot(pa, ba) / len2, 0.0, 1.0);



  float dist = length(pa - ba * h);



  return 1.0 - smoothstep(halfWidth, halfWidth + 1.5, dist);



}







vec3 applyKHeat(vec3 baseColor, float theta, float kmix, float kij, int mode, float gain, float alpha) {



  float scalar = 0.0;



  if (mode == 0) {



    scalar = max(kij, 0.0);



  } else if (mode == 1) {



    scalar = max(theta * theta, 0.0);



  } else {



    scalar = abs(kmix);



  }



  float g = max(gain, 1e-3);



  float mapped = log(1.0 + scalar * g) / log(1.0 + g);



  mapped = saturate(mapped);



  vec3 heat = magma(mapped);



  float blend = saturate(alpha * mapped);



  return mix(baseColor, heat, blend);



}







vec3 applyThetaIso(vec3 baseColor, float theta, float stepSize, float width, float opacity, float phase) {



  float stepV = max(stepSize, 1e-12);



  float bands = abs(theta) / stepV + phase;



  float stripe = 1.0 - smoothstep(0.5 - width, 0.5 + width, fract(bands));



  float alpha = saturate(opacity * stripe);



  vec3 posColor = vec3(0.96, 0.98, 0.99);



  vec3 negColor = vec3(0.60, 0.78, 1.00);



  vec3 tone = theta >= 0.0 ? posColor : negColor;



  return mix(baseColor, tone, alpha);



}







void main() {



  vec2 uv = 0.5 * (v_ndc + 1.0);



  vec2 fragPx = uv * u_resolution;



  vec4 base = texture(u_colorTex, uv);



  vec4 aux = texture(u_auxTex, uv);



  float thetaPeak = aux.r;



  float kmixPeak = aux.b;



  float kijPeak = aux.a;







  vec3 color = fxaa(u_colorTex, fragPx, u_resolution);

  if (u_skyboxEnabled != 0) {
    vec3 rayDir = viewRayDir(v_ndc);
    vec3 skyDir = rayDir;
    if (u_skyboxMode == 2 && u_geoSteps > 0 && u_geoStep > 0.0) {
      if (u_geoScientific != 0 && u_metricFieldEnabled != 0) {
        skyDir = integrateGeodesicScientific(u_cameraPos, rayDir);
      } else {
        skyDir = integrateGeodesic(u_cameraPos, rayDir, u_beta);
      }
    }
    vec3 sky = sampleSkybox(skyDir);
    // Env map is authored in sRGB; convert to linear before exposure/compositing.
    sky = srgbToLinear(sky) * u_skyboxExposure;
    color = mix(sky, color, base.a);
  }



  float alphaOverlay = 0.0;







  if (u_showKHeat != 0 && u_kAlpha > 1e-4) {



    color = applyKHeat(color, thetaPeak, kmixPeak, kijPeak, u_kMode, u_kGain, u_kAlpha);



  }







  if (u_showThetaIso != 0 && u_isoOpacity > 1e-4) {



    float stripeWidth = max(u_isoWidth, 1e-4);



    color = applyThetaIso(color, thetaPeak, u_isoStep, stripeWidth, u_isoOpacity, u_phase);



  }

#if ENABLE_SPACETIME_GRID
  if (u_spaceGridEnabled != 0 && (u_spaceGridMode == 0 || u_spaceGridMode == 1)) {
    color = applySpacetimeGrid(color, uv, u_resolution, thetaPeak, u_spaceGridColorBy, u_spaceGridSpacing, u_spaceGridWarp, u_spaceGridFalloff, u_spaceGridThetaNorm, u_spaceGridHasSdf, u_spaceGridMode);
  }
#endif



  if (u_showFR != 0 && u_frAlpha > 1e-4) {



    vec2 origin = vec2(24.0, 24.0);



    vec2 size = vec2(220.0, 26.0);



    vec2 pos = (fragPx - origin) / size;



    if (pos.x >= 0.0 && pos.x <= 1.0 && pos.y >= 0.0 && pos.y <= 1.0) {



      float tau = max(u_tauLC, 1e-9);



      float burstRatio = u_burst / tau;



      float dwellRatio = u_dwell / tau;



      bool burstOk = burstRatio <= 1.0 + 1e-3;



      bool dwellOk = dwellRatio >= 1.0 - 1e-3;



      vec3 frameOk = vec3(0.18, 0.78, 0.52);



      vec3 frameWarn = vec3(0.92, 0.47, 0.22);



      vec3 frame = (burstOk && dwellOk) ? frameOk : frameWarn;



      float border = smoothstep(0.0, 0.01, min(min(pos.x, pos.y), min(1.0 - pos.x, 1.0 - pos.y)));



      vec3 panel = mix(frame, vec3(0.05, 0.10, 0.16), border);



      float x = clamp(pos.x, 0.0, 1.0);



      float dwellFill = saturate(dwellRatio - x);



      float burstFill = saturate(burstRatio - x);



      panel = mix(panel, vec3(0.19, 0.78, 0.64), pow(dwellFill, 0.35));



      panel = mix(panel, vec3(0.95, 0.32, 0.24), pow(burstFill, 0.5));



      float tauLine = 1.0 - smoothstep(0.006, 0.012, abs(x - 1.0));



      panel = mix(panel, vec3(1.0), tauLine * 0.4);



      float blend = saturate(u_frAlpha);



      color = mix(color, panel, blend);



      alphaOverlay = max(alphaOverlay, blend);



    }



  }







  if (u_showSectorArc != 0 && (u_arcInstantAlpha > 1e-4 || u_arcEmaAlpha > 1e-4)) {



    float radius = max(u_arcRadiusPx, 6.0);



    vec2 centerPx = vec2(u_resolution.x - (radius + 40.0), radius + 40.0);



    vec2 delta = fragPx - centerPx;



    float dist = length(delta);



    if (dist > 1e-3) {



      float bandInstant = 1.0 - smoothstep(u_arcWidthPx, u_arcWidthPx + 2.0, abs(dist - radius));



      float innerRadius = max(radius - u_arcGapPx, 2.0);



      float bandEma = 1.0 - smoothstep(u_arcWidthPx, u_arcWidthPx + 2.0, abs(dist - innerRadius));



      if (bandInstant > 0.001 || bandEma > 0.001) {



        float a01 = fract(0.5 + atan(delta.y, delta.x) * INV_TAU);



        float instant = texture(u_ringInstantTex, vec2(a01, 0.5)).r;



        float ema = texture(u_ringAverageTex, vec2(a01, 0.5)).r;



        vec3 instColor = mix(vec3(0.12, 0.18, 0.28), vec3(0.98, 0.73, 0.28), saturate(pow(instant, 0.5)));



        vec3 emaColor = mix(vec3(0.12, 0.18, 0.28), vec3(0.22, 0.86, 0.74), saturate(pow(ema, 0.5)));



        float instAlpha = bandInstant * u_arcInstantAlpha * saturate(instant);



        float emaAlpha = bandEma * u_arcEmaAlpha * saturate(ema);



        color = mix(color, instColor, clamp(instAlpha, 0.0, 1.0));



        color = mix(color, emaColor, clamp(emaAlpha, 0.0, 1.0));



        alphaOverlay = max(alphaOverlay, max(instAlpha, emaAlpha));



      }



    }



  }







  if (u_showTilt != 0 && u_tiltAlpha > 1e-4 && length(u_tiltDir) > 1e-6 && u_tiltMag > 1e-5) {



    vec2 dir = normalize(u_tiltDir);



    float clampedMag = saturate(u_tiltMag);



    float radius = max(u_arcRadiusPx, 6.0);



    vec2 origin = vec2(u_resolution.x - (radius + 40.0), radius + 40.0);



    float lengthPx = 32.0 + 48.0 * clampedMag;



    vec2 tail = origin;



    vec2 tip = origin + dir * lengthPx;



    float body = strokeSegment(fragPx, tail, tip, 1.4);



    vec2 perp = vec2(-dir.y, dir.x);



    vec2 headA = tip - dir * 8.0 + perp * 6.0;



    vec2 headB = tip - dir * 8.0 - perp * 6.0;



    float head = max(strokeSegment(fragPx, tip, headA, 1.6), strokeSegment(fragPx, tip, headB, 1.6));



    float arrow = max(body, head);



    vec3 tiltColor = mix(vec3(0.28, 0.42, 0.96), vec3(0.92, 0.96, 0.68), clampedMag);



    float blend = clamp(arrow * u_tiltAlpha, 0.0, 1.0);



    color = mix(color, tiltColor, blend);



    alphaOverlay = max(alphaOverlay, blend);



  }







  if (u_showGreens != 0 && u_greensAlpha > 1e-4 && u_greensSizePx.x > 4.0 && u_greensSizePx.y > 4.0) {



    vec2 pos = (fragPx - u_greensOriginPx) / u_greensSizePx;



    if (pos.x >= 0.0 && pos.x <= 1.0 && pos.y >= 0.0 && pos.y <= 1.0) {



      vec2 sampleUV = vec2(pos.x, 1.0 - pos.y);



      float phi = texture(u_greensTex, sampleUV).r;



      float denom = max(u_greensRange.y - u_greensRange.x, 1e-9);



      float normalized = (phi - u_greensRange.x) / denom;



      float centered = clamp(normalized * 2.0 - 1.0, -1.0, 1.0);



      vec3 panel = diverge(centered);



      float contour = 1.0 - smoothstep(0.45, 0.55, abs(fract(normalized * 10.0) - 0.5));



      panel = mix(panel, vec3(1.0), contour * 0.12);



      float border = smoothstep(0.0, 0.01, min(min(pos.x, pos.y), min(1.0 - pos.x, 1.0 - pos.y)));



      panel = mix(panel, vec3(0.05, 0.10, 0.16), border);



      float blend = saturate(u_greensAlpha);



      color = mix(color, panel, blend);



      alphaOverlay = max(alphaOverlay, blend);



    }



  }







  if (u_showRecLamp != 0 && u_tauLC > 1e-6 && u_burst > 0.0) {



    float tau = max(u_tauLC, 1e-6);



    bool pass = (u_burst >= tau);



    vec2 lampUv = fragPx / u_resolution;



    float lampX = 1.0 - smoothstep(0.05, 0.08, lampUv.x);



    float lampY = smoothstep(0.92, 0.98, lampUv.y);



    float lamp = lampX * lampY;



    if (lamp > 0.001) {



      vec3 lampColor = pass ? vec3(0.18, 0.82, 0.54) : vec3(1.0, 0.70, 0.30);



      color = mix(color, lampColor, clamp(lamp, 0.0, 1.0));



      alphaOverlay = max(alphaOverlay, lamp * 0.65);



    }



  }

  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  float aR = texture(u_colorTex, uv + vec2(texel.x, 0.0)).a;
  float aL = texture(u_colorTex, uv - vec2(texel.x, 0.0)).a;
  float aU = texture(u_colorTex, uv + vec2(0.0, texel.y)).a;
  float aD = texture(u_colorTex, uv - vec2(0.0, texel.y)).a;
  float edgeA = abs(aR - aL) + abs(aU - aD);

  float tR = texture(u_auxTex, uv + vec2(texel.x, 0.0)).r;
  float tL = texture(u_auxTex, uv - vec2(texel.x, 0.0)).r;
  float tU = texture(u_auxTex, uv + vec2(0.0, texel.y)).r;
  float tD = texture(u_auxTex, uv - vec2(0.0, texel.y)).r;
  float edgeT = abs(tR - tL) + abs(tU - tD);
  float edgeTn = clamp(edgeT * 4.0, 0.0, 1.0);

  // u_idTex.rgb: hull shell, warp grid, ring overlay.
  vec3 idR = texture(u_idTex, uv + vec2(texel.x, 0.0)).rgb;
  vec3 idL = texture(u_idTex, uv - vec2(texel.x, 0.0)).rgb;
  vec3 idU = texture(u_idTex, uv + vec2(0.0, texel.y)).rgb;
  vec3 idD = texture(u_idTex, uv - vec2(0.0, texel.y)).rgb;
  vec3 edgeIdVec = abs(idR - idL) + abs(idU - idD);
  float edgeId = max(edgeIdVec.r, max(edgeIdVec.g, edgeIdVec.b));

  // Lower thresholds = stronger edges; higher = cleaner outlines.
  float edgeHull = smoothstep(0.04, 0.12, edgeA);
  float edgeWarp = smoothstep(0.02, 0.08, edgeTn);
  float edgeIdMask = smoothstep(0.05, 0.25, edgeId);
  float edge = max(edgeIdMask, max(edgeHull * 0.85, edgeWarp * 0.7));
  color *= (1.0 - edge * 0.18);
  color += vec3(0.02) * edge * 0.35;

  color = gradeHalo(color);
  color = linearToSrgb(color);
  float dither = bayer4x4(gl_FragCoord.xy) - 0.5;
  color += dither * DITHER_STRENGTH;
  color = clamp(color, 0.0, 1.0);

  float finalAlpha = max(base.a, saturate(alphaOverlay));
  if (u_skyboxEnabled != 0) {
    finalAlpha = max(finalAlpha, 1.0);
  }



  outColor = vec4(color, finalAlpha);



}



`;

const POST_FS = buildPostFs(true);
const POST_FS_NO_SPACEGRID = buildPostFs(false);


const RING_OVERLAY_VS = `#version 300 es

layout(location=0) in vec3 a_pos;

layout(location=1) in vec2 a_data;



uniform mat4 u_mvp;



out vec3 v_world;

out float v_theta01;

out float v_radial01;

out vec2 v_ndc;



void main() {

  v_world = a_pos;

  v_theta01 = fract(a_data.x);

  v_radial01 = clamp(a_data.y, 0.0, 1.0);

  vec4 clip = u_mvp * vec4(a_pos, 1.0);

  gl_Position = clip;

  v_ndc = clip.xy / max(clip.w, 1e-6);

}

`;



const RING_OVERLAY_FS = `#version 300 es

precision highp float;

precision highp sampler2D;



in vec3 v_world;

in float v_theta01;

in float v_radial01;

in vec2 v_ndc;



out vec4 outColor;



uniform vec3 u_baseColor;

uniform float u_baseAlpha;

uniform int u_mode;

uniform sampler2D u_ringAvg;

uniform sampler2D u_ringInst;

uniform sampler2D u_radialLUT;

uniform float u_ringBlend;

uniform float u_phaseSign;

uniform float u_phase01;

uniform int u_showPhaseTracer;

uniform vec3 u_axes;

uniform float u_R;

uniform float u_dfdrMax;



vec3 diverge(float t) {

  vec3 c1 = vec3(0.06, 0.25, 0.98);

  vec3 c2 = vec3(0.95);

  vec3 c3 = vec3(0.95, 0.30, 0.08);

  float x = clamp(t, 0.0, 1.0);

  return (x < 0.5)

    ? mix(c1, c2, x / 0.5)

    : mix(c2, c3, (x - 0.5) / 0.5);

}



float smoothBelt(float radial) {

  float inner = smoothstep(0.0, 0.12, radial);

  float outer = 1.0 - smoothstep(0.88, 1.0, radial);

  return clamp(inner * outer, 0.0, 1.0);

}



float shellBandWeight(float dfNorm, float radial) {

  float inner = smoothstep(0.0, 0.18, radial) * (1.0 - smoothstep(0.25, 0.4, radial));

  float outer = smoothstep(0.6, 0.8, radial) * (1.0 - smoothstep(0.9, 1.0, radial));

  float dfWeight = smoothstep(0.25, 0.6, dfNorm);

  return max(inner, outer) * dfWeight;

}



float sampleRing(sampler2D tex, float coord) {

  return texture(tex, vec2(fract(coord), 0.5)).r;

}



void main() {

  float belt = smoothBelt(v_radial01);

  float alpha = u_baseAlpha * belt;

  vec3 color = u_baseColor;



  if (u_mode == 1) {

    float blend = clamp(u_ringBlend, 0.0, 1.0);

    float wAvg = sampleRing(u_ringAvg, v_theta01);

    float wInst = sampleRing(u_ringInst, fract(v_theta01 + u_phaseSign * u_phase01));

    float wMix = clamp(mix(wAvg, wInst, blend), 0.0, 1.0);

    color = diverge(wMix);

    alpha = max(alpha, belt * (0.35 + 0.45 * wMix));

  } else if (u_mode == 2) {

    vec3 axesSafe = max(abs(u_axes), vec3(1e-5));

    float rMetric = length(vec3(

      v_world.x / (axesSafe.x * max(u_R, 1e-5)),

      v_world.y / (axesSafe.y * max(u_R, 1e-5)),

      v_world.z / (axesSafe.z * max(u_R, 1e-5))

    ));

    float df = texture(u_radialLUT, vec2(clamp(rMetric, 0.0, 1.0), 0.5)).r;

    float dfNorm = clamp(abs(df) / max(u_dfdrMax, 1e-6), 0.0, 1.0);

    float band = shellBandWeight(dfNorm, v_radial01);

    if (band > 0.0) {

      vec3 bandColor = mix(vec3(0.18, 0.78, 1.0), vec3(1.0, 0.58, 0.24), 0.55);

      color = mix(color, bandColor, clamp(band, 0.0, 1.0));

      alpha = max(alpha, belt * (0.25 + 0.6 * band));

    }

  }



  if (u_showPhaseTracer != 0 && u_phase01 >= 0.0) {

    float phase = fract(u_phaseSign >= 0.0 ? u_phase01 : (1.0 - u_phase01));

    float delta = abs(v_theta01 - phase);

    float dtheta = min(delta, 1.0 - delta);

    float tracer = smoothstep(0.06, 0.0, dtheta) * belt;

    vec3 tracerColor = vec3(1.0, 0.95, 0.82);

    color = mix(color, tracerColor, tracer);

    alpha = max(alpha, 0.35 * tracer);

  }



  outColor = vec4(color, clamp(alpha, 0.0, 1.0));

  if (outColor.a <= 0.001) discard;

}

`;



const OVERLAY_VS = `#version 300 es

precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2D;

layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_fall;

uniform mat4 u_mvp;
uniform float u_alpha;
uniform vec3 u_color;
uniform int u_useColor;
uniform float u_timeSec;
uniform int u_legacyEnabled;
uniform int u_legacyPointPass;
uniform int u_legacyPulseEnabled;
uniform float u_legacyPointSize;
uniform float u_legacyPulseRate;
uniform float u_legacyPulseSpatialFreq;

uniform int u_spaceGridWarpEnabled;
uniform int u_spaceGridFieldSource; // 0 volume, 1 analytic
uniform int u_spaceGridWarpField; // 0 dfdr, 1 alpha
uniform int u_spaceGridStyle; // 0 scientific, 1 legacyDemo
uniform float u_spaceGridWarpGamma;
uniform int u_spaceGridUseGradientDir;
uniform int u_spaceGridVolumeReady;
uniform int u_spaceGridDfdrReady;
uniform int u_spaceGridVolumeUseAtlas;
uniform int u_spaceGridDfdrUseAtlas;
uniform int u_spaceGridSignedDisplacement;
uniform float u_spaceGridWarpStrength;
uniform float u_spaceGridSpacingUsed;
uniform float u_spaceGridR;
uniform float u_spaceGridSigma;
uniform float u_spaceGridSpatialSign;
uniform vec3 u_spaceGridAxes;
uniform vec3 u_spaceGridBoundsMin;
uniform vec3 u_spaceGridBoundsSize;
uniform vec3 u_spaceGridLatticeMin;
uniform vec3 u_spaceGridLatticeSize;
uniform vec3 u_spaceGridDims;
uniform vec2 u_spaceGridAtlasTiles;
uniform vec2 u_spaceGridSliceInvSize;
uniform sampler3D u_spaceGridDfdr;
uniform sampler2D u_spaceGridDfdrAtlas;
uniform sampler3D u_spaceGridVolume;
uniform sampler2D u_spaceGridVolumeAtlas;

out float v_alpha;
out vec3 v_color;
out float v_legacyAlpha;
out float v_legacyDeficit;
out float v_legacyPulse;
out float v_legacyDfdr;

float tanhF(float x) {
  float ex = exp(x);
  float exInv = exp(-x);
  float denom = max(ex + exInv, 1e-6);
  return (ex - exInv) / denom;
}

float sech2F(float x) {
  float c = cosh(x);
  return 1.0 / max(c * c, 1e-6);
}

float dTopHatDr(float r, float sigma, float R) {
  float den = max(1e-6, 2.0 * tanhF(sigma * R));
  return sigma * (sech2F(sigma * (r + R)) - sech2F(sigma * (r - R))) / den;
}

float sampleDfdrAtlas(vec3 uvw) {
  vec2 tileCount = max(u_spaceGridAtlasTiles, vec2(1.0));
  vec2 invTile = 1.0 / tileCount;
  float depth = max(u_spaceGridDims.z, 1.0);
  float zf = clamp(uvw.z, 0.0, 1.0) * (depth - 1.0);
  float z0 = floor(zf);
  float z1 = min(z0 + 1.0, depth - 1.0);
  float t = zf - z0;

  vec2 uv = clamp(
    uvw.xy,
    u_spaceGridSliceInvSize * 0.5,
    vec2(1.0) - u_spaceGridSliceInvSize * 0.5
  );

  vec2 tile0 = vec2(mod(z0, tileCount.x), floor(z0 / tileCount.x));
  vec2 tile1 = vec2(mod(z1, tileCount.x), floor(z1 / tileCount.x));
  vec2 uv0 = (tile0 + uv) * invTile;
  vec2 uv1 = (tile1 + uv) * invTile;
  float s0 = texture(u_spaceGridDfdrAtlas, uv0).r;
  float s1 = texture(u_spaceGridDfdrAtlas, uv1).r;
  return mix(s0, s1, t);
}

float sampleVolumeAtlas(vec3 uvw) {
  vec2 tileCount = max(u_spaceGridAtlasTiles, vec2(1.0));
  vec2 invTile = 1.0 / tileCount;
  float depth = max(u_spaceGridDims.z, 1.0);
  float zf = clamp(uvw.z, 0.0, 1.0) * (depth - 1.0);
  float z0 = floor(zf);
  float z1 = min(z0 + 1.0, depth - 1.0);
  float t = zf - z0;

  vec2 uv = clamp(
    uvw.xy,
    u_spaceGridSliceInvSize * 0.5,
    vec2(1.0) - u_spaceGridSliceInvSize * 0.5
  );

  vec2 tile0 = vec2(mod(z0, tileCount.x), floor(z0 / tileCount.x));
  vec2 tile1 = vec2(mod(z1, tileCount.x), floor(z1 / tileCount.x));
  vec2 uv0 = (tile0 + uv) * invTile;
  vec2 uv1 = (tile1 + uv) * invTile;
  float s0 = texture(u_spaceGridVolumeAtlas, uv0).r;
  float s1 = texture(u_spaceGridVolumeAtlas, uv1).r;
  return mix(s0, s1, t);
}

float sampleVolume(vec3 uvw) {
  if (u_spaceGridVolumeUseAtlas != 0) return sampleVolumeAtlas(uvw);
  return texture(u_spaceGridVolume, uvw).r;
}

float sampleAlphaAt(vec3 worldPos) {
  if (u_spaceGridFieldSource != 0) return 1.0;
  if (u_spaceGridVolumeReady == 0) return 1.0;
  vec3 uvw = (worldPos - u_spaceGridLatticeMin) / u_spaceGridLatticeSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 1.0;
  return clamp(sampleVolume(uvw), 0.0, 1.0);
}

float sampleDfdr(vec3 worldPos) {
  if (u_spaceGridFieldSource != 0) {
    vec3 axes = max(abs(u_spaceGridAxes), vec3(1e-6));
    vec3 m = worldPos / axes;
    float rNorm = length(m);
    float invR = abs(u_spaceGridR) > 1e-6 ? 1.0 / abs(u_spaceGridR) : 0.0;
    return dTopHatDr(rNorm, u_spaceGridSigma, 1.0) * invR;
  }
  if (u_spaceGridDfdrReady == 0) return 0.0;
  vec3 uvw = (worldPos - u_spaceGridLatticeMin) / u_spaceGridLatticeSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  if (u_spaceGridDfdrUseAtlas != 0) return sampleDfdrAtlas(uvw);
  return texture(u_spaceGridDfdr, uvw).r;
}

float sampleDeficit(vec3 worldPos) {
  float alpha = sampleAlphaAt(worldPos);
  return clamp(1.0 - alpha, 0.0, 1.0);
}

vec3 resolveStepVec() {
  float analyticStep = max(1e-3, min(u_spaceGridSpacingUsed, abs(u_spaceGridR) * 0.05));
  if (u_spaceGridFieldSource != 0) return vec3(analyticStep);
  return vec3(
    max(1e-6, u_spaceGridLatticeSize.x / max(u_spaceGridDims.x, 1.0)),
    max(1e-6, u_spaceGridLatticeSize.y / max(u_spaceGridDims.y, 1.0)),
    max(1e-6, u_spaceGridLatticeSize.z / max(u_spaceGridDims.z, 1.0))
  );
}

vec3 sampleDeficitGrad(vec3 pos, vec3 stepVec) {
  float dx = stepVec.x;
  float dy = stepVec.y;
  float dz = stepVec.z;
  if (dx <= 0.0 || dy <= 0.0 || dz <= 0.0) return vec3(0.0);
  float sx0 = sampleDeficit(pos - vec3(dx, 0.0, 0.0));
  float sx1 = sampleDeficit(pos + vec3(dx, 0.0, 0.0));
  float sy0 = sampleDeficit(pos - vec3(0.0, dy, 0.0));
  float sy1 = sampleDeficit(pos + vec3(0.0, dy, 0.0));
  float sz0 = sampleDeficit(pos - vec3(0.0, 0.0, dz));
  float sz1 = sampleDeficit(pos + vec3(0.0, 0.0, dz));
  return vec3(
    (sx1 - sx0) / (2.0 * dx),
    (sy1 - sy0) / (2.0 * dy),
    (sz1 - sz0) / (2.0 * dz)
  );
}

float sampleDeficitBlur(vec3 pos, vec3 stepVec) {
  float dx = stepVec.x;
  float dy = stepVec.y;
  float dz = stepVec.z;
  if (dx <= 0.0 || dy <= 0.0 || dz <= 0.0) return sampleDeficit(pos);
  float d0 = sampleDeficit(pos);
  float d1 = sampleDeficit(pos + vec3(dx, 0.0, 0.0));
  float d2 = sampleDeficit(pos - vec3(dx, 0.0, 0.0));
  float d3 = sampleDeficit(pos + vec3(0.0, dy, 0.0));
  float d4 = sampleDeficit(pos - vec3(0.0, dy, 0.0));
  float d5 = sampleDeficit(pos + vec3(0.0, 0.0, dz));
  float d6 = sampleDeficit(pos - vec3(0.0, 0.0, dz));
  return d0 * 0.4 + (d1 + d2 + d3 + d4 + d5 + d6) * 0.1;
}

vec3 warpPoint(vec3 pos, float fall) {
  float warpLength = max(1e-6, abs(u_spaceGridR) * 0.2);
  float gamma = max(0.05, u_spaceGridWarpGamma);
  vec3 stepVec = resolveStepVec();
  float deficit = sampleDeficit(pos);
  float dfdr = sampleDfdr(pos);

  float offset = 0.0;
  if (u_spaceGridWarpField != 0) {
    float deficitField = deficit;
    if (u_spaceGridStyle == 1) {
      deficitField = sampleDeficitBlur(pos, stepVec);
    }
    float shaped = pow(clamp(deficitField, 0.0, 1.0), gamma);
    offset = u_spaceGridWarpStrength * fall * warpLength * shaped;
  } else {
    float amp = (u_spaceGridSignedDisplacement != 0) ? dfdr : abs(dfdr);
    offset = u_spaceGridWarpStrength * fall * warpLength * warpLength * amp;
  }

  if (abs(offset) <= 1e-9) return pos;

  vec3 boundsCenter = u_spaceGridBoundsMin + 0.5 * u_spaceGridBoundsSize;
  vec3 d = pos - boundsCenter;
  float r = length(d);
  vec3 radialDir = r > 1e-6 ? (d / r) * u_spaceGridSpatialSign : vec3(0.0, 1.0, 0.0);
  vec3 radial = pos + radialDir * offset;
  if (u_spaceGridUseGradientDir == 0) return radial;

  if (any(lessThanEqual(stepVec, vec3(0.0)))) return radial;

  float stepsRaw = floor(2.0 + abs(u_spaceGridWarpStrength) * 2.0 + 0.5);
  int stepCount = int(clamp(stepsRaw, 2.0, 8.0));
  vec3 p = pos;
  float stepSize = offset / float(stepCount);
  for (int i = 0; i < 8; i++) {
    if (i >= stepCount) break;
    vec3 grad = sampleDeficitGrad(p, stepVec);
    float mag = length(grad);
    if (mag < 1e-6) return radial;
    float inv = u_spaceGridSpatialSign * stepSize / mag;
    p += grad * inv;
  }
  return p;
}

void main() {
  v_alpha = u_alpha;
  v_color = (u_useColor != 0) ? a_color : u_color;
  v_legacyAlpha = 1.0;
  v_legacyDeficit = 0.0;
  v_legacyPulse = 1.0;
  v_legacyDfdr = 0.0;

  vec3 pos = (u_spaceGridWarpEnabled != 0) ? warpPoint(a_pos, a_fall) : a_pos;
  if (u_legacyEnabled != 0) {
    float alpha = sampleAlphaAt(pos);
    float deficit = clamp(1.0 - alpha, 0.0, 1.0);
    v_legacyAlpha = alpha;
    v_legacyDeficit = deficit;
    v_legacyDfdr = sampleDfdr(pos);
    if (u_legacyPulseEnabled != 0) {
      vec3 freqVec = vec3(1.7, 2.3, 1.1) * max(0.0, u_legacyPulseSpatialFreq);
      float tau = u_timeSec * clamp(alpha, 0.0, 1.0);
      v_legacyPulse = sin(tau * u_legacyPulseRate + dot(pos, freqVec));
    }
  }
  gl_Position = u_mvp * vec4(pos, 1.0);
  if (u_legacyEnabled != 0 && u_legacyPointPass != 0) {
    gl_PointSize = u_legacyPointSize / max(1.0, gl_Position.w);
  }
}
`;

const OVERLAY_FS = `#version 300 es

precision highp float;
precision highp int;

uniform int u_legacyEnabled;
uniform int u_legacyPointPass;
uniform int u_legacyPulseEnabled;
uniform float u_legacyLineAlpha;
uniform float u_legacyPointAlpha;
uniform float u_legacyPaletteMix;
uniform float u_legacyContrast;
uniform int u_spaceGridWarpField;
uniform float u_spaceGridR;

in float v_alpha;
in vec3 v_color;
in float v_legacyAlpha;
in float v_legacyDeficit;
in float v_legacyPulse;
in float v_legacyDfdr;

out vec4 outColor;

vec3 diverge(float x) {
  vec3 c1 = vec3(0.06, 0.25, 0.98);
  vec3 c2 = vec3(0.94, 0.94, 0.95);
  vec3 c3 = vec3(0.95, 0.30, 0.08);
  float t = clamp(0.5 + 0.5 * x, 0.0, 1.0);
  return (t < 0.5) ? mix(c1, c2, t / 0.5) : mix(c2, c3, (t - 0.5) / 0.5);
}

vec3 legacyPalette(float t) {
  vec3 fast = vec3(0.20, 0.62, 0.98);
  vec3 slow = vec3(0.98, 0.64, 0.22);
  return mix(fast, slow, t);
}

void main() {
  if (u_legacyEnabled != 0) {
    if (u_legacyPointPass != 0) {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      if (dot(c, c) > 1.0) discard;
    }

    float contrast = max(0.05, u_legacyContrast);
    float mixVal = clamp(u_legacyPaletteMix, 0.0, 1.0);
    float deficit = clamp(v_legacyDeficit, 0.0, 1.0);
    vec3 paletteColor;
    if (u_spaceGridWarpField != 0) {
      float t = pow(deficit, contrast);
      paletteColor = legacyPalette(t);
    } else {
      float rScale = max(abs(u_spaceGridR), 1e-6);
      float dfdrNorm = clamp(v_legacyDfdr * rScale, -1.0, 1.0);
      float mag = pow(abs(dfdrNorm), contrast);
      float signedMag = sign(dfdrNorm) * mag;
      paletteColor = diverge(signedMag);
    }

    vec3 color = mix(v_color, paletteColor, mixVal);
    float pulse01 = u_legacyPulseEnabled != 0 ? (0.5 + 0.5 * v_legacyPulse) : 1.0;
    float deficitWeight = mix(0.65, 1.0, deficit);
    float pulseWeight = mix(0.4, 1.0, pulse01);
    float brightness = pulseWeight * deficitWeight;
    float alpha = (u_legacyPointPass != 0) ? u_legacyPointAlpha : u_legacyLineAlpha;
    alpha *= mix(0.7, 1.0, pulse01);

    outColor = vec4(color * brightness, alpha);
    return;
  }
  outColor = vec4(v_color, v_alpha);
}
`;

const PREVIEW_MESH_VS = `#version 300 es

layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;

uniform mat4 u_mvp;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = u_mvp * vec4(a_pos, 1.0);
}
`;

const PREVIEW_MESH_FS = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_tex;
uniform vec4 u_color;
uniform int u_hasTex;

out vec4 outColor;

void main() {
  vec4 base = u_color;
  if (u_hasTex != 0) {
    base *= texture(u_tex, v_uv);
  }
  if (base.a <= 0.001) discard;
  outColor = base;
}
`;



const SURFACE_OVERLAY_VS = `#version 300 es



layout(location=0) in vec2 a_pos;      // unit grid on x-z plane in [-1,1]^2



uniform vec3  u_axes;                   // hull axes scale (a,b,c) -> x,y,z



uniform float u_sigma;                  // wall thickness sigma



uniform float u_R;                      // bubble radius R

uniform float u_domainScale;            // bounds scale relative to hull axes (viewer domain)



 uniform float u_beta;                   // ship beta along +x

uniform int u_metricMode;

 uniform float u_thetaSign;



uniform int   u_viz;                    // 0 theta_GR, 1 rho_GR, 2 theta_Drive, 3 shear_GR, 4 vorticity_GR



uniform float u_ampChain;               // gamma_geo^3 * q * gamma_VdB



uniform float u_gate;                   // sqrt(d_FR) * (sector visibility)



uniform float u_gate_view;



uniform float u_duty;                   // Ford-Roman duty factor



uniform float u_yGain;                  // height scale (viewer)



uniform float u_yBias;                  // baseline shift (viewer)



uniform float u_kColor;                 // color scale (viewer)



uniform mat4  u_mvp;



uniform int   u_totalSectors;           // total sectors around bubble



uniform int   u_liveSectors;            // concurrently active sectors



uniform float u_lumpExp;                // contrast exponent for sector gating



uniform float u_sectorCenter;           // scheduler-driven azimuth center (0..1)



uniform float u_sectorSigma;            // Gaussian sigma in normalized azimuth units



uniform float u_sectorFloor;            // baseline fraction to keep shell visible



uniform int   u_syncMode;               // 1=scheduler sync, 0=fallback contiguous



uniform float u_phase01;                // additional phase offset in [0,1) to rotate sector gating



uniform int   u_splitEnabled;           // 1 to enable secondary lobe at +0.5



uniform float u_splitFrac;              // weight of primary lobe (0..1)



uniform float u_vizFloorThetaGR;



uniform float u_vizFloorRhoGR;



uniform float u_vizFloorThetaDrive;



uniform int   u_showTilt;



uniform vec2  u_tiltDir;



uniform float u_tiltMag;



uniform float u_tiltAlpha;



uniform float u_tiltGain; // [tilt-gain]







out vec3 v_color;



out vec2 v_uv;



out vec3 v_normalWS;







const float TWO_PI = 6.283185307179586;







float cosh_exp(float x){



  float ex = exp(x);



  float ex_inv = exp(-x);



  return 0.5 * (ex + ex_inv);



}







float tanh_exp(float x){



  float ex = exp(x);



  float ex_inv = exp(-x);



  float denom = max(ex + ex_inv, 1e-6);



  return (ex - ex_inv) / denom;



}







float sech2(float x){



  float c = cosh_exp(x);



  return 1.0 / max(c * c, 1e-6);



}







float d_topHat_dr(float r, float sigma, float R) {



  float den = max(1e-6, 2.0 * tanh_exp(sigma * R));



  return sigma * (sech2(sigma*(r+R)) - sech2(sigma*(r-R))) / den;



}







vec3 diverge(float x) {



  vec3 c1 = vec3(0.06,0.25,0.98);



  vec3 c2 = vec3(0.94,0.94,0.95);



  vec3 c3 = vec3(0.95,0.30,0.08);



  float t = clamp(0.5 + 0.5*x, 0.0, 1.0);



  return (t < 0.5) ? mix(c1,c2,t/0.5) : mix(c2,c3,(t-0.5)/0.5);



}







vec3 purpleMap(float s){



  float t = clamp(-s, 0.0, 1.0);



  vec3 base = vec3(0.92,0.92,0.98);



  vec3 purp = vec3(0.58,0.25,0.93);



  return mix(base, purp, t);



}







void main(){



  float domainScale = max(u_domainScale, 0.01);



  vec2 grid = a_pos;



  vec2 tiltDir = vec2(0.0);



  float tiltStrength = 0.0;



  if (u_showTilt != 0) {







    float lenTilt = length(u_tiltDir);







    if (lenTilt > 1e-5) {







      tiltDir = u_tiltDir / lenTilt;







      float mag = clamp(u_tiltMag, 0.0, 1.0); // [tilt-gain]







      float alpha = clamp(u_tiltAlpha, 0.0, 1.0); // [tilt-gain]







      float _gain = (u_tiltGain > 0.0) ? u_tiltGain : 0.65; // [tilt-gain]



      tiltStrength = mag * alpha * _gain; // [tilt-gain]







    }







  }



  vec3 pView = vec3(grid.x * u_axes.x * domainScale, 0.0, grid.y * u_axes.z * domainScale);



  vec3 pMetric = vec3(



    pView.x / max(u_axes.x, 1e-6),



    0.0,



    pView.z / max(u_axes.z, 1e-6)



  );



  float rs = max(length(pMetric), 1e-6);







  float dfdr = d_topHat_dr(rs, u_sigma, u_R);



  vec3 dir = pMetric / rs;



  float dfx = dfdr * dir.x;



  float dfy = dfdr * dir.y;



  float dfz = dfdr * dir.z;







  float theta_gr = u_beta * dfx * u_thetaSign;







  float Kxx = -u_beta * dfx;



  float Kxy = -0.5 * u_beta * dfy;



  float Kxz = -0.5 * u_beta * dfz;



  float K2 = Kxx*Kxx;



  float KijKij = Kxx*Kxx + 2.0*Kxy*Kxy + 2.0*Kxz*Kxz;



  const float INV16PI = 0.019894367886486918;



  float rho_gr = (K2 - KijKij) * INV16PI;



  float sigma2 = max(KijKij - (K2 / 3.0), 0.0);



  float vorticity = u_beta * sqrt(dfy * dfy + dfz * dfz);
  if (u_metricMode == 2) {
    vorticity = 0.0;
  }







  float gateWF = 1.0;



  if (u_viz == 2) {



    float ang = atan(pView.z, pView.x);



    float a01 = (ang < 0.0 ? ang + TWO_PI : ang) / TWO_PI;



    a01 = fract(a01 + u_phase01);



    int total = max(1, u_totalSectors);



    int live  = max(1, min(u_liveSectors, total));



    float fActive = max(max(1.0/float(total), float(live) / float(total)), max(0.0, u_duty));



    float floorFrac = clamp(u_sectorFloor, 0.0, 0.99);



    float peakFrac  = 1.0 - floorFrac;



    float wNorm = 1.0;



    if (u_syncMode == 1) {



      float center = u_sectorCenter - floor(u_sectorCenter);



      float sigma01 = max(1e-4, u_sectorSigma);



      float dist = abs(a01 - center);



      dist = min(dist, 1.0 - dist);



      float g1 = exp(-0.5 * (dist * dist) / (sigma01 * sigma01));



      float g = g1;



      if (u_splitEnabled == 1) {



        float center2 = fract(center + 0.5);



        float dist2 = abs(a01 - center2);



        dist2 = min(dist2, 1.0 - dist2);



        float g2 = exp(-0.5 * (dist2 * dist2) / (sigma01 * sigma01));



        float wA = clamp(u_splitFrac, 0.0, 1.0);



        g = g1 * wA + g2 * (1.0 - wA);



      }



      float avgG = min(1.0, sigma01 * 2.5066283);



      float gNorm = min(g / max(avgG, 1e-4), 12.0);



      wNorm = floorFrac + peakFrac * gNorm;



    } else {



      int sIdx = int(floor(a01 * float(total)));



      float on = (sIdx < live) ? 1.0 : 0.0;



      float frac = max(1.0/float(total), float(live) / float(total));



      float norm = (frac > 1e-9) ? min(on / frac, 12.0) : on;



      wNorm = floorFrac + peakFrac * norm;



    }



    gateWF = pow(sqrt(max(0.0, wNorm)), max(0.5, u_lumpExp));



  }



  float theta_drive = theta_gr * u_ampChain * u_gate_view * gateWF;







  float s_raw = theta_gr;
  if (u_viz == 1) {
    s_raw = rho_gr;
  } else if (u_viz == 2) {
    s_raw = theta_drive;
  } else if (u_viz == 3) {
    s_raw = sigma2;
  } else if (u_viz == 4) {
    s_raw = vorticity;
  }



  float floorV = u_vizFloorThetaGR;
  if (u_viz == 1) {
    floorV = u_vizFloorRhoGR;
  } else if (u_viz == 2) {
    floorV = u_vizFloorThetaDrive;
  } else if (u_viz == 3) {
    floorV = u_vizFloorRhoGR;
  } else if (u_viz == 4) {
    floorV = u_vizFloorThetaGR;
  }



  float s = s_raw;



  if (floorV > 0.0) {



    float mag = abs(s_raw);



    if (mag < floorV) {



      s = (s_raw < 0.0) ? -floorV : floorV;



    }



  }







  float y = (s - u_yBias) * u_yGain;



  float lateral = dot(grid, tiltDir);



  float tiltOffset = (tiltStrength > 1e-5) ? lateral * tiltStrength : 0.0; // [tilt-gain]



  vec4 pos = vec4(pView.x, y + tiltOffset, pView.z, 1.0);



  gl_Position = u_mvp * pos;







  float c = s * u_kColor;



  if (u_viz == 1){



    v_color = purpleMap(c);



  } else {



    v_color = diverge(clamp(c, -1.0, 1.0));



  }



  v_uv = a_pos * 0.5 + 0.5;



  vec3 normalWS = (rs > 1e-6) ? normalize(vec3(dir.x, dir.y, dir.z)) : vec3(0.0, 1.0, 0.0);



  v_normalWS = normalWS;



}



`;


const SURFACE_OVERLAY_FS = `#version 300 es


precision highp float;



in vec3 v_color;



in vec2 v_uv;



in vec3 v_normalWS;



uniform float u_alpha;



uniform int   u_showTilt;



uniform vec2  u_tiltDir;



uniform float u_tiltAlpha;



uniform float u_debugTiltEcho;



out vec4 outColor;



void main(){



  float alpha = clamp(u_alpha, 0.0, 1.0);



  bool echoActive = (u_debugTiltEcho > 0.5);



  bool hasTiltDir = length(u_tiltDir) > 1e-5;



  if (echoActive) {



    vec2 axis = hasTiltDir ? normalize(u_tiltDir) : vec2(1.0, 0.0);



    const float STRIPE_GAIN = 140.0;



    vec2 centered = v_uv - 0.5;



    float wave = sin(dot(centered, axis) * STRIPE_GAIN);



    float stripe = step(0.0, wave);



    vec3 baseColor = v_color;



    float gain = mix(0.35, 1.35, stripe);



    vec3 modulated = clamp(baseColor * gain, 0.0, 1.0);



    outColor = vec4(modulated, 1.0);



    return;



  }



  outColor = vec4(v_color, alpha);



}



`



const SURFACE_BETA_OVERLAY_FS = `#version 300 es



precision highp float;



in vec2 v_uv;



in vec3 v_normalWS;



uniform sampler2D uBetaTex;



uniform float uBetaTarget;



uniform float uComfort;



uniform vec3  uHullDims;



uniform float uAlpha;



out vec4 outColor;







vec3 hsv2rgb(vec3 c){



  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0);



  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);



}







float sampleBeta(vec2 uv){



  return texture(uBetaTex, uv).r;



}







void main(){



  ivec2 texSize = textureSize(uBetaTex, 0);



  vec2 texel = vec2(1.0) / max(vec2(texSize), vec2(1.0));



  float beta = sampleBeta(v_uv);



  float bx = sampleBeta(v_uv + vec2(texel.x, 0.0)) - beta;



  float by = sampleBeta(v_uv + vec2(0.0, texel.y)) - beta;



  float grad = length(vec2(bx, by));



  float hullScale = max(max(uHullDims.x, uHullDims.y), uHullDims.z);



  if (hullScale > 1e-5) {



    grad *= hullScale;



  }







  float comfortSafe = max(uComfort, 1e-5);



  float targetSafe = max(uBetaTarget, 1e-5);



  vec3 normal = normalize(v_normalWS);



  float bowStern = sign(dot(normal, vec3(0.0, 0.0, 1.0)));



  float hue = 0.62 + 0.18 * bowStern;



  float sat = clamp(grad / comfortSafe, 0.0, 1.0);



  float val = clamp(beta / targetSafe, 0.3, 1.0);



  vec3 base = hsv2rgb(vec3(hue, sat, val));







  const float G = 9.80665;



  float contour = abs(fract(beta / (0.05 * G)) - 0.5) * 2.0;



  float line = smoothstep(0.0, 0.05, contour);



  vec3 col = mix(base, vec3(1.0), pow(1.0 - line, 12.0));







  float redIso = smoothstep(0.0, 0.03, abs(grad - 0.4 * G));



  col = mix(col, vec3(1.0, 0.0, 0.1), pow(redIso, 10.0));







  outColor = vec4(col, clamp(uAlpha, 0.0, 1.0));



}



`;







const WHITE_TEST_VS = `#version 300 es



layout(location=0) in vec2 a_pos;



void main() {



  gl_Position = vec4(a_pos, 0.0, 1.0);



}



`;







const WHITE_TEST_FS = `#version 300 es



precision highp float;



out vec4 outColor;



void main() {



  outColor = vec4(1.0);



}



`;







const WIREFRAME_COLOR = new Float32Array([0.1, 0.7, 0.9]);







type RendererResources = {



  rayProgram: WebGLProgram | null;



  ringOverlayProgram: WebGLProgram | null;



  overlayProgram: WebGLProgram | null;
  previewMeshProgram: WebGLProgram | null;



  postProgram: WebGLProgram | null;


  quadVao: WebGLVertexArrayObject | null;



  quadVbo: WebGLBuffer | null;



  ringAvgTex: WebGLTexture | null;



  rayFbo: WebGLFramebuffer | null;


  rayColorTex: WebGLTexture | null;



  rayAuxTex: WebGLTexture | null;

  rayIdTex: WebGLTexture | null;

};







type RayUniformParams = {



  densityScale: number;



  stepBias: number;



  maxSteps: number;



  cameraEye: Vec3;



  invViewProj: Float32Array;



  phaseSign: number;



  phase01: number;



  invR: number;



  timeSec: number;



  blend: number;



  fActive: number;



  baseScale: number;



  sigma: number;



  volumeVizIndex: 0 | 1 | 2 | 3 | 4 | 5;



  volumeSourceIndex: 0 | 1 | 2;



  volumeDomainIndex: 0 | 1;



  opacityWindow: [number, number];



  grThetaGain: number;



  grRhoGain: number;



  forceFlatGate?: boolean;



  debugMode?: number;



  probeMode?: number;



  probeGain?: number;



  testMode?: number;



  curvDebugOnly?: boolean;



  curvDebugMode?: number;



};







type HullTestResult = {



  luma: number;



  alpha: number;



  pass: boolean;



};







export class Hull3DRenderer {



  private gl: WebGL2RenderingContext;



  private canvas: HTMLCanvasElement;



  private options: Hull3DRendererOptions;



  private disposed = false;

  private mode: Hull3DRendererMode = "instant";



  private qualityPreset: Hull3DQualityPreset;



  private qualityProfile: QualityProfile;



  private emaAlpha: number;



  private domainScale = DEFAULT_DOMAIN_SCALE;



  private volumeDomain: HullVolumeDomain = "wallBand";



  private opacityWindow: [number, number] = DEFAULT_OPACITY_WINDOW;



  private volumeViz: Hull3DVolumeViz = "theta_drive";
  private volumeSource: Hull3DVolumeSource = "lattice";



  private volumeVizBusId: string | null = null;

  private overlay3D: Overlay3DState = {
    mode: 1,
    mix: 0.5,
    alpha: 0.65,
    thick: 0.02,
    gain: 1.0,
    hue: 0.6,
    phase01: 0,
  };

  private overlay3DBusId: string | null = null;



  private overlayPingBusId: string | null = null;



  private curvatureBusId: string | null = null;
  private t00BusId: string | null = null;
  private fluxBusId: string | null = null;
  private metricBusId: string | null = null;
  private observerSelectionBusId: string | null = null;
  private observerDirectionOverlayBusId: string | null = null;



  private phaseStableBusId: string | null = null;



  private phaseLegacyBusId: string | null = null;



  private intentVector: [number, number, number] = [0, 0, 0];



  private intentMagnitude = 0;



  private vizIntent = { enabled: false, mag01: 0, rise01: 0 };



  private intentBusUnsub: (() => void) | null = null;

  private geodesicDiagnostics: HullGeodesicDiagnostics = {
    mode: "disabled",
    scientificEnabled: false,
    metricAvailable: false,
    metricSource: null,
    chart: null,
    dims: null,
    maxNullResidual: null,
    stepConvergence: null,
    bundleSpread: null,
    consistency: "unknown",
    consistencyNote: null,
    steps: 0,
    stepScale_m: 0,
    updatedAt: 0,
  };
  private geodesicDiagLastPublishMs = 0;

  private spacetimeGridState: {
    enabled: boolean;
    mode: HullSpacetimeGridPrefs["mode"];
    fieldSource: HullSpacetimeGridPrefs["fieldSource"];
    warpField: HullSpacetimeGridPrefs["warpField"];
    warpGamma: number;
    useGradientDir: boolean;
    spacing_m: number;
    spacingUsed_m: number;
    falloffUsed_m: number;
    falloffRequested_m: number;
    falloffFromSpacing_m: number;
    falloffFromR_m: number;
    falloffFromBounds_m: number;
    warpStrength: number;
    falloff_m: number;
    colorBy: HullSpacetimeGridPrefs["colorBy"];
    style: HullSpacetimeGridPrefs["style"];
    warpStrengthMode: HullSpacetimeGridPrefs["warpStrengthMode"];
    signedDisplacement: boolean;
    legacyPulseEnabled: boolean;
    legacyPulseRate: number;
    legacyPulseSpatialFreq: number;
    legacyPointSize: number;
    legacyPaletteMix: number;
    legacyContrast: number;
    legacyLineAlpha: number;
    legacyPointAlpha: number;
    hasSdf: boolean;
    useSdf: boolean;
    boundsMin: [number, number, number];
    boundsSize: [number, number, number];
    boundsExpanded_m: number;
    reason: string | null;
    degradedReasons: string[];
  } = {
    enabled: false,
    mode: "surface",
    fieldSource: "volume",
    warpField: "dfdr",
    warpGamma: 1.4,
    useGradientDir: true,
    spacing_m: 0.55,
    spacingUsed_m: 0.55,
    falloffUsed_m: 0.9,
    falloffRequested_m: 0.9,
    falloffFromSpacing_m: 0.9,
    falloffFromR_m: 0.9,
    falloffFromBounds_m: 0.9,
    warpStrength: 1.0,
    falloff_m: 0.9,
    colorBy: "thetaSign",
    style: "scientific",
    warpStrengthMode: "autoThetaPk",
    signedDisplacement: false,
    legacyPulseEnabled: true,
    legacyPulseRate: 1.2,
    legacyPulseSpatialFreq: 1.0,
    legacyPointSize: 6,
    legacyPaletteMix: 1.0,
    legacyContrast: 1.0,
    legacyLineAlpha: 0.45,
    legacyPointAlpha: 0.9,
    hasSdf: false,
    useSdf: false,
    boundsMin: [0, 0, 0],
    boundsSize: [0, 0, 0],
    boundsExpanded_m: 0,
    reason: null,
    degradedReasons: [],
  };

  private spacetimeGridTelemetry = {
    enabled: false,
    mode: "surface" as HullSpacetimeGridPrefs["mode"],
    fieldSource: "volume" as HullSpacetimeGridPrefs["fieldSource"],
    warpField: "dfdr" as HullSpacetimeGridPrefs["warpField"],
    warpGamma: 1.4,
    useGradientDir: true,
    spacing_m: 0.55,
    spacingUsed_m: 0.55,
    falloffUsed_m: 0.9,
    falloff_m: 0.9,
    falloffRequested_m: 0.9,
    falloffFromSpacing_m: 0.9,
    falloffFromR_m: 0.9,
    falloffFromBounds_m: 0.9,
    thetaNorm: 1,
    style: "scientific" as HullSpacetimeGridPrefs["style"],
    legacyPulseEnabled: true,
    legacyPulseRate: 1.2,
    legacyPulseSpatialFreq: 1.0,
    legacyPointSize: 6,
    legacyPaletteMix: 1.0,
    legacyContrast: 1.0,
    legacyLineAlpha: 0.45,
    legacyPointAlpha: 0.9,
    sdf: {
      present: false,
      key: null as string | null,
    },
    postEnabled: false,
    postMode: "none" as "none" | "slice" | "surface",
    volumeEnabled: false,
    surfaceEnabled: false,
    bounds: {
      min: [0, 0, 0] as [number, number, number],
      size: [0, 0, 0] as [number, number, number],
      expandedBy_m: 0,
    },
    gpu: {
      formatReason: null as string | null,
      volumeReady: false,
      dfdrReady: false,
      volumeHash: null as string | null,
      dfdrHash: null as string | null,
      volumeBackend: null as string | null,
      dfdrBackend: null as string | null,
      volumeUseAtlas: false,
      dfdrUseAtlas: false,
    },
    degraded: {
      reasons: [] as string[],
      spacingRequested_m: 0.55,
      spacingUsed_m: 0.55,
      sdfMissing: false,
      analyticOnly: false,
    },
  };
  private postSpaceGridEnabled = false;
  private postSpaceGridAttempted = false;
  private postSpaceGridAttemptKey: string | null = null;
  private postSpaceGridAttemptAt = 0;

  private phaseFeedActive = false;



  private phaseSourceActive = false;



  private phaseTarget = 0;



  private phaseUnwrapped = 0;



  private phaseState: {
    phase01: number;
    phaseCont: number;
    sign: 1 | -1;
    velocity: number;
    lastAtMs: number;
  } = {
    phase01: 0,
    phaseCont: 0,
    sign: 1,
    velocity: 0,
    lastAtMs: 0,
  };



  private uniformCache = new UniformCache();







  private radialLUT: Float32Array = new Float32Array(RADIAL_SIZE);



  private radialMetricR = RADIAL_METRIC_RADIUS;



  private radialMaxR = RADIAL_SAMPLE_R_MAX;



  private radialScale = RADIAL_LUT_SCALE;



  private radialDfMax = 1;



  private ringInstantLUT: Float32Array = new Float32Array(RING_SIZE);



  private ringAverageLUT: Float32Array = new Float32Array(RING_SIZE);







  private radialTex: WebGLTexture | null = null;



  private ringInstantTex: WebGLTexture | null = null;



  private ringAverageTex: WebGLTexture | null = null;



  private radialTexAllocated = false;



  private ringInstantTexAllocated = false;



  private ringAverageTexAllocated = false;



  private gateVolumeTex: WebGLTexture | null = null;
  private volumeTex: WebGLTexture | null = null;
  private latticeAtlasTex: WebGLTexture | null = null;
  private latticeUpload: LatticeVolumeUploadState | null = null;
  private latticeUploadFailedHash: string | null = null;
  private latticeUploadFailedReason: string | null = null;
  private latticeUploadTelemetry: LatticeUploadTelemetry | null = null;
  private latticeUploadFormatReason: string | null = null;
  private latticeVolumeReadyKey: string | null = null;
  private latticeSdfTex: WebGLTexture | null = null;
  private latticeSdfAtlasTex: WebGLTexture | null = null;
  private latticeSdfUpload: LatticeSdfUploadState | null = null;
  private latticeSdfUploadFailedKey: string | null = null;
  private latticeSdfUploadFailedReason: string | null = null;
  private latticeSdfReadyKey: string | null = null;
  private latticeDfdrTex: WebGLTexture | null = null;
  private latticeDfdrAtlasTex: WebGLTexture | null = null;
  private latticeDfdrUpload: LatticeDfdrUploadState | null = null;
  private latticeDfdrUploadFailedHash: string | null = null;
  private latticeDfdrUploadFailedReason: string | null = null;
  private latticeDfdrReadyKey: string | null = null;



  private dummyVolumeTex: WebGLTexture | null = null;



  private curvature = {



    texA: null as WebGLTexture | null,



    texB: null as WebGLTexture | null,



    fallback: null as WebGLTexture | null,



    front: 0 as 0 | 1,



    dims: [1, 1, 1] as [number, number, number],



    version: 0,



    updatedAt: 0,



    hasData: false,



    emaResidual: new Float32Array(0),



    range: [-8, 8] as [number, number],



  };



  private _curvStats?: { emaMin: number; emaMax: number };

  private curvatureStampWarned = false;

  // T00 (energy density) volume state
  private t00 = {
    texA: null as WebGLTexture | null,
    texB: null as WebGLTexture | null,
    fallback: null as WebGLTexture | null,
    front: 0 as 0 | 1,
    dims: [1, 1, 1] as [number, number, number],
    version: 0,
    updatedAt: 0,
    hasData: false,
    range: [1e-12, 1e-12] as [number, number],
  };
  private t00StampWarned = false;
  private metricVolume = {
    texAB: null as WebGLTexture | null,
    texGamma: null as WebGLTexture | null,
    fallbackAB: null as WebGLTexture | null,
    fallbackGamma: null as WebGLTexture | null,
    dims: [1, 1, 1] as [number, number, number],
    version: 0,
    updatedAt: 0,
    hasData: false,
    source: null as string | null,
    chart: null as string | null,
    consistency: "unknown" as "ok" | "warn" | "fail" | "unknown",
    consistencyNote: null as string | null,
    alphaRange: [1, 1] as [number, number],
  };
  private observerSelection: ObserverRobustSelection = { condition: "nec", frame: "Eulerian" };
  private observerDirectionOverlay: ObserverDirectionOverlayConfig = {
    enabled: false,
    stride: 4,
    decDirectionMode: "local",
    maskMode: "violating",
    minMagnitude: 0,
  };
  private t00Raw: {
    dims: [number, number, number];
    t00: Float32Array;
    min?: number;
    max?: number;
    stats?: any;
    meta?: any;
    version: number;
    updatedAt: number;
  } | null = null;
  private fluxField: (FluxVectorField & { version: number; updatedAt: number; avgMag?: number }) | null = null;

  private fallbackTex2D: WebGLTexture | null = null;

  private skyboxTexture: WebGLTexture | null = null;
  private skyboxTexturePath: string | null = null;
  private skyboxTexturePending = false;
  private skyboxConfig: SkyboxConfig = DEFAULT_SKYBOX_CONFIG;
  private skyboxConfigRequested = false;
  private skyboxConfigFailed = false;



  private rayTargetSize: [number, number] = [0, 0];
  private rayTargetFailure = {
    width: 0,
    height: 0,
    nextRetryAtMs: 0,
    failCount: 0,
  };

  private rayIdEnabled = false;


  private rayAuxInternalFormat = 0;



  private rayAuxType = 0;



  private supportsColorFloat = false;
  private supportsFloatLinear = false;
  private supportsHalfFloatLinear = false;
  private maxTextureSize = 0;
  private max3DTextureSize = 0;











  private dims: [number, number, number];



  private state: Hull3DRendererState | null = null;



  private lastVolumeKey = "";



  private lastRingKey = "";



  private lastRadialKey = "";



  private freezeVolume = false;



  private skipVolumeUpdate = false;



  private hasVolume = false;



  private lastAvgUpdate = 0;



  private ringAvgSeeded = false;



  private ringLastStats: RingLUTStats | null = null;



  private phaseSignEffective = 1;



  private autoFlatGate = false;







  private resources: RendererResources = {



    rayProgram: null,



    ringOverlayProgram: null,



    overlayProgram: null,
    previewMeshProgram: null,



    postProgram: null,



    quadVao: null,



    quadVbo: null,



    ringAvgTex: null,



    rayFbo: null,



    rayColorTex: null,



    rayAuxTex: null,

    rayIdTex: null,


  };



  private harnessWhiteProgram: WebGLProgram | null = null;







  // 2D surface overlay resources



  private surfaceProgram: WebGLProgram | null = null;



  private surfaceVao: WebGLVertexArrayObject | null = null;



  private surfaceVbo: WebGLBuffer | null = null;



  private surfaceRes = 64; // grid resolution (matches panelÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s intent but lighter)



  private surfaceVertsPerRow = 0;



  private surfaceRows = 0;



  private betaOverlayProgram: WebGLProgram | null = null;



  private betaOverlayUniforms: {



    u_axes: WebGLUniformLocation | null;



    u_sigma: WebGLUniformLocation | null;



    u_R: WebGLUniformLocation | null;

    u_domainScale: WebGLUniformLocation | null;



    u_beta: WebGLUniformLocation | null;

    u_thetaSign: WebGLUniformLocation | null;



    u_viz: WebGLUniformLocation | null;



    u_ampChain: WebGLUniformLocation | null;



    u_gate: WebGLUniformLocation | null;



    u_gate_view: WebGLUniformLocation | null;



    u_duty: WebGLUniformLocation | null;



    u_yGain: WebGLUniformLocation | null;



    u_yBias: WebGLUniformLocation | null;



    u_kColor: WebGLUniformLocation | null;



    u_mvp: WebGLUniformLocation | null;



    u_totalSectors: WebGLUniformLocation | null;



    u_liveSectors: WebGLUniformLocation | null;



    u_lumpExp: WebGLUniformLocation | null;



    u_sectorCenter: WebGLUniformLocation | null;



    u_sectorSigma: WebGLUniformLocation | null;



    u_sectorFloor: WebGLUniformLocation | null;



    u_syncMode: WebGLUniformLocation | null;



    u_phase01: WebGLUniformLocation | null;



    u_splitEnabled: WebGLUniformLocation | null;



    u_splitFrac: WebGLUniformLocation | null;



    uBetaTex: WebGLUniformLocation | null;



    uBetaTarget: WebGLUniformLocation | null;



    uComfort: WebGLUniformLocation | null;



    uHullDims: WebGLUniformLocation | null;



    uAlpha: WebGLUniformLocation | null;



    u_vizFloorThetaGR: WebGLUniformLocation | null;



    u_vizFloorRhoGR: WebGLUniformLocation | null;



    u_vizFloorThetaDrive: WebGLUniformLocation | null;



    u_showTilt: WebGLUniformLocation | null;



    u_tiltDir: WebGLUniformLocation | null;



    u_tiltMag: WebGLUniformLocation | null;



    u_tiltAlpha: WebGLUniformLocation | null;

    u_tiltGain: WebGLUniformLocation | null; // [tilt-gain]



  } | null = null;



  private betaFallbackTex: WebGLTexture | null = null;



  private betaFallbackValue = DEFAULT_BETA_TARGET;



  private derivedHullDims: [number, number, number] = [1, 1, 1];



  private betaTelemetryFrame = 0;



  private betaTelemetry: { maxGrad: number; redPct: number } = { maxGrad: 0, redPct: 0 };







  private overlay = {



    ringVao: null as WebGLVertexArrayObject | null,



    ringVbo: null as WebGLBuffer | null,



    ringVertexCount: 0,



    sliceVao: null as WebGLVertexArrayObject | null,



    sliceVbo: null as WebGLBuffer | null,



    sliceEbo: null as WebGLBuffer | null,



    wireframeVao: null as WebGLVertexArrayObject | null,



    wireframeVbo: null as WebGLBuffer | null,



    meshWireVao: null as WebGLVertexArrayObject | null,



    meshWireVbo: null as WebGLBuffer | null,



    meshWireColorVbo: null as WebGLBuffer | null,

    meshWireColors: null as Float32Array | null,

    meshWirePatches: [] as WireframeContactPatch[],

    meshWireCount: 0,
    domainGridVao: null as WebGLVertexArrayObject | null,
    domainGridVbo: null as WebGLBuffer | null,
    domainGridCount: 0,

    spaceGridVao: null as WebGLVertexArrayObject | null,

    spaceGridVbo: null as WebGLBuffer | null,

    spaceGridColorVbo: null as WebGLBuffer | null,
    spaceGridFalloffVbo: null as WebGLBuffer | null,

    spaceGridCount: 0,
    demoGridNodeVao: null as WebGLVertexArrayObject | null,
    demoGridNodeVbo: null as WebGLBuffer | null,
    demoGridNodeColorVbo: null as WebGLBuffer | null,
    demoGridNodeFalloffVbo: null as WebGLBuffer | null,
    demoGridNodeCount: 0,
    fluxStreamVao: null as WebGLVertexArrayObject | null,
    fluxStreamVbo: null as WebGLBuffer | null,
    fluxStreamCount: 0,
    fluxStreamAlpha: 0,
    fluxStreamColor: [0.36, 0.9, 0.95] as [number, number, number],
    observerDirectionVao: null as WebGLVertexArrayObject | null,
    observerDirectionVbo: null as WebGLBuffer | null,
    observerDirectionCount: 0,
    observerDirectionAlpha: 0,
    observerDirectionColor: [0.95, 0.7, 0.2] as [number, number, number],









    previewVao: null as WebGLVertexArrayObject | null,



    previewVbo: null as WebGLBuffer | null,



    previewUvVbo: null as WebGLBuffer | null,



    previewIbo: null as WebGLBuffer | null,



    previewTexture: null as WebGLTexture | null,



    previewIndexType: 0,



    previewCount: 0,



    previewIndexed: false,



    previewHasUv: false,



    previewColor: new Float32Array([0.82, 0.88, 0.96, 0.95]),



    fallbackProgram: null as WebGLProgram | null,



  };



  private overlayCache = {



    ringKey: "",



    sliceKey: "",



    wireKey: "",



    meshWireKey: "",



    meshWireColorKey: "",
    domainGridKey: "",



    spaceGridKey: "",
    demoGridNodeKey: "",
    fluxStreamKey: "",
    observerDirectionKey: "",



    previewMeshKey: "",



  };







  private framePerf = {



    lastFrameTime: performance.now(),



    movingAvg: 16,



    fallbackFrames: 0,



  };



  private perfFallbackMs = 70;



  private perfFallbackHold = 90;



  private debugCounter = 0;



  private volumeStatsKey = "";



  // Diagnostics state machine + offscreen probe (decoupled from main pass)



  private diagnosticsEnabled = true; // Keep on by default to preserve auto-exposure behavior



  private diagHoldFrames = 90; // hold diagnostics overlay for ~1.5s at 60 FPS



  private frameCount = 0;



  private _diag: {



    state: 'idle'|'queueSample'|'sampling'|'holding';



    holdLeft: number;



    lastOk: boolean;



    lastLuma: number;



    lastCoverage: number;



    lastMode: 'ok'|'base_dark'|'gated_dark'|'both_dark';



    lowCount: number;



    okCount: number;



    message: string;



  } = {



    state: 'idle',



    holdLeft: 0,



    lastOk: true,



    lastLuma: 0,



    lastCoverage: 0,



    lastMode: 'ok',



    lowCount: 0,



    okCount: 0,



    message: "",



  };



  private diagSize = 64;



  private diagFBO: WebGLFramebuffer | null = null;



  private diagColorTex: WebGLTexture | null = null;



  private diagBuffer: Uint8Array | null = null;



  private diagCoverageGrace = 0.15;



  private diagBaseThreshold = 0.003;



  private diagGatedThreshold = 0.004;



  private diagTripFrames = 3;



  private diagClearFrames = 2;



  private diagProbeGainFactor = 1.6;



  private debugTapBuffer: Uint8Array | null = null;



  // Camera smoothing



  private camInit = false;



  private camYaw = 0;



  private camPitch = 0;



  private camDist = 10;



  private camSmoothing = 0.12;



  // Phase smoothing (to avoid ticking when phase updates at low rate)



  private phaseInit = false;



  private phaseCont = 0; // continuous phase in cycles (unwrapped)



  private phaseVel = 0;  // cycles per second



  private lastPhaseRaw = 0;



  private lastPhaseTime = 0;



  private lastTimeSec = 0;



  // Auto-exposure (only active when no explicit user exposure provided)



  private autoGain = 1.0;



  private autoGainMin = 0.1;



  private autoGainMax = 40.0;



  private autoSampleEvery = 900; // frames (reduced cadence to minimize stalls)



  private autoTargetLuma = 0.24; // target center-pixel luma [0..1]



  private autoAggressiveness = 0.15; // how quickly to adjust



  private lastDensityScale = 1.0;



  private fActiveResolved = 1.0;







  constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, options: Hull3DRendererOptions = {}) {



    this.gl = gl;



    this.canvas = canvas;



    this.options = options;

    if (typeof window !== "undefined") {
      const dbg = window as any;
      if (typeof dbg.__hullCurvDebugOnly === "undefined") {
        dbg.__hullCurvDebugOnly = false;
      }
      if (typeof dbg.__hullCurvDebugMode === "undefined") {
        dbg.__hullCurvDebugMode = 0;
      }
    }



    this.qualityPreset = options.quality ?? "auto";



    this.emaAlpha = options.emaAlpha ?? DEFAULT_EMA_ALPHA;



    this.qualityProfile = this.resolveQualityProfile(this.qualityPreset, options.qualityOverrides);



    this.dims = [...this.qualityProfile.dims];



    this.initCoreResources();



    this.volumeVizBusId = subscribe("warp:viz", (payload: any) => {



      const v = Number(payload?.volumeViz);



      if (v === 0 || v === 1 || v === 2 || v === 3 || v === 4) {



        const next: Hull3DVolumeViz =
          v === 0
            ? "theta_gr"
            : v === 1
              ? "rho_gr"
              : v === 2
                ? "theta_drive"
                : v === 3
                  ? "shear_gr"
                  : "vorticity_gr";



        if (this.volumeViz !== next) {



          this.setVolumeViz(next);



        }



      }



    });

    this.overlay3DBusId = subscribe("hull3d:overlay", (payload: any) => {
      this.updateOverlay3D(payload);
    });

    this.overlayPingBusId = subscribe("hull3d:overlay:ping", () => {
      this.publishOverlayState();
    });



    this.curvatureBusId = subscribe("hull3d:curvature", (payload: any) => {
      this.handleCurvatureBrick(payload);
    });

    this.t00BusId = subscribe("hull3d:t00-volume", (payload: any) => {
      this.handleT00Brick(payload);
    });
    this.fluxBusId = subscribe("hull3d:flux", (payload: any) => {
      this.handleFluxBrick(payload);
    });
    this.metricBusId = subscribe(DEFAULT_METRIC_VOLUME_CHANNEL, (payload: any) => {
      this.handleMetricVolume(payload as MetricVolumeMessage);
    });
    this.observerSelectionBusId = subscribe(OBSERVER_ROBUST_SELECTION_CHANNEL, (payload: any) => {
      const conditionRaw = typeof payload?.condition === "string" ? payload.condition.toLowerCase() : "nec";
      const frameRaw = typeof payload?.frame === "string" ? payload.frame : "Eulerian";
      const condition: ObserverConditionKey =
        conditionRaw === "nec" || conditionRaw === "wec" || conditionRaw === "sec" || conditionRaw === "dec"
          ? conditionRaw
          : "nec";
      const frame: ObserverFrameKey =
        frameRaw === "Eulerian" || frameRaw === "Robust" || frameRaw === "Delta" || frameRaw === "Missed"
          ? frameRaw
          : "Eulerian";
      this.observerSelection = { condition, frame };
      this.refreshT00FieldTexture();
      this.overlayCache.observerDirectionKey = "";
    });
    this.observerDirectionOverlayBusId = subscribe(OBSERVER_DIRECTION_OVERLAY_CHANNEL, (payload: any) => {
      const enabled = payload?.enabled === true;
      const strideRaw = Number(payload?.stride ?? 4);
      const stride = Number.isFinite(strideRaw) ? Math.max(1, Math.min(32, Math.round(strideRaw))) : 4;
      const decDirectionMode = payload?.decDirectionMode === "global" ? "global" : "local";
      const maskModeRaw = typeof payload?.maskMode === "string" ? payload.maskMode.toLowerCase() : "violating";
      const maskMode = maskModeRaw === "all" || maskModeRaw === "missed" ? maskModeRaw : "violating";
      const minMagnitudeRaw = Number(payload?.minMagnitude ?? 0);
      const minMagnitude = Number.isFinite(minMagnitudeRaw) ? Math.max(0, minMagnitudeRaw) : 0;
      this.observerDirectionOverlay = { enabled, stride, decDirectionMode, maskMode, minMagnitude };
      this.overlayCache.observerDirectionKey = "";
    });



    this.intentBusUnsub = subscribeDriveIntent((payload: DriveIntentState) => {
      this.handleIntentUpdate(payload);
    });



    const handlePhase = (payload: any) => {



      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();



      const phaseRaw = Number(payload?.phase01);



      if (!Number.isFinite(phaseRaw)) return;



      const contRaw = Number(payload?.phaseCont);



      const signRaw = Number(payload?.phaseSign);



      const normalized = wrapPhase01(phaseRaw);



      if (!this.phaseFeedActive) {



        this.phaseState.phase01 = normalized;



        this.phaseState.phaseCont = Number.isFinite(contRaw) ? contRaw : normalized;



        this.phaseState.sign = Number.isFinite(signRaw) && signRaw < 0 ? -1 : 1;



        this.phaseState.velocity = 0;



        this.phaseState.lastAtMs = nowMs;



        this.phaseFeedActive = true;



      } else {



        const dtSec = Math.max(1e-3, (nowMs - this.phaseState.lastAtMs) / 1000);



        let delta = 0;



        if (Number.isFinite(contRaw)) {



          delta = contRaw - this.phaseState.phaseCont;



          this.phaseState.phaseCont = contRaw;



          this.phaseState.phase01 = wrapPhase01(this.phaseState.phaseCont);



        } else {



          delta = shortestPhaseDelta(normalized, this.phaseState.phase01);



          this.phaseState.phaseCont += delta;



          this.phaseState.phase01 = wrapPhase01(this.phaseState.phaseCont);



        }



        const instVel = delta / dtSec;



        const clampedVel = Math.max(-4, Math.min(4, instVel));



        if (Number.isFinite(clampedVel)) {



          this.phaseState.velocity =



            this.phaseState.velocity + (clampedVel - this.phaseState.velocity) * 0.2;



        }



        if (Number.isFinite(signRaw) && signRaw !== 0) {



          this.phaseState.sign = signRaw > 0 ? 1 : -1;



        } else if (Math.abs(delta) > 1e-4) {



          this.phaseState.sign = delta >= 0 ? 1 : -1;



        }



        this.phaseState.lastAtMs = nowMs;



        this.phaseFeedActive = true;



      }



      if (this.state) {



        this.state.phase01 = this.phaseState.phase01;



        this.state.phaseSign = this.phaseState.sign;



      }



    };



    this.phaseStableBusId = subscribe("warp:phase:stable", handlePhase);



    this.phaseLegacyBusId = subscribe("warp:phase", handlePhase);



    if (typeof window !== "undefined") {



      const win = window as any;



      win.runHull3DHealthCheck = this.runHull3DHealthCheck.bind(this);



      win.__hullRenderer = this;



    }



  }







  private updateOverlay3D(payload: any) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const target = this.overlay3D;
    const modeRaw = (payload as any).mode;
    if (modeRaw !== undefined) {
      const m = Number(modeRaw);
      if (m === 0 || m === 1 || m === 2 || m === 3) {
        target.mode = m as 0 | 1 | 2 | 3;
      }
    }
    const mixRaw = (payload as any).mix;
    if (mixRaw !== undefined) {
      const v = Number(mixRaw);
      if (Number.isFinite(v)) {
        target.mix = Math.max(0, Math.min(1, v));
      }
    }
    const alphaRaw = (payload as any).alpha;
    if (alphaRaw !== undefined) {
      const v = Number(alphaRaw);
      if (Number.isFinite(v)) {
        target.alpha = Math.max(0, Math.min(1, v));
      }
    }
    const thickRaw = (payload as any).thick;
    if (thickRaw !== undefined) {
      const v = Number(thickRaw);
      if (Number.isFinite(v)) {
        target.thick = Math.max(0.001, Math.min(0.3, v));
      }
    }
    const gainRaw = (payload as any).gain;
    if (gainRaw !== undefined) {
      const v = Number(gainRaw);
      if (Number.isFinite(v)) {
        target.gain = Math.max(0, Math.min(12, v));
      }
    }
    const hueRaw = (payload as any).hue;
    if (hueRaw !== undefined) {
      const v = Number(hueRaw);
      if (Number.isFinite(v)) {
        const wrapped = v % 1;
        target.hue = wrapped < 0 ? wrapped + 1 : wrapped;
      }
    }
    const phaseRaw = (payload as any).phase01;
    if (phaseRaw !== undefined) {
      const v = Number(phaseRaw);
      if (Number.isFinite(v)) {
        const wrapped = v % 1;
        target.phase01 = wrapped < 0 ? wrapped + 1 : wrapped;
      }
    }
  }



  private publishOverlayState() {
    const overlayHue = this.overlay3D.hue;
    publish("hull3d:overlay", {
      mode: this.overlay3D.mode,
      mix: this.overlay3D.mix,
      alpha: this.overlay3D.alpha,
      thick: this.overlay3D.thick,
      gain: this.overlay3D.gain,
      hue: overlayHue,
      phase01: this.overlay3D.phase01,
      spacetimeGrid: this.spacetimeGridTelemetry,
    });
  }


  private resolveQualityProfile(preset: Hull3DQualityPreset, overrides?: Hull3DQualityOverrides): QualityProfile {



    const profile = preset === "auto" ? QUALITY_PROFILES.high : QUALITY_PROFILES[preset];



    const budget = preset === "auto" ? AUTO_QUALITY_BUDGET : QUALITY_BUDGETS[preset];



    const clampVec = (vec: [number, number, number]) => ([



      clamp(Math.round(vec[0]), budget.minDims[0], budget.maxDims[0]),



      clamp(Math.round(vec[1]), budget.minDims[1], budget.maxDims[1]),



      clamp(Math.round(vec[2]), budget.minDims[2], budget.maxDims[2]),



    ] as [number, number, number]);



    let dims = profile.dims;



    if (overrides?.voxelDensity === "low") dims = QUALITY_PROFILES.low.dims;



    if (overrides?.voxelDensity === "medium") dims = QUALITY_PROFILES.medium.dims;



    if (overrides?.voxelDensity === "high") dims = QUALITY_PROFILES.high.dims;



    dims = clampVec(dims);



    const maxStepsRaw = overrides?.raySteps ? Math.max(16, overrides.raySteps) : profile.maxSteps;



    const maxSteps = clamp(Math.round(maxStepsRaw), budget.minSteps, budget.maxSteps);



    const stepBias = clamp(overrides?.stepBias ?? profile.stepBias, 0.3, 1.25);



    return { dims, maxSteps, stepBias };



  }






  private tryEnablePostSpaceGrid(gl: WebGL2RenderingContext) {
    if (this.postSpaceGridEnabled || this.postSpaceGridAttempted) return;
    this.postSpaceGridAttempted = true;
    try {
      const next = linkProgram(gl, "Hull3D::post:grid", POST_VS, POST_FS);
      if (this.resources.postProgram) {
        gl.deleteProgram(this.resources.postProgram);
      }
      this.resources.postProgram = next;
      this.postSpaceGridEnabled = true;
      console.info("[Hull3DRenderer] Post shader upgraded: spacetime grid enabled");
    } catch (err) {
      console.error("[Hull3DRenderer] Post shader upgrade failed", err);
      this.postSpaceGridEnabled = false;
    }
  }




  private initCoreResources() {



    const { gl } = this;



    const extFloat = gl.getExtension("EXT_color_buffer_float");



    const extHalf = gl.getExtension("EXT_color_buffer_half_float");



    this.supportsColorFloat = !!(extFloat || extHalf);

    this.supportsFloatLinear = !!gl.getExtension("OES_texture_float_linear");
    this.supportsHalfFloatLinear = !!gl.getExtension("OES_texture_half_float_linear");
    try {
      this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0) || 0;
      this.max3DTextureSize = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) ?? 0) || 0;
    } catch {
      this.maxTextureSize = 0;
      this.max3DTextureSize = 0;
    }



    const quadVao = gl.createVertexArray();



    const quadVbo = gl.createBuffer();



    if (!quadVao || !quadVbo) throw new Error("Failed to allocate quad geometry");



    gl.bindVertexArray(quadVao);



    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);



    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([



      -1, -1,



      1, -1,



      -1,  1,



      1,  1,



    ]), gl.STATIC_DRAW);



    gl.enableVertexAttribArray(0);



    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);



    gl.bindVertexArray(null);



    this.resources.quadVao = quadVao;



    this.resources.quadVbo = quadVbo;







    try {



      this.resources.rayProgram = linkProgram(gl, "Hull3D::raymarch", RAYMARCH_VS, RAYMARCH_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Raymarch shader failed; fallback will be used", err);



      this.resources.rayProgram = null;



    }



    try {



      this.resources.overlayProgram = linkProgram(gl, "Hull3D::overlay", OVERLAY_VS, OVERLAY_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Overlay shader failed", err);



      this.resources.overlayProgram = null;



    }



    try {



      this.resources.previewMeshProgram = linkProgram(gl, "Hull3D::previewMesh", PREVIEW_MESH_VS, PREVIEW_MESH_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Preview mesh shader failed", err);



      this.resources.previewMeshProgram = null;



    }



    try {



      this.resources.ringOverlayProgram = linkProgram(gl, "Hull3D::ringOverlay", RING_OVERLAY_VS, RING_OVERLAY_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Ring overlay shader failed", err);



      this.resources.ringOverlayProgram = null;



    }



    try {



      this.resources.postProgram = linkProgram(gl, "Hull3D::post:nogrid", POST_VS, POST_FS_NO_SPACEGRID);
      this.postSpaceGridEnabled = false;
      this.postSpaceGridAttempted = false;



    } catch (err) {



      console.error("[Hull3DRenderer] Post shader (no-grid) failed", err);
      this.resources.postProgram = null;
      this.postSpaceGridEnabled = false;
      this.postSpaceGridAttempted = true;



    }



    // Link 2D surface overlay program



    try {



      this.surfaceProgram = linkProgram(gl, "Hull3D::surfaceOverlay", SURFACE_OVERLAY_VS, SURFACE_OVERLAY_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Surface overlay shader failed", err);



      this.surfaceProgram = null;



    }



    try {



      this.betaOverlayProgram = linkProgram(gl, "Hull3D::betaOverlay", SURFACE_OVERLAY_VS, SURFACE_BETA_OVERLAY_FS);



      if (this.betaOverlayProgram) {



        const prog = this.betaOverlayProgram;



        this.betaOverlayUniforms = {



          u_axes: gl.getUniformLocation(prog, "u_axes"),



          u_sigma: gl.getUniformLocation(prog, "u_sigma"),



          u_R: gl.getUniformLocation(prog, "u_R"),

          u_domainScale: gl.getUniformLocation(prog, "u_domainScale"),



          u_beta: gl.getUniformLocation(prog, "u_beta"),

          u_thetaSign: gl.getUniformLocation(prog, "u_thetaSign"),



          u_viz: gl.getUniformLocation(prog, "u_viz"),



          u_ampChain: gl.getUniformLocation(prog, "u_ampChain"),



          u_gate: gl.getUniformLocation(prog, "u_gate"),



          u_gate_view: gl.getUniformLocation(prog, "u_gate_view"),



          u_duty: gl.getUniformLocation(prog, "u_duty"),



          u_yGain: gl.getUniformLocation(prog, "u_yGain"),



          u_yBias: gl.getUniformLocation(prog, "u_yBias"),



          u_kColor: gl.getUniformLocation(prog, "u_kColor"),



          u_mvp: gl.getUniformLocation(prog, "u_mvp"),



          u_totalSectors: gl.getUniformLocation(prog, "u_totalSectors"),



          u_liveSectors: gl.getUniformLocation(prog, "u_liveSectors"),



          u_lumpExp: gl.getUniformLocation(prog, "u_lumpExp"),



          u_sectorCenter: gl.getUniformLocation(prog, "u_sectorCenter"),



          u_sectorSigma: gl.getUniformLocation(prog, "u_sectorSigma"),



          u_sectorFloor: gl.getUniformLocation(prog, "u_sectorFloor"),



          u_syncMode: gl.getUniformLocation(prog, "u_syncMode"),



          u_phase01: gl.getUniformLocation(prog, "u_phase01"),



          u_splitEnabled: gl.getUniformLocation(prog, "u_splitEnabled"),



          u_splitFrac: gl.getUniformLocation(prog, "u_splitFrac"),



          uBetaTex: gl.getUniformLocation(prog, "uBetaTex"),



          uBetaTarget: gl.getUniformLocation(prog, "uBetaTarget"),



          uComfort: gl.getUniformLocation(prog, "uComfort"),



          uHullDims: gl.getUniformLocation(prog, "uHullDims"),



          uAlpha: gl.getUniformLocation(prog, "uAlpha"),



          u_vizFloorThetaGR: gl.getUniformLocation(prog, "u_vizFloorThetaGR"),



          u_vizFloorRhoGR: gl.getUniformLocation(prog, "u_vizFloorRhoGR"),



          u_vizFloorThetaDrive: gl.getUniformLocation(prog, "u_vizFloorThetaDrive"),
          u_showTilt: gl.getUniformLocation(prog, "u_showTilt"),
          u_tiltDir: gl.getUniformLocation(prog, "u_tiltDir"),
          u_tiltMag: gl.getUniformLocation(prog, "u_tiltMag"),
          u_tiltAlpha: gl.getUniformLocation(prog, "u_tiltAlpha"),



          u_tiltGain: gl.getUniformLocation(prog, "u_tiltGain"), // [tilt-gain]



        };



      }



    } catch (err) {



      console.error("[Hull3DRenderer] Beta overlay shader failed", err);



      this.betaOverlayProgram = null;



      this.betaOverlayUniforms = null;



    }







    try {



      this.radialTex = createTexture2D(gl);



      this.ringInstantTex = createTexture2D(gl);



      this.ringAverageTex = createTexture2D(gl);



      this.radialTexAllocated = false;



      this.ringInstantTexAllocated = false;



      this.ringAverageTexAllocated = false;



      this.volumeTex = createTexture3D(gl);



      if (this.ringInstantTex) {



        gl.bindTexture(gl.TEXTURE_2D, this.ringInstantTex);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);



      }



      if (this.ringAverageTex) {



        gl.bindTexture(gl.TEXTURE_2D, this.ringAverageTex);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);



      }



      gl.bindTexture(gl.TEXTURE_2D, null);



    } catch (err) {



      console.error("[Hull3DRenderer] Texture allocation failed:", err);



      this.radialTex = this.ringInstantTex = this.ringAverageTex = this.volumeTex = this.gateVolumeTex = null;
      this.latticeDfdrTex = null;
      this.latticeDfdrAtlasTex = null;



      this.radialTexAllocated = false;



      this.ringInstantTexAllocated = false;



      this.ringAverageTexAllocated = false;



    }



    this.resources.ringAvgTex = this.ringAverageTex;



  }







  setQuality(preset: Hull3DQualityPreset, overrides?: Hull3DQualityOverrides) {



    this.qualityPreset = preset;



    this.qualityProfile = this.resolveQualityProfile(preset, overrides ?? this.options.qualityOverrides);



    this.dims = [...this.qualityProfile.dims];



    this.lastVolumeKey = "";
    this.latticeUploadFailedHash = null;
    this.latticeUploadFailedReason = null;
    this.latticeVolumeReadyKey = null;
    this.latticeDfdrUpload = null;
    this.latticeDfdrUploadFailedHash = null;
    this.latticeDfdrUploadFailedReason = null;
    this.latticeDfdrReadyKey = null;



  }







  setMode(mode: Hull3DRendererMode, blendFactor?: number) {



    this.mode = mode;



    if (blendFactor !== undefined && this.state) {



      this.state.blendFactor = clamp(blendFactor, 0, 1);



    }



  }







  update(state: Hull3DRendererState) {



    this.state = { ...state };



    if (!Number.isFinite(this.state.gateView)) {



      this.state.gateView = this.state.gate;



    }



    const clampReasons = Array.isArray(this.state.latticeClampReasons)
      ? this.state.latticeClampReasons
      : Array.isArray(this.state.latticeFrame?.clampReasons)
        ? this.state.latticeFrame.clampReasons
        : [];
    const strobe = this.state.latticeStrobe;
    const sdfGrid = this.state.latticeSdf;
    let latticeDiagMsg =
      clampReasons.length > 0 ? `Lattice clamp: ${clampReasons.join(', ')}` : null;
    const latticeVolume = this.state.latticeVolume;
    const latticeUpload =
      latticeVolume && this.latticeUpload && this.latticeUpload.hash === latticeVolume.hash
        ? this.latticeUpload
        : null;
    if (!latticeDiagMsg && latticeVolume) {
      if (this.latticeUploadFailedHash === latticeVolume.hash && !latticeUpload) {
        latticeDiagMsg = "Lattice volume fallback (GPU upload unavailable)";
      } else if (latticeUpload && latticeUpload.nextSlice < latticeUpload.dims[2]) {
        const pct = (latticeUpload.nextSlice / Math.max(1, latticeUpload.dims[2])) * 100;
        latticeDiagMsg = `Uploading lattice volume (${pct.toFixed(0)}%, ${latticeUpload.format.label})`;
      }
    }
    if (!latticeDiagMsg && strobe?.coverage?.area01) {
      let maxArea = 0;
      for (let i = 0; i < strobe.coverage.area01.length; i++) {
        const v = strobe.coverage.area01[i] ?? 0;
        if (v > maxArea) maxArea = v;
      }
      if (maxArea < 0.02) {
        latticeDiagMsg = `Strobe coverage low (peak ${(maxArea * 100).toFixed(1)}%)`;
      }
    }
    if (!latticeDiagMsg && latticeVolume?.stats) {
      const cov = Math.max(0, Math.min(1, latticeVolume.stats.coverage)) * 100;
      const maxGate = latticeVolume.stats.maxGate ?? 0;
      if (cov < 15) {
        latticeDiagMsg = `Lattice volume coverage low (${cov.toFixed(1)}%, max gate ${maxGate.toFixed(3)})`;
      } else if (maxGate < 1e-4) {
        latticeDiagMsg = `Lattice volume dark (max gate ${maxGate.toFixed(4)})`;
      }
    }
    if (!latticeDiagMsg && sdfGrid?.stats) {
      const voxPct = Math.max(0, Math.min(1, sdfGrid.stats.voxelCoverage)) * 100;
      const triPct = Math.max(0, Math.min(1, sdfGrid.stats.triangleCoverage)) * 100;
      const band = Math.max(1e-6, sdfGrid.band);
      if (voxPct < 20 || triPct < 50) {
        latticeDiagMsg = `Hull SDF coverage low (vox ${voxPct.toFixed(1)}%, tris ${triPct.toFixed(1)}%)`;
      } else if (sdfGrid.stats.maxAbsDistance > band * 0.95) {
        latticeDiagMsg = `Hull SDF band saturated (|d|max ${(sdfGrid.stats.maxAbsDistance).toFixed(3)} m, band ${band.toFixed(3)} m)`;
      }
    }
    if (typeof window !== "undefined") {
      if (latticeDiagMsg) {
        (window as any).__hullDiagMessage = { message: latticeDiagMsg, status: "lattice" };
      } else if ((window as any).__hullDiagMessage?.status === "lattice") {
        (window as any).__hullDiagMessage = null;
      }
      (window as any).__hullStrobe = this.state.latticeStrobe ?? null;
      (window as any).__hullLatticeSdf = sdfGrid ?? null;
      (window as any).__hullLatticeVolume = latticeVolume ?? null;
    }

    this.state.vizFloorThetaGR = Math.max(0, this.state.vizFloorThetaGR ?? 1e-9);



    this.state.vizFloorRhoGR = Math.max(0, this.state.vizFloorRhoGR ?? 1e-18);



    this.state.vizFloorThetaDrive = Math.max(0, this.state.vizFloorThetaDrive ?? 1e-6);



    const rawPhase = Number.isFinite(this.state.phase01) ? this.state.phase01 : 0;



    const wrappedPhase = rawPhase % 1;



    const fallbackPhase = clamp(wrappedPhase < 0 ? wrappedPhase + 1 : wrappedPhase, 0, 1);



    if (!this.phaseSourceActive || !Number.isFinite(this.phaseTarget)) {



      this.phaseUnwrapped = fallbackPhase;



      this.phaseTarget = fallbackPhase;



    }



    this.state.phase01 = this.phaseTarget;



    const nextState = this.state;



    this.volumeViz = this.resolveVolumeViz(nextState);
    this.volumeSource = this.resolveVolumeSource(nextState);

    this.volumeDomain = this.resolveVolumeDomain(nextState);



    const wantFreeze = nextState.freeze || nextState.bubbleStatus === "CRITICAL";



    const safeR = Math.max(nextState.R, 1e-3);



    const domainOverride = Number(nextState.domainScale);



    this.domainScale = Number.isFinite(domainOverride) && (domainOverride as number) > 0



      ? Math.max(0.1, domainOverride as number)



      : DEFAULT_DOMAIN_SCALE * safeR;



    this.opacityWindow = this.normalizeOpacityWindow(nextState.opacityWindow);



    this.freezeVolume = wantFreeze;



    this.skipVolumeUpdate = wantFreeze && this.hasVolume;



    this.updateRadialLUT(nextState);



    this.updateRingLUT(nextState);



    this.updateDerivedHullDims(nextState);



    if (!this.skipVolumeUpdate) {



      this.updateVolume(nextState);
      this.updateLatticeSdf(nextState);
      this.updateLatticeDfdr(nextState);



    }



    if (!this.freezeVolume) {



      this.updateRingAverage(nextState);



    }



    this.ensureOverlayGeometry(nextState);
    this.ensureFluxStreamlines(nextState);
    this.ensureObserverDirectionOverlay(nextState);



    this.ensureSurfaceGrid();



  }

  getLatticeGpuStatus(expected?: { volumeHash?: string | null; sdfKey?: string | null } | null) {
    const state = this.state;
    const expectedVolumeHash =
      expected?.volumeHash === undefined ? state?.latticeVolume?.hash ?? null : (expected.volumeHash ?? null);
    const expectedSdfKey =
      expected?.sdfKey === undefined ? state?.latticeSdf?.key ?? null : (expected.sdfKey ?? null);

    const activeVolumeUpload =
      expectedVolumeHash && this.latticeUpload && this.latticeUpload.hash === expectedVolumeHash
        ? this.latticeUpload
        : null;
    const volumeFailed =
      expectedVolumeHash != null && this.latticeUploadFailedHash === expectedVolumeHash && !activeVolumeUpload;
    const volumeReady =
      expectedVolumeHash == null
        ? true
        : this.latticeVolumeReadyKey === expectedVolumeHash;

    const activeSdfUpload =
      expectedSdfKey && this.latticeSdfUpload && this.latticeSdfUpload.key === expectedSdfKey
        ? this.latticeSdfUpload
        : null;
    const sdfReady = expectedSdfKey == null ? true : this.latticeSdfReadyKey === expectedSdfKey;
    const sdfFailed =
      expectedSdfKey != null && this.latticeSdfUploadFailedKey === expectedSdfKey && !sdfReady;

    const activeLattice =
      state?.latticeVolume && this.latticeUpload && this.latticeUpload.hash === state.latticeVolume.hash
        ? this.latticeUpload
        : null;
    const runtimeBackend = activeLattice?.format.backend ?? null;
    const runtimeUseAtlas = runtimeBackend === "atlas2d";
    const runtimeHasLatticeVolume = !!activeLattice;
    const runtimeHasLatticeSdf = !!(
      runtimeHasLatticeVolume &&
      state?.latticeSdf &&
      this.latticeSdfReadyKey &&
      this.latticeSdfReadyKey === state.latticeSdf.key
    );

    return {
      expectedVolumeHash,
      expectedSdfKey,
      volumeReady,
      volumeFailed,
      volumeFailedReason: volumeFailed ? this.latticeUploadFailedReason : null,
      volumeUploadProgress: activeVolumeUpload
        ? {
            nextSlice: activeVolumeUpload.nextSlice,
            totalSlices: activeVolumeUpload.dims[2],
          }
        : null,
      sdfReady,
      sdfFailed,
      sdfFailedReason: sdfFailed ? this.latticeSdfUploadFailedReason : null,
      sdfUploadProgress: activeSdfUpload
        ? {
            nextSlice: activeSdfUpload.nextSlice,
            totalSlices: activeSdfUpload.dims[2],
          }
        : null,
      caps: {
        maxTextureSize: this.maxTextureSize,
        max3DTextureSize: this.max3DTextureSize,
        supportsColorFloat: this.supportsColorFloat,
        supportsFloatLinear: this.supportsFloatLinear,
        supportsHalfFloatLinear: this.supportsHalfFloatLinear,
      },
      runtime: {
        hasLatticeVolume: runtimeHasLatticeVolume,
        backend: runtimeBackend,
        formatLabel: activeLattice?.format.label ?? null,
        formatReason: this.latticeUploadFormatReason ?? null,
        packedRG: activeLattice?.format.packedRG ?? null,
        useAtlas: runtimeUseAtlas,
        hasLatticeSdf: runtimeHasLatticeSdf,
        telemetry: this.latticeUploadTelemetry ?? null,
      },
    };
  }







  private updateRadialLUT(state: Hull3DRendererState) {



    // Build LUT in normalized metric space with R=1, and scale radius in shader by 1/R



    // This guarantees the wall stays within the LUT domain regardless of absolute R.



    const axes = state.axes ?? [1, 1, 1];



    const boundRadius = state.hullSDFBounds

      ? Math.max(

          Math.abs(state.hullSDFBounds[0] ?? 0),

          Math.abs(state.hullSDFBounds[1] ?? 0),

          Math.abs(state.hullSDFBounds[2] ?? 0),

        )

      : null;



    const providedRadius = Number.isFinite(state.hullRadiusMax as number)

      ? Math.abs(state.hullRadiusMax as number)

      : null;



    const axesRadius = Math.max(Math.abs(axes[0] ?? 0), Math.abs(axes[1] ?? 0), Math.abs(axes[2] ?? 0));



    this.radialMaxR = Math.max(1e-3, providedRadius ?? boundRadius ?? axesRadius ?? RADIAL_SAMPLE_R_MAX);



    const volumeSource = this.resolveVolumeSource(state);
    const metricR =
      volumeSource === "analytic"
        ? 1
        : Math.max(state.R, 1e-6); // normalized radius uses resolved R



    this.radialMetricR = metricR;



    const key = `${state.sigma.toFixed(6)}|${metricR.toFixed(6)}|${this.radialMaxR.toFixed(6)}`;



    if (key === this.lastRadialKey) return;



    this.radialScale = (RADIAL_SIZE - 1) / Math.max(this.radialMaxR, 1e-6);



    this.radialLUT = buildRadialLUT(state.sigma, metricR, this.radialMaxR);



    let maxDf = 1e-6;



    for (let i = 0; i < this.radialLUT.length; i++) {



      const v = Math.abs(this.radialLUT[i]);



      if (v > maxDf) maxDf = v;



    }



    this.radialDfMax = maxDf;



    this.lastRadialKey = key;



    if (this.radialTex) {



      const { gl } = this;



      gl.bindTexture(gl.TEXTURE_2D, this.radialTex);



      if (!this.radialTexAllocated) {



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, RADIAL_SIZE, 1, 0, gl.RED, gl.FLOAT, null);



        this.radialTexAllocated = true;



      }



      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RADIAL_SIZE, 1, gl.RED, gl.FLOAT, this.radialLUT);



      gl.bindTexture(gl.TEXTURE_2D, null);



    }



  }







  private buildRingKey(state: Hull3DRendererState) {



    const keys = [



      state.gaussianSigma,



      state.sectorCenter01,



      state.totalSectors,



      state.liveSectors,



      state.sectorFloor,



      state.lumpExp,



      state.syncMode,



      state.splitEnabled ? 1 : 0,



      state.splitFrac,



    ];



    return keys.map((x) => `${Math.round(x * 1e6)}`).join("|");



  }







  private updateRingLUT(state: Hull3DRendererState) {



    const key = this.buildRingKey(state);



    if (key === this.lastRingKey) {



      if (this.state && this.ringLastStats) {



        this.state.fActive = clamp(this.ringLastStats.rawMean, 1e-6, 1);



      }



      return;



    }



    const ring = buildRingLUT({



      gaussianSigma: state.gaussianSigma,



      sectorCenter01: state.sectorCenter01,



      totalSectors: state.totalSectors,



      liveSectors: state.liveSectors,



      sectorFloor: state.sectorFloor,



      syncMode: state.syncMode,



      splitEnabled: state.splitEnabled,



      splitFrac: state.splitFrac,



    });



    this.ringInstantLUT = ring.weights;



    this.ringLastStats = ring.stats;



    const coverageLow = ring.stats.rawMean <= 1e-4;



    this.autoFlatGate = coverageLow;



    const fActiveRaw = clamp(ring.stats.rawMean, 1e-6, 1);



    if (this.state) {



      this.state.fActive = fActiveRaw;



    }



    const dbgPhaseSign = (typeof window !== "undefined" && (window as any).__hullPhaseSign === -1) ? -1 : 1;



    const phaseSignEffective = (Math.sign(state.phaseSign ?? 1) || 1) * dbgPhaseSign;



    const logPayload = {



      meanW: Number(ring.stats.mean.toFixed(6)),



      meanRaw: Number(ring.stats.rawMean.toFixed(6)),



      minW: Number(ring.stats.min.toFixed(6)),



      maxW: Number(ring.stats.max.toFixed(6)),



      phaseSign: phaseSignEffective,



      center01: Number(ring.stats.center01.toFixed(6)),



      sigma01: Number(ring.stats.sigma01.toFixed(6)),



      floor: Number(ring.stats.floor.toFixed(6)),



      split: ring.stats.splitEnabled,



      splitFrac: Number(ring.stats.splitFrac.toFixed(6)),



      mode: ring.stats.mode,



      liveSectors: ring.stats.liveSectors,



      totalSectors: ring.stats.totalSectors,



      minFloor: ring.stats.minFloor,



    };



    if (ring.stats.warnings.length > 0) {



      ring.stats.warnings.forEach((msg) => console.warn(msg, logPayload));



    } else if (coverageLow) {



      console.warn("[Hull3DRenderer] ring coverage extremely low; forcing flat gate fallback", logPayload);



    } else {



      console.info("[Hull3DRenderer] ringLUT stats", logPayload);



    }



    this.phaseSignEffective = phaseSignEffective;



    this.lastRingKey = key;



    if (this.ringInstantTex) {



      const { gl } = this;



      gl.bindTexture(gl.TEXTURE_2D, this.ringInstantTex);



      if (!this.ringInstantTexAllocated) {



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, RING_SIZE, 1, 0, gl.RED, gl.FLOAT, null);



        this.ringInstantTexAllocated = true;



      }



      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RING_SIZE, 1, gl.RED, gl.FLOAT, this.ringInstantLUT);



      gl.bindTexture(gl.TEXTURE_2D, null);



    }



  }







  private buildVolumeKey(state: Hull3DRendererState) {



    const keys = [



      ...state.axes,



      state.R,



      state.sigma,



      this.dims[0],



      this.dims[1],



      this.dims[2],



    ];



    return keys.map((x) => `${Math.round(x * 1e5)}`).join("|");



  }







  private updateVolume(state: Hull3DRendererState) {
    if (this.skipVolumeUpdate) return;

    const volume = state.latticeVolume;
    if (volume) {
      if (this.lastVolumeKey === volume.hash) return;

      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const { gl } = this;
      const profileTag = state.latticeProfileTag ?? "preview";
      const rails = latticeRailsForProfile(profileTag);
      const dims: [number, number, number] = [
        Math.max(1, volume.dims[0]),
        Math.max(1, volume.dims[1]),
        Math.max(1, volume.dims[2]),
      ];

      const voxelCount = dims[0] * dims[1] * dims[2];
      if (voxelCount > rails.maxVoxels) {
        this.hasVolume = false;
        this.latticeUpload = null;
        this.latticeVolumeReadyKey = null;
        this.latticeUploadFailedHash = volume.hash;
        this.latticeUploadFailedReason = "budget:voxels";
        this.latticeUploadFormatReason = null;
        this.latticeUploadTelemetry = {
          profileTag,
          voxelCount,
          bytes: 0,
          budgetBytes: rails.maxBytes,
          budgetVoxels: rails.maxVoxels,
          formatLabel: null,
          backend: null,
          uploadedAtMs: nowMs,
          skippedReason: "budget:voxels",
        };
        return;
      }

      const shouldRestart =
        !this.latticeUpload ||
        this.latticeUpload.hash !== volume.hash ||
        this.latticeUpload.dims[0] !== dims[0] ||
        this.latticeUpload.dims[1] !== dims[1] ||
        this.latticeUpload.dims[2] !== dims[2];

      if (shouldRestart) {
        this.latticeVolumeReadyKey = null;
        if (this.latticeUploadFailedHash === volume.hash) return;

        const floatBytes = voxelCount * 8; // RG32F packed
        const preferHalfForCaps =
          !this.supportsColorFloat || (!this.supportsFloatLinear && this.supportsHalfFloatLinear);
        const preferHalfForBudget = floatBytes >= LATTICE_PREFER_HALF_FLOAT_UPLOAD_BYTES;
        const preferHalf = preferHalfForBudget || preferHalfForCaps;
        const filterF32 = this.supportsFloatLinear ? gl.LINEAR : gl.NEAREST;
        const filterF16 = this.supportsHalfFloatLinear ? gl.LINEAR : gl.NEAREST;
        const atlas =
          this.maxTextureSize > 0 ? computeLatticeAtlasLayout(dims, this.maxTextureSize) : null;
        const allowTexture3D = this.max3DTextureSize > 0;
        const tex3DDimsExceeded =
          allowTexture3D &&
          (dims[0] > this.max3DTextureSize ||
            dims[1] > this.max3DTextureSize ||
            dims[2] > this.max3DTextureSize);

        const candidates: LatticeVolumeUploadFormat[] = [];
        const rg16f3D: LatticeVolumeUploadFormat = {
          backend: "tex3d",
          packedRG: true,
          internalFormat: gl.RG16F,
          format: gl.RG,
          type: gl.HALF_FLOAT,
          filter: filterF16,
          label: "3D RG16F",
        };
        const rg32f3D: LatticeVolumeUploadFormat = {
          backend: "tex3d",
          packedRG: true,
          internalFormat: gl.RG32F,
          format: gl.RG,
          type: gl.FLOAT,
          filter: filterF32,
          label: "3D RG32F",
        };
        const r32f3D: LatticeVolumeUploadFormat = {
          backend: "tex3d",
          packedRG: false,
          internalFormat: gl.R32F,
          format: gl.RED,
          type: gl.FLOAT,
          filter: filterF32,
          label: "3D R32FÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â2",
        };
        const rg16fAtlas: LatticeVolumeUploadFormat | null =
          atlas
            ? {
                backend: "atlas2d",
                packedRG: true,
                internalFormat: gl.RG16F,
                format: gl.RG,
                type: gl.HALF_FLOAT,
                filter: filterF16,
                label: "Atlas RG16F",
                atlas,
              }
            : null;
        const rg32fAtlas: LatticeVolumeUploadFormat | null =
          atlas
            ? {
                backend: "atlas2d",
                packedRG: true,
                internalFormat: gl.RG32F,
                format: gl.RG,
                type: gl.FLOAT,
                filter: filterF32,
                label: "Atlas RG32F",
                atlas,
              }
            : null;

        if (allowTexture3D) {
          if (preferHalf) candidates.push(rg16f3D);
          candidates.push(rg32f3D);
          if (!preferHalf) candidates.push(rg16f3D);
          candidates.push(r32f3D);
        }
        if (preferHalf && rg16fAtlas) candidates.push(rg16fAtlas);
        if (rg32fAtlas) candidates.push(rg32fAtlas);
        if (!preferHalf && rg16fAtlas) candidates.push(rg16fAtlas);

        let budgetFiltered = false;
        let formatReason: string | null = null;
        let tex3DRejectedReason: string | null = null;
        const allocateCandidate = (candidate: LatticeVolumeUploadFormat) => {
          const formatBytes = estimateLatticeUploadBytes(dims, {
            packedRG: candidate.packedRG,
            bytesPerComponent: candidate.type === gl.HALF_FLOAT ? 2 : 4,
          });
          if (formatBytes > rails.maxBytes) {
            budgetFiltered = true;
            return false;
          }

          if (candidate.backend === "tex3d") {
            if (!allowTexture3D) {
              tex3DRejectedReason = "caps:texture3d-unsupported";
              return false;
            }
            if (tex3DDimsExceeded) {
              tex3DRejectedReason = "caps:max3dTextureSize";
              return false;
            }

            if (!this.volumeTex) this.volumeTex = createTexture3D(gl);
            if (!this.volumeTex) return false;
            if (!candidate.packedRG && !this.gateVolumeTex) this.gateVolumeTex = createTexture3D(gl);
            if (!candidate.packedRG && !this.gateVolumeTex) return false;

            clearGlErrors(gl);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

            gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, candidate.filter);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, candidate.filter);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
            gl.texImage3D(
              gl.TEXTURE_3D,
              0,
              candidate.internalFormat,
              dims[0],
              dims[1],
              dims[2],
              0,
              candidate.format,
              candidate.type,
              null,
            );

            if (!candidate.packedRG && this.gateVolumeTex) {
              gl.bindTexture(gl.TEXTURE_3D, this.gateVolumeTex);
              gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, candidate.filter);
              gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, candidate.filter);
              gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
              gl.texImage3D(
                gl.TEXTURE_3D,
                0,
                candidate.internalFormat,
                dims[0],
                dims[1],
                dims[2],
                0,
                candidate.format,
                candidate.type,
                null,
              );
            }

            gl.bindTexture(gl.TEXTURE_3D, null);
            return gl.getError() === gl.NO_ERROR;
          }

          const atlasLayout = candidate.atlas;
          if (!atlasLayout) return false;
          if (this.maxTextureSize > 0 && (atlasLayout.width > this.maxTextureSize || atlasLayout.height > this.maxTextureSize)) {
            return false;
          }

          if (!this.latticeAtlasTex) {
            const tex = gl.createTexture();
            if (!tex) return false;
            this.latticeAtlasTex = tex;
          }

          clearGlErrors(gl);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.bindTexture(gl.TEXTURE_2D, this.latticeAtlasTex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, candidate.filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, candidate.filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            candidate.internalFormat,
            atlasLayout.width,
            atlasLayout.height,
            0,
            candidate.format,
            candidate.type,
            null,
          );
          gl.bindTexture(gl.TEXTURE_2D, null);
          if (gl.getError() !== gl.NO_ERROR) return false;

          if (!this.volumeTex) this.volumeTex = createTexture3D(gl);
          return !!this.volumeTex;
        };

        let chosen: LatticeVolumeUploadFormat | null = null;
        for (const candidate of candidates) {
          if (allocateCandidate(candidate)) {
            chosen = candidate;
            break;
          }
        }

        if (!chosen) {
          this.latticeUpload = null;
          this.latticeVolumeReadyKey = null;
          this.latticeUploadFailedHash = volume.hash;
          this.latticeUploadFormatReason = null;
          const dimsExceed3D =
            this.max3DTextureSize > 0 &&
            (dims[0] > this.max3DTextureSize ||
              dims[1] > this.max3DTextureSize ||
              dims[2] > this.max3DTextureSize);
          this.latticeUploadFailedReason = budgetFiltered
            ? "budget:bytes"
            : dimsExceed3D && !atlas
              ? "caps:max3dTextureSize"
              : !atlas
                ? "caps:maxTextureSize"
                : "format:unsupported";
          this.latticeUploadTelemetry = {
            profileTag,
            voxelCount,
            bytes: 0,
            budgetBytes: rails.maxBytes,
            budgetVoxels: rails.maxVoxels,
            formatLabel: null,
            backend: null,
            uploadedAtMs: nowMs,
            skippedReason: this.latticeUploadFailedReason ?? "format:unsupported",
            downgradeReason: null,
          };
          return;
        }

        if (!formatReason) {
          if (chosen.backend === "atlas2d") {
            formatReason =
              tex3DRejectedReason ??
              (!allowTexture3D
                ? "caps:texture3d-unsupported"
                : tex3DDimsExceeded
                  ? "caps:max3dTextureSize"
                  : null);
          } else if (chosen.type === gl.HALF_FLOAT && preferHalfForCaps) {
            if (!this.supportsColorFloat) formatReason = "caps:color-buffer-float";
            else if (!this.supportsFloatLinear && this.supportsHalfFloatLinear) formatReason = "caps:float-linear";
          }
        }

        this.latticeUploadFailedHash = null;
        this.latticeUploadFailedReason = null;
        const sliceVoxels = dims[0] * dims[1];
        const scratchLen = sliceVoxels * (chosen.packedRG ? 2 : 1);
        const nextUpload: LatticeVolumeUploadState = {
          hash: volume.hash,
          dims,
          format: chosen,
          nextSlice: 0,
          lastUploadAtMs: nowMs,
        };
        if (chosen.packedRG) {
          if (chosen.type === gl.HALF_FLOAT) nextUpload.scratchU16 = new Uint16Array(scratchLen);
          else nextUpload.scratchF32 = new Float32Array(scratchLen);
        }
        this.latticeUpload = nextUpload;
        this.latticeUploadFormatReason = formatReason ?? null;
        this.hasVolume = true;
        const chosenBytes = estimateLatticeUploadBytes(dims, {
          packedRG: chosen.packedRG,
          bytesPerComponent: chosen.type === gl.HALF_FLOAT ? 2 : 4,
        });
        this.latticeUploadTelemetry = {
          profileTag,
          voxelCount,
          bytes: chosenBytes,
          budgetBytes: rails.maxBytes,
          budgetVoxels: rails.maxVoxels,
          formatLabel: chosen.label,
          backend: chosen.backend,
          uploadedAtMs: nowMs,
          downgradeReason: this.latticeUploadFormatReason ?? null,
        };
      }

      const upload = this.latticeUpload;
      if (!upload || upload.hash !== volume.hash) return;

      // Upload slices incrementally to stay within bandwidth budget.
      if (upload.nextSlice < upload.dims[2]) {
        const sliceVoxels = dims[0] * dims[1];
        const bytesPerComponent = upload.format.type === gl.HALF_FLOAT ? 2 : 4;
        const channels = upload.format.packedRG ? 2 : 1;
        const textureFactor = upload.format.packedRG ? 1 : 2;
        const sliceBytes = Math.max(1, sliceVoxels * bytesPerComponent * channels * textureFactor);
        const mbps = LATTICE_UPLOAD_BUDGET_MBPS[profileTag] ?? LATTICE_UPLOAD_BUDGET_MBPS.preview;
        const bytesPerSec = mbps * 1024 * 1024;
        const dtRaw = (nowMs - upload.lastUploadAtMs) / 1000;
        const dtSec = Math.min(
          LATTICE_UPLOAD_MAX_DT_SEC,
          Math.max(1 / 240, Number.isFinite(dtRaw) && dtRaw > 0 ? dtRaw : 1 / 60),
        );
        upload.lastUploadAtMs = nowMs;

        let budgetBytes = bytesPerSec * dtSec;
        if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) budgetBytes = sliceBytes;
        if (budgetBytes < sliceBytes) budgetBytes = sliceBytes;

        const maxSlicesPerTick = rails.maxSlicesPerTickVolume;
        const slicesThisTick = Math.min(
          maxSlicesPerTick,
          Math.max(1, Math.floor(budgetBytes / sliceBytes) || 1),
          upload.dims[2] - upload.nextSlice,
        );

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        if (upload.format.backend === "tex3d") {
          if (upload.format.packedRG) {
            if (!this.volumeTex) return;
            gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
            for (let step = 0; step < slicesThisTick; step++) {
              const z = upload.nextSlice;
              const base = z * sliceVoxels;
              if (upload.format.type === gl.HALF_FLOAT) {
                if (!upload.scratchU16 || upload.scratchU16.length !== sliceVoxels * 2) {
                  upload.scratchU16 = new Uint16Array(sliceVoxels * 2);
                }
                const out = upload.scratchU16;
                const driveBits = new Uint32Array(volume.drive3D.buffer, volume.drive3D.byteOffset + base * 4, sliceVoxels);
                const gateBits = new Uint32Array(volume.gate3D.buffer, volume.gate3D.byteOffset + base * 4, sliceVoxels);
                for (let i = 0, j = 0; i < sliceVoxels; i++) {
                  out[j++] = float32BitsToFloat16Bits(driveBits[i] ?? 0);
                  out[j++] = float32BitsToFloat16Bits(gateBits[i] ?? 0);
                }
                gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, dims[0], dims[1], 1, gl.RG, gl.HALF_FLOAT, out);
              } else {
                if (!upload.scratchF32 || upload.scratchF32.length !== sliceVoxels * 2) {
                  upload.scratchF32 = new Float32Array(sliceVoxels * 2);
                }
                const out = upload.scratchF32;
                for (let i = 0, j = 0; i < sliceVoxels; i++) {
                  const dv = volume.drive3D[base + i];
                  const gv = volume.gate3D[base + i];
                  out[j++] = Number.isFinite(dv) ? dv : 0;
                  out[j++] = Number.isFinite(gv) ? gv : 0;
                }
                gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, dims[0], dims[1], 1, gl.RG, gl.FLOAT, out);
              }
              upload.nextSlice++;
            }
            gl.bindTexture(gl.TEXTURE_3D, null);
          } else {
            if (!this.volumeTex || !this.gateVolumeTex) return;
            for (let step = 0; step < slicesThisTick; step++) {
              const z = upload.nextSlice;
              const base = z * sliceVoxels;
              const end = base + sliceVoxels;
              gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
              gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, dims[0], dims[1], 1, gl.RED, gl.FLOAT, volume.drive3D.subarray(base, end));
              gl.bindTexture(gl.TEXTURE_3D, this.gateVolumeTex);
              gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, dims[0], dims[1], 1, gl.RED, gl.FLOAT, volume.gate3D.subarray(base, end));
              upload.nextSlice++;
            }
            gl.bindTexture(gl.TEXTURE_3D, null);
          }
        } else if (upload.format.backend === "atlas2d") {
          const atlasLayout = upload.format.atlas;
          if (!atlasLayout || !this.latticeAtlasTex) return;
          if (!upload.format.packedRG) return;

          gl.bindTexture(gl.TEXTURE_2D, this.latticeAtlasTex);
          for (let step = 0; step < slicesThisTick; step++) {
            const z = upload.nextSlice;
            const base = z * sliceVoxels;
            const tileX = z % atlasLayout.tilesX;
            const tileY = Math.floor(z / atlasLayout.tilesX);
            const x0 = tileX * dims[0];
            const y0 = tileY * dims[1];
            if (upload.format.type === gl.HALF_FLOAT) {
              if (!upload.scratchU16 || upload.scratchU16.length !== sliceVoxels * 2) {
                upload.scratchU16 = new Uint16Array(sliceVoxels * 2);
              }
              const out = upload.scratchU16;
              const driveBits = new Uint32Array(volume.drive3D.buffer, volume.drive3D.byteOffset + base * 4, sliceVoxels);
              const gateBits = new Uint32Array(volume.gate3D.buffer, volume.gate3D.byteOffset + base * 4, sliceVoxels);
              for (let i = 0, j = 0; i < sliceVoxels; i++) {
                out[j++] = float32BitsToFloat16Bits(driveBits[i] ?? 0);
                out[j++] = float32BitsToFloat16Bits(gateBits[i] ?? 0);
              }
              gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, dims[0], dims[1], gl.RG, gl.HALF_FLOAT, out);
            } else {
              if (!upload.scratchF32 || upload.scratchF32.length !== sliceVoxels * 2) {
                upload.scratchF32 = new Float32Array(sliceVoxels * 2);
              }
              const out = upload.scratchF32;
              for (let i = 0, j = 0; i < sliceVoxels; i++) {
                const dv = volume.drive3D[base + i];
                const gv = volume.gate3D[base + i];
                out[j++] = Number.isFinite(dv) ? dv : 0;
                out[j++] = Number.isFinite(gv) ? gv : 0;
              }
              gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, dims[0], dims[1], gl.RG, gl.FLOAT, out);
            }
            upload.nextSlice++;
          }
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
      }

      if (upload.nextSlice >= upload.dims[2]) {
        this.lastVolumeKey = volume.hash;
        this.hasVolume = true;
        this.latticeVolumeReadyKey = upload.hash;
        upload.scratchF32 = undefined;
        upload.scratchU16 = undefined;
      }

      return;
    }

    this.latticeUpload = null;
    this.latticeVolumeReadyKey = null;
    this.latticeUploadFailedHash = null;
    this.latticeUploadFailedReason = null;
    this.latticeUploadFormatReason = null;
    this.latticeUploadTelemetry = null;

    // PERFORMANCE: shader is analytic via radial LUT; keep a tiny placeholder texture once.
    if (this.hasVolume && this.lastVolumeKey === "ANALYTIC") return;

    const { gl } = this;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const data = new Float32Array([0]);

    if (this.volumeTex) {
      gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, 1, 1, 1, 0, gl.RED, gl.FLOAT, data);
      gl.bindTexture(gl.TEXTURE_3D, null);
    }

    if (this.gateVolumeTex) {
      gl.bindTexture(gl.TEXTURE_3D, this.gateVolumeTex);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, 1, 1, 1, 0, gl.RED, gl.FLOAT, data);
      gl.bindTexture(gl.TEXTURE_3D, null);
    }

    if (this.latticeAtlasTex) {
      try {
        gl.deleteTexture(this.latticeAtlasTex);
      } catch {}
      this.latticeAtlasTex = null;
    }

    this.lastVolumeKey = "ANALYTIC";
    this.hasVolume = true;
  }







  private updateLatticeSdf(state: Hull3DRendererState) {
    const sdfGrid = state.latticeSdf;
    const latticeVolume = state.latticeVolume;
    const activeLattice =
      latticeVolume && this.latticeUpload && this.latticeUpload.hash === latticeVolume.hash
        ? this.latticeUpload
        : null;

    if (!sdfGrid || !activeLattice) {
      this.latticeSdfUpload = null;
      this.latticeSdfUploadFailedKey = null;
      this.latticeSdfUploadFailedReason = null;
      this.latticeSdfReadyKey = null;
      return;
    }

    const key = sdfGrid.key;
    const dims: [number, number, number] = [
      Math.max(1, activeLattice.dims[0]),
      Math.max(1, activeLattice.dims[1]),
      Math.max(1, activeLattice.dims[2]),
    ];
    if (sdfGrid.dims[0] !== dims[0] || sdfGrid.dims[1] !== dims[1] || sdfGrid.dims[2] !== dims[2]) {
      this.latticeSdfUpload = null;
      this.latticeSdfUploadFailedKey = null;
      this.latticeSdfUploadFailedReason = null;
      this.latticeSdfReadyKey = null;
      return;
    }

    const backend = activeLattice.format.backend;
    const atlasLayout = activeLattice.format.atlas;

    const shouldRestart =
      !this.latticeSdfUpload ||
      this.latticeSdfUpload.key !== key ||
      this.latticeSdfUpload.backend !== backend ||
      this.latticeSdfUpload.dims[0] !== dims[0] ||
      this.latticeSdfUpload.dims[1] !== dims[1] ||
      this.latticeSdfUpload.dims[2] !== dims[2];

    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { gl } = this;

    if (shouldRestart) {
      if (this.latticeSdfUploadFailedKey === key) return;

      const data = encodeHullDistanceTsdfRG8(sdfGrid);

      let allocated = false;
      if (backend === "tex3d") {
        if (!this.latticeSdfTex) this.latticeSdfTex = createTexture3D(gl);
        clearGlErrors(gl);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_3D, this.latticeSdfTex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG8, dims[0], dims[1], dims[2], 0, gl.RG, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_3D, null);
        allocated = gl.getError() === gl.NO_ERROR;
      } else {
        if (!atlasLayout) {
          this.latticeSdfUpload = null;
          this.latticeSdfUploadFailedKey = key;
          this.latticeSdfUploadFailedReason = "caps:maxTextureSize";
          this.latticeSdfReadyKey = null;
          return;
        }
        if (!this.latticeSdfAtlasTex) {
          const tex = gl.createTexture();
          if (!tex) {
            this.latticeSdfUpload = null;
            this.latticeSdfUploadFailedKey = key;
            this.latticeSdfUploadFailedReason = "alloc-failed";
            this.latticeSdfReadyKey = null;
            return;
          }
          this.latticeSdfAtlasTex = tex;
        }
        clearGlErrors(gl);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_2D, this.latticeSdfAtlasTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RG8,
          atlasLayout.width,
          atlasLayout.height,
          0,
          gl.RG,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
        allocated = gl.getError() === gl.NO_ERROR;
      }

      if (!allocated) {
        this.latticeSdfUpload = null;
        this.latticeSdfUploadFailedKey = key;
        this.latticeSdfUploadFailedReason = "format:unsupported";
        this.latticeSdfReadyKey = null;
        return;
      }

      this.latticeSdfUploadFailedKey = null;
      this.latticeSdfUploadFailedReason = null;
      this.latticeSdfReadyKey = null;
      this.latticeSdfUpload = {
        key,
        dims,
        backend,
        nextSlice: 0,
        lastUploadAtMs: nowMs,
        atlas: atlasLayout,
        data,
      };
    }

    const upload = this.latticeSdfUpload;
    if (!upload || upload.key !== key || !upload.data) return;
    if (upload.nextSlice >= upload.dims[2]) return;

    const sliceVoxels = dims[0] * dims[1];
    const sliceBytes = Math.max(1, sliceVoxels * 2); // RG8
    const profileTag = state.latticeProfileTag ?? "preview";
    const rails = latticeRailsForProfile(profileTag);
    const mbps = LATTICE_UPLOAD_BUDGET_MBPS[profileTag] ?? LATTICE_UPLOAD_BUDGET_MBPS.preview;
    const bytesPerSec = mbps * 1024 * 1024;
    const dtRaw = (nowMs - upload.lastUploadAtMs) / 1000;
    const dtSec = Math.min(
      LATTICE_UPLOAD_MAX_DT_SEC,
      Math.max(1 / 240, Number.isFinite(dtRaw) && dtRaw > 0 ? dtRaw : 1 / 60),
    );
    upload.lastUploadAtMs = nowMs;

    let budgetBytes = bytesPerSec * dtSec;
    if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) budgetBytes = sliceBytes;
    if (budgetBytes < sliceBytes) budgetBytes = sliceBytes;

    const maxSlicesPerTick = rails.maxSlicesPerTickSdf;
    const slicesThisTick = Math.min(
      maxSlicesPerTick,
      Math.max(1, Math.floor(budgetBytes / sliceBytes) || 1),
      upload.dims[2] - upload.nextSlice,
    );

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const sliceStride = sliceVoxels * 2;
    if (backend === "tex3d") {
      if (!this.latticeSdfTex) return;
      gl.bindTexture(gl.TEXTURE_3D, this.latticeSdfTex);
      for (let step = 0; step < slicesThisTick; step++) {
        const z = upload.nextSlice;
        const base = z * sliceStride;
        const end = base + sliceStride;
        gl.texSubImage3D(
          gl.TEXTURE_3D,
          0,
          0,
          0,
          z,
          dims[0],
          dims[1],
          1,
          gl.RG,
          gl.UNSIGNED_BYTE,
          upload.data.subarray(base, end),
        );
        upload.nextSlice++;
      }
      gl.bindTexture(gl.TEXTURE_3D, null);
    } else {
      const atlas = upload.atlas;
      if (!atlas || !this.latticeSdfAtlasTex) return;
      gl.bindTexture(gl.TEXTURE_2D, this.latticeSdfAtlasTex);
      for (let step = 0; step < slicesThisTick; step++) {
        const z = upload.nextSlice;
        const base = z * sliceStride;
        const end = base + sliceStride;
        const tileX = z % atlas.tilesX;
        const tileY = Math.floor(z / atlas.tilesX);
        const x0 = tileX * dims[0];
        const y0 = tileY * dims[1];
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          x0,
          y0,
          dims[0],
          dims[1],
          gl.RG,
          gl.UNSIGNED_BYTE,
          upload.data.subarray(base, end),
        );
        upload.nextSlice++;
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    if (upload.nextSlice >= upload.dims[2]) {
      this.latticeSdfReadyKey = upload.key;
      upload.data = undefined;
    }
  }

  private updateLatticeDfdr(state: Hull3DRendererState) {
    const spaceCfg = state.overlays?.spacetimeGrid ?? null;
    const fieldSource =
      spaceCfg?.fieldSource ?? this.spacetimeGridState.fieldSource ?? "volume";
    const warpField =
      spaceCfg?.warpField ?? this.spacetimeGridState.warpField ?? "dfdr";
    const wantsDfdr = !!(
      spaceCfg?.enabled &&
      spaceCfg.mode === "volume" &&
      fieldSource === "volume" &&
      warpField === "dfdr"
    );
    if (!wantsDfdr) return;

    const volume = state.latticeVolume;
    const activeLattice =
      volume && this.latticeUpload && this.latticeUpload.hash === volume.hash
        ? this.latticeUpload
        : null;
    if (!volume || !activeLattice) {
      this.latticeDfdrUpload = null;
      this.latticeDfdrReadyKey = null;
      return;
    }

    const dims: [number, number, number] = [
      Math.max(1, activeLattice.dims[0]),
      Math.max(1, activeLattice.dims[1]),
      Math.max(1, activeLattice.dims[2]),
    ];
    const voxelCount = dims[0] * dims[1] * dims[2];
    if (!volume.dfdr3D || volume.dfdr3D.length !== voxelCount) {
      this.latticeDfdrUpload = null;
      this.latticeDfdrReadyKey = null;
      return;
    }

    const { gl } = this;
    const backend = activeLattice.format.backend;
    const atlasLayout = activeLattice.format.atlas;
    const useHalf = activeLattice.format.type === gl.HALF_FLOAT;
    const type = useHalf ? gl.HALF_FLOAT : gl.FLOAT;
    const internalFormat = useHalf ? gl.R16F : gl.R32F;
    const format = gl.RED;
    const filter = useHalf
      ? this.supportsHalfFloatLinear
        ? gl.LINEAR
        : gl.NEAREST
      : this.supportsFloatLinear
        ? gl.LINEAR
        : gl.NEAREST;

    const shouldRestart =
      !this.latticeDfdrUpload ||
      this.latticeDfdrUpload.hash !== volume.hash ||
      this.latticeDfdrUpload.backend !== backend ||
      this.latticeDfdrUpload.dims[0] !== dims[0] ||
      this.latticeDfdrUpload.dims[1] !== dims[1] ||
      this.latticeDfdrUpload.dims[2] !== dims[2] ||
      this.latticeDfdrUpload.type !== type ||
      this.latticeDfdrUpload.internalFormat !== internalFormat;

    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (shouldRestart) {
      if (this.latticeDfdrUploadFailedHash === volume.hash) return;

      let allocated = false;
      if (backend === "tex3d") {
        if (!this.latticeDfdrTex) this.latticeDfdrTex = createTexture3D(gl);
        clearGlErrors(gl);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_3D, this.latticeDfdrTex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(
          gl.TEXTURE_3D,
          0,
          internalFormat,
          dims[0],
          dims[1],
          dims[2],
          0,
          format,
          type,
          null,
        );
        gl.bindTexture(gl.TEXTURE_3D, null);
        allocated = gl.getError() === gl.NO_ERROR;
      } else {
        if (!atlasLayout) {
          this.latticeDfdrUpload = null;
          this.latticeDfdrUploadFailedHash = volume.hash;
          this.latticeDfdrUploadFailedReason = "caps:maxTextureSize";
          this.latticeDfdrReadyKey = null;
          return;
        }
        if (!this.latticeDfdrAtlasTex) {
          const tex = gl.createTexture();
          if (!tex) {
            this.latticeDfdrUpload = null;
            this.latticeDfdrUploadFailedHash = volume.hash;
            this.latticeDfdrUploadFailedReason = "alloc-failed";
            this.latticeDfdrReadyKey = null;
            return;
          }
          this.latticeDfdrAtlasTex = tex;
        }
        clearGlErrors(gl);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_2D, this.latticeDfdrAtlasTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          internalFormat,
          atlasLayout.width,
          atlasLayout.height,
          0,
          format,
          type,
          null,
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
        allocated = gl.getError() === gl.NO_ERROR;
      }

      if (!allocated) {
        this.latticeDfdrUpload = null;
        this.latticeDfdrUploadFailedHash = volume.hash;
        this.latticeDfdrUploadFailedReason = "format:unsupported";
        this.latticeDfdrReadyKey = null;
        return;
      }

      this.latticeDfdrUploadFailedHash = null;
      this.latticeDfdrUploadFailedReason = null;
      this.latticeDfdrReadyKey = null;
      this.latticeDfdrUpload = {
        hash: volume.hash,
        dims,
        backend,
        internalFormat,
        format,
        type,
        filter,
        nextSlice: 0,
        lastUploadAtMs: nowMs,
        atlas: atlasLayout,
      };
    }

    const upload = this.latticeDfdrUpload;
    if (!upload || upload.hash !== volume.hash) return;
    if (upload.nextSlice >= upload.dims[2]) return;

    const sliceVoxels = dims[0] * dims[1];
    const bytesPerComponent = upload.type === gl.HALF_FLOAT ? 2 : 4;
    const sliceBytes = Math.max(1, sliceVoxels * bytesPerComponent);
    const profileTag = state.latticeProfileTag ?? "preview";
    const rails = latticeRailsForProfile(profileTag);
    const mbps = LATTICE_UPLOAD_BUDGET_MBPS[profileTag] ?? LATTICE_UPLOAD_BUDGET_MBPS.preview;
    const bytesPerSec = mbps * 1024 * 1024;
    const dtRaw = (nowMs - upload.lastUploadAtMs) / 1000;
    const dtSec = Math.min(
      LATTICE_UPLOAD_MAX_DT_SEC,
      Math.max(1 / 240, Number.isFinite(dtRaw) && dtRaw > 0 ? dtRaw : 1 / 60),
    );
    upload.lastUploadAtMs = nowMs;

    let budgetBytes = bytesPerSec * dtSec;
    if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) budgetBytes = sliceBytes;
    if (budgetBytes < sliceBytes) budgetBytes = sliceBytes;

    const maxSlicesPerTick = rails.maxSlicesPerTickVolume;
    const slicesThisTick = Math.min(
      maxSlicesPerTick,
      Math.max(1, Math.floor(budgetBytes / sliceBytes) || 1),
      upload.dims[2] - upload.nextSlice,
    );

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (upload.backend === "tex3d") {
      if (!this.latticeDfdrTex) return;
      gl.bindTexture(gl.TEXTURE_3D, this.latticeDfdrTex);
      for (let step = 0; step < slicesThisTick; step++) {
        const z = upload.nextSlice;
        const base = z * sliceVoxels;
        const end = base + sliceVoxels;
        if (upload.type === gl.HALF_FLOAT) {
          if (!upload.scratchU16 || upload.scratchU16.length !== sliceVoxels) {
            upload.scratchU16 = new Uint16Array(sliceVoxels);
          }
          const out = upload.scratchU16;
          const dfdrBits = new Uint32Array(volume.dfdr3D.buffer, volume.dfdr3D.byteOffset + base * 4, sliceVoxels);
          for (let i = 0; i < sliceVoxels; i++) {
            out[i] = float32BitsToFloat16Bits(dfdrBits[i] ?? 0);
          }
          gl.texSubImage3D(
            gl.TEXTURE_3D,
            0,
            0,
            0,
            z,
            dims[0],
            dims[1],
            1,
            gl.RED,
            gl.HALF_FLOAT,
            out,
          );
        } else {
          gl.texSubImage3D(
            gl.TEXTURE_3D,
            0,
            0,
            0,
            z,
            dims[0],
            dims[1],
            1,
            gl.RED,
            gl.FLOAT,
            volume.dfdr3D.subarray(base, end),
          );
        }
        upload.nextSlice++;
      }
      gl.bindTexture(gl.TEXTURE_3D, null);
    } else {
      const atlas = upload.atlas;
      if (!atlas || !this.latticeDfdrAtlasTex) return;
      gl.bindTexture(gl.TEXTURE_2D, this.latticeDfdrAtlasTex);
      for (let step = 0; step < slicesThisTick; step++) {
        const z = upload.nextSlice;
        const base = z * sliceVoxels;
        const end = base + sliceVoxels;
        const tileX = z % atlas.tilesX;
        const tileY = Math.floor(z / atlas.tilesX);
        const x0 = tileX * dims[0];
        const y0 = tileY * dims[1];
        if (upload.type === gl.HALF_FLOAT) {
          if (!upload.scratchU16 || upload.scratchU16.length !== sliceVoxels) {
            upload.scratchU16 = new Uint16Array(sliceVoxels);
          }
          const out = upload.scratchU16;
          const dfdrBits = new Uint32Array(volume.dfdr3D.buffer, volume.dfdr3D.byteOffset + base * 4, sliceVoxels);
          for (let i = 0; i < sliceVoxels; i++) {
            out[i] = float32BitsToFloat16Bits(dfdrBits[i] ?? 0);
          }
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            x0,
            y0,
            dims[0],
            dims[1],
            gl.RED,
            gl.HALF_FLOAT,
            out,
          );
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            x0,
            y0,
            dims[0],
            dims[1],
            gl.RED,
            gl.FLOAT,
            volume.dfdr3D.subarray(base, end),
          );
        }
        upload.nextSlice++;
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    if (upload.nextSlice >= upload.dims[2]) {
      this.latticeDfdrReadyKey = upload.hash;
      upload.scratchF32 = undefined;
      upload.scratchU16 = undefined;
    }
  }

  private updateRingAverage(state: Hull3DRendererState) {



    const now = performance.now();



    const sinceLast = this.lastAvgUpdate === 0 ? Number.POSITIVE_INFINITY : now - this.lastAvgUpdate;



    if (sinceLast < AVG_UPDATE_INTERVAL_MS) return;



    const dtMs = this.lastAvgUpdate === 0 ? AVG_UPDATE_INTERVAL_MS : sinceLast;



    this.lastAvgUpdate = now;



    const dbgPhaseSign = (typeof window !== "undefined" && (window as any).__hullPhaseSign === -1) ? -1 : 1;



    const phaseSign = (Math.sign(state.phaseSign ?? 1) || 1) * dbgPhaseSign;



    const rotated = rotateWeights(this.ringInstantLUT, phaseSign * state.phase01);



    if (!this.ringAvgSeeded) {



      // Seed average with the current rotated instant to avoid black frames in Average mode



      this.ringAverageLUT.set(rotated);



      this.ringAvgSeeded = true;



    } else {



      const safeAlpha = clamp(this.emaAlpha, 1e-4, 0.999);



      const denom = Math.max(1e-6, -Math.log1p(-safeAlpha));



      const baseTauMs = AVG_UPDATE_INTERVAL_MS / denom;



      const tauMs = baseTauMs * (this.mode === "instant" ? 2 : 1);



      const alpha = 1 - Math.exp(-dtMs / Math.max(1e-3, tauMs));



      const alphaClamped = clamp(alpha, 0, 1);



      for (let i = 0; i < this.ringAverageLUT.length; i++) {



        const prev = this.ringAverageLUT[i];



        const next = rotated[i];



        this.ringAverageLUT[i] = prev + (next - prev) * alphaClamped;



      }



    }



    if (this.ringAverageTex) {



      const { gl } = this;



      gl.bindTexture(gl.TEXTURE_2D, this.ringAverageTex);



      if (!this.ringAverageTexAllocated) {



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, RING_SIZE, 1, 0, gl.RED, gl.FLOAT, null);



        this.ringAverageTexAllocated = true;



      }



      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RING_SIZE, 1, gl.RED, gl.FLOAT, this.ringAverageLUT);



      gl.bindTexture(gl.TEXTURE_2D, null);



    }



  }







  private ensureOverlayGeometry(state: Hull3DRendererState) {



    const { gl } = this;



    const keyFrom = (...values: number[]) =>



      values.map((v) => Math.round((Number.isFinite(v) ? v : 0) * 1e4)).join("|");







    const ringKey = keyFrom(state.R, state.axes[0], state.axes[2]);



    if (this.overlayCache.ringKey !== ringKey) {



      if (this.overlay.ringVao) gl.deleteVertexArray(this.overlay.ringVao);



      if (this.overlay.ringVbo) gl.deleteBuffer(this.overlay.ringVbo);



      this.overlay.ringVao = null;



      this.overlay.ringVbo = null;







      this.overlay.ringVertexCount = 0;



      const segments = 256;



      const stride = 5;



      const vertexPairs = segments + 1;



      const vertexCount = vertexPairs * 2;



      const ringVerts = new Float32Array(vertexCount * stride);



      const radiusX = Math.max(Math.abs(state.axes[0]) * state.R, 1e-3);



      const radiusZ = Math.max(Math.abs(state.axes[2]) * state.R, 1e-3);



      const belt = 0.015;



      const outerScale = 1 + belt;



      const innerScale = Math.max(0.01, 1 - belt);



      const vao = gl.createVertexArray();



      const vbo = gl.createBuffer();



      if (vao && vbo) {



        for (let i = 0; i <= segments; i++) {



          const theta01 = i / segments;



          const angle = theta01 * TWO_PI;



          const cosT = Math.cos(angle);



          const sinT = Math.sin(angle);



          const outerBase = i * 2 * stride;



          const innerBase = outerBase + stride;



          ringVerts[outerBase + 0] = cosT * radiusX * outerScale;



          ringVerts[outerBase + 1] = 0;



          ringVerts[outerBase + 2] = sinT * radiusZ * outerScale;



          ringVerts[outerBase + 3] = theta01;



          ringVerts[outerBase + 4] = 1;



          ringVerts[innerBase + 0] = cosT * radiusX * innerScale;



          ringVerts[innerBase + 1] = 0;



          ringVerts[innerBase + 2] = sinT * radiusZ * innerScale;



          ringVerts[innerBase + 3] = theta01;



          ringVerts[innerBase + 4] = 0;



        }



        gl.bindVertexArray(vao);



        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);



        gl.bufferData(gl.ARRAY_BUFFER, ringVerts, gl.STATIC_DRAW);



        const strideBytes = stride * 4;



        gl.enableVertexAttribArray(0);



        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, strideBytes, 0);



        gl.enableVertexAttribArray(1);



        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, strideBytes, 3 * 4);



        gl.bindVertexArray(null);



        this.overlay.ringVao = vao;



        this.overlay.ringVbo = vbo;



        this.overlay.ringVertexCount = vertexCount;



        this.overlayCache.ringKey = ringKey;



      }



    }







    const sliceScale = Math.max(1.05, this.domainScale);

    const sliceKey = keyFrom(state.R, state.axes[0], state.axes[2], sliceScale);



    if (this.overlayCache.sliceKey !== sliceKey) {



      if (this.overlay.sliceVao) gl.deleteVertexArray(this.overlay.sliceVao);



      if (this.overlay.sliceVbo) gl.deleteBuffer(this.overlay.sliceVbo);



      if (this.overlay.sliceEbo) gl.deleteBuffer(this.overlay.sliceEbo);



      this.overlay.sliceVao = null;



      this.overlay.sliceVbo = null;



      this.overlay.sliceEbo = null;







      const w = Math.max(Math.abs(state.axes[0]) * state.R, 1e-3) * sliceScale;



      const h = Math.max(Math.abs(state.axes[2]) * state.R, 1e-3) * sliceScale;



      const verts = new Float32Array([



        -w, 0, -h,



         w, 0, -h,



         w, 0,  h,



        -w, 0,  h,



      ]);



      const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);



      const vao = gl.createVertexArray();



      const vbo = gl.createBuffer();



      const ebo = gl.createBuffer();



      if (vao && vbo && ebo) {



        gl.bindVertexArray(vao);



        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);



        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);



        gl.enableVertexAttribArray(0);



        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);



        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);



        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);



        gl.bindVertexArray(null);



        this.overlay.sliceVao = vao;



        this.overlay.sliceVbo = vbo;



        this.overlay.sliceEbo = ebo;



        this.overlayCache.sliceKey = sliceKey;



      }



    }







    const wireKey = keyFrom(state.R, state.axes[0], state.axes[1], state.axes[2]);



    if (this.overlayCache.wireKey !== wireKey) {



      if (this.overlay.wireframeVao) gl.deleteVertexArray(this.overlay.wireframeVao);



      if (this.overlay.wireframeVbo) gl.deleteBuffer(this.overlay.wireframeVbo);



      this.overlay.wireframeVao = null;



      this.overlay.wireframeVbo = null;







      const segments = 96;



      const verts = new Float32Array(segments * 6);



      const ax = Math.max(Math.abs(state.axes[0]) * state.R, 1e-3);



      const az = Math.max(Math.abs(state.axes[2]) * state.R, 1e-3);



      for (let i = 0; i < segments; i++) {



        const t = (i / segments) * TWO_PI;



        const n = ((i + 1) % segments) / segments * TWO_PI;



        const base = i * 6;



        verts[base + 0] = ax * Math.cos(t);



        verts[base + 1] = 0;



        verts[base + 2] = az * Math.sin(t);



        verts[base + 3] = ax * Math.cos(n);



        verts[base + 4] = 0;



        verts[base + 5] = az * Math.sin(n);



      }



      const vao = gl.createVertexArray();



      const vbo = gl.createBuffer();



      if (vao && vbo) {



        gl.bindVertexArray(vao);



        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);



        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);



        gl.enableVertexAttribArray(0);



        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);



        gl.bindVertexArray(null);



        this.overlay.wireframeVao = vao;



        this.overlay.wireframeVbo = vbo;



        this.overlayCache.wireKey = wireKey;



      }



    }



    const meshWire = state.wireframeOverlay;



    const meshWireKey = meshWire?.key ?? "";



    if (this.overlayCache.meshWireKey !== meshWireKey) {



      if (this.overlay.meshWireVao) gl.deleteVertexArray(this.overlay.meshWireVao);



      if (this.overlay.meshWireVbo) gl.deleteBuffer(this.overlay.meshWireVbo);



      if (this.overlay.meshWireColorVbo) gl.deleteBuffer(this.overlay.meshWireColorVbo);



      this.overlay.meshWireVao = null;



      this.overlay.meshWireVbo = null;



      this.overlay.meshWireColorVbo = null;



      this.overlay.meshWireColors = null;



      this.overlay.meshWirePatches = [];



      this.overlay.meshWireCount = 0;



      this.overlayCache.meshWireColorKey = "";



      if (meshWire && meshWire.positions?.length >= 6) {



        const vao = gl.createVertexArray();



        const vbo = gl.createBuffer();



        const cbo = gl.createBuffer();



        if (vao && vbo && cbo) {



          gl.bindVertexArray(vao);



          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);



          gl.bufferData(gl.ARRAY_BUFFER, meshWire.positions, gl.STATIC_DRAW);



          gl.enableVertexAttribArray(0);



          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);



          gl.bindBuffer(gl.ARRAY_BUFFER, cbo);



          const colorStub =



            meshWire.colors && meshWire.colors.length === meshWire.positions.length



              ? meshWire.colors



              : new Float32Array(meshWire.positions.length);



          gl.bufferData(gl.ARRAY_BUFFER, colorStub, gl.DYNAMIC_DRAW);



          gl.enableVertexAttribArray(1);



          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);



          gl.bindVertexArray(null);



          this.overlay.meshWireVao = vao;



          this.overlay.meshWireVbo = vbo;



          this.overlay.meshWireColorVbo = cbo;



          this.overlay.meshWireCount = meshWire.positions.length / 3;



          this.overlayCache.meshWireKey = meshWireKey;



        }



      } else {



        this.overlayCache.meshWireKey = meshWireKey;



      }



    }



    this.ensurePreviewMesh(state);

  }










  private ensureFluxStreamlines(state: Hull3DRendererState) {
    const cfg = state.fluxStreamlines;
    const enabled = Boolean(cfg?.enabled);
    if (!enabled || !this.fluxField) {
      this.overlay.fluxStreamCount = 0;
      this.overlay.fluxStreamAlpha = 0;
      if (!enabled) this.overlayCache.fluxStreamKey = "";
      return;
    }

    const clampInt = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(value)));
    const seedCountRaw = Number(cfg?.seedCount ?? 56);
    const seedCount = clampInt(Number.isFinite(seedCountRaw) ? seedCountRaw : 56, 8, 256);
    const seedRadiusRaw = Number(cfg?.seedRadius ?? 1.0);
    const seedRadius = clamp(Number.isFinite(seedRadiusRaw) ? seedRadiusRaw : 1.0, 0.2, 1.5);
    const seedSpreadRaw = Number(cfg?.seedSpread ?? 0.08);
    const seedSpread = clamp(Number.isFinite(seedSpreadRaw) ? seedSpreadRaw : 0.08, 0, 0.4);
    const stepCountRaw = Number(cfg?.stepCount ?? 42);
    const stepCount = clampInt(Number.isFinite(stepCountRaw) ? stepCountRaw : 42, 6, 200);
    const stepScaleRaw = Number(cfg?.stepScale ?? 0.045);
    const stepScale = clamp(Number.isFinite(stepScaleRaw) ? stepScaleRaw : 0.045, 0.005, 0.25);
    const minSpeedRaw = Number(cfg?.minSpeedFraction ?? 0.02);
    const minSpeedFraction = clamp(Number.isFinite(minSpeedRaw) ? minSpeedRaw : 0.02, 0.001, 0.2);
    const bidirectional = cfg?.bidirectional !== false;
    const seed = Number.isFinite(Number(cfg?.seed))
      ? Math.floor(Number(cfg?.seed))
      : this.fluxField.version;

    const axes = state.axes;
    const domainScale = this.domainScale;
    const bounds: [number, number, number] = [
      Math.max(1e-4, Math.abs(axes[0]) * domainScale),
      Math.max(1e-4, Math.abs(axes[1]) * domainScale),
      Math.max(1e-4, Math.abs(axes[2]) * domainScale),
    ];
    const shellScale = Math.max(1e-4, Math.abs(state.R ?? 1));
    const shellAxes: [number, number, number] = [
      Math.max(1e-4, Math.abs(axes[0]) * shellScale),
      Math.max(1e-4, Math.abs(axes[1]) * shellScale),
      Math.max(1e-4, Math.abs(axes[2]) * shellScale),
    ];

    const keyParts = [
      this.fluxField.version,
      seedCount,
      seedRadius.toFixed(3),
      seedSpread.toFixed(3),
      stepCount,
      stepScale.toFixed(3),
      minSpeedFraction.toFixed(3),
      bidirectional ? 1 : 0,
      bounds.map((v) => v.toFixed(3)).join(","),
      shellAxes.map((v) => v.toFixed(3)).join(","),
    ];
    const key = keyParts.join("|");
    if (this.overlayCache.fluxStreamKey === key) {
      return;
    }
    this.overlayCache.fluxStreamKey = key;

    const settings: FluxStreamlineSettings = {
      bounds,
      shellAxes,
      seedCount,
      seedRadius,
      seedSpread,
      stepCount,
      stepScale,
      minSpeedFraction,
      bidirectional,
      seed,
    };
    const result = buildFluxStreamlines(this.fluxField, settings);

    const avgMag = (this.fluxField as any).avgMag ?? 0;
    const maxMag = this.fluxField.maxMag ?? 0;
    const strength = maxMag > 0 ? clamp(avgMag / maxMag, 0, 1) : 0;
    this.overlay.fluxStreamAlpha = clamp(0.12 + strength * 0.8, 0.06, 0.85);

    const { gl } = this;
    if (!this.overlay.fluxStreamVao || !this.overlay.fluxStreamVbo) {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      if (vao && vbo) {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, result.positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.overlay.fluxStreamVao = vao;
        this.overlay.fluxStreamVbo = vbo;
      }
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.fluxStreamVbo);
      gl.bufferData(gl.ARRAY_BUFFER, result.positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    this.overlay.fluxStreamCount = result.vertexCount;
  }

  private ensureObserverDirectionOverlay(state: Hull3DRendererState) {
    const enabled = this.observerDirectionOverlay.enabled === true;
    if (!enabled || !this.t00Raw || !this.fluxField) {
      this.overlay.observerDirectionCount = 0;
      this.overlay.observerDirectionAlpha = 0;
      if (!enabled) this.overlayCache.observerDirectionKey = "";
      return;
    }

    const dims = this.t00Raw.dims;
    if (this.fluxField.dims.join("x") !== dims.join("x")) {
      this.overlay.observerDirectionCount = 0;
      this.overlay.observerDirectionAlpha = 0;
      return;
    }
    const observerRobust = this.t00Raw.stats?.observerRobust;
    if (!observerRobust) {
      this.overlay.observerDirectionCount = 0;
      this.overlay.observerDirectionAlpha = 0;
      return;
    }

    const stride = Math.max(1, Math.round(this.observerDirectionOverlay.stride ?? 4));
    const decDirectionMode = this.observerDirectionOverlay.decDirectionMode === "global" ? "global" : "local";
    const maskMode = this.observerDirectionOverlay.maskMode === "all" || this.observerDirectionOverlay.maskMode === "missed"
      ? this.observerDirectionOverlay.maskMode
      : "violating";
    const minMagnitudeRaw = Number(this.observerDirectionOverlay.minMagnitude ?? 0);
    const minMagnitude = Number.isFinite(minMagnitudeRaw) ? Math.max(0, minMagnitudeRaw) : 0;
    const key = [
      this.t00Raw.version,
      this.fluxField.version,
      this.observerSelection.condition,
      stride,
      decDirectionMode,
      maskMode,
      minMagnitude.toFixed(6),
      dims.join("x"),
    ].join("|");
    if (this.overlayCache.observerDirectionKey === key) return;
    this.overlayCache.observerDirectionKey = key;

    const expected = dims[0] * dims[1] * dims[2];
    const directionField = buildObserverDirectionField(
      {
        dims,
        t00: { data: this.t00Raw.t00, min: this.t00Raw.min ?? 0, max: this.t00Raw.max ?? 0 },
        flux: {
          Sx: { data: this.fluxField.Sx, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
          Sy: { data: this.fluxField.Sy, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
          Sz: { data: this.fluxField.Sz, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
          divS: { data: new Float32Array(expected), min: 0, max: 0 },
        },
        stats: { observerRobust } as any,
      } as any,
      this.observerSelection.condition,
      {
        enabled: true,
        stride,
        decDirectionMode,
        maskMode,
        minMagnitude,
      },
    );
    if (!directionField) {
      this.overlay.observerDirectionCount = 0;
      this.overlay.observerDirectionAlpha = 0;
      return;
    }

    const [ax, ay, az] = state.axes;
    const shellScale = Math.max(1e-4, Math.abs(state.R ?? 1));
    const shellAxes: [number, number, number] = [
      Math.max(1e-4, Math.abs(ax) * shellScale),
      Math.max(1e-4, Math.abs(ay) * shellScale),
      Math.max(1e-4, Math.abs(az) * shellScale),
    ];
    const nx = dims[0]; const ny = dims[1]; const nz = dims[2];
    const segments: number[] = [];
    for (let z = 0; z < nz; z += stride) {
      for (let y = 0; y < ny; y += stride) {
        for (let x = 0; x < nx; x += stride) {
          const i = x + y * nx + z * nx * ny;
          const m = directionField.mask?.[i] ?? 0;
          if (!(m > 0.5)) continue;
          const base = i * 3;
          const dx = directionField.directions[base];
          const dy = directionField.directions[base + 1];
          const dz = directionField.directions[base + 2];
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue;
          const mag = Math.hypot(dx, dy, dz);
          if (!(mag > 1e-6)) continue;
          const px = ((x / Math.max(1, nx - 1)) * 2 - 1) * shellAxes[0];
          const py = ((y / Math.max(1, ny - 1)) * 2 - 1) * shellAxes[1];
          const pz = ((z / Math.max(1, nz - 1)) * 2 - 1) * shellAxes[2];
          const len = 0.08 * Math.min(shellAxes[0], shellAxes[1], shellAxes[2]);
          segments.push(px, py, pz, px + dx * len, py + dy * len, pz + dz * len);
        }
      }
    }
    const data = new Float32Array(segments);
    this.overlay.observerDirectionAlpha = segments.length > 0 ? 0.72 : 0;

    const { gl } = this;
    if (!this.overlay.observerDirectionVao || !this.overlay.observerDirectionVbo) {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      if (vao && vbo) {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.overlay.observerDirectionVao = vao;
        this.overlay.observerDirectionVbo = vbo;
      }
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.observerDirectionVbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    this.overlay.observerDirectionCount = data.length / 3;
  }

  private updateMeshWireColors(state: Hull3DRendererState, meshWire: WireframeOverlayBuffers) {
    const { gl } = this;
    if (!this.overlay.meshWireColorVbo) return;

    const colorMode = meshWire.colorMode ?? "gate";
    if (colorMode === "field" && meshWire.colors && meshWire.colors.length === meshWire.positions.length) {
      const colorKeyField = meshWire.colorSignature ?? `${meshWire.key}|field`;
      if (this.overlayCache.meshWireColorKey !== colorKeyField) {
        this.overlay.meshWireColors = meshWire.colors;
        this.overlay.meshWirePatches = meshWire.patches ?? [];
        this.overlayCache.meshWireColorKey = colorKeyField;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.meshWireColorVbo);
        gl.bufferData(gl.ARRAY_BUFFER, meshWire.colors, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      }
      return;
    }

    const params = {
      phase01: state.phase01 ?? 0,
      sectorCenter01: state.sectorCenter01,
      gaussianSigma: state.gaussianSigma,
      totalSectors: state.totalSectors,
      liveSectors: state.liveSectors,
      sectorFloor: state.sectorFloor,
      lumpExp: state.lumpExp,
      duty: state.duty,
      gateView: Number.isFinite(state.gateView) ? state.gateView : state.gate,
      splitEnabled: state.splitEnabled,
      splitFrac: state.splitFrac,
      syncMode: state.syncMode,
      tilesPerSectorVector: state.tilesPerSectorVector,
      fieldThreshold: meshWire.fieldThreshold,
      gradientThreshold: meshWire.gradientThreshold,
    };

    const blanketKey = meshWire.blanketSignature ?? "";
    const colorKey = [
      meshWire.key,
      meshWire.colorSignature ?? "",
      Math.round((params.phase01 ?? 0) * 1000),
      Math.round((params.sectorCenter01 ?? 0) * 1000),
      Math.round((params.gaussianSigma ?? 0) * 1000),
      params.totalSectors ?? 0,
      params.liveSectors ?? 0,
      Math.round((params.sectorFloor ?? 0) * 1000),
      Math.round((params.lumpExp ?? 0) * 1000),
      params.syncMode ?? 0,
      params.splitEnabled ? 1 : 0,
      Math.round((params.splitFrac ?? 0) * 1000),
      Math.round((params.duty ?? 0) * 1000),
      Math.round((params.gateView ?? 0) * 1000),
      blanketKey,
    ].join("|");

    if (this.overlayCache.meshWireColorKey === colorKey && meshWire.colors && meshWire.colors.length) {
      return;
    }

    const { colors, patches } = colorizeWireframeOverlay(meshWire, params);
    this.overlay.meshWireColors = colors;
    this.overlay.meshWirePatches = patches ?? [];
    this.overlayCache.meshWireColorKey = colorKey;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.meshWireColorVbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private ensurePreviewMesh(state: Hull3DRendererState) {
    const { gl } = this;
    const payload = state.previewMesh;
    const key =
      payload && payload.positions && payload.positions.length >= 3
        ? payload.key || `preview|${payload.positions.length}`
        : "";

    const disposePreview = () => {
      if (this.overlay.previewVao) gl.deleteVertexArray(this.overlay.previewVao);
      if (this.overlay.previewVbo) gl.deleteBuffer(this.overlay.previewVbo);
      if (this.overlay.previewUvVbo) gl.deleteBuffer(this.overlay.previewUvVbo);
      if (this.overlay.previewIbo) gl.deleteBuffer(this.overlay.previewIbo);
      if (this.overlay.previewTexture) gl.deleteTexture(this.overlay.previewTexture);
      this.overlay.previewVao = null;
      this.overlay.previewVbo = null;
      this.overlay.previewUvVbo = null;
      this.overlay.previewIbo = null;
      this.overlay.previewTexture = null;
      this.overlay.previewCount = 0;
      this.overlay.previewIndexed = false;
      this.overlay.previewIndexType = 0;
      this.overlay.previewHasUv = false;
      this.overlay.previewColor = new Float32Array([0.82, 0.88, 0.96, 0.95]);
      this.overlayCache.previewMeshKey = "";
    };

    if (!payload || !payload.positions || payload.positions.length < 3) {
      if (this.overlayCache.previewMeshKey) {
        disposePreview();
      }
      return;
    }

    if (this.overlayCache.previewMeshKey === key) return;

    disposePreview();

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const uvbo = gl.createBuffer();
    const ibo = payload.indices && payload.indices.length >= 3 ? gl.createBuffer() : null;

    if (!vao || !vbo || !uvbo) {
      return;
    }

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, payload.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const vertexCount = Math.floor(payload.positions.length / 3);
    const hasUv = !!(payload.uvs && payload.uvs.length >= vertexCount * 2);
    const uvData = hasUv ? payload.uvs! : new Float32Array(vertexCount * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    let count = vertexCount;
    let indexed = false;
    let indexType: number | null = null;
    if (ibo && payload.indices && payload.indices.length >= 3) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, payload.indices, gl.STATIC_DRAW);
      count = payload.indices.length;
      indexed = true;
      indexType = payload.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    } else {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    gl.bindVertexArray(null);

    let tex: WebGLTexture | null = null;
    if (payload.texture) {
      tex = gl.createTexture();
      if (tex) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, payload.texture);
        } catch (err) {
          console.warn("[Hull3DRenderer] Preview mesh texture upload failed", err);
          gl.deleteTexture(tex);
          tex = null;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }

    const color = payload.color ?? [0.82, 0.88, 0.96, 0.95];

    this.overlay.previewVao = vao;
    this.overlay.previewVbo = vbo;
    this.overlay.previewUvVbo = uvbo;
    this.overlay.previewIbo = ibo;
    this.overlay.previewTexture = tex;
    this.overlay.previewCount = count;
    this.overlay.previewIndexed = indexed;
    this.overlay.previewIndexType = indexType ?? 0;
    this.overlay.previewHasUv = hasUv;
    this.overlay.previewColor = new Float32Array(color);
    this.overlayCache.previewMeshKey = key;
  }
  private ensureSurfaceGrid() {



    const { gl } = this;



    if (this.surfaceVao && this.surfaceVbo && this.surfaceRows > 0 && this.surfaceVertsPerRow > 0) return;



    const res = this.surfaceRes;



    const verts: number[] = [];



    // Degenerate triangle strips per row in [-1,1]^2



    for (let j = 0; j < res - 1; j++) {



      const v0 = -1 + (2 * j) / (res - 1);



      const v1 = -1 + (2 * (j + 1)) / (res - 1);



      for (let i = 0; i < res; i++) {



        const u = -1 + (2 * i) / (res - 1);



        verts.push(u, v0, u, v1);



      }



    }



    const data = new Float32Array(verts);



    const vao = gl.createVertexArray();



    const vbo = gl.createBuffer();



    if (!vao || !vbo) return;



    gl.bindVertexArray(vao);



    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);



    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);



    gl.enableVertexAttribArray(0);



    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);



    gl.bindVertexArray(null);



    this.surfaceVao = vao;



    this.surfaceVbo = vbo;



    this.surfaceRows = res - 1;



    this.surfaceVertsPerRow = res * 2;



  }







  private drawSurfaceGridGeometry(gl: WebGL2RenderingContext) {



    if (!this.surfaceVao) return;



    const rows = this.surfaceRows;



    const vpr = this.surfaceVertsPerRow;



    gl.bindVertexArray(this.surfaceVao);



    for (let row = 0; row < rows; row++) {



      const off = row * vpr;



      gl.drawArrays(gl.TRIANGLE_STRIP, off, vpr);



    }



    gl.bindVertexArray(null);



  }







  private ensureBetaFallbackTexture(betaMs2: number): WebGLTexture | null {



    const { gl } = this;



    if (!this.betaFallbackTex) {



      this.betaFallbackTex = gl.createTexture();



      if (!this.betaFallbackTex) return null;



      gl.bindTexture(gl.TEXTURE_2D, this.betaFallbackTex);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



    } else {



      gl.bindTexture(gl.TEXTURE_2D, this.betaFallbackTex);



    }



    const valueSafe = Number.isFinite(betaMs2) ? betaMs2 : DEFAULT_BETA_TARGET;



    if (Math.abs(this.betaFallbackValue - valueSafe) > 1e-3) {



      const data = new Float32Array([valueSafe, 0, 0, 1]);



      let uploaded = false;



      try {



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, data);



        uploaded = true;



      } catch {



        /* fall through to RGBA8 */



      }



      if (!uploaded) {



        const clamped = Math.max(0, Math.min(1, valueSafe / DEFAULT_BETA_TARGET));



        const v = Math.round(clamped * 255);



        const u8 = new Uint8Array([v, v, v, 255]);



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, u8);



      }



      this.betaFallbackValue = valueSafe;



    }



    gl.bindTexture(gl.TEXTURE_2D, null);



    return this.betaFallbackTex;



  }







  private updateDerivedHullDims(state: Hull3DRendererState) {



    const ax = Math.max(Math.abs(state.axes[0]) * state.R * 2, 1e-3);



    const ay = Math.max(Math.abs(state.axes[1]) * state.R * 2, 1e-3);



    const az = Math.max(Math.abs(state.axes[2]) * state.R * 2, 1e-3);



    this.derivedHullDims = [ax, ay, az];



  }

  private resolveSpacetimeGridWarpStrength(
    state: Hull3DRendererState,
    cfg?: HullSpacetimeGridPrefs | null,
  ) {
    const baseWarpRaw = Number.isFinite(cfg?.warpStrength)
      ? (cfg!.warpStrength as number)
      : this.spacetimeGridState.warpStrength;
    const baseWarp = Number.isFinite(baseWarpRaw) ? baseWarpRaw : 0;
    const mode = cfg?.warpStrengthMode ?? this.spacetimeGridState.warpStrengthMode;
    if (mode === "manual") {
      return { warpStrength: baseWarp, warpScale: 1, massRatio: null };
    }
    const massNow = Number.isFinite(state.exoticMass_kg) ? (state.exoticMass_kg as number) : NaN;
    const massTarget = Number.isFinite(state.exoticMassTarget_kg)
      ? (state.exoticMassTarget_kg as number)
      : NaN;
    if (!(massNow > 0 && massTarget > 0)) {
      return { warpStrength: baseWarp, warpScale: 1, massRatio: null };
    }
    const ratio = massNow / massTarget;
    const scale = clamp(Math.sqrt(Math.max(ratio, 0)), 0.5, 2.0);
    const warpStrength = clamp(baseWarp * scale, 0, 5);
    return { warpStrength, warpScale: scale, massRatio: ratio };
  }

  private rebuildSpacetimeGridCage(
    state: Hull3DRendererState,
    spacing: number,
    warpStrength: number,
    falloff: number,
    fieldSource?: HullSpacetimeGridPrefs["fieldSource"],
  ) {
    const { gl } = this;
    const domainScale = Number.isFinite(state.domainScale) ? (state.domainScale as number) : this.domainScale;
    const profile = state.latticeProfileTag ?? "preview";
    const qualityScale =
      this.qualityPreset === "low" ? 1.6 : this.qualityPreset === "medium" ? 1.25 : 1.0;
    const spacingScale = (profile === "preview" ? 1.2 : 1.0) * qualityScale;
    let spacingUsed = Math.max(1e-4, spacing * spacingScale);
    const maxLines = profile === "card" ? 900 : 650;
    const degradedReasons: string[] = [];
    const spacingRequested = Math.max(1e-6, spacing);
    const spaceCfg = state.overlays?.spacetimeGrid ?? null;
    const useSdf = this.spacetimeGridState.useSdf;
    const resolvedFieldSource =
      fieldSource ??
      spaceCfg?.fieldSource ??
      this.spacetimeGridState.fieldSource ??
      "volume";
    const analyticField = resolvedFieldSource === "analytic";
    const fallbackHalf = [
      Math.max(1e-3, Math.abs(state.axes[0]) * Math.max(state.R, 1e-3) * domainScale),
      Math.max(1e-3, Math.abs(state.axes[1]) * Math.max(state.R, 1e-3) * domainScale),
      Math.max(1e-3, Math.abs(state.axes[2]) * Math.max(state.R, 1e-3) * domainScale),
    ] as [number, number, number];
    const fallbackSize: [number, number, number] = [fallbackHalf[0] * 2, fallbackHalf[1] * 2, fallbackHalf[2] * 2];
    const fallbackMin: [number, number, number] = [-fallbackHalf[0], -fallbackHalf[1], -fallbackHalf[2]];

    const boundsMode = spaceCfg?.boundsMode ?? "lattice";
    const domainHalf: [number, number, number] = [
      Math.max(1e-3, Math.abs(state.axes[0]) * domainScale),
      Math.max(1e-3, Math.abs(state.axes[1]) * domainScale),
      Math.max(1e-3, Math.abs(state.axes[2]) * domainScale),
    ];
    const boundsBaseMin =
      boundsMode === "domain"
        ? ([-domainHalf[0], -domainHalf[1], -domainHalf[2]] as [number, number, number])
        : (state.latticeMin ?? fallbackMin);
    const boundsBaseSize =
      boundsMode === "domain"
        ? ([domainHalf[0] * 2, domainHalf[1] * 2, domainHalf[2] * 2] as [number, number, number])
        : (state.latticeSize ?? fallbackSize);
    const falloffRequested = Number.isFinite(falloff) ? Math.max(0, falloff) : 0;
    const expandOverrideRaw = spaceCfg?.boundsExpand_m;
    const expandOverride = Number.isFinite(expandOverrideRaw)
      ? Math.max(0, expandOverrideRaw as number)
      : null;
    const expandRaw =
      expandOverride ?? Math.max(spacingRequested * 4.0, falloffRequested * 3.5);
    const boundsExpand = Number.isFinite(expandRaw) ? expandRaw : 0;
    const boundsMin: [number, number, number] = [
      boundsBaseMin[0] - boundsExpand,
      boundsBaseMin[1] - boundsExpand,
      boundsBaseMin[2] - boundsExpand,
    ];
    const boundsSize: [number, number, number] = [
      boundsBaseSize[0] + boundsExpand * 2,
      boundsBaseSize[1] + boundsExpand * 2,
      boundsBaseSize[2] + boundsExpand * 2,
    ];
    const basis = state.latticeFrame?.bounds?.basis;
    const basisKey = basis
      ? [
          basis.forward.map((n) => n.toFixed(3)).join(","),
          basis.up.map((n) => n.toFixed(3)).join(","),
          basis.right.map((n) => n.toFixed(3)).join(","),
        ].join("|")
      : "basis:none";
    const boundsKey = `${basisKey}:${boundsMin.map((n) => n.toFixed(3)).join(",")}::${boundsSize
      .map((n) => n.toFixed(3))
      .join(",")}:pad${boundsExpand.toFixed(3)}`;

    const colorParam =
      spaceCfg?.colorBy === "warpStrength"
        ? Math.max(-2, Math.min(2, warpStrength * 0.25))
        : 0;
    const baseColor = this.divergeColor(colorParam);
    const latticeMin = state.latticeMin ?? boundsMin;
    const latticeSize = state.latticeSize ?? boundsSize;
    const sdfData = useSdf ? state.latticeSdf ?? null : null;
    const sdfDistances = sdfData?.distances ?? null;
    const sdfDims = sdfData?.dims ?? null;
    const sdfReady =
      !!sdfDistances &&
      !!sdfDims &&
      sdfDims.length === 3 &&
      sdfDims[0] > 0 &&
      sdfDims[1] > 0 &&
      sdfDims[2] > 0;

    const frameBounds = state.latticeFrame?.bounds;
    const framePad = state.latticeFrame?.padding_m;
    const hullHalf: [number, number, number] = frameBounds?.halfSize && framePad
      ? [
          Math.max(1e-3, frameBounds.halfSize[0] - framePad[0]),
          Math.max(1e-3, frameBounds.halfSize[1] - framePad[1]),
          Math.max(1e-3, frameBounds.halfSize[2] - framePad[2]),
        ]
      : state.hullDims
        ? [
            Math.max(1e-3, Math.abs(state.hullDims[0]) * 0.5),
            Math.max(1e-3, Math.abs(state.hullDims[1]) * 0.5),
            Math.max(1e-3, Math.abs(state.hullDims[2]) * 0.5),
          ]
        : [
            Math.max(1e-3, boundsSize[0] * 0.45),
            Math.max(1e-3, boundsSize[1] * 0.45),
            Math.max(1e-3, boundsSize[2] * 0.45),
          ];

    const invLatticeSize = [
      latticeSize[0] !== 0 ? 1 / latticeSize[0] : 0,
      latticeSize[1] !== 0 ? 1 / latticeSize[1] : 0,
      latticeSize[2] !== 0 ? 1 / latticeSize[2] : 0,
    ] as [number, number, number];

    const analyticSdf = (x: number, y: number, z: number) => {
      const dx = Math.abs(x) - hullHalf[0];
      const dy = Math.abs(y) - hullHalf[1];
      const dz = Math.abs(z) - hullHalf[2];
      const ox = Math.max(dx, 0);
      const oy = Math.max(dy, 0);
      const oz = Math.max(dz, 0);
      const outside = Math.hypot(ox, oy, oz);
      const inside = Math.min(Math.max(dx, Math.max(dy, dz)), 0);
      return outside + inside;
    };

    const sampleSdf = (x: number, y: number, z: number) => {
      if (!sdfReady || !sdfDims || !sdfDistances) return null;
      const ux = (x - latticeMin[0]) * invLatticeSize[0];
      const uy = (y - latticeMin[1]) * invLatticeSize[1];
      const uz = (z - latticeMin[2]) * invLatticeSize[2];
      if (ux < 0 || ux > 1 || uy < 0 || uy > 1 || uz < 0 || uz > 1) return null;
      const nx = sdfDims[0];
      const ny = sdfDims[1];
      const nz = sdfDims[2];
      const ix = Math.min(nx - 1, Math.max(0, Math.round(ux * (nx - 1))));
      const iy = Math.min(ny - 1, Math.max(0, Math.round(uy * (ny - 1))));
      const iz = Math.min(nz - 1, Math.max(0, Math.round(uz * (nz - 1))));
      const idx = ix + nx * (iy + ny * iz);
      const val = sdfDistances[idx];
      return Number.isFinite(val) ? val : null;
    };

    const computeCounts = (sp: number) => {
      const nx = Math.max(2, Math.floor(boundsSize[0] / sp) + 1);
      const ny = Math.max(2, Math.floor(boundsSize[1] / sp) + 1);
      const nz = Math.max(2, Math.floor(boundsSize[2] / sp) + 1);
      const total = ny * nz + nx * nz + nx * ny;
      return { nx, ny, nz, total };
    };

    let counts = computeCounts(spacingUsed);
    let guard = 0;
    let lineCapAdjusted = false;
    while (counts.total > maxLines && guard < 8) {
      const factor = Math.max(1.2, Math.sqrt(counts.total / Math.max(1, maxLines)));
      spacingUsed *= factor;
      counts = computeCounts(spacingUsed);
      guard += 1;
      lineCapAdjusted = true;
    }
    const falloffFromSpacing = spacingUsed * 0.75;
    const rMag = Number.isFinite(state.R) ? Math.abs(state.R) : 0;
    const falloffFromR = Math.max(1e-6, rMag * 0.05);
    const boundsSpanRaw = Math.max(boundsSize[0], boundsSize[1], boundsSize[2]);
    const boundsSpan = Number.isFinite(boundsSpanRaw) ? boundsSpanRaw : 0;
    const falloffFromBounds = Math.max(1e-6, boundsSpan * 0.4);
    const falloffUsed = Math.max(
      falloffRequested,
      falloffFromSpacing,
      falloffFromR,
      falloffFromBounds,
    );
    if (spacingUsed > spacingRequested * 1.01) degradedReasons.push("coarse-spacing");
    if (boundsExpand > 1e-6) degradedReasons.push("expanded-bounds");
    if (lineCapAdjusted) degradedReasons.push("line-cap");

    const stepX = boundsSize[0] / Math.max(1, counts.nx - 1);
    const stepY = boundsSize[1] / Math.max(1, counts.ny - 1);
    const stepZ = boundsSize[2] / Math.max(1, counts.nz - 1);

    const xs = new Array(counts.nx).fill(0).map((_, i) => boundsMin[0] + stepX * i);
    const ys = new Array(counts.ny).fill(0).map((_, i) => boundsMin[1] + stepY * i);
    const zs = new Array(counts.nz).fill(0).map((_, i) => boundsMin[2] + stepZ * i);

    const volume = state.latticeVolume ?? null;
    const warpField =
      spaceCfg?.warpField ?? this.spacetimeGridState.warpField ?? "dfdr";
    const usesDfdr = warpField !== "alpha";
    const fieldValues = analyticField
      ? null
      : usesDfdr
        ? volume?.dfdr3D ?? null
        : volume?.drive3D ?? null;
    const fieldDims = analyticField ? null : volume?.dims ?? null;
    const fieldReady =
      analyticField ||
      (!!fieldValues &&
        !!fieldDims &&
        fieldDims.length === 3 &&
        fieldDims[0] > 1 &&
        fieldDims[1] > 1 &&
        fieldDims[2] > 1);
    const falloffSafe = Math.max(1e-3, falloffUsed);
    const intensityFloor = sdfReady ? 0.4 : 0.5;

    const sampleFall = (x: number, y: number, z: number) => {
      const sdfSigned = sampleSdf(x, y, z) ?? analyticSdf(x, y, z);
      const fallRaw = Math.exp(-Math.abs(sdfSigned) / falloffSafe);
      return sdfReady ? fallRaw : fallRaw * 0.85;
    };

    const resolveSegments = (length: number) => {
      const denom = Math.max(spacingUsed * 1.5, 1e-4);
      return Math.max(2, Math.min(12, Math.round(length / denom)));
    };
    const segmentsX = resolveSegments(boundsSize[0]);
    const segmentsY = resolveSegments(boundsSize[1]);
    const segmentsZ = resolveSegments(boundsSize[2]);

    const verts: number[] = [];
    const colors: number[] = [];
    const falls: number[] = [];
    const nodeVerts: number[] = [];
    const nodeColors: number[] = [];
    const nodeFalls: number[] = [];
    const pushPoint = (x: number, y: number, z: number, fall: number) => {
      verts.push(x, y, z);
      falls.push(fall);
      const intensity = intensityFloor + (1 - intensityFloor) * fall;
      colors.push(baseColor[0] * intensity, baseColor[1] * intensity, baseColor[2] * intensity);
    };
    const pushNode = (x: number, y: number, z: number, fall: number) => {
      nodeVerts.push(x, y, z);
      nodeFalls.push(fall);
      const intensity = intensityFloor + (1 - intensityFloor) * fall;
      nodeColors.push(baseColor[0] * intensity, baseColor[1] * intensity, baseColor[2] * intensity);
    };
    const emitLine = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      segments: number,
    ) => {
      const segs = Math.max(1, Math.round(segments));
      const dx = (x1 - x0) / segs;
      const dy = (y1 - y0) / segs;
      const dz = (z1 - z0) / segs;
      let px = x0;
      let py = y0;
      let pz = z0;
      for (let i = 0; i < segs; i += 1) {
        const nx = px + dx;
        const ny = py + dy;
        const nz = pz + dz;
        const fall0 = sampleFall(px, py, pz);
        const fall1 = sampleFall(nx, ny, nz);
        pushPoint(px, py, pz, fall0);
        pushPoint(nx, ny, nz, fall1);
        px = nx;
        py = ny;
        pz = nz;
      }
    };

    for (const y of ys) {
      for (const z of zs) {
        emitLine(
          boundsMin[0],
          y,
          z,
          boundsMin[0] + boundsSize[0],
          y,
          z,
          segmentsX,
        );
      }
    }
    for (const x of xs) {
      for (const z of zs) {
        emitLine(
          x,
          boundsMin[1],
          z,
          x,
          boundsMin[1] + boundsSize[1],
          z,
          segmentsY,
        );
      }
    }
    for (const x of xs) {
      for (const y of ys) {
        emitLine(
          x,
          y,
          boundsMin[2],
          x,
          y,
          boundsMin[2] + boundsSize[2],
          segmentsZ,
        );
      }
    }

    const maxNodes = profile === "card" ? 4500 : 3200;
    const totalNodes = counts.nx * counts.ny * counts.nz;
    const nodeStep =
      totalNodes > maxNodes
        ? Math.max(1, Math.round(Math.cbrt(totalNodes / maxNodes)))
        : 1;
    if (nodeStep > 1) degradedReasons.push("node-decimate");

    for (let ix = 0; ix < xs.length; ix += nodeStep) {
      const x = xs[ix];
      for (let iy = 0; iy < ys.length; iy += nodeStep) {
        const y = ys[iy];
        for (let iz = 0; iz < zs.length; iz += nodeStep) {
          const z = zs[iz];
          const fall = sampleFall(x, y, z);
          pushNode(x, y, z, fall);
        }
      }
    }

    const vertCount = verts.length / 3;
    const colorsArray =
      colors.length === verts.length ? new Float32Array(colors) : new Float32Array(verts.length);
    const falloffArray =
      falls.length === vertCount ? new Float32Array(falls) : new Float32Array(vertCount);
    const nodeCount = nodeVerts.length / 3;
    const nodeColorsArray =
      nodeColors.length === nodeVerts.length
        ? new Float32Array(nodeColors)
        : new Float32Array(nodeVerts.length);
    const nodeFalloffArray =
      nodeFalls.length === nodeCount ? new Float32Array(nodeFalls) : new Float32Array(nodeCount);
    this.spacetimeGridState.spacingUsed_m = spacingUsed;
    this.spacetimeGridState.falloffUsed_m = falloffUsed;
    this.spacetimeGridState.falloffRequested_m = falloffRequested;
    this.spacetimeGridState.falloffFromSpacing_m = falloffFromSpacing;
    this.spacetimeGridState.falloffFromR_m = falloffFromR;
    this.spacetimeGridState.falloffFromBounds_m = falloffFromBounds;
    this.spacetimeGridState.degradedReasons = degradedReasons;
    this.spacetimeGridState.boundsMin = boundsMin;
    this.spacetimeGridState.boundsSize = boundsSize;
    this.spacetimeGridState.boundsExpanded_m = boundsExpand;

    if (vertCount === 0) {
      if (this.overlay.spaceGridVao) gl.deleteVertexArray(this.overlay.spaceGridVao);
      if (this.overlay.spaceGridVbo) gl.deleteBuffer(this.overlay.spaceGridVbo);
      if (this.overlay.spaceGridColorVbo) gl.deleteBuffer(this.overlay.spaceGridColorVbo);
      if (this.overlay.spaceGridFalloffVbo) gl.deleteBuffer(this.overlay.spaceGridFalloffVbo);
      if (this.overlay.demoGridNodeVao) gl.deleteVertexArray(this.overlay.demoGridNodeVao);
      if (this.overlay.demoGridNodeVbo) gl.deleteBuffer(this.overlay.demoGridNodeVbo);
      if (this.overlay.demoGridNodeColorVbo) gl.deleteBuffer(this.overlay.demoGridNodeColorVbo);
      if (this.overlay.demoGridNodeFalloffVbo) gl.deleteBuffer(this.overlay.demoGridNodeFalloffVbo);
      this.overlay.spaceGridVao = null;
      this.overlay.spaceGridVbo = null;
      this.overlay.spaceGridColorVbo = null;
      this.overlay.spaceGridFalloffVbo = null;
      this.overlay.spaceGridCount = 0;
      this.overlay.demoGridNodeVao = null;
      this.overlay.demoGridNodeVbo = null;
      this.overlay.demoGridNodeColorVbo = null;
      this.overlay.demoGridNodeFalloffVbo = null;
      this.overlay.demoGridNodeCount = 0;
      this.overlayCache.spaceGridKey = "";
      this.overlayCache.demoGridNodeKey = "";
      return;
    }

    const colorKey = `${spaceCfg?.colorBy ?? "thetaSign"}:${colorParam.toFixed(3)}`;
    const sdfKey = useSdf ? (state.latticeSdf?.key ?? "sdf:none") : "sdf:off";
    const fieldKey = analyticField
      ? "analytic"
      : fieldReady
        ? (volume?.hash ?? "vol:none")
        : "vol:off";
    const key = `${boundsKey}:s${spacingUsed.toFixed(4)}:w${warpStrength.toFixed(3)}:f${falloffUsed.toFixed(
      3,
    )}:p${profile}:c${colorKey}:sdf${sdfKey}:field${fieldKey}`;
    const nodeKey = `${key}:nodes:${nodeStep}`;
    const nodeReady =
      nodeCount === 0 ||
      (this.overlay.demoGridNodeVao &&
        this.overlay.demoGridNodeVbo &&
        this.overlay.demoGridNodeColorVbo &&
        this.overlay.demoGridNodeFalloffVbo);
    if (
      this.overlayCache.spaceGridKey === key &&
      this.overlayCache.demoGridNodeKey === nodeKey &&
      this.overlay.spaceGridVao &&
      this.overlay.spaceGridVbo &&
      this.overlay.spaceGridColorVbo &&
      this.overlay.spaceGridFalloffVbo &&
      nodeReady
    ) {
      this.overlay.spaceGridCount = vertCount;
      this.overlay.demoGridNodeCount = nodeCount;
      return;
    }

    if (this.overlay.spaceGridVao) gl.deleteVertexArray(this.overlay.spaceGridVao);
    if (this.overlay.spaceGridVbo) gl.deleteBuffer(this.overlay.spaceGridVbo);
    if (this.overlay.spaceGridColorVbo) gl.deleteBuffer(this.overlay.spaceGridColorVbo);
    if (this.overlay.spaceGridFalloffVbo) gl.deleteBuffer(this.overlay.spaceGridFalloffVbo);
    if (this.overlay.demoGridNodeVao) gl.deleteVertexArray(this.overlay.demoGridNodeVao);
    if (this.overlay.demoGridNodeVbo) gl.deleteBuffer(this.overlay.demoGridNodeVbo);
    if (this.overlay.demoGridNodeColorVbo) gl.deleteBuffer(this.overlay.demoGridNodeColorVbo);
    if (this.overlay.demoGridNodeFalloffVbo)
      gl.deleteBuffer(this.overlay.demoGridNodeFalloffVbo);
    if (this.overlay.fluxStreamVao) gl.deleteVertexArray(this.overlay.fluxStreamVao);
    if (this.overlay.fluxStreamVbo) gl.deleteBuffer(this.overlay.fluxStreamVbo);
    if (this.overlay.observerDirectionVao) gl.deleteVertexArray(this.overlay.observerDirectionVao);
    if (this.overlay.observerDirectionVbo) gl.deleteBuffer(this.overlay.observerDirectionVbo);
    this.overlay.spaceGridVao = null;
    this.overlay.spaceGridVbo = null;
    this.overlay.spaceGridColorVbo = null;
    this.overlay.spaceGridFalloffVbo = null;
    this.overlay.spaceGridCount = 0;
    this.overlay.demoGridNodeVao = null;
    this.overlay.demoGridNodeVbo = null;
    this.overlay.demoGridNodeColorVbo = null;
    this.overlay.demoGridNodeFalloffVbo = null;
    this.overlay.demoGridNodeCount = 0;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    const fbo = gl.createBuffer();
    if (!vao || !vbo || !cbo || !fbo) return;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colorsArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fbo);
    gl.bufferData(gl.ARRAY_BUFFER, falloffArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.overlay.spaceGridVao = vao;
    this.overlay.spaceGridVbo = vbo;
    this.overlay.spaceGridColorVbo = cbo;
    this.overlay.spaceGridFalloffVbo = fbo;
    this.overlay.spaceGridCount = vertCount;
    this.overlayCache.spaceGridKey = key;
    if (nodeCount > 0) {
      const nodeVao = gl.createVertexArray();
      const nodeVbo = gl.createBuffer();
      const nodeCbo = gl.createBuffer();
      const nodeFbo = gl.createBuffer();
      if (nodeVao && nodeVbo && nodeCbo && nodeFbo) {
        const nodeVertsArray = new Float32Array(nodeVerts);
        gl.bindVertexArray(nodeVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeVbo);
        gl.bufferData(gl.ARRAY_BUFFER, nodeVertsArray, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeCbo);
        gl.bufferData(gl.ARRAY_BUFFER, nodeColorsArray, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeFbo);
        gl.bufferData(gl.ARRAY_BUFFER, nodeFalloffArray, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.overlay.demoGridNodeVao = nodeVao;
        this.overlay.demoGridNodeVbo = nodeVbo;
        this.overlay.demoGridNodeColorVbo = nodeCbo;
        this.overlay.demoGridNodeFalloffVbo = nodeFbo;
        this.overlay.demoGridNodeCount = nodeCount;
        this.overlayCache.demoGridNodeKey = nodeKey;
      } else {
        if (nodeVao) gl.deleteVertexArray(nodeVao);
        if (nodeVbo) gl.deleteBuffer(nodeVbo);
        if (nodeCbo) gl.deleteBuffer(nodeCbo);
        if (nodeFbo) gl.deleteBuffer(nodeFbo);
        this.overlay.demoGridNodeVao = null;
        this.overlay.demoGridNodeVbo = null;
        this.overlay.demoGridNodeColorVbo = null;
        this.overlay.demoGridNodeFalloffVbo = null;
        this.overlay.demoGridNodeCount = 0;
        this.overlayCache.demoGridNodeKey = "";
      }
    } else {
      this.overlay.demoGridNodeCount = 0;
      this.overlayCache.demoGridNodeKey = "";
    }
  }

  private divergeColor(t: number): [number, number, number] {
    return divergeThetaColor(t);
  }







  private sampleBetaField(state: Hull3DRendererState, u: number, v: number): number {



    if (typeof state.betaSampler === "function") {



      try {



        const val = state.betaSampler(u, v);



        if (Number.isFinite(val)) return val;



      } catch (err) {



        console.warn("[Hull3DRenderer] betaSampler threw", err);



      }



    }



    if (Number.isFinite(state.betaUniform_ms2)) {



      return state.betaUniform_ms2 as number;



    }



    return state.beta;



  }







  private updateBetaTelemetry(state: Hull3DRendererState, comfort: number) {



    const samples = 24;



    const step = samples > 1 ? 1 / (samples - 1) : 1;



    const dims = state.hullDims ?? this.derivedHullDims;



    const hullScale = Math.max(dims[0], Math.max(dims[1], dims[2]));



    let maxGrad = 0;



    let redCount = 0;



    let total = 0;



    const G = 9.80665;



    for (let j = 0; j < samples; j++) {



      const v = j * step;



      for (let i = 0; i < samples; i++) {



        const u = i * step;



        const b = this.sampleBetaField(state, u, v);



        const bRight = this.sampleBetaField(state, Math.min(1, u + step), v);



        const bUp = this.sampleBetaField(state, u, Math.min(1, v + step));



        let grad = Math.hypot(bRight - b, bUp - b);



        if (hullScale > 1e-5) grad *= hullScale;



        if (grad > maxGrad) maxGrad = grad;



        if (Math.abs(grad - 0.4 * G) <= 0.05 * G) {



          redCount += 1;



        }



        total += 1;



      }



    }



    const redPct = total > 0 ? redCount / total : 0;



    this.betaTelemetry = { maxGrad, redPct };



    console.debug("[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²-overlay]", {



      maxGrad_ms2: Number.isFinite(maxGrad) ? Number(maxGrad.toFixed(3)) : maxGrad,



      comfort_ms2: comfort,



      redBandAreaPct: Number.isFinite(redPct) ? Number((redPct * 100).toFixed(1)) : redPct,



    });



  }







  private ensureFallbackProgram() {



    if (this.overlay.fallbackProgram) return;



    try {



      this.overlay.fallbackProgram = linkProgram(this.gl, "Hull3D::fallback", OVERLAY_VS, OVERLAY_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Failed to create fallback shader", err);



      this.overlay.fallbackProgram = null;



    }



  }







  private applyRayUniforms(



    gl: WebGL2RenderingContext,



    loc: Record<string, WebGLUniformLocation | null>,



    state: Hull3DRendererState,



    params: RayUniformParams



  ) {



    const gateView = Number.isFinite(state.gateView) ? state.gateView : state.gate;



    const floorThetaGR = Math.max(0, state.vizFloorThetaGR ?? 1e-9);



    const floorRhoGR = Math.max(0, state.vizFloorRhoGR ?? 1e-18);



    const floorThetaDrive = Math.max(0, state.vizFloorThetaDrive ?? 1e-6);



    const opacityWindow = params.opacityWindow ?? DEFAULT_OPACITY_WINDOW;



    const opacityMin = Math.max(1e-6, opacityWindow[0]);



    const opacityMax = Math.max(opacityMin + 1e-4, opacityWindow[1]);

    const tiltCfg = state.overlays?.tilt;
    const tiltEnabled = Boolean(tiltCfg?.enabled && tiltCfg?.dir);
    const tiltDir = (tiltCfg?.dir ?? [0, 0]) as [number, number];
    const dbgWindow = typeof window !== "undefined" ? (window as any) : undefined;
    const thetaSign = (Math.sign(state.thetaSign ?? 1) || 1) * (dbgWindow?.__hullThetaSign === -1 ? -1 : 1);
    const metricMode: MetricModeId = metricModeFromWarpFieldType(state.warpFieldType);
    const tiltMag = Math.max(0, Math.min(1, tiltCfg?.magnitude ?? 0));
    const tiltAlphaBase = tiltCfg?.alpha ?? 0.85;
    const tiltAlpha = Math.max(0, Math.min(1, tiltAlphaBase));
    const curvCfg = state.overlays?.curvature;
    const curvActive = isCurvatureDirectiveEnabled(curvCfg);
    const curvEnabled = curvActive && this.curvature.hasData;
    const curvGainUi = curvActive ? curvCfg.gain : 1.0;
    let curvGain = curvGainUi;
    const autoGainEnabled = typeof globalThis !== "undefined" && (globalThis as any).__hullCurvAutoGain === true;
    if (autoGainEnabled && this._curvStats) {
      const span = Math.max(1e-6, this._curvStats.emaMax - this._curvStats.emaMin);
      const targetSpan = 2.0;
      const autoScale = targetSpan / span;
      curvGain = clamp(curvGainUi * autoScale, 0.05, 24.0);
    }



    const curvPaletteMode = curvaturePaletteIndex(curvActive ? curvCfg.palette : undefined);



    const curvDebugOnly = params.curvDebugOnly ?? false;



    const curvAlpha =



      (curvEnabled || curvDebugOnly)
        ? clamp(curvActive ? curvCfg.alpha : 0.0, 0, 1)
        : 0.0;



    const curvDebugMode = clamp(Math.round(params.curvDebugMode ?? 0), 0, 1);



    const curvRange = this.curvature.range ?? [-8, 8];



    const curvRangeMin = Number.isFinite(curvRange?.[0]) ? curvRange[0] : -8;



    const curvRangeMax = Number.isFinite(curvRange?.[1]) ? curvRange[1] : 8;



    const gain01 = clamp(curvGain / CURVATURE_GAIN_MAX, 0, 1);



    const curvBoost = 1 + gain01 * (CURVATURE_BOOST_MAX - 1);



    if (loc.u_axes) gl.uniform3f(loc.u_axes, state.axes[0], state.axes[1], state.axes[2]);



    if (loc.u_domainScale) gl.uniform1f(loc.u_domainScale, this.domainScale);



    if (loc.u_beta) gl.uniform1f(loc.u_beta, state.beta);
    if (loc.u_metricMode) gl.uniform1i(loc.u_metricMode, metricMode);
    if (loc.u_thetaSign) gl.uniform1f(loc.u_thetaSign, thetaSign);



    if (loc.u_ampChain) gl.uniform1f(loc.u_ampChain, state.ampChain);



    if (loc.u_gate) gl.uniform1f(loc.u_gate, state.gate);



    if (loc.u_gate_view) gl.uniform1f(loc.u_gate_view, gateView);



    if (loc.u_vizFloorThetaGR) gl.uniform1f(loc.u_vizFloorThetaGR, floorThetaGR);



    if (loc.u_vizFloorRhoGR) gl.uniform1f(loc.u_vizFloorRhoGR, floorRhoGR);



    if (loc.u_vizFloorThetaDrive) gl.uniform1f(loc.u_vizFloorThetaDrive, floorThetaDrive);



    if (loc.u_volumeDomain) gl.uniform1i(loc.u_volumeDomain, params.volumeDomainIndex);
    if (loc.u_volumeSource) gl.uniform1i(loc.u_volumeSource, params.volumeSourceIndex);



    if (loc.u_opacityWindow) gl.uniform2f(loc.u_opacityWindow, opacityMin, opacityMax);
    this.uniformCache.set1i(gl, loc.u_showTilt, tiltEnabled ? 1 : 0);
    if (loc.u_tiltDir) gl.uniform2f(loc.u_tiltDir, tiltDir[0], tiltDir[1]);
    this.uniformCache.set1f(gl, loc.u_tiltMag, tiltMag);
    this.uniformCache.set1f(gl, loc.u_tiltAlpha, tiltAlpha);



    this.uniformCache.set1f(gl, loc.u_curvGain, curvGain);
    this.uniformCache.set1f(gl, loc.u_curvAlpha, curvAlpha);
    this.uniformCache.set1i(gl, loc.u_curvPaletteMode, curvPaletteMode);
    this.uniformCache.set1i(gl, loc.u_curvDebugOnly, curvDebugOnly ? 1 : 0);
    this.uniformCache.set1i(gl, loc.u_curvDebugMode, curvDebugMode);

    if (loc.u_curvBoost) gl.uniform1f(loc.u_curvBoost, curvBoost);
    if (loc.u_curvRange) gl.uniform2f(loc.u_curvRange, curvRangeMin, curvRangeMax);

    // T00 overlay uniforms
    const t00Cfg = state.overlays?.t00;
    const t00Enabled = Boolean(t00Cfg?.enabled && this.t00.hasData);
    const t00Alpha = t00Enabled ? clamp(t00Cfg?.alpha ?? 0.65, 0, 1) : 0;
    const t00Gain = t00Cfg?.gain ?? 1.0;
    const t00Range = this.t00.range ?? [1e-12, 1e-12];
    if ((loc as any).u_t00Alpha) this.uniformCache.set1f(gl, (loc as any).u_t00Alpha, t00Alpha);
    if ((loc as any).u_t00Gain) this.uniformCache.set1f(gl, (loc as any).u_t00Gain, t00Gain);
    if ((loc as any).u_t00Range) gl.uniform2f((loc as any).u_t00Range, t00Range[0], t00Range[1]);



    if (loc.u_fActive) gl.uniform1f(loc.u_fActive, params.fActive);



    if (loc.u_lumpExp) gl.uniform1f(loc.u_lumpExp, state.lumpExp);



    if (loc.u_phaseSign) gl.uniform1f(loc.u_phaseSign, params.phaseSign);



    this.uniformCache.set1f(gl, loc.u_phase01, params.phase01);



    if (loc.u_blend) gl.uniform1f(loc.u_blend, clamp(params.blend, 0, 1));



    if (loc.u_radialScale) gl.uniform1f(loc.u_radialScale, this.radialScale);



    if (loc.u_radialMax) gl.uniform1f(loc.u_radialMax, this.radialMaxR);



    if (loc.u_invR) gl.uniform1f(loc.u_invR, params.invR);



    if (loc.u_timeSec) gl.uniform1f(loc.u_timeSec, params.timeSec);



  if (loc.u_sigma) gl.uniform1f(loc.u_sigma, params.sigma);



    const win = (typeof window !== "undefined") ? (window as any) : undefined;



    const forcedDensityScale = Number.isFinite(win?.__hullForceDensityScale)



      ? win.__hullForceDensityScale



      : params.densityScale;



    if (loc.u_densityScale) gl.uniform1f(loc.u_densityScale, forcedDensityScale);



    if (loc.u_stepBias) gl.uniform1f(loc.u_stepBias, params.stepBias);



    if (loc.u_maxSteps) gl.uniform1i(loc.u_maxSteps, params.maxSteps);



    if (loc.u_cameraPos) gl.uniform3f(loc.u_cameraPos, params.cameraEye[0], params.cameraEye[1], params.cameraEye[2]);



    if (loc.u_invViewProj) gl.uniformMatrix4fv(loc.u_invViewProj, false, params.invViewProj);



    if (loc.u_forceFlatGate) gl.uniform1i(loc.u_forceFlatGate, params.forceFlatGate ? 1 : 0);



    if (loc.u_debugMode) gl.uniform1i(loc.u_debugMode, params.debugMode ?? 0);



    if (loc.u_probeMode) gl.uniform1i(loc.u_probeMode, params.probeMode ?? 0);



    if (loc.u_probeGain) gl.uniform1f(loc.u_probeGain, params.probeGain ?? 0);



    if (loc.u_testMode) gl.uniform1i(loc.u_testMode, params.testMode ?? 0);



    if (loc.u_baseScale) gl.uniform1f(loc.u_baseScale, params.baseScale);



    if (loc.u_volumeViz) gl.uniform1i(loc.u_volumeViz, params.volumeVizIndex);



    if (loc.u_grThetaGain) gl.uniform1f(loc.u_grThetaGain, params.grThetaGain);



    if (loc.u_grRhoGain) gl.uniform1f(loc.u_grRhoGain, params.grRhoGain);



    if (win) {



      win.__hullVolumeVizIndex = params.volumeVizIndex;



      win.__hullVolumeDomainIndex = params.volumeDomainIndex;



      win.__hullLastDensityScale = forcedDensityScale;



    }



  }


  private handleIntentUpdate(payload: DriveIntentState) {
    this.intentVector[0] = payload.intent.x;
    this.intentVector[1] = payload.intent.y;
    this.intentVector[2] = payload.intent.z;
    this.intentMagnitude = Math.max(0, Math.min(1, payload.nudge01));
  }


  private resolveIntentOffset(state: Hull3DRendererState): [number, number, number] | null {
    const radius =
      Math.max(Math.abs(state.axes[0]), Math.abs(state.axes[1]), Math.abs(state.axes[2])) *
      this.domainScale;
    if (!Number.isFinite(radius) || radius <= 1e-6) return null;

    const maxOffset = Math.max(0, Math.min(1, this.intentMagnitude));
    if (maxOffset <= 1e-6) return null;

    const viz = this.vizIntent;
    const offset: [number, number, number] = [0, 0, 0];
    let hasOffset = false;

    if (viz.enabled) {
      const mag01 = Math.max(0, Math.min(1, viz.mag01));
      const rise01 = Math.max(-1, Math.min(1, viz.rise01));
      const baseScale = radius * maxOffset;
      if (mag01 > 1e-4) {
        const yaw = TWO_PI * (this.phaseSignEffective * state.phase01);
        const dirX = Math.sin(yaw);
        const dirZ = Math.cos(yaw);
        const mag = baseScale * mag01;
        offset[0] += dirX * mag;
        offset[2] += dirZ * mag;
        if (Math.abs(mag) > 1e-6) {
          hasOffset = true;
        }
      }
      if (Math.abs(rise01) > 1e-4) {
        const rise = baseScale * (rise01 * 0.6);
        offset[1] += rise;
        if (Math.abs(rise) > 1e-6) {
          hasOffset = true;
        }
      }
    }

    if (!hasOffset) {
      const [ix, iy, iz] = this.intentVector;
      const intentMag = Math.hypot(ix, iy, iz);
      if (Number.isFinite(intentMag) && intentMag > 1e-5) {
        const scale = (radius * maxOffset) / intentMag;
        offset[0] = ix * scale;
        offset[1] = iz * scale;
        offset[2] = iy * scale;
        hasOffset = true;
      }
    }

    if (!hasOffset && maxOffset > 1e-6) {
      const yaw = TWO_PI * (this.phaseSignEffective * state.phase01);
      const baseScale = radius * maxOffset;
      offset[0] = Math.sin(yaw) * baseScale;
      offset[2] = Math.cos(yaw) * baseScale;
      hasOffset = true;
    }

    return hasOffset ? offset : null;
  }


  private deriveIntentMatrices(viewProj: Float32Array, state: Hull3DRendererState) {
    const baseInvViewProj = invert(identity(), viewProj) ?? identity();
    const offset = this.resolveIntentOffset(state);
    if (!offset) {
      return {
        baseViewProj: viewProj,
        baseInvViewProj,
        hullViewProj: viewProj,
        hullInvViewProj: baseInvViewProj,
      };
    }

    const model = identity();
    model[12] = offset[0];
    model[13] = offset[1];
    model[14] = offset[2];
    const hullViewProj = multiply(identity(), viewProj, model);
    const hullInvViewProj = invert(identity(), hullViewProj) ?? baseInvViewProj;
    return {
      baseViewProj: viewProj,
      baseInvViewProj,
      hullViewProj,
      hullInvViewProj,
    };
  }


  draw() {



    if (!this.state) return;



    const { gl } = this;



    const state = this.state;



    const phase01 = clamp(this.phaseTarget, 0, 1);



    state.phase01 = phase01;



    this.overlay3D.phase01 = phase01;



    if (typeof window !== "undefined") {



      (window as any).__hullLastState = state;



    }



    const fActive = this.resolveFActive(state);



    this.fActiveResolved = fActive;



    const now = performance.now();



    const frameDt = now - this.framePerf.lastFrameTime;



    this.framePerf.lastFrameTime = now;



    this.framePerf.movingAvg = lerp(this.framePerf.movingAvg, frameDt, 0.1);



    if (this.options.quality === "auto") {



      if (this.framePerf.movingAvg > 40) {



        this.setQuality("medium", this.options.qualityOverrides);



      }



      if (this.framePerf.movingAvg > 55) {



        this.setQuality("low", this.options.qualityOverrides);



      }



    }



    if (this.framePerf.movingAvg > this.perfFallbackMs) {



      this.framePerf.fallbackFrames = this.perfFallbackHold;



    } else if (this.framePerf.fallbackFrames > 0 && this.framePerf.movingAvg < this.perfFallbackMs * 0.85) {



      this.framePerf.fallbackFrames -= 1;



    }



    const diagClamped = this.diagnosticsEnabled && !this._diag.lastOk;



    const forceFallback = diagClamped || this.framePerf.fallbackFrames > 0;



    if (forceFallback && typeof window !== "undefined") {



      const fallbackMessage = this._diag.message && this._diag.message.length



        ? this._diag.message



        : "Volume fallback to slices/wireframe (perf clamp)";



      (window as any).__hullDiagMessage = { message: fallbackMessage, status: "fallback" };



    }



    else if (typeof window !== "undefined" && (window as any).__hullDiagMessage?.status === "fallback") {



      (window as any).__hullDiagMessage = null;



    }



    const width = this.canvas.width;



    const height = this.canvas.height;



    const haveTargets = this.ensureRayTargets(width, height);



    const canUseOffscreen = haveTargets



      && !!this.resources.rayFbo



      && !!this.resources.rayColorTex



      && !!this.resources.rayAuxTex



      && !!this.resources.postProgram



      && !forceFallback;



    if (canUseOffscreen) {



      gl.bindFramebuffer(gl.FRAMEBUFFER, this.resources.rayFbo);



      const drawBuffers = this.rayIdEnabled
        ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]
        : [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
      gl.drawBuffers(drawBuffers);



    } else {



      gl.bindFramebuffer(gl.FRAMEBUFFER, null);



    }



    gl.viewport(0, 0, width, height);



    gl.clearColor(0.01, 0.015, 0.03, 1);



    gl.clear(gl.COLOR_BUFFER_BIT);



    // For the fullscreen raymarch, avoid depth interactions entirely



    gl.disable(gl.DEPTH_TEST);







    if ((this.debugCounter++ % 120) === 0) {



      const effectiveGate = Number.isFinite(state.gateView) ? state.gateView : state.gate;



      const baseDrive = state.beta * state.ampChain * effectiveGate;



      const driveMag = Math.abs(baseDrive);



      if (!Number.isFinite(driveMag) || driveMag < 1e-9) {



        console.warn("[Hull3DRenderer] Drive magnitude near zero", {



          ampChain: state.ampChain,



          beta: state.beta,



          gate: state.gate,



          duty: state.duty,



          bubbleStatus: state.bubbleStatus,



          freeze: this.freezeVolume,



          skipVolume: this.skipVolumeUpdate,



          hasVolume: this.hasVolume,



        });



      } else if (!this.hasVolume) {



        console.warn("[Hull3DRenderer] Volume not initialized yet (drive magnitude ok)", {



          freeze: this.freezeVolume,



          skipVolume: this.skipVolumeUpdate,



          lastVolumeKey: this.lastVolumeKey,



        });



      } else {



        const lumpExp = Math.max(0.5, state.lumpExp);



        const expectedGain = Math.pow(1 / Math.max(fActive, 1e-6), 0.5 * lumpExp);



        console.log("[Hull3D] drive check", {



          base: baseDrive,



          volumeViz: this.resolveVolumeViz(state),



          densityScale: this.lastDensityScale,



          fActive,



          duty: state.duty,



          lumpExp,



          expectedGain,



        });



      }



    }







    const camera = this.computeCamera(state);



    const view = lookAt(identity(), camera.eye, camera.center, (camera as any).up ?? [0, 1, 0]);



    const hullRadius = Math.max(Math.abs(state.axes[0]), Math.abs(state.axes[1]), Math.abs(state.axes[2])) * this.domainScale;



    const farPlane = Math.max(1000, hullRadius * 4);



    const proj = perspective(identity(), camera.fov, state.aspect || 1.6, 0.2, farPlane);



    const baseViewProj = multiply(identity(), proj, view);



    const intentMatrices = this.deriveIntentMatrices(baseViewProj, state);



    const viewProj = intentMatrices.baseViewProj;



    const invViewProj = intentMatrices.baseInvViewProj;



    const hullInvViewProj = intentMatrices.hullInvViewProj;







    if (this.resources.rayProgram && this.radialTex && this.ringInstantTex) {



      gl.useProgram(this.resources.rayProgram);



      const loc = {



        u_volume: gl.getUniformLocation(this.resources.rayProgram, "u_volume"),
        u_gateVolume: gl.getUniformLocation(this.resources.rayProgram, "u_gateVolume"),



        u_ringInstant: gl.getUniformLocation(this.resources.rayProgram, "u_ringInstant"),



        u_ringAverage: gl.getUniformLocation(this.resources.rayProgram, "u_ringAverage"),



        u_radialLUT: gl.getUniformLocation(this.resources.rayProgram, "u_radialLUT"),
        u_volumeAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_volumeAtlas"),



        u_curvTex: gl.getUniformLocation(this.resources.rayProgram, "u_curvTex"),
        u_t00Tex: gl.getUniformLocation(this.resources.rayProgram, "u_t00Tex"),



        u_curvGain: gl.getUniformLocation(this.resources.rayProgram, "u_curvGain"),
        u_t00Alpha: gl.getUniformLocation(this.resources.rayProgram, "u_t00Alpha"),
        u_t00Gain: gl.getUniformLocation(this.resources.rayProgram, "u_t00Gain"),



        u_curvAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_curvAlpha"),



        u_curvPaletteMode: gl.getUniformLocation(this.resources.rayProgram, "u_curvPaletteMode"),



        u_curvDebugOnly: gl.getUniformLocation(this.resources.rayProgram, "u_curvDebugOnly"),



        u_curvDebugMode: gl.getUniformLocation(this.resources.rayProgram, "u_curvDebugMode"),



        u_curvBoost: gl.getUniformLocation(this.resources.rayProgram, "u_curvBoost"),



        u_curvRange: gl.getUniformLocation(this.resources.rayProgram, "u_curvRange"),
        u_t00Range: gl.getUniformLocation(this.resources.rayProgram, "u_t00Range"),



        u_axes: gl.getUniformLocation(this.resources.rayProgram, "u_axes"),



        u_domainScale: gl.getUniformLocation(this.resources.rayProgram, "u_domainScale"),



        u_beta: gl.getUniformLocation(this.resources.rayProgram, "u_beta"),
        u_metricMode: gl.getUniformLocation(this.resources.rayProgram, "u_metricMode"),



        u_ampChain: gl.getUniformLocation(this.resources.rayProgram, "u_ampChain"),



        u_gate: gl.getUniformLocation(this.resources.rayProgram, "u_gate"),



        u_gate_view: gl.getUniformLocation(this.resources.rayProgram, "u_gate_view"),



        u_fActive: gl.getUniformLocation(this.resources.rayProgram, "u_fActive"),



        u_lumpExp: gl.getUniformLocation(this.resources.rayProgram, "u_lumpExp"),



        u_hasLatticeVolume: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeVolume"),
        u_worldToLattice: gl.getUniformLocation(this.resources.rayProgram, "u_worldToLattice"),
        u_latticeMin: gl.getUniformLocation(this.resources.rayProgram, "u_latticeMin"),
        u_latticeSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSize"),
        u_latticePacked: gl.getUniformLocation(this.resources.rayProgram, "u_latticePacked"),
        u_latticeUseAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeUseAtlas"),
        u_latticeDynamicWeights: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDynamicWeights"),
        u_latticeDims: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDims"),
        u_latticeAtlasTiles: gl.getUniformLocation(this.resources.rayProgram, "u_latticeAtlasTiles"),
        u_latticeSliceInvSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSliceInvSize"),
        u_hasLatticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeSdf"),
        u_latticeSdfBand_m: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfBand_m"),
        u_latticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdf"),
        u_latticeSdfAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfAtlas"),



        u_phase01: gl.getUniformLocation(this.resources.rayProgram, "u_phase01"),



        u_phaseSign: gl.getUniformLocation(this.resources.rayProgram, "u_phaseSign"),

        u_thetaSign: gl.getUniformLocation(this.resources.rayProgram, "u_thetaSign"),



        u_blend: gl.getUniformLocation(this.resources.rayProgram, "u_blend"),



        u_densityScale: gl.getUniformLocation(this.resources.rayProgram, "u_densityScale"),



        u_stepBias: gl.getUniformLocation(this.resources.rayProgram, "u_stepBias"),



        u_maxSteps: gl.getUniformLocation(this.resources.rayProgram, "u_maxSteps"),



        u_radialScale: gl.getUniformLocation(this.resources.rayProgram, "u_radialScale"),



        u_radialMax: gl.getUniformLocation(this.resources.rayProgram, "u_radialMax"),



        u_invR: gl.getUniformLocation(this.resources.rayProgram, "u_invR"),



        u_timeSec: gl.getUniformLocation(this.resources.rayProgram, "u_timeSec"),



  u_sigma: gl.getUniformLocation(this.resources.rayProgram, "u_sigma"),



        u_cameraPos: gl.getUniformLocation(this.resources.rayProgram, "u_cameraPos"),



        u_invViewProj: gl.getUniformLocation(this.resources.rayProgram, "u_invViewProj"),



        u_forceFlatGate: gl.getUniformLocation(this.resources.rayProgram, "u_forceFlatGate"),



        u_debugMode: gl.getUniformLocation(this.resources.rayProgram, "u_debugMode"),



        u_probeMode: gl.getUniformLocation(this.resources.rayProgram, "u_probeMode"),



        u_probeGain: gl.getUniformLocation(this.resources.rayProgram, "u_probeGain"),



        u_testMode: gl.getUniformLocation(this.resources.rayProgram, "u_testMode"),



        u_baseScale: gl.getUniformLocation(this.resources.rayProgram, "u_baseScale"),



        u_volumeViz: gl.getUniformLocation(this.resources.rayProgram, "u_volumeViz"),
        u_volumeSource: gl.getUniformLocation(this.resources.rayProgram, "u_volumeSource"),



        u_volumeDomain: gl.getUniformLocation(this.resources.rayProgram, "u_volumeDomain"),



        u_opacityWindow: gl.getUniformLocation(this.resources.rayProgram, "u_opacityWindow"),



        u_overlayMode: gl.getUniformLocation(this.resources.rayProgram, "u_overlayMode"),



        u_overlayMix: gl.getUniformLocation(this.resources.rayProgram, "u_overlayMix"),



        u_overlayAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_overlayAlpha"),



        u_overlayThick: gl.getUniformLocation(this.resources.rayProgram, "u_overlayThick"),



        u_overlayGain: gl.getUniformLocation(this.resources.rayProgram, "u_overlayGain"),



        u_overlayHue: gl.getUniformLocation(this.resources.rayProgram, "u_overlayHue"),



        u_overlayPhase: gl.getUniformLocation(this.resources.rayProgram, "u_overlayPhase"),



        u_sectorGridMode: gl.getUniformLocation(this.resources.rayProgram, "u_sectorGridMode"),



        u_sectorGridAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_sectorGridAlpha"),



        u_sectorIsoAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_sectorIsoAlpha"),



        u_sectorDutyWindow: gl.getUniformLocation(this.resources.rayProgram, "u_sectorDutyWindow"),



        u_ringOverlay: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlay"),



        u_grayMode: gl.getUniformLocation(this.resources.rayProgram, "u_grayMode"),



        u_grThetaGain: gl.getUniformLocation(this.resources.rayProgram, "u_grThetaGain"),



        u_grRhoGain: gl.getUniformLocation(this.resources.rayProgram, "u_grRhoGain"),



        u_vizFloorThetaGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaGR"),



        u_vizFloorRhoGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorRhoGR"),



        u_vizFloorThetaDrive: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaDrive"),



        u_ringOverlayMode: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlayMode"),



        u_ringOverlayBlend: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlayBlend"),



        u_ringOverlayAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlayAlpha"),



        u_ringOverlayWidth: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlayWidth"),



        u_ringOverlayField: gl.getUniformLocation(this.resources.rayProgram, "u_ringOverlayField"),



      };



      const volumeTex = this.volumeTex ?? this.ensureDummy3D();



      const ringInstantTex = this.ringInstantTex!;



      const ringAverageTex = this.ringAverageTex ?? ringInstantTex;



      const curvTex = this.curvature.hasData ? this.getActiveCurvatureTexture() : this.ensureCurvatureFallback();



      gl.activeTexture(gl.TEXTURE0);



      gl.bindTexture(gl.TEXTURE_3D, volumeTex);



      gl.uniform1i(loc.u_volume, 0);



      const gateTex = this.gateVolumeTex ?? this.ensureDummy3D();



      gl.activeTexture(gl.TEXTURE6);



      gl.bindTexture(gl.TEXTURE_3D, gateTex);



      if (loc.u_gateVolume) gl.uniform1i(loc.u_gateVolume, 6);



      const volumeSource = this.resolveVolumeSource(state);
      const useLattice = volumeSource === "lattice";
      const activeLattice =
        useLattice && state.latticeVolume && this.latticeUpload && this.latticeUpload.hash === state.latticeVolume.hash
          ? this.latticeUpload
          : null;
      const hasLattice = !!activeLattice;
      const latticePacked = !!activeLattice?.format.packedRG;
      const latticeUseAtlas = !!activeLattice && activeLattice.format.backend === "atlas2d";
      const latticeDynamicWeights = state.latticeWeightMode === "dynamic";
      const latticeDims = activeLattice?.dims ?? [1, 1, 1];
      const atlas = activeLattice?.format.atlas;

      if (loc.u_hasLatticeVolume) gl.uniform1i(loc.u_hasLatticeVolume, hasLattice ? 1 : 0);
      if (loc.u_latticePacked) gl.uniform1i(loc.u_latticePacked, latticePacked ? 1 : 0);
      if (loc.u_latticeUseAtlas) gl.uniform1i(loc.u_latticeUseAtlas, latticeUseAtlas ? 1 : 0);
      if (loc.u_latticeDynamicWeights) gl.uniform1i(loc.u_latticeDynamicWeights, latticeDynamicWeights ? 1 : 0);
      if (loc.u_latticeDims) gl.uniform3f(loc.u_latticeDims, latticeDims[0], latticeDims[1], latticeDims[2]);
      if (loc.u_latticeAtlasTiles) {
        gl.uniform2f(loc.u_latticeAtlasTiles, atlas?.tilesX ?? 1, atlas?.tilesY ?? 1);
      }
      if (loc.u_latticeSliceInvSize) {
        gl.uniform2f(
          loc.u_latticeSliceInvSize,
          1 / Math.max(1, latticeDims[0]),
          1 / Math.max(1, latticeDims[1]),
        );
      }
      if (loc.u_volumeAtlas) {
        const atlasTex =
          latticeUseAtlas && this.latticeAtlasTex ? this.latticeAtlasTex : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1i(loc.u_volumeAtlas, 7);
      }

      const hasLatticeSdf = !!(
        useLattice &&
        hasLattice &&
        state.latticeSdf &&
        this.latticeSdfReadyKey &&
        this.latticeSdfReadyKey === state.latticeSdf.key
      );

      if (loc.u_hasLatticeSdf) gl.uniform1i(loc.u_hasLatticeSdf, hasLatticeSdf ? 1 : 0);
      const sdfBandMetersRaw = state.latticeSdf?.band ?? 0;
      const sdfBandMeters =
        hasLatticeSdf && Number.isFinite(sdfBandMetersRaw) ? Math.max(0, sdfBandMetersRaw) : 0;
      if (loc.u_latticeSdfBand_m) gl.uniform1f(loc.u_latticeSdfBand_m, sdfBandMeters);

      if (loc.u_latticeSdf) {
        const sdfTex3D =
          hasLatticeSdf && !latticeUseAtlas && this.latticeSdfTex ? this.latticeSdfTex : this.ensureDummy3D();
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_3D, sdfTex3D);
        gl.uniform1i(loc.u_latticeSdf, 8);
      }

      if (loc.u_latticeSdfAtlas) {
        const sdfAtlas =
          hasLatticeSdf && latticeUseAtlas && this.latticeSdfAtlasTex
            ? this.latticeSdfAtlasTex
            : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, sdfAtlas);
        gl.uniform1i(loc.u_latticeSdfAtlas, 9);
      }



      gl.activeTexture(gl.TEXTURE1);



      gl.bindTexture(gl.TEXTURE_2D, ringInstantTex);



      gl.uniform1i(loc.u_ringInstant, 1);



      gl.activeTexture(gl.TEXTURE2);



      gl.bindTexture(gl.TEXTURE_2D, ringAverageTex);



      gl.uniform1i(loc.u_ringAverage, 2);



      gl.activeTexture(gl.TEXTURE3);



      gl.bindTexture(gl.TEXTURE_2D, this.radialTex);



      gl.uniform1i(loc.u_radialLUT, 3);



      gl.activeTexture(gl.TEXTURE4);



      gl.bindTexture(gl.TEXTURE_3D, curvTex);
      this.maybeStampCurvatureTexture(curvTex);



      if (loc.u_curvTex) gl.uniform1i(loc.u_curvTex, 4);
      const t00Tex = this.t00.hasData ? this.getActiveT00Texture() : this.ensureT00Fallback();
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, t00Tex);
      this.maybeStampT00Texture(t00Tex);
      if (loc.u_t00Tex) gl.uniform1i(loc.u_t00Tex, 5);
      if (loc.u_worldToLattice) {
        const mat = state.latticeWorldToLattice ?? new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ]);
        gl.uniformMatrix4fv(loc.u_worldToLattice, false, mat);
      }
      if (loc.u_latticeMin) {
        const min = state.latticeMin ?? [0, 0, 0];
        gl.uniform3fv(loc.u_latticeMin, min as any);
      }
      if (loc.u_latticeSize) {
        const size = state.latticeSize ?? [1, 1, 1];
        gl.uniform3fv(loc.u_latticeSize, size as any);
      }



      const dbgPhaseSign = (typeof window !== "undefined" && (window as any).__hullPhaseSign === -1) ? -1 : 1;



      const statePhaseSign = Math.sign(state.phaseSign ?? 1) || 1;



      this.phaseSignEffective = statePhaseSign * dbgPhaseSign;



      const userExposure = Number.isFinite(state.exposure as number) ? (state.exposure as number) : undefined;



      const exposureBase = userExposure ?? 1.0;



      const effectiveExposure = clamp(exposureBase * this.autoGain, 1e-4, 1e4);



      const densityScale = this.resolveDensityScale(state, effectiveExposure);



      this.lastDensityScale = densityScale;



      const baseScale = this.resolveBaseScale(state);



      const gateForGain = Number.isFinite(state.gateView) ? state.gateView : state.gate;



      const driveChain = Math.abs(state.ampChain) * Math.max(gateForGain, 1e-6);



      const grThetaGain = Math.max(driveChain * 0.6, 1e-12);



      const grRhoGain = clamp(driveChain * 0.03, 1e-12, 1e12);



      const ringStats = this.ringLastStats;



      if (typeof window !== "undefined") {



        (window as any).__hullVizStats = {



          viz: this.resolveVolumeViz(state),



          densityScale,



          radialDfMax: this.radialDfMax,



          beta: state.beta,



          ampChain: state.ampChain,



          gate: state.gate,



          duty: state.duty,



          exposure: state.exposure,



          driveChain,



          thetaBoost: grThetaGain,



          rhoBoost: grRhoGain,



          autoGain: this.autoGain,



          baseScale,



          fActiveResolved: this.fActiveResolved,



          ringMean: ringStats?.mean ?? null,



          ringRawMean: ringStats?.rawMean ?? null,



          ringMin: ringStats?.min ?? null,



          ringMax: ringStats?.max ?? null,



        };



      }



      const volumeVizIndex = this.resolveVolumeVizIndex(state);



      const volumeSourceIndex = VOLUME_SOURCE_TO_INDEX[volumeSource];



      const volumeDomainIndex = this.resolveVolumeDomainIndex(state);



      const opacityWindow = this.opacityWindow ?? DEFAULT_OPACITY_WINDOW;



      const dbg = (typeof window !== "undefined") ? (window as any) : {};



      const debugForceFlat = !!dbg.__hullForceFlatGate;



      const autoFlatGate = this.autoFlatGate || (!!ringStats && ringStats.rawMean <= 1e-4);



      const forceFlatGate = debugForceFlat || autoFlatGate;



      if (dbg) {



        dbg.__hullAutoFlatGate = autoFlatGate;



      }



      const debugMode = Number.isInteger(dbg.__hullDebugMode) ? (dbg.__hullDebugMode | 0) : 0;



      const curvDebugOnly = !!dbg.__hullCurvDebugOnly;



      const curvDebugMode = Number.isInteger(dbg.__hullCurvDebugMode)



        ? clamp(dbg.__hullCurvDebugMode | 0, 0, 1)



        : 0;



      const ringOverlay = !!dbg.__hullShowRingOverlay ? 1 : 0;



      const grayMode = (!!dbg.__hullDebugGrayscale || debugMode === 3) ? 1 : 0;



      const ringMode = Number.isInteger(dbg.__hullRingOverlayMode) ? (dbg.__hullRingOverlayMode | 0) : 0;



      const ringBlend = Number.isFinite(dbg.__hullRingOverlayBlend) ? Math.max(0, Math.min(1, +dbg.__hullRingOverlayBlend)) : 0.25;



      const ringAlpha = Number.isFinite(dbg.__hullRingOverlayAlpha) ? Math.max(0, Math.min(1, +dbg.__hullRingOverlayAlpha)) : 0.6;



      const ringWidth = Number.isFinite(dbg.__hullRingOverlayWidth) ? Math.max(0.002, Math.min(0.12, +dbg.__hullRingOverlayWidth)) : 0.03;



      const ringField = Number.isInteger(dbg.__hullRingOverlayField) ? (dbg.__hullRingOverlayField | 0) : -1;



      const invR =
        volumeSourceIndex === 0 ? 1.0 : 1.0 / Math.max(state.R, 1e-6);
      const params: RayUniformParams = {



        densityScale,



        stepBias: this.qualityProfile.stepBias,



        maxSteps: this.qualityProfile.maxSteps,



        cameraEye: camera.eye,



        invViewProj,



        phaseSign: this.phaseSignEffective,



        phase01: state.phase01,



        invR,



        timeSec: state.timeSec ?? 0,



        blend: clamp(state.blendFactor, 0, 1),



        fActive,



        baseScale,



        sigma: state.sigma,



        volumeVizIndex,



        volumeSourceIndex,



        volumeDomainIndex,



        opacityWindow,



        grThetaGain,



        grRhoGain,



        forceFlatGate,



        debugMode,



        probeMode: 0,



        probeGain: 0,



        testMode: 0,



        curvDebugOnly,



        curvDebugMode,



      };



      this.applyRayUniforms(gl, loc, state, params);



    const overlay3D = this.overlay3D;
    const overlayMix = Math.max(0, Math.min(1, overlay3D.mix));
    const overlayAlpha = Math.max(0, Math.min(1, overlay3D.alpha));
    const overlayThick = Math.max(0.001, Math.min(0.3, overlay3D.thick));
    const overlayGain = Math.max(0, overlay3D.gain);
    const overlayHue = overlay3D.hue - Math.floor(overlay3D.hue);
    const overlayPhase = phase01;
    if (loc.u_overlayMode) gl.uniform1i(loc.u_overlayMode, overlay3D.mode);
    if (loc.u_overlayMix) gl.uniform1f(loc.u_overlayMix, overlayMix);
    if (loc.u_overlayAlpha) gl.uniform1f(loc.u_overlayAlpha, overlayAlpha);
    if (loc.u_overlayThick) gl.uniform1f(loc.u_overlayThick, overlayThick);
    if (loc.u_overlayGain) gl.uniform1f(loc.u_overlayGain, overlayGain);
    if (loc.u_overlayHue) gl.uniform1f(loc.u_overlayHue, overlayHue);
    this.uniformCache.set1f(gl, loc.u_overlayPhase, overlayPhase);

    const gridCfg = state.overlays?.sectorGrid;
    const gridMode =
      gridCfg?.enabled
        ? gridCfg.mode === "ema"
          ? 2
          : gridCfg.mode === "split"
            ? 3
            : 1
        : 0;
    if (loc.u_sectorGridMode) gl.uniform1i(loc.u_sectorGridMode, gridMode);
    const gridAlpha = gridCfg?.enabled ? Math.max(0, Math.min(1, gridCfg.alpha ?? 0)) : 0;
    if (loc.u_sectorGridAlpha) gl.uniform1f(loc.u_sectorGridAlpha, gridAlpha);
    if (loc.u_sectorIsoAlpha) gl.uniform1f(loc.u_sectorIsoAlpha, gridCfg?.isoAlpha ?? 0.12);
    if (loc.u_sectorDutyWindow) {
      const dutyWindow = gridCfg?.dutyWindow ?? [0, 1];
      gl.uniform2f(loc.u_sectorDutyWindow, dutyWindow[0], dutyWindow[1]);
    }

    if (loc.u_ringOverlay) gl.uniform1i(loc.u_ringOverlay, ringOverlay);



      if (loc.u_grayMode) gl.uniform1i(loc.u_grayMode, grayMode);



      if (loc.u_ringOverlayMode) gl.uniform1i(loc.u_ringOverlayMode, ringMode);



      if (loc.u_ringOverlayBlend) gl.uniform1f(loc.u_ringOverlayBlend, ringBlend);



      if (loc.u_ringOverlayAlpha) gl.uniform1f(loc.u_ringOverlayAlpha, ringAlpha);



      if (loc.u_ringOverlayWidth) gl.uniform1f(loc.u_ringOverlayWidth, ringWidth);



      if (loc.u_ringOverlayField) gl.uniform1i(loc.u_ringOverlayField, ringField);







      gl.bindVertexArray(this.resources.quadVao);



      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);



      gl.bindVertexArray(null);



      if (canUseOffscreen) {



        gl.bindFramebuffer(gl.FRAMEBUFFER, null);



        gl.viewport(0, 0, width, height);



        gl.disable(gl.DEPTH_TEST);



        this.drawPostComposite(state, invViewProj, camera.eye);



      }



      if (debugMode === 4) {



        this.captureDebugTap();



      }



    } else {



      if (canUseOffscreen) {



        gl.bindFramebuffer(gl.FRAMEBUFFER, null);



        gl.viewport(0, 0, width, height);



      }



      this.drawWireframeFallback(viewProj);



    }



    this.drawPreviewMesh(viewProj, state);

    // Spacetime grid (stub): keep volume + grid coexistence; falls back when SDF unavailable
    this.drawSpacetimeGrid(viewProj, state);

    // 2D surface overlay pass (composed on top with transparency)



    // Hide the 2D overlay when grayscale debug is enabled so gray volume stays clear



    const dbg = (typeof window !== "undefined") ? (window as any) : {};



    const hideSurface = !!dbg.__hullDebugGrayscale || (dbg.__hullDebugMode === 3);



    if (!hideSurface && state.showSurfaceOverlay) {



      this.drawSurfaceOverlay(viewProj, state);



    }



    if (!hideSurface && (state.betaOverlayEnabled ?? false)) {



      this.drawBetaOverlay(viewProj, state);



    }



    // Vector overlays (ring, slice, diagnostics badge)



    this.drawOverlays(viewProj, state);



    // Diagnostics scheduler (decoupled): run a tiny offscreen probe after normal draw



    if (this.diagnosticsEnabled) {



      if (this._diag.state === 'idle' && (this.frameCount % this.autoSampleEvery) === 0) {



        this._diag.state = 'sampling';



        this.runDiagnosticProbe(state, camera, hullInvViewProj);



      } else if (this._diag.state === 'holding') {



        if (--this._diag.holdLeft <= 0) {



          this._diag.state = 'idle';



          this._diag.lastOk = true;



          this._diag.message = "";



        }



      }



    }



    this.frameCount++;



    gl.disable(gl.DEPTH_TEST);



  }







  private drawSurfaceOverlay(mvp: Float32Array, state: Hull3DRendererState) {



    const { gl } = this;



    if (!this.surfaceProgram || !this.surfaceVao) return;



    // Keep it subtle so the 3D volume remains visible



    gl.enable(gl.BLEND);



    // Additive blend so the sheet never mutes other translucent overlays (ring, HUD, etc.)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);



    const program = this.surfaceProgram;

    const metricMode = metricModeFromWarpFieldType(state.warpFieldType);



    gl.useProgram(program);



    const loc = {



      u_axes: gl.getUniformLocation(program, "u_axes"),



      u_sigma: gl.getUniformLocation(program, "u_sigma"),



      u_R: gl.getUniformLocation(program, "u_R"),

      u_domainScale: gl.getUniformLocation(program, "u_domainScale"),



      u_beta: gl.getUniformLocation(program, "u_beta"),
      u_metricMode: gl.getUniformLocation(program, "u_metricMode"),

      u_thetaSign: gl.getUniformLocation(program, "u_thetaSign"),



      u_viz: gl.getUniformLocation(program, "u_viz"),



      u_ampChain: gl.getUniformLocation(program, "u_ampChain"),



      u_gate: gl.getUniformLocation(program, "u_gate"),



      u_gate_view: gl.getUniformLocation(program, "u_gate_view"),



      u_duty: gl.getUniformLocation(program, "u_duty"),



      u_yGain: gl.getUniformLocation(program, "u_yGain"),



      u_yBias: gl.getUniformLocation(program, "u_yBias"),



      u_kColor: gl.getUniformLocation(program, "u_kColor"),



      u_mvp: gl.getUniformLocation(program, "u_mvp"),



      u_color: gl.getUniformLocation(program, "u_color"),



      u_alpha: gl.getUniformLocation(program, "u_alpha"),



      u_useColor: gl.getUniformLocation(program, "u_useColor"),



      u_totalSectors: gl.getUniformLocation(program, "u_totalSectors"),



      u_liveSectors: gl.getUniformLocation(program, "u_liveSectors"),



      u_lumpExp: gl.getUniformLocation(program, "u_lumpExp"),



      u_sectorCenter: gl.getUniformLocation(program, "u_sectorCenter"),



      u_sectorSigma: gl.getUniformLocation(program, "u_sectorSigma"),



      u_sectorFloor: gl.getUniformLocation(program, "u_sectorFloor"),



      u_syncMode: gl.getUniformLocation(program, "u_syncMode"),



      u_phase01: gl.getUniformLocation(program, "u_phase01"),



      u_splitEnabled: gl.getUniformLocation(program, "u_splitEnabled"),



      u_splitFrac: gl.getUniformLocation(program, "u_splitFrac"),



      u_vizFloorThetaGR: gl.getUniformLocation(program, "u_vizFloorThetaGR"),



      u_vizFloorRhoGR: gl.getUniformLocation(program, "u_vizFloorRhoGR"),



      u_vizFloorThetaDrive: gl.getUniformLocation(program, "u_vizFloorThetaDrive"),



      u_showTilt: gl.getUniformLocation(program, "u_showTilt"),



      u_tiltDir: gl.getUniformLocation(program, "u_tiltDir"),



      u_tiltMag: gl.getUniformLocation(program, "u_tiltMag"),



      u_tiltAlpha: gl.getUniformLocation(program, "u_tiltAlpha"),



      u_tiltGain: gl.getUniformLocation(program, "u_tiltGain"),



      u_debugTiltEcho: gl.getUniformLocation(program, "u_debugTiltEcho"),



    } as const;

    const tilt = state.overlays?.tilt; // [tilt-gain]



    const tiltEnabled = Boolean(tilt?.enabled && tilt?.dir); // [tilt-gain]



    const tiltDir = (tilt?.dir ?? [0, 0]) as [number, number]; // [tilt-gain]



    const tiltAlphaBase = tilt?.alpha ?? 0.85; // [tilt-gain]



    const tiltAlpha = Math.max(0, Math.min(1, tiltAlphaBase)); // [tilt-gain]



    const dbgWindow = typeof window !== "undefined" ? (window as any) : undefined; // [tilt-gain]
    const thetaSign = (Math.sign(state.thetaSign ?? 1) || 1) * (dbgWindow?.__hullThetaSign === -1 ? -1 : 1);



    const debugTiltEcho = dbgWindow?.__surfaceDebugEcho ? 1 : 0; // [tilt-gain]



    const curvatureDirective = state.overlays?.curvature;
    const curvGain = isCurvatureDirectiveEnabled(curvatureDirective)
      ? curvatureDirective.gain
      : 1; // [tilt-gain]



    const gainMode = // [tilt-gain]



      (tilt?.gainMode === "manual" || tilt?.gainMode === "curvature")



        ? tilt.gainMode



        : (dbgWindow?.__tiltGainMode === "manual" || dbgWindow?.__tiltGainMode === "curvature"



            ? dbgWindow.__tiltGainMode



            : "curvature"); // [tilt-gain]



    const manualGainFromState = typeof tilt?.gain === "number" ? tilt.gain : undefined; // [tilt-gain]



    const manualGainDev =



      dbgWindow && typeof dbgWindow.__tiltGainManual === "number"



        ? dbgWindow.__tiltGainManual



        : 0.65; // [tilt-gain]



    const manualGain = // [tilt-gain]



      typeof manualGainFromState === "number" && Number.isFinite(manualGainFromState)



        ? manualGainFromState



        : manualGainDev; // [tilt-gain]



    const gainFactor =



      dbgWindow && typeof dbgWindow.__tiltGainFactor === "number"



        ? dbgWindow.__tiltGainFactor



        : 1; // [tilt-gain]



    const tiltGainBase = gainMode === "curvature" ? curvGain : manualGain; // [tilt-gain]



    const tiltGain = Math.max(0, tiltGainBase * gainFactor); // [tilt-gain]



    const busScale = // [tilt-gain]



      dbgWindow && typeof dbgWindow.__tiltBusScale === "number"



        ? dbgWindow.__tiltBusScale



        : 1; // [tilt-gain]



    const magIn = Math.max(0, +(tilt?.magnitude ?? 0)); // [tilt-gain]



    const magRaw = Math.max(0, magIn * busScale); // [tilt-gain]



    const tiltMag = Math.min(1, magRaw); // [tilt-gain]

    // Visual-only knobs from shared store (display only; physics unaffected)
    const phys = useHull3DSharedStore.getState().physics;
    const yGainRaw = Math.max(0, Number.isFinite(phys?.yGain) ? (phys!.yGain) : 1) * Math.pow(10, (Number(phys?.trimDb ?? 0)) / 20);







    // Conservative viewer params to avoid occluding volume



    const yGain = phys?.locked ? 1 : yGainRaw;



    const yBias = 0.0;



    const kColor = Math.max(0, Number.isFinite(phys?.kColor) ? (phys!.kColor) : 1);



    const alpha = 0.77;



    const gateView = Number.isFinite(state.gateView) ? state.gateView : state.gate;



    const floorThetaGR = Math.max(0, state.vizFloorThetaGR ?? 1e-9);



    const floorRhoGR = Math.max(0, state.vizFloorRhoGR ?? 1e-18);



    const floorThetaDrive = Math.max(0, state.vizFloorThetaDrive ?? 1e-6);







    if (loc.u_axes) gl.uniform3f(loc.u_axes, state.axes[0], state.axes[1], state.axes[2]);



    if (loc.u_sigma) gl.uniform1f(loc.u_sigma, state.sigma);



    if (loc.u_R) gl.uniform1f(loc.u_R, Math.max(0.1, state.R));

    if (loc.u_domainScale) gl.uniform1f(loc.u_domainScale, this.domainScale);



    if (loc.u_beta) gl.uniform1f(loc.u_beta, state.beta);
    if (loc.u_metricMode) gl.uniform1i(loc.u_metricMode, metricMode);
    if (loc.u_thetaSign) gl.uniform1f(loc.u_thetaSign, thetaSign);


    if (loc.u_viz) {



      const viz = this.resolveVolumeViz(state);



      const vizIndex = VOLUME_VIZ_TO_INDEX[viz];



      gl.uniform1i(loc.u_viz, vizIndex);



    }



    if (loc.u_ampChain) gl.uniform1f(loc.u_ampChain, state.ampChain);



    if (loc.u_gate) gl.uniform1f(loc.u_gate, state.gate);



    if (loc.u_gate_view) gl.uniform1f(loc.u_gate_view, gateView);



    if (loc.u_duty) gl.uniform1f(loc.u_duty, Math.max(0, Math.min(1, state.duty)));



    if (loc.u_yGain) gl.uniform1f(loc.u_yGain, yGain);



    if (loc.u_yBias) gl.uniform1f(loc.u_yBias, yBias);



    if (loc.u_kColor) gl.uniform1f(loc.u_kColor, kColor);



    if (loc.u_mvp) gl.uniformMatrix4fv(loc.u_mvp, false, mvp);



    const meshWire = state.wireframeOverlay;



    const meshWireReady = meshWire && this.overlay.meshWireVao && this.overlay.meshWireCount > 0;



    if (meshWireReady) {



      this.updateMeshWireColors(state, meshWire as WireframeOverlayBuffers);



      const prevDepth = gl.isEnabled(gl.DEPTH_TEST);



      const prevBlend = gl.isEnabled(gl.BLEND);



      gl.enable(gl.DEPTH_TEST);



      gl.depthMask(true);



      gl.enable(gl.BLEND);



      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);



      if (loc.u_color) gl.uniform3f(loc.u_color, meshWire!.color[0], meshWire!.color[1], meshWire!.color[2]);



      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, meshWire!.alpha);



      if (loc.u_useColor) gl.uniform1i(loc.u_useColor, meshWire?.colors ? 1 : 0);



      gl.bindVertexArray(this.overlay.meshWireVao);



      gl.lineWidth(meshWire!.lineWidth);



      gl.drawArrays(gl.LINES, 0, this.overlay.meshWireCount);



      gl.lineWidth(1);



      gl.bindVertexArray(null);



      gl.depthMask(false);



      if (!prevBlend) gl.disable(gl.BLEND);



      if (!prevDepth) gl.disable(gl.DEPTH_TEST);



    }



    if (loc.u_totalSectors) gl.uniform1i(loc.u_totalSectors, state.totalSectors | 0);



    if (loc.u_liveSectors) gl.uniform1i(loc.u_liveSectors, state.liveSectors | 0);



    if (loc.u_lumpExp) gl.uniform1f(loc.u_lumpExp, state.lumpExp);



    if (loc.u_sectorCenter) gl.uniform1f(loc.u_sectorCenter, state.sectorCenter01);



    if (loc.u_sectorSigma) gl.uniform1f(loc.u_sectorSigma, Math.max(1e-4, state.gaussianSigma));



    if (loc.u_sectorFloor) gl.uniform1f(loc.u_sectorFloor, Math.min(0.99, Math.max(0, state.sectorFloor)));



    if (loc.u_syncMode) gl.uniform1i(loc.u_syncMode, state.syncMode | 0);



    this.uniformCache.set1f(gl, loc.u_phase01, state.phase01);



    if (loc.u_splitEnabled) gl.uniform1i(loc.u_splitEnabled, state.splitEnabled ? 1 : 0);



    if (loc.u_splitFrac) gl.uniform1f(loc.u_splitFrac, state.splitFrac);



    if (loc.u_alpha) gl.uniform1f(loc.u_alpha, alpha);



    if (loc.u_vizFloorThetaGR) gl.uniform1f(loc.u_vizFloorThetaGR, floorThetaGR);



    if (loc.u_vizFloorRhoGR) gl.uniform1f(loc.u_vizFloorRhoGR, floorRhoGR);

    if (loc.u_vizFloorThetaDrive) gl.uniform1f(loc.u_vizFloorThetaDrive, floorThetaDrive);

    this.uniformCache.set1i(gl, loc.u_showTilt, tiltEnabled ? 1 : 0); // [tilt-gain]
    if (loc.u_tiltDir) gl.uniform2f(loc.u_tiltDir, tiltDir[0], tiltDir[1]); // [tilt-gain]
    this.uniformCache.set1f(gl, loc.u_tiltMag, tiltMag); // [tilt-gain]
    this.uniformCache.set1f(gl, loc.u_tiltAlpha, tiltAlpha); // [tilt-gain]
    this.uniformCache.set1f(gl, loc.u_tiltGain, tiltGain); // [tilt-gain]
    this.uniformCache.set1f(gl, loc.u_debugTiltEcho, debugTiltEcho); // [tilt-gain]

    if (typeof window !== "undefined") { // [tilt-gain]
      const surfaceDbg = ((window as any).__surfaceDbg ??= { frames: 0, last: null }); // [tilt-gain]
      surfaceDbg.frames = (surfaceDbg.frames ?? 0) + 1; // [tilt-gain]
      const dirSafe: [number, number] = [ // [tilt-gain]
        Number.isFinite(tiltDir[0]) ? tiltDir[0] : 0, // [tilt-gain]
        Number.isFinite(tiltDir[1]) ? tiltDir[1] : 0, // [tilt-gain]
      ]; // [tilt-gain]
      surfaceDbg.last = { // [tilt-gain]
        show: tiltEnabled ? 1 : 0, // [tilt-gain]
        dir: dirSafe, // [tilt-gain]
        mag: tiltMag, // [tilt-gain]
        alpha: tiltAlpha, // [tilt-gain]
        overlayEnabled: Boolean(tilt?.enabled), // [tilt-gain]
        debugEcho: debugTiltEcho > 0.5, // [tilt-gain]
      }; // [tilt-gain]
      surfaceDbg.tilt = { // [tilt-gain]
        enabled: !!tilt?.enabled, // [tilt-gain]
        dir: tilt?.dir ?? dirSafe, // [tilt-gain]
        magIn, // [tilt-gain]
        magSent: tiltMag, // [tilt-gain]
        alpha: tilt?.alpha ?? 0, // [tilt-gain]
        gainMode, // [tilt-gain]
        curvGain, // [tilt-gain]
        tiltGain, // [tilt-gain]
      }; // [tilt-gain]
    } // [tilt-gain]

    this.drawSurfaceGridGeometry(gl);



    gl.disable(gl.BLEND);



  }







  private drawPostComposite(state: Hull3DRendererState, invViewProj: Float32Array, cameraPos: Vec3) {



    const { gl } = this;



    const metricMode = metricModeFromWarpFieldType(state.warpFieldType);



    if (!this.resources.postProgram || !this.resources.quadVao || !this.resources.rayColorTex || !this.resources.rayAuxTex) return;



    const width = this.canvas.width;
    const height = this.canvas.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);


    gl.disable(gl.BLEND);



    gl.useProgram(this.resources.postProgram);



    const loc = {



      u_colorTex: gl.getUniformLocation(this.resources.postProgram, "u_colorTex"),



      u_auxTex: gl.getUniformLocation(this.resources.postProgram, "u_auxTex"),
      u_idTex: gl.getUniformLocation(this.resources.postProgram, "u_idTex"),


      u_ringInstantTex: gl.getUniformLocation(this.resources.postProgram, "u_ringInstantTex"),



      u_ringAverageTex: gl.getUniformLocation(this.resources.postProgram, "u_ringAverageTex"),



      u_greensTex: gl.getUniformLocation(this.resources.postProgram, "u_greensTex"),
      u_envMap: gl.getUniformLocation(this.resources.postProgram, "u_envMap"),
      u_skyboxEnabled: gl.getUniformLocation(this.resources.postProgram, "u_skyboxEnabled"),
      u_skyboxMode: gl.getUniformLocation(this.resources.postProgram, "u_skyboxMode"),
      u_skyboxExposure: gl.getUniformLocation(this.resources.postProgram, "u_skyboxExposure"),
      u_geoSteps: gl.getUniformLocation(this.resources.postProgram, "u_geoSteps"),
      u_geoStep: gl.getUniformLocation(this.resources.postProgram, "u_geoStep"),
      u_geoBend: gl.getUniformLocation(this.resources.postProgram, "u_geoBend"),
      u_geoShift: gl.getUniformLocation(this.resources.postProgram, "u_geoShift"),
      u_geoMaxDist: gl.getUniformLocation(this.resources.postProgram, "u_geoMaxDist"),
      u_geoFieldTex: gl.getUniformLocation(this.resources.postProgram, "u_geoFieldTex"),
      u_geoFieldMode: gl.getUniformLocation(this.resources.postProgram, "u_geoFieldMode"),
      u_geoFieldRange: gl.getUniformLocation(this.resources.postProgram, "u_geoFieldRange"),
      u_envRotation: gl.getUniformLocation(this.resources.postProgram, "u_envRotation"),
      u_invViewProj: gl.getUniformLocation(this.resources.postProgram, "u_invViewProj"),
      u_cameraPos: gl.getUniformLocation(this.resources.postProgram, "u_cameraPos"),
      u_axes: gl.getUniformLocation(this.resources.postProgram, "u_axes"),
      u_domainScale: gl.getUniformLocation(this.resources.postProgram, "u_domainScale"),
      u_R: gl.getUniformLocation(this.resources.postProgram, "u_R"),
      u_sigma: gl.getUniformLocation(this.resources.postProgram, "u_sigma"),
      u_beta: gl.getUniformLocation(this.resources.postProgram, "u_beta"),
      u_metricMode: gl.getUniformLocation(this.resources.postProgram, "u_metricMode"),
      u_geoScientific: gl.getUniformLocation(this.resources.postProgram, "u_geoScientific"),
      u_metricFieldEnabled: gl.getUniformLocation(this.resources.postProgram, "u_metricFieldEnabled"),
      u_metricABTex: gl.getUniformLocation(this.resources.postProgram, "u_metricABTex"),
      u_metricGammaTex: gl.getUniformLocation(this.resources.postProgram, "u_metricGammaTex"),
      u_metricDims: gl.getUniformLocation(this.resources.postProgram, "u_metricDims"),



      u_resolution: gl.getUniformLocation(this.resources.postProgram, "u_resolution"),



      u_phase: gl.getUniformLocation(this.resources.postProgram, "u_phase"),



      u_showKHeat: gl.getUniformLocation(this.resources.postProgram, "u_showKHeat"),



      u_kMode: gl.getUniformLocation(this.resources.postProgram, "u_kMode"),



      u_kGain: gl.getUniformLocation(this.resources.postProgram, "u_kGain"),



      u_kAlpha: gl.getUniformLocation(this.resources.postProgram, "u_kAlpha"),



      u_showThetaIso: gl.getUniformLocation(this.resources.postProgram, "u_showThetaIso"),



      u_isoStep: gl.getUniformLocation(this.resources.postProgram, "u_isoStep"),



      u_isoWidth: gl.getUniformLocation(this.resources.postProgram, "u_isoWidth"),



      u_isoOpacity: gl.getUniformLocation(this.resources.postProgram, "u_isoOpacity"),



      u_showFR: gl.getUniformLocation(this.resources.postProgram, "u_showFR"),



      u_tauLC: gl.getUniformLocation(this.resources.postProgram, "u_tauLC"),



      u_burst: gl.getUniformLocation(this.resources.postProgram, "u_burst"),



      u_dwell: gl.getUniformLocation(this.resources.postProgram, "u_dwell"),



      u_frAlpha: gl.getUniformLocation(this.resources.postProgram, "u_frAlpha"),



      u_showRecLamp: gl.getUniformLocation(this.resources.postProgram, "u_showRecLamp"),



      u_showSectorArc: gl.getUniformLocation(this.resources.postProgram, "u_showSectorArc"),



      u_arcRadiusPx: gl.getUniformLocation(this.resources.postProgram, "u_arcRadiusPx"),



      u_arcWidthPx: gl.getUniformLocation(this.resources.postProgram, "u_arcWidthPx"),



      u_arcGapPx: gl.getUniformLocation(this.resources.postProgram, "u_arcGapPx"),



      u_arcInstantAlpha: gl.getUniformLocation(this.resources.postProgram, "u_arcInstantAlpha"),



      u_arcEmaAlpha: gl.getUniformLocation(this.resources.postProgram, "u_arcEmaAlpha"),



      u_showTilt: gl.getUniformLocation(this.resources.postProgram, "u_showTilt"),



      u_tiltDir: gl.getUniformLocation(this.resources.postProgram, "u_tiltDir"),



      u_tiltMag: gl.getUniformLocation(this.resources.postProgram, "u_tiltMag"),



      u_tiltAlpha: gl.getUniformLocation(this.resources.postProgram, "u_tiltAlpha"),



      u_showGreens: gl.getUniformLocation(this.resources.postProgram, "u_showGreens"),



      u_greensSizePx: gl.getUniformLocation(this.resources.postProgram, "u_greensSizePx"),



      u_greensOriginPx: gl.getUniformLocation(this.resources.postProgram, "u_greensOriginPx"),



      u_greensRange: gl.getUniformLocation(this.resources.postProgram, "u_greensRange"),



      u_greensAlpha: gl.getUniformLocation(this.resources.postProgram, "u_greensAlpha"),

      u_spaceGridEnabled: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridEnabled"),
      u_spaceGridMode: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridMode"),
      u_spaceGridHasSdf: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridHasSdf"),
      u_spaceGridColorBy: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridColorBy"),
      u_spaceGridSpacing: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridSpacing"),
      u_spaceGridWarp: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridWarp"),
      u_spaceGridFalloff: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridFalloff"),
      u_spaceGridThetaNorm: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridThetaNorm"),
      u_spaceGridDomainScale: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridDomainScale"),
      u_spaceGridWorldToLattice: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridWorldToLattice"),
      u_spaceGridLatticeMin: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridLatticeMin"),
      u_spaceGridLatticeSize: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridLatticeSize"),
      u_spaceGridDims: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridDims"),
      u_spaceGridAtlasTiles: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridAtlasTiles"),
      u_spaceGridSliceInvSize: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridSliceInvSize"),
      u_spaceGridUseAtlas: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridUseAtlas"),
      u_spaceGridSdf: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridSdf"),
      u_spaceGridSdfAtlas: gl.getUniformLocation(this.resources.postProgram, "u_spaceGridSdfAtlas"),

    } as const;







    const overlays = state.overlays;



    const overlayFlags = readOverlayFlags();



    const kCfg = overlays?.kInvariants;



    const isoCfg = overlays?.thetaIso;



    const frCfg = overlays?.fordRoman;



    const arcCfg = overlays?.sectorArc;



    const tiltCfg = overlays?.tilt;



    const greensCfg = overlays?.greens;



    const curvCfg = overlays?.curvature;



    const phase = overlays?.phase ?? ((state.timeSec ?? 0) * 0.12) % 1;



    const kShow = kCfg?.enabled ? 1 : 0;



    const kMode = kCfg?.mode ?? 0;



    const kGain = kCfg?.gain ?? 6.0;



    const kAlpha = kCfg?.alpha ?? 0.0;







    const isoShow = isoCfg?.enabled ? 1 : 0;



    const isoStep = isoCfg?.step ?? 1e-6;



    const isoWidth = isoCfg?.width ?? 0.08;



    const isoOpacity = isoCfg?.opacity ?? 0.0;







    const frShow = frCfg?.enabled ? 1 : 0;



    const tauLC = frCfg?.tauLC ?? 1e-6;



    const burst = frCfg?.burst ?? 0.0;



    const dwell = frCfg?.dwell ?? 0.0;



    const frAlpha = frCfg?.alpha ?? 0.0;



    const recLampShow = (overlayFlags.showReciprocity ? 1 : 0) && tauLC > 1e-6 && burst > 0.0 ? 1 : 0;







    const arcShow = arcCfg?.enabled ? 1 : 0;



    const arcRadius = arcCfg?.radiusPx ?? 74.0;



    const arcWidth = arcCfg?.widthPx ?? 8.0;



    const arcGap = arcCfg?.gapPx ?? 11.0;



    const arcInstantAlpha = arcCfg?.instantAlpha ?? 0.75;



    const arcEmaAlpha = arcCfg?.emaAlpha ?? 0.6;







    const tiltShow = tiltCfg?.enabled && tiltCfg.dir ? 1 : 0;



    const tiltDir = tiltCfg?.dir ?? [0, -1];



    const tiltMag = tiltCfg?.magnitude ?? 0;



    const tiltAlpha = tiltCfg?.alpha ?? 0.8;







    const greensShow = greensCfg?.enabled && greensCfg.texture ? 1 : 0;



    const greensSize = greensCfg?.sizePx ?? [220, 80];



    const greensOrigin = greensCfg?.originPx ?? [24, 64];



    const greensRange = greensCfg?.range ?? [0, 1];



    const greensAlpha = greensCfg?.alpha ?? 0.0;

    const skyboxState = state.skybox;
    const skyboxMode =
      skyboxState?.mode === "flat" || skyboxState?.mode === "geodesic"
        ? skyboxState.mode
        : "off";
    const skyboxModeIndex = skyboxMode === "flat" ? 1 : skyboxMode === "geodesic" ? 2 : 0;
    if (skyboxModeIndex > 0) {
      this.ensureSkyboxConfig();
      this.ensureSkyboxTexture();
    }
    const skyboxCfg = this.skyboxConfig;
    const skyboxReady = skyboxModeIndex > 0 && !!this.skyboxTexture;
    const skyboxExposureRaw = skyboxState?.exposure;
    const skyboxExposure = clamp(
      Number.isFinite(skyboxExposureRaw as number)
        ? (skyboxExposureRaw as number)
        : skyboxCfg.exposure,
      0.1,
      8
    );
    const baseR = Number.isFinite(state.R) ? state.R : 1;
    const geoSteps = skyboxModeIndex === 2
      ? Math.min(SKYBOX_MAX_STEPS, Math.max(1, Math.round(skyboxCfg.steps)))
      : 0;
    const geoStep = skyboxModeIndex === 2
      ? Math.max(1e-4, baseR * skyboxCfg.step_scale)
      : 0;
    const geoBend = skyboxModeIndex === 2 ? clamp(skyboxCfg.bend, 0, 4) : 0;
    const geoShift = skyboxModeIndex === 2 ? clamp(skyboxCfg.shift_scale, 0, 4) : 0;
    const geoMaxDist = skyboxModeIndex === 2 ? clamp(skyboxCfg.max_dist, 1, 20) : 0;
    const envRotation = (skyboxCfg.rotation_deg ?? 0) * (Math.PI / 180);
    const metricScientificReady =
      skyboxModeIndex === 2 &&
      this.metricVolume.hasData &&
      this.metricVolume.consistency !== "fail";
    const metricDims = this.metricVolume.hasData ? this.metricVolume.dims : [1, 1, 1];
    const metricFieldEnabled = metricScientificReady ? 1 : 0;
    const metricABTex = metricScientificReady
      ? this.getActiveMetricABTexture()
      : this.ensureMetricFallbackAB();
    const metricGammaTex = metricScientificReady
      ? this.getActiveMetricGammaTexture()
      : this.ensureMetricFallbackGamma();
    const geoFieldMode =
      skyboxModeIndex === 2 && !metricScientificReady
        ? (this.t00.hasData ? 1 : this.curvature.hasData ? 2 : 0)
        : 0;
    const geoFieldRange =
      geoFieldMode === 1 ? this.t00.range : geoFieldMode === 2 ? this.curvature.range : [0, 0];
    const geoFieldRangeMin = Number.isFinite(geoFieldRange[0]) ? geoFieldRange[0] : 0;
    const geoFieldRangeMax = Number.isFinite(geoFieldRange[1]) ? geoFieldRange[1] : 0;
    const geoFieldTex =
      geoFieldMode === 1
        ? this.getActiveT00Texture()
        : geoFieldMode === 2
          ? this.getActiveCurvatureTexture()
          : this.ensureDummy3D();
    const geoDomainScale = Math.max(
      1e-3,
      Number.isFinite(state.domainScale) ? (state.domainScale as number) : this.domainScale
    );
    const geodesicMode =
      skyboxModeIndex === 0
        ? "disabled"
        : skyboxModeIndex === 1
          ? "flat-background"
          : metricScientificReady
            ? "full-3+1-christoffel"
            : "reduced-1+1-fallback";
    this.publishGeodesicDiagnostics({
      mode: geodesicMode,
      scientificEnabled: metricScientificReady,
      metricAvailable: this.metricVolume.hasData,
      metricSource: this.metricVolume.source,
      chart: this.metricVolume.chart,
      dims: this.metricVolume.hasData ? this.metricVolume.dims : null,
      consistency: this.metricVolume.consistency,
      consistencyNote: this.metricVolume.consistencyNote,
      steps: geoSteps,
      stepScale_m: geoStep,
    });



    const curvActive2D = isCurvatureDirectiveEnabled(curvCfg);
    const curvEnabled = curvActive2D && this.curvature.hasData;
    const curvGain = curvActive2D ? curvCfg.gain : 1.0;
    const curvAlpha = curvEnabled ? Math.max(0, Math.min(1, curvActive2D ? curvCfg.alpha : 0.0)) : 0.0;
    const curvPaletteMode = curvaturePaletteIndex(curvActive2D ? curvCfg.palette : undefined);



    const spaceGrid = overlays?.spacetimeGrid;
    const spaceModeRaw = (spaceGrid?.mode ?? this.spacetimeGridState.mode) as HullSpacetimeGridPrefs["mode"];
    const spaceWantsPost =
      !!spaceGrid?.enabled && (spaceModeRaw === "slice" || spaceModeRaw === "surface");
    if (spaceWantsPost && !this.postSpaceGridEnabled) {
      const attemptKey = [
        spaceGrid?.enabled ? 1 : 0,
        spaceModeRaw,
        (spaceGrid?.spacing_m ?? 0).toFixed(3),
        (spaceGrid?.warpStrength ?? 0).toFixed(3),
        (spaceGrid?.falloff_m ?? 0).toFixed(3),
        spaceGrid?.useSdf ? 1 : 0,
      ].join("|");
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const keyChanged = this.postSpaceGridAttemptKey !== attemptKey;
      if (!this.postSpaceGridAttempted || keyChanged) {
        if (now - this.postSpaceGridAttemptAt > 1200) {
          this.postSpaceGridAttempted = false;
          this.postSpaceGridAttemptKey = attemptKey;
          this.postSpaceGridAttemptAt = now;
          this.tryEnablePostSpaceGrid(gl);
        }
      }
    }
    const spacePostEnabled = this.postSpaceGridEnabled && !!spaceGrid?.enabled && spaceWantsPost;
    const spacePostMode = spaceModeRaw === "slice" ? 0 : 1;
    const spacePostModeLabel: "slice" | "surface" | "none" = spacePostEnabled
      ? (spacePostMode === 0 ? "slice" : "surface")
      : "none";
    const spaceEnabled = spacePostEnabled ? 1 : 0;
    const spaceMode = spacePostEnabled ? spacePostMode : 0;
    const spaceColorBy = spaceGrid?.colorBy === "warpStrength" ? 2 : spaceGrid?.colorBy === "thetaMagnitude" ? 1 : 0;
    const { warpStrength: spaceWarp } = this.resolveSpacetimeGridWarpStrength(state, spaceGrid);
    const spaceSpacing = spaceGrid?.spacing_m ?? 0.3;
    const spaceFalloff = spaceGrid?.falloff_m ?? 0.45;
    const thetaFloorGR = Math.max(1e-9, state.vizFloorThetaGR ?? 1e-9);
    const thetaFloorDrive = Math.max(1e-9, state.vizFloorThetaDrive ?? thetaFloorGR);
    const spaceThetaNorm = resolveSpacetimeGridThetaNorm({
      warpStrengthMode: spaceGrid?.warpStrengthMode,
      thetaFloorGR,
      thetaFloorDrive,
    });
    const domainCandidate = Number.isFinite(state.domainScale) ? (state.domainScale as number) : this.domainScale;
    const spaceDomainScale = Math.max(1e-3, Number.isFinite(domainCandidate) ? (domainCandidate as number) : 1.0);
    const latticeUpload = this.latticeSdfUpload;
    const latticeUseAtlas = Boolean(latticeUpload?.atlas);
    const latticeAtlas = latticeUpload?.atlas;
    const spaceLatticeDims = latticeUpload?.dims ?? [1, 1, 1];
    const spaceAtlasTiles = latticeAtlas ? [latticeAtlas.tilesX, latticeAtlas.tilesY] : [1, 1];
    const spaceSliceInvSize = latticeAtlas
      ? [1 / Math.max(1, latticeAtlas.width), 1 / Math.max(1, latticeAtlas.height)]
      : [1, 1];
    const spaceSdfReady = Boolean(
      state.latticeSdf &&
      this.latticeSdfReadyKey &&
      this.latticeSdfReadyKey === state.latticeSdf.key &&
      state.latticeWorldToLattice
    );
    const spaceHasSdf = spacePostEnabled && spaceGrid?.useSdf && spaceSdfReady ? 1 : 0;
    const spaceUseAtlas = spaceHasSdf && latticeUseAtlas ? 1 : 0;
    const spaceWorldToLattice = state.latticeWorldToLattice ?? new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const spaceLatticeMin = state.latticeMin ?? [0, 0, 0];
    const spaceLatticeSize = state.latticeSize ?? [1, 1, 1];
    const spaceSdfKey = state.latticeSdf?.key ?? null;
    const volumeHash = state.latticeVolume?.hash ?? null;
    const volumeUpload =
      volumeHash && this.latticeUpload && this.latticeUpload.hash === volumeHash
        ? this.latticeUpload
        : null;
    const dfdrUpload =
      volumeHash && this.latticeDfdrUpload && this.latticeDfdrUpload.hash === volumeHash
        ? this.latticeDfdrUpload
        : null;
    const volumeBackend = volumeUpload?.format.backend ?? null;
    const dfdrBackend = dfdrUpload?.backend ?? null;
    const volumeReady = volumeHash ? this.latticeVolumeReadyKey === volumeHash : false;
    const dfdrReady = volumeHash ? this.latticeDfdrReadyKey === volumeHash : false;
    const volumeUseAtlas = volumeBackend === "atlas2d";
    const dfdrUseAtlas = dfdrBackend === "atlas2d";
    const spacingUsed = Number.isFinite(this.spacetimeGridState.spacingUsed_m)
      ? this.spacetimeGridState.spacingUsed_m
      : spaceSpacing;
    const sdfMissing = Boolean(spaceGrid?.useSdf && !spaceSdfReady);
    const analyticOnly = Boolean(spacePostEnabled && (!spaceGrid?.useSdf || !spaceSdfReady));
    const spaceSurfaceEnabled = spacePostEnabled && spacePostMode === 1;
    const spaceVolumeEnabled = !!spaceGrid?.enabled && spaceModeRaw === "volume";
    const degradedSet = new Set<string>(this.spacetimeGridState.degradedReasons ?? []);
    if (spacingUsed > spaceSpacing * 1.01) degradedSet.add("coarse-spacing");
    if (sdfMissing) degradedSet.add("sdf-missing");
    else if (analyticOnly) degradedSet.add("analytic-only");
    const degradedReasons = Array.from(degradedSet);
    const spaceFieldSource =
      spaceGrid?.fieldSource ?? this.spacetimeGridState.fieldSource ?? "volume";
    const spaceWarpField =
      spaceGrid?.warpField ?? this.spacetimeGridState.warpField ?? "dfdr";
    const spaceWarpGamma = Number.isFinite(spaceGrid?.warpGamma)
      ? clamp(spaceGrid?.warpGamma as number, 0.1, 6)
      : this.spacetimeGridState.warpGamma;
    const spaceUseGradientDir =
      typeof spaceGrid?.useGradientDir === "boolean"
        ? spaceGrid.useGradientDir
        : this.spacetimeGridState.useGradientDir;
    const spaceStyle =
      spaceGrid?.style ?? this.spacetimeGridState.style ?? "scientific";
    const spaceLegacyPulseEnabled =
      typeof spaceGrid?.legacyPulseEnabled === "boolean"
        ? spaceGrid.legacyPulseEnabled
        : this.spacetimeGridState.legacyPulseEnabled;
    const spaceLegacyPulseRate = Number.isFinite(spaceGrid?.legacyPulseRate)
      ? clamp(spaceGrid?.legacyPulseRate as number, 0, 6)
      : this.spacetimeGridState.legacyPulseRate;
    const spaceLegacyPulseSpatialFreq = Number.isFinite(spaceGrid?.legacyPulseSpatialFreq)
      ? clamp(spaceGrid?.legacyPulseSpatialFreq as number, 0, 6)
      : this.spacetimeGridState.legacyPulseSpatialFreq;
    const spaceLegacyPointSize = Number.isFinite(spaceGrid?.legacyPointSize)
      ? clamp(spaceGrid?.legacyPointSize as number, 1, 24)
      : this.spacetimeGridState.legacyPointSize;
    const spaceLegacyPaletteMix = Number.isFinite(spaceGrid?.legacyPaletteMix)
      ? clamp(spaceGrid?.legacyPaletteMix as number, 0, 1)
      : this.spacetimeGridState.legacyPaletteMix;
    const spaceLegacyContrast = Number.isFinite(spaceGrid?.legacyContrast)
      ? clamp(spaceGrid?.legacyContrast as number, 0.1, 4)
      : this.spacetimeGridState.legacyContrast;
    const spaceLegacyLineAlpha = Number.isFinite(spaceGrid?.legacyLineAlpha)
      ? clamp(spaceGrid?.legacyLineAlpha as number, 0, 1)
      : this.spacetimeGridState.legacyLineAlpha;
    const spaceLegacyPointAlpha = Number.isFinite(spaceGrid?.legacyPointAlpha)
      ? clamp(spaceGrid?.legacyPointAlpha as number, 0, 1)
      : this.spacetimeGridState.legacyPointAlpha;
    const spaceDbg = {
      enabled: spaceEnabled === 1,
      mode: spaceModeRaw,
      fieldSource: spaceFieldSource,
      warpField: spaceWarpField,
      warpGamma: spaceWarpGamma,
      useGradientDir: spaceUseGradientDir,
      style: spaceStyle,
      legacyPulseEnabled: spaceLegacyPulseEnabled,
      legacyPulseRate: spaceLegacyPulseRate,
      legacyPulseSpatialFreq: spaceLegacyPulseSpatialFreq,
      legacyPointSize: spaceLegacyPointSize,
      legacyPaletteMix: spaceLegacyPaletteMix,
      legacyContrast: spaceLegacyContrast,
      legacyLineAlpha: spaceLegacyLineAlpha,
      legacyPointAlpha: spaceLegacyPointAlpha,
      spacing_m: spaceSpacing,
      spacingUsed_m: spacingUsed,
      falloff_m: spaceFalloff,
      falloffUsed_m: this.spacetimeGridState.falloffUsed_m,
      falloffRequested_m: this.spacetimeGridState.falloffRequested_m,
      falloffFromSpacing_m: this.spacetimeGridState.falloffFromSpacing_m,
      falloffFromR_m: this.spacetimeGridState.falloffFromR_m,
      falloffFromBounds_m: this.spacetimeGridState.falloffFromBounds_m,
      thetaNorm: spaceThetaNorm,
      sdf: {
        present: Boolean(spaceSdfReady),
        key: spaceSdfKey,
      },
      postEnabled: spacePostEnabled,
      postMode: spacePostModeLabel,
      volumeEnabled: spaceVolumeEnabled,
      surfaceEnabled: spaceSurfaceEnabled,
      bounds: {
        min: this.spacetimeGridState.boundsMin,
        size: this.spacetimeGridState.boundsSize,
        expandedBy_m: this.spacetimeGridState.boundsExpanded_m,
      },
      gpu: {
        formatReason: this.latticeUploadFormatReason ?? null,
        volumeReady,
        dfdrReady,
        volumeHash,
        dfdrHash: dfdrUpload?.hash ?? null,
        volumeBackend,
        dfdrBackend,
        volumeUseAtlas,
        dfdrUseAtlas,
      },
      degraded: {
        reasons: degradedReasons,
        spacingRequested_m: spaceSpacing,
        spacingUsed_m: spacingUsed,
        sdfMissing,
        analyticOnly,
      },
    };
    this.spacetimeGridTelemetry = spaceDbg;
    if (typeof window !== "undefined") {
      (window as any).__spacetimeGridDbg = spaceDbg;
    }

    if (loc.u_resolution) gl.uniform2f(loc.u_resolution, width, height);



    if (loc.u_phase) gl.uniform1f(loc.u_phase, phase);



    if (loc.u_showKHeat) gl.uniform1i(loc.u_showKHeat, kShow);



    if (loc.u_kMode) gl.uniform1i(loc.u_kMode, kMode);



    if (loc.u_kGain) gl.uniform1f(loc.u_kGain, kGain);



    if (loc.u_kAlpha) gl.uniform1f(loc.u_kAlpha, kAlpha);



    if (loc.u_showThetaIso) gl.uniform1i(loc.u_showThetaIso, isoShow);



    if (loc.u_isoStep) gl.uniform1f(loc.u_isoStep, isoStep);



    if (loc.u_isoWidth) gl.uniform1f(loc.u_isoWidth, isoWidth);



    if (loc.u_isoOpacity) gl.uniform1f(loc.u_isoOpacity, isoOpacity);



    if (loc.u_showFR) gl.uniform1i(loc.u_showFR, frShow);



    if (loc.u_tauLC) gl.uniform1f(loc.u_tauLC, tauLC);



    if (loc.u_burst) gl.uniform1f(loc.u_burst, burst);



    if (loc.u_dwell) gl.uniform1f(loc.u_dwell, dwell);



    if (loc.u_frAlpha) gl.uniform1f(loc.u_frAlpha, frAlpha);



    if (loc.u_showRecLamp) gl.uniform1i(loc.u_showRecLamp, recLampShow);



    if (loc.u_showSectorArc) gl.uniform1i(loc.u_showSectorArc, arcShow);



    if (loc.u_arcRadiusPx) gl.uniform1f(loc.u_arcRadiusPx, arcRadius);



    if (loc.u_arcWidthPx) gl.uniform1f(loc.u_arcWidthPx, arcWidth);



    if (loc.u_arcGapPx) gl.uniform1f(loc.u_arcGapPx, arcGap);



    if (loc.u_arcInstantAlpha) gl.uniform1f(loc.u_arcInstantAlpha, arcInstantAlpha);



    if (loc.u_arcEmaAlpha) gl.uniform1f(loc.u_arcEmaAlpha, arcEmaAlpha);



    if (loc.u_showTilt) gl.uniform1i(loc.u_showTilt, tiltShow);



    if (loc.u_tiltDir) gl.uniform2f(loc.u_tiltDir, tiltDir[0], tiltDir[1]);



    if (loc.u_tiltMag) gl.uniform1f(loc.u_tiltMag, tiltMag);



    if (loc.u_tiltAlpha) gl.uniform1f(loc.u_tiltAlpha, tiltAlpha);



    if (loc.u_showGreens) gl.uniform1i(loc.u_showGreens, greensShow);



    if (loc.u_greensSizePx) gl.uniform2f(loc.u_greensSizePx, greensSize[0], greensSize[1]);



    if (loc.u_greensOriginPx) gl.uniform2f(loc.u_greensOriginPx, greensOrigin[0], greensOrigin[1]);



    if (loc.u_greensRange) gl.uniform2f(loc.u_greensRange, greensRange[0], greensRange[1]);



    if (loc.u_greensAlpha) gl.uniform1f(loc.u_greensAlpha, greensAlpha);

    if (loc.u_skyboxEnabled) gl.uniform1i(loc.u_skyboxEnabled, skyboxReady ? 1 : 0);
    if (loc.u_skyboxMode) gl.uniform1i(loc.u_skyboxMode, skyboxModeIndex);
    if (loc.u_skyboxExposure) gl.uniform1f(loc.u_skyboxExposure, skyboxExposure);
    if (loc.u_geoSteps) gl.uniform1i(loc.u_geoSteps, geoSteps);
    if (loc.u_geoStep) gl.uniform1f(loc.u_geoStep, geoStep);
    if (loc.u_geoBend) gl.uniform1f(loc.u_geoBend, geoBend);
    if (loc.u_geoShift) gl.uniform1f(loc.u_geoShift, geoShift);
    if (loc.u_geoMaxDist) gl.uniform1f(loc.u_geoMaxDist, geoMaxDist);
    if (loc.u_geoFieldMode) gl.uniform1i(loc.u_geoFieldMode, geoFieldMode);
    if (loc.u_geoFieldRange) gl.uniform2f(loc.u_geoFieldRange, geoFieldRangeMin, geoFieldRangeMax);
    if (loc.u_envRotation) gl.uniform1f(loc.u_envRotation, envRotation);
    if (loc.u_invViewProj) gl.uniformMatrix4fv(loc.u_invViewProj, false, invViewProj);
    if (loc.u_cameraPos) gl.uniform3f(loc.u_cameraPos, cameraPos[0], cameraPos[1], cameraPos[2]);
    if (loc.u_axes) gl.uniform3f(loc.u_axes, state.axes[0], state.axes[1], state.axes[2]);
    if (loc.u_domainScale) gl.uniform1f(loc.u_domainScale, geoDomainScale);
    if (loc.u_R) gl.uniform1f(loc.u_R, Math.max(1e-4, state.R));
    if (loc.u_sigma) gl.uniform1f(loc.u_sigma, Math.max(1e-6, state.sigma));
    if (loc.u_beta) gl.uniform1f(loc.u_beta, state.beta);

    if (loc.u_metricMode) gl.uniform1i(loc.u_metricMode, metricMode);
    if (loc.u_geoScientific) gl.uniform1i(loc.u_geoScientific, metricScientificReady ? 1 : 0);
    if (loc.u_metricFieldEnabled) gl.uniform1i(loc.u_metricFieldEnabled, metricFieldEnabled);
    if (loc.u_metricDims) gl.uniform3f(loc.u_metricDims, metricDims[0], metricDims[1], metricDims[2]);

    if (loc.u_spaceGridEnabled) gl.uniform1i(loc.u_spaceGridEnabled, spaceEnabled);
    if (loc.u_spaceGridMode) gl.uniform1i(loc.u_spaceGridMode, spaceMode);
    if (loc.u_spaceGridHasSdf) gl.uniform1i(loc.u_spaceGridHasSdf, spaceHasSdf);
    if (loc.u_spaceGridColorBy) gl.uniform1i(loc.u_spaceGridColorBy, spaceColorBy);
    if (loc.u_spaceGridSpacing) gl.uniform1f(loc.u_spaceGridSpacing, spaceSpacing);
    if (loc.u_spaceGridWarp) gl.uniform1f(loc.u_spaceGridWarp, spaceWarp);
    if (loc.u_spaceGridFalloff) gl.uniform1f(loc.u_spaceGridFalloff, spaceFalloff);
    if (loc.u_spaceGridThetaNorm) gl.uniform1f(loc.u_spaceGridThetaNorm, spaceThetaNorm);
    if (loc.u_spaceGridDomainScale) gl.uniform1f(loc.u_spaceGridDomainScale, spaceDomainScale);
    if (loc.u_spaceGridWorldToLattice) gl.uniformMatrix4fv(loc.u_spaceGridWorldToLattice, false, spaceWorldToLattice);
    if (loc.u_spaceGridLatticeMin) gl.uniform3f(loc.u_spaceGridLatticeMin, spaceLatticeMin[0], spaceLatticeMin[1], spaceLatticeMin[2]);
    if (loc.u_spaceGridLatticeSize) gl.uniform3f(loc.u_spaceGridLatticeSize, spaceLatticeSize[0], spaceLatticeSize[1], spaceLatticeSize[2]);
    if (loc.u_spaceGridDims) gl.uniform3f(loc.u_spaceGridDims, spaceLatticeDims[0], spaceLatticeDims[1], spaceLatticeDims[2]);
    if (loc.u_spaceGridAtlasTiles) gl.uniform2f(loc.u_spaceGridAtlasTiles, spaceAtlasTiles[0], spaceAtlasTiles[1]);
    if (loc.u_spaceGridSliceInvSize) gl.uniform2f(loc.u_spaceGridSliceInvSize, spaceSliceInvSize[0], spaceSliceInvSize[1]);
    if (loc.u_spaceGridUseAtlas) gl.uniform1i(loc.u_spaceGridUseAtlas, spaceUseAtlas);



    gl.activeTexture(gl.TEXTURE0);



    gl.bindTexture(gl.TEXTURE_2D, this.resources.rayColorTex);



    if (loc.u_colorTex) gl.uniform1i(loc.u_colorTex, 0);



    gl.activeTexture(gl.TEXTURE1);



    gl.bindTexture(gl.TEXTURE_2D, this.resources.rayAuxTex);



    if (loc.u_auxTex) gl.uniform1i(loc.u_auxTex, 1);



    const idTex = this.rayIdEnabled && this.resources.rayIdTex ? this.resources.rayIdTex : this.ensureFallback2D();
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, idTex);
    if (loc.u_idTex) gl.uniform1i(loc.u_idTex, 8);



    const ringInstantTex = this.ringInstantTex ?? this.ensureFallback2D();



    const ringAverageTex = this.ringAverageTex ?? ringInstantTex;



    gl.activeTexture(gl.TEXTURE2);



    gl.bindTexture(gl.TEXTURE_2D, ringInstantTex);



    if (loc.u_ringInstantTex) gl.uniform1i(loc.u_ringInstantTex, 2);



    gl.activeTexture(gl.TEXTURE3);



    gl.bindTexture(gl.TEXTURE_2D, ringAverageTex);



    if (loc.u_ringAverageTex) gl.uniform1i(loc.u_ringAverageTex, 3);



    gl.activeTexture(gl.TEXTURE4);



    if (greensShow && greensCfg?.texture) {



      gl.bindTexture(gl.TEXTURE_2D, greensCfg.texture);



    } else {



      gl.bindTexture(gl.TEXTURE_2D, this.ensureFallback2D());



    }



    if (loc.u_greensTex) gl.uniform1i(loc.u_greensTex, 4);


    if (this.postSpaceGridEnabled) {
      gl.activeTexture(gl.TEXTURE5);
      const spaceGridSdfTex =
        spaceHasSdf && !spaceUseAtlas && this.latticeSdfTex ? this.latticeSdfTex : this.ensureDummy3D();
      gl.bindTexture(gl.TEXTURE_3D, spaceGridSdfTex);
      if (loc.u_spaceGridSdf) gl.uniform1i(loc.u_spaceGridSdf, 5);

      gl.activeTexture(gl.TEXTURE6);
      const spaceGridSdfAtlasTex =
        spaceHasSdf && spaceUseAtlas && this.latticeSdfAtlasTex
          ? this.latticeSdfAtlasTex
          : this.ensureFallback2D();
      gl.bindTexture(gl.TEXTURE_2D, spaceGridSdfAtlasTex);
      if (loc.u_spaceGridSdfAtlas) gl.uniform1i(loc.u_spaceGridSdfAtlas, 6);
    }







    const envTex = skyboxReady && this.skyboxTexture ? this.skyboxTexture : this.ensureFallback2D();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, envTex);
    if (loc.u_envMap) gl.uniform1i(loc.u_envMap, 7);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_3D, geoFieldTex);
    if (loc.u_geoFieldTex) gl.uniform1i(loc.u_geoFieldTex, 9);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_3D, metricABTex);
    if (loc.u_metricABTex) gl.uniform1i(loc.u_metricABTex, 10);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_3D, metricGammaTex);
    if (loc.u_metricGammaTex) gl.uniform1i(loc.u_metricGammaTex, 11);

    gl.bindVertexArray(this.resources.quadVao);



    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);



    gl.bindVertexArray(null);



    gl.activeTexture(gl.TEXTURE11);

    gl.bindTexture(gl.TEXTURE_3D, null);

    gl.activeTexture(gl.TEXTURE10);

    gl.bindTexture(gl.TEXTURE_3D, null);

    gl.activeTexture(gl.TEXTURE9);

    gl.bindTexture(gl.TEXTURE_3D, null);

    gl.activeTexture(gl.TEXTURE8);

    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.activeTexture(gl.TEXTURE7);

    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.activeTexture(gl.TEXTURE6);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.activeTexture(gl.TEXTURE5);



    gl.bindTexture(gl.TEXTURE_3D, null);



    gl.activeTexture(gl.TEXTURE4);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.activeTexture(gl.TEXTURE3);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.activeTexture(gl.TEXTURE2);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.activeTexture(gl.TEXTURE1);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.activeTexture(gl.TEXTURE0);



    gl.bindTexture(gl.TEXTURE_2D, null);



  }











  private drawBetaOverlay(mvp: Float32Array, state: Hull3DRendererState) {



    const { gl } = this;



    if (!this.betaOverlayProgram || !this.surfaceVao || !this.betaOverlayUniforms) return;



    const u = this.betaOverlayUniforms;



    gl.enable(gl.BLEND);



    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);



    gl.useProgram(this.betaOverlayProgram);

    // Visual-only knobs from shared store (display only; physics unaffected)
    const phys = useHull3DSharedStore.getState().physics;
    const yGainRaw = Math.max(0, Number.isFinite(phys?.yGain) ? (phys!.yGain) : 1) * Math.pow(10, (Number(phys?.trimDb ?? 0)) / 20);







    const yGain = phys?.locked ? 1 : yGainRaw;



    const yBias = 0.0;



    const kColor = Math.max(0, Number.isFinite(phys?.kColor) ? (phys!.kColor) : 1);



    const alpha = 0.45;

    const tiltCfg = state.overlays?.tilt;
    const tiltEnabled = Boolean(tiltCfg?.enabled && tiltCfg?.dir);
    const tiltDir = (tiltCfg?.dir ?? [0, 0]) as [number, number];
    const dbgWindow = typeof window !== "undefined" ? (window as any) : undefined;
    const thetaSign = (Math.sign(state.thetaSign ?? 1) || 1) * (dbgWindow?.__hullThetaSign === -1 ? -1 : 1);
    const tiltMag = Math.max(0, Math.min(1, tiltCfg?.magnitude ?? 0));
    const tiltAlphaBase = tiltCfg?.alpha ?? 0.85;
    const tiltAlpha = Math.max(0, Math.min(1, tiltAlphaBase));



    const viz = this.resolveVolumeViz(state);
    if (viz === "alpha") {
      gl.disable(gl.BLEND);
      return;
    }



    const vizIndex = VOLUME_VIZ_TO_INDEX[viz];



    const gateView = Number.isFinite(state.gateView) ? state.gateView : state.gate;



    const floorThetaGR = Math.max(0, state.vizFloorThetaGR ?? 1e-9);



    const floorRhoGR = Math.max(0, state.vizFloorRhoGR ?? 1e-18);



    const floorThetaDrive = Math.max(0, state.vizFloorThetaDrive ?? 1e-6);







    if (u.u_axes) gl.uniform3f(u.u_axes, state.axes[0], state.axes[1], state.axes[2]);



    if (u.u_sigma) gl.uniform1f(u.u_sigma, state.sigma);



    if (u.u_R) gl.uniform1f(u.u_R, Math.max(0.1, state.R));

    if (u.u_domainScale) gl.uniform1f(u.u_domainScale, this.domainScale);



    if (u.u_beta) gl.uniform1f(u.u_beta, state.beta);

    if (u.u_thetaSign) gl.uniform1f(u.u_thetaSign, thetaSign);



    if (u.u_viz) gl.uniform1i(u.u_viz, vizIndex);



    if (u.u_ampChain) gl.uniform1f(u.u_ampChain, state.ampChain);



    if (u.u_gate) gl.uniform1f(u.u_gate, state.gate);



    if (u.u_gate_view) gl.uniform1f(u.u_gate_view, gateView);



    if (u.u_duty) gl.uniform1f(u.u_duty, Math.max(0, Math.min(1, state.duty)));



    if (u.u_yGain) gl.uniform1f(u.u_yGain, yGain);



    if (u.u_yBias) gl.uniform1f(u.u_yBias, yBias);



    if (u.u_kColor) gl.uniform1f(u.u_kColor, kColor);



    if (u.u_mvp) gl.uniformMatrix4fv(u.u_mvp, false, mvp);



    if (u.u_totalSectors) gl.uniform1i(u.u_totalSectors, state.totalSectors | 0);



    if (u.u_liveSectors) gl.uniform1i(u.u_liveSectors, state.liveSectors | 0);



    if (u.u_lumpExp) gl.uniform1f(u.u_lumpExp, state.lumpExp);



    if (u.u_sectorCenter) gl.uniform1f(u.u_sectorCenter, state.sectorCenter01);



    if (u.u_sectorSigma) gl.uniform1f(u.u_sectorSigma, Math.max(1e-4, state.gaussianSigma));



    if (u.u_sectorFloor) gl.uniform1f(u.u_sectorFloor, Math.min(0.99, Math.max(0, state.sectorFloor)));



    if (u.u_syncMode) gl.uniform1i(u.u_syncMode, state.syncMode | 0);



    this.uniformCache.set1f(gl, u.u_phase01, state.phase01);



    if (u.u_splitEnabled) gl.uniform1i(u.u_splitEnabled, state.splitEnabled ? 1 : 0);



    if (u.u_splitFrac) gl.uniform1f(u.u_splitFrac, state.splitFrac);



    if (u.u_vizFloorThetaGR) gl.uniform1f(u.u_vizFloorThetaGR, floorThetaGR);



    if (u.u_vizFloorRhoGR) gl.uniform1f(u.u_vizFloorRhoGR, floorRhoGR);



    if (u.u_vizFloorThetaDrive) gl.uniform1f(u.u_vizFloorThetaDrive, floorThetaDrive);
    this.uniformCache.set1i(gl, u.u_showTilt, tiltEnabled ? 1 : 0);
    if (u.u_tiltDir) gl.uniform2f(u.u_tiltDir, tiltDir[0], tiltDir[1]);
    this.uniformCache.set1f(gl, u.u_tiltMag, tiltMag);
    this.uniformCache.set1f(gl, u.u_tiltAlpha, tiltAlpha);







    const betaTarget = state.betaTarget_ms2 ?? DEFAULT_BETA_TARGET;



    const comfort = state.comfort_ms2 ?? DEFAULT_COMFORT;



    const dims = state.hullDims ?? this.derivedHullDims;



    const betaTex = state.betaTexture ?? this.ensureBetaFallbackTexture(state.betaUniform_ms2 ?? betaTarget);



    if (!betaTex) {
      gl.disable(gl.BLEND);
      return;
    }



    gl.activeTexture(gl.TEXTURE0);



    gl.bindTexture(gl.TEXTURE_2D, betaTex);



    if (u.uBetaTex) gl.uniform1i(u.uBetaTex, 0);



    if (u.uBetaTarget) gl.uniform1f(u.uBetaTarget, betaTarget);



    if (u.uComfort) gl.uniform1f(u.uComfort, comfort);



    if (u.uHullDims) gl.uniform3f(u.uHullDims, dims[0], dims[1], dims[2]);



    if (u.uAlpha) gl.uniform1f(u.uAlpha, alpha);







    this.drawSurfaceGridGeometry(gl);



    gl.bindTexture(gl.TEXTURE_2D, null);



    gl.disable(gl.BLEND);







    this.updateBetaTelemetry(state, comfort);



  }







  private ensureDiagFBO() {



    if (this.diagFBO && this.diagColorTex) return;



    const { gl } = this;



    this.diagFBO = gl.createFramebuffer();



    this.diagColorTex = gl.createTexture();



    if (!this.diagFBO || !this.diagColorTex) {



      this.diagFBO = null; this.diagColorTex = null; return;



    }



    gl.bindTexture(gl.TEXTURE_2D, this.diagColorTex);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.diagSize, this.diagSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);



    gl.bindFramebuffer(gl.FRAMEBUFFER, this.diagFBO);



    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.diagColorTex, 0);



    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);



    if (status !== gl.FRAMEBUFFER_COMPLETE) {



      console.warn("[Hull3DRenderer] Diagnostic FBO incomplete:", status);



    }



    gl.bindFramebuffer(gl.FRAMEBUFFER, null);



    gl.bindTexture(gl.TEXTURE_2D, null);



  }







  private ensureRayTargets(width: number, height: number): boolean {



    const { gl } = this;



    const res = this.resources;



    if (!res.rayFbo) res.rayFbo = gl.createFramebuffer();



    if (!res.rayColorTex) res.rayColorTex = gl.createTexture();



    if (!res.rayAuxTex) res.rayAuxTex = gl.createTexture();

    if (!res.rayIdTex) res.rayIdTex = gl.createTexture();
    if (!res.rayIdTex) this.rayIdEnabled = false;


    if (!res.rayFbo || !res.rayColorTex || !res.rayAuxTex) {



      console.warn("[Hull3DRenderer] Failed to allocate ray targets");



      return false;



    }



    const needsResize = this.rayTargetSize[0] !== width || this.rayTargetSize[1] !== height;



    const needsInit = this.rayAuxInternalFormat === 0 || this.rayAuxType === 0;
    const needsIdInit = !!res.rayIdTex && !this.rayIdEnabled;


    if (!needsResize && !needsInit && !needsIdInit) {



      return true;



    }

    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (
      this.rayTargetFailure.failCount > 0 &&
      this.rayTargetFailure.width === width &&
      this.rayTargetFailure.height === height &&
      nowMs < this.rayTargetFailure.nextRetryAtMs
    ) {
      return false;
    }







    gl.bindTexture(gl.TEXTURE_2D, res.rayColorTex);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);







    const candidates: Array<{ internal: number; type: number }> = needsInit



      ? (



        this.supportsColorFloat



          ? [



              { internal: gl.RGBA16F, type: gl.HALF_FLOAT },



              { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE },



            ]



          : [{ internal: gl.RGBA8, type: gl.UNSIGNED_BYTE }]



      )



      : [{ internal: this.rayAuxInternalFormat, type: this.rayAuxType }];







    let ok = false;
    let idEnabled = false;
    const hasIdTex = !!res.rayIdTex;


    for (const cand of candidates) {



      gl.bindTexture(gl.TEXTURE_2D, res.rayAuxTex);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



      gl.texImage2D(gl.TEXTURE_2D, 0, cand.internal, width, height, 0, gl.RGBA, cand.type, null);



      if (hasIdTex) {



        gl.bindTexture(gl.TEXTURE_2D, res.rayIdTex);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);



      }







      gl.bindFramebuffer(gl.FRAMEBUFFER, res.rayFbo);



      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.rayColorTex, 0);



      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, res.rayAuxTex, 0);



      if (hasIdTex) {



        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, res.rayIdTex, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);



      } else {



        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);



      }



      let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status != gl.FRAMEBUFFER_COMPLETE && hasIdTex) {



        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, null, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        idEnabled = false;



      } else if (status == gl.FRAMEBUFFER_COMPLETE && hasIdTex) {



        idEnabled = true;



      }



      if (status === gl.FRAMEBUFFER_COMPLETE) {



        this.rayAuxInternalFormat = cand.internal;



        this.rayAuxType = cand.type;



        ok = true;



        break;



      } else {



        console.warn("[Hull3DRenderer] Ray FBO incomplete, retrying with fallback format", status);



      }



    }







        gl.bindFramebuffer(gl.FRAMEBUFFER, null);



    gl.bindTexture(gl.TEXTURE_2D, null);







    if (!ok) {



      const sameSize =
        this.rayTargetFailure.width === width &&
        this.rayTargetFailure.height === height;
      const failCount = sameSize ? this.rayTargetFailure.failCount + 1 : 1;
      const retryDelayMs = Math.min(10_000, 400 * Math.pow(2, failCount - 1));
      this.rayTargetFailure = {
        width,
        height,
        failCount,
        nextRetryAtMs: nowMs + retryDelayMs,
      };
      console.error("[Hull3DRenderer] Unable to allocate auxiliary render target", {
        failCount,
        retryDelayMs,
      });
      this.rayIdEnabled = false;
      this.rayTargetSize = [width, height];



      return false;



    }







    this.rayIdEnabled = idEnabled;
    this.rayTargetFailure = {
      width: 0,
      height: 0,
      nextRetryAtMs: 0,
      failCount: 0,
    };


    this.rayTargetSize = [width, height];



    return true;



  }











  private ensureDummy3D(): WebGLTexture {



    if (this.dummyVolumeTex) return this.dummyVolumeTex;



    const { gl } = this;



    const tex = gl.createTexture();



    if (!tex) {



      throw new Error("Hull3DRenderer: failed to allocate dummy 3D texture");



    }



    gl.bindTexture(gl.TEXTURE_3D, tex);



    const data = new Uint8Array([0]);



    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);



    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);



    gl.bindTexture(gl.TEXTURE_3D, null);



    this.dummyVolumeTex = tex;



    return tex;



  }

      private ensureCurvatureTextures() {
    const { gl } = this;
    if (!this.curvature.texA) {
      this.curvature.texA = this.createCurvatureTexture();
      this.curvature.front = 0;
    }
    if (!this.curvature.texB) {
      this.curvature.texB = this.createCurvatureTexture();
    }
  }

  private createCurvatureTexture(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) {
      throw new Error("Hull3DRenderer: failed to allocate curvature texture");
    }
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, 1, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
  }

  private ensureCurvatureFallback(): WebGLTexture {
    if (this.curvature.fallback) return this.curvature.fallback;
    const tex = this.createCurvatureTexture();
    this.curvature.fallback = tex;
    return tex;
  }

  private getActiveCurvatureTexture(): WebGLTexture {
    this.ensureCurvatureTextures();
    const active = this.curvature.front === 0 ? this.curvature.texA : this.curvature.texB;
    return active ?? this.ensureCurvatureFallback();
  }

  private maybeStampCurvatureTexture(tex: WebGLTexture | null) {
    if (!tex || typeof window === "undefined") return;
    const stamp = window.__hullCurvStampGPU;
    if (!stamp) {
      this.curvatureStampWarned = false;
      return;
    }
    try {
      const dims = this.curvature?.dims ?? [1, 1, 1];
      stampCurvTex3D(this.gl, tex, dims, stamp);
    } catch (err) {
      if (!this.curvatureStampWarned) {
        console.warn("[Hull3DRenderer] curvature stamp failed:", err);
        this.curvatureStampWarned = true;
      }
    }
  }

  private handleCurvatureBrick(payload: any) {
    if (!payload || typeof payload !== "object") return;

    const versionRaw = Number((payload as any).version ?? 0);
    if (!Number.isFinite(versionRaw)) return;
    if (versionRaw <= this.curvature.version) return;

    const dimsRaw = (payload as any).dims;
    if (!Array.isArray(dimsRaw) || dimsRaw.length !== 3) return;

    const dims: [number, number, number] = [
      Math.max(1, Number(dimsRaw[0]) | 0),
      Math.max(1, Number(dimsRaw[1]) | 0),
      Math.max(1, Number(dimsRaw[2]) | 0),
    ];

    const t00Payload = (payload as any).t00;
    const dataSource = (payload as any).data ?? (t00Payload as any)?.data;
    let data: Float32Array | null = null;
    if (dataSource instanceof Float32Array) {
      data = dataSource;
    } else if (dataSource instanceof ArrayBuffer) {
      data = new Float32Array(dataSource);
    } else if (Array.isArray(dataSource)) {
      data = new Float32Array(dataSource);
    } else if (dataSource && ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
      try {
        data = new Float32Array(dataSource.buffer);
      } catch {
        data = null;
      }
    }

    if (!data) return;

    const expected = dims[0] * dims[1] * dims[2];
    if (data.length < expected) return;

    const upload = data.length === expected ? data : data.subarray(0, expected);

    const alphaRaw = Number((payload as any).emaAlpha);
    const emaAlpha = Number.isFinite(alphaRaw) ? Math.min(1, Math.max(1e-3, alphaRaw)) : 0.18;
    const clampMinRaw = Number((payload as any).residualMin);
    const clampMaxRaw = Number((payload as any).residualMax);
    let clampMin = Number.isFinite(clampMinRaw) ? clampMinRaw : -8.0;
    let clampMax = Number.isFinite(clampMaxRaw) ? clampMaxRaw : 8.0;
    if (clampMax < clampMin) {
      const tmp = clampMax;
      clampMax = clampMin;
      clampMin = tmp;
    }
    if (Number.isFinite(clampMinRaw) && Number.isFinite(clampMaxRaw)) {
      const statsAlpha = Number.isFinite(alphaRaw) ? emaAlpha : 0.5;
      const blend = clamp(statsAlpha, 1e-3, 1);
      if (!this._curvStats) {
        this._curvStats = { emaMin: clampMin, emaMax: clampMax };
      } else {
        const keep = 1 - blend;
        this._curvStats.emaMin = keep * this._curvStats.emaMin + blend * clampMin;
        this._curvStats.emaMax = keep * this._curvStats.emaMax + blend * clampMax;
      }
    }
    this.curvature.range = [clampMin, clampMax];
    const resized = this.curvature.emaResidual.length !== expected;
    if (resized) {
      this.curvature.emaResidual = new Float32Array(expected);
    }
    const ema = this.curvature.emaResidual;
    const prime = resized || !this.curvature.hasData;
    for (let i = 0; i < expected; i++) {
      const sample = Number.isFinite(upload[i]) ? upload[i] : 0;
      const target = Math.min(clampMax, Math.max(clampMin, sample));
      if (prime) {
        ema[i] = target;
      } else {
        const prev = ema[i];
        const blended = prev + (target - prev) * emaAlpha;
        ema[i] = Math.min(clampMax, Math.max(clampMin, blended));
      }
    }

    this.ensureCurvatureTextures();
    const back = this.curvature.front === 0 ? this.curvature.texB : this.curvature.texA;
    if (!back) return;

    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_3D, back);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, dims[0], dims[1], dims[2], 0, gl.RED, gl.FLOAT, ema);
    gl.bindTexture(gl.TEXTURE_3D, null);

    this.curvature.front = (this.curvature.front ^ 1) as 0 | 1;
    this.curvature.dims = dims;
    this.curvature.version = versionRaw;
    this.curvature.updatedAt = Number((payload as any).updatedAt ?? Date.now());
    this.curvature.hasData = true;
  }





  // --- T00 volume (|T00|) helpers -------------------------------------------------
  private ensureT00Textures() {
    const { gl } = this;
    if (!this.t00.texA) {
      this.t00.texA = this.createCurvatureTexture();
      this.t00.front = 0;
    }
    if (!this.t00.texB) {
      this.t00.texB = this.createCurvatureTexture();
    }
  }

  private ensureT00Fallback(): WebGLTexture {
    if (this.t00.fallback) return this.t00.fallback;
    const tex = this.createCurvatureTexture();
    this.t00.fallback = tex;
    return tex;
  }

  private getActiveT00Texture(): WebGLTexture {
    this.ensureT00Textures();
    const active = this.t00.front === 0 ? this.t00.texA : this.t00.texB;
    return active ?? this.ensureT00Fallback();
  }

  private maybeStampT00Texture(tex: WebGLTexture | null) {
    if (!tex || typeof window === "undefined") return;
    const stamp = (window as any).__hullT00StampGPU;
    if (!stamp) {
      this.t00StampWarned = false;
      return;
    }
    try {
      const dims = this.t00?.dims ?? [1, 1, 1];
      stampCurvTex3D(this.gl, tex, dims, stamp);
    } catch (err) {
      if (!this.t00StampWarned) {
        console.warn("[Hull3DRenderer] T00 stamp failed:", err);
        this.t00StampWarned = true;
      }
    }
  }

  private handleT00Brick(payload: any) {
    if (!payload || typeof payload !== "object") return;

    const versionRaw = Number((payload as any).version ?? 0);
    if (!Number.isFinite(versionRaw)) return;
    if (versionRaw <= this.t00.version) return;

    const dimsRaw = (payload as any).dims;
    if (!Array.isArray(dimsRaw) || dimsRaw.length !== 3) return;

    const dims: [number, number, number] = [
      Math.max(1, Number(dimsRaw[0]) | 0),
      Math.max(1, Number(dimsRaw[1]) | 0),
      Math.max(1, Number(dimsRaw[2]) | 0),
    ];

    const t00Payload = (payload as any).t00;
    const dataSource = (payload as any).data ?? (t00Payload as any)?.data;
    let data: Float32Array | null = null;
    if (dataSource instanceof Float32Array) {
      data = dataSource;
    } else if (dataSource instanceof ArrayBuffer) {
      data = new Float32Array(dataSource);
    } else if (Array.isArray(dataSource)) {
      data = new Float32Array(dataSource);
    } else if (dataSource && ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
      try {
        data = new Float32Array(dataSource.buffer);
      } catch {
        data = null;
      }
    }

    if (!data) return;
    const expected = dims[0] * dims[1] * dims[2];
    if (data.length < expected) return;

    const upload = data.length === expected ? data : data.subarray(0, expected);

    const minRaw = Number((payload as any).min ?? (t00Payload as any)?.min);
    const maxRaw = Number((payload as any).max ?? (t00Payload as any)?.max);
    this.t00Raw = {
      dims,
      t00: upload,
      min: Number.isFinite(minRaw) ? minRaw : undefined,
      max: Number.isFinite(maxRaw) ? maxRaw : undefined,
      stats: (payload as any).stats,
      meta: (payload as any).meta,
      version: versionRaw,
      updatedAt: Number((payload as any).updatedAt ?? Date.now()),
    };
    this.refreshT00FieldTexture();
    this.t00.dims = dims;
    this.t00.version = versionRaw;
    this.t00.updatedAt = Number((payload as any).updatedAt ?? Date.now());
    this.t00.hasData = true;
  }

  private refreshT00FieldTexture() {
    if (!this.t00Raw) return;
    const dims = this.t00Raw.dims;
    const expected = dims[0] * dims[1] * dims[2];
    const t00 = this.t00Raw.t00.length === expected ? this.t00Raw.t00 : this.t00Raw.t00.subarray(0, expected);
    let upload = t00;
    let min = Number.isFinite(this.t00Raw.min) ? Number(this.t00Raw.min) : Number.POSITIVE_INFINITY;
    let max = Number.isFinite(this.t00Raw.max) ? Number(this.t00Raw.max) : Number.NEGATIVE_INFINITY;
    const observerRobust = this.t00Raw.stats?.observerRobust;

    if (observerRobust && this.fluxField && this.fluxField.dims.join("x") === dims.join("x")) {
      const field = buildObserverFrameField(
        {
          dims,
          t00: { data: t00, min, max },
          flux: {
            Sx: { data: this.fluxField.Sx, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
            Sy: { data: this.fluxField.Sy, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
            Sz: { data: this.fluxField.Sz, min: -this.fluxField.maxMag, max: this.fluxField.maxMag },
            divS: { data: new Float32Array(expected), min: 0, max: 0 },
          },
          stats: { observerRobust } as any,
        } as any,
        this.observerSelection,
      );
      if (field) {
        upload = field.data;
        min = field.min;
        max = field.max;
      }
    }

    const absSpan = Math.max(Math.abs(Number.isFinite(min) ? min : 0), Math.abs(Number.isFinite(max) ? max : 0), 1e-12);
    this.t00.range = [absSpan, absSpan];
    this.ensureT00Textures();
    const back = this.t00.front === 0 ? this.t00.texB : this.t00.texA;
    if (!back) return;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_3D, back);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, dims[0], dims[1], dims[2], 0, gl.RED, gl.FLOAT, upload);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.t00.front = (this.t00.front ^ 1) as 0 | 1;
  }

  private handleFluxBrick(payload: any) {
    if (!payload || typeof payload !== "object") return;

    const versionRaw = Number((payload as any).version ?? 0);
    if (!Number.isFinite(versionRaw)) return;
    if (this.fluxField && versionRaw <= this.fluxField.version) return;

    const dimsRaw = (payload as any).dims;
    if (!Array.isArray(dimsRaw) || dimsRaw.length !== 3) return;

    const dims: [number, number, number] = [
      Math.max(1, Number(dimsRaw[0]) | 0),
      Math.max(1, Number(dimsRaw[1]) | 0),
      Math.max(1, Number(dimsRaw[2]) | 0),
    ];

    const flux = (payload as any).flux ?? payload;
    const coerceFloat32 = (dataSource: any): Float32Array | null => {
      if (dataSource instanceof Float32Array) return dataSource;
      if (dataSource instanceof ArrayBuffer) return new Float32Array(dataSource);
      if (Array.isArray(dataSource)) return new Float32Array(dataSource);
      if (dataSource && ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
        try {
          return new Float32Array(dataSource.buffer);
        } catch {
          return null;
        }
      }
      return null;
    };

    const resolveChannel = (channel: any) => {
      const raw = channel?.data ?? channel;
      return {
        data: coerceFloat32(raw),
        min: Number(channel?.min),
        max: Number(channel?.max),
      };
    };

    const sxChan = resolveChannel((flux as any)?.Sx);
    const syChan = resolveChannel((flux as any)?.Sy);
    const szChan = resolveChannel((flux as any)?.Sz);
    if (!sxChan.data || !syChan.data || !szChan.data) return;

    const expected = dims[0] * dims[1] * dims[2];
    if (sxChan.data.length < expected || syChan.data.length < expected || szChan.data.length < expected) {
      return;
    }

    const absFromMinMax = (channel: { min: number; max: number }) => {
      const minRaw = channel.min;
      const maxRaw = channel.max;
      const abs = Math.max(Math.abs(minRaw), Math.abs(maxRaw));
      return Number.isFinite(abs) ? abs : 0;
    };

    let maxAbs = Math.max(absFromMinMax(sxChan), absFromMinMax(syChan), absFromMinMax(szChan));
    if (!Number.isFinite(maxAbs) || maxAbs <= 0) {
      maxAbs = 0;
      for (let i = 0; i < expected; i += 1) {
        const ax = Math.abs(sxChan.data[i] ?? 0);
        const ay = Math.abs(syChan.data[i] ?? 0);
        const az = Math.abs(szChan.data[i] ?? 0);
        if (ax > maxAbs) maxAbs = ax;
        if (ay > maxAbs) maxAbs = ay;
        if (az > maxAbs) maxAbs = az;
      }
    }

    const maxMag = Math.sqrt(3) * Math.max(0, maxAbs);
    const avgMagRaw = Number((payload as any).stats?.avgFluxMagnitude ?? (flux as any)?.stats?.avgFluxMagnitude);
    const avgMag = Number.isFinite(avgMagRaw) ? avgMagRaw : undefined;

    this.fluxField = {
      dims,
      Sx: sxChan.data.length === expected ? sxChan.data : sxChan.data.subarray(0, expected),
      Sy: syChan.data.length === expected ? syChan.data : syChan.data.subarray(0, expected),
      Sz: szChan.data.length === expected ? szChan.data : szChan.data.subarray(0, expected),
      maxMag,
      version: versionRaw,
      updatedAt: Number((payload as any).updatedAt ?? Date.now()),
      ...(avgMag !== undefined ? { avgMag } : {}),
    };
    this.refreshT00FieldTexture();
    this.overlayCache.fluxStreamKey = "";
  }

  private coerceFloat32Channel(dataSource: any): Float32Array | null {
    if (dataSource instanceof Float32Array) return dataSource;
    if (dataSource instanceof ArrayBuffer) return new Float32Array(dataSource);
    if (Array.isArray(dataSource)) return new Float32Array(dataSource);
    if (dataSource && ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
      try {
        const byteOffset = Number(dataSource.byteOffset ?? 0);
        const byteLength = Number(dataSource.byteLength ?? dataSource.buffer.byteLength ?? 0);
        const safeLength = Math.max(0, Math.floor(byteLength / 4));
        return new Float32Array(dataSource.buffer, byteOffset, safeLength);
      } catch {
        return null;
      }
    }
    return null;
  }

  private createMetricTextureRGBA(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) {
      throw new Error("Hull3DRenderer: failed to allocate metric texture");
    }
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA32F,
      1,
      1,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array([0, 0, 0, 0]),
    );
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
  }

  private ensureMetricTextures() {
    if (!this.metricVolume.texAB) {
      this.metricVolume.texAB = this.createMetricTextureRGBA();
    }
    if (!this.metricVolume.texGamma) {
      this.metricVolume.texGamma = this.createMetricTextureRGBA();
    }
  }

  private ensureMetricFallbackAB(): WebGLTexture {
    if (this.metricVolume.fallbackAB) return this.metricVolume.fallbackAB;
    this.metricVolume.fallbackAB = this.createMetricTextureRGBA();
    return this.metricVolume.fallbackAB;
  }

  private ensureMetricFallbackGamma(): WebGLTexture {
    if (this.metricVolume.fallbackGamma) return this.metricVolume.fallbackGamma;
    this.metricVolume.fallbackGamma = this.createMetricTextureRGBA();
    return this.metricVolume.fallbackGamma;
  }

  private getActiveMetricABTexture(): WebGLTexture {
    return this.metricVolume.texAB ?? this.ensureMetricFallbackAB();
  }

  private getActiveMetricGammaTexture(): WebGLTexture {
    return this.metricVolume.texGamma ?? this.ensureMetricFallbackGamma();
  }

  private evaluateMetricGeodesicDiagnostics(args: {
    dims: [number, number, number];
    voxelSize: [number, number, number];
    alpha: Float32Array;
    betaX: Float32Array;
    betaY: Float32Array;
    betaZ: Float32Array;
    gammaXX: Float32Array;
    gammaYY: Float32Array;
    gammaZZ: Float32Array;
  }): { maxNullResidual: number; stepConvergence: number; bundleSpread: number } {
    const dims = args.dims;
    const nx = Math.max(1, dims[0] | 0);
    const ny = Math.max(1, dims[1] | 0);
    const nz = Math.max(1, dims[2] | 0);
    const total = nx * ny * nz;
    const alpha = args.alpha;
    const betaX = args.betaX;
    const betaY = args.betaY;
    const betaZ = args.betaZ;
    const gammaXX = args.gammaXX;
    const gammaYY = args.gammaYY;
    const gammaZZ = args.gammaZZ;
    const dx = Math.max(1e-9, Number(args.voxelSize[0] ?? 1));
    const dy = Math.max(1e-9, Number(args.voxelSize[1] ?? 1));
    const dz = Math.max(1e-9, Number(args.voxelSize[2] ?? 1));
    const derivScale = [0, 1 / (2 * dx), 1 / (2 * dy), 1 / (2 * dz)];

    const clampi = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
    const idx = (ix: number, iy: number, iz: number) => iz * nx * ny + iy * nx + ix;
    const comp = (vec: number[], i: number) => vec[i] ?? 0;
    const safe = (value: number, fallback: number) =>
      Number.isFinite(value) ? value : fallback;

    const metricFromComponents = (
      aIn: number,
      bxIn: number,
      byIn: number,
      bzIn: number,
      gxxIn: number,
      gyyIn: number,
      gzzIn: number,
    ) => {
      const a = Math.max(1e-6, safe(aIn, 1));
      const gxx = Math.max(1e-6, safe(gxxIn, 1));
      const gyy = Math.max(1e-6, safe(gyyIn, 1));
      const gzz = Math.max(1e-6, safe(gzzIn, 1));
      const bx = safe(bxIn, 0);
      const by = safe(byIn, 0);
      const bz = safe(bzIn, 0);
      const g00 = -(a * a) + gxx * bx * bx + gyy * by * by + gzz * bz * bz;
      const g01 = gxx * bx;
      const g02 = gyy * by;
      const g03 = gzz * bz;
      const g = [
        [g00, g01, g02, g03],
        [g01, gxx, 0, 0],
        [g02, 0, gyy, 0],
        [g03, 0, 0, gzz],
      ];
      const invA2 = 1 / Math.max(a * a, 1e-12);
      const invGxx = 1 / gxx;
      const invGyy = 1 / gyy;
      const invGzz = 1 / gzz;
      const gInv = [
        [-invA2, bx * invA2, by * invA2, bz * invA2],
        [bx * invA2, invGxx - (bx * bx) * invA2, -(bx * by) * invA2, -(bx * bz) * invA2],
        [by * invA2, -(by * bx) * invA2, invGyy - (by * by) * invA2, -(by * bz) * invA2],
        [bz * invA2, -(bz * bx) * invA2, -(bz * by) * invA2, invGzz - (bz * bz) * invA2],
      ];
      return { g, gInv };
    };

    const sampleMetricAt = (ixIn: number, iyIn: number, izIn: number) => {
      const ix = clampi(ixIn, 0, nx - 1);
      const iy = clampi(iyIn, 0, ny - 1);
      const iz = clampi(izIn, 0, nz - 1);
      const i = idx(ix, iy, iz);
      return metricFromComponents(
        alpha[i] ?? 1,
        betaX[i] ?? 0,
        betaY[i] ?? 0,
        betaZ[i] ?? 0,
        gammaXX[i] ?? 1,
        gammaYY[i] ?? 1,
        gammaZZ[i] ?? 1,
      );
    };

    const ic = clampi(Math.floor(nx * 0.5), 0, nx - 1);
    const jc = clampi(Math.floor(ny * 0.5), 0, ny - 1);
    const kc = clampi(Math.floor(nz * 0.5), 0, nz - 1);

    const center = sampleMetricAt(ic, jc, kc);
    const g = center.g;
    const gInv = center.gInv;
    const dG = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => new Array<number>(4).fill(0)),
    );

    for (let deriv = 1; deriv <= 3; deriv += 1) {
      const plus =
        deriv === 1
          ? sampleMetricAt(ic + 1, jc, kc)
          : deriv === 2
            ? sampleMetricAt(ic, jc + 1, kc)
            : sampleMetricAt(ic, jc, kc + 1);
      const minus =
        deriv === 1
          ? sampleMetricAt(ic - 1, jc, kc)
          : deriv === 2
            ? sampleMetricAt(ic, jc - 1, kc)
            : sampleMetricAt(ic, jc, kc - 1);
      for (let a = 0; a < 4; a += 1) {
        for (let b = 0; b < 4; b += 1) {
          dG[deriv][a][b] = (plus.g[a][b] - minus.g[a][b]) * derivScale[deriv];
        }
      }
    }

    const christoffel = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => new Array<number>(4).fill(0)),
    );
    for (let mu = 0; mu < 4; mu += 1) {
      for (let a = 0; a < 4; a += 1) {
        for (let b = 0; b < 4; b += 1) {
          let acc = 0;
          for (let nu = 0; nu < 4; nu += 1) {
            const dABNu = dG[a][b][nu];
            const dBANu = dG[b][a][nu];
            const dNuAB = dG[nu][a][b];
            acc += 0.5 * gInv[mu][nu] * (dABNu + dBANu - dNuAB);
          }
          christoffel[mu][a][b] = acc;
        }
      }
    }

    const solveNullK0 = (spatial: number[]) => {
      const sx = spatial[0];
      const sy = spatial[1];
      const sz = spatial[2];
      const A = g[0][0];
      const B = 2 * (g[0][1] * sx + g[0][2] * sy + g[0][3] * sz);
      const C =
        g[1][1] * sx * sx +
        g[2][2] * sy * sy +
        g[3][3] * sz * sz +
        2 * (g[1][2] * sx * sy + g[1][3] * sx * sz + g[2][3] * sy * sz);
      const disc = Math.max(0, B * B - 4 * A * C);
      const root = Math.sqrt(disc);
      const denom = Math.abs(2 * A) > 1e-12 ? 2 * A : A < 0 ? -2e-12 : 2e-12;
      const r1 = (-B - root) / denom;
      const r2 = (-B + root) / denom;
      if (Number.isFinite(r1) && r1 > 0) return r1;
      if (Number.isFinite(r2) && r2 > 0) return r2;
      if (Number.isFinite(r1)) return r1;
      if (Number.isFinite(r2)) return r2;
      return 1;
    };

    const nullResidual = (k: number[]) => {
      let acc = 0;
      for (let a = 0; a < 4; a += 1) {
        for (let b = 0; b < 4; b += 1) {
          acc += g[a][b] * k[a] * k[b];
        }
      }
      return Math.abs(acc);
    };

    const rhs = (state: { x: number[]; k: number[] }) => {
      const dxdt = [...state.k];
      const dkdt = [0, 0, 0, 0];
      for (let mu = 0; mu < 4; mu += 1) {
        let acc = 0;
        for (let a = 0; a < 4; a += 1) {
          for (let b = 0; b < 4; b += 1) {
            acc += christoffel[mu][a][b] * state.k[a] * state.k[b];
          }
        }
        dkdt[mu] = -acc;
      }
      return { dxdt, dkdt };
    };

    const rk4Step = (state: { x: number[]; k: number[] }, h: number) => {
      const k1 = rhs(state);
      const s2 = {
        x: state.x.map((v, i) => v + 0.5 * h * k1.dxdt[i]),
        k: state.k.map((v, i) => v + 0.5 * h * k1.dkdt[i]),
      };
      const k2 = rhs(s2);
      const s3 = {
        x: state.x.map((v, i) => v + 0.5 * h * k2.dxdt[i]),
        k: state.k.map((v, i) => v + 0.5 * h * k2.dkdt[i]),
      };
      const k3 = rhs(s3);
      const s4 = {
        x: state.x.map((v, i) => v + h * k3.dxdt[i]),
        k: state.k.map((v, i) => v + h * k3.dkdt[i]),
      };
      const k4 = rhs(s4);
      const xNext = state.x.map(
        (v, i) =>
          v +
          (h / 6) *
            (k1.dxdt[i] + 2 * k2.dxdt[i] + 2 * k3.dxdt[i] + k4.dxdt[i]),
      );
      const kNext = state.k.map(
        (v, i) =>
          v +
          (h / 6) *
            (k1.dkdt[i] + 2 * k2.dkdt[i] + 2 * k3.dkdt[i] + k4.dkdt[i]),
      );
      return { x: xNext, k: kNext };
    };

    const dirs = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, -1, 0],
      [1, 0, 1],
      [1, 0, -1],
      [0, 1, 1],
      [0, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
      [1, 1, -1],
    ].map((v) => {
      const mag = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / mag, v[1] / mag, v[2] / mag];
    });

    let maxNullResidual = 0;
    const endpoints: Array<[number, number, number]> = [];
    const h = Math.max(1e-4, Math.min(dx, dy, dz) * 0.5);
    const bundleSteps = 10;
    for (const dir of dirs) {
      const spatial = [dir[0], dir[1], dir[2]];
      const k0 = solveNullK0(spatial);
      const kVec = [k0, spatial[0], spatial[1], spatial[2]];
      const residual = nullResidual(kVec);
      if (residual > maxNullResidual) maxNullResidual = residual;

      let state = { x: [0, 0, 0, 0], k: kVec };
      for (let step = 0; step < bundleSteps; step += 1) {
        state = rk4Step(state, h);
      }
      endpoints.push([comp(state.x, 1), comp(state.x, 2), comp(state.x, 3)]);
    }

    const mean = endpoints.reduce(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
      [0, 0, 0] as [number, number, number],
    );
    const invN = endpoints.length > 0 ? 1 / endpoints.length : 1;
    const meanPoint: [number, number, number] = [mean[0] * invN, mean[1] * invN, mean[2] * invN];
    let spreadSq = 0;
    for (const p of endpoints) {
      const dxp = p[0] - meanPoint[0];
      const dyp = p[1] - meanPoint[1];
      const dzp = p[2] - meanPoint[2];
      spreadSq += dxp * dxp + dyp * dyp + dzp * dzp;
    }
    const bundleSpread = endpoints.length > 0 ? Math.sqrt(spreadSq / endpoints.length) : 0;

    const refDir = [1, 0.25, -0.2];
    const refMag = Math.hypot(refDir[0], refDir[1], refDir[2]) || 1;
    const refSpatial = [refDir[0] / refMag, refDir[1] / refMag, refDir[2] / refMag];
    const refK0 = solveNullK0(refSpatial);
    const refState = { x: [0, 0, 0, 0], k: [refK0, refSpatial[0], refSpatial[1], refSpatial[2]] };
    const full = rk4Step(refState, h);
    const halfA = rk4Step(refState, h * 0.5);
    const halfB = rk4Step(halfA, h * 0.5);
    const diff = Math.hypot(
      comp(full.x, 1) - comp(halfB.x, 1),
      comp(full.x, 2) - comp(halfB.x, 2),
      comp(full.x, 3) - comp(halfB.x, 3),
    );
    const scale = Math.max(
      1e-9,
      Math.hypot(comp(halfB.x, 1), comp(halfB.x, 2), comp(halfB.x, 3)),
    );
    const stepConvergence = diff / scale;

    return {
      maxNullResidual: Number.isFinite(maxNullResidual) ? maxNullResidual : 0,
      stepConvergence: Number.isFinite(stepConvergence) ? stepConvergence : 0,
      bundleSpread: Number.isFinite(bundleSpread) ? bundleSpread : 0,
    };
  }

  private publishGeodesicDiagnostics(partial?: Partial<HullGeodesicDiagnostics>, force = false) {
    if (partial) {
      this.geodesicDiagnostics = {
        ...this.geodesicDiagnostics,
        ...partial,
      };
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && now - this.geodesicDiagLastPublishMs < 400) return;
    this.geodesicDiagLastPublishMs = now;
    const payload: HullGeodesicDiagnostics = {
      ...this.geodesicDiagnostics,
      updatedAt: Date.now(),
    };
    publish(DEFAULT_GEODESIC_DIAGNOSTICS_CHANNEL, payload);
    if (typeof window !== "undefined") {
      (window as any).__hullGeodesicDiagnostics = payload;
    }
  }

  private handleMetricVolume(payload: MetricVolumeMessage) {
    if (!payload || typeof payload !== "object") return;
    const versionRaw = Number(payload.version ?? 0);
    if (!Number.isFinite(versionRaw)) return;
    if (versionRaw <= this.metricVolume.version) return;

    const dimsRaw = payload.dims;
    if (!Array.isArray(dimsRaw) || dimsRaw.length !== 3) return;
    const dims: [number, number, number] = [
      Math.max(1, Number(dimsRaw[0]) | 0),
      Math.max(1, Number(dimsRaw[1]) | 0),
      Math.max(1, Number(dimsRaw[2]) | 0),
    ];
    const expected = dims[0] * dims[1] * dims[2];
    if (!Number.isFinite(expected) || expected <= 0) return;

    const channels = (payload.channels ?? {}) as Record<string, any>;
    const decodeChannel = (key: string): { data: Float32Array; min: number; max: number } | null => {
      const entry = channels[key];
      if (!entry) return null;
      const source = entry?.data ?? entry;
      const data = this.coerceFloat32Channel(source);
      if (!data || data.length < expected) return null;
      const min = Number(entry?.min);
      const max = Number(entry?.max);
      return {
        data: data.length === expected ? data : data.subarray(0, expected),
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 0,
      };
    };

    const alpha = decodeChannel("alpha");
    const betaX = decodeChannel("beta_x");
    const betaY = decodeChannel("beta_y");
    const betaZ = decodeChannel("beta_z");
    const gammaXX = decodeChannel("gamma_xx");
    const gammaYY = decodeChannel("gamma_yy");
    const gammaZZ = decodeChannel("gamma_zz");
    if (!alpha || !betaX || !betaY || !betaZ || !gammaXX || !gammaYY || !gammaZZ) return;

    const packedAB = new Float32Array(expected * 4);
    const packedGamma = new Float32Array(expected * 4);
    let finiteCount = 0;
    let alphaPositive = 0;
    let gammaPositive = 0;
    let alphaMin = Number.POSITIVE_INFINITY;
    let alphaMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < expected; i += 1) {
      const a = alpha.data[i];
      const bx = betaX.data[i];
      const by = betaY.data[i];
      const bz = betaZ.data[i];
      const gxx = gammaXX.data[i];
      const gyy = gammaYY.data[i];
      const gzz = gammaZZ.data[i];
      if (
        Number.isFinite(a) &&
        Number.isFinite(bx) &&
        Number.isFinite(by) &&
        Number.isFinite(bz) &&
        Number.isFinite(gxx) &&
        Number.isFinite(gyy) &&
        Number.isFinite(gzz)
      ) {
        finiteCount += 1;
      }
      if (a > 0) alphaPositive += 1;
      if (gxx > 0 && gyy > 0 && gzz > 0) gammaPositive += 1;
      if (a < alphaMin) alphaMin = a;
      if (a > alphaMax) alphaMax = a;
      const k = i * 4;
      packedAB[k + 0] = Number.isFinite(bx) ? bx : 0;
      packedAB[k + 1] = Number.isFinite(by) ? by : 0;
      packedAB[k + 2] = Number.isFinite(bz) ? bz : 0;
      packedAB[k + 3] = Number.isFinite(a) && a > 1e-8 ? a : 1;
      packedGamma[k + 0] = Number.isFinite(gxx) && gxx > 1e-8 ? gxx : 1;
      packedGamma[k + 1] = Number.isFinite(gyy) && gyy > 1e-8 ? gyy : 1;
      packedGamma[k + 2] = Number.isFinite(gzz) && gzz > 1e-8 ? gzz : 1;
      packedGamma[k + 3] = 0;
    }
    const invExpected = expected > 0 ? 1 / expected : 1;
    const finiteFrac = finiteCount * invExpected;
    const alphaFrac = alphaPositive * invExpected;
    const gammaFrac = gammaPositive * invExpected;

    let consistency: "ok" | "warn" | "fail" = "ok";
    if (finiteFrac < 0.9 || alphaFrac < 0.9 || gammaFrac < 0.9) consistency = "fail";
    else if (finiteFrac < 0.995 || alphaFrac < 0.995 || gammaFrac < 0.995) consistency = "warn";
    const consistencyNote = `finite=${(finiteFrac * 100).toFixed(2)}% alpha>0=${(alphaFrac * 100).toFixed(2)}% gamma>0=${(gammaFrac * 100).toFixed(2)}%`;

    this.ensureMetricTextures();
    if (!this.metricVolume.texAB || !this.metricVolume.texGamma) return;

    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_3D, this.metricVolume.texAB);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA32F,
      dims[0],
      dims[1],
      dims[2],
      0,
      gl.RGBA,
      gl.FLOAT,
      packedAB,
    );
    gl.bindTexture(gl.TEXTURE_3D, this.metricVolume.texGamma);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA32F,
      dims[0],
      dims[1],
      dims[2],
      0,
      gl.RGBA,
      gl.FLOAT,
      packedGamma,
    );
    gl.bindTexture(gl.TEXTURE_3D, null);

    const voxelRaw = payload.voxelSize_m;
    const voxelSize: [number, number, number] = [
      Math.max(1e-9, Number(voxelRaw?.[0] ?? 1)),
      Math.max(1e-9, Number(voxelRaw?.[1] ?? 1)),
      Math.max(1e-9, Number(voxelRaw?.[2] ?? 1)),
    ];
    const diag = this.evaluateMetricGeodesicDiagnostics({
      dims,
      voxelSize,
      alpha: alpha.data,
      betaX: betaX.data,
      betaY: betaY.data,
      betaZ: betaZ.data,
      gammaXX: gammaXX.data,
      gammaYY: gammaYY.data,
      gammaZZ: gammaZZ.data,
    });

    this.metricVolume.hasData = consistency !== "fail";
    this.metricVolume.dims = dims;
    this.metricVolume.version = versionRaw;
    this.metricVolume.updatedAt = Number(payload.updatedAt ?? Date.now());
    this.metricVolume.source = typeof payload.source === "string" ? payload.source : "metric-volume";
    this.metricVolume.chart = typeof payload.chart === "string" ? payload.chart : "comoving_cartesian";
    this.metricVolume.consistency = consistency;
    this.metricVolume.consistencyNote = consistencyNote;
    this.metricVolume.alphaRange = [
      Number.isFinite(alphaMin) ? alphaMin : 1,
      Number.isFinite(alphaMax) ? alphaMax : 1,
    ];

    this.publishGeodesicDiagnostics(
      {
        metricAvailable: this.metricVolume.hasData,
        metricSource: this.metricVolume.source,
        chart: this.metricVolume.chart,
        dims,
        maxNullResidual: diag.maxNullResidual,
        stepConvergence: diag.stepConvergence,
        bundleSpread: diag.bundleSpread,
        consistency,
        consistencyNote,
      },
      true,
    );
  }

  private ensureFallback2D(): WebGLTexture {



    if (this.fallbackTex2D) return this.fallbackTex2D;



    const { gl } = this;



    const tex = gl.createTexture();



    if (!tex) {



      throw new Error("Hull3DRenderer: failed to allocate fallback 2D texture");



    }



    gl.bindTexture(gl.TEXTURE_2D, tex);



    const data = new Uint8Array([0, 0, 0, 255]);



    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);



    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);



    gl.bindTexture(gl.TEXTURE_2D, null);



    this.fallbackTex2D = tex;



    return tex;



  }







  private ensureSkyboxConfig() {
    if (this.skyboxConfigRequested || this.skyboxConfigFailed) return;
    this.skyboxConfigRequested = true;
    fetch(SKYBOX_CONFIG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Skybox config HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        if (this.disposed) return;
        this.skyboxConfig = normalizeSkyboxConfig(raw);
        this.skyboxTexturePath = null;
      })
      .catch((err) => {
        if (this.disposed) return;
        this.skyboxConfigFailed = true;
        console.warn("[Hull3DRenderer] Skybox config load failed", err);
      });
  }

  private ensureSkyboxTexture() {
    if (this.skyboxTexturePending) return;
    const cfg = this.skyboxConfig;
    if (!cfg.texture) return;
    if (this.skyboxTexture && this.skyboxTexturePath === cfg.texture) return;

    const { gl } = this;
    const src = cfg.texture;
    const img = new Image();
    this.skyboxTexturePending = true;
    img.onload = () => {
      if (this.disposed) return;
      const tex = gl.createTexture();
      if (!tex) {
        this.skyboxTexturePending = false;
        return;
      }
      const isPow2 = (value: number) => (value & (value - 1)) === 0;
      const useMips = isPow2(img.width) && isPow2(img.height);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (useMips) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      if (this.skyboxTexture) {
        gl.deleteTexture(this.skyboxTexture);
      }
      this.skyboxTexture = tex;
      this.skyboxTexturePath = src;
      this.skyboxTexturePending = false;
    };
    img.onerror = (err) => {
      this.skyboxTexturePending = false;
      console.warn("[Hull3DRenderer] Skybox texture load failed", err);
    };
    img.src = src;
  }

  private ensureHarnessWhiteProgram() {



    if (this.harnessWhiteProgram) return;



    try {



      this.harnessWhiteProgram = linkProgram(this.gl, "Hull3D::testWhite", WHITE_TEST_VS, WHITE_TEST_FS);



    } catch (err) {



      console.error("[Hull3DRenderer] Failed to create harness white shader", err);



      this.harnessWhiteProgram = null;



    }



  }







  private runDiagnosticProbe(state: Hull3DRendererState, camera: { eye: Vec3 }, invViewProj: Float32Array) {



    try {



      this.ensureDiagFBO();



      const { gl } = this;



      if (!this.diagFBO || !this.diagColorTex || !this.resources.rayProgram || !this.ringInstantTex || !this.radialTex) {



        this._diag.state = 'idle';



        return;



      }



      const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);



      const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;



      gl.bindFramebuffer(gl.FRAMEBUFFER, this.diagFBO);



      gl.viewport(0, 0, this.diagSize, this.diagSize);



      gl.clearColor(0, 0, 0, 1);



      gl.clearColor(0, 0, 0, 0);



      gl.clear(gl.COLOR_BUFFER_BIT);



      gl.useProgram(this.resources.rayProgram);



      const loc = {



        u_volume: gl.getUniformLocation(this.resources.rayProgram, "u_volume"),
        u_gateVolume: gl.getUniformLocation(this.resources.rayProgram, "u_gateVolume"),



        u_ringInstant: gl.getUniformLocation(this.resources.rayProgram, "u_ringInstant"),



        u_ringAverage: gl.getUniformLocation(this.resources.rayProgram, "u_ringAverage"),



        u_radialLUT: gl.getUniformLocation(this.resources.rayProgram, "u_radialLUT"),



        u_volumeAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_volumeAtlas"),



        u_curvTex: gl.getUniformLocation(this.resources.rayProgram, "u_curvTex"),



        u_curvGain: gl.getUniformLocation(this.resources.rayProgram, "u_curvGain"),



        u_curvAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_curvAlpha"),



        u_curvPaletteMode: gl.getUniformLocation(this.resources.rayProgram, "u_curvPaletteMode"),



        u_axes: gl.getUniformLocation(this.resources.rayProgram, "u_axes"),



        u_domainScale: gl.getUniformLocation(this.resources.rayProgram, "u_domainScale"),



        u_beta: gl.getUniformLocation(this.resources.rayProgram, "u_beta"),



        u_metricMode: gl.getUniformLocation(this.resources.rayProgram, "u_metricMode"),



        u_ampChain: gl.getUniformLocation(this.resources.rayProgram, "u_ampChain"),



        u_gate: gl.getUniformLocation(this.resources.rayProgram, "u_gate"),



        u_fActive: gl.getUniformLocation(this.resources.rayProgram, "u_fActive"),



        u_lumpExp: gl.getUniformLocation(this.resources.rayProgram, "u_lumpExp"),



        u_hasLatticeVolume: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeVolume"),
        u_worldToLattice: gl.getUniformLocation(this.resources.rayProgram, "u_worldToLattice"),
        u_latticeMin: gl.getUniformLocation(this.resources.rayProgram, "u_latticeMin"),
        u_latticeSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSize"),



        u_latticePacked: gl.getUniformLocation(this.resources.rayProgram, "u_latticePacked"),
        u_latticeUseAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeUseAtlas"),
        u_latticeDynamicWeights: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDynamicWeights"),
        u_latticeDims: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDims"),
        u_latticeAtlasTiles: gl.getUniformLocation(this.resources.rayProgram, "u_latticeAtlasTiles"),
        u_latticeSliceInvSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSliceInvSize"),
        u_hasLatticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeSdf"),
        u_latticeSdfBand_m: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfBand_m"),
        u_latticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdf"),
        u_latticeSdfAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfAtlas"),



        u_phase01: gl.getUniformLocation(this.resources.rayProgram, "u_phase01"),



        u_phaseSign: gl.getUniformLocation(this.resources.rayProgram, "u_phaseSign"),

        u_thetaSign: gl.getUniformLocation(this.resources.rayProgram, "u_thetaSign"),



        u_blend: gl.getUniformLocation(this.resources.rayProgram, "u_blend"),



        u_densityScale: gl.getUniformLocation(this.resources.rayProgram, "u_densityScale"),



        u_stepBias: gl.getUniformLocation(this.resources.rayProgram, "u_stepBias"),



        u_maxSteps: gl.getUniformLocation(this.resources.rayProgram, "u_maxSteps"),



        u_radialScale: gl.getUniformLocation(this.resources.rayProgram, "u_radialScale"),



        u_radialMax: gl.getUniformLocation(this.resources.rayProgram, "u_radialMax"),



        u_invR: gl.getUniformLocation(this.resources.rayProgram, "u_invR"),



        u_timeSec: gl.getUniformLocation(this.resources.rayProgram, "u_timeSec"),



  u_sigma: gl.getUniformLocation(this.resources.rayProgram, "u_sigma"),



        u_cameraPos: gl.getUniformLocation(this.resources.rayProgram, "u_cameraPos"),



        u_invViewProj: gl.getUniformLocation(this.resources.rayProgram, "u_invViewProj"),



        u_forceFlatGate: gl.getUniformLocation(this.resources.rayProgram, "u_forceFlatGate"),



        u_debugMode: gl.getUniformLocation(this.resources.rayProgram, "u_debugMode"),



        u_probeMode: gl.getUniformLocation(this.resources.rayProgram, "u_probeMode"),



        u_probeGain: gl.getUniformLocation(this.resources.rayProgram, "u_probeGain"),



        u_testMode: gl.getUniformLocation(this.resources.rayProgram, "u_testMode"),



        u_baseScale: gl.getUniformLocation(this.resources.rayProgram, "u_baseScale"),



        u_volumeViz: gl.getUniformLocation(this.resources.rayProgram, "u_volumeViz"),
        u_volumeSource: gl.getUniformLocation(this.resources.rayProgram, "u_volumeSource"),

        u_volumeDomain: gl.getUniformLocation(this.resources.rayProgram, "u_volumeDomain"),

        u_opacityWindow: gl.getUniformLocation(this.resources.rayProgram, "u_opacityWindow"),

        u_grThetaGain: gl.getUniformLocation(this.resources.rayProgram, "u_grThetaGain"),



        u_grRhoGain: gl.getUniformLocation(this.resources.rayProgram, "u_grRhoGain"),



        u_vizFloorThetaGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaGR"),



        u_vizFloorRhoGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorRhoGR"),



        u_vizFloorThetaDrive: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaDrive"),



      };



      const volumeTex = this.volumeTex ?? this.ensureDummy3D();



      const ringInstantTex = this.ringInstantTex!;



      const ringAverageTex = this.ringAverageTex ?? ringInstantTex;



      const curvTex = this.curvature.hasData ? this.getActiveCurvatureTexture() : this.ensureCurvatureFallback();



      gl.activeTexture(gl.TEXTURE0);



      gl.bindTexture(gl.TEXTURE_3D, volumeTex);



      gl.uniform1i(loc.u_volume, 0);



      const gateTex = this.gateVolumeTex ?? this.ensureDummy3D();
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_3D, gateTex);
      if (loc.u_gateVolume) gl.uniform1i(loc.u_gateVolume, 6);
      const volumeSource = this.resolveVolumeSource(state);
      const useLattice = volumeSource === "lattice";
      const activeLattice =
        useLattice && state.latticeVolume && this.latticeUpload && this.latticeUpload.hash === state.latticeVolume.hash
          ? this.latticeUpload
          : null;
      const hasLattice = !!activeLattice;
      const latticePacked = !!activeLattice?.format.packedRG;
      const latticeUseAtlas = !!activeLattice && activeLattice.format.backend === "atlas2d";
      const latticeDynamicWeights = state.latticeWeightMode === "dynamic";
      const latticeDims = activeLattice?.dims ?? [1, 1, 1];
      const atlas = activeLattice?.format.atlas;

      if (loc.u_hasLatticeVolume) gl.uniform1i(loc.u_hasLatticeVolume, hasLattice ? 1 : 0);
      if (loc.u_latticePacked) gl.uniform1i(loc.u_latticePacked, latticePacked ? 1 : 0);
      if (loc.u_latticeUseAtlas) gl.uniform1i(loc.u_latticeUseAtlas, latticeUseAtlas ? 1 : 0);
      if (loc.u_latticeDynamicWeights) gl.uniform1i(loc.u_latticeDynamicWeights, latticeDynamicWeights ? 1 : 0);
      if (loc.u_latticeDims) gl.uniform3f(loc.u_latticeDims, latticeDims[0], latticeDims[1], latticeDims[2]);
      if (loc.u_latticeAtlasTiles) {
        gl.uniform2f(loc.u_latticeAtlasTiles, atlas?.tilesX ?? 1, atlas?.tilesY ?? 1);
      }
      if (loc.u_latticeSliceInvSize) {
        gl.uniform2f(
          loc.u_latticeSliceInvSize,
          1 / Math.max(1, latticeDims[0]),
          1 / Math.max(1, latticeDims[1]),
        );
      }
      if (loc.u_volumeAtlas) {
        const atlasTex =
          latticeUseAtlas && this.latticeAtlasTex ? this.latticeAtlasTex : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1i(loc.u_volumeAtlas, 7);
      }

      const hasLatticeSdf = !!(
        useLattice &&
        hasLattice &&
        state.latticeSdf &&
        this.latticeSdfReadyKey &&
        this.latticeSdfReadyKey === state.latticeSdf.key
      );

      if (loc.u_hasLatticeSdf) gl.uniform1i(loc.u_hasLatticeSdf, hasLatticeSdf ? 1 : 0);
      const sdfBandMetersRaw = state.latticeSdf?.band ?? 0;
      const sdfBandMeters =
        hasLatticeSdf && Number.isFinite(sdfBandMetersRaw) ? Math.max(0, sdfBandMetersRaw) : 0;
      if (loc.u_latticeSdfBand_m) gl.uniform1f(loc.u_latticeSdfBand_m, sdfBandMeters);

      if (loc.u_latticeSdf) {
        const sdfTex3D =
          hasLatticeSdf && !latticeUseAtlas && this.latticeSdfTex ? this.latticeSdfTex : this.ensureDummy3D();
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_3D, sdfTex3D);
        gl.uniform1i(loc.u_latticeSdf, 8);
      }

      if (loc.u_latticeSdfAtlas) {
        const sdfAtlas =
          hasLatticeSdf && latticeUseAtlas && this.latticeSdfAtlasTex
            ? this.latticeSdfAtlasTex
            : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, sdfAtlas);
        gl.uniform1i(loc.u_latticeSdfAtlas, 9);
      }

      if (loc.u_worldToLattice) {
        const mat = state.latticeWorldToLattice ?? new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ]);
        gl.uniformMatrix4fv(loc.u_worldToLattice, false, mat);
      }
      if (loc.u_latticeMin) {
        const min = state.latticeMin ?? [0, 0, 0];
        gl.uniform3fv(loc.u_latticeMin, min as any);
      }
      if (loc.u_latticeSize) {
        const size = state.latticeSize ?? [1, 1, 1];
        gl.uniform3fv(loc.u_latticeSize, size as any);
      }

      gl.activeTexture(gl.TEXTURE1);



      gl.bindTexture(gl.TEXTURE_2D, ringInstantTex);



      gl.uniform1i(loc.u_ringInstant, 1);



      gl.activeTexture(gl.TEXTURE2);



      gl.bindTexture(gl.TEXTURE_2D, ringAverageTex);



      gl.uniform1i(loc.u_ringAverage, 2);



      gl.activeTexture(gl.TEXTURE3);



      gl.bindTexture(gl.TEXTURE_2D, this.radialTex);



      gl.uniform1i(loc.u_radialLUT, 3);



      gl.activeTexture(gl.TEXTURE4);



      gl.bindTexture(gl.TEXTURE_3D, curvTex);



      if (loc.u_curvTex) gl.uniform1i(loc.u_curvTex, 4);



      const dbgPhaseSign = (typeof window !== "undefined" && (window as any).__hullPhaseSign === -1) ? -1 : 1;



      const statePhaseSign = Math.sign(state.phaseSign ?? 1) || 1;



      this.phaseSignEffective = statePhaseSign * dbgPhaseSign;



      const userExposure = Number.isFinite(state.exposure as number) ? (state.exposure as number) : undefined;



      const exposureBase = userExposure ?? 1.0;



      const effectiveExposure = clamp(exposureBase * this.autoGain, 1e-4, 1e4);



      const densityScale = this.resolveDensityScale(state, effectiveExposure);



      this.lastDensityScale = densityScale;



      const baseScale = this.resolveBaseScale(state);



      const volumeVizIndex = this.resolveVolumeVizIndex(state);



      const volumeSourceIndex = VOLUME_SOURCE_TO_INDEX[this.resolveVolumeSource(state)];



      const volumeDomainIndex = this.resolveVolumeDomainIndex(state);



      const opacityWindow = this.opacityWindow ?? DEFAULT_OPACITY_WINDOW;



      const gateForGain = Number.isFinite(state.gateView) ? state.gateView : state.gate;



      const driveChain = Math.abs(state.ampChain) * Math.max(gateForGain, 1e-6);



      const grThetaGain = Math.max(driveChain * 0.6, 1e-12);



      const grRhoGain = clamp(driveChain * 0.03, 1e-12, 1e12);



      const invR =
        volumeSourceIndex === 0 ? 1.0 : 1.0 / Math.max(state.R, 1e-6);
      this.applyRayUniforms(gl, loc, state, {



        densityScale,



        stepBias: this.qualityProfile.stepBias,



        maxSteps: Math.max(24, Math.floor(this.qualityProfile.maxSteps * 0.4)),



        cameraEye: camera.eye,



        invViewProj: invViewProj,



        phaseSign: this.phaseSignEffective,



        phase01: state.phase01,



        invR,



        timeSec: state.timeSec ?? 0,



        blend: clamp(state.blendFactor, 0, 1),



        fActive: this.fActiveResolved,



        baseScale,



        sigma: state.sigma,



        volumeVizIndex,



        volumeSourceIndex,



        volumeDomainIndex,



        opacityWindow,



        grThetaGain,



        grRhoGain,



        forceFlatGate: false,



        debugMode: 0,



        probeMode: 0,



        probeGain: 0,



        testMode: 0,



      });







      const probeGain = Math.max(0.1, densityScale * this.diagProbeGainFactor);



      const bufferSize = this.diagSize * this.diagSize * 4;



      if (!this.diagBuffer || this.diagBuffer.length !== bufferSize) {



        this.diagBuffer = new Uint8Array(bufferSize);



      }



      const buf = this.diagBuffer;







      const analyzeBuffer = (data: Uint8Array) => {



        let sum = 0;



        let sumAlpha = 0;



        let maxL = 0;



        const pxCount = data.length / 4;



        for (let i = 0; i < data.length; i += 4) {



          const r = data[i] / 255;



          // RGB are equal in probe mode; sample red channel.



          sum += r;



          if (r > maxL) maxL = r;



          sumAlpha += data[i + 3] / 255;



        }



        return {



          mean: pxCount > 0 ? sum / pxCount : 0,



          max: maxL,



          coverage: pxCount > 0 ? sumAlpha / pxCount : 0,



        };



      };







      const drawProbe = (mode: 'base' | 'gated') => {



        gl.clear(gl.COLOR_BUFFER_BIT);



        if (loc.u_probeMode) gl.uniform1i(loc.u_probeMode, mode === 'base' ? 1 : 2);



        if (loc.u_forceFlatGate) gl.uniform1i(loc.u_forceFlatGate, mode === 'base' ? 1 : 0);



        if (loc.u_probeGain) gl.uniform1f(loc.u_probeGain, probeGain);



        gl.bindVertexArray(this.resources.quadVao);



        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);



        gl.bindVertexArray(null);



        gl.readPixels(0, 0, this.diagSize, this.diagSize, gl.RGBA, gl.UNSIGNED_BYTE, buf!);



        return analyzeBuffer(buf!);



      };







      const baseSample = drawProbe('base');



      const gatedSample = drawProbe('gated');







      if (loc.u_forceFlatGate) gl.uniform1i(loc.u_forceFlatGate, 0);



      if (loc.u_probeMode) gl.uniform1i(loc.u_probeMode, 0);



      if (loc.u_probeGain) gl.uniform1f(loc.u_probeGain, 0);







      const coverageActiveBase = baseSample.coverage > this.diagCoverageGrace;



      const coverageActiveGated = gatedSample.coverage > this.diagCoverageGrace;



      const baseOk = !coverageActiveBase || baseSample.mean >= this.diagBaseThreshold;



      const gatedOk = !coverageActiveGated || gatedSample.mean >= this.diagGatedThreshold;







      const prevMode = this._diag.lastMode;



      let status: 'ok'|'base_dark'|'gated_dark'|'both_dark' = 'ok';



      if (!baseOk && !gatedOk) status = 'both_dark';



      else if (!baseOk) status = 'base_dark';



      else if (!gatedOk) status = 'gated_dark';







      if (status === 'ok') {



        this._diag.lowCount = 0;



        this._diag.okCount = Math.min(this.diagClearFrames, this._diag.okCount + 1);



      } else {



        this._diag.lowCount = Math.min(this.diagTripFrames, this._diag.lowCount + 1);



        this._diag.okCount = 0;



      }



      const triggered = status !== 'ok' && this._diag.lowCount >= this.diagTripFrames;



      const clearing = status === 'ok' && this._diag.okCount >= this.diagClearFrames;







      this._diag.lastMode = status;



      this._diag.lastLuma = gatedSample.mean;



      this._diag.lastCoverage = gatedSample.coverage;



      this._diag.lastOk = !triggered;







      const lumaForAuto = coverageActiveGated && gatedSample.mean > 0.0



        ? gatedSample.mean



        : (coverageActiveBase ? baseSample.mean : gatedSample.mean);



      if (userExposure === undefined) {



        const lumaSafe = Math.max(lumaForAuto, 1e-3);



        const err = this.autoTargetLuma / lumaSafe;



        const adj = clamp(Math.pow(err, this.autoAggressiveness), 0.8, 1.25);



        this.autoGain = clamp(this.autoGain * adj, this.autoGainMin, this.autoGainMax);



      }







      if (triggered) {



        let diagMsg = "Hull drive dark";



        if (status === 'gated_dark') diagMsg = "Gating zero?";



        else if (status === 'base_dark') diagMsg = "Base drive below threshold";



        const stats = this.ringLastStats;



        const rawMeanVal = stats?.rawMean;



        const meanRaw = Number.isFinite(rawMeanVal ?? NaN) ? (rawMeanVal as number) : this.fActiveResolved;



        const activeScale = 1 / Math.sqrt(Math.max(this.fActiveResolved, 1e-6));



        diagMsg += ` cov=${gatedSample.coverage.toFixed(2)} Lg=${gatedSample.mean.toFixed(3)} Lb=${baseSample.mean.toFixed(3)} meanRaw=${meanRaw.toFixed(3)} gain~${activeScale.toFixed(1)}`;



        this._diag.message = diagMsg;



        if (prevMode !== status) {



          console.warn("[Hull3DRenderer] diagnostic probe low", {



            status,



            base: baseSample,



            gated: gatedSample,



            thresholds: {



              coverage: this.diagCoverageGrace,



              base: this.diagBaseThreshold,



              gated: this.diagGatedThreshold,



            },



            phase01: Number(state.phase01.toFixed(4)),



            phaseSign: this.phaseSignEffective,



            fActive: this.fActiveResolved,



          });



        }



        if (this.diagHoldFrames > 0) {



          this._diag.state = 'holding';



          this._diag.holdLeft = this.diagHoldFrames;



        } else {



          this._diag.state = 'idle';



        }



      } else {



        if (clearing) {



          this._diag.message = "";



        }



        if (this._diag.state !== 'holding') {



          this._diag.state = 'idle';



        }



      }







      if (typeof window !== "undefined") {



        (window as any).__hullDiagMetrics = {



          status,



          triggered,



          base: baseSample,



          gated: gatedSample,



          probeGain,



          thresholds: {



            coverage: this.diagCoverageGrace,



            base: this.diagBaseThreshold,



            gated: this.diagGatedThreshold,



          },



        };



        (window as any).__hullDiagMessage = triggered



          ? {



            message: this._diag.message,



            status,



            base: baseSample,



            gated: gatedSample,



          }



          : null;



      }







      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);



      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);



    } catch (e) {



      console.warn("[Hull3DRenderer] Diagnostic probe failed:", e);



      this._diag.state = 'idle';



      this._diag.lowCount = 0;



      this._diag.okCount = 0;



    }



  }







  runHull3DHealthCheck(): Record<string, HullTestResult> | null {



    if (!this.resources.rayProgram || !this.state || !this.resources.quadVao) {



      console.warn("[Hull3DRenderer] Health check unavailable (program/state not ready)");



      return null;



    }



    const state = this.state;



    const gl = this.gl;



    const results: Record<string, HullTestResult> = {};



    const prevDiag = this.diagnosticsEnabled;



    this.diagnosticsEnabled = false;



    if (!this.ringInstantTex || !this.radialTex) {



      console.warn("[Hull3DRenderer] Health check missing LUT textures");



      this.diagnosticsEnabled = prevDiag;



      return null;



    }



    this.ensureDiagFBO();



    if (!this.diagFBO || !this.diagColorTex) {



      console.warn("[Hull3DRenderer] Health check failed to allocate FBO");



      this.diagnosticsEnabled = prevDiag;



      return null;



    }



    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);



    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;



    const prevCull = gl.isEnabled(gl.CULL_FACE);



    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);



    const prevBlend = gl.isEnabled(gl.BLEND);



    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);



    const prevSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);



    const prevDstRGB = gl.getParameter(gl.BLEND_DST_RGB);



    const prevSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);



    const prevDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);



    const prevScissor = gl.isEnabled(gl.SCISSOR_TEST);



    const prevColorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];



    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as (WebGLProgram | null);



    const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as (WebGLVertexArrayObject | null);



    gl.bindFramebuffer(gl.FRAMEBUFFER, this.diagFBO);



    gl.viewport(0, 0, this.diagSize, this.diagSize);



    gl.disable(gl.CULL_FACE);



    gl.disable(gl.DEPTH_TEST);



    gl.depthMask(false);



    gl.disable(gl.BLEND);



    gl.disable(gl.SCISSOR_TEST);



    gl.colorMask(true, true, true, true);



    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);



    const fboBefore = gl.getParameter(gl.FRAMEBUFFER_BINDING);



    const vpBefore = gl.getParameter(gl.VIEWPORT) as Int32Array;



    console.log("[Hull3D][Health] target before draw", fboBefore, Array.from(vpBefore));



    const fActive = this.resolveFActive(state);



    this.fActiveResolved = fActive;



    let loc: Record<string, WebGLUniformLocation | null> | null = null;



    // Save/adjust domain scale for the duration of the health check



    const prevDomain = this.domainScale;



    try {



      // Expand bounds during health check for better viewport coverage



      this.domainScale = prevDomain * 1.8;



      this.ensureHarnessWhiteProgram();



      const camera = this.computeCamera(state);



      const view = lookAt(identity(), camera.eye, camera.center, (camera as any).up ?? [0, 1, 0]);



      const hullRadius = Math.max(Math.abs(state.axes[0]), Math.abs(state.axes[1]), Math.abs(state.axes[2])) * this.domainScale;



      const proj = perspective(identity(), camera.fov, state.aspect || 1.6, 0.2, Math.max(1000, hullRadius * 4));



      const baseViewProj = multiply(identity(), proj, view);



      const intentMatrices = this.deriveIntentMatrices(baseViewProj, state);



      const viewProj = intentMatrices.baseViewProj;



      const invViewProj = intentMatrices.baseInvViewProj;



      const hullInvViewProj = intentMatrices.hullInvViewProj;



      const dbgPhaseSign = (typeof window !== "undefined" && (window as any).__hullPhaseSign === -1) ? -1 : 1;



      const statePhaseSign = Math.sign(state.phaseSign ?? 1) || 1;



      this.phaseSignEffective = statePhaseSign * dbgPhaseSign;



      const userExposure = Number.isFinite(state.exposure as number) ? (state.exposure as number) : undefined;



      const exposureBase = userExposure ?? 1.0;



      const effectiveExposure = clamp(exposureBase * this.autoGain, 1e-4, 1e4);



      // Build a synthetic non-zero test state so health check isn't dependent on live duty



      const betaMag = Number.isFinite(state.beta) ? Math.abs(state.beta) : 0;



      const betaSign = (Number.isFinite(state.beta) && state.beta !== 0) ? Math.sign(state.beta) : 1;



      const betaUse = betaMag > 1e-6 ? state.beta : 0.3 * betaSign;



      const ampRaw = Number.isFinite(state.ampChain) ? state.ampChain : 0;



      const ampUse = Math.max(ampRaw, 1e14); // enforce strong synthetic magnitude for tests



      const testState: Hull3DRendererState = {



        ...state,



        // Ensure a healthy sigma for LUT generation during tests



        sigma: (Number.isFinite(state.sigma) && state.sigma > 1e-6) ? state.sigma : 6.0,



        beta: betaUse,



        gate: (Number.isFinite(state.gate) && state.gate > 0) ? state.gate : 1.0,



        gateView: (Number.isFinite(state.gateView) && state.gateView > 0)



          ? state.gateView



          : 1.0,



        ampChain: ampUse,



      };



      // Force-refresh LUTs with the synthetic test state so df/gate are visible



      const prevRadialKey = this.lastRadialKey;



      const prevRingKey = this.lastRingKey;



      this.lastRadialKey = "";



      this.lastRingKey = "";



      this.updateRadialLUT(testState);



      this.updateRingLUT(testState);



      const densityScale = this.resolveDensityScale(testState, effectiveExposure);



      const baseScale = this.resolveBaseScale(testState);



      const volumeVizIndex = this.resolveVolumeVizIndex(testState);



      const volumeSourceIndex = VOLUME_SOURCE_TO_INDEX[this.resolveVolumeSource(testState)];



      const volumeDomainIndex = this.resolveVolumeDomainIndex(testState);



      const opacityWindow = this.normalizeOpacityWindow(testState.opacityWindow ?? this.opacityWindow);



      loc = {



        u_volume: gl.getUniformLocation(this.resources.rayProgram, "u_volume"),
        u_gateVolume: gl.getUniformLocation(this.resources.rayProgram, "u_gateVolume"),



        u_ringInstant: gl.getUniformLocation(this.resources.rayProgram, "u_ringInstant"),



        u_ringAverage: gl.getUniformLocation(this.resources.rayProgram, "u_ringAverage"),



        u_radialLUT: gl.getUniformLocation(this.resources.rayProgram, "u_radialLUT"),



        u_volumeAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_volumeAtlas"),



        u_curvTex: gl.getUniformLocation(this.resources.rayProgram, "u_curvTex"),



        u_curvGain: gl.getUniformLocation(this.resources.rayProgram, "u_curvGain"),



        u_curvAlpha: gl.getUniformLocation(this.resources.rayProgram, "u_curvAlpha"),



        u_curvPaletteMode: gl.getUniformLocation(this.resources.rayProgram, "u_curvPaletteMode"),



        u_axes: gl.getUniformLocation(this.resources.rayProgram, "u_axes"),



        u_domainScale: gl.getUniformLocation(this.resources.rayProgram, "u_domainScale"),



        u_beta: gl.getUniformLocation(this.resources.rayProgram, "u_beta"),



        u_metricMode: gl.getUniformLocation(this.resources.rayProgram, "u_metricMode"),



        u_ampChain: gl.getUniformLocation(this.resources.rayProgram, "u_ampChain"),



        u_gate: gl.getUniformLocation(this.resources.rayProgram, "u_gate"),



        u_fActive: gl.getUniformLocation(this.resources.rayProgram, "u_fActive"),



        u_lumpExp: gl.getUniformLocation(this.resources.rayProgram, "u_lumpExp"),



        u_hasLatticeVolume: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeVolume"),
        u_worldToLattice: gl.getUniformLocation(this.resources.rayProgram, "u_worldToLattice"),
        u_latticeMin: gl.getUniformLocation(this.resources.rayProgram, "u_latticeMin"),
        u_latticeSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSize"),
        u_latticePacked: gl.getUniformLocation(this.resources.rayProgram, "u_latticePacked"),
        u_latticeUseAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeUseAtlas"),
        u_latticeDynamicWeights: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDynamicWeights"),
        u_latticeDims: gl.getUniformLocation(this.resources.rayProgram, "u_latticeDims"),
        u_latticeAtlasTiles: gl.getUniformLocation(this.resources.rayProgram, "u_latticeAtlasTiles"),
        u_latticeSliceInvSize: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSliceInvSize"),
        u_hasLatticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_hasLatticeSdf"),
        u_latticeSdfBand_m: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfBand_m"),
        u_latticeSdf: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdf"),
        u_latticeSdfAtlas: gl.getUniformLocation(this.resources.rayProgram, "u_latticeSdfAtlas"),



        u_phase01: gl.getUniformLocation(this.resources.rayProgram, "u_phase01"),



        u_phaseSign: gl.getUniformLocation(this.resources.rayProgram, "u_phaseSign"),

        u_thetaSign: gl.getUniformLocation(this.resources.rayProgram, "u_thetaSign"),



        u_blend: gl.getUniformLocation(this.resources.rayProgram, "u_blend"),



        u_densityScale: gl.getUniformLocation(this.resources.rayProgram, "u_densityScale"),



        u_stepBias: gl.getUniformLocation(this.resources.rayProgram, "u_stepBias"),



        u_maxSteps: gl.getUniformLocation(this.resources.rayProgram, "u_maxSteps"),



        u_radialScale: gl.getUniformLocation(this.resources.rayProgram, "u_radialScale"),



        u_radialMax: gl.getUniformLocation(this.resources.rayProgram, "u_radialMax"),



        u_invR: gl.getUniformLocation(this.resources.rayProgram, "u_invR"),



        u_timeSec: gl.getUniformLocation(this.resources.rayProgram, "u_timeSec"),



  u_sigma: gl.getUniformLocation(this.resources.rayProgram, "u_sigma"),



        u_cameraPos: gl.getUniformLocation(this.resources.rayProgram, "u_cameraPos"),



        u_invViewProj: gl.getUniformLocation(this.resources.rayProgram, "u_invViewProj"),



        u_forceFlatGate: gl.getUniformLocation(this.resources.rayProgram, "u_forceFlatGate"),



        u_debugMode: gl.getUniformLocation(this.resources.rayProgram, "u_debugMode"),



        u_probeMode: gl.getUniformLocation(this.resources.rayProgram, "u_probeMode"),



        u_probeGain: gl.getUniformLocation(this.resources.rayProgram, "u_probeGain"),



        u_testMode: gl.getUniformLocation(this.resources.rayProgram, "u_testMode"),



        u_baseScale: gl.getUniformLocation(this.resources.rayProgram, "u_baseScale"),



        u_volumeViz: gl.getUniformLocation(this.resources.rayProgram, "u_volumeViz"),
        u_volumeSource: gl.getUniformLocation(this.resources.rayProgram, "u_volumeSource"),

        u_volumeDomain: gl.getUniformLocation(this.resources.rayProgram, "u_volumeDomain"),

        u_opacityWindow: gl.getUniformLocation(this.resources.rayProgram, "u_opacityWindow"),

        u_grThetaGain: gl.getUniformLocation(this.resources.rayProgram, "u_grThetaGain"),



        u_grRhoGain: gl.getUniformLocation(this.resources.rayProgram, "u_grRhoGain"),



        u_vizFloorThetaGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaGR"),



        u_vizFloorRhoGR: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorRhoGR"),



        u_vizFloorThetaDrive: gl.getUniformLocation(this.resources.rayProgram, "u_vizFloorThetaDrive"),



      };



  gl.useProgram(this.resources.rayProgram);



      const volumeTex = this.volumeTex ?? this.ensureDummy3D();



      const ringInstantTex = this.ringInstantTex!;



      const ringAverageTex = this.ringAverageTex ?? ringInstantTex;



      const curvTex = this.curvature.hasData ? this.getActiveCurvatureTexture() : this.ensureCurvatureFallback();



      gl.activeTexture(gl.TEXTURE0);



      gl.bindTexture(gl.TEXTURE_3D, volumeTex);



      gl.uniform1i(loc.u_volume, 0);



      const gateTex = this.gateVolumeTex ?? this.ensureDummy3D();
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_3D, gateTex);
      if (loc.u_gateVolume) gl.uniform1i(loc.u_gateVolume, 6);
      const volumeSource = this.resolveVolumeSource(state);
      const useLattice = volumeSource === "lattice";
      const activeLattice =
        useLattice && state.latticeVolume && this.latticeUpload && this.latticeUpload.hash === state.latticeVolume.hash
          ? this.latticeUpload
          : null;
      const hasLattice = !!activeLattice;
      const latticePacked = !!activeLattice?.format.packedRG;
      const latticeUseAtlas = !!activeLattice && activeLattice.format.backend === "atlas2d";
      const latticeDynamicWeights = state.latticeWeightMode === "dynamic";
      const latticeDims = activeLattice?.dims ?? [1, 1, 1];
      const atlas = activeLattice?.format.atlas;

      if (loc.u_hasLatticeVolume) gl.uniform1i(loc.u_hasLatticeVolume, hasLattice ? 1 : 0);
      if (loc.u_latticePacked) gl.uniform1i(loc.u_latticePacked, latticePacked ? 1 : 0);
      if (loc.u_latticeUseAtlas) gl.uniform1i(loc.u_latticeUseAtlas, latticeUseAtlas ? 1 : 0);
      if (loc.u_latticeDynamicWeights) gl.uniform1i(loc.u_latticeDynamicWeights, latticeDynamicWeights ? 1 : 0);
      if (loc.u_latticeDims) gl.uniform3f(loc.u_latticeDims, latticeDims[0], latticeDims[1], latticeDims[2]);
      if (loc.u_latticeAtlasTiles) {
        gl.uniform2f(loc.u_latticeAtlasTiles, atlas?.tilesX ?? 1, atlas?.tilesY ?? 1);
      }
      if (loc.u_latticeSliceInvSize) {
        gl.uniform2f(
          loc.u_latticeSliceInvSize,
          1 / Math.max(1, latticeDims[0]),
          1 / Math.max(1, latticeDims[1]),
        );
      }
      if (loc.u_volumeAtlas) {
        const atlasTex =
          latticeUseAtlas && this.latticeAtlasTex ? this.latticeAtlasTex : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1i(loc.u_volumeAtlas, 7);
      }

      const hasLatticeSdf = !!(
        useLattice &&
        hasLattice &&
        state.latticeSdf &&
        this.latticeSdfReadyKey &&
        this.latticeSdfReadyKey === state.latticeSdf.key
      );

      if (loc.u_hasLatticeSdf) gl.uniform1i(loc.u_hasLatticeSdf, hasLatticeSdf ? 1 : 0);
      const sdfBandMetersRaw = state.latticeSdf?.band ?? 0;
      const sdfBandMeters =
        hasLatticeSdf && Number.isFinite(sdfBandMetersRaw) ? Math.max(0, sdfBandMetersRaw) : 0;
      if (loc.u_latticeSdfBand_m) gl.uniform1f(loc.u_latticeSdfBand_m, sdfBandMeters);

      if (loc.u_latticeSdf) {
        const sdfTex3D =
          hasLatticeSdf && !latticeUseAtlas && this.latticeSdfTex ? this.latticeSdfTex : this.ensureDummy3D();
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_3D, sdfTex3D);
        gl.uniform1i(loc.u_latticeSdf, 8);
      }

      if (loc.u_latticeSdfAtlas) {
        const sdfAtlas =
          hasLatticeSdf && latticeUseAtlas && this.latticeSdfAtlasTex
            ? this.latticeSdfAtlasTex
            : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, sdfAtlas);
        gl.uniform1i(loc.u_latticeSdfAtlas, 9);
      }

      if (loc.u_worldToLattice) {
        const mat = state.latticeWorldToLattice ?? new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ]);
        gl.uniformMatrix4fv(loc.u_worldToLattice, false, mat);
      }
      if (loc.u_latticeMin) {
        const min = state.latticeMin ?? [0, 0, 0];
        gl.uniform3fv(loc.u_latticeMin, min as any);
      }
      if (loc.u_latticeSize) {
        const size = state.latticeSize ?? [1, 1, 1];
        gl.uniform3fv(loc.u_latticeSize, size as any);
      }

      gl.activeTexture(gl.TEXTURE1);



      gl.bindTexture(gl.TEXTURE_2D, ringInstantTex);



      gl.uniform1i(loc.u_ringInstant, 1);



      gl.activeTexture(gl.TEXTURE2);



      gl.bindTexture(gl.TEXTURE_2D, ringAverageTex);



      gl.uniform1i(loc.u_ringAverage, 2);



      gl.activeTexture(gl.TEXTURE3);



      gl.bindTexture(gl.TEXTURE_2D, this.radialTex);



      gl.uniform1i(loc.u_radialLUT, 3);



      gl.activeTexture(gl.TEXTURE4);



      gl.bindTexture(gl.TEXTURE_3D, curvTex);



      if (loc.u_curvTex) gl.uniform1i(loc.u_curvTex, 4);







      const harnessDriveChain = Math.abs(testState.ampChain) * Math.max(testState.gate, 1e-6);



      const harnessThetaGain = Math.max(harnessDriveChain * 0.6, 1e-12);



      const harnessRhoGain = clamp(harnessDriveChain * 0.03, 1e-12, 1e12);



      const baseParams: RayUniformParams = {



        densityScale,



        stepBias: this.qualityProfile.stepBias,



        // Use full step budget in health harness to resolve the thin rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â 1 band reliably



        maxSteps: Math.max(32, this.qualityProfile.maxSteps),



        cameraEye: camera.eye,



        invViewProj: invViewProj,



        phaseSign: this.phaseSignEffective,



        phase01: testState.phase01,



        invR: 1.0 / Math.max(testState.R, 1e-6),



        timeSec: testState.timeSec ?? 0,



        // For tests, avoid dependency on unseeded ring-average texture



        blend: 0.0,



        fActive,



        baseScale,



        sigma: testState.sigma,



        volumeVizIndex,



        volumeSourceIndex,



        volumeDomainIndex,



        opacityWindow,



        grThetaGain: harnessThetaGain,



        grRhoGain: harnessRhoGain,



        forceFlatGate: false,



        debugMode: 0,



        probeMode: 0,



        probeGain: 0,



      testMode: 0,



    };



    const axesForLog = [



      Math.max(Math.abs(state.axes[0]), 1e-6) * this.domainScale,



      Math.max(Math.abs(state.axes[1]), 1e-6) * this.domainScale,



      Math.max(Math.abs(state.axes[2]), 1e-6) * this.domainScale,



    ];



    console.log("[Hull3D][Health] camera", {



      eye: [camera.eye[0], camera.eye[1], camera.eye[2]],



      bounds: axesForLog,



      domainScale: this.domainScale,



    });



    const offsets = [



      [Math.floor(this.diagSize * 0.25), Math.floor(this.diagSize * 0.25)],



      [Math.floor(this.diagSize * 0.75), Math.floor(this.diagSize * 0.25)],



      [Math.floor(this.diagSize * 0.25), Math.floor(this.diagSize * 0.75)],



      [Math.floor(this.diagSize * 0.75), Math.floor(this.diagSize * 0.75)],



      ];



      // Full-frame analyzer: read entire FBO to robustly capture thin band coverage



      const analyzeFrame = (): { luma: number; alpha: number } => {



        const bufSize = this.diagSize * this.diagSize * 4;



        const fbBuf = new Uint8Array(bufSize);



        gl.readPixels(0, 0, this.diagSize, this.diagSize, gl.RGBA, gl.UNSIGNED_BYTE, fbBuf);



        let sumL = 0;



        let sumA = 0;



        const pxCount = this.diagSize * this.diagSize;



        for (let i = 0; i < fbBuf.length; i += 4) {



          const r = fbBuf[i] / 255;



          const g = fbBuf[i + 1] / 255;



          const b = fbBuf[i + 2] / 255;



          const a = fbBuf[i + 3] / 255;



          sumL += 0.2126 * r + 0.7152 * g + 0.0722 * b;



          sumA += a;



        }



        const denom = Math.max(1, pxCount);



        return { luma: sumL / denom, alpha: sumA / denom };



      };







      if (this.harnessWhiteProgram && this.resources.quadVao) {



      gl.clearColor(0, 0, 0, 0);



      gl.clear(gl.COLOR_BUFFER_BIT);



        gl.useProgram(this.harnessWhiteProgram);



        gl.bindVertexArray(this.resources.quadVao);



        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);



        const sampleWhite = analyzeFrame();



        const passWhite = sampleWhite.luma > 0.9;



        results["T0_whiteTriangle"] = { luma: sampleWhite.luma, alpha: sampleWhite.alpha, pass: passWhite };



        console.log(`[Hull3D][T0_whiteTriangle] ${passWhite ? "PASS" : "FAIL"}`, sampleWhite);



      } else {



        console.warn("[Hull3DRenderer] Health check missing white shader or quad VAO");



      }







      const run = (



        mode: number,



        name: string,



        expect: (sample: { luma: number; alpha: number }) => boolean,



        override?: Partial<Pick<RayUniformParams, "forceFlatGate" | "baseScale">>



      ) => {



        gl.useProgram(this.resources.rayProgram);



        gl.clearColor(0, 0, 0, 0);



        gl.clear(gl.COLOR_BUFFER_BIT);



        const params: RayUniformParams = {



          ...baseParams,



          testMode: mode,



          forceFlatGate: override?.forceFlatGate ?? baseParams.forceFlatGate,



          baseScale: override?.baseScale ?? baseParams.baseScale,



        };



        // For health tests, always apply synthetic non-zero testState



        this.applyRayUniforms(gl, loc!, testState, params);



        gl.bindVertexArray(this.resources.quadVao);



        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);



        gl.bindVertexArray(null);



        const sample = analyzeFrame();



        const pass = expect(sample);



        const result: HullTestResult = { luma: sample.luma, alpha: sample.alpha, pass };



        results[name] = result;



        console.log(`[Hull3D][${name}] ${pass ? "PASS" : "FAIL"}`, sample);



      };







      run(1, "T1_constWhite", (s) => s.luma > 0.9);



  // Band-related tests: allow modest thresholds, since ring covers a thin area of the frame



  run(2, "T2_bandWhite", (s) => s.alpha > 0.02 && s.luma > 0.02);



  run(3, "T3_dfOnly", (s) => s.alpha > 0.02 && s.luma > 0.02);



  run(4, "T4_gateOnly", (s) => s.alpha > 0.02 && s.luma > 0.02, { forceFlatGate: true });



      // Ensure base-only uses a sufficient synthetic magnitude for visibility



  const baseScaleForTests = Math.max(baseScale, 6e13);



  run(5, "T5_baseOnly", (s) => s.luma > 0.05, { baseScale: baseScaleForTests, forceFlatGate: true });



  // Field magnitude: average across full frame; keep threshold gentle



  run(6, "T6_thetaAbs", (s) => s.luma > 0.01, { baseScale: baseScaleForTests, forceFlatGate: true });



      // Intersection: assert alpha (coverage of hits), not luma of red



      run(7, "T7_intersect", (s) => s.alpha > 0.5);



      const boundAfter = gl.getParameter(gl.FRAMEBUFFER_BINDING);



      const vpAfter = gl.getParameter(gl.VIEWPORT) as Int32Array;



      if (boundAfter !== this.diagFBO) {



        console.warn("[Hull3DRenderer] Health harness detected FBO switch during tests", {



          expected: this.diagFBO,



          actual: boundAfter,



        });



      }



      if (vpAfter[2] !== this.diagSize || vpAfter[3] !== this.diagSize) {



        console.warn("[Hull3DRenderer] Health harness detected viewport change during tests", {



          expected: [0, 0, this.diagSize, this.diagSize],



          actual: Array.from(vpAfter),



        });



      }



    } finally {



      // Restore LUT keys after harness



      // Note: we don't revert textures on GPU; next normal update() will refresh them.



      // Keeping keys empty forces a rebuild on next update(), which is safe.



      if (loc?.u_testMode) gl.uniform1i(loc.u_testMode, 0);



      if (loc?.u_forceFlatGate) gl.uniform1i(loc.u_forceFlatGate, 0);



      if (loc?.u_probeMode) gl.uniform1i(loc.u_probeMode, 0);







    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);



    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);



  // Restore domain scale after health harness



  // (Avoid affecting normal draw bounds/camera sizing.)



  this.domainScale = prevDomain;



    if (prevCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);



    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);



    gl.depthMask(!!prevDepthMask);



    gl.blendFuncSeparate(prevSrcRGB, prevDstRGB, prevSrcAlpha, prevDstAlpha);



    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);



    if (prevScissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);



    gl.colorMask(prevColorMask[0], prevColorMask[1], prevColorMask[2], prevColorMask[3]);



    gl.bindVertexArray(prevVAO);



    gl.useProgram(prevProgram);



    this.diagnosticsEnabled = prevDiag;



    this._diag.state = 'idle';



    this._diag.lowCount = 0;



    this._diag.okCount = 0;



    this._diag.message = "";



    this._diag.lastOk = true;



    this._diag.lastMode = 'ok';



    (window as any).__hullTests = results;



    return results;



    }



  }







  private computeCamera(state: Hull3DRendererState) {

    if (state.camera?.eye) {
      const eye = state.camera.eye as Vec3;
      const center = (state.camera.target as Vec3) ?? ([0, 0, 0] as Vec3);
      const fov = Math.max(5, Math.min(170, state.camera.fov_deg ?? 45)) * (Math.PI / 180);
      const upRaw = (state.camera.up as Vec3 | undefined) ?? ([0, 1, 0] as Vec3);
      const upLen = Math.hypot(upRaw[0], upRaw[1], upRaw[2]);
      const up = upLen > 1e-6 ? ([upRaw[0] / upLen, upRaw[1] / upLen, upRaw[2] / upLen] as Vec3) : ([0, 1, 0] as Vec3);
      return { eye, center, fov, up };
    }



    const baseYaw = 0.65 * Math.PI;



    const timeSec = Number.isFinite(state.timeSec) ? state.timeSec : performance.now() * 0.001;



    // Initialize time



    if (this.lastTimeSec === 0) this.lastTimeSec = timeSec;



    const dtFrame = Math.max(0, timeSec - this.lastTimeSec);







    // Update internal phase smoother from raw phase01 when available



    if (!this.phaseInit) {



      this.phaseCont = state.phase01;



      this.phaseVel = 0;



      this.lastPhaseRaw = state.phase01;



      this.lastPhaseTime = timeSec;



      this.phaseInit = true;



    } else {



      const dtObs = Math.max(0, timeSec - this.lastPhaseTime);



      if (dtObs > 1e-4) {



        // Unwrap delta with direction preference to avoid random sign flips at wrap



        const unwrapDelta = (prevRaw: number, currRaw: number, preferSign: number) => {



          // forward difference in [0,1)



          const forward = ((currRaw - prevRaw) % 1 + 1) % 1;



          // shortest path in [-0.5, 0.5]



          const short = forward > 0.5 ? forward - 1 : forward;



          if (preferSign === 0 || Math.abs(short) < 1e-4) return short;



          const sShort = short > 0 ? 1 : (short < 0 ? -1 : 0);



          if (sShort === preferSign) return short;



          // choose the alternative wrap to maintain direction



          return short + preferSign; // add/subtract 1 cycle



        };



        const velHyst = 0.02; // cycles/sec below which direction is considered neutral



        const preferSign = Math.abs(this.phaseVel) > velHyst ? (this.phaseVel > 0 ? 1 : -1) : 0;



        const d = unwrapDelta(this.lastPhaseRaw, state.phase01, preferSign);



        const instVel = d / dtObs; // cycles/sec



        // Mild smoothing of velocity estimate and clamp to sane range



        const velTarget = Math.max(-4, Math.min(4, instVel));



        this.phaseVel = this.phaseVel + (velTarget - this.phaseVel) * 0.25;



        this.lastPhaseRaw = state.phase01;



        this.lastPhaseTime = timeSec;



      }



      // Integrate to continuous phase even when raw holds constant between updates



      this.phaseCont += this.phaseVel * dtFrame;



    }







    const phaseOffset = state.followPhase ? this.phaseCont * TWO_PI : 0;



    const targetYaw = baseYaw + phaseOffset;



    const targetPitch = clamp(0.18 * Math.PI, 0.1, 0.35);



    const hx = Math.abs(state.axes[0]) * this.domainScale;



    const hy = Math.abs(state.axes[1]) * this.domainScale;



    const hz = Math.abs(state.axes[2]) * this.domainScale;



    const hullRadius = Math.max(hx, hy, hz);



    const targetDist = Math.max(hullRadius * 1.35, state.R * 4.2, 12);







    // Initialize on first run to avoid jump



    if (!this.camInit) {



      this.camYaw = targetYaw;



      this.camPitch = targetPitch;



      this.camDist = targetDist;



      this.camInit = true;



    } else {



      // Smoothly track targets; unwrap yaw to shortest angular path



      const deltaYaw = Math.atan2(Math.sin(targetYaw - this.camYaw), Math.cos(targetYaw - this.camYaw));



      this.camYaw += deltaYaw * this.camSmoothing;



      this.camPitch += (targetPitch - this.camPitch) * this.camSmoothing;



      this.camDist += (targetDist - this.camDist) * this.camSmoothing;



    }







    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);



    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);



    const distance = this.camDist;



    const eye: Vec3 = [



      cy * cp * distance,



      sp * distance,



      sy * cp * distance,



    ];



    const center: Vec3 = [0, 0, 0];



    this.lastTimeSec = timeSec;



    return { eye, center, fov: 45 * (Math.PI / 180) };



  }







  private updateDomainGrid(state: Hull3DRendererState) {
    const cfg = state.overlays?.domainGrid;
    const { gl } = this;

    if (!cfg || !cfg.enabled) {
      if (this.overlay.domainGridVao) gl.deleteVertexArray(this.overlay.domainGridVao);
      if (this.overlay.domainGridVbo) gl.deleteBuffer(this.overlay.domainGridVbo);
      this.overlay.domainGridVao = null;
      this.overlay.domainGridVbo = null;
      this.overlay.domainGridCount = 0;
      this.overlayCache.domainGridKey = "";
      return;
    }

    const axes = state.axes;
    const domainScale = this.domainScale;
    const half: [number, number, number] = [
      Math.max(1e-4, Math.abs(axes[0]) * domainScale),
      Math.max(1e-4, Math.abs(axes[1]) * domainScale),
      Math.max(1e-4, Math.abs(axes[2]) * domainScale),
    ];
    const boundsMin: [number, number, number] = [-half[0], -half[1], -half[2]];
    const boundsSize: [number, number, number] = [half[0] * 2, half[1] * 2, half[2] * 2];
    const maxDim = Math.max(boundsSize[0], boundsSize[1], boundsSize[2]);
    const spacingRaw = Number(cfg.spacing_m);
    const spacingRequested = Number.isFinite(spacingRaw)
      ? Math.max(1e-4, spacingRaw)
      : Math.max(0.05, Math.min(1.5, maxDim / 10));
    let spacingUsed = spacingRequested;

    const computeCounts = (spacing: number) => {
      const nx = Math.max(2, Math.floor(boundsSize[0] / spacing) + 1);
      const ny = Math.max(2, Math.floor(boundsSize[1] / spacing) + 1);
      const nz = Math.max(2, Math.floor(boundsSize[2] / spacing) + 1);
      const total = ny * nz + nx * nz + nx * ny;
      return { nx, ny, nz, total };
    };

    let counts = computeCounts(spacingUsed);
    let guard = 0;
    while (counts.total > DOMAIN_GRID_MAX_LINES && guard < 8) {
      const factor = Math.max(1.2, Math.sqrt(counts.total / Math.max(1, DOMAIN_GRID_MAX_LINES)));
      spacingUsed *= factor;
      counts = computeCounts(spacingUsed);
      guard += 1;
    }

    const stepX = boundsSize[0] / Math.max(1, counts.nx - 1);
    const stepY = boundsSize[1] / Math.max(1, counts.ny - 1);
    const stepZ = boundsSize[2] / Math.max(1, counts.nz - 1);
    const xs = new Array(counts.nx).fill(0).map((_, i) => boundsMin[0] + stepX * i);
    const ys = new Array(counts.ny).fill(0).map((_, i) => boundsMin[1] + stepY * i);
    const zs = new Array(counts.nz).fill(0).map((_, i) => boundsMin[2] + stepZ * i);

    const verts: number[] = [];
    for (const y of ys) {
      for (const z of zs) {
        verts.push(boundsMin[0], y, z, boundsMin[0] + boundsSize[0], y, z);
      }
    }
    for (const x of xs) {
      for (const z of zs) {
        verts.push(x, boundsMin[1], z, x, boundsMin[1] + boundsSize[1], z);
      }
    }
    for (const x of xs) {
      for (const y of ys) {
        verts.push(x, y, boundsMin[2], x, y, boundsMin[2] + boundsSize[2]);
      }
    }

    const vertCount = verts.length / 3;
    if (vertCount <= 0) {
      if (this.overlay.domainGridVao) gl.deleteVertexArray(this.overlay.domainGridVao);
      if (this.overlay.domainGridVbo) gl.deleteBuffer(this.overlay.domainGridVbo);
      this.overlay.domainGridVao = null;
      this.overlay.domainGridVbo = null;
      this.overlay.domainGridCount = 0;
      this.overlayCache.domainGridKey = "";
      return;
    }

    const key = `${boundsMin.map((n) => n.toFixed(3)).join(",")}::${boundsSize
      .map((n) => n.toFixed(3))
      .join(",")}:s${spacingUsed.toFixed(4)}:n${counts.nx}x${counts.ny}x${counts.nz}`;

    if (
      this.overlayCache.domainGridKey === key &&
      this.overlay.domainGridVao &&
      this.overlay.domainGridVbo
    ) {
      this.overlay.domainGridCount = vertCount;
      return;
    }

    if (this.overlay.domainGridVao) gl.deleteVertexArray(this.overlay.domainGridVao);
    if (this.overlay.domainGridVbo) gl.deleteBuffer(this.overlay.domainGridVbo);
    this.overlay.domainGridVao = null;
    this.overlay.domainGridVbo = null;
    this.overlay.domainGridCount = 0;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) return;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.overlay.domainGridVao = vao;
    this.overlay.domainGridVbo = vbo;
    this.overlay.domainGridCount = vertCount;
    this.overlayCache.domainGridKey = key;
  }

  private drawSpacetimeGrid(_mvp: Float32Array, state: Hull3DRendererState) {

    const cfg = state.overlays?.spacetimeGrid;
    const { gl } = this;
    const latticeReady = Boolean(
      state.latticeSdf &&
      state.latticeWorldToLattice &&
      this.latticeSdfReadyKey &&
      this.latticeSdfReadyKey === state.latticeSdf.key
    );
    const hasSdf = latticeReady;

    if (!cfg) {
      this.spacetimeGridState = {
        ...this.spacetimeGridState,
        enabled: false,
        hasSdf,
        useSdf: false,
        falloffUsed_m: 0,
        falloffRequested_m: 0,
        falloffFromSpacing_m: 0,
        falloffFromR_m: 0,
        falloffFromBounds_m: 0,
        signedDisplacement: false,
        boundsMin: [0, 0, 0],
        boundsSize: [0, 0, 0],
        boundsExpanded_m: 0,
        reason: 'missing-config',
        degradedReasons: [],
      };
      return;
    }

    const enabled = !!cfg.enabled;
    const useSdf = enabled && cfg.useSdf && hasSdf;
    const reason = enabled
      ? cfg.useSdf && !hasSdf
        ? 'sdf-unavailable'
        : null
      : 'disabled';

    this.spacetimeGridState = {
      enabled,
      mode: cfg.mode ?? this.spacetimeGridState.mode,
      fieldSource:
        cfg.fieldSource ??
        this.spacetimeGridState.fieldSource ??
        "volume",
      warpField: cfg.warpField ?? this.spacetimeGridState.warpField ?? "dfdr",
      warpGamma:
        typeof cfg.warpGamma === "number" && Number.isFinite(cfg.warpGamma)
          ? clamp(cfg.warpGamma, 0.1, 6)
          : this.spacetimeGridState.warpGamma,
      useGradientDir:
        typeof cfg.useGradientDir === "boolean"
          ? cfg.useGradientDir
          : this.spacetimeGridState.useGradientDir,
      spacing_m: Number.isFinite(cfg.spacing_m) ? cfg.spacing_m : this.spacetimeGridState.spacing_m,
      spacingUsed_m: Number.isFinite(cfg.spacing_m) ? cfg.spacing_m : this.spacetimeGridState.spacing_m,
      warpStrength: Number.isFinite(cfg.warpStrength) ? cfg.warpStrength : this.spacetimeGridState.warpStrength,
      falloffUsed_m: Number.isFinite(cfg.falloff_m) ? cfg.falloff_m : this.spacetimeGridState.falloff_m,
      falloffRequested_m: Number.isFinite(cfg.falloff_m) ? cfg.falloff_m : this.spacetimeGridState.falloff_m,
      falloffFromSpacing_m: this.spacetimeGridState.falloffFromSpacing_m,
      falloffFromR_m: this.spacetimeGridState.falloffFromR_m,
      falloffFromBounds_m: this.spacetimeGridState.falloffFromBounds_m,
      falloff_m: Number.isFinite(cfg.falloff_m) ? cfg.falloff_m : this.spacetimeGridState.falloff_m,
      colorBy: cfg.colorBy ?? this.spacetimeGridState.colorBy,
      style: cfg.style ?? this.spacetimeGridState.style ?? "scientific",
      legacyPulseEnabled:
        typeof cfg.legacyPulseEnabled === "boolean"
          ? cfg.legacyPulseEnabled
          : this.spacetimeGridState.legacyPulseEnabled,
      legacyPulseRate:
        typeof cfg.legacyPulseRate === "number" && Number.isFinite(cfg.legacyPulseRate)
          ? clamp(cfg.legacyPulseRate, 0, 6)
          : this.spacetimeGridState.legacyPulseRate,
      legacyPulseSpatialFreq:
        typeof cfg.legacyPulseSpatialFreq === "number" &&
        Number.isFinite(cfg.legacyPulseSpatialFreq)
          ? clamp(cfg.legacyPulseSpatialFreq, 0, 6)
          : this.spacetimeGridState.legacyPulseSpatialFreq,
      legacyPointSize:
        typeof cfg.legacyPointSize === "number" && Number.isFinite(cfg.legacyPointSize)
          ? clamp(cfg.legacyPointSize, 1, 24)
          : this.spacetimeGridState.legacyPointSize,
      legacyPaletteMix:
        typeof cfg.legacyPaletteMix === "number" && Number.isFinite(cfg.legacyPaletteMix)
          ? clamp(cfg.legacyPaletteMix, 0, 1)
          : this.spacetimeGridState.legacyPaletteMix,
      legacyContrast:
        typeof cfg.legacyContrast === "number" && Number.isFinite(cfg.legacyContrast)
          ? clamp(cfg.legacyContrast, 0.1, 4)
          : this.spacetimeGridState.legacyContrast,
      legacyLineAlpha:
        typeof cfg.legacyLineAlpha === "number" && Number.isFinite(cfg.legacyLineAlpha)
          ? clamp(cfg.legacyLineAlpha, 0, 1)
          : this.spacetimeGridState.legacyLineAlpha,
      legacyPointAlpha:
        typeof cfg.legacyPointAlpha === "number" && Number.isFinite(cfg.legacyPointAlpha)
          ? clamp(cfg.legacyPointAlpha, 0, 1)
          : this.spacetimeGridState.legacyPointAlpha,
      warpStrengthMode: cfg.warpStrengthMode ?? this.spacetimeGridState.warpStrengthMode,
      signedDisplacement:
        typeof cfg.signedDisplacement === "boolean"
          ? cfg.signedDisplacement
          : this.spacetimeGridState.signedDisplacement,
      hasSdf,
      useSdf,
      boundsMin: this.spacetimeGridState.boundsMin,
      boundsSize: this.spacetimeGridState.boundsSize,
      boundsExpanded_m: this.spacetimeGridState.boundsExpanded_m,
      reason,
      degradedReasons: [],
    };

    if (!enabled) {
      this.spacetimeGridState.boundsMin = [0, 0, 0];
      this.spacetimeGridState.boundsSize = [0, 0, 0];
      this.spacetimeGridState.boundsExpanded_m = 0;
      if (this.overlay.spaceGridVao) gl.deleteVertexArray(this.overlay.spaceGridVao);
      if (this.overlay.spaceGridVbo) gl.deleteBuffer(this.overlay.spaceGridVbo);
      if (this.overlay.spaceGridColorVbo) gl.deleteBuffer(this.overlay.spaceGridColorVbo);
      if (this.overlay.spaceGridFalloffVbo) gl.deleteBuffer(this.overlay.spaceGridFalloffVbo);
      if (this.overlay.demoGridNodeVao) gl.deleteVertexArray(this.overlay.demoGridNodeVao);
      if (this.overlay.demoGridNodeVbo) gl.deleteBuffer(this.overlay.demoGridNodeVbo);
      if (this.overlay.demoGridNodeColorVbo)
        gl.deleteBuffer(this.overlay.demoGridNodeColorVbo);
      if (this.overlay.demoGridNodeFalloffVbo)
        gl.deleteBuffer(this.overlay.demoGridNodeFalloffVbo);
      this.overlay.spaceGridVao = null;
      this.overlay.spaceGridVbo = null;
      this.overlay.spaceGridColorVbo = null;
      this.overlay.spaceGridFalloffVbo = null;
      this.overlay.spaceGridCount = 0;
      this.overlay.demoGridNodeVao = null;
      this.overlay.demoGridNodeVbo = null;
      this.overlay.demoGridNodeColorVbo = null;
      this.overlay.demoGridNodeFalloffVbo = null;
      this.overlay.demoGridNodeCount = 0;
      this.overlayCache.spaceGridKey = "";
      this.overlayCache.demoGridNodeKey = "";
      return;
    }

    if (cfg.mode === "volume") {
      const spacing = Number.isFinite(cfg.spacing_m) ? Math.max(1e-4, cfg.spacing_m) : this.spacetimeGridState.spacing_m;
      const { warpStrength } = this.resolveSpacetimeGridWarpStrength(state, cfg);
      const falloff = Number.isFinite(cfg.falloff_m) ? cfg.falloff_m : this.spacetimeGridState.falloff_m;
      this.rebuildSpacetimeGridCage(
        state,
        spacing,
        warpStrength,
        falloff,
        cfg.fieldSource,
      );
    } else {
      this.spacetimeGridState.boundsMin = [0, 0, 0];
      this.spacetimeGridState.boundsSize = [0, 0, 0];
      this.spacetimeGridState.boundsExpanded_m = 0;
      if (this.overlay.spaceGridVao) gl.deleteVertexArray(this.overlay.spaceGridVao);
      if (this.overlay.spaceGridVbo) gl.deleteBuffer(this.overlay.spaceGridVbo);
      if (this.overlay.spaceGridColorVbo) gl.deleteBuffer(this.overlay.spaceGridColorVbo);
      if (this.overlay.spaceGridFalloffVbo) gl.deleteBuffer(this.overlay.spaceGridFalloffVbo);
      if (this.overlay.demoGridNodeVao) gl.deleteVertexArray(this.overlay.demoGridNodeVao);
      if (this.overlay.demoGridNodeVbo) gl.deleteBuffer(this.overlay.demoGridNodeVbo);
      if (this.overlay.demoGridNodeColorVbo)
        gl.deleteBuffer(this.overlay.demoGridNodeColorVbo);
      if (this.overlay.demoGridNodeFalloffVbo)
        gl.deleteBuffer(this.overlay.demoGridNodeFalloffVbo);
      this.overlay.spaceGridVao = null;
      this.overlay.spaceGridVbo = null;
      this.overlay.spaceGridColorVbo = null;
      this.overlay.spaceGridFalloffVbo = null;
      this.overlay.spaceGridCount = 0;
      this.overlay.demoGridNodeVao = null;
      this.overlay.demoGridNodeVbo = null;
      this.overlay.demoGridNodeColorVbo = null;
      this.overlay.demoGridNodeFalloffVbo = null;
      this.overlay.demoGridNodeCount = 0;
      this.overlayCache.spaceGridKey = "";
      this.overlayCache.demoGridNodeKey = "";
    }
    // Slice and surface modes are handled in the post shader.
  }


  private drawOverlays(mvp: Float32Array, state: Hull3DRendererState) {



    const { gl } = this;



    const overlayFlags = readOverlayFlags();



    const showHeatmapRing = !!overlayFlags.showHeatmapRing;



    const showShellBands = !!overlayFlags.showShellBands;



    const showPhaseTracer = !!overlayFlags.showPhaseTracer;



    const showReciprocity = !!overlayFlags.showReciprocity;



    const ringProgram = this.resources.ringOverlayProgram;



    const simpleProgram = this.resources.overlayProgram;
    this.updateDomainGrid(state);



    const ringReady = Boolean(

      ringProgram &&

      this.overlay.ringVao &&

      this.overlay.ringVertexCount > 0

    );



    const shouldDrawRing = ringReady && (

      state.showSectorRing ||

      showHeatmapRing ||

      showShellBands ||

      showPhaseTracer ||

      showReciprocity

    );



    if (shouldDrawRing && ringProgram && this.overlay.ringVao) {



      const loc = {



        u_mvp: gl.getUniformLocation(ringProgram, "u_mvp"),



        u_baseColor: gl.getUniformLocation(ringProgram, "u_baseColor"),



        u_baseAlpha: gl.getUniformLocation(ringProgram, "u_baseAlpha"),



        u_mode: gl.getUniformLocation(ringProgram, "u_mode"),



        u_ringAvg: gl.getUniformLocation(ringProgram, "u_ringAvg"),



        u_ringInst: gl.getUniformLocation(ringProgram, "u_ringInst"),



        u_radialLUT: gl.getUniformLocation(ringProgram, "u_radialLUT"),



        u_ringBlend: gl.getUniformLocation(ringProgram, "u_ringBlend"),



        u_phaseSign: gl.getUniformLocation(ringProgram, "u_phaseSign"),



        u_phase01: gl.getUniformLocation(ringProgram, "u_phase01"),



        u_showPhaseTracer: gl.getUniformLocation(ringProgram, "u_showPhaseTracer"),



        u_axes: gl.getUniformLocation(ringProgram, "u_axes"),



        u_R: gl.getUniformLocation(ringProgram, "u_R"),



        u_dfdrMax: gl.getUniformLocation(ringProgram, "u_dfdrMax"),



      } as const;



      gl.enable(gl.BLEND);



      if (state.showSurfaceOverlay) {

        // Additive blend keeps the ring visible on top of the surface sheet.

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      } else {

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      }



      gl.useProgram(ringProgram);



      if (loc.u_mvp) gl.uniformMatrix4fv(loc.u_mvp, false, mvp);



      const baseAlpha = state.showSectorRing ? 0.45 : 0.25;



      if (loc.u_baseColor) gl.uniform3f(loc.u_baseColor, 0.21, 0.85, 0.56);



      if (loc.u_baseAlpha) gl.uniform1f(loc.u_baseAlpha, baseAlpha);



      let ringMode = 0;



      if (showHeatmapRing) ringMode = 1;



      else if (showShellBands) ringMode = 2;



      if (loc.u_mode) gl.uniform1i(loc.u_mode, ringMode);



      if (loc.u_ringBlend) gl.uniform1f(loc.u_ringBlend, clamp(state.blendFactor, 0, 1));



      if (loc.u_phaseSign) gl.uniform1f(loc.u_phaseSign, this.phaseSignEffective);



      const phaseUniform = showPhaseTracer ? (state.phase01 ?? -1) : -1;



      this.uniformCache.set1f(gl, loc.u_phase01, phaseUniform);



      if (loc.u_showPhaseTracer) gl.uniform1i(loc.u_showPhaseTracer, showPhaseTracer ? 1 : 0);



      if (loc.u_axes) gl.uniform3f(loc.u_axes, state.axes[0], state.axes[1], state.axes[2]);



      if (loc.u_R) gl.uniform1f(loc.u_R, Math.max(state.R, 1e-3));



      if (loc.u_dfdrMax) gl.uniform1f(loc.u_dfdrMax, Math.max(this.radialDfMax, 1e-6));



      const ringInstantTex = this.ringInstantTex ?? this.ensureFallback2D();



      const ringAverageTex = this.ringAverageTex ?? ringInstantTex;



      const curvTex = this.curvature.hasData ? this.getActiveCurvatureTexture() : this.ensureCurvatureFallback();



      const radialTex = this.radialTex ?? this.ensureFallback2D();



      gl.activeTexture(gl.TEXTURE6);



      gl.bindTexture(gl.TEXTURE_2D, ringAverageTex);



      if (loc.u_ringAvg) gl.uniform1i(loc.u_ringAvg, 6);



      gl.activeTexture(gl.TEXTURE7);



      gl.bindTexture(gl.TEXTURE_2D, ringInstantTex);



      if (loc.u_ringInst) gl.uniform1i(loc.u_ringInst, 7);



      gl.activeTexture(gl.TEXTURE8);



      gl.bindTexture(gl.TEXTURE_2D, radialTex);



      if (loc.u_radialLUT) gl.uniform1i(loc.u_radialLUT, 8);



      gl.bindVertexArray(this.overlay.ringVao);



      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.overlay.ringVertexCount);



      gl.bindVertexArray(null);



      gl.disable(gl.BLEND);



      gl.activeTexture(gl.TEXTURE8);



      gl.bindTexture(gl.TEXTURE_2D, null);



      gl.activeTexture(gl.TEXTURE7);



      gl.bindTexture(gl.TEXTURE_2D, null);



      gl.activeTexture(gl.TEXTURE6);



      gl.bindTexture(gl.TEXTURE_2D, null);



      gl.activeTexture(gl.TEXTURE0);



    }



    if (!simpleProgram) return;



        gl.useProgram(simpleProgram);
    const loc = {
      u_mvp: gl.getUniformLocation(simpleProgram, "u_mvp"),
      u_color: gl.getUniformLocation(simpleProgram, "u_color"),
      u_alpha: gl.getUniformLocation(simpleProgram, "u_alpha"),
      u_useColor: gl.getUniformLocation(simpleProgram, "u_useColor"),
      u_timeSec: gl.getUniformLocation(simpleProgram, "u_timeSec"),
      u_legacyEnabled: gl.getUniformLocation(simpleProgram, "u_legacyEnabled"),
      u_legacyPointPass: gl.getUniformLocation(simpleProgram, "u_legacyPointPass"),
      u_legacyPulseEnabled: gl.getUniformLocation(simpleProgram, "u_legacyPulseEnabled"),
      u_legacyPointSize: gl.getUniformLocation(simpleProgram, "u_legacyPointSize"),
      u_legacyPulseRate: gl.getUniformLocation(simpleProgram, "u_legacyPulseRate"),
      u_legacyPulseSpatialFreq: gl.getUniformLocation(simpleProgram, "u_legacyPulseSpatialFreq"),
      u_legacyLineAlpha: gl.getUniformLocation(simpleProgram, "u_legacyLineAlpha"),
      u_legacyPointAlpha: gl.getUniformLocation(simpleProgram, "u_legacyPointAlpha"),
      u_legacyPaletteMix: gl.getUniformLocation(simpleProgram, "u_legacyPaletteMix"),
      u_legacyContrast: gl.getUniformLocation(simpleProgram, "u_legacyContrast"),
      u_spaceGridWarpEnabled: gl.getUniformLocation(simpleProgram, "u_spaceGridWarpEnabled"),
      u_spaceGridFieldSource: gl.getUniformLocation(simpleProgram, "u_spaceGridFieldSource"),
      u_spaceGridWarpField: gl.getUniformLocation(simpleProgram, "u_spaceGridWarpField"),
      u_spaceGridStyle: gl.getUniformLocation(simpleProgram, "u_spaceGridStyle"),
      u_spaceGridWarpGamma: gl.getUniformLocation(simpleProgram, "u_spaceGridWarpGamma"),
      u_spaceGridUseGradientDir: gl.getUniformLocation(simpleProgram, "u_spaceGridUseGradientDir"),
      u_spaceGridVolumeReady: gl.getUniformLocation(simpleProgram, "u_spaceGridVolumeReady"),
      u_spaceGridDfdrReady: gl.getUniformLocation(simpleProgram, "u_spaceGridDfdrReady"),
      u_spaceGridVolumeUseAtlas: gl.getUniformLocation(
        simpleProgram,
        "u_spaceGridVolumeUseAtlas",
      ),
      u_spaceGridDfdrUseAtlas: gl.getUniformLocation(
        simpleProgram,
        "u_spaceGridDfdrUseAtlas",
      ),
      u_spaceGridSignedDisplacement: gl.getUniformLocation(simpleProgram, "u_spaceGridSignedDisplacement"),
      u_spaceGridWarpStrength: gl.getUniformLocation(simpleProgram, "u_spaceGridWarpStrength"),
      u_spaceGridSpacingUsed: gl.getUniformLocation(simpleProgram, "u_spaceGridSpacingUsed"),
      u_spaceGridR: gl.getUniformLocation(simpleProgram, "u_spaceGridR"),
      u_spaceGridSigma: gl.getUniformLocation(simpleProgram, "u_spaceGridSigma"),
      u_spaceGridSpatialSign: gl.getUniformLocation(simpleProgram, "u_spaceGridSpatialSign"),
      u_spaceGridAxes: gl.getUniformLocation(simpleProgram, "u_spaceGridAxes"),
      u_spaceGridBoundsMin: gl.getUniformLocation(simpleProgram, "u_spaceGridBoundsMin"),
      u_spaceGridBoundsSize: gl.getUniformLocation(simpleProgram, "u_spaceGridBoundsSize"),
      u_spaceGridLatticeMin: gl.getUniformLocation(simpleProgram, "u_spaceGridLatticeMin"),
      u_spaceGridLatticeSize: gl.getUniformLocation(simpleProgram, "u_spaceGridLatticeSize"),
      u_spaceGridDims: gl.getUniformLocation(simpleProgram, "u_spaceGridDims"),
      u_spaceGridAtlasTiles: gl.getUniformLocation(simpleProgram, "u_spaceGridAtlasTiles"),
      u_spaceGridSliceInvSize: gl.getUniformLocation(simpleProgram, "u_spaceGridSliceInvSize"),
      u_spaceGridDfdr: gl.getUniformLocation(simpleProgram, "u_spaceGridDfdr"),
      u_spaceGridDfdrAtlas: gl.getUniformLocation(simpleProgram, "u_spaceGridDfdrAtlas"),
      u_spaceGridVolume: gl.getUniformLocation(simpleProgram, "u_spaceGridVolume"),
      u_spaceGridVolumeAtlas: gl.getUniformLocation(simpleProgram, "u_spaceGridVolumeAtlas"),
    } as const;



    if (loc.u_mvp) gl.uniformMatrix4fv(loc.u_mvp, false, mvp);






    if (loc.u_useColor) gl.uniform1i(loc.u_useColor, 0);
    if (loc.u_timeSec) gl.uniform1f(loc.u_timeSec, state.timeSec ?? 0);
    if (loc.u_legacyEnabled) gl.uniform1i(loc.u_legacyEnabled, 0);
    if (loc.u_legacyPointPass) gl.uniform1i(loc.u_legacyPointPass, 0);
    if (loc.u_legacyPulseEnabled) gl.uniform1i(loc.u_legacyPulseEnabled, 0);
    if (loc.u_legacyPointSize) gl.uniform1f(loc.u_legacyPointSize, 6);
    if (loc.u_legacyPulseRate) gl.uniform1f(loc.u_legacyPulseRate, 1.2);
    if (loc.u_legacyPulseSpatialFreq) gl.uniform1f(loc.u_legacyPulseSpatialFreq, 1.0);
    if (loc.u_legacyLineAlpha) gl.uniform1f(loc.u_legacyLineAlpha, 0.45);
    if (loc.u_legacyPointAlpha) gl.uniform1f(loc.u_legacyPointAlpha, 0.9);
    if (loc.u_legacyPaletteMix) gl.uniform1f(loc.u_legacyPaletteMix, 1.0);
    if (loc.u_legacyContrast) gl.uniform1f(loc.u_legacyContrast, 1.0);
    if (loc.u_spaceGridStyle) gl.uniform1i(loc.u_spaceGridStyle, 0);
    if (loc.u_spaceGridVolumeUseAtlas) gl.uniform1i(loc.u_spaceGridVolumeUseAtlas, 0);
    if (loc.u_spaceGridDfdrUseAtlas) gl.uniform1i(loc.u_spaceGridDfdrUseAtlas, 0);
    if (loc.u_spaceGridWarpEnabled) gl.uniform1i(loc.u_spaceGridWarpEnabled, 0);
    if (state.showGhostSlice && this.overlay.sliceVao) {



      gl.enable(gl.BLEND);



      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);



      if (loc.u_color) gl.uniform3f(loc.u_color, 0.4, 0.7, 0.95);



      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, 0.06);



      gl.bindVertexArray(this.overlay.sliceVao);



      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);



      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, 0.18);



      gl.drawArrays(gl.LINE_LOOP, 0, 4);



      gl.bindVertexArray(null);



      gl.disable(gl.BLEND);



    }



    




    const domainGridActive =
      !!state.overlays?.domainGrid?.enabled &&
      this.overlay.domainGridVao &&
      this.overlay.domainGridCount > 0;

    if (domainGridActive) {
      const gridCfg = state.overlays?.domainGrid;
      const alphaRaw = Number(gridCfg?.alpha);
      const alpha = Number.isFinite(alphaRaw) ? clamp(alphaRaw, 0, 1) : 0.1;
      const color = gridCfg?.color ?? [0.55, 0.7, 0.9];
      const r = clamp(Number(color[0] ?? 0.55), 0, 1);
      const g = clamp(Number(color[1] ?? 0.7), 0, 1);
      const b = clamp(Number(color[2] ?? 0.9), 0, 1);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (loc.u_useColor) gl.uniform1i(loc.u_useColor, 0);
      if (loc.u_color) gl.uniform3f(loc.u_color, r, g, b);
      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, alpha);
      gl.bindVertexArray(this.overlay.domainGridVao);
      gl.drawArrays(gl.LINES, 0, this.overlay.domainGridCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    const spaceCageActive =
      this.spacetimeGridState.enabled &&
      this.spacetimeGridState.mode === "volume" &&
      this.overlay.spaceGridVao &&
      this.overlay.spaceGridCount > 0;



    if (spaceCageActive) {



      const spaceCfg = state.overlays?.spacetimeGrid;
      const spaceStyle =
        spaceCfg?.style ?? this.spacetimeGridState.style ?? "scientific";
      const legacyEnabled = spaceStyle === "legacyDemo";
      const spaceStyleId = legacyEnabled ? 1 : 0;
      const showLegacyLines = legacyEnabled;
      const showLegacyNodes =
        legacyEnabled &&
        this.overlay.demoGridNodeVao &&
        this.overlay.demoGridNodeCount > 0;
      const drawBaseGrid = !legacyEnabled;



      const colorParam =



        spaceCfg?.colorBy === "warpStrength"



          ? Math.max(-2, Math.min(2, (spaceCfg?.warpStrength ?? 0) * 0.25))



          : 0;



      const [rc, gc, bc] = this.divergeColor(colorParam);
      const useColor = !!this.overlay.spaceGridColorVbo;
      const resolvedFieldSource =
        spaceCfg?.fieldSource ?? this.spacetimeGridState.fieldSource ?? "volume";
      const fieldSourceId = resolvedFieldSource === "analytic" ? 1 : 0;
      const warpFieldRaw =
        spaceCfg?.warpField ?? this.spacetimeGridState.warpField ?? "dfdr";
      const warpFieldId = warpFieldRaw === "alpha" ? 1 : 0;
      const effectiveWarpFieldId = fieldSourceId === 1 ? 0 : warpFieldId;
      const useAlphaField = effectiveWarpFieldId === 1;
      const warpGamma = Number.isFinite(spaceCfg?.warpGamma)
        ? clamp(spaceCfg?.warpGamma as number, 0.1, 6)
        : this.spacetimeGridState.warpGamma;
      const useGradientDir =
        typeof spaceCfg?.useGradientDir === "boolean"
          ? spaceCfg.useGradientDir
          : this.spacetimeGridState.useGradientDir;
      const signedDisplacement =
        typeof spaceCfg?.signedDisplacement === "boolean"
          ? spaceCfg.signedDisplacement
          : this.spacetimeGridState.signedDisplacement;
      const legacyPulseEnabled =
        typeof spaceCfg?.legacyPulseEnabled === "boolean"
          ? spaceCfg.legacyPulseEnabled
          : this.spacetimeGridState.legacyPulseEnabled;
      const legacyPulseRate = Number.isFinite(spaceCfg?.legacyPulseRate)
        ? clamp(spaceCfg?.legacyPulseRate as number, 0, 6)
        : this.spacetimeGridState.legacyPulseRate;
      const legacyPulseSpatialFreq = Number.isFinite(spaceCfg?.legacyPulseSpatialFreq)
        ? clamp(spaceCfg?.legacyPulseSpatialFreq as number, 0, 6)
        : this.spacetimeGridState.legacyPulseSpatialFreq;
      const legacyPointSize = Number.isFinite(spaceCfg?.legacyPointSize)
        ? clamp(spaceCfg?.legacyPointSize as number, 1, 24)
        : this.spacetimeGridState.legacyPointSize;
      const legacyPaletteMix = Number.isFinite(spaceCfg?.legacyPaletteMix)
        ? clamp(spaceCfg?.legacyPaletteMix as number, 0, 1)
        : this.spacetimeGridState.legacyPaletteMix;
      const legacyContrast = Number.isFinite(spaceCfg?.legacyContrast)
        ? clamp(spaceCfg?.legacyContrast as number, 0.1, 4)
        : this.spacetimeGridState.legacyContrast;
      const legacyLineAlpha = Number.isFinite(spaceCfg?.legacyLineAlpha)
        ? clamp(spaceCfg?.legacyLineAlpha as number, 0, 1)
        : this.spacetimeGridState.legacyLineAlpha;
      const legacyPointAlpha = Number.isFinite(spaceCfg?.legacyPointAlpha)
        ? clamp(spaceCfg?.legacyPointAlpha as number, 0, 1)
        : this.spacetimeGridState.legacyPointAlpha;
      const { warpStrength: spaceWarpStrength } = this.resolveSpacetimeGridWarpStrength(state, spaceCfg);
      const spacingUsed = Number.isFinite(this.spacetimeGridState.spacingUsed_m)
        ? this.spacetimeGridState.spacingUsed_m
        : spaceCfg?.spacing_m ?? 0.3;
      const thetaSign = Math.sign(state.thetaSign ?? 1) || 1;
      const spatialSign = -thetaSign;
      const latticeToWorld = state.latticeFrame?.latticeToWorld ?? null;
      const boundsMin = this.spacetimeGridState.boundsMin ?? [0, 0, 0];
      const boundsSize = this.spacetimeGridState.boundsSize ?? [0, 0, 0];
      const latticeMin = state.latticeMin ?? [0, 0, 0];
      const latticeSize = state.latticeSize ?? [1, 1, 1];
      const activeLattice =
        state.latticeVolume && this.latticeUpload && this.latticeUpload.hash === state.latticeVolume.hash
          ? this.latticeUpload
          : null;
      const volumeDims = activeLattice?.dims ?? [1, 1, 1];
      const volumeAtlas = activeLattice?.format.atlas ?? null;
      const volumeUseAtlas = activeLattice?.format.backend === "atlas2d";
      const volumeReady = !!(
        activeLattice &&
        state.latticeVolume &&
        this.latticeVolumeReadyKey === state.latticeVolume.hash &&
        volumeDims[0] > 1 &&
        volumeDims[1] > 1 &&
        volumeDims[2] > 1
      );
      const volumeAtlasTiles: [number, number] = volumeAtlas
        ? [volumeAtlas.tilesX, volumeAtlas.tilesY]
        : [1, 1];
      const volumeSliceInvSize: [number, number] = [
        1 / Math.max(1, volumeDims[0]),
        1 / Math.max(1, volumeDims[1]),
      ];
      const dfdrUpload =
        state.latticeVolume &&
        this.latticeDfdrUpload &&
        this.latticeDfdrUpload.hash === state.latticeVolume.hash
          ? this.latticeDfdrUpload
          : null;
      const dfdrDims = dfdrUpload?.dims ?? activeLattice?.dims ?? [1, 1, 1];
      const dfdrAtlas = dfdrUpload?.atlas ?? activeLattice?.format.atlas ?? null;
      const dfdrUseAtlas = dfdrUpload?.backend === "atlas2d";
      const dfdrReady =
        fieldSourceId === 1 ||
        (!!dfdrUpload &&
          !!state.latticeVolume &&
          this.latticeDfdrReadyKey === dfdrUpload.hash &&
          dfdrDims[0] > 1 &&
          dfdrDims[1] > 1 &&
          dfdrDims[2] > 1);
      const dfdrAtlasTiles: [number, number] = dfdrAtlas
        ? [dfdrAtlas.tilesX, dfdrAtlas.tilesY]
        : [1, 1];
      const dfdrSliceInvSize: [number, number] = [
        1 / Math.max(1, dfdrDims[0]),
        1 / Math.max(1, dfdrDims[1]),
      ];
      const fieldDims = useAlphaField ? volumeDims : dfdrDims;
      const fieldAtlasTiles = useAlphaField ? volumeAtlasTiles : dfdrAtlasTiles;
      const fieldSliceInvSize = useAlphaField ? volumeSliceInvSize : dfdrSliceInvSize;

      if (loc.u_spaceGridWarpEnabled) gl.uniform1i(loc.u_spaceGridWarpEnabled, 1);
      if (loc.u_spaceGridFieldSource) gl.uniform1i(loc.u_spaceGridFieldSource, fieldSourceId);
      if (loc.u_spaceGridWarpField) gl.uniform1i(loc.u_spaceGridWarpField, effectiveWarpFieldId);
      if (loc.u_spaceGridStyle) gl.uniform1i(loc.u_spaceGridStyle, spaceStyleId);
      if (loc.u_spaceGridWarpGamma) gl.uniform1f(loc.u_spaceGridWarpGamma, warpGamma);
      if (loc.u_spaceGridUseGradientDir) {
        gl.uniform1i(loc.u_spaceGridUseGradientDir, useGradientDir ? 1 : 0);
      }
      if (loc.u_spaceGridVolumeReady) gl.uniform1i(loc.u_spaceGridVolumeReady, volumeReady ? 1 : 0);
      if (loc.u_spaceGridDfdrReady) gl.uniform1i(loc.u_spaceGridDfdrReady, dfdrReady ? 1 : 0);
      if (loc.u_spaceGridVolumeUseAtlas) {
        gl.uniform1i(loc.u_spaceGridVolumeUseAtlas, volumeUseAtlas ? 1 : 0);
      }
      if (loc.u_spaceGridDfdrUseAtlas) {
        gl.uniform1i(loc.u_spaceGridDfdrUseAtlas, dfdrUseAtlas ? 1 : 0);
      }
      if (loc.u_legacyPulseEnabled) {
        gl.uniform1i(loc.u_legacyPulseEnabled, legacyPulseEnabled ? 1 : 0);
      }
      if (loc.u_legacyPointSize) gl.uniform1f(loc.u_legacyPointSize, legacyPointSize);
      if (loc.u_legacyPulseRate) gl.uniform1f(loc.u_legacyPulseRate, legacyPulseRate);
      if (loc.u_legacyPulseSpatialFreq) {
        gl.uniform1f(loc.u_legacyPulseSpatialFreq, legacyPulseSpatialFreq);
      }
      if (loc.u_legacyLineAlpha) gl.uniform1f(loc.u_legacyLineAlpha, legacyLineAlpha);
      if (loc.u_legacyPointAlpha) gl.uniform1f(loc.u_legacyPointAlpha, legacyPointAlpha);
      if (loc.u_legacyPaletteMix) gl.uniform1f(loc.u_legacyPaletteMix, legacyPaletteMix);
      if (loc.u_legacyContrast) gl.uniform1f(loc.u_legacyContrast, legacyContrast);
      if (loc.u_spaceGridSignedDisplacement) {
        gl.uniform1i(loc.u_spaceGridSignedDisplacement, signedDisplacement ? 1 : 0);
      }
      if (loc.u_spaceGridWarpStrength) gl.uniform1f(loc.u_spaceGridWarpStrength, spaceWarpStrength);
      if (loc.u_spaceGridSpacingUsed) gl.uniform1f(loc.u_spaceGridSpacingUsed, spacingUsed);
      if (loc.u_spaceGridR) gl.uniform1f(loc.u_spaceGridR, Math.max(1e-6, Math.abs(state.R)));
      if (loc.u_spaceGridSigma) gl.uniform1f(loc.u_spaceGridSigma, Math.max(1e-6, state.sigma));
      if (loc.u_spaceGridSpatialSign) gl.uniform1f(loc.u_spaceGridSpatialSign, spatialSign);
      if (loc.u_spaceGridAxes) {
        gl.uniform3f(
          loc.u_spaceGridAxes,
          Math.max(1e-6, Math.abs(state.axes[0] ?? 1)),
          Math.max(1e-6, Math.abs(state.axes[1] ?? 1)),
          Math.max(1e-6, Math.abs(state.axes[2] ?? 1)),
        );
      }
      if (loc.u_spaceGridBoundsMin) {
        gl.uniform3f(loc.u_spaceGridBoundsMin, boundsMin[0], boundsMin[1], boundsMin[2]);
      }
      if (loc.u_spaceGridBoundsSize) {
        gl.uniform3f(loc.u_spaceGridBoundsSize, boundsSize[0], boundsSize[1], boundsSize[2]);
      }
      if (loc.u_spaceGridLatticeMin) {
        gl.uniform3f(loc.u_spaceGridLatticeMin, latticeMin[0], latticeMin[1], latticeMin[2]);
      }
      if (loc.u_spaceGridLatticeSize) {
        gl.uniform3f(loc.u_spaceGridLatticeSize, latticeSize[0], latticeSize[1], latticeSize[2]);
      }
      if (loc.u_spaceGridDims) {
        gl.uniform3f(loc.u_spaceGridDims, fieldDims[0], fieldDims[1], fieldDims[2]);
      }
      if (loc.u_spaceGridAtlasTiles) {
        gl.uniform2f(loc.u_spaceGridAtlasTiles, fieldAtlasTiles[0], fieldAtlasTiles[1]);
      }
      if (loc.u_spaceGridSliceInvSize) {
        gl.uniform2f(loc.u_spaceGridSliceInvSize, fieldSliceInvSize[0], fieldSliceInvSize[1]);
      }
      if (loc.u_spaceGridDfdr) {
        const tex3d =
          dfdrReady && !dfdrUseAtlas && this.latticeDfdrTex ? this.latticeDfdrTex : this.ensureDummy3D();
        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_3D, tex3d);
        gl.uniform1i(loc.u_spaceGridDfdr, 10);
      }
      if (loc.u_spaceGridDfdrAtlas) {
        const tex2d =
          dfdrReady && dfdrUseAtlas && this.latticeDfdrAtlasTex
            ? this.latticeDfdrAtlasTex
            : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D, tex2d);
        gl.uniform1i(loc.u_spaceGridDfdrAtlas, 11);
      }
      if (loc.u_spaceGridVolume) {
        const tex3d =
          volumeReady && !volumeUseAtlas && this.volumeTex ? this.volumeTex : this.ensureDummy3D();
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_3D, tex3d);
        gl.uniform1i(loc.u_spaceGridVolume, 12);
      }
      if (loc.u_spaceGridVolumeAtlas) {
        const tex2d =
          volumeReady && volumeUseAtlas && this.latticeAtlasTex
            ? this.latticeAtlasTex
            : this.ensureFallback2D();
        gl.activeTexture(gl.TEXTURE13);
        gl.bindTexture(gl.TEXTURE_2D, tex2d);
        gl.uniform1i(loc.u_spaceGridVolumeAtlas, 13);
      }



      const gridMvp = latticeToWorld ? multiply(identity(), mvp, latticeToWorld) : mvp;
      if (loc.u_mvp) {
        gl.uniformMatrix4fv(loc.u_mvp, false, gridMvp);
      }

      if (loc.u_legacyEnabled) gl.uniform1i(loc.u_legacyEnabled, 0);
      if (loc.u_legacyPointPass) gl.uniform1i(loc.u_legacyPointPass, 0);

      if (drawBaseGrid) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        if (loc.u_useColor) gl.uniform1i(loc.u_useColor, useColor ? 1 : 0);
        if (loc.u_color && !useColor) gl.uniform3f(loc.u_color, rc, gc, bc);

        const warpBoost =
          typeof spaceCfg?.warpStrength === "number" ? spaceCfg.warpStrength : 0;
        const gridAlpha = clamp(0.65 + 0.12 * warpBoost, 0.6, 0.9);
        if (loc.u_alpha) gl.uniform1f(loc.u_alpha, gridAlpha);

        gl.bindVertexArray(this.overlay.spaceGridVao);
        gl.drawArrays(gl.LINES, 0, this.overlay.spaceGridCount);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }

      if (showLegacyLines || showLegacyNodes) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (loc.u_legacyEnabled) gl.uniform1i(loc.u_legacyEnabled, 1);
        if (loc.u_useColor) gl.uniform1i(loc.u_useColor, useColor ? 1 : 0);
        if (loc.u_color && !useColor) gl.uniform3f(loc.u_color, rc, gc, bc);

        if (showLegacyLines) {
          if (loc.u_legacyPointPass) gl.uniform1i(loc.u_legacyPointPass, 0);
          gl.bindVertexArray(this.overlay.spaceGridVao);
          gl.drawArrays(gl.LINES, 0, this.overlay.spaceGridCount);
        }
        if (showLegacyNodes && this.overlay.demoGridNodeVao) {
          if (loc.u_legacyPointPass) gl.uniform1i(loc.u_legacyPointPass, 1);
          gl.bindVertexArray(this.overlay.demoGridNodeVao);
          gl.drawArrays(gl.POINTS, 0, this.overlay.demoGridNodeCount);
        }
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        if (loc.u_legacyEnabled) gl.uniform1i(loc.u_legacyEnabled, 0);
      }

      if (loc.u_mvp && latticeToWorld) gl.uniformMatrix4fv(loc.u_mvp, false, mvp);



    }



    const streamlinesReady =
      !!state.fluxStreamlines?.enabled &&
      !!this.overlay.fluxStreamVao &&
      this.overlay.fluxStreamCount > 1 &&
      this.overlay.fluxStreamAlpha > 1e-4;

    if (streamlinesReady) {
      const [r, g, b] = this.overlay.fluxStreamColor;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      if (loc.u_spaceGridWarpEnabled) gl.uniform1i(loc.u_spaceGridWarpEnabled, 0);
      if (loc.u_useColor) gl.uniform1i(loc.u_useColor, 0);
      if (loc.u_color) gl.uniform3f(loc.u_color, r, g, b);
      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, this.overlay.fluxStreamAlpha);
      gl.bindVertexArray(this.overlay.fluxStreamVao);
      gl.drawArrays(gl.LINES, 0, this.overlay.fluxStreamCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    const observerDirectionReady =
      this.observerDirectionOverlay.enabled === true &&
      !!this.overlay.observerDirectionVao &&
      this.overlay.observerDirectionCount > 1 &&
      this.overlay.observerDirectionAlpha > 1e-4;
    if (observerDirectionReady) {
      const [r, g, b] = this.overlay.observerDirectionColor;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      if (loc.u_spaceGridWarpEnabled) gl.uniform1i(loc.u_spaceGridWarpEnabled, 0);
      if (loc.u_useColor) gl.uniform1i(loc.u_useColor, 0);
      if (loc.u_color) gl.uniform3f(loc.u_color, r, g, b);
      if (loc.u_alpha) gl.uniform1f(loc.u_alpha, this.overlay.observerDirectionAlpha);
      gl.bindVertexArray(this.overlay.observerDirectionVao);
      gl.drawArrays(gl.LINES, 0, this.overlay.observerDirectionCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    if ((this._diag.state === 'holding' || !this._diag.lastOk) && this._diag.message) {



      const pad = 18;



      const w = Math.max(96, Math.floor(this.canvas.width * 0.18));



      const h = Math.max(48, Math.floor(this.canvas.height * 0.12));



      const y = this.canvas.height - h - pad;



      const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;



      gl.enable(gl.SCISSOR_TEST);



      gl.scissor(pad, y, w, h);



      gl.clearColor(0.24, 0.08, 0.08, 1.0);



      gl.clear(gl.COLOR_BUFFER_BIT);



      gl.disable(gl.SCISSOR_TEST);



      gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);



    }



  }







  private resolveFActive(state: Hull3DRendererState) {



    const raw = Number(state.fActive);



    if (Number.isFinite(raw) && raw > 1e-6) {



      return clamp(raw, 1e-6, 1);



    }



    const statsRaw = this.ringLastStats?.rawMean;



    if (typeof statsRaw === "number" && Number.isFinite(statsRaw) && statsRaw > 1e-6) {



      return clamp(statsRaw, 1e-6, 1);



    }



    let fActive = 0;



    if (fActive <= 1e-6) {



      const totalRaw = Number.isFinite(state.totalSectors) ? Math.max(0, state.totalSectors) : 0;



      const liveRaw = Number.isFinite(state.liveSectors) ? Math.max(0, state.liveSectors) : 0;



      const dutyRaw = Number.isFinite(state.duty) ? Math.max(0, state.duty) : 0;



      const totalSafe = Math.max(1, totalRaw);



      const sectorFrac = totalRaw > 0 ? Math.max(1 / totalSafe, liveRaw / totalSafe) : 0;



      fActive = Math.max(sectorFrac, dutyRaw);



    }



    return clamp(fActive, 1e-6, 1);



  }







  private resolveVolumeViz(state: Hull3DRendererState): Hull3DVolumeViz {



    const mode = state.volumeViz ?? this.volumeViz;



    if (
      mode === "theta_gr" ||
      mode === "rho_gr" ||
      mode === "theta_drive" ||
      mode === "shear_gr" ||
      mode === "vorticity_gr" ||
      mode === "alpha"
    ) {



      return mode;



    }



    return "theta_drive";



  }









  private resolveVolumeSource(state: Hull3DRendererState): Hull3DVolumeSource {
    const mode = state.volumeSource ?? this.volumeSource;
    if (mode === "analytic" || mode === "lattice" || mode === "brick") {
      return mode;
    }
    return "lattice";
  }

  private normalizeOpacityWindow(window?: [number, number]): [number, number] {

    const base = Array.isArray(window) && window.length >= 2 ? window : (this.opacityWindow ?? DEFAULT_OPACITY_WINDOW);

    let lo = Number((base as any)[0]);
    let hi = Number((base as any)[1]);
    if (!Number.isFinite(lo)) lo = DEFAULT_OPACITY_WINDOW[0];
    if (!Number.isFinite(hi)) hi = DEFAULT_OPACITY_WINDOW[1];
    lo = Math.max(1e-6, lo);
    hi = Math.max(lo + 1e-4, hi);
    return [lo, hi];

  }



  private resolveVolumeDomain(state: Hull3DRendererState): Hull3DVolumeDomain {

    const mode = state.volumeDomain ?? this.volumeDomain;
    return mode === "bubbleBox" ? "bubbleBox" : "wallBand";

  }



  private resolveVolumeDomainIndex(state: Hull3DRendererState): 0 | 1 {

    return VOLUME_DOMAIN_TO_INDEX[this.resolveVolumeDomain(state)];

  }

  setVolumeViz(mode: Hull3DVolumeViz) {



    this.volumeViz = mode;



    if (this.state) {



      this.state.volumeViz = mode;



    }



  }



  setVizIntent(viz: { enabled: boolean; mag01: number; rise01: number }) {



    const next = {



      enabled: !!viz?.enabled,



      mag01: Number.isFinite(viz?.mag01) ? Math.max(0, Math.min(1, viz.mag01)) : 0,



      rise01: Number.isFinite(viz?.rise01)



        ? Math.max(-1, Math.min(1, viz.rise01))



        : 0,



    };



    this.vizIntent = next;



  }







  private resolveVolumeVizIndex(state: Hull3DRendererState): 0 | 1 | 2 | 3 | 4 | 5 {



    return VOLUME_VIZ_TO_INDEX[this.resolveVolumeViz(state)];



  }







  private captureDebugTap() {



    const { gl } = this;



    if (!gl || this.canvas.width <= 0 || this.canvas.height <= 0) return;



    if (!this.debugTapBuffer) {



      this.debugTapBuffer = new Uint8Array(4);



    }



    const buf = this.debugTapBuffer;



    const decodeLogVis = (channel: number) => {



      const norm = channel / 255;



      const exponent = norm * 100 - 60;



      return Math.pow(2, exponent);



    };



    const win = typeof window !== "undefined" ? (window as any) : undefined;



    const manual = win?.__hullTapPixel;



    const points: Array<{ x: number; y: number }> = [];



    if (manual) {



      if (Array.isArray(manual) && manual.length >= 2) {



        points.push({



          x: Math.round(manual[0]),



          y: Math.round(manual[1]),



        });



      } else if (typeof manual === "object" && Number.isFinite(manual.x) && Number.isFinite(manual.y)) {



        points.push({



          x: Math.round(manual.x),



          y: Math.round(manual.y),



        });



      }



    }



    if (points.length === 0) {



      const gridRaw = Number(win?.__hullTapGrid);



      const grid = Number.isFinite(gridRaw) ? clamp(Math.round(gridRaw), 2, 24) : 9;



      const stepX = this.canvas.width / grid;



      const stepY = this.canvas.height / grid;



      for (let gy = 0; gy < grid; gy++) {



        for (let gx = 0; gx < grid; gx++) {



          const sx = Math.min(Math.max(Math.round((gx + 0.5) * stepX), 0), this.canvas.width - 1);



          const sy = Math.min(Math.max(Math.round((gy + 0.5) * stepY), 0), this.canvas.height - 1);



          points.push({ x: sx, y: sy });



        }



      }



    }



    type TapSample = {



      raw: number;



      boosted: number;



      density: number;



      drive: number;



      ratio: number;



      driveBoost: number;



      densityScale: number;



      pixel: [number, number];



    };



    let best: TapSample | null = null;



    const collect: TapSample[] | null = win?.__hullTapCollect ? [] : null;



    for (const pt of points) {



      gl.readPixels(pt.x, pt.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);



      const raw = decodeLogVis(buf[0]);



      const boosted = decodeLogVis(buf[1]);



      const density = decodeLogVis(buf[2]);



      const drive = decodeLogVis(buf[3]);



      const ratio = boosted / Math.max(raw, 1e-36);



      const driveBoost = drive / Math.max(raw, 1e-36);



      const tap = {



        raw,



        boosted,



        density,



        drive,



        ratio,



        driveBoost,



        densityScale: this.lastDensityScale,



        pixel: [pt.x, pt.y] as [number, number],



      };



      if (!best || boosted > best.boosted) {



        best = tap;



      }



      if (collect) collect.push(tap);



    }



    if (best && win) {



      win.__hullFieldTap = best;



      if (collect) win.__hullFieldTapSamples = collect;



    }



    if (best && (this.debugCounter % 60) === 0) {



      console.log("[Hull3D][tap]", best);



    }



  }







  private resolveBaseScale(state: Hull3DRendererState): number {



    const viz = this.resolveVolumeViz(state);



    if (viz === "theta_gr" || viz === "vorticity_gr") {



      return state.beta;



    }



    if (viz === "rho_gr" || viz === "shear_gr") {



      return state.beta * state.beta;



    }



    if (viz === "alpha") {
      return 1;
    }
    return state.ampChain * state.beta * state.gate;



  }







  private resolveDensityScale(state: Hull3DRendererState, effectiveExposure: number) {



    const viz = this.resolveVolumeViz(state);
    if (viz === "alpha") {
      return clamp(0.8 * effectiveExposure, 1e-5, 12);
    }



    const dfMax = Math.max(this.radialDfMax, 1e-6);



    const beta = Number.isFinite(state.beta) ? state.beta : 0;



    let rawMag: number;



    if (viz === "theta_gr" || viz === "vorticity_gr") {



      rawMag = Math.abs(beta) * dfMax;



    } else if (viz === "rho_gr") {



      const betaSq = beta * beta;



      rawMag = Math.abs(betaSq) * dfMax * dfMax * INV16PI;
    } else if (viz === "shear_gr") {
      const betaSq = beta * beta;
      rawMag = Math.abs(betaSq) * dfMax * dfMax;



    } else {



      rawMag = Math.abs(beta * state.ampChain * state.gate);



    }



    if (!Number.isFinite(rawMag) || rawMag <= 0) {



      return clamp(0.8 * effectiveExposure, 1e-5, 12);



    }



    const logMag = Math.log10(rawMag + 1e-30);



    // As drive magnitude grows, reduce density exponentially; clamp to retain visibility.



    const logGain = clamp(0.55 - logMag * 0.35, -3.2, 2.6);



    const baseScale = Math.pow(10, logGain);



    const stats = this.ringLastStats;



    const gateBias = stats ? clamp(1.0 / Math.max(stats.mean, 1e-3), 0.4, 2.5) : 1.0;



    const scale = baseScale * gateBias * effectiveExposure;



    const maxScale = viz === "theta_drive" ? 8.0 : 8.0e6;



    return clamp(scale, 5e-5, maxScale);



  }







  private drawPreviewMesh(mvp: Float32Array, _state: Hull3DRendererState) {
    const program = this.resources.previewMeshProgram;
    if (!program) return;
    if (!this.overlay.previewVao || this.overlay.previewCount <= 0) return;

    const { gl } = this;
    gl.useProgram(program);

    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);

    const loc = {
      u_mvp: gl.getUniformLocation(program, "u_mvp"),
      u_color: gl.getUniformLocation(program, "u_color"),
      u_tex: gl.getUniformLocation(program, "u_tex"),
      u_hasTex: gl.getUniformLocation(program, "u_hasTex"),
    } as const;

    if (loc.u_mvp) gl.uniformMatrix4fv(loc.u_mvp, false, mvp);
    const color = this.overlay.previewColor ?? new Float32Array([0.82, 0.88, 0.96, 0.95]);
    if (loc.u_color) gl.uniform4fv(loc.u_color, color);

    const hasTex = !!(this.overlay.previewTexture && this.overlay.previewHasUv);
    if (loc.u_hasTex) gl.uniform1i(loc.u_hasTex, hasTex ? 1 : 0);
    if (hasTex && loc.u_tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.overlay.previewTexture);
      gl.uniform1i(loc.u_tex, 0);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.bindVertexArray(this.overlay.previewVao);
    if (this.overlay.previewIndexed && this.overlay.previewIbo && this.overlay.previewIndexType) {
      gl.drawElements(gl.TRIANGLES, this.overlay.previewCount, this.overlay.previewIndexType, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, this.overlay.previewCount);
    }
    gl.bindVertexArray(null);
    if (hasTex) {
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    if (!prevBlend) gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
  }



  private drawWireframeFallback(mvp: Float32Array) {



    this.ensureFallbackProgram();



    if (!this.overlay.fallbackProgram || !this.overlay.wireframeVao) return;



    const { gl } = this;



    gl.useProgram(this.overlay.fallbackProgram);



    const loc = {



      u_mvp: gl.getUniformLocation(this.overlay.fallbackProgram, "u_mvp"),



      u_color: gl.getUniformLocation(this.overlay.fallbackProgram, "u_color"),



      u_alpha: gl.getUniformLocation(this.overlay.fallbackProgram, "u_alpha"),



      u_useColor: gl.getUniformLocation(this.overlay.fallbackProgram, "u_useColorAttr"),



    };



    gl.uniformMatrix4fv(loc.u_mvp, false, mvp);



    gl.uniform3fv(loc.u_color, WIREFRAME_COLOR);



    gl.uniform1f(loc.u_alpha, 0.65);



    if (loc.u_useColor) gl.uniform1i(loc.u_useColor, 0);



    gl.bindVertexArray(this.overlay.wireframeVao);



    gl.drawArrays(gl.LINES, 0, 96 * 2);



    gl.bindVertexArray(null);



  }







  dispose() {



    const { gl } = this;



    if (this.resources.rayProgram) gl.deleteProgram(this.resources.rayProgram);



    if (this.resources.overlayProgram) gl.deleteProgram(this.resources.overlayProgram);



    if (this.resources.previewMeshProgram) gl.deleteProgram(this.resources.previewMeshProgram);



    if (this.resources.ringOverlayProgram) gl.deleteProgram(this.resources.ringOverlayProgram);



    if (this.resources.postProgram) gl.deleteProgram(this.resources.postProgram);



    if (this.surfaceProgram) gl.deleteProgram(this.surfaceProgram);



    if (this.betaOverlayProgram) gl.deleteProgram(this.betaOverlayProgram);



    if (this.resources.quadVao) gl.deleteVertexArray(this.resources.quadVao);



    if (this.resources.quadVbo) gl.deleteBuffer(this.resources.quadVbo);



    if (this.radialTex) {



      gl.deleteTexture(this.radialTex);



      this.radialTex = null;



    }



    if (this.ringInstantTex) {



      gl.deleteTexture(this.ringInstantTex);



      this.ringInstantTex = null;



    }



    if (this.ringAverageTex) {



      gl.deleteTexture(this.ringAverageTex);



      this.ringAverageTex = null;



    }



    if (this.volumeTex) gl.deleteTexture(this.volumeTex);
    if (this.gateVolumeTex) gl.deleteTexture(this.gateVolumeTex);
    if (this.latticeAtlasTex) {
      gl.deleteTexture(this.latticeAtlasTex);
      this.latticeAtlasTex = null;
    }
    this.latticeUpload = null;
    this.latticeVolumeReadyKey = null;
    this.latticeUploadFailedHash = null;
    this.latticeUploadFailedReason = null;

    if (this.latticeSdfTex) {
      gl.deleteTexture(this.latticeSdfTex);
      this.latticeSdfTex = null;
    }
    if (this.latticeSdfAtlasTex) {
      gl.deleteTexture(this.latticeSdfAtlasTex);
      this.latticeSdfAtlasTex = null;
    }
    this.latticeSdfUpload = null;
    this.latticeSdfUploadFailedKey = null;
    this.latticeSdfUploadFailedReason = null;
    this.latticeSdfReadyKey = null;
    if (this.latticeDfdrTex) {
      gl.deleteTexture(this.latticeDfdrTex);
      this.latticeDfdrTex = null;
    }
    if (this.latticeDfdrAtlasTex) {
      gl.deleteTexture(this.latticeDfdrAtlasTex);
      this.latticeDfdrAtlasTex = null;
    }
    this.latticeDfdrUpload = null;
    this.latticeDfdrUploadFailedHash = null;
    this.latticeDfdrUploadFailedReason = null;
    this.latticeDfdrReadyKey = null;



    if (this.curvature.texA) {



      gl.deleteTexture(this.curvature.texA);



      this.curvature.texA = null;



    }



    if (this.curvature.texB) {



      gl.deleteTexture(this.curvature.texB);



      this.curvature.texB = null;



    }

    if (this.t00.texA) {
      gl.deleteTexture(this.t00.texA);
      this.t00.texA = null;
    }
    if (this.t00.texB) {
      gl.deleteTexture(this.t00.texB);
      this.t00.texB = null;
    }
    if (this.t00.fallback) {
      gl.deleteTexture(this.t00.fallback);
      this.t00.fallback = null;
    }
    if (this.metricVolume.texAB) {
      gl.deleteTexture(this.metricVolume.texAB);
      this.metricVolume.texAB = null;
    }
    if (this.metricVolume.texGamma) {
      gl.deleteTexture(this.metricVolume.texGamma);
      this.metricVolume.texGamma = null;
    }
    if (this.metricVolume.fallbackAB) {
      gl.deleteTexture(this.metricVolume.fallbackAB);
      this.metricVolume.fallbackAB = null;
    }
    if (this.metricVolume.fallbackGamma) {
      gl.deleteTexture(this.metricVolume.fallbackGamma);
      this.metricVolume.fallbackGamma = null;
    }
    this.metricVolume.hasData = false;
    this.metricVolume.dims = [1, 1, 1];
    this.metricVolume.version = 0;
    this.metricVolume.updatedAt = 0;
    this.metricVolume.source = null;
    this.metricVolume.chart = null;
    this.metricVolume.consistency = "unknown";
    this.metricVolume.consistencyNote = null;
    this.metricVolume.alphaRange = [1, 1];
    this.fluxField = null;



    if (this.curvature.fallback) {



      gl.deleteTexture(this.curvature.fallback);



      this.curvature.fallback = null;



    }



    this.curvature.hasData = false;



    this.curvature.front = 0;



    this.curvature.dims = [1, 1, 1];



    this.curvature.version = 0;



    this.curvature.updatedAt = 0;



    this.curvature.range = [-8, 8];



    this.radialTexAllocated = false;



    this.ringInstantTexAllocated = false;



    this.ringAverageTexAllocated = false;



    if (this.dummyVolumeTex) {



      gl.deleteTexture(this.dummyVolumeTex);



      this.dummyVolumeTex = null;



    }



    if (this.fallbackTex2D) {



      gl.deleteTexture(this.fallbackTex2D);



      this.fallbackTex2D = null;



    }



    if (this.skyboxTexture) {
      gl.deleteTexture(this.skyboxTexture);
      this.skyboxTexture = null;
    }
    this.skyboxTexturePath = null;
    this.skyboxTexturePending = false;

    if (this.overlay.ringVao) gl.deleteVertexArray(this.overlay.ringVao);



    if (this.overlay.ringVbo) gl.deleteBuffer(this.overlay.ringVbo);



    if (this.overlay.sliceVao) gl.deleteVertexArray(this.overlay.sliceVao);



    if (this.overlay.sliceVbo) gl.deleteBuffer(this.overlay.sliceVbo);



    this.overlay.ringVertexCount = 0;



    if (this.overlay.sliceEbo) gl.deleteBuffer(this.overlay.sliceEbo);



    if (this.overlay.wireframeVao) gl.deleteVertexArray(this.overlay.wireframeVao);



    if (this.overlay.wireframeVbo) gl.deleteBuffer(this.overlay.wireframeVbo);



    if (this.overlay.meshWireVao) gl.deleteVertexArray(this.overlay.meshWireVao);



    if (this.overlay.meshWireVbo) gl.deleteBuffer(this.overlay.meshWireVbo);



    if (this.overlay.meshWireColorVbo) gl.deleteBuffer(this.overlay.meshWireColorVbo);



    if (this.overlay.domainGridVao) gl.deleteVertexArray(this.overlay.domainGridVao);
    if (this.overlay.domainGridVbo) gl.deleteBuffer(this.overlay.domainGridVbo);
    this.overlay.domainGridCount = 0;
    if (this.overlay.spaceGridVao) gl.deleteVertexArray(this.overlay.spaceGridVao);



    if (this.overlay.spaceGridVbo) gl.deleteBuffer(this.overlay.spaceGridVbo);
    if (this.overlay.spaceGridColorVbo) gl.deleteBuffer(this.overlay.spaceGridColorVbo);
    if (this.overlay.spaceGridFalloffVbo) gl.deleteBuffer(this.overlay.spaceGridFalloffVbo);



    if (this.overlay.previewVao) gl.deleteVertexArray(this.overlay.previewVao);



    if (this.overlay.previewVbo) gl.deleteBuffer(this.overlay.previewVbo);



    if (this.overlay.previewUvVbo) gl.deleteBuffer(this.overlay.previewUvVbo);



    if (this.overlay.previewIbo) gl.deleteBuffer(this.overlay.previewIbo);



    if (this.overlay.previewTexture) gl.deleteTexture(this.overlay.previewTexture);



    if (this.overlay.fallbackProgram) gl.deleteProgram(this.overlay.fallbackProgram);



    if (this.surfaceVao) gl.deleteVertexArray(this.surfaceVao);



    if (this.surfaceVbo) gl.deleteBuffer(this.surfaceVbo);



    if (this.betaFallbackTex) gl.deleteTexture(this.betaFallbackTex);



    this.betaOverlayProgram = null;



    this.betaOverlayUniforms = null;



    this.betaFallbackTex = null;



    if (this.harnessWhiteProgram) gl.deleteProgram(this.harnessWhiteProgram);



    this.harnessWhiteProgram = null;



    this.debugTapBuffer = null;



    if (this.volumeVizBusId) {



      unsubscribe(this.volumeVizBusId);



      this.volumeVizBusId = null;



    }



    if (this.overlay3DBusId) {



      unsubscribe(this.overlay3DBusId);



      this.overlay3DBusId = null;



    }



    if (this.overlayPingBusId) {



      unsubscribe(this.overlayPingBusId);



      this.overlayPingBusId = null;



    }



    if (this.curvatureBusId) {



      unsubscribe(this.curvatureBusId);



      this.curvatureBusId = null;



    }

    if (this.t00BusId) {
      unsubscribe(this.t00BusId);
      this.t00BusId = null;
    }
    if (this.fluxBusId) {
      unsubscribe(this.fluxBusId);
      this.fluxBusId = null;
    }
    if (this.metricBusId) {
      unsubscribe(this.metricBusId);
      this.metricBusId = null;
    }
    if (this.observerSelectionBusId) {
      unsubscribe(this.observerSelectionBusId);
      this.observerSelectionBusId = null;
    }
    if (this.observerDirectionOverlayBusId) {
      unsubscribe(this.observerDirectionOverlayBusId);
      this.observerDirectionOverlayBusId = null;
    }



    if (this.phaseStableBusId) {



      unsubscribe(this.phaseStableBusId);



      this.phaseStableBusId = null;



    }



    if (this.phaseLegacyBusId) {



      unsubscribe(this.phaseLegacyBusId);



      this.phaseLegacyBusId = null;



    }



    if (this.intentBusUnsub) {



      this.intentBusUnsub();



      this.intentBusUnsub = null;



    }



    if (this.resources.rayColorTex) {



      gl.deleteTexture(this.resources.rayColorTex);



      this.resources.rayColorTex = null;



    }



    if (this.resources.rayAuxTex) {



      gl.deleteTexture(this.resources.rayAuxTex);



      this.resources.rayAuxTex = null;



    }



    if (this.resources.rayIdTex) {



      gl.deleteTexture(this.resources.rayIdTex);



      this.resources.rayIdTex = null;



    }



    if (this.resources.rayFbo) {



      gl.deleteFramebuffer(this.resources.rayFbo);



      this.resources.rayFbo = null;



    }



    this.rayTargetSize = [0, 0];
    this.rayTargetFailure = {
      width: 0,
      height: 0,
      nextRetryAtMs: 0,
      failCount: 0,
    };
    this.rayIdEnabled = false;


    this.rayAuxInternalFormat = 0;



    this.rayAuxType = 0;



    this.resources = {



      rayProgram: null,



      ringOverlayProgram: null,



      overlayProgram: null,
      previewMeshProgram: null,
      postProgram: null,


      quadVao: null,



      quadVbo: null,



      ringAvgTex: null,



      rayFbo: null,


      rayColorTex: null,



      rayAuxTex: null,
      rayIdTex: null,

    };



    this.hasVolume = false;



    this.skipVolumeUpdate = false;



  }



}







export const createHull3DRenderer = (



  gl: WebGL2RenderingContext,



  canvas: HTMLCanvasElement,



  options: Hull3DRendererOptions = {}



) => {



  return new Hull3DRenderer(gl, canvas, options);



};







type RingParams = {



  gaussianSigma: number;



  sectorCenter01: number;



  totalSectors: number;



  liveSectors: number;



  sectorFloor: number;



  syncMode: number;



  splitEnabled: boolean;



  splitFrac: number;



};







type RingLUTStats = {



  mean: number;



  rawMean: number;



  min: number;



  max: number;



  minFloor: number;



  samples: number;



  mode: "gaussian" | "wedge";



  sigma01: number;



  center01: number;



  floor: number;



  splitEnabled: boolean;



  splitFrac: number;



  liveSectors: number;



  totalSectors: number;



  warnings: string[];



};







type RingLUTResult = {



  weights: Float32Array;



  stats: RingLUTStats;



};







const buildRingLUT = (params: RingParams): RingLUTResult => {



  const {



    gaussianSigma,



    sectorCenter01,



    totalSectors,



    liveSectors,



    sectorFloor,



    syncMode,



    splitEnabled,



    splitFrac,



  } = params;







  const mode: "gaussian" | "wedge" = syncMode === 1 ? "gaussian" : "wedge";



  const samples = RING_SIZE;



  const weights = new Float32Array(samples);



  const warnings: string[] = [];



  const wrap01 = (x: number) => x - Math.floor(x);



  const d01 = (a: number, b: number) => {



    let d = Math.abs(wrap01(a) - wrap01(b));



    return d > 0.5 ? 1 - d : d;



  };







  const total = Math.max(1, Math.round(totalSectors));



  const live = Math.max(0, Math.round(liveSectors));



  let floor = clamp(sectorFloor, 0, 0.5);



  if (!Number.isFinite(floor)) floor = 0;



  if (floor !== sectorFloor) {



    warnings.push(`[Hull3DRenderer] sectorFloor clamped from ${sectorFloor} to ${floor}`);



  }



  const minFloor = Math.max(0.01, floor);



  const center01 = wrap01(sectorCenter01);







  let uniformFallback = false;



  let sigma01 = Math.max(gaussianSigma, 1e-4);



  if (!Number.isFinite(sigma01)) sigma01 = 0;



  if (mode === "gaussian" && sigma01 <= 1e-4) {



    warnings.push("[Hull3DRenderer] gaussianSigma too small; forcing flat gate");



    uniformFallback = true;



  }



  if (mode === "wedge" && live <= 0) {



    warnings.push("[Hull3DRenderer] liveSectors=0; forcing flat gate");



    uniformFallback = true;



  }



  if (total <= 0) {



    warnings.push("[Hull3DRenderer] totalSectors<=0; forcing flat gate");



    uniformFallback = true;



  }







  if (uniformFallback) {



    for (let i = 0; i < samples; i++) weights[i] = 1;



  } else if (mode === "gaussian") {



    const splitMix = clamp(splitFrac, 0, 1);



    const altCenter = wrap01(center01 + 0.5);



    for (let i = 0; i < samples; i++) {



      const a = i / samples;



      const g1 = Math.exp(-0.5 * Math.pow(d01(a, center01) / sigma01, 2));



      let g = g1;



      if (splitEnabled) {



        const g2 = Math.exp(-0.5 * Math.pow(d01(a, altCenter) / sigma01, 2));



        g = (1 - splitMix) * g1 + splitMix * g2;



      }



      const cur = floor + (1 - floor) * g;



      weights[i] = Math.max(0, cur);



    }



  } else {



    const liveFrac = clamp(total > 0 ? live / total : 0, 0, 1);



    if (liveFrac <= 0) {



      warnings.push("[Hull3DRenderer] liveFrac<=0 after clamp; forcing flat gate");



      for (let i = 0; i < samples; i++) weights[i] = 1;



    } else {



      const half = 0.5 * liveFrac;



      const left = wrap01(center01 - half);



      const right = wrap01(center01 + half);



      for (let i = 0; i < samples; i++) {



        const a = i / samples;



        const inRange = left < right



          ? (a >= left && a <= right)



          : (a >= left || a <= right);



        weights[i] = inRange ? 1 : floor;



      }



    }



  }







  let sumRaw = 0;



  for (let i = 0; i < samples; i++) sumRaw += weights[i];



  const rawMean = sumRaw / samples || 1;



  const invMean = rawMean > 0 ? 1 / rawMean : 1;







  let minVal = Number.POSITIVE_INFINITY;



  let maxVal = 0;



  let sumNorm = 0;



  for (let i = 0; i < samples; i++) {



    const wn = weights[i] * invMean;



    const clamped = Math.max(minFloor, wn);



    weights[i] = clamped;



    minVal = Math.min(minVal, clamped);



    maxVal = Math.max(maxVal, clamped);



    sumNorm += clamped;



  }



  let normMean = sumNorm / samples || 1;



  const targetSum = samples;



  if (Math.abs(sumNorm - targetSum) > 1e-5) {



    if (sumNorm > targetSum) {



      let adjustable = 0;



      for (let i = 0; i < samples; i++) {



        if (weights[i] > minFloor) adjustable += weights[i] - minFloor;



      }



      if (adjustable > 1e-8) {



        const scale = (sumNorm - targetSum) / adjustable;



        sumNorm = 0;



        minVal = Number.POSITIVE_INFINITY;



        maxVal = 0;



        for (let i = 0; i < samples; i++) {



          if (weights[i] > minFloor) {



            const reduction = (weights[i] - minFloor) * scale;



            weights[i] = Math.max(minFloor, weights[i] - reduction);



          }



          minVal = Math.min(minVal, weights[i]);



          maxVal = Math.max(maxVal, weights[i]);



          sumNorm += weights[i];



        }



        normMean = sumNorm / samples || 1;



      }



    } else {



      const deficitPer = (targetSum - sumNorm) / samples;



      sumNorm = 0;



      minVal = Number.POSITIVE_INFINITY;



      maxVal = 0;



      for (let i = 0; i < samples; i++) {



        const adjusted = weights[i] + deficitPer;



        weights[i] = Math.max(minFloor, adjusted);



        minVal = Math.min(minVal, weights[i]);



        maxVal = Math.max(maxVal, weights[i]);



        sumNorm += weights[i];



      }



      normMean = sumNorm / samples || 1;



    }



  }







  const stats: RingLUTStats = {



    mean: normMean,



    rawMean,



    min: Number.isFinite(minVal) ? minVal : 1,



    max: Number.isFinite(maxVal) ? maxVal : 1,



    minFloor,



    samples,



    mode,



    sigma01,



    center01,



    floor,



    splitEnabled,



    splitFrac: clamp(splitFrac, 0, 1),



    liveSectors: live,



    totalSectors: total,



    warnings,



  };







  return { weights, stats };



};

