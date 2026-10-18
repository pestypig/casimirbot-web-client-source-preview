import { describe, expect, it, vi } from "vitest";
import {
  createHelixAskLiveRuntimeBrowserTransportController,
  type HelixAskLiveRuntimeTrackLike,
} from "../HelixAskLiveRuntimeTransportController";

const HANDOFF = {
  server_session_response_ok: true,
  can_start_browser_transport: true,
  sdp_exchange_allowed: true,
  visible_user_consent_receipt: "receipt:media-restore",
  blocked_reason: "transport_contract_admitted",
} as never;

const SESSION = {
  ok: true,
  realtime_session_id: "realtime:media-restore",
  sdp_exchange_requested: true,
} as never;

describe("GPT Live provider input sender recovery", () => {
  it("restores the original microphone before a room mixer is disposed", async () => {
    const originalTrack: HelixAskLiveRuntimeTrackLike = {
      stop: vi.fn(),
      kind: "audio",
      enabled: false,
      muted: false,
      readyState: "live",
      label: "Owner microphone",
    };
    const mixedTrack: HelixAskLiveRuntimeTrackLike = {
      stop: vi.fn(),
      kind: "audio",
      enabled: false,
      readyState: "live",
    };
    const replaceTrack = vi.fn(async () => undefined);
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: vi.fn(async () => ({
        getTracks: () => [originalTrack],
      })),
      createPeerConnection: () => ({
        createDataChannel: () => ({ close: vi.fn(), readyState: "open" }),
        addTrack: () => ({ replaceTrack }),
        createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\r\n" })),
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
      }),
      exchangeSdp: vi.fn(async () => ({
        answerSdp: "v=0\r\nanswer",
        providerCallRef: "provider:media-restore",
      })),
    });
    expect((await controller.startTransport({
      handoffPlan: HANDOFF,
      serverResponse: SESSION,
    })).ok).toBe(true);

    expect(controller.setMicrophoneEnabled(true)).toBe(true);
    expect(await controller.replaceProviderInputAudioTrack(mixedTrack)).toBe(true);
    expect(replaceTrack).toHaveBeenNthCalledWith(1, mixedTrack);
    expect(mixedTrack.enabled).toBe(true);

    expect(controller.setMicrophoneEnabled(false)).toBe(true);
    expect(await controller.restoreProviderInputAudioTrack()).toBe(true);
    expect(replaceTrack).toHaveBeenNthCalledWith(2, originalTrack);
    expect(originalTrack.enabled).toBe(false);

    expect(await controller.replaceProviderInputAudioTrack(mixedTrack, { enableExternalAudio: true })).toBe(true);
    expect(mixedTrack.enabled).toBe(true);
    expect(controller.getMicrophoneEnabled()).toBe(false);
    expect(await controller.restoreProviderInputAudioTrack()).toBe(true);
    expect(replaceTrack).toHaveBeenNthCalledWith(4, originalTrack);
    expect(originalTrack.enabled).toBe(false);
  });
});

