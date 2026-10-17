export type HelixAskLatestTurnCandidate = {
  id: string;
  finalAnswerText?: string | null;
};

export type HelixAskLatestTurnBinding = {
  isLatest: boolean;
  controlTarget: HelixAskLatestTurnControlTarget;
  copyFinalTestId?: "helix-ask-latest-copy-final";
  debugCopyTestId?: "helix-ask-latest-debug-copy";
  finalAnswerTestId?: "helix-ask-latest-final-answer";
  questionTestId?: "helix-ask-latest-question";
  readAloudTestId?: "helix-ask-latest-read-aloud";
  turnTestId?: "helix-ask-latest-turn";
  workLogTestId?: "helix-ask-latest-work-log";
  finalAnswerText: string;
};

export type HelixAskLatestTurnControlTarget = {
  replyId: string;
  isLatest: boolean;
  finalAnswerText: string;
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function resolveHelixAskLatestTurnId(candidates: readonly HelixAskLatestTurnCandidate[]): string | null {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const id = coerceText(candidates[index]?.id).trim();
    if (id) return id;
  }
  return null;
}

export function buildHelixAskLatestTurnBinding(args: {
  replyId: string;
  latestReplyId: string | null | undefined;
  finalAnswerText?: string | null;
}): HelixAskLatestTurnBinding {
  const isLatest = Boolean(args.replyId && args.latestReplyId && args.replyId === args.latestReplyId);
  const finalAnswerText = coerceText(args.finalAnswerText);
  if (!isLatest) {
    return {
      isLatest: false,
      controlTarget: {
        replyId: args.replyId,
        isLatest: false,
        finalAnswerText,
      },
      finalAnswerText,
    };
  }
  return {
    isLatest: true,
    controlTarget: {
      replyId: args.replyId,
      isLatest: true,
      finalAnswerText,
    },
    copyFinalTestId: "helix-ask-latest-copy-final",
    debugCopyTestId: "helix-ask-latest-debug-copy",
    finalAnswerTestId: "helix-ask-latest-final-answer",
    questionTestId: "helix-ask-latest-question",
    readAloudTestId: "helix-ask-latest-read-aloud",
    turnTestId: "helix-ask-latest-turn",
    workLogTestId: "helix-ask-latest-work-log",
    finalAnswerText,
  };
}
