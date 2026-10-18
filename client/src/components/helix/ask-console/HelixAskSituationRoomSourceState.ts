import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";
import type { SituationRoomState } from "@/lib/helix/situation-room";

export type HelixAskSituationRoomSourceStateOptions =
  HelixAskConsoleSupplementSurfaceProps["situationRoomSource"];

export function buildHelixAskSituationRoomSourceState({
  visible,
  label,
  status,
  sourceCount,
  visualError,
  audioError,
  visualSourceActive,
  transcriptPreview,
  displayAudioActive,
  onStopDisplayAudio,
}: HelixAskSituationRoomSourceStateOptions): HelixAskConsoleSupplementSurfaceProps["situationRoomSource"] {
  return {
    visible,
    label,
    status,
    sourceCount,
    visualError,
    audioError,
    visualSourceActive,
    transcriptPreview,
    displayAudioActive,
    onStopDisplayAudio,
  };
}

export type HelixAskSituationRoomSourceStatus =
  | "idle"
  | "requesting"
  | "active"
  | "transcribing"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

export type HelixAskSituationRoomDisplayAudioSourceSnapshot = {
  label?: string | null;
  status?: HelixAskSituationRoomSourceStatus | null;
  transcript_preview?: string | null;
};

export type HelixAskSituationRoomSourceDerivedStateOptions = {
  visualSituationSourceStatus: HelixAskSituationRoomSourceStatus;
  visualSituationSourceLabel?: string | null;
  visualSituationSourceError?: string | null;
  displayAudioStatus: HelixAskSituationRoomSourceStatus;
  displayAudioError?: string | null;
  displayAudioCaptureLabel?: string | null;
  displayAudioSourceSnapshot?: HelixAskSituationRoomDisplayAudioSourceSnapshot | null;
  situationRoomState: Pick<SituationRoomState, "recentTranscript" | "recentEvents" | "sources">;
  onStopDisplayAudio: () => void;
};

export function buildHelixAskSituationRoomSourceDerivedState({
  visualSituationSourceStatus,
  visualSituationSourceLabel,
  visualSituationSourceError,
  displayAudioStatus,
  displayAudioError,
  displayAudioCaptureLabel,
  displayAudioSourceSnapshot,
  situationRoomState,
  onStopDisplayAudio,
}: HelixAskSituationRoomSourceDerivedStateOptions): HelixAskConsoleSupplementSurfaceProps["situationRoomSource"] {
  const transcriptPreview =
    displayAudioSourceSnapshot?.transcript_preview ??
    situationRoomState.recentTranscript
      .slice(-3)
      .map((segment) => segment.text)
      .join(" ")
      .trim();
  const sourceCount = displayAudioSourceSnapshot ? 1 : Object.keys(situationRoomState.sources).length;
  const visualSourceActive = visualSituationSourceStatus === "active";
  const label =
    visualSituationSourceStatus !== "idle"
      ? (visualSituationSourceLabel ?? "Visual screen capture")
      : (displayAudioSourceSnapshot?.label ?? displayAudioCaptureLabel ?? "Display audio");
  const status =
    visualSituationSourceStatus !== "idle"
      ? visualSituationSourceStatus
      : (displayAudioSourceSnapshot?.status ?? displayAudioStatus);
  const sourceCountVisible =
    (visualSituationSourceStatus !== "idle" ? 1 : 0) + (displayAudioSourceSnapshot ? 1 : sourceCount);
  const displayAudioActive =
    (displayAudioStatus === "active" || displayAudioStatus === "transcribing") &&
    displayAudioSourceSnapshot?.status !== "stopped" &&
    displayAudioSourceSnapshot?.status !== "error";
  const visible =
    visualSituationSourceStatus !== "idle" ||
    displayAudioStatus !== "idle" ||
    situationRoomState.recentEvents.length > 0;

  return buildHelixAskSituationRoomSourceState({
    visible,
    label,
    status,
    sourceCount: sourceCountVisible,
    visualError: visualSituationSourceError ?? null,
    audioError: displayAudioError ?? null,
    visualSourceActive,
    transcriptPreview,
    displayAudioActive,
    onStopDisplayAudio,
  });
}
