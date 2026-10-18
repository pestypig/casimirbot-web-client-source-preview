import { describe, expect, it } from "vitest";
import type { HelixAskLiveRuntimeVisualFrameReceipt } from
  "../HelixAskLiveRuntimeTransportController";
import {
  createHelixAskRealtimeVisualFrameAcknowledgementTracker,
} from "../HelixAskRealtimeVisualFrameAcknowledgement";

const sentReceipt = (input?: {
  itemId?: string;
  eventId?: string;
}): HelixAskLiveRuntimeVisualFrameReceipt => ({
  schema: "helix.ask.live_runtime.visual_frame_receipt.v1",
  ok: true,
  status: "sent",
  code: "visual_frame_sent",
  observed_at_ms: 100,
  source_kind: "screen",
  source_label: "Shared screen",
  detail: "auto",
  media_type: "image/jpeg",
  frame_size_bytes: 128,
  event_id: input?.eventId ?? "hve_frame_1",
  item_id: input?.itemId ?? "hvi_frame_1",
  pruned_item_id: null,
  retained_item_count: 1,
  conversation_item_create_sent: true,
  conversation_item_delete_sent: false,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  reentry_required: true,
});

describe("GPT Live visual frame provider acknowledgement", () => {
  it("correlates item-added and item-done events without double counting", () => {
    const tracker = createHelixAskRealtimeVisualFrameAcknowledgementTracker({
      nowMs: () => 250,
    });
    tracker.registerReceipt(sentReceipt(), "automatic_capture");

    expect(tracker.observeProviderEvent({
      type: "conversation.item.added",
      event_id: "provider_added_1",
      item: {
        id: "hvi_frame_1",
        type: "message",
        role: "user",
        content: [{ type: "input_image" }, { type: "input_text" }],
      },
    })).toMatchObject({
      status: "provider_item_added",
      item_id: "hvi_frame_1",
      client_event_id: "hve_frame_1",
      provider_event_id: "provider_added_1",
      route_kind: "automatic_capture",
      first_provider_acknowledgement: true,
      provider_image_content_observed: true,
      first_provider_image_context_confirmation: true,
      model_context_evidence: "provider_conversation_item_with_input_image",
      answer_authority: false,
    });

    expect(tracker.observeProviderEvent({
      type: "conversation.item.done",
      event_id: "provider_done_1",
      item: {
        id: "hvi_frame_1",
        type: "message",
        role: "user",
        content: [{ type: "input_image" }, { type: "input_text" }],
      },
    })).toMatchObject({
      status: "provider_item_done",
      first_provider_acknowledgement: false,
      first_provider_image_context_confirmation: false,
    });
  });

  it("ignores unrelated conversation items and response events", () => {
    const tracker = createHelixAskRealtimeVisualFrameAcknowledgementTracker();
    tracker.registerReceipt(sentReceipt());

    expect(tracker.observeProviderEvent({
      type: "conversation.item.added",
      item: { id: "unrelated_item" },
    })).toBeNull();
    expect(tracker.observeProviderEvent({
      type: "response.done",
      response: { id: "response_1" },
    })).toBeNull();
  });

  it("does not treat an item-id acknowledgement as image-context confirmation", () => {
    const tracker = createHelixAskRealtimeVisualFrameAcknowledgementTracker();
    tracker.registerReceipt(sentReceipt());

    expect(tracker.observeProviderEvent({
      type: "conversation.item.added",
      event_id: "provider_added_without_content",
      item: { id: "hvi_frame_1", type: "message", role: "user" },
    })).toMatchObject({
      status: "provider_item_added",
      first_provider_acknowledgement: true,
      provider_image_content_observed: false,
      first_provider_image_context_confirmation: false,
      model_context_evidence: "provider_item_identity_only",
    });
  });

  it("correlates provider errors through the originating client event id", () => {
    const tracker = createHelixAskRealtimeVisualFrameAcknowledgementTracker({
      nowMs: () => 300,
    });
    tracker.registerReceipt(sentReceipt());

    expect(tracker.observeProviderEvent({
      type: "error",
      event_id: "provider_error_1",
      error: {
        event_id: "hve_frame_1",
        type: "invalid_request_error",
        code: "invalid_value",
      },
    })).toMatchObject({
      status: "provider_error",
      item_id: "hvi_frame_1",
      client_event_id: "hve_frame_1",
      provider_event_id: "provider_error_1",
      provider_error_code: "invalid_value",
      first_provider_acknowledgement: false,
      provider_image_content_observed: false,
      model_context_evidence: "provider_error",
    });
  });

  it("does not track blocked or incomplete transport receipts", () => {
    const tracker = createHelixAskRealtimeVisualFrameAcknowledgementTracker();
    tracker.registerReceipt({
      ...sentReceipt(),
      ok: false,
      status: "blocked",
      code: "visual_frame_data_channel_not_open",
      conversation_item_create_sent: false,
    });

    expect(tracker.observeProviderEvent({
      type: "conversation.item.added",
      item: { id: "hvi_frame_1" },
    })).toBeNull();
  });
});
