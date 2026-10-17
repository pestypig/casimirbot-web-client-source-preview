import {
  HELIX_SITUATION_GOAL_HYPOTHESIS_SCHEMA,
  HELIX_SITUATION_STATE_PROJECTION_SCHEMA,
  type SituationEventSignal,
  type SituationGoalHypothesis,
  type SituationStateProjection,
} from "@shared/helix-situation-standby";

const createId = (prefix: string, seed: string): string => `${prefix}:${seed.replace(/[^a-z0-9:_-]+/gi, "_").slice(0, 96)}`;

const textOf = (signal: SituationEventSignal): string => String(signal.text ?? "").toLowerCase();

const hasHealthRisk = (signal: SituationEventSignal): boolean => {
  const text = textOf(signal);
  const healthDelta = signal.meta?.health_delta;
  if (text.includes("low health") || text.includes("damage") || text.includes("death")) return true;
  if (healthDelta && typeof healthDelta === "object") {
    const record = healthDelta as Record<string, unknown>;
    const current = Number(record.current ?? record.health ?? record.value);
    return Number.isFinite(current) && current <= 6;
  }
  return false;
};

export const buildSituationStateProjection = (input: {
  room_id: string;
  graph_id?: string | null;
  signals: SituationEventSignal[];
  active_sources?: Array<{ source_id: string; status: string; source_kind?: string }>;
  speakers?: Array<{ speaker_id: string; display_name?: string; native_language?: string; authority?: string }>;
  now?: string;
}): SituationStateProjection => {
  const signals = input.signals.slice(-50);
  const firstTs = signals[0]?.ts ?? input.now ?? new Date().toISOString();
  const lastTs = signals.at(-1)?.ts ?? input.now ?? firstTs;
  return {
    schema: HELIX_SITUATION_STATE_PROJECTION_SCHEMA,
    projection_id: createId("situation_projection", `${input.room_id}:${input.graph_id ?? "room"}:${lastTs}`),
    room_id: input.room_id,
    graph_id: input.graph_id ?? null,
    updated_at: input.now ?? lastTs,
    window: {
      from_ts: firstTs,
      to_ts: lastTs,
      event_count: signals.length,
    },
    speakers: input.speakers ?? [],
    active_sources: input.active_sources ?? [],
    world_state: {
      health_risk: signals.some((signal: SituationEventSignal) => hasHealthRisk(signal)),
      recent_world_events: signals.filter((signal: SituationEventSignal) => signal.source === "minecraft_event").slice(-8).length,
    },
    recent_facts: signals.slice(-8).map((signal: SituationEventSignal, index: number) => ({
      fact_id: createId("fact", `${signal.signal_id}:${index}`),
      text: signal.text?.trim() || `${signal.source} / ${signal.event_type}`,
      evidence_refs: signal.evidence_refs,
    })),
  };
};

export const inferSituationGoalHypotheses = (input: {
  room_id: string;
  graph_id?: string | null;
  signals: SituationEventSignal[];
  now?: string;
}): SituationGoalHypothesis[] => {
  const blazeSignals = input.signals.filter((signal: SituationEventSignal) => {
    const text = textOf(signal);
    return text.includes("blaze rod") || text.includes("fortress") || text.includes("spawner");
  });
  if (blazeSignals.length === 0) return [];
  return [
    {
      schema: HELIX_SITUATION_GOAL_HYPOTHESIS_SCHEMA,
      hypothesis_id: createId("goal", `${input.room_id}:${input.graph_id ?? "room"}:collect_blaze_rods`),
      room_id: input.room_id,
      graph_id: input.graph_id ?? null,
      goal_label: "collect blaze rods",
      confidence: Math.min(0.95, 0.55 + blazeSignals.length * 0.12),
      status: blazeSignals.some((signal: SituationEventSignal) => textOf(signal).includes("acquired")) ? "active" : "hypothesis",
      evidence_refs: blazeSignals.flatMap((signal: SituationEventSignal) => signal.evidence_refs).slice(0, 8),
      derived_from_signal_ids: blazeSignals.map((signal: SituationEventSignal) => signal.signal_id),
      updated_at: input.now ?? new Date().toISOString(),
    },
  ];
};
