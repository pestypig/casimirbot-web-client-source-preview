import { type ReactNode } from "react";

import type { HelixAskTurnStreamPanelProps } from "./HelixAskTurnStreamPanel";
import { HelixAskReplyTurn } from "./HelixAskReplyTurn";

export type HelixAskActiveTurnReplyProps = {
  rows: HelixAskTurnStreamPanelProps["rows"];
  tintClassName: string;
  replyId?: string | null;
  activeTurnId?: string | null;
  renderFinalAnswer?: HelixAskTurnStreamPanelProps["renderFinalAnswer"];
  clipText: HelixAskTurnStreamPanelProps["clipText"];
  readRowClassName: HelixAskTurnStreamPanelProps["readRowClassName"];
  readDotClassName: HelixAskTurnStreamPanelProps["readDotClassName"];
  readPillClassName: HelixAskTurnStreamPanelProps["readPillClassName"];
};

const noop = () => undefined;
const renderNoActiveTurnFinalAnswer = () => null;

export function HelixAskActiveTurnReply({
  rows,
  tintClassName,
  replyId,
  activeTurnId,
  renderFinalAnswer,
  clipText,
  readRowClassName,
  readDotClassName,
  readPillClassName,
}: HelixAskActiveTurnReplyProps) {
  if (rows.length === 0) return null;
  return (
    <HelixAskReplyTurn
      isLatestReply={true}
      card={{
        turnTestId: "helix-ask-active-turn",
        tintClassName,
        contextCapsule: null,
        promptIngested: false,
      }}
      stream={{
        rows,
        workLogTestId: "helix-ask-active-turn-work-log",
        questionTestId: "helix-ask-active-turn-question",
        finalAnswerTestId: "helix-ask-active-turn-final-answer",
        stagePlayEventCount: 0,
        finalAnswerRawText: "",
        finalAnswerSourceLabel: "active turn",
        backendTerminalAnswer: null,
        finalAnswerAuthority: "terminal",
        replyId,
        activeTurnId,
        answerTint: null,
        actualAgentProviderLabel: null,
        actualAgentModelLabel: null,
        liveBridgeStatus: null,
        renderFinalAnswer: renderFinalAnswer ?? renderNoActiveTurnFinalAnswer,
        clipText,
        readRowClassName,
        readDotClassName,
        readPillClassName,
        onCopyFinal: noop,
        onDebugCopy: noop,
        onReadAloud: noop,
        showDebugCopy: false,
        debugCopyDisabled: true,
        copyFinalTestId: "helix-ask-active-turn-copy-final",
        debugCopyTestId: "helix-ask-active-turn-debug-copy",
        readAloudTestId: "helix-ask-active-turn-read-aloud",
        readAloudActive: false,
        readAloudAriaLabel: "Read aloud",
        readAloudTitle: "Read aloud",
        proofTrace: null,
        jobReadyLinks: [],
        onRunJobReadyLink: noop,
      }}
    />
  );
}
