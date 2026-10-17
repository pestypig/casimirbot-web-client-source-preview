import { describe, expect, it } from "vitest";

import { buildHelixAskLiveVisionProof } from "../HelixAskLiveVisionProof";

const evidence = (overrides: Partial<Parameters<
  typeof buildHelixAskLiveVisionProof
>[0]> = {}) => ({
  visual_frame_sent_count: 0,
  visual_frame_provider_acknowledged_count: 0,
  visual_frame_provider_image_confirmed_count: 0,
  visual_frame_automatic_sent_count: 0,
  visual_frame_manual_sent_count: 0,
  visual_frame_automatic_provider_acknowledged_count: 0,
  visual_frame_manual_provider_acknowledged_count: 0,
  visual_frame_automatic_provider_image_confirmed_count: 0,
  visual_frame_manual_provider_image_confirmed_count: 0,
  latest_visual_frame_provider_acknowledgement: null,
  ...overrides,
});

describe("GPT Live Vision bounded proof projection", () => {
  it("keeps local transport separate from provider and semantic proof", () => {
    expect(buildHelixAskLiveVisionProof(evidence({
      visual_frame_sent_count: 2,
      visual_frame_automatic_sent_count: 2,
    }))).toMatchObject({
      status: "transport_only",
      automatic_capture: {
        status: "transport_sent",
        transport_sent_count: 2,
      },
      automatic_capture_transport_ready: false,
      semantic_marker_test_required: true,
      semantic_model_use_confirmed: false,
      answer_authority: false,
    });
  });

  it("proves automatic and manual provider image context independently", () => {
    expect(buildHelixAskLiveVisionProof(evidence({
      visual_frame_sent_count: 3,
      visual_frame_provider_acknowledged_count: 3,
      visual_frame_provider_image_confirmed_count: 2,
      visual_frame_automatic_sent_count: 2,
      visual_frame_manual_sent_count: 1,
      visual_frame_automatic_provider_acknowledged_count: 2,
      visual_frame_manual_provider_acknowledged_count: 1,
      visual_frame_automatic_provider_image_confirmed_count: 1,
      visual_frame_manual_provider_image_confirmed_count: 1,
    }))).toMatchObject({
      status: "provider_image_context_confirmed",
      automatic_capture: {
        status: "provider_image_context_confirmed",
        provider_image_context_confirmed_count: 1,
      },
      manual_promotion: {
        status: "provider_image_context_confirmed",
        provider_image_context_confirmed_count: 1,
      },
      automatic_capture_transport_ready: true,
      manual_promotion_transport_ready: true,
      semantic_model_use_confirmed: false,
      raw_content_included: false,
    });
  });

  it("surfaces the latest correlated provider error without granting authority", () => {
    expect(buildHelixAskLiveVisionProof(evidence({
      visual_frame_sent_count: 1,
      visual_frame_automatic_sent_count: 1,
      latest_visual_frame_provider_acknowledgement: {
        status: "provider_error",
        route_kind: "automatic_capture",
      },
    }))).toMatchObject({
      status: "provider_error",
      terminal_eligible: false,
      assistant_answer: false,
    });
  });
});
