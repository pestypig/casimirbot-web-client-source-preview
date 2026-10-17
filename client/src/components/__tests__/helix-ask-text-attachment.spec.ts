import { describe, expect, it } from "vitest";

import {
  HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES,
  HELIX_ASK_TEXT_ATTACHMENT_MAX_LABEL,
  HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS,
  getHelixAskTextAttachmentSizeBytes,
  getHelixAskTextAttachmentTooLargeReason,
  base64FromText,
  buildHelixAskTextAttachmentFromText,
  buildHelixAskTextAttachmentTurnInputItem,
} from "@/components/helix/ask-console/HelixAskTextAttachment";

describe("Helix Ask text attachment materialization", () => {
  it("encodes Unicode text as base64 without corrupting bytes", () => {
    expect(base64FromText("NHM2 Δ warp")).toBe("TkhNMiDOlCB3YXJw");
  });

  it("builds stable pasted-text attachment metadata with injected runtime dependencies", async () => {
    const text = `  ${"x".repeat(HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS + 10)}  `;
    const attachment = await buildHelixAskTextAttachmentFromText(text, {
      now: () => new Date("2026-07-01T10:15:30.123Z"),
      randomUUID: () => "attachment-text-1",
      digestSha256Hex: async (value) => `sha:${value.length}`,
    });

    expect(attachment).toMatchObject({
      kind: "text",
      id: "attachment-text-1",
      fileName: "pasted-text-2026-07-01T10-15-30-123Z.txt",
      mimeType: "text/plain",
      contentSha256: `sha:${text.length}`,
      status: "ready",
      error: null,
    });
    expect(attachment.sizeBytes).toBe(new TextEncoder().encode(text).byteLength);
    expect(attachment.contentBase64).toBe(base64FromText(text));
    expect(attachment.preview).toHaveLength(HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS);
    expect(attachment.preview).toBe("x".repeat(HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS));
  });

  it("accepts pasted text larger than the old 128 KB inline-paste ceiling", async () => {
    const text = "x".repeat(160 * 1024);
    const attachment = await buildHelixAskTextAttachmentFromText(text, {
      now: () => new Date("2026-07-01T10:15:30.123Z"),
      randomUUID: () => "attachment-large-text",
      digestSha256Hex: async () => "sha:large",
    });

    expect(attachment.status).toBe("ready");
    expect(attachment.sizeBytes).toBe(160 * 1024);
    expect(getHelixAskTextAttachmentTooLargeReason(attachment.sizeBytes)).toBeNull();
  });

  it("keeps an explicit upper bound for pasted-text attachment materialization", () => {
    expect(HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES).toBe(1024 * 1024);
    expect(HELIX_ASK_TEXT_ATTACHMENT_MAX_LABEL).toBe("1 MB");
    expect(getHelixAskTextAttachmentSizeBytes("abc")).toBe(3);
    expect(getHelixAskTextAttachmentTooLargeReason(HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES)).toBeNull();
    expect(getHelixAskTextAttachmentTooLargeReason(HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES + 1)).toContain("1 MB");
  });

  it("projects text attachments into turn input items without exposing assistant-answer authority", () => {
    expect(
      buildHelixAskTextAttachmentTurnInputItem({
        kind: "text",
        id: "attachment-text-1",
        fileName: "pasted-text.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
        contentBase64: "cGF5bG9hZA==",
        contentSha256: "abc123",
        preview: "payload",
        status: "ready",
        error: null,
      }),
    ).toEqual({
      type: "attachment",
      attachment_id: "attachment-text-1",
      attachment_kind: "text",
      mime_type: "text/plain",
      file_name: "pasted-text.txt",
      size_bytes: 12,
      content_base64: "cGF5bG9hZA==",
      content_sha256: "abc123",
      preview: "payload",
      raw_content_included: false,
      raw_content_scope: "turn_input_only",
      assistant_answer: false,
    });
  });
});
