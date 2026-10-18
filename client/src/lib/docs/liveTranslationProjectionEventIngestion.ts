import type { DocumentTranslationUnit } from "@shared/document-translation";
import { HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK } from "@shared/helix-live-translation-projection-target";
import {
  HELIX_ASK_LIVE_EVENT_BUS_EVENT,
  coerceHelixAskLiveEventBusPayload,
} from "@/lib/helix/liveEventsBus";
import { ingestDocumentLiveTranslationProjectionFromAskLiveEvent } from "@/lib/docs/liveTranslationProjectionRegistry";

type EventTargetLike = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type InstallDocumentLiveTranslationProjectionEventIngestionInput = {
  eventTarget: EventTargetLike;
  docPath: string;
  locale: string;
  sourceHash?: string | null;
  sourceIdentityKey?: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  projectionTarget?: string | null;
  units: DocumentTranslationUnit[];
  allowStaleDisplayText?: boolean;
};

export function installDocumentLiveTranslationProjectionEventIngestion(
  input: InstallDocumentLiveTranslationProjectionEventIngestionInput,
): () => void {
  const handleLiveTranslationProjection = (event: Event) => {
    const payload = coerceHelixAskLiveEventBusPayload((event as CustomEvent<unknown>)?.detail);
    if (!payload) return;
    ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: input.docPath,
      locale: input.locale,
      sourceHash: input.sourceHash,
      sourceIdentityKey: input.sourceIdentityKey,
      sourceTextHash: input.sourceTextHash,
      sourceTextCharCount: input.sourceTextCharCount,
      projectionTarget: input.projectionTarget ?? HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      units: input.units,
      allowStaleDisplayText: input.allowStaleDisplayText,
      eventPayload: payload,
    });
  };
  input.eventTarget.addEventListener(
    HELIX_ASK_LIVE_EVENT_BUS_EVENT,
    handleLiveTranslationProjection as EventListener,
  );
  return () => {
    input.eventTarget.removeEventListener(
      HELIX_ASK_LIVE_EVENT_BUS_EVENT,
      handleLiveTranslationProjection as EventListener,
    );
  };
}
