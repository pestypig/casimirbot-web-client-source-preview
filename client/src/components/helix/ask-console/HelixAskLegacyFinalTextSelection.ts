export type HelixAskLegacyFinalTextTranscriptRow = {
  label?: string | null;
  text?: string | null;
};

export type HelixAskLegacyFinalTextSelectionInput = {
  turnTranscriptRows: readonly HelixAskLegacyFinalTextTranscriptRow[];
  chosenVisibleFinalText: string;
  backendTerminalText?: string | null;
  primaryTerminalLabel: string;
  primarySourceLabel: string;
  isInvalidTerminalAnswerText: (value: string) => boolean;
};

export type HelixAskLegacyFinalTextSelection = {
  finalAnswerRawText: string;
  transcriptFinalRowText: string | null;
  usedTranscriptFinalRow: boolean;
};

export type HelixAskLegacyTerminalMismatchInput = {
  backendTerminalText: string | null | undefined;
  visibleTerminalText: string | null | undefined;
  normalizeTerminalAnswerText: (value: string | null | undefined) => string;
};

export type HelixAskLegacyFinalSourceLabelInput = {
  presentationSourceLabel?: string | null;
  finalAnswerSourceLabel?: string | null;
  transcriptTerminalSource?: string | null;
};

export function selectHelixAskLegacyFinalAnswerText({
  turnTranscriptRows,
  chosenVisibleFinalText,
  backendTerminalText,
  primaryTerminalLabel,
  primarySourceLabel,
  isInvalidTerminalAnswerText,
}: HelixAskLegacyFinalTextSelectionInput): HelixAskLegacyFinalTextSelection {
  const transcriptFinalRowText =
    [...turnTranscriptRows]
      .reverse()
      .find((row) => row.label === "Final" && row.text && !isInvalidTerminalAnswerText(row.text))?.text ?? null;
  const chosenVisibleFinalIsTypedFailureBoundary =
    /\bCause:\s*(?:equation_source_unavailable|calculator_evidence_unavailable|synthesis_unavailable)\b/i.test(
      chosenVisibleFinalText,
    ) || /^I looked for an NHM2 paper\/document with equation-bearing snippets/i.test(chosenVisibleFinalText);
  const usedTranscriptFinalRow =
    Boolean(transcriptFinalRowText) &&
    !backendTerminalText?.trim() &&
    (chosenVisibleFinalIsTypedFailureBoundary ||
      primaryTerminalLabel === "final_failure" ||
      primarySourceLabel.replace(/\s+/g, "_") === "typed_failure");

  return {
    finalAnswerRawText: usedTranscriptFinalRow
      ? transcriptFinalRowText ?? chosenVisibleFinalText
      : chosenVisibleFinalText,
    transcriptFinalRowText,
    usedTranscriptFinalRow,
  };
}

export function hasHelixAskLegacyTerminalMismatch({
  backendTerminalText,
  visibleTerminalText,
  normalizeTerminalAnswerText,
}: HelixAskLegacyTerminalMismatchInput): boolean {
  return Boolean(
    backendTerminalText &&
      visibleTerminalText &&
      normalizeTerminalAnswerText(backendTerminalText) !== normalizeTerminalAnswerText(visibleTerminalText),
  );
}

export function resolveHelixAskLegacyFinalSourceLabel({
  presentationSourceLabel,
  finalAnswerSourceLabel,
  transcriptTerminalSource,
}: HelixAskLegacyFinalSourceLabelInput): string | null {
  return presentationSourceLabel || finalAnswerSourceLabel || transcriptTerminalSource || null;
}
