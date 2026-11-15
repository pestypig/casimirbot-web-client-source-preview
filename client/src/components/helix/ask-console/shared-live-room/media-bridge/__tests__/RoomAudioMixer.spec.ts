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
  it.each(["resolve", "reject"] as const)("keeps a mixer closed when pending resume settles by %s", async outcome => {
    let resolve!: () => void;let reject!: (error: Error) => void;
    const pending = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    let state: AudioContextState = "suspended";
    const output = track();const owner = track();const participant = track();
    const context = { currentTime: 0, get state() { return state; },
      createMediaStreamDestination: () => ({ stream: stream(output) }),
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
      createGain: () => ({ gain: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
      resume: vi.fn(() => pending),
      // Model a close request whose browser state change lags its promise.
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const mixer = createSharedLiveRoomAudioMixer({ ownerMicrophone: stream(owner), participantMicrophone: stream(participant),
      createAudioContext: () => context });
    const resuming = mixer.resume();
    await mixer.close();
    if (outcome === "resolve") { state = "running";resolve(); }else reject(new Error("context closed during resume"));
    expect(await resuming).toBe(false);
    expect(await mixer.resume()).toBe(false);
    await mixer.close();
    expect(output.stop).toHaveBeenCalledOnce();expect(context.close).toHaveBeenCalledOnce();
    expect(owner.stop).not.toHaveBeenCalled();expect(participant.stop).not.toHaveBeenCalled();
  });

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
