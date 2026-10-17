import { describe, expect, it } from "vitest";
import { HULL_BASIS_IDENTITY } from "@shared/hull-basis";
import { buildLatticeFrame, LATTICE_QUALITY_BUDGETS } from "./lattice-frame";

describe("buildLatticeFrame", () => {
  it("uses preview defaults for auto preset", () => {
    const frame = buildLatticeFrame({
      hullDims: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
      basis: HULL_BASIS_IDENTITY,
    });
    const budget = LATTICE_QUALITY_BUDGETS.medium;
    expect(frame.preset).toBe("medium");
    expect(frame.profileTag).toBe("preview");
    expect(frame.voxelSize_m).toBeCloseTo(budget.targetVoxel_m, 3);
    expect(frame.dims[0]).toBeLessThanOrEqual(budget.maxDim);
    expect(frame.voxelCount).toBeLessThan(budget.maxVoxels);
    expect(frame.clampReasons.filter((reason) => reason.startsWith("dims"))).toHaveLength(0);
  });

  it("promotes auto preset to card budgets when card profile is requested", () => {
    const frame = buildLatticeFrame({
      hullDims: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
      basis: HULL_BASIS_IDENTITY,
      profileTag: "card",
    });
    const budget = LATTICE_QUALITY_BUDGETS.card;
    expect(frame.preset).toBe("card");
    expect(frame.profileTag).toBe("card");
    expect(frame.voxelSize_m).toBeCloseTo(budget.targetVoxel_m, 3);
    expect(frame.dims[0]).toBeLessThanOrEqual(budget.maxDim);
  });

  it("clamps voxel size and dims to stay within budget on large hulls", () => {
    const frame = buildLatticeFrame({
      hullDims: { Lx_m: 120, Ly_m: 60, Lz_m: 60 },
      basis: HULL_BASIS_IDENTITY,
      boundsProfile: "wide",
      preset: "high",
    });
    const budget = LATTICE_QUALITY_BUDGETS.high;
    expect(frame.dims[0]).toBeLessThanOrEqual(budget.maxDim);
    expect(frame.voxelCount).toBeLessThanOrEqual(budget.maxVoxels);
    expect(frame.voxelSize_m).toBeGreaterThan(budget.targetVoxel_m);
    expect(frame.clampReasons.some((reason) => reason.startsWith("dims"))).toBe(true);
  });

  it.each([
    { preset: "auto", profileTag: "preview", resolved: "medium" },
    { preset: "auto", profileTag: "card", resolved: "card" },
    { preset: "low", resolved: "low" },
    { preset: "medium", resolved: "medium" },
    { preset: "high", resolved: "high" },
    { preset: "card", resolved: "card" },
  ] as const)(
    "clamps oversized hulls to %s/%s budget with a clamp reason",
    ({ preset, profileTag, resolved }) => {
      const frame = buildLatticeFrame({
        hullDims: { Lx_m: 480, Ly_m: 240, Lz_m: 240 },
        basis: HULL_BASIS_IDENTITY,
        boundsProfile: "wide",
        preset,
        profileTag,
      });
      const budget = LATTICE_QUALITY_BUDGETS[resolved];
      expect(frame.preset).toBe(resolved);
      expect(frame.profileTag).toBe(profileTag ?? "preview");
      expect(frame.dims.every((dim) => dim <= budget.maxDim)).toBe(true);
      expect(frame.voxelCount).toBeLessThanOrEqual(budget.maxVoxels);
      expect(frame.clampReasons.some((reason) => reason.startsWith("dims"))).toBe(true);
    },
  );

  it("enforces per-profile voxel and byte-friendly dimensions when hulls exceed perf rails", () => {
    const hugeHull = { Lx_m: 1200, Ly_m: 600, Lz_m: 420 };
    const cases = [
      { preset: "low" as const, profileTag: "preview" as const },
      { preset: "high" as const, profileTag: "preview" as const },
      { preset: "card" as const, profileTag: "card" as const },
    ];

    for (const c of cases) {
      const frame = buildLatticeFrame({
        hullDims: hugeHull,
        basis: HULL_BASIS_IDENTITY,
        preset: c.preset,
        profileTag: c.profileTag,
        boundsProfile: "wide",
      });
      const budget = LATTICE_QUALITY_BUDGETS[c.preset === "card" ? "card" : c.preset];

      expect(frame.dims.every((d) => d <= budget.maxDim)).toBe(true);
      expect(frame.voxelCount).toBeLessThanOrEqual(budget.maxVoxels);
      expect(frame.clampReasons).toEqual(expect.arrayContaining(["dims:maxDim"]));
      expect(frame.voxelSize_m).toBeGreaterThanOrEqual(budget.minVoxel_m);
    }
  });

  it("adds deterministic diagnostic provenance defaults", () => {
    const frame = buildLatticeFrame({
      hullDims: { Lx_m: 4, Ly_m: 2, Lz_m: 1 },
      basis: HULL_BASIS_IDENTITY,
    });
    expect(frame.provenance).toEqual({
      claimTier: "diagnostic",
      certifying: false,
      source: "lattice-dataflow/default",
    });

    const downgraded = buildLatticeFrame({
      hullDims: { Lx_m: 4, Ly_m: 2, Lz_m: 1 },
      basis: HULL_BASIS_IDENTITY,
      provenance: { claimTier: "diagnostic", certifying: true, source: "   " },
    });
    expect(downgraded.provenance).toEqual(frame.provenance);
  });
});
