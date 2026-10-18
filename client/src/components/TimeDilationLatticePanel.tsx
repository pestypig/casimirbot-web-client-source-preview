import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { createProgram, resizeCanvasAndViewport } from "@/lib/gl/simple-gl";
import { registerWebGLContext } from "@/lib/webgl/context-pool";
import { useEnergyPipeline, useUpdatePipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useGrAssistantReport } from "@/hooks/useGrAssistantReport";
import { useGrBrick } from "@/hooks/useGrBrick";
import { useGrRegionStats } from "@/hooks/useGrRegionStats";
import { useGrConstraintContract } from "@/hooks/useGrConstraintContract";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { useProofPack } from "@/hooks/useProofPack";
import { useLapseBrick } from "@/hooks/useLapseBrick";
import { useSectorControlLive } from "@/hooks/use-sector-control-live";
import { computeTimeDilationRenderPlan, type TimeDilationRenderUiToggles } from "@/lib/time-dilation-render-policy";
import { getProofValue, readProofNumber, readProofString } from "@/lib/proof-pack";
import { subscribe, unsubscribe } from "@/lib/luma-bus";
import type { CurvatureQuality } from "@/lib/curvature-brick";
import type { GrEvolveBrickChannel, GrEvolveBrickDecoded } from "@/lib/gr-evolve-brick";
import type { LapseBrickChannel, LapseBrickDecoded } from "@/lib/lapse-brick";
import { buildPreviewArtifacts } from "@/lib/hull-preview-artifacts";
import { buildGrAssistantSummary } from "@/lib/gr-assistant-summary";
import { C } from "@/lib/physics-const";
import { kappaDriveFromPower } from "@/physics/curvature";
import type { GrRegionStats, HullPreviewPayload, ProofPack, SectorControlLiveEvent, TimeDilationRenderPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

declare const Buffer:
  | undefined
  | {
      from(input: string, encoding: string): {
        buffer: ArrayBufferLike;
        byteOffset: number;
        byteLength: number;
      };
    };

type KappaTuning = {
  logMin: number;
  logMax: number;
  phiMin: number;
  phiMax: number;
  warpMin: number;
  warpMax: number;
  breathMin: number;
  breathMax: number;
  softenMin: number;
  softenMax: number;
  smooth: number;
};

type SourcedNumber = {
  value: number;
  source: string;
  proxy: boolean;
};

type SourcedVec3 = {
  value: [number, number, number];
  source: string;
  proxy: boolean;
};

type GrDerivedMetrics = {
  betaMaxAbs: number;
  gttMin?: number;
  gttMax?: number;
};

type BrickChannel = LapseBrickChannel | GrEvolveBrickChannel;

type MathStageLabel =
  | "exploratory"
  | "reduced-order"
  | "diagnostic"
  | "certified"
  | "unstaged";

type MathTreeNode = {
  id: string;
  stage?: MathStageLabel;
  children?: MathTreeNode[];
};

type MathGraphResponse = {
  root: MathTreeNode;
};

const buildMathNodeIndex = (root?: MathTreeNode) => {
  const map = new Map<string, MathTreeNode>();
  if (!root) return map;
  const walk = (node: MathTreeNode) => {
    map.set(node.id, node);
    node.children?.forEach(walk);
  };
  walk(root);
  return map;
};

const STAGE_RANK: Record<MathStageLabel, number> = {
  unstaged: -1,
  exploratory: 0,
  "reduced-order": 1,
  diagnostic: 2,
  certified: 3,
};

const meetsStage = (stage: MathStageLabel, minStage: MathStageLabel) =>
  STAGE_RANK[stage] >= STAGE_RANK[minStage];

const getBrickChannel = (
  brick: LapseBrickDecoded | GrEvolveBrickDecoded | null | undefined,
  key: string,
): BrickChannel | undefined => {
  if (!brick) return undefined;
  const channels = brick.channels as Record<string, BrickChannel | undefined>;
  if (channels && channels[key]) return channels[key];
  if ("extraChannels" in brick) {
    const extra = brick.extraChannels as Record<string, BrickChannel | undefined> | undefined;
    if (extra && extra[key]) return extra[key];
  }
  return undefined;
};

type ClockRateMode = "eulerian" | "static";
type ViewerChartMode = "adm" | "mp_like";

type GuardrailState = "ok" | "fail" | "proxy" | "missing";

type GuardrailSummary = {
  fordRoman: GuardrailState;
  thetaAudit: GuardrailState;
  tsRatio: GuardrailState;
  vdbBand: GuardrailState;
  multiplier: number;
  proxy: boolean;
  hardPass: boolean;
  source: "contract" | "pipeline";
};

type HullBounds = {
  min: [number, number, number];
  max: [number, number, number];
  axes: [number, number, number];
};

type HullDims = {
  Lx_m: number;
  Ly_m: number;
  Lz_m: number;
};

type WallDiagnostics = {
  source: "kretschmann" | "ricci4";
  detected: boolean;
  p98: number;
  threshold: number;
  bandMin: number;
  bandMax: number;
  sampleCount: number;
  sampleFraction: number;
};

type BubbleParams = {
  R: number;
  sigma: number;
  beta: number;
  center: [number, number, number];
  radiusSource: string;
  sigmaSource: string;
  betaSource: string;
  centerSource: string;
  radiusProxy: boolean;
  sigmaProxy: boolean;
  betaProxy: boolean;
  centerProxy: boolean;
};

type LatticeSettings = {
  gridScale: number;
  phiScale: number;
  alphaMin: number;
  softening: number;
  warpStrength: number;
  breathAmp: number;
  breathRate: number;
  pulseRate: number;
  pointSize: number;
};

type TimeDilationLatticePanelProps = {
  className?: string;
  pipeline?: EnergyPipelineState | null;
  kappaTuning?: Partial<KappaTuning>;
  showDebug?: boolean;
};

type SectorControlLiveEventEnvelope = SectorControlLiveEvent & { source: "local" | "server" };

type PanelErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

class TimeDilationPanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[time-dilation] panel render error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = this.state.error?.message ?? "Unknown render error.";
    return (
      <div className="relative flex min-h-[420px] w-full items-center justify-center rounded-xl border border-rose-500/30 bg-black/70 p-6 text-slate-100">
        <div className="max-w-md text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Render failed</div>
          <div className="mt-2 text-sm text-slate-200">The lattice hit a render error.</div>
          <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/40 p-3 text-left text-[11px] text-slate-300 select-text whitespace-pre-wrap">
            {message}
          </pre>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/20"
              onClick={this.handleReset}
            >
              Retry render
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function TimeDilationLatticePanel(props: TimeDilationLatticePanelProps) {
  return (
    <TimeDilationPanelErrorBoundary>
      <TimeDilationLatticePanelInner {...props} />
    </TimeDilationPanelErrorBoundary>
  );
}

const GRID_DIV = 12;
const CM2_TO_M2 = 1e-4;
const THETA_AUDIT_MAX = 1e12;
const DEFAULT_VISUALS = {
  phiScale: 0.45,
  warpStrength: 0.12,
  breathAmp: 0.08,
  softening: 0.35,
} as const;

const DEFAULT_KAPPA_TUNING: KappaTuning = {
  logMin: -60,
  logMax: -20,
  phiMin: 0.25,
  phiMax: 0.85,
  warpMin: 0.08,
  warpMax: 0.22,
  breathMin: 0.05,
  breathMax: 0.14,
  softenMin: 0.22,
  softenMax: 0.5,
  smooth: 0.08,
};

const LEGACY_HULL_AXES: [number, number, number] = [503.5, 132, 86.5];
const DEFAULT_HULL_EPS = 1e-3;
const DEFAULT_BUBBLE_SIGMA = 6;
const BRICK_BLEND_TAU = 0.3;
const GR_TARGET_DX_M = 5;
const GR_DEFAULT_STEPS = 2;
const GR_DEFAULT_CFL = 0.3;
const GR_DEFAULT_DT_S = (GR_TARGET_DX_M * GR_DEFAULT_CFL) / C;
const REGION_TARGET_DX_M = 8;
const REGION_MAX_VOXELS = 2_000_000;
const REGION_GRID_LINE_WIDTH = 0.08;
const REGION_GRID_ALPHA = 0.65;
const REGION_TINT_SCALE_DEFAULT = 1;
const REGION_TINT_SCALE_MAX = 4;
const ACTIVATION_TAU = 0.45;
const TS_RATIO_MIN = 1.5;
const BETA_NEAR_REST_MAX = 0.25;
const DEFAULT_HULL_WALL_THICKNESS = 0.45;
const HULL_BLEND_TAU = 0.25;
const HULL_CONTOUR_SCALE = 1.2;
const HULL_CONTOUR_MIN = 0.05;
const HULL_GLOW_SCALE = 0.6;
const HULL_WARP_SCALE = 0.55;
const BETA_WARP_PERCENTILE = 0.98;
const THETA_WARP_PERCENTILE = 0.98;
const GAMMA_WARP_PERCENTILE = 0.98;
const SHEAR_WARP_PERCENTILE = 0.98;
const WARP_SCALE_SAMPLE_MAX = 4096;
const WARP_SAMPLE_MAX_ABS = 1e6;
const WARP_CLAMP_MULT = 4;
const WALL_INVARIANT_PERCENTILE = 0.98;
const WALL_INVARIANT_FRACTION = 0.25;
const WALL_INVARIANT_BAND_FRACTION = 0.2;
const BETA_STRAIN_SAMPLE_FACTOR = 1.05;
const BETA_STRAIN_THRESHOLD_FRACTION = 0.05;
const SHIFT_STIFF_WARN_RATIO = 1.0;
const SHIFT_STIFF_SEVERE_RATIO = 1.5;
const SHIFT_STIFF_GRAD_WARN_RATIO = 3;
const SHIFT_STIFF_GRAD_SEVERE_RATIO = 6;
const GAMMA_DEV_CLAMP_MIN = 0.05;
const GAMMA_DEV_CLAMP_MAX = 4;
const GAMMA_SCALE_MIN = 0.5;
const GAMMA_SCALE_MAX = 2;
const WARP_CAP_THETA_FLOOR = 0.2;
const CONSTRAINT_ISO_LEVEL = 0.7;
const CONSTRAINT_ISO_WIDTH = 0.08;
const DEFAULT_VISUAL_TUNING = {
  gammaEnabled: true,
  kijEnabled: true,
  constraintEnabled: true,
  alphaScale: 1,
  betaScale: 1,
  gammaScale: 1,
  kijScale: 1,
  constraintScale: 1,
};
const EXPLORE_VISUAL_TUNING = {
  gammaEnabled: true,
  kijEnabled: true,
  constraintEnabled: true,
  alphaScale: 1.6,
  betaScale: 2,
  gammaScale: 3,
  kijScale: 3,
  constraintScale: 3,
};

const VERT = `#version 300 es
precision highp float;
in vec3 a_pos;
in float a_alpha;
in float a_hull;
in vec3 a_hullDir;
in vec3 a_beta;
in vec3 a_gamma;
in vec3 a_shear;
  in float a_constraint;
  in float a_region;
  in float a_regionGrid;
  in float a_theta;

uniform mat4 u_mvp;
uniform float u_time;
uniform float u_gridScale;
uniform vec3 u_worldScale;
uniform vec3 u_driveDir;
uniform vec3 u_bubbleCenter;
uniform float u_bubbleR;
uniform float u_sigma;
  uniform float u_beta;
  uniform vec3 u_betaCenter;
  uniform float u_betaScale;
  uniform float u_betaWarpWeight;
  uniform float u_geomWarpScale;
  uniform float u_warpCap;
  uniform float u_phiScale;
  uniform float u_alphaMin;
uniform float u_alphaScale;
uniform float u_thetaScale;
uniform float u_thetaWarpWeight;
uniform float u_softening;
uniform float u_warpStrength;
uniform float u_breathAmp;
uniform float u_breathRate;
uniform float u_pulseRate;
uniform float u_pointSize;
uniform float u_metricBlend;
uniform float u_shearStrength;
uniform float u_constraintScale;
uniform float u_brickBlend;
uniform float u_activation;
uniform float u_hullThickness;
uniform float u_hullBlend;

out float v_alpha;
out float v_pulse;
out float v_hullWeight;
  out float v_constraint;
  out float v_region;
  out float v_regionGrid;
  out float v_theta;

vec3 safeNormalize(vec3 v) {
  float len = length(v);
  if (len < 1e-6) return vec3(1.0, 0.0, 0.0);
  return v / len;
}

float topHat(float r, float sigma, float R) {
  float den = max(1e-6, 2.0 * tanh(sigma * R));
  return (tanh(sigma * (r + R)) - tanh(sigma * (r - R))) / den;
}

void main() {
  vec3 p = a_pos * u_gridScale;
  vec3 worldScale = max(u_worldScale, vec3(1e-3));
  vec3 pWorld = p * worldScale;
  vec3 rel = pWorld - u_bubbleCenter;
  float r = length(rel);
  float R = max(1e-4, u_bubbleR * (1.0 + 0.1 * u_softening));
  float sigma = max(1e-4, u_sigma);
  float f = topHat(r, sigma, R);
  float activation = clamp(u_activation, 0.0, 1.0);
  float betaShift = clamp(u_beta, 0.0, 0.99) * f;
    float alphaAnalytic = sqrt(max(u_alphaMin * u_alphaMin, 1.0 - betaShift * betaShift * u_phiScale));
    float brickAlpha = clamp(a_alpha, u_alphaMin, 1.0);
    float brickBlend = clamp(u_brickBlend, 0.0, 1.0);
    float alpha = mix(alphaAnalytic, brickAlpha, brickBlend);
    float thetaNorm = clamp(a_theta * u_thetaScale, -1.0, 1.0) * brickBlend;

  vec3 dir = safeNormalize(u_driveDir);
  float hullThickness = max(1e-4, u_hullThickness);
  float hullBlend = clamp(u_hullBlend, 0.0, 1.0);
  float hullDist = a_hull;
    float hullBand = 1.0 - smoothstep(hullThickness * 0.5, hullThickness, abs(hullDist));
    float hullWeight = hullBand * hullBlend;
    vec3 hullDir = length(a_hullDir) > 1e-4 ? normalize(a_hullDir) : safeNormalize(rel);
    float hullSign = hullDist >= 0.0 ? 1.0 : -1.0;
    vec3 hullWarp = hullDir * hullSign * hullWeight * activation * ${HULL_WARP_SCALE.toFixed(2)};
    float thetaWarp = thetaNorm * u_alphaScale * activation;
  vec3 gamma = max(a_gamma, vec3(0.0));
  vec3 gammaScale = sqrt(max(gamma, vec3(0.0)));
  float metricBlend = max(0.0, u_metricBlend);
  gammaScale = vec3(1.0) + (gammaScale - vec3(1.0)) * metricBlend;
  gammaScale = clamp(
    gammaScale,
    vec3(${GAMMA_SCALE_MIN.toFixed(2)}),
    vec3(${GAMMA_SCALE_MAX.toFixed(2)})
  );
    vec3 shear = a_shear * u_shearStrength * activation;
    vec3 twist = cross(dir, shear);
    vec3 betaRel = (a_beta - u_betaCenter) * u_betaScale;
    vec3 betaWarp = betaRel * u_betaWarpWeight * activation * u_warpStrength;
    vec3 radial = safeNormalize(rel);
  vec3 thetaVec = radial * thetaWarp * u_warpStrength * u_thetaWarpWeight;
    vec3 warpBase = (betaWarp + thetaVec + hullWarp * u_warpStrength + shear + twist) * u_geomWarpScale;
  float breath = (1.0 - alpha) * u_breathAmp * sin(u_time * u_breathRate) * activation * u_geomWarpScale;
  vec3 warpWithBreath = warpBase + dir * breath;
  float warpCap = max(
    1e-6,
    u_warpCap * (${WARP_CAP_THETA_FLOOR.toFixed(2)} + (1.0 - ${WARP_CAP_THETA_FLOOR.toFixed(2)}) * abs(thetaNorm))
  );
  float warpLen = length(warpWithBreath);
  vec3 warp = warpLen > warpCap ? warpWithBreath * (warpCap / warpLen) : warpWithBreath;
  vec3 warped = (p + warp) * gammaScale;

  float localRate = mix(0.3, 1.0, alpha);
    v_pulse = 0.5 + 0.5 * sin(u_time * u_pulseRate * localRate + dot(p, vec3(1.7, 2.3, 1.1)));
    v_alpha = alpha;
    v_theta = thetaNorm;
    v_hullWeight = hullWeight;
  v_constraint = clamp(abs(a_constraint) * u_constraintScale, 0.0, 1.0);
  v_region = clamp(a_region, 0.0, 1.0);
  v_regionGrid = clamp(a_regionGrid, 0.0, 1.0);

  gl_Position = u_mvp * vec4(warped, 1.0);
  gl_PointSize = u_pointSize / max(1.0, gl_Position.w);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float u_alphaMin;
uniform float u_alphaScale;
uniform float u_pointPass;
uniform float u_constraintIso;
uniform float u_constraintWidth;
  uniform float u_regionTint;
  uniform float u_regionTintScale;
  uniform float u_regionGrid;
  uniform float u_regionGridAlpha;

  in float v_alpha;
  in float v_pulse;
  in float v_hullWeight;
  in float v_constraint;
  in float v_region;
  in float v_regionGrid;
  in float v_theta;
  out vec4 outColor;
  
  vec3 palette(float theta) {
    vec3 contract = vec3(0.22, 0.62, 0.98);
    vec3 expand = vec3(0.98, 0.42, 0.22);
    float t = clamp(theta * 0.5 + 0.5, 0.0, 1.0);
    return mix(contract, expand, t);
  }

  void main() {
    if (u_pointPass > 0.5) {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      if (dot(c, c) > 1.0) discard;
    }

    float theta = clamp(v_theta, -1.0, 1.0);
    float strength = clamp(abs(theta) * u_alphaScale, 0.0, 1.0);
    vec3 signedColor = palette(theta);
    vec3 neutral = vec3(0.82, 0.86, 0.92);
    vec3 color = mix(neutral, signedColor, strength);
    float pulse = mix(0.35, 1.0, v_pulse);
  float hullGlow = clamp(v_hullWeight * ${HULL_GLOW_SCALE.toFixed(2)}, 0.0, 1.0);
  vec3 hullColor = vec3(0.92, 0.96, 1.0);
  color = mix(color, hullColor, hullGlow);
  float iso = smoothstep(u_constraintIso - u_constraintWidth, u_constraintIso + u_constraintWidth, v_constraint);
  vec3 constraintColor = vec3(0.98, 0.32, 0.42);
  color = mix(color, constraintColor, iso);
  float regionTint = clamp(v_region * max(u_regionTintScale, 0.0), 0.0, 1.0) * clamp(u_regionTint, 0.0, 1.0);
  vec3 regionColor = vec3(0.22, 0.92, 0.62);
  color = mix(color, regionColor, regionTint);
  float regionGrid = clamp(u_regionGrid, 0.0, 1.0) * clamp(u_regionGridAlpha, 0.0, 1.0);
  vec3 gridColor = vec3(0.92, 0.92, 0.78);
  color = mix(color, gridColor, v_regionGrid * regionGrid);
  float alpha = u_pointPass > 0.5 ? 0.9 : 0.45;
  alpha = mix(alpha, 0.95, hullGlow);
  alpha = mix(alpha, 0.95, iso);
  alpha = mix(alpha, 0.9, regionTint);
  alpha = mix(alpha, 0.9, v_regionGrid * regionGrid);
  outColor = vec4(color * pulse, alpha);
}
`;

const VERT_COMPAT = `#version 300 es
precision mediump float;
in vec3 a_pos;
in float a_alpha;
in float a_hull;
in vec3 a_hullDir;
in vec3 a_beta;
in vec3 a_gamma;
in vec3 a_shear;
in float a_constraint;
in float a_region;
in float a_regionGrid;
in float a_theta;

uniform mat4 u_mvp;
uniform float u_time;
uniform float u_gridScale;
uniform vec3 u_worldScale;
uniform float u_pointSize;
uniform float u_alphaMin;
uniform float u_thetaScale;
uniform float u_constraintScale;

out float v_alpha;
out float v_pulse;
out float v_hullWeight;
out float v_constraint;
out float v_region;
out float v_regionGrid;
out float v_theta;

void main() {
  vec3 p = a_pos * u_gridScale;
  vec3 warped = p * max(u_worldScale, vec3(1e-3));
  float alpha = clamp(a_alpha, u_alphaMin, 1.0);
  v_alpha = alpha;
  v_theta = clamp(a_theta * u_thetaScale, -1.0, 1.0);
  v_hullWeight = 0.0;
  v_constraint = clamp(abs(a_constraint) * u_constraintScale, 0.0, 1.0);
  v_region = clamp(a_region, 0.0, 1.0);
  v_regionGrid = clamp(a_regionGrid, 0.0, 1.0);
  v_pulse = 0.5 + 0.5 * sin(u_time + dot(p, vec3(1.3, 2.1, 0.9)));

  gl_Position = u_mvp * vec4(warped, 1.0);
  gl_PointSize = u_pointSize / max(1.0, gl_Position.w);
}
`;

const FRAG_COMPAT = `#version 300 es
precision mediump float;

uniform float u_pointPass;

in float v_alpha;
in float v_pulse;
in float v_theta;
out vec4 outColor;

void main() {
  if (u_pointPass > 0.5) {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    if (dot(c, c) > 1.0) discard;
  }
  float t = clamp(v_theta * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(vec3(0.24, 0.60, 0.95), vec3(0.95, 0.42, 0.24), t);
  outColor = vec4(color * mix(0.4, 1.0, v_pulse), max(0.2, v_alpha));
}
`;

const ATTRIB_BINDINGS = {
  a_pos: 0,
  a_alpha: 1,
  a_hull: 2,
  a_hullDir: 3,
  a_beta: 4,
  a_gamma: 5,
  a_shear: 6,
  a_constraint: 7,
  a_region: 8,
  a_regionGrid: 9,
  a_theta: 10,
} as const;

function makeLatticeSegments(div: number): Float32Array {
  const verts: number[] = [];
  const step = 2 / div;
  const min = -1;
  const max = 1;

  for (let iy = 0; iy <= div; iy++) {
    const y = min + iy * step;
    for (let iz = 0; iz <= div; iz++) {
      const z = min + iz * step;
      for (let ix = 0; ix < div; ix++) {
        const x0 = min + ix * step;
        const x1 = min + (ix + 1) * step;
        verts.push(x0, y, z, x1, y, z);
      }
    }
  }

  for (let ix = 0; ix <= div; ix++) {
    const x = min + ix * step;
    for (let iz = 0; iz <= div; iz++) {
      const z = min + iz * step;
      for (let iy = 0; iy < div; iy++) {
        const y0 = min + iy * step;
        const y1 = min + (iy + 1) * step;
        verts.push(x, y0, z, x, y1, z);
      }
    }
  }

  for (let ix = 0; ix <= div; ix++) {
    const x = min + ix * step;
    for (let iy = 0; iy <= div; iy++) {
      const y = min + iy * step;
      for (let iz = 0; iz < div; iz++) {
        const z0 = min + iz * step;
        const z1 = min + (iz + 1) * step;
        verts.push(x, y, z0, x, y, z1);
      }
    }
  }

  return new Float32Array(verts);
}

function makeLatticeNodes(div: number): Float32Array {
  const verts: number[] = [];
  const step = 2 / div;
  const min = -1;
  for (let ix = 0; ix <= div; ix++) {
    const x = min + ix * step;
    for (let iy = 0; iy <= div; iy++) {
      const y = min + iy * step;
      for (let iz = 0; iz <= div; iz++) {
        const z = min + iz * step;
        verts.push(x, y, z);
      }
    }
  }
  return new Float32Array(verts);
}

function perspective(out: Float32Array, fovy: number, aspect: number, znear: number, zfar: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (znear - zfar);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (zfar + znear) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * zfar * znear) * nf;
  out[15] = 0;
}

function lookAt(
  out: Float32Array,
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number]
) {
  const [ex, ey, ez] = eye;
  const [cx, cy, cz] = center;
  const [ux, uy, uz] = up;
  let zx = ex - cx;
  let zy = ey - cy;
  let zz = ez - cz;
  let rl = 1 / Math.hypot(zx, zy, zz);
  zx *= rl;
  zy *= rl;
  zz *= rl;
  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  rl = 1 / Math.hypot(xx, xy, xz);
  xx *= rl;
  xy *= rl;
  xz *= rl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
}

function mul(out: Float32Array, a: Float32Array, b: Float32Array) {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
}

function normalizeDir(v: unknown): [number, number, number] {
  if (!Array.isArray(v) || v.length < 3) return [1, 0, 0];
  const x = Number(v[0]) || 0;
  const y = Number(v[1]) || 0;
  const z = Number(v[2]) || 0;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}


const dotVec3 = (a: [number, number, number], b: [number, number, number]) =>   
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossVec3 = (a: [number, number, number], b: [number, number, number]) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] as [
    number,
    number,
    number,
  ];
const normalizeVec3 = (v: [number, number, number]) => {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 1e-6)) return [0, 0, 0] as [number, number, number];
  return [v[0] / len, v[1] / len, v[2] / len] as [number, number, number];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const lerp = (min: number, max: number, t: number) => min + (max - min) * t;
const toFiniteNumber = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const formatFixed = (value: number | null | undefined, digits = 2) =>
  Number.isFinite(value as number) ? (value as number).toFixed(digits) : "n/a";
const formatSci = (value: number | null | undefined, digits = 2) =>
  Number.isFinite(value as number) ? (value as number).toExponential(digits) : "n/a";
const formatProxyValue = (value: string, proxy: boolean, source?: string) =>
  proxy ? `${value} (proxy${source ? `:${source}` : ""})` : value;
const formatPipelineValue = (value: string, source?: string, proxy?: boolean) => {
  if (proxy) return `${value} (proxy:${source ?? "pipeline"})`;
  if (!source) return `${value} (pipeline)`;
  return `${value} (pipeline:${source})`;
};
const formatCount = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? Math.round(value as number).toLocaleString("en-US") : "n/a";
const parseFiniteNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const formatEventTime = (value: number | null | undefined) => {
  if (!Number.isFinite(value as number)) return "n/a";
  try {
    return new Date(value as number).toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return "n/a";
  }
};
const normalizeSectorControlLiveEvent = (payload: unknown): SectorControlLiveEvent | null => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const ts = parseFiniteNumber(raw.ts) ?? Date.now();
  const constraints =
    raw.constraints && typeof raw.constraints === "object"
      ? (raw.constraints as SectorControlLiveEvent["constraints"])
      : null;
  const observerGrid =
    raw.observerGrid && typeof raw.observerGrid === "object"
      ? (raw.observerGrid as SectorControlLiveEvent["observerGrid"])
      : null;
  return {
    ts,
    requestedMode: typeof raw.requestedMode === "string" ? raw.requestedMode : undefined,
    appliedMode: typeof raw.appliedMode === "string" ? raw.appliedMode : undefined,
    fallbackApplied: typeof raw.fallbackApplied === "boolean" ? raw.fallbackApplied : undefined,
    plannerMode: typeof raw.plannerMode === "string" ? raw.plannerMode : null,
    firstFail: typeof raw.firstFail === "string" ? raw.firstFail : null,
    constraints,
    observerGrid,
  };
};
const formatBytes = (value: number | null | undefined) => {
  if (!Number.isFinite(value as number)) return "n/a";
  const bytes = Math.max(0, value as number);
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${Math.round(bytes)} B`;
};
const formatVec3 = (value: [number, number, number] | null | undefined, digits = 2) => {
  if (!value || value.length < 3) return "n/a";
  return `[${value.map((entry) => (Number.isFinite(entry) ? entry.toFixed(digits) : "n/a")).join(", ")}]`;
};
const truncateText = (value: string, max = 80) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;
const formatInvariantValue = (value: unknown, digits = 2) => {
  if (typeof value === "number") return formatSci(value, digits);
  if (typeof value === "string") return truncateText(value);
  if (value && typeof value === "object") {
    try {
      return truncateText(JSON.stringify(value));
    } catch {
      return "unserializable";
    }
  }
  return value == null ? "n/a" : String(value);
};
const percentileFromSamples = (samples: number[], percentile: number) => {
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const idx = Math.min(
    samples.length - 1,
    Math.max(0, Math.floor(percentile * (samples.length - 1))),
  );
  return samples[idx];
};
const collectAbsSamples = (
  data: Float32Array | null | undefined,
  maxSamples: number,
  maxAbs: number = Number.POSITIVE_INFINITY,
) => {
  if (!data || maxSamples <= 0) return [];
  const len = data.length;
  if (len === 0) return [];
  const step = Math.max(1, Math.floor(len / maxSamples));
  const samples: number[] = [];
  for (let i = 0; i < len; i += step) {
    const value = Math.min(Math.abs(data[i]), maxAbs);
    if (Number.isFinite(value)) samples.push(value);
  }
  return samples;
};
const collectVec3MagnitudeSamples = (
  data: Float32Array | null | undefined,
  maxSamples: number,
  maxAbs: number = Number.POSITIVE_INFINITY,
) => {
  if (!data || data.length < 3 || maxSamples <= 0) return [];
  const count = Math.floor(data.length / 3);
  if (count <= 0) return [];
  const step = Math.max(1, Math.floor(count / maxSamples));
  const samples: number[] = [];
  for (let i = 0; i < count; i += step) {
    const idx = i * 3;
    const value = Math.min(Math.hypot(data[idx], data[idx + 1], data[idx + 2]), maxAbs);
    if (Number.isFinite(value)) samples.push(value);
  }
  return samples;
};
const collectVec3DeviationSamples = (
  data: Float32Array | null | undefined,
  maxSamples: number,
  baseline: number,
  maxAbs: number = Number.POSITIVE_INFINITY,
) => {
  if (!data || data.length < 3 || maxSamples <= 0) return [];
  const count = Math.floor(data.length / 3);
  if (count <= 0) return [];
  const step = Math.max(1, Math.floor(count / maxSamples));
  const samples: number[] = [];
  for (let i = 0; i < count; i += step) {
    const idx = i * 3;
    const dx = data[idx] - baseline;
    const dy = data[idx + 1] - baseline;
    const dz = data[idx + 2] - baseline;
    const value = Math.min(Math.hypot(dx, dy, dz), maxAbs);
    if (Number.isFinite(value)) samples.push(value);
  }
  return samples;
};
const normalizeSignedField = (
  data: Float32Array | null,
  p98Abs: number | null | undefined,
  clampMult: number,
  fallback = 0,
) => {
  if (!data) {
    return {
      data: null as Float32Array | null,
      sanitizedCount: 0,
      clampMin: null as number | null,
      clampMax: null as number | null,
    };
  }
  const safeP98 = Number.isFinite(p98Abs as number) && (p98Abs as number) > 0 ? (p98Abs as number) : null;
  const clampAbs =
    safeP98 && Number.isFinite(clampMult) && clampMult > 0 ? safeP98 * clampMult : null;
  const clampMin = clampAbs !== null ? -clampAbs : null;
  const clampMax = clampAbs !== null ? clampAbs : null;
  const out = new Float32Array(data.length);
  let sanitizedCount = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    if (!Number.isFinite(value)) {
      out[i] = fallback;
      sanitizedCount += 1;
      continue;
    }
    if (clampAbs !== null && Math.abs(value) > clampAbs) {
      out[i] = Math.sign(value) * clampAbs;
      sanitizedCount += 1;
      continue;
    }
    out[i] = value;
  }
  return { data: out, sanitizedCount, clampMin, clampMax };
};
const sanitizeVec3Array = (data: Float32Array | null, clampAbs?: number | null) => {
  if (!data) return null;
  const out = new Float32Array(data.length);
  const limit = Number.isFinite(clampAbs as number) && (clampAbs as number) > 0 ? (clampAbs as number) : null;
  for (let i = 0; i < data.length; i += 3) {
    const x = data[i];
    const y = data[i + 1];
    const z = data[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      continue;
    }
    if (limit) {
      const mag = Math.hypot(x, y, z);
      if (mag > limit && mag > 0) {
        const scale = limit / mag;
        out[i] = x * scale;
        out[i + 1] = y * scale;
        out[i + 2] = z * scale;
        continue;
      }
    }
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return out;
};
const sanitizeGammaArray = (data: Float32Array | null, clampDev?: number | null) => {
  if (!data) return null;
  const out = new Float32Array(data.length);
  const limit = Number.isFinite(clampDev as number) && (clampDev as number) > 0 ? (clampDev as number) : null;
  const min = limit ? Math.max(0.1, 1 - limit) : 0.1;
  const max = limit ? 1 + limit : 4;
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    if (!Number.isFinite(value)) {
      out[i] = 1;
    } else {
      out[i] = clampNumber(value, min, max);
    }
  }
  return out;
};
const smoothExp = (current: number, target: number, tau: number, dt: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (!(tau > 0)) return target;
  if (!(dt > 0)) return current;
  const lerpFactor = 1 - Math.exp(-dt / tau);
  return current + (target - current) * lerpFactor;
};

const azimuth01 = (x: number, z: number) => {
  const theta = Math.atan2(z, x);
  return clamp01((theta + Math.PI) / (Math.PI * 2));
};

const gridLineWeight = (value01: number, bins: number, width: number) => {
  if (!(bins > 0)) return 0;
  const scaled = clamp01(value01) * bins;
  const dist = Math.abs(scaled - Math.round(scaled));
  if (dist >= width) return 0;
  return 1 - dist / width;
};

const resolveEllipsoidRadius = (dir: [number, number, number], axes: [number, number, number]) => {
  const ax = Math.max(1e-6, Math.abs(axes[0]));
  const ay = Math.max(1e-6, Math.abs(axes[1]));
  const az = Math.max(1e-6, Math.abs(axes[2]));
  const dx = dir[0] / ax;
  const dy = dir[1] / ay;
  const dz = dir[2] / az;
  const denom = Math.hypot(dx, dy, dz);
  return denom > 1e-6 ? 1 / denom : 0;
};

const buildBoundsFromMinMax = (
  min: [number, number, number],
  max: [number, number, number],
): HullBounds => {
  const minFixed: [number, number, number] = [
    Math.min(min[0], max[0]),
    Math.min(min[1], max[1]),
    Math.min(min[2], max[2]),
  ];
  const maxFixed: [number, number, number] = [
    Math.max(min[0], max[0]),
    Math.max(min[1], max[1]),
    Math.max(min[2], max[2]),
  ];
  const axes: [number, number, number] = [
    Math.max(1e-6, (maxFixed[0] - minFixed[0]) / 2),
    Math.max(1e-6, (maxFixed[1] - minFixed[1]) / 2),
    Math.max(1e-6, (maxFixed[2] - minFixed[2]) / 2),
  ];
  return { min: minFixed, max: maxFixed, axes };
};

const buildBasis = (forward: [number, number, number]) => {
  const fwd = normalizeVec3(forward);
  const upBase: [number, number, number] = [0, 1, 0];
  let right = crossVec3(upBase, fwd);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
    right = [1, 0, 0];
  } else {
    right = normalizeVec3(right);
  }
  const up = normalizeVec3(crossVec3(fwd, right));
  return { fwd, right, up };
};

const describeContractionSide = (
  vector: [number, number, number] | null | undefined,
  driveDir: [number, number, number],
) => {
  if (!vector) return "n/a";
  const { fwd, right, up } = buildBasis(driveDir);
  const f = dotVec3(vector, fwd);
  const r = dotVec3(vector, right);
  const u = dotVec3(vector, up);
  const af = Math.abs(f);
  const ar = Math.abs(r);
  const au = Math.abs(u);
  if (af >= ar && af >= au) return f >= 0 ? "front" : "back";
  if (ar >= au) return r >= 0 ? "right" : "left";
  return u >= 0 ? "up" : "down";
};

const computeContractionAngle = (
  vector: [number, number, number] | null | undefined,
  driveDir: [number, number, number],
) => {
  if (!vector) return 0;
  const { fwd, right } = buildBasis(driveDir);
  const f = dotVec3(vector, fwd);
  const r = dotVec3(vector, right);
  return (Math.atan2(r, f) * 180) / Math.PI;
};

const normalizeLog = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logValue = Math.log10(value);
  if (!Number.isFinite(logValue) || logMax <= logMin) return 0;
  return clamp01((logValue - logMin) / (logMax - logMin));
};

const averageFinite = (...values: Array<number | null | undefined>) => {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value as number)) continue;
    sum += value as number;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
};

const firstFinite = (...values: Array<unknown>): number | undefined => {
  for (const value of values) {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
};

const pickSourcedNumber = (
  candidates: Array<{ value: unknown; source: string; proxy?: boolean }>,
): SourcedNumber | null => {
  for (const candidate of candidates) {
    const num = Number(candidate.value);
    if (!Number.isFinite(num)) continue;
    return { value: num, source: candidate.source, proxy: Boolean(candidate.proxy) };
  }
  return null;
};

const resolveBooleanStatus = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const norm = value.toLowerCase();
    if (["ok", "pass", "passed", "true", "admissible"].includes(norm)) return true;
    if (["fail", "failed", "false", "inadmissible"].includes(norm)) return false;
  }
  return null;
};

const FORCE_STRICT_LATTICE = import.meta.env.VITE_LATTICE_STRICT_ONLY !== "0";

const resolveStrictCongruence = (pipeline?: EnergyPipelineState | null): boolean =>
  FORCE_STRICT_LATTICE || (pipeline as any)?.strictCongruence !== false;

const qiSourceIsMetric = (source: unknown): boolean => {
  if (typeof source !== "string") return false;
  const normalized = source.toLowerCase();
  return (
    normalized.startsWith("warp.metric") ||
    normalized.startsWith("gr.metric") ||
    normalized.startsWith("gr.rho_constraint")
  );
};

const isGuardrailState = (value: unknown): value is GuardrailState =>
  value === "ok" || value === "fail" || value === "proxy" || value === "missing";

const hasGuardrailFailure = (state: GuardrailState): boolean =>
  state === "fail" || state === "missing";

function getPowerW(pipeline?: EnergyPipelineState | null): number {
  const watts = firstFinite(pipeline?.P_avg_W, (pipeline as any)?.power_W);
  if (Number.isFinite(watts)) return watts as number;

  const megaWatts = firstFinite((pipeline as any)?.P_avg_MW);
  if (Number.isFinite(megaWatts)) return (megaWatts as number) * 1e6;

  const raw = firstFinite(pipeline?.P_avg, (pipeline as any)?.power) ?? Number.NaN;
  if (!Number.isFinite(raw)) return Number.NaN;
  if (raw === 0) return 0;
  if (raw > 0 && raw < 1e4) return raw * 1e6;
  return raw;
}

function resolvePowerW(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const watts = pickSourcedNumber([
    { value: pipeline?.P_avg_W, source: "P_avg_W" },
    { value: (pipeline as any)?.power_W, source: "power_W" },
  ]);
  if (watts) return watts;

  const megaWatts = pickSourcedNumber([{ value: (pipeline as any)?.P_avg_MW, source: "P_avg_MW" }]);
  if (megaWatts) return { ...megaWatts, value: megaWatts.value * 1e6 };

  const raw = pickSourcedNumber([
    { value: pipeline?.P_avg, source: "P_avg", proxy: true },
    { value: (pipeline as any)?.power, source: "power", proxy: true },
  ]);
  if (!raw) return { value: Number.NaN, source: "missing", proxy: true };
  if (raw.value === 0) return raw;
  if (raw.value > 0 && raw.value < 1e4) {
    return { value: raw.value * 1e6, source: `${raw.source}_MW?`, proxy: true };
  }
  return raw;
}

function getHullAreaM2(pipeline?: EnergyPipelineState | null): number {
  const area = firstFinite(
    pipeline?.hullArea_m2,
    pipeline?.tiles?.hullArea_m2,
    pipeline?.hullAreaOverride_m2,
    (pipeline as any)?.__hullAreaEllipsoid_m2,
  );
  if (Number.isFinite(area) && (area as number) > 0) return area as number;

  const tileAreaCm2 = firstFinite(pipeline?.tileArea_cm2, pipeline?.tiles?.tileArea_cm2);
  const nTiles = firstFinite(
    pipeline?.N_tiles,
    pipeline?.tiles?.N_tiles,
    pipeline?.tiles?.total,
  );
  if (
    Number.isFinite(tileAreaCm2) &&
    Number.isFinite(nTiles) &&
    (tileAreaCm2 as number) > 0 &&
    (nTiles as number) > 0
  ) {
    return (tileAreaCm2 as number) * CM2_TO_M2 * (nTiles as number);
  }

  return Number.NaN;
}

function getDutyEffective(pipeline?: EnergyPipelineState | null): number {
  const duty = firstFinite(
    pipeline?.dutyEffectiveFR,
    pipeline?.dutyEffective_FR,
    pipeline?.dutyShip,
    pipeline?.dutyEff,
    pipeline?.dutyCycle,
    pipeline?.dutyFR,
    pipeline?.dutyGate,
  );
  return Number.isFinite(duty) ? clamp01(duty as number) : 0;
}

function resolveDutyEffective(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: (pipeline as any)?.d_eff, source: "d_eff" },
    { value: pipeline?.dutyEffectiveFR, source: "dutyEffectiveFR" },
    { value: pipeline?.dutyEffective_FR, source: "dutyEffective_FR" },
    { value: pipeline?.dutyShip, source: "dutyShip", proxy: true },
    { value: pipeline?.dutyEff, source: "dutyEff", proxy: true },
    { value: pipeline?.dutyCycle, source: "dutyCycle", proxy: true },
    { value: pipeline?.dutyFR, source: "dutyFR", proxy: true },
    { value: pipeline?.dutyGate, source: "dutyGate", proxy: true },
  ]);
  if (direct) return { ...direct, value: clamp01(direct.value) };
  return { value: 0, source: "missing", proxy: true };
}

function getGeometryGain(pipeline?: EnergyPipelineState | null): number {
  const gammaGeo = firstFinite(
    pipeline?.gammaGeo,
    (pipeline as any)?.ampFactors?.gammaGeo,
    (pipeline as any)?.amps?.gammaGeo,
  );
  return Number.isFinite(gammaGeo) && (gammaGeo as number) > 0 ? (gammaGeo as number) : 1;
}

function computeKappaDrive(pipeline?: EnergyPipelineState | null): number {
  if (!pipeline) return Number.NaN;
  const powerW = getPowerW(pipeline);
  const areaM2 = getHullAreaM2(pipeline);
  if (!Number.isFinite(powerW) || !Number.isFinite(areaM2) || areaM2 <= 0) return Number.NaN;
  const dEff = getDutyEffective(pipeline);
  const gain = getGeometryGain(pipeline);
  return kappaDriveFromPower(powerW, areaM2, dEff, gain);
}

function resolveGammaGeo(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: pipeline?.gammaGeo, source: "gammaGeo" },
    { value: (pipeline as any)?.ampFactors?.gammaGeo, source: "ampFactors.gammaGeo", proxy: true },
    { value: (pipeline as any)?.amps?.gammaGeo, source: "amps.gammaGeo", proxy: true },
  ]);
  if (direct) return { ...direct, value: Math.max(1e-6, direct.value) };
  return { value: 1, source: "fallback", proxy: true };
}

function resolveGammaVdB(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: pipeline?.gammaVanDenBroeck_mass, source: "gammaVanDenBroeck_mass" },
    { value: pipeline?.gammaVanDenBroeck, source: "gammaVanDenBroeck" },
    { value: pipeline?.gammaVanDenBroeck_vis, source: "gammaVanDenBroeck_vis", proxy: true },
    { value: pipeline?.gammaVdB, source: "gammaVdB", proxy: true },
    { value: pipeline?.gammaVdB_vis, source: "gammaVdB_vis", proxy: true },
    { value: (pipeline as any)?.gamma_vdb, source: "gamma_vdb", proxy: true },
  ]);
  if (direct) return { ...direct, value: Math.max(1, direct.value) };
  return { value: 1, source: "fallback", proxy: true };
}

function resolveQSpoiling(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: pipeline?.qSpoilingFactor, source: "qSpoilingFactor" },
    { value: pipeline?.deltaAOverA, source: "deltaAOverA", proxy: true },
    { value: pipeline?.qSpoil, source: "qSpoil", proxy: true },
    { value: pipeline?.q, source: "q", proxy: true },
  ]);
  if (direct) return { ...direct, value: Math.max(0, direct.value) };
  return { value: 1, source: "fallback", proxy: true };
}

function resolveTSRatio(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: pipeline?.TS_ratio, source: "TS_ratio" },
    { value: pipeline?.TS_long, source: "TS_long", proxy: true },
    { value: pipeline?.TS_geom, source: "TS_geom", proxy: true },
    { value: (pipeline as any)?.ts?.ratio, source: "ts.ratio", proxy: true },
    { value: (pipeline as any)?.timeScaleRatio, source: "timeScaleRatio", proxy: true },
  ]);
  if (direct) return { ...direct, value: Math.max(0, direct.value) };
  return { value: Number.NaN, source: "missing", proxy: true };
}

function resolveThetaCal(
  pipeline: EnergyPipelineState | null,
  inputs: {
    gammaGeo: SourcedNumber;
    qSpoil: SourcedNumber;
    gammaVdB: SourcedNumber;
    duty: SourcedNumber;
  },
): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: (pipeline as any)?.thetaCal, source: "thetaCal" },
    { value: (pipeline as any)?.thetaScaleExpected, source: "thetaScaleExpected" },
    { value: (pipeline as any)?.uniformsExplain?.thetaAudit?.results?.thetaCal, source: "thetaAudit.thetaCal" },
  ]);
  if (direct) return direct;

  const gammaGeoCubed = Math.pow(Math.max(0, inputs.gammaGeo.value), 3);
  const value = gammaGeoCubed * inputs.qSpoil.value * inputs.gammaVdB.value * inputs.duty.value;
  const proxy =
    inputs.gammaGeo.proxy || inputs.qSpoil.proxy || inputs.gammaVdB.proxy || inputs.duty.proxy;
  return {
    value: Number.isFinite(value) ? value : Number.NaN,
    source: "computed",
    proxy,
  };
}

function resolveThetaGeom(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    {
      value: (pipeline as any)?.theta_geom,
      source: "theta_geom",
      proxy: (pipeline as any)?.theta_geom_proxy,
    },
    {
      value: (pipeline as any)?.warp?.metricAdapter?.betaDiagnostics?.thetaMax,
      source: "warp.metricAdapter.betaDiagnostics.thetaMax",
      proxy: (pipeline as any)?.warp?.metricAdapter?.betaDiagnostics?.method === "not-computed",
    },
    {
      value: (pipeline as any)?.warp?.metricAdapter?.betaDiagnostics?.thetaRms,
      source: "warp.metricAdapter.betaDiagnostics.thetaRms",
      proxy: (pipeline as any)?.warp?.metricAdapter?.betaDiagnostics?.method === "not-computed",
    },
  ]);
  if (direct) return direct;
  return { value: Number.NaN, source: "missing", proxy: true };
}

function resolveT00Min(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: (pipeline as any)?.T00_min, source: "T00_min" },
    { value: (pipeline as any)?.stressEnergy?.T00_min, source: "stressEnergy.T00_min" },
    { value: (pipeline as any)?.warp?.stressEnergyTensor?.T00_min, source: "warp.stressEnergyTensor.T00_min", proxy: true },
    { value: (pipeline as any)?.warp?.stressEnergy?.T00_min, source: "warp.stressEnergy.T00_min", proxy: true },
    { value: (pipeline as any)?.T00_avg, source: "T00_avg", proxy: true },
  ]);
  if (direct) return direct;
  return { value: Number.NaN, source: "T00_min", proxy: true };
}

function resolveMExotic(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: pipeline?.M_exotic, source: "M_exotic" },
    { value: (pipeline as any)?.M_exotic_kg, source: "M_exotic_kg", proxy: true },
    { value: pipeline?.M_exotic_raw, source: "M_exotic_raw", proxy: true },
    { value: (pipeline as any)?.exoticMass_kg, source: "exoticMass_kg", proxy: true },
    { value: pipeline?.exoticMassTarget_kg, source: "exoticMassTarget_kg", proxy: true },
  ]);
  if (direct) return direct;
  return { value: Number.NaN, source: "M_exotic", proxy: true };
}

function resolveProofPackNumber(
  pack: ProofPack | null | undefined,
  key: string,
  fallbackSource?: string,
): SourcedNumber {
  if (!pack) {
    return { value: Number.NaN, source: fallbackSource ?? key, proxy: true };
  }
  const entry = getProofValue(pack, key);
  const value = readProofNumber(pack, key);
  if (value == null) {
    return { value: Number.NaN, source: entry?.source ?? fallbackSource ?? key, proxy: true };
  }
  return { value, source: entry?.source ?? fallbackSource ?? key, proxy: entry?.proxy ?? false };
}

function resolveGuardrails(
  pipeline: EnergyPipelineState | null,
  tsRatio: number,
  gammaVdB: number,
  contractGuardrails?: {
    fordRoman?: unknown;
    thetaAudit?: unknown;
    tsRatio?: unknown;
    vdbBand?: unknown;
  } | null,
): GuardrailSummary {
  const contractFordRoman = isGuardrailState(contractGuardrails?.fordRoman)
    ? contractGuardrails.fordRoman
    : null;
  const contractThetaAudit = isGuardrailState(contractGuardrails?.thetaAudit)
    ? contractGuardrails.thetaAudit
    : null;
  const contractTsRatio = isGuardrailState(contractGuardrails?.tsRatio)
    ? contractGuardrails.tsRatio
    : null;
  const contractVdbBand = isGuardrailState(contractGuardrails?.vdbBand)
    ? contractGuardrails.vdbBand
    : null;
  const hasContractGuardrails =
    contractFordRoman !== null &&
    contractThetaAudit !== null &&
    contractTsRatio !== null &&
    contractVdbBand !== null;
  if (hasContractGuardrails) {
    const hardFail =
      hasGuardrailFailure(contractFordRoman) || hasGuardrailFailure(contractThetaAudit);
    const tsPenalty = hasGuardrailFailure(contractTsRatio)
      ? Number.isFinite(tsRatio)
        ? clamp01(tsRatio / TS_RATIO_MIN)
        : 0
      : 1;
    const vdbPenalty = hasGuardrailFailure(contractVdbBand) ? 0.7 : 1;
    const multiplier = hardFail ? 0 : tsPenalty * vdbPenalty;
    const proxy = [contractFordRoman, contractThetaAudit, contractTsRatio, contractVdbBand].some(
      (status) => status === "proxy" || status === "missing",
    );
    return {
      fordRoman: contractFordRoman,
      thetaAudit: contractThetaAudit,
      tsRatio: contractTsRatio,
      vdbBand: contractVdbBand,
      multiplier,
      proxy,
      hardPass: contractFordRoman === "ok" && contractThetaAudit === "ok",
      source: "contract",
    };
  }

  const strictCongruence = resolveStrictCongruence(pipeline);
  const qiGuard = (pipeline as any)?.qiGuardrail;
  const qiHasMargin = Number.isFinite(qiGuard?.marginRatio);
  const qiBasePass = qiHasMargin
    ? Number(qiGuard.marginRatio) < 1 &&
      (qiGuard.curvatureEnforced !== true || qiGuard.curvatureOk !== false)
    : null;
  const qiMetricSource = qiSourceIsMetric(qiGuard?.rhoSource);
  const fordRomanFlag = pipeline?.fordRomanCompliance;
  let fordRoman: GuardrailState;
  if (qiBasePass != null) {
    if (strictCongruence) {
      fordRoman = qiBasePass && qiMetricSource ? "ok" : "fail";
    } else {
      fordRoman = qiBasePass
        ? qiMetricSource
          ? "ok"
          : "proxy"
        : "fail";
    }
  } else if (typeof fordRomanFlag === "boolean") {
    fordRoman = strictCongruence
      ? "fail"
      : fordRomanFlag
        ? "ok"
        : "fail";
  } else {
    fordRoman = strictCongruence ? "fail" : "proxy";
  }

  const thetaAuditRaw =
    (pipeline as any)?.uniformsExplain?.thetaAudit ??
    (pipeline as any)?.thetaAudit ??
    (pipeline as any)?.thetaCal;
  const thetaAuditFlag = resolveBooleanStatus(
    (thetaAuditRaw as any)?.status ??
      (thetaAuditRaw as any)?.ok ??
      (thetaAuditRaw as any)?.pass ??
      (thetaAuditRaw as any)?.admissible,
  );
  const thetaValue = firstFinite(
    (pipeline as any)?.theta_audit,
    (pipeline as any)?.theta_geom,
    (thetaAuditRaw as any)?.value,
  );
  const thetaBandPass = Number.isFinite(thetaValue)
    ? Math.abs(thetaValue as number) <= THETA_AUDIT_MAX
    : thetaAuditFlag === true;
  const thetaMetricDerived = (pipeline as any)?.theta_metric_derived === true;
  const thetaAudit: GuardrailState = strictCongruence
    ? thetaMetricDerived && thetaBandPass
      ? "ok"
      : "fail"
    : thetaBandPass
      ? thetaMetricDerived
        ? "ok"
        : "proxy"
      : "fail";

  const tsMetricDerived = (pipeline as any)?.tsMetricDerived === true;
  const tsBandPass = Number.isFinite(tsRatio) && tsRatio >= TS_RATIO_MIN;
  const tsRatioState: GuardrailState = Number.isFinite(tsRatio)
    ? strictCongruence
      ? tsMetricDerived && tsBandPass
        ? "ok"
        : "fail"
      : tsBandPass
        ? tsMetricDerived
          ? "ok"
          : "proxy"
        : "fail"
    : "proxy";

  const vdbGuard = pipeline?.gammaVanDenBroeckGuard;
  const vdbDerivativeSupport = (pipeline as any)?.vdb_two_wall_derivative_support === true;
  const vdbRequiresDerivativeSupport = Number.isFinite(gammaVdB) && gammaVdB > 1 + 1e-6;
  let vdbBand: GuardrailState = "proxy";
  if (
    vdbGuard &&
    Number.isFinite(gammaVdB) &&
    Number.isFinite(vdbGuard.greenBand?.min) &&
    Number.isFinite(vdbGuard.greenBand?.max)
  ) {
    const inBand =
      gammaVdB >= vdbGuard.greenBand.min && gammaVdB <= vdbGuard.greenBand.max;
    const guardPass = vdbGuard.admissible ? vdbGuard.admissible && inBand : inBand;
    const derivativeMissing = vdbRequiresDerivativeSupport && !vdbDerivativeSupport;
    if (strictCongruence) {
      vdbBand = guardPass && !derivativeMissing ? "ok" : "fail";
    } else if (guardPass && derivativeMissing) {
      vdbBand = "proxy";
    } else {
      vdbBand = guardPass ? "ok" : "fail";
    }
  } else if (vdbRequiresDerivativeSupport && !vdbDerivativeSupport) {
    vdbBand = strictCongruence ? "fail" : "proxy";
  }

  const hardFail = fordRoman === "fail" || thetaAudit === "fail";
  const tsPenalty =
    tsRatioState === "fail" && Number.isFinite(tsRatio) ? clamp01(tsRatio / TS_RATIO_MIN) : 1;
  const vdbPenalty = vdbBand === "fail" ? 0.7 : 1;
  const multiplier = hardFail ? 0 : tsPenalty * vdbPenalty;
  const proxy = [fordRoman, thetaAudit, tsRatioState, vdbBand].includes("proxy");
  const hardPass = fordRoman === "ok" && thetaAudit === "ok";

  return {
    fordRoman,
    thetaAudit,
    tsRatio: tsRatioState,
    vdbBand,
    multiplier,
    proxy,
    hardPass,
    source: "pipeline",
  };
}

const resolveGrGuardrails = (pipeline: EnergyPipelineState | null) => {
  const raw =
    (pipeline as any)?.physics?.warp?.viability ??
    (pipeline as any)?.warp?.viability ??
    (pipeline as any)?.viability;
  const snapshot =
    raw?.snapshot ??
    raw?.certificate?.payload?.snapshot ??
    raw?.certificate?.snapshot ??
    (raw as any)?.payload?.snapshot;
  return snapshot?.grGuardrails ?? null;
};

function normalizeKappaTuning(input?: Partial<KappaTuning>): KappaTuning {
  const base = DEFAULT_KAPPA_TUNING;
  const logMinRaw = toFiniteNumber(input?.logMin, base.logMin);
  const logMaxRaw = toFiniteNumber(input?.logMax, base.logMax);
  const [logMin, logMax] =
    logMaxRaw > logMinRaw ? [logMinRaw, logMaxRaw] : [base.logMin, base.logMax];
  const phiMinRaw = toFiniteNumber(input?.phiMin, base.phiMin);
  const phiMaxRaw = toFiniteNumber(input?.phiMax, base.phiMax);
  const [phiMin, phiMax] =
    phiMaxRaw > phiMinRaw ? [phiMinRaw, phiMaxRaw] : [base.phiMin, base.phiMax];
  const warpMinRaw = toFiniteNumber(input?.warpMin, base.warpMin);
  const warpMaxRaw = toFiniteNumber(input?.warpMax, base.warpMax);
  const [warpMin, warpMax] =
    warpMaxRaw > warpMinRaw ? [warpMinRaw, warpMaxRaw] : [base.warpMin, base.warpMax];
  const breathMinRaw = toFiniteNumber(input?.breathMin, base.breathMin);
  const breathMaxRaw = toFiniteNumber(input?.breathMax, base.breathMax);
  const [breathMin, breathMax] =
    breathMaxRaw > breathMinRaw ? [breathMinRaw, breathMaxRaw] : [base.breathMin, base.breathMax];
  const softenMinRaw = toFiniteNumber(input?.softenMin, base.softenMin);
  const softenMaxRaw = toFiniteNumber(input?.softenMax, base.softenMax);
  const [softenMin, softenMax] =
    softenMaxRaw > softenMinRaw
      ? [softenMinRaw, softenMaxRaw]
      : [base.softenMin, base.softenMax];
  const smooth = clamp01(toFiniteNumber(input?.smooth, base.smooth));

  return {
    logMin,
    logMax,
    phiMin,
    phiMax,
    warpMin,
    warpMax,
    breathMin,
    breathMax,
    softenMin,
    softenMax,
    smooth,
  };
}

function mapKappaToUnit(kappa: number, tuning: KappaTuning): number | null {
  if (!Number.isFinite(kappa) || kappa <= 0) return null;
  const logK = Math.log10(kappa);
  if (!Number.isFinite(logK)) return null;
  const denom = tuning.logMax - tuning.logMin;
  if (!Number.isFinite(denom) || denom <= 0) return null;
  return clamp01((logK - tuning.logMin) / denom);
}

function defaultBlendFromTuning(tuning: KappaTuning): number {
  const span = tuning.phiMax - tuning.phiMin;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp01((DEFAULT_VISUALS.phiScale - tuning.phiMin) / span);
}

function computeKappaLengthScale(kappa: number): number | null {
  if (!Number.isFinite(kappa) || kappa <= 0) return null;
  return 1 / Math.sqrt(kappa);
}

function applyKappaDefaults(settings: LatticeSettings) {
  settings.phiScale = DEFAULT_VISUALS.phiScale;
  settings.warpStrength = DEFAULT_VISUALS.warpStrength;
  settings.breathAmp = DEFAULT_VISUALS.breathAmp;
  settings.softening = DEFAULT_VISUALS.softening;
}

function applyKappaBlend(settings: LatticeSettings, blend: number, tuning: KappaTuning) {
  const t = clamp01(blend);
  settings.phiScale = lerp(tuning.phiMin, tuning.phiMax, t);
  settings.warpStrength = lerp(tuning.warpMin, tuning.warpMax, t);
  settings.breathAmp = lerp(tuning.breathMin, tuning.breathMax, t);
  const lengthBlend = 1 - t;
  settings.softening = lerp(tuning.softenMin, tuning.softenMax, lengthBlend);
}

type HullAxesResolution = {
  axes: [number, number, number];
  source: "pipeline" | "authority" | "legacy";
};

function resolveHullAxes(
  pipeline?: EnergyPipelineState | null,
  authorityAxes: [number, number, number] = LEGACY_HULL_AXES,
): HullAxesResolution {
  const hull = (pipeline as any)?.hull ?? {};
  const a = firstFinite(hull?.a, (pipeline as any)?.a);
  const b = firstFinite(hull?.b, (pipeline as any)?.b);
  const c = firstFinite(hull?.c, (pipeline as any)?.c);
  if (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Number.isFinite(c) &&
    (a as number) > 0 &&
    (b as number) > 0 &&
    (c as number) > 0
  ) {
    return { axes: [a as number, b as number, c as number], source: "pipeline" };
  }
  const Lx = firstFinite(hull?.Lx_m, (pipeline as any)?.Lx_m);
  const Ly = firstFinite(hull?.Ly_m, (pipeline as any)?.Ly_m);
  const Lz = firstFinite(hull?.Lz_m, (pipeline as any)?.Lz_m);
  if (
    Number.isFinite(Lx) &&
    Number.isFinite(Ly) &&
    Number.isFinite(Lz) &&
    (Lx as number) > 0 &&
    (Ly as number) > 0 &&
    (Lz as number) > 0
  ) {
    return {
      axes: [(Lx as number) / 2, (Ly as number) / 2, (Lz as number) / 2],
      source: "pipeline",
    };
  }
  const authorityReady = authorityAxes.every((axis) => Number.isFinite(axis) && axis > 0);
  if (authorityReady) {
    return { axes: authorityAxes, source: "authority" };
  }
  return { axes: LEGACY_HULL_AXES, source: "legacy" };
}

function isDefaultHullAxes(
  axes: [number, number, number],
  baselineAxes: [number, number, number] = LEGACY_HULL_AXES,
): boolean {
  return axes.every((axis, idx) => {
    const base = baselineAxes[idx];
    const tol = Math.max(1e-6, Math.abs(base) * DEFAULT_HULL_EPS);
    return Math.abs(axis - base) <= tol;
  });
}

function resolveUserHullChoice(pipeline?: EnergyPipelineState | null): boolean {
  if (!pipeline) return false;
  const preview = pipeline.geometryPreview;
  return Boolean(
    preview?.preview ||
      preview?.mesh ||
      preview?.sdf ||
      preview?.lattice ||
      pipeline.warpGeometryAssetId ||
      pipeline.hullBrick ||
      pipeline.cardRecipe?.geometry?.warpGeometryAssetId ||
      pipeline.cardRecipe?.geometry?.warpGeometryKind,
  );
}

function resolveHullBounds(
  pipeline?: EnergyPipelineState | null,
  authorityAxes: [number, number, number] = LEGACY_HULL_AXES,
): HullBounds {
  const { axes } = resolveHullAxes(pipeline, authorityAxes);
  return {
    axes,
    min: [-axes[0], -axes[1], -axes[2]],
    max: [axes[0], axes[1], axes[2]],
  };
}

function resolveHullWallThickness(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const candidate = pickSourcedNumber([
    { value: (pipeline as any)?.hull?.wallThickness_m, source: "hull.wallThickness_m" },
    { value: (pipeline as any)?.hull?.wallWidth_m, source: "hull.wallWidth_m", proxy: true },
    { value: (pipeline as any)?.wallThickness_m, source: "wallThickness_m", proxy: true },
    { value: (pipeline as any)?.wallWidth_m, source: "wallWidth_m", proxy: true },
  ]);
  const value = Math.max(
    1e-4,
    toFiniteNumber(candidate?.value, DEFAULT_HULL_WALL_THICKNESS),
  );
  return {
    value,
    source: candidate?.source ?? "default",
    proxy: candidate?.proxy ?? true,
  };
}

function resolveBubbleCenter(pipeline?: EnergyPipelineState | null): SourcedVec3 {
  const candidates = [
    { value: (pipeline as any)?.bubble?.center, source: "bubble.center", proxy: false },
    { value: (pipeline as any)?.bubble?.centerMetric, source: "bubble.centerMetric", proxy: true },
    { value: (pipeline as any)?.bubbleCenter, source: "bubbleCenter", proxy: true },
    { value: (pipeline as any)?.center, source: "center", proxy: true },
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate.value) && candidate.value.length >= 3) {
      const cx = Number(candidate.value[0]);
      const cy = Number(candidate.value[1]);
      const cz = Number(candidate.value[2]);
      if ([cx, cy, cz].every((v) => Number.isFinite(v))) {
        return { value: [cx, cy, cz], source: candidate.source, proxy: candidate.proxy };
      }
    }
    if (candidate.value && typeof candidate.value === "object") {
      const cx = Number((candidate.value as any).x);
      const cy = Number((candidate.value as any).y);
      const cz = Number((candidate.value as any).z);
      if ([cx, cy, cz].every((v) => Number.isFinite(v))) {
        return { value: [cx, cy, cz], source: candidate.source, proxy: candidate.proxy };
      }
    }
  }

  return { value: [0, 0, 0], source: "default", proxy: true };
}

function resolveBeta(pipeline?: EnergyPipelineState | null): SourcedNumber {
  const direct = pickSourcedNumber([
    { value: (pipeline as any)?.bubble?.beta, source: "bubble.beta" },
    { value: (pipeline as any)?.beta, source: "beta" },
    { value: (pipeline as any)?.shipBeta, source: "shipBeta", proxy: true },
    { value: (pipeline as any)?.beta_avg, source: "beta_avg", proxy: true },
    { value: (pipeline as any)?.vShip, source: "vShip", proxy: true },
  ]);
  if (direct) {
    return {
      ...direct,
      value: Math.max(0, Math.min(BETA_NEAR_REST_MAX, direct.value)),
    };
  }

  const mode = String(pipeline?.currentMode ?? "").toLowerCase();
  let base = 0.08;
  switch (mode) {
    case "standby":
    case "taxi":
      base = 0.0;
      break;
    case "nearzero":
      base = 0.01;
      break;
    case "hover":
      base = 0.03;
      break;
    case "cruise":
      base = 0.12;
      break;
    case "emergency":
      base = 0.2;
      break;
    default:
      base = 0.08;
      break;
  }
  const betaTrans = clamp01(toFiniteNumber((pipeline as any)?.beta_trans, 1));
  return {
    value: Math.max(0, Math.min(BETA_NEAR_REST_MAX, base * betaTrans)),
    source: `mode:${mode || "default"}`,
    proxy: true,
  };
}

function resolveBubbleParams(
  pipeline: EnergyPipelineState | null,
  axes: [number, number, number],
): BubbleParams {
  const sigmaCandidate = pickSourcedNumber([
    { value: (pipeline as any)?.bubble?.sigma, source: "bubble.sigma" },
    { value: (pipeline as any)?.sigma, source: "sigma" },
    { value: (pipeline as any)?.warp?.sigma, source: "warp.sigma", proxy: true },
    { value: (pipeline as any)?.warp?.bubble?.sigma, source: "warp.bubble.sigma", proxy: true },
  ]);
  const sigmaSource = sigmaCandidate?.source ?? "default";
  const sigmaProxy = sigmaCandidate?.proxy ?? true;
  const sigma = Math.max(1e-4, toFiniteNumber(sigmaCandidate?.value, DEFAULT_BUBBLE_SIGMA));

  const radiusCandidate = pickSourcedNumber([
    { value: (pipeline as any)?.bubble?.R, source: "bubble.R" },
    { value: (pipeline as any)?.bubble?.radius, source: "bubble.radius", proxy: true },
    { value: (pipeline as any)?.R, source: "R", proxy: true },
    { value: (pipeline as any)?.radius, source: "radius", proxy: true },
  ]);
  let R = Number.isFinite(radiusCandidate?.value) ? Math.max(1, radiusCandidate!.value) : Number.NaN;
  let radiusSource = radiusCandidate?.source ?? "geom";
  let radiusProxy = radiusCandidate?.proxy ?? true;
  if (!Number.isFinite(R)) {
    const geom = Math.cbrt(
      Math.max(1e-3, axes[0]) * Math.max(1e-3, axes[1]) * Math.max(1e-3, axes[2]),
    );
    R = Math.max(1, geom);
    radiusSource = "geom";
    radiusProxy = true;
  }

  const beta = resolveBeta(pipeline);
  const center = resolveBubbleCenter(pipeline);

  return {
    R,
    sigma,
    beta: beta.value,
    center: center.value,
    radiusSource,
    sigmaSource,
    betaSource: beta.source,
    centerSource: center.source,
    radiusProxy,
    sigmaProxy,
    betaProxy: beta.proxy,
    centerProxy: center.proxy,
  };
}

type BrickSample = {
  dims: [number, number, number];
  data: Float32Array;
  bounds: HullBounds;
};

type HullFieldSample = {
  sample: BrickSample;
  mode: "dist" | "mask";
  source: string;
  wallThickness: number;
};

type HullVertexField = {
  dist: Float32Array;
  grad: Float32Array;
};

type KijSamples = {
  K_xx: BrickSample;
  K_yy: BrickSample;
  K_zz: BrickSample;
  K_xy: BrickSample;
  K_xz: BrickSample;
  K_yz: BrickSample;
};

type RegionOverlaySample = {
  weights: Float32Array;
  grid: Float32Array;
};

const brickIndex = (x: number, y: number, z: number, nx: number, ny: number) =>
  z * nx * ny + y * nx + x;

function sampleBrickScalar(
  sample: BrickSample,
  pos: [number, number, number],
  outside = 1,
) {
  const [nx, ny, nz] = sample.dims;
  if (nx < 2 || ny < 2 || nz < 2) return outside;
  const { min, max } = sample.bounds;
  const spanX = max[0] - min[0];
  const spanY = max[1] - min[1];
  const spanZ = max[2] - min[2];
  if (!(spanX > 0 && spanY > 0 && spanZ > 0)) return outside;
  const ux = (pos[0] - min[0]) / spanX;
  const uy = (pos[1] - min[1]) / spanY;
  const uz = (pos[2] - min[2]) / spanZ;
  if (ux < 0 || ux > 1 || uy < 0 || uy > 1 || uz < 0 || uz > 1) return outside;
  const fx = Math.min(Math.max(ux * (nx - 1), 0), nx - 1 - 1e-6);
  const fy = Math.min(Math.max(uy * (ny - 1), 0), ny - 1 - 1e-6);
  const fz = Math.min(Math.max(uz * (nz - 1), 0), nz - 1 - 1e-6);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  const data = sample.data;
  const i000 = data[brickIndex(x0, y0, z0, nx, ny)] ?? 0;
  const i100 = data[brickIndex(x1, y0, z0, nx, ny)] ?? 0;
  const i010 = data[brickIndex(x0, y1, z0, nx, ny)] ?? 0;
  const i110 = data[brickIndex(x1, y1, z0, nx, ny)] ?? 0;
  const i001 = data[brickIndex(x0, y0, z1, nx, ny)] ?? 0;
  const i101 = data[brickIndex(x1, y0, z1, nx, ny)] ?? 0;
  const i011 = data[brickIndex(x0, y1, z1, nx, ny)] ?? 0;
  const i111 = data[brickIndex(x1, y1, z1, nx, ny)] ?? 0;
  const ix00 = i000 * (1 - tx) + i100 * tx;
  const ix10 = i010 * (1 - tx) + i110 * tx;
  const ix01 = i001 * (1 - tx) + i101 * tx;
  const ix11 = i011 * (1 - tx) + i111 * tx;
  const ixy0 = ix00 * (1 - ty) + ix10 * ty;
  const ixy1 = ix01 * (1 - ty) + ix11 * ty;
  return ixy0 * (1 - tz) + ixy1 * tz;
}

function sampleBrickForVerts(
  verts: Float32Array,
  sample: BrickSample,
  gridScale: number,
) {
  const [sx, sy, sz] = sample.bounds.axes;
  const { min, max } = sample.bounds;
  const centerX = (min[0] + max[0]) * 0.5;
  const centerY = (min[1] + max[1]) * 0.5;
  const centerZ = (min[2] + max[2]) * 0.5;
  const out = new Float32Array(verts.length / 3);
  const scaleX = gridScale * sx;
  const scaleY = gridScale * sy;
  const scaleZ = gridScale * sz;
  for (let i = 0; i < out.length; i++) {
    const base = i * 3;
    const pos: [number, number, number] = [
      verts[base] * scaleX + centerX,
      verts[base + 1] * scaleY + centerY,
      verts[base + 2] * scaleZ + centerZ,
    ];
    out[i] = sampleBrickScalar(sample, pos, 1);
  }
  return out;
}

const buildRegionWeightMap = (regionStats: GrRegionStats | null) => {
  if (!regionStats || !regionStats.topRegions.length) return null;
  let maxShare = 0;
  for (const region of regionStats.topRegions) {
    maxShare = Math.max(maxShare, region.negShare);
  }
  if (!(maxShare > 0)) return null;
  const map = new Map<number, number>();
  for (const region of regionStats.topRegions) {
    map.set(region.id, clamp01(region.negShare / maxShare));
  }
  return map;
};

const buildRegionOverlayForVerts = ({
  verts,
  gridScale,
  bounds,
  grid,
  hullAxes,
  hullWall,
  weightMap,
}: {
  verts: Float32Array;
  gridScale: number;
  bounds: HullBounds;
  grid: GrRegionStats["grid"] | null;
  hullAxes: [number, number, number];
  hullWall: number;
  weightMap: Map<number, number> | null;
}): RegionOverlaySample => {
  const count = verts.length / 3;
  const weights = new Float32Array(count);
  const gridMask = new Float32Array(count);
  if (!grid) return { weights, grid: gridMask };

  const { min, max, axes } = bounds;
  const centerX = (min[0] + max[0]) * 0.5;
  const centerY = (min[1] + max[1]) * 0.5;
  const centerZ = (min[2] + max[2]) * 0.5;
  const scaleX = gridScale * axes[0];
  const scaleY = gridScale * axes[1];
  const scaleZ = gridScale * axes[2];
  const axisIndex = grid.longAxis === "y" ? 1 : grid.longAxis === "z" ? 2 : 0;
  const axisMin = min[axisIndex];
  const axisSpan = max[axisIndex] - min[axisIndex];
  const phaseIdx =
    typeof grid.phaseBin === "number" && grid.phaseBin >= 0
      ? Math.min(grid.phaseBins - 1, Math.max(0, Math.floor(grid.phaseBin)))
      : 0;
  const shellWidth = Math.max(1e-3, hullWall);

  for (let i = 0; i < count; i += 1) {
    const base = i * 3;
    const px = verts[base] * scaleX + centerX;
    const py = verts[base + 1] * scaleY + centerY;
    const pz = verts[base + 2] * scaleZ + centerZ;

    const axisCoord = axisSpan > 0 ? (axisIndex === 0 ? px : axisIndex === 1 ? py : pz) : 0;
    const long01 = axisSpan > 0 ? clamp01((axisCoord - axisMin) / axisSpan) : 0.5;
    const longIdx = Math.min(grid.longBins - 1, Math.max(0, Math.floor(long01 * grid.longBins)));
    const theta01 = azimuth01(px, pz);
    const thetaIdx = Math.min(grid.thetaBins - 1, Math.max(0, Math.floor(theta01 * grid.thetaBins)));
    let radialIdx = 0;
    let radial01 = 0.5;
    if (grid.radialBins > 1) {
      const pLen = Math.hypot(px, py, pz);
      const dir: [number, number, number] =
        pLen > 1e-9 ? [px / pLen, py / pLen, pz / pLen] : [0, 0, 0];
      const radius = resolveEllipsoidRadius(dir, hullAxes);
      const centerDist = pLen - radius;
      radial01 = clamp01(0.5 + centerDist / Math.max(1e-6, shellWidth * 2));
      radialIdx = Math.min(
        grid.radialBins - 1,
        Math.max(0, Math.floor(radial01 * grid.radialBins)),
      );
    }

    const regionId =
      (((phaseIdx * grid.radialBins + radialIdx) * grid.longBins + longIdx) * grid.thetaBins) +
      thetaIdx;
    const weight = weightMap?.get(regionId) ?? 0;
    weights[i] = weight;

    const thetaLine = gridLineWeight(theta01, grid.thetaBins, REGION_GRID_LINE_WIDTH);
    const longLine = gridLineWeight(long01, grid.longBins, REGION_GRID_LINE_WIDTH);
    const radialLine =
      grid.radialBins > 1 ? gridLineWeight(radial01, grid.radialBins, REGION_GRID_LINE_WIDTH) : 0;
    gridMask[i] = Math.max(thetaLine, longLine, radialLine);
  }
  return { weights, grid: gridMask };
};

const interleaveVec3 = (
  x: Float32Array | null,
  y: Float32Array | null,
  z: Float32Array | null,
) => {
  if (!x || !y || !z) return null;
  const len = Math.min(x.length, y.length, z.length);
  const out = new Float32Array(len * 3);
  for (let i = 0; i < len; i += 1) {
    const base = i * 3;
    out[base] = x[i];
    out[base + 1] = y[i];
    out[base + 2] = z[i];
  }
  return out;
};

const buildShearForVerts = (
  verts: Float32Array,
  samples: KijSamples,
  gridScale: number,
) => {
  const kxx = sampleBrickForVerts(verts, samples.K_xx, gridScale);
  const kyy = sampleBrickForVerts(verts, samples.K_yy, gridScale);
  const kzz = sampleBrickForVerts(verts, samples.K_zz, gridScale);
  const kxy = sampleBrickForVerts(verts, samples.K_xy, gridScale);
  const kxz = sampleBrickForVerts(verts, samples.K_xz, gridScale);
  const kyz = sampleBrickForVerts(verts, samples.K_yz, gridScale);
  const len = Math.min(kxx.length, kyy.length, kzz.length, kxy.length, kxz.length, kyz.length);
  const out = new Float32Array(len * 3);
  for (let i = 0; i < len; i += 1) {
    const base = i * 3;
    const vx = verts[base];
    const vy = verts[base + 1];
    const vz = verts[base + 2];
    const vlen = Math.hypot(vx, vy, vz);
    const nx = vlen > 1e-6 ? vx / vlen : 0;
    const ny = vlen > 1e-6 ? vy / vlen : 0;
    const nz = vlen > 1e-6 ? vz / vlen : 0;
    const sx = kxx[i] * nx + kxy[i] * ny + kxz[i] * nz;
    const sy = kxy[i] * nx + kyy[i] * ny + kyz[i] * nz;
    const sz = kxz[i] * nx + kyz[i] * ny + kzz[i] * nz;
    out[base] = Number.isFinite(sx) ? sx : 0;
    out[base + 1] = Number.isFinite(sy) ? sy : 0;
    out[base + 2] = Number.isFinite(sz) ? sz : 0;
  }
  return out;
};

const toVec3 = (value: unknown): [number, number, number] | null => {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (![x, y, z].every((entry) => Number.isFinite(entry))) return null;
  return [x, y, z];
};

function normalizeBrickDims(dims: unknown): [number, number, number] | null {
  if (!Array.isArray(dims) || dims.length < 3) return null;
  const nx = Math.floor(Number(dims[0]));
  const ny = Math.floor(Number(dims[1]));
  const nz = Math.floor(Number(dims[2]));
  if (![nx, ny, nz].every((value) => Number.isFinite(value) && value >= 2)) return null;
  return [nx, ny, nz];
}

function resolveBrickBounds(brick: any, fallback: HullBounds): HullBounds {
  const bounds = brick?.bounds ?? brick?.meta?.bounds;
  if (bounds) {
    const min = toVec3(bounds.min);
    const max = toVec3(bounds.max);
    if (min && max) {
      const minFixed: [number, number, number] = [
        Math.min(min[0], max[0]),
        Math.min(min[1], max[1]),
        Math.min(min[2], max[2]),
      ];
      const maxFixed: [number, number, number] = [
        Math.max(min[0], max[0]),
        Math.max(min[1], max[1]),
        Math.max(min[2], max[2]),
      ];
      const axes: [number, number, number] = [
        Math.max(1e-6, (maxFixed[0] - minFixed[0]) / 2),
        Math.max(1e-6, (maxFixed[1] - minFixed[1]) / 2),
        Math.max(1e-6, (maxFixed[2] - minFixed[2]) / 2),
      ];
      return { min: minFixed, max: maxFixed, axes };
    }
    const center = toVec3(bounds.center);
    const extent = toVec3(bounds.extent ?? bounds.axes);
    if (center && extent) {
      const axes: [number, number, number] = [
        Math.max(1e-6, Math.abs(extent[0])),
        Math.max(1e-6, Math.abs(extent[1])),
        Math.max(1e-6, Math.abs(extent[2])),
      ];
      const minFixed: [number, number, number] = [
        center[0] - axes[0],
        center[1] - axes[1],
        center[2] - axes[2],
      ];
      const maxFixed: [number, number, number] = [
        center[0] + axes[0],
        center[1] + axes[1],
        center[2] + axes[2],
      ];
      return { min: minFixed, max: maxFixed, axes };
    }
  }
  return fallback;
}

const decodeBase64 = (payload: string): Uint8Array | null => {
  if (!payload) return null;
  if (typeof atob === "function") {
    const binary = atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
  if (typeof Buffer !== "undefined") {
    try {
      const buf = Buffer.from(payload, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }
  return null;
};

const coerceFloat32 = (dataSource: unknown): Float32Array | null => {
  if (!dataSource) return null;
  if (dataSource instanceof Float32Array) return dataSource;
  if (dataSource instanceof ArrayBuffer) return new Float32Array(dataSource);
  if (Array.isArray(dataSource)) return new Float32Array(dataSource);
  if (typeof dataSource === "string") {
    const bytes = decodeBase64(dataSource);
    if (!bytes || bytes.byteLength % 4 !== 0) return null;
    const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Float32Array(view);
  }
  if (ArrayBuffer.isView(dataSource) && dataSource.buffer instanceof ArrayBuffer) {
    if (dataSource.byteLength % 4 !== 0) return null;
    return new Float32Array(dataSource.buffer, dataSource.byteOffset, dataSource.byteLength / 4);
  }
  return null;
};

const deriveGrMetrics = (brick: any, includeGtt: boolean): GrDerivedMetrics | null => {
  const alpha = brick?.channels?.alpha?.data as Float32Array | undefined;
  const betaX = brick?.channels?.beta_x?.data as Float32Array | undefined;
  const betaY = brick?.channels?.beta_y?.data as Float32Array | undefined;
  const betaZ = brick?.channels?.beta_z?.data as Float32Array | undefined;
  const gammaXx = brick?.channels?.gamma_xx?.data as Float32Array | undefined;
  const gammaYy = brick?.channels?.gamma_yy?.data as Float32Array | undefined;
  const gammaZz = brick?.channels?.gamma_zz?.data as Float32Array | undefined;
  const gammaXy = brick?.extraChannels?.gamma_xy?.data as Float32Array | undefined;
  const gammaXz = brick?.extraChannels?.gamma_xz?.data as Float32Array | undefined;
  const gammaYz = brick?.extraChannels?.gamma_yz?.data as Float32Array | undefined;
  const phi = brick?.extraChannels?.phi?.data as Float32Array | undefined;
  const gttChannel = includeGtt
    ? (brick?.channels?.g_tt as { min?: number; max?: number } | undefined) ??
      (brick?.extraChannels?.g_tt as { min?: number; max?: number } | undefined)
    : undefined;
  const gttMinPreset = Number.isFinite(gttChannel?.min) ? (gttChannel?.min as number) : undefined;
  const gttMaxPreset = Number.isFinite(gttChannel?.max) ? (gttChannel?.max as number) : undefined;
  const computeGtt = includeGtt && (gttMinPreset === undefined || gttMaxPreset === undefined);
  if (!alpha || !betaX || !betaY || !betaZ || !gammaXx || !gammaYy || !gammaZz) {
    return null;
  }

  const len = Math.min(
    alpha.length,
    betaX.length,
    betaY.length,
    betaZ.length,
    gammaXx.length,
    gammaYy.length,
    gammaZz.length,
  );
  if (len <= 0) return null;

  let betaMaxAbs = 0;
  let gttMin = Number.POSITIVE_INFINITY;
  let gttMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < len; i += 1) {
    const bx = betaX[i];
    const by = betaY[i];
    const bz = betaZ[i];
    const betaMag = Math.hypot(bx, by, bz);
    if (betaMag > betaMaxAbs) betaMaxAbs = betaMag;
    if (computeGtt) {
      const a = alpha[i];
      const phiVal = phi ? phi[i] ?? 0 : 0;
      const exp4Phi = Number.isFinite(phiVal) ? Math.exp(4 * phiVal) : 1;
      const gxx = exp4Phi * gammaXx[i];
      const gyy = exp4Phi * gammaYy[i];
      const gzz = exp4Phi * gammaZz[i];
      const gxy = exp4Phi * (gammaXy ? gammaXy[i] ?? 0 : 0);
      const gxz = exp4Phi * (gammaXz ? gammaXz[i] ?? 0 : 0);
      const gyz = exp4Phi * (gammaYz ? gammaYz[i] ?? 0 : 0);
      const shiftTerm =
        gxx * bx * bx +
        gyy * by * by +
        gzz * bz * bz +
        2 * (gxy * bx * by + gxz * bx * bz + gyz * by * bz);
      const gtt = -a * a + shiftTerm;
      if (gtt < gttMin) gttMin = gtt;
      if (gtt > gttMax) gttMax = gtt;
    }
  }

  const output: GrDerivedMetrics = { betaMaxAbs };
  if (includeGtt) {
    if (Number.isFinite(gttMinPreset) && Number.isFinite(gttMaxPreset)) {
      output.gttMin = gttMinPreset;
      output.gttMax = gttMaxPreset;
    } else if (Number.isFinite(gttMin) && Number.isFinite(gttMax)) {
      output.gttMin = gttMin;
      output.gttMax = gttMax;
    }
  }
  return output;
};

function buildBrickSample(
  brick: any,
  fallbackBounds: HullBounds,
  channel: string = "alpha",
): BrickSample | null {
  if (!brick) return null;
  const dims = normalizeBrickDims(brick.dims);
  if (!dims) return null;
  const total = dims[0] * dims[1] * dims[2];
  if (!Number.isFinite(total) || total <= 0) return null;
  const channelDataRaw =
    brick.channels?.[channel]?.data ??
    brick.extraChannels?.[channel]?.data ??
    brick.channels?.[channel] ??
    brick.extraChannels?.[channel];
  const channelData = coerceFloat32(channelDataRaw);
  if (!channelData || channelData.length < total) return null;
  return {
    dims,
    data: channelData,
    bounds: resolveBrickBounds(brick, fallbackBounds),
  };
}

function buildClockRateSample(
  brick: any,
  fallbackBounds: HullBounds,
  mode: ClockRateMode,
  chart: ViewerChartMode,
): BrickSample | null {
  const preferGtt = chart === "mp_like";
  if (mode !== "static" && !preferGtt) {
    return buildBrickSample(brick, fallbackBounds, "alpha");
  }
  const staticSample = buildBrickSample(brick, fallbackBounds, "clockRate_static");
  if (mode === "static" && staticSample) return staticSample;
  const gttSample = buildBrickSample(brick, fallbackBounds, "g_tt");
  if (!gttSample) return buildBrickSample(brick, fallbackBounds, "alpha");
  const data = new Float32Array(gttSample.data.length);
  for (let i = 0; i < data.length; i += 1) {
    const gtt = gttSample.data[i];
    const rate = Math.sqrt(Math.max(0, -gtt));
    data[i] = Number.isFinite(rate) ? rate : 0;
  }
  return {
    dims: gttSample.dims,
    data,
    bounds: gttSample.bounds,
  };
}

function buildHullFieldSample(
  brick: any,
  fallbackBounds: HullBounds,
  wallThickness: number,
): HullFieldSample | null {
  const distSample = buildBrickSample(brick, fallbackBounds, "hullDist");
  if (distSample) {
    return { sample: distSample, mode: "dist", source: "hullDist", wallThickness };
  }
  const maskSample = buildBrickSample(brick, fallbackBounds, "hullMask");
  if (maskSample) {
    return { sample: maskSample, mode: "mask", source: "hullMask", wallThickness };
  }
  return null;
}

function sampleHullFieldScalar(
  sample: BrickSample,
  pos: [number, number, number],
  mode: "dist" | "mask",
  wallThickness: number,
  outside: number,
) {
  const raw = sampleBrickScalar(sample, pos, outside);
  if (mode === "mask") {
    const mask = clamp01(raw);
    return (0.5 - mask) * 2 * wallThickness;
  }
  return raw;
}

function sampleHullFieldForVerts(
  verts: Float32Array,
  field: HullFieldSample,
  gridScale: number,
): HullVertexField {
  const { sample, mode, wallThickness } = field;
  const [sx, sy, sz] = sample.bounds.axes;
  const { min, max } = sample.bounds;
  const centerX = (min[0] + max[0]) * 0.5;
  const centerY = (min[1] + max[1]) * 0.5;
  const centerZ = (min[2] + max[2]) * 0.5;
  const spanX = max[0] - min[0];
  const spanY = max[1] - min[1];
  const spanZ = max[2] - min[2];
  const dx = spanX > 0 ? spanX / Math.max(1, sample.dims[0] - 1) : 1;
  const dy = spanY > 0 ? spanY / Math.max(1, sample.dims[1] - 1) : 1;
  const dz = spanZ > 0 ? spanZ / Math.max(1, sample.dims[2] - 1) : 1;
  const outside = mode === "mask" ? 0 : Math.max(sx, sy, sz);
  const outDist = new Float32Array(verts.length / 3);
  const outGrad = new Float32Array(verts.length);
  const scaleX = gridScale * sx;
  const scaleY = gridScale * sy;
  const scaleZ = gridScale * sz;
  for (let i = 0; i < outDist.length; i++) {
    const base = i * 3;
    const pos: [number, number, number] = [
      verts[base] * scaleX + centerX,
      verts[base + 1] * scaleY + centerY,
      verts[base + 2] * scaleZ + centerZ,
    ];
    const dist = sampleHullFieldScalar(sample, pos, mode, wallThickness, outside);
    const dxVal =
      sampleHullFieldScalar(sample, [pos[0] + dx, pos[1], pos[2]], mode, wallThickness, outside) -
      sampleHullFieldScalar(sample, [pos[0] - dx, pos[1], pos[2]], mode, wallThickness, outside);
    const dyVal =
      sampleHullFieldScalar(sample, [pos[0], pos[1] + dy, pos[2]], mode, wallThickness, outside) -
      sampleHullFieldScalar(sample, [pos[0], pos[1] - dy, pos[2]], mode, wallThickness, outside);
    const dzVal =
      sampleHullFieldScalar(sample, [pos[0], pos[1], pos[2] + dz], mode, wallThickness, outside) -
      sampleHullFieldScalar(sample, [pos[0], pos[1], pos[2] - dz], mode, wallThickness, outside);
    const len = Math.hypot(dxVal, dyVal, dzVal);
    outDist[i] = dist;
    outGrad[base] = len > 1e-6 ? dxVal / len : 0;
    outGrad[base + 1] = len > 1e-6 ? dyVal / len : 0;
    outGrad[base + 2] = len > 1e-6 ? dzVal / len : 0;
  }
  return { dist: outDist, grad: outGrad };
}

function TimeDilationLatticePanelInner({
  className,
  pipeline,
  kappaTuning,
  showDebug = false,
}: TimeDilationLatticePanelProps) {
  const { state: nhm2SolveState } = useNhm2SolveState();
  const { data: pipelineSnapshot } = useEnergyPipeline({
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
  const contractQuery = useGrConstraintContract({ enabled: true, refetchInterval: 2000 });
  const { data: proofPack } = useProofPack({ refetchInterval: 1500, staleTime: 5000 });
  const pipelineState = pipeline ?? pipelineSnapshot ?? null;
  const authorityHullAxes = useMemo<[number, number, number]>(
    () => [
      nhm2SolveState.geometry.authority.Lx_m / 2,
      nhm2SolveState.geometry.authority.Ly_m / 2,
      nhm2SolveState.geometry.authority.Lz_m / 2,
    ],
    [
      nhm2SolveState.geometry.authority.Lx_m,
      nhm2SolveState.geometry.authority.Ly_m,
      nhm2SolveState.geometry.authority.Lz_m,
    ],
  );
  const hullAxesResolution = useMemo(
    () => resolveHullAxes(pipelineState, authorityHullAxes),
    [pipelineState, authorityHullAxes],
  );
  const strictCongruence = resolveStrictCongruence(pipelineState);
  const proofNum = (key: string) => readProofNumber(proofPack, key);
  const proofStr = (key: string) => readProofString(proofPack, key);
  const proofProxyFrom = (keys: string[]) =>
    !proofPack || keys.some((key) => Boolean(getProofValue(proofPack, key)?.proxy));
  const canonicalFamily =
    proofStr("warp_canonical_family") ??
    (pipelineState as any)?.warp?.metricT00Contract?.family ??
    "unknown";
  const latticeMetricOnly = strictCongruence && canonicalFamily === "natario";
  const wallInvariant = useMemo<"kretschmann" | "ricci4">(
    () => (latticeMetricOnly ? "ricci4" : "kretschmann"),
    [latticeMetricOnly],
  );
  const natarioCanonicalDiagnostics = useMemo(() => {
    const diagnosticsCanonical = (pipelineState as any)?.diagnostics?.natarioCanonical;
    const payloadCanonical = (pipelineState as any)?.natarioCanonical;
    const natarioCanonical = diagnosticsCanonical ?? payloadCanonical ?? null;
    const checkDiv = natarioCanonical?.checks?.divBeta;
    const checkThetaK = natarioCanonical?.checks?.thetaKConsistency;
    const requiredFieldsOk = natarioCanonical?.requiredFieldsOk === true;
    const reason =
      typeof natarioCanonical?.reason === "string" && natarioCanonical.reason.trim().length > 0
        ? natarioCanonical.reason
        : null;
    return {
      requiredFieldsOk,
      reason,
      canonicalSatisfied: natarioCanonical?.canonicalSatisfied === true,
      divBeta: {
        status: typeof checkDiv?.status === "string" ? checkDiv.status : "unknown",
        rms: Number.isFinite(Number(checkDiv?.rms)) ? Number(checkDiv.rms) : null,
        maxAbs: Number.isFinite(Number(checkDiv?.maxAbs)) ? Number(checkDiv.maxAbs) : null,
      },
      thetaK: {
        status: typeof checkThetaK?.status === "string" ? checkThetaK.status : "unknown",
        theta: Number.isFinite(Number(checkThetaK?.theta)) ? Number(checkThetaK.theta) : null,
        kTrace: Number.isFinite(Number(checkThetaK?.kTrace)) ? Number(checkThetaK.kTrace) : null,
        residualAbs: Number.isFinite(Number(checkThetaK?.residualAbs)) ? Number(checkThetaK.residualAbs) : null,
      },
    };
  }, [pipelineState]);

  const strictMetricMissing = useMemo(() => {
    if (!latticeMetricOnly) return false;
    const requirePresent = (key: string) => {
      const entry = getProofValue(proofPack, key);
      return !entry || entry.proxy;
    };
    const requireTrue = (key: string) => {
      const entry = getProofValue(proofPack, key);
      if (!entry || entry.proxy) return true;
      return entry.value !== true;
    };
    return (
      requirePresent("metric_t00_rho_si_mean") ||
      requirePresent("metric_k_trace_mean") ||
      requirePresent("metric_k_sq_mean") ||
      requirePresent("theta_geom") ||
      requireTrue("metric_t00_contract_ok") ||
      requireTrue("theta_metric_derived") ||
      requireTrue("qi_metric_derived") ||
      requireTrue("ts_metric_derived")
    );
  }, [latticeMetricOnly, proofPack]);
  const contractGuardrails = contractQuery.data?.guardrails ?? null;
  const contractGuardrailSource = contractQuery.data?.sources?.grDiagnostics ?? "missing";
  const displayGuardrails = useMemo(() => {
    const tsRatio = resolveTSRatio(pipelineState).value;
    const gammaVdB = resolveGammaVdB(pipelineState).value;
    return resolveGuardrails(pipelineState, tsRatio, gammaVdB, contractGuardrails);
  }, [pipelineState, contractGuardrails]);
  const displayGuardrailSource =
    displayGuardrails.source === "contract"
      ? contractGuardrailSource
      : "pipeline-derived";
  const contractGuardrailBadgeClass = useMemo(() => {
    const statuses: GuardrailState[] = [
      displayGuardrails.fordRoman,
      displayGuardrails.thetaAudit,
      displayGuardrails.tsRatio,
      displayGuardrails.vdbBand,
    ];
    if (statuses.some((status) => status === "fail" || status === "missing")) {
      return "border border-rose-500/40 bg-rose-500/10 text-rose-200";
    }
    if (statuses.some((status) => status === "proxy")) {
      return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
    }
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }, [displayGuardrails]);
  const tsMetricDerived =
    typeof (pipelineState as any)?.tsMetricDerived === "boolean"
      ? Boolean((pipelineState as any).tsMetricDerived)
      : typeof (pipelineState as any)?.clocking?.metricDerived === "boolean"
        ? Boolean((pipelineState as any).clocking.metricDerived)
        : typeof (pipelineState as any)?.ts?.metricDerived === "boolean"
          ? Boolean((pipelineState as any).ts.metricDerived)
          : null;
  const tsMetricSource =
    (pipelineState as any)?.tsMetricSource ??
    (pipelineState as any)?.clocking?.metricDerivedSource ??
    (pipelineState as any)?.ts?.metricDerivedSource ??
    null;
  const tsMetricReason =
    (pipelineState as any)?.tsMetricReason ??
    (pipelineState as any)?.clocking?.metricDerivedReason ??
    (pipelineState as any)?.ts?.metricDerivedReason ??
    null;
  const tsMetricBadgeClass =
    tsMetricDerived === true
      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tsMetricDerived === false
        ? "border border-rose-500/40 bg-rose-500/10 text-rose-200"
        : "border border-amber-500/40 bg-amber-500/10 text-amber-200";
  const tsMetricBadgeLabel =
    tsMetricDerived === true
      ? "TS metric-derived"
      : tsMetricDerived === false
        ? "TS proxy/hardware"
        : "TS metric n/a";
  const hullBounds = useMemo(
    () => resolveHullBounds(pipelineState, authorityHullAxes),
    [pipelineState, authorityHullAxes],
  );
  const hullDims = useMemo(
    () => ({
      Lx_m: hullBounds.axes[0] * 2,
      Ly_m: hullBounds.axes[1] * 2,
      Lz_m: hullBounds.axes[2] * 2,
    }),
    [hullBounds],
  );
  const updatePipeline = useUpdatePipeline();
  const lapseQuery = useLapseBrick({ quality: "low", refetchMs: 2000 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const releaseContextRef = useRef<() => void>(() => {});
  const progRef = useRef<WebGLProgram | null>(null);
  const lineVboRef = useRef<WebGLBuffer | null>(null);
  const nodeVboRef = useRef<WebGLBuffer | null>(null);
  const lineAlphaVboRef = useRef<WebGLBuffer | null>(null);
  const nodeAlphaVboRef = useRef<WebGLBuffer | null>(null);
  const lineThetaVboRef = useRef<WebGLBuffer | null>(null);
  const nodeThetaVboRef = useRef<WebGLBuffer | null>(null);
  const lineHullVboRef = useRef<WebGLBuffer | null>(null);
  const nodeHullVboRef = useRef<WebGLBuffer | null>(null);
  const lineHullDirVboRef = useRef<WebGLBuffer | null>(null);
  const nodeHullDirVboRef = useRef<WebGLBuffer | null>(null);
  const lineBetaVboRef = useRef<WebGLBuffer | null>(null);
  const nodeBetaVboRef = useRef<WebGLBuffer | null>(null);
  const lineGammaVboRef = useRef<WebGLBuffer | null>(null);
  const nodeGammaVboRef = useRef<WebGLBuffer | null>(null);
  const lineShearVboRef = useRef<WebGLBuffer | null>(null);
  const nodeShearVboRef = useRef<WebGLBuffer | null>(null);
  const lineConstraintVboRef = useRef<WebGLBuffer | null>(null);
  const nodeConstraintVboRef = useRef<WebGLBuffer | null>(null);
  const lineRegionVboRef = useRef<WebGLBuffer | null>(null);
  const nodeRegionVboRef = useRef<WebGLBuffer | null>(null);
  const lineRegionGridVboRef = useRef<WebGLBuffer | null>(null);
  const nodeRegionGridVboRef = useRef<WebGLBuffer | null>(null);
  const renderEnabledRef = useRef(true);
  const lastDiagnosticsPublishRef = useRef(0);
  const [glStatus, setGlStatus] = useState<"ok" | "no-webgl" | "compile-fail" | "context-lost">("ok");
  const [glError, setGlError] = useState<string | null>(null);
  const [glEpoch, setGlEpoch] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [certifiedMode, setCertifiedMode] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(showDebug);
  const debugBlocked = latticeMetricOnly && strictMetricMissing;
  const debugAutoPublish = import.meta.env.VITE_LATTICE_DEBUG_PUSH === "1";
  const debugOverlayEnabled = debugEnabled && !debugBlocked;
  const debugAllowed = (debugEnabled || debugAutoPublish) && !debugBlocked;
  const [grControlsEnabled, setGrControlsEnabled] = useState(false);
  const [visualControlsEnabled, setVisualControlsEnabled] = useState(false);
  const [regionControlsEnabled, setRegionControlsEnabled] = useState(false);
  const [clockMode, setClockMode] = useState<ClockRateMode>("eulerian");
  const [viewerChart, setViewerChart] = useState<ViewerChartMode>("adm");
  const [grEnabled, setGrEnabled] = useState(true);
  const [grAutoRefresh, setGrAutoRefresh] = useState(false);
  const [grQuality, setGrQuality] = useState<CurvatureQuality>("high");
  const [grTargetDx, setGrTargetDx] = useState(GR_TARGET_DX_M);
  const [grSteps, setGrSteps] = useState(GR_DEFAULT_STEPS);
  const [grDt, setGrDt] = useState(GR_DEFAULT_DT_S);
  const [grIterations, setGrIterations] = useState(0);
  const [grTolerance, setGrTolerance] = useState(0);
  const [grShockMode, setGrShockMode] = useState<"off" | "diagnostic" | "stabilize">("off");
  const [grAdvectScheme, setGrAdvectScheme] = useState<"centered" | "upwind1">("centered");
  const [grIncludeExtra, setGrIncludeExtra] = useState(false);
  const [grIncludeMatter, setGrIncludeMatter] = useState(false);
  const [grIncludeKij, setGrIncludeKij] = useState(true);
  const [exploratoryOverride, setExploratoryOverride] = useState(false);
  const [cinematicOverride, setCinematicOverride] = useState(false);
  const [natarioGeometryWarp, setNatarioGeometryWarp] = useState(true);
  const natarioGeometryWarpEffective = strictCongruence ? true : natarioGeometryWarp;
  const [regionEnabled, setRegionEnabled] = useState(false);
  const [regionAutoRefresh, setRegionAutoRefresh] = useState(false);
  const [regionSource, setRegionSource] = useState<"auto" | "gr" | "stress">("auto");
  const [regionTargetDx, setRegionTargetDx] = useState(REGION_TARGET_DX_M);
  const [regionTargetRegions, setRegionTargetRegions] = useState(400);
  const [regionThetaBins, setRegionThetaBins] = useState(0);
  const [regionLongBins, setRegionLongBins] = useState(0);
  const [regionPhaseBins, setRegionPhaseBins] = useState(8);
  const [regionRadialBins, setRegionRadialBins] = useState(1);
  const [regionTopN, setRegionTopN] = useState(8);
  const [regionGridOverlay, setRegionGridOverlay] = useState(false);
  const [regionTintEnabled, setRegionTintEnabled] = useState(false);
  const [regionTintScale, setRegionTintScale] = useState(REGION_TINT_SCALE_DEFAULT);
  const [regionArrowEnabled, setRegionArrowEnabled] = useState(false);
  const [visualTuning, setVisualTuning] = useState(DEFAULT_VISUAL_TUNING);
  const [localSectorControlLiveEvent, setLocalSectorControlLiveEvent] = useState<SectorControlLiveEvent | null>(null);
  const [liveNowTs, setLiveNowTs] = useState(() => Date.now());
  const sectorControlLiveQuery = useSectorControlLive(3000);
  const [lastReloadEvent, setLastReloadEvent] = useState<{ reason: string; ts: number } | null>(null);
  useEffect(() => {
    const handlerIds: string[] = [];
    handlerIds.push(
      subscribe("warp:sector-control:plan", (payload: unknown) => {
        const next = normalizeSectorControlLiveEvent(payload);
        if (!next) return;
        setLocalSectorControlLiveEvent((prev) => (next.ts >= (prev?.ts ?? -1) ? next : prev));
      }),
    );
    handlerIds.push(
      subscribe("warp:reload", (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const raw = payload as Record<string, unknown>;
        const reason = typeof raw.reason === "string" ? raw.reason : "unknown";
        const ts = parseFiniteNumber(raw.ts) ?? Date.now();
        setLastReloadEvent({ reason, ts });
        const preflight =
          raw.preflight && typeof raw.preflight === "object"
            ? normalizeSectorControlLiveEvent({
                ...(raw.preflight as Record<string, unknown>),
                requestedMode:
                  typeof raw.requestedMode === "string" ? raw.requestedMode : undefined,
                appliedMode: typeof raw.appliedMode === "string" ? raw.appliedMode : undefined,
                ts,
              })
            : null;
        if (preflight) {
          setLocalSectorControlLiveEvent((prev) =>
            preflight.ts >= (prev?.ts ?? -1) ? preflight : prev,
          );
        }
      }),
    );
    return () => {
      handlerIds.forEach((id) => unsubscribe(id));
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setLiveNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const serverSectorControlLiveEvent = useMemo(() => {
    const event = sectorControlLiveQuery.data?.event;
    if (!event) return null;
    return normalizeSectorControlLiveEvent(event);
  }, [sectorControlLiveQuery.data]);

  const sectorControlLiveEvent = useMemo<SectorControlLiveEventEnvelope | null>(() => {
    const localTs = localSectorControlLiveEvent?.ts ?? -1;
    const serverTs = serverSectorControlLiveEvent?.ts ?? -1;
    if (serverTs >= localTs && serverSectorControlLiveEvent) {
      return { ...serverSectorControlLiveEvent, source: "server" };
    }
    if (localSectorControlLiveEvent) {
      return { ...localSectorControlLiveEvent, source: "local" };
    }
    return null;
  }, [localSectorControlLiveEvent, serverSectorControlLiveEvent]);

  const mathGraphQuery = useQuery({
    queryKey: ["/api/helix/math/graph"],
    staleTime: 30_000,
  });
  const mathGraph = mathGraphQuery.data as MathGraphResponse | undefined;
  const mathNodeIndex = useMemo(
    () => buildMathNodeIndex(mathGraph?.root),
    [mathGraph?.root],
  );
  const pipelinePreview = useMemo(
    () => ((pipelineState as any)?.geometryPreview?.preview as HullPreviewPayload | null) ?? null,
    [pipelineState],
  );
  const previewArtifacts = useMemo(() =>
    pipelinePreview ? buildPreviewArtifacts(pipelinePreview) : null,
    [pipelinePreview],
  );
  const geometryPreviewHash =
    (pipelineState as any)?.geometryPreview?.mesh?.meshHash ??
    (pipelineState as any)?.geometryPreview?.preview?.meshHash ??
    null;
  const diagnosticsHashes = useMemo(() => {
    const lattice = previewArtifacts?.previewLattice ?? null;
    const sdf = previewArtifacts?.previewSdf ?? null;
    const mesh = previewArtifacts?.previewMesh ?? null;
    return {
      mesh_hash: mesh?.meshHash ?? geometryPreviewHash ?? null,
      lattice_hashes: lattice?.hashes ?? null,
      lattice_enabled: lattice?.enabled ?? null,
      sdf_hash: sdf?.hash ?? lattice?.hashes?.sdf ?? null,
    };
  }, [previewArtifacts, geometryPreviewHash]);
  const readyRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const activationRef = useRef(0);
  const activationTargetRef = useRef(0);
  const visualTuningRef = useRef(visualTuning);
  const regionVisualRef = useRef({
    grid: regionGridOverlay,
    tint: regionTintEnabled,
    tintScale: regionTintScale,
  });
  const regionStatsRef = useRef({ hasGrid: false, hasTint: false });
  const grAutoKickRef = useRef(false);

  const grDims = useMemo(() => {
    const bounds = resolveHullBounds(pipelineState, authorityHullAxes);
    const dx = Math.max(1e-3, grTargetDx);
    return [
      Math.max(1, Math.ceil((bounds.axes[0] * 2) / dx)),
      Math.max(1, Math.ceil((bounds.axes[1] * 2) / dx)),
      Math.max(1, Math.ceil((bounds.axes[2] * 2) / dx)),
    ] as [number, number, number];
  }, [pipelineState, authorityHullAxes, grTargetDx]);
  const includeKijResolved = grIncludeKij || grIncludeExtra;
  const includeMatterResolved = grIncludeMatter || grIncludeExtra;
  const certifiedModeEnabled = latticeMetricOnly ? certifiedMode : true;
  const grRequested = certifiedModeEnabled ? (grEnabled || grAutoRefresh) : false;
  const gateRequirements = useMemo(() => {
    const entries: Array<{ module: string; minStage: MathStageLabel }> = [
      { module: "server/energy-pipeline.ts", minStage: "reduced-order" },
    ];
    if (grRequested) {
      entries.push({
        module: "server/gr-evolve-brick.ts",
        minStage: "diagnostic",
      });
    }
    return entries;
  }, [grRequested]);
  const mathStageOKBase = useMemo(() => {
    const hasGraph = Boolean(mathGraph?.root);
    if (!hasGraph) return false;
    for (const entry of gateRequirements) {
      const stage = mathNodeIndex.get(entry.module)?.stage ?? "unstaged";
      if (!meetsStage(stage, entry.minStage)) return false;
    }
    return true;
  }, [gateRequirements, mathGraph?.root, mathNodeIndex]);
  const mathStageOK = latticeMetricOnly ? true : mathStageOKBase;
  const grQuery = useGrBrick({
    quality: grQuality,
    dims: grDims,
    steps: grSteps > 0 ? grSteps : undefined,
    dt_s: grDt > 0 ? grDt : undefined,
    iterations: grIterations > 0 ? grIterations : undefined,
    tolerance: grTolerance > 0 ? grTolerance : undefined,
    shockMode: grShockMode,
    advectScheme: grAdvectScheme,
    includeExtra: grIncludeExtra,
    includeMatter: includeMatterResolved,
    includeKij: includeKijResolved,
    refetchMs: grAutoRefresh ? 5000 : 0,
    enabled: grRequested,
  });
  useEffect(() => {
    if (!strictCongruence) return;
    if (!grRequested) return;
    if (grQuery.data || grQuery.isFetching) return;
    if (grAutoKickRef.current) return;
    grAutoKickRef.current = true;
    grQuery.refetch();
  }, [strictCongruence, grRequested, grQuery.data, grQuery.isFetching, grQuery.refetch]);
  const regionDims = useMemo(() => {
    const bounds = resolveHullBounds(pipelineState, authorityHullAxes);
    const dx = Math.max(1e-3, regionTargetDx);
    return [
      Math.max(1, Math.ceil((bounds.axes[0] * 2) / dx)),
      Math.max(1, Math.ceil((bounds.axes[1] * 2) / dx)),
      Math.max(1, Math.ceil((bounds.axes[2] * 2) / dx)),
    ] as [number, number, number];
  }, [pipelineState, authorityHullAxes, regionTargetDx]);
  const regionRequested = regionEnabled || regionAutoRefresh;
    const regionQuery = useGrRegionStats({
      dims: regionDims,
      source: regionSource,
      wallInvariant,
      targetRegions: regionTargetRegions,
      thetaBins: regionThetaBins > 0 ? regionThetaBins : undefined,
      longBins: regionLongBins > 0 ? regionLongBins : undefined,
      phaseBins: regionPhaseBins > 0 ? regionPhaseBins : undefined,
      radialBins: regionRadialBins > 0 ? regionRadialBins : undefined,
      topN: regionTopN,
      maxVoxels: REGION_MAX_VOXELS,
      shockMode: grShockMode,
      advectScheme: grAdvectScheme,
      refetchMs: regionAutoRefresh ? 5000 : 0,
      enabled: regionRequested,
    });
    const regionStats = regionQuery.data ?? null;
  const grEstimate = useMemo(() => {
    const voxels = Math.max(0, grDims[0] * grDims[1] * grDims[2]);
    const channelCount = 22 + (includeKijResolved ? 6 : 0) + (includeMatterResolved ? 10 : 0);
    return {
      voxels,
      channelCount,
      bytes: voxels * channelCount * 4,
    };
  }, [grDims, includeKijResolved, includeMatterResolved]);
  const regionEstimate = useMemo(() => {
    const voxels = Math.max(0, regionDims[0] * regionDims[1] * regionDims[2]);  
    return {
      voxels,
      bytes: voxels * 4,
    };
  }, [regionDims]);

  const lineVerts = useMemo(() => makeLatticeSegments(GRID_DIV), []);
  const nodeVerts = useMemo(() => makeLatticeNodes(GRID_DIV), []);
  const lineCount = lineVerts.length / 3;
  const nodeCount = nodeVerts.length / 3;

  const gridScale = 1.2;
  const grAssistantQuery = useGrAssistantReport({
    brick: grQuery.data ?? null,
    pipeline: pipelineState,
    enabled: grRequested && (grControlsEnabled || debugAllowed),
    refetchMs: grAutoRefresh ? 5000 : 0,
    runArtifacts: false,
    runChecks: true,
    runInvariants: true,
    vacuumEpsilon: 1e-8,
    gridScale,
    gridDiv: GRID_DIV,
  });
  const diagnosticsTraceId =
    grAssistantQuery.data?.training_trace_id ??
    grAssistantQuery.data?.trace_id ??
    null;
  const driveDir = useMemo(() => normalizeDir((pipelineState as any)?.driveDir), [pipelineState]);
  const driveDirRef = useRef(driveDir);
  useEffect(() => {
    driveDirRef.current = driveDir;
  }, [driveDir]);
  const contractionVector = regionStats?.summary?.contractionVector ?? null;
  const contractionMagnitude = Number(regionStats?.summary?.contractionMagnitude ?? 0);
  const contractionSide = useMemo(
    () => describeContractionSide(contractionVector, driveDir),
    [contractionVector, driveDir],
  );
  const contractionAngle = useMemo(
    () => computeContractionAngle(contractionVector, driveDir),
    [contractionVector, driveDir],
  );
  const showContractionArrow =
    regionArrowEnabled && Boolean(contractionVector) && contractionMagnitude > 0;

  const hullWall = useMemo(() => resolveHullWallThickness(pipelineState), [pipelineState]);

  const settingsRef = useRef<LatticeSettings>({
    gridScale,
    phiScale: DEFAULT_VISUALS.phiScale,
    alphaMin: 0.3,
    softening: DEFAULT_VISUALS.softening,
    warpStrength: DEFAULT_VISUALS.warpStrength,
    breathAmp: DEFAULT_VISUALS.breathAmp,
    breathRate: 0.8,
    pulseRate: 1.2,
    pointSize: 6.0,
  });

  const hullBrickPayload = useMemo(() => {
    const pipelineHullBrick = (pipelineState as any)?.hullBrick;
    const lapseHullBrick = (lapseQuery.data as any)?.hullBrick;
    return pipelineHullBrick ?? lapseHullBrick ?? lapseQuery.data;
  }, [pipelineState, lapseQuery.data]);

  const hullField = useMemo(
    () => buildHullFieldSample(hullBrickPayload, hullBounds, hullWall.value),
    [hullBrickPayload, hullBounds, hullWall.value],
  );

  const latticeBounds = useMemo(
    () => hullField?.sample.bounds ?? hullBounds,
    [hullField, hullBounds],
  );
  const latticeBoundsRef = useRef(latticeBounds);
  useEffect(() => {
    latticeBoundsRef.current = latticeBounds;
  }, [latticeBounds]);

  const regionOverlayBounds = useMemo(() => {
    const bounds = regionStats?.geometry?.bounds;
    if (bounds && Array.isArray(bounds.min) && Array.isArray(bounds.max)) {
      const min: [number, number, number] = [
        Number(bounds.min[0]),
        Number(bounds.min[1]),
        Number(bounds.min[2]),
      ];
      const max: [number, number, number] = [
        Number(bounds.max[0]),
        Number(bounds.max[1]),
        Number(bounds.max[2]),
      ];
      if (min.every((value) => Number.isFinite(value)) && max.every((value) => Number.isFinite(value))) {
        return buildBoundsFromMinMax(min, max);
      }
    }
    return latticeBounds;
  }, [regionStats, latticeBounds]);
    const regionOverlayHull = useMemo(() => {
      const hull = regionStats?.geometry?.hull;
      if (hull) {
        const axes: [number, number, number] = [hull.Lx_m / 2, hull.Ly_m / 2, hull.Lz_m / 2];
        return {
          axes,
          wallThickness: hull.wallThickness_m ?? hullWall.value,
        };
      }
      const axes: [number, number, number] = [
        latticeBounds.axes[0],
        latticeBounds.axes[1],
        latticeBounds.axes[2],
      ];
      return {
        axes,
        wallThickness: hullWall.value,
      };
    }, [regionStats, latticeBounds, hullWall.value]);
  const regionWeightMap = useMemo(() => buildRegionWeightMap(regionStats), [regionStats]);

  const hullThickness = useMemo(() => {
    const base = Math.max(HULL_CONTOUR_MIN, hullWall.value * HULL_CONTOUR_SCALE);
    const maxAllowed = Math.max(
      HULL_CONTOUR_MIN,
      Math.min(latticeBounds.axes[0], latticeBounds.axes[1], latticeBounds.axes[2]) * 0.5,
    );
    return Math.min(base, maxAllowed);
  }, [hullWall.value, latticeBounds.axes]);
  const hullThicknessRef = useRef(hullThickness);
  useEffect(() => {
    hullThicknessRef.current = hullThickness;
  }, [hullThickness]);

  const bubbleParams = useMemo(
    () => resolveBubbleParams(pipelineState, latticeBounds.axes),
    [pipelineState, latticeBounds],
  );
  const bubbleRef = useRef<BubbleParams>(bubbleParams);
  useEffect(() => {
    bubbleRef.current = bubbleParams;
  }, [bubbleParams]);
  useEffect(() => {
    visualTuningRef.current = visualTuning;
  }, [visualTuning]);
  useEffect(() => {
    regionVisualRef.current = {
      grid: regionGridOverlay,
      tint: regionTintEnabled,
      tintScale: regionTintScale,
    };
  }, [regionGridOverlay, regionTintEnabled, regionTintScale]);
  useEffect(() => {
    regionStatsRef.current = {
      hasGrid: Boolean(regionStats?.grid),
      hasTint: Boolean(regionStats?.topRegions?.length),
    };
  }, [regionStats]);

  const grGuardrails = useMemo(() => resolveGrGuardrails(pipelineState), [pipelineState]);
  const grProxy = Boolean(grGuardrails?.proxy);
  const brickMeta = useMemo(() => {
    return grQuery.data?.meta ?? (pipelineState as any)?.gr?.meta ?? null;
  }, [grQuery.data, pipelineState]);
  const solverHealth = useMemo(() => {
    return (
      grQuery.data?.stats?.solverHealth ??
      (pipelineState as any)?.gr?.solver?.health ??
      null
    );
  }, [grQuery.data, pipelineState]);
  const solverStatus = useMemo(() => {
    const healthStatus =
      solverHealth?.status && typeof solverHealth.status === "string"
        ? solverHealth.status
        : "NOT_CERTIFIED";
    if (healthStatus === "UNSTABLE") return "UNSTABLE";
    const metaStatus =
      brickMeta?.status && typeof brickMeta.status === "string"
        ? brickMeta.status
        : "NOT_CERTIFIED";
    if (healthStatus === "CERTIFIED" && metaStatus === "CERTIFIED") {
      return "CERTIFIED";
    }
    return "NOT_CERTIFIED";
  }, [brickMeta, solverHealth]);
  const grStatus = useMemo(() => {
    if (!grRequested) return "off";
    if (grQuery.isFetching) return "running";
    if (grQuery.isError) return "error";
    if (grQuery.data) return "ready";
    return "idle";
  }, [grRequested, grQuery.data, grQuery.isError, grQuery.isFetching]);
  const grErrorMessage = useMemo(() => {
    if (!grQuery.error) return null;
    return grQuery.error instanceof Error ? grQuery.error.message : String(grQuery.error);
  }, [grQuery.error]);
  const regionStatus = useMemo(() => {
    if (!regionRequested) return "off";
    if (regionQuery.isFetching) return "running";
    if (regionQuery.isError) return "error";
    if (regionQuery.data) return "ready";
    return "idle";
  }, [regionRequested, regionQuery.data, regionQuery.isError, regionQuery.isFetching]);
  const regionErrorMessage = useMemo(() => {
    if (!regionQuery.error) return null;
    return regionQuery.error instanceof Error ? regionQuery.error.message : String(regionQuery.error);
  }, [regionQuery.error]);
  const useGrBrickData = Boolean(grQuery.data);
  const thetaSampleRaw = useMemo(
    () => (grQuery.data ? buildBrickSample(grQuery.data, latticeBounds, "theta") : null),
    [grQuery.data, latticeBounds],
  );
  const thetaRange = useMemo(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    const theta = getBrickChannel(grQuery.data, "theta");
    if (!theta) return null;
    const min = toFiniteNumber(theta.min, 0);
    const max = toFiniteNumber(theta.max, 0);
    const maxAbs = Math.max(Math.abs(min), Math.abs(max));
    return { min, max, maxAbs };
  }, [useGrBrickData, grQuery.data]);

  const lineThetaRaw = useMemo(
    () => (thetaSampleRaw ? sampleBrickForVerts(lineVerts, thetaSampleRaw, gridScale) : null),
    [lineVerts, thetaSampleRaw, gridScale],
  );
  const nodeThetaRaw = useMemo(
    () => (thetaSampleRaw ? sampleBrickForVerts(nodeVerts, thetaSampleRaw, gridScale) : null),
    [nodeVerts, thetaSampleRaw, gridScale],
  );
  const thetaPercentile = useMemo(() => {
    const sampleLimit = Math.max(1, Math.floor(WARP_SCALE_SAMPLE_MAX / 2));
    const samples = [
      ...collectAbsSamples(lineThetaRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
      ...collectAbsSamples(nodeThetaRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
    ];
    return percentileFromSamples(samples, THETA_WARP_PERCENTILE);
  }, [lineThetaRaw, nodeThetaRaw]);
  const thetaNormalization = useMemo(() => {
    const p98 =
      Number.isFinite(thetaPercentile as number) && (thetaPercentile as number) > 0
        ? (thetaPercentile as number)
        : null;
    const rangeAbs = thetaRange?.maxAbs ?? null;
    const normMode: "p98" | "range" | "fallback" = p98 ? "p98" : rangeAbs ? "range" : "fallback";
    const clampBasis = p98 ?? rangeAbs;
    const lineNorm = normalizeSignedField(lineThetaRaw, clampBasis, WARP_CLAMP_MULT);
    const nodeNorm = normalizeSignedField(nodeThetaRaw, clampBasis, WARP_CLAMP_MULT);
    const clampMin = lineNorm.clampMin ?? nodeNorm.clampMin;
    const clampMax = lineNorm.clampMax ?? nodeNorm.clampMax;
    return {
      line: lineNorm,
      node: nodeNorm,
      normMode,
      p98,
      clampMin,
      clampMax,
      sanitizedCount: lineNorm.sanitizedCount + nodeNorm.sanitizedCount,
    };
  }, [lineThetaRaw, nodeThetaRaw, thetaPercentile, thetaRange]);
  const wallInvariantSample = useMemo(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    const primary = wallInvariant === "ricci4" ? "ricci4" : "kretschmann";
    const secondary = primary === "ricci4" ? "kretschmann" : "ricci4";
    const primarySample = buildBrickSample(grQuery.data, latticeBounds, primary);
    if (primarySample) return { sample: primarySample, source: primary as "ricci4" | "kretschmann" };
    const secondarySample = buildBrickSample(grQuery.data, latticeBounds, secondary);
    if (secondarySample) return { sample: secondarySample, source: secondary as "ricci4" | "kretschmann" };
    return null;
  }, [useGrBrickData, grQuery.data, latticeBounds, wallInvariant]);
  const lineWallInvariantRaw = useMemo(
    () =>
      wallInvariantSample
        ? sampleBrickForVerts(lineVerts, wallInvariantSample.sample, gridScale)
        : null,
    [wallInvariantSample, lineVerts, gridScale],
  );
  const nodeWallInvariantRaw = useMemo(
    () =>
      wallInvariantSample
        ? sampleBrickForVerts(nodeVerts, wallInvariantSample.sample, gridScale)
        : null,
    [wallInvariantSample, nodeVerts, gridScale],
  );
  const wallDiagnostics = useMemo<WallDiagnostics | null>(() => {
    const regionWall = regionStats?.summary?.wall;
    if (regionWall) {
      const p98 = Number.isFinite(regionWall.p98 as number) ? (regionWall.p98 as number) : null;
      if (p98 == null) return null;
      return {
        source: regionWall.source,
        detected: regionWall.detected,
        p98,
        threshold: regionWall.threshold,
        bandMin: regionWall.bandMin,
        bandMax: regionWall.bandMax,
        sampleCount: regionWall.sampleCount,
        sampleFraction: regionWall.voxelFraction,
      };
    }
    if (!wallInvariantSample) return null;
    const sampleLimit = Math.max(1, Math.floor(WARP_SCALE_SAMPLE_MAX / 2));
    const samples = [
      ...collectAbsSamples(lineWallInvariantRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
      ...collectAbsSamples(nodeWallInvariantRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
    ];
    const p98 = percentileFromSamples(samples, WALL_INVARIANT_PERCENTILE);
    if (p98 == null) return null;
    const threshold = p98 * WALL_INVARIANT_FRACTION;
    const bandMin = threshold * (1 - WALL_INVARIANT_BAND_FRACTION);
    const bandMax = threshold * (1 + WALL_INVARIANT_BAND_FRACTION);
    let bandCount = 0;
    for (const value of samples) {
      if (value >= bandMin && value <= bandMax) bandCount += 1;
    }
    const sampleFraction = samples.length > 0 ? bandCount / samples.length : 0;
    return {
      source: wallInvariantSample.source,
      detected: threshold > 0 && bandCount > 0,
      p98,
      threshold,
      bandMin,
      bandMax,
      sampleCount: samples.length,
      sampleFraction,
    };
  }, [
    regionStats,
    wallInvariantSample,
    lineWallInvariantRaw,
    nodeWallInvariantRaw,
  ]);
  const betaSamplesRaw = useMemo(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    const sampleX = buildBrickSample(grQuery.data, latticeBounds, "beta_x");
    const sampleY = buildBrickSample(grQuery.data, latticeBounds, "beta_y");
    const sampleZ = buildBrickSample(grQuery.data, latticeBounds, "beta_z");
    if (!sampleX || !sampleY || !sampleZ) return null;
    return { sampleX, sampleY, sampleZ };
  }, [useGrBrickData, grQuery.data, latticeBounds]);
  const lineBetaRaw = useMemo(() => {
    if (!betaSamplesRaw) return null;
    const bx = sampleBrickForVerts(lineVerts, betaSamplesRaw.sampleX, gridScale);
    const by = sampleBrickForVerts(lineVerts, betaSamplesRaw.sampleY, gridScale);
    const bz = sampleBrickForVerts(lineVerts, betaSamplesRaw.sampleZ, gridScale);
    return interleaveVec3(bx, by, bz);
  }, [betaSamplesRaw, lineVerts, gridScale]);
  const nodeBetaRaw = useMemo(() => {
    if (!betaSamplesRaw) return null;
    const bx = sampleBrickForVerts(nodeVerts, betaSamplesRaw.sampleX, gridScale);
    const by = sampleBrickForVerts(nodeVerts, betaSamplesRaw.sampleY, gridScale);
    const bz = sampleBrickForVerts(nodeVerts, betaSamplesRaw.sampleZ, gridScale);
    return interleaveVec3(bx, by, bz);
  }, [betaSamplesRaw, nodeVerts, gridScale]);
  const betaPercentile = useMemo(() => {
    const sampleLimit = Math.max(1, Math.floor(WARP_SCALE_SAMPLE_MAX / 2));
    const samples = [
      ...collectVec3MagnitudeSamples(lineBetaRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
      ...collectVec3MagnitudeSamples(nodeBetaRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
    ];
    return percentileFromSamples(samples, BETA_WARP_PERCENTILE);
  }, [lineBetaRaw, nodeBetaRaw]);
  const betaClampAbs = useMemo(() => {
    if (!Number.isFinite(betaPercentile as number) || (betaPercentile as number) <= 0) {
      return null;
    }
    return Math.min(WARP_SAMPLE_MAX_ABS, (betaPercentile as number) * WARP_CLAMP_MULT);
  }, [betaPercentile]);
  const betaCenter = useMemo<[number, number, number]>(() => {
    if (!betaSamplesRaw) return [0, 0, 0];
    const center = bubbleParams.center;
    const bx = sampleBrickScalar(betaSamplesRaw.sampleX, center, 0);
    const by = sampleBrickScalar(betaSamplesRaw.sampleY, center, 0);
    const bz = sampleBrickScalar(betaSamplesRaw.sampleZ, center, 0);
    return [toFiniteNumber(bx, 0), toFiniteNumber(by, 0), toFiniteNumber(bz, 0)];
  }, [betaSamplesRaw, bubbleParams.center]);
  const betaCenterRef = useRef(betaCenter);
  useEffect(() => {
    betaCenterRef.current = betaCenter;
  }, [betaCenter]);
  const defaultLineAlpha = useMemo(() => {
    const out = new Float32Array(lineCount);
    out.fill(1);
    return out;
  }, [lineCount]);
  const defaultNodeAlpha = useMemo(() => {
    const out = new Float32Array(nodeCount);
    out.fill(1);
    return out;
  }, [nodeCount]);
  const defaultLineTheta = useMemo(() => new Float32Array(lineCount), [lineCount]);
  const defaultNodeTheta = useMemo(() => new Float32Array(nodeCount), [nodeCount]);
  const defaultLineBeta = useMemo(() => new Float32Array(lineCount * 3), [lineCount]);
  const defaultNodeBeta = useMemo(() => new Float32Array(nodeCount * 3), [nodeCount]);
  const defaultLineGamma = useMemo(() => {
    const out = new Float32Array(lineCount * 3);
    out.fill(1);
    return out;
  }, [lineCount]);
  const defaultNodeGamma = useMemo(() => {
    const out = new Float32Array(nodeCount * 3);
    out.fill(1);
    return out;
  }, [nodeCount]);
  const defaultLineShear = useMemo(() => new Float32Array(lineCount * 3), [lineCount]);
  const defaultNodeShear = useMemo(() => new Float32Array(nodeCount * 3), [nodeCount]);
  const defaultLineConstraint = useMemo(() => new Float32Array(lineCount), [lineCount]);
  const defaultNodeConstraint = useMemo(() => new Float32Array(nodeCount), [nodeCount]);
  const defaultLineRegion = useMemo(() => new Float32Array(lineCount), [lineCount]);
  const defaultNodeRegion = useMemo(() => new Float32Array(nodeCount), [nodeCount]);
  const defaultLineRegionGrid = useMemo(() => new Float32Array(lineCount), [lineCount]);
  const defaultNodeRegionGrid = useMemo(() => new Float32Array(nodeCount), [nodeCount]);
  const lineTheta = useMemo(
    () => thetaNormalization.line.data ?? defaultLineTheta,
    [thetaNormalization, defaultLineTheta],
  );
  const nodeTheta = useMemo(
    () => thetaNormalization.node.data ?? defaultNodeTheta,
    [thetaNormalization, defaultNodeTheta],
  );
  const lineBeta = useMemo(
    () => sanitizeVec3Array(lineBetaRaw, betaClampAbs) ?? defaultLineBeta,
    [lineBetaRaw, betaClampAbs, defaultLineBeta],
  );
  const nodeBeta = useMemo(
    () => sanitizeVec3Array(nodeBetaRaw, betaClampAbs) ?? defaultNodeBeta,
    [nodeBetaRaw, betaClampAbs, defaultNodeBeta],
  );
  const gammaSamplesRaw = useMemo(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    const sampleX = buildBrickSample(grQuery.data, latticeBounds, "gamma_xx");
    const sampleY = buildBrickSample(grQuery.data, latticeBounds, "gamma_yy");
    const sampleZ = buildBrickSample(grQuery.data, latticeBounds, "gamma_zz");
    if (!sampleX || !sampleY || !sampleZ) return null;
    return { sampleX, sampleY, sampleZ };
  }, [useGrBrickData, grQuery.data, latticeBounds]);
  const lineGammaRaw = useMemo(() => {
    if (!gammaSamplesRaw) return null;
    const gx = sampleBrickForVerts(lineVerts, gammaSamplesRaw.sampleX, gridScale);
    const gy = sampleBrickForVerts(lineVerts, gammaSamplesRaw.sampleY, gridScale);
    const gz = sampleBrickForVerts(lineVerts, gammaSamplesRaw.sampleZ, gridScale);
    return interleaveVec3(gx, gy, gz);
  }, [gammaSamplesRaw, lineVerts, gridScale]);
  const nodeGammaRaw = useMemo(() => {
    if (!gammaSamplesRaw) return null;
    const gx = sampleBrickForVerts(nodeVerts, gammaSamplesRaw.sampleX, gridScale);
    const gy = sampleBrickForVerts(nodeVerts, gammaSamplesRaw.sampleY, gridScale);
    const gz = sampleBrickForVerts(nodeVerts, gammaSamplesRaw.sampleZ, gridScale);
    return interleaveVec3(gx, gy, gz);
  }, [gammaSamplesRaw, nodeVerts, gridScale]);
  const gammaPercentile = useMemo(() => {
    const sampleLimit = Math.max(1, Math.floor(WARP_SCALE_SAMPLE_MAX / 2));
    const samples = [
      ...collectVec3DeviationSamples(lineGammaRaw, sampleLimit, 1, WARP_SAMPLE_MAX_ABS),
      ...collectVec3DeviationSamples(nodeGammaRaw, sampleLimit, 1, WARP_SAMPLE_MAX_ABS),
    ];
    return percentileFromSamples(samples, GAMMA_WARP_PERCENTILE);
  }, [lineGammaRaw, nodeGammaRaw]);
  const gammaClampDev = useMemo(() => {
    if (!Number.isFinite(gammaPercentile as number) || (gammaPercentile as number) <= 0) {
      return GAMMA_DEV_CLAMP_MAX;
    }
    return clampNumber(
      (gammaPercentile as number) * WARP_CLAMP_MULT,
      GAMMA_DEV_CLAMP_MIN,
      GAMMA_DEV_CLAMP_MAX,
    );
  }, [gammaPercentile]);
  const lineGamma = useMemo(
    () => sanitizeGammaArray(lineGammaRaw, gammaClampDev) ?? defaultLineGamma,
    [lineGammaRaw, gammaClampDev, defaultLineGamma],
  );
  const nodeGamma = useMemo(
    () => sanitizeGammaArray(nodeGammaRaw, gammaClampDev) ?? defaultNodeGamma,
    [nodeGammaRaw, gammaClampDev, defaultNodeGamma],
  );
  const kijSamples = useMemo<KijSamples | null>(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    const K_xx = buildBrickSample(grQuery.data, latticeBounds, "K_xx");
    const K_yy = buildBrickSample(grQuery.data, latticeBounds, "K_yy");
    const K_zz = buildBrickSample(grQuery.data, latticeBounds, "K_zz");
    const K_xy = buildBrickSample(grQuery.data, latticeBounds, "K_xy");
    const K_xz = buildBrickSample(grQuery.data, latticeBounds, "K_xz");
    const K_yz = buildBrickSample(grQuery.data, latticeBounds, "K_yz");
    if (!K_xx || !K_yy || !K_zz || !K_xy || !K_xz || !K_yz) return null;
    return { K_xx, K_yy, K_zz, K_xy, K_xz, K_yz };
  }, [useGrBrickData, grQuery.data, latticeBounds]);
  const lineShearRaw = useMemo(
    () => (kijSamples ? buildShearForVerts(lineVerts, kijSamples, gridScale) : null),
    [kijSamples, lineVerts, gridScale],
  );
  const nodeShearRaw = useMemo(
    () => (kijSamples ? buildShearForVerts(nodeVerts, kijSamples, gridScale) : null),
    [kijSamples, nodeVerts, gridScale],
  );
  const shearPercentile = useMemo(() => {
    const sampleLimit = Math.max(1, Math.floor(WARP_SCALE_SAMPLE_MAX / 2));
    const samples = [
      ...collectVec3MagnitudeSamples(lineShearRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
      ...collectVec3MagnitudeSamples(nodeShearRaw, sampleLimit, WARP_SAMPLE_MAX_ABS),
    ];
    return percentileFromSamples(samples, SHEAR_WARP_PERCENTILE);
  }, [lineShearRaw, nodeShearRaw]);
  const shearClampAbs = useMemo(() => {
    if (!Number.isFinite(shearPercentile as number) || (shearPercentile as number) <= 0) {
      return null;
    }
    return Math.min(WARP_SAMPLE_MAX_ABS, (shearPercentile as number) * WARP_CLAMP_MULT);
  }, [shearPercentile]);
  const lineShear = useMemo(
    () => sanitizeVec3Array(lineShearRaw, shearClampAbs) ?? defaultLineShear,
    [lineShearRaw, shearClampAbs, defaultLineShear],
  );
  const nodeShear = useMemo(
    () => sanitizeVec3Array(nodeShearRaw, shearClampAbs) ?? defaultNodeShear,
    [nodeShearRaw, shearClampAbs, defaultNodeShear],
  );
  const constraintSample = useMemo(() => {
    if (!useGrBrickData || !grQuery.data) return null;
    return buildBrickSample(grQuery.data, latticeBounds, "H_constraint");
  }, [useGrBrickData, grQuery.data, latticeBounds]);
  const lineConstraint = useMemo(
    () =>
      constraintSample
        ? sampleBrickForVerts(lineVerts, constraintSample, gridScale)
        : defaultLineConstraint,
    [constraintSample, lineVerts, gridScale, defaultLineConstraint],
  );
  const nodeConstraint = useMemo(
    () =>
      constraintSample
        ? sampleBrickForVerts(nodeVerts, constraintSample, gridScale)
        : defaultNodeConstraint,
    [constraintSample, nodeVerts, gridScale, defaultNodeConstraint],
  );
  const regionGrid = regionStats?.grid ?? null;
  const lineRegionOverlay = useMemo(
    () =>
      buildRegionOverlayForVerts({
        verts: lineVerts,
        gridScale,
        bounds: regionOverlayBounds,
        grid: regionGrid,
        hullAxes: regionOverlayHull.axes,
        hullWall: regionOverlayHull.wallThickness,
        weightMap: regionWeightMap,
      }),
    [lineVerts, gridScale, regionOverlayBounds, regionGrid, regionOverlayHull, regionWeightMap],
  );
  const nodeRegionOverlay = useMemo(
    () =>
      buildRegionOverlayForVerts({
        verts: nodeVerts,
        gridScale,
        bounds: regionOverlayBounds,
        grid: regionGrid,
        hullAxes: regionOverlayHull.axes,
        hullWall: regionOverlayHull.wallThickness,
        weightMap: regionWeightMap,
      }),
    [nodeVerts, gridScale, regionOverlayBounds, regionGrid, regionOverlayHull, regionWeightMap],
  );
  const lineRegion = lineRegionOverlay.weights;
  const nodeRegion = nodeRegionOverlay.weights;
  const lineRegionGrid = lineRegionOverlay.grid;
  const nodeRegionGrid = nodeRegionOverlay.grid;
    const constraintScale = useMemo(() => {
      if (!useGrBrickData || !grQuery.data) return 0;
      const h = grQuery.data.channels?.H_constraint;
      const min = Number(h?.min ?? 0);
      const max = Number(h?.max ?? 0);
      const maxAbs = Math.max(Math.abs(min), Math.abs(max));
      return maxAbs > 0 ? 1 / maxAbs : 0;
    }, [useGrBrickData, grQuery.data]);
    const constraintScaleRef = useRef(constraintScale);
    useEffect(() => {
      constraintScaleRef.current = constraintScale;
    }, [constraintScale]);
  const grDerived = useMemo(
    () => (grRequested && grQuery.data ? deriveGrMetrics(grQuery.data, debugAllowed) : null),
    [grRequested, grQuery.data, debugAllowed],
  );
  const betaField = useMemo(() => {
    const grBetaMaxAbs = firstFinite(grDerived?.betaMaxAbs, (pipelineState as any)?.gr?.gauge?.betaMaxAbs);
    if (useGrBrickData && Number.isFinite(grBetaMaxAbs)) {
      return {
        value: Math.max(0, Math.min(BETA_NEAR_REST_MAX, Math.abs(grBetaMaxAbs as number))),
        source: "gr-beta",
        proxy: grProxy,
      };
    }
    return {
      value: bubbleParams.beta,
      source: bubbleParams.betaSource,
      proxy: bubbleParams.betaProxy,
    };
  }, [grDerived, pipelineState, useGrBrickData, grProxy, bubbleParams]);
  const betaFieldRef = useRef(betaField);
  useEffect(() => {
    betaFieldRef.current = betaField;
  }, [betaField]);

  const renderPlanRef = useRef<TimeDilationRenderPlan | null>(null);
  const [renderPlanVersion, setRenderPlanVersion] = useState(0);

  const activationMetrics = useMemo(() => {
    const power = resolvePowerW(pipelineState);
    const duty = resolveDutyEffective(pipelineState);
    const gammaGeo = resolveGammaGeo(pipelineState);
    const gammaVdB = resolveGammaVdB(pipelineState);
    const qSpoil = resolveQSpoiling(pipelineState);
    const tsRatio = resolveTSRatio(pipelineState);
    const thetaCal = resolveThetaCal(pipelineState, { gammaGeo, qSpoil, gammaVdB, duty });
    const thetaGeom = resolveThetaGeom(pipelineState);
    const thetaActivation =
      strictCongruence && Number.isFinite(thetaGeom.value) && !thetaGeom.proxy
        ? thetaGeom
        : thetaCal;
    const gammaGeoCubed = Math.pow(gammaGeo.value, 3);

    const powerNorm = normalizeLog(power.value, 1e6, 1e12);
    const thetaNorm = normalizeLog(thetaActivation.value, 1e8, 1e12);
    const tsNorm = normalizeLog(tsRatio.value, TS_RATIO_MIN, TS_RATIO_MIN * 1e4);
    const activationBase = averageFinite(powerNorm, thetaNorm, tsNorm);

    const guardrails = resolveGuardrails(
      pipelineState,
      tsRatio.value,
      gammaVdB.value,
      contractGuardrails,
    );
    const activation = clamp01(activationBase * guardrails.multiplier);
    const activationProxy =
      power.proxy ||
      duty.proxy ||
      gammaGeo.proxy ||
      gammaVdB.proxy ||
      qSpoil.proxy ||
      tsRatio.proxy ||
      thetaActivation.proxy ||
      guardrails.proxy;

    return {
      power,
      duty,
      gammaGeo,
      gammaGeoCubed,
      gammaVdB,
      qSpoil,
      tsRatio,
      thetaCal,
      activation,
      activationBase,
      activationProxy,
      guardrails,
    };
  }, [pipelineState, contractGuardrails]);

  const activationEffective = useMemo(() => {
    if (latticeMetricOnly && certifiedModeEnabled && renderPlanRef.current?.enableGeometryWarp) {
      return 1;
    }
    return activationMetrics.activation;
  }, [latticeMetricOnly, certifiedModeEnabled, activationMetrics.activation, renderPlanVersion]);

  useEffect(() => {
    activationTargetRef.current = activationEffective;
  }, [activationEffective]);

  const pipelineProofs = useMemo(() => {
    const t00Metric = resolveProofPackNumber(
      proofPack,
      "metric_t00_rho_si_mean",
      "metric_t00_rho_si_mean",
    );
    const t00Min = Number.isFinite(t00Metric.value)
      ? t00Metric
      : resolveT00Min(pipelineState);
    const mExoticMetric = resolveProofPackNumber(proofPack, "M_exotic_kg", "M_exotic_kg");
    const mExoticMetricRaw = resolveProofPackNumber(
      proofPack,
      "M_exotic_raw_kg",
      "M_exotic_raw_kg",
    );
    const mExotic = Number.isFinite(mExoticMetric.value)
      ? mExoticMetric
      : Number.isFinite(mExoticMetricRaw.value)
        ? mExoticMetricRaw
        : resolveMExotic(pipelineState);
    return {
      t00Min,
      mExotic,
      kTraceMean: resolveProofPackNumber(proofPack, "metric_k_trace_mean"),
      kSqMean: resolveProofPackNumber(proofPack, "metric_k_sq_mean"),
    };
  }, [pipelineState, proofPack]);
  const t00MinSource = pipelineProofs.t00Min.source ?? "unknown";
  const t00MinProxy = pipelineProofs.t00Min.proxy === true;

  const modelMode = proofStr("model_mode");
  const dutyEffective = proofNum("duty_effective");
  const dutyBurst = proofNum("duty_burst");
  const sectorsLive = proofNum("sectors_live");
  const sectorsTotal = proofNum("sectors_total");
  const tauLcMs = proofNum("tau_lc_ms");
  const tauPulseMs = proofNum("tau_pulse_ms");
  const tauDwellMs = proofNum("tau_dwell_ms");
  const mechGapReqNm = proofNum("mechanical_gap_req_nm");
  const mechGapEffNm = proofNum("mechanical_gap_eff_nm");
  const mechNote = proofStr("mechanical_note");

  const telemetryModelLine = formatProxyValue(
    `model=${modelMode ?? "n/a"}`,
    proofProxyFrom(["model_mode"]),
  );
  const telemetryGapLine = formatProxyValue(
    `gap_nm ${formatFixed(mechGapReqNm, 1)} -> ${formatFixed(mechGapEffNm, 1)}`,
    proofProxyFrom(["mechanical_gap_req_nm", "mechanical_gap_eff_nm"]),
  );
  const dutyEffPct = dutyEffective == null ? null : dutyEffective * 100;
  const dutyBurstPct = dutyBurst == null ? null : dutyBurst * 100;
  const sectorLabel =
    Number.isFinite(sectorsLive as number) || Number.isFinite(sectorsTotal as number)
      ? `${formatCount(sectorsLive)} / ${formatCount(sectorsTotal)}`
      : "n/a";
  const telemetryDutyLine = formatProxyValue(
    `duty eff=${formatFixed(dutyEffPct, 2)}% burst=${formatFixed(dutyBurstPct, 2)}% sectors=${sectorLabel}`,
    proofProxyFrom(["duty_effective", "duty_burst", "sectors_live", "sectors_total"]),
  );
  const telemetryTauLine = formatProxyValue(
    `tau ms lc=${formatFixed(tauLcMs, 2)} pulse=${formatFixed(tauPulseMs, 2)} dwell=${formatFixed(
      tauDwellMs,
      2,
    )}`,
    proofProxyFrom(["tau_lc_ms", "tau_pulse_ms", "tau_dwell_ms"]),
  );
  const telemetryNoteLine = mechNote
    ? formatProxyValue(`mech ${truncateText(mechNote, 60)}`, proofProxyFrom(["mechanical_note"]))
    : null;
  const liveModeLine = useMemo(() => {
    if (!sectorControlLiveEvent) return null;
    const requested = sectorControlLiveEvent.requestedMode ?? "n/a";
    const applied = sectorControlLiveEvent.appliedMode ?? requested;
    const planner = sectorControlLiveEvent.plannerMode ?? "n/a";
    const firstFail = sectorControlLiveEvent.firstFail ?? "none";
    const fallback = sectorControlLiveEvent.fallbackApplied ? "yes" : "no";
    return `${requested} -> ${applied} planner=${planner} fail=${firstFail} fallback=${fallback}`;
  }, [sectorControlLiveEvent]);
  const liveGuardrailLine = useMemo(() => {
    const constraints = sectorControlLiveEvent?.constraints;
    if (!constraints) return null;
    return `FR=${constraints.FordRomanQI ?? "n/a"} TH=${constraints.ThetaAudit ?? "n/a"} TS=${
      constraints.TS_ratio_min ?? "n/a"
    } VdB=${constraints.VdB_band ?? "n/a"} GR=${constraints.grConstraintGate ?? "n/a"}`;
  }, [sectorControlLiveEvent]);
  const liveObserverLine = useMemo(() => {
    const overflowCount = parseFiniteNumber(sectorControlLiveEvent?.observerGrid?.overflowCount);
    if (overflowCount == null) return null;
    return `observer overflow=${formatCount(overflowCount)} paybackGain=${formatFixed(
      parseFiniteNumber(sectorControlLiveEvent?.observerGrid?.paybackGain),
      2,
    )}`;
  }, [sectorControlLiveEvent]);
  const liveReloadLine = useMemo(() => {
    if (!lastReloadEvent) return null;
    return `reload ${lastReloadEvent.reason} @ ${formatEventTime(lastReloadEvent.ts)}`;
  }, [lastReloadEvent]);
  const liveSourceLine = useMemo(() => {
    if (!sectorControlLiveEvent) return null;
    const ageMs = Math.max(0, liveNowTs - (sectorControlLiveEvent.ts ?? liveNowTs));
    const ageS = Math.floor(ageMs / 1000);
    const stale = ageMs > 15_000 ? "stale" : "fresh";
    return `source=${sectorControlLiveEvent.source} age=${ageS}s ${stale}`;
  }, [liveNowTs, sectorControlLiveEvent]);

  const hasHull = useMemo(() => {
    const nonDefault =
      hullAxesResolution.source === "pipeline" ||
      !isDefaultHullAxes(hullBounds.axes, authorityHullAxes);
    const userChosen = resolveUserHullChoice(pipelineState);
    const hasGeometry = Boolean(
      pipelineState?.hull ||
        pipelineState?.warpGeometry ||
        pipelineState?.warpGeometryKind ||
        pipelineState?.warpGeometryAssetId ||
        pipelineState?.geometryPreview ||
        pipelineState?.hullBrick,
    );
    return hasGeometry && (nonDefault || userChosen);
  }, [authorityHullAxes, hullAxesResolution.source, pipelineState, hullBounds]);
  const effectiveHasHull = certifiedModeEnabled
    ? hasHull || Boolean((pipelineState as any)?.hull)
    : false;
  const wallDetectionAvailable = Boolean(wallDiagnostics);
  const wallDetected = wallDiagnostics?.detected ?? null;
  const wallSource = wallDiagnostics?.source;
  const grCertified = Boolean(
    brickMeta?.status === "CERTIFIED" &&
      solverStatus === "CERTIFIED" &&
      (!grGuardrails ||
        (grGuardrails.proxy === false && grGuardrails.source === "pipeline-gr")),
  );
  const anyProxy = latticeMetricOnly
    ? grProxy || strictMetricMissing
    : activationMetrics.activationProxy ||
      pipelineProofs.t00Min.proxy ||
      pipelineProofs.mExotic.proxy ||
      grProxy ||
      strictMetricMissing;
  const cellSize = useMemo(() => (gridScale * 2) / GRID_DIV, [gridScale]);
  const renderPlan = useMemo(
    () =>
      computeTimeDilationRenderPlan(pipelineState, grQuery.data ?? null, lapseQuery.data ?? null, {
        hasHull: effectiveHasHull,
        wallDetectionAvailable,
        wallDetected,
        wallSource,
        grRequested,
        grCertified,
        anyProxy,
        mathStageOK,
        cellSize,
        solverStatus,
        exploratoryOverride,
        cinematicOverride,
        natarioGeometryWarp: natarioGeometryWarpEffective,
        visualTuning,
        betaPercentile,
        thetaPercentile,
        gammaPercentile,
        shearPercentile,
      }),
    [
      pipelineState,
      grQuery.data,
      lapseQuery.data,
      effectiveHasHull,
      wallDetectionAvailable,
      wallDetected,
      wallSource,
      grRequested,
      grCertified,
      anyProxy,
      mathStageOK,
      cellSize,
      solverStatus,
      exploratoryOverride,
      cinematicOverride,
      natarioGeometryWarpEffective,
      visualTuning,
      betaPercentile,
      thetaPercentile,
      gammaPercentile,
      shearPercentile,
    ],
  );
  const bannerBlocked =
    strictCongruence && renderPlan.banner !== "CERTIFIED" && renderPlan.banner !== "NO_HULL";
  renderPlanRef.current = renderPlan;
  useEffect(() => {
    renderPlanRef.current = renderPlan;
    setRenderPlanVersion((prev) => prev + 1);
  }, [renderPlan]);

  const warpFieldType = renderPlan.mode;
  const alphaBrick = useMemo(() => {
    if (renderPlan.sourceForAlpha === "gr-brick") return grQuery.data ?? null;
    if (renderPlan.sourceForAlpha === "lapse-brick") return lapseQuery.data ?? null;
    return null;
  }, [renderPlan.sourceForAlpha, grQuery.data, lapseQuery.data]);
  const clockRateBrick = useMemo(() => {
    if (renderPlan.sourceForClockRate === "gr-brick") return grQuery.data ?? null;
    if (renderPlan.sourceForClockRate === "lapse-brick") return lapseQuery.data ?? null;
    return null;
  }, [renderPlan.sourceForClockRate, grQuery.data, lapseQuery.data]);
  const clockRateSample = useMemo(() => {
    if (!clockRateBrick) return null;
    return buildClockRateSample(clockRateBrick, latticeBounds, clockMode, viewerChart);
  }, [clockRateBrick, latticeBounds, clockMode, viewerChart]);
  const lineAlpha = useMemo(
    () => (clockRateSample ? sampleBrickForVerts(lineVerts, clockRateSample, gridScale) : null),
    [clockRateSample, lineVerts, gridScale],
  );
  const nodeAlpha = useMemo(
    () => (clockRateSample ? sampleBrickForVerts(nodeVerts, clockRateSample, gridScale) : null),
    [clockRateSample, nodeVerts, gridScale],
  );
  const thetaSample = useMemo(
    () => (renderPlan.sourceForTheta === "gr-brick" ? thetaSampleRaw : null),
    [renderPlan.sourceForTheta, thetaSampleRaw],
  );
  const thetaDipoleCheck = useMemo(() => {
    if (warpFieldType !== "alcubierre") return null;
    if (!renderPlan.flags.hasHull) {
      return {
        status: "pending",
        reason: "no hull applied",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    if (!thetaSample) {
      return {
        status: "pending",
        reason: "missing theta channel",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const radius = Number(bubbleParams.R);
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        status: "pending",
        reason: "missing bubble radius",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const dirLen = Math.hypot(driveDir[0], driveDir[1], driveDir[2]);
    if (!(dirLen > 1e-6)) {
      return {
        status: "pending",
        reason: "missing drive direction",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const dist = Math.max(1e-6, radius);
    const center = bubbleParams.center;
    const aheadPos: [number, number, number] = [
      center[0] + driveDir[0] * dist,
      center[1] + driveDir[1] * dist,
      center[2] + driveDir[2] * dist,
    ];
    const behindPos: [number, number, number] = [
      center[0] - driveDir[0] * dist,
      center[1] - driveDir[1] * dist,
      center[2] - driveDir[2] * dist,
    ];
    const ahead = sampleBrickScalar(thetaSample, aheadPos, Number.NaN);
    const behind = sampleBrickScalar(thetaSample, behindPos, Number.NaN);
    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
      return {
        status: "pending",
        reason: "sample out of bounds",
        ahead: Number.isFinite(ahead) ? ahead : null,
        behind: Number.isFinite(behind) ? behind : null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const maxAbs = thetaRange?.maxAbs ?? Math.max(Math.abs(ahead), Math.abs(behind));
    const threshold = Math.max(1e-12, maxAbs * 0.05);
    const aheadStrong = Math.abs(ahead) >= threshold;
    const behindStrong = Math.abs(behind) >= threshold;
    if (!aheadStrong || !behindStrong) {
      return {
        status: "weak",
        reason: "signal below threshold",
        ahead,
        behind,
        threshold,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    return {
      status: ahead * behind < 0 ? "pass" : "fail",
      reason: ahead * behind < 0 ? undefined : "no sign flip",
      ahead,
      behind,
      threshold,
      proxy: renderPlan.flags.anyProxy,
    };
  }, [
    warpFieldType,
    thetaSample,
    bubbleParams,
    driveDir,
    thetaRange,
    renderPlan.flags.anyProxy,
    renderPlan.flags.hasHull,
  ]);
  const betaStrainCheck = useMemo(() => {
    if (warpFieldType !== "alcubierre") return null;
    if (!renderPlan.flags.hasHull) {
      return {
        status: "pending",
        reason: "no hull applied",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    if (!betaSamplesRaw) {
      return {
        status: "pending",
        reason: "missing beta channel",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const unit = normalizeVec3(driveDir);
    const unitLen = Math.hypot(unit[0], unit[1], unit[2]);
    if (!(unitLen > 1e-6)) {
      return {
        status: "pending",
        reason: "missing drive direction",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const radius = Number(bubbleParams.R);
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        status: "pending",
        reason: "missing bubble radius",
        ahead: null,
        behind: null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const dist = Math.max(1e-6, radius * BETA_STRAIN_SAMPLE_FACTOR);
    const center = bubbleParams.center;
    const sampleBeta = (pos: [number, number, number]) => {
      const bx = sampleBrickScalar(betaSamplesRaw.sampleX, pos, Number.NaN);
      const by = sampleBrickScalar(betaSamplesRaw.sampleY, pos, Number.NaN);
      const bz = sampleBrickScalar(betaSamplesRaw.sampleZ, pos, Number.NaN);
      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) {
        return null;
      }
      return (bx as number) * unit[0] + (by as number) * unit[1] + (bz as number) * unit[2];
    };
    const aheadPos: [number, number, number] = [
      center[0] + unit[0] * dist,
      center[1] + unit[1] * dist,
      center[2] + unit[2] * dist,
    ];
    const behindPos: [number, number, number] = [
      center[0] - unit[0] * dist,
      center[1] - unit[1] * dist,
      center[2] - unit[2] * dist,
    ];
    const b0 = sampleBeta(center);
    const bAhead = sampleBeta(aheadPos);
    const bBehind = sampleBeta(behindPos);
    if (b0 === null || bAhead === null || bBehind === null) {
      return {
        status: "pending",
        reason: "sample out of bounds",
        ahead: Number.isFinite(bAhead as number) ? (bAhead as number) : null,
        behind: Number.isFinite(bBehind as number) ? (bBehind as number) : null,
        threshold: null,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    const ahead = (bAhead - b0) / dist;
    const behind = (b0 - bBehind) / dist;
    const scaleCandidate =
      Number.isFinite(betaPercentile as number) && (betaPercentile as number) > 0
        ? (betaPercentile as number)
        : Math.max(Math.abs(b0), Math.abs(bAhead), Math.abs(bBehind));
    const scale = Number.isFinite(scaleCandidate) ? scaleCandidate : 0;
    const threshold = Math.max(1e-12, (scale * BETA_STRAIN_THRESHOLD_FRACTION) / dist);
    const aheadStrong = Math.abs(ahead) >= threshold;
    const behindStrong = Math.abs(behind) >= threshold;
    if (!aheadStrong || !behindStrong) {
      return {
        status: "weak",
        reason: "signal below threshold",
        ahead,
        behind,
        threshold,
        proxy: renderPlan.flags.anyProxy,
      };
    }
    return {
      status: ahead * behind < 0 ? "pass" : "fail",
      reason: ahead * behind < 0 ? undefined : "no sign flip",
      ahead,
      behind,
      threshold,
      proxy: renderPlan.flags.anyProxy,
    };
  }, [
    warpFieldType,
    betaSamplesRaw,
    bubbleParams,
    driveDir,
    betaPercentile,
    renderPlan.flags.anyProxy,
    renderPlan.flags.hasHull,
  ]);
  const thetaExpectation = useMemo(() => {
    if (warpFieldType === "alcubierre") {
      return {
        mode: warpFieldType,
        note: "Î¸ dipole sign-flip check",
        dipole: thetaDipoleCheck,
      };
    }
    if (warpFieldType === "natario") {
      return {
        mode: warpFieldType,
        note: "Î¸ expected near 0",
      };
    }
    return {
      mode: warpFieldType,
      note: "Î¸ expectation: n/a",
    };
  }, [warpFieldType, thetaDipoleCheck]);

  const lineHull = useMemo(
    () => (hullField ? sampleHullFieldForVerts(lineVerts, hullField, gridScale) : null),
    [hullField, lineVerts, gridScale],
  );
  const nodeHull = useMemo(
    () => (hullField ? sampleHullFieldForVerts(nodeVerts, hullField, gridScale) : null),
    [hullField, nodeVerts, gridScale],
  );
  const lineHullDist = lineHull?.dist ?? null;
  const lineHullDir = lineHull?.grad ?? null;
  const nodeHullDist = nodeHull?.dist ?? null;
  const nodeHullDir = nodeHull?.grad ?? null;

  const hullFallbackDistance = useMemo(() => {
    const axes = latticeBounds.axes;
    return Math.max(axes[0], axes[1], axes[2]) * 2;
  }, [latticeBounds.axes]);
  const defaultLineHullDist = useMemo(() => {
    const out = new Float32Array(lineCount);
    out.fill(hullFallbackDistance);
    return out;
  }, [lineCount, hullFallbackDistance]);
  const defaultNodeHullDist = useMemo(() => {
    const out = new Float32Array(nodeCount);
    out.fill(hullFallbackDistance);
    return out;
  }, [nodeCount, hullFallbackDistance]);
  const defaultLineHullDir = useMemo(() => new Float32Array(lineCount * 3), [lineCount]);
  const defaultNodeHullDir = useMemo(() => new Float32Array(nodeCount * 3), [nodeCount]);

  const lineAlphaRef = useRef<Float32Array | null>(lineAlpha);
  const nodeAlphaRef = useRef<Float32Array | null>(nodeAlpha);
  const lineThetaRef = useRef<Float32Array | null>(lineTheta);
  const nodeThetaRef = useRef<Float32Array | null>(nodeTheta);
  const lineBetaRef = useRef<Float32Array | null>(lineBeta);
  const nodeBetaRef = useRef<Float32Array | null>(nodeBeta);
  const lineGammaRef = useRef<Float32Array | null>(lineGamma);
  const nodeGammaRef = useRef<Float32Array | null>(nodeGamma);
  const lineShearRef = useRef<Float32Array | null>(lineShear);
  const nodeShearRef = useRef<Float32Array | null>(nodeShear);
  const lineConstraintRef = useRef<Float32Array | null>(lineConstraint);
  const nodeConstraintRef = useRef<Float32Array | null>(nodeConstraint);
  const lineRegionRef = useRef<Float32Array | null>(lineRegion);
  const nodeRegionRef = useRef<Float32Array | null>(nodeRegion);
  const lineRegionGridRef = useRef<Float32Array | null>(lineRegionGrid);
  const nodeRegionGridRef = useRef<Float32Array | null>(nodeRegionGrid);
  useEffect(() => {
    lineAlphaRef.current = lineAlpha ?? defaultLineAlpha;
  }, [lineAlpha, defaultLineAlpha]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useTheta = plan?.sourceForTheta === "gr-brick";
    lineThetaRef.current = useTheta && lineTheta ? lineTheta : defaultLineTheta;
  }, [lineTheta, defaultLineTheta, renderPlanVersion]);
  useEffect(() => {
    nodeAlphaRef.current = nodeAlpha ?? defaultNodeAlpha;
  }, [nodeAlpha, defaultNodeAlpha]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useTheta = plan?.sourceForTheta === "gr-brick";
    nodeThetaRef.current = useTheta && nodeTheta ? nodeTheta : defaultNodeTheta;
  }, [nodeTheta, defaultNodeTheta, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useBeta = plan?.sourceForBeta === "gr-brick";
    lineBetaRef.current = useBeta && lineBeta ? lineBeta : defaultLineBeta;
  }, [lineBeta, defaultLineBeta, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useBeta = plan?.sourceForBeta === "gr-brick";
    nodeBetaRef.current = useBeta && nodeBeta ? nodeBeta : defaultNodeBeta;
  }, [nodeBeta, defaultNodeBeta, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useGamma = Boolean(plan?.enableGeometryWarp);
    lineGammaRef.current = useGamma && lineGamma ? lineGamma : defaultLineGamma;
  }, [lineGamma, defaultLineGamma, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useGamma = Boolean(plan?.enableGeometryWarp);
    nodeGammaRef.current = useGamma && nodeGamma ? nodeGamma : defaultNodeGamma;
  }, [nodeGamma, defaultNodeGamma, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useShear = Boolean(plan?.enableGeometryWarp);
    lineShearRef.current = useShear && lineShear ? lineShear : defaultLineShear;
  }, [lineShear, defaultLineShear, renderPlanVersion]);
  useEffect(() => {
    const plan = renderPlanRef.current;
    const useShear = Boolean(plan?.enableGeometryWarp);
    nodeShearRef.current = useShear && nodeShear ? nodeShear : defaultNodeShear;
  }, [nodeShear, defaultNodeShear, renderPlanVersion]);
  useEffect(() => {
    if (lineConstraint) {
      lineConstraintRef.current = lineConstraint;
    }
  }, [lineConstraint]);
  useEffect(() => {
    if (nodeConstraint) {
      nodeConstraintRef.current = nodeConstraint;
    }
  }, [nodeConstraint]);
  useEffect(() => {
    lineRegionRef.current = lineRegion;
  }, [lineRegion]);
  useEffect(() => {
    nodeRegionRef.current = nodeRegion;
  }, [nodeRegion]);
  useEffect(() => {
    lineRegionGridRef.current = lineRegionGrid;
  }, [lineRegionGrid]);
  useEffect(() => {
    nodeRegionGridRef.current = nodeRegionGrid;
  }, [nodeRegionGrid]);

  const lineHullDistRef = useRef<Float32Array | null>(lineHullDist);
  const nodeHullDistRef = useRef<Float32Array | null>(nodeHullDist);
  const lineHullDirRef = useRef<Float32Array | null>(lineHullDir);
  const nodeHullDirRef = useRef<Float32Array | null>(nodeHullDir);
  useEffect(() => {
    if (lineHullDist) {
      lineHullDistRef.current = lineHullDist;
    }
  }, [lineHullDist]);
  useEffect(() => {
    if (nodeHullDist) {
      nodeHullDistRef.current = nodeHullDist;
    }
  }, [nodeHullDist]);
  useEffect(() => {
    if (lineHullDir) {
      lineHullDirRef.current = lineHullDir;
    }
  }, [lineHullDir]);
  useEffect(() => {
    if (nodeHullDir) {
      nodeHullDirRef.current = nodeHullDir;
    }
  }, [nodeHullDir]);

  const lineBrickReady = Boolean(lineAlpha);
  const nodeBrickReady = Boolean(nodeAlpha);
  const lineBrickTargetRef = useRef(lineBrickReady ? 1 : 0);
  const nodeBrickTargetRef = useRef(nodeBrickReady ? 1 : 0);
  const lineBrickBlendRef = useRef(lineBrickReady ? 1 : 0);
  const nodeBrickBlendRef = useRef(nodeBrickReady ? 1 : 0);
  useEffect(() => {
    lineBrickTargetRef.current = lineBrickReady ? 1 : 0;
  }, [lineBrickReady]);
  useEffect(() => {
    nodeBrickTargetRef.current = nodeBrickReady ? 1 : 0;
  }, [nodeBrickReady]);

  const lineHullReady = Boolean(lineHullDist && lineHullDir);
  const nodeHullReady = Boolean(nodeHullDist && nodeHullDir);
  const lineHullTargetRef = useRef(lineHullReady ? 1 : 0);
  const nodeHullTargetRef = useRef(nodeHullReady ? 1 : 0);
  const lineHullBlendRef = useRef(lineHullReady ? 1 : 0);
  const nodeHullBlendRef = useRef(nodeHullReady ? 1 : 0);
  useEffect(() => {
    lineHullTargetRef.current = lineHullReady ? 1 : 0;
  }, [lineHullReady]);
  useEffect(() => {
    nodeHullTargetRef.current = nodeHullReady ? 1 : 0;
  }, [nodeHullReady]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineAlphaVbo = lineAlphaVboRef.current;
    const nodeAlphaVbo = nodeAlphaVboRef.current;
    if (!lineAlphaVbo || !nodeAlphaVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineAlphaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineAlphaRef.current ?? defaultLineAlpha, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeAlphaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeAlphaRef.current ?? defaultNodeAlpha, gl.DYNAMIC_DRAW);
  }, [lineAlpha, nodeAlpha, defaultLineAlpha, defaultNodeAlpha]);
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineThetaVbo = lineThetaVboRef.current;
    const nodeThetaVbo = nodeThetaVboRef.current;
    if (!lineThetaVbo || !nodeThetaVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineThetaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineThetaRef.current ?? defaultLineTheta, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeThetaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeThetaRef.current ?? defaultNodeTheta, gl.DYNAMIC_DRAW);
  }, [lineTheta, nodeTheta, defaultLineTheta, defaultNodeTheta, renderPlanVersion]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineBetaVbo = lineBetaVboRef.current;
    const nodeBetaVbo = nodeBetaVboRef.current;
    if (!lineBetaVbo || !nodeBetaVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBetaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineBetaRef.current ?? defaultLineBeta, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBetaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeBetaRef.current ?? defaultNodeBeta, gl.DYNAMIC_DRAW);
  }, [lineBeta, nodeBeta, defaultLineBeta, defaultNodeBeta, renderPlanVersion]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineGammaVbo = lineGammaVboRef.current;
    const nodeGammaVbo = nodeGammaVboRef.current;
    if (!lineGammaVbo || !nodeGammaVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineGammaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineGammaRef.current ?? defaultLineGamma, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeGammaVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeGammaRef.current ?? defaultNodeGamma, gl.DYNAMIC_DRAW);
  }, [lineGamma, nodeGamma, defaultLineGamma, defaultNodeGamma, renderPlanVersion]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineShearVbo = lineShearVboRef.current;
    const nodeShearVbo = nodeShearVboRef.current;
    if (!lineShearVbo || !nodeShearVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineShearVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineShearRef.current ?? defaultLineShear, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeShearVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeShearRef.current ?? defaultNodeShear, gl.DYNAMIC_DRAW);
  }, [lineShear, nodeShear, defaultLineShear, defaultNodeShear, renderPlanVersion]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineConstraintVbo = lineConstraintVboRef.current;
    const nodeConstraintVbo = nodeConstraintVboRef.current;
    if (!lineConstraintVbo || !nodeConstraintVbo) return;
    if (lineConstraint) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineConstraintVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineConstraint, gl.DYNAMIC_DRAW);
    }
    if (nodeConstraint) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeConstraintVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeConstraint, gl.DYNAMIC_DRAW);
    }
  }, [lineConstraint, nodeConstraint]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineRegionVbo = lineRegionVboRef.current;
    const nodeRegionVbo = nodeRegionVboRef.current;
    if (!lineRegionVbo || !nodeRegionVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineRegion, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeRegion, gl.DYNAMIC_DRAW);
  }, [lineRegion, nodeRegion]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineRegionGridVbo = lineRegionGridVboRef.current;
    const nodeRegionGridVbo = nodeRegionGridVboRef.current;
    if (!lineRegionGridVbo || !nodeRegionGridVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionGridVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineRegionGrid, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionGridVbo);
    gl.bufferData(gl.ARRAY_BUFFER, nodeRegionGrid, gl.DYNAMIC_DRAW);
  }, [lineRegionGrid, nodeRegionGrid]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const lineHullVbo = lineHullVboRef.current;
    const nodeHullVbo = nodeHullVboRef.current;
    const lineHullDirVbo = lineHullDirVboRef.current;
    const nodeHullDirVbo = nodeHullDirVboRef.current;
    if (!lineHullVbo || !nodeHullVbo || !lineHullDirVbo || !nodeHullDirVbo) return;
    if (lineHullDist) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineHullVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineHullDist, gl.DYNAMIC_DRAW);
    }
    if (nodeHullDist) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeHullDist, gl.DYNAMIC_DRAW);
    }
    if (lineHullDir) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineHullDirVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineHullDir, gl.DYNAMIC_DRAW);
    }
    if (nodeHullDir) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullDirVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeHullDir, gl.DYNAMIC_DRAW);
    }
  }, [lineHullDist, nodeHullDist, lineHullDir, nodeHullDir]);

  const tuning = useMemo(() => normalizeKappaTuning(kappaTuning), [kappaTuning]);
  const tuningRef = useRef<KappaTuning>(DEFAULT_KAPPA_TUNING);
  useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);

  const kappaDriveValue = useMemo(() => computeKappaDrive(pipelineState), [pipelineState]);
  const kappaBlend = useMemo(() => mapKappaToUnit(kappaDriveValue, tuning), [kappaDriveValue, tuning]);
  const kappaBlendRef = useRef<number | null>(kappaBlend);
  const kappaBlendTargetRef = useRef<number | null>(kappaBlend);
  const defaultBlend = useMemo(() => defaultBlendFromTuning(tuning), [tuning]);
  const defaultBlendRef = useRef(defaultBlend);
  useEffect(() => {
    kappaBlendTargetRef.current = kappaBlend;
  }, [kappaBlend]);
  useEffect(() => {
    defaultBlendRef.current = defaultBlend;
  }, [defaultBlend]);

  const alphaSource = useMemo(() => {
    switch (renderPlan.sourceForAlpha) {
      case "gr-brick":
        return "gr-brick";
      case "lapse-brick":
        return "lapse-brick";
      case "analytic-proxy":
        return "analytic";
      case "none":
        return "none";
      default:
        return "analytic";
    }
  }, [renderPlan.sourceForAlpha]);

  const clockRateSource = useMemo(() => {
    if (!clockRateBrick) return "none";
    if (clockMode !== "static" && viewerChart !== "mp_like") return "alpha";
    const hasStatic = Boolean(getBrickChannel(clockRateBrick, "clockRate_static"));
    if (clockMode === "static" && hasStatic) return "clockRate_static";
    const hasGtt = Boolean(getBrickChannel(clockRateBrick, "g_tt"));
    return hasGtt ? "sqrt(-g_tt)" : "alpha";
  }, [clockRateBrick, clockMode, viewerChart]);

  const clockRateLabel = useMemo(() => {
    if (clockMode !== "static") {
      return viewerChart === "mp_like"
        ? `mp_like (${clockRateSource})`
        : "eulerian (alpha)";
    }
    return clockRateSource === "clockRate_static"
      ? "static (clockRate_static)"
      : clockRateSource === "sqrt(-g_tt)"
        ? "static (sqrt(-g_tt))"
        : "eulerian (alpha)";
  }, [clockMode, clockRateSource, viewerChart]);
  const mathGate = useMemo(() => {
    if (!renderPlan.flags.hasHull) {
      return {
        allowed: true,
        pending: false,
        reasons: [],
        modules: [],
      };
    }
    const reasons: string[] = [];
    const modules: Array<{ module: string; stage: MathStageLabel }> = [];
    const pending = mathGraphQuery.isLoading || mathGraphQuery.isFetching;
    const hasGraph = Boolean(mathGraph?.root);

    if (!hasGraph) {
      reasons.push(pending ? "math maturity graph pending" : "math maturity graph unavailable");
    }

    for (const entry of gateRequirements) {
      const stage = hasGraph
        ? mathNodeIndex.get(entry.module)?.stage ?? "unstaged"
        : "unstaged";
      modules.push({ module: entry.module, stage });
      if (hasGraph && !meetsStage(stage, entry.minStage)) {
        reasons.push(`stage blocked: ${entry.module} (${stage} < ${entry.minStage})`);
      }
    }

    if (!grRequested) {
      reasons.push("GR brick disabled");
    } else if (!useGrBrickData) {
      if (grQuery.isError) {
        reasons.push(`GR brick error: ${grErrorMessage ?? "unknown error"}`);
      } else if (grQuery.isFetching) {
        reasons.push("GR brick computing");
      } else {
        reasons.push("waiting for GR brick");
      }
    } else {
      if (renderPlan.sourceForTheta === "gr-brick" && !thetaSample) {
        reasons.push("missing theta channel");
      }
      if (grProxy) {
        reasons.push("GR guardrails proxy");
      }
      if (alphaSource !== "gr-brick") {
        reasons.push(`proxy alpha source: ${alphaSource}`);
      }
    }

    return {
      allowed: reasons.length === 0,
      pending,
      reasons,
      modules,
    };
  }, [
    alphaSource,
    mathGraph?.root,
    mathGraphQuery.isFetching,
    mathGraphQuery.isLoading,
    mathNodeIndex,
    grRequested,
    useGrBrickData,
    grProxy,
    grQuery.isError,
    grQuery.isFetching,
    grErrorMessage,
    thetaSample,
    renderPlan.sourceForTheta,
    gateRequirements,
    renderPlan.flags.hasHull,
  ]);

  const gateProgress = useMemo(() => {
    const steps: Array<{ label: string; ready: boolean }> = [];
    const hasGraph = Boolean(mathGraph?.root);
    steps.push({ label: "math graph", ready: hasGraph });
    for (const entry of gateRequirements) {
      const stage = hasGraph
        ? mathNodeIndex.get(entry.module)?.stage ?? "unstaged"
        : "unstaged";
      steps.push({ label: entry.module, ready: hasGraph && meetsStage(stage, entry.minStage) });
    }
    steps.push({ label: "gr enabled", ready: grRequested });
    if (grRequested) {
      const grReady = useGrBrickData && !grQuery.isFetching && !grQuery.isError;
      steps.push({ label: "gr brick", ready: grReady });
      steps.push({ label: "guardrails", ready: !grProxy });
      if (renderPlan.sourceForTheta === "gr-brick") {
        steps.push({ label: "theta channel", ready: Boolean(thetaSample) });
      }
      steps.push({ label: "alpha source", ready: alphaSource === "gr-brick" });
    }
    const total = steps.length;
    const ready = steps.reduce((sum, step) => sum + (step.ready ? 1 : 0), 0);
    const ratio = total > 0 ? ready / total : 0;
    return {
      ratio,
      ready,
      total,
    };
  }, [
    mathGraph?.root,
    mathNodeIndex,
    gateRequirements,
    grRequested,
    useGrBrickData,
    grQuery.isFetching,
    grQuery.isError,
    grProxy,
    thetaSample,
    alphaSource,
    renderPlan.sourceForTheta,
  ]);

  const truthBannerBlocked = !natarioCanonicalDiagnostics.requiredFieldsOk;
  const renderBlocked = bannerBlocked || !mathGate.allowed || truthBannerBlocked;

  const renderEnabled = certifiedModeEnabled && !renderBlocked;
  useEffect(() => {
    renderEnabledRef.current = renderEnabled;
  }, [renderEnabled]);
  const renderBanner = useMemo(() => {
    if (renderPlan.banner === "CERTIFIED") return null;
    let title = renderPlan.banner === "NO_HULL" ? "NO_HULL / MINKOWSKI" : renderPlan.banner;
    if (renderPlan.banner === "UNSTABLE" && renderPlan.flags.exploratoryOverride) {
      title = "UNSTABLE / EXPLORATORY";
    }
    const missing: string[] = [];
    if (!renderPlan.flags.hasHull) missing.push("hull geometry");
    if (grRequested && !renderPlan.flags.hasGrBrick) missing.push("GR brick");
    if (grRequested && renderPlan.flags.hasGrBrick && !renderPlan.flags.grCertified) {
      missing.push("certified GR");
    }
    if (renderPlan.flags.solverStatus !== "CERTIFIED" && !renderPlan.flags.exploratoryOverride) {
      missing.push("solver stability");
    }
    if (!renderPlan.flags.mathStageOK) missing.push("math stage");
    if (renderPlan.flags.anyProxy) missing.push("non-proxy inputs");
    if (!grRequested) missing.push("GR enabled");
    return {
      title,
      reasons: renderPlan.reasons,
      missing,
    };
  }, [renderPlan, grRequested]);
  const bannerDetails = useMemo(() => {
    if (!renderBanner) return null;
    const missing = renderBanner.missing.map((item) => `missing: ${item}`);
    const full = [...missing, ...renderBanner.reasons];
    const top = full.slice(0, 2);
    return {
      top,
      full,
      missing: renderBanner.missing,
      reasons: renderBanner.reasons,
    };
  }, [renderBanner]);

  const debugStats = useMemo(() => {
    if (!debugAllowed) return null;
    const thetaGeom = resolveThetaGeom(pipelineState);
    const ellK = computeKappaLengthScale(kappaDriveValue);
    const qiGuard = (pipelineState as any)?.qiGuardrail ?? {};
    const vdbTwoWallDerivativeSupport =
      (pipelineState as any)?.vdb_two_wall_derivative_support;
    const vdbTwoWallSupport = (pipelineState as any)?.vdb_two_wall_support;
    const vdbRegionIIDerivativeSupport =
      (pipelineState as any)?.vdb_region_ii_derivative_support;
    const vdbRegionIVDerivativeSupport =
      (pipelineState as any)?.vdb_region_iv_derivative_support;
    const qiRhoSource = qiGuard.rhoSource ?? "unknown";
    const qiCurvatureRatio = Number(qiGuard.curvatureRatio);
    const qiCurvatureOk = qiGuard.curvatureOk;
    const qiCurvatureEnforced = qiGuard.curvatureEnforced === true;
    const activationEffectiveSource =
      latticeMetricOnly && certifiedModeEnabled && renderPlanRef.current?.enableGeometryWarp
        ? "metric-override"
        : "pipeline";
    const base = {
      kappaDrive: kappaDriveValue,
      blend: kappaBlend,
      beta: betaField.value,
      sigma: bubbleParams.sigma,
      bubbleR: bubbleParams.R,
      center: bubbleParams.center,
      betaSource: betaField.source,
      sigmaSource: bubbleParams.sigmaSource,
      radiusSource: bubbleParams.radiusSource,
      centerSource: bubbleParams.centerSource,
      betaProxy: betaField.proxy,
      sigmaProxy: bubbleParams.sigmaProxy,
      radiusProxy: bubbleParams.radiusProxy,
      centerProxy: bubbleParams.centerProxy,
      grProxy,
      activation: activationMetrics.activation,
      activationEffective,
      activationEffectiveSource,
      activationBase: activationMetrics.activationBase,
      activationProxy: activationMetrics.activationProxy,
      powerW: activationMetrics.power.value,
      powerSource: activationMetrics.power.source,
      powerProxy: activationMetrics.power.proxy,
      dEff: activationMetrics.duty.value,
      dEffSource: activationMetrics.duty.source,
      dEffProxy: activationMetrics.duty.proxy,
      tsRatio: activationMetrics.tsRatio.value,
      tsRatioSource: activationMetrics.tsRatio.source,
      tsRatioProxy: activationMetrics.tsRatio.proxy,
      tsMetricDerived,
      tsMetricSource,
      tsMetricReason,
      gammaGeo: activationMetrics.gammaGeo.value,
      gammaGeoCubed: activationMetrics.gammaGeoCubed,
      gammaGeoSource: activationMetrics.gammaGeo.source,
      gammaGeoProxy: activationMetrics.gammaGeo.proxy,
      gammaVdB: activationMetrics.gammaVdB.value,
      gammaVdBSource: activationMetrics.gammaVdB.source,
      gammaVdBProxy: activationMetrics.gammaVdB.proxy,
      qSpoil: activationMetrics.qSpoil.value,
      qSpoilSource: activationMetrics.qSpoil.source,
      qSpoilProxy: activationMetrics.qSpoil.proxy,
      thetaGeom: thetaGeom.value,
      thetaGeomSource: thetaGeom.source,
      thetaGeomProxy: thetaGeom.proxy,
      thetaCal: activationMetrics.thetaCal.value,
      thetaSource: activationMetrics.thetaCal.source,
      thetaProxy: activationMetrics.thetaCal.proxy,
      kTraceMean: pipelineProofs.kTraceMean.value,
      kTraceSource: pipelineProofs.kTraceMean.source,
      kTraceProxy: pipelineProofs.kTraceMean.proxy,
      kSqMean: pipelineProofs.kSqMean.value,
      kSqSource: pipelineProofs.kSqMean.source,
      kSqProxy: pipelineProofs.kSqMean.proxy,
      qiRhoSource,
      qiCurvatureRatio: Number.isFinite(qiCurvatureRatio) ? qiCurvatureRatio : null,
      qiCurvatureOk,
      qiCurvatureEnforced,
      t00Min: pipelineProofs.t00Min.value,
      t00Source: pipelineProofs.t00Min.source,
      t00Proxy: pipelineProofs.t00Min.proxy,
      mExotic: pipelineProofs.mExotic.value,
      mExoticSource: pipelineProofs.mExotic.source,
      mExoticProxy: pipelineProofs.mExotic.proxy,
      guardrails: activationMetrics.guardrails,
      guardrailsSource: activationMetrics.guardrails.source,
      contractGuardrailSource,
      alphaSource,
      clockMode: clockRateLabel,
      viewerChart,
      hullField: hullField?.source ?? "none",
      hullFieldMode: hullField?.mode ?? "none",
      hullThickness,
      hullWall: hullWall.value,
      hullWallSource: hullWall.source,
      hullWallProxy: hullWall.proxy,
      ellK,
      vdbTwoWallSupport,
      vdbTwoWallDerivativeSupport,
      vdbRegionIIDerivativeSupport,
      vdbRegionIVDerivativeSupport,
    };

    if (kappaBlend === null) {
      return {
        ...base,
        blend: null,
        phiScale: DEFAULT_VISUALS.phiScale,
        warpStrength: DEFAULT_VISUALS.warpStrength,
        breathAmp: DEFAULT_VISUALS.breathAmp,
        softening: DEFAULT_VISUALS.softening,
      };
    }
    const blend = kappaBlend;
    return {
      ...base,
      blend,
      phiScale: lerp(tuning.phiMin, tuning.phiMax, blend),
      warpStrength: lerp(tuning.warpMin, tuning.warpMax, blend),
      breathAmp: lerp(tuning.breathMin, tuning.breathMax, blend),
      softening: lerp(tuning.softenMin, tuning.softenMax, 1 - blend),
    };
  }, [
    debugAllowed,
    kappaBlend,
    kappaDriveValue,
    tuning,
    betaField,
    bubbleParams,
    alphaSource,
    activationMetrics,
    pipelineProofs,
    hullField,
    hullThickness,
    hullWall,
    clockRateLabel,
    viewerChart,
    grProxy,
    pipelineState,
    contractGuardrailSource,
  ]);
  const warpProvenance = useMemo(() => {
    if (!debugAllowed) return null;
    const warpStrength = debugStats?.warpStrength ?? DEFAULT_VISUALS.warpStrength;
    return {
      plan: renderPlan,
      warpStrength,
      warpCap: renderPlan.warpCap,
      thetaNormalization,
    };
  }, [debugAllowed, debugStats, renderPlan, thetaNormalization, viewerChart]);

  useEffect(() => {
    if (!renderBlocked) return;
    setIsReady(false);
    readyRef.current = false;
  }, [renderBlocked]);

  const lapseStats = useMemo(() => {
    if (!debugAllowed || !lapseQuery.data) return null;
    const { dims, stats } = lapseQuery.data;
    return {
      dims,
      ...stats,
    };
  }, [debugAllowed, lapseQuery.data]);

  const grStats = useMemo(() => {
    if (!debugAllowed || !grQuery.data || !grRequested) return null;
    const alpha = grQuery.data.channels.alpha;
    const theta = getBrickChannel(grQuery.data, "theta");
    return {
      dims: grQuery.data.dims,
      alphaMin: toFiniteNumber(alpha?.min, 0),
      alphaMax: toFiniteNumber(alpha?.max, 0),
      thetaMin: toFiniteNumber(theta?.min, 0),
      thetaMax: toFiniteNumber(theta?.max, 0),
      thetaPeakAbs: toFiniteNumber(grQuery.data.stats?.thetaPeakAbs, 0),
      thetaGrowthPerStep: toFiniteNumber(grQuery.data.stats?.thetaGrowthPerStep, 0),
      gttMin: grDerived?.gttMin,
      gttMax: grDerived?.gttMax,
      betaMaxAbs: firstFinite(
        grDerived?.betaMaxAbs,
        (pipelineState as any)?.gr?.gauge?.betaMaxAbs,
      ),
      proxy: grProxy,
    };
  }, [debugAllowed, grQuery.data, grDerived, pipelineState, grProxy, grRequested]);

  const grPerf = useMemo(() => {
    if (!debugAllowed || !grRequested) return null;
    const perf = grQuery.data?.stats?.perf ?? (pipelineState as any)?.gr?.perf;
    if (!perf) return null;
    return {
      totalMs: toFiniteNumber(perf.totalMs, 0),
      evolveMs: toFiniteNumber(perf.evolveMs, 0),
      brickMs: toFiniteNumber(perf.brickMs, 0),
      voxels: toFiniteNumber(perf.voxels, 0),
      channelCount: toFiniteNumber(perf.channelCount, 0),
      bytesEstimate: toFiniteNumber(perf.bytesEstimate, 0),
      msPerStep: toFiniteNumber(perf.msPerStep, 0),
      source: grQuery.data?.stats?.perf ? "gr-brick" : (pipelineState as any)?.gr?.perf ? "pipeline-gr" : "missing",
    };
  }, [debugAllowed, grQuery.data, pipelineState, grRequested]);

  const grAssistantReport = grAssistantQuery.data ?? null;
  const grAssistantSummary = useMemo(() => {
    return buildGrAssistantSummary(grAssistantReport as any);
  }, [grAssistantReport]);
  const grAssistantStatus = useMemo(() => {
    if (grAssistantQuery.isFetching) return "checking";
    if (!grAssistantSummary) return "idle";
    return grAssistantSummary.status;
  }, [grAssistantQuery.isFetching, grAssistantSummary]);
  const grAssistantBadgeClass =
    grAssistantStatus === "pass"
      ? "bg-emerald-500/20 text-emerald-200"
      : grAssistantStatus === "fail"
        ? "bg-rose-500/20 text-rose-200"
        : grAssistantStatus === "unknown"
          ? "bg-amber-500/20 text-amber-200"
          : "bg-slate-500/20 text-slate-200";

  const solverDiagnostics = useMemo(() => {
    if (!debugAllowed) return null;
    const H_rms = firstFinite(
      grQuery.data?.stats?.H_rms,
      (pipelineState as any)?.gr?.constraints?.H_constraint?.rms,
    );
    const M_rms = firstFinite(
      grQuery.data?.stats?.M_rms,
      (pipelineState as any)?.gr?.constraints?.M_constraint?.rms,
    );
    if (!Number.isFinite(H_rms) && !Number.isFinite(M_rms)) return null;
    return {
      H_rms,
      M_rms,
      source: grQuery.data ? "gr-brick" : (pipelineState as any)?.gr ? "pipeline-gr" : "missing",
      proxy: grProxy,
    };
  }, [debugAllowed, grQuery.data, pipelineState, grProxy]);

  const solverHealthDiagnostics = useMemo(() => {
    if (!debugAllowed) return null;
    const health =
      grQuery.data?.stats?.solverHealth ?? (pipelineState as any)?.gr?.solver?.health;
    const fixups =
      grQuery.data?.stats?.fixups ?? (pipelineState as any)?.gr?.solver?.fixups;
    const meta = grQuery.data?.meta ?? (pipelineState as any)?.gr?.meta;
    if (!health && !fixups && !meta) return null;
    return {
      health,
      fixups,
      meta,
      source: grQuery.data?.stats?.solverHealth ? "gr-brick" : (pipelineState as any)?.gr ? "pipeline-gr" : "missing",
    };
  }, [debugAllowed, grQuery.data, pipelineState]);

  const shiftStiffnessDiagnostics = useMemo(() => {
    if (!debugAllowed) return null;
    const stiffness =
      grQuery.data?.stats?.stiffness ?? (pipelineState as any)?.gr?.stiffness;
    if (!stiffness) return null;
    const advectScheme = grQuery.data?.stats?.advectScheme;
    const dt_s = firstFinite(grQuery.data?.dt_s, (pipelineState as any)?.gr?.grid?.dt_s);
    const voxelSize = grQuery.data?.voxelSize_m ?? (pipelineState as any)?.gr?.grid?.voxelSize_m;
    let minSpacing = Number.NaN;
    if (Array.isArray(voxelSize) && voxelSize.length === 3) {
      const sx = Number(voxelSize[0]);
      const sy = Number(voxelSize[1]);
      const sz = Number(voxelSize[2]);
      if (Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz)) {
        minSpacing = Math.min(sx, sy, sz);
      }
    }
    const dtGeom = Number.isFinite(dt_s) ? (dt_s as number) * C : Number.NaN;
    const charSuggested = Number(stiffness.charCflSuggested ?? Number.NaN);
    const ratio =
      Number.isFinite(dtGeom) && Number.isFinite(charSuggested) && charSuggested > 0
        ? (dtGeom as number) / charSuggested
        : Number.NaN;
    const gradRatio =
      Number.isFinite(stiffness.gradBetaMaxAbs) && Number.isFinite(stiffness.gradBetaP98Abs) && stiffness.gradBetaP98Abs > 0
        ? stiffness.gradBetaMaxAbs / stiffness.gradBetaP98Abs
        : Number.NaN;
    let status: "ok" | "warning" | "severe" = "ok";
    let note: string | null = null;
    const shockSeverity = stiffness.shockSeverity;
    const hasShockSeverity =
      shockSeverity === "ok" || shockSeverity === "warn" || shockSeverity === "severe";
    if (hasShockSeverity) {
      status =
        shockSeverity === "severe"
          ? "severe"
          : shockSeverity === "warn"
            ? "warning"
            : "ok";
    } else if (
      (Number.isFinite(ratio) && ratio >= SHIFT_STIFF_SEVERE_RATIO) ||
      (Number.isFinite(gradRatio) && gradRatio >= SHIFT_STIFF_GRAD_SEVERE_RATIO)
    ) {
      status = "severe";
    } else if (
      (Number.isFinite(ratio) && ratio >= SHIFT_STIFF_WARN_RATIO) ||
      (Number.isFinite(gradRatio) && gradRatio >= SHIFT_STIFF_GRAD_WARN_RATIO)
    ) {
      status = "warning";
    } else if (!Number.isFinite(ratio) && !Number.isFinite(gradRatio)) {
      note = "insufficient dt or gradient data";
    }
    return {
      stiffness,
      advectScheme,
      minSpacing,
      dtGeom,
      ratio,
      gradRatio,
      status,
      note,
      source: grQuery.data?.stats?.stiffness ? "gr-brick" : (pipelineState as any)?.gr ? "pipeline-gr" : "missing",
    };
  }, [debugAllowed, grQuery.data, pipelineState]);

  const thetaDiagnostics = useMemo(() => {
    if (!debugAllowed) return null;
    const stressEnergy =
      grQuery.data?.stats?.stressEnergy ??
      (pipelineState as any)?.gr?.matter?.stressEnergy;
    const natario = stressEnergy?.natario;
    if (!natario) return null;
    const divPre = firstFinite(natario.divBetaMaxPre, natario.divBetaMax);
    const divPost = firstFinite(natario.divBetaMaxPost, natario.divBetaMax);
    const ratio =
      Number.isFinite(natario.clampScale)
        ? natario.clampScale
        : Number.isFinite(divPre) && divPre !== 0
          ? (divPost as number) / (divPre as number)
          : Number.NaN;
    const clampRate =
      Number.isFinite(natario.clampActivationRate) && natario.clampActivationRate !== undefined
        ? natario.clampActivationRate
        : Number.isFinite(natario.clampScale)
          ? 1 - (natario.clampScale as number)
          : Number.NaN;
    if (!Number.isFinite(divPre) && !Number.isFinite(divPost) && !Number.isFinite(ratio)) {
      return null;
    }
    return {
      divPre,
      divPost,
      ratio,
      clampRate,
      clampScale: natario.clampScale,
      clampMode: natario.clampMode,
      gateLimit: natario.gateLimit,
      divRms: natario.divBetaRmsPost ?? natario.divBetaRms,
      source: grQuery.data?.stats?.stressEnergy
        ? "gr-brick"
        : (pipelineState as any)?.gr?.matter?.stressEnergy
          ? "pipeline-gr"
          : "missing",
      proxy: grProxy,
    };
  }, [debugAllowed, grQuery.data, pipelineState, grProxy]);

  const modeSemantics = useMemo(() => {
    if (!debugAllowed) return null;
    if (warpFieldType === "natario") {
      return {
        mode: "natario" as const,
        note: "theta expected near 0",
        diagnostics: thetaDiagnostics,
      };
    }
    if (warpFieldType === "alcubierre") {
      return {
        mode: "alcubierre" as const,
        note: "dipole sign-flip required",
        dipole: thetaDipoleCheck,
        diagnostics: thetaDiagnostics,
      };
    }
    return null;
  }, [debugAllowed, warpFieldType, thetaDiagnostics, thetaDipoleCheck]);

  const diagnostics = useMemo(() => {
    if (!debugAllowed || !debugStats) return null;

    const lines: string[] = [];
    const alphaMin = useGrBrickData ? grStats?.alphaMin : lapseStats?.alphaMin;
    const alphaMax = useGrBrickData ? grStats?.alphaMax : lapseStats?.alphaMax;
    const phiMin = lapseStats?.phiMin;
    const phiMax = lapseStats?.phiMax;
    const gttMin = useGrBrickData ? grStats?.gttMin : lapseStats?.gttMin;
    const gttMax = useGrBrickData ? grStats?.gttMax : lapseStats?.gttMax;
    const alphaNearOne =
      Number.isFinite(alphaMin) &&
      Number.isFinite(alphaMax) &&
      Math.abs((alphaMin as number) - 1) < 1e-3 &&
      Math.abs((alphaMax as number) - 1) < 1e-3;
    const phiNearZero =
      Number.isFinite(phiMin) &&
      Number.isFinite(phiMax) &&
      Math.max(Math.abs(phiMin as number), Math.abs(phiMax as number)) < 1e-6;
    const gttNearMinusOne =
      Number.isFinite(gttMin) &&
      Number.isFinite(gttMax) &&
      Math.abs((gttMin as number) + 1) < 1e-3 &&
      Math.abs((gttMax as number) + 1) < 1e-3;

    if (useGrBrickData) {
      if (alphaNearOne && gttNearMinusOne) {
        lines.push(
          `GR brick is near Minkowski (alpha=[${formatFixed(alphaMin as number, 4)}, ${formatFixed(alphaMax as number, 4)}], g_tt=[${formatFixed(gttMin as number, 4)}, ${formatFixed(gttMax as number, 4)}]); lattice stays uniform even when alphaSource=${debugStats.alphaSource}.`,
        );
      }
    } else if (alphaNearOne && phiNearZero && gttNearMinusOne) {
      lines.push(
        `Lapse brick is near Minkowski (alpha=[${formatFixed(alphaMin as number, 4)}, ${formatFixed(alphaMax as number, 4)}], phi=[${formatSci(phiMin as number)}, ${formatSci(phiMax as number)}], g_tt=[${formatFixed(gttMin as number, 4)}, ${formatFixed(gttMax as number, 4)}]); lattice stays uniform even when alphaSource=${debugStats.alphaSource}.`,
      );
    }

    const ellKValue = debugStats.ellK ?? Number.NaN;
    const kappaTiny =
      Number.isFinite(debugStats.kappaDrive) && Math.abs(debugStats.kappaDrive) < 1e-30;
    const ellKHuge = Number.isFinite(ellKValue) && ellKValue > 1e20;
    if (kappaTiny || ellKHuge) {
      lines.push(
        `kappa_drive is tiny (${formatSci(debugStats.kappaDrive)} m^-2, ell_k=${formatSci(ellKValue)} m); blend is driven by tuning floor, not field strength.`,
      );
    }

    const proxyInputs =
      debugStats.activationProxy ||
      !Number.isFinite(debugStats.t00Min) ||
      !Number.isFinite(debugStats.mExotic);
    if (proxyInputs) {
      const activationText = formatProxyValue(
        formatFixed(debugStats.activation, 3),
        debugStats.activationProxy,
      );
      const t00Text = formatPipelineValue(
        formatSci(debugStats.t00Min, 2),
        debugStats.t00Source,
        debugStats.t00Proxy,
      );
      const mExoticText = formatPipelineValue(
        formatSci(debugStats.mExotic, 2),
        debugStats.mExoticSource,
        debugStats.mExoticProxy,
      );
      lines.push(
        `Proxy/fallback inputs (activation=${activationText}, T00_min=${t00Text}, M_exotic=${mExoticText}); this renderer cannot establish viability. Inspect authenticated FordRomanQI and ThetaAudit evidence in NHM2 Solve State.`,
      );
    }

    if (debugStats.hullField === "none") {
      lines.push("No hullDist/hullMask brick attached; hull contour disabled.");
    }

    if (lines.length === 0) {
      return { lines, nextChecks: [] as string[] };
    }

    const dEffText = formatPipelineValue(
      formatFixed(debugStats.dEff, 6),
      debugStats.dEffSource,
      debugStats.dEffProxy,
    );
    const gammaGeoText = formatPipelineValue(
      formatSci(debugStats.gammaGeo, 2),
      debugStats.gammaGeoSource,
      debugStats.gammaGeoProxy,
    );
    const gammaVdBText = formatPipelineValue(
      formatSci(debugStats.gammaVdB, 2),
      debugStats.gammaVdBSource,
      debugStats.gammaVdBProxy,
    );
    const qSpoilText = formatProxyValue(
      formatFixed(debugStats.qSpoil, 3),
      debugStats.qSpoilProxy,
      debugStats.qSpoilSource,
    );
    const tsRatioText = formatPipelineValue(
      formatSci(debugStats.tsRatio, 2),
      debugStats.tsRatioSource,
      debugStats.tsRatioProxy,
    );
    const betaText = formatProxyValue(
      formatFixed(debugStats.beta, 3),
      debugStats.betaProxy,
      debugStats.betaSource,
    );

    return {
      lines,
      nextChecks: [
        `Confirm nontrivial stress-energy inputs (d_eff=${dEffText}, gammaGeo=${gammaGeoText}, gammaVdB=${gammaVdBText}, qSpoil=${qSpoilText}, TS_ratio=${tsRatioText}; guardrails TS_ratio_min/VdB band) so phi is not flat.`,
        "Ensure a hullBrick is present in the pipeline snapshot or lapse brick carries hullDist/hullMask.",
        `If beta ~ 0 (near-rest), alpha should still show gradients when the solver field is nontrivial (beta=${betaText}).`,
      ],
    };
  }, [debugAllowed, debugStats, lapseStats, grStats, useGrBrickData]);

  const buildDiagnosticsPayload = React.useCallback(
    (mode: "export" | "auto" = "export") => {
      const includeDebugPayload = debugAllowed && mode === "export";
      const plan = renderPlanRef.current ?? renderPlan;
      const canonical = {
        family: proofStr("warp_canonical_family") ?? canonicalFamily,
        chart: proofStr("warp_canonical_chart"),
        observer: proofStr("warp_canonical_observer"),
        normalization: proofStr("warp_canonical_normalization"),
        unitSystem: proofStr("warp_canonical_unit_system"),
        match: proofStr("warp_canonical_match"),
      };
      const metricContract = {
        metric_t00_contract_ok: getProofValue(proofPack, "metric_t00_contract_ok")?.value ?? null,
        metric_chart_contract_status: getProofValue(proofPack, "metric_chart_contract_status")?.value ?? null,
        metric_chart_notes: getProofValue(proofPack, "metric_chart_notes")?.value ?? null,
        metric_coordinate_map: getProofValue(proofPack, "metric_coordinate_map")?.value ?? null,
      };

      return {
        kind: "time_dilation_diagnostics",
        source: "time_dilation_lattice",
        mode,
        captured_at: new Date().toISOString(),
        strict: {
          strictCongruence,
          latticeMetricOnly,
          debugBlocked,
          debugAllowed,
          renderBlocked,
          anyProxy,
          mathStageOK,
          grRequested,
          grCertified,
          banner: plan.banner,
        },
        canonical,
        natarioCanonical: {
          ...natarioCanonicalDiagnostics,
        },
        metric_contract: metricContract,
        render_plan: plan,
        gate: {
          banner: plan.banner,
          reasons: plan.reasons,
          flags: plan.flags,
          math_gate: mathGate,
          gate_progress: gateProgress,
        },
        sources: {
          alphaSource,
          betaSource: plan.sourceForBeta,
          thetaSource: plan.sourceForTheta,
          clockRateSource: plan.sourceForClockRate,
          clockRateLabel,
          warpFieldType,
          viewerChart,
        },
        warp_provenance: warpProvenance,
        debug_stats: includeDebugPayload ? debugStats : null,
        diagnostics: includeDebugPayload ? diagnostics : null,
        lapse_stats: includeDebugPayload ? lapseStats : null,
        gr_stats: includeDebugPayload ? grStats : null,
        solver: includeDebugPayload
          ? {
              solverDiagnostics,
              solverHealthDiagnostics,
              shiftStiffnessDiagnostics,
              thetaDiagnostics,
              modeSemantics,
              grAssistant: grAssistantSummary
                ? {
                    overallPass: grAssistantSummary.overallPass,
                    firstFail: grAssistantSummary.firstFail,
                    gatePass: grAssistantSummary.gate?.pass ?? null,
                    certificateHash: grAssistantSummary.gate?.certificate?.certificateHash ?? null,
                  }
                : null,
            }
          : null,
        hashes: diagnosticsHashes,
        training_trace_id: diagnosticsTraceId,
      };
    },
    [
      renderPlan,
      proofPack,
      proofStr,
      canonicalFamily,
      natarioCanonicalDiagnostics,
      strictCongruence,
      latticeMetricOnly,
      debugBlocked,
      debugAllowed,
      renderBlocked,
      anyProxy,
      mathStageOK,
      grRequested,
      grCertified,
      alphaSource,
      clockRateLabel,
      warpFieldType,
      viewerChart,
      warpProvenance,
      debugStats,
      diagnostics,
      lapseStats,
      grStats,
      solverDiagnostics,
      solverHealthDiagnostics,
      shiftStiffnessDiagnostics,
      thetaDiagnostics,
      modeSemantics,
      grAssistantSummary,
      diagnosticsHashes,
      diagnosticsTraceId,
      gateProgress,
      mathGate,
    ],
  );

  const handleExportDiagnostics = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const payload = buildDiagnosticsPayload("export");
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `time-dilation-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [buildDiagnosticsPayload]);

  const publishDiagnostics = React.useCallback(
    async (payload: unknown, signal?: AbortSignal) => {
      try {
        await fetch("/api/helix/time-dilation/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[time-dilation] diagnostics publish failed", err);
      }
    },
    [],
  );

  useEffect(() => {
    if (!debugAutoPublish || !debugAllowed) return;
    const payload = buildDiagnosticsPayload("auto");
    const now = Date.now();
    if (now - lastDiagnosticsPublishRef.current < 5000) return;
    lastDiagnosticsPublishRef.current = now;
    const controller = new AbortController();
    void publishDiagnostics(payload, controller.signal);
    return () => controller.abort();
  }, [debugAutoPublish, debugAllowed, buildDiagnosticsPayload, publishDiagnostics]);

  useEffect(() => {
    setDebugEnabled(showDebug);
  }, [showDebug]);

  const requestGrBrick = () => {
    setGrEnabled(true);
    grQuery.refetch();
  };

  const requestRegionStats = () => {
    setRegionEnabled(true);
    regionQuery.refetch();
  };

  const resetVisualTuning = () => {
    setVisualTuning(DEFAULT_VISUAL_TUNING);
  };

  const applyExploreTuning = () => {
    setVisualTuning(EXPLORE_VISUAL_TUNING);
  };

  useEffect(() => {
    if (renderBlocked) return;
    const cv = canvasRef.current;
    if (!cv) return;

    setGlStatus("ok");
    setGlError(null);
    setIsReady(false);
    readyRef.current = false;

    let started = false;
    let canceled = false;
    let cleanup = () => {};
    const start = () => {
      if (canceled) return;
      started = true;
      const gl = cv.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
      if (!gl) {
        setGlStatus("no-webgl");
        setGlError("WebGL2 unavailable (context creation failed).");
        return;
      }
      glRef.current = gl;
      releaseContextRef.current();
      releaseContextRef.current = registerWebGLContext(gl, { label: "TimeDilationLatticePanel" });

      let prog: WebGLProgram;
      let shaderMode: "full" | "compat" = "full";
      try {
        prog = createProgram(gl, VERT, FRAG, ATTRIB_BINDINGS);
      } catch (err) {
        console.warn("[TimeDilationLattice] Full shader compile failed, attempting compatibility shader", err);
        try {
          prog = createProgram(gl, VERT_COMPAT, FRAG_COMPAT, ATTRIB_BINDINGS);
          shaderMode = "compat";
        } catch (fallbackErr) {
          setGlStatus("compile-fail");
          setGlError(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
          return;
        }
      }
      progRef.current = prog;
      if (shaderMode === "compat") {
        setGlError("Using compatibility shader mode due to driver compile limits.");
      }

        const lineVbo = gl.createBuffer();
        const nodeVbo = gl.createBuffer();
        const lineAlphaVbo = gl.createBuffer();
        const nodeAlphaVbo = gl.createBuffer();
        const lineThetaVbo = gl.createBuffer();
        const nodeThetaVbo = gl.createBuffer();
        const lineBetaVbo = gl.createBuffer();
        const nodeBetaVbo = gl.createBuffer();
      const lineGammaVbo = gl.createBuffer();
      const nodeGammaVbo = gl.createBuffer();
      const lineShearVbo = gl.createBuffer();
      const nodeShearVbo = gl.createBuffer();
      const lineConstraintVbo = gl.createBuffer();
      const nodeConstraintVbo = gl.createBuffer();
      const lineRegionVbo = gl.createBuffer();
      const nodeRegionVbo = gl.createBuffer();
      const lineRegionGridVbo = gl.createBuffer();
      const nodeRegionGridVbo = gl.createBuffer();
      const lineHullVbo = gl.createBuffer();
      const nodeHullVbo = gl.createBuffer();
      const lineHullDirVbo = gl.createBuffer();
      const nodeHullDirVbo = gl.createBuffer();
      if (
          !lineVbo ||
          !nodeVbo ||
          !lineAlphaVbo ||
          !nodeAlphaVbo ||
          !lineThetaVbo ||
          !nodeThetaVbo ||
          !lineBetaVbo ||
          !nodeBetaVbo ||
        !lineGammaVbo ||
        !nodeGammaVbo ||
        !lineShearVbo ||
        !nodeShearVbo ||
        !lineConstraintVbo ||
        !nodeConstraintVbo ||
        !lineRegionVbo ||
        !nodeRegionVbo ||
        !lineRegionGridVbo ||
        !nodeRegionGridVbo ||
        !lineHullVbo ||
        !nodeHullVbo ||
        !lineHullDirVbo ||
        !nodeHullDirVbo
      ) {
        setGlStatus("compile-fail");
        setGlError("WebGL buffer creation failed.");
        return;
      }
        lineVboRef.current = lineVbo;
        nodeVboRef.current = nodeVbo;
        lineAlphaVboRef.current = lineAlphaVbo;
        nodeAlphaVboRef.current = nodeAlphaVbo;
        lineThetaVboRef.current = lineThetaVbo;
        nodeThetaVboRef.current = nodeThetaVbo;
        lineBetaVboRef.current = lineBetaVbo;
        nodeBetaVboRef.current = nodeBetaVbo;
      lineGammaVboRef.current = lineGammaVbo;
      nodeGammaVboRef.current = nodeGammaVbo;
      lineShearVboRef.current = lineShearVbo;
      nodeShearVboRef.current = nodeShearVbo;
      lineConstraintVboRef.current = lineConstraintVbo;
      nodeConstraintVboRef.current = nodeConstraintVbo;
      lineRegionVboRef.current = lineRegionVbo;
      nodeRegionVboRef.current = nodeRegionVbo;
      lineRegionGridVboRef.current = lineRegionGridVbo;
      nodeRegionGridVboRef.current = nodeRegionGridVbo;
      lineHullVboRef.current = lineHullVbo;
      nodeHullVboRef.current = nodeHullVbo;
      lineHullDirVboRef.current = lineHullDirVbo;
      nodeHullDirVboRef.current = nodeHullDirVbo;

      gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineVerts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeVerts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineAlphaVbo);
        gl.bufferData(gl.ARRAY_BUFFER, lineAlphaRef.current ?? defaultLineAlpha, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeAlphaVbo);
        gl.bufferData(gl.ARRAY_BUFFER, nodeAlphaRef.current ?? defaultNodeAlpha, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineThetaVbo);
        gl.bufferData(gl.ARRAY_BUFFER, lineThetaRef.current ?? defaultLineTheta, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeThetaVbo);
        gl.bufferData(gl.ARRAY_BUFFER, nodeThetaRef.current ?? defaultNodeTheta, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBetaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineBetaRef.current ?? defaultLineBeta, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBetaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeBetaRef.current ?? defaultNodeBeta, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineGammaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineGammaRef.current ?? defaultLineGamma, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeGammaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeGammaRef.current ?? defaultNodeGamma, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineShearVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineShearRef.current ?? defaultLineShear, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeShearVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeShearRef.current ?? defaultNodeShear, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineConstraintVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        lineConstraintRef.current ?? defaultLineConstraint,
        gl.DYNAMIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeConstraintVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        nodeConstraintRef.current ?? defaultNodeConstraint,
        gl.DYNAMIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineRegionRef.current ?? defaultLineRegion, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeRegionRef.current ?? defaultNodeRegion, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionGridVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        lineRegionGridRef.current ?? defaultLineRegionGrid,
        gl.DYNAMIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionGridVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        nodeRegionGridRef.current ?? defaultNodeRegionGrid,
        gl.DYNAMIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, lineHullVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineHullDistRef.current ?? defaultLineHullDist, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeHullDistRef.current ?? defaultNodeHullDist, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineHullDirVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineHullDirRef.current ?? defaultLineHullDir, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullDirVbo);
      gl.bufferData(gl.ARRAY_BUFFER, nodeHullDirRef.current ?? defaultNodeHullDir, gl.DYNAMIC_DRAW);

      const uniforms = {
        u_mvp: gl.getUniformLocation(prog, "u_mvp"),
        u_time: gl.getUniformLocation(prog, "u_time"),
        u_gridScale: gl.getUniformLocation(prog, "u_gridScale"),
        u_worldScale: gl.getUniformLocation(prog, "u_worldScale"),
        u_driveDir: gl.getUniformLocation(prog, "u_driveDir"),
        u_bubbleCenter: gl.getUniformLocation(prog, "u_bubbleCenter"),
        u_bubbleR: gl.getUniformLocation(prog, "u_bubbleR"),
        u_sigma: gl.getUniformLocation(prog, "u_sigma"),
          u_beta: gl.getUniformLocation(prog, "u_beta"),
          u_betaCenter: gl.getUniformLocation(prog, "u_betaCenter"),
          u_betaScale: gl.getUniformLocation(prog, "u_betaScale"),
          u_betaWarpWeight: gl.getUniformLocation(prog, "u_betaWarpWeight"),    
          u_geomWarpScale: gl.getUniformLocation(prog, "u_geomWarpScale"),      
          u_warpCap: gl.getUniformLocation(prog, "u_warpCap"),
          u_phiScale: gl.getUniformLocation(prog, "u_phiScale"),
          u_alphaMin: gl.getUniformLocation(prog, "u_alphaMin"),
          u_thetaScale: gl.getUniformLocation(prog, "u_thetaScale"),
          u_thetaWarpWeight: gl.getUniformLocation(prog, "u_thetaWarpWeight"),
          u_softening: gl.getUniformLocation(prog, "u_softening"),
        u_warpStrength: gl.getUniformLocation(prog, "u_warpStrength"),
        u_breathAmp: gl.getUniformLocation(prog, "u_breathAmp"),
        u_breathRate: gl.getUniformLocation(prog, "u_breathRate"),
        u_pulseRate: gl.getUniformLocation(prog, "u_pulseRate"),
        u_pointSize: gl.getUniformLocation(prog, "u_pointSize"),
        u_pointPass: gl.getUniformLocation(prog, "u_pointPass"),
        u_alphaScale: gl.getUniformLocation(prog, "u_alphaScale"),
        u_metricBlend: gl.getUniformLocation(prog, "u_metricBlend"),
        u_shearStrength: gl.getUniformLocation(prog, "u_shearStrength"),
        u_constraintScale: gl.getUniformLocation(prog, "u_constraintScale"),
        u_constraintIso: gl.getUniformLocation(prog, "u_constraintIso"),
        u_constraintWidth: gl.getUniformLocation(prog, "u_constraintWidth"),
        u_brickBlend: gl.getUniformLocation(prog, "u_brickBlend"),
        u_activation: gl.getUniformLocation(prog, "u_activation"),
        u_hullThickness: gl.getUniformLocation(prog, "u_hullThickness"),
        u_hullBlend: gl.getUniformLocation(prog, "u_hullBlend"),
        u_regionTint: gl.getUniformLocation(prog, "u_regionTint"),
        u_regionTintScale: gl.getUniformLocation(prog, "u_regionTintScale"),
        u_regionGrid: gl.getUniformLocation(prog, "u_regionGrid"),
        u_regionGridAlpha: gl.getUniformLocation(prog, "u_regionGridAlpha"),
      };

      const mvp = new Float32Array(16);
      const view = new Float32Array(16);
      const proj = new Float32Array(16);
      let aspect = 1.0;
      let raf = 0;
      const t0 = performance.now();
      lastTimeRef.current = null;

      const onResize = () => {
        resizeCanvasAndViewport(gl, cv);
        aspect = Math.max(0.5, cv.width / Math.max(1, cv.height));
      };
      onResize();
      const ro = new ResizeObserver(onResize);
      ro.observe(cv);

      const onLost = (event: Event) => {
        event.preventDefault();
        setGlStatus("context-lost");
        setIsReady(false);
        readyRef.current = false;
      };
      const onRestored = () => {
        setGlStatus("ok");
        setGlError(null);
        setIsReady(false);
        readyRef.current = false;
        setGlEpoch((value) => value + 1);
      };
      cv.addEventListener("webglcontextlost", onLost as any, false);
      cv.addEventListener("webglcontextrestored", onRestored as any, false);

      const draw = () => {
        if (!progRef.current || !glRef.current) return;
        if (gl.isContextLost()) {
          setGlStatus("context-lost");
          return;
        }
        if (!renderEnabledRef.current) {
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          raf = requestAnimationFrame(draw);
          return;
        }

        const t = (performance.now() - t0) / 1000;
        const lastT = lastTimeRef.current;
        const dt = lastT === null ? 0 : Math.max(0, t - lastT);
        lastTimeRef.current = t;
        const settings = settingsRef.current;
        const tuningNow = tuningRef.current;
        const targetBlend = kappaBlendTargetRef.current;
        const fallbackBlend = defaultBlendRef.current;
        if (typeof targetBlend === "number") {
          const currentBlend =
            typeof kappaBlendRef.current === "number" ? kappaBlendRef.current : fallbackBlend;
          const nextBlend = smoothExp(currentBlend, targetBlend, tuningNow.smooth, dt);
          kappaBlendRef.current = nextBlend;
          applyKappaBlend(settings, nextBlend, tuningNow);
        } else {
          kappaBlendRef.current = fallbackBlend;
          applyKappaDefaults(settings);
        }
        const orbit = t * 0.18;
        const elevation = 0.5;
        const radius = 3.0 * settings.gridScale;
        const eye: [number, number, number] = [
          Math.cos(orbit) * radius,
          Math.sin(elevation) * radius,
          Math.sin(orbit) * radius,
        ];

        perspective(proj, 40 * (Math.PI / 180), aspect, 0.1, 80);
        lookAt(view, eye, [0, 0, 0], [0, 1, 0]);
        mul(mvp, proj, view);

        const bubble = bubbleRef.current;
        const worldScale = latticeBoundsRef.current.axes;
        const dir = driveDirRef.current;
        const activation = smoothExp(
          activationRef.current,
          activationTargetRef.current,
          ACTIVATION_TAU,
          dt,
        );
        activationRef.current = activation;
        const visual = visualTuningRef.current;
        const plan = renderPlanRef.current ?? renderPlan;
        const betaCenter = betaCenterRef.current ?? [0, 0, 0];
        const geomWarpScale = Math.max(0, plan.geomWarpScale);
        const betaWarpWeight = Math.max(0, plan.betaWarpWeight);
        const thetaWarpWeight = Math.max(0, plan.thetaWarpWeight);
        const betaScaleBase = Math.max(0, visual.betaScale);
        const betaWarpScale = Math.max(0, plan.normalization.beta.scale);
        const betaFieldValue =
          plan.sourceForBeta === "gr-brick" ? betaFieldRef.current.value : bubble.beta;
        const betaEffective = betaFieldValue * activation * betaScaleBase;
        const metricBlend = Math.max(0, plan.metricBlend);
        const shearStrength = Math.max(0, plan.shearWeight);
        const warpCap = Math.max(1e-6, plan.warpCap);
        const lineBrickBlend = smoothExp(
          lineBrickBlendRef.current,
          lineBrickTargetRef.current,
          BRICK_BLEND_TAU,
          dt,
        );
        const nodeBrickBlend = smoothExp(
          nodeBrickBlendRef.current,
          nodeBrickTargetRef.current,
          BRICK_BLEND_TAU,
          dt,
        );
        lineBrickBlendRef.current = lineBrickBlend;
        nodeBrickBlendRef.current = nodeBrickBlend;
        const lineHullBlend = smoothExp(
          lineHullBlendRef.current,
          lineHullTargetRef.current,
          HULL_BLEND_TAU,
          dt,
        );
        const nodeHullBlend = smoothExp(
          nodeHullBlendRef.current,
          nodeHullTargetRef.current,
          HULL_BLEND_TAU,
          dt,
        );
        lineHullBlendRef.current = lineHullBlend;
        nodeHullBlendRef.current = nodeHullBlend;
        const hullThicknessNow = hullThicknessRef.current;

        gl.clearColor(0.03, 0.04, 0.07, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(prog);
        gl.uniformMatrix4fv(uniforms.u_mvp, false, mvp);
        gl.uniform1f(uniforms.u_time, t);
        gl.uniform1f(uniforms.u_gridScale, settings.gridScale);
        gl.uniform3f(uniforms.u_worldScale, worldScale[0], worldScale[1], worldScale[2]);
        gl.uniform3f(uniforms.u_driveDir, dir[0], dir[1], dir[2]);
        gl.uniform3f(uniforms.u_bubbleCenter, bubble.center[0], bubble.center[1], bubble.center[2]);
        gl.uniform1f(uniforms.u_bubbleR, bubble.R);
        gl.uniform1f(uniforms.u_sigma, bubble.sigma);
        gl.uniform1f(uniforms.u_beta, betaEffective);
        gl.uniform3f(uniforms.u_betaCenter, betaCenter[0], betaCenter[1], betaCenter[2]);
        gl.uniform1f(uniforms.u_betaScale, betaWarpScale);
        gl.uniform1f(uniforms.u_betaWarpWeight, betaWarpWeight);
        gl.uniform1f(uniforms.u_geomWarpScale, geomWarpScale);
        gl.uniform1f(uniforms.u_warpCap, warpCap);
        gl.uniform1f(uniforms.u_phiScale, settings.phiScale);
        gl.uniform1f(uniforms.u_alphaMin, settings.alphaMin);
        gl.uniform1f(uniforms.u_softening, settings.softening);
        gl.uniform1f(uniforms.u_warpStrength, settings.warpStrength);
        gl.uniform1f(uniforms.u_breathAmp, settings.breathAmp);
        gl.uniform1f(uniforms.u_breathRate, settings.breathRate);
        gl.uniform1f(uniforms.u_pulseRate, settings.pulseRate);
        gl.uniform1f(uniforms.u_pointSize, settings.pointSize);
        gl.uniform1f(uniforms.u_alphaScale, visual.alphaScale);
        gl.uniform1f(uniforms.u_thetaScale, Math.max(0, plan.normalization.theta.scale));
        gl.uniform1f(uniforms.u_thetaWarpWeight, thetaWarpWeight);
        gl.uniform1f(uniforms.u_metricBlend, metricBlend);
        gl.uniform1f(uniforms.u_shearStrength, shearStrength);
        gl.uniform1f(
          uniforms.u_constraintScale,
          visual.constraintEnabled ? constraintScaleRef.current * visual.constraintScale : 0,
        );
        gl.uniform1f(uniforms.u_constraintIso, CONSTRAINT_ISO_LEVEL);
        gl.uniform1f(uniforms.u_constraintWidth, CONSTRAINT_ISO_WIDTH);
        gl.uniform1f(uniforms.u_activation, activation);
        gl.uniform1f(uniforms.u_hullThickness, hullThicknessNow);
        const regionVisual = regionVisualRef.current;
        const regionFlags = regionStatsRef.current;
        gl.uniform1f(
          uniforms.u_regionTint,
          regionVisual.tint && regionFlags.hasTint ? 1 : 0,
        );
        gl.uniform1f(uniforms.u_regionTintScale, Math.max(0, regionVisual.tintScale));
        gl.uniform1f(
          uniforms.u_regionGrid,
          regionVisual.grid && regionFlags.hasGrid ? 1 : 0,
        );
        gl.uniform1f(uniforms.u_regionGridAlpha, REGION_GRID_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        if (lineAlphaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineAlphaVboRef.current);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(1);
          gl.vertexAttrib1f(1, 1.0);
        }
        if (lineHullVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineHullVboRef.current);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(2);
          gl.vertexAttrib1f(2, hullFallbackDistance);
        }
        if (lineHullDirVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineHullDirVboRef.current);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(3);
          gl.vertexAttrib3f(3, 0, 0, 0);
        }
        if (lineBetaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBetaVboRef.current);
          gl.enableVertexAttribArray(4);
          gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(4);
          gl.vertexAttrib3f(4, 0, 0, 0);
        }
        if (lineGammaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineGammaVboRef.current);
          gl.enableVertexAttribArray(5);
          gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(5);
          gl.vertexAttrib3f(5, 1, 1, 1);
        }
        if (lineShearVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineShearVboRef.current);
          gl.enableVertexAttribArray(6);
          gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(6);
          gl.vertexAttrib3f(6, 0, 0, 0);
        }
        if (lineConstraintVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineConstraintVboRef.current);
          gl.enableVertexAttribArray(7);
          gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(7);
          gl.vertexAttrib1f(7, 0);
        }
        if (lineRegionVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionVboRef.current);
          gl.enableVertexAttribArray(8);
          gl.vertexAttribPointer(8, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(8);
          gl.vertexAttrib1f(8, 0);
        }
          if (lineRegionGridVboRef.current) {
            gl.bindBuffer(gl.ARRAY_BUFFER, lineRegionGridVboRef.current);
            gl.enableVertexAttribArray(9);
            gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(9);
            gl.vertexAttrib1f(9, 0);
          }
          if (lineThetaVboRef.current) {
            gl.bindBuffer(gl.ARRAY_BUFFER, lineThetaVboRef.current);
            gl.enableVertexAttribArray(10);
            gl.vertexAttribPointer(10, 1, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(10);
            gl.vertexAttrib1f(10, 0);
          }
        gl.uniform1f(uniforms.u_brickBlend, lineBrickBlend);
        gl.uniform1f(uniforms.u_hullBlend, lineHullBlend);
        gl.uniform1f(uniforms.u_pointPass, 0.0);
        gl.drawArrays(gl.LINES, 0, lineCount);

        gl.bindBuffer(gl.ARRAY_BUFFER, nodeVbo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        if (nodeAlphaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeAlphaVboRef.current);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(1);
          gl.vertexAttrib1f(1, 1.0);
        }
        if (nodeHullVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullVboRef.current);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(2);
          gl.vertexAttrib1f(2, hullFallbackDistance);
        }
        if (nodeHullDirVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeHullDirVboRef.current);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(3);
          gl.vertexAttrib3f(3, 0, 0, 0);
        }
        if (nodeBetaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeBetaVboRef.current);
          gl.enableVertexAttribArray(4);
          gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(4);
          gl.vertexAttrib3f(4, 0, 0, 0);
        }
        if (nodeGammaVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeGammaVboRef.current);
          gl.enableVertexAttribArray(5);
          gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(5);
          gl.vertexAttrib3f(5, 1, 1, 1);
        }
        if (nodeShearVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeShearVboRef.current);
          gl.enableVertexAttribArray(6);
          gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(6);
          gl.vertexAttrib3f(6, 0, 0, 0);
        }
        if (nodeConstraintVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeConstraintVboRef.current);
          gl.enableVertexAttribArray(7);
          gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(7);
          gl.vertexAttrib1f(7, 0);
        }
        if (nodeRegionVboRef.current) {
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionVboRef.current);
          gl.enableVertexAttribArray(8);
          gl.vertexAttribPointer(8, 1, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(8);
          gl.vertexAttrib1f(8, 0);
        }
          if (nodeRegionGridVboRef.current) {
            gl.bindBuffer(gl.ARRAY_BUFFER, nodeRegionGridVboRef.current);
            gl.enableVertexAttribArray(9);
            gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(9);
            gl.vertexAttrib1f(9, 0);
          }
          if (nodeThetaVboRef.current) {
            gl.bindBuffer(gl.ARRAY_BUFFER, nodeThetaVboRef.current);
            gl.enableVertexAttribArray(10);
            gl.vertexAttribPointer(10, 1, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(10);
            gl.vertexAttrib1f(10, 0);
          }
        gl.uniform1f(uniforms.u_brickBlend, nodeBrickBlend);
        gl.uniform1f(uniforms.u_hullBlend, nodeHullBlend);
        gl.uniform1f(uniforms.u_pointPass, 1.0);
        gl.drawArrays(gl.POINTS, 0, nodeCount);

        if (!readyRef.current) {
          readyRef.current = true;
          setIsReady(true);
        }

        raf = requestAnimationFrame(draw);
      };

      draw();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        cv.removeEventListener("webglcontextlost", onLost as any);
        cv.removeEventListener("webglcontextrestored", onRestored as any);
        if (glRef.current === gl) {
          if (progRef.current) {
            gl.deleteProgram(progRef.current);
            progRef.current = null;
          }
          if (lineVboRef.current) {
            gl.deleteBuffer(lineVboRef.current);
            lineVboRef.current = null;
          }
          if (nodeVboRef.current) {
            gl.deleteBuffer(nodeVboRef.current);
            nodeVboRef.current = null;
          }
            if (lineAlphaVboRef.current) {
              gl.deleteBuffer(lineAlphaVboRef.current);
              lineAlphaVboRef.current = null;
            }
            if (nodeAlphaVboRef.current) {
              gl.deleteBuffer(nodeAlphaVboRef.current);
              nodeAlphaVboRef.current = null;
            }
            if (lineThetaVboRef.current) {
              gl.deleteBuffer(lineThetaVboRef.current);
              lineThetaVboRef.current = null;
            }
            if (nodeThetaVboRef.current) {
              gl.deleteBuffer(nodeThetaVboRef.current);
              nodeThetaVboRef.current = null;
            }
          if (lineBetaVboRef.current) {
            gl.deleteBuffer(lineBetaVboRef.current);
            lineBetaVboRef.current = null;
          }
          if (nodeBetaVboRef.current) {
            gl.deleteBuffer(nodeBetaVboRef.current);
            nodeBetaVboRef.current = null;
          }
          if (lineGammaVboRef.current) {
            gl.deleteBuffer(lineGammaVboRef.current);
            lineGammaVboRef.current = null;
          }
          if (nodeGammaVboRef.current) {
            gl.deleteBuffer(nodeGammaVboRef.current);
            nodeGammaVboRef.current = null;
          }
          if (lineShearVboRef.current) {
            gl.deleteBuffer(lineShearVboRef.current);
            lineShearVboRef.current = null;
          }
          if (nodeShearVboRef.current) {
            gl.deleteBuffer(nodeShearVboRef.current);
            nodeShearVboRef.current = null;
          }
          if (lineConstraintVboRef.current) {
            gl.deleteBuffer(lineConstraintVboRef.current);
            lineConstraintVboRef.current = null;
          }
          if (nodeConstraintVboRef.current) {
            gl.deleteBuffer(nodeConstraintVboRef.current);
            nodeConstraintVboRef.current = null;
          }
          if (lineRegionVboRef.current) {
            gl.deleteBuffer(lineRegionVboRef.current);
            lineRegionVboRef.current = null;
          }
          if (nodeRegionVboRef.current) {
            gl.deleteBuffer(nodeRegionVboRef.current);
            nodeRegionVboRef.current = null;
          }
          if (lineRegionGridVboRef.current) {
            gl.deleteBuffer(lineRegionGridVboRef.current);
            lineRegionGridVboRef.current = null;
          }
          if (nodeRegionGridVboRef.current) {
            gl.deleteBuffer(nodeRegionGridVboRef.current);
            nodeRegionGridVboRef.current = null;
          }
          if (lineHullVboRef.current) {
            gl.deleteBuffer(lineHullVboRef.current);
            lineHullVboRef.current = null;
          }
          if (nodeHullVboRef.current) {
            gl.deleteBuffer(nodeHullVboRef.current);
            nodeHullVboRef.current = null;
          }
          if (lineHullDirVboRef.current) {
            gl.deleteBuffer(lineHullDirVboRef.current);
            lineHullDirVboRef.current = null;
          }
          if (nodeHullDirVboRef.current) {
            gl.deleteBuffer(nodeHullDirVboRef.current);
            nodeHullDirVboRef.current = null;
          }
          glRef.current = null;
        }
        releaseContextRef.current();
        releaseContextRef.current = () => {};
      };
    };

    const startHandle = window.setTimeout(start, 60);
    return () => {
      canceled = true;
      window.clearTimeout(startHandle);
      if (started) cleanup();
    };
  }, [lineVerts, nodeVerts, lineCount, nodeCount, glEpoch, renderBlocked]);

  if (glStatus === "no-webgl" || glStatus === "compile-fail") {
    return (
      <div className={cn("rounded-lg border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300", className)}>
        <div className="font-semibold text-slate-100">WebGL2 unavailable</div>
        <div className="mt-1 text-xs text-slate-400">
          This view needs WebGL2. Try enabling hardware acceleration or using a newer browser.
        </div>
        {glError ? <div className="mt-2 text-xs text-amber-300">Error: {glError}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-slate-800 bg-black/60">
        <canvas
          ref={canvasRef}
          className={cn("h-full w-full block", renderBlocked && "opacity-20")}
        />
        {renderBlocked ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-6 text-center text-xs text-slate-200">
            Strict metric-only mode: proxy or uncertified inputs detected. Waiting for a certified GR brick and
            non-proxy telemetry before rendering the lattice.
          </div>
        ) : null}
        <div className="absolute inset-x-3 top-3 z-20 rounded border border-cyan-400/40 bg-black/80 px-3 py-2 text-[10px] text-cyan-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 uppercase tracking-[0.18em]">
            <span>congruence: {strictCongruence ? "strict" : "relaxed"}</span>
            <span>render gate (diagnostic): {renderPlan.banner}</span>
            <span>GR assistant cert integrity: {String((grAssistantSummary?.gate?.certificate as any)?.integrityStatus ?? (grAssistantSummary?.gate?.certificate as any)?.integrity ?? "unknown")}</span>
            <span>GR assistant cert hash: {grAssistantSummary?.gate?.certificate?.certificateHash ?? "n/a"}</span>
          </div>
          {truthBannerBlocked ? (
            <div className="mt-1 text-[10px] text-amber-200">
              requiredFieldsOk=false — canonical layer blocked{natarioCanonicalDiagnostics.reason ? ` (${natarioCanonicalDiagnostics.reason})` : ""}
            </div>
          ) : null}
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleExportDiagnostics}
            className="h-8 border border-white/10 bg-slate-950/70 px-2 text-[11px] uppercase tracking-[0.2em] text-slate-200 hover:bg-slate-900/80"
          >
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 border border-white/10 bg-slate-950/70 px-2 text-[11px] uppercase tracking-[0.2em] text-slate-200 hover:bg-slate-900/80"
              >
                Debug
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px] border-white/10 bg-slate-950/95 text-slate-100">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Clock rate
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={clockMode === "static"}
                onCheckedChange={(value) => setClockMode(value ? "static" : "eulerian")}
                className="text-xs text-slate-200"
              >
                Static (sqrt(-g_tt))
              </DropdownMenuCheckboxItem>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Viewer chart
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={viewerChart === "mp_like"}
                onCheckedChange={(value) => setViewerChart(value ? "mp_like" : "adm")}
                className="text-xs text-slate-200"
              >
                MP-like (prefer g_tt)
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Local diagnostic view
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={certifiedMode}
                onCheckedChange={(value) => setCertifiedMode(Boolean(value))}
                className="text-xs text-slate-200"
              >
                Metric-only view (no activation)
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem
                onSelect={() => {
                  setCertifiedMode(false);
                  setGrEnabled(false);
                  setGrAutoRefresh(false);
                }}
                className="text-xs text-slate-200"
              >
                Blank canvas
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Overlays
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={debugEnabled}
                onCheckedChange={(value) => setDebugEnabled(Boolean(value))}
                className="text-xs text-slate-200"
              >
                Debug overlay
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={grControlsEnabled}
                onCheckedChange={(value) => setGrControlsEnabled(Boolean(value))}
                className="text-xs text-slate-200"
              >
                GR controls
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={regionControlsEnabled}
                onCheckedChange={(value) => setRegionControlsEnabled(Boolean(value))}
                className="text-xs text-slate-200"
              >
                Region grid
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visualControlsEnabled}
                onCheckedChange={(value) => setVisualControlsEnabled(Boolean(value))}
                className="text-xs text-slate-200"
              >
                Visual tuning
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="pointer-events-none absolute right-3 top-12 z-10 flex max-w-[320px] flex-col items-end gap-1 text-[10px]">
          <div className={cn("rounded-full px-2 py-[2px] uppercase tracking-[0.2em]", tsMetricBadgeClass)}>
            {tsMetricBadgeLabel}
          </div>
          <div className="rounded-full border border-slate-600 bg-slate-950/80 px-2 py-[2px] text-slate-200">
            {`source=${tsMetricSource ?? "n/a"}`}
          </div>
          <div className={cn("rounded-full px-2 py-[2px]", contractGuardrailBadgeClass)}>
            {`contract FR=${displayGuardrails.fordRoman} TH=${displayGuardrails.thetaAudit} TS=${displayGuardrails.tsRatio} VdB=${displayGuardrails.vdbBand}`}
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-950/80 px-2 py-[2px] text-slate-300">
            {`contract source=${displayGuardrailSource}`}
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-950/80 px-2 py-[2px] text-slate-300">
            {`T00_min source=${t00MinSource}${t00MinProxy ? " (proxy)" : ""}`}
          </div>
          <div className="rounded border border-slate-700 bg-slate-950/80 px-2 py-[2px] text-right text-slate-300">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400">telemetry</div>
            <div>{telemetryModelLine}</div>
            <div>{telemetryGapLine}</div>
            <div>{telemetryDutyLine}</div>
            <div>{telemetryTauLine}</div>
            {telemetryNoteLine ? <div>{telemetryNoteLine}</div> : null}
          </div>
          {liveModeLine || liveGuardrailLine || liveObserverLine || liveReloadLine || liveSourceLine ? (
            <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-[2px] text-right text-cyan-100">
              <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-300">live events</div>
              {liveModeLine ? <div>{liveModeLine}</div> : null}
              {liveGuardrailLine ? <div>{liveGuardrailLine}</div> : null}
              {liveObserverLine ? <div>{liveObserverLine}</div> : null}
              {liveReloadLine ? <div>{liveReloadLine}</div> : null}
              {liveSourceLine ? <div>{liveSourceLine}</div> : null}
            </div>
          ) : null}
          {tsMetricReason ? (
            <div className="rounded border border-slate-700 bg-slate-950/80 px-2 py-[2px] text-right text-slate-300">
              {tsMetricReason}
            </div>
          ) : null}
        </div>
        {showContractionArrow && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-slate-200">
            <div className="uppercase tracking-[0.2em] text-slate-400">contraction</div>
            <div className="mt-1 flex items-center gap-2">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                className="text-emerald-200"
                style={{ transform: `rotate(${contractionAngle}deg)`, transformOrigin: "50% 50%" }}
              >
                <line x1="12" y1="20" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" />
                <polygon points="12,3 16,9 8,9" fill="currentColor" />
              </svg>
              <div>
                <div>{contractionSide}</div>
                <div>{formatFixed(contractionMagnitude * 100, 1)}%</div>
              </div>
            </div>
          </div>
        )}
        {certifiedModeEnabled && renderBanner && bannerDetails && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
            <div className="pointer-events-auto max-w-[360px] rounded-md border border-amber-500/40 bg-black/80 px-3 py-2 text-[11px] text-slate-200">
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300">
                {renderBanner.title}
              </div>
              {bannerDetails.top.length > 0 && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                  {bannerDetails.top.map((reason) => (
                    <div key={reason}>{reason}</div>
                  ))}
                </div>
              )}
              {bannerDetails.full.length > bannerDetails.top.length && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="mt-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber-200 transition hover:text-amber-100"
                    >
                      Details
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    sideOffset={8}
                    className="w-64 border-white/10 bg-slate-950/95 text-slate-200"
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200">
                      Gating details
                    </div>
                    {bannerDetails.missing.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                          Missing
                        </div>
                        <div className="mt-1 space-y-1 text-[10px] text-slate-300">
                          {bannerDetails.missing.map((item) => (
                            <div key={`missing:${item}`}>{item}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {bannerDetails.reasons.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                          Reasons
                        </div>
                        <div className="mt-1 space-y-1 text-[10px] text-slate-300">
                          {bannerDetails.reasons.map((reason) => (
                            <div key={`reason:${reason}`}>{reason}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        )}
        {renderBlocked && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/70">
            <div className="max-w-[340px] rounded-md border border-amber-500/40 bg-black/80 px-3 py-2 text-[11px] text-slate-200">
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300">
                Math maturity gate
              </div>
              <div className="mt-1 text-slate-300">
                Rendering paused until non-proxy, staged data is available.
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <span>gate progress</span>
                  <span>{Math.round(gateProgress.ratio * 100)}% ({gateProgress.ready}/{gateProgress.total})</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-white/10">
                  <div
                    className="h-full rounded bg-amber-400/80 transition-[width] duration-300"
                    style={{ width: `${Math.round(gateProgress.ratio * 100)}%` }}
                  />
                </div>
              </div>
              {mathGate.reasons.length > 0 && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                  {mathGate.reasons.map((reason) => (
                    <div key={reason}>{reason}</div>
                  ))}
                </div>
              )}
              {mathGate.modules.length > 0 && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                  {mathGate.modules.map((entry) => (
                    <div key={entry.module}>
                      {entry.module}: {entry.stage}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="absolute left-3 bottom-3 z-20 rounded border border-white/10 bg-black/75 px-3 py-2 text-[10px] text-slate-200">
          <div className="uppercase tracking-[0.18em] text-slate-400">observable labels</div>
          <div>beta: metric-derived | units 1/s | chart-normalized by render plan</div>
          <div>theta: {natarioCanonicalDiagnostics.thetaK.status === "pass" ? "metric-derived" : "proxy/unknown"} | units 1/s | normalization {String((renderPlan.normalization as any)?.theta ?? "n/a")}</div>
          <div>divBeta: {natarioCanonicalDiagnostics.divBeta.status} | units 1/s | RMS {formatSci(natarioCanonicalDiagnostics.divBeta.rms, 2)} max {formatSci(natarioCanonicalDiagnostics.divBeta.maxAbs, 2)}</div>
          <div>K-trace: {natarioCanonicalDiagnostics.thetaK.kTrace == null ? "missing" : "metric-derived"} | units 1/s</div>
          <div>
            redshift: {(() => {
              const redshift = (pipelineState as any)?.redshift;
              const hasWorldlines = Array.isArray(redshift?.emitter?.uCovariant) && Array.isArray(redshift?.receiver?.uCovariant);
              const hasTransport = Array.isArray(redshift?.kCovariantEmit) && Array.isArray(redshift?.kCovariantRecv);
              if (hasWorldlines && hasTransport) return "computed (reduced-order null transport)";
              if (hasWorldlines && (redshift?.proxyOnePlusZ != null || redshift?.proxyZ != null)) return "proxy";
              if (!hasWorldlines) return "unavailable (worldline contract missing)";
              return "unavailable (null transport missing)";
            })()} | formula 1+z=(k.u)_emit/(k.u)_recv
          </div>
        </div>
        {(debugOverlayEnabled ||
          grControlsEnabled ||
          regionControlsEnabled ||
          visualControlsEnabled) && (
          <div className="absolute left-3 top-3 bottom-3 flex w-[calc(100%-24px)] max-w-[360px] flex-col gap-2 overflow-y-auto overflow-x-hidden break-words pb-16 pr-1 text-[11px] text-slate-200">
            {debugOverlayEnabled && debugStats && (
              <div className="rounded-md border border-white/10 bg-black/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">kappa drive</div>
            <div>kappa_drive: {formatSci(debugStats.kappaDrive)} m^-2</div>
            <div>ell_k: {formatSci(debugStats.ellK)} m</div>
            <div>blend: {debugStats.blend !== null ? debugStats.blend.toFixed(2) : "n/a"}</div>
            <div>phiScale: {formatFixed(debugStats.phiScale)}</div>
            <div>warpStrength: {formatFixed(debugStats.warpStrength)}</div>
            <div>breathAmp: {formatFixed(debugStats.breathAmp)}</div>
            <div>softening: {formatFixed(debugStats.softening)}</div>
            <div>activation: {formatProxyValue(formatFixed(debugStats.activation, 3), debugStats.activationProxy)}</div>
            <div>
              activation_effective: {formatFixed(debugStats.activationEffective ?? debugStats.activation, 3)} (
              {debugStats.activationEffectiveSource ?? "pipeline"})
            </div>
            <div>power_W: {formatProxyValue(formatSci(debugStats.powerW, 2), debugStats.powerProxy, debugStats.powerSource)}</div>
            <div>d_eff: {formatProxyValue(formatFixed(debugStats.dEff, 6), debugStats.dEffProxy, debugStats.dEffSource)}</div>
            <div>TS_ratio: {formatPipelineValue(formatSci(debugStats.tsRatio, 2), debugStats.tsRatioSource, debugStats.tsRatioProxy)}</div>
            <div>
              ts_metric_derived:{" "}
              {debugStats.tsMetricDerived == null ? "n/a" : String(debugStats.tsMetricDerived)}
            </div>
            <div>ts_metric_source: {debugStats.tsMetricSource ?? "n/a"}</div>
            {debugStats.tsMetricReason ? (
              <div>ts_metric_reason: {debugStats.tsMetricReason}</div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
              <span
                className={cn(
                  "rounded-full px-2 py-[1px] uppercase tracking-[0.2em]",
                  debugStats.tsMetricDerived === true
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : debugStats.tsMetricDerived === false
                      ? "border border-rose-500/40 bg-rose-500/10 text-rose-200"
                      : "border border-amber-500/40 bg-amber-500/10 text-amber-200",
                )}
              >
                {debugStats.tsMetricDerived === true
                  ? "ts metric"
                  : debugStats.tsMetricDerived === false
                    ? "ts proxy"
                    : "ts n/a"}
              </span>
              <span className="rounded-full border border-slate-600 px-2 py-[1px] text-slate-300">
                {`source=${debugStats.tsMetricSource ?? "n/a"}`}
              </span>
            </div>
            <div>gammaGeo^3: {formatProxyValue(formatSci(debugStats.gammaGeoCubed, 2), debugStats.gammaGeoProxy, debugStats.gammaGeoSource)}</div>
            <div>gammaVdB: {formatPipelineValue(formatSci(debugStats.gammaVdB, 2), debugStats.gammaVdBSource, debugStats.gammaVdBProxy)}</div>
            <div>qSpoil: {formatProxyValue(formatFixed(debugStats.qSpoil, 3), debugStats.qSpoilProxy, debugStats.qSpoilSource)}</div>
            <div>theta_geom: {formatPipelineValue(formatSci(debugStats.thetaGeom, 2), debugStats.thetaGeomSource, debugStats.thetaGeomProxy)}</div>
            <div>thetaCal: {formatPipelineValue(formatSci(debugStats.thetaCal, 2), debugStats.thetaSource, debugStats.thetaProxy)}</div>
            <div>K_trace_mean: {formatPipelineValue(formatSci(debugStats.kTraceMean, 2), debugStats.kTraceSource, debugStats.kTraceProxy)}</div>
            <div>K_sq_mean: {formatPipelineValue(formatSci(debugStats.kSqMean, 2), debugStats.kSqSource, debugStats.kSqProxy)}</div>
            <div>vdb_two_wall: {debugStats.vdbTwoWallSupport == null ? "n/a" : String(debugStats.vdbTwoWallSupport)}</div>
            <div>vdb_two_wall_deriv: {debugStats.vdbTwoWallDerivativeSupport == null ? "n/a" : String(debugStats.vdbTwoWallDerivativeSupport)}</div>
            <div>
              vdb_region_ii_deriv:{" "}
              {debugStats.vdbRegionIIDerivativeSupport == null
                ? "n/a"
                : String(debugStats.vdbRegionIIDerivativeSupport)}
            </div>
            <div>
              vdb_region_iv_deriv:{" "}
              {debugStats.vdbRegionIVDerivativeSupport == null
                ? "n/a"
                : String(debugStats.vdbRegionIVDerivativeSupport)}
            </div>
            <div>M_exotic: {formatPipelineValue(formatSci(debugStats.mExotic, 2), debugStats.mExoticSource, debugStats.mExoticProxy)} kg</div>
            <div>T00_min: {formatPipelineValue(formatSci(debugStats.t00Min, 2), debugStats.t00Source, debugStats.t00Proxy)}</div>
            <div>beta: {formatProxyValue(formatFixed(debugStats.beta, 3), debugStats.betaProxy, debugStats.betaSource)}</div>
            <div>sigma: {formatProxyValue(formatFixed(debugStats.sigma, 2), debugStats.sigmaProxy, debugStats.sigmaSource)}</div>
            <div>R: {formatProxyValue(formatFixed(debugStats.bubbleR, 1), debugStats.radiusProxy, debugStats.radiusSource)} m</div>
            <div>center: {formatProxyValue(formatVec3(debugStats.center, 1), debugStats.centerProxy, debugStats.centerSource)}</div>
            <div>hullField: {debugStats.hullField}{debugStats.hullFieldMode !== "none" ? ` (${debugStats.hullFieldMode})` : ""}</div>
            <div>hullThickness: {formatFixed(debugStats.hullThickness, 2)} m</div>
            <div>alphaSource: {debugStats.alphaSource}</div>
            <div>clockRate: {debugStats.clockMode}</div>
            <div>viewerChart: {debugStats.viewerChart}</div>
            <div>
              guardrails: FR={debugStats.guardrails.fordRoman}, TH={debugStats.guardrails.thetaAudit}, TS={debugStats.guardrails.tsRatio}, VdB={debugStats.guardrails.vdbBand}
            </div>
            <div>guardrails_source: {debugStats.guardrailsSource}</div>
            <div>contract_guardrail_source: {debugStats.contractGuardrailSource}</div>
            <div>qi_rho_source: {debugStats.qiRhoSource}</div>
            <div>
              qi_curvature: {debugStats.qiCurvatureOk == null ? "n/a" : String(debugStats.qiCurvatureOk)}
              {debugStats.qiCurvatureRatio != null
                ? ` τ/R=${formatFixed(debugStats.qiCurvatureRatio, 3)}`
                : ""}
              {debugStats.qiCurvatureEnforced ? " (enforced)" : ""}
            </div>
            <div>Proof status: inspect the authenticated run in NHM2 Solve State; these live renderer diagnostics do not certify viability.</div>
            {diagnostics && diagnostics.lines.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">diagnostics</div>
                {diagnostics.lines.map((line, index) => (
                  <div key={`diag-${index}`}>{line}</div>
                ))}
                {diagnostics.nextChecks.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">next checks</div>
                    {diagnostics.nextChecks.map((line, index) => (
                      <div key={`diag-next-${index}`}>- {line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {solverDiagnostics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  solver diagnostics
                </div>
                <div>
                  H_constraint_rms: {formatSci(solverDiagnostics.H_rms, 2)}
                  {solverDiagnostics.proxy ? " (proxy)" : ""}
                </div>
                <div>
                  M_constraint_rms: {formatSci(solverDiagnostics.M_rms, 2)}
                  {solverDiagnostics.proxy ? " (proxy)" : ""}
                </div>
                <div>source: {solverDiagnostics.source}</div>
              </div>
            )}
            {grAssistantSummary && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    gr correctness
                  </div>
                  <div
                    className={`rounded-full px-2 py-[1px] text-[9px] uppercase tracking-[0.2em] ${grAssistantBadgeClass}`}
                  >
                    {grAssistantStatus}
                  </div>
                </div>
                <div>
                  checks: {grAssistantSummary.report.checks?.length ?? "unreported"} | failed: {grAssistantSummary.report.failed_checks?.length ?? "unreported"}
                </div>
                {grAssistantSummary.firstFail ? (
                  <div>first_fail: {grAssistantSummary.firstFail}</div>
                ) : null}
                {grAssistantSummary.gate ? (
                  <div>
                    gate: {grAssistantSummary.gate.pass ? "pass" : "fail"} | cert: {grAssistantSummary.gate.certificate?.certificateHash ?? "n/a"}
                  </div>
                ) : null}
                <div>signature: {grAssistantSummary.assumptions.signature}</div>
                <div>units: {grAssistantSummary.assumptions.unitsInternal}</div>
                <div>coords: {grAssistantSummary.assumptions.coords.join(", ")}</div>
                {grAssistantSummary.invariants.length > 0 && (
                  <div className="mt-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      invariants (cas)
                    </div>
                    {grAssistantSummary.invariants.map(([key, value]) => (
                      <div key={`inv-${key}`}>
                        {key}: {formatInvariantValue(value)}
                      </div>
                    ))}
                  </div>
                )}
                {grAssistantSummary.brickInvariants.length > 0 && (
                  <div className="mt-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      invariants (brick)
                    </div>
                    {grAssistantSummary.brickInvariants.map(([key, value]) => (
                      <div key={`inv-brick-${key}`}>
                        {key}: {formatInvariantValue(value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {solverHealthDiagnostics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  solver health
                </div>
                <div>status: {solverHealthDiagnostics.health?.status ?? "n/a"}</div>
                <div>brick_meta: {solverHealthDiagnostics.meta?.status ?? "n/a"}</div>
                <div>
                  alpha_clamp_fraction: {formatSci(solverHealthDiagnostics.health?.alphaClampFraction, 2)}
                </div>
                <div>
                  k_clamp_fraction: {formatSci(solverHealthDiagnostics.health?.kClampFraction, 2)}
                </div>
                <div>
                  total_clamp_fraction: {formatSci(solverHealthDiagnostics.health?.totalClampFraction, 2)}
                </div>
                <div>
                  max_alpha_before: {formatSci(solverHealthDiagnostics.health?.maxAlphaBeforeClamp, 2)}
                </div>
                <div>
                  max_k_before: {formatSci(solverHealthDiagnostics.health?.maxKBeforeClamp, 2)}
                </div>
                <div>
                  alpha_clamp_count: {formatCount(solverHealthDiagnostics.fixups?.alphaClampCount ?? null)}
                </div>
                <div>
                  k_clamp_count: {formatCount(solverHealthDiagnostics.fixups?.kClampCount ?? null)}
                </div>
                <div>
                  det_fix_count: {formatCount(solverHealthDiagnostics.fixups?.detFixCount ?? null)}
                </div>
                <div>
                  trace_fix_count: {formatCount(solverHealthDiagnostics.fixups?.traceFixCount ?? null)}
                </div>
                {solverHealthDiagnostics.health?.reasons?.length ? (
                  <div>reasons: {solverHealthDiagnostics.health.reasons.join("; ")}</div>
                ) : null}
                {solverHealthDiagnostics.meta?.reasons?.length ? (
                  <div>meta_reasons: {solverHealthDiagnostics.meta.reasons.join("; ")}</div>
                ) : null}
                <div>source: {solverHealthDiagnostics.source}</div>
                {solverHealthDiagnostics.health?.status === "UNSTABLE" ? (
                  <div className="mt-1 inline-flex items-center rounded-full bg-rose-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.2em] text-rose-200">
                    unstable fixups
                  </div>
                ) : null}
                {exploratoryOverride && solverStatus !== "CERTIFIED" ? (
                  <div className="mt-1 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.2em] text-amber-200">
                    exploratory override
                  </div>
                ) : null}
              </div>
            )}
            {shiftStiffnessDiagnostics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  stiffness
                </div>
                <div>shift-stiff: {shiftStiffnessDiagnostics.status}</div>
                {shiftStiffnessDiagnostics.note ? (
                  <div>note: {shiftStiffnessDiagnostics.note}</div>
                ) : null}
                <div>beta_max_abs: {formatSci(shiftStiffnessDiagnostics.stiffness.betaMaxAbs, 2)}</div>
                <div>beta_p98_abs: {formatSci(shiftStiffnessDiagnostics.stiffness.betaP98Abs, 2)}</div>
                <div>grad_beta_max: {formatSci(shiftStiffnessDiagnostics.stiffness.gradBetaMaxAbs, 2)}</div>
                <div>grad_beta_p98: {formatSci(shiftStiffnessDiagnostics.stiffness.gradBetaP98Abs, 2)}</div>
                <div>shock_index: {formatFixed(shiftStiffnessDiagnostics.stiffness.shockIndex, 2)}</div>
                <div>
                  shock_severity: {shiftStiffnessDiagnostics.stiffness.shockSeverity ?? "n/a"}
                </div>
                {shiftStiffnessDiagnostics.stiffness.shockMode ? (
                  <div>shock_mode: {shiftStiffnessDiagnostics.stiffness.shockMode}</div>
                ) : null}
                {shiftStiffnessDiagnostics.advectScheme ? (
                  <div>advect_scheme: {shiftStiffnessDiagnostics.advectScheme}</div>
                ) : null}
                {shiftStiffnessDiagnostics.stiffness.stabilizersApplied?.length ? (
                  <div>
                    stabilizers: {shiftStiffnessDiagnostics.stiffness.stabilizersApplied.join(", ")}
                  </div>
                ) : null}
                <div>
                  advective_cfl_suggest: {formatSci(shiftStiffnessDiagnostics.stiffness.advectiveCflSuggested, 2)}
                </div>
                <div>char_speed_suggest: {formatSci(shiftStiffnessDiagnostics.stiffness.charSpeedSuggested, 2)}</div>
                <div>char_cfl_suggest: {formatSci(shiftStiffnessDiagnostics.stiffness.charCflSuggested, 2)}</div>
                <div>dt_geom: {formatSci(shiftStiffnessDiagnostics.dtGeom, 2)}</div>
                <div>dt/char_cfl: {formatFixed(shiftStiffnessDiagnostics.ratio, 2)}</div>
                <div>grad_ratio: {formatFixed(shiftStiffnessDiagnostics.gradRatio, 2)}</div>
                <div>source: {shiftStiffnessDiagnostics.source}</div>
              </div>
            )}
            {thetaDiagnostics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  theta audit
                </div>
                <div>
                  theta_div_pre: {formatSci(thetaDiagnostics.divPre, 2)}
                </div>
                <div>
                  theta_div_post: {formatSci(thetaDiagnostics.divPost, 2)}
                </div>
                <div>clamp_ratio: {formatFixed(thetaDiagnostics.ratio, 3)}</div>
                <div>source: {thetaDiagnostics.source}</div>
                {thetaDiagnostics.proxy ? <div>proxy: true</div> : null}
              </div>
            )}
            {thetaExpectation && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  theta expectation
                </div>
                <div>warpFieldType: {thetaExpectation.mode}</div>
                <div>{thetaExpectation.note}</div>
                {thetaExpectation.dipole && (
                  <>
                    <div>dipole_sign_flip: {thetaExpectation.dipole.status}</div>
                    <div>
                      theta_ahead: {formatSci(thetaExpectation.dipole.ahead, 2)}
                    </div>
                    <div>
                      theta_behind: {formatSci(thetaExpectation.dipole.behind, 2)}
                    </div>
                    <div>
                      threshold: {formatSci(thetaExpectation.dipole.threshold, 2)}
                    </div>
                    {thetaExpectation.dipole.reason ? (
                      <div>note: {thetaExpectation.dipole.reason}</div>
                    ) : null}
                    {thetaExpectation.dipole.proxy ? <div>proxy: true</div> : null}
                  </>
                )}
                {betaStrainCheck && (
                  <>
                    <div>beta_strain_sign_flip: {betaStrainCheck.status}</div>
                    <div>
                      beta_strain_ahead: {formatSci(betaStrainCheck.ahead, 2)}
                    </div>
                    <div>
                      beta_strain_behind: {formatSci(betaStrainCheck.behind, 2)}
                    </div>
                    <div>
                      threshold: {formatSci(betaStrainCheck.threshold, 2)}
                    </div>
                    {betaStrainCheck.reason ? (
                      <div>note: {betaStrainCheck.reason}</div>
                    ) : null}
                    {betaStrainCheck.proxy ? <div>proxy: true</div> : null}
                  </>
                )}
              </div>
            )}
            {modeSemantics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  mode semantics
                </div>
                <div>warpFieldType: {modeSemantics.mode}</div>
                <div>{modeSemantics.note}</div>
                {modeSemantics.mode === "natario" ? (
                  <>
                    <div>
                      theta_div_pre: {formatSci(modeSemantics.diagnostics?.divPre, 2)}
                    </div>
                    <div>
                      theta_div_post: {formatSci(modeSemantics.diagnostics?.divPost, 2)}
                    </div>
                    <div>
                      clamp_ratio: {formatFixed(modeSemantics.diagnostics?.ratio, 3)}
                    </div>
                    <div>clamp_mode: {modeSemantics.diagnostics?.clampMode ?? "n/a"}</div>
                    <div>
                      clamp_rate: {formatFixed(modeSemantics.diagnostics?.clampRate, 3)}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      dipole_sign_flip: {modeSemantics.dipole?.status ?? "n/a"}
                    </div>
                    {modeSemantics.dipole?.reason ? (
                      <div>note: {modeSemantics.dipole.reason}</div>
                    ) : null}
                    <div>
                      beta_strain_rms: {formatSci(modeSemantics.diagnostics?.divRms, 2)}
                    </div>
                  </>
                )}
              </div>
            )}
            {warpProvenance && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  warp provenance
                </div>
                <div>render_gate: {warpProvenance.plan.banner}</div>
                <div>mode: {warpProvenance.plan.mode}</div>
                <div>viewer_chart: {viewerChart}</div>
                <div>geom_gate: {formatFixed(warpProvenance.plan.geomWarpScale, 2)}x</div>
                <div>geom_enable: {warpProvenance.plan.enableGeometryWarp ? "on" : "off"}</div>
                <div>
                  flags: hull={warpProvenance.plan.flags.hasHull ? "yes" : "no"},{" "}
                  wall=
                  {warpProvenance.plan.flags.wallDetected === undefined
                    ? "n/a"
                    : warpProvenance.plan.flags.wallDetected
                      ? "yes"
                      : "no"}
                  {warpProvenance.plan.flags.wallSource
                    ? ` (${warpProvenance.plan.flags.wallSource})`
                    : ""},{" "}
                  gr={warpProvenance.plan.flags.hasGrBrick ? "yes" : "no"},{" "}
                  gr_brick_certified={warpProvenance.plan.flags.grCertified ? "yes" : "no"},{" "}
                  proxy={warpProvenance.plan.flags.anyProxy ? "yes" : "no"},{" "}
                  stage={warpProvenance.plan.flags.mathStageOK ? "ok" : "blocked"},{" "}
                  solver={warpProvenance.plan.flags.solverStatus ?? "n/a"},{" "}
                  override={warpProvenance.plan.flags.exploratoryOverride ? "on" : "off"},{" "}
                  cinematic={warpProvenance.plan.flags.cinematicOverride ? "on" : "off"},{" "}
                  natario_warp=
                  {warpProvenance.plan.flags.natarioGeometryWarp === undefined
                    ? "n/a"
                    : warpProvenance.plan.flags.natarioGeometryWarp
                      ? "on"
                      : "off"}
                </div>
                <div>
                  sources: α={warpProvenance.plan.sourceForAlpha}, β={warpProvenance.plan.sourceForBeta},{" "}
                  θ={warpProvenance.plan.sourceForTheta}, clock={warpProvenance.plan.sourceForClockRate}
                </div>
                <div>
                  beta_warp: w={formatFixed(warpProvenance.plan.betaWarpWeight, 2)} scale=
                  {formatFixed(warpProvenance.plan.normalization.beta.scale, 2)}x
                </div>
                <div>
                  beta_norm: {warpProvenance.plan.normalization.beta.mode}
                  {warpProvenance.plan.normalization.beta.percentile != null
                    ? ` p98=${formatSci(warpProvenance.plan.normalization.beta.percentile, 2)}`
                    : ""}
                  {` base=${formatFixed(warpProvenance.plan.normalization.beta.baseScale, 2)}`}
                </div>
                <div>
                  theta_warp: scale={formatSci(warpProvenance.plan.normalization.theta.scale, 2)} w=
                  {formatFixed(warpProvenance.plan.thetaWarpWeight, 2)}
                </div>
                <div>
                  theta_norm: {warpProvenance.plan.normalization.theta.mode}
                  {warpProvenance.plan.normalization.theta.percentile != null
                    ? ` p98=${formatSci(warpProvenance.plan.normalization.theta.percentile, 2)}`
                    : ""}
                  {` base=${formatSci(warpProvenance.plan.normalization.theta.baseScale, 2)}`}
                </div>
                <div>
                  theta_norm_mode: {warpProvenance.thetaNormalization?.normMode ?? "n/a"}
                </div>
                <div>
                  theta_norm_p98: {formatSci(warpProvenance.thetaNormalization?.p98, 2)}
                </div>
                <div>
                  theta_clamp: [{formatSci(warpProvenance.thetaNormalization?.clampMin, 2)}, {formatSci(warpProvenance.thetaNormalization?.clampMax, 2)}]
                </div>
                <div>
                  theta_sanitized: {formatCount(warpProvenance.thetaNormalization?.sanitizedCount ?? null)}
                </div>
                {warpProvenance.thetaNormalization?.sanitizedCount ? (
                  <div className="mt-1 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-[1px] text-[9px] uppercase tracking-[0.2em] text-amber-200">
                    theta sanitized
                  </div>
                ) : null}
                <div>
                  gamma_norm: {warpProvenance.plan.normalization.gamma.mode}
                  {warpProvenance.plan.normalization.gamma.percentile != null
                    ? ` p98=${formatSci(warpProvenance.plan.normalization.gamma.percentile, 2)}`
                    : ""}
                  {` base=${formatFixed(warpProvenance.plan.normalization.gamma.baseScale, 2)}`}
                </div>
                <div>
                  shear_norm: {warpProvenance.plan.normalization.shear.mode}
                  {warpProvenance.plan.normalization.shear.percentile != null
                    ? ` p98=${formatSci(warpProvenance.plan.normalization.shear.percentile, 2)}`
                    : ""}
                  {` base=${formatFixed(warpProvenance.plan.normalization.shear.baseScale, 2)}`}
                </div>
                <div>warpStrength: {formatFixed(warpProvenance.warpStrength, 2)}</div>
                <div>metricBlend: {formatFixed(warpProvenance.plan.metricBlend, 2)}</div>
                <div>shearStrength: {formatFixed(warpProvenance.plan.shearWeight, 2)}</div>
                <div>warp_cap: {formatSci(warpProvenance.warpCap, 2)}</div>
                <div>
                  reasons: {warpProvenance.plan.reasons.length ? warpProvenance.plan.reasons.join("; ") : "none"}
                </div>
              </div>
            )}
            {wallDiagnostics && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  wall diagnostics
                </div>
                <div>source: {wallDiagnostics.source}</div>
                <div>detected: {wallDiagnostics.detected ? "yes" : "no"}</div>
                <div>p98: {formatSci(wallDiagnostics.p98, 2)}</div>
                <div>threshold: {formatSci(wallDiagnostics.threshold, 2)}</div>
                <div>
                  band: [{formatSci(wallDiagnostics.bandMin, 2)}, {formatSci(wallDiagnostics.bandMax, 2)}]
                </div>
                <div>
                  sample_frac: {formatFixed(wallDiagnostics.sampleFraction * 100, 1)}%
                </div>
              </div>
            )}
            {grPerf && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">gr perf</div>
                <div>total_ms: {formatFixed(grPerf.totalMs, 0)}</div>
                <div>
                  evolve_ms: {formatFixed(grPerf.evolveMs, 0)} ({formatFixed(grPerf.msPerStep, 2)} ms/step)
                </div>
                <div>brick_ms: {formatFixed(grPerf.brickMs, 0)}</div>
                <div>voxels: {formatCount(grPerf.voxels)}</div>
                <div>channels: {formatCount(grPerf.channelCount)}</div>
                <div>bytes_est: {formatBytes(grPerf.bytesEstimate)}</div>
                <div>source: {grPerf.source}</div>
              </div>
            )}
            {grStats && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">gr brick</div>
                <div>dims: {grStats.dims.join("x")}</div>
                <div>
                  alpha: [{formatFixed(grStats.alphaMin, 4)}, {formatFixed(grStats.alphaMax, 4)}]
                </div>
                <div>
                  theta_GR: [{formatSci(grStats.thetaMin as number)}, {formatSci(grStats.thetaMax as number)}]
                </div>
                <div>theta_peak_abs: {formatSci(grStats.thetaPeakAbs as number, 2)}</div>
                <div>theta_growth_step: {formatSci(grStats.thetaGrowthPerStep as number, 2)}</div>
                <div>
                  g_tt (derived): [{formatFixed(grStats.gttMin as number, 4)}, {formatFixed(grStats.gttMax as number, 4)}]
                </div>
                <div>
                  beta_max: {formatProxyValue(formatFixed(grStats.betaMaxAbs as number, 3), grStats.proxy, "gr")}
                </div>
              </div>
            )}
            {lapseStats && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">lapse brick</div>
                <div>dims: {lapseStats.dims.join("x")}</div>
                <div>alpha: [{formatFixed(lapseStats.alphaMin, 4)}, {formatFixed(lapseStats.alphaMax, 4)}]</div>
                <div>phi: [{formatSci(lapseStats.phiMin)}, {formatSci(lapseStats.phiMax)}]</div>
                <div>g_tt: [{formatFixed(lapseStats.gttMin, 4)}, {formatFixed(lapseStats.gttMax, 4)}]</div>
                <div>iter: {lapseStats.iterations} | resid: {formatSci(lapseStats.residual, 2)}</div>
              </div>
            )}
              </div>
            )}
            {grControlsEnabled && (
              <div className="rounded-md border border-white/10 bg-black/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">gr controls</div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">status</span>
                    <span className="text-xs uppercase">{grStatus}</span>
                  </div>
                  {grErrorMessage && (
                    <div className="text-[10px] text-amber-300">error: {grErrorMessage}</div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">enable</span>
                    <input
                      type="checkbox"
                      checked={grEnabled}
                      onChange={(event) => setGrEnabled(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      Live pipeline GR: {pipelineState?.grEnabled === true ? "enabled" : "disabled or unreported"}
                    </span>
                    {pipelineState?.grEnabled === false && (
                      <Button type="button" size="sm" variant="outline"
                        disabled={updatePipeline.isPending}
                        onClick={() => updatePipeline.mutate({ grEnabled: true })}>
                        Enable in pipeline
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">auto refresh</span>
                    <input
                      type="checkbox"
                      checked={grAutoRefresh}
                      onChange={(event) => setGrAutoRefresh(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">quality</span>
                    <select
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                      value={grQuality}
                      onChange={(event) => setGrQuality(event.target.value as CurvatureQuality)}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">target dx (m)</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={grTargetDx}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setGrTargetDx(Number.isFinite(value) ? Math.max(0.1, value) : GR_TARGET_DX_M);
                      }}
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">steps</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={grSteps}
                      onChange={(event) =>
                        setGrSteps(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">dt_s</span>
                    <input
                      type="number"
                      min="0"
                      step="1e-9"
                      value={grDt}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setGrDt(Number.isFinite(value) ? Math.max(0, value) : 0);
                      }}
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">iterations (0=auto)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={grIterations}
                      onChange={(event) =>
                        setGrIterations(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">tolerance (0=auto)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={grTolerance}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setGrTolerance(Number.isFinite(value) ? Math.max(0, value) : 0);
                      }}
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">shock mode</span>
                    <select
                      className="h-7 w-28 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                      value={grShockMode}
                      onChange={(event) =>
                        setGrShockMode(event.target.value as "off" | "diagnostic" | "stabilize")
                      }
                    >
                      <option value="off">off</option>
                      <option value="diagnostic">diagnostic</option>
                      <option value="stabilize">stabilize</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">advection scheme</span>
                    <select
                      className="h-7 w-28 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                      value={grAdvectScheme}
                      onChange={(event) =>
                        setGrAdvectScheme(event.target.value as "centered" | "upwind1")
                      }
                    >
                      <option value="centered">centered</option>
                      <option value="upwind1">upwind1</option>
                    </select>
                  </div>
                  <div className="text-[10px] text-amber-300">
                    Experimental: upwind1 is more stable, more diffusive.
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">include extra</span>
                    <input
                      type="checkbox"
                      checked={grIncludeExtra}
                      onChange={(event) => setGrIncludeExtra(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">include matter</span>
                    <input
                      type="checkbox"
                      checked={grIncludeMatter}
                      onChange={(event) => setGrIncludeMatter(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">include Kij</span>
                    <input
                      type="checkbox"
                      checked={grIncludeKij}
                      onChange={(event) => setGrIncludeKij(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-amber-300">exploratory override</span>
                    <input
                      type="checkbox"
                      checked={exploratoryOverride}
                      onChange={(event) => setExploratoryOverride(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="text-[10px] text-amber-300">
                    Allows geometry warp from UNSTABLE GR bricks (debug only).
                  </div>
                  <div className="text-[10px] text-slate-400">
                    include extra forces Kij + matter on the server.
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">dims</span>
                    <span className="text-xs tabular-nums">{grDims.join("x")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">estimate</span>
                    <span className="text-xs tabular-nums">
                      {formatBytes(grEstimate.bytes)} ({formatCount(grEstimate.voxels)} voxels)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" size="sm" onClick={requestGrBrick}>
                      Compute GR brick
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => grQuery.refetch()}
                      disabled={!grRequested}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {regionControlsEnabled && (
              <div className="rounded-md border border-white/10 bg-black/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">region grid</div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">status</span>
                    <span className="text-xs uppercase">{regionStatus}</span>
                  </div>
                  {regionErrorMessage && (
                    <div className="text-[10px] text-amber-300">error: {regionErrorMessage}</div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">enable</span>
                    <input
                      type="checkbox"
                      checked={regionEnabled}
                      onChange={(event) => setRegionEnabled(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">auto refresh</span>
                    <input
                      type="checkbox"
                      checked={regionAutoRefresh}
                      onChange={(event) => setRegionAutoRefresh(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">source</span>
                    <select
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                      value={regionSource}
                      onChange={(event) =>
                        setRegionSource(event.target.value as "auto" | "gr" | "stress")
                      }
                    >
                      <option value="auto">auto</option>
                      <option value="gr">gr</option>
                      <option value="stress">stress</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">target dx (m)</span>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={regionTargetDx}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setRegionTargetDx(Number.isFinite(value) ? Math.max(0.5, value) : REGION_TARGET_DX_M);
                      }}
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">target regions</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={regionTargetRegions}
                      onChange={(event) =>
                        setRegionTargetRegions(Math.max(1, Math.floor(Number(event.target.value) || 0)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">theta bins (0=auto)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={regionThetaBins}
                      onChange={(event) =>
                        setRegionThetaBins(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">long bins (0=auto)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={regionLongBins}
                      onChange={(event) =>
                        setRegionLongBins(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">phase bins</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={regionPhaseBins}
                      onChange={(event) =>
                        setRegionPhaseBins(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">radial bins</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={regionRadialBins}
                      onChange={(event) =>
                        setRegionRadialBins(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">top regions</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={regionTopN}
                      onChange={(event) =>
                        setRegionTopN(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                      }
                      className="h-7 w-24 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">dims</span>
                    <span className="text-xs tabular-nums">{regionDims.join("x")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">estimate</span>
                    <span className="text-xs tabular-nums">
                      {formatBytes(regionEstimate.bytes)} ({formatCount(regionEstimate.voxels)} voxels)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" size="sm" onClick={requestRegionStats}>
                      Compute regions
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => regionQuery.refetch()}
                      disabled={!regionRequested}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
                <div className="mt-3 border-t border-white/10 pt-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">visuals</div>
                  <div className="mt-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">grid overlay</span>
                      <input
                        type="checkbox"
                        checked={regionGridOverlay}
                        onChange={(event) => setRegionGridOverlay(event.target.checked)}
                        className="h-3 w-3"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">tint neg energy</span>
                      <input
                        type="checkbox"
                        checked={regionTintEnabled}
                        onChange={(event) => setRegionTintEnabled(event.target.checked)}
                        className="h-3 w-3"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">tint scale</span>
                      <input
                        type="range"
                        min="0"
                        max={REGION_TINT_SCALE_MAX}
                        step="0.1"
                        value={regionTintScale}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setRegionTintScale(Number.isFinite(value) ? Math.max(0, value) : 0);
                        }}
                        className="w-24 accent-slate-200"
                      />
                      <span className="text-xs tabular-nums">{regionTintScale.toFixed(2)}x</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">contraction arrow</span>
                      <input
                        type="checkbox"
                        checked={regionArrowEnabled}
                        onChange={(event) => setRegionArrowEnabled(event.target.checked)}
                        className="h-3 w-3"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400">tint uses top regions list</div>
                  </div>
                </div>
                {regionStats && (
                  <div className="mt-3 border-t border-white/10 pt-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">summary</div>
                    <div>
                      source: {regionStats.source.brick}
                      {regionStats.source.proxy ? " (proxy)" : ""}
                    </div>
                    <div>
                      grid: {regionStats.grid.thetaBins}x{regionStats.grid.longBins}x{regionStats.grid.phaseBins}x{regionStats.grid.radialBins} (
                      {formatCount(regionStats.grid.totalRegions)})
                    </div>
                    <div>long axis: {regionStats.grid.longAxis}</div>
                    <div>
                      strobe: {formatFixed(regionStats.grid.strobeHz, 1)} Hz | LC: {formatSci(regionStats.grid.lightCrossing_s, 2)} s
                    </div>
                    <div>
                      phase: {formatFixed(regionStats.grid.phase01 ?? 0, 3)} (bin {regionStats.grid.phaseBin ?? 0})
                    </div>
                    <div>
                      neg_E: {formatSci(regionStats.summary.negEnergy, 2)} ({formatFixed(regionStats.summary.negFraction, 3)})
                    </div>
                    <div>
                      contraction dir: {formatVec3(regionStats.summary.contractionVector ?? null, 2)}
                    </div>
                    <div>contraction side: {contractionSide}</div>
                    <div>
                      contraction mag: {formatFixed(regionStats.summary.contractionMagnitude * 100, 1)}%
                    </div>
                    {regionStats.summary.wall && (
                      <>
                        <div>
                          wall: {regionStats.summary.wall.detected ? "detected" : "none"} ({regionStats.summary.wall.source})
                        </div>
                        <div>
                          wall p98: {formatSci(regionStats.summary.wall.p98, 2)} | threshold:{" "}
                          {formatSci(regionStats.summary.wall.threshold, 2)}
                        </div>
                        <div>
                          wall band: [{formatSci(regionStats.summary.wall.bandMin, 2)}, {formatSci(regionStats.summary.wall.bandMax, 2)}]
                        </div>
                        <div>
                          wall center: {formatVec3(regionStats.summary.wall.center ?? null, 2)}
                        </div>
                        <div>
                          wall radius: {formatFixed(regionStats.summary.wall.radiusMin ?? 0, 2)} -{" "}
                          {formatFixed(regionStats.summary.wall.radiusMax ?? 0, 2)} (thickness{" "}
                          {formatFixed(regionStats.summary.wall.thickness ?? 0, 2)})
                        </div>
                      </>
                    )}
                  </div>
                )}
                {regionStats && regionStats.topRegions.length > 0 && (
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">top regions</div>
                    {regionStats.topRegions.map((region) => (
                      <div key={`region-${region.id}`} className="flex items-center justify-between">
                        <span>{region.key}</span>
                        <span className="tabular-nums">
                          {formatFixed(region.negShare * 100, 1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {visualControlsEnabled && (
              <div className="rounded-md border border-white/10 bg-black/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">visual tuning</div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">gamma_ij</span>
                    <input
                      type="checkbox"
                      checked={visualTuning.gammaEnabled}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({ ...prev, gammaEnabled: event.target.checked }))
                      }
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">K_ij</span>
                    <input
                      type="checkbox"
                      checked={visualTuning.kijEnabled}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({ ...prev, kijEnabled: event.target.checked }))
                      }
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">constraints</span>
                    <input
                      type="checkbox"
                      checked={visualTuning.constraintEnabled}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          constraintEnabled: event.target.checked,
                        }))
                      }
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-amber-300">cinematic override</span>
                    <input
                      type="checkbox"
                      checked={cinematicOverride}
                      onChange={(event) => setCinematicOverride(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="text-[10px] text-amber-300">
                    Forces geometry warp even when Natario is not strict-admissible (debug only).
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      natario geometry warp
                    </span>
                    <input
                      type="checkbox"
                      checked={natarioGeometryWarp}
                      onChange={(event) => setNatarioGeometryWarp(event.target.checked)}
                      className="h-3 w-3"
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Enables metric-derived geometry warp in Natario mode when strict criteria pass.
                  </div>
                  <div className="flex items-center justify-between gap-2">     
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">theta scale</span>
                    <input
                      type="range"
                      min="0.2"
                      max="4"
                      step="0.1"
                      value={visualTuning.alphaScale}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          alphaScale: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 accent-slate-200"
                    />
                    <span className="text-xs tabular-nums">{visualTuning.alphaScale.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">beta scale</span>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="0.1"
                      value={visualTuning.betaScale}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          betaScale: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 accent-slate-200"
                    />
                    <span className="text-xs tabular-nums">{visualTuning.betaScale.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">gamma scale</span>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={visualTuning.gammaScale}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          gammaScale: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 accent-slate-200"
                    />
                    <span className="text-xs tabular-nums">{visualTuning.gammaScale.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">K_ij scale</span>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={visualTuning.kijScale}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          kijScale: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 accent-slate-200"
                    />
                    <span className="text-xs tabular-nums">{visualTuning.kijScale.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      constraint scale
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={visualTuning.constraintScale}
                      onChange={(event) =>
                        setVisualTuning((prev) => ({
                          ...prev,
                          constraintScale: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 accent-slate-200"
                    />
                    <span className="text-xs tabular-nums">
                      {visualTuning.constraintScale.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" onClick={resetVisualTuning}>
                      Reset
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={applyExploreTuning}>
                      Explore
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {glStatus === "context-lost" && renderEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-slate-200">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">WebGL context lost</div>
              <div className="text-sm font-semibold text-slate-100 animate-pulse">
                Attempting to restore renderer...
              </div>
            </div>
          </div>
        )}
        {!isReady && glStatus !== "context-lost" && renderEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-slate-200">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Buffering simulation</div>
              <div className="text-sm font-semibold text-slate-100 animate-pulse">
                Compiling shaders and seeding lattice...
              </div>
            </div>
          </div>
        )}
      </div>
        <div className="text-xs text-slate-400">
          Color maps expansion/contraction (theta): cool means contraction, warm means expansion. Geometry warp follows the
          RenderPlan: Alcubierre uses beta-advection + theta when certified; Natario canonical uses beta + shear only
          (theta warp disabled). Clock rate uses the selected observer ({clockRateLabel}); static sqrt(-g_tt) applies only
          where g_tt {"<"} 0 (partial_t timelike). Gamma_ij adds anisotropic scaling, K_ij adds shear/twist cues, and
          H_constraint highlights iso bands when present. Hull contours use hullDist/hullMask bricks from GLB uploads when
          present (visual proxy only). phiScale, warp, breath, and softening are visualization scalers; activation gates
          warp cues using electrical inputs and guardrails.
        </div>
    </div>
  );
}

