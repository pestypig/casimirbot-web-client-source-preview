import type {
  SituationEpisode,
  SituationEpisodeNarration,
  SituationPrediction,
} from "@shared/helix-situation-episode";
import type { HelixWorldEvent } from "@shared/helix-world-event";

const eventId = (event: HelixWorldEvent): string =>
  event.evidence_refs?.[0] ??
  `world-event:${event.world_id}:${event.event_type}:${event.ts}:${
    event.actor_id ?? event.actor_label ?? "world"
  }`;

export function summarizeEpisodeForRuntime(episode: SituationEpisode): string {
  return episode.summary_seed;
}

export function summarizeEpisodeNarrationForRuntime(
  narration: SituationEpisodeNarration,
): string {
  return narration.text;
}

export function summarizePredictionForRuntime(prediction: SituationPrediction): string {
  return `${prediction.predicted_goal} (${Math.round(prediction.confidence * 100)}%)`;
}

export function buildClientEpisodeEventKey(events: HelixWorldEvent[]): string {
  return events.map(eventId).join("|");
}
