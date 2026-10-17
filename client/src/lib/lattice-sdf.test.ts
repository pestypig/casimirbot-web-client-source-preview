import { describe, expect, it } from "vitest";
import { buildLatticeFrame } from "./lattice-frame";
import { buildHullDistanceGrid, clearLatticeSdfCache, encodeHullDistanceBandWeightsR8 } from "./lattice-sdf";
import { hashLatticeSdfDeterminism } from "./lattice-health";
import { resolveHullSurfaceMesh } from "./resolve-wireframe-overlay";
import { HULL_BASIS_IDENTITY } from "@shared/hull-basis";
import type { HullPreviewPayload } from "@shared/schema";

const cubePayload: HullPreviewPayload = {
  version: "v1",
  meshHash: "cube-mesh",
  targetDims: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
  lodCoarse: {
    indexedGeometry: {
      positions: [
        -1, -1, -1, // 0
         1, -1, -1, // 1
        -1,  1, -1, // 2
         1,  1, -1, // 3
        -1, -1,  1, // 4
         1, -1,  1, // 5
        -1,  1,  1, // 6
         1,  1,  1, // 7
      ],
      indices: [
        0, 1, 2, 1, 3, 2, // bottom
        4, 6, 5, 5, 6, 7, // top
        0, 2, 4, 4, 2, 6, // left
        1, 5, 3, 5, 7, 3, // right
        0, 4, 1, 4, 5, 1, // front
        2, 3, 6, 6, 3, 7, // back
      ],
    },
  },
};

const smallFrame = buildLatticeFrame({
  hullDims: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
  basis: HULL_BASIS_IDENTITY,
  boundsProfile: "tight",
  preset: "low",
  overrides: { targetVoxel_m: 0.5, maxDim: 12, maxVoxels: 4000 },
});

describe("buildHullDistanceGrid", () => {
  it("builds a sparse distance grid aligned to lattice bounds", async () => {
    const res = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(res.grid).not.toBeNull();
    const grid = res.grid!;
    expect(grid.cacheHit).toBe(false);
    expect(grid.dims).toEqual(smallFrame.dims);
    expect(grid.bounds[0]).toBeCloseTo(smallFrame.bounds.halfSize[0]);
    expect(grid.stats.voxelsTouched).toBeGreaterThan(0);
    expect(grid.stats.triangleCoverage).toBeGreaterThan(0.5);
    expect(grid.stats.maxQuantizationError).toBeCloseTo(
      0.5 * Math.sqrt(3) * smallFrame.voxelSize_m,
    );
    expect(grid.provenance).toEqual({
      claimTier: "diagnostic",
      certifying: false,
      source: "lattice-dataflow/default",
    });
  });

  it("returns a cache hit for identical mesh/basis signatures", async () => {
    const first = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    const second = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(first.grid?.key).toBe(second.grid?.key);
    expect(second.grid?.cacheHit).toBe(true);
    expect(second.grid?.stats.voxelsTouched).toBeGreaterThan(0);

    clearLatticeSdfCache();
    const third = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(third.grid?.key).toBe(first.grid?.key);
    expect(third.grid?.cacheHit).toBe(false);
  });

  it("encodes an R8 distance band weight volume for shader blending", async () => {
    const res = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(res.grid).not.toBeNull();
    const grid = res.grid!;

    const encoded = encodeHullDistanceBandWeightsR8(grid);
    expect(encoded.length).toBe(grid.dims[0] * grid.dims[1] * grid.dims[2]);

    expect(grid.indices.length).toBeGreaterThan(0);
    const idx0 = grid.indices[0] ?? 0;
    const dist0 = grid.distances[0] ?? 0;
    const expected = Math.max(0, Math.min(255, Math.round((1 - Math.min(1, Math.abs(dist0) / grid.band)) * 255)));
    expect(encoded[idx0]).toBe(expected);

    let max = 0;
    for (let i = 0; i < encoded.length; i++) {
      const v = encoded[i] ?? 0;
      if (v > max) max = v;
    }
    expect(max).toBeGreaterThan(0);
  });

  it("accepts a pre-resolved surface to avoid duplicate mesh prep", async () => {
    const resolved = resolveHullSurfaceMesh(cubePayload, { lod: "preview", totalSectors: 4 });
    expect(resolved.surface).not.toBeNull();

    const res = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      surfaceResolved: resolved,
      maxSamples: 120_000,
    });

    expect(res.grid).not.toBeNull();
    expect(res.clampReasons).toEqual(resolved.clampReasons);
    expect(res.grid?.meshHash).toBe(resolved.surface?.meshHash);
    expect(res.grid?.stats.triangleCoverage).toBeGreaterThan(0.1);
  });

  it("produces a stable determinism hash and coverage for the same SDF build", async () => {
    const res = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: smallFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(res.grid).not.toBeNull();
    const grid = res.grid!;
    expect(grid.stats.voxelCoverage).toBeGreaterThan(0);
    const hash1 = await hashLatticeSdfDeterminism(grid, { sampleCount: 64, quantScale: 1e5 });
    const hash2 = await hashLatticeSdfDeterminism(grid, { sampleCount: 64, quantScale: 1e5 });
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThanOrEqual(8);
  });


  it("preserves certifying provenance when explicitly provided", async () => {
    const certFrame = buildLatticeFrame({
      hullDims: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
      basis: HULL_BASIS_IDENTITY,
      boundsProfile: "tight",
      preset: "low",
      overrides: { targetVoxel_m: 0.5, maxDim: 12, maxVoxels: 4000 },
      provenance: { claimTier: "certifying", certifying: true, source: "toe-030" },
    });

    const res = await buildHullDistanceGrid({
      payload: cubePayload,
      frame: certFrame,
      band: 1.0,
      maxSamples: 120_000,
    });
    expect(res.grid?.provenance).toEqual({ claimTier: "certifying", certifying: true, source: "toe-030" });
  });
});
