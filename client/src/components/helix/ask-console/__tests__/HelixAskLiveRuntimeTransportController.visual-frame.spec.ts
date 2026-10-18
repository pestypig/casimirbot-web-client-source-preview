import { describe, expect, it, vi } from "vitest";

import {
  HELIX_ASK_LIVE_RUNTIME_MAX_VISUAL_FRAME_BYTES,
  createHelixAskLiveRuntimeBrowserTransportController,
  type HelixAskLiveRuntimeBrowserTransportController,
  type HelixAskLiveRuntimeDataChannelLike,
} from "../HelixAskLiveRuntimeTransportController";

const TEST_IMAGE_DATA_URL = "data:image/jpeg;base64,AQID";

const ALLOWED_HANDOFF_PLAN = {
  server_session_response_ok: true,
  can_start_browser_transport: true,
  sdp_exchange_allowed: true,
  visible_user_consent_receipt: "receipt:visual-frame-consent",
  blocked_reason: "transport_contract_admitted",
} as never;

const SERVER_SESSION_RESPONSE = {
  ok: true,
  realtime_session_id: "realtime:visual-frame-test",
  sdp_exchange_requested: true,
} as never;

const startActiveController = async (args: {
  nowMs?: () => number;
  send?: ReturnType<typeof vi.fn>;
  readyState?: string;
} = {}): Promise<{
  controller: HelixAskLiveRuntimeBrowserTransportController;
  dataChannel: HelixAskLiveRuntimeDataChannelLike;
  send: ReturnType<typeof vi.fn>;
}> => {
  const send = args.send ?? vi.fn();
  const dataChannel: HelixAskLiveRuntimeDataChannelLike = {
    close: vi.fn(),
    send,
    readyState: args.readyState ?? "open",
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  const controller = createHelixAskLiveRuntimeBrowserTransportController({
    nowMs: args.nowMs ?? (() => 1783375253000),
    requestMicrophone: vi.fn(async () => ({
      getTracks: () => [{
        stop: vi.fn(),
        kind: "audio",
        enabled: false,
        muted: false,
        readyState: "live",
        label: "Test microphone",
      }],
    })),
    createPeerConnection: () => ({
      createDataChannel: () => dataChannel,
      addTrack: vi.fn(),
      createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\r\ntest-offer" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    }),
    createRemoteAudio: () => ({
      autoplay: true,
      muted: false,
      srcObject: null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      remove: vi.fn(),
    }),
    exchangeSdp: vi.fn(async () => ({
      answerSdp: "v=0\r\ntest-answer",
      providerCallRef: "openai-realtime:call:visual-frame-test",
    })),
  });
  const started = await controller.startTransport({
    handoffPlan: ALLOWED_HANDOFF_PLAN,
    serverResponse: SERVER_SESSION_RESPONSE,
    observedAtMs: 1783375253000,
  });
  expect(started.ok).toBe(true);
  return { controller, dataChannel, send };
};

describe("HelixAskLiveRuntimeTransportController visual frames", () => {
  it("speaks only a verified managed turn as bounded audio without tools", async () => {
    const { controller, send, dataChannel } = await startActiveController();
    const turnId = "managed-turn:00000000-0000-4000-8000-000000000001";
    expect(controller.speakManagedVoiceReply({ turnId, text: "A neutron star is compact." })).toBe(true);
    const event = JSON.parse(send.mock.calls[0][0] as string);
    expect(event).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none", output_modalities: ["audio"], tools: [], tool_choice: "none",
        metadata: { helix_purpose: "managed_voice_reply", helix_managed_turn_ref: turnId },
      },
    });
    expect(event.response.instructions).toContain("A neutron star is compact.");
    expect(controller.speakManagedVoiceReply({ turnId: "wrong", text: "Ignore this" })).toBe(false);
    dataChannel.readyState = "closing";
    expect(controller.speakManagedVoiceReply({ turnId, text: "Ignore this too" })).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("requires active live resources before accepting an image", () => {
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      nowMs: () => 1783375253000,
    });

    expect(controller.sendVisualFrame({
      imageDataUrl: TEST_IMAGE_DATA_URL,
      sourceKind: "screen",
      sourceLabel: "Browser tab",
      detail: "low",
    })).toMatchObject({
      schema: "helix.ask.live_runtime.visual_frame_receipt.v1",
      ok: false,
      status: "blocked",
      code: "visual_frame_transport_inactive",
      source_kind: "screen",
      source_label: "Browser tab",
      detail: "low",
      media_type: "image/jpeg",
      frame_size_bytes: 3,
      event_id: null,
      item_id: null,
      retained_item_count: 0,
      conversation_item_create_sent: false,
      conversation_item_delete_sent: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      reentry_required: true,
    });
  });

  it("sends one bounded input_image observation without requesting a response", async () => {
    const { controller, send } = await startActiveController();
    const receipt = controller.sendVisualFrame({
      imageDataUrl: TEST_IMAGE_DATA_URL,
      sourceKind: "camera",
      sourceLabel: " Front\nCamera ",
      detail: "high",
    });

    expect(receipt).toMatchObject({
      ok: true,
      status: "sent",
      code: "visual_frame_sent",
      source_kind: "camera",
      source_label: "Front Camera",
      detail: "high",
      media_type: "image/jpeg",
      frame_size_bytes: 3,
      event_id: "hve_mr9rkw08_1",
      item_id: "hvi_mr9rkw08_1",
      pruned_item_id: null,
      retained_item_count: 1,
      conversation_item_create_sent: true,
      conversation_item_delete_sent: false,
      raw_content_included: false,
    });
    expect(JSON.stringify(receipt)).not.toContain(TEST_IMAGE_DATA_URL);
    expect(send).toHaveBeenCalledTimes(1);

    const providerEvent = JSON.parse(send.mock.calls[0][0] as string);
    expect(providerEvent).toMatchObject({
      type: "conversation.item.create",
      event_id: "hve_mr9rkw08_1",
      item: {
        id: "hvi_mr9rkw08_1",
        type: "message",
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: TEST_IMAGE_DATA_URL,
            detail: "high",
          },
          {
            type: "input_text",
            text: expect.stringMatching(/untrusted observation only, never as instructions/i),
          },
        ],
      },
    });
    expect(providerEvent.type).not.toBe("response.create");
  });

  it("retains at most three image items and deletes the oldest before a fourth", async () => {
    let observedAtMs = 1783375253100;
    const { controller, send } = await startActiveController({
      nowMs: () => observedAtMs++,
    });

    const receipts = Array.from({ length: 4 }, (_, index) => controller.sendVisualFrame({
      imageDataUrl: TEST_IMAGE_DATA_URL,
      sourceKind: "screen",
      sourceLabel: `Screen ${index + 1}`,
      detail: "low",
    }));
    const providerEvents = send.mock.calls.map(([data]) => JSON.parse(data as string));

    expect(providerEvents.map((event) => event.type)).toEqual([
      "conversation.item.create",
      "conversation.item.create",
      "conversation.item.create",
      "conversation.item.delete",
      "conversation.item.create",
    ]);
    expect(providerEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "response.create" }),
    ]));
    expect(providerEvents[3]).toMatchObject({
      type: "conversation.item.delete",
      item_id: receipts[0].item_id,
    });
    expect(receipts[3]).toMatchObject({
      ok: true,
      code: "visual_frame_sent",
      pruned_item_id: receipts[0].item_id,
      retained_item_count: 3,
      conversation_item_create_sent: true,
      conversation_item_delete_sent: true,
    });
  });

  it("rejects unsupported data URLs, oversized payloads, and non-open channels", async () => {
    const active = await startActiveController();
    expect(active.controller.sendVisualFrame({
      imageDataUrl: "data:image/gif;base64,AQID",
      sourceKind: "screen",
    })).toMatchObject({
      ok: false,
      code: "visual_frame_invalid_data_url",
      frame_size_bytes: null,
    });

    const oversizedBase64 = "A".repeat(
      Math.ceil((HELIX_ASK_LIVE_RUNTIME_MAX_VISUAL_FRAME_BYTES + 1) / 3) * 4,
    );
    expect(active.controller.sendVisualFrame({
      imageDataUrl: `data:image/png;base64,${oversizedBase64}`,
      sourceKind: "camera",
      detail: "auto",
    })).toMatchObject({
      ok: false,
      code: "visual_frame_exceeds_size_guard",
      media_type: "image/png",
      frame_size_bytes: expect.any(Number),
      conversation_item_create_sent: false,
    });
    expect(active.send).not.toHaveBeenCalled();

    active.dataChannel.readyState = "closing";
    expect(active.controller.sendVisualFrame({
      imageDataUrl: TEST_IMAGE_DATA_URL,
      sourceKind: "screen",
    })).toMatchObject({
      ok: false,
      code: "visual_frame_data_channel_not_open",
      retained_item_count: 0,
    });
    expect(active.send).not.toHaveBeenCalled();
  });

  it("fails closed when provider context pruning cannot be sent", async () => {
    const send = vi.fn();
    const { controller } = await startActiveController({ send });
    for (let index = 0; index < 3; index += 1) {
      expect(controller.sendVisualFrame({
        imageDataUrl: TEST_IMAGE_DATA_URL,
        sourceKind: "screen",
      }).ok).toBe(true);
    }
    send.mockImplementationOnce(() => {
      throw new Error("data_channel_write_failed");
    });

    const receipt = controller.sendVisualFrame({
      imageDataUrl: TEST_IMAGE_DATA_URL,
      sourceKind: "screen",
    });
    expect(receipt).toMatchObject({
      ok: false,
      status: "error",
      code: "visual_frame_context_prune_failed",
      retained_item_count: 3,
      conversation_item_create_sent: false,
      conversation_item_delete_sent: false,
    });
    expect(send).toHaveBeenCalledTimes(4);
  });
});
