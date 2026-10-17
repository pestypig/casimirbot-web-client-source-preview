import { type StateCreator } from "zustand";
import { createWithEqualityFn } from "zustand/traditional";
import { publishDriveSplit, subscribeDriveSplit, type DriveSplitState } from "@/lib/drive-split-channel";
import { publishDriveIntent, subscribeDriveIntent, type DriveIntentState } from "@/lib/drive-intent-channel";
import type { RidgePreset } from "@shared/schema";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

export type PhaseMode = "scheduler" | "manual";
export type AutophaserMode = "viz" | "assist" | "coupled";

export type DriveSyncState = {
  // Phase / lobe geometry
  phase01: number;            // 0..1 (center of lobe A)
  phaseMode: PhaseMode;       // source of truth for phase01
  splitEnabled: boolean;      // second lobe at +0.5 wrap
  splitFrac: number;          // lobe A weight (0..1), lobe B gets (1 - splitFrac)
  sigmaSectors: number;       // Gaussian sigma in sectors
  sectorFloor: number;        // baseline floor 0..1
  ampBase: number;            // base amplitude prior to geometry chain
  pumpPhaseDeg: number;       // physical pump φ (deg, wrapped 0..360)
  autophaserMode: AutophaserMode; // visual-only, assist, coupled
  intent: { x: number; y: number; z: number };
  nudge01: number;            // 0..1 visual nudge (fraction of hull radius)

  // Amplitude shaping
  q: number;                  // spoiling factor multiplier
  zeta: number;               // coupling / damping 0..1 (affects width & floor shaping)

  // Locks / presets
  locks: { followMode: boolean };
  ridgePresets: RidgePreset[];

  // Actions
  setPhase: (p: number) => void;
  setPhaseMode: (m: PhaseMode) => void;
  setSplit: (on: boolean, frac?: number) => void;
  setSigma: (sigmaS: number) => void;
  setFloor: (f: number) => void;
  setAutophaserMode: (mode: AutophaserMode) => void;
  setIntent: (v: Partial<{ x: number; y: number; z: number }>) => void;
  setNudge01: (v: number) => void;
  setQ: (q: number) => void;
  setZeta: (z: number) => void;
  setFollowMode: (on: boolean) => void;
  setAmpBase: (amp: number) => void;
  setRidgePresets: (ridge: RidgePreset[]) => void;
  setPumpPhaseDeg: (deg: number) => void;

  // Convenience selectors
  effectiveSigma01: (totalSectors: number) => number; // sigma expressed in 0..1 azimuth units
  shaped: (rawAmpChain: number) => { amp: number; sigma01: number; floor: number };
};

const wrap01 = (value: number) => {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampUnit = (value: number) => {
  const v = Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, v));
};
const clampNudge = (value: number) => {
  const v = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, v));
};

const DEFAULT_SPLIT_FRAC = 0.6; // Mirrors server DEFAULT_NEGATIVE_FRACTION = 0.4
const INTENT_DEADZONE = 0.18;
const INTENT_EPS = 1e-4;
const PHASE_EPS = 1e-3;
const MAX_PHASE_PUSH_HZ = 30;
const PHASE_PUSH_INTERVAL_MS = 1000 / MAX_PHASE_PUSH_HZ;
let lastPhasePushMs = 0;

const toDriveSplitPayload = (state: DriveSyncState): DriveSplitState => ({
  mode: state.splitEnabled ? "zeroBeta" : "single",
  split: clamp01(state.splitFrac),
  phase01: wrap01(state.phase01),
  sigma: Math.max(1e-6, state.sigmaSectors),
  q: Math.max(0, state.q),
  zeta: clamp01(state.zeta),
  ampBase: Math.max(0, state.ampBase),
  pumpPhase_deg: Number.isFinite(state.pumpPhaseDeg) ? state.pumpPhaseDeg : undefined,
});

const creator: StateCreator<DriveSyncState> = (set, get) => ({
  phase01: 0,
  phaseMode: "scheduler",
  splitEnabled: false,
  splitFrac: DEFAULT_SPLIT_FRAC,
  sigmaSectors: 0.25,
  sectorFloor: 0.2,
  ampBase: 0,
  pumpPhaseDeg: 0,
  autophaserMode: "viz",
  intent: { x: 0, y: 0, z: 0 },
  nudge01: 0.1,
  q: 1.0,
  zeta: 0.84,
  locks: { followMode: true },
  ridgePresets: [],

  setPhase: (p: number) =>
    set((prev) => {
      const phase01 = wrap01(p);
      if (Math.abs(phase01 - prev.phase01) < PHASE_EPS) {
        return prev;
      }
      const nowMs =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const shouldPublish = nowMs - lastPhasePushMs >= PHASE_PUSH_INTERVAL_MS;
      const nextState = { ...prev, phase01 };
      if (shouldPublish) {
        lastPhasePushMs = nowMs;
        publishDriveSplit(toDriveSplitPayload(nextState));
      }
      return { phase01 };
    }),
  setPhaseMode: (m: PhaseMode) => set((prev) => {
    const next = { ...prev, phaseMode: m };
    publishDriveSplit(toDriveSplitPayload(next));
    return { phaseMode: m };
  }),
  setSplit: (on: boolean, frac?: number) => set((prev) => {
    const splitFraction = typeof frac === "number" ? clamp01(frac) : prev.splitFrac;
    const next = { ...prev, splitEnabled: !!on, splitFrac: splitFraction };
    publishDriveSplit(toDriveSplitPayload(next));
    return { splitEnabled: next.splitEnabled, splitFrac: next.splitFrac };
  }),
  setSigma: (sigmaS: number) => set((prev) => {
    const sigmaSectors = Math.max(1e-3, sigmaS);
    const next = { ...prev, sigmaSectors };
    publishDriveSplit(toDriveSplitPayload(next));
    return { sigmaSectors };
  }),
  setFloor: (f: number) => set((prev) => {
    const sectorFloor = Math.max(0, Math.min(0.99, f));
    const next = { ...prev, sectorFloor };
    publishDriveSplit(toDriveSplitPayload(next));
    return { sectorFloor };
  }),
  setAutophaserMode: (mode: AutophaserMode) => set(() => ({ autophaserMode: mode })),
  setIntent: (vec) => {
    let publishPayload: DriveIntentState | null = null;
    let changed = false;
    set((prev) => {
      const intent = {
        x: clampUnit(vec?.x ?? prev.intent.x),
        y: clampUnit(vec?.y ?? prev.intent.y),
        z: clampUnit(vec?.z ?? prev.intent.z),
      };
      if (
        Math.abs(intent.x - prev.intent.x) < INTENT_EPS &&
        Math.abs(intent.y - prev.intent.y) < INTENT_EPS &&
        Math.abs(intent.z - prev.intent.z) < INTENT_EPS
      ) {
        return prev;
      }
      publishPayload = { intent, nudge01: prev.nudge01 };
      changed = true;
      return { intent };
    });
    if (!changed || !publishPayload) return;
    publishDriveIntent(publishPayload);
  },
  setNudge01: (value: number) => {
    let publishPayload: DriveIntentState | null = null;
    let changed = false;
    set((prev) => {
      const nudge01 = clampNudge(value);
      if (Math.abs(nudge01 - prev.nudge01) < INTENT_EPS) {
        return prev;
      }
      publishPayload = { intent: prev.intent, nudge01 };
      changed = true;
      return { nudge01 };
    });
    if (!changed || !publishPayload) return;
    publishDriveIntent(publishPayload);
  },
  setQ: (q: number) => set((prev) => {
    const qClamped = Math.max(0, q);
    const next = { ...prev, q: qClamped };
    publishDriveSplit(toDriveSplitPayload(next));
    return { q: qClamped };
  }),
  setZeta: (z: number) => set((prev) => {
    const zeta = clamp01(z);
    const next = { ...prev, zeta };
    publishDriveSplit(toDriveSplitPayload(next));
    return { zeta };
  }),
  setFollowMode: (on: boolean) => set((prev) => {
    const locks = { ...prev.locks, followMode: !!on };
    const next = { ...prev, locks };
    publishDriveSplit(toDriveSplitPayload(next));
    return { locks };
  }),
  setAmpBase: (amp: number) => set((prev) => {
    const ampBase = Math.max(0, amp);
    const next = { ...prev, ampBase };
    publishDriveSplit(toDriveSplitPayload(next));
    return { ampBase };
  }),
  setPumpPhaseDeg: (deg: number) => set((prev) => {
    const wrapped = ((deg % 360) + 360) % 360;
    if (Math.abs(prev.pumpPhaseDeg - wrapped) < 1e-6) {
      return prev;
    }
    const next = { ...prev, pumpPhaseDeg: wrapped };
    publishDriveSplit(toDriveSplitPayload(next));
    return { pumpPhaseDeg: wrapped };
  }),
  setRidgePresets: (ridge: RidgePreset[]) => set(() => ({ ridgePresets: ridge })),

  effectiveSigma01: (totalSectors: number) => {
    const sigmaS = Math.max(1e-4, get().sigmaSectors);
    const total = Math.max(1, Math.floor(totalSectors || PROMOTED_WARP_PROFILE.sectorCount));
    return sigmaS / total;
  },

  shaped: (ampChain: number) => {
    const { zeta, sectorFloor, sigmaSectors } = get();
    const z = clamp01(zeta);
    const amp = ampChain * (0.85 + 0.15 * z); // 0.85..1.0 shaping window
    const sigma01 = Math.max(1e-4, (0.8 + 0.5 * (1 - z)) * sigmaSectors); // widen slightly when zeta low
    const floor = Math.max(0, Math.min(0.99, sectorFloor * (1.2 - 0.3 * z)));
    return { amp, sigma01, floor };
  },
});

export const useDriveSyncStore = createWithEqualityFn<DriveSyncState>(creator);

publishDriveSplit(toDriveSplitPayload(useDriveSyncStore.getState()));
{
  const initial = useDriveSyncStore.getState();
  publishDriveIntent({ intent: initial.intent, nudge01: initial.nudge01 });
}

const EPS = 1e-6;

subscribeDriveSplit((payload) => {
  const current = useDriveSyncStore.getState();
  const splitEnabled = payload.mode === "zeroBeta";
  if (
    Math.abs(current.phase01 - payload.phase01) < EPS &&
    current.splitEnabled === splitEnabled &&
    Math.abs(current.splitFrac - payload.split) < EPS &&
    Math.abs(current.sigmaSectors - payload.sigma) < EPS &&
    Math.abs(current.q - payload.q) < EPS &&
    Math.abs(current.zeta - payload.zeta) < EPS &&
    Math.abs(current.ampBase - payload.ampBase) < EPS &&
    (payload.pumpPhase_deg === undefined ||
      Math.abs(((current.pumpPhaseDeg ?? 0) - payload.pumpPhase_deg)) < EPS)
  ) {
    return;
  }
  useDriveSyncStore.setState({
    phase01: payload.phase01,
    splitEnabled,
    splitFrac: payload.split,
    sigmaSectors: payload.sigma,
    q: payload.q,
    zeta: payload.zeta,
    ampBase: payload.ampBase,
    pumpPhaseDeg: Number.isFinite(payload.pumpPhase_deg ?? NaN)
      ? ((payload.pumpPhase_deg! % 360) + 360) % 360
      : current.pumpPhaseDeg,
    locks: current.locks ?? { followMode: true },
  });
});

subscribeDriveIntent((payload) => {
  const current = useDriveSyncStore.getState();
  const nextIntent = payload.intent;
  if (
    Math.abs(current.intent.x - nextIntent.x) < INTENT_EPS &&
    Math.abs(current.intent.y - nextIntent.y) < INTENT_EPS &&
    Math.abs(current.intent.z - nextIntent.z) < INTENT_EPS &&
    Math.abs(current.nudge01 - payload.nudge01) < INTENT_EPS
  ) {
    return;
  }
  useDriveSyncStore.setState({
    intent: { ...nextIntent },
    nudge01: payload.nudge01,
  });
});
