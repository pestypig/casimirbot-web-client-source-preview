import { describe, expect, it } from "vitest";
import type {
  HelixSharedRealtimeRoomVisualFrame,
  HelixSharedRealtimeRoomVisualFrameReceipt,
} from "@shared/helix-shared-realtime-room";
import { projectSharedLiveRoomFrameDelivery } from "../useSharedLiveRoomVisualIngress";

const receipt = (
  providerDelivery: HelixSharedRealtimeRoomVisualFrameReceipt["provider_delivery"],
): HelixSharedRealtimeRoomVisualFrameReceipt => ({
  schema: "helix.shared_realtime_room.visual_frame_receipt.v1",
  ok: true,
  error: null,
  frame_ref: "frame:1",
  room_id: "room:1",
  participant_id: "participant:1",
  runtime_id: "runtime:1",
  image_hash: "sha256:frame",
  provider_delivery: providerDelivery,
  carousel_visible: true,
  context_role: "tool_evidence",
  reentry_required: true,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

describe("Shared Live Room frame delivery projection", () => {
  it("keeps transport acceptance pending until the provider echoes input_image", () => {
    expect(projectSharedLiveRoomFrameDelivery({
      receipt: receipt("transport_sent"),
      frames: [],
    })).toEqual({
      status: "provider_ack_pending",
      providerDelivery: "transport_sent",
      error: null,
    });
  });

  it("distinguishes a model-transport send from a carousel-only upload", () => {
    expect(projectSharedLiveRoomFrameDelivery({
      receipt: receipt("sent_to_shared_model"),
      frames: [],
    })).toEqual({
      status: "model_provider_acknowledged",
      providerDelivery: "sent_to_shared_model",
      error: null,
    });

    expect(projectSharedLiveRoomFrameDelivery({
      receipt: receipt("runtime_not_bound"),
      frames: [],
    })).toEqual({
      status: "panel_only",
      providerDelivery: "runtime_not_bound",
      error: null,
    });
  });

  it("resolves duplicate receipts against the retained frame's original delivery", () => {
    const retainedFrame = {
      frame_ref: "frame:1",
      provider_delivery: "sent_to_shared_model",
    } as HelixSharedRealtimeRoomVisualFrame;
    expect(projectSharedLiveRoomFrameDelivery({
      receipt: receipt("duplicate"),
      frames: [retainedFrame],
    }).status).toBe("model_provider_acknowledged");
  });
});
