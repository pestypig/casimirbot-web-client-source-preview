import React, { type ReactNode } from "react";

export type HelixAskSurfaceSupplementStackProps = {
  attachments?: ReactNode;
  contextCapsule?: ReactNode;
  voiceStatus?: ReactNode;
  situationRoomSource?: ReactNode;
  voiceCommandConfirmation?: ReactNode;
  transcriptConfirmation?: ReactNode;
  contextChooser?: ReactNode;
  conversationBrief?: ReactNode;
  observerLane?: ReactNode;
  contextMemoryStatus?: ReactNode;
};

export function HelixAskSurfaceSupplementStack({
  attachments = null,
  contextCapsule = null,
  voiceStatus = null,
  situationRoomSource = null,
  voiceCommandConfirmation = null,
  transcriptConfirmation = null,
  contextChooser = null,
  conversationBrief = null,
  observerLane = null,
  contextMemoryStatus = null,
}: HelixAskSurfaceSupplementStackProps) {
  return (
    <>
      {attachments}
      {contextCapsule}
      {voiceStatus}
      {situationRoomSource}
      {voiceCommandConfirmation}
      {transcriptConfirmation}
      {contextChooser}
      {conversationBrief}
      {observerLane}
      {contextMemoryStatus}
    </>
  );
}
