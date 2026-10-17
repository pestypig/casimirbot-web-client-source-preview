import type { CardLatticeMetadata, LatticeAssetRef } from "@shared/schema";
import { sha256Hex } from "@/utils/sha";
import { encodeHullDistanceBandWeightsR8, type HullDistanceGrid } from "@/lib/lattice-sdf";
import type { HullSurfaceVoxelVolume } from "@/lib/lattice-surface";
import type { HullLatticeState } from "@/store/useHull3DSharedStore";

export type LatticeTextureAssetRef = LatticeAssetRef;

export type LatticeTextureExports = {
  meta: CardLatticeMetadata | null;
  assets: {
    volumeRG16F?: LatticeTextureAssetRef;
    sdfR8?: LatticeTextureAssetRef;
  } | null;
  blobs: Array<{ filename: string; blob: Blob }>;
};

const float32BitsToFloat16Bits = (bits: number) => {
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const frac = bits & 0x7fffff;

  if (exp === 0) {
    // Flush float32 subnormals to zero (sufficient for our fields)
    return sign;
  }
  if (exp === 0xff) {
    if (frac === 0) return sign | 0x7c00; // inf
    const payload = frac >>> 13;
    return sign | 0x7c00 | (payload ? payload : 1); // NaN (ensure mantissa != 0)
  }

  const halfExp = exp - 127 + 15;
  if (halfExp >= 0x1f) {
    return sign | 0x7c00; // overflow -> inf
  }
  if (halfExp <= 0) {
    if (halfExp < -10) return sign; // underflow -> 0
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

const toMat4 = (matrix: Float32Array | null | undefined): number[] | undefined => {
  if (!matrix || matrix.length < 16) return undefined;
  return Array.from(matrix.slice(0, 16));
};

export const extractCardLatticeMetadata = (
  lattice: HullLatticeState | null | undefined,
): CardLatticeMetadata | null => {
  if (!lattice) return null;
  const frame = lattice.frame;
  const volume = lattice.volume;
  const strobe = lattice.strobe;
  const sdf = lattice.sdf;

  const hasAny = Boolean(frame || volume || strobe || sdf);
  if (!hasAny) return null;

  const worldToLattice = frame ? toMat4(frame.worldToLattice) : undefined;
  const latticeToWorld = frame ? toMat4(frame.latticeToWorld) : undefined;
  const frameMeta =
    frame && worldToLattice
      ? {
          preset: frame.preset,
          profileTag: frame.profileTag,
          boundsProfile: frame.boundsProfile,
          dims: frame.dims,
          voxelSize_m: frame.voxelSize_m,
          latticeMin: frame.bounds.minLattice,
          latticeSize: frame.bounds.size,
          worldToLattice,
          latticeToWorld,
          clampReasons: frame.clampReasons.length ? frame.clampReasons : undefined,
        }
      : undefined;

  const driveLadder = volume?.metadata?.driveLadder;

  return {
    enabled: Boolean(volume),
    updatedAt: lattice.updatedAt,
    band_m: sdf?.band,
    frame: frameMeta,
    hashes: {
      strobe: strobe?.hash,
      weights: strobe?.weightHash,
      volume: volume?.hash,
      sdf: sdf?.key,
    },
    driveLadder: driveLadder
      ? {
          scalars: driveLadder.scalars ?? null,
          signature: driveLadder.signature,
          hash: driveLadder.hash,
        }
      : undefined,
    stats: volume
      ? {
          coverage: volume.stats.coverage,
          maxGate: volume.stats.maxGate,
          maxDfdr: volume.stats.maxDfdr,
          maxDrive: volume.stats.maxDrive,
        }
      : undefined,
  };
};

const packVolumeRG16F = (volume: HullSurfaceVoxelVolume): Uint16Array => {
  const totalVoxels = Math.max(0, volume.dims[0] * volume.dims[1] * volume.dims[2]);
  const len = Math.min(totalVoxels, volume.drive3D.length, volume.gate3D.length);
  const out = new Uint16Array(Math.max(1, len * 2));

  const driveBits = new Uint32Array(volume.drive3D.buffer, volume.drive3D.byteOffset, len);
  const gateBits = new Uint32Array(volume.gate3D.buffer, volume.gate3D.byteOffset, len);
  for (let i = 0, j = 0; i < len; i += 1) {
    out[j++] = float32BitsToFloat16Bits(driveBits[i] ?? 0);
    out[j++] = float32BitsToFloat16Bits(gateBits[i] ?? 0);
  }
  return out;
};

const volumeIdFromHash = (hash: string | null | undefined): string => {
  if (!hash) return "unknown";
  const prefix = hash.split("|")[0] ?? hash;
  const cleaned = prefix.replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || "unknown";
};

async function assetRefForBytes(filename: string, bytes: Uint8Array, encoding: LatticeTextureAssetRef["encoding"]) {
  const sha256 = await sha256Hex(bytes);
  return {
    ref: {
      filename,
      byteLength: bytes.byteLength,
      sha256,
      encoding,
    } satisfies LatticeTextureAssetRef,
    sha256,
  };
}

export async function buildLatticeTextureExports(params: {
  fileStem: string;
  lattice: HullLatticeState | null | undefined;
}): Promise<LatticeTextureExports | null> {
  const meta = extractCardLatticeMetadata(params.lattice);
  if (!meta) return null;

  const blobs: Array<{ filename: string; blob: Blob }> = [];
  const assets: NonNullable<LatticeTextureExports["assets"]> = {};

  const lattice = params.lattice;
  const volume = lattice?.volume;
  if (volume) {
    const volumeId = volumeIdFromHash(volume.hash);
    const filename = `${params.fileStem}.lattice-volume-${volumeId}.rg16f.bin`;
    const packed = packVolumeRG16F(volume);
    const bytes = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
    const { ref } = await assetRefForBytes(filename, bytes, "rg16f-le");
    blobs.push({ filename, blob: new Blob([bytes], { type: "application/octet-stream" }) });
    assets.volumeRG16F = ref;
  }

  const sdf = lattice?.sdf;
  if (sdf) {
    const filename = await buildSdfFilename({ fileStem: params.fileStem, grid: sdf });
    const weights = encodeHullDistanceBandWeightsR8(sdf);
    const { ref } = await assetRefForBytes(filename, weights, "r8");
    blobs.push({ filename, blob: new Blob([weights], { type: "application/octet-stream" }) });
    assets.sdfR8 = ref;
  }

  return {
    meta,
    assets: Object.keys(assets).length ? assets : null,
    blobs,
  };
}

async function buildSdfFilename(params: { fileStem: string; grid: HullDistanceGrid }): Promise<string> {
  const digest = await sha256Hex(params.grid.key);
  const id = digest.slice(0, 16);
  return `${params.fileStem}.lattice-sdf-${id}.r8.bin`;
}
