import { useCallback, type ReactNode } from "react";

import {
  HelixAskLegacyAnswerEnvelopeSlot,
  type HelixAskLegacyAnswerEnvelopeSlotProps,
} from "./HelixAskLegacyAnswerEnvelopeSlot";
import { HelixAskPathLinkedTextSurface } from "./HelixAskPathLinkedTextSurface";
import { HelixAskRenderedContentSurface } from "./HelixAskRenderedContentSurface";
import type { ReadAloudRegionTrafficState } from "@/lib/helix/ask-read-aloud-display";

type HelixAskLegacyPlainAnswerEnvelopeRenderInput = Omit<
  Extract<HelixAskLegacyAnswerEnvelopeSlotProps, { kind: "plain" }>,
  "kind"
>;

type HelixAskLegacyResponseEnvelopeRenderInput = Omit<
  Extract<HelixAskLegacyAnswerEnvelopeSlotProps, { kind: "envelope" }>,
  "kind"
>;

export type HelixAskLegacyContentRenderersOptions = {
  resolvePanelIdForPath: (pathText: string) => string | null;
  onOpenPanel: (panelId: string) => void;
};

export type HelixAskLegacyContentRenderers = {
  renderTextWithPathLinks: (text: string, keyPrefix: string) => ReactNode;
  renderContent: (content: unknown) => ReactNode;
  renderFinalAnswerContent: (
    content: unknown,
    readAloudTraffic?: ReadAloudRegionTrafficState | null,
  ) => ReactNode;
  renderPlainAnswerEnvelope: (input: HelixAskLegacyPlainAnswerEnvelopeRenderInput) => ReactNode;
  renderResponseEnvelope: (input: HelixAskLegacyResponseEnvelopeRenderInput) => ReactNode;
};

function coerceHelixAskLegacyContentText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function useHelixAskLegacyContentRenderers({
  resolvePanelIdForPath,
  onOpenPanel,
}: HelixAskLegacyContentRenderersOptions): HelixAskLegacyContentRenderers {
  const renderTextWithPathLinks = useCallback(
    (text: string, keyPrefix: string): ReactNode => {
      return (
        <HelixAskPathLinkedTextSurface
          text={text}
          keyPrefix={keyPrefix}
          resolvePanelId={resolvePanelIdForPath}
          onOpenPanel={onOpenPanel}
        />
      );
    },
    [onOpenPanel, resolvePanelIdForPath],
  );

  const renderContent = useCallback(
    (content: unknown): ReactNode => {
      const text = coerceHelixAskLegacyContentText(content);
      if (!text) return null;
      return (
        <HelixAskRenderedContentSurface
          content={text}
          renderTextWithPathLinks={renderTextWithPathLinks}
        />
      );
    },
    [renderTextWithPathLinks],
  );

  const renderFinalAnswerContent = useCallback(
    (content: unknown, readAloudTraffic?: ReadAloudRegionTrafficState | null): ReactNode => {
      const text = coerceHelixAskLegacyContentText(content);
      if (!text) return null;
      return (
        <HelixAskLegacyAnswerEnvelopeSlot
          kind="final"
          finalAnswer={{
            text,
            renderContent,
            readAloudTraffic,
          }}
        />
      );
    },
    [renderContent],
  );

  const renderPlainAnswerEnvelope = useCallback(
    (input: HelixAskLegacyPlainAnswerEnvelopeRenderInput): ReactNode => (
      <HelixAskLegacyAnswerEnvelopeSlot
        kind="plain"
        content={input.content}
        calculatorLaunch={input.calculatorLaunch}
      />
    ),
    [],
  );

  const renderResponseEnvelope = useCallback(
    (input: HelixAskLegacyResponseEnvelopeRenderInput): ReactNode => (
      <HelixAskLegacyAnswerEnvelopeSlot
        kind="envelope"
        finalAnswer={input.finalAnswer}
        calculatorLaunch={input.calculatorLaunch}
        supplement={input.supplement}
      />
    ),
    [],
  );

  return {
    renderTextWithPathLinks,
    renderContent,
    renderFinalAnswerContent,
    renderPlainAnswerEnvelope,
    renderResponseEnvelope,
  };
}
