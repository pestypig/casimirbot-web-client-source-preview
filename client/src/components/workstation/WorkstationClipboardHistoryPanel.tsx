import React from "react";
import { ClipboardList, Trash2 } from "lucide-react";
import { useWorkstationClipboardStore } from "@/store/useWorkstationClipboardStore";

function formatWhen(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString();
}

export default function WorkstationClipboardHistoryPanel() {
  const receipts = useWorkstationClipboardStore((state) => state.receipts);
  const clearReceipts = useWorkstationClipboardStore((state) => state.clearReceipts);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="h-4 w-4" />
          Clipboard History
        </div>
        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-clipboard-history.workstation-clipboard-history-panel.clear"
          type="button"
          onClick={clearReceipts}
          className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {receipts.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">No clipboard receipts yet.</p>
        ) : (
          <div className="space-y-2 p-3">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                <p className="text-[11px] font-medium text-slate-100">
                  {receipt.direction.toUpperCase()} · {formatWhen(receipt.ts)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">
                  {receipt.preview || "(empty)"}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  source={receipt.source}
                  {receipt.trace_id ? ` trace=${receipt.trace_id}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
