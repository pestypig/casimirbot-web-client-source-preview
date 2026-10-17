import { subscribe, unsubscribe } from "./luma-bus";

export interface DriveSampleMessage {
  samples: Float32Array | null;
  fs?: number;
  f0?: number;
  windowMs?: number;
  hopMs?: number;
  ratios?: number[];
  sidebandDeltaHz?: number;
  flush?: boolean;
  synthetic?: boolean;
}

type Listener = (message: DriveSampleMessage) => void;

const listeners = new Set<Listener>();
let handlerId: string | null = null;
let wired = false;
let latestFS: number | null = null;
let latestF0: number | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toFloat32Array(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) return value;
  if (ArrayBuffer.isView(value) && value instanceof Float32Array) return value;
  if (Array.isArray(value)) {
    const numbers = value.map((entry) => Number(entry));
    if (numbers.some((entry) => !Number.isFinite(entry))) return null;
    return new Float32Array(numbers);
  }
  return null;
}

function normalizePayload(payload: unknown): DriveSampleMessage | null {
  if (payload instanceof Float32Array) {
    return { samples: payload };
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload as Record<string, unknown>;

  const samples =
    toFloat32Array(raw.samples) ??
    toFloat32Array(raw.chunk);

  const fs = isFiniteNumber(raw.fs) && raw.fs > 0 ? raw.fs : undefined;
  const f0 = isFiniteNumber(raw.f0) && raw.f0 > 0 ? raw.f0 : undefined;
  const windowMs = isFiniteNumber(raw.windowMs) && raw.windowMs > 0 ? raw.windowMs : undefined;
  const hopMs = isFiniteNumber(raw.hopMs) && raw.hopMs > 0 ? raw.hopMs : undefined;
  const sidebandDeltaHz =
    isFiniteNumber(raw.sidebandDeltaHz) && raw.sidebandDeltaHz > 0 ? raw.sidebandDeltaHz : undefined;

  const ratios = Array.isArray(raw.ratios)
    ? (raw.ratios as unknown[])
        .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value)))
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : undefined;

  const flush = raw.flush === true;
  const synthetic = raw.synthetic === true;

  if (fs != null) latestFS = fs;
  if (f0 != null) latestF0 = f0;

  if (!samples && !flush) {
    return null;
  }

  return {
    samples: samples ?? null,
    fs,
    f0,
    windowMs,
    hopMs,
    ratios: ratios && ratios.length ? ratios : undefined,
    sidebandDeltaHz,
    flush,
    synthetic,
  };
}

function handleWhisper(payload: unknown) {
  const message = normalizePayload(payload);
  if (!message) return;
  for (const listener of listeners) {
    try {
      listener(message);
    } catch (err) {
      console.error("[drive-samples-bridge] listener error", err);
    }
  }
}

export function ensureDriveSamplesWired() {
  if (wired) return;
  wired = true;
  handlerId = subscribe("drive:samples", handleWhisper);
}

export function getDriveSampleMeta() {
  return { fs: latestFS, f0: latestF0 };
}

export async function* sampleStream(): AsyncGenerator<DriveSampleMessage, void, void> {
  ensureDriveSamplesWired();
  const queue: DriveSampleMessage[] = [];
  const waiters: Array<(value: void | PromiseLike<void>) => void> = [];

  const listener: Listener = (message) => {
    queue.push(message);
    const wake = waiters.shift();
    if (wake) {
      wake(undefined);
    }
  };

  listeners.add(listener);

  try {
    while (true) {
      if (!queue.length) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
        continue;
      }
      yield queue.shift()!;
    }
  } finally {
    listeners.delete(listener);
    if (listeners.size === 0 && handlerId) {
      unsubscribe(handlerId);
      handlerId = null;
      wired = false;
    }
    while (waiters.length) {
      const wake = waiters.shift();
      wake?.(undefined);
    }
  }
}
