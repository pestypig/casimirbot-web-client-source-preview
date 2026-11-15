import { describe, expect, it, vi } from "vitest";
import { releaseAudioFocus, requestAudioFocus } from "@/lib/audio-focus";
import {
  createHelixAskLiveRuntimeBrowserTransportController,
  type HelixAskLiveRuntimePeerConnectionLike,
  type HelixAskLiveRuntimeRemoteAudioLike,
} from "../HelixAskLiveRuntimeTransportController";

describe("GPT Live local playback", () => {
  it("mutes only this computer's output while retaining the provider stream", async () => {
    const track = { kind: "audio", enabled: false, stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const outputTrack = { kind: "audio", enabled: true, stop: vi.fn() };
    const outputStream = { getTracks: () => [outputTrack] };
    const remoteAudio: HelixAskLiveRuntimeRemoteAudioLike = {
      autoplay: true,
      muted: false,
      srcObject: null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const peerConnection: HelixAskLiveRuntimePeerConnectionLike = {
      createDataChannel: () => ({ close: vi.fn(), readyState: "open" }),
      addTrack: () => ({}),
      createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\r\n" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: vi.fn(async () => stream),
      createPeerConnection: () => peerConnection,
      createRemoteAudio: () => remoteAudio,
      exchangeSdp: vi.fn(async () => ({ answerSdp: "v=0\r\nanswer", providerCallRef: "provider:local-playback" })),
    });

    controller.setLocalPlaybackMuted(true);
    expect((await controller.startTransport({
      handoffPlan: {
        server_session_response_ok: true,
        can_start_browser_transport: true,
        sdp_exchange_allowed: true,
        visible_user_consent_receipt: "receipt:local-playback",
        blocked_reason: "transport_contract_admitted",
      } as never,
      serverResponse: {
        ok: true,
        realtime_session_id: "realtime:local-playback",
        sdp_exchange_requested: true,
      } as never,
    })).ok).toBe(true);

    peerConnection.ontrack?.({ streams: [outputStream] });
    expect(remoteAudio.muted).toBe(true);
    expect(controller.readProviderOutputStream()).toBe(outputStream);
    expect(track.enabled).toBe(false);
    controller.setLocalPlaybackMuted(false);
    expect(controller.getLocalPlaybackMuted()).toBe(false);
    expect(remoteAudio.muted).toBe(false);
    expect(controller.readProviderOutputStream()).toBe(outputStream);
    expect(track.enabled).toBe(false);
    requestAudioFocus({ id: "focus:priority", priority: 100, stop: vi.fn() });
    expect(remoteAudio.muted).toBe(true);
    controller.setLocalPlaybackMuted(false);
    expect(remoteAudio.muted).toBe(true);
    controller.setLocalPlaybackMuted(true);
    releaseAudioFocus("focus:priority");
    expect(remoteAudio.muted).toBe(true);
    controller.setLocalPlaybackMuted(false);
    expect(remoteAudio.muted).toBe(false);
    expect(outputTrack.enabled).toBe(true);
    expect(outputTrack.stop).not.toHaveBeenCalled();
    expect(controller.readProviderOutputStream()).toBe(outputStream);
    await controller.stopTransport({ realtimeSessionId: "realtime:local-playback" });
  });
});
