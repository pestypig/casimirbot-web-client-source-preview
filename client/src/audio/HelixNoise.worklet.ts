/* eslint-disable @typescript-eslint/no-unused-vars */
declare const sampleRate: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

interface PeakConfig {
  f: number;
  q: number;
  gain: number;
}

interface HelixSetMessage {
  type: "set";
  seed: number;
  branch: number;
  peaks: PeakConfig[];
  xfadeMs?: number;
}

interface HelixRecordMessage {
  type: "record";
  frames: number;
}

type HelixMessage = HelixSetMessage | HelixRecordMessage;

class XorShift32 {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  nextU01() {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x >>>= 0;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return (x >>> 0) / 4294967296;
  }
}

function bpCoeffs(fs: number, f: number, q: number) {
  const w0 = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w0) / (2 * Math.max(q, 0.1));
  const b0 = q * alpha;
  const b1 = 0;
  const b2 = -q * alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

class FilterBank {
  private coeffs: ReturnType<typeof bpCoeffs>[];
  private z1L: Float32Array;
  private z2L: Float32Array;
  private z1R: Float32Array;
  private z2R: Float32Array;
  private gains: Float32Array;

  constructor(peaks: PeakConfig[], fs: number) {
    this.coeffs = peaks.map((peak) => bpCoeffs(fs, Math.max(5, peak.f), Math.max(0.1, peak.q)));
    this.gains = new Float32Array(peaks.map((peak) => peak.gain));
    const n = peaks.length;
    this.z1L = new Float32Array(n);
    this.z2L = new Float32Array(n);
    this.z1R = new Float32Array(n);
    this.z2R = new Float32Array(n);
  }

  processSample(xL: number, xR: number): [number, number] {
    let yL = 0;
    let yR = 0;
    for (let i = 0; i < this.coeffs.length; i += 1) {
      const { b0, b1, b2, a1, a2 } = this.coeffs[i];
      const gain = this.gains[i];

      const outL = b0 * xL + this.z1L[i];
      this.z1L[i] = b1 * xL - a1 * outL + this.z2L[i];
      this.z2L[i] = b2 * xL - a2 * outL;

      const outR = b0 * xR + this.z1R[i];
      this.z1R[i] = b1 * xR - a1 * outR + this.z2R[i];
      this.z2R[i] = b2 * xR - a2 * outR;

      yL += outL * gain;
      yR += outR * gain;
    }
    return [yL, yR];
  }
}

class HelixNoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  private readonly fs = sampleRate;
  private seed = 1;
  private rng = new XorShift32(1);
  private bankA: FilterBank | null = null;
  private bankB: FilterBank | null = null;
  private xfadeSamples = 0;
  private xfadeRemain = 0;
  private recordBufferL: Float32Array | null = null;
  private recordBufferR: Float32Array | null = null;
  private recordRemaining = 0;
  private recordIndex = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<HelixMessage>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "set") {
        if (!Array.isArray(msg.peaks)) return;
        const { seed, branch, peaks, xfadeMs = 20 } = msg;
        const combinedSeed = (seed | 0) ^ (branch | 0) ^ 0x9e3779b9;
        this.seed = combinedSeed >>> 0;
        this.rng = new XorShift32(this.seed);

        const sanitizedPeaks = peaks.map((peak) => ({
          f: Math.max(5, Math.min(20000, peak.f)),
          q: Math.max(0.1, Math.min(50, peak.q)),
          gain: Math.max(0, Math.min(2, peak.gain)),
        }));
        const newBank = new FilterBank(sanitizedPeaks, this.fs);

        if (!this.bankA) {
          this.bankA = newBank;
          this.bankB = null;
          this.xfadeRemain = 0;
        } else {
          this.bankB = newBank;
          this.xfadeSamples = Math.max(1, Math.floor(this.fs * (xfadeMs / 1000)));
          this.xfadeRemain = this.xfadeSamples;
        }
      } else if (msg.type === "record") {
        const frames = Math.floor(Math.max(0, Math.min(msg.frames, this.fs * 60)));
        if (frames <= 0) return;
        this.recordBufferL = new Float32Array(frames);
        this.recordBufferR = new Float32Array(frames);
        this.recordRemaining = frames;
        this.recordIndex = 0;
      }
    };
  }

  private white(): [number, number] {
    const u1 = Math.max(1e-12, this.rng.nextU01());
    const u2 = this.rng.nextU01();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0];
    if (!output) return true;
    const left = output[0];
    const right = output[1] ?? output[0];

    for (let i = 0; i < left.length; i += 1) {
      const [wL, wR] = this.white();
      const [aL, aR] = this.bankA ? this.bankA.processSample(wL, wR) : [0, 0];
      const [bL, bR] = this.bankB ? this.bankB.processSample(wL, wR) : [0, 0];

      if (this.xfadeRemain > 0) {
        const t = 1 - this.xfadeRemain / this.xfadeSamples;
        const gA = Math.cos(0.5 * Math.PI * t);
        const gB = Math.sin(0.5 * Math.PI * t);
        left[i] = aL * gA + bL * gB;
        right[i] = aR * gA + bR * gB;
        this.xfadeRemain -= 1;
        if (this.xfadeRemain === 0) {
          this.bankA = this.bankB;
          this.bankB = null;
        }
      } else {
        left[i] = aL;
        right[i] = aR;
      }

      if (this.recordRemaining > 0 && this.recordBufferL && this.recordBufferR) {
        this.recordBufferL[this.recordIndex] = left[i];
        this.recordBufferR[this.recordIndex] = right[i];
        this.recordIndex += 1;
        this.recordRemaining -= 1;
        if (this.recordRemaining === 0) {
          this.port.postMessage({
            type: "record-complete",
            left: this.recordBufferL,
            right: this.recordBufferR,
            sampleRate: this.fs,
          });
          this.recordBufferL = null;
          this.recordBufferR = null;
          this.recordIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("helix-noise", HelixNoiseProcessor);
