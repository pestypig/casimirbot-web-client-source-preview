/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createSharedLiveRoomAudioPlayback } from "../RoomAudioPlayback";

describe("Shared Live Room audio playback", () => {
  it("reports autoplay blocking and recovers from an explicit resume gesture", async () => {
    const play = vi.fn()
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValue(undefined);
    const audio = {
      autoplay: false,
      playsInline: false,
      srcObject: null,
      play,
      pause: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAudioElement;
    const stream = {
      addTrack: vi.fn(),
    } as unknown as MediaStream;
    const onBlocked = vi.fn();
    const onPlaying = vi.fn();
    const playback = createSharedLiveRoomAudioPlayback({
      onBlocked,
      onPlaying,
      createAudioElement: () => audio,
      createStream: () => stream,
    });

    playback.attach({ kind: "audio" } as MediaStreamTrack);
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledOnce());
    expect(await playback.resume()).toBe(true);
    expect(onPlaying).toHaveBeenCalledOnce();

    playback.close();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.srcObject).toBeNull();
  });
});
