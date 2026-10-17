import React from "react";
import { buildContextCapsuleStampDataUri } from "@/lib/helix/ask-context-capsule-display";
import {
  CONVERGENCE_MATURITY_LABEL,
  CONVERGENCE_PROOF_LABEL,
  CONVERGENCE_SOURCE_LABEL,
} from "@/lib/helix/ask-convergence-display";
import type { ContextCapsuleConvergence, ContextCapsuleSummary } from "@shared/helix-context-capsule";

export type HelixAskContextCapsulePreviewModel = {
  id: string;
  loading: boolean;
  error?: string;
  summary?: ContextCapsuleSummary;
  convergence?: ContextCapsuleConvergence;
};

export type HelixAskContextCapsulePreviewProps = {
  preview: HelixAskContextCapsulePreviewModel | null;
  autoApplied?: boolean;
};

export type HelixAskReplyContextCapsuleCardProps = {
  capsule?: ContextCapsuleSummary | null;
};

export function HelixAskContextCapsulePreview({
  preview,
  autoApplied = false,
}: HelixAskContextCapsulePreviewProps) {
  if (!preview) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[10px] text-slate-300">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-950/20 px-2 py-1">
        <span className="uppercase tracking-[0.18em] text-cyan-200/90">capsule</span>
        {preview.summary ? (
          <img
            src={buildContextCapsuleStampDataUri(preview.summary.stamp)}
            alt="Context capsule fingerprint"
            className="h-7 w-32 rounded border border-cyan-300/40 bg-cyan-950/30 object-fill"
            style={{ imageRendering: "pixelated" }}
            loading="lazy"
          />
        ) : (
          <span className="rounded border border-cyan-300/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">
            visual key detected
          </span>
        )}
        {preview.loading ? (
          <span className="text-cyan-100/80">loading...</span>
        ) : preview.error ? (
          <span className="text-rose-200/90">unavailable</span>
        ) : preview.convergence ? (
          <span className="text-cyan-100/85">
            {CONVERGENCE_SOURCE_LABEL[preview.convergence.source]} /{" "}
            {CONVERGENCE_PROOF_LABEL[preview.convergence.proofPosture]} /{" "}
            {CONVERGENCE_MATURITY_LABEL[preview.convergence.maturity]}
          </span>
        ) : null}
        {autoApplied ? (
          <span className="rounded border border-emerald-300/45 bg-emerald-400/12 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-100">
            auto-applied
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function HelixAskReplyContextCapsuleCard({ capsule }: HelixAskReplyContextCapsuleCardProps) {
  if (!capsule) return null;

  return (
    <div className="mb-2 w-full rounded-lg border border-cyan-400/20 bg-cyan-950/20 px-3 py-2 text-left text-xs text-cyan-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Context capsule</p>
          <img
            src={buildContextCapsuleStampDataUri(capsule.stamp)}
            alt="Context capsule fingerprint"
            className="mt-1 h-10 w-44 rounded border border-cyan-300/40 bg-cyan-950/30 object-fill"
            style={{ imageRendering: "pixelated" }}
            loading="lazy"
          />
        </div>
        <span className="shrink-0 rounded border border-cyan-300/35 bg-cyan-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
          auto
        </span>
      </div>
    </div>
  );
}
