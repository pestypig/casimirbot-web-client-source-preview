import { describe, expect, it, vi } from "vitest";
import { createSharedLiveRoomAudioMixer } from "../RoomAudioMixer";

const track = () => ({
  kind: "audio",
  stop: vi.fn(),
}) as unknown as MediaStreamTrack;

const stream = (audioTrack: MediaStreamTrack) => ({
  getAudioTracks: () => [audioTrack],
}) as unknown as MediaStream;

describe("Shared Live Room human-input mixer", () => {
  it("connects exactly two human sources and gates them independently", async () => {
    const ownerTrack = track();
    const participantTrack = track();
    const outputTrack = track();
    const gains: Array<{ value: number; setValueAtTime(value: number): void }> = [];
    const sourceDisconnects: ReturnType<typeof vi.fn>[] = [];
    const gainDisconnects: ReturnType<typeof vi.fn>[] = [];
    const observedStreams: MediaStream[] = [];
    const close = vi.fn(async () => undefined);
    let contextState: AudioContextState = "suspended";
    const resume = vi.fn(async () => {
      contextState = "running";
    });
    const context = {
      currentTime: 4,
      get state() {
        return contextState;
      },
      createMediaStreamDestination: () => ({ stream: stream(outputTrack) }),
      createMediaStreamSource: (input: MediaStream) => {
        observedStreams.push(input);
        const disconnect = vi.fn();
        sourceDisconnects.push(disconnect);
        return { connect: vi.fn(), disconnect };
      },
      createGain: () => {
        const gain = {
          value: 0,
          setValueAtTime(value: number) {
            this.value = value;
          },
        };
        gains.push(gain);
        const disconnect = vi.fn();
        gainDisconnects.push(disconnect);
        return { gain, connect: vi.fn(), disconnect };
      },
      close,
      resume,
    } as unknown as AudioContext;

    const mixer = createSharedLiveRoomAudioMixer({
      ownerMicrophone: stream(ownerTrack),
      participantMicrophone: stream(participantTrack),
      createAudioContext: () => context,
    });

    expect(observedStreams).toHaveLength(2);
    expect(await mixer.resume()).toBe(true);
    expect(resume).toHaveBeenCalledOnce();
    expect(gains.map((gain) => gain.value)).toEqual([0, 0]);
    mixer.setSourceAdmitted("owner", true);
    expect(gains.map((gain) => gain.value)).toEqual([1, 0]);
    mixer.setSourceAdmitted("owner", false);
    mixer.setSourceAdmitted("participant", true);
    expect(gains.map((gain) => gain.value)).toEqual([0, 1]);

    await mixer.close();
    expect(outputTrack.stop).toHaveBeenCalledOnce();
    expect(sourceDisconnects.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(gainDisconnects.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
});
