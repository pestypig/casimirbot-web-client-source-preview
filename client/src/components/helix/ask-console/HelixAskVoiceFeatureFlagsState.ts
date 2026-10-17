import type { VoiceCaptureDiagnosticsSnapshot } from "@/lib/helix/voice-capture-diagnostics";

export type HelixAskVoiceFeatureFlagsState = NonNullable<VoiceCaptureDiagnosticsSnapshot["voiceFeatureFlags"]>;

export type HelixAskVoiceFeatureFlagsStateOptions = HelixAskVoiceFeatureFlagsState;

export function buildHelixAskVoiceFeatureFlagsState({
  confirmV2RolloutEligible,
  confirmV2Active,
  confirmV2ShadowMode,
  commandLaneUiEnabled,
  localAudioGateActive,
  sessionSpeakerActive,
  multiSpeakerUiActive,
  noisyEnvironmentMode,
}: HelixAskVoiceFeatureFlagsStateOptions): HelixAskVoiceFeatureFlagsState {
  return {
    confirmV2RolloutEligible,
    confirmV2Active,
    confirmV2ShadowMode,
    commandLaneUiEnabled,
    localAudioGateActive,
    sessionSpeakerActive,
    multiSpeakerUiActive,
    noisyEnvironmentMode,
  };
}
