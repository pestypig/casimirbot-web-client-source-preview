import type { DocumentImageRegionReceiptV1 } from "@shared/contracts/document-image-region-receipt.v1";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import {
  VISUAL_SOURCE_FRAME_HISTORY_TTL_MS,
  useVisualSourceCaptureStore,
  type VisualSourceCaptureFrameHistoryItem,
} from "@/store/useVisualSourceCaptureStore";

type PostJson = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const IMAGE_LENS_CROP_ONLY_PROMPT =
  "Describe only the pixels visible inside this Image Lens crop. Do not infer, summarize, or mention objects, UI, text, or scene context outside the submitted crop region. If context appears cut off, say it is cut off. Keep the answer compact and factual.";

export type SubmitImageLensCropFrameInput = {
  postJson: PostJson;
  receipt: DocumentImageRegionReceiptV1;
  sourceId: string;
  threadId?: string;
  roomId?: string | null;
  environmentId?: string | null;
  pipelineId?: string | null;
  imageDataUrl: string;
  objective?: string;
};

export type SubmitImageLensCropFrameResult = {
  frameId: string | null;
  evidenceId: string | null;
  summary: string;
  receipt: DocumentImageRegionReceiptV1;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function submitImageLensCropFrame(input: SubmitImageLensCropFrameInput): Promise<SubmitImageLensCropFrameResult> {
  const threadId = input.threadId ?? HELIX_ASK_CONTEXT_ID.desktop;
  const now = new Date().toISOString();
  useVisualSourceCaptureStore.getState().upsertProducer({
    source_id: input.sourceId,
    thread_id: threadId,
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    stream_active: true,
    interval_active: false,
    track_ready_state: "live",
    capture_mode: "manual",
    cadence_ms: null,
    last_heartbeat_at: now,
    last_error: null,
  });

  const analysis = await input.postJson("/api/agi/situation/visual-frame/analyze", {
    thread_id: threadId,
    room_id: input.roomId ?? null,
    source_id: input.sourceId,
    environment_id: input.environmentId ?? null,
    capture_mode: "manual",
    image_data_url: input.imageDataUrl,
    mime_type: input.imageDataUrl.slice(0, 32).includes("image/png") ? "image/png" : "image/jpeg",
    prompt: IMAGE_LENS_CROP_ONLY_PROMPT,
    objective: input.objective ?? "Image Lens crop frame for Live Answer visual-source analysis.",
    related_event_refs: [input.receipt.crop.regionId],
    source_surface: "image_lens_crop",
    crop_only: true,
    crop_region_id: input.receipt.crop.regionId,
    crop_bbox_px: input.receipt.crop.bboxPx,
  });

  const evidence = readRecord(analysis.evidence);
  const frameId = readString(evidence?.frame_id);
  const evidenceId = readString(evidence?.evidence_id);
  const chunk = readRecord(analysis.live_source_chunk);
  const chunkId = readString(chunk?.chunk_id);
  const summary =
    readString(evidence?.summary) ??
    "Image Lens crop frame submitted to Live Answer visual source.";
  const frameAt = new Date().toISOString();
  const frameHistoryNowMs = Date.parse(frameAt);
  const frameHistoryItem: VisualSourceCaptureFrameHistoryItem = {
    history_id: `${frameId ?? "image-lens"}:${input.receipt.crop.imageHash}:${frameHistoryNowMs}`,
    source_id: input.sourceId,
    frame_id: frameId,
    evidence_id: evidenceId,
    captured_at: frameAt,
    preview_data_url: input.imageDataUrl,
    preview_hash: input.receipt.crop.imageHash,
    source_surface: "image_lens",
    source_kind: "image_lens_crop",
    crop_only: true,
    crop_bbox_px: input.receipt.crop.bboxPx,
    crop_region_id: input.receipt.crop.regionId,
    summary,
    visual_observer_profile_id: readString(evidence?.visual_observer_profile_id),
    visual_observer_profile_title: readString(evidence?.visual_observer_profile_title),
    visual_prompt_hash: readString(evidence?.visual_prompt_hash),
    expires_at: new Date(frameHistoryNowMs + VISUAL_SOURCE_FRAME_HISTORY_TTL_MS).toISOString(),
  };
  const analyzedReceipt: DocumentImageRegionReceiptV1 = {
    ...input.receipt,
    visualSource: {
      ...input.receipt.visualSource,
      sourceId: input.sourceId,
      frameId: frameId ?? input.receipt.visualSource.frameId,
    },
    classification: {
      ...input.receipt.classification,
      summary,
    },
  };
  useVisualSourceCaptureStore.getState().appendFrameHistory(input.sourceId, frameHistoryItem, {
    last_chunk_id: chunkId,
    pending_analysis_job_id: Array.isArray(analysis.live_source_analysis_jobs)
      ? readString(readRecord(analysis.live_source_analysis_jobs.at(-1))?.job_id)
      : null,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("helix:image-lens:visual-frame-sent", {
      detail: {
        sourceId: input.sourceId,
        frameId,
        evidenceId,
      },
    }));
  }
  emitHelixAskLiveEvent({
    contextId: threadId,
    entry: {
      id: `image-lens-region:${input.receipt.crop.regionId}`,
      ts: frameAt,
      text: `Image Lens sent a crop frame ${input.receipt.crop.regionId} to Live Answer visual evidence; observation only, not answer authority.`,
      tool: "image-lens.visual_frame",
      meta: {
        artifact_kind: "helix.visual_frame_evidence",
        assistant_answer: false,
        terminal_eligible: false,
        receipt: analyzedReceipt,
        source_id: input.sourceId,
        frame_id: frameId,
        evidence_id: evidenceId,
      },
    },
  });

  return {
    frameId,
    evidenceId,
    summary,
    receipt: analyzedReceipt,
  };
}
