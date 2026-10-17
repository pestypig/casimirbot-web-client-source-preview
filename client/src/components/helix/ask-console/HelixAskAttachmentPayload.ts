import type { HelixTurnInputItem } from "@shared/helix-turn-input-item";

import { isDiagnosticVisualEvidence } from "@/lib/helix/ask-visual-evidence-readers";
import {
  buildHelixAskAttachmentCommitChecks,
  validateHelixAskAttachmentForSubmit,
  validateHelixAskImageAttachmentForSubmit,
  type HelixAskAttachment,
  type HelixAskAttachmentCommitCheckEntry,
  type HelixAskImageAttachment,
} from "./HelixAskAttachmentCommit";
import { buildHelixAskTextAttachmentTurnInputItem } from "./HelixAskTextAttachment";

export type HelixAskAttachmentContextPack = {
  schema: "helix.attachment_context_pack.v1";
  attachment_count: number;
  attachments: Array<{
    attachment_id: string;
    ordinal: number;
    kind: HelixAskAttachment["kind"];
    file_name: string;
    mime_type: string;
    size_bytes: number;
    content_sha256: string | null;
    preview: string | null;
    evidence_ref: string | null;
    image_ref: string | null;
    raw_content_included: false;
    raw_image_included: false;
    assistant_answer: false;
  }>;
  raw_content_included: false;
  raw_image_included: false;
  assistant_answer: false;
};

export type HelixAskVisualEvidenceTurnInputContext = {
  visualEvidence: Record<string, unknown> | null;
  evidenceRecord: Record<string, unknown> | null;
  evidenceId: string | null;
  frameId: string | null;
  summary: string | null;
  mimeType: string;
};

export type HelixAskSubmittedAttachmentCheck = HelixAskAttachmentCommitCheckEntry;

export type HelixAskSubmitRunOptionsPayload = {
  attachments?: HelixAskAttachment[];
  turnInputItems?: HelixTurnInputItem[];
  visualEvidence?: Record<string, unknown>;
  visualCapability?: Record<string, unknown>;
};

function readAttachmentPayloadText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveHelixAskSubmittedAttachments(args: {
  attachments?: readonly HelixAskAttachment[] | null;
  imageAttachment?: HelixAskImageAttachment | null;
}): HelixAskAttachment[] {
  if (Array.isArray(args.attachments) && args.attachments.length > 0) {
    return [...args.attachments];
  }
  return args.imageAttachment ? [args.imageAttachment] : [];
}

export function selectHelixAskNativeImageAttachments(
  attachments: readonly HelixAskAttachment[],
): HelixAskImageAttachment[] {
  return attachments.filter((attachment): attachment is HelixAskImageAttachment => attachment.kind === "image");
}

export function selectFirstHelixAskSubmitReadyImageAttachment(
  attachments: readonly HelixAskAttachment[],
): HelixAskImageAttachment | null {
  return (
    selectHelixAskNativeImageAttachments(attachments).find(
      (attachment) => validateHelixAskImageAttachmentForSubmit(attachment)?.can_submit,
    ) ?? null
  );
}

export function buildHelixAskSubmittedAttachmentChecks(
  attachments: readonly HelixAskAttachment[],
): HelixAskSubmittedAttachmentCheck[] {
  return buildHelixAskAttachmentCommitChecks(attachments);
}

export function selectFirstInvalidHelixAskSubmittedAttachment(
  checks: readonly HelixAskSubmittedAttachmentCheck[],
): HelixAskSubmittedAttachmentCheck | null {
  return checks.find((entry) => !entry.check?.can_submit) ?? null;
}

export function buildHelixAskSubmitRunOptionsPayload(args: {
  submittedAttachments: readonly HelixAskAttachment[];
  promotedPastedTextTurnInputItems?: readonly HelixTurnInputItem[] | null;
  expectsVisualInput: boolean;
  submittedVisualEvidence?: Record<string, unknown> | null;
  submittedVisualCapability?: Record<string, unknown> | null;
}): HelixAskSubmitRunOptionsPayload | undefined {
  if (args.submittedAttachments.length > 0) {
    return {
      attachments: [...args.submittedAttachments],
      ...(args.promotedPastedTextTurnInputItems && args.promotedPastedTextTurnInputItems.length > 0
        ? { turnInputItems: [...args.promotedPastedTextTurnInputItems] }
        : {}),
    };
  }
  if (
    args.expectsVisualInput &&
    args.submittedVisualEvidence &&
    !isDiagnosticVisualEvidence(args.submittedVisualEvidence)
  ) {
    return { visualEvidence: args.submittedVisualEvidence };
  }
  if (args.submittedVisualCapability) {
    return { visualCapability: args.submittedVisualCapability };
  }
  return undefined;
}

export function buildHelixAskVisualEvidenceTurnInputContext(
  visualEvidence: unknown,
): HelixAskVisualEvidenceTurnInputContext {
  const visualEvidenceRecord =
    visualEvidence && typeof visualEvidence === "object" && !Array.isArray(visualEvidence)
      ? visualEvidence as Record<string, unknown>
      : null;
  const evidenceRecord =
    visualEvidenceRecord?.evidence && typeof visualEvidenceRecord.evidence === "object" && !Array.isArray(visualEvidenceRecord.evidence)
      ? visualEvidenceRecord.evidence as Record<string, unknown>
      : null;
  return {
    visualEvidence: visualEvidenceRecord,
    evidenceRecord,
    evidenceId: readAttachmentPayloadText(evidenceRecord?.evidence_id),
    frameId: readAttachmentPayloadText(evidenceRecord?.frame_id),
    summary: readAttachmentPayloadText(evidenceRecord?.summary),
    mimeType: readAttachmentPayloadText(evidenceRecord?.mime_type) ?? "image/png",
  };
}

export function buildHelixAskAttachmentContextPack(
  attachments: readonly HelixAskAttachment[],
): HelixAskAttachmentContextPack | null {
  if (attachments.length === 0) return null;
  return {
    schema: "helix.attachment_context_pack.v1",
    attachment_count: attachments.length,
    attachments: attachments.map((attachment, index) => ({
      attachment_id: attachment.id,
      ordinal: index,
      kind: attachment.kind,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      content_sha256: attachment.kind === "text" ? attachment.contentSha256 : null,
      preview: attachment.kind === "text" ? attachment.preview : null,
      evidence_ref: attachment.kind === "image" ? attachment.evidenceRef ?? null : null,
      image_ref: attachment.kind === "image" ? attachment.imageRef ?? null : null,
      raw_content_included: false,
      raw_image_included: false,
      assistant_answer: false,
    })),
    raw_content_included: false,
    raw_image_included: false,
    assistant_answer: false,
  };
}

function buildHelixAskImageAttachmentTurnInputItems(
  attachment: HelixAskImageAttachment,
): HelixTurnInputItem[] {
  const nativeImageBase64 =
    typeof attachment.imageBase64 === "string" && attachment.imageBase64.trim()
      ? attachment.imageBase64.trim()
      : null;
  const nativeImageRef =
    typeof attachment.imageRef === "string" && attachment.imageRef.trim()
      ? attachment.imageRef.trim()
      : null;
  const nativeEvidenceRef =
    typeof attachment.evidenceRef === "string" && attachment.evidenceRef.trim()
      ? attachment.evidenceRef.trim()
      : null;
  const items: HelixTurnInputItem[] = [];
  if (nativeImageBase64) {
    items.push({
      type: "image",
      image_base64: nativeImageBase64,
      mime_type: attachment.mimeType,
      file_name: attachment.fileName,
      raw_image_included: true,
      raw_image_scope: "turn_input_only",
    });
  } else if (nativeImageRef) {
    items.push({
      type: "image",
      image_ref: nativeImageRef,
      mime_type: attachment.mimeType,
      file_name: attachment.fileName,
      evidence_id: nativeEvidenceRef,
      raw_image_included: false,
    });
  }
  if (nativeEvidenceRef) {
    items.push({
      type: "evidence_ref",
      evidence_id: nativeEvidenceRef,
      evidence_kind: "visual_frame_evidence",
      compact_summary: null,
      assistant_answer: false,
      raw_content_included: false,
    });
  }
  return items;
}

export function buildHelixAskAttachmentTurnInputItems(
  attachments: readonly HelixAskAttachment[],
): HelixTurnInputItem[] {
  return attachments.flatMap((attachment) => {
    const commitCheck = validateHelixAskAttachmentForSubmit(attachment);
    if (!commitCheck?.can_submit) return [];
    if (attachment.kind === "image") {
      return buildHelixAskImageAttachmentTurnInputItems(attachment);
    }
    return [buildHelixAskTextAttachmentTurnInputItem(attachment)];
  });
}

export function buildHelixAskTurnInputItemsForSubmit(args: {
  prompt: string;
  attachmentItems?: readonly HelixTurnInputItem[] | null;
  visualEvidenceContext?: HelixAskVisualEvidenceTurnInputContext | null;
  explicitTurnInputItems?: readonly HelixTurnInputItem[] | null;
}): HelixTurnInputItem[] {
  if (args.explicitTurnInputItems && args.explicitTurnInputItems.length > 0) {
    return [...args.explicitTurnInputItems];
  }
  const visualEvidence = args.visualEvidenceContext;
  return [
    { type: "text", text: args.prompt, source: "user" },
    ...(args.attachmentItems ?? []),
    ...(visualEvidence?.evidenceId
      ? [{
          type: "evidence_ref" as const,
          evidence_id: visualEvidence.evidenceId,
          evidence_kind: "visual_frame_evidence" as const,
          compact_summary: visualEvidence.summary,
          assistant_answer: false as const,
          raw_content_included: false as const,
        }]
      : []),
    ...(visualEvidence?.frameId
      ? [{
          type: "image" as const,
          image_ref: visualEvidence.frameId,
          mime_type: visualEvidence.mimeType,
          evidence_id: visualEvidence.evidenceId,
          raw_image_included: false as const,
        }]
      : []),
  ];
}
