import { useWorkstationClipboardStore } from "@/store/useWorkstationClipboardStore";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";

function textFromClipboardEvent(event: ClipboardEvent): string {
  const fromEvent = event.clipboardData?.getData("text/plain") ?? "";
  if (fromEvent.trim()) return fromEvent;
  if (typeof window === "undefined") return "";
  const selected = window.getSelection?.()?.toString() ?? "";
  return selected;
}

export function recordClipboardReceipt(args: {
  direction: "copy" | "paste" | "read" | "write";
  text: string;
  source: string;
  traceId?: string;
  meta?: Record<string, unknown>;
}): void {
  useWorkstationClipboardStore.getState().addReceipt({
    direction: args.direction,
    text: args.text,
    source: args.source,
    trace_id: args.traceId,
    meta: args.meta,
  });
  const traceId = args.traceId?.trim() || `workstation-clipboard:${args.direction}:${Date.now()}`;
  emitHelixAskLiveEvent({
    contextId: HELIX_ASK_CONTEXT_ID.desktop,
    traceId,
    entry: {
      id: `workstation-clipboard:${args.direction}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      text: `clipboard ${args.direction}: ${args.text.replace(/\s+/g, " ").trim().slice(0, 140) || "(empty)"}`,
      tool: "workstation.clipboard",
      ts: new Date().toISOString(),
      meta: {
        kind: "workstation_clipboard_receipt",
        direction: args.direction,
        source: args.source,
        trace_id: traceId,
        meta: args.meta ?? null,
      },
    },
  });
}

export async function writeClipboardWithReceipt(args: {
  text: string;
  source: string;
  traceId?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(args.text);
    recordClipboardReceipt({
      direction: "write",
      text: args.text,
      source: args.source,
      traceId: args.traceId,
      meta: args.meta,
    });
    return true;
  } catch {
    return false;
  }
}

export async function readClipboardWithReceipt(args: {
  source: string;
  traceId?: string;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return null;
  try {
    const value = await navigator.clipboard.readText();
    recordClipboardReceipt({
      direction: "read",
      text: value,
      source: args.source,
      traceId: args.traceId,
      meta: args.meta,
    });
    return value;
  } catch {
    return null;
  }
}

export function startWorkstationClipboardCapture(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onCopy = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent;
    const text = textFromClipboardEvent(clipboardEvent);
    if (!text.trim()) return;
    recordClipboardReceipt({
      direction: "copy",
      text,
      source: "dom.copy_event",
    });
  };

  const onPaste = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent;
    const text = textFromClipboardEvent(clipboardEvent);
    if (!text.trim()) return;
    recordClipboardReceipt({
      direction: "paste",
      text,
      source: "dom.paste_event",
    });
  };

  window.addEventListener("copy", onCopy as EventListener);
  window.addEventListener("paste", onPaste as EventListener);
  return () => {
    window.removeEventListener("copy", onCopy as EventListener);
    window.removeEventListener("paste", onPaste as EventListener);
  };
}
