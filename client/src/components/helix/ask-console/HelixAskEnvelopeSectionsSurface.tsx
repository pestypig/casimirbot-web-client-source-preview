import type { ReactNode } from "react";

import type { HelixAskResponseEnvelope } from "@shared/helix-ask-envelope";

type HelixAskEnvelopeSection = NonNullable<HelixAskResponseEnvelope["sections"]>[number];

export type HelixAskEnvelopeSectionsSurfaceProps = {
  sections: HelixAskEnvelopeSection[] | null | undefined;
  hideTitle?: string;
  renderContent: (content: unknown) => ReactNode;
  normalizeCitations: (citations: HelixAskEnvelopeSection["citations"]) => string[];
};

function coerceEnvelopeSectionText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function HelixAskEnvelopeSectionsSurface({
  sections,
  hideTitle,
  renderContent,
  normalizeCitations,
}: HelixAskEnvelopeSectionsSurfaceProps) {
  if (!sections || sections.length === 0) return null;
  const hidden = hideTitle?.toLowerCase();
  return (
    <div className="space-y-2">
      {sections.map((section, index) => {
        const title = coerceEnvelopeSectionText(section.title);
        const citations = normalizeCitations(section.citations);
        return (
          <div key={`${title}-${index}`} className="text-sm text-slate-100">
            {title && title.toLowerCase() !== hidden ? (
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{title}</p>
            ) : null}
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {renderContent(coerceEnvelopeSectionText(section.body))}
            </p>
            {section.layer === "proof" && citations.length > 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Sources: {renderContent(citations.join(", "))}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
