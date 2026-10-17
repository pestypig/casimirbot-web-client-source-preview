import React, { type ReactNode } from "react";
import { renderToString as renderKatexToString } from "katex";
import "katex/dist/katex.min.css";

import {
  isLikelyCodeStyleMathToken,
  splitHelixAskInlineCodeTextSegments,
  tokenizeHelixAskMathTokens,
} from "@/lib/helix/ask-answer-rendering";

import { HelixAskInlineCodeSurface } from "./HelixAskInlineCodeSurface";
import { HelixAskMathHtmlSurface } from "./HelixAskMathHtmlSurface";

export type HelixAskRenderedContentSurfaceProps = {
  content: unknown;
  renderTextWithPathLinks: (text: string, keyPrefix: string) => ReactNode;
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function HelixAskRenderedContentSurface({
  content,
  renderTextWithPathLinks,
}: HelixAskRenderedContentSurfaceProps) {
  const text = coerceText(content);
  if (!text) return null;

  const renderMathAwareText = (segment: string, keyPrefix: string): ReactNode => {
    const mathTokens = tokenizeHelixAskMathTokens(segment);
    if (mathTokens.length === 0) return null;
    if (mathTokens.length === 1 && mathTokens[0]?.kind === "text") {
      return renderTextWithPathLinks(mathTokens[0].text, `${keyPrefix}-plain`);
    }
    const segmentParts: ReactNode[] = [];
    mathTokens.forEach((token, index) => {
      if (token.kind === "text") {
        segmentParts.push(renderTextWithPathLinks(token.text, `${keyPrefix}-text-${index}`));
        return;
      }
      if (isLikelyCodeStyleMathToken(token)) {
        segmentParts.push(
          <HelixAskInlineCodeSurface key={`${keyPrefix}-math-code-${index}`}>
            {token.text}
          </HelixAskInlineCodeSurface>,
        );
        return;
      }
      try {
        const katexHtml = renderKatexToString(token.text, {
          displayMode: token.displayMode,
          strict: "ignore",
          throwOnError: false,
        });
        segmentParts.push(
          <HelixAskMathHtmlSurface
            key={`${keyPrefix}-math-${index}`}
            html={katexHtml}
            displayMode={token.displayMode}
          />,
        );
      } catch {
        segmentParts.push(`${token.openDelimiter}${token.text}${token.closeDelimiter}`);
      }
    });
    return segmentParts.length ? segmentParts : segment;
  };

  const inlineCodeSegments = splitHelixAskInlineCodeTextSegments(text);
  if (inlineCodeSegments.length === 1 && inlineCodeSegments[0]?.kind === "text") {
    return <>{renderMathAwareText(inlineCodeSegments[0].text, "plain")}</>;
  }
  const parts: ReactNode[] = [];
  inlineCodeSegments.forEach((segment, index) => {
    if (segment.kind === "text") {
      parts.push(renderMathAwareText(segment.text, `text-${index}`));
      return;
    }
    parts.push(
      <HelixAskInlineCodeSurface key={`inline-code-${segment.start}`}>
        {segment.text}
      </HelixAskInlineCodeSurface>,
    );
  });
  return <>{parts.length ? parts : text}</>;
}
