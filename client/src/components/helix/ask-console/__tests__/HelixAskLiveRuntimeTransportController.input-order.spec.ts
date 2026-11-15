import { describe, expect, it, vi } from "vitest";
import { createHelixAskLiveRuntimeBrowserTransportController, type HelixAskLiveRuntimeTrackLike } from "../HelixAskLiveRuntimeTransportController";
import { registerHelixAskLiveMediaBoundary, unregisterHelixAskLiveMediaBoundary } from "../shared-live-room/media-bridge/HelixAskLiveMediaBoundary";

const HANDOFF = { server_session_response_ok: true, can_start_browser_transport: true,
  sdp_exchange_allowed: true, visible_user_consent_receipt: "receipt:input-order", blocked_reason: "transport_contract_admitted" } as never;
const SESSION = { ok: true, realtime_session_id: "realtime:input-order", sdp_exchange_requested: true } as never;
const track = (): HelixAskLiveRuntimeTrackLike => ({ kind: "audio", enabled: false, readyState: "live", stop: vi.fn() });
const deferred = () => { let resolve!: () => void;let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res;reject = rej; });return { promise, resolve, reject }; };

async function setup() {
  const original = track();const nextOriginal = track();
  const sender = { replaceTrack: vi.fn(async (_track: HelixAskLiveRuntimeTrackLike): Promise<void> => {}) };
  const nextSender = { replaceTrack: vi.fn(async (_track: HelixAskLiveRuntimeTrackLike): Promise<void> => {}) };
  let starts = 0;
  const controller = createHelixAskLiveRuntimeBrowserTransportController({
    requestMicrophone: vi.fn(async () => {
      const selected = starts === 0 ? original : nextOriginal;
      return { getTracks: () => [selected] };
    }),
    createPeerConnection: () => { const selected = starts++ === 0 ? sender : nextSender;return {
      createDataChannel: () => ({ close: vi.fn(), readyState: "open" }), addTrack: () => selected,
      createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\r\n" })),
      setLocalDescription: vi.fn(async () => undefined), setRemoteDescription: vi.fn(async () => undefined), close: vi.fn(),
    }; },
    createRemoteAudio: () => ({ autoplay: true, muted: false, srcObject: null,
      play: vi.fn(async () => undefined), pause: vi.fn() }),
    exchangeSdp: vi.fn(async () => ({ answerSdp: "v=0\r\nanswer", providerCallRef: "provider:input-order" })),
  });
  const start = () => controller.startTransport({ handoffPlan: HANDOFF, serverResponse: SESSION });
  const stop = () => controller.stopTransport({ realtimeSessionId: "realtime:input-order" });
  expect((await start()).ok).toBe(true);
  return { controller, original, nextOriginal, sender, nextSender, start, stop };
}

describe("GPT Live input changes retain transport and track ownership", () => {
  it("orders restore after an in-flight replacement and retires its result", async () => {
    const { controller, original, sender, stop } = await setup();const mixed = track();const pending = deferred();
    sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const replacing = controller.replaceProviderInputAudioTrack(mixed, { enableExternalAudio: true });
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledOnce());
    const restoring = controller.restoreProviderInputAudioTrack(mixed);
    expect(sender.replaceTrack).toHaveBeenCalledOnce();
    pending.resolve();expect(await replacing).toBe(false);expect(await restoring).toBe(true);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(original);expect(mixed.enabled).toBe(false);
    await stop();
  });

  it("does not let a previous bridge restore over a newer bridge", async () => {
    const { controller, sender, stop } = await setup();const old = track();const current = track();
    expect(await controller.replaceProviderInputAudioTrack(old)).toBe(true);
    expect(await controller.replaceProviderInputAudioTrack(current, { enableExternalAudio: true })).toBe(true);
    const count = sender.replaceTrack.mock.calls.length;
    expect(await controller.restoreProviderInputAudioTrack(old)).toBe(false);
    expect(sender.replaceTrack).toHaveBeenCalledTimes(count);expect(current.enabled).toBe(true);
    expect(await controller.restoreProviderInputAudioTrack(current)).toBe(true);await stop();
  });

  it("isolates a late replacement from a restarted transport", async () => {
    const { controller, sender, nextOriginal, nextSender, start, stop } = await setup();const old = track();const pending = deferred();
    sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const replacing = controller.replaceProviderInputAudioTrack(old, { enableExternalAudio: true });
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledOnce());
    await stop();expect((await start()).ok).toBe(true);
    pending.resolve();expect(await replacing).toBe(false);
    expect(controller.setMicrophoneEnabled(true)).toBe(true);expect(nextOriginal.enabled).toBe(true);
    expect(old.enabled).toBe(false);expect(nextSender.replaceTrack).not.toHaveBeenCalled();await stop();
  });

  it("isolates a late restoration from a restarted transport", async () => {
    const { controller, sender, nextOriginal, start, stop } = await setup();const mixed = track();
    expect(await controller.replaceProviderInputAudioTrack(mixed)).toBe(true);const pending = deferred();
    sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const restoring = controller.restoreProviderInputAudioTrack(mixed);
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
    await stop();expect((await start()).ok).toBe(true);
    pending.resolve();expect(await restoring).toBe(false);
    expect(controller.setMicrophoneEnabled(true)).toBe(true);expect(nextOriginal.enabled).toBe(true);await stop();
  });

  it("continues with restore after a failed replacement", async () => {
    const { controller, original, sender, stop } = await setup();const mixed = track();
    sender.replaceTrack.mockRejectedValueOnce(new Error("replace failed"));
    await expect(controller.replaceProviderInputAudioTrack(mixed)).rejects.toThrow("replace failed");
    expect(await controller.restoreProviderInputAudioTrack(mixed)).toBe(true);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(original);await stop();
  });

  it("keeps the original microphone muted throughout a pending restoration", async () => {
    const { controller, original, sender, stop } = await setup();const mixed = track();
    controller.setMicrophoneEnabled(true);
    expect(await controller.replaceProviderInputAudioTrack(mixed, { enableExternalAudio: true })).toBe(true);
    controller.setMicrophoneEnabled(false);expect(original.enabled).toBe(false);
    const pending = deferred();sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const restoring = controller.restoreProviderInputAudioTrack(mixed);
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
    controller.setMicrophoneEnabled(true);expect(original.enabled).toBe(true);
    controller.setMicrophoneEnabled(false);expect(original.enabled).toBe(false);
    pending.resolve();expect(await restoring).toBe(true);expect(original.enabled).toBe(false);await stop();
  });

  it("preserves a newer pending bridge when the previous bridge closes", async () => {
    const { controller, sender, stop } = await setup();const previous = track();const current = track();
    expect(await controller.replaceProviderInputAudioTrack(previous)).toBe(true);
    const pending = deferred();sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const replacing = controller.replaceProviderInputAudioTrack(current, { enableExternalAudio: true });
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
    expect(await controller.restoreProviderInputAudioTrack(previous)).toBe(false);
    expect(sender.replaceTrack).toHaveBeenCalledTimes(2);
    pending.resolve();expect(await replacing).toBe(true);expect(current.enabled).toBe(true);
    expect(await controller.restoreProviderInputAudioTrack(current)).toBe(true);await stop();
  });

  it("passes exact track ownership through the public media boundary", async () => {
    const { controller, sender, stop } = await setup();const mixed = track();
    const boundary = registerHelixAskLiveMediaBoundary({ realtimeSessionId: "realtime:input-order", controller });
    try {
      expect(await boundary.replaceProviderInputAudioTrack(mixed)).toBe(true);
      expect(await boundary.restoreProviderInputAudioTrack(track())).toBe(false);
      expect(sender.replaceTrack).toHaveBeenCalledOnce();
      expect(await boundary.restoreProviderInputAudioTrack(mixed)).toBe(true);
    } finally { unregisterHelixAskLiveMediaBoundary({ realtimeSessionId: "realtime:input-order", controller });await stop(); }
  });
});
