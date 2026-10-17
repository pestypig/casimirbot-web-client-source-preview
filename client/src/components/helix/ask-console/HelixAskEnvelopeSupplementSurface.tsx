import type { ReactNode } from "react";

import type { HelixAskResponseEnvelope } from "@shared/helix-ask-envelope";

type HelixAskEnvelopeSection = NonNullable<HelixAskResponseEnvelope["sections"]>[number];

export type HelixAskEnvelopeSupplementSurfaceProps = {
  extension?: {
    available: boolean;
    open: boolean;
    body: string;
    citations: string[];
    onToggle: () => void;
  };
  detailSections: HelixAskEnvelopeSection[];
  proofSections: HelixAskEnvelopeSection[];
  expandDetails: boolean;
  renderContent: (content: unknown) => ReactNode;
  renderSections: (sections: HelixAskEnvelopeSection[], hideTitle?: string) => ReactNode;
};

export function HelixAskEnvelopeSupplementSurface({
  extension,
  detailSections,
  proofSections,
  expandDetails,
  renderContent,
  renderSections,
}: HelixAskEnvelopeSupplementSurfaceProps) {
  return (
    <>
      {extension?.available ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-envelope-supplement-surface.extension-on-toggle"
            type="button"
            className="text-[10px] uppercase tracking-[0.22em] text-slate-400 hover:text-slate-200"
            onClick={extension.onToggle}
          >
            {extension.open ? "Hide Additional Repo Context" : "Expand With Retrieved Evidence"}
          </button>
          {extension.open ? (
            <div className="mt-2 space-y-1">
              <p className="whitespace-pre-wrap leading-relaxed">{renderContent(extension.body)}</p>
              {extension.citations.length > 0 ? (
                <p className="text-[11px] text-slate-400">
                  Sources: {renderContent(extension.citations.join(", "))}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {detailSections.length > 0 ? (
        <details
          open={expandDetails}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300"
        >
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-slate-400">
            Details
          </summary>
          <div className="mt-2">{renderSections(detailSections, "Details")}</div>
        </details>
      ) : null}
      {proofSections.length > 0 ? (
        <details
          open={expandDetails}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300"
        >
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-slate-400">
            Proof
          </summary>
          <div className="mt-2">{renderSections(proofSections, "Proof")}</div>
        </details>
      ) : null}
    </>
  );
}
