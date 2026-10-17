export type SharedLiveRoomAudioPlayback = {
  attach(track: MediaStreamTrack): void;
  resume(): Promise<boolean>;
  setMuted(muted: boolean): void;
  close(): void;
};

export const createSharedLiveRoomAudioPlayback = (input: {
  onBlocked(): void;
  onPlaying(): void;
  createStream?: () => MediaStream;
  createAudioElement?: () => HTMLAudioElement;
}): SharedLiveRoomAudioPlayback => {
  const stream = input.createStream?.() ?? new MediaStream();
  const audio = input.createAudioElement?.() ?? document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  let closed = false;

  const resume = async (): Promise<boolean> => {
    if (closed) return false;
    try {
      await audio.play();
      input.onPlaying();
      return true;
    } catch {
      input.onBlocked();
      return false;
    }
  };

  return {
    attach(track) {
      if (closed) return;
      stream.addTrack(track);
      audio.srcObject = stream;
      void resume();
    },
    resume,
    setMuted(muted) {
      if (!closed) audio.muted = muted;
    },
    close() {
      if (closed) return;
      closed = true;
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    },
  };
};
