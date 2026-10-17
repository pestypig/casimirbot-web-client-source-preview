import { describe, expect, it } from "vitest";
import { LATTICE_PROFILE_PERF, estimateLatticeUploadBytes, LatticeRebuildWatchdog } from "./lattice-perf";

describe("lattice perf budgets", () => {
  it("estimates upload bytes for packed and unpacked formats (table driven)", () => {
    const cases = [
      { dims: [10, 10, 10] as [number, number, number], packedRG: true, bytesPerComponent: 2, bytes: 10 * 10 * 10 * 2 * 2 },
      { dims: [8, 4, 2] as [number, number, number], packedRG: false, bytesPerComponent: 4, bytes: 8 * 4 * 2 * 4 },
      { dims: [1, 1, 1] as [number, number, number], packedRG: true, bytesPerComponent: 1, bytes: 2 },
      { dims: [0, -1, 2] as [number, number, number], packedRG: false, bytesPerComponent: 4, bytes: 1 * 1 * 2 * 4 },
    ];

    for (const c of cases) {
      const out = estimateLatticeUploadBytes(c.dims, {
        packedRG: c.packedRG,
        bytesPerComponent: c.bytesPerComponent,
      });
      expect(out).toBe(c.bytes);
    }
  });

  it("keeps voxel, byte, and slice rails table-driven per profile", () => {
    const cases = [
      { tag: "preview" as const, voxels: 9_000_000, bytes: 48 * 1024 * 1024, slicesVolume: 24, slicesSdf: 96, rebuildMs: 420 },
      { tag: "card" as const, voxels: 14_000_000, bytes: 128 * 1024 * 1024, slicesVolume: 96, slicesSdf: 256, rebuildMs: 240 },
    ];

    for (const c of cases) {
      const budget = LATTICE_PROFILE_PERF[c.tag];
      expect(budget.maxVoxels).toBe(c.voxels);
      expect(budget.maxBytes).toBe(c.bytes);
      expect(budget.maxSlicesPerTickVolume).toBe(c.slicesVolume);
      expect(budget.maxSlicesPerTickSdf).toBe(c.slicesSdf);
      expect(budget.rebuildMinMs).toBe(c.rebuildMs);
    }

    expect(LATTICE_PROFILE_PERF.card.maxBytes).toBeGreaterThan(LATTICE_PROFILE_PERF.preview.maxBytes);
    expect(LATTICE_PROFILE_PERF.card.maxSlicesPerTickVolume).toBeGreaterThan(LATTICE_PROFILE_PERF.preview.maxSlicesPerTickVolume);
  });

  it("exposes per-profile voxel/byte budgets", () => {
    expect(LATTICE_PROFILE_PERF.preview.maxVoxels).toBeGreaterThan(0);
    expect(LATTICE_PROFILE_PERF.preview.maxBytes).toBeGreaterThan(0);
    expect(LATTICE_PROFILE_PERF.card.maxBytes).toBeGreaterThan(LATTICE_PROFILE_PERF.preview.maxBytes);
  });
});

describe("LatticeRebuildWatchdog", () => {
  it("throttles rebuilds inside the guard window", () => {
    const watchdog = new LatticeRebuildWatchdog(200);
    const now = 1_000;
    const first = watchdog.shouldThrottle(now);
    const second = watchdog.shouldThrottle(now + 50);
    const third = watchdog.shouldThrottle(now + 220);

    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(true);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(third.blocked).toBe(false);
    expect(watchdog.getBlockedCount()).toBe(1);
  });

  it("reports remaining guard time when rebuilds arrive too quickly", () => {
    const watchdog = new LatticeRebuildWatchdog(250);
    const now = 500;
    watchdog.shouldThrottle(now);
    const blocked = watchdog.shouldThrottle(now + 120);

    expect(blocked.blocked).toBe(true);
    expect(blocked.waitMs).toBeGreaterThanOrEqual(130);
  });

  it("tracks per-profile rebuild guardrails (table driven)", () => {
    const now = 1_000;
    const cases = [
      { tag: "preview" as const, minMs: LATTICE_PROFILE_PERF.preview.rebuildMinMs },
      { tag: "card" as const, minMs: LATTICE_PROFILE_PERF.card.rebuildMinMs },
    ];

    for (const c of cases) {
      const watchdog = new LatticeRebuildWatchdog(c.minMs);
      const first = watchdog.shouldThrottle(now);
      const blocked = watchdog.shouldThrottle(now + c.minMs - 1);
      const allowed = watchdog.shouldThrottle(now + c.minMs + 5);

      expect(first.blocked).toBe(false);
      expect(blocked.blocked).toBe(true);
      expect(blocked.waitMs).toBeGreaterThan(0);
      expect(allowed.blocked).toBe(false);
      expect(watchdog.getBlockedCount()).toBe(1);
    }
  });
});
