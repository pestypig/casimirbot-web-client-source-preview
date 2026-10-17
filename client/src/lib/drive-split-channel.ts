import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";

export type SplitMode = "single" | "zeroBeta";

export interface DriveSplitState {
  mode: SplitMode;
  split: number;
  phase01: number;
  sigma: number;
  q: number;
  zeta: number;
  ampBase: number;
  pumpPhase_deg?: number;
}

const DRIVE_SPLIT_TOPIC = "drive:split";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const wrap01 = (value: number) => {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
};

export const normalizeDriveSplit = (payload: DriveSplitState): DriveSplitState => {
  const pumpPhaseRaw = Number(payload.pumpPhase_deg);
  const pumpPhaseDeg = Number.isFinite(pumpPhaseRaw)
    ? ((pumpPhaseRaw % 360) + 360) % 360
    : undefined;
  return {
    mode: payload.mode === "zeroBeta" ? "zeroBeta" : "single",
    split: clamp01(Number.isFinite(payload.split) ? payload.split : 0.5),
    phase01: wrap01(Number.isFinite(payload.phase01) ? payload.phase01 : 0),
    sigma: Math.max(1e-6, Number.isFinite(payload.sigma) ? payload.sigma : 0.25),
    q: Math.max(0, Number.isFinite(payload.q) ? payload.q : 1),
    zeta: clamp01(Number.isFinite(payload.zeta) ? payload.zeta : 0.84),
    ampBase: Math.max(0, Number.isFinite(payload.ampBase) ? payload.ampBase : 0),
    ...(pumpPhaseDeg !== undefined ? { pumpPhase_deg: pumpPhaseDeg } : {}),
  };
};

export const publishDriveSplit = (payload: DriveSplitState) => {
  publish(DRIVE_SPLIT_TOPIC, normalizeDriveSplit(payload));
};

export const subscribeDriveSplit = (handler: (payload: DriveSplitState) => void) => {
  const id = subscribe(DRIVE_SPLIT_TOPIC, (payload) => {
    handler(normalizeDriveSplit(payload as DriveSplitState));
  });
  return () => {
    unsubscribe(id);
  };
};
