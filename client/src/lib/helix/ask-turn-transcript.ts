import type {
  HelixCausalTurnEvent,
  HelixCausalTurnTimeline,
} from "@shared/helix-causal-turn-timeline";
import type { StagePlayLiveSourceMailTranscriptEntryV1 } from "@shared/contracts/stage-play-live-source-mail.v1";
import { humanizeAskLiveEventToken } from "@/lib/helix/ask-display-text";
import {
  parseAskLiveEventTimestampMs,
  type AskLiveEventEntry,
} from "@/lib/helix/ask-debug-event-display";
import {
  buildHelixLiveTranslationUiProjections,
  type HelixLiveTranslationUiProjection,
} from "@/lib/helix/live-translation-projection";
import { resolveHelixAccountLanguageTranslationProjectionHealth } from "@/lib/helix/account-language-translation-health";

type HelixAskTranscriptReply = {
  id: string;
  content?: unknown;
  liveEvents?: unknown[];
  debug?: any;
  [key: string]: any;
};

export type HelixTurnTranscriptRow = {
  key: string;
  role: string;
  label: string;
  text: string;
  meta: string;
  status: string;
};

function resolveHelixTranscriptSourceAudit(event: Record<string, unknown>): string {
  const eventSource = coerceText(event.event_source).trim();
  const sourceEventType = coerceText(event.source_event_type).trim();
  const replayReason = coerceText(
    event.client_replay_reason ?? event.clientReplayReason ?? event.replay_reason ?? event.replayReason,
  ).trim();
  const providerNativeType = coerceText(
    event.provider_native_event_type ?? event.providerNativeEventType,
  ).trim();
  const streamEvent = coerceText(event.stream_event).trim();
  const reconstructed = event.reconstructed === true;
  if (sourceEventType === "runtime_heartbeat" || coerceText(event.step_id).trim() === "backend_ask_runtime") {
    return "source runtime_heartbeat";
  }
  if (sourceEventType.startsWith("codex_native_") || providerNativeType) {
    return providerNativeType
      ? `source codex_native_event:${providerNativeType}`
      : "source codex_native_event";
  }
  if (replayReason === "final_response_replay") return "source final_response_replay";
  if (replayReason === "final_response_backfill") return "source final_response_backfill";
  if (reconstructed) return "source reconstructed_replay";
  if (eventSource === "live" && streamEvent === "turn_transcript_event") return "source live_provider_transcript";
  if (eventSource === "live") return "source live";
  if (eventSource === "client_synthetic") return "source client_synthetic";
  if (eventSource) return `source ${eventSource}`;
  return "source unknown";
}

function coerceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function clipText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function formatTranscriptMetaValue(value: string): string {
  return value.replace(/\s*\|\s*/g, "; ").trim();
}

function readAgentLoopAuditRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function serializeAgentLoopAuditRecord(value: unknown): string {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return "";
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

function readCapabilityLaneReceiptRef(...values: unknown[]): string {
  const records = values
    .map((value) => readAgentLoopAuditRecord(value))
    .filter((record): record is Record<string, unknown> => Boolean(record));
  const latest = records.map((record) => coerceText(record.latest_receipt_ref).trim()).find(Boolean);
  if (latest) return latest;
  const direct = records.map((record) => coerceText(record.receipt_ref).trim()).find(Boolean);
  if (direct) return direct;
  const last = records.map((record) => coerceText(record.last_receipt_ref).trim()).find(Boolean);
  if (last) return last;
  for (const value of values) {
    if (readAgentLoopAuditRecord(value)) continue;
    const text = coerceText(value).trim();
    if (text) return text;
  }
  return "";
}

function readAgentLoopAuditArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readFirstAgentLoopAuditArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

function formatTranscriptStringArray(value: unknown): string {
  return dedupeStrings(readAgentLoopAuditArray(value).map(coerceText).map((entry) => entry.trim()).filter(Boolean))
    .join(", ");
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function readTranscriptBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readCapabilityLaneHasObservation(record: Record<string, unknown>): boolean {
  if (typeof record.has_observation === "boolean") return record.has_observation;
  return Boolean(coerceText(record.observation_ref).trim());
}

function formatCapabilityLanePermissionText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const write = record.write === true;
  const shell = record.shell === true;
  const codeMutation = record.code_mutation === true || record.codeMutation === true;
  if (!write && !shell && !codeMutation) return "permissions non-mutating";
  const allowed = [
    write ? "write allowed" : "",
    shell ? "shell allowed" : "",
    codeMutation ? "code mutation allowed" : "",
  ].filter(Boolean);
  return allowed.length ? `permissions ${allowed.join(", ")}` : "";
}

export function buildAskLiveEventFromTurnTranscriptRecord(
  record: Record<string, unknown>,
  fallbackId: string,
  maxChars = 560,
): AskLiveEventEntry | null {
  const text = coerceText(record.text).trim();
  if (!text) return null;
  const type = coerceText(record.type).trim() || coerceText(record.source_event_type).trim() || "turn_transcript_event";
  const sourceEventType = coerceText(record.source_event_type).trim();
  const isTerminalAnswerEvent =
    sourceEventType === "terminal_answer" ||
    sourceEventType === "final_answer" ||
    type === "terminal_answer" ||
    type === "final_answer";
  const turnId = coerceText(record.turn_id ?? record.turnId ?? record.active_turn_id).trim();
  const atMs = typeof record.at_ms === "number" && Number.isFinite(record.at_ms) ? Math.trunc(record.at_ms) : null;
  const ts = atMs ? new Date(atMs).toISOString() : undefined;
  const seq = typeof record.seq === "number" && Number.isFinite(record.seq) ? Math.trunc(record.seq) : undefined;
  return {
    id: coerceText(record.id).trim() || fallbackId,
    text: isTerminalAnswerEvent ? text : clipText(text, maxChars),
    tool: coerceText(record.role).trim() || "agent",
    ts,
    tsMs: atMs ?? parseAskLiveEventTimestampMs(record.ts) ?? undefined,
    seq,
    durationMs:
      typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
        ? Math.max(0, Math.round(record.durationMs))
        : undefined,
    meta: {
      stage: type,
      detail: coerceText(record.detail).trim() || null,
      status: coerceText(record.status).trim() || null,
      stepId: coerceText(record.step_id).trim() || null,
      lane: coerceText(record.lane).trim() || null,
      capabilityId: coerceText(record.capability_id).trim() || null,
      requestedCapabilityId: coerceText(record.requested_capability_id).trim() || null,
      executedCapabilityId: coerceText(record.executed_capability_id).trim() || null,
      laneSessionId: coerceText(record.lane_session_id).trim() || null,
      sessionControlKey: coerceText(record.session_control_key).trim() || null,
      sourceBindingKey: coerceText(record.source_binding_key).trim() || null,
      latestObservationKey: coerceText(record.latest_observation_key).trim() || null,
      latestMailLoopObservationKey: coerceText(record.latest_mail_loop_observation_key).trim() || null,
      goalBindingKey: coerceText(record.goal_binding_key).trim() || null,
      reportSummaryText: coerceText(record.report_summary_text).trim() || null,
      latestEventId: coerceText(record.latest_event_id).trim() || null,
      hasObservation: readTranscriptBoolean(record.has_observation),
      observationLaneSessionId: coerceText(record.observation_lane_session_id).trim() || null,
      selectedBackendProvider: coerceText(record.selected_backend_provider).trim() || null,
      backendCostClass: coerceText(record.cost_class).trim() || null,
      backendLatencyClass: coerceText(record.latency_class).trim() || null,
      backendPrivacyClass: coerceText(record.privacy_class).trim() || null,
      fallbackBackendProvider: coerceText(record.fallback_backend_provider).trim() || null,
      stagePlayMailDeliveryStatus: coerceText(record.stage_play_mail_delivery_status).trim() || null,
      previousStagePlayMailId: coerceText(record.previous_stage_play_mail_id).trim() || null,
      materializedMailLoopEvidence: readTranscriptBoolean(record.materialized_mail_loop_evidence),
      receiptRef: coerceText(record.receipt_ref).trim() || null,
      observationRef: coerceText(record.observation_ref).trim() || null,
      sourceId: coerceText(record.source_id).trim() || null,
      sourceHash: coerceText(record.source_hash ?? record.sourceHash).trim() || null,
      sourceKind: coerceText(record.source_kind).trim() || null,
      sourceTextHash: coerceText(record.source_text_hash ?? record.sourceTextHash).trim() || null,
      sourceTextCharCount:
        coerceText(record.source_text_char_count ?? record.sourceTextCharCount).trim() || null,
      sourceProjectionTarget: coerceText(record.source_projection_target).trim() || null,
      projectionKey: coerceText(record.projection_key ?? record.projectionKey).trim() || null,
      accountLocale: coerceText(record.account_locale).trim() || null,
      latestChunkId: coerceText(record.latest_chunk_id).trim() || null,
      latestChunkIndex: coerceText(record.latest_chunk_index).trim() || null,
      latestDedupeKey: coerceText(record.latest_dedupe_key).trim() || null,
      latestSourceEventId: coerceText(record.latest_source_event_id).trim() || null,
      latestSourceEventMs: coerceText(record.latest_source_event_ms).trim() || null,
      latestObservedAtMs: coerceText(record.latest_observed_at_ms).trim() || null,
      latestFreshnessStatus: coerceText(record.latest_freshness_status).trim() || null,
      latestProjectionTarget: coerceText(record.latest_projection_target).trim() || null,
      targetLanguage: coerceText(record.target_language).trim() || null,
      existingObservationRef: coerceText(record.existing_observation_ref).trim() || null,
      existingReceiptRef: coerceText(record.existing_receipt_ref).trim() || null,
      existingProjectionStatus: coerceText(record.existing_projection_status).trim() || null,
      existingFreshnessStatus: coerceText(record.existing_freshness_status).trim() || null,
      existingTerminalAuthorityStatus:
        coerceText(record.existing_terminal_authority_status).trim() || null,
      latestCancelRequested: readTranscriptBoolean(record.latest_cancel_requested),
      laneVisible: readTranscriptBoolean(record.lane_visible),
      laneRequested: readTranscriptBoolean(record.lane_requested),
      laneExecuted: readTranscriptBoolean(record.lane_executed),
      observationReentered: readTranscriptBoolean(record.observation_reentered),
      reentryRequired: readTranscriptBoolean(record.reentry_required),
      terminalEligible: readTranscriptBoolean(record.terminal_eligible),
      terminalAuthorityStatus: coerceText(record.terminal_authority_status).trim() || null,
      contextRole: coerceText(record.context_role).trim() || null,
      answerAuthority: readTranscriptBoolean(record.answer_authority),
      assistantAnswer: readTranscriptBoolean(record.assistant_answer),
      rawContentIncluded: readTranscriptBoolean(record.raw_content_included),
      clientReplayReason: coerceText(record.client_replay_reason ?? record.replay_reason).trim() || null,
      providerNativeEventType: coerceText(record.provider_native_event_type).trim() || null,
      source_event_type: sourceEventType || type,
      event_source: coerceText(record.event_source).trim() || "live",
      turn_id: turnId || null,
      reconstructed: record.reconstructed === true,
      stream_event: "turn_transcript_event",
    },
  };
}

function resolveHelixTranscriptActionLabel(event: Record<string, unknown>): string | null {
  const directPanelId = coerceText(event.panel_id ?? event.panelId).trim();
  const directActionId = coerceText(event.action_id ?? event.actionId).trim();
  if (directPanelId && directActionId) return `${directPanelId}.${directActionId}`;

  const action =
    readAgentLoopAuditRecord(event.action) ??
    readAgentLoopAuditRecord(event.selected_action) ??
    readAgentLoopAuditRecord(event.tool_action);
  const panelId = coerceText(action?.panel_id ?? action?.panelId).trim();
  const actionId = coerceText(action?.action_id ?? action?.actionId).trim();
  if (panelId && actionId) return `${panelId}.${actionId}`;

  const stepId = coerceText(event.step_id ?? event.stepId).trim();
  if (/^workspace_action_locate_(?:exact|variant|doc)$/i.test(stepId)) {
    return "docs-viewer.locate_in_doc";
  }
  if (/^workspace_action_append_(?:location_reminder|to_note|doc_summary)$/i.test(stepId)) {
    return "workstation-notes.append_to_note";
  }
  if (/^workspace_action_docs_viewer_summarize_doc$/i.test(stepId)) {
    return "docs-viewer.summarize_doc";
  }
  if (/^workspace_action_docs_viewer_search_docs$/i.test(stepId)) {
    return "docs-viewer.search_docs";
  }

  const toolName = coerceText(event.tool ?? event.tool_name ?? event.capability).trim();
  return toolName || null;
}

function resolveHelixTranscriptRowLabel(event: Record<string, unknown>): string {
  const sourceEventType = coerceText(event.source_event_type).trim();
  if (sourceEventType === "runtime_selected") return "Runtime";
  if (sourceEventType === "context_state") return "Context";
  if (sourceEventType === "action_request") return "Action Request";
  if (sourceEventType === "action_observation") return "Action Observation";
  if (sourceEventType === "tool_request") return "Tool Request";
  if (sourceEventType === "tool_observation") return "Tool Observation";
  if (sourceEventType === "compound_itinerary") return "Itinerary";
  if (sourceEventType === "model_reentry") return "Model Re-entry";
  if (sourceEventType === "lane_requested") return "Lane Request";
  if (sourceEventType === "lane_visible") return "Lane Visible";
  if (sourceEventType === "lane_backend_selected") return "Lane Backend";
  if (sourceEventType === "lane_observation") return "Lane Observation";
  if (sourceEventType === "lane_projection_receipt") return "Lane Receipt";
  if (sourceEventType === "visible_translation_collector") return "Visible Collector";
  if (sourceEventType === "visible_translation_chain_summary") return "Visible Translation";
  if (sourceEventType === "lane_reentered") return "Lane Re-entry";
  if (sourceEventType === "lane_session") return "Lane Session";
  if (sourceEventType === "lane_mail_loop") return "Lane Mail";
  if (sourceEventType === "lane_console_state") return "Lane State";
  if (sourceEventType === "lane_goal_binding") return "Goal Lane";
  if (sourceEventType === "lane_goal_dispatch_plan") return "Goal Dispatch";
  if (sourceEventType === "lane_goal_dispatch_admission") return "Goal Admission";
  if (sourceEventType === "lane_goal_dispatch_readiness") return "Goal Readiness";
  if (sourceEventType === "ui_translation_projection") return "UI Projection";
  if (sourceEventType === "terminal_selected") return "Terminal";
  if (sourceEventType === "terminal_rejected") return "Terminal";
  if (sourceEventType === "terminal_answer") return "Final";

  const type = String(event.type ?? "event");
  const status = String(event.status ?? "");
  if (type === "public_commentary") return "Thinking";
  if (type === "plan") return "Plan";
  if (type === "model_decision") return status === "running" ? "Thinking" : "Decision";
  if (type === "step_started") return "Working";
  if (type === "receipt_pending") return "Working";
  if (type === "receipt_observed") return "Observation";
  if (type === "tool_result") return "Observation";
  if (type === "observation") return "Recorded";
  if (type === "decision") return "Decision";
  if (type === "final_answer") return "Final";
  return "Agent";
}

export function normalizeHelixVisibleEventText(value: unknown): string {
  return coerceText(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function buildHelixVisibleActionReceiptKey(event: Record<string, unknown>): string | null {
  const type = String(event.type ?? event.kind ?? "");
  if (type !== "action_receipt" && type !== "workstation_action_receipt" && type !== "tool_result") return null;
  const text = normalizeHelixVisibleEventText(event.text);
  if (!text) return null;
  const turnKey = coerceText(event.turnKey ?? event.turn_key ?? event.traceId ?? event.trace_id);
  const status = coerceText(event.status);
  const stepId = coerceText(event.step_id ?? event.stepId);
  return [turnKey, type, status, stepId, text].filter(Boolean).join("|");
}

function dedupeHelixVisibleTranscriptEvents(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const event of events) {
    const key = buildHelixVisibleActionReceiptKey(event);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(event);
  }
  return out;
}

function isProviderNativeDeltaEvent(event: Record<string, unknown>): boolean {
  const providerNativeType = coerceText(
    event.provider_native_event_type ?? event.providerNativeEventType,
  ).trim();
  return /(?:^|[/:.])delta$/i.test(providerNativeType);
}

const readHelixResolvedTurnSummary = (reply?: HelixAskTranscriptReply | null): Record<string, unknown> | null => {
  const record = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply?.debug);
  const turnTruthTable = readAgentLoopAuditRecord(record?.turn_truth_table ?? debugRecord?.turn_truth_table);
  return readAgentLoopAuditRecord(record?.resolved_turn_summary ?? debugRecord?.resolved_turn_summary ?? turnTruthTable?.resolved_turn_summary);
};

function readHelixRuntimeArtifactRefs(record: Record<string, unknown>): string[] {
  const refs = [
    record.observed_artifact_refs,
    record.artifact_refs,
    record.produced_artifacts,
    record.actual_artifacts,
    record.consumed_artifact_refs,
  ].flatMap((value) => (Array.isArray(value) ? value : []));
  return Array.from(new Set(refs.map((entry) => coerceText(entry).trim()).filter(Boolean)));
}

function summarizeHelixRuntimeArtifactRefs(refs: string[]): string {
  if (refs.length === 0) return "";
  const labels = refs.map((ref) => {
    if (/workstation[-_]tool[-_]eval|workstation_tool_evaluation/i.test(ref)) {
      return "workstation_tool_evaluation";
    }
    if (/theory[-_]ideology[-_]bridge|helix_theory_ideology_bridge_tool_result/i.test(ref)) {
      return "theory_ideology_bridge evidence";
    }
    const match = ref.match(
      /\b(?:doc_search_results|doc_summary|doc_open_receipt|doc_location_matches|calculator_receipt|workspace_action_receipt|note_update_receipt|runtime_tool_observation|tool_observation|final_answer_draft|direct_answer_text)\b/i,
    );
    if (match?.[0]) return match[0];
    const parts = ref.split(/[/:#]/).map((part) => part.trim()).filter(Boolean);
    const label = parts[parts.length - 1] ?? ref;
    return /^[a-f0-9]{12,}$/i.test(label) || /^\d+$/.test(label) ? "" : label;
  });
  const unique = Array.from(new Set(labels.filter(Boolean)));
  const visible = unique.slice(0, 5).join(", ");
  return unique.length > 5 ? `${visible}, +${unique.length - 5} more` : visible;
}

function readHelixGatewayProjectionSources(reply: HelixAskTranscriptReply): {
  replyRecord: Record<string, unknown> | null;
  debugRecord: Record<string, unknown> | null;
  agentLoopRecord: Record<string, unknown> | null;
  debugExportRecord: Record<string, unknown> | null;
} {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const agentLoopRecord = readAgentLoopAuditRecord(
    replyRecord?.agent_runtime_loop ??
      debugRecord?.agent_runtime_loop ??
      replyRecord?.agent_loop_audit ??
      debugRecord?.agent_loop_audit,
  );
  const debugExportRecord = readAgentLoopAuditRecord(
    debugRecord?.debug_export ?? replyRecord?.debug_export,
  );
  return { replyRecord, debugRecord, agentLoopRecord, debugExportRecord };
}

function readHelixWorkstationGatewayCallResults(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.workstation_gateway_call_results,
    replyRecord?.workstation_gateway_results,
    debugRecord?.workstation_gateway_call_results,
    debugRecord?.workstation_gateway_results,
    agentLoopRecord?.workstation_gateway_call_results,
    agentLoopRecord?.workstation_gateway_results,
    debugExportRecord?.workstation_gateway_call_results,
    debugExportRecord?.workstation_gateway_results,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixWorkstationGatewayObservationPackets(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.workstation_gateway_observation_packets,
    debugRecord?.workstation_gateway_observation_packets,
    agentLoopRecord?.workstation_gateway_observation_packets,
    debugExportRecord?.workstation_gateway_observation_packets,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneCallResults(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_call_results,
    replyRecord?.capability_lane_results,
    debugRecord?.capability_lane_call_results,
    debugRecord?.capability_lane_results,
    agentLoopRecord?.capability_lane_call_results,
    agentLoopRecord?.capability_lane_results,
    debugExportRecord?.capability_lane_call_results,
    debugExportRecord?.capability_lane_results,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneVisibleManifest(reply: HelixAskTranscriptReply): Record<string, unknown> | null {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  const replyAdapter = readAgentLoopAuditRecord(replyRecord?.agent_runtime_adapter_contract);
  const debugAdapter = readAgentLoopAuditRecord(debugRecord?.agent_runtime_adapter_contract);
  return readAgentLoopAuditRecord(replyRecord?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(debugRecord?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(agentLoopRecord?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(debugExportRecord?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(replyAdapter?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(debugAdapter?.model_visible_capability_lane_manifest) ??
    readAgentLoopAuditRecord(replyRecord?.capability_lane_manifest) ??
    readAgentLoopAuditRecord(debugRecord?.capability_lane_manifest) ??
    readAgentLoopAuditRecord(agentLoopRecord?.capability_lane_manifest) ??
    readAgentLoopAuditRecord(debugExportRecord?.capability_lane_manifest);
}

function readHelixCapabilityLaneVisibleLanes(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const manifest = readHelixCapabilityLaneVisibleManifest(reply);
  return readAgentLoopAuditArray(manifest?.lanes)
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneObservationPackets(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_observation_packets,
    debugRecord?.capability_lane_observation_packets,
    agentLoopRecord?.capability_lane_observation_packets,
    debugExportRecord?.capability_lane_observation_packets,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneProjectionReceipts(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_projection_receipts,
    debugRecord?.capability_lane_projection_receipts,
    agentLoopRecord?.capability_lane_projection_receipts,
    debugExportRecord?.capability_lane_projection_receipts,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneResolveTraces(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  const directTrace =
    readAgentLoopAuditRecord(replyRecord?.capability_lane_resolve_trace) ??
    readAgentLoopAuditRecord(debugRecord?.capability_lane_resolve_trace) ??
    readAgentLoopAuditRecord(agentLoopRecord?.capability_lane_resolve_trace) ??
    readAgentLoopAuditRecord(debugExportRecord?.capability_lane_resolve_trace);
  const arrayTraces = readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_resolve_traces,
    debugRecord?.capability_lane_resolve_traces,
    agentLoopRecord?.capability_lane_resolve_traces,
    debugExportRecord?.capability_lane_resolve_traces,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  return directTrace ? [directTrace, ...arrayTraces] : arrayTraces;
}

function readHelixCapabilityLaneBackendSelections(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_backend_selections,
    debugRecord?.capability_lane_backend_selections,
    agentLoopRecord?.capability_lane_backend_selections,
    debugExportRecord?.capability_lane_backend_selections,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneDebugEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_debug_events,
    debugRecord?.capability_lane_debug_events,
    agentLoopRecord?.capability_lane_debug_events,
    debugExportRecord?.capability_lane_debug_events,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .sort((left, right) => {
      const leftSeq = typeof left.seq === "number" && Number.isFinite(left.seq) ? left.seq : 0;
      const rightSeq = typeof right.seq === "number" && Number.isFinite(right.seq) ? right.seq : 0;
      return leftSeq - rightSeq;
    });
}

function readHelixCapabilityLaneTurnTimeline(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_turn_timeline,
    debugRecord?.capability_lane_turn_timeline,
    agentLoopRecord?.capability_lane_turn_timeline,
    debugExportRecord?.capability_lane_turn_timeline,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .sort((left, right) => {
      const leftSeq = typeof left.seq === "number" && Number.isFinite(left.seq) ? left.seq : 0;
      const rightSeq = typeof right.seq === "number" && Number.isFinite(right.seq) ? right.seq : 0;
      return leftSeq - rightSeq;
    });
}

function readHelixCapabilityLaneConsoleStateRows(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  const summaries = [
    readAgentLoopAuditRecord(replyRecord?.capability_lane_timeline_summary),
    readAgentLoopAuditRecord(debugRecord?.capability_lane_timeline_summary),
    readAgentLoopAuditRecord(agentLoopRecord?.capability_lane_timeline_summary),
    readAgentLoopAuditRecord(debugExportRecord?.capability_lane_timeline_summary),
  ];
  for (const summary of summaries) {
    const rows = readAgentLoopAuditArray(summary?.console_state_rows)
      .map((entry) => readAgentLoopAuditRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .sort((left, right) => {
        const leftSeq = typeof left.seq === "number" && Number.isFinite(left.seq) ? left.seq : 0;
        const rightSeq = typeof right.seq === "number" && Number.isFinite(right.seq) ? right.seq : 0;
        return leftSeq - rightSeq;
      });
    if (rows.length > 0) return rows;
  }
  return [];
}

function readHelixRuntimeLaneRequestLoop(reply: HelixAskTranscriptReply): Record<string, unknown> | null {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readAgentLoopAuditRecord(replyRecord?.runtime_lane_request_loop) ??
    readAgentLoopAuditRecord(debugRecord?.runtime_lane_request_loop) ??
    readAgentLoopAuditRecord(agentLoopRecord?.runtime_lane_request_loop) ??
    readAgentLoopAuditRecord(debugExportRecord?.runtime_lane_request_loop);
}

function readHelixVisibleTranslationCollectorChain(reply: HelixAskTranscriptReply): Record<string, unknown> | null {
  const loop = readHelixRuntimeLaneRequestLoop(reply);
  return readAgentLoopAuditRecord(loop?.visible_translation_collector_chain);
}

function readHelixVisibleTranslationChainSummary(reply: HelixAskTranscriptReply): Record<string, unknown> | null {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readAgentLoopAuditRecord(replyRecord?.visible_translation_chain_summary) ??
    readAgentLoopAuditRecord(debugRecord?.visible_translation_chain_summary) ??
    readAgentLoopAuditRecord(agentLoopRecord?.visible_translation_chain_summary) ??
    readAgentLoopAuditRecord(debugExportRecord?.visible_translation_chain_summary);
}

function readHelixCapabilityLaneGoalBindingDebugSummaries(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_goal_binding_debug_summaries,
    debugRecord?.capability_lane_goal_binding_debug_summaries,
    agentLoopRecord?.capability_lane_goal_binding_debug_summaries,
    debugExportRecord?.capability_lane_goal_binding_debug_summaries,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneGoalDispatchPlans(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  const directPlans = readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_goal_dispatch_plans,
    debugRecord?.capability_lane_goal_dispatch_plans,
    agentLoopRecord?.capability_lane_goal_dispatch_plans,
    debugExportRecord?.capability_lane_goal_dispatch_plans,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (directPlans.length > 0) return directPlans;

  return readHelixCapabilityLaneGoalBindingDebugSummaries(reply)
    .map((summary) => readAgentLoopAuditRecord(summary.dispatch_plan))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneGoalDispatchAdmissions(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  const directAdmissions = readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_goal_dispatch_admissions,
    debugRecord?.capability_lane_goal_dispatch_admissions,
    agentLoopRecord?.capability_lane_goal_dispatch_admissions,
    debugExportRecord?.capability_lane_goal_dispatch_admissions,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (directAdmissions.length > 0) return directAdmissions;

  return readHelixCapabilityLaneGoalBindingDebugSummaries(reply)
    .map((summary) => readAgentLoopAuditRecord(summary.dispatch_admission))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneGoalDispatchReadiness(reply: HelixAskTranscriptReply): Record<string, unknown> | null {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readAgentLoopAuditRecord(replyRecord?.capability_lane_goal_dispatch_readiness) ??
    readAgentLoopAuditRecord(debugRecord?.capability_lane_goal_dispatch_readiness) ??
    readAgentLoopAuditRecord(agentLoopRecord?.capability_lane_goal_dispatch_readiness) ??
    readAgentLoopAuditRecord(debugExportRecord?.capability_lane_goal_dispatch_readiness);
}

function readHelixCapabilityLaneSessionDebugSummaries(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_session_debug_summaries,
    debugRecord?.capability_lane_session_debug_summaries,
    agentLoopRecord?.capability_lane_session_debug_summaries,
    debugExportRecord?.capability_lane_session_debug_summaries,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneSessionResults(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_session_results,
    debugRecord?.capability_lane_session_results,
    agentLoopRecord?.capability_lane_session_results,
    debugExportRecord?.capability_lane_session_results,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneMailLoopDebugSummaries(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return readFirstAgentLoopAuditArray(
    replyRecord?.capability_lane_mail_loop_debug_summaries,
    debugRecord?.capability_lane_mail_loop_debug_summaries,
    agentLoopRecord?.capability_lane_mail_loop_debug_summaries,
    debugExportRecord?.capability_lane_mail_loop_debug_summaries,
  )
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readHelixCapabilityLaneReentryStatus(reply: HelixAskTranscriptReply): string {
  const { replyRecord, debugRecord, agentLoopRecord, debugExportRecord } = readHelixGatewayProjectionSources(reply);
  return (
    coerceText(replyRecord?.capability_lane_reentry_status).trim() ||
    coerceText(debugRecord?.capability_lane_reentry_status).trim() ||
    coerceText(agentLoopRecord?.capability_lane_reentry_status).trim() ||
    coerceText(debugExportRecord?.capability_lane_reentry_status).trim()
  );
}

function readHelixCapabilityLaneTerminalKind(reply: HelixAskTranscriptReply): string {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  return (
    coerceText(replyRecord?.terminal_artifact_kind).trim() ||
    coerceText(debugRecord?.terminal_artifact_kind).trim() ||
    coerceText(readHelixResolvedTurnSummary(reply)?.terminal_artifact_kind).trim() ||
    coerceText(replyRecord?.final_answer_source).trim() ||
    coerceText(debugRecord?.final_answer_source).trim()
  );
}

function readHelixCapabilityLaneTerminalRejection(reply: HelixAskTranscriptReply): string {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const resolvedSummary = readHelixResolvedTurnSummary(reply);
  const candidateReview = readAgentLoopAuditRecord(
    replyRecord?.terminal_authority_candidate_review ?? debugRecord?.terminal_authority_candidate_review,
  );
  const providerBridge = readAgentLoopAuditRecord(
    replyRecord?.provider_terminal_authority_bridge ?? debugRecord?.provider_terminal_authority_bridge,
  );
  const records = [replyRecord, debugRecord, resolvedSummary, candidateReview, providerBridge].filter(
    (record): record is Record<string, unknown> => Boolean(record),
  );
  for (const record of records) {
    const code =
      coerceText(record.terminal_error_code).trim() ||
      coerceText(record.error_code).trim() ||
      coerceText(record.fail_reason).trim();
    if (/terminal_authority_(?:missing|rejected|denied)/i.test(code)) return code;
    const status =
      coerceText(record.terminal_authority_status).trim() ||
      coerceText(record.terminal_authority_result).trim();
    if (/terminal_authority_(?:missing|rejected|denied)|\b(?:rejected|denied|not_terminal_authority)\b/i.test(status)) {
      return status;
    }
    if (
      (record.terminal_authority_granted === false || record.terminal_authority_ok === false) &&
      !readHelixCapabilityLaneTerminalKind(reply)
    ) {
      return "terminal_authority_rejected";
    }
  }
  return "";
}

function buildHelixCapabilityLaneTerminalEvent(input: {
  replyId: string;
  turnId: string;
  terminalKind: string;
  terminalRejection: string;
  eventSource: string;
}): Record<string, unknown> | null {
  if (input.terminalKind) {
    return {
      id: `${input.replyId}-capability-lane-terminal-selected`,
      role: "agent",
      type: "decision",
      status: "completed",
      text: `Terminal selected: ${input.terminalKind}.`,
      detail: input.terminalKind,
      lane: "helix_terminal_authority",
      step_id: "terminal_selected",
      turn_id: input.turnId,
      event_source: input.eventSource,
      source_event_type: "terminal_selected",
    };
  }
  if (!input.terminalRejection) return null;
  return {
    id: `${input.replyId}-capability-lane-terminal-rejected`,
    role: "agent",
    type: "decision",
    status: "rejected",
    text: `Terminal rejected: ${input.terminalRejection}.`,
    detail: input.terminalRejection,
    lane: "helix_terminal_authority",
    step_id: "terminal_rejected",
    turn_id: input.turnId,
    event_source: input.eventSource,
    source_event_type: "terminal_rejected",
  };
}

function readHelixCapabilityLaneId(record: Record<string, unknown>): string {
  const trace = readAgentLoopAuditRecord(record.lane_resolve_trace);
  return (
    coerceText(record.lane_id).trim() ||
    coerceText(record.laneId).trim() ||
    coerceText(record.requested_lane).trim() ||
    coerceText(trace?.requested_lane).trim() ||
    coerceText(trace?.selected_lane).trim()
  );
}

function readHelixCapabilityLaneCapability(record: Record<string, unknown>): string {
  const request = readAgentLoopAuditRecord(record.request);
  return (
    coerceText(record.capability).trim() ||
    coerceText(record.capability_id).trim() ||
    coerceText(record.capability_key).trim() ||
    coerceText(request?.capability).trim() ||
    readHelixCapabilityLaneId(record)
  );
}

function readHelixCapabilityLaneObservationPacketForCall(
  call: Record<string, unknown>,
  packets: Record<string, unknown>[],
): Record<string, unknown> | null {
  const directPacket = readAgentLoopAuditRecord(call.observation_packet);
  if (directPacket) return directPacket;
  const capability = readHelixCapabilityLaneCapability(call);
  const laneId = readHelixCapabilityLaneId(call);
  const observationRef = coerceText(call.observation_ref).trim();
  return packets.find((packet) => {
    const packetCapability =
      coerceText(packet.capability_key).trim() ||
      coerceText(packet.capability_id).trim() ||
      coerceText(packet.capability).trim();
    const packetLane = coerceText(packet.lane_id).trim() || coerceText(packet.lane).trim();
    const packetRef =
      coerceText(packet.observation_ref).trim() ||
      coerceText(packet.artifact_ref).trim() ||
      coerceText(packet.ref).trim();
    return Boolean(
      (capability && packetCapability === capability) ||
        (laneId && packetLane === laneId) ||
        (observationRef && packetRef === observationRef),
    );
  }) ?? null;
}

function readHelixCapabilityLaneTraceForCall(
  call: Record<string, unknown>,
  traces: Record<string, unknown>[],
): Record<string, unknown> | null {
  const directTrace = readAgentLoopAuditRecord(call.lane_resolve_trace);
  if (directTrace) return directTrace;
  const laneId = readHelixCapabilityLaneId(call);
  const capability = readHelixCapabilityLaneCapability(call);
  return traces.find((trace) => {
    const traceLane =
      coerceText(trace.requested_lane).trim() ||
      coerceText(trace.selected_lane).trim() ||
      coerceText(trace.lane_id).trim();
    const traceCapability =
      coerceText(trace.capability).trim() ||
      coerceText(trace.capability_id).trim() ||
      coerceText(trace.capability_key).trim();
    return Boolean((laneId && traceLane === laneId) || (capability && traceCapability === capability));
  }) ?? null;
}

function hasSucceededHelixCapabilityLanePacket(packet: Record<string, unknown> | null, call: Record<string, unknown>): boolean {
  if (call.ok !== true) return false;
  const status = coerceText(packet?.status).trim().toLowerCase();
  return status !== "blocked" && status !== "failed" && status !== "missing_input" && status !== "needs_confirmation";
}

function readHelixCapabilityLaneSessionId(
  call: Record<string, unknown>,
  packet: Record<string, unknown> | null,
): string {
  const observation = readAgentLoopAuditRecord(call.observation);
  const request = readAgentLoopAuditRecord(call.request);
  const stateDelta = readAgentLoopAuditRecord(packet?.state_delta);
  const translationChunk = readAgentLoopAuditRecord(stateDelta?.live_translation_chunk);
  return (
    coerceText(call.lane_session_id).trim() ||
    coerceText(observation?.lane_session_id).trim() ||
    coerceText(request?.lane_session_id).trim() ||
    coerceText(translationChunk?.lane_session_id).trim()
  );
}

function summarizeHelixCapabilityLaneBackend(trace: Record<string, unknown> | null): string {
  const decision = readAgentLoopAuditRecord(trace?.backend_selection_decision);
  const selectedBackend =
    coerceText(trace?.selected_backend_provider).trim() ||
    coerceText(trace?.backend_provider).trim() ||
    coerceText(trace?.backend_provider_id).trim();
  const requestedBackend = coerceText(trace?.requested_backend_provider).trim();
  const requestedAvailability = coerceText(trace?.requested_backend_availability_status).trim();
  const requestedPermission = coerceText(trace?.requested_backend_permission_status).trim();
  const requestedConfiguration = coerceText(trace?.requested_backend_configuration_status).trim();
  const selectionReason = coerceText(trace?.selection_reason).trim();
  const decisionOutcome = coerceText(decision?.outcome).trim();
  const runtimeRootPreserved = decision?.selected_runtime_provider_remains_root === true;
  const noLiveBackend = decision?.live_backend_execution_enabled === false;
  const terminalOwner = coerceText(decision?.terminal_authority_owner).trim();
  const availability = coerceText(trace?.availability_status).trim();
  const permission = coerceText(trace?.permission_status).trim();
  const cost = coerceText(trace?.cost_class).trim();
  const latency = coerceText(trace?.latency_class).trim();
  const privacy = coerceText(trace?.privacy_class).trim();
  const fallback = coerceText(trace?.fallback_backend_provider).trim();
  const parts = [
    selectedBackend ? `selected ${selectedBackend}` : "",
    requestedBackend ? `requested ${requestedBackend}` : "",
    requestedConfiguration ? `requested configuration ${requestedConfiguration}` : "",
    requestedAvailability ? `requested availability ${requestedAvailability}` : "",
    requestedPermission ? `requested permission ${requestedPermission}` : "",
    decisionOutcome ? `decision ${decisionOutcome}` : "",
    runtimeRootPreserved ? "runtime root preserved" : "",
    noLiveBackend ? "no live backend execution" : "",
    terminalOwner ? `terminal authority ${terminalOwner}` : "",
    selectionReason ? `reason ${selectionReason}` : "",
    availability ? `availability ${availability}` : "",
    permission ? `permission ${permission}` : "",
    cost ? `cost ${cost}` : "",
    latency ? `latency ${latency}` : "",
    privacy ? `privacy ${privacy}` : "",
    fallback ? `fallback ${fallback}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function summarizeHelixCapabilityLaneBackendDecision(value: unknown): string[] {
  const decision = readAgentLoopAuditRecord(value);
  if (!decision) return [];
  const decisionOutcome = coerceText(decision.outcome).trim();
  const terminalOwner = coerceText(decision.terminal_authority_owner).trim();
  return [
    decisionOutcome ? `decision ${decisionOutcome}` : "",
    decision.selected_runtime_provider_remains_root === true ? "runtime root preserved" : "",
    decision.live_backend_execution_enabled === false ? "no live backend execution" : "",
    terminalOwner ? `terminal authority ${terminalOwner}` : "",
  ].filter(Boolean);
}

function readHelixCapabilityLanePacketBackend(
  packet: Record<string, unknown> | null,
  trace?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!packet && !trace) return null;
  const stateDelta = readAgentLoopAuditRecord(packet?.state_delta);
  const shadowExecution = readAgentLoopAuditRecord(stateDelta?.capability_lane_shadow_execution);
  const decision = readAgentLoopAuditRecord(packet?.backend_selection_decision);
  const traceDecision = readAgentLoopAuditRecord(trace?.backend_selection_decision);
  const selectedBackend =
    coerceText(packet?.selected_backend_provider).trim() ||
    coerceText(shadowExecution?.selected_backend_provider).trim() ||
    coerceText(decision?.selected_backend_provider).trim() ||
    coerceText(trace?.selected_backend_provider).trim() ||
    coerceText(traceDecision?.selected_backend_provider).trim();
  const requestedBackend =
    coerceText(packet?.requested_backend_provider).trim() ||
    coerceText(shadowExecution?.requested_backend_provider).trim() ||
    coerceText(decision?.requested_backend_provider).trim() ||
    coerceText(trace?.requested_backend_provider).trim() ||
    coerceText(traceDecision?.requested_backend_provider).trim();
  const availability =
    coerceText(packet?.availability_status).trim() ||
    coerceText(shadowExecution?.availability_status).trim() ||
    coerceText(trace?.availability_status).trim();
  const permission =
    coerceText(packet?.permission_status).trim() ||
    coerceText(shadowExecution?.permission_status).trim() ||
    coerceText(trace?.permission_status).trim();
  const execution =
    coerceText(packet?.execution_status).trim() ||
    coerceText(shadowExecution?.execution_status).trim() ||
    coerceText(trace?.execution_status).trim() ||
    (packet?.status === "succeeded" ? "executed_observation_only" : "");
  const cost =
    coerceText(packet?.cost_class).trim() ||
    coerceText(shadowExecution?.cost_class).trim() ||
    coerceText(trace?.cost_class).trim();
  const latency =
    coerceText(packet?.latency_class).trim() ||
    coerceText(shadowExecution?.latency_class).trim() ||
    coerceText(trace?.latency_class).trim();
  const privacy =
    coerceText(packet?.privacy_class).trim() ||
    coerceText(shadowExecution?.privacy_class).trim() ||
    coerceText(trace?.privacy_class).trim();
  const fallback =
    coerceText(packet?.fallback_backend_provider).trim() ||
    coerceText(shadowExecution?.fallback_backend_provider).trim() ||
    coerceText(decision?.fallback_backend_provider).trim() ||
    coerceText(trace?.fallback_backend_provider).trim() ||
    coerceText(traceDecision?.fallback_backend_provider).trim();
  const terminalAuthorityStatus =
    coerceText(packet?.terminal_authority_status).trim() ||
    coerceText(shadowExecution?.terminal_authority_status).trim() ||
    coerceText(trace?.terminal_authority_status).trim();
  if (
    !selectedBackend &&
    !requestedBackend &&
    !availability &&
    !permission &&
    !execution &&
    !cost &&
    !latency &&
    !privacy &&
    !fallback &&
    !terminalAuthorityStatus &&
    !decision &&
    !traceDecision
  ) {
    return null;
  }
  return {
    selected_backend_provider: selectedBackend || null,
    requested_backend_provider: requestedBackend || null,
    availability_status: availability || null,
    permission_status: permission || null,
    execution_status: execution || null,
    cost_class: cost || null,
    latency_class: latency || null,
    privacy_class: privacy || null,
    fallback_backend_provider: fallback || null,
    terminal_authority_status: terminalAuthorityStatus || null,
    backend_selection_decision: decision ?? traceDecision,
    terminal_eligible:
      typeof shadowExecution?.terminal_eligible === "boolean"
        ? shadowExecution.terminal_eligible
        : packet?.terminal_eligible,
    assistant_answer:
      typeof shadowExecution?.assistant_answer === "boolean"
        ? shadowExecution.assistant_answer
        : packet?.assistant_answer,
  };
}

function summarizeHelixCapabilityLanePacketBackend(
  packet: Record<string, unknown> | null,
  trace?: Record<string, unknown> | null,
): string {
  const backend = readHelixCapabilityLanePacketBackend(packet, trace);
  if (!backend) return "";
  const decisionParts = summarizeHelixCapabilityLaneBackendDecision(backend.backend_selection_decision);
  const observationOnly = backend.terminal_eligible === false || backend.assistant_answer === false;
  const parts = [
    coerceText(backend.selected_backend_provider).trim()
      ? `backend ${coerceText(backend.selected_backend_provider).trim()}`
      : "",
    coerceText(backend.requested_backend_provider).trim()
      ? `requested backend ${coerceText(backend.requested_backend_provider).trim()}`
      : "",
    coerceText(backend.execution_status).trim()
      ? `execution ${coerceText(backend.execution_status).trim()}`
      : "",
    coerceText(backend.availability_status).trim()
      ? `availability ${coerceText(backend.availability_status).trim()}`
      : "",
    coerceText(backend.permission_status).trim()
      ? `permission ${coerceText(backend.permission_status).trim()}`
      : "",
    coerceText(backend.cost_class).trim() ? `cost ${coerceText(backend.cost_class).trim()}` : "",
    coerceText(backend.latency_class).trim() ? `latency ${coerceText(backend.latency_class).trim()}` : "",
    coerceText(backend.privacy_class).trim() ? `privacy ${coerceText(backend.privacy_class).trim()}` : "",
    coerceText(backend.fallback_backend_provider).trim()
      ? `fallback ${coerceText(backend.fallback_backend_provider).trim()}`
      : "",
    ...decisionParts,
    observationOnly ? "lane output remains observation-only" : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function formatHelixCapabilityLaneObservationText(args: {
  capabilityId: string;
  call: Record<string, unknown>;
  packet: Record<string, unknown> | null;
  trace?: Record<string, unknown> | null;
  ok: boolean;
}): string {
  const sessionId = readHelixCapabilityLaneSessionId(args.call, args.packet);
  const sessionSuffix = sessionId ? ` session ${sessionId}` : "";
  const summary =
    coerceText(args.packet?.observation_summary).trim() ||
    coerceText(args.call.observation_summary).trim() ||
    coerceText(args.call.summary).trim() ||
    coerceText(args.call.error).trim();
  const backendSummary = summarizeHelixCapabilityLanePacketBackend(args.packet, args.trace);
  const backendSuffix = backendSummary ? ` ${backendSummary}.` : "";
  if (summary) {
    const cleanSummary = summary.replace(/\.$/, "");
    return `Lane observation: ${args.capabilityId}${sessionSuffix} ${args.ok ? "produced" : "blocked"} ${cleanSummary}.${backendSuffix}`;
  }
  return args.ok
    ? `Lane observation: ${args.capabilityId}${sessionSuffix} produced a governed observation packet.${backendSuffix}`
    : `Lane observation: ${args.capabilityId}${sessionSuffix} did not produce a successful observation packet.${backendSuffix}`;
}

function formatHelixCapabilityLaneDebugEventText(event: Record<string, unknown>): string {
  const stage = coerceText(event.stage).trim();
  const capability = coerceText(event.capability).trim() || coerceText(event.lane_id).trim() || "capability_lane";
  const sessionId = coerceText(event.lane_session_id).trim();
  const sessionSuffix = sessionId ? ` session ${sessionId}` : "";
  if (stage === "lane_requested") return `Lane requested: ${capability}.`;
  if (stage === "lane_backend_selected") {
    const decision = readAgentLoopAuditRecord(event.backend_selection_decision);
    const selectedBackend = coerceText(event.selected_backend_provider).trim();
    const requestedBackend = coerceText(event.requested_backend_provider).trim();
    const requestedConfiguration = coerceText(event.requested_backend_configuration_status).trim();
    const requestedAvailability = coerceText(event.requested_backend_availability_status).trim();
    const requestedPermission = coerceText(event.requested_backend_permission_status).trim();
    const decisionOutcome = coerceText(decision?.outcome).trim();
    const runtimeRootPreserved = decision?.selected_runtime_provider_remains_root === true;
    const noLiveBackend = decision?.live_backend_execution_enabled === false;
    const terminalOwner = coerceText(decision?.terminal_authority_owner).trim();
    const reason = coerceText(event.selection_reason).trim();
    const availability = coerceText(event.availability_status).trim();
    const permission = coerceText(event.permission_status).trim();
    const cost = coerceText(event.cost_class).trim();
    const latency = coerceText(event.latency_class).trim();
    const privacy = coerceText(event.privacy_class).trim();
    const fallback = coerceText(event.fallback_backend_provider).trim();
    const parts = [
      selectedBackend ? `selected ${selectedBackend}` : "",
      requestedBackend ? `requested ${requestedBackend}` : "",
      requestedConfiguration ? `requested configuration ${requestedConfiguration}` : "",
      requestedAvailability ? `requested availability ${requestedAvailability}` : "",
      requestedPermission ? `requested permission ${requestedPermission}` : "",
      decisionOutcome ? `decision ${decisionOutcome}` : "",
      runtimeRootPreserved ? "runtime root preserved" : "",
      noLiveBackend ? "no live backend execution" : "",
      terminalOwner ? `terminal authority ${terminalOwner}` : "",
      reason ? `reason ${reason}` : "",
      availability ? `availability ${availability}` : "",
      permission ? `permission ${permission}` : "",
      cost ? `cost ${cost}` : "",
      latency ? `latency ${latency}` : "",
      privacy ? `privacy ${privacy}` : "",
      fallback ? `fallback ${fallback}` : "",
    ].filter(Boolean);
    return parts.length
      ? `Lane backend selected: ${parts.join("; ")}.`
      : `Lane backend selected for ${capability}.`;
  }
  if (stage === "lane_observation") {
    const status = coerceText(event.status).trim();
    const verb = status === "completed" ? "produced" : "blocked";
    const observationRef = coerceText(event.observation_ref).trim();
    const receiptRef = coerceText(event.receipt_ref).trim();
    const suffix = receiptRef ? `; receipt ${receiptRef}` : "";
    return `Lane observation: ${capability}${sessionSuffix} ${verb} ${observationRef || "a governed observation packet"}${suffix}.`;
  }
  if (stage === "lane_reentered") {
    const status = coerceText(event.reentry_status).trim();
    const receiptRef = coerceText(event.receipt_ref).trim();
    const suffix = receiptRef ? ` Receipt ${receiptRef} remains observation-only.` : "";
    return status === "observation_packet_required_for_provider_reentry"
      ? `Lane re-entry: observation packet available for provider reasoning before terminal selection.${suffix}`
      : `Lane re-entry: ${status || "pending"}.`;
  }
  return `Lane event: ${capability}.`;
}

function formatHelixCapabilityLaneTimelineEventText(event: Record<string, unknown>): string {
  const stage = coerceText(event.stage).trim();
  const capability =
    coerceText(event.capability_id).trim() ||
    coerceText(event.capability).trim() ||
    coerceText(event.lane_id).trim() ||
    "capability_lane";
  const laneId = coerceText(event.lane_id).trim() || "capability_lane";
  const status = coerceText(event.status).trim();
  const selectedBackend = coerceText(event.selected_backend_provider).trim();
  const observationRef = coerceText(event.observation_ref).trim();
  const receiptRef = coerceText(event.receipt_ref).trim();
  const latestEventId = coerceText(event.latest_event_id).trim();
  const sessionLifecycleAction =
    coerceText(event.session_lifecycle_action ?? event.lifecycle_action ?? event.session_action).trim();
  const sessionDebugPhase = coerceText(event.session_debug_phase ?? event.sessionDebugPhase).trim();
  const sessionObservationStatus =
    coerceText(event.session_observation_status ?? event.sessionObservationStatus).trim();
  const sessionControlKey = coerceText(event.session_control_key).trim();
  const sourceBindingKey = coerceText(event.source_binding_key).trim();
  const latestObservationKey = coerceText(event.latest_observation_key).trim();
  const hasObservation = readCapabilityLaneHasObservation(event);
  const sourceId = coerceText(event.source_id ?? event.sourceId).trim();
  const sourceKind = coerceText(event.source_kind ?? event.sourceKind).trim();
  const sourceTextHash = coerceText(event.source_text_hash ?? event.sourceTextHash).trim();
  const sourceTextCharCount = coerceText(event.source_text_char_count ?? event.sourceTextCharCount).trim();
  const sourceIdentityKey = coerceText(event.source_identity_key ?? event.sourceIdentityKey).trim();
  const latestSourceIdentityKey =
    coerceText(event.latest_source_identity_key ?? event.latestSourceIdentityKey).trim();
  const sourceProjectionTarget =
    coerceText(
      event.source_projection_target ??
        event.sourceProjectionTarget ??
        event.projection_target ??
        event.projectionTarget,
    ).trim();
  const latestProjectionTarget =
    coerceText(
      event.latest_projection_target ??
        event.latestProjectionTarget ??
        event.projection_target ??
        event.projectionTarget,
    ).trim();
  const latestChunkId =
    coerceText(
      event.latest_chunk_id ??
        event.latestChunkId ??
        event.chunk_id ??
        event.chunkId,
    ).trim();
  const latestDedupeKey =
    coerceText(
      event.latest_dedupe_key ??
        event.latestDedupeKey ??
        event.dedupe_key ??
        event.dedupeKey,
    ).trim();
  const latestSourceEventId =
    coerceText(
      event.latest_source_event_id ??
        event.latestSourceEventId ??
        event.source_event_id ??
        event.sourceEventId,
    ).trim();
  const latestFreshnessStatus =
    coerceText(
      event.latest_freshness_status ??
        event.latestFreshnessStatus ??
        event.freshness_status ??
        event.freshnessStatus,
    ).trim();
  const targetLanguage = coerceText(event.target_language ?? event.targetLanguage).trim();
  const mailLoopWakeKind =
    coerceText(event.latest_mail_loop_wake_kind ?? event.latestMailLoopWakeKind ?? event.stage_play_wake_kind).trim();
  const reportAction = coerceText(event.report_action ?? event.reportAction).trim();
  const reportReason = coerceText(event.report_reason ?? event.reportReason).trim();
  const reportSummaryText = coerceText(event.report_summary_text ?? event.reportSummaryText).trim();
  const latestCancelRequested =
    typeof event.latest_cancel_requested === "boolean"
      ? event.latest_cancel_requested
      : typeof event.latestCancelRequested === "boolean"
        ? event.latestCancelRequested
        : typeof event.cancel_requested === "boolean"
          ? event.cancel_requested
          : typeof event.cancelRequested === "boolean"
            ? event.cancelRequested
            : null;
  const refSuffix = [
    sessionLifecycleAction ? `action ${sessionLifecycleAction}` : "",
    sessionDebugPhase ? `session phase ${sessionDebugPhase}` : "",
    sessionObservationStatus ? `observation status ${sessionObservationStatus}` : "",
    sessionControlKey ? `control ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestObservationKey ? `observation key ${latestObservationKey}` : "",
    latestEventId ? `latest event ${latestEventId}` : "",
    `has observation ${hasObservation ? "true" : "false"}`,
    observationRef ? `observation ${observationRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
  ].filter(Boolean).join("; ");
  const sourceSuffix = [
    sourceId ? `source ${sourceId}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    sourceIdentityKey ? `source identity key ${sourceIdentityKey}` : "",
    latestSourceIdentityKey ? `latest source identity key ${latestSourceIdentityKey}` : "",
    sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
    latestProjectionTarget ? `projection ${latestProjectionTarget}` : "",
    latestChunkId ? `chunk ${latestChunkId}` : "",
    latestDedupeKey ? `dedupe ${latestDedupeKey}` : "",
    latestSourceEventId ? `source event ${latestSourceEventId}` : "",
    latestFreshnessStatus ? `freshness ${latestFreshnessStatus}` : "",
    mailLoopWakeKind ? `wake kind ${mailLoopWakeKind}` : "",
    reportSummaryText ? `report summary ${reportSummaryText}` : "",
    reportAction ? `report action ${reportAction}` : "",
    reportReason ? `report reason ${reportReason}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    latestCancelRequested === null ? "" : `cancel requested ${String(latestCancelRequested)}`,
    refSuffix,
  ].filter(Boolean).join("; ");
  if (stage === "lane_visible") {
    return `Lane visible: ${capability}.`;
  }
  if (stage === "lane_requested") {
    return `Lane requested: ${capability}.`;
  }
  if (stage === "lane_backend_selected") {
    return selectedBackend
      ? `Lane backend selected: ${selectedBackend} for ${capability}.`
      : `Lane backend selected for ${capability}.`;
  }
  if (stage === "lane_observation") {
    const detail = refSuffix ? ` ${refSuffix}.` : "";
    return `Lane observation: ${capability} ${status || "completed"}.${detail}`;
  }
  if (stage === "lane_projection_receipt") {
    const detail = refSuffix ? ` ${refSuffix}.` : "";
    return `Lane receipt: ${capability} projection receipt recorded.${detail}`;
  }
  if (stage === "lane_reentered") {
    const detail = refSuffix ? ` ${refSuffix}.` : "";
    return `Lane re-entry: ${capability} observation re-entered provider reasoning.${detail}`;
  }
  if (stage === "terminal_selected") {
    const authority = coerceText(event.terminal_authority_status).trim();
    const detail = authority ? ` Authority ${authority}.` : "";
    return `Terminal selected: Helix accepted the provider candidate after lane evidence re-entry.${detail}`;
  }
  if (stage === "terminal_rejected") {
    const authority = coerceText(event.terminal_authority_status).trim();
    const detail = authority ? ` Authority ${authority}.` : "";
    return `Terminal rejected: Helix did not accept the provider candidate as lane terminal authority.${detail}`;
  }
  if (stage === "lane_session") {
    const detail = sourceSuffix ? ` ${sourceSuffix}.` : "";
    return `Lane session: ${laneId} ${status || "active"}.${detail}`;
  }
  if (stage === "lane_mail_loop") {
    const detail = sourceSuffix ? ` ${sourceSuffix}.` : "";
    return `Lane mail loop: ${laneId} ${status || "recorded"}.${detail}`;
  }
  if (stage === "goal_binding") {
    const detail = sourceSuffix ? ` ${sourceSuffix}.` : "";
    return `Goal lane binding: ${laneId} ${status || "bound"}.${detail}`;
  }
  return `Lane timeline: ${capability}.`;
}

function buildHelixCapabilityLaneTimelineTranscriptEvent(input: {
  replyId: string;
  turnId: string;
  event: Record<string, unknown>;
  index: number;
}): Record<string, unknown> {
  const stage = coerceText(input.event.stage).trim();
  const sourceEventType =
    stage === "lane_visible" ||
    stage === "lane_requested" ||
    stage === "lane_backend_selected" ||
    stage === "lane_observation" ||
    stage === "lane_projection_receipt" ||
    stage === "lane_reentered" ||
    stage === "lane_session" ||
    stage === "lane_mail_loop"
      ? stage
      : stage === "goal_binding"
        ? "lane_goal_binding"
        : stage === "terminal_selected" || stage === "terminal_rejected"
          ? stage
          : "lane_observation";
  const status = coerceText(input.event.status).trim();
  const capability =
    coerceText(input.event.capability_id).trim() ||
    coerceText(input.event.capability).trim() ||
    coerceText(input.event.lane_id).trim() ||
    "capability_lane";
  const laneId = coerceText(input.event.lane_id).trim() || "capability_lane";
  return {
    id: `${input.replyId}-capability-lane-timeline-${input.index}`,
    role:
      sourceEventType === "terminal_selected" || sourceEventType === "terminal_rejected"
        ? "system"
        : sourceEventType === "lane_backend_selected" || sourceEventType === "lane_visible"
        ? "system"
        : sourceEventType === "lane_observation" ||
          sourceEventType === "lane_projection_receipt" ||
          sourceEventType === "lane_mail_loop"
          ? "tool"
          : "agent",
    type:
      sourceEventType === "terminal_selected" || sourceEventType === "terminal_rejected"
        ? "model_decision"
        : sourceEventType === "lane_observation" ||
          sourceEventType === "lane_projection_receipt" ||
          sourceEventType === "lane_mail_loop" ||
          sourceEventType === "lane_visible"
        ? "observation"
        : "model_decision",
    status:
      status === "blocked" || status === "failed" || status === "permission_blocked"
        ? "failed"
        : status === "pending"
          ? "pending"
          : "completed",
    text: formatHelixCapabilityLaneTimelineEventText(input.event),
    detail:
      coerceText(input.event.observation_ref).trim() ||
      coerceText(input.event.receipt_ref).trim() ||
      coerceText(input.event.selected_backend_provider).trim() ||
      capability,
    lane: laneId,
    step_id: stage || `capability_lane_timeline_${input.index + 1}`,
    turn_id: input.turnId,
    capability_id: capability,
    lane_session_id: coerceText(input.event.lane_session_id).trim() || null,
    session_control_key: coerceText(input.event.session_control_key).trim() || null,
    source_binding_key: coerceText(input.event.source_binding_key).trim() || null,
    latest_observation_key: coerceText(input.event.latest_observation_key).trim() || null,
    latest_mail_loop_observation_key:
      coerceText(input.event.latest_mail_loop_observation_key).trim() || null,
    goal_binding_key: coerceText(input.event.goal_binding_key).trim() || null,
    latest_event_id: coerceText(input.event.latest_event_id).trim() || null,
    session_lifecycle_action:
      coerceText(input.event.session_lifecycle_action ?? input.event.lifecycle_action ?? input.event.session_action).trim() ||
      null,
    has_observation: readCapabilityLaneHasObservation(input.event),
    selected_runtime_agent_provider: coerceText(input.event.selected_runtime_agent_provider).trim() || null,
    requested_backend_provider: coerceText(input.event.requested_backend_provider).trim() || null,
    selected_backend_provider: coerceText(input.event.selected_backend_provider).trim() || null,
    fallback_backend_provider: coerceText(input.event.fallback_backend_provider).trim() || null,
    selection_reason:
      coerceText(input.event.selection_reason).trim() ||
      coerceText(input.event.backend_selection_reason).trim() ||
      null,
    receipt_ref: coerceText(input.event.receipt_ref).trim() || null,
    observation_ref: coerceText(input.event.observation_ref).trim() || null,
    source_id: coerceText(input.event.source_id ?? input.event.sourceId).trim() || null,
    source_hash: coerceText(input.event.source_hash ?? input.event.sourceHash).trim() || null,
    source_kind: coerceText(input.event.source_kind ?? input.event.sourceKind).trim() || null,
    source_text_hash: coerceText(input.event.source_text_hash ?? input.event.sourceTextHash).trim() || null,
    source_text_char_count:
      coerceText(input.event.source_text_char_count ?? input.event.sourceTextCharCount).trim() || null,
    source_identity_key: coerceText(input.event.source_identity_key ?? input.event.sourceIdentityKey).trim() || null,
    latest_source_identity_key:
      coerceText(input.event.latest_source_identity_key ?? input.event.latestSourceIdentityKey).trim() || null,
    source_projection_target:
      coerceText(
        input.event.source_projection_target ??
          input.event.sourceProjectionTarget ??
          input.event.projection_target ??
          input.event.projectionTarget,
      ).trim() || null,
    account_locale: coerceText(input.event.account_locale ?? input.event.accountLocale).trim() || null,
    latest_chunk_id:
      coerceText(
        input.event.latest_chunk_id ??
          input.event.latestChunkId ??
          input.event.chunk_id ??
          input.event.chunkId,
      ).trim() || null,
    latest_chunk_index:
      coerceText(
        input.event.latest_chunk_index ??
          input.event.latestChunkIndex ??
          input.event.chunk_index ??
          input.event.chunkIndex,
      ).trim() || null,
    latest_dedupe_key:
      coerceText(
        input.event.latest_dedupe_key ??
          input.event.latestDedupeKey ??
          input.event.dedupe_key ??
          input.event.dedupeKey,
      ).trim() || null,
    latest_source_event_id:
      coerceText(
        input.event.latest_source_event_id ??
          input.event.latestSourceEventId ??
          input.event.source_event_id ??
          input.event.sourceEventId,
      ).trim() || null,
    latest_source_event_ms:
      coerceText(
        input.event.latest_source_event_ms ??
          input.event.latestSourceEventMs ??
          input.event.source_event_ms ??
          input.event.sourceEventMs,
      ).trim() || null,
    latest_observed_at_ms:
      coerceText(
        input.event.latest_observed_at_ms ??
          input.event.latestObservedAtMs ??
          input.event.observed_at_ms ??
          input.event.observedAtMs,
      ).trim() || null,
    latest_freshness_status:
      coerceText(
        input.event.latest_freshness_status ??
          input.event.latestFreshnessStatus ??
          input.event.freshness_status ??
          input.event.freshnessStatus,
      ).trim() || null,
    latest_projection_target:
      coerceText(
        input.event.latest_projection_target ??
          input.event.latestProjectionTarget ??
          input.event.projection_target ??
          input.event.projectionTarget,
      ).trim() || null,
    target_language: coerceText(input.event.target_language ?? input.event.targetLanguage).trim() || null,
    latest_cancel_requested:
      typeof input.event.latest_cancel_requested === "boolean"
        ? input.event.latest_cancel_requested
        : typeof input.event.latestCancelRequested === "boolean"
          ? input.event.latestCancelRequested
          : typeof input.event.cancel_requested === "boolean"
            ? input.event.cancel_requested
            : typeof input.event.cancelRequested === "boolean"
              ? input.event.cancelRequested
              : null,
    report_action: coerceText(input.event.report_action ?? input.event.reportAction).trim() || null,
    report_reason: coerceText(input.event.report_reason ?? input.event.reportReason).trim() || null,
    quiet_behavior_applied:
      readTranscriptBoolean(input.event.quiet_behavior_applied ?? input.event.quietBehaviorApplied),
    wake_expected: readTranscriptBoolean(input.event.wake_expected ?? input.event.wakeExpected),
    surface_badge_expected:
      readTranscriptBoolean(input.event.surface_badge_expected ?? input.event.surfaceBadgeExpected),
    terminal_report_requested:
      readTranscriptBoolean(input.event.terminal_report_requested ?? input.event.terminalReportRequested),
    terminal_report_authorized:
      readTranscriptBoolean(input.event.terminal_report_authorized ?? input.event.terminalReportAuthorized),
    report_summary_text: coerceText(input.event.report_summary_text ?? input.event.reportSummaryText).trim() || null,
    terminal_authority_status: coerceText(input.event.terminal_authority_status).trim() || null,
    lane_visible: input.event.lane_visible === true,
    lane_requested: input.event.lane_requested === true,
    lane_executed: input.event.lane_executed === true,
    observation_reentered: input.event.observation_reentered === true,
    reentry_required: input.event.reentry_required === true,
    terminal_eligible: input.event.terminal_eligible === true,
    assistant_answer: input.event.assistant_answer === true,
    raw_content_included: input.event.raw_content_included === true,
    event_source: "capability_lane_turn_timeline",
    source_event_type: sourceEventType,
  };
}

function formatHelixCapabilityLaneConsoleStateText(row: Record<string, unknown>): string {
  const stateLabel = coerceText(row.state_label).trim() || "state";
  const normalizedStage = coerceText(row.normalized_stage).trim();
  const laneId = coerceText(row.lane_id).trim() || "capability_lane";
  const capability =
    coerceText(row.capability_id).trim() ||
    coerceText(row.capability).trim() ||
    laneId;
  const requestedBackend = coerceText(row.requested_backend_provider).trim();
  const selectedBackend = coerceText(row.selected_backend_provider).trim();
  const fallbackBackend = coerceText(row.fallback_backend_provider).trim();
  const backendSelectionReason =
    coerceText(row.backend_selection_reason).trim() ||
    coerceText(row.selection_reason).trim();
  const observationRef = coerceText(row.observation_ref).trim();
  const receiptRef = coerceText(row.receipt_ref).trim();
  const laneSessionId = coerceText(row.lane_session_id).trim();
  const sessionControlKey = coerceText(row.session_control_key).trim();
  const sourceBindingKey = coerceText(row.source_binding_key).trim();
  const latestObservationKey = coerceText(row.latest_observation_key).trim();
  const latestMailLoopObservationKey = coerceText(row.latest_mail_loop_observation_key).trim();
  const goalBindingKey = coerceText(row.goal_binding_key).trim();
  const latestEventId = coerceText(row.latest_event_id).trim();
  const wakeKind = coerceText(row.latest_mail_loop_wake_kind).trim();
  const reportAction = coerceText(row.report_action).trim();
  const terminalAuthority = coerceText(row.terminal_authority_status).trim();
  const detail = [
    normalizedStage ? `stage ${normalizedStage}` : "",
    requestedBackend ? `requested backend ${requestedBackend}` : "",
    selectedBackend ? `backend ${selectedBackend}` : "",
    fallbackBackend ? `fallback ${fallbackBackend}` : "",
    backendSelectionReason ? `reason ${backendSelectionReason}` : "",
    row.lane_visible === true ? "visible" : "",
    row.lane_requested === true ? "requested" : "",
    row.lane_executed === true ? "executed" : "",
    row.observation_reentered === true ? "re-entered" : "",
    laneSessionId ? `session ${laneSessionId}` : "",
    sessionControlKey ? `control ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestObservationKey ? `observation key ${latestObservationKey}` : "",
    latestMailLoopObservationKey ? `mail observation ${latestMailLoopObservationKey}` : "",
    goalBindingKey ? `goal binding key ${goalBindingKey}` : "",
    latestEventId ? `latest event ${latestEventId}` : "",
    observationRef ? `observation ${observationRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
    wakeKind ? `wake ${wakeKind}` : "",
    reportAction ? `report ${reportAction}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
  ].filter(Boolean).join("; ");
  return `Lane state: ${capability} is ${stateLabel}${detail ? `. ${detail}.` : "."}`;
}

function buildHelixCapabilityLaneConsoleStateTranscriptEvent(input: {
  replyId: string;
  turnId: string;
  row: Record<string, unknown>;
  index: number;
}): Record<string, unknown> {
  const laneId = coerceText(input.row.lane_id).trim() || "capability_lane";
  const capability =
    coerceText(input.row.capability_id).trim() ||
    coerceText(input.row.capability).trim() ||
    laneId;
  const stateLabel = coerceText(input.row.state_label).trim() || "state";
  const terminalSelected = stateLabel === "terminal_selected" || stateLabel === "terminal_rejected";
  return {
    id: `${input.replyId}-capability-lane-console-state-${input.index}`,
    role: terminalSelected ? "system" : input.row.lane_executed === true ? "tool" : "system",
    type: terminalSelected ? "model_decision" : "observation",
    status: "completed",
    text: formatHelixCapabilityLaneConsoleStateText(input.row),
    detail:
      coerceText(input.row.observation_ref).trim() ||
      coerceText(input.row.receipt_ref).trim() ||
      coerceText(input.row.selected_backend_provider).trim() ||
      stateLabel,
    lane: laneId,
    step_id: `lane_console_state_${coerceText(input.row.normalized_stage).trim() || input.index + 1}`,
    turn_id: input.turnId,
    capability_id: capability,
    lane_session_id: coerceText(input.row.lane_session_id).trim() || null,
    session_control_key: coerceText(input.row.session_control_key).trim() || null,
    source_binding_key: coerceText(input.row.source_binding_key).trim() || null,
    latest_observation_key: coerceText(input.row.latest_observation_key).trim() || null,
    latest_mail_loop_observation_key:
      coerceText(input.row.latest_mail_loop_observation_key).trim() || null,
    goal_binding_key: coerceText(input.row.goal_binding_key).trim() || null,
    selected_runtime_agent_provider: coerceText(input.row.selected_runtime_agent_provider).trim() || null,
    requested_backend_provider: coerceText(input.row.requested_backend_provider).trim() || null,
    selected_backend_provider: coerceText(input.row.selected_backend_provider).trim() || null,
    fallback_backend_provider: coerceText(input.row.fallback_backend_provider).trim() || null,
    selection_reason:
      coerceText(input.row.selection_reason).trim() ||
      coerceText(input.row.backend_selection_reason).trim() ||
      null,
    receipt_ref: coerceText(input.row.receipt_ref).trim() || null,
    observation_ref: coerceText(input.row.observation_ref).trim() || null,
    latest_event_id: coerceText(input.row.latest_event_id).trim() || null,
    latest_mail_loop_wake_kind: coerceText(input.row.latest_mail_loop_wake_kind).trim() || null,
    report_action: coerceText(input.row.report_action).trim() || null,
    report_reason: coerceText(input.row.report_reason).trim() || null,
    terminal_authority_status: coerceText(input.row.terminal_authority_status).trim() || null,
    normalized_stage: coerceText(input.row.normalized_stage).trim() || null,
    state_label: stateLabel,
    lane_visible: input.row.lane_visible === true,
    lane_requested: input.row.lane_requested === true,
    lane_executed: input.row.lane_executed === true,
    observation_reentered: input.row.observation_reentered === true,
    terminal_eligible: input.row.terminal_eligible === true,
    assistant_answer: input.row.assistant_answer === true,
    raw_content_included: input.row.raw_content_included === true,
    event_source: "capability_lane_timeline_summary.console_state_rows",
    source_event_type: "lane_console_state",
  };
}

function formatHelixVisibleTranslationCollectorText(chain: Record<string, unknown>): string {
  const requestedCollectorCapability = coerceText(chain.requested_collector_capability).trim();
  const collectorCapability =
    coerceText(chain.collector_capability).trim() ||
    "workstation_tool_reference.collect_visible_translation_targets";
  const translationCapability =
    coerceText(chain.translation_capability).trim() ||
    "live_translation.translate_text";
  const targetCount = coerceText(chain.collected_target_count).trim();
  const collectedSourceKinds = formatTranscriptStringArray(chain.collected_source_kinds);
  const collectedProjectionTargets = formatTranscriptStringArray(chain.collected_projection_targets);
  const collectedPanelIds = formatTranscriptStringArray(chain.collected_panel_ids);
  const translatedSourceKinds = formatTranscriptStringArray(chain.translated_source_kinds);
  const translatedProjectionTargets = formatTranscriptStringArray(chain.translated_projection_targets);
  const collectorObservationRef = coerceText(chain.collector_observation_ref).trim();
  const collectorBatchRef = coerceText(chain.collector_batch_ref).trim();
  const docPath = coerceText(chain.first_collected_doc_path).trim();
  const sourceId = coerceText(chain.first_collected_source_id).trim();
  const sourceHash = coerceText(chain.first_collected_source_hash).trim();
  const sourceTextHash = coerceText(chain.first_collected_source_text_hash).trim();
  const sourceTextCharCount = coerceText(chain.first_collected_source_text_char_count).trim();
  const chunkId = coerceText(chain.first_collected_chunk_id).trim();
  const sourceEventId = coerceText(chain.first_collected_source_event_id).trim();
  const sourceEventMs = coerceText(chain.first_collected_source_event_ms).trim();
  const observedAtMs = coerceText(chain.first_collected_observed_at_ms).trim();
  const projectionTarget = coerceText(chain.first_collected_projection_target).trim();
  const targetLanguage = coerceText(chain.first_collected_target_language).trim();
  const existingObservationRef = coerceText(chain.first_collected_existing_observation_ref).trim();
  const existingReceiptRef = coerceText(chain.first_collected_existing_receipt_ref).trim();
  const existingProjectionStatus = coerceText(chain.first_collected_existing_projection_status).trim();
  const existingFreshnessStatus = coerceText(chain.first_collected_existing_freshness_status).trim();
  const existingTerminalAuthorityStatus =
    coerceText(chain.first_collected_existing_terminal_authority_status).trim();
  const existingSourceEventMs = coerceText(chain.first_collected_existing_source_event_ms).trim();
  const existingObservedAtMs = coerceText(chain.first_collected_existing_observed_at_ms).trim();
  const collectorReentryRequired =
    readTranscriptBoolean(chain.collector_reentry_required) ??
    readTranscriptBoolean(chain.reentry_required) ??
    true;
  const translationObservationRef = coerceText(chain.translation_observation_ref).trim();
  const translationReceiptRef = coerceText(chain.translation_receipt_ref).trim();
  const projectionReceiptStatus = coerceText(chain.projection_receipt_status).trim();
  const detail = [
    targetCount ? `${targetCount} target${targetCount === "1" ? "" : "s"}` : "",
    collectedSourceKinds ? `collected source kinds ${collectedSourceKinds}` : "",
    collectedProjectionTargets ? `collected projections ${collectedProjectionTargets}` : "",
    collectedPanelIds ? `panels ${collectedPanelIds}` : "",
    translatedSourceKinds ? `translated source kinds ${translatedSourceKinds}` : "",
    translatedProjectionTargets ? `translated projections ${translatedProjectionTargets}` : "",
    docPath ? `doc ${docPath}` : "",
    sourceId ? `source ${sourceId}` : "",
    sourceHash ? `source hash ${sourceHash}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    chunkId ? `chunk ${chunkId}` : "",
    sourceEventId ? `source event ${sourceEventId}` : "",
    sourceEventMs ? `source event ms ${sourceEventMs}` : "",
    observedAtMs ? `observed ${observedAtMs}` : "",
    projectionTarget ? `projection ${projectionTarget}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    existingObservationRef ? `existing observation ${existingObservationRef}` : "",
    existingReceiptRef ? `existing receipt ${existingReceiptRef}` : "",
    existingProjectionStatus ? `existing projection ${existingProjectionStatus}` : "",
    existingFreshnessStatus ? `existing freshness ${existingFreshnessStatus}` : "",
    existingTerminalAuthorityStatus ? `existing terminal authority ${existingTerminalAuthorityStatus}` : "",
    existingSourceEventMs ? `existing source event ms ${existingSourceEventMs}` : "",
    existingObservedAtMs ? `existing observed ${existingObservedAtMs}` : "",
    `re-entry required ${String(collectorReentryRequired)}`,
    collectorObservationRef ? `collector observation ${collectorObservationRef}` : "",
    collectorBatchRef ? `batch ${collectorBatchRef}` : "",
    translationObservationRef ? `translation observation ${translationObservationRef}` : "",
    translationReceiptRef ? `translation receipt ${translationReceiptRef}` : "",
    projectionReceiptStatus ? `projection receipt ${projectionReceiptStatus}` : "",
  ].filter(Boolean).join("; ");
  const collectorLabel = requestedCollectorCapability && requestedCollectorCapability !== collectorCapability
    ? `${requestedCollectorCapability} requested; ${collectorCapability} executed`
    : collectorCapability;
  return `Visible translation collector: ${collectorLabel} collected source targets before ${translationCapability}${detail ? `. ${detail}.` : "."} Collector output remains observation-only.`;
}

function buildHelixVisibleTranslationCollectorTranscriptEvent(input: {
  replyId: string;
  turnId: string;
  chain: Record<string, unknown>;
}): Record<string, unknown> {
  const requestedCollectorCapability = coerceText(input.chain.requested_collector_capability).trim();
  const collectorCapability =
    coerceText(input.chain.collector_capability).trim() ||
    "workstation_tool_reference.collect_visible_translation_targets";
  return {
    id: `${input.replyId}-visible-translation-collector-chain`,
    role: "tool",
    type: "observation",
    status: input.chain.translation_requested === true || input.chain.collector_requested === true
      ? "completed"
      : "pending",
    text: formatHelixVisibleTranslationCollectorText(input.chain),
    detail:
      coerceText(input.chain.collector_observation_ref).trim() ||
      coerceText(input.chain.collector_batch_ref).trim() ||
      collectorCapability,
    lane: "workstation_tool_reference",
    step_id: "visible_translation_collector_chain",
    turn_id: input.turnId,
    capability_id: collectorCapability,
    requested_capability_id: requestedCollectorCapability || null,
    executed_capability_id: collectorCapability,
    observation_ref: coerceText(input.chain.collector_observation_ref).trim() || null,
    receipt_ref: coerceText(input.chain.translation_receipt_ref).trim() || null,
    source_id: coerceText(input.chain.first_collected_source_id).trim() || null,
    collected_source_kinds: readAgentLoopAuditArray(input.chain.collected_source_kinds),
    collected_projection_targets: readAgentLoopAuditArray(input.chain.collected_projection_targets),
    collected_panel_ids: readAgentLoopAuditArray(input.chain.collected_panel_ids),
    translated_source_kinds: readAgentLoopAuditArray(input.chain.translated_source_kinds),
    translated_projection_targets: readAgentLoopAuditArray(input.chain.translated_projection_targets),
    source_hash: coerceText(input.chain.first_collected_source_hash).trim() || null,
    source_text_hash: coerceText(input.chain.first_collected_source_text_hash).trim() || null,
    source_text_char_count:
      coerceText(input.chain.first_collected_source_text_char_count).trim() || null,
    latest_chunk_id: coerceText(input.chain.first_collected_chunk_id).trim() || null,
    latest_source_event_id:
      coerceText(input.chain.first_collected_source_event_id).trim() || null,
    latest_source_event_ms:
      coerceText(input.chain.first_collected_source_event_ms).trim() || null,
    latest_observed_at_ms:
      coerceText(input.chain.first_collected_observed_at_ms).trim() || null,
    latest_projection_target:
      coerceText(input.chain.first_collected_projection_target).trim() || null,
    target_language: coerceText(input.chain.first_collected_target_language).trim() || null,
    existing_observation_ref:
      coerceText(input.chain.first_collected_existing_observation_ref).trim() || null,
    existing_receipt_ref:
      coerceText(input.chain.first_collected_existing_receipt_ref).trim() || null,
    existing_projection_status:
      coerceText(input.chain.first_collected_existing_projection_status).trim() || null,
    existing_freshness_status:
      coerceText(input.chain.first_collected_existing_freshness_status).trim() || null,
    existing_terminal_authority_status:
      coerceText(input.chain.first_collected_existing_terminal_authority_status).trim() || null,
    existing_source_event_ms:
      coerceText(input.chain.first_collected_existing_source_event_ms).trim() || null,
    existing_observed_at_ms:
      coerceText(input.chain.first_collected_existing_observed_at_ms).trim() || null,
    reentry_required:
      readTranscriptBoolean(input.chain.collector_reentry_required) ??
      readTranscriptBoolean(input.chain.reentry_required) ??
      true,
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
    event_source: "runtime_lane_request_loop.visible_translation_collector_chain",
    source_event_type: "visible_translation_collector",
  };
}

function formatHelixVisibleTranslationChainSummaryText(summary: Record<string, unknown>): string {
  const complete = summary.chain_complete === true;
  const targetCount = coerceText(summary.collected_target_count).trim();
  const projectionReceiptCount = coerceText(summary.projection_receipt_count).trim();
  const backendSelectedCount = coerceText(summary.backend_selected_count).trim();
  const sourceIds = formatTranscriptStringArray(summary.source_ids);
  const chunkIds = formatTranscriptStringArray(summary.chunk_ids);
  const sourceKinds = formatTranscriptStringArray(summary.source_kinds);
  const panelIds = formatTranscriptStringArray(summary.panel_ids);
  const regionIds = formatTranscriptStringArray(summary.region_ids);
  const targetLanguages = formatTranscriptStringArray(summary.target_languages);
  const projectionTargets = formatTranscriptStringArray(summary.projection_targets);
  const observationRefs = formatTranscriptStringArray(summary.observation_refs);
  const receiptRefs = formatTranscriptStringArray(summary.receipt_refs);
  const detail = [
    targetCount ? `${targetCount} collected target${targetCount === "1" ? "" : "s"}` : "",
    backendSelectedCount ? `${backendSelectedCount} backend selection${backendSelectedCount === "1" ? "" : "s"}` : "",
    projectionReceiptCount ? `${projectionReceiptCount} projection receipt${projectionReceiptCount === "1" ? "" : "s"}` : "",
    sourceIds ? `source ${sourceIds}` : "",
    chunkIds ? `chunk ${chunkIds}` : "",
    sourceKinds ? `source kind ${sourceKinds}` : "",
    panelIds ? `panel ${panelIds}` : "",
    regionIds ? `region ${regionIds}` : "",
    projectionTargets ? `projection ${projectionTargets}` : "",
    targetLanguages ? `language ${targetLanguages}` : "",
    observationRefs ? `observation ${observationRefs}` : "",
    receiptRefs ? `receipt ${receiptRefs}` : "",
  ].filter(Boolean).join("; ");
  return `Visible translation chain ${complete ? "complete" : "incomplete"}: collector ${summary.collector_requested === true ? "requested" : "not requested"}; translation ${summary.translation_executed === true ? "executed" : summary.translation_requested === true ? "requested" : "not requested"}; re-entry ${summary.observation_reentered === true ? "confirmed" : "pending"}; terminal ${summary.terminal_selected === true ? "selected" : summary.terminal_rejected === true ? "rejected" : "pending"}${detail ? `. ${detail}.` : "."} Projection is not terminal authority.`;
}

function buildHelixVisibleTranslationChainSummaryTranscriptEvent(input: {
  replyId: string;
  turnId: string;
  summary: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: `${input.replyId}-visible-translation-chain-summary`,
    role: "system",
    type: "observation",
    status: input.summary.chain_complete === true
      ? "completed"
      : input.summary.terminal_rejected === true
        ? "failed"
        : "pending",
    text: formatHelixVisibleTranslationChainSummaryText(input.summary),
    detail:
      formatTranscriptStringArray(input.summary.receipt_refs) ||
      formatTranscriptStringArray(input.summary.observation_refs) ||
      "visible_translation_chain_summary",
    lane: "live_translation",
    step_id: "visible_translation_chain_summary",
    turn_id: input.turnId,
    capability_id: "live_translation.translate_text",
    requested_capability_id: coerceText(input.summary.collector_capability).trim() || null,
    executed_capability_id: "live_translation.translate_text",
    observation_ref: readAgentLoopAuditArray(input.summary.observation_refs).map(coerceText).find(Boolean) || null,
    receipt_ref: readAgentLoopAuditArray(input.summary.receipt_refs).map(coerceText).find(Boolean) || null,
    source_id: readAgentLoopAuditArray(input.summary.source_ids).map(coerceText).find(Boolean) || null,
    source_kind: readAgentLoopAuditArray(input.summary.source_kinds).map(coerceText).find(Boolean) || null,
    panel_id: readAgentLoopAuditArray(input.summary.panel_ids).map(coerceText).find(Boolean) || null,
    region_id: readAgentLoopAuditArray(input.summary.region_ids).map(coerceText).find(Boolean) || null,
    latest_chunk_id: readAgentLoopAuditArray(input.summary.chunk_ids).map(coerceText).find(Boolean) || null,
    latest_projection_target: readAgentLoopAuditArray(input.summary.projection_targets).map(coerceText).find(Boolean) || null,
    target_language: readAgentLoopAuditArray(input.summary.target_languages).map(coerceText).find(Boolean) || null,
    lane_requested: input.summary.translation_requested === true,
    lane_executed: input.summary.translation_executed === true,
    observation_reentered: input.summary.observation_reentered === true,
    terminal_authority_status: input.summary.terminal_selected === true
      ? "terminal_selected_after_reentry"
      : input.summary.terminal_rejected === true
        ? "terminal_rejected"
        : "pending_helix_terminal_authority",
    context_role: "tool_evidence",
    reentry_required: true,
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
    projection_is_terminal_authority: false,
    event_source: "visible_translation_chain_summary",
    source_event_type: "visible_translation_chain_summary",
  };
}

function formatHelixCapabilityLaneProjectionReceiptText(receipt: Record<string, unknown>): string {
  const capability =
    coerceText(receipt.capability).trim() ||
    coerceText(receipt.capability_key).trim() ||
    coerceText(receipt.lane_id).trim() ||
    "capability_lane";
  const receiptRef = coerceText(receipt.receipt_ref).trim();
  const observationRef = coerceText(receipt.observation_ref).trim();
  const payload = readAgentLoopAuditRecord(receipt.payload);
  const projectionTarget =
    coerceText(receipt.projection_target).trim() ||
    coerceText(payload?.projection_target).trim();
  const sourceId =
    coerceText(receipt.source_id).trim() ||
    coerceText(payload?.source_id).trim();
  const panelId =
    coerceText(receipt.panel_id).trim() ||
    coerceText(receipt.panelId).trim() ||
    coerceText(payload?.panel_id).trim() ||
    coerceText(payload?.panelId).trim();
  const regionId =
    coerceText(receipt.region_id).trim() ||
    coerceText(receipt.regionId).trim() ||
    coerceText(payload?.region_id).trim() ||
    coerceText(payload?.regionId).trim();
  const bbox =
    serializeAgentLoopAuditRecord(receipt.bbox) ||
    serializeAgentLoopAuditRecord(receipt.bbox_px) ||
    serializeAgentLoopAuditRecord(receipt.bboxPx) ||
    serializeAgentLoopAuditRecord(payload?.bbox) ||
    serializeAgentLoopAuditRecord(payload?.bbox_px) ||
    serializeAgentLoopAuditRecord(payload?.bboxPx);
  const docPath =
    coerceText(receipt.doc_path).trim() ||
    coerceText(receipt.docPath).trim() ||
    coerceText(payload?.doc_path).trim() ||
    coerceText(payload?.docPath).trim();
  const sourceHash =
    coerceText(receipt.source_hash).trim() ||
    coerceText(receipt.sourceHash).trim() ||
    coerceText(payload?.source_hash).trim() ||
    coerceText(payload?.sourceHash).trim();
  const sourceKind =
    coerceText(receipt.source_kind).trim() ||
    coerceText(payload?.source_kind).trim();
  const sourceTextHash =
    coerceText(receipt.source_text_hash).trim() ||
    coerceText(receipt.sourceTextHash).trim() ||
    coerceText(payload?.source_text_hash).trim() ||
    coerceText(payload?.sourceTextHash).trim();
  const sourceTextCharCount =
    coerceText(receipt.source_text_char_count).trim() ||
    coerceText(receipt.sourceTextCharCount).trim() ||
    coerceText(payload?.source_text_char_count).trim() ||
    coerceText(payload?.sourceTextCharCount).trim();
  const accountLocale =
    coerceText(receipt.account_locale).trim() ||
    coerceText(payload?.account_locale).trim();
  const projectionStatus =
    coerceText(receipt.projection_status).trim() ||
    coerceText(payload?.projection_status).trim() ||
    coerceText(receipt.status).trim();
  const projectionKey =
    coerceText(receipt.projection_key).trim() ||
    coerceText(receipt.projectionKey).trim() ||
    coerceText(payload?.projection_key).trim() ||
    coerceText(payload?.projectionKey).trim();
  const targetLanguage =
    coerceText(receipt.target_language).trim() ||
    coerceText(payload?.target_language).trim();
  const chunkId =
    coerceText(receipt.chunk_id).trim() ||
    coerceText(receipt.chunkId).trim() ||
    coerceText(payload?.chunk_id).trim() ||
    coerceText(payload?.chunkId).trim();
  const chunkIndex =
    coerceText(receipt.chunk_index).trim() ||
    coerceText(receipt.chunkIndex).trim() ||
    coerceText(payload?.chunk_index).trim() ||
    coerceText(payload?.chunkIndex).trim();
  const dedupeKey =
    coerceText(receipt.dedupe_key).trim() ||
    coerceText(receipt.dedupeKey).trim() ||
    coerceText(payload?.dedupe_key).trim() ||
    coerceText(payload?.dedupeKey).trim();
  const sourceEventId =
    coerceText(receipt.source_event_id).trim() ||
    coerceText(receipt.sourceEventId).trim() ||
    coerceText(payload?.source_event_id).trim() ||
    coerceText(payload?.sourceEventId).trim();
  const sourceEventMs =
    coerceText(receipt.source_event_ms).trim() ||
    coerceText(receipt.sourceEventMs).trim() ||
    coerceText(payload?.source_event_ms).trim() ||
    coerceText(payload?.sourceEventMs).trim();
  const observedAtMs =
    coerceText(receipt.observed_at_ms).trim() ||
    coerceText(receipt.observedAtMs).trim() ||
    coerceText(payload?.observed_at_ms).trim() ||
    coerceText(payload?.observedAtMs).trim();
  const freshnessStatus =
    coerceText(receipt.freshness_status).trim() ||
    coerceText(receipt.freshnessStatus).trim() ||
    coerceText(payload?.freshness_status).trim() ||
    coerceText(payload?.freshnessStatus).trim();
  const terminalAuthority =
    coerceText(receipt.terminal_authority_status).trim() ||
    coerceText(payload?.terminal_authority_status).trim();
  const reentryRequired =
    readTranscriptBoolean(receipt.reentry_required) ??
    readTranscriptBoolean(receipt.reentryRequired) ??
    readTranscriptBoolean(payload?.reentry_required) ??
    readTranscriptBoolean(payload?.reentryRequired);
  const parts = [
    capability,
    projectionStatus ? `projection ${projectionStatus}` : "",
    projectionKey ? `projection key ${projectionKey}` : "",
    projectionTarget ? `target ${projectionTarget}` : "",
    sourceId ? `source ${sourceId}` : "",
    panelId ? `panel ${panelId}` : "",
    regionId ? `region ${regionId}` : "",
    bbox ? `bbox ${bbox}` : "",
    docPath ? `doc path ${docPath}` : "",
    sourceHash ? `source hash ${sourceHash}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    accountLocale ? `account locale ${accountLocale}` : "",
    targetLanguage ? `language ${targetLanguage}` : "",
    chunkId ? `chunk ${chunkId}` : "",
    chunkIndex ? `chunk index ${chunkIndex}` : "",
    dedupeKey ? `dedupe ${dedupeKey}` : "",
    sourceEventId ? `source event ${sourceEventId}` : "",
    sourceEventMs ? `source event ms ${sourceEventMs}` : "",
    observedAtMs ? `observed ${observedAtMs}` : "",
    freshnessStatus ? `freshness ${freshnessStatus}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    reentryRequired !== null ? `re-entry required ${String(reentryRequired)}` : "",
    observationRef ? `observation ${observationRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
  ].filter(Boolean);
  return `Lane projection receipt: ${parts.join("; ")}; remains observation-only.`;
}

function formatHelixCapabilityLaneVisibleText(lane: Record<string, unknown>): string {
  const laneId = coerceText(lane.lane_id).trim() || "capability_lane";
  const status = coerceText(lane.status).trim();
  const defaultBackend = coerceText(lane.default_backend_provider).trim();
  const capabilities = readAgentLoopAuditArray(lane.capabilities)
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((capability) => {
      const capabilityId = coerceText(capability.capability_id).trim();
      const oneShot = coerceText(capability.one_shot_status).trim();
      const session = coerceText(capability.session_status).trim();
      return [
        capabilityId,
        oneShot ? `one-shot ${oneShot}` : "",
        session ? `session ${session}` : "",
      ].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
  const suffix = [
    status ? `status ${status}` : "",
    defaultBackend ? `default backend ${defaultBackend}` : "",
    capabilities ? `capabilities ${capabilities}` : "",
  ].filter(Boolean).join("; ");
  return `Lane visible: ${laneId}${suffix ? `; ${suffix}` : ""}; visible does not mean executed.`;
}

function formatHelixLiveTranslationUiProjectionText(projection: HelixLiveTranslationUiProjection): string {
  const sessionDebugPhase = coerceText(projection.sessionDebugPhase).trim();
  const sessionObservationStatus = coerceText(projection.sessionObservationStatus).trim();
  const accountLanguageHealth =
    projection.projectionTarget === "account_language"
      ? resolveHelixAccountLanguageTranslationProjectionHealth({
        projectionStatus: projection.status,
        translatedText: projection.translatedText,
        terminalAuthorityStatus: projection.terminalAuthorityStatus,
        sessionDebugPhase: projection.sessionDebugPhase,
        sessionObservationStatus: projection.sessionObservationStatus,
        laneSessionId: projection.laneSessionId,
      })
      : "";
  const parts = [
    `status ${projection.status}`,
    accountLanguageHealth ? `account-language health ${accountLanguageHealth}` : "",
    `target ${projection.projectionTarget}`,
    projection.targetLanguage ? `language ${projection.targetLanguage}` : "",
    projection.sourceId ? `source ${projection.sourceId}` : "",
    projection.sourceHash ? `source hash ${projection.sourceHash}` : "",
    projection.sourceKind ? `source kind ${projection.sourceKind}` : "",
    projection.sourceTextHash ? `source payload hash ${projection.sourceTextHash}` : "",
    typeof projection.sourceTextCharCount === "number"
      ? `source payload chars ${projection.sourceTextCharCount}`
      : "",
    projection.accountLocale ? `account locale ${projection.accountLocale}` : "",
    projection.chunkId ? `chunk ${projection.chunkId}` : "",
    projection.chunkIndex !== null ? `index ${projection.chunkIndex}` : "",
    projection.dedupeKey ? `dedupe ${projection.dedupeKey}` : "",
    projection.sourceEventId ? `source event id ${projection.sourceEventId}` : "",
    projection.freshnessStatus ? `freshness ${projection.freshnessStatus}` : "",
    sessionDebugPhase ? `session phase ${sessionDebugPhase}` : "",
    sessionObservationStatus ? `observation status ${sessionObservationStatus}` : "",
    projection.stale ? "stale" : "",
    projection.cancelRequested ? "cancelled" : "",
    projection.terminalAuthorityStatus ? `terminal authority ${projection.terminalAuthorityStatus}` : "",
    projection.translatedText ? `text ${clipText(projection.translatedText, 160)}` : "",
    projection.observationRef ? `observation ${projection.observationRef}` : "",
    projection.receiptRef ? `receipt ${projection.receiptRef}` : "",
  ].filter(Boolean);
  return `UI translation projection: ${parts.join("; ")}; projection-only, not terminal authority.`;
}

function formatHelixCapabilityLaneGoalBindingSummaryText(summary: Record<string, unknown>): string {
  const goalId = coerceText(summary.goal_id).trim();
  const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
  const sessionId = coerceText(summary.lane_session_id).trim();
  const goalBindingKey = coerceText(summary.goal_binding_key).trim();
  const sessionControlKey = coerceText(summary.session_control_key).trim();
  const sourceBindingKey = coerceText(summary.source_binding_key).trim();
  const latestObservationKey = coerceText(summary.latest_observation_key).trim();
  const latestMailLoopObservationKey = coerceText(summary.latest_mail_loop_observation_key).trim();
  const bindingStatus = coerceText(summary.binding_status).trim();
  const lifecycleAction = coerceText(
    summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action,
  ).trim();
  const sessionStatus = coerceText(summary.session_status).trim();
  const sessionHealth = coerceText(summary.session_health).trim();
  const backend = coerceText(summary.selected_backend_provider).trim();
  const cost = coerceText(summary.cost_class).trim();
  const latency = coerceText(summary.latency_class).trim();
  const privacy = coerceText(summary.privacy_class).trim();
  const fallback = coerceText(summary.fallback_backend_provider).trim();
  const sourceId = coerceText(summary.source_id).trim();
  const latestGoalEvent = readAgentLoopAuditRecord(summary.latest_goal_binding_event);
  const sourceHash =
    coerceText(summary.source_hash).trim() ||
    coerceText(latestGoalEvent?.source_hash).trim();
  const sourceKind = coerceText(summary.source_kind).trim();
  const sourceTextHash =
    coerceText(summary.source_text_hash ?? summary.sourceTextHash).trim() ||
    coerceText(latestGoalEvent?.source_text_hash ?? latestGoalEvent?.sourceTextHash).trim();
  const sourceTextCharCount =
    coerceText(summary.source_text_char_count ?? summary.sourceTextCharCount).trim() ||
    coerceText(latestGoalEvent?.source_text_char_count ?? latestGoalEvent?.sourceTextCharCount).trim();
  const sourceProjectionTarget = coerceText(summary.source_projection_target).trim();
  const accountLocale = coerceText(summary.account_locale ?? summary.latest_account_locale).trim();
  const observationRef = coerceText(summary.last_observation_ref).trim();
  const latestEventId = coerceText(summary.latest_event_id).trim();
  const sessionEventCount = coerceText(summary.session_event_count).trim();
  const hasObservation = summary.has_observation === true;
  const latestMailLoop = readAgentLoopAuditRecord(summary.latest_mail_loop_summary);
  const mailLoopRef =
    coerceText(latestMailLoop?.stage_play_mail_id).trim() ||
    coerceText(latestMailLoop?.observation_ref).trim();
  const receiptRef = readCapabilityLaneReceiptRef(summary, latestMailLoop);
  const latestGoalEventName = coerceText(latestGoalEvent?.event).trim();
  const latestGoalEventReceiptRef = readCapabilityLaneReceiptRef(latestGoalEvent);
  const latestChunkId = coerceText(summary.latest_chunk_id).trim();
  const latestChunkIndex = coerceText(summary.latest_chunk_index).trim();
  const latestDedupeKey = coerceText(summary.latest_dedupe_key).trim();
  const latestSourceEventId = coerceText(summary.latest_source_event_id).trim();
  const latestSourceEventMs = coerceText(summary.latest_source_event_ms).trim();
  const latestObservedAtMs = coerceText(summary.latest_observed_at_ms).trim();
  const latestFreshness = coerceText(summary.latest_freshness_status).trim();
  const latestProjectionTarget = coerceText(summary.latest_projection_target).trim();
  const targetLanguage = coerceText(summary.target_language ?? summary.latest_target_language).trim();
  const latestCancelled = summary.latest_cancel_requested === true;
  const reportDecision = readAgentLoopAuditRecord(summary.report_decision);
  const reportAction = coerceText(reportDecision?.action).trim();
  const reportReason = coerceText(reportDecision?.reason).trim();
  const quietBehaviorApplied = readTranscriptBoolean(reportDecision?.quiet_behavior_applied);
  const wakeExpected = readTranscriptBoolean(reportDecision?.wake_expected);
  const surfaceBadgeExpected = readTranscriptBoolean(reportDecision?.surface_badge_expected);
  const terminalReportRequested = readTranscriptBoolean(reportDecision?.terminal_report_requested);
  const terminalReportAuthorized = readTranscriptBoolean(reportDecision?.terminal_report_authorized);
  const reportSummaryText =
    coerceText(summary.report_summary_text).trim() ||
    coerceText(reportDecision?.summary_text).trim();
  const dispatchPlan = readAgentLoopAuditRecord(summary.dispatch_plan);
  const dispatchTarget = coerceText(dispatchPlan?.target).trim();
  const dispatchStatus = coerceText(dispatchPlan?.status).trim();
  const decisionParts = summarizeHelixCapabilityLaneBackendDecision(summary.backend_selection_decision);
  const terminalAuthority = coerceText(summary.terminal_authority_status).trim();
  const permissionText =
    coerceText(summary.permission_profile ?? summary.session_permission_profile).trim() ||
    formatCapabilityLanePermissionText(summary.permissions);
  const parts = [
    goalId ? `goal ${goalId}` : "",
    sessionId ? `session ${sessionId}` : "",
    goalBindingKey ? `goal binding key ${goalBindingKey}` : "",
    sessionControlKey ? `session control key ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestObservationKey ? `observation key ${latestObservationKey}` : "",
    latestMailLoopObservationKey ? `mail observation key ${latestMailLoopObservationKey}` : "",
    bindingStatus ? `binding ${bindingStatus}` : "",
    lifecycleAction ? `action ${lifecycleAction}` : "",
    sessionStatus || sessionHealth ? `session state ${[sessionStatus, sessionHealth].filter(Boolean).join("/")}` : "",
    backend ? `backend ${backend}` : "",
    cost ? `cost ${cost}` : "",
    latency ? `latency ${latency}` : "",
    privacy ? `privacy ${privacy}` : "",
    fallback ? `fallback ${fallback}` : "",
    ...decisionParts,
    sourceId ? `source ${sourceId}` : "",
    sourceHash ? `source hash ${sourceHash}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
    accountLocale ? `account locale ${accountLocale}` : "",
    latestEventId ? `latest event id ${latestEventId}` : "",
    sessionEventCount ? `session events ${sessionEventCount}` : "",
    hasObservation ? "has observation true" : "",
    latestProjectionTarget ? `latest projection ${latestProjectionTarget}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    latestChunkId ? `latest chunk ${latestChunkId}` : "",
    latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
    latestDedupeKey ? `latest dedupe ${latestDedupeKey}` : "",
    latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
    latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
    latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
    latestFreshness ? `latest freshness ${latestFreshness}` : "",
    latestCancelled ? "latest cancelled" : "",
    observationRef ? `last observation ${observationRef}` : "",
    mailLoopRef ? `latest mail ${mailLoopRef}` : "",
    latestGoalEventName ? `latest event ${latestGoalEventName}` : "",
    receiptRef || latestGoalEventReceiptRef ? `receipt ${receiptRef || latestGoalEventReceiptRef}` : "",
    reportSummaryText ? `report summary ${reportSummaryText}` : "",
    reportAction ? `report action ${reportAction}` : "",
    reportReason ? `report reason ${reportReason}` : "",
    quietBehaviorApplied !== null ? `quiet behavior applied ${String(quietBehaviorApplied)}` : "",
    wakeExpected !== null ? `wake expected ${String(wakeExpected)}` : "",
    surfaceBadgeExpected !== null ? `surface badge expected ${String(surfaceBadgeExpected)}` : "",
    terminalReportRequested !== null ? `terminal report requested ${String(terminalReportRequested)}` : "",
    terminalReportAuthorized !== null ? `terminal report authorized ${String(terminalReportAuthorized)}` : "",
    dispatchTarget ? `dispatch target ${dispatchTarget}` : "",
    dispatchStatus ? `dispatch ${dispatchStatus}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    permissionText,
  ].filter(Boolean);
  const suffix = parts.length ? parts.join("; ") : "debug summary available";
  return `Goal-bound lane session: ${laneId}; ${suffix}; lane output remains observation-only.`;
}

function formatHelixCapabilityLaneGoalDispatchPlanText(plan: Record<string, unknown>): string {
  const laneId = coerceText(plan.lane_id).trim() || "capability_lane";
  const target = coerceText(plan.target).trim() || "none";
  const status = coerceText(plan.status).trim() || "planned_not_dispatched";
  const reason = coerceText(plan.reason).trim();
  const evidenceRef = coerceText(plan.evidence_ref).trim();
  const mailLoopRef = coerceText(plan.mail_loop_ref).trim();
  const receiptRef = coerceText(plan.receipt_ref).trim();
  const sourceId = coerceText(plan.source_id).trim();
  const sourceKind = coerceText(plan.source_kind).trim();
  const sourceTextHash = coerceText(plan.source_text_hash ?? plan.sourceTextHash).trim();
  const sourceTextCharCount = coerceText(plan.source_text_char_count ?? plan.sourceTextCharCount).trim();
  const sourceProjectionTarget = coerceText(plan.source_projection_target).trim();
  const accountLocale = coerceText(plan.account_locale).trim();
  const sessionControlKey = coerceText(plan.session_control_key).trim();
  const sourceBindingKey = coerceText(plan.source_binding_key).trim();
  const latestMailLoopObservationKey = coerceText(plan.latest_mail_loop_observation_key).trim();
  const latestEventId = coerceText(plan.latest_event_id).trim();
  const sessionEventCount = coerceText(plan.session_event_count).trim();
  const hasObservation = plan.has_observation === true;
  const latestChunkId = coerceText(plan.latest_chunk_id).trim();
  const latestChunkIndex = coerceText(plan.latest_chunk_index).trim();
  const latestDedupeKey = coerceText(plan.latest_dedupe_key).trim();
  const latestSourceEventId = coerceText(plan.latest_source_event_id).trim();
  const latestSourceEventMs = coerceText(plan.latest_source_event_ms).trim();
  const latestObservedAtMs = coerceText(plan.latest_observed_at_ms).trim();
  const latestFreshness = coerceText(plan.latest_freshness_status).trim();
  const latestProjectionTarget = coerceText(plan.latest_projection_target).trim();
  const targetLanguage = coerceText(plan.target_language).trim();
  const latestCancelled = plan.latest_cancel_requested === true;
  const terminalAuthority = coerceText(plan.terminal_authority_status).trim();
  const permissionText = formatCapabilityLanePermissionText(plan.permissions);
  const sideEffects = plan.side_effects_executed === true ? "side effects executed" : "no side effects executed";
  const parts = [
    `target ${target}`,
    `status ${status}`,
    reason ? `reason ${reason}` : "",
    sourceId ? `source ${sourceId}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
    accountLocale ? `account locale ${accountLocale}` : "",
    sessionControlKey ? `session control key ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestMailLoopObservationKey ? `mail observation key ${latestMailLoopObservationKey}` : "",
    latestEventId ? `latest event id ${latestEventId}` : "",
    sessionEventCount ? `session events ${sessionEventCount}` : "",
    hasObservation ? "has observation true" : "",
    latestProjectionTarget ? `latest projection ${latestProjectionTarget}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    latestChunkId ? `latest chunk ${latestChunkId}` : "",
    latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
    latestDedupeKey ? `latest dedupe ${latestDedupeKey}` : "",
    latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
    latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
    latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
    latestFreshness ? `latest freshness ${latestFreshness}` : "",
    latestCancelled ? "latest cancelled" : "",
    evidenceRef ? `evidence ${evidenceRef}` : "",
    mailLoopRef ? `mail ${mailLoopRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    permissionText,
    sideEffects,
  ].filter(Boolean);
  return `Goal dispatch plan: ${laneId}; ${parts.join("; ")}; lane output remains observation-only.`;
}

function formatHelixCapabilityLaneGoalDispatchAdmissionText(admission: Record<string, unknown>): string {
  const laneId = coerceText(admission.lane_id).trim() || "capability_lane";
  const target = coerceText(admission.target).trim() || "none";
  const status = coerceText(admission.status).trim() || "blocked";
  const reason = coerceText(admission.reason).trim();
  const blockedReason = coerceText(admission.blocked_reason).trim();
  const evidenceRef = coerceText(admission.evidence_ref).trim();
  const mailLoopRef = coerceText(admission.mail_loop_ref).trim();
  const receiptRef = coerceText(admission.receipt_ref).trim();
  const sourceId = coerceText(admission.source_id).trim();
  const sourceKind = coerceText(admission.source_kind).trim();
  const sourceTextHash = coerceText(admission.source_text_hash ?? admission.sourceTextHash).trim();
  const sourceTextCharCount = coerceText(admission.source_text_char_count ?? admission.sourceTextCharCount).trim();
  const sourceProjectionTarget = coerceText(admission.source_projection_target).trim();
  const accountLocale = coerceText(admission.account_locale).trim();
  const sessionControlKey = coerceText(admission.session_control_key).trim();
  const sourceBindingKey = coerceText(admission.source_binding_key).trim();
  const latestMailLoopObservationKey = coerceText(admission.latest_mail_loop_observation_key).trim();
  const latestEventId = coerceText(admission.latest_event_id).trim();
  const sessionEventCount = coerceText(admission.session_event_count).trim();
  const hasObservation = admission.has_observation === true;
  const latestChunkId = coerceText(admission.latest_chunk_id).trim();
  const latestChunkIndex = coerceText(admission.latest_chunk_index).trim();
  const latestDedupeKey = coerceText(admission.latest_dedupe_key).trim();
  const latestSourceEventId = coerceText(admission.latest_source_event_id).trim();
  const latestSourceEventMs = coerceText(admission.latest_source_event_ms).trim();
  const latestObservedAtMs = coerceText(admission.latest_observed_at_ms).trim();
  const latestFreshness = coerceText(admission.latest_freshness_status).trim();
  const latestProjectionTarget = coerceText(admission.latest_projection_target).trim();
  const targetLanguage = coerceText(admission.target_language).trim();
  const latestCancelled = admission.latest_cancel_requested === true;
  const terminalAuthority = coerceText(admission.terminal_authority_status).trim();
  const permissionText = formatCapabilityLanePermissionText(admission.permissions);
  const parts = [
    `target ${target}`,
    `status ${status}`,
    reason ? `reason ${reason}` : "",
    blockedReason ? `blocked ${blockedReason}` : "",
    sourceId ? `source ${sourceId}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
    accountLocale ? `account locale ${accountLocale}` : "",
    sessionControlKey ? `session control key ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestMailLoopObservationKey ? `mail observation key ${latestMailLoopObservationKey}` : "",
    latestEventId ? `latest event id ${latestEventId}` : "",
    sessionEventCount ? `session events ${sessionEventCount}` : "",
    hasObservation ? "has observation true" : "",
    latestProjectionTarget ? `latest projection ${latestProjectionTarget}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    latestChunkId ? `latest chunk ${latestChunkId}` : "",
    latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
    latestDedupeKey ? `latest dedupe ${latestDedupeKey}` : "",
    latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
    latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
    latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
    latestFreshness ? `latest freshness ${latestFreshness}` : "",
    latestCancelled ? "latest cancelled" : "",
    evidenceRef ? `evidence ${evidenceRef}` : "",
    mailLoopRef ? `mail ${mailLoopRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    permissionText,
    "side effects not allowed",
  ].filter(Boolean);
  return `Goal dispatch admission: ${laneId}; ${parts.join("; ")}; lane output remains observation-only.`;
}

function formatHelixCapabilityLaneGoalDispatchReadinessText(readiness: Record<string, unknown>): string {
  const totalPlans = coerceText(readiness.total_plans).trim() || "0";
  const totalAdmissions = coerceText(readiness.total_admissions).trim() || "0";
  const admittedCount = coerceText(readiness.admitted_count).trim() || "0";
  const blockedCount = coerceText(readiness.blocked_count).trim() || "0";
  const readinessState = readHelixCapabilityLaneGoalDispatchReadinessState(readiness);
  const pendingWakeCount = coerceText(readiness.pending_wake_count).trim() || "0";
  const pendingTerminalCount = coerceText(readiness.pending_terminal_authority_count).trim() || "0";
  const liveMailLoopRequiredCount = coerceText(readiness.live_mail_loop_required_count).trim() || "0";
  const terminalAuthorityRequiredCount = coerceText(readiness.terminal_authority_required_count).trim() || "0";
  const projectionOnlyCount = coerceText(readiness.projection_only_count).trim() || "0";
  const manualReviewCount = coerceText(readiness.manual_review_count).trim() || "0";
  const debugOnlyCount = coerceText(readiness.debug_only_count).trim() || "0";
  const blockedReasons = Array.isArray(readiness.blocked_reasons)
    ? readiness.blocked_reasons.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextLanes = Array.isArray(readiness.next_lane_ids)
    ? readiness.next_lane_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSessions = Array.isArray(readiness.next_lane_session_ids)
    ? readiness.next_lane_session_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSessionControlKeys = Array.isArray(readiness.next_session_control_keys)
    ? readiness.next_session_control_keys.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceBindingKeys = Array.isArray(readiness.next_source_binding_keys)
    ? readiness.next_source_binding_keys.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceIdentityKeys = Array.isArray(readiness.next_source_identity_keys)
    ? readiness.next_source_identity_keys.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextMailLoopObservationKeys = Array.isArray(readiness.next_mail_loop_observation_keys)
    ? readiness.next_mail_loop_observation_keys.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextTargets = Array.isArray(readiness.next_dispatch_targets)
    ? readiness.next_dispatch_targets.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextBindings = Array.isArray(readiness.next_goal_binding_ids)
    ? readiness.next_goal_binding_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSources = Array.isArray(readiness.next_source_ids)
    ? readiness.next_source_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceHashes = Array.isArray(readiness.next_source_hashes)
    ? readiness.next_source_hashes.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceKinds = Array.isArray(readiness.next_source_kinds)
    ? readiness.next_source_kinds.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceProjectionTargets = Array.isArray(readiness.next_source_projection_targets)
    ? readiness.next_source_projection_targets.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextAccountLocales = Array.isArray(readiness.next_account_locales)
    ? readiness.next_account_locales.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextLatestEventIds = Array.isArray(readiness.next_latest_event_ids)
    ? readiness.next_latest_event_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSessionEventCounts = Array.isArray(readiness.next_session_event_counts)
    ? readiness.next_session_event_counts.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextHasObservation = readiness.next_has_observation === true;
  const allNextHaveObservation = readiness.all_next_have_observation === true;
  const nextChunks = Array.isArray(readiness.next_chunk_ids)
    ? readiness.next_chunk_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextDedupeKeys = Array.isArray(readiness.next_dedupe_keys)
    ? readiness.next_dedupe_keys.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextSourceEvents = Array.isArray(readiness.next_source_event_ids)
    ? readiness.next_source_event_ids.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextProjectionTargets = Array.isArray(readiness.next_projection_targets)
    ? readiness.next_projection_targets.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextTargetLanguages = Array.isArray(readiness.next_target_languages)
    ? readiness.next_target_languages.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextFreshnessStatuses = Array.isArray(readiness.next_freshness_statuses)
    ? readiness.next_freshness_statuses.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextWakeKinds = Array.isArray(readiness.next_mail_loop_wake_kinds)
    ? readiness.next_mail_loop_wake_kinds.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextCancelled = readiness.next_cancel_requested === true;
  const nextEvidence = Array.isArray(readiness.next_evidence_refs)
    ? readiness.next_evidence_refs.map(coerceText).filter(Boolean).join(", ")
    : "";
  const nextReceipts = Array.isArray(readiness.next_receipt_refs)
    ? readiness.next_receipt_refs.map(coerceText).filter(Boolean).join(", ")
    : "";
  const admittedPermissionsNonMutating = readiness.all_admitted_permissions_non_mutating === true;
  const anyLiveMailLoopRequired = readiness.any_live_mail_loop_required === true;
  const anyTerminalAuthorityRequired = readiness.any_terminal_authority_required === true;
  const parts = [
    `readiness ${readinessState}`,
    `plans ${totalPlans}`,
    `admissions ${totalAdmissions}`,
    `admitted ${admittedCount}`,
    `blocked ${blockedCount}`,
    pendingWakeCount !== "0" ? `pending wake ${pendingWakeCount}` : "",
    pendingTerminalCount !== "0" ? `pending terminal authority ${pendingTerminalCount}` : "",
    liveMailLoopRequiredCount !== "0" ? `live mail loop required ${liveMailLoopRequiredCount}` : "",
    terminalAuthorityRequiredCount !== "0" ? `terminal authority required ${terminalAuthorityRequiredCount}` : "",
    anyLiveMailLoopRequired ? "any live mail loop required true" : "",
    anyTerminalAuthorityRequired ? "any terminal authority required true" : "",
    projectionOnlyCount !== "0" ? `projection only ${projectionOnlyCount}` : "",
    manualReviewCount !== "0" ? `manual review ${manualReviewCount}` : "",
    debugOnlyCount !== "0" ? `debug only ${debugOnlyCount}` : "",
    nextLanes ? `next lanes ${nextLanes}` : "",
    nextSessions ? `next sessions ${nextSessions}` : "",
    nextSessionControlKeys ? `next session controls ${nextSessionControlKeys}` : "",
    nextSourceBindingKeys ? `next source bindings ${nextSourceBindingKeys}` : "",
    nextSourceIdentityKeys ? `next source identities ${nextSourceIdentityKeys}` : "",
    nextMailLoopObservationKeys ? `next mail observations ${nextMailLoopObservationKeys}` : "",
    nextTargets ? `next targets ${nextTargets}` : "",
    nextBindings ? `next goal bindings ${nextBindings}` : "",
    nextSources ? `next sources ${nextSources}` : "",
    nextSourceHashes ? `next source hashes ${nextSourceHashes}` : "",
    nextSourceKinds ? `next source kinds ${nextSourceKinds}` : "",
    nextSourceProjectionTargets ? `next source projections ${nextSourceProjectionTargets}` : "",
    nextAccountLocales ? `next account locales ${nextAccountLocales}` : "",
    nextLatestEventIds ? `next latest events ${nextLatestEventIds}` : "",
    nextSessionEventCounts ? `next session event counts ${nextSessionEventCounts}` : "",
    nextHasObservation ? "next has observation true" : "",
    allNextHaveObservation ? "all next have observation true" : "",
    nextProjectionTargets ? `next projections ${nextProjectionTargets}` : "",
    nextTargetLanguages ? `next target languages ${nextTargetLanguages}` : "",
    nextWakeKinds ? `next wake kinds ${nextWakeKinds}` : "",
    nextChunks ? `next chunks ${nextChunks}` : "",
    nextDedupeKeys ? `next dedupe ${nextDedupeKeys}` : "",
    nextSourceEvents ? `next source events ${nextSourceEvents}` : "",
    nextFreshnessStatuses ? `next freshness ${nextFreshnessStatuses}` : "",
    nextCancelled ? "next cancelled" : "",
    nextEvidence ? `next evidence ${nextEvidence}` : "",
    nextReceipts ? `next receipts ${nextReceipts}` : "",
    blockedReasons ? `blocked reasons ${blockedReasons}` : "",
    admittedPermissionsNonMutating ? "all admitted permissions non-mutating" : "",
    "no side effects allowed",
  ].filter(Boolean);
  return `Goal dispatch readiness: ${parts.join("; ")}; lane output remains observation-only.`;
}

function readHelixCapabilityLaneGoalDispatchReadinessState(readiness: Record<string, unknown>): "ready" | "partial" | "blocked" {
  const admittedNumber = Number(coerceText(readiness.admitted_count).trim() || "0");
  const blockedNumber = Number(coerceText(readiness.blocked_count).trim() || "0");
  if (Number.isFinite(admittedNumber) && Number.isFinite(blockedNumber) && admittedNumber > 0 && blockedNumber > 0) {
    return "partial";
  }
  if (Number.isFinite(blockedNumber) && blockedNumber > 0) return "blocked";
  return "ready";
}

function formatHelixCapabilityLaneSessionSummaryText(summary: Record<string, unknown>): string {
  const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
  const sessionId = coerceText(summary.lane_session_id).trim();
  const lifecycleAction = coerceText(
    summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action,
  ).trim();
  const sessionStatus = coerceText(summary.session_status).trim();
  const sessionHealth = coerceText(summary.session_health).trim();
  const backend = coerceText(summary.selected_backend_provider).trim();
  const cost = coerceText(summary.cost_class).trim();
  const latency = coerceText(summary.latency_class).trim();
  const privacy = coerceText(summary.privacy_class).trim();
  const fallback = coerceText(summary.fallback_backend_provider).trim();
  const sourceId = coerceText(summary.source_id).trim();
  const sourceKind = coerceText(summary.source_kind).trim();
  const projectionTarget = coerceText(summary.projection_target).trim();
  const accountLocale = coerceText(summary.account_locale ?? summary.latest_account_locale).trim();
  const targetLanguage = coerceText(summary.target_language ?? summary.latest_target_language).trim();
  const observationRef = coerceText(summary.last_observation_ref).trim();
  const receiptRef = coerceText(summary.latest_receipt_ref ?? summary.last_receipt_ref).trim();
  const latestChunkId = coerceText(summary.latest_chunk_id).trim();
  const latestChunkIndex = coerceText(summary.latest_chunk_index).trim();
  const latestDedupeKey = coerceText(summary.latest_dedupe_key).trim();
  const latestSourceEventId = coerceText(summary.latest_source_event_id).trim();
  const latestSourceEventMs = coerceText(summary.latest_source_event_ms).trim();
  const latestObservedAtMs = coerceText(summary.latest_observed_at_ms).trim();
  const latestFreshness = coerceText(summary.latest_freshness_status).trim();
  const latestProjectionTarget = coerceText(summary.latest_projection_target).trim();
  const latestCancelled = summary.latest_cancel_requested === true;
  const terminalAuthority = coerceText(summary.terminal_authority_status).trim();
  const eventCount = coerceText(summary.session_event_count).trim();
  const latestEventId = coerceText(summary.latest_event_id).trim();
  const sourceBindingKey = coerceText(summary.source_binding_key).trim();
  const latestObservationKey = coerceText(summary.latest_observation_key).trim();
  const hasObservation = summary.has_observation === true;
  const permissionText = formatCapabilityLanePermissionText(summary.permissions);
  const decisionParts = summarizeHelixCapabilityLaneBackendDecision(summary.backend_selection_decision);
  const parts = [
    sessionId ? `session ${sessionId}` : "",
    lifecycleAction ? `action ${lifecycleAction}` : "",
    sessionStatus || sessionHealth ? `state ${[sessionStatus, sessionHealth].filter(Boolean).join("/")}` : "",
    backend ? `backend ${backend}` : "",
    cost ? `cost ${cost}` : "",
    latency ? `latency ${latency}` : "",
    privacy ? `privacy ${privacy}` : "",
    fallback ? `fallback ${fallback}` : "",
    ...decisionParts,
    sourceId ? `source ${sourceId}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    projectionTarget ? `projection ${projectionTarget}` : "",
    accountLocale ? `locale ${accountLocale}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    latestProjectionTarget && latestProjectionTarget !== projectionTarget ? `latest projection ${latestProjectionTarget}` : "",
    latestChunkId ? `latest chunk ${latestChunkId}` : "",
    latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
    latestDedupeKey ? `latest dedupe ${latestDedupeKey}` : "",
    latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
    latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
    latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
    latestFreshness ? `latest freshness ${latestFreshness}` : "",
    latestCancelled ? "latest cancelled" : "",
    latestEventId ? `latest event ${latestEventId}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    latestObservationKey ? `observation key ${latestObservationKey}` : "",
    `has observation ${hasObservation ? "true" : "false"}`,
    observationRef ? `last observation ${observationRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    permissionText,
    eventCount ? `events ${eventCount}` : "",
  ].filter(Boolean);
  const suffix = parts.length ? parts.join("; ") : "debug summary available";
  return `Lane session: ${laneId}; ${suffix}; lane output remains observation-only.`;
}

function formatHelixCapabilityLaneSessionResultText(result: Record<string, unknown>): string {
  const laneId = coerceText(result.lane_id).trim() || "capability_lane";
  const action = coerceText(result.action).trim() || "session";
  const sessionId = coerceText(result.lane_session_id).trim();
  const supported = coerceText(result.session_supported).trim();
  const blocked = coerceText(result.blocked_reason).trim();
  const sourceId = coerceText(result.source_id).trim();
  const sourceBindingKey = coerceText(result.source_binding_key).trim();
  const sourceIdentityKey = coerceText(result.source_identity_key).trim();
  const sourceTextHash = coerceText(result.source_text_hash).trim();
  const sourceTextCharCount = coerceText(result.source_text_char_count).trim();
  const accountLocale = coerceText(result.account_locale).trim();
  const targetLanguage = coerceText(result.target_language).trim();
  const parts = [
    laneId,
    `action ${action}`,
    sessionId ? `session ${sessionId}` : "",
    supported ? `session supported ${supported}` : "",
    blocked ? `blocked ${blocked}` : "",
    sourceId ? `source ${sourceId}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    sourceIdentityKey ? `source identity key ${sourceIdentityKey}` : "",
    sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
    sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
    accountLocale ? `locale ${accountLocale}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
  ].filter(Boolean);
  return `Lane session control: ${parts.join("; ")}; control result is observation-only.`;
}

function formatHelixCapabilityLaneMailLoopSummaryText(summary: Record<string, unknown>): string {
  const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
  const sessionId = coerceText(summary.lane_session_id).trim();
  const mailId = coerceText(summary.stage_play_mail_id).trim();
  const mailDeliveryStatus = coerceText(summary.stage_play_mail_delivery_status).trim();
  const previousMailId = coerceText(summary.previous_stage_play_mail_id).trim();
  const observationRef = coerceText(summary.observation_ref).trim();
  const observationLaneSessionId = coerceText(summary.observation_lane_session_id).trim();
  const receiptRef = coerceText(summary.receipt_ref).trim();
  const sourceId = coerceText(summary.source_id).trim();
  const sourceKind = coerceText(summary.source_kind).trim();
  const accountLocale = coerceText(summary.account_locale ?? summary.latest_account_locale).trim();
  const chunkId = coerceText(summary.chunk_id).trim();
  const chunkIndex = coerceText(summary.chunk_index).trim();
  const dedupeKey = coerceText(summary.dedupe_key).trim();
  const sourceEventId = coerceText(summary.source_event_id).trim();
  const sourceEventMs = coerceText(summary.source_event_ms).trim();
  const observedAtMs = coerceText(summary.observed_at_ms).trim();
  const projectionTarget = coerceText(summary.projection_target).trim();
  const targetLanguage = coerceText(summary.target_language ?? summary.latest_target_language).trim();
  const backend = coerceText(summary.selected_backend_provider).trim();
  const requestedBackend = coerceText(summary.requested_backend_provider).trim();
  const cost = coerceText(summary.cost_class).trim();
  const latency = coerceText(summary.latency_class).trim();
  const privacy = coerceText(summary.privacy_class).trim();
  const fallback = coerceText(summary.fallback_backend_provider).trim();
  const freshness = coerceText(summary.freshness_status).trim();
  const blockedReason = coerceText(summary.blocked_reason).trim();
  const terminalAuthority = coerceText(summary.terminal_authority_status).trim();
  const decisionParts = summarizeHelixCapabilityLaneBackendDecision(summary.backend_selection_decision);
  const materializedMailLoopEvidence = summary.materialized_mail_loop_evidence === true;
  const wakeExpected = summary.stage_play_wake_expected === true ? "wake expected" : "wake not expected";
  const wakeKind = coerceText(summary.stage_play_wake_kind).trim();
  const mailboxWakeExpected =
    summary.mailbox_wake_expected === true ||
    wakeKind === "mailbox_wake" ||
    summary.stage_play_wake_expected === true;
  const decisionWakeExpected = summary.decision_wake_expected === true;
  const sessionControlKey = coerceText(summary.lane_session_control_key).trim();
  const sourceBindingKey = coerceText(summary.lane_session_source_binding_key).trim();
  const sourceIdentityKey = coerceText(summary.source_identity_key ?? summary.sourceIdentityKey).trim();
  const latestSourceIdentityKey =
    coerceText(summary.latest_source_identity_key ?? summary.latestSourceIdentityKey).trim();
  const mailLoopObservationKey = coerceText(summary.mail_loop_observation_key).trim();
  const cancelled = summary.cancel_requested === true;
  const parts = [
    sessionId ? `session ${sessionId}` : "",
    mailId ? `mail ${mailId}` : "",
    `materialized mail evidence ${materializedMailLoopEvidence ? "true" : "false"}`,
    mailDeliveryStatus ? `mail delivery ${mailDeliveryStatus}` : "",
    previousMailId ? `previous mail ${previousMailId}` : "",
    wakeExpected,
    `mailbox wake expected ${mailboxWakeExpected ? "true" : "false"}`,
    `decision wake expected ${decisionWakeExpected ? "true" : "false"}`,
    wakeKind ? `wake kind ${wakeKind}` : "",
    sessionControlKey ? `session control key ${sessionControlKey}` : "",
    sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
    sourceIdentityKey ? `source identity key ${sourceIdentityKey}` : "",
    latestSourceIdentityKey ? `latest source identity key ${latestSourceIdentityKey}` : "",
    mailLoopObservationKey ? `mail observation key ${mailLoopObservationKey}` : "",
    observationLaneSessionId ? `observation session ${observationLaneSessionId}` : "",
    observationRef ? `observation ${observationRef}` : "",
    receiptRef ? `receipt ${receiptRef}` : "",
    sourceId ? `source ${sourceId}` : "",
    sourceKind ? `source kind ${sourceKind}` : "",
    accountLocale ? `account locale ${accountLocale}` : "",
    chunkId ? `chunk ${chunkId}` : "",
    chunkIndex ? `index ${chunkIndex}` : "",
    dedupeKey ? `dedupe ${dedupeKey}` : "",
    sourceEventId ? `source event id ${sourceEventId}` : "",
    sourceEventMs ? `source event ms ${sourceEventMs}` : "",
    observedAtMs ? `observed ${observedAtMs}` : "",
    cancelled ? "cancelled" : "",
    projectionTarget ? `projection ${projectionTarget}` : "",
    targetLanguage ? `target ${targetLanguage}` : "",
    backend ? `backend ${backend}` : "",
    requestedBackend ? `requested backend ${requestedBackend}` : "",
    cost ? `cost ${cost}` : "",
    latency ? `latency ${latency}` : "",
    privacy ? `privacy ${privacy}` : "",
    fallback ? `fallback ${fallback}` : "",
    ...decisionParts,
    freshness ? `freshness ${freshness}` : "",
    blockedReason ? `blocked ${blockedReason}` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
  ].filter(Boolean);
  const suffix = parts.length ? parts.join("; ") : "debug summary available";
  return `Lane mail loop: ${laneId}; ${suffix}; mail is evidence-only.`;
}

function readHelixGatewayCapabilityId(record: Record<string, unknown>): string {
  const admission = readAgentLoopAuditRecord(record.gateway_admission);
  return (
    coerceText(record.capability_id).trim() ||
    coerceText(record.capabilityId).trim() ||
    coerceText(record.capability_key).trim() ||
    coerceText(record.capabilityKey).trim() ||
    coerceText(admission?.requested_capability).trim()
  );
}

function readHelixGatewayObservationPacketForCall(
  call: Record<string, unknown>,
  packets: Record<string, unknown>[],
): Record<string, unknown> | null {
  const directPacket = readAgentLoopAuditRecord(call.observation_packet);
  if (directPacket) return directPacket;
  const capability = readHelixGatewayCapabilityId(call);
  const callId = coerceText(call.call_id ?? call.callId).trim();
  return packets.find((packet) => {
    const packetCapability =
      coerceText(packet.capability_key).trim() ||
      coerceText(packet.capability_id).trim() ||
      coerceText(packet.capabilityId).trim();
    const packetCallId = coerceText(packet.call_id ?? packet.callId).trim();
    return Boolean(
      (capability && packetCapability === capability) ||
        (callId && packetCallId === callId),
    );
  }) ?? null;
}

function readNestedGatewayValue(value: unknown, keys: string[]): string {
  const visit = (entry: unknown, depth: number): string => {
    if (depth > 4) return "";
    const text = coerceText(entry).trim();
    if (text && typeof entry !== "object") return "";
    const record = readAgentLoopAuditRecord(entry);
    if (!record) return "";
    for (const key of keys) {
      const candidate = coerceText(record[key]).trim();
      if (candidate) return candidate;
    }
    for (const nestedKey of ["observation", "result", "output", "payload", "raw", "args", "arguments"]) {
      const candidate = visit(record[nestedKey], depth + 1);
      if (candidate) return candidate;
    }
    return "";
  };
  return visit(value, 0);
}

function formatHelixGatewayObservationText(args: {
  capabilityId: string;
  call: Record<string, unknown>;
  packet: Record<string, unknown> | null;
  ok: boolean;
  isAction?: boolean;
}): string {
  const explicitText =
    coerceText(args.call.text).trim() ||
    coerceText(args.call.observation_text).trim() ||
    coerceText(args.call.observationText).trim();
  if (/^(?:Tool|Action) observation:/i.test(explicitText)) return explicitText;

  const expression = readNestedGatewayValue(args.call, [
    "expression",
    "normalized_expression",
    "expression_text",
    "latex",
  ]);
  const result = readNestedGatewayValue(args.call, ["result", "answer", "value"]);
  if (args.capabilityId === "scientific-calculator.solve_expression" && expression && result) {
    return `Tool observation: ${args.capabilityId} observed ${expression} = ${result}.`;
  }

  const summary =
    coerceText(args.packet?.observation_summary).trim() ||
    coerceText(args.call.observation_summary).trim() ||
    coerceText(args.call.summary).trim() ||
    coerceText(args.call.error).trim();
  if (summary) {
    const cleanSummary = summary.replace(/\.$/, "");
    const prefix = args.isAction ? "Action observation" : "Tool observation";
    return `${prefix}: ${args.capabilityId} ${args.ok ? "observed" : "blocked"} ${cleanSummary}.`;
  }
  const prefix = args.isAction ? "Action observation" : "Tool observation";
  return args.ok
    ? `${prefix}: ${args.capabilityId} produced a workstation observation packet.`
    : `${prefix}: ${args.capabilityId} did not produce a successful workstation observation packet.`;
}

function isHelixGatewayActionCapability(capabilityId: string, call: Record<string, unknown>): boolean {
  const mode = coerceText(call.mode).trim().toLowerCase();
  if (mode === "act") return true;
  return /\.(?:open_panel|show_gateway_solve|show|focus|open_doc)$/i.test(capabilityId);
}

function hasSucceededHelixGatewayPacket(packet: Record<string, unknown> | null, call: Record<string, unknown>): boolean {
  if (call.ok !== true) return false;
  const status = coerceText(packet?.status).trim().toLowerCase();
  return status !== "blocked" && status !== "failed" && status !== "missing_input" && status !== "needs_confirmation";
}

function readHelixCompoundDependencyTurnPlan(
  call: Record<string, unknown>,
  packet: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const observation = readAgentLoopAuditRecord(call.observation);
  const stateDelta = readAgentLoopAuditRecord(packet?.state_delta);
  return readAgentLoopAuditRecord(observation?.compound_dependency_turn_plan) ??
    readAgentLoopAuditRecord(stateDelta?.compound_dependency_turn_plan);
}

function formatHelixCompoundDependencyTurnPlan(plan: Record<string, unknown>): string {
  const outcomes = Array.isArray(plan.compound_outcomes)
    ? plan.compound_outcomes.map((entry) => coerceText(entry).trim()).filter(Boolean)
    : [];
  const label = outcomes.length > 0 ? outcomes.join(", ") : "compound capability";
  const subgoals = readAgentLoopAuditArray(plan.ordered_subgoals)
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const satisfiedCount =
    typeof plan.satisfied_subgoal_count === "number" && Number.isFinite(plan.satisfied_subgoal_count)
      ? Math.trunc(plan.satisfied_subgoal_count)
      : subgoals.filter((subgoal) => subgoal.satisfied === true).length;
  const subgoalCount =
    typeof plan.subgoal_count === "number" && Number.isFinite(plan.subgoal_count)
      ? Math.trunc(plan.subgoal_count)
      : subgoals.length;
  const firstBroken = readAgentLoopAuditRecord(plan.first_broken_rail);
  const railStatus = coerceText(plan.rail_status).trim() || (firstBroken ? "blocked" : "satisfied");
  if (firstBroken) {
    const subgoalId = coerceText(firstBroken.subgoal_id).trim() || "unknown subgoal";
    const capability =
      coerceText(firstBroken.requested_capability).trim() ||
      coerceText(firstBroken.selected_capability).trim() ||
      coerceText(firstBroken.executed_capability).trim() ||
      "unknown capability";
    const reason = coerceText(firstBroken.reason ?? firstBroken.error ?? firstBroken.rail_status).trim();
    return `Compound itinerary: ${label} ${railStatus} at ${subgoalId} (${capability})${reason ? `: ${reason}` : ""}.`;
  }
  return `Compound itinerary: ${label} ${railStatus} with ${satisfiedCount}/${subgoalCount} subgoals satisfied.`;
}

export function buildHelixWorkstationGatewayTranscriptEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const calls = readHelixWorkstationGatewayCallResults(reply);
  if (calls.length === 0) return [];
  const packets = readHelixWorkstationGatewayObservationPackets(reply);
  const turnId = coerceText(reply.turn_id ?? reply.debug?.turn_id ?? reply.id).trim();
  const events: Record<string, unknown>[] = [];
  let successfulPacketPresent = false;
  const compoundPlanEvents = new Map<string, Record<string, unknown>>();
  calls.slice(0, 10).forEach((call, index) => {
    const capabilityId = readHelixGatewayCapabilityId(call);
    if (!capabilityId) return;
    const packet = readHelixGatewayObservationPacketForCall(call, packets);
    const ok = hasSucceededHelixGatewayPacket(packet, call);
    successfulPacketPresent = successfulPacketPresent || ok;
    const stepId = `workstation_gateway_${index + 1}`;
    const isAction = isHelixGatewayActionCapability(capabilityId, call);
    events.push({
      id: `${reply.id}-workstation-gateway-${index}-request`,
      role: "agent",
      type: "model_decision",
      status: "completed",
      text: `${isAction ? "Action" : "Tool"} request: ${capabilityId}.`,
      detail: capabilityId,
      lane: "workstation_gateway",
      step_id: stepId,
      turn_id: turnId,
      capability_id: capabilityId,
      event_source: "workstation_gateway_call_results",
      source_event_type: isAction ? "action_request" : "tool_request",
    });
    events.push({
      id: `${reply.id}-workstation-gateway-${index}-observation`,
      role: "tool",
      type: "tool_result",
      status: ok ? "completed" : "failed",
      text: formatHelixGatewayObservationText({ capabilityId, call, packet, ok, isAction }),
      detail: coerceText(packet?.observation_summary).trim() || coerceText(call.error).trim() || capabilityId,
      lane: capabilityId,
      step_id: stepId,
      turn_id: turnId,
      capability_id: capabilityId,
      event_source: "workstation_gateway_call_results",
      source_event_type: isAction ? "action_observation" : "tool_observation",
    });
    const compoundPlan = readHelixCompoundDependencyTurnPlan(call, packet);
    if (compoundPlan) {
      const planKey =
        coerceText(compoundPlan.turn_id).trim() ||
        JSON.stringify(compoundPlan.compound_outcomes ?? compoundPlan.ordered_subgoals ?? index);
      if (!compoundPlanEvents.has(planKey)) {
        compoundPlanEvents.set(planKey, {
          id: `${reply.id}-workstation-gateway-compound-itinerary-${compoundPlanEvents.size}`,
          role: "agent",
          type: "decision",
          status: coerceText(compoundPlan.rail_status).trim() === "blocked" ? "blocked" : "completed",
          text: formatHelixCompoundDependencyTurnPlan(compoundPlan),
          detail: "compound_dependency_turn_plan",
          lane: "helix_compound_capability_dependency_planner",
          step_id: "compound_itinerary",
          turn_id: turnId,
          event_source: "workstation_gateway_call_results",
          source_event_type: "compound_itinerary",
        });
      }
    }
  });
  events.push(...compoundPlanEvents.values());
  if (successfulPacketPresent) {
    events.push({
      id: `${reply.id}-workstation-gateway-model-reentry`,
      role: "agent",
      type: "model_decision",
      status: "completed",
      text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
      detail: "workstation_gateway_observation_packets",
      lane: "codex_provider",
      step_id: "model_reentry",
      turn_id: turnId,
      event_source: "workstation_gateway_call_results",
      source_event_type: "model_reentry",
    });
  }
  return events;
}

export function buildHelixCapabilityLaneTranscriptEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const calls = readHelixCapabilityLaneCallResults(reply);
  const debugEvents = readHelixCapabilityLaneDebugEvents(reply);
  const turnTimeline = readHelixCapabilityLaneTurnTimeline(reply);
  const consoleStateRows = readHelixCapabilityLaneConsoleStateRows(reply);
  const sessionSummaries = readHelixCapabilityLaneSessionDebugSummaries(reply);
  const sessionResults = readHelixCapabilityLaneSessionResults(reply);
  const mailLoopSummaries = readHelixCapabilityLaneMailLoopDebugSummaries(reply);
  const goalBindingSummaries = readHelixCapabilityLaneGoalBindingDebugSummaries(reply);
  const goalDispatchPlans = readHelixCapabilityLaneGoalDispatchPlans(reply);
  const goalDispatchAdmissions = readHelixCapabilityLaneGoalDispatchAdmissions(reply);
  const goalDispatchReadiness = readHelixCapabilityLaneGoalDispatchReadiness(reply);
  const projectionReceipts = readHelixCapabilityLaneProjectionReceipts(reply);
  const uiTranslationProjections = buildHelixLiveTranslationUiProjections(reply);
  const terminalKind = readHelixCapabilityLaneTerminalKind(reply);
  const terminalRejection = terminalKind ? "" : readHelixCapabilityLaneTerminalRejection(reply);
  const turnId = coerceText(reply.turn_id ?? reply.debug?.turn_id ?? reply.id).trim();
  const visibleTranslationCollectorChain = readHelixVisibleTranslationCollectorChain(reply);
  const visibleTranslationChainSummary = readHelixVisibleTranslationChainSummary(reply);
  const visibleTranslationCollectorEvents = visibleTranslationCollectorChain
    ? [
        buildHelixVisibleTranslationCollectorTranscriptEvent({
          replyId: reply.id,
          turnId,
          chain: visibleTranslationCollectorChain,
        }),
      ]
    : [];
  const visibleTranslationChainSummaryEvents = visibleTranslationChainSummary
    ? [
        buildHelixVisibleTranslationChainSummaryTranscriptEvent({
          replyId: reply.id,
          turnId,
          summary: visibleTranslationChainSummary,
        }),
      ]
    : [];
  const visibleLaneEvents = readHelixCapabilityLaneVisibleLanes(reply).slice(0, 10).map((lane, index) => {
    const laneId = coerceText(lane.lane_id).trim() || "capability_lane";
    const status = coerceText(lane.status).trim();
    const defaultBackend = coerceText(lane.default_backend_provider).trim();
    const firstCapability = readAgentLoopAuditArray(lane.capabilities)
      .map((entry) => readAgentLoopAuditRecord(entry))
      .map((capability) => coerceText(capability?.capability_id).trim())
      .find(Boolean);
    return {
      id: `${reply.id}-capability-lane-visible-${laneId}-${index}`,
      role: "system",
      type: "observation",
      status: status === "permission_blocked" || status === "unconfigured" ? "failed" : "completed",
      text: formatHelixCapabilityLaneVisibleText(lane),
      detail: firstCapability || laneId,
      lane: laneId,
      step_id: "lane_visible",
      turn_id: turnId,
      capability_id: firstCapability || laneId,
      selected_backend_provider: defaultBackend || null,
      terminal_eligible: lane.terminal_eligible === true,
      assistant_answer: lane.assistant_answer === true,
      raw_content_included: lane.raw_content_included === true,
      event_source: "model_visible_capability_lane_manifest",
      source_event_type: "lane_visible",
    };
  });
  const consoleStateEvents = consoleStateRows.slice(0, 80).map((row, index) =>
    buildHelixCapabilityLaneConsoleStateTranscriptEvent({
      replyId: reply.id,
      turnId,
      row,
      index,
    }),
  );
  const projectionReceiptEvents = projectionReceipts.slice(0, 10).map((receipt, index) => {
    const laneId = coerceText(receipt.lane_id).trim() || "capability_lane";
    const payload = readAgentLoopAuditRecord(receipt.payload);
    const capabilityId =
      coerceText(receipt.capability).trim() ||
      coerceText(receipt.capability_key).trim() ||
      laneId;
    const status = coerceText(receipt.status).trim();
    const projectionKey =
      coerceText(receipt.projection_key).trim() ||
      coerceText(receipt.projectionKey).trim() ||
      coerceText(payload?.projection_key).trim() ||
      coerceText(payload?.projectionKey).trim();
    return {
      id: coerceText(receipt.receipt_ref).trim() || `${reply.id}-capability-lane-projection-receipt-${index}`,
      role: "tool",
      type: "observation",
      status: status === "blocked" || status === "failed" ? "failed" : "completed",
      text: formatHelixCapabilityLaneProjectionReceiptText(receipt),
      detail:
        coerceText(receipt.receipt_ref).trim() ||
        coerceText(receipt.observation_ref).trim() ||
        capabilityId,
      lane: laneId,
      step_id: "lane_projection_receipt",
      turn_id: turnId,
      capability_id: capabilityId,
      receipt_ref: coerceText(receipt.receipt_ref).trim() || null,
      observation_ref: coerceText(receipt.observation_ref).trim() || null,
      source_id: coerceText(receipt.source_id).trim() || coerceText(payload?.source_id).trim() || null,
      source_hash:
        coerceText(receipt.source_hash).trim() ||
        coerceText(receipt.sourceHash).trim() ||
        coerceText(payload?.source_hash).trim() ||
        coerceText(payload?.sourceHash).trim() ||
        null,
      source_kind: coerceText(receipt.source_kind).trim() || coerceText(payload?.source_kind).trim() || null,
      source_text_hash:
        coerceText(receipt.source_text_hash).trim() ||
        coerceText(receipt.sourceTextHash).trim() ||
        coerceText(payload?.source_text_hash).trim() ||
        coerceText(payload?.sourceTextHash).trim() ||
        null,
      source_text_char_count:
        coerceText(receipt.source_text_char_count).trim() ||
        coerceText(receipt.sourceTextCharCount).trim() ||
        coerceText(payload?.source_text_char_count).trim() ||
        coerceText(payload?.sourceTextCharCount).trim() ||
        null,
      projection_key: projectionKey || null,
      account_locale: coerceText(receipt.account_locale).trim() ||
        coerceText(payload?.account_locale).trim() ||
        null,
      latest_chunk_id:
        coerceText(receipt.chunk_id).trim() ||
        coerceText(receipt.chunkId).trim() ||
        coerceText(payload?.chunk_id).trim() ||
        coerceText(payload?.chunkId).trim() ||
        null,
      latest_chunk_index:
        coerceText(receipt.chunk_index).trim() ||
        coerceText(receipt.chunkIndex).trim() ||
        coerceText(payload?.chunk_index).trim() ||
        coerceText(payload?.chunkIndex).trim() ||
        null,
      latest_dedupe_key:
        coerceText(receipt.dedupe_key).trim() ||
        coerceText(receipt.dedupeKey).trim() ||
        coerceText(payload?.dedupe_key).trim() ||
        coerceText(payload?.dedupeKey).trim() ||
        null,
      latest_source_event_id:
        coerceText(receipt.source_event_id).trim() ||
        coerceText(receipt.sourceEventId).trim() ||
        coerceText(payload?.source_event_id).trim() ||
        coerceText(payload?.sourceEventId).trim() ||
        null,
      latest_source_event_ms:
        coerceText(receipt.source_event_ms).trim() ||
        coerceText(receipt.sourceEventMs).trim() ||
        coerceText(payload?.source_event_ms).trim() ||
        coerceText(payload?.sourceEventMs).trim() ||
        null,
      latest_observed_at_ms:
        coerceText(receipt.observed_at_ms).trim() ||
        coerceText(receipt.observedAtMs).trim() ||
        coerceText(payload?.observed_at_ms).trim() ||
        coerceText(payload?.observedAtMs).trim() ||
        null,
      latest_freshness_status:
        coerceText(receipt.freshness_status).trim() ||
        coerceText(receipt.freshnessStatus).trim() ||
        coerceText(payload?.freshness_status).trim() ||
        coerceText(payload?.freshnessStatus).trim() ||
        null,
      latest_projection_target:
        coerceText(receipt.projection_target).trim() ||
        coerceText(receipt.projectionTarget).trim() ||
        coerceText(payload?.projection_target).trim() ||
        coerceText(payload?.projectionTarget).trim() ||
        null,
      target_language:
        coerceText(receipt.target_language).trim() ||
        coerceText(receipt.targetLanguage).trim() ||
        coerceText(payload?.target_language).trim() ||
        coerceText(payload?.targetLanguage).trim() ||
        null,
      terminal_authority_status:
        coerceText(receipt.terminal_authority_status).trim() ||
        coerceText(payload?.terminal_authority_status).trim() ||
        null,
      terminal_eligible: receipt.terminal_eligible === true,
      assistant_answer: receipt.assistant_answer === true,
      raw_content_included: receipt.raw_content_included === true,
      event_source: "capability_lane_projection_receipts",
      source_event_type: "lane_projection_receipt",
    };
  });
  const uiTranslationProjectionEvents = uiTranslationProjections.slice(0, 10).map((projection, index) => {
    const status =
      projection.status === "failed" || projection.status === "cancelled"
        ? "failed"
        : projection.status === "stale"
          ? "pending"
          : "completed";
    return {
      id: projection.receiptRef || `${reply.id}-live-translation-ui-projection-${index}`,
      role: "tool",
      type: "observation",
      status,
      text: formatHelixLiveTranslationUiProjectionText(projection),
      detail: projection.receiptRef || projection.observationRef || projection.key,
      lane: "live_translation",
      step_id: "ui_translation_projection",
      turn_id: turnId,
      capability_id: "live_translation.translate_text",
      receipt_ref: projection.receiptRef,
      observation_ref: projection.observationRef,
      source_id: projection.sourceId,
      source_hash: projection.sourceHash,
      source_kind: projection.sourceKind,
      source_text_hash: projection.sourceTextHash ?? null,
      source_text_char_count: projection.sourceTextCharCount ?? null,
      source_identity_key: projection.sourceIdentityKey ?? null,
      latest_source_identity_key: projection.latestSourceIdentityKey ?? null,
      projection_key: projection.projectionKey ?? null,
      account_locale: projection.accountLocale,
      latest_chunk_id: projection.chunkId,
      latest_chunk_index: projection.chunkIndex,
      latest_dedupe_key: projection.dedupeKey,
      latest_source_event_id: projection.sourceEventId,
      latest_source_event_ms: projection.sourceEventMs,
      latest_observed_at_ms: projection.observedAtMs,
      latest_freshness_status: projection.freshnessStatus,
      latest_projection_target: projection.projectionTarget,
      latest_cancel_requested: projection.cancelRequested,
      target_language: projection.targetLanguage,
      translated_text: projection.translatedText,
      projection_status: projection.status,
      terminal_eligible: projection.terminalEligible,
      terminal_authority_status: projection.terminalAuthorityStatus,
      assistant_answer: projection.assistantAnswer,
      raw_content_included: projection.rawContentIncluded,
      event_source: "capability_lane_projection_receipts",
      source_event_type: "ui_translation_projection",
    };
  });
  const sessionEvents = sessionSummaries.slice(0, 10).map((summary, index) => {
    const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
    const sessionStatus = coerceText(summary.session_status).trim();
    const sessionHealth = coerceText(summary.session_health).trim();
    const status =
      sessionHealth === "blocked" || sessionStatus === "blocked"
        ? "failed"
        : sessionStatus === "running" || sessionStatus === "paused"
          ? "pending"
          : "completed";
    return {
      id: coerceText(summary.lane_session_id).trim() || `${reply.id}-capability-lane-session-${index}`,
      role: "system",
      type: "observation",
      status,
      text: formatHelixCapabilityLaneSessionSummaryText(summary),
      detail:
        coerceText(summary.lane_session_id).trim() ||
        coerceText(summary.last_observation_ref).trim() ||
        laneId,
      lane: laneId,
      step_id: "lane_session",
      turn_id: turnId,
      capability_id: laneId,
      lane_session_id: coerceText(summary.lane_session_id).trim() || null,
      session_control_key: coerceText(summary.session_control_key).trim() || null,
      source_binding_key: coerceText(summary.source_binding_key).trim() || null,
      latest_observation_key: coerceText(summary.latest_observation_key).trim() || null,
      latest_event_id: coerceText(summary.latest_event_id).trim() || null,
      has_observation: summary.has_observation === true,
      session_lifecycle_action:
        coerceText(summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action).trim() || null,
      permission_profile: formatCapabilityLanePermissionText(summary.permissions) || null,
      permissions: readAgentLoopAuditRecord(summary.permissions),
      selected_backend_provider: coerceText(summary.selected_backend_provider).trim() || null,
      cost_class: coerceText(summary.cost_class).trim() || null,
      latency_class: coerceText(summary.latency_class).trim() || null,
      privacy_class: coerceText(summary.privacy_class).trim() || null,
      fallback_backend_provider: coerceText(summary.fallback_backend_provider).trim() || null,
      receipt_ref: coerceText(summary.latest_receipt_ref ?? summary.last_receipt_ref).trim() || null,
      observation_ref: coerceText(summary.last_observation_ref).trim() || null,
      source_id: coerceText(summary.source_id).trim() || null,
      latest_chunk_id: coerceText(summary.latest_chunk_id).trim() || null,
      latest_chunk_index: coerceText(summary.latest_chunk_index).trim() || null,
      latest_dedupe_key: coerceText(summary.latest_dedupe_key).trim() || null,
      latest_source_event_id: coerceText(summary.latest_source_event_id).trim() || null,
      latest_source_event_ms: coerceText(summary.latest_source_event_ms).trim() || null,
      latest_observed_at_ms: coerceText(summary.latest_observed_at_ms).trim() || null,
      latest_freshness_status: coerceText(summary.latest_freshness_status).trim() || null,
      latest_projection_target: coerceText(summary.latest_projection_target).trim() || null,
      account_locale: coerceText(summary.account_locale ?? summary.latest_account_locale).trim() || null,
      latest_account_locale: coerceText(summary.latest_account_locale).trim() || null,
      target_language: coerceText(summary.target_language ?? summary.latest_target_language).trim() || null,
      latest_target_language: coerceText(summary.latest_target_language).trim() || null,
      latest_cancel_requested: summary.latest_cancel_requested === true,
      terminal_authority_status: coerceText(summary.terminal_authority_status).trim() || null,
      terminal_eligible: summary.terminal_eligible === true,
      assistant_answer: summary.assistant_answer === true,
      raw_content_included: summary.raw_content_included === true,
      event_source: "capability_lane_session_debug_summaries",
      source_event_type: "lane_session",
    };
  });
  const sessionResultEvents = sessionResults.slice(0, 10).map((result, index) => {
    const laneId = coerceText(result.lane_id).trim() || "capability_lane";
    const action = coerceText(result.action).trim() || "session";
    const blockedReason = coerceText(result.blocked_reason).trim();
    return {
      id:
        [
          reply.id,
          "capability-lane-session-result",
          coerceText(result.lane_session_id).trim() || "unbound",
          action,
          index,
        ].join("-"),
      role: "system",
      type: "observation",
      status: blockedReason ? "failed" : "completed",
      text: formatHelixCapabilityLaneSessionResultText(result),
      detail:
        coerceText(result.lane_session_id).trim() ||
        blockedReason ||
        laneId,
      lane: laneId,
      step_id: "lane_session",
      turn_id: turnId,
      capability_id: laneId,
      lane_session_id: coerceText(result.lane_session_id).trim() || null,
      session_lifecycle_action: action,
      selected_backend_provider: coerceText(result.selected_backend_provider).trim() || null,
      requested_backend_provider: coerceText(result.requested_backend_provider).trim() || null,
      source_id: coerceText(result.source_id).trim() || null,
      source_hash: coerceText(result.source_hash).trim() || null,
      source_binding_key: coerceText(result.source_binding_key).trim() || null,
      source_identity_key: coerceText(result.source_identity_key).trim() || null,
      source_text_hash: coerceText(result.source_text_hash).trim() || null,
      source_text_char_count: coerceText(result.source_text_char_count).trim() || null,
      account_locale: coerceText(result.account_locale).trim() || null,
      target_language: coerceText(result.target_language).trim() || null,
      blocked_reason: blockedReason || null,
      context_role: coerceText(result.context_role).trim() || "tool_evidence",
      answer_authority: result.answer_authority === true,
      terminal_eligible: result.terminal_eligible === true,
      assistant_answer: result.assistant_answer === true,
      raw_content_included: result.raw_content_included === true,
      event_source: "capability_lane_session_results",
      source_event_type: "lane_session",
    };
  });
  const mailLoopEvents = mailLoopSummaries.slice(0, 10).map((summary, index) => {
    const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
    const blockedReason = coerceText(summary.blocked_reason).trim();
    const status = blockedReason ? "failed" : summary.stage_play_wake_expected === true ? "pending" : "completed";
    return {
      id: coerceText(summary.stage_play_mail_id).trim() || `${reply.id}-capability-lane-mail-loop-${index}`,
      role: "system",
      type: "observation",
      status,
      text: formatHelixCapabilityLaneMailLoopSummaryText(summary),
      detail:
        coerceText(summary.stage_play_mail_id).trim() ||
        coerceText(summary.observation_ref).trim() ||
        blockedReason ||
        laneId,
      lane: laneId,
      step_id: "lane_mail_loop",
      turn_id: turnId,
      capability_id: coerceText(summary.capability).trim() || laneId,
      lane_session_id: coerceText(summary.lane_session_id).trim() || null,
      observation_lane_session_id: coerceText(summary.observation_lane_session_id).trim() || null,
      session_control_key: coerceText(summary.lane_session_control_key).trim() || null,
      source_binding_key: coerceText(summary.lane_session_source_binding_key).trim() || null,
      source_identity_key: coerceText(summary.source_identity_key ?? summary.sourceIdentityKey).trim() || null,
      latest_source_identity_key:
        coerceText(summary.latest_source_identity_key ?? summary.latestSourceIdentityKey).trim() || null,
      latest_mail_loop_observation_key: coerceText(summary.mail_loop_observation_key).trim() || null,
      selected_backend_provider: coerceText(summary.selected_backend_provider).trim() || null,
      cost_class: coerceText(summary.cost_class).trim() || null,
      latency_class: coerceText(summary.latency_class).trim() || null,
      privacy_class: coerceText(summary.privacy_class).trim() || null,
      fallback_backend_provider: coerceText(summary.fallback_backend_provider).trim() || null,
      receipt_ref: coerceText(summary.receipt_ref).trim() || null,
      observation_ref: coerceText(summary.observation_ref).trim() || null,
      source_id: coerceText(summary.source_id).trim() || null,
      source_hash: coerceText(summary.source_hash).trim() || null,
      account_locale: coerceText(summary.account_locale ?? summary.latest_account_locale).trim() || null,
      latest_account_locale: coerceText(summary.latest_account_locale).trim() || null,
      latest_chunk_id: coerceText(summary.chunk_id).trim() || null,
      latest_chunk_index: coerceText(summary.chunk_index).trim() || null,
      latest_dedupe_key: coerceText(summary.dedupe_key).trim() || null,
      latest_source_event_id: coerceText(summary.source_event_id).trim() || null,
      latest_source_event_ms: coerceText(summary.source_event_ms).trim() || null,
      latest_observed_at_ms: coerceText(summary.observed_at_ms).trim() || null,
      latest_freshness_status: coerceText(summary.freshness_status).trim() || null,
      latest_projection_target: coerceText(summary.projection_target).trim() || null,
      target_language: coerceText(summary.target_language ?? summary.latest_target_language).trim() || null,
      latest_target_language: coerceText(summary.latest_target_language).trim() || null,
      latest_cancel_requested: summary.cancel_requested === true,
      stage_play_mail_id: coerceText(summary.stage_play_mail_id).trim() || null,
      stage_play_mail_delivery_status: coerceText(summary.stage_play_mail_delivery_status).trim() || null,
      previous_stage_play_mail_id: coerceText(summary.previous_stage_play_mail_id).trim() || null,
      materialized_mail_loop_evidence:
        typeof summary.materialized_mail_loop_evidence === "boolean"
          ? summary.materialized_mail_loop_evidence
          : null,
      stage_play_wake_expected: summary.stage_play_wake_expected === true,
      stage_play_wake_kind: coerceText(summary.stage_play_wake_kind).trim() || null,
      mailbox_thread_id: coerceText(summary.mailbox_thread_id).trim() || null,
      mail_status: coerceText(summary.mail_status).trim() || null,
      blocked_reason: coerceText(summary.blocked_reason).trim() || null,
      terminal_authority_status: coerceText(summary.terminal_authority_status).trim() || null,
      terminal_eligible: summary.terminal_eligible === true,
      assistant_answer: summary.assistant_answer === true,
      raw_content_included: summary.raw_content_included === true,
      event_source: "capability_lane_mail_loop_debug_summaries",
      source_event_type: "lane_mail_loop",
    };
  });
  const goalBindingEvents = goalBindingSummaries.slice(0, 10).map((summary, index) => {
    const laneId = coerceText(summary.lane_id).trim() || "capability_lane";
    const sessionStatus = coerceText(summary.session_status).trim();
    const sessionHealth = coerceText(summary.session_health).trim();
    const status =
      sessionHealth === "blocked" || sessionStatus === "blocked"
        ? "failed"
        : sessionStatus === "running" || sessionStatus === "paused"
          ? "pending"
          : "completed";
    const latestGoalEvent = readAgentLoopAuditRecord(summary.latest_goal_binding_event);
    const latestMailLoop = readAgentLoopAuditRecord(summary.latest_mail_loop_summary);
    const reportDecision = readAgentLoopAuditRecord(summary.report_decision);
    return {
      id: coerceText(summary.goal_binding_id).trim() || `${reply.id}-capability-lane-goal-binding-${index}`,
      role: "system",
      type: "observation",
      status,
      text: formatHelixCapabilityLaneGoalBindingSummaryText(summary),
      detail:
        coerceText(summary.goal_id).trim() ||
        coerceText(summary.lane_session_id).trim() ||
        laneId,
      lane: laneId,
      step_id: "lane_goal_binding",
      turn_id: turnId,
      goal_binding_id: coerceText(summary.goal_binding_id).trim() || null,
      goal_binding_key: coerceText(summary.goal_binding_key).trim() || null,
      goal_id: coerceText(summary.goal_id).trim() || null,
      binding_status: coerceText(summary.binding_status).trim() || null,
      session_status: sessionStatus || null,
      session_health: sessionHealth || null,
      session_lifecycle_action:
        coerceText(summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action).trim() || null,
      permission_profile:
        coerceText(summary.permission_profile ?? summary.session_permission_profile).trim() ||
        formatCapabilityLanePermissionText(summary.permissions) ||
        null,
      permissions: readAgentLoopAuditRecord(summary.permissions),
      activation_policy: coerceText(summary.activation_policy).trim() || null,
      attention_policy: coerceText(summary.attention_policy).trim() || null,
      stop_condition: coerceText(summary.stop_condition).trim() || null,
      report_policy: coerceText(summary.report_policy).trim() || null,
      quiet_behavior: coerceText(summary.quiet_behavior).trim() || null,
      report_action: coerceText(reportDecision?.action).trim() || null,
      report_reason: coerceText(reportDecision?.reason).trim() || null,
      report_summary_text:
        coerceText(summary.report_summary_text).trim() ||
        coerceText(reportDecision?.summary_text).trim() ||
        null,
      capability_id: laneId,
      lane_session_id: coerceText(summary.lane_session_id).trim() || null,
      session_control_key: coerceText(summary.session_control_key).trim() || null,
      source_binding_key: coerceText(summary.source_binding_key).trim() || null,
      latest_observation_key: coerceText(summary.latest_observation_key).trim() || null,
      latest_mail_loop_observation_key: coerceText(summary.latest_mail_loop_observation_key).trim() || null,
      latest_event_id: coerceText(summary.latest_event_id).trim() || null,
      session_event_count: coerceText(summary.session_event_count).trim() || null,
      has_observation: summary.has_observation === true,
      selected_backend_provider: coerceText(summary.selected_backend_provider).trim() || null,
      cost_class: coerceText(summary.cost_class).trim() || null,
      latency_class: coerceText(summary.latency_class).trim() || null,
      privacy_class: coerceText(summary.privacy_class).trim() || null,
      fallback_backend_provider: coerceText(summary.fallback_backend_provider).trim() || null,
      receipt_ref:
        readCapabilityLaneReceiptRef(
          summary,
          latestMailLoop,
          latestGoalEvent,
          reportDecision,
          summary.dispatch_plan,
        ) || null,
      observation_ref:
        coerceText(summary.last_observation_ref).trim() ||
        coerceText(reportDecision?.evidence_ref).trim() ||
        null,
      source_id:
        coerceText(summary.source_id).trim() ||
        coerceText(latestGoalEvent?.source_id).trim() ||
        null,
      source_hash:
        coerceText(summary.source_hash).trim() ||
        coerceText(latestGoalEvent?.source_hash).trim() ||
        null,
      source_kind:
        coerceText(summary.source_kind).trim() ||
        coerceText(latestGoalEvent?.source_kind).trim() ||
        null,
      source_projection_target:
        coerceText(summary.source_projection_target).trim() ||
        coerceText(latestGoalEvent?.source_projection_target).trim() ||
        null,
      account_locale:
        coerceText(summary.account_locale).trim() ||
        coerceText(latestGoalEvent?.account_locale).trim() ||
        null,
      latest_chunk_id:
        coerceText(summary.latest_chunk_id).trim() ||
        coerceText(latestGoalEvent?.latest_chunk_id).trim() ||
        null,
      latest_chunk_index:
        coerceText(summary.latest_chunk_index).trim() ||
        coerceText(latestGoalEvent?.latest_chunk_index).trim() ||
        null,
      latest_dedupe_key:
        coerceText(summary.latest_dedupe_key).trim() ||
        coerceText(latestGoalEvent?.latest_dedupe_key).trim() ||
        null,
      latest_source_event_id:
        coerceText(summary.latest_source_event_id).trim() ||
        coerceText(latestGoalEvent?.latest_source_event_id).trim() ||
        null,
      latest_source_event_ms:
        coerceText(summary.latest_source_event_ms).trim() ||
        coerceText(latestGoalEvent?.latest_source_event_ms).trim() ||
        null,
      latest_observed_at_ms:
        coerceText(summary.latest_observed_at_ms).trim() ||
        coerceText(latestGoalEvent?.latest_observed_at_ms).trim() ||
        null,
      latest_freshness_status:
        coerceText(summary.latest_freshness_status).trim() ||
        coerceText(latestGoalEvent?.latest_freshness_status).trim() ||
        null,
      latest_projection_target:
        coerceText(summary.latest_projection_target).trim() ||
        coerceText(latestGoalEvent?.latest_projection_target).trim() ||
        null,
      target_language: coerceText(summary.target_language).trim() || null,
      latest_cancel_requested:
        summary.latest_cancel_requested === true || latestGoalEvent?.latest_cancel_requested === true,
      terminal_authority_status:
        coerceText(summary.terminal_authority_status).trim() ||
        coerceText(latestGoalEvent?.terminal_authority_status).trim() ||
        coerceText(reportDecision?.terminal_authority_status).trim() ||
        null,
      terminal_eligible: summary.terminal_eligible === true,
      assistant_answer: summary.assistant_answer === true,
      raw_content_included: summary.raw_content_included === true,
      event_source: "capability_lane_goal_binding_debug_summaries",
      source_event_type: "lane_goal_binding",
    };
  });
  const goalDispatchEvents = goalDispatchPlans.slice(0, 10).map((plan, index) => {
    const laneId = coerceText(plan.lane_id).trim() || "capability_lane";
    const target = coerceText(plan.target).trim();
    const status =
      target === "ask_wake" ||
      target === "terminal_authority_review" ||
      target === "manual_review"
        ? "pending"
        : "completed";
    return {
      id:
        coerceText(plan.goal_binding_id).trim()
          ? `${coerceText(plan.goal_binding_id).trim()}:dispatch-plan`
          : `${reply.id}-capability-lane-goal-dispatch-${index}`,
      role: "system",
      type: "model_decision",
      status,
      text: formatHelixCapabilityLaneGoalDispatchPlanText(plan),
      detail:
        target ||
        coerceText(plan.goal_id).trim() ||
        coerceText(plan.lane_session_id).trim() ||
        laneId,
      lane: laneId,
      step_id: "lane_goal_dispatch_plan",
      turn_id: turnId,
      capability_id: laneId,
      lane_session_id: coerceText(plan.lane_session_id).trim() || null,
      session_control_key: coerceText(plan.session_control_key).trim() || null,
      source_binding_key: coerceText(plan.source_binding_key).trim() || null,
      latest_mail_loop_observation_key: coerceText(plan.latest_mail_loop_observation_key).trim() || null,
      latest_event_id: coerceText(plan.latest_event_id).trim() || null,
      session_event_count: coerceText(plan.session_event_count).trim() || null,
      has_observation: plan.has_observation === true,
      source_id: coerceText(plan.source_id).trim() || null,
      source_kind: coerceText(plan.source_kind).trim() || null,
      source_projection_target: coerceText(plan.source_projection_target).trim() || null,
      account_locale: coerceText(plan.account_locale).trim() || null,
      receipt_ref: coerceText(plan.receipt_ref).trim() || null,
      observation_ref: coerceText(plan.evidence_ref).trim() || null,
      target_language: coerceText(plan.target_language).trim() || null,
      terminal_authority_status: coerceText(plan.terminal_authority_status).trim() || null,
      context_role: coerceText(plan.context_role).trim() || "tool_evidence",
      answer_authority: plan.answer_authority === true,
      terminal_eligible: plan.terminal_eligible === true,
      assistant_answer: plan.assistant_answer === true,
      raw_content_included: plan.raw_content_included === true,
      event_source: "capability_lane_goal_dispatch_plans",
      source_event_type: "lane_goal_dispatch_plan",
    };
  });
  const goalDispatchAdmissionEvents = goalDispatchAdmissions.slice(0, 10).map((admission, index) => {
    const laneId = coerceText(admission.lane_id).trim() || "capability_lane";
    const blockedReason = coerceText(admission.blocked_reason).trim();
    const status = blockedReason || coerceText(admission.status).trim() === "blocked"
      ? "failed"
      : "pending";
    return {
      id:
        coerceText(admission.goal_binding_id).trim()
          ? `${coerceText(admission.goal_binding_id).trim()}:dispatch-admission`
          : `${reply.id}-capability-lane-goal-dispatch-admission-${index}`,
      role: "system",
      type: "model_decision",
      status,
      text: formatHelixCapabilityLaneGoalDispatchAdmissionText(admission),
      detail:
        blockedReason ||
        coerceText(admission.target).trim() ||
        coerceText(admission.goal_id).trim() ||
        coerceText(admission.lane_session_id).trim() ||
        laneId,
      lane: laneId,
      step_id: "lane_goal_dispatch_admission",
      turn_id: turnId,
      capability_id: laneId,
      lane_session_id: coerceText(admission.lane_session_id).trim() || null,
      session_control_key: coerceText(admission.session_control_key).trim() || null,
      source_binding_key: coerceText(admission.source_binding_key).trim() || null,
      latest_mail_loop_observation_key: coerceText(admission.latest_mail_loop_observation_key).trim() || null,
      latest_event_id: coerceText(admission.latest_event_id).trim() || null,
      session_event_count: coerceText(admission.session_event_count).trim() || null,
      has_observation: admission.has_observation === true,
      source_id: coerceText(admission.source_id).trim() || null,
      source_kind: coerceText(admission.source_kind).trim() || null,
      source_projection_target: coerceText(admission.source_projection_target).trim() || null,
      account_locale: coerceText(admission.account_locale).trim() || null,
      receipt_ref: coerceText(admission.receipt_ref).trim() || null,
      observation_ref: coerceText(admission.evidence_ref).trim() || null,
      target_language: coerceText(admission.target_language).trim() || null,
      terminal_authority_status: coerceText(admission.terminal_authority_status).trim() || null,
      context_role: coerceText(admission.context_role).trim() || "tool_evidence",
      answer_authority: admission.answer_authority === true,
      terminal_eligible: admission.terminal_eligible === true,
      assistant_answer: admission.assistant_answer === true,
      raw_content_included: admission.raw_content_included === true,
      event_source: "capability_lane_goal_dispatch_admissions",
      source_event_type: "lane_goal_dispatch_admission",
    };
  });
  const goalDispatchReadinessEvents = goalDispatchReadiness
    ? [
        {
          id: `${reply.id}-capability-lane-goal-dispatch-readiness`,
          role: "system",
          type: "model_decision",
          status: readHelixCapabilityLaneGoalDispatchReadinessState(goalDispatchReadiness) === "blocked"
            ? "failed"
            : "pending",
          text: formatHelixCapabilityLaneGoalDispatchReadinessText(goalDispatchReadiness),
          detail:
            Array.isArray(goalDispatchReadiness.next_dispatch_targets)
              ? goalDispatchReadiness.next_dispatch_targets.map(coerceText).filter(Boolean).join(", ")
              : "dispatch_readiness",
          lane: Array.isArray(goalDispatchReadiness.next_lane_ids)
            ? goalDispatchReadiness.next_lane_ids.map(coerceText).find(Boolean) || "capability_lane_goal_dispatch"
            : "capability_lane_goal_dispatch",
          step_id: "lane_goal_dispatch_readiness",
          turn_id: turnId,
          lane_session_id: Array.isArray(goalDispatchReadiness.next_lane_session_ids)
            ? goalDispatchReadiness.next_lane_session_ids.map(coerceText).find(Boolean) || null
            : null,
          session_control_key: Array.isArray(goalDispatchReadiness.next_session_control_keys)
            ? goalDispatchReadiness.next_session_control_keys.map(coerceText).find(Boolean) || null
            : null,
          source_binding_key: Array.isArray(goalDispatchReadiness.next_source_binding_keys)
            ? goalDispatchReadiness.next_source_binding_keys.map(coerceText).find(Boolean) || null
            : null,
          source_identity_key: Array.isArray(goalDispatchReadiness.next_source_identity_keys)
            ? goalDispatchReadiness.next_source_identity_keys.map(coerceText).find(Boolean) || null
            : null,
          latest_mail_loop_observation_key: Array.isArray(goalDispatchReadiness.next_mail_loop_observation_keys)
            ? goalDispatchReadiness.next_mail_loop_observation_keys.map(coerceText).find(Boolean) || null
            : null,
          latest_event_id: Array.isArray(goalDispatchReadiness.next_latest_event_ids)
            ? goalDispatchReadiness.next_latest_event_ids.map(coerceText).find(Boolean) || null
            : null,
          session_event_count: Array.isArray(goalDispatchReadiness.next_session_event_counts)
            ? goalDispatchReadiness.next_session_event_counts.map(coerceText).find(Boolean) || null
            : null,
          has_observation: goalDispatchReadiness.next_has_observation === true,
          all_next_have_observation: goalDispatchReadiness.all_next_have_observation === true,
          live_mail_loop_required_count:
            coerceText(goalDispatchReadiness.live_mail_loop_required_count).trim() || "0",
          terminal_authority_required_count:
            coerceText(goalDispatchReadiness.terminal_authority_required_count).trim() || "0",
          any_live_mail_loop_required: goalDispatchReadiness.any_live_mail_loop_required === true,
          any_terminal_authority_required: goalDispatchReadiness.any_terminal_authority_required === true,
          stage_play_wake_kind: Array.isArray(goalDispatchReadiness.next_mail_loop_wake_kinds)
            ? goalDispatchReadiness.next_mail_loop_wake_kinds.map(coerceText).find(Boolean) || null
            : null,
          source_kind: Array.isArray(goalDispatchReadiness.next_source_kinds)
            ? goalDispatchReadiness.next_source_kinds.map(coerceText).find(Boolean) || null
            : null,
          source_projection_target: Array.isArray(goalDispatchReadiness.next_source_projection_targets)
            ? goalDispatchReadiness.next_source_projection_targets.map(coerceText).find(Boolean) || null
            : null,
          account_locale: Array.isArray(goalDispatchReadiness.next_account_locales)
            ? goalDispatchReadiness.next_account_locales.map(coerceText).find(Boolean) || null
            : null,
          receipt_ref: Array.isArray(goalDispatchReadiness.next_receipt_refs)
            ? goalDispatchReadiness.next_receipt_refs.map(coerceText).find(Boolean) || null
            : null,
          observation_ref: Array.isArray(goalDispatchReadiness.next_evidence_refs)
            ? goalDispatchReadiness.next_evidence_refs.map(coerceText).find(Boolean) || null
            : null,
          target_language: Array.isArray(goalDispatchReadiness.next_target_languages)
            ? goalDispatchReadiness.next_target_languages.map(coerceText).find(Boolean) || null
            : null,
          terminal_authority_status: coerceText(goalDispatchReadiness.terminal_authority_status).trim() || null,
          readiness_state: readHelixCapabilityLaneGoalDispatchReadinessState(goalDispatchReadiness),
          context_role: coerceText(goalDispatchReadiness.context_role).trim() || "tool_evidence",
          answer_authority: goalDispatchReadiness.answer_authority === true,
          terminal_eligible: goalDispatchReadiness.terminal_eligible === true,
          assistant_answer: goalDispatchReadiness.assistant_answer === true,
          raw_content_included: goalDispatchReadiness.raw_content_included === true,
          event_source: "capability_lane_goal_dispatch_readiness",
          source_event_type: "lane_goal_dispatch_readiness",
        },
      ]
    : [];
  if (turnTimeline.length > 0) {
    const events = turnTimeline.slice(0, 80).map((event, index) =>
      buildHelixCapabilityLaneTimelineTranscriptEvent({
        replyId: reply.id,
        turnId,
        event,
        index,
      }),
    );
    events.push(...consoleStateEvents);
    events.push(...visibleTranslationCollectorEvents);
    events.push(...visibleTranslationChainSummaryEvents);
    events.push(...sessionResultEvents);
    events.push(...mailLoopEvents);
    events.push(...projectionReceiptEvents);
    events.push(...uiTranslationProjectionEvents);
    events.push(...goalDispatchEvents);
    events.push(...goalDispatchAdmissionEvents);
    events.push(...goalDispatchReadinessEvents);
    const terminalEvent = buildHelixCapabilityLaneTerminalEvent({
      replyId: reply.id,
      turnId,
      terminalKind,
      terminalRejection,
      eventSource: "capability_lane_turn_timeline",
    });
    if (terminalEvent) events.push(terminalEvent);
    return events;
  }
  if (consoleStateEvents.length > 0) {
    const events = [...consoleStateEvents];
    events.push(...visibleTranslationCollectorEvents);
    events.push(...visibleTranslationChainSummaryEvents);
    events.push(...sessionResultEvents);
    events.push(...mailLoopEvents);
    events.push(...projectionReceiptEvents);
    events.push(...uiTranslationProjectionEvents);
    events.push(...goalDispatchEvents);
    events.push(...goalDispatchAdmissionEvents);
    events.push(...goalDispatchReadinessEvents);
    const terminalEvent = buildHelixCapabilityLaneTerminalEvent({
      replyId: reply.id,
      turnId,
      terminalKind,
      terminalRejection,
      eventSource: "capability_lane_timeline_summary.console_state_rows",
    });
    if (terminalEvent) events.push(terminalEvent);
    return events;
  }
  if (calls.length === 0 && debugEvents.length > 0) {
    const events = debugEvents.slice(0, 40).map((event, index) => {
      const stage = coerceText(event.stage).trim();
      const laneId = coerceText(event.lane_id).trim() || "capability_lane";
      const capabilityId = coerceText(event.capability).trim() || laneId;
      const status = coerceText(event.status).trim() || "completed";
      const sourceEventType =
        stage === "lane_requested" ||
        stage === "lane_backend_selected" ||
        stage === "lane_observation" ||
        stage === "lane_reentered"
          ? stage
          : "lane_observation";
      return {
        id: coerceText(event.event_id).trim() || `${reply.id}-capability-lane-debug-${index}`,
        role: stage === "lane_backend_selected" ? "system" : stage === "lane_observation" ? "tool" : "agent",
        type: stage === "lane_observation" ? "tool_result" : "model_decision",
        status: status === "blocked" || status === "failed" ? "failed" : status === "pending" ? "pending" : "completed",
        text: formatHelixCapabilityLaneDebugEventText(event),
        detail:
          coerceText(event.selection_reason).trim() ||
          coerceText(event.observation_ref).trim() ||
          capabilityId,
        lane: laneId,
        step_id: coerceText(event.stage).trim() || `capability_lane_debug_${index + 1}`,
        turn_id: turnId,
        capability_id: capabilityId,
        selected_backend_provider: coerceText(event.selected_backend_provider).trim() || null,
        cost_class: coerceText(event.cost_class).trim() || null,
        latency_class: coerceText(event.latency_class).trim() || null,
        privacy_class: coerceText(event.privacy_class).trim() || null,
        fallback_backend_provider: coerceText(event.fallback_backend_provider).trim() || null,
        receipt_ref: coerceText(event.receipt_ref).trim() || null,
        observation_ref: coerceText(event.observation_ref).trim() || null,
        terminal_authority_status: coerceText(event.terminal_authority_status).trim() || null,
        terminal_eligible: event.terminal_eligible === true,
        assistant_answer: event.assistant_answer === true,
        raw_content_included: event.raw_content_included === true,
        event_source: "capability_lane_debug_events",
        source_event_type: sourceEventType,
      };
    });
    events.unshift(...visibleLaneEvents);
    events.push(...visibleTranslationCollectorEvents);
    events.push(...visibleTranslationChainSummaryEvents);
    events.push(...sessionEvents);
    events.push(...mailLoopEvents);
    events.push(...projectionReceiptEvents);
    events.push(...uiTranslationProjectionEvents);
    events.push(...goalBindingEvents);
    events.push(...goalDispatchEvents);
    events.push(...goalDispatchAdmissionEvents);
    events.push(...goalDispatchReadinessEvents);
    const terminalEvent = buildHelixCapabilityLaneTerminalEvent({
      replyId: reply.id,
      turnId,
      terminalKind,
      terminalRejection,
      eventSource: "capability_lane_debug_events",
    });
    if (terminalEvent) events.push(terminalEvent);
    return events;
  }
  const backendSelections = readHelixCapabilityLaneBackendSelections(reply);
  const usingBackendSelectionOnly = calls.length === 0;
  const rowCalls = calls.length > 0 ? calls : backendSelections;
  if (rowCalls.length === 0) {
    const events = [
      ...visibleLaneEvents,
      ...visibleTranslationCollectorEvents,
      ...visibleTranslationChainSummaryEvents,
      ...sessionResultEvents,
      ...sessionEvents,
      ...mailLoopEvents,
      ...projectionReceiptEvents,
      ...uiTranslationProjectionEvents,
      ...goalBindingEvents,
      ...goalDispatchEvents,
      ...goalDispatchAdmissionEvents,
      ...goalDispatchReadinessEvents,
    ];
    const terminalEvent = buildHelixCapabilityLaneTerminalEvent({
      replyId: reply.id,
      turnId,
      terminalKind,
      terminalRejection,
      eventSource: "capability_lane_session_debug_summaries",
    });
    if (terminalEvent) events.push(terminalEvent);
    return events;
  }
  const packets = readHelixCapabilityLaneObservationPackets(reply);
  const traces = readHelixCapabilityLaneResolveTraces(reply);
  const reentryStatus = readHelixCapabilityLaneReentryStatus(reply);
  const events: Record<string, unknown>[] = [...visibleLaneEvents];
  events.push(...visibleTranslationCollectorEvents);
  events.push(...visibleTranslationChainSummaryEvents);
  let successfulPacketPresent = false;

  rowCalls.slice(0, 10).forEach((call, index) => {
    const capabilityId = readHelixCapabilityLaneCapability(call);
    if (!capabilityId) return;
    const laneId = readHelixCapabilityLaneId(call) || capabilityId;
    const packet = readHelixCapabilityLaneObservationPacketForCall(call, packets);
    const trace =
      readHelixCapabilityLaneTraceForCall(call, traces) ??
      readHelixCapabilityLaneTraceForCall(call, backendSelections);
    const ok = hasSucceededHelixCapabilityLanePacket(packet, call);
    successfulPacketPresent = successfulPacketPresent || ok;
    const stepId = `capability_lane_${index + 1}`;
    const backendSummary = summarizeHelixCapabilityLaneBackend(trace);

    events.push({
      id: `${reply.id}-capability-lane-${index}-request`,
      role: "agent",
      type: "model_decision",
      status: "completed",
      text: `Lane requested: ${capabilityId}.`,
      detail: capabilityId,
      lane: laneId,
      step_id: stepId,
      turn_id: turnId,
      capability_id: capabilityId,
      event_source: "capability_lane_call_results",
      source_event_type: "lane_requested",
    });

    if (backendSummary) {
      events.push({
        id: `${reply.id}-capability-lane-${index}-backend`,
        role: "system",
        type: "decision",
        status: coerceText(trace?.permission_status).trim() === "permission_blocked" ? "blocked" : "completed",
        text: `Lane backend selected: ${backendSummary}.`,
        detail:
          coerceText(trace?.selected_backend_provider).trim() ||
          coerceText(trace?.backend_provider).trim() ||
          laneId,
        lane: laneId,
        step_id: stepId,
        turn_id: turnId,
        capability_id: capabilityId,
        selected_backend_provider: coerceText(trace?.selected_backend_provider).trim() || null,
        cost_class: coerceText(trace?.cost_class).trim() || null,
        latency_class: coerceText(trace?.latency_class).trim() || null,
        privacy_class: coerceText(trace?.privacy_class).trim() || null,
        fallback_backend_provider: coerceText(trace?.fallback_backend_provider).trim() || null,
        terminal_authority_status: coerceText(trace?.terminal_authority_status).trim() || null,
        event_source: "capability_lane_resolve_traces",
        source_event_type: "lane_backend_selected",
      });
    }

    if (!usingBackendSelectionOnly || packet) {
      const packetBackend = readHelixCapabilityLanePacketBackend(packet, trace);
      events.push({
        id: `${reply.id}-capability-lane-${index}-observation`,
        role: "tool",
        type: "tool_result",
        status: ok ? "completed" : "failed",
        text: formatHelixCapabilityLaneObservationText({ capabilityId, call, packet, trace, ok }),
        detail: coerceText(packet?.observation_summary).trim() || coerceText(call.error).trim() || capabilityId,
        lane: laneId,
        step_id: stepId,
        turn_id: turnId,
        capability_id: capabilityId,
        lane_session_id: readHelixCapabilityLaneSessionId(call, packet) || null,
        selected_backend_provider: coerceText(packetBackend?.selected_backend_provider).trim() || null,
        requested_backend_provider: coerceText(packetBackend?.requested_backend_provider).trim() || null,
        availability_status: coerceText(packetBackend?.availability_status).trim() || null,
        permission_status: coerceText(packetBackend?.permission_status).trim() || null,
        execution_status: coerceText(packetBackend?.execution_status).trim() || null,
        cost_class: coerceText(packetBackend?.cost_class).trim() || null,
        latency_class: coerceText(packetBackend?.latency_class).trim() || null,
        privacy_class: coerceText(packetBackend?.privacy_class).trim() || null,
        fallback_backend_provider: coerceText(packetBackend?.fallback_backend_provider).trim() || null,
        receipt_ref:
          coerceText(packet?.receipt_ref).trim() ||
          coerceText(call.receipt_ref).trim() ||
          null,
        observation_ref:
          coerceText(packet?.observation_ref).trim() ||
          coerceText(packet?.artifact_ref).trim() ||
          coerceText(call.observation_ref).trim() ||
          null,
        terminal_authority_status:
          coerceText(packetBackend?.terminal_authority_status).trim() ||
          coerceText(packet?.terminal_authority_status).trim() ||
          coerceText(call.terminal_authority_status).trim() ||
          null,
        event_source: "capability_lane_call_results",
        source_event_type: "lane_observation",
      });
    }
  });

  events.push(...sessionResultEvents);
  events.push(...sessionEvents);
  events.push(...mailLoopEvents);
  events.push(...projectionReceiptEvents);
  events.push(...uiTranslationProjectionEvents);
  if (successfulPacketPresent || reentryStatus) {
    events.push({
      id: `${reply.id}-capability-lane-reentry`,
      role: "agent",
      type: "model_decision",
      status: successfulPacketPresent ? "completed" : "pending",
      text: successfulPacketPresent
        ? "Lane re-entry: observation packet available for provider reasoning before terminal selection."
        : `Lane re-entry: ${reentryStatus}.`,
      detail: reentryStatus || "capability_lane_observation_packets",
      lane: "capability_lane",
      step_id: "lane_reentry",
      turn_id: turnId,
      event_source: "capability_lane_observation_packets",
      source_event_type: "lane_reentered",
    });
  }

  events.push(...goalBindingEvents);
  events.push(...goalDispatchEvents);
  events.push(...goalDispatchAdmissionEvents);
  events.push(...goalDispatchReadinessEvents);

  const terminalEvent = buildHelixCapabilityLaneTerminalEvent({
    replyId: reply.id,
    turnId,
    terminalKind,
    terminalRejection,
    eventSource: "capability_lane_call_results",
  });
  if (terminalEvent) events.push(terminalEvent);

  return events;
}

export function buildHelixRuntimeTranscriptEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const agentRuntimeLoop = readAgentLoopAuditRecord(
    replyRecord?.agent_runtime_loop ?? debugRecord?.agent_runtime_loop,
  );
  const iterations = readAgentLoopAuditArray(agentRuntimeLoop?.iterations);
  if (iterations.length === 0) return [];

  const turnId = coerceText(replyRecord?.turn_id ?? debugRecord?.turn_id ?? reply.id).trim();
  const events: Record<string, unknown>[] = [];
  iterations.slice(0, 24).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    if (!record) return;
    const nextStep = coerceText(record.next_step ?? record.decision ?? "step").trim() || "step";
    const chosenCapability =
      coerceText(record.executed_action_key).trim() ||
      coerceText(record.chosen_capability).trim() ||
      coerceText(record.capability_key).trim() ||
      coerceText(record.tool_key).trim();
    const authority =
      coerceText(record.decision_authority).trim() ||
      coerceText(record.decision_source).trim() ||
      coerceText(record.sampling_mode).trim() ||
      "runtime";
    const decisionId = coerceText(record.decision_id ?? record.decision_ref).trim();
    const stepId = `runtime_${index + 1}`;
    const status =
      record.observation_role === "tool_error" || record.status === "failed"
        ? "failed"
        : nextStep === "ask_user"
          ? "request_input"
          : "completed";
    const refs = readHelixRuntimeArtifactRefs(record);
    const artifactSummary = summarizeHelixRuntimeArtifactRefs(refs);
    const decisionText =
      nextStep === "answer" || chosenCapability === "model.direct_answer"
        ? "Composed final answer from current observations."
        : chosenCapability
          ? `Selected ${chosenCapability}.`
          : `Selected ${nextStep}.`;
    events.push({
      id: `${reply.id}-runtime-${index}-decision`,
      role: "agent",
      type: "decision",
      status,
      text: decisionText,
      detail: chosenCapability || nextStep,
      lane: authority,
      step_id: stepId,
      turn_id: turnId,
      decision_id: decisionId,
      event_source: "agent_runtime_loop",
    });
    if (nextStep === "answer" || chosenCapability === "model.direct_answer") {
      events.push({
        id: `${reply.id}-runtime-${index}-final`,
        role: "agent",
        type: "observation",
        status,
        text: artifactSummary
          ? `Reviewed observed artifacts for terminal answer: ${artifactSummary}.`
          : "Reviewed observed artifacts for terminal answer.",
        detail: chosenCapability || "model.direct_answer",
        lane: authority,
        step_id: stepId,
        turn_id: turnId,
        decision_id: decisionId,
        event_source: "agent_runtime_loop",
      });
      return;
    }
    events.push({
      id: `${reply.id}-runtime-${index}-observation`,
      role: "tool",
      type: "tool_result",
      status,
      text: artifactSummary ? `Observed ${artifactSummary}.` : "Observed selected capability result.",
      detail: chosenCapability || nextStep,
      lane: chosenCapability || "tool",
      step_id: stepId,
      turn_id: turnId,
      decision_id: decisionId,
      event_source: "agent_runtime_loop",
    });
  });
  return events;
}

export function buildHelixRuntimeAskLiveEvents(reply: HelixAskTranscriptReply): AskLiveEventEntry[] {
  const events = [
    ...buildHelixRuntimeTranscriptEvents(reply),
    ...buildHelixWorkstationGatewayTranscriptEvents(reply),
    ...buildHelixCapabilityLaneTranscriptEvents(reply),
  ];
  return events.map((event, index) => ({
    id: coerceText(event.id).trim() || `${reply.id}-runtime-event-${index}`,
    text: coerceText(event.text).trim() || "Helix Ask runtime update",
    tool: coerceText(event.role).trim() || "agent",
    seq: index,
    meta: {
      stage: coerceText(event.type).trim() || "runtime",
      detail: coerceText(event.detail).trim() || null,
      status: coerceText(event.status).trim() || "completed",
      traceId: coerceText(event.trace_id).trim() || null,
      turnKey: coerceText(event.turn_id).trim() || null,
      stepId: coerceText(event.step_id).trim() || null,
      lane: coerceText(event.lane).trim() || null,
      capabilityId: coerceText(event.capability_id).trim() || null,
      laneSessionId: coerceText(event.lane_session_id).trim() || null,
      sessionControlKey: coerceText(event.session_control_key).trim() || null,
      sourceBindingKey: coerceText(event.source_binding_key).trim() || null,
      latestObservationKey: coerceText(event.latest_observation_key).trim() || null,
      latestMailLoopObservationKey: coerceText(event.latest_mail_loop_observation_key).trim() || null,
      goalBindingKey: coerceText(event.goal_binding_key).trim() || null,
      latestEventId: coerceText(event.latest_event_id).trim() || null,
      normalizedStage: coerceText(event.normalized_stage).trim() || null,
      stateLabel: coerceText(event.state_label).trim() || null,
      sessionEventCount: coerceText(event.session_event_count).trim() || null,
      hasObservation: readTranscriptBoolean(event.has_observation),
      allNextHaveObservation: readTranscriptBoolean(event.all_next_have_observation),
      liveMailLoopRequiredCount: coerceText(event.live_mail_loop_required_count).trim() || null,
      terminalAuthorityRequiredCount: coerceText(event.terminal_authority_required_count).trim() || null,
      anyLiveMailLoopRequired: readTranscriptBoolean(event.any_live_mail_loop_required),
      anyTerminalAuthorityRequired: readTranscriptBoolean(event.any_terminal_authority_required),
      observationLaneSessionId: coerceText(event.observation_lane_session_id).trim() || null,
      goalBindingId: coerceText(event.goal_binding_id).trim() || null,
      goalId: coerceText(event.goal_id).trim() || null,
      bindingStatus: coerceText(event.binding_status).trim() || null,
      sessionStatus: coerceText(event.session_status).trim() || null,
      sessionHealth: coerceText(event.session_health).trim() || null,
      sessionLifecycleAction: coerceText(event.session_lifecycle_action ?? event.lifecycle_action ?? event.session_action).trim() || null,
      sessionPermissionProfile: coerceText(event.permission_profile ?? event.session_permission_profile).trim() || null,
      permissions: readAgentLoopAuditRecord(event.permissions),
      activationPolicy: coerceText(event.activation_policy).trim() || null,
      attentionPolicy: coerceText(event.attention_policy).trim() || null,
      stopCondition: coerceText(event.stop_condition).trim() || null,
      reportPolicy: coerceText(event.report_policy).trim() || null,
      quietBehavior: coerceText(event.quiet_behavior).trim() || null,
      reportAction: coerceText(event.report_action).trim() || null,
      reportReason: coerceText(event.report_reason).trim() || null,
      quietBehaviorApplied: readTranscriptBoolean(event.quiet_behavior_applied),
      wakeExpected: readTranscriptBoolean(event.wake_expected),
      surfaceBadgeExpected: readTranscriptBoolean(event.surface_badge_expected),
      terminalReportRequested: readTranscriptBoolean(event.terminal_report_requested),
      terminalReportAuthorized: readTranscriptBoolean(event.terminal_report_authorized),
      reportSummaryText: coerceText(event.report_summary_text).trim() || null,
      requestedBackendProvider: coerceText(event.requested_backend_provider).trim() || null,
      selectedBackendProvider: coerceText(event.selected_backend_provider).trim() || null,
      backendSelectionReason:
        coerceText(event.selection_reason).trim() ||
        coerceText(event.backend_selection_reason).trim() ||
        null,
      backendCostClass: coerceText(event.cost_class).trim() || null,
      backendLatencyClass: coerceText(event.latency_class).trim() || null,
      backendPrivacyClass: coerceText(event.privacy_class).trim() || null,
      fallbackBackendProvider: coerceText(event.fallback_backend_provider).trim() || null,
      receiptRef: coerceText(event.receipt_ref).trim() || null,
      observationRef: coerceText(event.observation_ref).trim() || null,
      sourceId: coerceText(event.source_id).trim() || null,
      sourceHash: coerceText(event.source_hash).trim() || null,
      sourceKind: coerceText(event.source_kind).trim() || null,
      sourceTextHash: coerceText(event.source_text_hash ?? event.sourceTextHash).trim() || null,
      sourceTextCharCount: coerceText(event.source_text_char_count ?? event.sourceTextCharCount).trim() || null,
      sourceIdentityKey: coerceText(event.source_identity_key ?? event.sourceIdentityKey).trim() || null,
      latestSourceIdentityKey: coerceText(event.latest_source_identity_key ?? event.latestSourceIdentityKey).trim() || null,
      sourceProjectionTarget: coerceText(event.source_projection_target).trim() || null,
      projectionKey: coerceText(event.projection_key ?? event.projectionKey).trim() || null,
      accountLocale: coerceText(event.account_locale ?? event.latest_account_locale).trim() || null,
      latestChunkId: coerceText(event.latest_chunk_id).trim() || null,
      latestChunkIndex: coerceText(event.latest_chunk_index).trim() || null,
      latestDedupeKey: coerceText(event.latest_dedupe_key).trim() || null,
      latestSourceEventId: coerceText(event.latest_source_event_id).trim() || null,
      latestSourceEventMs: coerceText(event.latest_source_event_ms).trim() || null,
      latestObservedAtMs: coerceText(event.latest_observed_at_ms).trim() || null,
      latestFreshnessStatus: coerceText(event.latest_freshness_status).trim() || null,
      latestProjectionTarget: coerceText(event.latest_projection_target).trim() || null,
      latestCancelRequested: readTranscriptBoolean(event.latest_cancel_requested),
      stagePlayMailId: coerceText(event.stage_play_mail_id).trim() || null,
      stagePlayMailDeliveryStatus: coerceText(event.stage_play_mail_delivery_status).trim() || null,
      previousStagePlayMailId: coerceText(event.previous_stage_play_mail_id).trim() || null,
      stagePlayWakeExpected: readTranscriptBoolean(event.stage_play_wake_expected),
      mailboxWakeExpected: readTranscriptBoolean(event.mailbox_wake_expected),
      decisionWakeExpected: readTranscriptBoolean(event.decision_wake_expected),
      stagePlayWakeKind: coerceText(event.stage_play_wake_kind).trim() || null,
      mailboxThreadId: coerceText(event.mailbox_thread_id).trim() || null,
      mailStatus: coerceText(event.mail_status).trim() || null,
      blockedReason: coerceText(event.blocked_reason).trim() || null,
      targetLanguage: coerceText(event.target_language ?? event.latest_target_language).trim() || null,
      translatedText: coerceText(event.translated_text).trim() || null,
      projectionStatus: coerceText(event.projection_status).trim() || null,
      laneVisible: readTranscriptBoolean(event.lane_visible),
      laneRequested: readTranscriptBoolean(event.lane_requested),
      laneExecuted: readTranscriptBoolean(event.lane_executed),
      observationReentered: readTranscriptBoolean(event.observation_reentered),
      reentryRequired: readTranscriptBoolean(event.reentry_required),
      terminalEligible: readTranscriptBoolean(event.terminal_eligible),
      terminalAuthorityStatus: coerceText(event.terminal_authority_status).trim() || null,
      readinessState: coerceText(event.readiness_state ?? event.readinessState).trim() || null,
      contextRole: coerceText(event.context_role).trim() || null,
      answerAuthority: readTranscriptBoolean(event.answer_authority),
      assistantAnswer: readTranscriptBoolean(event.assistant_answer),
      rawContentIncluded: readTranscriptBoolean(event.raw_content_included),
      clientReplayReason: coerceText(event.client_replay_reason ?? event.replay_reason).trim() || null,
      providerNativeEventType: coerceText(event.provider_native_event_type).trim() || null,
      source_event_type: coerceText(event.source_event_type).trim() || null,
      event_source: coerceText(event.event_source).trim() || "agent_runtime_loop",
    },
  }));
}

export function resolveHelixTurnTranscriptEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const finalAnswerSource =
    coerceText(replyRecord?.final_answer_source).trim() ||
    coerceText(debugRecord?.final_answer_source).trim();
  const terminalArtifactKind =
    coerceText(replyRecord?.terminal_artifact_kind).trim() ||
    coerceText(debugRecord?.terminal_artifact_kind).trim() ||
    coerceText(readHelixResolvedTurnSummary(reply)?.terminal_artifact_kind).trim();
  const filterSatisfiedWorkstationArtifacts =
    finalAnswerSource === "workstation_tool_evaluation" ||
    terminalArtifactKind === "workstation_tool_evaluation";
  const normalizeEvents = (events: unknown[]): Record<string, unknown>[] => {
    const records = events
      .map((entry) => readAgentLoopAuditRecord(entry))
      .filter(Boolean) as Record<string, unknown>[];
    const visible = filterSatisfiedWorkstationArtifacts
      ? records.filter((event) => {
          const status = coerceText(event.status).trim().toLowerCase();
          const text = coerceText(event.text).trim();
          const detail = coerceText(event.detail).trim();
          const combined = `${text}\n${detail}`;
          return (
            status !== "request_input" &&
            status !== "final_failure" &&
            !/\b(?:missing_artifacts|missing_required_artifacts|Need user input|Request input|final_failure)\b/i.test(combined)
          );
        })
      : records;
    return dedupeHelixVisibleTranscriptEvents(visible);
  };
  const gatewayEvents = buildHelixWorkstationGatewayTranscriptEvents(reply);
  const gatewayEventsPresent = gatewayEvents.length > 0;
  const laneEvents = buildHelixCapabilityLaneTranscriptEvents(reply);
  const laneEventsPresent = laneEvents.length > 0;
  const mergeGatewayProjectionEvents = (events: Record<string, unknown>[]): Record<string, unknown>[] => {
    if (!gatewayEventsPresent) return events;
    const filtered = events.filter((event) => {
      const sourceEventType = coerceText(event.source_event_type).trim();
      return ![
        "tool_request",
        "tool_observation",
        "action_request",
        "action_observation",
        "model_reentry",
      ].includes(sourceEventType);
    });
    const firstTerminalIndex = filtered.findIndex((event) => {
      const sourceEventType = coerceText(event.source_event_type).trim();
      const type = coerceText(event.type).trim();
      return sourceEventType === "terminal_answer" || type === "final_answer";
    });
    if (firstTerminalIndex < 0) return [...filtered, ...gatewayEvents];
    return [
      ...filtered.slice(0, firstTerminalIndex),
      ...gatewayEvents,
      ...filtered.slice(firstTerminalIndex),
    ];
  };
  const mergeLaneProjectionEvents = (events: Record<string, unknown>[]): Record<string, unknown>[] => {
    if (!laneEventsPresent) return events;
    const filtered = events.filter((event) => {
      const sourceEventType = coerceText(event.source_event_type).trim();
      return ![
        "lane_visible",
        "lane_requested",
        "lane_backend_selected",
        "lane_observation",
        "lane_projection_receipt",
        "ui_translation_projection",
        "lane_reentered",
        "lane_session",
        "lane_mail_loop",
        "lane_goal_binding",
        "lane_goal_dispatch_plan",
        "lane_goal_dispatch_admission",
        "lane_goal_dispatch_readiness",
        "terminal_selected",
        "terminal_rejected",
      ].includes(sourceEventType);
    });
    const firstTerminalIndex = filtered.findIndex((event) => {
      const sourceEventType = coerceText(event.source_event_type).trim();
      const type = coerceText(event.type).trim();
      return sourceEventType === "terminal_answer" || type === "final_answer";
    });
    if (firstTerminalIndex < 0) return [...filtered, ...laneEvents];
    return [
      ...filtered.slice(0, firstTerminalIndex),
      ...laneEvents,
      ...filtered.slice(firstTerminalIndex),
    ];
  };
  const mergeProjectionEvents = (events: Record<string, unknown>[]): Record<string, unknown>[] =>
    mergeLaneProjectionEvents(mergeGatewayProjectionEvents(events));
  const baseRuntimeEvents = buildHelixRuntimeTranscriptEvents(reply);
  const runtimeEvents = mergeProjectionEvents(baseRuntimeEvents);
  if (baseRuntimeEvents.length > 0) {
    return normalizeEvents(runtimeEvents);
  }
  const directEvents = Array.isArray(reply.debug?.turn_transcript_events)
    ? reply.debug.turn_transcript_events
    : [];
  if (directEvents.length > 0) {
    return normalizeEvents(mergeProjectionEvents(directEvents as Record<string, unknown>[]));
  }
  const audit = readAgentLoopAuditRecord(reply.debug?.agent_loop_audit);
  const auditEvents = Array.isArray(audit?.turn_transcript_events) ? audit.turn_transcript_events : [];
  return normalizeEvents(mergeProjectionEvents(auditEvents as Record<string, unknown>[]));
}

function readHelixPublicCommentaryEvents(reply: HelixAskTranscriptReply): Record<string, unknown>[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const candidates = [
    replyRecord?.public_commentary_timeline,
    debugRecord?.public_commentary_timeline,
    readAgentLoopAuditRecord(debugRecord?.debug_export)?.public_commentary_timeline,
  ];
  const events = candidates.find(Array.isArray);
  if (!Array.isArray(events)) return [];
  const seen = new Set<string>();
  return events
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((event): event is Record<string, unknown> => {
      if (!event) return false;
      if (event.schema !== "helix.ask_public_commentary_event.v1") return false;
      if (event.assistant_answer !== false || event.raw_reasoning_included !== false) return false;
      const text = coerceText(event.text).trim();
      if (!text || /^[{[]/.test(text)) return false;
      if (/\b(?:turn_purpose|why_this_capability|expected_artifacts|observation_summary|next_step_reason)\b/i.test(text)) return false;
      const id = coerceText(event.event_id).trim() || text;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function buildHelixPublicCommentaryTranscriptRows(reply: HelixAskTranscriptReply): HelixTurnTranscriptRow[] {
  return readHelixPublicCommentaryEvents(reply).map((event, index) => {
    const timing = coerceText(event.timing).trim();
    const certainty = coerceText(event.certainty_class).trim();
    const expected = coerceText(event.expected_artifact).trim();
    const status = coerceText(event.status).trim() || "thinking";
    const label =
      timing === "final_ready"
        ? "Ready"
        : timing === "after_step"
          ? "Checked"
          : timing === "fail_closed"
            ? "Blocked"
            : timing === "before_step"
              ? "Thinking"
              : "Orienting";
    return {
      key: `${reply.id}-public-commentary-${coerceText(event.event_id).trim() || index}`,
      role: "agent",
      label,
      text: coerceText(event.text).trim(),
      meta: [timing, certainty, expected].filter(Boolean).join(" | "),
      status,
    };
  });
}

export function readHelixCausalTurnTimeline(reply: HelixAskTranscriptReply): HelixCausalTurnTimeline | null {
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const timelineRecord =
    readAgentLoopAuditRecord(debugRecord?.causal_turn_timeline) ??
    readAgentLoopAuditRecord((reply as Record<string, unknown>).causal_turn_timeline);
  if (!timelineRecord) return null;
  if (timelineRecord.schema !== "helix.causal_turn_timeline.v1") return null;
  if (!Array.isArray(timelineRecord.events)) return null;
  return timelineRecord as HelixCausalTurnTimeline;
}

function readHelixCausalTraceLabel(event: HelixCausalTurnEvent): string {
  if (event.status === "blocked" || event.status === "failed") return "Notice";
  switch (event.stage) {
    case "prompt_received":
      return "Input";
    case "goal_classified":
    case "source_target_decided":
    case "route_label_set":
    case "tool_surface_built":
      return "Setup";
    case "model_step_requested":
    case "model_step_decided":
    case "model_answer_artifact_created":
      return event.stage === "model_step_decided" ? "Decision" : "Thinking";
    case "deterministic_fallback_considered":
    case "deterministic_fallback_used":
      return "Fallback";
    case "runtime_tool_call_validated":
    case "runtime_tool_dispatched":
      return "Working";
    case "tool_observation_created":
    case "repo_evidence_observation_created":
      return "Observation";
    case "coverage_gate_evaluated":
    case "quality_gate_evaluated":
    case "goal_satisfaction_evaluated":
    case "solver_controller_decided":
    case "projection_mismatch_checked":
      return "Gate";
    case "terminal_artifact_materialized":
    case "terminal_artifact_selected":
    case "terminal_candidate_rejected":
      return "Terminal";
    case "visible_response_written":
      return "Final";
    case "debug_export_written":
      return "Debug";
    default:
      return "Trace";
  }
}

function readHelixCausalTraceText(event: HelixCausalTurnEvent): string {
  const publicSummary = coerceText(event.public_summary).trim();
  if (publicSummary) return clipText(publicSummary, 260);

  const parts: string[] = [];
  const decision = coerceText(event.decision).trim();
  const routeLabel = coerceText(event.route_label).trim();
  const sourceTarget = coerceText(event.source_target).trim();
  const capability = coerceText(event.selected_capability ?? event.model_step_capability).trim();
  const reasonCode = coerceText(event.reason_code).trim();
  if (decision) parts.push(humanizeAskLiveEventToken(decision));
  if (capability) parts.push(`Capability: ${humanizeAskLiveEventToken(capability)}`);
  if (routeLabel) parts.push(`Route: ${humanizeAskLiveEventToken(routeLabel)}`);
  if (sourceTarget) parts.push(`Source: ${humanizeAskLiveEventToken(sourceTarget)}`);
  if (event.fallback?.used) {
    parts.push(`Fallback rule: ${humanizeAskLiveEventToken(event.fallback.rule_id ?? "used")}`);
  }
  if (event.terminal?.selected_terminal_artifact_kind) {
    parts.push(`Selected ${humanizeAskLiveEventToken(event.terminal.selected_terminal_artifact_kind)}`);
  }
  if (Array.isArray(event.rejected) && event.rejected.length > 0) {
    const reasons = dedupeStrings(event.rejected.map((entry) => entry.reason)).slice(0, 3);
    parts.push(`Rejected: ${reasons.map(humanizeAskLiveEventToken).join(", ")}`);
  }
  if (reasonCode) parts.push(`Reason: ${humanizeAskLiveEventToken(reasonCode)}`);
  return parts.length ? clipText(parts.join(". "), 260) : humanizeAskLiveEventToken(event.stage);
}

export function buildHelixCausalTurnTraceRows(reply: HelixAskTranscriptReply): HelixTurnTranscriptRow[] {
  const timeline = readHelixCausalTurnTimeline(reply);
  if (!timeline) return [];
  return timeline.events
    .filter((event) => {
      if (!event || event.raw_content_included !== false || event.assistant_answer !== false) return false;
      return event.stage !== "prompt_received" && event.stage !== "debug_export_written";
    })
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => {
      const meta = [
        humanizeAskLiveEventToken(event.producer),
        humanizeAskLiveEventToken(event.stage),
        event.status ? humanizeAskLiveEventToken(event.status) : "",
        event.reason_code ? humanizeAskLiveEventToken(event.reason_code) : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return {
        key: `${reply.id}-causal-trace-${event.event_id || event.sequence}`,
        role: event.producer,
        label: readHelixCausalTraceLabel(event),
        text: readHelixCausalTraceText(event),
        meta,
        status: event.status ?? "succeeded",
      };
    });
}

function selectHelixTranscriptEventsForDisplay(
  events: Record<string, unknown>[],
  maxEvents: number,
): Record<string, unknown>[] {
  if (events.length <= maxEvents) return events;
  const proofEventTypes = new Set([
    "tool_request",
    "tool_observation",
    "action_request",
    "action_observation",
    "model_reentry",
    "lane_requested",
    "lane_backend_selected",
    "lane_observation",
    "lane_reentered",
    "terminal_selected",
    "terminal_rejected",
    "terminal_answer",
  ]);
  const proofIndexes = events.flatMap((event, index) => {
    const sourceEventType = coerceText(event.source_event_type).trim();
    const type = coerceText(event.type).trim();
    const status = coerceText(event.status).trim().toLowerCase();
    return proofEventTypes.has(sourceEventType) ||
      type === "final_answer" ||
      status === "failed" ||
      status === "blocked"
      ? [index]
      : [];
  });
  const keptIndexes = new Set(proofIndexes.slice(-maxEvents));
  for (let index = events.length - 1; index >= 0 && keptIndexes.size < maxEvents; index -= 1) {
    keptIndexes.add(index);
  }
  return events.filter((_, index) => keptIndexes.has(index));
}

export function buildHelixTurnTranscriptRows(reply: HelixAskTranscriptReply): HelixTurnTranscriptRow[] {
  const publicCommentaryRows = buildHelixPublicCommentaryTranscriptRows(reply);
  const transcriptEvents = resolveHelixTurnTranscriptEvents(reply);
  if (transcriptEvents.length > 0) {
    const visibleTranscriptEvents = transcriptEvents.filter((event) => {
        const type = String(event.type ?? "");
        const status = String(event.status ?? "");
        // Provider-native delta frames are transport fragments, not reasoning or
        // lifecycle steps. Rendering each token as a numbered row makes the
        // compact viewport look like an agent-step budget and can expose partial
        // serialization. Completed native events and governed milestones remain.
        if (isProviderNativeDeltaEvent(event)) return false;
        if (publicCommentaryRows.length > 0 && (type === "turn_completed" || type === "work_delta")) return false;
        if (publicCommentaryRows.length > 0 && type === "step_started") return false;
        return type !== "question" && type !== "turn_completed" && status !== "superseded";
      });
    const lifecycleRows = selectHelixTranscriptEventsForDisplay(
      visibleTranscriptEvents,
      13,
    )
      .map((event, index) => {
        const role = String(event.role ?? "agent");
        const type = String(event.type ?? "event");
        const status = String(event.status ?? "");
        const actionLabel = resolveHelixTranscriptActionLabel(event);
        const eventText = String(event.text ?? "");
        const rowText =
          actionLabel && !eventText.includes(actionLabel)
            ? `${actionLabel}: ${eventText || type}`
            : eventText;
        const sourceId = coerceText(event.source_id).trim();
        const panelId = coerceText(event.panel_id).trim();
        const regionId = coerceText(event.region_id).trim();
        const sourceHash = coerceText(event.source_hash).trim();
        const sourceKind = coerceText(event.source_kind).trim();
        const sourceTextHash = coerceText(event.source_text_hash ?? event.sourceTextHash).trim();
        const sourceTextCharCount = coerceText(
          event.source_text_char_count ?? event.sourceTextCharCount,
        ).trim();
        const sourceIdentityKey = coerceText(event.source_identity_key ?? event.sourceIdentityKey).trim();
        const latestSourceIdentityKey =
          coerceText(event.latest_source_identity_key ?? event.latestSourceIdentityKey).trim();
        const sourceProjectionTarget = coerceText(event.source_projection_target).trim();
        const accountLocale = coerceText(event.account_locale ?? event.latest_account_locale).trim();
        const capabilityId = coerceText(event.capability_id).trim();
        const requestedBackendProvider = coerceText(event.requested_backend_provider).trim();
        const selectedBackendProvider = coerceText(event.selected_backend_provider).trim();
        const fallbackBackendProvider = coerceText(event.fallback_backend_provider).trim();
        const backendSelectionReason =
          coerceText(event.selection_reason).trim() ||
          coerceText(event.backend_selection_reason).trim();
        const observationRef = coerceText(event.observation_ref).trim();
        const sessionControlKey = coerceText(event.session_control_key).trim();
        const sourceBindingKey = coerceText(event.source_binding_key).trim();
        const latestObservationKey = coerceText(event.latest_observation_key).trim();
        const latestMailLoopObservationKey = coerceText(event.latest_mail_loop_observation_key).trim();
        const goalBindingKey = coerceText(event.goal_binding_key).trim();
        const latestEventId = coerceText(event.latest_event_id).trim();
        const normalizedStage = coerceText(event.normalized_stage).trim();
        const stateLabel = coerceText(event.state_label).trim();
        const hasObservation = readTranscriptBoolean(event.has_observation);
        const observationLaneSessionId = coerceText(event.observation_lane_session_id).trim();
        const reportSummaryText = formatTranscriptMetaValue(coerceText(event.report_summary_text).trim());
        const quietBehaviorApplied = readTranscriptBoolean(event.quiet_behavior_applied);
        const wakeExpected = readTranscriptBoolean(event.wake_expected);
        const surfaceBadgeExpected = readTranscriptBoolean(event.surface_badge_expected);
        const terminalReportRequested = readTranscriptBoolean(event.terminal_report_requested);
        const terminalReportAuthorized = readTranscriptBoolean(event.terminal_report_authorized);
        const receiptRef = coerceText(event.receipt_ref).trim();
        const latestProjection = coerceText(event.latest_projection_target).trim();
        const latestChunk = coerceText(event.latest_chunk_id).trim();
        const latestDedupe = coerceText(event.latest_dedupe_key).trim();
        const latestSourceEvent = coerceText(event.latest_source_event_id).trim();
        const latestFreshness = coerceText(event.latest_freshness_status).trim();
        const wakeKind =
          coerceText(event.stage_play_wake_kind).trim() ||
          coerceText(event.latest_mail_loop_wake_kind).trim();
        const materializedMailLoopEvidence = readTranscriptBoolean(event.materialized_mail_loop_evidence);
        const targetLanguage = coerceText(event.target_language ?? event.latest_target_language).trim();
        const terminalAuthorityStatus = coerceText(event.terminal_authority_status).trim();
        const selectedRuntimeAgentProvider = coerceText(event.selected_runtime_agent_provider).trim();
        const laneVisible = readTranscriptBoolean(event.lane_visible);
        const laneRequested = readTranscriptBoolean(event.lane_requested);
        const laneExecuted = readTranscriptBoolean(event.lane_executed);
        const observationReentered = readTranscriptBoolean(event.observation_reentered);
        const reentryRequired = readTranscriptBoolean(event.reentry_required);
        const answerAuthority = readTranscriptBoolean(event.answer_authority);
        const terminalEligible = readTranscriptBoolean(event.terminal_eligible);
        const assistantAnswer = readTranscriptBoolean(event.assistant_answer);
        const rawContentIncluded = readTranscriptBoolean(event.raw_content_included);
        const adapterBoundary =
          coerceText(event.adapter_boundary).trim() ||
          (selectedRuntimeAgentProvider ? "helix_agent_provider_edge" : "");
        const latestCancelled = event.latest_cancel_requested === true;
        const sourceAudit = resolveHelixTranscriptSourceAudit(event);
        return {
          key: `${reply.id}-transcript-event-${index}`,
          role,
          label: resolveHelixTranscriptRowLabel(event),
          text: rowText,
          meta: [
            sourceAudit,
            String(event.lane ?? ""),
            String(event.step_id ?? ""),
            actionLabel ?? "",
            selectedRuntimeAgentProvider ? `runtime provider ${selectedRuntimeAgentProvider}` : "",
            adapterBoundary ? `adapter boundary ${adapterBoundary}` : "",
            capabilityId ? `capability ${capabilityId}` : "",
            requestedBackendProvider ? `requested backend ${requestedBackendProvider}` : "",
            selectedBackendProvider ? `backend ${selectedBackendProvider}` : "",
            fallbackBackendProvider ? `fallback backend ${fallbackBackendProvider}` : "",
            backendSelectionReason ? `selection reason ${backendSelectionReason}` : "",
            normalizedStage ? `normalized stage ${normalizedStage}` : "",
            stateLabel ? `state ${stateLabel}` : "",
            latestEventId ? `latest event ${latestEventId}` : "",
            hasObservation !== null ? `has observation ${String(hasObservation)}` : "",
            observationLaneSessionId ? `observation session ${observationLaneSessionId}` : "",
            reportSummaryText ? `report summary ${reportSummaryText}` : "",
            quietBehaviorApplied !== null ? `quiet behavior applied ${String(quietBehaviorApplied)}` : "",
            wakeExpected !== null ? `wake expected ${String(wakeExpected)}` : "",
            surfaceBadgeExpected !== null ? `surface badge expected ${String(surfaceBadgeExpected)}` : "",
            terminalReportRequested !== null ? `terminal report requested ${String(terminalReportRequested)}` : "",
            terminalReportAuthorized !== null ? `terminal report authorized ${String(terminalReportAuthorized)}` : "",
            observationRef ? `observation ${observationRef}` : "",
            receiptRef ? `receipt ${receiptRef}` : "",
            sourceId ? `source ${sourceId}` : "",
            panelId ? `panel ${panelId}` : "",
            regionId ? `region ${regionId}` : "",
            sourceHash ? `source hash ${sourceHash}` : "",
            sourceKind ? `source kind ${sourceKind}` : "",
            sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
            sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
            sourceIdentityKey ? `source identity key ${sourceIdentityKey}` : "",
            latestSourceIdentityKey ? `latest source identity key ${latestSourceIdentityKey}` : "",
            sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
            accountLocale ? `account locale ${accountLocale}` : "",
            sessionControlKey ? `session control key ${sessionControlKey}` : "",
            sourceBindingKey ? `source binding key ${sourceBindingKey}` : "",
            latestObservationKey ? `observation key ${latestObservationKey}` : "",
            latestMailLoopObservationKey ? `mail observation key ${latestMailLoopObservationKey}` : "",
            goalBindingKey ? `goal binding key ${goalBindingKey}` : "",
            latestProjection ? `projection ${latestProjection}` : "",
            latestChunk ? `chunk ${latestChunk}` : "",
            latestDedupe ? `dedupe ${latestDedupe}` : "",
            latestSourceEvent ? `source event ${latestSourceEvent}` : "",
            latestFreshness ? `freshness ${latestFreshness}` : "",
            wakeKind ? `wake kind ${wakeKind}` : "",
            materializedMailLoopEvidence !== null
              ? `materialized mail evidence ${String(materializedMailLoopEvidence)}`
              : "",
            targetLanguage ? `target ${targetLanguage}` : "",
            laneVisible !== null ? `lane visible ${String(laneVisible)}` : "",
            laneRequested !== null ? `lane requested ${String(laneRequested)}` : "",
            laneExecuted !== null ? `lane executed ${String(laneExecuted)}` : "",
            observationReentered !== null ? `observation re-entered ${String(observationReentered)}` : "",
            reentryRequired !== null ? `re-entry required ${String(reentryRequired)}` : "",
            answerAuthority !== null ? `answer authority ${String(answerAuthority)}` : "",
            terminalEligible !== null ? `terminal eligible ${String(terminalEligible)}` : "",
            terminalAuthorityStatus ? `terminal authority ${terminalAuthorityStatus}` : "",
            assistantAnswer !== null ? `assistant answer ${String(assistantAnswer)}` : "",
            rawContentIncluded !== null ? `raw content included ${String(rawContentIncluded)}` : "",
            latestCancelled ? "cancelled" : "",
            status,
          ]
            .filter(Boolean)
            .join(" | "),
          status,
        };
      });
    const rowsWithFinal =
      lifecycleRows.some((row) => row.label === "Final") || !String(reply.content ?? "").trim()
        ? lifecycleRows
        : [
            ...lifecycleRows,
            {
              key: `${reply.id}-transcript-content-final`,
              role: "agent",
              label: "Final",
              text: String(reply.content ?? "").trim(),
              meta: "",
              status: "completed",
            },
          ];
    if (publicCommentaryRows.length > 0) {
      const lifecycleWithoutGenericCompletions = rowsWithFinal.filter((row) =>
        !/^Completed step\b/i.test(row.text),
      );
      return [...publicCommentaryRows, ...lifecycleWithoutGenericCompletions].slice(-14);
    }
    return rowsWithFinal.slice(-14);
  }
  if (publicCommentaryRows.length > 0) return publicCommentaryRows.slice(-14);
  const plannerContract = readAgentLoopAuditRecord(reply.debug?.planner_contract);
  const runtimeSummary = readAgentLoopAuditRecord(reply.debug?.turn_runtime);
  const planItems = Array.isArray(plannerContract?.plan_items) ? plannerContract.plan_items : [];
  const observations = Array.isArray(runtimeSummary?.observations) ? runtimeSummary.observations : [];
  const rows: HelixTurnTranscriptRow[] = [];
  planItems.slice(0, 4).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    rows.push({
      key: `${reply.id}-fallback-plan-${index}`,
      role: "agent",
      label: "Plan",
      text: String(record?.title ?? record?.id ?? "planned step"),
      meta: `${String(record?.lane ?? "step")} | ${String(record?.status ?? "planned")}`,
      status: String(record?.status ?? "planned"),
    });
  });
  observations.slice(-6).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    const actualArtifacts = Array.isArray(record?.actual_artifacts)
      ? (record.actual_artifacts as unknown[]).map((entry) => String(entry)).filter(Boolean).join(", ")
      : "";
    rows.push({
      key: `${reply.id}-fallback-observation-${index}`,
      role: "tool",
      label: "Observation",
      text: actualArtifacts || String(record?.step_id ?? "step result"),
      meta: `${String(record?.lane ?? "step")} | ${String(record?.status ?? "completed")}`,
      status: String(record?.status ?? "completed"),
    });
  });
  return rows;
}

export function isDurableHelixAskMailTranscriptGroup(
  entries: StagePlayLiveSourceMailTranscriptEntryV1[],
): boolean {
  if (!entries.length) return false;
  return entries.some((entry) => {
    const row = entry.row;
    switch (row.rowKind) {
      case "final_answer":
      case "terminal_answer":
      case "typed_failure":
      case "text_answer":
        return true;
      default:
        return false;
    }
  });
}
