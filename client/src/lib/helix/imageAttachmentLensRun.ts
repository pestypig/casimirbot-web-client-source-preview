import {
  buildImageAttachmentLensRunV1,
  shouldAdmitImageAttachmentLensRun,
  type ImageAttachmentLensRunV1,
} from "@shared/contracts/image-attachment-lens-run.v1";
import { hashDocumentImageString } from "@/lib/document-image/documentImageRegions";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import type { HelixPanelActionExecutionContext } from "@/lib/workstation/panelActionAdapters";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";

export type ImageAttachmentLensRunAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  imageBase64?: string | null;
  previewUrl?: string | null;
  imageRef?: string | null;
  evidenceRef?: string | null;
};

export type RunImageAttachmentLensRunInput = {
  prompt: string;
  attachment: ImageAttachmentLensRunAttachment | null | undefined;
  threadId: string;
  turnId?: string | null;
  traceId?: string | null;
  context?: HelixPanelActionExecutionContext;
};

const BROAD_REGION_ID = "image-attachment:broad-full-image";

function openPanel(panelId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: panelId } }));
}

function defaultContext(): HelixPanelActionExecutionContext {
  return {
    openPanel: (panelId: string) => openPanel(panelId),
    focusPanel: (panelId: string) => openPanel(panelId),
    closePanel: () => {},
    openSettings: () => {},
  };
}

function toDataUrl(attachment: ImageAttachmentLensRunAttachment): string | null {
  const base64 = typeof attachment.imageBase64 === "string" ? attachment.imageBase64.trim() : "";
  if (base64) {
    if (/^data:image\//i.test(base64)) return base64;
    const mimeType = attachment.mimeType?.startsWith("image/") ? attachment.mimeType : "image/png";
    return `data:${mimeType};base64,${base64}`;
  }
  const previewUrl = typeof attachment.previewUrl === "string" ? attachment.previewUrl.trim() : "";
  if (previewUrl) return previewUrl;
  const imageRef = typeof attachment.imageRef === "string" ? attachment.imageRef.trim() : "";
  return imageRef || null;
}

function readArtifactRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function runImageAttachmentLensRun(
  input: RunImageAttachmentLensRunInput,
): Promise<ImageAttachmentLensRunV1> {
  const attachmentId = input.attachment?.id ?? "missing";
  const admission = shouldAdmitImageAttachmentLensRun(input.prompt);
  const baseAdmission = {
    admitted: admission.admitted,
    reason: admission.reason,
    promptRequiresVisualInspection: admission.promptRequiresVisualInspection,
    autoOpenedImageLens: false,
  };

  if (!admission.admitted) {
    return buildImageAttachmentLensRunV1({
      threadId: input.threadId,
      attachmentId,
      admission: baseAdmission,
    });
  }

  if (!input.attachment) {
    return buildImageAttachmentLensRunV1({
      threadId: input.threadId,
      attachmentId,
      admission: baseAdmission,
      broadObservation: {
        requested: true,
        status: "blocked",
      },
      blockers: ["image_attachment_lens_run_attachment_missing"],
    });
  }

  const sourceImageUrl = toDataUrl(input.attachment);
  if (!sourceImageUrl) {
    return buildImageAttachmentLensRunV1({
      threadId: input.threadId,
      attachmentId,
      admission: baseAdmission,
      broadObservation: {
        requested: true,
        status: "blocked",
      },
      blockers: ["image_attachment_lens_run_image_payload_missing"],
    });
  }

  const sourceHash = hashDocumentImageString(`${input.attachment.id}:${input.attachment.fileName}:${input.attachment.mimeType}`)
    .replace("fnv1a32:", "");
  const sourceId = `visual_source:image_attachment:${sourceHash}`;
  const sourceImageRef = `helix-ask-image-attachment:${input.attachment.id}`;
  useDocumentImageRegionStore.getState().setSourceImage({
    sourceImageUrl,
    sourceAttachmentId: sourceImageRef,
    sourceKind: "image_attachment",
    pageNumber: null,
  });
  openPanel("image-lens");

  const region = {
    regionId: BROAD_REGION_ID,
    bboxPct: { x: 0, y: 0, width: 1, height: 1 },
    reason: "Initial whole-image context pass for an admitted Helix Ask image attachment.",
    status: "planned" as const,
  };

  const execution = await executeWorkstationActionWithLedger({
    request: {
      panel_id: "image-lens",
      action_id: "image_lens.focus_regions",
      args: {
        sourceId,
        mode: "regions_only",
        maxRegions: 1,
        regions: [
          {
            regionId: BROAD_REGION_ID,
            bboxPct: region.bboxPct,
            reason: region.reason,
            priority: 100,
          },
        ],
      },
    },
    context: input.context ?? defaultContext(),
    thread_id: input.threadId,
    turn_id: input.turnId ?? null,
    trace_id: input.traceId ?? null,
  });

  const artifact = readArtifactRecord(execution.result.artifact);
  const submittedRegions = Array.isArray(artifact?.submittedRegions) ? artifact.submittedRegions : [];
  const firstSubmitted = readArtifactRecord(submittedRegions[0]);
  const blockers = Array.isArray(artifact?.blockers)
    ? artifact.blockers.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : execution.completed
      ? []
      : [execution.result.message ?? "image_attachment_lens_run_focus_action_failed"];

  return buildImageAttachmentLensRunV1({
    threadId: input.threadId,
    attachmentId: input.attachment.id,
    sourceId,
    sourceImageRef,
    admission: {
      ...baseAdmission,
      autoOpenedImageLens: true,
    },
    broadObservation: {
      requested: true,
      status: blockers.length > 0 ? "blocked" : "submitted",
      frameHistoryId: readString(firstSubmitted?.frameId),
      evidenceId: readString(firstSubmitted?.evidenceId),
      summary: readString(firstSubmitted?.summary),
    },
    focusRegions: [
      {
        ...region,
        status: blockers.length > 0 ? "blocked" : "submitted",
        evidenceId: readString(firstSubmitted?.evidenceId),
        frameId: readString(firstSubmitted?.frameId),
      },
    ],
    blockers,
  });
}

export { shouldAdmitImageAttachmentLensRun };
