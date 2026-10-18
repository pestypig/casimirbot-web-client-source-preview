import {
  safeJsonStringify,
  summarizeHelixAgentRuntimeLoopForCopy,
  summarizeHelixDebugArtifactsForCopy,
} from "@/lib/helix/ask-debug-event-display";
import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import { applyHelixAskBackendEntrypointFailureProjection } from "./HelixAskBackendEntrypointProjection";

export const HELIX_DEBUG_EXPORT_MAX_UI_CHARS = 750_000;

const summarizeContinuationStateForUi = (value: unknown): Record<string, unknown> | null => {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return null;
  const observationRefs = readAgentLoopAuditRecord(record.observation_refs);
  return {
    schema: record.schema ?? null,
    turn_id: record.turn_id ?? null,
    state_id: record.state_id ?? null,
    sequence: record.sequence ?? null,
    trigger: record.trigger ?? null,
    goal: record.goal ?? null,
    observation_refs: observationRefs
      ? {
          existing: Array.isArray(observationRefs.existing) ? observationRefs.existing.slice(-12) : [],
          new: Array.isArray(observationRefs.new) ? observationRefs.new.slice(-12) : [],
          all: Array.isArray(observationRefs.all) ? observationRefs.all.slice(-20) : [],
        }
      : null,
    missing_requirement_ids: Array.isArray(record.missing_requirement_ids)
      ? record.missing_requirement_ids.slice(-16)
      : [],
    last_attempt: record.last_attempt ?? null,
    next_admissible_affordances: Array.isArray(record.next_admissible_affordances)
      ? record.next_admissible_affordances.slice(0, 12)
      : [],
    tried_action_fingerprints: Array.isArray(record.tried_action_fingerprints)
      ? record.tried_action_fingerprints.slice(-16)
      : [],
    progress: record.progress ?? null,
    budget: record.budget ?? null,
    allowed_decisions: Array.isArray(record.allowed_decisions) ? record.allowed_decisions.slice(0, 6) : [],
    authority: record.authority ?? null,
    terminal_eligible: record.terminal_eligible === true,
    assistant_answer: record.assistant_answer === true,
  };
};

const summarizeTerminalRejectionForUi = (value: unknown): Record<string, unknown> | null => {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return null;
  return {
    schema: record.schema ?? null,
    turn_id: record.turn_id ?? null,
    observation_id: record.observation_id ?? null,
    rejected_candidate_kind: record.rejected_candidate_kind ?? null,
    rejected_candidate_ref: record.rejected_candidate_ref ?? null,
    rejection_reason: record.rejection_reason ?? null,
    recoverable: record.recoverable === true,
    failure_class: record.failure_class ?? null,
    retryability: record.retryability ?? null,
    next_affordances: Array.isArray(record.next_affordances) ? record.next_affordances.slice(0, 6) : [],
    terminal_eligible: record.terminal_eligible === true,
    assistant_answer: record.assistant_answer === true,
  };
};

export function copyHelixRailCriticalDebugFieldsForUi(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  debug: Record<string, unknown> | null,
): void {
  const assign = (key: string, value: unknown): void => {
    if (value !== undefined && value !== null) target[key] = value;
  };
  [
    "terminal_answer_envelope",
    "terminal_boundary_eligibility",
    "terminal_projection_guard",
    "terminal_authority_single_writer",
    "codex_parity_agent_spine_rail_table",
    "tool_turn_chain_audit",
    "tool_rail_failure_triage",
    "tool_turn_chain_family_matrix",
    "compound_subgoal_ledger",
    "compound_subgoal_rail_statuses",
    "artifact_query_index",
    "goal_satisfaction_evaluation",
    "post_tool_authority_bridge",
    "ask_turn_solver_trace",
    "ask_turn_procedure_trace",
    "workspace_action_client_ack",
    "client_receipt_terminal",
    "client_receipt_terminal_authority",
    "solver_controller_decision",
    "solver_controller_summary",
    "agent_step_decision",
    "agent_step_loop",
    "calculator_tool_answer_support",
    "terminal_result",
    "terminal_results",
    "golden_path_runtime",
    "golden_path_runtime_status",
    "runtime_goal_command",
    "runtime_goal_session",
    "runtime_goal_debug_export",
    "runtime_goal_debug_summary",
    "workflow_demo_debug",
    "realtime_live_client_debug",
    "codex_native_provider_bridge",
    "codex_native_compatibility_fallback",
    "realtime_grounded_answer_feedback",
    "debug_export_ref",
    "backend_debug_response_ref",
  ].forEach((key) => assign(key, source[key] ?? debug?.[key]));
  const continuationState = summarizeContinuationStateForUi(
    source.agent_continuation_state ?? debug?.agent_continuation_state,
  );
  if (continuationState) target.agent_continuation_state = continuationState;
  const continuationStatesSource = source.agent_continuation_states ?? debug?.agent_continuation_states;
  if (Array.isArray(continuationStatesSource)) {
    target.agent_continuation_states = continuationStatesSource
      .slice(-8)
      .map(summarizeContinuationStateForUi)
      .filter(Boolean);
  }
  const terminalRejectionSource = source.terminal_rejection_observations ?? debug?.terminal_rejection_observations;
  if (Array.isArray(terminalRejectionSource)) {
    target.terminal_rejection_observations = terminalRejectionSource
      .slice(-8)
      .map(summarizeTerminalRejectionForUi)
      .filter(Boolean);
  }
  const ledgerSource = source.current_turn_artifact_ledger ?? debug?.current_turn_artifact_ledger;
  if (Array.isArray(ledgerSource)) target.current_turn_artifact_ledger = summarizeHelixDebugArtifactsForCopy(ledgerSource);
  const runtimeLoop = summarizeHelixAgentRuntimeLoopForCopy(source.agent_runtime_loop ?? debug?.agent_runtime_loop);
  if (runtimeLoop) target.agent_runtime_loop = runtimeLoop;
}

export function boundHelixDebugExportTextForUi(payload: string): string {
  const trimmed = typeof payload === "string" ? payload.trim() : "";
  if (!trimmed || trimmed.length <= HELIX_DEBUG_EXPORT_MAX_UI_CHARS) return payload;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const debug = readAgentLoopAuditRecord(parsed.debug);
    const minimal: Record<string, unknown> = {};
    [
      "schema",
      "exported_at_ms",
      "active_turn_id",
      "backend_turn_id",
      "client_active_turn_id",
      "active_prompt",
      "active_prompt_hash",
      "selected_final_answer",
      "final_answer_source",
      "terminal_artifact_kind",
      "terminal_error_code",
      "terminal_failure_text",
      "server_build_commit",
      "server_build_started_at_ms",
      "helix_docs_synthesis_bridge_version",
      "language_contract",
      "response_language",
      "source_language",
      "language_detected",
      "language_confidence",
      "code_mixed",
      "pivot_confidence",
      "translated",
      "llm_route_expected_backend",
      "llm_backend_used",
      "llm_provider_called",
      "llm_policy_env",
      "llm_runtime_env",
      "llm_http_base_present",
      "llm_http_base_host",
      "llm_api_key_present",
      "llm_api_key_source",
      "llm_http_model_configured",
      "repo_evidence_relevance_gate",
      "repo_answer_text_quality_gate",
      "repo_docs_terminalization",
      "repo_docs_synthesis_packet_summary",
      "docs_synthesis_debug",
      "docs_continuation_contract",
      "doc_evidence_synthesis_plan",
      "doc_evidence_synthesis_coverage",
      "doc_evidence_synthesis_answer",
      "docs_synthesis_materializer_result",
      "resolved_turn_summary",
      "canonical_goal_frame",
      "source_target_intent",
      "terminal_answer_authority",
      "terminal_presentation",
      "ask_turn_procedure_trace",
      "runtime_goal_command",
      "runtime_goal_session",
      "runtime_goal_debug_export",
      "runtime_goal_debug_summary",
      "workflow_demo_debug",
      "codex_native_provider_bridge",
      "codex_native_compatibility_fallback",
      "realtime_grounded_answer_feedback",
      "typed_failure",
      "debug_export_anti_determinism_audit",
      "backend_debug_response_ref",
      "debug_export_ref",
      "debug_export_source",
      "backend_debug_response_status",
      "console_assembly_debug",
      "client_console_assembly_debug",
      "client_projection_payload_hash",
    ].forEach((key) => {
      if (parsed[key] !== undefined) minimal[key] = parsed[key];
    });
    applyHelixAskBackendEntrypointFailureProjection({ target: minimal, source: parsed, debug });
    copyHelixRailCriticalDebugFieldsForUi(minimal, parsed, debug);
    minimal.debug = {
      schema: "helix.ask.debug_export_minimal_debug.v1",
      language_contract: parsed.language_contract ?? debug?.language_contract ?? null,
      response_language: parsed.response_language ?? debug?.response_language ?? null,
      source_language: parsed.source_language ?? debug?.source_language ?? null,
      language_detected: parsed.language_detected ?? debug?.language_detected ?? null,
      language_confidence: parsed.language_confidence ?? debug?.language_confidence ?? null,
      code_mixed: parsed.code_mixed ?? debug?.code_mixed ?? null,
      pivot_confidence: parsed.pivot_confidence ?? debug?.pivot_confidence ?? null,
      translated: parsed.translated ?? debug?.translated ?? null,
      server_build_commit: parsed.server_build_commit ?? debug?.server_build_commit ?? null,
      server_build_started_at_ms: parsed.server_build_started_at_ms ?? debug?.server_build_started_at_ms ?? null,
      helix_docs_synthesis_bridge_version:
        parsed.helix_docs_synthesis_bridge_version ?? debug?.helix_docs_synthesis_bridge_version ?? null,
      repo_evidence_relevance_gate: parsed.repo_evidence_relevance_gate ?? debug?.repo_evidence_relevance_gate ?? null,
      docs_synthesis_debug: parsed.docs_synthesis_debug ?? debug?.docs_synthesis_debug ?? null,
      final_answer_source: parsed.final_answer_source ?? debug?.final_answer_source ?? null,
      terminal_artifact_kind: parsed.terminal_artifact_kind ?? debug?.terminal_artifact_kind ?? null,
      terminal_error_code: parsed.terminal_error_code ?? debug?.terminal_error_code ?? null,
      console_assembly_debug: parsed.console_assembly_debug ?? debug?.console_assembly_debug ?? null,
      client_console_assembly_debug: parsed.client_console_assembly_debug ?? debug?.client_console_assembly_debug ?? null,
    };
    copyHelixRailCriticalDebugFieldsForUi(minimal.debug as Record<string, unknown>, parsed, debug);
    minimal.debug_export_size_control = {
      schema: "helix.ask.debug_export_size_control.v1",
      truncated: true,
      truncation_reason: "debug_export_size_limit",
      original_chars: trimmed.length,
      max_chars: HELIX_DEBUG_EXPORT_MAX_UI_CHARS,
      compacted: true,
      final_compacted: true,
      bounded_by: "client_copy_path",
    };
    const text = safeJsonStringify(minimal);
    if (text.length <= HELIX_DEBUG_EXPORT_MAX_UI_CHARS) return text;
    const fallback: Record<string, unknown> = {
      schema: parsed.schema ?? "helix.ask.debug_export.v1",
      active_turn_id: parsed.active_turn_id ?? null,
      selected_final_answer: parsed.selected_final_answer ?? null,
      final_answer_source: parsed.final_answer_source ?? null,
      terminal_artifact_kind: parsed.terminal_artifact_kind ?? null,
      terminal_error_code: parsed.terminal_error_code ?? null,
      ask_entrypoint_required: parsed.ask_entrypoint_required ?? debug?.ask_entrypoint_required ?? null,
      ask_entrypoint_observed: parsed.ask_entrypoint_observed ?? debug?.ask_entrypoint_observed ?? null,
      ask_entrypoint_failure_code: parsed.ask_entrypoint_failure_code ?? debug?.ask_entrypoint_failure_code ?? null,
      blocked_projection_kind: parsed.blocked_projection_kind ?? debug?.blocked_projection_kind ?? null,
      first_broken_rail: parsed.first_broken_rail ?? debug?.first_broken_rail ?? null,
      repair_target: parsed.repair_target ?? debug?.repair_target ?? null,
      server_build_commit: parsed.server_build_commit ?? debug?.server_build_commit ?? null,
      helix_docs_synthesis_bridge_version:
        parsed.helix_docs_synthesis_bridge_version ?? debug?.helix_docs_synthesis_bridge_version ?? null,
      language_contract: parsed.language_contract ?? debug?.language_contract ?? null,
      response_language: parsed.response_language ?? debug?.response_language ?? null,
      llm_route_expected_backend: parsed.llm_route_expected_backend ?? debug?.llm_route_expected_backend ?? null,
      llm_backend_used: parsed.llm_backend_used ?? debug?.llm_backend_used ?? null,
      llm_provider_called: parsed.llm_provider_called ?? debug?.llm_provider_called ?? null,
      repo_evidence_relevance_gate: parsed.repo_evidence_relevance_gate ?? debug?.repo_evidence_relevance_gate ?? null,
      console_assembly_debug: parsed.console_assembly_debug ?? debug?.console_assembly_debug ?? null,
      client_console_assembly_debug: parsed.client_console_assembly_debug ?? debug?.client_console_assembly_debug ?? null,
      debug_export_size_control: minimal.debug_export_size_control,
    };
    applyHelixAskBackendEntrypointFailureProjection({ target: fallback, source: parsed, debug });
    copyHelixRailCriticalDebugFieldsForUi(fallback, parsed, debug);
    return safeJsonStringify(fallback);
  } catch {
    return payload;
  }
}
