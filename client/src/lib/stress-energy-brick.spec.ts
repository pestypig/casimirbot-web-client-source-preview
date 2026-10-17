import { describe, expect, it } from "vitest";
import {
  buildObserverDirectionField,
  buildObserverFrameField,
  type ObserverConditionKey,
  type ObserverFrameKey,
  type StressEnergyBrickDecoded,
} from "@/lib/stress-energy-brick";

const createBrick = (args: {
  t00: number[];
  sx?: number[];
  sy?: number[];
  sz?: number[];
  pressureFactor?: number;
  rapidityCapBeta?: number;
  typeITolerance?: number;
  decWorstCaseDirection?: [number, number, number];
}): StressEnergyBrickDecoded => {
  const total = args.t00.length;
  const zeros = Array.from({ length: total }, () => 0);
  const sx = args.sx ?? zeros;
  const sy = args.sy ?? zeros;
  const sz = args.sz ?? zeros;
  const fill = (data: number[]) => ({ data: Float32Array.from(data), min: 0, max: 0 });

  return {
    dims: [total, 1, 1],
    t00: fill(args.t00),
    flux: {
      Sx: fill(sx),
      Sy: fill(sy),
      Sz: fill(sz),
      divS: fill(zeros),
    },
    stats: {
      totalEnergy_J: 0,
      avgT00: 0,
      avgFluxMagnitude: 0,
      netFlux: [0, 0, 0],
      divMin: 0,
      divMax: 0,
      dutyFR: 0,
      strobePhase: 0,
      observerRobust: {
        pressureModel: "isotropic_pressure",
        pressureFactor: args.pressureFactor ?? 0,
        rapidityCap: 1,
        rapidityCapBeta: args.rapidityCapBeta ?? 0.5,
        typeI: {
          count: total,
          fraction: 1,
          tolerance: args.typeITolerance ?? 1e-9,
        },
        nec: {
          eulerianMin: 0,
          eulerianMean: 0,
          robustMin: 0,
          robustMean: 0,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: 0,
          severityGainMean: 0,
          maxRobustMinusEulerian: 0,
          worstCase: { index: -1, value: 0, direction: [1, 0, 0], rapidity: null, source: "algebraic_type_i" },
        },
        wec: {
          eulerianMin: 0,
          eulerianMean: 0,
          robustMin: 0,
          robustMean: 0,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: 0,
          severityGainMean: 0,
          maxRobustMinusEulerian: 0,
          worstCase: { index: -1, value: 0, direction: [1, 0, 0], rapidity: null, source: "algebraic_type_i" },
        },
        sec: {
          eulerianMin: 0,
          eulerianMean: 0,
          robustMin: 0,
          robustMean: 0,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: 0,
          severityGainMean: 0,
          maxRobustMinusEulerian: 0,
          worstCase: { index: -1, value: 0, direction: [1, 0, 0], rapidity: null, source: "algebraic_type_i" },
        },
        dec: {
          eulerianMin: 0,
          eulerianMean: 0,
          robustMin: 0,
          robustMean: 0,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: 0,
          severityGainMean: 0,
          maxRobustMinusEulerian: 0,
          worstCase: { index: -1, value: 0, direction: args.decWorstCaseDirection ?? [1, 0, 0], rapidity: null, source: "algebraic_type_i" },
        },
        consistency: {
          robustNotGreaterThanEulerian: true,
          maxRobustMinusEulerian: 0,
        },
      },
    },
  };
};

const build = (brick: StressEnergyBrickDecoded, condition: ObserverConditionKey, frame: ObserverFrameKey) => {
  const field = buildObserverFrameField(brick, { condition, frame });
  expect(field).not.toBeNull();
  return field!;
};

describe("buildObserverFrameField", () => {
  it("emits a binary mask for Missed", () => {
    const brick = createBrick({
      t00: [1, 1],
      sx: [0, 1],
      pressureFactor: 0,
    });

    const missed = build(brick, "nec", "Missed");
    expect(Array.from(missed.data)).toEqual([0, 1]);
    expect(missed.min).toBe(0);
    expect(missed.max).toBe(1);
  });

  it("keeps Delta non-positive for representative robust-minimum case", () => {
    const brick = createBrick({
      t00: [1, 1, 1],
      sx: [0, 0.25, 0.5],
      pressureFactor: 0,
    });

    const delta = build(brick, "nec", "Delta");
    for (const value of delta.data) {
      expect(value).toBeLessThanOrEqual(1e-6);
    }
  });

  it("coerces non-finite observer-frame values to 0", () => {
    const brick = createBrick({
      t00: [Number.NaN, Number.POSITIVE_INFINITY],
      sx: [Number.NaN, Number.POSITIVE_INFINITY],
      pressureFactor: Number.POSITIVE_INFINITY,
      rapidityCapBeta: Number.NaN,
    });

    const eulerian = build(brick, "nec", "Eulerian");
    const robust = build(brick, "nec", "Robust");
    const delta = build(brick, "nec", "Delta");

    for (const field of [eulerian, robust, delta]) {
      expect(Array.from(field.data)).toEqual([0, 0]);
      expect(Number.isFinite(field.min)).toBe(true);
      expect(Number.isFinite(field.max)).toBe(true);
    }
  });
});

describe("buildObserverDirectionField", () => {
  it("returns finite normalized vectors (or zero vectors)", () => {
    const brick = createBrick({
      t00: [1, 1, 1],
      sx: [1, 0, -1],
      sy: [0, 0, 0],
      sz: [0, 0, 1],
      pressureFactor: 0,
    });
    const field = buildObserverDirectionField(brick, "nec");
    expect(field).not.toBeNull();
    const out = field!;
    for (let i = 0; i < out.totalCount; i += 1) {
      const b = i * 3;
      const x = out.directions[b];
      const y = out.directions[b + 1];
      const z = out.directions[b + 2];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
      const n = Math.hypot(x, y, z);
      expect(n === 0 || Math.abs(n - 1) < 1e-5).toBe(true);
    }
    expect(Number.isFinite(out.minMagnitude)).toBe(true);
    expect(Number.isFinite(out.maxMagnitude)).toBe(true);
  });

  it("uses stable fallback for near-zero flux", () => {
    const brick = createBrick({
      t00: [1],
      sx: [0],
      sy: [0],
      sz: [0],
      pressureFactor: 0,
    });
    const field = buildObserverDirectionField(brick, "wec", { maskMode: "all" });
    expect(field).not.toBeNull();
    expect(field!.directions[0]).toBeCloseTo(-1, 6);
    expect(Math.abs(field!.directions[1])).toBeLessThan(1e-9);
    expect(Math.abs(field!.directions[2])).toBeLessThan(1e-9);
    expect(field!.mask?.[0]).toBe(1);
  });

  it("coerces non-finite inputs to safe finite vectors", () => {
    const brick = createBrick({
      t00: [Number.NaN, Number.POSITIVE_INFINITY],
      sx: [Number.NaN, Number.POSITIVE_INFINITY],
      sy: [Number.NaN, Number.NEGATIVE_INFINITY],
      sz: [Number.NaN, Number.NaN],
      pressureFactor: Number.POSITIVE_INFINITY,
      rapidityCapBeta: Number.NaN,
    });
    const field = buildObserverDirectionField(brick, "sec", { maskMode: "all" });
    expect(field).not.toBeNull();
    for (const value of field!.directions) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (const value of field!.magnitude ?? []) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("condition selection changes direction output for DEC search-direction fallback", () => {
    const brick = createBrick({
      t00: [0],
      sx: [1],
      sy: [0],
      sz: [0],
      pressureFactor: 0,
      typeITolerance: 1e-12,
      decWorstCaseDirection: [0, 1, 0],
    });
    const nec = buildObserverDirectionField(brick, "nec", { maskMode: "all" });
    const dec = buildObserverDirectionField(brick, "dec", { maskMode: "all", decDirectionMode: "global" });
    expect(nec).not.toBeNull();
    expect(dec).not.toBeNull();
    expect(nec!.directions[0]).toBeCloseTo(-1, 6);
    expect(Math.abs(nec!.directions[1])).toBeLessThan(1e-9);
    expect(dec!.directions[1]).toBeCloseTo(1, 6);
  });

  it("DEC local mode varies direction per voxel for varying flux", () => {
    const brick = createBrick({
      t00: [0, 0],
      sx: [1, 0],
      sy: [0, 1],
      sz: [0, 0],
      pressureFactor: 0,
      typeITolerance: 0,
      decWorstCaseDirection: [1, 0, 0],
    });
    const field = buildObserverDirectionField(brick, "dec", { decDirectionMode: "local", maskMode: "all" });
    expect(field).not.toBeNull();
    const out = field!;
    expect(out.mask?.[0]).toBe(1);
    expect(out.mask?.[1]).toBe(1);
    expect(Math.abs(out.directions[0])).toBeGreaterThan(0.9);
    expect(Math.abs(out.directions[4])).toBeGreaterThan(0.9);
    expect(Math.abs(out.directions[0] - out.directions[3]) + Math.abs(out.directions[1] - out.directions[4])).toBeGreaterThan(0.5);
  });

  it("DEC global mode uses one provided global direction", () => {
    const brick = createBrick({
      t00: [0, 0],
      sx: [1, 0],
      sy: [0, 1],
      sz: [0, 0],
      pressureFactor: 0,
      typeITolerance: 0,
      decWorstCaseDirection: [0, 1, 0],
    });
    const field = buildObserverDirectionField(brick, "dec", { decDirectionMode: "global", maskMode: "all" });
    expect(field).not.toBeNull();
    const out = field!;
    expect(out.mask?.[0]).toBe(1);
    expect(out.mask?.[1]).toBe(1);
    expect(Math.abs(out.directions[1])).toBeCloseTo(1, 6);
    expect(Math.abs(out.directions[4])).toBeCloseTo(1, 6);
  });

  it("maskMode violating filters by robust < 0", () => {
    const brick = createBrick({
      t00: [1, 1],
      sx: [0, 1.1],
      sy: [0, 0],
      sz: [0, 0],
      pressureFactor: 0,
    });
    const field = buildObserverDirectionField(brick, "nec", { maskMode: "violating", decDirectionMode: "local" });
    expect(field).not.toBeNull();
    expect(Array.from(field!.mask ?? [])).toEqual([0, 1]);
  });

  it("maskMode missed filters by robust < 0 && eulerian >= 0", () => {
    const brick = createBrick({
      t00: [0.25, 1],
      sx: [0.5, 1],
      sy: [0, 0],
      sz: [0, 0],
      pressureFactor: 0,
    });
    const field = buildObserverDirectionField(brick, "nec", { maskMode: "missed", decDirectionMode: "local" });
    expect(field).not.toBeNull();
    expect(Array.from(field!.mask ?? [])).toEqual([1, 0]);
  });

  it("keeps finite outputs for directions mask and magnitude", () => {
    const brick = createBrick({
      t00: [Number.NaN, Number.POSITIVE_INFINITY, 0],
      sx: [Number.NaN, Number.POSITIVE_INFINITY, -1],
      sy: [Number.NaN, Number.NEGATIVE_INFINITY, 0],
      sz: [Number.NaN, Number.NaN, 1],
      pressureFactor: Number.POSITIVE_INFINITY,
      rapidityCapBeta: Number.NaN,
      typeITolerance: Number.NaN,
    });
    const field = buildObserverDirectionField(brick, "dec", {
      decDirectionMode: "local",
      maskMode: "all",
      minMagnitude: 0,
    });
    expect(field).not.toBeNull();
    for (const value of field!.directions) expect(Number.isFinite(value)).toBe(true);
    for (const value of field!.mask ?? []) expect(Number.isFinite(value)).toBe(true);
    for (const value of field!.magnitude ?? []) expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(field!.minMagnitude)).toBe(true);
    expect(Number.isFinite(field!.maxMagnitude)).toBe(true);
  });
});
