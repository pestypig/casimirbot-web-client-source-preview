import { Clock, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TempoMeta } from "@/types/noise-gens";

export type RecentUploadEntry = {
  trackId: string;
  title: string;
  creator: string;
  uploadedAt: number;
  knowledgeProjectId?: string;
  knowledgeProjectName?: string;
  tempo?: TempoMeta;
  durationSeconds?: number | null;
  publishedLyrics?: string;
  metaSummary?: {
    saved: string;
    published: string;
    changed: boolean;
  };
};

type RecentUploadsRailProps = {
  uploads: Array<RecentUploadEntry & { isReady: boolean; isRanked: boolean }>;
  onSelect: (upload: RecentUploadEntry) => void;
  onRetry?: (upload: RecentUploadEntry) => void;
  onEdit?: (upload: RecentUploadEntry) => void;
  onReveal?: (upload: RecentUploadEntry) => void;
};

const formatTimeAgo = (timestamp: number) => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes <= 0) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export function RecentUploadsRail({
  uploads,
  onSelect,
  onRetry,
  onEdit,
  onReveal,
}: RecentUploadsRailProps) {
  if (!uploads.length) return null;
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-200 shadow-[0_20px_40px_-35px_rgba(14,165,233,0.55)]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Recent uploads</p>
          <p className="text-xs text-slate-400">
            Newly dropped originals stay pinned here until ranking completes.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Auto-saves</span>
      </header>
      <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
        {uploads.map((upload) => {
          const buttonLabel = upload.isReady ? (upload.isRanked ? "Select" : "Use now") : "Waiting";
          return (
            <div
              key={upload.trackId}
              className="flex items-start gap-3 rounded-2xl border border-white/5 bg-slate-950/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{upload.title}</div>
                <div className="text-xs text-slate-400">
                  {upload.creator}
                  {upload.knowledgeProjectName ? ` / ${upload.knowledgeProjectName}` : null}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  <span>{formatTimeAgo(upload.uploadedAt)}</span>
                  {!upload.isRanked ? <span className="text-amber-300">Syncing</span> : null}
                </div>
                {upload.metaSummary ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    Meta: {upload.metaSummary.saved} · Published:{" "}
                    {upload.metaSummary.published}
                    {upload.metaSummary.changed ? (
                      <span className="ml-1 text-amber-300">updated</span>
                    ) : null}
                  </div>
                ) : upload.tempo ? (
                  <div className="text-[11px] text-slate-500">
                    {Math.round(upload.tempo.bpm)} BPM · {upload.tempo.timeSig}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={upload.isReady ? "secondary" : "outline"}
                  disabled={!upload.isReady}
                  onClick={() => onSelect(upload)}
                  className="text-xs"
                >
                  {buttonLabel}
                </Button>
                {onEdit && upload.knowledgeProjectId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-200 hover:text-white"
                    onClick={() => onEdit(upload)}
                  >
                    Edit details
                  </Button>
                ) : null}
                {onRetry && upload.knowledgeProjectId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => onRetry(upload)}
                  >
                    Retry upload
                  </Button>
                ) : null}
                {onReveal && upload.knowledgeProjectId ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-300 hover:text-white"
                    onClick={() => onReveal(upload)}
                    title="Reveal in My Knowledge"
                  >
                    <FolderOpen className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Reveal in My Knowledge</span>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
