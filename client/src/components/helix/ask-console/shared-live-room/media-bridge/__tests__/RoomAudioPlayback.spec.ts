/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createSharedLiveRoomAudioPlayback } from "../RoomAudioPlayback";

describe("Shared Live Room audio playback", () => {
  it.each(["resolve", "reject"] as const)("ignores a pending play %s after close", async outcome => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const audio = document.createElement("audio");
    const play = vi.spyOn(audio, "play").mockReturnValue(pending);
    const pause = vi.spyOn(audio, "pause").mockImplementation(() => undefined);
    const onPlaying = vi.fn();const onBlocked = vi.fn();
    const playback = createSharedLiveRoomAudioPlayback({ onPlaying, onBlocked,
      createAudioElement: () => audio, createStream: () => ({ addTrack: vi.fn() }) as unknown as MediaStream });
    const resuming = playback.resume();
    playback.close();
    if (outcome === "resolve") resolve();else reject(new Error("play interrupted by close"));
    expect(await resuming).toBe(false);
    expect(onPlaying).not.toHaveBeenCalled();expect(onBlocked).not.toHaveBeenCalled();
    expect(await playback.resume()).toBe(false);
    playback.close();
    expect(play).toHaveBeenCalledOnce();expect(pause).toHaveBeenCalledOnce();
    expect(audio.srcObject).toBeNull();
  });

  it("reports autoplay blocking and recovers from an explicit resume gesture", async () => {
    const play = vi.fn()
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValue(undefined);
    const audio = {
      autoplay: false,
      setAttribute: vi.fn(),
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
