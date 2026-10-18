import React, {useCallback, useEffect, useMemo, useReducer, useRef, useState} from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BufferGeometry, Mesh } from "three";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useHullPreviewPayload } from "@/hooks/use-hull-preview-payload";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { useHullLatticeVolume } from "@/hooks/useHullLatticeVolume";
import { useLightCrossingLoop } from "@/hooks/useLightCrossingLoop";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { useFlightDirectorStore } from "@/store/useFlightDirectorStore";
import {
  useHull3DSharedStore,
  defaultOverlayPrefsForProfile,
  type HullOverlayPrefProfile,
  type HullOverlayPrefs,
  type HullSpacetimeGridPrefs,
  type HullSpacetimeGridMode,
  type HullSpacetimeGridColorBy,
  type HullSpacetimeGridStrengthMode,
  type HullVoxelSliceAxis,
  type HullVolumeSource,
} from "@/store/useHull3DSharedStore";
import { shallow } from "zustand/shallow";
import { VolumeModeToggle, type VolumeViz } from "@/components/VolumeModeToggle";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { Hull3DRenderer, Hull3DRendererMode, Hull3DSkyboxMode, Hull3DQualityPreset, Hull3DQualityOverrides, Hull3DRendererState, Hull3DVolumeViz, Hull3DOverlayState, HullGeometryMode, HullGateSource, Hull3DVolumeDomain, type HullPreviewMeshPayload } from "./Hull3DRenderer.ts";
import { Hull3DWebGPUPathTracer } from "@/lib/webgpu/hull-pathtracer";
import { CurvatureVoxProvider, DEFAULT_FLUX_CHANNEL, DEFAULT_T00_CHANNEL } from "./CurvatureVoxProvider";
import { smoothSectorWeights } from "@/lib/sector-weights";
import { TheoryBadge } from "./common/TheoryBadge";
import { normalizeCurvaturePalette, type CurvaturePalette } from "@/lib/curvature-directive";
import { YorkAuditBox } from "@/components/HullViewer/YorkAuditBox";
import MetricFrameLens, {
  type SolveOrderSnapshot,
  type SolveOrderStatus,
} from "@/components/HullViewer/MetricFrameLens";
import { resolveHullDimsEffective } from "@/lib/resolve-hull-dims";
import {
  colorizeFieldProbe,
  colorizeWireframeOverlay,
  resolveHullSurfaceMesh,
  resolveWireframeOverlay,
  VIEWER_WIREFRAME_BUDGETS,
  type WireframeContactPatch,
  type WireframeOverlayResult,
} from "@/lib/resolve-wireframe-overlay";
import { clearLatticeSurfaceCaches } from "@/lib/lattice-surface";
import { useFieldProbe } from "@/hooks/use-field-probe";
import { applyHullBasisToPositions, resolveHullBasis, HULL_BASIS_IDENTITY, type HullBasisResolved } from "@shared/hull-basis";
import { formatTriplet, remapXYZToFrontRightUp } from "@/lib/hull-hud";
import { frameCardCameraToObb } from "@shared/card-camera";
import type { CardCameraPreset } from "@shared/schema";
import { clearLatticeSdfCache, encodeHullDistanceBandWeightsR8 } from "@/lib/lattice-sdf";
import { hashLatticeSdfDeterminism, hashLatticeVolumeDeterminism } from "@/lib/lattice-health";
import { loadWfbrickFile } from "@/lib/wfbrick";
import { GEO_VIS_THETA_PRESET } from "@/lib/warpfield-presets";
import {
  DEFAULT_METRIC_VOLUME_CHANNEL,
  DEFAULT_GEODESIC_DIAGNOSTICS_CHANNEL,
  type HullMetricVolumeContract,
  type HullGeodesicDiagnostics,
} from "@/lib/metric-volume-contract";
import { requestHullMisFrame } from "@/lib/hull-mis-render-service";
import {
  isAlcubierreDebugLogEnabled,
  pushAlcubierreDebugEvent,
  subscribeAlcubierreDebugLogConfig,
} from "@/lib/alcubierre-debug-log";
import { HULL_SCIENTIFIC_ATLAS_PANES } from "@shared/hull-render-contract";
import type {
  HullScientificAtlasPaneId,
  HullScientificAtlasSidecarV1,
  HullRenderCertificateV1,
  HullScientificRenderView,
  HullMisRenderRequestV1,
  HullMisRenderResponseV1,
  HullRendererBackendMode,
} from "@shared/hull-render-contract";
/**
 * TheoryRefs:
 *  - vanden-broeck-1999: UI exposes gamma_VdB with provenance
 */


interface AlcubierrePanelProps {
  className?: string;
  onCanvasReady?: (
    canvas: HTMLCanvasElement | null,
    overlayCanvas?: HTMLCanvasElement | null,
    overlayDom?: HTMLDivElement | null
  ) => void;
  overlayHudEnabled?: boolean;
  onPlanarVizModeChange?: (mode: number) => void;
  vizIntent?: {
    rise: number;
    planar: number;
    yaw?: number;
  };
}

type TiltDirective = {
  enabled: boolean;
  dir: [number, number];
  magnitude: number;
  alpha?: number;
  source?: string;
  gain?: number; // [tilt-gain]
  gainMode?: "manual" | "curvature"; // [tilt-gain]
};

function FlightDirectorStatusRow() {
  const { enabled, mode, coupling } = useFlightDirectorStore(
    (state) => ({
      enabled: state.enabled,
      mode: state.mode,
      coupling: state.coupling,
    }),
    shallow
  );
  const yawRate = useFlightDirectorStore((state) => state.yawRate_dps);
  const setEnabled = useFlightDirectorStore((state) => state.setEnabled);

  return (
    <div className="flex items-center gap-2 text-[0.65rem] text-slate-200">
      <label className="inline-flex items-center gap-1">
        <input
          type="checkbox"
          className="accent-emerald-500"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Flight Director
      </label>
      <span className="text-[0.65rem] text-slate-400">
        {mode} | {coupling} | {Math.round(yawRate)} deg/s
      </span>
    </div>
  );
}

// === helpers: math & smoothing =================================================
const clamp = (x: number, a = -Infinity, b = Infinity) => Math.max(a, Math.min(b, x));

type SpacetimeGridPreset = {
  id: string;
  label: string;
  hint: string;
  prefs: HullSpacetimeGridPrefs;
};

const SPACETIME_GRID_PRESETS: SpacetimeGridPreset[] = [
  {
    id: "warp-bubble",
    label: "Warp bubble",
    hint: "Surface shell with thicker falloff to show the warp wall.",
    prefs: {
      enabled: true,
      mode: "surface",
      spacing_m: 0.28,
      warpStrength: 1.4,
      falloff_m: 1.1,
      colorBy: "thetaSign",
      useSdf: true,
      warpStrengthMode: "autoThetaPk",
    },
  },
  {
    id: "warp-volume",
    label: "Warp volume",
    hint: "3D cage around the hull to show expansion/contraction in space.",
    prefs: {
      enabled: true,
      mode: "volume",
      spacing_m: 0.85,
      warpStrength: 1.1,
      falloff_m: 1.2,
      colorBy: "thetaSign",
      useSdf: true,
      warpStrengthMode: "autoThetaPk",
    },
  },
  {
    id: "slice-debug",
    label: "Slice debug",
    hint: "Planar slice for debugging field strength and polarity.",
    prefs: {
      enabled: true,
      mode: "slice",
      spacing_m: 0.18,
      warpStrength: 1.6,
      falloff_m: 0.7,
      colorBy: "thetaSign",
      useSdf: true,
      warpStrengthMode: "autoThetaPk",
    },
  },
];
const SPACETIME_GRID_DEFAULT_PRESET_ID = "warp-volume";
const READABILITY_DPR_MAX = 1.25;
const DEFAULT_HULL_MODE: Hull3DRendererMode = "blend";
const DEFAULT_HULL_BLEND = 0.5;

type Vec3 = [number, number, number];
type Mat4 = ArrayLike<number>;

type LatticeFieldSampler = {
  worldToLattice: Mat4 | null;
  minLattice: Vec3;
  sizeLattice: Vec3;
  dims: Vec3;
  gate3D: Float32Array;
  dfdr3D: Float32Array;
  drive3D: Float32Array;
  maxGate: number;
};

type LatticeSdfSampler = {
  worldToLattice: Mat4 | null;
  minLattice: Vec3;
  sizeLattice: Vec3;
  dims: Vec3;
  weightsR8: Uint8Array;
};

const mulMat4PointCM = (m: Mat4, p: Vec3): Vec3 => {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const x2 = m[0] * x + m[4] * y + m[8] * z + m[12];
  const y2 = m[1] * x + m[5] * y + m[9] * z + m[13];
  const z2 = m[2] * x + m[6] * y + m[10] * z + m[14];
  const w2 = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (Math.abs(w2) > 1e-6 && Math.abs(w2 - 1) > 1e-6) {
    const inv = 1 / w2;
    return [x2 * inv, y2 * inv, z2 * inv];
  }
  return [x2, y2, z2];
};

const worldToVoxelCoord = (
  pWorld: Vec3,
  worldToLattice: Mat4 | null,
  minLattice: Vec3,
  sizeLattice: Vec3,
  dims: Vec3,
): Vec3 => {
  const pLattice = worldToLattice ? mulMat4PointCM(worldToLattice, pWorld) : pWorld;
  const sx = Math.max(1e-9, sizeLattice[0]);
  const sy = Math.max(1e-9, sizeLattice[1]);
  const sz = Math.max(1e-9, sizeLattice[2]);
  const ux = (pLattice[0] - minLattice[0]) / sx;
  const uy = (pLattice[1] - minLattice[1]) / sy;
  const uz = (pLattice[2] - minLattice[2]) / sz;
  return [
    ux * dims[0] - 0.5,
    uy * dims[1] - 0.5,
    uz * dims[2] - 0.5,
  ];
};

const idx3D = (x: number, y: number, z: number, dims: Vec3) =>
  x + dims[0] * (y + dims[1] * z);

const trilerpScalar = (
  values: ArrayLike<number>,
  dims: Vec3,
  v: Vec3,
  outside = 0,
  scale = 1,
): number => {
  const x0 = Math.floor(v[0]);
  const y0 = Math.floor(v[1]);
  const z0 = Math.floor(v[2]);
  const tx = v[0] - x0;
  const ty = v[1] - y0;
  const tz = v[2] - z0;

  if (
    x0 < 0 ||
    y0 < 0 ||
    z0 < 0 ||
    x0 + 1 >= dims[0] ||
    y0 + 1 >= dims[1] ||
    z0 + 1 >= dims[2]
  ) {
    return outside;
  }

  const i000 = (values[idx3D(x0, y0, z0, dims)] ?? 0) * scale;
  const i100 = (values[idx3D(x0 + 1, y0, z0, dims)] ?? 0) * scale;
  const i010 = (values[idx3D(x0, y0 + 1, z0, dims)] ?? 0) * scale;
  const i110 = (values[idx3D(x0 + 1, y0 + 1, z0, dims)] ?? 0) * scale;
  const i001 = (values[idx3D(x0, y0, z0 + 1, dims)] ?? 0) * scale;
  const i101 = (values[idx3D(x0 + 1, y0, z0 + 1, dims)] ?? 0) * scale;
  const i011 = (values[idx3D(x0, y0 + 1, z0 + 1, dims)] ?? 0) * scale;
  const i111 = (values[idx3D(x0 + 1, y0 + 1, z0 + 1, dims)] ?? 0) * scale;

  const ix00 = i000 * (1 - tx) + i100 * tx;
  const ix10 = i010 * (1 - tx) + i110 * tx;
  const ix01 = i001 * (1 - tx) + i101 * tx;
  const ix11 = i011 * (1 - tx) + i111 * tx;
  const ixy0 = ix00 * (1 - ty) + ix10 * ty;
  const ixy1 = ix01 * (1 - ty) + ix11 * ty;
  return ixy0 * (1 - tz) + ixy1 * tz;
};

const sampleGate01AtWorld = (pWorld: Vec3, ctx: LatticeFieldSampler): number => {
  const v = worldToVoxelCoord(pWorld, ctx.worldToLattice, ctx.minLattice, ctx.sizeLattice, ctx.dims);
  const raw = trilerpScalar(ctx.gate3D, ctx.dims, v, 0);
  const denom = Math.max(1e-6, ctx.maxGate);
  const normalized = raw / denom;
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
};
const sech2  = (x: number) => {
  const c = Math.cosh(x);
  return 1 / (c * c);
};
/**
 * Alcubierre top-hat radial derivative df/dr_s (closed form, ÃÆ’ and R dimensionless)
 */
// JS helper matching the GLSL d_topHat_dr behavior
function dTopHatDr(r: number, sigma: number, R: number) {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  return sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R))) / den;
}

function topHatShape(r: number, sigma: number, R: number) {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  const tPlus = Math.tanh(sigma * (r + R));
  const tMinus = Math.tanh(sigma * (r - R));
  return (tPlus - tMinus) / den;
}

type NullGeodesicBundle = {
  plus: Float32Array;
  minus: Float32Array;
  worldtube: Float32Array;
};

function buildNullGeodesicBundle1p1(opts: {
  alpha: number;
  beta: number;
  sigma: number;
  R: number;
  axes: [number, number, number];
  domainScale: number;
  natarioLike: boolean;
  flatMode: boolean;
}): NullGeodesicBundle {
  const alpha = Number.isFinite(opts.alpha) && opts.alpha > 1e-6 ? opts.alpha : 1;
  const beta = Number.isFinite(opts.beta) ? opts.beta : 0;
  const sigma = Number.isFinite(opts.sigma) && opts.sigma > 0 ? opts.sigma : 6;
  const R = Number.isFinite(opts.R) && opts.R > 0 ? opts.R : 1;
  const axisX = Math.max(Math.abs(opts.axes?.[0] ?? 1), 1e-4);
  const domainScale = Number.isFinite(opts.domainScale) && opts.domainScale > 0 ? opts.domainScale : 1;
  const span = Math.max(1.15, domainScale * axisX * 1.25);
  const travelSpan = span * 2;
  const seeds = 13;
  const steps = 96;
  const dtCoord = travelSpan / Math.max(steps - 1, 1);
  const xSeedMin = -0.84 * span;
  const xSeedMax = 0.84 * span;
  const flatMode = opts.flatMode;
  const natarioLike = opts.natarioLike;

  const mapXToNdc = (x: number) => {
    const mapped = x / Math.max(span, 1e-6);
    return clamp(mapped, -1.25, 1.25);
  };
  const mapStepToNdcY = (step: number) => -1 + (2 * step) / Math.max(steps - 1, 1);

  const buildFamily = (familySign: 1 | -1) => {
    const segs: number[] = [];
    for (let s = 0; s < seeds; s += 1) {
      const frac = seeds <= 1 ? 0.5 : s / (seeds - 1);
      let x = xSeedMin + (xSeedMax - xSeedMin) * frac;
      let y = mapStepToNdcY(0);
      for (let i = 1; i < steps; i += 1) {
        const r = Math.abs(x);
        const f = topHatShape(r, sigma, R);
        const shiftDir = natarioLike ? (Math.abs(x) > 1e-8 ? Math.sign(x) : familySign) : 1;
        const betaLocal = flatMode ? 0 : beta * f * shiftDir;
        const c = -betaLocal + familySign * alpha;
        const xNext = x + c * dtCoord;
        const yNext = mapStepToNdcY(i);
        const xNdc = mapXToNdc(x);
        const xNdcNext = mapXToNdc(xNext);
        if (
          Number.isFinite(xNdc) &&
          Number.isFinite(xNdcNext) &&
          Number.isFinite(y) &&
          Number.isFinite(yNext)
        ) {
          segs.push(xNdc, y, xNdcNext, yNext);
        }
        x = xNext;
        y = yNext;
        if (Math.abs(x) > span * 1.4) break;
      }
    }
    return new Float32Array(segs);
  };

  const tubeHalf = clamp((R * axisX) / Math.max(span, 1e-6), 0.06, 0.88);
  const worldtube = new Float32Array([
    -tubeHalf, -1, -tubeHalf, 1,
    0, -1, 0, 1,
    tubeHalf, -1, tubeHalf, 1,
  ]);

  return {
    plus: buildFamily(1),
    minus: buildFamily(-1),
    worldtube,
  };
}

type MetricAxisRadiusSample = {
  radiusM: number | null;
  symmetryErrorM: number | null;
  peakAbs: number | null;
  sampleCount: number;
};

type IntegralSignalAttachmentSnapshot = {
  source: "mis-service-remote" | "mis-service-local-fallback";
  updatedAtMs: number;
  width: number;
  height: number;
  depthM: Float32Array;
  maskU8: Uint8Array;
  coveragePct: number | null;
  depthMinM: number | null;
  depthMaxM: number | null;
  depthMeanM: number | null;
  sampleCount: number;
  note: string | null;
};

type IntegralSignalComparison = {
  status: SolveOrderStatus;
  source: string | null;
  updatedAtMs: number | null;
  ageMs: number | null;
  coveragePct: number | null;
  depthMinM: number | null;
  depthMaxM: number | null;
  depthMeanM: number | null;
  fitScalePxPerM: number | null;
  fitZOffsetM: number | null;
  fitSign: number | null;
  rmsZResidualM: number | null;
  maxAbsZResidualM: number | null;
  hausdorffM: number | null;
  rmsPassMaxM: number | null;
  rmsWarnMaxM: number | null;
  maxAbsPassMaxM: number | null;
  maxAbsWarnMaxM: number | null;
  hausdorffPassMaxM: number | null;
  hausdorffWarnMaxM: number | null;
  rmsStatus: SolveOrderStatus;
  maxAbsStatus: SolveOrderStatus;
  hausdorffStatus: SolveOrderStatus;
  statusReason: string | null;
  sampleCount: number | null;
  note: string | null;
};

type MisServiceErrorInfo = {
  status: number | null;
  code: string | null;
  detail: string | null;
  raw: string;
};

const SCIENTIFIC_RENDER_ERROR_CODES = new Set([
  "mis_proxy_unconfigured",
  "mis_proxy_failed",
  "remote_mis_non_research_grade_frame",
  "remote_mis_missing_or_invalid_render_certificate",
  "remote_mis_render_certificate_schema_mismatch",
  "remote_mis_render_certificate_hash_mismatch",
  "remote_mis_render_certificate_missing_channel_hashes",
  "remote_mis_render_certificate_metric_ref_hash_mismatch",
  "remote_mis_render_certificate_missing_support_mask_hash",
  "remote_mis_render_certificate_view_mismatch",
  "remote_mis_render_certificate_chart_mismatch",
  "remote_mis_render_certificate_hash_missing",
  "scientific_atlas_pane_missing",
  "scientific_atlas_certificate_mismatch",
  "scientific_atlas_channel_contract_missing",
  "scientific_atlas_convention_mismatch",
  "scientific_atlas_optical_causal_desync",
  "scientific_atlas_timestamp_mismatch",
  "scientific_york_theta_missing",
  "scientific_york_chart_unsupported",
  "scientific_york_certificate_mismatch",
  "scientific_york_convention_mismatch",
]);
const SCIENTIFIC_ATLAS_PANE_ORDER = [
  ...HULL_SCIENTIFIC_ATLAS_PANES,
] as const satisfies readonly HullScientificAtlasPaneId[];

function findScientificAtlasPaneFailure(
  atlas: HullScientificAtlasSidecarV1 | null | undefined,
): HullScientificAtlasPaneId | null {
  if (!atlas) return null;
  for (const paneId of SCIENTIFIC_ATLAS_PANE_ORDER) {
    if (!atlas.pane_ids.includes(paneId)) return paneId;
    const status = atlas.pane_status[paneId];
    if (status !== "ok") return paneId;
  }
  return null;
}

function parseMisServiceErrorInfo(rawMessage: string): MisServiceErrorInfo {
  const raw = String(rawMessage ?? "").trim();
  let status: number | null = null;
  let code: string | null = null;
  let detail: string | null = null;
  const match = raw.match(/^(\d{3})\s*:\s*([\s\S]+)$/);
  if (match) {
    status = Number(match[1]);
    const body = match[2].trim();
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const rec = parsed as Record<string, unknown>;
        code = typeof rec.error === "string" ? rec.error : null;
        detail = typeof rec.message === "string" ? rec.message : null;
      }
    } catch {
      detail = body;
    }
  }
  if (!detail) detail = raw;
  if (!code) {
    const yorkCodeMatch = `${detail} ${raw}`.match(
      /\b(scientific_york_(?:theta_missing|chart_unsupported|certificate_mismatch|convention_mismatch))\b/i,
    );
    if (yorkCodeMatch) {
      code = yorkCodeMatch[1]?.toLowerCase() ?? null;
    }
  }
  return { status, code, detail, raw };
}

function isStrictScientificRenderFailure(info: MisServiceErrorInfo): boolean {
  if (info.code && SCIENTIFIC_RENDER_ERROR_CODES.has(info.code)) return true;
  const body = `${info.detail ?? ""} ${info.raw}`.toLowerCase();
  return (
    body.includes("remote_mis_non_scientific_response") ||
    body.includes("remote_mis_non_3p1_geodesic_mode") ||
    body.includes("remote_mis_non_research_grade_frame") ||
    body.includes("remote_mis_render_certificate") ||
    body.includes("scientific_atlas_") ||
    body.includes("scientific_york_") ||
    body.includes("missing_or_invalid_render_certificate") ||
    body.includes("scientific frame requested")
  );
}

function formatStrictScientificRenderFailure(info: MisServiceErrorInfo): string {
  let detail = info.detail?.trim() || "Scientific renderer not reachable.";
  if (
    `${info.detail ?? ""} ${info.raw}`
      .toLowerCase()
      .includes("remote_mis_non_research_grade_frame")
  ) {
    detail =
      "Remote renderer responded with scaffold/teaching frame metadata; research-grade frame required.";
  }
  if (
    `${info.detail ?? ""} ${info.raw}`
      .toLowerCase()
      .includes("render_certificate")
  ) {
    detail =
      "Remote renderer failed scientific certificate validation (schema/hash/channel or metric-ref mismatch).";
  }
  if (`${info.detail ?? ""} ${info.raw}`.toLowerCase().includes("scientific_atlas_")) {
    detail =
      "Remote renderer failed full-atlas synchronization validation (pane/channel/convention/timestamp mismatch).";
  }
  if (`${info.detail ?? ""} ${info.raw}`.toLowerCase().includes("scientific_york_")) {
    detail =
      "Remote renderer failed York strict validation (theta channel/chart/convention/snapshot identity mismatch).";
  }
  return [
    "Masked hull-configured scientific renderer unavailable.",
    detail,
    "Start strict OptiX/Unity render service and re-open panel.",
  ].join(" ");
}

const METRIC_DISPLACEMENT_CHANNEL_PRIORITY = [
  "theta",
  "K_trace",
  "H_constraint",
] as const;

function sampleMetricAxisRadius(opts: {
  data: Float32Array;
  dims: [number, number, number];
  spacingM: [number, number, number];
  axis: 0 | 1 | 2;
}): MetricAxisRadiusSample {
  const { data, dims, spacingM, axis } = opts;
  const nx = Math.max(1, Math.floor(Number(dims[0]) || 1));
  const ny = Math.max(1, Math.floor(Number(dims[1]) || 1));
  const nz = Math.max(1, Math.floor(Number(dims[2]) || 1));
  const total = nx * ny * nz;
  if (!(data instanceof Float32Array) || data.length < total) {
    return { radiusM: null, symmetryErrorM: null, peakAbs: null, sampleCount: 0 };
  }

  const cx = Math.floor((nx - 1) / 2);
  const cy = Math.floor((ny - 1) / 2);
  const cz = Math.floor((nz - 1) / 2);
  const spacingAxis = Math.max(1e-6, Number(spacingM[axis]) || 1);
  const indexAt = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  let posPeak = -Infinity;
  let posStep = -1;
  let posCount = 0;
  let negPeak = -Infinity;
  let negStep = -1;
  let negCount = 0;

  const maxPos =
    axis === 0 ? nx - 1 - cx :
    axis === 1 ? ny - 1 - cy :
    nz - 1 - cz;
  const maxNeg =
    axis === 0 ? cx :
    axis === 1 ? cy :
    cz;

  for (let step = 1; step <= maxPos; step += 1) {
    const i = axis === 0 ? cx + step : cx;
    const j = axis === 1 ? cy + step : cy;
    const k = axis === 2 ? cz + step : cz;
    const idx = indexAt(i, j, k);
    const value = Math.abs(Number(data[idx]));
    if (!Number.isFinite(value)) continue;
    posCount += 1;
    if (value > posPeak) {
      posPeak = value;
      posStep = step;
    }
  }

  for (let step = 1; step <= maxNeg; step += 1) {
    const i = axis === 0 ? cx - step : cx;
    const j = axis === 1 ? cy - step : cy;
    const k = axis === 2 ? cz - step : cz;
    const idx = indexAt(i, j, k);
    const value = Math.abs(Number(data[idx]));
    if (!Number.isFinite(value)) continue;
    negCount += 1;
    if (value > negPeak) {
      negPeak = value;
      negStep = step;
    }
  }

  const radiusPos = posStep >= 0 ? posStep * spacingAxis : null;
  const radiusNeg = negStep >= 0 ? negStep * spacingAxis : null;
  const radiusM =
    radiusPos != null && radiusNeg != null
      ? (radiusPos + radiusNeg) * 0.5
      : radiusPos ?? radiusNeg ?? null;
  const symmetryErrorM =
    radiusPos != null && radiusNeg != null
      ? Math.abs(radiusPos - radiusNeg)
      : null;
  const peakAbs =
    Number.isFinite(posPeak) || Number.isFinite(negPeak)
      ? Math.max(Number.isFinite(posPeak) ? posPeak : 0, Number.isFinite(negPeak) ? negPeak : 0)
      : null;

  return {
    radiusM,
    symmetryErrorM,
    peakAbs,
    sampleCount: posCount + negCount,
  };
}

function decodeBase64Bytes(raw: string): Uint8Array | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const decode = typeof atob === "function" ? atob : null;
    if (!decode) return null;
    const binary = decode(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

function extractIntegralSignalAttachmentSnapshot(
  frame: HullMisRenderResponseV1,
): IntegralSignalAttachmentSnapshot | null {
  const attachments = Array.isArray(frame?.attachments) ? frame.attachments : [];
  const depthAttachment = attachments.find(
    (entry: any) => entry?.kind === "depth-linear-m-f32le" && entry?.encoding === "base64",
  );
  const maskAttachment = attachments.find(
    (entry: any) => entry?.kind === "shell-mask-u8" && entry?.encoding === "base64",
  );
  if (!depthAttachment || !maskAttachment) return null;
  const width = Math.max(1, Math.floor(Number(depthAttachment.width) || 0));
  const height = Math.max(1, Math.floor(Number(depthAttachment.height) || 0));
  if (
    width !== Math.max(1, Math.floor(Number(maskAttachment.width) || 0)) ||
    height !== Math.max(1, Math.floor(Number(maskAttachment.height) || 0))
  ) {
    return null;
  }
  const total = width * height;
  const depthBytes = decodeBase64Bytes(String(depthAttachment.dataBase64 ?? ""));
  const maskBytes = decodeBase64Bytes(String(maskAttachment.dataBase64 ?? ""));
  if (!depthBytes || !maskBytes) return null;
  if (depthBytes.length < total * 4 || maskBytes.length < total) return null;

  const depthCopy = new Uint8Array(total * 4);
  depthCopy.set(depthBytes.subarray(0, total * 4));
  const maskCopy = new Uint8Array(total);
  maskCopy.set(maskBytes.subarray(0, total));
  const depthM = new Float32Array(depthCopy.buffer);
  const maskU8 = maskCopy;

  let maskCount = 0;
  let finiteDepthCount = 0;
  let depthMin = Number.POSITIVE_INFINITY;
  let depthMax = Number.NEGATIVE_INFINITY;
  let depthSum = 0;
  for (let i = 0; i < total; i += 1) {
    if (maskU8[i] > 0) maskCount += 1;
    const value = Number(depthM[i]);
    if (!Number.isFinite(value)) continue;
    finiteDepthCount += 1;
    depthMin = Math.min(depthMin, value);
    depthMax = Math.max(depthMax, value);
    depthSum += value;
  }

  return {
    source: frame?.backend === "proxy" ? "mis-service-remote" : "mis-service-local-fallback",
    updatedAtMs: Date.now(),
    width,
    height,
    depthM,
    maskU8,
    coveragePct: total > 0 ? (maskCount / total) * 100 : null,
    depthMinM: finiteDepthCount > 0 ? depthMin : null,
    depthMaxM: finiteDepthCount > 0 ? depthMax : null,
    depthMeanM: finiteDepthCount > 0 ? depthSum / finiteDepthCount : null,
    sampleCount: maskCount,
    note: "integral signal from depth-linear-m + shell-mask attachments",
  };
}

function approximateHausdorff(
  a: Array<[number, number, number]>,
  b: Array<[number, number, number]>,
): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const sample = (points: Array<[number, number, number]>, maxN: number) => {
    if (points.length <= maxN) return points;
    const stride = points.length / maxN;
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < maxN; i += 1) {
      out.push(points[Math.floor(i * stride)]);
    }
    return out;
  };
  const aS = sample(a, 220);
  const bS = sample(b, 220);
  const directed = (src: Array<[number, number, number]>, dst: Array<[number, number, number]>) => {
    let maxMin = 0;
    for (const p of src) {
      let minDist = Number.POSITIVE_INFINITY;
      for (const q of dst) {
        const dx = p[0] - q[0];
        const dy = p[1] - q[1];
        const dz = p[2] - q[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > maxMin) maxMin = minDist;
    }
    return maxMin;
  };
  return Math.max(directed(aS, bS), directed(bS, aS));
}

function compareIntegralSignalToMetric(opts: {
  signal: IntegralSignalAttachmentSnapshot | null;
  metricRadiusM: [number | null, number | null, number | null];
}): IntegralSignalComparison {
  const emptyThresholds = {
    rmsPassMaxM: null,
    rmsWarnMaxM: null,
    maxAbsPassMaxM: null,
    maxAbsWarnMaxM: null,
    hausdorffPassMaxM: null,
    hausdorffWarnMaxM: null,
    rmsStatus: "unknown" as SolveOrderStatus,
    maxAbsStatus: "unknown" as SolveOrderStatus,
    hausdorffStatus: "unknown" as SolveOrderStatus,
    statusReason: null,
  };
  const signal = opts.signal;
  const rx = Number(opts.metricRadiusM[0]);
  const ry = Number(opts.metricRadiusM[1]);
  const rz = Number(opts.metricRadiusM[2]);
  if (!signal) {
    return {
      status: "unknown",
      source: null,
      updatedAtMs: null,
      ageMs: null,
      coveragePct: null,
      depthMinM: null,
      depthMaxM: null,
      depthMeanM: null,
      fitScalePxPerM: null,
      fitZOffsetM: null,
      fitSign: null,
      rmsZResidualM: null,
      maxAbsZResidualM: null,
      hausdorffM: null,
      ...emptyThresholds,
      sampleCount: null,
      note: "integral signal unavailable",
    };
  }
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz) || rx <= 1e-9 || ry <= 1e-9 || rz <= 1e-9) {
    return {
      status: "unknown",
      source: signal.source,
      updatedAtMs: signal.updatedAtMs,
      ageMs: Math.max(0, Date.now() - signal.updatedAtMs),
      coveragePct: signal.coveragePct,
      depthMinM: signal.depthMinM,
      depthMaxM: signal.depthMaxM,
      depthMeanM: signal.depthMeanM,
      fitScalePxPerM: null,
      fitZOffsetM: null,
      fitSign: null,
      rmsZResidualM: null,
      maxAbsZResidualM: null,
      hausdorffM: null,
      ...emptyThresholds,
      sampleCount: signal.sampleCount,
      note: "metric radii unavailable for integral comparison",
    };
  }
  const width = signal.width;
  const height = signal.height;
  const cx = Math.max(1, (width - 1) * 0.5);
  const cy = Math.max(1, (height - 1) * 0.5);
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 2200)));
  const observed: Array<{ xn: number; yn: number; depth: number }> = [];
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = y * width + x;
      if ((signal.maskU8[idx] ?? 0) <= 0) continue;
      const depth = Number(signal.depthM[idx]);
      if (!Number.isFinite(depth)) continue;
      const xn = (x - cx) / cx;
      const yn = (y - cy) / cy;
      observed.push({ xn, yn, depth });
      maxAbsX = Math.max(maxAbsX, Math.abs(xn));
      maxAbsY = Math.max(maxAbsY, Math.abs(yn));
    }
  }
  if (observed.length < 80 || maxAbsX < 1e-4 || maxAbsY < 1e-4) {
    return {
      status: "unknown",
      source: signal.source,
      updatedAtMs: signal.updatedAtMs,
      ageMs: Math.max(0, Date.now() - signal.updatedAtMs),
      coveragePct: signal.coveragePct,
      depthMinM: signal.depthMinM,
      depthMaxM: signal.depthMaxM,
      depthMeanM: signal.depthMeanM,
      fitScalePxPerM: null,
      fitZOffsetM: null,
      fitSign: null,
      rmsZResidualM: null,
      maxAbsZResidualM: null,
      hausdorffM: null,
      ...emptyThresholds,
      sampleCount: observed.length,
      note: "integral signal has insufficient mask samples",
    };
  }

  const k0 = Math.min(rx / maxAbsX, ry / maxAbsY);
  const kMin = Math.max(1e-4, 0.45 * k0);
  const kMax = Math.max(kMin * 1.05, 1.55 * k0);
  let best:
    | {
        rms: number;
        maxAbs: number;
        k: number;
        z0: number;
        sign: number;
        valid: number;
      }
    | null = null;
  for (let i = 0; i <= 44; i += 1) {
    const t = i / 44;
    const k = kMin + (kMax - kMin) * t;
    for (const sign of [-1, 1] as const) {
      let sumZ0 = 0;
      let valid = 0;
      const wCache: number[] = [];
      const dCache: number[] = [];
      for (const p of observed) {
        const q = 1 - Math.pow((k * p.xn) / rx, 2) - Math.pow((k * p.yn) / ry, 2);
        if (q < 0) continue;
        const w = Math.sqrt(Math.max(0, q));
        wCache.push(w);
        dCache.push(p.depth);
        sumZ0 += p.depth - sign * rz * w;
        valid += 1;
      }
      if (valid < 60) continue;
      const z0 = sumZ0 / valid;
      let sq = 0;
      let maxAbs = 0;
      for (let j = 0; j < valid; j += 1) {
        const residual = dCache[j] - (z0 + sign * rz * wCache[j]);
        sq += residual * residual;
        maxAbs = Math.max(maxAbs, Math.abs(residual));
      }
      const rms = Math.sqrt(sq / valid);
      if (!best || rms < best.rms) {
        best = { rms, maxAbs, k, z0, sign, valid };
      }
    }
  }
  if (!best) {
    return {
      status: "fail",
      source: signal.source,
      updatedAtMs: signal.updatedAtMs,
      ageMs: Math.max(0, Date.now() - signal.updatedAtMs),
      coveragePct: signal.coveragePct,
      depthMinM: signal.depthMinM,
      depthMaxM: signal.depthMaxM,
      depthMeanM: signal.depthMeanM,
      fitScalePxPerM: null,
      fitZOffsetM: null,
      fitSign: null,
      rmsZResidualM: null,
      maxAbsZResidualM: null,
      hausdorffM: null,
      ...emptyThresholds,
      sampleCount: observed.length,
      note: "integral fit failed (no valid shell overlap)",
    };
  }

  const obsPoints: Array<[number, number, number]> = [];
  for (const p of observed) {
    const q = 1 - Math.pow((best.k * p.xn) / rx, 2) - Math.pow((best.k * p.yn) / ry, 2);
    if (q < 0) continue;
    obsPoints.push([best.k * p.xn, best.k * p.yn, p.depth - best.z0]);
  }
  const expectedPoints: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const xn = (x - cx) / cx;
      const yn = (y - cy) / cy;
      const q = 1 - Math.pow((best.k * xn) / rx, 2) - Math.pow((best.k * yn) / ry, 2);
      if (q < 0) continue;
      expectedPoints.push([best.k * xn, best.k * yn, best.sign * rz * Math.sqrt(Math.max(0, q))]);
    }
  }
  const hausdorff = approximateHausdorff(obsPoints, expectedPoints);
  const pxPerM = ((cx + cy) * 0.5) / Math.max(best.k, 1e-9);
  const passRms = Math.max(0.08 * rz, 0.12);
  const warnRms = Math.max(0.24 * rz, 0.45);
  const passMaxAbs = passRms * 2.2;
  const warnMaxAbs = warnRms * 2.1;
  const passHausdorff = Math.max(0.3 * rz, 0.5);
  const warnHausdorff = Math.max(0.8 * rz, 1.25);
  const classifyThresholdStatus = (
    value: number | null | undefined,
    passMax: number,
    warnMax: number,
  ): SolveOrderStatus => {
    if (!Number.isFinite(value ?? NaN)) return "unknown";
    if ((value as number) <= passMax) return "pass";
    if ((value as number) <= warnMax) return "warn";
    return "fail";
  };
  const rmsStatus = classifyThresholdStatus(best.rms, passRms, warnRms);
  const maxAbsStatus = classifyThresholdStatus(best.maxAbs, passMaxAbs, warnMaxAbs);
  const hausdorffStatus = classifyThresholdStatus(hausdorff, passHausdorff, warnHausdorff);
  const status: SolveOrderStatus =
    best.rms <= passRms &&
    best.maxAbs <= passMaxAbs &&
    (hausdorff == null || hausdorff <= passHausdorff)
      ? "pass"
      : best.rms <= warnRms &&
          best.maxAbs <= warnMaxAbs &&
          (hausdorff == null || hausdorff <= warnHausdorff)
        ? "warn"
        : "fail";
  const statusReason = [
    `rms=${best.rms.toFixed(4)}m pass<=${passRms.toFixed(4)} warn<=${warnRms.toFixed(4)} ${rmsStatus.toUpperCase()}`,
    `maxAbs=${best.maxAbs.toFixed(4)}m pass<=${passMaxAbs.toFixed(4)} warn<=${warnMaxAbs.toFixed(4)} ${maxAbsStatus.toUpperCase()}`,
    Number.isFinite(hausdorff as number)
      ? `hausdorff=${(hausdorff as number).toFixed(4)}m pass<=${passHausdorff.toFixed(4)} warn<=${warnHausdorff.toFixed(4)} ${hausdorffStatus.toUpperCase()}`
      : `hausdorff=-- pass<=${passHausdorff.toFixed(4)} warn<=${warnHausdorff.toFixed(4)} UNKNOWN`,
  ].join(" | ");

  return {
    status,
    source: signal.source,
    updatedAtMs: signal.updatedAtMs,
    ageMs: Math.max(0, Date.now() - signal.updatedAtMs),
    coveragePct: signal.coveragePct,
    depthMinM: signal.depthMinM,
    depthMaxM: signal.depthMaxM,
    depthMeanM: signal.depthMeanM,
    fitScalePxPerM: Number.isFinite(pxPerM) ? pxPerM : null,
    fitZOffsetM: best.z0,
    fitSign: best.sign,
    rmsZResidualM: best.rms,
    maxAbsZResidualM: best.maxAbs,
    hausdorffM: hausdorff,
    rmsPassMaxM: passRms,
    rmsWarnMaxM: warnRms,
    maxAbsPassMaxM: passMaxAbs,
    maxAbsWarnMaxM: warnMaxAbs,
    hausdorffPassMaxM: passHausdorff,
    hausdorffWarnMaxM: warnHausdorff,
    rmsStatus,
    maxAbsStatus,
    hausdorffStatus,
    statusReason,
    sampleCount: best.valid,
    note: `${signal.note ?? "integral signal"} | fit over depth+mask only`,
  };
}

const latticeBasisSignature = (basis?: HullBasisResolved | null) => {
  if (!basis) return "basis:none";
  const swap = `${basis.swap.x}${basis.swap.y}${basis.swap.z}`;
  const flip = `${basis.flip.x ? 1 : 0}${basis.flip.y ? 1 : 0}${basis.flip.z ? 1 : 0}`;
  const scale = basis.scale.map((v) => Math.round((v ?? 0) * 1e6) / 1e6).join(",");
  const forward = basis.forward.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const up = basis.up.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const right = basis.right.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  return `basis:${swap}|${flip}|${scale}|${forward}|${up}|${right}`;
};

type WfBrickStatus = {
  name: string;
  dims: [number, number, number];
  hasFlux: boolean;
  loadedAt: number;
};

// Robust tail peak estimator
function tailPeakAbs(arr: Float32Array | number[], tail = 0.01) {
  if (!arr || arr.length === 0) return 0;
  const v = Array.from(arr, (x) => Math.abs(x)).filter((x) => x > 0);
  if (v.length === 0) return 0;
  v.sort((a, b) => a - b);
  const n = v.length;
  const start = Math.max(0, Math.floor((1 - Math.max(1e-4, tail)) * (n - 1)));
  const slice = v.slice(start);
  const m = Math.floor(slice.length / 2);
  return slice.length ? slice[m] : v[n - 1];
}

// Quantile estimator using downsampled sort (robust against outliers, cheap)
function quantileSample(arr: Float32Array, q: number, targetSamples = 4096): number {
  const n = arr.length;
  if (!n) return 0;
  const step = Math.max(1, Math.floor(n / targetSamples));
  const sample: number[] = [];
  for (let i = 0; i < n; i += step) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  if (sample.length === 0) return 0;
  const qi = Math.max(0, Math.min(sample.length - 1, Math.floor(q * (sample.length - 1))));
  return sample[qi];
}

const GREEK_THETA = "\u03B8";
const GREEK_RHO = "\u03C1";
const firstFinite = (...values: Array<unknown>) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const fmtTimeSmartMs = (ms?: number | null) => {
  if (!Number.isFinite(ms as number) || (ms as number) <= 0) return "--";
  const value = ms as number;
  if (value >= 1) return `${value.toFixed(2)} ms`;
  if (value >= 1e-3) return `${(value * 1e3).toFixed(2)} us`;
  return `${(value * 1e6).toFixed(2)} ns`;
};

const volumeModeFromHull = (mode: Hull3DVolumeViz): VolumeViz => {
  switch (mode) {
    case "theta_gr":
      return 0;
    case "rho_gr":
      return 1;
    case "shear_gr":
      return 3;
    case "vorticity_gr":
      return 4;
    default:
      return 2;
  }
};

const hullVizFromVolumeMode = (mode: VolumeViz): Hull3DVolumeViz => {
  switch (mode) {
    case 0:
      return "theta_gr";
    case 1:
      return "rho_gr";
    case 3:
      return "shear_gr";
    case 4:
      return "vorticity_gr";
    default:
      return "theta_drive";
  }
};

// Resolve beta from live pipeline or reasonable mode defaults
function resolveBeta(live: any): number {
  const cands = [Number(live?.shipBeta), Number(live?.beta_avg), Number(live?.vShip), Number(live?.beta)];
  for (const v of cands) {
    if (Number.isFinite(v) && Math.abs(v as number) > 1e-6) {
      const b = Math.max(0, Math.min(0.99, v as number));
      return b;
    }
  }
  const m = String(live?.currentMode ?? "").toLowerCase();
  const betaTrans = Number.isFinite(Number(live?.beta_trans)) ? Math.max(0, Math.min(1, Number(live?.beta_trans))) : 1;
  let base: 0.0 | 0.02 | 0.1 | 0.6 | 0.95 | 0.3;
  switch (m) {
    case "standby":   base = 0.0;  break;
    case "taxi":      base = 0.0;  break;
    case "nearzero":  base = 0.02; break;
    case "hover":     base = 0.1;  break;
    case "cruise":    base = 0.6;  break;
    case "emergency": base = 0.95; break;
    default:           base = 0.3;  break;
  }
  const beta = base * betaTrans;
  return Math.max(0, Math.min(0.99, beta));
}

// Mode-aware local RF burst fraction (fraction of dwell ON within a sector)
function resolveBurstFrac(live: any): number {
  // Allow server override if provided
  const override = Number((live as any)?.localBurstFrac ?? (live as any)?.burstFrac);
  if (Number.isFinite(override) && override > 0 && override <= 1) return override;
  const m = String(live?.currentMode ?? "").toLowerCase();
  // Conservative defaults per operational mode
  switch (m) {
    case "standby":
    case "taxi":
    case "nearzero": return 0.01; // minimal RF window
    case "hover":               return 0.02;
    case "cruise":              return 0.05;
    case "emergency":           return 0.10; // aggressive window for response
    default:                      return 0.03;
  }
}

const wrap01 = (value: number) => ((value % 1) + 1) % 1;

const smallestPhaseDelta = (a: number, b: number) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let delta = ((a - b) % 1 + 1) % 1;
  if (delta > 0.5) delta -= 1;
  return delta;
};

const BUS_PHASE_DIFF_THRESHOLD = 0.05;
const MAX_PHASE_HISTORY = 240;
const PHASE_HISTORY_SAMPLE_MS = 120;

// Mode-aware sector width in sectors (ÃÆ’_sector). Server override if provided.
function resolveSigmaSectors(live: any): number {
  // Accept broad override keys from server/view
  const overrides = [
    (live as any)?.sigmaSectors,
    (live as any)?.sectorSigmaSectors,
    (live as any)?.sigma_sector,
    (live as any)?.view?.sigmaSectors,
  ];
  for (const cand of overrides) {
    const v = Number(cand);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const m = String(live?.currentMode ?? "").toLowerCase();
  // Conservative defaults per operational mode (in SECTORS)
  switch (m) {
    case "standby":   return 0.20;
    case "taxi":      return 0.28;
    case "nearzero":  return 0.32;
    case "hover":     return 0.45;
    case "cruise":    return 0.70;
    case "emergency": return 1.10;
    default:           return 0.35;
  }
}

type VizMode = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=shift-shell, 1=paper-rho, 2=drive, 3=full-atlas/worldtube, 4=york-slice, 5=york-shell-map, 6=york-topology-normalized
type ShaderMode = "main" | "safe";

type ScientificSnapshotIdentity = {
  metric_ref_hash: string | null;
  chart: string | null;
  observer: string;
  theta_definition: string;
  kij_sign_convention: string;
  unit_system: string;
  timestamp_ms: number;
};

const resolveScientificModeLabel = (planarVizMode: VizMode): string =>
  planarVizMode === 1
    ? "Energy"
  : planarVizMode === 0
      ? "Shift Shell"
  : planarVizMode === 4
      ? "York Slice"
    : planarVizMode === 5
        ? "York Shell Map"
      : planarVizMode === 6
        ? "York Topology"
        : "Scientific";

const resolveScientificRenderView = (
  planarVizMode: VizMode,
): HullScientificRenderView =>
  planarVizMode === 1
    ? "paper-rho"
  : planarVizMode === 0
      ? "shift-shell-3p1"
  : planarVizMode === 4
        ? "york-time-3p1"
      : planarVizMode === 5
        ? "york-shell-map-3p1"
      : planarVizMode === 6
        ? "york-topology-normalized-3p1"
        : "full-atlas";

const buildScientificSnapshotIdentity = (
  certificate: HullRenderCertificateV1 | null | undefined,
): ScientificSnapshotIdentity | null => {
  if (!certificate) return null;
  if (
    typeof certificate.observer !== "string" ||
    typeof certificate.theta_definition !== "string" ||
    typeof certificate.kij_sign_convention !== "string" ||
    typeof certificate.unit_system !== "string" ||
    !Number.isFinite(Number(certificate.timestamp_ms))
  ) {
    return null;
  }
  return {
    metric_ref_hash: certificate.metric_ref_hash ?? null,
    chart: certificate.chart ?? null,
    observer: certificate.observer,
    theta_definition: certificate.theta_definition,
    kij_sign_convention: certificate.kij_sign_convention,
    unit_system: certificate.unit_system,
    timestamp_ms: Number(certificate.timestamp_ms),
  };
};

const scientificIdentityMatches = (
  left: ScientificSnapshotIdentity | null,
  right: ScientificSnapshotIdentity | null,
): boolean => {
  if (!left || !right) return false;
  return (
    left.metric_ref_hash === right.metric_ref_hash &&
    left.chart === right.chart &&
    left.observer === right.observer &&
    left.theta_definition === right.theta_definition &&
    left.kij_sign_convention === right.kij_sign_convention &&
    left.unit_system === right.unit_system &&
    left.timestamp_ms === right.timestamp_ms
  );
};

function fnum(x: any, d=0) { const n = Number(x); return Number.isFinite(n) ? n : d; }

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;      // unit grid on x-z plane in [-1,1]^2
uniform vec3  u_axes;                   // hull axes scale (a,b,c) -> x,y,z
uniform float u_sigma;                  // wall thickness sigma
uniform float u_R;                      // bubble radius R
uniform float u_beta;                   // ship beta along +x
uniform float u_thetaSign;
uniform int   u_viz;                    // 0 theta_GR, 1 rho_GR, 2 theta_Drive, 3 shear_GR, 4 vorticity_GR
uniform float u_ampChain;               // gamma_geo^3 * q * gamma_VdB
uniform float u_gate;                   // sqrt(d_FR) * (sector visibility)
uniform float u_gate_view;
uniform int   u_gateSource;
uniform int   u_latticeDynamicWeights;
uniform sampler2D u_latticeSlice;
uniform int   u_hasLatticeSlice;
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

out vec3 v_color;

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
  float domainScale = u_R * 1.3;
  vec2 grid = a_pos;
  vec3 pView = vec3(grid.x * u_axes.x * domainScale, 0.0, grid.y * u_axes.z * domainScale);
  vec3 pMetric = vec3(
    pView.x / max(u_axes.x, 1e-6),
    0.0,
    pView.z / max(u_axes.z, 1e-6)
  );
  vec2 latticeUV = grid * 0.5 + 0.5;
  vec4 latticeSample = vec4(0.0);
  if (u_hasLatticeSlice != 0) {
    latticeSample = texture(u_latticeSlice, latticeUV);
  }
  float rs = max(length(pMetric), 1e-6);

  float dfdr = d_topHat_dr(rs, u_sigma, u_R);
  vec3 dir = pMetric / rs;
  float dfx = dfdr * dir.x;
  float dfy = dfdr * dir.y;
  float dfz = dfdr * dir.z;

  float theta_gr_base = u_beta * dfx;
  float theta_gr = theta_gr_base;

  float Kxx = -u_beta * dfx;
  float Kxy = -0.5 * u_beta * dfy;
  float Kxz = -0.5 * u_beta * dfz;
  float K2 = Kxx*Kxx;
  float KijKij = Kxx*Kxx + 2.0*Kxy*Kxy + 2.0*Kxz*Kxz;
  const float INV16PI = 0.019894367886486918;
  float rho_gr = (K2 - KijKij) * INV16PI;

  float sigma2 = max(KijKij - (K2 / 3.0), 0.0);
  float vorticity = u_beta * sqrt(dfy*dfy + dfz*dfz);

  float gateWF = 1.0;
  if (u_viz == 2) {
    float ang = atan(pView.z, pView.x);
    float a01 = (ang < 0.0 ? ang + TWO_PI : ang) / TWO_PI;
    // Apply viewer-controlled phase offset to rotate lobe between contraction (blue) and expansion (red)
    a01 = fract(a01 + u_phase01);
    int total = max(1, u_totalSectors);
    int live  = max(1, min(u_liveSectors, total));
    // Effective active fraction acknowledges both scheduler concurrency and FR duty
    float fActive = max(max(1.0/float(total), float(live) / float(total)), max(0.0, u_duty));
    float floorFrac = clamp(u_sectorFloor, 0.0, 0.99);
    float peakFrac  = 1.0 - floorFrac;
    float wNorm = 1.0;
    if (u_syncMode == 1) {
      // Gaussian lobe centered at u_sectorCenter with sigma in 0..1 azimuth units (wrapped)
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
      // Average Gaussian over the ring (approx) to keep total power consistent
      float avgG = min(1.0, sigma01 * 2.5066283);
      float gNorm = min(g / max(avgG, 1e-4), 12.0);
      wNorm = floorFrac + peakFrac * gNorm;
    } else {
      // Contiguous sector block fallback (stable on all drivers)
      int sIdx = int(floor(a01 * float(total)));
      float on = (sIdx < live) ? 1.0 : 0.0;
      float frac = max(1.0/float(total), float(live) / float(total));
      float norm = (frac > 1e-9) ? min(on / frac, 12.0) : on;
      wNorm = floorFrac + peakFrac * norm;
    }
    float schedule = wNorm;
    float blanket = 1.0;
    if (u_gateSource != 0 && u_hasLatticeSlice != 0) {
      blanket = clamp(latticeSample.a, 0.0, 1.0);
    }
    if (u_gateSource == 1) {
      wNorm = blanket;
    } else if (u_gateSource == 2) {
      wNorm = schedule * blanket;
    }
    // Sector visibility boost (reverted): remove normalization by fActive to restore prior gain behavior
    gateWF = pow(sqrt(max(0.0, wNorm)), max(0.5, u_lumpExp));
  }
  float driveAnalytic = theta_gr_base * u_ampChain * gateWF;
  float theta_drive = driveAnalytic * u_gate_view;
  if (u_hasLatticeSlice != 0) {
    theta_gr = latticeSample.r;
    float driveWeighted = latticeSample.g;
    if (u_latticeDynamicWeights != 0) {
      driveWeighted *= gateWF;
    }
    float sdfBlend = clamp(latticeSample.b, 0.0, 1.0);
    if (sdfBlend > 0.0) {
      sdfBlend *= sdfBlend;
      driveWeighted = mix(driveWeighted, driveAnalytic, sdfBlend);
    }
    theta_drive = driveWeighted * u_gate_view;
  }
  theta_gr *= u_thetaSign;
  theta_drive *= u_thetaSign;

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
  vec4 pos = vec4(pView.x, y, pView.z, 1.0);
  gl_Position = u_mvp * pos;

  float c = s * u_kColor;
  if (u_viz == 1){
    v_color = purpleMap(c);
  } else {
    v_color = diverge(clamp(c, -1.0, 1.0));
  }
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main(){
  outColor = vec4(v_color, 1.0);
}
`;

const SAFE_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
uniform mat4 u_mvp;
out vec3 v_color;
void main(){
  vec3 pos = vec3(a_pos.x, 0.0, a_pos.y);
  gl_Position = u_mvp * vec4(pos, 1.0);
  float shade = 0.35 + 0.35 * (a_pos.x * 0.5 + 0.5);
  float accent = 0.35 + 0.35 * (a_pos.y * 0.5 + 0.5);
  v_color = vec3(shade, accent, 0.7 + 0.2 * a_pos.y);
}
`;

const SAFE_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main(){
  outColor = vec4(v_color, 1.0);
}
`;

const GEO_BUNDLE_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const GEO_BUNDLE_FRAG = `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_alpha;
out vec4 outColor;
void main() {
  outColor = vec4(u_color, u_alpha);
}
`;

type MetricTooltipBadgeProps = {
  label: string;
  value: string;
  description: React.ReactNode;
  className?: string;
};

function MetricTooltipBadge({ label, value, description, className }: MetricTooltipBadgeProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setManualOpen((prev) => {
      const next = !prev;
      if (!next) {
        setAutoOpen(false);
      }
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    setAutoOpen(next);
    if (!next) {
      setManualOpen(false);
    }
  };

  const open = manualOpen || autoOpen;

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange} disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "px-2 py-1 rounded text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
            "flex items-center gap-1",
            className
          )}
          aria-label={`${label} details`}
        >
          <span className="font-medium text-slate-300">{label}:</span>
          <span className="font-mono text-[0.75rem] font-semibold leading-none">{value}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs text-left bg-slate-950/95 text-slate-100 border border-slate-800 shadow-lg"
      >
        <p className="text-sm font-semibold text-slate-50">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-200">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Lightweight Hull3D debug toggles (Off / Metric ring / Grayscale volume)
function Hull3DDebugToggles({
  surfaceOn,
  setSurfaceOn,
  gateSource,
  setGateSource,
  gateViewEnabled,
  setGateViewEnabled,
  forceFlatGate,
  setForceFlatGate,
  onGatePreset,
}: {
  surfaceOn: boolean;
  setSurfaceOn: React.Dispatch<React.SetStateAction<boolean>>;
  gateSource: HullGateSource;
  setGateSource: React.Dispatch<React.SetStateAction<HullGateSource>>;
  gateViewEnabled: boolean;
  setGateViewEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  forceFlatGate: boolean;
  setForceFlatGate: React.Dispatch<React.SetStateAction<boolean>>;
  onGatePreset?: () => void;
}) {
  const [ringOn, setRingOn] = useState<boolean>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    if (w.__hullShowRingOverlay === undefined) return true;
    return !!w.__hullShowRingOverlay;
  });
  const [grayOn, setGrayOn] = useState<boolean>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    return !!w.__hullDebugGrayscale || w.__hullDebugMode === 3;
  });
  const [ringMode, setRingMode] = useState<number>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    return Number.isInteger(w.__hullRingOverlayMode) ? (w.__hullRingOverlayMode | 0) : 0;
  });
  const [ringBlend, setRingBlend] = useState<number>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    const v = +w.__hullRingOverlayBlend;
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.25;
  });
  const [ringAlpha, setRingAlpha] = useState<number>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    const v = +w.__hullRingOverlayAlpha;
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
  });
  const [ringWidth, setRingWidth] = useState<number>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    const v = +w.__hullRingOverlayWidth;
    return Number.isFinite(v) ? Math.max(0.002, Math.min(0.12, v)) : 0.03;
  });
  const [ringField, setRingField] = useState<number>(() => {
    const w: any = (typeof window !== "undefined") ? window : {};
    return Number.isInteger(w.__hullRingOverlayField) ? (w.__hullRingOverlayField | 0) : -1;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setSurfaceOn(true);
      setRingOn(true);
    };
    window.addEventListener("helix:drive-card-preset" as any, handler as any);
    return () => window.removeEventListener("helix:drive-card-preset" as any, handler as any);
  }, [setSurfaceOn, setRingOn]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__hullShowRingOverlay = ringOn;
    }
  }, [ringOn]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__hullDebugGrayscale = grayOn;
      // Maintain backward compatibility with existing u_debugMode==3
      (window as any).__hullDebugMode = grayOn ? 3 : 0;
    }
  }, [grayOn]);
  useEffect(() => {
    if (typeof window !== "undefined") (window as any).__hullRingOverlayMode = ringMode;
  }, [ringMode]);
  useEffect(() => {
    if (typeof window !== "undefined") (window as any).__hullRingOverlayBlend = ringBlend;
  }, [ringBlend]);
  useEffect(() => {
    if (typeof window !== "undefined") (window as any).__hullRingOverlayAlpha = ringAlpha;
  }, [ringAlpha]);
  useEffect(() => {
    if (typeof window !== "undefined") (window as any).__hullRingOverlayWidth = ringWidth;
  }, [ringWidth]);
  useEffect(() => {
    if (typeof window !== "undefined") (window as any).__hullRingOverlayField = ringField;
  }, [ringField]);
  return (
    <CurvatureVoxProvider quality="low" refetchMs={1000}>
      <div className="flex items-center gap-1 text-[0.65rem] text-slate-200">
      <span className="uppercase tracking-wide text-slate-400">Debug</span>
      <button
        type="button"
        className={cn("rounded px-2 py-1", ringOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200")}
        onClick={() => setRingOn((v) => !v)}
        title="Toggle thin metric ring overlay around rËœR"
      >Ring Overlay</button>
      <button
        type="button"
        className={cn("rounded px-2 py-1", surfaceOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200")}
        onClick={() => setSurfaceOn(!surfaceOn)}
        title="Toggle the hull surface sheet overlay in the 3D viewer"
      >Surface</button>
      <button
        type="button"
        className={cn("rounded px-2 py-1", grayOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200")}
        onClick={() => setGrayOn((v) => !v)}
        title="Toggle grayscale rendering of |?_drive| to highlight the 3D ellipse"
      >Grayscale</button>
      <button
        type="button"
        className={cn("rounded px-2 py-1", (!ringOn && !grayOn && !surfaceOn) ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200")}
        onClick={() => { setRingOn(false); setGrayOn(false); setSurfaceOn(false); }}
        title="Clear all debug overlays"
      >Clear</button>
      {ringOn && (
        <div className="ml-2 flex items-center gap-2 rounded bg-slate-800/50 px-2 py-1">
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Ring</span>
            <select
              className="rounded bg-slate-900 px-1 py-0.5"
              value={ringMode}
              onChange={(e) => setRingMode(parseInt(e.target.value, 10))}
              title="Locator = thin shell; Weighted = instant/EMA weights; Field = color by selected field"
            >
              <option value={0}>Locator</option>
              <option value={1}>Weighted</option>
              <option value={2}>Field coded</option>
            </select>
          </label>
          {ringMode === 1 && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">Blend</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ringBlend}
                onChange={(e) => setRingBlend(parseFloat(e.target.value))}
                className="w-24 accent-emerald-500"
              />
              <span className="font-mono text-slate-300">{Math.round(ringBlend * 100)}%</span>
            </label>
          )}
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Alpha</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ringAlpha}
              onChange={(e) => setRingAlpha(parseFloat(e.target.value))}
              className="w-20 accent-emerald-500"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-400">Width</span>
            <input
              type="range"
              min={0.005}
              max={0.1}
              step={0.005}
              value={ringWidth}
              onChange={(e) => setRingWidth(parseFloat(e.target.value))}
              className="w-20 accent-emerald-500"
            />
          </label>
          {ringMode === 2 && (
            <label className="flex items-center gap-1">
              <span className="text-slate-400">Field</span>
              <select
                className="rounded bg-slate-900 px-1 py-0.5"
                value={ringField}
                onChange={(e) => setRingField(parseInt(e.target.value, 10))}
                title="Auto follows the active volume field selection"
              >
                <option value={-1}>Auto</option>
                <option value={0}>Theta GR</option>
                <option value={1}>Rho GR</option>
                <option value={2}>Theta Drive</option>
              </select>
            </label>
          )}
        </div>
      )}
      <div className="ml-2 flex flex-wrap items-center gap-2 rounded bg-slate-800/50 px-2 py-1">
        <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
          <span className="text-slate-400">Gate source</span>
          <select
            className="rounded bg-slate-900 px-1 py-0.5"
            value={gateSource}
            onChange={(e) => setGateSource(e.target.value as HullGateSource)}
            title="Choose schedule-only, blanket-only, or their product"
          >
            <option value="schedule">Schedule</option>
            <option value="blanket">Blanket</option>
            <option value="combined">Schedule Ã— Blanket</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
          <span className="text-slate-400">Gate view</span>
          <input
            type="checkbox"
            checked={gateViewEnabled}
            onChange={(e) => setGateViewEnabled(e.target.checked)}
            className="accent-emerald-500"
            title="Keep gate visualization active even when duty is tiny"
          />
        </label>
        <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
          <span className="text-slate-400">Flat gate</span>
          <input
            type="checkbox"
            checked={forceFlatGate}
            onChange={(e) => setForceFlatGate(e.target.checked)}
            className="accent-amber-500"
            title="Force a uniform gate for A/B against scheduler/blanket"
          />
        </label>
        <button
          type="button"
          className="rounded bg-slate-700 px-2 py-1 text-[0.65rem] text-slate-100 hover:bg-slate-600"
          onClick={() => {
            setSurfaceOn(true);
            setRingOn(true);
            onGatePreset?.();
          }}
          title="Set ?_drive viz, enable gate view, and blend scheduleÃ—blanket"
        >
          Drive preset
        </button>
      </div>
    </div>
  </CurvatureVoxProvider>
  );
}

function makeGrid(res: number) {
  // Degenerate triangle strips per row in [-1,1]^2
  const verts: number[] = [];
  for (let j=0; j<res-1; j++){
    for (let i=0; i<res; i++){
      const x = -1 + 2*(i/(res-1));
      const z0 = -1 + 2*(j/(res-1));
      const z1 = -1 + 2*((j+1)/(res-1));
      verts.push(x, z0,  x, z1);
    }
  }
  return new Float32Array(verts);
}

type StrictHullMisRenderRequestV1 = HullMisRenderRequestV1 & {
  scienceLane: NonNullable<HullMisRenderRequestV1["scienceLane"]> & {
    requireHullSupportChannels?: boolean;
  };
};

export default function AlcubierrePanel({
  className,
  onCanvasReady,
  overlayHudEnabled = false,
  onPlanarVizModeChange,
  vizIntent,
}: AlcubierrePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext|null>(null);
  const hullRendererRef = useRef<Hull3DRenderer | null>(null);
  const hullWebGpuRef = useRef<Hull3DWebGPUPathTracer | null>(null);
  const hullStateRef = useRef<Hull3DRendererState | null>(null);
  const hullConfigRef = useRef<{ mode: Hull3DRendererMode; blend: number }>({
    mode: DEFAULT_HULL_MODE,
    blend: DEFAULT_HULL_BLEND,
  });
  // Hull 3D health + diagnostics UI state
  const [hullHealth, setHullHealth] = useState<null | { pass: number; fail: number; results: Record<string, { pass: boolean; luma: number; alpha: number }> }>(null);
  const [hullDiagMsg, setHullDiagMsg] = useState<string | null>(null);
  const [scientificAtlasState, setScientificAtlasState] =
    useState<HullScientificAtlasSidecarV1 | null>(null);
  const [scientificCertificateState, setScientificCertificateState] =
    useState<HullRenderCertificateV1 | null>(null);
  const scientificSnapshotIdentityRef = useRef<ScientificSnapshotIdentity | null>(null);
  const [geodesicDiagnostics, setGeodesicDiagnostics] = useState<HullGeodesicDiagnostics | null>(null);
  const hullQualityOverridesRef = useRef<Hull3DQualityOverrides>({});
  const hullRafRef = useRef<number>(0);
  const progRef = useRef<WebGLProgram|null>(null);
  const vboRef  = useRef<WebGLBuffer|null>(null);
  const vcountRef = useRef<number>(0); // DEBUG: track vertex count
  const latticeSliceRef = useRef<{
    data: Float32Array;
    width: number;
    height: number;
    version: number;
    source?: string | null;
  } | null>(null);
  const latticeSliceVersionRef = useRef(0);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayDomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onCanvasReady) return;
    onCanvasReady(canvasRef.current ?? null, overlayCanvasRef.current ?? null, overlayDomRef.current ?? null);
    return () => {
      onCanvasReady(null, null, null);
    };
  }, [onCanvasReady]);
  const lastDriveLogRef = useRef(0);
  const lastDisplacementLogRef = useRef(0);
  const lastSolvePipelineSummaryLogRef = useRef(0);
  const lastIntegralSignalDecodeRef = useRef(0);
  const integralSignalRef = useRef<IntegralSignalAttachmentSnapshot | null>(null);
  const [integralSignalVersion, bumpIntegralSignalVersion] = useReducer((n: number) => n + 1, 0);
  const [metricVolumeVersion, bumpMetricVolumeVersion] = useReducer((n: number) => n + 1, 0);
  const alcubierreDebugEnabledRef = useRef<boolean>(isAlcubierreDebugLogEnabled());

  const [planarVizMode, setPlanarVizMode] = useState<VizMode>(3); // 0 frame, 1 energy, 2 drive, 3 world tube
  useEffect(() => {
    onPlanarVizModeChange?.(planarVizMode);
  }, [planarVizMode, onPlanarVizModeChange]);
  const [shaderMode, setShaderMode] = useState<ShaderMode>("main");
  const [glError, setGlError] = useState<string | null>(null);
  // Track if the user has manually selected a planarVizMode so we don't override later
  const [userVizLocked, setUserVizLocked] = useState(false);
  const [syncScheduler, setSyncScheduler] = useState(true);
  const [vizIntentEnabled, setVizIntentEnabled] = useState(true);
  const [vizRise, setVizRise] = useState(0);
  const [vizPlanar, setVizPlanar] = useState(0);
const externalVizRise = vizIntent?.rise;
const externalVizPlanar = vizIntent?.planar;

  useEffect(() => {
    if (typeof externalVizRise === "number") {
      setVizRise((prev) =>
        Math.abs(prev - externalVizRise) > 1e-3 ? externalVizRise : prev
      );
    }
    if (typeof externalVizPlanar === "number") {
      setVizPlanar((prev) =>
        Math.abs(prev - externalVizPlanar) > 1e-3 ? externalVizPlanar : prev
      );
    }
  }, [externalVizRise, externalVizPlanar]);

const [hullMode, setHullMode] = useState<Hull3DRendererMode>(DEFAULT_HULL_MODE);
const [hullBlend, setHullBlend] = useState(DEFAULT_HULL_BLEND);
const [skyboxMode, setSkyboxMode] = useState<Hull3DSkyboxMode>(() => {
  if (typeof window === "undefined") return "off";
  const w: any = window;
  const raw = w.__hullSkyboxMode;
  return raw === "flat" || raw === "geodesic" ? raw : "geodesic";
});
const HULL_SAFE_BACKEND: HullRendererBackendMode = "mis-service";
const [allowUnsafeRendererBackends] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  const w: any = window;
  if (w.__hullAllowUnsafeAutostart === true) return true;
  try {
    return window.localStorage.getItem("alcubierre.hull.allowUnsafeAutostart") === "1";
  } catch {
    return false;
  }
});
const [hullRendererBackend, setHullRendererBackend] = useState<HullRendererBackendMode>(() => {
  if (typeof window === "undefined") return HULL_SAFE_BACKEND;
  const w: any = window;
  const runtime = w.__hullRendererBackend;
  const runtimeBackend =
    runtime === "webgl" || runtime === "webgpu" || runtime === "mis-service" ? runtime : null;
  let storedBackend: HullRendererBackendMode | null = null;
  try {
    const stored = window.localStorage.getItem("alcubierre.hull.rendererBackend");
    if (stored === "webgl" || stored === "webgpu" || stored === "mis-service") {
      storedBackend = stored;
    }
  } catch {
    // localStorage may be unavailable in hardened browser contexts.
  }
  const preferred = runtimeBackend ?? storedBackend ?? HULL_SAFE_BACKEND;
  const unsafe = preferred === "webgl" || preferred === "webgpu";
  if (unsafe && !allowUnsafeRendererBackends) return HULL_SAFE_BACKEND;
  return preferred;
});
const [hullVolumeVizLive, setHullVolumeVizLive] = useState<Hull3DVolumeViz>("theta_drive");
const [hullVolumeDomain, setHullVolumeDomain] = useState<Hull3DVolumeDomain>("wallBand");
const [volumeSource, setVolumeSource] = useState<HullVolumeSource>(() => {
  if (typeof window === "undefined") return "lattice";
  const w: any = window;
  const raw = w.__hullVolumeSource;
  return raw === "analytic" || raw === "lattice" || raw === "brick" ? raw : "lattice";
});
  const emitAlcubierreDebugEvent = useCallback(
    (event: Parameters<typeof pushAlcubierreDebugEvent>[0]) => {
      if (!alcubierreDebugEnabledRef.current) return;
      pushAlcubierreDebugEvent({
        ...event,
        mode: planarVizMode,
        rendererBackend: hullRendererBackend,
        skyboxMode,
      });
    },
    [hullRendererBackend, planarVizMode, skyboxMode],
  );
  useEffect(() => {
    alcubierreDebugEnabledRef.current = isAlcubierreDebugLogEnabled();
    return subscribeAlcubierreDebugLogConfig((enabled) => {
      alcubierreDebugEnabledRef.current = enabled;
    });
  }, []);
const [bubbleBoundsMode, setBubbleBoundsMode] = useState<"tight" | "wide">("tight");
const [bubbleOpacityHi, setBubbleOpacityHi] = useState(0.35);
const bubbleOpacityWindow = useMemo<[number, number]>(() => {
  const hi = clamp(bubbleOpacityHi, 0.05, 1.2);
  const lo = Math.max(0.02, Math.min(hi * 0.55, hi));
  return [lo, hi];
}, [bubbleOpacityHi]);
const [hullGeometry, setHullGeometry] = useState<HullGeometryMode>("ellipsoid");
const [autoHullGeometryReason, setAutoHullGeometryReason] = useState<string | null>(null);
const [gateSource, setGateSource] = useState<HullGateSource>(() => {
  const w: any = typeof window !== "undefined" ? window : {};
  const raw = w.__hullGateSource;
  return raw === "schedule" || raw === "blanket" || raw === "combined" ? raw : "combined";
});
const [gateViewEnabled, setGateViewEnabled] = useState<boolean>(() => {
  const w: any = typeof window !== "undefined" ? window : {};
  if (typeof w.__hullGateViewEnabled === "boolean") return !!w.__hullGateViewEnabled;
  return true;
});
const [forceFlatGate, setForceFlatGate] = useState<boolean>(() => {
  const w: any = typeof window !== "undefined" ? window : {};
  return !!w.__hullForceFlatGate;
});
useEffect(() => {
  if (hullVolumeDomain === "bubbleBox" && hullVolumeVizLive !== "theta_drive") {
    setHullVolumeVizLive("theta_drive");
  }
}, [hullVolumeDomain, hullVolumeVizLive]);
const geometryUserOverrideRef = useRef(false);
const [showHullSectorRing, setShowHullSectorRing] = useState(true);
const [showHullSurfaceOverlay, setShowHullSurfaceOverlay] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  const w: any = window;
  if (typeof w.__hullShowSurfaceOverlay === "boolean") return !!w.__hullShowSurfaceOverlay;
  return false;
});
const [showWireframeOverlay, setShowWireframeOverlay] = useState(true);
const [wireframeLod, setWireframeLod] = useState<"preview" | "high">("preview");
const [wireframePatches, setWireframePatches] = useState<WireframeContactPatch[]>([]);
const [useFieldProbeOverlay, setUseFieldProbeOverlay] = useState(false);
const [latticeModeEnabled, setLatticeModeEnabled] = useState<boolean>(() => {
  if (typeof window === "undefined") return true;
  const w: any = window;
  if (typeof w.__hullLatticeModeEnabled === "boolean") return !!w.__hullLatticeModeEnabled;
  return true;
});
const [latticeRequireSdf, setLatticeRequireSdf] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  const w: any = window;
  if (typeof w.__hullLatticeRequireSdf === "boolean") return !!w.__hullLatticeRequireSdf;
  return false;
});
const [showLatticeDiagnostics, setShowLatticeDiagnostics] = useState(false);
const [followHullPhase, setFollowHullPhase] = useState(true);
const [cardCameraPreset, setCardCameraPreset] = useState<CardCameraPreset>("threeQuarterFront");
const ONE_G_MS2 = 9.80665;
const [betaOverlayEnabled, setBetaOverlayEnabled] = useState(false);
const [betaTargetMs2, setBetaTargetMs2] = useState(ONE_G_MS2);
const [betaComfortMs2, setBetaComfortMs2] = useState(0.4 * ONE_G_MS2);
const [showKHeatOverlay, setShowKHeatOverlay] = useState(true);
const [showThetaIsoOverlay, setShowThetaIsoOverlay] = useState(true);
const [thetaSign, setThetaSign] = useState<1 | -1>(() => {
  if (typeof window === "undefined") return 1;
  const w: any = window;
  return w.__hullThetaSign === -1 ? -1 : 1;
});
const [showFordRomanBar, setShowFordRomanBar] = useState(true);
const [showSectorArcOverlay, setShowSectorArcOverlay] = useState(true);
const [showTiltOverlay, setShowTiltOverlay] = useState<boolean>(() => {
  if (typeof window === "undefined") return true;
  const w: any = window;
  if (typeof w.__hullShowTiltOverlay === "boolean") return !!w.__hullShowTiltOverlay;
  return true;
});
const [showFluxStreamlines, setShowFluxStreamlines] = useState(false);
const [fluxSeedCount, setFluxSeedCount] = useState(56);
const [fluxSeedRadius, setFluxSeedRadius] = useState(1.0);
const [fluxSeedSpread, setFluxSeedSpread] = useState(0.08);
const wfbrickInputRef = useRef<HTMLInputElement | null>(null);
const wfbrickStampRef = useRef(0);
const [wfbrickStatus, setWfbrickStatus] = useState<WfBrickStatus | null>(null);
const [wfbrickError, setWfbrickError] = useState<string | null>(null);
const tiltFromBusRef = useRef<TiltDirective | null>(null);
const [tiltBusVersion, bumpTiltVersion] = useReducer((x: number) => x + 1, 0);
const wireframePatchTick = useRef(0);
const wireframeBudgets = VIEWER_WIREFRAME_BUDGETS;
const [curvatureOverlay, setCurvatureOverlay] = useState<{
  enabled: boolean;
  gain: number;
  alpha: number;
  palette: CurvaturePalette;
  showQIMargin: boolean;
}>({
  enabled: false,
  gain: 1.0,
  alpha: 0.45,
  palette: "diverging",
  showQIMargin: false,
});
useEffect(() => {
  const id = subscribe("hull3d:overlay:curvature", (payload: any) => {
    if (!payload || typeof payload !== "object") return;
    setCurvatureOverlay((prev) => {
      const enabled = Boolean((payload as any).enabled);
      const gainRaw = Number((payload as any).gain);
      const alphaRaw = Number((payload as any).alpha);
      const paletteRaw = (payload as any).palette;
      const showMarginRaw = (payload as any).showQIMargin;
      return {
        enabled,
        gain: Number.isFinite(gainRaw) ? gainRaw : prev.gain,
        alpha: Number.isFinite(alphaRaw) ? Math.max(0, Math.min(1, alphaRaw)) : prev.alpha,
        palette: normalizeCurvaturePalette(paletteRaw, prev.palette),
        showQIMargin: Boolean(showMarginRaw),
      };
    });
  });
  return () => {
    unsubscribe(id);
  };
}, []);

useEffect(() => {
  const id = subscribe(DEFAULT_GEODESIC_DIAGNOSTICS_CHANNEL, (payload: any) => {
    if (!payload || typeof payload !== "object") return;
    setGeodesicDiagnostics(payload as HullGeodesicDiagnostics);
  });
  return () => {
    unsubscribe(id);
  };
}, []);

useEffect(() => {
  const id = subscribe(DEFAULT_METRIC_VOLUME_CHANNEL, (payload: any) => {
    if (!payload || typeof payload !== "object") return;
    if ((payload as any).kind !== "hull3d:metric-volume") return;
    if (typeof window !== "undefined") {
      (window as any).__hullMetricVolumeLatest = payload;
    }
    bumpMetricVolumeVersion();
  });
  return () => {
    unsubscribe(id);
  };
}, []);

const handleWfbrickLoad = useCallback(
  async (file: File) => {
    setWfbrickError(null);
    try {
      const dataset = await loadWfbrickFile(file);
      wfbrickStampRef.current += 1;
      const updatedAt = Date.now();
      const payloadBase = {
        dims: dataset.dims,
        stats: dataset.stats,
        version: wfbrickStampRef.current,
        updatedAt,
      };
      publish(DEFAULT_T00_CHANNEL, {
        ...payloadBase,
        data: dataset.t00.data,
        min: dataset.t00.min,
        max: dataset.t00.max,
        t00: dataset.t00,
      });
      publish(DEFAULT_FLUX_CHANNEL, { ...payloadBase, flux: dataset.flux });
      setWfbrickStatus({
        name: file.name,
        dims: dataset.dims,
        hasFlux: dataset.hasFlux,
        loadedAt: updatedAt,
      });
      setVolumeSource("brick");
    } catch (err) {
      const message = err instanceof Error ? err.message : "wfbrick: load failed";
      setWfbrickError(message);
      setWfbrickStatus(null);
    }
  },
  [setVolumeSource]
);

const handleWfbrickInputChange = useCallback(
  (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleWfbrickLoad(file);
    event.target.value = "";
  },
  [handleWfbrickLoad]
);

const openWfbrickPicker = useCallback(() => {
  wfbrickInputRef.current?.click();
}, []);

useEffect(() => {
  const handlerId = subscribe("hull3d:tilt", (payload: any) => {
    let nextDirective: TiltDirective | null = null;
    if (payload && typeof payload === "object" && payload.enabled) {
      const dirRaw = (payload as any).dir;
      if (Array.isArray(dirRaw) && dirRaw.length >= 2) {
        const dx = Number(dirRaw[0]);
        const dy = Number(dirRaw[1]);
        if (Number.isFinite(dx) && Number.isFinite(dy)) {
          const magnitudeRaw = Number((payload as any).magnitude);
          const alphaRaw = Number((payload as any).alpha);
          const gainRaw = Number((payload as any).gain); // [tilt-gain]
          const gainModeRaw = (payload as any).gainMode; // [tilt-gain]
          nextDirective = {
            enabled: true,
            dir: [dx, dy],
            magnitude: clamp(Number.isFinite(magnitudeRaw) ? magnitudeRaw : 0, 0, 1),
            alpha: Number.isFinite(alphaRaw) ? clamp(alphaRaw, 0, 1) : undefined,
            source: typeof (payload as any).source === "string" ? (payload as any).source : undefined,
            ...(Number.isFinite(gainRaw) ? { gain: gainRaw } : {}), // [tilt-gain]
            ...(gainModeRaw === "manual" || gainModeRaw === "curvature"
              ? { gainMode: gainModeRaw as "manual" | "curvature" }
              : {}), // [tilt-gain]
          };
        }
      }
    }

    const prev = tiltFromBusRef.current;
    const prevGain = typeof prev?.gain === "number" ? prev.gain : undefined; // [tilt-gain]
    const nextGain = typeof nextDirective?.gain === "number" ? nextDirective.gain : undefined; // [tilt-gain]
    const gainClose = // [tilt-gain]
      (prevGain === undefined && nextGain === undefined) ||
      (prevGain !== undefined && nextGain !== undefined && Math.abs(prevGain - nextGain) < 1e-4); // [tilt-gain]
    const prevGainMode = prev?.gainMode ?? "__none__"; // [tilt-gain]
    const nextGainMode = nextDirective?.gainMode ?? "__none__"; // [tilt-gain]
    const same =
      (prev === null && nextDirective === null) ||
      (prev !== null &&
        nextDirective !== null &&
        Math.abs(prev.dir[0] - nextDirective.dir[0]) < 1e-4 &&
        Math.abs(prev.dir[1] - nextDirective.dir[1]) < 1e-4 &&
        Math.abs(prev.magnitude - nextDirective.magnitude) < 1e-4 &&
        Math.abs((prev.alpha ?? 0.85) - (nextDirective.alpha ?? 0.85)) < 1e-4 &&
        gainClose && // [tilt-gain]
        prevGainMode === nextGainMode); // [tilt-gain]

    if (!same) {
      tiltFromBusRef.current = nextDirective;
      if (typeof window !== "undefined") {
        (window as any).__tiltBusLast = nextDirective;
      }
      bumpTiltVersion();
    }
  });

  return () => {
    unsubscribe(handlerId);
  };
}, []);

const busTiltDirective = useMemo<TiltDirective | null>(() => tiltFromBusRef.current, [tiltBusVersion]);

const liveVolumeMode = useMemo(() => volumeModeFromHull(hullVolumeVizLive), [hullVolumeVizLive]);
const setLiveVolumeMode = useCallback((mode: VolumeViz) => {
  const nextHull = hullVizFromVolumeMode(mode);
  setHullVolumeVizLive((prev) => (prev === nextHull ? prev : nextHull));
}, []);
const handleVolumeModeChange = useCallback((mode: VolumeViz) => {
  setLiveVolumeMode(mode);
}, [setLiveVolumeMode]);
const handleHullGeometryChange = useCallback((mode: HullGeometryMode) => {
  geometryUserOverrideRef.current = true;
  setHullGeometry(mode);
  setAutoHullGeometryReason(null);
}, []);
const setSharedPhase = useHull3DSharedStore((s) => s.setPhase);
const setSharedSampling = useHull3DSharedStore((s) => s.setSampling);
const setSharedPhysics = useHull3DSharedStore((s) => s.setPhysics);
const setSharedCompliance = useHull3DSharedStore((s) => s.setCompliance);
const setSharedSector = useHull3DSharedStore((s) => s.setSector);
const setSharedPalette = useHull3DSharedStore((s) => s.setPalette);
const setSharedMeshOverlay = useHull3DSharedStore((s) => s.setMeshOverlay);
const setSharedLattice = useHull3DSharedStore((s) => s.setLattice);
const setViewer = useHull3DSharedStore((s) => s.setViewer);
const overlayPrefs = useHull3DSharedStore((s) => s.overlayPrefs, shallow);
const setOverlayPrefs = useHull3DSharedStore((s) => s.setOverlayPrefs);
const sharedHullState = useHull3DSharedStore(
  (s) => ({
    phase: s.phase,
    sampling: s.sampling,
    physics: s.physics,
    compliance: s.compliance,
    sector: s.sector,
    palette: s.palette,
    lattice: s.lattice,
  }),
  shallow
);
const sharedPhase = sharedHullState.phase;
const sharedSampling = sharedHullState.sampling;
const sharedPhysicsState = sharedHullState.physics;
const sharedComplianceState = sharedHullState.compliance;
const sharedSectorState = sharedHullState.sector;
const sharedPaletteState = sharedHullState.palette;
const sharedLatticeState = sharedHullState.lattice;

useEffect(() => {
  if (typeof window === "undefined") return;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail ?? {};
    if (!detail || typeof detail !== "object") return;
    setLatticeModeEnabled(true);
    if ((detail as any).requireSdf) setLatticeRequireSdf(true);
    const basis = (detail as any).basis as HullBasisResolved | undefined;
    const dims = (detail as any).hullDims as { Lx_m: number; Ly_m: number; Lz_m: number } | undefined;
    setViewer({
      bounds: {
        ...(basis ? { basis } : {}),
        ...(dims
          ? {
              axes: [dims.Lx_m / 2, dims.Ly_m / 2, dims.Lz_m / 2] as [number, number, number],
            }
          : {}),
      },
    });
  };
  window.addEventListener("helix:auto-view-preview" as any, handler as any);
  return () => window.removeEventListener("helix:auto-view-preview" as any, handler as any);
}, [setViewer]);
const latticeSdfStats = useMemo(() => {
  const sdf = sharedLatticeState?.sdf;
  if (!sdf?.stats) return null;
  const voxPct = Math.max(0, Math.min(1, sdf.stats.voxelCoverage)) * 100;
  const triPct = Math.max(0, Math.min(1, sdf.stats.triangleCoverage)) * 100;
  const maxD = sdf.stats.maxAbsDistance;
  const band = sdf.band;
  return {
    voxPct,
    triPct,
    maxD,
    band,
    cacheHit: !!sdf.cacheHit,
    label: `SDF ${voxPct.toFixed(1)}% vox Â· ${triPct.toFixed(1)}% tris Â· |d|max ${maxD.toFixed(3)} m${band ? ` / band ${band.toFixed(3)} m` : ""}${sdf.cacheHit ? " (cache)" : ""}`,
  };
}, [sharedLatticeState?.sdf]);
const latticeVolumeStats = useMemo(() => {
  const vol = sharedLatticeState?.volume;
  if (!vol?.stats) return null;
  const covPct = Math.max(0, Math.min(1, vol.stats.coverage)) * 100;
  const maxGate = vol.stats.maxGate ?? 0;
  const maxDrive = vol.stats.maxDrive ?? 0;
  return {
    covPct,
    maxGate,
    maxDrive,
    budgetHit: !!vol.stats.budgetHit,
    cacheHit: !!vol.cacheHit,
    hashShort: typeof vol.hash === "string" ? vol.hash.slice(0, 8) : null,
    label: `VOL ${covPct.toFixed(1)}% cov Â· gate ${maxGate.toFixed(3)} Â· drive ${maxDrive.toFixed(3)}${vol.stats.budgetHit ? " (budget)" : ""}${vol.cacheHit ? " (cache)" : ""}`,
  };
}, [sharedLatticeState?.volume]);
const latticeFrameStats = useMemo(() => {
  const frame = sharedLatticeState?.frame;
  if (!frame) return null;
  const voxels = Math.max(1, frame.voxelCount);
  const budget = frame.budget?.maxVoxels ?? 0;
  const pct = budget > 0 ? (voxels / budget) * 100 : null;
  return {
    dims: frame.dims,
    voxelSize_m: frame.voxelSize_m,
    voxelCount: voxels,
    budgetMaxVoxels: budget,
    budgetPct: pct,
    clampReasons: frame.clampReasons ?? [],
  };
}, [sharedLatticeState?.frame]);

  type LatticeGpuStatus = ReturnType<(typeof Hull3DRenderer)["prototype"]["getLatticeGpuStatus"]>;

  const [latticeVolumeDeterminismHash, setLatticeVolumeDeterminismHash] = useState<string | null>(null);
  const [latticeSdfDeterminismHash, setLatticeSdfDeterminismHash] = useState<string | null>(null);
  const [latticeGpuStatus, setLatticeGpuStatus] = useState<LatticeGpuStatus | null>(null);
  const latticeHealthKeyRef = useRef<string>("");
  const latticeFallbackReasonRef = useRef<string | null>(null);
  const overlayTelemetryKeyRef = useRef<string>("");
  const latticeAutoTuneRef = useRef<{
    lastFrameKey?: string | null;
    lastSdfKey?: string | null;
    capsApplied?: boolean;
  }>({});
  const latticeUploadTelemetry = (latticeGpuStatus as any)?.runtime?.telemetry ?? null;

  useEffect(() => {
    let cancelled = false;
    const volume = sharedLatticeState?.volume ?? null;
    const volumeHash = typeof volume?.hash === "string" ? volume.hash : null;
    if (!latticeModeEnabled || !volume || !volumeHash) {
      setLatticeVolumeDeterminismHash((prev) => (prev ? null : prev));
      return;
    }
    hashLatticeVolumeDeterminism(volume)
      .then((digest) => {
        if (cancelled) return;
        setLatticeVolumeDeterminismHash((prev) => (prev === digest ? prev : digest));
      })
      .catch((error) => {
        console.warn("[Hull3D][lattice] Failed to hash volume determinism probe", error);
        if (!cancelled) setLatticeVolumeDeterminismHash(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latticeModeEnabled, sharedLatticeState?.volume?.hash]);

  useEffect(() => {
    let cancelled = false;
    const sdf = sharedLatticeState?.sdf ?? null;
    const sdfKey = typeof sdf?.key === "string" ? sdf.key : null;
    if (!latticeModeEnabled || !sdf || !sdfKey) {
      setLatticeSdfDeterminismHash((prev) => (prev ? null : prev));
      return;
    }
    hashLatticeSdfDeterminism(sdf)
      .then((digest) => {
        if (cancelled) return;
        setLatticeSdfDeterminismHash((prev) => (prev === digest ? prev : digest));
      })
      .catch((error) => {
        console.warn("[Hull3D][lattice] Failed to hash SDF determinism probe", error);
        if (!cancelled) setLatticeSdfDeterminismHash(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latticeModeEnabled, sharedLatticeState?.sdf?.key]);

  useEffect(() => {
    if (!latticeModeEnabled || typeof window === "undefined") {
      setLatticeGpuStatus((prev) => (prev ? null : prev));
      return;
    }

    const volumeHash = sharedLatticeState?.volume?.hash ?? null;
    const sdfKey = latticeRequireSdf ? sharedLatticeState?.sdf?.key ?? null : null;
    let timer: number | null = null;

    const tick = () => {
      const renderer = hullRendererRef.current;
      if (!renderer) {
        setLatticeGpuStatus((prev) => (prev ? null : prev));
        return;
      }
      const status = renderer.getLatticeGpuStatus({ volumeHash, sdfKey });
      setLatticeGpuStatus((prev) => {
        if (!prev) return status;
        const capsPrev = (prev as any).caps;
        const capsNext = (status as any).caps;
        const sameCaps =
          !!capsPrev &&
          !!capsNext &&
          capsPrev.maxTextureSize === capsNext.maxTextureSize &&
          capsPrev.max3DTextureSize === capsNext.max3DTextureSize &&
          capsPrev.supportsColorFloat === capsNext.supportsColorFloat &&
          capsPrev.supportsFloatLinear === capsNext.supportsFloatLinear &&
          capsPrev.supportsHalfFloatLinear === capsNext.supportsHalfFloatLinear;
        const runtimePrev = (prev as any).runtime;
        const runtimeNext = (status as any).runtime;
        const sameRuntime =
          !!runtimePrev &&
          !!runtimeNext &&
          runtimePrev.hasLatticeVolume === runtimeNext.hasLatticeVolume &&
          runtimePrev.backend === runtimeNext.backend &&
          runtimePrev.formatLabel === runtimeNext.formatLabel &&
          (runtimePrev as any).formatReason === (runtimeNext as any).formatReason &&
          ((runtimePrev as any).telemetry?.downgradeReason ?? null) ===
            ((runtimeNext as any).telemetry?.downgradeReason ?? null) &&
          runtimePrev.packedRG === runtimeNext.packedRG &&
          runtimePrev.useAtlas === runtimeNext.useAtlas &&
          runtimePrev.hasLatticeSdf === runtimeNext.hasLatticeSdf;
        if (
          prev.expectedVolumeHash === status.expectedVolumeHash &&
          prev.expectedSdfKey === status.expectedSdfKey &&
          prev.volumeReady === status.volumeReady &&
          prev.volumeFailed === status.volumeFailed &&
          (prev as any).volumeFailedReason === (status as any).volumeFailedReason &&
          prev.sdfReady === status.sdfReady &&
          prev.sdfFailed === status.sdfFailed &&
          (prev as any).sdfFailedReason === (status as any).sdfFailedReason &&
          sameCaps &&
          sameRuntime
        ) {
          return prev;
        }
        return status;
      });
    };

    tick();
    timer = window.setInterval(tick, 650);
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [latticeModeEnabled, latticeRequireSdf, sharedLatticeState?.volume?.hash, sharedLatticeState?.sdf?.key]);

  const latticeFallbackReasonLegacy = useMemo(() => {
    if (!latticeModeEnabled) return "disabled";
    const frame = sharedLatticeState?.frame ?? null;
    if (!frame) return "frame-missing";
    const volume = sharedLatticeState?.volume ?? null;
    if (!volume) return "volume-missing";
    if (volume.stats?.budgetHit || volume.clampReasons?.includes("voxel:budgetHit")) return "volume-over-budget";
    if (latticeRequireSdf && !sharedLatticeState?.sdf) return "sdf-missing-required";
    if (latticeGpuStatus?.volumeFailed) return "gpu-volume-upload-failed";
    if (latticeRequireSdf && latticeGpuStatus?.sdfFailed) return "gpu-sdf-upload-failed";
    if (latticeGpuStatus && !latticeGpuStatus.volumeReady) return "gpu-volume-upload-pending";
    if (latticeRequireSdf && latticeGpuStatus && !latticeGpuStatus.sdfReady) return "gpu-sdf-upload-pending";
    return null;
  }, [
    latticeModeEnabled,
    latticeRequireSdf,
    sharedLatticeState?.frame,
    sharedLatticeState?.volume,
    sharedLatticeState?.sdf,
    latticeGpuStatus,
  ]);

  useEffect(() => {
    // NOTE: Lattice telemetry/observability publishing is centralized near the
  // component return so it can include hash-stale guardrails + WebGL caps/runtime.
  }, []);
const [busPhasePayload, setBusPhasePayload] = useState<{
  phase01: number;
  phaseCont?: number;
  tsec_ms?: number;
  pumpPhase_deg?: number;
  tauLC_ms?: number;
  sectorIndex?: number;
  source?: string;
  timestamp?: number;
} | null>(null);
const busPhaseHistoryRef = useRef<number[]>([]);
const loopPhaseHistoryRef = useRef<number[]>([]);
const lastPhaseSampleTimeRef = useRef<number>(0);
const lastBusPhaseSampleRef = useRef<number | null>(null);
const lastLoopPhaseSampleRef = useRef<number | null>(null);
const [phaseHistoryTick, setPhaseHistoryTick] = useState(0);
const sharedPhysicsLock = useHull3DSharedStore((s) => s.physics.locked);
const toggleSharedPhysicsLock = useHull3DSharedStore((s) => s.togglePhysicsLock);
const trimSharedPhysicsDb = useHull3DSharedStore((s) => s.trimPhysicsDb);
const showSectorGridOverlay = useHull3DSharedStore(
  (s) => s.overlays.sectorGrid3D.enabled
);

useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullShowSurfaceOverlay = showHullSurfaceOverlay;
    (window as any).__surfaceDebugEcho = showHullSurfaceOverlay;
  }
}, [showHullSurfaceOverlay]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullGateSource = gateSource;
  }
}, [gateSource]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullGateViewEnabled = gateViewEnabled;
  }
}, [gateViewEnabled]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullForceFlatGate = forceFlatGate;
  }
}, [forceFlatGate]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullShowTiltOverlay = showTiltOverlay;
  }
}, [showTiltOverlay]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullThetaSign = thetaSign;
  }
}, [thetaSign]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullVolumeSource = volumeSource;
  }
}, [volumeSource]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullSkyboxMode = skyboxMode;
  }
}, [skyboxMode]);
useEffect(() => {
  if (allowUnsafeRendererBackends) return;
  if (hullRendererBackend === HULL_SAFE_BACKEND) return;
  setHullDiagMsg(
    "Safe mode forced MIS service renderer. Local WebGL/WebGPU backends are blocked to prevent browser hangs.",
  );
  setGlError("Renderer halted for safety: local GPU renderer disabled in safe mode.");
  setHullRendererBackend(HULL_SAFE_BACKEND);
}, [allowUnsafeRendererBackends, hullRendererBackend]);
useEffect(() => {
  if (typeof window === "undefined") return;
  (window as any).__hullRendererBackend = hullRendererBackend;
  try {
    window.localStorage.setItem("alcubierre.hull.rendererBackend", hullRendererBackend);
  } catch {
    // Ignore persistence failures; runtime global still applies.
  }
}, [hullRendererBackend]);
  useEffect(() => {
    emitAlcubierreDebugEvent({
      level: "info",
      category: "viewer_state",
      source: "alcubierre.viewer.state",
      note: "Viewer renderer/mode state changed",
      expected: null,
      rendered: {
        planarVizMode,
      },
      delta: null,
      measurements: {
        hullRendererBackend,
        skyboxMode,
        volumeSource,
        hullVolumeViz: hullVolumeVizLive,
      },
    });
  }, [emitAlcubierreDebugEvent, hullRendererBackend, hullVolumeVizLive, planarVizMode, skyboxMode, volumeSource]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullLatticeModeEnabled = latticeModeEnabled;
  }
}, [latticeModeEnabled]);
useEffect(() => {
  if (typeof window !== "undefined") {
    (window as any).__hullLatticeRequireSdf = latticeRequireSdf;
  }
}, [latticeRequireSdf]);
useEffect(() => {
  const handlerId = subscribe("warp:viz", (payload: any) => {
    const v = Number(payload?.volumeViz);
    if (v === 0 || v === 1 || v === 2 || v === 3 || v === 4) {
      setLiveVolumeMode(v as VolumeViz);
    }
  });
  return () => {
    if (handlerId) unsubscribe(handlerId);
  };
  }, [setLiveVolumeMode]);
  const [hullQuality, setHullQuality] = useState<Hull3DQualityPreset>("low");
  const [hullVoxelDensity, setHullVoxelDensity] = useState<"low" | "medium" | "high">("medium");
  const [hullRayStepsMax, setHullRayStepsMax] = useState<number | null>(null);
  const [hullStepBias, setHullStepBias] = useState<number | null>(null);
  const [hullQualityAdvanced, setHullQualityAdvanced] = useState(false);
  const [viewerProfileTag, setViewerProfileTag] = useState<string | undefined>(undefined);
  const overlayProfileKey = useMemo<HullOverlayPrefProfile>(
    () => (viewerProfileTag === "card" ? "card" : hullQuality),
    [viewerProfileTag, hullQuality],
  );
  const latticeQualityLocked = useMemo(
    () =>
      viewerProfileTag === "card" ||
      hullQuality !== "auto" ||
      hullVoxelDensity !== "medium" ||
      hullRayStepsMax !== null ||
      hullStepBias !== null,
    [viewerProfileTag, hullQuality, hullVoxelDensity, hullRayStepsMax, hullStepBias],
  );
  const [voxelSlicesEnabled, setVoxelSlicesEnabled] = useState<boolean>(
    () => defaultOverlayPrefsForProfile("auto").slicesEnabled
  );
  const [voxelSliceAxis, setVoxelSliceAxis] = useState<HullVoxelSliceAxis>(
    () => defaultOverlayPrefsForProfile("auto").sliceAxis
  );
  const [voxelSliceMin, setVoxelSliceMin] = useState<number>(
    () => defaultOverlayPrefsForProfile("auto").sliceMin
  );
  const [voxelSliceMax, setVoxelSliceMax] = useState<number>(
    () => defaultOverlayPrefsForProfile("auto").sliceMax
  );
  const [coverageHeatmapEnabled, setCoverageHeatmapEnabled] = useState<boolean>(
    () => defaultOverlayPrefsForProfile("auto").coverageHeatmap
  );
  const [spacetimeGridEnabled, setSpacetimeGridEnabled] = useState<boolean>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.enabled
  );
  const [spacetimeGridMode, setSpacetimeGridMode] = useState<HullSpacetimeGridMode>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.mode
  );
  const [spacetimeGridSpacing, setSpacetimeGridSpacing] = useState<number>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.spacing_m
  );
  const [spacetimeGridWarpStrength, setSpacetimeGridWarpStrength] = useState<number>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.warpStrength
  );
  const [spacetimeGridFalloff, setSpacetimeGridFalloff] = useState<number>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.falloff_m
  );
  const [spacetimeGridColorBy, setSpacetimeGridColorBy] = useState<HullSpacetimeGridColorBy>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.colorBy
  );
  const [spacetimeGridUseSdf, setSpacetimeGridUseSdf] = useState<boolean>(
    () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.useSdf
  );
  const [spacetimeGridStrengthMode, setSpacetimeGridStrengthMode] =
    useState<HullSpacetimeGridStrengthMode>(
      () => defaultOverlayPrefsForProfile("auto").spacetimeGrid.warpStrengthMode
    );
  const [spacetimeGridDbg, setSpacetimeGridDbg] = useState<any | null>(null);
  const spacetimeGridAutoAppliedRef = useRef(false);
  const cardProfileStateRef = useRef<{
    active: boolean;
    requestId?: string;
    snapshot: {
      volumeDomain: Hull3DVolumeDomain;
      quality: Hull3DQualityPreset;
      voxelDensity: "low" | "medium" | "high";
      rayStepsMax: number | null;
      stepBias: number | null;
      boundsProfile: "tight" | "wide";
    } | null;
  }>({ active: false, snapshot: null, requestId: undefined });
  const cardProfileLatestRef = useRef({
    volumeDomain: hullVolumeDomain,
    quality: hullQuality,
    voxelDensity: hullVoxelDensity,
    rayStepsMax: hullRayStepsMax,
    stepBias: hullStepBias,
    boundsProfile: bubbleBoundsMode,
  });
  const CARD_PROFILE_OVERRIDES = useMemo<Hull3DQualityOverrides>(
    () => ({
      voxelDensity: "high",
      raySteps: 128,
      stepBias: 0.42,
    }),
    [],
  );
  useEffect(() => {
    cardProfileLatestRef.current = {
      volumeDomain: hullVolumeDomain,
      quality: hullQuality,
      voxelDensity: hullVoxelDensity,
      rayStepsMax: hullRayStepsMax,
      stepBias: hullStepBias,
      boundsProfile: bubbleBoundsMode,
    };
  }, [hullVolumeDomain, hullQuality, hullVoxelDensity, hullRayStepsMax, hullStepBias, bubbleBoundsMode]);
  useEffect(() => {
    if (!overlayPrefs[overlayProfileKey]) {
      setOverlayPrefs(overlayProfileKey, defaultOverlayPrefsForProfile(overlayProfileKey));
    }
    if (overlayPrefs[overlayProfileKey] && !overlayPrefs[overlayProfileKey]?.spacetimeGrid) {
      setOverlayPrefs(overlayProfileKey, (current) => ({
        ...current,
        spacetimeGrid:
          current.spacetimeGrid ?? defaultOverlayPrefsForProfile(overlayProfileKey).spacetimeGrid,
      }));
    }
    const prefs = overlayPrefs[overlayProfileKey] ?? defaultOverlayPrefsForProfile(overlayProfileKey);
    const spacetimeGrid = prefs.spacetimeGrid ?? defaultOverlayPrefsForProfile(overlayProfileKey).spacetimeGrid;
    setVoxelSlicesEnabled(prefs.slicesEnabled);
    setVoxelSliceAxis(prefs.sliceAxis);
    setVoxelSliceMin(prefs.sliceMin);
    setVoxelSliceMax(prefs.sliceMax);
    setCoverageHeatmapEnabled(prefs.coverageHeatmap);
    setSpacetimeGridEnabled(spacetimeGrid.enabled);
    setSpacetimeGridMode(spacetimeGrid.mode);
    setSpacetimeGridSpacing(spacetimeGrid.spacing_m);
    setSpacetimeGridWarpStrength(spacetimeGrid.warpStrength);
    setSpacetimeGridFalloff(spacetimeGrid.falloff_m);
    setSpacetimeGridColorBy(spacetimeGrid.colorBy);
    setSpacetimeGridUseSdf(spacetimeGrid.useSdf);
    setSpacetimeGridStrengthMode(spacetimeGrid.warpStrengthMode);
  }, [overlayPrefs, overlayProfileKey, setOverlayPrefs]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | null = null;
    let lastKey = "";
    const tick = () => {
      const dbg = (window as any).__spacetimeGridDbg;
      if (dbg && typeof dbg === "object") {
        const reasons = Array.isArray(dbg.degraded?.reasons) ? dbg.degraded.reasons : [];
        const key = [
          dbg.enabled ? 1 : 0,
          dbg.postEnabled ? 1 : 0,
          dbg.postMode ?? "none",
          dbg.mode ?? "none",
          Math.round((dbg.degraded?.spacingUsed_m ?? 0) * 1000),
          Math.round((dbg.bounds?.expandedBy_m ?? 0) * 1000),
          reasons.join(","),
        ].join("|");
        if (key !== lastKey) {
          lastKey = key;
          setSpacetimeGridDbg(dbg);
        }
      }
      timer = window.setTimeout(tick, 750);
    };
    tick();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);
  const syncOverlayPrefs = useCallback(
    (next: Partial<HullOverlayPrefs> | ((current: HullOverlayPrefs) => HullOverlayPrefs)) => {
      setOverlayPrefs(overlayProfileKey, next);
    },
    [overlayProfileKey, setOverlayPrefs],
  );
  const updateSpacetimeGridPrefs = useCallback(
    (partial: Partial<HullOverlayPrefs["spacetimeGrid"]>) => {
      setOverlayPrefs(overlayProfileKey, (current) => {
        const base =
          current.spacetimeGrid ?? defaultOverlayPrefsForProfile(overlayProfileKey).spacetimeGrid;
        return {
          ...current,
          spacetimeGrid: { ...base, ...partial },
        };
      });
    },
    [overlayProfileKey, setOverlayPrefs],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (spacetimeGridEnabled) return;
    if (spacetimeGridAutoAppliedRef.current) return;
    spacetimeGridAutoAppliedRef.current = true;
    const preset =
      SPACETIME_GRID_PRESETS.find((entry) => entry.id === SPACETIME_GRID_DEFAULT_PRESET_ID) ??
      SPACETIME_GRID_PRESETS[0];
    if (preset) {
      updateSpacetimeGridPrefs(preset.prefs);
    } else {
      updateSpacetimeGridPrefs({ enabled: true });
    }
  }, [spacetimeGridEnabled, updateSpacetimeGridPrefs]);
  const applySliceBounds = useCallback(
    (min: number, max: number) => {
      const lo = Math.max(0, Math.min(1, min));
      const hiRaw = Math.max(0, Math.min(1, max));
      const loFixed = Math.max(0, Math.min(lo, hiRaw - 0.01));
      const hi = Math.min(1, Math.max(loFixed + 0.01, hiRaw));
      setVoxelSliceMin(loFixed);
      setVoxelSliceMax(hi);
      syncOverlayPrefs({ sliceMin: loFixed, sliceMax: hi });
    },
    [syncOverlayPrefs],
  );
  const handleSliceToggle = useCallback(
    (enabled: boolean) => {
      setVoxelSlicesEnabled(enabled);
      syncOverlayPrefs({ slicesEnabled: enabled });
    },
    [syncOverlayPrefs],
  );
  const handleSliceAxisChange = useCallback(
    (axis: HullVoxelSliceAxis) => {
      setVoxelSliceAxis(axis);
      syncOverlayPrefs({ sliceAxis: axis });
    },
    [syncOverlayPrefs],
  );
  const handleHeatmapToggle = useCallback(
    (enabled: boolean) => {
      setCoverageHeatmapEnabled(enabled);
      syncOverlayPrefs({ coverageHeatmap: enabled });
    },
    [syncOverlayPrefs],
  );
  const handleSpacetimeGridToggle = useCallback(
    (enabled: boolean) => {
      setSpacetimeGridEnabled(enabled);
      updateSpacetimeGridPrefs({ enabled });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridModeChange = useCallback(
    (mode: HullSpacetimeGridMode) => {
      setSpacetimeGridMode(mode);
      updateSpacetimeGridPrefs({ mode });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridSpacingChange = useCallback(
    (value: number) => {
      const clampedVal = clamp(value, 0.05, 5);
      setSpacetimeGridSpacing(clampedVal);
      updateSpacetimeGridPrefs({ spacing_m: clampedVal });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridWarpStrengthChange = useCallback(
    (value: number) => {
      const clampedVal = clamp(value, 0, 5);
      setSpacetimeGridWarpStrength(clampedVal);
      updateSpacetimeGridPrefs({ warpStrength: clampedVal });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridFalloffChange = useCallback(
    (value: number) => {
      const clampedVal = clamp(value, 0.05, 6);
      setSpacetimeGridFalloff(clampedVal);
      updateSpacetimeGridPrefs({ falloff_m: clampedVal });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridColorByChange = useCallback(
    (colorBy: HullSpacetimeGridColorBy) => {
      setSpacetimeGridColorBy(colorBy);
      updateSpacetimeGridPrefs({ colorBy });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridUseSdfChange = useCallback(
    (useSdf: boolean) => {
      setSpacetimeGridUseSdf(useSdf);
      updateSpacetimeGridPrefs({ useSdf });
    },
    [updateSpacetimeGridPrefs],
  );
  const handleSpacetimeGridStrengthModeChange = useCallback(
    (mode: HullSpacetimeGridStrengthMode) => {
      setSpacetimeGridStrengthMode(mode);
      updateSpacetimeGridPrefs({ warpStrengthMode: mode });
    },
    [updateSpacetimeGridPrefs],
  );
  const applySpacetimeGridPreset = useCallback(
    (preset: SpacetimeGridPreset) => {
      const next = preset.prefs;
      setSpacetimeGridEnabled(next.enabled);
      setSpacetimeGridMode(next.mode);
      setSpacetimeGridSpacing(next.spacing_m);
      setSpacetimeGridWarpStrength(next.warpStrength);
      setSpacetimeGridFalloff(next.falloff_m);
      setSpacetimeGridColorBy(next.colorBy);
      setSpacetimeGridUseSdf(next.useSdf);
      setSpacetimeGridStrengthMode(next.warpStrengthMode);
      updateSpacetimeGridPrefs(next);
    },
    [updateSpacetimeGridPrefs],
  );
  const applyCardExportProfile = useCallback(
    (requestId?: string) => {
      if (!cardProfileStateRef.current.active) {
        cardProfileStateRef.current = {
          active: true,
          requestId,
          snapshot: {
            ...cardProfileLatestRef.current,
          },
        };
      } else {
        cardProfileStateRef.current.requestId = requestId ?? cardProfileStateRef.current.requestId;
      }
      setViewerProfileTag("card");
      if (hullVolumeDomain !== "bubbleBox") {
        setHullVolumeDomain("bubbleBox");
      }
      setHullQuality("high");
      setHullVoxelDensity(CARD_PROFILE_OVERRIDES.voxelDensity ?? "high");
      setHullRayStepsMax(CARD_PROFILE_OVERRIDES.raySteps ?? null);
      setHullStepBias(CARD_PROFILE_OVERRIDES.stepBias ?? null);
      window.dispatchEvent(
        new CustomEvent("helix:card-export-profile:applied" as any, {
          detail: { requestId, profile: "card" },
        }),
      );
    },
    [
      CARD_PROFILE_OVERRIDES,
      hullVolumeDomain,
      setHullQuality,
      setHullRayStepsMax,
      setHullStepBias,
      setHullVoxelDensity,
      setHullVolumeDomain,
      setViewerProfileTag,
    ],
  );
  const restoreCardExportProfile = useCallback(
    (requestId?: string) => {
      const snapshot = cardProfileStateRef.current.snapshot;
      if (snapshot) {
        setHullVolumeDomain(snapshot.volumeDomain);
        setHullQuality(snapshot.quality);
        setHullVoxelDensity(snapshot.voxelDensity);
        setHullRayStepsMax(snapshot.rayStepsMax);
        setHullStepBias(snapshot.stepBias);
        setBubbleBoundsMode(snapshot.boundsProfile);
      }
      cardProfileStateRef.current = { active: false, snapshot: null, requestId: undefined };
      setViewerProfileTag(undefined);
      window.dispatchEvent(
        new CustomEvent("helix:card-export-profile:restored" as any, {
          detail: { requestId },
        }),
      );
    },
    [
      setBubbleBoundsMode,
      setHullQuality,
      setHullRayStepsMax,
      setHullStepBias,
      setHullVoxelDensity,
      setHullVolumeDomain,
      setViewerProfileTag,
    ],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: "apply" | "restore"; requestId?: string }>).detail;
      if (!detail?.mode) return;
      if (detail.mode === "apply") {
        applyCardExportProfile(detail.requestId);
      } else if (detail.mode === "restore") {
        restoreCardExportProfile(detail.requestId);
      }
    };
    window.addEventListener("helix:card-export-profile" as any, handler as any);
    return () => window.removeEventListener("helix:card-export-profile" as any, handler as any);
  }, [applyCardExportProfile, restoreCardExportProfile]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        requestId?: string;
        volumeHash?: string | null;
        sdfKey?: string | null;
        requireSdf?: boolean;
        timeoutMs?: number;
      }>).detail;
      const requestId = detail?.requestId;
      if (!requestId) return;
      const volumeHash = typeof detail.volumeHash === "string" ? detail.volumeHash : null;
      const sdfKey = typeof detail.sdfKey === "string" ? detail.sdfKey : null;
      const requireSdf = Boolean(detail.requireSdf);
      const timeoutMs = Number.isFinite(detail.timeoutMs) ? Math.max(0, Number(detail.timeoutMs)) : 4500;

      const start = typeof performance !== "undefined" ? performance.now() : Date.now();
      let rafId: number | null = null;

      const respond = (payload: Record<string, unknown>) => {
        if (rafId != null) {
          try {
            cancelAnimationFrame(rafId);
          } catch {}
          rafId = null;
        }
        window.dispatchEvent(
          new CustomEvent("helix:await-lattice-ready:result" as any, {
            detail: { requestId, ...payload },
          }),
        );
      };

      const tick = () => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = now - start;
        const renderer = hullRendererRef.current;
        if (!renderer) {
          if (!volumeHash && !sdfKey) {
            respond({
              ready: true,
              volumeHash,
              sdfKey,
              volumeReady: true,
              sdfReady: true,
              volumeFailed: false,
              sdfFailed: false,
              reason: "no-lattice",
            });
            return;
          }
          if (elapsed >= timeoutMs) {
            respond({
              ready: false,
              volumeHash,
              sdfKey,
              volumeReady: false,
              sdfReady: false,
              volumeFailed: false,
              sdfFailed: false,
              reason: "renderer-missing",
            });
            return;
          }
          rafId = requestAnimationFrame(tick);
          return;
        }

        const status = renderer.getLatticeGpuStatus({
          volumeHash,
          sdfKey: requireSdf ? sdfKey : null,
        });
        const ready = status.volumeReady && status.sdfReady && !status.volumeFailed && !status.sdfFailed;
        if (ready) {
          respond({
            ready: true,
            volumeHash: status.expectedVolumeHash,
            sdfKey: status.expectedSdfKey,
            volumeReady: status.volumeReady,
            sdfReady: status.sdfReady,
            volumeFailed: status.volumeFailed,
            sdfFailed: status.sdfFailed,
            reason: "ready",
          });
          return;
        }
        if (status.volumeFailed || status.sdfFailed) {
          respond({
            ready: false,
            volumeHash: status.expectedVolumeHash,
            sdfKey: status.expectedSdfKey,
            volumeReady: status.volumeReady,
            sdfReady: status.sdfReady,
            volumeFailed: status.volumeFailed,
            sdfFailed: status.sdfFailed,
            reason: status.volumeFailed ? "volume-upload-failed" : "sdf-upload-failed",
          });
          return;
        }
        if (elapsed >= timeoutMs) {
          respond({
            ready: false,
            volumeHash: status.expectedVolumeHash,
            sdfKey: status.expectedSdfKey,
            volumeReady: status.volumeReady,
            sdfReady: status.sdfReady,
            volumeFailed: status.volumeFailed,
            sdfFailed: status.sdfFailed,
            reason: "timeout",
          });
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("helix:await-lattice-ready" as any, handler as any);
    return () => window.removeEventListener("helix:await-lattice-ready" as any, handler as any);
  }, []);
  // Exposure (log slider mapped to 0.01x .. 100x; 0.5 -> 1x)
  const [hullExposure01, setHullExposure01] = useState(0.5);
  // Parity diagnostics: CPU peak vs shader sector center
  const [centerDeltaDeg, setCenterDeltaDeg] = useState<number | null>(null);
  const lastCenterCheckRef = useRef<number>(0);
  // DriveSync store bindings (shared across panels)
  const ds = useDriveSyncStore();
const res = 256;
  const FORCE_SHOW = false; // DEBUG: set true to ignore gate while debugging

  const { data: live } = useEnergyPipeline({
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
  const { state: nhm2SolveState } = useNhm2SolveState();
  const warpFieldType = live?.warpFieldType ?? live?.dynamicConfig?.warpFieldType ?? "natario";
  const hullPreview = useHullPreviewPayload();
  const [rawPreviewMesh, setRawPreviewMesh] = useState<{
    key: string;
    positions: Float32Array;
    indices: Uint32Array | Uint16Array | null;
    uvs?: Float32Array | null;
    texture?: TexImageSource | null;
    color?: [number, number, number, number];
  } | null>(null);

  const view = useMemo(() => ((live as any)?.view ?? {}), [live]);

  const bubbleStatus = useMemo(() => {
    const raw = (live as any)?.overallStatus;
    if (raw === "CRITICAL" || raw === "WARNING" || raw === "NOMINAL") {
      return raw as "CRITICAL" | "WARNING" | "NOMINAL";
    }
    return undefined;
  }, [live]);
  const hullDimsResolved = useMemo(
    () =>
      resolveHullDimsEffective({
        previewPayload: hullPreview,
        pipelineSnapshot: live as any,
        authorityFallbackDims: nhm2SolveState.geometry.authority,
      }),
    [hullPreview, live, nhm2SolveState.geometry.authority],
  );
  const previewTargetDims = useMemo(
    () =>
      hullDimsResolved
        ? { Lx_m: hullDimsResolved.Lx_m, Ly_m: hullDimsResolved.Ly_m, Lz_m: hullDimsResolved.Lz_m }
        : hullPreview?.targetDims,
    [hullDimsResolved, hullPreview?.targetDims],
  );
  const lastHullDimsSourceRef = useRef<"preview" | "pipeline" | null>(null);
  useEffect(() => {
    const nextSource = hullDimsResolved?.source ?? null;
    const prevSource = lastHullDimsSourceRef.current;
    if (prevSource && nextSource && prevSource !== nextSource) {
      clearLatticeSurfaceCaches();
      clearLatticeSdfCache();
      setSharedLattice(null);
    }
    lastHullDimsSourceRef.current = nextSource;
  }, [hullDimsResolved?.source, setSharedLattice]);
  const wireframeOverlay = useMemo<WireframeOverlayResult>(() => {
    const targetDims = hullDimsResolved
      ? { Lx_m: hullDimsResolved.Lx_m, Ly_m: hullDimsResolved.Ly_m, Lz_m: hullDimsResolved.Lz_m }
      : null;
    return resolveWireframeOverlay(hullPreview, {
      lod: wireframeLod,
      targetDims,
      ...wireframeBudgets,
    });
  }, [hullPreview, wireframeLod, hullDimsResolved, wireframeBudgets]);
  const activeWireframeLod = useMemo(() => {
    if (!hullPreview) return null;
    const lods =
      wireframeLod === "high"
        ? [
            hullPreview.lodFull,
            hullPreview.mesh?.fullLod,
            ...(hullPreview.lods ?? []).filter((lod) => lod?.tag === "full"),
            ...(hullPreview.mesh?.lods ?? []).filter((lod) => lod?.tag === "full"),
          ]
        : [
            hullPreview.lodCoarse,
            hullPreview.mesh?.coarseLod,
            ...(hullPreview.lods ?? []).filter((lod) => lod?.tag === "coarse"),
            ...(hullPreview.mesh?.lods ?? []).filter((lod) => lod?.tag === "coarse"),
          ];
    return (lods.find((lod) => !!lod) as typeof hullPreview.lodFull | typeof hullPreview.lodCoarse | null) ?? null;
  }, [hullPreview, wireframeLod]);
  useEffect(() => {
    const url = hullPreview?.glbUrl;
    if (!url) {
      setRawPreviewMesh(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        let mesh: Mesh | null = null;
        gltf.scene.traverse((child) => {
          if (!mesh && (child as any).isMesh) {
            mesh = child as Mesh;
          }
        });
        if (!mesh) {
          setRawPreviewMesh(null);
          return;
        }
        const meshObj = mesh as Mesh;
        meshObj.updateMatrixWorld(true);
        const geom = (meshObj.geometry as BufferGeometry).clone();
        geom.applyMatrix4(meshObj.matrixWorld);
        const posAttr = geom.getAttribute("position");
        if (!posAttr || !posAttr.array || posAttr.count === 0) {
          setRawPreviewMesh(null);
          geom.dispose();
          return;
        }
        const positions = new Float32Array(posAttr.array as ArrayLike<number>);
        const indexAttr = geom.getIndex();
        const indices = indexAttr
          ? new (indexAttr.array instanceof Uint32Array ? Uint32Array : Uint16Array)(indexAttr.array as any)
          : null;
        const uvAttr = geom.getAttribute("uv");
        const uvs = uvAttr ? new Float32Array(uvAttr.array as ArrayLike<number>) : null;
        const material = Array.isArray(meshObj.material) ? meshObj.material[0] : meshObj.material;
        const mapImage = (material as any)?.map?.image as TexImageSource | undefined;
        const color: [number, number, number, number] | undefined = (material as any)?.color
          ? [
              (material as any).color.r,
              (material as any).color.g,
              (material as any).color.b,
              (material as any).opacity ?? 1,
            ]
          : undefined;
        setRawPreviewMesh({
          key: `glb:${url}`,
          positions,
          indices,
          uvs,
          texture: mapImage ?? null,
          color,
        });
        geom.dispose();
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.warn("[AlcubierrePanel] GLB preview load failed", err);
        setRawPreviewMesh(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hullPreview?.glbUrl]);
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
      if (reason === "overlay:indicesMissing") return "No indices (fallback to rings)";
      return reason;
    });
    return labels.join(", ");
  }, [wireframeOverlay.clampReasons]);
  const { result: fieldProbe, loading: fieldProbeLoading } = useFieldProbe({
    overlay: wireframeOverlay.overlay,
    preview: hullPreview,
    pipeline: live,
    enabled: showWireframeOverlay && useFieldProbeOverlay && !!wireframeOverlay.overlay,
  });
  useEffect(() => {
    const basisRaw = hullPreview?.mesh?.basis ?? hullPreview?.basis;
    const basisResolved =
      wireframeOverlay.overlay?.basis ?? resolveHullBasis(basisRaw, hullPreview?.scale);
    const meshHash = wireframeOverlay.overlay?.meshHash ?? hullPreview?.meshHash ?? hullPreview?.mesh?.meshHash;
    const triangleCount = wireframeOverlay.overlay?.triangleCount ?? activeWireframeLod?.triangleCount;
    const vertexCount = wireframeOverlay.overlay?.vertexCount ?? activeWireframeLod?.vertexCount;
    const clampReasons = wireframeOverlay.clampReasons.length ? wireframeOverlay.clampReasons : undefined;
    const geometrySource = (
      wireframeOverlay.source === "fallback"
        ? "geometric"
        : (hullPreview?.provenance as "preview" | "pipeline" | undefined) ?? "preview"
    );

    setSharedMeshOverlay({
      meshHash,
      provenance: hullPreview?.provenance as "preview" | "pipeline" | undefined,
      geometrySource,
      lod: wireframeLod,
      lodTag: activeWireframeLod?.tag,
      triangleCount,
      vertexCount,
      decimation: activeWireframeLod?.decimation,
      budgets: wireframeBudgets,
      basis: basisRaw ?? undefined,
      basisResolved,
      basisTags: basisRaw,
      clampReasons,
      wireframeEnabled: showWireframeOverlay,
      updatedAt: Date.now(),
    });
  }, [
    activeWireframeLod?.decimation,
    activeWireframeLod?.tag,
    activeWireframeLod?.triangleCount,
    activeWireframeLod?.vertexCount,
    hullPreview?.basis,
    hullPreview?.mesh?.basis,
    hullPreview?.scale,
    hullPreview?.mesh?.meshHash,
    hullPreview?.meshHash,
    hullPreview?.provenance,
    setSharedMeshOverlay,
    showWireframeOverlay,
    wireframeBudgets,
    wireframeLod,
    wireframeOverlay.clampReasons,
    wireframeOverlay.overlay,
    wireframeOverlay.source,
  ]);
  // Lattice frame/volume/SDF building now happens after `syncMode` so the panel can
  // debounce rebuilds and surface guardrails without TDZ dependency hazards.

  // Auto-fill ÃÆ’_sector per operational mode, with server override, when following mode
  useEffect(() => {
    if (!live) return;
    if (!ds.locks?.followMode) return;
    const sigmaS = resolveSigmaSectors(live);
    if (
      Number.isFinite(sigmaS) &&
      Math.abs(sigmaS - ds.sigmaSectors) > 1e-6 &&
      typeof ds.setSigma === "function"
    ) {
      ds.setSigma(sigmaS);
    }
  }, [live, ds.locks?.followMode, ds.sigmaSectors, ds.setSigma]);

  const shaderSources = useMemo(() => (
    shaderMode === "main"
      ? { vert: VERT, frag: FRAG, label: "main" as const }
      : { vert: SAFE_VERT, frag: SAFE_FRAG, label: "safe" as const }
  ), [shaderMode]);

  useEffect(() => {
    hullConfigRef.current = { mode: hullMode, blend: hullBlend };
    if (hullRendererRef.current) {
      hullRendererRef.current.setMode(hullMode, hullBlend);
    }
  }, [hullMode, hullBlend]);

  useEffect(() => {
    if (hullRendererRef.current) {
      hullRendererRef.current.setVolumeViz(hullVolumeVizLive);
    }
  }, [hullVolumeVizLive]);

  useEffect(() => {
    const renderer = hullRendererRef.current;
    if (!renderer) return;
    const splitEnabled = Boolean(ds.splitEnabled);
    const splitFrac =
      typeof ds.splitFrac === "number" && Number.isFinite(ds.splitFrac) ? ds.splitFrac : 0.5;
    const bias = splitEnabled ? Math.abs(splitFrac - 0.5) : 0;
    const biasMag = Math.min(1, bias / 0.49);
    const planarMag = vizIntentEnabled ? Math.max(0, Math.min(1, vizPlanar)) : 0;
    const mag01 = planarMag > 1e-4 ? planarMag : biasMag;
    const rise01 = vizIntentEnabled ? vizRise : 0;
    const enabled = vizIntentEnabled && (mag01 > 1e-4 || Math.abs(rise01) > 1e-4);
    renderer.setVizIntent({
      enabled,
      mag01,
      rise01: Math.max(-1, Math.min(1, rise01)),
    });
  }, [vizIntentEnabled, vizRise, vizPlanar, ds.splitEnabled, ds.splitFrac]);

  const handleHullBlendChange = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    setHullBlend(clamped);
    if (clamped <= 0.02) {
      setHullMode("instant");
    } else if (clamped >= 0.98) {
      setHullMode("average");
    } else {
      setHullMode("blend");
    }
  }, [setHullMode]);

  useEffect(() => {
    const overrides: Hull3DQualityOverrides = {
      voxelDensity: hullVoxelDensity,
      raySteps: hullRayStepsMax ?? undefined,
      stepBias: hullStepBias ?? undefined,
    };
    hullQualityOverridesRef.current = overrides;
    if (hullRendererRef.current) {
      hullRendererRef.current.setQuality(hullQuality, overrides);
    }
  }, [hullQuality, hullVoxelDensity, hullRayStepsMax, hullStepBias]);

  // Live parameters (safe defaults)
  const beta  = useMemo(() => resolveBeta(live), [live]);
  const sigma = useMemo(() => Math.max(1e-6, fnum(live?.sigma ?? 6.0, 6.0)), [live]);
  const R     = useMemo(() => {
    if (hullDimsResolved) {
      const maxDim = Math.max(hullDimsResolved.Lx_m, hullDimsResolved.Ly_m, hullDimsResolved.Lz_m);
      return Math.max(1e-3, maxDim * 0.5);
    }
    const a = Math.max(1e-3, fnum(live?.hull?.a, 1));
    const b = Math.max(1e-3, fnum(live?.hull?.b, 1));
    const c = Math.max(1e-3, fnum(live?.hull?.c, 1));
    return Math.max(a, b, c);
  }, [hullDimsResolved, live]);
  const hullDomainScale = useMemo(() => {
    const base = hullVolumeDomain === "bubbleBox"
      ? (bubbleBoundsMode === "tight" ? 1.08 : 1.65)
      : 1.3;
    const scaled = base * R;
    return clamp(scaled, 0.85 * R, 2.2 * R);
  }, [bubbleBoundsMode, hullVolumeDomain, R]);

  // Engineering Ã¢â‚¬Å“amplitude chainÃ¢â‚¬Â used only in Drive mode
  const ampChain = useMemo(() => {
    // Broaden gamma fallback chain (visual -> mass -> legacy keys)
    const g = Math.max(1, fnum(live?.gammaGeo, 26));
    const q = Math.max(1e-9, fnum(live?.qSpoilingFactor ?? live?.q ?? live?.qSpoil ?? live?.qCavity, 1));
    const gammaV = Math.max(1,
      fnum(
        live?.gammaVanDenBroeck_vis ??
        live?.gammaVdB_vis ??
        live?.gammaVdB ??
        live?.gammaVanDenBroeck_mass ??
        live?.gammaVanDenBroeck ??
        live?.gamma_vdb,
        // Use a sane default when ?_VdB is absent to avoid runaway estimates
        1
      )
    );
    return Math.pow(g,3) * q * gammaV;
  }, [live]);

  const dutyFRRaw = useMemo(() => {
    const dRaw = fnum(
      live?.dutyEffectiveFR ??
      live?.dutyEffective_FR ??
      live?.dutyShip ??
      live?.dutyFR ??
      live?.dutyCycle,
      0
    );
    return Math.max(0, dRaw);
  }, [live]);

  const exoticMassNow = useMemo(() => {
    const mass = fnum(
      (live as any)?.M_exotic ??
      (live as any)?.M_exotic_kg ??
      (live as any)?.exoticMass_kg ??
      (live as any)?.exoticMass,
      NaN
    );
    return Number.isFinite(mass) && mass > 0 ? mass : undefined;
  }, [live]);

  const exoticMassTarget = useMemo(() => {
    const mass = fnum(
      (live as any)?.exoticMassTarget_kg ??
      (live as any)?.exoticMassTarget ??
      (live as any)?.M_target ??
      (live as any)?.M_target_kg,
      NaN
    );
    return Number.isFinite(mass) && mass > 0 ? mass : undefined;
  }, [live]);

  const dFRViewMin = useMemo(() => {
    const cand = Number((view as any)?.dFR_view_min);
    return Number.isFinite(cand) && cand >= 0 ? cand : 1e-4;
  }, [view]);

  const vizFloorDefaults = useMemo(() => {
    const safe = (val: any, fallback: number) => {
      const n = Number(val);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    return {
      thetaGR: safe((view as any)?.vizFloorThetaGR, 1e-9),
      rhoGR: safe((view as any)?.vizFloorRhoGR, 1e-18),
      thetaDrive: safe((view as any)?.vizFloorThetaDrive, 1e-6),
    };
  }, [view]);

  const [vizFloors, setVizFloors] = useState(() => vizFloorDefaults);

  useEffect(() => {
    setVizFloors((prev) => ({
      thetaGR: Number.isFinite(prev.thetaGR) && prev.thetaGR > 0 ? prev.thetaGR : vizFloorDefaults.thetaGR,
      rhoGR: Number.isFinite(prev.rhoGR) && prev.rhoGR > 0 ? prev.rhoGR : vizFloorDefaults.rhoGR,
      thetaDrive: Number.isFinite(prev.thetaDrive) && prev.thetaDrive > 0 ? prev.thetaDrive : vizFloorDefaults.thetaDrive,
    }));
  }, [vizFloorDefaults]);
  const applyDriveCardPreset = useCallback(() => {
    setHullVolumeVizLive("theta_drive");
    setPlanarVizMode(3);
    setGateViewEnabled(true);
    setGateSource("combined");
    setForceFlatGate(false);
    setSharedPalette({ id: "diverging", encodeBetaSign: true, legend: true });
    setVizFloors({
      thetaGR: 1e-9,
      rhoGR: 1e-18,
      thetaDrive: 1e-6,
    });
  }, [
    setForceFlatGate,
    setGateSource,
    setGateViewEnabled,
    setHullVolumeVizLive,
    setPlanarVizMode,
    setSharedPalette,
    setShowHullSectorRing,
    setShowHullSurfaceOverlay,
  ]);
  const applyGeoVisThetaPreset = useCallback(() => {
    setHullVolumeVizLive(GEO_VIS_THETA_PRESET.hullVolumeViz);
    setPlanarVizMode(GEO_VIS_THETA_PRESET.planarVizMode);
    setUserVizLocked(true);
    setThetaSign(GEO_VIS_THETA_PRESET.thetaSign);
    setSharedPalette(GEO_VIS_THETA_PRESET.palette);
    setShowThetaIsoOverlay(GEO_VIS_THETA_PRESET.showThetaIsoOverlay);
  }, [
    setHullVolumeVizLive,
    setPlanarVizMode,
    setSharedPalette,
    setShowThetaIsoOverlay,
    setThetaSign,
    setUserVizLocked,
  ]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => applyDriveCardPreset();
    window.addEventListener("helix:drive-card-preset" as any, handler as any);
    return () => window.removeEventListener("helix:drive-card-preset" as any, handler as any);
  }, [applyDriveCardPreset]);

  const gateRaw = useMemo(() => {
    if (FORCE_SHOW) return 1;
    const g = Math.sqrt(dutyFRRaw);
    return Number.isFinite(g) ? g : 0;
  }, [dutyFRRaw]);

  const gate = useMemo(() => {
    if (FORCE_SHOW) return 1;
    const g = Math.sqrt(Math.max(dutyFRRaw, dFRViewMin));
    return Number.isFinite(g) ? g : 0;
  }, [dutyFRRaw, dFRViewMin]);

  const gateView = useMemo(() => {
    if (FORCE_SHOW) return 1;
    if (!gateViewEnabled) return 0;
    return gate;
  }, [gateViewEnabled, gate]);

  const dutyFR = useMemo(() => {
    const d = Math.max(0, Math.min(1, dutyFRRaw));
    return Number.isFinite(d) ? d : 0;
  }, [dutyFRRaw]);

  // ---- sector gating (f and w) ------------------------------------------------
  // Canonical sectorization from pipeline: total = sectorCount|sectorsTotal, live = sectors|sectorsConcurrent
  const totalSectors = useMemo(() => Math.max(1, fnum(
    (live as any)?.sectorsTotal ?? (live as any)?.sectorCount ?? (live as any)?.totalSectors, 400
  )), [live]);
  const liveSectors = useMemo(() => Math.max(1, fnum(
    // include common API aliases
    (live as any)?.sectors ??
    (live as any)?.sectorsConcurrent ??
    (live as any)?.concurrentSectors ??
    (live as any)?.activeSectors ??
    (live as any)?.S_live ??
    (live as any)?.liveSectors, 1
  )), [live]);
  const fActive = useMemo(() => {
    const activeFracRaw = fnum(
      (live as any)?.activeFraction ??
      (live as any)?.tiles?.activeFraction ??
      (live as any)?.tiles?.fActive,
      Number.NaN
    );
    if (Number.isFinite(activeFracRaw) && activeFracRaw > 0) {
      return Math.max(1e-6, Math.min(1, activeFracRaw));
    }
    const activeTiles = fnum(
      (live as any)?.activeTiles ??
      (live as any)?.tiles?.active ??
      (live as any)?.tiles?.activeTiles,
      Number.NaN
    );
    const totalTiles = fnum(
      (live as any)?.tiles?.total ??
      (live as any)?.N_tiles ??
      (live as any)?.tiles?.tiles ??
      (live as any)?.tiles?.totalTiles,
      Number.NaN
    );
    if (Number.isFinite(activeTiles) && Number.isFinite(totalTiles) && totalTiles > 0) {
      return Math.max(1e-6, Math.min(1, activeTiles / Math.max(1, totalTiles)));
    }
    const activeSectorsRaw = fnum(
      (live as any)?.activeSectors ??
      (live as any)?.sectorsConcurrent ??
      (live as any)?.concurrentSectors,
      Number.NaN
    );
    if (Number.isFinite(activeSectorsRaw) && totalSectors > 0) {
      const frac = Math.max(1 / totalSectors, activeSectorsRaw / totalSectors);
      return Math.max(frac, Math.max(0, Math.min(1, dutyFR)));
    }
    const base = Math.max(1 / totalSectors, liveSectors / totalSectors);
    return Math.max(base, dutyFR);
  }, [live, dutyFR, liveSectors, totalSectors]);
  const hullSurfaceMesh = useMemo(
    () =>
      resolveHullSurfaceMesh(hullPreview, {
        lod: wireframeLod,
        targetDims: previewTargetDims ?? null,
        totalSectors,
      }),
    [hullPreview, wireframeLod, previewTargetDims, totalSectors],
  );
  const previewMeshFromGlb = useMemo<HullPreviewMeshPayload | null>(() => {
    if (!rawPreviewMesh) return null;
    const targetDims = previewTargetDims ?? undefined;
    const transformed = applyHullBasisToPositions(rawPreviewMesh.positions, {
      basis: hullPreview?.mesh?.basis ?? hullPreview?.basis,
      extraScale: hullPreview?.scale,
      targetDims: targetDims ?? undefined,
    });
    const dimsSig = targetDims
      ? `${targetDims.Lx_m.toFixed(4)}|${targetDims.Ly_m.toFixed(4)}|${targetDims.Lz_m.toFixed(4)}`
      : "dims:none";
    const basisSig = latticeBasisSignature(transformed.basis);
    return {
      key: [rawPreviewMesh.key, basisSig, dimsSig].join("|"),
      positions: transformed.positions,
      indices: rawPreviewMesh.indices ?? null,
      uvs: rawPreviewMesh.uvs ?? null,
      texture: rawPreviewMesh.texture ?? null,
      color: rawPreviewMesh.color ?? [0.88, 0.92, 0.96, 0.95],
    };
  }, [rawPreviewMesh, hullPreview?.mesh?.basis, hullPreview?.basis, hullPreview?.scale, previewTargetDims]);
  const previewMeshForRenderer = useMemo<HullPreviewMeshPayload | null>(
    () => previewMeshFromGlb,
    [previewMeshFromGlb],
  );

  // sector "boost" term (visibility of a single active arc): Ã¢Ë†Å¡(w/f)
  const tilesPerSectorVector = useMemo(() => {
    const raw =
      (live as any)?.tilesPerSectorVector ??
      (live as any)?.tilesPerSector ??
      (live as any)?.tiles?.perSector;
    let vec: number[] | undefined;
    if (Array.isArray(raw)) {
      vec = raw as number[];
    } else if (raw && ArrayBuffer.isView(raw as ArrayBufferView)) {
      vec = Array.from(raw as ArrayLike<number>);
    }
    if (!vec || vec.length === 0) return undefined;
    const filtered = vec
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 0);
    return filtered.length ? filtered : undefined;
  }, [live]);

  const boostWF = useMemo(() => Math.sqrt(Math.max(1e-12, 1 / fActive)), [fActive]);

  // --- track canvas aspect so camera fits accurately
  const [aspect, setAspect] = useState(16 / 9);

  // Viewer axes (hull aspect)
  const axes = useMemo<[number, number, number]>(() => {
    if (hullDimsResolved) {
      return [
        Math.max(1e-3, hullDimsResolved.Lx_m * 0.5),
        Math.max(1e-3, hullDimsResolved.Ly_m * 0.5),
        Math.max(1e-3, hullDimsResolved.Lz_m * 0.5),
      ];
    }
    return [fnum(live?.hull?.a, 1), fnum(live?.hull?.b, 1), fnum(live?.hull?.c, 1)] as [number, number, number];
  }, [hullDimsResolved, live]);
  const hullObb = useMemo(() => {
    const previewObb = hullPreview?.mesh?.obb ?? hullPreview?.obb;
    if (previewObb) return previewObb;
    const basis = hullDimsResolved?.basis;
    return {
      center: [0, 0, 0] as [number, number, number],
      halfSize: axes,
      axes: basis
        ? ([basis.right, basis.up, basis.forward] as [
            [number, number, number],
            [number, number, number],
            [number, number, number],
          ])
        : undefined,
    };
  }, [axes, hullDimsResolved, hullPreview]);
  const cardCameraMinRadius = useMemo(() => {
    if (cardCameraPreset === "inside") return 0;
    if (cardCameraPreset === "wallGrazing") return Math.max(R * 1.1, 3);
    if (cardCameraPreset === "outside") return Math.max(R * 6.0, 18);
    return Math.max(R * 4.2, 12);
  }, [cardCameraPreset, R]);
  const cardCameraFrame = useMemo(
    () =>
      frameCardCameraToObb({
        preset: cardCameraPreset,
        obb: hullObb,
        halfSize: axes,
        domainScale: hullDomainScale,
        basis: hullDimsResolved?.basis ?? null,
        fov_deg: 45,
        minRadius: cardCameraMinRadius,
        yawOffset_rad: followHullPhase ? (ds.phase01 ?? 0) * Math.PI * 2 : 0,
      }),
    [R, axes, cardCameraMinRadius, cardCameraPreset, ds.phase01, followHullPhase, hullDimsResolved?.basis, hullDomainScale, hullObb],
  );

  useEffect(() => {
    setViewer({
      planarVizMode,
      volumeViz: hullVolumeVizLive,
      volumeDomain: hullVolumeDomain,
      volumeSource,
      opacityWindow: bubbleOpacityWindow,
      boundsProfile: bubbleBoundsMode,
      vizFloors,
      gateSource,
      gateView: gateViewEnabled,
      forceFlatGate,
      qualityPreset: hullQuality,
      qualityOverrides: hullQualityOverridesRef.current,
      profileTag: viewerProfileTag,
      bounds: { axes, aspect, domainScale: hullDomainScale, basis: hullDimsResolved?.basis },
      palette: sharedPaletteState,
      camera: cardCameraFrame,
    });
  }, [
    cardCameraFrame,
    setViewer,
    planarVizMode,
    hullVolumeVizLive,
    hullVolumeVizLive,
    vizFloors,
    gateSource,
    gateViewEnabled,
    forceFlatGate,
    hullQuality,
    hullRayStepsMax,
    hullStepBias,
    hullVoxelDensity,
    viewerProfileTag,
    axes,
    aspect,
    sharedPaletteState,
    R,
    hullDomainScale,
    hullVolumeDomain,
    volumeSource,
    bubbleOpacityWindow,
    bubbleBoundsMode,
  ]);

  const hullRadiusLUT = useMemo(() => {
    const radial = (live as any)?.hull?.radialLUT ?? (live as any)?.hull?.radialLut;
    if (!radial) return null;
    const sizeRaw = (radial as any).size ?? (radial as any).dims ?? (radial as any).dim;
    const width = Number((radial as any).width ?? (radial as any).w ?? sizeRaw?.[0]);
    const height = Number((radial as any).height ?? (radial as any).h ?? sizeRaw?.[1]);
    const dataRaw = (radial as any).data ?? (radial as any).values ?? null;
    if (!(width > 0 && height > 0 && dataRaw)) return null;
    const len = width * height;
    let data: Float32Array | null = null;
    if (dataRaw instanceof Float32Array && dataRaw.length >= len) {
      data = dataRaw;
    } else if (Array.isArray(dataRaw) && dataRaw.length >= len) {
      data = new Float32Array((dataRaw as number[]).slice(0, len));
    }
    if (!data) return null;
    const maxRRaw = (radial as any).maxR ?? (radial as any).hullMaxR;
    const maxR = Number.isFinite(maxRRaw) ? (maxRRaw as number) : undefined;
    return { data, size: [width, height] as [number, number], maxR };
  }, [live]);

  const hullSdf = useMemo(() => {
    const parseSdf = (sdf: any) => {
      if (!sdf) return null;
      const sizeRaw = (sdf as any).size ?? (sdf as any).dims ?? (sdf as any).dim ?? (sdf as any).shape;
      const nx = Number((sdf as any).nx ?? sizeRaw?.[0]);
      const ny = Number((sdf as any).ny ?? sizeRaw?.[1]);
      const nz = Number((sdf as any).nz ?? sizeRaw?.[2]);
      if (!(nx > 0 && ny > 0 && nz > 0)) return null;
      const len = nx * ny * nz;
      const dataRaw = (sdf as any).data ?? (sdf as any).values ?? (sdf as any).grid;
      let data: Float32Array | Uint8Array | null = null;
      let format: "float" | "byte" = "float";
      if (dataRaw instanceof Float32Array && dataRaw.length >= len) {
        data = dataRaw;
        format = "float";
      } else if (dataRaw instanceof Uint8Array && dataRaw.length >= len) {
        data = dataRaw;
        format = "byte";
      } else if (Array.isArray(dataRaw) && dataRaw.length >= len) {
        data = new Float32Array((dataRaw as number[]).slice(0, len));
        format = "float";
      }
      if (!data) return null;
      const boundsRaw = (sdf as any).bounds ?? (sdf as any).extents ?? (sdf as any).radius ?? null;
      const bounds: [number, number, number] | undefined =
        Array.isArray(boundsRaw) && boundsRaw.length >= 3
          ? [Math.abs(boundsRaw[0] ?? 0), Math.abs(boundsRaw[1] ?? 0), Math.abs(boundsRaw[2] ?? 0)] as [number, number, number]
          : undefined;
      const bandRaw =
        (sdf as any).band ?? (sdf as any).shellWidth ?? (sdf as any).wallWidth ??
        (sdf as any).band_m ?? (sdf as any).bandMeters;
      const band = Number.isFinite(bandRaw as number) ? (bandRaw as number) : undefined;
      return { data, dims: [nx, ny, nz] as [number, number, number], bounds, band, format };
    };

    const liveSdf = parseSdf((live as any)?.hull?.sdf ?? (live as any)?.hull?.SDF);
    if (liveSdf) return liveSdf;

    const latticeSdf = sharedLatticeState?.sdf ?? null;
    if (latticeSdf && latticeSdf.dims?.length === 3) {
      const [nx, ny, nz] = latticeSdf.dims;
      if (nx > 0 && ny > 0 && nz > 0 && latticeSdf.distances?.length) {
        return {
          data: latticeSdf.distances,
          dims: [nx, ny, nz] as [number, number, number],
          bounds: latticeSdf.bounds,
          band: latticeSdf.band,
          format: "float" as const,
        };
      }
    }

    return null;
  }, [live, sharedLatticeState?.sdf]);

  const hullRadiusMax = useMemo(() => {
    const sdfBound = hullSdf?.bounds
      ? Math.max(Math.abs(hullSdf.bounds[0] ?? 0), Math.abs(hullSdf.bounds[1] ?? 0), Math.abs(hullSdf.bounds[2] ?? 0))
      : null;
    const dimsRadius = hullDimsResolved
      ? Math.max(hullDimsResolved.Lx_m, hullDimsResolved.Ly_m, hullDimsResolved.Lz_m) * 0.5
      : null;
    const liveRadius = (() => {
      const a = Math.max(1e-3, fnum(live?.hull?.a, 1));
      const b = Math.max(1e-3, fnum(live?.hull?.b, 1));
      const c = Math.max(1e-3, fnum(live?.hull?.c, 1));
      return Math.max(a, b, c);
    })();
    const candidates = [sdfBound, dimsRadius, liveRadius, R].filter((v) => Number.isFinite(v as number) && (v as number) > 0) as number[];
    return candidates.length ? Math.max(...candidates) : 1.0;
  }, [hullSdf?.bounds, hullDimsResolved, live, R]);

  const fieldProbeColors = useMemo(() => {
    if (!useFieldProbeOverlay || !fieldProbe?.values?.length) return null;
    const { colors } = colorizeFieldProbe(fieldProbe.values, { absMax: fieldProbe.stats?.absMax });
    return colors;
  }, [fieldProbe?.stats?.absMax, fieldProbe?.values, useFieldProbeOverlay]);

  useEffect(() => {
    if (geometryUserOverrideRef.current) return;
    let next: HullGeometryMode | null = null;
    let reason: string | null = null;
    if (hullSdf) {
      next = "sdf";
      const dims = hullSdf.dims ? `${hullSdf.dims[0]}x${hullSdf.dims[1]}x${hullSdf.dims[2]}` : null;
      reason = `Auto: hull SDF${dims ? ` (${dims})` : ""}`;
    } else if (hullRadiusLUT) {
      next = "radial";
      const size = hullRadiusLUT.size ? `${hullRadiusLUT.size[0]}x${hullRadiusLUT.size[1]}` : null;
      reason = `Auto: radial LUT${size ? ` (${size})` : ""}`;
    } else {
      next = "ellipsoid";
    }
    if (next && next !== hullGeometry) {
      setHullGeometry(next);
      setAutoHullGeometryReason(reason);
    } else if (next === hullGeometry) {
      setAutoHullGeometryReason(reason);
    }
  }, [hullSdf, hullRadiusLUT, hullGeometry, live]);

  const hullDimsEffective = useMemo<[number, number, number]>(() => {
    const base: [number, number, number] = hullDimsResolved
      ? [
          Math.max(Math.abs(hullDimsResolved.Lx_m), 1e-3),
          Math.max(Math.abs(hullDimsResolved.Ly_m), 1e-3),
          Math.max(Math.abs(hullDimsResolved.Lz_m), 1e-3),
        ]
      : [
          Math.max(Math.abs(axes[0]) * R * 2, 1e-3),
          Math.max(Math.abs(axes[1]) * R * 2, 1e-3),
          Math.max(Math.abs(axes[2]) * R * 2, 1e-3),
        ];
    if (hullGeometry !== "ellipsoid") {
      const candidates = [...base];
      const maxR = hullRadiusLUT?.maxR;
      const maxSdfBound = hullSdf?.bounds
        ? Math.max(Math.abs(hullSdf.bounds[0]), Math.max(Math.abs(hullSdf.bounds[1]), Math.abs(hullSdf.bounds[2])))
        : undefined;
      if (Number.isFinite(maxSdfBound)) candidates.push((maxSdfBound as number) * 2);
      if (Number.isFinite(maxR)) candidates.push((maxR as number) * 2);
      const diameter = candidates.length ? Math.max(...candidates) : Math.max(...base);
      return [diameter, diameter, diameter];
    }
    return base;
  }, [axes, R, hullGeometry, hullRadiusLUT, hullSdf, hullDimsResolved]);

  const wireframeOverlayForRenderer = useMemo(() => {
    if (!showWireframeOverlay) return null;
    if (!wireframeOverlay.overlay) return null;
    if (useFieldProbeOverlay && fieldProbeColors) {
      return {
        ...wireframeOverlay.overlay,
        colors: fieldProbeColors,
        colorMode: "field" as const,
        colorSignature: fieldProbe?.meta?.cache?.key ?? `${wireframeOverlay.overlay.key}|field`,
        patches: fieldProbe?.patches ?? wireframeOverlay.overlay.patches,
        fieldThreshold: fieldProbe?.fieldThreshold ?? wireframeOverlay.overlay.fieldThreshold,
        gradientThreshold: fieldProbe?.gradientThreshold ?? wireframeOverlay.overlay.gradientThreshold,
        fieldStats: fieldProbe?.stats,
      };
    }
    return wireframeOverlay.overlay;
  }, [
    fieldProbe?.fieldThreshold,
    fieldProbe?.gradientThreshold,
    fieldProbe?.meta?.cache?.key,
    fieldProbe?.patches,
    fieldProbe?.stats,
    fieldProbeColors,
    showWireframeOverlay,
    useFieldProbeOverlay,
    wireframeOverlay.overlay,
  ]);

  const sectorPeriodMs = useMemo(() => {
    const cand = (live as any) ?? {};
    const v = fnum(
      cand?.sectorPeriod_ms ??
      cand?.sectorPeriodMs ??
      cand?.sectorPeriod ??
      (Number.isFinite(cand?.dwell_ms) ? cand?.dwell_ms : undefined),
      12.0
    );
    return Math.max(1e-3, v);
  }, [live]);

  const freqGHz = useMemo(() => {
    const cand = (live as any) ?? {};
    const v = fnum(
      cand?.freqGHz ??
      cand?.frequency_GHz ??
      cand?.modulationFreq_GHz ??
      cand?.tileFreq_GHz,
      15
    );
    return Math.max(0.01, v);
  }, [live]);

  const currentSector = useMemo(() => {
    const candidates = [
      (live as any)?.sectorIdx,
      (live as any)?.sectorIndex,
      (live as any)?.sectorPointer,
      (live as any)?.currentSector,
    ];
    const total = Math.max(1, totalSectors);
    for (const cand of candidates) {
      const n = Number(cand);
      if (Number.isFinite(n)) {
        const wrap = ((n % total) + total) % total;
        return wrap;
      }
    }
    return 0;
  }, [live, totalSectors]);

  const wallWidth_m = useMemo(() => {
    const candidates = [
      (live as any)?.wallWidth_m,
      (live as any)?.hull?.wallWidth_m,
      (live as any)?.wallWidth,
    ];
    for (const cand of candidates) {
      const n = Number(cand);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 1.0;
  }, [live]);

  const lightLoop = useLightCrossingLoop({
    sectorStrobing: totalSectors,
    currentSector,
    sectorPeriod_ms: sectorPeriodMs,
    duty: dutyFR,
    freqGHz,
    hull: { a: axes[0], b: axes[1], c: axes[2] },
    wallWidth_m,
    localBurstFrac: resolveBurstFrac(live),
  });

  const loopSectorCount = Math.max(1, lightLoop.sectorCount || totalSectors);
  const loopSectorIdx = Number.isFinite(lightLoop.sectorIdx) ? lightLoop.sectorIdx : 0;
  const loopPhase = Number.isFinite(lightLoop.phase) ? lightLoop.phase : 0;
  const loopPhaseTotal = Math.max(1, loopSectorCount);
  const loopPhaseCycle = loopSectorIdx + loopPhase;
  const loopPhase01 = wrap01(loopPhaseCycle / loopPhaseTotal);

  useEffect(() => {
    const handlePhase = (payload: any) => {
      const phaseRaw = Number(payload?.phase01);
      if (!Number.isFinite(phaseRaw)) return;
      const wrapped = wrap01(phaseRaw);
      const contRaw = Number(payload?.phaseCont);
      const phaseCont = Number.isFinite(contRaw) ? contRaw : wrapped;
      const signRaw = Number(payload?.phaseSign);
      const sectorsRaw = Number(payload?.sectorsTotal);
      const total = Number.isFinite(sectorsRaw) && sectorsRaw > 0
        ? Math.max(1, Math.floor(sectorsRaw))
        : totalSectors;
      const wedgeIndex = Math.min(total - 1, Math.max(0, Math.floor(wrapped * total) % total));
      const nextIndex = total > 0 ? (wedgeIndex + 1) % total : wedgeIndex;
      const sourceRaw = typeof payload?.source === "string" ? payload.source.toLowerCase() : "";
      const mappedSource =
        sourceRaw === "scroll" ? "scroll"
        : sourceRaw === "metrics" ? "metrics"
        : sourceRaw === "server" ? "server"
        : "bus";
      setSharedPhase({
        mode: "auto",
        source: mappedSource,
        phase01: wrapped,
        phaseCont,
        sign: signRaw === -1 ? -1 : 1,
        wedgeIndex,
        nextWedgeIndex: nextIndex,
      });
      const tsecRaw = Number(payload?.Tsec_ms ?? payload?.tSec_ms ?? payload?.tsec_ms);
      const pumpPhaseRaw = Number(payload?.pumpPhase_deg ?? payload?.pumpPhaseDeg ?? payload?.pumpPhase);
      const tauLcRaw = Number(
        payload?.tauLC_ms ??
        payload?.tauLc_ms ??
        payload?.tau_lc_ms
      );
      const sectorIdxRaw = Number(
        payload?.sectorIdx ??
        payload?.sectorIndex ??
        payload?.sector ??
        wedgeIndex
      );
      const timestampRaw = Number(payload?.timestamp ?? payload?.ts ?? payload?.t);
      setBusPhasePayload((prev) => {
        const next = {
          phase01: wrapped,
          phaseCont,
          tsec_ms: Number.isFinite(tsecRaw) ? tsecRaw : undefined,
          pumpPhase_deg: Number.isFinite(pumpPhaseRaw) ? pumpPhaseRaw : undefined,
          tauLC_ms: Number.isFinite(tauLcRaw) ? Math.max(0, tauLcRaw) : undefined,
          sectorIndex: Number.isFinite(sectorIdxRaw) ? Math.max(0, Math.floor(sectorIdxRaw)) : undefined,
          source: mappedSource,
          timestamp: Number.isFinite(timestampRaw) ? timestampRaw : Date.now(),
        };
        if (
          prev &&
          prev.phase01 === next.phase01 &&
          prev.phaseCont === next.phaseCont &&
          prev.tsec_ms === next.tsec_ms &&
          prev.pumpPhase_deg === next.pumpPhase_deg &&
          prev.tauLC_ms === next.tauLC_ms &&
          prev.sectorIndex === next.sectorIndex &&
          prev.source === next.source
        ) {
          return prev;
        }
        return next;
      });
    };
    const stableId = subscribe("warp:phase:stable", handlePhase);
    const legacyId = subscribe("warp:phase", handlePhase);
    return () => {
      if (stableId) unsubscribe(stableId);
      if (legacyId) unsubscribe(legacyId);
    };
  }, [setSharedPhase, setBusPhasePayload, totalSectors]);

  useEffect(() => {
    if (followHullPhase) return;
    const dwellMsRaw = Number(lightLoop.dwell_ms);
    const dwell = Number.isFinite(dwellMsRaw) && dwellMsRaw > 0 ? dwellMsRaw : 1;
    const burstMsRaw = Number(lightLoop.burst_ms);
    const burst = Number.isFinite(burstMsRaw) ? Math.max(0, burstMsRaw) : 0;
    const burstFrac = Math.min(1, Math.max(0, burst / dwell));
    const half = burstFrac * 0.5;
    const windowStart = Math.max(0, 0.5 - half);
    const windowEnd = Math.min(1, 0.5 + half);
    setSharedPhase({
      mode: "auto",
      source: "time",
      phase01: loopPhase01,
      phaseCont: loopPhaseCycle,
      sign: 1,
      wedgeIndex: ((loopSectorIdx % loopPhaseTotal) + loopPhaseTotal) % loopPhaseTotal,
      nextWedgeIndex: ((loopSectorIdx + 1) % loopPhaseTotal + loopPhaseTotal) % loopPhaseTotal,
      dutyWindow: [windowStart, windowEnd],
      damp: 0.15,
    });
  }, [
    setSharedPhase,
    loopPhase01,
    loopPhaseCycle,
    loopPhaseTotal,
    loopSectorIdx,
    lightLoop.dwell_ms,
    lightLoop.burst_ms,
    followHullPhase,
  ]);

  const busPhase01 = Number.isFinite(sharedPhase?.phase01) ? sharedPhase.phase01 : null;
  const busPhaseCont = Number.isFinite(sharedPhase?.phaseCont) ? sharedPhase.phaseCont : null;
  const busPhaseSource = sharedPhase?.source ?? "time";
  const busPhaseUpdatedAt = Number.isFinite(sharedPhase?.updatedAt ?? NaN)
    ? sharedPhase?.updatedAt
    : undefined;

  useEffect(() => {
    if (busPhaseCont == null || !Number.isFinite(loopPhaseCycle)) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastPhaseSampleTimeRef.current < PHASE_HISTORY_SAMPLE_MS) {
      if (
        lastBusPhaseSampleRef.current !== null &&
        lastLoopPhaseSampleRef.current !== null &&
        Math.abs(busPhaseCont - lastBusPhaseSampleRef.current) < 1e-6 &&
        Math.abs(loopPhaseCycle - lastLoopPhaseSampleRef.current) < 1e-6
      ) {
        return;
      }
    } else {
      lastPhaseSampleTimeRef.current = now;
    }
    const pushHistory = (ref: React.MutableRefObject<number[]>, value: number) => {
      const history = ref.current;
      history.push(value);
      if (history.length > MAX_PHASE_HISTORY) {
        history.splice(0, history.length - MAX_PHASE_HISTORY);
      }
    };
    pushHistory(busPhaseHistoryRef, busPhaseCont);
    pushHistory(loopPhaseHistoryRef, loopPhaseCycle);
    lastBusPhaseSampleRef.current = busPhaseCont;
    lastLoopPhaseSampleRef.current = loopPhaseCycle;
    setPhaseHistoryTick((tick) => (tick + 1) % 1_000_000);
  }, [busPhaseCont, loopPhaseCycle]);

  const phaseSparkline = useMemo(() => {
    const loopHistory = loopPhaseHistoryRef.current;
    const busHistory = busPhaseHistoryRef.current;
    const len = Math.min(loopHistory.length, busHistory.length);
    if (len < 2) return null;
    const loopSlice = loopHistory.slice(-len);
    const busSlice = busHistory.slice(-len);
    const minVal = Math.min(...loopSlice, ...busSlice);
    const maxVal = Math.max(...loopSlice, ...busSlice);
    const range = Math.max(maxVal - minVal, 1e-6);
    const width = 120;
    const height = 28;
    const buildPath = (series: number[]) =>
      series
        .map((value, idx) => {
          const x = (idx / (len - 1)) * width;
          const norm = (value - minVal) / range;
          const y = height - norm * height;
          return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
    return {
      width,
      height,
      loopPath: buildPath(loopSlice),
      busPath: buildPath(busSlice),
    };
  }, [phaseHistoryTick]);

  const busPhaseSummary = useMemo(() => {
    const loopText = `Loop f=${loopPhase01.toFixed(3)} cyc`;
    if (busPhase01 == null) {
      return {
        text: `${loopText} | Bus f=--`,
        busText: "Bus f=--",
        loopText,
        deltaText: "--",
        diffCycles: null as number | null,
        title: "Bus phase not yet received",
      };
    }
    const diffCycles = smallestPhaseDelta(busPhase01, loopPhase01);
    const diffText =
      diffCycles == null
        ? "--"
        : `${diffCycles >= 0 ? "+" : "-"}${Math.abs(diffCycles).toFixed(2)} cyc`;
    const busText = `Bus f=${busPhase01.toFixed(3)} cyc${
      busPhaseCont != null ? ` (cont ${busPhaseCont.toFixed(2)})` : ""
    }`;
    return {
      text: `${busText} | ?f=${diffText} | ${loopText}`,
      busText,
      loopText,
      deltaText: diffText,
      diffCycles,
      title: `Bus f=${(busPhase01 * 360).toFixed(1)}Â°, Loop f=${(loopPhase01 * 360).toFixed(
        1
      )}Â°, Bus cont=${busPhaseCont != null ? busPhaseCont.toFixed(3) : "--"} cyc`,
    };
  }, [busPhase01, busPhaseCont, loopPhase01]);

  const phaseDiffIndicator = useMemo(() => {
    if (busPhaseSummary.diffCycles == null) return null;
    const diffCycles = busPhaseSummary.diffCycles;
    const diffAbs = Math.abs(diffCycles);
    const relation =
      diffAbs < 0.005 ? "aligned" : diffCycles > 0 ? "ahead" : "behind";
    const text =
      relation === "aligned"
        ? "Bus aligned Â±0.01 cycles"
        : `Bus ${relation} by ${diffAbs.toFixed(2)} cycles`;
    const highlight = diffAbs >= BUS_PHASE_DIFF_THRESHOLD;
    const className = highlight
      ? "bg-amber-900/70 text-amber-200 ring-1 ring-amber-400/60"
      : "bg-emerald-900/50 text-emerald-200/90";
    const title = `Loop f=${loopPhase01.toFixed(4)} cyc Â· Bus f=${
      busPhase01 != null ? busPhase01.toFixed(4) : "--"
    } cyc`;
    return {
      text,
      className,
      title,
    };
  }, [busPhaseSummary.diffCycles, busPhase01, loopPhase01]);

  const busPayloadSummary = useMemo(() => {
    if (!busPhasePayload) return null;
    const tsec =
      busPhasePayload.tsec_ms != null
        ? `${busPhasePayload.tsec_ms.toFixed(2)} ms`
        : "--";
    const tauLC =
      busPhasePayload.tauLC_ms != null
        ? fmtTimeSmartMs(busPhasePayload.tauLC_ms)
        : "--";
    const pump =
      busPhasePayload.pumpPhase_deg != null
        ? `${busPhasePayload.pumpPhase_deg.toFixed(1)}Â°`
        : "--";
    const sector =
      busPhasePayload.sectorIndex != null
        ? `sector ${busPhasePayload.sectorIndex}`
        : "sector --";
    const sourceLabel = busPhasePayload.source ?? busPhaseSource;
    const updatedAt =
      busPhasePayload.timestamp != null
        ? new Date(busPhasePayload.timestamp).toISOString()
        : busPhaseUpdatedAt != null
          ? new Date(busPhaseUpdatedAt).toISOString()
          : null;
    const titleParts = [
      `Tsec_ms=${busPhasePayload.tsec_ms ?? "--"}`,
      `pumpPhase_deg=${busPhasePayload.pumpPhase_deg ?? "--"}`,
      `sector=${busPhasePayload.sectorIndex ?? "--"}`,
      `source=${sourceLabel}`,
    ];
    if (updatedAt) titleParts.push(`timestamp=${updatedAt}`);
    titleParts.push(`tauLC_ms=${busPhasePayload.tauLC_ms ?? "--"}`);
    return {
      text: `Bus payload Tsec ${tsec} | \u03C4LC ${tauLC} | pump \u03B8 ${pump} | ${sector}`,
      title: titleParts.join(", "),
    };
  }, [busPhasePayload, busPhaseSource, busPhaseUpdatedAt]);

  useEffect(() => {
    const tauLCmsRaw = Number(lightLoop.tauLC_ms);
    const burstMsRaw = Number(lightLoop.burst_ms);
    const dwellMsRaw = Number(lightLoop.dwell_ms);
    const tauLCms = Number.isFinite(tauLCmsRaw) ? tauLCmsRaw : undefined;
    const burstMs = Number.isFinite(burstMsRaw) ? burstMsRaw : undefined;
    const dwellMs = Number.isFinite(dwellMsRaw) ? dwellMsRaw : undefined;
    const ratio =
      tauLCms != null && tauLCms > 1e-9 && burstMs != null
        ? burstMs / tauLCms
        : undefined;
    const reciprocityStatus =
      ratio == null ? "unknown" : ratio >= 1 ? "pass" : "warn";
    const zetaRaw = Number(
      (live as any)?.zeta ??
        (live as any)?.zetaFordRoman ??
        (live as any)?.fordRomanZeta ??
        (live as any)?.warp?.zeta ??
        (live as any)?.energy?.zeta
    );
    const zetaLimitRaw = Number(
      (live as any)?.zetaLimit ??
        (live as any)?.zetaCeiling ??
        (live as any)?.warp?.zetaLimit ??
        1
    );
    const zetaValue = Number.isFinite(zetaRaw) ? zetaRaw : undefined;
    const zetaLimit = Number.isFinite(zetaLimitRaw) ? zetaLimitRaw : undefined;
    let zetaStatus: "pass" | "warn" | "limit" | "unknown" = "unknown";
    if (zetaValue != null && zetaLimit != null && zetaLimit > 0) {
      const frac = zetaValue / zetaLimit;
      if (frac >= 1) zetaStatus = "limit";
      else if (frac >= 0.9) zetaStatus = "warn";
      else zetaStatus = "pass";
    }
    setSharedCompliance({
      reciprocity: {
        tauLC_ms: tauLCms,
        burst_ms: burstMs,
        dwell_ms: dwellMs,
        ratio,
        status: reciprocityStatus,
      },
      zeta: {
        value: zetaValue,
        limit: zetaLimit,
        status: zetaStatus,
      },
    });
  }, [setSharedCompliance, lightLoop.tauLC_ms, lightLoop.burst_ms, lightLoop.dwell_ms, live]);

  useEffect(() => {
    const tauLCms = Number.isFinite(lightLoop.tauLC_ms ?? NaN) ? lightLoop.tauLC_ms : undefined;
    const burstMs = Number.isFinite(lightLoop.burst_ms ?? NaN) ? lightLoop.burst_ms : undefined;
    const dwellMs = Number.isFinite(lightLoop.dwell_ms ?? NaN) ? lightLoop.dwell_ms : undefined;
    const blend = Number.isFinite(hullBlend ?? NaN) ? hullBlend : 0;
    let key: "instant" | "tauLC" | "burst" | "sector" = "instant";
    if (hullMode === "instant" && blend <= 0.02) {
      key = "instant";
    } else if (blend >= 0.82) {
      key = "sector";
    } else if (blend >= 0.48) {
      key = "burst";
    } else {
      key = "tauLC";
    }
    const label =
      key === "instant"
        ? "Instant"
        : key === "tauLC"
          ? "tLC-window"
          : key === "burst"
            ? "Burst-window"
            : "One-sector";
    const duration =
      key === "instant"
        ? 0
        : key === "tauLC"
          ? tauLCms
          : key === "burst"
            ? burstMs
            : dwellMs;
    const provenance =
      key === "instant"
        ? "Instantaneous sample"
        : key === "tauLC"
          ? "Wall tLC (light-crossing)"
          : key === "burst"
            ? "Local RF burst window"
            : "Scheduler dwell period";
    setSharedSampling({
      key,
      label,
      durationMs: Number.isFinite(duration ?? NaN) ? duration : undefined,
      provenance,
    });
  }, [setSharedSampling, hullMode, hullBlend, lightLoop.tauLC_ms, lightLoop.burst_ms, lightLoop.dwell_ms]);

  const schedulerCenter = useMemo(() => {
    if (!syncScheduler) return null;
    const count = Math.max(1, loopSectorCount);
    const idx = ((loopSectorIdx % count) + count) % count;
    const center = (idx + loopPhase) / count;
    const frac = center - Math.floor(center);
    return frac < 0 ? frac + 1 : frac;
  }, [syncScheduler, loopSectorCount, loopSectorIdx, loopPhase]);

  const fallbackCenter = useMemo(() => {
    const total = Math.max(1, totalSectors);
    const candidates = [
      (live as any)?.sectorIdx,
      (live as any)?.sectorIndex,
      (live as any)?.sectorPointer,
      (live as any)?.currentSector,
    ];
    let idx = 0;
    for (const cand of candidates) {
      const n = Number(cand);
      if (Number.isFinite(n)) {
        idx = ((n % total) + total) % total;
        break;
      }
    }
    const center = (idx + Math.max(1, liveSectors) * 0.5) / total;
    const frac = center - Math.floor(center);
    return frac < 0 ? frac + 1 : frac;
  }, [live, totalSectors, liveSectors]);

  const sectorCenter = useMemo(() => {
    if (syncScheduler && schedulerCenter !== null) return schedulerCenter;
    return fallbackCenter;
  }, [syncScheduler, schedulerCenter, fallbackCenter]);

  const sectorCenter01 = useMemo(() => {
    const v = Number(sectorCenter);
    if (!Number.isFinite(v)) return 0;
    const frac = v - Math.floor(v);
    return frac < 0 ? frac + 1 : frac;
  }, [sectorCenter]);

  const gaussianSigma = useMemo(() => {
    const total = Math.max(1, totalSectors);
    const sigmaFromStore =
      typeof ds.effectiveSigma01 === "function"
        ? ds.effectiveSigma01(total)
        : Math.max(1e-6, ds.sigmaSectors) / total;
    const sliderSigma = Math.max(1e-4, sigmaFromStore);
    const liveSigma = Math.max(1, liveSectors) / total;
    return Math.max(sliderSigma, liveSigma * 0.35);
  }, [ds, totalSectors, liveSectors]);

  const overlayConfig = useMemo<Hull3DOverlayState>(() => {
    const isGRVolume =
      hullVolumeVizLive === "theta_gr" ||
      hullVolumeVizLive === "rho_gr" ||
      hullVolumeVizLive === "shear_gr" ||
      hullVolumeVizLive === "vorticity_gr";
    const isGRMode = planarVizMode === 0 || planarVizMode === 1 || (planarVizMode === 3 && isGRVolume);
    const isRhoMode =
      planarVizMode === 1 ||
      (planarVizMode === 3 &&
        (hullVolumeVizLive === "rho_gr" || hullVolumeVizLive === "shear_gr"));
    const phase = Number.isFinite(loopPhase) ? loopPhase : ds.phase01 ?? 0;
    const tauLCms = firstFinite(
      lightLoop.tauLC_ms,
      (live as any)?.tau_LC_ms,
      (live as any)?.lightCrossing?.tauLC_ms,
      (live as any)?.lightCrossing?.tau_ms
    );
    const burstMs = firstFinite(
      lightLoop.burst_ms,
      (live as any)?.burst_ms,
      (live as any)?.lightCrossing?.burst_ms,
      tauLCms
    );
    const dwellMs = firstFinite(
      lightLoop.dwell_ms,
      sectorPeriodMs,
      (live as any)?.dwell_ms,
      (live as any)?.sectorPeriod_ms,
      (live as any)?.lightCrossing?.dwell_ms
    );
    const thetaFloor = Math.max(1e-9, vizFloors.thetaGR ?? 1e-9);
    const rhoFloor = Math.max(1e-18, vizFloors.rhoGR ?? 1e-18);
    const isoStep = isGRMode ? (isRhoMode ? rhoFloor * 1.6 : thetaFloor * 1.4) : thetaFloor;
    const spacetimeGridPrefs = {
      enabled: spacetimeGridEnabled,
      mode: spacetimeGridMode,
      spacing_m: spacetimeGridSpacing,
      warpStrength: spacetimeGridWarpStrength,
      falloff_m: spacetimeGridFalloff,
      colorBy: spacetimeGridColorBy,
      useSdf: spacetimeGridUseSdf,
      warpStrengthMode: spacetimeGridStrengthMode,
    };

    const overlaySyncMode = syncScheduler && schedulerCenter !== null ? 1 : 0;

    const overlays: Hull3DOverlayState = {
      phase,
      kInvariants: {
        enabled: isGRMode && showKHeatOverlay,
        mode: isRhoMode ? 2 : 0,
        gain: isRhoMode ? 4.0 : 6.0,
        alpha: showKHeatOverlay ? 0.65 : 0,
      },
      thetaIso: {
        enabled: isGRMode && showThetaIsoOverlay,
        step: isoStep,
        width: 0.08,
        opacity: showThetaIsoOverlay ? 0.75 : 0,
      },
      fordRoman: {
        enabled: showFordRomanBar,
        tauLC: tauLCms,
        burst: burstMs,
        dwell: dwellMs,
        alpha: showFordRomanBar ? 0.85 : 0,
      },
      sectorArc: {
        enabled: showSectorArcOverlay,
        radiusPx: 74,
        widthPx: 8,
        gapPx: 11,
        instantAlpha: showSectorArcOverlay ? 0.72 : 0,
        emaAlpha: showSectorArcOverlay ? 0.58 : 0,
      },
      sectorGrid: {
        enabled: showSectorGridOverlay,
        mode:
          overlaySyncMode === 1 && ds.splitEnabled
            ? "split"
            : hullMode === "average"
              ? "ema"
              : "instant",
        alpha: showSectorGridOverlay ? 0.55 : 0,
        isoAlpha: showSectorGridOverlay ? 0.18 : 0,
        phaseHue: phase,
        dutyWindow: sharedSectorState?.dutyWindow ?? [0, 1],
      },
      curvature: {
        enabled: curvatureOverlay.enabled,
        gain: curvatureOverlay.gain,
        alpha: curvatureOverlay.alpha,
        palette: curvatureOverlay.palette,
        showQIMargin: curvatureOverlay.showQIMargin,
      },
      domainGrid: {
        enabled: true,
      },
      spacetimeGrid: spacetimeGridPrefs,
    };

    const epsilonTilt = firstFinite(
      (live as any)?.epsilonTilt,
      (live as any)?.shiftVector?.epsilonTilt,
      (live as any)?.warp?.epsilonTilt
    );
    const rawTilt = ((live as any)?.betaTiltVec
      ?? (live as any)?.shiftVector?.betaTiltVec
      ?? (live as any)?.warp?.betaTiltVec) as number[] | undefined;

    let derivedTilt: TiltDirective | null = null;
    if (Number.isFinite(epsilonTilt) && rawTilt && rawTilt.length === 3) {
      const dir2: [number, number] = [rawTilt[0] || 0, rawTilt[1] || 0];
      const len = Math.hypot(dir2[0], dir2[1]) || 1;
      derivedTilt = {
        enabled: true,
        dir: [dir2[0] / len, dir2[1] / len],
        magnitude: Math.min(1, Math.abs(epsilonTilt) / 5e-7),
        alpha: 0.85,
      };
    }

    const tiltSource = busTiltDirective?.enabled ? busTiltDirective : derivedTilt;
    if (showTiltOverlay && tiltSource) {
      const norm = Math.hypot(tiltSource.dir[0], tiltSource.dir[1]) || 1;
      overlays.tilt = {
        enabled: true,
        dir: [tiltSource.dir[0] / norm, tiltSource.dir[1] / norm],
        magnitude: clamp(tiltSource.magnitude ?? 0, 0, 1),
        alpha: tiltSource.alpha !== undefined ? clamp(tiltSource.alpha, 0, 1) : 0.85,
        ...(typeof tiltSource.gain === "number" ? { gain: tiltSource.gain } : {}), // [tilt-gain]
        ...(tiltSource.gainMode === "manual" || tiltSource.gainMode === "curvature"
          ? { gainMode: tiltSource.gainMode }
          : {}), // [tilt-gain]
      };
    }

    return overlays;
  }, [
    planarVizMode,
    showKHeatOverlay,
    showThetaIsoOverlay,
    showFordRomanBar,
    showSectorArcOverlay,
    showSectorGridOverlay,
    showTiltOverlay,
    hullMode,
    syncScheduler,
    schedulerCenter,
    ds.splitEnabled,
    loopPhase,
    ds.phase01,
    lightLoop.tauLC_ms,
    lightLoop.burst_ms,
    lightLoop.dwell_ms,
    sectorPeriodMs,
    vizFloors.thetaGR,
    vizFloors.rhoGR,
    live,
    curvatureOverlay,
    busTiltDirective,
    spacetimeGridEnabled,
    spacetimeGridMode,
    spacetimeGridSpacing,
    spacetimeGridWarpStrength,
    spacetimeGridFalloff,
    spacetimeGridColorBy,
    spacetimeGridUseSdf,
    spacetimeGridStrengthMode,
    sharedSectorState?.dutyWindow,
  ]);

  const syncMode = useMemo(() => (syncScheduler && schedulerCenter !== null ? 1 : 0), [syncScheduler, schedulerCenter]);
  const latticeProfileTag = viewerProfileTag === "card" ? "card" : "preview";
  const latticePreviewStatus = useMemo(() => {
    if (!hullPreview) {
      return {
        reason: "preview-missing",
        label: "Preview missing",
        hint: "Load a preview hull (GLB) via Model Silhouette before enabling lattice sampling; using analytic ellipsoid instead.",
      } as const;
    }
    if (hullDimsResolved?.source !== "preview") {
      return {
        reason: "preview-unavailable",
        label: "Preview inactive",
        hint: "Preview dims are missing/clamped/stale; load a preview hull via Model Silhouette to enable lattice sampling.",
      } as const;
    }
    return null;
  }, [hullPreview, hullDimsResolved?.source]);
  const latticeAvailable = !latticePreviewStatus;
  const latticeUseDynamicWeights = true;
  const {
    latticeVolume: latticeVolumeForRenderer,
    latticeSdf: latticeSdfForRenderer,
    latticeGuardrails,
    latticeWatchdogStats,
    desiredDriveLadderSignature,
  } = useHullLatticeVolume({
    latticeModeEnabled,
    latticeAvailable,
    latticeRequireSdf,
    hullPreview,
    hullDims: hullDimsResolved ?? null,
    boundsProfile: bubbleBoundsMode ?? "tight",
    qualityPreset: hullQuality,
    profileTag: latticeProfileTag,
    wireframeLod,
    wireframeBudgets,
    totalSectors,
    liveSectors,
    sectorCenter01,
    gaussianSigma,
    sectorFloor: ds.sectorFloor,
    splitEnabled: ds.splitEnabled,
    splitFrac: ds.splitFrac,
    syncMode,
    gate,
    ampChain,
    sigma,
    beta,
    R,
    axes,
    latticeUseDynamicWeights,
    sharedLatticeState,
    setSharedLattice,
  });

  type LatticeFallbackStatusLevel = "info" | "warn" | "error";
  type LatticeFallbackStatus = {
    reason: string;
    level: LatticeFallbackStatusLevel;
    label: string;
    hint?: string;
    detail?: string;
  };

  const latticeFallbackStatus = useMemo<LatticeFallbackStatus | null>(() => {
    const volumeFailedReason =
      typeof (latticeGpuStatus as any)?.volumeFailedReason === "string"
        ? String((latticeGpuStatus as any).volumeFailedReason)
        : null;
    const formatReason =
      typeof (latticeGpuStatus as any)?.runtime?.formatReason === "string"
        ? String((latticeGpuStatus as any).runtime.formatReason)
        : typeof (latticeGpuStatus as any)?.runtime?.telemetry?.downgradeReason === "string"
          ? String((latticeGpuStatus as any).runtime.telemetry.downgradeReason)
          : null;
    const caps = (latticeGpuStatus as any)?.caps ?? null;

    if (!latticeModeEnabled) {
      return { reason: "disabled", level: "info", label: "Disabled", hint: "Lattice sampling disabled." };
    }
    if (latticePreviewStatus) {
      return {
        reason: latticePreviewStatus.reason,
        level: "warn",
        label: latticePreviewStatus.label,
        hint: latticePreviewStatus.hint,
      };
    }

    const frame = sharedLatticeState?.frame ?? null;
    const frameClampReasons = frame?.clampReasons ?? [];
    if (!frame) {
      return {
        reason: "frame-missing",
        level: "warn",
        label: "Frame missing",
        hint: "Waiting for lattice frame build.",
      };
    }
    // Keep running with a clamped frame; diagnostics panel surfaces clamp reasons.

    const volume = sharedLatticeState?.volume ?? null;
    const volumeClampReasons = volume?.clampReasons ?? [];
    if (!volume) {
      return {
        reason: "volume-missing",
        level: "warn",
        label: "Volume missing",
        hint: "Waiting for lattice voxelization.",
      };
    }

    const volumeBudgetHit =
      volume.stats?.budgetHit || volumeClampReasons.some((reason) => reason.includes("budget"));
    if (volumeBudgetHit) {
      return {
        reason: "volume-over-budget",
        level: "error",
        label: "Volume over budget",
        hint: "Lower lattice preset / quality or increase voxel size; lattice auto-falls back to analytic.",
        detail: volumeClampReasons.length ? volumeClampReasons.join(", ") : "voxel:budgetHit",
      };
    }

    const desiredWeightHash = latticeGuardrails.desiredWeightHash;
    const builtWeightHash = latticeGuardrails.builtWeightHash;
    if (!latticeUseDynamicWeights && desiredWeightHash && builtWeightHash !== desiredWeightHash) {
      return {
        reason: "hash-stale",
        level: "warn",
        label: "Rebuilding weights",
        hint: `Scheduler params changed; using analytic until lattice rebuild completes (want ${desiredWeightHash} vs built ${builtWeightHash ?? "n/a"}).`,
        detail: `want=${desiredWeightHash} built=${builtWeightHash ?? "n/a"}`,
      };
    }

    const desiredDriveSig = desiredDriveLadderSignature;
    const builtDriveSig = volume.metadata?.driveLadder?.signature ?? null;
    if (desiredDriveSig && builtDriveSig && builtDriveSig !== desiredDriveSig) {
      return {
        reason: "drive-ladder-mismatch",
        level: "warn",
        label: "Drive ladder changed",
        hint: "Drive ladder scalars changed; using analytic until volume rebuild completes.",
      };
    }

    if (latticeRequireSdf && !sharedLatticeState?.sdf) {
      return {
        reason: "sdf-missing-required",
        level: "warn",
        label: "Missing SDF (required)",
        hint: "Wait for SDF build or disable Require SDF to re-enable lattice sampling.",
      };
    }

    if (caps) {
      if (!caps.max3DTextureSize || caps.max3DTextureSize <= 0) {
        return {
          reason: "caps:texture3d-unsupported",
          level: "warn",
          label: "3D textures unavailable",
          hint: "Browser lacks 3D textures; reverting to analytic ellipsoid.",
          detail: "caps:texture3d-unsupported",
        };
      }
      if (!caps.supportsFloatLinear && !caps.supportsHalfFloatLinear) {
        return {
          reason: "caps:no-linear-filter",
          level: "warn",
          label: "No linear filtering",
          hint: "GPU lacks float/half-float linear filtering; using analytic ellipsoid.",
          detail: "caps:float-linear",
        };
      }
      if (!caps.supportsColorFloat) {
        return {
          reason: "caps:no-float-texture",
          level: "warn",
          label: "Float targets unavailable",
          hint: "GPU float targets unavailable for lattice volume; reverting to analytic ellipsoid.",
          detail: "caps:color-buffer-float",
        };
      }
    }

    if (latticeGpuStatus?.volumeFailed) {
      const capsHint =
        volumeFailedReason === "caps:max3dTextureSize"
          ? "MAX_3D_TEXTURE_SIZE too small for lattice dims; lower lattice preset."
          : volumeFailedReason === "caps:maxTextureSize"
            ? "MAX_TEXTURE_SIZE too small for atlas fallback; lower lattice preset."
            : null;
      const budgetFail = volumeFailedReason?.startsWith("budget:");
      const capsFail = volumeFailedReason?.startsWith("caps:");
      return {
        reason: budgetFail ? "gpu-volume-budget" : capsFail ? "gpu-volume-caps" : "gpu-volume-upload-failed",
        level: budgetFail ? "warn" : "error",
        label: budgetFail ? "GPU budget hit" : capsHint ? "GPU caps insufficient" : "GPU upload failed",
        hint:
          budgetFail && volumeFailedReason === "budget:bytes"
            ? "Volume upload exceeded GPU byte budget; lower preset or voxel density."
            : budgetFail
              ? "Volume upload exceeded GPU voxel budget; lower preset or voxel density."
              : capsHint ?? "Volume upload failed; try lowering lattice preset or reload the viewer.",
        ...(volumeFailedReason ? { detail: volumeFailedReason } : {}),
      };
    }

    if (latticeRequireSdf && latticeGpuStatus?.sdfFailed) {
      const detail =
        typeof (latticeGpuStatus as any)?.sdfFailedReason === "string"
          ? String((latticeGpuStatus as any).sdfFailedReason)
          : null;
      return {
        reason: "gpu-sdf-upload-failed",
        level: "warn",
        label: "SDF upload failed",
        hint: "Hull SDF band upload failed; analytic blending will be used instead.",
        ...(detail ? { detail } : {}),
      };
    }

    if (latticeGpuStatus && !latticeGpuStatus.volumeReady) {
      return {
        reason: "gpu-volume-upload-pending",
        level: "info",
        label: "Uploading volume",
        hint: "Uploading lattice volume to GPU.",
      };
    }

    if (latticeRequireSdf && latticeGpuStatus && !latticeGpuStatus.sdfReady) {
      return {
        reason: "gpu-sdf-upload-pending",
        level: "info",
        label: "Uploading SDF",
        hint: "Uploading hull SDF band to GPU.",
      };
    }

    if (formatReason && formatReason.startsWith("caps:")) {
      return {
        reason: formatReason,
        level: "warn",
        label: "GPU downgraded lattice",
        hint: "Viewer downgraded lattice format due to GPU caps; using analytic ellipsoid instead.",
        detail: formatReason,
      };
    }

    const runtime = (latticeGpuStatus as any)?.runtime;
    if (runtime && !runtime.hasLatticeVolume && !latticeVolumeForRenderer) {
      return {
        reason: "analytic-fallback",
        level: "warn",
        label: "Analytic fallback",
        hint: "Lattice not active; using analytic volume.",
        detail: runtime.formatReason ?? formatReason ?? undefined,
      };
    }

    return null;
  }, [
    latticeModeEnabled,
    latticeAvailable,
    latticePreviewStatus,
    latticeRequireSdf,
    latticeGuardrails.desiredWeightHash,
    latticeGuardrails.builtWeightHash,
    desiredDriveLadderSignature,
    latticeVolumeForRenderer,
    sharedLatticeState?.frame,
    sharedLatticeState?.volume,
    sharedLatticeState?.sdf,
    latticeGpuStatus,
    latticeUseDynamicWeights,
  ]);

  const latticeRuntime = useMemo(() => (latticeGpuStatus as any)?.runtime ?? null, [latticeGpuStatus]);
  const frameClampSignature = useMemo(
    () => (sharedLatticeState?.frame?.clampReasons ?? []).join("|"),
    [sharedLatticeState?.frame?.clampReasons]
  );
  const sdfClampSignature = useMemo(() => {
    const sdf: any = sharedLatticeState?.sdf ?? null;
    const parts: string[] = [];
    if (Array.isArray(sdf?.clampReasons)) {
      parts.push(...sdf.clampReasons.filter(Boolean));
    }
    const stats = sdf?.stats ?? null;
    if (stats) {
      if (Array.isArray(stats.clampReasons)) {
        parts.push(...stats.clampReasons.filter(Boolean));
      }
      if (stats.fallbackReason) parts.push(String(stats.fallbackReason));
      if (stats.budgetHit) parts.push("budget:hit");
    }
    const sdfFailedReason =
      typeof (latticeGpuStatus as any)?.sdfFailedReason === "string"
        ? String((latticeGpuStatus as any).sdfFailedReason)
        : null;
    if (sdfFailedReason) parts.push(sdfFailedReason);
    return parts.join("|");
  }, [sharedLatticeState?.sdf, latticeGpuStatus]);
  const latticePathActive = latticeRuntime?.hasLatticeVolume && !latticeFallbackStatus;
  const latticeOverlayVolumeReady = latticePathActive && !!latticeVolumeForRenderer;
  const volumePath =
    volumeSource === "lattice"
      ? latticeOverlayVolumeReady
        ? "lattice"
        : "analytic"
      : volumeSource;
  const volumePathActive = volumePath === "lattice";
  const latticeRebuildPending =
    latticePathActive && !latticeOverlayVolumeReady && !!sharedLatticeState?.volume;
  const overlayLockedReason = useMemo(() => {
    if (!latticeModeEnabled) return "Lattice disabled";
    if (!latticeAvailable) return latticePreviewStatus?.label ?? "Preview mesh required";
    if (latticeFallbackStatus) return latticeFallbackStatus.hint ?? latticeFallbackStatus.label;
    if (latticeGuardrails.staleHash) return "Rebuilding lattice weights";
    if (latticeRebuildPending) return "Rebuilding lattice";
    if (!latticeOverlayVolumeReady) return "Lattice not ready";
    return null;
  }, [
    latticeAvailable,
    latticeFallbackStatus,
    latticeGuardrails.staleHash,
    latticeModeEnabled,
    latticeOverlayVolumeReady,
    latticeRebuildPending,
    latticePreviewStatus,
  ]);
  const voxelSlicesSuppressed = false; // keep 2D slices visible alongside the volume
  const voxelOverlayActive =
    latticeOverlayVolumeReady &&
    !overlayLockedReason &&
    (coverageHeatmapEnabled || (voxelSlicesEnabled && !voxelSlicesSuppressed));
  const voxelSliceActive = voxelOverlayActive && voxelSlicesEnabled && !voxelSlicesSuppressed;
  const surfaceOverlaySuppressed = false; // keep surface overlays visible alongside the volume
  const overlayCanvasVisible = overlayHudEnabled || voxelOverlayActive;
  const overlayControlsDisabled = !!overlayLockedReason || !latticeOverlayVolumeReady;
  const sliceControlsDisabled = overlayControlsDisabled || !voxelSlicesEnabled;
  const spacetimeGridBadges = useMemo(() => {
    if (!spacetimeGridEnabled) return [] as Array<{ label: string; title?: string; level: "info" | "warn" }>;
    const degraded = spacetimeGridDbg?.degraded ?? null;
    const reasons = Array.isArray(degraded?.reasons) ? degraded.reasons : [];
    const spacingUsedRaw = Number(degraded?.spacingUsed_m ?? spacetimeGridSpacing);
    const spacingReqRaw = Number(degraded?.spacingRequested_m ?? spacetimeGridSpacing);
    const spacingUsed = Number.isFinite(spacingUsedRaw) ? spacingUsedRaw : spacetimeGridSpacing;
    const spacingReq = Number.isFinite(spacingReqRaw) ? spacingReqRaw : spacetimeGridSpacing;
    const postEnabled = spacetimeGridDbg?.postEnabled ?? spacetimeGridDbg?.enabled;
    const postMode = spacetimeGridDbg?.postMode ?? null;
    const volumeActive = Boolean(spacetimeGridDbg?.volumeEnabled ?? spacetimeGridMode === "volume");
    const boundsExpanded = Number(spacetimeGridDbg?.bounds?.expandedBy_m ?? 0);
    const gpuReason = typeof spacetimeGridDbg?.gpu?.formatReason === "string"
      ? spacetimeGridDbg.gpu.formatReason
      : null;
    const badges: Array<{ label: string; title?: string; level: "info" | "warn" }> = [];
    if (postEnabled === false) {
      badges.push({
        label: "Post shader off",
        level: "warn",
        title: "Surface/slice overlay disabled; try toggling Spacetime grid or reloading the viewer.",
      });
    }
    if (volumeActive && postEnabled) {
      badges.push({
        label: "Surface + Volume",
        level: "info",
        title: `Rendering shell overlay with volume cage (${postMode ?? "surface"}).`,
      });
    }
    if (gpuReason) {
      badges.push({
        label: "GPU fallback",
        level: "warn",
        title: `GPU format fallback: ${gpuReason}`,
      });
    }
    const sdfMissing = Boolean(degraded?.sdfMissing || reasons.includes("sdf-missing"));
    const analyticOnly = Boolean(degraded?.analyticOnly || reasons.includes("analytic-only"));
    if (sdfMissing) {
      badges.push({
        label: "SDF missing",
        level: "warn",
        title: "Lattice SDF unavailable; using analytic distance fallback.",
      });
    } else if (analyticOnly) {
      badges.push({
        label: "Analytic only",
        level: "info",
        title: "SDF sampling disabled; using analytic distance fallback.",
      });
    }
    if (reasons.includes("coarse-spacing")) {
      const detail = spacingReq !== spacingUsed
        ? `Requested ${spacingReq.toFixed(2)} m, using ${spacingUsed.toFixed(2)} m`
        : `Spacing ${spacingUsed.toFixed(2)} m`;
      badges.push({
        label: "Coarse spacing",
        level: "warn",
        title: reasons.includes("line-cap") ? `${detail} (line cap)` : detail,
      });
    }
    if (reasons.includes("line-cap")) {
      badges.push({
        label: "Line cap",
        level: "warn",
        title: "Line budget hit; spacing increased to keep GPU budget in bounds.",
      });
    }
    if (Number.isFinite(boundsExpanded) && boundsExpanded > 1e-3) {
      badges.push({
        label: "Expanded bounds",
        level: "info",
        title: `Grid bounds expanded by ${boundsExpanded.toFixed(2)} m to show the waveform.`,
      });
    }
    return badges;
  }, [spacetimeGridDbg, spacetimeGridEnabled, spacetimeGridMode, spacetimeGridSpacing]);
  const latticeDowngradeLabel = latticeRuntime?.useAtlas
    ? "2D atlas"
    : latticeRuntime?.formatLabel?.replace(/^3D\s+/i, "") ?? (latticePathActive ? "R32F" : "analytic");
  const latticeDowngradeReason =
    (latticeRuntime as any)?.formatReason ??
    ((latticeRuntime as any)?.telemetry?.downgradeReason ?? null);

  const driveWeightAt = useCallback((angle01: number) => {
    // Apply global phase offset before any scheduler math (wrap to [0,1))
    const angle = angle01 - Math.floor(angle01);
    const phasedAngle = angle + (ds.phase01 - Math.floor(ds.phase01));
    const safeAngle = phasedAngle - Math.floor(phasedAngle);
    const total = Math.max(1, totalSectors);
    const live = Math.max(1, Math.min(liveSectors, total));
    const floorFrac = Math.min(0.99, Math.max(0, ds.sectorFloor));
    const peakFrac = Math.max(0, 1 - floorFrac);
    const activeFrac = fActive;
    if (peakFrac <= 1e-6) {
      return activeFrac * floorFrac;
    }
    if (syncMode > 0) {
      const center = sectorCenter01;
      const sigma = Math.max(1e-4, gaussianSigma);
      const avgGaussian = Math.min(1.0, sigma * 2.5066282746310002);
      const dist1 = Math.min(Math.abs(safeAngle - center), 1.0 - Math.abs(safeAngle - center));
      const g1 = Math.exp(-0.5 * (dist1 * dist1) / (sigma * sigma));
      let g = g1;
      if (ds.splitEnabled) {
        const center2 = (center + 0.5) - Math.floor(center + 0.5);
        const d2raw = Math.abs(safeAngle - center2);
        const dist2 = Math.min(d2raw, 1.0 - d2raw);
        const g2 = Math.exp(-0.5 * (dist2 * dist2) / (sigma * sigma));
        const wA = Math.max(0, Math.min(1, ds.splitFrac));
        g = g1 * wA + g2 * (1 - wA);
      }
      const normalized = Math.min(g / Math.max(avgGaussian, 1e-4), 12.0);
      const weight = activeFrac * (floorFrac + peakFrac * normalized);
      return Math.min(weight, activeFrac * (floorFrac + peakFrac * 12.0));
    }
  const frac = live / total;
  const idx = Math.floor(safeAngle * total);
    const on = idx < live ? 1.0 : 0.0;
    const normalized = frac > 1e-9 ? Math.min(on / frac, 12.0) : on;
    const weight = activeFrac * (floorFrac + peakFrac * normalized);
    return Math.min(weight, activeFrac * (floorFrac + peakFrac * 12.0));
  }, [totalSectors, liveSectors, ds.splitEnabled, ds.splitFrac, ds.sectorFloor, ds.phase01, fActive, syncMode, sectorCenter01, gaussianSigma]);

  useEffect(() => {
    const total = Math.max(1, totalSectors);
    const instant = new Float32Array(total);
    const baseWeights = new Array(total).fill(0);
    for (let i = 0; i < total; i++) {
      const a01 = (i + 0.5) / total;
      const w = driveWeightAt(a01);
      const value = Number.isFinite(w) ? w : 0;
      instant[i] = value;
      baseWeights[i] = value;
    }
    const averageArray = showSectorGridOverlay
      ? baseWeights.slice()
      : smoothSectorWeights(baseWeights, Math.max(0.1, ds.sigmaSectors * 0.4));
    const average = new Float32Array(averageArray);
    const sqrtBoost = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const norm = Math.max(1e-9, fActive);
      sqrtBoost[i] = Math.sqrt(Math.max(0, instant[i]) / norm);
    }
    const dwellMsRaw = Number(lightLoop.dwell_ms);
    const burstMsRaw = Number(lightLoop.burst_ms);
    const dwell = Number.isFinite(dwellMsRaw) && dwellMsRaw > 0 ? dwellMsRaw : 1;
    const burst = Number.isFinite(burstMsRaw) ? Math.max(0, burstMsRaw) : 0;
    const burstFrac = Math.min(1, Math.max(0, burst / dwell));
    const half = burstFrac * 0.5;
    const windowStart = Math.max(0, 0.5 - half);
    const windowEnd = Math.min(1, 0.5 + half);
    setSharedSector({
      weightsInstant: instant,
      weightsAverage: average,
      sqrtBoost,
      betaSign: beta >= 0 ? 1 : -1,
      activeIndex: ((loopSectorIdx % total) + total) % total,
      nextIndex: ((loopSectorIdx + 1) % total + total) % total,
      dutyWindow: [windowStart, windowEnd],
    });
  }, [
    setSharedSector,
    totalSectors,
    ds.sigmaSectors,
    driveWeightAt,
    fActive,
    beta,
    loopSectorIdx,
    lightLoop.dwell_ms,
    lightLoop.burst_ms,
    showSectorGridOverlay,
  ]);

  // --- Parity check: sample CPU gating peak vs shader sector center (sync mode only)
  useEffect(() => {
    if (planarVizMode !== 2) return; // drive-only
    if (syncMode !== 1) { // only meaningful in Gaussian sync mode (fallback has flat tops)
      setCenterDeltaDeg(null);
      return;
    }
    const now = performance.now();
    if (now - lastCenterCheckRef.current < 800) return; // throttle ~1.25 Hz
    lastCenterCheckRef.current = now;
    // Sample driveWeightAt on a uniform azimuth grid to find argmax
    const N = 512;
    let maxW = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < N; i++) {
      const a01 = i / N;
      const w = driveWeightAt(a01);
      if (w > maxW) { maxW = w; maxIdx = i; }
    }
    // Proper circular distance with explicit wrapping to [0,1)
    const wrap01 = (t: number) => t - Math.floor(t);
    const angDist01 = (x: number, y: number) => {
      const xw = wrap01(x);
      const yw = wrap01(y);
      const d = Math.abs(xw - yw);
      return Math.min(d, 1 - d); // in [0, 0.5]
    };

    const aStar = wrap01(maxIdx / N);
    // Compare to nearest of center and (center + 0.5) when split is enabled
    const c0 = wrap01(sectorCenter01);
    const c1 = wrap01(c0 + 0.5);

    const d1 = angDist01(aStar, c0);
    const d2 = ds.splitEnabled ? angDist01(aStar, c1) : Number.POSITIVE_INFINITY;
    const d01 = Math.min(d1, d2);
    const deg = Math.max(0, Math.min(180, d01 * 360));
    setCenterDeltaDeg(deg);
  }, [planarVizMode, syncMode, sectorCenter01, ds.splitEnabled, ds.splitFrac, totalSectors, liveSectors, gaussianSigma, fActive, ds.phase01, driveWeightAt]);

  // Optional contrast boost for sector visibility; >1 exaggerates lumps a bit
  const lumpBoostExp = useMemo(() => {
    const v = Number((live as any)?.view?.lumpBoostExp);
    return Number.isFinite(v) && v > 0 ? v : 1.25;
  }, [live]);

  const latticeFieldSampler = useMemo<LatticeFieldSampler | null>(() => {
    if (!latticeVolumeForRenderer || !sharedLatticeState?.frame) return null;
    const frame = sharedLatticeState.frame;
    const maxGate = Math.max(
      1e-6,
      latticeVolumeStats?.maxGate ?? latticeVolumeForRenderer.stats?.maxGate ?? 1,
    );
    return {
      worldToLattice: frame.worldToLattice,
      minLattice: frame.bounds.minLattice,
      sizeLattice: frame.bounds.size,
      dims: latticeVolumeForRenderer.dims,
      gate3D: latticeVolumeForRenderer.gate3D,
      dfdr3D: latticeVolumeForRenderer.dfdr3D,
      drive3D: latticeVolumeForRenderer.drive3D,
      maxGate,
    };
  }, [latticeVolumeForRenderer, latticeVolumeStats?.maxGate, sharedLatticeState?.frame]);

  const latticeSdfWeights = useMemo(() => {
    if (!latticeSdfForRenderer) return null;
    return encodeHullDistanceBandWeightsR8(latticeSdfForRenderer);
  }, [latticeSdfForRenderer]);

  const latticeSdfSampler = useMemo<LatticeSdfSampler | null>(() => {
    if (!latticeSdfForRenderer || !latticeSdfWeights || !sharedLatticeState?.frame) return null;
    const frame = sharedLatticeState.frame;
    return {
      worldToLattice: frame.worldToLattice,
      minLattice: frame.bounds.minLattice,
      sizeLattice: frame.bounds.size,
      dims: latticeSdfForRenderer.dims,
      weightsR8: latticeSdfWeights,
    };
  }, [latticeSdfForRenderer, latticeSdfWeights, sharedLatticeState?.frame]);

  const metricThetaSlice = useMemo(() => {
    if (planarVizMode !== 0) return null;
    const metricLatest =
      typeof window !== "undefined"
        ? ((window as any).__hullMetricVolumeLatest as HullMetricVolumeContract | null | undefined)
        : null;
    if (!metricLatest || metricLatest.kind !== "hull3d:metric-volume") return null;
    const dimsRaw = metricLatest.dims;
    if (!Array.isArray(dimsRaw) || dimsRaw.length < 3) return null;
    const dims: Vec3 = [
      Math.max(1, Math.floor(Number(dimsRaw[0]) || 1)),
      Math.max(1, Math.floor(Number(dimsRaw[1]) || 1)),
      Math.max(1, Math.floor(Number(dimsRaw[2]) || 1)),
    ];
    const expected = dims[0] * dims[1] * dims[2];
    if (!(expected > 0)) return null;
    const thetaChannel = (metricLatest.channels as any)?.theta ?? null;
    const thetaRaw = thetaChannel?.data;
    const thetaData =
      thetaRaw instanceof Float32Array
        ? thetaRaw
        : thetaRaw instanceof ArrayBuffer
          ? new Float32Array(thetaRaw)
          : ArrayBuffer.isView(thetaRaw)
            ? new Float32Array(
                thetaRaw.buffer,
                thetaRaw.byteOffset,
                Math.floor(thetaRaw.byteLength / Float32Array.BYTES_PER_ELEMENT),
              )
            : Array.isArray(thetaRaw)
              ? Float32Array.from(thetaRaw)
              : null;
    if (!(thetaData instanceof Float32Array) || thetaData.length < expected) return null;
    const bounds = metricLatest.bounds;
    const min = Array.isArray(bounds?.min) ? bounds.min : null;
    const max = Array.isArray(bounds?.max) ? bounds.max : null;
    if (!min || !max || min.length < 3 || max.length < 3) return null;
    const minMetric: Vec3 = [
      Number.isFinite(Number(min[0])) ? Number(min[0]) : -1,
      Number.isFinite(Number(min[1])) ? Number(min[1]) : -1,
      Number.isFinite(Number(min[2])) ? Number(min[2]) : -1,
    ];
    const sizeMetric: Vec3 = [
      Math.max(1e-9, Number(max[0]) - minMetric[0]),
      Math.max(1e-9, Number(max[1]) - minMetric[1]),
      Math.max(1e-9, Number(max[2]) - minMetric[2]),
    ];
    const nx = res;
    const ny = res;
    const data = new Float32Array(nx * ny * 4);
    const domainScale = hullDomainScale;
    const samplePoint: Vec3 = [0, 0, 0];
    let insideCount = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = -1 + 2 * (i / (nx - 1));
        const gz = -1 + 2 * (j / (ny - 1));
        samplePoint[0] = gx * domainScale * axes[0];
        samplePoint[1] = 0;
        samplePoint[2] = gz * domainScale * axes[2];
        const ux = (samplePoint[0] - minMetric[0]) / sizeMetric[0];
        const uy = (samplePoint[1] - minMetric[1]) / sizeMetric[1];
        const uz = (samplePoint[2] - minMetric[2]) / sizeMetric[2];
        const inside =
          ux >= 0 &&
          ux <= 1 &&
          uy >= 0 &&
          uy <= 1 &&
          uz >= 0 &&
          uz <= 1;
        if (inside) insideCount += 1;
        const v = worldToVoxelCoord(samplePoint, null, minMetric, sizeMetric, dims);
        const thetaValue = trilerpScalar(thetaData, dims, v, 0);
        const idx = (j * nx + i) * 4;
        data[idx] = Number.isFinite(thetaValue) ? thetaValue : 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = inside ? 1 : 0;
      }
    }
    const coverage = insideCount / Math.max(1, nx * ny);
    if (coverage < 0.08) return null;
    return {
      data,
      width: nx,
      height: ny,
      hasSdf: false,
      source: "metric-volume.theta-channel",
    };
  }, [planarVizMode, res, hullDomainScale, axes, metricVolumeVersion]);

  const latticeSlice = useMemo(() => {
    if (!latticeFieldSampler || planarVizMode === 3 || volumeSource !== "lattice") return null;
    const nx = res;
    const ny = res;
    const data = new Float32Array(nx * ny * 4);
    const domainScale = hullDomainScale;
    const maxGate = Math.max(1e-6, latticeFieldSampler.maxGate);
    const samplePoint: Vec3 = [0, 0, 0];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = -1 + 2 * (i / (nx - 1));
        const gz = -1 + 2 * (j / (ny - 1));
        const xView = gx * domainScale * axes[0];
        const zView = gz * domainScale * axes[2];
        samplePoint[0] = xView;
        samplePoint[2] = zView;
        const v = worldToVoxelCoord(
          samplePoint,
          latticeFieldSampler.worldToLattice,
          latticeFieldSampler.minLattice,
          latticeFieldSampler.sizeLattice,
          latticeFieldSampler.dims,
        );
        const dfdr = trilerpScalar(latticeFieldSampler.dfdr3D, latticeFieldSampler.dims, v, 0);
        const drive = trilerpScalar(latticeFieldSampler.drive3D, latticeFieldSampler.dims, v, 0);
        const rawGate = trilerpScalar(latticeFieldSampler.gate3D, latticeFieldSampler.dims, v, 0);
        const gate01 = clamp(rawGate / maxGate, 0, 1);
        let sdfBand = 0;
        if (latticeSdfSampler) {
          const vSdf = worldToVoxelCoord(
            samplePoint,
            latticeSdfSampler.worldToLattice,
            latticeSdfSampler.minLattice,
            latticeSdfSampler.sizeLattice,
            latticeSdfSampler.dims,
          );
          sdfBand = trilerpScalar(latticeSdfSampler.weightsR8, latticeSdfSampler.dims, vSdf, 0, 1 / 255);
          sdfBand = clamp(sdfBand, 0, 1);
        }
        const idx = (j * nx + i) * 4;
        data[idx] = dfdr;
        data[idx + 1] = drive;
        data[idx + 2] = sdfBand;
        data[idx + 3] = gate01;
      }
    }
    return { data, width: nx, height: ny, hasSdf: Boolean(latticeSdfSampler) };
  }, [axes, hullDomainScale, latticeFieldSampler, latticeSdfSampler, planarVizMode, res, volumeSource]);

  const activePlanarSlice = useMemo(() => {
    if (planarVizMode === 0 && metricThetaSlice) return metricThetaSlice;
    return latticeSlice;
  }, [planarVizMode, metricThetaSlice, latticeSlice]);

  useEffect(() => {
    if (!activePlanarSlice) {
      latticeSliceRef.current = null;
      latticeSliceVersionRef.current = 0;
      return;
    }
    const nextVersion = latticeSliceVersionRef.current + 1;
    latticeSliceVersionRef.current = nextVersion;
    latticeSliceRef.current = {
      data: activePlanarSlice.data,
      width: activePlanarSlice.width,
      height: activePlanarSlice.height,
      version: nextVersion,
      source: activePlanarSlice.source ?? null,
    };
  }, [activePlanarSlice]);

  useEffect(() => {
    if (!wireframeOverlay.overlay || !showWireframeOverlay) {
      setWireframePatches([]);
      return;
    }
    if (useFieldProbeOverlay && fieldProbe?.patches) {
      setWireframePatches(fieldProbe.patches.slice(0, 6));
      return;
    }
    const now = performance.now();
    if (now - wireframePatchTick.current < 90) return;
    wireframePatchTick.current = now;
    const { patches } = colorizeWireframeOverlay(wireframeOverlay.overlay, {
      phase01: ds.phase01 ?? 0,
      sectorCenter01,
      gaussianSigma,
      totalSectors,
      liveSectors,
      sectorFloor: ds.sectorFloor,
      lumpExp: lumpBoostExp,
      duty: dutyFR,
      gateView,
      splitEnabled: ds.splitEnabled,
      splitFrac: ds.splitFrac,
      syncMode,
      tilesPerSectorVector,
      fieldThreshold: 0.4,
      gradientThreshold: 0.2,
    });
    setWireframePatches((patches ?? []).slice(0, 6));
  }, [
    fieldProbe?.patches,
    useFieldProbeOverlay,
    wireframeOverlay.overlay,
    showWireframeOverlay,
    ds.phase01,
    sectorCenter01,
    gaussianSigma,
    totalSectors,
    liveSectors,
    ds.sectorFloor,
    lumpBoostExp,
    dutyFR,
    gateView,
    ds.splitEnabled,
    ds.splitFrac,
    syncMode,
    tilesPerSectorVector,
  ]);

  // === NEW: Split peak calculation per planarVizMode mode ==================================
  const thetaField_GR = useMemo(() => {
    if (planarVizMode !== 0) return null;
    const nx = res, ny = res;
    const field = new Float32Array(nx * ny);
    const domainScale = hullDomainScale;
    const useMetricTheta = !!metricThetaSlice;
    const useLatticeDfdr = volumeSource === "lattice" && !!latticeSlice;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (useMetricTheta && metricThetaSlice) {
          const idx = j * nx + i;
          field[idx] = thetaSign * metricThetaSlice.data[idx * 4];
          continue;
        }
        if (useLatticeDfdr && latticeSlice) {
          const idx = j * nx + i;
          field[idx] = thetaSign * latticeSlice.data[idx * 4];
          continue;
        }
        const gx = -1 + 2 * (i / (nx - 1));
        const gz = -1 + 2 * (j / (ny - 1));
        const ax = Math.max(1e-6, axes[0]);
        const az = Math.max(1e-6, axes[2]);
        const xView = gx * domainScale * axes[0];
        const zView = gz * domainScale * axes[2];
        const mx = xView / ax;
        const mz = zView / az;
        const r = Math.sqrt(mx * mx + mz * mz);
        const cos = mx / Math.max(r, 1e-6);
        const dfdr = dTopHatDr(r, sigma, R);
        field[j * nx + i] = thetaSign * beta * cos * dfdr;
      }
    }
    return field;
  }, [planarVizMode, beta, thetaSign, sigma, R, axes, res, hullDomainScale, latticeSlice, metricThetaSlice, volumeSource]);

  const rhoField_GR = useMemo(() => {
    if (planarVizMode !== 1) return null;
    const nx = res, ny = res;
    const field = new Float32Array(nx * ny);
    const domainScale = hullDomainScale;
    const INV16PI = 0.019894367886486918;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = -1 + 2 * (i / (nx - 1));
        const gz = -1 + 2 * (j / (ny - 1));
        const ax = Math.max(1e-6, axes[0]);
        const az = Math.max(1e-6, axes[2]);
        const xView = gx * domainScale * axes[0];
        const zView = gz * domainScale * axes[2];
        const mx = xView / ax;
        const mz = zView / az;
        const r = Math.max(1e-6, Math.sqrt(mx * mx + mz * mz));
        const cosX = mx / r;
        const cosZ = mz / r;
        const dfdr = dTopHatDr(r, sigma, R);
        const dfx = dfdr * cosX / ax;
        const dfz = dfdr * cosZ / az;
        const Kxx = -beta * dfx;
        const Kxy = 0;                   // y=0 slice
        const Kxz = -0.5 * beta * dfz;
        const K2 = Kxx * Kxx;
        const KijKij = Kxx * Kxx + 2 * Kxy * Kxy + 2 * Kxz * Kxz;
        field[j * nx + i] = (K2 - KijKij) * INV16PI; // Ã¢â€°Â¤ 0 in shell
      }
    }
    return field;
  }, [planarVizMode, beta, sigma, R, axes, res, hullDomainScale]);

  const thetaField_Drive = useMemo(() => {
    if (planarVizMode !== 2) return null;
    const nx = res, ny = res;
    const field = new Float32Array(nx * ny);
    const twoPi = 2 * Math.PI;
    const domainScale = hullDomainScale;
    const fActiveSafe = Math.max(1e-9, gateSource === "blanket" ? 1 : fActive);
    const useLatticeDrive = volumeSource === "lattice" && !!latticeSlice;
    const useLatticeSdf = useLatticeDrive && !!latticeSlice?.hasSdf;
    const gateViewSafe = Math.max(0, gateView);
    const samplePoint: Vec3 = [0, 0, 0];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = -1 + 2 * (i / (nx - 1));
        const gz = -1 + 2 * (j / (ny - 1));
        const ax = Math.max(1e-6, axes[0]);
        const az = Math.max(1e-6, axes[2]);
        const xView = gx * domainScale * axes[0];
        const zView = gz * domainScale * axes[2];
        const mx = xView / ax;
        const mz = zView / az;
        const r = Math.sqrt(mx * mx + mz * mz);
        const cos = mx / Math.max(r, 1e-6);
        const dfdr = dTopHatDr(r, sigma, R);
        const thetaGR = beta * cos * dfdr;
        const ang = Math.atan2(zView, xView);
        let a01 = (ang < 0 ? ang + twoPi : ang) / twoPi;
        a01 = a01 + (ds.phase01 - Math.floor(ds.phase01));
        a01 = a01 - Math.floor(a01);
        const schedule = driveWeightAt(a01);
        let blanket = 1;
        let driveSample = 0;
        let sdfBand = 0;
        if (useLatticeDrive && latticeSlice) {
          const idx = (j * nx + i) * 4;
          driveSample = latticeSlice.data[idx + 1];
          sdfBand = useLatticeSdf ? latticeSlice.data[idx + 2] : 0;
          if (gateSource !== "schedule") {
            blanket = latticeSlice.data[idx + 3];
          }
        } else if (gateSource !== "schedule" && latticeFieldSampler) {
          samplePoint[0] = xView;
          samplePoint[2] = zView;
          blanket = sampleGate01AtWorld(samplePoint, latticeFieldSampler);
        }
        let w = schedule;
        if (gateSource === "blanket") {
          w = blanket;
        } else if (gateSource === "combined") {
          w = schedule * blanket;
        }
        const gateWF = Math.pow(
          Math.sqrt(Math.max(0, w) / fActiveSafe),
          lumpBoostExp
        );

        const driveAnalytic = thetaGR * ampChain * gate * gateWF;
        let drive = driveAnalytic;
        if (useLatticeDrive) {
          let driveWeighted = driveSample;
          if (latticeUseDynamicWeights) {
            driveWeighted *= gateWF;
          }
          if (useLatticeSdf) {
            const sdfBlend = sdfBand * sdfBand;
            drive = driveWeighted * (1 - sdfBlend) + driveAnalytic * sdfBlend;
          } else {
            drive = driveWeighted;
          }
        }
        drive *= gateViewSafe;
        field[j * nx + i] = thetaSign * drive;
      }
    }
    return field;
  }, [planarVizMode, beta, thetaSign, sigma, R, ampChain, gate, gateView, fActive, gateSource, axes, res, lumpBoostExp, driveWeightAt, ds.phase01, hullDomainScale, volumeSource, latticeFieldSampler, latticeSlice, latticeUseDynamicWeights]);

  const [thetaPkAbs, thetaPkPos, thetaMin, thetaMax] = useMemo(() => {
    const field = planarVizMode === 0 ? thetaField_GR : planarVizMode === 1 ? rhoField_GR : thetaField_Drive;
    if (!field) return [1e-9, 1e-9, 0, 0] as const;
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    const posSamples: number[] = [];
    for (let i = 0; i < field.length; i++) {
      const sample = field[i];
      if (sample < minVal) minVal = sample;
      if (sample > maxVal) maxVal = sample;
      if (sample > 0) posSamples.push(sample);
    }
  const tailFrac = planarVizMode === 2 ? 0.1 : 0.4;
  const tailPkAbs = Math.max(1e-9, tailPeakAbs(field, tailFrac));
  const tailPkPos = posSamples.length ? Math.max(1e-9, tailPeakAbs(posSamples, tailFrac)) : tailPkAbs;
    // For Drive mode, stabilize span by trimming to 5Ã¢â‚¬â€œ95% quantiles (robust ÃŽâ€ÃŽÂ¸)
    if (planarVizMode === 2) {
      // Only compute quantiles when needed; use downsampled estimator for perf
      const q05 = quantileSample(field, 0.05);
      const q95 = quantileSample(field, 0.95);
      // Ensure ordering in degenerate cases
      if (Number.isFinite(q05) && Number.isFinite(q95) && q95 >= q05) {
        minVal = q05;
        maxVal = q95;
      }
    }
    if (!Number.isFinite(minVal)) minVal = 0;
    if (!Number.isFinite(maxVal)) maxVal = 0;
    return [tailPkAbs, tailPkPos, minVal, maxVal] as const;
  }, [planarVizMode, thetaField_GR, rhoField_GR, thetaField_Drive]);
  const thetaPk = thetaPkAbs;
  // Raw baseline from the sampled minimum
  const rawYBias = useMemo(() => (Number.isFinite(thetaMin) ? thetaMin : 0), [thetaMin]);
  // Mid-bias to center the surface vertically (average of min/max)
  const rawYMid = useMemo(() => {
    if (Number.isFinite(thetaMin) && Number.isFinite(thetaMax)) return (thetaMin + thetaMax) * 0.5;
    return rawYBias;
  }, [thetaMin, thetaMax, rawYBias]);
  const mapT = (theta: number) => Math.tanh((1.4 * theta) / thetaPk);

  // World-space target half-height (meters) shared by yGain and camera
  const targetHalf = useMemo(() => {
    const targetFrac = Number((live as any)?.view?.yTargetFrac);
    const minFrac    = Number((live as any)?.view?.yMinFrac);
    const maxFrac    = Number((live as any)?.view?.yMaxFrac);
    const tf = Number.isFinite(targetFrac) ? targetFrac : 3.00;  // 300% of R
    const mf = Number.isFinite(minFrac)    ? minFrac    : 0.0;        // allow micro heights
    const xf = Number.isFinite(maxFrac)    ? maxFrac    : 3.00;  // cap at 300%
    // IMPORTANT: match pre-change visuals Ã¢â‚¬â€ do NOT scale by hull axes here.
    // Previously we multiplied by axScale = max(axes.x, axes.z), which suppressed
    // apparent height for very wide hulls. Revert to pure R scaling for yGain.
    return clamp(tf, mf, xf) * R;
  }, [live, R, axes]);

  // Camera fit bias (already added earlier)
  const heightFitBias = useMemo(() => {
    const v = Number((live as any)?.view?.heightFitBias);
    return Number.isFinite(v) ? clamp(v, 0.1, 1.0) : 0.55;
  }, [live]);

  // NEW: simple knobs to center the plane vertically by lowering the camera.
  // You can override live.view.eyeYScale / eyeYBase at runtime.
  const eyeYScale = useMemo(() => {
    const v = Number((live as any)?.view?.eyeYScale);
    return Number.isFinite(v) ? v : 0.65; // was 1.10
  }, [live]);
  const eyeYBase = useMemo(() => {
    const v = Number((live as any)?.view?.eyeYBase);
    return Number.isFinite(v) ? v : 0.06; // was 0.12
  }, [live]);

  // ---- Analytic peak estimate: df/dr peak at the wall ----
  const dfdr_peak_est = useMemo(() => {
    const t = Math.tanh(Math.max(1e-6, sigma * R));
    return sigma / (2 * Math.max(1e-6, t)); // analytic peak estimate
  }, [sigma, R]);

  // Analytic reference amplitude per planarVizMode (peak at the wall)
  const ampRef = useMemo(() => {
    const INV16PI = 0.019894367886486918;
    if (planarVizMode === 0) return Math.abs(beta * dfdr_peak_est);                       // ÃŽÂ¸_GR
    if (planarVizMode === 1) return Math.abs(beta * beta * dfdr_peak_est * dfdr_peak_est * INV16PI); // ÃÂ_GR
    return Math.abs(ampChain * beta * dfdr_peak_est * gateView);                    // ÃŽÂ¸_Drive
  }, [planarVizMode, beta, dfdr_peak_est, ampChain, gateView]);

  const yGain = useMemo(() => {
    const usr = Number((live as any)?.view?.yGain);
    if (Number.isFinite(usr) && usr > 0) return usr;
    // Use the sampled peak to keep curvature legible, with analytic fallback when needed.
    const sampleAmp = Number.isFinite(thetaPkPos) ? thetaPkPos : 0;
    const fallbackAmp = Number.isFinite(ampRef) ? Math.abs(ampRef) : 0;
    const span = (Number.isFinite(thetaMax) && Number.isFinite(thetaMin))
      ? Math.max(1e-9, thetaMax - thetaMin)
      : 1e-9;
    const baseDenom = Math.max(span, sampleAmp, fallbackAmp, 1e-9);
    let gain = targetHalf / baseDenom;
    // Ensure the rendered curvature occupies a healthy fraction of the viewport.
    const projected = gain * span;
    const minFillFrac = planarVizMode === 1 ? 0.12 : 0.35;
    const minFill = targetHalf * minFillFrac;
    if (projected < minFill) {
      gain *= minFill / Math.max(projected, 1e-12);
    }
    // Apply per-mode boosts so higher-energy regimes remain legible.
    const mode = String(live?.currentMode || "").toLowerCase();
    const modeProfile = (() => {
      switch (mode) {
        case "standby":   return { boost: 31.2,   betaRef: 0.02 };
        case "taxi":      return { boost: 42.4,   betaRef: 0.05 };
        case "nearzero":  return { boost: 56.0,   betaRef: 0.08 };
        case "hover":     return { boost: 76.8,   betaRef: 0.18 };
        case "cruise":    return { boost: 102.4,  betaRef: 0.60 };
        case "emergency": return { boost: 121.6,  betaRef: 0.90 };
        default:          return { boost: 59.2,   betaRef: 0.30 };
      }
    })();
    const betaRef = Number.isFinite(modeProfile.betaRef) ? modeProfile.betaRef : 0.3;
    const betaClamped = clamp(beta, 1e-4, 0.99);
    const betaAdjust = betaRef > 0 ? clamp(betaRef / betaClamped, 0.45, 2.8) : 1;
    const betaScale = planarVizMode === 1 ? 1 : betaAdjust;
    const modeBoost = planarVizMode === 1 ? 6.0 : modeProfile.boost;
  const planarVizModeGain = planarVizMode === 0 ? 0.34 : planarVizMode === 1 ? 0.009 : 1; // tailor per-planarVizMode scaling so GR modes stay within view
    return gain * modeBoost * betaScale * planarVizModeGain;
  }, [targetHalf, thetaPkPos, ampRef, thetaMax, thetaMin, live, planarVizMode]);

  // Build a key that changes when "non-phase" parameters change (so we refresh locks),
  // but stays constant when only phase/scheduler rotates the lobe.
  const baselineResetKey = useMemo(
    () => JSON.stringify([
      planarVizMode,
      // geometry/physics shaping
      beta, sigma, R, axes,
      ampChain, gate, dutyFR,
      totalSectors, liveSectors,
      gaussianSigma, fActive,
      ds.splitEnabled, ds.splitFrac, ds.sectorFloor,
      lumpBoostExp,
    ]),
    [planarVizMode, beta, sigma, R, axes, ampChain, gate, dutyFR, totalSectors, liveSectors, gaussianSigma, fActive, ds.splitEnabled, ds.splitFrac, ds.sectorFloor, lumpBoostExp]
  );

  // Lock vertical scale against phase-only jitter in ÃŽÂ¸ (Drive)
  const [lockScale, setLockScale] = useState<boolean>(false);
  const [lockedYGain, setLockedYGain] = useState<number>(() => yGain);
  // Refresh locked gain on non-phase changes
  useEffect(() => {
    if (planarVizMode !== 2) return;
    if (!lockScale) return;
    setLockedYGain(yGain);
  // reuse baselineResetKey so phase-only movement doesnÃ¢â‚¬â„¢t refresh
  }, [planarVizMode, lockScale, yGain, baselineResetKey]);
  // Follow live gain when unlocked
  useEffect(() => {
    if (planarVizMode !== 2) return;
    if (lockScale) return;
    setLockedYGain(yGain);
  }, [planarVizMode, lockScale, yGain]);
  // GR modes: always mirror live gain
  useEffect(() => {
    if (planarVizMode === 2) return;
    setLockedYGain(yGain);
  }, [planarVizMode, yGain]);
  const yGainFinal = useMemo(() => (planarVizMode === 2 && lockScale ? lockedYGain : yGain), [planarVizMode, lockScale, lockedYGain, yGain]);

  const kColor = useMemo(() => {
    const usr = Number((live as any)?.view?.kColor);
    if (Number.isFinite(usr) && usr > 0) return usr;
    return 0.85 / Math.max(1e-18, thetaPk);
  }, [live, thetaPk]);

  // Floor baseline lock: keep yBias stable when only phase moves (ÃŽÂ¸ Drive)
  const [lockBaseline, setLockBaseline] = useState<boolean>(true);
  // Center plane option: use mid (min/max average) for y-bias and lock camera framing
  const [centerPlane, setCenterPlane] = useState<boolean>(true);
  const driveBiasRef = useRef<number>(0);
  const [lockedBias, setLockedBias] = useState<number>(0);
  // Initialize or refresh locked baseline when significant (non-phase) inputs change
  // 1) Locked baseline (Drive mode): update only when non-phase inputs change
  useEffect(() => {
    if (planarVizMode !== 2) return;
    if (!lockBaseline) return;
    const base = centerPlane ? rawYMid : rawYBias;
    driveBiasRef.current = base;
    setLockedBias(base);
  }, [baselineResetKey, planarVizMode, lockBaseline, centerPlane]);

  // 2) Follow baseline when unlocked (Drive mode): update continuously with raw values
  useEffect(() => {
    if (planarVizMode !== 2) return;
    if (lockBaseline) return;
    const base = centerPlane ? rawYMid : rawYBias;
    driveBiasRef.current = base;
    setLockedBias(base);
  }, [planarVizMode, lockBaseline, centerPlane, rawYBias, rawYMid]);

  // 3) GR modes: always mirror centered baseline
  useEffect(() => {
    if (planarVizMode === 2) return;
    driveBiasRef.current = rawYMid;
    setLockedBias(rawYMid);
  }, [planarVizMode, rawYMid]);
  // Final yBias used by renderer
  const yBias = useMemo(() => {
    if (planarVizMode === 2) {
      // In Drive mode, prefer lockedBias if lock is on; otherwise follow center/floor choice live
      return lockBaseline ? lockedBias : (centerPlane ? rawYMid : rawYBias);
    }
    // In GR modes, center by default
    return rawYMid;
  }, [planarVizMode, lockBaseline, lockedBias, centerPlane, rawYMid, rawYBias]);

  const metricAlpha = useMemo(() => {
    const alphaRaw = Number((live as any)?.warp?.metricAdapter?.alpha);
    return Number.isFinite(alphaRaw) && alphaRaw > 1e-6 ? alphaRaw : 1;
  }, [live]);

  const natarioLike = useMemo(() => {
    const wf = String(warpFieldType ?? "").toLowerCase();
    return wf.includes("natario");
  }, [warpFieldType]);

  // Compute MVP to fit both horizontal (domain) and vertical (curvature) extents
  const mvp = useMemo(() => {
    const fovy = 40 * Math.PI/180;
    const tanY = Math.tan(fovy * 0.5);
    const tanX = tanY * Math.max(0.2, aspect);

  // Horizontal half-extent with axes scaling (geometry scaled by domain*axes)
  const halfX = hullDomainScale * (axes[0] || 1);
  const halfZ = hullDomainScale * (axes[2] || 1);
  const halfW = Math.max(halfX, halfZ);

    // Vertical half-extent (world space). Let the camera auto-expand to cover the
    // rendered curvature (sampled max) with a small headroom margin.
    const span = (Number.isFinite(thetaMax) && Number.isFinite(thetaMin)) ? Math.max(thetaMax - thetaMin, 1e-9) : 1e-9;
    const renderHalf = Math.abs(yGain) * span;
    // When centering the plane, hold framing to targetHalf so phase changes don't shift distance
    const desiredHalf = centerPlane ? targetHalf : Math.max(targetHalf, renderHalf);
    const clampedHalf = centerPlane ? targetHalf : Math.min(desiredHalf, targetHalf * 2.6);
    const halfH = Math.max(1e-6, (centerPlane ? targetHalf : clampedHalf) * 1.05);
    const fitH  = halfH * heightFitBias;

    // Distance to fit width/height
    const dByW = halfW / Math.max(1e-6, tanX);
    const dByH = fitH  / Math.max(1e-6, tanY);
    const dist = Math.max(dByW, dByH) * 1.35 + Math.max(5, 0.15 * R); // keep bubble filling the frame

    const near = Math.max(0.05, dist - (halfW + fitH) - 5);
    const far  = dist + (halfW + fitH) + 50;

    // Build perspective * lookAt; slight tilt for readability
    const f = 1/Math.tan(fovy/2);
    const P = [
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)/(near-far),-1,
      0,0,(2*far*near)/(near-far),0,
    ];
    // eye above +z looking at origin
    const eyeY = fitH * eyeYScale + R * eyeYBase;
    const V = [
      1,0,0,0,
      0,0.96,-0.28,0,
      0,0.28, 0.96,0,
      0,-eyeY,-dist,1,
    ];
    const M = new Float32Array(16);
    for (let r=0;r<4;r++){
      for (let c=0;c<4;c++){
        let s=0; for (let k=0;k<4;k++) s += P[k*4+r]*V[c*4+k];
        M[c*4+r]=s;
      }
    }
    return M;
  }, [aspect, R, targetHalf, heightFitBias, eyeYScale, eyeYBase, axes, yGain, thetaMax, thetaMin, centerPlane, hullDomainScale]);

  // === Dynamic param refs (decouple GL init from frequent pipeline changes) ===
  const dynRef = useRef({
    axes: [1,1,1] as [number,number,number],
    sigma: 6,
    R: 1,
    domainScale: 1,
    beta: 0,
    alpha: 1,
    natarioLike: false,
    thetaSign: 1,
    planarVizMode: 0 as VizMode,
    skyboxMode: "off" as Hull3DSkyboxMode,
    volumeViz: "theta_drive" as Hull3DVolumeViz,
    volumeSource: "lattice" as HullVolumeSource,
    ampChain: 1,
    gate: 0,
    gateView: 0,
    gateSource: "combined" as HullGateSource,
    latticeDynamicWeights: 1,
    duty: 0,
    yGain: 1,
    yBias: 0,
    kColor: 1,
    mvp: new Float32Array(16),
    totalSectors: 1,
    liveSectors: 1,
    lumpBoostExp: 1.25,
    sectorCenter: 0,
    sectorSigma: 0.1,
    sectorFloor: 0.1,
    syncMode: 1,
    phase01: 0,
    showSurfaceOverlay: true,
    betaOverlayEnabled: false,
    betaTarget_ms2: ONE_G_MS2,
    comfort_ms2: 0.4 * ONE_G_MS2,
    vizFloorThetaGR: vizFloorDefaults.thetaGR,
    vizFloorRhoGR: vizFloorDefaults.rhoGR,
    vizFloorThetaDrive: vizFloorDefaults.thetaDrive,
    betaUniform_ms2: ONE_G_MS2,
    hullDims: [1, 1, 1] as [number, number, number],
    betaTexture: null,
    betaSampler: null,
    previewMesh: null as HullPreviewMeshPayload | null,
  });

  // Immediate priming (so first frame doesn't see zeroed MVP/uniforms)
  dynRef.current.axes = axes;
  dynRef.current.sigma = sigma;
  dynRef.current.R = R;
  dynRef.current.domainScale = hullDomainScale;
  dynRef.current.beta = beta;
  dynRef.current.alpha = metricAlpha;
  dynRef.current.natarioLike = natarioLike;
  dynRef.current.thetaSign = thetaSign;
  dynRef.current.planarVizMode = planarVizMode;
  dynRef.current.skyboxMode = skyboxMode;
  dynRef.current.volumeViz = hullVolumeVizLive;
  dynRef.current.volumeSource = volumeSource;
  (dynRef.current as any).volumeDomain = hullVolumeDomain;
  (dynRef.current as any).opacityWindow = bubbleOpacityWindow;
  dynRef.current.ampChain = ampChain;
  dynRef.current.gate = gateRaw;
  dynRef.current.gateView = gateView;
  (dynRef.current as any).gateSource = gateSource;
  (dynRef.current as any).latticeDynamicWeights = latticeUseDynamicWeights ? 1 : 0;
  dynRef.current.duty = dutyFR;
  dynRef.current.yGain = yGainFinal;
  dynRef.current.yBias = yBias;
  dynRef.current.kColor = kColor;
  dynRef.current.vizFloorThetaGR = vizFloors.thetaGR;
  dynRef.current.vizFloorRhoGR = vizFloors.rhoGR;
  dynRef.current.vizFloorThetaDrive = vizFloors.thetaDrive;
  dynRef.current.mvp = mvp;
  dynRef.current.totalSectors = totalSectors;
  dynRef.current.liveSectors = liveSectors;
  dynRef.current.lumpBoostExp = lumpBoostExp;
  dynRef.current.sectorCenter = sectorCenter01;
  dynRef.current.sectorSigma = gaussianSigma;
  dynRef.current.sectorFloor = ds.sectorFloor;
  dynRef.current.syncMode = syncMode;
  // Pass split to dynRef for uniform updates
  (dynRef.current as any).splitEnabled = ds.splitEnabled ? 1 : 0;
  (dynRef.current as any).splitFrac = ds.splitFrac;
  dynRef.current.phase01 = ds.phase01;
  dynRef.current.showSurfaceOverlay = showHullSurfaceOverlay;
  const hullDimsInit: [number, number, number] = [
    Math.max(Math.abs(axes[0]) * R * 2, 1e-3),
    Math.max(Math.abs(axes[1]) * R * 2, 1e-3),
    Math.max(Math.abs(axes[2]) * R * 2, 1e-3),
  ];
  dynRef.current.hullDims = hullDimsInit;
  dynRef.current.betaOverlayEnabled = betaOverlayEnabled;
  dynRef.current.betaTarget_ms2 = betaTargetMs2;
  dynRef.current.comfort_ms2 = betaComfortMs2;
  dynRef.current.betaUniform_ms2 = betaTargetMs2;
  dynRef.current.betaTexture = null;
  dynRef.current.betaSampler = null;
  dynRef.current.previewMesh = previewMeshForRenderer;

  useEffect(()=>{
    dynRef.current.axes = axes;
    dynRef.current.sigma = sigma;
    dynRef.current.R = R;
    dynRef.current.beta = beta;
    dynRef.current.alpha = metricAlpha;
    dynRef.current.natarioLike = natarioLike;
    dynRef.current.thetaSign = thetaSign;
    dynRef.current.planarVizMode = planarVizMode;
    dynRef.current.skyboxMode = skyboxMode;
    dynRef.current.volumeViz = hullVolumeVizLive;
    dynRef.current.volumeSource = volumeSource;
    dynRef.current.ampChain = ampChain;
    dynRef.current.gate = gateRaw;
    dynRef.current.gateView = gateView;
    (dynRef.current as any).gateSource = gateSource;
    (dynRef.current as any).latticeDynamicWeights = latticeUseDynamicWeights ? 1 : 0;
    dynRef.current.duty = dutyFR;
  dynRef.current.yGain = yGainFinal;
    dynRef.current.yBias = yBias;
    dynRef.current.kColor = kColor;
    dynRef.current.vizFloorThetaGR = vizFloors.thetaGR;
    dynRef.current.vizFloorRhoGR = vizFloors.rhoGR;
    dynRef.current.vizFloorThetaDrive = vizFloors.thetaDrive;
    dynRef.current.mvp = mvp;
    dynRef.current.totalSectors = totalSectors;
    dynRef.current.liveSectors = liveSectors;
    dynRef.current.lumpBoostExp = lumpBoostExp;
  dynRef.current.sectorCenter = sectorCenter01;
  dynRef.current.sectorSigma = gaussianSigma;
  dynRef.current.sectorFloor = ds.sectorFloor;
  dynRef.current.syncMode = syncMode;
  dynRef.current.phase01 = ds.phase01;
  dynRef.current.showSurfaceOverlay = showHullSurfaceOverlay;
  dynRef.current.hullDims = hullDimsEffective;
  dynRef.current.betaOverlayEnabled = betaOverlayEnabled;
  dynRef.current.betaTarget_ms2 = betaTargetMs2;
  dynRef.current.comfort_ms2 = betaComfortMs2;
  dynRef.current.betaUniform_ms2 = betaTargetMs2;
  dynRef.current.betaTexture = null;
  dynRef.current.betaSampler = null;
  dynRef.current.previewMesh = previewMeshForRenderer;
  (dynRef.current as any).splitEnabled = ds.splitEnabled ? 1 : 0;
  (dynRef.current as any).splitFrac = ds.splitFrac;
  }, [axes, sigma, R, beta, metricAlpha, natarioLike, thetaSign, planarVizMode, skyboxMode, hullVolumeVizLive, volumeSource, ampChain, gateRaw, gateView, gateSource, latticeUseDynamicWeights, dutyFR, yGainFinal, yBias, kColor, mvp, totalSectors, liveSectors, lumpBoostExp, sectorCenter01, gaussianSigma, ds.sectorFloor, syncMode, ds.phase01, showHullSurfaceOverlay, betaOverlayEnabled, betaTargetMs2, betaComfortMs2, ds.splitEnabled, ds.splitFrac, hullGeometry, hullRadiusLUT, hullSdf, hullDimsEffective, previewMeshForRenderer]);

  useEffect(() => {
    const fActiveRenderer = gateSource === "blanket" ? 1 : fActive;
    const base: Hull3DRendererState = {
      axes,
      domainScale: hullDomainScale,
      boundsProfile: bubbleBoundsMode,
      geometry: hullGeometry,
      hullRadiusLUT: hullRadiusLUT?.data,
      hullRadiusLUTSize: hullRadiusLUT?.size,
      hullRadiusMax: hullRadiusLUT?.maxR ?? hullRadiusMax,
      hullSDF: hullSdf?.data,
      hullSDFDims: hullSdf?.dims,
      hullSDFBounds: hullSdf?.bounds,
      hullSDFBand: hullSdf?.band,
      hullSDFFormat: hullSdf?.format,
      R,
      sigma,
      beta,
      ampChain,
      exoticMass_kg: exoticMassNow,
      exoticMassTarget_kg: exoticMassTarget,
      gate: gateRaw,
      gateView,
      gateSource,
      tilesPerSectorVector,
      vizFloorThetaGR: vizFloors.thetaGR,
      vizFloorRhoGR: vizFloors.rhoGR,
      vizFloorThetaDrive: vizFloors.thetaDrive,
      fActive: fActiveRenderer,
      duty: dutyFR,
      exposure: (() => {
        // Map [0,1] -> [1e-2, 1e+2] with center 0.5 = 1x using 10^(4*(x-0.5))
        const x = Math.max(0, Math.min(1, hullExposure01));
        const exp = Math.pow(10, 4 * (x - 0.5));
        return Number.isFinite(exp) ? exp : 1.0;
      })(),
      gaussianSigma,
      sectorCenter01,
      totalSectors,
      liveSectors,
      sectorFloor: ds.sectorFloor,
      lumpExp: lumpBoostExp,
      splitEnabled: Boolean(ds.splitEnabled),
      splitFrac: ds.splitFrac,
      syncMode,
      phase01: ds.phase01,
      thetaSign,
      showSectorRing: showHullSectorRing,
      showGhostSlice: voxelSliceActive,
      showSurfaceOverlay: showHullSurfaceOverlay && !surfaceOverlaySuppressed,
      betaOverlayEnabled,
      betaTarget_ms2: betaTargetMs2,
      comfort_ms2: betaComfortMs2,
      betaUniform_ms2: betaTargetMs2,
      hullDims: hullDimsEffective,
      betaTexture: null,
      betaSampler: null,
      followPhase: followHullPhase,
      volumeViz: hullVolumeVizLive,
      volumeDomain: hullVolumeDomain,
      volumeSource,
      warpFieldType,
      opacityWindow: bubbleOpacityWindow,
      camera: cardCameraFrame,
      blendFactor: hullBlend,
      freeze: bubbleStatus === "CRITICAL",
      timeSec: 0,
      bubbleStatus,
      aspect,
      previewMesh: previewMeshForRenderer,
      wireframeOverlay: wireframeOverlayForRenderer,
      overlays: overlayConfig,
      skybox: {
        mode: skyboxMode,
      },
      fluxStreamlines: {
        enabled: showFluxStreamlines,
        seedCount: fluxSeedCount,
        seedRadius: fluxSeedRadius,
        seedSpread: fluxSeedSpread,
      },
      latticeFrame: latticeModeEnabled ? sharedLatticeState?.frame ?? null : null,
      latticePreset: latticeModeEnabled ? sharedLatticeState?.preset ?? "auto" : "auto",
      latticeProfileTag: latticeModeEnabled ? sharedLatticeState?.profileTag ?? "preview" : "preview",
      latticeClampReasons: latticeModeEnabled ? sharedLatticeState?.frame?.clampReasons ?? [] : [],
      latticeStrobe: latticeModeEnabled ? sharedLatticeState?.strobe ?? null : null,
      latticeSdf: latticeModeEnabled ? latticeSdfForRenderer : null,
      latticeVolume: latticeModeEnabled ? latticeVolumeForRenderer : null,
      latticeWeightMode: latticeUseDynamicWeights ? "dynamic" : "baked",
      latticeWorldToLattice: latticeModeEnabled ? sharedLatticeState?.frame?.worldToLattice ?? null : null,
      latticeMin: latticeModeEnabled ? sharedLatticeState?.frame?.bounds.minLattice ?? null : null,
      latticeSize: latticeModeEnabled ? sharedLatticeState?.frame?.bounds.size ?? null : null,
    };
    hullStateRef.current = base;
  }, [axes, hullDomainScale, bubbleBoundsMode, hullGeometry, hullRadiusMax, hullRadiusLUT, hullSdf, R, sigma, beta, ampChain, exoticMassNow, exoticMassTarget, gateView, gateRaw, gateSource, tilesPerSectorVector, fActive, dutyFR, gaussianSigma, sectorCenter01, totalSectors, liveSectors, ds.sectorFloor, lumpBoostExp, ds.splitEnabled, ds.splitFrac, syncMode, ds.phase01, thetaSign, showHullSectorRing, voxelSliceActive, showHullSurfaceOverlay, betaOverlayEnabled, betaTargetMs2, betaComfortMs2, followHullPhase, hullVolumeVizLive, hullVolumeDomain, volumeSource, warpFieldType, bubbleOpacityWindow, cardCameraFrame, hullBlend, bubbleStatus, aspect, vizFloors.thetaGR, vizFloors.rhoGR, vizFloors.thetaDrive, overlayConfig, skyboxMode, showFluxStreamlines, fluxSeedCount, fluxSeedRadius, fluxSeedSpread, sharedPhase, sharedSampling, sharedPhysicsState, sharedComplianceState, sharedSectorState, sharedPaletteState, wireframeOverlayForRenderer, latticeModeEnabled, latticeSdfForRenderer, latticeVolumeForRenderer, sharedLatticeState?.frame, sharedLatticeState?.preset, sharedLatticeState?.profileTag, sharedLatticeState?.strobe, previewMeshForRenderer, latticeUseDynamicWeights]);

  // When an operational mode that implies drive activity is set, default to theta(Drive)
  // once, unless the user has already picked a planarVizMode explicitly. Only override planar GR modes.
  useEffect(() => {
    if (userVizLocked) return;
    const m = String((live as any)?.currentMode || '').toLowerCase();
    const drivey = m === 'hover' || m === 'cruise' || m === 'emergency' || m === 'nearzero';
    if (drivey && (planarVizMode === 0 || planarVizMode === 1)) {
      setPlanarVizMode(2);
    }
  }, [live, userVizLocked, planarVizMode]);

  // === WebGL init effect (runs once unless resolution changes) ===
  useEffect(() => {
    if (hullRendererBackend === "mis-service" || planarVizMode === 3) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const gl = cv.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
      console.error("[Alcubierre] WebGL2 unavailable Ã¢â‚¬â€œ cannot render Alcubierre panel");
      setGlError("WebGL2 unavailable in this browser.");
      return;
    }

    glRef.current = gl;
    let disposed = false;
    // Poll renderer diagnostic message exposed on window by Hull3DRenderer
    let diagTimer: number | null = null;
    const startDiagPoll = () => {
      if (diagTimer) return;
      diagTimer = window.setInterval(() => {
        try {
          const msgObj = (window as any).__hullDiagMessage as null | { message?: string };
          setHullDiagMsg(msgObj?.message ?? null);
        } catch {
          /* noop */
        }
      }, 500);
    };
    const stopDiagPoll = () => {
      if (diagTimer) {
        clearInterval(diagTimer);
        diagTimer = null;
      }
    };
    let raf = 0;
    let ro: ResizeObserver | null = null;
  let vbo: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let fallbackBuf: WebGLBuffer | null = null;
  let fallbackVAO: WebGLVertexArrayObject | null = null;
    let prog: WebGLProgram | null = null;
    let geoBundleProgram: WebGLProgram | null = null;
    let geoBundleVbo: WebGLBuffer | null = null;
    let geoBundleLoc: {
      u_color: WebGLUniformLocation | null;
      u_alpha: WebGLUniformLocation | null;
    } | null = null;
    let latticeSliceTex: WebGLTexture | null = null;
    let latticeSliceVersion = 0;

    const markError = (message: string | null) => {
      if (!disposed) {
        setGlError(message);
      }
    };

    const glErrorToString = (err: number) => {
      switch (err) {
        case gl.INVALID_ENUM: return "INVALID_ENUM";
        case gl.INVALID_VALUE: return "INVALID_VALUE";
        case gl.INVALID_OPERATION: return "INVALID_OPERATION";
        case gl.INVALID_FRAMEBUFFER_OPERATION: return "INVALID_FRAMEBUFFER_OPERATION";
        case gl.OUT_OF_MEMORY: return "OUT_OF_MEMORY";
        case gl.CONTEXT_LOST_WEBGL: return "CONTEXT_LOST_WEBGL";
        default: return `0x${err.toString(16)}`;
      }
    };

    const checkError = (stage: string) => {
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        console.error(`[Alcubierre][GL] ${stage} Ã¢â€ â€™ ${glErrorToString(err)}`, err);
      }
    };

    const withLineNumbers = (src: string) =>
      src
        .split("\n")
        .map((line, idx) => `${String(idx + 1).padStart(4, "0")}: ${line}`)
        .join("\n");

    const shaderStageLabel = (type: number) => (type === gl.VERTEX_SHADER ? "vertex" : "fragment");

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) {
        console.error("[Alcubierre][GL] Unable to create shader object");
        markError("Failed to allocate shader object.");
        return null;
      }
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      checkError(`compile ${shaderStageLabel(type)} shader`);
      const info = (gl.getShaderInfoLog(shader) || "").trim();
      if (info.length) {
        console.warn(`[Alcubierre][GLSL][${shaderSources.label}] ${shaderStageLabel(type).toUpperCase()} log:\n${info}`);
      }
      const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      if (!ok) {
        const message = `${shaderSources.label} ${shaderStageLabel(type)} shader failed to compile`;
        console.error(`[Alcubierre][GLSL][${shaderSources.label}] ${message}\n${info || "(No info log)"}`);
        console.groupCollapsed(`[Alcubierre][GLSL][${shaderSources.label}] ${shaderStageLabel(type)} source`);
        console.error(withLineNumbers(src));
        console.groupEnd();
        markError(message);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const lost = (event: Event) => {
      console.warn("[Alcubierre] WebGL context lost", event);
      markError("WebGL context lost Ã¢â‚¬â€œ reload recommended.");
    };
    const restored = () => {
      console.warn("[Alcubierre] WebGL context restored");
    };
    cv.addEventListener("webglcontextlost", lost);
    cv.addEventListener("webglcontextrestored", restored);

    console.log(`[Alcubierre] WebGL2 context OK (shader: ${shaderSources.label})`);

    const vs = compile(gl.VERTEX_SHADER, shaderSources.vert);
    const fs = vs ? compile(gl.FRAGMENT_SHADER, shaderSources.frag) : null;

    if (!vs || !fs) {
      progRef.current = null;
      vboRef.current = null;
      vcountRef.current = 0;
      return () => {
        disposed = true;
        cv.removeEventListener("webglcontextlost", lost);
        cv.removeEventListener("webglcontextrestored", restored);
      };
    }

    prog = gl.createProgram();
    if (!prog) {
      console.error("[Alcubierre][GL] Unable to create program");
      markError("Failed to allocate shader program.");
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return () => {
        disposed = true;
        cv.removeEventListener("webglcontextlost", lost);
        cv.removeEventListener("webglcontextrestored", restored);
      };
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    checkError("link program");
    const programInfo = (gl.getProgramInfoLog(prog) || "").trim();
    if (programInfo.length) {
      console.warn(`[Alcubierre][GLSL][${shaderSources.label}] LINK log:\n${programInfo}`);
    }
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const message = `${shaderSources.label} program link failed`;
      console.error(`[Alcubierre][GLSL][${shaderSources.label}] ${message}\n${programInfo || "(No info log)"}`);
      markError(message);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      progRef.current = null;
      return () => {
        disposed = true;
        cv.removeEventListener("webglcontextlost", lost);
        cv.removeEventListener("webglcontextrestored", restored);
      };
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    progRef.current = prog;

    vbo = gl.createBuffer();
    if (!vbo) {
      markError("Failed to allocate vertex buffer.");
      gl.deleteProgram(prog);
      progRef.current = null;
      return () => {
        disposed = true;
        cv.removeEventListener("webglcontextlost", lost);
        cv.removeEventListener("webglcontextrestored", restored);
      };
    }
    vboRef.current = vbo;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const grid = makeGrid(res);
    gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
    checkError("bufferData grid");
    vcountRef.current = grid.length / 2;
    if (!vcountRef.current) {
      console.warn("[Alcubierre] VBO appears empty");
    }
    // Create VAO for grid
    vao = gl.createVertexArray();
    if (vao) {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }
    latticeSliceTex = gl.createTexture();
    if (latticeSliceTex) {
      gl.bindTexture(gl.TEXTURE_2D, latticeSliceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    const onResize = () => {
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, READABILITY_DPR_MAX);
      const w = Math.max(640, Math.floor(rect.width * dpr));
      const h = Math.max(360, Math.floor(rect.height * dpr));
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
      setAspect(w / Math.max(1, h));
      if (!w || !h) {
        console.warn("[Alcubierre] Canvas size is zero", w, h);
      }
    };

    onResize();
    ro = new ResizeObserver(onResize);
    ro.observe(cv);

    const loc = {
      a_pos: 0,
      u_axes: gl.getUniformLocation(prog, "u_axes"),
      u_sigma: gl.getUniformLocation(prog, "u_sigma"),
      u_R: gl.getUniformLocation(prog, "u_R"),
      u_beta: gl.getUniformLocation(prog, "u_beta"),
      u_thetaSign: gl.getUniformLocation(prog, "u_thetaSign"),
      u_viz: gl.getUniformLocation(prog, "u_viz"),
      u_ampChain: gl.getUniformLocation(prog, "u_ampChain"),
      u_gate: gl.getUniformLocation(prog, "u_gate"),
      u_gate_view: gl.getUniformLocation(prog, "u_gate_view"),
      u_gateSource: gl.getUniformLocation(prog, "u_gateSource"),
      u_latticeDynamicWeights: gl.getUniformLocation(prog, "u_latticeDynamicWeights"),
      u_latticeSlice: gl.getUniformLocation(prog, "u_latticeSlice"),
      u_hasLatticeSlice: gl.getUniformLocation(prog, "u_hasLatticeSlice"),
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
      u_vizFloorThetaGR: gl.getUniformLocation(prog, "u_vizFloorThetaGR"),
      u_vizFloorRhoGR: gl.getUniformLocation(prog, "u_vizFloorRhoGR"),
      u_vizFloorThetaDrive: gl.getUniformLocation(prog, "u_vizFloorThetaDrive"),
    } as const;

    const geoVs = compile(gl.VERTEX_SHADER, GEO_BUNDLE_VERT);
    const geoFs = geoVs ? compile(gl.FRAGMENT_SHADER, GEO_BUNDLE_FRAG) : null;
    if (geoVs && geoFs) {
      const geoProg = gl.createProgram();
      if (geoProg) {
        gl.attachShader(geoProg, geoVs);
        gl.attachShader(geoProg, geoFs);
        gl.linkProgram(geoProg);
        const geoOk = gl.getProgramParameter(geoProg, gl.LINK_STATUS);
        const geoInfo = (gl.getProgramInfoLog(geoProg) || "").trim();
        if (!geoOk) {
          console.warn(
            `[Alcubierre][GLSL][geodesic-bundle] program link failed: ${geoInfo || "(No info log)"}`
          );
          gl.deleteProgram(geoProg);
        } else {
          geoBundleProgram = geoProg;
          geoBundleLoc = {
            u_color: gl.getUniformLocation(geoProg, "u_color"),
            u_alpha: gl.getUniformLocation(geoProg, "u_alpha"),
          };
          geoBundleVbo = gl.createBuffer();
        }
      }
      gl.deleteShader(geoVs);
      gl.deleteShader(geoFs);
    }

    markError(null);

    let frame = 0;
    const draw = () => {
      if (disposed || !prog || !vbo) return;
      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(prog);
      checkError("useProgram");
      if (vao) {
        gl.bindVertexArray(vao);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      }

      const s = (x: number, d = 0) => (Number.isFinite(x) ? x : d);
      const d = dynRef.current;
      const gateView = Math.max(0, s((d as any).gateView ?? d.gate, 0));
      const floorThetaGR = Math.max(0, s((d as any).vizFloorThetaGR, 1e-9));
      const floorRhoGR = Math.max(0, s((d as any).vizFloorRhoGR, 1e-18));
      const floorThetaDrive = Math.max(0, s((d as any).vizFloorThetaDrive, 1e-6));
      const gateSource = (d as any).gateSource as HullGateSource | undefined;
      const gateSourceId = gateSource === "blanket" ? 1 : gateSource === "combined" ? 2 : 0;
      const latticeDynamicWeights = (d as any).latticeDynamicWeights ? 1 : 0;
      let hasLatticeSlice = false;
      if (latticeSliceTex) {
        const slice = latticeSliceRef.current;
        if (!slice) {
          latticeSliceVersion = 0;
        } else if (slice.version !== latticeSliceVersion) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, latticeSliceTex);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            slice.width,
            slice.height,
            0,
            gl.RGBA,
            gl.FLOAT,
            slice.data
          );
          checkError("upload lattice slice");
          latticeSliceVersion = slice.version;
        }
        if (slice && slice.version === latticeSliceVersion) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, latticeSliceTex);
          hasLatticeSlice = true;
        }
      }
  if (loc.u_axes) gl.uniform3f(loc.u_axes, s(d.axes[0], 1), s(d.axes[1], 1), s(d.axes[2], 1));
  if (loc.u_sigma) gl.uniform1f(loc.u_sigma, s(d.sigma, 6));
  if (loc.u_R) gl.uniform1f(loc.u_R, Math.max(0.1, s(d.R, 1)));
  if (loc.u_beta) gl.uniform1f(loc.u_beta, s(d.beta, 0));
  if (loc.u_thetaSign) gl.uniform1f(loc.u_thetaSign, s((d as any).thetaSign ?? 1, 1));
  if (loc.u_viz) gl.uniform1i(loc.u_viz, d.planarVizMode);
  if (loc.u_ampChain) gl.uniform1f(loc.u_ampChain, s(d.ampChain, 1));
  if (loc.u_gate) gl.uniform1f(loc.u_gate, Math.max(0, s(d.gate, 0)));
  if (loc.u_gate_view) gl.uniform1f(loc.u_gate_view, gateView);
  if (loc.u_gateSource) gl.uniform1i(loc.u_gateSource, gateSourceId);
  if (loc.u_latticeDynamicWeights) gl.uniform1i(loc.u_latticeDynamicWeights, latticeDynamicWeights);
  if (loc.u_latticeSlice) gl.uniform1i(loc.u_latticeSlice, 0);
  if (loc.u_hasLatticeSlice) gl.uniform1i(loc.u_hasLatticeSlice, hasLatticeSlice ? 1 : 0);
  if (loc.u_duty) gl.uniform1f(loc.u_duty, Math.max(0, Math.min(1, s(d.duty, 0))));
  if (loc.u_yGain) gl.uniform1f(loc.u_yGain, s(d.yGain, 1e-8));
  if (loc.u_yBias) gl.uniform1f(loc.u_yBias, s(d.yBias, 0));
  if (loc.u_kColor) gl.uniform1f(loc.u_kColor, s(d.kColor, 1e-6));
  if (loc.u_mvp) gl.uniformMatrix4fv(loc.u_mvp, false, d.mvp);
  if (loc.u_totalSectors) gl.uniform1i(loc.u_totalSectors, d.totalSectors | 0);
  if (loc.u_liveSectors) gl.uniform1i(loc.u_liveSectors, d.liveSectors | 0);
  if (loc.u_lumpExp) gl.uniform1f(loc.u_lumpExp, s(d.lumpBoostExp, 1.25));
  if (loc.u_sectorCenter) gl.uniform1f(loc.u_sectorCenter, s(d.sectorCenter, 0));
  if (loc.u_sectorSigma) gl.uniform1f(loc.u_sectorSigma, Math.max(1e-4, s(d.sectorSigma, 0.01)));
  if (loc.u_sectorFloor) gl.uniform1f(loc.u_sectorFloor, Math.min(0.99, Math.max(0, s(d.sectorFloor, 0))));
  if (loc.u_syncMode) gl.uniform1i(loc.u_syncMode, d.syncMode | 0);
  if (loc.u_phase01) gl.uniform1f(loc.u_phase01, s(d.phase01, 0));
  if (loc.u_splitEnabled) gl.uniform1i(loc.u_splitEnabled, (d as any).splitEnabled | 0);
  if (loc.u_splitFrac) gl.uniform1f(loc.u_splitFrac, s((d as any).splitFrac ?? 0.5, 0.5));
  if (loc.u_vizFloorThetaGR) gl.uniform1f(loc.u_vizFloorThetaGR, floorThetaGR);
  if (loc.u_vizFloorRhoGR) gl.uniform1f(loc.u_vizFloorRhoGR, floorRhoGR);
  if (loc.u_vizFloorThetaDrive) gl.uniform1f(loc.u_vizFloorThetaDrive, floorThetaDrive);

      const rows = res - 1;
      const vertsPerRow = res * 2;
      const expectedVCount = rows * vertsPerRow;
      if (!vcountRef.current) {
        gl.disableVertexAttribArray(0);
          if (!fallbackBuf) {
            fallbackBuf = gl.createBuffer();
            if (fallbackBuf) {
              gl.bindBuffer(gl.ARRAY_BUFFER, fallbackBuf);
              gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, -1, 0.01, 1, 0, 1, 0.01]), gl.STREAM_DRAW);
              if (!fallbackVAO) {
                fallbackVAO = gl.createVertexArray();
                if (fallbackVAO) {
                  gl.bindVertexArray(fallbackVAO);
                  gl.bindBuffer(gl.ARRAY_BUFFER, fallbackBuf);
                  gl.enableVertexAttribArray(0);
                  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                  gl.bindVertexArray(null);
                }
              }
            }
          }
          if (fallbackVAO) {
            gl.bindVertexArray(fallbackVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
      } else {
        if (vcountRef.current !== expectedVCount) {
          console.warn(`[Alcubierre] Unexpected vertex count: got ${vcountRef.current}, expected ${expectedVCount} (res=${res}). Rendering may be degraded.`);
        }
        const collapsed = (!Number.isFinite(d.yGain) || Math.abs(d.yGain) < 1e-12) || (d.gate <= 0 && d.planarVizMode === 2);
        if (collapsed) {
          if (!fallbackBuf) {
            fallbackBuf = gl.createBuffer();
            if (fallbackBuf) {
              gl.bindBuffer(gl.ARRAY_BUFFER, fallbackBuf);
              gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, 0, 1, 0,
                0, -1, 0, 1,
              ]), gl.STREAM_DRAW);
              if (!fallbackVAO) {
                fallbackVAO = gl.createVertexArray();
                if (fallbackVAO) {
                  gl.bindVertexArray(fallbackVAO);
                  gl.bindBuffer(gl.ARRAY_BUFFER, fallbackBuf);
                  gl.enableVertexAttribArray(0);
                  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                  gl.bindVertexArray(null);
                }
              }
            }
          }
          if (fallbackVAO) {
            gl.bindVertexArray(fallbackVAO);
            gl.drawArrays(gl.LINES, 0, 4);
          }
        } else {
          for (let row = 0; row < rows; row++) {
            const off = row * vertsPerRow;
            gl.drawArrays(gl.TRIANGLE_STRIP, off, vertsPerRow);
          }
        }
      }

      const skyMode = (d as any).skyboxMode as Hull3DSkyboxMode | undefined;
      const drawGeodesicBundle = skyMode === "geodesic" || skyMode === "flat";
      if (drawGeodesicBundle && geoBundleProgram && geoBundleVbo && geoBundleLoc) {
        const flatMode = skyMode === "flat";
        const bundle = buildNullGeodesicBundle1p1({
          alpha: s((d as any).alpha ?? 1, 1),
          beta: s(d.beta, 0),
          sigma: Math.max(1e-3, s(d.sigma, 6)),
          R: Math.max(1e-3, s(d.R, 1)),
          axes: [s(d.axes[0], 1), s(d.axes[1], 1), s(d.axes[2], 1)],
          domainScale: Math.max(0.1, s((d as any).domainScale, 1)),
          natarioLike: Boolean((d as any).natarioLike),
          flatMode,
        });
        const drawLineSet = (verts: Float32Array, color: [number, number, number], alpha: number) => {
          if (!verts.length) return;
          gl.bindBuffer(gl.ARRAY_BUFFER, geoBundleVbo);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          if (geoBundleLoc.u_color) gl.uniform3f(geoBundleLoc.u_color, color[0], color[1], color[2]);
          if (geoBundleLoc.u_alpha) gl.uniform1f(geoBundleLoc.u_alpha, alpha);
          gl.drawArrays(gl.LINES, 0, Math.floor(verts.length / 2));
        };
        gl.useProgram(geoBundleProgram);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const familyAlpha = flatMode ? 0.22 : 0.32;
        const tubeAlpha = flatMode ? 0.12 : 0.2;
        drawLineSet(bundle.minus, flatMode ? [0.65, 0.75, 0.9] : [0.35, 0.82, 0.95], familyAlpha);
        drawLineSet(bundle.plus, flatMode ? [0.9, 0.78, 0.58] : [0.98, 0.72, 0.32], familyAlpha);
        drawLineSet(bundle.worldtube, [0.85, 0.95, 1], tubeAlpha);
        gl.disable(gl.BLEND);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      }

      checkError("drawArrays");

      if ((frame++ % 120) === 0) {
        console.debug('[Alcubierre uniforms]', {
          planarVizMode: d.planarVizMode,
          sigma: d.sigma,
          R: d.R,
          beta: d.beta,
          ampChain: d.ampChain,
          gate: d.gate,
          yGain: d.yGain,
          yBias: d.yBias,
          kColor: d.kColor,
          totalSectors: d.totalSectors,
          liveSectors: d.liveSectors,
          lumpBoostExp: d.lumpBoostExp,
        });
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (fallbackVAO) gl.deleteVertexArray(fallbackVAO);
      if (fallbackBuf) gl.deleteBuffer(fallbackBuf);
      if (vao) gl.deleteVertexArray(vao);
      if (vbo) gl.deleteBuffer(vbo);
      if (geoBundleVbo) gl.deleteBuffer(geoBundleVbo);
      if (latticeSliceTex) gl.deleteTexture(latticeSliceTex);
      if (geoBundleProgram) gl.deleteProgram(geoBundleProgram);
      if (prog) gl.deleteProgram(prog);
      cv.removeEventListener("webglcontextlost", lost);
      cv.removeEventListener("webglcontextrestored", restored);
    };
  }, [planarVizMode, res, shaderSources, hullRendererBackend]);

  useEffect(() => {
    const modeSupportsScientificMis =
      planarVizMode === 0 ||
      planarVizMode === 1 ||
      planarVizMode === 2 ||
      planarVizMode === 3 ||
      planarVizMode === 4 ||
      planarVizMode === 5 ||
      planarVizMode === 6;
    const useScientificMisService =
      hullRendererBackend === "mis-service" && modeSupportsScientificMis;
    if (!useScientificMisService && planarVizMode !== 3) {
      integralSignalRef.current = null;
      if (hullRafRef.current) {
        cancelAnimationFrame(hullRafRef.current);
        hullRafRef.current = 0;
      }
      if (hullRendererRef.current) {
        hullRendererRef.current.dispose();
        hullRendererRef.current = null;
      }
      if (hullWebGpuRef.current) {
        hullWebGpuRef.current.dispose();
        hullWebGpuRef.current = null;
      }
      return;
    }
    const cv = canvasRef.current;
    if (!cv) return;
    let disposed = false;
    let usingWebGpu = false;
    let usingMisService = false;
    let gl: WebGL2RenderingContext | null = null;
    let ro: ResizeObserver | null = null;
    let diagTimer: number | null = null;
    let misTimer: number | null = null;
    let misInFlight = false;
    let misAbort: AbortController | null = null;
    let misSeq = 0;
    let onLost: ((event: Event) => void) | null = null;
    let onRestored: (() => void) | null = null;
    let runtimeGuardTimer: number | null = null;
    let runtimeGuardTripped = false;
    let runtimeGuardLongFrames = 0;
    let runtimeGuardLastBeat =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const RUNTIME_GUARD_LONG_FRAME_MS = 950;
    const RUNTIME_GUARD_LONG_FRAME_LIMIT = 3;
    const RUNTIME_GUARD_HEARTBEAT_TIMEOUT_MS = 4500;
    let adaptiveScientificDimsTarget = 40;
    let lastRenderTransportDebugMs = 0;
    let lastSolvePipelineRequestDebugMs = 0;
    let lastSolvePipelineResponseDebugMs = 0;

    const startDiagPoll = () => {
      if (diagTimer) return;
      diagTimer = window.setInterval(() => {
        try {
          const msgObj = (window as any).__hullDiagMessage as null | { message?: string };
          setHullDiagMsg(msgObj?.message ?? null);
        } catch {
          /* noop */
        }
      }, 500);
    };
    const stopDiagPoll = () => {
      if (diagTimer) {
        clearInterval(diagTimer);
        diagTimer = null;
      }
    };

    const cleanupWebGl = () => {
      if (onLost) cv.removeEventListener("webglcontextlost", onLost as any);
      if (onRestored) cv.removeEventListener("webglcontextrestored", onRestored as any);
      try {
        hullRendererRef.current?.dispose();
      } catch {}
      hullRendererRef.current = null;
    };

    const cleanupMisService = () => {
      if (misTimer) {
        clearInterval(misTimer);
        misTimer = null;
      }
      if (misAbort) {
        try {
          misAbort.abort();
        } catch {
          // no-op
        }
        misAbort = null;
      }
      misInFlight = false;
      integralSignalRef.current = null;
    };

    const stopRuntimeGuard = () => {
      if (runtimeGuardTimer) {
        clearInterval(runtimeGuardTimer);
        runtimeGuardTimer = null;
      }
    };

    const tripRuntimeGuard = (reason: string) => {
      if (runtimeGuardTripped || disposed) return;
      runtimeGuardTripped = true;
      stopRuntimeGuard();
      const message = `Renderer halted for safety: ${reason}`;
      console.error("[Alcubierre][Hull3D][RuntimeGuard]", reason);
      setHullDiagMsg(message);
      setGlError(message);
      emitAlcubierreDebugEvent({
        level: "error",
        category: "runtime_guard",
        source: "alcubierre.worldtube.runtime-guard",
        note: reason,
        expected: null,
        rendered: {
          long_frame_budget_ms: RUNTIME_GUARD_LONG_FRAME_MS,
          long_frame_limit: RUNTIME_GUARD_LONG_FRAME_LIMIT,
          heartbeat_timeout_ms: RUNTIME_GUARD_HEARTBEAT_TIMEOUT_MS,
        },
        delta: null,
        measurements: {
          usingWebGpu,
          usingMisService,
          runtimeGuardLongFrames,
        },
      });
      if (hullRafRef.current) {
        cancelAnimationFrame(hullRafRef.current);
        hullRafRef.current = 0;
      }
      cleanupMisService();
      if (usingWebGpu) {
        try {
          hullWebGpuRef.current?.dispose();
        } catch {}
        hullWebGpuRef.current = null;
      } else {
        cleanupWebGl();
      }
    };

    const startRuntimeGuard = () => {
      if (runtimeGuardTimer || runtimeGuardTripped) return;
      runtimeGuardLastBeat =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      runtimeGuardTimer = window.setInterval(() => {
        if (disposed || runtimeGuardTripped || planarVizMode !== 3) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          runtimeGuardLastBeat = performance.now();
          return;
        }
        const now = performance.now();
        const stallMs = now - runtimeGuardLastBeat;
        if (stallMs > RUNTIME_GUARD_HEARTBEAT_TIMEOUT_MS) {
          tripRuntimeGuard(
            `frame heartbeat timeout (${Math.round(stallMs)} ms without frame completion)`,
          );
        }
      }, 1000);
    };

    const initWebGl = () => {
      gl = cv.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
      if (!gl) {
        setGlError("WebGL2 unavailable in this browser.");
        return false;
      }
      glRef.current = gl;
      setGlError(null);

      onLost = (event: Event) => {
        try {
          (event as any).preventDefault?.();
        } catch {}
        console.warn("[Alcubierre][Hull3D] WebGL context lost", event);
        setGlError("WebGL context lost - attempting restore.");
        try {
          hullRendererRef.current?.dispose();
        } catch {}
        hullRendererRef.current = null;
      };

      const recreateRenderer = () => {
        try {
          hullRendererRef.current?.dispose();
        } catch {}
        const next = new Hull3DRenderer(gl!, cv, {
          quality: hullQuality,
          qualityOverrides: hullQualityOverridesRef.current,
          emaAlpha: 0.12,
        });
        const config = hullConfigRef.current;
        next.setMode(config.mode, config.blend);
        next.setQuality(hullQuality, hullQualityOverridesRef.current);
        hullRendererRef.current = next;
      };

      onRestored = () => {
        console.warn("[Alcubierre][Hull3D] WebGL context restored - recreating renderer");
        try {
          setGlError(null);
          recreateRenderer();
        } catch (err) {
          console.error("[Alcubierre][Hull3D] Failed to recreate renderer after context restore", err);
          setGlError("WebGL context restored but Hull3D renderer failed to reinitialize.");
        }
      };

      cv.addEventListener("webglcontextlost", onLost as any, { passive: false } as any);
      cv.addEventListener("webglcontextrestored", onRestored as any);
      recreateRenderer();

      if (!hullRendererRef.current) {
        setGlError("Failed to initialize Hull3D renderer.");
        cleanupWebGl();
        return false;
      }
      return true;
    };

    const initWebGpu = async () => {
      if (!(navigator as any).gpu) return false;
      try {
        hullWebGpuRef.current?.dispose();
        const renderer = new Hull3DWebGPUPathTracer(cv);
        await renderer.init();
        hullWebGpuRef.current = renderer;
        hullRendererRef.current?.dispose();
        hullRendererRef.current = null;
        glRef.current = null;
        setHullDiagMsg(null);
        setGlError(null);
        return true;
      } catch (err) {
        console.warn("[Alcubierre][Hull3D] WebGPU init failed, falling back to WebGL", err);
        try {
          hullWebGpuRef.current?.dispose();
        } catch {}
        hullWebGpuRef.current = null;
        return false;
      }
    };

    const resize = () => {
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, READABILITY_DPR_MAX);
      const w = Math.max(640, Math.floor(rect.width * dpr));
      const h = Math.max(360, Math.floor(rect.height * dpr));
      cv.width = w;
      cv.height = h;
      const overlayCanvas = overlayCanvasRef.current;
      if (overlayCanvas) {
        overlayCanvas.width = w;
        overlayCanvas.height = h;
      }
      if (usingWebGpu) {
        hullWebGpuRef.current?.resize(w, h);
      } else if (usingMisService) {
        const ctx2d = cv.getContext("2d", { alpha: false, desynchronized: true });
        if (ctx2d) {
          ctx2d.fillStyle = "#000";
          ctx2d.fillRect(0, 0, w, h);
        }
      } else if (gl) {
        gl.viewport(0, 0, w, h);
      }
      setAspect(w / Math.max(1, h));
    };

    const drawMisFrame = async (dataUrl: string) => {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          if (disposed) {
            resolve();
            return;
          }
          const ctx2d = cv.getContext("2d", { alpha: false, desynchronized: true });
          if (!ctx2d) {
            reject(new Error("MIS renderer: 2D context unavailable"));
            return;
          }
          ctx2d.clearRect(0, 0, cv.width, cv.height);
          ctx2d.drawImage(image, 0, 0, cv.width, cv.height);
          resolve();
        };
        image.onerror = () => reject(new Error("MIS renderer: image decode failed"));
        image.src = dataUrl;
      });
    };

    const requestMisFrame = async () => {
      if (disposed || misInFlight || hullRendererBackend !== "mis-service") return;
      misInFlight = true;
      const abort = new AbortController();
      misAbort = abort;
      const base = hullStateRef.current;
      const metricLatest =
        typeof window !== "undefined" ? (window as any).__hullMetricVolumeLatest : null;
      const geodesicLatest =
        typeof window !== "undefined"
          ? (window as any).__hullGeodesicDiagnostics ?? null
          : null;
      const rawSkybox =
        typeof window !== "undefined" ? (window as any).__hullSkyboxMode : "off";
      const skyboxModeCurrent: HullMisRenderRequestV1["skyboxMode"] =
        rawSkybox === "geodesic" || rawSkybox === "flat" ? rawSkybox : "off";
      const scientificFrameRequired = true;
      const hullSupportRequired =
        typeof metricLatest?.hullSupportRequired === "boolean"
          ? metricLatest.hullSupportRequired
          : true;
      const scientificModeLabel = resolveScientificModeLabel(planarVizMode);
      const scientificRenderView: NonNullable<
        NonNullable<HullMisRenderRequestV1["scienceLane"]>["renderView"]
      > = resolveScientificRenderView(planarVizMode);
      const skyboxModeRequest: HullMisRenderRequestV1["skyboxMode"] =
        scientificFrameRequired ? "geodesic" : skyboxModeCurrent;
      const solvePayload: NonNullable<HullMisRenderRequestV1["solve"]> = {
        beta: Number(base?.beta ?? 0),
        alpha: Number((base as any)?.alpha ?? 1),
        sigma: Number(base?.sigma ?? 6),
        R: Number(base?.R ?? 1),
        chart:
          typeof metricLatest?.chart === "string"
            ? metricLatest.chart
            : geodesicLatest?.chart ?? "comoving_cartesian",
      };
      const requestedModeFromSkybox: HullGeodesicDiagnostics["mode"] =
        skyboxModeRequest === "geodesic"
          ? "full-3+1-christoffel"
          : skyboxModeRequest === "flat"
            ? "flat-background"
            : "disabled";
      const geodesicPayload: NonNullable<HullMisRenderRequestV1["geodesicDiagnostics"]> = {
        mode: geodesicLatest?.mode ?? requestedModeFromSkybox,
        consistency: geodesicLatest?.consistency ?? "unknown",
        maxNullResidual: geodesicLatest?.maxNullResidual ?? null,
        stepConvergence: geodesicLatest?.stepConvergence ?? null,
        bundleSpread: geodesicLatest?.bundleSpread ?? null,
      };
      const metricSummaryPayload: HullMisRenderRequestV1["metricSummary"] = metricLatest
        ? {
            source: metricLatest.source ?? null,
            chart: metricLatest.chart ?? null,
            dims: Array.isArray(metricLatest.dims)
              ? [metricLatest.dims[0], metricLatest.dims[1], metricLatest.dims[2]]
              : null,
            alphaRange: Array.isArray(metricLatest?.stats?.alpha)
              ? [metricLatest.stats.alpha[0], metricLatest.stats.alpha[1]]
              : geodesicLatest?.consistency === "ok"
                ? [1, 1]
                : null,
            consistency: geodesicLatest?.consistency ?? "unknown",
            updatedAt: Number(metricLatest.updatedAt ?? Date.now()),
          }
        : undefined;
      const metricVolumeRefPayload: HullMisRenderRequestV1["metricVolumeRef"] = (() => {
        if (!metricLatest || metricLatest.kind !== "hull3d:metric-volume") return null;
        if (typeof window === "undefined") return null;
        const dimsRaw = Array.isArray(metricLatest.dims)
          ? [
              Math.max(1, Math.floor(Number(metricLatest.dims[0]) || 1)),
              Math.max(1, Math.floor(Number(metricLatest.dims[1]) || 1)),
              Math.max(1, Math.floor(Number(metricLatest.dims[2]) || 1)),
            ]
          : null;
        const scientificDimsTarget = Math.max(32, Math.min(64, adaptiveScientificDimsTarget));
        const scientificDimsMin = 32;
        const scientificDimsMax = 96;
        const dims = dimsRaw
          ? ([
              Math.max(
                scientificDimsMin,
                Math.min(scientificDimsMax, Math.max(scientificDimsTarget, dimsRaw[0])),
              ),
              Math.max(
                scientificDimsMin,
                Math.min(scientificDimsMax, Math.max(scientificDimsTarget, dimsRaw[1])),
              ),
              Math.max(
                scientificDimsMin,
                Math.min(scientificDimsMax, Math.max(scientificDimsTarget, dimsRaw[2])),
              ),
            ] as [number, number, number])
          : ([scientificDimsTarget, scientificDimsTarget, scientificDimsTarget] as [number, number, number]);
        const params = new URLSearchParams();
        if (dims) params.set("dims", `${dims[0]}x${dims[1]}x${dims[2]}`);
        if (Number.isFinite(metricLatest.time_s)) {
          params.set("time_s", String(metricLatest.time_s));
        }
        if (Number.isFinite(metricLatest.dt_s)) {
          params.set("dt_s", String(metricLatest.dt_s));
        }
        const sourceParams = (() => {
          const raw = (metricLatest as any)?.provenance?.sourceParams;
          return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
        })();
        const finiteOr = (value: unknown, fallback: number) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : fallback;
        };
        const dutyForMetricRef = Math.max(
          1e-8,
          finiteOr(sourceParams?.dutyFR, Number(base?.duty ?? 0.0015)),
        );
        const qForMetricRef = Math.max(1e-6, finiteOr(sourceParams?.q, 1));
        const gammaGeoForMetricRef = Math.max(1e-6, finiteOr(sourceParams?.gammaGeo, 26));
        const gammaVdBForMetricRef = Math.max(1e-6, finiteOr(sourceParams?.gammaVdB, 1));
        const zetaForMetricRef = Math.max(0, finiteOr(sourceParams?.zeta, 0.84));
        const phaseForMetricRef = wrap01(
          finiteOr(sourceParams?.phase01, Number((base as any)?.phase01)),
        );
        const metricT00ForMetricRef = finiteOr(sourceParams?.metricT00, Number.NaN);
        const metricT00SourceForMetricRef =
          typeof sourceParams?.metricT00Source === "string"
            ? sourceParams.metricT00Source
            : null;
        const metricT00RefForMetricRef =
          typeof sourceParams?.metricT00Ref === "string"
            ? sourceParams.metricT00Ref
            : null;
        params.set("steps", "1");
        params.set("includeExtra", "1");
        params.set("includeKij", "1");
        params.set("includeMatter", "1");
        params.set("dutyFR", String(dutyForMetricRef));
        params.set("q", String(qForMetricRef));
        params.set("gammaGeo", String(gammaGeoForMetricRef));
        params.set("gammaVdB", String(gammaVdBForMetricRef));
        params.set("zeta", String(zetaForMetricRef));
        params.set("phase01", String(phaseForMetricRef));
        if (Number.isFinite(metricT00ForMetricRef)) {
          params.set("metricT00", String(metricT00ForMetricRef));
        }
        if (metricT00SourceForMetricRef) {
          params.set("metricT00Source", metricT00SourceForMetricRef);
        }
        if (metricT00RefForMetricRef) {
          params.set("metricT00Ref", metricT00RefForMetricRef);
        }
        params.set("requireCongruentSolve", "1");
        params.set("requireNhm2CongruentFullSolve", "1");
        params.set("format", "raw");
        const url = `${window.location.origin}/api/helix/gr-evolve-brick?${params.toString()}`;
        const hash = [
          metricLatest.source ?? "gr-evolve-brick",
          metricLatest.chart ?? "comoving_cartesian",
          dims ? dims.join("x") : "1x1x1",
          Number(metricLatest.updatedAt ?? 0).toString(10),
          "steps=1",
          `duty=${dutyForMetricRef.toExponential(3)}`,
          `q=${qForMetricRef.toExponential(3)}`,
          `gammaGeo=${gammaGeoForMetricRef.toExponential(3)}`,
          `gammaVdB=${gammaVdBForMetricRef.toExponential(3)}`,
          `zeta=${zetaForMetricRef.toFixed(4)}`,
          `phase=${phaseForMetricRef.toFixed(4)}`,
          Number.isFinite(metricT00ForMetricRef)
            ? `metricT00=${metricT00ForMetricRef.toExponential(3)}`
            : "metricT00=none",
          `metricT00Source=${metricT00SourceForMetricRef ?? "none"}`,
          `metricT00Ref=${metricT00RefForMetricRef ?? "none"}`,
          "requireCongruentSolve=1",
        ].join("|");
        return {
          kind: "gr-evolve-brick",
          url,
          source: metricLatest.source ?? null,
          chart: metricLatest.chart ?? null,
          dims,
          updatedAt: Number(metricLatest.updatedAt ?? Date.now()),
          hash,
        };
      })();
      const payload: StrictHullMisRenderRequestV1 = {
        version: 1,
        requestId: `mis-${Date.now()}-${misSeq++}`,
        width: Math.max(1, cv.width | 0),
        height: Math.max(1, cv.height | 0),
        dpr: Math.min(window.devicePixelRatio || 1, READABILITY_DPR_MAX),
        backendHint: "mis-path-tracing",
        timestampMs: Date.now(),
        skyboxMode: skyboxModeRequest,
        scienceLane: {
          requireIntegralSignal: true,
          requireScientificFrame: scientificFrameRequired,
          requireCanonicalTensorVolume: true,
          requireCongruentNhm2FullSolve: true,
          requireHullSupportChannels: hullSupportRequired,
          requireOffDiagonalGamma: true,
          minVolumeDims: [32, 32, 32],
          samplingMode: "trilinear",
          renderView: scientificRenderView,
          attachmentDownsample: 2,
        },
        solve: solvePayload,
        geodesicDiagnostics: geodesicPayload,
        metricSummary: metricSummaryPayload,
        metricVolumeRef: metricVolumeRefPayload,
      };
      const metricRefDimsText = metricVolumeRefPayload?.dims
        ? `${metricVolumeRefPayload.dims[0]}x${metricVolumeRefPayload.dims[1]}x${metricVolumeRefPayload.dims[2]}`
        : "none";
      const metricRefCellCount =
        metricVolumeRefPayload?.dims
          ? metricVolumeRefPayload.dims[0] *
            metricVolumeRefPayload.dims[1] *
            metricVolumeRefPayload.dims[2]
          : null;
      const metricRefUrlParams = (() => {
        if (!metricVolumeRefPayload?.url) return null;
        try {
          return new URL(metricVolumeRefPayload.url).searchParams;
        } catch {
          return null;
        }
      })();
      const metricRefDuty =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("dutyFR")))
          ? Number(metricRefUrlParams.get("dutyFR"))
          : null;
      const metricRefQ =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("q")))
          ? Number(metricRefUrlParams.get("q"))
          : null;
      const metricRefGammaGeo =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("gammaGeo")))
          ? Number(metricRefUrlParams.get("gammaGeo"))
          : null;
      const metricRefGammaVdB =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("gammaVdB")))
          ? Number(metricRefUrlParams.get("gammaVdB"))
          : null;
      const metricRefZeta =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("zeta")))
          ? Number(metricRefUrlParams.get("zeta"))
          : null;
      const metricRefPhase01 =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("phase01")))
          ? Number(metricRefUrlParams.get("phase01"))
          : null;
      const metricRefMetricT00 =
        metricRefUrlParams && Number.isFinite(Number(metricRefUrlParams.get("metricT00")))
          ? Number(metricRefUrlParams.get("metricT00"))
          : null;
      const metricRefMetricT00Source = metricRefUrlParams?.get("metricT00Source") ?? null;
      const metricRefMetricT00Ref = metricRefUrlParams?.get("metricT00Ref") ?? null;
      const metricRefRequireCongruentSolve = (() => {
        if (!metricRefUrlParams) return false;
        const raw =
          metricRefUrlParams.get("requireCongruentSolve") ??
          metricRefUrlParams.get("requireNhm2CongruentFullSolve");
        if (raw == null) return false;
        const normalized = raw.trim().toLowerCase();
        return normalized === "1" || normalized === "true";
      })();
      const requestDebugNowMs = Date.now();
      if (requestDebugNowMs - lastSolvePipelineRequestDebugMs > 1200) {
        lastSolvePipelineRequestDebugMs = requestDebugNowMs;
        emitAlcubierreDebugEvent({
          level: metricVolumeRefPayload ? "info" : "warn",
          category: "solve_to_render_pipeline",
          source: "alcubierre.solve-render-chain.request",
          note: metricVolumeRefPayload
            ? "equation->metric->render request dispatched (masked hull-configured scientific lane)"
            : "request missing metricVolumeRef; masked hull-configured scientific lane may fail closed",
          expected: {
            beta: solvePayload.beta,
            alpha: solvePayload.alpha,
            sigma: solvePayload.sigma,
            R: solvePayload.R,
            request_metric_max_null_residual: geodesicPayload.maxNullResidual,
            request_metric_step_convergence: geodesicPayload.stepConvergence,
            request_metric_bundle_spread: geodesicPayload.bundleSpread,
            metric_volume_updated_at_ms: metricVolumeRefPayload?.updatedAt ?? null,
            metric_volume_cells: metricRefCellCount,
            metric_source_hull_support_required: hullSupportRequired,
            metric_source_duty_fr: metricRefDuty,
            metric_source_q: metricRefQ,
            metric_source_gamma_geo: metricRefGammaGeo,
            metric_source_gamma_vdb: metricRefGammaVdB,
            metric_source_zeta: metricRefZeta,
            metric_source_phase01: metricRefPhase01,
            metric_source_metric_t00: metricRefMetricT00,
            metric_source_require_congruent_solve: metricRefRequireCongruentSolve,
          },
          rendered: null,
          delta: null,
          measurements: {
            stage: "request",
            requestId: payload.requestId ?? null,
            strictScientificFrame: scientificFrameRequired,
            renderView: scientificRenderView,
            hullSupportRequired,
            requireIntegralSignal: payload.scienceLane?.requireIntegralSignal === true,
            geodesicModeRequested: geodesicPayload.mode ?? "unknown",
            chart: solvePayload.chart ?? "unknown",
            metricSource: metricVolumeRefPayload?.source ?? metricSummaryPayload?.source ?? "none",
            metricChart: metricVolumeRefPayload?.chart ?? metricSummaryPayload?.chart ?? "none",
            metricDims: metricRefDimsText,
            metricRefKind: metricVolumeRefPayload?.kind ?? "none",
            metricRefHash: metricVolumeRefPayload?.hash ?? "none",
            metricRefUrl: metricVolumeRefPayload?.url ?? "none",
            metricRefHullSupportRequired: hullSupportRequired,
            metricRefDutyFR: metricRefDuty,
            metricRefQ: metricRefQ,
            metricRefGammaGeo: metricRefGammaGeo,
            metricRefGammaVdB: metricRefGammaVdB,
            metricRefZeta: metricRefZeta,
            metricRefPhase01: metricRefPhase01,
            metricRefMetricT00: metricRefMetricT00,
            metricRefMetricT00Source: metricRefMetricT00Source ?? "none",
            metricRefMetricT00Ref: metricRefMetricT00Ref ?? "none",
            metricRefRequireCongruentSolve: metricRefRequireCongruentSolve,
          },
        });
      }
      try {
        const frame = await requestHullMisFrame(payload, abort.signal);
        if (disposed) return;
        if (scientificFrameRequired && frame.backend !== "proxy") {
          throw new Error("scientific_renderer_requires_remote_proxy");
        }
        const remoteMode = frame.diagnostics?.geodesicMode;
        if (
          scientificFrameRequired &&
          remoteMode !== "full-3+1-christoffel"
        ) {
          throw new Error(
            `scientific_renderer_requires_full_3p1_mode:${String(
              remoteMode ?? "unknown",
            )}`,
          );
        }
        const frameCertificate = frame.renderCertificate;
        const frameAtlas = frame.scientificAtlas ?? null;
        const frameIdentity = buildScientificSnapshotIdentity(frameCertificate);
        if (scientificRenderView === "full-atlas") {
          if (!frameAtlas) {
            throw new Error("scientific_atlas_pane_missing");
          }
          if (
            frameCertificate?.certificate_hash &&
            frameAtlas.certificate_hash !== frameCertificate.certificate_hash
          ) {
            throw new Error("scientific_atlas_certificate_mismatch");
          }
          const failingPane = findScientificAtlasPaneFailure(frameAtlas);
          if (failingPane) {
            throw new Error(`scientific_atlas_pane_missing:${failingPane}`);
          }
          if (frameIdentity) {
            scientificSnapshotIdentityRef.current = frameIdentity;
          }
        } else if (
          scientificRenderView === "york-time-3p1" ||
          scientificRenderView === "york-surface-3p1" ||
          scientificRenderView === "york-surface-rho-3p1" ||
          scientificRenderView === "york-topology-normalized-3p1" ||
          scientificRenderView === "york-shell-map-3p1"
        ) {
          if (!frameCertificate) {
            throw new Error("scientific_york_certificate_mismatch");
          }
          const yorkSurfaceRequested =
            scientificRenderView === "york-surface-3p1" ||
            scientificRenderView === "york-surface-rho-3p1";
          const yorkSurfaceRhoRequested =
            scientificRenderView === "york-surface-rho-3p1";
          const yorkTopologyNormalizedRequested =
            scientificRenderView === "york-topology-normalized-3p1";
          const yorkShellMapRequested =
            scientificRenderView === "york-shell-map-3p1";
          const expectedYorkSlicePlane = yorkSurfaceRhoRequested
            ? "x-rho"
            : "x-z-midplane";
          const expectedYorkCoordinateMode = yorkSurfaceRhoRequested
            ? "x-rho"
            : "x-z-midplane";
          const expectedYorkSamplingChoice = yorkSurfaceRhoRequested
            ? "x-rho cylindrical remap"
            : "x-z midplane";
          const expectedYorkNormalization = yorkTopologyNormalizedRequested
            ? "topology-only-unit-max"
            : "symmetric-about-zero";
          if (
            frameCertificate.render?.field_key !== "theta" ||
            frameCertificate.render?.slice_plane !== expectedYorkSlicePlane ||
            frameCertificate.render?.coordinate_mode !== expectedYorkCoordinateMode ||
            frameCertificate.render?.normalization !== expectedYorkNormalization ||
            frameCertificate.diagnostics?.sampling_choice !== expectedYorkSamplingChoice ||
            frameCertificate.diagnostics?.coordinate_mode !== expectedYorkCoordinateMode ||
            (yorkSurfaceRequested &&
              frameCertificate.render?.surface_height !== "theta")
          ) {
            throw new Error("scientific_york_convention_mismatch");
          }
          if (
            yorkTopologyNormalizedRequested &&
            (frameCertificate.render?.magnitude_mode !==
              "normalized-topology-only" ||
              frameCertificate.render?.surface_height !== "theta_norm")
          ) {
            throw new Error("scientific_york_convention_mismatch");
          }
          const yorkDiagnostics = frameCertificate.diagnostics ?? {};
          const hasYorkRawAndDisplayExtrema =
            Number.isFinite(yorkDiagnostics.theta_min_raw ?? Number.NaN) &&
            Number.isFinite(yorkDiagnostics.theta_max_raw ?? Number.NaN) &&
            Number.isFinite(yorkDiagnostics.theta_abs_max_raw ?? Number.NaN) &&
            Number.isFinite(yorkDiagnostics.theta_min_display ?? Number.NaN) &&
            Number.isFinite(yorkDiagnostics.theta_max_display ?? Number.NaN) &&
            Number.isFinite(yorkDiagnostics.theta_abs_max_display ?? Number.NaN) &&
            typeof yorkDiagnostics.display_range_method === "string" &&
            yorkDiagnostics.display_range_method.trim().length > 0;
          if (!hasYorkRawAndDisplayExtrema) {
            throw new Error("scientific_york_convention_mismatch");
          }
          if (
            yorkShellMapRequested &&
            frameCertificate.render?.support_overlay !==
              "hull_sdf+tile_support_mask"
          ) {
            throw new Error("scientific_york_shell_map_convention_mismatch");
          }
          if (yorkShellMapRequested) {
            if (
              !Number.isFinite(
                frameCertificate.diagnostics?.supported_theta_fraction ?? Number.NaN,
              ) ||
              !Number.isFinite(
                frameCertificate.diagnostics?.shell_theta_overlap_pct ?? Number.NaN,
              ) ||
              typeof frameCertificate.diagnostics?.peak_theta_in_supported_region !==
                "boolean"
            ) {
              throw new Error("scientific_york_shell_map_diagnostics_missing");
            }
          }
          if (
            typeof frameCertificate.theta_definition !== "string" ||
            frameCertificate.theta_definition.trim().length === 0
          ) {
            throw new Error("scientific_york_convention_mismatch");
          }
          // "These York views are same-snapshot congruent renderings of one NHM2 solution.
          // Parameter-family comparisons are separate products and must not be represented
          // as a single simultaneous system."
          if (!frameIdentity) {
            throw new Error("scientific_york_certificate_mismatch");
          }
          if (!scientificSnapshotIdentityRef.current) {
            scientificSnapshotIdentityRef.current = frameIdentity;
          }
          if (
            scientificSnapshotIdentityRef.current &&
            !scientificIdentityMatches(scientificSnapshotIdentityRef.current, frameIdentity)
          ) {
            throw new Error("scientific_york_certificate_mismatch");
          }
        } else if (scientificRenderView === "shift-shell-3p1") {
          if (!frameCertificate) {
            throw new Error("scientific_shift_shell_certificate_mismatch");
          }
          if (
            frameCertificate.render?.field_key !== "beta_x" ||
            frameCertificate.render?.slice_plane !== "x-z-midplane" ||
            frameCertificate.render?.normalization !== "symmetric-about-zero" ||
            frameCertificate.render?.support_overlay !== "hull_sdf+tile_support_mask"
          ) {
            throw new Error("scientific_shift_shell_convention_mismatch");
          }
          if (
            scientificSnapshotIdentityRef.current &&
            !scientificIdentityMatches(scientificSnapshotIdentityRef.current, frameIdentity)
          ) {
            throw new Error("scientific_shift_shell_certificate_mismatch");
          }
        }
        await drawMisFrame(frame.imageDataUrl);
        setGlError(null);
        setScientificAtlasState((prev) =>
          scientificRenderView === "full-atlas" ? frameAtlas : prev,
        );
        setScientificCertificateState(frameCertificate ?? null);
        if (scientificFrameRequired) {
          if (frame.renderMs > 22_000) adaptiveScientificDimsTarget = 32;
          else if (frame.renderMs > 15_000) adaptiveScientificDimsTarget = 40;
          else if (frame.renderMs < 8_000) adaptiveScientificDimsTarget = 48;
        }
        const nowDecodeMs = Date.now();
        if (nowDecodeMs - lastIntegralSignalDecodeRef.current >= 1300) {
          const integral = extractIntegralSignalAttachmentSnapshot(frame);
          if (integral) {
            integralSignalRef.current = integral;
            lastIntegralSignalDecodeRef.current = nowDecodeMs;
            bumpIntegralSignalVersion();
          }
        }
        const modeFromSkybox: HullGeodesicDiagnostics["mode"] =
          skyboxModeRequest === "geodesic"
            ? "full-3+1-christoffel"
            : skyboxModeRequest === "flat"
              ? "flat-background"
              : "disabled";
        const resolvedMode: HullGeodesicDiagnostics["mode"] =
          remoteMode === "full-3+1-christoffel" ||
          remoteMode === "reduced-1+1-fallback" ||
          remoteMode === "flat-background" ||
          remoteMode === "disabled"
            ? remoteMode
            : modeFromSkybox;
        setGeodesicDiagnostics({
          mode: resolvedMode,
          scientificEnabled: true,
          metricAvailable: true,
          metricSource: metricSummaryPayload?.source ?? frame.provenance?.source ?? "mis-service",
          chart: metricSummaryPayload?.chart ?? solvePayload.chart ?? null,
          dims: metricSummaryPayload?.dims ?? null,
          maxNullResidual:
            frame.diagnostics?.maxNullResidual ?? geodesicPayload.maxNullResidual ?? null,
          stepConvergence:
            frame.diagnostics?.stepConvergence ?? geodesicPayload.stepConvergence ?? null,
          bundleSpread:
            frame.diagnostics?.bundleSpread ?? geodesicPayload.bundleSpread ?? null,
          consistency:
            frame.diagnostics?.consistency ??
            geodesicPayload.consistency ??
            "unknown",
          consistencyNote:
            frame.diagnostics?.note ??
            (frame.backend === "proxy"
              ? "remote MIS service frame"
              : "local deterministic MIS fallback frame"),
          steps: 0,
          stepScale_m: 0,
          updatedAt: Date.now(),
        });
        setHullDiagMsg(
          `${scientificModeLabel} uses masked hull-configured scientific rendering (${scientificRenderView}) via MIS service.`,
        );
        const hasDepthAttachment = Array.isArray(frame.attachments)
          ? frame.attachments.some((entry) => entry.kind === "depth-linear-m-f32le")
          : false;
        const hasMaskAttachment = Array.isArray(frame.attachments)
          ? frame.attachments.some((entry) => entry.kind === "shell-mask-u8")
          : false;
        const frameScientificTier =
          frame.provenance?.scientificTier ?? frame.diagnostics?.scientificTier ?? null;
        const responseDebugNowMs = Date.now();
        if (responseDebugNowMs - lastSolvePipelineResponseDebugMs > 1200) {
          lastSolvePipelineResponseDebugMs = responseDebugNowMs;
          emitAlcubierreDebugEvent({
            level:
              frame.diagnostics?.consistency === "fail"
                ? "warn"
                : frameScientificTier === "research-grade"
                  ? "info"
                  : "warn",
            category: "solve_to_render_pipeline",
            source: "alcubierre.solve-render-chain.response",
            note: `equation->metric->render response received (masked hull-configured scientific ${scientificRenderView})`,
            expected: {
              beta: solvePayload.beta,
              alpha: solvePayload.alpha,
              sigma: solvePayload.sigma,
              R: solvePayload.R,
              request_metric_max_null_residual: geodesicPayload.maxNullResidual,
              request_metric_step_convergence: geodesicPayload.stepConvergence,
              request_metric_bundle_spread: geodesicPayload.bundleSpread,
            },
            rendered: {
              frame_render_ms: frame.renderMs,
              frame_max_null_residual: frame.diagnostics?.maxNullResidual ?? null,
              frame_step_convergence: frame.diagnostics?.stepConvergence ?? null,
              frame_bundle_spread: frame.diagnostics?.bundleSpread ?? null,
            },
            delta: {
              frame_minus_request_null_residual:
                Number.isFinite(frame.diagnostics?.maxNullResidual as number) &&
                Number.isFinite(geodesicPayload.maxNullResidual as number)
                  ? Number(frame.diagnostics?.maxNullResidual) -
                    Number(geodesicPayload.maxNullResidual)
                  : null,
              frame_minus_request_step_convergence:
                Number.isFinite(frame.diagnostics?.stepConvergence as number) &&
                Number.isFinite(geodesicPayload.stepConvergence as number)
                  ? Number(frame.diagnostics?.stepConvergence) -
                    Number(geodesicPayload.stepConvergence)
                  : null,
              frame_minus_request_bundle_spread:
                Number.isFinite(frame.diagnostics?.bundleSpread as number) &&
                Number.isFinite(geodesicPayload.bundleSpread as number)
                  ? Number(frame.diagnostics?.bundleSpread) -
                    Number(geodesicPayload.bundleSpread)
                  : null,
            },
            measurements: {
              stage: "response",
              requestId: payload.requestId ?? null,
              backend: frame.backend,
              geodesicModeResolved: resolvedMode,
              geodesicModeRemote: remoteMode ?? "unknown",
              renderViewRequested: scientificRenderView,
              chart: solvePayload.chart ?? "unknown",
              consistency: frame.diagnostics?.consistency ?? "unknown",
              scientificTier: frameScientificTier ?? "unknown",
              researchGrade: frame.provenance?.researchGrade === true,
              provenanceSource: frame.provenance?.source ?? "unknown",
              certificateSchemaVersion:
                frameCertificate?.certificate_schema_version ?? "none",
              certificateHash: frameCertificate?.certificate_hash ?? "none",
              certificateMetricRefHash: frameCertificate?.metric_ref_hash ?? "none",
              certificateFrameHash: frameCertificate?.frame_hash ?? "none",
              certificateRenderView: frameCertificate?.render?.view ?? "none",
              certificateNullResidualMax:
                frameCertificate?.diagnostics?.null_residual_max ?? null,
              certificateConstraintRms:
                frameCertificate?.diagnostics?.constraint_rms ?? null,
              hasDepthAttachment,
              hasMaskAttachment,
              width: payload.width,
              height: payload.height,
              metricRefHash: metricVolumeRefPayload?.hash ?? "none",
              metricRefDims: metricRefDimsText,
              atlasCertificateHash: frame.scientificAtlas?.certificate_hash ?? "none",
              atlasMetricRefHash: frame.scientificAtlas?.metric_ref_hash ?? "none",
              atlasPaneStatus:
                frame.scientificAtlas == null
                  ? "none"
                  : SCIENTIFIC_ATLAS_PANE_ORDER
                      .map((paneId) => `${paneId}:${frame.scientificAtlas?.pane_status[paneId] ?? "missing"}`)
                      .join("|"),
            },
          });
        }
        const nowLogMs = Date.now();
        if (nowLogMs - lastRenderTransportDebugMs > 1800) {
          lastRenderTransportDebugMs = nowLogMs;
          emitAlcubierreDebugEvent({
            level: "info",
            category: "render_transport",
            source: "alcubierre.mis-frame.success",
            note: `masked hull-configured scientific remote proxy frame (${scientificRenderView})`,
            expected: {
              beta: solvePayload.beta,
              alpha: solvePayload.alpha,
              sigma: solvePayload.sigma,
              R: solvePayload.R,
              metric_max_null_residual: geodesicPayload.maxNullResidual,
              metric_step_convergence: geodesicPayload.stepConvergence,
              metric_bundle_spread: geodesicPayload.bundleSpread,
            },
            rendered: {
              frame_max_null_residual: frame.diagnostics?.maxNullResidual ?? null,
              frame_step_convergence: frame.diagnostics?.stepConvergence ?? null,
              frame_bundle_spread: frame.diagnostics?.bundleSpread ?? null,
            },
            delta: {
              null_residual_delta:
                Number.isFinite(frame.diagnostics?.maxNullResidual as number) &&
                Number.isFinite(geodesicPayload.maxNullResidual as number)
                  ? Number(frame.diagnostics?.maxNullResidual) -
                    Number(geodesicPayload.maxNullResidual)
                  : null,
            },
            measurements: {
              backend: frame.backend,
              skyboxMode: skyboxModeRequest,
              renderView: scientificRenderView,
              geodesicMode: resolvedMode,
              consistency: frame.diagnostics?.consistency ?? geodesicPayload.consistency ?? "unknown",
              width: payload.width,
              height: payload.height,
            },
          });
        }
      } catch (err) {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        const errorInfo = parseMisServiceErrorInfo(message);
        setScientificAtlasState(null);
        const strictScientificFailure =
          scientificFrameRequired && isStrictScientificRenderFailure(errorInfo);
        const uiMessage = strictScientificFailure
          ? formatStrictScientificRenderFailure(errorInfo)
          : `MIS service frame failed: ${message}`;
        const responseDebugNowMs = Date.now();
        if (responseDebugNowMs - lastSolvePipelineResponseDebugMs > 1200) {
          lastSolvePipelineResponseDebugMs = responseDebugNowMs;
          emitAlcubierreDebugEvent({
            level: "warn",
            category: "solve_to_render_pipeline",
            source: "alcubierre.solve-render-chain.failure",
            note: uiMessage,
            expected: {
              beta: solvePayload.beta,
              alpha: solvePayload.alpha,
              sigma: solvePayload.sigma,
              R: solvePayload.R,
              request_metric_max_null_residual: geodesicPayload.maxNullResidual,
              request_metric_step_convergence: geodesicPayload.stepConvergence,
              request_metric_bundle_spread: geodesicPayload.bundleSpread,
            },
            rendered: null,
            delta: null,
            measurements: {
              stage: "failure",
              requestId: payload.requestId ?? null,
              strictScientificFailure,
              hullSupportRequired,
              errorStatus: errorInfo.status,
              errorCode: errorInfo.code ?? "none",
              errorDetail: errorInfo.detail ?? message,
              chart: solvePayload.chart ?? "unknown",
              geodesicModeRequested: geodesicPayload.mode ?? "unknown",
              metricRefHash: metricVolumeRefPayload?.hash ?? "none",
              metricRefKind: metricVolumeRefPayload?.kind ?? "none",
              metricRefHullSupportRequired: hullSupportRequired,
              metricRefSource: metricVolumeRefPayload?.source ?? metricSummaryPayload?.source ?? "none",
            },
          });
        }
        setHullDiagMsg(uiMessage);
        if (strictScientificFailure) {
          setGlError(`Scientific renderer unavailable: ${uiMessage}`);
          setScientificAtlasState(null);
          setGeodesicDiagnostics({
            mode: "disabled",
            scientificEnabled: true,
            metricAvailable: false,
            metricSource: metricSummaryPayload?.source ?? "mis-service",
            chart: metricSummaryPayload?.chart ?? solvePayload.chart ?? null,
            dims: metricSummaryPayload?.dims ?? null,
            maxNullResidual: null,
            stepConvergence: null,
            bundleSpread: null,
            consistency: "fail",
            consistencyNote: uiMessage,
            steps: 0,
            stepScale_m: 0,
            updatedAt: Date.now(),
          });
        }
        const nowMs = Date.now();
        if (nowMs - lastRenderTransportDebugMs > 1800) {
          lastRenderTransportDebugMs = nowMs;
          emitAlcubierreDebugEvent({
            level: "warn",
            category: "render_transport",
            source: "alcubierre.mis-frame.failure",
            note: uiMessage,
            expected: {
              beta: solvePayload.beta,
              alpha: solvePayload.alpha,
              sigma: solvePayload.sigma,
              R: solvePayload.R,
            },
            rendered: null,
            delta: null,
            measurements: {
              skyboxMode: skyboxModeRequest,
              width: payload.width,
              height: payload.height,
            },
          });
        }
      } finally {
        misAbort = null;
        misInFlight = false;
      }
    };

    const loop = () => {
      if (
        disposed ||
        runtimeGuardTripped ||
        (!useScientificMisService && planarVizMode !== 3)
      ) {
        return;
      }
      const frameStart = performance.now();
      runtimeGuardLastBeat = frameStart;
      try {
        const base = hullStateRef.current;
        if (base) {
          const config = hullConfigRef.current;
          if (usingWebGpu) {
            hullWebGpuRef.current?.update({ ...base, blendFactor: config.blend, timeSec: performance.now() / 1000 });
            hullWebGpuRef.current?.draw();
          } else if (usingMisService) {
            // Frames are driven by request timer; no per-frame GPU pass in this mode.
          } else {
            const active = hullRendererRef.current;
            if (active) {
              active.setMode(config.mode, config.blend);
              active.update({ ...base, blendFactor: config.blend, timeSec: performance.now() / 1000 });
              active.draw();
              startDiagPoll();
            }
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        tripRuntimeGuard(`runtime exception (${detail})`);
        return;
      }
      const frameElapsed = performance.now() - frameStart;
      runtimeGuardLastBeat = performance.now();
      const frameNowMs = Date.now();
      if (frameNowMs - lastRenderTransportDebugMs > 1500) {
        lastRenderTransportDebugMs = frameNowMs;
        const state = hullStateRef.current;
        const betaExpected =
          state && Number.isFinite(state.beta) ? Number(state.beta) : null;
        const alphaExpected =
          state && Number.isFinite((state as any)?.alpha) ? Number((state as any).alpha) : null;
        const sigmaExpected =
          state && Number.isFinite(state.sigma) ? Number(state.sigma) : null;
        const radiusExpected =
          state && Number.isFinite(state.R) ? Number(state.R) : null;
        emitAlcubierreDebugEvent({
          level: frameElapsed > RUNTIME_GUARD_LONG_FRAME_MS ? "warn" : "info",
          category: "render_transport",
          source: "alcubierre.worldtube.frame-loop",
          note:
            frameElapsed > RUNTIME_GUARD_LONG_FRAME_MS
              ? "frame exceeded long-frame safety budget"
              : "frame rendered within safety budget",
          expected: {
            beta: betaExpected,
            alpha: alphaExpected,
            sigma: sigmaExpected,
            R: radiusExpected,
          },
          rendered: {
            frame_ms: frameElapsed,
          },
          delta: {
            frame_over_budget_ms: frameElapsed - RUNTIME_GUARD_LONG_FRAME_MS,
          },
          measurements: {
            usingWebGpu,
            usingMisService,
            runtimeGuardLongFrames,
          },
        });
      }
      if (frameElapsed > RUNTIME_GUARD_LONG_FRAME_MS) {
        runtimeGuardLongFrames += 1;
        if (runtimeGuardLongFrames >= RUNTIME_GUARD_LONG_FRAME_LIMIT) {
          tripRuntimeGuard(`frame time ${Math.round(frameElapsed)} ms exceeded safety budget`);
          return;
        }
      } else {
        runtimeGuardLongFrames = Math.max(0, runtimeGuardLongFrames - 1);
      }
      if (runtimeGuardTripped) return;
      hullRafRef.current = requestAnimationFrame(loop);
    };

    (async () => {
      if (hullRendererBackend === "mis-service") {
        usingMisService = true;
        try {
          hullWebGpuRef.current?.dispose();
        } catch {}
        hullWebGpuRef.current = null;
        cleanupWebGl();
        gl = null;
        glRef.current = null;
        setGlError(null);
        setHullDiagMsg("MIS service renderer initializing...");
        resize();
        ro = new ResizeObserver(resize);
        ro.observe(cv);
        await requestMisFrame();
        if (disposed) return;
        misTimer = window.setInterval(() => {
          void requestMisFrame();
        }, 450);
        startRuntimeGuard();
        hullRafRef.current = requestAnimationFrame(loop);
        return;
      }

      usingWebGpu = hullRendererBackend === "webgpu" ? await initWebGpu() : false;
      if (disposed) {
        if (usingWebGpu) {
          hullWebGpuRef.current?.dispose();
          hullWebGpuRef.current = null;
        }
        return;
      }
      if (hullRendererBackend === "webgpu" && !usingWebGpu) {
        setHullDiagMsg("WebGPU path tracer unavailable; using WebGL stable renderer.");
      } else if (hullRendererBackend === "webgl") {
        setHullDiagMsg(null);
      }
      if (!usingWebGpu) {
        const ok = initWebGl();
        if (!ok) return;
      }
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(cv);
      startRuntimeGuard();
      hullRafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      if (hullRafRef.current) {
        cancelAnimationFrame(hullRafRef.current);
        hullRafRef.current = 0;
      }
      stopRuntimeGuard();
      if (ro) ro.disconnect();
      stopDiagPoll();
      cleanupMisService();
      if (usingWebGpu) {
        hullWebGpuRef.current?.dispose();
        hullWebGpuRef.current = null;
      }
      cleanupWebGl();
    };
  }, [planarVizMode, hullRendererBackend]);

  // Runtime diagnostics: warn if pipeline data absent for extended time
  useEffect(()=>{
    if (live) return; // only arm timer if missing
    const t = setTimeout(()=>{
      if (!live) console.warn('[AlcubierrePanel] No pipeline data after 5s Ã¢â‚¬â€œ using defaults (check energy pipeline query).');
    }, 5000);
    return ()=>clearTimeout(t);
  }, [live]);

  // ---- HUD (expected, peak (Ãƒâ€”Ã¢Ë†Å¡w/f), ÃŽÂ¸95) --------------------------------------
  const thetaDrive_est = useMemo(() => {
    return ampChain * beta * dfdr_peak_est * gateRaw;
  }, [ampChain, beta, dfdr_peak_est, gateRaw]);

  const thetaScaleExpected = useMemo(() => {
    const candidates = [
      (live as any)?.thetaScaleExpected,
      (live as any)?.theta_scale_expected,
      (live as any)?.thetaExpected,
    ];
    for (const cand of candidates) {
      const v = Number(cand);
      if (Number.isFinite(v) && Math.abs(v) > 1e-12) {
        return v;
      }
    }
    return null;
  }, [live]);

  const thetaAudit = useMemo(() => {
    const expected = typeof thetaScaleExpected === "number" ? thetaScaleExpected : null;
    if (expected === null) return null;
    // Use pipeline-calibrated gammaVdB_mass and Ford-Roman duty for audit parity
    const ggeo = Number((live as any)?.gammaGeo);
    const q = Number((live as any)?.qSpoilingFactor ?? (live as any)?.q ?? 1);
    const gammaV_mass = Number((live as any)?.gammaVanDenBroeck_mass ?? (live as any)?.gammaVanDenBroeck ?? (live as any)?.gammaVanDenBroeck_vis);
    const d_eff = Number((live as any)?.dutyEffectiveFR ?? (live as any)?.dutyEffective_FR);
    if (![ggeo, q, gammaV_mass, d_eff].every(Number.isFinite)) return null;
    const est = Math.pow(ggeo, 3) * q * gammaV_mass * d_eff;
    const exp = expected;
    const estAbs = Math.abs(est);
    const expAbs = Math.abs(exp);
    const maxMag = Math.max(estAbs, expAbs);
    // When both values are extremely small, noise dominates Ã¢â‚¬â€œ suppress the audit readout.
    if (maxMag < 1e-9) return null;
    const denom = Math.max((estAbs + expAbs) * 0.5, 1e-9);
    const diff = est - exp;
    const diffPct = (diff / denom) * 100;
    const deviation = Math.abs(diffPct);
    const ratio = expAbs >= 1e-9 ? est / exp : null;
    const sign = Math.sign(est) === Math.sign(exp) ? 1 : -1;
    return { expected: exp, ratio, diffPct, deviation, sign, estimate: est, denom };
  }, [thetaScaleExpected, live]);

  const theta_expected = useMemo(() => {
    if (planarVizMode === 0) return beta * dfdr_peak_est;
    if (planarVizMode === 1) return beta * beta * dfdr_peak_est * dfdr_peak_est * 0.019894367886486918;
    return thetaDrive_est; // no Ã¢Ë†Å¡(w/f)
  }, [planarVizMode, beta, dfdr_peak_est, thetaDrive_est]);
  
  const theta_peak = useMemo(() => theta_expected * boostWF, [theta_expected, boostWF]);

  const driveDiag = useMemo(() => {
    if (planarVizMode !== 2) return null;
    const span = (Number.isFinite(thetaMax) && Number.isFinite(thetaMin)) ? thetaMax - thetaMin : null;
    return {
      ampChain,
      gate: gateRaw,
      gateView,
      thetaPkPos,
      span,
      sectorFloor: ds.sectorFloor,
      sigmaSectors: ds.sigmaSectors,
      syncScheduler,
      centerDeltaDeg,
    };
  }, [planarVizMode, ampChain, gateRaw, gateView, thetaPkPos, thetaMax, thetaMin, ds.sectorFloor, ds.sigmaSectors, syncScheduler, centerDeltaDeg, ds]);

  useEffect(() => {
    const expected =
      typeof thetaScaleExpected === "number" && Number.isFinite(thetaScaleExpected)
        ? thetaScaleExpected
        : undefined;
    const thetaUsed =
      Number.isFinite(thetaDrive_est ?? NaN) ? thetaDrive_est : undefined;
    const ratio =
      expected != null && Math.abs(expected) > 1e-18 && thetaUsed != null
        ? thetaUsed / expected
        : undefined;
    const payload: any = {
      locked: lockScale,
      thetaExpected: expected,
      thetaUsed,
      ratio,
      analyticPeak: Number.isFinite(ampRef ?? NaN) ? ampRef : undefined,
      tailPeak: Number.isFinite(thetaPk ?? NaN) ? thetaPk : undefined,
    };
    // Only push yGain/kColor into shared store when lock is enabled,
    // so Viz HUD can control display-only knobs when unlocked.
    if (sharedPhysicsLock || lockScale) {
      payload.yGain = yGainFinal;
      payload.kColor = kColor;
    }
    setSharedPhysics(payload);
  }, [setSharedPhysics, lockScale, sharedPhysicsLock, yGainFinal, kColor, thetaScaleExpected, thetaDrive_est, ampRef, thetaPk]);

  useEffect(() => {
    if (planarVizMode !== 2) return;
    const now = performance.now();
    if (now - lastDriveLogRef.current < 1000) return;
    lastDriveLogRef.current = now;
    const span = Number.isFinite(thetaMax) && Number.isFinite(thetaMin) ? thetaMax - thetaMin : null;
    emitAlcubierreDebugEvent({
      level: thetaAudit && thetaAudit.deviation > 10 ? "warn" : "info",
      category: "calc_vs_render",
      source: "alcubierre.theta-drive",
      note: thetaAudit
        ? `theta audit deviation=${thetaAudit.deviation.toFixed(2)}%`
        : "theta audit unavailable",
      expected: {
        theta_expected,
        theta_peak,
        theta_scale_expected: thetaScaleExpected,
        theta_drive_est: thetaDrive_est,
      },
      rendered: {
        theta_tail_peak: thetaPk,
        theta_pk_pos: thetaPkPos,
        theta_max: thetaMax,
        theta_min: thetaMin,
        y_gain: yGain,
        y_bias: yBias,
        gate_raw: gateRaw,
        gate_view: gate,
      },
      delta: {
        drive_minus_scale_expected:
          Number.isFinite(thetaDrive_est) && Number.isFinite(thetaScaleExpected as number)
            ? thetaDrive_est - Number(thetaScaleExpected)
            : null,
        peak_minus_expected:
          Number.isFinite(theta_peak) && Number.isFinite(theta_expected)
            ? theta_peak - theta_expected
            : null,
        tail_minus_expected:
          Number.isFinite(thetaPk) && Number.isFinite(theta_expected)
            ? thetaPk - theta_expected
            : null,
        theta_span: span,
        audit_diff_pct: thetaAudit?.diffPct ?? null,
      },
      measurements: {
        beta,
        ampChain,
        dutyFR,
        sectorFloor: ds.sectorFloor,
        sigmaSectors: ds.sigmaSectors,
        syncScheduler,
        sectorCenter01,
        gaussianSigma,
      },
    });
    console.debug("[Alcubierre ÃŽÂ¸Drive]", {
      beta,
      ampChain,
      gate_raw: gateRaw,
      gate_view: gate,
      dutyFR,
      yGain,
      theta_expected,
      theta_drive_est: thetaDrive_est,
      theta_scale_expected: thetaScaleExpected,
      theta_peak,
      thetaPkPos,
      thetaSpan: span,
      span,
      audit: thetaAudit,
      sectorFloor: ds.sectorFloor,
      sigmaSectors: ds.sigmaSectors,
      syncScheduler,
      sectorCenter: sectorCenter01,
      gaussianSigma,
    });
    if (thetaAudit && thetaAudit.deviation > 10) {
      console.warn("[Alcubierre ÃŽÂ¸DriveÃ¢Ë†â€ ] Server ÃŽÂ¸ mismatch", {
        deviationPct: thetaAudit.deviation,
        diffPct: thetaAudit.diffPct,
        ratio: thetaAudit.ratio,
        signAlign: thetaAudit.sign,
        denom: thetaAudit.denom,
        theta_scale_expected: thetaScaleExpected,
        theta_drive_est: thetaDrive_est,
      });
    }
  }, [planarVizMode, beta, ampChain, gate, gateRaw, dutyFR, yGain, yBias, theta_expected, theta_peak, thetaPk, thetaPkPos, thetaMax, thetaMin, thetaDrive_est, thetaScaleExpected, thetaAudit, ds.sectorFloor, ds.sigmaSectors, syncScheduler, sectorCenter01, gaussianSigma, ds, emitAlcubierreDebugEvent]);

  // --- DEBUG comparative logging: listen for helix:phys:bundle events broadcast from helix-core
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      const { showPhys, realPhys, ts } = detail;
      // Compute signatures to highlight mismatches
      const panelSig = {
        ampChain_panel: ampChain,
        gate_panel: gateRaw,
        gate_view_panel: gate,
        gammaGeo_panel: live?.gammaGeo,
        gammaVdB_panel: live?.gammaVanDenBroeck_vis ?? live?.gammaVanDenBroeck,
        duty_panel: live?.dutyEffectiveFR ?? live?.dutyEffective_FR ?? live?.dutyCycle,
      };
      const coreSig = {
        gammaGeo_show: showPhys?.gammaGeo,
        q_show: showPhys?.qSpoilingFactor,
        gammaVdB_show: showPhys?.gammaVanDenBroeck_vis,
        duty_show: showPhys?.dutyEffectiveFR,
        gammaGeo_real: realPhys?.gammaGeo,
        q_real: realPhys?.q,
        gammaVdB_real: realPhys?.gammaVdB,
        duty_real: realPhys?.dFR,
      };
      // Only log if something is plausibly divergent (e.g., panel gate ~0 but core duty nonzero)
      const dutyPanel = Number(panelSig.duty_panel);
      const dutyCore = Number(coreSig.duty_show ?? coreSig.duty_real);
      const gammaPanel = Number(panelSig.gammaVdB_panel);
      const gammaCore = Number(coreSig.gammaVdB_show ?? coreSig.gammaVdB_real);
      if ((dutyPanel < 1e-6 && dutyCore > 1e-4) || (gammaPanel < 2 && gammaCore > 10)) {
        emitAlcubierreDebugEvent({
          level: "warn",
          category: "metric",
          source: "alcubierre.helix-phys-bundle",
          note: "Panel diagnostics diverged from helix-core comparative bundle",
          expected: {
            duty_core: dutyCore,
            gamma_core: gammaCore,
          },
          rendered: {
            duty_panel: dutyPanel,
            gamma_panel: gammaPanel,
          },
          delta: {
            duty_delta:
              Number.isFinite(dutyPanel) && Number.isFinite(dutyCore)
                ? dutyPanel - dutyCore
                : null,
            gamma_delta:
              Number.isFinite(gammaPanel) && Number.isFinite(gammaCore)
                ? gammaPanel - gammaCore
                : null,
          },
          measurements: {
            ampChain_panel: Number(panelSig.ampChain_panel),
            gate_panel: Number(panelSig.gate_panel),
            gate_view_panel: Number(panelSig.gate_view_panel),
            eventTs: Number(ts),
          },
        });
        console.warn('[AlcubierrePanelÃ¢â€ â€helix-core mismatch]', { ts, panelSig, coreSig });
      }
    };
    window.addEventListener('helix:phys:bundle' as any, handler as any);
    return () => window.removeEventListener('helix:phys:bundle' as any, handler as any);
  }, [ampChain, gateRaw, gate, live, emitAlcubierreDebugEvent]);

  const sectorUtilSummary = useMemo(() => {
    const totalRaw = Number(totalSectors);
    const liveRaw = Number(liveSectors);
    const activeRaw = Number(fActive);
    const floorRaw = Number(ds?.sectorFloor);
    const total = Number.isFinite(totalRaw) ? Math.max(1, Math.round(totalRaw)) : null;
    const live = Number.isFinite(liveRaw) ? Math.max(0, Math.round(liveRaw)) : null;
    const active = Number.isFinite(activeRaw) ? Math.max(0, activeRaw) : null;
    const floor = Number.isFinite(floorRaw) ? Math.min(0.99, Math.max(0, floorRaw)) : null;
    if (total === null) {
      return {
        text: "Sector util --",
        className: undefined,
        title: "Live sector utilisation data unavailable",
      };
    }
    const liveText = live !== null ? `${live}/${total}` : `--/${total}`;
    const activePct = active !== null ? (active * 100) : null;
    const floorPct = floor !== null ? (floor * 100) : null;
    const activeText = activePct !== null ? `${activePct.toFixed(activePct < 1 ? 2 : 1)}%` : "--";
    const floorText = floorPct !== null ? `${floorPct.toFixed(0)}%` : "--";
    const floorDominates = floor !== null && active !== null && floor > active * 1.1;
    return {
      text: `Sector util ${liveText} | fActive ${activeText} | floor clamp ${floorText}${floorDominates ? " (floor dominated)" : ""}`,
      className: floorDominates ? "ring-1 ring-amber-500/60" : undefined,
      title: `Live sectors: ${live ?? "--"} / ${total}, fActive: ${activePct !== null ? `${activePct.toFixed(3)}%` : "--"}, floor clamp: ${floorText}${floorDominates ? " (floor dominates)" : ""}`,
    };
  }, [totalSectors, liveSectors, fActive, ds.sectorFloor]);

  const lightCrossSummary = useMemo(() => {

    const tauRaw = Number(lightLoop?.tauLC_ms);

    const burstRaw = Number(lightLoop?.burst_ms);

    const dwellRaw = Number(lightLoop?.dwell_ms);

    const tau = Number.isFinite(tauRaw) ? tauRaw : null;

    const burst = Number.isFinite(burstRaw) ? burstRaw : null;

    const dwell = Number.isFinite(dwellRaw) ? dwellRaw : null;



    if (tau === null && burst === null && dwell === null) {

      return {

        text: "Light-cross --",

        className: "bg-indigo-900/60 text-indigo-100",

        title: "Light-crossing metrics unavailable",

      };

    }



    const burstDwellText =

      burst !== null && dwell !== null ? `${fmtTimeSmartMs(burst)}/${fmtTimeSmartMs(dwell)}` : "--";

    const dutyPct =

      burst !== null && dwell !== null && burst + dwell > 0

        ? (burst / (burst + dwell)) * 100

        : null;

    const burstTau =

      burst !== null && tau !== null && tau > 0

        ? `${(burst / tau).toFixed(1)}x`

        : "--";

    const tauText = fmtTimeSmartMs(tau);

    const summaryText = `Light-cross tauLC ${tauText} | burst/dwell ${burstDwellText} | duty ${

      dutyPct !== null ? `${dutyPct.toFixed(1)}%` : "--"

    } | b/tau ${burstTau}`;

    const title = `tauLC=${tau !== null ? `${tau} ms` : "--"}, burst=${burst !== null ? `${burst} ms` : "--"}, dwell=${dwell !== null ? `${dwell} ms` : "--"}, duty=${dutyPct !== null ? `${dutyPct.toFixed(2)}%` : "--"}, b/tau=${burstTau}`;

    return {

      text: summaryText,

      className: "bg-indigo-900/60 text-indigo-100",

      title,

    };

  }, [lightLoop.tauLC_ms, lightLoop.burst_ms, lightLoop.dwell_ms]);

  const lastZetaBadgeRef = useRef<{ value: number; limit: number } | null>(null);
  const zetaBadgeData = useMemo(() => {
    const rawValue = Number((sharedComplianceState as any)?.zeta?.value);
    const rawLimit = Number((sharedComplianceState as any)?.zeta?.limit);
    const nextValue = Number.isFinite(rawValue) ? rawValue : null;
    const nextLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;

    if (nextValue !== null && nextLimit !== null) {
      lastZetaBadgeRef.current = { value: nextValue, limit: nextLimit };
    }

    const current = lastZetaBadgeRef.current;

    if (!current) {
      return {
        text: "zeta value/limit --",
        className: "bg-slate-800/70 text-slate-200",
        title: "Ford-Roman zeta compliance unavailable",
      };
    }

    const ratio = current.value / current.limit;
    const text = `zeta ${current.value.toPrecision(3)}/${current.limit.toPrecision(3)} | ${ratio.toFixed(2)}x`;
    let className = "bg-emerald-800/70 text-emerald-100";
    if (ratio >= 1) className = "bg-rose-800/80 text-rose-100";
    else if (ratio >= 0.9) className = "bg-amber-800/80 text-amber-100";
    return {
      text,
      className,
      title: `zeta=${current.value}, limit=${current.limit}, ratio=${ratio.toFixed(3)}`,
    };
  }, [(sharedComplianceState as any)?.zeta?.value, (sharedComplianceState as any)?.zeta?.limit]);

  const driveChainSummary = useMemo(() => {
    const liveAny = live as any;
    const gammaGeoNum = Number(liveAny?.gammaGeo);
    const qValue = [
      liveAny?.qSpoilingFactor,
      liveAny?.q,
      liveAny?.qSpoil,
      liveAny?.qCavity,
    ]
      .map((candidate) => Number(candidate))
      .find((candidate) => Number.isFinite(candidate) && candidate > 0);
    const gammaValue = [
      liveAny?.gammaVanDenBroeck_vis,
      liveAny?.gammaVanDenBroeck,
      liveAny?.gammaVanDenBroeck_mass,
      liveAny?.gammaVdB_vis,
      liveAny?.gammaVdB,
      liveAny?.gamma_vdb,
    ]
      .map((candidate) => Number(candidate))
      .find((candidate) => Number.isFinite(candidate) && candidate > 0);
    const chain = Number.isFinite(ampChain ?? NaN) ? ampChain : null;
    if (!Number.isFinite(gammaGeoNum) || qValue == null || gammaValue == null || chain == null) {
      return {
        text: "Drive chain gamma_geo^3 * q * gamma_VdB = --",
        className: undefined,
        title: "Drive chain factors unavailable",
      };
    }
    const gammaCube = Math.pow(gammaGeoNum, 3);
    return {
      text: `Drive chain gamma_geo^3 * q * gamma_VdB = ${chain.toExponential(2)} (${gammaCube.toExponential(2)} * ${qValue.toPrecision(3)} * ${gammaValue.toPrecision(3)})`,
      className: undefined,
      title: `gamma_geo=${gammaGeoNum}, q=${qValue}, gamma_VdB=${gammaValue}, ampChain=${chain}`,
    };
  }, [ampChain, live]);

  const cadenceSummary = useMemo(() => {
    const freqNum = Number(freqGHz);
    const periodNum = Number(sectorPeriodMs);
    const freqValid = Number.isFinite(freqNum);
    const periodValid = Number.isFinite(periodNum);
    if (!freqValid && !periodValid) {
      return {
        text: "Cadence --",
        className: undefined,
        title: "Cadence data unavailable",
      };
    }
    const text = `Cadence ${freqValid ? `${freqNum.toFixed(3)} GHz` : "--"} | ${
      periodValid ? `${periodNum.toFixed(2)} ms` : "--"
    }`;
    return {
      text,
      className: undefined,
      title: `freqGHz=${freqValid ? freqNum : "--"}, sectorPeriodMs=${periodValid ? periodNum : "--"}`,
    };
  }, [freqGHz, sectorPeriodMs]);

  const hullSummary = useMemo(() => {

    const axesValid =
      Array.isArray(axes) &&
      axes.length >= 3 &&
      axes.slice(0, 3).every((value: number) => Number.isFinite(Number(value)));
    const basisResolved = hullDimsResolved?.basis ?? HULL_BASIS_IDENTITY;

    const wallNum = Number(wallWidth_m);
    const wallValid = Number.isFinite(wallNum);

    if (!axesValid && !wallValid) {
      return {
        text: "Hull --",
        className: undefined,
        title: "Hull dimensions unavailable",
      };
    }

    const axesHalfXYZ = axesValid
      ? ([Number(axes[0]), Number(axes[1]), Number(axes[2])] as [number, number, number])
      : null;
    const dimsXYZ = axesHalfXYZ
      ? ([axesHalfXYZ[0] * 2, axesHalfXYZ[1] * 2, axesHalfXYZ[2] * 2] as [number, number, number])
      : null;

    const dimsFRU = dimsXYZ ? remapXYZToFrontRightUp(dimsXYZ, basisResolved) : null;
    const axesFRU = axesHalfXYZ ? remapXYZToFrontRightUp(axesHalfXYZ, basisResolved) : null;

    const wallText = wallValid ? `${wallNum.toFixed(3)} m` : "--";
    const basisLabel = dimsFRU ? `basis F/R/U=${dimsFRU.labels.front}/${dimsFRU.labels.right}/${dimsFRU.labels.up}` : "basis --";

    return {
      text: `Hull F/R/U ${dimsFRU ? `${formatTriplet(dimsFRU.values, 1)} m` : "--"} | t_w ${wallText}`,
      className: undefined,
      title: `${basisLabel}${
        axesHalfXYZ
          ? ` | axes (x,y,z half)=${axesHalfXYZ.map((v) => v.toFixed(3)).join(",")} | axes (F/R/U half)=${axesFRU ? formatTriplet(axesFRU.values, 3) : "--"}`
          : ""
      }${
        dimsXYZ
          ? ` | dims (x,y,z)=${dimsXYZ.map((v) => v.toFixed(3)).join(",")} | dims (F/R/U)=${dimsFRU ? formatTriplet(dimsFRU.values, 3) : "--"}`
          : ""
      } | wallWidth=${wallValid ? wallNum : "--"}`,
    };
  }, [axes, hullDimsResolved?.basis, wallWidth_m]);

  const bubbleBoxSummary = useMemo(() => {
    if (hullVolumeDomain !== "bubbleBox") return null;
    const axesValid =
      Array.isArray(axes) &&
      axes.length >= 3 &&
      axes.slice(0, 3).every((value: number) => Number.isFinite(Number(value)));
    if (!axesValid) {
      return {
        text: `bubbleBox ${bubbleBoundsMode} --`,
        title: "bubbleBox bounds unavailable (missing hull axes)",
      };
    }
    const basisResolved = hullDimsResolved?.basis ?? HULL_BASIS_IDENTITY;
    const dimsXYZ: [number, number, number] = [Number(axes[0]) * 2, Number(axes[1]) * 2, Number(axes[2]) * 2];
    const scale = Number.isFinite(hullDomainScale) ? hullDomainScale : 1;
    const boundsXYZ: [number, number, number] = [dimsXYZ[0] * scale, dimsXYZ[1] * scale, dimsXYZ[2] * scale];
    const boundsFRU = remapXYZToFrontRightUp(boundsXYZ, basisResolved);
    const titleParts = [
      `bubbleBox bounds (x,y,z)=${boundsXYZ.map((v) => v.toFixed(3)).join(",")}`,
      `bubbleBox bounds (F/R/U)=${formatTriplet(boundsFRU.values, 3)}`,
      `domainScale=${scale}`,
      `basis F/R/U=${boundsFRU.labels.front}/${boundsFRU.labels.right}/${boundsFRU.labels.up}`,
    ];
    return {
      text: `bubbleBox ${bubbleBoundsMode} F/R/U ${formatTriplet(boundsFRU.values, 1)} m`,
      title: titleParts.join(" | "),
    };
  }, [axes, bubbleBoundsMode, hullDomainScale, hullDimsResolved?.basis, hullVolumeDomain]);

  const thetaScaleBadge = useMemo(() => {
    const expected = Number.isFinite(Number(thetaScaleExpected)) ? Number(thetaScaleExpected) : null;
    const audit = thetaAudit;
    const estimate = audit && Number.isFinite(Number(audit.estimate)) ? Number(audit.estimate) : null;
    const delta = audit && Number.isFinite(Number(audit.diffPct)) ? Number(audit.diffPct) : null;
    if (expected === null || audit == null || estimate === null) {
      return {
        text: "theta scale --",
        className: "bg-slate-900/70 text-slate-200",
        title: "Theta scale parity unavailable",
      };
    }
    const deltaText = delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "--";
    const className =
      delta !== null && Math.abs(delta) > 10
        ? "bg-slate-900/70 text-slate-200 ring-1 ring-amber-500/60"
        : "bg-slate-900/70 text-slate-200";
    return {
      text: `theta scale ${expected.toExponential(2)} / est ${estimate.toExponential(2)} | delta ${deltaText}`,
      className,
      title: `expected=${expected}, est=${estimate}, diffPct=${delta ?? "--"}, deviation=${audit.deviation ?? "--"}`,
    };
  }, [thetaScaleExpected, thetaAudit]);
  const solveOrderSnapshot = useMemo<SolveOrderSnapshot>(() => {
    const liveAny = (live as any) ?? {};
    const warp = (liveAny.warp ?? {}) as Record<string, any>;
    const nat = (liveAny.natario ?? {}) as Record<string, any>;
    const adapter = (warp.metricAdapter ?? {}) as Record<string, any>;
    const chart = (adapter.chart ?? {}) as Record<string, any>;
    const betaDiag = (adapter.betaDiagnostics ?? {}) as Record<string, any>;
    const metricStress = (warp.metricStressDiagnostics ?? {}) as Record<string, any>;
    const metricContract = (warp.metricT00Contract ?? {}) as Record<string, any>;
    const viability = (liveAny.warpViability ?? {}) as Record<string, any>;
    const viabilityConstraints = Array.isArray(viability.constraints) ? viability.constraints : [];
    const gr = (liveAny.gr ?? {}) as Record<string, any>;
    const grConstraints = (gr.constraints ?? {}) as Record<string, any>;
    const hConstraint = (grConstraints.H_constraint ?? {}) as Record<string, any>;
    const mConstraint = (grConstraints.M_constraint ?? {}) as Record<string, any>;
    const grContractLike =
      (liveAny.grConstraintContract ?? liveAny.grConstraint ?? liveAny.grGrounding ?? {}) as Record<
        string,
        any
      >;
    const grGate = (grContractLike.gate ?? liveAny.grConstraintGate ?? {}) as Record<string, any>;
    const gateThresholds = (grGate.thresholds ?? {}) as Record<string, any>;
    const gatePolicy = (grGate.policy ?? {}) as Record<string, any>;
    const viabilitySnapshot = (
      viability.snapshot ??
      viability.certificate?.payload?.snapshot ??
      {}
    ) as Record<string, any>;
    const grGuardrails = (viabilitySnapshot.grGuardrails ?? {}) as Record<string, any>;
    const grGuardH = (grGuardrails.H_constraint ?? {}) as Record<string, any>;
    const grGuardM = (grGuardrails.M_constraint ?? {}) as Record<string, any>;

    const pickNum = (...values: unknown[]): number | null => {
      for (const value of values) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
      }
      return null;
    };
    const pickBool = (...values: unknown[]): boolean | null => {
      for (const value of values) {
        if (value === true || value === false) return value;
      }
      return null;
    };
    const pickStr = (...values: unknown[]): string | null => {
      for (const value of values) {
        if (typeof value === "string" && value.trim().length) return value.trim();
      }
      return null;
    };

    const classifyStatus = (raw: string | null): SolveOrderStatus => {
      if (!raw) return "unknown";
      const normalized = raw.trim().toLowerCase();
      if (
        normalized.includes("pass") ||
        normalized.includes("ok") ||
        normalized.includes("aligned") ||
        normalized.includes("admissible")
      ) {
        return "pass";
      }
      if (
        normalized.includes("fail") ||
        normalized.includes("mismatch") ||
        normalized.includes("violation") ||
        normalized.includes("inadmissible")
      ) {
        return "fail";
      }
      if (
        normalized.includes("warn") ||
        normalized.includes("partial") ||
        normalized.includes("pending") ||
        normalized.includes("unknown")
      ) {
        return "warn";
      }
      return "warn";
    };

    const family = pickStr(adapter.family, warp.family, liveAny.warpFieldType, nat.metricMode ? "natario" : null);
    const chartLabel = pickStr(chart.label, nat.chartLabel);
    const chartContractStatus = pickStr(chart.contractStatus, chart.contract_status, nat.chartContractStatus);
    const chartContractReason = pickStr(chart.contractReason, chart.contract_reason);
    const dtGammaPolicy = pickStr(chart.dtGammaPolicy, nat.chartDtGammaPolicy);
    const coordinateMap = pickStr(chart.coordinateMap, chart.coordinate_map);
    const alpha = pickNum(adapter.alpha);
    const gammaDiagRaw = Array.isArray(adapter.gammaDiag) ? adapter.gammaDiag : null;
    const gammaDiag =
      gammaDiagRaw && gammaDiagRaw.length >= 3
        ? ([Number(gammaDiagRaw[0]), Number(gammaDiagRaw[1]), Number(gammaDiagRaw[2])] as [number, number, number])
        : null;

    const betaMethod = pickStr(betaDiag.method, adapter.betaSource);
    const thetaMax = pickNum(betaDiag.thetaMax, betaDiag.theta_max);
    const thetaRms = pickNum(betaDiag.thetaRms, betaDiag.theta_rms);
    const curlMax = pickNum(betaDiag.curlMax, betaDiag.curl_max);
    const curlRms = pickNum(betaDiag.curlRms, betaDiag.curl_rms);
    const thetaConformalMax = pickNum(betaDiag.thetaConformalMax, betaDiag.theta_conformal_max);
    const thetaConformalRms = pickNum(betaDiag.thetaConformalRms, betaDiag.theta_conformal_rms);
    const bPrimeOverBMax = pickNum(betaDiag.bPrimeOverBMax, betaDiag.bprime_over_b_max);
    const bDoubleOverBMax = pickNum(betaDiag.bDoubleOverBMax, betaDiag.bdouble_over_b_max);
    const metricSampleCount = pickNum(betaDiag.sampleCount, betaDiag.sample_count);
    const metricStepM = pickNum(betaDiag.step_m, betaDiag.stepM);
    const betaNote = pickStr(betaDiag.note, betaDiag.notes?.[0]);

    const thetaGeom = pickNum(liveAny.theta_geom, thetaMax, thetaRms);
    const kTraceMean = pickNum(liveAny.metric_k_trace_mean, metricStress.kTraceMean, metricStress.k_trace_mean);
    let parity: "aligned" | "mismatch" | "unknown" = "unknown";
    let parityNote = "Need theta_geom and K_trace to verify theta = -K parity.";
    if (thetaGeom !== null && kTraceMean !== null) {
      if (Math.abs(thetaGeom) < 1e-12 || Math.abs(kTraceMean) < 1e-12) {
        parity = "unknown";
        parityNote = "Near-zero theta or K_trace; parity not stable for sign auditing.";
      } else {
        const signTheta = Math.sign(thetaGeom);
        const signNegK = Math.sign(-kTraceMean);
        parity = signTheta === signNegK ? "aligned" : "mismatch";
        parityNote =
          parity === "aligned"
            ? "theta sign is consistent with theta = -K in this snapshot."
            : "theta sign disagrees with theta = -K for this snapshot.";
      }
    }

    const natarioConstraint = pickBool(liveAny.natarioConstraint);

    const stressRef = pickStr(warp.metricT00Ref, nat.metricT00Ref, liveAny.qi_rho_source);
    const stressSource = pickStr(warp.metricT00Source, nat.metricT00Source, nat.metricSource);
    const stressContractStatus = pickStr(metricContract.status, metricContract.contractStatus, nat.metricT00ContractStatus);
    const stressContractReason = pickStr(metricContract.reason, metricContract.contractReason, nat.metricT00ContractReason);
    const stressObserver = pickStr(metricContract.observer, nat.metricT00Observer);
    const stressNormalization = pickStr(metricContract.normalization, nat.metricT00Normalization);
    const stressUnitSystem = pickStr(metricContract.unitSystem, nat.metricT00UnitSystem);
    const rhoGeomMean = pickNum(metricStress.rhoGeomMean, metricStress.rho_geom_mean);
    const rhoSiMean = pickNum(metricStress.rhoSiMean, metricStress.rho_si_mean);
    const stressSampleCount = pickNum(metricStress.sampleCount, metricStress.sample_count);
    const stressStepM = pickNum(metricStress.step_m, metricStress.stepM);
    const stressScaleM = pickNum(metricStress.scale_m, metricStress.scaleM);

    const tauLCms = pickNum(lightLoop?.tauLC_ms);
    const burstMs = pickNum(lightLoop?.burst_ms);
    const dwellMs = pickNum(lightLoop?.dwell_ms);
    const dutyPct =
      burstMs !== null && dwellMs !== null && burstMs + dwellMs > 0
        ? (burstMs / (burstMs + dwellMs)) * 100
        : null;

    const zetaValue = pickNum((sharedComplianceState as any)?.zeta?.value, liveAny.zeta);
    const zetaLimit = pickNum((sharedComplianceState as any)?.zeta?.limit);
    const tsRatio = pickNum(liveAny.TS_ratio);
    const fordRomanCompliance = pickBool(liveAny.fordRomanCompliance);
    const viabilityStatus = pickStr(
      viability.status,
      viability.certificate?.payload?.status,
      viability.certificate?.status,
    );
    const certificateHash = pickStr(viability.certificateHash, viability.certificate?.certificateHash);
    const integrityOk = pickBool(viability.integrityOk, viability.certificate?.integrityOk);
    const firstHardFailFromConstraint = viabilityConstraints.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const status = String((entry as any).status ?? "").toLowerCase();
      const severity = String((entry as any).severity ?? "").toUpperCase();
      return status === "fail" && severity === "HARD";
    });
    const firstAnyFail = viabilityConstraints.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const status = String((entry as any).status ?? "").toLowerCase();
      return status === "fail";
    });
    const firstHardFail = pickStr(
      (firstHardFailFromConstraint as any)?.id,
      (firstAnyFail as any)?.id,
      viability.firstFail,
    );

    const H_rms = pickNum(hConstraint.rms, grGuardH.rms);
    const M_rms = pickNum(mConstraint.rms, grGuardM.rms);
    const H_maxAbs = pickNum(hConstraint.maxAbs, hConstraint.max_abs, grGuardH.maxAbs);
    const M_maxAbs = pickNum(mConstraint.maxAbs, mConstraint.max_abs, grGuardM.maxAbs);
    const H_rms_max = pickNum(gateThresholds.H_rms_max, grGuardH.threshold, 1e-2);
    const M_rms_max = pickNum(gateThresholds.M_rms_max, grGuardM.threshold, 1e-3);
    const H_maxAbs_max = pickNum(gateThresholds.H_maxAbs_max, 1e-1);
    const M_maxAbs_max = pickNum(gateThresholds.M_maxAbs_max, 1e-2);
    const classifyGateStatus = (raw: string | null): "pass" | "fail" | "unknown" | null => {
      if (!raw) return null;
      const normalized = raw.trim().toLowerCase();
      if (normalized.includes("pass") || normalized.includes("ok")) return "pass";
      if (normalized.includes("fail") || normalized.includes("blocked")) return "fail";
      if (normalized.includes("unknown") || normalized.includes("pending")) return "unknown";
      return "unknown";
    };
    const computedGateStatus = (() => {
      if (
        Number.isFinite(H_rms ?? NaN) &&
        Number.isFinite(M_rms ?? NaN) &&
        Number.isFinite(H_rms_max ?? NaN) &&
        Number.isFinite(M_rms_max ?? NaN)
      ) {
        return (H_rms as number) <= (H_rms_max as number) && (M_rms as number) <= (M_rms_max as number)
          ? "pass"
          : "fail";
      }
      return "unknown";
    })();
    const gateStatus =
      classifyGateStatus(pickStr(grGate.status, viabilitySnapshot.gr_constraint_gate_status)) ?? computedGateStatus;
    const gateMode = pickStr(gatePolicy.mode);
    const gateUnknownAsFail = pickBool(gatePolicy.unknownAsFail);
    const constraintSource = (() => {
      if (
        Number.isFinite(hConstraint.rms) ||
        Number.isFinite(hConstraint.maxAbs) ||
        Number.isFinite(mConstraint.rms) ||
        Number.isFinite(mConstraint.maxAbs)
      ) {
        return "pipeline.gr.constraints";
      }
      if (
        Number.isFinite(grGuardH.rms) ||
        Number.isFinite(grGuardM.rms) ||
        Number.isFinite(grGuardH.maxAbs) ||
        Number.isFinite(grGuardM.maxAbs)
      ) {
        return "warpViability.snapshot.grGuardrails";
      }
      return "unavailable";
    })();
    const observationTimeIso = pickStr(viability.certificate?.header?.issuedAt);
    const observationTimeIsoMs =
      observationTimeIso != null ? (Number.isFinite(Date.parse(observationTimeIso)) ? Date.parse(observationTimeIso) : null) : null;
    const observationTimeMs = pickNum(gr.updatedAt, viability.updatedAt, observationTimeIsoMs, liveAny.updatedAt);
    const geodesicMode = geodesicDiagnostics?.mode ?? null;
    const worldtubeModeSource = (() => {
      if (planarVizMode === 3) {
        if (hullRendererBackend === "mis-service") return "mis-service-path-tracer";
        if (hullRendererBackend === "webgpu") return "webgpu-pathtracer";
        if (skyboxMode === "geodesic") {
          if (geodesicMode === "full-3+1-christoffel") {
            return "webgl-hull-raymarch+null-geodesic-3p1-christoffel";
          }
          if (geodesicMode === "reduced-1+1-fallback") {
            return "webgl-hull-raymarch+null-geodesic-1p1-fallback";
          }
          return "webgl-hull-raymarch+null-geodesic-auto";
        }
        if (skyboxMode === "flat") return "webgl-hull-raymarch+flat-sky";
        return "webgl-hull-raymarch";
      }
      if (hullRendererBackend === "webgl" && skyboxMode === "geodesic") {
        if (geodesicMode === "full-3+1-christoffel") return "webgl-3p1-null-geodesic-bundle";
        if (geodesicMode === "reduced-1+1-fallback") return "webgl-1p1-null-geodesic-bundle-fallback";
        return "webgl-null-geodesic-bundle-auto";
      }
      if (hullRendererBackend === "webgl" && skyboxMode === "flat") {
        return "webgl-1p1-null-bundle-flat";
      }
      if (hullRendererBackend === "mis-service") {
        return "mis-service-frame-lane";
      }
      return "mixed-lens-shell";
    })();
    const frameModeSource = metricThetaSlice
      ? "metric-volume.theta-channel"
      : volumeSource === "lattice" && latticeSlice
        ? "lattice-dfdr-slice"
        : "analytic-reduced-order";
    const metricVolumeLatest =
      typeof window !== "undefined"
        ? ((window as any).__hullMetricVolumeLatest as HullMetricVolumeContract | null | undefined)
        : null;
    const metricVolume =
      metricVolumeLatest &&
      metricVolumeLatest.kind === "hull3d:metric-volume" &&
      Array.isArray(metricVolumeLatest.dims) &&
      metricVolumeLatest.dims.length >= 3
        ? metricVolumeLatest
        : null;
    const metricDims: [number, number, number] | null = metricVolume
      ? [
          Math.max(1, Math.floor(Number(metricVolume.dims[0]) || 1)),
          Math.max(1, Math.floor(Number(metricVolume.dims[1]) || 1)),
          Math.max(1, Math.floor(Number(metricVolume.dims[2]) || 1)),
        ]
      : null;
    const metricBounds = metricVolume?.bounds;
    const metricSpacingM: [number, number, number] | null =
      metricDims &&
      metricBounds &&
      Array.isArray(metricBounds.min) &&
      Array.isArray(metricBounds.max) &&
      metricBounds.min.length >= 3 &&
      metricBounds.max.length >= 3
        ? [
            Number.isFinite(metricVolume?.voxelSize_m?.[0] as number)
              ? Math.max(1e-6, Number(metricVolume?.voxelSize_m?.[0]))
              : Math.max(1e-6, Math.abs(Number(metricBounds.max[0]) - Number(metricBounds.min[0])) / metricDims[0]),
            Number.isFinite(metricVolume?.voxelSize_m?.[1] as number)
              ? Math.max(1e-6, Number(metricVolume?.voxelSize_m?.[1]))
              : Math.max(1e-6, Math.abs(Number(metricBounds.max[1]) - Number(metricBounds.min[1])) / metricDims[1]),
            Number.isFinite(metricVolume?.voxelSize_m?.[2] as number)
              ? Math.max(1e-6, Number(metricVolume?.voxelSize_m?.[2]))
              : Math.max(1e-6, Math.abs(Number(metricBounds.max[2]) - Number(metricBounds.min[2])) / metricDims[2]),
          ]
        : metricDims
          ? [1, 1, 1]
          : null;
    const metricCellTotal = metricDims ? metricDims[0] * metricDims[1] * metricDims[2] : 0;
    let displacementMetricChannel: string | null = null;
    let displacementMetricData: Float32Array | null = null;
    if (metricVolume && metricDims && metricCellTotal > 0 && metricVolume.channels) {
      for (const name of METRIC_DISPLACEMENT_CHANNEL_PRIORITY) {
        const channel = metricVolume.channels[name];
        if (
          channel &&
          channel.data instanceof Float32Array &&
          channel.data.length >= metricCellTotal
        ) {
          displacementMetricChannel = name;
          displacementMetricData = channel.data;
          break;
        }
      }
    }
    const metricSampleX =
      displacementMetricData && metricDims && metricSpacingM
        ? sampleMetricAxisRadius({
            data: displacementMetricData,
            dims: metricDims,
            spacingM: metricSpacingM,
            axis: 0,
          })
        : { radiusM: null, symmetryErrorM: null, peakAbs: null, sampleCount: 0 };
    const metricSampleY =
      displacementMetricData && metricDims && metricSpacingM
        ? sampleMetricAxisRadius({
            data: displacementMetricData,
            dims: metricDims,
            spacingM: metricSpacingM,
            axis: 1,
          })
        : { radiusM: null, symmetryErrorM: null, peakAbs: null, sampleCount: 0 };
    const metricSampleZ =
      displacementMetricData && metricDims && metricSpacingM
        ? sampleMetricAxisRadius({
            data: displacementMetricData,
            dims: metricDims,
            spacingM: metricSpacingM,
            axis: 2,
          })
        : { radiusM: null, symmetryErrorM: null, peakAbs: null, sampleCount: 0 };
    const metricRadiusM: [number | null, number | null, number | null] = [
      metricSampleX.radiusM,
      metricSampleY.radiusM,
      metricSampleZ.radiusM,
    ];
    const renderedRadiusM: [number | null, number | null, number | null] = [
      Number.isFinite(axes[0] * R) ? Math.max(0, Math.abs(axes[0] * R)) : null,
      Number.isFinite(axes[1] * R) ? Math.max(0, Math.abs(axes[1] * R)) : null,
      Number.isFinite(axes[2] * R) ? Math.max(0, Math.abs(axes[2] * R)) : null,
    ];
    const axisDeltaM: [number | null, number | null, number | null] = [
      metricRadiusM[0] != null && renderedRadiusM[0] != null ? renderedRadiusM[0] - metricRadiusM[0] : null,
      metricRadiusM[1] != null && renderedRadiusM[1] != null ? renderedRadiusM[1] - metricRadiusM[1] : null,
      metricRadiusM[2] != null && renderedRadiusM[2] != null ? renderedRadiusM[2] - metricRadiusM[2] : null,
    ];
    const axisDeltaPct: [number | null, number | null, number | null] = [
      axisDeltaM[0] != null && metricRadiusM[0] != null && metricRadiusM[0] > 1e-9
        ? (axisDeltaM[0] / metricRadiusM[0]) * 100
        : null,
      axisDeltaM[1] != null && metricRadiusM[1] != null && metricRadiusM[1] > 1e-9
        ? (axisDeltaM[1] / metricRadiusM[1]) * 100
        : null,
      axisDeltaM[2] != null && metricRadiusM[2] != null && metricRadiusM[2] > 1e-9
        ? (axisDeltaM[2] / metricRadiusM[2]) * 100
        : null,
    ];
    const finiteAxisDeltas = axisDeltaM.filter((value): value is number => Number.isFinite(value as number));
    const finiteMetricRadii = metricRadiusM.filter((value): value is number => Number.isFinite(value as number));
    const rmsDeltaM =
      finiteAxisDeltas.length > 0
        ? Math.sqrt(
            finiteAxisDeltas.reduce((sum, value) => sum + value * value, 0) /
              finiteAxisDeltas.length,
          )
        : null;
    const maxAbsDeltaM =
      finiteAxisDeltas.length > 0
        ? Math.max(...finiteAxisDeltas.map((value) => Math.abs(value)))
        : null;
    const metricRadiusMeanM =
      finiteMetricRadii.length > 0
        ? finiteMetricRadii.reduce((sum, value) => sum + value, 0) / finiteMetricRadii.length
        : null;
    const rmsDeltaPct =
      rmsDeltaM != null && metricRadiusMeanM != null && metricRadiusMeanM > 1e-9
        ? (rmsDeltaM / metricRadiusMeanM) * 100
        : null;
    const worldtubeRadiusM =
      renderedRadiusM[0] != null
        ? renderedRadiusM[0]
        : renderedRadiusM.find((value): value is number => Number.isFinite(value as number)) ?? null;
    const worldtubeDeltaM =
      worldtubeRadiusM != null && metricRadiusM[0] != null
        ? worldtubeRadiusM - metricRadiusM[0]
        : worldtubeRadiusM != null && metricRadiusMeanM != null
          ? worldtubeRadiusM - metricRadiusMeanM
          : null;
    const analyticDisplacementStatus: SolveOrderStatus = (() => {
      if (rmsDeltaPct == null || maxAbsDeltaM == null || metricRadiusMeanM == null) return "unknown";
      const passAbs = Math.max(0.15, 0.08 * metricRadiusMeanM);
      const warnAbs = Math.max(0.45, 0.2 * metricRadiusMeanM);
      if (rmsDeltaPct <= 12 && maxAbsDeltaM <= passAbs) return "pass";
      if (rmsDeltaPct <= 30 && maxAbsDeltaM <= warnAbs) return "warn";
      return "fail";
    })();
    const displacementSamplingPoints =
      metricSampleX.sampleCount + metricSampleY.sampleCount + metricSampleZ.sampleCount;
    const integralSignalRaw = hullRendererBackend === "mis-service" ? integralSignalRef.current : null;
    const integralSignalAgeMs =
      integralSignalRaw ? Math.max(0, Date.now() - Number(integralSignalRaw.updatedAtMs || 0)) : null;
    const integralSignal =
      integralSignalRaw && integralSignalAgeMs != null && integralSignalAgeMs <= 12000
        ? integralSignalRaw
        : null;
    const integralComparison = compareIntegralSignalToMetric({
      signal: integralSignal,
      metricRadiusM,
    });
    const integralDisplacementStatus = integralComparison.status;
    const displacementStatus: SolveOrderStatus = integralDisplacementStatus;
    const displacementNote = (() => {
      const parts: string[] = [];
      if (displacementMetricData) {
        parts.push(
          `metric shell sampled from |${displacementMetricChannel ?? "unknown"}| axis peaks`,
        );
      } else {
        parts.push(
          "metric shell channel unavailable (requires theta/K_trace/H_constraint in metric volume)",
        );
      }
      parts.push(
        `analytic render shell estimated as R*axes_i in ${coordinateMap ?? "viewer"} coordinates`,
      );
      if (integralSignal) {
        const rms = integralComparison.rmsZResidualM;
        const hausdorff = integralComparison.hausdorffM;
        parts.push(
          `integral signal source=${integralComparison.source ?? "unknown"} zRms=${Number.isFinite(rms as number) ? (rms as number).toFixed(3) : "--"} m hausdorff=${Number.isFinite(hausdorff as number) ? (hausdorff as number).toFixed(3) : "--"} m`,
        );
      } else if (hullRendererBackend === "mis-service") {
        parts.push("integral signal unavailable (no recent depth+mask attachments)");
      } else {
        parts.push("integral signal comparison active on mis-service backend only");
      }
      return parts.join(" | ");
    })();

    const metricFormStatus = (() => {
      const base = classifyStatus(chartContractStatus);
      if (base === "unknown") return base;
      if (base === "pass" && alpha !== null && Math.abs(alpha - 1) > 1e-3) return "warn";
      return base;
    })();
    const shiftMappingStatus = (() => {
      if (betaMethod && (thetaMax !== null || thetaRms !== null)) return "pass";
      if (betaMethod) return "warn";
      return "unknown";
    })();
    const yorkParityStatus: SolveOrderStatus =
      parity === "aligned" ? "pass" : parity === "mismatch" ? "fail" : "unknown";
    const natarioStatus: SolveOrderStatus =
      natarioConstraint === true ? "pass" : natarioConstraint === false ? "fail" : "unknown";
    const metricT00Status: SolveOrderStatus = (() => {
      if (!stressRef) return "unknown";
      const metricRef = stressRef.startsWith("warp.metric.T00");
      const sourceMetric = stressSource?.toLowerCase().includes("metric") ?? false;
      if (metricRef && sourceMetric) return "pass";
      if (metricRef) return "warn";
      return "fail";
    })();

    return {
      checks: [
        {
          id: "metric_form_alignment",
          label: "metric form",
          status: metricFormStatus,
          note: chartContractStatus
            ? `chart=${chartLabel ?? "--"} status=${chartContractStatus}`
            : "chart contract status unavailable",
        },
        {
          id: "shift_mapping",
          label: "shift mapping",
          status: shiftMappingStatus,
          note: betaMethod
            ? `method=${betaMethod} thetaMax=${thetaMax != null ? thetaMax.toExponential(2) : "--"}`
            : "beta diagnostics method unavailable",
        },
        {
          id: "york_time_sign_parity",
          label: "york parity",
          status: yorkParityStatus,
          note: parityNote,
        },
        {
          id: "natario_control_behavior",
          label: "natario ctrl",
          status: natarioStatus,
          note:
            natarioConstraint === null
              ? "natarioConstraint unavailable"
              : `natarioConstraint=${natarioConstraint ? "pass" : "fail"} | curlMax=${curlMax != null ? curlMax.toExponential(2) : "--"}`,
        },
        {
          id: "metric_derived_t00_path",
          label: "metric T00 path",
          status: metricT00Status,
          note: `${stressRef ?? "--"} | source=${stressSource ?? "--"}`,
        },
      ],
      metric: {
        family,
        chartLabel,
        dtGammaPolicy,
        contractStatus: chartContractStatus,
        contractReason: chartContractReason,
        coordinateMap,
        alpha,
        gammaDiag,
        betaMethod,
        thetaMax,
        thetaRms,
        curlMax,
        curlRms,
        thetaConformalMax,
        thetaConformalRms,
        bPrimeOverBMax,
        bDoubleOverBMax,
        sampleCount: metricSampleCount,
        stepM: metricStepM,
        note: betaNote,
      },
      derived: {
        thetaGeom,
        kTraceMean,
        parity,
        parityNote,
        natarioConstraint,
      },
      stress: {
        ref: stressRef,
        source: stressSource,
        contractStatus: stressContractStatus,
        contractReason: stressContractReason,
        observer: stressObserver,
        normalization: stressNormalization,
        unitSystem: stressUnitSystem,
        rhoGeomMean,
        rhoSiMean,
        sampleCount: stressSampleCount,
        stepM: stressStepM,
        scaleM: stressScaleM,
      },
      constraints: {
        H_rms,
        M_rms,
        H_maxAbs,
        M_maxAbs,
        H_rms_max,
        M_rms_max,
        H_maxAbs_max,
        M_maxAbs_max,
        gateStatus,
        gateMode,
        unknownAsFail: gateUnknownAsFail,
      },
      provenance: {
        frameModeSource,
        energyModeSource: "analytic-reduced-order",
        driveModeSource: "control-scaled-engineering",
        worldtubeModeSource,
        constraintSource,
        observationTimeMs,
      },
      optics: {
        geodesicMode,
        scientificEnabled: geodesicDiagnostics?.scientificEnabled ?? false,
        metricAvailable: geodesicDiagnostics?.metricAvailable ?? false,
        chart: geodesicDiagnostics?.chart ?? null,
        consistency: geodesicDiagnostics?.consistency ?? "unknown",
        consistencyNote: geodesicDiagnostics?.consistencyNote ?? null,
        maxNullResidual: geodesicDiagnostics?.maxNullResidual ?? null,
        stepConvergence: geodesicDiagnostics?.stepConvergence ?? null,
        bundleSpread: geodesicDiagnostics?.bundleSpread ?? null,
      },
      displacement: {
        status: displacementStatus,
        analyticStatus: analyticDisplacementStatus,
        integralStatus: integralDisplacementStatus,
        metricChannel: displacementMetricChannel,
        chartLabel: metricVolume?.chart ?? chartLabel ?? null,
        coordinateMap: metricVolume?.coordinateMap ?? coordinateMap ?? null,
        metricRadiusM,
        renderedRadiusM,
        axisDeltaM,
        axisDeltaPct,
        rmsDeltaM,
        rmsDeltaPct,
        maxAbsDeltaM,
        worldtubeRadiusM,
        worldtubeDeltaM,
        samplingPoints: displacementSamplingPoints > 0 ? displacementSamplingPoints : null,
        symmetryErrorM: [metricSampleX.symmetryErrorM, metricSampleY.symmetryErrorM, metricSampleZ.symmetryErrorM],
        integralSignal: {
          source: integralComparison.source,
          updatedAtMs: integralComparison.updatedAtMs,
          ageMs: integralComparison.ageMs ?? integralSignalAgeMs,
          coveragePct: integralComparison.coveragePct,
          depthMinM: integralComparison.depthMinM,
          depthMaxM: integralComparison.depthMaxM,
          depthMeanM: integralComparison.depthMeanM,
          fitScalePxPerM: integralComparison.fitScalePxPerM,
          fitZOffsetM: integralComparison.fitZOffsetM,
          fitSign: integralComparison.fitSign,
          rmsZResidualM: integralComparison.rmsZResidualM,
          maxAbsZResidualM: integralComparison.maxAbsZResidualM,
          hausdorffM: integralComparison.hausdorffM,
          rmsPassMaxM: integralComparison.rmsPassMaxM,
          rmsWarnMaxM: integralComparison.rmsWarnMaxM,
          maxAbsPassMaxM: integralComparison.maxAbsPassMaxM,
          maxAbsWarnMaxM: integralComparison.maxAbsWarnMaxM,
          hausdorffPassMaxM: integralComparison.hausdorffPassMaxM,
          hausdorffWarnMaxM: integralComparison.hausdorffWarnMaxM,
          rmsStatus: integralComparison.rmsStatus,
          maxAbsStatus: integralComparison.maxAbsStatus,
          hausdorffStatus: integralComparison.hausdorffStatus,
          statusReason: integralComparison.statusReason,
          sampleCount: integralComparison.sampleCount,
          note: integralComparison.note,
        },
        note: displacementNote,
      },
      lightCross: {
        tauLCms,
        burstMs,
        dwellMs,
        dutyPct,
      },
      guardrails: {
        zetaValue,
        zetaLimit,
        tsRatio,
        fordRomanCompliance,
        natarioConstraint,
        viabilityStatus,
        certificateHash,
        integrityOk,
        firstHardFail,
      },
    };
  }, [
    live,
    axes,
    R,
    planarVizMode,
    skyboxMode,
    hullRendererBackend,
    volumeSource,
    geodesicDiagnostics,
    latticeSlice,
    metricThetaSlice,
    integralSignalVersion,
    lightLoop?.tauLC_ms,
    lightLoop?.burst_ms,
    lightLoop?.dwell_ms,
    (sharedComplianceState as any)?.zeta?.value,
    (sharedComplianceState as any)?.zeta?.limit,
  ]);
  const safeSub = (lhs: number | null | undefined, rhs: number | null | undefined): number | null => {
    if (!Number.isFinite(lhs ?? NaN) || !Number.isFinite(rhs ?? NaN)) return null;
    return Number(lhs) - Number(rhs);
  };
  useEffect(() => {
    if (planarVizMode !== 3) return;
    const now = performance.now();
    if (now - lastSolvePipelineSummaryLogRef.current < 1700) return;
    lastSolvePipelineSummaryLogRef.current = now;

    const checks = Array.isArray(solveOrderSnapshot.checks) ? solveOrderSnapshot.checks : [];
    const checksPass = checks.filter((entry) => entry.status === "pass").length;
    const checksWarn = checks.filter((entry) => entry.status === "warn").length;
    const checksFail = checks.filter((entry) => entry.status === "fail").length;
    const checksUnknown = checks.filter((entry) => entry.status === "unknown").length;
    const displacement = solveOrderSnapshot.displacement;
    const optics = solveOrderSnapshot.optics;
    const constraints = solveOrderSnapshot.constraints;
    const guardrails = solveOrderSnapshot.guardrails;
    const level =
      checksFail > 0 ||
      constraints.gateStatus === "fail" ||
      displacement?.status === "fail" ||
      optics?.consistency === "fail"
        ? "warn"
        : "info";
    emitAlcubierreDebugEvent({
      level,
      category: "solve_to_render_pipeline",
      source: "alcubierre.solve-render-chain.summary",
      note: "equation->metric->constraints->optics->render displacement summary",
      expected: {
        H_rms_max: constraints.H_rms_max,
        M_rms_max: constraints.M_rms_max,
        H_maxAbs_max: constraints.H_maxAbs_max,
        M_maxAbs_max: constraints.M_maxAbs_max,
        guardrail_zeta_limit: guardrails.zetaLimit,
      },
      rendered: {
        H_rms: constraints.H_rms,
        M_rms: constraints.M_rms,
        H_maxAbs: constraints.H_maxAbs,
        M_maxAbs: constraints.M_maxAbs,
        optics_max_null_residual: optics?.maxNullResidual ?? null,
        optics_step_convergence: optics?.stepConvergence ?? null,
        optics_bundle_spread: optics?.bundleSpread ?? null,
        displacement_rms_delta_m: displacement?.rmsDeltaM ?? null,
        displacement_max_abs_delta_m: displacement?.maxAbsDeltaM ?? null,
        displacement_rms_z_residual_m: displacement?.integralSignal?.rmsZResidualM ?? null,
        displacement_hausdorff_m: displacement?.integralSignal?.hausdorffM ?? null,
        guardrail_zeta_value: guardrails.zetaValue,
        guardrail_ts_ratio: guardrails.tsRatio,
      },
      delta: {
        H_rms_margin: safeSub(constraints.H_rms_max, constraints.H_rms),
        M_rms_margin: safeSub(constraints.M_rms_max, constraints.M_rms),
        H_maxAbs_margin: safeSub(constraints.H_maxAbs_max, constraints.H_maxAbs),
        M_maxAbs_margin: safeSub(constraints.M_maxAbs_max, constraints.M_maxAbs),
      },
      measurements: {
        stage: "summary",
        family: solveOrderSnapshot.metric.family ?? "unknown",
        chart: solveOrderSnapshot.metric.chartLabel ?? "unknown",
        betaMethod: solveOrderSnapshot.metric.betaMethod ?? "unknown",
        geodesicMode: optics?.geodesicMode ?? "unknown",
        opticsConsistency: optics?.consistency ?? "unknown",
        gateStatus: constraints.gateStatus ?? "unknown",
        gateMode: constraints.gateMode ?? "unknown",
        unknownAsFail: constraints.unknownAsFail,
        worldtubeModeSource: solveOrderSnapshot.provenance.worldtubeModeSource ?? "unknown",
        frameModeSource: solveOrderSnapshot.provenance.frameModeSource ?? "unknown",
        displacementStatus: displacement?.status ?? "unknown",
        displacementAnalyticStatus: displacement?.analyticStatus ?? "unknown",
        displacementIntegralStatus: displacement?.integralStatus ?? "unknown",
        displacementMetricChannel: displacement?.metricChannel ?? "unknown",
        integralSource: displacement?.integralSignal?.source ?? "none",
        integralCoveragePct: displacement?.integralSignal?.coveragePct ?? null,
        integralAgeMs: displacement?.integralSignal?.ageMs ?? null,
        viabilityStatus: guardrails.viabilityStatus ?? "unknown",
        firstHardFail: guardrails.firstHardFail ?? "none",
        certificateHash: guardrails.certificateHash ?? "none",
        certificateIntegrityOk: guardrails.integrityOk,
        checksPass,
        checksWarn,
        checksFail,
        checksUnknown,
      },
    });
  }, [planarVizMode, solveOrderSnapshot, emitAlcubierreDebugEvent]);
  useEffect(() => {
    if (planarVizMode !== 3) return;
    const displacement = solveOrderSnapshot.displacement;
    if (!displacement) return;
    const now = performance.now();
    if (now - lastDisplacementLogRef.current < 1500) return;
    lastDisplacementLogRef.current = now;
    const level =
      displacement.status === "fail"
        ? "warn"
        : displacement.status === "warn"
          ? "warn"
          : "info";
    emitAlcubierreDebugEvent({
      level,
      category: "render_vs_metric_displacement",
      source: "alcubierre.render-vs-metric.displacement",
      note: displacement.note ?? null,
      expected: {
        metric_radius_x_m: displacement.metricRadiusM?.[0] ?? null,
        metric_radius_y_m: displacement.metricRadiusM?.[1] ?? null,
        metric_radius_z_m: displacement.metricRadiusM?.[2] ?? null,
      },
      rendered: {
        rendered_radius_x_m: displacement.renderedRadiusM?.[0] ?? null,
        rendered_radius_y_m: displacement.renderedRadiusM?.[1] ?? null,
        rendered_radius_z_m: displacement.renderedRadiusM?.[2] ?? null,
        worldtube_radius_m: displacement.worldtubeRadiusM ?? null,
        depth_min_m: displacement.integralSignal?.depthMinM ?? null,
        depth_max_m: displacement.integralSignal?.depthMaxM ?? null,
        depth_mean_m: displacement.integralSignal?.depthMeanM ?? null,
      },
      delta: {
        delta_x_m: displacement.axisDeltaM?.[0] ?? null,
        delta_y_m: displacement.axisDeltaM?.[1] ?? null,
        delta_z_m: displacement.axisDeltaM?.[2] ?? null,
        delta_x_pct: displacement.axisDeltaPct?.[0] ?? null,
        delta_y_pct: displacement.axisDeltaPct?.[1] ?? null,
        delta_z_pct: displacement.axisDeltaPct?.[2] ?? null,
        rms_delta_m: displacement.rmsDeltaM ?? null,
        rms_delta_pct: displacement.rmsDeltaPct ?? null,
        max_abs_delta_m: displacement.maxAbsDeltaM ?? null,
        worldtube_delta_m: displacement.worldtubeDeltaM ?? null,
        rms_z_residual_m: displacement.integralSignal?.rmsZResidualM ?? null,
        max_abs_z_residual_m: displacement.integralSignal?.maxAbsZResidualM ?? null,
        hausdorff_m: displacement.integralSignal?.hausdorffM ?? null,
        rms_z_residual_pass_max_m: displacement.integralSignal?.rmsPassMaxM ?? null,
        rms_z_residual_warn_max_m: displacement.integralSignal?.rmsWarnMaxM ?? null,
        max_abs_z_residual_pass_max_m: displacement.integralSignal?.maxAbsPassMaxM ?? null,
        max_abs_z_residual_warn_max_m: displacement.integralSignal?.maxAbsWarnMaxM ?? null,
        hausdorff_pass_max_m: displacement.integralSignal?.hausdorffPassMaxM ?? null,
        hausdorff_warn_max_m: displacement.integralSignal?.hausdorffWarnMaxM ?? null,
        fit_z_offset_m: displacement.integralSignal?.fitZOffsetM ?? null,
      },
      measurements: {
        displacementStatus: displacement.status,
        analyticStatus: displacement.analyticStatus ?? "unknown",
        integralStatus: displacement.integralStatus ?? "unknown",
        metricChannel: displacement.metricChannel ?? "unknown",
        chart: displacement.chartLabel ?? "unknown",
        coordinateMap: displacement.coordinateMap ?? "unknown",
        samplingPoints: displacement.samplingPoints ?? null,
        integralSource: displacement.integralSignal?.source ?? "none",
        integralCoveragePct: displacement.integralSignal?.coveragePct ?? null,
        integralAgeMs: displacement.integralSignal?.ageMs ?? null,
        fitScalePxPerM: displacement.integralSignal?.fitScalePxPerM ?? null,
        fitSign: displacement.integralSignal?.fitSign ?? null,
        integralSampleCount: displacement.integralSignal?.sampleCount ?? null,
        integralRmsStatus: displacement.integralSignal?.rmsStatus ?? "unknown",
        integralMaxAbsStatus: displacement.integralSignal?.maxAbsStatus ?? "unknown",
        integralHausdorffStatus: displacement.integralSignal?.hausdorffStatus ?? "unknown",
        integralStatusReason: displacement.integralSignal?.statusReason ?? null,
      },
    });
  }, [planarVizMode, solveOrderSnapshot.displacement, emitAlcubierreDebugEvent]);
  const latticeCoverageBadge = useMemo(() => {
    if (!latticeModeEnabled) {
      return {
        text: "Coverage --",
        className: "bg-slate-900/70 text-slate-300",
        title: "Enable lattice to view volume coverage.",
      };
    }
    if (!latticeOverlayVolumeReady || !latticeVolumeStats) {
      const fallbackTitle =
        volumePath === "brick"
          ? "Volume source is brick; lattice coverage pending."
          : "Lattice path not active; using analytic volume.";
      return {
        text: "Coverage pending",
        className: "bg-amber-900/60 text-amber-100",
        title: overlayLockedReason ?? fallbackTitle,
      };
    }
    const covText = `${latticeVolumeStats.covPct.toFixed(1)}%`;
    const gateText = latticeVolumeStats.maxGate.toFixed(3);
    const clampBits: string[] = [];
    if (sharedLatticeState?.volume?.clampReasons?.length) {
      clampBits.push(`volume clamp: ${sharedLatticeState.volume.clampReasons.join(", ")}`);
    }
    if (latticeFrameStats?.clampReasons?.length) {
      clampBits.push(`frame clamp: ${latticeFrameStats.clampReasons.join(", ")}`);
    }
    const titleParts = [
      `Coverage ${covText} | max gate ${gateText}${latticeVolumeStats.cacheHit ? " (cache)" : ""}`,
      clampBits.length ? clampBits.join(" | ") : null,
    ].filter(Boolean);
    return {
      text: `Coverage ${covText} | gate ${gateText}`,
      className: "bg-sky-900/60 text-sky-100",
      title: titleParts.join(" | "),
    };
  }, [
    latticeModeEnabled,
    latticeOverlayVolumeReady,
    latticeVolumeStats,
    overlayLockedReason,
    sharedLatticeState?.volume?.clampReasons,
    latticeFrameStats?.clampReasons,
    volumePath,
  ]);
  const perfProfileBadge = useMemo(
    () => ({
      text: `Profile ${overlayProfileKey}${latticeProfileTag === "card" ? "/card" : ""}`,
      className: "bg-slate-900/70 text-slate-200",
      title: `Quality preset ${hullQuality} | lattice profile ${latticeProfileTag}`,
    }),
    [hullQuality, latticeProfileTag, overlayProfileKey],
  );
  const latticePathBadge = useMemo(() => {
    const pathText = volumePath === "lattice" ? "Lattice" : volumePath === "brick" ? "Brick" : "Analytic";
    const className =
      volumePath === "lattice"
        ? "bg-emerald-900/70 text-emerald-100"
        : volumePath === "brick"
          ? "bg-slate-800/70 text-slate-100"
          : "bg-amber-900/70 text-amber-100";
    const titleParts = [
      `Path=${pathText}`,
      `Source=${volumeSource}`,
      volumePath === "lattice" && latticeDowngradeLabel ? `Format=${latticeDowngradeLabel}` : null,
      volumePath === "lattice" && latticeDowngradeReason ? `Reason=${latticeDowngradeReason}` : null,
      latticeFallbackStatus?.hint ?? latticeFallbackStatus?.label ?? overlayLockedReason,
    ].filter(Boolean);
    const formatLabel = volumePath === "lattice" && latticeDowngradeLabel ? ` | ${latticeDowngradeLabel}` : "";
    return {
      text: `${pathText}${formatLabel}`,
      className,
      title: titleParts.join(" | "),
    };
  }, [
    latticeDowngradeLabel,
    latticeDowngradeReason,
    latticeFallbackStatus?.hint,
    latticeFallbackStatus?.label,
    overlayLockedReason,
    volumePath,
    volumeSource,
  ]);

  const latticeDowngradeBadge = useMemo(() => {
    const reason =
      latticeDowngradeReason ??
      ((latticeRuntime as any)?.telemetry?.downgradeReason as string | undefined) ??
      ((latticeRuntime as any)?.formatReason as string | undefined) ??
      null;
    const frameClamp = latticeFrameStats?.clampReasons?.length ? latticeFrameStats.clampReasons.join(", ") : null;
    const volumeClamp = sharedLatticeState?.volume?.clampReasons?.length
      ? sharedLatticeState.volume.clampReasons.join(", ")
      : null;
    if (!reason && !frameClamp && !volumeClamp) return null;
    const titleParts = [
      reason ? `downgrade: ${reason}` : null,
      latticeRuntime?.formatLabel ? `format: ${latticeRuntime.formatLabel}` : null,
      frameClamp ? `frame clamp: ${frameClamp}` : null,
      volumeClamp ? `volume clamp: ${volumeClamp}` : null,
    ].filter(Boolean);
    return {
      text: reason ? `Downgrade ${reason}` : "Clamp active",
      className: "bg-amber-900/70 text-amber-100",
      title: titleParts.join(" | "),
    };
  }, [
    latticeDowngradeReason,
    latticeRuntime,
    latticeFrameStats?.clampReasons,
    sharedLatticeState?.volume?.clampReasons,
  ]);
  const latticeRetryable =
    latticeModeEnabled &&
    latticeAvailable &&
    Boolean(latticeFallbackStatus || latticeGpuStatus?.volumeFailed || latticeGpuStatus?.sdfFailed);

  const handleRetryLattice = useCallback(() => {
    setLatticeGpuStatus(null);
    setSharedLattice({
      volume: null,
      sdf: latticeRequireSdf ? null : undefined,
      updatedAt: Date.now(),
    });
    publish("hull3d:lattice:retry", {
      ts: Date.now(),
      reason: latticeFallbackStatus?.reason ?? null,
      modeEnabled: latticeModeEnabled,
    });
  }, [latticeFallbackStatus?.reason, latticeModeEnabled, latticeRequireSdf, setSharedLattice]);

  useEffect(() => {
    if (!latticeModeEnabled || !frameClampSignature) return;
    if (latticeQualityLocked) return;
    if (latticeAutoTuneRef.current.lastFrameKey === frameClampSignature) return;
    const frameClampReasons = sharedLatticeState?.frame?.clampReasons ?? [];
    const hitPaddingOrDims = frameClampReasons.some(
      (reason) => reason.startsWith("padding:") || reason.startsWith("dims:")
    );
    if (!hitPaddingOrDims) return;

    let changed = false;
    const actions: string[] = [];
    if (hullVolumeDomain !== "wallBand") {
      setHullVolumeDomain("wallBand");
      actions.push("volumeDomain=wallBand");
      changed = true;
    }
    if (bubbleBoundsMode !== "tight") {
      setBubbleBoundsMode("tight");
      actions.push("padding=tight");
      changed = true;
    }
    if (hullVoxelDensity === "high") {
      setHullVoxelDensity("medium");
      actions.push("voxelDensity=medium");
      changed = true;
    } else if (hullVoxelDensity === "medium") {
      setHullVoxelDensity("low");
      actions.push("voxelDensity=low");
      changed = true;
    }
    if (hullQuality !== "low") {
      setHullQuality("low");
      actions.push("quality=low");
      changed = true;
    }

    latticeAutoTuneRef.current.lastFrameKey = frameClampSignature;
    if (changed) {
      console.info("[Hull3D] Auto-tuned lattice after frame clamp", { actions, frameClampReasons });
      handleRetryLattice();
    }
  }, [
    bubbleBoundsMode,
    frameClampSignature,
    handleRetryLattice,
    hullQuality,
    hullVoxelDensity,
    hullVolumeDomain,
    latticeModeEnabled,
    latticeQualityLocked,
    sharedLatticeState?.frame?.clampReasons,
  ]);

  useEffect(() => {
    if (!latticeModeEnabled || !latticeRequireSdf) return;
    if (!sdfClampSignature) return;
    if (latticeAutoTuneRef.current.lastSdfKey === sdfClampSignature) return;

    const signature = sdfClampSignature.toLowerCase();
    const hasDegenerate = signature.includes("degenerate");
    const budgetHit = signature.includes("budget");
    const sampleHit = signature.includes("sample");
    if (hasDegenerate || budgetHit || sampleHit) {
      latticeAutoTuneRef.current.lastSdfKey = sdfClampSignature;
      setLatticeRequireSdf(false);
      console.warn("[Hull3D] Auto-disabled Require SDF after SDF clamp", { reasons: sdfClampSignature });
    }
  }, [latticeModeEnabled, latticeRequireSdf, sdfClampSignature]);

  useEffect(() => {
    const caps = (latticeGpuStatus as any)?.caps ?? null;
    if (!latticeModeEnabled || !caps) return;
    if (latticeAutoTuneRef.current.capsApplied) return;

    const actions: string[] = [];
    if (!caps.supportsHalfFloatLinear && !caps.supportsFloatLinear && hullVoxelDensity !== "low") {
      setHullVoxelDensity("low");
      actions.push("voxelDensity=low");
    }
    if (caps.max3DTextureSize && caps.max3DTextureSize < 1024) {
      if (hullVolumeDomain !== "wallBand") {
        setHullVolumeDomain("wallBand");
        actions.push("volumeDomain=wallBand");
      }
      if (bubbleBoundsMode !== "tight") {
        setBubbleBoundsMode("tight");
        actions.push("padding=tight");
      }
    }

    latticeAutoTuneRef.current.capsApplied = true;
    if (actions.length) {
      console.info("[Hull3D] Auto-tuned lattice for GPU caps", { actions, caps });
    }
  }, [bubbleBoundsMode, hullVoxelDensity, hullVolumeDomain, latticeGpuStatus, latticeModeEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const frame = sharedLatticeState?.frame ?? null;
    const volume = sharedLatticeState?.volume ?? null;
    const sdf = sharedLatticeState?.sdf ?? null;
    const strobe = sharedLatticeState?.strobe ?? null;

    const voxels = frame?.voxelCount ?? 0;
    const budgetMax = frame?.budget?.maxVoxels ?? null;
    const budgetPct = budgetMax && budgetMax > 0 ? (voxels / budgetMax) * 100 : null;

    const caps = (latticeGpuStatus as any)?.caps ?? null;
    const runtime = (latticeGpuStatus as any)?.runtime ?? null;
    const volumeFailedReason =
      typeof (latticeGpuStatus as any)?.volumeFailedReason === "string"
        ? String((latticeGpuStatus as any).volumeFailedReason)
        : null;
    const sdfFailedReason =
      typeof (latticeGpuStatus as any)?.sdfFailedReason === "string"
        ? String((latticeGpuStatus as any).sdfFailedReason)
        : null;
    const watchdogStats = latticeWatchdogStats;
    const uploadTelemetry = (runtime as any)?.telemetry ?? null;
    const formatReason =
      ((runtime as any)?.formatReason as string | undefined) ??
      (uploadTelemetry?.downgradeReason as string | undefined) ??
      null;
    const frameClampReasons = frame?.clampReasons?.length ? frame.clampReasons : null;
    const volumeClampReasons = volume?.clampReasons?.length ? volume.clampReasons : null;

    const health = {
      ts: Date.now(),
      enabled: latticeModeEnabled,
      path: runtime?.hasLatticeVolume ? "lattice" : "analytic",
      fallbackReason: latticeFallbackStatus?.reason ?? null,
      fallbackLabel: latticeFallbackStatus?.label ?? null,
      fallbackLevel: latticeFallbackStatus?.level ?? null,
      hashes: {
        strobe: strobe?.hash ?? null,
        weights: strobe?.weightHash ?? null,
        volume: volume?.hash ?? null,
        volumeDeterminism: latticeVolumeDeterminismHash,
        sdf: sdf?.key ?? null,
        sdfDeterminism: latticeSdfDeterminismHash,
      },
      metrics: {
        voxelCount: voxels,
        voxelBudgetMax: budgetMax,
        voxelBudgetPct: budgetPct,
        coveragePct: volume?.stats?.coverage != null ? volume.stats.coverage * 100 : null,
        maxGate: volume?.stats?.maxGate ?? null,
        formatLabel: runtime?.formatLabel ?? null,
        formatReason: formatReason,
        uploadBytes: uploadTelemetry?.bytes ?? null,
        uploadBudgetBytes: uploadTelemetry?.budgetBytes ?? null,
        uploadBudgetVoxels: uploadTelemetry?.budgetVoxels ?? null,
        uploadSkippedReason: uploadTelemetry?.skippedReason ?? null,
        uploadDowngradeReason: uploadTelemetry?.downgradeReason ?? null,
        frameClampReasons,
        volumeClampReasons,
        watchdogBlocked: watchdogStats?.blocked ?? 0,
        watchdogLastBlockedAt: watchdogStats?.lastBlockedAt ?? null,
      },
      gpu: latticeGpuStatus
        ? {
            volumeReady: latticeGpuStatus.volumeReady,
            volumeFailed: latticeGpuStatus.volumeFailed,
            volumeFailedReason,
            sdfReady: latticeGpuStatus.sdfReady,
            sdfFailed: latticeGpuStatus.sdfFailed,
            sdfFailedReason,
            caps,
            runtime,
          }
        : null,
    };

    const healthKey = [
      latticeModeEnabled ? 1 : 0,
      runtime?.hasLatticeVolume ? "lattice" : "analytic",
      latticeFallbackStatus?.reason ?? "ok",
      volumeFailedReason ?? "volFail:none",
      sdfFailedReason ?? "sdfFail:none",
      runtime?.backend ?? "backend:none",
      runtime?.formatLabel ?? "fmt:none",
      runtime?.formatReason ?? "fmtReason:none",
      caps?.max3DTextureSize ?? 0,
      caps?.maxTextureSize ?? 0,
      caps?.supportsFloatLinear ? 1 : 0,
      caps?.supportsHalfFloatLinear ? 1 : 0,
      strobe?.hash ?? "strobe:none",
      strobe?.weightHash ?? "weights:none",
      volume?.hash ?? "volume:none",
      latticeVolumeDeterminismHash ?? "volumeDet:none",
      sdf?.key ?? "sdf:none",
      latticeSdfDeterminismHash ?? "sdfDet:none",
      voxels,
      budgetMax ?? 0,
      Math.round((budgetPct ?? 0) * 10) / 10,
      latticeGpuStatus?.volumeReady ? 1 : 0,
      latticeGpuStatus?.volumeFailed ? 1 : 0,
      latticeGpuStatus?.sdfReady ? 1 : 0,
      latticeGpuStatus?.sdfFailed ? 1 : 0,
      Math.round(((volume?.stats?.coverage ?? 0) * 1000)) / 10,
      Math.round(((volume?.stats?.maxGate ?? 0) * 1e6)) / 1e6,
      uploadTelemetry?.bytes ?? "upload:none",
      uploadTelemetry?.skippedReason ?? "upload:ok",
      uploadTelemetry?.downgradeReason ?? "upload:downgrade:none",
      watchdogStats?.blocked ?? 0,
    ].join("|");

    if (healthKey !== latticeHealthKeyRef.current) {
      latticeHealthKeyRef.current = healthKey;
      (window as any).__hullLatticeHealth = health;
      (window as any).__hullWebGLCaps = caps;
      publish("hull3d:lattice:health", health);
    }

    const prevFallback = latticeFallbackReasonRef.current;
    const nextFallback = latticeFallbackStatus?.reason ?? null;
    if (nextFallback !== prevFallback) {
      latticeFallbackReasonRef.current = nextFallback;
      publish("hull3d:lattice:fallback", {
        ts: health.ts,
        enabled: latticeModeEnabled,
        reason: nextFallback,
        label: latticeFallbackStatus?.label ?? null,
        level: latticeFallbackStatus?.level ?? null,
        hint: latticeFallbackStatus?.hint ?? null,
        detail: latticeFallbackStatus?.detail ?? null,
        volumeHash: volume?.hash ?? null,
        sdfKey: sdf?.key ?? null,
        path: health.path,
        runtime,
        caps,
        formatReason,
        frameClampReasons,
        volumeClampReasons,
      });

      if (nextFallback) {
        const debug =
          typeof window !== "undefined" && Boolean((window as any).__latticeFallbackDebug);
        if (debug || (nextFallback !== "preview-missing" && nextFallback !== "preview-unavailable")) {
          const log = latticeFallbackStatus?.level === "info" ? console.info : console.warn;
          log("[Hull3D][lattice] fallback", {
            reason: nextFallback,
            label: latticeFallbackStatus?.label,
            hint: latticeFallbackStatus?.hint,
            detail: latticeFallbackStatus?.detail,
            path: health.path,
            volumeHash: volume?.hash?.slice(0, 16) ?? null,
            sdfKey: sdf?.key?.slice(0, 16) ?? null,
            caps,
            runtime,
          });
        }
      }
    }
  }, [
    latticeModeEnabled,
    latticeFallbackStatus,
    latticeGpuStatus,
    sharedLatticeState?.frame,
    sharedLatticeState?.strobe,
    sharedLatticeState?.volume,
    sharedLatticeState?.sdf,
    latticeVolumeDeterminismHash,
    latticeSdfDeterminismHash,
    latticeProfileTag,
    latticeWatchdogStats,
  ]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const volume = latticeOverlayVolumeReady ? latticeVolumeForRenderer : null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr =
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, READABILITY_DPR_MAX)
        : 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!voxelOverlayActive || !volume) {
      ctx.restore();
      return;
    }

    ctx.scale(dpr, dpr);
    ctx.font = "11px Inter, system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.strokeStyle = "rgba(148,163,184,0.65)";

    const dims = volume.dims;
    const gate = volume.gate3D;
    const axisIndex = voxelSliceAxis === "x" ? 0 : voxelSliceAxis === "y" ? 1 : 2;
    const sliceCount = Math.max(1, dims[axisIndex] || 1);
    const sliceMinIdx = Math.max(0, Math.min(sliceCount - 1, Math.round(voxelSliceMin * (sliceCount - 1))));
    const sliceMaxIdx = Math.max(sliceMinIdx, Math.min(sliceCount - 1, Math.round(voxelSliceMax * (sliceCount - 1))));
    const maxGate = Math.max(1e-6, latticeVolumeStats?.maxGate ?? volume.stats?.maxGate ?? 1);

    const dimsA = axisIndex === 0 ? dims[1] : axisIndex === 1 ? dims[0] : dims[1];
    const dimsB = axisIndex === 0 ? dims[2] : axisIndex === 1 ? dims[2] : dims[0];
    const indexFor = (a: number, b: number, slice: number) => {
      if (axisIndex === 0) {
        const x = slice;
        const y = a;
        const z = b;
        return x + dims[0] * (y + dims[1] * z);
      }
      if (axisIndex === 1) {
        const x = a;
        const y = slice;
        const z = b;
        return x + dims[0] * (y + dims[1] * z);
      }
      const x = b;
      const y = a;
      const z = slice;
      return x + dims[0] * (y + dims[1] * z);
    };

    const sampleValue = (a: number, b: number, slice: number) => {
      const idx = indexFor(a, b, slice);
      return gate[idx] ?? 0;
    };

    const size = Math.floor(Math.max(64, Math.min(180, Math.min(cssW, cssH) * 0.26)));
    const pad = 12;
    const boxW = size;
    const boxH = size;
    const sliceYTop = pad;
    const sliceYBottom = sliceYTop + boxH + 14;
    const sliceX = cssW - boxW - pad;

    const renderSlice = (label: string, sliceIndex: number, ox: number, oy: number) => {
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      ctx.fillRect(ox - 4, oy - 4, boxW + 8, boxH + 20);
      const img = ctx.createImageData(boxW, boxH);
      const data = img.data;
      for (let y = 0; y < boxH; y++) {
        const aIdx = Math.min(dimsA - 1, Math.round((y / Math.max(1, boxH - 1)) * (dimsA - 1)));
        for (let x = 0; x < boxW; x++) {
          const bIdx = Math.min(dimsB - 1, Math.round((x / Math.max(1, boxW - 1)) * (dimsB - 1)));
          const val = sampleValue(aIdx, bIdx, sliceIndex);
          const norm = Math.max(0, Math.min(1, val / maxGate));
          const tone = Math.pow(norm, 0.4);
          const r = Math.round(40 + 170 * tone);
          const g = Math.round(110 + 130 * tone);
          const b = Math.round(160 + 70 * tone);
          const a = Math.round(220 * tone);
          const base = (y * boxW + x) * 4;
          data[base] = r;
          data[base + 1] = g;
          data[base + 2] = b;
          data[base + 3] = a;
        }
      }
      ctx.putImageData(img, ox, oy);
      ctx.strokeStyle = "rgba(148,163,184,0.7)";
      ctx.strokeRect(ox - 1, oy - 1, boxW + 2, boxH + 2);
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      ctx.fillText(`${label} ${voxelSliceAxis.toUpperCase()} slice #${sliceIndex + 1}/${sliceCount}`, ox, oy + boxH + 12);
    };

    if (voxelSlicesEnabled) {
      renderSlice("Min", sliceMinIdx, sliceX, sliceYTop);
      renderSlice("Max", sliceMaxIdx, sliceX, sliceYBottom);
    }

    if (coverageHeatmapEnabled) {
      const strideA = Math.max(1, Math.floor(dimsA / 64));
      const strideB = Math.max(1, Math.floor(dimsB / 64));
      const profile = new Float32Array(sliceCount);
      let profileMax = 0;
      for (let s = 0; s < sliceCount; s++) {
        let peak = 0;
        for (let a = 0; a < dimsA; a += strideA) {
          for (let bIdx = 0; bIdx < dimsB; bIdx += strideB) {
            const v = sampleValue(a, bIdx, s);
            if (v > peak) peak = v;
          }
        }
        profile[s] = peak;
        if (peak > profileMax) profileMax = peak;
      }
      const chartW = Math.max(180, cssW * 0.42);
      const chartH = 48;
      const chartX = pad;
      const chartY = cssH - chartH - pad;
      ctx.fillStyle = "rgba(15,23,42,0.6)";
      ctx.fillRect(chartX - 4, chartY - 4, chartW + 8, chartH + 8);
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.fillRect(chartX, chartY, chartW, chartH);
      if (profileMax > 0) {
        const bucketCount = Math.min(220, sliceCount);
        const bucketW = chartW / Math.max(1, bucketCount);
        for (let i = 0; i < bucketCount; i++) {
          const start = Math.floor((i / bucketCount) * sliceCount);
          const end = Math.min(sliceCount, Math.floor(((i + 1) / bucketCount) * sliceCount));
          let bucketPeak = 0;
          for (let s = start; s < end; s++) {
            if (profile[s] > bucketPeak) bucketPeak = profile[s];
          }
          const norm = Math.max(0, Math.min(1, bucketPeak / profileMax));
          const barH = norm * (chartH - 10);
          ctx.fillStyle = `rgba(16,185,129,${0.25 + 0.55 * norm})`;
          ctx.fillRect(chartX + i * bucketW, chartY + chartH - barH - 4, Math.max(1, bucketW - 0.5), barH);
        }
        const minLine = chartX + (sliceMinIdx / Math.max(1, sliceCount - 1)) * chartW;
        const maxLine = chartX + (sliceMaxIdx / Math.max(1, sliceCount - 1)) * chartW;
        ctx.strokeStyle = "rgba(94,234,212,0.9)";
        ctx.beginPath();
        ctx.moveTo(minLine, chartY - 2);
        ctx.lineTo(minLine, chartY + chartH + 2);
        ctx.moveTo(maxLine, chartY - 2);
        ctx.lineTo(maxLine, chartY + chartH + 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(226,232,240,0.85)";
        ctx.fillText(`Coverage by slice (axis ${voxelSliceAxis.toUpperCase()})`, chartX, chartY - 6);
      }
    }

    ctx.restore();
  }, [
    coverageHeatmapEnabled,
    latticeOverlayVolumeReady,
    latticeVolumeForRenderer,
    latticeVolumeStats?.maxGate,
    voxelOverlayActive,
    voxelSliceAxis,
    voxelSliceMax,
    voxelSliceMin,
    voxelSlicesEnabled,
  ]);

  useEffect(() => {
    const payload = {
      ts: Date.now(),
      profile: overlayProfileKey,
      latticeProfile: latticeProfileTag,
      overlays: {
        slices: {
          enabled: voxelSlicesEnabled,
          axis: voxelSliceAxis,
          min: voxelSliceMin,
          max: voxelSliceMax,
        },
        coverageHeatmap: coverageHeatmapEnabled,
      },
      path: volumePath,
      fallback: latticeFallbackStatus?.reason ?? null,
      coveragePct: latticeVolumeStats?.covPct ?? null,
      maxGate: latticeVolumeStats?.maxGate ?? null,
      downgrade: latticeDowngradeLabel,
      downgradeReason: latticeDowngradeReason,
      backend: (latticeRuntime as any)?.backend ?? null,
    };
    const key = JSON.stringify({
      profile: payload.profile,
      latticeProfile: payload.latticeProfile,
      overlays: payload.overlays,
      path: payload.path,
      fallback: payload.fallback,
      coveragePct: payload.coveragePct,
      maxGate: payload.maxGate,
      downgrade: payload.downgrade,
      downgradeReason: payload.downgradeReason,
      backend: payload.backend,
    });
    if (overlayTelemetryKeyRef.current !== key) {
      overlayTelemetryKeyRef.current = key;
      (window as any).__hullVoxelOverlay = payload;
      (window as any).__hullLatticePath = {
        path: payload.path,
        fallback: payload.fallback,
        coveragePct: payload.coveragePct,
        maxGate: payload.maxGate,
        downgrade: payload.downgrade,
        downgradeReason: payload.downgradeReason,
        profile: payload.profile,
        latticeProfile: payload.latticeProfile,
        backend: payload.backend,
      };
      publish("hull3d:voxel-overlays", payload);
    }
  }, [
    coverageHeatmapEnabled,
    latticeDowngradeLabel,
    latticeDowngradeReason,
    latticeFallbackStatus?.reason,
    volumePath,
    latticeProfileTag,
    latticeVolumeStats?.covPct,
    latticeVolumeStats?.maxGate,
    overlayProfileKey,
    voxelSliceAxis,
    voxelSliceMax,
    voxelSliceMin,
    voxelSlicesEnabled,
    (latticeRuntime as any)?.backend,
  ]);
  const scientificAtlasPaneFailure = findScientificAtlasPaneFailure(scientificAtlasState);
  const scientificSnapshotIdentity = useMemo(
    () => buildScientificSnapshotIdentity(scientificCertificateState),
    [scientificCertificateState],
  );

  return (
    <CurvatureVoxProvider quality="low" refetchMs={1000}>
      <div className={cn("w-full", className)}>      {/* Fixed-height wrapper so the panel does not resize during live updates */}
      <div className="flex flex-col h-[560px] md:h-[620px] lg:h-[680px]">
        <TooltipProvider delayDuration={120} skipDelayDuration={250}>
          {/* Keep readings area from changing overall panel height; allow it to scroll if it grows */}
          <div className="flex flex-wrap gap-2 text-xs mb-2 opacity-85 shrink-0 overflow-y-auto pr-1 max-h-28 md:max-h-32">
          <span className="px-2 py-1 rounded bg-slate-800">Mode: <b>{String(live?.currentMode||"Ã¢â‚¬â€")}</b></span>
          <MetricTooltipBadge
            label="ÃŽÂ¸_expected"
            value={theta_expected.toExponential(3)}
            description="Analytic York-time amplitude at the bubble wall before sector boosts (ÃŽÂ²Ã‚Â·Ã¢Ë†â€šf/Ã¢Ë†â€šr evaluated at r = R)."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          <MetricTooltipBadge
            label="ÃŽÂ¸_peak (Ãƒâ€”Ã¢Ë†Å¡w/f)"
            value={theta_peak.toExponential(3)}
            description="Peak York-time amplitude after applying the Ã¢Ë†Å¡(w/f_active) duty boost so active sectors stay visible."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          <MetricTooltipBadge
            label="ÃŽÂ¸Ã¢â€šÅ¡Ã¢â€šâ€“ (tail)"
            value={thetaPk.toExponential(3)}
            description="Tail-median of the sampled field Ã¢â‚¬â€ a robust peak estimate that resists transient spikes and noise."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          <MetricTooltipBadge
            label="ÃÆ’"
            value={sigma.toFixed(2)}
            description="Bubble wall steepness parameter. Larger ÃÆ’ squeezes the shell and sharpens gradients across the hull."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          <MetricTooltipBadge
            label="R"
            value={R.toFixed(2)}
            description="Nominal Alcubierre bubble radius used to scale sampling and camera framing."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          <MetricTooltipBadge
            label="ÃŽÂ²"
            value={beta.toFixed(2)}
            description="Ship velocity expressed as ÃŽÂ² = v/c. Drives the extrinsic curvature magnitude across the shell."
            className="bg-slate-800 hover:bg-slate-700/90"
          />
          {thetaAudit && (
            <MetricTooltipBadge
              label="ÃŽÂ¸_server ÃŽâ€"
              value={`${thetaAudit.diffPct.toFixed(1)}%`}
              description="Symmetric percent gap between the panel estimate and the server-provided ÃŽÂ¸ scale. Positive values mean the panel is reporting a stronger drive field."
              className={cn(
                "hover:bg-slate-600/80",
                thetaAudit.deviation > 10
                  ? "bg-amber-800/80 text-amber-100 hover:bg-amber-700/80"
                  : "bg-slate-700/80 text-slate-200"
              )}
            />
          )}
          {driveDiag && (
            <>
              <div className="flex items-center gap-2">
                <MetricTooltipBadge
                  label="ampChain"
                  value={driveDiag.ampChain.toExponential(2)}
                  description="Product of I3_geoA3, q, and I3_VdB that scales the drive-mode York time response."
                  className="bg-emerald-800/70 hover:bg-emerald-700/80"
                />
                <TheoryBadge
                  refs={["vanden-broeck-1999"]}
                  categoryAnchor="Geometry-Amplifiers"
                />
              </div>
              <MetricTooltipBadge
                label="Ã¢Ë†Å¡d_FR"
                value={driveDiag.gate.toFixed(3)}
                description="Square-root of the duty factor (d_FR) indicating how much of the drive field is active right now."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              <MetricTooltipBadge
                label="ÃŽÂ¸Ã¢â€šÅ¡Ã¢â€šâ€“Ã¢ÂÂº"
                value={driveDiag.thetaPkPos.toExponential(2)}
                description="Positive tail peak of the drive field after sector weighting, highlighting the strongest active arc."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              <MetricTooltipBadge
                label="ÃŽâ€ÃŽÂ¸"
                value={driveDiag.span !== null ? driveDiag.span.toExponential(2) : "Ã¢â‚¬â€"}
                description="Robust span of ÃŽÂ¸ (Drive) using the 5Ã¢â‚¬â€œ95% clipped range to avoid transient spikes. Indicates how much curvature variation the sector pattern induces."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              <MetricTooltipBadge
                label="ÃÆ’_sector"
                value={`${driveDiag.sigmaSectors.toFixed(2)}s`}
                description="Gaussian sector width (ÃÆ’) in scheduler sectors. Larger values broaden the active lobe across the ellipsoid."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              <MetricTooltipBadge
                label="floor"
                value={`${(driveDiag.sectorFloor * 100).toFixed(0)}%`}
                description="Baseline fraction of duty applied across all sectors to keep the full shell visible."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              <MetricTooltipBadge
                label="sync"
                value={driveDiag.syncScheduler ? "scheduler" : "fallback"}
                description="Indicates whether the drive gating is currently following the shared light-crossing scheduler or fallback contiguous sectors."
                className="bg-emerald-800/70 hover:bg-emerald-700/80"
              />
              {Number.isFinite(driveDiag.centerDeltaDeg ?? NaN) && (
                <MetricTooltipBadge
                  label="centerÃŽâ€"
                  value={`${(driveDiag.centerDeltaDeg ?? 0).toFixed(1)}Ã‚Â°`}
                  description="Angular difference between CPU-sampled peak weight and shader's sector center. Values near 0Ã‚Â° indicate correct anchoring."
                  className={cn(
                    "bg-emerald-800/70 hover:bg-emerald-700/80",
                    (driveDiag.centerDeltaDeg ?? 0) > 12 ? "ring-2 ring-amber-500/70" : undefined
                  )}
                />
              )}
              <MetricTooltipBadge
                  label="phase"
                  value={`${(ds.phase01*360).toFixed(0)}Ã‚Â°`}
                  description="Viewer phase offset applied to rotate the active lobe around the hull. Set 180Ã‚Â° to flip contraction/expansion sides."
                  className="bg-emerald-800/70 hover:bg-emerald-700/80"
                />
            </>
          )}

          <div className="ml-auto flex flex-wrap justify-end gap-1 text-[0.65rem]">
            <span
              className={cn("rounded px-2 py-1 bg-slate-900/70 text-slate-200", sectorUtilSummary.className)}
              title={sectorUtilSummary.title}
            >
              {sectorUtilSummary.text}
            </span>
            <span
              className={cn("rounded px-2 py-1 flex flex-col gap-1", lightCrossSummary.className)}
              title={lightCrossSummary.title}
            >
              <span>{lightCrossSummary.text}</span>
              <span
                className="flex flex-wrap items-center gap-1 font-mono text-emerald-100"
                title={busPhaseSummary.title}
              >
                <span>{busPhaseSummary.busText}</span>
                <span className="text-emerald-400/70">|</span>
                <span>?f {busPhaseSummary.deltaText}</span>
                <span className="text-emerald-400/70">|</span>
                <span>{busPhaseSummary.loopText}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-1 rounded bg-emerald-900/60 px-1 py-0.5 text-[0.55rem] uppercase tracking-wide text-emerald-200">
                      Source: usePhaseBridge
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="center"
                    className="max-w-xs text-xs text-slate-200"
                  >
                    Source: usePhaseBridge (server + metrics blend). Live channel:
                    {" "}
                    {busPhaseSource}
                  </TooltipContent>
                </Tooltip>
              </span>
              {phaseSparkline && (
                <div className="mt-1 flex flex-col gap-0.5">
                  <svg
                    viewBox={`0 0 ${phaseSparkline.width} ${phaseSparkline.height}`}
                    width={phaseSparkline.width}
                    height={phaseSparkline.height}
                    className="h-7 w-28"
                    role="img"
                    aria-label="Loop vs bus phase sparkline"
                  >
                    <title>Loop vs bus phase history</title>
                    <path
                      d={phaseSparkline.loopPath}
                      fill="none"
                      stroke="rgba(56,189,248,0.75)"
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={phaseSparkline.busPath}
                      fill="none"
                      stroke="rgba(251,191,36,0.9)"
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="flex items-center gap-3 text-[0.55rem] uppercase tracking-wide text-emerald-200/70">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1 w-3 rounded bg-sky-300" />
                      Loop
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1 w-3 rounded bg-amber-300" />
                      Bus
                    </span>
                  </span>
                </div>
              )}
            </span>
            {phaseDiffIndicator && (
              <span
                className={cn("rounded px-2 py-1 text-slate-200", phaseDiffIndicator.className)}
                title={phaseDiffIndicator.title}
              >
                {phaseDiffIndicator.text}
              </span>
            )}
            {busPayloadSummary && (
              <span
                className="rounded px-2 py-1 bg-slate-900/70 text-slate-200"
                title={busPayloadSummary.title}
              >
                {busPayloadSummary.text}
              </span>
            )}
            <span
              className={cn("rounded px-2 py-1", zetaBadgeData.className)}
              title={zetaBadgeData.title}
            >
              {zetaBadgeData.text}
            </span>
            <span
              className={cn("rounded px-2 py-1 bg-emerald-900/60 text-emerald-100", driveChainSummary.className)}
              title={driveChainSummary.title}
            >
              {driveChainSummary.text}
            </span>
            <span
              className={cn("rounded px-2 py-1 bg-slate-900/70 text-slate-200", cadenceSummary.className)}
              title={cadenceSummary.title}
            >
              {cadenceSummary.text}
            </span>
            <span
              className={cn("rounded px-2 py-1 bg-slate-900/70 text-slate-200", hullSummary.className)}
              title={hullSummary.title}
            >
              {hullSummary.text}
            </span>
            {bubbleBoxSummary ? (
              <span
                className="rounded px-2 py-1 bg-slate-900/70 text-slate-200"
                title={bubbleBoxSummary.title}
              >
                {bubbleBoxSummary.text}
              </span>
            ) : null}
            <span
              className={cn("rounded px-2 py-1", thetaScaleBadge.className)}
              title={thetaScaleBadge.title}
            >
              {thetaScaleBadge.text}
            </span>
            <span
              className={cn("rounded px-2 py-1", latticeCoverageBadge.className)}
              title={latticeCoverageBadge.title}
            >
              {latticeCoverageBadge.text}
            </span>
            <span
              className={cn("rounded px-2 py-1", perfProfileBadge.className)}
              title={perfProfileBadge.title}
            >
              {perfProfileBadge.text}
            </span>
            <span
              className={cn("rounded px-2 py-1", latticePathBadge.className)}
              title={latticePathBadge.title}
            >
              {latticePathBadge.text}
            </span>
            {latticeDowngradeBadge ? (
              <span
                className={cn("rounded px-2 py-1", latticeDowngradeBadge.className)}
                title={latticeDowngradeBadge.title}
              >
                {latticeDowngradeBadge.text}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded bg-slate-800/60 px-2 py-1">
            <label className="flex items-center gap-1 text-[0.7rem] font-medium text-slate-300">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={shaderMode === "safe"}
                onChange={(event) => setShaderMode(event.target.checked ? "safe" : "main")}
              />
              Safe shader
            </label>
            <label className="flex items-center gap-1 text-[0.7rem] font-medium text-slate-300">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={syncScheduler}
                onChange={(event) => setSyncScheduler(event.target.checked)}
              />
              Sync scheduler
            </label>
            <label className="flex items-center gap-1 text-[0.7rem] font-medium text-slate-300">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={centerPlane}
                onChange={(event) => setCenterPlane(event.target.checked)}
              />
              Center plane
            </label>
            <label className="flex items-center gap-1 text-[0.7rem] font-medium text-slate-300">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={lockBaseline}
                onChange={(event) => setLockBaseline(event.target.checked)}
              />
              Lock floor (ÃŽÂ¸Ã‚Â·Drive)
            </label>
            <label className="flex items-center gap-1 text-[0.7rem] font-medium text-slate-300">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={Math.abs((((ds.phase01*2)%2+2)%2) - 1) < 1e-3}
                onChange={(e) => {
                  if (typeof ds.setPhaseMode === "function") ds.setPhaseMode("manual");
                  if (typeof ds.setPhase === "function") ds.setPhase(e.target.checked ? 0.5 : 0);
                }}
              />
              Flip 180Ã‚Â°
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[0.65rem] text-slate-400">ÃÆ’<sub>sector</sub></span>
              <input
                type="range"
                min={0.25}
                max={8}
                step={0.25}
                value={ds.sigmaSectors}
                onChange={(event) => {
                  if (typeof ds.setSigma === "function") {
                    ds.setSigma(Number(event.target.value));
                  }
                }}
                className="w-24 accent-emerald-500"
              />
              <span className="font-mono text-[0.65rem] text-slate-300">{ds.sigmaSectors.toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[0.65rem] text-slate-400">phase</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ds.phase01}
                onChange={(event) => { /* disabled: no-op */ }}
                disabled
                aria-disabled="true"
                className="w-24 accent-emerald-500 opacity-60 cursor-not-allowed"
              />
              <span className="font-mono text-[0.65rem] text-slate-300">{(ds.phase01*360).toFixed(0)}Ã‚Â°</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[0.65rem] text-slate-400">floor</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={ds.sectorFloor}
                onChange={(event) => {
                  if (typeof ds.setFloor === "function") {
                    ds.setFloor(Number(event.target.value));
                  }
                }}
                className="w-20 accent-emerald-500"
              />
              <span className="font-mono text-[0.65rem] text-slate-300">{(ds.sectorFloor * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="ml-auto flex gap-1">
            <button
              title="Primary NHM2 shell geometry view: shift-shell-3p1"
              aria-label="Shift Shell, single-snapshot scientific rendering, shift-shell-3p1"
              onClick={() => {
                setPlanarVizMode(0);
                setUserVizLocked(true);
              }}
            >
              <span className="flex flex-col leading-tight">
                <span>Shift Shell</span>
                <span className="text-[0.6rem] text-slate-300">single-snapshot</span>
              </span>
            </button>
            <button
              title="Masked hull-configured scientific rendering: paper-rho"
              aria-label="Energy, masked hull-configured scientific rendering, paper-rho"
              onClick={() => {
                setPlanarVizMode(1);
                setUserVizLocked(true);
              }}
            >
              Energy / paper-rho
            </button>
            <button
              title="Drive-scaled theta slice"
              aria-label="Drive-scaled theta slice"
              onClick={() => {
                setPlanarVizMode(2);
                setUserVizLocked(true);
              }}
            >
              Drive
            </button>
            <button
              title="Single-snapshot York Slice scientific rendering: york-time-3p1"
              aria-label="York Slice, single-snapshot scientific rendering, york-time-3p1"
              onClick={() => {
                setPlanarVizMode(4);
                setUserVizLocked(true);
              }}
            >
              <span className="flex flex-col leading-tight">
                <span>York Slice</span>
                <span className="text-[0.6rem] text-slate-300">single-snapshot</span>
              </span>
            </button>
            <button
              title="Single-snapshot NHM2 York Shell Map scientific rendering: york-shell-map-3p1"
              aria-label="York Shell Map, single-snapshot scientific rendering, york-shell-map-3p1"
              onClick={() => {
                setPlanarVizMode(5);
                setUserVizLocked(true);
              }}
            >
              <span className="flex flex-col leading-tight">
                <span>York Shell Map</span>
                <span className="text-[0.6rem] text-slate-300">single-snapshot</span>
              </span>
            </button>
            <button
              title="Single-snapshot NHM2 York topology companion (normalized, non-raw): york-topology-normalized-3p1"
              aria-label="York Topology, single-snapshot normalized topology-only scientific rendering, york-topology-normalized-3p1"
              onClick={() => {
                setPlanarVizMode(6);
                setUserVizLocked(true);
              }}
            >
              <span className="flex flex-col leading-tight">
                <span>York Topology</span>
                <span className="text-[0.6rem] text-slate-300">normalized-only</span>
              </span>
            </button>
            <span
              className="rounded bg-slate-900 px-2 py-1 text-[0.62rem] leading-tight text-slate-400"
              title="York Sigma Family is a parameter-family export lane (not one simultaneous snapshot)"
            >
              York Sigma Family
              <span className="block text-[0.58rem] text-slate-500">parameter family</span>
            </span>
            <button
              title="World tube and hull shell view"
              aria-label="World tube and hull shell view"
              onClick={() => {
                setPlanarVizMode(3);
                setUserVizLocked(true);
              }}
              className={cn("px-2 py-1 rounded", planarVizMode === 3 ? "bg-amber-700 text-white" : "bg-slate-800")}
            >
              World tube
            </button>
          </div>
          {(planarVizMode === 0 || planarVizMode === 1) && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded bg-slate-800/40 px-3 py-2 text-[0.65rem] text-slate-200 sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showKHeatOverlay}
                  onChange={(event) => setShowKHeatOverlay(event.target.checked)}
                />
                <span>Curvature heatmap</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showThetaIsoOverlay}
                  onChange={(event) => setShowThetaIsoOverlay(event.target.checked)}
                />
                <span>theta isolines</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showFordRomanBar}
                  onChange={(event) => setShowFordRomanBar(event.target.checked)}
                />
                <span>Fordâ€“Roman bar</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showSectorArcOverlay}
                  onChange={(event) => setShowSectorArcOverlay(event.target.checked)}
                />
                <span>Worldline arc</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showTiltOverlay}
                  onChange={(event) => setShowTiltOverlay(event.target.checked)}
                />
                <span>Shift arrow</span>
              </label>
            </div>
          )}
          {planarVizMode === 3 && (
            <div className="mt-3 flex w-full flex-wrap items-center gap-3 rounded bg-slate-800/50 px-2 py-2">
              {/* Hull 3D debug tools */}
              <Hull3DDebugToggles
                surfaceOn={showHullSurfaceOverlay}
                setSurfaceOn={setShowHullSurfaceOverlay}
                gateSource={gateSource}
                setGateSource={setGateSource}
                gateViewEnabled={gateViewEnabled}
                setGateViewEnabled={setGateViewEnabled}
                forceFlatGate={forceFlatGate}
                setForceFlatGate={setForceFlatGate}
                onGatePreset={applyDriveCardPreset}
              />
              <div className="flex flex-col gap-2 rounded bg-slate-900/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.7rem] font-semibold text-slate-200">ÃŸ-gradient overlay</span>
                  <label className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-slate-400">
                    <span>Enable</span>
                    <input
                      type="checkbox"
                      checked={betaOverlayEnabled}
                      onChange={(event) => setBetaOverlayEnabled(event.target.checked)}
                      className="accent-emerald-500"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 text-[0.65rem] text-slate-300 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400 uppercase tracking-wide">ÃŸ target (m/sÂ²)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={20}
                      step={0.05}
                      value={betaTargetMs2}
                      onChange={(event) => setBetaTargetMs2(parseFloat(event.target.value))}
                      className="accent-emerald-500"
                    />
                    <span className="font-mono">{betaTargetMs2.toFixed(2)}</span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400 uppercase tracking-wide">Comfort limit (m/sÂ²)</span>
                    <input
                      type="range"
                      min={0.05}
                      max={10}
                      step={0.05}
                      value={betaComfortMs2}
                      onChange={(event) => setBetaComfortMs2(parseFloat(event.target.value))}
                      className="accent-emerald-500"
                    />
                    <span className="font-mono">{betaComfortMs2.toFixed(2)}</span>
                  </label>
                </div>
                <p className="text-[0.6rem] text-slate-400">
                  Hue encodes bow/stern sign, saturation tracks |?ÃŸ| against comfort, and value reflects ÃŸ vs target. White contours mark 0.05 g steps; a red band flags 0.4 g lateral gradients.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Wireframe</span>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={showWireframeOverlay}
                    onChange={(event) => setShowWireframeOverlay(event.target.checked)}
                  />
                  <span>Enable</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWireframeLod("preview")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    wireframeLod === "preview" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Coarse LOD; caps line width for speed"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setWireframeLod("high")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    wireframeLod === "high" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Higher detail wireframe (clamped thickness)"
                >
                  High
                </button>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={useFieldProbeOverlay}
                    disabled={!wireframeOverlay.overlay}
                    onChange={(event) => setUseFieldProbeOverlay(event.target.checked)}
                  />
                  <span>Field probe</span>
                </label>
                {useFieldProbeOverlay && fieldProbeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
                ) : null}
                {wireframeOverlay.overlay?.meshHash ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] text-emerald-100">
                    Mesh {wireframeOverlay.overlay.meshHash.slice(0, 8)}
                  </span>
                ) : null}
                {wireframeClampLabel ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[0.65rem] text-amber-100">
                    {wireframeClampLabel}
                  </span>
                ) : null}
                {useFieldProbeOverlay && fieldProbe?.stats ? (
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[0.65rem] text-sky-100">
                    |theta| max {fieldProbe.stats.absMax.toFixed(2)}
                  </span>
                ) : null}
                {!wireframeOverlay.overlay && showWireframeOverlay ? (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] text-slate-200">
                    Fallback: geometric rings
                  </span>
                ) : null}
                {wireframePatches.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {wireframePatches.map((patch) => (
                      <span
                        key={patch.sector}
                        className="rounded-full bg-emerald-500/10 px-2 py-1 text-[0.6rem] text-emerald-100"
                      >
                        S{patch.sector}: {patch.gateAvg.toFixed(2)} ({patch.gateMin.toFixed(2)}â€“{patch.gateMax.toFixed(2)})
                        {patch.blanketAvg !== undefined
                          ? ` â€¢ blanket ${patch.blanketAvg.toFixed(2)}`
                          : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Lattice</span>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={latticeModeEnabled}
                    disabled={!latticeModeEnabled && !!latticePreviewStatus}
                    onChange={(event) => setLatticeModeEnabled(event.target.checked)}
                  />
                  <span>Enable</span>
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={latticeRequireSdf}
                    disabled={!latticeRequireSdf && (!latticeModeEnabled || !!latticePreviewStatus)}
                    onChange={(event) => setLatticeRequireSdf(event.target.checked)}
                  />
                  <span>Require SDF</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowLatticeDiagnostics((prev) => !prev)}
                  className="rounded border border-slate-600 px-2 py-1 text-[0.65rem] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {showLatticeDiagnostics ? "Hide diag" : "Diag"}
                </button>
                {latticePreviewStatus ? (
                  <span
                    className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] text-slate-200"
                    title={latticePreviewStatus.hint}
                  >
                    {latticePreviewStatus.label}
                  </span>
                ) : null}
                {latticeModeEnabled && latticeVolumeStats?.hashShort ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] text-emerald-100">
                    Vol {latticeVolumeStats.hashShort}
                  </span>
                ) : null}
                {latticeModeEnabled && sharedLatticeState?.sdf?.key ? (
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[0.65rem] text-sky-100">
                    SDF {sharedLatticeState.sdf.key.slice(0, 8)}
                  </span>
                ) : null}
                {latticeModeEnabled && latticeGuardrails.messages.length
                  ? latticeGuardrails.messages.map((msg) => (
                      <span
                        key={msg.label}
                        title={(() => {
                          if (msg.label === "Stale hash" || msg.label === "Weights pending") {
                            const desired = latticeGuardrails.desiredWeightHash ?? "n/a";
                            const built = latticeGuardrails.builtWeightHash ?? "n/a";
                            return `want ${desired} vs built ${built}`;
                          }
                          if (msg.label.startsWith("Missing SDF")) {
                            return latticeRequireSdf
                              ? "Hull SDF required before enabling lattice sampling."
                              : "Hull SDF not ready; analytic shell blend disabled.";
                          }
                          if (msg.label === "Over budget") {
                            const reasons = sharedLatticeState?.volume?.clampReasons?.join(", ");
                            return reasons ? `volume clamp: ${reasons}` : "Voxel sample budget exceeded.";
                          }
                          return msg.label;
                        })()}
                        className={cn(
                          "rounded-full px-2 py-1 text-[0.65rem]",
                          msg.level === "error"
                            ? "bg-red-500/10 text-red-100"
                            : "bg-amber-500/10 text-amber-100",
                        )}
                      >
                        {msg.label}
                      </span>
                    ))
                  : null}
                {latticeModeEnabled &&
                latticeFallbackStatus &&
                latticeFallbackStatus.reason !== "disabled" &&
                latticeFallbackStatus.reason !== "preview-required" &&
                latticeFallbackStatus.reason !== "preview-missing" ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[0.65rem]",
                      latticeFallbackStatus.level === "error"
                        ? "bg-red-500/10 text-red-100"
                        : latticeFallbackStatus.level === "warn"
                          ? "bg-amber-500/10 text-amber-100"
                          : "bg-slate-800 px-2 py-1 text-slate-200",
                    )}
                    title={[
                      latticeFallbackStatus.reason,
                      latticeFallbackStatus.hint,
                      latticeFallbackStatus.detail ? `detail: ${latticeFallbackStatus.detail}` : null,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  >
                    {latticeFallbackStatus.label}
                  </span>
                ) : null}
                {latticeModeEnabled && !latticeFallbackStatus && latticeGpuStatus?.runtime?.hasLatticeVolume ? (
                  <span
                    className="rounded-full bg-sky-500/10 px-2 py-1 text-[0.65rem] text-sky-100"
                    title={`GPU path: ${latticeGpuStatus.runtime.formatLabel ?? latticeGpuStatus.runtime.backend ?? "lattice"}${
                      latticeGpuStatus.runtime.useAtlas ? " (atlas)" : ""
                    }${
                      latticeGpuStatus.runtime.formatReason
                        ? ` | ${latticeGpuStatus.runtime.formatReason}`
                        : (latticeGpuStatus.runtime as any)?.telemetry?.downgradeReason
                          ? ` | ${(latticeGpuStatus.runtime as any).telemetry.downgradeReason}`
                          : ""
                    }`}
                  >
                      GPU {latticeGpuStatus.runtime.formatLabel ?? "lattice"}
                  </span>
                ) : null}
                {latticeModeEnabled && latticeRetryable ? (
                  <button
                    type="button"
                    onClick={handleRetryLattice}
                    disabled={latticeRebuildPending}
                    className={cn(
                      "rounded border px-2 py-1 text-[0.65rem]",
                      latticeRebuildPending
                        ? "cursor-not-allowed border-slate-700 text-slate-400"
                        : "border-emerald-500/60 text-emerald-100 hover:border-emerald-300 hover:text-emerald-50",
                    )}
                    title="Retry lattice rebuild/upload with current profile"
                  >
                    Retry lattice
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Voxel overlays</span>
                <label
                  className="flex items-center gap-1 text-[0.65rem] text-slate-200"
                  title={overlayControlsDisabled ? overlayLockedReason ?? undefined : undefined}
                >
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={voxelSlicesEnabled}
                    disabled={overlayControlsDisabled}
                    onChange={(event) => handleSliceToggle(event.target.checked)}
                  />
                  <span>Slices</span>
                </label>
                <select
                  value={voxelSliceAxis}
                  onChange={(event) => handleSliceAxisChange(event.target.value as HullVoxelSliceAxis)}
                  disabled={sliceControlsDisabled}
                  className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                >
                  <option value="x">Axis X</option>
                  <option value="y">Axis Y</option>
                  <option value="z">Axis Z</option>
                </select>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Min</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voxelSliceMin.toFixed(2)}
                    disabled={sliceControlsDisabled}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      applySliceBounds(Number.isFinite(next) ? next : voxelSliceMin, voxelSliceMax);
                    }}
                    className="w-16 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Max</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voxelSliceMax.toFixed(2)}
                    disabled={sliceControlsDisabled}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      applySliceBounds(voxelSliceMin, Number.isFinite(next) ? next : voxelSliceMax);
                    }}
                    className="w-16 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={coverageHeatmapEnabled}
                    disabled={overlayControlsDisabled}
                    onChange={(event) => handleHeatmapToggle(event.target.checked)}
                  />
                  <span>Coverage heatmap</span>
                </label>
                {overlayLockedReason ? (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] text-slate-200">
                    {overlayLockedReason}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Momentum flow</span>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={showFluxStreamlines}
                    onChange={(event) => setShowFluxStreamlines(event.target.checked)}
                  />
                  <span>Streamlines</span>
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Seeds</span>
                  <input
                    type="number"
                    min={8}
                    max={256}
                    step={4}
                    value={fluxSeedCount}
                    disabled={!showFluxStreamlines}
                    onChange={(event) => {
                      const next = parseInt(event.target.value, 10);
                      setFluxSeedCount(Number.isFinite(next) ? Math.max(8, Math.min(256, next)) : fluxSeedCount);
                    }}
                    className="w-16 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Shell r</span>
                  <input
                    type="number"
                    min={0.2}
                    max={1.5}
                    step={0.05}
                    value={fluxSeedRadius.toFixed(2)}
                    disabled={!showFluxStreamlines}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      const clamped = Number.isFinite(next) ? Math.max(0.2, Math.min(1.5, next)) : fluxSeedRadius;
                      setFluxSeedRadius(clamped);
                    }}
                    className="w-16 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                    title="Seed radius in r/R units (1.0 hugs the wall)."
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Spread</span>
                  <input
                    type="number"
                    min={0}
                    max={0.4}
                    step={0.02}
                    value={fluxSeedSpread.toFixed(2)}
                    disabled={!showFluxStreamlines}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      const clamped = Number.isFinite(next) ? Math.max(0, Math.min(0.4, next)) : fluxSeedSpread;
                      setFluxSeedSpread(clamped);
                    }}
                    className="w-16 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100 disabled:opacity-50"
                    title="Shell thickness for random seed jitter."
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Spacetime grid</span>
                <span className="text-[0.6rem] uppercase tracking-wide text-slate-500">Presets</span>
                <div className="flex flex-wrap items-center gap-1">
                  {SPACETIME_GRID_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applySpacetimeGridPreset(preset)}
                      title={preset.hint}
                      className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-[0.6rem] text-slate-200 hover:border-slate-500/70 hover:bg-slate-800"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={spacetimeGridEnabled}
                    onChange={(event) => handleSpacetimeGridToggle(event.target.checked)}
                  />
                  <span>Enabled</span>
                </label>
                <select
                  value={spacetimeGridMode}
                  onChange={(event) =>
                    handleSpacetimeGridModeChange(event.target.value as HullSpacetimeGridMode)
                  }
                  className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                >
                  <option value="slice">Slice</option>
                  <option value="surface">Surface</option>
                  <option value="volume">Volume</option>
                </select>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Spacing (m)</span>
                  <input
                    type="number"
                    min={0.05}
                    max={5}
                    step={0.05}
                    value={spacetimeGridSpacing.toFixed(2)}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      handleSpacetimeGridSpacingChange(Number.isFinite(next) ? next : spacetimeGridSpacing);
                    }}
                    className="w-20 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Warp</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.05}
                    value={spacetimeGridWarpStrength.toFixed(2)}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      handleSpacetimeGridWarpStrengthChange(
                        Number.isFinite(next) ? next : spacetimeGridWarpStrength
                      );
                    }}
                    className="w-20 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Falloff (m)</span>
                  <input
                    type="number"
                    min={0.05}
                    max={6}
                    step={0.05}
                    value={spacetimeGridFalloff.toFixed(2)}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      handleSpacetimeGridFalloffChange(Number.isFinite(next) ? next : spacetimeGridFalloff);
                    }}
                    className="w-20 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                  />
                </label>
                <select
                  value={spacetimeGridColorBy}
                  onChange={(event) =>
                    handleSpacetimeGridColorByChange(event.target.value as HullSpacetimeGridColorBy)
                  }
                  className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                >
                  <option value="thetaSign">Color by theta sign</option>
                  <option value="thetaMagnitude">Color by |theta|</option>
                  <option value="warpStrength">Color by warp strength</option>
                </select>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={spacetimeGridUseSdf}
                    onChange={(event) => handleSpacetimeGridUseSdfChange(event.target.checked)}
                    title="Prefer lattice SDF for offsets; falls back to analytic distance when missing."
                  />
                  <span>Use SDF</span>
                </label>
                <select
                  value={spacetimeGridStrengthMode}
                  onChange={(event) =>
                    handleSpacetimeGridStrengthModeChange(
                      event.target.value as HullSpacetimeGridStrengthMode
                    )
                  }
                  className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                  title="Manual uses entered warp; auto scales to theta peaks or expected scale."
                >
                  <option value="manual">Manual</option>
                  <option value="autoThetaPk">Auto theta peak</option>
                  <option value="autoThetaScaleExpected">Auto theta expected</option>
                </select>
                {spacetimeGridBadges.length
                  ? spacetimeGridBadges.map((badge) => (
                      <span
                        key={badge.label}
                        title={badge.title}
                        className={cn(
                          "rounded-full px-2 py-1 text-[0.65rem]",
                          badge.level === "warn"
                            ? "bg-amber-500/10 text-amber-100"
                            : "bg-slate-800 text-slate-200",
                        )}
                      >
                        {badge.label}
                      </span>
                    ))
                  : null}
              </div>
              {showLatticeDiagnostics && (
                <div className="w-full rounded bg-slate-900/60 px-3 py-2 text-[0.65rem] text-slate-200">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1 font-mono sm:grid-cols-2">
                    <span>mode</span>
                    <span>{latticeModeEnabled ? "enabled" : "off"}</span>
                    <span>profile</span>
                    <span>{sharedLatticeState?.profileTag ?? "preview"}</span>
                    <span>preset</span>
                    <span>{sharedLatticeState?.preset ?? "auto"}</span>
                    <span>frame</span>
                    <span>
                      {latticeFrameStats
                        ? `${latticeFrameStats.dims.join("x")} @ ${latticeFrameStats.voxelSize_m.toFixed(3)} m`
                        : "â€”"}
                    </span>
                    <span>voxels</span>
                    <span>
                      {latticeFrameStats
                        ? `${latticeFrameStats.voxelCount.toLocaleString()}${
                            latticeFrameStats.budgetMaxVoxels
                              ? ` / ${latticeFrameStats.budgetMaxVoxels.toLocaleString()}`
                              : ""
                          }${latticeFrameStats.budgetPct != null ? ` (${latticeFrameStats.budgetPct.toFixed(1)}%)` : ""}`
                        : "â€”"}
                    </span>
                    <span>frame clamp</span>
                    <span>
                      {latticeFrameStats?.clampReasons?.length ? latticeFrameStats.clampReasons.join(", ") : "â€”"}
                    </span>
                    <span>volume</span>
                    <span>{latticeVolumeStats ? latticeVolumeStats.label : "â€”"}</span>
                    <span>volume clamp</span>
                    <span>
                      {sharedLatticeState?.volume?.clampReasons?.length
                        ? sharedLatticeState.volume.clampReasons.join(", ")
                        : "â€”"}
                    </span>
                    <span>upload bytes</span>
                    <span>
                      {latticeUploadTelemetry
                        ? `${(latticeUploadTelemetry.bytes / (1024 * 1024)).toFixed(1)} MB / ${(
                            latticeUploadTelemetry.budgetBytes / (1024 * 1024)
                          ).toFixed(0)} MB`
                        : "â€”"}
                    </span>
                    <span>watchdog</span>
                    <span>{`${latticeWatchdogStats.blocked} block${latticeWatchdogStats.blocked === 1 ? "" : "s"}`}</span>
                    <span>sdf</span>
                    <span>{latticeSdfStats ? latticeSdfStats.label : "â€”"}</span>
                    <span>sdf clamp</span>
                    <span>
                      {sharedLatticeState?.sdf?.clampReasons?.length ? sharedLatticeState.sdf.clampReasons.join(", ") : "â€”"}
                    </span>
                    <span>strobe</span>
                    <span>
                      {sharedLatticeState?.strobe?.hash ? sharedLatticeState.strobe.hash.slice(0, 16) : "â€”"}
                    </span>
                    <span>weights hash</span>
                    <span>
                      {sharedLatticeState?.strobe?.weightHash ? sharedLatticeState.strobe.weightHash : "â€”"}
                    </span>
                    <span>volume hash</span>
                    <span>{sharedLatticeState?.volume?.hash ? sharedLatticeState.volume.hash.slice(0, 16) : "â€”"}</span>
                    <span>volume det</span>
                    <span>{latticeVolumeDeterminismHash ?? "â€”"}</span>
                    <span>sdf det</span>
                    <span>{latticeSdfDeterminismHash ?? "â€”"}</span>
                    <span>fallback</span>
                    <span>{latticeFallbackStatus?.reason ?? "ok"}</span>
                    <span>path</span>
                    <span>
                      {latticeGpuStatus?.runtime
                        ? latticeGpuStatus.runtime.hasLatticeVolume
                          ? `lattice ${latticeGpuStatus.runtime.formatLabel ?? latticeGpuStatus.runtime.backend ?? ""}${
                              latticeGpuStatus.runtime.useAtlas ? " (atlas)" : ""
                            }`
                          : "analytic"
                        : "â€”"}
                    </span>
                    <span>gl caps</span>
                    <span>
                      {latticeGpuStatus?.caps
                        ? `3D ${latticeGpuStatus.caps.max3DTextureSize} | 2D ${latticeGpuStatus.caps.maxTextureSize} | f32lin ${
                            latticeGpuStatus.caps.supportsFloatLinear ? "y" : "n"
                          } | f16lin ${latticeGpuStatus.caps.supportsHalfFloatLinear ? "y" : "n"}`
                        : "â€”"}
                    </span>
                    <span>gpu reason</span>
                    <span>
                      {latticeGpuStatus?.volumeFailedReason || latticeGpuStatus?.sdfFailedReason
                        ? `${latticeGpuStatus.volumeFailedReason ?? ""}${
                            latticeGpuStatus.sdfFailedReason ? ` / ${latticeGpuStatus.sdfFailedReason}` : ""
                          }`
                        : latticeGpuStatus?.runtime?.formatReason ||
                            ((latticeGpuStatus as any)?.runtime?.telemetry?.downgradeReason ?? "â€”")}
                    </span>
                    <span>gpu</span>
                    <span>
                      {latticeGpuStatus
                        ? `${latticeGpuStatus.volumeFailed ? "VOL fail" : latticeGpuStatus.volumeReady ? "VOL ok" : "VOL pending"}${
                            latticeRequireSdf
                              ? ` / ${latticeGpuStatus.sdfFailed ? "SDF fail" : latticeGpuStatus.sdfReady ? "SDF ok" : "SDF pending"}`
                              : ""
                          }`
                        : "â€”"}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Presets</span>
                <button
                  type="button"
                  onClick={applyGeoVisThetaPreset}
                  className="rounded bg-slate-700 px-2 py-1 text-[0.65rem] text-slate-100 hover:bg-slate-600"
                  title="GeoViS theta: theta_GR volume, diverging palette, theta-iso overlay, theta sign -1"
                >
                  GeoViS ${GREEK_THETA}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">${GREEK_THETA} sign</span>
                <button
                  type="button"
                  onClick={() => setThetaSign(1)}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    thetaSign === 1 ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Positive theta sign (default convention)"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setThetaSign(-1)}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    thetaSign === -1 ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Flip theta sign (GeoViS parity)"
                >
                  -1
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Volume source</span>
                <input
                  ref={wfbrickInputRef}
                  type="file"
                  accept=".wfbrick,application/json"
                  className="hidden"
                  onChange={handleWfbrickInputChange}
                />
                <button
                  type="button"
                  onClick={() => setVolumeSource("analytic")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    volumeSource === "analytic" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Analytic volume (ellipsoid)"
                >
                  Analytic
                </button>
                <button
                  type="button"
                  onClick={() => setVolumeSource("lattice")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    volumeSource === "lattice" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Lattice voxel volume (gate + drive)"
                >
                  Lattice
                </button>
                <button
                  type="button"
                  onClick={() => setVolumeSource("brick")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    volumeSource === "brick" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Stress-energy brick (T00)"
                >
                  Brick
                </button>
                <button
                  type="button"
                  onClick={openWfbrickPicker}
                  className="rounded bg-slate-700 px-2 py-1 text-[0.65rem] text-slate-100 hover:bg-slate-600"
                  title="Load a WarpFactory wfbrick dataset"
                >
                  Load dataset
                </button>
              </div>
              {(wfbrickStatus || wfbrickError) && (
                <div className="flex flex-wrap items-center gap-2 text-[0.6rem] text-slate-400">
                  {wfbrickStatus && (
                    <span>
                      Dataset: {wfbrickStatus.name} ({wfbrickStatus.dims.join("x")})
                    </span>
                  )}
                  {wfbrickStatus && !wfbrickStatus.hasFlux && (
                    <span className="text-amber-300">Flux missing, streamlines disabled</span>
                  )}
                  {wfbrickError && <span className="text-amber-300">{wfbrickError}</span>}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Volume field</span>
                <VolumeModeToggle value={liveVolumeMode} onChange={handleVolumeModeChange} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Domain</span>
                <button
                  type="button"
                  onClick={() => setHullVolumeDomain("wallBand")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullVolumeDomain === "wallBand" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Current wall band transfer function with adaptive step near the shell"
                >
                  Wall band
                </button>
                <button
                  type="button"
                  onClick={() => setHullVolumeDomain("bubbleBox")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullVolumeDomain === "bubbleBox" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Full bubble box using analytic theta_drive with OBB padding"
                >
                  Bubble box
                </button>
                {hullVolumeDomain === "bubbleBox" && (
                  <>
                    <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                      <span>Bounds</span>
                      <select
                        value={bubbleBoundsMode}
                        onChange={(event) => setBubbleBoundsMode(event.target.value as "tight" | "wide")}
                        className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                      >
                        <option value="tight">Tight OBB</option>
                        <option value="wide">Wide OBB</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0.08}
                        max={1.0}
                        step={0.01}
                        value={bubbleOpacityHi}
                        onChange={(event) => setBubbleOpacityHi(Number(event.target.value))}
                        className="w-28 accent-amber-500"
                      />
                      <span className="font-mono text-[0.65rem] text-slate-300">
                        [{bubbleOpacityWindow[0].toFixed(2)}â€¦{bubbleOpacityWindow[1].toFixed(2)}]
                      </span>
                    </label>
                    <span className="text-[0.6rem] text-slate-400">
                      Slices stay available as a bailout if volume perf dips.
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[0.65rem] uppercase tracking-wide text-slate-400"
                  title="Applies to the live viewer and card exports"
                >
                  Camera
                </span>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("threeQuarterFront")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "threeQuarterFront" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Three-quarter front orbit anchored to the hull OBB (card default)"
                >
                  3/4 front
                </button>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("broadside")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "broadside" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Profile view aligned to the hull right axis"
                >
                  Broadside
                </button>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("topDown")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "topDown" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Top-down orbit over the hull OBB"
                >
                  Top-down
                </button>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("inside")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "inside" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Interior orbit from inside the bubble"
                >
                  Inside
                </button>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("outside")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "outside" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Pull back to show the full exterior hull"
                >
                  Outside
                </button>
                <button
                  type="button"
                  onClick={() => setCardCameraPreset("wallGrazing")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    cardCameraPreset === "wallGrazing" ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-200"
                  )}
                  title="Near-wall orbit to graze the shell"
                >
                  Wall graze
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Geometry</span>
                <select
                  className="rounded bg-slate-900 px-2 py-1 text-[0.7rem] text-slate-100"
                  value={hullGeometry}
                  onChange={(e) => handleHullGeometryChange(e.target.value as HullGeometryMode)}
                  title="Switch between analytic ellipsoid, radial LUT, or uploaded SDF."
                >
                  <option value="ellipsoid">Ellipsoid</option>
                  <option value="radial">Hull (radial)</option>
                  <option value="sdf">Hull (SDF)</option>
                </select>
                {autoHullGeometryReason ? (
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-[0.65rem] text-emerald-100">
                    {autoHullGeometryReason}
                  </span>
                ) : null}
                {!hullRadiusLUT && hullGeometry === "radial" && (
                  <span className="text-[0.6rem] text-amber-300">No hull LUT found â€” falling back to ellipsoid</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Mode</span>
                <button
                  type="button"
                  onClick={() => handleHullBlendChange(0)}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullMode === "instant" ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-200"
                  )}
                >
                  Instant
                </button>
                <button
                  type="button"
                  onClick={() => handleHullBlendChange(1)}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullMode === "average" ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-200"
                  )}
                >
                  Average
                </button>
                <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                  <span>Blend</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number.isFinite(hullBlend) ? hullBlend : 0}
                    onChange={(event) => handleHullBlendChange(Number(event.target.value))}
                    className="w-28 accent-amber-500"
                  />
                  <span className="font-mono text-[0.65rem] text-slate-300">{Math.round(hullBlend * 100)}%</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Background</span>
                <button
                  type="button"
                  onClick={() => setSkyboxMode("off")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    skyboxMode === "off" ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-slate-300"
                  )}
                  title="Disable the geodesic skybox background"
                >
                  Off
                </button>
                <button
                  type="button"
                  onClick={() => setSkyboxMode("flat")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    skyboxMode === "flat" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
                  )}
                  title="Show the environment map without lensing (Minkowski baseline)"
                >
                  Flat
                </button>
                <button
                  type="button"
                  onClick={() => setSkyboxMode("geodesic")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    skyboxMode === "geodesic" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
                  )}
                  title="Integrate null geodesics against the current metric"
                >
                  Geodesic
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Renderer</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!allowUnsafeRendererBackends) {
                      setHullDiagMsg(
                        "Safe mode is active: WebGL/WebGPU renderers are disabled. Set localStorage key alcubierre.hull.allowUnsafeAutostart=1 to unlock.",
                      );
                      setGlError("Renderer halted for safety: local GPU renderer disabled in safe mode.");
                      return;
                    }
                    setHullRendererBackend("webgl");
                  }}
                  disabled={!allowUnsafeRendererBackends}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    !allowUnsafeRendererBackends
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed"
                      : hullRendererBackend === "webgl"
                        ? "bg-emerald-700 text-white"
                        : "bg-slate-800 text-slate-300"
                  )}
                  title={
                    allowUnsafeRendererBackends
                      ? "Stable WebGL renderer (can still hard-hang some browser/GPU combinations)"
                      : "Disabled by safe mode"
                  }
                >
                  WebGL stable
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!allowUnsafeRendererBackends) {
                      setHullDiagMsg(
                        "Safe mode is active: WebGL/WebGPU renderers are disabled. Set localStorage key alcubierre.hull.allowUnsafeAutostart=1 to unlock.",
                      );
                      setGlError("Renderer halted for safety: local GPU renderer disabled in safe mode.");
                      return;
                    }
                    setHullRendererBackend("webgpu");
                  }}
                  disabled={!allowUnsafeRendererBackends}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    !allowUnsafeRendererBackends
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed"
                      : hullRendererBackend === "webgpu"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-800 text-slate-300"
                  )}
                  title={
                    allowUnsafeRendererBackends
                      ? "Experimental WebGPU path tracer (can hard-hang unstable drivers)"
                      : "Disabled by safe mode"
                  }
                >
                  WebGPU exp
                </button>
                <button
                  type="button"
                  onClick={() => setHullRendererBackend("mis-service")}
                  className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullRendererBackend === "mis-service"
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-300"
                  )}
                  title="Scientific default: external MIS renderer service (strict remote proxy, no local deterministic fallback)"
                >
                  MIS service
                </button>
                {!allowUnsafeRendererBackends && (
                  <span className="text-[0.6rem] text-amber-300/90">
                    Safe mode lock
                  </span>
                )}
              </div>
              <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                <span>Exposure</span>
                <input
                  title="Multiply volumetric density (0.01Ã—..100Ã—). Useful to quickly brighten the Hull 3D volume for debugging."
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={hullExposure01}
                  onChange={(e)=> setHullExposure01(Number(e.target.value))}
                  className="w-28 accent-amber-500"
                />
                <span className="font-mono text-[0.65rem] text-slate-300">{(() => {
                  const x = Math.max(0, Math.min(1, hullExposure01));
                  const mult = Math.pow(10, 4 * (x - 0.5));
                  const label = mult >= 1 ? `Ã—${mult.toFixed(mult >= 10 ? 0 : 1)}` : `Ã—${mult.toFixed(mult >= 0.1 ? 2 : 3)}`;
                  return label;
                })()}</span>
              </label>
              <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={showHullSectorRing}
                  onChange={(event) => setShowHullSectorRing(event.target.checked)}
                />
                Sector ring
              </label>
              <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={followHullPhase}
                  onChange={(event) => setFollowHullPhase(event.target.checked)}
                />
                Follow phase
              </label>
              <FlightDirectorStatusRow />
              <label className="flex items-center gap-1 text-[0.65rem] text-slate-200">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={vizIntentEnabled}
                  onChange={(event) => setVizIntentEnabled(event.target.checked)}
                />
                Show off-axis intent
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Run Hull 3D self-test"
                  onClick={() => {
                    try {
                      const r = hullRendererRef.current?.runHull3DHealthCheck?.();
                      if (!r) {
                        setHullHealth(null);
                        return;
                      }
                      let pass = 0, fail = 0;
                      for (const k of Object.keys(r)) {
                        if (r[k]?.pass) pass++; else fail++;
                      }
                      setHullHealth({ pass, fail, results: r as any });
                    } catch (e) {
                      console.warn('[AlcubierrePanel] Hull3D health check failed:', e);
                      setHullHealth(null);
                    }
                  }}
                  className="rounded bg-slate-700 px-2 py-1 text-[0.65rem] text-slate-100 hover:bg-slate-600"
                >
                  Self-test
                </button>
                {hullHealth && (
                  <span className={cn(
                    "rounded px-2 py-1 text-[0.65rem]",
                    hullHealth.fail > 0 ? "bg-amber-800/70 text-amber-100" : "bg-emerald-800/70 text-emerald-100"
                  )}>
                    {hullHealth.pass} pass Â· {hullHealth.fail} fail
                  </span>
                )}
                {latticeModeEnabled && latticeFrameStats && (
                  <span className="rounded bg-slate-800/70 px-2 py-1 text-[0.65rem] text-slate-200">
                    Lattice {latticeFrameStats.dims.join("x")} AÃº {latticeFrameStats.voxelSize_m.toFixed(3)} m
                  </span>
                )}
                {latticeModeEnabled && latticeVolumeStats && (
                  <span className="rounded bg-slate-800/70 px-2 py-1 text-[0.65rem] text-slate-200">
                    {latticeVolumeStats.label}
                  </span>
                )}
                {latticeModeEnabled && latticeSdfStats && (
                  <span className="rounded bg-slate-800/70 px-2 py-1 text-[0.65rem] text-slate-200">
                    {latticeSdfStats.label}
                  </span>
                )}
                {hullDiagMsg && (
                  <span className="rounded bg-amber-900/60 px-2 py-1 text-[0.65rem] text-amber-200">
                    {hullDiagMsg}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">Quality</span>
                <select
                  value={hullQuality}
                  onChange={(event) => setHullQuality(event.target.value as Hull3DQualityPreset)}
                  className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                >
                  <option value="auto">Auto</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="button"
                  onClick={() => setHullQualityAdvanced((prev) => !prev)}
                  className="rounded border border-slate-600 px-2 py-1 text-[0.65rem] text-slate-200 hover:border-amber-400 hover:text-amber-200"
                >
                  {hullQualityAdvanced ? "Hide advanced" : "Advanced"}
                </button>
              </div>
              {hullQualityAdvanced && (
                <div className="flex w-full flex-wrap items-center gap-3 text-[0.65rem] text-slate-200">
                  <label className="flex items-center gap-1">
                    <span>Voxel density</span>
                    <select
                      value={hullVoxelDensity}
                      onChange={(event) => setHullVoxelDensity(event.target.value as "low" | "medium" | "high")}
                      className="rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    <span>Ray steps max</span>
                    <input
                      type="number"
                      min={16}
                      step={4}
                      value={hullRayStepsMax ?? ""}
                      placeholder="auto"
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw.length) {
                          setHullRayStepsMax(null);
                          return;
                        }
                        const next = Number(raw);
                        setHullRayStepsMax(Number.isFinite(next) && next > 0 ? next : null);
                      }}
                      className="w-20 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span>Step bias</span>
                    <input
                      type="number"
                      step={0.01}
                      value={hullStepBias ?? ""}
                      placeholder="auto"
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw.length) {
                          setHullStepBias(null);
                          return;
                        }
                        const next = Number(raw);
                        setHullStepBias(Number.isFinite(next) ? next : null);
                      }}
                      className="w-20 rounded bg-slate-900 px-2 py-1 text-[0.65rem] text-slate-100"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          </div>
        </TooltipProvider>

        {/* Viewer fills the remaining fixed-height space and remains stable */}
        <div className="relative w-full flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-800 bg-black/70">
          <canvas ref={canvasRef} className="w-full h-full block" />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0"
            style={{
              opacity: overlayCanvasVisible ? 1 : 0,
              pointerEvents: overlayHudEnabled ? "auto" : "none",
            }}
          />
          <div
            ref={overlayDomRef}
            className="absolute inset-0"
            style={{
              pointerEvents: overlayHudEnabled ? "auto" : "none",
              userSelect: overlayHudEnabled ? "text" : "none",
            }}
            aria-hidden="true"
          />
          <MetricFrameLens
            className="absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] sm:left-3 sm:top-3"
            thetaExpected={theta_expected}
            thetaPeak={theta_peak}
            thetaTail={thetaPk}
            beta={beta}
            sigma={sigma}
            R={R}
            warpFieldType={warpFieldType}
            solveOrder={solveOrderSnapshot}
            lightCrossText={lightCrossSummary.text}
            lightCrossTitle={lightCrossSummary.title}
            hullText={hullSummary.text}
            hullTitle={hullSummary.title}
            driveText={driveChainSummary.text}
            driveTitle={driveChainSummary.title}
            activeMode={planarVizMode as 0 | 1 | 2 | 3}
            onSelectMode={(mode) => {
              setPlanarVizMode(mode);
              setUserVizLocked(true);
            }}
          />
          {latticeModeEnabled ? (
            <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1 text-[0.65rem]">
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn("rounded px-2 py-1 shadow-md shadow-black/40", latticePathBadge.className)}
                  title={latticePathBadge.title}
                >
                  {latticePathBadge.text}
                </span>
                {latticeDowngradeBadge ? (
                  <span
                    className={cn("rounded px-2 py-1 shadow-md shadow-black/40", latticeDowngradeBadge.className)}
                    title={latticeDowngradeBadge.title}
                  >
                    {latticeDowngradeBadge.text}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn("rounded px-2 py-1 shadow-md shadow-black/40", latticeCoverageBadge.className)}
                  title={latticeCoverageBadge.title}
                >
                  {latticeCoverageBadge.text}
                </span>
                {latticeFallbackStatus && latticeFallbackStatus.reason !== "disabled" ? (
                  <span
                    className={cn(
                      "rounded px-2 py-1 shadow-md shadow-black/40",
                      latticeFallbackStatus.level === "error"
                        ? "bg-red-500/80 text-red-50"
                        : latticeFallbackStatus.level === "warn"
                          ? "bg-amber-500/80 text-amber-50"
                          : "bg-slate-800/80 text-slate-100",
                    )}
                    title={[latticeFallbackStatus.reason, latticeFallbackStatus.hint, latticeFallbackStatus.detail]
                      .filter(Boolean)
                      .join(" | ")}
                  >
                    {latticeFallbackStatus.label}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {scientificAtlasState ? (
            <div className="pointer-events-none absolute right-2 bottom-2 z-20 max-w-[min(32rem,calc(100%-1rem))] rounded border border-slate-600/80 bg-slate-950/80 px-2 py-2 text-[0.62rem] text-slate-100 shadow-md shadow-black/40">
              <div className="font-semibold uppercase tracking-wide text-cyan-200">
                NHM2 Full Atlas (single snapshot)
              </div>
              <div className="mt-1 text-slate-300">
                metric {String(scientificAtlasState.metric_ref_hash ?? "none").slice(0, 16)} | cert {String(
                  scientificAtlasState.certificate_hash ?? "none",
                ).slice(0, 16)} | chart {scientificAtlasState.chart ?? "unknown"} | observer{" "}
                {scientificAtlasState.observer ?? "unknown"} | units {scientificAtlasState.unit_system ?? "unknown"}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {SCIENTIFIC_ATLAS_PANE_ORDER.map((paneId) => {
                  const status = scientificAtlasState.pane_status[paneId] ?? "missing";
                  const className =
                    status === "ok"
                      ? "bg-emerald-700/60 text-emerald-100 border-emerald-300/50"
                      : status === "missing"
                        ? "bg-red-700/60 text-red-100 border-red-300/50"
                        : "bg-amber-700/60 text-amber-100 border-amber-300/50";
                  return (
                    <span
                      key={`atlas-pane-${paneId}`}
                      className={cn("rounded border px-1.5 py-0.5 uppercase tracking-wide", className)}
                      title={`pane=${paneId} status=${status}`}
                    >
                      {paneId}:{status}
                    </span>
                  );
                })}
              </div>
              {scientificAtlasPaneFailure ? (
                <div className="mt-1 rounded border border-red-400/60 bg-red-950/70 px-1.5 py-1 text-red-100">
                  Atlas pane mismatch: {scientificAtlasPaneFailure}. Strict mode should fail closed for this frame.
                </div>
              ) : null}
            </div>
          ) : null}
          {scientificCertificateState && !scientificAtlasState ? (
            <div className="pointer-events-none absolute right-2 bottom-2 z-20 max-w-[min(32rem,calc(100%-1rem))] rounded border border-cyan-600/70 bg-slate-950/80 px-2 py-2 text-[0.62rem] text-slate-100 shadow-md shadow-black/40">
              <div className="font-semibold uppercase tracking-wide text-cyan-200">
                Scientific Frame Certificate
              </div>
              <div className="mt-1 text-slate-300">
                view {scientificCertificateState.render?.view ?? "unknown"} | field{" "}
                {scientificCertificateState.render?.field_key ?? "n/a"} | plane{" "}
                {scientificCertificateState.render?.slice_plane ?? "n/a"}
              </div>
              <div className="mt-1 text-slate-300">
                metric {String(scientificSnapshotIdentity?.metric_ref_hash ?? "none").slice(0, 16)} | cert{" "}
                {String(scientificCertificateState.certificate_hash ?? "none").slice(0, 16)} | chart{" "}
                {scientificSnapshotIdentity?.chart ?? "unknown"} | observer{" "}
                {scientificSnapshotIdentity?.observer ?? "unknown"}
              </div>
              <div className="mt-1 text-slate-400">
                theta {scientificSnapshotIdentity?.theta_definition ?? "unknown"} | K sign{" "}
                {scientificSnapshotIdentity?.kij_sign_convention ?? "unknown"} | units{" "}
                {scientificSnapshotIdentity?.unit_system ?? "unknown"} | t{" "}
                {scientificSnapshotIdentity?.timestamp_ms ?? "none"}
              </div>
              <YorkAuditBox
                certificate={scientificCertificateState}
                metricRefHashFallback={scientificSnapshotIdentity?.metric_ref_hash ?? null}
                timestampMsFallback={scientificSnapshotIdentity?.timestamp_ms ?? null}
                thetaDefinitionFallback={scientificSnapshotIdentity?.theta_definition ?? null}
              />
            </div>
          ) : null}
        {planarVizMode === 2 && (
          <div className="pointer-events-none absolute top-2 left-2 w-14 h-14 rounded-full border border-emerald-700/60 bg-slate-900/30">
            <div
              className="absolute left-1/2 top-1/2 w-[2px] h-6 bg-emerald-400 origin-bottom"
              style={{ transform: `translate(-50%, -100%) rotate(${(sectorCenter01*360).toFixed(3)}deg)` }}
              title="Sector center"
            />
            {ds.splitEnabled && (
              <div
                className="absolute left-1/2 top-1/2 w-[2px] h-4 bg-emerald-300/70 origin-bottom"
                style={{ transform: `translate(-50%, -100%) rotate(${(((sectorCenter01+0.5)%1)*360).toFixed(3)}deg)` }}
                title="Secondary lobe"
              />
            )}
          </div>
        )}
        {glError && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 px-6 text-center"
            role="alert"
            aria-live="assertive"
          >
            <div className="max-w-sm space-y-2">
              <p className="text-sm font-semibold text-red-200">
                {glError.toLowerCase().includes("scientific renderer unavailable")
                  ? "Scientific render lane unavailable"
                  : glError.toLowerCase().includes("halted for safety")
                    ? "Renderer halted for safety"
                    : "Shader pipeline offline"}
              </p>
              <p className="text-xs text-slate-200">
                {glError}
              </p>
              <p className="text-[0.65rem] text-slate-400">
                NHM2 viewer policy is strict scientific only: configure the research render service and
                metric-volume feed. The panel stays responsive and shows this error instead of freezing.
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  </CurvatureVoxProvider>
  );
}


