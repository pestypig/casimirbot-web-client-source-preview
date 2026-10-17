import React, { type ReactNode } from "react";

import {
  splitHelixAskExternalLinkTextSegments,
  splitHelixAskTextPathSegments,
} from "@/lib/helix/ask-answer-rendering";

export type HelixAskPathLinkedTextSurfaceProps = {
  text: string;
  keyPrefix: string;
  resolvePanelId: (pathText: string) => string | null;
  onOpenPanel: (panelId: string) => void;
};

export function HelixAskPathLinkedTextSurface({
  text,
  keyPrefix,
  resolvePanelId,
  onOpenPanel,
}: HelixAskPathLinkedTextSurfaceProps) {
  const parts: ReactNode[] = [];
  for (const linkSegment of splitHelixAskExternalLinkTextSegments(text)) {
    if (linkSegment.kind === "external_link") {
      parts.push(
        <a
          key={`${keyPrefix}-external-${linkSegment.start}`}
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
          href={linkSegment.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {linkSegment.text}
        </a>,
      );
      continue;
    }
    for (const segment of splitHelixAskTextPathSegments(linkSegment.text)) {
      if (segment.kind === "text") {
        parts.push(segment.text);
        continue;
      }
      const panelId = resolvePanelId(segment.text);
      if (!panelId) {
        parts.push(segment.text);
        continue;
      }
      parts.push(
        <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-path-linked-text-surface.on-open-panel-panel-id"
          key={`${keyPrefix}-${segment.text}-${segment.start}`}
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
          onClick={() => onOpenPanel(panelId)}
          type="button"
        >
          {segment.text}
        </button>,
      );
    }
  }
  return <>{parts.length ? parts : text}</>;
}
