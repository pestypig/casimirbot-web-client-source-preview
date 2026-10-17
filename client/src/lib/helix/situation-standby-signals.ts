import {
  HELIX_SITUATION_EVENT_SIGNAL_SCHEMA,
  type SituationEventSignal,
  type SituationEventSignalSource,
} from "@shared/helix-situation-standby";
import type { HelixWorldEvent } from "@shared/helix-world-event";

const createSignalId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now()}:${random}`;
};

export const buildSituationEventSignal = (input: {
  room_id: string;
  graph_id?: string | null;
  source_id?: string | null;
  source: SituationEventSignalSource;
  event_type: string;
  ts?: string;
  text?: string | null;
  actor?: string | null;
  speaker_id?: string | null;
  world_entity_id?: string | null;
  location?: Record<string, unknown> | null;
  evidence_refs?: string[];
  meta?: Record<string, unknown> | null;
}): SituationEventSignal => ({
  schema: HELIX_SITUATION_EVENT_SIGNAL_SCHEMA,
  signal_id: createSignalId("situation_signal"),
  room_id: input.room_id,
  graph_id: input.graph_id ?? null,
  source_id: input.source_id ?? null,
  source: input.source,
  event_type: input.event_type,
  ts: input.ts ?? new Date().toISOString(),
  text: input.text ?? null,
  actor: input.actor ?? null,
  speaker_id: input.speaker_id ?? null,
  world_entity_id: input.world_entity_id ?? null,
  location: input.location ?? null,
  evidence_refs: input.evidence_refs ?? [],
  meta: input.meta ?? null,
});

export const signalFromWorldEvent = (event: HelixWorldEvent, graphId?: string | null): SituationEventSignal =>
  buildSituationEventSignal({
    room_id: event.room_id,
    graph_id: graphId ?? null,
    source_id: event.source_id ?? null,
    source: "minecraft_event",
    event_type: event.event_type,
    ts: event.ts,
    text: event.text ?? null,
    actor: event.actor_label ?? event.actor_id ?? null,
    world_entity_id: event.actor_id ?? null,
    location: event.location ?? null,
    evidence_refs: event.evidence_refs,
    meta: {
      world_id: event.world_id,
      inventory_delta: event.inventory_delta ?? null,
      health_delta: event.health_delta ?? null,
      objective_delta: event.objective_delta ?? null,
      entities: event.entities ?? [],
      ...(event.meta ?? {}),
    },
  });

