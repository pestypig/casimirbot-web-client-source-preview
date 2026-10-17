import type { LatticeProfileTag } from "./lattice-frame";

export type LatticeProfilePerfBudget = {
  maxVoxels: number;
  maxBytes: number;
  maxSlicesPerTickVolume: number;
  maxSlicesPerTickSdf: number;
  rebuildMinMs: number;
};

export const LATTICE_PROFILE_PERF: Record<LatticeProfileTag, LatticeProfilePerfBudget> = Object.freeze({
  preview: {
    maxVoxels: 9_000_000,
    maxBytes: 48 * 1024 * 1024,
    maxSlicesPerTickVolume: 24,
    maxSlicesPerTickSdf: 96,
    rebuildMinMs: 420,
  },
  card: {
    maxVoxels: 14_000_000,
    maxBytes: 128 * 1024 * 1024,
    maxSlicesPerTickVolume: 96,
    maxSlicesPerTickSdf: 256,
    rebuildMinMs: 240,
  },
});

export type LatticeFormatShape = {
  packedRG: boolean;
  bytesPerComponent: number;
};

export const estimateLatticeUploadBytes = (
  dims: [number, number, number],
  format: LatticeFormatShape,
): number => {
  const voxels = Math.max(1, dims[0]) * Math.max(1, dims[1]) * Math.max(1, dims[2]);
  const channels = format.packedRG ? 2 : 1;
  const bytes = voxels * channels * Math.max(1, format.bytesPerComponent);
  return Math.max(bytes, 0);
};

export class LatticeRebuildWatchdog {
  private lastMs = 0;
  private blocked = 0;

  constructor(private readonly minIntervalMs: number) {}

  shouldThrottle(nowMs: number): { blocked: boolean; waitMs: number } {
    const delta = nowMs - this.lastMs;
    if (delta < this.minIntervalMs) {
      this.blocked += 1;
      return { blocked: true, waitMs: Math.max(0, this.minIntervalMs - delta) };
    }
    this.lastMs = nowMs;
    return { blocked: false, waitMs: 0 };
  }

  getBlockedCount() {
    return this.blocked;
  }
}
