import type { HelixAskRealtimeCompletedOutputTranscript } from
  "../../HelixAskRealtimeOutputTranscriptDebug";

type TranscriptListener = (transcript: HelixAskRealtimeCompletedOutputTranscript) => void;
export type SharedLiveRoomInputSpeechStarted = {
  itemId: string;
  observedAtMs: number;
};
export type SharedLiveRoomInputTranscript = {
  eventRef: string;
  itemId: string | null;
  transcript: string;
  observedAtMs: number;
};
type InputSpeechStartedListener = (speech: SharedLiveRoomInputSpeechStarted) => void;
type InputTranscriptListener = (transcript: SharedLiveRoomInputTranscript) => void;
const listeners = new Map<string, Set<TranscriptListener>>();
const inputSpeechStartedListeners =
  new Map<string, Set<InputSpeechStartedListener>>();
const inputListeners = new Map<string, Set<InputTranscriptListener>>();
const observedInputEventRefs = new Map<string, string[]>();

export const publishSharedLiveRoomOutputTranscript = (
  realtimeSessionId: string,
  transcript: HelixAskRealtimeCompletedOutputTranscript,
): void => {
  for (const listener of listeners.get(realtimeSessionId) ?? []) listener(transcript);
};

export const subscribeSharedLiveRoomOutputTranscripts = (
  realtimeSessionId: string,
  listener: TranscriptListener,
): (() => void) => {
  const sessionListeners = listeners.get(realtimeSessionId) ?? new Set<TranscriptListener>();
  sessionListeners.add(listener);
  listeners.set(realtimeSessionId, sessionListeners);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) listeners.delete(realtimeSessionId);
  };
};

export const publishSharedLiveRoomInputTranscript = (
  realtimeSessionId: string,
  transcript: SharedLiveRoomInputTranscript,
): void => {
  const observed = observedInputEventRefs.get(realtimeSessionId) ?? [];
  if (observed.includes(transcript.eventRef)) return;
  observedInputEventRefs.set(
    realtimeSessionId,
    [...observed, transcript.eventRef].slice(-64),
  );
  for (const listener of inputListeners.get(realtimeSessionId) ?? []) listener(transcript);
};

export const publishSharedLiveRoomInputSpeechStarted = (
  realtimeSessionId: string,
  speech: SharedLiveRoomInputSpeechStarted,
): void => {
  for (
    const listener of inputSpeechStartedListeners.get(realtimeSessionId) ?? []
  ) {
    listener(speech);
  }
};

export const subscribeSharedLiveRoomInputSpeechStarted = (
  realtimeSessionId: string,
  listener: InputSpeechStartedListener,
): (() => void) => {
  const sessionListeners =
    inputSpeechStartedListeners.get(realtimeSessionId) ??
    new Set<InputSpeechStartedListener>();
  sessionListeners.add(listener);
  inputSpeechStartedListeners.set(realtimeSessionId, sessionListeners);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) {
      inputSpeechStartedListeners.delete(realtimeSessionId);
    }
  };
};

export const subscribeSharedLiveRoomInputTranscripts = (
  realtimeSessionId: string,
  listener: InputTranscriptListener,
): (() => void) => {
  const sessionListeners =
    inputListeners.get(realtimeSessionId) ?? new Set<InputTranscriptListener>();
  sessionListeners.add(listener);
  inputListeners.set(realtimeSessionId, sessionListeners);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) {
      inputListeners.delete(realtimeSessionId);
      observedInputEventRefs.delete(realtimeSessionId);
    }
  };
};
