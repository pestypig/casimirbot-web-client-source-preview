import { describe, expect, it } from "vitest";
import {
  VIEWER_WIREFRAME_BUDGETS,
  colorizeWireframeOverlay,
  resolveHullSurfaceMesh,
  resolveWireframeOverlay,
  type WireframeOverlayBuffers,
} from "./resolve-wireframe-overlay";
import { buildHullSurfaceStrobe } from "./lattice-surface";
import type { HullPreviewPayload } from "@shared/schema";

const boundsFromLines = (positions: Float32Array) => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return {
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(max[0] + min[0]) * 0.5, (max[1] + min[1]) * 0.5, (max[2] + min[2]) * 0.5],
  };
};

const triangleNormal = (positions: Float32Array, indices: Uint32Array | number[]) => {
  const a = (indices[0] ?? 0) * 3;
  const b = (indices[1] ?? 0) * 3;
  const c = (indices[2] ?? 0) * 3;
  const abx = (positions[b] ?? 0) - (positions[a] ?? 0);
  const aby = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
  const abz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
  const acx = (positions[c] ?? 0) - (positions[a] ?? 0);
  const acy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
  const acz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!Number.isFinite(mag) || mag < 1e-12) return [0, 0, 0] as const;
  return [nx / mag, ny / mag, nz / mag] as const;
};

const quadGeometry = () => ({
  positions: [
    0, 0, 0,
    2, 0, 0,
    0, 1, 0,
    0, 0, 3,
  ],
  indices: [0, 1, 2, 0, 2, 3],
});

describe("resolveWireframeOverlay guardrails", () => {
  it("applies basis swap/flip while keeping target extents", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "basis-test",
      targetDims: { Lx_m: 6, Ly_m: 4, Lz_m: 2 },
      basis: { swap: { x: "z", y: "x", z: "y" }, flip: { y: true }, scale: [1, 1.5, 0.5] },
      lodCoarse: {
        indexedGeometry: quadGeometry(),
      },
    };
    const result = resolveWireframeOverlay(payload, { lod: "preview" });
    expect(result.overlay).not.toBeNull();
    expect(result.clampReasons).toHaveLength(0);
    const basis = result.overlay!.basis!;
    expect(basis.scale[0]).toBeCloseTo(1);
    expect(basis.scale[1]).toBeCloseTo(1.5);
    expect(basis.scale[2]).toBeCloseTo(0.5);
    expect(basis.forward[0]).toBeCloseTo(1);
    expect(basis.forward[1]).toBeCloseTo(0);
    expect(basis.forward[2]).toBeCloseTo(0);
    const size = boundsFromLines(result.overlay!.positions).size;
    expect(size[0]).toBeCloseTo(6, 3);
    expect(size[1]).toBeCloseTo(4, 3);
    expect(size[2]).toBeCloseTo(2, 3);
  });

  it("rescales decimated LODs to match OBB extents", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "decim-ok",
      mesh: { obb: { center: [0, 0, 0], halfSize: [2, 1.5, 1] } },
      lodCoarse: {
        decimation: { targetTris: 10, achievedTris: 8 },
        indexedGeometry: {
          positions: [
            -0.5, -0.5, -0.5,
             0.5, -0.5, -0.5,
            -0.5,  0.5,  0.5,
             0.5,  0.5,  0.5,
          ],
          indices: [0, 1, 2, 1, 2, 3],
        },
      },
    };
    const result = resolveWireframeOverlay(payload, { lod: "preview" });
    expect(result.overlay).not.toBeNull();
    const size = boundsFromLines(result.overlay!.positions).size;
    expect(size[0]).toBeCloseTo(4, 3);
    expect(size[1]).toBeCloseTo(3, 3);
    expect(size[2]).toBeCloseTo(2, 3);
  });

  it("falls back to a populated LOD when preferred is missing geometry", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "lod-fallback",
      lodCoarse: {
        tag: "coarse",
        triangleCount: 12,
      },
      lodFull: {
        tag: "full",
        indexedGeometry: quadGeometry(),
      },
    };
    const result = resolveWireframeOverlay(payload, { lod: "preview" });
    expect(result.overlay).not.toBeNull();
    expect(result.clampReasons).toHaveLength(0);
    const size = boundsFromLines(result.overlay!.positions).size;
    expect(size[0]).toBeCloseTo(2, 3);
    expect(size[1]).toBeCloseTo(1, 3);
    expect(size[2]).toBeCloseTo(3, 3);
  });

  it("clamps over-budget decimation and falls back to geometric overlay", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "decim-big",
      lodCoarse: {
        decimation: { targetTris: VIEWER_WIREFRAME_BUDGETS.maxPreviewTriangles * 10 },
        indexedGeometry: quadGeometry(),
      },
    };
    const result = resolveWireframeOverlay(payload, { lod: "preview" });
    expect(result.overlay).toBeNull();
    expect(result.source).toBe("fallback");
    expect(result.clampReasons).toContain("overlay:decimationOverBudget");
  });

  it("clamps oversize uploads before rendering overlays", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "big-bytes",
      lodCoarse: {
        indexedGeometry: {
          ...quadGeometry(),
          byteLength: VIEWER_WIREFRAME_BUDGETS.maxUploadBytes + 1024,
        },
      },
    };
    const result = resolveWireframeOverlay(payload, { lod: "preview" });
    expect(result.overlay).toBeNull();
    expect(result.clampReasons).toContain("overlay:payloadTooLarge");
  });
});

describe("colorizeWireframeOverlay", () => {
  it("builds field-driven patches on an ellipsoid ring", () => {
    const positions: number[] = [];
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * 2, 0, Math.sin(a)); // ellipsoid radii 2 x 1
      positions.push(Math.cos(a + Math.PI / segments) * 2, 0, Math.sin(a + Math.PI / segments));
    }
    const overlay: WireframeOverlayBuffers = {
      key: "ellipsoid-ring",
      positions: new Float32Array(positions),
      lod: "preview",
      lineWidth: 1,
      alpha: 0.8,
      color: [0.1, 0.9, 0.7],
      clampReasons: [],
    };

    const { patches } = colorizeWireframeOverlay(overlay, {
      totalSectors: 6,
      liveSectors: 3,
      sectorCenter01: 0.0,
      gaussianSigma: 0.18,
      sectorFloor: 0.05,
      duty: 0.6,
      gateView: 1,
      syncMode: 1,
      fieldThreshold: 0.05,
      gradientThreshold: 0.05,
    });

    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0]?.gateMax ?? 0).toBeGreaterThan(0);
    // Ellipsoid sampling should cover multiple sectors evenly
    const uniqueSectors = new Set(patches.map((p) => p.sector));
    expect(uniqueSectors.size).toBeGreaterThan(1);
  });
});

describe("resolveHullSurfaceMesh", () => {
  const centeredQuadGeometry = () => ({
    positions: [
      1, 0, 0,   // +x
      0, 0, 1,   // +z
      0, 0, -1,  // -z
      -1, 0, 0,  // -x
    ],
    indices: [0, 1, 2, 0, 2, 3],
  });

  it("computes per-vertex and per-triangle sector indices", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "surface-basic",
      lodCoarse: { indexedGeometry: centeredQuadGeometry() },
    };
    const result = resolveHullSurfaceMesh(payload, { totalSectors: 4 });
    expect(result.surface).not.toBeNull();
    const surface = result.surface!;
    expect(surface.sectorCount).toBe(4);
    expect(surface.vertexAngles01[0]).toBeCloseTo(0, 5);
    expect(surface.vertexAngles01[1]).toBeCloseTo(0.25, 5);
    expect(surface.vertexAngles01[2]).toBeCloseTo(0.75, 5);
    expect(surface.vertexAngles01[3]).toBeCloseTo(0.5, 5);
    expect(Array.from(surface.vertexSectors.slice(0, 4))).toEqual([0, 1, 3, 2]);
    expect(Array.from(surface.triangleSectors.slice(0, 2))).toEqual([0, 3]);
  });

  it("culls degenerate triangles and flips winding for negative basis", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "surface-cull",
      basis: { flip: { x: true } },
      lodCoarse: {
        indexedGeometry: {
          positions: [
            1, 0, 0,   // +x
            0, 0, 1,   // +z
            0, 1, 0,   // +y
          ],
          indices: [
            0, 0, 1, // degenerate
            0, 1, 2, // valid triangle that will get winding flipped due to negative determinant
          ],
        },
      },
    };
    const result = resolveHullSurfaceMesh(payload, { totalSectors: 4 });
    expect(result.surface).not.toBeNull();
    const surface = result.surface!;
    expect(surface.triangleCount).toBe(1);
    expect(surface.indices.length).toBe(3);
    expect(surface.indices[0]).toBe(0);
    expect(surface.indices[1]).toBe(2);
    expect(surface.indices[2]).toBe(1);
    expect(surface.clampReasons).toContain("surface:degenerateCulled");
    expect(surface.clampReasons).toContain("surface:windingFlipped");
  });

  it("respects basis swaps when computing azimuth", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "surface-basis",
      basis: { swap: { x: "z", y: "y", z: "x" } },
      lodCoarse: {
        indexedGeometry: {
          positions: [
            0, 0, 1, // becomes +x after swap
            0, 0, -1,
            0, 1, 0,
          ],
          indices: [0, 1, 2],
        },
      },
    };
    const result = resolveHullSurfaceMesh(payload, { totalSectors: 8 });
    expect(result.surface).not.toBeNull();
    const surface = result.surface!;
    expect(surface.vertexAngles01[0]).toBeCloseTo(0, 5);
    expect(surface.vertexSectors[0]).toBe(0);
  });

  it("treats negative scale as a handedness flip and keeps normals/tangents aligned", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "surface-neg-scale",
      basis: { scale: [-2, 1, 1] },
      lodCoarse: {
        indexedGeometry: {
          positions: [
            0, 0, 0,
            2, 0, 0,
            0, 2, 0,
          ],
          indices: [0, 1, 2],
          normals: [
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
          ],
          tangents: [
            1, 0, 0, 1,
            1, 0, 0, 1,
            1, 0, 0, 1,
          ],
        },
      },
    };
    const result = resolveHullSurfaceMesh(payload, { totalSectors: 4 });
    expect(result.surface).not.toBeNull();
    const surface = result.surface!;
    expect(surface.basis.flip.x).toBe(true);
    expect(surface.handedness).toBe(-1);
    expect(Array.from(surface.indices.slice(0, 3))).toEqual([0, 2, 1]);
    expect(surface.normals).toBeTruthy();
    const triNorm = triangleNormal(surface.positions, surface.indices);
    const n0 = surface.normals!.slice(0, 3);
    const dot = triNorm[0] * n0[0] + triNorm[1] * n0[1] + triNorm[2] * n0[2];
    expect(dot).toBeGreaterThan(0.99);
    expect(surface.tangents).toBeTruthy();
    expect(surface.tangents?.[3]).toBeCloseTo(-1);
  });

  it("builds histograms for vertex/triangle sectors", () => {
    const payload: HullPreviewPayload = {
      version: "v1",
      meshHash: "surface-hist",
      lodCoarse: { indexedGeometry: centeredQuadGeometry() },
    };
    const result = buildHullSurfaceStrobe(payload, { surface: { totalSectors: 4 } });
    expect(result.surface).not.toBeNull();
    expect(result.histogram).not.toBeNull();
    const verts = Array.from(result.histogram?.vertices ?? []);
    const tris = Array.from(result.histogram?.triangles ?? []);
    const areas = Array.from(result.histogram?.triangleArea ?? []);
    const areas01 = Array.from(result.histogram?.triangleArea01 ?? []);
    expect(verts).toEqual([1, 1, 1, 1]);
    expect(tris).toEqual([1, 0, 0, 1]);
    expect(areas).toEqual([1, 0, 0, 1]);
    expect(areas01[0]).toBeCloseTo(0.5, 5);
    expect(areas01[3]).toBeCloseTo(0.5, 5);
  });
});
