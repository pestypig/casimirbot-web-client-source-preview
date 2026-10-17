import {
  type CardCameraPreset,
  type CardMeshMetadata,
  type SpacetimeGridWarpField,
} from "@shared/schema";
import type { HullBasisResolved } from "@shared/hull-basis";
import type { HullDistanceGrid } from "@/lib/lattice-sdf";
import type { HullSurfaceVoxelVolume } from "@/lib/lattice-surface";
import type { LatticeFrame, LatticeProfileTag, LatticeQualityPreset } from "@/lib/lattice-frame";
import { type StateCreator } from "zustand";
import { createWithEqualityFn } from "zustand/traditional";

export type HullGateSource = "schedule" | "blanket" | "combined";
export type HullVolumeViz =
  | "theta_gr"
  | "rho_gr"
  | "theta_drive"
  | "shear_gr"
  | "vorticity_gr"
  | "alpha"
  | "warp";
export type HullVolumeDomain = "wallBand" | "bubbleBox";
export type HullVolumeSource = "analytic" | "lattice" | "brick";
export type HullQualityPreset = "auto" | "low" | "medium" | "high";
export interface HullQualityOverrides {
  voxelDensity?: "low" | "medium" | "high";
  raySteps?: number;
  stepBias?: number;
}

export type HullSamplingWindowKey = "instant" | "tauLC" | "burst" | "sector";

export interface HullSamplingWindowState {
  key: HullSamplingWindowKey;
  label: string;
  durationMs?: number;
  provenance?: string;
}

export type HullPhaseSource = "time" | "scroll" | "server" | "metrics" | "bus";

export interface HullPhaseBusState {
  mode: "time" | "scroll" | "auto";
  source: HullPhaseSource;
  phase01: number;
  phaseCont: number;
  sign: 1 | -1;
  wedgeIndex: number;
  nextWedgeIndex: number;
  dutyWindow?: [number, number];
  damp: number;
  updatedAt: number;
}

export interface HullPhysicsScaleState {
  locked: boolean;
  thetaExpected?: number;
  thetaUsed?: number;
  ratio?: number;
  trimDb: number;
  yGain: number;
  kColor: number;
  analyticPeak?: number;
  tailPeak?: number;
  updatedAt: number;
}

export interface HullReciprocityState {
  tauLC_ms?: number;
  burst_ms?: number;
  dwell_ms?: number;
  ratio?: number;
  status: "pass" | "warn" | "unknown";
}

export interface HullZetaState {
  value?: number;
  limit?: number;
  status: "pass" | "warn" | "limit" | "unknown";
}

export interface HullComplianceState {
  reciprocity: HullReciprocityState;
  zeta: HullZetaState;
}

export interface HullSectorDebugState {
  weightsInstant: Float32Array;
  weightsAverage: Float32Array;
  sqrtBoost: Float32Array;
  betaSign: 1 | -1;
  activeIndex: number;
  nextIndex: number;
  dutyWindow?: [number, number];
}

export type HullPaletteId = "diverging" | "purple" | "colorblind";

export interface HullPaletteState {
  id: HullPaletteId;
  encodeSectorHue: boolean;
  encodeBetaSign: boolean;
  legend: boolean;
}

export type SectorGrid3DMode = "shell" | "extruded";

export interface SectorGrid3DConfig {
  enabled: boolean;
  mode: SectorGrid3DMode;
  mixEMA: number;
  alpha: number;
  activeBoost: number;
  edgeSoftness: number;
  shellR0: number;
  shellR1: number;
  rInner: number;
  rOuter: number;
  halfHeight: number;
}

export interface HullOverlayConfig {
  sectorGrid3D: SectorGrid3DConfig;
}

export type HullSpacetimeGridMode = "slice" | "surface" | "volume";
export type HullSpacetimeGridColorBy = "thetaSign" | "thetaMagnitude" | "warpStrength";
export type HullSpacetimeGridStyle = "scientific" | "legacyDemo";
export type HullSpacetimeGridStrengthMode =
  | "manual"
  | "autoThetaPk"
  | "autoThetaScaleExpected";
export type HullSpacetimeGridBoundsMode = "lattice" | "domain";
export type HullSpacetimeGridFieldSource = "volume" | "analytic";
export type HullSpacetimeGridWarpField = SpacetimeGridWarpField;

export interface HullSpacetimeGridPrefs {
  enabled: boolean;
  mode: HullSpacetimeGridMode;
  spacing_m: number;
  warpStrength: number;
  falloff_m: number;
  colorBy: HullSpacetimeGridColorBy;
  style?: HullSpacetimeGridStyle;
  warpField?: HullSpacetimeGridWarpField;
  warpGamma?: number;
  useGradientDir?: boolean;
  useSdf: boolean;
  warpStrengthMode: HullSpacetimeGridStrengthMode;
  signedDisplacement?: boolean;
  boundsMode?: HullSpacetimeGridBoundsMode;
  boundsExpand_m?: number;
  fieldSource?: HullSpacetimeGridFieldSource;
  legacyPulseEnabled?: boolean;
  legacyPulseRate?: number;
  legacyPulseSpatialFreq?: number;
  legacyPointSize?: number;
  legacyPaletteMix?: number;
  legacyContrast?: number;
  legacyLineAlpha?: number;
  legacyPointAlpha?: number;
}

export type HullVoxelSliceAxis = "x" | "y" | "z";
export type HullOverlayPrefProfile = HullQualityPreset | "card";
export interface HullOverlayPrefs {
  slicesEnabled: boolean;
  sliceAxis: HullVoxelSliceAxis;
  sliceMin: number;
  sliceMax: number;
  coverageHeatmap: boolean;
  spacetimeGrid: HullSpacetimeGridPrefs;
}

export interface HullVizFloors {
  thetaGR?: number;
  rhoGR?: number;
  thetaDrive?: number;
}

export interface HullViewerBounds {
  axes?: [number, number, number];
  aspect?: number;
  domainScale?: number;
  basis?: HullBasisResolved;
}

export interface HullCameraState {
  eye?: [number, number, number];
  target?: [number, number, number];
  up?: [number, number, number];
  fov_deg?: number;
  radius_m?: number;
  yaw_deg?: number;
  pitch_deg?: number;
  preset?: CardCameraPreset;
}

export interface HullViewerState {
  planarVizMode?: number;
  volumeViz?: HullVolumeViz;
  volumeDomain?: HullVolumeDomain;
  volumeSource?: HullVolumeSource;
  vizFloors?: HullVizFloors;
  qualityPreset?: HullQualityPreset;
  qualityOverrides?: HullQualityOverrides;
  profileTag?: string;
  gateSource?: HullGateSource;
  gateView?: boolean;
  forceFlatGate?: boolean;
  opacityWindow?: [number, number];
  boundsProfile?: "tight" | "wide";
  bounds?: HullViewerBounds;
  palette?: HullPaletteState;
  camera?: HullCameraState;
}

export interface HullLatticeStrobeState {
  hash: string;
  source: "preview" | "fallback";
  lod: "preview" | "high";
  meshHash?: string;
  basisSignature?: string;
  handedness?: 1 | -1;
  sectorCount?: number;
  triangleCount?: number;
  vertexCount?: number;
  clampReasons?: string[];
  weightHash?: string;
  weightCacheHit?: boolean;
  hist?: {
    vertices: Float32Array;
    triangles: Float32Array;
    triangleArea: Float32Array;
    triangleAreaTotal: number;
    triangleArea01: Float32Array;
    sectorCount: number;
  } | null;
  weights?: Float32Array | null;
  coverage?: {
    area: Float32Array;
    area01: Float32Array;
    vertices: Float32Array;
    vertices01: Float32Array;
    triangles: Float32Array;
    triangles01: Float32Array;
  } | null;
}

export type HullLatticeSdfState = HullDistanceGrid;

export interface HullLatticeState {
  frame: LatticeFrame | null;
  preset: LatticeQualityPreset;
  profileTag: LatticeProfileTag;
  updatedAt: number;
  strobe?: HullLatticeStrobeState | null;
  sdf?: HullLatticeSdfState | null;
  volume?: HullSurfaceVoxelVolume | null;
}

export interface Hull3DSharedState {
  phase: HullPhaseBusState;
  sampling: HullSamplingWindowState;
  physics: HullPhysicsScaleState;
  compliance: HullComplianceState;
  sector: HullSectorDebugState;
  palette: HullPaletteState;
  overlays: HullOverlayConfig;
  overlayPrefs: Record<HullOverlayPrefProfile, HullOverlayPrefs>;
  meshOverlay: CardMeshMetadata | null;
  viewer: HullViewerState;
  lattice: HullLatticeState;
  setPhase: (next: Partial<HullPhaseBusState>) => void;
  setSampling: (next: Partial<HullSamplingWindowState>) => void;
  setPhysics: (next: Partial<HullPhysicsScaleState>) => void;
  setCompliance: (next: Partial<HullComplianceState>) => void;
  setSector: (next: Partial<HullSectorDebugState>) => void;
  setPalette: (next: Partial<HullPaletteState>) => void;
  setSectorGrid3D: (
    next:
      | Partial<SectorGrid3DConfig>
      | ((current: SectorGrid3DConfig) => SectorGrid3DConfig)
  ) => void;
  setOverlayPrefs: (
    profile: HullOverlayPrefProfile,
    next: Partial<HullOverlayPrefs> | ((current: HullOverlayPrefs) => HullOverlayPrefs)
  ) => void;
  setMeshOverlay: (next: CardMeshMetadata | null) => void;
  setViewer: (next: Partial<HullViewerState>) => void;
  setLattice: (next: Partial<HullLatticeState> | null) => void;
  togglePhysicsLock: (locked?: boolean) => void;
  trimPhysicsDb: (deltaDb: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const SPACETIME_GRID_SPACING_RANGE: [number, number] = [0.05, 5];
const SPACETIME_GRID_WARP_RANGE: [number, number] = [0, 5];
const SPACETIME_GRID_FALLOFF_RANGE: [number, number] = [0.05, 6];
const SPACETIME_GRID_WARP_GAMMA_RANGE: [number, number] = [0.1, 6];
const LEGACY_PULSE_RATE_RANGE: [number, number] = [0, 6];
const LEGACY_PULSE_SPATIAL_FREQ_RANGE: [number, number] = [0, 6];
const LEGACY_POINT_SIZE_RANGE: [number, number] = [1, 24];
const LEGACY_PALETTE_MIX_RANGE: [number, number] = [0, 1];
const LEGACY_CONTRAST_RANGE: [number, number] = [0.1, 4];
const LEGACY_LINE_ALPHA_RANGE: [number, number] = [0, 1];
const LEGACY_POINT_ALPHA_RANGE: [number, number] = [0, 1];

export const defaultSpacetimeGridPrefsForProfile = (
  profile: HullOverlayPrefProfile
): HullSpacetimeGridPrefs => {
  const base: HullSpacetimeGridPrefs = {
    enabled: true,
    mode: "volume",
    spacing_m: 0.55,
    warpStrength: 1.0,
    falloff_m: 0.9,
    colorBy: "thetaSign",
    style: "scientific",
    warpField: "dfdr",
    useSdf: true,
    warpStrengthMode: "autoThetaPk",
    warpGamma: 1.4,
    useGradientDir: true,
    signedDisplacement: false,
    legacyPulseEnabled: true,
    legacyPulseRate: 1.2,
    legacyPulseSpatialFreq: 1.0,
    legacyPointSize: 6,
    legacyPaletteMix: 1.0,
    legacyContrast: 1.0,
    legacyLineAlpha: 0.45,
    legacyPointAlpha: 0.9,
  };
  if (profile === "auto") {
    return {
      ...base,
      spacing_m: 0.6,
      warpStrength: 0.9,
      falloff_m: 0.95,
    };
  }
  if (profile === "low") {
    return {
      ...base,
      spacing_m: 0.75,
      warpStrength: 0.8,
      falloff_m: 1.0,
      useSdf: false,
    };
  }
  if (profile === "high") {
    return {
      ...base,
      spacing_m: 0.4,
      warpStrength: 1.1,
      falloff_m: 0.7,
    };
  }
  if (profile === "card") {
    return {
      ...base,
      spacing_m: 0.35,
      warpStrength: 0.9,
      falloff_m: 0.65,
    };
  }
  return base;
};

const normalizeSpacetimeGridPrefs = (
  profile: HullOverlayPrefProfile,
  prefs?: Partial<HullSpacetimeGridPrefs>,
  fallback?: HullSpacetimeGridPrefs
): HullSpacetimeGridPrefs => {
  const defaults = defaultSpacetimeGridPrefsForProfile(profile);
  const base = fallback ?? defaults;
  const candidate = prefs ?? base;
  const mode =
    candidate.mode === "slice" || candidate.mode === "surface" || candidate.mode === "volume"
      ? candidate.mode
      : base.mode;
  const warpStrengthMode =
    candidate.warpStrengthMode === "manual" ||
    candidate.warpStrengthMode === "autoThetaPk" ||
    candidate.warpStrengthMode === "autoThetaScaleExpected"
      ? candidate.warpStrengthMode
      : base.warpStrengthMode;
  const colorBy =
    candidate.colorBy === "thetaSign" ||
    candidate.colorBy === "thetaMagnitude" ||
    candidate.colorBy === "warpStrength"
      ? candidate.colorBy
      : base.colorBy;
  const warpField =
    candidate.warpField === "alpha" || candidate.warpField === "dfdr"
      ? candidate.warpField
      : base.warpField ?? "dfdr";
  const style =
    candidate.style === "legacyDemo" || candidate.style === "scientific"
      ? candidate.style
      : base.style ?? "scientific";
  const warpGammaCandidate = candidate.warpGamma;
  const warpGammaBase = base.warpGamma;
  const warpGamma =
    typeof warpGammaCandidate === "number" && Number.isFinite(warpGammaCandidate)
      ? clamp(
          warpGammaCandidate,
          SPACETIME_GRID_WARP_GAMMA_RANGE[0],
          SPACETIME_GRID_WARP_GAMMA_RANGE[1]
        )
      : typeof warpGammaBase === "number" && Number.isFinite(warpGammaBase)
        ? clamp(
            warpGammaBase,
            SPACETIME_GRID_WARP_GAMMA_RANGE[0],
            SPACETIME_GRID_WARP_GAMMA_RANGE[1]
          )
        : undefined;
  const useGradientDir =
    typeof candidate.useGradientDir === "boolean"
      ? candidate.useGradientDir
      : typeof base.useGradientDir === "boolean"
        ? base.useGradientDir
        : true;
  const spacingCandidate = candidate.spacing_m;
  const warpStrengthCandidate = candidate.warpStrength;
  const falloffCandidate = candidate.falloff_m;
  const boundsExpandCandidate = candidate.boundsExpand_m;
  const boundsExpandBase = base.boundsExpand_m;
  const boundsExpand =
    typeof boundsExpandCandidate === "number" && Number.isFinite(boundsExpandCandidate)
      ? Math.max(0, boundsExpandCandidate)
      : typeof boundsExpandBase === "number" && Number.isFinite(boundsExpandBase)
        ? Math.max(0, boundsExpandBase)
        : undefined;
  const signedDisplacement =
    typeof candidate.signedDisplacement === "boolean"
      ? candidate.signedDisplacement
      : typeof base.signedDisplacement === "boolean"
        ? base.signedDisplacement
        : false;
  const legacyPulseEnabled =
    typeof candidate.legacyPulseEnabled === "boolean"
      ? candidate.legacyPulseEnabled
      : typeof base.legacyPulseEnabled === "boolean"
        ? base.legacyPulseEnabled
        : true;
  const legacyPulseRate = clamp(
    typeof candidate.legacyPulseRate === "number" && Number.isFinite(candidate.legacyPulseRate)
      ? candidate.legacyPulseRate
      : typeof base.legacyPulseRate === "number" && Number.isFinite(base.legacyPulseRate)
        ? (base.legacyPulseRate as number)
        : 1.2,
    LEGACY_PULSE_RATE_RANGE[0],
    LEGACY_PULSE_RATE_RANGE[1]
  );
  const legacyPulseSpatialFreq = clamp(
    typeof candidate.legacyPulseSpatialFreq === "number" &&
      Number.isFinite(candidate.legacyPulseSpatialFreq)
      ? candidate.legacyPulseSpatialFreq
      : typeof base.legacyPulseSpatialFreq === "number" &&
          Number.isFinite(base.legacyPulseSpatialFreq)
        ? (base.legacyPulseSpatialFreq as number)
        : 1.0,
    LEGACY_PULSE_SPATIAL_FREQ_RANGE[0],
    LEGACY_PULSE_SPATIAL_FREQ_RANGE[1]
  );
  const legacyPointSize = clamp(
    typeof candidate.legacyPointSize === "number" && Number.isFinite(candidate.legacyPointSize)
      ? candidate.legacyPointSize
      : typeof base.legacyPointSize === "number" && Number.isFinite(base.legacyPointSize)
        ? (base.legacyPointSize as number)
        : 6,
    LEGACY_POINT_SIZE_RANGE[0],
    LEGACY_POINT_SIZE_RANGE[1]
  );
  const legacyPaletteMix = clamp(
    typeof candidate.legacyPaletteMix === "number" && Number.isFinite(candidate.legacyPaletteMix)
      ? candidate.legacyPaletteMix
      : typeof base.legacyPaletteMix === "number" && Number.isFinite(base.legacyPaletteMix)
        ? (base.legacyPaletteMix as number)
        : 1.0,
    LEGACY_PALETTE_MIX_RANGE[0],
    LEGACY_PALETTE_MIX_RANGE[1]
  );
  const legacyContrast = clamp(
    typeof candidate.legacyContrast === "number" && Number.isFinite(candidate.legacyContrast)
      ? candidate.legacyContrast
      : typeof base.legacyContrast === "number" && Number.isFinite(base.legacyContrast)
        ? (base.legacyContrast as number)
        : 1.0,
    LEGACY_CONTRAST_RANGE[0],
    LEGACY_CONTRAST_RANGE[1]
  );
  const legacyLineAlpha = clamp(
    typeof candidate.legacyLineAlpha === "number" && Number.isFinite(candidate.legacyLineAlpha)
      ? candidate.legacyLineAlpha
      : typeof base.legacyLineAlpha === "number" && Number.isFinite(base.legacyLineAlpha)
        ? (base.legacyLineAlpha as number)
        : 0.45,
    LEGACY_LINE_ALPHA_RANGE[0],
    LEGACY_LINE_ALPHA_RANGE[1]
  );
  const legacyPointAlpha = clamp(
    typeof candidate.legacyPointAlpha === "number" && Number.isFinite(candidate.legacyPointAlpha)
      ? candidate.legacyPointAlpha
      : typeof base.legacyPointAlpha === "number" && Number.isFinite(base.legacyPointAlpha)
        ? (base.legacyPointAlpha as number)
        : 0.9,
    LEGACY_POINT_ALPHA_RANGE[0],
    LEGACY_POINT_ALPHA_RANGE[1]
  );
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : base.enabled,
    mode,
    spacing_m: clamp(
      typeof spacingCandidate === "number" && Number.isFinite(spacingCandidate)
        ? spacingCandidate
        : base.spacing_m,
      SPACETIME_GRID_SPACING_RANGE[0],
      SPACETIME_GRID_SPACING_RANGE[1]
    ),
    warpStrength: clamp(
      typeof warpStrengthCandidate === "number" && Number.isFinite(warpStrengthCandidate)
        ? warpStrengthCandidate
        : base.warpStrength,
      SPACETIME_GRID_WARP_RANGE[0],
      SPACETIME_GRID_WARP_RANGE[1]
    ),
    falloff_m: clamp(
      typeof falloffCandidate === "number" && Number.isFinite(falloffCandidate)
        ? falloffCandidate
        : base.falloff_m,
      SPACETIME_GRID_FALLOFF_RANGE[0],
      SPACETIME_GRID_FALLOFF_RANGE[1]
    ),
    colorBy,
    style,
    warpField,
    warpGamma,
    useGradientDir,
    useSdf: typeof candidate.useSdf === "boolean" ? candidate.useSdf : base.useSdf,
    warpStrengthMode,
    signedDisplacement,
    boundsExpand_m: boundsExpand,
    legacyPulseEnabled,
    legacyPulseRate,
    legacyPulseSpatialFreq,
    legacyPointSize,
    legacyPaletteMix,
    legacyContrast,
    legacyLineAlpha,
    legacyPointAlpha,
  };
};

export const defaultOverlayPrefsForProfile = (profile: HullOverlayPrefProfile): HullOverlayPrefs => {
  const base: HullOverlayPrefs = {
    slicesEnabled: false,
    sliceAxis: "y",
    sliceMin: 0.35,
    sliceMax: 0.65,
    coverageHeatmap: true,
    spacetimeGrid: defaultSpacetimeGridPrefsForProfile(profile),
  };
  if (profile === "auto" || profile === "low") {
    return { ...base, coverageHeatmap: false };
  }
  if (profile === "card") {
    return { ...base, slicesEnabled: true };
  }
  return base;
};

const buildDefaultOverlayPrefs = (): Record<HullOverlayPrefProfile, HullOverlayPrefs> => {
  const profiles: HullOverlayPrefProfile[] = ["auto", "low", "medium", "high", "card"];
  const prefs: Record<HullOverlayPrefProfile, HullOverlayPrefs> = {} as any;
  for (const key of profiles) {
    prefs[key] = defaultOverlayPrefsForProfile(key);
  }
  return prefs;
};

const creator: StateCreator<Hull3DSharedState> = (set) => ({
  phase: {
    mode: "auto",
    source: "time",
    phase01: 0,
    phaseCont: 0,
    sign: 1,
    wedgeIndex: 0,
    nextWedgeIndex: 1,
    damp: 0.15,
    updatedAt: 0,
  },
  sampling: {
    key: "instant",
    label: "Instant",
    durationMs: 0,
    provenance: "Instantaneous sample",
  },
  physics: {
    locked: false,
    thetaExpected: undefined,
    thetaUsed: undefined,
    ratio: undefined,
    trimDb: 24,
    yGain: 1e-12,
    kColor: 0.05,
    analyticPeak: undefined,
    tailPeak: undefined,
    updatedAt: 0,
  },
  compliance: {
    reciprocity: { status: "unknown" },
    zeta: { status: "unknown" },
  },
  sector: {
    weightsInstant: new Float32Array(0),
    weightsAverage: new Float32Array(0),
    sqrtBoost: new Float32Array(0),
    betaSign: 1,
    activeIndex: 0,
    nextIndex: 1,
  },
  palette: {
    id: "diverging",
    encodeSectorHue: false,
    encodeBetaSign: true,
    legend: true,
  },
  overlays: {
    sectorGrid3D: {
      enabled: true,
      mode: "shell",
      mixEMA: 0.65,
      alpha: 0.24,
      activeBoost: 0.35,
      edgeSoftness: 0.18,
      shellR0: 1.0,
      shellR1: 1.035,
      rInner: 0.985,
      rOuter: 1.045,
      halfHeight: 0.055,
    },
  },
  overlayPrefs: buildDefaultOverlayPrefs(),
  meshOverlay: null,
  viewer: {
    volumeDomain: "wallBand",
    volumeSource: "lattice",
  },
  lattice: {
    frame: null,
    preset: "auto",
    profileTag: "preview",
    updatedAt: 0,
    strobe: null,
    sdf: null,
    volume: null,
  },
  setPhase: (next) =>
    set((state) => ({
      phase: {
        ...state.phase,
        ...next,
        phase01: clamp(
          typeof next.phase01 === "number" ? next.phase01 : state.phase.phase01,
          0,
          1
        ),
        sign:
          typeof next.sign === "number"
            ? (next.sign >= 0 ? 1 : -1)
            : state.phase.sign,
        updatedAt: next.updatedAt ?? Date.now(),
      },
    })),
  setSampling: (next) =>
    set((state) => ({
      sampling: {
        ...state.sampling,
        ...next,
      },
    })),
  setPhysics: (next) =>
    set((state) => {
      const locked =
        typeof next.locked === "boolean" ? next.locked : state.physics.locked;
      const trimDb =
        typeof next.trimDb === "number" ? clamp(next.trimDb, -24, 24) : state.physics.trimDb;
      const ratio =
        typeof next.ratio === "number"
          ? next.ratio
          : state.physics.ratio;
      return {
        physics: {
          ...state.physics,
          ...next,
          locked,
          trimDb,
          ratio,
          updatedAt: next.updatedAt ?? Date.now(),
        },
      };
    }),
  setCompliance: (next) =>
    set((state) => ({
      compliance: {
        reciprocity: {
          ...state.compliance.reciprocity,
          ...(next.reciprocity ?? {}),
        },
        zeta: {
          ...state.compliance.zeta,
          ...(next.zeta ?? {}),
        },
      },
    })),
  setSector: (next) =>
    set((state) => ({
      sector: {
        ...state.sector,
        ...next,
        betaSign:
          typeof next.betaSign === "number"
            ? (next.betaSign >= 0 ? 1 : -1)
            : state.sector.betaSign,
      },
    })),
  setPalette: (next) =>
    set((state) => ({
      palette: {
        ...state.palette,
        ...next,
      },
    })),
  setSectorGrid3D: (next) =>
    set((state) => {
      const current = state.overlays.sectorGrid3D;
      const updated: SectorGrid3DConfig =
        typeof next === "function"
          ? (next as (curr: SectorGrid3DConfig) => SectorGrid3DConfig)(current)
          : ({ ...current, ...next } as SectorGrid3DConfig);

      return {
        overlays: {
          ...state.overlays,
          sectorGrid3D: updated,
        },
      };
    }),
  setOverlayPrefs: (profile, next) =>
    set((state) => {
      const current =
        state.overlayPrefs[profile] ?? defaultOverlayPrefsForProfile(profile);
      const target =
        typeof next === "function"
          ? (next as (curr: HullOverlayPrefs) => HullOverlayPrefs)(current)
          : ({ ...current, ...next } as HullOverlayPrefs);
      const sliceMin = clamp01(target.sliceMin);
      const sliceMax = clamp01(target.sliceMax);
      const min = Math.min(sliceMin, sliceMax - 0.01);
      const max = Math.max(min + 0.01, sliceMax);
      const currentSpacetimeGrid =
        current.spacetimeGrid ?? defaultSpacetimeGridPrefsForProfile(profile);
      const targetSpacetimeGrid =
        target.spacetimeGrid ?? currentSpacetimeGrid;
      const normalized: HullOverlayPrefs = {
        slicesEnabled: !!target.slicesEnabled,
        sliceAxis: target.sliceAxis === "x" || target.sliceAxis === "y" || target.sliceAxis === "z" ? target.sliceAxis : current.sliceAxis,
        sliceMin: clamp01(min),
        sliceMax: clamp01(max),
        coverageHeatmap: !!target.coverageHeatmap,
        spacetimeGrid: normalizeSpacetimeGridPrefs(
          profile,
          targetSpacetimeGrid,
          currentSpacetimeGrid
        ),
      };
      return {
        overlayPrefs: {
          ...state.overlayPrefs,
          [profile]: normalized,
        },
      };
    }),
  setMeshOverlay: (next) =>
    set(() => ({
      meshOverlay: next ? { ...next, updatedAt: next.updatedAt ?? Date.now() } : null,
    })),
  setLattice: (next) =>
    set((state) => {
      if (!next) {
        return {
          lattice: {
            frame: null,
            preset: "auto",
            profileTag: "preview",
            updatedAt: Date.now(),
            strobe: null,
            sdf: null,
            volume: null,
          },
        };
      }
      return {
        lattice: {
          ...state.lattice,
          ...next,
          updatedAt: next.updatedAt ?? Date.now(),
        },
      };
    }),
  setViewer: (next) =>
    set((state) => ({
      viewer: {
        ...state.viewer,
        ...next,
        vizFloors: {
          ...(state.viewer.vizFloors ?? {}),
          ...(next.vizFloors ?? {}),
        },
        bounds: {
          ...(state.viewer.bounds ?? {}),
          ...(next.bounds ?? {}),
        },
        qualityOverrides: next.qualityOverrides
          ? {
              ...(state.viewer.qualityOverrides ?? {}),
              ...next.qualityOverrides,
            }
          : state.viewer.qualityOverrides,
        camera: next.camera
          ? { ...(state.viewer.camera ?? {}), ...next.camera }
          : state.viewer.camera,
      },
    })),
  togglePhysicsLock: (locked) =>
    set((state) => ({
      physics: {
        ...state.physics,
        locked: typeof locked === "boolean" ? locked : !state.physics.locked,
        updatedAt: Date.now(),
      },
    })),
  trimPhysicsDb: (deltaDb) =>
    set((state) => ({
      physics: {
        ...state.physics,
        trimDb: clamp(state.physics.trimDb + deltaDb, -24, 24),
        updatedAt: Date.now(),
      },
    })),
});

export const useHull3DSharedStore = createWithEqualityFn<Hull3DSharedState>(creator);
