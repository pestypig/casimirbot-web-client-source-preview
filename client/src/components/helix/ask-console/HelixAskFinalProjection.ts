import type { HelixTurnTranscriptRow } from "@/lib/helix/ask-turn-transcript";

export type HelixAskConsoleFinalProjectionOptions = {
  isInvalidTerminalAnswerText?: (text: string) => boolean;
  excludedFinalTexts?: readonly string[];
};

function normalizeSourceLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "_").toLowerCase();
}

function isFailedStatus(status: string): boolean {
  return /\b(?:failed|blocked|error)\b/i.test(status);
}

export function hasSuccessfulWorkstationTerminalTranscriptRows(
  rows: readonly HelixTurnTranscriptRow[],
  options: HelixAskConsoleFinalProjectionOptions = {},
): boolean {
  const excludedFinalTexts = new Set((options.excludedFinalTexts ?? []).map((text) => text.trim()).filter(Boolean));
  const hasSuccessfulObservation = rows.some((row) => {
    if (row.label !== "Tool Observation" && row.label !== "Action Observation") return false;
    if (isFailedStatus(row.status)) return false;
    return /\b(?:Tool|Action) observation:\s*[\w.-]+\s+observed\b/i.test(row.text);
  });
  const hasModelReentry = rows.some(
    (row) =>
      row.label === "Model Re-entry" &&
      !isFailedStatus(row.status) &&
      /\bworkstation observation packet/i.test(row.text),
  );
  const hasFinal = rows.some((row) => {
    const text = row.text.trim();
    if (row.label !== "Final" || !text) return false;
    if (options.isInvalidTerminalAnswerText?.(text)) return false;
    if (excludedFinalTexts.has(text)) return false;
    return true;
  });
  return hasSuccessfulObservation && hasModelReentry && hasFinal;
}

export function resolveHelixAskConsoleFinalAnswerSourceLabel(args: {
  rawFinalAnswerSourceLabel: string;
  turnTranscriptRows: readonly HelixTurnTranscriptRow[];
  options?: HelixAskConsoleFinalProjectionOptions;
}): string {
  if (
    normalizeSourceLabel(args.rawFinalAnswerSourceLabel) === "typed_failure" &&
    hasSuccessfulWorkstationTerminalTranscriptRows(args.turnTranscriptRows, args.options)
  ) {
    return "workstation tool evaluation";
  }
  return args.rawFinalAnswerSourceLabel;
}
