import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  selectActiveLiveAnswerEnvironment,
  selectLiveAnswerEnvironmentDeltas,
  useLiveAnswerEnvironmentStore,
  type LiveAnswerEnvironmentState,
} from "@/store/useLiveAnswerEnvironmentStore";
import { useDocEquationContextStore } from "@/store/useDocEquationContextStore";
import { buildDocEquationContextAskPrompt } from "@/lib/docs/docEquationContextEvents";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import type { DocEquationContextArtifactV1 } from "@shared/contracts/doc-equation-context.v1";
import type { WorkstationLiveSource, WorkstationLiveSourceEvent, LiveSourceWindowSummary } from "@shared/helix-workstation-live-source";
import type { HelixLiveSourceChunk } from "@shared/helix-live-source-chunk";
import type { LiveAnswerEnvironmentDelta, LiveAnswerLineState } from "@shared/helix-live-answer-environment";
import type {
  LiveCommentaryCadence,
  LiveCommentaryCandidate,
  LiveCommentaryDeliveryReceipt,
  LiveCommentaryProposal,
  LiveCommentarySession,
  LiveCommentaryTraceStep,
} from "@shared/helix-live-commentary";
import type { HelixInterpretedEvent } from "@shared/helix-interpreted-event-log";
import type { HelixPresentStateCard } from "@shared/helix-present-state-card";
import type {
  HelixClarificationNeed,
  HelixClarificationQuestionProposal,
} from "@shared/helix-clarification-dialogue";
import type { HelixUserSteeringEvidence } from "@shared/helix-user-steering-evidence";
import type { HelixLiveLineToolEvaluation } from "@shared/helix-live-line-tool-evaluation";
import type { HelixLiveLineToolRequest } from "@shared/helix-live-line-tool-request";
import type { HelixLiveCardLineSourceCoverage, HelixLiveCardLineState } from "@shared/helix-live-card-line-state";
import type { HelixSituationSourceCapability, HelixSituationSourceModality, HelixSituationSourceStatus } from "@shared/helix-situation-source-capability";
import type { HelixVisualEvidenceHealth } from "@shared/helix-visual-evidence-health";
import type {
  StagePlayMicroReasonerRunV1,
  StagePlayMicroReasonerPromptPresetV1,
  StagePlayMicroReasonerPromptV1,
  StagePlayLiveSourceMailSourceKindV1,
} from "@shared/contracts/stage-play-live-source-mail.v1";
import type {
  AgentGoalSessionV1,
  WorkstationDispatchActionV1,
  WorkstationGoalContextUpdateV1,
} from "@shared/contracts/workstation-goal-context.v1";
import {
  ADAPTIVE_VISUAL_LENS_CONTROLLER_PRESET_ID,
  type StagePlayAdaptiveVisualLensApplyResultV1,
  type StagePlayAdaptiveVisualLensProposalV1,
} from "@shared/contracts/stage-play-adaptive-visual-lens.v1";
import type { StagePlayVisualObserverProfileV1 } from "@shared/contracts/stage-play-visual-observer-profile.v1";
import type { HelixVisualFrameActionReplayRequest } from "@shared/helix-visual-frame-action-replay";
import type { HelixLiveWorkerLane } from "@shared/helix-live-worker-lane";
import type { HelixLiveWorkerRun } from "@shared/helix-live-worker-run";
import {
  buildRehearsalSpaceCatalog,
  type HelixRehearsalSpace,
  type HelixRehearsalSpaceAvailabilityInput,
  type HelixRehearsalSpaceId,
} from "@shared/helix-rehearsal-space";
import {
  adoptServerVisualProducerPolicies,
  getActiveVisualFrameStream,
  getLatestActiveVisualFrameStream,
  runVisualFrameProducerOnce,
  startVisualFrameProducerInterval,
  stopVisualFrameProducerInterval,
} from "@/lib/helix/visualFrameProducer";
import {
  useVisualSourceCaptureStore,
  type VisualSourceCaptureFrameHistoryItem,
  type VisualSourceCaptureState,
} from "@/store/useVisualSourceCaptureStore";
import { useImageLensLiveSourceStore } from "@/store/useImageLensLiveSourceStore";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import {
  requestHelixAskVisualFrameAttachmentPromotion,
  requestHelixAskVisualFrameLivePromotion,
} from "@/components/helix/ask-console/HelixAskVisualFramePromotion";
import {
  startDisplayAudioSituationSession,
  type DisplayAudioSituationSession,
  type DisplayAudioTranscriptChunk,
} from "@/lib/helix/display-audio-capture";
import { postAudioTranscriptLiveSourceDescriptor } from "@/lib/helix/liveSourceDescriptorClient";
import {
  LiveAnswerReasoningCircuit,
  type LiveAnswerPacketCircuitRef,
  type LiveAnswerReasoningCircuitRow,
} from "./LiveAnswerReasoningCircuit";
import {
  workstationCircuitSwatch,
  workstationMicroDeckColorKey,
} from "@/lib/workstation/reasoningCircuitColor";

type LiveEnvironmentTab = "present_state" | "navigation_evidence" | "worker_lanes" | "line_checks" | "interpreted_log" | "clarification" | "live_cognition" | "overview" | "sources" | "line_schema" | "deltas" | "windows" | "commentary" | "reviews" | "debug";
type VisualCaptureRoute = "live_answer" | "image_lens" | "audio_transcript";
type AudioTranscriptCaptureStatus = "idle" | "requesting_permission" | "listening" | "transcribing" | "error";
type LiveAnswerMicroDeckCatalogPhase = "capture_prompt" | "mail_reasoning";
type LiveAnswerMicroDeckCatalogItem =
  | {
      kind: "visual_observer_profile";
      id: string;
      title: string;
      description: string;
      groupTitle: "Visual Capture Decks";
      phase: "capture_prompt";
      sourceKind: "visual_frame";
      applied: boolean;
      colorKey: string;
    }
  | {
      kind: "micro_reasoner_preset";
      id: string;
      title: string;
      description: string;
      groupTitle: "Visual Mail Decks" | "Audio Transcript Decks" | "Document Markdown Decks";
      phase: "mail_reasoning";
      sourceKind: StagePlayLiveSourceMailSourceKindV1;
      outputPolicy: string;
      applied: boolean;
      colorKey: string;
    };
type LiveAnswerMicroDeckCatalogGroup = {
  title: LiveAnswerMicroDeckCatalogItem["groupTitle"];
  phase: LiveAnswerMicroDeckCatalogPhase;
  sourceKind: StagePlayLiveSourceMailSourceKindV1;
  items: LiveAnswerMicroDeckCatalogItem[];
};
const VISUAL_CAPTURE_ROUTE_STORAGE_KEY = "helix.liveAnswer.visualCaptureRoutes.v1";
const VISUAL_CAPTURE_ROUTE_SYNC_EVENT = "helix:live-answer:visual-capture-routes";
const VISUAL_CAPTURE_ROUTE_VALUES: VisualCaptureRoute[] = ["live_answer", "image_lens", "audio_transcript"];
const AUDIO_TRANSCRIPT_DEFAULT_CHUNK_MS = 10_000;
const AUDIO_TRANSCRIPT_HISTORY_LIMIT = 20;

function readStoredVisualCaptureRoutes(): VisualCaptureRoute[] {
  if (typeof window === "undefined") return ["live_answer"];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VISUAL_CAPTURE_ROUTE_STORAGE_KEY) ?? "null");
    if (!Array.isArray(parsed)) return ["live_answer"];
    const routes = parsed.filter((value: unknown): value is VisualCaptureRoute =>
      typeof value === "string" && VISUAL_CAPTURE_ROUTE_VALUES.includes(value as VisualCaptureRoute));
    return routes.length ? routes : ["live_answer"];
  } catch {
    return ["live_answer"];
  }
}

function coerceVisualCaptureRoutes(value: unknown): VisualCaptureRoute[] {
  if (!Array.isArray(value)) return ["live_answer"];
  const routes = value.filter((entry: unknown): entry is VisualCaptureRoute =>
    typeof entry === "string" && VISUAL_CAPTURE_ROUTE_VALUES.includes(entry as VisualCaptureRoute));
  return routes.length ? routes : ["live_answer"];
}
type ClientCapabilityActionRead = {
  action_request_id: string;
  capability: string;
  action: string;
  status: string;
  args?: Record<string, unknown>;
};
type ClientCapabilityAdoptionRead = {
  adoption_id: string;
  capability: string;
  action: string;
  ok: boolean;
  observed_state?: Record<string, unknown>;
};
type LiveCognitionObservationRead = {
  observation_id: string;
  role: string;
  text: string;
  model_invoked: boolean;
  evidence_refs?: string[];
  created_at: string;
};
type LiveCognitionInterpretationRead = {
  interpretation_id: string;
  title: string;
  summary: string;
  evidence_refs?: string[];
  expires_at: string;
  confidence?: number;
};
type LiveCognitionGoalRead = {
  goal_id: string;
  candidate_goal: string;
  status: string;
  next_evidence_needed?: string[];
  expires_at: string;
};
type LiveCognitionHandoffRead = {
  handoff_id: string;
  objective: string;
  reasoning_budget: string;
  selected_evidence_refs?: string[];
  created_at: string;
};
type LiveSituationRunRead = {
  situation_run_id: string;
  modality_scope: string;
  status: string;
  active_fields?: string[];
  reasoning_budget: string;
  updated_at: string;
};
type LiveFieldWorkerRead = {
  worker_id: string;
  field_key: string;
  field_label: string;
  worker_role: string;
  status: string;
  may_execute_tool: boolean;
};
type LiveFieldWorkerRunRead = {
  worker_run_id: string;
  worker_id: string;
  field_key: string;
  status: string;
  output_evaluation_id?: string | null;
  completed_at?: string | null;
};
type LiveFieldEvaluationRead = {
  evaluation_id: string;
  worker_id: string;
  field_key: string;
  value: string;
  status: string;
  confidence: number;
  missing_evidence?: string[];
  expires_at: string;
};
type LiveTangentEvaluationRead = {
  tangent_id: string;
  tangent_type: string;
  claim: string;
  confidence: number;
  recommended_handoff?: { type: string; reason: string };
};
type LiveArbitrationCandidateRead = {
  candidate_id: string;
  candidate_type: string;
  priority: string;
  status: string;
  reason: string;
  evidence_refs?: string[];
  field_evaluation_refs?: string[];
  tangent_refs?: string[];
  epoch: number;
  source_binding_id: string;
};
type LivePlanContractRead = {
  plan_id: string;
  action_id: string;
  client_adoption_required: boolean;
  can_execute_itself: boolean;
  created_at: string;
};
type LiveSituationRunAcceptanceRead = {
  acceptance_id: string;
  scenario: string;
  ok: boolean;
  summary: string;
  checks?: Array<{ check: string; passed: boolean; evidence: string }>;
  created_at: string;
};
type LiveSituationPredictionRead = {
  prediction_id: string;
  field_key: string;
  claim: string;
  status: string;
  source_epoch: number;
  expected_observation_signals?: string[];
  expires_at: string;
};
type LiveObservationProbeRead = {
  probe_id: string;
  prediction_id: string;
  probe_type: string;
  status: string;
  source_epoch: number;
  expected_observation_signals?: string[];
};
type LiveProbeResultRead = {
  probe_result_id: string;
  prediction_id: string;
  status: string;
  tested_at_epoch: number;
  observed_signals?: string[];
  confidence_delta: number;
};
type LiveConfidenceUpdateRead = {
  confidence_update_id: string;
  field_key?: string | null;
  confidence_delta: number;
  updated_confidence?: number | null;
  reason: string;
};
type LiveProcedureEpochRead = {
  epoch_id: string;
  epoch: number;
  observation_refs?: string[];
  field_evaluation_refs?: string[];
  prediction_refs?: string[];
  probe_result_refs?: string[];
  created_at: string;
};
type LiveProcedureEpochClosureRead = {
  closure_id: string;
  epoch: number;
  status: string;
  card_updated: boolean;
  confidence_changes?: string[];
  pending_actions?: string[];
  next_epoch_triggers?: string[];
  created_at: string;
};
type LiveProcedureLedgerItemRead = {
  ledger_item_id: string;
  epoch: number;
  item_kind: string;
  item_ref: string;
  summary: string;
  causality_refs?: string[];
  created_at: string;
};
type LiveAskHandoffConsumptionRead = {
  consumption_id: string;
  handoff_id: string;
  epoch: number;
  status: string;
  reasoning_budget: string;
  selected_evidence_refs?: string[];
};
type LivePlanContractExecutionRead = {
  execution_id: string;
  plan_id: string;
  epoch: number;
  action_id: string;
  runtime_status: string;
  receipt_refs?: string[];
};
type LiveAgenticReviewReadEntry = {
  review_id: string;
  question?: string;
  trigger?: string;
  decision?: string;
  summary?: string;
  model_invoked?: boolean;
};

type WorldEventSourceSeen = {
  room_id: string;
  source_id: string;
  world_id: string;
  latest_event_type: string;
  latest_ts: string;
  event_count: number;
  latest_actor_label?: string | null;
  latest_actor_id?: string | null;
};

type SourceSignalStatus = "unchecked" | "live" | "stale" | "missing" | "error";

type SourceSignalCheck = {
  status: SourceSignalStatus;
  summary: string;
  checkedAt?: string | null;
  source?: WorldEventSourceSeen | null;
};

type VisualSourceRead = {
  source_id: string;
  thread_id: string;
  status: "permission_required" | "waiting_for_client" | "active" | "paused" | "stopped" | "error";
  source_surface?: string | null;
  capture_mode?: string | null;
  updated_at?: string | null;
};

type VisualLatestRead = {
  source?: VisualSourceRead | null;
  active_source?: VisualSourceRead | null;
  frame?: { frame_id: string; ts?: string | null } | null;
  evidence?: { evidence_id: string; summary?: string | null; ts?: string | null } | null;
  alignment?: { alignment_id: string; summary?: string | null; confidence?: number | null } | null;
  visual_evidence_health?: HelixVisualEvidenceHealth | null;
};

type VisualFrameReplayResult = {
  replayed_at: string;
  source_frame_id: string | null;
  replay_frame_id: string | null;
  evidence_id: string | null;
  shade_title: string;
  visual_prompt_hash: string | null;
  summary: string;
};

type AudioTranscriptHistoryItem = {
  history_id: string;
  source_id: string;
  event_id: string | null;
  chunk_id: string | null;
  analysis_job_id: string | null;
  transcript: string;
  compact_summary: string | null;
  evidence_refs: string[];
  chunk_index: number | null;
  duration_ms: number | null;
  from_ts: string | null;
  to_ts: string | null;
  captured_at: string;
  source_label: string;
};

type VisualObserverProfileListRead = {
  profiles?: StagePlayVisualObserverProfileV1[];
  activeProfile?: StagePlayVisualObserverProfileV1 | null;
  active_profile?: StagePlayVisualObserverProfileV1 | null;
};

type MicroReasonerPromptPresetListRead = {
  presets?: StagePlayMicroReasonerPromptPresetV1[];
  activePreset?: StagePlayMicroReasonerPromptPresetV1 | null;
  active_preset?: StagePlayMicroReasonerPromptPresetV1 | null;
  prompts?: StagePlayMicroReasonerPromptV1[];
  microReasonerPrompts?: StagePlayMicroReasonerPromptV1[];
};

type StagePlayLiveSourceMailRead = {
  mailItems?: Array<Record<string, unknown>>;
  mail_items?: Array<Record<string, unknown>>;
  processedMailPackets?: Array<Record<string, unknown>>;
  processed_mail_packets?: Array<Record<string, unknown>>;
  microReasonerRuns?: StagePlayMicroReasonerRunV1[];
  micro_reasoner_runs?: StagePlayMicroReasonerRunV1[];
  wakeRequests?: Array<Record<string, unknown>>;
  wake_requests?: Array<Record<string, unknown>>;
  wakeResults?: Array<Record<string, unknown>>;
  wake_results?: Array<Record<string, unknown>>;
};

type AdaptiveVisualLensRead = {
  latestProposal?: StagePlayAdaptiveVisualLensProposalV1 | null;
  latest_proposal?: StagePlayAdaptiveVisualLensProposalV1 | null;
  proposal?: StagePlayAdaptiveVisualLensProposalV1 | null;
  result?: StagePlayAdaptiveVisualLensApplyResultV1 | null;
  profile?: StagePlayVisualObserverProfileV1 | null;
  applied?: boolean;
  reason?: string;
};

type EarbudMicroReasonerOutput = {
  runId: string;
  role: StagePlayMicroReasonerRunV1["role"];
  text: string;
  sourceId: string;
  deckTitle: string;
  status: StagePlayMicroReasonerRunV1["status"];
  createdAt: string;
  refs: string[];
};

type DocumentMicroReasonerTraceItem = {
  id: string;
  label: string;
  status: string;
  detail: string;
  createdAt: string;
};

type SourceBindingTransitionRead = {
  transition_id: string;
  source_id: string;
  thread_id?: string | null;
  modality: string;
  from: string;
  to: string;
  reason: string;
  evidence_refs?: string[];
  created_at?: string | null;
};

const tabs: Array<{ id: LiveEnvironmentTab; label: string }> = [
  { id: "present_state", label: "Present State" },
  { id: "navigation_evidence", label: "Navigation Evidence" },
  { id: "worker_lanes", label: "Worker Lanes" },
  { id: "line_checks", label: "Line Checks" },
  { id: "interpreted_log", label: "Interpreted Log" },
  { id: "clarification", label: "Clarification Queue" },
  { id: "live_cognition", label: "Live Cognition" },
  { id: "overview", label: "Overview" },
  { id: "sources", label: "Sources" },
  { id: "line_schema", label: "Line Schema" },
  { id: "deltas", label: "Deltas" },
  { id: "windows", label: "Windows" },
  { id: "commentary", label: "Commentary" },
  { id: "reviews", label: "Reviews" },
  { id: "debug", label: "Debug" },
];

const commentaryCadences: LiveCommentaryCadence[] = [
  "off",
  "milestones_only",
  "anomalies_and_milestones",
  "windowed_companion",
  "active_dialogue",
  "continuous_debug",
];

const postJson = async (path: string, body?: Record<string, unknown>) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${path} failed with ${response.status}`);
  }
  return response.json().catch(() => null);
};

const formatTime = (value?: string | null): string => {
  if (!value) return "never";
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toLocaleTimeString() : value;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

const readTraceString = (record: Record<string, unknown>, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return fallback;
};

const compactLabel = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "unknown";

const liveAnswerDispatchLabel = (action: WorkstationDispatchActionV1): string => {
  if (action.kind === "wake_agent") {
    const interruptKind = "interruptKind" in action && action.interruptKind ? `:${action.interruptKind}` : "";
    return `wake interrupt${interruptKind}`;
  }
  if (action.kind === "speak_narrator") return `narrator ${action.mode}`;
  if (action.kind === "bind_narrator_stream") return `narrator bind ${compactLabel(action.streamKind)}`;
  if (action.kind === "update_live_answer") return `live answer ${action.lineKey}`;
  if (action.kind === "change_preset") return `preset ${action.presetId}`;
  if (action.kind === "bind_source") return "bind source";
  if (action.kind === "unbind_source") return "unbind source";
  if (action.kind === "set_loop_state") return `loop ${action.state}`;
  if (action.kind === "focus_process_graph") return "focus graph";
  if (action.kind === "append_goal_context") return "append context";
  if (action.kind === "log_receipt") return "log receipt";
  if (action.kind === "update_panel") return `panel ${action.panelId}`;
  if (action.kind === "repair_loop") return "repair loop";
  if (action.kind === "repair_source") return "repair source";
  if (action.kind === "ask_user") return "ask user";
  return compactLabel(action.kind);
};

const isLiveAnswerWorkstationControlDispatch = (action: WorkstationDispatchActionV1): boolean =>
  action.kind === "change_preset" ||
  action.kind === "bind_source" ||
  action.kind === "unbind_source" ||
  action.kind === "set_loop_state" ||
  action.kind === "repair_loop" ||
  action.kind === "repair_source" ||
  action.kind === "update_live_answer" ||
  action.kind === "focus_process_graph" ||
  action.kind === "speak_narrator" ||
  action.kind === "bind_narrator_stream";

const liveAnswerPacketColorKey = (update: WorkstationGoalContextUpdateV1): string => {
  const refs = [
    update.contentRef,
    ...update.evidenceRefs,
    ...update.receiptRefs,
    ...update.loopRefs,
    ...update.sourceRefs,
  ];
  return refs.find((ref) => ref.includes("stage_play_processed_mail_packet:")) ??
    refs.find((ref) => ref.includes("processed_mail_packet")) ??
    refs.find((ref) => ref.includes("microdeck_output:")) ??
    refs.find((ref) => ref.includes("microdeck")) ??
    update.contentRef ??
    update.updateId;
};

const liveAnswerTraceMemoryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
  if (update.producerKind === "trace_memory") return true;
  if (update.producerKind === "reflection" || update.updateKind === "reflection") return true;
  const refs = [
    update.contentRef,
    ...update.evidenceRefs,
    ...update.receiptRefs,
    ...update.loopRefs,
    ...update.sourceRefs,
  ];
  return refs.some((ref) => ref.includes("trace_memory") || ref.includes("trace-memory"));
};

const liveAnswerVisualSummaryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
  if (update.producerKind === "visual_capture" || update.updateKind === "visual_observation") return true;
  const refs = [
    update.contentRef,
    ...update.evidenceRefs,
    ...update.receiptRefs,
    ...update.loopRefs,
    ...update.sourceRefs,
  ];
  return refs.some((ref) =>
    ref.includes("visual_summary") ||
    ref.includes("visual_summaries") ||
    ref.includes("visual_frame") ||
    ref.includes("visual_capture") ||
    ref.includes("screen_summary")
  );
};

const liveAnswerPacketTraceUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
  return Boolean(update.updateId && update.contentRef);
};

const liveAnswerFeedQueryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
  const refs = [update.contentRef, ...update.evidenceRefs, ...update.receiptRefs, ...update.loopRefs];
  return refs.some((ref) =>
    ref.includes("stage_play_context_feed_query:") ||
    ref.includes("workstation_context_feed:")
  );
};

const liveAnswerPolicyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
  Array.from(new Set([...update.evidenceRefs, ...update.loopRefs].filter((ref) =>
    ref.startsWith("context_feed:") ||
    ref.startsWith("agent_goal_context_feed:") ||
    ref.startsWith("agent_goal_allowed_actuator:") ||
    ref.startsWith("allowed_actuator:") ||
    ref.startsWith("workstation_context_feed:") ||
    ref.startsWith("workstation_actuator:")
  )));

const liveAnswerContextFeedPolicyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
  liveAnswerPolicyRefsForUpdate(update).filter((ref) =>
    ref.startsWith("context_feed:") ||
    ref.startsWith("agent_goal_context_feed:") ||
    ref.startsWith("workstation_context_feed:")
  );

const liveAnswerActuatorPolicyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
  liveAnswerPolicyRefsForUpdate(update).filter((ref) =>
    ref.startsWith("allowed_actuator:") ||
    ref.startsWith("agent_goal_allowed_actuator:") ||
    ref.startsWith("workstation_actuator:")
  );

const liveAnswerFreshnessFilterRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
  Array.from(new Set(update.evidenceRefs.filter((ref) => ref.startsWith("freshness_filter:"))));

const liveAnswerMicroDeckRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
  Array.from(new Set([
    update.contentRef,
    ...update.sourceRefs,
    ...update.loopRefs,
    ...update.evidenceRefs,
    ...update.receiptRefs,
  ].filter((ref) =>
    /^microdeck:|^microdeck[-_]|^micro_reasoner:|^stage_play_micro_reasoner_|^workstation_context_feed:microdeck_outputs|^workstation_actuator:query_microdeck_outputs|prompt_preset/i.test(ref)
  )));

const countLiveAnswerMicroDeckRefs = (refs: string[], patterns: RegExp[]): number =>
  refs.filter((ref) => patterns.some((pattern) => pattern.test(ref))).length;

const liveAnswerPacketCircuitRefsForUpdate = (update: WorkstationGoalContextUpdateV1): LiveAnswerPacketCircuitRef[] => {
  const refs = Array.from(new Set([
    update.updateId,
    update.contentRef,
    ...update.sourceRefs,
    ...update.loopRefs,
    ...update.evidenceRefs,
    ...update.receiptRefs,
  ].filter(Boolean)));
  return [{
    updateId: update.updateId,
    contentRef: update.contentRef,
    packetRefs: refs.filter((ref) =>
      ref.startsWith("stage_play_processed_mail_packet:") ||
      ref.startsWith("stage_play_live_source_mail:") ||
      ref.startsWith("stage_play_packet_trace:") ||
      ref.includes("packet:")
    ),
    microDeckRefs: refs.filter((ref) =>
      ref.startsWith("stage_play_micro_reasoner_run:") ||
      ref.startsWith("microdeck:") ||
      ref.startsWith("microdeck-output:") ||
      ref.startsWith("microdeck-run:") ||
      ref.includes("micro_reasoner")
    ),
    transcriptRefs: refs.filter((ref) =>
      ref.startsWith("audio_transcript:") ||
      ref.startsWith("transcript_window:") ||
      ref.startsWith("translated_transcript") ||
      ref.startsWith("translation_segment:") ||
      ref.startsWith("workstation_context_feed:audio_transcripts") ||
      ref.startsWith("workstation_context_feed:translated_transcripts") ||
      ref.startsWith("workstation_actuator:query_audio_transcripts") ||
      ref.startsWith("workstation_actuator:query_translation_segments")
    ),
    projectionRefs: refs.filter((ref) =>
      ref.startsWith("live_answer") ||
      ref.startsWith("live-answer") ||
      ref.startsWith("workstation_context_feed:live_answer_lines") ||
      ref.startsWith("workstation_actuator:query_live_answer_state") ||
      ref.startsWith("workstation_actuator:update_live_answer")
    ),
    sourceHealthRefs: refs.filter((ref) =>
      ref.startsWith("source_health:") ||
      ref.startsWith("source_health_status:") ||
      ref.startsWith("source_health_watch:") ||
      ref.startsWith("source-health:") ||
      ref.startsWith("stage_play_source_health:") ||
      ref.startsWith("source_status:") ||
      ref.startsWith("workstation_context_feed:source_health") ||
      ref.startsWith("workstation_actuator:query_source_health") ||
      ref.startsWith("workstation_actuator:repair_source")
    ),
    actuatorRefs: refs.filter((ref) =>
      ref.startsWith("workstation_actuator:")
    ),
    traceMemoryRefs: refs.filter((ref) =>
      ref.startsWith("trace_memory:") ||
      ref.startsWith("trace-memory:") ||
      ref.startsWith("workstation_trace_memory:") ||
      ref.startsWith("workstation_context_feed:trace_memory") ||
      ref.includes("trace_memory") ||
      ref.includes("trace-memory")
    ),
    narratorRefs: refs.filter((ref) =>
      ref.startsWith("helix_narrator_") ||
      ref.startsWith("narrator:") ||
      ref.startsWith("workstation_context_feed:narrator_events") ||
      ref.startsWith("workstation_actuator:narrator_")
    ),
    routeWatchRefs: refs.filter((ref) =>
      ref.startsWith("route_watch:") ||
      ref.startsWith("watch_job:") ||
      ref.startsWith("watch_policy:") ||
      ref.startsWith("stage_play_live_source_watch_job:") ||
      ref.startsWith("live_job_evidence:") ||
      ref.startsWith("situation_construct_query:") ||
      ref.startsWith("workstation_context_feed:route_evidence") ||
      ref.startsWith("workstation_actuator:query_route_evidence")
    ),
    automationRefs: refs.filter((ref) =>
      ref.startsWith("automation:") ||
      ref.startsWith("automation_policy:") ||
      ref.startsWith("workstation_context_feed:automation_policies") ||
      ref.startsWith("stage_play_live_source_watch_job_policy:") ||
      ref.startsWith("workstation_actuator:configure_route_watch")
    ),
    sourceRefs: update.sourceRefs,
    loopRefs: update.loopRefs,
    receiptRefs: update.receiptRefs,
    freshnessStatus: update.freshness.status,
    assistantAnswer: update.authority.assistantAnswer,
    terminalEligible: update.authority.terminalEligible,
    rawContentIncluded: update.authority.rawContentIncluded,
  }];
};

const liveAnswerAutomationUpdate = (update: WorkstationGoalContextUpdateV1): boolean =>
  update.producerKind === "automation" || update.updateKind === "automation_status";

const liveAnswerRouteEvidenceUpdate = (update: WorkstationGoalContextUpdateV1): boolean =>
  update.producerKind === "route_watch" ||
  update.updateKind === "route_evidence" ||
  liveAnswerPacketCircuitRefsForUpdate(update).some((ref) => ref.routeWatchRefs.length > 0);

const liveAnswerAutomationPolicyUpdate = (update: WorkstationGoalContextUpdateV1): boolean =>
  liveAnswerAutomationUpdate(update) ||
  liveAnswerPacketCircuitRefsForUpdate(update).some((ref) => ref.automationRefs.length > 0);

const documentMarkdownSourceIdFromLocation = (threadId: string): string => {
  if (typeof window === "undefined") return `document_markdown:${threadId}`;
  const params = new URLSearchParams(window.location.search);
  const docPath = params.get("doc")?.trim();
  return docPath ? `document_markdown:${docPath}` : `document_markdown:${threadId}`;
};

const readEarbudRunText = (run: StagePlayMicroReasonerRunV1): string => {
  const fallback = run.outputPreview?.trim() ?? "";
  try {
    const parsed = readRecord(JSON.parse(fallback));
    const preferred = [
      parsed?.translatedText,
      parsed?.explanation,
      parsed?.summary,
      parsed?.speakerIntent,
    ].find((entry) => typeof entry === "string" && entry.trim().length > 0);
    if (typeof preferred === "string") return preferred.trim();
  } catch {
    // Prompted MicroDeck previews can be clipped by the overview API.
  }
  return fallback;
};

const readDocumentTranslationRunText = (run: StagePlayMicroReasonerRunV1): string => {
  const fallback = run.outputPreview?.trim() ?? "";
  try {
    const parsed = readRecord(JSON.parse(fallback));
    const translations = Array.isArray(parsed?.translations) ? parsed.translations : [];
    const lines = translations
      .map((entry: unknown) => {
        const record = readRecord(entry);
        const unitId = typeof record?.unit_id === "string" ? record.unit_id : null;
        const text = typeof record?.translated_markdown === "string" ? record.translated_markdown.trim() : "";
        return unitId && text ? `${unitId}: ${text}` : text;
      })
      .filter((entry): entry is string => entry.trim().length > 0);
    if (lines.length) return lines.join("\n");
    const unitErrors = Array.isArray(parsed?.unit_errors)
      ? parsed.unit_errors
      : Array.isArray(parsed?.unitErrors)
        ? parsed.unitErrors
        : [];
    const errorLines = unitErrors
      .map((entry: unknown) => {
        const record = readRecord(entry);
        const unitId = typeof record?.unit_id === "string" ? record.unit_id : null;
        const reason = typeof record?.reason === "string" ? record.reason.trim() : "translation unavailable";
        return unitId ? `${unitId}: ${reason}` : reason;
      })
      .filter((entry): entry is string => entry.trim().length > 0);
    if (errorLines.length) return errorLines.join("\n");
  } catch {
    // Prompted MicroDeck previews can be clipped by the overview API.
  }
  return fallback || run.error || "document_microdeck_output_unavailable";
};

const isDocumentTranslationProductRun = (run: StagePlayMicroReasonerRunV1): boolean =>
  run.role === "packet_composer" &&
  run.deckProductRole === true &&
  run.deckExecutionMode !== "baseline_fallback";

const pruneAudioTranscriptHistory = (items: AudioTranscriptHistoryItem[]): AudioTranscriptHistoryItem[] => {
  const deduped = new Map<string, AudioTranscriptHistoryItem>();
  const eventToPrimaryKey = new Map<string, string>();
  for (const item of items) {
    const primaryKey = item.chunk_id ?? item.event_id ?? item.history_id;
    if (item.event_id) {
      const existingPrimaryKey = eventToPrimaryKey.get(item.event_id);
      if (existingPrimaryKey && existingPrimaryKey !== primaryKey) {
        const existing = deduped.get(existingPrimaryKey);
        if (item.chunk_id || !existing?.chunk_id) {
          deduped.delete(existingPrimaryKey);
        } else {
          continue;
        }
      }
      eventToPrimaryKey.set(item.event_id, primaryKey);
    }
    const sameTranscriptKey = `${item.source_id}:${item.captured_at}:${item.transcript.trim().toLowerCase()}`;
    const duplicate = Array.from(deduped.entries()).find(([, current]) =>
      `${current.source_id}:${current.captured_at}:${current.transcript.trim().toLowerCase()}` === sameTranscriptKey);
    if (duplicate && (item.chunk_id || !duplicate[1].chunk_id)) {
      deduped.delete(duplicate[0]);
    } else if (duplicate) {
      continue;
    }
    deduped.set(primaryKey, item);
  }
  return Array.from(deduped.values())
    .sort((left, right) => Date.parse(left.captured_at) - Date.parse(right.captured_at))
    .slice(-AUDIO_TRANSCRIPT_HISTORY_LIMIT);
};

const defaultWorldEventEndpoint = (): string => {
  if (typeof window === "undefined") return "/api/agi/situation/world-event";
  return `${window.location.origin}/api/agi/situation/world-event`;
};

const signalAgeMs = (source?: WorldEventSourceSeen | null): number | null => {
  if (!source?.latest_ts) return null;
  const parsed = Date.parse(source.latest_ts);
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
};

const isMinecraftWorldSource = (source: WorldEventSourceSeen): boolean =>
  /\bminecraft|minehut|world_event/i.test([source.room_id, source.source_id, source.world_id, source.latest_event_type].join(" "));

const modalityLabel = (modality: HelixSituationSourceModality): string => {
  if (modality === "world_event") return "World events";
  if (modality === "visual_frame") return "Visual";
  if (modality === "audio_transcript") return "Audio transcript";
  if (modality === "voice_identity") return "Voice identity";
  if (modality === "text_chat") return "Text chat";
  if (modality === "calculator_stream") return "Calculator";
  if (modality === "simulation_stream") return "Simulation";
  if (modality === "environment_state") return "Environment state";
  if (modality === "environment_affordance") return "Affordances";
  if (modality === "procedure_graph") return "Procedure graph";
  if (modality === "document_context") return "Documents";
  return "Notes";
};

const sourceStatusClass = (status: HelixSituationSourceStatus): string => {
  if (status === "active") return "border-emerald-300/30 text-emerald-100";
  if (status === "permission_required" || status === "stale" || status === "paused") return "border-amber-300/30 text-amber-100";
  if (status === "error" || status === "configured_missing") return "border-rose-300/30 text-rose-100";
  return "border-white/10 text-slate-400";
};

const sourceCoverageSummary = (coverage?: HelixLiveCardLineSourceCoverage): string[] => {
  if (!coverage) return [];
  const entries: string[] = [];
  if (coverage.world_event !== "not_applicable") entries.push(`world ${coverage.world_event}`);
  if (coverage.visual_frame !== "not_applicable") entries.push(`visual ${coverage.visual_frame}`);
  if (coverage.audio_transcript !== "not_applicable") entries.push(`transcript ${coverage.audio_transcript}`);
  if (coverage.text_chat !== "not_applicable") entries.push(`chat ${coverage.text_chat}`);
  return entries;
};

const visualShadeSubjectCategory = (profile: StagePlayVisualObserverProfileV1): string => {
  if (profile.subjectCategory?.trim()) return profile.subjectCategory.trim();
  if (profile.domain === "science") return "Science";
  if (profile.domain === "minecraft_gameplay") return "Gaming";
  if (profile.domain === "browser_workflow" || profile.domain === "desktop_app") return "Workflows";
  if (profile.domain === "video_scene") return "Media";
  if (profile.domain === "document") return "Documents";
  return "General";
};

const visualShadeOptionLabel = (profile: StagePlayVisualObserverProfileV1): string =>
  profile.subject?.trim() && profile.subject.trim() !== profile.title
    ? `${profile.title} - ${profile.subject.trim()}`
    : profile.title;

const preferredVisualShadeProfileId = (profiles: StagePlayVisualObserverProfileV1[], activeProfile?: StagePlayVisualObserverProfileV1 | null): string => {
  if (activeProfile && profiles.some((profile) => profile.profileId === activeProfile.profileId)) return activeProfile.profileId;
  return profiles.find((profile) => profile.profileId === "stage_play_visual_observer_profile:solar-sdo-aia-193:v1")?.profileId ??
    profiles.find((profile) => profile.profileId === "stage_play_visual_observer_profile:generic:v1")?.profileId ??
    profiles[0]?.profileId ??
    "";
};

const microReasonerPresetCategory = (preset: StagePlayMicroReasonerPromptPresetV1): string => {
  if (preset.domain === "audio_translation" || preset.outputPolicy === "earbud_translation") return "Earbuds";
  if (preset.domain === "document_translation" || preset.outputPolicy === "inline_document_translation") return "Documents";
  if (preset.domain === "minecraft_gameplay") return "Gaming";
  if (preset.domain === "calculator_stream") return "Tools";
  if (preset.domain === "science_visual") return "Science";
  if (preset.domain === "browser_workflow") return "Workflows";
  if (preset.domain === "custom") return "Custom";
  return "General";
};

const microReasonerPresetOptionLabel = (
  preset: StagePlayMicroReasonerPromptPresetV1,
  sourceId?: string | null,
): string =>
  `${preset.title}${sourceId && preset.sourceIds.includes(sourceId) ? " (applied)" : ""}`;

const liveAnswerMicroDeckPhaseLabel = (phase: LiveAnswerMicroDeckCatalogPhase): string =>
  phase === "capture_prompt" ? "capture prompt" : "mail reasoning";

const liveAnswerMicroDeckSourceLabel = (sourceKind: StagePlayLiveSourceMailSourceKindV1): string => {
  if (sourceKind === "visual_frame") return "visual_frame";
  if (sourceKind === "audio_transcript") return "audio_transcript";
  if (sourceKind === "document_markdown") return "document_markdown";
  return sourceKind;
};

const liveAnswerMicroDeckColorKey = (input: {
  sourceKind: StagePlayLiveSourceMailSourceKindV1;
  sourceId?: string | null;
  deckId: string;
}): string => workstationMicroDeckColorKey(input);

const liveAnswerMicroDeckSwatch = (colorKey: string): { backgroundColor: string; borderColor: string } => {
  return workstationCircuitSwatch(colorKey, "microdeck");
};

const sortLiveAnswerMicroDeckCatalogItems = (
  items: LiveAnswerMicroDeckCatalogItem[],
): LiveAnswerMicroDeckCatalogItem[] =>
  [...items].sort((left: LiveAnswerMicroDeckCatalogItem, right: LiveAnswerMicroDeckCatalogItem) => {
    if (left.applied !== right.applied) return left.applied ? -1 : 1;
    return left.title.localeCompare(right.title);
  });

const preferredMicroReasonerPresetId = (
  presets: StagePlayMicroReasonerPromptPresetV1[],
  activePreset?: StagePlayMicroReasonerPromptPresetV1 | null,
): string => {
  if (activePreset && presets.some((preset) => preset.presetId === activePreset.presetId)) return activePreset.presetId;
  return presets.find((preset) => preset.presetId === "stage_play_micro_reasoner_prompt_preset:minecraft-gameplay:v1")?.presetId ??
    presets.find((preset) => preset.presetId === "stage_play_micro_reasoner_prompt_preset:generic-live-source:v1")?.presetId ??
    presets[0]?.presetId ??
    "";
};

const visualShadeCustomSlot = (profile: StagePlayVisualObserverProfileV1): number | null => {
  if (visualShadeSubjectCategory(profile) !== "Custom") return null;
  const match = `${profile.title} ${profile.subject ?? ""}`.match(/\bCustom\s+(\d+)\b/i);
  if (!match) return null;
  const slot = Number(match[1]);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
};

const nextVisualShadeCustomSlot = (profiles: StagePlayVisualObserverProfileV1[]): number => {
  const slots = profiles
    .map(visualShadeCustomSlot)
    .filter((slot): slot is number => typeof slot === "number");
  return slots.length > 0 ? Math.max(...slots) + 1 : 1;
};

const buildSessionVisualObserverProfile = (input: {
  slot: number;
  prompt: string;
  baseProfile?: StagePlayVisualObserverProfileV1 | null;
}): StagePlayVisualObserverProfileV1 => {
  const now = new Date().toISOString();
  const title = `Custom ${input.slot}`;
  return {
    artifactId: "stage_play_visual_observer_profile",
    schemaVersion: "stage_play_visual_observer_profile/v1",
    profileId: `stage_play_visual_observer_profile:session-custom-${input.slot}:${Date.now().toString(36)}`,
    title,
    domain: "custom",
    subjectCategory: "Custom",
    subject: title,
    sourceIds: [],
    prompt: input.prompt,
    outputMode: input.baseProfile?.outputMode ?? "semi_structured_json",
    expectedSchema: input.baseProfile?.expectedSchema ?? null,
    cadenceHintMs: input.baseProfile?.cadenceHintMs ?? null,
    status: "active",
    linkedInterpreterProfileId: null,
    linkedWatchJobPolicyId: null,
    linkedNoteId: null,
    promptHash: `session-${now}`,
    createdAt: now,
    updatedAt: now,
    assistant_answer: false,
    terminal_eligible: false,
    context_role: "tool_policy",
  };
};

const docEquationScopeLabel = (artifact: DocEquationContextArtifactV1): string => {
  if (artifact.commentaryHints.scope === "scalar_replay") return "Scalar replay";
  if (artifact.commentaryHints.scope === "runtime_artifact") return "Runtime artifact";
  return "Theory orientation";
};

const liveLineText = (lines: LiveAnswerLineState[], key: string): string =>
  String(lines.find((line: LiveAnswerLineState) => line.key === key)?.value ?? "").trim().toLowerCase();

const liveSourcePolicyBadges = (lines: LiveAnswerLineState[], sourceIds: string[]): Array<{ label: string; value: string }> => {
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeSourceIds = Array.isArray(sourceIds) ? sourceIds : [];
  const sourceKinds = new Set<string>();
  if (safeLines.some((line: LiveAnswerLineState) => ["situation", "actor_state", "resources", "affordances"].includes(line.key))) {
    sourceKinds.add("environment_state");
  }
  if (safeLines.some((line: LiveAnswerLineState) => ["possibilities", "rehearsal", "recommendation"].includes(line.key))) {
    sourceKinds.add("procedure_graph");
  }
  if (safeSourceIds.some((sourceId: string) => /visual|frame|screen/i.test(sourceId))) sourceKinds.add("visual_frame");
  if (safeSourceIds.some((sourceId: string) => /audio|voice|transcript/i.test(sourceId))) sourceKinds.add("audio");
  if (safeSourceIds.some((sourceId: string) => /simulation|sim/i.test(sourceId))) sourceKinds.add("simulation");
  const possibility = liveLineText(safeLines, "possibilities");
  const rehearsal = liveLineText(safeLines, "rehearsal");
  const recommendation = liveLineText(safeLines, "recommendation");
  return [
    { label: "Source", value: Array.from(sourceKinds).join(" / ") || "none" },
    { label: "Possibility", value: /stale/.test(possibility) ? "stale" : /candidate|possible|retrieve|visible affordance/.test(possibility) ? "candidate exists" : "none" },
    { label: "Rehearsal", value: /blocked/.test(rehearsal) ? "blocked" : /partial|caveat/.test(rehearsal) ? "partial" : /risky/.test(rehearsal) ? "risky" : /passed|feasible/.test(rehearsal) ? "feasible" : "not run" },
    { label: "Recommendation", value: /confirmation/.test(recommendation) ? "needs confirmation" : /caveat|recheck/.test(recommendation) ? "suggested with caveat" : recommendation ? "safe to suggest" : "hidden" },
  ];
};

export function LiveAnswerEnvironmentPanel({ threadId = "helix-ask:desktop" }: { threadId?: string }) {
  const [activeTab, setActiveTab] = useState<LiveEnvironmentTab>("present_state");
  const [sources, setSources] = useState<WorkstationLiveSource[]>([]);
  const [events, setEvents] = useState<WorkstationLiveSourceEvent[]>([]);
  const [windows, setWindows] = useState<LiveSourceWindowSummary[]>([]);
  const [commentarySession, setCommentarySession] = useState<LiveCommentarySession | null>(null);
  const [commentaryCandidates, setCommentaryCandidates] = useState<LiveCommentaryCandidate[]>([]);
  const [commentaryProposals, setCommentaryProposals] = useState<LiveCommentaryProposal[]>([]);
  const [commentaryDeliveries, setCommentaryDeliveries] = useState<LiveCommentaryDeliveryReceipt[]>([]);
  const [reviewRequests, setReviewRequests] = useState<LiveAgenticReviewReadEntry[]>([]);
  const [reviewResults, setReviewResults] = useState<LiveAgenticReviewReadEntry[]>([]);
  const [presentStateCard, setPresentStateCard] = useState<HelixPresentStateCard | null>(null);
  const [interpretedEvents, setInterpretedEvents] = useState<HelixInterpretedEvent[]>([]);
  const [clarificationNeeds, setClarificationNeeds] = useState<HelixClarificationNeed[]>([]);
  const [clarificationProposals, setClarificationProposals] = useState<HelixClarificationQuestionProposal[]>([]);
  const [steeringEvidence, setSteeringEvidence] = useState<HelixUserSteeringEvidence[]>([]);
  const [lineToolRequests, setLineToolRequests] = useState<HelixLiveLineToolRequest[]>([]);
  const [lineToolEvaluations, setLineToolEvaluations] = useState<HelixLiveLineToolEvaluation[]>([]);
  const [workerLanes, setWorkerLanes] = useState<HelixLiveWorkerLane[]>([]);
  const [workerRuns, setWorkerRuns] = useState<HelixLiveWorkerRun[]>([]);
  const [clientActions, setClientActions] = useState<ClientCapabilityActionRead[]>([]);
  const [clientAdoptions, setClientAdoptions] = useState<ClientCapabilityAdoptionRead[]>([]);
  const [cognitionObservations, setCognitionObservations] = useState<LiveCognitionObservationRead[]>([]);
  const [cognitionInterpretations, setCognitionInterpretations] = useState<LiveCognitionInterpretationRead[]>([]);
  const [cognitionGoals, setCognitionGoals] = useState<LiveCognitionGoalRead[]>([]);
  const [cognitionHandoffs, setCognitionHandoffs] = useState<LiveCognitionHandoffRead[]>([]);
  const [situationRuns, setSituationRuns] = useState<LiveSituationRunRead[]>([]);
  const [fieldWorkers, setFieldWorkers] = useState<LiveFieldWorkerRead[]>([]);
  const [fieldWorkerRuns, setFieldWorkerRuns] = useState<LiveFieldWorkerRunRead[]>([]);
  const [fieldEvaluations, setFieldEvaluations] = useState<LiveFieldEvaluationRead[]>([]);
  const [tangentEvaluations, setTangentEvaluations] = useState<LiveTangentEvaluationRead[]>([]);
  const [arbitrationCandidates, setArbitrationCandidates] = useState<LiveArbitrationCandidateRead[]>([]);
  const [planContracts, setPlanContracts] = useState<LivePlanContractRead[]>([]);
  const [acceptanceRuns, setAcceptanceRuns] = useState<LiveSituationRunAcceptanceRead[]>([]);
  const [situationPredictions, setSituationPredictions] = useState<LiveSituationPredictionRead[]>([]);
  const [observationProbes, setObservationProbes] = useState<LiveObservationProbeRead[]>([]);
  const [probeResults, setProbeResults] = useState<LiveProbeResultRead[]>([]);
  const [confidenceUpdates, setConfidenceUpdates] = useState<LiveConfidenceUpdateRead[]>([]);
  const [procedureEpochs, setProcedureEpochs] = useState<LiveProcedureEpochRead[]>([]);
  const [procedureEpochClosures, setProcedureEpochClosures] = useState<LiveProcedureEpochClosureRead[]>([]);
  const [procedureLedgerItems, setProcedureLedgerItems] = useState<LiveProcedureLedgerItemRead[]>([]);
  const [sourceBindingTransitions, setSourceBindingTransitions] = useState<SourceBindingTransitionRead[]>([]);
  const [handoffConsumptions, setHandoffConsumptions] = useState<LiveAskHandoffConsumptionRead[]>([]);
  const [planExecutions, setPlanExecutions] = useState<LivePlanContractExecutionRead[]>([]);
  const [visualLatest, setVisualLatest] = useState<VisualLatestRead | null>(null);
  const [visualObserverProfiles, setVisualObserverProfiles] = useState<StagePlayVisualObserverProfileV1[]>([]);
  const [sessionVisualObserverProfiles, setSessionVisualObserverProfiles] = useState<StagePlayVisualObserverProfileV1[]>([]);
  const [activeVisualObserverProfile, setActiveVisualObserverProfile] = useState<StagePlayVisualObserverProfileV1 | null>(null);
  const [selectedVisualObserverProfileId, setSelectedVisualObserverProfileId] = useState<string>("");
  const [microReasonerPromptPresets, setMicroReasonerPromptPresets] = useState<StagePlayMicroReasonerPromptPresetV1[]>([]);
  const [activeMicroReasonerPromptPreset, setActiveMicroReasonerPromptPreset] = useState<StagePlayMicroReasonerPromptPresetV1 | null>(null);
  const [microReasonerPrompts, setMicroReasonerPrompts] = useState<StagePlayMicroReasonerPromptV1[]>([]);
  const [selectedMicroReasonerPromptPresetId, setSelectedMicroReasonerPromptPresetId] = useState<string>("");
  const [adaptiveVisualLensProposal, setAdaptiveVisualLensProposal] = useState<StagePlayAdaptiveVisualLensProposalV1 | null>(null);
  const [adaptiveVisualLensRunning, setAdaptiveVisualLensRunning] = useState(false);
  const [adaptiveVisualLensError, setAdaptiveVisualLensError] = useState<string | null>(null);
  const [earbudMicroReasonerPromptPresets, setEarbudMicroReasonerPromptPresets] = useState<StagePlayMicroReasonerPromptPresetV1[]>([]);
  const [activeEarbudMicroReasonerPromptPreset, setActiveEarbudMicroReasonerPromptPreset] = useState<StagePlayMicroReasonerPromptPresetV1 | null>(null);
  const [earbudMicroReasonerPrompts, setEarbudMicroReasonerPrompts] = useState<StagePlayMicroReasonerPromptV1[]>([]);
  const [selectedEarbudMicroReasonerPromptPresetId, setSelectedEarbudMicroReasonerPromptPresetId] = useState<string>("");
  const [earbudMicroReasonerRuns, setEarbudMicroReasonerRuns] = useState<StagePlayMicroReasonerRunV1[]>([]);
  const [documentMicroReasonerPromptPresets, setDocumentMicroReasonerPromptPresets] = useState<StagePlayMicroReasonerPromptPresetV1[]>([]);
  const [activeDocumentMicroReasonerPromptPreset, setActiveDocumentMicroReasonerPromptPreset] = useState<StagePlayMicroReasonerPromptPresetV1 | null>(null);
  const [documentMicroReasonerPrompts, setDocumentMicroReasonerPrompts] = useState<StagePlayMicroReasonerPromptV1[]>([]);
  const [selectedDocumentMicroReasonerPromptPresetId, setSelectedDocumentMicroReasonerPromptPresetId] = useState<string>("");
  const [documentMicroReasonerRuns, setDocumentMicroReasonerRuns] = useState<StagePlayMicroReasonerRunV1[]>([]);
  const [documentSourceMailItems, setDocumentSourceMailItems] = useState<Array<Record<string, unknown>>>([]);
  const [documentSourceWakeRequests, setDocumentSourceWakeRequests] = useState<Array<Record<string, unknown>>>([]);
  const [documentSourceWakeResults, setDocumentSourceWakeResults] = useState<Array<Record<string, unknown>>>([]);
  const [documentSourceProcessedPackets, setDocumentSourceProcessedPackets] = useState<Array<Record<string, unknown>>>([]);
  const [goalContextUpdates, setGoalContextUpdates] = useState<WorkstationGoalContextUpdateV1[]>([]);
  const [agentGoalSessions, setAgentGoalSessions] = useState<AgentGoalSessionV1[]>([]);
  const [visualShadePromptDraft, setVisualShadePromptDraft] = useState<string>("");
  const [visualShadePromptBaseProfileId, setVisualShadePromptBaseProfileId] = useState<string>("");
  const [selectedVisualFrameHistoryId, setSelectedVisualFrameHistoryId] = useState<string | null>(null);
  const [visualFrameReplayRunning, setVisualFrameReplayRunning] = useState(false);
  const [visualFrameReplayResult, setVisualFrameReplayResult] = useState<VisualFrameReplayResult | null>(null);
  const [visualCaptureRoutes, setVisualCaptureRoutes] = useState<VisualCaptureRoute[]>(() => readStoredVisualCaptureRoutes());
  const [audioTranscriptHistory, setAudioTranscriptHistory] = useState<AudioTranscriptHistoryItem[]>([]);
  const [selectedAudioTranscriptHistoryId, setSelectedAudioTranscriptHistoryId] = useState<string | null>(null);
  const [audioTranscriptSourceId, setAudioTranscriptSourceId] = useState<string | null>(null);
  const [audioTranscriptChunkMs, setAudioTranscriptChunkMs] = useState<number>(AUDIO_TRANSCRIPT_DEFAULT_CHUNK_MS);
  const [audioTranscriptStatus, setAudioTranscriptStatus] = useState<AudioTranscriptCaptureStatus>("idle");
  const [audioTranscriptStatusDetail, setAudioTranscriptStatusDetail] = useState<string>("Audio transcript is not running.");
  const visualReplayJobsInFlightRef = React.useRef<Set<string>>(new Set());
  const audioTranscriptSessionRef = React.useRef<DisplayAudioSituationSession | null>(null);
  const audioTranscriptSourceIdRef = React.useRef<string | null>(null);
  const setImageLensLiveSource = useImageLensLiveSourceStore((state) => state.setLiveSource);
  const clearImageLensLiveSource = useImageLensLiveSourceStore((state) => state.clearLiveSource);
  const imageLensLiveSource = useImageLensLiveSourceStore((state) => state.liveSource);
  const [sourceSignal, setSourceSignal] = useState<SourceSignalCheck>({
    status: "unchecked",
    summary: "No source signal has been checked in this panel.",
    source: null,
  });
  const [sourceEndpoint, setSourceEndpoint] = useState<string>(() => {
    if (typeof window === "undefined") return defaultWorldEventEndpoint();
    return window.localStorage.getItem("helix.worldEventSourceEndpoint") ?? defaultWorldEventEndpoint();
  });
  const [sourceLabel, setSourceLabel] = useState<string>(() => {
    if (typeof window === "undefined") return "World-event source";
    return window.localStorage.getItem("helix.worldEventSourceLabel") ?? "World-event source";
  });
  const [selectedRehearsalSpaceId, setSelectedRehearsalSpaceId] = useState<HelixRehearsalSpaceId | null>(null);
  const [sourceAvailabilities, setSourceAvailabilities] = useState<HelixRehearsalSpaceAvailabilityInput[]>([]);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);
  const environment = useLiveAnswerEnvironmentStore((state: LiveAnswerEnvironmentState) =>
    selectActiveLiveAnswerEnvironment(state, threadId),
  );
  const deltas = useLiveAnswerEnvironmentStore((state: LiveAnswerEnvironmentState) =>
    selectLiveAnswerEnvironmentDeltas(state, environment?.environment_id),
  );
  const diagnostics = useLiveAnswerEnvironmentStore(
    (state: LiveAnswerEnvironmentState) => state.diagnosticsByThread[threadId] ?? null,
  );
  const latestReadResponse = useLiveAnswerEnvironmentStore(
    (state: LiveAnswerEnvironmentState) => state.latestReadByThread[threadId] ?? null,
  );
  const latestDocEquationContext = useDocEquationContextStore((state) => state.latestContext);
  const handleExplainLatestDocEquationContext = React.useCallback(() => {
    if (!latestDocEquationContext) return;
    launchHelixAskPrompt({
      question: buildDocEquationContextAskPrompt(latestDocEquationContext),
      blockId: latestDocEquationContext.equationId,
      panelId: "live-answer-environment",
      forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true,
    });
  }, [latestDocEquationContext]);
  const sourceDescriptors = Array.isArray(latestReadResponse?.source_descriptors)
    ? latestReadResponse.source_descriptors
    : [];
  const schemaSelection = latestReadResponse?.schema_selection && typeof latestReadResponse.schema_selection === "object"
    ? latestReadResponse.schema_selection
    : null;
  const schemaCompatibility = latestReadResponse?.schema_compatibility && typeof latestReadResponse.schema_compatibility === "object"
    ? latestReadResponse.schema_compatibility
    : null;
  const navigationRead = latestReadResponse?.navigation_state && typeof latestReadResponse.navigation_state === "object"
    ? latestReadResponse.navigation_state as Record<string, unknown>
    : null;
  const navigationState = navigationRead?.navigation_state && typeof navigationRead.navigation_state === "object"
    ? navigationRead.navigation_state as Record<string, unknown>
    : null;
  const navigationLatestDrift = navigationRead?.latest_drift && typeof navigationRead.latest_drift === "object"
    ? navigationRead.latest_drift as Record<string, unknown>
    : null;
  const navigationLatestRehearsal = navigationRead?.latest_rehearsal && typeof navigationRead.latest_rehearsal === "object"
    ? navigationRead.latest_rehearsal as Record<string, unknown>
    : null;
  const navigationSolverObservations = Array.isArray(navigationRead?.latest_solver_observations)
    ? navigationRead.latest_solver_observations as Array<Record<string, unknown>>
    : [];
  const loadEnvironment = useLiveAnswerEnvironmentStore((state: LiveAnswerEnvironmentState) => state.loadLiveAnswerEnvironment);
  const environmentSourceIds = useMemo(
    () => Array.isArray(environment?.source_ids) ? environment.source_ids : [],
    [environment?.environment_id, environment?.source_ids, environment?.updated_at],
  );
  const environmentLines = useMemo(
    () => Array.isArray(environment?.lines) ? environment.lines : [],
    [environment?.environment_id, environment?.lines, environment?.updated_at],
  );
  const sourceIds = useMemo(() => new Set(environmentSourceIds), [environmentSourceIds]);
  const relevantSources = useMemo(
    () => sources.filter((source: WorkstationLiveSource) => sourceIds.size === 0 || sourceIds.has(source.source_id) || source.environment_id === environment?.environment_id),
    [environment?.environment_id, sourceIds, sources],
  );
  const relevantEvents = useMemo(
    () => events.filter((event: WorkstationLiveSourceEvent) => sourceIds.size === 0 || sourceIds.has(event.source_id) || event.environment_id === environment?.environment_id),
    [environment?.environment_id, events, sourceIds],
  );
  const activeServerAudioTranscriptSource = useMemo(
    () => relevantSources.find((source: WorkstationLiveSource) =>
      source.kind === "browser_audio_transcript" && source.status === "active"
    ) ?? null,
    [relevantSources],
  );
  const relevantWindows = useMemo(
    () => windows.filter((window: LiveSourceWindowSummary) => sourceIds.size === 0 || sourceIds.has(window.source_id) || window.environment_id === environment?.environment_id),
    [environment?.environment_id, sourceIds, windows],
  );
  const serverAudioTranscriptHistory = useMemo<AudioTranscriptHistoryItem[]>(() => {
    return relevantEvents
      .filter((event: WorkstationLiveSourceEvent) => event.kind === "browser_audio_transcript" || event.event_type === "transcript_chunk")
      .map((event: WorkstationLiveSourceEvent): AudioTranscriptHistoryItem | null => {
        const payload = readRecord(event.payload);
        const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
        if (!transcript) return null;
        return {
          history_id: `audio_event:${event.event_id}`,
          source_id: event.source_id,
          event_id: event.event_id,
          chunk_id: null,
          analysis_job_id: null,
          transcript,
          compact_summary: transcript ? `Transcript chunk: ${transcript.slice(0, 160)}` : null,
          evidence_refs: event.evidence_refs ?? [],
          chunk_index: typeof event.tick_index === "number" ? event.tick_index : null,
          duration_ms: null,
          from_ts: null,
          to_ts: event.ts,
          captured_at: event.ts,
          source_label: "Live Source event",
        };
      })
      .filter((item): item is AudioTranscriptHistoryItem => Boolean(item))
      .slice(-AUDIO_TRANSCRIPT_HISTORY_LIMIT);
  }, [relevantEvents]);
  const mergedAudioTranscriptHistory = useMemo<AudioTranscriptHistoryItem[]>(
    () => pruneAudioTranscriptHistory([...serverAudioTranscriptHistory, ...audioTranscriptHistory]),
    [audioTranscriptHistory, serverAudioTranscriptHistory],
  );
  const activeAudioTranscriptSourceId =
    audioTranscriptSourceId ??
    audioTranscriptSourceIdRef.current ??
    serverAudioTranscriptHistory.at(-1)?.source_id ??
    activeServerAudioTranscriptSource?.source_id ??
    null;
  const activeDocumentMarkdownSourceId = documentMarkdownSourceIdFromLocation(threadId);
  const effectiveAudioTranscriptStatus =
    audioTranscriptStatus === "idle" && activeServerAudioTranscriptSource
      ? "listening"
      : audioTranscriptStatus;
  const effectiveAudioTranscriptStatusDetail =
    audioTranscriptStatus === "idle" && activeServerAudioTranscriptSource
      ? `Helix Ask shared audio source is registered; waiting for transcript chunks from ${activeServerAudioTranscriptSource.source_id}.`
      : audioTranscriptStatusDetail;
  const canStartSourceMonitor = sourceSignal.status === "live" && Boolean(sourceSignal.source);
  const liveCardLineStateByKey = useMemo(() => {
    const entries = presentStateCard?.line_states ?? [];
    return new Map(entries.map((entry: HelixLiveCardLineState) => [entry.line_key, entry]));
  }, [presentStateCard?.line_states]);
  const sourceHealthEntries = useMemo<HelixSituationSourceCapability[]>(() => {
    const capabilities = presentStateCard?.fidelity_profile?.capabilities ?? [];
    const bestByModality = new Map<HelixSituationSourceModality, HelixSituationSourceCapability>();
    const rank = (status: HelixSituationSourceStatus): number =>
      status === "active" ? 0 : status === "stale" ? 1 : status === "permission_required" ? 2 : status === "paused" ? 3 : 4;
    for (const capability of capabilities) {
      const current = bestByModality.get(capability.modality);
      if (!current || rank(capability.status) < rank(current.status)) {
        bestByModality.set(capability.modality, capability);
      }
    }
    return Array.from(bestByModality.values()).slice(0, 8);
  }, [presentStateCard?.fidelity_profile?.capabilities]);
  const environmentPolicyBadges = useMemo(
    () => environment ? liveSourcePolicyBadges(environmentLines, environmentSourceIds) : [],
    [environment, environmentLines, environmentSourceIds],
  );
  const rehearsalCatalog = useMemo(() => buildRehearsalSpaceCatalog({
    sourceIds: environmentSourceIds,
    modalities: sourceHealthEntries.map((entry: HelixSituationSourceCapability) => entry.modality),
    lineKeys: environmentLines.map((line: LiveAnswerLineState) => line.key),
    objective: environment?.objective ?? null,
    preset: environment?.preset ?? null,
    sourceAvailabilities,
  }), [environment?.objective, environment?.preset, environmentLines, environmentSourceIds, sourceAvailabilities, sourceHealthEntries]);
  useEffect(() => {
    let cancelled = false;
    const ids = environmentSourceIds.filter((sourceId: string) => sourceId.startsWith("source:"));
    if (ids.length === 0) {
      setSourceAvailabilities((current) => current.length > 0 ? [] : current);
      return () => {
        cancelled = true;
      };
    }
    Promise.all(ids.map((sourceId: string) =>
      fetch(`/api/agi/environment/sources/${encodeURIComponent(sourceId)}/status`)
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null)
    )).then((bodies) => {
      if (cancelled) return;
      setSourceAvailabilities(
        bodies
          .map((body) => body?.status)
          .filter((status): status is HelixRehearsalSpaceAvailabilityInput => Boolean(status?.source_id && status?.domain_adapter && status?.availability)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [environment?.updated_at, environmentSourceIds]);
  useEffect(() => {
    if (!selectedRehearsalSpaceId || !rehearsalCatalog.spaces.some((space: HelixRehearsalSpace) => space.space_id === selectedRehearsalSpaceId)) {
      setSelectedRehearsalSpaceId(rehearsalCatalog.selected_space_id);
    }
  }, [rehearsalCatalog.selected_space_id, rehearsalCatalog.spaces, selectedRehearsalSpaceId]);
  const selectedRehearsalSpace = rehearsalCatalog.spaces.find((space: HelixRehearsalSpace) => space.space_id === selectedRehearsalSpaceId) ??
    rehearsalCatalog.spaces.find((space: HelixRehearsalSpace) => space.space_id === rehearsalCatalog.selected_space_id) ??
    null;
  const visualSourceCapability = useMemo(
    () => sourceHealthEntries.find((entry: HelixSituationSourceCapability) => entry.modality === "visual_frame") ?? null,
    [sourceHealthEntries],
  );
  const visualEvidenceHealth = visualLatest?.visual_evidence_health ?? null;
  const visualShadeProfiles = useMemo(() => {
    const serverProfileIds = new Set(visualObserverProfiles.map((profile: StagePlayVisualObserverProfileV1) => profile.profileId));
    return [
      ...visualObserverProfiles,
      ...sessionVisualObserverProfiles.filter((profile: StagePlayVisualObserverProfileV1) => !serverProfileIds.has(profile.profileId)),
    ].filter((profile: StagePlayVisualObserverProfileV1) => profile.status === "active");
  }, [sessionVisualObserverProfiles, visualObserverProfiles]);
  const selectedVisualObserverProfile = useMemo(
    () => visualShadeProfiles.find((profile: StagePlayVisualObserverProfileV1) => profile.profileId === selectedVisualObserverProfileId) ??
      visualShadeProfiles.find((profile: StagePlayVisualObserverProfileV1) => profile.profileId === preferredVisualShadeProfileId(visualShadeProfiles, activeVisualObserverProfile)) ??
      null,
    [activeVisualObserverProfile, selectedVisualObserverProfileId, visualShadeProfiles],
  );
  const visualShadeGroups = useMemo(() => {
    const groups = new Map<string, StagePlayVisualObserverProfileV1[]>();
    for (const profile of visualShadeProfiles) {
      const category = visualShadeSubjectCategory(profile);
      groups.set(category, [...(groups.get(category) ?? []), profile]);
    }
    return Array.from(groups.entries())
      .map(([category, profiles]) => ({
        category,
        profiles: profiles.sort((left, right) => {
          const leftSlot = visualShadeCustomSlot(left);
          const rightSlot = visualShadeCustomSlot(right);
          if (leftSlot && rightSlot) return leftSlot - rightSlot;
          if (leftSlot) return -1;
          if (rightSlot) return 1;
          return left.title.localeCompare(right.title);
        }),
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }, [visualShadeProfiles]);
  const selectedMicroReasonerPromptPreset = useMemo(
    () => microReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedMicroReasonerPromptPresetId) ??
      microReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === preferredMicroReasonerPresetId(microReasonerPromptPresets, activeMicroReasonerPromptPreset)) ??
      null,
    [activeMicroReasonerPromptPreset, microReasonerPromptPresets, selectedMicroReasonerPromptPresetId],
  );
  const microReasonerPresetGroups = useMemo(() => {
    const groups = new Map<string, StagePlayMicroReasonerPromptPresetV1[]>();
    for (const preset of microReasonerPromptPresets) {
      const category = microReasonerPresetCategory(preset);
      groups.set(category, [...(groups.get(category) ?? []), preset]);
    }
    return Array.from(groups.entries())
      .map(([category, presets]) => ({
        category,
        presets: presets.sort((left, right) => left.title.localeCompare(right.title)),
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }, [microReasonerPromptPresets]);
  const selectedEarbudMicroReasonerPromptPreset = useMemo(
    () => earbudMicroReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedEarbudMicroReasonerPromptPresetId) ??
      earbudMicroReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === preferredMicroReasonerPresetId(earbudMicroReasonerPromptPresets, activeEarbudMicroReasonerPromptPreset)) ??
      null,
    [activeEarbudMicroReasonerPromptPreset, earbudMicroReasonerPromptPresets, selectedEarbudMicroReasonerPromptPresetId],
  );
  const selectedDocumentMicroReasonerPromptPreset = useMemo(
    () => documentMicroReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedDocumentMicroReasonerPromptPresetId) ??
      documentMicroReasonerPromptPresets.find((preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === preferredMicroReasonerPresetId(documentMicroReasonerPromptPresets, activeDocumentMicroReasonerPromptPreset)) ??
      null,
    [activeDocumentMicroReasonerPromptPreset, documentMicroReasonerPromptPresets, selectedDocumentMicroReasonerPromptPresetId],
  );
  const earbudMicroReasonerPresetGroups = useMemo(() => {
    const groups = new Map<string, StagePlayMicroReasonerPromptPresetV1[]>();
    for (const preset of earbudMicroReasonerPromptPresets) {
      const category = microReasonerPresetCategory(preset);
      groups.set(category, [...(groups.get(category) ?? []), preset]);
    }
    return Array.from(groups.entries())
      .map(([category, presets]) => ({
        category,
        presets: presets.sort((left, right) => left.title.localeCompare(right.title)),
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }, [earbudMicroReasonerPromptPresets]);
  const documentMicroReasonerPresetGroups = useMemo(() => {
    const groups = new Map<string, StagePlayMicroReasonerPromptPresetV1[]>();
    for (const preset of documentMicroReasonerPromptPresets) {
      const category = microReasonerPresetCategory(preset);
      groups.set(category, [...(groups.get(category) ?? []), preset]);
    }
    return Array.from(groups.entries())
      .map(([category, presets]) => ({
        category,
        presets: presets.sort((left, right) => left.title.localeCompare(right.title)),
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }, [documentMicroReasonerPromptPresets]);
  const visualProducerState = useVisualSourceCaptureStore((state: { producers: Record<string, VisualSourceCaptureState> }) => {
    const sourceId = visualLatest?.active_source?.source_id ?? visualLatest?.source?.source_id ?? null;
    if (sourceId) return state.producers[sourceId] ?? null;
    return Object.values(state.producers)
      .filter((producer: VisualSourceCaptureState) => producer.thread_id === threadId && producer.track_ready_state !== "ended")
      .sort((left: VisualSourceCaptureState, right: VisualSourceCaptureState) =>
        Date.parse(right.last_frame_at ?? right.last_heartbeat_at ?? "0") -
        Date.parse(left.last_frame_at ?? left.last_heartbeat_at ?? "0"))
      .at(0) ?? null;
  });
  const activeVisualSourceId = visualLatest?.active_source?.source_id ?? visualLatest?.source?.source_id ?? visualProducerState?.source_id ?? null;
  const microDeckCatalogGroups = useMemo<LiveAnswerMicroDeckCatalogGroup[]>(() => {
    const visualCaptureDecks: LiveAnswerMicroDeckCatalogItem[] = visualShadeProfiles.map((profile: StagePlayVisualObserverProfileV1) => ({
      kind: "visual_observer_profile",
      id: profile.profileId,
      title: visualShadeOptionLabel(profile),
      description: [
        visualShadeSubjectCategory(profile),
        profile.subject,
        profile.outputMode,
        `hash ${profile.promptHash}`,
      ].filter(Boolean).join(" / "),
      groupTitle: "Visual Capture Decks",
      phase: "capture_prompt",
      sourceKind: "visual_frame",
      applied: activeVisualObserverProfile?.profileId === profile.profileId,
      colorKey: liveAnswerMicroDeckColorKey({
        sourceKind: "visual_frame",
        sourceId: activeVisualSourceId,
        deckId: profile.profileId,
      }),
    }));
    const visualReasoningDecks: LiveAnswerMicroDeckCatalogItem[] = microReasonerPromptPresets.map((preset: StagePlayMicroReasonerPromptPresetV1) => ({
      kind: "micro_reasoner_preset",
      id: preset.presetId,
      title: microReasonerPresetOptionLabel(preset, activeVisualSourceId),
      description: preset.description,
      groupTitle: "Visual Mail Decks",
      phase: "mail_reasoning",
      sourceKind: "visual_frame",
      outputPolicy: preset.outputPolicy,
      applied: activeMicroReasonerPromptPreset?.presetId === preset.presetId,
      colorKey: liveAnswerMicroDeckColorKey({
        sourceKind: "visual_frame",
        sourceId: activeVisualSourceId,
        deckId: preset.presetId,
      }),
    }));
    const audioTranscriptDecks: LiveAnswerMicroDeckCatalogItem[] = earbudMicroReasonerPromptPresets.map((preset: StagePlayMicroReasonerPromptPresetV1) => ({
      kind: "micro_reasoner_preset",
      id: preset.presetId,
      title: microReasonerPresetOptionLabel(preset, activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`),
      description: preset.description,
      groupTitle: "Audio Transcript Decks",
      phase: "mail_reasoning",
      sourceKind: "audio_transcript",
      outputPolicy: preset.outputPolicy,
      applied: Boolean(
        activeEarbudMicroReasonerPromptPreset?.presetId === preset.presetId &&
          activeAudioTranscriptSourceId &&
          preset.sourceIds.includes(activeAudioTranscriptSourceId),
      ),
      colorKey: liveAnswerMicroDeckColorKey({
        sourceKind: "audio_transcript",
        sourceId: activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`,
        deckId: preset.presetId,
      }),
    }));
    const documentMarkdownDecks: LiveAnswerMicroDeckCatalogItem[] = documentMicroReasonerPromptPresets.map((preset: StagePlayMicroReasonerPromptPresetV1) => ({
      kind: "micro_reasoner_preset",
      id: preset.presetId,
      title: microReasonerPresetOptionLabel(preset, activeDocumentMarkdownSourceId),
      description: preset.description,
      groupTitle: "Document Markdown Decks",
      phase: "mail_reasoning",
      sourceKind: "document_markdown",
      outputPolicy: preset.outputPolicy,
      applied: Boolean(
        activeDocumentMicroReasonerPromptPreset?.presetId === preset.presetId &&
          preset.sourceIds.includes(activeDocumentMarkdownSourceId),
      ),
      colorKey: liveAnswerMicroDeckColorKey({
        sourceKind: "document_markdown",
        sourceId: activeDocumentMarkdownSourceId,
        deckId: preset.presetId,
      }),
    }));
    return [
      {
        title: "Visual Capture Decks",
        phase: "capture_prompt",
        sourceKind: "visual_frame",
        items: sortLiveAnswerMicroDeckCatalogItems(visualCaptureDecks),
      },
      {
        title: "Visual Mail Decks",
        phase: "mail_reasoning",
        sourceKind: "visual_frame",
        items: sortLiveAnswerMicroDeckCatalogItems(visualReasoningDecks),
      },
      {
        title: "Audio Transcript Decks",
        phase: "mail_reasoning",
        sourceKind: "audio_transcript",
        items: sortLiveAnswerMicroDeckCatalogItems(audioTranscriptDecks),
      },
      {
        title: "Document Markdown Decks",
        phase: "mail_reasoning",
        sourceKind: "document_markdown",
        items: sortLiveAnswerMicroDeckCatalogItems(documentMarkdownDecks),
      },
    ];
  }, [
    activeAudioTranscriptSourceId,
    activeDocumentMarkdownSourceId,
    activeDocumentMicroReasonerPromptPreset?.presetId,
    activeEarbudMicroReasonerPromptPreset?.presetId,
    activeMicroReasonerPromptPreset?.presetId,
    activeVisualObserverProfile?.profileId,
    activeVisualSourceId,
    documentMicroReasonerPromptPresets,
    earbudMicroReasonerPromptPresets,
    microReasonerPromptPresets,
    threadId,
    visualShadeProfiles,
  ]);
  const selectMicroDeckCatalogItem = (item: LiveAnswerMicroDeckCatalogItem): void => {
    if (item.kind === "visual_observer_profile") {
      setSelectedVisualObserverProfileId(item.id);
      return;
    }
    if (item.sourceKind === "audio_transcript") {
      setSelectedEarbudMicroReasonerPromptPresetId(item.id);
      return;
    }
    if (item.sourceKind === "document_markdown") {
      setSelectedDocumentMicroReasonerPromptPresetId(item.id);
      return;
    }
    setSelectedMicroReasonerPromptPresetId(item.id);
  };
  const routeLiveAnswerVisual = visualCaptureRoutes.includes("live_answer");
  const routeImageLens = visualCaptureRoutes.includes("image_lens");
  const routeAudioTranscript = visualCaptureRoutes.includes("audio_transcript");
  const selectedRouteCount = visualCaptureRoutes.length;
  const currentVisualShareStream = activeVisualSourceId
    ? getActiveVisualFrameStream(activeVisualSourceId) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null
    : getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
  const currentVisualShareHasAudio = Boolean(currentVisualShareStream && currentVisualShareStream.getAudioTracks().length > 0);
  const audioRouteNeedsFreshShare = routeAudioTranscript && Boolean(currentVisualShareStream) && !currentVisualShareHasAudio;
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VISUAL_CAPTURE_ROUTE_STORAGE_KEY, JSON.stringify(visualCaptureRoutes));
  }, [visualCaptureRoutes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRouteSync = (event: Event) => {
      const detail = (event as CustomEvent<{ routes?: unknown }>).detail;
      setVisualCaptureRoutes(coerceVisualCaptureRoutes(detail?.routes));
    };
    window.addEventListener(VISUAL_CAPTURE_ROUTE_SYNC_EVENT, handleRouteSync);
    return () => window.removeEventListener(VISUAL_CAPTURE_ROUTE_SYNC_EVENT, handleRouteSync);
  }, []);
  const visualCaptureStatus =
    visualEvidenceHealth?.status ??
    visualLatest?.active_source?.status ??
    visualLatest?.source?.status ??
    (visualProducerState?.last_frame_preview_data_url ? "manual_frame_ready" : null) ??
    visualSourceCapability?.status ??
    "not registered";
  const visualFrameHistory = visualProducerState?.frame_history ?? [];
  const selectedVisualFrameHistory =
    visualFrameHistory.find((item: VisualSourceCaptureFrameHistoryItem) => item.history_id === selectedVisualFrameHistoryId) ??
    visualFrameHistory.at(-1) ??
    null;
  const selectedVisualFrameHistoryIndex = selectedVisualFrameHistory
    ? visualFrameHistory.findIndex((item: VisualSourceCaptureFrameHistoryItem) => item.history_id === selectedVisualFrameHistory.history_id)
    : -1;
  const selectedAudioTranscript =
    mergedAudioTranscriptHistory.find((item: AudioTranscriptHistoryItem) => item.history_id === selectedAudioTranscriptHistoryId) ??
    mergedAudioTranscriptHistory.at(-1) ??
    null;
  const selectedAudioTranscriptIndex = selectedAudioTranscript
    ? mergedAudioTranscriptHistory.findIndex((item: AudioTranscriptHistoryItem) => item.history_id === selectedAudioTranscript.history_id)
    : -1;
  const selectVisualFrameHistoryByOffset = (offset: number): void => {
    if (!visualFrameHistory.length) return;
    const baseIndex = selectedVisualFrameHistoryIndex >= 0 ? selectedVisualFrameHistoryIndex : visualFrameHistory.length - 1;
    const nextIndex = Math.max(0, Math.min(visualFrameHistory.length - 1, baseIndex + offset));
    setSelectedVisualFrameHistoryId(visualFrameHistory[nextIndex]?.history_id ?? null);
  };
  const selectAudioTranscriptByOffset = (offset: number): void => {
    if (!mergedAudioTranscriptHistory.length) return;
    const baseIndex = selectedAudioTranscriptIndex >= 0 ? selectedAudioTranscriptIndex : mergedAudioTranscriptHistory.length - 1;
    const nextIndex = Math.max(0, Math.min(mergedAudioTranscriptHistory.length - 1, baseIndex + offset));
    setSelectedAudioTranscriptHistoryId(mergedAudioTranscriptHistory[nextIndex]?.history_id ?? null);
  };
  useEffect(() => {
    if (!selectedVisualFrameHistory || mergedAudioTranscriptHistory.length === 0) return;
    const visualCapturedMs = Date.parse(selectedVisualFrameHistory.captured_at);
    if (!Number.isFinite(visualCapturedMs)) return;
    const toleranceMs = Math.max(audioTranscriptChunkMs, AUDIO_TRANSCRIPT_DEFAULT_CHUNK_MS) * 2;
    const ranked = mergedAudioTranscriptHistory
      .map((item: AudioTranscriptHistoryItem) => {
        const fromMs = item.from_ts ? Date.parse(item.from_ts) : NaN;
        const toMs = item.to_ts ? Date.parse(item.to_ts) : Date.parse(item.captured_at);
        const capturedMs = Date.parse(item.captured_at);
        const overlaps = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs <= visualCapturedMs && visualCapturedMs <= toMs;
        const anchorMs = Number.isFinite(toMs) ? toMs : capturedMs;
        const distanceMs = overlaps ? 0 : Math.abs(anchorMs - visualCapturedMs);
        return { item, distanceMs };
      })
      .sort((left, right) => left.distanceMs - right.distanceMs);
    const best = ranked[0];
    if (best && best.distanceMs <= toleranceMs && best.item.history_id !== selectedAudioTranscriptHistoryId) {
      setSelectedAudioTranscriptHistoryId(best.item.history_id);
    }
  }, [audioTranscriptChunkMs, mergedAudioTranscriptHistory, selectedAudioTranscriptHistoryId, selectedVisualFrameHistory]);
  const visualReplayFramesForRequest = (request: HelixVisualFrameActionReplayRequest): VisualSourceCaptureFrameHistoryItem[] => {
    const fromMs = request.from_ts ? Date.parse(request.from_ts) : null;
    const toMs = request.to_ts ? Date.parse(request.to_ts) : null;
    const summaryQuery = request.summary_query?.trim().toLowerCase() ?? "";
    const requestedHistoryIds = new Set(request.requested_frame_history_ids);
    const requestedFrameIds = new Set(request.requested_frame_ids);
    return visualFrameHistory
      .filter((item: VisualSourceCaptureFrameHistoryItem) => !request.source_id || item.source_id === request.source_id)
      .filter((item: VisualSourceCaptureFrameHistoryItem) =>
        requestedHistoryIds.size > 0 ? requestedHistoryIds.has(item.history_id) : true)
      .filter((item: VisualSourceCaptureFrameHistoryItem) =>
        requestedFrameIds.size > 0 && item.frame_id ? requestedFrameIds.has(item.frame_id) : requestedFrameIds.size === 0)
      .filter((item: VisualSourceCaptureFrameHistoryItem) => {
        const capturedMs = Date.parse(item.captured_at);
        if (fromMs != null && Number.isFinite(fromMs) && capturedMs < fromMs) return false;
        if (toMs != null && Number.isFinite(toMs) && capturedMs > toMs) return false;
        return true;
      })
      .filter((item: VisualSourceCaptureFrameHistoryItem) =>
        summaryQuery ? item.summary.toLowerCase().includes(summaryQuery) : true)
      .slice(-(request.max_frames || 12));
  };
  const selectedShadeApplied = Boolean(
    activeVisualObserverProfile &&
      selectedVisualObserverProfile &&
      activeVisualObserverProfile.profileId === selectedVisualObserverProfile.profileId,
  );
  const selectedMicroPresetApplied = Boolean(
    activeMicroReasonerPromptPreset &&
      selectedMicroReasonerPromptPreset &&
      activeMicroReasonerPromptPreset.presetId === selectedMicroReasonerPromptPreset.presetId,
  );
  const selectedEarbudMicroPresetApplied = Boolean(
    activeEarbudMicroReasonerPromptPreset &&
      selectedEarbudMicroReasonerPromptPreset &&
      activeEarbudMicroReasonerPromptPreset.presetId === selectedEarbudMicroReasonerPromptPreset.presetId &&
      activeAudioTranscriptSourceId &&
      activeEarbudMicroReasonerPromptPreset.sourceIds.includes(activeAudioTranscriptSourceId),
  );
  const selectedDocumentMicroPresetApplied = Boolean(
    activeDocumentMicroReasonerPromptPreset &&
      selectedDocumentMicroReasonerPromptPreset &&
      activeDocumentMicroReasonerPromptPreset.presetId === selectedDocumentMicroReasonerPromptPreset.presetId &&
      activeDocumentMicroReasonerPromptPreset.sourceIds.includes(activeDocumentMarkdownSourceId),
  );
  const visualShadeStatus = activeVisualObserverProfile
    ? `${activeVisualObserverProfile.title} active; ${activeVisualObserverProfile.outputMode}; hash ${activeVisualObserverProfile.promptHash}`
    : "Generic visual capture prompt is active until a shade is applied.";
  const microReasonerPresetStatus = activeMicroReasonerPromptPreset
    ? `${activeMicroReasonerPromptPreset.title} active; ${activeMicroReasonerPromptPreset.promptedRoles.length} prompted role${activeMicroReasonerPromptPreset.promptedRoles.length === 1 ? "" : "s"}; ${activeMicroReasonerPromptPreset.outputPolicy}`
    : "Generic MicroDeck prompt preset is active until a source preset is applied.";
  const earbudMicroReasonerPresetStatus = activeEarbudMicroReasonerPromptPreset
    ? `${activeEarbudMicroReasonerPromptPreset.title} ${activeAudioTranscriptSourceId && activeEarbudMicroReasonerPromptPreset.sourceIds.includes(activeAudioTranscriptSourceId) ? "applied" : "available"}; ${activeEarbudMicroReasonerPromptPreset.outputPolicy}`
    : "Earbud translation presets are available after audio transcript routing loads.";
  const documentMicroReasonerPresetStatus = activeDocumentMicroReasonerPromptPreset
    ? `${activeDocumentMicroReasonerPromptPreset.title} ${activeDocumentMicroReasonerPromptPreset.sourceIds.includes(activeDocumentMarkdownSourceId) ? "applied" : "available"}; ${activeDocumentMicroReasonerPromptPreset.outputPolicy}`
    : "Document Markdown translation presets are available after the document source lane loads.";
  const adaptiveVisualLensSelected = selectedMicroReasonerPromptPresetId === ADAPTIVE_VISUAL_LENS_CONTROLLER_PRESET_ID;
  const adaptiveVisualLensCanApply = Boolean(
    adaptiveVisualLensSelected &&
      adaptiveVisualLensProposal?.applyable &&
      adaptiveVisualLensProposal.decision === "suggest_profile" &&
      adaptiveVisualLensProposal.sourceId === activeVisualSourceId,
  );
  const adaptiveVisualLensSuggestedPrompt =
    adaptiveVisualLensProposal?.suggestedProfileDraft?.prompt ??
    (adaptiveVisualLensProposal?.candidateProfileId
      ? visualShadeProfiles.find((profile: StagePlayVisualObserverProfileV1) =>
        profile.profileId === adaptiveVisualLensProposal.candidateProfileId)?.prompt
      : null) ??
    "";
  const selectedEarbudMicroPromptPreview = useMemo(
    () => selectedEarbudMicroReasonerPromptPreset
      ? earbudMicroReasonerPrompts
        .filter((prompt: StagePlayMicroReasonerPromptV1) =>
          selectedEarbudMicroReasonerPromptPreset.promptedRoles.includes(prompt.role) ||
          Boolean(selectedEarbudMicroReasonerPromptPreset.rolePromptIds[prompt.role])
        )
        .slice(0, 3)
      : [],
    [earbudMicroReasonerPrompts, selectedEarbudMicroReasonerPromptPreset],
  );
  const selectedDocumentMicroPromptPreview = useMemo(
    () => selectedDocumentMicroReasonerPromptPreset
      ? documentMicroReasonerPrompts
        .filter((prompt: StagePlayMicroReasonerPromptV1) =>
          selectedDocumentMicroReasonerPromptPreset.promptedRoles.includes(prompt.role) ||
          Boolean(selectedDocumentMicroReasonerPromptPreset.rolePromptIds[prompt.role])
        )
        .slice(0, 4)
      : [],
    [documentMicroReasonerPrompts, selectedDocumentMicroReasonerPromptPreset],
  );
  const earbudMicroReasonerOutputs = useMemo<EarbudMicroReasonerOutput[]>(() => {
    const sourceId = activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`;
    const activePresetIds = new Set([
      activeEarbudMicroReasonerPromptPreset?.presetId,
      selectedEarbudMicroReasonerPromptPreset?.presetId,
    ].filter((entry): entry is string => Boolean(entry)));
    return earbudMicroReasonerRuns
      .filter((run: StagePlayMicroReasonerRunV1) => run.role === "packet_composer")
      .filter((run: StagePlayMicroReasonerRunV1) => run.sourceId === sourceId)
      .filter((run: StagePlayMicroReasonerRunV1) =>
        !activePresetIds.size ||
        (run.deckPresetId ? activePresetIds.has(run.deckPresetId) : false) ||
        /earbud/i.test(run.deckPresetTitle ?? "")
      )
      .map((run: StagePlayMicroReasonerRunV1): EarbudMicroReasonerOutput => ({
        runId: run.runId,
        role: run.role,
        text: readEarbudRunText(run),
        sourceId: run.sourceId,
        deckTitle: run.deckPresetTitle ?? "Earbud MicroDeck",
        status: run.status,
        createdAt: run.completedAt ?? run.startedAt,
        refs: run.outputRefs?.length ? run.outputRefs : run.mailIds,
      }))
      .filter((output: EarbudMicroReasonerOutput) => output.text.length > 0)
      .sort((left: EarbudMicroReasonerOutput, right: EarbudMicroReasonerOutput) => left.createdAt.localeCompare(right.createdAt))
      .slice(-6);
  }, [
    activeAudioTranscriptSourceId,
    activeEarbudMicroReasonerPromptPreset?.presetId,
    earbudMicroReasonerRuns,
    selectedEarbudMicroReasonerPromptPreset?.presetId,
    threadId,
  ]);
  const latestEarbudMicroReasonerOutput = earbudMicroReasonerOutputs.at(-1) ?? null;
  const documentMicroReasonerOutputs = useMemo<EarbudMicroReasonerOutput[]>(() => {
    const activePresetIds = new Set([
      activeDocumentMicroReasonerPromptPreset?.presetId,
      selectedDocumentMicroReasonerPromptPreset?.presetId,
    ].filter((entry): entry is string => Boolean(entry)));
    return documentMicroReasonerRuns
      .filter((run: StagePlayMicroReasonerRunV1) => run.sourceId === activeDocumentMarkdownSourceId)
      .filter(isDocumentTranslationProductRun)
      .filter((run: StagePlayMicroReasonerRunV1) => run.status === "completed" || run.status === "failed")
      .filter((run: StagePlayMicroReasonerRunV1) =>
        !activePresetIds.size ||
        (run.deckPresetId ? activePresetIds.has(run.deckPresetId) : false) ||
        /document/i.test(run.deckPresetTitle ?? "")
      )
      .map((run: StagePlayMicroReasonerRunV1): EarbudMicroReasonerOutput => ({
        runId: run.runId,
        role: run.role,
        text: readDocumentTranslationRunText(run),
        sourceId: run.sourceId,
        deckTitle: run.deckPresetTitle ?? "Document Markdown MicroDeck",
        status: run.status,
        createdAt: run.completedAt ?? run.startedAt,
        refs: run.outputRefs?.length ? run.outputRefs : run.mailIds,
      }))
      .filter((output: EarbudMicroReasonerOutput) => output.text.length > 0)
      .sort((left: EarbudMicroReasonerOutput, right: EarbudMicroReasonerOutput) => left.createdAt.localeCompare(right.createdAt))
      .slice(-9);
  }, [
    activeDocumentMarkdownSourceId,
    activeDocumentMicroReasonerPromptPreset?.presetId,
    documentMicroReasonerRuns,
    selectedDocumentMicroReasonerPromptPreset?.presetId,
  ]);
  const latestDocumentMicroReasonerOutput = documentMicroReasonerOutputs.at(-1) ?? null;
  const documentMicroReasonerTraceItems = useMemo<DocumentMicroReasonerTraceItem[]>(() => {
    const mailRows = documentSourceMailItems.slice(-3).map((item: Record<string, unknown>): DocumentMicroReasonerTraceItem => {
      const summary = readRecord(item.summary);
      return {
        id: readTraceString(item, ["mailId", "mail_id"], "document-mail"),
        label: "live-source mail",
        status: readTraceString(item, ["status"], readTraceString(summary ?? {}, ["analysisState", "analysis_state"], "queued")),
        detail: readTraceString(summary ?? {}, ["preview", "text"], readTraceString(item, ["sourceId", "source_id"], activeDocumentMarkdownSourceId)),
        createdAt: readTraceString(item, ["createdAt", "created_at"], ""),
      };
    });
    const wakeRows = documentSourceWakeRequests.slice(-3).map((wake: Record<string, unknown>): DocumentMicroReasonerTraceItem => ({
      id: readTraceString(wake, ["wakeRequestId", "wake_request_id"], "document-wake"),
      label: "wake request",
      status: readTraceString(wake, ["status"], "unknown"),
      detail: readTraceString(wake, ["reason", "failedReason", "failed_reason"], readTraceString(wake, ["jobId", "job_id"], activeDocumentMarkdownSourceId)),
      createdAt: readTraceString(wake, ["updatedAt", "updated_at", "createdAt", "created_at"], ""),
    }));
    const wakeResultRows = documentSourceWakeResults.slice(-3).map((result: Record<string, unknown>): DocumentMicroReasonerTraceItem => ({
      id: readTraceString(result, ["wakeResultId", "wake_result_id", "wakeRequestId", "wake_request_id"], "document-wake-result"),
      label: "wake result",
      status: readTraceString(result, ["status"], "unknown"),
      detail: readTraceString(result, ["failedReason", "failed_reason", "decision", "result"], activeDocumentMarkdownSourceId),
      createdAt: readTraceString(result, ["createdAt", "created_at"], ""),
    }));
    const packetRows = documentSourceProcessedPackets.slice(-3).map((packet: Record<string, unknown>): DocumentMicroReasonerTraceItem => ({
      id: readTraceString(packet, ["packetId", "packet_id"], "document-packet"),
      label: "processed packet",
      status: readTraceString(packet, ["resolutionState", "resolution_state"], "recorded"),
      detail: readTraceString(packet, ["recommendedNext", "recommended_next"], readTraceString(packet, ["packetId", "packet_id"], "")),
      createdAt: readTraceString(packet, ["createdAt", "created_at"], ""),
    }));
    const runRows = documentMicroReasonerRuns
      .filter((run: StagePlayMicroReasonerRunV1) => run.sourceId === activeDocumentMarkdownSourceId)
      .slice(-6)
      .map((run: StagePlayMicroReasonerRunV1): DocumentMicroReasonerTraceItem => ({
        id: run.runId,
        label: `run:${run.role}`,
        status: run.status,
        detail: [
          run.deckPresetTitle,
          run.deckExecutionMode,
          run.deckProductRole ? "product" : "non-product",
          run.error,
        ].filter(Boolean).join(" / ") || run.outputPreview,
        createdAt: run.completedAt ?? run.startedAt,
      }));
    return [...mailRows, ...wakeRows, ...wakeResultRows, ...packetRows, ...runRows]
      .filter((item) => item.id || item.detail)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-12);
  }, [
    activeDocumentMarkdownSourceId,
    documentMicroReasonerRuns,
    documentSourceMailItems,
    documentSourceProcessedPackets,
    documentSourceWakeRequests,
    documentSourceWakeResults,
  ]);
  const liveAnswerCircuitRows = useMemo<LiveAnswerReasoningCircuitRow[]>(() =>
    goalContextUpdates
      .slice(0, 6)
      .map((update: WorkstationGoalContextUpdateV1) => ({
        id: update.updateId,
        title: compactLabel(update.updateKind),
        producer: compactLabel(update.producerKind),
        status: update.freshness.status,
        preview: update.preview,
        contentRef: update.contentRef,
        sourceRefs: update.sourceRefs,
        loopRefs: update.loopRefs,
        evidenceRefs: update.evidenceRefs,
        receiptRefs: update.receiptRefs,
        policyRefs: liveAnswerPolicyRefsForUpdate(update),
        requestedToolName: update.toolIdentity?.requestedToolName ?? null,
        canonicalToolName: update.toolIdentity?.canonicalToolName ?? null,
        matchedAllowedActuators: update.toolIdentity?.matchedAllowedActuators ?? [],
        matchedAllowedActuatorRefs: update.toolIdentity?.matchedAllowedActuatorRefs ?? [],
        packetCircuitRefs: liveAnswerPacketCircuitRefsForUpdate(update),
        dispatch: update.suggestedDispatch.slice(0, 4).map(liveAnswerDispatchLabel),
        packetColorKey: liveAnswerPacketColorKey(update),
        freshness: {
          observedAtMs: update.freshness.observedAtMs,
          staleAfterMs: update.freshness.staleAfterMs,
          status: update.freshness.status,
        },
        authority: {
          assistantAnswer: update.authority.assistantAnswer,
          terminalEligible: update.authority.terminalEligible,
          rawContentIncluded: update.authority.rawContentIncluded,
          postToolModelStepRequired: update.authority.postToolModelStepRequired,
        },
      })),
    [goalContextUpdates],
  );
  const liveAnswerCircuitSummary = useMemo(() => {
    const dispatches = goalContextUpdates.flatMap((update: WorkstationGoalContextUpdateV1) => update.suggestedDispatch);
    const microDeckRefs = Array.from(new Set(goalContextUpdates.flatMap(liveAnswerMicroDeckRefsForUpdate)));
    const microDeckFeedSessionCount = agentGoalSessions.filter((session: AgentGoalSessionV1) =>
      session.contextFeeds.some((feed) => feed.sourceKind === "microdeck_outputs")
    ).length;
    return {
      updateCount: goalContextUpdates.length,
      observationOnlyCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        update.authority.assistantAnswer === false &&
        update.authority.terminalEligible === false &&
        update.authority.rawContentIncluded === false
      ).length,
      activeGoalCount: agentGoalSessions.filter((session: AgentGoalSessionV1) => session.status === "active" || session.status === "blocked").length,
      narratorSpeechCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "speak_narrator").length,
      narratorBindingCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "bind_narrator_stream").length,
      wakeCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "wake_agent").length,
      wakeUrgentCount: dispatches.filter((action: WorkstationDispatchActionV1) =>
        action.kind === "wake_agent" && action.interruptKind === "urgent"
      ).length,
      wakeBlockedCount: dispatches.filter((action: WorkstationDispatchActionV1) =>
        action.kind === "wake_agent" && action.interruptKind === "blocked"
      ).length,
      wakePolicyTriggeredCount: dispatches.filter((action: WorkstationDispatchActionV1) =>
        action.kind === "wake_agent" && action.interruptKind === "policy_triggered"
      ).length,
      workstationControlDispatchCount: dispatches.filter(isLiveAnswerWorkstationControlDispatch).length,
      presetDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "change_preset").length,
      sourceBindingDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "bind_source" || action.kind === "unbind_source").length,
      sourceRepairDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "repair_source").length,
      loopDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) =>
        action.kind === "set_loop_state" || action.kind === "repair_loop"
      ).length,
      liveAnswerDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "update_live_answer").length,
      processGraphDispatchCount: dispatches.filter((action: WorkstationDispatchActionV1) => action.kind === "focus_process_graph").length,
      microdeckOutputCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        update.producerKind === "microdeck" ||
        update.contentRef.includes("microdeck") ||
        update.evidenceRefs.some((ref) => ref.includes("microdeck") || ref.includes("micro_reasoner"))
      ).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "microdeck_outputs")
        ).length,
      microdeckLifecycleCount: microDeckRefs.length + microDeckFeedSessionCount,
      microdeckPresetCreateCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:preset_create/i]),
      microdeckPresetStateCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:preset_state/i, /^microdeck-output:/i, /^microdeck_output:/i]),
      microdeckPresetQueryCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:preset_query/i, /^workstation_context_feed:microdeck_outputs/i, /^workstation_actuator:query_microdeck_outputs/i]),
      microdeckPresetDraftCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:preset_draft/i]),
      microdeckPromptRouteCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:prompt_route/i]),
      microdeckPromptUpdateCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:prompt_update/i]),
      microdeckPromptTestCount: countLiveAnswerMicroDeckRefs(microDeckRefs, [/^microdeck:prompt_test/i]),
      visualSummaryCount: goalContextUpdates.filter(liveAnswerVisualSummaryUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "visual_summaries")
        ).length,
      audioTranscriptCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        update.producerKind === "audio_capture" ||
        update.producerKind === "transcription_loop" ||
        update.updateKind === "transcript_window"
      ).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "audio_transcripts")
        ).length,
      translatedTranscriptCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        update.producerKind === "translation_loop" ||
        update.updateKind === "translated_transcript"
      ).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "translated_transcripts")
        ).length,
      packetTraceCount: goalContextUpdates.filter(liveAnswerPacketTraceUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "packet_traces")
        ).length,
      sourceHealthCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        update.producerKind === "source_health" || update.updateKind === "source_status"
      ).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "source_health")
        ).length,
      feedQueryCount: goalContextUpdates.filter(liveAnswerFeedQueryUpdate).length +
        agentGoalSessions.reduce((count: number, session: AgentGoalSessionV1) => count + session.contextFeeds.length, 0),
      routeWatchCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) => update.producerKind === "route_watch").length,
      routeEvidenceCount: goalContextUpdates.filter(liveAnswerRouteEvidenceUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "route_evidence")
        ).length,
      automationCount: goalContextUpdates.filter(liveAnswerAutomationUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "automation_policies")
        ).length,
      automationPolicyCount: goalContextUpdates.filter(liveAnswerAutomationPolicyUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "automation_policies")
        ).length,
      feedPolicyRefCount: goalContextUpdates.reduce(
        (count: number, update: WorkstationGoalContextUpdateV1) => count + liveAnswerContextFeedPolicyRefsForUpdate(update).length,
        0,
      ),
      actuatorPolicyRefCount: goalContextUpdates.reduce(
        (count: number, update: WorkstationGoalContextUpdateV1) => count + liveAnswerActuatorPolicyRefsForUpdate(update).length,
        0,
      ),
      freshnessFilterRefCount: goalContextUpdates.reduce(
        (count: number, update: WorkstationGoalContextUpdateV1) => count + liveAnswerFreshnessFilterRefsForUpdate(update).length,
        0,
      ),
      sessionFilterRefCount: goalContextUpdates.reduce(
        (count: number, update: WorkstationGoalContextUpdateV1) =>
          count + update.evidenceRefs.filter((ref) => ref.startsWith("agent_goal_session_filter:")).length,
        0,
      ),
      toolAttributedUpdateCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        Boolean(update.toolIdentity?.requestedToolName || update.toolIdentity?.canonicalToolName)
      ).length,
      matchedToolActuatorUpdateCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) =>
        (update.toolIdentity?.matchedAllowedActuators.length ?? 0) > 0 ||
        (update.toolIdentity?.matchedAllowedActuatorRefs.length ?? 0) > 0
      ).length,
      actuatorPolicyCount: agentGoalSessions.reduce((count: number, session: AgentGoalSessionV1) => count + session.allowedActuators.length, 0),
      narratorEventFeedCount: goalContextUpdates.filter((update: WorkstationGoalContextUpdateV1) => update.producerKind === "narrator").length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "narrator_events")
        ).length,
      narratorActuatorPolicyCount: agentGoalSessions.reduce(
        (count: number, session: AgentGoalSessionV1) => count + session.allowedActuators.filter((actuator) =>
          actuator === "bind_narrator" || actuator === "narrator_bind_stream" || actuator === "narrator_say"
        ).length,
        0,
      ),
      traceMemoryCount: goalContextUpdates.filter(liveAnswerTraceMemoryUpdate).length +
        agentGoalSessions.filter((session: AgentGoalSessionV1) =>
          session.contextFeeds.some((feed) => feed.sourceKind === "trace_memory")
        ).length,
      terminalAuthorityRequiredCount: agentGoalSessions.filter((session: AgentGoalSessionV1) => session.authority.finalReportsRequireTerminalAuthority).length,
      terminalPosture: agentGoalSessions.some((session: AgentGoalSessionV1) => session.authority.finalReportsRequireTerminalAuthority)
        ? "terminal authority required"
        : "observation only",
    };
  }, [agentGoalSessions, goalContextUpdates]);
  const visualShadePromptChanged = Boolean(
    visualShadePromptDraft.trim() &&
      selectedVisualObserverProfile &&
      visualShadePromptDraft.trim() !== selectedVisualObserverProfile.prompt.trim(),
  );
  const latestClientAction = useMemo(() => clientActions.at(-1) ?? null, [clientActions]);
  const latestClientAdoption = useMemo(() => clientAdoptions.at(-1) ?? null, [clientAdoptions]);
  const latestClientObserved = latestClientAdoption?.observed_state ?? {};
  const sourceStatusLabel = (capability: HelixSituationSourceCapability): string => {
    if (capability.modality === "visual_frame" && capability.status === "active" && capability.next_required_action === "capture_first_frame") {
      return "active, waiting for first frame";
    }
    if (capability.modality === "visual_frame" && capability.status === "active" && capability.last_event_ts) {
      return `active, last frame ${new Date(capability.last_event_ts).toLocaleTimeString()}`;
    }
    if (capability.modality === "visual_frame" && capability.status === "stale" && capability.last_event_ts) {
      return `stale, last frame ${new Date(capability.last_event_ts).toLocaleTimeString()}`;
    }
    return capability.status;
  };

  const refresh = async () => {
    try {
      await loadEnvironment(threadId, 50);
      const loadedEnvironment = selectActiveLiveAnswerEnvironment(useLiveAnswerEnvironmentStore.getState(), threadId);
      const activeEnvironmentId = loadedEnvironment?.environment_id ?? environment?.environment_id ?? null;
      const commentaryPath = activeEnvironmentId
        ? `/api/agi/situation/live-commentary?thread_id=${encodeURIComponent(threadId)}&environment_id=${encodeURIComponent(activeEnvironmentId)}`
        : `/api/agi/situation/live-commentary?thread_id=${encodeURIComponent(threadId)}`;
      const reviewPath = activeEnvironmentId
        ? `/api/agi/situation/live-agentic-review?thread_id=${encodeURIComponent(threadId)}&environment_id=${encodeURIComponent(activeEnvironmentId)}`
        : `/api/agi/situation/live-agentic-review?thread_id=${encodeURIComponent(threadId)}`;
      const roomQuery = loadedEnvironment?.room_id ? `&room_id=${encodeURIComponent(loadedEnvironment.room_id)}` : "";
      const [sourceRes, eventRes, windowRes, commentaryRes, reviewRes, presentStateRes, interpretedLogRes, clarificationRes, lineToolRes, workerRes, visualLatestRes, clientActionRes, clientAdoptionRes, cognitionPlainRes, cognitionInterpretationRes, cognitionGoalRes, cognitionHandoffRes, situationRunRes, fieldWorkerRes, fieldWorkerRunRes, fieldEvaluationRes, tangentRes, arbitrationCandidateRes, planContractRes, acceptanceRunRes, predictionRes, probeRes, probeResultRes, confidenceUpdateRes, procedureEpochRes, procedureClosureRes, procedureLedgerRes, handoffConsumptionRes, planExecutionRes] = await Promise.all([
        fetch("/api/agi/situation/live-source/list"),
        fetch("/api/agi/situation/live-source/events"),
        fetch("/api/agi/situation/live-source/windows"),
        fetch(commentaryPath),
        fetch(reviewPath),
        fetch(`/api/agi/situation/present-state-card?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/interpreted-log?thread_id=${encodeURIComponent(threadId)}${roomQuery}&limit=80`),
        fetch(`/api/agi/situation/clarification-dialogue?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-line-tool-requests?thread_id=${encodeURIComponent(threadId)}&limit=80`),
        fetch(`/api/agi/situation/live-workers?thread_id=${encodeURIComponent(threadId)}&limit=80`),
        fetch(`/api/agi/situation/visual-frame/latest?thread_id=${encodeURIComponent(threadId)}`),
        fetch(`/api/agi/client-action/pending?thread_id=${encodeURIComponent(threadId)}`),
        fetch(`/api/agi/client-action/adoptions?thread_id=${encodeURIComponent(threadId)}`),
        fetch(`/api/agi/situation/live-cognition/plain-log?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/interpretations?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/goals?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/handoffs?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/situation-runs?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/field-workers?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/field-worker-runs?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/field-evaluations?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/tangents?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/arbitration-candidates?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/plan-contracts?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/acceptance-runs?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/predictions?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/probes?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/probe-results?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/confidence-updates?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/procedure-epochs?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/procedure-epoch-closures?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/procedure-epoch-ledger?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/handoff-consumptions?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
        fetch(`/api/agi/situation/live-cognition/plan-executions?thread_id=${encodeURIComponent(threadId)}${roomQuery}`),
      ]);
      const [sourceBody, eventBody, windowBody, commentaryBody, reviewBody, presentStateBody, interpretedLogBody, clarificationBody, lineToolBody, workerBody, visualLatestBody, clientActionBody, clientAdoptionBody, cognitionPlainBody, cognitionInterpretationBody, cognitionGoalBody, cognitionHandoffBody, situationRunBody, fieldWorkerBody, fieldWorkerRunBody, fieldEvaluationBody, tangentBody, arbitrationCandidateBody, planContractBody, acceptanceRunBody, predictionBody, probeBody, probeResultBody, confidenceUpdateBody, procedureEpochBody, procedureClosureBody, procedureLedgerBody, handoffConsumptionBody, planExecutionBody] = await Promise.all([
        sourceRes.json(),
        eventRes.json(),
        windowRes.json(),
        commentaryRes.json(),
        reviewRes.json(),
        presentStateRes.json(),
        interpretedLogRes.json(),
        clarificationRes.json(),
        lineToolRes.json(),
        workerRes.json(),
        visualLatestRes.json(),
        clientActionRes.json().catch(() => ({})),
        clientAdoptionRes.json().catch(() => ({})),
        cognitionPlainRes.json().catch(() => ({})),
        cognitionInterpretationRes.json().catch(() => ({})),
        cognitionGoalRes.json().catch(() => ({})),
        cognitionHandoffRes.json().catch(() => ({})),
        situationRunRes.json().catch(() => ({})),
        fieldWorkerRes.json().catch(() => ({})),
        fieldWorkerRunRes.json().catch(() => ({})),
        fieldEvaluationRes.json().catch(() => ({})),
        tangentRes.json().catch(() => ({})),
        arbitrationCandidateRes.json().catch(() => ({})),
        planContractRes.json().catch(() => ({})),
        acceptanceRunRes.json().catch(() => ({})),
        predictionRes.json().catch(() => ({})),
        probeRes.json().catch(() => ({})),
        probeResultRes.json().catch(() => ({})),
        confidenceUpdateRes.json().catch(() => ({})),
        procedureEpochRes.json().catch(() => ({})),
        procedureClosureRes.json().catch(() => ({})),
        procedureLedgerRes.json().catch(() => ({})),
        handoffConsumptionRes.json().catch(() => ({})),
        planExecutionRes.json().catch(() => ({})),
      ]);
      const eventItems = Array.isArray(eventBody.events) ? eventBody.events as WorkstationLiveSourceEvent[] : [];
      const latestAudioTranscriptSourceId = [...eventItems]
        .reverse()
        .find((event: WorkstationLiveSourceEvent) => event.kind === "browser_audio_transcript" || event.event_type === "transcript_chunk")
        ?.source_id ?? null;
      setSources(Array.isArray(sourceBody.sources) ? sourceBody.sources : []);
      setEvents(eventItems);
      setWindows(Array.isArray(windowBody.windows) ? windowBody.windows : []);
      setCommentarySession(commentaryBody.session ?? null);
      setCommentaryCandidates(Array.isArray(commentaryBody.candidates) ? commentaryBody.candidates : []);
      setCommentaryProposals(Array.isArray(commentaryBody.proposals) ? commentaryBody.proposals : []);
      setCommentaryDeliveries(Array.isArray(commentaryBody.deliveries) ? commentaryBody.deliveries : []);
      setReviewRequests(Array.isArray(reviewBody.requests) ? reviewBody.requests : []);
      setReviewResults(Array.isArray(reviewBody.results) ? reviewBody.results : []);
      setPresentStateCard(presentStateBody.card ?? null);
      setInterpretedEvents(Array.isArray(interpretedLogBody.events) ? interpretedLogBody.events : []);
      setClarificationNeeds(Array.isArray(clarificationBody.needs) ? clarificationBody.needs : []);
      setClarificationProposals(Array.isArray(clarificationBody.proposals) ? clarificationBody.proposals : []);
      setSteeringEvidence(Array.isArray(clarificationBody.steering_evidence) ? clarificationBody.steering_evidence : []);
      setLineToolRequests(Array.isArray(lineToolBody.requests) ? lineToolBody.requests : []);
      setLineToolEvaluations(Array.isArray(lineToolBody.evaluations) ? lineToolBody.evaluations : []);
      setWorkerLanes(Array.isArray(workerBody.lanes) ? workerBody.lanes : []);
      setWorkerRuns(Array.isArray(workerBody.runs) ? workerBody.runs : []);
      setClientActions(Array.isArray(clientActionBody.actions) ? clientActionBody.actions : []);
      setClientAdoptions(Array.isArray(clientAdoptionBody.adoptions) ? clientAdoptionBody.adoptions.slice(-12) : []);
      setCognitionObservations(Array.isArray(cognitionPlainBody.observations) ? cognitionPlainBody.observations : []);
      setCognitionInterpretations(Array.isArray(cognitionInterpretationBody.interpretations) ? cognitionInterpretationBody.interpretations : []);
      setCognitionGoals(Array.isArray(cognitionGoalBody.goals) ? cognitionGoalBody.goals : []);
      setCognitionHandoffs(Array.isArray(cognitionHandoffBody.handoffs) ? cognitionHandoffBody.handoffs : []);
      setSituationRuns(Array.isArray(situationRunBody.runs) ? situationRunBody.runs : []);
      setFieldWorkers(Array.isArray(fieldWorkerBody.workers) ? fieldWorkerBody.workers : []);
      setFieldWorkerRuns(Array.isArray(fieldWorkerRunBody.worker_runs) ? fieldWorkerRunBody.worker_runs : []);
      setFieldEvaluations(Array.isArray(fieldEvaluationBody.evaluations) ? fieldEvaluationBody.evaluations : []);
      setTangentEvaluations(Array.isArray(tangentBody.tangents) ? tangentBody.tangents : []);
      setArbitrationCandidates(Array.isArray(arbitrationCandidateBody.candidates) ? arbitrationCandidateBody.candidates : []);
      setPlanContracts(Array.isArray(planContractBody.plan_contracts) ? planContractBody.plan_contracts : []);
      setAcceptanceRuns(Array.isArray(acceptanceRunBody.acceptance_runs) ? acceptanceRunBody.acceptance_runs : []);
      setSituationPredictions(Array.isArray(predictionBody.predictions) ? predictionBody.predictions : []);
      setObservationProbes(Array.isArray(probeBody.probes) ? probeBody.probes : []);
      setProbeResults(Array.isArray(probeResultBody.probe_results) ? probeResultBody.probe_results : []);
      setConfidenceUpdates(Array.isArray(confidenceUpdateBody.confidence_updates) ? confidenceUpdateBody.confidence_updates : []);
      setProcedureEpochs(Array.isArray(procedureEpochBody.procedure_epochs) ? procedureEpochBody.procedure_epochs : []);
      setProcedureEpochClosures(Array.isArray(procedureClosureBody.closures) ? procedureClosureBody.closures : []);
      setProcedureLedgerItems(Array.isArray(procedureLedgerBody.ledger_items) ? procedureLedgerBody.ledger_items : []);
      const sourceBindingLedgerBody = await fetch(`/api/agi/situation/source-binding-status-ledger?thread_id=${encodeURIComponent(threadId)}&limit=80`).then((response) => response.json()).catch(() => ({}));
      const goalContextBody = await fetch(`/api/helix/stage-play/goal-context?threadId=${encodeURIComponent(threadId)}&limit=24`).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setSourceBindingTransitions(Array.isArray(sourceBindingLedgerBody.transitions) ? sourceBindingLedgerBody.transitions : []);
      setGoalContextUpdates(Array.isArray(goalContextBody.goalContextUpdates) ? goalContextBody.goalContextUpdates : []);
      setAgentGoalSessions(Array.isArray(goalContextBody.agentGoalSessions) ? goalContextBody.agentGoalSessions : []);
      setHandoffConsumptions(Array.isArray(handoffConsumptionBody.handoff_consumptions) ? handoffConsumptionBody.handoff_consumptions : []);
      setPlanExecutions(Array.isArray(planExecutionBody.plan_executions) ? planExecutionBody.plan_executions : []);
      setVisualLatest(visualLatestBody ?? null);
      const visualSourceId =
        typeof visualLatestBody?.active_source?.source_id === "string"
          ? visualLatestBody.active_source.source_id
          : typeof visualLatestBody?.source?.source_id === "string"
            ? visualLatestBody.source.source_id
            : "";
      const visualObserverProfileBody: VisualObserverProfileListRead = await fetch(
        `/api/helix/stage-play/visual-observer-profile?sourceId=${encodeURIComponent(visualSourceId)}&includePresets=true`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setVisualObserverProfiles(Array.isArray(visualObserverProfileBody.profiles) ? visualObserverProfileBody.profiles : []);
      setActiveVisualObserverProfile(visualObserverProfileBody.activeProfile ?? visualObserverProfileBody.active_profile ?? null);
      const microReasonerPromptPresetBody: MicroReasonerPromptPresetListRead = await fetch(
        `/api/helix/stage-play/micro-reasoner-prompt-preset?sourceId=${encodeURIComponent(visualSourceId)}&sourceKind=visual_frame&includePresets=true`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setMicroReasonerPromptPresets(Array.isArray(microReasonerPromptPresetBody.presets) ? microReasonerPromptPresetBody.presets : []);
      setActiveMicroReasonerPromptPreset(microReasonerPromptPresetBody.activePreset ?? microReasonerPromptPresetBody.active_preset ?? null);
      setMicroReasonerPrompts(
        Array.isArray(microReasonerPromptPresetBody.prompts)
          ? microReasonerPromptPresetBody.prompts
          : Array.isArray(microReasonerPromptPresetBody.microReasonerPrompts)
            ? microReasonerPromptPresetBody.microReasonerPrompts
            : [],
      );
      if (visualSourceId) {
        const adaptiveVisualLensBody: AdaptiveVisualLensRead = await fetch(
          `/api/helix/stage-play/adaptive-visual-lens?threadId=${encodeURIComponent(threadId)}&sourceId=${encodeURIComponent(visualSourceId)}&limit=1`,
        ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
        setAdaptiveVisualLensProposal(
          adaptiveVisualLensBody.latestProposal ??
            adaptiveVisualLensBody.latest_proposal ??
            adaptiveVisualLensBody.proposal ??
            null,
        );
      } else {
        setAdaptiveVisualLensProposal(null);
      }
      const earbudMicroDeckSourceId =
        audioTranscriptSourceIdRef.current ??
        audioTranscriptSourceId ??
        latestAudioTranscriptSourceId ??
        serverAudioTranscriptHistory.at(-1)?.source_id ??
        activeServerAudioTranscriptSource?.source_id ??
        `audio_transcript:${threadId}`;
      const earbudPresetParams = new URLSearchParams({
        sourceId: earbudMicroDeckSourceId,
        sourceKind: "audio_transcript",
        includePresets: "true",
      });
      const earbudMicroReasonerPromptPresetBody: MicroReasonerPromptPresetListRead = await fetch(
        `/api/helix/stage-play/micro-reasoner-prompt-preset?${earbudPresetParams.toString()}`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setEarbudMicroReasonerPromptPresets(Array.isArray(earbudMicroReasonerPromptPresetBody.presets) ? earbudMicroReasonerPromptPresetBody.presets : []);
      setActiveEarbudMicroReasonerPromptPreset(earbudMicroReasonerPromptPresetBody.activePreset ?? earbudMicroReasonerPromptPresetBody.active_preset ?? null);
      setEarbudMicroReasonerPrompts(
        Array.isArray(earbudMicroReasonerPromptPresetBody.prompts)
          ? earbudMicroReasonerPromptPresetBody.prompts
          : Array.isArray(earbudMicroReasonerPromptPresetBody.microReasonerPrompts)
            ? earbudMicroReasonerPromptPresetBody.microReasonerPrompts
            : [],
      );
      const earbudMailParams = new URLSearchParams({
        threadId,
        sourceId: earbudMicroDeckSourceId,
        view: "overview",
        includeConfig: "0",
        limit: "12",
      });
      const earbudMailBody: StagePlayLiveSourceMailRead = await fetch(
        `/api/helix/stage-play/live-source-mail?${earbudMailParams.toString()}`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setEarbudMicroReasonerRuns(
        Array.isArray(earbudMailBody.microReasonerRuns)
          ? earbudMailBody.microReasonerRuns
          : Array.isArray(earbudMailBody.micro_reasoner_runs)
            ? earbudMailBody.micro_reasoner_runs
            : [],
      );
      const documentPresetParams = new URLSearchParams({
        sourceId: activeDocumentMarkdownSourceId,
        sourceKind: "document_markdown",
        includePresets: "true",
      });
      const documentMicroReasonerPromptPresetBody: MicroReasonerPromptPresetListRead = await fetch(
        `/api/helix/stage-play/micro-reasoner-prompt-preset?${documentPresetParams.toString()}`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setDocumentMicroReasonerPromptPresets(Array.isArray(documentMicroReasonerPromptPresetBody.presets) ? documentMicroReasonerPromptPresetBody.presets : []);
      setActiveDocumentMicroReasonerPromptPreset(documentMicroReasonerPromptPresetBody.activePreset ?? documentMicroReasonerPromptPresetBody.active_preset ?? null);
      setDocumentMicroReasonerPrompts(
        Array.isArray(documentMicroReasonerPromptPresetBody.prompts)
          ? documentMicroReasonerPromptPresetBody.prompts
          : Array.isArray(documentMicroReasonerPromptPresetBody.microReasonerPrompts)
            ? documentMicroReasonerPromptPresetBody.microReasonerPrompts
            : [],
      );
      const documentMailParams = new URLSearchParams({
        threadId,
        sourceId: activeDocumentMarkdownSourceId,
        sourceKind: "document_markdown",
        view: "full",
        includeConfig: "0",
        limit: "12",
      });
      const documentMailBody: StagePlayLiveSourceMailRead = await fetch(
        `/api/helix/stage-play/live-source-mail?${documentMailParams.toString()}`,
      ).then((response) => response.ok ? response.json() : {}).catch(() => ({}));
      setDocumentMicroReasonerRuns(
        Array.isArray(documentMailBody.microReasonerRuns)
          ? documentMailBody.microReasonerRuns
          : Array.isArray(documentMailBody.micro_reasoner_runs)
            ? documentMailBody.micro_reasoner_runs
            : [],
      );
      setDocumentSourceMailItems(
        Array.isArray(documentMailBody.mailItems)
          ? documentMailBody.mailItems
          : Array.isArray(documentMailBody.mail_items)
            ? documentMailBody.mail_items
            : [],
      );
      setDocumentSourceWakeRequests(
        Array.isArray(documentMailBody.wakeRequests)
          ? documentMailBody.wakeRequests
          : Array.isArray(documentMailBody.wake_requests)
            ? documentMailBody.wake_requests
            : [],
      );
      setDocumentSourceWakeResults(
        Array.isArray(documentMailBody.wakeResults)
          ? documentMailBody.wakeResults
          : Array.isArray(documentMailBody.wake_results)
            ? documentMailBody.wake_results
            : [],
      );
      setDocumentSourceProcessedPackets(
        Array.isArray(documentMailBody.processedMailPackets)
          ? documentMailBody.processedMailPackets
          : Array.isArray(documentMailBody.processed_mail_packets)
            ? documentMailBody.processed_mail_packets
            : [],
      );
      setLastFetchError(null);
    } catch (error) {
      setLastFetchError(error instanceof Error ? error.message : "live_environment_refresh_failed");
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    const handleImageLensFrame = () => void refresh();
    window.addEventListener("helix:image-lens:visual-frame-sent", handleImageLensFrame);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("helix:image-lens:visual-frame-sent", handleImageLensFrame);
    };
  }, [activeDocumentMarkdownSourceId, threadId]);

  useEffect(() => {
    const selectionStillAvailable = visualShadeProfiles.some(
      (profile: StagePlayVisualObserverProfileV1) => profile.profileId === selectedVisualObserverProfileId,
    );
    if (selectionStillAvailable) return;
    const preferred = preferredVisualShadeProfileId(visualShadeProfiles, activeVisualObserverProfile);
    if (preferred) setSelectedVisualObserverProfileId(preferred);
  }, [activeVisualObserverProfile, selectedVisualObserverProfileId, visualShadeProfiles]);

  useEffect(() => {
    const selectionStillAvailable = microReasonerPromptPresets.some(
      (preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedMicroReasonerPromptPresetId,
    );
    if (selectionStillAvailable) return;
    const preferred = preferredMicroReasonerPresetId(microReasonerPromptPresets, activeMicroReasonerPromptPreset);
    if (preferred) setSelectedMicroReasonerPromptPresetId(preferred);
  }, [activeMicroReasonerPromptPreset, microReasonerPromptPresets, selectedMicroReasonerPromptPresetId]);

  useEffect(() => {
    const selectionStillAvailable = earbudMicroReasonerPromptPresets.some(
      (preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedEarbudMicroReasonerPromptPresetId,
    );
    if (selectionStillAvailable) return;
    const preferred = preferredMicroReasonerPresetId(earbudMicroReasonerPromptPresets, activeEarbudMicroReasonerPromptPreset);
    if (preferred) setSelectedEarbudMicroReasonerPromptPresetId(preferred);
  }, [activeEarbudMicroReasonerPromptPreset, earbudMicroReasonerPromptPresets, selectedEarbudMicroReasonerPromptPresetId]);

  useEffect(() => {
    const selectionStillAvailable = documentMicroReasonerPromptPresets.some(
      (preset: StagePlayMicroReasonerPromptPresetV1) => preset.presetId === selectedDocumentMicroReasonerPromptPresetId,
    );
    if (selectionStillAvailable) return;
    const preferred = preferredMicroReasonerPresetId(documentMicroReasonerPromptPresets, activeDocumentMicroReasonerPromptPreset);
    if (preferred) setSelectedDocumentMicroReasonerPromptPresetId(preferred);
  }, [activeDocumentMicroReasonerPromptPreset, documentMicroReasonerPromptPresets, selectedDocumentMicroReasonerPromptPresetId]);

  useEffect(() => {
    if (!selectedVisualObserverProfile) return;
    if (visualShadePromptBaseProfileId === selectedVisualObserverProfile.profileId) return;
    setVisualShadePromptDraft(selectedVisualObserverProfile.prompt);
    setVisualShadePromptBaseProfileId(selectedVisualObserverProfile.profileId);
  }, [selectedVisualObserverProfile, visualShadePromptBaseProfileId]);

  useEffect(() => {
    let cancelled = false;
    const adopt = async () => {
      try {
        const adopted = await adoptServerVisualProducerPolicies({
          threadId,
          roomId: environment?.room_id ?? null,
          environmentId: environment?.environment_id ?? null,
          postJson,
        });
        if (!cancelled && adopted > 0) {
          setLastActionStatus(`Visual scheduler adopted ${adopted} producer${adopted === 1 ? "" : "s"}.`);
        }
      } catch {
        // Adoption is opportunistic; source health shows concrete repair actions.
      }
    };
    void adopt();
    const interval = window.setInterval(() => void adopt(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [environment?.environment_id, environment?.room_id, threadId]);

  const setEnvironmentStatus = async (action: "pause" | "resume" | "stop") => {
    if (!environment) return;
    await postJson(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environment.environment_id)}/${action}`);
    await refresh();
  };

  const setSourceStatus = async (sourceId: string, action: "pause" | "resume" | "stop" | "reset-counters") => {
    await postJson(`/api/agi/situation/live-source/${encodeURIComponent(sourceId)}/${action}`);
    await refresh();
  };

  const setCommentaryCadence = async (cadence: LiveCommentaryCadence) => {
    if (!environment) return;
    await postJson("/api/agi/situation/live-commentary/session", {
      environment_id: environment.environment_id,
      cadence,
      status: cadence === "off" ? "paused" : "active",
    });
    await refresh();
  };

  const requestAgenticReview = async () => {
    if (!environment) return;
    await postJson("/api/agi/situation/live-agentic-review/request", {
      thread_id: threadId,
      environment_id: environment.environment_id,
      question: "Review the latest compact live environment state.",
      trigger: "manual_button",
    });
    await refresh();
  };

  const runSituationAcceptance = async () => {
    await postJson("/api/agi/situation/live-cognition/run-acceptance", {
      thread_id: threadId,
      scenario: "generic_visual_folder",
      situation_run_id: situationRuns.at(-1)?.situation_run_id ?? null,
    });
    await refresh();
  };

  const consumeArbitrationCandidate = async (candidateId: string) => {
    await postJson(`/api/agi/situation/live-cognition/arbitration-candidates/${encodeURIComponent(candidateId)}/consume`, {
      mode: "auto",
    });
    await refresh();
  };

  const checkSourceSignal = async () => {
    try {
      const response = await fetch("/api/agi/situation/world-event/sources");
      if (!response.ok) throw new Error(`source_signal_check_failed:${response.status}`);
      const body = await response.json();
      const sources = Array.isArray(body.sources)
        ? body.sources.filter((source: unknown): source is WorldEventSourceSeen => {
            if (!source || typeof source !== "object") return false;
            const record = source as Record<string, unknown>;
            return (
              typeof record.room_id === "string" &&
              typeof record.source_id === "string" &&
              typeof record.world_id === "string" &&
              typeof record.latest_ts === "string"
            );
          })
        : [];
      const minecraftSources = sources.filter(isMinecraftWorldSource);
      const source = minecraftSources[0] ?? null;
      const age = signalAgeMs(source);
      const checkedAt = new Date().toISOString();
      if (!source) {
        setSourceSignal({
          status: "missing",
          checkedAt,
          source: null,
          summary: "No matching world-event source has reached Helix since this server started.",
        });
        setLastActionStatus("No source signal detected. Check the configured endpoint or paste a regenerated tunnel URL.");
        return;
      }
      if (age !== null && age <= 120_000) {
        setSourceSignal({
          status: "live",
          checkedAt,
          source,
          summary: `Live signal from ${source.source_id}; latest ${source.latest_event_type} ${formatTime(source.latest_ts)}.`,
        });
        setLastActionStatus(`Source signal live: ${source.source_id}`);
        return;
      }
      setSourceSignal({
        status: "stale",
        checkedAt,
        source,
        summary: `Last signal from ${source.source_id} is stale; latest ${source.latest_event_type} ${formatTime(source.latest_ts)}.`,
      });
      setLastActionStatus("Source signal is stale. If your tunnel changed, paste the new endpoint into the source adapter config.");
    } catch (error) {
      setSourceSignal({
        status: "error",
        checkedAt: new Date().toISOString(),
        source: null,
        summary: error instanceof Error ? error.message : "plugin_signal_check_failed",
      });
      setLastActionStatus(error instanceof Error ? error.message : "plugin_signal_check_failed");
    }
  };

  const saveSourceConnection = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("helix.worldEventSourceEndpoint", sourceEndpoint.trim());
      window.localStorage.setItem("helix.worldEventSourceLabel", sourceLabel.trim() || "World-event source");
    }
    setSourceLabel(sourceLabel.trim() || "World-event source");
    setLastActionStatus("Saved source label and endpoint reminder locally. Update the source adapter config with this URL.");
  };

  const startMinecraftSourceMonitor = async () => {
    try {
      const source = sourceSignal.source;
      const response = await postJson("/api/agi/situation/live-answer-environment/start", {
        thread_id: threadId,
        objective: `Monitor ${sourceLabel.trim() || "an attached world-event source"}, build present-state hypotheses, and expose executable line checks.`,
        room_id: source?.room_id ?? "room:minecraft-minehut",
        source_ids: [source?.source_id ?? "source:minecraft-server"],
        world_id: source?.world_id ?? "minecraft:world",
        preset: "minecraft_run_monitor",
        mode: "active_companion",
        created_turn_id: `turn:minecraft-cortana-ui:${Date.now()}`,
      });
      const environmentId = response?.live_answer_environment?.environment_id ?? "environment";
      setLastActionStatus(`Started Minecraft source monitor: ${environmentId}`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "start_minecraft_source_monitor_failed");
    }
  };

  const toggleVisualCaptureRoute = (route: VisualCaptureRoute): void => {
    setVisualCaptureRoutes((current: VisualCaptureRoute[]) => {
      const selected = current.includes(route);
      const next = selected
        ? current.filter((entry: VisualCaptureRoute) => entry !== route)
        : [...current, route];
      return next;
    });
  };

  const requestDisplayStream = async (input: { includeAudio?: boolean } = {}): Promise<MediaStream> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("screen_capture_not_available_in_this_browser");
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: input.includeAudio
        ? {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as MediaTrackConstraints
        : false,
    });
  };

  const openImageLensPanel = (): void => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "image-lens" } }));
  };

  const sendSelectedVisualFrameToGptLive = (): void => {
    if (!selectedVisualFrameHistory) {
      setLastActionStatus("Select a captured frame before sending it to GPT Live.");
      return;
    }
    const outcome = requestHelixAskVisualFrameLivePromotion({
      imageDataUrl: selectedVisualFrameHistory.preview_data_url,
      sourceKind: "screen",
      sourceLabel: selectedVisualFrameHistory.crop_only ? "Selected Image Lens crop" : "Selected visual frame",
      detail: selectedVisualFrameHistory.crop_only ? "high" : "auto",
    });
    setLastActionStatus(outcome.ok
      ? outcome.code === "shared_room_visual_frame_queued"
        ? "Selected frame queued through the Shared GPT Live room visual lane."
        : `Selected frame sent to GPT Live (${outcome.receipt?.item_id ?? "accepted"}).`
      : outcome.code === "visual_input_consent_required"
        ? "Turn Vision On in GPT Live before sending a selected frame."
        : outcome.code === "live_runtime_unavailable"
          ? "Start GPT Live before sending a selected frame."
          : `GPT Live frame send blocked: ${outcome.code}.`);
  };

  const attachSelectedVisualFrameToNextAsk = (): void => {
    if (!selectedVisualFrameHistory) {
      setLastActionStatus("Select a captured frame before attaching it to the next Ask turn.");
      return;
    }
    const frameRef = selectedVisualFrameHistory.frame_id ?? selectedVisualFrameHistory.history_id;
    const outcome = requestHelixAskVisualFrameAttachmentPromotion({
      imageDataUrl: selectedVisualFrameHistory.preview_data_url,
      fileName: `visual-frame-${frameRef.replace(/[^a-z0-9._-]+/gi, "-")}.jpg`,
      evidenceRef: selectedVisualFrameHistory.evidence_id,
    });
    setLastActionStatus(outcome.ok
      ? "Selected frame added to the next Helix Ask turn. Review the attachment strip before sending."
      : outcome.detail ?? `Selected frame attachment blocked: ${outcome.code}.`);
  };

  const openSelectedVisualFrameInImageLens = (): void => {
    if (!selectedVisualFrameHistory) {
      setLastActionStatus("Select a captured frame before opening Image Lens.");
      return;
    }
    clearImageLensLiveSource();
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: selectedVisualFrameHistory.preview_data_url,
      sourceAttachmentId: `visual-frame:${selectedVisualFrameHistory.frame_id ?? selectedVisualFrameHistory.history_id}`,
      sourceKind: "image_attachment",
      pageNumber: null,
      sourceId: selectedVisualFrameHistory.source_id,
      evidenceId: selectedVisualFrameHistory.evidence_id,
      sourceRefHash: selectedVisualFrameHistory.preview_hash,
      mountedAt: new Date().toISOString(),
      viewMode: "fit_to_panel",
      coordinateSpace: "natural_image_px",
    });
    openImageLensPanel();
    setLastActionStatus("Selected frozen frame opened in Image Lens. Draw a crop and explicitly send it when ready.");
  };

  const ensureVisualSourceRegistered = async (): Promise<VisualSourceRead> => {
    const existing = visualLatest?.active_source ?? visualLatest?.source ?? null;
    if (existing) return existing;
    const response = await postJson("/api/agi/situation/visual-source/start", {
      thread_id: threadId,
      room_id: environment?.room_id ?? null,
      capture_mode: "manual",
      source_surface: "minecraft_client_window",
      status: "permission_required",
      raw_image_storage_policy: "ephemeral",
    });
    const source = response?.source ?? response?.receipt?.source ?? null;
    if (!source?.source_id) {
      throw new Error("visual_source_registration_failed");
    }
    await refresh();
    return source as VisualSourceRead;
  };

  const grantVisualCapture = async () => {
    let stream: MediaStream | null = null;
    let ownsStream = false;
    try {
      const source = await ensureVisualSourceRegistered();
      stream = getActiveVisualFrameStream(source.source_id) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
      if (!stream) {
        stream = await requestDisplayStream();
        ownsStream = true;
      }
      const scheduledCadenceMs = await readScheduledVisualCadenceMs(source.source_id);
      if (scheduledCadenceMs) {
        const result = await startVisualFrameProducerInterval({
          sourceId: source.source_id,
          threadId,
          roomId: environment?.room_id ?? null,
          environmentId: environment?.environment_id ?? null,
          cadenceMs: scheduledCadenceMs,
          stream,
          postJson,
          preserveExistingStream: !ownsStream,
        });
        stream = null;
        setLastActionStatus(`Visual interval active every ${Math.round(scheduledCadenceMs / 1000)}s. ${result.summary}`);
      } else {
        const result = await runVisualFrameProducerOnce({
          sourceId: source.source_id,
          threadId,
          roomId: environment?.room_id ?? null,
          environmentId: environment?.environment_id ?? null,
          stream,
          postJson,
        });
        if (ownsStream) stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        stream = null;
        setLastActionStatus(`Visual capture active; first frame analyzed. ${result.summary}`);
      }
      await refresh();
    } catch (error) {
      if (ownsStream) stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLastActionStatus(error instanceof Error ? error.message : "visual_capture_permission_failed");
    }
  };

  const readScheduledVisualCadenceMs = async (sourceId: string): Promise<number | null> => {
    const response = await fetch(`/api/agi/situation/live-source/producers?thread_id=${encodeURIComponent(threadId)}`);
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const producer = Array.isArray(body?.producers)
      ? body.producers.find((entry: any) => entry?.source_id === sourceId && entry?.modality === "visual_frame")
      : null;
    return producer?.capture_mode === "interval" && typeof producer?.cadence_ms === "number"
      ? producer.cadence_ms
      : null;
  };

  const startVisualInterval = async (cadenceMs: number) => {
    let stream: MediaStream | null = null;
    let ownsStream = false;
    try {
      const source = await ensureVisualSourceRegistered();
      stream = getActiveVisualFrameStream(source.source_id) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
      if (!stream) {
        stream = await requestDisplayStream();
        ownsStream = true;
      }
      const result = await startVisualFrameProducerInterval({
        sourceId: source.source_id,
        threadId,
        roomId: environment?.room_id ?? null,
        environmentId: environment?.environment_id ?? null,
        cadenceMs,
        stream,
        postJson,
        preserveExistingStream: !ownsStream,
      });
      stream = null;
      setLastActionStatus(`Visual interval active every ${Math.round(cadenceMs / 1000)}s. ${result.summary}`);
      await refresh();
    } catch (error) {
      if (ownsStream) stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLastActionStatus(error instanceof Error ? error.message : "visual_interval_start_failed");
    }
  };

  const routeVisualCaptureToImageLensWithStream = async (source: VisualSourceRead, stream: MediaStream): Promise<void> => {
    await postJson("/api/agi/situation/visual-source/permission-granted", {
      source_id: source.source_id,
      client_stream_confirmed: true,
    });
    await postJson("/api/agi/situation/source/heartbeat", {
      source_id: source.source_id,
      thread_id: threadId,
      room_id: environment?.room_id ?? null,
      modality: "visual_frame",
      status: "active",
      ts: new Date().toISOString(),
    }).catch(() => null);
    useVisualSourceCaptureStore.getState().upsertProducer({
      source_id: source.source_id,
      thread_id: threadId,
      environment_id: environment?.environment_id ?? null,
      pipeline_id: null,
      stream_active: true,
      interval_active: false,
      track_ready_state: "live",
      capture_mode: "manual",
      cadence_ms: null,
      last_heartbeat_at: new Date().toISOString(),
      last_error: null,
    });
    const firstTrack = stream.getVideoTracks()[0] ?? stream.getTracks()[0] ?? null;
    firstTrack?.addEventListener("ended", () => {
      useVisualSourceCaptureStore.getState().patchProducer(source.source_id, {
        stream_active: false,
        interval_active: false,
        track_ready_state: "ended",
        last_heartbeat_at: new Date().toISOString(),
      });
      clearImageLensLiveSource(source.source_id);
    }, { once: true });
    setImageLensLiveSource({
      sourceId: source.source_id,
      threadId,
      environmentId: environment?.environment_id ?? null,
      pipelineId: null,
      roomId: environment?.room_id ?? null,
      stream,
      streamActive: true,
      captureMode: "screen_share_lens",
      latestFrameDataUrl: null,
      lastFrameAt: null,
      createdAt: new Date().toISOString(),
    });
    openImageLensPanel();
  };

  const routeVisualCaptureToImageLens = async () => {
    let stream: MediaStream | null = null;
    try {
      const source = await ensureVisualSourceRegistered();
      stream = getActiveVisualFrameStream(source.source_id) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
      if (!stream) stream = await requestDisplayStream();
      await routeVisualCaptureToImageLensWithStream(source, stream);
      setLastActionStatus(`Screen share routed to Image Lens. Raw frames will not be summarized until a crop is sent for ${source.source_id}.`);
      await refresh();
    } catch (error) {
      stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLastActionStatus(error instanceof Error ? error.message : "visual_capture_image_lens_route_failed");
    }
  };

  const startAudioTranscriptRoute = async (input: {
    stream: MediaStream;
    chunkMs: number;
    stopStreamOnStop: boolean;
  }): Promise<string> => {
    const sourceId = audioTranscriptSourceIdRef.current ?? `audio_transcript:${threadId}`;
    audioTranscriptSessionRef.current?.stop();
    audioTranscriptSessionRef.current = null;
    const audioTrackCount = input.stream.getAudioTracks().length;
    if (audioTrackCount === 0) {
      audioTranscriptSourceIdRef.current = null;
      setAudioTranscriptSourceId(null);
      setAudioTranscriptStatus("error");
      setAudioTranscriptStatusDetail("The browser share stream has no audio track. Start selected live sources with Audio transcript checked, choose a Chrome tab, and enable tab audio in the share dialog.");
      throw new Error("display_audio_track_missing");
    }
    audioTranscriptSourceIdRef.current = sourceId;
    setAudioTranscriptSourceId(sourceId);
    setAudioTranscriptChunkMs(input.chunkMs);
    setAudioTranscriptStatus("requesting_permission");
    setAudioTranscriptStatusDetail(`Display audio route requested with ${audioTrackCount} audio track${audioTrackCount === 1 ? "" : "s"}.`);
    await postJson("/api/agi/situation/audio-source/permission-granted", {
      source_id: sourceId,
      thread_id: threadId,
      room_id: environment?.room_id ?? null,
      ts: new Date().toISOString(),
    });
    await postAudioTranscriptLiveSourceDescriptor({
      postJson,
      sourceId,
      threadId,
      environmentId: environment?.environment_id ?? null,
      currentState: "active_interval",
      cadenceMs: input.chunkMs,
      stream: input.stream,
    });
    let sessionCaptureId: string | null = null;
    const session = await startDisplayAudioSituationSession({
      roomId: environment?.room_id ?? "room:live-answer",
      sourceId,
      environmentId: environment?.environment_id ?? null,
      threadId,
      stream: input.stream,
      stopStreamOnStop: input.stopStreamOnStop,
      chunkMs: input.chunkMs,
      onEvent: () => undefined,
      onTranscriptChunk: async (chunk: DisplayAudioTranscriptChunk) => {
        setAudioTranscriptStatus("transcribing");
        setAudioTranscriptStatusDetail(`Received audio chunk ${chunk.chunkIndex + 1}; posting transcript to Live Source.`);
        const transcript = chunk.event.text?.trim() ?? "";
        if (!transcript) {
          setAudioTranscriptStatus("listening");
          setAudioTranscriptStatusDetail("Audio chunk arrived, but no transcript text was produced yet.");
          return;
        }
        const response = await postJson("/api/agi/situation/audio-source/transcript-chunk", {
          source_id: sourceId,
          thread_id: threadId,
          room_id: environment?.room_id ?? null,
          environment_id: environment?.environment_id ?? null,
          transcript,
          transcript_is_final: true,
          direct_address_classification: "unclassified",
          evidence_refs: chunk.event.evidence_refs,
          chunk_index: chunk.chunkIndex,
          capture_session_id: chunk.captureSessionId,
          capture_source: chunk.source,
          duration_ms: chunk.durationMs,
          from_ts: chunk.fromTs,
          to_ts: chunk.toTs,
          ts: chunk.toTs,
        });
        const liveSourceEvent = readRecord(response?.live_source_event);
        const liveSourceChunk = readRecord(response?.live_source_chunk) as HelixLiveSourceChunk | null;
        const liveSourceAnalysisJob = readRecord(response?.live_source_analysis_job);
        const latestObservationRefs = [
          response?.live_source_event?.event_id,
          response?.live_source_chunk?.chunk_id,
          response?.live_source_analysis_job?.job_id,
        ].filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
        setAudioTranscriptHistory((current: AudioTranscriptHistoryItem[]) => pruneAudioTranscriptHistory([
          ...current,
          {
            history_id: `audio_chunk:${liveSourceChunk?.chunk_id ?? liveSourceEvent?.event_id ?? chunk.captureSessionId}:${chunk.chunkIndex}`,
            source_id: sourceId,
            event_id: typeof liveSourceEvent?.event_id === "string" ? liveSourceEvent.event_id : null,
            chunk_id: liveSourceChunk?.chunk_id ?? null,
            analysis_job_id: typeof liveSourceAnalysisJob?.job_id === "string" ? liveSourceAnalysisJob.job_id : null,
            transcript,
            compact_summary: liveSourceChunk?.compact_summary ?? `Transcript chunk: ${transcript.slice(0, 160)}`,
            evidence_refs: readStringList(liveSourceChunk?.evidence_refs).length
              ? readStringList(liveSourceChunk?.evidence_refs)
              : chunk.event.evidence_refs,
            chunk_index: chunk.chunkIndex,
            duration_ms: liveSourceChunk?.duration_ms ?? chunk.durationMs,
            from_ts: chunk.fromTs,
            to_ts: chunk.toTs,
            captured_at: chunk.toTs,
            source_label: "Live Source audio chunk",
          },
        ]));
        await postAudioTranscriptLiveSourceDescriptor({
          postJson,
          sourceId,
          threadId,
          environmentId: environment?.environment_id ?? null,
          currentState: "active_interval",
          cadenceMs: input.chunkMs,
          stream: input.stream,
          latestObservationRefs,
        });
        setAudioTranscriptStatus("listening");
        setAudioTranscriptStatusDetail(`Latest transcript chunk recorded for ${sourceId}.`);
      },
      onError: (error: Error) => {
        setAudioTranscriptStatus("error");
        setAudioTranscriptStatusDetail(error.message || "audio_transcript_capture_failed");
        setLastActionStatus(error.message || "audio_transcript_capture_failed");
      },
      onStop: () => {
        if (!sessionCaptureId || audioTranscriptSessionRef.current?.captureSessionId === sessionCaptureId) {
          audioTranscriptSessionRef.current = null;
          setAudioTranscriptSourceId(null);
          setAudioTranscriptStatus("idle");
          setAudioTranscriptStatusDetail("Audio transcript is not running.");
        }
        void postJson("/api/agi/situation/audio-source/stop", {
          source_id: sourceId,
          thread_id: threadId,
          room_id: environment?.room_id ?? null,
          ts: new Date().toISOString(),
        }).catch(() => null);
        void postAudioTranscriptLiveSourceDescriptor({
          postJson,
          sourceId,
          threadId,
          environmentId: environment?.environment_id ?? null,
          currentState: "stopped",
          cadenceMs: input.chunkMs,
          stream: input.stream,
        });
      },
    });
    sessionCaptureId = session.captureSessionId;
    audioTranscriptSessionRef.current = session;
    setAudioTranscriptStatus("listening");
    setAudioTranscriptStatusDetail(`Listening for shared tab audio; transcript chunks post every ${Math.round(input.chunkMs / 1000)}s.`);
    return sourceId;
  };

  const startVisualCaptureByRoute = async () => {
    if (selectedRouteCount === 0) {
      setLastActionStatus("Select at least one screen-share route.");
      return;
    }
    let stream: MediaStream | null = null;
    let ownsStream = false;
    try {
      const needsVisualSource = routeLiveAnswerVisual || routeImageLens;
      const source = needsVisualSource ? await ensureVisualSourceRegistered() : null;
      const existingStream = source
        ? getActiveVisualFrameStream(source.source_id) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null
        : null;
      stream = existingStream && (!routeAudioTranscript || existingStream.getAudioTracks().length > 0)
        ? existingStream
        : await requestDisplayStream({ includeAudio: routeAudioTranscript });
      ownsStream = stream !== existingStream;
      const scheduledCadenceMs = source ? await readScheduledVisualCadenceMs(source.source_id) : null;
      const alignedVisualCadenceMs = routeLiveAnswerVisual
        ? scheduledCadenceMs ?? visualProducerState?.cadence_ms ?? null
        : null;
      const sharedCadenceMs = alignedVisualCadenceMs ?? AUDIO_TRANSCRIPT_DEFAULT_CHUNK_MS;
      const statusParts: string[] = [];

      if (routeAudioTranscript) {
        const audioSourceId = await startAudioTranscriptRoute({
          stream,
          chunkMs: sharedCadenceMs,
          stopStreamOnStop: !routeLiveAnswerVisual && !routeImageLens,
        });
        statusParts.push(`audio transcript chunks every ${Math.round(sharedCadenceMs / 1000)}s from ${audioSourceId}`);
      }

      if (routeLiveAnswerVisual && source) {
        if (scheduledCadenceMs) {
          const result = await startVisualFrameProducerInterval({
            sourceId: source.source_id,
            threadId,
            roomId: environment?.room_id ?? null,
            environmentId: environment?.environment_id ?? null,
            cadenceMs: scheduledCadenceMs,
            stream,
            postJson,
            preserveExistingStream: routeAudioTranscript,
          });
          statusParts.push(`visual interval every ${Math.round(scheduledCadenceMs / 1000)}s. ${result.summary}`);
        } else {
          const result = await runVisualFrameProducerOnce({
            sourceId: source.source_id,
            threadId,
            roomId: environment?.room_id ?? null,
            environmentId: environment?.environment_id ?? null,
            stream,
            postJson,
          });
          statusParts.push(`visual first frame analyzed. ${result.summary}`);
        }
      }

      if (routeImageLens && source) {
        await routeVisualCaptureToImageLensWithStream(source, stream);
        statusParts.push(`Image Lens is using ${source.source_id}; raw frames wait for crop submission`);
      }

      if (ownsStream && !routeAudioTranscript && !routeImageLens && !scheduledCadenceMs) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
      stream = null;
      setLastActionStatus(`Screen share routed: ${statusParts.join(" | ")}`);
      await refresh();
    } catch (error) {
      if (routeAudioTranscript && error instanceof Error && error.message === "display_audio_track_missing") {
        setLastActionStatus("Audio transcript could not start because the shared stream did not include tab audio.");
      }
      if (ownsStream) stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLastActionStatus((current) =>
        current && error instanceof Error && error.message === "display_audio_track_missing"
          ? current
          : error instanceof Error ? error.message : "screen_share_route_failed");
    }
  };

  const applyVisualObserverProfile = async (profile: StagePlayVisualObserverProfileV1 | null) => {
    if (!profile) {
      setLastActionStatus("Visual observer shade preset is not available.");
      return;
    }
    if (profile.profileId.includes(":session-custom-")) {
      setLastActionStatus("This custom shade is saved only in this panel session. Use Save As to create a profile before applying it to visual capture.");
      return;
    }
    try {
      const source = await ensureVisualSourceRegistered();
      const response = await postJson("/api/helix/stage-play/visual-observer-profile/apply", {
        profileId: profile.profileId,
        sourceIds: [source.source_id],
      });
      const applied = response?.profile as StagePlayVisualObserverProfileV1 | undefined;
      setLastActionStatus(`${applied?.title ?? profile.title} shade applied to ${source.source_id}. Future visual frames will use this observer prompt.`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "visual_observer_profile_apply_failed");
    }
  };

  const evaluateAdaptiveVisualLens = async () => {
    if (!adaptiveVisualLensSelected) {
      setLastActionStatus("Select the Adaptive Visual Lens Controller preset before evaluating an adaptive shade.");
      return;
    }
    if (!activeVisualSourceId) {
      setLastActionStatus("Adaptive lens evaluation needs an active visual source.");
      return;
    }
    setAdaptiveVisualLensRunning(true);
    setAdaptiveVisualLensError(null);
    try {
      const response: AdaptiveVisualLensRead = await postJson("/api/helix/stage-play/adaptive-visual-lens/evaluate", {
        threadId,
        sourceId: activeVisualSourceId,
        limit: 5,
      });
      const proposal = response?.proposal ?? response?.latestProposal ?? response?.latest_proposal ?? null;
      setAdaptiveVisualLensProposal(proposal);
      setLastActionStatus(
        proposal
          ? `Adaptive lens evaluated ${proposal.recognizedSubject}; ${proposal.decision}.`
          : "Adaptive lens evaluation returned no proposal.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "adaptive_visual_lens_evaluate_failed";
      setAdaptiveVisualLensError(message);
      setLastActionStatus(message);
    } finally {
      setAdaptiveVisualLensRunning(false);
    }
  };

  const applyAdaptiveVisualLensSuggestion = async () => {
    if (!adaptiveVisualLensCanApply || !adaptiveVisualLensProposal || !activeVisualSourceId) {
      setLastActionStatus("Adaptive lens suggestion is not ready to apply.");
      return;
    }
    setAdaptiveVisualLensRunning(true);
    setAdaptiveVisualLensError(null);
    try {
      const response: AdaptiveVisualLensRead = await postJson("/api/helix/stage-play/adaptive-visual-lens/apply", {
        proposalId: adaptiveVisualLensProposal.proposalId,
        sourceId: activeVisualSourceId,
      });
      const result = response?.result ?? null;
      const profile = result?.profile ?? response?.profile ?? null;
      if (profile?.profileId) {
        setSelectedVisualObserverProfileId(profile.profileId);
        setVisualShadePromptDraft(profile.prompt);
        setVisualShadePromptBaseProfileId(profile.profileId);
      }
      setLastActionStatus(
        result?.applied || response?.applied
          ? `${profile?.title ?? "Adaptive shade"} applied to ${activeVisualSourceId}.`
          : `Adaptive lens apply blocked: ${result?.reason ?? response?.reason ?? "unknown"}.`,
      );
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "adaptive_visual_lens_apply_failed";
      setAdaptiveVisualLensError(message);
      setLastActionStatus(message);
    } finally {
      setAdaptiveVisualLensRunning(false);
    }
  };

  const applyMicroReasonerPromptPreset = async (preset: StagePlayMicroReasonerPromptPresetV1 | null) => {
    if (!preset) {
      setLastActionStatus("Micro-reasoner prompt preset is not available.");
      return;
    }
    try {
      const source = await ensureVisualSourceRegistered();
      const response = await postJson("/api/helix/stage-play/micro-reasoner-prompt-preset/apply", {
        presetId: preset.presetId,
        sourceIds: [source.source_id],
        sourceKind: "visual_frame",
      });
      const applied = response?.preset as StagePlayMicroReasonerPromptPresetV1 | undefined;
      setLastActionStatus(`${applied?.title ?? preset.title} MicroDeck preset applied to ${source.source_id}. Future mail-loop packets will use this prompt deck.`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "micro_reasoner_prompt_preset_apply_failed");
    }
  };

  const applyEarbudMicroReasonerPromptPreset = async (preset: StagePlayMicroReasonerPromptPresetV1 | null) => {
    if (!preset) {
      setLastActionStatus("Earbud MicroDeck preset is not available.");
      return;
    }
    try {
      const sourceId = activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`;
      const response = await postJson("/api/helix/stage-play/micro-reasoner-prompt-preset/apply", {
        presetId: preset.presetId,
        sourceIds: [sourceId],
        sourceKind: "audio_transcript",
      });
      const applied = response?.preset as StagePlayMicroReasonerPromptPresetV1 | undefined;
      setAudioTranscriptSourceId(sourceId);
      audioTranscriptSourceIdRef.current = sourceId;
      setLastActionStatus(`${applied?.title ?? preset.title} earbud deck applied to ${sourceId}. Future audio transcript chunks will use this prompt deck.`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "earbud_micro_reasoner_prompt_preset_apply_failed");
    }
  };

  const applyDocumentMicroReasonerPromptPreset = async (preset: StagePlayMicroReasonerPromptPresetV1 | null) => {
    if (!preset) {
      setLastActionStatus("Document Markdown MicroDeck preset is not available.");
      return;
    }
    try {
      const response = await postJson("/api/helix/stage-play/micro-reasoner-prompt-preset/apply", {
        presetId: preset.presetId,
        sourceIds: [activeDocumentMarkdownSourceId],
        sourceKind: "document_markdown",
      });
      const applied = response?.preset as StagePlayMicroReasonerPromptPresetV1 | undefined;
      setLastActionStatus(`${applied?.title ?? preset.title} document deck applied to ${activeDocumentMarkdownSourceId}. Future visible document Markdown packets will use this prompt deck.`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "document_micro_reasoner_prompt_preset_apply_failed");
    }
  };

  const saveVisualObserverPromptAsCustom = async () => {
    const prompt = visualShadePromptDraft.trim();
    if (!prompt) {
      setLastActionStatus("Custom shade prompt cannot be empty.");
      return;
    }
    const slot = nextVisualShadeCustomSlot(visualShadeProfiles);
    const title = `Custom ${slot}`;
    try {
      const response = await postJson("/api/helix/stage-play/visual-observer-profile", {
        title,
        domain: "custom",
        subjectCategory: "Custom",
        subject: title,
        prompt,
        outputMode: selectedVisualObserverProfile?.outputMode ?? "semi_structured_json",
      });
      const profile = response?.profile as StagePlayVisualObserverProfileV1 | undefined;
      if (!profile?.profileId) throw new Error("custom_visual_observer_profile_save_missing_profile");
      setSelectedVisualObserverProfileId(profile.profileId);
      setVisualShadePromptDraft(profile.prompt);
      setVisualShadePromptBaseProfileId(profile.profileId);
      setLastActionStatus(`${profile.title} saved as a custom shade. Apply it when you want future visual frames to use this observer prompt.`);
      await refresh();
    } catch (error) {
      const sessionProfile = buildSessionVisualObserverProfile({
        slot,
        prompt,
        baseProfile: selectedVisualObserverProfile,
      });
      setSessionVisualObserverProfiles((current: StagePlayVisualObserverProfileV1[]) => [...current, sessionProfile]);
      setSelectedVisualObserverProfileId(sessionProfile.profileId);
      setVisualShadePromptDraft(sessionProfile.prompt);
      setVisualShadePromptBaseProfileId(sessionProfile.profileId);
      setLastActionStatus(`Saved ${sessionProfile.title} in this panel session only. Profile save failed: ${error instanceof Error ? error.message : "custom_visual_observer_profile_save_failed"}`);
    }
  };

  const pauseVisualInterval = async () => {
    const sourceId = activeVisualSourceId;
    if (!sourceId) {
      setLastActionStatus("No visual source is registered.");
      return;
    }
    const stream = getActiveVisualFrameStream(sourceId) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
    const track = stream?.getVideoTracks()[0] ?? stream?.getTracks()[0] ?? null;
    stopVisualFrameProducerInterval(sourceId, { stopStream: false });
    await postJson("/api/agi/situation/live-source/producer/heartbeat", {
      source_id: sourceId,
      thread_id: threadId,
      environment_id: environment?.environment_id ?? null,
      client_stream_confirmed: Boolean(track && track.readyState !== "ended"),
      status: "paused",
      ts: new Date().toISOString(),
    }).catch(() => null);
    setLastActionStatus(track && track.readyState !== "ended"
      ? "Paused visual interval capture; browser stream is still shared for resume. Use Stop sharing to end the Chrome capture."
      : "Paused visual interval capture; stream is no longer available.");
    await refresh();
  };

  const stopVisualSharing = async () => {
    const sourceId = activeVisualSourceId;
    const audioSourceId = activeAudioTranscriptSourceId;
    if (!sourceId && !audioSourceId) {
      setLastActionStatus("No visual or audio transcript source is registered.");
      return;
    }
    audioTranscriptSessionRef.current?.stop();
    audioTranscriptSessionRef.current = null;
    if (audioSourceId) {
      await postJson("/api/agi/situation/audio-source/stop", {
        source_id: audioSourceId,
        thread_id: threadId,
        room_id: environment?.room_id ?? null,
        ts: new Date().toISOString(),
      }).catch(() => null);
      audioTranscriptSourceIdRef.current = null;
      setAudioTranscriptSourceId(null);
    }
    if (!sourceId) {
      setLastActionStatus("Stopped audio transcript sharing.");
      await refresh();
      return;
    }
    stopVisualFrameProducerInterval(sourceId, { stopStream: true });
    if (imageLensLiveSource?.sourceId === sourceId) {
      imageLensLiveSource.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    await postJson("/api/agi/situation/live-source/producer/heartbeat", {
      source_id: sourceId,
      thread_id: threadId,
      environment_id: environment?.environment_id ?? null,
      client_stream_confirmed: false,
      status: "stopped",
      ts: new Date().toISOString(),
    }).catch(() => null);
    await setSourceStatus(sourceId, "stop").catch(() => null);
    clearImageLensLiveSource(sourceId);
    setLastActionStatus(audioSourceId
      ? "Stopped visual sharing, interval capture, and audio transcript chunks. Restart screen share to resume sources."
      : "Stopped visual sharing and interval capture. Restart visual capture to resume frames.");
    await refresh();
  };

  const captureVisualFrameNow = async () => {
    let stream: MediaStream | null = null;
    let ownsStream = false;
    try {
      const source = await ensureVisualSourceRegistered();
      const sourceId = source.source_id;
      stream = getActiveVisualFrameStream(sourceId) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
      if (!stream) {
        stream = await requestDisplayStream();
        ownsStream = true;
      }
      const result = await runVisualFrameProducerOnce({
        sourceId,
        threadId,
        roomId: environment?.room_id ?? null,
        environmentId: environment?.environment_id ?? null,
        stream,
        postJson,
      });
      if (ownsStream) stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      stream = null;
      setLastActionStatus(`Captured, analyzed, and aligned one visual frame. ${result.summary}`);
      await refresh();
    } catch (error) {
      if (ownsStream) stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLastActionStatus(error instanceof Error ? error.message : "visual_capture_failed");
    }
  };

  const runVisualFrameActionReplayAnalysis = async (input: {
    frame: VisualSourceCaptureFrameHistoryItem;
    profile: StagePlayVisualObserverProfileV1;
    replayRequestId?: string | null;
  }): Promise<VisualFrameReplayResult> => {
    const profileIsSessionOnly = input.profile.profileId.includes(":session-custom-");
    const response = await postJson("/api/agi/situation/visual-frame/analyze", {
      thread_id: threadId,
      room_id: environment?.room_id ?? null,
      source_id: input.frame.source_id || activeVisualSourceId,
      environment_id: environment?.environment_id ?? null,
      capture_mode: "manual",
      image_data_url: input.frame.preview_data_url,
      mime_type: "image/jpeg",
      prompt: input.profile.prompt,
      visual_observer_profile_id: profileIsSessionOnly ? undefined : input.profile.profileId,
      related_event_refs: [
        input.frame.frame_id,
        input.frame.evidence_id,
      ].filter((ref): ref is string => Boolean(ref)),
      objective: `Action replay of ${input.frame.frame_id ?? "selected visual frame"} with ${input.profile.title}.`,
    });
    const evidence = response?.evidence && typeof response.evidence === "object"
      ? response.evidence as Record<string, unknown>
      : null;
    const summary = typeof evidence?.summary === "string" && evidence.summary.trim()
      ? evidence.summary.trim()
      : "Action replay completed without a compact summary.";
    const replayResult: VisualFrameReplayResult = {
      replayed_at: new Date().toISOString(),
      source_frame_id: input.frame.frame_id,
      replay_frame_id: typeof evidence?.frame_id === "string" ? evidence.frame_id : null,
      evidence_id: typeof evidence?.evidence_id === "string" ? evidence.evidence_id : null,
      shade_title: input.profile.title,
      visual_prompt_hash: typeof evidence?.visual_prompt_hash === "string" ? evidence.visual_prompt_hash : null,
      summary,
    };
    if (input.replayRequestId) {
      await postJson("/api/agi/situation/visual-frame/replay/result", {
        replay_request_id: input.replayRequestId,
        thread_id: threadId,
        source_id: input.frame.source_id || activeVisualSourceId,
        source_frame_history_id: input.frame.history_id,
        source_frame_id: input.frame.frame_id,
        replay_frame_id: replayResult.replay_frame_id,
        evidence_id: replayResult.evidence_id,
        shade_profile_id: input.profile.profileId,
        shade_title: input.profile.title,
        visual_prompt_hash: replayResult.visual_prompt_hash,
        summary,
        status: "completed",
      });
    }
    return replayResult;
  };

  const replaySelectedVisualFrame = async () => {
    if (!selectedVisualFrameHistory) {
      setLastActionStatus("Select a captured frame before running action replay.");
      return;
    }
    if (!selectedVisualObserverProfile) {
      setLastActionStatus("Select a visual shade before running action replay.");
      return;
    }
    const sourceId = selectedVisualFrameHistory.source_id || activeVisualSourceId;
    if (!sourceId) {
      setLastActionStatus("Action replay needs a visual source reference.");
      return;
    }
    setVisualFrameReplayRunning(true);
    try {
      const replayResult = await runVisualFrameActionReplayAnalysis({
        frame: selectedVisualFrameHistory,
        profile: selectedVisualObserverProfile,
      });
      setVisualFrameReplayResult(replayResult);
      setLastActionStatus(`Action replay analyzed selected frame with ${selectedVisualObserverProfile.title}. ${replayResult.summary}`);
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "visual_action_replay_failed");
    } finally {
      setVisualFrameReplayRunning(false);
    }
  };

  useEffect(() => {
    if (!activeVisualSourceId) return;
    let cancelled = false;
    const fulfillPendingReplayRequests = async () => {
      const query = new URLSearchParams({
        thread_id: threadId,
        source_id: activeVisualSourceId,
        limit: "10",
      });
      const response = await fetch(`/api/agi/situation/visual-frame/replay/pending?${query.toString()}`).catch(() => null);
      if (!response?.ok) return;
      const body = await response.json().catch(() => null) as { replay_requests?: HelixVisualFrameActionReplayRequest[] } | null;
      const requests = Array.isArray(body?.replay_requests) ? body.replay_requests : [];
      for (const request of requests) {
        if (cancelled || visualReplayJobsInFlightRef.current.has(request.replay_request_id)) continue;
        visualReplayJobsInFlightRef.current.add(request.replay_request_id);
        try {
          const frames = visualReplayFramesForRequest(request);
          const shadeIds = request.shade_profile_ids.length
            ? request.shade_profile_ids
            : selectedVisualObserverProfile?.profileId
              ? [selectedVisualObserverProfile.profileId]
              : [];
          const profiles = shadeIds
            .map((profileId: string) => visualShadeProfiles.find((profile: StagePlayVisualObserverProfileV1) => profile.profileId === profileId) ?? null)
            .filter((profile): profile is StagePlayVisualObserverProfileV1 => Boolean(profile));
          if (!frames.length || !profiles.length) {
            const failedShadeIds = shadeIds.length ? shadeIds : ["missing_shade_profile"];
            for (const shadeId of failedShadeIds) {
              await postJson("/api/agi/situation/visual-frame/replay/result", {
                replay_request_id: request.replay_request_id,
                thread_id: threadId,
                source_id: request.source_id,
                shade_profile_id: shadeId,
                summary: !frames.length
                  ? "Visual action replay could not run because the requested frames are no longer in the local carousel."
                  : "Visual action replay could not run because the requested shade profile is not loaded in the panel.",
                status: "failed",
                failure_reason: !frames.length ? "missing_client_frames" : "missing_shade_profile",
              }).catch(() => null);
            }
            continue;
          }
          let lastReplayResult: VisualFrameReplayResult | null = null;
          for (const frame of frames) {
            for (const profile of profiles) {
              if (cancelled) return;
              lastReplayResult = await runVisualFrameActionReplayAnalysis({
                frame,
                profile,
                replayRequestId: request.replay_request_id,
              });
            }
          }
          if (lastReplayResult && !cancelled) {
            setVisualFrameReplayResult(lastReplayResult);
            setLastActionStatus(`Completed requested visual action replay ${request.replay_request_id}. ${lastReplayResult.summary}`);
          }
        } catch (error) {
          await postJson("/api/agi/situation/visual-frame/replay/result", {
            replay_request_id: request.replay_request_id,
            thread_id: threadId,
            source_id: request.source_id,
            summary: error instanceof Error ? error.message : "visual_action_replay_client_failed",
            status: "failed",
            failure_reason: "client_replay_failed",
          }).catch(() => null);
        } finally {
          visualReplayJobsInFlightRef.current.delete(request.replay_request_id);
        }
      }
    };
    void fulfillPendingReplayRequests();
    const interval = window.setInterval(() => void fulfillPendingReplayRequests(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeVisualSourceId, selectedVisualObserverProfile?.profileId, threadId, visualFrameHistory, visualShadeProfiles]);

  const planLineChecks = async () => {
    try {
      const response = await postJson("/api/agi/situation/live-line-tool-requests/plan", {
        thread_id: threadId,
        environment_id: environment?.environment_id,
      });
      setLastActionStatus(`Planned ${response?.request_count ?? 0} line checks.`);
      setActiveTab("line_checks");
      await refresh();
    } catch (error) {
      setLastActionStatus(error instanceof Error ? error.message : "plan_line_checks_failed");
    }
  };

  const runLineCheck = async (request: HelixLiveLineToolRequest) => {
    await postJson("/api/agi/situation/live-line-tool-request/run", {
      thread_id: request.thread_id,
      request_id: request.request_id,
      room_id: environment?.room_id ?? undefined,
      source_id: environment?.source_ids?.[0] ?? undefined,
    });
    await refresh();
  };

  const runWorkerLane = async (lane: HelixLiveWorkerLane) => {
    await postJson(`/api/agi/situation/live-workers/${encodeURIComponent(lane.worker_id)}/run`, {
      trigger_reason: "manual_ui",
    });
    await refresh();
  };

  const runDueWorkers = async () => {
    await postJson("/api/agi/situation/live-workers/run-due", {
      thread_id: threadId,
      environment_id: environment?.environment_id ?? null,
      trigger_reason: "manual_ui_due",
      max_runs: 4,
    });
    await refresh();
  };

  return (
    <section className="flex flex-col rounded-lg border border-cyan-300/20 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-cyan-200">Live Environments</p>
          <p className="mt-1 text-xs text-slate-400">
            Source ticks update compact line artifacts. Raw logs stay in Debug, not Helix Ask context.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void checkSourceSignal()}
            className="rounded border border-amber-300/30 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-400/10"
          >
            Check source signal
          </button>
          <button
            type="button"
            onClick={() => void startMinecraftSourceMonitor()}
            disabled={!canStartSourceMonitor}
            title={canStartSourceMonitor ? "Start the monitor from the live source signal." : "Check the source signal first; a live source is required."}
            className="rounded border border-emerald-300/30 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Start source monitor
          </button>
          <button
            type="button"
            onClick={() => void planLineChecks()}
            disabled={!environment}
            className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Plan checks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("interpreted_log")}
            className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
          >
            Go to log
          </button>
          {environment ? (
            <>
              <button type="button" onClick={() => void setEnvironmentStatus("pause")} className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">Pause</button>
              <button type="button" onClick={() => void setEnvironmentStatus("resume")} className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">Resume</button>
              <button type="button" onClick={() => void setEnvironmentStatus("stop")} className="rounded border border-rose-300/25 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-400/10">Stop</button>
            </>
          ) : null}
          <button type="button" onClick={() => void refresh()} className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10">Refresh</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <fieldset
          aria-label="Visual capture route"
          className="inline-flex flex-wrap items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-300"
        >
          <span className="mr-1 text-slate-400">Route screen share to</span>
          {([
            ["live_answer", "Live Answer visual"],
            ["image_lens", "Image Lens"],
            ["audio_transcript", "Audio transcript"],
          ] as const).map(([route, label]) => (
            <label key={route} className="inline-flex items-center gap-1 rounded border border-white/10 bg-slate-950/70 px-1.5 py-0.5 text-slate-100">
              <input
                type="checkbox"
                checked={visualCaptureRoutes.includes(route)}
                onChange={() => toggleVisualCaptureRoute(route)}
                aria-label={`Route screen share to ${label}`}
                className="h-3 w-3 accent-cyan-300"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={() => void startVisualCaptureByRoute()}
          disabled={selectedRouteCount === 0}
          className="rounded border border-sky-300/30 px-2 py-1 text-[11px] text-sky-100 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {routeAudioTranscript || routeImageLens
            ? audioRouteNeedsFreshShare ? "Restart selected live sources" : "Start selected live sources"
            : visualLatest?.source ? "Grant visual capture + first frame" : "Register + first frame"}
        </button>
        <button
          type="button"
          onClick={() => void captureVisualFrameNow()}
          className="rounded border border-emerald-300/30 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {visualSourceCapability?.next_required_action === "capture_first_frame" ? "Capture first frame" : "Capture now"}
        </button>
        <button
          type="button"
          onClick={() => void startVisualInterval(10_000)}
          className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
        >
          Set interval 10s
        </button>
        <button
          type="button"
          onClick={() => void startVisualInterval(30_000)}
          className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
        >
          Set interval 30s
        </button>
        <button
          type="button"
          onClick={() => void pauseVisualInterval()}
          disabled={!visualProducerState?.interval_active}
          className="rounded border border-amber-300/30 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Pause interval, keep sharing
        </button>
        <button
          type="button"
          onClick={() => void stopVisualSharing()}
          disabled={!visualProducerState?.stream_active && !activeAudioTranscriptSourceId}
          className="rounded border border-rose-300/30 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Stop sharing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("interpreted_log")}
          className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
        >
          Go to log
        </button>
      </div>
      {lastActionStatus ? (
        <p className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-300">
          {lastActionStatus}
        </p>
      ) : null}
      {latestDocEquationContext ? (
        <div
          className="mt-2 rounded border border-cyan-300/20 bg-cyan-950/15 p-2"
          data-testid="live-answer-doc-equation-context"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
              Doc Equation Context
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-cyan-300/25 px-2 py-0.5 text-[10px] text-cyan-100">
                {docEquationScopeLabel(latestDocEquationContext)}
              </span>
              <button
                type="button"
                onClick={handleExplainLatestDocEquationContext}
                className="rounded border border-cyan-300/30 px-2 py-0.5 text-[10px] text-cyan-100 hover:bg-cyan-400/10"
                aria-label="Ask Helix to explain current doc equation context"
              >
                Explain
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-100">{latestDocEquationContext.equationLabel}</p>
          <p className="mt-1 truncate text-[11px] text-slate-300">
            {latestDocEquationContext.docPath}
            {latestDocEquationContext.sectionAnchor ? `#${latestDocEquationContext.sectionAnchor}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
              badge {latestDocEquationContext.preferredBadgeId ?? latestDocEquationContext.badgeIds[0] ?? "none"}
            </span>
            <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
              action {latestDocEquationContext.actionKind}
            </span>
            <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
              observation only
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            {latestDocEquationContext.actionClaimBoundaryNote ??
              latestDocEquationContext.claimBoundaryNotes[0] ??
              "Diagnostic context only."}
          </p>
        </div>
      ) : null}
      <div className="hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-100">Source Health</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Live environments can run with partial senses. Missing sources become next actions, not failures.
            </p>
          </div>
          <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase text-slate-400">
            fidelity {Math.round((presentStateCard?.fidelity_profile?.fidelity_score ?? 0) * 100)}%
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceHealthEntries.length === 0 ? (
            <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400">No source capability profile yet</span>
          ) : null}
          {sourceHealthEntries.map((capability: HelixSituationSourceCapability) => (
            <span
              key={capability.source_id}
              title={capability.missing_reason ?? capability.source_id}
              className={`rounded border px-2 py-1 text-[10px] ${sourceStatusClass(capability.status)}`}
            >
              {modalityLabel(capability.modality)}: {sourceStatusLabel(capability)}
            </span>
          ))}
        </div>
        {environmentPolicyBadges.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {environmentPolicyBadges.map((badge: { label: string; value: string }) => (
              <span key={badge.label} className="rounded border border-cyan-300/20 px-2 py-1 text-[10px] text-cyan-100">
                {badge.label}: {badge.value}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 rounded border border-cyan-300/15 bg-cyan-950/10 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Supported rehearsal spaces</p>
            {selectedRehearsalSpace ? (
              <span className="rounded border border-cyan-300/20 px-2 py-0.5 text-[10px] text-cyan-100">
                selected {selectedRehearsalSpace.label} / fidelity +{Math.round(selectedRehearsalSpace.additive_fidelity_hint * 100)}%
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rehearsalCatalog.spaces.map((space: HelixRehearsalSpace) => (
              <button
                key={space.space_id}
                type="button"
                onClick={() => setSelectedRehearsalSpaceId(space.space_id)}
                disabled={space.status === "future"}
                title={`${space.summary} Adapter: ${space.domain_adapter}. Execution disabled.`}
                className={`rounded border px-2 py-1 text-[10px] ${
                  selectedRehearsalSpaceId === space.space_id
                    ? "border-cyan-200/50 bg-cyan-300/15 text-cyan-50"
                    : space.status === "available"
                      ? "border-emerald-300/25 text-emerald-100 hover:bg-emerald-400/10"
                    : space.status === "limited" || space.status === "partial"
                      ? "border-amber-300/25 text-amber-100 hover:bg-amber-400/10"
                      : space.status === "stale"
                        ? "border-orange-300/25 text-orange-100 hover:bg-orange-400/10"
                        : space.status === "policy_blocked"
                          ? "border-rose-300/25 text-rose-100"
                        : "border-white/10 text-slate-500"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {space.label} / {space.availability_label ?? space.status}
              </button>
            ))}
          </div>
          {selectedRehearsalSpace ? (
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              {selectedRehearsalSpace.summary} Modes: {selectedRehearsalSpace.supported_rehearsal_modes.join(", ")}. Live actions disabled.
            </p>
          ) : null}
        </div>
        {presentStateCard?.fidelity_profile?.next_actions?.length ? (
          <p className="mt-2 text-[11px] text-amber-100">
            Next: {presentStateCard.fidelity_profile.next_actions.slice(0, 3).join(", ")}
          </p>
        ) : null}
      </div>
      <div className="order-30 mt-3 rounded border border-white/10 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-100">{sourceLabel}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              This checks whether a saved or attached world-event adapter is reaching Helix. The source can be a Minecraft plugin, another game adapter, a browser source, or a future profile-saved live environment.
            </p>
          </div>
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${
            sourceSignal.status === "live"
              ? "border-emerald-300/30 text-emerald-100"
              : sourceSignal.status === "stale"
                ? "border-amber-300/30 text-amber-100"
                : sourceSignal.status === "missing" || sourceSignal.status === "error"
                  ? "border-rose-300/30 text-rose-100"
                  : "border-white/10 text-slate-400"
          }`}>
            {sourceSignal.status}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-slate-300">{sourceSignal.summary}</p>
        {sourceSignal.source ? (
          <p className="mt-1 truncate text-[10px] text-slate-500">
            source {sourceSignal.source.source_id} / room {sourceSignal.source.room_id} / world {sourceSignal.source.world_id} / events {sourceSignal.source.event_count}
          </p>
        ) : null}
        {sourceSignal.status === "missing" || sourceSignal.status === "stale" || sourceSignal.status === "error" ? (
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,0.6fr)_1fr_auto]">
            <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Source label
              <input
                value={sourceLabel}
                onChange={(event) => setSourceLabel(event.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-300/40"
                placeholder="My Minecraft world source"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Source endpoint
              <input
                value={sourceEndpoint}
                onChange={(event) => setSourceEndpoint(event.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-300/40"
                placeholder="https://your-cloudflare-tunnel.trycloudflare.com/api/agi/situation/world-event"
              />
            </label>
            <button
              type="button"
              onClick={saveSourceConnection}
              className="self-end rounded border border-cyan-300/30 px-3 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
            >
              Save source
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col rounded border border-sky-300/15 bg-sky-950/10 p-3">
        <div className="order-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-sky-100">Visual capture source</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              Screen/window frames are evidence only. The panel requests browser permission, records compact visual evidence, and aligns it with recent source events.
            </p>
          </div>
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${
            visualCaptureStatus === "analysis_ready" || visualCaptureStatus === "active" || visualCaptureStatus === "manual_frame_ready"
              ? "border-emerald-300/30 text-emerald-100"
              : visualCaptureStatus === "permission_required" || visualCaptureStatus === "waiting_for_first_frame"
                ? "border-amber-300/30 text-amber-100"
                : visualCaptureStatus === "analysis_failed" || visualCaptureStatus === "configured_missing"
                  ? "border-rose-300/30 text-rose-100"
                  : "border-white/10 text-slate-400"
          }`}>
            {visualCaptureStatus}
          </span>
        </div>
        <div className="order-3 mt-3 grid gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded border border-sky-300/15 bg-black">
            <div className="flex aspect-video items-center justify-center">
              {visualProducerState?.last_frame_preview_data_url ? (
                <img
                  src={visualProducerState.last_frame_preview_data_url}
                  alt="Latest captured visual frame preview"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="px-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-400">No frame preview</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {visualProducerState?.stream_active || visualLatest?.active_source || visualLatest?.source
                      ? "Waiting for first captured frame."
                      : "Hook up a visual source to start preview."}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <div className="grid gap-x-3 gap-y-1 text-[11px] md:grid-cols-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Source</span>{" "}
                <span className="break-all font-mono text-slate-200">{activeVisualSourceId ?? "none"}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Frame</span>{" "}
                <span className="break-all font-mono text-slate-200">{visualLatest?.frame?.frame_id ?? selectedVisualFrameHistory?.frame_id ?? "none"}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Evidence</span>{" "}
                <span className="break-all font-mono text-slate-200">{visualEvidenceHealth?.latest_evidence_id ?? visualLatest?.evidence?.evidence_id ?? selectedVisualFrameHistory?.evidence_id ?? "none"}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Vision</span>{" "}
                <span className="break-all font-mono text-slate-200">{visualEvidenceHealth?.provider_status ?? "unknown"}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Next</span>{" "}
                <span className="break-all font-mono text-slate-200">{visualEvidenceHealth?.next_required_action ?? "none"}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-slate-500">Preview</span>{" "}
                <span className="break-all font-mono text-slate-200">
                  {visualProducerState?.last_frame_hash ? `hash ${visualProducerState.last_frame_hash}` : "local only"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="order-4 mt-3 rounded border border-white/10 bg-black/20 p-2" data-testid="visual-frame-review-carousel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-200">Recent frame review</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Local carousel, capped at 20 frames and auto-expiring after 10 minutes.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Review previous visual frame"
                onClick={() => selectVisualFrameHistoryByOffset(-1)}
                disabled={selectedVisualFrameHistoryIndex <= 0}
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="min-w-14 text-center text-[10px] text-slate-500">
                {selectedVisualFrameHistoryIndex >= 0 ? `${selectedVisualFrameHistoryIndex + 1}/${visualFrameHistory.length}` : "0/0"}
              </span>
              <button
                type="button"
                aria-label="Review next visual frame"
                onClick={() => selectVisualFrameHistoryByOffset(1)}
                disabled={!visualFrameHistory.length || selectedVisualFrameHistoryIndex >= visualFrameHistory.length - 1}
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          {selectedVisualFrameHistory ? (
            <div className="mt-2 grid gap-2 lg:grid-cols-[8rem_minmax(0,1fr)]">
              <div className="overflow-hidden rounded border border-white/10 bg-black">
                <img
                  src={selectedVisualFrameHistory.preview_data_url}
                  alt="Selected visual frame review preview"
                  className="aspect-video h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="max-h-20 overflow-y-auto pr-1 text-[11px] leading-5 text-slate-300">
                  {selectedVisualFrameHistory.summary}
                </p>
                {selectedVisualFrameHistory.crop_only ? (
                  <p className="mt-1 rounded border border-cyan-300/20 bg-cyan-950/20 px-2 py-1 text-[10px] leading-4 text-cyan-100">
                    Image Lens crop-only frame. Analysis prompt is bounded to the submitted crop pixels
                    {selectedVisualFrameHistory.crop_bbox_px
                      ? ` (${selectedVisualFrameHistory.crop_bbox_px.x}, ${selectedVisualFrameHistory.crop_bbox_px.y}, ${selectedVisualFrameHistory.crop_bbox_px.width}x${selectedVisualFrameHistory.crop_bbox_px.height}px).`
                      : "."}
                  </p>
                ) : null}
                <div className="mt-2 grid gap-x-3 gap-y-1 text-[10px] md:grid-cols-2">
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Frame</span>{" "}
                    <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory.frame_id ?? "pending"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Evidence</span>{" "}
                    <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory.evidence_id ?? "pending"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Shade</span>{" "}
                    <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory.visual_observer_profile_title ?? "generic"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Scope</span>{" "}
                    <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory.crop_only ? "image_lens_crop" : selectedVisualFrameHistory.source_kind ?? "full_frame"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Prompt hash</span>{" "}
                    <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory.visual_prompt_hash ?? "none"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Captured</span>{" "}
                    <span className="font-mono text-slate-300">{formatTime(selectedVisualFrameHistory.captured_at)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="uppercase text-slate-500">Expires</span>{" "}
                    <span className="font-mono text-slate-300">{formatTime(selectedVisualFrameHistory.expires_at)}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="visual-frame-explicit-promotion-actions">
                  <button
                    type="button"
                    onClick={sendSelectedVisualFrameToGptLive}
                    className="rounded border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-400/20"
                  >
                    Send now to GPT Live
                  </button>
                  <button
                    type="button"
                    onClick={attachSelectedVisualFrameToNextAsk}
                    className="rounded border border-sky-300/30 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold text-sky-100 hover:bg-sky-400/20"
                  >
                    Use in next Ask
                  </button>
                  <button
                    type="button"
                    onClick={openSelectedVisualFrameInImageLens}
                    className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/20"
                  >
                    Open frozen frame in Image Lens
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Captured frame summaries will appear here after visual analysis returns.
            </p>
          )}
          {visualFrameHistory.length ? (
            <div className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Recent visual frame thumbnails">
              {visualFrameHistory.map((item: VisualSourceCaptureFrameHistoryItem, index: number) => (
                <button
                  key={item.history_id}
                  type="button"
                  aria-label={`Review visual frame ${index + 1}`}
                  onClick={() => setSelectedVisualFrameHistoryId(item.history_id)}
                  className={`h-12 w-20 shrink-0 overflow-hidden rounded border bg-black ${
                    item.history_id === selectedVisualFrameHistory?.history_id
                      ? "border-sky-300/70"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <img src={item.preview_data_url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="order-6 mt-3 rounded border border-teal-300/20 bg-teal-950/10 p-2" data-testid="audio-transcript-review">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-teal-100">Earbud outputs</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Audio transcript chunks, capped at {AUDIO_TRANSCRIPT_HISTORY_LIMIT}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[10px]">
              <button
                type="button"
                aria-label="Review previous audio transcript chunk"
                onClick={() => selectAudioTranscriptByOffset(-1)}
                disabled={selectedAudioTranscriptIndex <= 0}
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="min-w-14 text-center text-[10px] text-slate-500">
                {selectedAudioTranscriptIndex >= 0 ? `${selectedAudioTranscriptIndex + 1}/${mergedAudioTranscriptHistory.length}` : "0/0"}
              </span>
              <button
                type="button"
                aria-label="Review next audio transcript chunk"
                onClick={() => selectAudioTranscriptByOffset(1)}
                disabled={!mergedAudioTranscriptHistory.length || selectedAudioTranscriptIndex >= mergedAudioTranscriptHistory.length - 1}
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
              <span className="rounded border border-teal-300/20 px-2 py-1 text-teal-100">
                Chunk traffic {Math.round(audioTranscriptChunkMs / 1000)}s
              </span>
              <span className={`rounded border px-2 py-1 ${
                effectiveAudioTranscriptStatus === "listening" || effectiveAudioTranscriptStatus === "transcribing"
                  ? "border-emerald-300/30 text-emerald-100"
                  : effectiveAudioTranscriptStatus === "requesting_permission"
                    ? "border-amber-300/30 text-amber-100"
                    : effectiveAudioTranscriptStatus === "error"
                      ? "border-rose-300/30 text-rose-100"
                      : "border-white/10 text-slate-400"
              }`}>
                {effectiveAudioTranscriptStatus}
              </span>
            </div>
          </div>
          <p className={`mt-2 rounded border px-2 py-1 text-[10px] leading-4 ${
            effectiveAudioTranscriptStatus === "error"
              ? "border-rose-300/20 bg-rose-950/10 text-rose-100"
              : "border-white/10 bg-black/20 text-slate-400"
          }`}>
            {effectiveAudioTranscriptStatusDetail}
          </p>
          <div className="mt-2 rounded border border-cyan-300/15 bg-black/20 px-2 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-cyan-100">Audio Transcript Decks</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-300">
                  {earbudMicroReasonerPresetStatus}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  Phase: mail reasoning / Source: {activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="earbud-micro-reasoner-preset-select">
                  Earbud micro-reasoner prompt preset
                </label>
                <select
                  id="earbud-micro-reasoner-preset-select"
                  aria-label="Earbud micro-reasoner prompt preset"
                  value={selectedEarbudMicroReasonerPromptPreset?.presetId ?? ""}
                  onChange={(event) => setSelectedEarbudMicroReasonerPromptPresetId(event.currentTarget.value)}
                  disabled={earbudMicroReasonerPromptPresets.length === 0}
                  className="min-w-[16rem] rounded border border-cyan-300/30 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {earbudMicroReasonerPresetGroups.length === 0 ? (
                    <option value="">No earbud presets loaded</option>
                  ) : (
                    earbudMicroReasonerPresetGroups.map((group) => (
                      <optgroup key={group.category} label={`${group.category} source`}>
                        {group.presets.map((preset) => (
                          <option key={preset.presetId} value={preset.presetId}>
                            {microReasonerPresetOptionLabel(preset, activeAudioTranscriptSourceId ?? `audio_transcript:${threadId}`)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  aria-label="Apply selected earbud micro-reasoner prompt preset"
                  onClick={() => void applyEarbudMicroReasonerPromptPreset(selectedEarbudMicroReasonerPromptPreset)}
                  disabled={!selectedEarbudMicroReasonerPromptPreset}
                  className={`rounded border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                    selectedEarbudMicroPresetApplied
                      ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                      : "border-cyan-300/30 text-cyan-100 hover:bg-cyan-400/10"
                  }`}
                >
                  {selectedEarbudMicroPresetApplied ? "Earbud deck applied" : "Apply earbud deck"}
                </button>
              </div>
            </div>
            {selectedEarbudMicroReasonerPromptPreset ? (
              <div className="mt-2">
                <p className="rounded border border-cyan-300/15 bg-black/20 px-2 py-1.5 text-[11px] text-cyan-100">
                  {selectedEarbudMicroReasonerPromptPreset.description}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedEarbudMicroPromptPreview.map((prompt: StagePlayMicroReasonerPromptV1) => (
                    <span key={prompt.promptId} className="rounded border border-cyan-300/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">
                      {prompt.role}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-2 rounded border border-lime-300/15 bg-black/20 px-2 py-2" data-testid="document-markdown-micro-reasoner">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-lime-100">Document Markdown Decks</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-300">
                  {documentMicroReasonerPresetStatus}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  Phase: mail reasoning / Source: {activeDocumentMarkdownSourceId}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="document-micro-reasoner-preset-select">
                  Document Markdown micro-reasoner prompt preset
                </label>
                <select
                  id="document-micro-reasoner-preset-select"
                  aria-label="Document Markdown micro-reasoner prompt preset"
                  value={selectedDocumentMicroReasonerPromptPreset?.presetId ?? ""}
                  onChange={(event) => setSelectedDocumentMicroReasonerPromptPresetId(event.currentTarget.value)}
                  disabled={documentMicroReasonerPromptPresets.length === 0}
                  className="min-w-[16rem] rounded border border-lime-300/30 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-lime-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {documentMicroReasonerPresetGroups.length === 0 ? (
                    <option value="">No document presets loaded</option>
                  ) : (
                    documentMicroReasonerPresetGroups.map((group) => (
                      <optgroup key={group.category} label={`${group.category} source`}>
                        {group.presets.map((preset) => (
                          <option key={preset.presetId} value={preset.presetId}>
                            {microReasonerPresetOptionLabel(preset, activeDocumentMarkdownSourceId)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  aria-label="Apply selected Document Markdown micro-reasoner prompt preset"
                  onClick={() => void applyDocumentMicroReasonerPromptPreset(selectedDocumentMicroReasonerPromptPreset)}
                  disabled={!selectedDocumentMicroReasonerPromptPreset}
                  className={`rounded border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                    selectedDocumentMicroPresetApplied
                      ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                      : "border-lime-300/30 text-lime-100 hover:bg-lime-400/10"
                  }`}
                >
                  {selectedDocumentMicroPresetApplied ? "Document deck applied" : "Apply document deck"}
                </button>
              </div>
            </div>
            {selectedDocumentMicroReasonerPromptPreset ? (
              <div className="mt-2">
                <p className="rounded border border-lime-300/15 bg-black/20 px-2 py-1.5 text-[11px] text-lime-100">
                  {selectedDocumentMicroReasonerPromptPreset.description}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedDocumentMicroPromptPreview.map((prompt: StagePlayMicroReasonerPromptV1) => (
                    <span key={prompt.promptId} className="rounded border border-lime-300/20 px-1.5 py-0.5 font-mono text-[10px] text-lime-100">
                      {prompt.role}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-2 rounded border border-emerald-300/15 bg-black/20 px-2 py-2" data-testid="document-markdown-micro-reasoner-output">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase text-emerald-100">Document inline translation candidates</p>
              <span className="font-mono text-[10px] text-slate-500">
                {documentMicroReasonerOutputs.length ? `${documentMicroReasonerOutputs.length} generated` : "waiting"}
              </span>
            </div>
            {latestDocumentMicroReasonerOutput ? (
              <div className="mt-2 rounded border border-emerald-300/20 bg-emerald-950/10 px-2 py-1.5">
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-emerald-50">{latestDocumentMicroReasonerOutput.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-emerald-100/80">
                  <span>{latestDocumentMicroReasonerOutput.deckTitle}</span>
                  <span>{latestDocumentMicroReasonerOutput.role}</span>
                  <span>{latestDocumentMicroReasonerOutput.status}</span>
                  <span>{formatTime(latestDocumentMicroReasonerOutput.createdAt)}</span>
                  <span className="truncate font-mono">{latestDocumentMicroReasonerOutput.refs.at(0) ?? latestDocumentMicroReasonerOutput.runId}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded border border-white/10 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-5 text-slate-500">
                No document translation output has been projected yet. Visible Markdown packets will appear here after completed document MicroDeck runs.
              </p>
            )}
            {documentMicroReasonerOutputs.length > 1 ? (
              <div className="mt-2 grid gap-1.5 md:grid-cols-2" aria-label="Recent document Markdown MicroDeck outputs">
                {documentMicroReasonerOutputs.slice(0, -1).slice(-6).reverse().map((output: EarbudMicroReasonerOutput) => (
                  <div key={output.runId} className="min-w-0 rounded border border-white/10 bg-slate-950/70 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-semibold text-emerald-100">{output.role}</span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(output.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-300">{output.text}</p>
                    <p className="mt-1 truncate text-[10px] text-emerald-100/70">{output.deckTitle}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 rounded border border-white/10 bg-slate-950/50 px-2 py-1.5" data-testid="document-markdown-micro-reasoner-trace">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase text-slate-300">Document source trace</p>
                <span className="font-mono text-[10px] text-slate-500">
                  {documentMicroReasonerTraceItems.length ? `${documentMicroReasonerTraceItems.length} events` : "empty"}
                </span>
              </div>
              {documentMicroReasonerTraceItems.length ? (
                <div className="mt-1.5 grid gap-1.5">
                  {documentMicroReasonerTraceItems.slice().reverse().map((item: DocumentMicroReasonerTraceItem) => (
                    <div key={`${item.label}:${item.id}`} className="min-w-0 rounded border border-white/10 bg-black/20 px-2 py-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="font-semibold text-slate-200">{item.label}</span>
                        <span className="font-mono text-lime-100">{item.status}</span>
                        <span className="text-slate-500">{formatTime(item.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.detail || item.id}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                  No document source mail, wake, packet, or MicroDeck run has been observed for this document source.
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 rounded border border-emerald-300/15 bg-black/20 px-2 py-2" data-testid="earbud-micro-reasoner-output">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase text-emerald-100">Earbud output candidates</p>
              <span className="font-mono text-[10px] text-slate-500">
                {earbudMicroReasonerOutputs.length ? `${earbudMicroReasonerOutputs.length} translated` : "waiting"}
              </span>
            </div>
            {latestEarbudMicroReasonerOutput ? (
              <div className="mt-2 rounded border border-emerald-300/20 bg-emerald-950/10 px-2 py-1.5">
                <p className="text-[11px] leading-5 text-emerald-50">{latestEarbudMicroReasonerOutput.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-emerald-100/80">
                  <span>{latestEarbudMicroReasonerOutput.deckTitle}</span>
                  <span>{latestEarbudMicroReasonerOutput.status}</span>
                  <span>{formatTime(latestEarbudMicroReasonerOutput.createdAt)}</span>
                  <span className="truncate font-mono">{latestEarbudMicroReasonerOutput.refs.at(0) ?? latestEarbudMicroReasonerOutput.runId}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded border border-white/10 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-5 text-slate-500">
                No translated earbud output has been projected yet. Captured chunks will appear here after a completed earbud packet_composer run.
              </p>
            )}
            {earbudMicroReasonerOutputs.length > 1 ? (
              <div className="mt-2 grid gap-1.5 md:grid-cols-2" aria-label="Recent translated earbud outputs">
                {earbudMicroReasonerOutputs.slice(0, -1).slice(-4).reverse().map((output: EarbudMicroReasonerOutput) => (
                  <div key={output.runId} className="min-w-0 rounded border border-white/10 bg-slate-950/70 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-semibold text-emerald-100">{output.deckTitle}</span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(output.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300">{output.text}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {audioRouteNeedsFreshShare ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-950/10 px-2 py-1 text-[10px] leading-4 text-amber-100">
              Current visual share has no audio track; starting selected live sources will request a fresh browser share.
            </p>
          ) : null}
          {selectedAudioTranscript ? (
            <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
              <p className="max-h-24 overflow-y-auto pr-1 text-[11px] leading-5 text-slate-200">
                {selectedAudioTranscript.transcript}
              </p>
              <div className="mt-2 grid gap-x-3 gap-y-1 text-[10px] md:grid-cols-2">
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Source</span>{" "}
                  <span className="break-all font-mono text-slate-300">{selectedAudioTranscript.source_id}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Chunk</span>{" "}
                  <span className="break-all font-mono text-slate-300">{selectedAudioTranscript.chunk_id ?? selectedAudioTranscript.event_id ?? "pending"}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Evidence</span>{" "}
                  <span className="break-all font-mono text-slate-300">{selectedAudioTranscript.evidence_refs.at(0) ?? "none"}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Analyzer</span>{" "}
                  <span className="break-all font-mono text-slate-300">{selectedAudioTranscript.analysis_job_id ?? "transcript_intent"}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Duration</span>{" "}
                  <span className="font-mono text-slate-300">
                    {selectedAudioTranscript.duration_ms !== null ? `${Math.round(selectedAudioTranscript.duration_ms / 1000)}s` : "unknown"}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Captured</span>{" "}
                  <span className="font-mono text-slate-300">{formatTime(selectedAudioTranscript.captured_at)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Transcript chunks will appear here after the shared tab produces audio.
            </p>
          )}
          {mergedAudioTranscriptHistory.length ? (
            <div className="mt-2 grid gap-1.5 md:grid-cols-2" aria-label="Recent audio transcript chunks">
              {mergedAudioTranscriptHistory.slice(-4).reverse().map((item: AudioTranscriptHistoryItem) => (
                <button
                  key={item.history_id}
                  type="button"
                  aria-label={`Review audio transcript chunk ${mergedAudioTranscriptHistory.findIndex((entry: AudioTranscriptHistoryItem) => entry.history_id === item.history_id) + 1}`}
                  onClick={() => setSelectedAudioTranscriptHistoryId(item.history_id)}
                  className={`min-w-0 rounded border bg-slate-950/70 px-2 py-1.5 text-left ${
                    item.history_id === selectedAudioTranscript?.history_id
                      ? "border-teal-300/70"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-semibold text-teal-100">{item.source_label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(item.captured_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300">{item.transcript}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{item.chunk_id ?? item.event_id ?? "pending"}</p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="order-7 mt-3 rounded border border-violet-300/20 bg-violet-950/10 p-2" data-testid="visual-frame-action-replay">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-violet-100">Action replay</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                Re-analyze the selected review frame with the selected shade. Live capture can keep running.
              </p>
            </div>
            <button
              type="button"
              aria-label="Replay selected visual frame with selected shade"
              onClick={() => void replaySelectedVisualFrame()}
              disabled={!selectedVisualFrameHistory || !selectedVisualObserverProfile || visualFrameReplayRunning}
              className="rounded border border-violet-300/30 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {visualFrameReplayRunning ? "Replaying..." : "Replay with selected shade"}
            </button>
          </div>
          <div className="mt-2 grid gap-x-3 gap-y-1 text-[10px] md:grid-cols-2">
            <div className="min-w-0">
              <span className="uppercase text-slate-500">Frame</span>{" "}
              <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory?.frame_id ?? "none selected"}</span>
            </div>
            <div className="min-w-0">
              <span className="uppercase text-slate-500">Shade</span>{" "}
              <span className="break-all font-mono text-slate-300">{selectedVisualObserverProfile?.title ?? "none selected"}</span>
            </div>
            <div className="min-w-0">
              <span className="uppercase text-slate-500">Source</span>{" "}
              <span className="break-all font-mono text-slate-300">{selectedVisualFrameHistory?.source_id ?? activeVisualSourceId ?? "none"}</span>
            </div>
            <div className="min-w-0">
              <span className="uppercase text-slate-500">Mode</span>{" "}
              <span className="break-all font-mono text-slate-300">manual replay / capture independent</span>
            </div>
          </div>
          {visualFrameReplayResult ? (
            <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
              <div className="grid gap-x-3 gap-y-1 text-[10px] md:grid-cols-2">
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Replay evidence</span>{" "}
                  <span className="break-all font-mono text-slate-300">{visualFrameReplayResult.evidence_id ?? "none"}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Replay frame</span>{" "}
                  <span className="break-all font-mono text-slate-300">{visualFrameReplayResult.replay_frame_id ?? "none"}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Replay shade</span>{" "}
                  <span className="break-all font-mono text-slate-300">{visualFrameReplayResult.shade_title}</span>
                </div>
                <div className="min-w-0">
                  <span className="uppercase text-slate-500">Prompt hash</span>{" "}
                  <span className="break-all font-mono text-slate-300">{visualFrameReplayResult.visual_prompt_hash ?? "none"}</span>
                </div>
              </div>
              <p className="mt-2 max-h-20 overflow-y-auto pr-1 text-[11px] leading-5 text-slate-300">
                {visualFrameReplayResult.summary}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Replay results will appear here without replacing the live capture carousel.
            </p>
          )}
        </div>
        <div className="order-4 mt-3 rounded border border-cyan-300/20 bg-cyan-950/10 px-2 py-2" data-testid="live-answer-microdeck-catalog">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase text-cyan-100">MicroDeck catalog</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Capture prompts and mail reasoning decks share one catalog while keeping their runtime phase explicit.
              </p>
            </div>
            <span className="rounded border border-cyan-300/20 px-2 py-1 font-mono text-[10px] text-cyan-100">
              {microDeckCatalogGroups.reduce((sum, group) => sum + group.items.filter((item) => item.applied).length, 0)} applied
            </span>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {microDeckCatalogGroups.map((group: LiveAnswerMicroDeckCatalogGroup) => (
              <div key={group.title} className="min-w-0 rounded border border-white/10 bg-black/20 p-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-[10px] font-semibold uppercase text-slate-200">{group.title}</p>
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded border border-cyan-300/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">
                      {liveAnswerMicroDeckPhaseLabel(group.phase)}
                    </span>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      {liveAnswerMicroDeckSourceLabel(group.sourceKind)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                  {group.items.length === 0 ? (
                    <p className="rounded border border-white/10 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-500">
                      No catalog items loaded.
                    </p>
                  ) : (
                    group.items.map((item: LiveAnswerMicroDeckCatalogItem) => {
                      const swatch = liveAnswerMicroDeckSwatch(item.colorKey);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectMicroDeckCatalogItem(item)}
                          className={`w-full rounded border px-2 py-1.5 text-left hover:bg-white/5 ${
                            item.applied
                              ? "border-emerald-300/35 bg-emerald-400/10"
                              : "border-white/10 bg-slate-950/50"
                          }`}
                          aria-pressed={item.applied}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {item.applied ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                            ) : (
                              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/10" aria-hidden="true" />
                            )}
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full border"
                              aria-hidden="true"
                              style={swatch}
                            />
                            <span className="block truncate text-[11px] font-semibold text-slate-100">{item.title}</span>
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            <span className="rounded border border-cyan-300/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">
                              {liveAnswerMicroDeckPhaseLabel(item.phase)}
                            </span>
                            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                              {liveAnswerMicroDeckSourceLabel(item.sourceKind)}
                            </span>
                            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" data-testid="live-answer-microdeck-color-key">
                              color={item.colorKey}
                            </span>
                            {item.kind === "micro_reasoner_preset" ? (
                              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                {item.outputPolicy}
                              </span>
                            ) : null}
                            {item.applied ? (
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-300/20 px-1.5 py-0.5 text-[10px] text-emerald-100">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                checked applied
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{item.description}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
          {adaptiveVisualLensSelected ? (
            <div className="mt-2 rounded border border-emerald-300/25 bg-emerald-950/10 p-2" data-testid="live-answer-adaptive-visual-lens">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-emerald-100">Adaptive Expert Lens</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    mail reasoning -&gt; capture prompt suggestion
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-label="Evaluate adaptive visual lens"
                    onClick={() => void evaluateAdaptiveVisualLens()}
                    disabled={adaptiveVisualLensRunning || !activeVisualSourceId}
                    className="rounded border border-emerald-300/35 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {adaptiveVisualLensRunning ? "Evaluating" : "Evaluate"}
                  </button>
                  <button
                    type="button"
                    aria-label="Apply adaptive visual lens suggested shade"
                    onClick={() => void applyAdaptiveVisualLensSuggestion()}
                    disabled={adaptiveVisualLensRunning || !adaptiveVisualLensCanApply}
                    className="rounded border border-violet-300/35 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Apply suggested shade
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-white/10 bg-black/20 p-2">
                  <div className="grid gap-x-3 gap-y-1 text-[10px] md:grid-cols-2">
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Active shade</span>{" "}
                      <span className="break-all font-mono text-slate-300">{adaptiveVisualLensProposal?.activeProfileTitle ?? activeVisualObserverProfile?.title ?? "none"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Subject</span>{" "}
                      <span className="break-all font-mono text-slate-300">{adaptiveVisualLensProposal?.recognizedSubject ?? "not evaluated"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Confidence</span>{" "}
                      <span className="break-all font-mono text-slate-300">
                        {adaptiveVisualLensProposal ? adaptiveVisualLensProposal.recognizedSubjectConfidence.toFixed(2) : "none"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Drift</span>{" "}
                      <span className="break-all font-mono text-slate-300">{adaptiveVisualLensProposal?.driftState ?? "unknown"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Decision</span>{" "}
                      <span className="break-all font-mono text-slate-300">{adaptiveVisualLensProposal?.decision ?? "not evaluated"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="uppercase text-slate-500">Suggested shade</span>{" "}
                      <span className="break-all font-mono text-slate-300">{adaptiveVisualLensProposal?.candidateProfileTitle ?? adaptiveVisualLensProposal?.suggestedProfileDraft?.title ?? "none"}</span>
                    </div>
                  </div>
                  {adaptiveVisualLensProposal?.reason ? (
                    <p className="mt-2 text-[11px] leading-5 text-emerald-100">{adaptiveVisualLensProposal.reason}</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Evaluation waits for recent visual mail from the selected source.
                    </p>
                  )}
                  {adaptiveVisualLensError ? (
                    <p className="mt-2 rounded border border-rose-300/20 bg-rose-950/10 px-2 py-1.5 text-[11px] text-rose-100">
                      {adaptiveVisualLensError}
                    </p>
                  ) : null}
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-300">Suggested capture prompt</p>
                    <span className="font-mono text-[10px] text-slate-500">
                      {adaptiveVisualLensProposal?.candidateProfilePromptHash ?? "no hash"}
                    </span>
                  </div>
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-white/10 bg-slate-950/60 p-2 font-mono text-[10px] leading-4 text-slate-300">
                    {adaptiveVisualLensSuggestedPrompt || "Run Evaluate to prepare a suggested shade prompt."}
                  </pre>
                  {adaptiveVisualLensProposal?.evidenceRefs.length ? (
                    <p className="mt-2 line-clamp-2 break-all font-mono text-[10px] text-slate-500">
                      refs {adaptiveVisualLensProposal.evidenceRefs.slice(0, 6).join(" / ")}
                    </p>
                  ) : null}
                  {adaptiveVisualLensProposal?.microReasonerRunRefs.length ? (
                    <p className="mt-1 line-clamp-2 break-all font-mono text-[10px] text-emerald-200/80">
                      microdeck {adaptiveVisualLensProposal.microReasonerRunRefs.slice(0, 4).join(" / ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="order-5 mt-3 rounded border border-violet-300/20 bg-violet-950/10 px-2 py-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-violet-100">Visual Capture Decks</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-300">
                {visualShadeStatus}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                Phase: capture prompt / Source: {activeVisualSourceId ?? "will register on apply"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="visual-observer-shade-select">
                Visual observer shade subject
              </label>
              <select
                id="visual-observer-shade-select"
                aria-label="Visual observer shade subject"
                value={selectedVisualObserverProfile?.profileId ?? ""}
                onChange={(event) => setSelectedVisualObserverProfileId(event.currentTarget.value)}
                disabled={visualShadeProfiles.length === 0}
                className="min-w-[18rem] rounded border border-violet-300/30 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {visualShadeGroups.length === 0 ? (
                  <option value="">No shade presets loaded</option>
                ) : (
                  visualShadeGroups.map((group) => (
                    <optgroup key={group.category} label={`${group.category} subject`}>
                      {group.profiles.map((profile) => (
                        <option key={profile.profileId} value={profile.profileId}>
                          {visualShadeOptionLabel(profile)}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
              <button
                type="button"
                aria-label="Apply selected visual observer shade"
                onClick={() => void applyVisualObserverProfile(selectedVisualObserverProfile)}
                disabled={!selectedVisualObserverProfile}
                className={`rounded border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                  selectedShadeApplied
                    ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                    : "border-violet-300/30 text-violet-100 hover:bg-violet-400/10"
                }`}
              >
                {selectedShadeApplied ? "Selected shade applied" : "Apply selected shade"}
              </button>
              <button
                type="button"
                aria-label="Refresh visual observer shade presets"
                onClick={() => void refresh()}
                className="rounded border border-white/15 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
              >
                Refresh shades
              </button>
            </div>
          </div>
          {visualShadeProfiles.length === 0 ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-950/10 px-2 py-1.5 text-[11px] text-amber-100">
              Shade presets are still loading. Refresh shades if the server was just restarted.
            </p>
          ) : null}
          {selectedVisualObserverProfile?.subject ? (
            <p className="mt-2 rounded border border-violet-300/15 bg-black/20 px-2 py-1.5 text-[11px] text-violet-100">
              Selected subject: {visualShadeSubjectCategory(selectedVisualObserverProfile)} / {selectedVisualObserverProfile.subject}
            </p>
          ) : null}
          {selectedVisualObserverProfile ? (
            <div className="mt-2 space-y-2">
              <label className="text-[10px] font-semibold uppercase text-slate-400" htmlFor="visual-observer-shade-prompt">
                Visual capture prompt
              </label>
              <textarea
                id="visual-observer-shade-prompt"
                aria-label="Visual observer shade prompt"
                value={visualShadePromptDraft}
                onChange={(event) => setVisualShadePromptDraft(event.currentTarget.value)}
                className="h-44 w-full resize-y rounded border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-300/50"
                placeholder="Select a shade to view or customize its prompt."
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500">
                  Presets are read-only. Edits save as the next Custom slot.
                </p>
                {visualShadePromptChanged ? (
                  <button
                    type="button"
                    aria-label="Save visual observer shade prompt as custom"
                    onClick={() => void saveVisualObserverPromptAsCustom()}
                    className="rounded border border-emerald-300/35 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/10"
                  >
                    Save As
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="order-8 mt-3 rounded border border-cyan-300/20 bg-cyan-950/10 px-2 py-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-cyan-100">Visual Mail Decks</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-300">
                {microReasonerPresetStatus}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                Phase: mail reasoning / Source: {activeVisualSourceId ?? "will register on apply"}
              </p>
            </div>
          </div>
          {microReasonerPromptPresets.length === 0 ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-950/10 px-2 py-1.5 text-[11px] text-amber-100">
              MicroDeck presets are still loading. Refresh deck if the server was just restarted.
            </p>
          ) : null}
          <p className="mt-2 rounded border border-cyan-300/15 bg-black/20 px-2 py-1.5 text-[11px] leading-5 text-cyan-100">
            Live Answer mirrors the selected visual mail deck for source context only. Full processed-mail MicroDeck setup and prompt preview belong in the Stage Play Badge Graph processed mail UI.
          </p>
        </div>
        {visualLatest?.evidence?.summary ? (
          <p className="order-9 mt-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-slate-300">
            {visualLatest.evidence.summary}
          </p>
        ) : null}
        {!visualLatest?.evidence?.summary && visualEvidenceHealth?.latest_summary ? (
          <p className="order-10 mt-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-slate-300">
            {visualEvidenceHealth.latest_summary}
          </p>
        ) : null}
        {visualProducerState?.capture_mode === "interval" ? (
          <p className="order-11 mt-2 rounded border border-cyan-300/15 bg-cyan-950/10 px-2 py-1.5 text-[11px] text-cyan-100">
            Interval {visualProducerState.interval_active ? "active" : "paused"} every {Math.round((visualProducerState.cadence_ms ?? 0) / 1000)}s; stream {visualProducerState.stream_active ? "shared" : "stopped"}; track {visualProducerState.track_ready_state}; scheduler {visualProducerState.scheduler_adoption_status ?? "not adopted"}; captures {visualProducerState.capture_count ?? 0}; posts {visualProducerState.post_count ?? 0}; latest chunk {visualProducerState.last_chunk_id ?? "none"}; last frame {formatTime(visualProducerState.last_frame_at)}{visualProducerState.last_error ? `; error ${visualProducerState.last_error}` : ""}.
          </p>
        ) : null}
        {(clientActions.length > 0 || clientAdoptions.length > 0) ? (
          <p className="order-12 mt-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-slate-300">
            Client actions: {clientActions.length} pending; latest action {latestClientAction?.action ?? "none"}; latest adoption {latestClientAdoption?.ok ? "adopted" : latestClientAdoption ? "failed" : "none"}; stream {latestClientObserved.client_stream_confirmed === true ? "active" : latestClientObserved.client_stream_confirmed === false ? "missing" : "unknown"}; interval {latestClientObserved.interval_active === true ? "active" : latestClientObserved.interval_active === false ? "inactive" : "unknown"}; chunk {typeof latestClientObserved.latest_chunk_id === "string" ? latestClientObserved.latest_chunk_id : "none"}.
          </p>
        ) : null}
        <LiveAnswerReasoningCircuit
          rows={liveAnswerCircuitRows}
          summary={liveAnswerCircuitSummary}
          sessions={agentGoalSessions}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tabs.map((tab: { id: LiveEnvironmentTab; label: string }) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded border px-2 py-1 text-[11px] ${activeTab === tab.id ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!environment && activeTab !== "present_state" && activeTab !== "interpreted_log" ? (
        <p className="mt-3 text-xs text-slate-500">No active live answer environment for {threadId}. Start one from Helix Ask.</p>
      ) : (
        <div className="mt-3">
          {activeTab === "present_state" ? (
            <div className="space-y-3">
              {!environment ? (
                <div className="rounded border border-amber-300/20 bg-amber-950/10 p-3">
                  <p className="text-sm font-semibold text-amber-100">No active live answer environment is bound to {threadId}.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Check a saved or attached source signal first. If a world-event source is live, start the source monitor to cycle present state, interpreted log, and executable line checks.
                  </p>
                  <button
                    type="button"
                    onClick={() => void checkSourceSignal()}
                    className="mt-3 rounded border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10"
                  >
                    Check source signal
                  </button>
                  <button
                    type="button"
                    onClick={() => void startMinecraftSourceMonitor()}
                    disabled={!canStartSourceMonitor}
                    title={canStartSourceMonitor ? "Start the monitor from the live source signal." : "Check the source signal first; a live source is required."}
                    className="mt-3 rounded border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Start source monitor
                  </button>
                </div>
              ) : null}
              {!presentStateCard ? (
                <p className="text-xs text-slate-500">No present-state card is available yet.</p>
              ) : (
                <div className="rounded border border-emerald-300/20 bg-emerald-950/15 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">{presentStateCard.status}</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-50">{presentStateCard.title}</p>
                    </div>
                    <span className="rounded border border-emerald-300/30 px-2 py-0.5 text-[10px] text-emerald-100">
                      {formatTime(presentStateCard.updated_at)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(Array.isArray(presentStateCard.lines) ? presentStateCard.lines : []).map((entry: HelixPresentStateCard["lines"][number]) => {
                      const lineState = liveCardLineStateByKey.get(entry.key);
                      const matchingRequest = lineToolRequests.find((request: HelixLiveLineToolRequest) => request.line_key === entry.key && request.status !== "evaluated");
                      return (
                      <div key={entry.key} className="rounded border border-white/10 bg-black/20 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] uppercase text-emerald-200/80">{entry.label}</p>
                          <div className="flex flex-wrap items-center gap-1">
                            {lineState?.evidence_status ? (
                              <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">
                                {lineState.evidence_status}
                              </span>
                            ) : null}
                            {typeof entry.confidence === "number" ? (
                              <span className="text-[10px] text-slate-500">{Math.round(entry.confidence * 100)}%</span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-100">{entry.value}</p>
                        {lineState?.missing_evidence?.length ? (
                          <p className="mt-1 text-[10px] text-amber-200">
                            Missing: {lineState.missing_evidence.slice(0, 2).join("; ")}
                          </p>
                        ) : null}
                        {lineState?.next_best_tool || lineState?.last_check_result ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            {lineState.next_best_tool ? <span>next tool {lineState.next_best_tool}</span> : null}
                            {lineState.last_check_result ? <span>last check {lineState.last_check_result}</span> : null}
                          </div>
                        ) : null}
                        {sourceCoverageSummary(lineState?.source_coverage).length ? (
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                            {sourceCoverageSummary(lineState?.source_coverage).map((entry: string) => (
                              <span key={entry} className="rounded border border-white/10 px-1.5 py-0.5 text-slate-400">
                                {entry}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          evidence {entry.evidence_refs.slice(0, 2).join(", ") || "none"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => matchingRequest ? void runLineCheck(matchingRequest) : void planLineChecks()}
                            className="rounded border border-cyan-300/25 px-1.5 py-0.5 text-[10px] text-cyan-100 hover:bg-cyan-400/10"
                          >
                            Run check
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("interpreted_log")}
                            className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-white/10"
                          >
                            Go to log
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                    <span>log target {presentStateCard.go_to_log_target ?? "none"}</span>
                    <span>raw logs included false</span>
                    <span>projection only</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void planLineChecks()}
                      className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
                    >
                      Plan checks
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("line_checks")}
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                    >
                      Open checks
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("interpreted_log")}
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                    >
                      Go to log
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {activeTab === "navigation_evidence" ? (
            <div className="space-y-3">
              <div className="rounded border border-cyan-300/20 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Navigation Evidence</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Route evidence is compact tool evidence. It is not a recommendation or assistant answer.
                    </p>
                  </div>
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                    {String(navigationState?.policy_surface_status ?? "unknown")}
                  </span>
                </div>
                {!navigationState ? (
                  <p className="mt-3 text-xs text-slate-500">No Minecraft navigation state has been recorded yet.</p>
                ) : (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-[10px] uppercase text-slate-500">Route status</p>
                      <p className="mt-1 text-xs text-slate-100">{String(navigationState.route_status ?? "unknown")}</p>
                    </div>
                    <div className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-[10px] uppercase text-slate-500">Drift</p>
                      <p className="mt-1 text-xs text-slate-100">{String(navigationLatestDrift?.drift_status ?? "none")}</p>
                    </div>
                    <div className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-[10px] uppercase text-slate-500">Updated</p>
                      <p className="mt-1 text-xs text-slate-100">{formatTime(String(navigationState.updated_at ?? ""))}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-xs font-semibold text-slate-100">Latest rehearsal</p>
                  <p className="mt-1 text-[11px] text-slate-500">confidence {String(navigationLatestRehearsal?.route_confidence ?? "n/a")} / basis {Array.isArray(navigationLatestRehearsal?.route_basis) ? navigationLatestRehearsal.route_basis.join(", ") : "none"}</p>
                  <p className="mt-2 text-xs text-slate-200">{String(navigationLatestRehearsal?.route_summary ?? "No rehearsal evidence yet.")}</p>
                </div>
                <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-xs font-semibold text-slate-100">Missing evidence</p>
                  <div className="mt-2 space-y-1">
                    {Array.isArray(navigationRead?.missing_evidence) && navigationRead.missing_evidence.length > 0 ? (
                      (navigationRead.missing_evidence as string[]).slice(0, 8).map((entry: string) => (
                        <p key={entry} className="text-[11px] text-slate-300">{entry}</p>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No route-specific gaps reported.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Provider observations</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {navigationSolverObservations.length === 0 ? <p className="text-xs text-slate-500">No Pathmind/Baritone/client planner observations yet.</p> : null}
                  {navigationSolverObservations.slice(-6).reverse().map((observation: Record<string, unknown>) => (
                    <div key={String(observation.observation_id)} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs font-semibold text-slate-100">{String(observation.provider ?? "provider")}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {String(observation.result_status ?? "unknown")} / {String(observation.planner_side_effect_risk ?? "unknown")}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        confidence {String(observation.provider_confidence ?? "n/a")} / trust {String(observation.evidence_trust ?? "unknown")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {activeTab === "worker_lanes" ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Worker Lanes</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Workers create tool observations, validations, and UI projections only. They do not create assistant answers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runDueWorkers()}
                    disabled={!environment}
                    className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Run due workers
                  </button>
                </div>
              </div>
              {workerLanes.length === 0 ? (
                <p className="text-xs text-slate-500">No worker lanes are registered for this thread yet.</p>
              ) : null}
              {workerLanes.map((lane: HelixLiveWorkerLane) => {
                const latestRun = workerRuns.filter((run: HelixLiveWorkerRun) => run.worker_id === lane.worker_id).at(-1) ?? null;
                return (
                  <div key={lane.worker_id} className="rounded border border-violet-300/15 bg-slate-950/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-violet-100">{lane.lane_key}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{lane.objective}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">{lane.status}</span>
                        <button
                          type="button"
                          onClick={() => void runWorkerLane(lane)}
                          className="rounded border border-violet-300/30 px-2 py-1 text-[10px] text-violet-100 hover:bg-violet-400/10"
                        >
                          Run
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                      <span>policy {lane.trigger_policy}</span>
                      <span>next {formatTime(lane.next_run_at)}</span>
                      <span>assistant answer {String(lane.assistant_answer)}</span>
                      <span>raw content {String(lane.raw_content_included)}</span>
                    </div>
                    <p className="mt-2 truncate text-[10px] text-slate-600">
                      tools {lane.allowed_tools.slice(0, 4).join(", ") || "none"}
                    </p>
                    {latestRun ? (
                      <div className="mt-3 rounded border border-white/10 bg-black/20 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Latest run</p>
                          <span className="text-[10px] text-slate-500">{latestRun.status} / {formatTime(latestRun.completed_at ?? latestRun.started_at)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-300">{latestRun.summary}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-600">
                          observations {latestRun.observations.slice(0, 3).join(", ") || "none"} / validations {latestRun.validations.slice(0, 3).join(", ") || "none"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {activeTab === "line_checks" ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Executable Line Checks</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Live lines can request workstation checks. Running one creates a receipt and evaluation; it does not create an assistant answer.
                </p>
              </div>
              {lineToolRequests.length === 0 ? (
                <div className="rounded border border-amber-300/20 bg-amber-950/10 p-3">
                  <p className="text-xs font-semibold text-amber-100">No line tool requests have been proposed yet.</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Use Plan checks to turn the current live card lines into receipt-backed workstation checks without creating an assistant answer.
                  </p>
                  <button
                    type="button"
                    onClick={() => void planLineChecks()}
                    disabled={!environment}
                    className="mt-2 rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Plan checks
                  </button>
                </div>
              ) : null}
              {lineToolRequests.slice(-30).reverse().map((request: HelixLiveLineToolRequest) => {
                const evaluation = lineToolEvaluations.find((entry: HelixLiveLineToolEvaluation) => entry.request_id === request.request_id);
                return (
                  <div key={request.request_id} className="rounded border border-cyan-300/15 bg-slate-950/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-cyan-100">{request.line_label}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{request.requested_tool}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">{request.status}</span>
                        {request.status !== "evaluated" ? (
                          <button
                            type="button"
                            onClick={() => void runLineCheck(request)}
                            className="rounded border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-400/10"
                          >
                            Run check
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setActiveTab("interpreted_log")}
                          className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10"
                        >
                          Go to log
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-300">{request.reason_summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                      <span>{request.reason}</span>
                      <span>{request.expected_evidence_kind}</span>
                      <span>priority {request.priority}</span>
                      <span>assistant answer {String(request.assistant_answer)}</span>
                      <span>raw content {String(request.raw_content_included)}</span>
                    </div>
                    {evaluation ? (
                      <div className="mt-3 rounded border border-emerald-300/15 bg-emerald-950/10 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase text-emerald-200">Evaluation</p>
                          <span className="text-[10px] text-slate-500">
                            {evaluation.supports_line} / delta {evaluation.confidence_delta.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-200">{evaluation.summary}</p>
                        {evaluation.missing_evidence.length > 0 ? (
                          <p className="mt-1 text-[10px] text-amber-200">
                            Missing: {evaluation.missing_evidence.slice(0, 3).join("; ")}
                          </p>
                        ) : null}
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          receipts {evaluation.tool_receipt_refs.slice(0, 3).join(", ") || "none"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {activeTab === "interpreted_log" ? (
            <div className="space-y-2">
              {interpretedEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No interpreted events have been recorded yet.</p>
              ) : null}
              {interpretedEvents.slice(-30).reverse().map((event: HelixInterpretedEvent) => (
                <div key={event.event_id} className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-100">{event.title}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{event.kind}</p>
                    </div>
                    <span className="text-[10px] text-slate-500">{formatTime(event.created_at)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">{event.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                    {typeof event.confidence === "number" ? <span>confidence {Math.round(event.confidence * 100)}%</span> : null}
                    <span>model {String(event.model_invoked)}</span>
                    <span>deterministic {String(event.deterministic)}</span>
                    <span>raw logs {String(event.raw_logs_included)}</span>
                    <span>assistant answer {String(event.assistant_answer)}</span>
                  </div>
                  <p className="mt-2 truncate text-[10px] text-slate-600">
                    evidence {event.evidence_refs.slice(0, 4).join(", ") || "none"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "clarification" ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Clarification Queue</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Questions are proposed only when user input would materially improve the situation model. They are validation artifacts, not assistant answers.
                </p>
              </div>
              {clarificationNeeds.length === 0 && clarificationProposals.length === 0 ? (
                <p className="text-xs text-slate-500">No clarification needs are pending.</p>
              ) : null}
              {clarificationProposals.slice(-12).reverse().map((proposal: HelixClarificationQuestionProposal) => {
                const need = clarificationNeeds.find((entry: HelixClarificationNeed) => entry.need_id === proposal.need_id);
                return (
                  <div key={proposal.proposal_id} className="rounded border border-amber-300/20 bg-amber-950/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-amber-100">{proposal.question}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {proposal.expected_effect} / {proposal.surface_policy} / importance {need?.importance ?? "unknown"}
                        </p>
                      </div>
                      <span className="rounded border border-amber-300/20 px-1.5 py-0.5 text-[10px] text-amber-100">
                        budget {need?.question_budget ?? 0}
                      </span>
                    </div>
                    {need?.missing_evidence?.length ? (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Missing: {need.missing_evidence.slice(0, 3).join("; ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                      <span>assistant answer {String(proposal.assistant_answer)}</span>
                      <span>raw content {String(proposal.raw_content_included)}</span>
                      <span>{formatTime(proposal.created_at)}</span>
                    </div>
                  </div>
                );
              })}
              {steeringEvidence.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Recent Steering Evidence</p>
                  {steeringEvidence.slice(-8).reverse().map((entry: HelixUserSteeringEvidence) => (
                    <div key={entry.steering_id} className="rounded border border-white/10 bg-slate-950/70 p-2">
                      <p className="text-xs text-slate-200">{entry.user_claim}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {entry.effect} / delta {entry.confidence_delta ?? "n/a"} / raw content {String(entry.raw_content_included)}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">
                        next checks {entry.next_checks.join(", ") || "none"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeTab === "overview" && environment ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {([
                ["Environment", environment.environment_id],
                ["Objective", environment.objective],
                ["Thread", environment.thread_id],
                ["Status", `${environment.status} / ${environment.mode}`],
                ["Sources", String(environmentSourceIds.length)],
                ["Lines", String(environmentLines.length)],
                ["Last update", formatTime(environment.updated_at)],
                ["Last evaluation", environment.latest_evaluation?.summary ?? environment.latest_summary],
              ] as Array<[string, string]>).map(([label, value]: [string, string]) => (
                <div key={label} className="rounded border border-white/10 bg-slate-950/70 p-2">
                  <p className="text-[10px] uppercase text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-xs text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "live_cognition" ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Situation Runs</p>
                <p className="mt-1 text-[11px] text-slate-500">Prompt-perturbed procedures that receive live observations.</p>
                <div className="mt-3 space-y-2">
                  {situationRuns.length === 0 ? <p className="text-xs text-slate-500">No situation runs yet.</p> : null}
                  {situationRuns.slice(-6).reverse().map((run: LiveSituationRunRead) => (
                    <div key={run.situation_run_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-100">{run.modality_scope}</p>
                        <span className="text-[10px] text-slate-500">{run.status} / {run.reasoning_budget}</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-600">fields {(run.active_fields ?? []).join(", ") || "none"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Source Binding Status</p>
                <p className="mt-1 text-[11px] text-slate-500">Source Binding History, Repair Candidates, Repair Acceptance, Bound Evidence, and Excluded Unbound Evidence.</p>
                <div className="mt-3 space-y-2">
                  {sourceBindingTransitions.length === 0 ? <p className="text-xs text-slate-500">No source binding transitions yet.</p> : null}
                  {sourceBindingTransitions.slice(-8).reverse().map((transition: SourceBindingTransitionRead) => (
                    <div key={transition.transition_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-100">{transition.source_id}</p>
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">{transition.modality}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{transition.from} to {transition.to}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{transition.reason}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">
                        evidence {(transition.evidence_refs ?? []).slice(0, 3).join(", ") || "none"} / {formatTime(transition.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Field Workers</p>
                <p className="mt-1 text-[11px] text-slate-500">Workers evaluate fields; they cannot execute tools or answer users.</p>
                <div className="mt-3 space-y-2">
                  {fieldWorkers.length === 0 ? <p className="text-xs text-slate-500">No field workers yet.</p> : null}
                  {fieldWorkers.slice(-8).reverse().map((worker: LiveFieldWorkerRead) => (
                    <div key={worker.worker_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs font-semibold text-slate-100">{worker.field_label}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{worker.worker_role} / {worker.status} / may execute {String(worker.may_execute_tool)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Field Worker Runs</p>
                <p className="mt-1 text-[11px] text-slate-500">Started/completed lifecycle items for each field worker.</p>
                <div className="mt-3 space-y-2">
                  {fieldWorkerRuns.length === 0 ? <p className="text-xs text-slate-500">No field worker runs yet.</p> : null}
                  {fieldWorkerRuns.slice(-8).reverse().map((run: LiveFieldWorkerRunRead) => (
                    <div key={`${run.worker_run_id}:${run.status}`} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{run.field_key}</p>
                        <span className="text-[10px] text-slate-600">{run.status}</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-600">output {run.output_evaluation_id ?? "pending"} / {formatTime(run.completed_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Field Evaluations</p>
                <p className="mt-1 text-[11px] text-slate-500">Latest scoped field judgments feeding the canonical card projection.</p>
                <div className="mt-3 space-y-2">
                  {fieldEvaluations.length === 0 ? <p className="text-xs text-slate-500">No field evaluations yet.</p> : null}
                  {fieldEvaluations.slice(-8).reverse().map((evaluation: LiveFieldEvaluationRead) => (
                    <div key={evaluation.evaluation_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{evaluation.field_key}</p>
                        <span className="text-[10px] text-slate-600">{evaluation.status} / {Math.round(evaluation.confidence * 100)}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200">{evaluation.value}</p>
                      {(evaluation.missing_evidence ?? []).length ? (
                        <p className="mt-1 text-[10px] text-amber-200">Missing: {(evaluation.missing_evidence ?? []).slice(0, 2).join("; ")}</p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-slate-600">expires {formatTime(evaluation.expires_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Tangents / Arbiter</p>
                <p className="mt-1 text-[11px] text-slate-500">Side evaluations may recommend handoffs, but do not act.</p>
                <div className="mt-3 space-y-2">
                  {tangentEvaluations.length === 0 ? <p className="text-xs text-slate-500">No tangent evaluations yet.</p> : null}
                  {tangentEvaluations.slice(-6).reverse().map((tangent: LiveTangentEvaluationRead) => (
                    <div key={tangent.tangent_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-[10px] uppercase text-slate-500">{tangent.tangent_type}</p>
                      <p className="mt-1 text-xs text-slate-200">{tangent.claim}</p>
                      <p className="mt-1 text-[10px] text-slate-600">handoff {tangent.recommended_handoff?.type ?? "none"} / {Math.round(tangent.confidence * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Arbitration Candidates</p>
                    <p className="mt-1 text-[11px] text-slate-500">Candidates must be consumed before becoming handoffs, plans, or requests.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runSituationAcceptance()}
                    className="rounded border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-400/10"
                  >
                    Run acceptance
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {arbitrationCandidates.length === 0 ? <p className="text-xs text-slate-500">No arbitration candidates yet.</p> : null}
                  {arbitrationCandidates.slice(-8).reverse().map((candidate: LiveArbitrationCandidateRead) => (
                    <div key={candidate.candidate_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{candidate.candidate_type}</p>
                        <span className="text-[10px] text-slate-600">{candidate.priority} / {candidate.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200">{candidate.reason}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">
                        epoch {candidate.epoch} / fields {(candidate.field_evaluation_refs ?? []).length} / tangents {(candidate.tangent_refs ?? []).length}
                      </p>
                      {candidate.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => void consumeArbitrationCandidate(candidate.candidate_id)}
                          className="mt-2 rounded border border-cyan-300/25 px-1.5 py-0.5 text-[10px] text-cyan-100 hover:bg-cyan-400/10"
                        >
                          Consume
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Plan Contracts / Acceptance Runs</p>
                <p className="mt-1 text-[11px] text-slate-500">Plans are action requests only; acceptance runs prove the SituationRun lifecycle.</p>
                <div className="mt-3 space-y-2">
                  {planContracts.length === 0 && acceptanceRuns.length === 0 ? <p className="text-xs text-slate-500">No plan contracts or acceptance runs yet.</p> : null}
                  {planContracts.slice(-4).reverse().map((contract: LivePlanContractRead) => (
                    <div key={contract.plan_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{contract.action_id}</p>
                      <p className="mt-1 text-[10px] text-slate-600">client adoption {String(contract.client_adoption_required)} / self execute {String(contract.can_execute_itself)} / {formatTime(contract.created_at)}</p>
                    </div>
                  ))}
                  {acceptanceRuns.slice(-4).reverse().map((acceptance: LiveSituationRunAcceptanceRead) => (
                    <div key={acceptance.acceptance_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{acceptance.scenario}: {acceptance.ok ? "passed" : "failed"}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{acceptance.summary}</p>
                      <p className="mt-1 text-[10px] text-slate-600">{(acceptance.checks ?? []).filter((entry) => entry.passed).length}/{(acceptance.checks ?? []).length} checks / {formatTime(acceptance.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Predictions / Probes</p>
                <p className="mt-1 text-[11px] text-slate-500">Next checks become testable predictions, then passive probes wait for fresh observations.</p>
                <div className="mt-3 space-y-2">
                  {situationPredictions.length === 0 && observationProbes.length === 0 ? <p className="text-xs text-slate-500">No predictions or probes yet.</p> : null}
                  {situationPredictions.slice(-5).reverse().map((prediction: LiveSituationPredictionRead) => (
                    <div key={prediction.prediction_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{prediction.field_key}</p>
                        <span className="text-[10px] text-slate-600">epoch {prediction.source_epoch} / {prediction.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200">{prediction.claim}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">expects {(prediction.expected_observation_signals ?? []).join(", ") || "none"} / expires {formatTime(prediction.expires_at)}</p>
                    </div>
                  ))}
                  {observationProbes.slice(-5).reverse().map((probe: LiveObservationProbeRead) => (
                    <div key={probe.probe_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{probe.probe_type}</p>
                      <p className="mt-1 text-[10px] text-slate-600">epoch {probe.source_epoch} / {probe.status} / signals {(probe.expected_observation_signals ?? []).join(", ") || "none"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Probe Results / Confidence</p>
                <p className="mt-1 text-[11px] text-slate-500">New observations satisfy, contradict, or leave prior predictions inconclusive.</p>
                <div className="mt-3 space-y-2">
                  {probeResults.length === 0 && confidenceUpdates.length === 0 ? <p className="text-xs text-slate-500">No probe results yet.</p> : null}
                  {probeResults.slice(-5).reverse().map((result: LiveProbeResultRead) => (
                    <div key={result.probe_result_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{result.status} at epoch {result.tested_at_epoch}</p>
                      <p className="mt-1 text-[10px] text-slate-600">signals {(result.observed_signals ?? []).join(", ") || "none"} / delta {Math.round(result.confidence_delta * 100)}%</p>
                    </div>
                  ))}
                  {confidenceUpdates.slice(-5).reverse().map((update: LiveConfidenceUpdateRead) => (
                    <div key={update.confidence_update_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{update.field_key ?? "field"} confidence {Math.round(update.confidence_delta * 100)}%</p>
                      <p className="mt-1 text-[10px] text-slate-600">{update.reason} / updated {typeof update.updated_confidence === "number" ? `${Math.round(update.updated_confidence * 100)}%` : "n/a"}</p>
                    </div>
                  ))}
                  {procedureEpochs.slice(-3).reverse().map((epoch: LiveProcedureEpochRead) => (
                    <div key={epoch.epoch_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">Procedure epoch {epoch.epoch}</p>
                      <p className="mt-1 text-[10px] text-slate-600">obs {(epoch.observation_refs ?? []).length} / evals {(epoch.field_evaluation_refs ?? []).length} / preds {(epoch.prediction_refs ?? []).length} / results {(epoch.probe_result_refs ?? []).length}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Procedure Epochs / Closures</p>
                <p className="mt-1 text-[11px] text-slate-500">Each epoch closes as silent, pending handoff, pending plan, request-input, or suppressed.</p>
                <div className="mt-3 space-y-2">
                  {procedureEpochClosures.length === 0 ? <p className="text-xs text-slate-500">No procedure closures yet.</p> : null}
                  {procedureEpochClosures.slice(-6).reverse().map((closure: LiveProcedureEpochClosureRead) => (
                    <div key={closure.closure_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-200">Epoch {closure.epoch}: {closure.status}</p>
                        <span className="text-[10px] text-slate-600">card {String(closure.card_updated)}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-600">
                        confidence {(closure.confidence_changes ?? []).length} / pending {(closure.pending_actions ?? []).length} / next {(closure.next_epoch_triggers ?? []).length}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-700">{formatTime(closure.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Epoch Ledger</p>
                <p className="mt-1 text-[11px] text-slate-500">Replayable causal chain without raw images, logs, or assistant answer text.</p>
                <div className="mt-3 space-y-2">
                  {procedureLedgerItems.length === 0 ? <p className="text-xs text-slate-500">No ledger items yet.</p> : null}
                  {procedureLedgerItems.slice(-10).reverse().map((item: LiveProcedureLedgerItemRead) => (
                    <div key={item.ledger_item_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{item.item_kind}</p>
                        <span className="text-[10px] text-slate-600">epoch {item.epoch}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200">{item.summary}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">ref {item.item_ref} / causes {(item.causality_refs ?? []).length}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Handoff Consumption / Plan Execution</p>
                <p className="mt-1 text-[11px] text-slate-500">Handoffs and plans get traces; execution still belongs to the runtime path.</p>
                <div className="mt-3 space-y-2">
                  {handoffConsumptions.length === 0 && planExecutions.length === 0 ? <p className="text-xs text-slate-500">No handoff or plan execution traces yet.</p> : null}
                  {handoffConsumptions.slice(-5).reverse().map((trace: LiveAskHandoffConsumptionRead) => (
                    <div key={trace.consumption_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">Handoff {trace.status} / epoch {trace.epoch}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">budget {trace.reasoning_budget} / evidence {(trace.selected_evidence_refs ?? []).length} / {trace.handoff_id}</p>
                    </div>
                  ))}
                  {planExecutions.slice(-5).reverse().map((trace: LivePlanContractExecutionRead) => (
                    <div key={trace.execution_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{trace.action_id}</p>
                      <p className="mt-1 text-[10px] text-slate-600">epoch {trace.epoch} / {trace.runtime_status} / receipts {(trace.receipt_refs ?? []).length}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Observation Journal</p>
                <p className="mt-1 text-[11px] text-slate-500">Chronological observations only. Model perception is allowed only as evidence, not answer text.</p>
                <div className="mt-3 space-y-2">
                  {cognitionObservations.length === 0 ? <p className="text-xs text-slate-500">No observation journal entries yet.</p> : null}
                  {cognitionObservations.slice(-8).reverse().map((entry: LiveCognitionObservationRead) => (
                    <div key={entry.observation_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase text-slate-500">{entry.role}</p>
                        <span className="text-[10px] text-slate-600">model {String(entry.model_invoked)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200">{entry.text}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">evidence {(entry.evidence_refs ?? []).join(", ") || "none"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Interpretations</p>
                <p className="mt-1 text-[11px] text-slate-500">Meaning cards require evidence refs and expiry.</p>
                <div className="mt-3 space-y-2">
                  {cognitionInterpretations.length === 0 ? <p className="text-xs text-slate-500">No interpretation cards yet.</p> : null}
                  {cognitionInterpretations.slice(-8).reverse().map((card: LiveCognitionInterpretationRead) => (
                    <div key={card.interpretation_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs font-semibold text-slate-100">{card.title}</p>
                      <p className="mt-1 text-xs text-slate-300">{card.summary}</p>
                      <p className="mt-1 text-[10px] text-slate-600">confidence {Math.round((card.confidence ?? 0) * 100)}% / expires {formatTime(card.expires_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Candidate Goals</p>
                <p className="mt-1 text-[11px] text-slate-500">Goal cards cannot execute tools; they only name next evidence needed.</p>
                <div className="mt-3 space-y-2">
                  {cognitionGoals.length === 0 ? <p className="text-xs text-slate-500">No candidate goals yet.</p> : null}
                  {cognitionGoals.slice(-8).reverse().map((goal: LiveCognitionGoalRead) => (
                    <div key={goal.goal_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs font-semibold text-slate-100">{goal.candidate_goal}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{goal.status} / expires {formatTime(goal.expires_at)}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">next {(goal.next_evidence_needed ?? []).join(", ") || "none"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold text-slate-100">Ask / Action Handoffs</p>
                <p className="mt-1 text-[11px] text-slate-500">Handoffs carry selected evidence and a reasoning budget; they are not assistant answers.</p>
                <div className="mt-3 space-y-2">
                  {cognitionHandoffs.length === 0 ? <p className="text-xs text-slate-500">No Ask handoffs yet.</p> : null}
                  {cognitionHandoffs.slice(-8).reverse().map((handoff: LiveCognitionHandoffRead) => (
                    <div key={handoff.handoff_id} className="rounded border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-slate-200">{handoff.objective}</p>
                      <p className="mt-1 text-[10px] text-slate-500">budget {handoff.reasoning_budget} / evidence {(handoff.selected_evidence_refs ?? []).length}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {activeTab === "sources" ? (
            <div className="space-y-2">
              {relevantSources.length === 0 ? <p className="text-xs text-slate-500">No attached live sources.</p> : null}
              {relevantSources.map((source: WorkstationLiveSource) => (
                <div key={source.source_id} className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-100">{source.source_id}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{source.kind} / {source.status} / events {source.event_count ?? 0}</p>
                      <p className="mt-1 text-[11px] text-slate-500">last tick {source.last_tick_index ?? "none"} / {formatTime(source.last_event_ts)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => void setSourceStatus(source.source_id, "pause")} className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200">Pause</button>
                      <button type="button" onClick={() => void setSourceStatus(source.source_id, "resume")} className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200">Resume</button>
                      <button type="button" onClick={() => void setSourceStatus(source.source_id, "stop")} className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200">Stop</button>
                      <button type="button" onClick={() => void setSourceStatus(source.source_id, "reset-counters")} className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200">Reset</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "line_schema" && environment ? (
            <div className="space-y-3">
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Source descriptor</p>
                  {sourceDescriptors.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">No source descriptor has been recorded yet.</p>
                  ) : sourceDescriptors.slice(-3).map((descriptor: Record<string, unknown>) => {
                    const serving = descriptor.serving_context && typeof descriptor.serving_context === "object"
                      ? descriptor.serving_context as Record<string, unknown>
                      : {};
                    return (
                      <div key={String(descriptor.descriptor_id)} className="mt-2 rounded border border-white/10 bg-black/20 p-2">
                        <p className="break-words text-xs text-slate-100">{String(descriptor.source_id ?? "source")}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {String(descriptor.modality ?? "unknown")} / {String(serving.surface ?? "unknown")} / {String(descriptor.current_state ?? "unknown")}
                        </p>
                        <p className="mt-1 break-words text-[10px] text-slate-500">
                          app {String(serving.app_hint ?? "none")} / window {String(serving.window_title_hint ?? "none")}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Schema selection</p>
                  <p className="mt-2 text-xs text-slate-200">{String(schemaSelection?.preset_hint ?? "none")}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    authority {String(schemaSelection?.preset_authority ?? "none")} / compatibility {String(schemaCompatibility?.ok ?? "unknown")}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-300">{String(schemaSelection?.rationale ?? "No schema selection has been recorded yet.")}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {environmentLines.map((line: LiveAnswerLineState) => (
                  <div key={line.key} className="rounded border border-white/10 bg-slate-950/70 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-100">{line.label}</p>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{line.update_policy} / {line.visibility}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{line.key} / changed {formatTime(line.updated_at)}</p>
                    <p className="mt-1 text-xs text-slate-200">{line.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {activeTab === "deltas" ? (
            <div className="space-y-2">
              {deltas.slice(-12).reverse().map((delta: LiveAnswerEnvironmentDelta) => (
                <div key={delta.delta_id} className="rounded border border-white/10 bg-slate-950/70 p-2">
                  <p className="text-xs text-slate-200">{delta.reason} / {formatTime(delta.ts)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">changed {delta.changed_line_keys.join(", ") || "status"} / window {delta.window_id ?? "none"} / events {delta.source_event_count ?? "n/a"}</p>
                  <p className="mt-1 break-all text-[10px] text-slate-600">{delta.previous_hash ?? "no previous"} -&gt; {delta.next_hash}</p>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "windows" ? (
            <div className="space-y-2">
              {relevantWindows.length === 0 ? <p className="text-xs text-slate-500">No source windows yet.</p> : null}
              {relevantWindows.slice(-12).reverse().map((window: LiveSourceWindowSummary) => (
                <div key={window.window_id} className="rounded border border-white/10 bg-slate-950/70 p-2">
                  <p className="text-xs text-slate-200">{window.window_id}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{window.source_id} / events {window.event_count} / policy {window.policy.emit_line_delta_on}</p>
                  <p className="mt-1 text-[11px] text-slate-600">{formatTime(window.from_ts)} -&gt; {formatTime(window.to_ts)}</p>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "commentary" ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Live commentary policy</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Commentary is generated from compact deltas and written as validation/tool observations, not answer text.
                    </p>
                  </div>
                  <select
                    value={commentarySession?.cadence ?? "milestones_only"}
                    onChange={(event) => void setCommentaryCadence(event.target.value as LiveCommentaryCadence)}
                    className="rounded border border-cyan-300/20 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
                  >
                    {commentaryCadences.map((cadence: LiveCommentaryCadence) => (
                      <option key={cadence} value={cadence}>{cadence}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded border border-white/10 bg-black/20 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Status</p>
                    <p className="mt-1 text-xs text-slate-200">{commentarySession?.status ?? "not configured"}</p>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Voice mode</p>
                    <p className="mt-1 text-xs text-slate-200">{commentarySession?.voice_mode ?? environment?.mode ?? "n/a"}</p>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Last trace</p>
                    <p className="mt-1 break-words text-xs text-slate-200">{commentarySession?.last_commentary_turn_id ?? "none"}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {commentaryProposals.length === 0 ? <p className="text-xs text-slate-500">No commentary proposals yet.</p> : null}
                {commentaryCandidates.length > 0 ? (
                  <div className="rounded border border-white/10 bg-black/20 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Latest bounded commentary candidate</p>
                    <p className="mt-1 text-xs text-slate-200">{commentaryCandidates[commentaryCandidates.length - 1]?.text}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      decision {commentaryCandidates[commentaryCandidates.length - 1]?.decision} / model_invoked=false / deterministic=true
                    </p>
                  </div>
                ) : null}
                {commentaryProposals.slice(-12).reverse().map((proposal: LiveCommentaryProposal) => {
                  const delivery = commentaryDeliveries.find((entry: LiveCommentaryDeliveryReceipt) => entry.proposal_id === proposal.proposal_id);
                  return (
                    <div key={proposal.proposal_id} className="rounded border border-white/10 bg-slate-950/70 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-100">{proposal.reason} / {proposal.decision}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {proposal.priority} / {proposal.cadence} / model_invoked={String(proposal.model_invoked)}
                          </p>
                        </div>
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {delivery?.channel ?? "none"} / {delivery?.reason ?? "pending"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-200">{proposal.text}</p>
                      <p className="mt-2 break-words text-[10px] text-slate-600">
                        evidence {proposal.evidence_refs.slice(0, 3).join(", ") || "none"} / raw logs included false
                      </p>
                      {proposal.trace_steps?.length ? (
                        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2">
                          {proposal.trace_steps.map((step: LiveCommentaryTraceStep) => (
                            <div key={step.step_id} className="grid gap-1 rounded border border-white/5 bg-black/20 p-2 md:grid-cols-[120px_1fr]">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${step.status === "completed" ? "bg-cyan-300" : "bg-slate-600"}`} />
                                <span className="text-[10px] uppercase text-slate-500">{step.label}</span>
                              </div>
                              <p className="text-[11px] text-slate-300">{step.summary}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {activeTab === "reviews" ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Agentic reviews</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Reviews are explicit compact-context requests. Background results are validation items unless a direct user turn asks for an answer.
                    </p>
                  </div>
                  <button type="button" onClick={() => void requestAgenticReview()} className="rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10">Run review</button>
                </div>
              </div>
              {reviewRequests.length === 0 && reviewResults.length === 0 ? <p className="text-xs text-slate-500">No review requests yet.</p> : null}
              {reviewRequests.slice(-10).reverse().map((request: LiveAgenticReviewReadEntry) => (
                <div key={request.review_id} className="rounded border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-xs font-semibold text-slate-100">{request.trigger ?? "review"} / request</p>
                  <p className="mt-1 text-xs text-slate-300">{request.question ?? "Review the latest live environment state."}</p>
                  <p className="mt-2 text-[10px] text-slate-500">compact_context_pack_only / raw logs included false</p>
                </div>
              ))}
              {reviewResults.slice(-10).reverse().map((result: LiveAgenticReviewReadEntry) => (
                <div key={result.review_id} className="rounded border border-cyan-300/20 bg-cyan-950/20 p-3">
                  <p className="text-xs font-semibold text-cyan-100">{result.decision ?? "review_result"}</p>
                  <p className="mt-1 text-xs text-slate-200">{result.summary ?? "Review completed."}</p>
                  <p className="mt-2 text-[10px] text-slate-500">model_invoked={String(result.model_invoked ?? true)} / item role validation unless user-facing</p>
                </div>
              ))}
            </div>
          ) : null}
          {activeTab === "debug" ? (
            <div className="grid gap-2 lg:grid-cols-2">
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-[10px] uppercase text-slate-500">Diagnostics</p>
                <p className="mt-2 text-xs text-slate-300">last load: {diagnostics?.last_loaded_at ?? "never"}</p>
                <p className="mt-1 text-xs text-slate-300">fetch error: {diagnostics?.last_fetch_error ?? lastFetchError ?? "none"}</p>
                <p className="mt-1 text-xs text-slate-300">raw logs included: false</p>
                <p className="mt-1 text-xs text-slate-300">context policy: compact_context_pack_only</p>
              </div>
              <div className="rounded border border-white/10 bg-slate-950/70 p-3">
                <p className="text-[10px] uppercase text-slate-500">Recent source events</p>
                <div className="mt-2 space-y-1">
                  {relevantEvents.slice(-8).reverse().map((event: WorkstationLiveSourceEvent) => (
                    <p key={event.event_id} className="break-words text-[11px] text-slate-400">
                      {event.tick_index ?? event.seq} / {event.source_family ?? event.kind} / {event.event_type}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
