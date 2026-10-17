import type {
  HelixWorkstationInteractionKind,
  HelixWorkstationUiFramePressure,
} from "@shared/helix-workstation-task-manager";

export type WorkstationFrameDurationSample = {
  ts: number;
  frameMs: number;
};

export type WorkstationLongTaskSample = {
  ts: number;
  durationMs: number;
};

export type WorkstationInteractionSample = {
  ts: number;
  kind: HelixWorkstationInteractionKind;
  inputDelayMs: number | null;
  inputToNextFrameMs: number | null;
};

export type WorkstationFrameSummary = {
  fps: number | null;
  average_frame_ms: number | null;
  p95_frame_ms: number | null;
  worst_frame_ms: number | null;
  long_frame_count: number;
  long_frame_ratio: number | null;
};

export type WorkstationInteractionSummary = {
  interaction_event_count: number;
  input_delay_p95_ms: number | null;
  input_to_next_frame_p95_ms: number | null;
  click_to_next_frame_p95_ms: number | null;
  scroll_jank_count: number;
  drag_jank_count: number;
  active_interaction_kind: HelixWorkstationInteractionKind | null;
};

const roundOne = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
};

const percentile = (values: readonly number[], percentileRank: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileRank * sorted.length) - 1));
  return sorted[index] ?? null;
};

export const summarizeWorkstationFrameDurations = (
  frames: readonly WorkstationFrameDurationSample[],
  nowMs: number,
  windowMs: number,
): WorkstationFrameSummary => {
  const cutoff = nowMs - Math.max(1, windowMs);
  const recent = frames.filter((frame: WorkstationFrameDurationSample) => frame.ts >= cutoff && frame.frameMs >= 0);
  if (recent.length === 0) {
    return {
      fps: null,
      average_frame_ms: null,
      p95_frame_ms: null,
      worst_frame_ms: null,
      long_frame_count: 0,
      long_frame_ratio: null,
    };
  }
  const durations = recent.map((frame: WorkstationFrameDurationSample) => frame.frameMs);
  const durationSum = durations.reduce((sum: number, value: number) => sum + value, 0);
  const longFrameCount = durations.filter((value: number) => value >= 50).length;
  const coveredWindowMs = Math.max(1000, Math.min(windowMs, nowMs - recent[0].ts));
  return {
    fps: roundOne((recent.length / coveredWindowMs) * 1000),
    average_frame_ms: roundOne(durationSum / durations.length),
    p95_frame_ms: roundOne(percentile(durations, 0.95)),
    worst_frame_ms: roundOne(Math.max(...durations)),
    long_frame_count: longFrameCount,
    long_frame_ratio: roundOne(longFrameCount / durations.length),
  };
};

export const summarizeWorkstationLongTasks = (
  tasks: readonly WorkstationLongTaskSample[],
  nowMs: number,
  windowMs: number,
): { long_task_count: number; long_task_total_ms: number } => {
  const cutoff = nowMs - Math.max(1, windowMs);
  const recent = tasks.filter((task: WorkstationLongTaskSample) => task.ts >= cutoff && task.durationMs >= 0);
  return {
    long_task_count: recent.length,
    long_task_total_ms: roundOne(recent.reduce((sum: number, task: WorkstationLongTaskSample) => sum + task.durationMs, 0)) ?? 0,
  };
};

export const summarizeWorkstationInteractions = (
  interactions: readonly WorkstationInteractionSample[],
  nowMs: number,
  windowMs: number,
): WorkstationInteractionSummary => {
  const cutoff = nowMs - Math.max(1, windowMs);
  const recent = interactions.filter((interaction: WorkstationInteractionSample) => interaction.ts >= cutoff);
  const inputDelays = recent
    .map((interaction: WorkstationInteractionSample) => interaction.inputDelayMs)
    .filter((value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const nextFrameLatencies = recent
    .map((interaction: WorkstationInteractionSample) => interaction.inputToNextFrameMs)
    .filter((value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const clickNextFrameLatencies = recent
    .filter((interaction: WorkstationInteractionSample) => interaction.kind === "click")
    .map((interaction: WorkstationInteractionSample) => interaction.inputToNextFrameMs)
    .filter((value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const latest = recent[recent.length - 1] ?? null;
  return {
    interaction_event_count: recent.length,
    input_delay_p95_ms: roundOne(percentile(inputDelays, 0.95)),
    input_to_next_frame_p95_ms: roundOne(percentile(nextFrameLatencies, 0.95)),
    click_to_next_frame_p95_ms: roundOne(percentile(clickNextFrameLatencies, 0.95)),
    scroll_jank_count: recent.filter((interaction: WorkstationInteractionSample) =>
      interaction.kind === "scroll" &&
      typeof interaction.inputToNextFrameMs === "number" &&
      interaction.inputToNextFrameMs >= 80
    ).length,
    drag_jank_count: recent.filter((interaction: WorkstationInteractionSample) =>
      (interaction.kind === "panel_drag" || interaction.kind === "pointer") &&
      typeof interaction.inputToNextFrameMs === "number" &&
      interaction.inputToNextFrameMs >= 80
    ).length,
    active_interaction_kind: latest?.kind ?? null,
  };
};

export const classifyWorkstationUiFramePressure = (input: {
  fps: number | null;
  p95FrameMs: number | null;
  worstFrameMs: number | null;
  longFrameRatio: number | null;
  longTaskCount: number;
}): HelixWorkstationUiFramePressure => {
  if (input.fps == null && input.p95FrameMs == null && input.worstFrameMs == null) {
    return "unknown";
  }
  if (
    (input.fps != null && input.fps < 15) ||
    (input.p95FrameMs != null && input.p95FrameMs >= 100) ||
    (input.worstFrameMs != null && input.worstFrameMs >= 250) ||
    (input.longFrameRatio != null && input.longFrameRatio >= 0.3) ||
    input.longTaskCount >= 12
  ) {
    return "blocked";
  }
  if (
    (input.fps != null && input.fps < 35) ||
    (input.p95FrameMs != null && input.p95FrameMs >= 50) ||
    (input.worstFrameMs != null && input.worstFrameMs >= 120) ||
    (input.longFrameRatio != null && input.longFrameRatio >= 0.1) ||
    input.longTaskCount >= 4
  ) {
    return "degraded";
  }
  return "normal";
};

export const classifyWorkstationInteractionPressure = (input: {
  inputDelayP95Ms: number | null;
  inputToNextFrameP95Ms: number | null;
  clickToNextFrameP95Ms: number | null;
  scrollJankCount: number;
  dragJankCount: number;
  longTaskCount: number;
}): HelixWorkstationUiFramePressure => {
  if (
    input.inputDelayP95Ms == null &&
    input.inputToNextFrameP95Ms == null &&
    input.clickToNextFrameP95Ms == null &&
    input.scrollJankCount === 0 &&
    input.dragJankCount === 0
  ) {
    return "unknown";
  }
  if (
    (input.inputDelayP95Ms != null && input.inputDelayP95Ms >= 120) ||
    (input.inputToNextFrameP95Ms != null && input.inputToNextFrameP95Ms >= 180) ||
    (input.clickToNextFrameP95Ms != null && input.clickToNextFrameP95Ms >= 180) ||
    input.scrollJankCount >= 12 ||
    input.dragJankCount >= 12 ||
    input.longTaskCount >= 12
  ) {
    return "blocked";
  }
  if (
    (input.inputDelayP95Ms != null && input.inputDelayP95Ms >= 50) ||
    (input.inputToNextFrameP95Ms != null && input.inputToNextFrameP95Ms >= 80) ||
    (input.clickToNextFrameP95Ms != null && input.clickToNextFrameP95Ms >= 80) ||
    input.scrollJankCount >= 4 ||
    input.dragJankCount >= 4 ||
    input.longTaskCount >= 4
  ) {
    return "degraded";
  }
  return "normal";
};
