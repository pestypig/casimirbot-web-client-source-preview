import {
  buildHelixLiveTranslationUiProjections,
  type HelixLiveTranslationTerminalAuthorityStatus,
  type HelixLiveTranslationUiProjection,
} from "@/lib/helix/live-translation-projection";

export type HelixVisibleTranslationProjectionState = {
  key: string;
  status: HelixLiveTranslationUiProjection["status"];
  displayText: string | null;
  projection: HelixLiveTranslationUiProjection;
  projectionTarget: string;
  sourceId: string;
  panelId: string | null;
  regionId: string | null;
  docPath: string | null;
  sourceHash: string | null;
  sourceKind: string | null;
  sourceTextHash: string | null;
  sourceTextCharCount: number | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  chunkId: string | null;
  chunkIndex: number | null;
  bbox: Record<string, unknown> | null;
  dedupeKey: string | null;
  sourceEventId: string | null;
  sourceEventMs: number | null;
  observedAtMs: number | null;
  freshnessStatus: string;
  observationRef: string | null;
  receiptRef: string | null;
  selectedRuntimeAgentProvider: string | null;
  selectedBackendProvider: string | null;
  terminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  contextRole: "tool_evidence";
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

export type SelectHelixVisibleTranslationProjectionInput = {
  states: HelixVisibleTranslationProjectionState[];
  projectionTarget?: string | null;
  sourceId?: string | null;
  regionId?: string | null;
  docPath?: string | null;
  chunkId?: string | null;
  targetLanguage?: string | null;
  accountLocale?: string | null;
};

let activeVisibleTranslationProjections: HelixVisibleTranslationProjectionState[] = [];
const visibleTranslationProjectionListeners = new Set<() => void>();
const MAX_VISIBLE_TRANSLATION_PROJECTIONS = 128;

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const lowerText = (value: unknown): string =>
  readString(value).toLowerCase();

const localeMatches = (candidate: string | null, locale: string | null): boolean => {
  const normalizedCandidate = lowerText(candidate);
  const normalizedLocale = lowerText(locale);
  return !normalizedCandidate ||
    !normalizedLocale ||
    normalizedCandidate === normalizedLocale ||
    normalizedCandidate.startsWith(`${normalizedLocale}-`) ||
    normalizedLocale.startsWith(`${normalizedCandidate}-`);
};

const latestFirst = (
  left: HelixVisibleTranslationProjectionState,
  right: HelixVisibleTranslationProjectionState,
): number => {
  if (left.sourceEventMs != null && right.sourceEventMs != null) {
    const sourceEventDelta = right.sourceEventMs - left.sourceEventMs;
    if (sourceEventDelta !== 0) return sourceEventDelta;
  }
  const observedDelta = (right.observedAtMs ?? Number.MIN_SAFE_INTEGER) -
    (left.observedAtMs ?? Number.MIN_SAFE_INTEGER);
  if (observedDelta !== 0) return observedDelta;
  const sourceEventDelta = (right.sourceEventMs ?? Number.MIN_SAFE_INTEGER) -
    (left.sourceEventMs ?? Number.MIN_SAFE_INTEGER);
  if (sourceEventDelta !== 0) return sourceEventDelta;
  const chunkDelta = (right.chunkIndex ?? Number.MIN_SAFE_INTEGER) -
    (left.chunkIndex ?? Number.MIN_SAFE_INTEGER);
  if (chunkDelta !== 0) return chunkDelta;
  return (right.chunkId ?? "").localeCompare(left.chunkId ?? "");
};

const visibleProjectionOrder = (
  left: HelixVisibleTranslationProjectionState,
  right: HelixVisibleTranslationProjectionState,
): number => {
  const targetDelta = left.projectionTarget.localeCompare(right.projectionTarget);
  if (targetDelta !== 0) return targetDelta;
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  if (sourceDelta !== 0) return sourceDelta;
  const leftIndex = left.chunkIndex ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.chunkIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return latestFirst(left, right);
};

const hasDisplayableTranslatedText = (
  state: HelixVisibleTranslationProjectionState,
): boolean => state.status === "projected" && typeof state.displayText === "string" && state.displayText.trim().length > 0;

const displayableReadyFirst = (
  left: HelixVisibleTranslationProjectionState,
  right: HelixVisibleTranslationProjectionState,
): number => {
  const leftDisplayable = hasDisplayableTranslatedText(left);
  const rightDisplayable = hasDisplayableTranslatedText(right);
  if (leftDisplayable !== rightDisplayable) {
    return leftDisplayable ? -1 : 1;
  }
  return latestFirst(left, right);
};

const projectionEvidenceKey = (
  state: HelixVisibleTranslationProjectionState,
): string => state.receiptRef || state.observationRef || state.key;

const stateFromProjection = (
  projection: HelixLiveTranslationUiProjection,
): HelixVisibleTranslationProjectionState => ({
  key: projection.projectionKey ?? projection.key,
  status: projection.status,
  displayText: projection.status === "projected" && readString(projection.translatedText)
    ? projection.translatedText
    : null,
  projection,
  projectionTarget: projection.projectionTarget,
  sourceId: projection.sourceId,
  panelId: projection.panelId ?? null,
  regionId: projection.regionId ?? null,
  docPath: projection.docPath ?? null,
  sourceHash: projection.sourceHash ?? null,
  sourceKind: projection.sourceKind,
  sourceTextHash: projection.sourceTextHash ?? null,
  sourceTextCharCount: projection.sourceTextCharCount ?? null,
  accountLocale: projection.accountLocale,
  targetLanguage: projection.targetLanguage,
  chunkId: projection.chunkId,
  chunkIndex: projection.chunkIndex,
  bbox: projection.bbox ?? null,
  dedupeKey: projection.dedupeKey,
  sourceEventId: projection.sourceEventId,
  sourceEventMs: projection.sourceEventMs,
  observedAtMs: projection.observedAtMs,
  freshnessStatus: projection.freshnessStatus,
  observationRef: projection.observationRef,
  receiptRef: projection.receiptRef,
  selectedRuntimeAgentProvider: projection.selectedRuntimeAgentProvider ?? null,
  selectedBackendProvider: projection.selectedBackendProvider,
  terminalAuthorityStatus: projection.terminalAuthorityStatus,
  contextRole: "tool_evidence",
  answerAuthority: false,
  terminalEligible: false,
  assistantAnswer: false,
  rawContentIncluded: false,
});

export function buildHelixVisibleTranslationProjections(
  payload: unknown,
): HelixVisibleTranslationProjectionState[] {
  return buildHelixLiveTranslationUiProjections(payload)
    .map(stateFromProjection)
    .sort(latestFirst);
}

export function publishHelixVisibleTranslationProjectionsFromPayload(
  payload: unknown,
): HelixVisibleTranslationProjectionState[] {
  const projections = buildHelixVisibleTranslationProjections(payload);
  if (projections.length > 0) {
    const merged = new Map<string, HelixVisibleTranslationProjectionState>();
    for (const existing of activeVisibleTranslationProjections) {
      merged.set(projectionEvidenceKey(existing), existing);
    }
    for (const projection of projections) {
      merged.set(projectionEvidenceKey(projection), projection);
    }
    activeVisibleTranslationProjections = Array.from(merged.values())
      .sort(visibleProjectionOrder)
      .slice(0, MAX_VISIBLE_TRANSLATION_PROJECTIONS);
    visibleTranslationProjectionListeners.forEach((listener) => listener());
  }
  return projections;
}

export function readHelixVisibleTranslationProjectionContext(): HelixVisibleTranslationProjectionState[] {
  return activeVisibleTranslationProjections;
}

export function subscribeHelixVisibleTranslationProjectionContext(
  listener: () => void,
): () => void {
  visibleTranslationProjectionListeners.add(listener);
  return () => {
    visibleTranslationProjectionListeners.delete(listener);
  };
}

export function clearHelixVisibleTranslationProjectionContext(): void {
  activeVisibleTranslationProjections = [];
  visibleTranslationProjectionListeners.forEach((listener) => listener());
}

export function selectHelixVisibleTranslationProjection(
  input: SelectHelixVisibleTranslationProjectionInput,
): HelixVisibleTranslationProjectionState | null {
  const projectionTarget = readString(input.projectionTarget);
  const sourceId = readString(input.sourceId);
  const regionId = readString(input.regionId);
  const docPath = readString(input.docPath);
  const chunkId = readString(input.chunkId);
  const targetLanguage = readString(input.targetLanguage) || null;
  const accountLocale = readString(input.accountLocale) || null;
  return input.states
    .filter((state) => !projectionTarget || state.projectionTarget === projectionTarget)
    .filter((state) => !sourceId || state.sourceId === sourceId)
    .filter((state) => !regionId || state.regionId === regionId)
    .filter((state) => !docPath || state.docPath === docPath)
    .filter((state) => !chunkId || state.chunkId === chunkId)
    .filter((state) => localeMatches(state.targetLanguage, targetLanguage))
    .filter((state) => localeMatches(state.accountLocale, accountLocale))
    .sort(displayableReadyFirst)[0] ?? null;
}

export function buildHelixVisibleTranslationDataAttributes(
  state: HelixVisibleTranslationProjectionState,
): Record<string, string> {
  return Object.fromEntries(
    [
      ["data-helix-visible-translation-role", "governed-visible-text-projection"],
      ["data-helix-visible-translation-authority-policy", "projection_only_not_answer_authority"],
      ["data-helix-visible-translation-terminal-authority-owner", "helix"],
      ["data-helix-visible-translation-status", state.status],
      ["data-helix-visible-translation-projection-key", state.key],
      ["data-helix-visible-translation-projection-target", state.projectionTarget],
      ["data-helix-visible-translation-panel-id", state.panelId],
      ["data-helix-visible-translation-region-id", state.regionId],
      ["data-helix-visible-translation-doc-path", state.docPath],
      ["data-helix-visible-translation-source-id", state.sourceId],
      ["data-helix-visible-translation-source-hash", state.sourceHash],
      ["data-helix-visible-translation-source-kind", state.sourceKind],
      ["data-helix-visible-translation-source-text-hash", state.sourceTextHash],
      [
        "data-helix-visible-translation-source-text-char-count",
        typeof state.sourceTextCharCount === "number" ? String(state.sourceTextCharCount) : null,
      ],
      ["data-helix-visible-translation-account-locale", state.accountLocale],
      ["data-helix-visible-translation-target-language", state.targetLanguage],
      ["data-helix-visible-translation-chunk-id", state.chunkId],
      ["data-helix-visible-translation-chunk-index", typeof state.chunkIndex === "number" ? String(state.chunkIndex) : null],
      ["data-helix-visible-translation-bbox", state.bbox ? JSON.stringify(state.bbox) : null],
      ["data-helix-visible-translation-dedupe-key", state.dedupeKey],
      ["data-helix-visible-translation-source-event-id", state.sourceEventId],
      ["data-helix-visible-translation-source-event-ms", typeof state.sourceEventMs === "number" ? String(state.sourceEventMs) : null],
      ["data-helix-visible-translation-observed-at-ms", typeof state.observedAtMs === "number" ? String(state.observedAtMs) : null],
      ["data-helix-visible-translation-freshness-status", state.freshnessStatus],
      ["data-helix-visible-translation-observation-ref", state.observationRef],
      ["data-helix-visible-translation-receipt-ref", state.receiptRef],
      ["data-helix-visible-translation-selected-runtime-agent-provider", state.selectedRuntimeAgentProvider],
      ["data-helix-visible-translation-selected-backend-provider", state.selectedBackendProvider],
      ["data-helix-visible-translation-terminal-authority-status", state.terminalAuthorityStatus],
      ["data-helix-visible-translation-context-role", state.contextRole],
      ["data-helix-visible-translation-answer-authority", "false"],
      ["data-helix-visible-translation-terminal-eligible", "false"],
      ["data-helix-visible-translation-assistant-answer", "false"],
      ["data-helix-visible-translation-raw-content-included", "false"],
      ["data-helix-visible-translation-reentry-required", state.observationRef || state.receiptRef ? "true" : null],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}
