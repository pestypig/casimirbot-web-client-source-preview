import type { TCollapseTraceEntry, TMemorySearchHit } from "@shared/essence-persona";
import type { ResonanceBundle, ResonanceCollapse } from "@shared/code-lattice";
import type { KnowledgeProjectExport } from "@shared/knowledge";
import type { WhyBelongs } from "@shared/rationale";
import type { ConsoleTelemetryBundle, PanelTelemetry } from "@shared/desktop";
import type { BadgeTelemetrySnapshot } from "@shared/badge-telemetry";
import type { EssenceProfile, EssenceProfileUpdate } from "@shared/inferenceProfile";
import type { PromptSpec } from "@shared/prompt-spec";
import type { ChatSession } from "@shared/agi-chat";
import type { AgiRefineryRequest } from "@shared/agi-refinery";
import type { HelixAskResponseEnvelope } from "@shared/helix-ask-envelope";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type { HelixRuntimeGoalSession } from "@shared/helix-runtime-goal-session";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import type { HelixTurnInputItem } from "@shared/helix-turn-input-item";
import type { SituationContextPack } from "@shared/helix-situation-context-pack";
import type { LiveSituationArtifact } from "@shared/helix-live-situation-artifact";
import type { LiveAnswerEnvironment } from "@shared/helix-live-answer-environment";
import type {
  HelixAudioIdentityResult,
  HelixAudioIdentitySessionSnapshot,
  HelixCaptureSource,
  HelixSpeakerAuthority,
  HelixSpeakerAuthoritySource,
  HelixSpeakerLabel,
  HelixSpeakerPolicyMode,
  HelixSpeakerRole,
  HelixSpeakerSegment,
  HelixUnknownSpeakerBehavior,
} from "@shared/helix-audio-identity";
import type { HelixDiarizationShadowResult } from "@shared/helix-diarization";
import type {
  ContextCapsuleReplayBundle,
  ContextCapsuleSummary,
} from "@shared/helix-context-capsule";
import {
  getDefaultReasoningTheaterConfig,
  parseReasoningTheaterConfigPayload,
  type ReasoningTheaterConfigResponse,
} from "@/lib/helix/reasoning-theater-config";
import {
  hashVoiceDiagnosticText,
  recordVoiceCallDiagnostic,
  type VoiceCallDiagnosticSnapshot,
} from "@/lib/helix/voice-call-diagnostics";
import { DEFAULT_DESKTOP_ID, pushConsoleTelemetry } from "@/lib/agi/consoleTelemetry";
import { ensureLatestLattice } from "@/lib/agi/resonanceVersion";
import { useResonanceStore } from "@/store/useResonanceStore";
import type { LumaMood } from "@/lib/luma-moods";
import type { CollapseDecision, CollapseStrategyName } from "./orchestrator";
import type { LocalCallSpec } from "@shared/local-call-spec";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";
import { applyImageLensRegionInspectionReceipt } from "@/lib/document-image/imageLensRegionInspectionClient";
import {
  isImageLensRegionInspectionReceiptV1,
  type ImageLensRegionInspectionReceiptV1,
} from "@shared/contracts/image-lens-region-inspection.v1";
import {
  normalizeScientificCalculatorReceiptV1,
  type ScientificCalculatorReceiptV1,
} from "@shared/contracts/scientific-calculator-receipt.v1";
import { ingestPostulateReviewReceiptsFromAskPayload } from "@/lib/agi/proposals";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { ingestScientificEvidenceWorkflowStatusFromAskPayload } from "@/store/useScientificEvidenceWorkflowStore";
import { asksForScientificImageTextEvidenceComparison } from "@shared/helix-scientific-image-intent";
import {
  isHelixRealtimeGroundedFeedbackBindingV1,
  type HelixRealtimeGroundedFeedbackBindingV1,
} from "@shared/contracts/helix-realtime-stage-play.v1";
import {
  continueHelixAskTurnAfterAdmission,
  HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA,
} from "./helixAskTurnAdmissionContinuation";

const HELIX_CONTEXT_CAPSULE_MAX_IDS = 12;

const readAgiRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const readAgiArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const readAgiString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const collectImageLensRegionInspectionReceipts = (payload: unknown): ImageLensRegionInspectionReceiptV1[] => {
  const root = readAgiRecord(payload);
  if (!root) return [];
  const debug = readAgiRecord(root.debug);
  const candidatePackets = [
    ...readAgiArray(root.capability_lane_observation_packets),
    ...readAgiArray(debug?.capability_lane_observation_packets),
  ];
  const candidateResults = [
    ...readAgiArray(root.capability_lane_call_results),
    ...readAgiArray(debug?.capability_lane_call_results),
  ];
  const receipts: ImageLensRegionInspectionReceiptV1[] = [];
  const pushReceipt = (value: unknown) => {
    if (isImageLensRegionInspectionReceiptV1(value)) receipts.push(value);
  };
  const visitNestedReceipts = (value: unknown, depth = 0): void => {
    if (depth > 8) return;
    if (isImageLensRegionInspectionReceiptV1(value)) {
      receipts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach((entry) => visitNestedReceipts(entry, depth + 1));
      return;
    }
    const record = readAgiRecord(value);
    if (!record) return;
    if (record.receipt) pushReceipt(record.receipt);
    Object.values(record).slice(0, 120).forEach((entry) => visitNestedReceipts(entry, depth + 1));
  };
  for (const packet of candidatePackets) {
    const packetRecord = readAgiRecord(packet);
    const stateDelta = readAgiRecord(packetRecord?.state_delta);
    const inspection = readAgiRecord(stateDelta?.visual_analysis_region_inspection);
    pushReceipt(inspection?.receipt);
  }
  for (const result of candidateResults) {
    pushReceipt(readAgiRecord(result)?.receipt);
  }
  visitNestedReceipts(payload);
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    const key = receipt.evidence_id || receipt.region_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ingestImageLensRegionInspectionReceipts = (payload: unknown): void => {
  const root = readAgiRecord(payload);
  const threadId =
    readAgiString(root?.thread_id) ||
    readAgiString(root?.threadId) ||
    readAgiString(root?.turn_id) ||
    readAgiString(root?.turnId) ||
    "helix-ask:image-lens";
  for (const receipt of collectImageLensRegionInspectionReceipts(payload)) {
    applyImageLensRegionInspectionReceipt({
      receipt,
      threadId,
    });
  }
};

const collectScientificCalculatorContextKeys = (
  record: Record<string, unknown> | null,
  inherited: string[] = [],
): string[] => {
  if (!record) return inherited;
  const debug = readAgiRecord(record.debug);
  const accountSession = readAgiRecord(record.account_session ?? debug?.account_session);
  const activeCalculatorContext = readAgiRecord(
    record.activeCalculatorContext ??
    record.active_calculator_context ??
    debug?.activeCalculatorContext ??
    debug?.active_calculator_context,
  );
  const workspaceSnapshot = readAgiRecord(record.workspace_context_snapshot ?? debug?.workspace_context_snapshot);
  const workspaceCalculatorContext = readAgiRecord(workspaceSnapshot?.activeCalculatorContext);
  const candidates = [
    ["ask:turn", readAgiString(record.turn_id) || readAgiString(record.turnId)],
    ["ask:thread", readAgiString(record.thread_id) || readAgiString(record.threadId)],
    ["ask:session", readAgiString(record.session_id) || readAgiString(record.sessionId)],
    ["account", readAgiString(accountSession?.account_id) || readAgiString(accountSession?.accountId)],
    ["workspace", readAgiString(record.workspace_id) || readAgiString(record.workspaceId)],
    ["calculator:receipt", readAgiString(record.calculator_receipt_ref) || readAgiString(activeCalculatorContext?.calculator_receipt_ref)],
    ["calculator:receipt", readAgiString(workspaceCalculatorContext?.calculator_receipt_ref)],
    ["calculator:source", readAgiString(record.source_id) || readAgiString(record.sourceId)],
    ["calculator:source_hash", readAgiString(record.source_hash) || readAgiString(record.sourceHash)],
  ];
  return Array.from(new Set([
    ...inherited,
    ...candidates.flatMap(([prefix, value]) => value ? [`${prefix}:${value}`] : []),
  ]));
};

const collectScientificCalculatorReceipts = (payload: unknown): ScientificCalculatorReceiptV1[] => {
  const receipts: ScientificCalculatorReceiptV1[] = [];
  const seenObjects = new WeakSet<object>();

  const rootContextKeys = collectScientificCalculatorContextKeys(readAgiRecord(payload));

  const pushReceipt = (
    value: unknown,
    meta: { artifactId?: string | null; receiptId?: string | null; contextKeys?: string[] } = {},
  ) => {
    const normalized = normalizeScientificCalculatorReceiptV1(value, meta);
    if (!normalized) return;
    if (!normalized.expression.trim() && !normalized.result_text && normalized.missing_bindings.length === 0 && normalized.blockers.length === 0) {
      return;
    }
    receipts.push(normalized);
  };

  const visit = (
    value: unknown,
    depth = 0,
    meta: { artifactId?: string | null; receiptId?: string | null; contextKeys?: string[] } = { contextKeys: rootContextKeys },
  ): void => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      value.slice(0, 120).forEach((entry) => visit(entry, depth + 1, meta));
      return;
    }
    const record = readAgiRecord(value);
    if (!record) return;
    if (seenObjects.has(record)) return;
    seenObjects.add(record);

    const artifactId =
      readAgiString(record.artifact_id) ||
      readAgiString(record.artifactId) ||
      readAgiString(record.ref) ||
      meta.artifactId ||
      null;
    const receiptId = readAgiString(record.receipt_id) || meta.receiptId || null;
    const contextKeys = collectScientificCalculatorContextKeys(record, meta.contextKeys ?? rootContextKeys);
    const nextMeta = { artifactId, receiptId, contextKeys };
    const schema = readAgiString(record.schema);
    const kind = readAgiString(record.kind);

    if (schema === "helix.scientific_calculator_receipt.v1" || schema === "helix.calculator_receipt.v1") {
      pushReceipt(record, nextMeta);
    }
    if (kind === "calculator_receipt") {
      pushReceipt(record, nextMeta);
      pushReceipt(record.payload, nextMeta);
      pushReceipt(record.receipt, nextMeta);
    }
    pushReceipt(record.calculator_receipt, nextMeta);
    pushReceipt(record.lastCalculatorReceipt, nextMeta);
    pushReceipt(record.last_calculator_receipt, nextMeta);

    Object.values(record).slice(0, 160).forEach((entry) => visit(entry, depth + 1, nextMeta));
  };

  visit(payload);
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    const key = `${receipt.receipt_id}:${receipt.status}:${receipt.expression}:${receipt.result_text ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const ingestScientificCalculatorReceiptsFromAskPayload = (payload: unknown): ScientificCalculatorReceiptV1[] => {
  const receipts = collectScientificCalculatorReceipts(payload);
  if (receipts.length === 0) return [];
  const store = useScientificCalculatorStore.getState();
  const existing = new Set(
    store.calculatorReceipts.map((receipt) => `${receipt.receipt_id}:${receipt.status}:${receipt.expression}:${receipt.result_text ?? ""}`),
  );
  const applied: ScientificCalculatorReceiptV1[] = [];
  for (const receipt of receipts) {
    const key = `${receipt.receipt_id}:${receipt.status}:${receipt.expression}:${receipt.result_text ?? ""}`;
    if (existing.has(key)) continue;
    useScientificCalculatorStore.getState().recordCalculatorReceipt(receipt);
    existing.add(key);
    applied.push(receipt);
  }
  return applied;
};

export type PlanResponse = {
  traceId: string;
  plan: unknown;
  manifest?: unknown;
  plan_dsl?: string;
  plan_steps?: unknown[];
  executor_steps?: unknown[];
  prompt?: string;
  planner_prompt?: string;
  telemetry_bundle?: ConsoleTelemetryBundle | null;
  telemetry_summary?: string | Record<string, unknown> | null;
  lattice_version?: number | string | null;
  resonance_bundle?: ResonanceBundle | null;
  resonance_selection?: ResonanceCollapse | null;
  debate_id?: string | null;
  strategy?: string | null;
  strategy_notes?: string[];
  collapse_trace?: TCollapseTraceEntry | null;
  collapse_strategy?: string | null;
  call_spec?: LocalCallSpec | null;
  task_trace?: unknown;
};

export type ExecuteResponse = {
  ok: boolean;
  steps: unknown[];
  result_summary?: string;
  traceId?: string;
  why_belongs?: WhyBelongs;
  planner_prompt?: string;
  telemetry_bundle?: ConsoleTelemetryBundle | null;
  telemetry_summary?: string | Record<string, unknown> | null;
  lattice_version?: number | string | null;
  resonance_bundle?: ResonanceBundle | null;
  resonance_selection?: ResonanceCollapse | null;
  debate_id?: string | null;
};

export type AtomicViewerLaunchParams = {
  model: "quantum" | "classical";
  Z: number;
  n: number;
  l: number;
  m: number;
  sampleCount?: number;
  stress_energy_proxy?: {
    schema_version: "atomic_stress_energy_proxy/1";
    value_J_m3: number;
    units: {
      value: "J/m^3";
      uncertainty: "relative_1sigma";
    };
    uncertainty: {
      relative_1sigma: number;
      absolute_1sigma_J_m3: number;
      confidence: number;
    };
    equation: {
      id: "atomic_stress_energy_proxy_eq.v1";
      expression: string;
    };
    citations: string[];
    claim_tier: "diagnostic";
    provenance_class: "proxy";
    certifying: false;
  };
};

export type AtomicViewerLaunch = {
  viewer: "atomic-orbital";
  panel_id: "electron-orbital";
  tree_id: string;
  source_path?: string;
  params: AtomicViewerLaunchParams;
};

export type HelixActionEnvelope = {
  schema: "helix.ask.action_envelope.v1";
  mode: "read" | "observe" | "act" | "verify";
  governance?: {
    dispatch?: "allow" | "suppress";
    reason_code?: string;
    approval_state?: "not_required" | "required";
    sandbox_profile?: "workstation_ui_only";
  };
  source?: "viewer_launch" | "actionability_plan" | "mixed";
  subgoal?: string;
  confidence?: number;
  workstation_actions?: Array<HelixWorkstationAction | Record<string, unknown>>;
  viewer_launch?: AtomicViewerLaunch;
};

export type HelixAskAnswerContractSection = {
  id: string;
  heading: string;
  required?: boolean;
  synonyms?: string[];
};

export type HelixAskAnswerContract = {
  schema: "helix.ask.answer_contract.v1";
  source: "docs_viewer";
  mode: "summarize_doc" | "summarize_section" | "explain_paper" | "locate_in_doc";
  strict_sections?: boolean;
  sections?: HelixAskAnswerContractSection[];
  min_tokens?: number;
};

export type LocalAskProof = {
  verdict?: "PASS" | "FAIL";
  firstFail?: unknown;
  certificate?: { certificateHash?: string | null; integrityOk?: boolean | null } | null;
  artifacts?: Array<{ kind: string; ref: string; label?: string }>;
  evidence?: unknown[];
};

export type HelixMemoryCitationEntry = {
  path: string;
  line_start?: number | null;
  line_end?: number | null;
  note: string;
};

export type HelixMemoryCitation = {
  entries: HelixMemoryCitationEntry[];
  rollout_ids: string[];
};

export type HaloBankPlace = {
  lat: number;
  lon: number;
  tz?: string;
  label?: string;
};

export type HaloBankComparisonDeltas = {
  dDuration_s?: number;
  dGravExposure_ns?: number;
  dKinExposure_ns?: number;
  dCombExposure_ns?: number;
  dSunExposure_uGal_s?: number;
  dMoonExposure_uGal_s?: number;
  dNetExposure_uGal_s?: number;
  dSunCausal_s?: number;
  dMoonCausal_s?: number;
  overSun?: number;
  overMoon?: number;
  dUbar1m?: number;
  dUbar1h?: number;
  dTS1m?: number;
  dTS1h?: number;
  dNetBearing?: number;
  dNetMag?: number;
  dLightAlong_ms?: number;
  dP2sun?: number;
  dP2moon?: number;
  dPhaseSyn?: number;
  dNodal?: number;
  dPerigee?: number;
};

export type HaloBankActionOutput = {
  ok?: boolean;
  message?: string;
  model?: {
    name?: string;
    version?: string;
    maturity?: string;
    assumptions?: string[];
  };
  primary?: {
    timestamp?: string;
    timestampMs?: number;
    place?: HaloBankPlace;
    durationMs?: number;
    duration_s?: number;
    tides?: { sun_uGal?: number; moon_uGal?: number; net_uGal?: number };
    voxel?: { grav_ns_per_1s?: number; kin_ns_per_1s?: number; combined_ns_per_1s?: number; sunLightTime_s?: number; moonLightTime_s?: number };
    envelope?: { Ubar_1m?: number; Ubar_1h?: number; TS_envelope_1m?: number; TS_envelope_1h?: number };
    tideNet?: { ah_uGal?: number; bearingDeg?: number; x_uGal?: number; y_uGal?: number };
    geometryP2?: { P2sun?: number; P2moon?: number };
    sunMoon?: { phaseDeg?: number; nodalPhaseDeg?: number; perigeePhaseDeg?: number };
  };
  comparison?: {
    primary?: { timestamp?: string; place?: HaloBankPlace; durationMs?: number };
    secondary?: { timestamp?: string; place?: HaloBankPlace; durationMs?: number };
    deltas?: HaloBankComparisonDeltas;
  };
};

export type LocalAskResponse = {
  text: string;
  assistant_answer?: string;
  selected_final_answer?: string | null;
  final_answer_source?: string | null;
  terminal_artifact_kind?: string | null;
  terminal_artifact_id?: string | null;
  terminal_artifact_owner_turn_id?: string | null;
  terminal_result?: Record<string, unknown> | null;
  terminal_results?: unknown[];
  runtime_goal_command?: Record<string, unknown> | null;
  runtime_goal_session?: Record<string, unknown> | null;
  runtime_goal_debug_export?: Record<string, unknown> | null;
  runtime_goal_wake_candidate?: Record<string, unknown> | null;
  runtime_goal_wake_admission?: Record<string, unknown> | null;
  debug_export_ref?: Record<string, unknown> | null;
  backend_debug_response_ref?: Record<string, unknown> | null;
  golden_path_runtime?: Record<string, unknown> | null;
  golden_path_runtime_status?: string | null;
  stream_mode?: string | null;
  server_build_commit?: string | null;
  server_build_started_at_ms?: number | null;
  final_artifact_scope?: string | null;
  satisfaction_report?: Record<string, unknown> | null;
  current_turn_artifact_ledger?: unknown[];
  equation_extraction_attempt?: Record<string, unknown> | null;
  equation_attempt_debug?: Record<string, unknown> | null;
  resolved_turn_summary?: Record<string, unknown> | null;
  route_history_debug?: Record<string, unknown> | null;
  rejected_terminal_candidates?: unknown[];
  rejected_prior_artifacts?: unknown[];
  canonical_goal_frame?: unknown;
  terminal_consistency_check?: unknown;
  agent_loop_summary?: string;
  ok?: boolean;
  turn_id?: string | null;
  answer_surface_mode?: "conversational" | "structured_report" | "fail_closed";
  error?: string;
  message?: string;
  needs_confirmation?: boolean;
  interpreter_confirm_prompt?: string | null;
  fail_reason?: string | null;
  fail_class?: string | null;
  client_transport_fallback?: boolean;
  client_transport_fallback_reason?: string | null;
  fallback_blocked?: boolean;
  fallback_block_reason?: string | null;
  terminal_eligible?: boolean;
  authorityVerified?: boolean;
  memory_citation?: HelixMemoryCitation | null;
  context_capsule?: ContextCapsuleSummary;
  situation_context_pack?: SituationContextPack | null;
  live_situation_artifact?: LiveSituationArtifact | null;
  live_answer_environment?: LiveAnswerEnvironment | null;
  mode?: "read" | "observe" | "act" | "verify";
  action?: { tool?: string; output?: unknown | HaloBankActionOutput };
  proof?: LocalAskProof;
  envelope?: HelixAskResponseEnvelope;
  viewer_launch?: AtomicViewerLaunch;
  action_envelope?: HelixActionEnvelope;
  agent_loop_audit?: Record<string, unknown>;
  turn_truth_table?: Record<string, unknown>;
  planner_contract?: Record<string, unknown>;
  execution_trace?: unknown[];
  execution_lifecycle?: unknown[];
  step_results?: unknown[];
  turn_events?: unknown[];
  turn_transcript_events?: unknown[];
  turn_transcript_event_count?: number;
  turn_transcript_source?: string | null;
  runtime_event_count?: number;
  runtime_loop_mode?: string | null;
  async_executor_used?: boolean;
  async_step_count?: number;
  async_total_duration_ms?: number;
  async_step_durations?: unknown[];
  model_decision_llm_used?: boolean;
  model_decision_count?: number;
  model_decision_audits?: unknown[];
  turn_runtime?: Record<string, unknown>;
  workspace_context_snapshot?: Record<string, unknown>;
  turn_contract?: Record<string, unknown>;
  invariant_violations?: unknown[];
  latest_result_artifact?: Record<string, unknown>;
  job_ready_links?: unknown[];
  route_reason_code?: string | null;
  dispatch_policy?: string | null;
  pending_request?: Record<string, unknown> | null;
  pending_server_request?: Record<string, unknown> | null;
  pending_intercepted_turn?: boolean;
  pending_interception_reason?: string | null;
  pending_resolution_reason?: string | null;
  pending_status_before?: string | null;
  pending_status_after?: string | null;
  pending_transition_reason?: string | null;
  pending_transition_trace?: unknown[];
  model?: string;
  essence_id?: string;
  seed?: number;
  duration_ms?: number;
  prompt_ingested?: boolean;
  prompt_ingest_source?: string;
  prompt_ingest_reason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    max_tokens?: number;
  };
  debug?: {
    two_pass?: boolean;
    micro_pass?: boolean;
    micro_pass_auto?: boolean;
    micro_pass_reason?: string;
    scaffold?: string;
    evidence_cards?: string;
    query_hints?: string[];
    queries?: string[];
    context_files?: string[];
    prompt_ingested?: boolean;
    prompt_ingest_source?: string;
    prompt_ingest_reason?: string;
    prompt_chunk_count?: number;
    prompt_selected?: number;
    prompt_context_files?: string[];
    prompt_context_points?: string[];
    prompt_used_sections?: string[];
    intent_id?: string;
    intent_domain?: string;
    intent_tier?: string;
    intent_secondary_tier?: string;
    intent_strategy?: string;
    intent_reason?: string;
    arbiter_mode?: "repo_grounded" | "hybrid" | "general" | "clarify";
    arbiter_reason?: string;
    arbiter_strictness?: "low" | "med" | "high";
    arbiter_user_expects_repo?: boolean;
    arbiter_repo_ok?: boolean;
    arbiter_hybrid_ok?: boolean;
    arbiter_ratio?: number;
    arbiter_topic_ok?: boolean;
    arbiter_concept_match?: boolean;
    math_solver_ok?: boolean;
    math_solver_kind?: string;
    math_solver_final?: string;
    math_solver_reason?: string;
    math_solver_variable?: string;
    math_solver_gate_pass?: boolean;
    math_solver_gate_reason?: string;
    math_solver_domain_pass?: boolean;
    math_solver_residual_pass?: boolean;
    math_solver_residual_max?: number;
    math_solver_registry_id?: string;
    math_solver_selected_solution?: string;
    math_solver_admissible_count?: number;
    math_solver_maturity?: string;
    evidence_gate_ok?: boolean;
    evidence_match_ratio?: number;
    evidence_match_count?: number;
    evidence_token_count?: number;
    evidence_claim_count?: number;
    evidence_claim_supported?: number;
    evidence_claim_unsupported?: number;
    evidence_claim_ratio?: number;
    evidence_claim_gate_ok?: boolean;
    evidence_claim_missing?: string[];
    evidence_critic_applied?: boolean;
    evidence_critic_ok?: boolean;
    evidence_critic_ratio?: number;
    evidence_critic_count?: number;
    evidence_critic_tokens?: number;
    ambiguity_terms?: string[];
    ambiguity_gate_applied?: boolean;
    overflow_retry_applied?: boolean;
    overflow_retry_steps?: string[];
    overflow_retry_labels?: string[];
    overflow_retry_attempts?: number;
    citation_repair?: boolean;
    format?: "steps" | "compare" | "brief";
    stage_tags?: boolean;
    verbosity?: "brief" | "normal" | "extended";
    junk_clean_applied?: boolean;
    junk_clean_reasons?: string[];
    concept_lint_applied?: boolean;
    concept_lint_reasons?: string[];
    coverage_token_count?: number;
    coverage_key_count?: number;
    coverage_missing_key_count?: number;
    coverage_ratio?: number;
    coverage_missing_keys?: string[];
    coverage_gate_applied?: boolean;
    coverage_gate_reason?: string;
    belief_claim_count?: number;
    belief_supported_count?: number;
    belief_unsupported_count?: number;
    belief_unsupported_rate?: number;
    belief_contradictions?: number;
    belief_gate_applied?: boolean;
    belief_gate_reason?: string;
    belief_graph_node_count?: number;
    belief_graph_edge_count?: number;
    belief_graph_claim_count?: number;
    belief_graph_definition_count?: number;
    belief_graph_conclusion_count?: number;
    belief_graph_evidence_ref_count?: number;
    belief_graph_constraint_count?: number;
    belief_graph_supports?: number;
    belief_graph_contradicts?: number;
    belief_graph_depends_on?: number;
    belief_graph_maps_to?: number;
    belief_graph_claim_ids?: string[];
    belief_graph_unsupported_claim_ids?: string[];
    belief_graph_contradiction_ids?: string[];
    rattling_score?: number;
    rattling_base_distance?: number;
    rattling_perturbation_distance?: number;
    rattling_claim_set_count?: number;
    rattling_gate_applied?: boolean;
    variant_selection_applied?: boolean;
    variant_selection_reason?: string;
    variant_selection_label?: string;
    variant_selection_candidate_count?: number;
    capsule_dialogue_applied_count?: number;
    capsule_evidence_applied_count?: number;
    capsule_retry_applied?: boolean;
    capsule_retry_triggered?: boolean;
    capsule_retry_reason?: string;
    capsule_latest_topic_shift?: boolean;
    capsule_must_keep_terms?: string[];
    capsule_preferred_paths?: string[];
    focus_guard_result?: "pass" | "retry" | "clarify";
    anchor_guard_result?: "pass" | "retry" | "clarify";
    retrieval_channel_hits?: string;
    stage0_used?: boolean;
    stage0_shadow_only?: boolean;
    stage0_candidate_count?: number;
    stage0_hit_rate?: number;
    stage0_fallback_reason?: string | null;
    stage0_build_age_ms?: number | null;
    stage0_commit?: string | null;
    stage0_rollout_mode?: "off" | "shadow" | "partial" | "full" | null;
    stage0_canary_hit?: boolean;
    stage0_soft_must_include_applied?: boolean;
    stage0_policy_decision?: string | null;
    stage0_fail_open_reason?: string | null;
    stage0_code_floor_pass?: boolean;
    stage0_code_path_count?: number;
    stage0_doc_path_count?: number;
    stage05_used?: boolean;
    stage05_file_count?: number;
    stage05_card_count?: number;
    stage05_kind_counts?: {
      code?: number;
      doc?: number;
      config?: number;
      data?: number;
      binary?: number;
    } | null;
    stage05_llm_used?: boolean;
    stage05_fallback_reason?: string | null;
    stage05_extract_ms?: number;
    stage05_total_ms?: number;
    stage05_budget_capped?: boolean;
    stage05_summary_required?: boolean;
    stage05_summary_hard_fail?: boolean;
    stage05_summary_fail_reason?: string | null;
    stage05_slot_plan?: {
      mode?: "dynamic" | "static";
      slots?: string[];
      required?: string[];
    } | null;
    stage05_slot_coverage?: {
      required?: string[];
      present?: string[];
      missing?: string[];
      ratio?: number;
    } | null;
    stage05_fullfile_mode?: boolean;
    stage05_two_pass_used?: boolean;
    stage05_two_pass_batches?: number;
    stage05_overflow_policy?: "single_pass" | "two_pass" | null;
    reasoning_theater_state_v1?: HelixAskReasoningTheaterStateV1;
    fail_reason?: string | null;
    fail_class?: string | null;
    helix_ask_fail_reason?: string | null;
    helix_ask_fail_class?: string | null;
    [key: string]: unknown;
  };
};

export type HelixAskTurnStreamEvent = {
  event: "turn_transcript_event" | "turn_final" | "turn_error" | string;
  data: unknown;
};

type RunAskTurnPayload = {
  question: string;
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  languageModelProfile?: "auto" | "fast" | "balanced" | "deep";
  language_model_profile?: "auto" | "fast" | "balanced" | "deep";
  languageModelOverride?: string;
  language_model_override?: string;
  goldenPathRuntime?: boolean;
  golden_path_runtime?: boolean;
  sessionId?: string;
  traceId?: string;
  turnId?: string;
  personaId?: string;
  sourceLanguage?: string;
  languageDetected?: string;
  languageConfidence?: number;
  codeMixed?: boolean;
  pivotConfidence?: number;
  responseLanguage?: string;
  preferredResponseLanguage?: string;
  interpreter?: HelixInterpreterArtifact;
  interpreter_schema_version?: "helix.interpreter.v1" | string;
  multilangConfirm?: boolean;
  lang_schema_version?: "helix.lang.v1" | string;
  translated?: boolean;
  maxTokens?: number;
  mode?: "read" | "observe" | "act" | "verify";
  contextMode?: "attached" | "isolated";
  contextFiles?: string[];
  workspaceContextSnapshot?: Record<string, unknown>;
  turnInputItems?: HelixTurnInputItem[];
  debug?: boolean;
  capsuleIds?: string[];
  answerContract?: HelixAskAnswerContract;
  routeMetadata?: HelixAskRouteMetadata;
  route_metadata?: HelixAskRouteMetadata;
  realtimeGroundedFeedbackBinding?: HelixRealtimeGroundedFeedbackBindingV1;
  realtime_grounded_feedback_binding?: HelixRealtimeGroundedFeedbackBindingV1;
  capability_lane_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  capability_lane_session_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneSessionCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  signal?: AbortSignal;
};

export type RuntimeGoalWakeCandidatePayload = {
  goalId?: string | null;
  goal_id?: string | null;
  eventKind?: string;
  event_kind?: string;
  sourceKind?: string;
  source_kind?: string;
  docPath?: string | null;
  doc_path?: string | null;
  activePanelId?: string | null;
  active_panel_id?: string | null;
  sourceId?: string | null;
  source_id?: string | null;
  sourceHash?: string | null;
  source_hash?: string | null;
  sourceLabel?: string | null;
  source_label?: string | null;
  reason?: string;
  dedupeKey?: string;
  dedupe_key?: string;
  sourceFreshnessMs?: number | null;
  source_freshness_ms?: number | null;
  freshnessStatus?: "fresh" | "stale" | "unknown";
  freshness_status?: "fresh" | "stale" | "unknown";
  proposedTool?: string | null;
  proposed_tool?: string | null;
  requiresUserVisibleTurn?: boolean;
  requires_user_visible_turn?: boolean;
  observedAtMs?: number;
  observed_at_ms?: number;
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  turnId?: string;
  turn_id?: string;
  realtimeHandoffId?: string;
  realtime_handoff_id?: string;
  question?: string;
  workspaceContextSnapshot?: Record<string, unknown>;
  workspace_context_snapshot?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type RuntimeGoalWakeCandidateResponse = LocalAskResponse & {
  runtime_goal_wake_candidate?: Record<string, unknown> | null;
  runtime_goal_wake_admission?: Record<string, unknown> | null;
};

export type RuntimeGoalActiveSessionResponse = {
  ok?: boolean;
  schema?: "helix.runtime_goal.active_session_response.v1" | string;
  active?: boolean;
  runtime_goal_session?: HelixRuntimeGoalSession | null;
  assistant_answer?: false;
  terminal_eligible?: false;
  raw_content_included?: false;
};

export type RunCapabilityLaneSessionControlPayload = {
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  turnId?: string;
  turn_id?: string;
  capability_lane_session_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneSessionCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  signal?: AbortSignal;
};

export type ListCapabilityLaneSessionsPayload = {
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  laneSessionId?: string;
  lane_session_id?: string;
  laneId?: string;
  lane_id?: string;
  sourceId?: string;
  source_id?: string;
  sourceHash?: string;
  source_hash?: string;
  sourceBindingKey?: string;
  source_binding_key?: string;
  sourceIdentityKey?: string;
  source_identity_key?: string;
  latestSourceIdentityKey?: string;
  latest_source_identity_key?: string;
  projectionTarget?: string;
  projection_target?: string;
  accountLocale?: string;
  account_locale?: string;
  targetLanguage?: string;
  target_language?: string;
  signal?: AbortSignal;
};

export type RunCapabilityLaneGoalBindingControlPayload = {
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  turnId?: string;
  turn_id?: string;
  capability_lane_goal_binding_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneGoalBindingCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  signal?: AbortSignal;
};

export type RunCapabilityLaneMailLoopPayload = {
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  turnId?: string;
  turn_id?: string;
  threadId?: string;
  thread_id?: string;
  roomId?: string;
  room_id?: string;
  environmentId?: string;
  environment_id?: string;
  objectiveText?: string;
  objective_text?: string;
  laneSessionId?: string;
  lane_session_id?: string;
  capability_lane_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  signal?: AbortSignal;
};

export type RunCapabilityLaneOneShotPayload = {
  agentRuntime?: HelixAgentRuntimeId;
  agent_runtime?: HelixAgentRuntimeId;
  turnId?: string;
  turn_id?: string;
  capability_lane_call?: Record<string, unknown> | Array<Record<string, unknown>>;
  capabilityLaneCall?: Record<string, unknown> | Array<Record<string, unknown>>;
  signal?: AbortSignal;
};

export type CapabilityLaneOneShotResponse = {
  schema?: "helix.capability_lane.one_shot_response.v1" | string;
  ok?: boolean;
  requested?: boolean;
  agent_runtime?: HelixAgentRuntimeId | string;
  selected_agent_provider?: Record<string, unknown>;
  capability_lane_call_results?: Array<Record<string, unknown>>;
  capability_lane_observation_packets?: Array<Record<string, unknown>>;
  capability_lane_resolve_traces?: Array<Record<string, unknown>>;
  capability_lane_backend_selections?: Array<Record<string, unknown>>;
  capability_lane_debug_events?: Array<Record<string, unknown>>;
  capability_lane_projection_receipts?: Array<Record<string, unknown>>;
  capability_lane_turn_timeline?: Array<Record<string, unknown>>;
  capability_lane_timeline_summary?: Record<string, unknown>;
  capability_lane_reentry_status?: string;
  model_visible_capability_lane_manifest?: Record<string, unknown> | null;
  terminal_eligible?: false;
  assistant_answer?: false;
  raw_content_included?: false;
  error?: string;
  message?: string;
};

export type CapabilityLaneSessionControlResponse = {
  schema?: "helix.capability_lane.session_control_response.v1" | string;
  ok?: boolean;
  agent_runtime?: HelixAgentRuntimeId | string;
  selected_agent_provider?: Record<string, unknown>;
  capability_lane_session_results?: Array<Record<string, unknown>>;
  capability_lane_session_debug_summaries?: Array<Record<string, unknown>>;
  capability_lane_turn_timeline?: Array<Record<string, unknown>>;
  capability_lane_timeline_summary?: Record<string, unknown>;
  model_visible_capability_lane_manifest?: Record<string, unknown> | null;
  session_results?: Array<Record<string, unknown>>;
  session_debug_summaries?: Array<Record<string, unknown>>;
  context_role?: "tool_evidence";
  answer_authority?: false;
  terminal_eligible?: false;
  assistant_answer?: false;
  raw_content_included?: false;
  error?: string;
  message?: string;
};

export type CapabilityLaneSessionListResponse = {
  schema?: "helix.capability_lane.session_list_response.v1" | string;
  ok?: boolean;
  session_count?: number;
  adapter_boundary?: "helix_agent_provider_edge" | string;
  selected_runtime_agent_providers?: Array<HelixAgentRuntimeId | string>;
  selected_agent_providers?: Array<Record<string, unknown>>;
  filters?: Record<string, unknown>;
  capability_lane_sessions?: Array<Record<string, unknown>>;
  capability_lane_session_debug_summaries?: Array<Record<string, unknown>>;
  capability_lane_turn_timeline?: Array<Record<string, unknown>>;
  capability_lane_timeline_summary?: Record<string, unknown>;
  context_role?: "tool_evidence";
  answer_authority?: false;
  terminal_eligible?: false;
  assistant_answer?: false;
  raw_content_included?: false;
  error?: string;
  message?: string;
};

export type CapabilityLaneGoalBindingControlResponse = {
  schema?: "helix.capability_lane.goal_binding_control_response.v1" | string;
  ok?: boolean;
  requested?: boolean;
  agent_runtime?: HelixAgentRuntimeId | string;
  selected_agent_provider?: Record<string, unknown>;
  capability_lane_goal_binding_results?: Array<Record<string, unknown>>;
  capability_lane_goal_binding_debug_summaries?: Array<Record<string, unknown>>;
  capability_lane_mail_loop_debug_summaries?: Array<Record<string, unknown>>;
  capability_lane_turn_timeline?: Array<Record<string, unknown>>;
  capability_lane_timeline_summary?: Record<string, unknown>;
  model_visible_capability_lane_manifest?: Record<string, unknown> | null;
  context_role?: "tool_evidence";
  terminal_eligible?: false;
  assistant_answer?: false;
  raw_content_included?: false;
  error?: string;
  message?: string;
};

export type CapabilityLaneMailLoopResponse = {
  schema?: "helix.capability_lane.mail_loop_response.v1" | string;
  ok?: boolean;
  requested?: boolean;
  agent_runtime?: HelixAgentRuntimeId | string;
  selected_agent_provider?: Record<string, unknown>;
  capability_lane_call_results?: Array<Record<string, unknown>>;
  capability_lane_observation_packets?: Array<Record<string, unknown>>;
  capability_lane_projection_receipts?: Array<Record<string, unknown>>;
  capability_lane_mail_loop_results?: Array<Record<string, unknown>>;
  capability_lane_mail_loop_debug_summaries?: Array<Record<string, unknown>>;
  capability_lane_turn_timeline?: Array<Record<string, unknown>>;
  capability_lane_timeline_summary?: Record<string, unknown>;
  model_visible_capability_lane_manifest?: Record<string, unknown> | null;
  terminal_eligible?: false;
  assistant_answer?: false;
  raw_content_included?: false;
  error?: string;
  message?: string;
};

const appendHelixAskRouteMetadataToBody = (
  body: Record<string, unknown>,
  routeMetadata?: HelixAskRouteMetadata,
): void => {
  if (!routeMetadata) return;
  body.route_metadata = routeMetadata;
  const routeMetadataRecord = routeMetadata as unknown as Record<string, unknown>;
  const groundedFeedbackBinding =
    routeMetadataRecord.realtime_grounded_feedback_binding ??
    routeMetadataRecord.realtimeGroundedFeedbackBinding;
  if (isHelixRealtimeGroundedFeedbackBindingV1(groundedFeedbackBinding)) {
    body.realtime_grounded_feedback_binding = groundedFeedbackBinding;
  }
  if (routeMetadata.source_target_intent) {
    body.source_target_intent = routeMetadata.source_target_intent;
  }
  if (routeMetadata.stage_play_live_source_mailbox_debug) {
    body.stage_play_live_source_mailbox_debug = routeMetadata.stage_play_live_source_mailbox_debug;
  }
  if (routeMetadata.live_source_mailbox_authority_summary) {
    body.live_source_mailbox_authority_summary = routeMetadata.live_source_mailbox_authority_summary;
  }
  if (routeMetadata.mandatory_next_tool) {
    body.mandatory_next_tool = routeMetadata.mandatory_next_tool;
  }
};

export type HelixAskReasoningTheaterPhase =
  | "observe"
  | "plan"
  | "retrieve"
  | "gate"
  | "synthesize"
  | "verify"
  | "execute"
  | "debrief";

export type HelixAskReasoningTheaterStance = "winning" | "contested" | "losing" | "fail_closed";

export type HelixAskReasoningTheaterArchetype =
  | "ambiguity"
  | "missing_evidence"
  | "coverage_gap"
  | "contradiction"
  | "overload";

export type HelixAskReasoningTheaterSuppressionReason =
  | "context_ineligible"
  | "dedupe_cooldown"
  | "mission_rate_limited"
  | "voice_rate_limited"
  | "voice_budget_exceeded"
  | "voice_backend_error"
  | "missing_evidence"
  | "contract_violation"
  | "agi_overload_admission_control";

export type HelixAskReasoningTheaterStateV1 = {
  contract_version: "reasoning_theater.v1";
  trace_id: string;
  mission_id?: string;
  event_id?: string;
  phase: HelixAskReasoningTheaterPhase;
  archetype: HelixAskReasoningTheaterArchetype;
  certainty_class: "confirmed" | "reasoned" | "hypothesis" | "unknown";
  suppression_reason: HelixAskReasoningTheaterSuppressionReason | null;
  telemetry: {
    evidence_gate_ok: boolean | null;
    coverage_ratio: number | null;
    evidence_claim_ratio: number | null;
    belief_unsupported_rate: number | null;
    belief_contradictions: number | null;
    ambiguity_term_count: number;
    graph_block_ratio: number | null;
    graph_cross_tree_ratio: number | null;
    alignment_margin: number | null;
    alignment_decision: "PASS" | "BORDERLINE" | "FAIL" | null;
    event_latency_ms_p95: number | null;
    suppression_active: boolean;
    proof_verdict: "PASS" | "FAIL" | null;
    certificate_integrity_ok: boolean | null;
  };
  indices: {
    momentum: number;
    ambiguity_pressure: number;
    battle_index: number;
  };
  stance: HelixAskReasoningTheaterStance;
  scenario_id: string;
  seed: number;
  ts: string;
};

export type HelixAskJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type HelixAskJobCreateResponse = {
  jobId: string;
  status: HelixAskJobStatus;
  sessionId?: string | null;
  traceId?: string | null;
};

export type HelixAskJobResponse = {
  jobId: string;
  status: HelixAskJobStatus;
  createdAt?: number;
  updatedAt?: number;
  expiresAt?: number;
  sessionId?: string | null;
  traceId?: string | null;
  partialText?: string | null;
  error?: string | null;
  result?: LocalAskResponse | null;
};

export type PendingHelixAskJob = {
  jobId: string;
  question?: string;
  sessionId?: string | null;
  traceId?: string | null;
  startedAt?: number;
};

export type MoodHintResponse = {
  mood: LumaMood | null;
  confidence: number;
  reason?: string | null;
  source?: string;
  durationMs?: number;
  traceId?: string;
  sessionId?: string | null;
  raw?: string | null;
};

export async function searchCodeLattice(
  query: string,
  limit = 12,
): Promise<KnowledgeProjectExport> {
  return asJson(
    await fetch("/api/code-lattice/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    }),
  );
}

export type ToolLogEvent = {
  id?: string;
  seq?: number;
  ts?: string;
  traceId?: string;
  sessionId?: string;
  tool?: string;
  ok?: boolean;
  text?: string;
  stage?: string;
  detail?: string;
  message?: string;
  meta?: Record<string, unknown>;
  debateId?: string;
  promptHash?: string;
  paramsHash?: string;
  durationMs?: number;
  stepId?: string;
  strategy?: string;
};

let reasoningTheaterConfigPromise: Promise<ReasoningTheaterConfigResponse> | null = null;
let reasoningTheaterTopologyPromise: Promise<ReasoningTheaterTopologyResponse> | null = null;
let reasoningTheaterAtlasGraphPromise: Promise<ReasoningTheaterAtlasGraphResponse> | null = null;
const reasoningTheaterCongruenceGraphPromiseByKey = new Map<
  string,
  Promise<ReasoningTheaterCongruenceGraphResponse>
>();
const contextCapsulePromiseByKey = new Map<string, Promise<ContextCapsuleLookupResponse>>();

export type ReasoningTheaterTopologyResponse = {
  version: string;
  generated_at: string;
  baseline: {
    owned_total: number;
    connected_owned: number;
    owned_not_connected: number;
    convergence_ratio: number;
  };
  sources: {
    owned_source: "git_tracked" | "code_lattice_fallback";
    connected_source: "atlas_corpus";
    atlas_unique_files: number;
    atlas_existing_files: number;
    degraded: boolean;
  };
  display: {
    node_density_mode: "dense";
    total_nodes: number;
    connected_nodes: number;
    frontier_nodes: number;
    uncharted_nodes: number;
    seed: number;
  };
};

export type ReasoningTheaterAtlasGraphResponse = {
  version: string;
  generated_at: string;
  seed: number;
  baseline: {
    owned_total: number;
    connected_owned: number;
    owned_not_connected: number;
    convergence_ratio: number;
  };
  stats: {
    nodes_total: number;
    edges_total: number;
    mapped_connected_nodes: number;
    owned_frontier_nodes: number;
    uncharted_nodes: number;
    degraded: boolean;
  };
  nodes: Array<{
    id: string;
    path: string;
    zone: "mapped_connected" | "owned_frontier";
    x: number;
    y: number;
    degree: number;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    weight: number;
  }>;
};

export type ReasoningTheaterCongruenceGraphResponse = {
  version: string;
  generated_at: string;
  seed: number;
  baseline: {
    owned_total: number;
    connected_owned: number;
    owned_not_connected: number;
    convergence_ratio: number;
  };
  stats: {
    trees_total: number;
    nodes_total: number;
    edges_total: number;
    mapped_connected_nodes: number;
    owned_frontier_nodes: number;
    uncharted_nodes: number;
    degraded: boolean;
  };
  trees: Array<{
    id: string;
    label: string;
    root_id: string | null;
    node_count: number;
  }>;
  nodes: Array<{
    id: string;
    tree_id: string;
    node_id: string;
    title: string;
    zone: "mapped_connected" | "owned_frontier";
    atlas_linked: boolean;
    x: number;
    y: number;
    degree: number;
    depth: number;
  }>;
  edges: Array<{
    id: string;
    tree_id: string;
    from: string;
    to: string;
    rel: string;
    edge_type: string;
    requires_cl: string | null;
    weight: number;
  }>;
};

export type ContextCapsuleLookupResponse = {
  capsule: ContextCapsuleSummary;
  replay_active: ContextCapsuleReplayBundle;
  replay_inactive: ContextCapsuleReplayBundle;
  convergence: {
    source: "atlas_exact" | "repo_exact" | "open_world" | "unknown";
    proofPosture: "confirmed" | "reasoned" | "hypothesis" | "unknown" | "fail_closed";
    maturity: "exploratory" | "reduced_order" | "diagnostic" | "certified";
    phase: "observe" | "plan" | "retrieve" | "gate" | "synthesize" | "verify" | "execute" | "debrief";
    collapseEvent: "arbiter_commit" | "proof_commit" | null;
  };
  intent: {
    intent_domain: string;
    intent_id: string;
    goal: string;
    constraints: string[];
    key_terms: string[];
  };
  provenance: {
    retrieval_route: string;
    zone_hint: "mapped_connected" | "owned_frontier" | "uncharted";
    has_exact_provenance: boolean;
    exact_paths: string[];
    primary_path: string | null;
    atlas_hits: number;
    channel_hits: Record<string, number>;
  };
  epistemic: {
    arbiter_mode: string;
    claim_tier: string;
    provenance_class: string;
    certifying: boolean;
    fail_reason: string | null;
  };
  commit: {
    events: Array<"arbiter_commit" | "proof_commit">;
    proof_verdict: "PASS" | "FAIL" | "UNKNOWN";
    certificate_hash: string | null;
    certificate_integrity_ok: boolean | null;
  };
};

export type PersonaSummary = {
  id: string;
  display_name: string;
};

export type DebateTurnPayload = {
  id: string;
  debate_id: string;
  round: number;
  role: "proponent" | "skeptic" | "referee";
  text: string;
  citations: string[];
  verifier_results: { name: string; ok: boolean; reason: string }[];
  created_at: string;
  essence_id?: string;
};

export type DebateScoreboard = {
  proponent: number;
  skeptic: number;
};

export type DebateRoundMetricsPayload = {
  round?: number;
  verifier_pass?: number;
  coverage?: number;
  stability?: number;
  novelty_gain?: number;
  score?: number;
  improvement?: number;
  flags?: number;
  tool_calls?: number;
  time_used_ms?: number;
  time_left_ms?: number;
};

export type DebateOutcomePayload = {
  debate_id: string;
  verdict: string;
  confidence: number;
  winning_role?: "proponent" | "skeptic";
  key_turn_ids: string[];
  rounds?: number;
  score?: number;
  stop_reason?: string;
  metrics?: DebateRoundMetricsPayload;
  created_at: string;
};

export type DebateSnapshot = {
  id: string;
  goal: string;
  persona_id: string;
  status: "pending" | "running" | "completed" | "timeout" | "aborted";
  config: {
    max_rounds: number;
    max_wall_ms: number;
    max_tool_calls: number;
    satisfaction_threshold: number;
    min_improvement: number;
    stagnation_rounds: number;
    novelty_epsilon: number;
    verifiers: string[];
  };
  created_at: string;
  updated_at: string;
  turns: DebateTurnPayload[];
  scoreboard: DebateScoreboard;
  outcome: DebateOutcomePayload | null;
  context?: Record<string, unknown> | null;
};

export type DebateStreamEvent =
  | {
      type: "turn";
      seq: number;
      debateId: string;
      turn: DebateTurnPayload;
      scoreboard: DebateScoreboard;
    }
  | {
      type: "status";
      seq: number;
      debateId: string;
      status: DebateSnapshot["status"];
      scoreboard: DebateScoreboard;
      metrics?: DebateRoundMetricsPayload;
    }
  | {
      type: "outcome";
      seq: number;
      debateId: string;
      outcome: DebateOutcomePayload;
      scoreboard: DebateScoreboard;
      metrics?: DebateRoundMetricsPayload;
    };

export type DebateStartPayload = {
  goal: string;
  personaId: string;
  maxRounds?: number;
  maxWallMs?: number;
  verifiers?: string[];
};

export type DebateStartResponse = {
  debateId: string;
};

export type TraceMemoryHit = {
  id: string;
  kind: string;
  owner_id: string;
  created_at: string;
  keys: string[];
  snippet: string;
  essence_id?: string;
};

export type TraceMemoryResponse = {
  traceId: string;
  personaId: string;
  top_k: number;
  memories: TraceMemoryHit[];
  reflections: TraceMemoryHit[];
};

type PersonaListResponse = {
  personas: PersonaSummary[];
};

export type MemorySearchResponse = {
  items: TMemorySearchHit[];
  query?: string;
  top_k: number;
  debateOnly?: boolean;
};

export type PanelSnapshotResponse = {
  desktopId: string;
  capturedAt: string;
  panels: PanelTelemetry[];
  relatedPanels?: Array<{ id: string; title?: string }> | null;
  relationNotes?: string[] | null;
};

export type BadgeTelemetryResponse = BadgeTelemetrySnapshot;

export type VoiceSpeakPayload = {
  text: string;
  mode?: "callout" | "briefing" | "debrief";
  priority?: "info" | "warn" | "critical" | "action";
  provider?: string;
  voiceProfile?: string;
  voice_profile_id?: string;
  traceId?: string;
  missionId?: string;
  eventId?: string;
  contextTier?: "tier0" | "tier1";
  sessionState?: "idle" | "requesting" | "active" | "stopping" | "error";
  voiceMode?: "off" | "critical_only" | "normal" | "dnd";
  utteranceId?: string;
  chunkIndex?: number;
  chunkCount?: number;
  chunkKind?: "brief" | "final" | "tool_receipt" | "manual_read_aloud" | "translation_relay" | "narrator_read" | "panel_narration";
  turnKey?: string;
  evidenceRefs?: string[];
  repoAttributed?: boolean;
  deterministic?: boolean;
  textCertainty?: "unknown" | "hypothesis" | "reasoned" | "confirmed";
  voiceCertainty?: "unknown" | "hypothesis" | "reasoned" | "confirmed";
  dedupe_key?: string;
  streaming?: boolean;
};

type VoiceSpeakHeaders = {
  provider: string | null;
  profile: string | null;
  cache: "hit" | "miss" | "stream" | null;
  normalizationBenchmark: string | null;
  normalizationSkipReason: string | null;
};

export type VoiceSpeakJsonResponse = {
  ok?: boolean;
  suppressed?: boolean;
  dryRun?: boolean;
  reason?: string;
  error?: string;
  message?: string;
  traceId?: string | null;
  details?: Record<string, unknown>;
};

export type VoiceSpeakResponse =
  | {
      kind: "json";
      status: number;
      payload: VoiceSpeakJsonResponse;
      headers: VoiceSpeakHeaders;
    }
  | {
      kind: "audio";
      status: number;
      mimeType: string;
      blob: Blob;
      headers: VoiceSpeakHeaders;
    };

export type VoiceSpeakStreamResponse =
  | {
      kind: "json";
      status: number;
      payload: VoiceSpeakJsonResponse;
      headers: VoiceSpeakHeaders;
    }
  | {
      kind: "stream";
      status: number;
      mimeType: string;
      stream: ReadableStream<Uint8Array>;
      headers: VoiceSpeakHeaders;
    };

export type VoiceTranscribeSegment = {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
};

export type HelixInterpreterDispatchState = "auto" | "confirm" | "blocked";

export type HelixInterpreterPivotCandidate = {
  text: string;
  confidence: number;
};

export type HelixInterpreterConceptCandidate = {
  concept_id: string;
  concept_label?: string;
  confidence: number;
  source: "concept_card" | "term_directory";
};

export type HelixInterpreterArtifact = {
  schema_version: "helix.interpreter.v1" | string;
  source_text: string;
  source_language: string;
  code_mixed: boolean;
  pivot_candidates: HelixInterpreterPivotCandidate[];
  selected_pivot: HelixInterpreterPivotCandidate;
  concept_candidates: HelixInterpreterConceptCandidate[];
  term_preservation: {
    ratio: number;
    missing_terms: string[];
  };
  ambiguity: {
    top2_gap: number;
    ambiguous: boolean;
  };
  term_ids: string[];
  concept_ids: string[];
  confirm_prompt: string | null;
  dispatch_state: HelixInterpreterDispatchState;
};

export type VoiceCommandLaneAction = "send" | "cancel" | "retry";
export type VoiceCommandLaneDecision = "accepted" | "suppressed" | "none";
export type VoiceCommandLaneSource = "parser" | "evaluator" | "none";
export type VoiceCommandLaneSuppressionReason =
  | "disabled"
  | "kill_switch"
  | "rollout_inactive"
  | "audio_quality_low"
  | "strict_prefix_required"
  | "log_only"
  | "non_user_audio_source"
  | "speaker_not_authorized"
  | "speaker_confidence_low"
  | "unknown_speaker"
  | "overlapping_speech";

export type VoiceCommandLaneEnvelope = {
  version: "helix.voice.command_lane.v1" | string;
  decision: VoiceCommandLaneDecision;
  action: VoiceCommandLaneAction | null;
  confidence: number | null;
  source: VoiceCommandLaneSource;
  suppression_reason: VoiceCommandLaneSuppressionReason | null;
  strict_prefix_applied: boolean;
  confirm_required: boolean;
  utterance_id: string;
};

export type VoiceTranscribePayload = {
  audio: Blob;
  filename?: string;
  language?: string;
  traceId?: string;
  missionId?: string;
  mission_id?: string;
  room_id?: string;
  thread_id?: string;
  capture_session_id?: string;
  chunk_index?: number;
  capture_source?: HelixCaptureSource;
  command_lane_enabled?: boolean;
  speaker_identity_enabled?: boolean;
  speaker_policy_mode?: HelixSpeakerPolicyMode;
  known_speaker_ids?: string[];
  active_listener_speaker_ids?: string[];
  unknown_speaker_behavior?: HelixUnknownSpeakerBehavior;
  audio_identity_session_id?: string;
  durationMs?: number;
  speaker_id?: string;
  speaker_confidence?: number;
  speaker_role?: HelixSpeakerRole;
  speaker_authority?: HelixSpeakerAuthority;
  overlapping_speech?: boolean;
  speech_probability?: number;
  snr_db?: number;
  confirm_auto_eligible?: boolean;
  confirm_block_reason?: string;
};

export type VoiceTranscribeResponse = {
  ok?: boolean;
  text?: string;
  language?: string;
  language_detected?: string | null;
  language_confidence?: number | null;
  code_mixed?: boolean;
  duration_ms?: number;
  segments?: VoiceTranscribeSegment[];
  source_text?: string | null;
  source_language?: string | null;
  translated?: boolean;
  confidence?: number | null;
  confidence_reason?: string | null;
  pivot_confidence?: number | null;
  dispatch_state?: "auto" | "confirm" | "blocked";
  needs_confirmation?: boolean;
  translation_uncertain?: boolean;
  speaker_id?: string | null;
  speaker_confidence?: number | null;
  speaker_segments?: HelixSpeakerSegment[];
  primary_speaker_id?: string | null;
  claimed_role?: HelixSpeakerRole | null;
  speaker_role?: HelixSpeakerRole | null;
  speaker_authority?: HelixSpeakerAuthority | null;
  speaker_authority_source?: HelixSpeakerAuthoritySource | null;
  speaker_authority_reason?: string | null;
  speaker_color_token?: HelixSpeakerLabel["color_token"] | null;
  unknown_speaker_detected?: boolean;
  audio_identity?: HelixAudioIdentityResult | null;
  diarization_shadow?: HelixDiarizationShadowResult | null;
  speaker_session?: HelixAudioIdentitySessionSnapshot | null;
  speech_probability?: number | null;
  snr_db?: number | null;
  confirm_auto_eligible?: boolean | null;
  confirm_block_reason?: string | null;
  lang_schema_version?: "helix.lang.v1" | string;
  traceId?: string | null;
  missionId?: string | null;
  mission_id?: string | null;
  room_id?: string | null;
  thread_id?: string | null;
  capture_session_id?: string | null;
  chunk_index?: number | null;
  capture_source?: string | null;
  engine?: string;
  essence_id?: string | null;
  interpreter?: HelixInterpreterArtifact | null;
  interpreter_schema_version?: "helix.interpreter.v1" | string | null;
  interpreter_status?:
    | "ok"
    | "timeout"
    | "parse_error"
    | "provider_error"
    | "disabled"
    | "skipped"
    | null;
  interpreter_confidence?: number | null;
  interpreter_dispatch_state?: HelixInterpreterDispatchState | null;
  interpreter_confirm_prompt?: string | null;
  interpreter_term_ids?: string[];
  interpreter_concept_ids?: string[];
  command_lane?: VoiceCommandLaneEnvelope | null;
  speech_to_text_lane_result?: Record<string, unknown> | null;
  speech_to_text_observation_packet?: Record<string, unknown> | null;
  speech_to_text_observation?: Record<string, unknown> | null;
  live_source_mail_item?: Record<string, unknown> | null;
  assistant_answer?: false;
  terminal_eligible?: false;
  raw_content_included?: false;
  raw_audio_included?: false;
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type ConversationTurnClassification = {
  mode: "observe" | "act" | "verify" | "clarify";
  confidence: number;
  dispatch_hint: boolean;
  clarify_needed: boolean;
  reason: string;
  source?: "llm" | "fallback";
};

export type ConversationBrief = {
  text: string;
  source?: "llm" | "fallback" | "none";
};

export type ConversationDispatchDecision = {
  dispatch_hint: boolean;
  reason: string;
};

export type ConversationClarifierPolicy = "after_first_attempt";

export type ConversationExplorationPacket = {
  topic: string;
  goal: string;
  knowns: string[];
  unknowns: string[];
  evidence_needed: string[];
  next_probe: string;
};

export type ConversationTurnPayload = {
  transcript: string;
  sessionId?: string;
  traceId?: string;
  turnId?: string;
  missionId?: string;
  personaId?: string;
  sourceLanguage?: string;
  languageDetected?: string;
  languageConfidence?: number;
  codeMixed?: boolean;
  pivotConfidence?: number;
  responseLanguage?: string;
  preferredResponseLanguage?: string;
  interpreter?: HelixInterpreterArtifact;
  interpreter_schema_version?: "helix.interpreter.v1" | string;
  multilangConfirm?: boolean;
  lang_schema_version?: "helix.lang.v1" | string;
  translated?: boolean;
  recentTurns?: string[];
};

export type ConversationTurnResponse = {
  ok?: boolean;
  traceId?: string | null;
  turn_id?: string | null;
  sessionId?: string | null;
  transcript?: string;
  source_language?: string | null;
  language_detected?: string | null;
  language_confidence?: number | null;
  code_mixed?: boolean;
  pivot_confidence?: number | null;
  response_language?: string | null;
  dispatch_state?: "auto" | "confirm" | "blocked";
  needs_confirmation?: boolean;
  interpreter_schema_version?: "helix.interpreter.v1" | string | null;
  interpreter_status?:
    | "ok"
    | "timeout"
    | "parse_error"
    | "provider_error"
    | "disabled"
    | "skipped"
    | null;
  interpreter_confidence?: number | null;
  interpreter_dispatch_state?: HelixInterpreterDispatchState | null;
  interpreter_confirm_prompt?: string | null;
  interpreter_term_ids?: string[];
  interpreter_concept_ids?: string[];
  interpreter_error?: string | null;
  lang_schema_version?: "helix.lang.v1" | string | null;
  translated?: boolean;
  classification?: ConversationTurnClassification;
  brief?: ConversationBrief;
  dispatch?: ConversationDispatchDecision;
  route_reason_code?: string;
  exploration_turn?: boolean;
  clarifier_policy?: ConversationClarifierPolicy;
  exploration_packet?: ConversationExplorationPacket;
  fail_reason?: string | null;
  durationMs?: number;
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
};

const createVoiceCallDiagnosticId = (kind: "speak" | "transcribe", startedAtMs: number): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${kind}:${startedAtMs}:${random}`;
};

const sanitizeVoiceCallError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 320);
};

const recordVoiceCall = (
  input: Omit<VoiceCallDiagnosticSnapshot, "id" | "endedAtMs" | "durationMs"> & {
    startedAtMs: number;
  },
): void => {
  const endedAtMs = Date.now();
  recordVoiceCallDiagnostic({
    ...input,
    id: createVoiceCallDiagnosticId(input.kind, input.startedAtMs),
    endedAtMs,
    durationMs: Math.max(0, endedAtMs - input.startedAtMs),
  });
};

function voiceSpeakHeaderSnapshot(response: Response): VoiceSpeakHeaders {
  const cacheHeader = response.headers.get("x-voice-cache")?.toLowerCase();
  return {
    provider: response.headers.get("x-voice-provider"),
    profile: response.headers.get("x-voice-profile"),
    cache: cacheHeader === "hit" || cacheHeader === "miss" || cacheHeader === "stream" ? cacheHeader : null,
    normalizationBenchmark: response.headers.get("x-voice-normalization-benchmark"),
    normalizationSkipReason: response.headers.get("x-voice-normalization-skip-reason"),
  };
}

async function asJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    const preview = await response
      .text()
      .then((text) => text.trim().slice(0, 200))
      .catch(() => "");
    const base = `${response.status} ${response.statusText || "Non-JSON response"}`;
    const hint =
      typeof response.url === "string" && response.url.includes("/api/agi")
        ? " Ensure the AGI server routes are enabled (ENABLE_AGI=1)."
        : "";
    throw new Error(preview ? `${base}: ${preview}${hint}` : `${base}${hint}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("retry-after") ?? response.headers.get("Retry-After");
    let retryAfterMs: number | undefined;
    if (retryAfterHeader) {
      const asNumber = Number(retryAfterHeader);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        retryAfterMs = asNumber * 1000;
      } else {
        const asDate = Date.parse(retryAfterHeader);
        if (!Number.isNaN(asDate)) {
          const diff = asDate - Date.now();
          if (diff > 0) retryAfterMs = diff;
        }
      }
    }
    const baseMessage =
      (typeof (payload as any)?.message === "string" && (payload as any).message) ||
      (typeof (payload as any)?.error === "string" && (payload as any).error) ||
      `${response.status} ${response.statusText}`;
    let message = baseMessage;
    if ((payload as any)?.error === "voice_backend_error") {
      const firstAttempt = Array.isArray((payload as any)?.details?.attempts)
        ? (payload as any).details.attempts[0]
        : undefined;
      const attemptEngine =
        typeof firstAttempt?.engine === "string" && firstAttempt.engine.trim()
          ? firstAttempt.engine.trim()
          : "stt";
      const attemptMessage =
        typeof firstAttempt?.message === "string" && firstAttempt.message.trim()
          ? firstAttempt.message.trim()
          : "";
      if (attemptMessage) {
        message = `${baseMessage} (${attemptEngine}: ${attemptMessage})`;
      }
    }
    const error = new Error(message);
    (error as { status?: number }).status = response.status;
    const payloadRetry =
      typeof (payload as any)?.retryAfterMs === "number"
        ? (payload as any).retryAfterMs
        : undefined;
    const computedRetry = typeof payloadRetry === "number" ? payloadRetry : retryAfterMs;
    if (typeof computedRetry === "number" && Number.isFinite(computedRetry)) {
      (error as { retryAfterMs?: number }).retryAfterMs = computedRetry;
    }
    throw error;
  }

  return payload as T;
}

export async function speakVoice(
  payload: VoiceSpeakPayload,
  options?: { signal?: AbortSignal },
): Promise<VoiceSpeakResponse> {
  const startedAtMs = Date.now();
  const baseDiagnostic = {
    kind: "speak" as const,
    endpoint: "/api/voice/speak" as const,
    startedAtMs,
    traceId: payload.traceId ?? null,
    missionId: payload.missionId ?? null,
    eventId: payload.eventId ?? null,
    utteranceId: payload.utteranceId ?? null,
    turnKey: payload.turnKey ?? null,
    mode: payload.mode ?? null,
    priority: payload.priority ?? null,
    textLength: typeof payload.text === "string" ? payload.text.length : null,
    textHash: hashVoiceDiagnosticText(payload.text),
  };
  let response: Response | null = null;
  try {
    response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, audio/wav, audio/mpeg",
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
    const headerSnapshot = voiceSpeakHeaderSnapshot(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json().catch(() => ({}))) as VoiceSpeakJsonResponse;
      recordVoiceCall({
        ...baseDiagnostic,
        ok: response.ok,
        status: response.status,
        responseKind: "json",
        contentType,
        providerHeader: headerSnapshot.provider,
        profileHeader: headerSnapshot.profile,
        cacheHeader: headerSnapshot.cache,
        error: response.ok ? null : json.message ?? json.error ?? response.statusText ?? "Voice request failed",
      });
      return {
        kind: "json",
        status: response.status,
        payload: json,
        headers: headerSnapshot,
      };
    }
    const blob = await response.blob();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText || "Voice request failed"}`);
    }
    recordVoiceCall({
      ...baseDiagnostic,
      ok: true,
      status: response.status,
      responseKind: "audio",
      contentType: contentType || blob.type || "application/octet-stream",
      providerHeader: headerSnapshot.provider,
      profileHeader: headerSnapshot.profile,
      cacheHeader: headerSnapshot.cache,
      audioBytes: blob.size,
      audioMimeType: contentType || blob.type || null,
      error: null,
    });
    return {
      kind: "audio",
      status: response.status,
      mimeType: contentType || blob.type || "application/octet-stream",
      blob,
      headers: headerSnapshot,
    };
  } catch (error) {
    recordVoiceCall({
      ...baseDiagnostic,
      ok: false,
      status: response?.status ?? null,
      responseKind: "error",
      contentType: response?.headers.get("content-type")?.toLowerCase() ?? null,
      providerHeader: response?.headers.get("x-voice-provider") ?? null,
      profileHeader: response?.headers.get("x-voice-profile") ?? null,
      cacheHeader: response ? voiceSpeakHeaderSnapshot(response).cache : null,
      error: sanitizeVoiceCallError(error),
    });
    throw error;
  }
}

export async function speakVoiceStream(
  payload: VoiceSpeakPayload,
  options?: { signal?: AbortSignal },
): Promise<VoiceSpeakStreamResponse> {
  const startedAtMs = Date.now();
  const streamPayload = { ...payload, streaming: true };
  const baseDiagnostic = {
    kind: "speak" as const,
    endpoint: "/api/voice/speak" as const,
    startedAtMs,
    traceId: payload.traceId ?? null,
    missionId: payload.missionId ?? null,
    eventId: payload.eventId ?? null,
    utteranceId: payload.utteranceId ?? null,
    turnKey: payload.turnKey ?? null,
    mode: payload.mode ?? null,
    priority: payload.priority ?? null,
    textLength: typeof payload.text === "string" ? payload.text.length : null,
    textHash: hashVoiceDiagnosticText(payload.text),
  };
  let response: Response | null = null;
  try {
    response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, audio/mpeg",
      },
      body: JSON.stringify(streamPayload),
      signal: options?.signal,
    });
    const headerSnapshot = voiceSpeakHeaderSnapshot(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json().catch(() => ({}))) as VoiceSpeakJsonResponse;
      recordVoiceCall({
        ...baseDiagnostic,
        ok: response.ok,
        status: response.status,
        responseKind: "json",
        contentType,
        providerHeader: headerSnapshot.provider,
        profileHeader: headerSnapshot.profile,
        cacheHeader: headerSnapshot.cache,
        error: response.ok ? null : json.message ?? json.error ?? response.statusText ?? "Voice stream request failed",
      });
      return {
        kind: "json",
        status: response.status,
        payload: json,
        headers: headerSnapshot,
      };
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText || "Voice stream request failed"}`);
    }
    if (!response.body) {
      throw new Error("voice_stream_missing_body");
    }
    recordVoiceCall({
      ...baseDiagnostic,
      ok: true,
      status: response.status,
      responseKind: "audio",
      contentType: contentType || "audio/mpeg",
      providerHeader: headerSnapshot.provider,
      profileHeader: headerSnapshot.profile,
      cacheHeader: headerSnapshot.cache,
      audioMimeType: contentType || "audio/mpeg",
      error: null,
    });
    return {
      kind: "stream",
      status: response.status,
      mimeType: contentType || "audio/mpeg",
      stream: response.body,
      headers: headerSnapshot,
    };
  } catch (error) {
    recordVoiceCall({
      ...baseDiagnostic,
      ok: false,
      status: response?.status ?? null,
      responseKind: "error",
      contentType: response?.headers.get("content-type")?.toLowerCase() ?? null,
      providerHeader: response?.headers.get("x-voice-provider") ?? null,
      profileHeader: response?.headers.get("x-voice-profile") ?? null,
      cacheHeader: response ? voiceSpeakHeaderSnapshot(response).cache : null,
      error: sanitizeVoiceCallError(error),
    });
    throw error;
  }
}

const extensionForAudioMime = (mimeType: string): string => {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("wav") || normalized.includes("wave")) return "wav";
  return "webm";
};

export async function transcribeVoice(payload: VoiceTranscribePayload): Promise<VoiceTranscribeResponse> {
  const startedAtMs = Date.now();
  const baseDiagnostic = {
    kind: "transcribe" as const,
    endpoint: "/api/voice/transcribe" as const,
    startedAtMs,
    traceId: payload.traceId ?? null,
    missionId: payload.missionId ?? null,
    responseKind: "json" as const,
    audioBytes: payload.audio.size,
    audioMimeType: payload.audio.type?.trim() || "audio/webm",
    audioDurationMs:
      typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
        ? Math.max(0, Math.round(payload.durationMs))
        : null,
  };
  const form = new FormData();
  const audioMimeType = payload.audio.type?.trim() || "audio/webm";
  const filename = payload.filename?.trim() || `helix-voice-input.${extensionForAudioMime(audioMimeType)}`;
  form.set("audio", payload.audio, filename);
  if (payload.language?.trim()) {
    form.set("language", payload.language.trim());
  }
  if (payload.traceId?.trim()) {
    form.set("traceId", payload.traceId.trim());
  }
  if (payload.missionId?.trim()) {
    form.set("missionId", payload.missionId.trim());
  }
  if (payload.mission_id?.trim()) {
    form.set("mission_id", payload.mission_id.trim());
  }
  if (payload.room_id?.trim()) {
    form.set("room_id", payload.room_id.trim());
  }
  if (payload.thread_id?.trim()) {
    form.set("thread_id", payload.thread_id.trim());
  }
  if (payload.capture_session_id?.trim()) {
    form.set("capture_session_id", payload.capture_session_id.trim());
  }
  if (typeof payload.chunk_index === "number" && Number.isFinite(payload.chunk_index)) {
    form.set("chunk_index", String(Math.max(0, Math.round(payload.chunk_index))));
  }
  if (payload.capture_source?.trim()) {
    form.set("capture_source", payload.capture_source.trim());
  }
  if (typeof payload.command_lane_enabled === "boolean") {
    form.set("command_lane_enabled", payload.command_lane_enabled ? "1" : "0");
  }
  if (typeof payload.speaker_identity_enabled === "boolean") {
    form.set("speaker_identity_enabled", payload.speaker_identity_enabled ? "1" : "0");
  }
  if (payload.speaker_policy_mode) {
    form.set("speaker_policy_mode", payload.speaker_policy_mode);
  }
  if (Array.isArray(payload.known_speaker_ids) && payload.known_speaker_ids.length > 0) {
    form.set("known_speaker_ids", payload.known_speaker_ids.map((entry) => entry.trim()).filter(Boolean).join(","));
  }
  if (Array.isArray(payload.active_listener_speaker_ids) && payload.active_listener_speaker_ids.length > 0) {
    form.set(
      "active_listener_speaker_ids",
      payload.active_listener_speaker_ids.map((entry) => entry.trim()).filter(Boolean).join(","),
    );
  }
  if (payload.unknown_speaker_behavior) {
    form.set("unknown_speaker_behavior", payload.unknown_speaker_behavior);
  }
  if (payload.audio_identity_session_id?.trim()) {
    form.set("audio_identity_session_id", payload.audio_identity_session_id.trim());
  }
  if (typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)) {
    form.set("durationMs", String(Math.max(0, Math.round(payload.durationMs))));
  }
  if (payload.speaker_id?.trim()) {
    form.set("speaker_id", payload.speaker_id.trim());
  }
  if (typeof payload.speaker_confidence === "number" && Number.isFinite(payload.speaker_confidence)) {
    form.set("speaker_confidence", String(payload.speaker_confidence));
  }
  if (payload.speaker_role) {
    form.set("speaker_role", payload.speaker_role);
  }
  if (payload.speaker_authority) {
    form.set("speaker_authority", payload.speaker_authority);
  }
  if (typeof payload.overlapping_speech === "boolean") {
    form.set("overlapping_speech", payload.overlapping_speech ? "1" : "0");
  }
  if (typeof payload.speech_probability === "number" && Number.isFinite(payload.speech_probability)) {
    form.set("speech_probability", String(payload.speech_probability));
  }
  if (typeof payload.snr_db === "number" && Number.isFinite(payload.snr_db)) {
    form.set("snr_db", String(payload.snr_db));
  }
  if (typeof payload.confirm_auto_eligible === "boolean") {
    form.set("confirm_auto_eligible", payload.confirm_auto_eligible ? "1" : "0");
  }
  if (payload.confirm_block_reason?.trim()) {
    form.set("confirm_block_reason", payload.confirm_block_reason.trim());
  }

  let response: Response | null = null;
  try {
    response = await fetch("/api/voice/transcribe", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: form,
    });

    const result = await asJson<VoiceTranscribeResponse>(response);
    recordVoiceCall({
      ...baseDiagnostic,
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type")?.toLowerCase() ?? null,
      error: null,
    });
    return result;
  } catch (error) {
    recordVoiceCall({
      ...baseDiagnostic,
      ok: false,
      status: response?.status ?? null,
      responseKind: "error",
      contentType: response?.headers.get("content-type")?.toLowerCase() ?? null,
      error: sanitizeVoiceCallError(error),
    });
    throw error;
  }
}

export async function runConversationTurn(
  payload: ConversationTurnPayload,
): Promise<ConversationTurnResponse> {
  const body: Record<string, unknown> = {
    transcript: payload.transcript,
  };
  if (payload.sessionId?.trim()) body.sessionId = payload.sessionId.trim();
  if (payload.traceId?.trim()) body.traceId = payload.traceId.trim();
  if (payload.turnId?.trim()) body.turnId = payload.turnId.trim();
  if (payload.missionId?.trim()) body.missionId = payload.missionId.trim();
  if (payload.personaId?.trim()) body.personaId = payload.personaId.trim();
  if (payload.sourceLanguage?.trim()) body.sourceLanguage = payload.sourceLanguage.trim();
  if (payload.languageDetected?.trim()) body.languageDetected = payload.languageDetected.trim();
  if (typeof payload.languageConfidence === "number" && Number.isFinite(payload.languageConfidence)) {
    body.languageConfidence = payload.languageConfidence;
  }
  if (typeof payload.codeMixed === "boolean") body.codeMixed = payload.codeMixed;
  if (typeof payload.pivotConfidence === "number" && Number.isFinite(payload.pivotConfidence)) {
    body.pivotConfidence = payload.pivotConfidence;
  }
  if (payload.responseLanguage?.trim()) body.responseLanguage = payload.responseLanguage.trim();
  if (payload.preferredResponseLanguage?.trim()) {
    body.preferredResponseLanguage = payload.preferredResponseLanguage.trim();
  }
  if (payload.interpreter) body.interpreter = payload.interpreter;
  if (payload.interpreter_schema_version?.trim()) {
    body.interpreter_schema_version = payload.interpreter_schema_version.trim();
  }
  if (typeof payload.multilangConfirm === "boolean") {
    body.multilangConfirm = payload.multilangConfirm;
  }
  if (payload.lang_schema_version?.trim()) body.lang_schema_version = payload.lang_schema_version.trim();
  if (typeof payload.translated === "boolean") body.translated = payload.translated;
  if (Array.isArray(payload.recentTurns) && payload.recentTurns.length > 0) {
    body.recentTurns = payload.recentTurns
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(-8);
  }
  const response = await fetch("/api/agi/ask/conversation-turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return asJson<ConversationTurnResponse>(response);
}

const buildRunAskTurnBody = (payload: RunAskTurnPayload): Record<string, unknown> => {
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const body: Record<string, unknown> = {
    question: payload.question,
  };
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const languageModelProfile = payload.languageModelProfile ?? payload.language_model_profile;
  if (languageModelProfile) {
    body.language_model_profile = languageModelProfile;
    body.languageModelProfile = languageModelProfile;
  }
  const languageModelOverride = payload.languageModelOverride ?? payload.language_model_override;
  if (languageModelOverride?.trim()) {
    body.language_model_override = languageModelOverride.trim();
    body.languageModelOverride = languageModelOverride.trim();
  }
  if (typeof payload.goldenPathRuntime === "boolean") body.goldenPathRuntime = payload.goldenPathRuntime;
  if (typeof payload.golden_path_runtime === "boolean") body.golden_path_runtime = payload.golden_path_runtime;
  if (selectedRuntime === "helix") {
    body.goldenPathRuntime = true;
    body.golden_path_runtime = true;
  }
  if (payload.sessionId?.trim()) body.sessionId = payload.sessionId.trim();
  if (payload.traceId?.trim()) body.traceId = payload.traceId.trim();
  if (payload.turnId?.trim()) body.turnId = payload.turnId.trim();
  if (payload.personaId?.trim()) body.personaId = payload.personaId.trim();
  if (payload.sourceLanguage?.trim()) body.sourceLanguage = payload.sourceLanguage.trim();
  if (payload.languageDetected?.trim()) body.languageDetected = payload.languageDetected.trim();
  if (typeof payload.languageConfidence === "number" && Number.isFinite(payload.languageConfidence)) {
    body.languageConfidence = payload.languageConfidence;
  }
  if (typeof payload.codeMixed === "boolean") body.codeMixed = payload.codeMixed;
  if (typeof payload.pivotConfidence === "number" && Number.isFinite(payload.pivotConfidence)) {
    body.pivotConfidence = payload.pivotConfidence;
  }
  if (payload.responseLanguage?.trim()) body.responseLanguage = payload.responseLanguage.trim();
  if (payload.preferredResponseLanguage?.trim()) {
    body.preferredResponseLanguage = payload.preferredResponseLanguage.trim();
  }
  if (payload.interpreter) body.interpreter = payload.interpreter;
  if (payload.interpreter_schema_version?.trim()) {
    body.interpreter_schema_version = payload.interpreter_schema_version.trim();
  }
  if (typeof payload.multilangConfirm === "boolean") body.multilangConfirm = payload.multilangConfirm;
  if (payload.lang_schema_version?.trim()) body.lang_schema_version = payload.lang_schema_version.trim();
  if (typeof payload.translated === "boolean") body.translated = payload.translated;
  if (typeof payload.maxTokens === "number") body.max_tokens = payload.maxTokens;
  if (payload.mode) body.mode = payload.mode;
  if (payload.contextMode) body.context_mode = payload.contextMode;
  if (payload.workspaceContextSnapshot && typeof payload.workspaceContextSnapshot === "object") {
    body.workspace_context_snapshot = payload.workspaceContextSnapshot;
  }
  if (Array.isArray(payload.turnInputItems) && payload.turnInputItems.length > 0) {
    body.turn_input_items = payload.turnInputItems;
  }
  if (typeof payload.debug === "boolean") body.debug = payload.debug;
  if (Array.isArray(payload.contextFiles) && payload.contextFiles.length > 0) {
    body.contextFiles = payload.contextFiles
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 48);
  }
  if (Array.isArray(payload.capsuleIds) && payload.capsuleIds.length > 0) {
    body.capsuleIds = payload.capsuleIds.slice(0, HELIX_CONTEXT_CAPSULE_MAX_IDS);
  }
  if (payload.answerContract) body.answer_contract = payload.answerContract;
  const realtimeGroundedFeedbackBinding =
    payload.realtimeGroundedFeedbackBinding ??
    payload.realtime_grounded_feedback_binding;
  if (isHelixRealtimeGroundedFeedbackBindingV1(realtimeGroundedFeedbackBinding)) {
    body.realtime_grounded_feedback_binding = realtimeGroundedFeedbackBinding;
  }
  const capabilityLaneCall = payload.capability_lane_call ?? payload.capabilityLaneCall;
  if (capabilityLaneCall) body.capability_lane_call = capabilityLaneCall;
  const capabilityLaneSessionCall =
    payload.capability_lane_session_call ?? payload.capabilityLaneSessionCall;
  if (capabilityLaneSessionCall) body.capability_lane_session_call = capabilityLaneSessionCall;
  appendHelixAskRouteMetadataToBody(body, payload.routeMetadata ?? payload.route_metadata);
  return body;
};

export async function runAskTurn(payload: RunAskTurnPayload): Promise<LocalAskResponse> {
  const body = buildRunAskTurnBody(payload);
  return continueHelixAskTurnAfterAdmission({
    signal: payload.signal,
    expectedTurnId: payload.turnId,
    attempt: async () => {
      const response = await fetch("/api/agi/ask/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: payload.signal,
      });
      return normalizeLocalAskResponse(await asJson<unknown>(response));
    },
    onQueued: (admission) => {
      body.turnId = admission.turnId;
      body.turn_id = admission.turnId;
    },
  });
}

export async function submitRuntimeGoalWakeCandidate(
  payload: RuntimeGoalWakeCandidatePayload,
): Promise<RuntimeGoalWakeCandidateResponse> {
  const body: Record<string, unknown> = {
    schema: "helix.runtime_goal.wake_candidate.v1",
  };
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const goalId = payload.goalId ?? payload.goal_id;
  if (goalId) body.goal_id = goalId;
  body.event_kind = payload.eventKind ?? payload.event_kind ?? "visible_source_changed";
  body.source_kind = payload.sourceKind ?? payload.source_kind ?? "docs_viewer_visible_surface";
  const docPath = payload.docPath ?? payload.doc_path;
  if (docPath) body.doc_path = docPath;
  const activePanelId = payload.activePanelId ?? payload.active_panel_id;
  if (activePanelId) body.active_panel_id = activePanelId;
  const sourceId = payload.sourceId ?? payload.source_id;
  if (sourceId) body.source_id = sourceId;
  const sourceHash = payload.sourceHash ?? payload.source_hash;
  if (sourceHash) body.source_hash = sourceHash;
  const sourceLabel = payload.sourceLabel ?? payload.source_label;
  if (sourceLabel) body.source_label = sourceLabel;
  if (payload.reason) body.reason = payload.reason;
  const dedupeKey = payload.dedupeKey ?? payload.dedupe_key;
  if (dedupeKey) body.dedupe_key = dedupeKey;
  const freshness = payload.sourceFreshnessMs ?? payload.source_freshness_ms;
  if (typeof freshness === "number" && Number.isFinite(freshness)) body.source_freshness_ms = freshness;
  const freshnessStatus = payload.freshnessStatus ?? payload.freshness_status;
  if (freshnessStatus) body.freshness_status = freshnessStatus;
  const proposedTool = payload.proposedTool ?? payload.proposed_tool;
  if (proposedTool) body.proposed_tool = proposedTool;
  const requiresVisibleTurn = payload.requiresUserVisibleTurn ?? payload.requires_user_visible_turn;
  if (typeof requiresVisibleTurn === "boolean") body.requires_user_visible_turn = requiresVisibleTurn;
  const observedAtMs = payload.observedAtMs ?? payload.observed_at_ms;
  if (typeof observedAtMs === "number" && Number.isFinite(observedAtMs)) body.observed_at_ms = observedAtMs;
  const turnId = payload.turnId ?? payload.turn_id;
  if (turnId) {
    body.turnId = turnId;
    body.turn_id = turnId;
  }
  const realtimeHandoffId = payload.realtimeHandoffId ?? payload.realtime_handoff_id;
  if (realtimeHandoffId) body.realtime_handoff_id = realtimeHandoffId;
  if (payload.question?.trim()) body.question = payload.question.trim();
  const snapshot = payload.workspaceContextSnapshot ?? payload.workspace_context_snapshot;
  if (snapshot && typeof snapshot === "object") body.workspace_context_snapshot = snapshot;
  const response = await fetch("/api/agi/runtime-goals/wake-candidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  return normalizeLocalAskResponse(await asJson<unknown>(response)) as RuntimeGoalWakeCandidateResponse;
}

export async function fetchActiveRuntimeGoalSession(): Promise<RuntimeGoalActiveSessionResponse> {
  const response = await fetch("/api/agi/runtime-goals/active", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  return await asJson<RuntimeGoalActiveSessionResponse>(response);
}

export async function runCapabilityLaneOneShot(
  payload: RunCapabilityLaneOneShotPayload,
): Promise<CapabilityLaneOneShotResponse> {
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const capabilityLaneCall = payload.capability_lane_call ?? payload.capabilityLaneCall;
  const body: Record<string, unknown> = {};
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const turnId = payload.turnId ?? payload.turn_id;
  if (turnId) {
    body.turnId = turnId;
    body.turn_id = turnId;
  }
  if (capabilityLaneCall) {
    body.capability_lane_call = capabilityLaneCall;
  }
  const response = await fetch("/api/agi/capability-lanes/one-shot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  const result = await asJson<CapabilityLaneOneShotResponse>(response);
  ingestImageLensRegionInspectionReceipts(result);
  ingestScientificCalculatorReceiptsFromAskPayload(result);
  ingestScientificEvidenceWorkflowStatusFromAskPayload(result);
  return result;
}

export async function runCapabilityLaneSessionControl(
  payload: RunCapabilityLaneSessionControlPayload,
): Promise<CapabilityLaneSessionControlResponse> {
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const capabilityLaneSessionCall =
    payload.capability_lane_session_call ?? payload.capabilityLaneSessionCall;
  const body: Record<string, unknown> = {};
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const turnId = payload.turnId ?? payload.turn_id;
  if (turnId) {
    body.turnId = turnId;
    body.turn_id = turnId;
  }
  if (capabilityLaneSessionCall) {
    body.capability_lane_session_call = capabilityLaneSessionCall;
  }
  const response = await fetch("/api/agi/capability-lanes/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  return asJson<CapabilityLaneSessionControlResponse>(response);
}

export async function listCapabilityLaneSessions(
  payload: ListCapabilityLaneSessionsPayload = {},
): Promise<CapabilityLaneSessionListResponse> {
  const query = new URLSearchParams();
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const laneSessionId = payload.laneSessionId ?? payload.lane_session_id;
  const laneId = payload.laneId ?? payload.lane_id;
  const sourceId = payload.sourceId ?? payload.source_id;
  const sourceHash = payload.sourceHash ?? payload.source_hash;
  const sourceBindingKey = payload.sourceBindingKey ?? payload.source_binding_key;
  const sourceIdentityKey = payload.sourceIdentityKey ?? payload.source_identity_key;
  const latestSourceIdentityKey = payload.latestSourceIdentityKey ?? payload.latest_source_identity_key;
  const projectionTarget = payload.projectionTarget ?? payload.projection_target;
  const accountLocale = payload.accountLocale ?? payload.account_locale;
  const targetLanguage = payload.targetLanguage ?? payload.target_language;
  if (selectedRuntime) query.set("agent_runtime", selectedRuntime);
  if (laneSessionId) query.set("lane_session_id", laneSessionId);
  if (laneId) query.set("lane_id", laneId);
  if (sourceId) query.set("source_id", sourceId);
  if (sourceHash) query.set("source_hash", sourceHash);
  if (sourceBindingKey) query.set("source_binding_key", sourceBindingKey);
  if (sourceIdentityKey) query.set("source_identity_key", sourceIdentityKey);
  if (latestSourceIdentityKey) query.set("latest_source_identity_key", latestSourceIdentityKey);
  if (projectionTarget) query.set("projection_target", projectionTarget);
  if (accountLocale) query.set("account_locale", accountLocale);
  if (targetLanguage) query.set("target_language", targetLanguage);
  const queryString = query.toString();
  const path = queryString
    ? `/api/agi/capability-lanes/session?${queryString}`
    : "/api/agi/capability-lanes/session";
  const response = await fetch(path, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: payload.signal,
  });
  return asJson<CapabilityLaneSessionListResponse>(response);
}

export async function runCapabilityLaneGoalBindingControl(
  payload: RunCapabilityLaneGoalBindingControlPayload,
): Promise<CapabilityLaneGoalBindingControlResponse> {
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const capabilityLaneGoalBindingCall =
    payload.capability_lane_goal_binding_call ?? payload.capabilityLaneGoalBindingCall;
  const body: Record<string, unknown> = {};
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const turnId = payload.turnId ?? payload.turn_id;
  if (turnId) {
    body.turnId = turnId;
    body.turn_id = turnId;
  }
  if (capabilityLaneGoalBindingCall) {
    body.capability_lane_goal_binding_call = capabilityLaneGoalBindingCall;
  }
  const response = await fetch("/api/agi/capability-lanes/goal-binding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  return asJson<CapabilityLaneGoalBindingControlResponse>(response);
}

export async function runCapabilityLaneMailLoop(
  payload: RunCapabilityLaneMailLoopPayload,
): Promise<CapabilityLaneMailLoopResponse> {
  const selectedRuntime = payload.agentRuntime ?? payload.agent_runtime;
  const capabilityLaneCall = payload.capability_lane_call ?? payload.capabilityLaneCall;
  const body: Record<string, unknown> = {};
  if (selectedRuntime) {
    body.agentRuntime = selectedRuntime;
    body.agent_runtime = selectedRuntime;
  }
  const turnId = payload.turnId ?? payload.turn_id;
  if (turnId) {
    body.turnId = turnId;
    body.turn_id = turnId;
  }
  const threadId = payload.threadId ?? payload.thread_id;
  if (threadId) {
    body.threadId = threadId;
    body.thread_id = threadId;
  }
  const roomId = payload.roomId ?? payload.room_id;
  if (roomId) {
    body.roomId = roomId;
    body.room_id = roomId;
  }
  const environmentId = payload.environmentId ?? payload.environment_id;
  if (environmentId) {
    body.environmentId = environmentId;
    body.environment_id = environmentId;
  }
  const objectiveText = payload.objectiveText ?? payload.objective_text;
  if (objectiveText) {
    body.objectiveText = objectiveText;
    body.objective_text = objectiveText;
  }
  const laneSessionId = payload.laneSessionId ?? payload.lane_session_id;
  if (laneSessionId) {
    body.laneSessionId = laneSessionId;
    body.lane_session_id = laneSessionId;
  }
  if (capabilityLaneCall) {
    body.capability_lane_call = capabilityLaneCall;
  }
  const response = await fetch("/api/agi/capability-lanes/mail-loop", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  return asJson<CapabilityLaneMailLoopResponse>(response);
}

const readAskTurnStreamText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const readAskTurnStreamRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const askTurnStreamRetryableFailureCode = (response: LocalAskResponse): string | null => {
  const record = response as unknown as Record<string, unknown>;
  const debug = readAskTurnStreamRecord(record.debug);
  const richSignal =
    readAskTurnStreamRecord(record.rich_model_only_concept_signal) ??
    readAskTurnStreamRecord(debug?.rich_model_only_concept_signal);
  const sourceTarget =
    readAskTurnStreamRecord(record.source_target_intent) ??
    readAskTurnStreamRecord(debug?.source_target_intent);
  const sourceTargetName = readAskTurnStreamText(sourceTarget?.target_source);
  const terminalErrorCode = readAskTurnStreamText(
    record.terminal_error_code ?? record.error ?? record.fail_reason ?? debug?.terminal_error_code,
  );
  const responseType = readAskTurnStreamText(record.response_type ?? record.final_status ?? debug?.response_type);
  const terminalKind = readAskTurnStreamText(record.terminal_artifact_kind ?? debug?.terminal_artifact_kind);
  const finalSource = readAskTurnStreamText(record.final_answer_source ?? debug?.final_answer_source);
  const selectedText = readAskTurnStreamText(
    record.selected_final_answer ?? record.answer ?? record.text ?? record.message,
  );
  const isFinalFailure =
    response.ok === false ||
    responseType === "final_failure" ||
    terminalKind === "typed_failure" ||
    finalSource === "typed_failure";
  if (!isFinalFailure) return null;

  const retryableCode =
    /^(?:model_only_answer_unavailable|model_only_concept_final_synthesis_unavailable|model_only_direct_answer_timeout|solver_continuation_pending|solver_controller_blocked_terminal|terminal_equivalence_missing|terminal_equivalence_failed)$/i.test(
      terminalErrorCode,
    );
  const solverControllerText = /solver controller blocked terminal answer/i.test(selectedText);
  const modelOnlyContext =
    sourceTargetName === "model_only" ||
    sourceTargetName === "general_background" ||
    richSignal?.applies === true ||
    richSignal?.should_use_long_form_composer === true;

  if ((retryableCode || solverControllerText) && modelOnlyContext) {
    return terminalErrorCode || "retryable_model_only_stream_failure";
  }
  return null;
};

const runAskTurnStreamAttempt = async (
  payload: RunAskTurnPayload,
  body: Record<string, unknown>,
  onEvent?: (event: HelixAskTurnStreamEvent) => void,
): Promise<LocalAskResponse> => {
  const response = await fetch("/api/agi/ask/turn/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: payload.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`ask_turn_stream_unavailable:${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: unknown = null;
  let lastErrorPayload: unknown = null;
  const flushBlock = (block: string): void => {
    const lines = block.split(/\r?\n/);
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
    if (!eventLine || dataLines.length === 0) return;
    const event = eventLine.slice(6).trim();
    const rawData = dataLines.join("\n");
    let data: unknown = rawData;
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
    ingestImageLensRegionInspectionReceipts(data);
    ingestScientificCalculatorReceiptsFromAskPayload(data);
    ingestPostulateReviewReceiptsFromAskPayload(data);
    ingestScientificEvidenceWorkflowStatusFromAskPayload(data);
    const packet: HelixAskTurnStreamEvent = { event, data };
    onEvent?.(packet);
    if (event === "turn_final") finalPayload = data;
    if (event === "turn_error") lastErrorPayload = data;
  };
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      let delimiter = buffer.match(/\r?\n\r?\n/);
      while (delimiter && typeof delimiter.index === "number") {
        const block = buffer.slice(0, delimiter.index);
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        flushBlock(block);
        delimiter = buffer.match(/\r?\n\r?\n/);
      }
    }
    if (done) break;
  }
  if (buffer.trim()) flushBlock(buffer.trim());
  if (!finalPayload) {
    const errorCode = readAskTurnStreamText(readAskTurnStreamRecord(lastErrorPayload)?.error);
    throw new Error(errorCode ? `ask_turn_stream_missing_final:${errorCode}` : "ask_turn_stream_missing_final");
  }
  const normalized = normalizeLocalAskResponse(finalPayload);
  const streamError = readAskTurnStreamRecord(lastErrorPayload);
  const streamErrorCode = readAskTurnStreamText(streamError?.error);
  const streamErrorMessage = readAskTurnStreamText(streamError?.message);
  const streamErrorName = readAskTurnStreamText(streamError?.error_name);
  const streamErrorDurationMs =
    typeof streamError?.stream_duration_ms === "number" &&
    Number.isFinite(streamError.stream_duration_ms)
      ? streamError.stream_duration_ms
      : null;
  normalized.debug = {
    ...(normalized.debug ?? {}),
    stream_used: true,
    stream_fallback_reason: null,
    ...(streamError
      ? {
          backend_ask_call_error:
            streamErrorMessage || streamErrorCode || "ask_turn_stream_failed",
          first_broken_rail: "ask_turn_stream_runtime",
          repair_target: "server_stream_failure",
          stream_error_event: {
            schema: "helix.ask.turn_stream_error_observation.v1",
            error_code: streamErrorCode || null,
            error_name: streamErrorName || null,
            message: streamErrorMessage || null,
            stream_duration_ms: streamErrorDurationMs,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
        }
      : {}),
  };
  const retryableFailureCode = askTurnStreamRetryableFailureCode(normalized);
  if (retryableFailureCode) {
    throw new Error(`ask_turn_stream_retryable_final:${retryableFailureCode}`);
  }
  return normalized;
};

export async function runAskTurnStream(
  payload: RunAskTurnPayload,
  onEvent?: (event: HelixAskTurnStreamEvent) => void,
): Promise<LocalAskResponse> {
  const body = buildRunAskTurnBody(payload);
  return continueHelixAskTurnAfterAdmission({
    signal: payload.signal,
    expectedTurnId: payload.turnId,
    attempt: () => runAskTurnStreamAttempt(payload, body, onEvent),
    onQueued: (admission) => {
      body.turnId = admission.turnId;
      body.turn_id = admission.turnId;
      onEvent?.({
        event: "turn_admission_wait",
        data: {
          schema: HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA,
          turn_id: admission.turnId,
          reason: admission.reason,
          queue_position: admission.queuePosition,
          retry_after_ms: admission.retryAfterMs,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
      });
    },
  });
}

export type PlanRequestOptions = {
  desktopId?: string;
  includeTelemetry?: boolean;
  promptSpec?: PromptSpec;
  collapseTrace?: CollapseDecision;
  collapseStrategy?: CollapseStrategyName;
  callSpec?: LocalCallSpec | null;
  essenceConsole?: boolean;
  warpParams?: Record<string, unknown>;
  sessionId?: string;
  refinery?: AgiRefineryRequest;
};

export async function plan(
  goal: string,
  personaId?: string,
  knowledgeContext?: KnowledgeProjectExport[],
  knowledgeProjects?: string[],
  options?: PlanRequestOptions,
): Promise<PlanResponse> {
  await ensureLatestLattice();
  const body: Record<string, unknown> = { goal, personaId };
  if (Array.isArray(knowledgeContext) && knowledgeContext.length > 0) {
    body.knowledgeContext = knowledgeContext;
  }
  if (Array.isArray(knowledgeProjects) && knowledgeProjects.length > 0) {
    body.knowledgeProjects = knowledgeProjects;
  }
  if (options?.promptSpec) {
    body.prompt_spec = options.promptSpec;
  }
  if (options?.collapseTrace) {
    body.collapse_trace = options.collapseTrace;
  }
  if (options?.collapseStrategy) {
    body.collapse_strategy = options.collapseStrategy;
  }
  if (options?.callSpec) {
    body.call_spec = options.callSpec;
  }
  if (options?.essenceConsole) {
    body.essenceConsole = true;
  }
  if (options?.warpParams) {
    body.warpParams = options.warpParams;
  }
  if (options?.sessionId) {
    body.sessionId = options.sessionId;
  }
  if (options?.refinery) {
    body.refinery = options.refinery;
  }
  const desktopId = options?.desktopId ?? DEFAULT_DESKTOP_ID;
  if (desktopId) {
    body.desktopId = desktopId;
  }
  if (options?.includeTelemetry !== false) {
    try {
      await pushConsoleTelemetry(desktopId);
    } catch (error) {
      console.warn("[agi] console telemetry push failed", error);
    }
  }
  const payload = await asJson<PlanResponse>(
    await fetch("/api/agi/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const latticeVersionValue =
    payload.lattice_version === null || payload.lattice_version === undefined
      ? null
      : Number.isFinite(Number(payload.lattice_version))
        ? Number(payload.lattice_version)
        : null;
  useResonanceStore.getState().setResonancePayload({
    bundle: payload.resonance_bundle ?? null,
    selection: payload.resonance_selection ?? null,
    latticeVersion: latticeVersionValue,
    traceId: payload.traceId,
  });
  return payload;
}

export async function execute(traceId: string): Promise<ExecuteResponse> {
  return asJson(
    await fetch("/api/agi/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId })
    })
  );
}

const HELIX_ASK_JOB_POLL_INTERVAL_MS = 1000;
const HELIX_ASK_JOB_MAX_CONSECUTIVE_ERRORS = 12;
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const readBooleanEnv = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (["0", "false", "off", "no"].includes(normalized)) return false;
    if (["1", "true", "on", "yes"].includes(normalized)) return true;
  }
  return fallback;
};
const readNumberEnv = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};
const HELIX_ASK_JOB_TIMEOUT_MS = clampNumber(
  readNumberEnv((globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__, 1_200_000),
  30_000,
  30 * 60_000,
);
const isHelixE814LaneParityEnabled = (): boolean =>
  readBooleanEnv(
    (globalThis as Record<string, unknown>).__HELIX_E8_14_LANE_PARITY__,
    true,
  );

const bodyRequiresAskTurnEntrypoint = (body: Record<string, unknown>): boolean => {
  const routeMetadata = readAgiRecord(body.route_metadata ?? body.routeMetadata);
  const sourceTargetIntent =
    readAgiRecord(body.source_target_intent ?? body.sourceTargetIntent) ??
    readAgiRecord(routeMetadata?.source_target_intent ?? routeMetadata?.sourceTargetIntent);
  const question = readAgiString(body.question ?? body.prompt ?? body.transcript);
  return (
    sourceTargetIntent?.must_enter_backend_ask === true ||
    asksForScientificImageTextEvidenceComparison(question)
  );
};

const isHelixAskJobUnsupported = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "helix_ask_jobs_unsupported",
  );

const buildAbortError = (): Error => {
  const error = new Error("Aborted");
  (error as { name?: string }).name = "AbortError";
  return error;
};

const isJobPollTransientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("rate_limited") ||
    message.includes("too many requests") ||
    message.includes("failed to fetch") ||
    message.includes("failed to parse json") ||
    message.includes("non-json response") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("gateway") ||
    message.includes("service unavailable") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("520") ||
    message.includes("521") ||
    message.includes("522") ||
    message.includes("524") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("load failed") ||
    message.includes("networkerror")
  );
};

const isJobMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("not_found") || message.includes("404");
};

const HELIX_ASK_PENDING_JOB_KEY = "helixAsk.pendingJob.v1";
const HELIX_ASK_JOB_INTERRUPTED_FALLBACK_TEXT = "request interrupted. please try again.";

const readPendingHelixAskJob = (): PendingHelixAskJob | null => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HELIX_ASK_PENDING_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingHelixAskJob;
    if (!parsed || typeof parsed.jobId !== "string" || !parsed.jobId.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writePendingHelixAskJob = (payload: PendingHelixAskJob): void => {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(HELIX_ASK_PENDING_JOB_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence only.
  }
};

const clearPendingHelixAskJob = (jobId?: string): void => {
  if (typeof sessionStorage === "undefined") return;
  if (!jobId) {
    sessionStorage.removeItem(HELIX_ASK_PENDING_JOB_KEY);
    return;
  }
  const existing = readPendingHelixAskJob();
  if (!existing || existing.jobId === jobId) {
    sessionStorage.removeItem(HELIX_ASK_PENDING_JOB_KEY);
  }
};

const isNavigatorOffline = (): boolean =>
  typeof navigator !== "undefined" && navigator.onLine === false;

const isInterruptedJobFallbackResponse = (response: LocalAskResponse | null | undefined): boolean => {
  const text = typeof response?.text === "string" ? response.text.trim().toLowerCase() : "";
  return text === HELIX_ASK_JOB_INTERRUPTED_FALLBACK_TEXT;
};

const buildBlockedJobDirectFallbackResponse = (
  response: LocalAskResponse,
  jobId: string,
): LocalAskResponse => ({
  ...response,
  text: response.text || "Request interrupted. Please try again.",
  ok: false,
  error: "helix_ask_job_direct_fallback_blocked",
  fail_reason: "HELIX_ASK_JOB_DIRECT_FALLBACK_BLOCKED",
  fail_class: "client_transport_duplicate_execution_guard",
  client_transport_fallback: true,
  client_transport_fallback_reason: "job_created_poll_interrupted",
  fallback_blocked: true,
  fallback_block_reason: "job_created_direct_reexecution_blocked",
  terminal_eligible: false,
  authorityVerified: false,
  debug: {
    ...(response.debug ?? {}),
    client_transport_fallback: true,
    client_transport_fallback_reason: "job_created_poll_interrupted",
    fallback_blocked: true,
    fallback_block_reason: "job_created_direct_reexecution_blocked",
    duplicate_execution_guard: {
      schema: "helix.ask.client_transport_duplicate_execution_guard.v1",
      jobId,
      action: "blocked_direct_fallback_after_job_created",
      reason: "poll_returned_interrupted_fallback_text",
      assistant_answer: false,
      terminal_eligible: false,
      authorityVerified: false,
    },
  } as LocalAskResponse["debug"] & Record<string, unknown>,
});

const normalizeLocalAskResponse = (payload: unknown): LocalAskResponse => {
  ingestImageLensRegionInspectionReceipts(payload);
  ingestScientificCalculatorReceiptsFromAskPayload(payload);
  ingestPostulateReviewReceiptsFromAskPayload(payload);
  ingestScientificEvidenceWorkflowStatusFromAskPayload(payload);
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const selectedFinalAnswer = typeof record.selected_final_answer === "string" ? record.selected_final_answer.trim() : "";
  const assistantAnswer = typeof record.assistant_answer === "string" ? record.assistant_answer.trim() : "";
  const rawText = typeof record.text === "string" ? record.text.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const interpreterConfirmPrompt =
    typeof record.interpreter_confirm_prompt === "string" ? record.interpreter_confirm_prompt.trim() : "";
  const failReason = typeof record.fail_reason === "string" ? record.fail_reason : "";
  const failClass = typeof record.fail_class === "string" ? record.fail_class : "";
  const blockedByGate =
    record.ok === false &&
    (record.error === "multilang_dispatch_blocked" ||
      record.error === "multilang_confirmation_required" ||
      failClass === "multilang_confidence_gate" ||
      /^HELIX_(?:INTERPRETER|MULTILANG)_/.test(failReason));
  const fallbackText = message || interpreterConfirmPrompt || (blockedByGate ? "Confirmation is required." : "");
  const invalidRawText = /^no final answer returned\.?$/i.test(rawText);
  const text =
    selectedFinalAnswer ||
    assistantAnswer ||
    (rawText && !invalidRawText ? rawText : "") ||
    fallbackText ||
    "I couldn't produce a final answer for that turn. Please retry once.";
  return {
    ...(record as LocalAskResponse),
    text,
  };
};

const askLocalDirect = async (
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<LocalAskResponse> => {
  const hasTurnInputItems = Array.isArray(body.turn_input_items) && body.turn_input_items.length > 0;
  const endpoint =
    isHelixE814LaneParityEnabled() || hasTurnInputItems || bodyRequiresAskTurnEntrypoint(body)
      ? "/api/agi/ask/turn"
      : "/api/agi/ask";
  const payload = await asJson<unknown>(
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),
  );
  return normalizeLocalAskResponse(payload);
};

const waitForOnline = async (signal?: AbortSignal): Promise<number> => {
  if (!isNavigatorOffline()) return 0;
  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const handleOnline = () => {
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(buildAbortError());
    };
    const cleanup = () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      signal?.removeEventListener("abort", handleAbort);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline, { once: true });
    }
    if (signal) {
      signal.addEventListener("abort", handleAbort, { once: true });
    }
  });
  return Date.now() - startedAt;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(buildAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const createAskJob = async (
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<HelixAskJobCreateResponse> => {
  const response = await fetch("/api/agi/ask/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (response.status === 404 || response.status === 405) {
    const error = new Error("Helix Ask job endpoint unavailable");
    (error as { code?: string }).code = "helix_ask_jobs_unsupported";
    throw error;
  }
  return asJson(response);
};

const getAskJob = async (
  jobId: string,
  signal?: AbortSignal,
): Promise<HelixAskJobResponse> =>
  asJson(
    await fetch(`/api/agi/ask/jobs/${encodeURIComponent(jobId)}`, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
      cache: "no-store",
      signal,
    }),
  );

const pollAskJob = async (
  jobId: string,
  options?: { signal?: AbortSignal; pollIntervalMs?: number; timeoutMs?: number },
): Promise<LocalAskResponse> => {
  const pollInterval = Math.max(250, options?.pollIntervalMs ?? HELIX_ASK_JOB_POLL_INTERVAL_MS);
  const startedAt = Date.now();
  let timeoutDeadline =
    typeof options?.timeoutMs === "number"
      ? startedAt + Math.max(0, options.timeoutMs)
      : HELIX_ASK_JOB_TIMEOUT_MS > 0
        ? startedAt + HELIX_ASK_JOB_TIMEOUT_MS
        : Number.POSITIVE_INFINITY;
  let lastPartialText = "";
  let consecutiveErrors = 0;

  while (true) {
    if (options?.signal?.aborted) {
      throw buildAbortError();
    }
    if (isNavigatorOffline()) {
      const waited = await waitForOnline(options?.signal);
      timeoutDeadline += waited;
      continue;
    }
    let job: HelixAskJobResponse | null = null;
    try {
      job = await getAskJob(jobId, options?.signal);
      consecutiveErrors = 0;
      if (job.expiresAt && Number.isFinite(job.expiresAt)) {
        timeoutDeadline = Math.max(timeoutDeadline, job.expiresAt);
      }
    } catch (error) {
      if (options?.signal?.aborted) {
        throw buildAbortError();
      }
      if (isJobMissingError(error)) {
        const fallback = lastPartialText || "Request interrupted. Please try again.";
        return { text: fallback } as LocalAskResponse;
      }
      if (isNavigatorOffline()) {
        const waited = await waitForOnline(options?.signal);
        timeoutDeadline += waited;
        continue;
      }
      if (!isJobPollTransientError(error)) {
        throw error;
      }
      consecutiveErrors += 1;
      if (Date.now() > timeoutDeadline) {
        const fallback = lastPartialText || "Request timed out.";
        return { text: fallback } as LocalAskResponse;
      }
      const maxErrorsReached = consecutiveErrors >= HELIX_ASK_JOB_MAX_CONSECUTIVE_ERRORS;
      if (maxErrorsReached && Date.now() > timeoutDeadline) {
        const fallback = lastPartialText || "Request failed. Please try again.";
        return { text: fallback } as LocalAskResponse;
      }
      const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
      const retryDelay =
        typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
          ? Math.min(60_000, Math.max(pollInterval, retryAfterMs))
          : undefined;
      const backoffCap = maxErrorsReached ? 15_000 : 8000;
      const backoffBase = Math.min(backoffCap, pollInterval * Math.pow(2, Math.min(consecutiveErrors, 4)));
      const delay = retryDelay ?? backoffBase * (0.75 + Math.random() * 0.5);
      await sleep(delay, options?.signal);
      continue;
    }
    if (job.partialText) {
      lastPartialText = job.partialText.trim();
    }
    if (job.status === "completed") {
      if (job.result) return normalizeLocalAskResponse(job.result);
      return { text: lastPartialText } as LocalAskResponse;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      const message = job.error?.trim() || "Helix Ask job failed.";
      if (message.includes("helix_ask_timeout")) {
        const fallback = lastPartialText || "Request timed out.";
        return { text: fallback } as LocalAskResponse;
      }
      throw new Error(message);
    }
    if (Date.now() > timeoutDeadline) {
      const fallback = lastPartialText || "Request timed out.";
      return { text: fallback } as LocalAskResponse;
    }
    await sleep(pollInterval, options?.signal);
  }
};

export const getPendingHelixAskJob = (): PendingHelixAskJob | null =>
  readPendingHelixAskJob();

export const resumeHelixAskJob = async (
  jobId: string,
  options?: { signal?: AbortSignal; pollIntervalMs?: number; timeoutMs?: number },
): Promise<LocalAskResponse> => {
  try {
    return await pollAskJob(jobId, options);
  } finally {
    clearPendingHelixAskJob(jobId);
  }
};

export async function askLocal(
  prompt?: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    seed?: number;
    stop?: string | string[];
    sessionId?: string;
    traceId?: string;
    personaId?: string;
    question?: string;
    sourceQuestion?: string;
    sourceLanguage?: string;
    languageDetected?: string;
    languageConfidence?: number;
    codeMixed?: boolean;
    pivotConfidence?: number;
    translated?: boolean;
    responseLanguage?: string;
    preferredResponseLanguage?: string;
    interpreter?: HelixInterpreterArtifact;
    interpreter_schema_version?: "helix.interpreter.v1" | string;
    multilangConfirm?: boolean;
    lang_schema_version?: "helix.lang.v1" | string;
    debug?: boolean;
    verbosity?: "brief" | "normal" | "extended";
    searchQuery?: string;
    topK?: number;
    context?: string;
    contextFiles?: string[];
    signal?: AbortSignal;
    mode?: "read" | "observe" | "act" | "verify";
    allowTools?: string[];
    requiredEvidence?: string[];
    answerContract?: HelixAskAnswerContract;
    routeMetadata?: HelixAskRouteMetadata;
    route_metadata?: HelixAskRouteMetadata;
    turnInputItems?: HelixTurnInputItem[];
    verify?: { mode?: "constraint-pack" | "agent-loop"; packId?: string };
    place?: HaloBankPlace;
    timestamp?: string | number;
    durationMs?: number;
    compare?: { place?: HaloBankPlace; timestamp?: string | number; durationMs?: number };
    model?: { includeEnvelope?: boolean; includeCausal?: boolean };
    capsuleIds?: string[];
    dialogue_profile?: "dot_min_steps_v1";
  },
): Promise<LocalAskResponse> {
  const body: Record<string, unknown> = {};
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const promptQuestionMatch =
    typeof prompt === "string"
      ? prompt.match(/(?:^|\n)Question:\s*([^\n]+)/i)?.[1]?.trim()
      : "";
  if (trimmedPrompt) {
    body.prompt = prompt;
    body.raw_user_prompt = trimmedPrompt;
  }
  if (typeof options?.maxTokens === "number") body.max_tokens = options.maxTokens;
  if (typeof options?.temperature === "number") body.temperature = options.temperature;
  if (typeof options?.seed === "number") body.seed = options.seed;
  if (options?.stop) body.stop = options.stop;
  if (options?.sessionId) body.sessionId = options.sessionId;
  if (options?.traceId) body.traceId = options.traceId;
  if (options?.personaId) body.personaId = options.personaId;
  if (typeof options?.question === "string" && options.question.trim()) {
    body.question = options.question.trim();
    body.question_source = "explicit_option";
  } else if (trimmedPrompt) {
    body.question = trimmedPrompt;
    body.question_source = "raw_prompt";
  }
  if (promptQuestionMatch) {
    body.extracted_question_label = promptQuestionMatch;
  }
  if (typeof options?.sourceQuestion === "string" && options.sourceQuestion.trim()) {
    body.sourceQuestion = options.sourceQuestion.trim();
  }
  if (typeof options?.sourceLanguage === "string" && options.sourceLanguage.trim()) {
    body.sourceLanguage = options.sourceLanguage.trim();
  }
  if (typeof options?.languageDetected === "string" && options.languageDetected.trim()) {
    body.languageDetected = options.languageDetected.trim();
  }
  if (typeof options?.languageConfidence === "number" && Number.isFinite(options.languageConfidence)) {
    body.languageConfidence = options.languageConfidence;
  }
  if (typeof options?.codeMixed === "boolean") {
    body.codeMixed = options.codeMixed;
  }
  if (typeof options?.pivotConfidence === "number" && Number.isFinite(options.pivotConfidence)) {
    body.pivotConfidence = options.pivotConfidence;
  }
  if (typeof options?.translated === "boolean") {
    body.translated = options.translated;
  }
  if (typeof options?.responseLanguage === "string" && options.responseLanguage.trim()) {
    body.responseLanguage = options.responseLanguage.trim();
  }
  if (
    typeof options?.preferredResponseLanguage === "string" &&
    options.preferredResponseLanguage.trim()
  ) {
    body.preferredResponseLanguage = options.preferredResponseLanguage.trim();
  }
  if (options?.interpreter) {
    body.interpreter = options.interpreter;
  }
  if (typeof options?.interpreter_schema_version === "string" && options.interpreter_schema_version.trim()) {
    body.interpreter_schema_version = options.interpreter_schema_version.trim();
  }
  if (typeof options?.multilangConfirm === "boolean") {
    body.multilangConfirm = options.multilangConfirm;
  }
  if (typeof options?.lang_schema_version === "string" && options.lang_schema_version.trim()) {
    body.lang_schema_version = options.lang_schema_version.trim();
  }
  if (typeof options?.debug === "boolean") body.debug = options.debug;
  if (options?.verbosity) body.verbosity = options.verbosity;
  if (typeof options?.searchQuery === "string" && options.searchQuery.trim()) {
    body.searchQuery = options.searchQuery.trim();
  }
  if (typeof options?.topK === "number") body.topK = options.topK;
  if (typeof options?.context === "string" && options.context.trim()) {
    body.context = options.context;
  }
  if (Array.isArray(options?.contextFiles) && options.contextFiles.length > 0) {
    body.contextFiles = options.contextFiles
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 48);
  }
  if (options?.mode) body.mode = options.mode;
  if (options?.allowTools?.length) body.allowTools = options.allowTools;
  if (options?.requiredEvidence?.length) body.requiredEvidence = options.requiredEvidence;
  if (options?.answerContract) body.answer_contract = options.answerContract;
  if (Array.isArray(options?.turnInputItems) && options.turnInputItems.length > 0) {
    body.turn_input_items = options.turnInputItems;
  }
  appendHelixAskRouteMetadataToBody(body, options?.routeMetadata ?? options?.route_metadata);
  if (options?.verify) body.verify = options.verify;
  if (options?.place) body.place = options.place;
  if (options?.timestamp !== undefined) body.timestamp = options.timestamp;
  if (typeof options?.durationMs === "number") body.durationMs = options.durationMs;
  if (options?.compare) body.compare = options.compare;
  if (options?.model) body.model = options.model;
  if (Array.isArray(options?.capsuleIds) && options.capsuleIds.length > 0) {
    body.capsuleIds = options.capsuleIds.slice(0, HELIX_CONTEXT_CAPSULE_MAX_IDS);
  }
  if (options?.dialogue_profile) {
    body.dialogue_profile = options.dialogue_profile;
  }
  const signal = options?.signal;
  const hasTurnInputItems = Array.isArray(body.turn_input_items) && body.turn_input_items.length > 0;
  if (hasTurnInputItems || bodyRequiresAskTurnEntrypoint(body)) {
    if (isNavigatorOffline()) {
      await waitForOnline(signal);
    }
    return await askLocalDirect(body, signal);
  }
  if (isHelixE814LaneParityEnabled()) {
    if (isNavigatorOffline()) {
      await waitForOnline(signal);
    }
    return await askLocalDirect(body, signal);
  }
  if (isNavigatorOffline()) {
    await waitForOnline(signal);
  }
  try {
    const job = await createAskJob(body, signal);
    const question = typeof body.question === "string" ? body.question : undefined;
    writePendingHelixAskJob({
      jobId: job.jobId,
      question,
      sessionId: job.sessionId ?? options?.sessionId ?? null,
      traceId: job.traceId ?? options?.traceId ?? null,
      startedAt: Date.now(),
    });
    try {
      const result = await pollAskJob(job.jobId, { signal });
      if (!signal?.aborted && isInterruptedJobFallbackResponse(result)) {
        return buildBlockedJobDirectFallbackResponse(result, job.jobId);
      }
      return result;
    } finally {
      clearPendingHelixAskJob(job.jobId);
    }
  } catch (error) {
    if (isNavigatorOffline()) {
      await waitForOnline(signal);
      const job = await createAskJob(body, signal);
      const question = typeof body.question === "string" ? body.question : undefined;
      writePendingHelixAskJob({
        jobId: job.jobId,
        question,
        sessionId: job.sessionId ?? options?.sessionId ?? null,
        traceId: job.traceId ?? options?.traceId ?? null,
        startedAt: Date.now(),
      });
      try {
        const result = await pollAskJob(job.jobId, { signal });
        if (!signal?.aborted && isInterruptedJobFallbackResponse(result)) {
          return buildBlockedJobDirectFallbackResponse(result, job.jobId);
        }
        return result;
      } finally {
        clearPendingHelixAskJob(job.jobId);
      }
    }
    if (!isHelixAskJobUnsupported(error)) {
      throw error;
    }
  }
  if (isNavigatorOffline()) {
    await waitForOnline(signal);
  }
  return await askLocalDirect(body, signal);
}

export async function askMoodHint(
  text: string,
  options?: { sessionId?: string; personaId?: string; signal?: AbortSignal },
): Promise<MoodHintResponse> {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return { mood: null, confidence: 0 };
  }
  const body: Record<string, unknown> = { text: trimmed };
  if (options?.sessionId) body.sessionId = options.sessionId;
  if (options?.personaId) body.personaId = options.personaId;
  return asJson(
    await fetch("/api/agi/mood-hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    }),
  );
}

export function subscribeToolLogs(
  onEvent: (event: ToolLogEvent) => void,
  options?: { tool?: string; sessionId?: string; traceId?: string; limit?: number },
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  const params = new URLSearchParams();
  if (options?.tool) params.set("tool", options.tool);
  if (options?.sessionId) params.set("sessionId", options.sessionId);
  if (options?.traceId) params.set("traceId", options.traceId);
  if (typeof options?.limit === "number") params.set("limit", String(options.limit));
  const url = params.toString()
    ? `/api/agi/tools/logs/stream?${params.toString()}`
    : "/api/agi/tools/logs/stream";
  const source = new EventSource(url);
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as ToolLogEvent);
    } catch {
      /* ignore malformed events */
    }
  };
  source.onerror = () => {
    /* best-effort stream, do nothing on error */
  };
  return () => {
    source.close();
  };
}

export async function getReasoningTheaterConfig(
  options?: { forceRefresh?: boolean },
): Promise<ReasoningTheaterConfigResponse> {
  if (!options?.forceRefresh && reasoningTheaterConfigPromise) {
    return reasoningTheaterConfigPromise;
  }
  reasoningTheaterConfigPromise = (async () => {
    try {
      const response = await fetch("/api/helix/reasoning-theater/config", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`reasoning-theater-config-http-${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      return parseReasoningTheaterConfigPayload(payload);
    } catch {
      return getDefaultReasoningTheaterConfig();
    }
  })();
  return reasoningTheaterConfigPromise;
}

export async function getReasoningTheaterTopology(
  options?: { forceRefresh?: boolean },
): Promise<ReasoningTheaterTopologyResponse> {
  if (!options?.forceRefresh && reasoningTheaterTopologyPromise) {
    return reasoningTheaterTopologyPromise;
  }
  reasoningTheaterTopologyPromise = (async () => {
    const response = await fetch("/api/helix/reasoning-theater/topology", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`reasoning-theater-topology-http-${response.status}`);
    }
    const payload = (await response.json()) as ReasoningTheaterTopologyResponse;
    return payload;
  })().catch((error) => {
    reasoningTheaterTopologyPromise = null;
    throw error;
  });
  return reasoningTheaterTopologyPromise;
}

export async function getReasoningTheaterAtlasGraph(
  options?: { forceRefresh?: boolean },
): Promise<ReasoningTheaterAtlasGraphResponse> {
  if (!options?.forceRefresh && reasoningTheaterAtlasGraphPromise) {
    return reasoningTheaterAtlasGraphPromise;
  }
  reasoningTheaterAtlasGraphPromise = (async () => {
    const response = await fetch("/api/helix/reasoning-theater/atlas-graph", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`reasoning-theater-atlas-graph-http-${response.status}`);
    }
    return (await response.json()) as ReasoningTheaterAtlasGraphResponse;
  })().catch((error) => {
    reasoningTheaterAtlasGraphPromise = null;
    throw error;
  });
  return reasoningTheaterAtlasGraphPromise;
}

export async function getReasoningTheaterCongruenceGraph(options?: {
  forceRefresh?: boolean;
  treeIds?: string[];
  primaryTreeId?: string | null;
}): Promise<ReasoningTheaterCongruenceGraphResponse> {
  const treeIds = Array.isArray(options?.treeIds)
    ? Array.from(
        new Set(
          options.treeIds
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
            .map((entry) => entry.toLowerCase()),
        ),
      )
    : [];
  const primaryTreeId =
    typeof options?.primaryTreeId === "string" && options.primaryTreeId.trim().length > 0
      ? options.primaryTreeId.trim().toLowerCase()
      : "";
  const cacheKey = `${treeIds.join(",")}|${primaryTreeId}`;
  if (!options?.forceRefresh) {
    const cached = reasoningTheaterCongruenceGraphPromiseByKey.get(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const promise = (async () => {
    const search = new URLSearchParams();
    if (treeIds.length > 0) {
      search.set("treeIds", treeIds.join(","));
    }
    if (primaryTreeId) {
      search.set("primaryTreeId", primaryTreeId);
    }
    const query = search.toString();
    const response = await fetch(
      query
        ? `/api/helix/reasoning-theater/congruence-graph?${query}`
        : "/api/helix/reasoning-theater/congruence-graph",
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      throw new Error(`reasoning-theater-congruence-graph-http-${response.status}`);
    }
    return (await response.json()) as ReasoningTheaterCongruenceGraphResponse;
  })().catch((error) => {
    reasoningTheaterCongruenceGraphPromiseByKey.delete(cacheKey);
    throw error;
  });
  reasoningTheaterCongruenceGraphPromiseByKey.set(cacheKey, promise);
  return promise;
}

export async function getContextCapsule(
  capsuleId: string,
  options?: { sessionId?: string; signal?: AbortSignal; forceRefresh?: boolean },
): Promise<ContextCapsuleLookupResponse> {
  const normalized = capsuleId.trim().toUpperCase();
  if (!normalized) {
    throw new Error("capsule_id_required");
  }
  const cacheKey = `${normalized}|${options?.sessionId ?? ""}`;
  if (!options?.forceRefresh) {
    const cached = contextCapsulePromiseByKey.get(cacheKey);
    if (cached) return cached;
  }
  const promise = (async () => {
    const search = new URLSearchParams();
    if (options?.sessionId) {
      search.set("sessionId", options.sessionId);
    }
    const query = search.toString();
    const response = await fetch(
      query
        ? `/api/helix/capsule/${encodeURIComponent(normalized)}?${query}`
        : `/api/helix/capsule/${encodeURIComponent(normalized)}`,
      {
        headers: { Accept: "application/json" },
        signal: options?.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`context-capsule-http-${response.status}`);
    }
    return (await response.json()) as ContextCapsuleLookupResponse;
  })().catch((error) => {
    contextCapsulePromiseByKey.delete(cacheKey);
    throw error;
  });
  contextCapsulePromiseByKey.set(cacheKey, promise);
  return promise;
}

export async function syncKnowledgeProjects(
  projects: KnowledgeProjectExport[],
): Promise<{ synced: number; projectIds: string[] }> {
  if (!Array.isArray(projects) || projects.length === 0) {
    return { synced: 0, projectIds: [] };
  }
  const payload = await asJson<{ synced: number; projectIds: string[]; skipped?: string }>(
    await fetch("/api/knowledge/projects/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects }),
    }),
  );
  if (payload.skipped) {
    return { synced: 0, projectIds: [] };
  }
  return payload;
}

export async function getTraceMemories(traceId: string, k = 10): Promise<TraceMemoryResponse> {
  const search = new URLSearchParams({ k: String(k) });
  return asJson(
    await fetch(`/api/agi/memory/by-trace/${encodeURIComponent(traceId)}?${search.toString()}`, {
      headers: { Accept: "application/json" }
    })
  );
}

export type MemorySearchParams = {
  q: string;
  k?: number;
  personaId?: string;
  debateOnly?: boolean;
};

export async function memorySearch({
  q,
  k = 10,
  personaId,
  debateOnly = false,
}: MemorySearchParams): Promise<MemorySearchResponse> {
  const search = new URLSearchParams();
  search.set("q", q);
  if (k) search.set("k", String(k));
  if (personaId) search.set("owner", personaId);
  if (debateOnly) search.set("debateOnly", "1");
  return asJson(
    await fetch(`/api/agi/memory/search?${search.toString()}`, {
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listChatSessions(opts?: {
  limit?: number;
  offset?: number;
  includeMessages?: boolean;
}): Promise<ChatSession[]> {
  const params = new URLSearchParams();
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (typeof opts?.offset === "number") params.set("offset", String(opts.offset));
  if (opts?.includeMessages === false) params.set("includeMessages", "0");
  const suffix = params.toString();
  const payload = await asJson<{ sessions?: ChatSession[] }>(
    await fetch(`/api/agi/chat/sessions${suffix ? `?${suffix}` : ""}`, {
      headers: { Accept: "application/json" },
    }),
  );
  return payload.sessions ?? [];
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  if (!id) return null;
  const payload = await asJson<{ session?: ChatSession }>(
    await fetch(`/api/agi/chat/sessions/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
    }),
  );
  return payload.session ?? null;
}

export async function upsertChatSession(session: ChatSession): Promise<ChatSession> {
  const payload = await asJson<{ session: ChatSession }>(
    await fetch("/api/agi/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    }),
  );
  return payload.session;
}

export async function deleteChatSession(id: string): Promise<void> {
  if (!id) return;
  await asJson(
    await fetch(`/api/agi/chat/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function listPersonas(): Promise<PersonaSummary[]> {
  const payload = await asJson<PersonaListResponse>(
    await fetch("/api/agi/persona/list", {
      headers: { Accept: "application/json" }
    })
  ).catch((error) => {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  });
  if (!payload || !Array.isArray(payload.personas)) {
    return [];
  }
  return payload.personas;
}

export async function startDebateSession(payload: DebateStartPayload): Promise<DebateStartResponse> {
  const body: Record<string, unknown> = {
    goal: payload.goal,
    persona_id: payload.personaId,
  };
  if (Number.isFinite(payload.maxRounds)) {
    body.max_rounds = payload.maxRounds;
  }
  if (Number.isFinite(payload.maxWallMs)) {
    body.max_wall_ms = payload.maxWallMs;
  }
  if (Array.isArray(payload.verifiers) && payload.verifiers.length > 0) {
    body.verifiers = payload.verifiers.map((name) => name?.toString().trim()).filter((name) => !!name);
  }
  return asJson(
    await fetch("/api/agi/debate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

export async function getDebateStatus(debateId: string): Promise<DebateSnapshot> {
  return asJson(
    await fetch(`/api/agi/debate/${encodeURIComponent(debateId)}`, {
      headers: { Accept: "application/json" }
    })
  );
}

export async function getPanelSnapshots(params: { desktopId?: string; panelIds?: string[] } = {}): Promise<PanelSnapshotResponse> {
  const search = new URLSearchParams();
  if (params.desktopId) {
    search.set("desktopId", params.desktopId);
  }
  if (params.panelIds && params.panelIds.length > 0) {
    search.set("panelIds", params.panelIds.join(","));
  }
  return asJson(
    await fetch(`/api/agi/telemetry/panels?${search.toString()}`, {
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getBadgeTelemetry(params: { desktopId?: string; includeRaw?: boolean } = {}): Promise<BadgeTelemetryResponse> {
  const search = new URLSearchParams();
  if (params.desktopId) {
    search.set("desktopId", params.desktopId);
  }
  if (params.includeRaw) {
    search.set("includeRaw", "1");
  }
  return asJson(
    await fetch(`/api/agi/telemetry/badges?${search.toString()}`, {
      headers: { Accept: "application/json" },
    }),
  );
}

export async function fetchEssenceProfile(
  essenceId: string,
  options?: { stateless?: boolean },
): Promise<EssenceProfile | null> {
  const params = new URLSearchParams();
  if (options?.stateless) params.set("stateless", "1");
  const res = await fetch(`/api/essence/profile/${essenceId}?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch essence profile");
  }
  const json = (await res.json()) as { profile?: EssenceProfile | null };
  return json.profile ?? null;
}

export async function updateEssenceProfile(
  essenceId: string,
  update: EssenceProfileUpdate,
  options?: { stateless?: boolean },
): Promise<EssenceProfile> {
  const params = new URLSearchParams();
  if (options?.stateless) params.set("stateless", "1");
  const res = await fetch(`/api/essence/profile/${essenceId}?${params.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update ?? {}),
  });
  if (!res.ok) {
    throw new Error("Failed to update essence profile");
  }
  const json = (await res.json()) as { profile: EssenceProfile };
  return json.profile;
}

export async function resetEssenceProfile(
  essenceId: string,
  options?: { stateless?: boolean },
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.stateless) params.set("stateless", "1");
  const res = await fetch(`/api/essence/profile/${essenceId}?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Failed to reset essence profile");
  }
}

export type DebateStreamHandlers = {
  onEvent?: (event: DebateStreamEvent) => void;
  onError?: (event: Event) => void;
};

type EventPayload<T extends DebateStreamEvent["type"]> = Omit<Extract<DebateStreamEvent, { type: T }>, "type">;

const parseEventPayload = <T extends DebateStreamEvent["type"]>(event: Event): EventPayload<T> | null => {
  try {
    const data = JSON.parse((event as MessageEvent<string>).data || "{}") as EventPayload<T>;
    return data;
  } catch {
    return null;
  }
};

export function connectDebateStream(debateId: string, handlers: DebateStreamHandlers = {}): () => void {
  if (!debateId || typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  const params = new URLSearchParams({ debateId });
  const source = new EventSource(`/api/agi/debate/stream?${params.toString()}`);
  const dispatch = <T extends DebateStreamEvent["type"]>(type: T) => (event: Event) => {
    const payload = parseEventPayload<T>(event);
    if (!payload) return;
    handlers.onEvent?.({ ...payload, type } as Extract<DebateStreamEvent, { type: T }>);
  };
  const handleTurn = dispatch("turn");
  const handleStatus = dispatch("status");
  const handleOutcome = dispatch("outcome");
  source.addEventListener("turn", handleTurn);
  source.addEventListener("status", handleStatus);
  source.addEventListener("outcome", handleOutcome);
  source.onerror = (event) => {
    handlers.onError?.(event);
  };
  return () => {
    source.removeEventListener("turn", handleTurn);
    source.removeEventListener("status", handleStatus);
    source.removeEventListener("outcome", handleOutcome);
    source.close();
  };
}
