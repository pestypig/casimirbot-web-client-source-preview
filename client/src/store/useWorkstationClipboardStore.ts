import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { recordWorkstationTimelineEntry } from "@/store/useWorkstationWorkflowTimelineStore";

const WORKSTATION_CLIPBOARD_STORAGE_KEY = "workstation-clipboard-history:v1";
const WORKSTATION_CLIPBOARD_MAX_ENTRIES = 120;
const WORKSTATION_CLIPBOARD_MAX_PERSISTED_ENTRIES = 40;
const WORKSTATION_CLIPBOARD_MAX_TEXT_CHARS = 4000;
const WORKSTATION_CLIPBOARD_MAX_META_CHARS = 2000;
const WORKSTATION_CLIPBOARD_MAX_STORAGE_CHARS = 160_000;

export type WorkstationClipboardDirection = "copy" | "paste" | "read" | "write";

export type WorkstationClipboardReceipt = {
  id: string;
  ts: string;
  direction: WorkstationClipboardDirection;
  text: string;
  preview: string;
  source: string;
  trace_id?: string;
  meta?: Record<string, unknown>;
};

type WorkstationClipboardState = {
  receipts: WorkstationClipboardReceipt[];
  addReceipt: (receipt: Omit<WorkstationClipboardReceipt, "id" | "ts" | "preview"> & { id?: string; ts?: string }) => void;
  clearReceipts: () => void;
};

function previewText(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= 180) return flat;
  return `${flat.slice(0, 179)}...`;
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 32))}\n...[truncated ${value.length - limit} chars]`;
}

function safeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  try {
    const serialized = JSON.stringify(meta);
    if (serialized.length <= WORKSTATION_CLIPBOARD_MAX_META_CHARS) return meta;
    return {
      truncated: true,
      preview: serialized.slice(0, WORKSTATION_CLIPBOARD_MAX_META_CHARS),
    };
  } catch {
    return { truncated: true, preview: "unserializable_meta" };
  }
}

function normalizeReceiptForStorage(receipt: WorkstationClipboardReceipt): WorkstationClipboardReceipt {
  const text = truncateText(receipt.text ?? "", WORKSTATION_CLIPBOARD_MAX_TEXT_CHARS);
  return {
    ...receipt,
    text,
    preview: previewText(text),
    meta: safeMeta(receipt.meta),
  };
}

function clampPersistedState(state: unknown): unknown {
  const record = state && typeof state === "object" ? state as { state?: { receipts?: WorkstationClipboardReceipt[] } } : null;
  const receipts = Array.isArray(record?.state?.receipts) ? record.state.receipts : [];
  const nextState = {
    ...(record ?? {}),
    state: {
      ...(record?.state ?? {}),
      receipts: receipts
        .slice(0, WORKSTATION_CLIPBOARD_MAX_PERSISTED_ENTRIES)
        .map(normalizeReceiptForStorage),
    },
  };
  let current = nextState;
  while (JSON.stringify(current).length > WORKSTATION_CLIPBOARD_MAX_STORAGE_CHARS && current.state.receipts.length > 0) {
    current = {
      ...current,
      state: {
        ...current.state,
        receipts: current.state.receipts.slice(0, -1),
      },
    };
  }
  return current;
}

const safeClipboardStorage = createJSONStorage<Pick<WorkstationClipboardState, "receipts">>(() => ({
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(name);
    } catch (error) {
      console.warn("[workstation-clipboard] localStorage read failed", error);
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    } catch (error) {
      try {
        if (typeof window === "undefined") return;
        const parsed = JSON.parse(value);
        const clamped = JSON.stringify(clampPersistedState(parsed));
        window.localStorage.setItem(name, clamped);
        console.warn("[workstation-clipboard] history was truncated after storage quota pressure", error);
      } catch (secondError) {
        console.warn("[workstation-clipboard] localStorage write skipped after quota pressure", secondError);
      }
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    } catch (error) {
      console.warn("[workstation-clipboard] localStorage remove failed", error);
    }
  },
}));

export const useWorkstationClipboardStore = create<WorkstationClipboardState>()(
  persist(
    (set) => ({
      receipts: [],
      addReceipt: (receipt) =>
        set((state) => {
          const normalizedText = truncateText(receipt.text ?? "", WORKSTATION_CLIPBOARD_MAX_TEXT_CHARS);
          const normalizedSource = receipt.source.trim() || "unknown";
          const complete: WorkstationClipboardReceipt = {
            id: receipt.id?.trim() || `clip:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
            ts: receipt.ts?.trim() || new Date().toISOString(),
            direction: receipt.direction,
            text: normalizedText,
            preview: previewText(normalizedText),
            source: normalizedSource,
            trace_id: receipt.trace_id,
            meta: safeMeta(receipt.meta),
          };
          recordWorkstationTimelineEntry({
            lane: "clipboard",
            label: `${complete.direction.toUpperCase()} ${complete.preview ? `"${complete.preview}"` : "(empty)"}`,
            detail: `source=${complete.source}`,
            traceId: complete.trace_id,
            panelId: "workstation-clipboard-history",
          });
          return {
            receipts: [complete, ...state.receipts].slice(0, WORKSTATION_CLIPBOARD_MAX_ENTRIES),
          };
        }),
      clearReceipts: () => set({ receipts: [] }),
    }),
    {
      name: WORKSTATION_CLIPBOARD_STORAGE_KEY,
      storage: safeClipboardStorage,
      partialize: (state) => ({
        receipts: state.receipts
          .slice(0, WORKSTATION_CLIPBOARD_MAX_PERSISTED_ENTRIES)
          .map(normalizeReceiptForStorage),
      }),
    },
  ),
);
