import type { HelixAskLiveRuntimeVisualFrameReceipt } from
  "./HelixAskLiveRuntimeTransportController";

const MAX_TRACKED_VISUAL_FRAMES = 12;

export type HelixAskRealtimeVisualFrameProviderStatus =
  | "provider_item_added"
  | "provider_item_done"
  | "provider_error";

export type HelixAskRealtimeVisualFrameRouteKind =
  | "automatic_capture"
  | "manual_promotion"
  | "unspecified";

export type HelixAskRealtimeVisualFrameProviderAcknowledgement = {
  schema: "helix.ask.realtime.visual_frame_provider_ack.v1";
  status: HelixAskRealtimeVisualFrameProviderStatus;
  item_id: string;
  client_event_id: string;
  provider_event_id: string | null;
  provider_event_type: "conversation.item.added" | "conversation.item.done" | "error";
  route_kind: HelixAskRealtimeVisualFrameRouteKind;
  provider_error_code: string | null;
  observed_at_ms: number;
  first_provider_acknowledgement: boolean;
  provider_image_content_observed: boolean;
  first_provider_image_context_confirmation: boolean;
  model_context_evidence:
    | "provider_conversation_item_with_input_image"
    | "provider_item_identity_only"
    | "provider_error";
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

type TrackedVisualFrame = {
  itemId: string;
  clientEventId: string;
  providerAcknowledged: boolean;
  providerImageContextConfirmed: boolean;
  routeKind: HelixAskRealtimeVisualFrameRouteKind;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export type HelixAskRealtimeVisualFrameAcknowledgementTracker = {
  registerReceipt(
    receipt: HelixAskLiveRuntimeVisualFrameReceipt,
    routeKind?: HelixAskRealtimeVisualFrameRouteKind,
  ): void;
  observeProviderEvent(
    event: unknown,
  ): HelixAskRealtimeVisualFrameProviderAcknowledgement | null;
  reset(): void;
};

export const createHelixAskRealtimeVisualFrameAcknowledgementTracker = (input?: {
  nowMs?: () => number;
}): HelixAskRealtimeVisualFrameAcknowledgementTracker => {
  const byItemId = new Map<string, TrackedVisualFrame>();
  const itemIdByClientEventId = new Map<string, string>();
  const nowMs = input?.nowMs ?? Date.now;

  const prune = (): void => {
    while (byItemId.size > MAX_TRACKED_VISUAL_FRAMES) {
      const oldestItemId = byItemId.keys().next().value as string | undefined;
      if (!oldestItemId) return;
      const oldest = byItemId.get(oldestItemId);
      byItemId.delete(oldestItemId);
      if (oldest) itemIdByClientEventId.delete(oldest.clientEventId);
    }
  };

  const registerReceipt = (
    receipt: HelixAskLiveRuntimeVisualFrameReceipt,
    routeKind: HelixAskRealtimeVisualFrameRouteKind = "unspecified",
  ): void => {
    if (
      !receipt.ok ||
      receipt.conversation_item_create_sent !== true ||
      !receipt.item_id ||
      !receipt.event_id
    ) return;
    const tracked: TrackedVisualFrame = {
      itemId: receipt.item_id,
      clientEventId: receipt.event_id,
      providerAcknowledged: false,
      providerImageContextConfirmed: false,
      routeKind,
    };
    byItemId.delete(tracked.itemId);
    byItemId.set(tracked.itemId, tracked);
    itemIdByClientEventId.set(tracked.clientEventId, tracked.itemId);
    prune();
  };

  const observeProviderEvent = (
    event: unknown,
  ): HelixAskRealtimeVisualFrameProviderAcknowledgement | null => {
    const providerEvent = readRecord(event);
    const providerEventType = readString(providerEvent?.type);
    if (
      providerEventType !== "conversation.item.added" &&
      providerEventType !== "conversation.item.done" &&
      providerEventType !== "error"
    ) return null;

    const providerItem = readRecord(providerEvent?.item);
    const providerError = readRecord(providerEvent?.error);
    const providerErrorClientEventId = readString(providerError?.event_id);
    const itemId = providerEventType === "error"
      ? providerErrorClientEventId
        ? itemIdByClientEventId.get(providerErrorClientEventId) ?? null
        : null
      : readString(providerItem?.id) ?? readString(providerEvent?.item_id);
    if (!itemId) return null;
    const tracked = byItemId.get(itemId);
    if (!tracked) return null;

    const providerContent = Array.isArray(providerItem?.content)
      ? providerItem.content
      : [];
    const providerImageContentObserved = providerContent.some(
      (part) => readString(readRecord(part)?.type) === "input_image",
    );
    const firstProviderAcknowledgement =
      providerEventType !== "error" && !tracked.providerAcknowledged;
    const firstProviderImageContextConfirmation =
      providerEventType !== "error" &&
      providerImageContentObserved &&
      !tracked.providerImageContextConfirmed;
    if (providerEventType !== "error") tracked.providerAcknowledged = true;
    if (providerImageContentObserved) tracked.providerImageContextConfirmed = true;

    return {
      schema: "helix.ask.realtime.visual_frame_provider_ack.v1",
      status: providerEventType === "conversation.item.added"
        ? "provider_item_added"
        : providerEventType === "conversation.item.done"
          ? "provider_item_done"
          : "provider_error",
      item_id: tracked.itemId,
      client_event_id: tracked.clientEventId,
      provider_event_id: readString(providerEvent.event_id),
      provider_event_type: providerEventType,
      route_kind: tracked.routeKind,
      provider_error_code:
        readString(providerError?.code) ?? readString(providerError?.type),
      observed_at_ms: nowMs(),
      first_provider_acknowledgement: firstProviderAcknowledgement,
      provider_image_content_observed: providerImageContentObserved,
      first_provider_image_context_confirmation:
        firstProviderImageContextConfirmation,
      model_context_evidence: providerEventType === "error"
        ? "provider_error"
        : providerImageContentObserved
          ? "provider_conversation_item_with_input_image"
          : "provider_item_identity_only",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
  };

  return {
    registerReceipt,
    observeProviderEvent,
    reset: () => {
      byItemId.clear();
      itemIdByClientEventId.clear();
    },
  };
};
