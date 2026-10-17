import { describe, expect, it } from "vitest";
import { HULL_BASIS_IDENTITY, type HullBasisResolved } from "@shared/hull-basis";
import { applySchedulerWeights, clearLatticeSurfaceCaches, voxelizeHullSurfaceStrobe } from "./lattice-surface";
import type { HullSurfaceMesh } from "./resolve-wireframe-overlay";
import { LATTICE_QUALITY_BUDGETS, type LatticeFrame } from "./lattice-frame";

const mockBasis: HullBasisResolved = {
  swap: { x: "x", y: "y", z: "z" },
  flip: { x: false, y: false, z: false },
  scale: [1, 1, 1],
  forward: [0, 0, 1],
  up: [0, 1, 0],
  right: [1, 0, 0],
};

describe("applySchedulerWeights caching", () => {
  const hist = {
    vertices: new Float32Array([1, 1, 1, 1]),
    triangles: new Float32Array([1, 1, 1, 1]),
    triangleArea: new Float32Array([1, 1, 1, 1]),
    triangleAreaTotal: 4,
    triangleArea01: new Float32Array([0.25, 0.25, 0.25, 0.25]),
    sectorCount: 4,
  };
  const params = {
    totalSectors: 4,
    liveSectors: 2,
    sectorCenter01: 0.25,
    gaussianSigma: 0.18,
    sectorFloor: 0.05,
    splitEnabled: false,
    splitFrac: 0.5,
    syncMode: 1,
  };

  it("returns deterministic hash and reuses cached weights", () => {
    const first = applySchedulerWeights(hist, params, { surfaceHash: "meshA|lod1", basis: mockBasis });
    expect(first).not.toBeNull();
    expect(first?.hash).toBeDefined();
    expect(first?.cacheHit).toBe(false);

    const second = applySchedulerWeights(hist, params, { surfaceHash: "meshA|lod1", basis: mockBasis });
    expect(second).not.toBeNull();
    expect(second?.hash).toBe(first?.hash);
    expect(second?.cacheHit).toBe(true);
    expect(Array.from(second!.weights)).toEqual(Array.from(first!.weights));

    clearLatticeSurfaceCaches();
    const third = applySchedulerWeights(hist, params, { surfaceHash: "meshA|lod1", basis: mockBasis });
    expect(third).not.toBeNull();
    expect(third?.hash).toBe(first?.hash);
    expect(third?.cacheHit).toBe(false);
  });
});

const makeUnitFrame = (): LatticeFrame => ({
  preset: "low",
  profileTag: "preview",
  boundsProfile: "tight",
  voxelSize_m: 1,
  dims: [1, 1, 1],
  voxelCount: 1,
  padding_m: [0, 0, 0],
  bounds: {
    size: [1, 1, 1],
    halfSize: [0.5, 0.5, 0.5],
    centerWorld: [0, 0, 0],
    minLattice: [-0.5, -0.5, -0.5],
    maxLattice: [0.5, 0.5, 0.5],
    basis: HULL_BASIS_IDENTITY,
  },
  latticeToWorld: new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
  worldToLattice: new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
  budget: LATTICE_QUALITY_BUDGETS.low,
  clampReasons: [],
});

const makeSurface = (): HullSurfaceMesh => {
  const positions = new Float32Array([
    -0.3, -0.3, 0,
     0.3, -0.3, 0,
     0.0,  0.3, 0,
  ]);
  return {
    key: "testSurface",
    lod: "preview",
    positions,
    indices: new Uint32Array([0, 1, 2]),
    normals: null,
    tangents: null,
    vertexAngles01: new Float32Array([0, 0, 0]),
    vertexSectors: new Uint16Array([0, 0, 0]),
    triangleAngles01: new Float32Array([0]),
    triangleSectors: new Uint16Array([0]),
    sectorCount: 1,
    triangleCount: 1,
    vertexCount: 3,
    meshHash: "meshTest",
    basis: HULL_BASIS_IDENTITY,
    handedness: 1,
    bounds: {
      min: [-0.3, -0.3, 0],
      max: [0.3, 0.3, 0],
      size: [0.6, 0.6, 0],
      center: [0, 0, 0],
    },
    wireframe: null,
    clampReasons: [],
    source: "preview",
  };
};

describe("voxelizeHullSurfaceStrobe", () => {
  it("accumulates per-vertex strobe into normalized gate/drive volumes", () => {
    const frame = makeUnitFrame();
    const surface = makeSurface();
    const params = {
      frame,
      surface,
      sectorWeights: new Float32Array([1]),
      perVertexDfdr: new Float32Array([2, 2, 2]),
      gateScale: 1,
      driveScale: 1,
      driveLadder: { R: 1, sigma: 6, beta: 0.2, gate: 1, ampChain: 1 },
      shellThickness: 0.6,
      surfaceHash: "meshTest",
      weightsHash: "w1",
      dfdrSignature: "6.000000|0.200000|1.000",
    } as const;

    const first = voxelizeHullSurfaceStrobe(params);
    expect(first.volume).not.toBeNull();
    const volume = first.volume!;
    expect(volume.cacheHit).toBe(false);
    expect(Array.from(volume.gate3D)).toEqual([1]);
    expect(Array.from(volume.dfdr3D)).toEqual([2]);
    expect(Array.from(volume.drive3D)).toEqual([2]);
    expect(volume.metadata.driveLadder.scalars).toEqual({ R: 1, sigma: 6, beta: 0.2, gate: 1, ampChain: 1 });
    expect(volume.metadata.driveLadder.gateScale).toBe(1);
    expect(volume.metadata.driveLadder.driveScale).toBe(1);
    expect(volume.metadata.driveLadder.dfdrSignature).toBe("6.000000|0.200000|1.000");
    expect(volume.metadata.driveLadder.signature).toBe("6.000000|0.200000|1.000|g1000000|d1000000");
    expect(volume.metadata.driveLadder.hash).toHaveLength(8);
    expect(volume.stats.voxelsTouched).toBe(1);
    expect(volume.stats.coverage).toBeCloseTo(1);

    const second = voxelizeHullSurfaceStrobe(params);
    expect(second.volume).not.toBeNull();
    expect(second.volume?.cacheHit).toBe(true);
    expect(second.volume?.hash).toBe(volume.hash);

    clearLatticeSurfaceCaches();
    const third = voxelizeHullSurfaceStrobe(params);
    expect(third.volume).not.toBeNull();
    expect(third.volume?.cacheHit).toBe(false);
    expect(third.volume?.hash).toBe(volume.hash);
  });

  it("honors gateScale and driveScale in voxel outputs and hash", () => {
    const frame = makeUnitFrame();
    const surface = makeSurface();
    const base = voxelizeHullSurfaceStrobe({
      frame,
      surface,
      sectorWeights: new Float32Array([1]),
      perVertexDfdr: new Float32Array([1, 1, 1]),
      shellThickness: 0.6,
      surfaceHash: "meshBase",
      gateScale: 1,
      driveScale: 1,
      driveLadder: { R: 1, sigma: 6, beta: 0.2, gate: 1, ampChain: 1 },
      dfdrSignature: "6.000000|0.200000|1.000",
    });
    const scaled = voxelizeHullSurfaceStrobe({
      frame,
      surface,
      sectorWeights: new Float32Array([1]),
      perVertexDfdr: new Float32Array([1, 1, 1]),
      shellThickness: 0.6,
      surfaceHash: "meshBase",
      gateScale: 0.5,
      driveScale: 2,
      driveLadder: { R: 1, sigma: 6, beta: 0.2, gate: 0.5, ampChain: 2 },
      dfdrSignature: "6.000000|0.200000|1.000",
    });
    expect(base.volume?.gate3D[0]).toBeCloseTo(1);
    expect(base.volume?.drive3D[0]).toBeCloseTo(1);
    expect(scaled.volume?.gate3D[0]).toBeCloseTo(0.5);
    expect(scaled.volume?.drive3D[0]).toBeCloseTo(1);
    expect(scaled.volume?.metadata.driveLadder.scalars?.gate).toBeCloseTo(0.5);
    expect(scaled.volume?.metadata.driveLadder.scalars?.ampChain).toBeCloseTo(2);
    expect(scaled.volume?.metadata.driveLadder.signature).toBe("6.000000|0.200000|1.000|g500000|d2000000");
    expect(scaled.volume?.metadata.driveLadder.hash).not.toBe(base.volume?.metadata.driveLadder.hash);
    expect(base.volume?.metadata.provenance).toEqual({
      claimTier: "diagnostic",
      certifying: false,
      source: "lattice-dataflow/default",
    });
    expect(scaled.volume?.hash).not.toBe(base.volume?.hash);
  });

  it("records a budget hit and clamp reason when sampling overruns the limit", () => {
    const voxelSize = 0.05;
    const dims: [number, number, number] = [32, 32, 32];
    const halfSize = dims.map((d) => (d * voxelSize) / 2) as [number, number, number];
    const frame = {
      preset: "high",
      profileTag: "preview",
      boundsProfile: "tight",
      voxelSize_m: voxelSize,
      dims,
      voxelCount: dims[0] * dims[1] * dims[2],
      padding_m: [0, 0, 0] as [number, number, number],
      bounds: {
        size: halfSize.map((v) => v * 2) as [number, number, number],
        halfSize,
        centerWorld: [0, 0, 0] as [number, number, number],
        minLattice: halfSize.map((v) => -v) as [number, number, number],
        maxLattice: halfSize as [number, number, number],
        basis: HULL_BASIS_IDENTITY,
      },
      latticeToWorld: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
      worldToLattice: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
      budget: LATTICE_QUALITY_BUDGETS.high,
      provenance: { claimTier: "diagnostic", certifying: false, source: "lattice-dataflow/default" },
      clampReasons: [],
    } satisfies LatticeFrame;

    const surface = makeSurface();
    const result = voxelizeHullSurfaceStrobe({
      frame,
      surface,
      sectorWeights: new Float32Array([1]),
      perVertexDfdr: new Float32Array([1, 1, 1]),
      shellThickness: 0.5,
      sampleBudget: 6,
      surfaceHash: "meshBudget",
      dfdrSignature: "sig",
    });

    expect(result.volume).not.toBeNull();
    expect(result.volume?.stats.budgetHit).toBe(true);
    expect(result.volume?.clampReasons).toContain("voxel:budgetHit");
  });
});
