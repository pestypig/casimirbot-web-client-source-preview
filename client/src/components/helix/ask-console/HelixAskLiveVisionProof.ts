export type HelixAskLiveVisionRouteProofStatus =
  | "not_observed"
  | "transport_sent"
  | "provider_item_acknowledged"
  | "provider_image_context_confirmed";

export type HelixAskLiveVisionProof = {
  schema: "helix.ask.live_vision.proof.v1";
  status:
    | "not_observed"
    | "transport_only"
    | "provider_item_acknowledged"
    | "provider_image_context_confirmed"
    | "provider_error";
  automatic_capture: {
    status: HelixAskLiveVisionRouteProofStatus;
    transport_sent_count: number;
    provider_image_context_confirmed_count: number;
  };
  manual_promotion: {
    status: HelixAskLiveVisionRouteProofStatus;
    transport_sent_count: number;
    provider_image_context_confirmed_count: number;
  };
  total_transport_sent_count: number;
  total_provider_item_acknowledged_count: number;
  total_provider_image_context_confirmed_count: number;
  automatic_capture_transport_ready: boolean;
  manual_promotion_transport_ready: boolean;
  semantic_marker_test_required: true;
  semantic_model_use_confirmed: false;
  evidence_scope: "client_transport_and_provider_conversation_item_only";
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

type HelixAskLiveVisionProofInput = {
  visual_frame_sent_count: number;
  visual_frame_provider_acknowledged_count: number;
  visual_frame_provider_image_confirmed_count: number;
  visual_frame_automatic_sent_count: number;
  visual_frame_manual_sent_count: number;
  visual_frame_automatic_provider_acknowledged_count: number;
  visual_frame_manual_provider_acknowledged_count: number;
  visual_frame_automatic_provider_image_confirmed_count: number;
  visual_frame_manual_provider_image_confirmed_count: number;
  latest_visual_frame_provider_acknowledgement?: {
    status?: unknown;
    route_kind?: unknown;
  } | null;
};

const boundedCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const routeStatus = (input: {
  sent: number;
  acknowledged: number;
  confirmed: number;
}): HelixAskLiveVisionRouteProofStatus => {
  if (input.confirmed > 0) return "provider_image_context_confirmed";
  if (input.acknowledged > 0) {
    return "provider_item_acknowledged";
  }
  return input.sent > 0 ? "transport_sent" : "not_observed";
};

export const buildHelixAskLiveVisionProof = (
  input: HelixAskLiveVisionProofInput,
): HelixAskLiveVisionProof => {
  const sent = boundedCount(input.visual_frame_sent_count);
  const acknowledged = boundedCount(
    input.visual_frame_provider_acknowledged_count,
  );
  const confirmed = boundedCount(
    input.visual_frame_provider_image_confirmed_count,
  );
  const automaticSent = boundedCount(input.visual_frame_automatic_sent_count);
  const manualSent = boundedCount(input.visual_frame_manual_sent_count);
  const automaticAcknowledged = boundedCount(
    input.visual_frame_automatic_provider_acknowledged_count,
  );
  const manualAcknowledged = boundedCount(
    input.visual_frame_manual_provider_acknowledged_count,
  );
  const automaticConfirmed = boundedCount(
    input.visual_frame_automatic_provider_image_confirmed_count,
  );
  const manualConfirmed = boundedCount(
    input.visual_frame_manual_provider_image_confirmed_count,
  );
  const providerError =
    input.latest_visual_frame_provider_acknowledgement?.status ===
    "provider_error";

  return {
    schema: "helix.ask.live_vision.proof.v1",
    status: providerError
      ? "provider_error"
      : confirmed > 0
        ? "provider_image_context_confirmed"
        : acknowledged > 0
          ? "provider_item_acknowledged"
          : sent > 0
            ? "transport_only"
            : "not_observed",
    automatic_capture: {
      status: routeStatus({
        sent: automaticSent,
        acknowledged: automaticAcknowledged,
        confirmed: automaticConfirmed,
      }),
      transport_sent_count: automaticSent,
      provider_image_context_confirmed_count: automaticConfirmed,
    },
    manual_promotion: {
      status: routeStatus({
        sent: manualSent,
        acknowledged: manualAcknowledged,
        confirmed: manualConfirmed,
      }),
      transport_sent_count: manualSent,
      provider_image_context_confirmed_count: manualConfirmed,
    },
    total_transport_sent_count: sent,
    total_provider_item_acknowledged_count: acknowledged,
    total_provider_image_context_confirmed_count: confirmed,
    automatic_capture_transport_ready: automaticConfirmed > 0,
    manual_promotion_transport_ready: manualConfirmed > 0,
    semantic_marker_test_required: true,
    semantic_model_use_confirmed: false,
    evidence_scope: "client_transport_and_provider_conversation_item_only",
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};
