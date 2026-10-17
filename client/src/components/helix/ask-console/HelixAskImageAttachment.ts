import { base64FromFile } from "@/utils/files";

import type { HelixAskImageAttachment } from "./HelixAskAttachmentCommit";

export type HelixAskClipboardDataTransferLike = {
  items?: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">> | null;
  files?: ArrayLike<File> | null;
};

export type HelixAskImageAttachmentMaterializationDeps = {
  now?: () => Date;
  randomUUID?: () => string;
  readBase64FromFile?: (file: File) => Promise<string>;
  createObjectUrl?: (file: File) => string;
};

export const HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

const estimateBase64Bytes = (base64: string): number => {
  const normalized = base64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
};

export function buildHelixAskImageAttachmentFromDataUrl(
  imageDataUrl: string,
  input: {
    fileName?: string | null;
    evidenceRef?: string | null;
    now?: () => Date;
    randomUUID?: () => string;
  } = {},
): HelixAskImageAttachment {
  const match = IMAGE_DATA_URL_PATTERN.exec(imageDataUrl.trim());
  if (!match) throw new Error("Selected visual frame is not a supported inline image.");
  const mimeType = match[1].toLowerCase();
  const imageBase64 = match[2].replace(/\s/g, "");
  const sizeBytes = estimateBase64Bytes(imageBase64);
  if (sizeBytes > HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error("Image attachments are limited to 8 MB for this Helix Ask path.");
  }
  const now = input.now?.() ?? new Date();
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const fallbackName = `visual-frame-${now.toISOString().replace(/[:.]/g, "-")}.${fallbackImageExtension(mimeType)}`;
  return {
    kind: "image",
    id: randomUUID(),
    fileName: input.fileName?.trim() || fallbackName,
    mimeType,
    sizeBytes,
    imageBase64,
    imageRef: null,
    evidenceRef: input.evidenceRef?.trim() || null,
    previewUrl: imageDataUrl,
    status: "ready",
    error: null,
  };
}

function fallbackImageExtension(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.trim().toLowerCase() ?? "";
  if (subtype === "jpeg") return "jpg";
  if (/^[a-z0-9]+$/.test(subtype)) return subtype;
  return "png";
}

function buildFallbackImageFileName(file: File, now: Date): string {
  const original = file.name?.trim();
  if (original) return original;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `pasted-image-${stamp}.${fallbackImageExtension(file.type || "image/png")}`;
}

export function selectHelixAskClipboardImageFiles(
  clipboardData: HelixAskClipboardDataTransferLike | null | undefined,
): File[] {
  if (!clipboardData) return [];
  const filesFromItems = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (filesFromItems.length > 0) return filesFromItems;
  return Array.from(clipboardData.files ?? []).filter((file) => file.type.startsWith("image/"));
}

export async function buildHelixAskImageAttachmentFromFile(
  file: File,
  deps: HelixAskImageAttachmentMaterializationDeps = {},
): Promise<HelixAskImageAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please attach image files for this upload path.");
  }
  if (file.size > HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error("Image attachments are limited to 8 MB for this Helix Ask path.");
  }
  const now = deps.now?.() ?? new Date();
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const readBase64FromFile = deps.readBase64FromFile ?? base64FromFile;
  const createObjectUrl = deps.createObjectUrl ?? ((value: File) => URL.createObjectURL(value));
  return {
    kind: "image",
    id: randomUUID(),
    fileName: buildFallbackImageFileName(file, now),
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    imageBase64: await readBase64FromFile(file),
    previewUrl: createObjectUrl(file),
    status: "ready",
    error: null,
  };
}

export async function buildHelixAskImageAttachmentsFromFiles(
  files: readonly File[],
  deps: HelixAskImageAttachmentMaterializationDeps = {},
): Promise<HelixAskImageAttachment[]> {
  const attachments: HelixAskImageAttachment[] = [];
  for (const file of files) {
    attachments.push(await buildHelixAskImageAttachmentFromFile(file, deps));
  }
  return attachments;
}
