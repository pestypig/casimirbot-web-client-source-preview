import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEnergyPipeline, useUpdatePipeline, type EnergyPipelineState } from "./use-energy-pipeline";
import useMetrics from "./use-metrics";
import { useLightCrossingLoop } from "./useLightCrossingLoop";
import { useHull3DSharedStore } from "@/store/useHull3DSharedStore";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { queryClient } from "@/lib/queryClient";
import { RHO_COS_GUARD_LIMIT, summarizeSweepGuard } from "@/lib/sweep-guards";
import { sweepTelemetry, type SweepSnapshot } from "@/lib/sweepTelemetry";
import type { SweepPoint } from "@shared/schema";

const OVERLAY_STATE_QUERY_KEY = ["hull3d:overlay:controls"] as const;

type TimeLapseStatus = "idle" | "arming" | "recording" | "processing" | "complete" | "error";

export type TLFrame = {
  t: number;
  segment: string;
  TS: number | null;
  tauLC_ms: number | null;
  burst_ms: number | null;
  dwell_ms: number | null;
  rho: number | null;
  QL: number | null;
  d_eff: number | null;
  sectors: { live: number | null; total: number | null };
  gr: { burstVsTau: boolean; tsOk: boolean; qiOk: boolean };
  qiMargin: number | null;
  sweep: SweepSnapshot | null;
  deltas: {
    rho: number | null;
    TS: number | null;
    dEff: number | null;
  };
  overlayText: string;
  overlays: {
    sectorAlpha: number[];
    shellOffset: number | null;
  };
};

type SweepSeriesEntry = { tMs: number } & SweepSnapshot;

type TimeLapseSidecar = {
  sweepSeries: SweepSeriesEntry[];
};

export type TimeLapseResult = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  fps: number;
  frameCount: number;
  videoBlob: Blob;
  videoUrl: string;
  videoMimeType: string;
  videoFileName: string;
  metricsBlob: Blob;
  metricsUrl: string;
  metrics: {
    targetFps: number;
    achievedFps: number;
    framesPushed: number;
    framesDroppedEstimate: number;
    p95FrameJitterMs: number;
    sidecar?: TimeLapseSidecar;
  };
  sidecar?: TimeLapseSidecar;
};

export type TimeLapseSegmentKey = "stable" | "edge" | "recovery";

type ScenarioSegment = {
  key: TimeLapseSegmentKey;
  label: string;
  startMs: number;
  endMs: number;
  params: Partial<EnergyPipelineState>;
};

type RecorderSidecarOptions = {
  includeSweep?: boolean;
};

type RecorderOptions = {
  canvas: HTMLCanvasElement | null;
  overlayCanvas?: HTMLCanvasElement | null;
  overlayDom?: HTMLElement | null;
  overlayEnabled?: boolean;
  durationMs?: number;
  fps?: number;
  sidecar?: RecorderSidecarOptions;
};

type RecorderReturn = {
  status: TimeLapseStatus;
  isRecording: boolean;
  isProcessing: boolean;
  progress: number;
  currentFrame: TLFrame | null;
  result: TimeLapseResult | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
};

const DEFAULT_DURATION_MS = 10_000;
const DEFAULT_FPS = 30;
const PASS_TS_THRESHOLD = 100;
const UI_UPDATE_HZ = 6;
const UI_UPDATE_INTERVAL_MS = 1000 / UI_UPDATE_HZ;

const STRING_FALLBACK = "n/a";

const asFiniteNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatNumber = (value: unknown, digits = 2, suffix = ""): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  return `${num.toFixed(digits)}${suffix}`;
};

const formatPercent = (value: unknown, digits = 2): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  return `${(num * 100).toFixed(digits)}%`;
};

const formatSigned = (value: unknown, digits = 2, suffix = ""): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  const sign = num > 0 ? "+" : num < 0 ? "-" : "";
  return `${sign}${Math.abs(num).toFixed(digits)}${suffix}`;
};

const formatDegrees = (value: unknown): string => formatNumber(value, 2, " deg");

const formatQL = (value: unknown): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  if (Math.abs(num) >= 1e4) return num.toExponential(2);
  if (Math.abs(num) >= 1e3) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return num.toFixed(0);
};

const formatKappa = (value: unknown): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  return `${num.toFixed(3)} MHz`;
};

const formatRatio = (value: unknown, digits = 3): string => {
  const num = asFiniteNumber(value);
  if (num == null) return STRING_FALLBACK;
  return num.toFixed(digits);
};

const formatStatus = (point: SweepPoint | null | undefined): string => {
  if (!point) return STRING_FALLBACK;
  return point.status ?? (point.stable ? "PASS" : "WARN");
};

const formatQuadrature = (point: SweepPoint | null | undefined): string => {
  const num = asFiniteNumber(point?.G);
  if (num == null) return STRING_FALLBACK;
  const signed = formatSigned(num, 2, " dB");
  if (signed === STRING_FALLBACK) return signed;
  return num >= 0 ? `amp ${signed}` : `de-amp ${signed}`;
};

type HudPayload = {
  t: number;
  TS: number | null;
  tauLC_ms: number | null;
  burst_ms: number | null;
  dwell_ms: number | null;
  rho: number | null;
  QL: number | null;
  deff: number | null;
  sectors: { live: number | null; total: number | null };
  gr: { burstVsTau: boolean; tsOk: boolean; qiOk: boolean };
  shellOffset: number | null;
  sweep: SweepSnapshot | null;
};

const formatSweepStep = (iter: number | null, total: number | null) => {
  const iterText = iter != null ? Math.round(iter).toLocaleString() : "--";
  const totalText = total != null ? Math.round(total).toLocaleString() : "--";
  return `${iterText}/${totalText}`;
};

const formatSweepValue = (value: number | null, digits = 2, suffix = "") => {
  const text = formatHudValue(value, digits);
  return text === "--" || !suffix ? text : `${text} ${suffix}`;
};

const drawSweepPanel = (
  ctx: CanvasRenderingContext2D,
  sweep: SweepSnapshot,
  x: number,
  y: number,
  width: number,
) => {
  const padding = 8;
  const lineHeight = 14;
  const lines: Array<[string, string]> = [
    ["step", formatSweepStep(sweep.iter, sweep.total)],
    ["gap", formatSweepValue(sweep.d_nm, 0, "nm")],
    ["depth", formatHudValue(sweep.m, 3)],
    ["phase", formatSweepValue(sweep.phi_deg, 2, "deg")],
    ["pump", formatSweepValue(sweep.Omega_GHz, 3, "GHz")],
    ["detune", formatSigned(sweep.detune_MHz, 3, " MHz")],
    ["kappa", formatSweepValue(sweep.kappa_MHz, 3, "MHz")],
    [
      "kappa_eff",
      sweep.kappaEff_MHz === "THRESHOLD"
        ? "THRESHOLD"
        : formatSweepValue(
            typeof sweep.kappaEff_MHz === "number" ? sweep.kappaEff_MHz : null,
            3,
            "MHz",
          ),
    ],
    ["rho", formatHudValue(sweep.pumpRatio, 3)],
    ["quadrature", formatSigned(sweep.G_dB, 2, " dB")],
    ["status", sweep.status ?? "--"],
    ["guard", sweep.guard ?? "--"],
    [
      "ETA",
      sweep.etaMs != null && Number.isFinite(sweep.etaMs)
        ? `${Math.max(0, Math.round(sweep.etaMs))} ms`
        : "--",
    ],
    [
      "slew",
      sweep.slewDelayMs != null && Number.isFinite(sweep.slewDelayMs)
        ? `${Math.max(0, Math.round(sweep.slewDelayMs))} ms`
        : "--",
    ],
  ];

  const panelHeight = lines.length * lineHeight + padding * 2;

  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, width, panelHeight);
  ctx.globalAlpha = 1;

  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";

  let rowY = y + padding + 2;
  const labelX = x + 4;
  const valueX = x + 4 + 130;

  for (const [label, value] of lines) {
    ctx.fillText(label, labelX, rowY);
    ctx.fillText(value, valueX, rowY);
    rowY += lineHeight;
  }

  ctx.restore();
};

class FrameMeter {
  private readonly target: number;
  private lastTs = 0;
  private readonly gaps: number[] = [];
  public pushed = 0;
  public dropped = 0;

  constructor(targetFps: number) {
    this.target = Math.max(1, targetFps);
  }

  push(ts: number) {
    this.pushed += 1;
    if (this.lastTs) {
      const gap = ts - this.lastTs;
      this.gaps.push(gap);
      const ideal = 1000 / this.target;
      if (gap > ideal * 1.5) {
        const missed = Math.floor(gap / ideal) - 1;
        if (missed > 0) {
          this.dropped += missed;
        }
      }
    }
    this.lastTs = ts;
  }

  snapshot() {
    const sorted = this.gaps.slice().sort((a, b) => a - b);
    const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
    const p95 = sorted.length ? sorted[p95Index] : 0;
    const ideal = 1000 / this.target;
    const jitter = p95 > ideal ? p95 - ideal : 0;
    return {
      pushed: this.pushed,
      dropped: this.dropped,
      p95JitterMs: jitter,
    };
  }
}

const makeHudCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: true });
  return { canvas, ctx };
};

const formatHudValue = (value: number | null, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
};

const ensureMicrotask = (fn: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
  } else {
    void Promise.resolve().then(fn).catch(() => undefined);
  }
};

const drawHud = (ctx: CanvasRenderingContext2D, payload: HudPayload) => {
  const { width, height } = ctx.canvas;
  if (!width || !height) return;

  const panelWidth = Math.min(320, width - 16);
  const padding = 8;
  const lineHeight = 14;

  const lines: Array<[string, string]> = [
    ["t (s)", payload.t.toFixed(2)],
    ["TS", payload.TS != null && Number.isFinite(payload.TS) ? payload.TS.toExponential(1) : "--"],
    ["tlc (ms)", formatHudValue(payload.tauLC_ms, 3)],
    ["burst/dwell", `${formatHudValue(payload.burst_ms, 2)} / ${formatHudValue(payload.dwell_ms, 2)}`],
    ["?", formatHudValue(payload.rho, 2)],
    ["Q_L", payload.QL != null && Number.isFinite(payload.QL) ? payload.QL.toExponential(1) : "--"],
    ["d_eff", payload.deff != null && Number.isFinite(payload.deff) ? payload.deff.toExponential(1) : "--"],
    [
      "sectors",
      `${payload.sectors.live ?? "--"}/${payload.sectors.total ?? "--"}`,
    ],
    [
      "GR",
      `${payload.gr.burstVsTau ? "PASS" : "WARN"} ${payload.gr.tsOk ? "PASS" : "WARN"} ${
        payload.gr.qiOk ? "PASS" : "WARN"
      }`,
    ],
    ["shell ??", formatHudValue(payload.shellOffset, 3)],
  ];

  const panelHeight = lines.length * lineHeight + padding * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.save();

  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#000";
  ctx.fillRect(padding, padding, panelWidth, panelHeight);
  ctx.globalAlpha = 1;

  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";

  let y = padding + 2;
  const labelX = padding + 4;
  const valueX = padding + 4 + 130;

  for (const [label, value] of lines) {
    ctx.fillText(label, labelX, y);
    ctx.fillText(value, valueX, y);
    y += lineHeight;
  }

  ctx.restore();

  if (payload.sweep) {
    const sweepY = padding + panelHeight + 8;
    drawSweepPanel(ctx, payload.sweep, padding, sweepY, panelWidth);
  }
};

const pickSweepNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const num = asFiniteNumber(value);
    if (num != null) return num;
  }
  return null;
};

const mergeSweepSnapshots = (
  base: SweepSnapshot | null,
  extra: SweepSnapshot | null,
): SweepSnapshot | null => {
  if (!base && !extra) return null;
  if (!base) return extra ? { ...extra } : null;
  if (!extra) return { ...base };
  return {
    ...base,
    status: extra.status ?? base.status,
    guard: extra.guard ?? base.guard,
    etaMs: extra.etaMs ?? base.etaMs,
    slewDelayMs: extra.slewDelayMs ?? base.slewDelayMs,
    bestIdx: extra.bestIdx ?? base.bestIdx,
    guardCap: extra.guardCap ?? base.guardCap,
  };
};

type BaselineNarrative = {
  rho: number | null;
  dEff: number | null;
  TS: number | null;
};

type OverlayBlockId =
  | "header"
  | "phase"
  | "sweep"
  | "delta"
  | "legend"
  | "equations"
  | "metrics-left"
  | "metrics-right";

type OverlayRect = {
  id: OverlayBlockId;
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverlayHitRegistry = {
  blocks: OverlayRect[];
};

type OverlayDomRegionRole =
  | "header"
  | "phase"
  | "sweep"
  | "delta"
  | "legend"
  | "equations"
  | "metrics-left"
  | "metrics-right";

type OverlayDomRegion = {
  id: OverlayBlockId;
  role: OverlayDomRegionRole;
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverlayPayload = {
  segmentLabel: string;
  elapsedSeconds: number;
  headerLines: string[];
  phaseLines: string[];
  sweepLines: string[];
  deltaLines: string[];
  metricsLeft: string[];
  metricsRight: string[];
  equationLines: string[];
};

type OverlayDomMetrics = {
  paddingCss: number;
  lineHeightCss: number;
  fontSizeCss: number;
  swatchSizeCss: number;
};

type LegendEntry = {
  label: string;
  swatch: string;
  gradientStops?: Array<{ offset: number; color: string }>;
};

const pickNumber = <T,>(...values: T[]): number | null => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return null;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const GUARD_MARGIN = 0.02;
const RHO_ACTIVE_LIMIT = Math.max(0, RHO_COS_GUARD_LIMIT - GUARD_MARGIN);
const RHO_RECOVERY_TARGET = Math.max(0, Math.min(RHO_ACTIVE_LIMIT - 0.03, 0.9));

const clampToActiveGuard = (value: unknown, limit = RHO_ACTIVE_LIMIT): number | undefined => {
  if (value == null) {
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  return Math.max(0, Math.min(limit, num));
};

type GuardedPipelineParams = Partial<EnergyPipelineState> & { rhoTarget?: number };

const enforceGuardLimits = (
  params: GuardedPipelineParams,
): GuardedPipelineParams => {
  const safe: Record<string, unknown> = { ...params };
  const clampField = (field: keyof EnergyPipelineState, limit = RHO_ACTIVE_LIMIT) => {
    if (Object.prototype.hasOwnProperty.call(safe, field)) {
      const clamped = clampToActiveGuard((safe as any)[field], limit);
      if (clamped === undefined) {
        delete (safe as any)[field];
      } else {
        (safe as any)[field] = clamped;
      }
    }
  };
  clampField("dutyCycle");
  clampField("localBurstFrac");

  if (Object.prototype.hasOwnProperty.call(safe, "modulationFreq_GHz")) {
    const freqGHz = Number((safe as any).modulationFreq_GHz);
    if (!Number.isFinite(freqGHz)) {
      delete (safe as any).modulationFreq_GHz;
    } else {
      (safe as any).modulationFreq_GHz = Math.max(0.001, Math.min(1000, freqGHz));
    }
  }

  const clampSectorInt = (field: "sectorStrobing" | "sectorsConcurrent") => {
    if (Object.prototype.hasOwnProperty.call(safe, field)) {
      const value = Number((safe as any)[field]);
      if (!Number.isFinite(value)) {
        delete (safe as any)[field];
      } else {
        (safe as any)[field] = Math.max(1, Math.min(10_000, Math.round(value)));
      }
    }
  };
  clampSectorInt("sectorStrobing");
  clampSectorInt("sectorsConcurrent");

  if (Object.prototype.hasOwnProperty.call(safe, "rhoTarget")) {
    const clamped = clampToActiveGuard((safe as any).rhoTarget, RHO_ACTIVE_LIMIT);
    if (clamped === undefined) {
      delete (safe as any).rhoTarget;
    } else {
      (safe as any).rhoTarget = clamped;
    }
  }

  return safe as GuardedPipelineParams;
};

const resolveSweepContext = (state: EnergyPipelineState | undefined) => {
  const anyState = state as any;
  const sweepRuntime = anyState?.sweep ?? null;
  const sweepLast = (sweepRuntime?.last ?? null) as SweepPoint | null;
  const sweepResults = Array.isArray(anyState?.vacuumGapSweepResults)
    ? (anyState.vacuumGapSweepResults as SweepPoint[])
    : [];
  const sweepTop =
    Array.isArray(sweepRuntime?.top) && sweepRuntime.top.length
      ? (sweepRuntime.top[0] as SweepPoint)
      : null;
  const fallback =
    sweepLast ?? sweepTop ?? (sweepResults.length ? sweepResults[sweepResults.length - 1] : null);
  return {
    sweepRuntime,
    sweepLast,
    fallback,
  };
};

const buildRecoveryParams = (
  pipeline: EnergyPipelineState | undefined,
  baseline: Partial<EnergyPipelineState> | null,
): Partial<EnergyPipelineState> => {
  const pipelineAny = pipeline as any;
  const baseDuty = clamp01(
    pickNumber(
      baseline?.dutyCycle,
      pipeline?.dutyCycle,
      pipelineAny?.dutyEffectiveFR,
      pipelineAny?.dutyGate,
      0.1,
    ) ?? 0.1,
  );
  const baseBurst = clamp01(
    pickNumber(
      baseline?.localBurstFrac,
      pipeline?.localBurstFrac,
      baseline?.dutyCycle,
      pipeline?.dutyCycle,
      0.01,
    ) ?? PROMOTED_WARP_PROFILE.dutyCycle,
  );
  const baseStrobing = Math.max(
    1,
    Math.round(
      pickNumber(
        baseline?.sectorStrobing,
        pipeline?.sectorStrobing,
        pipeline?.sectorsConcurrent,
        pipelineAny?.lightCrossing?.sectorCount,
        1,
      ) ?? 1,
    ),
  );
  const baseConcurrent = Math.max(
    1,
    Math.round(
      pickNumber(
        baseline?.sectorsConcurrent,
        pipeline?.sectorsConcurrent,
        pipeline?.sectorStrobing,
        pipelineAny?.activeSectors,
        baseStrobing,
      ) ?? baseStrobing,
    ),
  );
  const freqGHz =
    pickNumber(baseline?.modulationFreq_GHz, pipeline?.modulationFreq_GHz, 15) ?? 15;
  const baselineRho = clampToActiveGuard(
    pickNumber(
      pipelineAny?.pump?.rho,
      pipelineAny?.pump?.rho_est,
      pipelineAny?.rho,
      pipelineAny?.rho_est,
    ),
  );
  const targetRho =
    baselineRho != null
      ? Math.min(RHO_RECOVERY_TARGET, baselineRho * 0.85)
      : RHO_RECOVERY_TARGET;

  return enforceGuardLimits({
    dutyCycle: clamp01(baseDuty * 0.75),
    localBurstFrac: clamp01(baseBurst * 0.5),
    sectorStrobing: Math.max(1, Math.round(baseStrobing / 2)),
    sectorsConcurrent: Math.max(1, Math.round(baseConcurrent / 2)),
    modulationFreq_GHz: freqGHz,
    rhoTarget: targetRho,
  });
};

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return null;
  }
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
};

const hsvToRgbHex = (h: number, s: number, v: number) => {
  const hue = ((h % 1) + 1) % 1;
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  const toHex = (value: number) => {
    const hex = Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
    return hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export function useTimeLapseRecorder({
  canvas,
  overlayCanvas,
  overlayDom,
  overlayEnabled = false,
  durationMs = DEFAULT_DURATION_MS,
  fps = DEFAULT_FPS,
  sidecar,
}: RecorderOptions): RecorderReturn {
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1000 });
  const { data: metrics } = useMetrics(1500);
  const updatePipeline = useUpdatePipeline();

  const pipelineAny = pipeline as any;
  const metricsAny = metrics as any;

  const pipelineRef = useRef<typeof pipeline>(pipeline);
  const metricsRef = useRef<typeof metrics>(metrics);

  useEffect(() => {
    pipelineRef.current = pipeline;
  }, [pipeline]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  const [status, setStatus] = useState<TimeLapseStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState<TLFrame | null>(null);
  const [result, setResult] = useState<TimeLapseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (result?.videoUrl) URL.revokeObjectURL(result.videoUrl);
      if (result?.metricsUrl) URL.revokeObjectURL(result.metricsUrl);
    };
  }, [result]);

  const canvasRef = useRef<HTMLCanvasElement | null>(canvas);
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(overlayCanvas ?? null);
  useEffect(() => {
    overlayCanvasRef.current = overlayCanvas ?? null;
  }, [overlayCanvas]);

  const overlayDomRef = useRef<HTMLElement | null>(overlayDom ?? null);
  useEffect(() => {
    overlayDomRef.current = overlayDom ?? null;
  }, [overlayDom]);

  useEffect(() => {
    sidecarOptionsRef.current = sidecar;
  }, [sidecar]);

  const overlayHitRegionsRef = useRef<OverlayHitRegistry>({ blocks: [] });
  const overlayPayloadRef = useRef<OverlayPayload | null>(null);
  const overlayHighlightRef = useRef<OverlayBlockId | null>(null);
  const overlayDomGateRef = useRef<{ lastRender: number; lastHighlight: OverlayBlockId | null }>({
    lastRender: 0,
    lastHighlight: null,
  });
  const hudPayloadRef = useRef<HudPayload | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sweepSeriesRef = useRef<SweepSeriesEntry[]>([]);
  const sidecarOptionsRef = useRef<RecorderSidecarOptions | undefined>(sidecar);
  const activeSidecarRef = useRef<{ includeSweep: boolean }>({
    includeSweep: Boolean(sidecar?.includeSweep),
  });
  const frameMeterRef = useRef<FrameMeter | null>(null);
  const canvasTrackRef = useRef<CanvasCaptureMediaStreamTrack | null>(null);
  const restoreDomHudRef = useRef<(() => void) | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const pendingUiRef = useRef<{ progress: number; frame: TLFrame | null } | null>(null);
  const lastUiUpdateRef = useRef(0);

  const overlaySnapshot = useMemo(() => {
    const stored = queryClient.getQueryData(OVERLAY_STATE_QUERY_KEY);
    if (!stored || typeof stored !== "object") {
      return null;
    }
    const data = stored as Partial<{ mode: number; hue: number; phase01: number }>;
    return {
      mode: Number.isFinite(Number(data.mode)) ? Number(data.mode) : 0,
      hue: Number.isFinite(Number(data.hue)) ? Number(data.hue) : 0,
      phase01: Number.isFinite(Number(data.phase01)) ? Number(data.phase01) : 0,
    };
  }, []);

  const overlayStateRef = useRef<{ mode: number; hue: number; phase01: number }>({
    mode: overlaySnapshot?.mode ?? 0,
    hue: overlaySnapshot?.hue ?? 0,
    phase01: overlaySnapshot?.phase01 ?? 0,
  });

  useEffect(() => {
    const handlerId = subscribe("hull3d:overlay", (payload: any) => {
      const mode = Number.isFinite(Number(payload?.mode)) ? Number(payload.mode) : overlayStateRef.current.mode;
      const hue = Number.isFinite(Number(payload?.hue)) ? Number(payload.hue) : overlayStateRef.current.hue;
      const phase01 = Number.isFinite(Number(payload?.phase01))
        ? Number(payload.phase01)
        : overlayStateRef.current.phase01;
      const hueNorm = ((hue % 1) + 1) % 1;
      const phaseNorm = ((phase01 % 1) + 1) % 1;
      overlayStateRef.current = {
        mode,
        hue: hueNorm,
        phase01: phaseNorm,
      };
      queryClient.setQueryData(OVERLAY_STATE_QUERY_KEY, (prev) => {
        const prevData = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
        return {
          ...prevData,
          mode,
          hue: hueNorm,
          phase01: phaseNorm,
        };
      });
    });
    publish("hull3d:overlay:ping", { source: "time-lapse-init" });
    return () => {
      unsubscribe(handlerId);
    };
  }, [queryClient]);

  const overlayEnabledRef = useRef<boolean>(Boolean(overlayEnabled));
  useEffect(() => {
    overlayEnabledRef.current = Boolean(overlayEnabled);
    if (!overlayEnabled && overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      overlayCanvasRef.current.style.cursor = "default";
      overlayHighlightRef.current = null;
      overlayHitRegionsRef.current = { blocks: [] };
      overlayPayloadRef.current = null;
      if (overlayDomRef.current) {
        overlayDomRef.current.innerHTML = "";
        overlayDomRef.current.style.pointerEvents = "none";
        overlayDomRef.current.style.userSelect = "none";
        overlayDomRef.current.style.cursor = "default";
      }
    }
  }, [overlayEnabled]);

  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const devicePixelRatioRef = useRef<number>(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  const lightLoop = useLightCrossingLoop({
    sectorStrobing:
      pickNumber(
        pipeline?.sectorStrobing,
        pipeline?.sectorsConcurrent,
        pipelineAny?.lightCrossing?.sectorCount,
        metricsAny?.lightCrossing_sectorCount,
        1
      ) ?? 1,
    currentSector:
      pickNumber(
        pipeline?.currentSector,
        pipelineAny?.lightCrossing?.sectorIdx,
        metricsAny?.lightCrossing_sectorIndex,
        0
      ) ?? 0,
    sectorPeriod_ms:
      pickNumber(
        pipeline?.sectorPeriod_ms,
        pipelineAny?.lightCrossing?.dwell_ms,
        metricsAny?.lightCrossing_dwell_ms,
        1
      ) ?? 1,
    duty: pickNumber(pipeline?.dutyCycle, 0.1) ?? 0.1,
    freqGHz: pickNumber(pipeline?.modulationFreq_GHz, 15) ?? 15,
    localBurstFrac:
      pickNumber(pipeline?.localBurstFrac, pipeline?.dutyCycle, PROMOTED_WARP_PROFILE.dutyCycle) ??
      PROMOTED_WARP_PROFILE.dutyCycle,
  });

  const lightLoopRef = useRef(lightLoop);
  useEffect(() => {
    lightLoopRef.current = lightLoop;
  }, [lightLoop]);

  const baselineRef = useRef<Partial<EnergyPipelineState> | null>(null);
  const baselineMetricsRef = useRef<BaselineNarrative | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const framesRef = useRef<TLFrame[]>([]);
  const segmentsRef = useRef<ScenarioSegment[]>([]);
  const segmentIndexRef = useRef<number>(-1);
  const guardRecoveryScheduledRef = useRef<boolean>(false);
  const finishingRef = useRef<boolean>(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderPromiseRef = useRef<Promise<Blob> | null>(null);
  const recorderResolveRef = useRef<((blob: Blob) => void) | null>(null);
  const recorderRejectRef = useRef<((error: Error) => void) | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>("video/webm");
  const recorderStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
      }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
      }
      recorderRef.current = null;
      recorderPromiseRef.current = null;
      recorderResolveRef.current = null;
      recorderRejectRef.current = null;
      recorderChunksRef.current = [];
    };
  }, []);

  const cleanupRecorder = useCallback(() => {
    recorderRef.current = null;
    recorderPromiseRef.current = null;
    recorderResolveRef.current = null;
    recorderRejectRef.current = null;
    recorderChunksRef.current = [];
    recorderMimeTypeRef.current = "video/webm";
    if (recorderStreamRef.current) {
      recorderStreamRef.current.getTracks().forEach((track) => track.stop());
      recorderStreamRef.current = null;
    }
    canvasTrackRef.current = null;
    frameMeterRef.current = null;
    recordingStartedAtRef.current = null;
    hudPayloadRef.current = null;
    hudCtxRef.current = null;
    if (hudCanvasRef.current) {
      hudCanvasRef.current.width = 0;
      hudCanvasRef.current.height = 0;
      hudCanvasRef.current = null;
    }
    if (restoreDomHudRef.current) {
      restoreDomHudRef.current();
      restoreDomHudRef.current = null;
    }
  }, []);

  const getCanvasDimensions = useCallback(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const cssWidth = rect.width || canvasEl.clientWidth || canvasEl.width || 0;
    const cssHeight = rect.height || canvasEl.clientHeight || canvasEl.height || 0;
    const dpr = devicePixelRatioRef.current || 1;
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    return { cssWidth, cssHeight, pixelWidth, pixelHeight, dpr };
  }, []);

  const ensureOverlayCanvasSize = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return null;
    const dims = getCanvasDimensions();
    if (!dims) return null;
    if (overlayCanvas.width !== dims.pixelWidth || overlayCanvas.height !== dims.pixelHeight) {
      overlayCanvas.width = dims.pixelWidth;
      overlayCanvas.height = dims.pixelHeight;
    }
    overlayCanvas.style.width = `${dims.cssWidth}px`;
    overlayCanvas.style.height = `${dims.cssHeight}px`;
    return dims;
  }, [getCanvasDimensions]);

  const ensureCaptureCanvas = useCallback(() => {
    const dims = getCanvasDimensions();
    if (!dims) return null;
    let captureCanvas = captureCanvasRef.current;
    if (!captureCanvas) {
      captureCanvas = document.createElement("canvas");
      captureCanvasRef.current = captureCanvas;
    }
    let captureCtx = captureCtxRef.current;
    if (!captureCtx) {
      captureCtx = captureCanvas.getContext("2d", { alpha: false });
      captureCtxRef.current = captureCtx;
    }
    if (!captureCtx) {
      throw new Error("Failed to initialize capture surface.");
    }
    if (captureCanvas.width !== dims.pixelWidth || captureCanvas.height !== dims.pixelHeight) {
      captureCanvas.width = dims.pixelWidth;
      captureCanvas.height = dims.pixelHeight;
    }
    captureCanvas.style.width = `${dims.cssWidth}px`;
    captureCanvas.style.height = `${dims.cssHeight}px`;
    return { canvas: captureCanvas, ctx: captureCtx, dims };
  }, [getCanvasDimensions]);

  const flushUiUpdate = useCallback(
    (now: number, payload: { progress: number; frame: TLFrame | null }, force = false) => {
      pendingUiRef.current = payload;
      if (!force) {
        const minDelta = UI_UPDATE_INTERVAL_MS;
        if (now - lastUiUpdateRef.current < minDelta) {
          return;
        }
      }
      const data = pendingUiRef.current;
      if (!data) return;
      pendingUiRef.current = null;
      lastUiUpdateRef.current = now;
      ensureMicrotask(() => {
        setProgress(data.progress);
        if (data.frame) {
          setCurrentFrame(data.frame);
        }
      });
    },
    [setCurrentFrame, setProgress]
  );

  const renderOverlayDom = useCallback(
    (
      payload: OverlayPayload | null,
      highlight: OverlayBlockId | null,
      regions: OverlayDomRegion[],
      legendEntries: LegendEntry[],
      metrics: OverlayDomMetrics | null
    ) => {
      const root = overlayDomRef.current;
      if (!root) return;

      if (!payload || !overlayEnabledRef.current || !metrics) {
        root.innerHTML = "";
        root.style.pointerEvents = "none";
        root.style.userSelect = "none";
        root.style.cursor = "default";
        return;
      }

      root.style.position = "absolute";
      root.style.inset = "0";
      root.style.pointerEvents = "auto";
      root.style.userSelect = "text";
      root.style.cursor = "text";
      root.style.fontFamily = "\"Fira Sans\",\"Segoe UI\",sans-serif";
      root.style.fontSize = `${metrics.fontSizeCss.toFixed(2)}px`;
      const lineHeightRatio =
        metrics.lineHeightCss > 0 && metrics.fontSizeCss > 0
          ? Math.max(1.1, metrics.lineHeightCss / metrics.fontSizeCss)
          : 1.35;
      root.style.lineHeight = `${lineHeightRatio}`;
      root.style.fontWeight = "500";
      root.style.color = "#d6f4ff";
      root.style.mixBlendMode = "normal";

      const fragment = document.createDocumentFragment();
      const blockPadding = Math.max(6, metrics.paddingCss * 0.75);
      const borderRadius = Math.max(4, metrics.paddingCss * 0.35);
      const gap = Math.max(2, metrics.lineHeightCss * 0.15);
      const swatchSize = Math.max(6, metrics.swatchSizeCss);
      const blockShadow = "0 0 14px rgba(0, 0, 0, 0.35)";

      const blockStyles: Record<
        OverlayBlockId,
        { baseBg: string; baseColor: string; highlightBg: string; highlightColor: string }
      > = {
        header: {
          baseBg: "rgba(6, 14, 28, 0.65)",
          baseColor: "#f5fcff",
          highlightBg: "rgba(18, 40, 72, 0.85)",
          highlightColor: "#ffffff",
        },
        phase: {
          baseBg: "rgba(6, 14, 28, 0.65)",
          baseColor: "#eef9ff",
          highlightBg: "rgba(18, 40, 72, 0.85)",
          highlightColor: "#ffffff",
        },
        sweep: {
          baseBg: "rgba(6, 24, 44, 0.65)",
          baseColor: "#dff8ff",
          highlightBg: "rgba(12, 44, 74, 0.85)",
          highlightColor: "#ffffff",
        },
        delta: {
          baseBg: "rgba(38, 16, 32, 0.65)",
          baseColor: "#ffe3f5",
          highlightBg: "rgba(62, 28, 52, 0.85)",
          highlightColor: "#fff8fb",
        },
        legend: {
          baseBg: "rgba(6, 14, 28, 0.65)",
          baseColor: "#e2f3ff",
          highlightBg: "rgba(18, 36, 68, 0.9)",
          highlightColor: "#ffffff",
        },
        equations: {
          baseBg: "rgba(12, 26, 48, 0.65)",
          baseColor: "#cfe7ff",
          highlightBg: "rgba(20, 44, 80, 0.9)",
          highlightColor: "#f0f7ff",
        },
        "metrics-left": {
          baseBg: "rgba(6, 14, 28, 0.65)",
          baseColor: "#d6f4ff",
          highlightBg: "rgba(18, 36, 66, 0.9)",
          highlightColor: "#ffffff",
        },
        "metrics-right": {
          baseBg: "rgba(6, 14, 28, 0.65)",
          baseColor: "#d6f4ff",
          highlightBg: "rgba(18, 36, 66, 0.9)",
          highlightColor: "#ffffff",
        },
      };

      const findRegion = (role: OverlayDomRegionRole) =>
        regions.find((region) => region.role === role);

      const createLinesBlock = (
        id: OverlayBlockId,
        role: OverlayDomRegionRole,
        lines: string[]
      ) => {
        if (!lines.length) return;
        const region = findRegion(role);
        if (!region) return;
        const style = blockStyles[id];
        const isHighlighted = highlight === id;
        const block = document.createElement("div");
        block.dataset.blockId = id;
        block.style.position = "absolute";
        block.style.left = `${region.x.toFixed(2)}px`;
        block.style.top = `${region.y.toFixed(2)}px`;
        block.style.width = `${region.width.toFixed(2)}px`;
        block.style.minHeight = `${region.height.toFixed(2)}px`;
        block.style.padding = `${blockPadding}px`;
        block.style.borderRadius = `${borderRadius}px`;
        block.style.background = isHighlighted ? style.highlightBg : style.baseBg;
        block.style.color = isHighlighted ? style.highlightColor : style.baseColor;
        block.style.boxShadow = blockShadow;
        block.style.backdropFilter = "blur(4px)";
        block.style.display = "flex";
        block.style.flexDirection = "column";
        block.style.gap = `${gap}px`;
        block.style.whiteSpace = "pre-wrap";
        for (const line of lines) {
          const lineEl = document.createElement("div");
          lineEl.textContent = line;
          block.appendChild(lineEl);
        }
        fragment.appendChild(block);
      };

      const legendRegion = findRegion("legend");
      if (legendRegion && legendEntries.length) {
        const style = blockStyles.legend;
        const isHighlighted = highlight === "legend";
        const legendBlock = document.createElement("div");
        legendBlock.dataset.blockId = "legend";
        legendBlock.style.position = "absolute";
        legendBlock.style.left = `${legendRegion.x.toFixed(2)}px`;
        legendBlock.style.top = `${legendRegion.y.toFixed(2)}px`;
        legendBlock.style.width = `${legendRegion.width.toFixed(2)}px`;
        legendBlock.style.minHeight = `${legendRegion.height.toFixed(2)}px`;
        legendBlock.style.padding = `${blockPadding}px`;
        legendBlock.style.borderRadius = `${borderRadius}px`;
        legendBlock.style.background = isHighlighted ? style.highlightBg : style.baseBg;
        legendBlock.style.color = isHighlighted ? style.highlightColor : style.baseColor;
        legendBlock.style.boxShadow = blockShadow;
        legendBlock.style.backdropFilter = "blur(4px)";
        legendBlock.style.display = "flex";
        legendBlock.style.flexDirection = "column";
        legendBlock.style.gap = `${gap}px`;

        for (const entry of legendEntries) {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = `${Math.max(4, blockPadding * 0.5)}px`;

          const swatch = document.createElement("span");
          swatch.style.display = "inline-block";
          swatch.style.width = `${swatchSize}px`;
          swatch.style.height = `${swatchSize}px`;
          swatch.style.borderRadius = `${Math.max(2, swatchSize * 0.25)}px`;
          swatch.style.boxShadow = "0 0 6px rgba(0, 0, 0, 0.3)";
          if (entry.gradientStops && entry.gradientStops.length) {
            const gradient = entry.gradientStops
              .map(({ offset, color }) => `${color} ${(offset * 100).toFixed(1)}%`)
              .join(", ");
            swatch.style.background = `linear-gradient(90deg, ${gradient})`;
          } else {
            swatch.style.background = entry.swatch;
          }

          const label = document.createElement("span");
          label.textContent = entry.label;

          row.appendChild(swatch);
          row.appendChild(label);
          legendBlock.appendChild(row);
        }

        fragment.appendChild(legendBlock);
      }

      createLinesBlock("header", "header", payload.headerLines);
      createLinesBlock("phase", "phase", payload.phaseLines);
      createLinesBlock("sweep", "sweep", payload.sweepLines);
      createLinesBlock("delta", "delta", payload.deltaLines);
      createLinesBlock("equations", "equations", payload.equationLines);
      createLinesBlock("metrics-left", "metrics-left", payload.metricsLeft);
      createLinesBlock("metrics-right", "metrics-right", payload.metricsRight);

      root.replaceChildren(fragment);
    },
    []
  );

  const drawOverlayHud = useCallback(
    (
      segmentLabel: string,
      elapsedSeconds: number,
      metricLines: string[],
      phaseLines: string[],
      sweepLines: string[],
      deltaLines: string[],
      equationLines: string[],
      highlight: OverlayBlockId | null = null,
    ) => {
      const overlayCanvas = overlayCanvasRef.current;
      if (!overlayCanvas) return;

      const dims = ensureOverlayCanvasSize();
      const ctx = overlayCanvas.getContext("2d");
      if (!dims || !ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      const hits: OverlayHitRegistry = { blocks: [] };
      const domRegions: OverlayDomRegion[] = [];

      if (!overlayEnabledRef.current) {
        overlayHitRegionsRef.current = hits;
        overlayDomGateRef.current = { lastRender: 0, lastHighlight: null };
        renderOverlayDom(null, null, domRegions, [], null);
        ctx.restore();
        return;
      }

      const scale = overlayCanvas.width / Math.max(1, dims.cssWidth);
      const invScale = scale > 0 ? 1 / scale : 1;
      const padding = 12 * scale;
      const lineHeight = 18 * scale;
      const fontSize = 11 * scale;
      const boxWidth = Math.min(overlayCanvas.width - padding * 2, 340 * scale);

      ctx.font = `${fontSize}px "Fira Sans", "Segoe UI", sans-serif`;
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 6 * scale;

      const headerLines = [`Segment: ${segmentLabel}`, `t = ${elapsedSeconds.toFixed(2)} s`];
      const headerHeight = headerLines.length * lineHeight + padding;
      const headerRectHeight = headerHeight + padding * 0.25;
      ctx.fillStyle = highlight === "header" ? "rgba(14, 32, 64, 0.85)" : "rgba(6, 14, 28, 0.65)";
      ctx.fillRect(padding, padding, boxWidth, headerRectHeight);
      ctx.fillStyle = "#f5fcff";
      headerLines.forEach((line, idx) => {
        ctx.fillText(line, padding * 1.5, padding * 1.25 + idx * lineHeight);
      });
      hits.blocks.push({
        id: "header",
        x: padding,
        y: padding,
        width: boxWidth,
        height: headerRectHeight,
      });
      domRegions.push({
        id: "header",
        role: "header",
        x: padding * invScale,
        y: padding * invScale,
        width: boxWidth * invScale,
        height: headerRectHeight * invScale,
      });

      const blockSpacing = Math.max(padding, 8 * scale);
      const deltaExtraOffset = 30 * scale;
      let infoAnchorY = padding + headerHeight + blockSpacing;
      const drawInfoBlock = (
        id: OverlayBlockId,
        lines: string[],
        background: string,
        highlightBg: string,
        textColor: string,
        highlightText: string
      ) => {
        if (!lines.length) return;
        const blockWidth = Math.min(overlayCanvas.width - padding * 2, 340 * scale);
        const blockHeight = lines.length * lineHeight + padding;
        const blockX = padding;
        const blockY = infoAnchorY;
        const rectHeight = blockHeight + padding * 0.25;
        const isHighlighted = highlight === id;
        ctx.fillStyle = isHighlighted ? highlightBg : background;
        ctx.fillRect(blockX, blockY, blockWidth, rectHeight);
        ctx.fillStyle = isHighlighted ? highlightText : textColor;
        lines.forEach((line, idx) => {
          ctx.fillText(line, blockX + padding * 0.75, blockY + padding * 0.5 + idx * lineHeight);
        });
        hits.blocks.push({
          id,
          x: blockX,
          y: blockY,
          width: blockWidth,
          height: rectHeight,
        });
        domRegions.push({
          id,
          role: id,
          x: blockX * invScale,
          y: blockY * invScale,
          width: blockWidth * invScale,
          height: rectHeight * invScale,
        });
        infoAnchorY = blockY + blockHeight + blockSpacing;
      };

      drawInfoBlock("phase", phaseLines, "rgba(6, 14, 28, 0.65)", "rgba(18, 40, 72, 0.85)", "#eef9ff", "#ffffff");
      drawInfoBlock("sweep", sweepLines, "rgba(6, 24, 44, 0.65)", "rgba(12, 44, 74, 0.85)", "#dff8ff", "#ffffff");
      infoAnchorY += deltaExtraOffset;
      drawInfoBlock("delta", deltaLines, "rgba(38, 16, 32, 0.65)", "rgba(62, 28, 52, 0.85)", "#ffe3f5", "#fff8fb");

      const legendEntries: LegendEntry[] = [
        { label: "Expansion spike", swatch: "#f8e96b" },
        { label: "Contraction spike", swatch: "#61dbff" },
        { label: "I,_GR warm baseline", swatch: "#f97316" },
        { label: "I,_GR cool baseline", swatch: "#2563eb" },
      ];

      const legendWidth = Math.min(overlayCanvas.width - padding * 2, 260 * scale);
      const legendHeight = legendEntries.length * lineHeight + padding;
      const legendX = overlayCanvas.width - legendWidth - padding;
      const legendY = padding + headerHeight + blockSpacing;
      const legendRectHeight = legendHeight + padding * 0.25;
      const legendHighlighted = highlight === "legend";
      ctx.fillStyle = legendHighlighted ? "rgba(18, 36, 68, 0.9)" : "rgba(6, 14, 28, 0.65)";
      ctx.fillRect(legendX, legendY, legendWidth, legendRectHeight);
      const swatchSize = 10 * scale;
      legendEntries.forEach((entry, idx) => {
        const y = legendY + padding * 0.5 + idx * lineHeight;
        const swatchX = legendX + padding * 0.75;
        const swatchY = y + swatchSize * 0.2;
        const swatchWidth = entry.gradientStops ? Math.max(swatchSize * 2.5, 24 * scale) : swatchSize;
        if (entry.gradientStops && entry.gradientStops.length) {
          const gradient = ctx.createLinearGradient(swatchX, swatchY, swatchX + swatchWidth, swatchY);
          entry.gradientStops.forEach(({ offset, color }) => {
            gradient.addColorStop(Math.min(1, Math.max(0, offset)), color);
          });
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = entry.swatch;
        }
        ctx.fillRect(swatchX, swatchY, swatchWidth, swatchSize);
        ctx.fillStyle = legendHighlighted ? "#ffffff" : "#e2f3ff";
        ctx.fillText(entry.label, swatchX + swatchWidth + padding * 0.6, y);
      });
      hits.blocks.push({
        id: "legend",
        x: legendX,
        y: legendY,
        width: legendWidth,
        height: legendRectHeight,
      });
      // We draw the legend separately in the DOM layer, but keep the pixel bounds for hover.
      domRegions.push({
        id: "legend",
        role: "legend",
        x: legendX * invScale,
        y: legendY * invScale,
        width: legendWidth * invScale,
        height: legendRectHeight * invScale,
      });

      if (equationLines.length) {
        const equationsWidth = Math.min(overlayCanvas.width - padding * 2, 260 * scale);
        const equationsHeight = equationLines.length * lineHeight + padding;
        const equationsX = overlayCanvas.width - equationsWidth - padding;
        const equationsY = legendY + legendRectHeight + padding * 0.75;
        const equationsRectHeight = equationsHeight + padding * 0.25;
        const equationsHighlighted = highlight === "equations";
        ctx.fillStyle = equationsHighlighted ? "rgba(20, 44, 80, 0.9)" : "rgba(12, 26, 48, 0.65)";
        ctx.fillRect(equationsX, equationsY, equationsWidth, equationsRectHeight);
        ctx.fillStyle = equationsHighlighted ? "#f0f7ff" : "#cfe7ff";
        equationLines.forEach((line, idx) => {
          ctx.fillText(line, equationsX + padding * 0.75, equationsY + padding * 0.5 + idx * lineHeight);
        });
        hits.blocks.push({
          id: "equations",
          x: equationsX,
          y: equationsY,
          width: equationsWidth,
          height: equationsRectHeight,
        });
        domRegions.push({
          id: "equations",
          role: "equations",
          x: equationsX * invScale,
          y: equationsY * invScale,
          width: equationsWidth * invScale,
          height: equationsRectHeight * invScale,
        });
      }

      const mid = Math.ceil(metricLines.length / 2);
      const leftMetrics = metricLines.slice(0, mid);
      const rightMetrics = metricLines.slice(mid);

      const drawMetricColumn = (lines: string[], anchor: "left" | "right", id: OverlayBlockId) => {
        if (!lines.length) return;
        const columnWidth = Math.min(boxWidth, overlayCanvas.width / 2 - padding * 1.5);
        const height = lines.length * lineHeight + padding;
        const rectHeight = height + padding * 0.25;
        const x = anchor === "left" ? padding : overlayCanvas.width - columnWidth - padding;
        const y = overlayCanvas.height - height - padding;
        const isHighlighted = highlight === id;
        ctx.fillStyle = isHighlighted ? "rgba(18, 36, 66, 0.9)" : "rgba(6, 14, 28, 0.65)";
        ctx.fillRect(x, y, columnWidth, rectHeight);
        ctx.fillStyle = isHighlighted ? "#ffffff" : "#d6f4ff";
        lines.forEach((line, idx) => {
          ctx.fillText(line, x + padding * 0.75, y + padding * 0.5 + idx * lineHeight);
        });
        hits.blocks.push({
          id,
          x,
          y,
          width: columnWidth,
          height: rectHeight,
        });
        domRegions.push({
          id,
          role: id,
          x: x * invScale,
          y: y * invScale,
          width: columnWidth * invScale,
          height: rectHeight * invScale,
        });
      };

      drawMetricColumn(leftMetrics, "left", "metrics-left");
      drawMetricColumn(rightMetrics, "right", "metrics-right");

      ctx.restore();
      overlayHitRegionsRef.current = hits;
      const gate = overlayDomGateRef.current;
      const now = performance.now();
      const highlightChanged = gate.lastHighlight !== highlight;
      if (highlightChanged) {
        gate.lastHighlight = highlight;
      }
      if (highlightChanged || now - gate.lastRender >= UI_UPDATE_INTERVAL_MS) {
        gate.lastRender = now;
        renderOverlayDom(
          {
            segmentLabel,
            elapsedSeconds,
            headerLines,
            phaseLines,
            sweepLines,
            deltaLines,
            metricsLeft: leftMetrics,
            metricsRight: rightMetrics,
            equationLines,
          },
          highlight,
          domRegions,
          legendEntries,
          {
            paddingCss: padding * invScale,
            lineHeightCss: lineHeight * invScale,
            fontSizeCss: fontSize * invScale,
            swatchSizeCss: swatchSize * invScale,
          }
        );
      }
    },
    [ensureOverlayCanvasSize, renderOverlayDom]
  );

  const redrawOverlay = useCallback(() => {
    const payload = overlayPayloadRef.current;
    if (!payload) return;
    drawOverlayHud(
      payload.segmentLabel,
      payload.elapsedSeconds,
      [...payload.metricsLeft, ...payload.metricsRight],
      payload.phaseLines,
      payload.sweepLines,
      payload.deltaLines,
      payload.equationLines,
      overlayHighlightRef.current
    );
  }, [drawOverlayHud]);

  useEffect(() => {
    const dom = overlayDomRef.current;
    if (dom) {
      const handlePointerMove = (event: PointerEvent) => {
        if (!overlayEnabledRef.current) return;
        if (!overlayPayloadRef.current) return;
        const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-block-id]");
        const nextHighlight = (target?.dataset.blockId as OverlayBlockId | undefined) ?? null;
        if (nextHighlight !== overlayHighlightRef.current) {
          overlayHighlightRef.current = nextHighlight;
          redrawOverlay();
        }
      };

      const handlePointerLeave = () => {
        if (overlayHighlightRef.current != null) {
          overlayHighlightRef.current = null;
          redrawOverlay();
        }
      };

      dom.addEventListener("pointermove", handlePointerMove);
      dom.addEventListener("pointerleave", handlePointerLeave);
      return () => {
        dom.removeEventListener("pointermove", handlePointerMove);
        dom.removeEventListener("pointerleave", handlePointerLeave);
      };
    }

    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!overlayEnabledRef.current) return;
      if (!overlayPayloadRef.current) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const hit = overlayHitRegionsRef.current.blocks.find(
        (block) =>
          x >= block.x &&
          x <= block.x + block.width &&
          y >= block.y &&
          y <= block.y + block.height
      );
      const nextHighlight = hit?.id ?? null;
      if (nextHighlight !== overlayHighlightRef.current) {
        overlayHighlightRef.current = nextHighlight;
        canvas.style.cursor = nextHighlight ? "pointer" : "default";
        redrawOverlay();
      } else if (!nextHighlight) {
        canvas.style.cursor = "default";
      }
    };

    const handlePointerLeave = () => {
      if (overlayHighlightRef.current != null) {
        overlayHighlightRef.current = null;
        canvas.style.cursor = "default";
        redrawOverlay();
      }
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [overlayDom, overlayCanvas, redrawOverlay]);

  const compositeFrameForRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") {
      return;
    }

    const baseCanvas = canvasRef.current;
    if (!baseCanvas) return;
    const capture = ensureCaptureCanvas();
    if (!capture || !capture.ctx) return;
    const { canvas: captureCanvas, ctx } = capture;

    let hudCanvas = hudCanvasRef.current;
    let hudCtx = hudCtxRef.current;
    if (!hudCanvas || !hudCtx || hudCanvas.width !== captureCanvas.width || hudCanvas.height !== captureCanvas.height) {
      const created = makeHudCanvas(captureCanvas.width, captureCanvas.height);
      if (created.ctx) {
        hudCanvas = created.canvas;
        hudCtx = created.ctx;
        hudCanvasRef.current = hudCanvas;
        hudCtxRef.current = hudCtx;
      } else {
        hudCanvasRef.current = null;
        hudCtxRef.current = null;
        hudCanvas = null;
        hudCtx = null;
      }
    }

    if (hudCanvas && hudCtx) {
      const payload = hudPayloadRef.current;
      if (payload) {
        drawHud(hudCtx, payload);
      } else {
        hudCtx.clearRect(0, 0, hudCtx.canvas.width, hudCtx.canvas.height);
      }
    }

    ctx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
    ctx.drawImage(baseCanvas, 0, 0, captureCanvas.width, captureCanvas.height);

    if (hudCanvasRef.current) {
      ctx.drawImage(hudCanvasRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
    } else if (overlayEnabledRef.current && overlayCanvasRef.current) {
      ctx.drawImage(overlayCanvasRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
    }

    const track = canvasTrackRef.current;
    if (track && typeof track.requestFrame === "function") {
      try {
        track.requestFrame();
      } catch {
        // ignore requestFrame failures (Safari, etc.)
      }
    }

    frameMeterRef.current?.push(performance.now());
  }, [ensureCaptureCanvas]);

  useEffect(() => {
    if (status === "recording" || status === "processing") {
      compositeFrameForRecording();
    }
  }, [overlayEnabled, compositeFrameForRecording, status]);

  const startRecorder = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      return;
    }

    const canvasEl = canvasRef.current;
    if (!canvasEl) {
      throw new Error("Hull renderer not ready - open the 3D view first.");
    }

    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
      throw new Error("Browser cannot encode the canvas stream (no supported MIME type).");
    }

    const capture = ensureCaptureCanvas();
    if (!capture) {
      throw new Error("Unable to initialize capture surface.");
    }

    const stream = capture.canvas.captureStream(fps);
    recorderStreamRef.current = stream;
    recorderMimeTypeRef.current = mimeType;
    recorderChunksRef.current = [];
    frameMeterRef.current = new FrameMeter(fps);

    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      canvasTrackRef.current = videoTrack as CanvasCaptureMediaStreamTrack;
      try {
        const constraints: MediaTrackConstraints = {
          frameRate: { ideal: fps, max: fps },
        };
        await videoTrack.applyConstraints?.(constraints);
      } catch {
        // Best-effort only; not all browsers support applying constraints to canvas tracks.
      }
    } else {
      canvasTrackRef.current = null;
    }

    recorderPromiseRef.current = new Promise<Blob>((resolve, reject) => {
      recorderResolveRef.current = resolve;
      recorderRejectRef.current = reject;
    });

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recorderChunksRef.current.push(event.data);
      }
    });

    recorder.addEventListener("stop", () => {
      const type = recorderMimeTypeRef.current || "video/webm";
      const chunks = recorderChunksRef.current.slice();
      const blob = new Blob(chunks, { type });
      recorderResolveRef.current?.(blob);
      cleanupRecorder();
    });

    recorder.addEventListener("error", (event) => {
      const errEvent = event as unknown as { error?: unknown; message?: string };
      const errorLike = errEvent?.error;
      const knownError = errorLike instanceof Error ? errorLike : undefined;
      const derivedMessage =
        knownError?.message ??
        (typeof errorLike === "object" && errorLike && "message" in errorLike
          ? String((errorLike as { message?: unknown }).message ?? "")
          : undefined) ??
        errEvent?.message ??
        "MediaRecorder failure";

      recorderRejectRef.current?.(knownError ?? new Error(derivedMessage));
      cleanupRecorder();
    });

    const domRoot = overlayDomRef.current;
    if (domRoot) {
      const previousVisibility = domRoot.style.visibility;
      domRoot.style.visibility = "hidden";
      restoreDomHudRef.current = () => {
        domRoot.style.visibility = previousVisibility;
      };
    } else {
      restoreDomHudRef.current = null;
    }

    hudCanvasRef.current = null;
    hudCtxRef.current = null;
    recorder.start();
    recorderRef.current = recorder;
    recordingStartedAtRef.current = performance.now();
    compositeFrameForRecording();
  }, [cleanupRecorder, compositeFrameForRecording, ensureCaptureCanvas, fps]);

  const stopRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    const promise = recorderPromiseRef.current;
    if (!recorder || !promise) {
      return null;
    }
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        recorderRejectRef.current?.(err instanceof Error ? err : new Error(String(err)));
        cleanupRecorder();
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
    try {
      return await promise;
    } finally {
      cleanupRecorder();
    }
  }, [cleanupRecorder]);

  const reset = useCallback(() => {
    if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    void (async () => {
      try {
        await stopRecorder();
      } catch {
        // ignore
      }
    })();
    framesRef.current = [];
    sweepSeriesRef.current = [];
    activeSidecarRef.current = {
      includeSweep: Boolean(sidecarOptionsRef.current?.includeSweep),
    };
    segmentsRef.current = [];
    segmentIndexRef.current = -1;
    guardRecoveryScheduledRef.current = false;
    finishingRef.current = false;
    baselineRef.current = null;
    baselineMetricsRef.current = null;
    overlayPayloadRef.current = null;
    overlayHitRegionsRef.current = { blocks: [] };
    overlayHighlightRef.current = null;
    hudPayloadRef.current = null;
    pendingUiRef.current = null;
    lastUiUpdateRef.current = 0;
    overlayDomGateRef.current = { lastRender: 0, lastHighlight: null };
    hudCanvasRef.current = null;
    hudCtxRef.current = null;
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      overlayCanvasRef.current.style.cursor = "default";
    }
    if (overlayDomRef.current) {
      overlayDomRef.current.innerHTML = "";
      overlayDomRef.current.style.pointerEvents = "none";
      overlayDomRef.current.style.userSelect = "none";
      overlayDomRef.current.style.cursor = "default";
    }
    if (captureCtxRef.current && captureCanvasRef.current) {
      captureCtxRef.current.clearRect(0, 0, captureCanvasRef.current.width, captureCanvasRef.current.height);
    }
    setStatus("idle");
    setProgress(0);
    setCurrentFrame(null);
    setResult(null);
    setError(null);
  }, [stopRecorder]);

  const revertBaseline = useCallback(async () => {
    const baseline = baselineRef.current;
    if (!baseline) return;
    try {
      await updatePipeline.mutateAsync(baseline);
    } catch (err) {
      console.error("[TimeLapse] Failed to restore baseline pipeline", err);
    }
  }, [updatePipeline]);

  const prepareSegments = useCallback((state: EnergyPipelineState | undefined, duration: number): ScenarioSegment[] => {
    const stateAny = state as any;
    const total = Math.max(
      1,
      Math.round(
        pickNumber(
          state?.sectorsTotal,
          state?.sectorCount,
          state?.tiles?.total,
          stateAny?.lightCrossing?.sectorCount,
          400
        ) ?? PROMOTED_WARP_PROFILE.sectorCount
      )
    );
    const baseDuty = pickNumber(state?.dutyCycle, 0.14) ?? 0.14;
    const baseBurst = clamp01(
      pickNumber(state?.localBurstFrac, state?.dutyCycle, PROMOTED_WARP_PROFILE.dutyCycle) ??
        PROMOTED_WARP_PROFILE.dutyCycle
    );
    const baseConcurrent = Math.max(
      1,
      Math.round(
        pickNumber(
          state?.sectorsConcurrent,
          state?.sectorStrobing,
          state?.activeSectors,
          stateAny?.lightCrossing?.activeSectors,
          1
        ) ?? 1
      )
    );
    const freqGHz = pickNumber(state?.modulationFreq_GHz, 15) ?? 15;
    const chunk = duration / 3;

    const { sweepLast, fallback } = resolveSweepContext(state);
    const baselineRho = clampToActiveGuard(
      pickNumber(
        sweepLast?.pumpRatio,
        fallback?.pumpRatio,
        stateAny?.pump?.rho,
        stateAny?.pump?.rho_est,
        stateAny?.rho,
        stateAny?.rho_est,
      ),
    );
    const stableRhoTarget =
      baselineRho ?? clampToActiveGuard(baseDuty) ?? Math.max(0, RHO_ACTIVE_LIMIT * 0.6);
    const edgeRhoTarget = Math.min(
      RHO_ACTIVE_LIMIT,
      (baselineRho ?? stableRhoTarget ?? RHO_ACTIVE_LIMIT * 0.7) + 0.05,
    );
    const recoveryRhoTarget = Math.min(
      RHO_RECOVERY_TARGET,
      stableRhoTarget != null ? stableRhoTarget * 0.9 : RHO_RECOVERY_TARGET,
    );

    const stableParams = enforceGuardLimits({
      dutyCycle: baseDuty,
      localBurstFrac: baseBurst,
      sectorStrobing: baseConcurrent,
      sectorsConcurrent: baseConcurrent,
      modulationFreq_GHz: freqGHz,
      rhoTarget: stableRhoTarget,
    });

    const edgeParams = enforceGuardLimits({
      dutyCycle: Math.min(RHO_ACTIVE_LIMIT, baseDuty * 1.35),
      localBurstFrac: Math.min(RHO_ACTIVE_LIMIT, Math.max(baseBurst, baseBurst * 2.5)),
      sectorStrobing: Math.max(1, Math.round(total / 10)),
      sectorsConcurrent: Math.max(1, Math.round(total / 10)),
      modulationFreq_GHz: freqGHz,
      rhoTarget: edgeRhoTarget,
    });

    const recoveryParams = enforceGuardLimits({
      dutyCycle: clamp01(Math.min(baseDuty, RHO_RECOVERY_TARGET)),
      localBurstFrac: clamp01(Math.min(baseBurst, baseBurst * 0.75)),
      sectorStrobing: Math.max(1, Math.round(total / 32)),
      sectorsConcurrent: Math.max(1, Math.round(total / 32)),
      modulationFreq_GHz: freqGHz,
      rhoTarget: recoveryRhoTarget,
    });

    const segments: ScenarioSegment[] = [
      {
        key: "stable",
        label: "Stable (TS >> 1)",
        startMs: 0,
        endMs: chunk,
        params: stableParams,
      },
      {
        key: "edge",
        label: "Near edge (rho*cos(phi) -> 0.95)",
        startMs: chunk,
        endMs: chunk * 2,
        params: edgeParams,
      },
      {
        key: "recovery",
        label: "Recovery (1/32 fanout)",
        startMs: chunk * 2,
        endMs: duration,
        params: recoveryParams,
      },
    ];
    return segments;
  }, []);

  const activeSegmentFor = useCallback((elapsedMs: number) => {
    const list = segmentsRef.current;
    if (list.length === 0) return null;
    for (let i = 0; i < list.length; i++) {
      const seg = list[i];
      if (elapsedMs >= seg.startMs && elapsedMs < seg.endMs) return { segment: seg, index: i };
    }
    return { segment: list[list.length - 1], index: list.length - 1 };
  }, []);

  const applySegment = useCallback(
    (segment: ScenarioSegment | null) => {
      if (!segment) return;
      const pipelineState = pipelineRef.current;
      const paramsClone: Record<string, unknown> = {
        ...(segment.params ?? {}),
      };

      let pumpUpdate: Record<string, unknown> | null = null;
      if (pipelineState) {
        const { sweepLast, fallback } = resolveSweepContext(pipelineState);
        const pipelineAny = pipelineState as any;
        const pumpGHz = pickSweepNumber(
          (segment.params as any)?.modulationFreq_GHz,
          sweepLast?.Omega_GHz,
          fallback?.Omega_GHz,
          pipelineAny?.pump?.Omega_GHz,
          pipelineState.modulationFreq_GHz,
        );
        if (pumpGHz != null && Number.isFinite(pumpGHz)) {
          const detuneMHz = pickSweepNumber(
            sweepLast?.detune_MHz,
            fallback?.detune_MHz,
            pipelineAny?.pump?.detune_MHz,
            pipelineAny?.pump?.detuneMHz,
            pipelineAny?.pump?.detune_Hz != null ? pipelineAny.pump.detune_Hz / 1e6 : null,
          );
          const correctedGHz =
            detuneMHz != null && Number.isFinite(detuneMHz)
              ? pumpGHz - detuneMHz / 1e3
              : pumpGHz;
          if (Number.isFinite(correctedGHz)) {
            paramsClone.modulationFreq_GHz = correctedGHz;
            const correctedHz = correctedGHz * 1e9;
            const pumpExisting =
              typeof pipelineAny?.pump === "object" && pipelineAny?.pump !== null
                ? { ...pipelineAny.pump }
                : {};
            pumpUpdate = {
              ...pumpExisting,
              Omega_GHz: correctedGHz,
              Omega_Hz: correctedHz,
              freq_GHz: correctedGHz,
              freq_Hz: correctedHz,
              detune_MHz: 0,
              detune_Hz: 0,
              detuneMHz: 0,
              detuneHz: 0,
            };
          }
        }
      }

      const guarded = enforceGuardLimits(paramsClone as Partial<EnergyPipelineState>);
      if (pumpUpdate) {
        (guarded as any).pump = pumpUpdate;
      }
      updatePipeline.mutate(guarded as Partial<EnergyPipelineState>);
    },
    [updatePipeline]
  );

  const ensureBaseline = useCallback(() => {
    if (baselineRef.current) return baselineRef.current;
    const state = pipelineRef.current;
    if (!state) return null;
    baselineRef.current = {
      dutyCycle: state.dutyCycle,
      localBurstFrac: state.localBurstFrac,
      sectorStrobing: state.sectorStrobing,
      sectorsConcurrent: state.sectorsConcurrent,
      qSpoilingFactor: state.qSpoilingFactor,
      modulationFreq_GHz: state.modulationFreq_GHz,
    };
    return baselineRef.current;
  }, []);

  const collectFrame = useCallback(
    async (elapsedMs: number, segment: ScenarioSegment | null): Promise<TLFrame | null> => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return null;
      const pipelineState = pipelineRef.current;
      const metricsState = metricsRef.current;
      const loop = lightLoopRef.current;
      const hullState = useHull3DSharedStore.getState();
      const pipelineAnyState = pipelineState as any;
      const metricsAnyState = metricsState as any;
      const loopAny = loop as any;
      const phaseState = hullState.phase;
      const sectorState = hullState.sector;
      const sectorAlphaArray = Array.from(sectorState?.weightsInstant ?? []);

      const tauLC_ms =
        pickNumber(loopAny?.tauLC_ms, pipelineState?.tau_LC_ms, pipelineAnyState?.lightCrossing?.tauLC_ms) ?? null;
      const dwell_ms =
        pickNumber(loopAny?.dwell_ms, pipelineState?.sectorPeriod_ms, pipelineState?.dwell_ms) ?? null;
      const burst_ms =
        pickNumber(loopAny?.burst_ms, pipelineState?.burst_ms, pipelineAnyState?.lightCrossing?.burst_ms) ?? null;
      const freqHz =
        pickNumber(
          pipelineAnyState?.modulationFreq_Hz,
          pipelineState?.modulationFreq_GHz != null ? pipelineState.modulationFreq_GHz * 1e9 : null,
          metricsAnyState?.timescales?.f_m_Hz
        ) ?? null;
      const T_mod_ms = freqHz && freqHz > 0 ? (1_000 / freqHz) : null;

      const TS =
        pickNumber(
          pipelineState?.TS_ratio,
          metricsAnyState?.timeScaleRatio,
          metricsAnyState?.timescales?.TS_long,
          tauLC_ms != null && T_mod_ms != null ? tauLC_ms / T_mod_ms : null
        ) ?? null;

      const totalSectors =
        pickNumber(
          pipelineState?.sectorsTotal,
          pipelineState?.sectorCount,
          pipelineAnyState?.lightCrossing?.sectorCount,
          metricsAnyState?.lightCrossing_sectorCount
        ) ?? null;
      const liveSectors =
        pickNumber(
          pipelineState?.sectorsConcurrent,
          pipelineState?.sectorStrobing,
          pipelineState?.activeSectors,
          metricsAnyState?.sectorStrobing
        ) ?? null;
      const localBurst =
        pickNumber(
          pipelineState?.localBurstFrac,
          loopAny?.burst_ms && loopAny?.dwell_ms ? clamp01(loopAny.burst_ms / loopAny.dwell_ms) : null
        ) ?? null;
      const dEff =
        totalSectors && liveSectors && localBurst != null
          ? clamp01(localBurst * (liveSectors / totalSectors))
          : null;

      const phase01 = Number.isFinite(Number(phaseState?.phase01)) ? Number(phaseState?.phase01) : null;
      const phaseDeg = phase01 != null ? (((phase01 % 1) + 1) % 1) * 360 : null;
      let wedgeSpanDeg: number | null = null;
      if (phaseState?.dutyWindow && Array.isArray(phaseState.dutyWindow) && phaseState.dutyWindow.length === 2) {
        const start = Number(phaseState.dutyWindow[0]);
        const end = Number(phaseState.dutyWindow[1]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          let span = end - start;
          if (!Number.isFinite(span)) span = 0;
          if (span < 0) span += 1;
          wedgeSpanDeg = Math.max(0, Math.min(1, span)) * 360;
        }
      }
      if ((wedgeSpanDeg == null || !Number.isFinite(wedgeSpanDeg)) && sectorAlphaArray.length) {
        const totalCount = sectorAlphaArray.length;
        const activeCount = sectorAlphaArray.filter((value) => value > 0.2).length;
        if (activeCount > 0) {
          wedgeSpanDeg = (activeCount / totalCount) * 360;
        }
      }

      const rho =
        pickNumber(
          pipelineAnyState?.rho,
          pipelineAnyState?.rho_est,
          pipelineAnyState?.rhoRaw,
          pipelineAnyState?.pump?.rho,
          pipelineAnyState?.pump?.rho_est,
          metricsAnyState?.rho_est
        ) ?? null;
      const qL =
        pickNumber(
          pipelineState?.qCavity,
          pipelineState?.qMechanical,
          pipelineState?.qSpoilingFactor,
          metricsAnyState?.gammaVanDenBroeck
        ) ?? null;
      const qiMargin =
        pickNumber(
          pipelineAnyState?.qi?.margin,
          pipelineAnyState?.qiMargin,
          metricsAnyState?.qi?.margin
        ) ?? null;
      const qiOk = qiMargin == null ? true : qiMargin > 0;
      const burstVsTau =
        tauLC_ms != null && burst_ms != null ? burst_ms + 1e-6 >= tauLC_ms : false;
      const tsOk = TS != null ? TS >= PASS_TS_THRESHOLD : false;

      const shellOffset =
        pickNumber(
          hullState.physics?.thetaUsed,
          hullState.physics?.thetaExpected
        );

      if (!baselineMetricsRef.current) {
        baselineMetricsRef.current = {
          rho,
          dEff,
          TS,
        };
      }
      const baselineNarrative = baselineMetricsRef.current;
      const deltaRho =
        baselineNarrative?.rho != null && rho != null ? rho - baselineNarrative.rho : null;
      const deltaTS =
        baselineNarrative?.TS != null && TS != null ? TS - baselineNarrative.TS : null;
      const deltaDEff =
        baselineNarrative?.dEff != null && dEff != null ? dEff - baselineNarrative.dEff : null;

      const sweepRuntime = pipelineAnyState?.sweep ?? null;
      const sweepLast = (sweepRuntime?.last ?? null) as SweepPoint | null;
      const sweepResults = Array.isArray(pipelineAnyState?.vacuumGapSweepResults)
        ? (pipelineAnyState.vacuumGapSweepResults as SweepPoint[])
        : [];
      const sweepTop = Array.isArray(sweepRuntime?.top) && sweepRuntime.top.length
        ? (sweepRuntime.top[0] as SweepPoint)
        : null;
      const fallbackSweepRow =
        sweepLast ??
        sweepTop ??
        (sweepResults.length ? sweepResults[sweepResults.length - 1] : null);

      const sweepIter = asFiniteNumber(sweepRuntime?.iter);
      const sweepTotal = asFiniteNumber(sweepRuntime?.total);

      const gapNm = pickSweepNumber(sweepLast?.d_nm, fallbackSweepRow?.d_nm, pipelineState?.gap_nm);
      const depthFrac = pickSweepNumber(
        sweepLast?.m,
        fallbackSweepRow?.m,
        pipelineState?.localBurstFrac,
        pipelineState?.dutyCycle
      );
      const phaseDegSweep = pickSweepNumber(
        sweepLast?.phi_deg,
        fallbackSweepRow?.phi_deg,
        pipelineAnyState?.pumpPhase_deg,
        phaseDeg
      );
      const pumpGHz = pickSweepNumber(
        sweepLast?.Omega_GHz,
        fallbackSweepRow?.Omega_GHz,
        pipelineAnyState?.pump?.Omega_GHz,
        pipelineState?.modulationFreq_GHz
      );
      const detuneMHz = pickSweepNumber(
        sweepLast?.detune_MHz,
        fallbackSweepRow?.detune_MHz,
        pipelineAnyState?.pump?.detune_MHz
      );
      const kappaMHz = pickSweepNumber(
        sweepLast?.kappa_MHz,
        fallbackSweepRow?.kappa_MHz,
        pipelineAnyState?.pump?.kappa_MHz,
        pipelineAnyState?.pump?.kappa_Hz ? pipelineAnyState.pump.kappa_Hz / 1e6 : null
      );
      const kappaEffMHz = pickSweepNumber(
        sweepLast?.kappaEff_MHz,
        fallbackSweepRow?.kappaEff_MHz,
        pipelineAnyState?.pump?.kappaEff_MHz,
        pipelineAnyState?.pump?.kappa_eff_MHz,
        pipelineAnyState?.pump?.kappaEff_Hz ? pipelineAnyState.pump.kappaEff_Hz / 1e6 : null
      );
      const pumpRatio = pickSweepNumber(
        sweepLast?.pumpRatio,
        fallbackSweepRow?.pumpRatio,
        pipelineAnyState?.pump?.rho,
        pipelineAnyState?.pump?.rho_est,
        pipelineAnyState?.pumpRatio
      );
      const qlValue = pickSweepNumber(sweepLast?.QL, fallbackSweepRow?.QL, qL);
      const quadratureDb = pickSweepNumber(
        sweepLast?.G,
        fallbackSweepRow?.G,
        pipelineAnyState?.pump?.G
      );

      const sweepStatusRaw =
        sweepRuntime?.cancelled
          ? "CANCELLED"
          : sweepRuntime?.completedAt
            ? "COMPLETE"
            : sweepRuntime?.active
              ? "RUNNING"
              : sweepRuntime?.status
                ? sweepRuntime.status.toUpperCase()
                : STRING_FALLBACK;
      const fallbackStatus = fallbackSweepRow?.status ?? (fallbackSweepRow?.stable != null
        ? fallbackSweepRow.stable
          ? "PASS"
          : "WARN"
        : null);
      const sweepStatus =
        sweepLast != null && formatStatus(sweepLast) !== STRING_FALLBACK
          ? formatStatus(sweepLast)
          : sweepStatusRaw !== STRING_FALLBACK
            ? sweepStatusRaw
            : fallbackStatus ?? STRING_FALLBACK;
      const sweepGuardSummary = summarizeSweepGuard(sweepLast ?? fallbackSweepRow);
      const sweepStatusDisplay =
        sweepGuardSummary && sweepStatus === "UNSTABLE" ? "WARN" : sweepStatus;

      const sweepLines: string[] = [];
      if (sweepIter != null || sweepTotal != null) {
        const iterText = sweepIter != null ? sweepIter.toLocaleString() : "?";
        const totalText = sweepTotal != null ? sweepTotal.toLocaleString() : "?";
        sweepLines.push(`step ${iterText}/${totalText}`);
      }
      sweepLines.push(`gap ${formatNumber(gapNm, 0, " nm")}`);
      sweepLines.push(`depth ${formatPercent(depthFrac, 2)}`);
      sweepLines.push(`phase ${formatDegrees(phaseDegSweep)}`);
      sweepLines.push(`pump ${formatNumber(pumpGHz, 3, " GHz")}`);
      sweepLines.push(`detune ${formatSigned(detuneMHz, 3, " MHz")}`);
      sweepLines.push(`kappa ${formatKappa(kappaMHz)}`);
      const kappaEffText =
        kappaEffMHz == null && sweepStatus === "UNSTABLE"
          ? "THRESHOLD"
          : formatKappa(kappaEffMHz);
      sweepLines.push(`kappa_eff ${kappaEffText}`);
      sweepLines.push(`rho/g_th ${formatRatio(pumpRatio)}`);
      sweepLines.push(`QL ${formatQL(qlValue)}`);
      let quadratureLabel = STRING_FALLBACK;
      if (quadratureDb != null) {
        const absQuad = Math.abs(quadratureDb).toFixed(2);
        quadratureLabel = quadratureDb >= 0 ? `amp +${absQuad} dB` : `de-amp -${absQuad} dB`;
      }
      sweepLines.push(`quadrature ${quadratureLabel}`);
      sweepLines.push(`status ${sweepStatusDisplay !== STRING_FALLBACK ? sweepStatusDisplay : "n/a"}`);
      if (sweepGuardSummary) {
      sweepLines.push(`guard ${sweepGuardSummary}`);
    }

    const sweepNarrative = {
      iter: sweepIter,
        total: sweepTotal,
        gap_nm: gapNm,
        depth: depthFrac,
        phase_deg: phaseDegSweep,
        pump_GHz: pumpGHz,
        detune_MHz: detuneMHz,
        kappa_MHz: kappaMHz,
        kappaEff_MHz: kappaEffMHz,
        pumpRatio,
        QL: qlValue,
        quadrature_dB: quadratureDb,
        status: sweepStatusDisplay !== STRING_FALLBACK ? sweepStatusDisplay : fallbackStatus,
      guardReason: sweepGuardSummary,
    };

    const hasPipelineSweep =
      sweepIter != null ||
      sweepTotal != null ||
      gapNm != null ||
      depthFrac != null ||
      phaseDegSweep != null ||
      pumpGHz != null ||
      detuneMHz != null ||
      kappaMHz != null ||
      kappaEffMHz != null ||
      pumpRatio != null ||
      qlValue != null ||
      quadratureDb != null ||
      sweepGuardSummary != null ||
      sweepRuntime?.etaMs != null ||
      sweepRuntime?.slewDelayMs != null;

    const pipelineSweep: SweepSnapshot | null = hasPipelineSweep
      ? {
          iter: sweepIter ?? null,
          total: sweepTotal ?? null,
          pct:
            sweepIter != null && sweepTotal != null && sweepTotal > 0
              ? Math.max(0, Math.min(100, (sweepIter / sweepTotal) * 100))
              : null,
          d_nm: gapNm ?? null,
          m: depthFrac ?? null,
          phi_deg: phaseDegSweep ?? null,
          Omega_GHz: pumpGHz ?? null,
          detune_MHz: detuneMHz ?? null,
          kappa_MHz: kappaMHz ?? null,
          kappaEff_MHz:
            kappaEffMHz != null
              ? kappaEffMHz
              : sweepStatus === "UNSTABLE"
                ? "THRESHOLD"
                : null,
          pumpRatio: pumpRatio ?? null,
          G_dB: quadratureDb ?? null,
          QL: qlValue ?? null,
          status:
            sweepStatusDisplay !== STRING_FALLBACK
              ? sweepStatusDisplay
              : fallbackStatus ?? null,
          guard: sweepGuardSummary ?? null,
          etaMs: asFiniteNumber(sweepRuntime?.etaMs),
          slewDelayMs: asFiniteNumber(sweepRuntime?.slewDelayMs),
          bestIdx: null,
          guardCap:
            typeof (sweepRuntime as any)?.guardCap === "boolean"
              ? Boolean((sweepRuntime as any).guardCap)
              : null,
        }
      : null;

    const telemSweep = sweepTelemetry.get();
    const mergedSweep = mergeSweepSnapshots(pipelineSweep, telemSweep);

      const deltaLines: string[] = [];
      if (deltaRho != null) {
        deltaLines.push(`delta rho ${formatSigned(deltaRho, 2)}`);
      }
      if (deltaTS != null) {
        deltaLines.push(`delta TS ${formatSigned(deltaTS, 2)}`);
      }
      if (deltaDEff != null) {
        deltaLines.push(`delta d_eff ${formatSigned(deltaDEff, 3)}`);
      }

      const phaseRad = sweepNarrative.phase_deg != null ? (sweepNarrative.phase_deg * Math.PI) / 180 : null;
      const rhoCosPhi = phaseRad != null && rho != null ? rho * Math.cos(phaseRad) : null;
      const rhoCosAbs = rhoCosPhi != null ? Math.abs(rhoCosPhi) : null;
      const pumpRatioAbs = pumpRatio != null ? Math.abs(pumpRatio) : null;
      const rhoAbs = rho != null ? Math.abs(rho) : null;
      const guardApproaching =
        !guardRecoveryScheduledRef.current &&
        (
          (pumpRatioAbs != null && pumpRatioAbs >= RHO_ACTIVE_LIMIT) ||
          (rhoAbs != null && rhoAbs >= RHO_ACTIVE_LIMIT) ||
          (rhoCosAbs != null && rhoCosAbs >= RHO_ACTIVE_LIMIT) ||
          (kappaEffMHz != null && kappaEffMHz <= 0)
        );

      if (guardApproaching) {
        guardRecoveryScheduledRef.current = true;
        const recoveryParams = buildRecoveryParams(pipelineState, baselineRef.current);
        const recoverySegment: ScenarioSegment = {
          key: "recovery",
          label: "Recovery (guard)",
          startMs: elapsedMs,
          endMs: durationMs,
          params: recoveryParams,
        };
        const nextSegments: ScenarioSegment[] = [];
        for (const segItem of segmentsRef.current) {
          if (segItem.startMs >= elapsedMs) {
            continue;
          }
          if (segItem.endMs > elapsedMs) {
            nextSegments.push({
              ...segItem,
              endMs: elapsedMs,
            });
          } else {
            nextSegments.push(segItem);
          }
        }
        nextSegments.push(recoverySegment);
        segmentsRef.current = nextSegments;
        segmentIndexRef.current = nextSegments.length - 1;
        applySegment(recoverySegment);
      }

      const equationLines: string[] = [
        `rho*cos(phi) = ${rhoCosPhi != null ? rhoCosPhi.toFixed(3) : STRING_FALLBACK}`,
        `TS = tau_LC / T_mod = ${
          tauLC_ms != null && T_mod_ms != null ? (tauLC_ms / T_mod_ms).toFixed(2) : STRING_FALLBACK
        }`,
      ];

      const phaseDisplayForLines = pickSweepNumber(phaseDegSweep, phaseDeg);
      const phaseLines: string[] = [
        `phase = ${phaseDisplayForLines != null ? formatNumber(phaseDisplayForLines, 1, " deg") : STRING_FALLBACK}`,
        `wedge span = ${wedgeSpanDeg != null ? formatNumber(wedgeSpanDeg, 0, " deg") : STRING_FALLBACK}`,
      ];

      const sectorsLine =
        liveSectors != null || totalSectors != null
          ? `sectors ${liveSectors != null ? liveSectors : "?"}/${totalSectors != null ? totalSectors : "?"}`
          : `sectors ${STRING_FALLBACK}`;

      const metricLines: string[] = [
        `TS ${TS != null ? TS.toFixed(2) : STRING_FALLBACK}`,
        `tauLC ${formatNumber(tauLC_ms, 3, " ms")}`,
        `burst/dwell ${formatNumber(burst_ms, 3, " ms")}/${formatNumber(dwell_ms, 3, " ms")}`,
        sectorsLine,
        `rho ${rho != null ? rho.toFixed(2) : STRING_FALLBACK}`,
        `QL ${formatQL(qL)}`,
        `d_eff ${dEff != null ? formatNumber(dEff, 3) : STRING_FALLBACK}`,
        `GR ${burstVsTau ? "PASS" : "WARN"} ${tsOk ? "PASS" : "WARN"} ${qiOk ? "PASS" : "WARN"}`,
      ];

      const overlayTextParts = [
        ...phaseLines,
        ...sweepLines,
        ...deltaLines,
        ...metricLines,
        ...equationLines,
      ];

      const frame: TLFrame = {
        t: elapsedMs / 1000,
        segment: segment?.label ?? "Stable",
        TS,
        tauLC_ms,
        burst_ms,
        dwell_ms,
        rho,
        QL: qL,
        d_eff: dEff,
        qiMargin,
        sweep: mergedSweep,
        deltas: { rho: deltaRho, TS: deltaTS, dEff: deltaDEff },
        sectors: { live: liveSectors, total: totalSectors },
        gr: { burstVsTau, tsOk, qiOk },
        overlayText: overlayTextParts.join(" | "),
        overlays: {
          sectorAlpha: sectorAlphaArray,
          shellOffset: shellOffset ?? null,
        },
      };

      const headerLinesForPayload = [
        `Segment: ${frame.segment}`,
        `t = ${frame.t.toFixed(2)} s`,
      ];
      const midMetrics = Math.ceil(metricLines.length / 2);
      const metricsLeft = metricLines.slice(0, midMetrics);
      const metricsRight = metricLines.slice(midMetrics);

      overlayPayloadRef.current = {
        segmentLabel: frame.segment,
        elapsedSeconds: frame.t,
        headerLines: headerLinesForPayload,
        phaseLines,
        sweepLines,
        deltaLines,
        metricsLeft,
      metricsRight,
      equationLines,
    };

      hudPayloadRef.current = {
        t: frame.t,
        TS,
        tauLC_ms,
        burst_ms,
        dwell_ms,
      rho,
      QL: qL,
      deff: dEff,
      sectors: { live: liveSectors, total: totalSectors },
      gr: { burstVsTau, tsOk, qiOk },
      shellOffset: shellOffset ?? null,
      sweep: mergedSweep,
    };

      drawOverlayHud(
        frame.segment,
        frame.t,
        metricLines,
        phaseLines,
        sweepLines,
        deltaLines,
      equationLines,
      overlayHighlightRef.current
    );

      if (activeSidecarRef.current.includeSweep && mergedSweep) {
        sweepSeriesRef.current.push({
          tMs: elapsedMs,
          ...mergedSweep,
        });
      }

      framesRef.current.push(frame);
      compositeFrameForRecording();
      return frame;
    },
    [applySegment, compositeFrameForRecording, drawOverlayHud, durationMs]
  );

  const finishRecording = useCallback(
    async () => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const latestFrame =
        framesRef.current.length > 0 ? framesRef.current[framesRef.current.length - 1] : null;
      flushUiUpdate(performance.now(), { progress: 1, frame: latestFrame }, true);
      setStatus("processing");
      await revertBaseline();

      try {
        const startedAtActual = recordingStartedAtRef.current ?? startTimeRef.current;
        const meterSnapshot = frameMeterRef.current?.snapshot();
        const videoBlob = await stopRecorder();
        if (!videoBlob || videoBlob.size === 0) {
          throw new Error("No video frames captured - check browser recording support.");
        }
        const videoMimeType = videoBlob.type || recorderMimeTypeRef.current || "video/webm";
        const fileExtension = videoMimeType.includes("mp4")
          ? "mp4"
          : videoMimeType.includes("webm")
            ? "webm"
            : "mp4";
        const videoFileName = `helix-time-lapse.${fileExtension}`;
        const videoUrl = URL.createObjectURL(videoBlob);

        const frames = framesRef.current;
        const includeSidecar = activeSidecarRef.current.includeSweep;
        const sidecarPayload = includeSidecar
          ? {
              sweepSeries: sweepSeriesRef.current.slice(),
            }
          : undefined;
        const metricsPayload = {
          frames,
          ...(sidecarPayload ? { sidecar: sidecarPayload } : {}),
        };
        const metricsBlob = new Blob([JSON.stringify(metricsPayload, null, 2)], {
          type: "application/json",
        });
        const metricsUrl = URL.createObjectURL(metricsBlob);

        const endedAt = performance.now();
        const duration = endedAt - startedAtActual;
        const meter = meterSnapshot ?? {
          pushed: frames.length,
          dropped: 0,
          p95JitterMs: 0,
        };
        const durationSeconds = Math.max(duration / 1000, Number.EPSILON);
        const achievedFpsRaw = meter.pushed / durationSeconds;
        const achievedFps = Number.isFinite(achievedFpsRaw) ? Number(achievedFpsRaw.toFixed(2)) : 0;
        const jitter = Number.isFinite(meter.p95JitterMs)
          ? Number(meter.p95JitterMs.toFixed(2))
          : 0;

        const summary: TimeLapseResult = {
          startedAt: startedAtActual,
          endedAt,
          durationMs: duration,
          fps,
          frameCount: frames.length,
          videoBlob,
          videoUrl,
          videoMimeType,
          videoFileName,
          metricsBlob,
          metricsUrl,
          metrics: {
            targetFps: fps,
            achievedFps,
            framesPushed: meter.pushed,
            framesDroppedEstimate: meter.dropped,
            p95FrameJitterMs: jitter,
            ...(sidecarPayload ? { sidecar: sidecarPayload } : {}),
          },
          ...(sidecarPayload ? { sidecar: sidecarPayload } : {}),
        };
        if (!includeSidecar) {
          sweepSeriesRef.current = [];
        }
        setResult(summary);
        sweepSeriesRef.current = [];
        setStatus("complete");
      } catch (err) {
        console.error("[TimeLapse] Capture failed", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [flushUiUpdate, fps, revertBaseline, stopRecorder]
  );

  const tick = useCallback(
    async (timestamp: number) => {
      const start = startTimeRef.current;
      const elapsed = timestamp - start;
      const fraction = clamp01(elapsed / durationMs);

      const active = activeSegmentFor(elapsed);
      if (active && active.index !== segmentIndexRef.current) {
        segmentIndexRef.current = active.index;
        applySegment(active.segment);
      }

      const frame = await collectFrame(elapsed, active?.segment ?? null);
      flushUiUpdate(timestamp, { progress: fraction, frame: frame ?? null });

      if (elapsed < durationMs) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        finishRecording();
      }
    },
    [activeSegmentFor, applySegment, collectFrame, durationMs, finishRecording, flushUiUpdate]
  );

  const start = useCallback(async () => {
    if (status === "recording" || status === "processing") return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) {
      setError("Hull renderer not ready - open the 3D view first.");
      setStatus("error");
      return;
    }
    const pipelineState = pipelineRef.current;
    if (!pipelineState) {
      setError("Pipeline snapshot unavailable - wait for live data.");
      setStatus("error");
      return;
    }

    try {
      publish("hull3d:overlay:ping", { source: "time-lapse-start" });

      const baseline = ensureBaseline();
      if (!baseline) {
        throw new Error("Unable to capture baseline pipeline state.");
      }

      overlayHighlightRef.current = null;
      overlayHitRegionsRef.current = { blocks: [] };
      overlayPayloadRef.current = null;
      if (overlayCanvasRef.current) {
      overlayCanvasRef.current.style.cursor = "default";
    }

    framesRef.current = [];
    sweepSeriesRef.current = [];
    activeSidecarRef.current = {
      includeSweep: Boolean(sidecarOptionsRef.current?.includeSweep),
    };
    guardRecoveryScheduledRef.current = false;
    segmentsRef.current = prepareSegments(pipelineState, durationMs);
      segmentIndexRef.current = -1;
      finishingRef.current = false;
      baselineMetricsRef.current = null;
      setStatus("arming");
      setResult(null);
      setError(null);
      setProgress(0);
      setCurrentFrame(null);

      if (segmentsRef.current.length) {
        await updatePipeline.mutateAsync(segmentsRef.current[0].params);
      }

      await startRecorder();
      pendingUiRef.current = null;
      lastUiUpdateRef.current = 0;
      setStatus("recording");
      const startedAt = recordingStartedAtRef.current ?? performance.now();
      startTimeRef.current = startedAt;
      animationRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("[TimeLapse] Failed to start recording", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      await revertBaseline();
    }
  }, [
    durationMs,
    ensureBaseline,
    prepareSegments,
    revertBaseline,
    status,
    tick,
    updatePipeline,
    startRecorder,
  ]);

  const stop = useCallback(async () => {
    if (status !== "recording") {
      return;
    }
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    await finishRecording();
  }, [finishRecording, status]);

  return useMemo(
    () => ({
      status,
      isRecording: status === "recording",
      isProcessing: status === "processing",
      progress,
      currentFrame,
      result,
      error,
      start,
      stop,
      reset,
    }),
    [currentFrame, error, progress, reset, result, start, status, stop]
  );
}

export default useTimeLapseRecorder;


