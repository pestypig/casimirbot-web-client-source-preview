import {
  formatHelixVisibleTerminalSourceLabel,
  normalizeFinalAnswerSourceForTerminalKind,
  resolveHelixVisibleTerminal as resolveHelixVisibleTerminalCore,
} from "@/lib/helix/resolveHelixVisibleTerminal";

const HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE = "backend_ask_entry_required";
const HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT =
  "This prompt requires the backend Ask solver path before a final answer can be shown.";
const HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_ERROR_CODE = "backend_debug_materialization";
const HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_TEXT =
  "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.";

type RecordLike = Record<string, unknown>;

export type HelixAskTerminalProjectionReply = RecordLike & {
  id: string;
  turn_id?: unknown;
  ok?: boolean;
  debug?: unknown;
  content?: unknown;
  text?: unknown;
  assistant_answer?: unknown;
  liveEvents?: unknown[];
};

export type VisibleResolvedTurn = {
  active_turn_id: string;
  primary_route_label: string;
  primary_terminal_label: "final_answer" | "final_failure" | "pending_input";
  primary_source_label: string;
  selected_final_answer: string;
  terminal_error_code?: string | null;
  pending_server_request_present: boolean;
};

export type HelixAskFinalAnswerPresentation = {
  heading: "Final answer" | "Checkpoint receipt";
  sourceLabel: string | null;
  isDeterministicReceiptFallback: boolean;
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

function readAgentLoopAuditRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function readAgentLoopAuditArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isBackendEntrypointFailureText(value: unknown): boolean {
  const text = coerceText(value).trim();
  return text === HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT || text === HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_TEXT;
}

function isProviderInstructionEchoFailureText(value: unknown): boolean {
  const normalized = normalizeTerminalAnswerText(coerceText(value));
  if (!normalized) return false;
  return (
    /runtime provider echoed Helix internal capability instructions/i.test(normalized) ||
    /No visual observation receipt was produced for this turn/i.test(normalized)
  );
}

function isConceptualToolExplanationWithoutExecution(value: unknown): boolean {
  const text = coerceText(value).trim();
  if (!text) return false;
  const asksForConcept =
    /\b(?:what\s+is|what\s+does|explain|describe|define|meaning\s+of|looks?\s+like)\b/i.test(text);
  const referencesToolOrCapability =
    /\b(?:tool|capability|identifier|namespace|function|action|moral\s+graph\s+reflection|moral\s+graph\s+tool|internet[-_.\s]?search|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|scholarly[-_.\s]?research)\b/i.test(text);
  const suppressesExecution =
    /\b(?:do\s+not|don't|dont|without|not\s+to|no\s+need\s+to)\b[\s\S]{0,80}\b(?:run|execute|call|use|browse|search|open|inspect|reflect)\b/i.test(text) ||
    /\b(?:conceptually|plain\s+english|just\s+explain|only\s+explain)\b/i.test(text);
  const affirmativeExecution =
    /\b(?:use|run|execute|call|open|search|browse|inspect|reflect\s+on|reflect\s+with|through|via)\s+(?:only\s+)?(?:the\s+)?(?:moral\s+graph|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|internet\s+search|scholarly\s+research)\b/i.test(text);
  return asksForConcept && referencesToolOrCapability && suppressesExecution && !affirmativeExecution;
}

function isHardBackendEntrypointPrompt(value: unknown): boolean {
  const text = coerceText(value);
  if (!text) return false;
  if (isConceptualToolExplanationWithoutExecution(text)) return false;
  return /\b(?:moral-graph\.[a-z0-9_.-]+|(?:use|with|through|via)\s+(?:only\s+)?(?:the\s+)?moral\s+graph\b[\s\S]{0,160}\b(?:reflect|reflection|case|situation|dependency|repair|boundary|agency|badge|lens|roommate))\b/i.test(text);
}

function hasMaterializedBackendEntrypointTerminal(
  replyRecord: RecordLike | null,
  debugRecord: RecordLike | null,
): boolean {
  return Boolean(readMaterializedBackendEntrypointTerminalText(replyRecord, debugRecord));
}

function hasBackendEntrypointMaterializationSignal(
  replyRecord: RecordLike | null,
  debugRecord: RecordLike | null,
): boolean {
  for (const record of [replyRecord, debugRecord]) {
    if (!record) continue;
    const terminalAuthority = readAgentLoopAuditRecord(record.terminal_answer_authority);
    if (terminalAuthority?.server_authoritative === true) return true;
    const terminalResult = readAgentLoopAuditRecord(record.terminal_result);
    if (terminalResult?.terminal_authority_ok === true || terminalResult?.route_authority_ok === true) return true;
    const terminalResults = readAgentLoopAuditArray(record.terminal_results);
    if (terminalResults.some((entry) => {
      const result = readAgentLoopAuditRecord(entry);
      return result?.terminal_authority_ok === true || result?.route_authority_ok === true;
    })) {
      return true;
    }
    const artifactLedger = readAgentLoopAuditArray(record.current_turn_artifact_ledger);
    if (artifactLedger.some((entry) => {
      const artifact = readAgentLoopAuditRecord(entry);
      const kind = coerceText(artifact?.kind ?? artifact?.artifact_kind ?? artifact?.terminal_artifact_kind).trim();
      return kind === "workstation_tool_evaluation" || kind === "model_synthesized_answer";
    })) {
      return true;
    }
  }
  return false;
}

function readMaterializedBackendEntrypointTerminalText(
  replyRecord: RecordLike | null,
  debugRecord: RecordLike | null,
): string {
  if (!hasBackendEntrypointMaterializationSignal(replyRecord, debugRecord)) return "";
  const summary =
    readAgentLoopAuditRecord(replyRecord?.resolved_turn_summary) ??
    readAgentLoopAuditRecord(debugRecord?.resolved_turn_summary);
  const uiDebugParityHarness =
    readAgentLoopAuditRecord(replyRecord?.ui_debug_parity_harness) ??
    readAgentLoopAuditRecord(debugRecord?.ui_debug_parity_harness);
  const visibleFinalAnswer = coerceText(uiDebugParityHarness?.visible_final_answer).trim();
  const summaryTerminalKind = coerceText(summary?.terminal_artifact_kind).trim();
  const summaryFinalStatus = coerceText(summary?.final_status).trim();
  const materialized =
    (summaryTerminalKind === "workstation_tool_evaluation" || summaryTerminalKind === "model_synthesized_answer") &&
    summaryFinalStatus !== "typed_failure" &&
    Boolean(visibleFinalAnswer) &&
    !isBackendEntrypointFailureText(visibleFinalAnswer);
  return materialized ? visibleFinalAnswer : "";
}

function readStructuredWorkstationFinalText(...sources: unknown[]): string {
  for (const source of sources) {
    const record = readAgentLoopAuditRecord(source);
    if (!record) continue;
    for (const candidate of [
      record.selected_final_answer,
      record.assistant_answer,
      record.answer,
      record.text,
      record.content,
    ]) {
      const text = coerceText(candidate).trim();
      if (text && !isBackendEntrypointFailureText(text) && !isInvalidTerminalAnswerText(text)) return text;
    }
  }
  return "";
}

function hasStructuredSuccessfulWorkstationGatewayEvidence(...sources: unknown[]): boolean {
  for (const source of sources) {
    const record = readAgentLoopAuditRecord(source);
    if (!record) continue;
    const debug = readAgentLoopAuditRecord(record.debug);
    const agentLoop = readAgentLoopAuditRecord(record.agent_loop ?? record.agentLoop ?? debug?.agent_loop ?? debug?.agentLoop);
    const callResults = [
      ...readAgentLoopAuditArray(record.workstation_gateway_call_results),
      ...readAgentLoopAuditArray(debug?.workstation_gateway_call_results),
      ...readAgentLoopAuditArray(agentLoop?.workstation_gateway_call_results),
    ];
    if (callResults.some((entry) => {
      const result = readAgentLoopAuditRecord(entry);
      if (!result || result.ok !== true) return false;
      const observationPacket = readAgentLoopAuditRecord(result.observation_packet);
      const observationStatus = coerceText(observationPacket?.status ?? result.status).trim().toLowerCase();
      return !observationStatus || observationStatus === "succeeded" || observationStatus === "completed";
    })) {
      return true;
    }
    const observationPackets = [
      ...readAgentLoopAuditArray(record.workstation_gateway_observation_packets),
      ...readAgentLoopAuditArray(debug?.workstation_gateway_observation_packets),
      ...readAgentLoopAuditArray(agentLoop?.workstation_gateway_observation_packets),
    ];
    if (observationPackets.some((entry) => {
      const packet = readAgentLoopAuditRecord(entry);
      const status = coerceText(packet?.status).trim().toLowerCase();
      return Boolean(packet) && (status === "succeeded" || status === "completed");
    })) {
      return true;
    }
  }
  return false;
}

export function normalizeTerminalAnswerText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function isInvalidTerminalAnswerText(value: string | null | undefined): boolean {
  const normalized = normalizeTerminalAnswerText(value);
  if (!normalized) return true;
  return (
    isProviderInstructionEchoFailureText(normalized) ||
    /^no final answer returned\.?$/i.test(normalized) ||
    /^I could not produce a substantive direct answer for this background-only turn\.?$/i.test(normalized) ||
    /^I couldn't produce a final answer for that turn\. Please retry once\.?$/i.test(normalized) ||
    /^I need retrieval before finalizing this claim\. I do not yet have grounded evidence references for it\.?$/i.test(normalized)
  );
}

function readHelixPendingInputRecord(value: unknown): RecordLike | null {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return null;
  const status = coerceText(record.status ?? record.state ?? record.resolution_status).trim().toLowerCase();
  if (status === "resolved" || status === "cancelled" || status === "canceled" || status === "superseded") {
    return null;
  }
  const requestId = coerceText(record.request_id ?? record.requestId ?? record.id).trim();
  const prompt = coerceText(record.prompt ?? record.message ?? record.text ?? record.question).trim();
  const requiredFieldsCandidate = record.required_fields ?? record.requiredFields;
  const requiredFields = Array.isArray(requiredFieldsCandidate) ? requiredFieldsCandidate : [];
  if (requestId || prompt || requiredFields.length > 0 || record.kind === "request_user_input") return record;
  return null;
}

const readHelixResolvedTurnSummary = (reply?: HelixAskTerminalProjectionReply | null): RecordLike | null => {
  const record = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply?.debug);
  const turnTruthTable = readAgentLoopAuditRecord(record?.turn_truth_table ?? debugRecord?.turn_truth_table);
  return readAgentLoopAuditRecord(record?.resolved_turn_summary ?? debugRecord?.resolved_turn_summary ?? turnTruthTable?.resolved_turn_summary);
};

const readHelixCanonicalGoalKind = (reply?: HelixAskTerminalProjectionReply | null): string => {
  const record = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply?.debug);
  const canonical = readAgentLoopAuditRecord(record?.canonical_goal_frame ?? debugRecord?.canonical_goal_frame);
  return coerceText(canonical?.goal_kind).trim() || "unknown";
};

export const readHelixTopLevelPendingServerRequest = (
  reply?: HelixAskTerminalProjectionReply | null,
): RecordLike | null => {
  const record = readAgentLoopAuditRecord(reply);
  return readHelixPendingInputRecord(record?.pending_server_request);
};

const readLatestAuthoritativeFinalLiveEventText = (reply?: HelixAskTerminalProjectionReply | null): string | null => {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply?.debug);
  const auditRecord = readAgentLoopAuditRecord(debugRecord?.agent_loop_audit);
  const events = [
    ...(Array.isArray(reply?.liveEvents) ? reply.liveEvents : []),
    ...(Array.isArray(replyRecord?.live_events) ? replyRecord.live_events : []),
    ...(Array.isArray(debugRecord?.live_events) ? debugRecord.live_events : []),
    ...(Array.isArray(debugRecord?.turn_transcript_events) ? debugRecord.turn_transcript_events : []),
    ...(Array.isArray(auditRecord?.turn_transcript_events) ? auditRecord.turn_transcript_events : []),
  ];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = readAgentLoopAuditRecord(events[index]);
    if (!event || typeof event !== "object") continue;
    const rawText = coerceText(event.text).trim();
    const tool = coerceText(event.tool).trim().toLowerCase();
    const type = coerceText(event.type).trim().toLowerCase();
    const meta = readAgentLoopAuditRecord(event.meta);
    const stage = coerceText(meta?.stage ?? meta?.event_stage).trim().toLowerCase();
    const status = coerceText(meta?.status ?? meta?.terminal_status).trim().toLowerCase();
    const isFinalEvent =
      tool === "final" ||
      type === "final_answer" ||
      stage === "final_answer" ||
      status === "final_answer" ||
      /\bfinal_answer\b/i.test(coerceText(event.id)) ||
      /^Final:\s*/i.test(rawText);
    if (!isFinalEvent) continue;
    const text = rawText.replace(/^Final:\s*/i, "").trim();
    if (text && !isInvalidTerminalAnswerText(text)) return text;
  }
  return null;
};

const normalizeVisibleDocPath = (value: string): string | null => {
  const path = value.trim().replace(/:(?:L)?\d+(?:-L?\d+)?$/i, "");
  return path.startsWith("/") ? path : null;
};

const renderDocOpenTerminalFromLocationText = (args: {
  text: string;
  goalKind: string;
  terminalKind: string;
}): string | null => {
  if (args.terminalKind !== "doc_open_receipt") return null;
  if (args.goalKind !== "latest_doc_navigation" && args.goalKind !== "doc_open_best") return null;
  if (!/^\s*Locations?:/i.test(args.text)) return null;
  const pathMatch = args.text.match(/\bPath:\s*(\/[^\s]+?\.md)(?::L?\d+(?:-L?\d+)?)?/i);
  const path = pathMatch?.[1] ? normalizeVisibleDocPath(pathMatch[1]) : null;
  if (!path) return null;
  const titleMatch = args.text.match(/^\s*-\s+(.+?),\s+L\d+/m);
  const title = titleMatch?.[1]?.trim() || path.split(/[\\/]/).pop() || path;
  const heading = args.goalKind === "latest_doc_navigation" ? "Opened latest verified document:" : "Opened document:";
  return [heading, "Document:", `- ${title}`, `  Path: ${path}`].join("\n");
};

export const renderLiveAnswerEnvironmentContextPackAnswer = (contextPack: unknown): string | null => {
  const pack = readAgentLoopAuditRecord(contextPack);
  const environment = readAgentLoopAuditRecord(pack?.live_answer_environment);
  if (!environment) return null;
  const summary = coerceText(environment.latest_summary).trim();
  const utilityHypotheses = Array.isArray(pack?.utility_hypotheses) ? pack.utility_hypotheses : [];
  const utilityLines = utilityHypotheses
    .map((entry) => readAgentLoopAuditRecord(entry))
    .slice(-3)
    .map((hypothesis) => {
      const utilityLabel = coerceText(hypothesis?.utility_label).trim();
      if (!utilityLabel) return "";
      const status = coerceText(hypothesis?.status).trim() || "unknown";
      const confidence = typeof hypothesis?.confidence === "number" && Number.isFinite(hypothesis.confidence)
        ? `confidence ${hypothesis.confidence.toFixed(2)}`
        : "confidence unknown";
      const displayLabel = utilityLabel.replace(new RegExp(`^${status}\\s+`, "i"), "");
      return `Hypothesis: ${status} ${displayLabel} (${confidence}).`;
    })
    .filter(Boolean);
  const missingEvidence = Array.isArray(pack?.missing_evidence_notes)
    ? pack.missing_evidence_notes.map((entry) => coerceText(entry).trim()).filter(Boolean).slice(0, 6)
    : [];
  const missingEvidenceLines = missingEvidence.length > 0
    ? [`Missing evidence: ${missingEvidence.join("; ")}.`]
    : [];
  const semanticConfidence = Array.isArray(pack?.semantic_confidence_ladder)
    ? pack.semantic_confidence_ladder.map((entry) => coerceText(entry).trim()).filter(Boolean).slice(-3)
    : [];
  const semanticLines = semanticConfidence.length > 0
    ? [`Semantic confidence: ${semanticConfidence.join("; ")}.`]
    : [];
  const lines = Array.isArray(environment.lines) ? environment.lines : [];
  const renderedLines = lines
    .map((line) => readAgentLoopAuditRecord(line))
    .filter((line): line is RecordLike => Boolean(line && line.visibility === "answer_card"))
    .map((line) => {
      const label = coerceText(line.label).trim() || coerceText(line.key).trim() || "Line";
      const value = coerceText(line.value).trim();
      return value ? `${label}: ${value}` : "";
    })
    .filter(Boolean);
  const text = [summary, ...utilityLines, ...missingEvidenceLines, ...semanticLines, ...renderedLines]
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
};

export const renderTypedFailureFallback = (code?: string | null): string => {
  const normalized = coerceText(code).trim();
  if (normalized === "synthesis_unavailable") {
    return "I found candidate evidence, but no current-turn synthesis artifact answered the requested conclusion.\nCause: synthesis_unavailable.";
  }
  if (normalized === "equation_source_unavailable") {
    return "I looked for an equation-bearing source, but no current-turn equation artifact satisfied the source contract.\nCause: equation_source_unavailable.";
  }
  if (normalized === HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_ERROR_CODE) {
    return HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_TEXT;
  }
  if (normalized === HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE) {
    return HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT;
  }
  return normalized ? `I could not complete that turn.\nCause: ${normalized}.` : "I could not complete that turn.";
};

export function buildVisibleResolvedTurn(reply: HelixAskTerminalProjectionReply): VisibleResolvedTurn {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const terminalAuthorityRecord =
    readAgentLoopAuditRecord(replyRecord?.terminal_answer_authority) ??
    readAgentLoopAuditRecord(debugRecord?.terminal_answer_authority);
  const terminalAuthorityTrusted =
    terminalAuthorityRecord?.schema === "helix.turn_terminal_authority.v1" &&
    terminalAuthorityRecord.server_authoritative === true;
  const summary = readHelixResolvedTurnSummary(reply);
  const askEntrypointRequired =
    readBoolean(replyRecord?.ask_entrypoint_required) ??
    readBoolean(debugRecord?.ask_entrypoint_required) ??
    isHardBackendEntrypointPrompt(reply.question ?? replyRecord?.question ?? debugRecord?.active_prompt);
  const askEntrypointObserved =
    readBoolean(replyRecord?.ask_entrypoint_observed) ??
    readBoolean(debugRecord?.ask_entrypoint_observed);
  const hardBackendPrompt = isHardBackendEntrypointPrompt(reply.question ?? replyRecord?.question ?? debugRecord?.active_prompt);
  if (
    askEntrypointRequired &&
    (askEntrypointObserved === false || (hardBackendPrompt && askEntrypointObserved !== true)) &&
    !hasMaterializedBackendEntrypointTerminal(replyRecord, debugRecord)
  ) {
    return {
      active_turn_id: coerceText(reply.turn_id).trim() || coerceText(summary?.turn_id).trim() || reply.id,
      primary_route_label: "backend_ask_entrypoint / typed_failure",
      primary_terminal_label: "final_failure",
      primary_source_label: "typed failure",
      selected_final_answer: HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
      terminal_error_code:
        coerceText(replyRecord?.ask_entrypoint_failure_code).trim() ||
        coerceText(debugRecord?.ask_entrypoint_failure_code).trim() ||
        HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
      pending_server_request_present: false,
    };
  }
  const terminalResolution = resolveHelixVisibleTerminalCore(reply);
  const materializedBackendEntrypointTerminalText = readMaterializedBackendEntrypointTerminalText(
    replyRecord,
    debugRecord,
  );
  const structuredWorkstationGatewaySuccess = hasStructuredSuccessfulWorkstationGatewayEvidence(replyRecord, debugRecord);
  const structuredWorkstationFinalText = structuredWorkstationGatewaySuccess
    ? readStructuredWorkstationFinalText(replyRecord, debugRecord, reply)
    : "";
  const terminalResolutionIsFinalAnswer =
    Boolean(terminalResolution.backendTerminalText) &&
    terminalResolution.source !== "typed_failure" &&
    terminalResolution.source !== "terminal_authority_missing" &&
    terminalResolution.finalAnswerSource !== "typed_failure" &&
    terminalResolution.finalAnswerSource !== "request_user_input" &&
    terminalResolution.terminalKind !== "failure" &&
    terminalResolution.terminalKind !== "request_user_input" &&
    terminalResolution.terminalArtifactKind !== "typed_failure";
  const terminalIsFinalAnswer =
    terminalResolutionIsFinalAnswer ||
    Boolean(structuredWorkstationFinalText) ||
    Boolean(materializedBackendEntrypointTerminalText);
  const pendingRequest = readHelixTopLevelPendingServerRequest(reply);
  const pendingPresent = Boolean(pendingRequest) && !terminalIsFinalAnswer;
  const statusCandidate =
    terminalIsFinalAnswer
      ? "final_answer"
      : terminalResolution.terminalErrorCode
      ? "final_failure"
      : coerceText(summary?.final_status).trim() ||
        coerceText(readAgentLoopAuditRecord(replyRecord?.satisfaction_report ?? debugRecord?.satisfaction_report)?.terminal_kind).trim() ||
        (pendingPresent ? "pending_input" : reply.ok === false ? "final_failure" : "final_answer");
  const normalizedStatus: VisibleResolvedTurn["primary_terminal_label"] =
    statusCandidate === "pending_input" && pendingPresent
      ? "pending_input"
      : statusCandidate === "final_failure" || (statusCandidate === "pending_input" && !pendingPresent)
        ? "final_failure"
        : "final_answer";
  const terminalErrorCode =
    terminalIsFinalAnswer
      ? null
      : terminalResolution.terminalErrorCode ||
        coerceText(replyRecord?.terminal_error_code).trim() ||
        coerceText(debugRecord?.terminal_error_code).trim() ||
        coerceText(summary?.terminal_error_code).trim() ||
        (
          !pendingPresent &&
          reply.ok !== false &&
          !terminalAuthorityTrusted &&
          (
            coerceText(replyRecord?.selected_final_answer).trim() ||
            coerceText(debugRecord?.selected_final_answer).trim() ||
            coerceText(reply.assistant_answer).trim() ||
            coerceText(reply.text).trim() ||
            coerceText(reply.content).trim()
          )
            ? "terminal_authority_missing"
            : null
        );
  const explicitFinalAnswerSource =
    coerceText(terminalResolution.finalAnswerSource).trim() ||
    coerceText(replyRecord?.final_answer_source).trim() ||
    coerceText(debugRecord?.final_answer_source).trim() ||
    coerceText(terminalAuthorityRecord?.final_answer_source).trim();
  const finalAnswerSource =
    ((structuredWorkstationFinalText || materializedBackendEntrypointTerminalText) &&
    explicitFinalAnswerSource === "typed_failure"
      ? "workstation_tool_evaluation"
      : explicitFinalAnswerSource) ||
    (terminalErrorCode ? "typed_failure" : "unknown");
  const explicitTypedFailureSignal =
    !structuredWorkstationGatewaySuccess &&
    (
      explicitFinalAnswerSource === "typed_failure" ||
      terminalResolution.terminalKind === "failure" ||
      terminalResolution.terminalArtifactKind === "typed_failure" ||
      coerceText(summary?.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(replyRecord?.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(debugRecord?.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(terminalAuthorityRecord?.terminal_artifact_kind).trim() === "typed_failure"
    );
  const isTypedFailure = finalAnswerSource === "typed_failure" || Boolean(terminalErrorCode);
  const liveFinalAnswer = readLatestAuthoritativeFinalLiveEventText(reply);
  const terminalAuthorityText = coerceText(terminalAuthorityRecord?.terminal_text_preview).trim();
  const typedFailureRecord =
    readAgentLoopAuditRecord(replyRecord?.typed_failure) ??
    readAgentLoopAuditRecord(debugRecord?.typed_failure);
  const selectedTypedFailureAnswer =
    explicitTypedFailureSignal
      ? (
          coerceText(replyRecord?.selected_final_answer).trim() ||
          coerceText(debugRecord?.selected_final_answer).trim() ||
          coerceText(typedFailureRecord?.answer_text).trim() ||
          coerceText(typedFailureRecord?.text).trim() ||
          coerceText(replyRecord?.terminal_failure_text).trim() ||
          coerceText(debugRecord?.terminal_failure_text).trim()
        )
      : "";
  const selectedFinalAnswerCandidate =
    isTypedFailure
      ? selectedTypedFailureAnswer || terminalAuthorityText || terminalResolution.text || renderTypedFailureFallback(terminalErrorCode)
      : terminalAuthorityTrusted && terminalAuthorityText
        ? terminalAuthorityText
        : "";
  const canonicalGoalKind = readHelixCanonicalGoalKind(reply);
  const terminalArtifactKind =
    (structuredWorkstationFinalText || materializedBackendEntrypointTerminalText) &&
    (
      terminalResolution.terminalArtifactKind === "typed_failure" ||
      coerceText(summary?.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(replyRecord?.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(debugRecord?.terminal_artifact_kind).trim() === "typed_failure"
    )
      ? "workstation_tool_evaluation"
      : coerceText(terminalResolution.terminalArtifactKind).trim() ||
    coerceText(summary?.terminal_artifact_kind).trim() ||
    coerceText(replyRecord?.terminal_artifact_kind).trim() ||
    coerceText(debugRecord?.terminal_artifact_kind).trim() ||
    coerceText(terminalAuthorityRecord?.terminal_artifact_kind).trim();
  const effectiveFinalAnswerSource =
    normalizeFinalAnswerSourceForTerminalKind(finalAnswerSource, terminalArtifactKind) ??
    finalAnswerSource;
  const situationContextAnswer =
    effectiveFinalAnswerSource === "artifact_synthesis" && terminalArtifactKind === "situation_context_pack"
      ? (
          coerceText(replyRecord?.assistant_answer).trim() ||
          coerceText(replyRecord?.answer).trim() ||
          coerceText(replyRecord?.text).trim() ||
          liveFinalAnswer
        )
      : "";
  const canonicalSelectedFinalAnswer =
    !isTypedFailure && terminalArtifactKind === "model_synthesized_answer" && effectiveFinalAnswerSource === "final_answer_draft"
      ? (
          coerceText(replyRecord?.selected_final_answer).trim() ||
          coerceText(debugRecord?.selected_final_answer).trim()
        )
      : "";
  const selectedFinalAnswerRaw =
    materializedBackendEntrypointTerminalText
      ? materializedBackendEntrypointTerminalText
      : structuredWorkstationFinalText
      ? structuredWorkstationFinalText
      : terminalResolutionIsFinalAnswer
      ? terminalResolution.text
      : canonicalSelectedFinalAnswer
      ? canonicalSelectedFinalAnswer
      : isTypedFailure
        ? selectedFinalAnswerCandidate
      : terminalResolution.text &&
    terminalResolution.source !== "legacy_shadow" &&
    terminalResolution.source !== "empty" &&
    terminalResolution.source !== "typed_failure"
      ? terminalResolution.text
      : terminalResolution.source === "typed_failure"
      ? terminalResolution.text
      : situationContextAnswer
        ? situationContextAnswer
      : !isTypedFailure && liveFinalAnswer && isInvalidTerminalAnswerText(selectedFinalAnswerCandidate)
      ? liveFinalAnswer
      : selectedFinalAnswerCandidate;
  const selectedFinalAnswer =
    pendingPresent
      ? ""
      : renderDocOpenTerminalFromLocationText({
        text: selectedFinalAnswerRaw,
        goalKind: canonicalGoalKind,
        terminalKind: terminalArtifactKind,
      }) ?? selectedFinalAnswerRaw;
  const summaryRouteLabel = coerceText(summary?.resolved_route_label).trim();
  const routeLabel =
    terminalArtifactKind === "workstation_tool_evaluation" && /model_synthesized_answer/i.test(summaryRouteLabel)
      ? `${canonicalGoalKind} / workstation_tool_evaluation`
      : summaryRouteLabel || `${canonicalGoalKind} / ${effectiveFinalAnswerSource}`;
  return {
    active_turn_id: coerceText(reply.turn_id).trim() || coerceText(summary?.turn_id).trim() || reply.id,
    primary_route_label: routeLabel,
    primary_terminal_label: normalizedStatus,
    primary_source_label: formatHelixVisibleTerminalSourceLabel({
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
    }),
    selected_final_answer: selectedFinalAnswer,
    terminal_error_code: terminalErrorCode,
    pending_server_request_present: pendingPresent,
  };
}

export function chooseVisibleFinalText(reply: HelixAskTerminalProjectionReply): string {
  const visible = buildVisibleResolvedTurn(reply);
  const replyRecord = readAgentLoopAuditRecord(reply);
  if (visible.primary_source_label.replace(/\s+/g, "_") === "typed_failure" || visible.terminal_error_code) {
    return visible.selected_final_answer || renderTypedFailureFallback(visible.terminal_error_code);
  }
  if (!visible.selected_final_answer && replyRecord?.ok === false) {
    return renderTypedFailureFallback("terminal_authority_missing");
  }
  return visible.selected_final_answer || "";
}

export function resolveHelixAskVisibleJobReadyLinks(reply: unknown): RecordLike[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(replyRecord?.debug);
  const summary =
    readAgentLoopAuditRecord(replyRecord?.resolved_turn_summary) ??
    readAgentLoopAuditRecord(debugRecord?.resolved_turn_summary);
  const terminalAuthority =
    readAgentLoopAuditRecord(replyRecord?.terminal_answer_authority) ??
    readAgentLoopAuditRecord(debugRecord?.terminal_answer_authority);
  const finalAnswerSource =
    coerceText(replyRecord?.final_answer_source).trim() ||
    coerceText(debugRecord?.final_answer_source).trim() ||
    coerceText(terminalAuthority?.final_answer_source).trim();
  const terminalArtifactKind =
    coerceText(replyRecord?.terminal_artifact_kind).trim() ||
    coerceText(debugRecord?.terminal_artifact_kind).trim() ||
    coerceText(summary?.terminal_artifact_kind).trim() ||
    coerceText(terminalAuthority?.terminal_artifact_kind).trim();
  const terminalErrorCode =
    coerceText(replyRecord?.terminal_error_code).trim() ||
    coerceText(debugRecord?.terminal_error_code).trim() ||
    coerceText(summary?.terminal_error_code).trim();
  const finalStatus =
    coerceText(replyRecord?.final_status).trim() ||
    coerceText(debugRecord?.final_status).trim() ||
    coerceText(summary?.final_status).trim();
  const isFailureTerminal =
    finalAnswerSource === "typed_failure" ||
    terminalArtifactKind === "typed_failure" ||
    finalStatus === "final_failure" ||
    Boolean(terminalErrorCode);
  if (isFailureTerminal) return [];
  const rawLinks = Array.isArray(debugRecord?.job_ready_links)
    ? debugRecord.job_ready_links
    : Array.isArray(replyRecord?.job_ready_links)
      ? replyRecord.job_ready_links
      : [];
  return rawLinks
    .map((entry) => readAgentLoopAuditRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry?.panel_id && entry?.action_id));
}

const readTerminalAnswerAuthorityRecord = (value: unknown): RecordLike | null => {
  const record = readAgentLoopAuditRecord(value);
  return record?.schema === "helix.turn_terminal_authority.v1" && record.server_authoritative === true
    ? record
    : null;
};

const readTerminalSourceLabelCandidate = (
  record: RecordLike | null | undefined,
  fallbackFinalAnswerSource?: string | null,
): string | null => {
  const terminalKind =
    typeof record?.terminal_artifact_kind === "string" && record.terminal_artifact_kind.trim()
      ? record.terminal_artifact_kind.trim()
      : typeof record?.selected_terminal_artifact_kind === "string" && record.selected_terminal_artifact_kind.trim()
        ? record.selected_terminal_artifact_kind.trim()
      : null;
  const recordSource =
    typeof record?.final_answer_source === "string" && record.final_answer_source.trim()
      ? record.final_answer_source.trim()
      : typeof record?.source === "string" && record.source.trim()
        ? record.source.trim()
      : null;
  if (!terminalKind && !recordSource) return null;
  return formatHelixVisibleTerminalSourceLabel({
    terminalArtifactKind: terminalKind,
    finalAnswerSource: normalizeFinalAnswerSourceForTerminalKind(recordSource ?? fallbackFinalAnswerSource ?? null, terminalKind),
  });
};

export function readHelixAskFinalAnswerSourceLabel(...sources: unknown[]): string | null {
  const structuredWorkstationGatewaySuccess = hasStructuredSuccessfulWorkstationGatewayEvidence(...sources);
  const structuredWorkstationFinalText = structuredWorkstationGatewaySuccess
    ? readStructuredWorkstationFinalText(...sources)
    : "";
  const hasStaleTypedFailureSource = sources.some((source) => {
    const record = readAgentLoopAuditRecord(source);
    if (!record) return false;
    return (
      coerceText(record.final_answer_source).trim() === "typed_failure" ||
      coerceText(record.terminal_artifact_kind).trim() === "typed_failure" ||
      coerceText(readAgentLoopAuditRecord(record.debug)?.final_answer_source).trim() === "typed_failure" ||
      coerceText(readAgentLoopAuditRecord(record.debug)?.terminal_artifact_kind).trim() === "typed_failure"
    );
  });
  if (structuredWorkstationGatewaySuccess && structuredWorkstationFinalText && hasStaleTypedFailureSource) {
    return formatHelixVisibleTerminalSourceLabel({
      terminalArtifactKind: "workstation_tool_evaluation",
      finalAnswerSource: "workstation_tool_evaluation",
    });
  }
  for (const source of sources) {
    const record = readAgentLoopAuditRecord(source);
    if (!record) continue;
    const finalAnswerDraft = readAgentLoopAuditRecord(record.final_answer_draft);
    const finalAnswerDraftAuthority =
      typeof finalAnswerDraft?.authority === "string" && finalAnswerDraft.authority.trim()
        ? finalAnswerDraft.authority.trim()
        : null;
    if (finalAnswerDraftAuthority === "deterministic_receipt_fallback") {
      return "deterministic receipt fallback";
    }
    const directSource =
      typeof record.final_answer_source === "string" && record.final_answer_source.trim()
        ? record.final_answer_source.trim()
        : null;
    const structuredWorkstationGatewaySuccess = hasStructuredSuccessfulWorkstationGatewayEvidence(record);
    const resolvedSummary = readAgentLoopAuditRecord(record.resolved_turn_summary);
    const terminalAuthorityRecord = readTerminalAnswerAuthorityRecord(record.terminal_answer_authority);
    const terminalAuthoritySingleWriterRecord = readAgentLoopAuditRecord(record.terminal_authority_single_writer);
    const debugRecord = readAgentLoopAuditRecord(record.debug);
    const debugResolvedSummary = readAgentLoopAuditRecord(debugRecord?.resolved_turn_summary);
    const debugTerminalAuthorityRecord = readTerminalAnswerAuthorityRecord(debugRecord?.terminal_answer_authority);
    const debugTerminalAuthoritySingleWriterRecord = readAgentLoopAuditRecord(debugRecord?.terminal_authority_single_writer);
    for (const terminalRecord of [
      terminalAuthorityRecord,
      terminalAuthoritySingleWriterRecord,
      debugTerminalAuthorityRecord,
      debugTerminalAuthoritySingleWriterRecord,
      resolvedSummary,
      debugResolvedSummary,
    ]) {
      const label = readTerminalSourceLabelCandidate(terminalRecord, directSource);
      if (label) return label;
    }
    const directTerminalKind =
      typeof record.terminal_artifact_kind === "string" && record.terminal_artifact_kind.trim()
        ? record.terminal_artifact_kind.trim()
        : null;
    if (
      structuredWorkstationGatewaySuccess &&
      (directSource === "typed_failure" || directTerminalKind === "typed_failure") &&
      readStructuredWorkstationFinalText(record)
    ) {
      return formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: "workstation_tool_evaluation",
        finalAnswerSource: "workstation_tool_evaluation",
      });
    }
    if (
      structuredWorkstationGatewaySuccess &&
      (directSource === "typed_failure" || directTerminalKind === "typed_failure")
    ) {
      continue;
    }
    if (directSource || directTerminalKind) {
      return formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: directTerminalKind,
        finalAnswerSource: normalizeFinalAnswerSourceForTerminalKind(directSource, directTerminalKind),
      });
    }
    const truthTable = readAgentLoopAuditRecord(record.turn_truth_table);
    const truthTerminal = readAgentLoopAuditRecord(truthTable?.terminal);
    const truthSource =
      typeof truthTerminal?.final_answer_source === "string" && truthTerminal.final_answer_source.trim()
        ? truthTerminal.final_answer_source.trim()
        : null;
    const truthTerminalKind =
      typeof truthTerminal?.kind === "string" && truthTerminal.kind.trim()
        ? truthTerminal.kind.trim()
        : typeof truthTerminal?.terminal_artifact_kind === "string" && truthTerminal.terminal_artifact_kind.trim()
          ? truthTerminal.terminal_artifact_kind.trim()
          : null;
    if (truthSource || truthTerminalKind) {
      return formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: truthTerminalKind,
        finalAnswerSource: normalizeFinalAnswerSourceForTerminalKind(truthSource, truthTerminalKind),
      });
    }
    const audit = readAgentLoopAuditRecord(record.agent_loop_audit);
    const auditSource =
      typeof audit?.final_answer_source === "string" && audit.final_answer_source.trim()
        ? audit.final_answer_source.trim()
        : null;
    const auditTerminalKind =
      typeof audit?.terminal_artifact_kind === "string" && audit.terminal_artifact_kind.trim()
        ? audit.terminal_artifact_kind.trim()
        : null;
    if (auditSource || auditTerminalKind) {
      return formatHelixVisibleTerminalSourceLabel({
        terminalArtifactKind: auditTerminalKind,
        finalAnswerSource: normalizeFinalAnswerSourceForTerminalKind(auditSource, auditTerminalKind),
      });
    }
  }
  return null;
}

export function isHelixAskDeterministicReceiptFallbackLabel(value: unknown): boolean {
  return /^deterministic[\s_-]+receipt[\s_-]+fallback$/i.test(coerceText(value).trim());
}

export function resolveHelixAskFinalAnswerPresentation(
  sourceLabel: string | null | undefined,
): HelixAskFinalAnswerPresentation {
  if (isHelixAskDeterministicReceiptFallbackLabel(sourceLabel)) {
    return {
      heading: "Checkpoint receipt",
      sourceLabel: "checkpoint receipt (not reviewed)",
      isDeterministicReceiptFallback: true,
    };
  }
  const normalized = coerceText(sourceLabel).trim();
  return {
    heading: "Final answer",
    sourceLabel: normalized || null,
    isDeterministicReceiptFallback: false,
  };
}
