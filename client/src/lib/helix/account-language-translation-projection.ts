import { HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE } from "@shared/helix-live-translation-projection-target";
import {
  buildHelixLiveTranslationUiProjections,
  type HelixLiveTranslationTerminalAuthorityStatus,
  type HelixLiveTranslationUiProjection,
} from "@/lib/helix/live-translation-projection";
import {
  resolveHelixAccountLanguageTranslationProjectionHealth,
  type HelixAccountLanguageTranslationProjectionStatus,
} from "@/lib/helix/account-language-translation-health";

export type { HelixAccountLanguageTranslationProjectionStatus };

export type HelixAccountLanguageTranslationProjectionState = {
  key: string;
  status: HelixAccountLanguageTranslationProjectionStatus;
  displayText: string | null;
  projection: HelixLiveTranslationUiProjection | null;
  projectionTarget: "account_language";
  panelId: string | null;
  regionId: string | null;
  bbox: Record<string, unknown> | null;
  docPath: string | null;
  sourceId: string;
  sourceHash: string | null;
  sourceKind: string | null;
  sourceTextHash: string | null;
  sourceTextCharCount: number | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  chunkId: string | null;
  chunkIndex: number | null;
  dedupeKey: string | null;
  sourceEventId: string | null;
  sourceEventMs: number | null;
  observedAtMs: number | null;
  freshnessStatus: string;
  observationRef: string | null;
  receiptRef: string | null;
  laneSessionId: string | null;
  goalBindingId: string | null;
  selectedRuntimeAgentProvider: string | null;
  selectedBackendProvider: string | null;
  terminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  contextRole: "tool_evidence";
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

export type SelectHelixAccountLanguageTranslationProjectionInput = {
  states: HelixAccountLanguageTranslationProjectionState[];
  panelId?: string | null;
  regionId?: string | null;
  docPath?: string | null;
  sourceId?: string | null;
  targetLanguage?: string | null;
  accountLocale?: string | null;
};

let activeAccountLanguageTranslationProjections: HelixAccountLanguageTranslationProjectionState[] = [];
const accountLanguageTranslationProjectionListeners = new Set<() => void>();
const MAX_ACCOUNT_LANGUAGE_TRANSLATION_PROJECTIONS = 96;

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

const serializeDebugRecord = (value: Record<string, unknown> | null): string | null => {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const latestFirst = (
  left: HelixAccountLanguageTranslationProjectionState,
  right: HelixAccountLanguageTranslationProjectionState,
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

const hasDisplayableTranslatedText = (
  state: HelixAccountLanguageTranslationProjectionState,
): boolean => state.status === "ready" && typeof state.displayText === "string" && state.displayText.trim().length > 0;

const displayableReadyFirst = (
  left: HelixAccountLanguageTranslationProjectionState,
  right: HelixAccountLanguageTranslationProjectionState,
): number => {
  const leftDisplayable = hasDisplayableTranslatedText(left);
  const rightDisplayable = hasDisplayableTranslatedText(right);
  if (leftDisplayable !== rightDisplayable) {
    return leftDisplayable ? -1 : 1;
  }
  return latestFirst(left, right);
};

const accountLanguageRegionFirst = (
  left: HelixAccountLanguageTranslationProjectionState,
  right: HelixAccountLanguageTranslationProjectionState,
): number => {
  const panelDelta = (left.panelId ?? "").localeCompare(right.panelId ?? "");
  if (panelDelta !== 0) return panelDelta;
  const regionDelta = (left.regionId ?? "").localeCompare(right.regionId ?? "");
  if (regionDelta !== 0) return regionDelta;
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  if (sourceDelta !== 0) return sourceDelta;
  return latestFirst(left, right);
};

const projectionEvidenceKey = (
  state: HelixAccountLanguageTranslationProjectionState,
): string => state.receiptRef || state.observationRef || state.key;

const statusFromProjection = (
  projection: HelixLiveTranslationUiProjection,
): HelixAccountLanguageTranslationProjectionStatus => {
  return resolveHelixAccountLanguageTranslationProjectionHealth({
    projectionStatus: projection.status,
    translatedText: projection.translatedText,
    terminalAuthorityStatus: projection.terminalAuthorityStatus,
    sessionDebugPhase: projection.sessionDebugPhase,
    sessionObservationStatus: projection.sessionObservationStatus,
    laneSessionId: projection.laneSessionId,
  });
};

const stateFromProjection = (
  projection: HelixLiveTranslationUiProjection,
): HelixAccountLanguageTranslationProjectionState => {
  const status = statusFromProjection(projection);
  return {
    key: projection.projectionKey ?? projection.key,
    status,
    displayText: status === "ready" ? projection.translatedText : null,
    projection,
    projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE,
    panelId: projection.panelId ?? null,
    regionId: projection.regionId ?? null,
    bbox: projection.bbox ?? null,
    docPath: projection.docPath ?? null,
    sourceId: projection.sourceId,
    sourceHash: projection.sourceHash ?? null,
    sourceKind: projection.sourceKind,
    sourceTextHash: projection.sourceTextHash ?? null,
    sourceTextCharCount: projection.sourceTextCharCount ?? null,
    accountLocale: projection.accountLocale,
    targetLanguage: projection.targetLanguage,
    chunkId: projection.chunkId,
    chunkIndex: projection.chunkIndex,
    dedupeKey: projection.dedupeKey,
    sourceEventId: projection.sourceEventId,
    sourceEventMs: projection.sourceEventMs,
    observedAtMs: projection.observedAtMs,
    freshnessStatus: projection.freshnessStatus,
    observationRef: projection.observationRef,
    receiptRef: projection.receiptRef,
    laneSessionId: projection.laneSessionId,
    goalBindingId: projection.goalBindingId,
    selectedRuntimeAgentProvider: projection.selectedRuntimeAgentProvider ?? null,
    selectedBackendProvider: projection.selectedBackendProvider,
    terminalAuthorityStatus: projection.terminalAuthorityStatus,
    contextRole: "tool_evidence",
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
};

export function buildHelixAccountLanguageTranslationProjections(
  payload: unknown,
): HelixAccountLanguageTranslationProjectionState[] {
  return buildHelixLiveTranslationUiProjections(payload)
    .filter((projection) =>
      projection.projectionTarget === HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE
    )
    .map(stateFromProjection)
    .sort(accountLanguageRegionFirst);
}

export function publishHelixAccountLanguageTranslationProjectionsFromPayload(
  payload: unknown,
): HelixAccountLanguageTranslationProjectionState[] {
  const projections = buildHelixAccountLanguageTranslationProjections(payload);
  if (projections.length > 0) {
    const merged = new Map<string, HelixAccountLanguageTranslationProjectionState>();
    for (const existing of activeAccountLanguageTranslationProjections) {
      merged.set(projectionEvidenceKey(existing), existing);
    }
    for (const projection of projections) {
      merged.set(projectionEvidenceKey(projection), projection);
    }
    activeAccountLanguageTranslationProjections = Array.from(merged.values())
      .sort(accountLanguageRegionFirst)
      .slice(0, MAX_ACCOUNT_LANGUAGE_TRANSLATION_PROJECTIONS);
    accountLanguageTranslationProjectionListeners.forEach((listener) => listener());
  }
  return projections;
}

export function readHelixAccountLanguageTranslationProjectionContext(): HelixAccountLanguageTranslationProjectionState[] {
  return activeAccountLanguageTranslationProjections;
}

export function subscribeHelixAccountLanguageTranslationProjectionContext(
  listener: () => void,
): () => void {
  accountLanguageTranslationProjectionListeners.add(listener);
  return () => {
    accountLanguageTranslationProjectionListeners.delete(listener);
  };
}

export function clearHelixAccountLanguageTranslationProjectionContext(): void {
  activeAccountLanguageTranslationProjections = [];
  accountLanguageTranslationProjectionListeners.forEach((listener) => listener());
}

export function selectHelixAccountLanguageTranslationProjection(
  input: SelectHelixAccountLanguageTranslationProjectionInput,
): HelixAccountLanguageTranslationProjectionState {
  const panelId = readString(input.panelId);
  const regionId = readString(input.regionId);
  const docPath = readString(input.docPath);
  const sourceId = readString(input.sourceId);
  const targetLanguage = readString(input.targetLanguage) || null;
  const accountLocale = readString(input.accountLocale) || null;
  const selected = input.states
    .filter((state) => !panelId || state.panelId === panelId)
    .filter((state) => !regionId || state.regionId === regionId)
    .filter((state) => !docPath || state.docPath === docPath)
    .filter((state) => !sourceId || state.sourceId === sourceId)
    .filter((state) => localeMatches(state.targetLanguage, targetLanguage))
    .filter((state) => localeMatches(state.accountLocale, accountLocale))
    .sort(displayableReadyFirst)[0];
  if (selected) return selected;
  return {
    key: "account_language_translation_projection:empty",
    status: "empty",
    displayText: null,
    projection: null,
    projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE,
    panelId: panelId || null,
    regionId: regionId || null,
    bbox: null,
    docPath: docPath || null,
    sourceId: sourceId || "unknown_source",
    sourceHash: null,
    sourceKind: null,
    sourceTextHash: null,
    sourceTextCharCount: null,
    accountLocale,
    targetLanguage,
    chunkId: null,
    chunkIndex: null,
    dedupeKey: null,
    sourceEventId: null,
    sourceEventMs: null,
    observedAtMs: null,
    freshnessStatus: "unknown",
    observationRef: null,
    receiptRef: null,
    laneSessionId: null,
    goalBindingId: null,
    selectedRuntimeAgentProvider: null,
    selectedBackendProvider: null,
    terminalAuthorityStatus: "not_terminal_authority",
    contextRole: "tool_evidence",
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
}

export function buildHelixAccountLanguageTranslationDataAttributes(
  state: HelixAccountLanguageTranslationProjectionState,
): Record<string, string> {
  return Object.fromEntries(
    [
      ["data-helix-account-language-translation-role", "governed-ui-region-projection"],
      ["data-helix-account-language-translation-authority-policy", "projection_only_not_answer_authority"],
      ["data-helix-account-language-translation-terminal-authority-owner", "helix"],
      ["data-helix-account-language-translation-status", state.status],
      ["data-helix-account-language-translation-projection-target", state.projectionTarget],
      ["data-helix-account-language-translation-projection-key", state.key],
      ["data-helix-account-language-translation-panel-id", state.panelId],
      ["data-helix-account-language-translation-region-id", state.regionId],
      [
        "data-helix-account-language-translation-bbox",
        serializeDebugRecord(state.bbox),
      ],
      ["data-helix-account-language-translation-doc-path", state.docPath],
      ["data-helix-account-language-translation-source-id", state.sourceId],
      ["data-helix-account-language-translation-source-hash", state.sourceHash],
      ["data-helix-account-language-translation-source-kind", state.sourceKind],
      ["data-helix-account-language-translation-source-text-hash", state.sourceTextHash],
      [
        "data-helix-account-language-translation-source-text-char-count",
        typeof state.sourceTextCharCount === "number" ? String(state.sourceTextCharCount) : null,
      ],
      ["data-helix-account-language-translation-account-locale", state.accountLocale],
      ["data-helix-account-language-translation-target-language", state.targetLanguage],
      ["data-helix-account-language-translation-chunk-id", state.chunkId],
      ["data-helix-account-language-translation-chunk-index", typeof state.chunkIndex === "number" ? String(state.chunkIndex) : null],
      ["data-helix-account-language-translation-dedupe-key", state.dedupeKey],
      ["data-helix-account-language-translation-source-event-id", state.sourceEventId],
      ["data-helix-account-language-translation-source-event-ms", typeof state.sourceEventMs === "number" ? String(state.sourceEventMs) : null],
      ["data-helix-account-language-translation-observed-at-ms", typeof state.observedAtMs === "number" ? String(state.observedAtMs) : null],
      ["data-helix-account-language-translation-freshness-status", state.freshnessStatus],
      ["data-helix-account-language-translation-observation-ref", state.observationRef],
      ["data-helix-account-language-translation-receipt-ref", state.receiptRef],
      ["data-helix-account-language-translation-lane-session-id", state.laneSessionId],
      ["data-helix-account-language-translation-goal-binding-id", state.goalBindingId],
      ["data-helix-account-language-translation-selected-runtime-agent-provider", state.selectedRuntimeAgentProvider],
      ["data-helix-account-language-translation-selected-backend-provider", state.selectedBackendProvider],
      ["data-helix-account-language-translation-terminal-authority-status", state.terminalAuthorityStatus],
      ["data-helix-account-language-translation-context-role", state.contextRole],
      ["data-helix-account-language-translation-answer-authority", "false"],
      ["data-helix-account-language-translation-terminal-eligible", "false"],
      ["data-helix-account-language-translation-assistant-answer", "false"],
      ["data-helix-account-language-translation-raw-content-included", "false"],
      ["data-helix-account-language-translation-reentry-required", state.observationRef || state.receiptRef ? "true" : null],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}
