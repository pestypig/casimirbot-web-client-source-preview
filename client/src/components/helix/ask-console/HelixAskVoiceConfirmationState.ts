import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskVoiceCommandConfirmationStateOptions =
  HelixAskConsoleSupplementSurfaceProps["voiceCommandConfirmation"];

export type HelixAskTranscriptConfirmationStateOptions =
  HelixAskConsoleSupplementSurfaceProps["transcriptConfirmation"];

export function buildHelixAskVoiceCommandConfirmationState({
  visible,
  actionLabel,
  transcript,
  countdownSec,
  onAccept,
  onCancel,
}: HelixAskVoiceCommandConfirmationStateOptions): HelixAskConsoleSupplementSurfaceProps["voiceCommandConfirmation"] {
  return {
    visible,
    actionLabel,
    transcript,
    countdownSec,
    onAccept,
    onCancel,
  };
}

export function buildHelixAskTranscriptConfirmationState({
  visible,
  transcript,
  sourceText,
  sourceLanguage,
  translationUncertain,
  countdownSec,
  onAccept,
  onRetry,
}: HelixAskTranscriptConfirmationStateOptions): HelixAskConsoleSupplementSurfaceProps["transcriptConfirmation"] {
  return {
    visible,
    transcript,
    sourceText,
    sourceLanguage,
    translationUncertain,
    countdownSec,
    onAccept,
    onRetry,
  };
}
