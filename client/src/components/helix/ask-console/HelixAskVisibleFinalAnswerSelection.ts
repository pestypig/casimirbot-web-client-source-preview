import {
  resolveHelixVisibleTerminal,
  type HelixVisibleTerminalResolution,
} from "@/lib/helix/resolveHelixVisibleTerminal";

export type HelixAskVisibleFinalAnswerSelection = HelixVisibleTerminalResolution;

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readTerminalAuthorityRecord = (source: unknown): Record<string, unknown> | null => {
  const sourceRecord = readRecord(source);
  const debugRecord = readRecord(sourceRecord?.debug);
  return (
    readRecord(sourceRecord?.terminal_answer_authority) ??
    readRecord(debugRecord?.terminal_answer_authority) ??
    readRecord(sourceRecord?.terminal_authority_single_writer) ??
    readRecord(debugRecord?.terminal_authority_single_writer) ??
    null
  );
};

const readTerminalPresentationRecord = (source: unknown): Record<string, unknown> | null => {
  const sourceRecord = readRecord(source);
  const debugRecord = readRecord(sourceRecord?.debug);
  return (
    readRecord(sourceRecord?.terminal_presentation) ??
    readRecord(debugRecord?.terminal_presentation) ??
    null
  );
};

export function selectHelixAskVisibleFinalAnswer(args: {
  source: unknown;
  fallbackContent?: string | null;
}): HelixAskVisibleFinalAnswerSelection {
  const terminal = resolveHelixVisibleTerminal(args.source, args.fallbackContent);
  const authority = readTerminalAuthorityRecord(args.source);
  const presentation = readTerminalPresentationRecord(args.source);
  const authorityText =
    readString(presentation?.concise_text) ||
    readString(authority?.terminal_text) ||
    readString(authority?.terminal_text_preview) ||
    readString(authority?.text);
  const authorityVerified = authority?.server_authoritative === true && Boolean(authorityText);
  if (!authorityVerified) return terminal;
  const terminalArtifactKind = readString(authority?.terminal_artifact_kind) || terminal.terminalArtifactKind;
  const finalAnswerSource = readString(authority?.final_answer_source) || terminal.finalAnswerSource;
  const terminalErrorCode = readString(authority?.terminal_error_code) || terminal.terminalErrorCode;
  return {
    ...terminal,
    text: authorityText,
    source: "terminal_answer_authority",
    backendTerminalText: authorityText,
    terminalArtifactKind,
    finalAnswerSource,
    terminalErrorCode,
    authorityVerified: true,
  };
}
