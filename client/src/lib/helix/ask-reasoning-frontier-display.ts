import type { ReasoningTheaterFrontierAction } from "@/lib/helix/reasoning-theater-config";

export type ReasoningTheaterFloatingActionTone = "gain" | "loss" | "tool" | "gate" | "steady";

export type ReasoningTheaterFloatingActionText = {
  id: string;
  text: string;
  tone: ReasoningTheaterFloatingActionTone;
  leftPct: number;
  driftPx: number;
  yPx: number;
  durationMs: number;
};

export const REASONING_THEATER_FRONTIER_ACTION_LABEL: Record<ReasoningTheaterFrontierAction, string> = {
  large_gain: "Large gain",
  small_gain: "Small gain",
  steady: "Steady",
  small_loss: "Small loss",
  large_loss: "Large loss",
  hard_drop: "Hard drop",
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildReasoningTheaterFloatingActionText(input: {
  id: string;
  frontierAction: ReasoningTheaterFrontierAction;
  frontierDeltaPct: number;
  meterPct: number;
  latestLiveEvent: { label?: string | null } | null;
  seed: number;
}): ReasoningTheaterFloatingActionText {
  const magnitude = Math.max(1, Math.round(Math.abs(input.frontierDeltaPct)));
  const eventLabel = input.latestLiveEvent?.label ?? "Working";
  let text = "";
  let tone: ReasoningTheaterFloatingActionTone = "steady";
  if (input.frontierAction === "large_gain" || input.frontierAction === "small_gain") {
    text = `+${magnitude} clarity`;
    tone = "gain";
  } else if (
    input.frontierAction === "large_loss" ||
    input.frontierAction === "small_loss" ||
    input.frontierAction === "hard_drop"
  ) {
    text = `-${magnitude} pressure`;
    tone = "loss";
  } else if (eventLabel === "Observation") {
    text = "tool";
    tone = "tool";
  } else if (eventLabel === "Decision" || eventLabel === "Final") {
    text = eventLabel === "Final" ? "settle" : "choose";
    tone = "gate";
  } else {
    text = "hold";
  }
  const seedJitter = ((input.seed % 23) - 11) * 0.9;
  return {
    id: input.id,
    text,
    tone,
    leftPct: clampNumber(input.meterPct + seedJitter, 5, 95),
    driftPx: ((input.seed >>> 3) % 15) - 7,
    yPx: -18 - ((input.seed >>> 7) % 12),
    durationMs: 1180 + ((input.seed >>> 11) % 360),
  };
}

export function reasoningTheaterFloatingActionTextClassName(
  tone: ReasoningTheaterFloatingActionTone,
): string {
  if (tone === "gain") return "border-emerald-200/35 bg-emerald-300/10 text-emerald-100";
  if (tone === "loss") return "border-rose-200/35 bg-rose-300/10 text-rose-100";
  if (tone === "tool") return "border-cyan-200/35 bg-cyan-300/10 text-cyan-100";
  if (tone === "gate") return "border-violet-200/35 bg-violet-300/10 text-violet-100";
  return "border-slate-200/25 bg-white/5 text-slate-200";
}
