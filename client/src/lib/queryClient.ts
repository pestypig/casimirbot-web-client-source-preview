import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { isFlagEnabled } from "@/lib/envFlags";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

interface ApiRequestOptions {
  allowUnauthorized?: boolean;
  headers?: Record<string, string>;
}

type FixedTuple3 = [number, number, number];

const isDevMocksEnabled = () => isFlagEnabled("HELIX_DEV_MOCKS", false);
const C_M_PER_S = 299_792_458;
const HELIX_MOCK_NEEDLE_PATH_M = 1007;
const HELIX_MOCK_TAU_LC_MS = (HELIX_MOCK_NEEDLE_PATH_M / C_M_PER_S) * 1e3;

const RESOURCE_ERR_PATTERNS = [
  "ERR_INSUFFICIENT_RESOURCES",
  "ERR_FAILED",
  "ENOBUFS",
  "ERR_CONNECTION_RESET",
];
const RESOURCE_ERR_WINDOW_MS = 10_000;
const RESOURCE_ERR_CIRCUIT_MS = 5_000;
const MAX_FETCH_INFLIGHT = 32;

export const HELIX_DEV_MOCK_EVENT = "helix:dev-mock-used";
export type DevMockStatus = {
  used: boolean;
  count: number;
  last?: {
    url: string;
    method: string;
    reason?: string;
    at: number;
  };
};

const devMockStatus: DevMockStatus = { used: false, count: 0 };

const notifyDevMockUsed = (info: { url: string; method: string; reason?: string }) => {
  devMockStatus.used = true;
  devMockStatus.count += 1;
  devMockStatus.last = { ...info, at: Date.now() };
  // Make the status inspectable for debugging and surface to listeners
  try {
    (globalThis as Record<string, unknown>).__HELIX_DEV_MOCK__ = { ...devMockStatus };
  } catch { /* noop */ }
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(HELIX_DEV_MOCK_EVENT, { detail: { ...devMockStatus } }));
    }
  } catch { /* noop */ }
};

export const getDevMockStatus = (): DevMockStatus => ({ ...devMockStatus });

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const encodeBytesToBase64 = (bytes: Uint8Array): string => {
  const globalScope = globalThis as {
    btoa?: (value: string) => string;
    Buffer?: {
      from?: (
        input: Uint8Array,
      ) => { toString(encoding: string): string };
    };
  };

  if (typeof globalScope.btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    return globalScope.btoa(binary);
  }

  const bufferFactory = globalScope.Buffer;
  if (
    bufferFactory &&
    typeof bufferFactory.from === "function"
  ) {
    return bufferFactory.from(bytes).toString("base64");
  }

  let output = "";
  let i = 0;
  const { length } = bytes;
  for (; i + 2 < length; i += 3) {
    const chunk =
      (bytes[i] << 16) |
      (bytes[i + 1] << 8) |
      bytes[i + 2];
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += BASE64_ALPHABET[(chunk >> 6) & 63];
    output += BASE64_ALPHABET[chunk & 63];
  }
  const remaining = length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += "==";
  } else if (remaining === 2) {
    const chunk =
      (bytes[i] << 16) |
      (bytes[i + 1] << 8);
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += BASE64_ALPHABET[(chunk >> 6) & 63];
    output += "=";
  }
  return output;
};

const encodeFloat32ToBase64 = (values: Float32Array): string => {
  const bytes = new Uint8Array(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  return encodeBytesToBase64(bytes);
};

const buildCurvatureMock = (dims: FixedTuple3) => {
  const total = dims[0] * dims[1] * dims[2];
  const data = new Float32Array(total);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < total; i++) {
    const t = total > 1 ? i / (total - 1) : 0;
    const value = Math.sin(t * Math.PI * 4) * 0.05;
    data[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return {
    dims,
    data: encodeFloat32ToBase64(data),
    min,
    max,
  };
};

const CURVATURE_MOCKS = {
  low: buildCurvatureMock([8, 8, 8]),
  medium: buildCurvatureMock([12, 12, 12]),
  high: buildCurvatureMock([16, 16, 16]),
} as const;

const buildStressMock = (dims: FixedTuple3) => {
  const total = dims[0] * dims[1] * dims[2];
  const makeField = (scale: number, bias = 0) => {
    const data = new Float32Array(total);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let idx = 0; idx < total; idx += 1) {
      const t = total > 1 ? idx / (total - 1) : 0;
      const value = bias + Math.sin(t * Math.PI * 4) * scale;
      data[idx] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    return { data: encodeFloat32ToBase64(data), min, max };
  };
  return {
    dims,
    t00: makeField(0.08, -0.04),
    Sx: makeField(0.02),
    Sy: makeField(0.02),
    Sz: makeField(0.02),
    divS: makeField(0.01),
  };
};

const buildLapseMock = (dims: FixedTuple3) => {
  const total = dims[0] * dims[1] * dims[2];
  const phi = new Float32Array(total);
  const g_tt = new Float32Array(total);
  const alpha = new Float32Array(total);
  let phiMin = Number.POSITIVE_INFINITY;
  let phiMax = Number.NEGATIVE_INFINITY;
  let gttMin = Number.POSITIVE_INFINITY;
  let gttMax = Number.NEGATIVE_INFINITY;
  let alphaMin = Number.POSITIVE_INFINITY;
  let alphaMax = Number.NEGATIVE_INFINITY;
  for (let idx = 0; idx < total; idx += 1) {
    const t = total > 1 ? idx / (total - 1) : 0;
    const phiVal = Math.sin(t * Math.PI * 4) * 0.02;
    const gttVal = -(1 + 0.5 * phiVal);
    const alphaVal = Math.sqrt(Math.max(0, -gttVal));
    phi[idx] = phiVal;
    g_tt[idx] = gttVal;
    alpha[idx] = alphaVal;
    if (phiVal < phiMin) phiMin = phiVal;
    if (phiVal > phiMax) phiMax = phiVal;
    if (gttVal < gttMin) gttMin = gttVal;
    if (gttVal > gttMax) gttMax = gttVal;
    if (alphaVal < alphaMin) alphaMin = alphaVal;
    if (alphaVal > alphaMax) alphaMax = alphaVal;
  }
  if (!Number.isFinite(phiMin)) phiMin = 0;
  if (!Number.isFinite(phiMax)) phiMax = 0;
  if (!Number.isFinite(gttMin)) gttMin = 0;
  if (!Number.isFinite(gttMax)) gttMax = 0;
  if (!Number.isFinite(alphaMin)) alphaMin = 0;
  if (!Number.isFinite(alphaMax)) alphaMax = 0;
  return {
    dims,
    channels: {
      phi: { data: encodeFloat32ToBase64(phi), min: phiMin, max: phiMax },
      g_tt: { data: encodeFloat32ToBase64(g_tt), min: gttMin, max: gttMax },
      alpha: { data: encodeFloat32ToBase64(alpha), min: alphaMin, max: alphaMax },
    },
    stats: {
      iterations: 48,
      residual: 1e-4,
      phiMin,
      phiMax,
      gttMin,
      gttMax,
      alphaMin,
      alphaMax,
      boundary: "dirichlet_zero",
      solver: "jacobi",
    },
  };
};

const buildGrEvolveMock = (dims: FixedTuple3) => {
  const total = dims[0] * dims[1] * dims[2];
  const ones = new Float32Array(total);
  const zeros = new Float32Array(total);
  ones.fill(1);
  const encodeChannel = (data: Float32Array, value: number) => ({
    data: encodeFloat32ToBase64(data),
    min: value,
    max: value,
  });
  return {
    dims,
    voxelBytes: 4,
    format: "r32f",
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    voxelSize_m: [2 / dims[0], 2 / dims[1], 2 / dims[2]],
    time_s: 0,
    dt_s: 0,
    channels: {
      alpha: encodeChannel(ones, 1),
      beta_x: encodeChannel(zeros, 0),
      beta_y: encodeChannel(zeros, 0),
      beta_z: encodeChannel(zeros, 0),
      gamma_xx: encodeChannel(ones, 1),
      gamma_yy: encodeChannel(ones, 1),
      gamma_zz: encodeChannel(ones, 1),
      K_trace: encodeChannel(zeros, 0),
      H_constraint: encodeChannel(zeros, 0),
      M_constraint_x: encodeChannel(zeros, 0),
      M_constraint_y: encodeChannel(zeros, 0),
      M_constraint_z: encodeChannel(zeros, 0),
    },
    stats: {
      steps: 0,
      iterations: 0,
      tolerance: 0,
      cfl: 0,
      H_rms: 0,
      M_rms: 0,
      thetaPeakAbs: 0,
      thetaGrowthPerStep: 0,
    },
  };
};

const STRESS_ENERGY_MOCK = buildStressMock([12, 12, 12]);
const LAPSE_MOCKS = {
  low: buildLapseMock([8, 8, 8]),
  medium: buildLapseMock([12, 12, 12]),
  high: buildLapseMock([16, 16, 16]),
} as const;
const GR_EVOLVE_MOCKS = {
  low: buildGrEvolveMock([8, 8, 8]),
  medium: buildGrEvolveMock([12, 12, 12]),
  high: buildGrEvolveMock([16, 16, 16]),
} as const;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

type ResourceErrState = { timestamps: number[]; circuitUntil: number };
const getResourceErrState = (): ResourceErrState => {
  const globalState = (globalThis as any).__HELIX_RESOURCE_ERR__ as ResourceErrState | undefined;
  const fallback: ResourceErrState = { timestamps: [], circuitUntil: 0 };
  if (globalState && Array.isArray(globalState.timestamps)) {
    return globalState;
  }
  (globalThis as any).__HELIX_RESOURCE_ERR__ = fallback;
  return fallback;
};

const isResourceCircuitOpen = (state: ResourceErrState): boolean => state.circuitUntil > Date.now();

const noteResourceError = (state: ResourceErrState, message: string): void => {
  const now = Date.now();
  state.timestamps.push(now);
  const cutoff = now - RESOURCE_ERR_WINDOW_MS;
  state.timestamps = state.timestamps.filter((t) => t >= cutoff);
  if (state.timestamps.length >= 3) {
    state.circuitUntil = now + RESOURCE_ERR_CIRCUIT_MS;
    // eslint-disable-next-line no-console
    console.warn("[apiRequest] Circuit open after resource errors:", message);
  }
  (globalThis as any).__HELIX_RESOURCE_ERR__ = state;
};

async function waitForFetchSlot(): Promise<() => void> {
  const state: { inflight: number } = (globalThis as any).__HELIX_FETCH_SLOTS__ ?? { inflight: 0 };
  (globalThis as any).__HELIX_FETCH_SLOTS__ = state;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  while (state.inflight >= MAX_FETCH_INFLIGHT) {
    await sleep(25);
  }
  state.inflight += 1;
  return () => {
    state.inflight = Math.max(0, state.inflight - 1);
  };
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  signal?: AbortSignal,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const normalizeUrlForMock = (input: string): string => {
    if (!input) return input;
    if (input.startsWith("/")) return input;
    try {
      const base =
        typeof window !== "undefined" && window.location
          ? `${window.location.protocol}//${window.location.host}`
          : "http://localhost";
      const parsed = new URL(input, base);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return input;
    }
  };
  const normalizedUrl = normalizeUrlForMock(url);
  const normalizedPath = normalizedUrl.split("?")[0] ?? normalizedUrl;

  // Helper: dev-only minimal mocks when backend isn't up.
  const shouldMock = () => {
    if (!isDevMocksEnabled()) return false;
    // Vite dev environment check
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
      return Boolean(isDev) && normalizedUrl.startsWith('/api/helix');
    } catch {
      return false;
    }
  };

  const makeMock = (reason?: string): Response | null => {
    if (!shouldMock()) return null;
    // Very small, UI-friendly defaults to keep Helix Core page stable without backend
    const now = Date.now();
    const jsonFor = () => {
      if (method === 'GET' && normalizedPath === '/api/helix/pipeline') {
        return {
          currentMode: 'hover',
          dutyEffectiveFR: PROMOTED_WARP_PROFILE.dutyShip,
          __mockData: true,
          __mockSource: 'helix-dev-defaults',
          sectorCount: PROMOTED_WARP_PROFILE.sectorCount,
          sectorsConcurrent: PROMOTED_WARP_PROFILE.concurrentSectors,
          gammaGeo: PROMOTED_WARP_PROFILE.gammaGeo,
          qSpoilingFactor: PROMOTED_WARP_PROFILE.qSpoilingFactor,
          gammaVanDenBroeck: PROMOTED_WARP_PROFILE.gammaVanDenBroeck,
          qiAutoscale: {
            enabled: true,
            engaged: true,
            target: 0.9,
            zetaRaw: 1.2,
            appliedScale: 0.75,
            proposedScale: 0.75,
            gating: "active",
            minScale: 0.03,
            slew: 0.25,
            source: "tile-telemetry",
            sumWindowDt: 1,
            clamps: [],
          },
          tsAutoscale: {
            engaged: false,
            gating: "idle",
            appliedBurst_ns: 10_000_000,
            proposedBurst_ns: 10_000_000,
            target: 100,
            slew: 0.25,
            floor_ns: 20,
          },
          lightCrossing: {
            tauLC_ms: HELIX_MOCK_TAU_LC_MS,
            burst_ms: 1000 * PROMOTED_WARP_PROFILE.dutyCycle,
            dwell_ms: 1000,
          },
          hull: { a: 503.5, b: 132, c: 86.5 },
          mock: true,
          updatedAt: now,
        };
      }
      if (method === 'GET' && normalizedPath === '/api/helix/metrics') {
        const sectorsTotal = PROMOTED_WARP_PROFILE.sectorCount;
        const sectorsLive = PROMOTED_WARP_PROFILE.concurrentSectors;
        const strobeHz = 1000;
        const sectorPeriod_ms = 1000 / strobeHz;
        const tilesPerSector = 1024;
        const totalTiles = tilesPerSector * sectorsTotal;
        const activeTiles = tilesPerSector * sectorsLive;
        const currentSector = Math.floor((now / 1000) * strobeHz) % sectorsTotal;
        return {
          totalTiles,
          activeTiles,
          tilesPerSector,
          totalSectors: sectorsTotal,
          activeSectors: sectorsLive,
          sectorStrobing: sectorsLive,
          currentSector,
          strobeHz,
          sectorPeriod_ms,
          dutyCycle: PROMOTED_WARP_PROFILE.dutyCycle,
          dutyEffectiveFR: PROMOTED_WARP_PROFILE.dutyCycle * (sectorsLive / sectorsTotal),
          currentMode: 'hover',
          overallStatus: 'NOMINAL',
          __mockData: true,
          __mockSource: 'helix-dev-defaults',
          tileData: [],
          lightCrossing: {
            tauLC_ms: HELIX_MOCK_TAU_LC_MS,
            sectorPeriod_ms,
            burst_ms: sectorPeriod_ms * PROMOTED_WARP_PROFILE.dutyCycle,
            dwell_ms: sectorPeriod_ms,
            sectorIdx: currentSector,
            sectorCount: sectorsTotal,
            sectorsTotal,
            activeSectors: sectorsLive,
          },
        };
      }
      if (method === 'GET' && normalizedPath === '/api/helix/curvature-brick') {
        const searchStart = normalizedUrl.indexOf("?");
        const params = searchStart >= 0
          ? new URLSearchParams(normalizedUrl.slice(searchStart + 1))
          : undefined;
        const qualityRaw = params?.get("quality")?.toLowerCase();
        const quality =
          qualityRaw === "low" || qualityRaw === "high"
            ? qualityRaw
            : "medium";
        const mock = CURVATURE_MOCKS[quality];
        const span = Math.max(mock.max - mock.min, 1e-6);
        const residualScale = span * 0.25;
        return {
          dims: mock.dims,
          voxelBytes: 4,
          format: "r32f",
          data: mock.data,
          min: mock.min,
          max: mock.max,
          emaAlpha: 0.18,
          residualMin: -residualScale,
          residualMax: residualScale,
          quality,
          mock: true,
          generatedAt: now,
        };
      }
      if (method === 'GET' && normalizedPath === '/api/helix/stress-energy-brick') {
        const mock = STRESS_ENERGY_MOCK;
        return {
          dims: mock.dims,
          voxelBytes: 4,
          format: "r32f",
          channels: {
            t00: mock.t00,
            Sx: mock.Sx,
            Sy: mock.Sy,
            Sz: mock.Sz,
            divS: mock.divS,
          },
          stats: {
            totalEnergy_J: -1.2e12,
            avgT00: -4e10,
            avgFluxMagnitude: 2e9,
            netFlux: [0, 0, 0],
            divMin: mock.divS.min,
            divMax: mock.divS.max,
            dutyFR: PROMOTED_WARP_PROFILE.dutyShip,
            strobePhase: (now / 1000) % 1,
          },
          mock: true,
          generatedAt: now,
        };
      }
      if (method === 'GET' && normalizedPath === '/api/helix/lapse-brick') {
        const searchStart = normalizedUrl.indexOf("?");
        const params = searchStart >= 0
          ? new URLSearchParams(normalizedUrl.slice(searchStart + 1))
          : undefined;
        const qualityRaw = params?.get("quality")?.toLowerCase();
        const quality =
          qualityRaw === "low" || qualityRaw === "high"
            ? qualityRaw
            : "medium";
        const mock = LAPSE_MOCKS[quality];
        return {
          dims: mock.dims,
          voxelBytes: 4,
          format: "r32f",
          channels: mock.channels,
          stats: mock.stats,
          quality,
          mock: true,
          generatedAt: now,
        };
      }
      if (method === 'GET' && normalizedPath === '/api/helix/gr-evolve-brick') {
        const searchStart = normalizedUrl.indexOf("?");
        const params = searchStart >= 0
          ? new URLSearchParams(normalizedUrl.slice(searchStart + 1))
          : undefined;
        const qualityRaw = params?.get("quality")?.toLowerCase();
        const quality =
          qualityRaw === "low" || qualityRaw === "high"
            ? qualityRaw
            : "medium";
        const mock = GR_EVOLVE_MOCKS[quality];
        return {
          kind: "gr-evolve-brick",
          dims: mock.dims,
          voxelBytes: mock.voxelBytes,
          format: mock.format,
          bounds: mock.bounds,
          voxelSize_m: mock.voxelSize_m,
          time_s: mock.time_s,
          dt_s: mock.dt_s,
          channels: mock.channels,
          stats: mock.stats,
          quality,
          mock: true,
          generatedAt: now,
        };
      }
      // Accept POSTs used by the UI with a no-op echo to avoid hard errors
      if (method === 'POST' && normalizedUrl.startsWith('/api/helix/hardware/')) {
        return { ok: true };
      }
      if (method === 'POST' && (normalizedUrl.startsWith('/api/helix/pipeline') || normalizedUrl === '/api/helix/command' || normalizedUrl.startsWith('/api/helix/mode'))) {
        return { ok: true, url, method, received: data ?? null, mocked: true, ts: now };
      }
      return null;
    };
    const body = jsonFor();
    if (body == null) return null;
    // eslint-disable-next-line no-console
    if (reason) {
      console.warn('[apiRequest] Using DEV mock for', method, url, `:: ${reason}`);
    } else {
      console.warn('[apiRequest] Using DEV mock for', method, url);
    }
    notifyDevMockUsed({
      url: normalizedPath || normalizedUrl || url,
      method,
      reason,
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const resourceErrState = getResourceErrState();
  if (isResourceCircuitOpen(resourceErrState)) {
    const mocked = makeMock("circuit-open");
    if (mocked) return mocked;
    throw new Error("helix-api circuit breaker open after recent resource errors; pausing requests");
  }

  let releaseSlot: (() => void) | null = null;
  try {
    releaseSlot = await waitForFetchSlot();

    const headers = { ...(options.headers ?? {}) };
    if (data && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal,
    });

    if (!res.ok) {
      if (options.allowUnauthorized && res.status === 401) {
        return res;
      }
      // Try dev mock on non-OK responses
      const mocked = makeMock(`${res.status} ${res.statusText}`.trim());
      if (mocked) return mocked;
    }

    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    // Network or other error: try dev mock
    const message = err instanceof Error ? err.message : String(err);
    if (RESOURCE_ERR_PATTERNS.some((pat) => message.includes(pat))) {
      noteResourceError(resourceErrState, message);
    }
    const mocked = makeMock(message);
    if (mocked) return mocked;
    throw err;
  } finally {
    if (releaseSlot) releaseSlot();
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>({ on401: unauthorizedBehavior }: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  return async ({ queryKey, signal }) => {
    const urlFromQueryKey = () => {
      const firstString = queryKey.find(
        (part): part is string => typeof part === "string" && part.length > 0,
      );
      if (firstString) return firstString;
      return queryKey.join("/");
    };

    const url = urlFromQueryKey();
    if (!url || typeof url !== "string" || url.length === 0) {
      throw new Error("queryKey must include a request URL string");
    }

    const res = await apiRequest(
      "GET",
      url,
      undefined,
      signal,
      { allowUnauthorized: unauthorizedBehavior === "returnNull" },
    );

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as T;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return await res.json();
    }

    const text = await res.text();
    if (!text) {
      return null as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

