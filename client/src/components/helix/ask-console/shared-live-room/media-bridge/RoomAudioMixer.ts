export type SharedLiveRoomHumanAudioSource = "owner" | "participant";

export type SharedLiveRoomAudioMixer = {
  outputTrack: MediaStreamTrack;
  outputStream: MediaStream;
  resume(): Promise<boolean>;
  setSourceAdmitted(source: SharedLiveRoomHumanAudioSource, admitted: boolean): void;
  close(): Promise<void>;
};

type AudioSourceRuntime = {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
};

const requireAudioTrack = (stream: MediaStream, source: string): MediaStreamTrack => {
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error(`shared_room_${source}_audio_track_required`);
  return track;
};

const connectSource = (
  context: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  stream: MediaStream,
): AudioSourceRuntime => {
  requireAudioTrack(stream, "human");
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(destination);
  return { source, gain };
};

/**
 * Produces the one human-input track sent to GPT Live.
 *
 * Only the two microphone streams accepted here can enter the mix. GPT output
 * is deliberately not an input to this API, which prevents model-audio
 * feedback from being wired into the provider sender by accident.
 */
export const createSharedLiveRoomAudioMixer = (input: {
  ownerMicrophone: MediaStream;
  participantMicrophone: MediaStream;
  createAudioContext?: () => AudioContext;
}): SharedLiveRoomAudioMixer => {
  requireAudioTrack(input.ownerMicrophone, "owner");
  requireAudioTrack(input.participantMicrophone, "participant");
  const context = input.createAudioContext?.() ?? new AudioContext();
  const destination = context.createMediaStreamDestination();
  const runtimes: Record<SharedLiveRoomHumanAudioSource, AudioSourceRuntime> = {
    owner: connectSource(context, destination, input.ownerMicrophone),
    participant: connectSource(context, destination, input.participantMicrophone),
  };
  const outputTrack = requireAudioTrack(destination.stream, "mixed");
  let closed = false;

  return {
    outputTrack,
    outputStream: destination.stream,
    async resume() {
      if (closed || context.state === "closed") return false;
      if (context.state === "suspended") {
        await context.resume();
      }
      return context.state !== "suspended" && context.state !== "closed";
    },
    setSourceAdmitted(source, admitted) {
      if (closed) return;
      const runtime = runtimes[source];
      runtime.gain.gain.setValueAtTime(admitted ? 1 : 0, context.currentTime);
    },
    async close() {
      if (closed) return;
      closed = true;
      outputTrack.stop();
      for (const runtime of Object.values(runtimes)) {
        runtime.source.disconnect();
        runtime.gain.disconnect();
      }
      await context.close();
    },
  };
};
