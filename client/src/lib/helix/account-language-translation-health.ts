export type HelixAccountLanguageTranslationProjectionStatus =
  | "empty"
  | "active"
  | "pending"
  | "ready"
  | "stale"
  | "cancelled"
  | "failed"
  | "blocked";

export type ResolveHelixAccountLanguageTranslationHealthInput = {
  projectionStatus?: string | null;
  translatedText?: string | null;
  terminalAuthorityStatus?: string | null;
  sessionDebugPhase?: string | null;
  sessionObservationStatus?: string | null;
  laneSessionId?: string | null;
};

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export function resolveHelixAccountLanguageTranslationProjectionHealth(
  input: ResolveHelixAccountLanguageTranslationHealthInput,
): HelixAccountLanguageTranslationProjectionStatus {
  const projectionStatus = readText(input.projectionStatus).toLowerCase();
  const terminalAuthorityStatus = readText(input.terminalAuthorityStatus).toLowerCase();
  const sessionDebugPhase = readText(input.sessionDebugPhase).toLowerCase();
  const sessionObservationStatus = readText(input.sessionObservationStatus).toLowerCase();

  if (terminalAuthorityStatus === "terminal_authority_rejected") return "blocked";
  if (projectionStatus === "projected" && readText(input.translatedText)) return "ready";
  if (
    terminalAuthorityStatus === "pending_helix_terminal_authority" ||
    sessionObservationStatus.includes("pending") ||
    sessionObservationStatus.includes("queued") ||
    sessionObservationStatus.includes("waiting")
  ) {
    return "pending";
  }
  if (
    projectionStatus === "projected" &&
    (
      Boolean(readText(input.laneSessionId)) ||
      sessionDebugPhase.includes("active") ||
      sessionDebugPhase.includes("running") ||
      sessionDebugPhase.includes("collect") ||
      sessionDebugPhase.includes("translat") ||
      sessionObservationStatus.includes("record")
    )
  ) {
    return "active";
  }
  if (projectionStatus === "projected") return "empty";
  if (
    projectionStatus === "stale" ||
    projectionStatus === "cancelled" ||
    projectionStatus === "failed"
  ) {
    return projectionStatus;
  }
  return "empty";
}
