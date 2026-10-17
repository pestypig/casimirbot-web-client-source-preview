import { describe, expect, it } from "vitest";

import {
  buildHelixAskAttachmentContextPack,
  buildHelixAskSubmittedAttachmentChecks,
  buildHelixAskAttachmentTurnInputItems,
  buildHelixAskSubmitRunOptionsPayload,
  buildHelixAskTurnInputItemsForSubmit,
  buildHelixAskVisualEvidenceTurnInputContext,
  resolveHelixAskSubmittedAttachments,
  selectFirstInvalidHelixAskSubmittedAttachment,
  selectFirstHelixAskSubmitReadyImageAttachment,
  selectHelixAskNativeImageAttachments,
} from "@/components/helix/ask-console/HelixAskAttachmentPayload";
import type { HelixAskAttachment } from "@/components/helix/ask-console/HelixAskAttachmentCommit";

const textAttachment: HelixAskAttachment = {
  kind: "text",
  id: "attachment-text-1",
  fileName: "pasted-text.txt",
  mimeType: "text/plain",
  sizeBytes: 12,
  contentBase64: "cGF5bG9hZA==",
  contentSha256: "sha-text",
  preview: "payload",
  status: "ready",
  error: null,
};

const imageAttachment: HelixAskAttachment = {
  kind: "image",
  id: "attachment-image-1",
  fileName: "frame.png",
  mimeType: "image/png",
  sizeBytes: 42,
  imageBase64: " aW1hZ2U= ",
  imageRef: "image-ref-1",
  evidenceRef: "evidence-frame-1",
  previewUrl: "blob:frame",
  status: "ready",
  error: null,
};

describe("Helix Ask attachment payload shaping", () => {
  it("resolves submitted attachments and submit-ready image attachments deterministically", () => {
    const fallbackImage = {
      ...imageAttachment,
      id: "attachment-image-fallback",
    };
    const staleImage: HelixAskAttachment = {
      ...imageAttachment,
      id: "attachment-image-stale",
      imageBase64: "",
      imageRef: null,
      evidenceRef: null,
    };

    expect(resolveHelixAskSubmittedAttachments({
      attachments: [textAttachment, imageAttachment],
      imageAttachment: fallbackImage,
    })).toEqual([textAttachment, imageAttachment]);
    expect(resolveHelixAskSubmittedAttachments({
      attachments: [],
      imageAttachment: fallbackImage,
    })).toEqual([fallbackImage]);
    expect(resolveHelixAskSubmittedAttachments({
      attachments: null,
      imageAttachment: null,
    })).toEqual([]);

    expect(selectHelixAskNativeImageAttachments([textAttachment, staleImage, imageAttachment])).toEqual([
      staleImage,
      imageAttachment,
    ]);
    expect(selectFirstHelixAskSubmitReadyImageAttachment([textAttachment, staleImage, imageAttachment])).toBe(
      imageAttachment,
    );
    expect(selectFirstHelixAskSubmitReadyImageAttachment([textAttachment, staleImage])).toBeNull();
  });

  it("builds submitted attachment checks and selects the first invalid entry", () => {
    const invalidText: HelixAskAttachment = {
      ...textAttachment,
      id: "attachment-text-invalid",
      contentBase64: "",
      status: "ready",
    };
    const checks = buildHelixAskSubmittedAttachmentChecks([textAttachment, invalidText, imageAttachment]);

    expect(checks.map((entry) => ({
      id: entry.attachment.id,
      canSubmit: entry.check?.can_submit,
      reason: entry.check?.reason ?? null,
    }))).toEqual([
      { id: "attachment-text-1", canSubmit: true, reason: null },
      {
        id: "attachment-text-invalid",
        canSubmit: false,
        reason: "Text attachment is stale. Reattach or paste it again before sending.",
      },
      { id: "attachment-image-1", canSubmit: true, reason: null },
    ]);
    expect(selectFirstInvalidHelixAskSubmittedAttachment(checks)?.attachment.id).toBe("attachment-text-invalid");
    expect(selectFirstInvalidHelixAskSubmittedAttachment(buildHelixAskSubmittedAttachmentChecks([
      textAttachment,
      imageAttachment,
    ]))).toBeNull();
  });

  it("builds submit run options without moving submission side effects into the helper", () => {
    const promotedItems = [{ type: "text" as const, text: "Use the attached pasted text.", source: "user" as const }];
    const visualEvidence = {
      evidence: {
        evidence_id: "visual-evidence-1",
        summary: "visible panel",
      },
    };
    const diagnosticEvidence = {
      evidence: {
        summary: "Vision provider unavailable.",
      },
    };
    const visualCapability = {
      schema: "helix.visual_context_capability.v1",
      status: "error",
    };

    expect(buildHelixAskSubmitRunOptionsPayload({
      submittedAttachments: [textAttachment],
      promotedPastedTextTurnInputItems: promotedItems,
      expectsVisualInput: true,
      submittedVisualEvidence: visualEvidence,
      submittedVisualCapability: visualCapability,
    })).toEqual({
      attachments: [textAttachment],
      turnInputItems: promotedItems,
    });
    expect(buildHelixAskSubmitRunOptionsPayload({
      submittedAttachments: [],
      promotedPastedTextTurnInputItems: null,
      expectsVisualInput: true,
      submittedVisualEvidence: visualEvidence,
      submittedVisualCapability: visualCapability,
    })).toEqual({
      visualEvidence,
    });
    expect(buildHelixAskSubmitRunOptionsPayload({
      submittedAttachments: [],
      expectsVisualInput: true,
      submittedVisualEvidence: diagnosticEvidence,
      submittedVisualCapability: visualCapability,
    })).toEqual({
      visualCapability,
    });
    expect(buildHelixAskSubmitRunOptionsPayload({
      submittedAttachments: [],
      expectsVisualInput: false,
      submittedVisualEvidence: visualEvidence,
      submittedVisualCapability: null,
    })).toBeUndefined();
  });

  it("builds an attachment context pack without making attachments answer authority", () => {
    expect(buildHelixAskAttachmentContextPack([textAttachment, imageAttachment])).toEqual({
      schema: "helix.attachment_context_pack.v1",
      attachment_count: 2,
      attachments: [
        {
          attachment_id: "attachment-text-1",
          ordinal: 0,
          kind: "text",
          file_name: "pasted-text.txt",
          mime_type: "text/plain",
          size_bytes: 12,
          content_sha256: "sha-text",
          preview: "payload",
          evidence_ref: null,
          image_ref: null,
          raw_content_included: false,
          raw_image_included: false,
          assistant_answer: false,
        },
        {
          attachment_id: "attachment-image-1",
          ordinal: 1,
          kind: "image",
          file_name: "frame.png",
          mime_type: "image/png",
          size_bytes: 42,
          content_sha256: null,
          preview: null,
          evidence_ref: "evidence-frame-1",
          image_ref: "image-ref-1",
          raw_content_included: false,
          raw_image_included: false,
          assistant_answer: false,
        },
      ],
      raw_content_included: false,
      raw_image_included: false,
      assistant_answer: false,
    });
    expect(buildHelixAskAttachmentContextPack([])).toBeNull();
  });

  it("builds turn input items only for submit-ready attachments", () => {
    const staleImage: HelixAskAttachment = {
      kind: "image",
      id: "attachment-image-stale",
      fileName: "stale.png",
      mimeType: "image/png",
      sizeBytes: 42,
      imageBase64: "",
      imageRef: null,
      evidenceRef: null,
      previewUrl: "blob:stale",
      status: "ready",
      error: null,
    };

    expect(buildHelixAskAttachmentTurnInputItems([textAttachment, imageAttachment, staleImage])).toEqual([
      {
        type: "attachment",
        attachment_id: "attachment-text-1",
        attachment_kind: "text",
        mime_type: "text/plain",
        file_name: "pasted-text.txt",
        size_bytes: 12,
        content_base64: "cGF5bG9hZA==",
        content_sha256: "sha-text",
        preview: "payload",
        raw_content_included: false,
        raw_content_scope: "turn_input_only",
        assistant_answer: false,
      },
      {
        type: "image",
        image_base64: "aW1hZ2U=",
        mime_type: "image/png",
        file_name: "frame.png",
        raw_image_included: true,
        raw_image_scope: "turn_input_only",
      },
      {
        type: "evidence_ref",
        evidence_id: "evidence-frame-1",
        evidence_kind: "visual_frame_evidence",
        compact_summary: null,
        assistant_answer: false,
        raw_content_included: false,
      },
    ]);
  });

  it("assembles inferred turn input items with visual evidence refs", () => {
    const visualEvidenceContext = buildHelixAskVisualEvidenceTurnInputContext({
      evidence: {
        evidence_id: " evidence-frame-1 ",
        frame_id: " frame-1 ",
        summary: " visible calculator panel ",
        mime_type: " image/webp ",
      },
    });

    expect(buildHelixAskTurnInputItemsForSubmit({
      prompt: "Describe this image",
      attachmentItems: [],
      visualEvidenceContext,
    })).toEqual([
      { type: "text", text: "Describe this image", source: "user" },
      {
        type: "evidence_ref",
        evidence_id: "evidence-frame-1",
        evidence_kind: "visual_frame_evidence",
        compact_summary: "visible calculator panel",
        assistant_answer: false,
        raw_content_included: false,
      },
      {
        type: "image",
        image_ref: "frame-1",
        mime_type: "image/webp",
        evidence_id: "evidence-frame-1",
        raw_image_included: false,
      },
    ]);
  });

  it("preserves explicit turn input items over inferred items", () => {
    expect(buildHelixAskTurnInputItemsForSubmit({
      prompt: "ignored prompt",
      attachmentItems: [buildHelixAskAttachmentTurnInputItems([textAttachment])[0]],
      visualEvidenceContext: buildHelixAskVisualEvidenceTurnInputContext({
        evidence: {
          evidence_id: "evidence-frame-1",
        },
      }),
      explicitTurnInputItems: [{ type: "text", text: "explicit", source: "user" }],
    })).toEqual([{ type: "text", text: "explicit", source: "user" }]);
  });
});
