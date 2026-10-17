import React from "react";
import { FileText, X } from "lucide-react";

export type HelixAskAttachmentStripAttachment = {
  id: string;
  kind: "image" | "text";
  fileName: string;
  status: "ready" | "error";
  error?: string | null;
  previewUrl?: string;
};

export type HelixAskAttachmentStripCommitCheck = {
  attachment: HelixAskAttachmentStripAttachment;
  check?: {
    can_submit?: boolean;
  } | null;
};

export type HelixAskAttachmentStripProps = {
  items: readonly HelixAskAttachmentStripCommitCheck[];
  onRemove: (attachmentId: string) => void;
};

export function HelixAskAttachmentStrip({ items, onRemove }: HelixAskAttachmentStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[10px] text-slate-300">
      <div className="flex flex-wrap gap-2">
        {items.map(({ attachment, check }) => (
          <div
            key={attachment.id}
            className={`flex min-w-0 max-w-[260px] items-center gap-2 rounded-lg border px-2 py-1.5 ${
              check?.can_submit
                ? "border-violet-300/25 bg-violet-950/20"
                : "border-amber-300/30 bg-amber-950/20"
            }`}
          >
            {attachment.kind === "image" ? (
              <img
                src={attachment.previewUrl}
                alt=""
                className="h-9 w-9 rounded-md border border-white/10 object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/25">
                <FileText className="h-4 w-4 text-cyan-100" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-violet-100">{attachment.fileName}</div>
              <div className={`text-[10px] ${check?.can_submit ? "text-violet-200/70" : "text-amber-100/80"}`}>
                {attachment.status === "error"
                  ? attachment.error ?? "attachment failed"
                  : check?.can_submit
                    ? attachment.kind === "image"
                      ? "image ready"
                      : "text ready"
                    : attachment.kind === "image"
                      ? "image needs reattach"
                      : "text needs reattach"}
              </div>
            </div>
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-attachment-strip.on-remove-attachment-id"
              type="button"
              aria-label={`Remove ${attachment.fileName}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              onClick={() => onRemove(attachment.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
