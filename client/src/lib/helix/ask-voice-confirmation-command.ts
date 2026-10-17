export type TranscriptConfirmationVoiceCommand = "confirm" | "retry" | "cancel";

export function parseTranscriptConfirmationVoiceCommand(
  transcript: string,
): TranscriptConfirmationVoiceCommand | null {
  const normalized = transcript
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const tokenCount = normalized.split(" ").filter(Boolean).length;
  if (tokenCount > 4) return null;
  if (
    normalized === "confirm" ||
    normalized === "yes" ||
    normalized === "yeah" ||
    normalized === "yep" ||
    normalized === "correct" ||
    normalized === "thats right" ||
    normalized === "that's right" ||
    normalized === "proceed"
  ) {
    return "confirm";
  }
  if (
    normalized === "retry" ||
    normalized === "again" ||
    normalized === "redo" ||
    normalized === "try again" ||
    normalized === "no" ||
    normalized === "nope" ||
    normalized === "wrong" ||
    normalized === "not that"
  ) {
    return "retry";
  }
  if (normalized === "cancel" || normalized === "dismiss" || normalized === "stop") {
    return "cancel";
  }
  return null;
}
