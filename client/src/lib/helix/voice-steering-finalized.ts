import { readPersonalVoiceDestination, type PersonalVoiceDestination } from "./personal-voice-route";

export const HELIX_VOICE_STEERING_FINALIZED_EVENT =
  "helix:voice-steering-finalized" as const;

export type HelixVoiceSteeringFinalizedDetail = Readonly<{
  clientEventRef: string;
  transcript: string;
  destination?: PersonalVoiceDestination;
}>;

export const offerFinalizedVoiceSteering = (
  detail: HelixVoiceSteeringFinalizedDetail,
): boolean => {
  if (typeof window === "undefined") return false;
  const destination = readPersonalVoiceDestination();
  if (destination === "ask_helix") return false;
  const event = new CustomEvent<HelixVoiceSteeringFinalizedDetail>(
    HELIX_VOICE_STEERING_FINALIZED_EVENT,
    { detail: { ...detail, destination }, cancelable: true },
  );
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
