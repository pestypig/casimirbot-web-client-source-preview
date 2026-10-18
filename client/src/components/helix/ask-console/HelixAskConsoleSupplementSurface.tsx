import { HelixAskAttachmentStrip, type HelixAskAttachmentStripCommitCheck } from "./HelixAskAttachmentStrip";
import {
  HelixAskContextCapsulePreview,
  type HelixAskContextCapsulePreviewModel,
} from "./HelixAskContextCapsulePreview";
import {
  HelixAskConsoleContextMemoryStatusSurface,
  HelixAskConsoleVoiceStatusSurface,
} from "./HelixAskConsoleStatusSurfaces";
import {
  HelixAskContextChooserPanel,
  HelixAskConversationBriefPanel,
  HelixAskObserverLanePanel,
  type HelixAskObserverLaneEvent,
} from "./HelixAskObserverLane";
import { HelixAskSituationRoomSourcePanel } from "./HelixAskSituationRoomSourcePanel";
import { HelixAskSurfaceSupplementStack } from "./HelixAskSurfaceSupplementStack";
import {
  HelixAskTranscriptConfirmationPanel,
  HelixAskVoiceCommandConfirmationPanel,
} from "./HelixAskVoiceConfirmationPanel";
import type { HelixAskVoiceInputStatus } from "./HelixAskStatusLine";

export type HelixAskConsoleSupplementSurfaceProps = {
  attachmentItems: readonly HelixAskAttachmentStripCommitCheck[];
  onRemoveAttachment: (attachmentId: string) => void;
  contextCapsulePreview: HelixAskContextCapsulePreviewModel | null;
  contextCapsuleAutoApplied: boolean;
  voiceStatusLabel: string;
  voiceStatusState: HelixAskVoiceInputStatus;
  situationRoomSource: {
    visible: boolean;
    label: string;
    status: string;
    sourceCount: number;
    visualError?: string | null;
    audioError?: string | null;
    visualSourceActive?: boolean;
    transcriptPreview?: string | null;
    displayAudioActive?: boolean;
    onStopDisplayAudio: () => void;
  };
  voiceCommandConfirmation: {
    visible: boolean;
    actionLabel: string;
    transcript: string;
    countdownSec?: number | null;
    onAccept: () => void;
    onCancel: () => void;
  };
  transcriptConfirmation: {
    visible: boolean;
    transcript: string;
    sourceText?: string | null;
    sourceLanguage?: string | null;
    translationUncertain?: boolean;
    countdownSec?: number | null;
    onAccept: () => void;
    onRetry: () => void;
  };
  contextChooser: {
    visible: boolean;
    autoContextMode?: "attached" | "isolated" | null;
    countdownSec?: number | null;
    onRunAttached: () => void;
    onRunIsolated: () => void;
    onCancel: () => void;
  };
  showObserverLane: boolean;
  conversationBriefText?: string | null;
  observerLaneVisible: boolean;
  observerLaneEvents: readonly HelixAskObserverLaneEvent[];
  contextMemoryStatusText?: string | null;
  clipText: (text: string, limit: number) => string;
};

export function HelixAskConsoleSupplementSurface({
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
}: HelixAskConsoleSupplementSurfaceProps) {
  return (
    <HelixAskSurfaceSupplementStack
      attachments={<HelixAskAttachmentStrip items={attachmentItems} onRemove={onRemoveAttachment} />}
      contextCapsule={
        <HelixAskContextCapsulePreview
          preview={contextCapsulePreview}
          autoApplied={contextCapsuleAutoApplied}
        />
      }
      voiceStatus={<HelixAskConsoleVoiceStatusSurface label={voiceStatusLabel} state={voiceStatusState} />}
      situationRoomSource={
        <HelixAskSituationRoomSourcePanel
          visible={situationRoomSource.visible}
          label={situationRoomSource.label}
          status={situationRoomSource.status}
          sourceCount={situationRoomSource.sourceCount}
          visualError={situationRoomSource.visualError}
          audioError={situationRoomSource.audioError}
          visualSourceActive={situationRoomSource.visualSourceActive}
          transcriptPreview={situationRoomSource.transcriptPreview}
          displayAudioActive={situationRoomSource.displayAudioActive}
          onStopDisplayAudio={situationRoomSource.onStopDisplayAudio}
          clipText={clipText}
        />
      }
      voiceCommandConfirmation={
        <HelixAskVoiceCommandConfirmationPanel
          visible={voiceCommandConfirmation.visible}
          actionLabel={voiceCommandConfirmation.actionLabel}
          transcript={voiceCommandConfirmation.transcript}
          countdownSec={voiceCommandConfirmation.countdownSec}
          onAccept={voiceCommandConfirmation.onAccept}
          onCancel={voiceCommandConfirmation.onCancel}
          clipText={clipText}
        />
      }
      transcriptConfirmation={
        <HelixAskTranscriptConfirmationPanel
          visible={transcriptConfirmation.visible}
          transcript={transcriptConfirmation.transcript}
          sourceText={transcriptConfirmation.sourceText}
          sourceLanguage={transcriptConfirmation.sourceLanguage}
          translationUncertain={transcriptConfirmation.translationUncertain}
          countdownSec={transcriptConfirmation.countdownSec}
          onAccept={transcriptConfirmation.onAccept}
          onRetry={transcriptConfirmation.onRetry}
          clipText={clipText}
        />
      }
      contextChooser={
        <HelixAskContextChooserPanel
          visible={contextChooser.visible}
          autoContextMode={contextChooser.autoContextMode}
          countdownSec={contextChooser.countdownSec}
          onRunAttached={contextChooser.onRunAttached}
          onRunIsolated={contextChooser.onRunIsolated}
          onCancel={contextChooser.onCancel}
        />
      }
      conversationBrief={
        showObserverLane ? <HelixAskConversationBriefPanel text={conversationBriefText} /> : null
      }
      observerLane={
        <HelixAskObserverLanePanel
          visible={observerLaneVisible}
          events={observerLaneEvents}
          clipText={clipText}
        />
      }
      contextMemoryStatus={<HelixAskConsoleContextMemoryStatusSurface text={contextMemoryStatusText} />}
    />
  );
}
