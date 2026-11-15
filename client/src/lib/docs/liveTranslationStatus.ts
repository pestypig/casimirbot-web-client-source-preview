import type { HelixVisibleTranslationTarget } from "@shared/helix-live-translation-lane";
import type { HelixLiveTranslationUiProjectionSelectionStatus } from "@/lib/helix/live-translation-projection";

const normalizedText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function normalizeDocumentProjectionStatus(
  value: unknown,
): HelixLiveTranslationUiProjectionSelectionStatus | undefined {
  const status = normalizedText(value);
  return status === "projected" || status === "stale" || status === "cancelled" ||
    status === "failed" || status === "missing" ? status : undefined;
}

export function normalizeDocumentFreshnessStatus(
  value: unknown,
): NonNullable<HelixVisibleTranslationTarget["existing_freshness_status"]> | undefined {
  const status = normalizedText(value);
  return status === "fresh" || status === "stale" || status === "unknown" ? status : undefined;
}

export function normalizeVisibleDocumentProjectionStatus(
  value: unknown,
): HelixVisibleTranslationTarget["existing_projection_status"] {
  const status = normalizeDocumentProjectionStatus(value);
  // "missing" describes a local selection result, not an existing projection receipt.
  return status && status !== "missing" ? status : null;
}
