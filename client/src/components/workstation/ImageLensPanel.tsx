import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileImage,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  DOCUMENT_IMAGE_REGION_KIND_VALUES,
  type DocumentImageBboxPxV1,
  type DocumentImageRegionKindV1,
  type DocumentImageSourceKindV1,
} from "@shared/contracts/document-image-region-receipt.v1";
import {
  buildDocumentImageRegionReceipt,
  clampDocumentImageBbox,
  cropImageToDataUrl,
  hashDocumentImageString,
} from "@/lib/document-image/documentImageRegions";
import { captureFrameDataUrlFromStream } from "@/lib/helix/visualFrameProducer";
import { submitImageLensCropFrame } from "@/lib/helix/imageLensVisualFrame";
import { runCapabilityLaneOneShot } from "@/lib/agi/api";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { useDocumentImageRegionStore, type DocumentImageRegionState } from "@/store/useDocumentImageRegionStore";
import { useImageLensLiveSourceStore } from "@/store/useImageLensLiveSourceStore";
import { buildScientificEvidenceWorkflowStatus } from "@/components/helix/ask-console/ScientificEvidenceWorkflowStatus";
import {
  mergeScientificEvidenceWorkflowStatus,
  mergeScientificEvidenceWorkflowStatusRecords,
  readActiveScientificEvidenceWorkflowStatus,
  useScientificEvidenceWorkflowStore,
} from "@/store/useScientificEvidenceWorkflowStore";
import RealtimeTexturePackControls from "./RealtimeTexturePackControls";

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
};

type SentFrameState = {
  sourceId: string;
  frameId: string | null;
  evidenceId: string | null;
  summary: string;
};

type Translate = InterfaceTextResolver["t"];
type DisplayMessageMap = Record<string, InterfaceMessageId>;

const sourceKindMessages = {
  image_attachment: "imageLens.sourceKind.imageAttachment",
  pdf_page_render: "imageLens.sourceKind.pdfPageRender",
  manual_image_url: "imageLens.sourceKind.manualImageUrl",
} satisfies DisplayMessageMap;

const displayMappedValue = (t: Translate, value: string, messages: DisplayMessageMap): string => {
  const messageId = messages[value];
  return messageId ? t(messageId) : value;
};

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

function openLiveAnswerPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "live-answer-environment" } }));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchJson(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return readRecord(await response.json().catch(() => null));
}

async function postJson(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = readRecord(await response.json().catch(() => null)) ?? {};
  if (!response.ok) {
    const error = readString(payload.error) ?? readString(payload.message) ?? `request_failed:${response.status}`;
    throw new Error(error);
  }
  return payload;
}

async function resolveLiveAnswerVisualSource(): Promise<{ sourceId: string; environmentId: string | null; pipelineId: string | null }> {
  const latest = await fetchJson(`/api/agi/situation/visual-frame/latest?thread_id=${encodeURIComponent(HELIX_ASK_CONTEXT_ID.desktop)}`);
  const activeSource = readRecord(latest?.active_source) ?? readRecord(latest?.source);
  const activeSourceId = readString(activeSource?.source_id);
  if (activeSourceId) {
    return {
      sourceId: activeSourceId,
      environmentId: readString(activeSource?.environment_id),
      pipelineId: readString(activeSource?.pipeline_id),
    };
  }

  const receipt = await postJson("/api/agi/situation/visual-source/start", {
    thread_id: HELIX_ASK_CONTEXT_ID.desktop,
    room_id: null,
    session_id: "image_lens_manual_upload",
    capture_mode: "manual",
    source_surface: "manual_upload",
    source_family: "visual_snapshot",
    status: "active",
    raw_image_storage_policy: "ephemeral",
  });
  const source = readRecord(receipt.source);
  const sourceId = readString(source?.source_id);
  if (!sourceId) throw new Error("visual_source_start_missing_source_id");
  return {
    sourceId,
    environmentId: readString(source?.environment_id),
    pipelineId: readString(source?.pipeline_id),
  };
}

function pointToNaturalBbox(
  image: HTMLElement,
  startClientX: number,
  startClientY: number,
  endClientX: number,
  endClientY: number,
  naturalSize: { width: number; height: number },
): DocumentImageBboxPxV1 {
  const rect = image.getBoundingClientRect();
  const scaleX = naturalSize.width / Math.max(1, rect.width);
  const scaleY = naturalSize.height / Math.max(1, rect.height);
  const left = Math.max(0, Math.min(startClientX, endClientX) - rect.left);
  const top = Math.max(0, Math.min(startClientY, endClientY) - rect.top);
  const right = Math.min(rect.width, Math.max(startClientX, endClientX) - rect.left);
  const bottom = Math.min(rect.height, Math.max(startClientY, endClientY) - rect.top);
  return clampDocumentImageBbox(
    {
      x: Math.round(left * scaleX),
      y: Math.round(top * scaleY),
      width: Math.max(1, Math.round((right - left) * scaleX)),
      height: Math.max(1, Math.round((bottom - top) * scaleY)),
    },
    naturalSize,
  );
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_lens_snapshot_load_failed"));
    image.src = dataUrl;
  });
}

export default function ImageLensPanel() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const initialStatusMessage = t("imageLens.status.initial");
  const initialStatusRef = useRef(initialStatusMessage);
  const [sourceKind, setSourceKind] = useState<DocumentImageSourceKindV1>("manual_image_url");
  const [pageDraft, setPageDraft] = useState("1");
  const [pageNavigationPending, setPageNavigationPending] = useState(false);
  const [kind, setKind] = useState<DocumentImageRegionKindV1>("unknown");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [lastSentFrame, setLastSentFrame] = useState<SentFrameState | null>(null);
  const [statusMessage, setStatusMessage] = useState(initialStatusMessage);
  const [workspaceMode, setWorkspaceMode] = useState<"inspect" | "realtime_texture_pack">("inspect");
  const source = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.source);
  const naturalSize = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.naturalSize);
  const cropDraft = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.cropDraft);
  const receipts = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.receipts);
  const liveSource = useImageLensLiveSourceStore((state) => state.liveSource);
  const patchLiveSource = useImageLensLiveSourceStore((state) => state.patchLiveSource);
  const setSourceImage = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.setSourceImage);
  const setNaturalSize = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.setNaturalSize);
  const setCropDraft = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.setCropDraft);
  const addReceipt = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.addReceipt);
  const clearReceipts = useDocumentImageRegionStore((state: DocumentImageRegionState) => state.clearReceipts);
  const rehydratePersistedSourceImage = useDocumentImageRegionStore(
    (state: DocumentImageRegionState) => state.rehydratePersistedSourceImage,
  );
  const storedScientificWorkflowStatus = useScientificEvidenceWorkflowStore((state) =>
    state.activeKey ? state.statuses[state.activeKey] ?? null : null,
  );
  const liveSourceActive = Boolean(liveSource?.streamActive && liveSource.stream);
  const hasVisualInput = Boolean(source || liveSourceActive);
  const sourceKindOptions = useMemo<Array<[DocumentImageSourceKindV1, string]>>(
    () => Object.keys(sourceKindMessages).map((value) => [
      value as DocumentImageSourceKindV1,
      displayMappedValue(t, value, sourceKindMessages),
    ]),
    [t],
  );
  const localScientificWorkflowStatus = useMemo(
    () => buildScientificEvidenceWorkflowStatus({
      source,
      cropDraft,
      lastReceipt: receipts[0] ?? null,
    }),
    [cropDraft, receipts, source],
  );
  const scientificWorkflowStatus = useMemo(() => {
    if (!storedScientificWorkflowStatus) return localScientificWorkflowStatus;
    if (
      localScientificWorkflowStatus.sourceId &&
      storedScientificWorkflowStatus.sourceId &&
      localScientificWorkflowStatus.sourceId !== storedScientificWorkflowStatus.sourceId
    ) {
      return localScientificWorkflowStatus;
    }
    return mergeScientificEvidenceWorkflowStatusRecords(localScientificWorkflowStatus, storedScientificWorkflowStatus);
  }, [localScientificWorkflowStatus, storedScientificWorkflowStatus]);

  useEffect(() => {
    if (!source) return;
    const storedStatus = readActiveScientificEvidenceWorkflowStatus();
    const statusToPersist = storedStatus
      ? mergeScientificEvidenceWorkflowStatusRecords(localScientificWorkflowStatus, storedStatus)
      : localScientificWorkflowStatus;
    mergeScientificEvidenceWorkflowStatus(statusToPersist, { askThreadId: "helix-ask:desktop" });
  }, [localScientificWorkflowStatus, source]);

  useEffect(() => {
    setStatusMessage((current) => (current === initialStatusRef.current ? initialStatusMessage : current));
    initialStatusRef.current = initialStatusMessage;
  }, [initialStatusMessage]);

  useEffect(() => {
    if (source) return;
    if (rehydratePersistedSourceImage()) {
      setStatusMessage("Recovered page evidence from last Ask turn.");
    }
  }, [rehydratePersistedSourceImage, source]);

  useEffect(() => {
    if (!source) return;
    setSourceKind(source.sourceKind);
    setPageDraft(source.pageNumber ? String(source.pageNumber) : "1");
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveSourceActive || !liveSource?.stream) return;
    video.srcObject = liveSource.stream;
    void video.play().catch(() => null);
    return () => {
      if (video.srcObject === liveSource.stream) video.srcObject = null;
    };
  }, [liveSource?.stream, liveSourceActive]);

  const clampedCrop = useMemo(() => {
    if (!naturalSize) return cropDraft;
    return clampDocumentImageBbox(cropDraft, naturalSize);
  }, [cropDraft, naturalSize]);

  const cropBoxStyle = useMemo<React.CSSProperties>(() => {
    if (!naturalSize) return { display: "none" };
    return {
      left: formatPercent((clampedCrop.x / naturalSize.width) * 100),
      top: formatPercent((clampedCrop.y / naturalSize.height) * 100),
      width: formatPercent((clampedCrop.width / naturalSize.width) * 100),
      height: formatPercent((clampedCrop.height / naturalSize.height) * 100),
    };
  }, [clampedCrop, naturalSize]);

  const loadFile = (file: File | null) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setSourceKind("image_attachment");
    setSourceImage({
      sourceImageUrl: objectUrl,
      sourceAttachmentId: `image-attachment:${hashDocumentImageString(`${file.name}:${file.size}:${file.lastModified}`).replace("fnv1a32:", "")}`,
      sourceKind: "image_attachment",
      pageNumber: null,
    });
    setStatusMessage(t("imageLens.status.localImageLoaded"));
  };

  const useFullImage = () => {
    if (!naturalSize) return;
    setCropDraft({
      x: 0,
      y: 0,
      width: naturalSize.width,
      height: naturalSize.height,
    });
  };

  const navigateToPdfPage = async () => {
    if (pageNavigationPending || sourceKind !== "pdf_page_render" || !source) return;
    const parsedPage = Number.parseInt(pageDraft.trim(), 10);
    const maxPage = source.pageCount && source.pageCount > 0 ? source.pageCount : null;
    if (!Number.isInteger(parsedPage) || parsedPage < 1 || (maxPage !== null && parsedPage > maxPage)) {
      setStatusMessage(maxPage
        ? `Enter a PDF page from 1 to ${maxPage}.`
        : "Enter a positive PDF page number.");
      return;
    }
    if (source.pageNumber === parsedPage) {
      setPageDraft(String(parsedPage));
      setStatusMessage(`PDF page ${parsedPage} is already loaded.`);
      return;
    }

    setPageNavigationPending(true);
    setStatusMessage(`Loading PDF page ${parsedPage}...`);
    try {
      const sourceIdentity = source.scholarlySourcePdfRef ?? source.sourceAttachmentId;
      const sourceId = `pdf-page-render:${hashDocumentImageString(`${sourceIdentity}:page:${parsedPage}`).replace("fnv1a32:", "")}`;
      const result = await runCapabilityLaneOneShot({
        turn_id: `image-lens:page-navigation:${Date.now()}`,
        capability_lane_call: {
          capability: "visual_analysis.inspect_image_region",
          source_id: sourceId,
          source_attachment_id: sourceId,
          source_kind: "pdf_page_render",
          page_number: parsedPage,
          page_count: maxPage,
          scholarly_source_pdf_ref: source.scholarlySourcePdfRef ?? null,
          scholarly_pdf_cache_path: source.scholarlyPdfCachePath ?? null,
          source_mount_only: true,
          bbox_px: { x: 0, y: 0, width: 1, height: 1 },
          question: `Mount PDF page ${parsedPage} as the active Image Lens source.`,
          reason_for_crop: "Direct Image Lens page navigation.",
          region_label: `scholarly_pdf_page_${parsedPage}_source_mount`,
          region_kind: "unknown",
          detail: "high",
          assistant_answer: false,
          terminal_eligible: false,
        },
      });
      if (result.ok !== true) {
        throw new Error(result.message ?? result.error ?? "pdf_page_navigation_failed");
      }
      setPageDraft(String(parsedPage));
      setStatusMessage(`PDF page ${parsedPage} loaded.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "pdf_page_navigation_failed";
      setStatusMessage(`Unable to load PDF page ${parsedPage}: ${message}`);
    } finally {
      setPageNavigationPending(false);
    }
  };

  const startCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = liveSourceActive ? videoRef.current : imageRef.current;
    if (!hasVisualInput || !naturalSize || !target) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    });
    setCropDraft(pointToNaturalBbox(target, event.clientX, event.clientY, event.clientX + 1, event.clientY + 1, naturalSize));
  };

  const updateCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = liveSourceActive ? videoRef.current : imageRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !naturalSize || !target) return;
    event.preventDefault();
    setCropDraft(pointToNaturalBbox(
      target,
      dragState.startClientX,
      dragState.startClientY,
      event.clientX,
      event.clientY,
      naturalSize,
    ));
  };

  const endCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setDragState(null);
    setStatusMessage(t("imageLens.status.cropSet"));
  };

  const sendFrameToLiveAnswer = async () => {
    if (!hasVisualInput || !naturalSize) {
      setStatusMessage(t("imageLens.status.missingVisualInput"));
      return;
    }
    setStatusMessage(t("imageLens.status.sendingCrop"));
    const img = imageRef.current;
    const bboxPx = clampDocumentImageBbox(cropDraft, naturalSize);
    let sourceImageRef = source?.sourceImageUrl ?? liveSource?.latestFrameDataUrl ?? `live-source://${liveSource?.sourceId ?? "unknown"}`;
    let sourceAttachmentId = source?.sourceAttachmentId ?? `live-source:${liveSource?.sourceId ?? "unknown"}`;
    let pageNumber = source?.pageNumber ?? null;
    let sourceKindForReceipt: DocumentImageSourceKindV1 = source?.sourceKind ?? "manual_image_url";
    let imageRefValue = `${sourceImageRef}#crop=${bboxPx.x},${bboxPx.y},${bboxPx.width},${bboxPx.height}`;
    if (liveSourceActive && liveSource?.stream) {
      try {
        const snapshot = await captureFrameDataUrlFromStream(liveSource.stream);
        const snapshotImage = await dataUrlToImage(snapshot);
        imageRefValue = await cropImageToDataUrl(snapshotImage, bboxPx);
        sourceImageRef = snapshot;
        sourceAttachmentId = `live-source:${liveSource.sourceId}`;
        pageNumber = null;
        sourceKindForReceipt = "manual_image_url";
        patchLiveSource({
          latestFrameDataUrl: snapshot,
          lastFrameAt: new Date().toISOString(),
        });
      } catch {
        setStatusMessage(t("imageLens.status.sampleFailed"));
        return;
      }
    } else if (img && source) {
      try {
        imageRefValue = await cropImageToDataUrl(img, bboxPx);
      } catch {
        imageRefValue = source.sourceImageUrl.startsWith("data:image/")
          ? source.sourceImageUrl
          : `${source.sourceImageUrl}#crop=${bboxPx.x},${bboxPx.y},${bboxPx.width},${bboxPx.height}`;
      }
    }
    if (!imageRefValue.startsWith("data:image/")) {
      setStatusMessage(t("imageLens.status.inlineFrameFailed"));
      return;
    }

    const summary = t("imageLens.summary.manualCropFrame", { width: bboxPx.width, height: bboxPx.height });
    const receipt = buildDocumentImageRegionReceipt({
      sourceAttachmentId,
      sourceKind: sourceKindForReceipt,
      sourceImageRef,
      pageNumber,
      pageImageRef: sourceKindForReceipt === "pdf_page_render" ? sourceImageRef : undefined,
      bboxPx,
      imageRef: imageRefValue,
      kind,
      confidence: 0.5,
      summary,
      status: "candidate",
      nearbyText: summary,
    });

    try {
      const visualSource = liveSourceActive && liveSource
        ? {
            sourceId: liveSource.sourceId,
            environmentId: liveSource.environmentId ?? null,
            pipelineId: liveSource.pipelineId ?? null,
            roomId: liveSource.roomId ?? null,
          }
        : {
            ...(await resolveLiveAnswerVisualSource()),
            roomId: null,
          };
      const result = await submitImageLensCropFrame({
        postJson,
        receipt,
        sourceId: visualSource.sourceId,
        threadId: liveSource?.threadId ?? HELIX_ASK_CONTEXT_ID.desktop,
        roomId: visualSource.roomId,
        environmentId: visualSource.environmentId,
        pipelineId: visualSource.pipelineId,
        imageDataUrl: imageRefValue,
        objective: liveSourceActive
          ? "Image Lens crop frame sampled from routed screen-share visual source."
          : "Image Lens manual crop frame for Live Answer visual-source analysis.",
      });
      addReceipt(result.receipt);
      setLastSentFrame({
        sourceId: visualSource.sourceId,
        frameId: result.frameId,
        evidenceId: result.evidenceId,
        summary: result.summary,
      });
      setStatusMessage(t("imageLens.status.sendSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "visual_frame_send_failed";
      setStatusMessage(t("imageLens.status.sendFailed", { message }));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100" data-testid="image-lens-panel">
      <div className="border-b border-white/10 bg-slate-950/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-2 text-sm font-semibold">
            <FileImage className="h-4 w-4 shrink-0 text-cyan-200" />
            <span className="truncate">{t("imageLens.header.title")}</span>
            <div className="ml-2 flex rounded border border-white/10 bg-black/20 p-0.5 text-[11px] font-normal">
              <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.inspect"
                type="button"
                onClick={() => setWorkspaceMode("inspect")}
                className={`rounded px-2 py-1 ${workspaceMode === "inspect" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400"}`}
              >
                Inspect
              </button>
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.realtime-texture-pack"
                type="button"
                onClick={() => setWorkspaceMode("realtime_texture_pack")}
                className={`rounded px-2 py-1 ${workspaceMode === "realtime_texture_pack" ? "bg-fuchsia-500/20 text-fuchsia-100" : "text-slate-400"}`}
              >
                Realtime Texture Pack
              </button>
            </div>
          </div>
          {workspaceMode === "inspect" ? <>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.file-input-ref-current-click"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t("imageLens.action.chooseFile")}
            title={t("imageLens.action.chooseFile")}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-500/50 bg-slate-800 px-2 text-xs text-slate-100 hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("imageLens.action.chooseFile")}</span>
          </button>
          <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label={t("imageLens.action.chooseImageFileAria")}
            className="sr-only"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => loadFile(event.currentTarget.files?.[0] ?? null)}
          />
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.send-frame-to-live-answer"
            type="button"
            onClick={sendFrameToLiveAnswer}
            disabled={!hasVisualInput || !naturalSize}
            aria-label={t("imageLens.action.sendCropFrame")}
            title={t("imageLens.action.sendCropFrame")}
            className="inline-flex h-8 items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Scissors className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("imageLens.action.sendCropFrame")}</span>
          </button>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.use-full-image"
            type="button"
            onClick={useFullImage}
            disabled={!naturalSize}
            aria-label={t("imageLens.action.fullImage")}
            title={t("imageLens.action.fullImage")}
            className="inline-flex h-8 items-center gap-1 rounded border border-white/10 bg-white/5 px-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("imageLens.action.fullImage")}</span>
          </button>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.set-advanced-open-value-boolean-value"
            type="button"
            onClick={() => setAdvancedOpen((value: boolean) => !value)}
            aria-label={t("imageLens.action.advanced")}
            title={t("imageLens.action.advanced")}
            className="inline-flex h-8 items-center gap-1 rounded border border-white/10 bg-white/5 px-2 text-xs text-slate-200 hover:bg-white/10"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            <span className="hidden md:inline">{t("imageLens.action.advanced")}</span>
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.clear-receipts"
            type="button"
            onClick={clearReceipts}
            aria-label={t("imageLens.action.clear")}
            title={t("imageLens.action.clear")}
            className="inline-flex h-8 items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2 text-xs text-rose-100 hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("imageLens.action.clear")}</span>
          </button>
          </> : null}
        </div>
        {workspaceMode === "inspect" ? <>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5">
          <span className="min-w-0 flex-1 truncate text-slate-400">{statusMessage}</span>
          {liveSourceActive ? (
            <span className="truncate text-cyan-100">
              {t("imageLens.liveSource.note", { sourceId: liveSource?.sourceId ?? "unknown" })}
            </span>
          ) : null}
          {!liveSourceActive && source?.sourceKind === "pdf_page_render" && source.pageNumber ? (
            <span className="truncate text-cyan-100" data-testid="image-lens-mounted-pdf-source">
              {t("imageLens.pdfPage.status", {
                pageNumber: source.pageNumber,
                pageCount: source.pageCount ? ` / ${source.pageCount}` : "",
              })}
            </span>
          ) : null}
          {lastSentFrame ? (
            <span className="inline-flex min-w-0 items-center gap-2 truncate rounded border border-emerald-400/30 bg-emerald-500/10 px-2 text-emerald-100">
              {t("imageLens.sent.source", { sourceId: lastSentFrame.sourceId })}
              {lastSentFrame.evidenceId ? t("imageLens.sent.evidence", { evidenceId: lastSentFrame.evidenceId }) : ""}
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.open-live-answer-panel"
                type="button"
                onClick={openLiveAnswerPanel}
                title={t("imageLens.action.openLiveAnswer")}
                className="inline-flex h-5 items-center gap-1 rounded border border-emerald-300/40 px-1.5 hover:bg-emerald-500/20"
              >
                <ImageIcon className="h-3 w-3" />
                <span className="hidden sm:inline">{t("imageLens.action.openLiveAnswer")}</span>
              </button>
            </span>
          ) : null}
        </div>
        <div
          className="mt-2 grid gap-1 rounded border border-cyan-300/15 bg-cyan-950/20 p-2 text-[10px] leading-4 text-slate-300 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="image-lens-scientific-workflow-status"
        >
          <span className="truncate">
            Page: {scientificWorkflowStatus.pageLoaded ? `${scientificWorkflowStatus.sourceId ?? "source"}${scientificWorkflowStatus.pageNumber ? ` p.${scientificWorkflowStatus.pageNumber}` : ""}` : "none"}
          </span>
          <span className="truncate">Hash: {scientificWorkflowStatus.sourceImageHash ?? "missing"}</span>
          <span className="truncate">Crop: {scientificWorkflowStatus.cropRef ?? scientificWorkflowStatus.cropRegionRef ?? "missing"}</span>
          <span className="truncate">Sidecar: {scientificWorkflowStatus.sidecarId ?? "missing"}</span>
          <span className="truncate">Row: {scientificWorkflowStatus.promotedRowState}</span>
          <span className="truncate">Graph: {scientificWorkflowStatus.graphReflectionStatus}</span>
          <span className="truncate">Calculator: {scientificWorkflowStatus.calculatorTemplateStatus}</span>
          <span className="truncate">
            {t("imageLens.workflow.postulateRefs", { count: Object.values(scientificWorkflowStatus.postulateReadyRefs).flat().length })}
          </span>
        </div>
        </> : null}
      </div>

      {workspaceMode === "realtime_texture_pack" ? (
        <RealtimeTexturePackControls />
      ) : (
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-4">
          <div className="relative flex min-h-[420px] items-center justify-center rounded border border-white/10 bg-[linear-gradient(45deg,rgba(255,255,255,0.04)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.04)_75%),linear-gradient(45deg,rgba(255,255,255,0.04)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.04)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]">
            {liveSourceActive ? (
              <div
                className="relative max-h-full max-w-full cursor-crosshair touch-none"
                onPointerDown={startCropDrag}
                onPointerMove={updateCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="max-h-[68vh] max-w-full select-none object-contain"
                  onLoadedMetadata={(event: React.SyntheticEvent<HTMLVideoElement>) => {
                    const video = event.currentTarget;
                    setNaturalSize({ width: video.videoWidth || 1, height: video.videoHeight || 1 });
                  }}
                />
                <div
                  className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]"
                  style={cropBoxStyle}
                  data-testid="image-lens-crop-box"
                />
              </div>
            ) : source ? (
              <div
                className="relative max-h-full max-w-full cursor-crosshair touch-none"
                onPointerDown={startCropDrag}
                onPointerMove={updateCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
              >
                <img
                  ref={imageRef}
                  src={source.sourceImageUrl}
                  alt={t("imageLens.image.alt")}
                  crossOrigin="anonymous"
                  draggable={false}
                  className="max-h-[68vh] max-w-full select-none object-contain"
                  onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
                    const img = event.currentTarget;
                    setNaturalSize({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
                  }}
                  onError={() => setStatusMessage(t("imageLens.status.imageLoadFailed"))}
                />
                <div
                  className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]"
                  style={cropBoxStyle}
                  data-testid="image-lens-crop-box"
                />
              </div>
            ) : (
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.file-input-ref-current-click.2"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-40 w-40 flex-col items-center justify-center rounded border border-dashed border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                aria-label={t("imageLens.action.chooseImageFileAria")}
              >
                <Plus className="h-10 w-10" />
                <span className="mt-2 text-xs">{t("imageLens.action.addImage")}</span>
              </button>
            )}
          </div>
        </div>

        {advancedOpen ? (
          <div className="border-t border-white/10 bg-black/20 p-3" data-testid="image-lens-advanced">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded border border-white/10 bg-slate-900/60 p-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("imageLens.advanced.sourceDetails")}</div>
                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <label className="block text-xs text-slate-300">
                    {t("imageLens.advanced.sourceKind")}
                    <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.select"
                      value={sourceKind}
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSourceKind(event.target.value as DocumentImageSourceKindV1)}
                      className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs"
                    >
                      {sourceKindOptions.map(([value, label]: [DocumentImageSourceKindV1, string]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-slate-300">
                    {t("imageLens.advanced.page")}
                    <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.image-lens-page-input"
                      type="number"
                      min={1}
                      max={source?.pageCount ?? undefined}
                      value={pageDraft}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPageDraft(event.target.value)}
                      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        void navigateToPdfPage();
                      }}
                      disabled={sourceKind !== "pdf_page_render" || pageNavigationPending}
                      title="Press Enter to load this PDF page"
                      data-testid="image-lens-page-input"
                      className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-900/60 p-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("imageLens.advanced.cropCoordinates")}</div>
                <div className="grid grid-cols-4 gap-2">
                  {(["x", "y", "width", "height"] as const).map((key: keyof DocumentImageBboxPxV1) => (
                    <label key={key} className="block text-xs text-slate-300">
                      {key}
                      <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.input.2"
                        type="number"
                        min={key === "width" || key === "height" ? 1 : 0}
                        value={Math.round(cropDraft[key])}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCropDraft({ [key]: parseNumber(event.target.value, cropDraft[key]) })}
                        className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {t("imageLens.advanced.naturalSize", {
                    value: naturalSize ? `${naturalSize.width} x ${naturalSize.height}px` : t("imageLens.advanced.notLoaded"),
                  })}
                </p>
              </div>
              <div className="rounded border border-white/10 bg-slate-900/60 p-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("imageLens.advanced.frameReceipt")}</div>
                <label className="block text-xs text-slate-300">
                  {t("imageLens.advanced.regionKind")}
                  <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.image-lens.image-lens-panel.select.2"
                    value={kind}
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setKind(event.target.value as DocumentImageRegionKindV1)}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs"
                  >
                    {DOCUMENT_IMAGE_REGION_KIND_VALUES.map((value: DocumentImageRegionKindV1) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-[11px] text-slate-500">
                  {t("imageLens.advanced.interpretationBoundary")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="max-h-56 overflow-auto border-t border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t("imageLens.frames.title")}</div>
            <div className="text-[11px] text-slate-500">{t("imageLens.frames.authority")}</div>
          </div>
          {receipts.length === 0 ? (
            <p className="text-xs text-slate-500">{t("imageLens.frames.empty")}</p>
          ) : (
            <div className="space-y-2">
              {receipts.map((receipt: NonNullable<DocumentImageRegionState["lastReceipt"]>) => (
                <article key={receipt.crop.regionId} className="rounded border border-white/10 bg-slate-900/70 p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-slate-100">
                      {receipt.classification.kind} - {receipt.extraction.status}
                    </div>
                    <div className="text-[11px] text-slate-500">{t("imageLens.frames.source", { sourceId: receipt.visualSource.sourceId })}</div>
                  </div>
                  <p className="mt-1 text-slate-300">{receipt.classification.summary}</p>
                  <p className="mt-1 break-all text-[11px] text-slate-500">
                    {receipt.crop.regionId} - bbox={receipt.crop.bboxPx.x},{receipt.crop.bboxPx.y},{receipt.crop.bboxPx.width},{receipt.crop.bboxPx.height} - hash={receipt.crop.imageHash}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-200">
                    {t("imageLens.frames.claimBoundary")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
      )}
    </div>
  );
}
