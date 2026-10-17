import type { HelixAttachmentCommitCheck } from "@shared/helix-attachment-commit";

import {
  HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES,
  type HelixAskTextAttachment,
} from "./HelixAskTextAttachment";

export type HelixAskImageAttachment = {
  kind: "image";
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  imageBase64?: string | null;
  imageRef?: string | null;
  evidenceRef?: string | null;
  previewUrl: string;
  status: "ready" | "error";
  error?: string | null;
};

export type HelixAskAttachment = HelixAskImageAttachment | HelixAskTextAttachment;

export type HelixAskAttachmentCommitCheckEntry = {
  attachment: HelixAskAttachment;
  check: HelixAttachmentCommitCheck | null;
};

export function validateHelixAskImageAttachmentForSubmit(
  attachment: HelixAskImageAttachment | null | undefined,
): HelixAttachmentCommitCheck | null {
  if (!attachment) return null;
  const hasImageBase64 = typeof attachment.imageBase64 === "string" && attachment.imageBase64.trim().length > 0;
  const hasImageRef = typeof attachment.imageRef === "string" && attachment.imageRef.trim().length > 0;
  const hasEvidenceRef = typeof attachment.evidenceRef === "string" && attachment.evidenceRef.trim().length > 0;
  const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : "";
  const unsupportedType = mimeType.length > 0 && !mimeType.startsWith("image/");
  const tooLarge = typeof attachment.sizeBytes === "number" && attachment.sizeBytes > 8 * 1024 * 1024;
  const hasPayload = hasImageBase64 || hasImageRef || hasEvidenceRef;
  const status: HelixAttachmentCommitCheck["status"] =
    attachment.status === "error"
      ? "missing_payload"
      : unsupportedType
        ? "unsupported_type"
        : tooLarge
          ? "too_large"
          : hasPayload
            ? "ready"
            : "stale_after_restart";
  const canSubmit = status === "ready";
  return {
    schema: "helix.attachment_commit_check.v1",
    attachment_id: attachment.id,
    file_name: attachment.fileName,
    mime_type: attachment.mimeType,
    status,
    can_submit: canSubmit,
    turn_input_item_preview: hasPayload
      ? {
          type: hasEvidenceRef && !hasImageBase64 && !hasImageRef ? "evidence_ref" : "image",
          has_image_base64: hasImageBase64,
          has_image_ref: hasImageRef,
          has_evidence_ref: hasEvidenceRef,
          raw_image_scope: hasImageBase64 ? "turn_input_only" : null,
        }
      : null,
    reason: canSubmit
      ? null
      : status === "stale_after_restart"
        ? "Image attachment is stale. Reattach the image before sending."
        : attachment.error ?? "Image attachment is not ready to submit.",
    assistant_answer: false,
    raw_content_included: false,
  };
}

export function validateHelixAskTextAttachmentForSubmit(
  attachment: HelixAskTextAttachment | null | undefined,
): HelixAttachmentCommitCheck | null {
  if (!attachment) return null;
  const hasPayload = typeof attachment.contentBase64 === "string" && attachment.contentBase64.trim().length > 0;
  const tooLarge = typeof attachment.sizeBytes === "number" && attachment.sizeBytes > HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES;
  const status: HelixAttachmentCommitCheck["status"] =
    attachment.status === "error"
      ? "missing_payload"
      : tooLarge
        ? "too_large"
        : hasPayload
          ? "ready"
          : "stale_after_restart";
  const canSubmit = status === "ready";
  return {
    schema: "helix.attachment_commit_check.v1",
    attachment_id: attachment.id,
    file_name: attachment.fileName,
    mime_type: attachment.mimeType,
    status,
    can_submit: canSubmit,
    turn_input_item_preview: hasPayload
      ? {
          type: "evidence_ref",
          has_image_base64: false,
          has_image_ref: false,
          has_evidence_ref: false,
          raw_image_scope: null,
        }
      : null,
    reason: canSubmit
      ? null
      : status === "stale_after_restart"
        ? "Text attachment is stale. Reattach or paste it again before sending."
        : attachment.error ?? "Text attachment is not ready to submit.",
    assistant_answer: false,
    raw_content_included: false,
  };
}

export function validateHelixAskAttachmentForSubmit(
  attachment: HelixAskAttachment | null | undefined,
): HelixAttachmentCommitCheck | null {
  if (!attachment) return null;
  return attachment.kind === "image"
    ? validateHelixAskImageAttachmentForSubmit(attachment)
    : validateHelixAskTextAttachmentForSubmit(attachment);
}

export function buildHelixAskAttachmentCommitChecks(
  attachments: readonly HelixAskAttachment[],
): HelixAskAttachmentCommitCheckEntry[] {
  return attachments.map((attachment) => ({
    attachment,
    check: validateHelixAskAttachmentForSubmit(attachment),
  }));
}

export function hasReadyHelixAskAttachmentCommitCheck(
  checks: readonly HelixAskAttachmentCommitCheckEntry[],
): boolean {
  return checks.some((entry) => entry.check?.can_submit);
}
