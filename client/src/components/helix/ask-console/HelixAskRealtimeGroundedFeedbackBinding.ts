import {
  isHelixRealtimeGroundedFeedbackBindingV1,
  type HelixRealtimeGroundedFeedbackBindingV1,
} from "@shared/contracts/helix-realtime-stage-play.v1";

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const readHelixAskRealtimeGroundedFeedbackBinding = (
  routeMetadata: unknown,
): HelixRealtimeGroundedFeedbackBindingV1 | null => {
  const metadata = readRecord(routeMetadata);
  if (!metadata) return null;
  const candidate =
    metadata.realtime_grounded_feedback_binding ??
    metadata.realtimeGroundedFeedbackBinding;
  return isHelixRealtimeGroundedFeedbackBindingV1(candidate) ? candidate : null;
};
