import type { HelixTurnInputItem } from "@shared/helix-turn-input-item";

export type HelixAskTextAttachment = {
  kind: "text";
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64: string;
  contentSha256: string;
  preview: string;
  status: "ready" | "error";
  error?: string | null;
};

export type HelixAskTextAttachmentMaterializationDeps = {
  now?: () => Date;
  randomUUID?: () => string;
  digestSha256Hex?: (value: string) => Promise<string>;
};

export const HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES = 1024 * 1024;
export const HELIX_ASK_TEXT_ATTACHMENT_MAX_LABEL = "1 MB";
export const HELIX_ASK_TEXT_ATTACHMENT_TOO_LARGE_MESSAGE =
  `Pasted text attachments are limited to ${HELIX_ASK_TEXT_ATTACHMENT_MAX_LABEL} for this Helix Ask path.`;
export const HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS = 1200;

export function getHelixAskTextAttachmentSizeBytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function getHelixAskTextAttachmentTooLargeReason(sizeBytes: number): string | null {
  return sizeBytes > HELIX_ASK_TEXT_ATTACHMENT_MAX_BYTES ? HELIX_ASK_TEXT_ATTACHMENT_TOO_LARGE_MESSAGE : null;
}

export function base64FromText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export async function sha256TextHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildHelixAskTextAttachmentFromText(
  text: string,
  deps: HelixAskTextAttachmentMaterializationDeps = {},
): Promise<HelixAskTextAttachment> {
  const sizeBytes = getHelixAskTextAttachmentSizeBytes(text);
  const now = deps.now?.() ?? new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const digestSha256Hex = deps.digestSha256Hex ?? sha256TextHex;
  return {
    kind: "text",
    id: randomUUID(),
    fileName: `pasted-text-${stamp}.txt`,
    mimeType: "text/plain",
    sizeBytes,
    contentBase64: base64FromText(text),
    contentSha256: await digestSha256Hex(text),
    preview: text.trim().slice(0, HELIX_ASK_TEXT_ATTACHMENT_PREVIEW_CHARS),
    status: "ready",
    error: null,
  };
}

export function buildHelixAskTextAttachmentTurnInputItem(attachment: HelixAskTextAttachment): HelixTurnInputItem {
  return {
    type: "attachment",
    attachment_id: attachment.id,
    attachment_kind: "text",
    mime_type: attachment.mimeType,
    file_name: attachment.fileName,
    size_bytes: attachment.sizeBytes,
    content_base64: attachment.contentBase64,
    content_sha256: attachment.contentSha256,
    preview: attachment.preview,
    raw_content_included: false,
    raw_content_scope: "turn_input_only",
    assistant_answer: false,
  };
}
