import { describe, expect, it } from "vitest";

import {
  resolvePipelineBubbleRadiusM,
  resolvePipelineHullGeometryM,
  resolvePipelineHullReferenceRadiusM,
  resolvePipelineTauLcMs,
} from "./pipeline-geometry";

describe("pipeline geometry helpers", () => {
  it("prefers explicit hull geometry over bubble fallbacks", () => {
    const state = {
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      R: 2,
    } as const;

    expect(resolvePipelineHullGeometryM(state)).toEqual({
      Lx_m: 1007,
      Ly_m: 264,
      Lz_m: 173,
    });
    expect(resolvePipelineHullReferenceRadiusM(state)).toBe(503.5);
  });

  it("prefers explicit bubble radius over top-level radius mirrors", () => {
    const state = {
      bubble: { R: 280 },
      R: 2,
    } as const;

    expect(resolvePipelineBubbleRadiusM(state)).toBe(280);
  });

  it("derives tauLC from longest hull axis before bubble fallbacks", () => {
    const state = {
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      R: 2,
    } as const;

    expect(resolvePipelineTauLcMs(state)).toBeCloseTo(0.003358990438645391, 12);
  });

  it("falls back to bubble diameter when only bubble geometry is available", () => {
    const state = {
      bubble: { R: 12 },
    } as const;

    expect(resolvePipelineTauLcMs(state)).toBeCloseTo(0.000080055384213341, 11);
  });
});
