import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskConsoleSupplementStateOptions = HelixAskConsoleSupplementSurfaceProps;

export function buildHelixAskConsoleSupplementState({
  attachmentItems,
  onRemoveAttachment,
  contextCapsulePreview,
  contextCapsuleAutoApplied,
  voiceStatusLabel,
  voiceStatusState,
  situationRoomSource,
  voiceCommandConfirmation,
  transcriptConfirmation,
  contextChooser,
  showObserverLane,
  conversationBriefText,
  observerLaneVisible,
  observerLaneEvents,
  contextMemoryStatusText,
  clipText,
}: HelixAskConsoleSupplementStateOptions): HelixAskConsoleSupplementSurfaceProps {
  return {
    attachmentItems,
    onRemoveAttachment,
    contextCapsulePreview,
    contextCapsuleAutoApplied,
    voiceStatusLabel,
    voiceStatusState,
    situationRoomSource,
    voiceCommandConfirmation,
    transcriptConfirmation,
    contextChooser,
    showObserverLane,
    conversationBriefText,
    observerLaneVisible,
    observerLaneEvents,
    contextMemoryStatusText,
    clipText,
  };
}
