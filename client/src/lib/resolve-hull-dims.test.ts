import { describe, expect, it } from "vitest";
import { HULL_BASIS_IDENTITY, applyHullBasisToDims } from "@shared/hull-basis";
import type { BasisTransform } from "@shared/schema";
import { resolveHullDimsEffective } from "./resolve-hull-dims";

describe("hull basis bounds alignment", () => {
  it("applies swap/flip/scale to dims so bounds stay aligned", () => {
    const dims = { Lx_m: 2, Ly_m: 4, Lz_m: 6 };
    const basis: BasisTransform = {
      swap: { x: "z", y: "x", z: "y" },
      flip: { y: true },
      scale: [2, 0.5, 1.5],
    };
    const aligned = applyHullBasisToDims(dims, basis);
    expect(aligned.Lx_m).toBeCloseTo(12); // z -> x scaled by 2
    expect(aligned.Ly_m).toBeCloseTo(1);  // x -> y scaled by 0.5
    expect(aligned.Lz_m).toBeCloseTo(6);  // y -> z scaled by 1.5
  });
});

describe("resolveHullDimsEffective", () => {
  it("prefers unclamped preview target dims without reapplying basis", () => {
    const previewPayload = {
      version: "v1",
      targetDims: { Lx_m: 8, Ly_m: 2, Lz_m: 4 },
      basis: { swap: { x: "z", y: "x", z: "y" }, scale: [1.5, 1, 0.5] },
      updatedAt: 10,
    } as any;
    const pipelineSnapshot = { hull: { Lx_m: 30, Ly_m: 20, Lz_m: 10 } } as any;
    const result = resolveHullDimsEffective({
      previewPayload,
      pipelineSnapshot,
      nowMs: 20,
    });
    expect(result?.source).toBe("preview");
    expect(result?.Lx_m).toBeCloseTo(8);
    expect(result?.Ly_m).toBeCloseTo(2);
    expect(result?.Lz_m).toBeCloseTo(4);
    expect(result?.basis.swap.x).toBe("z");
  });

  it("applies basis to measured dims when target dims are missing", () => {
    const previewPayload = {
      version: "v1",
      hullMetrics: { dims_m: { Lx_m: 8, Ly_m: 2, Lz_m: 4 } },
      basis: { swap: { x: "z", y: "x", z: "y" }, scale: [1.5, 1, 0.5] },
      updatedAt: 10,
    } as any;
    const result = resolveHullDimsEffective({
      previewPayload,
      pipelineSnapshot: { hull: { Lx_m: 30, Ly_m: 20, Lz_m: 10 } } as any,
      nowMs: 20,
    });
    expect(result?.source).toBe("preview");
    expect(result?.Lx_m).toBeCloseTo(6);
    expect(result?.Ly_m).toBeCloseTo(8);
    expect(result?.Lz_m).toBeCloseTo(1);
  });

  it("falls back to pipeline when preview is clamped or stale", () => {
    const pipelineHull = { Lx_m: 9, Ly_m: 7, Lz_m: 5 };
    const clamped = resolveHullDimsEffective({
      previewPayload: {
        version: "v1",
        targetDims: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
        clampReasons: ["over-limit"],
        updatedAt: Date.now(),
      } as any,
      pipelineSnapshot: { hull: pipelineHull } as any,
    });
    expect(clamped?.source).toBe("pipeline");
    expect(clamped?.Lx_m).toBeCloseTo(pipelineHull.Lx_m);

    const stale = resolveHullDimsEffective({
      previewPayload: {
        version: "v1",
        targetDims: { Lx_m: 2, Ly_m: 2, Lz_m: 2 },
        updatedAt: 0,
      } as any,
      pipelineSnapshot: { hull: pipelineHull } as any,
      staleAfterMs: 1,
      nowMs: 10,
    });
    expect(stale?.source).toBe("pipeline");
  });

  it("uses pipeline dims when preview is absent so ellipsoid fallback stays aligned", () => {
    const pipelineHull = { Lx_m: 12, Ly_m: 4, Lz_m: 6 };
    const result = resolveHullDimsEffective({
      previewPayload: null,
      pipelineSnapshot: { hull: pipelineHull } as any,
      nowMs: 42,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("pipeline");
    expect(result?.basis).toEqual(HULL_BASIS_IDENTITY);
    expect(result?.Lx_m).toBeCloseTo(pipelineHull.Lx_m);
    expect(result?.Ly_m).toBeCloseTo(pipelineHull.Ly_m);
    expect(result?.Lz_m).toBeCloseTo(pipelineHull.Lz_m);
  });

  it("falls back to explicit authority dims when preview and pipeline dims are absent", () => {
    const result = resolveHullDimsEffective({
      previewPayload: null,
      pipelineSnapshot: null,
      authorityFallbackDims: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      nowMs: 42,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("authority");
    expect(result?.basis).toEqual(HULL_BASIS_IDENTITY);
    expect(result?.Lx_m).toBeCloseTo(1007);
    expect(result?.Ly_m).toBeCloseTo(264);
    expect(result?.Lz_m).toBeCloseTo(173);
  });
});
