function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function mergeRuntimeGoalSummaryFields(
  rebuiltSummary: Record<string, unknown>,
  existingSummary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!existingSummary) return rebuiltSummary;
  const merged = { ...rebuiltSummary };
  for (const [key, value] of Object.entries(existingSummary)) {
    const shouldUseExisting =
      value !== null &&
      value !== undefined &&
      (!Array.isArray(value) || value.length > 0) &&
      (!(typeof value === "string") || value.trim().length > 0);
    if (shouldUseExisting) merged[key] = value;
  }
  return merged;
}

function readNestedRecord(source: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const direct = asRecord(source?.[key]);
  if (direct) return direct;
  const debug = asRecord(source?.debug);
  return asRecord(debug?.[key]);
}

function sourceBindingLabel(source: Record<string, unknown> | null): string | null {
  return (
    readString(source?.source_label) ??
    readString(source?.doc_path) ??
    readString(source?.active_panel_id) ??
    readString(source?.source_id)
  );
}

function parseRuntimeGoalId(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const runtimeGoalIndex = text.indexOf(":runtime_goal");
  if (runtimeGoalIndex > 0) {
    const candidate = text.slice(0, runtimeGoalIndex);
    return candidate.startsWith("goal:") ? candidate : null;
  }
  return text.startsWith("goal:") ? text : null;
}

function readRuntimeGoalCommand(source: Record<string, unknown> | null | undefined): string | null {
  const command = readString(source?.command);
  if (command) return command;
  const prompt =
    readString(source?.active_prompt) ??
    readString(source?.prompt) ??
    readString(source?.user_prompt) ??
    readString(asRecord(source?.debug)?.active_prompt);
  if (!prompt) return null;
  const normalized = prompt.toLowerCase();
  if (normalized === "/goal wake") return "wake";
  if (normalized.startsWith("/goal ")) return "start";
  return null;
}

function inferRuntimeGoalProviderFromText(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  if (/\bcodex\b|\bCodex Workstation Mode\b/i.test(text)) return "codex";
  if (/\bhelix\b|\bHelix Ask Native\b/i.test(text)) return "helix";
  return null;
}

function isRuntimeGoalCommandResult(source: Record<string, unknown> | null | undefined): boolean {
  const terminalAuthority = readNestedRecord(source, "terminal_answer_authority");
  const terminalPresentation = readNestedRecord(source, "terminal_presentation");
  const finalAnswerSource =
    readString(source?.final_answer_source) ??
    readString(terminalAuthority?.final_answer_source) ??
    readString(terminalPresentation?.final_answer_source);
  const terminalArtifactKind =
    readString(source?.terminal_artifact_kind) ??
    readString(terminalAuthority?.terminal_artifact_kind) ??
    readString(terminalPresentation?.terminal_artifact_kind);
  return finalAnswerSource === "runtime_goal_command" || terminalArtifactKind === "runtime_goal_command_result";
}

function synthesizeHelixAskRuntimeGoalDebugFields(
  source: Record<string, unknown> | null | undefined,
): HelixAskRuntimeGoalDebugFields {
  if (!isRuntimeGoalCommandResult(source)) {
    return {
      runtime_goal_command: null,
      runtime_goal_session: null,
      runtime_goal_debug_export: null,
      runtime_goal_debug_summary: null,
    };
  }

  const terminalAuthority = readNestedRecord(source, "terminal_answer_authority");
  const terminalPresentation = readNestedRecord(source, "terminal_presentation");
  const selectedAgentProvider = asRecord(source?.selected_agent_provider);
  const goalId =
    parseRuntimeGoalId(terminalAuthority?.terminal_item_id) ??
    parseRuntimeGoalId(terminalPresentation?.terminal_authority_ref);
  const turnId =
    readString(source?.active_turn_id) ??
    readString(source?.backend_turn_id) ??
    readString(terminalAuthority?.turn_id) ??
    readString(terminalPresentation?.turn_id);
  const runtimeAgentProvider =
    readString(source?.agent_runtime) ??
    readString(source?.runtime_agent_provider) ??
    readString(selectedAgentProvider?.id) ??
    inferRuntimeGoalProviderFromText(source?.selected_final_answer) ??
    inferRuntimeGoalProviderFromText(terminalAuthority?.terminal_text_preview) ??
    inferRuntimeGoalProviderFromText(terminalPresentation?.concise_text) ??
    null;
  const observationRefs = uniqueStrings([
    ...readStringArray(terminalPresentation?.selected_observation_refs),
    ...readStringArray(terminalAuthority?.selected_observation_refs),
  ]);
  const receiptRefs = uniqueStrings([
    ...readStringArray(terminalPresentation?.selected_receipt_refs),
    ...readStringArray(terminalAuthority?.selected_receipt_refs),
  ]);
  const command = readRuntimeGoalCommand(source);
  const serverAuthoritative = readBoolean(terminalAuthority?.server_authoritative);
  const terminalAuthorityStatus = serverAuthoritative === true ? "authorized" : "not_reported";

  const runtimeGoalCommand = {
    schema: "helix.runtime_goal.command_result.v1",
    command,
    goal_id: goalId,
    synthesized_from_terminal_authority: true,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
  const runtimeGoalSession = {
    schema: "helix.runtime_goal.session.v1",
    goal_id: goalId,
    runtime_agent_provider: runtimeAgentProvider,
    runtime_session_id: goalId ? `${goalId}:runtime_session` : null,
    status: "not_reported",
    latest_observation_refs: observationRefs,
    latest_receipt_refs: receiptRefs,
    terminal_authority_status: terminalAuthorityStatus,
    synthesized_from_terminal_authority: true,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
  const runtimeGoalDebugExport = {
    schema: "helix.runtime_goal.debug_export.v1",
    goal_id: goalId,
    runtime_provider: runtimeAgentProvider,
    runtime_session_id: runtimeGoalSession.runtime_session_id,
    session_status: runtimeGoalSession.status,
    latest_observation_refs: observationRefs,
    latest_receipt_refs: receiptRefs,
    terminal_answer_authority: terminalAuthority,
    terminal_authority_status: terminalAuthorityStatus,
    synthesized_from_terminal_authority: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
  const runtimeGoalDebugSummary = {
    schema: "helix.runtime_goal.debug_copy_summary.v1",
    command,
    goal_id: goalId,
    runtime_agent_provider: runtimeAgentProvider,
    runtime_session_id: runtimeGoalSession.runtime_session_id,
    session_status: runtimeGoalSession.status,
    terminal_authority_status: terminalAuthorityStatus,
    latest_observation_refs: observationRefs,
    latest_receipt_refs: receiptRefs,
    terminal_answer_server_authoritative: serverAuthoritative,
    synthesized_from_terminal_authority: true,
    evidence_reentered: observationRefs.length > 0 || receiptRefs.length > 0,
    runtime_candidate_generated: true,
    terminal_authority_evaluated: serverAuthoritative === true,
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };

  return {
    runtime_goal_command: runtimeGoalCommand,
    runtime_goal_session: runtimeGoalSession,
    runtime_goal_debug_export: runtimeGoalDebugExport,
    runtime_goal_debug_summary: runtimeGoalDebugSummary,
  };
}

export type HelixAskRuntimeGoalDebugFields = {
  runtime_goal_command: Record<string, unknown> | null;
  runtime_goal_session: Record<string, unknown> | null;
  runtime_goal_debug_export: Record<string, unknown> | null;
  runtime_goal_debug_summary: Record<string, unknown> | null;
};

export function buildHelixAskRuntimeGoalDebugSummary(input: {
  command: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  debugExport: Record<string, unknown> | null;
  existingSummary?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (!input.command && !input.session && !input.debugExport) return input.existingSummary ?? null;
  const jobBrief = asRecord(
    input.session?.job_brief ??
      input.debugExport?.runtime_goal_job_brief ??
      input.debugExport?.job_brief,
  );
  const wakePlan = asRecord(
    input.session?.latest_wake_plan ??
      input.debugExport?.runtime_goal_wake_plan ??
      input.debugExport?.wake_plan,
  );
  const wakePolicy = asRecord(
    input.session?.wake_policy ??
      input.debugExport?.runtime_goal_wake_policy ??
      input.debugExport?.wake_policy ??
      wakePlan?.wake_policy,
  );
  const progressSummary = asRecord(
    input.session?.latest_progress_summary ??
      input.debugExport?.runtime_goal_progress_summary ??
      input.debugExport?.progress_summary,
  );
  const evidenceUsed = asRecord(progressSummary?.evidence_used);
  const sourceBinding = asRecord(
    input.session?.latest_source_binding ??
      input.debugExport?.runtime_goal_source_binding ??
      progressSummary?.observed_source ??
      wakePlan?.current_source_binding ??
      jobBrief?.source_binding,
  );
  const debugEvents = readRecordArray(input.debugExport?.debug_events);
  const wakeEvents = readRecordArray(input.debugExport?.wake_events);
  const lastWakeEvent = wakeEvents[wakeEvents.length - 1] ?? null;
  const terminalAuthority = asRecord(input.debugExport?.terminal_answer_authority);
  const wakeCandidate = asRecord(
    input.debugExport?.latest_wake_candidate ??
      input.debugExport?.runtime_goal_wake_candidate ??
      input.session?.latest_wake_candidate,
  );
  const wakeAdmission = asRecord(
    input.debugExport?.latest_wake_admission ??
      input.debugExport?.runtime_goal_wake_admission ??
      input.session?.latest_wake_admission,
  );
  const rebuiltSummary = {
    schema: "helix.runtime_goal.debug_copy_summary.v1",
    command: readString(input.command?.command),
    goal_id:
      readString(input.session?.goal_id) ??
      readString(input.command?.goal_id) ??
      readString(input.debugExport?.goal_id),
    runtime_agent_provider:
      readString(input.session?.runtime_agent_provider) ??
      readString(input.debugExport?.runtime_provider),
    runtime_session_id:
      readString(input.session?.runtime_session_id) ??
      readString(input.debugExport?.runtime_session_id),
    session_status:
      readString(input.session?.status) ??
      readString(input.debugExport?.session_status),
    status_reason: readString(input.session?.status_reason),
    wake_count: readNumber(input.session?.wake_count),
    last_wake_at:
      readString(lastWakeEvent?.created_at) ??
      readString(progressSummary?.created_at) ??
      readString(input.session?.updated_at),
    last_wake_event_id:
      readString(lastWakeEvent?.wake_event_id) ??
      readString(progressSummary?.wake_event_id) ??
      readString(wakePlan?.wake_event_id),
    session_updated_at: readString(input.session?.updated_at),
    job_title:
      readString(jobBrief?.user_goal_text) ??
      readString(progressSummary?.job) ??
      readString(input.session?.objective),
    observed_source_label: sourceBindingLabel(sourceBinding),
    observed_source_kind: readString(sourceBinding?.source_kind),
    observed_source_doc_path: readString(sourceBinding?.doc_path),
    observed_source_freshness_ms: readNumber(sourceBinding?.source_freshness_ms),
    requested_observation_or_lane:
      readString(wakePlan?.requested_observation_or_lane) ??
      readString(evidenceUsed?.requested_tool_or_lane),
    wake_relevance_reason: readString(wakePlan?.relevance_reason),
    current_progress_summary: readString(progressSummary?.current_summary),
    next_wake_behavior: readString(progressSummary?.next_wake_behavior),
    wake_timer_status:
      readNumber(wakePolicy?.timer_ms) !== null
        ? "armed"
        : wakePolicy
          ? "unarmed"
          : null,
    wake_timer_ms: readNumber(wakePolicy?.timer_ms),
    wake_expected_terminal_product: readString(wakePlan?.expected_terminal_product),
    wake_candidate_event_kind: readString(wakeCandidate?.event_kind),
    wake_candidate_reason: readString(wakeCandidate?.reason),
    wake_candidate_dedupe_key: readString(wakeCandidate?.dedupe_key),
    wake_admission_status: readString(wakeAdmission?.status),
    wake_admission_reason: readString(wakeAdmission?.reason),
    terminal_authority_status:
      readString(input.session?.terminal_authority_status) ??
      readString(input.debugExport?.runtime_goal_terminal_authority_status) ??
      readString(input.debugExport?.terminal_authority_status),
    latest_observation_refs: uniqueStrings([
      ...readStringArray(input.session?.latest_observation_refs),
      ...readStringArray(input.debugExport?.runtime_goal_observation_refs),
      ...readStringArray(input.debugExport?.latest_observation_refs),
      ...readStringArray(evidenceUsed?.observation_refs),
    ]),
    latest_receipt_refs: uniqueStrings([
      ...readStringArray(input.session?.latest_receipt_refs),
      ...readStringArray(input.debugExport?.latest_receipt_refs),
      ...readStringArray(evidenceUsed?.receipt_refs),
    ]),
    provider_terminal_candidate_ref:
      readString(input.session?.latest_provider_terminal_candidate_ref) ??
      readString(evidenceUsed?.provider_terminal_candidate_ref),
    terminal_answer_server_authoritative: readBoolean(terminalAuthority?.server_authoritative),
    debug_stage_sequence: debugEvents
      .map((event) => readString(event.stage))
      .filter((stage): stage is string => Boolean(stage)),
    requested_tool_or_lane_sequence: uniqueStrings(
      debugEvents.map((event) => readString(event.requested_tool_or_lane)),
    ),
    evidence_reentered: debugEvents.some((event) => readString(event.stage) === "evidence_reentered"),
    runtime_candidate_generated: debugEvents.some((event) => readString(event.stage) === "runtime_candidate_generated"),
    terminal_authority_evaluated: debugEvents.some((event) => readString(event.stage) === "terminal_authority_evaluated"),
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
  return mergeRuntimeGoalSummaryFields(rebuiltSummary, input.existingSummary);
}

export function buildHelixAskRuntimeGoalDebugFields(
  source: Record<string, unknown> | null | undefined,
): HelixAskRuntimeGoalDebugFields {
  const directFields = {
    runtime_goal_command: asRecord(source?.runtime_goal_command),
    runtime_goal_session: asRecord(source?.runtime_goal_session),
    runtime_goal_debug_export: asRecord(source?.runtime_goal_debug_export),
    runtime_goal_debug_summary: asRecord(source?.runtime_goal_debug_summary),
  };
  if (
    directFields.runtime_goal_command ||
    directFields.runtime_goal_session ||
    directFields.runtime_goal_debug_export ||
    directFields.runtime_goal_debug_summary
  ) {
    return {
      ...directFields,
      runtime_goal_debug_summary: buildHelixAskRuntimeGoalDebugSummary({
        command: directFields.runtime_goal_command,
        session: directFields.runtime_goal_session,
        debugExport: directFields.runtime_goal_debug_export,
        existingSummary: directFields.runtime_goal_debug_summary,
      }),
    };
  }
  return synthesizeHelixAskRuntimeGoalDebugFields(source);
}

function preferRuntimeGoalDebugFields(
  preferred: HelixAskRuntimeGoalDebugFields,
  fallback: HelixAskRuntimeGoalDebugFields,
): HelixAskRuntimeGoalDebugFields {
  const preferRecord = (
    preferredRecord: Record<string, unknown> | null,
    fallbackRecord: Record<string, unknown> | null,
  ): Record<string, unknown> | null => {
    if (preferredRecord?.synthesized_from_terminal_authority === true && fallbackRecord) {
      return fallbackRecord;
    }
      return preferredRecord ?? fallbackRecord;
  };
  const runtimeGoalCommand = preferRecord(preferred.runtime_goal_command, fallback.runtime_goal_command);
  const runtimeGoalSession = preferRecord(preferred.runtime_goal_session, fallback.runtime_goal_session);
  const runtimeGoalDebugExport = preferRecord(preferred.runtime_goal_debug_export, fallback.runtime_goal_debug_export);
  const preferredSummary = preferred.runtime_goal_debug_summary || fallback.runtime_goal_debug_summary
    ? mergeRuntimeGoalSummaryFields(
      fallback.runtime_goal_debug_summary ?? {},
      preferred.runtime_goal_debug_summary,
    )
    : null;
  const rebuiltSummary = buildHelixAskRuntimeGoalDebugSummary({
    command: runtimeGoalCommand,
    session: runtimeGoalSession,
    debugExport: runtimeGoalDebugExport,
  });
  return {
    runtime_goal_command: runtimeGoalCommand,
    runtime_goal_session: runtimeGoalSession,
    runtime_goal_debug_export: runtimeGoalDebugExport,
    runtime_goal_debug_summary: rebuiltSummary
      ? mergeRuntimeGoalSummaryFields(rebuiltSummary, preferredSummary)
      : preferredSummary,
  };
}

export function mergeHelixAskRuntimeGoalDebugFields(
  authoritative: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
): HelixAskRuntimeGoalDebugFields {
  const authoritativeFields = buildHelixAskRuntimeGoalDebugFields(authoritative);
  const fallbackFields = buildHelixAskRuntimeGoalDebugFields(fallback);
  return preferRuntimeGoalDebugFields(authoritativeFields, fallbackFields);
}
