import React from "react";
import { cn } from "@/lib/utils";

type HelixLoadingMarkProps = {
  title?: string;
  detail?: string;
  className?: string;
  compact?: boolean;
};

export const HELIX_LOADING_MARK_SRC = "/loading/helix-loading-mark.svg";

export function HelixLoadingMark({
  title = "Loading",
  detail,
  className,
  compact = false,
}: HelixLoadingMarkProps) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-full w-full items-center justify-center overflow-hidden bg-slate-950 text-slate-200",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={detail ? `${title}. ${detail}` : title}
    >
      <div
        className="absolute inset-0 bg-center bg-cover opacity-35"
        style={{ backgroundImage: `url(${HELIX_LOADING_MARK_SRC})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),rgba(2,6,23,0.88)_62%)]" />
      <div className="relative flex flex-col items-center gap-3 px-4 text-center">
        <div
          aria-hidden="true"
          className={cn(
            "animate-spin rounded-full border-2 border-slate-500/35 border-t-slate-100",
            compact ? "h-7 w-7" : "h-9 w-9",
          )}
        />
        <div className="space-y-1">
          <p className="m-0 text-sm font-medium text-slate-100">{title}</p>
          {detail ? <p className="m-0 text-xs text-slate-400">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}
