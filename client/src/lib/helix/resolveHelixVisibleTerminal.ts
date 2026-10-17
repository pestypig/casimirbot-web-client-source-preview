export type HelixVisibleTerminalResolution = {
  text: string;
  source: string;
  backendTerminalText: string | null;
  terminalKind: string | null;
  terminalArtifactKind: string | null;
  finalAnswerSource: string | null;
  terminalErrorCode: string | null;
  authorityVerified: boolean;
  usedLegacyShadow: boolean;
};

export type HelixVisibleTerminalSourceLabelInput = {
  terminalArtifactKind?: unknown;
  finalAnswerSource?: unknown;
  fallback?: unknown;
};

export type HelixRuntimeStopReasonVisibilityInput = {
  stopReason?: unknown;
  finalStatus?: unknown;
  terminalErrorCode?: unknown;
  solverDecision?: unknown;
  terminalKind?: unknown;
};

type RecordLike = Record<string, unknown>;

function readRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTerminalText(value: unknown): string {
  return readString(value).replace(/\u00a0/g, " ").trim();
}

function isInvalidTerminalText(value: unknown): boolean {
  const normalized = normalizeTerminalText(value);
  if (!normalized) return true;
  return (
    /^no final answer returned\.?$/i.test(normalized) ||
    /^I could not produce a terminal answer for this turn\.?$/i.test(normalized) ||
    /^I could not produce a final answer for this turn\.?$/i.test(normalized) ||
    /^direct_answer_unavailable$/i.test(normalized) ||
    /^model_only_answer_unavailable$/i.test(normalized) ||
    /^I could not produce a substantive direct answer for this background-only turn\.?$/i.test(normalized) ||
    /^I couldn't produce a final answer for that turn\. Please retry once\.?$/i.test(normalized)
  );
}

function firstRecord(...values: unknown[]): RecordLike | null {
  for (const value of values) {
    const record = readRecord(value);
    if (record) return record;
  }
  return null;
}

function firstRecordFromArray(value: unknown): RecordLike | null {
  for (const entry of readArray(value)) {
    const record = readRecord(entry);
    if (record) return record;
  }
  return null;
}

function readStringSet(value: unknown): Set<string> {
  return new Set(readArray(value).map((entry) => readString(entry)).filter(Boolean));
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = normalizeTerminalText(value);
    if (text && !isInvalidTerminalText(text)) return text;
  }
  return "";
}

function readAskTurnAdmissionTerminal(args: {
  record: RecordLike | null;
  debug: RecordLike | null;
  summary: RecordLike | null;
  terminalArtifactKind: string | null;
  finalAnswerSource: string | null;
}): {
  text: string;
  status: "queued" | "rejected";
  reason: string;
} | null {
  if (args.terminalArtifactKind !== "ask_turn_admission" && args.finalAnswerSource !== "ask_turn_admission") {
    return null;
  }

  const admission = firstRecord(args.record?.ask_turn_admission, args.debug?.ask_turn_admission);
  const runtimeMemoryAdmission = firstRecord(
    args.record?.runtime_memory_governor_admission,
    args.record?.ask_turn_runtime_memory_governor,
    args.debug?.runtime_memory_governor_admission,
    args.debug?.ask_turn_runtime_memory_governor,
  );
  const routeReasonCode = firstText(args.record?.route_reason_code, args.debug?.route_reason_code);
  const resolvedRouteLabel = firstText(
    args.summary?.resolved_route_label,
    args.record?.route,
    args.debug?.route,
  );
  const explicitStatus = firstText(admission?.status);
  const status: "queued" | "rejected" =
    explicitStatus === "queued" ||
    /(?:^|\/)\s*queued\s*$/i.test(resolvedRouteLabel) ||
    firstText(args.record?.response_type, args.debug?.response_type) === "queued"
      ? "queued"
      : "rejected";
  const routeReasonMatch = routeReasonCode.match(/^ask_turn_admission\s*\/\s*(.+)$/i);
  const reason =
    firstText(admission?.reason) ||
    firstText(routeReasonMatch?.[1]) ||
    (runtimeMemoryAdmission?.admitted === false ? "memory_hard_pressure" : "capacity_unavailable");
  const text =
    firstText(args.record?.text, args.record?.answer, args.debug?.text, args.debug?.answer) ||
    `Ask turn ${status}: ${reason}.`;

  return { text, status, reason };
}

function firstTerminalErrorCode(...values: unknown[]): string {
  const codes = values.map((value) => firstText(value)).filter(Boolean);
  return codes.find((code) => code !== "terminal_projection_mismatch") ?? codes[0] ?? "";
}

function readRouteEvidenceAuthority(
  record: RecordLike | null,
  debug: RecordLike | null,
  agentLoop: RecordLike | null,
): RecordLike | null {
  const debugSolverTrace = readRecord(debug?.ask_turn_solver_trace);
  const recordSolverTrace = readRecord(record?.ask_turn_solver_trace);
  const authority = firstRecord(
    record?.route_evidence_authority,
    debug?.route_evidence_authority,
    agentLoop?.route_evidence_authority,
    recordSolverTrace?.route_evidence_authority,
    debugSolverTrace?.route_evidence_authority,
  );
  return authority?.schema === "helix.route_evidence_authority.v1" ? authority : null;
}

function routeEvidenceAuthorityAllowsTerminalKind(
  authority: RecordLike | null,
  terminalArtifactKind: string | null,
): boolean {
  if (!authority) return true;
  const kind = readString(terminalArtifactKind);
  if (kind === "typed_failure" || kind === "request_user_input") return true;
  if (authority.terminal_product_allowed === false) return false;
  if (!kind) return false;

  const forbiddenKinds = readStringSet(authority.forbidden_terminal_artifact_kinds);
  if (forbiddenKinds.has(kind)) return false;

  const requiredKind = readString(authority.required_terminal_kind);
  if (requiredKind && kind !== requiredKind) return false;

  const allowedKinds = readStringSet(authority.allowed_terminal_artifact_kinds);
  if (allowedKinds.size > 0 && !allowedKinds.has(kind)) return false;

  return true;
}

export function normalizeFinalAnswerSourceForTerminalKind(
  source: string | null,
  terminalArtifactKind: string | null,
): string | null {
  if (
    source === "final_answer_draft" &&
    terminalArtifactKind &&
    terminalArtifactKind !== "model_synthesized_answer" &&
    terminalArtifactKind !== "final_answer_draft"
  ) {
    return terminalArtifactKind;
  }
  return source;
}

function renderTypedFailureFallback(code?: string | null): string {
  const normalized = readString(code);
  if (normalized === "synthesis_unavailable") {
    return "I found candidate evidence, but no current-turn synthesis artifact answered the requested conclusion.\nCause: synthesis_unavailable.";
  }
  if (normalized === "equation_source_unavailable") {
    return "I looked for an equation-bearing source, but no current-turn equation artifact satisfied the source contract.\nCause: equation_source_unavailable.";
  }
  return normalized ? `I could not complete that turn.\nCause: ${normalized}.` : "I could not complete that turn.";
}

function renderRouteTerminalProductFailure(
  authority: RecordLike | null,
  terminalArtifactKind: string | null,
): string {
  const selectedKind = readString(terminalArtifactKind);
  const requiredKind = readString(authority?.required_terminal_kind);
  const allowedKinds = [...readStringSet(authority?.allowed_terminal_artifact_kinds)];
  if (!selectedKind) return renderTypedFailureFallback("route_terminal_product_not_allowed");

  const mismatch = requiredKind
    ? `this turn's route required \`${requiredKind}\`, but the solver produced \`${selectedKind}\``
    : `the solver produced \`${selectedKind}\`, which this turn's route did not admit`;
  const allowedLine = allowedKinds.length > 0
    ? `\nAllowed terminal products: ${allowedKinds.map((kind) => `\`${kind}\``).join(", ")}.`
    : "";
  return `I could not present the completed result because ${mismatch}.${allowedLine}\nCause: route_terminal_product_not_allowed.`;
}

export function formatHelixVisibleTerminalSourceLabel(
  input: HelixVisibleTerminalSourceLabelInput,
): string {
  const terminalKind = readString(input.terminalArtifactKind);
  const finalAnswerSource = readString(input.finalAnswerSource);
  const fallback = readString(input.fallback);

  const kindLabelByTerminalKind: Record<string, string> = {
    direct_answer_text: "model direct answer",
    model_synthesized_answer: "model synthesized answer",
    capability_help_summary: "capability help summary",
    calculation_trace: "calculation trace",
    doc_summary: "doc summary",
    doc_open_receipt: "doc open receipt",
    docs_viewer_receipt: "docs viewer receipt",
    doc_location_matches: "docs location",
    doc_location_result: "docs location",
    doc_evidence_location: "docs location",
    doc_evidence_synthesis_answer: "doc evidence synthesis answer",
    doc_equation_context: "doc equation context",
    doc_search_results: "docs search",
    workstation_tool_evaluation: "workstation tool evaluation",
    workspace_status_answer: "workspace status answer",
    workspace_directory_resolution: "workspace directory resolution",
    workspace_action_receipt: "workspace action receipt",
    note_update_receipt: "note update receipt",
    note_action_receipt: "note action receipt",
    calculator_receipt: "calculator receipt",
    calculator_stream_result: "calculator stream result",
    tool_evaluation: "tool evaluation",
    stage_play_live_source_mail_decision: "stage play live-source mail decision",
    stage_play_live_source_watch_job_policy_config_result: "stage play live-source watch policy config",
    stage_play_agent_goal_session_receipt: "stage play agent goal session receipt",
    stage_play_workstation_control_receipt: "stage play workstation control receipt",
    live_source_interim_voice_callout_receipt: "live-source interim voice callout receipt",
    live_pipeline_receipt: "live pipeline receipt",
    live_environment_binding_diagnosis: "live environment diagnosis",
    narrator_bind_stream_receipt: "narrator bind stream receipt",
    narrator_say_receipt: "narrator say receipt",
    debug_evidence_diagnosis: "debug evidence diagnosis",
    image_lens_observation_report: "image lens observation report",
    visual_producer_cadence_receipt: "visual producer cadence receipt",
    voice_block_receipt: "voice block receipt",
    voice_hold_receipt: "voice hold receipt",
    voice_receipt: "voice receipt",
    situation_context_pack: "situation context",
    visual_context_pack: "visual context",
    compound_research_locator_answer: "compound research locator answer",
    scholarly_research_answer: "scholarly research answer",
    theory_context_reflection_answer: "theory context reflection answer",
    internet_search_answer: "internet search answer",
    repo_code_evidence_answer: "repo code evidence answer",
    typed_failure: "typed failure",
    ask_turn_admission: "ask turn admission",
  };

  if (terminalKind && kindLabelByTerminalKind[terminalKind]) {
    return kindLabelByTerminalKind[terminalKind];
  }

  if (terminalKind && terminalKind !== "unknown") {
    return terminalKind.replace(/_/g, " ");
  }

  if (finalAnswerSource) {
    return finalAnswerSource.replace(/_/g, " ");
  }

  return fallback ? fallback.replace(/_/g, " ") : "unknown";
}

export function shouldShowHelixRuntimeStopReason(
  input: HelixRuntimeStopReasonVisibilityInput,
): boolean {
  const stopReason = readString(input.stopReason);
  if (!stopReason) return false;

  const finalStatus = readString(input.finalStatus);
  const terminalErrorCode = readString(input.terminalErrorCode);
  const solverDecision = readString(input.solverDecision);
  const terminalKind = readString(input.terminalKind);

  if (
    stopReason === "budget_exhausted" &&
    !terminalErrorCode &&
    terminalKind !== "typed_failure" &&
    (finalStatus === "final_answer" || terminalKind === "final_answer") &&
    solverDecision !== "fail_closed"
  ) {
    return false;
  }

  return true;
}

function isSourceOrCapabilityTurn(args: {
  record: RecordLike | null;
  debug: RecordLike | null;
  agentLoop: RecordLike | null;
}): boolean {
  const sourceIntent = firstRecord(
    args.record?.source_target_intent,
    args.debug?.source_target_intent,
    args.record?.ask_turn_preflight_context && readRecord(args.record.ask_turn_preflight_context)?.source_target_intent,
    args.debug?.ask_turn_preflight_context && readRecord(args.debug.ask_turn_preflight_context)?.source_target_intent,
  );
  const sourceTarget = readString(sourceIntent?.target_source ?? sourceIntent?.source_target);
  const sourceStrength = readString(sourceIntent?.strength);
  if (sourceTarget && sourceTarget !== "unknown" && sourceStrength !== "none") return true;

  const compoundContract = firstRecord(args.record?.compound_capability_contract, args.debug?.compound_capability_contract);
  if (compoundContract) return true;

  const capabilityItinerary = firstRecord(args.record?.capability_itinerary, args.debug?.capability_itinerary);
  if (capabilityItinerary) return true;

  const canonicalGoal = firstRecord(args.record?.canonical_goal_frame, args.debug?.canonical_goal_frame);
  const goalKind = readString(canonicalGoal?.goal_kind);
  if (
    goalKind &&
    goalKind !== "model_only_concept" &&
    /(?:doc|visual|live|calculator|panel|workspace|notes|process_graph|source|location|open)/i.test(goalKind)
  ) {
    return true;
  }

  if (Array.isArray(args.record?.available_capabilities) || Array.isArray(args.debug?.available_capabilities)) return true;
  if (readRecord(args.record?.agent_runtime_loop ?? args.debug?.agent_runtime_loop ?? args.agentLoop)) return true;
  return false;
}

function hasSatisfiedDirectAnswerGoal(record: RecordLike | null, debug: RecordLike | null): boolean {
  const goal = firstRecord(record?.goal_satisfaction_evaluation, debug?.goal_satisfaction_evaluation);
  const satisfaction = readString(goal?.satisfaction);
  const nextDecision = readString(goal?.next_decision);
  if (satisfaction === "satisfied" && nextDecision === "allow_terminal") return true;

  const runtime = firstRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const terminalState = readString(runtime?.terminal_state);
  return terminalState === "answer_drafted" || terminalState === "terminal_satisfied";
}

function directAnswerTextFromArtifacts(...artifactContainers: unknown[]): string {
  for (const container of artifactContainers) {
    for (const artifact of readArray(container)) {
      const artifactRecord = readRecord(artifact);
      const artifactKind = readString(artifactRecord?.kind);
      const payload = readRecord(artifactRecord?.payload);
      const schema = readString(payload?.schema);
      if (
        artifactKind !== "direct_answer_text" &&
        artifactKind !== "final_answer_draft" &&
        schema !== "helix.direct_answer_text.v1" &&
        schema !== "helix.final_answer_draft.v1"
      ) {
        continue;
      }
      const text = firstText(payload?.answer_text, payload?.text, artifactRecord?.text);
      if (text) return text;
    }
  }
  return "";
}

function directAnswerTextFromRecord(record: RecordLike | null, debug: RecordLike | null): string {
  const directAnswer = firstRecord(record?.direct_answer_text, debug?.direct_answer_text);
  const finalDraft = firstRecord(record?.final_answer_draft, debug?.final_answer_draft);
  return (
    firstText(directAnswer?.answer_text, directAnswer?.text, finalDraft?.answer_text, finalDraft?.text) ||
    directAnswerTextFromArtifacts(record?.current_turn_artifact_ledger, debug?.current_turn_artifact_ledger)
  );
}

export function resolveHelixVisibleTerminal(
  value: unknown,
  fallbackContent?: string | null,
): HelixVisibleTerminalResolution {
  const record = readRecord(value);
  const debug = readRecord(record?.debug);
  const agentLoop = readRecord(record?.agent_runtime_loop ?? debug?.agent_runtime_loop ?? record?.agent_loop_audit ?? debug?.agent_loop_audit);
  const singleWriter = firstRecord(
    record?.terminal_authority_single_writer,
    debug?.terminal_authority_single_writer,
    agentLoop?.terminal_authority_single_writer,
  );
  const envelope = firstRecord(record?.terminal_answer_envelope, debug?.terminal_answer_envelope, agentLoop?.terminal_answer_envelope);
  const authority = firstRecord(record?.terminal_answer_authority, debug?.terminal_answer_authority, agentLoop?.terminal_answer_authority);
  const presentation = firstRecord(record?.terminal_presentation, debug?.terminal_presentation, agentLoop?.terminal_presentation);
  const terminalResult = firstRecord(
    record?.terminal_result,
    debug?.terminal_result,
    firstRecordFromArray(record?.terminal_results),
    firstRecordFromArray(debug?.terminal_results),
  );
  const summary = firstRecord(record?.resolved_turn_summary, debug?.resolved_turn_summary);
  const routeEvidenceAuthority = readRouteEvidenceAuthority(record, debug, agentLoop);
  const sourceCapabilityTurn = isSourceOrCapabilityTurn({ record, debug, agentLoop });
  const recoveredModelDirectAnswer =
    !sourceCapabilityTurn && hasSatisfiedDirectAnswerGoal(record, debug) ? directAnswerTextFromRecord(record, debug) : "";

  const terminalKind =
    firstText(
      envelope?.terminal_kind,
      authority?.terminal_kind,
      summary?.terminal_kind,
    ) || null;
  const terminalArtifactKind =
    firstText(
      singleWriter?.selected_terminal_artifact_kind,
      singleWriter?.selectedArtifactKind,
      authority?.terminal_artifact_kind,
      envelope?.terminal_artifact_kind,
      terminalResult?.terminal_artifact_kind,
      terminalResult?.artifact_kind,
      presentation?.terminal_artifact_kind,
      record?.terminal_artifact_kind,
      debug?.terminal_artifact_kind,
      summary?.terminal_artifact_kind,
    ) || null;
  const rawFinalAnswerSource =
    firstText(
      singleWriter?.source,
      authority?.final_answer_source,
      envelope?.final_answer_source,
      terminalResult?.final_answer_source,
      record?.final_answer_source,
      debug?.final_answer_source,
    ) ||
    null;
  const finalAnswerSource = normalizeFinalAnswerSourceForTerminalKind(rawFinalAnswerSource, terminalArtifactKind);
  const envelopeText = firstText(envelope?.terminal_text);
  const terminalResultText = firstText(terminalResult?.text, terminalResult?.answer_text);
  const terminalAuthorityIndicatesSuccess =
    Boolean(authority?.server_authoritative === true) &&
    readString(authority?.terminal_kind) !== "failure" &&
    readString(authority?.final_answer_source) !== "typed_failure" &&
    readString(authority?.terminal_artifact_kind) !== "typed_failure";
  const singleWriterIntegrity = readRecord(singleWriter?.integrity);
  const singleWriterIndicatesSuccess =
    Boolean(singleWriterIntegrity?.single_writer_applied === true) &&
    readString(singleWriter?.source) !== "typed_failure" &&
    readString(singleWriter?.selected_terminal_artifact_kind) !== "typed_failure" &&
    readString(singleWriter?.selectedArtifactKind) !== "typed_failure";
  const authorityVerified = terminalAuthorityIndicatesSuccess || singleWriterIndicatesSuccess;
  const envelopeIndicatesSuccess =
    Boolean(envelopeText) &&
    readString(envelope?.terminal_kind) !== "failure" &&
    readString(envelope?.final_answer_source) !== "typed_failure" &&
    readString(envelope?.terminal_artifact_kind) !== "typed_failure";
  const terminalResultIndicatesSuccess =
    Boolean(terminalResultText) &&
    readString(terminalResult?.artifact_kind) !== "typed_failure" &&
    readString(terminalResult?.terminal_artifact_kind) !== "typed_failure" &&
    readString(terminalResult?.final_answer_source) !== "typed_failure" &&
    terminalResult?.terminal_authority_ok !== false &&
    terminalResult?.route_authority_ok !== false;
  const terminalErrorCode =
    envelopeIndicatesSuccess || terminalAuthorityIndicatesSuccess || singleWriterIndicatesSuccess || terminalResultIndicatesSuccess
      ? null
      : firstTerminalErrorCode(record?.terminal_error_code, debug?.terminal_error_code, summary?.terminal_error_code) || null;
  const effectiveFinalAnswerSource = finalAnswerSource || (terminalErrorCode ? "typed_failure" : null);
  const selectedFinalAnswer = firstText(record?.selected_final_answer, debug?.selected_final_answer);
  const selectedFinalAnswerIsAuthoritativeModelDraft =
    !terminalErrorCode &&
    !envelope &&
    terminalArtifactKind === "model_synthesized_answer" &&
    effectiveFinalAnswerSource === "final_answer_draft" &&
    (!sourceCapabilityTurn || terminalAuthorityIndicatesSuccess || singleWriterIndicatesSuccess) &&
    Boolean(selectedFinalAnswer);
  const selectedFinalAnswerIsBackendSelectedModelOnlyText =
    !terminalErrorCode &&
    !sourceCapabilityTurn &&
    authorityVerified &&
    !envelope &&
    !terminalResultText &&
    !(
      authority?.server_authoritative === true &&
      firstText(
        presentation?.concise_text,
        record?.selected_final_answer,
        debug?.selected_final_answer,
        authority?.terminal_text,
        authority?.terminal_text_preview,
      )
    ) &&
    !firstText(singleWriter?.visible_text) &&
    !firstText(presentation?.concise_text) &&
    Boolean(selectedFinalAnswer);

  const askTurnAdmissionTerminal = readAskTurnAdmissionTerminal({
    record,
    debug,
    summary,
    terminalArtifactKind,
    finalAnswerSource: rawFinalAnswerSource,
  });
  if (askTurnAdmissionTerminal) {
    const rejected = askTurnAdmissionTerminal.status === "rejected";
    return {
      text: askTurnAdmissionTerminal.text,
      source: "ask_turn_admission",
      backendTerminalText: askTurnAdmissionTerminal.text,
      terminalKind: rejected ? "failure" : "checkpoint_receipt",
      terminalArtifactKind: "ask_turn_admission",
      finalAnswerSource: "ask_turn_admission",
      terminalErrorCode: rejected ? askTurnAdmissionTerminal.reason : null,
      authorityVerified: true,
      usedLegacyShadow: false,
    };
  }

  if (!routeEvidenceAuthorityAllowsTerminalKind(routeEvidenceAuthority, terminalArtifactKind)) {
    const text = renderRouteTerminalProductFailure(routeEvidenceAuthority, terminalArtifactKind);
    return {
      text,
      source: "typed_failure",
      backendTerminalText: text,
      terminalKind: "failure",
      terminalArtifactKind: "typed_failure",
      finalAnswerSource: "typed_failure",
      terminalErrorCode: "route_terminal_product_not_allowed",
      authorityVerified: false,
      usedLegacyShadow: false,
    };
  }

  if (envelopeText) {
    return {
      text: envelopeText,
      source: "terminal_answer_envelope",
      backendTerminalText: envelopeText,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified,
      usedLegacyShadow: false,
    };
  }

  if (terminalResultText && terminalResultIndicatesSuccess) {
    return {
      text: terminalResultText,
      source: "golden_path_terminal_result",
      backendTerminalText: terminalResultText,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified: true,
      usedLegacyShadow: false,
    };
  }

  if (selectedFinalAnswerIsAuthoritativeModelDraft) {
    return {
      text: selectedFinalAnswer,
      source: "selected_final_answer",
      backendTerminalText: selectedFinalAnswer,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified,
      usedLegacyShadow: false,
    };
  }

  if (selectedFinalAnswerIsBackendSelectedModelOnlyText) {
    return {
      text: selectedFinalAnswer,
      source: "selected_final_answer",
      backendTerminalText: selectedFinalAnswer,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource ?? "model_direct_answer",
      terminalErrorCode: null,
      authorityVerified,
      usedLegacyShadow: false,
    };
  }

  const singleWriterText = firstText(singleWriter?.visible_text);
  if (singleWriterText && singleWriterIntegrity?.single_writer_applied === true) {
    return {
      text: singleWriterText,
      source: "terminal_authority_single_writer",
      backendTerminalText: singleWriterText,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified,
      usedLegacyShadow: false,
    };
  }

  const authorityText = authority?.server_authoritative === true
    ? firstText(
        presentation?.concise_text,
        record?.selected_final_answer,
        debug?.selected_final_answer,
        authority?.terminal_text,
        authority?.terminal_text_preview,
      )
    : "";
  if (authorityText) {
    return {
      text: authorityText,
      source: "terminal_answer_authority",
      backendTerminalText: authorityText,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified: true,
      usedLegacyShadow: false,
    };
  }

  const presentationText = firstText(presentation?.concise_text);
  if (presentationText && !sourceCapabilityTurn) {
    return {
      text: presentationText,
      source: "terminal_presentation",
      backendTerminalText: presentationText,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode,
      authorityVerified: false,
      usedLegacyShadow: false,
    };
  }

  if (recoveredModelDirectAnswer) {
    return {
      text: recoveredModelDirectAnswer,
      source: "model_direct_answer_artifact",
      backendTerminalText: recoveredModelDirectAnswer,
      terminalKind: terminalKind ?? "direct_answer_text",
      terminalArtifactKind: terminalArtifactKind ?? "direct_answer_text",
      finalAnswerSource: effectiveFinalAnswerSource ?? "model_direct_answer",
      terminalErrorCode,
      authorityVerified,
      usedLegacyShadow: false,
    };
  }

  const typedFailureText =
    effectiveFinalAnswerSource === "typed_failure" || terminalKind === "failure" || terminalArtifactKind === "typed_failure" || terminalErrorCode
      ? firstText(
          record?.terminal_error_code === "terminal_projection_mismatch" && debug?.terminal_error_code === terminalErrorCode
            ? debug?.typed_failure && readRecord(debug.typed_failure)?.answer_text
            : null,
          record?.terminal_error_code === "terminal_projection_mismatch" && debug?.terminal_error_code === terminalErrorCode
            ? debug?.selected_final_answer
            : null,
          record?.typed_failure && readRecord(record.typed_failure)?.answer_text,
          record?.selected_final_answer,
          debug?.typed_failure && readRecord(debug.typed_failure)?.answer_text,
          debug?.selected_final_answer,
        ) ||
        renderTypedFailureFallback(terminalErrorCode)
      : "";
  if (typedFailureText) {
    return {
      text: typedFailureText,
      source: "typed_failure",
      backendTerminalText: typedFailureText,
      terminalKind: terminalKind ?? "failure",
      terminalArtifactKind: terminalArtifactKind ?? "typed_failure",
      finalAnswerSource: effectiveFinalAnswerSource ?? "typed_failure",
      terminalErrorCode,
      authorityVerified: false,
      usedLegacyShadow: false,
    };
  }

  if (sourceCapabilityTurn) {
    const text = renderTypedFailureFallback("terminal_authority_missing");
    return {
      text,
      source: "terminal_authority_missing",
      backendTerminalText: null,
      terminalKind,
      terminalArtifactKind,
      finalAnswerSource: effectiveFinalAnswerSource,
      terminalErrorCode: terminalErrorCode ?? "terminal_authority_missing",
      authorityVerified: false,
      usedLegacyShadow: false,
    };
  }

  const legacyText = firstText(
    record?.selected_final_answer,
    debug?.selected_final_answer,
    record?.assistant_answer,
    record?.answer,
    record?.text,
    record?.finalAnswer,
    record?.content,
    fallbackContent,
  );
  return {
    text: legacyText,
    source: legacyText ? "legacy_shadow" : "empty",
    backendTerminalText: null,
    terminalKind,
    terminalArtifactKind,
    finalAnswerSource: effectiveFinalAnswerSource,
    terminalErrorCode,
    authorityVerified: false,
    usedLegacyShadow: Boolean(legacyText),
  };
}
