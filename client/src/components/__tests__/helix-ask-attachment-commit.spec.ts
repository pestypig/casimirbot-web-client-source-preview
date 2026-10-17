import { describe, expect, it } from "vitest";

import {
  buildHelixAskAttachmentCommitChecks,
  hasReadyHelixAskAttachmentCommitCheck,
  validateHelixAskAttachmentForSubmit,
  validateHelixAskImageAttachmentForSubmit,
  validateHelixAskTextAttachmentForSubmit,
  type HelixAskImageAttachment,
} from "../helix/ask-console/HelixAskAttachmentCommit";
import {
  HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES,
  type HelixAskTextAttachment,
} from "../helix/ask-console/HelixAskTextAttachment";

const imageAttachment = (overrides: Partial<HelixAskImageAttachment> = {}): HelixAskImageAttachment => ({
  kind: "image",
  id: "img-1",
  fileName: "frame.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  imageBase64: "abc123",
  imageRef: null,
  evidenceRef: null,
  previewUrl: "blob:frame",
  status: "ready",
  error: null,
  ...overrides,
});

const textAttachment = (overrides: Partial<HelixAskTextAttachment> = {}): HelixAskTextAttachment => ({
  kind: "text",
  id: "txt-1",
  fileName: "pasted-text.txt",
  mimeType: "text/plain",
  sizeBytes: 32,
  contentBase64: "SGVsaXg=",
  contentSha256: "hash",
  preview: "Helix",
  status: "ready",
  error: null,
  ...overrides,
});

describe("Helix Ask attachment commit checks", () => {
  it("accepts ready image attachments with raw turn-input payload previews", () => {
    expect(validateHelixAskImageAttachmentForSubmit(imageAttachment())).toMatchObject({
      schema: "helix.attachment_commit_check.v1",
      attachment_id: "img-1",
      file_name: "frame.png",
      mime_type: "image/png",
      status: "ready",
      can_submit: true,
      reason: null,
      assistant_answer: false,
      raw_content_included: false,
      turn_input_item_preview: {
        type: "image",
        has_image_base64: true,
        has_image_ref: false,
        has_evidence_ref: false,
        raw_image_scope: "turn_input_only",
      },
    });
  });

  it("accepts evidence-only image attachments without raw-image scope", () => {
    expect(
      validateHelixAskImageAttachmentForSubmit(
        imageAttachment({
          imageBase64: null,
          imageRef: null,
          evidenceRef: "evidence://frame",
        }),
      ),
    ).toMatchObject({
      status: "ready",
      can_submit: true,
      turn_input_item_preview: {
        type: "evidence_ref",
        has_image_base64: false,
        has_image_ref: false,
        has_evidence_ref: true,
        raw_image_scope: null,
      },
    });
  });

  it("rejects stale, unsupported, too-large, and errored image attachments deterministically", () => {
    expect(validateHelixAskImageAttachmentForSubmit(imageAttachment({ imageBase64: " ", imageRef: null }))).toMatchObject({
      status: "stale_after_restart",
      can_submit: false,
      reason: "Image attachment is stale. Reattach the image before sending.",
      turn_input_item_preview: null,
    });
    expect(validateHelixAskImageAttachmentForSubmit(imageAttachment({ mimeType: "application/pdf" }))).toMatchObject({
      status: "unsupported_type",
      can_submit: false,
      reason: "Image attachment is not ready to submit.",
    });
    expect(validateHelixAskImageAttachmentForSubmit(imageAttachment({ sizeBytes: 8 * 1024 * 1024 + 1 }))).toMatchObject({
      status: "too_large",
      can_submit: false,
      reason: "Image attachment is not ready to submit.",
    });
    expect(validateHelixAskImageAttachmentForSubmit(imageAttachment({ status: "error", error: "decode failed" }))).toMatchObject({
      status: "missing_payload",
      can_submit: false,
      reason: "decode failed",
    });
  });

  it("validates text attachment commit checks without exposing raw content", () => {
    expect(validateHelixAskTextAttachmentForSubmit(textAttachment())).toMatchObject({
      schema: "helix.attachment_commit_check.v1",
      attachment_id: "txt-1",
      file_name: "pasted-text.txt",
      mime_type: "text/plain",
      status: "ready",
      can_submit: true,
      reason: null,
      assistant_answer: false,
      raw_content_included: false,
      turn_input_item_preview: {
        type: "evidence_ref",
        has_image_base64: false,
        has_image_ref: false,
        has_evidence_ref: false,
        raw_image_scope: null,
      },
    });
  });

  it("rejects stale, too-large, and errored text attachments deterministically", () => {
    expect(validateHelixAskTextAttachmentForSubmit(textAttachment({ contentBase64: " " }))).toMatchObject({
      status: "stale_after_restart",
      can_submit: false,
      reason: "Text attachment is stale. Reattach or paste it again before sending.",
      turn_input_item_preview: null,
    });
    expect(
      validateHelixAskTextAttachmentForSubmit(
        textAttachment({ sizeBytes: HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES + 1 }),
      ),
    ).toMatchObject({
      status: "too_large",
      can_submit: false,
      reason: "Text attachment is not ready to submit.",
    });
    expect(validateHelixAskTextAttachmentForSubmit(textAttachment({ status: "error", error: "hash failed" }))).toMatchObject({
      status: "missing_payload",
      can_submit: false,
      reason: "hash failed",
    });
  });

  it("dispatches attachment union validation by kind and ignores missing attachments", () => {
    expect(validateHelixAskAttachmentForSubmit(null)).toBeNull();
    expect(validateHelixAskAttachmentForSubmit(imageAttachment())?.attachment_id).toBe("img-1");
    expect(validateHelixAskAttachmentForSubmit(textAttachment())?.attachment_id).toBe("txt-1");
  });

  it("builds composer commit-check entries and ready-state from the commit owner", () => {
    const checks = buildHelixAskAttachmentCommitChecks([
      imageAttachment(),
      textAttachment({ id: "txt-stale", contentBase64: "" }),
    ]);

    expect(
      checks.map((entry) => ({
        id: entry.attachment.id,
        canSubmit: entry.check?.can_submit,
        status: entry.check?.status,
      })),
    ).toEqual([
      { id: "img-1", canSubmit: true, status: "ready" },
      { id: "txt-stale", canSubmit: false, status: "stale_after_restart" },
    ]);
    expect(hasReadyHelixAskAttachmentCommitCheck(checks)).toBe(true);
    expect(
      hasReadyHelixAskAttachmentCommitCheck(
        buildHelixAskAttachmentCommitChecks([textAttachment({ contentBase64: "" })]),
      ),
    ).toBe(false);
  });
});
