import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEnergyPipeline } from "./use-energy-pipeline";
import { publishWhisper } from "@/lib/luma-whispers";
import {
  ensureDriveSamplesWired,
  getDriveSampleMeta,
  sampleStream,
  type DriveSampleMessage,
} from "@/lib/drive-samples-bridge";
import type {
  FractionalScanConfig,
  FractionalGridPayload,
  FractionalGridSpec,
  FractionalGridCell,
} from "@/workers/fractional-scan";

export type FractionalSidebands = {
  plus: number;
  minus: number;
  symmetry: number;
};

export type FractionalLine = {
  ratio: number;
  fHz: number;
  A: number;
  P: number;
  phase: number;
  snr: number;
  sidebands?: FractionalSidebands;
};

export type FractionalPayload = {
  CP: number;
  IFC: number;
  SS: number;
  lines: FractionalLine[];
  grid?: FractionalGridPayload | null;
};

export type FractionalEMA = {
  CP: number | null;
  IFC: number | null;
  SS: number | null;
};

export type FractionalCoherenceState = {
  live: FractionalPayload | null;
  sampleSource: "none" | "drive_bus" | "synthetic_fallback";
  CP: number | null;
  IFC: number | null;
  SS: number | null;
  EMA: FractionalEMA;
  lastUpdated: number | null;
  grid: FractionalGridState | null;
  pins: FractionalRatioKey[];
  togglePin: (key: FractionalRatioKey) => void;
  setPins: (keys: FractionalRatioKey[]) => void;
};

const DEFAULT_RATIOS = Object.freeze([
  0.5,
  1.5,
  2.5,
  4 / 3,
  5 / 3,
  7 / 3,
  8 / 3,
  7 / 2,
  3.5,
] as number[]);

const DEFAULT_WINDOW_MS = 48;
const DEFAULT_HOP_MS = 24;
const MIN_FS = 4_096;
const MAX_FS = 262_144;
const GRID_SPARKLINE_LEN = 6;
const GRID_CELL_EMA_ALPHA = 0.25;
const MAX_BASEBAND_HZ = 5_000_000;
const DEFAULT_GRID_SPEC: FractionalGridSpec = Object.freeze({
  numeratorMax: 12,
  denominatorMax: 12,
  minRatio: 0.25,
  maxRatio: 4,
  segmentCount: 6,
});
const SYNTHESIS_TRIGGER_MS = 1_600;
const SYNTHESIS_CHUNK_MS = 12;

export type FractionalRatioKey = `${number}:${number}`;

export type FractionalGridCellState = FractionalGridCell & {
  key: FractionalRatioKey;
  drift: number;
  ema: number | null;
  sparkline: number[];
  pinned: boolean;
  updatedAt: number;
  basebandHz: number;
};

export type FractionalGridState = {
  rows: number;
  cols: number;
  cells: FractionalGridCellState[];
  updatedAt: number | null;
  f0: number;
  f0Display: number;
  fs: number;
  version: number;
};

function ema(prev: number | null, next: number, alpha = 0.2) {
  return prev == null ? next : alpha * next + (1 - alpha) * prev;
}

function clampFs(fs: number) {
  if (!Number.isFinite(fs) || fs <= 0) return MIN_FS;
  return Math.max(MIN_FS, Math.min(MAX_FS, fs));
}

function coerceF0ForDsp(rawF0: number, fs: number) {
  const safeFs = clampFs(fs);
  const fallback = Math.max(32, Math.min(MAX_BASEBAND_HZ, safeFs / 8));
  if (!Number.isFinite(rawF0) || rawF0 <= 0) {
    return fallback;
  }

  let f = rawF0;
  if (f >= safeFs * 0.45) {
    const alias = f % safeFs;
    if (alias === 0) {
      f = safeFs / 4;
    } else {
      const nyquist = alias > safeFs / 2 ? safeFs - alias : alias;
      f = nyquist;
    }
  }

  if (!Number.isFinite(f) || f <= 0) {
    return fallback;
  }

  if (f >= safeFs * 0.45) {
    f = Math.max(32, safeFs / 4);
  }

  return Math.max(16, Math.min(f, MAX_BASEBAND_HZ));
}

function computeSyntheticAmplitude(pipeline: any): number {
  if (pipeline) {
    const dutyCandidates = [
      pipeline.dutyCycle,
      pipeline.dutyEffectiveFR,
      pipeline.dutyEff,
      pipeline.dutyShip,
      pipeline.dutyFR,
      pipeline.dutyFR_slice,
      pipeline.dutyFR_ship,
      pipeline.dutyBurst,
      pipeline?.drive?.dutyCycle,
    ];
    for (const candidate of dutyCandidates) {
      const num = Number(candidate);
      if (Number.isFinite(num) && num > 0) {
        return Math.max(0.05, Math.min(0.9, num));
      }
    }
    const burst = Number(pipeline?.burst_ms);
    const dwell = Number(pipeline?.dwell_ms);
    if (Number.isFinite(burst) && Number.isFinite(dwell) && dwell > 0) {
      const duty = burst / dwell;
      if (Number.isFinite(duty) && duty > 0) {
        return Math.max(0.05, Math.min(0.9, duty));
      }
    }
  }
  return 0.12;
}

function sanitizeGridSpec(spec?: FractionalGridSpec | null): FractionalGridSpec | null {
  if (spec === null) return null;
  const base = spec ?? DEFAULT_GRID_SPEC;
  const numeratorMax = Math.max(1, Math.floor(base.numeratorMax ?? DEFAULT_GRID_SPEC.numeratorMax));
  const denominatorMax = Math.max(
    1,
    Math.floor(base.denominatorMax ?? DEFAULT_GRID_SPEC.denominatorMax),
  );
  const minRatio =
    typeof base.minRatio === "number" && Number.isFinite(base.minRatio) && base.minRatio > 0
      ? base.minRatio
      : DEFAULT_GRID_SPEC.minRatio;
  const maxRatio =
    typeof base.maxRatio === "number" && Number.isFinite(base.maxRatio) && base.maxRatio > 0
      ? base.maxRatio
      : DEFAULT_GRID_SPEC.maxRatio;
  const minFrequencyHz =
    typeof base.minFrequencyHz === "number" && Number.isFinite(base.minFrequencyHz) && base.minFrequencyHz > 0
      ? base.minFrequencyHz
      : undefined;
  const maxFrequencyHz =
    typeof base.maxFrequencyHz === "number" && Number.isFinite(base.maxFrequencyHz) && base.maxFrequencyHz > 0
      ? base.maxFrequencyHz
      : undefined;
  const segmentCount =
    typeof base.segmentCount === "number" && Number.isFinite(base.segmentCount) && base.segmentCount > 0
      ? Math.min(24, Math.max(3, Math.floor(base.segmentCount)))
      : DEFAULT_GRID_SPEC.segmentCount;

  return {
    numeratorMax,
    denominatorMax,
    minRatio,
    maxRatio,
    minFrequencyHz,
    maxFrequencyHz,
    segmentCount,
  };
}

function gridSpecsEqual(
  a: FractionalGridSpec | null | undefined,
  b: FractionalGridSpec | null | undefined,
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.numeratorMax === b.numeratorMax &&
    a.denominatorMax === b.denominatorMax &&
    (a.minRatio ?? 0) === (b.minRatio ?? 0) &&
    (a.maxRatio ?? 0) === (b.maxRatio ?? 0) &&
    (a.minFrequencyHz ?? 0) === (b.minFrequencyHz ?? 0) &&
    (a.maxFrequencyHz ?? 0) === (b.maxFrequencyHz ?? 0) &&
    (a.segmentCount ?? 0) === (b.segmentCount ?? 0)
  );
}

function deriveBasebandF0(pipeline: any): number | null {
  if (!pipeline) return null;
  const fields = [
    pipeline?.coherence?.basebandHz,
    pipeline?.coherence?.f0_Hz,
    pipeline?.drive?.f0_Hz,
    pipeline?.Omega0_Hz,
    pipeline?.Omega_Hz,
    pipeline?.modulationFreq_Hz,
    pipeline?.modulationFreq_kHz ? pipeline.modulationFreq_kHz * 1e3 : undefined,
    pipeline?.modulationFreq_GHz ? pipeline.modulationFreq_GHz * 1e6 : undefined,
  ];
  for (const candidate of fields) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0 && num < 5e6) {
      return num;
    }
  }
  return null;
}

function buildConfig(
  baseConfig: Partial<FractionalScanConfig> | null,
  ratios: readonly number[],
): FractionalScanConfig | null {
  const f0 = Number(baseConfig?.f0);
  if (!Number.isFinite(f0) || f0 <= 0) return null;
  const fsCandidate = Number(baseConfig?.fs);
  const fs =
    Number.isFinite(fsCandidate) && fsCandidate > 0
      ? clampFs(fsCandidate)
      : clampFs(Math.max(f0 * 16, 16_384));

  const windowMs =
    Number.isFinite(baseConfig?.windowMs) && (baseConfig?.windowMs ?? 0) > 0
      ? baseConfig!.windowMs!
      : DEFAULT_WINDOW_MS;
  const hopMs =
    Number.isFinite(baseConfig?.hopMs) && (baseConfig?.hopMs ?? 0) > 0
      ? baseConfig!.hopMs!
      : DEFAULT_HOP_MS;
  const sidebandDeltaHz =
    Number.isFinite(baseConfig?.sidebandDeltaHz) && (baseConfig?.sidebandDeltaHz ?? 0) > 0
      ? baseConfig!.sidebandDeltaHz!
      : Math.max(0.25, fs / 4096);
  const gridSpec =
    baseConfig && "grid" in baseConfig
      ? sanitizeGridSpec(baseConfig?.grid)
      : sanitizeGridSpec(DEFAULT_GRID_SPEC);

  return {
    fs,
    f0,
    windowMs,
    hopMs,
    ratios: Array.from(ratios),
    sidebandDeltaHz,
    grid: gridSpec,
  };
}

export function useFractionalCoherence(
  ratios: readonly number[] = DEFAULT_RATIOS,
): FractionalCoherenceState {
  const { data: pipeline } = useEnergyPipeline();
  const [busMeta, setBusMeta] = useState(() => {
    const meta = getDriveSampleMeta();
    return {
      fs: typeof meta.fs === "number" ? meta.fs : null,
      f0: typeof meta.f0 === "number" ? meta.f0 : null,
    };
  });
  const pipelineConfig = useMemo(() => {
    const pipelineAny = pipeline as any;
    const basebandCandidate = deriveBasebandF0(pipelineAny);
    const busF0Candidate =
      typeof busMeta.f0 === "number" && Number.isFinite(busMeta.f0) && busMeta.f0 > 0
        ? busMeta.f0
        : null;
    const physicalF0 = basebandCandidate ?? busF0Candidate ?? 1_500;
    const metaFs = busMeta.fs;
    const sampleRateCandidate =
      pipelineAny?.coherence && Number.isFinite(pipelineAny.coherence.sampleRateHz)
        ? Number(pipelineAny.coherence.sampleRateHz)
        : typeof metaFs === "number" && Number.isFinite(metaFs) && metaFs > 0
          ? metaFs
          : NaN;
    const fs =
      Number.isFinite(sampleRateCandidate) && sampleRateCandidate > 0
        ? clampFs(sampleRateCandidate)
        : clampFs(Math.max(physicalF0 * 16, 16_384));
    const f0 = coerceF0ForDsp(physicalF0, fs);
    const displayF0 =
      Number.isFinite(physicalF0) && physicalF0 > 0 ? physicalF0 : f0;
    return { f0, fs, displayF0 };
  }, [pipeline, busMeta.f0, busMeta.fs]);

  const [live, setLive] = useState<FractionalPayload | null>(null);
  const [sampleSource, setSampleSource] = useState<FractionalCoherenceState["sampleSource"]>("none");
  const sampleSourceRef = useRef<FractionalCoherenceState["sampleSource"]>("none");
  const [emaCP, setEmaCP] = useState<number | null>(null);
  const [emaIFC, setEmaIFC] = useState<number | null>(null);
  const [emaSS, setEmaSS] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const cellStateRef = useRef<Map<FractionalRatioKey, FractionalGridCellState>>(new Map());
  const [gridState, setGridState] = useState<FractionalGridState | null>(null);
  const [pinnedKeys, setPinnedKeysState] = useState<FractionalRatioKey[]>([]);
  const pinnedSetRef = useRef<Set<FractionalRatioKey>>(new Set());
  const displayF0Ref = useRef<number>(pipelineConfig.displayF0);
  const synthDutyRef = useRef<number>(computeSyntheticAmplitude(pipeline));
  const lastRealFeedRef = useRef<number>(0);
  const fallbackPhaseRef = useRef<number>(0);

  const workerRef = useRef<Worker | null>(null);
  const configRef = useRef<FractionalScanConfig | null>(null);
  const lastWarnAtRef = useRef<number>(0);
  const lastFeedAtRef = useRef<number>(0);
  const ratiosKey = useMemo(() => ratios.join(","), [ratios]);

  useEffect(() => {
    synthDutyRef.current = computeSyntheticAmplitude(pipeline);
  }, [pipeline]);

  const syncGridPins = useCallback((next: Set<FractionalRatioKey>) => {
    setGridState((prev) => {
      if (!prev) return prev;
      let mutated = false;
      const nextCells = prev.cells.map((cell) => {
        const pinned = next.has(cell.key);
        if (cell.pinned === pinned) return cell;
        mutated = true;
        return { ...cell, pinned };
      });
      if (!mutated) return prev;
      return { ...prev, cells: nextCells };
    });
  }, []);

  const setPinnedCells = useCallback(
    (keys: FractionalRatioKey[]) => {
      const unique = Array.from(new Set(keys));
      const nextSet = new Set(unique);
      pinnedSetRef.current = nextSet;
      setPinnedKeysState(unique);
      syncGridPins(nextSet);
    },
    [syncGridPins],
  );

  const togglePin = useCallback(
    (key: FractionalRatioKey) => {
      setPinnedKeysState((prev) => {
        const nextSet = new Set(prev);
        if (nextSet.has(key)) {
          nextSet.delete(key);
        } else {
          nextSet.add(key);
        }
        const nextList = Array.from(nextSet);
        const nextPins = new Set(nextList);
        pinnedSetRef.current = nextPins;
        syncGridPins(nextPins);
        return nextList;
      });
    },
    [syncGridPins],
  );

  const reinitWorker = useCallback(
    (config: FractionalScanConfig, displayF0?: number) => {
      configRef.current = config;
      displayF0Ref.current =
        typeof displayF0 === "number" && Number.isFinite(displayF0) && displayF0 > 0
          ? displayF0
          : config.f0;
      cellStateRef.current = new Map();
      setGridState(null);
      if (!workerRef.current) {
        if (typeof Worker === "undefined") return;
        workerRef.current = new Worker(
          new URL("../workers/fractional-scan.ts", import.meta.url),
          { type: "module", name: "fractional-scan" },
        );
      }
      const worker = workerRef.current;
      if (!worker) return;
      worker.onmessage = (evt: MessageEvent<FractionalPayload>) => {
        const payload = evt.data;
        setLive(payload);
        setEmaCP((prev) => ema(prev, payload.CP));
        setEmaIFC((prev) => ema(prev, payload.IFC));
        setEmaSS((prev) => ema(prev, payload.SS));
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        setLastUpdated(now);

        const emaSnapshot = emaCP ?? payload.CP;
        if (emaSnapshot > 0) {
          const dip = payload.CP < 0.7 * emaSnapshot;
          if (dip && sampleSourceRef.current === "drive_bus" && now - lastWarnAtRef.current > 4_000) {
            publishWhisper("drive:coherence", {
              level: "warn",
              msg: "Fractional coherence dip detected",
              CP: payload.CP,
              IFC: payload.IFC,
              SS: payload.SS,
              timestamp: now,
            });
            lastWarnAtRef.current = now;
          }
        }

        const gridPayload = payload.grid;
        if (gridPayload && Array.isArray(gridPayload.cells)) {
          const timestamp =
            typeof gridPayload.timestamp === "number" && Number.isFinite(gridPayload.timestamp)
              ? gridPayload.timestamp
              : now;
          const displayF0Current =
            typeof displayF0Ref.current === "number" && Number.isFinite(displayF0Ref.current)
              ? displayF0Ref.current
              : gridPayload.f0;
          const displayScale =
            gridPayload.f0 > 0 ? displayF0Current / gridPayload.f0 : 1;
          const nextCells: FractionalGridCellState[] = [];
          const nextMap = new Map<FractionalRatioKey, FractionalGridCellState>();
          for (const rawCell of gridPayload.cells) {
            const key = `${rawCell.p}:${rawCell.q}` as FractionalRatioKey;
            const prevCell = cellStateRef.current.get(key);
            const coherenceEff = Math.max(
              0,
              Math.min(1, Number.isFinite(rawCell.coherenceEff) ? rawCell.coherenceEff : 0),
            );
            const drift = prevCell ? coherenceEff - prevCell.coherenceEff : 0;
            const emaValue = ema(prevCell?.ema ?? null, coherenceEff, GRID_CELL_EMA_ALPHA);
            const prevSparkline = prevCell?.sparkline ?? [];
            const sparkline =
              prevSparkline.length >= GRID_SPARKLINE_LEN
                ? [...prevSparkline.slice(1), coherenceEff]
                : [...prevSparkline, coherenceEff];
              const normalizedCell: FractionalGridCellState = {
                ...rawCell,
                coherence: Math.max(
                  0,
                  Math.min(1, Number.isFinite(rawCell.coherence) ? rawCell.coherence : 0),
                ),
                coherenceEff,
                stability: Math.max(
                  0,
                  Math.min(1, Number.isFinite(rawCell.stability) ? rawCell.stability : 0),
                ),
                snr: Number.isFinite(rawCell.snr) ? rawCell.snr : 0,
                amplitude: Number.isFinite(rawCell.amplitude) ? rawCell.amplitude : 0,
                sigma: Number.isFinite(rawCell.sigma) ? rawCell.sigma : 0,
                phase: Number.isFinite(rawCell.phase) ? rawCell.phase : 0,
                fHz: rawCell.fHz * displayScale,
                key,
                drift,
                ema: emaValue,
                sparkline,
                pinned: pinnedSetRef.current.has(key),
                updatedAt: timestamp,
                basebandHz: rawCell.fHz,
              };
              nextCells.push(normalizedCell);
              nextMap.set(key, normalizedCell);
            }
            cellStateRef.current = nextMap;

          if (pinnedSetRef.current.size > 0) {
            const filtered = Array.from(pinnedSetRef.current).filter((key) => nextMap.has(key));
            if (filtered.length !== pinnedSetRef.current.size) {
              const filteredSet = new Set(filtered);
              pinnedSetRef.current = filteredSet;
              setPinnedKeysState(filtered);
            }
          }

          setGridState((prevGrid) => ({
            rows: gridPayload.rows,
            cols: gridPayload.cols,
            cells: nextCells,
            updatedAt: timestamp,
            f0: gridPayload.f0,
            f0Display: displayF0Current,
            fs: gridPayload.fs,
            version: prevGrid ? prevGrid.version + 1 : 1,
          }));
        } else if (gridPayload === null) {
          cellStateRef.current = new Map();
          setGridState(null);
        }
      };
      worker.postMessage({ type: "init", config });
    },
    [emaCP],
  );

  const processSamples = useCallback(
    (payload: DriveSampleMessage) => {
      setBusMeta((prev) => {
        let nextFS = prev.fs;
        let nextF0 = prev.f0;
        if (typeof payload.fs === "number" && Number.isFinite(payload.fs) && payload.fs > 0) {
          nextFS = payload.fs;
        }
        if (typeof payload.f0 === "number" && Number.isFinite(payload.f0) && payload.f0 > 0) {
          nextF0 = payload.f0;
        }
        if (nextFS === prev.fs && nextF0 === prev.f0) {
          return prev;
        }
        return {
          fs: typeof nextFS === "number" ? nextFS : null,
          f0: typeof nextF0 === "number" ? nextF0 : null,
        };
      });

      if (payload.flush) {
        const worker = workerRef.current;
        if (worker) {
          worker.postMessage({ type: "flush" });
        }
        return;
      }

      const worker = workerRef.current;
      if (!worker) return;

      const chunk = payload.samples;
      if (!(chunk instanceof Float32Array)) return;
      const feedTimestamp =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const source = payload.synthetic ? "synthetic_fallback" : "drive_bus";
      sampleSourceRef.current = source;
      setSampleSource(source);
      if (!payload.synthetic) {
        lastRealFeedRef.current = feedTimestamp;
      }

      const overrides: Partial<FractionalScanConfig> = {};
      let physicalOverrideF0: number | null = null;
      if (typeof payload.f0 === "number" && Number.isFinite(payload.f0) && payload.f0 > 0) {
        physicalOverrideF0 = payload.f0;
      }
      if (typeof payload.fs === "number" && Number.isFinite(payload.fs) && payload.fs > 0) {
        overrides.fs = payload.fs;
      }
      if (typeof payload.windowMs === "number" && Number.isFinite(payload.windowMs) && payload.windowMs > 0) {
        overrides.windowMs = payload.windowMs;
      }
      if (typeof payload.hopMs === "number" && Number.isFinite(payload.hopMs) && payload.hopMs > 0) {
        overrides.hopMs = payload.hopMs;
      }
      if (
        typeof payload.sidebandDeltaHz === "number" &&
        Number.isFinite(payload.sidebandDeltaHz) &&
        payload.sidebandDeltaHz > 0
      ) {
        overrides.sidebandDeltaHz = payload.sidebandDeltaHz;
      }

      const baseFsForOverride =
        typeof overrides.fs === "number" && Number.isFinite(overrides.fs) && overrides.fs > 0
          ? overrides.fs
          : configRef.current?.fs ?? pipelineConfig.fs;
      if (physicalOverrideF0 != null) {
        overrides.f0 = coerceF0ForDsp(physicalOverrideF0, baseFsForOverride ?? pipelineConfig.fs);
        displayF0Ref.current = physicalOverrideF0;
      }

      const nextRatios =
        Array.isArray(payload.ratios) && payload.ratios.length
          ? payload.ratios
          : ratios;

      const nextConfig = buildConfig(
        {
          ...(configRef.current ?? {}),
          ...overrides,
        },
        nextRatios,
      );

      if (nextConfig) {
        const current = configRef.current;
        const ratiosChanged =
          !current ||
          current.ratios.length !== nextConfig.ratios.length ||
          current.ratios.some((value, idx) => value !== nextConfig.ratios[idx]);
        const gridChanged = !gridSpecsEqual(current?.grid ?? null, nextConfig.grid ?? null);
        const changed =
          !current ||
          Math.abs(current.f0 - nextConfig.f0) > 1e-3 ||
          Math.abs(current.fs - nextConfig.fs) > 1 ||
          current.windowMs !== nextConfig.windowMs ||
          current.hopMs !== nextConfig.hopMs ||
          current.sidebandDeltaHz !== nextConfig.sidebandDeltaHz ||
          ratiosChanged ||
          gridChanged;
        if (changed) {
          const nextDisplayF0 =
            physicalOverrideF0 && physicalOverrideF0 > 0
              ? physicalOverrideF0
              : displayF0Ref.current;
          reinitWorker(nextConfig, nextDisplayF0 ?? nextConfig.f0);
        }
      }

      const copy = new Float32Array(chunk);
      worker.postMessage({ type: "push", samples: copy }, [copy.buffer]);
      lastFeedAtRef.current = feedTimestamp;
    },
    [ratios, reinitWorker, pipelineConfig.fs],
  );

  useEffect(() => {
    const config = buildConfig(
      {
        f0: pipelineConfig.f0,
        fs: pipelineConfig.fs,
        windowMs: DEFAULT_WINDOW_MS,
        hopMs: DEFAULT_HOP_MS,
      },
      ratios,
    );
    if (!config) return;
    reinitWorker(config, pipelineConfig.displayF0);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      configRef.current = null;
      cellStateRef.current = new Map();
      setGridState(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineConfig.f0, pipelineConfig.fs, pipelineConfig.displayF0, ratiosKey]);

  useEffect(() => {
    let cancelled = false;
    ensureDriveSamplesWired();
    const iterator = sampleStream();

    const run = async () => {
      try {
        for await (const message of iterator) {
          if (cancelled) break;
          processSamples(message);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[useFractionalCoherence] drive sample stream error", err);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (typeof iterator.return === "function") {
        iterator.return(undefined).catch(() => {});
      }
    };
  }, [processSamples]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    let timer: number | null = null;
    let phase = fallbackPhaseRef.current || 0;

    const schedule = (delay: number) => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(tick, Math.max(8, delay));
    };

    const tick = () => {
      if (cancelled) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const lastRealFeed = lastRealFeedRef.current;
      const hasRecentRealFeed =
        lastRealFeed > 0 && now - lastRealFeed < SYNTHESIS_TRIGGER_MS;
      if (hasRecentRealFeed) {
        schedule(SYNTHESIS_TRIGGER_MS);
        return;
      }

      const fs = pipelineConfig.fs;
      const freq = pipelineConfig.displayF0 || pipelineConfig.f0;
      if (!Number.isFinite(fs) || fs <= 0 || !Number.isFinite(freq) || freq <= 0) {
        schedule(SYNTHESIS_TRIGGER_MS);
        return;
      }

      const amplitude = synthDutyRef.current;
      if (!Number.isFinite(amplitude) || amplitude <= 0) {
        schedule(SYNTHESIS_TRIGGER_MS);
        return;
      }

      const samplesPerChunk = Math.max(256, Math.round((fs * SYNTHESIS_CHUNK_MS) / 1000));
      if (!Number.isFinite(samplesPerChunk) || samplesPerChunk <= 0) {
        schedule(SYNTHESIS_TRIGGER_MS);
        return;
      }

      const chunk = new Float32Array(samplesPerChunk);
      const omega = 2 * Math.PI * freq;
      for (let idx = 0; idx < samplesPerChunk; idx++) {
        const t = idx / fs;
        const theta = phase + omega * t;
        chunk[idx] =
          amplitude *
          (0.72 * Math.sin(theta) +
            0.18 * Math.sin(theta * 1.5 + 0.4) +
            0.1 * Math.sin(theta * 2.5 - 1.1));
      }
      phase += omega * (samplesPerChunk / fs);
      if (!Number.isFinite(phase)) {
        phase = 0;
      } else {
        phase %= 2 * Math.PI;
      }

      processSamples({
        samples: chunk,
        fs,
        f0: freq,
        windowMs: SYNTHESIS_CHUNK_MS,
        hopMs: SYNTHESIS_CHUNK_MS / 2,
        synthetic: true,
      });

      schedule(SYNTHESIS_CHUNK_MS);
    };

    schedule(SYNTHESIS_TRIGGER_MS);

    return () => {
      cancelled = true;
      if (timer != null) {
        window.clearTimeout(timer);
      }
      fallbackPhaseRef.current = phase;
    };
  }, [pipelineConfig.f0, pipelineConfig.fs, pipelineConfig.displayF0, processSamples]);

  return useMemo(
    () => ({
      live,
      sampleSource,
      CP: live?.CP ?? null,
      IFC: live?.IFC ?? null,
      SS: live?.SS ?? null,
      EMA: { CP: emaCP, IFC: emaIFC, SS: emaSS },
      lastUpdated,
      grid: gridState,
      pins: pinnedKeys,
      togglePin,
      setPins: setPinnedCells,
    }),
    [live, sampleSource, emaCP, emaIFC, emaSS, lastUpdated, gridState, pinnedKeys, togglePin, setPinnedCells],
  );
}

export default useFractionalCoherence;
