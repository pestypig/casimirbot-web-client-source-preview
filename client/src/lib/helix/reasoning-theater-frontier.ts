import type {
  ReasoningTheaterFrontierAction,
  ReasoningTheaterFrontierActionsConfig,
  ReasoningTheaterFrontierParticleProfile,
  ReasoningTheaterFrontierThresholds,
} from "@/lib/helix/reasoning-theater-config";

export type ReasoningTheaterFrontierStance =
  | "winning"
  | "contested"
  | "losing"
  | "fail_closed";

export type ReasoningTheaterFrontierSample = {
  tsMs: number;
  meterPct: number;
};

export type ReasoningTheaterFrontierTrackerState = {
  committedAction: ReasoningTheaterFrontierAction;
  committedAtMs: number;
  candidateAction: ReasoningTheaterFrontierAction;
  candidateFrames: number;
  lastWindowDeltaPct: number;
  history: ReasoningTheaterFrontierSample[];
};

export type ReasoningTheaterFrontierAdvanceInput = {
  nowMs: number;
  meterPct: number;
  stance: ReasoningTheaterFrontierStance;
  suppressionReason?: string | null;
  config: ReasoningTheaterFrontierActionsConfig;
};

export type ReasoningTheaterFrontierAdvanceResult = {
  state: ReasoningTheaterFrontierTrackerState;
  actionChanged: boolean;
};

const HARD_DROP_SUPPRESSIONS = new Set(["missing_evidence", "contract_violation"]);

export function clampFrontierMeterPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function findWindowAnchorSample(
  history: ReasoningTheaterFrontierSample[],
  targetTsMs: number,
): ReasoningTheaterFrontierSample | null {
  if (history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].tsMs <= targetTsMs) return history[i];
  }
  return history[0] ?? null;
}

export function classifyReasoningTheaterFrontierAction(input: {
  windowDeltaPct: number;
  stance: ReasoningTheaterFrontierStance;
  suppressionReason?: string | null;
  thresholds: ReasoningTheaterFrontierThresholds;
}): ReasoningTheaterFrontierAction {
  const { windowDeltaPct, stance, suppressionReason, thresholds } = input;
  if (
    stance === "fail_closed" ||
    HARD_DROP_SUPPRESSIONS.has((suppressionReason ?? "").toLowerCase()) ||
    windowDeltaPct <= thresholds.hard_drop_delta_pct
  ) {
    return "hard_drop";
  }
  if (windowDeltaPct >= thresholds.large_gain_delta_pct) return "large_gain";
  if (windowDeltaPct >= thresholds.small_gain_delta_pct) return "small_gain";
  if (windowDeltaPct <= thresholds.large_loss_delta_pct) return "large_loss";
  if (windowDeltaPct <= thresholds.small_loss_delta_pct) return "small_loss";
  return "steady";
}

export function createReasoningTheaterFrontierTrackerState(
  initialAction: ReasoningTheaterFrontierAction = "steady",
): ReasoningTheaterFrontierTrackerState {
  return {
    committedAction: initialAction,
    committedAtMs: 0,
    candidateAction: initialAction,
    candidateFrames: 0,
    lastWindowDeltaPct: 0,
    history: [],
  };
}

export function advanceReasoningTheaterFrontierTracker(
  state: ReasoningTheaterFrontierTrackerState,
  input: ReasoningTheaterFrontierAdvanceInput,
): ReasoningTheaterFrontierAdvanceResult {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const meterPct = clampFrontierMeterPct(input.meterPct);
  const nextHistory = [...state.history, { tsMs: nowMs, meterPct }];
  const maxHistoryMs = Math.max(input.config.window_ms * 3, 600);
  const keepAfterTs = nowMs - maxHistoryMs;
  while (nextHistory.length > 0 && nextHistory[0].tsMs < keepAfterTs) {
    nextHistory.shift();
  }
  const anchor = findWindowAnchorSample(nextHistory, nowMs - input.config.window_ms);
  const windowDeltaPct = meterPct - (anchor?.meterPct ?? meterPct);
  const candidate = classifyReasoningTheaterFrontierAction({
    windowDeltaPct,
    stance: input.stance,
    suppressionReason: input.suppressionReason,
    thresholds: input.config.thresholds,
  });

  let candidateAction = state.candidateAction;
  let candidateFrames = state.candidateFrames;
  let committedAction = state.committedAction;
  let committedAtMs = state.committedAtMs;
  let actionChanged = false;

  if (candidate === committedAction) {
    candidateAction = candidate;
    candidateFrames = 0;
  } else {
    if (candidateAction === candidate) {
      candidateFrames += 1;
    } else {
      candidateAction = candidate;
      candidateFrames = 1;
    }
    const canSwapByHold = nowMs - committedAtMs >= input.config.min_action_ms;
    const shouldHardDrop = candidate === "hard_drop" && committedAction !== "hard_drop";
    if (shouldHardDrop || (candidateFrames >= input.config.switch_hold_frames && canSwapByHold)) {
      committedAction = candidate;
      committedAtMs = nowMs;
      candidateFrames = 0;
      actionChanged = true;
    }
  }

  return {
    actionChanged,
    state: {
      committedAction,
      committedAtMs,
      candidateAction,
      candidateFrames,
      lastWindowDeltaPct: windowDeltaPct,
      history: nextHistory,
    },
  };
}

export function resolveReasoningTheaterFrontierParticleProfile(
  action: ReasoningTheaterFrontierAction,
  config: ReasoningTheaterFrontierActionsConfig,
): ReasoningTheaterFrontierParticleProfile {
  return config.actions[action].particle_profile;
}

export function resolveReasoningTheaterFrontierIconPath(
  action: ReasoningTheaterFrontierAction,
  config: ReasoningTheaterFrontierActionsConfig,
): string {
  return config.actions[action].icon_path;
}

