/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  frameSubscribers: new Set<(frame: Record<string, unknown>) => void>(),
  onProviderEvent: null as ((event: unknown) => void) | null,
  sendVisualFrame: vi.fn(() => ({
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
    event_id: "hve_visual_consent",
    item_id: "hvi_visual_consent",
    pruned_item_id: null,
    retained_item_count: 1,
    conversation_item_create_sent: true,
    conversation_item_delete_sent: false,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    reentry_required: true,
  })),
  startTransport: vi.fn(async () => ({
    ok: true,
    blocked_reason: "transport_active",
    receipt: { client_receipt_ref: "receipt:transport:test" },
  })),
  stopTransport: vi.fn(async () => undefined),
  recordVisualFrameReceipt: vi.fn(),
}));

vi.mock("@/lib/helix/visualFrameProducer", () => ({
  getLatestVisualFrameProducerFrame: () => null,
  isVisualFrameProducerSourceActive: () => true,
  subscribeVisualFrameProducerFrames: (subscriber: (frame: Record<string, unknown>) => void) => {
    mocks.frameSubscribers.add(subscriber);
    return () => mocks.frameSubscribers.delete(subscriber);
  },
}));

vi.mock("../HelixAskLiveRuntimeTransportController", () => ({
  createHelixAskLiveRuntimeBrowserTransportController: (input: {
    onProviderEvent?: (event: unknown) => void;
  }) => {
    mocks.onProviderEvent = input.onProviderEvent ?? null;
    return {
      startTransport: mocks.startTransport,
      stopTransport: mocks.stopTransport,
      setMicrophoneEnabled: () => true,
      sendVisualFrame: mocks.sendVisualFrame,
    };
  },
}));

vi.mock("../HelixAskLiveRuntimeLifecycle", () => ({
  buildHelixAskLiveRuntimeClientReceiptPayload: (input: Record<string, unknown>) => ({
    ...input,
    client_receipt_ref: input.clientReceiptRef,
    route_path: "/api/agi/realtime/client-receipt",
  }),
  buildHelixAskLiveRuntimeRouteRequest: () => ({
    path: "/api/agi/realtime/session/start",
    body: {},
  }),
  buildHelixAskLiveRuntimeTransportHandoffPlan: () => ({
    can_start_browser_transport: true,
  }),
}));

vi.mock("../HelixAskRealtimeProviderEventHandler", () => ({
  createHelixAskRealtimeProviderEventHandler: () => ({
    handle: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock("../HelixAskLiveRuntimeDebugState", () => ({
  beginHelixAskLiveRuntimeClientDebugAttempt: vi.fn(),
  recordHelixAskLiveRuntimeClientDebugEvent: vi.fn(),
  recordHelixAskLiveRuntimeCompletedOutputTranscript: vi.fn(),
  recordHelixAskLiveRuntimeServerStagePlayDebug: vi.fn(),
  recordHelixAskLiveRuntimeVisualFrameProviderAcknowledgement: vi.fn(),
  recordHelixAskLiveRuntimeVisualFrameReceipt: mocks.recordVisualFrameReceipt,
}));

vi.mock("@/lib/audio-focus", () => ({
  getAudioFocusSnapshot: () => ({ active_kind: null }),
}));

vi.mock("@/store/useWorkstationLayoutStore", () => ({
  useWorkstationLayoutStore: { getState: () => ({}) },
}));

vi.mock("../HelixAskMinimalRuntimeWorkspaceContext", () => ({
  buildHelixAskLiveRuntimeSourceBinding: () => ({}),
}));

import { useHelixAskLiveRuntimeSession } from "../useHelixAskLiveRuntimeSession";
import { requestHelixAskVisualFrameLivePromotion } from "../HelixAskVisualFramePromotion";
import { useVisualSourceCaptureStore } from "@/store/useVisualSourceCaptureStore";

type SessionApi = ReturnType<typeof useHelixAskLiveRuntimeSession>;

let latestSession: SessionApi | null = null;

const Harness = ({ directVisualInputSuppressed = false }: {
  directVisualInputSuppressed?: boolean;
}) => {
  latestSession = useHelixAskLiveRuntimeSession({
    enabled: true,
    mode: "live_voice",
    authority: "observe_only",
    selectedRuntimeAgentProvider: "codex",
    directVisualInputSuppressed,
  });
  return null;
};

const frame = (clientFrameId: string) => ({
  clientFrameId,
  sourceId: "visual:consent-test",
  threadId: "helix-ask:desktop",
  capturedAt: new Date().toISOString(),
  previewHash: `sha256:${clientFrameId}`,
  mimeType: "image/jpeg",
  dataUrl: "data:image/jpeg;base64,AQID",
  sourceSurface: "screen",
  sourceOrigin: "browser_getDisplayMedia",
  liveRuntimeEligible: true,
});

describe("Helix Ask GPT Live visual consent", () => {
  beforeEach(() => {
    latestSession = null;
    mocks.onProviderEvent = null;
    mocks.frameSubscribers.clear();
    mocks.sendVisualFrame.mockClear();
    mocks.startTransport.mockClear();
    mocks.stopTransport.mockClear();
    mocks.recordVisualFrameReceipt.mockClear();
    useVisualSourceCaptureStore.setState({ producers: {} });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      realtime_session_id: "realtime:visual-consent-test",
      sdp_exchange_requested: true,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useVisualSourceCaptureStore.setState({ producers: {} });
  });

  it("blocks a same-turn frame immediately after Vision Off, before effect cleanup", async () => {
    render(<Harness />);

    await act(async () => {
      await latestSession!.start();
    });
    await waitFor(() => expect(latestSession?.active).toBe(true));
    const sessionStartCall = vi.mocked(globalThis.fetch).mock.calls.find(([request]) =>
      String(request).includes("/api/agi/realtime/session/start")
    );
    expect(sessionStartCall).toBeDefined();
    expect(JSON.parse(String(sessionStartCall?.[1]?.body))).toMatchObject({
      runtime_agent_authority: "observe_only",
      selected_runtime_agent_provider: "codex",
    });

    act(() => {
      expect(latestSession!.setVisualInputEnabled(true)).toBe(true);
    });
    await waitFor(() => expect(mocks.frameSubscribers.size).toBe(1));
    const subscribedRoute = [...mocks.frameSubscribers][0]!;

    act(() => subscribedRoute(frame("frame-before-off")));
    expect(mocks.sendVisualFrame).toHaveBeenCalledTimes(1);
    expect(mocks.recordVisualFrameReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: "visual_frame_sent" }),
      "automatic_capture",
    );

    act(() => {
      expect(latestSession!.setVisualInputEnabled(false)).toBe(true);
      // React has not yet had an opportunity to clean up the old subscription.
      subscribedRoute(frame("frame-after-off"));
    });

    expect(mocks.sendVisualFrame).toHaveBeenCalledTimes(1);
    expect(latestSession?.visualInputEnabled).toBe(false);
  });

  it("requires explicit Vision consent before promoting a selected carousel frame", async () => {
    render(<Harness />);

    await act(async () => {
      await latestSession!.start();
    });
    await waitFor(() => expect(latestSession?.active).toBe(true));

    expect(requestHelixAskVisualFrameLivePromotion({
      imageDataUrl: "data:image/jpeg;base64,AQID",
      sourceKind: "screen",
      sourceLabel: "Selected visual frame",
    })).toMatchObject({
      ok: false,
      code: "visual_input_consent_required",
      receipt: null,
      answer_authority: false,
    });

    act(() => {
      latestSession!.setVisualInputEnabled(true);
    });
    const outcome = requestHelixAskVisualFrameLivePromotion({
      imageDataUrl: "data:image/jpeg;base64,AQID",
      sourceKind: "screen",
      sourceLabel: "Selected visual frame",
    });
    expect(outcome).toMatchObject({ ok: true, code: "visual_frame_sent" });
    expect(mocks.sendVisualFrame).toHaveBeenCalledTimes(1);
    expect(mocks.recordVisualFrameReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: "visual_frame_sent" }),
      "manual_promotion",
    );
  });

  it("counts a frame separately when the Realtime provider acknowledges its item", async () => {
    render(<Harness />);
    await act(async () => {
      await latestSession!.start();
    });
    await waitFor(() => expect(latestSession?.active).toBe(true));
    act(() => {
      latestSession!.setVisualInputEnabled(true);
    });

    act(() => {
      requestHelixAskVisualFrameLivePromotion({
        imageDataUrl: "data:image/jpeg;base64,AQID",
        sourceKind: "screen",
        sourceLabel: "Selected visual frame",
      });
    });
    expect(latestSession?.visualInputFrameCount).toBe(1);
    expect(latestSession?.visualInputProviderAcknowledgedFrameCount).toBe(0);
    expect(latestSession?.visualInputProviderImageConfirmedFrameCount).toBe(0);
    expect(latestSession?.visualInputLastDeliveryStatus).toBe("transport_sent");

    act(() => {
      mocks.onProviderEvent?.({
        type: "conversation.item.added",
        event_id: "provider_added_visual_consent",
        item: {
          id: "hvi_visual_consent",
          type: "message",
          role: "user",
          content: [{ type: "input_image" }, { type: "input_text" }],
        },
      });
    });
    expect(latestSession?.visualInputProviderAcknowledgedFrameCount).toBe(1);
    expect(latestSession?.visualInputProviderImageConfirmedFrameCount).toBe(1);
    expect(latestSession?.visualInputLastDeliveryStatus).toBe(
      "provider_acknowledged",
    );

    act(() => {
      mocks.onProviderEvent?.({
        type: "conversation.item.done",
        event_id: "provider_done_visual_consent",
        item: {
          id: "hvi_visual_consent",
          type: "message",
          role: "user",
          content: [{ type: "input_image" }, { type: "input_text" }],
        },
      });
    });
    expect(latestSession?.visualInputProviderAcknowledgedFrameCount).toBe(1);
    expect(latestSession?.visualInputProviderImageConfirmedFrameCount).toBe(1);
  });

  it("routes automatic and explicit frames through the room lane while direct input is suppressed", async () => {
    render(<Harness directVisualInputSuppressed />);
    await act(async () => {
      await latestSession!.start();
    });
    await waitFor(() => expect(latestSession?.active).toBe(true));
    act(() => {
      latestSession!.setVisualInputEnabled(true);
    });
    expect(mocks.frameSubscribers.size).toBe(0);

    const outcome = requestHelixAskVisualFrameLivePromotion({
      imageDataUrl: "data:image/jpeg;base64,AQID",
      sourceKind: "screen",
      sourceLabel: "Selected shared-room frame",
    });
    expect(outcome).toMatchObject({
      ok: true,
      code: "shared_room_visual_frame_queued",
      receipt: null,
    });
    expect(mocks.sendVisualFrame).not.toHaveBeenCalled();
    expect(useVisualSourceCaptureStore.getState().producers[
      "visual:shared-room-manual-promotion"
    ]?.frame_history?.at(-1)).toMatchObject({
      preview_data_url: "data:image/jpeg;base64,AQID",
      source_kind: "full_frame",
      source_surface: "screen",
    });
  });
});
