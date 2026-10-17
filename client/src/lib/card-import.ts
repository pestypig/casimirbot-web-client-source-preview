import type { CardLatticeMetadata, CardMeshMetadata, CardRecipeSignatures, WarpGeometryKind } from "@shared/schema";
import type { CardExportSidecar } from "./card-export-sidecar";
import type { HullDistanceGrid } from "./lattice-sdf";
import type { HullSurfaceVoxelVolume } from "./lattice-surface";
import { sha256Hex } from "@/utils/sha";

type SidecarFileInput = { name: string; data: ArrayBuffer } | (Blob & { name?: string });

type ResolvedFile = {
  name: string;
  buffer: ArrayBuffer;
  sha256: string;
};

export type RehydratedLattice = {
  meta: CardLatticeMetadata;
  volume?: HullSurfaceVoxelVolume | null;
  sdf?: HullDistanceGrid | null;
  assetsUsed: string[];
  missingAssets: string[];
  hashMismatches: string[];
};

export type RehydrateResult = {
  sidecar: CardExportSidecar;
  previewMesh: CardMeshMetadata | null;
  previewLattice: CardLatticeMetadata | null;
  geometryKind: WarpGeometryKind | undefined;
  pipelineUpdate: Record<string, unknown>;
  signatures: CardRecipeSignatures | null;
  lattice?: RehydratedLattice | null;
};

const halfFloatToFloat = (() => {
  const buffer = new ArrayBuffer(4);
  const intView = new Uint32Array(buffer);
  const floatView = new Float32Array(buffer);
  return (half: number) => {
    const s = (half & 0x8000) << 16;
    const e = (half & 0x7c00) >> 10;
    const f = half & 0x03ff;
    if (e === 0) {
      intView[0] = s | (f << 13);
      return floatView[0];
    }
    if (e === 0x1f) {
      intView[0] = s | 0x7f800000 | (f << 13);
      return floatView[0];
    }
    intView[0] = s | ((e + 112) << 23) | (f << 13);
    return floatView[0];
  };
})();

async function normalizeFiles(files?: SidecarFileInput[] | null): Promise<ResolvedFile[]> {
  if (!files || !files.length) return [];
  const normalized: ResolvedFile[] = [];
  for (const entry of files) {
    const name = (entry as any).name || "unnamed";
    const buffer =
      "data" in (entry as any) && (entry as any).data instanceof ArrayBuffer
        ? ((entry as any).data as ArrayBuffer)
        : typeof (entry as Blob).arrayBuffer === "function"
          ? await (entry as Blob).arrayBuffer()
          : null;
    if (!buffer) continue;
    normalized.push({
      name,
      buffer,
      sha256: await sha256Hex(buffer),
    });
  }
  return normalized;
}

function decodeLatticeVolume(meta: CardLatticeMetadata, bytes: ArrayBuffer): HullSurfaceVoxelVolume | null {
  const frame = meta.frame;
  const dims = frame?.dims;
  if (!frame || !dims) return null;
  const total = Math.max(1, dims[0] * dims[1] * dims[2]);
  const required = total * 2;
  const data = new Uint16Array(bytes);
  if (data.length < required) return null;

  const drive3D = new Float32Array(total);
  const gate3D = new Float32Array(total);
  const dfdr3D = new Float32Array(total);
  const weightAccum = new Float32Array(total);
  let maxGate = 0;
  let maxDrive = 0;
  let maxDfdr = 0;
  let voxelsTouched = 0;

  for (let i = 0, j = 0; i < total; i += 1, j += 2) {
    const drive = halfFloatToFloat(data[j] ?? 0);
    const gate = halfFloatToFloat(data[j + 1] ?? 0);
    drive3D[i] = drive;
    gate3D[i] = gate;
    if (gate !== 0) voxelsTouched += 1;
    maxGate = Math.max(maxGate, Math.abs(gate));
    maxDrive = Math.max(maxDrive, Math.abs(drive));
    weightAccum[i] = gate !== 0 ? 1 : 0;
    dfdr3D[i] = gate !== 0 ? drive / gate : drive;
    maxDfdr = Math.max(maxDfdr, Math.abs(dfdr3D[i]));
  }

  return {
    hash: meta.hashes?.volume ?? "volume:rehydrated",
    cacheHit: true,
    dims,
    voxelSize: frame.voxelSize_m,
    bounds: frame.latticeSize,
    metadata: {
      driveLadder: {
        scalars: meta.driveLadder?.scalars ?? null,
        gateScale: 1,
        driveScale: 1,
        dfdrSignature: meta.driveLadder?.signature ?? "dfdr:unknown",
        signature: meta.driveLadder?.signature ?? "driveLadder:rehydrated",
        hash: meta.driveLadder?.hash ?? "driveLadder:rehydrated",
      },
    },
    gate3D,
    dfdr3D,
    drive3D,
    weightAccum,
    clampReasons: frame.clampReasons ?? [],
    stats: {
      samples: total,
      voxelsTouched,
      coverage: total > 0 ? voxelsTouched / total : 0,
      maxGate,
      maxDfdr,
      maxDrive,
      budgetHit: false,
    },
  };
}

function decodeLatticeSdf(meta: CardLatticeMetadata, bytes: ArrayBuffer, meshHash?: string | null): HullDistanceGrid | null {
  const frame = meta.frame;
  const dims = frame?.dims;
  if (!frame || !dims) return null;
  const total = Math.max(1, dims[0] * dims[1] * dims[2]);
  const weights = new Uint8Array(bytes);
  if (weights.length < total) return null;

  const band = meta.band_m ?? frame.voxelSize_m ?? 1;
  const indices: number[] = [];
  const distances: number[] = [];
  let maxAbsDistance = 0;
  for (let i = 0; i < total; i++) {
    const w = weights[i] ?? 0;
    if (w === 0) continue;
    const weight01 = Math.max(0, Math.min(1, w / 255));
    const dist = (1 - weight01) * band;
    indices.push(i);
    distances.push(dist);
    if (Math.abs(dist) > maxAbsDistance) maxAbsDistance = Math.abs(dist);
  }

  const halfSize: [number, number, number] = [
    Math.abs(frame.latticeSize[0] ?? 0) / 2,
    Math.abs(frame.latticeSize[1] ?? 0) / 2,
    Math.abs(frame.latticeSize[2] ?? 0) / 2,
  ];

  return {
    key: meta.hashes?.sdf ?? "sdf:rehydrated",
    meshHash: meshHash ?? undefined,
    basisSignature: meta.frame?.boundsProfile,
    dims,
    bounds: halfSize,
    voxelSize: frame.voxelSize_m,
    band,
    format: "float",
    indices: new Uint32Array(indices),
    distances: new Float32Array(distances),
    cacheHit: true,
    clampReasons: frame.clampReasons ?? [],
    stats: {
      sampleCount: total,
      voxelsTouched: indices.length,
      voxelCoverage: total > 0 ? indices.length / total : 0,
      trianglesTouched: 0,
      triangleCoverage: 0,
      maxAbsDistance,
      maxQuantizationError: 0.5 * Math.sqrt(3) * frame.voxelSize_m,
    },
  };
}

function pickMesh(sidecar: CardExportSidecar): CardMeshMetadata | null {
  return sidecar.mesh ?? sidecar.replayPayload?.cardRecipe?.mesh ?? sidecar.cardRecipe?.mesh ?? null;
}

function pickLatticeMeta(sidecar: CardExportSidecar): CardLatticeMetadata | null {
  return (
    sidecar.lattice?.meta ??
    sidecar.replayPayload?.lattice?.meta ??
    sidecar.replayPayload?.cardRecipe?.lattice ??
    sidecar.cardRecipe?.lattice ??
    null
  );
}

function pickLatticeAssets(sidecar: CardExportSidecar) {
  return sidecar.lattice?.assets ?? sidecar.replayPayload?.lattice?.assets ?? null;
}

function pickSignatures(sidecar: CardExportSidecar): CardRecipeSignatures | null {
  return sidecar.replayPayload?.signatures ?? sidecar.cardRecipe?.signatures ?? null;
}

function pickGeometryKind(sidecar: CardExportSidecar, latticeAttached: boolean): WarpGeometryKind | undefined {
  if (latticeAttached) return "sdf";
  const preferred =
    sidecar.renderedPath?.warpGeometryKind ??
    sidecar.cardRecipe?.geometry?.warpGeometryKind ??
    sidecar.replayPayload?.cardRecipe?.geometry?.warpGeometryKind ??
    undefined;
  return preferred === "sdf" ? "ellipsoid" : preferred;
}

function buildPipelineUpdate(
  sidecar: CardExportSidecar,
  previewMesh: CardMeshMetadata | null,
  previewLattice: CardLatticeMetadata | null,
  geometryKind: WarpGeometryKind | undefined,
) {
  const pipelineUpdate = (sidecar.replayPayload?.pipelineUpdate as Record<string, unknown> | null) ?? {};
  const warpGeometryKind = geometryKind ?? (pipelineUpdate as any)?.warpGeometryKind;
  return {
    ...(pipelineUpdate ?? {}),
    ...(previewMesh ? { previewMesh } : {}),
    ...(previewLattice ? { previewLattice } : {}),
    ...(warpGeometryKind ? { warpGeometryKind } : {}),
  };
}

export async function rehydrateCardSidecar(params: {
  sidecar: CardExportSidecar;
  files?: SidecarFileInput[] | null;
}): Promise<RehydrateResult> {
  const sidecar = params.sidecar;
  const files = await normalizeFiles(params.files);
  const previewMesh = pickMesh(sidecar);
  const previewLattice = pickLatticeMeta(sidecar);

  let volumeBuffer: ArrayBuffer | null = null;
  let sdfBuffer: ArrayBuffer | null = null;
  const missingAssets: string[] = [];
  const hashMismatches: string[] = [];
  const assetsUsed: string[] = [];

  const assetRefs = pickLatticeAssets(sidecar);
  const volumeRef = assetRefs?.volumeRG16F;
  const sdfRef = assetRefs?.sdfR8;

  const byName = new Map(files.map((f) => [f.name, f]));
  const bySha = new Map(files.map((f) => [f.sha256, f]));

  if (volumeRef) {
    const direct = byName.get(volumeRef.filename) ?? bySha.get(volumeRef.sha256);
    if (direct) {
      if (direct.sha256 !== volumeRef.sha256) hashMismatches.push(volumeRef.filename);
      volumeBuffer = direct.buffer;
      assetsUsed.push(volumeRef.filename);
    } else {
      missingAssets.push(volumeRef.filename);
    }
  }
  if (sdfRef) {
    const direct = byName.get(sdfRef.filename) ?? bySha.get(sdfRef.sha256);
    if (direct) {
      if (direct.sha256 !== sdfRef.sha256) hashMismatches.push(sdfRef.filename);
      sdfBuffer = direct.buffer;
      assetsUsed.push(sdfRef.filename);
    } else {
      missingAssets.push(sdfRef.filename);
    }
  }

  let latticeDecoded: RehydratedLattice | null = null;
  if (previewLattice) {
    latticeDecoded = {
      meta: previewLattice,
      volume: volumeBuffer ? decodeLatticeVolume(previewLattice, volumeBuffer) : null,
      sdf: sdfBuffer ? decodeLatticeSdf(previewLattice, sdfBuffer, previewMesh?.meshHash) : null,
      assetsUsed,
      missingAssets,
      hashMismatches,
    };
  }

  const latticeAttached = Boolean(latticeDecoded?.volume && missingAssets.length === 0 && hashMismatches.length === 0);
  const geometryKind = pickGeometryKind(sidecar, latticeAttached) ?? (latticeAttached ? "sdf" : "ellipsoid");
  const pipelineUpdate = buildPipelineUpdate(sidecar, previewMesh, previewLattice, geometryKind);

  return {
    sidecar,
    previewMesh,
    previewLattice,
    geometryKind,
    pipelineUpdate,
    signatures: pickSignatures(sidecar),
    lattice: latticeDecoded,
  };
}
