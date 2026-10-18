import { describe, expect, it, vi } from "vitest";

import { createHelixAskLiveRuntimeBrowserTransportController } from
  "../HelixAskLiveRuntimeTransportController";

const ALLOWED_HANDOFF_PLAN = {
  server_session_response_ok: true,
  can_start_browser_transport: true,
  sdp_exchange_allowed: true,
  visible_user_consent_receipt: "receipt:transport-failure-test",
  blocked_reason: "transport_contract_admitted",
} as never;

const SERVER_SESSION_RESPONSE = {
  ok: true,
  realtime_session_id: "realtime:transport-failure-test",
  sdp_exchange_requested: true,
} as never;

describe("HelixAskLiveRuntimeTransportController failure provenance", () => {
  it("preserves pre-cleanup facts and the stage for an otherwise generic browser failure", async () => {
    const track = {
      stop: vi.fn(),
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live",
      label: "Proof microphone",
    };
    const dataChannel = {
      close: vi.fn(),
      send: vi.fn(),
      readyState: "connecting",
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    };
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: vi.fn(async () => ({ getTracks: () => [track] })),
      createPeerConnection: () => ({
        createDataChannel: () => dataChannel,
        addTrack: vi.fn(),
        createOffer: vi.fn(async () => {
          throw new Error("The browser could not create an offer.");
        }),
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
    });

    const result = await controller.startTransport({
      handoffPlan: ALLOWED_HANDOFF_PLAN,
      serverResponse: SERVER_SESSION_RESPONSE,
    });

    expect(result).toMatchObject({
      ok: false,
      blocked_reason: "realtime_browser_transport_failed:offer_create",
      media_capture_started: true,
      browser_tracks_created: true,
      webrtc_started: true,
      data_channels_created: true,
      openai_network_call_attempted: false,
    });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getResources()).toEqual({
      mediaStream: null,
      peerConnection: null,
      dataChannel: null,
      remoteAudio: null,
    });
  });
});
