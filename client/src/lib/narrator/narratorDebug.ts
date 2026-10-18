import { useNarratorStore, type NarratorDeliveryStatus } from "@/store/useNarratorStore";
import type {
  NarratorEventV1,
  NarratorSourceKind,
} from "@shared/contracts/narrator-event.v1";

export type NarratorDebugEventSummary = {
  event_id: string;
  source_kind: NarratorSourceKind;
  source_id: string;
  authority: NarratorEventV1["authority"];
  assistant_answer: boolean;
  terminal_eligible: boolean;
  speakable: boolean;
  requested_delivery_mode: NarratorEventV1["requestedDeliveryMode"];
  default_delivery_mode: NarratorEventV1["defaultDeliveryMode"];
  delivery_status: NarratorDeliveryStatus;
  text_hash: string;
  text_length: number;
  evidence_ref_count: number;
  trace_id: string | null;
  turn_key: string | null;
  raw_content_included: false;
};

const hashNarratorDebugText = (text: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const countByStatus = (
  events: NarratorEventV1[],
  deliveryStatusByEventId: Record<string, NarratorDeliveryStatus>,
): Record<NarratorDeliveryStatus, number> => {
  const counts: Record<NarratorDeliveryStatus, number> = {
    visible: 0,
    queued: 0,
    suppressed: 0,
    spoken: 0,
    failed: 0,
  };
  for (const event of events) {
    const status = deliveryStatusByEventId[event.eventId] ?? "visible";
    counts[status] += 1;
  }
  return counts;
};

export function buildNarratorDebugSnapshot(input?: {
  activeTurnId?: string | null;
  maxEvents?: number;
  nowMs?: number;
}): Record<string, unknown> {
  const state = useNarratorStore.getState();
  const maxEvents = Math.max(1, Math.min(100, input?.maxEvents ?? 50));
  const events = state.events.slice(0, maxEvents);
  const autoSpeakCandidateEventIds = events
    .filter((event) => {
      const policy = state.sourcePolicies[event.sourceKind];
      const status = state.queueState.deliveryStatusByEventId[event.eventId] ?? "visible";
      return Boolean(
        event.speakable &&
          event.sourceKind !== "voice_receipt" &&
          status === "visible" &&
          policy?.enabled &&
          (policy.deliveryMode === "auto_speak" || event.requestedDeliveryMode === "auto_speak"),
      );
    })
    .map((event) => event.eventId);
  const eventSummaries: NarratorDebugEventSummary[] = events.map((event) => ({
    event_id: event.eventId,
    source_kind: event.sourceKind,
    source_id: event.sourceId,
    authority: event.authority,
    assistant_answer: event.assistant_answer,
    terminal_eligible: event.terminal_eligible,
    speakable: event.speakable,
    requested_delivery_mode: event.requestedDeliveryMode,
    default_delivery_mode: event.defaultDeliveryMode,
    delivery_status: state.queueState.deliveryStatusByEventId[event.eventId] ?? "visible",
    text_hash: hashNarratorDebugText(event.text),
    text_length: event.text.length,
    evidence_ref_count: event.evidenceRefs.length,
    trace_id: event.traceId ?? null,
    turn_key: event.turnKey ?? null,
    raw_content_included: false,
  }));

  return {
    schema: "helix.narrator_debug.v1",
    generated_at_ms: input?.nowMs ?? Date.now(),
    active_turn_id: input?.activeTurnId ?? null,
    source_policies: state.sourcePolicies,
    queue_state: {
      speaking: state.queueState.speaking,
      queued_event_ids: state.queueState.queuedEventIds,
      suppressed_event_ids: state.queueState.suppressedEventIds,
      delivery_status_counts: countByStatus(events, state.queueState.deliveryStatusByEventId),
      last_spoken_dedupe_count: Object.keys(state.queueState.lastSpokenByDedupeKey).length,
      last_seen_dedupe_count: Object.keys(state.queueState.lastSeenByDedupeKey).length,
    },
    auto_speak_candidate_event_ids: autoSpeakCandidateEventIds,
    recent_events: eventSummaries,
    event_count: state.events.length,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "narrator_router_observation",
  };
}
