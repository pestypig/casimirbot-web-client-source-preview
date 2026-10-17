import { describe, expect, it } from "vitest";

import {
  HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES,
  buildHelixAskImageAttachmentFromDataUrl,
  buildHelixAskImageAttachmentFromFile,
  selectHelixAskClipboardImageFiles,
} from "@/components/helix/ask-console/HelixAskImageAttachment";

function fileLike(args: Partial<File> & Pick<File, "type" | "size">): File {
  return {
    name: "",
    ...args,
  } as File;
}

describe("Helix Ask image attachment materialization", () => {
  it("selects image files from clipboard items before file fallback", () => {
    const pastedImage = fileLike({ name: "clipboard.png", type: "image/png", size: 12 });
    const fallbackImage = fileLike({ name: "fallback.png", type: "image/png", size: 24 });
    const textFile = fileLike({ name: "note.txt", type: "text/plain", size: 5 });

    expect(
      selectHelixAskClipboardImageFiles({
        items: [
          { kind: "file", type: "text/plain", getAsFile: () => textFile },
          { kind: "file", type: "image/png", getAsFile: () => pastedImage },
        ],
        files: [fallbackImage],
      }),
    ).toEqual([pastedImage]);
  });

  it("falls back to clipboard files when item files are unavailable", () => {
    const image = fileLike({ name: "clipboard.jpg", type: "image/jpeg", size: 12 });
    const text = fileLike({ name: "clipboard.txt", type: "text/plain", size: 12 });

    expect(selectHelixAskClipboardImageFiles({ files: [text, image] })).toEqual([image]);
  });

  it("builds ready image attachment metadata without answer authority", async () => {
    const file = fileLike({ name: "", type: "image/png", size: 123 });

    await expect(
      buildHelixAskImageAttachmentFromFile(file, {
        now: () => new Date("2026-07-05T10:20:30.456Z"),
        randomUUID: () => "image-attachment-1",
        readBase64FromFile: async () => "base64-image",
        createObjectUrl: () => "blob:preview",
      }),
    ).resolves.toEqual({
      kind: "image",
      id: "image-attachment-1",
      fileName: "pasted-image-2026-07-05T10-20-30-456Z.png",
      mimeType: "image/png",
      sizeBytes: 123,
      imageBase64: "base64-image",
      previewUrl: "blob:preview",
      status: "ready",
      error: null,
    });
  });

  it("rejects unsupported and oversized clipboard files before materializing payloads", async () => {
    await expect(
      buildHelixAskImageAttachmentFromFile(fileLike({ name: "note.txt", type: "text/plain", size: 10 })),
    ).rejects.toThrow("Please attach image files for this upload path.");

    await expect(
      buildHelixAskImageAttachmentFromFile(
        fileLike({ name: "large.png", type: "image/png", size: HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES + 1 }),
      ),
    ).rejects.toThrow("Image attachments are limited to 8 MB for this Helix Ask path.");
  });

  it("materializes a selected carousel data URL as turn-input-only image evidence", () => {
    expect(buildHelixAskImageAttachmentFromDataUrl("data:image/jpeg;base64,AQID", {
      fileName: "selected-frame.jpg",
      evidenceRef: "visual-evidence:1",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      randomUUID: () => "selected-frame-attachment",
    })).toEqual({
      kind: "image",
      id: "selected-frame-attachment",
      fileName: "selected-frame.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 3,
      imageBase64: "AQID",
      imageRef: null,
      evidenceRef: "visual-evidence:1",
      previewUrl: "data:image/jpeg;base64,AQID",
      status: "ready",
      error: null,
    });
  });
});
