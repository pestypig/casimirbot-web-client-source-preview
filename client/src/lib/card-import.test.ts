import { describe, expect, it } from "vitest";
import { rehydrateCardSidecar } from "./card-import";
import type { CardExportSidecar } from "./card-export-sidecar";
import { sha256Hex } from "@/utils/sha";

const float32BitsToFloat16Bits = (bits: number) => {
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const frac = bits & 0x7fffff;
  if (exp === 0) return sign;
  if (exp === 0xff) {
    if (frac === 0) return sign | 0x7c00;
    const payload = frac >>> 13;
    return sign | 0x7c00 | (payload ? payload : 1);
  }
  const halfExp = exp - 127 + 15;
  if (halfExp >= 0x1f) return sign | 0x7c00;
  if (halfExp <= 0) {
    if (halfExp < -10) return sign;
    const mantissa = frac | 0x800000;
    const shift = 1 - halfExp;
    let halfFrac = mantissa >>> (shift + 13);
    const roundBit = (mantissa >>> (shift + 12)) & 1;
    const restMask = (1 << (shift + 12)) - 1;
    const rest = mantissa & restMask;
    if (roundBit && (rest || (halfFrac & 1))) halfFrac++;
    return sign | (halfFrac & 0x3ff);
  }
  let halfFrac = frac >>> 13;
  const roundBit = (frac >>> 12) & 1;
  const rest = frac & 0xfff;
  if (roundBit && (rest || (halfFrac & 1))) halfFrac++;
  let halfExpBits = halfExp << 10;
  if (halfFrac === 0x400) {
    halfFrac = 0;
    halfExpBits += 1 << 10;
    if (halfExpBits >= 0x7c00) return sign | 0x7c00;
  }
  return sign | halfExpBits | (halfFrac & 0x3ff);
};

const toHalf = (value: number) => {
  const view = new Uint32Array(new Float32Array([value]).buffer);
  return float32BitsToFloat16Bits(view[0] ?? 0);
};

const identityMat4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

async function buildSidecarFixture() {
  const dims: [number, number, number] = [2, 2, 1];
  const total = dims[0] * dims[1] * dims[2];
  const drive = new Float32Array([0.25, 0.5, -0.75, 1.0]);
  const gate = new Float32Array([0.5, 0.25, 0, 1.0]);
  const packed = new Uint16Array(total * 2);
  for (let i = 0, j = 0; i < total; i++, j += 2) {
    packed[j] = toHalf(drive[i]);
    packed[j + 1] = toHalf(gate[i]);
  }
  const volumeBytes = new Uint8Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const volumeSha = await sha256Hex(volumeBytes);

  const sdfWeights = new Uint8Array(total);
  sdfWeights.fill(255);
  const sdfSha = await sha256Hex(sdfWeights);

  const sidecar: CardExportSidecar = {
    capturedAt: "2024-01-01T00:00:00.000Z",
    canvas: { width: 1, height: 1, devicePixelRatio: 1 },
    overlayEnabled: false,
    pipeline: null,
    hull: null,
    overlayFrame: null,
    geometryUpdatePayload: { warpGeometryKind: "sdf" },
    mesh: { meshHash: "mesh-hash", geometrySource: "preview" } as any,
    lattice: {
      meta: {
        enabled: true,
        updatedAt: 1,
        band_m: 0.2,
        frame: {
          preset: "medium",
          profileTag: "preview",
          boundsProfile: "tight",
          dims,
          voxelSize_m: 0.1,
          latticeMin: [-0.1, -0.1, -0.05],
          latticeSize: [0.2, 0.2, 0.1],
          worldToLattice: identityMat4(),
          latticeToWorld: identityMat4(),
          clampReasons: [],
        },
        hashes: {
          volume: "vol-hash",
          sdf: "sdf-hash",
        },
        driveLadder: {
          scalars: { R: 1, sigma: 1, beta: 1, gate: 1, ampChain: 1 },
          signature: "ladder",
          hash: "ladder-hash",
        },
        stats: { coverage: 1, maxGate: 1, maxDfdr: 1, maxDrive: 1 },
      },
      assets: {
        volumeRG16F: {
          filename: "test.volume.rg16f.bin",
          byteLength: volumeBytes.byteLength,
          sha256: volumeSha,
          encoding: "rg16f-le",
        },
        sdfR8: {
          filename: "test.sdf.r8.bin",
          byteLength: sdfWeights.byteLength,
          sha256: sdfSha,
          encoding: "r8",
        },
      },
    },
    renderedPath: {
      warpGeometryKind: "sdf",
      warpGeometryAssetId: "asset-1",
      meshHash: "mesh-hash",
      latticeHashes: { volume: "vol-hash", sdf: "sdf-hash" },
      latticeEnabled: true,
      geometrySource: "preview",
    },
    replayPayload: {
      pipelineUpdate: { warpGeometryKind: "sdf" },
      viewer: {},
      signatures: { meshHash: "mesh-hash" },
      cardRecipe: null,
    },
    cardRecipe: null,
    cardProfile: null,
  };

  return { sidecar, volumeBytes, sdfWeights, drive, gate };
}

describe("card sidecar rehydrate", () => {
  it("reattaches lattice blobs and marks geometry as sdf when assets match", async () => {
    const { sidecar, volumeBytes, sdfWeights, drive, gate } = await buildSidecarFixture();
    const result = await rehydrateCardSidecar({
      sidecar,
      files: [
        { name: "test.volume.rg16f.bin", data: volumeBytes.buffer },
        { name: "test.sdf.r8.bin", data: sdfWeights.buffer },
      ],
    });

    expect(result.geometryKind).toBe("sdf");
    expect(result.lattice?.volume?.dims).toEqual([2, 2, 1]);
    expect(Array.from(result.lattice?.volume?.drive3D ?? [])).toEqual(Array.from(drive));
    expect(Array.from(result.lattice?.volume?.gate3D ?? [])).toEqual(Array.from(gate));
    expect(result.lattice?.missingAssets).toEqual([]);
    expect(result.lattice?.hashMismatches).toEqual([]);
  });

  it("falls back to ellipsoid when lattice assets are missing", async () => {
    const { sidecar, volumeBytes } = await buildSidecarFixture();
    const result = await rehydrateCardSidecar({
      sidecar,
      files: [{ name: "wrong.bin", data: volumeBytes.buffer }],
    });

    expect(result.geometryKind).toBe("ellipsoid");
    expect(result.lattice?.missingAssets).toContain("test.sdf.r8.bin");
    expect(result.lattice?.assetsUsed).toContain("test.volume.rg16f.bin");
  });

  it("rehydrates lattice metadata and blobs from replay payload lattice when top-level lattice is absent", async () => {
    const { sidecar, volumeBytes, sdfWeights } = await buildSidecarFixture();
    const replayOnlySidecar: CardExportSidecar = {
      ...sidecar,
      lattice: undefined,
      replayPayload: sidecar.replayPayload
        ? {
            ...sidecar.replayPayload,
            lattice: sidecar.lattice,
          }
        : null,
    };

    const result = await rehydrateCardSidecar({
      sidecar: replayOnlySidecar,
      files: [
        { name: "test.volume.rg16f.bin", data: volumeBytes.buffer },
        { name: "test.sdf.r8.bin", data: sdfWeights.buffer },
      ],
    });

    expect(result.previewLattice?.hashes?.volume).toBe("vol-hash");
    expect(result.lattice?.volume?.hash).toBe("vol-hash");
    expect((result.pipelineUpdate as any).previewLattice?.hashes?.volume).toBe("vol-hash");
    expect(result.geometryKind).toBe("sdf");
  });
});
