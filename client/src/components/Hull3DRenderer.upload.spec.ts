import { afterEach, describe, expect, it, vi } from "vitest";
import { Hull3DRenderer } from "./Hull3DRenderer";
import { LATTICE_PROFILE_PERF, estimateLatticeUploadBytes } from "@/lib/lattice-perf";
import type { HullSurfaceVoxelVolume } from "@/lib/lattice-surface";

class FakeWebGL2 {
  NO_ERROR = 0;
  INVALID_OPERATION = 0x0502;
  TEXTURE_3D = 0x806f;
  TEXTURE_2D = 0x0de1;
  UNPACK_ALIGNMENT = 0x0cf5;
  TEXTURE_MIN_FILTER = 0x2801;
  TEXTURE_MAG_FILTER = 0x2800;
  TEXTURE_WRAP_S = 0x2802;
  TEXTURE_WRAP_T = 0x2803;
  TEXTURE_WRAP_R = 0x8072;
  CLAMP_TO_EDGE = 0x812f;
  RG16F = 0x822f;
  RG32F = 0x8230;
  R32F = 0x822e;
  RG = 0x8227;
  RED = 0x1903;
  HALF_FLOAT = 0x140b;
  FLOAT = 0x1406;
  LINEAR = 0x2601;
  NEAREST = 0x2600;
  UNSIGNED_BYTE = 0x1401;

  fail3DFormats = new Set<number>();
  fail2DFormats = new Set<number>();
  pendingError: number | null = null;
  uploads3D: Array<unknown> = [];
  uploads2D: Array<unknown> = [];
  textures: Array<unknown> = [];

  createTexture() {
    const tex = {};
    this.textures.push(tex);
    return tex as WebGLTexture;
  }
  bindTexture() {}
  texParameteri() {}
  texImage3D(...args: unknown[]) {
    const internalFormat = typeof args[2] === "number" ? (args[2] as number) : null;
    if (internalFormat != null && this.fail3DFormats.has(internalFormat)) {
      this.pendingError = this.INVALID_OPERATION;
    }
  }
  texSubImage3D(...args: unknown[]) {
    this.uploads3D.push(args);
  }
  texImage2D(...args: unknown[]) {
    const internalFormat = typeof args[2] === "number" ? (args[2] as number) : null;
    if (internalFormat != null && this.fail2DFormats.has(internalFormat)) {
      this.pendingError = this.INVALID_OPERATION;
    }
  }
  texSubImage2D(...args: unknown[]) {
    this.uploads2D.push(args);
  }
  pixelStorei() {}
  getError() {
    const err = this.pendingError ?? this.NO_ERROR;
    this.pendingError = null;
    return err;
  }
}

type RendererContext = {
  gl: FakeWebGL2;
  skipVolumeUpdate: boolean;
  latticeUpload: any;
  latticeUploadFailedHash: string | null;
  latticeUploadFailedReason: string | null;
  latticeUploadTelemetry: any;
  latticeUploadFormatReason: string | null;
  latticeAtlasTex: WebGLTexture | null;
  volumeTex: WebGLTexture | null;
  gateVolumeTex: WebGLTexture | null;
  supportsColorFloat: boolean;
  supportsFloatLinear: boolean;
  supportsHalfFloatLinear: boolean;
  maxTextureSize: number;
  max3DTextureSize: number;
  lastVolumeKey: string | null;
  hasVolume: boolean;
};

const makeVolume = (dims: [number, number, number], hash = "vol-test"): HullSurfaceVoxelVolume => {
  const voxelCount = dims[0] * dims[1] * dims[2];
  return {
    hash,
    cacheHit: false,
    dims,
    voxelSize: 1,
    bounds: [1, 1, 1],
    metadata: {
      driveLadder: {
        scalars: { R: 1, sigma: 1, beta: 1, gate: 1, ampChain: 1 },
        gateScale: 1,
        driveScale: 1,
        dfdrSignature: "df",
        signature: "sig",
        hash: "sig-hash",
      },
    },
    gate3D: new Float32Array(voxelCount).fill(0.1),
    dfdr3D: new Float32Array(voxelCount).fill(0.2),
    drive3D: new Float32Array(voxelCount).fill(0.3),
    weightAccum: new Float32Array(voxelCount),
    clampReasons: [],
    stats: {
      samples: voxelCount,
      voxelsTouched: voxelCount,
      coverage: 1,
      maxGate: 1,
      maxDfdr: 1,
      maxDrive: 1,
      budgetHit: false,
    },
  };
};

const makeRendererCtx = (
  gl: FakeWebGL2,
  overrides: Partial<RendererContext> = {},
): RendererContext => ({
  gl,
  skipVolumeUpdate: false,
  latticeUpload: null,
  latticeUploadFailedHash: null,
  latticeUploadFailedReason: null,
  latticeUploadTelemetry: null,
  latticeUploadFormatReason: null,
  latticeAtlasTex: null,
  volumeTex: null,
  gateVolumeTex: null,
  supportsColorFloat: true,
  supportsFloatLinear: true,
  supportsHalfFloatLinear: true,
  maxTextureSize: 2048,
  max3DTextureSize: 512,
  lastVolumeKey: null,
  hasVolume: false,
  ...overrides,
});

const updateVolume = (Hull3DRenderer as any).prototype.updateVolume as (state: any) => void;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Hull3DRenderer lattice upload rails", () => {
  it("caps per-tick slice uploads to the bandwidth budget (table driven per profile)", () => {
    const cases = [
      { tag: "preview" as const, dims: [16, 16, 200] as [number, number, number], expectSlices: LATTICE_PROFILE_PERF.preview.maxSlicesPerTickVolume },
      { tag: "card" as const, dims: [16, 16, 200] as [number, number, number], expectSlices: LATTICE_PROFILE_PERF.card.maxSlicesPerTickVolume },
    ];

    for (const c of cases) {
      const gl = new FakeWebGL2();
      const ctx = makeRendererCtx(gl);
      const volume = makeVolume(c.dims, `vol-bandwidth-${c.tag}`);

      updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: c.tag });

      expect(ctx.latticeUpload?.nextSlice).toBe(c.expectSlices);
      expect(gl.uploads3D.length).toBe(c.expectSlices);
      expect(ctx.latticeUploadTelemetry?.budgetBytes).toBe(LATTICE_PROFILE_PERF[c.tag].maxBytes);
      expect(ctx.latticeUploadTelemetry?.budgetVoxels).toBe(LATTICE_PROFILE_PERF[c.tag].maxVoxels);
      const expectedBytes = estimateLatticeUploadBytes(volume.dims, { packedRG: true, bytesPerComponent: 4 });
      expect(ctx.latticeUploadTelemetry?.bytes).toBe(expectedBytes);
    }
  });

  it("downgrades to RG16F when float linear filtering is unavailable", () => {
    const gl = new FakeWebGL2();
    const ctx = makeRendererCtx(gl, { supportsFloatLinear: false, supportsHalfFloatLinear: true });
    const volume = makeVolume([8, 8, 8], "vol-half");

    updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });

    expect(ctx.latticeUpload?.format.label).toBe("3D RG16F");
    expect(ctx.latticeUpload?.format.type).toBe(gl.HALF_FLOAT);
    expect(ctx.latticeUploadFormatReason).toBe("caps:float-linear");
    expect(ctx.latticeUploadTelemetry?.downgradeReason).toBe("caps:float-linear");
  });

  it("records capability downgrade when EXT_color_buffer_float is missing", () => {
    const gl = new FakeWebGL2();
    const ctx = makeRendererCtx(gl, { supportsColorFloat: false, supportsFloatLinear: true });
    const volume = makeVolume([8, 8, 4], "vol-no-color-float");

    updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });

    expect(ctx.latticeUpload?.format.label).toBe("3D RG16F");
    expect(ctx.latticeUploadFormatReason).toBe("caps:color-buffer-float");
    expect(ctx.latticeUploadTelemetry?.downgradeReason).toBe("caps:color-buffer-float");
    expect(ctx.latticeUploadTelemetry?.formatLabel).toBe("3D RG16F");
  });

  it("falls back to a 2D atlas when 3D texture caps are exceeded", () => {
    const gl = new FakeWebGL2();
    const ctx = makeRendererCtx(gl, { max3DTextureSize: 64, maxTextureSize: 2048 });
    const volume = makeVolume([200, 200, 4], "vol-atlas");

    updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });

    expect(ctx.latticeUpload?.format.backend).toBe("atlas2d");
    expect(gl.uploads2D.length).toBeGreaterThan(0);
    expect(ctx.latticeUploadFormatReason).toBe("caps:max3dTextureSize");
    expect(ctx.latticeUploadTelemetry?.downgradeReason).toBe("caps:max3dTextureSize");
    expect(ctx.latticeUploadTelemetry?.skippedReason).toBeUndefined();
  });

  it("downgrades RG32F when bytes exceed the profile budget (table driven)", () => {
    const cases: Array<{ dims: [number, number, number]; expectLabel: string }> = [
      { dims: [205, 200, 170], expectLabel: "3D RG16F" }, // ~55.8 MB packed -> exceeds preview 48 MB budget
      { dims: [64, 64, 8], expectLabel: "3D RG32F" },     // small enough for full float
    ];

    for (const test of cases) {
      const gl = new FakeWebGL2();
      const ctx = makeRendererCtx(gl);
      const volume = makeVolume(test.dims, `bytes-${test.expectLabel}`);
      updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });
      expect(ctx.latticeUpload?.format.label).toBe(test.expectLabel);
    }
  });

  it("selects upload formats against profile byte rails (preview vs card)", () => {
    const dims: [number, number, number] = [190, 190, 190]; // ~6.8M voxels => ~55MB RG32F
    const cases = [
      { tag: "preview" as const, expectLabel: "3D RG16F" },
      { tag: "card" as const, expectLabel: "3D RG32F" },
    ];

    for (const c of cases) {
      const gl = new FakeWebGL2();
      const ctx = makeRendererCtx(gl);
      const volume = makeVolume(dims, `bytes-${c.tag}`);

      updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: c.tag });

      expect(ctx.latticeUpload?.format.label).toBe(c.expectLabel);
      const bytes = estimateLatticeUploadBytes(volume.dims, {
        packedRG: ctx.latticeUpload?.format.packedRG ?? true,
        bytesPerComponent: ctx.latticeUpload?.format.type === gl.HALF_FLOAT ? 2 : 4,
      });
      expect(ctx.latticeUploadTelemetry?.bytes).toBe(bytes);
      expect(ctx.latticeUploadTelemetry?.budgetBytes).toBe(LATTICE_PROFILE_PERF[c.tag].maxBytes);
    }
  });

  it("falls back from 3D formats to an atlas when capability allocation fails (R32F->RG16F->atlas)", () => {
    const gl = new FakeWebGL2();
    gl.fail3DFormats = new Set([gl.RG32F, gl.RG16F, gl.R32F]);
    const ctx = makeRendererCtx(gl, { max3DTextureSize: 512, maxTextureSize: 2048 });
    const volume = makeVolume([16, 16, 16], "vol-cap-fallback");

    updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });

    expect(ctx.latticeUpload?.format.backend).toBe("atlas2d");
    expect(ctx.latticeUpload?.format.label).toBe("Atlas RG32F");
    expect(gl.uploads2D.length).toBeGreaterThan(0);
  });

  it("rejects uploads when voxel budget is exceeded", () => {
    const gl = new FakeWebGL2();
    const ctx = makeRendererCtx(gl);
    const volume = makeVolume([215, 215, 200], "vol-overbudget"); // ~9.2M voxels, above preview cap

    updateVolume.call(ctx, { latticeVolume: volume, latticeProfileTag: "preview" });

    expect(ctx.latticeUploadFailedHash).toBe("vol-overbudget");
    expect(ctx.latticeUploadFailedReason).toBe("budget:voxels");
    expect(ctx.latticeUpload).toBeNull();
  });
});
