import type { DocumentTranslationUnit } from "@shared/document-translation";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
  normalizeHelixLiveTranslationProjectionTarget,
} from "@shared/helix-live-translation-projection-target";
import {
  normalizeHelixLiveTranslationSourceIdentityKey,
  normalizeHelixLiveTranslationSourceKind,
} from "@shared/helix-live-translation-source-kind";
import type { HelixAskLiveEventBusPayload } from "@/lib/helix/liveEventsBus";
import {
  buildDocumentInlineTranslationProjectionKey,
  buildDocumentInlineTranslationSuppressedProjectionKey,
  buildDocumentLiveTranslationInlineStates,
  mergeDocumentLiveTranslationInlineStates,
  sameDocumentInlineTranslationRenderState,
  type DocumentInlineTranslationRenderState,
} from "@/lib/docs/liveTranslationInlineProjection";
import type { HelixLiveTranslationTerminalAuthorityStatus } from "@/lib/helix/live-translation-projection";
import { documentMarkdownSourceId } from "@/lib/docs/documentTranslationClient";

export type DocumentLiveTranslationProjectionRegistryKey = {
  docPath: string;
  locale: string;
  sourceHash?: string | null;
  sourceIdentityKey?: string | null;
  projectionTarget?: string | null;
};

export type IngestDocumentLiveTranslationProjectionInput = DocumentLiveTranslationProjectionRegistryKey & {
  payload: unknown;
  units: DocumentTranslationUnit[];
  targetLanguage?: string | null;
  sourceIdentityKey?: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  allowStaleDisplayText?: boolean;
};

export type IngestDocumentLiveTranslationProjectionLiveEventInput = DocumentLiveTranslationProjectionRegistryKey & {
  eventPayload: HelixAskLiveEventBusPayload;
  units: DocumentTranslationUnit[];
  sourceIdentityKey?: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  allowStaleDisplayText?: boolean;
};

export type DocumentLiveTranslationProjectionSnapshot = {
  version: number;
  translations: Record<string, DocumentInlineTranslationRenderState>;
  laneSessions: Record<string, DocumentLiveTranslationLaneSessionState>;
  mailLoops: Record<string, DocumentLiveTranslationMailLoopState>;
  goalBindings: Record<string, DocumentLiveTranslationGoalBindingState>;
};

export type DocumentLiveTranslationLaneSessionState = {
  laneSessionId: string;
  laneId: string;
  lifecycleAction: string | null;
  lifecycleReason: string | null;
  sessionDebugPhase: string | null;
  sessionObservationStatus: string | null;
  permissionProfile: string | null;
  sessionStatus: string;
  sessionHealth: string;
  sourceId: string | null;
  sourceHash?: string | null;
  sourceKind: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  projectionTarget: string | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  selectedRuntimeAgentProvider?: string | null;
  selectedBackendProvider: string | null;
  latestChunkId: string | null;
  latestChunkIndex: number | null;
  latestDedupeKey: string | null;
  latestSourceEventId: string | null;
  latestSourceEventMs: number | null;
  latestObservedAtMs: number | null;
  latestFreshnessStatus: string | null;
  latestEventId?: string | null;
  sessionControlKey?: string | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  laneSessionSourceBindingKey?: string | null;
  laneSessionSourceIdentityKey?: string | null;
  latestObservationKey?: string | null;
  hasObservation?: boolean;
  terminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  lastObservationRef: string | null;
  lastReceiptRef: string | null;
  updatedAtMs: number | null;
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

export type DocumentLiveTranslationMailLoopState = {
  mailLoopId: string;
  laneSessionId: string | null;
  observationLaneSessionId: string | null;
  laneId: string;
  stagePlayMailId: string | null;
  stagePlayMailDeliveryStatus: string | null;
  previousStagePlayMailId: string | null;
  stagePlayWakeExpected: boolean;
  stagePlayWakeKind: "mailbox_wake" | "none";
  mailboxWakeExpected: boolean;
  decisionWakeExpected: false;
  mailboxThreadId: string | null;
  mailStatus: string | null;
  blockedReason: string | null;
  sourceId: string | null;
  sourceHash?: string | null;
  sourceKind: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  projectionTarget: string | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  selectedRuntimeAgentProvider?: string | null;
  selectedBackendProvider: string | null;
  latestChunkId: string | null;
  latestChunkIndex: number | null;
  latestDedupeKey: string | null;
  latestSourceEventId: string | null;
  latestSourceEventMs: number | null;
  latestObservedAtMs: number | null;
  latestFreshnessStatus: string | null;
  latestEventId?: string | null;
  sessionControlKey?: string | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  laneSessionSourceBindingKey?: string | null;
  laneSessionSourceIdentityKey?: string | null;
  latestMailLoopObservationKey?: string | null;
  hasObservation?: boolean;
  terminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  observationRef: string | null;
  receiptRef: string | null;
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

export type DocumentLiveTranslationGoalBindingState = {
  goalBindingId: string;
  goalId: string | null;
  laneSessionId: string | null;
  laneId: string;
  bindingStatus: string | null;
  sessionStatus: string | null;
  sessionHealth: string | null;
  activationPolicy: string | null;
  attentionPolicy: string | null;
  stopCondition: string | null;
  reportPolicy: string | null;
  quietBehavior: string | null;
  reportAction: string | null;
  reportReason: string | null;
  quietBehaviorApplied: boolean | null;
  wakeExpected: boolean | null;
  mailboxWakeExpected: boolean | null;
  decisionWakeExpected: boolean | null;
  surfaceBadgeExpected: boolean | null;
  terminalReportRequested: boolean | null;
  terminalReportAuthorized: boolean | null;
  selectedRuntimeAgentProvider?: string | null;
  selectedBackendProvider: string | null;
  sourceId: string | null;
  sourceHash?: string | null;
  sourceKind: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  projectionTarget: string | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  latestChunkId: string | null;
  latestChunkIndex: number | null;
  latestDedupeKey: string | null;
  latestSourceEventId: string | null;
  latestSourceEventMs: number | null;
  latestObservedAtMs: number | null;
  latestFreshnessStatus: string | null;
  latestEventId?: string | null;
  sessionControlKey?: string | null;
  goalBindingKey?: string | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  laneSessionSourceBindingKey?: string | null;
  laneSessionSourceIdentityKey?: string | null;
  latestObservationKey?: string | null;
  latestMailLoopObservationKey?: string | null;
  hasObservation?: boolean;
  terminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  observationRef: string | null;
  receiptRef: string | null;
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

export type DocumentLiveTranslationProjectionDisplayStatus =
  | "empty"
  | "active"
  | "pending"
  | "ready"
  | "stale"
  | "cancelled"
  | "failed"
  | "blocked";

export type DocumentLiveTranslationProjectionSnapshotSummary = {
  version: number;
  totalCount: number;
  pendingCount: number;
  readyCount: number;
  errorCount: number;
  healthStatus: "empty" | "ready" | "degraded" | "blocked";
  displayStatus: DocumentLiveTranslationProjectionDisplayStatus;
  displayStatusReason: string;
  hasRenderableText: boolean;
  hasProjectionErrors: boolean;
  projectedCount: number;
  staleCount: number;
  cancelledCount: number;
  failedCount: number;
  latestStatus: DocumentInlineTranslationRenderState["status"] | null;
  latestObservedAtMs: number | null;
  latestSourceEventId: string | null;
  latestSourceEventMs: number | null;
  latestObservationRef: string | null;
  latestReceiptRef: string | null;
  latestVisibleObservationRef: string | null;
  latestVisibleReceiptRef: string | null;
  latestEvidenceObservationRef: string | null;
  latestEvidenceReceiptRef: string | null;
  latestLaneSessionId: string | null;
  latestObservationLaneSessionId: string | null;
  latestGoalBindingIdFromProjection: string | null;
  latestSessionControlKey: string | null;
  latestSourceBindingKey: string | null;
  latestSourceIdentityKey: string | null;
  latestObservationKey: string | null;
  latestMailLoopObservationKey: string | null;
  latestGoalBindingKey: string | null;
  latestEventId: string | null;
  latestHasObservation: boolean;
  latestSelectedRuntimeAgentProvider?: string | null;
  latestSelectedBackendProvider: string | null;
  latestChunkId: string | null;
  latestChunkIndex: number | null;
  latestDedupeKey: string | null;
  latestSource: DocumentInlineTranslationRenderState["source"] | null;
  latestProjectionKey: string | null;
  latestServerProjectionKey: string | null;
  latestSourceId: string | null;
  latestSourceHash: string | null;
  latestSourceKind: string | null;
  latestSourceTextHash: string | null;
  latestSourceTextCharCount: number | null;
  latestProjectionTarget: string | null;
  latestAccountLocale: string | null;
  latestTargetLanguage: string | null;
  latestProjectionStatus: DocumentInlineTranslationRenderState["projectionStatus"] | null;
  latestFreshnessStatus: string | null;
  latestContextRole: "tool_evidence" | null;
  latestTerminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  latestCancelRequested: boolean;
  latestError: string | null;
  suppressedReceiptCount: number;
  latestSuppressedObservationRef: string | null;
  latestSuppressedReceiptRef: string | null;
  latestSuppressedProjectionKey: string | null;
  latestSuppressedServerProjectionKey: string | null;
  latestSuppressedObservationLaneSessionId: string | null;
  latestSuppressedGoalBindingId: string | null;
  latestSuppressedSessionControlKey: string | null;
  latestSuppressedSourceBindingKey: string | null;
  latestSuppressedSourceIdentityKey: string | null;
  latestSuppressedObservationKey: string | null;
  latestSuppressedMailLoopObservationKey: string | null;
  latestSuppressedGoalBindingKey: string | null;
  latestSuppressedEventId: string | null;
  latestSuppressedHasObservation: boolean;
  latestSuppressedSelectedRuntimeAgentProvider?: string | null;
  latestSuppressedSelectedBackendProvider: string | null;
  latestSuppressedProjectionStatus: DocumentInlineTranslationRenderState["projectionStatus"] | null;
  latestSuppressedChunkId: string | null;
  latestSuppressedChunkIndex: number | null;
  latestSuppressedDedupeKey: string | null;
  latestSuppressedSourceEventId: string | null;
  latestSuppressedSourceEventMs: number | null;
  latestSuppressedObservedAtMs: number | null;
  latestSuppressedFreshnessStatus: string | null;
  latestSuppressedDisplayStatus: DocumentLiveTranslationProjectionDisplayStatus | null;
  latestSuppressedContextRole: "tool_evidence" | null;
  latestSuppressedTerminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  latestSuppressedSourceId: string | null;
  latestSuppressedSourceHash: string | null;
  latestSuppressedSourceKind: string | null;
  latestSuppressedSourceTextHash: string | null;
  latestSuppressedSourceTextCharCount: number | null;
  latestSuppressedAccountLocale: string | null;
  latestSuppressedProjectionTarget: string | null;
  latestSuppressedTargetLanguage: string | null;
  latestSuppressedCancelRequested: boolean;
  latestSuppressedReason: string | null;
  laneSessionCount: number;
  activeLaneSessionCount: number;
  observedLaneSessionCount: number;
  pausedLaneSessionCount: number;
  stoppedLaneSessionCount: number;
  blockedLaneSessionCount: number;
  latestLaneSessionStatus: string | null;
  latestLaneSessionHealth: string | null;
  latestLaneSessionLifecycleAction: string | null;
  latestLaneSessionReason: string | null;
  latestLaneSessionDebugPhase: string | null;
  latestLaneSessionObservationStatus: string | null;
  latestLaneSessionPermissionProfile: string | null;
  latestLaneSessionUpdatedAtMs: number | null;
  latestLaneSessionEventId: string | null;
  latestLaneSessionControlKey: string | null;
  latestLaneSessionSourceBindingKey: string | null;
  latestLaneSessionSourceIdentityKey: string | null;
  latestLaneSessionHasObservation: boolean;
  latestLaneSessionSourceId: string | null;
  latestLaneSessionSourceHash: string | null;
  latestLaneSessionSourceKind: string | null;
  latestLaneSessionSourceTextHash: string | null;
  latestLaneSessionSourceTextCharCount: number | null;
  latestLaneSessionProjectionTarget: string | null;
  latestLaneSessionAccountLocale: string | null;
  latestLaneSessionTargetLanguage: string | null;
  latestLaneSessionChunkId: string | null;
  latestLaneSessionChunkIndex: number | null;
  latestLaneSessionDedupeKey: string | null;
  latestLaneSessionSourceEventId: string | null;
  latestLaneSessionSourceEventMs: number | null;
  latestLaneSessionObservedAtMs: number | null;
  latestLaneSessionFreshnessStatus: string | null;
  latestLaneSessionSelectedRuntimeAgentProvider?: string | null;
  latestLaneSessionSelectedBackendProvider?: string | null;
  latestLaneSessionTerminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  mailLoopCount: number;
  pendingMailLoopCount: number;
  observedMailLoopCount: number;
  blockedMailLoopCount: number;
  latestMailLoopStatus: string | null;
  latestMailLoopId: string | null;
  latestMailLoopDeliveryStatus: string | null;
  latestMailLoopBlockedReason: string | null;
  latestPreviousStagePlayMailId: string | null;
  latestMailLoopWakeKind: "mailbox_wake" | "none";
  latestMailLoopMailboxWakeExpected: boolean;
  latestMailLoopDecisionWakeExpected: false;
  latestMailLoopObservationLaneSessionId: string | null;
  latestMailLoopSessionControlKey: string | null;
  latestMailLoopSourceBindingKey: string | null;
  latestMailLoopSourceIdentityKey: string | null;
  latestMailLoopLaneSessionSourceBindingKey: string | null;
  latestMailLoopLaneSessionSourceIdentityKey: string | null;
  latestMailLoopSourceId: string | null;
  latestMailLoopSourceHash: string | null;
  latestMailLoopSourceKind: string | null;
  latestMailLoopSourceTextHash: string | null;
  latestMailLoopSourceTextCharCount: number | null;
  latestMailLoopProjectionTarget: string | null;
  latestMailLoopAccountLocale: string | null;
  latestMailLoopTargetLanguage: string | null;
  latestMailLoopChunkId: string | null;
  latestMailLoopChunkIndex: number | null;
  latestMailLoopDedupeKey: string | null;
  latestMailLoopSourceEventId: string | null;
  latestMailLoopSourceEventMs: number | null;
  latestMailLoopObservedAtMs: number | null;
  latestMailLoopFreshnessStatus: string | null;
  latestMailLoopSelectedRuntimeAgentProvider?: string | null;
  latestMailLoopSelectedBackendProvider?: string | null;
  latestMailLoopTerminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  goalBindingCount: number;
  activeGoalBindingCount: number;
  observedGoalBindingCount: number;
  blockedGoalBindingCount: number;
  latestGoalBindingId: string | null;
  latestGoalId: string | null;
  latestGoalBindingLaneSessionId: string | null;
  latestGoalBindingStatus: string | null;
  latestGoalBindingSessionStatus: string | null;
  latestGoalBindingSessionHealth: string | null;
  latestGoalBindingActivationPolicy: string | null;
  latestGoalBindingAttentionPolicy: string | null;
  latestGoalBindingStopCondition: string | null;
  latestGoalBindingReportPolicy: string | null;
  latestGoalBindingQuietBehavior: string | null;
  latestGoalBindingReportAction: string | null;
  latestGoalBindingReportReason: string | null;
  latestGoalBindingQuietBehaviorApplied: boolean | null;
  latestGoalBindingWakeExpected: boolean | null;
  latestGoalBindingMailboxWakeExpected: boolean | null;
  latestGoalBindingDecisionWakeExpected: boolean | null;
  latestGoalBindingSurfaceBadgeExpected: boolean | null;
  latestGoalBindingTerminalReportRequested: boolean | null;
  latestGoalBindingTerminalReportAuthorized: boolean | null;
  latestGoalBindingSelectedRuntimeAgentProvider?: string | null;
  latestGoalBindingSelectedBackendProvider?: string | null;
  latestGoalBindingObservationRef: string | null;
  latestGoalBindingReceiptRef: string | null;
  latestGoalBindingEventId: string | null;
  latestGoalBindingSessionControlKey: string | null;
  latestGoalBindingSourceBindingKeyFromEvent: string | null;
  latestGoalBindingSourceIdentityKey: string | null;
  latestGoalBindingLaneSessionSourceBindingKey: string | null;
  latestGoalBindingLaneSessionSourceIdentityKey: string | null;
  latestGoalBindingHasObservation: boolean;
  latestGoalBindingTerminalAuthorityStatus: HelixLiveTranslationTerminalAuthorityStatus;
  latestGoalBindingSourceId: string | null;
  latestGoalBindingSourceHash: string | null;
  latestGoalBindingSourceKind: string | null;
  latestGoalBindingSourceTextHash: string | null;
  latestGoalBindingSourceTextCharCount: number | null;
  latestGoalBindingProjectionTarget: string | null;
  latestGoalBindingAccountLocale: string | null;
  latestGoalBindingTargetLanguage: string | null;
  latestGoalBindingChunkId: string | null;
  latestGoalBindingChunkIndex: number | null;
  latestGoalBindingDedupeKey: string | null;
  latestGoalBindingSourceBindingKey: string | null;
  latestGoalBindingSourceIdentityKeyFromBinding: string | null;
  latestGoalBindingObservationKey: string | null;
  latestGoalBindingMailLoopObservationKey: string | null;
  latestGoalBindingKeyFromBinding: string | null;
  observedLaneActivityCount: number;
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

const DEFAULT_PROJECTION_TARGET = HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK;
const emptySnapshot: DocumentLiveTranslationProjectionSnapshot = {
  version: 0,
  translations: {},
  laneSessions: {},
  mailLoops: {},
  goalBindings: {},
};

let registryVersion = 0;
const snapshots = new Map<string, DocumentLiveTranslationProjectionSnapshot>();
const listeners = new Set<() => void>();

const normalizeText = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeSourceKind = (value: unknown): string | null =>
  normalizeHelixLiveTranslationSourceKind(value, "") || null;

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const readBoolean = (value: unknown): boolean =>
  value === true;

const readOptionalBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const readStagePlayWakeKind = (
  value: unknown,
  wakeExpected: boolean,
): "mailbox_wake" | "none" => {
  const text = readString(value);
  if (text === "mailbox_wake" || text === "none") return text;
  return wakeExpected ? "mailbox_wake" : "none";
};

const readMailboxWakeExpected = (input: {
  explicit: unknown;
  wakeKind?: unknown;
  fallbackWakeExpected?: unknown;
}): boolean => {
  const explicit = readOptionalBoolean(input.explicit);
  if (explicit !== null) return explicit;
  if (readString(input.wakeKind) === "mailbox_wake") return true;
  return readBoolean(input.fallbackWakeExpected);
};

const readTerminalAuthorityStatus = (
  value: unknown,
): HelixLiveTranslationTerminalAuthorityStatus =>
  readString(value) === "pending_helix_terminal_authority"
    ? "pending_helix_terminal_authority"
    : readString(value) === "terminal_authority_rejected"
      ? "terminal_authority_rejected"
      : "not_terminal_authority";

const readLiveTranslationProjectionTarget = (
  meta: Record<string, unknown> | null | undefined,
  fallback?: string | null,
): string =>
  normalizeHelixLiveTranslationProjectionTarget(
    readString(
      meta?.latestProjectionTarget ??
        meta?.latest_projection_target ??
        meta?.sourceProjectionTarget ??
        meta?.source_projection_target ??
        meta?.projectionTarget ??
        meta?.projection_target,
    ) ||
      normalizeText(fallback) ||
      DEFAULT_PROJECTION_TARGET,
    DEFAULT_PROJECTION_TARGET,
  );

const suppressedProjectionSortValue = (state: DocumentInlineTranslationRenderState): number =>
  state.suppressedObservedAtMs ?? state.suppressedSourceEventMs ?? Number.MIN_SAFE_INTEGER;

const projectionEvidenceSortValue = (state: DocumentInlineTranslationRenderState | null | undefined): number =>
  state?.observedAtMs ?? state?.sourceEventMs ?? Number.MIN_SAFE_INTEGER;

const compareProjectionRecency = (
  left: DocumentInlineTranslationRenderState,
  right: DocumentInlineTranslationRenderState,
): number => {
  if (left.sourceEventMs != null && right.sourceEventMs != null) {
    return right.sourceEventMs - left.sourceEventMs;
  }

  const observedDelta =
    (right.observedAtMs ?? Number.MIN_SAFE_INTEGER) -
    (left.observedAtMs ?? Number.MIN_SAFE_INTEGER);
  if (observedDelta !== 0) return observedDelta;

  return (right.sourceEventMs ?? Number.MIN_SAFE_INTEGER) -
    (left.sourceEventMs ?? Number.MIN_SAFE_INTEGER);
};

const resolveSuppressedDisplayStatus = (
  state: DocumentInlineTranslationRenderState | null,
): DocumentLiveTranslationProjectionDisplayStatus | null => {
  if (!state) return null;
  if (state.suppressedProjectionStatus === "cancelled" || state.suppressedCancelRequested) {
    return "cancelled";
  }
  if (state.suppressedProjectionStatus === "failed") {
    return "failed";
  }
  if (state.suppressedProjectionStatus === "stale" || state.suppressedFreshnessStatus === "stale") {
    return "stale";
  }
  return null;
};

const localeMatches = (candidate: string, locale: string): boolean => {
  const normalizedCandidate = normalizeText(candidate).toLowerCase();
  const normalizedLocale = normalizeText(locale).toLowerCase();
  return !normalizedCandidate ||
    !normalizedLocale ||
    normalizedCandidate === normalizedLocale ||
    normalizedCandidate.startsWith(`${normalizedLocale}-`) ||
    normalizedLocale.startsWith(`${normalizedCandidate}-`);
};

const sourceHashMatches = (candidate: string | null | undefined, sourceHash: string | null | undefined): boolean => {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedSourceHash = normalizeText(sourceHash);
  if (normalizedCandidate && !normalizedSourceHash) return false;
  if (normalizedSourceHash && !normalizedCandidate) return false;
  if (!normalizedCandidate && !normalizedSourceHash) return true;
  return normalizedCandidate === normalizedSourceHash;
};

const docPathMatches = (candidate: unknown, docPath: string): boolean => {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedDocPath = normalizeText(docPath);
  return Boolean(normalizedCandidate && normalizedDocPath && normalizedCandidate === normalizedDocPath);
};

const sourceIdMatchesDocument = (sourceId: string, docPath: string): boolean => {
  const docSourceId = documentMarkdownSourceId(docPath);
  return sourceId === docSourceId || sourceId.startsWith(`${docSourceId}#`);
};

const sourceIdIsDocumentChunk = (sourceId: string, docPath: string): boolean =>
  sourceId.startsWith(`${documentMarkdownSourceId(docPath)}#`);

const liveEventMatchesDocumentSource = (input: {
  meta: Record<string, unknown> | null;
  sourceId: string;
  docPath: string;
}): boolean =>
  sourceIdMatchesDocument(input.sourceId, input.docPath) ||
  docPathMatches(input.meta?.docPath ?? input.meta?.doc_path, input.docPath);

const sourceTextIdentityMatches = (
  meta: Record<string, unknown> | null,
  input: Pick<IngestDocumentLiveTranslationProjectionLiveEventInput, "sourceTextHash" | "sourceTextCharCount">,
): boolean => {
  const expectedSourceTextHash = normalizeText(input.sourceTextHash);
  const expectedSourceTextCharCount = readNumber(input.sourceTextCharCount);
  if (!expectedSourceTextHash && expectedSourceTextCharCount === null) return true;
  const eventSourceTextHash = normalizeText(meta?.sourceTextHash ?? meta?.source_text_hash);
  const eventSourceTextCharCount = readNumber(meta?.sourceTextCharCount ?? meta?.source_text_char_count);
  if (expectedSourceTextHash && eventSourceTextHash !== expectedSourceTextHash) return false;
  if (expectedSourceTextCharCount !== null && eventSourceTextCharCount !== expectedSourceTextCharCount) return false;
  return true;
};

const readSourceIdentityKey = (meta: Record<string, unknown> | null): string =>
  normalizeHelixLiveTranslationSourceIdentityKey(
    normalizeText(meta?.latestSourceIdentityKey ?? meta?.latest_source_identity_key) ||
      normalizeText(meta?.sourceIdentityKey ?? meta?.source_identity_key) ||
      normalizeText(meta?.laneSessionSourceIdentityKey ?? meta?.lane_session_source_identity_key) ||
      normalizeText(meta?.goalBindingSourceIdentityKey ?? meta?.goal_binding_source_identity_key) ||
      normalizeText(meta?.latestGoalBindingSourceIdentityKey ?? meta?.latest_goal_binding_source_identity_key) ||
      normalizeText(meta?.mailLoopSourceIdentityKey ?? meta?.mail_loop_source_identity_key) ||
      normalizeText(meta?.latestMailLoopSourceIdentityKey ?? meta?.latest_mail_loop_source_identity_key),
  );

const sourceIdentityKeyMatches = (
  meta: Record<string, unknown> | null,
  input: Pick<IngestDocumentLiveTranslationProjectionLiveEventInput, "sourceIdentityKey">,
): boolean => {
  const expectedSourceIdentityKey = normalizeText(input.sourceIdentityKey);
  if (!expectedSourceIdentityKey) return true;
  return readSourceIdentityKey(meta) ===
    normalizeHelixLiveTranslationSourceIdentityKey(expectedSourceIdentityKey);
};

export function documentLiveTranslationProjectionRegistryKey(
  input: DocumentLiveTranslationProjectionRegistryKey,
): string {
  const keyParts = [
    normalizeText(input.docPath),
    normalizeText(input.locale).toLowerCase(),
    normalizeHelixLiveTranslationProjectionTarget(input.projectionTarget, DEFAULT_PROJECTION_TARGET),
  ];
  const sourceHash = normalizeText(input.sourceHash);
  if (sourceHash) keyParts.push(sourceHash);
  const sourceIdentityKey = normalizeHelixLiveTranslationSourceIdentityKey(input.sourceIdentityKey);
  if (sourceIdentityKey) keyParts.push(`source_identity:${sourceIdentityKey}`);
  return keyParts.join("|");
}

export function readDocumentLiveTranslationProjectionSnapshot(
  input: DocumentLiveTranslationProjectionRegistryKey,
): DocumentLiveTranslationProjectionSnapshot {
  return snapshots.get(documentLiveTranslationProjectionRegistryKey(input)) ?? emptySnapshot;
}

const laneSessionHasEvidence = (session: DocumentLiveTranslationLaneSessionState | null | undefined): boolean =>
  Boolean(session?.hasObservation || session?.lastObservationRef || session?.lastReceiptRef);

const mailLoopHasEvidence = (loop: DocumentLiveTranslationMailLoopState | null | undefined): boolean =>
  Boolean(loop?.hasObservation || loop?.observationRef || loop?.receiptRef || loop?.latestMailLoopObservationKey);

const goalBindingHasEvidence = (binding: DocumentLiveTranslationGoalBindingState | null | undefined): boolean =>
  Boolean(
    binding?.hasObservation ||
      binding?.observationRef ||
      binding?.receiptRef ||
      binding?.latestObservationKey ||
      binding?.latestMailLoopObservationKey,
  );

export function summarizeDocumentLiveTranslationProjectionSnapshot(
  snapshot: DocumentLiveTranslationProjectionSnapshot,
): DocumentLiveTranslationProjectionSnapshotSummary {
  const states = Object.values(snapshot.translations);
  const sessions = Object.values(snapshot.laneSessions);
  const mailLoops = Object.values(snapshot.mailLoops);
  const goalBindings = Object.values(snapshot.goalBindings);
  const readyCount = states.filter((state) => state.status === "ready").length;
  const loadingCount = states.filter((state) => state.status === "loading").length;
  const errorCount = states.filter((state) => state.status === "error").length;
  const blockedLaneSessionCount = sessions.filter((session) =>
    session.sessionStatus === "blocked" || session.sessionHealth === "blocked",
  ).length;
  const blockedMailLoopCount = mailLoops.filter((loop) => Boolean(loop.blockedReason)).length;
  const blockedGoalBindingCount = goalBindings.filter((binding) =>
    binding.bindingStatus === "blocked" ||
    binding.sessionStatus === "blocked" ||
    binding.sessionHealth === "blocked",
  ).length;
  const activeLaneSessionCount = sessions.filter((session) =>
    session.sessionStatus === "running" || session.sessionStatus === "paused",
  ).length;
  const observedLaneSessionCount = sessions.filter(laneSessionHasEvidence).length;
  const pausedLaneSessionCount = sessions.filter((session) => session.sessionStatus === "paused").length;
  const stoppedLaneSessionCount = sessions.filter((session) => session.sessionStatus === "stopped").length;
  const pendingMailLoopCount = mailLoops.filter((loop) => loop.stagePlayWakeExpected).length;
  const observedMailLoopCount = mailLoops.filter(mailLoopHasEvidence).length;
  const pendingCount = loadingCount + pendingMailLoopCount;
  const activeGoalBindingCount = goalBindings.filter((binding) =>
    binding.bindingStatus === "active" ||
    binding.sessionStatus === "running" ||
    binding.sessionStatus === "paused",
  ).length;
  const observedGoalBindingCount = goalBindings.filter(goalBindingHasEvidence).length;
  const hasLaneBlockers = blockedLaneSessionCount > 0 || blockedMailLoopCount > 0 || blockedGoalBindingCount > 0;
  const hasLaneActivity = activeLaneSessionCount > 0 || pendingMailLoopCount > 0 || activeGoalBindingCount > 0;
  const projectedCount = states.filter((state) => state.projectionStatus === "projected").length;
  const staleCount = states.filter((state) => state.projectionStatus === "stale").length;
  const cancelledCount = states.filter((state) => state.projectionStatus === "cancelled").length;
  const failedCount = states.filter((state) => state.projectionStatus === "failed").length;
  const healthStatus =
    states.length === 0 && hasLaneBlockers
      ? "blocked"
      : states.length === 0 && hasLaneActivity
        ? "degraded"
        : states.length === 0
          ? "empty"
          : readyCount > 0 && hasLaneBlockers
            ? "degraded"
          : readyCount > 0 && errorCount > 0
            ? "degraded"
            : readyCount > 0
              ? "ready"
              : "blocked";
  const displayStatus =
    readyCount > 0
      ? "ready"
      : hasLaneBlockers
        ? "blocked"
        : failedCount > 0
          ? "failed"
          : cancelledCount > 0
            ? "cancelled"
            : staleCount > 0
              ? "stale"
              : errorCount > 0
                ? "blocked"
                : pendingMailLoopCount > 0
                  ? "pending"
                  : hasLaneActivity
                  ? "active"
                  : "empty";
  const displayStatusReason =
    readyCount > 0 && hasLaneBlockers
      ? "ready_projection_with_lane_blockers"
      : hasLaneBlockers
        ? "lane_blocker_present"
      : readyCount > 0 && errorCount > 0
        ? "ready_projection_with_errors"
        : readyCount > 0
          ? "ready_projection_available"
          : failedCount > 0
            ? "failed_projection"
            : cancelledCount > 0
              ? "cancelled_projection"
              : staleCount > 0
                ? "stale_projection"
                : errorCount > 0
                  ? "projection_error_blocked"
                  : pendingMailLoopCount > 0
                    ? "mail_loop_pending"
                    : hasLaneActivity
                      ? "lane_activity_without_projection"
                      : "no_projection_activity";
  const ordered = [...states].sort(compareProjectionRecency);
  const latest = ordered[0] ?? null;
  const suppressed = states.filter((state) => Boolean(state.suppressedReceiptRef || state.suppressedObservationRef));
  const latestSuppressed =
    [...suppressed].sort((left, right) =>
      suppressedProjectionSortValue(right) - suppressedProjectionSortValue(left),
    )[0] ?? null;
  const latestSession =
    [...sessions].sort((left, right) =>
      (right.updatedAtMs ?? Number.MIN_SAFE_INTEGER) -
      (left.updatedAtMs ?? Number.MIN_SAFE_INTEGER),
    )[0] ?? null;
  const latestMailLoop =
    [...mailLoops].sort((left, right) =>
      mailLoopSortValue(right) - mailLoopSortValue(left),
    )[0] ?? null;
  const latestGoalBinding =
    [...goalBindings].sort((left, right) =>
      goalBindingSortValue(right) - goalBindingSortValue(left),
    )[0] ?? null;
  const latestEvidence = [
    latest
      ? {
        order: projectionEvidenceSortValue(latest),
        observationRef: latest.observationRef ?? null,
        receiptRef: latest.receiptRef ?? null,
      }
      : null,
    latestSuppressed
      ? {
        order: suppressedProjectionSortValue(latestSuppressed),
        observationRef: latestSuppressed.suppressedObservationRef ?? null,
        receiptRef: latestSuppressed.suppressedReceiptRef ?? null,
      }
      : null,
    latestSession
      ? {
        order: laneSessionSortValue(latestSession),
        observationRef: latestSession.lastObservationRef ?? null,
        receiptRef: latestSession.lastReceiptRef ?? null,
      }
      : null,
    latestMailLoop
      ? {
        order: mailLoopSortValue(latestMailLoop),
        observationRef: latestMailLoop.observationRef ?? null,
        receiptRef: latestMailLoop.receiptRef ?? null,
      }
      : null,
    latestGoalBinding
      ? {
        order: goalBindingSortValue(latestGoalBinding),
        observationRef: latestGoalBinding.observationRef ?? null,
        receiptRef: latestGoalBinding.receiptRef ?? null,
      }
      : null,
  ]
    .filter((entry): entry is { order: number; observationRef: string | null; receiptRef: string | null } =>
      Boolean(entry && (entry.observationRef || entry.receiptRef))
    )
    .sort((left, right) => right.order - left.order)[0] ?? null;
  return {
    version: snapshot.version,
    totalCount: states.length,
    pendingCount,
    readyCount,
    errorCount,
    healthStatus,
    displayStatus,
    displayStatusReason,
    hasRenderableText: readyCount > 0,
    hasProjectionErrors: errorCount > 0,
    projectedCount,
    staleCount,
    cancelledCount,
    failedCount,
    latestStatus: latest?.status ?? null,
    latestObservedAtMs:
      latest?.observedAtMs ??
      latestSession?.latestObservedAtMs ??
      latestMailLoop?.latestObservedAtMs ??
      latestGoalBinding?.latestObservedAtMs ??
      null,
    latestSourceEventId:
      latest?.sourceEventId ??
      latestSession?.latestSourceEventId ??
      latestMailLoop?.latestSourceEventId ??
      latestGoalBinding?.latestSourceEventId ??
      null,
    latestSourceEventMs:
      latest?.sourceEventMs ??
      latestSession?.latestSourceEventMs ??
      latestMailLoop?.latestSourceEventMs ??
      latestGoalBinding?.latestSourceEventMs ??
      null,
    latestObservationRef:
      latest?.observationRef ??
      latestSession?.lastObservationRef ??
      latestMailLoop?.observationRef ??
      latestGoalBinding?.observationRef ??
      null,
    latestReceiptRef:
      latest?.receiptRef ??
      latestSession?.lastReceiptRef ??
      latestMailLoop?.receiptRef ??
      latestGoalBinding?.receiptRef ??
      null,
    latestVisibleObservationRef: latest?.observationRef ?? null,
    latestVisibleReceiptRef: latest?.receiptRef ?? null,
    latestEvidenceObservationRef: latestEvidence?.observationRef ?? null,
    latestEvidenceReceiptRef: latestEvidence?.receiptRef ?? null,
    latestLaneSessionId: latest?.laneSessionId ?? latestSession?.laneSessionId ?? null,
    latestObservationLaneSessionId:
      latest?.observationLaneSessionId ??
      latestMailLoop?.observationLaneSessionId ??
      null,
    latestGoalBindingIdFromProjection: latest?.goalBindingId ?? null,
    latestSessionControlKey:
      latest?.sessionControlKey ??
      latestSession?.sessionControlKey ??
      latestMailLoop?.sessionControlKey ??
      latestGoalBinding?.sessionControlKey ??
      null,
    latestSourceBindingKey:
      latest?.latestSourceBindingKey ??
      latest?.sourceBindingKey ??
      latestSession?.latestSourceBindingKey ??
      latestSession?.sourceBindingKey ??
      latestMailLoop?.latestSourceBindingKey ??
      latestMailLoop?.sourceBindingKey ??
      latestGoalBinding?.latestSourceBindingKey ??
      latestGoalBinding?.sourceBindingKey ??
      null,
    latestSourceIdentityKey:
      latest?.latestSourceIdentityKey ??
      latest?.sourceIdentityKey ??
      latestSession?.sourceIdentityKey ??
      latestMailLoop?.sourceIdentityKey ??
      latestGoalBinding?.sourceIdentityKey ??
      null,
    latestObservationKey:
      latest?.latestObservationKey ??
      latestSession?.latestObservationKey ??
      latestGoalBinding?.latestObservationKey ??
      null,
    latestMailLoopObservationKey:
      latest?.latestMailLoopObservationKey ??
      latestMailLoop?.latestMailLoopObservationKey ??
      latestGoalBinding?.latestMailLoopObservationKey ??
      null,
    latestGoalBindingKey:
      latest?.goalBindingKey ??
      latestGoalBinding?.goalBindingKey ??
      null,
    latestEventId:
      latest?.latestEventId ??
      latestSession?.latestEventId ??
      latestMailLoop?.latestEventId ??
      latestGoalBinding?.latestEventId ??
      null,
    latestHasObservation:
      (latest?.hasObservation ||
        laneSessionHasEvidence(latestSession) ||
        mailLoopHasEvidence(latestMailLoop) ||
        goalBindingHasEvidence(latestGoalBinding)) ||
      Boolean(
        latest?.observationRef ??
        latest?.receiptRef ??
        latest?.latestObservationKey ??
        latest?.latestMailLoopObservationKey ??
        latestSession?.lastObservationRef ??
        latestSession?.lastReceiptRef ??
        latestSession?.latestObservationKey ??
        latestMailLoop?.observationRef ??
        latestMailLoop?.receiptRef ??
        latestMailLoop?.latestMailLoopObservationKey ??
        latestGoalBinding?.receiptRef ??
        latestGoalBinding?.latestObservationKey ??
        latestGoalBinding?.latestMailLoopObservationKey ??
        latestGoalBinding?.observationRef,
      ),
    ...(latest?.selectedRuntimeAgentProvider ??
      latestSession?.selectedRuntimeAgentProvider ??
      latestMailLoop?.selectedRuntimeAgentProvider ??
      latestGoalBinding?.selectedRuntimeAgentProvider
      ? {
        latestSelectedRuntimeAgentProvider:
          latest?.selectedRuntimeAgentProvider ??
          latestSession?.selectedRuntimeAgentProvider ??
          latestMailLoop?.selectedRuntimeAgentProvider ??
          latestGoalBinding?.selectedRuntimeAgentProvider ??
          null,
      }
      : {}),
    latestSelectedBackendProvider:
      latest?.selectedBackendProvider ??
      latestSession?.selectedBackendProvider ??
      latestMailLoop?.selectedBackendProvider ??
      latestGoalBinding?.selectedBackendProvider ??
      null,
    latestChunkId:
      latest?.chunkId ??
      latestSession?.latestChunkId ??
      latestMailLoop?.latestChunkId ??
      latestGoalBinding?.latestChunkId ??
      null,
    latestChunkIndex:
      latest?.chunkIndex ??
      latestSession?.latestChunkIndex ??
      latestMailLoop?.latestChunkIndex ??
      latestGoalBinding?.latestChunkIndex ??
      null,
    latestDedupeKey:
      latest?.dedupeKey ??
      latestSession?.latestDedupeKey ??
      latestMailLoop?.latestDedupeKey ??
      latestGoalBinding?.latestDedupeKey ??
      null,
    latestSource: latest?.source ?? null,
    latestProjectionKey: latest ? buildDocumentInlineTranslationProjectionKey(latest) : null,
    latestServerProjectionKey: latest?.serverProjectionKey ?? null,
    latestSourceId:
      latest?.sourceId ??
      latestSession?.sourceId ??
      latestMailLoop?.sourceId ??
      latestGoalBinding?.sourceId ??
      null,
    latestSourceHash:
      latest?.sourceHash ??
      latestSession?.sourceHash ??
      latestMailLoop?.sourceHash ??
      latestGoalBinding?.sourceHash ??
      null,
    latestSourceKind:
      latest?.sourceKind ??
      latestSession?.sourceKind ??
      latestMailLoop?.sourceKind ??
      latestGoalBinding?.sourceKind ??
      null,
    latestSourceTextHash:
      latest?.sourceTextHash ??
      latestSession?.sourceTextHash ??
      latestMailLoop?.sourceTextHash ??
      latestGoalBinding?.sourceTextHash ??
      null,
    latestSourceTextCharCount:
      latest?.sourceTextCharCount ??
      latestSession?.sourceTextCharCount ??
      latestMailLoop?.sourceTextCharCount ??
      latestGoalBinding?.sourceTextCharCount ??
      null,
    latestProjectionTarget:
      latest?.projectionTarget ??
      latestSession?.projectionTarget ??
      latestMailLoop?.projectionTarget ??
      latestGoalBinding?.projectionTarget ??
      null,
    latestAccountLocale:
      latest?.accountLocale ??
      latestSession?.accountLocale ??
      latestMailLoop?.accountLocale ??
      latestGoalBinding?.accountLocale ??
      null,
    latestTargetLanguage:
      latest?.targetLanguage ??
      latestSession?.targetLanguage ??
      latestMailLoop?.targetLanguage ??
      latestGoalBinding?.targetLanguage ??
      null,
    latestProjectionStatus: latest?.projectionStatus ?? null,
    latestFreshnessStatus:
      latest?.freshnessStatus ??
      latestSession?.latestFreshnessStatus ??
      latestMailLoop?.latestFreshnessStatus ??
      latestGoalBinding?.latestFreshnessStatus ??
      null,
    latestContextRole: latest?.contextRole ??
      (latestSession || latestMailLoop || latestGoalBinding ? "tool_evidence" : null),
    latestTerminalAuthorityStatus:
      latest?.terminalAuthorityStatus ??
      latestSession?.terminalAuthorityStatus ??
      latestMailLoop?.terminalAuthorityStatus ??
      latestGoalBinding?.terminalAuthorityStatus ??
      "not_terminal_authority",
    latestCancelRequested: latest?.cancelRequested ?? false,
    latestError: latest?.error ?? null,
    suppressedReceiptCount: suppressed.length,
    latestSuppressedObservationRef: latestSuppressed?.suppressedObservationRef ?? null,
    latestSuppressedReceiptRef: latestSuppressed?.suppressedReceiptRef ?? null,
    latestSuppressedProjectionKey: latestSuppressed
      ? buildDocumentInlineTranslationSuppressedProjectionKey(latestSuppressed)
      : null,
    latestSuppressedServerProjectionKey: latestSuppressed?.suppressedServerProjectionKey ?? null,
    latestSuppressedObservationLaneSessionId: latestSuppressed?.suppressedObservationLaneSessionId ?? null,
    latestSuppressedGoalBindingId: latestSuppressed?.suppressedGoalBindingId ?? null,
    latestSuppressedSessionControlKey: latestSuppressed?.suppressedSessionControlKey ?? null,
    latestSuppressedSourceBindingKey: latestSuppressed?.suppressedSourceBindingKey ?? null,
    latestSuppressedSourceIdentityKey:
      latestSuppressed?.suppressedLatestSourceIdentityKey ??
      latestSuppressed?.suppressedSourceIdentityKey ??
      null,
    latestSuppressedObservationKey: latestSuppressed?.suppressedLatestObservationKey ?? null,
    latestSuppressedMailLoopObservationKey: latestSuppressed?.suppressedLatestMailLoopObservationKey ?? null,
    latestSuppressedGoalBindingKey: latestSuppressed?.suppressedGoalBindingKey ?? null,
    latestSuppressedEventId: latestSuppressed?.suppressedLatestEventId ?? null,
    latestSuppressedHasObservation: latestSuppressed?.suppressedHasObservation ?? false,
    ...(latestSuppressed?.suppressedSelectedRuntimeAgentProvider
      ? {
        latestSuppressedSelectedRuntimeAgentProvider:
          latestSuppressed.suppressedSelectedRuntimeAgentProvider,
      }
      : {}),
    latestSuppressedSelectedBackendProvider:
      latestSuppressed?.suppressedSelectedBackendProvider ?? null,
    latestSuppressedProjectionStatus: latestSuppressed?.suppressedProjectionStatus ?? null,
    latestSuppressedChunkId: latestSuppressed?.suppressedChunkId ?? null,
    latestSuppressedChunkIndex: latestSuppressed?.suppressedChunkIndex ?? null,
    latestSuppressedDedupeKey: latestSuppressed?.suppressedDedupeKey ?? null,
    latestSuppressedSourceEventId: latestSuppressed?.suppressedSourceEventId ?? null,
    latestSuppressedSourceEventMs: latestSuppressed?.suppressedSourceEventMs ?? null,
    latestSuppressedObservedAtMs: latestSuppressed?.suppressedObservedAtMs ?? null,
    latestSuppressedFreshnessStatus: latestSuppressed?.suppressedFreshnessStatus ?? null,
    latestSuppressedDisplayStatus: resolveSuppressedDisplayStatus(latestSuppressed),
    latestSuppressedContextRole: latestSuppressed?.suppressedContextRole ?? null,
    latestSuppressedTerminalAuthorityStatus: latestSuppressed?.suppressedTerminalAuthorityStatus ?? "not_terminal_authority",
    latestSuppressedSourceId: latestSuppressed?.suppressedSourceId ?? null,
    latestSuppressedSourceHash: latestSuppressed?.suppressedSourceHash ?? null,
    latestSuppressedSourceKind: latestSuppressed?.suppressedSourceKind ?? null,
    latestSuppressedSourceTextHash: latestSuppressed?.suppressedSourceTextHash ?? null,
    latestSuppressedSourceTextCharCount: latestSuppressed?.suppressedSourceTextCharCount ?? null,
    latestSuppressedAccountLocale: latestSuppressed?.suppressedAccountLocale ?? null,
    latestSuppressedProjectionTarget: latestSuppressed?.suppressedProjectionTarget ?? null,
    latestSuppressedTargetLanguage: latestSuppressed?.suppressedTargetLanguage ?? null,
    latestSuppressedCancelRequested: latestSuppressed?.suppressedCancelRequested ?? false,
    latestSuppressedReason: latestSuppressed?.suppressedReason ?? null,
    laneSessionCount: sessions.length,
    activeLaneSessionCount,
    observedLaneSessionCount,
    pausedLaneSessionCount,
    stoppedLaneSessionCount,
    blockedLaneSessionCount,
    latestLaneSessionStatus: latestSession?.sessionStatus ?? null,
    latestLaneSessionHealth: latestSession?.sessionHealth ?? null,
    latestLaneSessionLifecycleAction: latestSession?.lifecycleAction ?? null,
    latestLaneSessionReason: latestSession?.lifecycleReason ?? null,
    latestLaneSessionDebugPhase: latestSession?.sessionDebugPhase ?? null,
    latestLaneSessionObservationStatus: latestSession?.sessionObservationStatus ?? null,
    latestLaneSessionPermissionProfile: latestSession?.permissionProfile ?? null,
    latestLaneSessionUpdatedAtMs: latestSession?.updatedAtMs ?? null,
    latestLaneSessionEventId: latestSession?.latestEventId ?? null,
    latestLaneSessionControlKey: latestSession?.sessionControlKey ?? null,
    latestLaneSessionSourceBindingKey:
      latestSession?.laneSessionSourceBindingKey ??
      latestSession?.latestSourceBindingKey ??
      latestSession?.sourceBindingKey ??
      null,
    latestLaneSessionSourceIdentityKey:
      latestSession?.laneSessionSourceIdentityKey ??
      latestSession?.sourceIdentityKey ??
      null,
    latestLaneSessionHasObservation: laneSessionHasEvidence(latestSession),
    latestLaneSessionSourceId: latestSession?.sourceId ?? null,
    latestLaneSessionSourceHash: latestSession?.sourceHash ?? null,
    latestLaneSessionSourceKind: latestSession?.sourceKind ?? null,
    latestLaneSessionSourceTextHash: latestSession?.sourceTextHash ?? null,
    latestLaneSessionSourceTextCharCount: latestSession?.sourceTextCharCount ?? null,
    latestLaneSessionProjectionTarget: latestSession?.projectionTarget ?? null,
    latestLaneSessionAccountLocale: latestSession?.accountLocale ?? null,
    latestLaneSessionTargetLanguage: latestSession?.targetLanguage ?? null,
    latestLaneSessionChunkId: latestSession?.latestChunkId ?? null,
    latestLaneSessionChunkIndex: latestSession?.latestChunkIndex ?? null,
    latestLaneSessionDedupeKey: latestSession?.latestDedupeKey ?? null,
    latestLaneSessionSourceEventId: latestSession?.latestSourceEventId ?? null,
    latestLaneSessionSourceEventMs: latestSession?.latestSourceEventMs ?? null,
    latestLaneSessionObservedAtMs: latestSession?.latestObservedAtMs ?? null,
    latestLaneSessionFreshnessStatus: latestSession?.latestFreshnessStatus ?? null,
    ...(latestSession?.selectedRuntimeAgentProvider
      ? { latestLaneSessionSelectedRuntimeAgentProvider: latestSession.selectedRuntimeAgentProvider }
      : {}),
    latestLaneSessionSelectedBackendProvider: latestSession?.selectedBackendProvider ?? null,
    latestLaneSessionTerminalAuthorityStatus: latestSession?.terminalAuthorityStatus ?? "not_terminal_authority",
    mailLoopCount: mailLoops.length,
    pendingMailLoopCount,
    observedMailLoopCount,
    blockedMailLoopCount,
    latestMailLoopStatus: latestMailLoop?.mailStatus ?? null,
    latestMailLoopId: latestMailLoop?.mailLoopId ?? null,
    latestMailLoopDeliveryStatus: latestMailLoop?.stagePlayMailDeliveryStatus ?? null,
    latestMailLoopBlockedReason: latestMailLoop?.blockedReason ?? null,
    latestPreviousStagePlayMailId: latestMailLoop?.previousStagePlayMailId ?? null,
    latestMailLoopWakeKind: latestMailLoop?.stagePlayWakeKind ?? "none",
    latestMailLoopMailboxWakeExpected: latestMailLoop?.mailboxWakeExpected ?? false,
    latestMailLoopDecisionWakeExpected: latestMailLoop?.decisionWakeExpected ?? false,
    latestMailLoopObservationLaneSessionId: latestMailLoop?.observationLaneSessionId ?? null,
    latestMailLoopSessionControlKey: latestMailLoop?.sessionControlKey ?? null,
    latestMailLoopSourceBindingKey:
      latestMailLoop?.latestSourceBindingKey ??
      latestMailLoop?.sourceBindingKey ??
      null,
    latestMailLoopSourceIdentityKey: latestMailLoop?.sourceIdentityKey ?? null,
    latestMailLoopLaneSessionSourceBindingKey: latestMailLoop?.laneSessionSourceBindingKey ?? null,
    latestMailLoopLaneSessionSourceIdentityKey: latestMailLoop?.laneSessionSourceIdentityKey ?? null,
    latestMailLoopSourceId: latestMailLoop?.sourceId ?? null,
    latestMailLoopSourceHash: latestMailLoop?.sourceHash ?? null,
    latestMailLoopSourceKind: latestMailLoop?.sourceKind ?? null,
    latestMailLoopSourceTextHash: latestMailLoop?.sourceTextHash ?? null,
    latestMailLoopSourceTextCharCount: latestMailLoop?.sourceTextCharCount ?? null,
    latestMailLoopProjectionTarget: latestMailLoop?.projectionTarget ?? null,
    latestMailLoopAccountLocale: latestMailLoop?.accountLocale ?? null,
    latestMailLoopTargetLanguage: latestMailLoop?.targetLanguage ?? null,
    latestMailLoopChunkId: latestMailLoop?.latestChunkId ?? null,
    latestMailLoopChunkIndex: latestMailLoop?.latestChunkIndex ?? null,
    latestMailLoopDedupeKey: latestMailLoop?.latestDedupeKey ?? null,
    latestMailLoopSourceEventId: latestMailLoop?.latestSourceEventId ?? null,
    latestMailLoopSourceEventMs: latestMailLoop?.latestSourceEventMs ?? null,
    latestMailLoopObservedAtMs: latestMailLoop?.latestObservedAtMs ?? null,
    latestMailLoopFreshnessStatus: latestMailLoop?.latestFreshnessStatus ?? null,
    ...(latestMailLoop?.selectedRuntimeAgentProvider
      ? { latestMailLoopSelectedRuntimeAgentProvider: latestMailLoop.selectedRuntimeAgentProvider }
      : {}),
    latestMailLoopSelectedBackendProvider: latestMailLoop?.selectedBackendProvider ?? null,
    latestMailLoopTerminalAuthorityStatus: latestMailLoop?.terminalAuthorityStatus ?? "not_terminal_authority",
    goalBindingCount: goalBindings.length,
    activeGoalBindingCount,
    observedGoalBindingCount,
    blockedGoalBindingCount,
    latestGoalBindingId: latestGoalBinding?.goalBindingId ?? null,
    latestGoalId: latestGoalBinding?.goalId ?? null,
    latestGoalBindingLaneSessionId: latestGoalBinding?.laneSessionId ?? null,
    latestGoalBindingStatus: latestGoalBinding?.bindingStatus ?? null,
    latestGoalBindingSessionStatus: latestGoalBinding?.sessionStatus ?? null,
    latestGoalBindingSessionHealth: latestGoalBinding?.sessionHealth ?? null,
    latestGoalBindingActivationPolicy: latestGoalBinding?.activationPolicy ?? null,
    latestGoalBindingAttentionPolicy: latestGoalBinding?.attentionPolicy ?? null,
    latestGoalBindingStopCondition: latestGoalBinding?.stopCondition ?? null,
    latestGoalBindingReportPolicy: latestGoalBinding?.reportPolicy ?? null,
    latestGoalBindingQuietBehavior: latestGoalBinding?.quietBehavior ?? null,
    latestGoalBindingReportAction: latestGoalBinding?.reportAction ?? null,
    latestGoalBindingReportReason: latestGoalBinding?.reportReason ?? null,
    latestGoalBindingQuietBehaviorApplied: latestGoalBinding?.quietBehaviorApplied ?? null,
    latestGoalBindingWakeExpected: latestGoalBinding?.wakeExpected ?? null,
    latestGoalBindingMailboxWakeExpected: latestGoalBinding?.mailboxWakeExpected ?? null,
    latestGoalBindingDecisionWakeExpected: latestGoalBinding?.decisionWakeExpected ?? null,
    latestGoalBindingSurfaceBadgeExpected: latestGoalBinding?.surfaceBadgeExpected ?? null,
    latestGoalBindingTerminalReportRequested: latestGoalBinding?.terminalReportRequested ?? null,
    latestGoalBindingTerminalReportAuthorized: latestGoalBinding?.terminalReportAuthorized ?? null,
    ...(latestGoalBinding?.selectedRuntimeAgentProvider
      ? { latestGoalBindingSelectedRuntimeAgentProvider: latestGoalBinding.selectedRuntimeAgentProvider }
      : {}),
    latestGoalBindingSelectedBackendProvider: latestGoalBinding?.selectedBackendProvider ?? null,
    latestGoalBindingObservationRef: latestGoalBinding?.observationRef ?? null,
    latestGoalBindingReceiptRef: latestGoalBinding?.receiptRef ?? null,
    latestGoalBindingEventId: latestGoalBinding?.latestEventId ?? null,
    latestGoalBindingSessionControlKey: latestGoalBinding?.sessionControlKey ?? null,
    latestGoalBindingSourceBindingKeyFromEvent:
      latestGoalBinding?.latestSourceBindingKey ??
      latestGoalBinding?.sourceBindingKey ??
      null,
    latestGoalBindingSourceIdentityKey: latestGoalBinding?.sourceIdentityKey ?? null,
    latestGoalBindingLaneSessionSourceBindingKey: latestGoalBinding?.laneSessionSourceBindingKey ?? null,
    latestGoalBindingLaneSessionSourceIdentityKey: latestGoalBinding?.laneSessionSourceIdentityKey ?? null,
    latestGoalBindingHasObservation:
      goalBindingHasEvidence(latestGoalBinding),
    latestGoalBindingTerminalAuthorityStatus:
      latestGoalBinding?.terminalAuthorityStatus ?? "not_terminal_authority",
    latestGoalBindingSourceId: latestGoalBinding?.sourceId ?? null,
    latestGoalBindingSourceHash: latestGoalBinding?.sourceHash ?? null,
    latestGoalBindingSourceKind: latestGoalBinding?.sourceKind ?? null,
    latestGoalBindingSourceTextHash: latestGoalBinding?.sourceTextHash ?? null,
    latestGoalBindingSourceTextCharCount: latestGoalBinding?.sourceTextCharCount ?? null,
    latestGoalBindingProjectionTarget: latestGoalBinding?.projectionTarget ?? null,
    latestGoalBindingAccountLocale: latestGoalBinding?.accountLocale ?? null,
    latestGoalBindingTargetLanguage: latestGoalBinding?.targetLanguage ?? null,
    latestGoalBindingChunkId: latestGoalBinding?.latestChunkId ?? null,
    latestGoalBindingChunkIndex: latestGoalBinding?.latestChunkIndex ?? null,
    latestGoalBindingDedupeKey: latestGoalBinding?.latestDedupeKey ?? null,
    latestGoalBindingSourceBindingKey:
      latestGoalBinding?.latestSourceBindingKey ??
      latestGoalBinding?.sourceBindingKey ??
      null,
    latestGoalBindingSourceIdentityKeyFromBinding: latestGoalBinding?.sourceIdentityKey ?? null,
    latestGoalBindingObservationKey: latestGoalBinding?.latestObservationKey ?? null,
    latestGoalBindingMailLoopObservationKey: latestGoalBinding?.latestMailLoopObservationKey ?? null,
    latestGoalBindingKeyFromBinding: latestGoalBinding?.goalBindingKey ?? null,
    observedLaneActivityCount: observedLaneSessionCount + observedMailLoopCount + observedGoalBindingCount,
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
}

export function subscribeDocumentLiveTranslationProjectionRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDocumentLiveTranslationProjectionRegistry(): void {
  if (snapshots.size === 0) return;
  snapshots.clear();
  registryVersion += 1;
  emitRegistryChange();
}

export function ingestDocumentLiveTranslationProjection(
  input: IngestDocumentLiveTranslationProjectionInput,
): DocumentLiveTranslationProjectionSnapshot {
  const key = documentLiveTranslationProjectionRegistryKey(input);
  const current = snapshots.get(key) ?? emptySnapshot;
  const laneStates = buildDocumentLiveTranslationInlineStates({
    payload: input.payload,
    docPath: input.docPath,
    locale: input.locale,
    targetLanguage: input.targetLanguage,
    sourceHash: input.sourceHash,
    sourceIdentityKey: input.sourceIdentityKey,
    sourceTextHash: input.sourceTextHash,
    sourceTextCharCount: input.sourceTextCharCount,
    units: input.units,
    projectionTarget: normalizeHelixLiveTranslationProjectionTarget(input.projectionTarget, DEFAULT_PROJECTION_TARGET),
    allowStaleDisplayText: input.allowStaleDisplayText,
  });
  const translations = mergeDocumentLiveTranslationInlineStates({
    current: current.translations,
    laneStates,
  });
  const changed = !sameTranslationStateMap(current.translations, translations);
  if (!changed) return current;
  const snapshot = {
    version: ++registryVersion,
    translations,
    laneSessions: current.laneSessions,
    mailLoops: current.mailLoops,
    goalBindings: current.goalBindings,
  };
  snapshots.set(key, snapshot);
  emitRegistryChange();
  return snapshot;
}

export function ingestDocumentLiveTranslationProjectionFromAskLiveEvent(
  input: IngestDocumentLiveTranslationProjectionLiveEventInput,
): DocumentLiveTranslationProjectionSnapshot {
  const meta = readRecord(input.eventPayload.entry.meta);
  const sourceEventType = readString(meta?.sourceEventType ?? meta?.source_event_type);
  const lane = readString(meta?.lane);
  const sourceId = readString(meta?.sourceId ?? meta?.source_id);
  const eventSourceHash = readString(meta?.sourceHash ?? meta?.source_hash);
  const eventMatchesCurrentDocument = liveEventMatchesDocumentSource({
    meta,
    sourceId,
    docPath: input.docPath,
  });
  const sourceHashMatchesCurrentDocument = sourceHashMatches(eventSourceHash, input.sourceHash);
  const canUseChunkScopedDocumentIdentity =
    eventMatchesCurrentDocument &&
    sourceIdIsDocumentChunk(sourceId, input.docPath);
  if (!sourceHashMatchesCurrentDocument && !canUseChunkScopedDocumentIdentity) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }
  if (
    sourceEventType === "lane_session" &&
    lane === "live_translation" &&
    sourceIdMatchesDocument(sourceId, input.docPath)
  ) {
    if (!sourceIdentityKeyMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    if (!sourceTextIdentityMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    return ingestDocumentLiveTranslationLaneSessionFromAskLiveEvent({
      ...input,
      meta,
      sourceId,
    });
  }
  if (
    sourceEventType === "lane_mail_loop" &&
    lane === "live_translation" &&
    sourceIdMatchesDocument(sourceId, input.docPath)
  ) {
    if (!sourceIdentityKeyMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    if (!sourceTextIdentityMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    return ingestDocumentLiveTranslationMailLoopFromAskLiveEvent({
      ...input,
      meta,
      sourceId,
    });
  }
  if (
    sourceEventType === "lane_goal_binding" &&
    lane === "live_translation" &&
    sourceIdMatchesDocument(sourceId, input.docPath)
  ) {
    if (!sourceIdentityKeyMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    if (!sourceTextIdentityMatches(meta, input)) {
      return readDocumentLiveTranslationProjectionSnapshot(input);
    }
    return ingestDocumentLiveTranslationGoalBindingFromAskLiveEvent({
      ...input,
      meta,
      sourceId,
    });
  }
  const isProjectionReceiptEvent =
    sourceEventType === "ui_translation_projection" ||
    sourceEventType === "lane_projection_receipt";
  if (!isProjectionReceiptEvent || lane !== "live_translation" || !eventMatchesCurrentDocument) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }

  const projectionTarget = readLiveTranslationProjectionTarget(meta, input.projectionTarget);
  const targetLanguage =
    readString(meta?.targetLanguage ?? meta?.target_language) ||
    readString(meta?.latestTargetLanguage ?? meta?.latest_target_language) ||
    normalizeText(input.locale);
  const eventSourceTextHash = readString(meta?.sourceTextHash ?? meta?.source_text_hash);
  const eventSourceTextCharCount = readNumber(meta?.sourceTextCharCount ?? meta?.source_text_char_count);
  const isExplicitDocumentProjection =
    projectionTarget === HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK &&
    eventMatchesCurrentDocument &&
    Boolean(targetLanguage);
  if (!localeMatches(targetLanguage, input.locale) && !isExplicitDocumentProjection) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }
  const payload = {
    capability_lane_projection_receipts: [
      {
        schema: "helix.live_translation.projection_receipt.v1",
        projection_key: readString(meta?.projectionKey ?? meta?.projection_key) || null,
        receipt_ref: readString(meta?.receiptRef ?? meta?.receipt_ref) || null,
        observation_ref: readString(meta?.observationRef ?? meta?.observation_ref) || null,
        lane_session_id: readString(meta?.laneSessionId ?? meta?.lane_session_id) || null,
        observation_lane_session_id:
          readString(meta?.observationLaneSessionId ?? meta?.observation_lane_session_id) || null,
        goal_binding_id: readString(meta?.goalBindingId ?? meta?.goal_binding_id) || null,
        source_binding_key: readString(meta?.sourceBindingKey ?? meta?.source_binding_key) || null,
        source_identity_key:
          readString(meta?.latestSourceIdentityKey ?? meta?.latest_source_identity_key) ||
          readString(meta?.sourceIdentityKey ?? meta?.source_identity_key) ||
          null,
        latest_source_identity_key:
          readString(meta?.latestSourceIdentityKey ?? meta?.latest_source_identity_key) ||
          readString(meta?.sourceIdentityKey ?? meta?.source_identity_key) ||
          null,
        latest_observation_key: readString(meta?.latestObservationKey ?? meta?.latest_observation_key) || null,
        latest_mail_loop_observation_key:
          readString(meta?.latestMailLoopObservationKey ?? meta?.latest_mail_loop_observation_key) || null,
        goal_binding_key: readString(meta?.goalBindingKey ?? meta?.goal_binding_key) || null,
        latest_event_id: readString(meta?.latestEventId ?? meta?.latest_event_id) || null,
        session_control_key:
          readString(meta?.sessionControlKey ?? meta?.session_control_key) ||
          readString(meta?.laneSessionControlKey ?? meta?.lane_session_control_key) ||
          null,
        has_observation: readOptionalBoolean(meta?.hasObservation ?? meta?.has_observation) ??
          Boolean(readString(meta?.observationRef ?? meta?.observation_ref)),
        selected_runtime_agent_provider:
          readString(meta?.selectedRuntimeAgentProvider ?? meta?.selected_runtime_agent_provider) ||
          readString(meta?.agentRuntime ?? meta?.agent_runtime) ||
          null,
        selected_backend_provider:
          readString(meta?.selectedBackendProvider ?? meta?.selected_backend_provider) || null,
        lane_id: "live_translation",
        capability: "live_translation.translate_text",
        projection_target: projectionTarget,
        projection_status: readString(meta?.projectionStatus ?? meta?.projection_status) || "projected",
        source_id: sourceId,
        bbox:
          readRecord(meta?.bbox) ||
          readRecord(meta?.bbox_px) ||
          readRecord(meta?.bboxPx) ||
          null,
        doc_path:
          readString(meta?.docPath ?? meta?.doc_path) ||
          (sourceIdMatchesDocument(sourceId, input.docPath) ? input.docPath : null),
        source_hash: eventSourceHash || normalizeText(input.sourceHash) || null,
        source_kind: normalizeSourceKind(meta?.sourceKind ?? meta?.source_kind),
        account_locale:
          readString(meta?.accountLocale ?? meta?.account_locale) ||
          readString(meta?.latestAccountLocale ?? meta?.latest_account_locale) ||
          null,
        chunk_id: readString(meta?.latestChunkId ?? meta?.latest_chunk_id ?? meta?.chunkId ?? meta?.chunk_id) || null,
        chunk_index: readNumber(meta?.latestChunkIndex ?? meta?.latest_chunk_index ?? meta?.chunkIndex ?? meta?.chunk_index),
        dedupe_key: readString(meta?.latestDedupeKey ?? meta?.latest_dedupe_key ?? meta?.dedupeKey ?? meta?.dedupe_key) || null,
        source_event_id:
          readString(meta?.latestSourceEventId ?? meta?.latest_source_event_id ?? meta?.sourceEventId ?? meta?.source_event_id) ||
          null,
        source_event_ms: readNumber(meta?.latestSourceEventMs ?? meta?.latest_source_event_ms ?? meta?.sourceEventMs ?? meta?.source_event_ms),
        observed_at_ms: readNumber(meta?.latestObservedAtMs ?? meta?.latest_observed_at_ms ?? meta?.observedAtMs ?? meta?.observed_at_ms),
        freshness_status:
          readString(meta?.latestFreshnessStatus ?? meta?.latest_freshness_status ?? meta?.freshnessStatus ?? meta?.freshness_status) ||
          "unknown",
        target_language: targetLanguage,
        source_text_hash: eventSourceTextHash || null,
        source_text_char_count: eventSourceTextCharCount,
        translated_text: readString(meta?.translatedText ?? meta?.translated_text) || null,
        cancel_requested: readBoolean(meta?.latestCancelRequested ?? meta?.latest_cancel_requested ?? meta?.cancelRequested ?? meta?.cancel_requested),
        terminal_authority_status: readTerminalAuthorityStatus(
          meta?.terminalAuthorityStatus ?? meta?.terminal_authority_status,
        ),
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      },
    ],
  };

  return ingestDocumentLiveTranslationProjection({
    docPath: input.docPath,
    locale: input.locale,
    sourceHash: input.sourceHash,
    sourceIdentityKey: input.sourceIdentityKey,
    sourceTextHash: canUseChunkScopedDocumentIdentity
      ? eventSourceTextHash || input.sourceTextHash
      : input.sourceTextHash,
    sourceTextCharCount: canUseChunkScopedDocumentIdentity && eventSourceTextCharCount !== null
      ? eventSourceTextCharCount
      : input.sourceTextCharCount,
    projectionTarget,
    units: input.units,
    payload,
    targetLanguage,
    allowStaleDisplayText: input.allowStaleDisplayText,
  });
}

function ingestDocumentLiveTranslationLaneSessionFromAskLiveEvent(
  input: IngestDocumentLiveTranslationProjectionLiveEventInput & {
    meta: Record<string, unknown>;
    sourceId: string;
  },
): DocumentLiveTranslationProjectionSnapshot {
  const projectionTarget = readLiveTranslationProjectionTarget(input.meta, input.projectionTarget);
  if (projectionTarget !== normalizeHelixLiveTranslationProjectionTarget(input.projectionTarget, DEFAULT_PROJECTION_TARGET)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }

  const accountLocale =
    readString(input.meta.accountLocale ?? input.meta.account_locale) ||
    readString(input.meta.latestAccountLocale ?? input.meta.latest_account_locale);
  if (!localeMatches(accountLocale, input.locale)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }
  const targetLanguage =
    readString(input.meta.targetLanguage ?? input.meta.target_language) ||
    readString(input.meta.latestTargetLanguage ?? input.meta.latest_target_language) ||
    accountLocale;

  const laneSessionId = readString(input.meta.laneSessionId ?? input.meta.lane_session_id);
  if (!laneSessionId) return readDocumentLiveTranslationProjectionSnapshot(input);
  const sourceHash =
    readString(input.meta.sourceHash ?? input.meta.source_hash) ||
    normalizeText(input.sourceHash) ||
    null;

  const key = documentLiveTranslationProjectionRegistryKey(input);
  const current = snapshots.get(key) ?? emptySnapshot;
  const lastObservationRef = readString(input.meta.observationRef ?? input.meta.observation_ref) || null;
  const lastReceiptRef =
    readString(input.meta.latestReceiptRef ?? input.meta.latest_receipt_ref) ||
    readString(input.meta.receiptRef ?? input.meta.receipt_ref) ||
    readString(input.meta.lastReceiptRef ?? input.meta.last_receipt_ref) ||
    null;
  const latestObservationKey =
    readString(input.meta.latestObservationKey ?? input.meta.latest_observation_key) || null;
  const hasObservation = Boolean(
    readOptionalBoolean(input.meta.hasObservation ?? input.meta.has_observation) ||
      lastObservationRef ||
      lastReceiptRef,
  );
  const nextSession: DocumentLiveTranslationLaneSessionState = {
    laneSessionId,
    laneId: "live_translation",
    lifecycleAction:
      readString(
        input.meta.sessionLifecycleAction ??
          input.meta.session_lifecycle_action ??
          input.meta.lifecycleAction ??
          input.meta.lifecycle_action ??
          input.meta.sessionAction ??
          input.meta.session_action,
      ) || null,
    lifecycleReason:
      readString(
        input.meta.latestSessionReason ??
          input.meta.latest_session_reason ??
          input.meta.sessionReason ??
          input.meta.session_reason ??
          input.meta.lifecycleReason ??
          input.meta.lifecycle_reason ??
          input.meta.reason,
      ) || null,
    sessionDebugPhase:
      readString(input.meta.sessionDebugPhase ?? input.meta.session_debug_phase) || null,
    sessionObservationStatus:
      readString(input.meta.sessionObservationStatus ?? input.meta.session_observation_status) || null,
    permissionProfile:
      readString(input.meta.permissionProfile ?? input.meta.permission_profile ?? input.meta.sessionPermissionProfile ?? input.meta.session_permission_profile) ||
      null,
    sessionStatus:
      readString(input.meta.sessionStatus ?? input.meta.session_status) ||
      readString(input.meta.status) ||
      "unknown",
    sessionHealth: readString(input.meta.sessionHealth ?? input.meta.session_health) || "unknown",
    sourceId: input.sourceId,
    ...(sourceHash ? { sourceHash } : {}),
    sourceKind: normalizeSourceKind(input.meta.sourceKind ?? input.meta.source_kind),
    ...(readString(input.meta.sourceTextHash ?? input.meta.source_text_hash)
      ? { sourceTextHash: readString(input.meta.sourceTextHash ?? input.meta.source_text_hash) }
      : {}),
    ...(readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) !== null
      ? { sourceTextCharCount: readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) }
      : {}),
    projectionTarget,
    accountLocale: accountLocale || null,
    targetLanguage: targetLanguage || null,
    ...(readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
      readString(input.meta.agentRuntime ?? input.meta.agent_runtime)
      ? {
        selectedRuntimeAgentProvider:
          readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
          readString(input.meta.agentRuntime ?? input.meta.agent_runtime),
      }
      : {}),
    selectedBackendProvider:
      readString(input.meta.selectedBackendProvider ?? input.meta.selected_backend_provider) || null,
    latestChunkId: readString(input.meta.latestChunkId ?? input.meta.latest_chunk_id) || null,
    latestChunkIndex: readNumber(input.meta.latestChunkIndex ?? input.meta.latest_chunk_index),
    latestDedupeKey: readString(input.meta.latestDedupeKey ?? input.meta.latest_dedupe_key) || null,
    latestSourceEventId:
      readString(input.meta.latestSourceEventId ?? input.meta.latest_source_event_id) || null,
    latestSourceEventMs: readNumber(input.meta.latestSourceEventMs ?? input.meta.latest_source_event_ms),
    latestObservedAtMs: readNumber(input.meta.latestObservedAtMs ?? input.meta.latest_observed_at_ms),
    latestFreshnessStatus:
      readString(input.meta.latestFreshnessStatus ?? input.meta.latest_freshness_status) || null,
    latestEventId: readString(input.meta.latestEventId ?? input.meta.latest_event_id) || null,
    ...(readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
      readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key)
      ? {
        sessionControlKey:
          readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
          readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key),
      }
      : {}),
    sourceBindingKey:
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    latestSourceBindingKey:
      readString(input.meta.latestSourceBindingKey ?? input.meta.latest_source_binding_key) ||
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    sourceIdentityKey:
      readString(input.meta.latestSourceIdentityKey ?? input.meta.latest_source_identity_key) ||
      readString(input.meta.sourceIdentityKey ?? input.meta.source_identity_key) ||
      readString(input.meta.goalBindingSourceIdentityKey ?? input.meta.goal_binding_source_identity_key) ||
      readString(input.meta.latestGoalBindingSourceIdentityKey ?? input.meta.latest_goal_binding_source_identity_key) ||
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    laneSessionSourceBindingKey:
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    laneSessionSourceIdentityKey:
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    latestObservationKey,
    hasObservation,
    terminalAuthorityStatus: readTerminalAuthorityStatus(
      input.meta.terminalAuthorityStatus ?? input.meta.terminal_authority_status,
    ),
    lastObservationRef,
    lastReceiptRef,
    updatedAtMs: readNumber(input.meta.updatedAtMs ?? input.meta.updated_at_ms) ??
      readNumber(input.meta.latestObservedAtMs ?? input.meta.latest_observed_at_ms),
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
  const previous = current.laneSessions[laneSessionId];
  if (sameDocumentLiveTranslationLaneSessionState(previous, nextSession)) return current;
  if (shouldKeepCurrentLaneSessionState(previous, nextSession)) return current;
  const snapshot = {
    version: ++registryVersion,
    translations: current.translations,
    laneSessions: {
      ...current.laneSessions,
      [laneSessionId]: nextSession,
    },
    mailLoops: current.mailLoops,
    goalBindings: current.goalBindings,
  };
  snapshots.set(key, snapshot);
  emitRegistryChange();
  return snapshot;
}

function ingestDocumentLiveTranslationMailLoopFromAskLiveEvent(
  input: IngestDocumentLiveTranslationProjectionLiveEventInput & {
    meta: Record<string, unknown>;
    sourceId: string;
  },
): DocumentLiveTranslationProjectionSnapshot {
  const projectionTarget = readLiveTranslationProjectionTarget(input.meta, input.projectionTarget);
  if (projectionTarget !== normalizeHelixLiveTranslationProjectionTarget(input.projectionTarget, DEFAULT_PROJECTION_TARGET)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }
  const targetLanguage =
    readString(input.meta.targetLanguage ?? input.meta.target_language) ||
    readString(input.meta.latestTargetLanguage ?? input.meta.latest_target_language);
  if (!localeMatches(targetLanguage, input.locale)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }

  const mailLoopId =
    readString(input.meta.stagePlayMailId ?? input.meta.stage_play_mail_id) ||
    readString(input.meta.observationRef ?? input.meta.observation_ref) ||
    readString(input.eventPayload.entry.id);
  if (!mailLoopId) return readDocumentLiveTranslationProjectionSnapshot(input);
  const sourceHash =
    readString(input.meta.sourceHash ?? input.meta.source_hash) ||
    normalizeText(input.sourceHash) ||
    null;

  const key = documentLiveTranslationProjectionRegistryKey(input);
  const current = snapshots.get(key) ?? emptySnapshot;
  const previous = current.mailLoops[mailLoopId];
  const observationRef = readString(input.meta.observationRef ?? input.meta.observation_ref) || null;
  const receiptRef =
    readString(input.meta.latestReceiptRef ?? input.meta.latest_receipt_ref) ||
    readString(input.meta.receiptRef ?? input.meta.receipt_ref) ||
    readString(input.meta.lastReceiptRef ?? input.meta.last_receipt_ref) ||
    null;
  const latestMailLoopObservationKey =
    readString(input.meta.latestMailLoopObservationKey ?? input.meta.latest_mail_loop_observation_key) ||
    readString(input.meta.mailLoopObservationKey ?? input.meta.mail_loop_observation_key) ||
    null;
  const hasObservation = Boolean(
    readOptionalBoolean(input.meta.hasObservation ?? input.meta.has_observation) ||
      observationRef ||
      receiptRef ||
      latestMailLoopObservationKey,
  );
  const stagePlayMailDeliveryStatus =
    readString(input.meta.stagePlayMailDeliveryStatus ?? input.meta.stage_play_mail_delivery_status) ||
    previous?.stagePlayMailDeliveryStatus ||
    null;
  const previousStagePlayMailId =
    readString(input.meta.previousStagePlayMailId ?? input.meta.previous_stage_play_mail_id) ||
    previous?.previousStagePlayMailId ||
    null;
  const stagePlayWakeExpected = readBoolean(
    input.meta.stagePlayWakeExpected ?? input.meta.stage_play_wake_expected,
  );
  const stagePlayWakeKind = readStagePlayWakeKind(
    input.meta.stagePlayWakeKind ?? input.meta.stage_play_wake_kind,
    stagePlayWakeExpected,
  );
  const nextMailLoop: DocumentLiveTranslationMailLoopState = {
    mailLoopId,
    laneSessionId: readString(input.meta.laneSessionId ?? input.meta.lane_session_id) || null,
    observationLaneSessionId:
      readString(input.meta.observationLaneSessionId ?? input.meta.observation_lane_session_id) || null,
    laneId: "live_translation",
    stagePlayMailId: readString(input.meta.stagePlayMailId ?? input.meta.stage_play_mail_id) || null,
    stagePlayMailDeliveryStatus,
    previousStagePlayMailId,
    stagePlayWakeExpected,
    stagePlayWakeKind,
    mailboxWakeExpected: readMailboxWakeExpected({
      explicit: input.meta.mailboxWakeExpected ?? input.meta.mailbox_wake_expected,
      wakeKind: stagePlayWakeKind,
      fallbackWakeExpected: stagePlayWakeExpected,
    }),
    decisionWakeExpected: false,
    mailboxThreadId: readString(input.meta.mailboxThreadId ?? input.meta.mailbox_thread_id) || null,
    mailStatus: readString(input.meta.mailStatus ?? input.meta.mail_status) || null,
    blockedReason: readString(input.meta.blockedReason ?? input.meta.blocked_reason) || null,
    sourceId: input.sourceId,
    ...(sourceHash ? { sourceHash } : {}),
    sourceKind: normalizeSourceKind(input.meta.sourceKind ?? input.meta.source_kind),
    ...(readString(input.meta.sourceTextHash ?? input.meta.source_text_hash)
      ? { sourceTextHash: readString(input.meta.sourceTextHash ?? input.meta.source_text_hash) }
      : {}),
    ...(readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) !== null
      ? { sourceTextCharCount: readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) }
      : {}),
    projectionTarget,
    accountLocale:
      readString(input.meta.accountLocale ?? input.meta.account_locale) ||
      readString(input.meta.latestAccountLocale ?? input.meta.latest_account_locale) ||
      null,
    targetLanguage: targetLanguage || null,
    ...(readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
      readString(input.meta.agentRuntime ?? input.meta.agent_runtime)
      ? {
        selectedRuntimeAgentProvider:
          readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
          readString(input.meta.agentRuntime ?? input.meta.agent_runtime),
      }
      : {}),
    selectedBackendProvider:
      readString(input.meta.selectedBackendProvider ?? input.meta.selected_backend_provider) || null,
    latestChunkId: readString(input.meta.latestChunkId ?? input.meta.latest_chunk_id) || null,
    latestChunkIndex: readNumber(input.meta.latestChunkIndex ?? input.meta.latest_chunk_index),
    latestDedupeKey: readString(input.meta.latestDedupeKey ?? input.meta.latest_dedupe_key) || null,
    latestSourceEventId:
      readString(input.meta.latestSourceEventId ?? input.meta.latest_source_event_id) || null,
    latestSourceEventMs: readNumber(input.meta.latestSourceEventMs ?? input.meta.latest_source_event_ms),
    latestObservedAtMs: readNumber(input.meta.latestObservedAtMs ?? input.meta.latest_observed_at_ms),
    latestFreshnessStatus:
      readString(input.meta.latestFreshnessStatus ?? input.meta.latest_freshness_status) || null,
    latestEventId: readString(input.meta.latestEventId ?? input.meta.latest_event_id) || null,
    ...(readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
      readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key)
      ? {
        sessionControlKey:
          readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
          readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key),
      }
      : {}),
    sourceBindingKey:
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    latestSourceBindingKey:
      readString(input.meta.latestSourceBindingKey ?? input.meta.latest_source_binding_key) ||
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    sourceIdentityKey:
      readString(input.meta.latestSourceIdentityKey ?? input.meta.latest_source_identity_key) ||
      readString(input.meta.sourceIdentityKey ?? input.meta.source_identity_key) ||
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    laneSessionSourceBindingKey:
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    laneSessionSourceIdentityKey:
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    latestMailLoopObservationKey,
    hasObservation,
    terminalAuthorityStatus: readTerminalAuthorityStatus(
      input.meta.terminalAuthorityStatus ?? input.meta.terminal_authority_status,
    ),
    observationRef,
    receiptRef,
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
  if (sameDocumentLiveTranslationMailLoopState(previous, nextMailLoop)) return current;
  if (shouldKeepCurrentMailLoopState(previous, nextMailLoop)) return current;
  const snapshot = {
    version: ++registryVersion,
    translations: current.translations,
    laneSessions: current.laneSessions,
    mailLoops: {
      ...current.mailLoops,
      [mailLoopId]: nextMailLoop,
    },
    goalBindings: current.goalBindings,
  };
  snapshots.set(key, snapshot);
  emitRegistryChange();
  return snapshot;
}

function ingestDocumentLiveTranslationGoalBindingFromAskLiveEvent(
  input: IngestDocumentLiveTranslationProjectionLiveEventInput & {
    meta: Record<string, unknown>;
    sourceId: string;
  },
): DocumentLiveTranslationProjectionSnapshot {
  const projectionTarget = readLiveTranslationProjectionTarget(input.meta, input.projectionTarget);
  if (projectionTarget !== normalizeHelixLiveTranslationProjectionTarget(input.projectionTarget, DEFAULT_PROJECTION_TARGET)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }
  const targetLanguage =
    readString(input.meta.targetLanguage ?? input.meta.target_language) ||
    readString(input.meta.latestTargetLanguage ?? input.meta.latest_target_language);
  if (!localeMatches(targetLanguage, input.locale)) {
    return readDocumentLiveTranslationProjectionSnapshot(input);
  }

  const goalBindingId =
    readString(input.meta.goalBindingId ?? input.meta.goal_binding_id) ||
    readString(input.eventPayload.entry.id);
  if (!goalBindingId) return readDocumentLiveTranslationProjectionSnapshot(input);
  const sourceHash =
    readString(input.meta.sourceHash ?? input.meta.source_hash) ||
    normalizeText(input.sourceHash) ||
    null;

  const key = documentLiveTranslationProjectionRegistryKey(input);
  const current = snapshots.get(key) ?? emptySnapshot;
  const observationRef = readString(input.meta.observationRef ?? input.meta.observation_ref) || null;
  const receiptRef =
    readString(input.meta.latestReceiptRef ?? input.meta.latest_receipt_ref) ||
    readString(input.meta.receiptRef ?? input.meta.receipt_ref) ||
    readString(input.meta.lastReceiptRef ?? input.meta.last_receipt_ref) ||
    null;
  const latestObservationKey =
    readString(input.meta.latestObservationKey ?? input.meta.latest_observation_key) || null;
  const latestMailLoopObservationKey =
    readString(input.meta.latestMailLoopObservationKey ?? input.meta.latest_mail_loop_observation_key) ||
    readString(input.meta.mailLoopObservationKey ?? input.meta.mail_loop_observation_key) ||
    null;
  const hasObservation = Boolean(
    readOptionalBoolean(input.meta.hasObservation ?? input.meta.has_observation) ||
      observationRef ||
      receiptRef ||
      latestObservationKey ||
      latestMailLoopObservationKey,
  );
  const nextGoalBinding: DocumentLiveTranslationGoalBindingState = {
    goalBindingId,
    goalId: readString(input.meta.goalId ?? input.meta.goal_id) || null,
    laneSessionId: readString(input.meta.laneSessionId ?? input.meta.lane_session_id) || null,
    laneId: "live_translation",
    bindingStatus: readString(input.meta.bindingStatus ?? input.meta.binding_status) || null,
    sessionStatus:
      readString(input.meta.sessionStatus ?? input.meta.session_status) ||
      readString(input.meta.status) ||
      null,
    sessionHealth: readString(input.meta.sessionHealth ?? input.meta.session_health) || null,
    activationPolicy: readString(input.meta.activationPolicy ?? input.meta.activation_policy) || null,
    attentionPolicy: readString(input.meta.attentionPolicy ?? input.meta.attention_policy) || null,
    stopCondition: readString(input.meta.stopCondition ?? input.meta.stop_condition) || null,
    reportPolicy: readString(input.meta.reportPolicy ?? input.meta.report_policy) || null,
    quietBehavior: readString(input.meta.quietBehavior ?? input.meta.quiet_behavior) || null,
    reportAction: readString(input.meta.reportAction ?? input.meta.report_action) || null,
    reportReason: readString(input.meta.reportReason ?? input.meta.report_reason) || null,
    quietBehaviorApplied: readOptionalBoolean(input.meta.quietBehaviorApplied ?? input.meta.quiet_behavior_applied),
    wakeExpected: readOptionalBoolean(input.meta.wakeExpected ?? input.meta.wake_expected),
    mailboxWakeExpected:
      readOptionalBoolean(input.meta.mailboxWakeExpected ?? input.meta.mailbox_wake_expected),
    decisionWakeExpected:
      readOptionalBoolean(input.meta.decisionWakeExpected ?? input.meta.decision_wake_expected) ?? false,
    surfaceBadgeExpected:
      readOptionalBoolean(input.meta.surfaceBadgeExpected ?? input.meta.surface_badge_expected),
    terminalReportRequested:
      readOptionalBoolean(input.meta.terminalReportRequested ?? input.meta.terminal_report_requested),
    terminalReportAuthorized:
      readOptionalBoolean(input.meta.terminalReportAuthorized ?? input.meta.terminal_report_authorized),
    ...(readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
      readString(input.meta.agentRuntime ?? input.meta.agent_runtime)
      ? {
        selectedRuntimeAgentProvider:
          readString(input.meta.selectedRuntimeAgentProvider ?? input.meta.selected_runtime_agent_provider) ||
          readString(input.meta.agentRuntime ?? input.meta.agent_runtime),
      }
      : {}),
    selectedBackendProvider:
      readString(input.meta.selectedBackendProvider ?? input.meta.selected_backend_provider) || null,
    sourceId: input.sourceId,
    ...(sourceHash ? { sourceHash } : {}),
    sourceKind: normalizeSourceKind(input.meta.sourceKind ?? input.meta.source_kind),
    ...(readString(input.meta.sourceTextHash ?? input.meta.source_text_hash)
      ? { sourceTextHash: readString(input.meta.sourceTextHash ?? input.meta.source_text_hash) }
      : {}),
    ...(readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) !== null
      ? { sourceTextCharCount: readNumber(input.meta.sourceTextCharCount ?? input.meta.source_text_char_count) }
      : {}),
    projectionTarget,
    accountLocale:
      readString(input.meta.accountLocale ?? input.meta.account_locale) ||
      readString(input.meta.latestAccountLocale ?? input.meta.latest_account_locale) ||
      null,
    targetLanguage: targetLanguage || null,
    latestChunkId: readString(input.meta.latestChunkId ?? input.meta.latest_chunk_id) || null,
    latestChunkIndex: readNumber(input.meta.latestChunkIndex ?? input.meta.latest_chunk_index),
    latestDedupeKey: readString(input.meta.latestDedupeKey ?? input.meta.latest_dedupe_key) || null,
    latestSourceEventId:
      readString(input.meta.latestSourceEventId ?? input.meta.latest_source_event_id) || null,
    latestSourceEventMs: readNumber(input.meta.latestSourceEventMs ?? input.meta.latest_source_event_ms),
    latestObservedAtMs: readNumber(input.meta.latestObservedAtMs ?? input.meta.latest_observed_at_ms),
    latestFreshnessStatus:
      readString(input.meta.latestFreshnessStatus ?? input.meta.latest_freshness_status) || null,
    latestEventId: readString(input.meta.latestEventId ?? input.meta.latest_event_id) || null,
    ...(readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
      readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key)
      ? {
        sessionControlKey:
          readString(input.meta.sessionControlKey ?? input.meta.session_control_key) ||
          readString(input.meta.laneSessionControlKey ?? input.meta.lane_session_control_key),
      }
      : {}),
    goalBindingKey: readString(input.meta.goalBindingKey ?? input.meta.goal_binding_key) || null,
    sourceBindingKey:
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.goalBindingSourceBindingKey ?? input.meta.goal_binding_source_binding_key) ||
      readString(input.meta.latestGoalBindingSourceBindingKey ?? input.meta.latest_goal_binding_source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    latestSourceBindingKey:
      readString(input.meta.latestSourceBindingKey ?? input.meta.latest_source_binding_key) ||
      readString(input.meta.latestGoalBindingSourceBindingKey ?? input.meta.latest_goal_binding_source_binding_key) ||
      readString(input.meta.sourceBindingKey ?? input.meta.source_binding_key) ||
      readString(input.meta.goalBindingSourceBindingKey ?? input.meta.goal_binding_source_binding_key) ||
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    sourceIdentityKey:
      readString(input.meta.latestSourceIdentityKey ?? input.meta.latest_source_identity_key) ||
      readString(input.meta.sourceIdentityKey ?? input.meta.source_identity_key) ||
      readString(input.meta.goalBindingSourceIdentityKey ?? input.meta.goal_binding_source_identity_key) ||
      readString(input.meta.latestGoalBindingSourceIdentityKey ?? input.meta.latest_goal_binding_source_identity_key) ||
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    laneSessionSourceBindingKey:
      readString(input.meta.laneSessionSourceBindingKey ?? input.meta.lane_session_source_binding_key) ||
      null,
    laneSessionSourceIdentityKey:
      readString(input.meta.laneSessionSourceIdentityKey ?? input.meta.lane_session_source_identity_key) ||
      null,
    latestObservationKey,
    latestMailLoopObservationKey,
    hasObservation,
    terminalAuthorityStatus: readTerminalAuthorityStatus(
      input.meta.terminalAuthorityStatus ?? input.meta.terminal_authority_status,
    ),
    observationRef,
    receiptRef,
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
  const previous = current.goalBindings[goalBindingId];
  if (sameDocumentLiveTranslationGoalBindingState(previous, nextGoalBinding)) return current;
  if (shouldKeepCurrentGoalBindingState(previous, nextGoalBinding)) return current;
  const snapshot = {
    version: ++registryVersion,
    translations: current.translations,
    laneSessions: current.laneSessions,
    mailLoops: current.mailLoops,
    goalBindings: {
      ...current.goalBindings,
      [goalBindingId]: nextGoalBinding,
    },
  };
  snapshots.set(key, snapshot);
  emitRegistryChange();
  return snapshot;
}

function emitRegistryChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function sameTranslationStateMap(
  left: Record<string, DocumentInlineTranslationRenderState>,
  right: Record<string, DocumentInlineTranslationRenderState>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const leftState = left[key];
    const rightState = right[key];
    if (!sameDocumentInlineTranslationRenderState(leftState, rightState)) return false;
  }
  return true;
}

function sameDocumentLiveTranslationLaneSessionState(
  left: DocumentLiveTranslationLaneSessionState | undefined,
  right: DocumentLiveTranslationLaneSessionState | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.laneSessionId === right.laneSessionId &&
    left.laneId === right.laneId &&
    (left.lifecycleAction ?? "") === (right.lifecycleAction ?? "") &&
    (left.lifecycleReason ?? "") === (right.lifecycleReason ?? "") &&
    (left.sessionDebugPhase ?? "") === (right.sessionDebugPhase ?? "") &&
    (left.sessionObservationStatus ?? "") === (right.sessionObservationStatus ?? "") &&
    (left.permissionProfile ?? "") === (right.permissionProfile ?? "") &&
    left.sessionStatus === right.sessionStatus &&
    left.sessionHealth === right.sessionHealth &&
    (left.sourceId ?? "") === (right.sourceId ?? "") &&
    (left.sourceHash ?? "") === (right.sourceHash ?? "") &&
    (left.sourceKind ?? "") === (right.sourceKind ?? "") &&
    (left.sourceTextHash ?? "") === (right.sourceTextHash ?? "") &&
    (left.sourceTextCharCount ?? null) === (right.sourceTextCharCount ?? null) &&
    (left.projectionTarget ?? "") === (right.projectionTarget ?? "") &&
    (left.accountLocale ?? "") === (right.accountLocale ?? "") &&
    (left.targetLanguage ?? "") === (right.targetLanguage ?? "") &&
    (left.selectedRuntimeAgentProvider ?? "") === (right.selectedRuntimeAgentProvider ?? "") &&
    (left.selectedBackendProvider ?? "") === (right.selectedBackendProvider ?? "") &&
    (left.latestChunkId ?? "") === (right.latestChunkId ?? "") &&
    (left.latestChunkIndex ?? null) === (right.latestChunkIndex ?? null) &&
    (left.latestDedupeKey ?? "") === (right.latestDedupeKey ?? "") &&
    (left.latestSourceEventId ?? "") === (right.latestSourceEventId ?? "") &&
    (left.latestSourceEventMs ?? null) === (right.latestSourceEventMs ?? null) &&
    (left.latestObservedAtMs ?? null) === (right.latestObservedAtMs ?? null) &&
    (left.latestFreshnessStatus ?? "") === (right.latestFreshnessStatus ?? "") &&
    (left.latestEventId ?? "") === (right.latestEventId ?? "") &&
    (left.sessionControlKey ?? "") === (right.sessionControlKey ?? "") &&
    (left.sourceBindingKey ?? "") === (right.sourceBindingKey ?? "") &&
    (left.latestSourceBindingKey ?? "") === (right.latestSourceBindingKey ?? "") &&
    (left.sourceIdentityKey ?? "") === (right.sourceIdentityKey ?? "") &&
    (left.laneSessionSourceBindingKey ?? "") === (right.laneSessionSourceBindingKey ?? "") &&
    (left.laneSessionSourceIdentityKey ?? "") === (right.laneSessionSourceIdentityKey ?? "") &&
    (left.latestObservationKey ?? "") === (right.latestObservationKey ?? "") &&
    (left.hasObservation ?? false) === (right.hasObservation ?? false) &&
    left.terminalAuthorityStatus === right.terminalAuthorityStatus &&
    (left.lastObservationRef ?? "") === (right.lastObservationRef ?? "") &&
    (left.lastReceiptRef ?? "") === (right.lastReceiptRef ?? "") &&
    (left.updatedAtMs ?? null) === (right.updatedAtMs ?? null);
}

function sameDocumentLiveTranslationMailLoopState(
  left: DocumentLiveTranslationMailLoopState | undefined,
  right: DocumentLiveTranslationMailLoopState | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.mailLoopId === right.mailLoopId &&
    (left.laneSessionId ?? "") === (right.laneSessionId ?? "") &&
    (left.observationLaneSessionId ?? "") === (right.observationLaneSessionId ?? "") &&
    left.laneId === right.laneId &&
    (left.stagePlayMailId ?? "") === (right.stagePlayMailId ?? "") &&
    (left.stagePlayMailDeliveryStatus ?? "") === (right.stagePlayMailDeliveryStatus ?? "") &&
    (left.previousStagePlayMailId ?? "") === (right.previousStagePlayMailId ?? "") &&
    left.stagePlayWakeExpected === right.stagePlayWakeExpected &&
    left.stagePlayWakeKind === right.stagePlayWakeKind &&
    left.mailboxWakeExpected === right.mailboxWakeExpected &&
    left.decisionWakeExpected === right.decisionWakeExpected &&
    (left.mailboxThreadId ?? "") === (right.mailboxThreadId ?? "") &&
    (left.mailStatus ?? "") === (right.mailStatus ?? "") &&
    (left.blockedReason ?? "") === (right.blockedReason ?? "") &&
    (left.sourceId ?? "") === (right.sourceId ?? "") &&
    (left.sourceHash ?? "") === (right.sourceHash ?? "") &&
    (left.sourceKind ?? "") === (right.sourceKind ?? "") &&
    (left.sourceTextHash ?? "") === (right.sourceTextHash ?? "") &&
    (left.sourceTextCharCount ?? null) === (right.sourceTextCharCount ?? null) &&
    (left.projectionTarget ?? "") === (right.projectionTarget ?? "") &&
    (left.accountLocale ?? "") === (right.accountLocale ?? "") &&
    (left.targetLanguage ?? "") === (right.targetLanguage ?? "") &&
    (left.selectedRuntimeAgentProvider ?? "") === (right.selectedRuntimeAgentProvider ?? "") &&
    (left.selectedBackendProvider ?? "") === (right.selectedBackendProvider ?? "") &&
    (left.latestChunkId ?? "") === (right.latestChunkId ?? "") &&
    (left.latestChunkIndex ?? null) === (right.latestChunkIndex ?? null) &&
    (left.latestDedupeKey ?? "") === (right.latestDedupeKey ?? "") &&
    (left.latestSourceEventId ?? "") === (right.latestSourceEventId ?? "") &&
    (left.latestSourceEventMs ?? null) === (right.latestSourceEventMs ?? null) &&
    (left.latestObservedAtMs ?? null) === (right.latestObservedAtMs ?? null) &&
    (left.latestFreshnessStatus ?? "") === (right.latestFreshnessStatus ?? "") &&
    (left.latestEventId ?? "") === (right.latestEventId ?? "") &&
    (left.sessionControlKey ?? "") === (right.sessionControlKey ?? "") &&
    (left.sourceBindingKey ?? "") === (right.sourceBindingKey ?? "") &&
    (left.latestSourceBindingKey ?? "") === (right.latestSourceBindingKey ?? "") &&
    (left.sourceIdentityKey ?? "") === (right.sourceIdentityKey ?? "") &&
    (left.laneSessionSourceBindingKey ?? "") === (right.laneSessionSourceBindingKey ?? "") &&
    (left.laneSessionSourceIdentityKey ?? "") === (right.laneSessionSourceIdentityKey ?? "") &&
    (left.latestMailLoopObservationKey ?? "") === (right.latestMailLoopObservationKey ?? "") &&
    (left.hasObservation ?? false) === (right.hasObservation ?? false) &&
    left.terminalAuthorityStatus === right.terminalAuthorityStatus &&
    (left.observationRef ?? "") === (right.observationRef ?? "") &&
    (left.receiptRef ?? "") === (right.receiptRef ?? "");
}

function sameDocumentLiveTranslationGoalBindingState(
  left: DocumentLiveTranslationGoalBindingState | undefined,
  right: DocumentLiveTranslationGoalBindingState | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.goalBindingId === right.goalBindingId &&
    (left.goalId ?? "") === (right.goalId ?? "") &&
    (left.laneSessionId ?? "") === (right.laneSessionId ?? "") &&
    left.laneId === right.laneId &&
    (left.bindingStatus ?? "") === (right.bindingStatus ?? "") &&
    (left.sessionStatus ?? "") === (right.sessionStatus ?? "") &&
    (left.sessionHealth ?? "") === (right.sessionHealth ?? "") &&
    (left.activationPolicy ?? "") === (right.activationPolicy ?? "") &&
    (left.attentionPolicy ?? "") === (right.attentionPolicy ?? "") &&
    (left.stopCondition ?? "") === (right.stopCondition ?? "") &&
    (left.reportPolicy ?? "") === (right.reportPolicy ?? "") &&
    (left.quietBehavior ?? "") === (right.quietBehavior ?? "") &&
    (left.reportAction ?? "") === (right.reportAction ?? "") &&
    (left.reportReason ?? "") === (right.reportReason ?? "") &&
    left.quietBehaviorApplied === right.quietBehaviorApplied &&
    left.wakeExpected === right.wakeExpected &&
    left.mailboxWakeExpected === right.mailboxWakeExpected &&
    left.decisionWakeExpected === right.decisionWakeExpected &&
    left.surfaceBadgeExpected === right.surfaceBadgeExpected &&
    left.terminalReportRequested === right.terminalReportRequested &&
    left.terminalReportAuthorized === right.terminalReportAuthorized &&
    (left.selectedRuntimeAgentProvider ?? "") === (right.selectedRuntimeAgentProvider ?? "") &&
    (left.selectedBackendProvider ?? "") === (right.selectedBackendProvider ?? "") &&
    (left.sourceId ?? "") === (right.sourceId ?? "") &&
    (left.sourceHash ?? "") === (right.sourceHash ?? "") &&
    (left.sourceKind ?? "") === (right.sourceKind ?? "") &&
    (left.sourceTextHash ?? "") === (right.sourceTextHash ?? "") &&
    (left.sourceTextCharCount ?? null) === (right.sourceTextCharCount ?? null) &&
    (left.projectionTarget ?? "") === (right.projectionTarget ?? "") &&
    (left.accountLocale ?? "") === (right.accountLocale ?? "") &&
    (left.targetLanguage ?? "") === (right.targetLanguage ?? "") &&
    (left.latestChunkId ?? "") === (right.latestChunkId ?? "") &&
    (left.latestChunkIndex ?? null) === (right.latestChunkIndex ?? null) &&
    (left.latestDedupeKey ?? "") === (right.latestDedupeKey ?? "") &&
    (left.latestSourceEventId ?? "") === (right.latestSourceEventId ?? "") &&
    (left.latestSourceEventMs ?? null) === (right.latestSourceEventMs ?? null) &&
    (left.latestObservedAtMs ?? null) === (right.latestObservedAtMs ?? null) &&
    (left.latestFreshnessStatus ?? "") === (right.latestFreshnessStatus ?? "") &&
    (left.latestEventId ?? "") === (right.latestEventId ?? "") &&
    (left.goalBindingKey ?? "") === (right.goalBindingKey ?? "") &&
    (left.sessionControlKey ?? "") === (right.sessionControlKey ?? "") &&
    (left.sourceBindingKey ?? "") === (right.sourceBindingKey ?? "") &&
    (left.latestSourceBindingKey ?? "") === (right.latestSourceBindingKey ?? "") &&
    (left.sourceIdentityKey ?? "") === (right.sourceIdentityKey ?? "") &&
    (left.laneSessionSourceBindingKey ?? "") === (right.laneSessionSourceBindingKey ?? "") &&
    (left.laneSessionSourceIdentityKey ?? "") === (right.laneSessionSourceIdentityKey ?? "") &&
    (left.latestObservationKey ?? "") === (right.latestObservationKey ?? "") &&
    (left.latestMailLoopObservationKey ?? "") === (right.latestMailLoopObservationKey ?? "") &&
    (left.hasObservation ?? false) === (right.hasObservation ?? false) &&
    left.terminalAuthorityStatus === right.terminalAuthorityStatus &&
    (left.observationRef ?? "") === (right.observationRef ?? "") &&
    (left.receiptRef ?? "") === (right.receiptRef ?? "");
}

function laneSessionSortValue(
  state: DocumentLiveTranslationLaneSessionState | undefined,
): number {
  return state?.updatedAtMs ??
    state?.latestObservedAtMs ??
    state?.latestSourceEventMs ??
    Number.MIN_SAFE_INTEGER;
}

function shouldKeepCurrentLaneSessionState(
  current: DocumentLiveTranslationLaneSessionState | undefined,
  next: DocumentLiveTranslationLaneSessionState,
): boolean {
  if (!current) return false;
  return laneSessionSortValue(current) > laneSessionSortValue(next);
}

function mailLoopSortValue(
  state: DocumentLiveTranslationMailLoopState | undefined,
): number {
  return state?.latestObservedAtMs ??
    state?.latestSourceEventMs ??
    Number.MIN_SAFE_INTEGER;
}

function shouldKeepCurrentMailLoopState(
  current: DocumentLiveTranslationMailLoopState | undefined,
  next: DocumentLiveTranslationMailLoopState,
): boolean {
  if (!current) return false;
  return mailLoopSortValue(current) > mailLoopSortValue(next);
}

function goalBindingSortValue(
  state: DocumentLiveTranslationGoalBindingState | undefined,
): number {
  return state?.latestObservedAtMs ??
    state?.latestSourceEventMs ??
    Number.MIN_SAFE_INTEGER;
}

function shouldKeepCurrentGoalBindingState(
  current: DocumentLiveTranslationGoalBindingState | undefined,
  next: DocumentLiveTranslationGoalBindingState,
): boolean {
  if (!current) return false;
  return goalBindingSortValue(current) > goalBindingSortValue(next);
}
