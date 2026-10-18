import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type { HelixRuntimeGoalSession } from "@shared/helix-runtime-goal-session";
import { HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX } from "@shared/helix-research-library";
import type { RuntimeGoalWakeCandidatePayload } from "@/lib/agi/api";
import { mergeHelixAskRuntimeGoalDebugFields } from "./HelixAskRuntimeGoalDebugContext";

type RecordLike = Record<string, unknown>;

const ACTIVE_GOAL_STATUSES = new Set(["waiting", "running", "starting"]);

const asRecord = (value: unknown): RecordLike | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeRuntime = (value: unknown): HelixAgentRuntimeId | null => {
  const text = readString(value);
  return text === "helix" || text === "codex" ? text : null;
};

const readNestedRecord = (source: RecordLike | null, key: string): RecordLike | null => {
  const direct = asRecord(source?.[key]);
  if (direct) return direct;
  return asRecord(asRecord(source?.debug)?.[key]);
};

const recordClaimsPrivateResearchDocument = (record: RecordLike | null): boolean => {
  if (!record) return false;
  const documentSourceKind = readString(
    record.document_source_kind ?? record.documentSourceKind,
  )?.toLowerCase();
  const privateSource = record.private_source ?? record.privateSource;
  const docPaths = [
    record.doc_path,
    record.docPath,
    record.active_doc_path,
    record.activeDocPath,
    record.doc_context_path,
    record.docContextPath,
  ].map(readString).filter((value): value is string => Boolean(value));
  const documentRefs = [
    record.document_ref,
    record.documentRef,
    record.active_doc_ref,
    record.activeDocRef,
  ].map(readString).filter((value): value is string => Boolean(value));
  const sourceIds = [
    record.source_id,
    record.sourceId,
    record.active_doc_source_id,
    record.activeDocSourceId,
  ].map(readString).filter((value): value is string => Boolean(value));
  return (
    documentSourceKind === "research_library" ||
    privateSource === true ||
    readString(privateSource)?.toLowerCase() === "true" ||
    docPaths.some((value) => value.startsWith(HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX)) ||
    documentRefs.some((value) => value.startsWith("private-research:")) ||
    sourceIds.some((value) => value.startsWith(
      `document_markdown:${HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX}`,
    ))
  );
};

const visibleContextClaimsPrivateResearchDocument = (
  activeVisibleContext: RecordLike | null,
  snapshot: RecordLike,
  requestedDocPath: string | null,
): boolean => {
  if (
    recordClaimsPrivateResearchDocument(activeVisibleContext) ||
    recordClaimsPrivateResearchDocument(snapshot) ||
    requestedDocPath?.startsWith(HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX) === true
  ) {
    return true;
  }
  const visibleTargets = [
    ...(Array.isArray(activeVisibleContext?.chunks) ? activeVisibleContext.chunks : []),
    ...(Array.isArray(activeVisibleContext?.ui_text_regions)
      ? activeVisibleContext.ui_text_regions
      : []),
    ...(Array.isArray(activeVisibleContext?.uiTextRegions)
      ? activeVisibleContext.uiTextRegions
      : []),
    ...(Array.isArray(activeVisibleContext?.panel_text_regions)
      ? activeVisibleContext.panel_text_regions
      : []),
    ...(Array.isArray(activeVisibleContext?.panelTextRegions)
      ? activeVisibleContext.panelTextRegions
      : []),
    ...(Array.isArray(activeVisibleContext?.visible_ui_text_regions)
      ? activeVisibleContext.visible_ui_text_regions
      : []),
    ...(Array.isArray(activeVisibleContext?.visibleUiTextRegions)
      ? activeVisibleContext.visibleUiTextRegions
      : []),
  ];
  return visibleTargets.some((target) => recordClaimsPrivateResearchDocument(asRecord(target)));
};

export type HelixAskRuntimeGoalWakeActiveGoal = {
  goalId: string;
  runtimeAgentProvider: HelixAgentRuntimeId | null;
  sessionStatus: string;
};

export type HelixAskRuntimeGoalWakePostDecision = {
  shouldSubmit: boolean;
  reason:
    | "candidate_ready"
    | "goal_not_active"
    | "wake_in_flight"
    | "candidate_unavailable"
    | "duplicate_dedupe_key";
  candidate: RuntimeGoalWakeCandidatePayload | null;
  dedupeKey: string | null;
};

export function buildHelixAskRuntimeGoalActiveGoalFromSession(
  session: HelixRuntimeGoalSession | null | undefined,
): HelixAskRuntimeGoalWakeActiveGoal | null {
  if (!session?.goal_id || !ACTIVE_GOAL_STATUSES.has(session.status)) return null;
  return {
    goalId: session.goal_id,
    runtimeAgentProvider: normalizeRuntime(session.runtime_agent_provider),
    sessionStatus: session.status,
  };
}

export function selectHelixAskActiveRuntimeGoalFromReplies(
  replies: readonly RecordLike[],
): HelixAskRuntimeGoalWakeActiveGoal | null {
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const reply = replies[index];
    const debug = asRecord(reply.debug);
    const fields = mergeHelixAskRuntimeGoalDebugFields(debug, reply);
    const session = fields.runtime_goal_session;
    const summary = fields.runtime_goal_debug_summary;
    const command = fields.runtime_goal_command;
    const debugExport = fields.runtime_goal_debug_export;
    const goalId =
      readString(session?.goal_id) ??
      readString(summary?.goal_id) ??
      readString(command?.goal_id) ??
      readString(debugExport?.goal_id);
    if (!goalId) continue;
    const status =
      readString(session?.status) ??
      readString(summary?.session_status) ??
      readString(debugExport?.session_status) ??
      "not_reported";
    if (!ACTIVE_GOAL_STATUSES.has(status)) continue;
    const runtime =
      normalizeRuntime(session?.runtime_agent_provider) ??
      normalizeRuntime(summary?.runtime_agent_provider) ??
      normalizeRuntime(debugExport?.runtime_provider) ??
      normalizeRuntime(reply.agent_runtime);
    return {
      goalId,
      runtimeAgentProvider: runtime,
      sessionStatus: status,
    };
  }
  return null;
}

export function buildHelixAskRuntimeGoalVisibleSourceWakeCandidate(input: {
  activeGoal: HelixAskRuntimeGoalWakeActiveGoal | null;
  selectedAgentRuntime?: HelixAgentRuntimeId | null;
  docPath?: string | null;
  workspaceContextSnapshot?: RecordLike | null;
  observedAtMs?: number;
}): RuntimeGoalWakeCandidatePayload | null {
  return buildHelixAskRuntimeGoalDocsWakeCandidate({
    ...input,
    eventKind: "visible_source_changed",
    reason: "docs_viewer_active_doc_changed",
  });
}

export function buildHelixAskRuntimeGoalVisibleSurfaceWakeCandidate(input: {
  activeGoal: HelixAskRuntimeGoalWakeActiveGoal | null;
  selectedAgentRuntime?: HelixAgentRuntimeId | null;
  docPath?: string | null;
  workspaceContextSnapshot?: RecordLike | null;
  activeVisibleContext?: RecordLike | null;
  observedAtMs?: number;
}): RuntimeGoalWakeCandidatePayload | null {
  return buildHelixAskRuntimeGoalDocsWakeCandidate({
    ...input,
    eventKind: "visible_surface_changed",
    reason: "docs_viewer_visible_surface_changed",
  });
}

function buildHelixAskRuntimeGoalDocsWakeCandidate(input: {
  activeGoal: HelixAskRuntimeGoalWakeActiveGoal | null;
  selectedAgentRuntime?: HelixAgentRuntimeId | null;
  docPath?: string | null;
  workspaceContextSnapshot?: RecordLike | null;
  activeVisibleContext?: RecordLike | null;
  observedAtMs?: number;
  eventKind: "visible_source_changed" | "visible_surface_changed";
  reason: "docs_viewer_active_doc_changed" | "docs_viewer_visible_surface_changed";
}): RuntimeGoalWakeCandidatePayload | null {
  const activeGoal = input.activeGoal;
  if (!activeGoal) return null;
  const snapshot = input.workspaceContextSnapshot ?? {};
  const activeVisibleContext = asRecord(
    input.activeVisibleContext ??
      snapshot.active_doc_visible_translation_context ??
      snapshot.activeDocVisibleTranslationContext,
  );
  const docPath =
    readString(input.docPath) ??
    readString(activeVisibleContext?.doc_path) ??
    readString(snapshot.active_doc_path) ??
    readString(snapshot.activeDocPath);
  if (!docPath) return null;
  if (visibleContextClaimsPrivateResearchDocument(activeVisibleContext, snapshot, docPath)) {
    return null;
  }

  const observedAtMs = Math.floor(input.observedAtMs ?? Date.now());
  const sourceId =
    readString(activeVisibleContext?.source_id) ??
    readString(snapshot.active_doc_source_id) ??
    `document_markdown:${docPath}`;
  const sourceHash =
    readString(activeVisibleContext?.source_hash) ??
    readString(activeVisibleContext?.source_text_hash) ??
    readString(snapshot.active_doc_source_hash);
  const sourceFreshnessMs =
    readNumber(snapshot.source_freshness_ms) ??
    readNumber(snapshot.sourceFreshnessMs) ??
    null;
  const activePanelId =
    readString(snapshot.active_panel_id) ??
    readString(snapshot.activePanelId) ??
    "docs-viewer";
  const runtime =
    activeGoal.runtimeAgentProvider ??
    input.selectedAgentRuntime ??
    null;
  const hashPart = sourceHash ?? "no-source-hash";
  const visibleSurfacePart =
    input.eventKind === "visible_surface_changed"
      ? readString(activeVisibleContext?.source_identity_key) ??
        readString(activeVisibleContext?.identity_key) ??
        readString(activeVisibleContext?.visible_source_identity_key) ??
        readString(activeVisibleContext?.visible_surface_identity_key) ??
        buildVisibleSurfaceDedupePart(activeVisibleContext) ??
        "no-visible-surface"
      : null;
  const dedupeKey = [
    "runtime-goal",
    activeGoal.goalId,
    input.eventKind,
    "docs-viewer",
    docPath,
    hashPart,
    visibleSurfacePart,
  ].filter(Boolean).join(":");
  const workspaceContextSnapshot =
    activeVisibleContext && !snapshot.active_doc_visible_translation_context
      ? {
          ...snapshot,
          active_doc_visible_translation_context: activeVisibleContext,
        }
      : snapshot;
  return {
    goalId: activeGoal.goalId,
    goal_id: activeGoal.goalId,
    agentRuntime: runtime ?? undefined,
    agent_runtime: runtime ?? undefined,
    eventKind: input.eventKind,
    event_kind: input.eventKind,
    sourceKind: "docs_viewer_visible_surface",
    source_kind: "docs_viewer_visible_surface",
    docPath,
    doc_path: docPath,
    activePanelId,
    active_panel_id: activePanelId,
    sourceId,
    source_id: sourceId,
    sourceHash,
    source_hash: sourceHash,
    sourceLabel: docPath,
    source_label: docPath,
    reason: input.reason,
    dedupeKey,
    dedupe_key: dedupeKey,
    freshnessStatus: sourceFreshnessMs === null ? "unknown" : "fresh",
    freshness_status: sourceFreshnessMs === null ? "unknown" : "fresh",
    sourceFreshnessMs,
    source_freshness_ms: sourceFreshnessMs,
    proposedTool: "docs-viewer.read_visible_surface",
    proposed_tool: "docs-viewer.read_visible_surface",
    requiresUserVisibleTurn: true,
    requires_user_visible_turn: true,
    observedAtMs,
    observed_at_ms: observedAtMs,
    question: "/goal wake",
    workspaceContextSnapshot,
    workspace_context_snapshot: workspaceContextSnapshot,
  };
}

function buildVisibleSurfaceDedupePart(activeVisibleContext: RecordLike | null): string | null {
  if (!activeVisibleContext) return null;
  const chunkParts = Array.isArray(activeVisibleContext.chunks)
    ? activeVisibleContext.chunks
        .map((entry) => {
          const record = asRecord(entry);
          if (!record) return null;
          return [
            readString(record.projection_target),
            readString(record.source_kind),
            readString(record.chunk_id),
            readString(record.source_text_hash),
          ].filter(Boolean).join("/");
        })
        .filter(Boolean)
    : [];
  const uiParts = Array.isArray(activeVisibleContext.ui_text_regions)
    ? activeVisibleContext.ui_text_regions
        .map((entry) => {
          const record = asRecord(entry);
          if (!record) return null;
          return [
            readString(record.projection_target),
            readString(record.source_kind),
            readString(record.region_id),
            readString(record.source_text_hash),
          ].filter(Boolean).join("/");
        })
        .filter(Boolean)
    : [];
  const key = [...chunkParts, ...uiParts].join("|");
  return key || null;
}

export function buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision(input: {
  activeGoal: HelixAskRuntimeGoalWakeActiveGoal | null;
  selectedAgentRuntime?: HelixAgentRuntimeId | null;
  docPath?: string | null;
  workspaceContextSnapshot?: RecordLike | null;
  activeVisibleContext?: RecordLike | null;
  observedAtMs?: number;
  inFlight?: boolean;
  lastSubmittedDedupeKey?: string | null;
}): HelixAskRuntimeGoalWakePostDecision {
  if (!input.activeGoal) {
    return {
      shouldSubmit: false,
      reason: "goal_not_active",
      candidate: null,
      dedupeKey: null,
    };
  }
  if (input.inFlight === true) {
    return {
      shouldSubmit: false,
      reason: "wake_in_flight",
      candidate: null,
      dedupeKey: null,
    };
  }
  const candidate = buildHelixAskRuntimeGoalVisibleSurfaceWakeCandidate(input);
  if (!candidate) {
    return {
      shouldSubmit: false,
      reason: "candidate_unavailable",
      candidate: null,
      dedupeKey: null,
    };
  }
  const dedupeKey = readString(candidate.dedupeKey ?? candidate.dedupe_key);
  if (dedupeKey && input.lastSubmittedDedupeKey === dedupeKey) {
    return {
      shouldSubmit: false,
      reason: "duplicate_dedupe_key",
      candidate,
      dedupeKey,
    };
  }
  return {
    shouldSubmit: true,
    reason: "candidate_ready",
    candidate,
    dedupeKey,
  };
}

export function buildHelixAskRuntimeGoalWakePostDecision(input: {
  activeGoal: HelixAskRuntimeGoalWakeActiveGoal | null;
  selectedAgentRuntime?: HelixAgentRuntimeId | null;
  docPath?: string | null;
  workspaceContextSnapshot?: RecordLike | null;
  observedAtMs?: number;
  inFlight?: boolean;
  lastSubmittedDedupeKey?: string | null;
}): HelixAskRuntimeGoalWakePostDecision {
  if (!input.activeGoal) {
    return {
      shouldSubmit: false,
      reason: "goal_not_active",
      candidate: null,
      dedupeKey: null,
    };
  }
  if (input.inFlight === true) {
    return {
      shouldSubmit: false,
      reason: "wake_in_flight",
      candidate: null,
      dedupeKey: null,
    };
  }
  const candidate = buildHelixAskRuntimeGoalVisibleSourceWakeCandidate(input);
  if (!candidate) {
    return {
      shouldSubmit: false,
      reason: "candidate_unavailable",
      candidate: null,
      dedupeKey: null,
    };
  }
  const dedupeKey = readString(candidate.dedupeKey ?? candidate.dedupe_key);
  if (dedupeKey && input.lastSubmittedDedupeKey === dedupeKey) {
    return {
      shouldSubmit: false,
      reason: "duplicate_dedupe_key",
      candidate,
      dedupeKey,
    };
  }
  return {
    shouldSubmit: true,
    reason: "candidate_ready",
    candidate,
    dedupeKey,
  };
}

export function buildHelixAskRuntimeGoalWakeReply(input: {
  response: RecordLike;
  fallbackQuestion?: string;
  createdAtMs?: number;
}): {
  id: string;
  turn_id: string;
  createdAtMs: number;
  content: string;
  question: string;
  debug: RecordLike;
  promptIngested: boolean;
  mode: "observe";
  agent_runtime?: HelixAgentRuntimeId;
  selected_agent_provider?: RecordLike | null;
  liveEvents: unknown[];
} {
  const response = input.response;
  const debug = {
    ...asRecord(response.debug),
    ...buildWakeReplyRuntimeGoalFields(response),
    runtime_goal_wake_candidate: asRecord(response.runtime_goal_wake_candidate),
    runtime_goal_wake_admission: asRecord(response.runtime_goal_wake_admission),
  };
  const turnId =
    readString(response.turn_id) ??
    readString(response.active_turn_id) ??
    readString(asRecord(response.runtime_goal_wake_candidate)?.wake_candidate_id) ??
    `runtime-goal-wake:${input.createdAtMs ?? Date.now()}`;
  const terminalText =
    readString(response.selected_final_answer) ??
    readString(response.assistant_answer) ??
    readString(response.text) ??
    readString(response.answer) ??
    readString(asRecord(response.debug)?.selected_final_answer) ??
    "Runtime goal wake completed.";
  return {
    id: turnId,
    turn_id: turnId,
    createdAtMs: input.createdAtMs ?? Date.now(),
    content: terminalText,
    question: input.fallbackQuestion ?? "Runtime goal wake: visible source changed",
    debug,
    promptIngested: true,
    mode: "observe",
    ...(normalizeRuntime(response.agent_runtime) ? { agent_runtime: normalizeRuntime(response.agent_runtime)! } : {}),
    selected_agent_provider: asRecord(response.selected_agent_provider),
    liveEvents: Array.isArray(response.turn_transcript_events) ? response.turn_transcript_events : [],
  };
}

function buildWakeReplyRuntimeGoalFields(response: RecordLike): RecordLike {
  const directFields = {
    runtime_goal_command: asRecord(response.runtime_goal_command),
    runtime_goal_session: asRecord(response.runtime_goal_session),
    runtime_goal_debug_export: asRecord(response.runtime_goal_debug_export),
    runtime_goal_debug_summary: asRecord(response.runtime_goal_debug_summary),
  };
  if (
    directFields.runtime_goal_command ||
    directFields.runtime_goal_session ||
    directFields.runtime_goal_debug_export ||
    directFields.runtime_goal_debug_summary
  ) {
    return directFields;
  }
  const debug = asRecord(response.debug);
  return {
    runtime_goal_command: readNestedRecord(debug, "runtime_goal_command"),
    runtime_goal_session: readNestedRecord(debug, "runtime_goal_session"),
    runtime_goal_debug_export: readNestedRecord(debug, "runtime_goal_debug_export"),
    runtime_goal_debug_summary: readNestedRecord(debug, "runtime_goal_debug_summary"),
  };
}
