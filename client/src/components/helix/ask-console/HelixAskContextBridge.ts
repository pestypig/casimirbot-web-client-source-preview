import { readHelixAskActiveImageLensSourceContext } from "./HelixAskImageLensContextBridge";

export type HelixAskContextBridgeSnapshot = {
  [key: string]: unknown;
  activeDocPath: string | null;
  activeImageLensSource?: Record<string, unknown> | null;
  active_image_lens_source?: Record<string, unknown> | null;
  scientificEvidenceWorkflowStatus?: unknown;
  scientific_evidence_workflow_status?: unknown;
};

export function readDocPathFromDesktopUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost");
    const value = parsed.searchParams.get("doc");
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function buildHelixAskContextBridgeSnapshot(url: string): HelixAskContextBridgeSnapshot {
  const activeImageLensSource = readHelixAskActiveImageLensSourceContext();
  const scientificEvidenceWorkflowStatus =
    activeImageLensSource?.scientific_evidence_workflow_status ?? null;
  return {
    activeDocPath: readDocPathFromDesktopUrl(url),
    activeImageLensSource,
    active_image_lens_source: activeImageLensSource,
    scientificEvidenceWorkflowStatus,
    scientific_evidence_workflow_status: scientificEvidenceWorkflowStatus,
  };
}
