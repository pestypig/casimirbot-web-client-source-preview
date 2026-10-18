import type {
  HelixAskLiveRuntimeBrowserTransportController,
  HelixAskLiveRuntimeMediaStreamLike,
  HelixAskLiveRuntimeTrackLike,
} from "../../HelixAskLiveRuntimeTransportController";

/**
 * Ephemeral browser-only access to the active GPT Live media transport.
 * Raw MediaStreams never enter room API payloads, persisted state, or debug exports.
 */
export type HelixAskLiveMediaBoundary = {
  realtimeSessionId: string;
  readOwnerMicrophoneStream(): HelixAskLiveRuntimeMediaStreamLike | null;
  readProviderOutputStream(): HelixAskLiveRuntimeMediaStreamLike | null;
  readProviderInputEnabled(): boolean;
  replaceProviderInputAudioTrack(track: HelixAskLiveRuntimeTrackLike, options?: { enableExternalAudio?: boolean }): Promise<boolean>;
  restoreProviderInputAudioTrack(): Promise<boolean>;
};

const boundaries = new Map<string, {
  controller: HelixAskLiveRuntimeBrowserTransportController;
  boundary: HelixAskLiveMediaBoundary;
}>();

export const registerHelixAskLiveMediaBoundary = (input: {
  realtimeSessionId: string;
  controller: HelixAskLiveRuntimeBrowserTransportController;
}): HelixAskLiveMediaBoundary => {
  const boundary: HelixAskLiveMediaBoundary = {
    realtimeSessionId: input.realtimeSessionId,
    readOwnerMicrophoneStream: () => input.controller.getResources().mediaStream,
    readProviderOutputStream: () => input.controller.readProviderOutputStream(),
    readProviderInputEnabled: () => input.controller.getMicrophoneEnabled(),
    replaceProviderInputAudioTrack: (track, options) =>
      input.controller.replaceProviderInputAudioTrack(track, options),
    restoreProviderInputAudioTrack: () =>
      input.controller.restoreProviderInputAudioTrack(),
  };
  boundaries.set(input.realtimeSessionId, {
    controller: input.controller,
    boundary,
  });
  return boundary;
};

export const unregisterHelixAskLiveMediaBoundary = (input: {
  realtimeSessionId: string | null;
  controller?: HelixAskLiveRuntimeBrowserTransportController | null;
}): void => {
  if (!input.realtimeSessionId) return;
  const registered = boundaries.get(input.realtimeSessionId);
  if (!registered) return;
  if (input.controller && registered.controller !== input.controller) return;
  boundaries.delete(input.realtimeSessionId);
};

export const readHelixAskLiveMediaBoundary = (
  realtimeSessionId: string | null,
): HelixAskLiveMediaBoundary | null =>
  realtimeSessionId ? boundaries.get(realtimeSessionId)?.boundary ?? null : null;
