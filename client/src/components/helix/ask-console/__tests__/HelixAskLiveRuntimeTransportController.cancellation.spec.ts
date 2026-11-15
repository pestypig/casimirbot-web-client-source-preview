import { describe, expect, it, vi } from "vitest";
import { createHelixAskLiveRuntimeBrowserTransportController } from "../HelixAskLiveRuntimeTransportController";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const startArgs = {
  handoffPlan: { server_session_response_ok: true, can_start_browser_transport: true,
    sdp_exchange_allowed: true, visible_user_consent_receipt: "receipt:cancel",
    blocked_reason: "transport_contract_admitted" } as never,
  serverResponse: { ok: true, realtime_session_id: "realtime:cancel", sdp_exchange_requested: true } as never,
};
describe("Live transport startup cancellation", () => {
  it("leaves a successor transport intact when the retired microphone request completes", async () => {
    const oldTrack = { kind: "audio", enabled: true, stop: vi.fn() };
    const newTrack = { kind: "audio", enabled: true, stop: vi.fn() };
    const old = deferred<{ getTracks: () => typeof oldTrack[] }>();
    const newStream = { getTracks: () => [newTrack] };
    const peer = { createDataChannel: () => ({ close: vi.fn(), readyState: "open" }),
      addTrack: () => ({}), createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0" })),
      setLocalDescription: vi.fn(async () => {}), setRemoteDescription: vi.fn(async () => {}), close: vi.fn() };
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(newStream),
      createPeerConnection: () => peer,
      createRemoteAudio: () => ({ autoplay: true, muted: false, srcObject: null, play: async () => {}, pause: vi.fn() }),
      exchangeSdp: async () => ({ answerSdp: "answer", providerCallRef: "provider:successor" }),
    });
    const retiredStart = controller.startTransport(startArgs);
    await controller.stopTransport({ realtimeSessionId: "realtime:cancel" });
    expect((await controller.startTransport(startArgs)).ok).toBe(true);
    old.resolve({ getTracks: () => [oldTrack] });
    expect((await retiredStart).ok).toBe(false);
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    expect(controller.getResources().mediaStream).toBe(newStream);
    await controller.stopTransport({ realtimeSessionId: "realtime:cancel" });
  });

  it("stops microphone tracks that arrive after Stop without creating WebRTC", async () => {
    const track = { kind: "audio", enabled: true, stop: vi.fn() };
    const pending = deferred<{ getTracks: () => typeof track[] }>();
    const createPeerConnection = vi.fn(() => ({ close: vi.fn() }));
    const exchangeSdp = vi.fn();
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: () => pending.promise, createPeerConnection, exchangeSdp,
    });
    const starting = controller.startTransport(startArgs);
    await controller.stopTransport({ realtimeSessionId: "realtime:cancel" });
    pending.resolve({ getTracks: () => [track] });
    expect((await starting).ok).toBe(false);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(exchangeSdp).not.toHaveBeenCalled();
    expect(controller.getResources().mediaStream).toBeNull();
  });

  it("does not install a late SDP answer after Stop", async () => {
    const track = { kind: "audio", enabled: true, stop: vi.fn() };
    const pending = deferred<{ answerSdp: string; providerCallRef: string }>();
    const peer = { createDataChannel: () => ({ close: vi.fn(), readyState: "open" }),
      addTrack: () => ({}), createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0" })),
      setLocalDescription: vi.fn(async () => {}), setRemoteDescription: vi.fn(async () => {}), close: vi.fn() };
    const exchangeSdp = vi.fn(() => pending.promise);
    const controller = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: async () => ({ getTracks: () => [track] }), createPeerConnection: () => peer,
      createRemoteAudio: () => ({ autoplay: true, muted: false, srcObject: null, play: async () => {}, pause: vi.fn() }),
      exchangeSdp,
    });
    const starting = controller.startTransport(startArgs);
    await vi.waitFor(() => expect(exchangeSdp).toHaveBeenCalledOnce());
    await controller.stopTransport({ realtimeSessionId: "realtime:cancel" });
    pending.resolve({ answerSdp: "late-answer", providerCallRef: "provider:late" });
    expect((await starting).ok).toBe(false);
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
