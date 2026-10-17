import type { HullBasisResolved } from "@shared/hull-basis";

export type LatticeProfileTag = "preview" | "card";

export type LatticeQualityPreset = "auto" | "low" | "medium" | "high" | "card";

type Vec3 = [number, number, number];

export type LatticeClaimTier = "diagnostic" | "certifying";

export type LatticeProvenance = {
  claimTier: LatticeClaimTier;
  certifying: boolean;
  source: string;
};

const DEFAULT_LATTICE_PROVENANCE: LatticeProvenance = Object.freeze({
  claimTier: "diagnostic",
  certifying: false,
  source: "lattice-dataflow/default",
});

const resolveLatticeProvenance = (provenance?: Partial<LatticeProvenance> | null): LatticeProvenance => {
  if (!provenance) return DEFAULT_LATTICE_PROVENANCE;
  const claimTier: LatticeClaimTier = provenance.claimTier === "certifying" ? "certifying" : "diagnostic";
  const certifying = claimTier === "certifying" ? provenance.certifying !== false : false;
  const source = typeof provenance.source === "string" && provenance.source.trim() ? provenance.source : DEFAULT_LATTICE_PROVENANCE.source;
  return { claimTier, certifying, source };
};

export type LatticeQualityBudget = {
  paddingPct: number;       // Fractional padding applied to each axis (per side) relative to the hull extent.
  paddingMin_m: number;     // Absolute minimum padding per side in meters.
  paddingMax_m: number;     // Absolute maximum padding per side in meters.
  targetVoxel_m: number;    // Target voxel size before clamping.
  minVoxel_m: number;       // Smallest voxel size allowed.
  maxVoxel_m: number;       // Soft upper bound for voxel size; budget enforcement may exceed this to satisfy maxDim/maxVoxels.
  maxDim: number;           // Maximum voxels along a single axis.
  maxVoxels: number;        // Global voxel budget cap.
};

export const LATTICE_QUALITY_BUDGETS: Record<Exclude<LatticeQualityPreset, "auto">, LatticeQualityBudget> =
  Object.freeze({
    low: Object.freeze({
      paddingPct: 0.06,
      paddingMin_m: 0.25,
      paddingMax_m: 1.5,
      targetVoxel_m: 0.14,
      minVoxel_m: 0.1,
      maxVoxel_m: 0.22,
      maxDim: 160,
      maxVoxels: 3_600_000,
    }),
    medium: Object.freeze({
      paddingPct: 0.08,
      paddingMin_m: 0.3,
      paddingMax_m: 2.2,
      targetVoxel_m: 0.11,
      minVoxel_m: 0.085,
      maxVoxel_m: 0.2,
      maxDim: 192,
      maxVoxels: 5_800_000,
    }),
    high: Object.freeze({
      paddingPct: 0.1,
      paddingMin_m: 0.35,
      paddingMax_m: 3.0,
      targetVoxel_m: 0.09,
      minVoxel_m: 0.07,
      maxVoxel_m: 0.18,
      maxDim: 224,
      maxVoxels: 8_400_000,
    }),
    card: Object.freeze({
      paddingPct: 0.12,
      paddingMin_m: 0.45,
      paddingMax_m: 3.5,
      targetVoxel_m: 0.08,
      minVoxel_m: 0.065,
      maxVoxel_m: 0.16,
      maxDim: 256,
      maxVoxels: 12_000_000,
    }),
  });

type LatticeBudgetOverrides = Partial<
  Pick<
    LatticeQualityBudget,
    "paddingPct" | "paddingMin_m" | "paddingMax_m" | "targetVoxel_m" | "minVoxel_m" | "maxVoxel_m" | "maxDim" | "maxVoxels"
  >
>;

type BoundsProfile = "tight" | "wide";

const DEFAULT_PREVIEW_PRESET: Exclude<LatticeQualityPreset, "auto"> = "medium";
const BOUNDS_PROFILE_SCALE: Record<BoundsProfile, number> = { tight: 1, wide: 1.08 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const applyBudgetOverrides = (
  budget: LatticeQualityBudget,
  overrides?: LatticeBudgetOverrides | null,
): LatticeQualityBudget => {
  if (!overrides) return budget;
  const next = { ...budget };
  if (typeof overrides.paddingPct === "number") next.paddingPct = Math.max(0, overrides.paddingPct);
  if (typeof overrides.paddingMin_m === "number") next.paddingMin_m = Math.max(0, overrides.paddingMin_m);
  if (typeof overrides.paddingMax_m === "number") next.paddingMax_m = Math.max(next.paddingMin_m, overrides.paddingMax_m);
  if (typeof overrides.targetVoxel_m === "number") next.targetVoxel_m = Math.max(1e-6, overrides.targetVoxel_m);
  if (typeof overrides.minVoxel_m === "number") next.minVoxel_m = Math.max(1e-6, overrides.minVoxel_m);
  if (typeof overrides.maxVoxel_m === "number") next.maxVoxel_m = Math.max(next.minVoxel_m, overrides.maxVoxel_m);
  if (typeof overrides.maxDim === "number") next.maxDim = Math.max(1, Math.floor(overrides.maxDim));
  if (typeof overrides.maxVoxels === "number") next.maxVoxels = Math.max(1, Math.floor(overrides.maxVoxels));
  return next;
};

const selectPreset = (preset: LatticeQualityPreset, profile: LatticeProfileTag): Exclude<LatticeQualityPreset, "auto"> => {
  if (preset !== "auto") return preset;
  return profile === "card" ? "card" : DEFAULT_PREVIEW_PRESET;
};

const vec3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

const buildTransforms = (basis: HullBasisResolved, center: Vec3) => {
  const [cx, cy, cz] = center;
  const { right, up, forward } = basis;
  const latticeToWorld = new Float32Array([
    right[0], up[0], forward[0], 0,
    right[1], up[1], forward[1], 0,
    right[2], up[2], forward[2], 0,
    cx, cy, cz, 1,
  ]);
  const tx = -(cx * right[0] + cy * right[1] + cz * right[2]);
  const ty = -(cx * up[0] + cy * up[1] + cz * up[2]);
  const tz = -(cx * forward[0] + cy * forward[1] + cz * forward[2]);
  const worldToLattice = new Float32Array([
    right[0], up[0], forward[0], 0,
    right[1], up[1], forward[1], 0,
    right[2], up[2], forward[2], 0,
    tx, ty, tz, 1,
  ]);
  return { latticeToWorld, worldToLattice };
};

const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const scaleVec = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export type LatticeFrameInput = {
  hullDims: { Lx_m: number; Ly_m: number; Lz_m: number };
  basis: HullBasisResolved;
  boundsProfile?: BoundsProfile;
  preset?: LatticeQualityPreset;
  profileTag?: LatticeProfileTag;
  overrides?: LatticeBudgetOverrides | null;
  centerWorld?: Vec3;
  provenance?: Partial<LatticeProvenance> | null;
};

export type LatticeFrame = {
  preset: Exclude<LatticeQualityPreset, "auto">;
  profileTag: LatticeProfileTag;
  boundsProfile: BoundsProfile;
  voxelSize_m: number;
  dims: [number, number, number];
  voxelCount: number;
  padding_m: Vec3;
  bounds: {
    size: Vec3;
    halfSize: Vec3;
    centerWorld: Vec3;
    minLattice: Vec3;
    maxLattice: Vec3;
    basis: HullBasisResolved;
  };
  latticeToWorld: Float32Array;
  worldToLattice: Float32Array;
  budget: LatticeQualityBudget;
  provenance: LatticeProvenance;
  clampReasons: string[];
};

export function buildLatticeFrame(input: LatticeFrameInput): LatticeFrame {
  const profileTag: LatticeProfileTag = input.profileTag ?? "preview";
  const preset = selectPreset(input.preset ?? "auto", profileTag);
  const boundsProfile: BoundsProfile = input.boundsProfile ?? "tight";
  const budget = applyBudgetOverrides(LATTICE_QUALITY_BUDGETS[preset], input.overrides);

  const hullDims: Vec3 = [input.hullDims.Lx_m, input.hullDims.Ly_m, input.hullDims.Lz_m];
  const boundsScale = BOUNDS_PROFILE_SCALE[boundsProfile] ?? 1;
  const scaledDims = scaleVec(hullDims, boundsScale);

  const padding_m: Vec3 = vec3();
  const clampReasons: string[] = [];
  const hasPaddingOverride =
    typeof input.overrides?.paddingPct === "number" ||
    typeof input.overrides?.paddingMin_m === "number" ||
    typeof input.overrides?.paddingMax_m === "number";

  for (let i = 0; i < 3; i += 1) {
    const pctPad = scaledDims[i] * budget.paddingPct;
    const pad = clamp(Math.max(pctPad, budget.paddingMin_m), budget.paddingMin_m, budget.paddingMax_m);
    padding_m[i] = pad;
    if (pad !== pctPad && pad === budget.paddingMax_m) {
      clampReasons.push("padding:max");
    }
  }

  const clampVoxelSizeSoft = (size: number) => clamp(size, budget.minVoxel_m, budget.maxVoxel_m);
  const clampVoxelSizeForBudget = (size: number) => Math.max(size, budget.minVoxel_m);
  const targetVoxel = clampVoxelSizeSoft(budget.targetVoxel_m);
  if (targetVoxel !== budget.targetVoxel_m) clampReasons.push("voxelSize:clamped-target");

  const dimsFromVoxel = (voxelSize: number): [number, number, number] => [
    Math.max(1, Math.ceil(paddedDims[0] / voxelSize)),
    Math.max(1, Math.ceil(paddedDims[1] / voxelSize)),
    Math.max(1, Math.ceil(paddedDims[2] / voxelSize)),
  ];

  let paddedDims = addVec(scaledDims, scaleVec(padding_m, 2));
  let paddedHalf = scaleVec(paddedDims, 0.5);
  let voxelSize = targetVoxel;
  let dims = dimsFromVoxel(voxelSize);

  const recomputeFromPadding = () => {
    paddedDims = addVec(scaledDims, scaleVec(padding_m, 2));
    paddedHalf = scaleVec(paddedDims, 0.5);
    voxelSize = targetVoxel;
    dims = dimsFromVoxel(voxelSize);
    const enforceMaxDim = () => {
      const need = Math.max(
        paddedDims[0] / budget.maxDim,
        paddedDims[1] / budget.maxDim,
        paddedDims[2] / budget.maxDim,
      );
      if (Math.max(...dims) > budget.maxDim || voxelSize < need) {
        voxelSize = clampVoxelSizeForBudget(Math.max(voxelSize, need) * (1 + 1e-9));
        dims = dimsFromVoxel(voxelSize);
        clampReasons.push("dims:maxDim");
      }
    };

    const enforceVoxelBudget = () => {
      const voxels = dims[0] * dims[1] * dims[2];
      if (voxels > budget.maxVoxels) {
        const scale = Math.cbrt(voxels / budget.maxVoxels);
        voxelSize = clampVoxelSizeForBudget(voxelSize * scale * (1 + 1e-9));
        dims = dimsFromVoxel(voxelSize);
        clampReasons.push("dims:maxVoxels");
      }
    };

    enforceMaxDim();
    enforceVoxelBudget();
    enforceMaxDim();
  };

  recomputeFromPadding();

  if (!hasPaddingOverride) {
    const minPaddingVoxels = 4.5;
    let adjusted = false;
    for (let iter = 0; iter < 5; iter += 1) {
      const requiredPadding = voxelSize * minPaddingVoxels;
      let changed = false;
      for (let i = 0; i < 3; i += 1) {
        if (padding_m[i] < requiredPadding) {
          padding_m[i] = requiredPadding;
          changed = true;
        }
      }
      if (!changed) break;
      adjusted = true;
      recomputeFromPadding();
    }
    if (adjusted) clampReasons.push("padding:margin");
  }

  const voxelCount = dims[0] * dims[1] * dims[2];

  const latticeMin: Vec3 = [-paddedHalf[0], -paddedHalf[1], -paddedHalf[2]];
  const latticeMax: Vec3 = [paddedHalf[0], paddedHalf[1], paddedHalf[2]];
  const centerWorld = input.centerWorld ?? vec3();
  const { latticeToWorld, worldToLattice } = buildTransforms(input.basis, centerWorld);
  const provenance = resolveLatticeProvenance(input.provenance);

  return {
    preset,
    profileTag,
    boundsProfile,
    voxelSize_m: voxelSize,
    dims: [dims[0], dims[1], dims[2]],
    voxelCount,
    padding_m,
    bounds: {
      size: paddedDims,
      halfSize: paddedHalf,
      centerWorld,
      minLattice: latticeMin,
      maxLattice: latticeMax,
      basis: input.basis,
    },
    latticeToWorld,
    worldToLattice,
    budget,
    provenance,
    clampReasons,
  };
}
