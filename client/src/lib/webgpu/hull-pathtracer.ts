import { ArcballCamera } from "arcball_camera";
import { Controller } from "ez_canvas_controller";
import { mat4, vec3 } from "gl-matrix";
import type { Hull3DRendererState, Hull3DVolumeViz, Hull3DVolumeSource } from "@/components/Hull3DRenderer";
import { subscribe, unsubscribe } from "@/lib/luma-bus";
import shaderCode from "./hull-pathtracer.wgsl?raw";

const GPUBufferUsage = (globalThis as any).GPUBufferUsage;
const GPUTextureUsage = (globalThis as any).GPUTextureUsage;
const GPUShaderStage = (globalThis as any).GPUShaderStage;

const INV16PI = 1 / (16 * Math.PI);
const DEFAULT_DENSITY_SCALE = 1;
const DEFAULT_SIGMA_T = 1;
const DEFAULT_SIGMA_S = 0.85;
const MIN_DENOM = 1e-12;

type VolumeCandidate = {
  key: string;
  data: Float32Array;
  dims: [number, number, number];
  bounds: [number, number, number];
  densityScale: number;
};

type T00State = {
  data: Float32Array | null;
  dims: [number, number, number];
  min: number;
  max: number;
  version: number;
  updatedAt: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const alignTo = (value: number, alignment: number) =>
  Math.ceil(value / alignment) * alignment;

const float32ToFloat16Bits = (value: number) => {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const bits = u32[0] ?? 0;
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

const buildDivergingColormap = (width = 256) => {
  const out = new Uint8Array(width * 4);
  const blue = [0.08, 0.32, 0.92];
  const white = [1.0, 1.0, 1.0];
  const red = [0.92, 0.18, 0.12];
  for (let i = 0; i < width; i += 1) {
    const t = width === 1 ? 0 : i / (width - 1);
    const [a, b, k] = t < 0.5 ? [blue, white, t / 0.5] : [white, red, (t - 0.5) / 0.5];
    const r = a[0] + (b[0] - a[0]) * k;
    const g = a[1] + (b[1] - a[1]) * k;
    const bch = a[2] + (b[2] - a[2]) * k;
    const idx = i * 4;
    out[idx] = Math.round(clamp(r, 0, 1) * 255);
    out[idx + 1] = Math.round(clamp(g, 0, 1) * 255);
    out[idx + 2] = Math.round(clamp(bch, 0, 1) * 255);
    out[idx + 3] = 255;
  }
  return out;
};

const computeVolumeScale = (bounds: [number, number, number]) => {
  const size = [
    Math.max(MIN_DENOM, bounds[0] * 2),
    Math.max(MIN_DENOM, bounds[1] * 2),
    Math.max(MIN_DENOM, bounds[2] * 2),
  ];
  const maxAxis = Math.max(size[0], size[1], size[2]);
  return [size[0] / maxAxis, size[1] / maxAxis, size[2] / maxAxis] as [number, number, number];
};

const sech2 = (x: number) => {
  const c = Math.cosh(x);
  return 1 / (c * c);
};

const dTopHatDr = (r: number, sigma: number, R: number) => {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  return sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R))) / den;
};

const resolveAnalyticDims = (state: Hull3DRendererState) => {
  const axisRaw = state.axes ?? [1, 1, 1];
  const axis: [number, number, number] = [
    Number.isFinite(axisRaw[0]) ? Math.abs(axisRaw[0]) : 1,
    Number.isFinite(axisRaw[1]) ? Math.abs(axisRaw[1]) : 1,
    Number.isFinite(axisRaw[2]) ? Math.abs(axisRaw[2]) : 1,
  ];
  const domainScale = Number.isFinite(state.domainScale) ? Number(state.domainScale) : 1;
  const bounds: [number, number, number] = [
    Math.max(1e-3, Math.abs(axis[0]) * domainScale),
    Math.max(1e-3, Math.abs(axis[1]) * domainScale),
    Math.max(1e-3, Math.abs(axis[2]) * domainScale),
  ];
  const maxDim = 96;
  const minDim = 32;
  const size = [bounds[0] * 2, bounds[1] * 2, bounds[2] * 2];
  const targetVoxel = Math.max(1e-3, Math.max(...size) / maxDim);
  const dims: [number, number, number] = [
    Math.max(minDim, Math.min(maxDim, Math.floor(size[0] / targetVoxel))),
    Math.max(minDim, Math.min(maxDim, Math.floor(size[1] / targetVoxel))),
    Math.max(minDim, Math.min(maxDim, Math.floor(size[2] / targetVoxel))),
  ];
  return { dims, bounds };
};

export class Hull3DWebGPUPathTracer {
  private canvas: HTMLCanvasElement;
  private device: any = null;
  private context: any = null;
  private pipeline: any = null;
  private bindGroupLayout: any = null;
  private sampler: any = null;
  private vertexBuffer: any = null;
  private indexBuffer: any = null;
  private viewParamsBuffer: any = null;
  private accumBuffers: any[] = [];
  private accumViews: any[] = [];
  private volumeTexture: any = null;
  private volumeView: any = null;
  private colormapTexture: any = null;
  private camera: ArcballCamera | null = null;
  private controller: Controller | null = null;
  private proj = mat4.create();
  private projView = mat4.create();
  private viewParamsScratch = new ArrayBuffer(32 * 4);
  private frameId = 0;
  private volumeKey: string | null = null;
  private volumeScale: [number, number, number] = [1, 1, 1];
  private volumeDims: [number, number, number] | null = null;
  private densityScale = DEFAULT_DENSITY_SCALE;
  private ready = false;
  private cubeVertexCount = 0;
  private latticeCache: { key: string; candidate: VolumeCandidate } | null = null;
  private t00Cache: { key: string; candidate: VolumeCandidate } | null = null;
  private analyticCache: { key: string; candidate: VolumeCandidate } | null = null;
  private t00: T00State = {
    data: null,
    dims: [1, 1, 1],
    min: 0,
    max: 0,
    version: 0,
    updatedAt: 0,
  };
  private t00BusId: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    const gpu = (navigator as any).gpu;
    if (!gpu) {
      throw new Error("WebGPU unavailable");
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU adapter unavailable");
    }
    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext("webgpu");
    const format = gpu.getPreferredCanvasFormat ? gpu.getPreferredCanvasFormat() : "bgra8unorm";
    this.context.configure({
      device: this.device,
      format,
      alphaMode: "premultiplied",
    });

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const compilationInfo = await shaderModule.getCompilationInfo();
    if (compilationInfo.messages.length > 0) {
      const hadError = compilationInfo.messages.some((msg: any) => msg.type === "error");
      if (hadError) {
        const log = compilationInfo.messages.map((msg: any) => `${msg.lineNum}:${msg.linePos} - ${msg.message}`).join("\n");
        throw new Error(`WebGPU shader compile failed:\n${log}`);
      }
    }

    const cube = this.getCubeMesh();
    this.vertexBuffer = this.device.createBuffer({
      size: cube.vertices.length * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(cube.vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = this.device.createBuffer({
      size: cube.indices.length * 2,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(cube.indices);
    this.indexBuffer.unmap();
    this.cubeVertexCount = Math.floor(cube.vertices.length / 3);

    this.viewParamsBuffer = this.device.createBuffer({
      size: this.viewParamsScratch.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this.colormapTexture = this.createColormapTexture();

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: "3d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: "2d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          storageTexture: {
            access: "write-only",
            format: "rgba32float",
          },
        },
      ],
    });

    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: {
        module: shaderModule,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: 3 * 4,
            attributes: [{ format: "float32x3", offset: 0, shaderLocation: 0 }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragment_main",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-strip",
        stripIndexFormat: "uint16",
        cullMode: "front",
      },
    });

    this.resetCamera();
    this.installController();
    this.resize(this.canvas.width || 1, this.canvas.height || 1);

    this.t00BusId = subscribe("hull3d:t00-volume", (payload: any) => {
      this.handleT00Payload(payload);
    });

    this.ready = true;
  }

  dispose() {
    if (this.t00BusId) {
      unsubscribe(this.t00BusId);
      this.t00BusId = null;
    }
    this.volumeTexture?.destroy?.();
    this.volumeTexture = null;
    this.volumeView = null;
    this.volumeDims = null;
    this.colormapTexture?.destroy?.();
    this.colormapTexture = null;
    this.accumBuffers.forEach((buf) => buf?.destroy?.());
    this.accumBuffers = [];
    this.accumViews = [];
    this.vertexBuffer?.destroy?.();
    this.indexBuffer?.destroy?.();
    this.viewParamsBuffer?.destroy?.();
    this.camera = null;
    this.controller = null;
    this.latticeCache = null;
    this.t00Cache = null;
    this.analyticCache = null;
    this.ready = false;
  }

  resize(width: number, height: number) {
    if (!this.ready) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.accumBuffers.forEach((buf) => buf?.destroy?.());
    this.accumBuffers = [
      this.device.createTexture({
        size: [w, h, 1],
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      }),
      this.device.createTexture({
        size: [w, h, 1],
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      }),
    ];
    this.accumViews = [this.accumBuffers[0].createView(), this.accumBuffers[1].createView()];
    this.frameId = 0;
    this.resetCamera();
  }

  update(state: Hull3DRendererState) {
    if (!this.ready) return;
    const candidate = this.resolveVolumeCandidate(state);
    if (!candidate) return;
    const nextScale = computeVolumeScale(candidate.bounds);
    const scaleChanged =
      Math.abs(nextScale[0] - this.volumeScale[0]) > 1e-6 ||
      Math.abs(nextScale[1] - this.volumeScale[1]) > 1e-6 ||
      Math.abs(nextScale[2] - this.volumeScale[2]) > 1e-6;
    if (candidate.key !== this.volumeKey) {
      this.uploadVolume(candidate);
      this.volumeKey = candidate.key;
      this.densityScale = candidate.densityScale;
      this.frameId = 0;
    }
    if (scaleChanged) {
      this.volumeScale = nextScale;
      this.frameId = 0;
    }
  }

  draw() {
    if (!this.ready || !this.volumeView) return;
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    const aspect = width / Math.max(1, height);

    mat4.perspective(this.proj, 50 * Math.PI / 180.0, aspect, 0.1, 100);
    const view = this.camera ? this.camera.camera : mat4.create();
    mat4.multiply(this.projView, this.proj, view);

    const eyePos = this.camera ? this.camera.eyePos() : vec3.fromValues(0.5, 0.5, 2.5);
    const lightDir = [0.35, 0.65, 0.42];
    const lightStrength = 1.0;

    const f32map = new Float32Array(this.viewParamsScratch);
    const u32map = new Uint32Array(this.viewParamsScratch);
    f32map.set(this.projView, 0);
    f32map.set([eyePos[0], eyePos[1], eyePos[2], 1], 16);
    f32map.set([this.volumeScale[0], this.volumeScale[1], this.volumeScale[2], 1], 20);
    f32map.set([lightDir[0], lightDir[1], lightDir[2], lightStrength], 24);
    u32map[28] = this.frameId;
    f32map[29] = DEFAULT_SIGMA_T;
    f32map[30] = DEFAULT_SIGMA_S;
    f32map[31] = this.densityScale;
    this.device.queue.writeBuffer(this.viewParamsBuffer, 0, this.viewParamsScratch);

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.viewParamsBuffer } },
        { binding: 1, resource: this.volumeView },
        { binding: 2, resource: this.colormapTexture.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: this.accumViews[this.frameId % 2] },
        { binding: 5, resource: this.accumViews[(this.frameId + 1) % 2] },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: [0.0, 0.0, 0.0, 1.0],
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, "uint16");
    renderPass.draw(this.cubeVertexCount, 1, 0, 0);
    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    this.frameId += 1;
  }

  private resetCamera() {
    const defaultEye = new Float32Array([0.5, 0.5, 2.5]);
    const center = new Float32Array([0.5, 0.5, 0.5]);
    const up = new Float32Array([0, 1, 0]);
    this.camera = new ArcballCamera(defaultEye, center, up, 2, [this.canvas.width || 1, this.canvas.height || 1]);
  }

  private installController() {
    if (!this.camera) return;
    const controller = new Controller();
    controller.mousemove = (prev: [number, number], cur: [number, number], evt: MouseEvent) => {
      if (!this.camera) return;
      if (evt.buttons === 1) {
        this.frameId = 0;
        this.camera.rotate(prev, cur);
      } else if (evt.buttons === 2) {
        this.frameId = 0;
        this.camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
      }
    };
    controller.wheel = (amt: number) => {
      if (!this.camera) return;
      this.frameId = 0;
      this.camera.zoom(amt);
    };
    controller.pinch = controller.wheel;
    controller.twoFingerDrag = (drag: [number, number]) => {
      if (!this.camera) return;
      this.frameId = 0;
      this.camera.pan(drag);
    };
    controller.registerForCanvas(this.canvas);
    this.controller = controller;
    this.canvas.addEventListener("contextmenu", (evt) => evt.preventDefault());
  }

  private getCubeMesh() {
    const cubeVertices = [
      1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0,
      1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0,
    ];
    const cubeIndices = cubeVertices.map((_v, i) => i);
    return { vertices: cubeVertices, indices: cubeIndices };
  }

  private createColormapTexture() {
    const width = 256;
    const data = buildDivergingColormap(width);
    const texture = this.device.createTexture({
      size: [width, 1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: width * 4, rowsPerImage: 1 },
      { width, height: 1, depthOrArrayLayers: 1 }
    );
    return texture;
  }

  private handleT00Payload(payload: any) {
    const version = Number(payload?.version ?? 0);
    if (!Number.isFinite(version) || version <= this.t00.version) return;
    const dims = payload?.dims;
    const t00Payload = payload?.t00 ?? null;
    const dataSource = payload?.data ?? t00Payload?.data ?? null;
    if (!Array.isArray(dims) || dims.length < 3 || !dataSource) return;
    const minRaw = Number(payload?.min ?? t00Payload?.min ?? 0);
    const maxRaw = Number(payload?.max ?? t00Payload?.max ?? 0);
    const data =
      dataSource instanceof Float32Array ? dataSource : new Float32Array(dataSource);
    this.t00 = {
      data,
      dims: [dims[0], dims[1], dims[2]],
      min: Number.isFinite(minRaw) ? minRaw : 0,
      max: Number.isFinite(maxRaw) ? maxRaw : 0,
      version,
      updatedAt: Number(payload?.updatedAt ?? Date.now()),
    };
    this.volumeKey = null;
    this.t00Cache = null;
  }

  private resolveVolumeCandidate(state: Hull3DRendererState): VolumeCandidate | null {
    const source: Hull3DVolumeSource = state.volumeSource ?? "lattice";
    const lattice = state.latticeVolume ?? null;
    const latticeCandidate = lattice ? this.buildLatticeCandidate(state, lattice) : null;
    const t00Candidate = this.buildT00Candidate(state);

    if (source === "brick" && t00Candidate) return t00Candidate;
    if (source === "lattice" && latticeCandidate) return latticeCandidate;
    if (source === "analytic") {
      const analytic = this.buildAnalyticCandidate(state);
      if (analytic) return analytic;
    }
    return latticeCandidate ?? t00Candidate ?? this.buildAnalyticCandidate(state);
  }

  private buildLatticeCandidate(state: Hull3DRendererState, volume: any): VolumeCandidate {
    const viz: Hull3DVolumeViz = state.volumeViz ?? "theta_drive";
    const key = `lattice:${volume.hash}|${viz}`;
    if (this.latticeCache?.key === key) return this.latticeCache.candidate;
    const total = volume.drive3D.length;
    const out = new Float32Array(total);
    let denom = MIN_DENOM;

    if (viz === "theta_drive") {
      const maxDrive = Number.isFinite(volume.stats?.maxDrive) ? Math.abs(volume.stats.maxDrive) : 0;
      denom = Math.max(maxDrive, MIN_DENOM);
      for (let i = 0; i < total; i += 1) out[i] = (volume.drive3D[i] ?? 0) / denom;
    } else if (viz === "rho_gr") {
      const maxDf = Number.isFinite(volume.stats?.maxDfdr) ? Math.abs(volume.stats.maxDfdr) : 0;
      denom = Math.max(maxDf * maxDf * INV16PI, MIN_DENOM);
      for (let i = 0; i < total; i += 1) {
        const df = volume.dfdr3D[i] ?? 0;
        out[i] = (df * df * INV16PI) / denom;
      }
    } else if (viz === "shear_gr") {
      const maxDf = Number.isFinite(volume.stats?.maxDfdr) ? Math.abs(volume.stats.maxDfdr) : 0;
      denom = Math.max(maxDf * maxDf, MIN_DENOM);
      for (let i = 0; i < total; i += 1) {
        const df = volume.dfdr3D[i] ?? 0;
        out[i] = (df * df) / denom;
      }
    } else if (viz === "alpha") {
      const maxGate = Number.isFinite(volume.stats?.maxGate) ? Math.abs(volume.stats.maxGate) : 0;
      denom = Math.max(maxGate, MIN_DENOM);
      for (let i = 0; i < total; i += 1) out[i] = (volume.gate3D[i] ?? 0) / denom;
    } else {
      const maxDf = Number.isFinite(volume.stats?.maxDfdr) ? Math.abs(volume.stats.maxDfdr) : 0;
      denom = Math.max(maxDf, MIN_DENOM);
      for (let i = 0; i < total; i += 1) out[i] = (volume.dfdr3D[i] ?? 0) / denom;
    }

    const bounds: [number, number, number] =
      Array.isArray(volume.bounds) && volume.bounds.length >= 3
        ? [
            Number.isFinite(volume.bounds[0]) ? Number(volume.bounds[0]) : 1,
            Number.isFinite(volume.bounds[1]) ? Number(volume.bounds[1]) : 1,
            Number.isFinite(volume.bounds[2]) ? Number(volume.bounds[2]) : 1,
          ]
        : [1, 1, 1];
    const dims: [number, number, number] = [
      volume.dims[0],
      volume.dims[1],
      volume.dims[2],
    ];
    const candidate = {
      key,
      data: out,
      dims,
      bounds,
      densityScale: DEFAULT_DENSITY_SCALE,
    };
    this.latticeCache = { key, candidate };
    return candidate;
  }

  private buildT00Candidate(state: Hull3DRendererState): VolumeCandidate | null {
    if (!this.t00.data || !this.t00.data.length) return null;
    const axisRaw = state.axes ?? [1, 1, 1];
    const axis: [number, number, number] = [
      Number.isFinite(axisRaw[0]) ? Math.abs(axisRaw[0]) : 1,
      Number.isFinite(axisRaw[1]) ? Math.abs(axisRaw[1]) : 1,
      Number.isFinite(axisRaw[2]) ? Math.abs(axisRaw[2]) : 1,
    ];
    const domainScale = Number.isFinite(state.domainScale) ? Number(state.domainScale) : 1;
    const key = `t00:${this.t00.version}|${this.t00.dims.join("x")}|${domainScale}|${axis.join(",")}`;
    if (this.t00Cache?.key === key) return this.t00Cache.candidate;
    const minVal = Number.isFinite(this.t00.min) ? Math.abs(this.t00.min) : 0;
    const maxVal = Number.isFinite(this.t00.max) ? Math.abs(this.t00.max) : 0;
    const denom = Math.max(Math.max(minVal, maxVal), MIN_DENOM);
    const out = new Float32Array(this.t00.data.length);
    for (let i = 0; i < this.t00.data.length; i += 1) {
      out[i] = (this.t00.data[i] ?? 0) / denom;
    }
    const bounds: [number, number, number] = [
      Math.max(1e-3, Math.abs(axis[0]) * domainScale),
      Math.max(1e-3, Math.abs(axis[1]) * domainScale),
      Math.max(1e-3, Math.abs(axis[2]) * domainScale),
    ];
    const dims: [number, number, number] = [
      this.t00.dims[0],
      this.t00.dims[1],
      this.t00.dims[2],
    ];
    const candidate = {
      key,
      data: out,
      dims,
      bounds,
      densityScale: DEFAULT_DENSITY_SCALE,
    };
    this.t00Cache = { key, candidate };
    return candidate;
  }

  private buildAnalyticCandidate(state: Hull3DRendererState): VolumeCandidate | null {
    const { dims, bounds } = resolveAnalyticDims(state);
    const total = dims[0] * dims[1] * dims[2];
    if (total <= 0) return null;
    const axisRaw = state.axes ?? [1, 1, 1];
    const axes: [number, number, number] = [
      Number.isFinite(axisRaw[0]) ? Math.abs(axisRaw[0]) : 1,
      Number.isFinite(axisRaw[1]) ? Math.abs(axisRaw[1]) : 1,
      Number.isFinite(axisRaw[2]) ? Math.abs(axisRaw[2]) : 1,
    ];
    const domainScale = Number.isFinite(state.domainScale) ? Number(state.domainScale) : 1;
    const key = `analytic:${state.sigma}|${state.R}|${state.beta}|${state.gate}|${state.ampChain}|${domainScale}|${axes.join(",")}|${dims.join("x")}`;
    if (this.analyticCache?.key === key) return this.analyticCache.candidate;
    const viz: Hull3DVolumeViz = state.volumeViz ?? "theta_drive";
    const out = new Float32Array(total);
    const sigmaRaw = Number(state.sigma ?? 0);
    const sigma = Number.isFinite(sigmaRaw) ? Math.max(1e-6, sigmaRaw) : 1e-6;
    const rRaw = Number(state.R ?? 1);
    const R = Number.isFinite(rRaw) ? Math.max(1e-6, rRaw) : 1e-6;
    const betaRaw = Number(state.beta ?? 0);
    const beta = Number.isFinite(betaRaw) ? betaRaw : 0;
    const gateRaw = Number(state.gate ?? 1);
    const gate = Number.isFinite(gateRaw) ? gateRaw : 1;
    const ampRaw = Number(state.ampChain ?? 1);
    const ampChain = Number.isFinite(ampRaw) ? ampRaw : 1;
    const invAxes = [
      1 / Math.max(1e-6, axes[0]),
      1 / Math.max(1e-6, axes[1]),
      1 / Math.max(1e-6, axes[2]),
    ];
    let maxAbs = 0;
    const half = [bounds[0], bounds[1], bounds[2]];

    for (let z = 0; z < dims[2]; z += 1) {
      const zpos = (z / Math.max(1, dims[2] - 1)) * 2 - 1;
      for (let y = 0; y < dims[1]; y += 1) {
        const ypos = (y / Math.max(1, dims[1] - 1)) * 2 - 1;
        for (let x = 0; x < dims[0]; x += 1) {
          const xpos = (x / Math.max(1, dims[0] - 1)) * 2 - 1;
          const px = xpos * half[0];
          const py = ypos * half[1];
          const pz = zpos * half[2];
          const mx = px * invAxes[0];
          const my = py * invAxes[1];
          const mz = pz * invAxes[2];
          const rMetric = Math.sqrt(mx * mx + my * my + mz * mz);
          const dfdr = dTopHatDr(rMetric, sigma, 1) * (beta / R);
          const drive = dfdr * gate * ampChain;
          let value = drive;
          if (viz === "theta_gr" || viz === "vorticity_gr") {
            value = dfdr;
          } else if (viz === "rho_gr") {
            value = dfdr * dfdr * INV16PI;
          } else if (viz === "shear_gr") {
            value = dfdr * dfdr;
          } else if (viz === "alpha") {
            value = gate;
          }
          const idx = x + dims[0] * (y + dims[1] * z);
          out[idx] = value;
          const absVal = Math.abs(value);
          if (absVal > maxAbs) maxAbs = absVal;
        }
      }
    }
    const denom = Math.max(maxAbs, MIN_DENOM);
    for (let i = 0; i < out.length; i += 1) out[i] = out[i] / denom;
    const candidate = {
      key,
      data: out,
      dims,
      bounds,
      densityScale: DEFAULT_DENSITY_SCALE,
    };
    this.analyticCache = { key, candidate };
    return candidate;
  }

  private uploadVolume(candidate: VolumeCandidate) {
    const [nx, ny, nz] = candidate.dims;
    const rowBytes = nx * 2;
    const alignedRowBytes = alignTo(rowBytes, 256);
    const paddedWidth = alignedRowBytes / 2;
    const padded = new Uint16Array(paddedWidth * ny * nz);
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        const srcOffset = (z * ny + y) * nx;
        const dstOffset = (z * ny + y) * paddedWidth;
        for (let x = 0; x < nx; x += 1) {
          padded[dstOffset + x] = float32ToFloat16Bits(candidate.data[srcOffset + x] ?? 0);
        }
      }
    }

    if (!this.volumeTexture || !this.volumeView || !this.volumeDims ||
        this.volumeDims[0] !== nx || this.volumeDims[1] !== ny || this.volumeDims[2] !== nz) {
      this.volumeTexture?.destroy?.();
      this.volumeTexture = this.device.createTexture({
        size: [nx, ny, nz],
        format: "r16float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,      
      });
      this.volumeView = this.volumeTexture.createView();
      this.volumeDims = [nx, ny, nz];
    }

    const upload = this.device.createBuffer({
      size: padded.byteLength,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Uint16Array(upload.getMappedRange()).set(padded);
    upload.unmap();

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToTexture(
      { buffer: upload, bytesPerRow: alignedRowBytes, rowsPerImage: ny },
      { texture: this.volumeTexture },
      [nx, ny, nz]
    );
    this.device.queue.submit([encoder.finish()]);
    upload.destroy?.();
  }
}
