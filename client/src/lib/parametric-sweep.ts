// client/src/lib/parametric-sweep.ts
// Pure, tree-shakeable helpers for Gap x Phase x Omega sweeps (no DOM, no React).
// Uses a simple DCE gain scaffold: kappa = f0 / QL (Hz-bandwidth), Omega ~= 2 f0, and
// parametric coupling g ~ 2 * pi * f0 * m. All units are SI unless suffixed.

import { RHO_COS_GUARD_LIMIT } from "./sweep-guards";

export type SweepRanges = {
  gap_nm: [number, number];
  Omega_GHz: [number, number];
  phase_deg: [number, number];
};

export type SweepResolution = {
  gap: number; // #points in gap axis
  Omega: number; // #slices (Omega axis)
  phase: number; // #points in phase axis (per lobe/window)
};

export type DepthRung = {
  index: number;
  depth_pct: number;
  rhoTarget: number;
};

export type SweepGrid = {
  samples: SweepSample[];
  phases_deg: number[];
  omegas_GHz: number[];
  depthRungs: DepthRung[];
};

export type SweepSample = {
  gap_nm: number;
  Omega_GHz: number;
  phase_deg: number;
  depth_pct?: number; // modulation depth m [%] (optional per-sample override)
  depthIndex?: number;
  rhoTarget?: number;
  gapIndex?: number;
  omegaIndex?: number;
  phaseIndex?: number;
  detuneFrac?: number; // (Omega / 2 f0) - 1 used for per-gap centering
  idx?: number; // internal monotonic index
};

export type PointFlags = {
  filtered: boolean; // gated-out by safety envelopes (render as hatch)
  threshold: boolean; // rho cos(phi) >= 1 (parametric threshold reached)
  linewidthCollapse: boolean; // kappa_eff below floor
  clipped: boolean; // gain clipped by guardrails (UI hint)
  reason?: "rho" | "depth" | "subthreshold" | "other";
};

export type PointResult = {
  sample: SweepSample;
  gain_lin: number;
  gain_dB: number;
  squeezed_dB: number; // (approx) degenerate squeezed quadrature
  detune_MHz: number;
  detuneNorm?: number;
  deltaOverKappa?: number;
  QL: number;
  kappa_MHz: number; // baseline cavity linewidth (f0/QL)
  kappa_eff_MHz: number; // effective linewidth under pump (phase-biased)
  rho: number; // g/g_th (dimensionless)
  subThresholdMargin?: number;
  lambdaEff?: number;
  lambdaSign?: number;
  stable: boolean;
  gapIndex?: number;
  omegaIndex?: number;
  phiIndex?: number;
  depthIndex?: number;
  plateauPhiSpanDeg?: number;
  flags: PointFlags;
};

export type HeatmapTile = {
  gap_nm: number;
  phase_deg: number;
  value_dB: number | null; // null for filtered/unstable
  rho?: number;
  lambdaSign?: number;
  subThresholdMargin?: number;
};

export type OmegaSlice = {
  Omega_GHz: number;
  tiles: HeatmapTile[];
  xVals_gap_nm: number[];
  yVals_phase_deg: number[];
  tileLookup?: Record<string, number>;
};

export type SweepAggregate = {
  omegaSlices: OmegaSlice[]; // keyed by Omega slice index
  topRidge: PointResult[]; // top-10 ridge configurations by *stable* gain (highest first)
  total: number;
  done: number;
  stats: SweepStats;
  aborted?: boolean;
  guardExit?: { reason: string; at?: SweepSample };
  phiStarIndex: Record<string, PhiStarEntry>;
  phaseGrid_deg?: number[];
  depthRungs?: DepthRung[];
};

export type SweepStats = {
  samples: number;
  stable: number;
  filtered: number;
  filteredRho: number;
  filteredDepth: number;
  filteredOther: number;
  threshold: number;
  linewidthCollapse: number;
  clipped: number;
};

export type PipelineSnapshot = {
  gap_nm?: number; // reference gap
  modulationFreq_GHz?: number; // reference f0 (used to anchor f0(d) scaling)
  qCavity?: number; // Q_L
  geomCoupling?: number; // χ: ∂ln ω / ∂ln d
  pumpEff?: number; // η: pump transduction efficiency
  pumpPhaseBiasDeg?: number; // global phase bias to add to phi samples
  gainMax_dB?: number; // stop/clip above this
  kappaFloor_MHz?: number; // linewidth collapse floor
  staySubThreshold?: boolean; // if true, filter rho cos(phi) >= 0.95
  minDepth_pct?: number; // filter m < this
  maxDepth_pct?: number; // filter m > this
};

export type SimulationParams = {
  depth_pct: number; // default modulation depth m [%]
  alpha_gap_to_f0?: number; // scale exponent: f0(d) = f_ref*(d_ref/d)^alpha (default 1)
  geomCoupling?: number; // χ override
  pumpEff?: number; // η override
  phaseJitter_deg?: number; // sigma for phase jitter (per MC draw)
  freqJitterFrac?: number; // sigma for Omega jitter as fraction of kappa (per MC draw)
  jitterSamples?: number; // 3..5 recommended
  maxGain_dB?: number; // clip at this dB (visual guard)
  kappaFloor_MHz?: number; // linewidth floor
  staySubThreshold?: boolean; // filter when rho cos(phi) >= 0.95
  phaseBias_deg?: number; // overrides pipeline if provided
};

const TAU = 2 * Math.PI;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const GAIN_FLOOR_LIN = 1e-12;
const toDB = (gLin: number) => 10 * Math.log10(Math.max(gLin, GAIN_FLOOR_LIN));

export const RHO_CUTOFF = 0.9;
export const DEFAULT_GEOM_COUPLING = 0.5;
export const DEFAULT_PUMP_EFF = 0.1;
export const DEFAULT_MIN_DEPTH_PCT = 0.00000001;
export const DEFAULT_MAX_DEPTH_PCT = 0.25;
export const DEFAULT_RHO_LADDER = [0.1, 0.2, 0.3, 0.35, 0.4, 0.45];
export const SUB_THRESHOLD_MARGIN = 0.02; // 2% headroom to threshold

export type PhiStarEntry = {
  gap_nm: number;
  Omega_GHz: number;
  rho: number;
  depth_pct?: number;
  phi_deg: number;
  gain_dB: number;
  deltaOverKappa?: number;
  subThresholdMargin?: number;
  lambdaEff?: number;
  lambdaSign?: number;
};

const toFixedKey = (value: number, precision = 6) =>
  Number.isFinite(value) ? value.toFixed(precision) : `${value}`;

function linspace(start: number, end: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) {
    return [start];
  }
  const out: number[] = [];
  const step = (end - start) / (n - 1);
  for (let i = 0; i < n; i += 1) {
    out.push(start + step * i);
  }
  return out;
}

function uniqueSorted(values: number[], precision = 6): number[] {
  const map = new Map<string, number>();
  for (const value of values) {
    map.set(toFixedKey(value, precision), value);
  }
  return Array.from(map.values()).sort((a, b) => a - b);
}

export function rhoToDepthPct(
  rho: number,
  {
    geomCoupling = DEFAULT_GEOM_COUPLING,
    pumpEff = DEFAULT_PUMP_EFF,
    qCavity = 1e4,
  }: {
    geomCoupling?: number;
    pumpEff?: number;
    qCavity?: number;
  }
): number | null {
  const denom = Math.max(
    1e-18,
    Math.max(0, geomCoupling) * Math.max(0, pumpEff) * Math.max(1, qCavity)
  );
  if (!Number.isFinite(rho) || rho < 0) {
    return null;
  }
  const depth_pct = (rho / denom) * 100;
  return Number.isFinite(depth_pct) ? depth_pct : null;
}

export function resolvePhaseWindows(
  baseRange: [number, number]
): [number, number][] {
  const [startRaw, endRaw] = baseRange;
  const minDeg = Math.min(startRaw, endRaw);
  const maxDeg = Math.max(startRaw, endRaw);
  if (!Number.isFinite(minDeg) || !Number.isFinite(maxDeg) || minDeg === maxDeg) {
    return [
      [-30, 30],
      [60, 120],
    ];
  }
  const primary: [number, number] = [minDeg, maxDeg];
  const secondary: [number, number] = [
    minDeg + 90,
    maxDeg + 90,
  ];
  return [
    primary,
    [Math.min(...secondary), Math.max(...secondary)],
  ];
}

export function depthPctToEpsilon(
  depth_pct: number,
  geomCoupling = DEFAULT_GEOM_COUPLING,
  pumpEff = DEFAULT_PUMP_EFF
): number {
  const depthSafe = Number.isFinite(depth_pct) ? depth_pct : 0;
  const m = Math.max(0, depthSafe) * 1e-2;
  return Math.max(0, geomCoupling) * Math.max(0, pumpEff) * m;
}

/**
 * Reference-mode frequency vs gap.
 * Anchors f0(d) to the current pipeline's (f_ref, d_ref) and scales ~ 1/d^alpha.
 */
export function f0_from_gap_Hz(
  d_nm: number,
  pipeline: PipelineSnapshot,
  alpha = 1
): number {
  const d_ref_nm = pipeline.gap_nm ?? 200;
  const f_ref_Hz = (pipeline.modulationFreq_GHz ?? 15) * 1e9;
  const ratio = d_ref_nm > 0 && d_nm > 0 ? d_ref_nm / d_nm : 1;
  return f_ref_Hz * Math.pow(ratio, alpha);
}

/**
 * DCE parametric point simulation (pure).
 * - Uses kappa_bw = f0 / QL (Hz)
 * - g/g_th = rho = (2 f0 m) / kappa_bw   with m = depth_frac
 * - G(Omega,phi) ~= 1 / ((1 - rho cos(phi))^2 + (Delta/kappa_bw)^2)
 * - kappa_eff ~= kappa_bw * (1 - rho cos(phi))   (effective damping along amplified quad)
 */
export function simulatePoint(
  sample: SweepSample,
  pipeline: PipelineSnapshot,
  params: SimulationParams,
  signal?: AbortSignal
): PointResult {
  if (signal?.aborted) {
    return {
      sample,
      gain_lin: 1,
      gain_dB: 0,
      squeezed_dB: 0,
      detune_MHz: 0,
      QL: pipeline.qCavity ?? 1e4,
      kappa_MHz: 0,
      kappa_eff_MHz: 0,
      rho: 0,
      stable: true,
      flags: {
        filtered: true,
        threshold: false,
        linewidthCollapse: false,
        clipped: false,
      },
    };
  }

  const QL = Math.max(1, pipeline.qCavity ?? 1e4);
  const alpha = params.alpha_gap_to_f0 ?? 1;
  const geomCoupling =
    typeof params.geomCoupling === "number"
      ? params.geomCoupling
      : pipeline.geomCoupling ?? DEFAULT_GEOM_COUPLING;
  const pumpEff =
    typeof params.pumpEff === "number"
      ? params.pumpEff
      : pipeline.pumpEff ?? DEFAULT_PUMP_EFF;
  const f0 = f0_from_gap_Hz(sample.gap_nm, pipeline, alpha);
  const omega0 = TAU * f0;
  const kappa = omega0 / QL;
  const kappa_bw_Hz = kappa / TAU;
  const kappa_MHz = kappa_bw_Hz / 1e6;

  const depth_pct_eff =
    typeof sample.depth_pct === "number" ? sample.depth_pct : params.depth_pct;
  const epsilon = depthPctToEpsilon(depth_pct_eff, geomCoupling, pumpEff);
  const rho = epsilon * QL;
  const g = 0.5 * epsilon * omega0;
  const g_th = 0.5 * kappa;
  const lambda0 = g_th > 0 ? g / g_th : 0;

  const phaseBias =
    typeof params.phaseBias_deg === "number"
      ? params.phaseBias_deg
      : pipeline.pumpPhaseBiasDeg ?? 0;

  const phi_deg = sample.phase_deg + (phaseBias || 0);
  const phi = (phi_deg * Math.PI) / 180;
  const lambdaCentral = lambda0 * Math.cos(phi);
  const lambdaEffNominal = Math.abs(lambdaCentral);

  const Omega = sample.Omega_GHz * 1e9;
  const detune_Hz = Omega - 2 * f0;
  const detune_MHz = detune_Hz / 1e6;
  const detuneNorm =
    kappa_bw_Hz > 0 ? detune_Hz / Math.max(kappa_bw_Hz, 1e-30) : 0;
  const deltaOverKappa = detuneNorm;

  if (!Number.isFinite(rho) || rho >= RHO_CUTOFF) {
    const rhoOut = Number.isFinite(rho) ? rho : Number.POSITIVE_INFINITY;
    return {
      sample,
      gain_lin: GAIN_FLOOR_LIN,
      gain_dB: toDB(GAIN_FLOOR_LIN),
      squeezed_dB: toDB(GAIN_FLOOR_LIN),
      detune_MHz,
      detuneNorm,
      deltaOverKappa: detuneNorm,
      QL,
      kappa_MHz,
      kappa_eff_MHz: kappa_MHz,
      rho: rhoOut,
      subThresholdMargin: rhoOut >= 0 ? 1 - Math.min(rhoOut, 1) : undefined,
      lambdaEff: rhoOut,
      lambdaSign: 1,
      stable: false,
      gapIndex: sample.gapIndex,
      omegaIndex: sample.omegaIndex,
      phiIndex: sample.phaseIndex,
      depthIndex: sample.depthIndex,
      flags: {
        filtered: true,
        threshold: rhoOut >= 1,
        linewidthCollapse: false,
        clipped: false,
        reason: "rho",
      },
    };
  }

  if (lambdaEffNominal >= RHO_COS_GUARD_LIMIT) {
    const subThreshold = 1 - Math.min(lambdaEffNominal, 1);
    return {
      sample,
      gain_lin: GAIN_FLOOR_LIN,
      gain_dB: toDB(GAIN_FLOOR_LIN),
      squeezed_dB: toDB(GAIN_FLOOR_LIN),
      detune_MHz,
      detuneNorm,
      deltaOverKappa: detuneNorm,
      QL,
      kappa_MHz,
      kappa_eff_MHz: Math.max(0, kappa_MHz * (1 - lambdaCentral)),
      rho,
      subThresholdMargin: subThreshold,
      lambdaEff: lambdaEffNominal,
      lambdaSign: Math.sign(1 - lambdaCentral) || 0,
      stable: false,
      gapIndex: sample.gapIndex,
      omegaIndex: sample.omegaIndex,
      phiIndex: sample.phaseIndex,
      depthIndex: sample.depthIndex,
      flags: {
        filtered: true,
        threshold: true,
        linewidthCollapse: false,
        clipped: false,
        reason: "rho",
      },
    };
  }

  const Nmc = clamp(params.jitterSamples ?? 3, 1, 9);
  const sigmaPhi = (params.phaseJitter_deg ?? 0.5) * (Math.PI / 180);
  const sigmaKappaFrac = Math.max(0, params.freqJitterFrac ?? 0.1);

  let H_re = 0;
  let H_im = 0;
  let kappa_eff_min = Number.POSITIVE_INFINITY;
  let thresholdHit = false;

  for (let i = 0; i < Nmc; i += 1) {
    const u1 = Math.random() || 1e-6;
    const u2 = Math.random() || 1e-6;
    const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
    const dPhi = n * sigmaPhi;

    const u3 = Math.random() || 1e-6;
    const u4 = Math.random() || 1e-6;
    const n2 = Math.sqrt(-2 * Math.log(u3)) * Math.sin(TAU * u4);
    const dOmega = n2 * sigmaKappaFrac * kappa_bw_Hz;

    const phi_i = phi + dPhi;
    const detune_i = detune_Hz + dOmega;

    const cosPhi = Math.cos(phi_i);
    const lambda = lambda0 * cosPhi;
    if (lambda >= 1) {
      thresholdHit = true;
    }

    const a = 1 - lambda;
    const b = kappa_bw_Hz > 0 ? detune_i / kappa_bw_Hz : 0;
    const denom = a * a + b * b || 1e-18;
    H_re += a / denom;
    H_im += -b / denom;

    const k_eff_Hz = Math.max(0, kappa_bw_Hz * a);
    if (k_eff_Hz < kappa_eff_min) {
      kappa_eff_min = k_eff_Hz;
    }
  }

  H_re /= Nmc;
  H_im /= Nmc;
  const gain_lin = Math.max(GAIN_FLOOR_LIN, H_re * H_re + H_im * H_im);
  const rawGain_dB = toDB(gain_lin);
  let gain_dB = rawGain_dB;

  const Gmin = (() => {
    const lambda = lambdaCentral;
    const a = 1 + lambda;
    const denom =
      a * a + (detune_Hz / Math.max(kappa_bw_Hz, 1e-30)) ** 2;
    return denom === 0 ? 1e12 : 1 / denom;
  })();
  const squeezed_dB = toDB(Gmin);

  const kappa_eff_MHz = kappa_eff_min / 1e6;
  const kappaFloor = params.kappaFloor_MHz ?? pipeline.kappaFloor_MHz ?? 0.01;
  const baselineBelowFloor = kappa_MHz <= kappaFloor;
  const linewidthCollapse =
    !baselineBelowFloor && kappa_eff_MHz <= kappaFloor;

  const staySub =
    params.staySubThreshold ?? pipeline.staySubThreshold ?? true;
  const lambdaEff = lambdaEffNominal;
  const subThresholdMargin = 1 - lambdaEff;
  const lambdaSign = Math.sign(1 - lambdaCentral) || 0;
  const guardLambda =
    staySub &&
    (lambdaEff >= RHO_COS_GUARD_LIMIT || subThresholdMargin <= SUB_THRESHOLD_MARGIN);
  const guardGain = staySub && rawGain_dB > 12;
  const guardRho = staySub && rho >= RHO_COS_GUARD_LIMIT;
  const minDepth = pipeline.minDepth_pct ?? DEFAULT_MIN_DEPTH_PCT;
  const maxDepth = pipeline.maxDepth_pct ?? DEFAULT_MAX_DEPTH_PCT;
  const filteredByDepth =
    depth_pct_eff < minDepth || depth_pct_eff > maxDepth;

  const filteredByThreshold = guardLambda || guardGain || guardRho;
  const filtered = filteredByThreshold || filteredByDepth;
  const filteredReason = guardRho
    ? "rho"
    : filteredByDepth
    ? "depth"
    : filteredByThreshold
    ? "subthreshold"
    : undefined;

  const cap = params.maxGain_dB ?? pipeline.gainMax_dB ?? 15;
  const clipped = rawGain_dB > cap;
  if (clipped) {
    gain_dB = cap;
  }

  const stable = !thresholdHit && !linewidthCollapse;

  return {
    sample,
    gain_lin,
    gain_dB,
    squeezed_dB,
    detune_MHz,
    detuneNorm,
    deltaOverKappa,
    QL,
    kappa_MHz,
    kappa_eff_MHz,
    rho,
    subThresholdMargin,
    lambdaEff,
    lambdaSign,
    gapIndex: sample.gapIndex,
    omegaIndex: sample.omegaIndex,
    phiIndex: sample.phaseIndex,
    depthIndex: sample.depthIndex,
    stable: stable && !filtered,
    flags: {
      filtered,
      threshold: thresholdHit,
      linewidthCollapse,
      clipped,
      reason: filtered ? filteredReason ?? "other" : undefined,
    },
  };
}

/**
 * Build a sweep grid in (gap, Omega, phase) with ordered samples (Omega-major).
 */
export function enumerateSweepGrid(
  gapRange: [number, number],
  omegaRange_GHz: [number, number],
  phaseRange_deg: [number, number],
  resolution: SweepResolution,
  opts?: {
    pipeline?: PipelineSnapshot;
    alpha_gap_to_f0?: number;
    phaseWindows?: [number, number][];
    depthRungs?: DepthRung[];
    defaultDepth_pct?: number;
  }
): SweepGrid {
  const [g0, g1] = gapRange;
  const [o0, o1] = omegaRange_GHz;
  const [p0, p1] = phaseRange_deg;
  const Ng = Math.max(1, Math.floor(resolution.gap));
  const No = Math.max(1, Math.floor(resolution.Omega));
  const phasesPerWindow = Math.max(1, Math.floor(resolution.phase));

  const phaseWindows =
    opts?.phaseWindows?.length && opts.phaseWindows[0]
      ? opts.phaseWindows
      : resolvePhaseWindows([p0, p1]);
  const rawPhaseValues: number[] = [];
  for (const [lo, hi] of phaseWindows) {
    const samples = linspace(lo, hi, phasesPerWindow);
    for (const value of samples) {
      rawPhaseValues.push(value);
    }
  }
  const phases = uniqueSorted(rawPhaseValues, 6);
  const Np = phases.length;

  const gaps = Array.from({ length: Ng }, (_, i) =>
    g0 + (i * (g1 - g0)) / Math.max(1, Ng - 1)
  );

  const hasPipelineCentering = Boolean(opts?.pipeline);
  const alpha = opts?.alpha_gap_to_f0 ?? 1;

  const f0PerGap = hasPipelineCentering
    ? gaps.map((gap) => f0_from_gap_Hz(gap, opts!.pipeline!, alpha))
    : undefined;

  const refF0_GHz =
    opts?.pipeline?.modulationFreq_GHz && opts.pipeline.modulationFreq_GHz > 0
      ? opts.pipeline.modulationFreq_GHz
      : ((o0 + o1) / 2) / 2;
  const pumpRef_GHz = refF0_GHz * 2;
  const qCavity = Math.max(1, opts?.pipeline?.qCavity ?? 1e4);
  let detuneFracMin = -Math.max(3 / (2 * qCavity), 0.005);
  let detuneFracMax = Math.max(3 / (2 * qCavity), 0.005);
  if (pumpRef_GHz > 0) {
    const minFrac = o0 / pumpRef_GHz - 1;
    const maxFrac = o1 / pumpRef_GHz - 1;
    if (Number.isFinite(minFrac) && Number.isFinite(maxFrac)) {
      detuneFracMin = Math.min(detuneFracMin, minFrac);
      detuneFracMax = Math.max(detuneFracMax, maxFrac);
    }
  }

  const detuneFracs = hasPipelineCentering
    ? Array.from({ length: No }, (_, j) => {
        if (No === 1) {
          return (detuneFracMin + detuneFracMax) / 2;
        }
        return (
          detuneFracMin +
          (j * (detuneFracMax - detuneFracMin)) / Math.max(1, No - 1)
        );
      })
    : undefined;

  const omegas = hasPipelineCentering
    ? detuneFracs!.map(
        (frac) => pumpRef_GHz * (1 + frac)
      )
    : Array.from({ length: No }, (_, j) =>
        o0 + (j * (o1 - o0)) / Math.max(1, No - 1)
      );

  const depthRungsInput = opts?.depthRungs?.length
    ? opts.depthRungs
    : undefined;
  const defaultDepth_pct =
    typeof opts?.defaultDepth_pct === "number"
      ? opts.defaultDepth_pct
      : DEFAULT_MIN_DEPTH_PCT;
  const geomCoupling = opts?.pipeline?.geomCoupling ?? DEFAULT_GEOM_COUPLING;
  const pumpEff = opts?.pipeline?.pumpEff ?? DEFAULT_PUMP_EFF;
  const computeRhoForDepth = (depth_pct: number) => {
    const epsilon = depthPctToEpsilon(depth_pct, geomCoupling, pumpEff);
    return epsilon * qCavity;
  };
  let depthRungs = depthRungsInput?.map((rung, index) => ({
    index,
    depth_pct: rung.depth_pct,
    rhoTarget:
      typeof rung.rhoTarget === "number"
        ? rung.rhoTarget
        : computeRhoForDepth(rung.depth_pct),
  }));
  if (!depthRungs || depthRungs.length === 0) {
    depthRungs = [
      {
        index: 0,
        depth_pct: defaultDepth_pct,
        rhoTarget: computeRhoForDepth(defaultDepth_pct),
      },
    ];
  } else {
    depthRungs = depthRungs.map((r, idx) => ({
      index: idx,
      depth_pct: r.depth_pct,
      rhoTarget: r.rhoTarget,
    }));
  }

  const out: SweepSample[] = [];
  let idxCounter = 0;
  for (const rung of depthRungs) {
    for (let j = 0; j < No; j += 1) {
      const detuneFrac = detuneFracs ? detuneFracs[j] : undefined;
      for (let k = 0; k < Np; k += 1) {
        const phase_deg = phases[k];
        for (let i = 0; i < Ng; i += 1) {
          const gap_nm = gaps[i];
          const omega_GHz = hasPipelineCentering
            ? (2 * f0PerGap![i] * (1 + (detuneFrac ?? 0))) / 1e9
            : omegas[j];
          out.push({
            idx: idxCounter,
            gap_nm,
            Omega_GHz: omega_GHz,
            phase_deg,
            depth_pct: rung.depth_pct,
            depthIndex: rung.index,
            rhoTarget: rung.rhoTarget,
            gapIndex: i,
            omegaIndex: j,
            phaseIndex: k,
            detuneFrac,
          });
          idxCounter += 1;
        }
      }
    }
  }
  return {
    samples: out,
    phases_deg: phases,
    omegas_GHz: omegas,
    depthRungs,
  };
}

/**
 * Reduce/aggregate a stream of PointResult items into heatmaps and a ridge queue.
 * This is idempotent and can be called incrementally as results arrive.
 */
export function reduceResults(
  prev: SweepAggregate | undefined,
  nextChunk: PointResult[],
  resolution: SweepResolution,
  opts?: { total?: number; phaseGrid_deg?: number[]; depthRungs?: DepthRung[] }
): SweepAggregate {
  let state = prev;
  if (!state) {
    state = {
      omegaSlices: [],
      topRidge: [],
      total: opts?.total ?? 0,
      done: 0,
      stats: {
        samples: 0,
        stable: 0,
        filtered: 0,
        filteredRho: 0,
        filteredDepth: 0,
        filteredOther: 0,
        threshold: 0,
        linewidthCollapse: 0,
        clipped: 0,
      },
      phiStarIndex: {},
      phaseGrid_deg: opts?.phaseGrid_deg,
      depthRungs: opts?.depthRungs,
    };
  }

  if (!state.phaseGrid_deg && opts?.phaseGrid_deg) {
    state.phaseGrid_deg = opts.phaseGrid_deg;
  }
  if (!state.depthRungs && opts?.depthRungs) {
    state.depthRungs = opts.depthRungs;
  }
  if (!state.phiStarIndex) {
    state.phiStarIndex = {};
  }

  const Ng = Math.max(1, Math.floor(resolution.gap));
  const No = Math.max(1, Math.floor(resolution.Omega));
  const Np = Math.max(1, Math.floor(resolution.phase));
  const depthCount = state.depthRungs?.length ?? opts?.depthRungs?.length ?? 1;
  const fallbackTotal = Ng * No * Np * depthCount;
  if (!state.total) {
    state.total = opts?.total ?? fallbackTotal;
  } else if (opts?.total && opts.total > state.total) {
    state.total = opts.total;
  }
  if (!state.stats) {
    state.stats = {
      samples: 0,
      stable: 0,
      filtered: 0,
      filteredRho: 0,
      filteredDepth: 0,
      filteredOther: 0,
      threshold: 0,
      linewidthCollapse: 0,
      clipped: 0,
    };
  }

  const ensureSlice = (Omega_GHz: number): OmegaSlice => {
    let slice = state!.omegaSlices.find((s) => s.Omega_GHz === Omega_GHz);
    if (!slice) {
      slice = {
        Omega_GHz,
        tiles: [],
        xVals_gap_nm: [],
        yVals_phase_deg: [],
        tileLookup: {},
      };
      state!.omegaSlices.push(slice);
      state!.omegaSlices.sort((a, b) => a.Omega_GHz - b.Omega_GHz);
    }
    return slice;
  };

  const axesPerOmega = new Map<
    number,
    { xs: number[]; ys: number[] }
  >();
  const stats = state.stats;

  const gaussianSample = (value: number, target: number, sigma: number) => {
    const safeSigma = Math.max(1e-6, Math.abs(sigma));
    const normalized = (value - target) / safeSigma;
    return Math.exp(-0.5 * normalized * normalized);
  };

  const isRidgeCandidate = (point: PointResult) => {
    if (!point || !point.stable) {
      return false;
    }
    const flags = point.flags ?? {
      filtered: false,
      threshold: false,
      linewidthCollapse: false,
      clipped: false,
    };
    if (flags.filtered || flags.threshold || flags.linewidthCollapse) {
      return false;
    }
    return point.gain_lin > GAIN_FLOOR_LIN;
  };

  const scorePoint = (point: PointResult) => {
    const detunePenalty = -6 * Math.min(3, Math.abs(point.detuneNorm ?? 0));
    const phiSpan = point.plateauPhiSpanDeg ?? 0;

    const targetRho =
      Number.isFinite(point.sample?.rhoTarget) && (point.sample?.rhoTarget as number) > 0
        ? (point.sample?.rhoTarget as number)
        : undefined;
    const rhoValue = point.rho;
    let rhoWeight = 1;
    if (Number.isFinite(targetRho) && Number.isFinite(rhoValue)) {
      const sigmaRho = Math.max(0.05, Math.abs(targetRho as number) * 0.2);
      rhoWeight = gaussianSample(rhoValue as number, targetRho as number, sigmaRho);
    }

    const deltaOverKappa = point.deltaOverKappa;
    let deltaWeight = 1;
    if (Number.isFinite(deltaOverKappa)) {
      const sigmaDelta = 0.35;
      deltaWeight = gaussianSample(deltaOverKappa as number, 0, sigmaDelta);
    }

    const closeness = Math.sqrt(Math.max(1e-6, rhoWeight * deltaWeight));
    const plateauBonus = 0.02 * phiSpan * (0.6 + 0.4 * closeness);
    const stabilityBias = 6 * (rhoWeight - 1) + 4 * (deltaWeight - 1);

    return point.gain_dB + detunePenalty + plateauBonus + stabilityBias;
  };

  const ridgeMap = new Map<string, PointResult>();
  const phiStarIndex = state.phiStarIndex ?? {};
  state.phiStarIndex = phiStarIndex;

  const phiStarKeyFor = (point: PointResult) => {
    const gapKey = Number.isFinite(point.gapIndex)
      ? `g${point.gapIndex}`
      : Number.isFinite(point.sample.gapIndex)
      ? `g${point.sample.gapIndex}`
      : Number.isFinite(point.sample.gap_nm)
      ? `gap${point.sample.gap_nm.toFixed(3)}`
      : "gap";
    const omegaKey = Number.isFinite(point.omegaIndex)
      ? `o${point.omegaIndex}`
      : Number.isFinite(point.sample.omegaIndex)
      ? `o${point.sample.omegaIndex}`
      : Number.isFinite(point.sample.Omega_GHz)
      ? `omega${point.sample.Omega_GHz.toFixed(6)}`
      : "omega";
    const sampleDepth = point.sample.depth_pct;
    const depthKey = Number.isFinite(point.depthIndex)
      ? `d${point.depthIndex}`
      : Number.isFinite(point.sample.depthIndex)
      ? `d${point.sample.depthIndex}`
      : typeof sampleDepth === "number" && Number.isFinite(sampleDepth)
      ? `depth${sampleDepth.toFixed(6)}`
      : Number.isFinite(point.rho)
      ? `rho${point.rho.toFixed(3)}`
      : "depth";
    return `${gapKey}:${omegaKey}:${depthKey}`;
  };

  const tryCachePhiStar = (point: PointResult) => {
    if (!isRidgeCandidate(point)) {
      return;
    }
    const key = phiStarKeyFor(point);
    const existing = phiStarIndex[key];
    if (!existing || point.gain_dB > existing.gain_dB) {
      const depthValue =
        typeof point.sample.depth_pct === "number"
          ? point.sample.depth_pct
          : undefined;
      phiStarIndex[key] = {
        gap_nm: point.sample.gap_nm,
        Omega_GHz: point.sample.Omega_GHz,
        rho: point.rho,
        depth_pct: depthValue,
        phi_deg: point.sample.phase_deg,
        gain_dB: point.gain_dB,
        deltaOverKappa:
          typeof point.deltaOverKappa === "number"
            ? point.deltaOverKappa
            : point.detuneNorm,
        subThresholdMargin: point.subThresholdMargin,
        lambdaEff: point.lambdaEff,
        lambdaSign: point.lambdaSign,
      };
    }
  };
  const seedCandidate = (point: PointResult) => {
    const gapKey = Number.isFinite(point.gapIndex)
      ? String(point.gapIndex)
      : Number.isFinite(point.sample.gapIndex)
      ? String(point.sample.gapIndex)
      : Number.isFinite(point.sample.gap_nm)
      ? point.sample.gap_nm.toFixed(3)
      : "gap";
    const omegaKey = Number.isFinite(point.omegaIndex)
      ? String(point.omegaIndex)
      : Number.isFinite(point.sample.omegaIndex)
      ? String(point.sample.omegaIndex)
      : Number.isFinite(point.sample.Omega_GHz)
      ? point.sample.Omega_GHz.toFixed(6)
      : "omega";
    const sampleDepth = point.sample.depth_pct;
    const depthKey = Number.isFinite(point.depthIndex)
      ? String(point.depthIndex)
      : Number.isFinite(point.sample.depthIndex)
      ? String(point.sample.depthIndex)
      : typeof sampleDepth === "number" && Number.isFinite(sampleDepth)
      ? sampleDepth.toFixed(6)
      : Number.isFinite(point.rho)
      ? point.rho.toFixed(3)
      : "depth";
    const phiKey = Number.isFinite(point.phiIndex)
      ? String(point.phiIndex)
      : Number.isFinite(point.sample.phaseIndex)
      ? String(point.sample.phaseIndex)
      : Number.isFinite(point.sample.phase_deg)
      ? point.sample.phase_deg.toFixed(3)
      : "phi";
    const key = `${gapKey}:${omegaKey}:${depthKey}:${phiKey}`;
    const prev = ridgeMap.get(key);
    if (!prev || scorePoint(point) > scorePoint(prev)) {
      ridgeMap.set(key, point);
    }
  };

  if (state.topRidge.length) {
    for (const existing of state.topRidge) {
      if (isRidgeCandidate(existing)) {
        tryCachePhiStar(existing);
        seedCandidate(existing);
      }
    }
  }

  for (const r of nextChunk) {
    const Omega_GHz = r.sample.Omega_GHz;
    const slice = ensureSlice(Omega_GHz);

    let ax = axesPerOmega.get(Omega_GHz);
    if (!ax) {
      ax = { xs: [], ys: [] };
      axesPerOmega.set(Omega_GHz, ax);
    }
    if (!ax.xs.includes(r.sample.gap_nm)) {
      ax.xs.push(r.sample.gap_nm);
    }
    if (!ax.ys.includes(r.sample.phase_deg)) {
      ax.ys.push(r.sample.phase_deg);
    }
    ax.xs.sort((a, b) => a - b);
    ax.ys.sort((a, b) => a - b);

    const tileGapKey = Number.isFinite(r.sample.gapIndex)
      ? `g${r.sample.gapIndex}`
      : `gap${r.sample.gap_nm.toFixed(3)}`;
    const tilePhaseKey = Number.isFinite(r.sample.phaseIndex)
      ? `p${r.sample.phaseIndex}`
      : `phi${r.sample.phase_deg.toFixed(3)}`;
    const tileKey = `${tileGapKey}:${tilePhaseKey}`;
    const lookup = slice.tileLookup ?? (slice.tileLookup = {});
    const nextValue =
      r.flags.filtered || !r.stable ? null : r.gain_dB;
    if (lookup[tileKey] === undefined) {
      lookup[tileKey] = slice.tiles.length;
      slice.tiles.push({
        gap_nm: r.sample.gap_nm,
        phase_deg: r.sample.phase_deg,
        value_dB: nextValue,
        rho: r.rho,
        lambdaSign: r.lambdaSign,
        subThresholdMargin: r.subThresholdMargin,
      });
    } else {
      const existing = slice.tiles[lookup[tileKey]];
      if (
        nextValue != null &&
        (existing.value_dB == null || nextValue > existing.value_dB)
      ) {
        existing.value_dB = nextValue;
        existing.rho = r.rho;
        existing.lambdaSign = r.lambdaSign;
        existing.subThresholdMargin = r.subThresholdMargin;
      } else if (existing.value_dB == null && nextValue === null) {
        // leave as null
      }
    }

    stats.samples += 1;
    const flags = r.flags ?? {
      filtered: false,
      threshold: false,
      linewidthCollapse: false,
      clipped: false,
    };
    if (r.stable) {
      stats.stable += 1;
    }
    if (flags.filtered) {
      stats.filtered += 1;
      if (flags.reason === "rho") {
        stats.filteredRho += 1;
      } else if (flags.reason === "depth") {
        stats.filteredDepth += 1;
      } else if (flags.reason) {
        stats.filteredOther += 1;
      }
    }
    if (flags.threshold) {
      stats.threshold += 1;
    }
    if (flags.linewidthCollapse) {
      stats.linewidthCollapse += 1;
    }
    if (flags.clipped) {
      stats.clipped += 1;
    }

    if (isRidgeCandidate(r)) {
      tryCachePhiStar(r);
      seedCandidate(r);
    }
  }

  for (const s of state.omegaSlices) {
    const ax = axesPerOmega.get(s.Omega_GHz);
    if (ax) {
      s.xVals_gap_nm = ax.xs;
      s.yVals_phase_deg = ax.ys;
    }
  }
  state.topRidge = Array.from(ridgeMap.values())
    .sort((a, b) => {
      const scoreDelta = scorePoint(b) - scorePoint(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return b.gain_dB - a.gain_dB;
    })
    .slice(0, 10);

  state.done += nextChunk.length;

  return state;
}
