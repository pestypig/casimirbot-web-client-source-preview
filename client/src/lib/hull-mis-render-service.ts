import { apiRequest } from "@/lib/queryClient";
import type {
  HullMisRenderAttachmentV1,
  HullMisRenderRequestV1,
  HullMisRenderResponseV1,
} from "@shared/hull-render-contract";

export const HULL_MIS_RENDER_FRAME_ENDPOINT = "/api/helix/hull-render/frame";
export const HULL_MIS_RENDER_STATUS_ENDPOINT = "/api/helix/hull-render/status";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isValidAttachment = (value: unknown): value is HullMisRenderAttachmentV1 => {
  if (!isRecord(value)) return false;
  if (
    value.kind !== "depth-linear-m-f32le" &&
    value.kind !== "shell-mask-u8"
  ) {
    return false;
  }
  if (value.encoding !== "base64") return false;
  if (typeof value.dataBase64 !== "string" || value.dataBase64.length === 0) return false;
  if (typeof value.width !== "number" || typeof value.height !== "number") return false;
  return true;
};

const isValidMisResponse = (value: unknown): value is HullMisRenderResponseV1 => {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.imageDataUrl !== "string" || !value.imageDataUrl.length) return false;
  if (value.imageMime !== "image/png") return false;
  if (typeof value.width !== "number" || typeof value.height !== "number") return false;
  if (value.attachments != null) {
    if (!Array.isArray(value.attachments)) return false;
    if (!value.attachments.every((attachment) => isValidAttachment(attachment))) {
      return false;
    }
  }
  return true;
};

export async function requestHullMisFrame(
  payload: HullMisRenderRequestV1,
  signal?: AbortSignal,
): Promise<HullMisRenderResponseV1> {
  const response = await apiRequest(
    "POST",
    HULL_MIS_RENDER_FRAME_ENDPOINT,
    payload,
    signal,
  );
  const json = (await response.json()) as unknown;
  if (!isValidMisResponse(json)) {
    throw new Error("Invalid MIS render response");
  }
  return json;
}
