import type {
  ReasoningBattleAmbientState,
  ReasoningBattleBeat,
  ReasoningBattleLane,
  ReasoningBattleVisualPrimitive,
} from "@/lib/helix/reasoning-battle-stage";
import { hash32 } from "@/lib/helix/ask-stable-hash";

export type ReasoningBattlePrimitiveStyle = {
  left: string;
  opacity: string;
  transform: string;
  animation?: string;
  "--battle-primitive-drift": string;
  "--battle-primitive-y": string;
  "--battle-primitive-scale": string;
};

export type ReasoningBattleAnswerTint = {
  style: {
    background: string;
    boxShadow: string;
  };
  palette: string;
  label: string;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function reasoningBattleBeatPositionPct(beat: ReasoningBattleBeat): number {
  const jitter = (hash32(`${beat.id}:x`) % 1700) / 100;
  if (beat.lane === "orb") return clampNumber(24 + jitter, 10, 58);
  if (beat.lane === "ambiguity") return clampNumber(62 + jitter, 54, 94);
  if (beat.lane === "terminal") return clampNumber(76 + jitter * 0.7, 70, 96);
  return clampNumber(10 + jitter * 0.9, 6, 30);
}

export function reasoningBattleBeatHeightPx(beat: ReasoningBattleBeat): number {
  const jitter = hash32(`${beat.id}:y`) % 8;
  return -18 - Math.abs(beat.impact) * 4 - jitter;
}

export function reasoningBattlePrimitiveClassName(primitive: ReasoningBattleVisualPrimitive): string {
  const laneClass =
    primitive.lane === "orb"
      ? "border-emerald-200/55 bg-emerald-200/45 shadow-[0_0_10px_rgba(110,231,183,0.45)]"
      : primitive.lane === "ambiguity"
        ? "border-rose-200/60 bg-rose-300/45 shadow-[0_0_10px_rgba(251,113,133,0.42)]"
        : primitive.lane === "terminal"
          ? "border-cyan-100/70 bg-cyan-200/50 shadow-[0_0_12px_rgba(103,232,249,0.48)]"
          : "border-slate-200/45 bg-slate-200/35 shadow-[0_0_8px_rgba(226,232,240,0.28)]";
  if (primitive.kind === "slash") return `${laneClass} h-7 w-[2px] rotate-[24deg] rounded-full`;
  if (primitive.kind === "gate") return `${laneClass} h-8 w-[3px] rounded-sm`;
  if (primitive.kind === "notch") return `${laneClass} h-3 w-5 rounded-[2px]`;
  if (primitive.kind === "recoil") return `${laneClass} h-[2px] w-7 rounded-full`;
  if (primitive.kind === "ring") return `${laneClass} h-7 w-7 rounded-full border-2 bg-transparent`;
  if (primitive.kind === "spark") return `${laneClass} h-2.5 w-2.5 rotate-45 rounded-[2px]`;
  if (primitive.kind === "settle") return `${laneClass} h-6 w-6 rounded-full border-2 bg-cyan-200/15`;
  return `${laneClass} h-4 w-4 rounded-full`;
}

export function reasoningBattlePrimitiveStyle(input: {
  beat: ReasoningBattleBeat;
  primitive: ReasoningBattleVisualPrimitive;
  reducedMotion: boolean;
}): ReasoningBattlePrimitiveStyle {
  const { beat, primitive, reducedMotion } = input;
  const yPx =
    primitive.kind === "ring" || primitive.kind === "settle"
      ? -8
      : primitive.lane === "ambiguity"
        ? -4
        : -10;
  const driftBase = (hash32(`${beat.id}:primitive-drift`) % 15) - 7;
  const driftPx =
    primitive.direction === "backward" ? -Math.abs(driftBase) - 5 : primitive.direction === "forward" ? Math.abs(driftBase) + 5 : 0;
  return {
    left: `${reasoningBattleBeatPositionPct(beat)}%`,
    opacity: `${0.62 + primitive.intensity * 0.1}`,
    transform: reducedMotion
      ? `translate3d(-50%, ${yPx}px, 0)`
      : "translate3d(-50%, -50%, 0)",
    animation: reducedMotion
      ? undefined
      : `helixReasoningBattlePrimitive ${beat.ttl_ms + 140}ms ease-out forwards`,
    "--battle-primitive-drift": `${driftPx}px`,
    "--battle-primitive-y": `${yPx}px`,
    "--battle-primitive-scale": `${1 + primitive.intensity * 0.09}`,
  };
}

export function reasoningBattleAmbientClassName(state: ReasoningBattleAmbientState, reducedMotion: boolean): string {
  const laneClass =
    state.lane === "orb"
      ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100"
      : state.lane === "ambiguity"
        ? "border-rose-200/35 bg-rose-300/10 text-rose-100"
        : state.lane === "terminal"
          ? "border-cyan-200/35 bg-cyan-300/10 text-cyan-100"
          : "border-slate-200/25 bg-white/5 text-slate-200";
  const motionClass = reducedMotion || state.intensity === 0 ? "" : "animate-pulse";
  return `${laneClass} ${motionClass}`.trim();
}

export function reasoningBattleAmbientMarkerClassName(state: ReasoningBattleAmbientState, reducedMotion: boolean): string {
  const laneClass =
    state.lane === "orb"
      ? "bg-emerald-200/45 shadow-[0_0_12px_rgba(110,231,183,0.42)]"
      : state.lane === "ambiguity"
        ? "bg-rose-300/45 shadow-[0_0_12px_rgba(251,113,133,0.40)]"
        : state.lane === "terminal"
          ? "bg-cyan-200/45 shadow-[0_0_12px_rgba(103,232,249,0.42)]"
          : "bg-slate-200/35 shadow-[0_0_8px_rgba(226,232,240,0.24)]";
  const motionClass = reducedMotion || state.intensity === 0 ? "" : "animate-pulse";
  return `${laneClass} ${motionClass}`.trim();
}

export function buildReasoningBattleAnswerTint(input: {
  beats: ReasoningBattleBeat[];
  ambient: ReasoningBattleAmbientState;
}): ReasoningBattleAnswerTint | null {
  if (input.beats.length === 0 && input.ambient.kind === "idle") return null;
  const palette = {
    orb: { r: 16, g: 185, b: 129 },
    ambiguity: { r: 244, g: 63, b: 94 },
    terminal: { r: 34, g: 211, b: 238 },
    neutral: { r: 148, g: 163, b: 184 },
  } satisfies Record<ReasoningBattleLane, { r: number; g: number; b: number }>;
  const totals = input.beats.reduce(
    (acc, beat) => {
      const weight = Math.max(1, Math.abs(beat.impact)) * (beat.lane === "terminal" ? 1.25 : 1);
      const color = palette[beat.lane];
      acc.r += color.r * weight;
      acc.g += color.g * weight;
      acc.b += color.b * weight;
      acc.weight += weight;
      acc.pressure += beat.pressure_delta;
      acc.progress += beat.progress_delta;
      return acc;
    },
    { r: 0, g: 0, b: 0, weight: 0, pressure: 0, progress: 0 },
  );
  const ambientColor = palette[input.ambient.lane];
  const ambientWeight = input.ambient.intensity === 0 ? 0.35 : input.ambient.intensity * 0.75;
  totals.r += ambientColor.r * ambientWeight;
  totals.g += ambientColor.g * ambientWeight;
  totals.b += ambientColor.b * ambientWeight;
  totals.weight += ambientWeight;
  if (totals.weight <= 0) return null;
  const r = Math.round(totals.r / totals.weight);
  const g = Math.round(totals.g / totals.weight);
  const b = Math.round(totals.b / totals.weight);
  const balance =
    totals.pressure > totals.progress
      ? "pressure"
      : totals.progress > totals.pressure
        ? "constructive"
        : input.ambient.kind;
  return {
    label: balance,
    palette: `rgb(${r}, ${g}, ${b})`,
    style: {
      background:
        `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.18), rgba(${r}, ${g}, ${b}, 0.07) 48%, rgba(8, 47, 73, 0.18)), rgba(8, 47, 73, 0.18)`,
      boxShadow: `inset 0 1px 0 rgba(${r}, ${g}, ${b}, 0.16), 0 0 26px rgba(${r}, ${g}, ${b}, 0.08)`,
    },
  };
}
