import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";
import { buildVoiceInputStatusLabel } from "@/lib/helix/ask-voice-copy-display";

export type HelixAskVoiceStatusState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "voiceStatusLabel" | "voiceStatusState"
>;

export type HelixAskVoiceStatusStateOptions = HelixAskVoiceStatusState;

export function buildHelixAskVoiceStatusState({
  voiceStatusLabel,
  voiceStatusState,
}: HelixAskVoiceStatusStateOptions): HelixAskVoiceStatusState {
  return {
    voiceStatusLabel,
    voiceStatusState,
  };
}

export type HelixAskVoiceStatusDerivedStateOptions = {
  micArmState: "off" | "on";
  voiceInputState: HelixAskVoiceStatusState["voiceStatusState"];
  voiceInputError?: string | null;
};

export function buildHelixAskVoiceStatusDerivedState({
  micArmState,
  voiceInputState,
  voiceInputError,
}: HelixAskVoiceStatusDerivedStateOptions): HelixAskVoiceStatusState {
  return buildHelixAskVoiceStatusState({
    voiceStatusLabel: buildVoiceInputStatusLabel(micArmState, voiceInputState, voiceInputError ?? null),
    voiceStatusState: voiceInputState,
  });
}
