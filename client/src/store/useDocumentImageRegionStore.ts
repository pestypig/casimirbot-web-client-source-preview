import { create } from "zustand";
import type { StateCreator } from "zustand";
import type {
  DocumentImageBboxPxV1,
  DocumentImageExtractionStatusV1,
  DocumentImageRegionReceiptV1,
  DocumentImageSourceKindV1,
} from "@shared/contracts/document-image-region-receipt.v1";

const MAX_DOCUMENT_IMAGE_RECEIPTS = 40;
const MAX_PERSISTED_IMAGE_URL_CHARS = 256_000;
const DOCUMENT_IMAGE_SOURCE_STORAGE_KEY = "helix:image-lens:last-document-source:v1";

export type DocumentImageSourceState = {
  sourceImageUrl: string;
  sourceAttachmentId: string;
  sourceKind: DocumentImageSourceKindV1;
  pageNumber: number | null;
  pageCount?: number | null;
  pageImageRef?: string | null;
  naturalSize?: { width: number; height: number } | null;
  sourceDimensionsPx?: { width: number; height: number } | null;
  cropDraft?: DocumentImageBboxPxV1 | null;
  viewMode?: "full_image" | "fit_to_panel" | "manual_crop" | null;
  coordinateSpace?: "natural_image_px" | "viewport_px" | null;
  sourceId?: string | null;
  evidenceId?: string | null;
  regionId?: string | null;
  scientificEvidenceSidecarId?: string | null;
  scholarlySourcePdfRef?: string | null;
  scholarlyPdfCachePath?: string | null;
  sourceRefHash?: string | null;
  mountedAt?: string | null;
};

export type DocumentImageRegionState = {
  source: DocumentImageSourceState | null;
  naturalSize: { width: number; height: number } | null;
  cropDraft: DocumentImageBboxPxV1;
  receipts: DocumentImageRegionReceiptV1[];
  lastReceipt: DocumentImageRegionReceiptV1 | null;
  setSourceImage: (source: DocumentImageSourceState) => void;
  setNaturalSize: (naturalSize: { width: number; height: number }) => void;
  setCropDraft: (cropDraft: Partial<DocumentImageBboxPxV1>) => void;
  addReceipt: (receipt: DocumentImageRegionReceiptV1) => void;
  updateReceiptStatus: (regionId: string, status: DocumentImageExtractionStatusV1) => void;
  clearReceipts: () => void;
  rehydratePersistedSourceImage: () => boolean;
};

const DEFAULT_CROP: DocumentImageBboxPxV1 = {
  x: 0,
  y: 0,
  width: 640,
  height: 360,
};

const isDisplayableImageRef = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(data:image\/|blob:|https?:\/\/|file:\/\/)/i.test(value.trim());

const readPositiveSize = (value: unknown): { width: number; height: number } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const width = typeof record.width === "number" ? record.width : null;
  const height = typeof record.height === "number" ? record.height : null;
  return width && width > 0 && height && height > 0 ? { width, height } : null;
};

const readBbox = (value: unknown): DocumentImageBboxPxV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const x = typeof record.x === "number" ? record.x : null;
  const y = typeof record.y === "number" ? record.y : null;
  const width = typeof record.width === "number" ? record.width : null;
  const height = typeof record.height === "number" ? record.height : null;
  return x !== null && x >= 0 && y !== null && y >= 0 && width && width > 0 && height && height > 0
    ? { x, y, width, height }
    : null;
};

const readPersistedSourceImage = (): DocumentImageSourceState | null => {
  if (typeof window === "undefined") return null;
  try {
    const record = JSON.parse(window.localStorage.getItem(DOCUMENT_IMAGE_SOURCE_STORAGE_KEY) ?? "null");
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    if (!isDisplayableImageRef(record.sourceImageUrl)) return null;
    return {
      sourceImageUrl: record.sourceImageUrl,
      sourceAttachmentId: typeof record.sourceAttachmentId === "string" ? record.sourceAttachmentId : "image-lens-recovered-source",
      sourceKind: record.sourceKind === "pdf_page_render" ? "pdf_page_render" : "image_attachment",
      pageNumber: typeof record.pageNumber === "number" ? record.pageNumber : null,
      pageCount: typeof record.pageCount === "number" ? record.pageCount : null,
      pageImageRef: typeof record.pageImageRef === "string" ? record.pageImageRef : null,
      naturalSize: readPositiveSize(record.naturalSize),
      sourceDimensionsPx: readPositiveSize(record.sourceDimensionsPx),
      cropDraft: readBbox(record.cropDraft),
      viewMode: record.viewMode === "manual_crop" || record.viewMode === "fit_to_panel" || record.viewMode === "full_image"
        ? record.viewMode
        : null,
      coordinateSpace: record.coordinateSpace === "viewport_px" || record.coordinateSpace === "natural_image_px"
        ? record.coordinateSpace
        : "natural_image_px",
      sourceId: typeof record.sourceId === "string" ? record.sourceId : null,
      evidenceId: typeof record.evidenceId === "string" ? record.evidenceId : null,
      regionId: typeof record.regionId === "string" ? record.regionId : null,
      scientificEvidenceSidecarId: typeof record.scientificEvidenceSidecarId === "string" ? record.scientificEvidenceSidecarId : null,
      scholarlySourcePdfRef: typeof record.scholarlySourcePdfRef === "string" ? record.scholarlySourcePdfRef : null,
      scholarlyPdfCachePath: typeof record.scholarlyPdfCachePath === "string" ? record.scholarlyPdfCachePath : null,
      sourceRefHash: typeof record.sourceRefHash === "string" ? record.sourceRefHash : null,
      mountedAt: typeof record.mountedAt === "string" ? record.mountedAt : null,
    };
  } catch {
    return null;
  }
};

const persistSourceImage = (source: DocumentImageSourceState): void => {
  if (typeof window === "undefined" || !isDisplayableImageRef(source.sourceImageUrl)) return;
  if (
    /^(?:data:image\/|blob:)/i.test(source.sourceImageUrl.trim()) &&
    source.sourceImageUrl.length > MAX_PERSISTED_IMAGE_URL_CHARS
  ) {
    // A rendered PDF page can be several megabytes. Keep it available in the
    // active store, but do not let a recovery snapshot consume localStorage.
    try {
      window.localStorage.removeItem(DOCUMENT_IMAGE_SOURCE_STORAGE_KEY);
    } catch {
      // The in-memory source remains authoritative.
    }
    return;
  }
  try {
    window.localStorage.setItem(DOCUMENT_IMAGE_SOURCE_STORAGE_KEY, JSON.stringify({
      ...source,
      persistedAt: new Date().toISOString(),
    }));
  } catch {
    // Source persistence is a panel recovery aid; the active in-memory source remains authoritative.
  }
};

const creator: StateCreator<DocumentImageRegionState> = (set) => ({
  source: null,
  naturalSize: null,
  cropDraft: DEFAULT_CROP,
  receipts: [],
  lastReceipt: null,
  setSourceImage: (source: DocumentImageSourceState) => {
    const normalizedSource = {
      ...source,
      sourceDimensionsPx: source.sourceDimensionsPx ?? source.naturalSize ?? null,
      coordinateSpace: source.coordinateSpace ?? "natural_image_px",
      viewMode: source.viewMode ?? "fit_to_panel",
    };
    persistSourceImage(normalizedSource);
    set({
      source: normalizedSource,
      naturalSize: normalizedSource.naturalSize ?? normalizedSource.sourceDimensionsPx ?? null,
      cropDraft: normalizedSource.cropDraft ?? DEFAULT_CROP,
    });
  },
  setNaturalSize: (naturalSize: { width: number; height: number }) =>
    set((state: DocumentImageRegionState) => {
      const nextCropDraft = {
        x: Math.max(0, Math.min(state.cropDraft.x, Math.max(0, naturalSize.width - 1))),
        y: Math.max(0, Math.min(state.cropDraft.y, Math.max(0, naturalSize.height - 1))),
        width: Math.max(1, Math.min(state.cropDraft.width, naturalSize.width)),
        height: Math.max(1, Math.min(state.cropDraft.height, naturalSize.height)),
      };
      const nextSource = state.source
        ? {
            ...state.source,
            naturalSize,
            sourceDimensionsPx: naturalSize,
            cropDraft: nextCropDraft,
            coordinateSpace: "natural_image_px",
          }
        : state.source;
      if (nextSource) persistSourceImage(nextSource);
      return {
        source: nextSource,
        naturalSize,
        cropDraft: nextCropDraft,
      };
    }),
  setCropDraft: (cropDraft: Partial<DocumentImageBboxPxV1>) =>
    set((state: DocumentImageRegionState) => {
      const nextCropDraft = {
        ...state.cropDraft,
        ...cropDraft,
      };
      const nextSource = state.source
        ? {
            ...state.source,
            cropDraft: nextCropDraft,
            viewMode: nextCropDraft.x === 0 &&
              nextCropDraft.y === 0 &&
              state.naturalSize &&
              nextCropDraft.width === state.naturalSize.width &&
              nextCropDraft.height === state.naturalSize.height
                ? "full_image" as const
                : "manual_crop" as const,
            coordinateSpace: "natural_image_px" as const,
          }
        : state.source;
      if (nextSource) persistSourceImage(nextSource);
      return {
        source: nextSource,
        cropDraft: nextCropDraft,
      };
    }),
  addReceipt: (receipt: DocumentImageRegionReceiptV1) =>
    set((state: DocumentImageRegionState) => ({
      lastReceipt: receipt,
      receipts: [
        receipt,
        ...state.receipts.filter((entry: DocumentImageRegionReceiptV1) => entry.crop.regionId !== receipt.crop.regionId),
      ].slice(0, MAX_DOCUMENT_IMAGE_RECEIPTS),
    })),
  updateReceiptStatus: (regionId: string, status: DocumentImageExtractionStatusV1) =>
    set((state: DocumentImageRegionState) => {
      const update = (receipt: DocumentImageRegionReceiptV1): DocumentImageRegionReceiptV1 =>
        receipt.crop.regionId === regionId
          ? { ...receipt, extraction: { ...receipt.extraction, status } }
          : receipt;
      return {
        receipts: state.receipts.map(update),
        lastReceipt: state.lastReceipt ? update(state.lastReceipt) : null,
      };
    }),
  clearReceipts: () => set({ receipts: [], lastReceipt: null }),
  rehydratePersistedSourceImage: () => {
    const source = readPersistedSourceImage();
    if (!source) return false;
    const naturalSize = source.naturalSize ?? source.sourceDimensionsPx ?? null;
    set({
      source: {
        ...source,
        mountedAt: source.mountedAt ?? new Date().toISOString(),
      },
      naturalSize,
      cropDraft: source.cropDraft ?? DEFAULT_CROP,
    });
    return true;
  },
});

export const useDocumentImageRegionStore = create<DocumentImageRegionState>(creator);
