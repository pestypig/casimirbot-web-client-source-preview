import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Link2, PanelLeftClose, PanelLeftOpen, RadioTower, Search, Trash2, Volume2, Waypoints } from "lucide-react";
import type {
  StagePlayBadgeEdgeV1,
  StagePlayBadgeGraphRecommendedActionV1,
  StagePlayBadgeGraphV1,
  StagePlayBadgeV1,
} from "@shared/contracts/stage-play-badge-graph.v1";
import type {
  StagePlayLiveSourceJobStateV1,
  StagePlayLiveSourceMailDecisionV1,
  StagePlayLiveSourceMailItemV1,
  AskTurnTranscriptRowDraftV1,
  StagePlayMicroReasonerPromptV1,
  StagePlayMicroReasonerPromptPresetV1,
  StagePlayMicroReasonerRoleV1,
  StagePlayMicroReasonerRunV1,
  StagePlayProcessedMailPacketV1,
  StagePlayLiveSourceMailTranscriptEntryV1,
  StagePlayLiveSourceNarrativeStateV1,
  StagePlayLiveSourceWatchJobPolicyV1,
} from "@shared/contracts/stage-play-live-source-mail.v1";
import type {
  StagePlayLiveSourceInterpreterProfileComparisonV1,
  StagePlayLiveSourceInterpreterProfileV1,
} from "@shared/contracts/stage-play-live-source-interpreter-profile.v1";
import type { StagePlayVisualObserverProfileV1 } from "@shared/contracts/stage-play-visual-observer-profile.v1";
import type {
  StagePlayLiveSourceMailWakeRequestV1,
  StagePlayLiveSourceMailWakeResultV1,
} from "@shared/contracts/stage-play-live-source-mail-wake.v1";
import {
  WORKSTATION_GOAL_CONTEXT_UPDATE_SCHEMA,
  queryActuatorForAgentGoalContextFeedV1,
  type AgentGoalActuatorV1,
  type AgentGoalSessionV1,
  type WorkstationDispatchActionV1,
  type WorkstationGoalContextUpdateV1,
} from "@shared/contracts/workstation-goal-context.v1";
import type { LiveSourceBudgetStateV1 } from "@shared/contracts/stage-play-live-source-current-state.v1";
import type { StagePlayRawSessionBufferEntryV1 } from "@shared/stage-play-raw-session-buffer";
import type {
  StagePlayBuilderCatalogV1,
  StagePlayGraphDraftValidationV1,
  StagePlaySourceHandleV1,
  StagePlaySourceQueryV1,
} from "@shared/contracts/stage-play-builder.v1";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  diffStagePlayBadgeGraphs,
  hasStagePlayGraphDiff,
  type StagePlayGraphDiff,
} from "@/lib/stage-play/stagePlayGraphDiff";
import { useStagePlayBadgeGraphPanelStore } from "@/store/useStagePlayBadgeGraphPanelStore";
import {
  selectActiveLiveAnswerEnvironment,
  useLiveAnswerEnvironmentStore,
} from "@/store/useLiveAnswerEnvironmentStore";
import {
  getActiveVisualFrameStream,
  getLatestActiveVisualFrameStream,
  startVisualFrameProducerInterval,
  stopVisualFrameProducerInterval,
} from "@/lib/helix/visualFrameProducer";
import { useVisualSourceCaptureStore, type VisualSourceCaptureState } from "@/store/useVisualSourceCaptureStore";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import {
  STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT,
  type StagePlayLiveSourceMailRefreshEventDetail,
} from "@/lib/helix/liveSourceMailRefreshEvent";
import { workstationCircuitColor } from "@/lib/workstation/reasoningCircuitColor";
import { recordWorkstationCommandLifecycle } from "@/lib/workstation/performance/workstationCommandReceipts";
import { useWorkstationPerformanceStore } from "@/store/useWorkstationPerformanceStore";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";

const STAGE_PLAY_PANEL_THREAD_ID = "helix-ask:desktop";
const STAGE_PLAY_MAILBOX_QUERY_KEY = [
  "/api/helix/stage-play/live-source-mail",
  STAGE_PLAY_PANEL_THREAD_ID,
  STAGE_PLAY_PANEL_THREAD_ID,
  "overview",
] as const;
const STAGE_PLAY_TRANSCRIPT_QUERY_KEY = [
  "/api/helix/stage-play/live-source-mail/transcript",
  STAGE_PLAY_PANEL_THREAD_ID,
  STAGE_PLAY_PANEL_THREAD_ID,
] as const;
const STAGE_PLAY_CUSTOM_MICRODECK_STORAGE_KEY = "stage-play-custom-microdeck-presets:v1";
const STAGE_PLAY_OBSERVER_GRAPH_REFETCH_MS = {
  normal: 5000,
  degraded: 7500,
  blocked: 10000,
} as const;
const STAGE_PLAY_OBSERVER_MAILBOX_REFETCH_MS = {
  normal: 1000,
  degraded: 2500,
  blocked: 4000,
} as const;
const STAGE_PLAY_REFRESH_COALESCE_MS = {
  normal: 120,
  degraded: 650,
  blocked: 1200,
} as const;

type StagePlayRenderPressure = keyof typeof STAGE_PLAY_OBSERVER_MAILBOX_REFETCH_MS;

function maxStagePlayRenderPressure(input: {
  advisory?: string | null;
  responsiveness?: string | null;
}): StagePlayRenderPressure {
  if (input.advisory === "blocked" || input.responsiveness === "blocked") return "blocked";
  if (input.advisory === "degraded" || input.responsiveness === "degraded") return "degraded";
  return "normal";
}

const STAGE_PLAY_SOURCE_SETUP_DEFAULTS = {
  routeTo: "narrative_stage_play",
  visualCadenceMs: 10_000,
  audioWindowMs: 10_000,
  compactObservationWindowMs: 10_000,
  rawRetention: "session_ttl",
} as const;
const STAGE_PLAY_UI_WAKE_BRIDGE_STORAGE_KEY = "stage-play:mail-wake-ui-bridge:v1";
const STAGE_PLAY_UI_WAKE_BRIDGE_COOLDOWN_MS = 30_000;
type StagePlayWakeBridgeMemory = {
  launchedWakeIds: string[];
  launchedWakeAtById: Record<string, number>;
  lastLaunchedAt: number;
};

const STAGE_PLAY_VISUAL_CADENCE_OPTIONS = [5_000, 10_000, 15_000, 30_000] as const;

type StagePlayNodeBuilderType = {
  kind: StagePlayBadgeV1["kind"];
  label: string;
  role: string;
};

type DraftStagePlayNodeParameter = {
  id: string;
  key: string;
  value: string;
};

type DraftStagePlayNode = StagePlayNodeBuilderType & {
  id: string;
  x: number;
  y: number;
  parameters: DraftStagePlayNodeParameter[];
};

type HeldStagePlayNode = StagePlayNodeBuilderType & {
  clientX: number;
  clientY: number;
};

type MicroDeckEvidenceWiringWidget = {
  key: string;
  label: string;
  summary: string;
  block: string;
  disabledReason?: string | null;
};

type StagePlaySourceOption = {
  id: string;
  sourceId: string;
  label: string;
  sourceClass: string;
  status: string;
  descriptorId?: string | null;
  producerId?: string | null;
  surface?: string | null;
  origin?: string | null;
  cadenceMs?: number | null;
  latestRef?: string | null;
  latestEvidenceRefs: string[];
};

type StagePlayBuilderContextResponse = {
  artifactId: "stage_play_builder_context";
  schemaVersion: "stage_play_builder_context/v1";
  generatedAt: string;
  catalog: StagePlayBuilderCatalogV1;
  sourceQuery: StagePlaySourceQueryV1;
  authority: StagePlayBuilderCatalogV1["authority"];
};

type StagePlayObserverSource = StagePlayBadgeGraphV1["sourceWindow"]["sources"][number];

const evidenceHandleCountLabel = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

const appendMicroDeckEvidenceWiring = (draft: string, block: string): string => {
  const trimmedDraft = draft.trimEnd();
  return trimmedDraft ? `${trimmedDraft}\n\n${block}` : block;
};

const buildMicroDeckEvidenceWiringWidgets = (
  packet: StagePlayProcessedMailPacketV1 | null | undefined,
  sourceId: string | null,
): MicroDeckEvidenceWiringWidget[] => {
  const handles = packet?.evidenceHandles;
  const activeSourceId = sourceId ?? packet?.sourceId ?? "active live source";
  const sourceKind = handles?.sourceReceipts.at(-1)?.sourceKind ?? handles?.frameReceipts.at(-1)?.sourceKind ?? "live_source";
  const sourceReceiptCount = handles?.sourceReceipts.length ?? 0;
  const frameReceiptCount = handles?.frameReceipts.length ?? 0;
  const frameIntervalCount = handles?.frameIntervals.length ?? 0;
  const lensProductCount = handles?.lensProducts.length ?? 0;
  const situationSliceCount = handles?.situationSlices.length ?? 0;
  const actionPredictionCount = packet?.actionPredictions?.length ?? 0;
  const unresolvedLeadCount = packet?.unresolvedLeads?.length ?? 0;
  const packetLine = `- Packet: ${packet?.packetId ?? "latest processed packet pending"}. Source: ${activeSourceId}. Source type: ${sourceKind}.`;
  const countLine = `- Available refs: sourceReceipts=${sourceReceiptCount}, frameReceipts=${frameReceiptCount}, frameIntervals=${frameIntervalCount}, lensProducts=${lensProductCount}, situationSlices=${situationSliceCount}, actionPredictions=${actionPredictionCount}, unresolvedLeads=${unresolvedLeadCount}.`;
  const disabledReason = packet ? null : "Waiting for a processed live-source packet.";
  return [
    {
      key: "source_receipts",
      label: "Source receipts",
      summary: evidenceHandleCountLabel(sourceReceiptCount, "receipt"),
      disabledReason,
      block: [
        "Evidence handle wiring: source receipt custody",
        packetLine,
        countLine,
        "- Before using a live-source claim, bind the claim to packet.evidenceHandles.sourceReceipts and packet.evidenceRefs.",
        "- Treat receipts as observations and custody handles, not conclusions or answer authority.",
        "- If source kind or receipt custody is missing, request more evidence before selecting a terminal recommendation.",
      ].join("\n"),
    },
    {
      key: "frame_intervals",
      label: "Frame intervals",
      summary: evidenceHandleCountLabel(frameIntervalCount, "interval"),
      disabledReason,
      block: [
        "Evidence handle wiring: frame interval pursuit",
        packetLine,
        countLine,
        "- Use packet.evidenceHandles.frameIntervals before trusting movement, occlusion, salience, access, or visual-delta claims.",
        "- Prefer key frame and interval receipts over compact summary text when a prediction depends on what changed on screen.",
        "- If the interval is absent or underdetermined, emit request_more_evidence with a frame interval lead instead of strengthening the claim.",
      ].join("\n"),
    },
    {
      key: "lens_products",
      label: "Lens products",
      summary: evidenceHandleCountLabel(lensProductCount, "lens"),
      disabledReason,
      block: [
        "Evidence handle wiring: derived lens guardrail",
        packetLine,
        countLine,
        "- Raw frame and source receipts are canonical evidence; packet.evidenceHandles.lensProducts are derived support only.",
        "- Use lens products to compare alternatives such as motion_delta, occlusion_map, object_track, salience_heatmap, or crop_zoom.",
        "- Do not let a lens-derived claim stand without its rawFrameParentRefs, parameters, uncertainty, and evidence refs.",
      ].join("\n"),
    },
    {
      key: "situation_slices",
      label: "Timeline slices",
      summary: evidenceHandleCountLabel(situationSliceCount, "slice"),
      disabledReason,
      block: [
        "Evidence handle wiring: synchronized situation timeline",
        packetLine,
        countLine,
        "- Align screen, browser, terminal, audio, game, tool, and source receipts through packet.evidenceHandles.situationSlices before inferring causality.",
        "- Compare same-time source slices when belief/access depends on whether the actor saw a change before acting.",
        "- If source clocks or slice ordering are unclear, keep the prediction uncertain and request a synchronized slice.",
      ].join("\n"),
    },
    {
      key: "action_predictions",
      label: "Action predictions",
      summary: evidenceHandleCountLabel(actionPredictionCount, "prediction"),
      disabledReason,
      block: [
        "Evidence handle wiring: goal-based action prediction",
        packetLine,
        countLine,
        "- Use packet.actionPredictions as tentative hypotheses; verify their basis, disconfirmers, frameIntervalRefs, lensRefs, and sourceSliceRefs.",
        "- Separate surface cues, goal-object reasoning, belief state, perceptual access, and tool affordance before selecting recommendedNext.",
        "- If the prediction has decisive uncertainties, choose evidence pursuit or record_interpretation instead of overconfident Ask interrupt shaping.",
      ].join("\n"),
    },
    {
      key: "evidence_leads",
      label: "Evidence leads",
      summary: evidenceHandleCountLabel(unresolvedLeadCount, "lead"),
      disabledReason,
      block: [
        "Evidence handle wiring: unresolved lead pursuit",
        packetLine,
        countLine,
        "- Read packet.unresolvedLeads before finalizing the role output, especially when a lead affects actionPredictions.",
        "- When a lead requests frame history or lens presets, preserve it as request_more_evidence or pursue_evidence_lead instead of collapsing it into a conclusion.",
        "- Repair or downgrade predictions when pursuedLeads contradict the first-pass packet.",
      ].join("\n"),
    },
  ];
};

type StagePlayObserverDraftAction =
  | "use_for_stage_play"
  | "route_to_narrative"
  | "route_to_minecraft_world"
  | "start_visual_interval"
  | "attach_audio_transcript"
  | "pause_source"
  | "clear_session_buffer";

type StagePlayVisualCaptureSurface = "browser_tab" | "screen";

type StagePlayAudioTranscriptSource = "browser_audio" | "microphone";

type StagePlaySourceSetupStatus = {
  level: "idle" | "working" | "ok" | "error";
  message: string;
};

type StagePlaySourceAuditMode = "source_evidence" | "compact_observation" | "raw_buffer";

type StagePlaySourceAuditSelection = {
  source: StagePlayObserverSource;
  mode: StagePlaySourceAuditMode;
} | null;

type StagePlayRawSessionBufferListResponse = {
  ok: boolean;
  schema: "stage_play_raw_session_buffer_list/v1";
  sessionId: string;
  threadId: string;
  roomId?: string | null;
  sourceId?: string | null;
  entries: StagePlayRawSessionBufferEntryV1[];
  assistant_answer: false;
  context_role: "audit_buffer_not_graph";
};

type StagePlayProjectLiveAnswerResponse = {
  ok: boolean;
  schema: "stage_play_live_answer_projection_response/v1";
  projectedLineKeys: string[];
  skippedLineKeys: string[];
  checkpointOnlySkipped: string[];
  reason:
    | "projected"
    | "no_active_environment"
    | "line_schema_mismatch"
    | "no_line_changes"
    | "graph_invalid"
    | "environment_not_active";
  assistant_answer: false;
  raw_content_included: false;
  context_role: "tool_evidence";
  terminal_eligible: false;
};

type StagePlayProjectionStatus = {
  projectedLineKeys: string[];
  skippedLineKeys: string[];
  checkpointOnlySkipped: string[];
  reason: StagePlayProjectLiveAnswerResponse["reason"] | "request_failed";
  updatedAt: string;
  message: string;
};

type StagePlayCheckpointQueueAction =
  | "run"
  | "skip"
  | "pause_job"
  | "resume_job"
  | "clear_queued"
  | "end_live_job";

type StagePlayCheckpointQueueStatus = {
  action: StagePlayCheckpointQueueAction;
  reason: string;
  message: string;
  updatedAt: string;
  ok: boolean;
} | null;

type StagePlayCheckpointRequest = NonNullable<StagePlayBadgeGraphV1["checkpointRequests"]>[number];

type StagePlayMailLoopWorkBudgetV1 = {
  schema: "stage_play_mail_loop_work_budget/v1";
  now?: string;
  selectedDeck?: {
    presetId?: string | null;
    title?: string | null;
    domain?: string | null;
    outputPolicy?: string | null;
    promptedRoles?: string[];
    roleCount?: number;
  } | null;
  limits?: {
    maxVisiblePackets?: number;
    maxActivePackets?: number;
    maxQueuedPackets?: number;
    maxReasonerRolesPerPacket?: number;
    maxConcurrentReasonerRuns?: number;
    maxReasonerRunsPerMinute?: number;
    maxActiveAskWakes?: number;
    dropPolicy?: string;
  };
  usage?: {
    retainedMailCount?: number;
    processedPacketCount?: number;
    activePacketCount?: number;
    mailPerMinute?: number;
    packetsPerMinute?: number;
    rolesPerPacket?: number;
    estimatedDeckCallsPerMinute?: number;
    reasonerRunsPerMinute?: number;
    visibleReasonerRuns?: number;
    queuedWakeCount?: number;
    runningWakeCount?: number;
    deferredWakeCount?: number;
    activeAskWakeCount?: number;
    completedWakeResults?: number;
    budgetStateCount?: number;
  };
  pressure?: {
    level?: "normal" | "watch" | "limited" | string;
    ratio?: number;
    reasons?: string[];
    queueLoad?: number;
    packetLoad?: number;
    reasonerLoad?: number;
    estimatedReasonerLoad?: number;
    askLoad?: number;
  };
  allowedNextAction?: string;
  assistant_answer: false;
  terminal_eligible: false;
  context_role: "tool_evidence";
  raw_content_included: false;
};

type StagePlayLiveSourceMailListResponse = {
  ok: boolean;
  schema: "stage_play_live_source_mail_list_response/v1";
  view?: "operator" | "overview" | "full";
  requestedThreadId?: string;
  mailboxThreadId?: string;
  mailboxThreadResolution?: Record<string, unknown>;
  wakeAdmissionCycle?: {
    deferredWakeIds?: string[];
    runtimeAdmission?: {
      admitted?: boolean;
      action?: string;
      reason?: string;
      pressureLevel?: string;
      checkedAt?: string;
      source?: string;
      memory?: {
        heapUsedMiB?: number;
        rssMiB?: number;
      };
      limits?: {
        maxHeapUsedMiB?: number;
        maxRssMiB?: number;
      };
      localBypass?: {
        applied?: boolean;
        reason?: string;
      } | null;
    } | null;
    continuation?: {
      scheduled?: boolean;
      reason?: string;
      runnableWakeIds?: string[];
    } | null;
    status?: string;
    reason?: string;
  } | null;
  mailItems?: StagePlayLiveSourceMailItemV1[];
  jobStates?: StagePlayLiveSourceJobStateV1[];
  watchJobPolicies?: StagePlayLiveSourceWatchJobPolicyV1[];
  interpreterProfiles?: StagePlayLiveSourceInterpreterProfileV1[];
  interpreterProfileComparisons?: StagePlayLiveSourceInterpreterProfileComparisonV1[];
  visualObserverProfiles?: StagePlayVisualObserverProfileV1[];
  activeVisualObserverProfile?: StagePlayVisualObserverProfileV1 | null;
  microReasonerPrompts?: StagePlayMicroReasonerPromptV1[];
  microReasonerPromptPresets?: StagePlayMicroReasonerPromptPresetV1[];
  activeMicroReasonerPromptPreset?: StagePlayMicroReasonerPromptPresetV1 | null;
  microReasonerPromptToolActivities?: StagePlayMicroReasonerPromptToolActivityV1[];
  microReasonerRuns?: StagePlayMicroReasonerRunV1[];
  processedMailPackets?: StagePlayProcessedMailPacketV1[];
  decisions?: StagePlayLiveSourceMailDecisionV1[];
  narrativeStates?: StagePlayLiveSourceNarrativeStateV1[];
  wakeRequests?: StagePlayLiveSourceMailWakeRequestV1[];
  wakeResults?: StagePlayLiveSourceMailWakeResultV1[];
  goalContextUpdates?: WorkstationGoalContextUpdateV1[];
  agentGoalSessions?: AgentGoalSessionV1[];
  budgetStates?: LiveSourceBudgetStateV1[];
  mailLoopWorkBudget?: StagePlayMailLoopWorkBudgetV1 | null;
  assistant_answer: false;
  terminal_eligible: false;
  context_role: "tool_evidence";
  raw_content_included: false;
};

type StagePlayMicroReasonerPromptToolActivityV1 = {
  artifactId: "stage_play_micro_reasoner_prompt_tool_activity";
  schemaVersion: "stage_play_micro_reasoner_prompt_tool_activity/v1";
  activityId: string;
  toolName: string;
  action: "query" | "apply" | "create" | "update" | "test";
  status: "running" | "completed" | "failed";
  summary: string;
  sourceIds: string[];
  presetId?: string | null;
  promptId?: string | null;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
  assistant_answer: false;
  terminal_eligible: false;
  context_role: "tool_evidence";
};

type StagePlayLiveSourceMailTranscriptResponse = {
  ok: boolean;
  schema: "stage_play_live_source_mail_transcript_response/v1";
  requestedThreadId?: string;
  mailboxThreadId?: string;
  threadId?: string;
  roomId?: string | null;
  environmentId?: string | null;
  entries?: StagePlayLiveSourceMailTranscriptEntryV1[];
  transcriptRows?: AskTurnTranscriptRowDraftV1[];
  transcriptEntryIds?: string[];
  evidenceRefs?: string[];
  assistant_answer: false;
  terminal_eligible: false;
  context_role: "tool_evidence";
  raw_content_included: false;
};

type StagePlayGraphDisplayMode = "observer_mail_loop_v1" | "full_graph";

type StagePlayMailLoopNode = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  preview: string;
  statusChips?: string[];
  statusBand?: {
    title: string;
    lines: string[];
    tone: "pressure" | "blocked" | "good" | "pending";
  } | null;
  payloadRows?: Array<{
    label: string;
    value: string;
    tone?: "default" | "good" | "warn" | "blocked";
  }>;
  edgeToNext?: {
    label: string;
    tone: "connected" | "pending" | "blocked";
  } | null;
  inputLabel: string;
  inputRefs: string[];
  inputPreview: string;
  transformLabel: string;
  outputLabel: string;
  outputRefs: string[];
  outputPreview: string;
  blockedUntil?: string | null;
  inspector?: {
    kind: "interpreter_profile" | "micro_reasoner_prompt" | "visual_observer_profile";
    title: string;
    profileId?: string;
    promptId?: string;
    linkedNoteId?: string | null;
    linkedNoteTitle?: string | null;
    body: string;
  } | null;
};

type StagePlayJourneyState = "done" | "active" | "blocked" | "pending" | "missing";

type StagePlayMailJourneyStation = {
  key: string;
  title: string;
  status: string;
  body: string;
  meta: string;
  state: StagePlayJourneyState;
  payloads?: StagePlayMailJourneyPayload[];
};

type StagePlayMailJourneyPayload = {
  id: string;
  label: string;
  status: string;
  preview: string;
  meta: string;
  state: StagePlayJourneyState;
  evidenceRefs?: string[];
};

type StagePlayTrafficDetailRow = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "blocked";
};

type StagePlayTrafficDetail = {
  id: string;
  label: string;
  station: string;
  status: string;
  state: StagePlayJourneyState;
  summary: string;
  meta: string;
  rows: StagePlayTrafficDetailRow[];
  evidenceRefs: string[];
};

type StagePlayFlowQueueRow = {
  key: string;
  label: string;
  from: string;
  to: string;
  count: number;
  bytes: number;
  ageMs: number | null;
  status: string;
  tone: StagePlayJourneyState;
};

type StagePlayPacketTrafficStationKey =
  | "visual_source"
  | "observer_shades"
  | "raw_mail"
  | "processed_packet"
  | "micro_reasoner_deck"
  | "ask_handoff"
  | "decision"
  | "output"
  | "loop_state";

type StagePlayPacketTrafficStationStatus =
  | "complete"
  | "pending"
  | "running"
  | "skipped"
  | "failed"
  | "deferred";

type StagePlayPacketTrafficStationState = {
  station: StagePlayPacketTrafficStationKey;
  status: StagePlayPacketTrafficStationStatus;
  preview: string;
  refs: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
};

type StagePlayPacketTrafficReasonerRun = {
  runId: string;
  role: StagePlayMicroReasonerRoleV1;
  status: StagePlayMicroReasonerRunV1["status"] | "missing";
  promptId?: string | null;
  deckExecutionMode?: StagePlayMicroReasonerRunV1["deckExecutionMode"];
  deckProductRole?: boolean | null;
  outputPreview: string;
  inputPreview?: string | null;
  latencyMs?: number | null;
  refs: string[];
};

type StagePlayPacketTrafficDeckSnapshot = {
  presetId?: string | null;
  title?: string | null;
  runPlan?: string | null;
  promptedRoles: StagePlayMicroReasonerRoleV1[];
};

type StagePlayPacketTrafficViewV1 = {
  packetKey: string;
  colorKey: string;
  mailIds: string[];
  packetId?: string | null;
  wakeRequestId?: string | null;
  askTurnId?: string | null;
  decisionId?: string | null;
  voiceReceiptId?: string | null;
  sourceId?: string | null;
  observerProfileId?: string | null;
  observerProfileTitle?: string | null;
  deck?: StagePlayPacketTrafficDeckSnapshot | null;
  deckVerdict?: {
    recommendedNext?: string | null;
    wakeAsk?: boolean | null;
    voiceCandidate?: boolean | null;
    reason?: string | null;
  };
  coalescing?: {
    supersededWakeIds: string[];
    label: string | null;
  };
  status:
    | "mail_received"
    | "packet_ready"
    | "deck_running"
    | "deck_complete"
    | "ask_skipped"
    | "ask_pending"
    | "ask_running"
    | "decision_recorded"
    | "voice_pending"
    | "voice_done"
    | "waiting"
    | "deferred"
    | "failed";
  stationStates: StagePlayPacketTrafficStationState[];
  microReasonerRuns: StagePlayPacketTrafficReasonerRun[];
  goalContextUpdates: WorkstationGoalContextUpdateV1[];
  dispatchActions: WorkstationDispatchActionV1[];
  metrics: {
    mailAgeMs?: number | null;
    packetAgeMs?: number | null;
    deckMs?: number | null;
    rawMailChars?: number | null;
    packetChars?: number | null;
    compactChars?: number | null;
    arbiterChars?: number | null;
    deckChars?: number | null;
    heapMb?: number | null;
    rssMb?: number | null;
    pressure?: string | null;
    rolesPerPacket?: number | null;
    estimatedDeckCallsPerMinute?: number | null;
    reasonerRunsPerMinute?: number | null;
    estimatedReasonerLoad?: number | null;
    activePacketLoad?: number | null;
    queueLoad?: number | null;
  };
};

type StagePlayMailJourneyReasonerRow = {
  role: StagePlayMicroReasonerRoleV1;
  run: StagePlayMicroReasonerRunV1 | null;
  prompt: StagePlayMicroReasonerPromptV1 | null;
  display: {
    title: string;
    subtitle: string;
    missingPreview: string;
  };
};

type StagePlayAppliedMicroDeck = {
  presetId: string;
  title: string;
  sourceId: string | null;
  colorKey: string;
  reason: string;
};

const isActiveStagePlayCheckpointRequest = (request: StagePlayCheckpointRequest): boolean =>
  request.status === "queued" || request.status === "running";

const graphHasCurrentModelReviewedAnswerSnapshot = (
  graph: StagePlayBadgeGraphV1 | null | undefined,
): boolean =>
  Boolean(graph?.badges.some((badge) =>
    badge.kind === "answer_snapshot" &&
    badge.status === "observed" &&
    badge.output?.state === "model_reviewed"
  ));

const stagePlayCheckpointRequestMatchesGraph = (
  request: StagePlayCheckpointRequest,
  graph: StagePlayBadgeGraphV1,
): boolean =>
  request.graphId === graph.graphId || request.currentGraphRefs.includes(graph.graphId);

const stagePlayCheckpointRequestPriority = (
  request: StagePlayCheckpointRequest,
  graph: StagePlayBadgeGraphV1,
): number => {
  const currentGraph = stagePlayCheckpointRequestMatchesGraph(request, graph);
  if (currentGraph && request.status === "running") return 0;
  if (currentGraph && request.reason === "user_requested_checkpoint") return 1;
  if (currentGraph && request.status === "queued") return 2;
  if (request.status === "running") return 3;
  if (request.reason === "user_requested_checkpoint") return 4;
  if (request.status === "queued") return 5;
  return 6;
};

const selectStagePlayVisibleCheckpointRequest = (
  graph: StagePlayBadgeGraphV1 | null | undefined,
): StagePlayCheckpointRequest | null => {
  const indexedRequests = (graph?.checkpointRequests ?? [])
    .map((request, index) => ({ request, index }))
    .filter((entry) => isActiveStagePlayCheckpointRequest(entry.request))
    .filter((entry) =>
      !(
        graphHasCurrentModelReviewedAnswerSnapshot(graph) &&
        entry.request.status === "running" &&
        stagePlayCheckpointRequestMatchesGraph(entry.request, graph as StagePlayBadgeGraphV1)
      )
    );
  if (!graph || indexedRequests.length === 0) return null;
  indexedRequests.sort((left, right) => {
    const priorityDelta =
      stagePlayCheckpointRequestPriority(left.request, graph) -
      stagePlayCheckpointRequestPriority(right.request, graph);
    if (priorityDelta !== 0) return priorityDelta;
    return right.index - left.index;
  });
  return indexedRequests[0]?.request ?? null;
};

type StagePlayLaneId =
  | "observer"
  | "compact_observation"
  | "stage_bounds"
  | "affordances_missing_checks"
  | "procedural_bindings"
  | "helix_ask_checkpoint"
  | "answer_snapshot"
  | "validation_feedback"
  | "live_voice_output";

type StagePlayOutputNodeKind =
  | "live_answer"
  | "feedback"
  | "next_check"
  | "prediction"
  | "validation"
  | "handoff";

type StagePlaySyntheticNodeKind = StagePlayOutputNodeKind | "compact_observation";

type StagePlaySyntheticNode = {
  id: string;
  kind: StagePlaySyntheticNodeKind;
  lane: StagePlayLaneId;
  title: string;
  status: "observed" | "candidate" | "blocked" | "missing_evidence" | "available";
  evidenceRefs: string[];
  relatedBadgeIds: string[];
};

type StagePlayRemovedBadgeGhost = {
  id: string;
  title: string;
  kind: StagePlayBadgeV1["kind"];
  status: StagePlayBadgeV1["status"];
  lane: StagePlayLaneId;
  rowIndex: number;
};

type StagePlayTooltipPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

type StagePlayFloatingTooltip =
  | {
      key: string;
      kind: "badge";
      position: StagePlayTooltipPosition;
      badge: StagePlayBadgeV1;
      observerSources: StagePlayObserverSource[];
    }
  | {
      key: string;
      kind: "output";
      position: StagePlayTooltipPosition;
      node: StagePlaySyntheticNode;
    }
  | {
      key: string;
      kind: "draft";
      position: StagePlayTooltipPosition;
      node: DraftStagePlayNode;
    };

const STAGE_PLAY_LANES: Array<{ id: StagePlayLaneId; title: string }> = [
  { id: "observer", title: "Observer" },
  { id: "compact_observation", title: "Compact Observation" },
  { id: "stage_bounds", title: "Stage Bounds" },
  { id: "affordances_missing_checks", title: "Affordances / Missing Checks" },
  { id: "procedural_bindings", title: "Procedural Bindings" },
  { id: "helix_ask_checkpoint", title: "Helix Ask Checkpoint" },
  { id: "answer_snapshot", title: "Answer Snapshot" },
  { id: "validation_feedback", title: "Validation Feedback" },
  { id: "live_voice_output", title: "Live / Voice Output" },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 88;
const DATA_TRAY_HEIGHT = 74;
const ROW_GAP = 36;
const LANE_GAP = 96;
const CANVAS_PADDING_X = 72;
const CANVAS_PADDING_Y = 64;
const NODE_SLOT_HEIGHT = NODE_HEIGHT + DATA_TRAY_HEIGHT + ROW_GAP;
const LANE_STRIDE = NODE_WIDTH + LANE_GAP;

async function fetchStagePlayBadgeGraph(input: {
  threadId: string;
  roomId?: string | null;
  environmentId?: string | null;
}): Promise<StagePlayBadgeGraphV1> {
  const params = new URLSearchParams();
  params.set("threadId", input.threadId);
  if (input.roomId) params.set("roomId", input.roomId);
  if (input.environmentId) params.set("environmentId", input.environmentId);
  const response = await fetch(`/api/helix/stage-play/graph?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Stage Play graph request failed: ${response.status}`);
  }
  return await response.json() as StagePlayBadgeGraphV1;
}

async function fetchStagePlayLiveSourceMail(input: {
  threadId: string;
  mailboxThreadId?: string | null;
  roomId?: string | null;
  environmentId?: string | null;
  view?: "operator" | "overview" | "full";
  limit?: number;
}): Promise<StagePlayLiveSourceMailListResponse> {
  const params = new URLSearchParams();
  params.set("threadId", input.threadId);
  if (input.mailboxThreadId) params.set("mailboxThreadId", input.mailboxThreadId);
  params.set("view", input.view ?? "full");
  params.set("limit", String(input.limit ?? (input.view === "operator" ? 4 : input.view === "overview" ? 8 : 50)));
  const response = await fetch(`/api/helix/stage-play/live-source-mail?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Stage Play live-source mail request failed: ${response.status}`);
  }
  return await response.json() as StagePlayLiveSourceMailListResponse;
}

async function fetchStagePlayLiveSourceMailTranscript(input: {
  threadId: string;
  mailboxThreadId?: string | null;
  roomId?: string | null;
  environmentId?: string | null;
}): Promise<StagePlayLiveSourceMailTranscriptResponse> {
  const params = new URLSearchParams();
  params.set("threadId", input.threadId);
  if (input.mailboxThreadId) params.set("mailboxThreadId", input.mailboxThreadId);
  params.set("limit", "80");
  const response = await fetch(`/api/helix/stage-play/live-source-mail/transcript?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Stage Play live-source mail transcript request failed: ${response.status}`);
  }
  return await response.json() as StagePlayLiveSourceMailTranscriptResponse;
}

async function dismissStagePlayLiveSourceMailWake(input: {
  wakeRequestId: string;
  reason?: string;
}): Promise<{
  ok: boolean;
  dismissed: boolean;
  wakeRequest?: StagePlayLiveSourceMailWakeRequestV1 | null;
  wakeResult?: StagePlayLiveSourceMailWakeResultV1 | null;
}> {
  const response = await fetch("/api/helix/stage-play/live-source-mail/wake/dismiss", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      wakeRequestId: input.wakeRequestId,
      reason: input.reason ?? "operator_dismissed",
    }),
  });
  if (!response.ok) {
    throw new Error(`Stage Play wake dismiss failed: ${response.status}`);
  }
  return await response.json() as {
    ok: boolean;
    dismissed: boolean;
    wakeRequest?: StagePlayLiveSourceMailWakeRequestV1 | null;
    wakeResult?: StagePlayLiveSourceMailWakeResultV1 | null;
  };
}

async function fetchStagePlayBuilderContext(input: {
  threadId: string;
  environmentId?: string | null;
}): Promise<StagePlayBuilderContextResponse> {
  const params = new URLSearchParams();
  params.set("threadId", input.threadId);
  if (input.environmentId) params.set("environmentId", input.environmentId);
  const response = await fetch(`/api/helix/stage-play/builder?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Stage Play builder request failed: ${response.status}`);
  }
  return await response.json() as StagePlayBuilderContextResponse;
}

async function fetchStagePlayRawSessionBuffer(input: {
  threadId: string;
  roomId?: string | null;
  sourceId?: string | null;
}): Promise<StagePlayRawSessionBufferListResponse> {
  const params = new URLSearchParams();
  params.set("threadId", input.threadId);
  if (input.roomId) params.set("roomId", input.roomId);
  if (input.sourceId) params.set("sourceId", input.sourceId);
  const response = await fetch(`/api/helix/stage-play/raw-session-buffer?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Stage Play raw session buffer request failed: ${response.status}`);
  }
  return await response.json() as StagePlayRawSessionBufferListResponse;
}

async function projectStagePlayLiveAnswer(input: {
  threadId: string;
  roomId?: string | null;
  environmentId?: string | null;
  objective?: string | null;
}): Promise<StagePlayProjectLiveAnswerResponse> {
  const response = await fetch("/api/helix/stage-play/project-live-answer", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      threadId: input.threadId,
      roomId: input.roomId,
      environmentId: input.environmentId,
      objective: input.objective,
      ensureStagePlayLineSchema: true,
      createIfMissing: true,
      preferredPreset: "minecraft_run_monitor",
    }),
  });
  if (!response.ok) {
    throw new Error(`Stage Play projection failed: ${response.status}`);
  }
  return await response.json() as StagePlayProjectLiveAnswerResponse;
}

async function applyStagePlayMicroReasonerPromptPreset(input: {
  presetId: string;
  sourceIds: string[];
}): Promise<{ ok?: boolean; preset?: StagePlayMicroReasonerPromptPresetV1 }> {
  const response = await fetch("/api/helix/stage-play/micro-reasoner-prompt-preset/apply", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`MicroDeck preset apply failed: ${response.status}`);
  }
  return await response.json() as { ok?: boolean; preset?: StagePlayMicroReasonerPromptPresetV1 };
}

async function createStagePlayCustomMicroReasonerPromptPreset(input: {
  title: string;
  description?: string;
  basePresetId?: string | null;
  role: StagePlayMicroReasonerRoleV1;
  template: string;
  sourceIds: string[];
  promptedRoles: StagePlayMicroReasonerRoleV1[];
}): Promise<{
  ok?: boolean;
  preset?: StagePlayMicroReasonerPromptPresetV1;
  prompt?: StagePlayMicroReasonerPromptV1;
  prompts?: StagePlayMicroReasonerPromptV1[];
}> {
  const response = await fetch("/api/helix/stage-play/micro-reasoner-prompt-preset", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Custom MicroDeck save failed: ${response.status}`);
  }
  return await response.json() as {
    ok?: boolean;
    preset?: StagePlayMicroReasonerPromptPresetV1;
    prompt?: StagePlayMicroReasonerPromptV1;
    prompts?: StagePlayMicroReasonerPromptV1[];
  };
}

const rememberStagePlayCustomMicroDeckPreset = (preset: StagePlayMicroReasonerPromptPresetV1): void => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STAGE_PLAY_CUSTOM_MICRODECK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    const next = [
      ...entries.filter((entry: unknown) =>
        entry && typeof entry === "object" && (entry as { presetId?: unknown }).presetId !== preset.presetId
      ),
      {
        presetId: preset.presetId,
        title: preset.title,
        sourceIds: preset.sourceIds,
        savedAt: preset.updatedAt,
        ownerScope: "browser_session",
      },
    ].slice(-25);
    window.localStorage.setItem(STAGE_PLAY_CUSTOM_MICRODECK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser session persistence is a convenience; server-side preset creation is the source of truth for this run.
  }
};

async function validateStagePlayDraft(input: {
  threadId: string;
  environmentId?: string | null;
  draft: unknown;
}): Promise<StagePlayGraphDraftValidationV1> {
  const response = await fetch("/api/helix/stage-play/draft/validate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      threadId: input.threadId,
      environmentId: input.environmentId ?? null,
      draft: input.draft,
    }),
  });
  if (!response.ok && response.status !== 422) {
    throw new Error(`Stage Play draft validation failed: ${response.status}`);
  }
  return await response.json() as StagePlayGraphDraftValidationV1;
}

function sourceOptionFromHandle(handle: StagePlaySourceHandleV1): StagePlaySourceOption {
  const latestObservationRef = [...handle.latestEvidenceRefs].reverse().find((ref) => /observation/i.test(ref));
  return {
    id: handle.descriptorId ?? handle.producerId ?? handle.sourceId,
    sourceId: handle.sourceId,
    label: handle.label ?? (handle.surface ? `${labelize(handle.sourceClass)} on ${labelize(handle.surface)}` : handle.sourceId),
    sourceClass: handle.sourceClass,
    status: handle.status,
    descriptorId: handle.descriptorId ?? null,
    producerId: handle.producerId ?? null,
    surface: handle.surface ?? null,
    origin: handle.origin ?? null,
    cadenceMs: handle.cadenceMs ?? null,
    latestRef: latestObservationRef ?? handle.latestEvidenceRefs.at(-1) ?? null,
    latestEvidenceRefs: handle.latestEvidenceRefs,
  };
}

const isRawBufferRef = (ref: string): boolean =>
  ref.startsWith("stage_play_raw_session_buffer_entry:");

const isCompactObservationRef = (ref: string): boolean =>
  !isRawBufferRef(ref) && /(?:observation|snapshot|chunk|evidence|visual|transcript|event|descriptor|producer|capability)/i.test(ref);

function labelize(value: string): string {
  return value.replace(/[._-]/g, " ");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b));
}

function readClientCoordinate(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function formatStagePlayClock(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const STAGE_PLAY_STEERING_ROW_KINDS = new Set<AskTurnTranscriptRowDraftV1["rowKind"]>([
  "voice_steering_received",
  "voice_steering_queued",
  "voice_steering_applied",
  "voice_steering_deferred",
  "voice_steering_rejected",
  "voice_steering_cancel_requested",
  "steering_ack_receipt",
]);

function isStagePlaySteeringTranscriptRow(row: AskTurnTranscriptRowDraftV1): boolean {
  return STAGE_PLAY_STEERING_ROW_KINDS.has(row.rowKind);
}

function stagePlaySteeringRowLabel(rowKind: AskTurnTranscriptRowDraftV1["rowKind"]): string {
  if (rowKind === "voice_steering_received") return "Voice steering received";
  if (rowKind === "voice_steering_queued") return "Voice steering queued";
  if (rowKind === "voice_steering_applied") return "Voice steering applied";
  if (rowKind === "voice_steering_deferred") return "Voice steering deferred";
  if (rowKind === "voice_steering_rejected") return "Voice steering rejected";
  if (rowKind === "voice_steering_cancel_requested") return "Voice steering cancel";
  if (rowKind === "steering_ack_receipt") return "Steering ack receipt";
  return labelize(rowKind);
}

function compactStagePlayText(value: string | null | undefined, fallback: string, max = 160): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...` : text;
}

function compactStagePlayMailPreview(value: string | null | undefined, fallback: string, max = 140): string {
  const raw = String(value ?? "").trim();
  const unfenced = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  if (unfenced.startsWith("{")) {
    try {
      const parsed = JSON.parse(unfenced) as Record<string, unknown>;
      const hud = readStagePlayRecord(parsed.hud);
      const hotbar = readStagePlayRecord(parsed.hotbar);
      const parts = [
        readStagePlayString(parsed.scene) ? `scene: ${readStagePlayString(parsed.scene)}` : null,
        readStagePlayScalar(hud.health) ? `health: ${readStagePlayScalar(hud.health)}` : null,
        readStagePlayScalar(hud.hunger) ? `hunger: ${readStagePlayScalar(hud.hunger)}` : null,
        readStagePlayScalar(hud.armor) ? `armor: ${readStagePlayScalar(hud.armor)}` : null,
        readStagePlayScalar(hotbar.selected_item) ? `item: ${readStagePlayScalar(hotbar.selected_item)}` : null,
      ].filter((part): part is string => Boolean(part));
      if (parts.length > 0) return compactStagePlayText(parts.join(" | "), fallback, max);
    } catch {
      // Fall back to plain compaction below.
    }
  }
  return compactStagePlayText(unfenced || raw, fallback, max)
    .replace(/[{}"]/g, "")
    .replace(/\\n/g, " ");
}

function readStagePlayRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStagePlayString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStagePlayScalar(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function readStagePlayList(value: unknown, max = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readStagePlayScalar(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, max);
}

function parseStagePlayVisualSummaryJson(value: string): Record<string, unknown> | null {
  const text = value.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? text;
  if (!jsonText.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonText);
    return readStagePlayRecord(parsed);
  } catch {
    return null;
  }
}

function formatStagePlayLiveSummaryForOverview(
  mail: StagePlayLiveSourceMailItemV1 | null | undefined,
): string {
  const preview = mail?.summary.preview?.trim();
  if (preview) return compactStagePlayText(preview, "Waiting for visual summary mail.", 720);
  const rawSummary = mail?.summary.text || "";
  const parsed = parseStagePlayVisualSummaryJson(rawSummary);
  const segments: string[] = [];
  if (parsed) {
    const hud = readStagePlayRecord(parsed.hud);
    const hotbar = readStagePlayRecord(parsed.hotbar);
    const scene = readStagePlayScalar(parsed.scene);
    const action = readStagePlayScalar(parsed.current_action);
    const selected = readStagePlayScalar(parsed.selected_item);
    const health = readStagePlayScalar(hud.health);
    const damage = readStagePlayScalar(hud.damage_cues);
    const lowHealth = readStagePlayScalar(hud.low_health_cues);
    const selectedSlot = readStagePlayScalar(hotbar.selected_slot);
    const entities = readStagePlayList(parsed.visible_entities);
    const risks = readStagePlayList(parsed.risk_cues);
    const opportunities = readStagePlayList(parsed.opportunity_cues);
    const changed = readStagePlayList(parsed.changed_since_last_frame);
    const prediction = readStagePlayString(parsed.next_10s_prediction);

    if (scene) segments.push(`Scene: ${scene}.`);
    if (action) segments.push(`Action: ${action}.`);
    if (selected || selectedSlot) segments.push(`Held state: ${selected ?? "selected item unknown"}${selectedSlot ? ` in slot ${selectedSlot}` : ""}.`);
    if (health || damage || lowHealth) {
      segments.push(`Player state: ${[
        health ? `health ${health}` : null,
        damage && damage !== "none visible" ? `damage ${damage}` : null,
        lowHealth && lowHealth !== "none visible" ? `low health ${lowHealth}` : null,
      ].filter(Boolean).join(", ") || "no visible damage cues"}.`);
    }
    segments.push(`Visible entities: ${entities.length ? entities.join(", ") : "none reported"}.`);
    segments.push(`Risk cues: ${risks.length ? risks.join(", ") : "none reported"}.`);
    if (opportunities.length) segments.push(`Opportunity cues: ${opportunities.join(", ")}.`);
    if (changed.length) segments.push(`Changed: ${changed.join(", ")}.`);
    if (prediction) segments.push(`Next 10s: ${prediction}.`);
  } else if (rawSummary) {
    segments.push(compactStagePlayText(rawSummary, "Waiting for visual summary mail.", 420));
  }

  return compactStagePlayText(segments.join(" "), "Waiting for visual summary mail.", 720);
}

function formatStagePlayDeckVerdictForOverview(
  packet: StagePlayProcessedMailPacketV1 | null,
): string {
  const segments: string[] = [];
  const effort = packet?.effortEstimate?.currentEffort;
  const arbiter = packet?.arbiter;
  if (effort || packet?.recommendedNext) {
    segments.push(`Deck verdict: ${effort ? labelize(effort) : "effort unknown"}; ${labelize(arbiter?.recommendedNext ?? packet?.recommendedNext ?? "wait_for_next_summary")}.`);
  }
  if (arbiter?.reason) segments.push(`Reason: ${arbiter.reason}.`);

  return compactStagePlayText(segments.join(" "), "Micro-reasoner deck has not produced an interrupt verdict yet.", 420);
}

function statusTone(status: string): string {
  if (status === "blocked") return "border-rose-700 bg-rose-950/40 text-rose-100";
  if (status === "missing_evidence") return "border-amber-700 bg-amber-950/40 text-amber-100";
  if (status === "candidate" || status === "ask_user_required") return "border-cyan-700 bg-cyan-950/40 text-cyan-100";
  if (status === "available" || status === "observed") return "border-emerald-700 bg-emerald-950/35 text-emerald-100";
  return "border-slate-700 bg-slate-950/70 text-slate-200";
}

function kindTone(kind: string): string {
  if (kind === "observer") return "border-amber-800/70 bg-amber-950/25";
  if (kind === "source") return "border-sky-800/70 bg-sky-950/25";
  if (kind === "workstation_state_plane") return "border-teal-800/70 bg-teal-950/25";
  if (kind === "fusion") return "border-indigo-800/70 bg-indigo-950/25";
  if (kind === "interpreter") return "border-fuchsia-800/70 bg-fuchsia-950/25";
  if (kind === "hazard" || kind === "blocked_affordance") return "border-rose-800/70 bg-rose-950/25";
  if (kind === "procedural_binding" || kind === "intent_module") return "border-violet-800/70 bg-violet-950/25";
  if (kind === "affordance" || kind === "resource") return "border-emerald-800/70 bg-emerald-950/25";
  if (kind === "setting" || kind === "actor") return "border-cyan-800/70 bg-cyan-950/25";
  return "border-slate-800 bg-slate-950/70";
}

function laneForBadge(badge: StagePlayBadgeV1): StagePlayLaneId {
  if (badge.kind === "observer" || badge.kind === "source") return "observer";
  if (
    badge.kind === "compact_observation" ||
    badge.kind === "fusion" ||
    badge.kind === "interpreter" ||
    badge.kind === "workstation_state_plane" ||
    badge.kind === "goal_context_update" ||
    badge.kind === "agent_goal_session"
  ) {
    return "compact_observation";
  }
  if (
    badge.kind === "setting" ||
    badge.kind === "actor" ||
    badge.kind === "prop" ||
    badge.kind === "resource" ||
    badge.kind === "hazard" ||
    badge.kind === "constraint" ||
    badge.kind === "goal" ||
    badge.kind === "world_state"
  ) return "stage_bounds";
  if (
    badge.kind === "affordance" ||
    badge.kind === "blocked_affordance" ||
    badge.kind === "recommended_check" ||
    badge.kind === "missing_evidence" ||
    badge.kind === "admission_gate"
  ) return "affordances_missing_checks";
  if (badge.kind === "intent_module" || badge.kind === "procedural_binding") return "procedural_bindings";
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint" || badge.kind === "checkpoint_request" || badge.kind === "perturbation") return "helix_ask_checkpoint";
  if (badge.kind === "answer_snapshot") return "answer_snapshot";
  if (badge.kind === "live_output" || badge.kind === "voice_output") return "live_voice_output";
  return "stage_bounds";
}

function laneForDraftNode(node: DraftStagePlayNode): StagePlayLaneId {
  return laneForBadge(node as unknown as StagePlayBadgeV1);
}

function removedGhostsForDiff(
  previous: StagePlayBadgeGraphV1,
  diff: StagePlayGraphDiff,
): StagePlayRemovedBadgeGhost[] {
  return diff.removedBadgeIds
    .map((id) => {
      const badge = previous.badges.find((entry) => entry.id === id);
      if (!badge) return null;
      const lane = laneForBadge(badge);
      const rowIndex = previous.badges
        .filter((entry) => laneForBadge(entry) === lane)
        .findIndex((entry) => entry.id === badge.id);
      return {
        id: badge.id,
        title: badge.title,
        kind: badge.kind,
        status: badge.status,
        lane,
        rowIndex: Math.max(0, rowIndex),
      };
    })
    .filter((entry): entry is StagePlayRemovedBadgeGhost => Boolean(entry));
}

function compactRefTitle(ref: string): string {
  if (ref.includes(":")) return ref.split(":").slice(0, 2).join(":");
  return ref;
}

function syntheticNodeTone(node: StagePlaySyntheticNode): string {
  if (node.kind === "prediction") return "border-cyan-700 bg-cyan-950/35 text-cyan-100";
  if (node.kind === "validation") {
    return node.status === "blocked"
      ? "border-rose-700 bg-rose-950/35 text-rose-100"
      : "border-emerald-700 bg-emerald-950/30 text-emerald-100";
  }
  if (node.kind === "live_answer") return "border-slate-500 bg-slate-900/85 text-slate-100";
  if (node.kind === "handoff") return "border-violet-700 bg-violet-950/35 text-violet-100";
  if (node.kind === "compact_observation") return "border-sky-700 bg-sky-950/30 text-sky-100";
  if (node.status === "blocked") return "border-rose-700 bg-rose-950/35 text-rose-100";
  if (node.status === "missing_evidence") return "border-amber-700 bg-amber-950/35 text-amber-100";
  return "border-amber-700 bg-amber-950/25 text-amber-100";
}

function collectGraphRefs(graph: StagePlayBadgeGraphV1): string[] {
  return uniqueSorted([
    ...graph.sourceWindow.latestObservationRefs,
    ...(graph.sourceWindow.latestSourceDescriptorRefs ?? []),
    ...(graph.sourceWindow.latestSourceProducerRefs ?? []),
    ...(graph.sourceWindow.latestRawSessionBufferRefs ?? []),
    ...graph.sourceWindow.latestSnapshotRefs,
    ...graph.sourceWindow.latestDeltaOverlayRefs,
    ...graph.sourceWindow.latestNavigationRefs,
    ...graph.sourceWindow.sources.flatMap((source) => source.evidenceRefs),
    ...graph.badges.flatMap((badge) => [
      ...badge.evidenceRefs,
      ...badge.sourceRefs.map((ref) => ref.id),
    ]),
    ...graph.recommendedActions.flatMap((action) => action.evidenceRefs),
  ]);
}

function outputNodesForGraph(graph: StagePlayBadgeGraphV1): StagePlaySyntheticNode[] {
  const graphRefs = collectGraphRefs(graph);
  const compactObservationRefs = uniqueSorted([
    ...graph.sourceWindow.latestObservationRefs,
    ...graphRefs.filter((ref) => /stage_play_compact_observation|live_source_observation|visual_observation|audio_transcript|transcript_observation/i.test(ref)),
  ]);
  const predictionRefs = graphRefs.filter((ref) => /stage_play_prediction_hypothesis/i.test(ref));
  const validationRefs = graphRefs.filter((ref) => /stage_play_prediction_validation/i.test(ref));
  const liveAnswerSources = graph.sourceWindow.sources.filter((source) => source.routeTo === "live_answer_output");
  const compactNodes: StagePlaySyntheticNode[] = compactObservationRefs.slice(0, 10).map((ref) => ({
    id: `synthetic:compact:${ref}`,
    kind: "compact_observation",
    lane: "compact_observation",
    title: compactRefTitle(ref),
    status: "observed",
    evidenceRefs: [ref],
    relatedBadgeIds: graph.badges
      .filter((badge) => badge.evidenceRefs.includes(ref) || badge.sourceRefs.some((sourceRef) => sourceRef.id === ref))
      .map((badge) => badge.id),
  }));
  const predictionNodes: StagePlaySyntheticNode[] = predictionRefs.slice(0, 8).map((ref) => ({
    id: `synthetic:prediction:${ref}`,
    kind: "prediction",
    lane: "affordances_missing_checks",
    title: compactRefTitle(ref),
    status: "candidate",
    evidenceRefs: [ref],
    relatedBadgeIds: [],
  }));
  const validationNodes: StagePlaySyntheticNode[] = validationRefs.slice(0, 8).map((ref) => ({
    id: `synthetic:validation:${ref}`,
    kind: "validation",
    lane: "validation_feedback",
    title: compactRefTitle(ref),
    status: /missed|blocked|fail/i.test(ref) ? "blocked" : "observed",
    evidenceRefs: [ref],
    relatedBadgeIds: [],
  }));
  const nextCheckNodes: StagePlaySyntheticNode[] = graph.recommendedActions.map((action) => ({
    id: `synthetic:action:${action.id}`,
    kind: action.admission === "ask_user" ? "handoff" : "next_check",
    lane: "affordances_missing_checks",
    title: action.label,
    status: action.admission === "blocked"
      ? "blocked"
      : action.missingEvidence.length > 0
        ? "missing_evidence"
        : "candidate",
    evidenceRefs: action.evidenceRefs,
    relatedBadgeIds: graph.badges
      .filter((badge) =>
        action.evidenceRefs.some((ref) => badge.evidenceRefs.includes(ref)) ||
        action.reasonCodes.some((code) => badge.reasonCodes.includes(code))
      )
      .map((badge) => badge.id),
  }));
  const liveAnswerNodes: StagePlaySyntheticNode[] = liveAnswerSources.map((source) => ({
    id: `synthetic:live-answer:${source.sourceId}:${source.modality}`,
    kind: "live_answer",
    lane: "live_voice_output",
    title: labelize(source.modality),
    status: source.status === "active" ? "observed" : source.status === "configured_missing" ? "missing_evidence" : "candidate",
    evidenceRefs: source.evidenceRefs,
    relatedBadgeIds: [],
  }));
  return [...compactNodes, ...predictionNodes, ...nextCheckNodes, ...validationNodes, ...liveAnswerNodes];
}

function proceduralExpression(badge: StagePlayBadgeV1): string {
  if (badge.intentModule) {
    return [
      badge.intentModule.verb,
      ...(badge.intentModule.requires ?? []),
      ...(badge.intentModule.preserves ?? []),
      ...(badge.intentModule.blocks ?? []),
    ].filter(Boolean).join(" + ");
  }
  return badge.reasonCodes.join(" + ");
}

function badgeActionLine(badge: StagePlayBadgeV1): string {
  if (badge.kind === "observer") return "Source custody and routing";
  if (badge.kind === "source") return "Routed live source";
  if (badge.id === "workstation_state_plane.terminal_authority") return "Terminal authority boundary";
  if (badge.kind === "workstation_state_plane") return "Workstation state plane";
  if (badge.kind === "goal_context_update") return "Goal context update";
  if (badge.kind === "agent_goal_session") return "Agent goal session";
  if (badge.kind === "compact_observation") return "Compact source window";
  if (badge.kind === "stage_interpretation") return "Current interpreted stage bounds";
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint") return "Model checkpoint boundary";
  if (badge.kind === "checkpoint_request") return "Queued checkpoint request";
  if (badge.kind === "answer_snapshot") return "Model-reviewed answer snapshot";
  if (badge.kind === "live_output" || badge.kind === "voice_output") return "Reviewed output lane";
  if (badge.kind === "perturbation") return "Source-window perturbation";
  if (badge.kind === "fusion") return "Source fusion state";
  if (badge.kind === "procedural_binding") return `Assembles: ${proceduralExpression(badge)}`;
  if (badge.kind === "intent_module") return `Verb: ${proceduralExpression(badge)}`;
  if (badge.kind === "affordance") return "Available move candidate";
  if (badge.kind === "blocked_affordance") return "Blocked move boundary";
  if (badge.kind === "hazard") return "Constrains possible moves";
  if (badge.kind === "resource" || badge.kind === "prop") return "Can support or block a procedure";
  return "Observed stage condition";
}

function selectedNodeConsoleTitle(badge: StagePlayBadgeV1 | null): string {
  if (!badge) return "Builder Palette";
  if (badge.kind === "observer") return "Observer Source Setup";
  if (badge.kind === "source") return "Source Routing";
  if (badge.id === "workstation_state_plane.terminal_authority") return "Terminal Authority";
  if (badge.kind === "workstation_state_plane") return "Workstation State Plane";
  if (badge.kind === "goal_context_update") return "Goal Context Update";
  if (badge.kind === "agent_goal_session") return "Agent Goal Session";
  if (badge.kind === "compact_observation") return "Compact Observation Evidence";
  if (badge.kind === "procedural_binding") return "Procedural Binding";
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint") return "Helix Ask Checkpoint";
  if (badge.kind === "checkpoint_request") return "Checkpoint Request";
  if (badge.kind === "answer_snapshot") return "Answer Snapshot";
  if (badge.kind === "live_output") return "Live Output";
  if (badge.kind === "voice_output") return "Voice Output";
  if (badge.kind === "perturbation") return "Perturbation";
  if (badge.id === "interpreter.stage_play_reflection") return "Stage Interpreter";
  return labelize(badge.kind);
}

function selectedNodeConsoleDescription(badge: StagePlayBadgeV1 | null): string {
  if (!badge) {
    return "Add node types, watch live evidence fill them, and assemble procedures without granting execution.";
  }
  if (badge.kind === "observer") return "Configure source custody, routing, cadence, and audit buffers.";
  if (badge.kind === "source") return "Route this source into Stage Play and inspect its evidence custody.";
  if (badge.id === "workstation_state_plane.terminal_authority") {
    return "Inspect the completed-solver boundary that keeps receipts, MicroDeck outputs, narrator events, and panel projections from becoming final answers.";
  }
  if (badge.kind === "workstation_state_plane") return "Inspect deterministic workstation process state without granting answer or action authority.";
  if (badge.kind === "goal_context_update") return "Inspect a durable, non-terminal workstation context update and its dispatch suggestions.";
  if (badge.kind === "agent_goal_session") return "Inspect the active goal session feeds, actuator bounds, checkpoints, and terminal authority requirement.";
  if (badge.kind === "compact_observation") return "Inspect compact facts, evidence refs, and raw-buffer audit links.";
  if (badge.kind === "procedural_binding") return "Inspect the expression and badges that support this procedure.";
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint") return "Inspect Ask turn refs, tool observation refs, and solver/debug status.";
  if (badge.kind === "checkpoint_request") return "Inspect the queued checkpoint request and live-job queue controls.";
  if (badge.kind === "answer_snapshot") return "Inspect the upheld model-reviewed answer and supporting refs.";
  if (badge.kind === "perturbation") return "Inspect source-window changes, affected badges, and whether a checkpoint is suggested.";
  if (badge.kind === "live_output" || badge.kind === "voice_output") {
    return "Inspect projection state, output text, refs, and voice eligibility.";
  }
  if (badge.id === "interpreter.stage_play_reflection") {
    return "Project current Stage Play evidence lanes into Live Interpretation without creating answer snapshot authority.";
  }
  return "Inspect the selected node without mixing in unrelated builder controls.";
}

function inspectorTestIdForBadge(badge: StagePlayBadgeV1): string {
  if (badge.kind === "observer") return "stage-play-observer-node-controls";
  if (badge.kind === "source") return "stage-play-source-node-controls";
  if (badge.id === "workstation_state_plane.terminal_authority") return "stage-play-terminal-authority-node-controls";
  if (badge.kind === "compact_observation") return "stage-play-compact-observation-node-controls";
  if (badge.kind === "procedural_binding") return "stage-play-procedural-binding-node-controls";
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint") return "stage-play-ask-checkpoint-node-controls";
  if (badge.kind === "checkpoint_request") return "stage-play-checkpoint-request-node-controls";
  if (badge.kind === "answer_snapshot") return "stage-play-answer-snapshot-node-controls";
  if (badge.kind === "live_output") return "stage-play-live-output-node-controls";
  if (badge.kind === "voice_output") return "stage-play-voice-output-node-controls";
  if (badge.kind === "perturbation") return "stage-play-perturbation-node-controls";
  if (badge.id === "interpreter.stage_play_reflection") return "stage-play-interpreter-node-controls";
  return "stage-play-selected-node-controls";
}

function badgeReferenceTokens(badge: StagePlayBadgeV1): Set<string> {
  return new Set([
    badge.id,
    ...badge.evidenceRefs,
    ...(badge.dataTray?.evidenceRefs ?? []),
    ...badge.sourceRefs.map((ref) => ref.id),
    ...badge.sourceRefs.map((ref) => `${ref.kind}:${ref.id}`),
  ]);
}

function isModelReviewedAnswerSnapshot(badge: StagePlayBadgeV1): boolean {
  const modelReviewedMarkers = [...badge.tags, ...badge.reasonCodes].some((value) =>
    /model_reviewed|model_authored|answer_snapshot_from_checkpoint|answer_snapshot_from_model_authored_checkpoint/i.test(value)
  );
  return (
    badge.kind === "answer_snapshot" &&
    badge.output?.state === "model_reviewed" &&
    (badge.checkpoint?.modelReviewed === true || modelReviewedMarkers)
  );
}

function findCitedModelReviewedAnswerSnapshot(
  badge: StagePlayBadgeV1,
  answerSnapshots: StagePlayBadgeV1[],
): StagePlayBadgeV1 | null {
  const refs = badgeReferenceTokens(badge);
  return answerSnapshots.find((snapshot) => {
    if (!isModelReviewedAnswerSnapshot(snapshot)) return false;
    const snapshotRefs = badgeReferenceTokens(snapshot);
    return refs.has(snapshot.id) ||
      refs.has(`badge:${snapshot.id}`) ||
      refs.has(`stage_play_badge:${snapshot.id}`) ||
      Array.from(snapshotRefs).some((ref) => refs.has(ref) && /answer_snapshot/i.test(ref));
  }) ?? null;
}

function compactTrayText(value: string | null | undefined, fallback: string): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
}

type StagePlayBadgeTrayView = {
  title: string;
  metric: string;
  summary: string;
  detail: string;
};

function compactTrayMetric(value: string | number | null | undefined, fallback: string): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > 34 ? `${text.slice(0, 31).trimEnd()}...` : text;
}

function stagePlayDataFlowRefs(badge: StagePlayBadgeV1): string[] {
  return uniqueSorted([
    ...(badge.dataTray?.inputRefs ?? []),
    ...(badge.dataTray?.toolRefs ?? []),
    ...(badge.dataTray?.outputRefs ?? []),
    ...(badge.dataTray?.evidenceRefs ?? []),
  ]);
}

function hasStagePlayDataFlowTray(badge: StagePlayBadgeV1): boolean {
  return Boolean(
    badge.dataTray?.transformLabel ||
      badge.dataTray?.inputRefs?.length ||
      badge.dataTray?.toolRefs?.length ||
      badge.dataTray?.outputRefs?.length ||
      badge.dataTray?.inputPreview ||
      badge.dataTray?.toolPreview ||
      badge.dataTray?.outputPreview ||
      badge.dataTray?.skipped?.length ||
      badge.dataTray?.blockedUntil,
  );
}

function copyStagePlayRefs(refs: string[]): void {
  if (refs.length === 0) return;
  void copyStagePlayText(refs.join("\n"), "stage-play.copy_data_flow_refs");
}

async function copyStagePlayText(value: string, commandId = "stage-play.copy_text"): Promise<boolean> {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!navigator.clipboard?.writeText) return false;
  try {
    await recordWorkstationCommandLifecycle(
      {
        command_id: commandId,
        command_family: "clipboard",
        panel_id: "stage-play-badge-graph",
        success_stage: "clipboard_write_succeeded",
        failure_stage: "clipboard_write_failed",
      },
      () => navigator.clipboard.writeText(text),
    );
    return true;
  } catch {
    return false;
  }
}

function CopyStagePlayRefsButton({ refs, label = "Copy refs" }: { refs: string[]; label?: string }) {
  if (refs.length === 0) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        copyStagePlayRefs(refs);
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-100"
      aria-label={label}
      title={label}
      data-testid="stage-play-copy-data-flow-refs"
    >
      <Copy className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function buildStagePlayMailLoopUnifiedTrace(input: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
}) {
  const mailbox = input.mailbox ?? null;
  const mailItems = mailbox?.mailItems ?? [];
  const packets = mailbox?.processedMailPackets ?? [];
  const wakeRequests = mailbox?.wakeRequests ?? [];
  const wakeResults = mailbox?.wakeResults ?? [];
  const decisions = mailbox?.decisions ?? [];
  const runs = mailbox?.microReasonerRuns ?? [];
  const latestMail = latestStagePlayMailItem(mailItems, (item) => item.sourceKind === "visual_frame") ?? latestStagePlayMailItem(mailItems);
  const latestPacket = latestStagePlayPacketForMail(packets, latestMail?.mailId);
  const latestWake =
    latestStagePlayMailWakeRequest(wakeRequests, latestMail?.mailId) ??
    latestStagePlayMailWakeRequest(wakeRequests);
  const latestWakeResult =
    latestStagePlayMailWakeResult(wakeResults, latestWake?.wakeRequestId ?? null) ??
    latestStagePlayMailWakeResult(wakeResults);
  const events = [
    ...mailItems.map((mail) => ({
      ts: mail.createdAt,
      stage: "mail_received",
      artifactId: mail.mailId,
      status: mail.status,
      sourceId: mail.sourceId,
      preview: compactStagePlayMailPreview(mail.summary.preview || mail.summary.text, "", 220),
      evidenceRefs: mail.evidenceRefs.slice(0, 12),
    })),
    ...packets.map((packet) => ({
      ts: packet.createdAt,
      stage: "processed_packet",
      artifactId: packet.packetId,
      status: packet.recommendedNext,
      mailIds: packet.mailIds,
      effort: packet.effortEstimate?.currentEffort ?? null,
      wakeAsk: packet.arbiter?.wakeAsk ?? null,
      arbiter: packet.arbiter ? {
        recommendedNext: packet.arbiter.recommendedNext,
        reason: packet.arbiter.reason,
        confidence: packet.arbiter.confidence,
        voiceCandidate: packet.arbiter.voiceCandidate,
        selectedHypothesis: packet.arbiter.selectedHypothesis ?? null,
      } : null,
      evidenceRefs: packet.evidenceRefs.slice(0, 12),
    })),
    ...wakeRequests.map((wake) => ({
      ts: wake.updatedAt || wake.queuedAt,
      stage: "wake_request",
      artifactId: wake.wakeRequestId,
      status: wake.status,
      wakeIntent: wake.wakeIntent ?? "process_unread_mail",
      lifecycleStage: wake.lifecycleStage ?? null,
      reason: wake.reason,
      failureReason: wake.failureReason ?? null,
      askTurnId: wake.askTurnId ?? null,
      decisionIds: wake.decisionIds,
      nextRetryAt: wake.nextRetryAt ?? null,
      mailIds: wake.mailIds,
      evidenceRefs: wake.evidenceRefs.slice(0, 12),
    })),
    ...wakeResults.map((result) => ({
      ts: result.createdAt,
      stage: "wake_result",
      artifactId: result.wakeResultId,
      wakeRequestId: result.wakeRequestId,
      status: result.status,
      wakeIntent: result.wakeIntent ?? null,
      lifecycleStage: result.lifecycleStage ?? null,
      failedReason: result.failedReason ?? null,
      skippedReason: result.skippedReason ?? null,
      askTurnId: result.askTurnId ?? null,
      decisionIds: result.decisionIds,
      budgetStateRef: result.budgetStateRef ?? null,
      evidenceRefs: result.evidenceRefs.slice(0, 12),
    })),
    ...decisions.map((decision) => ({
      ts: decision.createdAt,
      stage: "mail_decision",
      artifactId: decision.decisionId,
      status: decision.decision,
      requestedTool: decision.requestedTool ?? null,
      nextLoopState: decision.nextLoopState,
      voiceAllowed: decision.voicePolicy?.allowedNow ?? null,
      modelReviewed: decision.modelReviewed,
      mailIds: decision.mailIds,
      evidenceRefs: decision.evidenceRefs.slice(0, 12),
    })),
  ].sort((left, right) => String(left.ts ?? "").localeCompare(String(right.ts ?? "")));
  const terminalCoverage = wakeResults.map((result) => ({
    wakeRequestId: result.wakeRequestId,
    resultId: result.wakeResultId,
    reachedAsk: Boolean(result.askTurnId),
    reachedDecision: result.decisionIds.length > 0,
    reachedTerminalCheckpoint:
      result.status === "completed" ||
      result.lifecycleStage === "voice_completed" ||
      result.lifecycleStage === "terminal_checkpoint",
    status: result.status,
    lifecycleStage: result.lifecycleStage ?? null,
    failure: result.failedReason ?? result.skippedReason ?? null,
  }));
  return {
    schema: "helix.stage_play.mail_loop_unified_trace.v1",
    exportedAt: new Date().toISOString(),
    graphId: input.graph.graphId,
    requestedThreadId: mailbox?.requestedThreadId ?? null,
    mailboxThreadId: mailbox?.mailboxThreadId ?? null,
    counts: {
      mail: mailItems.length,
      processedPackets: packets.length,
      microReasonerRuns: runs.length,
      wakeRequests: wakeRequests.length,
      wakeResults: wakeResults.length,
      decisions: decisions.length,
    },
    latest: {
      mailId: latestMail?.mailId ?? null,
      packetId: latestPacket?.packetId ?? null,
      packetRecommendedNext: latestPacket?.recommendedNext ?? null,
      effort: latestPacket?.effortEstimate?.currentEffort ?? null,
      arbiterRecommendedNext: latestPacket?.arbiter?.recommendedNext ?? null,
      arbiterWakeAsk: latestPacket?.arbiter?.wakeAsk ?? null,
      wakeRequestId: latestWake?.wakeRequestId ?? null,
      wakeStatus: latestWake?.status ?? null,
      wakeLifecycleStage: latestWake?.lifecycleStage ?? null,
      wakeFailureReason: latestWake?.failureReason ?? null,
      wakeAskTurnId: latestWake?.askTurnId ?? null,
      wakeResultId: latestWakeResult?.wakeResultId ?? null,
      wakeResultStatus: latestWakeResult?.status ?? null,
      wakeResultFailure: latestWakeResult?.failedReason ?? null,
      wakeResultAskTurnId: latestWakeResult?.askTurnId ?? null,
    },
    pressure: {
      admissionStatus: mailbox?.wakeAdmissionCycle?.status ?? null,
      admissionReason: mailbox?.wakeAdmissionCycle?.reason ?? null,
      deferredWakeIds: mailbox?.wakeAdmissionCycle?.deferredWakeIds ?? [],
      runtimeAdmission: mailbox?.wakeAdmissionCycle?.runtimeAdmission ?? null,
      continuation: mailbox?.wakeAdmissionCycle?.continuation ?? null,
    },
    terminalCoverage,
    events,
    authority: {
      assistant_answer: false,
      terminal_eligible: false,
      context_role: "tool_evidence",
      raw_content_included: false,
      note: "Mailbox trace covers pre-Ask paths; final-answer debug export only exists when an Ask turn id is present.",
    },
  };
}

const isStagePlayVoiceCheckpointRef = (ref: string): boolean =>
  /(?:voice_receipt|voice_callout_receipt|voice_hold_receipt|voice_block_receipt|voice_delivery_receipt|live_source_interim_voice_callout_receipt|helix_interim_voice_callout_receipt)/i.test(ref);

function latestByIso<T>(values: T[], readIso: (value: T) => string | null | undefined): T | null {
  return values
    .slice()
    .sort((left, right) => String(readIso(left) ?? "").localeCompare(String(readIso(right) ?? "")))
    .at(-1) ?? null;
}

function buildStagePlayPacketScopedTrace(input: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
  packetKey?: string | null;
}) {
  const mailbox = input.mailbox ?? null;
  const mailItems = mailbox?.mailItems ?? [];
  const packets = mailbox?.processedMailPackets ?? [];
  const runs = mailbox?.microReasonerRuns ?? [];
  const wakeRequests = mailbox?.wakeRequests ?? [];
  const wakeResults = mailbox?.wakeResults ?? [];
  const decisions = mailbox?.decisions ?? [];
  const key = input.packetKey ?? null;
  const selectedPacket =
    packets.find((packet) => packet.packetId === key) ??
    packets.find((packet) => packet.mailIds.includes(String(key ?? ""))) ??
    latestStagePlayPacketForMail(packets, String(key ?? "")) ??
    latestByIso(packets, (packet) => packet.createdAt);
  const selectedMailIds = selectedPacket?.mailIds ?? (key ? [key] : []);
  const rawVisualMail = mailItems.filter((mail) =>
    selectedMailIds.includes(mail.mailId) || selectedPacket?.sourceId === mail.sourceId
  );
  const selectedWake =
    wakeRequests
      .filter((wake) =>
        (selectedPacket?.packetId && (wake.packetIds ?? []).includes(selectedPacket.packetId)) ||
        wake.mailIds.some((mailId) => selectedMailIds.includes(mailId))
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .at(-1) ??
    latestStagePlayMailWakeRequest(wakeRequests, selectedMailIds[0] ?? null);
  const selectedWakeResult = selectedWake
    ? latestStagePlayMailWakeResult(wakeResults, selectedWake.wakeRequestId)
    : null;
  const decisionIds = uniqueSorted([
    ...(selectedWake?.decisionIds ?? []),
    ...(selectedWakeResult?.decisionIds ?? []),
  ]);
  const selectedDecisions = decisions.filter((decision) =>
    decisionIds.includes(decision.decisionId) ||
    decision.mailIds.some((mailId) => selectedMailIds.includes(mailId))
  );
  const voiceCheckpointRefs = uniqueSorted([
    ...(selectedWakeResult?.voiceCheckpointRefs ?? []),
    ...((selectedWakeResult?.evidenceRefs ?? []).filter(isStagePlayVoiceCheckpointRef)),
    ...((selectedWake?.evidenceRefs ?? []).filter(isStagePlayVoiceCheckpointRef)),
  ]);
  const transaction = selectedWakeResult?.stagePlayWakeTransaction ?? null;
  const finalDebugRefs = uniqueSorted([
    ...(transaction?.producedRefs ?? []),
    ...(selectedWakeResult?.evidenceRefs ?? []),
    ...(selectedWakeResult?.budgetStateRef ? [selectedWakeResult.budgetStateRef] : []),
  ]);
  const packetRunRefs = selectedPacket?.microReasonerRunRefs ?? [];
  const packetRuns = runs.filter((run) => packetRunRefs.includes(run.runId));
  const latestJob = latestByIso(mailbox?.jobStates ?? [], (job) => job.updatedAt ?? job.createdAt);
  const latestDecision = latestByIso(selectedDecisions, (decision) => decision.createdAt);
  return {
    schema: "helix.stage_play.packet_trace.v1",
    exportedAt: new Date().toISOString(),
    graphId: input.graph.graphId,
    selectedPacketKey: key,
    deck: {
      presetId: selectedPacket?.microReasonerDeck?.presetId ?? selectedWake?.deckPresetId ?? selectedWakeResult?.deckPresetId ?? null,
      title: selectedPacket?.microReasonerDeck?.presetTitle ?? selectedWake?.deckPresetTitle ?? selectedWakeResult?.deckPresetTitle ?? null,
      runPlan: selectedPacket?.microReasonerDeck?.deckRunPlan ?? selectedWake?.deckRunPlan ?? selectedWakeResult?.deckRunPlan ?? null,
      promptedRoles: selectedPacket?.microReasonerDeck?.promptedRoles ?? [],
      rolePromptIds: selectedPacket?.microReasonerDeck?.rolePromptIds ?? {},
    },
    rawVisualMail: rawVisualMail.map((mail) => ({
      mailId: mail.mailId,
      sourceId: mail.sourceId,
      status: mail.status,
      createdAt: mail.createdAt,
      summaryPreview: compactStagePlayMailPreview(mail.summary.preview || mail.summary.text, "", 220),
      visualEvidenceRefs: uniqueSorted([
        mail.sourceRefs.frameRef,
        mail.sourceRefs.evidenceRef,
        mail.sourceRefs.observationRef,
        ...mail.evidenceRefs,
      ]),
    })),
    processedPacket: selectedPacket ? {
      packetId: selectedPacket.packetId,
      sourceId: selectedPacket.sourceId,
      mailIds: selectedPacket.mailIds,
      microReasonerRunRefs: selectedPacket.microReasonerRunRefs,
      recommendedNext: selectedPacket.recommendedNext,
      resolutionState: selectedPacket.resolutionState,
      evidenceRefs: selectedPacket.evidenceRefs,
      arbiterVerdict: selectedPacket.arbiter ?? null,
      salience: selectedPacket.salience,
      effortEstimate: selectedPacket.effortEstimate ?? null,
      axioms: selectedPacket.axioms ?? null,
      hypotheses: selectedPacket.hypotheses ?? [],
    } : null,
    microReasonerRuns: packetRuns.map((run) => ({
      runId: run.runId,
      role: run.role,
      status: run.status,
      promptId: run.promptId,
      deckPresetId: run.deckPresetId ?? null,
      deckPresetTitle: run.deckPresetTitle ?? null,
      deckRunPlan: run.deckRunPlan ?? null,
      selectedDecision: run.selectedDecision ?? null,
      recommendedNextTool: run.recommendedNextTool ?? null,
      voiceCandidate: run.voiceCandidate ?? null,
      latencyMs: run.latencyMs,
      inputRefs: run.inputRefs,
      outputRefs: run.outputRefs,
      outputPreview: run.outputPreview,
    })),
    wake: selectedWake ? {
      wakeRequestId: selectedWake.wakeRequestId,
      status: selectedWake.status,
      wakeIntent: selectedWake.wakeIntent ?? "process_unread_mail",
      lifecycleStage: selectedWake.lifecycleStage ?? null,
      lifecycleReason: selectedWake.lifecycleReason ?? null,
      deckPresetId: selectedWake.deckPresetId ?? null,
      deckPresetTitle: selectedWake.deckPresetTitle ?? null,
      deckRunPlan: selectedWake.deckRunPlan ?? null,
      deckVerdict: selectedWake.deckVerdict ?? null,
      packetIds: selectedWake.packetIds ?? [],
      supersededWakeIds: selectedWake.supersededWakeIds ?? [],
      askTurnId: selectedWake.askTurnId ?? null,
      decisionIds: selectedWake.decisionIds,
      evidenceRefs: selectedWake.evidenceRefs,
      failureReason: selectedWake.failureReason ?? null,
    } : null,
    result: selectedWakeResult ? {
      wakeResultId: selectedWakeResult.wakeResultId,
      status: selectedWakeResult.status,
      wakeIntent: selectedWakeResult.wakeIntent ?? null,
      lifecycleStage: selectedWakeResult.lifecycleStage ?? null,
      lifecycleReason: selectedWakeResult.lifecycleReason ?? null,
      askTurnId: selectedWakeResult.askTurnId ?? null,
      decisionReceiptIds: selectedWakeResult.decisionIds,
      voiceCheckpointRefs,
      wakeResultRefs: selectedWakeResult.evidenceRefs,
      budgetStateRef: selectedWakeResult.budgetStateRef ?? null,
      failedReason: selectedWakeResult.failedReason ?? null,
      skippedReason: selectedWakeResult.skippedReason ?? null,
      finalDebugRefs,
      stagePlayWakeTransaction: transaction,
    } : null,
    decisions: selectedDecisions.map((decision) => ({
      decisionReceiptId: decision.decisionId,
      decision: decision.decision,
      requestedTool: decision.requestedTool ?? null,
      nextLoopState: decision.nextLoopState,
      modelReviewed: decision.modelReviewed,
      evidenceRefs: decision.evidenceRefs,
      createdAt: decision.createdAt,
    })),
    continuationState: {
      wakeAdmissionContinuation: mailbox?.wakeAdmissionCycle?.continuation ?? null,
      wakeAdmissionStatus: mailbox?.wakeAdmissionCycle?.status ?? null,
      latestJobStatus: latestJob?.status ?? null,
      latestJobNextLoopState: latestJob?.nextLoopState ?? null,
      latestDecisionNextLoopState: latestDecision?.nextLoopState ?? null,
    },
    authority: {
      assistant_answer: false,
      terminal_eligible: false,
      context_role: "tool_evidence",
      raw_content_included: false,
    },
  };
}

function buildStagePlayWakeScopedTrace(input: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
  wakeRequestId?: string | null;
}) {
  const mailbox = input.mailbox ?? null;
  const wakeRequests = mailbox?.wakeRequests ?? [];
  const wakeResults = mailbox?.wakeResults ?? [];
  const packets = mailbox?.processedMailPackets ?? [];
  const decisions = mailbox?.decisions ?? [];
  const wake =
    wakeRequests.find((candidate) => candidate.wakeRequestId === input.wakeRequestId) ??
    latestStagePlayMailWakeRequest(wakeRequests);
  const results = wake ? wakeResults.filter((result) => result.wakeRequestId === wake.wakeRequestId) : [];
  const latestResult = latestByIso(results, (result) => result.createdAt);
  const packetIds = uniqueSorted([
    ...(wake?.packetIds ?? []),
    ...(latestResult?.packetIds ?? []),
    ...((latestResult?.stagePlayWakeTransaction?.artifactRefs.processedPacketIds) ?? []),
  ]);
  const packetMailIds = packets
    .filter((packet) => packetIds.includes(packet.packetId) || wake?.mailIds.some((mailId) => packet.mailIds.includes(mailId)))
    .flatMap((packet) => packet.mailIds);
  const decisionIds = uniqueSorted([...(wake?.decisionIds ?? []), ...(latestResult?.decisionIds ?? [])]);
  return {
    schema: "helix.stage_play.wake_trace.v1",
    exportedAt: new Date().toISOString(),
    graphId: input.graph.graphId,
    wakeRequestId: wake?.wakeRequestId ?? null,
    wake,
    wakeResults: results,
    packetIds,
    mailIds: uniqueSorted([...(wake?.mailIds ?? []), ...packetMailIds]),
    decisions: decisions.filter((decision) => decisionIds.includes(decision.decisionId)),
    voiceCheckpointRefs: uniqueSorted([
      ...(latestResult?.voiceCheckpointRefs ?? []),
      ...((latestResult?.evidenceRefs ?? []).filter(isStagePlayVoiceCheckpointRef)),
    ]),
    supersededWakeIds: wake?.supersededWakeIds ?? latestResult?.supersededWakeIds ?? [],
    continuationState: {
      wakeAdmissionContinuation: mailbox?.wakeAdmissionCycle?.continuation ?? null,
      wakeAdmissionStatus: mailbox?.wakeAdmissionCycle?.status ?? null,
    },
    authority: {
      assistant_answer: false,
      terminal_eligible: false,
      context_role: "tool_evidence",
      raw_content_included: false,
    },
  };
}

function buildStagePlayAskDebugTrace(input: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
  wakeRequestId?: string | null;
}) {
  const wakeTrace = buildStagePlayWakeScopedTrace(input);
  const latestResult = latestByIso(wakeTrace.wakeResults, (result) => result.createdAt);
  return {
    schema: "helix.stage_play.ask_debug_trace.v1",
    exportedAt: new Date().toISOString(),
    graphId: input.graph.graphId,
    wakeRequestId: wakeTrace.wakeRequestId,
    askTurnId: wakeTrace.wake?.askTurnId ?? latestResult?.askTurnId ?? null,
    stagePlayWakeTransaction: latestResult?.stagePlayWakeTransaction ?? null,
    routeMetadata: wakeTrace.wake?.routeMetadata ?? wakeTrace.wake?.askLaunchRouteMetadata ?? latestResult?.stagePlayWakeTransaction?.routeMetadata ?? null,
    selectedTargetSource: latestResult?.stagePlayWakeTransaction?.selectedTargetSource ?? null,
    selectedCapability: latestResult?.stagePlayWakeTransaction?.selectedCapability ?? null,
    producedRefs: latestResult?.stagePlayWakeTransaction?.producedRefs ?? [],
    artifactRefs: latestResult?.stagePlayWakeTransaction?.artifactRefs ?? null,
    decisionReceiptId: latestResult?.stagePlayWakeTransaction?.decisionReceiptId ?? latestResult?.decisionIds?.[0] ?? null,
    voiceReceiptId: latestResult?.stagePlayWakeTransaction?.voiceReceiptId ?? latestResult?.voiceCheckpointRefs?.[0] ?? null,
    terminalKind: latestResult?.stagePlayWakeTransaction?.terminalKind ?? null,
    failureCode: latestResult?.stagePlayWakeTransaction?.failureCode ?? latestResult?.failedReason ?? null,
    wakeTrace,
    authority: {
      assistant_answer: false,
      terminal_eligible: false,
      context_role: "debug_trace",
      raw_content_included: false,
      note: "This is the Stage Play mailbox projection of Ask debug. Use full Ask debug export when an Ask turn payload is available.",
    },
  };
}

function firstLiveBindingSummary(badge: StagePlayBadgeV1): string | null {
  const binding = badge.liveBindings.find((entry) =>
    entry.compactValue !== null && entry.compactValue !== undefined && entry.compactValue !== ""
  );
  return binding ? `${labelize(binding.bindingKind)}: ${String(binding.compactValue)}` : null;
}

function routeAuthorityPassed(badge: StagePlayBadgeV1): boolean {
  return badge.reasonCodes.some((code) =>
    /route_authority|terminal_authority|completed_solver_path|model_authored|solver_completed/i.test(code)
  );
}

function observerTrayView(badge: StagePlayBadgeV1, sources: StagePlayObserverSource[]): StagePlayBadgeTrayView {
  const visualSource = sources.find((source) => /visual|frame|screen/i.test(source.modality));
  const sceneSource = sources.find((source) => source.contribution.trim().length > 0);
  const selectedCount = sources.filter((source) => source.selectedForStagePlay).length;
  const activeCount = sources.filter((source) => source.status === "active").length;
  const evidenceCount = new Set([
    ...badge.evidenceRefs,
    ...(badge.dataTray?.evidenceRefs ?? []),
    ...sources.flatMap((source) => source.evidenceRefs),
  ]).size;
  const visualStatus = visualSource
    ? `${labelize(visualSource.modality)} ${labelize(visualSource.status)}`
    : "visual frame missing";
  return {
    title: badge.dataTray?.title ?? "Observer",
    metric: compactTrayMetric(badge.dataTray?.freshness ?? `${selectedCount}/${sources.length} routed`, "unknown"),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? `${visualStatus} - ${badge.dataTray?.summary ?? sceneSource?.contribution ?? badge.plainMeaning}`,
      "No live source summary yet.",
    ),
    detail: compactTrayText(
      `${activeCount} active | ${evidenceCount} refs | freshness ${badge.dataTray?.freshness ?? "unknown"}`,
      "No source custody state.",
    ),
  };
}

function compactObservationTrayView(badge: StagePlayBadgeV1): StagePlayBadgeTrayView {
  return {
    title: badge.dataTray?.title ?? "Compact observation",
    metric: compactTrayMetric(
      badge.dataTray?.confidence !== undefined && badge.dataTray?.confidence !== null
        ? `confidence ${badge.dataTray.confidence.toFixed(2)}`
        : `confidence ${badge.confidence.toFixed(2)}`,
      "confidence unknown",
    ),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? badge.dataTray?.summary ?? firstLiveBindingSummary(badge) ?? badge.plainMeaning,
      "No compact fact summary yet.",
    ),
    detail: compactTrayText(
      badge.dataTray?.transformLabel ?? badge.sourceRefs[0]?.id ?? badge.evidenceRefs[0] ?? "source window pending",
      "source window pending",
    ),
  };
}

function askCheckpointTrayView(badge: StagePlayBadgeV1): StagePlayBadgeTrayView {
  const checkpoint = badge.checkpoint;
  const solverState = checkpoint?.modelReviewed ? "solver completed" : "solver pending";
  const routeState = routeAuthorityPassed(badge) || checkpoint?.modelReviewed ? "route authority passed" : "route authority pending";
  return {
    title: badge.dataTray?.title ?? "Ask checkpoint",
    metric: compactTrayMetric(checkpoint?.askTurnId ?? "no turn", "no turn"),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? badge.dataTray?.summary ?? `${solverState}; ${checkpoint?.modelReviewed ? "model reviewed" : "not reviewed"}`,
      "No answer snapshot yet.",
    ),
    detail: compactTrayText(
      `${routeState} | ${checkpoint?.terminalArtifactKind ?? "no terminal artifact"}`,
      "route authority pending",
    ),
  };
}

function answerSnapshotTrayView(badge: StagePlayBadgeV1): StagePlayBadgeTrayView {
  return {
    title: badge.dataTray?.title ?? "Answer snapshot",
    metric: compactTrayMetric(badge.dataTray?.updatedAt ? formatStagePlayClock(badge.dataTray.updatedAt) : "no update", "no update"),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? badge.output?.text ?? badge.dataTray?.summary ?? badge.plainMeaning,
      "No upheld answer snapshot yet.",
    ),
    detail: compactTrayText(
      `${badge.evidenceRefs.length} refs | ${badge.output?.state ? labelize(badge.output.state) : "not projected"}`,
      "0 refs",
    ),
  };
}

function outputTrayView(badge: StagePlayBadgeV1): StagePlayBadgeTrayView {
  const outputState = badge.output?.state ?? "draft";
  return {
    title: badge.dataTray?.title ?? badge.output?.lineKey ?? labelize(badge.kind),
    metric: compactTrayMetric(labelize(outputState), "draft"),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? badge.output?.text ?? badge.dataTray?.summary ?? badge.plainMeaning,
      "No output text projected yet.",
    ),
    detail: compactTrayText(
      `${badge.evidenceRefs.length} refs | voice ${badge.output?.voiceEligible ? "eligible" : "locked"}`,
      "voice locked",
    ),
  };
}

function terminalAuthorityTrayView(badge: StagePlayBadgeV1): StagePlayBadgeTrayView {
  const completed = badge.tags.some((tag) => /completed_solver_path/i.test(tag)) ||
    badge.reasonCodes.some((code) => /completed_solver_path_selects_answer/i.test(code));
  return {
    title: badge.dataTray?.title ?? "Terminal authority",
    metric: compactTrayMetric(completed ? "terminal selected" : "terminal pending", "terminal pending"),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ?? badge.dataTray?.summary ?? badge.plainMeaning,
      "Terminal answer pending.",
    ),
    detail: compactTrayText(
      badge.dataTray?.blockedUntil ?? badge.dataTray?.transformLabel ?? "completed solver path boundary",
      "completed solver path boundary",
    ),
  };
}

function badgeTrayView(badge: StagePlayBadgeV1, observerSources: StagePlayObserverSource[]): StagePlayBadgeTrayView {
  if (badge.kind === "observer") return observerTrayView(badge, observerSources);
  if (badge.kind === "compact_observation") return compactObservationTrayView(badge);
  if (badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint") return askCheckpointTrayView(badge);
  if (badge.kind === "answer_snapshot") return answerSnapshotTrayView(badge);
  if (badge.kind === "live_output" || badge.kind === "voice_output") return outputTrayView(badge);
  if (badge.id === "workstation_state_plane.terminal_authority") return terminalAuthorityTrayView(badge);
  return {
    title: badge.dataTray?.title ?? badge.output?.lineKey ?? labelize(badge.kind),
    metric: compactTrayMetric(
      badge.dataTray?.freshness ?? badge.output?.state ?? badge.confidence.toFixed(2),
      badge.confidence.toFixed(2),
    ),
    summary: compactTrayText(
      badge.dataTray?.outputPreview ??
        badge.dataTray?.summary ??
        badge.output?.text ??
        firstLiveBindingSummary(badge) ??
        badge.missingEvidence[0] ??
        badge.reasonCodes[0] ??
        badge.plainMeaning,
      "No compact tray data yet.",
    ),
    detail: compactTrayText(
      badge.dataTray?.transformLabel ?? `${badge.evidenceRefs.length} evidence ref(s)`,
      "0 evidence ref(s)",
    ),
  };
}

function syntheticNodeTrayView(node: StagePlaySyntheticNode): StagePlayBadgeTrayView {
  return {
    title: labelize(node.kind),
    metric: compactTrayMetric(labelize(node.status), "unknown"),
    summary: compactTrayText(
      node.evidenceRefs[0] ??
        (node.relatedBadgeIds.length > 0 ? `${node.relatedBadgeIds.length} related badge(s)` : null),
      "Synthetic output from graph evidence.",
    ),
    detail: compactTrayText(`${node.evidenceRefs.length} evidence ref(s)`, "0 evidence ref(s)"),
  };
}

const latestStagePlayMailItem = (
  items: StagePlayLiveSourceMailItemV1[],
  predicate?: (item: StagePlayLiveSourceMailItemV1) => boolean,
): StagePlayLiveSourceMailItemV1 | null => {
  const matching = predicate ? items.filter(predicate) : items;
  return matching.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1) ?? null;
};

const latestStagePlayMailDecision = (
  decisions: StagePlayLiveSourceMailDecisionV1[],
  mailId?: string | null,
): StagePlayLiveSourceMailDecisionV1 | null => {
  const matching = mailId
    ? decisions.filter((decision) => decision.mailIds.includes(mailId))
    : decisions;
  return matching.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1) ?? null;
};

const latestStagePlayNarrativeStateForDecision = (
  states: StagePlayLiveSourceNarrativeStateV1[],
  decision: StagePlayLiveSourceMailDecisionV1 | null,
): StagePlayLiveSourceNarrativeStateV1 | null => {
  if (!decision) return null;
  const byRef = decision.narrativeStateRef
    ? states.find((state) => state.narrativeStateId === decision.narrativeStateRef)
    : null;
  if (byRef) return byRef;
  return states
    .filter((state) =>
      state.lastDecisionRef === decision.decisionId ||
      state.mailBatchRefs.some((mailId) => decision.mailIds.includes(mailId))
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1) ?? null;
};

const latestStagePlayMailWakeRequest = (
  wakes: StagePlayLiveSourceMailWakeRequestV1[],
  mailId?: string | null,
): StagePlayLiveSourceMailWakeRequestV1 | null => {
  const matching = mailId
    ? wakes.filter((wake) => wake.mailIds.includes(mailId))
    : wakes;
  return matching.slice().sort((left, right) => left.queuedAt.localeCompare(right.queuedAt)).at(-1) ?? null;
};

const latestStagePlayMailWakeResult = (
  results: StagePlayLiveSourceMailWakeResultV1[],
  wakeRequestId?: string | null,
): StagePlayLiveSourceMailWakeResultV1 | null => {
  const matching = wakeRequestId
    ? results.filter((result) => result.wakeRequestId === wakeRequestId)
    : results;
  return matching.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1) ?? null;
};

const isStagePlayMailWakePressureResult = (
  result: StagePlayLiveSourceMailWakeResultV1,
): boolean =>
  result.status === "deferred_for_pressure" ||
  /(?:pressure|runtime_memory|503)/i.test(result.failedReason ?? "");

const isStagePlayPacketBackedAskWakeRequest = (
  wake: StagePlayLiveSourceMailWakeRequestV1,
): boolean =>
  wake.wakeIntent === "ask_from_processed_packet" ||
  (
    wake.deckVerdict?.wakeAsk === true &&
    (wake.packetIds?.length ?? 0) > 0
  ) ||
  Boolean(wake.askTurnId);

const isStagePlayMailWakeAskAttemptResult = (
  result: StagePlayLiveSourceMailWakeResultV1,
): boolean => {
  if (result.wakeIntent === "process_unread_mail" && !result.askTurnId) return false;
  if (result.status === "skipped" && result.skippedReason === "ui_handoff_required") return false;
  if (result.wakeIntent === "ask_from_processed_packet") return true;
  return result.status === "completed" ||
    result.status === "failed_terminal" ||
    result.status === "skipped" ||
    Boolean(result.askTurnId) ||
    result.decisionIds.length > 0 ||
    (
      result.status === "failed_retryable" &&
      !isStagePlayMailWakePressureResult(result)
    );
};

const isStagePlayMailWakeVoiceCheckpointResult = (
  result: StagePlayLiveSourceMailWakeResultV1,
): boolean =>
  result.status === "completed" &&
  result.evidenceRefs.some((ref) =>
    /^(?:live_source_interim_voice_callout_receipt|helix_interim_voice_callout_receipt|voice_hold_receipt|voice_block_receipt|voice_receipt|stage_play_live_source_voice_delivery_receipt):/i.test(ref)
  );

const stagePlayWakeLifecycleTone = (
  lifecycleStage?: string | null,
  fallbackStatus?: string | null,
): "good" | "warn" | "blocked" | "default" => {
  if (lifecycleStage === "voice_delivered" || lifecycleStage === "voice_held" || lifecycleStage === "voice_blocked" || lifecycleStage === "completed") return "good";
  if (lifecycleStage === "voice_queued_retry" || lifecycleStage === "voice_unknown" || lifecycleStage === "voice_pending" || lifecycleStage === "pressure_deferred" || lifecycleStage === "ask_entered" || lifecycleStage === "decision_recorded") return "warn";
  if (lifecycleStage === "failed" || lifecycleStage === "expired") return "blocked";
  if (fallbackStatus === "completed") return "good";
  if (fallbackStatus === "deferred_for_pressure" || fallbackStatus === "failed_retryable") return "warn";
  if (fallbackStatus === "failed_terminal" || fallbackStatus === "failed") return "blocked";
  return "default";
};

const stagePlayWakeLifecycleSummary = (input: {
  lifecycleStage?: string | null;
  status?: string | null;
  askTurnId?: string | null;
  decisionIds?: string[];
  voiceRefs?: string[];
  nextRetryAt?: string | null;
  failureReason?: string | null;
}): string => {
  const voiceCount = input.voiceRefs?.length ?? 0;
  const stage = input.lifecycleStage ?? (voiceCount > 0 ? "voice_unknown" : null) ?? input.status ?? "missing";
  const decisionCount = input.decisionIds?.length ?? 0;
  if (stage === "pressure_deferred" || input.status === "deferred_for_pressure") {
    return `pressure deferred before Ask${input.nextRetryAt ? `; next retry ${formatStagePlayClock(input.nextRetryAt)}` : ""}${input.failureReason ? `; ${input.failureReason}` : ""}`;
  }
  if (stage === "voice_pending") {
    return `decision recorded; voice pending${input.askTurnId ? `; ask ${input.askTurnId}` : ""}${decisionCount ? `; ${decisionCount} decision${decisionCount === 1 ? "" : "s"}` : ""}`;
  }
  if (stage === "voice_delivered" || stage === "voice_held" || stage === "voice_blocked") {
    return `${labelize(stage)}; ${voiceCount} voice checkpoint${voiceCount === 1 ? "" : "s"}${input.askTurnId ? `; ask ${input.askTurnId}` : ""}`;
  }
  if (stage === "voice_queued_retry") {
    return `voice queued/retry; ${voiceCount} voice checkpoint${voiceCount === 1 ? "" : "s"}${input.askTurnId ? `; ask ${input.askTurnId}` : ""}`;
  }
  if (stage === "voice_unknown") {
    return `voice checkpoint status unknown; ${voiceCount} voice checkpoint${voiceCount === 1 ? "" : "s"}${input.askTurnId ? `; ask ${input.askTurnId}` : ""}`;
  }
  if (stage === "decision_recorded") {
    return `decision recorded${input.askTurnId ? `; ask ${input.askTurnId}` : ""}`;
  }
  if (stage === "ask_entered") {
    return `Ask entered${input.askTurnId ? `; ${input.askTurnId}` : ""}`;
  }
  return `${labelize(stage)}${input.failureReason ? `; ${input.failureReason}` : ""}`;
};

const stagePlayJourneyDotTone = (state: StagePlayJourneyState): string => {
  if (state === "done") return "border-emerald-400 bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]";
  if (state === "active") return "border-cyan-300 bg-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.65)]";
  if (state === "blocked") return "border-rose-300 bg-rose-400 shadow-[0_0_22px_rgba(251,113,133,0.55)]";
  if (state === "pending") return "border-amber-300 bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]";
  return "border-slate-600 bg-slate-800";
};

const stagePlayJourneyStationTone = (state: StagePlayJourneyState): string => {
  if (state === "done") return "border-emerald-800/70 bg-emerald-950/20 text-emerald-100";
  if (state === "active") return "border-cyan-500/80 bg-cyan-950/35 text-cyan-50 shadow-[0_16px_42px_rgba(34,211,238,0.14)]";
  if (state === "blocked") return "border-rose-700/80 bg-rose-950/30 text-rose-100";
  if (state === "pending") return "border-amber-700/70 bg-amber-950/25 text-amber-100";
  return "border-slate-800 bg-slate-950/70 text-slate-400";
};

const STAGE_PLAY_PACKET_TRAFFIC_STATIONS: Array<{
  key: StagePlayPacketTrafficStationKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "visual_source", label: "Visual Source", shortLabel: "Source" },
  { key: "observer_shades", label: "Observer Shades", shortLabel: "Shade" },
  { key: "raw_mail", label: "Raw Mail", shortLabel: "Mail" },
  { key: "processed_packet", label: "Processed Packet", shortLabel: "Packet" },
  { key: "micro_reasoner_deck", label: "Micro-Reasoner Deck", shortLabel: "Deck" },
  { key: "ask_handoff", label: "Goal / Interrupt", shortLabel: "Dispatch" },
  { key: "decision", label: "Decision", shortLabel: "Decision" },
  { key: "output", label: "Output", shortLabel: "Output" },
  { key: "loop_state", label: "Loop State", shortLabel: "Loop" },
];

const packetTrailColor = (value: string): { hsl: string; border: string; background: string; glow: string } => {
  return workstationCircuitColor(value, "packet");
};

const stagePlayAppliedDeckKey = (presetId: string, sourceId: string | null, reason: string): string =>
  `${presetId}:${sourceId ?? "source_unknown"}:${reason}`;

const stagePlayNarratorControlActuators = (actuators: readonly AgentGoalActuatorV1[]): AgentGoalActuatorV1[] =>
  actuators.filter((actuator) =>
    actuator === "bind_narrator" ||
    actuator === "narrator_bind_stream" ||
    actuator === "narrator_say"
  );

const stagePlayIsoMs = (value?: string | null): number => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : 1;
};

const stagePlayDispatchActionLabel = (action: WorkstationDispatchActionV1): string => {
  if (action.kind === "update_live_answer") return `Live Answer: ${action.lineKey}`;
  if (action.kind === "append_goal_context") return `Goal context: ${action.goalId}`;
  if (action.kind === "speak_narrator") return `Narrator: ${action.mode}`;
  if (action.kind === "bind_narrator_stream") return `Narrator bind: ${action.streamKind}`;
  if (action.kind === "change_preset") return `Preset: ${action.presetId}`;
  if (action.kind === "bind_source") return `Bind: ${action.sourceRef}`;
  if (action.kind === "unbind_source") return `Unbind: ${action.sourceRef}`;
  if (action.kind === "set_loop_state") return `Loop: ${action.state}`;
  if (action.kind === "focus_process_graph") return `Focus: ${action.nodeRef ?? "graph"}`;
  if (action.kind === "update_panel") return `Panel: ${action.panelId}`;
  if (action.kind === "repair_loop") return `Repair: ${action.loopRef}`;
  if (action.kind === "repair_source") return `Repair source: ${action.sourceRef ?? action.loopRef ?? "source"}`;
  if (action.kind === "wake_agent") {
    const interruptKind = "interruptKind" in action && action.interruptKind ? ` (${action.interruptKind})` : "";
    return `Interrupt dispatch${interruptKind}${action.reason ? `: ${compactStagePlayText(action.reason, "interrupt", 42)}` : ""}`;
  }
  if (action.kind === "log_receipt") return `Receipt: ${action.receiptRef ?? "latest"}`;
  if (action.kind === "ask_user") return "Ask user";
  return "No dispatch";
};

const stagePlayDispatchTone = (action: WorkstationDispatchActionV1): "default" | "good" | "warn" | "blocked" => {
  if (action.kind === "wake_agent" || action.kind === "ask_user") return "warn";
  if (action.kind === "repair_loop" || action.kind === "repair_source") return "blocked";
  if (action.kind === "append_goal_context" || action.kind === "update_live_answer" || action.kind === "bind_narrator_stream" || action.kind === "speak_narrator" || action.kind === "set_loop_state") return "good";
  return "default";
};

type StagePlayGoalContextCircuitHop = {
  key: string;
  label: string;
  value: string;
};

type StagePlayPacketCircuitInspectorHop = {
  key: string;
  label: string;
  value: string;
  refs: string[];
};

const firstStagePlayGoalContextRef = (
  refs: string[],
  match: (ref: string) => boolean,
  fallback: string,
): string => refs.find(match) ?? refs[0] ?? fallback;

const compactStagePlayCircuitRef = (value: string): string =>
  compactStagePlayText(
    value
      .replace(/^stage_play_/i, "")
      .replace(/^workstation_/i, "")
      .replace(/^live_answer_/i, "live_answer:")
      .replace(/^source:/i, "source:"),
    value,
    42,
  );

const stagePlayDispatchDestinationLabel = (action: WorkstationDispatchActionV1): string | null => {
  if (action.kind === "update_live_answer") return action.lineKey;
  if (action.kind === "bind_narrator_stream") return `narrator:${action.streamKind}`;
  if (action.kind === "speak_narrator") return `narrator:${action.mode}`;
  if (action.kind === "change_preset") return action.targetRef;
  if (action.kind === "bind_source") return action.targetRef;
  if (action.kind === "unbind_source") return action.targetRef ?? action.sourceRef;
  if (action.kind === "set_loop_state" || action.kind === "repair_loop") return action.loopRef;
  if (action.kind === "repair_source") return action.sourceRef ?? action.loopRef ?? "workstation source";
  if (action.kind === "focus_process_graph") return action.nodeRef ?? "stage-play-badge-graph";
  if (action.kind === "wake_agent") return "interrupt dispatch";
  if (action.kind === "ask_user") return "operator";
  return null;
};

const stagePlayGoalContextCircuitHops = (
  update: WorkstationGoalContextUpdateV1,
): StagePlayGoalContextCircuitHop[] => {
  const allRefs = Array.from(new Set([
    update.contentRef,
    ...update.sourceRefs,
    ...update.loopRefs,
    ...update.evidenceRefs,
    ...update.receiptRefs,
  ].filter(Boolean)));
  const source = firstStagePlayGoalContextRef(
    update.sourceRefs,
    (ref) => /source|visual|audio|frame|transcript|lens|screen/i.test(ref),
    "source pending",
  );
  const loop = firstStagePlayGoalContextRef(
    update.loopRefs,
    (ref) => /loop|mail|translation|transcription|health|automation|route|watch/i.test(ref),
    update.producerKind,
  );
  const deckRefs = allRefs.filter((ref) =>
    /microdeck|micro_reasoner|prompt_preset|deck/i.test(ref)
  );
  const deck = deckRefs.find((ref) =>
    /^microdeck_output:|^stage_play_micro_reasoner_|prompt_preset/i.test(ref)
  ) ?? deckRefs[0] ?? allRefs.find((ref) =>
    /translated_transcript|translation/i.test(ref)
  ) ?? update.updateKind;
  const transcript = Array.from(new Set(allRefs.filter((ref) =>
    /^audio_transcript:|^transcript_window:|^translated_transcript|^translation_segment:|^workstation_context_feed:audio_transcripts|^workstation_context_feed:translated_transcripts|^workstation_actuator:query_audio_transcripts|^workstation_actuator:query_translation_segments/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "transcript pending";
  const projection = Array.from(new Set(allRefs.filter((ref) =>
    /^live_answer|^live-answer|^workstation_context_feed:live_answer_lines|^workstation_actuator:query_live_answer_state|^workstation_actuator:update_live_answer/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "projection pending";
  const sourceHealth = Array.from(new Set(allRefs.filter((ref) =>
    /^source_health:|^source_health_status:|^source_health_watch:|^source-health:|^stage_play_source_health:|^source_status:|^workstation_context_feed:source_health|^workstation_actuator:query_source_health|^workstation_actuator:repair_source/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "source health pending";
  const narrator = Array.from(new Set([
    ...allRefs.filter((ref) =>
      /^helix_narrator_|^narrator:|^workstation_context_feed:narrator_events|^workstation_actuator:narrator_/i.test(ref)
    ),
    ...update.suggestedDispatch.flatMap((action) => {
      if (action.kind === "bind_narrator_stream") return [action.sourceRef, `narrator:${action.streamKind}`, "workstation_context_feed:narrator_events"];
      if (action.kind === "speak_narrator") return [`narrator:${action.mode}`, "workstation_context_feed:narrator_events"];
      return [];
    }),
  ]))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "narrator pending";
  const routeWatch = Array.from(new Set(allRefs.filter((ref) =>
    /^route_watch:|^watch_job:|^watch_policy:|^stage_play_live_source_watch_job:|^live_job_evidence:|^situation_construct_query:|^workstation_context_feed:route_evidence|^workstation_actuator:query_route_evidence/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "route watch pending";
  const automation = Array.from(new Set(allRefs.filter((ref) =>
    /^automation:|^automation_policy:|^workstation_context_feed:automation_policies|^stage_play_live_source_watch_job_policy:|^workstation_actuator:configure_route_watch/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "automation pending";
  const traceMemory = Array.from(new Set(allRefs.filter((ref) =>
    /^trace_memory:|^trace-memory:|^workstation_trace_memory:|^workstation_context_feed:trace_memory/i.test(ref) ||
    /trace_memory|trace-memory/i.test(ref)
  )))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || "trace memory pending";
  const dispatch = update.suggestedDispatch.find((action) =>
    action.kind !== "log_receipt" &&
    action.kind !== "append_goal_context" &&
    action.kind !== "update_panel"
  ) ?? update.suggestedDispatch[0] ?? { kind: "none" as const };
  const destination = Array.from(new Set(update.suggestedDispatch
    .map(stagePlayDispatchDestinationLabel)
    .filter((value): value is string => Boolean(value))))
    .slice(0, 4)
    .map(compactStagePlayCircuitRef)
    .join(" | ") || update.contentRef;
  const authority = update.authority.terminalEligible === false &&
    update.authority.assistantAnswer === false &&
    update.authority.rawContentIncluded === false
      ? "evidence only"
      : "blocked terminal claim";
  return [
    { key: "source", label: "Source", value: compactStagePlayCircuitRef(source) },
    { key: "loop", label: "Loop", value: compactStagePlayCircuitRef(loop) },
    { key: "deck", label: "Deck", value: compactStagePlayCircuitRef(deck) },
    { key: "transcript", label: "Transcript", value: transcript },
    { key: "projection", label: "Projection", value: projection },
    { key: "source-health", label: "Source Health", value: sourceHealth },
    { key: "narrator", label: "Narrator", value: narrator },
    { key: "trace-memory", label: "Trace Memory", value: traceMemory },
    { key: "route-watch", label: "Route Watch", value: routeWatch },
    { key: "automation", label: "Automation", value: automation },
    { key: "dispatch", label: "Dispatch", value: compactStagePlayText(stagePlayDispatchActionLabel(dispatch), "none", 42) },
    { key: "destination", label: "Destination", value: compactStagePlayText(destination, "destination pending", 96) },
    { key: "authority", label: "Authority", value: authority },
  ];
};

const stagePlayPacketCircuitInspectorHops = (
  traffic: StagePlayPacketTrafficViewV1,
): StagePlayPacketCircuitInspectorHop[] => {
  const stationByKey = new Map(traffic.stationStates.map((station) => [station.station, station]));
  const stationRefs = (key: StagePlayPacketTrafficStationKey): string[] =>
    Array.from(new Set(stationByKey.get(key)?.refs ?? []));
  const sourceRefs = Array.from(new Set([
    traffic.sourceId,
    ...stationRefs("visual_source"),
  ].filter(Boolean) as string[]));
  const deckRefs = Array.from(new Set([
    traffic.deck?.presetId ?? null,
    ...traffic.microReasonerRuns.flatMap((run) => [run.runId, run.promptId ?? null, ...run.refs]),
    ...stationRefs("micro_reasoner_deck"),
  ].filter(Boolean) as string[]));
  const goalContextRefs = Array.from(new Set(traffic.goalContextUpdates.flatMap((update) => [
    update.updateId,
    update.contentRef,
    ...update.evidenceRefs,
  ])));
  const dispatchLabels = traffic.dispatchActions.map(stagePlayDispatchActionLabel);
  const dispatchRefs = Array.from(new Set(traffic.dispatchActions.flatMap((action) => [
    action.kind,
    stagePlayDispatchDestinationLabel(action),
  ].filter(Boolean) as string[])));
  const outputRefs = Array.from(new Set([
    traffic.voiceReceiptId ?? null,
    ...stationRefs("output"),
  ].filter(Boolean) as string[]));
  const authorityOk = traffic.goalContextUpdates.length > 0 && traffic.goalContextUpdates.every((update) =>
    update.authority.assistantAnswer === false &&
    update.authority.terminalEligible === false &&
    update.authority.rawContentIncluded === false
  );
  return [
    {
      key: "source",
      label: "Source Path",
      value: compactStagePlayText(sourceRefs.join(" | "), "source pending", 96),
      refs: sourceRefs,
    },
    {
      key: "mail",
      label: "Mail",
      value: compactStagePlayText(traffic.mailIds.join(" | "), "mail pending", 96),
      refs: traffic.mailIds,
    },
    {
      key: "packet",
      label: "Packet",
      value: compactStagePlayText(traffic.packetId ?? traffic.packetKey, "packet pending", 96),
      refs: stationRefs("processed_packet"),
    },
    {
      key: "deck",
      label: "Deck",
      value: compactStagePlayText(
        `${stagePlayPacketDeckTitle(traffic.deck)} | ${traffic.microReasonerRuns.length} run${traffic.microReasonerRuns.length === 1 ? "" : "s"}`,
        "deck pending",
        96,
      ),
      refs: deckRefs,
    },
    {
      key: "goal_context",
      label: "Goal Context",
      value: `${traffic.goalContextUpdates.length} non-terminal update${traffic.goalContextUpdates.length === 1 ? "" : "s"}`,
      refs: goalContextRefs,
    },
    {
      key: "dispatch",
      label: "Dispatch",
      value: compactStagePlayText(dispatchLabels.join(" | "), "no dispatch", 260),
      refs: dispatchRefs,
    },
    {
      key: "output",
      label: "Output",
      value: compactStagePlayText(stationByKey.get("output")?.preview, "output pending", 96),
      refs: outputRefs,
    },
    {
      key: "authority",
      label: "Authority",
      value: authorityOk ? "evidence only: assistant=false terminal=false raw=false" : "authority pending or blocked",
      refs: goalContextRefs.slice(0, 6),
    },
  ];
};

const isStagePlayWorkstationControlDispatch = (action: WorkstationDispatchActionV1): boolean =>
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

const stagePlayTrafficStatusClass = (status: StagePlayPacketTrafficStationStatus): string => {
  if (status === "complete") return "border-emerald-800/60 bg-emerald-950/20 text-emerald-100";
  if (status === "running") return "border-cyan-600/70 bg-cyan-950/25 text-cyan-100";
  if (status === "deferred") return "border-amber-700/70 bg-amber-950/25 text-amber-100";
  if (status === "failed") return "border-rose-700/70 bg-rose-950/25 text-rose-100";
  if (status === "skipped") return "border-slate-700 bg-slate-950/55 text-slate-400";
  return "border-slate-800 bg-slate-950/65 text-slate-500";
};

const stagePlayTrafficStatusGlyph = (status: StagePlayPacketTrafficStationStatus): string => {
  if (status === "complete") return "OK";
  if (status === "running") return "RUN";
  if (status === "deferred") return "WAIT";
  if (status === "failed") return "FAIL";
  if (status === "skipped") return "SKIP";
  return "--";
};

const stagePlayPacketDeckTitle = (deck?: StagePlayPacketTrafficDeckSnapshot | null): string =>
  compactStagePlayText(deck?.title, "Deck pending.", 64);

const stagePlayPacketDeckRunPlan = (deck?: StagePlayPacketTrafficDeckSnapshot | null): string =>
  compactStagePlayText(deck?.runPlan, "plan pending", 64);

function stagePlayDeckRolesForPacket(packet: StagePlayProcessedMailPacketV1 | null): StagePlayMicroReasonerRoleV1[] {
  const promptedRoles = packet?.microReasonerDeck?.promptedRoles ?? [];
  if (promptedRoles.length > 0) return promptedRoles;
  return STAGE_PLAY_DECK_ROLES;
}

function stagePlayDeckSnapshotForPacket(packet: StagePlayProcessedMailPacketV1): StagePlayPacketTrafficDeckSnapshot | null {
  if (!packet.microReasonerDeck) return null;
  return {
    presetId: packet.microReasonerDeck.presetId,
    title: packet.microReasonerDeck.presetTitle,
    runPlan: packet.microReasonerDeck.deckRunPlan,
    promptedRoles: packet.microReasonerDeck.promptedRoles ?? [],
  };
}

const activeStagePlayJourneyIndex = (stations: StagePlayMailJourneyStation[]): number => {
  const blocked = stations.findIndex((station) => station.state === "blocked");
  if (blocked >= 0) return blocked;
  const active = stations.findIndex((station) => station.state === "active");
  if (active >= 0) return active;
  const pending = stations.findIndex((station) => station.state === "pending");
  if (pending >= 0) return pending;
  const lastDone = stations.map((station) => station.state).lastIndexOf("done");
  return Math.max(0, lastDone);
};

function StagePlayMailPayloadLedger({
  stations,
  payloadChars,
  packetChars,
  deckLatencyMs,
  selectedPayloadId,
  onSelectPayload,
}: {
  stations: StagePlayMailJourneyStation[];
  payloadChars: number;
  packetChars: number;
  deckLatencyMs: number;
  selectedPayloadId: string | null;
  onSelectPayload: (payloadId: string) => void;
}) {
  const payloadCount = stations.reduce((sum, station) => sum + (station.payloads?.length ?? 0), 0);
  return (
    <div
      className="rounded-md border border-slate-800 bg-slate-950/70 p-3"
      data-testid="stage-play-mail-journey-payload-ledger"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Mail payloads</div>
          <div className="mt-1 text-sm font-semibold text-slate-50">{payloadCount} traffic block{payloadCount === 1 ? "" : "s"}</div>
          <div className="mt-0.5 text-xs text-slate-400">Select a block to inspect the payload lineage and receipts.</div>
        </div>
        <div className="rounded border border-cyan-900/70 px-2 py-1 font-mono text-[10px] text-cyan-100/80">
          lineage
        </div>
      </div>
      <div className="mt-3 rounded border border-slate-800 bg-black/25 p-3 text-xs leading-relaxed text-slate-400">
        {payloadCount > 0
          ? "Each chip is a mail, packet, dispatch interrupt, Ask handoff, or result artifact. Follow the same color/id across stations."
          : "Waiting for the first visual-source mail artifact."}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="uppercase tracking-wide opacity-60">payloads</div>
          <div className="mt-0.5 font-mono">{payloadCount}</div>
        </div>
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="uppercase tracking-wide opacity-60">mail chars</div>
          <div className="mt-0.5 font-mono">{formatStagePlayCount(payloadChars)}</div>
        </div>
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="uppercase tracking-wide opacity-60">packet chars</div>
          <div className="mt-0.5 font-mono">{formatStagePlayCount(packetChars)}</div>
        </div>
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="uppercase tracking-wide opacity-60">deck time</div>
          <div className="mt-0.5 font-mono">{formatStagePlayMs(deckLatencyMs)}</div>
        </div>
      </div>
      <div className="mt-3 grid max-h-[24rem] gap-2 overflow-auto pr-1" data-testid="stage-play-mail-journey-payload-stack">
        {stations.flatMap((station) =>
          (station.payloads ?? []).slice(0, 3).map((payload) => (
            <button
              type="button"
              key={`${station.key}:${payload.id}`}
              onClick={() => onSelectPayload(payload.id)}
              className={`rounded-md border px-2.5 py-2 text-left ${
                payload.id === selectedPayloadId
                  ? "border-cyan-300 bg-cyan-950/45 text-cyan-50"
                  : stagePlayJourneyStationTone(payload.state)
              }`}
              data-testid="stage-play-mail-journey-payload"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[10px] font-semibold uppercase tracking-wide opacity-70">{station.title}</div>
                <div className="shrink-0 font-mono text-[9px] opacity-65">{payload.meta}</div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full border ${stagePlayJourneyDotTone(payload.state)}`} />
                <div className="min-w-0 truncate text-[11px] font-semibold">{payload.label}</div>
              </div>
              <div className="mt-0.5 font-mono text-[9px] opacity-70">{payload.status}</div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-85">{payload.preview}</div>
            </button>
          ))
        )}
        {payloadCount === 0 ? (
          <div className="rounded border border-slate-800 bg-black/20 p-2 text-xs text-slate-500">
            No mail payloads have reached the loop yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StagePlayMicroReasonerDeckColumn({
  rows,
  deckRuntimeLabel,
  combinedRuntimeTone,
}: {
  rows: StagePlayMailJourneyReasonerRow[];
  deckRuntimeLabel: string;
  combinedRuntimeTone: "good" | "warn" | "blocked" | "default";
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3" data-testid="stage-play-mail-journey-micro-deck">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Micro-reasoner deck</div>
          <div className="mt-0.5 text-xs text-slate-400">parallel checks bound into one packet verdict</div>
        </div>
        <span
          className={`rounded border px-2 py-1 font-mono text-[10px] ${
            combinedRuntimeTone === "blocked"
              ? "border-rose-800 text-rose-100"
              : combinedRuntimeTone === "warn"
                ? "border-amber-800 text-amber-100"
                : "border-slate-700 text-slate-300"
          }`}
        >
          {deckRuntimeLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-1">
        {rows.map(({ role, run, display }) => (
          <div
            key={role}
            className={`rounded border px-2.5 py-2 ${
              run?.status === "completed"
                ? "border-emerald-900/70 bg-emerald-950/15"
                : run?.status === "failed"
                  ? "border-rose-900/70 bg-rose-950/20"
                  : "border-slate-800 bg-black/20"
            }`}
            data-testid="stage-play-mail-journey-reasoner"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[11px] font-semibold text-slate-100">{display.title}</div>
              <div className="font-mono text-[9px] text-slate-500">{formatStagePlayMs(run?.latencyMs)}</div>
            </div>
            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
              {run?.outputPreview ?? display.missingPreview}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StagePlayFlowQueueColumn({
  rows,
  deckRuntimeLabel,
  combinedRuntimeTone,
}: {
  rows: StagePlayFlowQueueRow[];
  deckRuntimeLabel: string;
  combinedRuntimeTone: "good" | "warn" | "blocked" | "default";
}) {
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3" data-testid="stage-play-mail-loop-queue-traffic">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Queues / traffic</div>
          <div className="mt-0.5 text-xs text-slate-400">connections, backlog, age, and payload volume</div>
        </div>
        <span
          className={`rounded border px-2 py-1 font-mono text-[10px] ${
            combinedRuntimeTone === "blocked"
              ? "border-rose-800 text-rose-100"
              : combinedRuntimeTone === "warn"
                ? "border-amber-800 text-amber-100"
                : "border-slate-700 text-slate-300"
          }`}
        >
          {deckRuntimeLabel}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className={`rounded border px-2.5 py-2 ${stagePlayJourneyStationTone(row.tone)}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[11px] font-semibold">{row.label}</div>
              <div className="font-mono text-[9px] opacity-70">{row.count} item{row.count === 1 ? "" : "s"}</div>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[9px] opacity-70">
              <span className="truncate">{row.from}</span>
              <span aria-hidden="true">-&gt;</span>
              <span className="truncate">{row.to}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[9px]">
              <span className="rounded border border-current/15 px-1.5 py-1 opacity-80">{formatStagePlayCount(row.bytes)}</span>
              <span className="rounded border border-current/15 px-1.5 py-1 opacity-80">{formatStagePlayMs(row.ageMs)}</span>
              <span className="truncate rounded border border-current/15 px-1.5 py-1 opacity-80">{row.status}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">traffic</div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-200">{totalCount} payload{totalCount === 1 ? "" : "s"}</div>
        </div>
        <div className="rounded border border-slate-800 bg-black/20 px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">volume</div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-200">{formatStagePlayCount(totalBytes)}</div>
        </div>
      </div>
    </div>
  );
}

function StagePlayTrafficHeader({
  cadenceMs,
  mailAgeMs,
  packetAgeMs,
  deckLatencyMs,
  wakeLabel,
  wakeTone,
  runtimePressureLabel,
  unreadCount,
  retainedCount,
  heapRamLabel,
  rssRamLabel,
  pressureTone,
  workBudgetLabel,
  workBudgetTone,
  deckBudgetLabel,
}: {
  cadenceMs: number;
  mailAgeMs: number | null;
  packetAgeMs: number | null;
  deckLatencyMs: number;
  wakeLabel: string;
  wakeTone: "good" | "warn" | "blocked" | "default";
  runtimePressureLabel: string;
  unreadCount: number;
  retainedCount: number;
  heapRamLabel: string;
  rssRamLabel: string;
  pressureTone: "good" | "warn" | "blocked" | "default";
  workBudgetLabel: string;
  workBudgetTone: "good" | "warn" | "blocked" | "default";
  deckBudgetLabel: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-black/25 p-3" data-testid="stage-play-packet-traffic-header">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Traffic header</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-10">
        <StagePlayMetricPill label="interval" value={formatStagePlayMs(cadenceMs)} tone={cadenceMs <= 1000 ? "good" : cadenceMs <= 10_000 ? "warn" : "default"} />
        <StagePlayMetricPill label="mail age" value={formatStagePlayMs(mailAgeMs)} tone={mailAgeMs != null && mailAgeMs <= cadenceMs * 1.5 ? "good" : "warn"} />
        <StagePlayMetricPill label="packet age" value={formatStagePlayMs(packetAgeMs)} tone={packetAgeMs != null && packetAgeMs <= cadenceMs * 1.5 ? "good" : "warn"} />
        <StagePlayMetricPill label="deck time" value={formatStagePlayMs(deckLatencyMs)} tone={deckLatencyMs <= 1000 ? "good" : deckLatencyMs <= cadenceMs ? "warn" : "blocked"} />
        <StagePlayMetricPill label="interrupts" value={wakeLabel} tone={wakeTone} />
        <StagePlayMetricPill label="workload" value={workBudgetLabel} tone={workBudgetTone} />
        <StagePlayMetricPill label="deck budget" value={deckBudgetLabel} tone={workBudgetTone} />
        <StagePlayMetricPill label="pressure" value={runtimePressureLabel} tone={pressureTone} />
        <StagePlayMetricPill label="unread / retained" value={`${unreadCount} / ${retainedCount}`} />
        <StagePlayMetricPill label="heap / rss" value={`${heapRamLabel} | ${rssRamLabel}`} tone={pressureTone} />
      </div>
    </div>
  );
}

function StagePlayReasonerDots({
  traffic,
  onSelect,
}: {
  traffic: StagePlayPacketTrafficViewV1;
  onSelect: (packetKey: string) => void;
}) {
  const color = packetTrailColor(traffic.colorKey);
  const runByRole = new Map(traffic.microReasonerRuns.map((run) => [run.role, run]));
  const visibleRoles = traffic.microReasonerRuns.map((run) => run.role);
  if (visibleRoles.length === 1 && visibleRoles[0] === "hypothesis_arbiter") {
    const run = runByRole.get("hypothesis_arbiter");
    const recommendation = traffic.deckVerdict?.recommendedNext ?? "arbiter";
    return (
      <button
        type="button"
        onClick={() => onSelect(traffic.packetKey)}
        className="inline-flex max-w-full items-center gap-1.5 rounded border border-emerald-700 bg-emerald-950/35 px-2 py-1 text-[10px] font-semibold text-emerald-100"
        style={{ borderColor: color.border }}
        title={`Hypothesis Arbiter: ${run?.status ?? "missing"}${run?.latencyMs != null ? ` (${run.latencyMs}ms)` : ""}`}
        data-testid="stage-play-packet-reasoner-dot"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
        <span className="truncate">Arbiter OK {labelize(recommendation)}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" data-testid="stage-play-packet-reasoner-dots">
      {visibleRoles.map((role) => {
        const run = runByRole.get(role);
        const status = run?.status ?? "missing";
        const statusClass = status === "completed"
          ? "bg-emerald-400 text-emerald-950"
          : status === "running" || status === "queued"
            ? "bg-cyan-300 text-cyan-950"
            : status === "failed"
              ? "bg-rose-400 text-rose-950"
              : status === "skipped"
                ? "bg-slate-600 text-slate-200"
                : "bg-slate-800 text-slate-500";
        return (
          <button
            key={`${traffic.packetKey}:${role}`}
            type="button"
            onClick={() => onSelect(traffic.packetKey)}
            className={`h-5 min-w-5 rounded border px-1 font-mono text-[8px] font-semibold ${statusClass}`}
            style={{ borderColor: color.border }}
            title={`${MICRO_REASONER_DISPLAY[role].title}: ${status}${run?.latencyMs != null ? ` (${run.latencyMs}ms)` : ""}`}
            data-testid="stage-play-packet-reasoner-dot"
          >
            {MICRO_REASONER_DISPLAY[role].title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

function StagePlayPacketTrafficBoard({
  traffic,
  selectedPacketKey,
  onSelectPacket,
  workBudget,
}: {
  traffic: StagePlayPacketTrafficViewV1[];
  selectedPacketKey: string | null;
  onSelectPacket: (packetKey: string) => void;
  workBudget?: StagePlayMailLoopWorkBudgetV1 | null;
}) {
  const selected = traffic.find((row) => row.packetKey === selectedPacketKey) ?? null;
  const selectedColor = selected ? packetTrailColor(selected.colorKey) : null;
  const selectedCircuitHops = selected ? stagePlayPacketCircuitInspectorHops(selected) : [];
  const workBudgetTone = stagePlayBudgetTone(workBudget?.pressure?.level, workBudget?.pressure?.ratio);
  const budgetLevel = workBudget?.pressure?.level ? labelize(workBudget.pressure.level) : "n/a";
  const rolesPerPacket = workBudget?.usage?.rolesPerPacket;
  const estimatedDeckCallsPerMinute = workBudget?.usage?.estimatedDeckCallsPerMinute;
  const maxReasonerRunsPerMinute = workBudget?.limits?.maxReasonerRunsPerMinute;
  const activeAskWakeCount = workBudget?.usage?.activeAskWakeCount;
  const maxActiveAskWakes = workBudget?.limits?.maxActiveAskWakes;
  return (
    <div className="rounded-md border border-cyan-900/60 bg-cyan-950/10 p-3" data-testid="stage-play-packet-traffic-board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Processed Mail Traffic Board</div>
          <div className="mt-0.5 text-xs text-cyan-100/70">One packet, one visible path. Colors stay stable across refresh.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workBudget ? (
            <>
              <StagePlayMetricPill
                label="budget"
                value={`${budgetLevel} ${formatStagePlayBudgetRatio(workBudget.pressure?.ratio)}`}
                tone={workBudgetTone}
              />
              <StagePlayMetricPill
                label="roles / packet"
                value={typeof rolesPerPacket === "number" ? formatStagePlayCount(rolesPerPacket) : "n/a"}
              />
              <StagePlayMetricPill
                label="deck calls/min"
                value={`${typeof estimatedDeckCallsPerMinute === "number" ? formatStagePlayCount(estimatedDeckCallsPerMinute) : "n/a"} / ${typeof maxReasonerRunsPerMinute === "number" ? formatStagePlayCount(maxReasonerRunsPerMinute) : "n/a"}`}
                tone={stagePlayBudgetTone(null, workBudget.pressure?.estimatedReasonerLoad)}
              />
              <StagePlayMetricPill
                label="Ask lane"
                value={`${typeof activeAskWakeCount === "number" ? activeAskWakeCount : "n/a"} / ${typeof maxActiveAskWakes === "number" ? maxActiveAskWakes : "n/a"}`}
                tone={stagePlayBudgetTone(null, workBudget.pressure?.askLoad)}
              />
            </>
          ) : null}
          <a
            href="#stage-play-microdeck-panel"
            className="rounded border border-cyan-600/60 bg-cyan-950/40 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100 hover:border-cyan-300"
          >
            MicroReasoner Deck
          </a>
          <div className="font-mono text-[10px] text-cyan-100/60">{traffic.length} trail{traffic.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-[1180px] gap-2"
          style={{ gridTemplateColumns: `160px repeat(${STAGE_PLAY_PACKET_TRAFFIC_STATIONS.length}, minmax(116px, 1fr))` }}
        >
          <div className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Packet</div>
          {STAGE_PLAY_PACKET_TRAFFIC_STATIONS.map((station) => (
            <div key={station.key} className="rounded border border-slate-800 bg-slate-950/70 p-2">
              {station.key === "micro_reasoner_deck" ? (
                <a
                  href="#stage-play-microdeck-panel"
                  className="inline-flex w-full items-center justify-between gap-2 rounded border border-cyan-700/60 bg-cyan-950/35 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-cyan-100 hover:border-cyan-300"
                  aria-label="Open MicroReasoner Deck section"
                >
                  <span>{station.label}</span>
                  <span className="font-mono text-[9px] normal-case tracking-normal text-cyan-200/80">open</span>
                </a>
              ) : (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-200">{station.label}</div>
              )}
            </div>
          ))}
          {traffic.length > 0 ? traffic.map((row) => {
            const color = packetTrailColor(row.colorKey);
            return (
              <React.Fragment key={row.packetKey}>
                <button
                  type="button"
                  onClick={() => onSelectPacket(row.packetKey)}
                  className={`rounded border p-2 text-left ${selectedPacketKey === row.packetKey ? "bg-slate-900" : "bg-black/20"}`}
                  style={{ borderColor: color.border, boxShadow: selectedPacketKey === row.packetKey ? color.glow : undefined }}
                  data-testid="stage-play-packet-trail-row"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.hsl }} />
                    <span className="truncate text-[11px] font-semibold text-slate-100">{row.packetId?.split(":").at(-1)?.slice(0, 10) ?? row.packetKey.split(":").at(-1)?.slice(0, 10)}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[9px] text-slate-500">{labelize(row.status)}</div>
                  <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 px-1.5 py-1">
                    <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Deck</div>
                    <div className="mt-0.5 truncate text-[10px] font-semibold text-cyan-100">{stagePlayPacketDeckTitle(row.deck)}</div>
                    <div className="truncate font-mono text-[8px] text-slate-500">{stagePlayPacketDeckRunPlan(row.deck)}</div>
                  </div>
                  {row.coalescing?.label ? (
                    <div className="mt-1 line-clamp-2 rounded border border-amber-800 bg-amber-950/25 px-1.5 py-1 text-[9px] leading-snug text-amber-100">
                      {row.coalescing.label}
                    </div>
                  ) : null}
                </button>
                {STAGE_PLAY_PACKET_TRAFFIC_STATIONS.map((station) => {
                  const state = row.stationStates.find((entry) => entry.station === station.key);
                  const cellClassName = `min-h-[74px] rounded border p-2 text-left ${stagePlayTrafficStatusClass(state?.status ?? "pending")}`;
                  const cellStyle = { borderColor: state?.status === "pending" ? undefined : color.border };
                  if (station.key === "micro_reasoner_deck") {
                    return (
                      <div
                        key={`${row.packetKey}:${station.key}`}
                        className={cellClassName}
                        style={cellStyle}
                        title={state?.preview ?? station.label}
                        data-testid="stage-play-packet-station-cell"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectPacket(row.packetKey)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <span className="font-mono text-[9px] opacity-75">{stagePlayTrafficStatusGlyph(state?.status ?? "pending")}</span>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.hsl }} />
                        </button>
                        <div className="mt-2">
                          <StagePlayReasonerDots traffic={row} onSelect={onSelectPacket} />
                        </div>
                        <div className="mt-2 line-clamp-2 text-[10px] leading-snug opacity-85">
                          {stagePlayPacketDeckTitle(row.deck)}
                        </div>
                        <div className="mt-1 truncate font-mono text-[9px] opacity-70">
                          {stagePlayPacketDeckRunPlan(row.deck)}
                        </div>
                        {row.coalescing?.label ? (
                          <div className="mt-1 line-clamp-2 text-[9px] leading-snug text-amber-100">
                            {row.coalescing.label}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={`${row.packetKey}:${station.key}`}
                      type="button"
                      onClick={() => onSelectPacket(row.packetKey)}
                      className={cellClassName}
                      style={cellStyle}
                      title={state?.preview ?? station.label}
                      data-testid="stage-play-packet-station-cell"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] opacity-75">{stagePlayTrafficStatusGlyph(state?.status ?? "pending")}</span>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.hsl }} />
                      </div>
                      <div className="mt-2 line-clamp-2 text-[10px] leading-snug opacity-85">{state?.preview ?? "waiting"}</div>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          }) : (
            <div className="col-span-10 rounded border border-slate-800 bg-black/20 p-3 text-sm text-slate-500">
              Waiting for the first mail artifact to enter the traffic board.
            </div>
          )}
        </div>
      </div>
      {selected ? (
        <div className="mt-3 rounded-md border border-slate-800 bg-black/25 p-3" data-testid="stage-play-packet-inspector-drawer">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Packet inspector</div>
              <div className="mt-1 font-mono text-xs text-slate-200">{selected.packetId ?? selected.packetKey}</div>
            </div>
            <div className="rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-300">{labelize(selected.status)}</div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-5 xl:grid-cols-8">
            <StagePlayMetricPill label="raw mail chars" value={formatStagePlayCount(selected.metrics.rawMailChars ?? 0)} />
            <StagePlayMetricPill label="packet chars" value={formatStagePlayCount(selected.metrics.packetChars ?? 0)} />
            <StagePlayMetricPill label="compact chars" value={formatStagePlayCount(selected.metrics.compactChars ?? 0)} />
            <StagePlayMetricPill label="deck ms" value={formatStagePlayMs(selected.metrics.deckMs ?? null)} />
            <StagePlayMetricPill label="reasoners" value={`${selected.microReasonerRuns.filter((run) => run.status === "completed").length}/${selected.microReasonerRuns.length}`} />
            <StagePlayMetricPill
              label="workload"
              value={formatStagePlayBudgetRatio(selected.metrics.activePacketLoad)}
              tone={stagePlayBudgetTone(null, selected.metrics.activePacketLoad)}
            />
            <StagePlayMetricPill
              label="interrupt queue"
              value={formatStagePlayBudgetRatio(selected.metrics.queueLoad)}
              tone={stagePlayBudgetTone(null, selected.metrics.queueLoad)}
            />
            <StagePlayMetricPill
              label="deck calls/min"
              value={typeof selected.metrics.estimatedDeckCallsPerMinute === "number" ? formatStagePlayCount(selected.metrics.estimatedDeckCallsPerMinute) : "n/a"}
              tone={stagePlayBudgetTone(null, selected.metrics.estimatedReasonerLoad)}
            />
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
            <div
              className="rounded border border-cyan-900/60 bg-cyan-950/15 p-3"
              style={selectedColor ? { borderColor: selectedColor.border, boxShadow: selectedColor.glow } : undefined}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Selected deck</div>
              <div className="mt-1 text-sm font-semibold text-cyan-50" data-testid="stage-play-packet-inspector-deck-title">
                {stagePlayPacketDeckTitle(selected.deck)}
              </div>
              <div className="mt-1 font-mono text-[10px] text-cyan-100/70" data-testid="stage-play-packet-inspector-deck-plan">
                {stagePlayPacketDeckRunPlan(selected.deck)}
              </div>
              <div className="mt-2 text-xs leading-relaxed text-cyan-100/80">
                Roles shown here are the roles used by this packet deck: {selected.microReasonerRuns.map((run) => labelize(run.role)).join(", ") || "none"}.
              </div>
            </div>
            <div className={`rounded border p-3 ${
              selected.coalescing?.label
                ? "border-amber-800 bg-amber-950/25"
                : "border-slate-800 bg-slate-950/60"
            }`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Wake coalescing</div>
              <div className="mt-1 text-sm font-semibold text-slate-100" data-testid="stage-play-packet-inspector-coalescing">
                {selected.coalescing?.label ?? "no superseded wakes"}
              </div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">
                {(selected.coalescing?.supersededWakeIds ?? []).slice(0, 3).join(" | ") || "latest packet has no coalesced predecessors"}
              </div>
            </div>
          </div>
          <div
            className="mt-3 rounded border border-slate-800 bg-slate-950/65 p-3"
            data-testid="stage-play-packet-circuit-inspector"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Selected packet circuit</div>
              <div className="font-mono text-[10px] text-slate-500">packet-scoped observation path</div>
            </div>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
              {selectedCircuitHops.map((hop) => (
                <div
                  key={hop.key}
                  className="min-h-[76px] rounded border border-slate-800 bg-black/20 p-2"
                  style={selectedColor ? { borderColor: selectedColor.border } : undefined}
                  data-testid="stage-play-packet-circuit-hop"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{hop.label}</span>
                    {selectedColor ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: selectedColor.hsl }} aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-200">{hop.value}</div>
                  <div className="mt-1 truncate font-mono text-[9px] text-slate-500">
                    {hop.refs.slice(0, 3).map(compactStagePlayCircuitRef).join(" | ") || "refs pending"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {selected.microReasonerRuns.map((run) => (
              <div
                key={run.runId}
                className="rounded border border-slate-800 bg-slate-950/70 p-2"
                style={selectedColor ? { borderColor: selectedColor.border } : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex min-w-0 items-center gap-1.5">
                    {selectedColor ? (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selectedColor.hsl }} aria-hidden="true" />
                    ) : null}
                    <div className="truncate text-[11px] font-semibold text-slate-100">{MICRO_REASONER_DISPLAY[run.role].title}</div>
                  </div>
                  <div className="font-mono text-[9px] text-slate-500">{run.latencyMs == null ? run.status : `${run.latencyMs}ms`}</div>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] text-slate-400">{run.outputPreview || "No output yet."}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StagePlayGoalContextBoard({
  updates,
  sessions,
}: {
  updates: WorkstationGoalContextUpdateV1[];
  sessions: AgentGoalSessionV1[];
}) {
  const isPacketTraceUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
    return Boolean(update.updateId && update.contentRef);
  };
  const isFeedQueryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
    const refs = [update.contentRef, ...update.evidenceRefs, ...update.receiptRefs, ...update.loopRefs];
    return refs.some((ref) =>
      ref.includes("stage_play_context_feed_query:") ||
      ref.includes("workstation_context_feed:")
    );
  };
  const isTraceMemoryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
    if (update.producerKind === "trace_memory") return true;
    const refs = [
      update.contentRef,
      ...update.evidenceRefs,
      ...update.receiptRefs,
      ...update.loopRefs,
      ...update.sourceRefs,
    ];
    return refs.some((ref) => ref.includes("trace_memory") || ref.includes("trace-memory"));
  };
  const isVisualSummaryUpdate = (update: WorkstationGoalContextUpdateV1): boolean => {
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
  const recentUpdates = updates.slice(0, 6);
  const activeSessions = sessions.filter((session) => session.status === "active" || session.status === "blocked").slice(0, 3);
  const wakeInterruptCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "wake_agent").length,
    0,
  );
  const wakeUrgentCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) =>
      action.kind === "wake_agent" && action.interruptKind === "urgent"
    ).length,
    0,
  );
  const wakeBlockedCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) =>
      action.kind === "wake_agent" && action.interruptKind === "blocked"
    ).length,
    0,
  );
  const wakePolicyTriggeredCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) =>
      action.kind === "wake_agent" && action.interruptKind === "policy_triggered"
    ).length,
    0,
  );
  const narratorDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "speak_narrator" || action.kind === "bind_narrator_stream").length,
    0,
  );
  const narratorSpeechCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "speak_narrator").length,
    0,
  );
  const narratorBindingCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "bind_narrator_stream").length,
    0,
  );
  const narratorEventFeedCount = updates.filter((update) => update.producerKind === "narrator").length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "narrator_events")).length;
  const refsForGoalContextUpdate = (update: WorkstationGoalContextUpdateV1): string[] => [
    update.contentRef,
    ...update.sourceRefs,
    ...update.loopRefs,
    ...update.evidenceRefs,
    ...update.receiptRefs,
  ].filter(Boolean);
  const isRouteEvidenceContextUpdate = (update: WorkstationGoalContextUpdateV1): boolean =>
    update.producerKind === "route_watch" ||
    update.updateKind === "route_evidence" ||
    refsForGoalContextUpdate(update).some((ref) =>
      /^route_watch:|^watch_job:|^watch_policy:|^stage_play_live_source_watch_job:|^live_job_evidence:|^situation_construct_query:|^workstation_context_feed:route_evidence|^workstation_actuator:query_route_evidence/i.test(ref)
    );
  const isAutomationPolicyContextUpdate = (update: WorkstationGoalContextUpdateV1): boolean =>
    update.producerKind === "automation" ||
    update.updateKind === "automation_status" ||
    refsForGoalContextUpdate(update).some((ref) =>
      /^automation:|^automation_policy:|^workstation_context_feed:automation_policies|^stage_play_live_source_watch_job_policy:|^workstation_actuator:configure_route_watch/i.test(ref)
    );
  const routeEvidenceContextCount = updates.filter(isRouteEvidenceContextUpdate).length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "route_evidence")).length;
  const automationPolicyContextCount = updates.filter(isAutomationPolicyContextUpdate).length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "automation_policies")).length;
  const automationContextCount = updates.filter((update) =>
    update.producerKind === "automation" ||
    update.updateKind === "automation_status" ||
    update.producerKind === "route_watch"
  ).length;
  const packetTraceContextCount = updates.filter(isPacketTraceUpdate).length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "packet_traces")).length;
  const visualSummaryContextCount = updates.filter(isVisualSummaryUpdate).length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "visual_summaries")).length;
  const sourceHealthContextCount = updates.filter((update) => update.producerKind === "source_health" || update.updateKind === "source_status").length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "source_health")).length;
  const traceMemoryContextCount = updates.filter(isTraceMemoryUpdate).length +
    activeSessions.filter((session) => session.contextFeeds.some((feed) => feed.sourceKind === "trace_memory")).length;
  const audioTranscriptContextCount = updates.filter((update) =>
    update.producerKind === "audio_capture" ||
    update.producerKind === "transcription_loop" ||
    update.updateKind === "transcript_window"
  ).length + activeSessions.filter((session) =>
    session.contextFeeds.some((feed) => feed.sourceKind === "audio_transcripts")
  ).length;
  const translatedTranscriptContextCount = updates.filter((update) =>
    update.producerKind === "translation_loop" ||
    update.updateKind === "translated_transcript"
  ).length + activeSessions.filter((session) =>
    session.contextFeeds.some((feed) => feed.sourceKind === "translated_transcripts")
  ).length;
  const feedQueryContextCount = updates.filter(isFeedQueryUpdate).length +
    activeSessions.reduce((count, session) => count + session.contextFeeds.length, 0);
  const runningAutomationCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "set_loop_state" && action.state === "running").length,
    0,
  );
  const totalDispatchCount = updates.reduce((count, update) => count + update.suggestedDispatch.length, 0);
  const workstationControlDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter(isStagePlayWorkstationControlDispatch).length,
    0,
  );
  const presetDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "change_preset").length,
    0,
  );
  const sourceBindingDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "bind_source" || action.kind === "unbind_source").length,
    0,
  );
  const sourceRepairDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "repair_source").length,
    0,
  );
  const liveAnswerDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "update_live_answer").length,
    0,
  );
  const processGraphDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "focus_process_graph").length,
    0,
  );
  const panelDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "update_panel").length,
    0,
  );
  const goalContextDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "append_goal_context").length,
    0,
  );
  const loopDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) =>
      action.kind === "set_loop_state" || action.kind === "repair_loop"
    ).length,
    0,
  );
  const receiptDispatchCount = updates.reduce(
    (count, update) => count + update.suggestedDispatch.filter((action) => action.kind === "log_receipt").length,
    0,
  );
  const toolAttributedUpdateCount = updates.filter((update) =>
    Boolean(update.toolIdentity?.requestedToolName || update.toolIdentity?.canonicalToolName)
  ).length;
  const matchedToolActuatorUpdateCount = updates.filter((update) =>
    (update.toolIdentity?.matchedAllowedActuators.length ?? 0) > 0 ||
    (update.toolIdentity?.matchedAllowedActuatorRefs.length ?? 0) > 0
  ).length;
  const actuatorPolicyCount = activeSessions.reduce((count, session) => count + session.allowedActuators.length, 0);
  const narratorActuatorPolicyCount = activeSessions.reduce(
    (count, session) => count + session.allowedActuators.filter((actuator) =>
      actuator === "bind_narrator" || actuator === "narrator_bind_stream" || actuator === "narrator_say"
    ).length,
    0,
  );
  const terminalAuthorityRequiredCount = activeSessions.filter((session) => session.authority.finalReportsRequireTerminalAuthority).length;
  const observationOnlyUpdateCount = updates.filter((update) =>
    update.authority.assistantAnswer === false &&
    update.authority.terminalEligible === false &&
    update.authority.rawContentIncluded === false
  ).length;
  const policyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      ...update.evidenceRefs,
      ...update.loopRefs,
    ].filter((ref) =>
      ref.startsWith("context_feed:") ||
      ref.startsWith("agent_goal_context_feed:") ||
      ref.startsWith("agent_goal_allowed_actuator:") ||
      ref.startsWith("allowed_actuator:") ||
      ref.startsWith("workstation_context_feed:") ||
      ref.startsWith("workstation_actuator:")
    )));
  const contextFeedPolicyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    policyRefsForUpdate(update).filter((ref) =>
      ref.startsWith("context_feed:") ||
      ref.startsWith("agent_goal_context_feed:") ||
      ref.startsWith("workstation_context_feed:")
    );
  const actuatorPolicyRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    policyRefsForUpdate(update).filter((ref) =>
      ref.startsWith("allowed_actuator:") ||
      ref.startsWith("agent_goal_allowed_actuator:") ||
      ref.startsWith("workstation_actuator:")
    );
  const dispatchActuatorRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    update.suggestedDispatch.flatMap((action) => {
      if (action.kind === "change_preset") return ["workstation_actuator:change_preset"];
      if (action.kind === "bind_source") return ["workstation_actuator:bind_source"];
      if (action.kind === "unbind_source") return ["workstation_actuator:unbind_source"];
      if (action.kind === "set_loop_state") {
        return action.state === "paused"
          ? ["workstation_actuator:set_loop_state", "workstation_actuator:pause_loop"]
          : ["workstation_actuator:set_loop_state", "workstation_actuator:resume_loop"];
      }
      if (action.kind === "repair_loop") return ["workstation_actuator:repair_loop"];
      if (action.kind === "repair_source") return ["workstation_actuator:repair_source"];
      if (action.kind === "update_live_answer") return ["workstation_actuator:update_live_answer"];
      if (action.kind === "focus_process_graph") return ["workstation_actuator:focus_process_graph"];
      if (action.kind === "speak_narrator") return ["workstation_actuator:narrator_say"];
      if (action.kind === "bind_narrator_stream") return ["workstation_actuator:narrator_bind_stream", "workstation_actuator:bind_narrator"];
      if (action.kind === "ask_user") return ["workstation_actuator:ask_user"];
      return [];
    });
  const actuatorRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
      ...policyRefsForUpdate(update),
      ...dispatchActuatorRefsForUpdate(update),
    ].filter((ref) => ref.startsWith("workstation_actuator:"))));
  const matchedGoalAllowedActuatorRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    policyRefsForUpdate(update).filter((ref) => ref.startsWith("agent_goal_allowed_actuator:"));
  const freshnessFilterRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set(update.evidenceRefs.filter((ref) => ref.startsWith("freshness_filter:"))));
  const sessionFilterRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set(update.evidenceRefs.filter((ref) => ref.startsWith("agent_goal_session_filter:"))));
  const narratorRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] => {
    const evidenceRefs = [
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^helix_narrator_|^narrator:|^workstation_actuator:narrator_|narrator/i.test(ref)
    );
    const dispatchRefs = update.suggestedDispatch.flatMap((action) => {
      if (action.kind === "bind_narrator_stream") {
        return [action.sourceRef, `narrator:${action.streamKind}`, "workstation_context_feed:narrator_events", "workstation_actuator:narrator_bind_stream"];
      }
      if (action.kind === "speak_narrator") {
        return [`narrator:${action.mode}`, "workstation_context_feed:narrator_events", "workstation_actuator:narrator_say"];
      }
      return [];
    });
    return Array.from(new Set([...evidenceRefs, ...dispatchRefs]));
  };
  const transcriptRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^audio_transcript:|^transcript_window:|^translated_transcript|^translation_segment:|^workstation_context_feed:audio_transcripts|^workstation_context_feed:translated_transcripts|^workstation_actuator:query_audio_transcripts|^workstation_actuator:query_translation_segments/i.test(ref)
    )));
  const projectionRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^live_answer|^live-answer|^workstation_context_feed:live_answer_lines|^workstation_actuator:query_live_answer_state|^workstation_actuator:update_live_answer/i.test(ref)
    )));
  const sourceHealthRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.suggestedDispatch.flatMap((action) =>
        action.kind === "repair_source"
          ? [action.sourceRef, action.loopRef, "workstation_actuator:repair_source"].filter((ref): ref is string => Boolean(ref))
          : []
      ),
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^source_health:|^source_health_status:|^source_health_watch:|^source-health:|^stage_play_source_health:|^source_status:|^workstation_context_feed:source_health|^workstation_actuator:query_source_health|^workstation_actuator:repair_source/i.test(ref)
    )));
  const routeWatchRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^route_watch:|^watch_job:|^watch_policy:|^stage_play_live_source_watch_job:|^live_job_evidence:|^situation_construct_query:|^workstation_context_feed:route_evidence|^workstation_actuator:query_route_evidence/i.test(ref)
    )));
  const automationRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^automation:|^automation_policy:|^workstation_context_feed:automation_policies|^stage_play_live_source_watch_job_policy:|^workstation_actuator:configure_route_watch/i.test(ref)
    )));
  const traceMemoryRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^trace_memory:|^trace-memory:|^workstation_trace_memory:|^workstation_context_feed:trace_memory/i.test(ref) ||
      /trace_memory|trace-memory/i.test(ref)
    )));
  const microDeckRefsForUpdate = (update: WorkstationGoalContextUpdateV1): string[] =>
    Array.from(new Set([
      update.contentRef,
      ...update.sourceRefs,
      ...update.loopRefs,
      ...update.evidenceRefs,
      ...update.receiptRefs,
    ].filter((ref) =>
      /^microdeck:|^microdeck_|^micro_reasoner:|^microdeck_output:|^stage_play_micro_reasoner_|^workstation_context_feed:microdeck_outputs|^workstation_actuator:query_microdeck_outputs|prompt_preset/i.test(ref)
    )));
  const microDeckLifecycleRefs = Array.from(new Set(updates.flatMap(microDeckRefsForUpdate)));
  const microDeckFeedSessionCount = activeSessions.filter((session) =>
    session.contextFeeds.some((feed) => feed.sourceKind === "microdeck_outputs")
  ).length;
  const microDeckLifecycleContextCount = microDeckLifecycleRefs.length + microDeckFeedSessionCount;
  const countMicroDeckLifecycleRefs = (patterns: RegExp[]): number =>
    microDeckLifecycleRefs.filter((ref) => patterns.some((pattern) => pattern.test(ref))).length;
  const microDeckPresetCreateCount = countMicroDeckLifecycleRefs([/^microdeck:preset_create/i]);
  const microDeckPresetStateCount = countMicroDeckLifecycleRefs([/^microdeck:preset_state/i, /^microdeck_output:/i]);
  const microDeckPresetQueryCount = countMicroDeckLifecycleRefs([/^microdeck:preset_query/i, /^workstation_context_feed:microdeck_outputs/i, /^workstation_actuator:query_microdeck_outputs/i]);
  const microDeckPresetDraftCount = countMicroDeckLifecycleRefs([/^microdeck:preset_draft/i]);
  const microDeckPromptRouteCount = countMicroDeckLifecycleRefs([/^microdeck:prompt_route/i]);
  const microDeckPromptUpdateCount = countMicroDeckLifecycleRefs([/^microdeck:prompt_update/i]);
  const microDeckPromptTestCount = countMicroDeckLifecycleRefs([/^microdeck:prompt_test/i]);
  const feedPolicyRefCount = updates.reduce((count, update) => count + contextFeedPolicyRefsForUpdate(update).length, 0);
  const actuatorPolicyRefCount = updates.reduce((count, update) => count + actuatorPolicyRefsForUpdate(update).length, 0);
  const actuatorRefCount = updates.reduce((count, update) => count + actuatorRefsForUpdate(update).length, 0);
  const exactGoalActuatorPolicyRefCount = updates.reduce((count, update) => count + matchedGoalAllowedActuatorRefsForUpdate(update).length, 0);
  const freshnessFilterRefCount = updates.reduce((count, update) => count + freshnessFilterRefsForUpdate(update).length, 0);
  const sessionFilterRefCount = updates.reduce((count, update) => count + sessionFilterRefsForUpdate(update).length, 0);
  const sessionFeedPolicyRefs = (session: AgentGoalSessionV1): string[] =>
    session.contextFeeds.flatMap((feed) => {
      const actuator = queryActuatorForAgentGoalContextFeedV1(feed.sourceKind);
      const refs = [`agent_goal_context_feed:${feed.feedId}`];
      if (session.allowedActuators.includes(actuator)) {
        refs.push(`agent_goal_allowed_actuator:${actuator}`);
      }
      return refs;
    });
  const formatSessionCadence = (cadence: AgentGoalSessionV1["cadence"]): string => {
    if (cadence.kind === "event_accumulation") return `event accumulation / ${cadence.minUpdates} updates`;
    if (cadence.kind === "interval") return `interval / ${cadence.everyMs}ms`;
    return labelize(cadence.kind);
  };
  const formatFinalReportContract = (session: AgentGoalSessionV1): string => {
    const requirements = session.authority.finalReportRequirements;
    return [
      `completed_solver_path=${String(requirements?.completedSolverPathRequired ?? false)}`,
      `evidence_reentry=${String(requirements?.evidenceReentryRequired ?? false)}`,
      `route_authority=${String(requirements?.routeAuthorityRequired ?? false)}`,
      `single_writer=${String(requirements?.terminalAuthoritySingleWriterRequired ?? false)}`,
      `allowed_terminal=${requirements?.allowedTerminalArtifactKinds?.map(labelize).join(", ") || "none"}`,
      `required_evidence=${requirements?.requiredEvidenceKinds?.map(labelize).join(", ") || "none"}`,
      `prohibited_sources=${requirements?.prohibitedReportSources?.map(labelize).join(", ") || "none"}`,
    ].join("; ");
  };
  const authorityChipClass = (flag: boolean): string =>
    flag
      ? "rounded border border-rose-400/40 bg-rose-950/25 px-1.5 py-0.5 font-mono text-[9px] text-rose-100"
      : "rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-400";
  const freshnessLabel = (update: WorkstationGoalContextUpdateV1): string =>
    `${labelize(update.freshness.status)} observed=${update.freshness.observedAtMs} staleAfter=${update.freshness.staleAfterMs === undefined ? "unbounded" : `${update.freshness.staleAfterMs}ms`}`;
  return (
    <div className="rounded-md border border-violet-900/60 bg-violet-950/10 p-3" data-testid="stage-play-goal-context-board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">Goal Context Substrate</div>
          <div className="mt-0.5 text-xs text-violet-100/70">
            Micro-reasoner outputs feed queryable goal context first. Wake-agent appears only as classified interrupt dispatch.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StagePlayMetricPill label="updates" value={formatStagePlayCount(updates.length)} />
          <StagePlayMetricPill label="interrupt dispatches" value={formatStagePlayCount(wakeInterruptCount)} tone={wakeInterruptCount > 0 ? "warn" : "default"} />
          <StagePlayMetricPill label="narrator dispatch" value={formatStagePlayCount(narratorDispatchCount)} tone={narratorDispatchCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="narrator speech" value={formatStagePlayCount(narratorSpeechCount)} tone={narratorSpeechCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="narrator bindings" value={formatStagePlayCount(narratorBindingCount)} tone={narratorBindingCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="narrator events" value={formatStagePlayCount(narratorEventFeedCount)} tone={narratorEventFeedCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="visual summaries" value={formatStagePlayCount(visualSummaryContextCount)} tone={visualSummaryContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="packet traces" value={formatStagePlayCount(packetTraceContextCount)} tone={packetTraceContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="source health" value={formatStagePlayCount(sourceHealthContextCount)} tone={sourceHealthContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="trace memory" value={formatStagePlayCount(traceMemoryContextCount)} tone={traceMemoryContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="audio transcripts" value={formatStagePlayCount(audioTranscriptContextCount)} tone={audioTranscriptContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="translations" value={formatStagePlayCount(translatedTranscriptContextCount)} tone={translatedTranscriptContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="MicroDeck lifecycle" value={formatStagePlayCount(microDeckLifecycleContextCount)} tone={microDeckLifecycleContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="feed queries" value={formatStagePlayCount(feedQueryContextCount)} tone={feedQueryContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="feed policy refs" value={formatStagePlayCount(feedPolicyRefCount)} tone={feedPolicyRefCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="actuator refs" value={formatStagePlayCount(actuatorRefCount)} tone={actuatorRefCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="freshness filters" value={formatStagePlayCount(freshnessFilterRefCount)} tone={freshnessFilterRefCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="session filters" value={formatStagePlayCount(sessionFilterRefCount)} tone={sessionFilterRefCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="tool-attributed" value={formatStagePlayCount(toolAttributedUpdateCount)} tone={toolAttributedUpdateCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="matched actuators" value={formatStagePlayCount(matchedToolActuatorUpdateCount)} tone={matchedToolActuatorUpdateCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="route evidence" value={formatStagePlayCount(routeEvidenceContextCount)} tone={routeEvidenceContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="automations" value={formatStagePlayCount(automationContextCount)} tone={automationContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="automation policies" value={formatStagePlayCount(automationPolicyContextCount)} tone={automationPolicyContextCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="actuator policies" value={formatStagePlayCount(actuatorPolicyCount)} tone={actuatorPolicyCount > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="active goals" value={formatStagePlayCount(activeSessions.length)} tone={activeSessions.length > 0 ? "good" : "default"} />
          <StagePlayMetricPill label="terminal authority" value={`${terminalAuthorityRequiredCount}/${activeSessions.length}`} tone={terminalAuthorityRequiredCount > 0 ? "warn" : "default"} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-[10px] md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-goal-context-authority-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Observation authority</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(observationOnlyUpdateCount)} updates are evidence-only, non-terminal context.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-terminal-authority-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Terminal authority</div>
          <div className="mt-0.5 text-slate-400">Final reports require a completed solver path for {formatStagePlayCount(terminalAuthorityRequiredCount)} active goal session{terminalAuthorityRequiredCount === 1 ? "" : "s"}.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-narrator-binding-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Narrator bindings</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(narratorBindingCount)} stream binding dispatch{narratorBindingCount === 1 ? "" : "es"} visible beside narrator speech requests.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-packet-trace-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Packet traces</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(packetTraceContextCount)} packet trace context item{packetTraceContextCount === 1 ? "" : "s"} keep per-packet travel visible as evidence.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-visual-summary-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Visual summaries</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(visualSummaryContextCount)} visual summary context item{visualSummaryContextCount === 1 ? "" : "s"} keep screen/image observations queryable before agent reasoning.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-source-health-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Source health</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(sourceHealthContextCount)} source-health context item{sourceHealthContextCount === 1 ? "" : "s"} keep loop/source status queryable before agent reasoning.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-trace-memory-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Trace memory</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(traceMemoryContextCount)} trace-memory context item{traceMemoryContextCount === 1 ? "" : "s"} keep prior reasoning queryable without answer authority.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-audio-transcript-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Audio transcripts</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(audioTranscriptContextCount)} audio transcript context item{audioTranscriptContextCount === 1 ? "" : "s"} keep capture speech queryable before agent reasoning.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-translation-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Translations</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(translatedTranscriptContextCount)} translated transcript context item{translatedTranscriptContextCount === 1 ? "" : "s"} keep translation output visible as evidence for Live Answer and Narrator.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-microdeck-lifecycle-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">MicroDeck lifecycle</div>
          <div className="mt-0.5 text-slate-400">
            {formatStagePlayCount(microDeckLifecycleContextCount)} lifecycle ref{microDeckLifecycleContextCount === 1 ? "" : "s"} track deck output and management: create={formatStagePlayCount(microDeckPresetCreateCount)}, state={formatStagePlayCount(microDeckPresetStateCount)}, query={formatStagePlayCount(microDeckPresetQueryCount)}, draft={formatStagePlayCount(microDeckPresetDraftCount)}, route={formatStagePlayCount(microDeckPromptRouteCount)}, update={formatStagePlayCount(microDeckPromptUpdateCount)}, test={formatStagePlayCount(microDeckPromptTestCount)}.
          </div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-route-watch-automation-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Route-watch automations</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(routeEvidenceContextCount)} route evidence item{routeEvidenceContextCount === 1 ? "" : "s"} and {formatStagePlayCount(automationPolicyContextCount)} automation polic{automationPolicyContextCount === 1 ? "y" : "ies"} with {formatStagePlayCount(runningAutomationCount)} running loop dispatch{runningAutomationCount === 1 ? "" : "es"}.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-dispatch-mix-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Dispatch mix</div>
          <div className="mt-0.5 text-slate-400">
            {formatStagePlayCount(totalDispatchCount)} dispatch suggestion{totalDispatchCount === 1 ? "" : "s"}: {formatStagePlayCount(wakeInterruptCount)} interrupt dispatch{wakeInterruptCount === 1 ? "" : "es"}, {formatStagePlayCount(panelDispatchCount)} panel update{panelDispatchCount === 1 ? "" : "s"}, {formatStagePlayCount(narratorSpeechCount)} narrator speech, {formatStagePlayCount(narratorBindingCount)} narrator binding{narratorBindingCount === 1 ? "" : "s"}, {formatStagePlayCount(sourceRepairDispatchCount)} source repair{sourceRepairDispatchCount === 1 ? "" : "s"}, {formatStagePlayCount(loopDispatchCount)} loop action{loopDispatchCount === 1 ? "" : "s"}, {formatStagePlayCount(goalContextDispatchCount)} goal-context append{goalContextDispatchCount === 1 ? "" : "s"}, {formatStagePlayCount(receiptDispatchCount)} receipt log{receiptDispatchCount === 1 ? "" : "s"}.
          </div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-control-dispatch-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Workstation controls</div>
          <div className="mt-0.5 text-slate-400">
            {formatStagePlayCount(workstationControlDispatchCount)} workstation control dispatch{workstationControlDispatchCount === 1 ? "" : "es"}: {formatStagePlayCount(presetDispatchCount)} preset, {formatStagePlayCount(sourceBindingDispatchCount)} source binding, {formatStagePlayCount(sourceRepairDispatchCount)} source repair, {formatStagePlayCount(loopDispatchCount)} loop, {formatStagePlayCount(liveAnswerDispatchCount)} Live Answer, {formatStagePlayCount(processGraphDispatchCount)} graph, {formatStagePlayCount(narratorSpeechCount)} narrator speech, {formatStagePlayCount(narratorBindingCount)} narrator binding{narratorBindingCount === 1 ? "" : "s"}. Wake-agent is limited to {formatStagePlayCount(wakeInterruptCount)} interrupt dispatch{wakeInterruptCount === 1 ? "" : "es"}.
          </div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-wake-interrupt-scope-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Interrupt dispatch scope</div>
          <div className="mt-0.5 text-slate-400">
            Interrupt split: {formatStagePlayCount(wakeUrgentCount)} urgent, {formatStagePlayCount(wakeBlockedCount)} blocked, {formatStagePlayCount(wakePolicyTriggeredCount)} policy-triggered. Other dispatches stay on workstation control lanes.
          </div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-actuator-policy-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Actuator policy</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(actuatorPolicyCount)} allowed actuator{actuatorPolicyCount === 1 ? "" : "s"} bound to goal sessions; {formatStagePlayCount(narratorActuatorPolicyCount)} narrator output policy item{narratorActuatorPolicyCount === 1 ? "" : "s"}; {formatStagePlayCount(narratorEventFeedCount)} narrator event feed{narratorEventFeedCount === 1 ? "" : "s"}.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-actuator-ref-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Actuator refs</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(actuatorRefCount)} workstation actuator ref{actuatorRefCount === 1 ? "" : "s"} expose query and control traffic as packet-circuit custody, not answer authority.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-feed-policy-ref-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Feed policy refs</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(feedPolicyRefCount)} context-feed policy ref{feedPolicyRefCount === 1 ? "" : "s"} and {formatStagePlayCount(actuatorPolicyRefCount)} actuator policy ref{actuatorPolicyRefCount === 1 ? "" : "s"} link feed inputs to controlled workstation outputs; {formatStagePlayCount(exactGoalActuatorPolicyRefCount)} exact goal authorization ref{exactGoalActuatorPolicyRefCount === 1 ? "" : "s"} are visible for debugging.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-freshness-filter-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Freshness filters</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(freshnessFilterRefCount)} requested freshness filter ref{freshnessFilterRefCount === 1 ? "" : "s"} show whether the agent queried fresh, stale, blocked, or unknown context.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-session-filter-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Session filters</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(sessionFilterRefCount)} goal-session filter ref{sessionFilterRefCount === 1 ? "" : "s"} show which feed and actuator constraints shaped the agent context query.</div>
        </div>
        <div className="rounded border border-violet-900/50 bg-slate-950/60 px-2 py-1.5" data-testid="stage-play-tool-attribution-state">
          <div className="font-semibold uppercase tracking-wide text-violet-200/80">Tool attribution</div>
          <div className="mt-0.5 text-slate-400">{formatStagePlayCount(toolAttributedUpdateCount)} tool-attributed update{toolAttributedUpdateCount === 1 ? "" : "s"}; {formatStagePlayCount(matchedToolActuatorUpdateCount)} matched allowed actuator update{matchedToolActuatorUpdateCount === 1 ? "" : "s"} expose requested tool, canonical tool, and exact goal authorization refs.</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentUpdates.length > 0 ? recentUpdates.map((update) => {
            const color = packetTrailColor(update.contentRef);
            const policyRefs = policyRefsForUpdate(update);
            const contextFeedPolicyRefs = contextFeedPolicyRefsForUpdate(update);
            const actuatorPolicyRefs = actuatorPolicyRefsForUpdate(update);
            const matchedGoalActuatorRefs = matchedGoalAllowedActuatorRefsForUpdate(update);
            const freshnessFilterRefs = freshnessFilterRefsForUpdate(update);
            const sessionFilterRefs = sessionFilterRefsForUpdate(update);
            const narratorRefs = narratorRefsForUpdate(update);
            const transcriptRefs = transcriptRefsForUpdate(update);
            const projectionRefs = projectionRefsForUpdate(update);
            const sourceHealthRefs = sourceHealthRefsForUpdate(update);
            const actuatorRefs = actuatorRefsForUpdate(update);
            const traceMemoryRefs = traceMemoryRefsForUpdate(update);
            const routeWatchRefs = routeWatchRefsForUpdate(update);
            const automationRefs = automationRefsForUpdate(update);
            const microDeckRefs = microDeckRefsForUpdate(update);
            const circuitHops = stagePlayGoalContextCircuitHops(update);
            return (
              <div
                key={update.updateId}
                className="rounded border border-violet-900/60 bg-slate-950/70 p-2"
                style={{ borderColor: color.border }}
                data-testid="stage-play-goal-context-update"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.hsl }} />
                    <span className="truncate text-[11px] font-semibold text-violet-50">{labelize(update.updateKind)}</span>
                  </div>
                  <span className="font-mono text-[9px] text-violet-200/70">{labelize(update.producerKind)}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-300">{update.preview}</div>
                <div
                  className="mt-2 grid gap-1 rounded border border-slate-800 bg-black/25 p-1.5 sm:grid-cols-3"
                  data-testid="stage-play-goal-context-circuit-route"
                >
                  {circuitHops.map((hop) => (
                    <div key={`${update.updateId}:circuit:${hop.key}`} className="min-w-0">
                      <div className="text-[8px] font-semibold uppercase tracking-wide text-violet-200/60">{hop.label}</div>
                      <div className="mt-0.5 truncate font-mono text-[9px] text-slate-300">{hop.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1" data-testid="stage-play-goal-context-authority-chips">
                  <span className={authorityChipClass(update.authority.assistantAnswer)}>assistant={String(update.authority.assistantAnswer)}</span>
                  <span className={authorityChipClass(update.authority.terminalEligible)}>terminal={String(update.authority.terminalEligible)}</span>
                  <span className={authorityChipClass(update.authority.rawContentIncluded)}>raw={String(update.authority.rawContentIncluded)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {update.suggestedDispatch.slice(0, 4).map((action, index) => (
                    <span
                      key={`${update.updateId}:dispatch:${index}`}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${stagePlayTrafficRowTone(stagePlayDispatchTone(action))}`}
                      data-testid="stage-play-goal-context-dispatch"
                    >
                      {stagePlayDispatchActionLabel(action)}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid gap-1 border-t border-violet-900/40 pt-1.5 font-mono text-[9px] text-slate-500" data-testid="stage-play-goal-context-update-custody">
                  <div className="truncate">sources={update.sourceRefs.slice(0, 3).join(", ") || "none"}</div>
                  <div className="truncate">evidence={update.evidenceRefs.slice(0, 3).join(", ") || "none"}</div>
                  <div className="truncate">receipts={update.receiptRefs.slice(0, 3).join(", ") || "none"}</div>
                  {narratorRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-narrator-refs">
                      narrator={narratorRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {transcriptRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-transcript-refs">
                      transcripts={transcriptRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {projectionRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-projection-refs">
                      projections={projectionRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {sourceHealthRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-source-health-refs">
                      sourceHealth={sourceHealthRefs.slice(0, 6).join(", ")}
                    </div>
                  ) : null}
                  {actuatorRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-actuator-refs">
                      actuators={actuatorRefs.slice(0, 6).join(", ")}
                    </div>
                  ) : null}
                  {traceMemoryRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-trace-memory-refs">
                      traceMemory={traceMemoryRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {microDeckRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-microdeck-refs">
                      microdeck={microDeckRefs.slice(0, 8).join(", ")}
                    </div>
                  ) : null}
                  {routeWatchRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-route-watch-refs">
                      routeWatch={routeWatchRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {automationRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-automation-refs">
                      automation={automationRefs.slice(0, 5).join(", ")}
                    </div>
                  ) : null}
                  {policyRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-update-policy">policy={policyRefs.slice(0, 10).join(", ")}</div>
                  ) : null}
                  {contextFeedPolicyRefs.length > 0 || actuatorPolicyRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-update-policy-split">
                      feeds={contextFeedPolicyRefs.slice(0, 5).join(", ") || "none"}; actuators={actuatorPolicyRefs.slice(0, 6).join(", ") || "none"}
                    </div>
                  ) : null}
                  {matchedGoalActuatorRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-update-matched-actuator-refs">
                      matchedActuatorRefs={matchedGoalActuatorRefs.slice(0, 4).join(", ")}
                    </div>
                  ) : null}
                  {freshnessFilterRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-update-freshness-filter">
                      requestedFreshness={freshnessFilterRefs.slice(0, 4).join(", ")}
                    </div>
                  ) : null}
                  {sessionFilterRefs.length > 0 ? (
                    <div className="truncate" data-testid="stage-play-goal-context-update-session-filter">
                      requestedSession={sessionFilterRefs.slice(0, 4).join(", ")}
                    </div>
                  ) : null}
                  <div className="truncate" data-testid="stage-play-goal-context-update-freshness">freshness={freshnessLabel(update)}</div>
                  {update.goalRelevance ? (
                    <div className="truncate">goal={update.goalRelevance.goalId} relevance={update.goalRelevance.relevance.toFixed(2)}</div>
                  ) : null}
                </div>
                <div className="mt-2 truncate border-t border-violet-900/40 pt-1.5 font-mono text-[9px] text-slate-500">
                  {update.contentRef}
                </div>
              </div>
            );
          }) : (
            <div className="rounded border border-slate-800 bg-black/20 p-3 text-sm text-slate-500">
              Waiting for micro-reasoner outputs, trace receipts, or live-source summaries to feed goal context.
            </div>
          )}
        </div>
        <div className="rounded border border-slate-800 bg-black/25 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Agent goal sessions</div>
          <div className="mt-1 text-xs leading-relaxed text-slate-500">
            Goal sessions read these streams and actuate panels; final reports still require terminal authority.
          </div>
          <div className="mt-3 space-y-2">
            {activeSessions.length > 0 ? activeSessions.map((session) => {
              const feedPolicyRefs = sessionFeedPolicyRefs(session);
              const narratorControls = stagePlayNarratorControlActuators(session.allowedActuators);
              return (
              <div key={session.goalId} className="rounded border border-violet-900/50 bg-violet-950/15 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[11px] font-semibold text-violet-50">{session.userVisibleSummary}</div>
                  <span className="font-mono text-[9px] text-violet-200/70">{labelize(session.status)}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] text-slate-400">{session.objective}</div>
                <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[9px] text-slate-400">
                  final_reports_require_terminal_authority={String(session.authority.finalReportsRequireTerminalAuthority)} required_evidence={session.authority.finalReportRequirements?.requiredEvidenceKinds?.length ?? 0} prohibited_sources={session.authority.finalReportRequirements?.prohibitedReportSources?.length ?? 0}
                </div>
                <div className="mt-2 grid gap-1 font-mono text-[9px] text-slate-400" data-testid="stage-play-agent-goal-session-contract">
                  <div data-testid="stage-play-agent-goal-session-feeds">
                    feeds={session.contextFeeds.map((feed) => labelize(feed.sourceKind)).join(", ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-actuators">
                    actuators={session.allowedActuators.map((actuator) => labelize(actuator)).join(", ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-narrator-controls">
                    narratorControls={narratorControls.map((actuator) => labelize(actuator)).join(", ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-final-report-contract">
                    finalReportContract={formatFinalReportContract(session)}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-feed-policy-refs">
                    feedPolicyRefs={feedPolicyRefs.slice(0, 18).join(", ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-loops">
                    loops={session.loopRefs.slice(0, 4).join(", ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-cadence">
                    cadence={formatSessionCadence(session.cadence)}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-stop-conditions">
                    stop={session.stopConditions.slice(0, 2).join(" | ") || "none"}
                  </div>
                  <div data-testid="stage-play-agent-goal-session-checkpoint">
                    checkpoint={session.checkpoints.at(-1)?.summary ?? "none"}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5" data-testid="stage-play-agent-goal-session-checkpoint-trail">
                  {session.checkpoints.slice(-3).reverse().map((checkpoint) => (
                    <div
                      key={checkpoint.checkpointId}
                      className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                      data-testid="stage-play-agent-goal-session-checkpoint-item"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="line-clamp-2 text-[10px] leading-snug text-slate-300">{checkpoint.summary}</div>
                        <span className="font-mono text-[9px] text-violet-200/70">{labelize(checkpoint.nextStep)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1" data-testid="stage-play-agent-goal-session-checkpoint-actions">
                        {checkpoint.actionsTaken.slice(0, 3).map((action) => (
                          <span key={`${checkpoint.checkpointId}:action:${action}`} className="rounded border border-violet-900/50 bg-violet-950/20 px-1.5 py-0.5 font-mono text-[9px] text-violet-100/80">
                            {labelize(action)}
                          </span>
                        ))}
                        {checkpoint.actionsTaken.length > 3 ? (
                          <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                            +{checkpoint.actionsTaken.length - 3}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate font-mono text-[9px] text-slate-500" data-testid="stage-play-agent-goal-session-checkpoint-evidence">
                        evidence={checkpoint.evidenceRefs.slice(0, 2).join(", ") || "none"}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.allowedActuators.slice(0, 4).map((actuator) => (
                    <span key={`${session.goalId}:${actuator}`} className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                      {labelize(actuator)}
                    </span>
                  ))}
                </div>
              </div>
              );
            }) : (
              <div className="rounded border border-slate-800 bg-slate-950/70 p-2 text-xs text-slate-500">
                No active goal session is attached. Updates remain available as workstation context.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StagePlayMailJourneyRail({
  stations,
  deckRows,
  payloadChars,
  packetChars,
  deckLatencyMs,
  deckRuntimeLabel,
  combinedRuntimeTone,
  selectedPayloadId,
  onSelectPayload,
}: {
  stations: StagePlayMailJourneyStation[];
  deckRows: StagePlayMailJourneyReasonerRow[];
  payloadChars: number;
  packetChars: number;
  deckLatencyMs: number;
  deckRuntimeLabel: string;
  combinedRuntimeTone: "good" | "warn" | "blocked" | "default";
  selectedPayloadId: string | null;
  onSelectPayload: (payloadId: string) => void;
}) {
  return (
    <div
      className="rounded-md border border-cyan-900/60 bg-cyan-950/10 p-3"
      data-testid="stage-play-mail-journey-rail"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Mail journey</div>
          <div className="mt-0.5 text-xs text-cyan-100/70">One payload lineage across capture, packetization, wake, Ask, and voice/decision receipts.</div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-cyan-100/60">
          <span data-testid="stage-play-mail-journey-packet">{stations.length} stations</span>
        </div>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(260px,320px)]">
        <StagePlayMailPayloadLedger
          stations={stations}
          payloadChars={payloadChars}
          packetChars={packetChars}
          deckLatencyMs={deckLatencyMs}
          selectedPayloadId={selectedPayloadId}
          onSelectPayload={onSelectPayload}
        />
        <div className="min-w-0 rounded-md border border-slate-800 bg-black/20 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Payload station board</div>
              <div className="mt-0.5 text-xs text-slate-500">Mail blocks appear inside every checkpoint they have reached.</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400">
              no global cursor
            </div>
            <span className="sr-only" data-testid="stage-play-mail-journey-moving-box">per-payload station board</span>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-4" data-testid="stage-play-mail-journey-stations">
            {stations.map((station, index) => (
              <div
                key={station.key}
                className={`relative rounded-md border p-2.5 ${stagePlayJourneyStationTone(station.state)}`}
                data-testid="stage-play-mail-journey-station"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full border ${stagePlayJourneyDotTone(station.state)}`} />
                  <span className="font-mono text-[9px] opacity-70">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-75">Checkpoint {String(index + 1).padStart(2, "0")}</div>
                <div className="mt-0.5 truncate text-[11px] font-semibold">{station.title}</div>
                <div className="mt-0.5 truncate font-mono text-[9px] opacity-70">{station.status}</div>
                <div className="mt-2 line-clamp-3 text-[10px] leading-snug opacity-85">{station.body}</div>
                <div className="mt-2 flex flex-wrap gap-1" data-testid="stage-play-mail-journey-station-payloads">
                  {(station.payloads ?? []).slice(0, 4).map((payload) => (
                    <button
                      type="button"
                      key={payload.id}
                      onClick={() => onSelectPayload(payload.id)}
                      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                        payload.id === selectedPayloadId
                          ? "border-cyan-300 bg-cyan-950/45 text-cyan-50"
                          : stagePlayJourneyStationTone(payload.state)
                      }`}
                      title={`${payload.label}: ${payload.preview}`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full border ${stagePlayJourneyDotTone(payload.state)}`} />
                      <span className="truncate">{payload.label}</span>
                    </button>
                  ))}
                  {(station.payloads?.length ?? 0) > 4 ? (
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] opacity-70">
                      +{(station.payloads?.length ?? 0) - 4}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 truncate border-t border-current/15 pt-1.5 font-mono text-[9px] opacity-65">{station.meta}</div>
              </div>
            ))}
          </div>
        </div>
        <StagePlayMicroReasonerDeckColumn
          rows={deckRows}
          deckRuntimeLabel={deckRuntimeLabel}
          combinedRuntimeTone={combinedRuntimeTone}
        />
      </div>
    </div>
  );
}

const stagePlayTrafficRowTone = (tone: StagePlayTrafficDetailRow["tone"]): string => {
  if (tone === "good") return "border-emerald-900/70 bg-emerald-950/20 text-emerald-100";
  if (tone === "warn") return "border-amber-900/70 bg-amber-950/20 text-amber-100";
  if (tone === "blocked") return "border-rose-900/70 bg-rose-950/25 text-rose-100";
  return "border-slate-800 bg-slate-950/60 text-slate-200";
};

function StagePlaySelectedTrafficDetail({ detail }: { detail: StagePlayTrafficDetail | null }) {
  if (!detail) {
    return (
      <div
        className="rounded-md border border-slate-800 bg-black/20 p-3"
        data-testid="stage-play-selected-mail-detail"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Packet inspector</div>
        <div className="mt-2 text-sm text-slate-500">Click a mail or packet chip in the journey to inspect its lineage.</div>
      </div>
    );
  }
  return (
    <div
      className="rounded-md border border-slate-800 bg-black/20 p-3"
      data-testid="stage-play-selected-mail-detail"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Packet inspector</div>
          <div className="mt-1 truncate text-base font-semibold text-slate-50">{detail.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">{detail.id}</div>
        </div>
        <div className={`rounded border px-2 py-1 font-mono text-[10px] ${stagePlayJourneyStationTone(detail.state)}`}>
          {detail.status}
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{detail.station}</div>
          <div className="mt-1 min-h-[88px] rounded border border-slate-800 bg-slate-950 p-3 text-sm leading-relaxed text-slate-100">
            {detail.summary}
          </div>
          <div className="mt-2 font-mono text-[10px] text-slate-500">{detail.meta}</div>
          <div className="mt-3 rounded border border-slate-800 bg-slate-950/70 p-2" data-testid="stage-play-selected-mail-lineage">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Trace lineage</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-slate-300">
              {[detail.id, ...detail.evidenceRefs.slice(0, 5)].map((ref, index) => (
                <React.Fragment key={`${detail.id}:lineage:${ref}:${index}`}>
                  {index > 0 ? <span className="text-slate-600" aria-hidden="true">-&gt;</span> : null}
                  <span className={`max-w-[12rem] truncate rounded border px-1.5 py-0.5 ${
                    index === 0
                      ? "border-cyan-700 bg-cyan-950/35 text-cyan-100"
                      : "border-slate-800 bg-black/20 text-slate-400"
                  }`}>
                    {ref}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {detail.rows.slice(0, 8).map((row) => (
            <div key={`${detail.id}:${row.label}`} className={`rounded border px-2 py-1.5 ${stagePlayTrafficRowTone(row.tone)}`}>
              <div className="text-[9px] font-semibold uppercase tracking-wide opacity-60">{row.label}</div>
              <div className="mt-0.5 break-words font-mono text-[10px]">{row.value || "n/a"}</div>
            </div>
          ))}
        </div>
      </div>
      <details className="mt-3 rounded border border-slate-800 bg-slate-950/55 p-2 text-[10px] text-slate-300">
        <summary className="cursor-pointer list-none font-semibold uppercase tracking-wide text-slate-200">
          Evidence refs ({detail.evidenceRefs.length})
        </summary>
        <div className="mt-2 max-h-28 space-y-1 overflow-auto font-mono text-[10px] text-slate-400">
          {detail.evidenceRefs.length > 0 ? detail.evidenceRefs.slice(0, 16).map((ref) => (
            <div key={`${detail.id}:${ref}`} className="truncate">{ref}</div>
          )) : (
            <div>No evidence refs attached to this payload projection.</div>
          )}
        </div>
      </details>
    </div>
  );
}

function resolveActiveWatchPolicy(input: {
  jobStates: StagePlayLiveSourceJobStateV1[];
  policies: StagePlayLiveSourceWatchJobPolicyV1[];
  sourceId?: string | null;
}): {
  activeJob: StagePlayLiveSourceJobStateV1 | null;
  activePolicy: StagePlayLiveSourceWatchJobPolicyV1 | null;
  reason: "direct_job_ref" | "source_match" | "latest_armed_policy" | "policy_without_job_state" | "no_policy";
} {
  const policiesById = new Map(input.policies.map((policy) => [policy.policyId, policy]));
  const findJobForPolicy = (policy: StagePlayLiveSourceWatchJobPolicyV1): StagePlayLiveSourceJobStateV1 | null =>
    [...input.jobStates].reverse().find((job) =>
      job.jobId === policy.jobId ||
      job.watchJobPolicyRef === policy.policyId
    ) ?? null;
  const activeJobWithPolicy = [...input.jobStates]
    .reverse()
    .find((job) =>
      (job.status === "armed" || job.status === "checking") &&
      Boolean(job.watchJobPolicyRef && policiesById.has(job.watchJobPolicyRef))
    );
  if (activeJobWithPolicy?.watchJobPolicyRef) {
    const directPolicy = policiesById.get(activeJobWithPolicy.watchJobPolicyRef) ?? null;
    if (directPolicy) {
      return {
        activeJob: activeJobWithPolicy,
        activePolicy: directPolicy,
        reason: "direct_job_ref",
      };
    }
  }

  const sourceMatchedPolicy = input.sourceId
    ? [...input.policies].reverse().find((policy) =>
      policy.status === "armed" &&
      policy.sourceIds.includes(input.sourceId as string)
    ) ?? null
    : null;
  if (sourceMatchedPolicy) {
    return {
      activeJob: findJobForPolicy(sourceMatchedPolicy),
      activePolicy: sourceMatchedPolicy,
      reason: "source_match",
    };
  }

  const latestArmedPolicy = [...input.policies].reverse().find((policy) => policy.status === "armed") ?? null;
  if (latestArmedPolicy) {
    return {
      activeJob: findJobForPolicy(latestArmedPolicy),
      activePolicy: latestArmedPolicy,
      reason: "latest_armed_policy",
    };
  }

  const latestPolicy = input.policies.at(-1) ?? null;
  if (latestPolicy) {
    return {
      activeJob: findJobForPolicy(latestPolicy),
      activePolicy: latestPolicy,
      reason: "policy_without_job_state",
    };
  }

  return {
    activeJob: null,
    activePolicy: null,
    reason: "no_policy",
  };
}

function resolveActiveInterpreterProfile(input: {
  profiles: StagePlayLiveSourceInterpreterProfileV1[];
  activeJob?: StagePlayLiveSourceJobStateV1 | null;
  activePolicy?: StagePlayLiveSourceWatchJobPolicyV1 | null;
  sourceKind?: string | null;
}): {
  activeProfile: StagePlayLiveSourceInterpreterProfileV1 | null;
  reason:
    | "direct_job_ref"
    | "direct_policy_ref"
    | "source_kind_match"
    | "unscoped_active_profile"
    | "latest_active_profile"
    | "latest_profile"
    | "no_profile";
} {
  const activeProfiles = input.profiles.filter((profile) => profile.status === "active");
  const directJobProfile = input.activeJob
    ? [...activeProfiles].reverse().find((profile) => profile.jobId === input.activeJob?.jobId) ?? null
    : null;
  if (directJobProfile) {
    return { activeProfile: directJobProfile, reason: "direct_job_ref" };
  }

  const directPolicyProfile = input.activePolicy
    ? [...activeProfiles].reverse().find((profile) => profile.policyId === input.activePolicy?.policyId) ?? null
    : null;
  if (directPolicyProfile) {
    return { activeProfile: directPolicyProfile, reason: "direct_policy_ref" };
  }

  const sourceKindProfile = input.sourceKind
    ? [...activeProfiles].reverse().find((profile) => profile.sourceKinds.includes(input.sourceKind as string)) ?? null
    : null;
  if (sourceKindProfile) {
    return { activeProfile: sourceKindProfile, reason: "source_kind_match" };
  }

  const unscopedActiveProfile =
    [...activeProfiles].reverse().find((profile) => !profile.jobId && !profile.policyId) ?? null;
  if (unscopedActiveProfile) {
    return { activeProfile: unscopedActiveProfile, reason: "unscoped_active_profile" };
  }

  const latestActiveProfile = activeProfiles.at(-1) ?? null;
  if (latestActiveProfile) {
    return { activeProfile: latestActiveProfile, reason: "latest_active_profile" };
  }

  const latestProfile = input.profiles.at(-1) ?? null;
  if (latestProfile) {
    return { activeProfile: latestProfile, reason: "latest_profile" };
  }

  return { activeProfile: null, reason: "no_profile" };
}

const MICRO_REASONER_DISPLAY: Record<StagePlayMicroReasonerRoleV1, {
  title: string;
  subtitle: string;
  missingPreview: string;
}> = {
  claim_extractor: {
    title: "Claim Extractor",
    subtitle: "summary -> claimlets",
    missingPreview: "waiting for claim extraction",
  },
  observation_classifier: {
    title: "Observed / Inferred Classifier",
    subtitle: "stable vs changed facts",
    missingPreview: "waiting for classified observations",
  },
  effort_estimator: {
    title: "Effort Estimator",
    subtitle: "facts -> current ambition",
    missingPreview: "waiting for effort estimate",
  },
  axiom_extractor: {
    title: "Axiom Extractor",
    subtitle: "effort -> constraints",
    missingPreview: "waiting for axioms",
  },
  hypothesis_generator: {
    title: "Hypothesis Generator",
    subtitle: "axioms -> scene beats",
    missingPreview: "waiting for hypotheses",
  },
  profile_comparator: {
    title: "Interpreter Profile Comparator",
    subtitle: "profile lens over facts",
    missingPreview: "waiting for profile comparison",
  },
  delta_extractor: {
    title: "Delta Extractor",
    subtitle: "prior state -> current delta",
    missingPreview: "waiting for delta extraction",
  },
  prediction_validator: {
    title: "Prediction Validator",
    subtitle: "prior prediction check",
    missingPreview: "waiting for prediction validation",
  },
  salience_scorer: {
    title: "Salience / Voice Candidate",
    subtitle: "interrupt + voice scoring",
    missingPreview: "waiting for salience score",
  },
  hypothesis_arbiter: {
    title: "Hypothesis Arbiter",
    subtitle: "council -> interrupt verdict",
    missingPreview: "waiting for arbiter verdict",
  },
  prompt_router: {
    title: "Prompt Router",
    subtitle: "summary -> Ask prompt",
    missingPreview: "waiting for prompt routing",
  },
  decision_selector: {
    title: "Decision Selector",
    subtitle: "packet -> procedural next step",
    missingPreview: "waiting for decision selection",
  },
  voice_callout_drafter: {
    title: "Voice Draft",
    subtitle: "voice candidate -> draft receipt",
    missingPreview: "waiting for voice draft",
  },
  packet_composer: {
    title: "Processed Packet",
    subtitle: "structured packet composer",
    missingPreview: "waiting for processed packet",
  },
};

const latestMicroReasonerRunForRole = (
  runs: StagePlayMicroReasonerRunV1[],
  role: StagePlayMicroReasonerRoleV1,
  mailIds: string[],
): StagePlayMicroReasonerRunV1 | null => {
  const mailIdSet = new Set(mailIds);
  return runs
    .filter((run) => run.role === role)
    .filter((run) => mailIdSet.size === 0 || run.mailIds.some((mailId) => mailIdSet.has(mailId)))
    .at(-1) ?? null;
};

const activeMicroReasonerPromptForRole = (
  prompts: StagePlayMicroReasonerPromptV1[],
  role: StagePlayMicroReasonerRoleV1,
): StagePlayMicroReasonerPromptV1 | null =>
  prompts.filter((prompt) => prompt.active && prompt.role === role).at(-1) ??
  prompts.filter((prompt) => prompt.role === role).at(-1) ??
  null;

const makeMicroReasonerNode = (input: {
  role: StagePlayMicroReasonerRoleV1;
  run: StagePlayMicroReasonerRunV1 | null;
  prompt: StagePlayMicroReasonerPromptV1 | null;
  packet: StagePlayProcessedMailPacketV1 | null;
  fallbackInputRefs: string[];
  fallbackInputPreview: string;
  fallbackOutputPreview?: string | null;
  edgeLabel: string;
  edgeTone: "connected" | "pending" | "blocked";
}): StagePlayMailLoopNode => {
  const display = MICRO_REASONER_DISPLAY[input.role];
  const modelLabel = input.run?.modelUsed ?? input.prompt?.modelPreference ?? "not run";
  const latencyLabel = input.run?.latencyMs == null ? "pending" : `${input.run.latencyMs}ms`;
  const promptLabel = input.prompt
    ? `${input.prompt.title} v${input.prompt.version}`
    : "prompt missing";
  const status = input.run?.status ?? (input.prompt ? "ready" : "missing");
  return {
    id: `observer_mail_loop:micro_reasoner:${input.role}`,
    title: display.title,
    subtitle: display.subtitle,
    status,
    preview: input.run?.outputPreview ?? input.fallbackOutputPreview ?? display.missingPreview,
    statusChips: [
      input.prompt?.modelPreference ?? null,
      input.run?.latencyMs != null ? latencyLabel : null,
    ].filter((entry): entry is string => Boolean(entry)),
    payloadRows: [
      {
        label: "Prompt used",
        value: promptLabel,
        tone: input.prompt ? "good" : "blocked",
      },
      {
        label: "Latest input",
        value: input.run?.inputPreview ?? input.fallbackInputPreview,
        tone: input.run ? "good" : "warn",
      },
      {
        label: "Latest output",
        value: input.run?.outputPreview ?? input.fallbackOutputPreview ?? "No run output yet.",
        tone: input.run ? "good" : "warn",
      },
      {
        label: "Model/tool",
        value: `${modelLabel} | ${latencyLabel}`,
      },
    ],
    edgeToNext: {
      label: input.edgeLabel,
      tone: input.edgeTone,
    },
    inputLabel: "Input",
    inputRefs: input.run?.inputRefs ?? input.fallbackInputRefs,
    inputPreview: input.run?.inputPreview ?? input.fallbackInputPreview,
    transformLabel: input.prompt
      ? `${input.prompt.title} v${input.prompt.version} -> ${input.prompt.outputSchemaName}`
      : `${display.title} prompt missing`,
    outputLabel: "Output",
    outputRefs: input.run?.outputRefs ?? (input.role === "packet_composer" && input.packet ? [input.packet.packetId] : []),
    outputPreview: input.run?.outputPreview ?? input.fallbackOutputPreview ?? display.missingPreview,
    inspector: input.prompt ? {
      kind: "micro_reasoner_prompt",
      title: input.prompt.title,
      promptId: input.prompt.promptId,
      linkedNoteId: input.prompt.linkedNoteId,
      body: [
        `Role: ${input.prompt.role}`,
        `Version: ${input.prompt.version}`,
        `Active: ${input.prompt.active}`,
        `Model preference: ${input.prompt.modelPreference}`,
        `Input schema: ${input.prompt.inputSchemaName}`,
        `Output schema: ${input.prompt.outputSchemaName}`,
        "",
        input.prompt.template,
      ].join("\n"),
    } : null,
  };
};

function buildObserverMailLoopNodes(input: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
  transcript: StagePlayLiveSourceMailTranscriptResponse | null | undefined;
}): StagePlayMailLoopNode[] {
  const { graph, mailbox, transcript } = input;
  const mailItems = mailbox?.mailItems ?? [];
  const jobStates = mailbox?.jobStates ?? [];
  const decisions = mailbox?.decisions ?? [];
  const narrativeStates = mailbox?.narrativeStates ?? [];
  const wakeRequests = mailbox?.wakeRequests ?? [];
  const wakeResults = mailbox?.wakeResults ?? [];
  const interpreterProfiles = mailbox?.interpreterProfiles ?? [];
  const interpreterProfileComparisons = mailbox?.interpreterProfileComparisons ?? [];
  const visualObserverProfiles = mailbox?.visualObserverProfiles ?? [];
  const microReasonerPrompts = mailbox?.microReasonerPrompts ?? [];
  const microReasonerRuns = mailbox?.microReasonerRuns ?? [];
  const processedMailPackets = mailbox?.processedMailPackets ?? [];
  const transcriptRows = transcript?.transcriptRows ?? transcript?.entries?.map((entry) => entry.row) ?? [];
  const steeringRows = transcriptRows.filter(isStagePlaySteeringTranscriptRow);
  const latestSteeringRow = steeringRows.at(-1) ?? null;
  const latestSteeringAck = steeringRows.filter((row) => row.rowKind === "steering_ack_receipt").at(-1) ?? null;
  const latestSteeringDecisionRow =
    steeringRows
      .filter((row) =>
        row.rowKind !== "voice_steering_received" &&
        row.rowKind !== "steering_ack_receipt"
      )
      .at(-1) ?? null;
  const latestSteeringReceived = steeringRows.filter((row) => row.rowKind === "voice_steering_received").at(-1) ?? null;
  const steeringStatusRow = latestSteeringDecisionRow ?? latestSteeringAck ?? latestSteeringReceived ?? latestSteeringRow;
  const steeringStatus = steeringStatusRow?.rowKind ?? "not_observed";
  const steeringTone =
    steeringStatus === "voice_steering_rejected" || steeringStatus === "voice_steering_cancel_requested"
      ? "blocked"
      : steeringStatus === "voice_steering_deferred" || steeringStatus === "voice_steering_queued" || steeringStatus === "voice_steering_received"
        ? "warn"
        : steeringStatus === "voice_steering_applied" || steeringStatus === "steering_ack_receipt"
          ? "good"
          : "default";
  const steeringStatusText = steeringStatusRow
    ? stagePlaySteeringRowLabel(steeringStatusRow.rowKind)
    : "No steering timeline evidence yet.";
  const steeringPreview = steeringStatusRow
    ? `${steeringStatusText}: ${compactStagePlayText(steeringStatusRow.body, steeringStatusText)}`
    : "No voice steering row has been recorded for this Stage Play mailbox.";
  const steeringEventRefs = uniqueSorted([
    ...(transcript?.transcriptEntryIds ?? []),
    ...(transcript?.evidenceRefs ?? []),
    ...steeringRows.flatMap((row) => [
      row.source.artifactId ?? "",
      ...row.evidenceRefs,
    ]),
  ].filter(Boolean));
  const mailboxThreadId = mailbox?.mailboxThreadId ?? STAGE_PLAY_PANEL_THREAD_ID;
  const requestedThreadId = mailbox?.requestedThreadId ?? STAGE_PLAY_PANEL_THREAD_ID;
  const visualMail = latestStagePlayMailItem(mailItems, (item) => item.sourceKind === "visual_frame") ?? latestStagePlayMailItem(mailItems);
  const visualSource = graph.sourceWindow.sources.find((source) =>
    source.modality === "visual_frame" && source.status === "active"
  ) ?? graph.sourceWindow.sources.find((source) => source.modality === "visual_frame") ?? null;
  const activeVisualObserverProfile = mailbox?.activeVisualObserverProfile ??
    visualObserverProfiles.find((profile) =>
      profile.status === "active" &&
      (visualSource?.sourceId ? profile.sourceIds.includes(visualSource.sourceId) : false)
    ) ??
    null;
  const latestVisualObserverProfileRef = visualMail?.evidenceRefs.find((ref) =>
    ref.startsWith("stage_play_visual_observer_profile:")
  ) ?? activeVisualObserverProfile?.profileId ?? null;
  const latestVisualPromptHashRef = visualMail?.evidenceRefs.find((ref) =>
    ref.startsWith("visual_prompt_hash:")
  ) ?? (activeVisualObserverProfile?.promptHash ? `visual_prompt_hash:${activeVisualObserverProfile.promptHash}` : null);
  const visualObserverTitle =
    activeVisualObserverProfile?.title ??
    (latestVisualObserverProfileRef ? "Profile-stamped evidence" : "Generic Visual Observer");
  const visualObserverPromptPreview =
    activeVisualObserverProfile?.prompt
      ? activeVisualObserverProfile.prompt.replace(/\s+/g, " ").trim()
      : latestVisualObserverProfileRef
        ? "Latest evidence was produced with an observer profile."
        : "Generic capture prompt is active until a source-bound shade is applied.";
  const watchPolicyResolution = resolveActiveWatchPolicy({
    jobStates,
    policies: mailbox?.watchJobPolicies ?? [],
    sourceId: visualSource?.sourceId ?? visualMail?.sourceId ?? null,
  });
  const activeJob = watchPolicyResolution.activeJob;
  const latestPolicy = watchPolicyResolution.activePolicy;
  const unreadCount = mailItems.filter((item) => item.status === "unread").length;
  const deliveredCount = mailItems.filter((item) => item.status === "delivered_to_ask").length;
  const visualBacklogCount = mailItems.filter((item) => item.sourceKind === "visual_frame" && item.status === "unread").length;
  const askWakeRequests = wakeRequests.filter(isStagePlayPacketBackedAskWakeRequest);
  const processingWakeRequests = wakeRequests.filter((wake) => !isStagePlayPacketBackedAskWakeRequest(wake));
  const retryWakeCount = askWakeRequests.filter((wake) => wake.status === "failed_retryable").length;
  const pressureWakeCount = askWakeRequests.filter((wake) => wake.status === "deferred_for_pressure").length;
  const askWakeRequestCount = askWakeRequests.filter((wake) =>
    wake.status === "queued" ||
    wake.status === "waiting_for_ui_handoff" ||
    wake.status === "running" ||
    wake.status === "failed_retryable" ||
    wake.status === "deferred_for_pressure"
  ).length;
  const queuedWakeMailCount = askWakeRequests
    .filter((wake) => wake.status === "queued" || wake.status === "waiting_for_ui_handoff")
    .reduce((total, wake) => total + wake.mailIds.length, 0);
  const runningWakeMailCount = askWakeRequests
    .filter((wake) => wake.status === "running")
    .reduce((total, wake) => total + wake.mailIds.length, 0);
  const retryWakeMailCount = askWakeRequests
    .filter((wake) => wake.status === "failed_retryable")
    .reduce((total, wake) => total + wake.mailIds.length, 0);
  const pressureWakeMailCount = askWakeRequests
    .filter((wake) => wake.status === "deferred_for_pressure")
    .reduce((total, wake) => total + wake.mailIds.length, 0);
  const wakeBacklogMailCount = queuedWakeMailCount + runningWakeMailCount + retryWakeMailCount + pressureWakeMailCount;
  const behindCount = Math.max(0, unreadCount + deliveredCount + wakeBacklogMailCount);
  const latestDecision =
    latestStagePlayMailDecision(decisions, visualMail?.mailId) ??
    latestStagePlayMailDecision(decisions, jobStates.at(-1)?.lastMailId ?? null) ??
    latestStagePlayMailDecision(decisions);
  const latestNarrativeState = latestStagePlayNarrativeStateForDecision(narrativeStates, latestDecision);
  const latestWake =
    latestStagePlayMailWakeRequest(askWakeRequests, visualMail?.mailId) ??
    latestStagePlayMailWakeRequest(askWakeRequests);
  const latestAskAttemptWakeResult =
    latestStagePlayMailWakeResult(wakeResults.filter(isStagePlayMailWakeAskAttemptResult), latestWake?.wakeRequestId ?? null) ??
    latestStagePlayMailWakeResult(wakeResults.filter(isStagePlayMailWakeAskAttemptResult));
  const latestPressureWakeResult =
    latestStagePlayMailWakeResult(wakeResults.filter(isStagePlayMailWakePressureResult), latestWake?.wakeRequestId ?? null) ??
    latestStagePlayMailWakeResult(wakeResults.filter(isStagePlayMailWakePressureResult));
  const latestWakeResult =
    latestAskAttemptWakeResult ??
    latestStagePlayMailWakeResult(wakeResults, latestWake?.wakeRequestId ?? null) ??
    latestStagePlayMailWakeResult(wakeResults);
  const wakeById = new Map(wakeRequests.map((wake) => [wake.wakeRequestId, wake]));
  const latestCompletedWakeResult =
    latestStagePlayMailWakeResult(wakeResults.filter((result) => result.status === "completed" && isStagePlayMailWakeVoiceCheckpointResult(result))) ??
    latestStagePlayMailWakeResult(wakeResults.filter((result) => result.status === "completed" && isStagePlayMailWakeAskAttemptResult(result)));
  const latestCompletedWake = latestCompletedWakeResult
    ? wakeById.get(latestCompletedWakeResult.wakeRequestId) ?? null
    : askWakeRequests.filter((wake) => wake.status === "completed").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ?? null;
  const pendingWakeRequests = askWakeRequests.filter((wake) =>
    wake.status === "queued" ||
    wake.status === "waiting_for_ui_handoff" ||
    wake.status === "running" ||
    wake.status === "failed_retryable" ||
    wake.status === "deferred_for_pressure"
  );
  const latestPendingWake =
    pendingWakeRequests.filter((wake) => wake.lifecycleStage === "voice_pending").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    pendingWakeRequests.filter((wake) => wake.status === "deferred_for_pressure").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    pendingWakeRequests.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    null;
  const latestPendingWakeResult = latestPendingWake
    ? latestStagePlayMailWakeResult(wakeResults, latestPendingWake.wakeRequestId)
    : null;
  const displayWake = latestWakeResult
    ? wakeById.get(latestWakeResult.wakeRequestId) ?? latestWake
    : latestWake;
  const pressureIsSecondary =
    Boolean(latestPressureWakeResult) &&
    latestPressureWakeResult?.wakeResultId !== latestWakeResult?.wakeResultId;
  const latestWakeStatus = latestWakeResult?.status ?? displayWake?.status ?? null;
  const latestWakeFailureReason = latestWakeResult?.failedReason ?? displayWake?.failureReason ?? null;
  const latestWakeAskTurnId = latestWakeResult?.askTurnId ?? displayWake?.askTurnId ?? null;
  const latestWakeDecisionIds = latestWakeResult?.decisionIds ?? displayWake?.decisionIds ?? [];
  const latestWakeLifecycleStage = latestWakeResult?.lifecycleStage ?? displayWake?.lifecycleStage ?? null;
  const latestWakeLifecycleReason = latestWakeResult?.lifecycleReason ?? displayWake?.lifecycleReason ?? null;
  const completedWakeAskTurnId = latestCompletedWakeResult?.askTurnId ?? latestCompletedWake?.askTurnId ?? null;
  const completedWakeDecisionIds = latestCompletedWakeResult?.decisionIds ?? latestCompletedWake?.decisionIds ?? [];
  const completedWakeVoiceRefs = uniqueSorted([
    ...(latestCompletedWakeResult?.evidenceRefs ?? []),
    ...(latestCompletedWake?.evidenceRefs ?? []),
  ].filter((ref) => /(?:live_source_interim_voice_callout_receipt|helix_interim_voice_callout_receipt|voice_hold_receipt|voice_block_receipt|voice_receipt|stage_play_live_source_voice_delivery_receipt)/i.test(ref)));
  const pendingWakeStatus = latestPendingWakeResult?.status ?? latestPendingWake?.status ?? null;
  const pendingWakeFailureReason = latestPendingWakeResult?.failedReason ?? latestPendingWake?.failureReason ?? null;
  const pendingWakeLifecycleStage = latestPendingWakeResult?.lifecycleStage ?? latestPendingWake?.lifecycleStage ?? null;
  const pendingWakeLifecycleReason = latestPendingWakeResult?.lifecycleReason ?? latestPendingWake?.lifecycleReason ?? null;
  const hasWatchPolicy = Boolean(latestPolicy);
  const manualCheckpointWithoutPolicy = Boolean(
    latestDecision &&
    latestDecision.nextLoopState === "armed_for_next_summary" &&
    !hasWatchPolicy
  );
  const interpreterProfileResolution = resolveActiveInterpreterProfile({
    profiles: interpreterProfiles,
    activeJob,
    activePolicy: latestPolicy,
    sourceKind: visualMail?.sourceKind ?? visualSource?.modality ?? null,
  });
  const activeInterpreterProfile = interpreterProfileResolution.activeProfile;
  const latestProfileComparison =
    interpreterProfileComparisons
      .filter((comparison) =>
        (latestDecision?.profileComparisonRefs ?? []).includes(comparison.comparisonId) ||
        (visualMail?.mailId ? comparison.mailIds.includes(visualMail.mailId) : false) ||
        (latestNarrativeState?.narrativeStateId ? comparison.narrativeStateRef === latestNarrativeState.narrativeStateId : false)
      )
      .at(-1) ??
    interpreterProfileComparisons.at(-1) ??
    null;
  const latestProcessedPacket =
    processedMailPackets
      .filter((packet) =>
        visualMail?.mailId ? packet.mailIds.includes(visualMail.mailId) : true
      )
      .at(-1) ??
    processedMailPackets.at(-1) ??
    null;
  const processedPacketMailIds = latestProcessedPacket?.mailIds ?? (visualMail?.mailId ? [visualMail.mailId] : []);
  const microRun = (role: StagePlayMicroReasonerRoleV1) =>
    latestMicroReasonerRunForRole(microReasonerRuns, role, processedPacketMailIds);
  const microPrompt = (role: StagePlayMicroReasonerRoleV1) =>
    activeMicroReasonerPromptForRole(microReasonerPrompts, role);
  const observerOutputRefs = uniqueSorted([
    mailboxThreadId,
    visualSource?.sourceId ?? "",
    activeJob?.jobId ?? "",
    visualMail?.mailId ?? "",
  ].filter(Boolean));
  const mailInputRefs = uniqueSorted([
    visualMail?.sourceRefs.frameRef ?? "",
    visualMail?.sourceRefs.evidenceRef ?? "",
    visualMail?.sourceRefs.observationRef ?? "",
  ].filter(Boolean));
  const decisionInputRefs = uniqueSorted([
    ...(latestDecision?.mailIds ?? (visualMail?.mailId ? [visualMail.mailId] : [])),
  ]);
  const wakeInputRefs = uniqueSorted([
    ...(displayWake?.mailIds ?? (visualMail?.mailId ? [visualMail.mailId] : [])),
  ]);
  const profileInputRefs = uniqueSorted([
    activeInterpreterProfile?.policyId ?? "",
    activeInterpreterProfile?.jobId ?? activeJob?.jobId ?? "",
  ].filter(Boolean));
  const comparisonInputRefs = uniqueSorted([
    activeInterpreterProfile?.profileId ?? "",
    visualMail?.mailId ?? "",
    latestNarrativeState?.narrativeStateId ?? "",
  ].filter(Boolean));
  const queuedRunningText = `queued ${queuedWakeMailCount} / running ${runningWakeMailCount}`;
  const latestWakeAskText = latestWakeAskTurnId ? `latest ask ${latestWakeAskTurnId}` : "no Ask turn yet";
  const pressureText = latestWakeStatus === "deferred_for_pressure"
    ? `deferred for pressure; ${unreadCount} unread retained`
    : null;
  const secondaryPressureText = pressureIsSecondary
    ? `auto pressure retained ${unreadCount} unread`
    : null;
  const deferredWakeIds = uniqueSorted([
    ...(mailbox?.wakeAdmissionCycle?.deferredWakeIds ?? []),
    ...wakeRequests
      .filter((wake) => wake.status === "deferred_for_pressure")
      .map((wake) => wake.wakeRequestId),
  ]);
  const pressureDisplayWake = displayWake?.status === "deferred_for_pressure"
    ? displayWake
    : wakeRequests.filter((wake) => wake.status === "deferred_for_pressure").at(-1) ?? null;
  const pressureNextRetryAt = pressureDisplayWake?.nextRetryAt ?? null;
  const runtimePressureReason =
    mailbox?.wakeAdmissionCycle?.runtimeAdmission?.reason ??
    latestWakeFailureReason ??
    pressureDisplayWake?.failureReason ??
    null;
  const runtimePressureLevel = mailbox?.wakeAdmissionCycle?.runtimeAdmission?.pressureLevel ?? null;
  const runtimeAdmission = mailbox?.wakeAdmissionCycle?.runtimeAdmission ?? null;
  const runtimeMemoryText = runtimeAdmission?.memory && runtimeAdmission?.limits
    ? `Memory: heap ${runtimeAdmission.memory.heapUsedMiB ?? "?"}/${runtimeAdmission.limits.maxHeapUsedMiB ?? "?"} MiB; rss ${runtimeAdmission.memory.rssMiB ?? "?"}/${runtimeAdmission.limits.maxRssMiB ?? "?"} MiB`
    : null;
  const localBypassText = runtimeAdmission?.localBypass?.applied
    ? `Local interrupt bypass: ${runtimeAdmission.localBypass.reason}`
    : null;
  const continuation = mailbox?.wakeAdmissionCycle?.continuation ?? null;
  const continuationRunnableWakeIds = continuation?.runnableWakeIds ?? [];
  const continuationRetainedMailCount = continuationRunnableWakeIds
    .map((wakeId) => wakeById.get(wakeId))
    .filter((wake): wake is StagePlayLiveSourceMailWakeRequestV1 => Boolean(wake))
    .reduce((total, wake) => total + wake.mailIds.length, 0);
  const continuationReason = continuation?.reason ?? null;
  const continuationStateText = continuation
    ? continuation.scheduled
      ? `scheduled (${labelize(continuationReason ?? "runnable_wake_remaining")})`
        : continuationReason === "manual_cycle_no_auto_continuation"
          ? "manual cycle no auto continuation"
        : continuationReason === "wake_runner_disabled"
          ? "deferred; interrupt runner disabled"
          : continuationReason === "no_runnable_wake_remaining"
            ? "armed for next summary"
            : labelize(continuationReason ?? "deferred")
    : latestPolicy
      ? "armed for next summary"
      : "no watch policy";
  const pressureContinuationText = continuation
    ? continuation.scheduled
      ? `Auto continuation: scheduled (${labelize(continuation.reason ?? "runnable_wake_remaining")})`
      : `Auto continuation: waiting for pressure release (${labelize(continuation.reason ?? "runtime_pressure")})`
    : "Auto continuation: waiting for pressure release";
  const wakePressureActive = latestWakeStatus === "deferred_for_pressure" || pressureWakeCount > 0 || deferredWakeIds.length > 0;
  const wakePressureBand = wakePressureActive
    ? {
        title: "Interrupt admission",
        lines: [
          "Deferred before Ask interrupt",
          `${visualBacklogCount} raw visual backlog retained`,
          pressureNextRetryAt ? `Next retry: ${formatStagePlayClock(pressureNextRetryAt)}` : null,
          runtimePressureLevel ? `Pressure: ${labelize(runtimePressureLevel)}` : null,
          runtimePressureReason ? `Reason: ${labelize(runtimePressureReason)}` : null,
          pressureContinuationText,
          runtimeMemoryText,
          localBypassText,
        ].filter((line): line is string => Boolean(line)),
        tone: "pressure" as const,
      }
    : null;
  const wakeContinuationActive =
    Boolean(latestPolicy) &&
    !wakePressureActive &&
    Boolean(
      continuation ||
      latestWakeStatus === "completed" ||
      latestDecision?.nextLoopState === "armed_for_next_summary" ||
      activeJob?.nextLoopState === "armed_for_next_summary",
    );
  const wakeContinuationBand = wakeContinuationActive
    ? {
        title: "Continuation",
        lines: [
          latestWakeStatus === "completed" ? "Batch completed." : latestDecision ? "Manual checkpoint completed." : "Watch job active.",
          `Continuation: ${continuationStateText}`,
          `Loop state: ${latestDecision?.nextLoopState ?? activeJob?.nextLoopState ?? "armed_for_next_summary"}`,
          continuationRetainedMailCount > 0
            ? `Unread retained: ${continuationRetainedMailCount}`
            : unreadCount > 0
              ? `Unread retained: ${unreadCount}`
              : null,
          continuationRunnableWakeIds.length > 0 ? `Runnable interrupts: ${continuationRunnableWakeIds.length}` : null,
        ].filter((line): line is string => Boolean(line)),
        tone: continuation?.scheduled ? "good" as const : "pending" as const,
      }
    : null;
  const latestDecisionText = latestDecision
    ? `${latestDecision.decision}: ${latestDecision.rationalePreview || latestDecision.decisionId}`
    : "no decision yet";
  const outputPreview = manualCheckpointWithoutPolicy
    ? latestNarrativeState
      ? `manual interpretation checkpoint: ${latestNarrativeState.interpretedSituation.userRelevantMeaning || latestNarrativeState.currentSceneSummary}`
      : "manual checkpoint complete; configure a watch job to continue automatically"
    : latestDecision?.voiceCalloutDraft?.text
    ? `voice draft: ${latestDecision.voiceCalloutDraft.text}`
    : latestDecision?.textAnswerDraft?.text
      ? `text answer: ${latestDecision.textAnswerDraft.text}`
      : latestNarrativeState
        ? `interpretation: ${latestNarrativeState.interpretedSituation.userRelevantMeaning || latestNarrativeState.currentSceneSummary}`
      : latestDecision?.decision === "wait_for_next_summary"
        ? "no output yet; armed for next source update"
        : latestDecision?.requestedTool?.toolName
          ? `requested tool: ${latestDecision.requestedTool.toolName}`
          : "no output yet";
  return [
    {
      id: "observer_mail_loop:observer",
      title: "Visual Source",
      subtitle: "source registry",
      status: visualSource?.status ?? "waiting",
      preview: visualSource
        ? `source ${visualSource.status}: ${visualSource.sourceId}`
        : "visual source not active",
      statusChips: [
        graph.sourceWindow.freshness,
        visualBacklogCount > 0 ? `${visualBacklogCount} visual backlog` : "visual backlog clear",
      ].filter((entry): entry is string => Boolean(entry)),
      payloadRows: [
        {
          label: "Source",
          value: `${visualSource?.sourceId ?? visualMail?.sourceId ?? "visual source pending"} | ${visualSource?.status ?? "unknown"} | ${graph.sourceWindow.freshness}`,
          tone: graph.sourceWindow.freshness === "fresh" ? "good" : "warn",
        },
        {
          label: "Objective",
          value: latestPolicy?.objectiveText ??
            (manualCheckpointWithoutPolicy
              ? "Manual checkpoint only. Configure a watch job to keep interpreting new mail."
              : activeJob?.objective ?? visualMail?.objective?.text ?? "No watch objective armed yet."),
          tone: latestPolicy ? "good" : "warn",
        },
        {
          label: "Mailbox",
          value: mailboxThreadId,
          tone: mailboxThreadId === STAGE_PLAY_PANEL_THREAD_ID ? "good" : "warn",
        },
        {
          label: "Processing",
          value: latestPolicy
            ? `${latestPolicy.interpretationMode ?? "latest_scene_answer"} | ${latestPolicy.mailProcessingMode ?? "latest_only"} | ${latestPolicy.outputCadence ?? "every_batch"}`
            : "No processing policy yet.",
          tone: latestPolicy ? "good" : "warn",
        },
      ],
      edgeToNext: {
        label: activeVisualObserverProfile ? "observer prompt" : visualSource ? "generic observer" : "source missing",
        tone: visualSource ? (activeVisualObserverProfile || latestVisualObserverProfileRef ? "connected" : "pending") : "blocked",
      },
      inputLabel: "Input",
      inputRefs: ["source registry"],
      inputPreview: "source registry",
      transformLabel: `source registry -> live-source mailbox (${mailboxThreadId})`,
      outputLabel: "Output",
      outputRefs: observerOutputRefs,
      outputPreview: `${visualSource?.sourceId ?? "visual_source missing"} ${visualSource?.status ?? "unknown"} | mailbox ${mailboxThreadId} | visual backlog ${visualBacklogCount} | delivered ${deliveredCount}`,
    },
    {
      id: "observer_mail_loop:observer_shades",
      title: "Observer Shades",
      subtitle: "visual model prompt lens",
      status: activeVisualObserverProfile || latestVisualObserverProfileRef ? "active" : "generic",
      preview: `${visualObserverTitle}; ${latestVisualPromptHashRef ?? "no prompt hash yet"}`,
      statusChips: [
        activeVisualObserverProfile?.domain ?? "generic",
        activeVisualObserverProfile?.outputMode ?? "prose",
      ].filter((entry): entry is string => Boolean(entry)),
      payloadRows: [
        {
          label: "Profile",
          value: visualObserverTitle,
          tone: activeVisualObserverProfile || latestVisualObserverProfileRef ? "good" : "warn",
        },
        {
          label: "Output",
          value: activeVisualObserverProfile?.outputMode ?? "generic prose fallback",
        },
        {
          label: "Prompt",
          value: visualObserverPromptPreview,
          tone: activeVisualObserverProfile ? "good" : "warn",
        },
        {
          label: "Hash",
          value: latestVisualPromptHashRef ?? "No visual prompt hash stamped yet.",
          tone: latestVisualPromptHashRef ? "good" : "warn",
        },
      ],
      edgeToNext: {
        label: visualMail ? "profiled mail" : visualSource ? "waiting for evidence" : "source missing",
        tone: visualMail ? "connected" : visualSource ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: uniqueSorted([visualSource?.sourceId ?? "", activeVisualObserverProfile?.profileId ?? ""].filter(Boolean)),
      inputPreview: visualSource?.sourceId ?? "visual source missing",
      transformLabel: activeVisualObserverProfile
        ? `${activeVisualObserverProfile.title} -> visual-frame/analyze`
        : "generic visual capture prompt -> visual-frame/analyze",
      outputLabel: "Output",
      outputRefs: uniqueSorted([
        latestVisualObserverProfileRef ?? "",
        latestVisualPromptHashRef ?? "",
        visualMail?.sourceRefs.evidenceRef ?? "",
      ].filter(Boolean)),
      outputPreview: visualMail?.summary.preview ?? "No latest visual evidence yet.",
      inspector: activeVisualObserverProfile ? {
        kind: "visual_observer_profile",
        title: activeVisualObserverProfile.title,
        profileId: activeVisualObserverProfile.profileId,
        linkedNoteId: activeVisualObserverProfile.linkedNoteId,
        body: [
          `Domain: ${activeVisualObserverProfile.domain}`,
          `Output: ${activeVisualObserverProfile.outputMode}`,
          `Prompt hash: ${activeVisualObserverProfile.promptHash}`,
          `Sources: ${activeVisualObserverProfile.sourceIds.join(", ") || "not source-bound"}`,
          "",
          activeVisualObserverProfile.prompt,
        ].join("\n"),
      } : null,
    },
    {
      id: "observer_mail_loop:visual_mail",
      title: "Visual Backlog",
      subtitle: "raw observer mail, not Ask queue",
      status: visualMail?.status ?? "missing",
      preview: visualMail
        ? `${visualBacklogCount} visual backlog; latest ${visualMail.summary.preview}`
        : "no compact mail yet",
      statusChips: [
        visualBacklogCount > 0 ? `${visualBacklogCount} observer backlog` : "observer backlog clear",
        processingWakeRequests.length > 0 ? `${processingWakeRequests.length} processing trigger(s)` : null,
        askWakeRequestCount > 0 ? `${askWakeRequestCount} packet interrupt handoff(s)` : "no packet interrupt handoff",
      ].filter((entry): entry is string => Boolean(entry)),
      payloadRows: [
        {
          label: "Latest",
          value: visualMail?.summary.preview ?? "No compact summary yet.",
          tone: visualMail ? "good" : "warn",
        },
        {
          label: "Observer backlog",
          value: `${visualBacklogCount} raw visual unread | ${deliveredCount} delivered to Ask/read path`,
          tone: visualBacklogCount > 0 ? "warn" : "default",
        },
        {
          label: "Packet interrupt handoff",
          value: `${queuedWakeMailCount} queued packet mail | ${runningWakeMailCount} running | ${retryWakeMailCount} retry | ${pressureWakeMailCount} pressure-deferred`,
          tone: askWakeRequestCount > 0 ? "warn" : "default",
        },
        {
          label: "Namespace",
          value: `requested ${requestedThreadId} -> mailbox ${mailboxThreadId}`,
          tone: mailboxThreadId === STAGE_PLAY_PANEL_THREAD_ID ? "good" : "warn",
        },
      ],
      edgeToNext: {
        label: activeInterpreterProfile ? "profile lens" : latestPolicy ? "watch policy" : "no policy",
        tone: activeInterpreterProfile ? "connected" : latestPolicy ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: mailInputRefs,
      inputPreview: mailInputRefs.length > 0
        ? `${mailInputRefs.slice(0, 2).join(", ")} | mailbox ${mailboxThreadId}`
        : `visual_frame / visual_evidence pending | mailbox ${mailboxThreadId}`,
      transformLabel: "visual summary enqueue -> mailbox item",
      outputLabel: "Output",
      outputRefs: visualMail ? [visualMail.mailId, ...visualMail.evidenceRefs] : [],
      outputPreview: visualMail
        ? `summary preview: ${visualMail.summary.preview}; status ${visualMail.status}`
        : "summary preview: none yet; status missing",
    },
    makeMicroReasonerNode({
      role: "claim_extractor",
      run: microRun("claim_extractor"),
      prompt: microPrompt("claim_extractor"),
      packet: latestProcessedPacket,
      fallbackInputRefs: visualMail ? [visualMail.mailId, ...visualMail.evidenceRefs] : [],
      fallbackInputPreview: visualMail?.summary.preview ?? "compact visual-summary mail pending",
      fallbackOutputPreview: latestProcessedPacket?.observedFacts.slice(0, 3).join(" | ") ?? null,
      edgeLabel: microRun("observation_classifier") ? "classified" : "needs classifier",
      edgeTone: microRun("observation_classifier") ? "connected" : visualMail ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "observation_classifier",
      run: microRun("observation_classifier"),
      prompt: microPrompt("observation_classifier"),
      packet: latestProcessedPacket,
      fallbackInputRefs: microRun("claim_extractor")?.outputRefs ?? [],
      fallbackInputPreview: microRun("claim_extractor")?.outputPreview ?? "claimlets pending",
      fallbackOutputPreview: latestProcessedPacket
        ? `stable ${latestProcessedPacket.stableFactsUsed.slice(0, 2).join(" | ") || "none"}; changed ${latestProcessedPacket.changedFacts.slice(0, 2).join(" | ") || "none"}`
        : null,
      edgeLabel: activeInterpreterProfile ? "profile lens" : "profile optional",
      edgeTone: activeInterpreterProfile ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "effort_estimator",
      run: microRun("effort_estimator"),
      prompt: microPrompt("effort_estimator"),
      packet: latestProcessedPacket,
      fallbackInputRefs: microRun("observation_classifier")?.outputRefs ?? [],
      fallbackInputPreview: microRun("observation_classifier")?.outputPreview ?? "classified observations pending",
      fallbackOutputPreview: latestProcessedPacket?.effortEstimate
        ? `${latestProcessedPacket.effortEstimate.currentEffort}; confidence ${latestProcessedPacket.effortEstimate.confidence.toFixed(2)}`
        : null,
      edgeLabel: microRun("axiom_extractor") ? "axioms" : "needs axioms",
      edgeTone: microRun("axiom_extractor") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "axiom_extractor",
      run: microRun("axiom_extractor"),
      prompt: microPrompt("axiom_extractor"),
      packet: latestProcessedPacket,
      fallbackInputRefs: microRun("effort_estimator")?.outputRefs ?? [],
      fallbackInputPreview: microRun("effort_estimator")?.outputPreview ?? "effort estimate pending",
      fallbackOutputPreview: latestProcessedPacket?.axioms
        ? `${latestProcessedPacket.axioms.axioms.slice(0, 3).join(" | ") || "no axioms"}; missing ${latestProcessedPacket.axioms.missingAxioms.slice(0, 2).join(" | ") || "none"}`
        : null,
      edgeLabel: microRun("hypothesis_generator") ? "hypotheses" : "needs hypotheses",
      edgeTone: microRun("hypothesis_generator") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "hypothesis_generator",
      run: microRun("hypothesis_generator"),
      prompt: microPrompt("hypothesis_generator"),
      packet: latestProcessedPacket,
      fallbackInputRefs: microRun("axiom_extractor")?.outputRefs ?? [],
      fallbackInputPreview: microRun("axiom_extractor")?.outputPreview ?? "axioms pending",
      fallbackOutputPreview: latestProcessedPacket?.hypotheses
        ? latestProcessedPacket.hypotheses.slice(0, 3).map((hypothesis) => `${hypothesis.label}:${hypothesis.confidence.toFixed(2)}`).join(" | ")
        : null,
      edgeLabel: activeInterpreterProfile ? "profile lens" : "profile optional",
      edgeTone: activeInterpreterProfile ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    {
      id: "observer_mail_loop:interpreter_profile",
      title: "Interpreter Profile",
      subtitle: "interpretation contract",
      status: activeInterpreterProfile?.status ?? "missing",
      preview: activeInterpreterProfile
        ? `${activeInterpreterProfile.title} | Domain: ${activeInterpreterProfile.domain} | Voice: ${activeInterpreterProfile.outputStyle.voiceStyle}`
        : "no active interpreter profile",
      statusChips: activeInterpreterProfile
        ? [
            activeInterpreterProfile.domain,
            activeInterpreterProfile.outputStyle.voiceStyle,
            interpreterProfileResolution.reason,
          ]
        : [hasWatchPolicy ? "watch policy only" : "policy missing"],
      payloadRows: [
        {
          label: "Contract",
          value: activeInterpreterProfile?.title ??
            latestPolicy?.objectiveText ??
            "No active interpreter profile or watch policy.",
          tone: activeInterpreterProfile ? "good" : latestPolicy ? "warn" : "blocked",
        },
        {
          label: "Watch",
          value: activeInterpreterProfile?.salienceCriteria.slice(0, 3).join(", ") || latestPolicy?.importanceCriteria.slice(0, 3).join(", ") || "criteria pending",
          tone: activeInterpreterProfile || latestPolicy ? "good" : "warn",
        },
        {
          label: "Suppress",
          value: activeInterpreterProfile?.suppressCriteria.slice(0, 2).join(", ") || latestPolicy?.suppressCriteria.slice(0, 2).join(", ") || "none",
        },
        {
          label: "Policy resolution",
          value: watchPolicyResolution.reason,
          tone: latestPolicy ? "good" : "blocked",
        },
        {
          label: "Mode",
          value: latestPolicy
            ? `${latestPolicy.interpretationMode ?? "latest_scene_answer"} / ${latestPolicy.mailProcessingMode ?? "latest_only"} / ${latestPolicy.outputCadence ?? "every_batch"}`
            : "no active watch policy",
          tone: latestPolicy ? "good" : "blocked",
        },
        {
          label: "Profile resolution",
          value: interpreterProfileResolution.reason,
          tone: activeInterpreterProfile ? "good" : "blocked",
        },
      ],
      edgeToNext: {
        label: latestProfileComparison ? "comparison" : activeInterpreterProfile ? "needs comparison" : "profile missing",
        tone: latestProfileComparison ? "connected" : activeInterpreterProfile ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: profileInputRefs,
      inputPreview: profileInputRefs.length > 0 ? profileInputRefs.join(", ") : "watch job / policy",
      transformLabel: `profile contract -> comparison lens; policy resolution: ${watchPolicyResolution.reason}`,
      outputLabel: "Output",
      outputRefs: activeInterpreterProfile ? [activeInterpreterProfile.profileId, ...activeInterpreterProfile.evidenceRefs] : [],
      outputPreview: activeInterpreterProfile
        ? [
            activeInterpreterProfile.title,
            "Active",
            `Domain: ${activeInterpreterProfile.domain}`,
            `Voice: ${activeInterpreterProfile.outputStyle.voiceStyle}`,
            `Suppressed: ${activeInterpreterProfile.suppressCriteria.slice(0, 2).join(", ") || "none"}`,
            `Watch: ${activeInterpreterProfile.salienceCriteria.slice(0, 3).join(", ") || "profile criteria"}`,
          ].join(" | ")
        : "Use watch policy only.",
      inspector: activeInterpreterProfile ? {
        kind: "interpreter_profile",
        title: activeInterpreterProfile.title,
        profileId: activeInterpreterProfile.profileId,
        linkedNoteId: activeInterpreterProfile.linkedNoteId,
        linkedNoteTitle: activeInterpreterProfile.linkedNoteTitle,
        body: [
          `Status: ${activeInterpreterProfile.status}`,
          `Domain: ${activeInterpreterProfile.domain}`,
          `Voice: ${activeInterpreterProfile.outputStyle.voiceStyle}`,
          `Guidelines: ${activeInterpreterProfile.interpretationGuidelines}`,
          `Salience: ${activeInterpreterProfile.salienceCriteria.join(", ") || "none"}`,
          `Suppress: ${activeInterpreterProfile.suppressCriteria.join(", ") || "none"}`,
          `Risk: ${activeInterpreterProfile.riskCriteria.join(", ") || "none"}`,
          `Opportunity: ${activeInterpreterProfile.opportunityCriteria.join(", ") || "none"}`,
        ].join("\n"),
      } : null,
    },
    {
      id: "observer_mail_loop:profile_comparison",
      title: "Interpreter Profile Comparator",
      subtitle: "profile lens over mail",
      status: latestProfileComparison?.recommendedDecision ?? "pending",
      preview: latestProfileComparison
        ? `Matched: ${latestProfileComparison.matchedCriteria.slice(0, 2).join(", ") || "none"}; Recommended: ${latestProfileComparison.recommendedDecision}`
        : activeInterpreterProfile
          ? "waiting for comparison receipt"
          : "no profile comparison",
      statusChips: latestProfileComparison
        ? [
            latestProfileComparison.matchedCriteria.length ? `${latestProfileComparison.matchedCriteria.length} matched` : "no matches",
            latestProfileComparison.suppressedCriteria.length ? `${latestProfileComparison.suppressedCriteria.length} suppressed` : null,
          ].filter((entry): entry is string => Boolean(entry))
        : ["evidence only"],
      payloadRows: [
        {
          label: "Prompt used",
          value: microPrompt("profile_comparator")
            ? `${microPrompt("profile_comparator")?.title} v${microPrompt("profile_comparator")?.version}`
            : "prompt missing",
          tone: microPrompt("profile_comparator") ? "good" : "blocked",
        },
        {
          label: "Observed",
          value: microRun("profile_comparator")?.inputPreview ||
            latestProfileComparison?.observedFacts.slice(0, 2).join("; ") ||
            visualMail?.summary.preview ||
            "No comparison input yet.",
          tone: latestProfileComparison ? "good" : visualMail ? "warn" : "blocked",
        },
        {
          label: "Latest output",
          value: microRun("profile_comparator")?.outputPreview ||
            latestProfileComparison?.matchedCriteria.join(", ") ||
            "none",
        },
        {
          label: "Model/tool",
          value: `${microRun("profile_comparator")?.modelUsed ?? microPrompt("profile_comparator")?.modelPreference ?? "not run"} | ${
            microRun("profile_comparator")?.latencyMs == null ? "pending" : `${microRun("profile_comparator")?.latencyMs}ms`
          } | ${latestProfileComparison?.recommendedDecision ?? "pending"}`,
          tone: latestProfileComparison ? "good" : "warn",
        },
      ],
      edgeToNext: {
        label: displayWake ? "interrupt queued" : visualMail ? "needs interrupt" : "mail missing",
        tone: displayWake ? "connected" : visualMail ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: comparisonInputRefs,
      inputPreview: comparisonInputRefs.length > 0 ? comparisonInputRefs.join(", ") : "mail + profile + narrative",
      transformLabel: "profile + mail + narrative -> comparison receipt",
      outputLabel: "Output",
      outputRefs: latestProfileComparison ? [latestProfileComparison.comparisonId, ...latestProfileComparison.evidenceRefs] : [],
      outputPreview: latestProfileComparison
        ? [
            `Matched: ${latestProfileComparison.matchedCriteria.join(", ") || "none"}.`,
            `Suppressed: ${latestProfileComparison.suppressedCriteria.join(", ") || "none"}.`,
            `Recommended: ${latestProfileComparison.recommendedDecision}.`,
          ].join(" ")
        : "No profile comparison receipt yet.",
    },
    makeMicroReasonerNode({
      role: "delta_extractor",
      run: microRun("delta_extractor"),
      prompt: microPrompt("delta_extractor"),
      packet: latestProcessedPacket,
      fallbackInputRefs: uniqueSorted([
        latestNarrativeState?.narrativeStateId ?? "",
        ...(visualMail ? [visualMail.mailId] : []),
      ].filter(Boolean)),
      fallbackInputPreview: latestNarrativeState?.runningStorySummary ?? visualMail?.summary.preview ?? "prior state + mail pending",
      fallbackOutputPreview: latestProcessedPacket?.changedFacts.join(" | ") ?? null,
      edgeLabel: microRun("prediction_validator") ? "prediction checked" : "needs prediction check",
      edgeTone: microRun("prediction_validator") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "prediction_validator",
      run: microRun("prediction_validator"),
      prompt: microPrompt("prediction_validator"),
      packet: latestProcessedPacket,
      fallbackInputRefs: uniqueSorted([
        latestProcessedPacket?.priorPredictionRef ?? "",
        ...(latestProcessedPacket?.mailIds ?? []),
      ].filter(Boolean)),
      fallbackInputPreview: latestProcessedPacket?.priorPredictionRef ?? "prior prediction pending",
      fallbackOutputPreview: latestProcessedPacket?.predictionValidation
        ? `${latestProcessedPacket.predictionValidation.result}; new ${latestProcessedPacket.predictionValidation.newSignals.join(", ") || "none"}`
        : null,
      edgeLabel: microRun("salience_scorer") ? "salience scored" : "needs salience",
      edgeTone: microRun("salience_scorer") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "salience_scorer",
      run: microRun("salience_scorer"),
      prompt: microPrompt("salience_scorer"),
      packet: latestProcessedPacket,
      fallbackInputRefs: latestProcessedPacket ? [
        ...latestProcessedPacket.changedFacts,
        ...latestProcessedPacket.riskMatches,
        ...latestProcessedPacket.voiceCalloutMatches,
      ] : [],
      fallbackInputPreview: latestProcessedPacket
        ? `changed ${latestProcessedPacket.changedFacts.length}; voice matches ${latestProcessedPacket.voiceCalloutMatches.length}`
        : "salience inputs pending",
      fallbackOutputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.salience.level}; voice ${latestProcessedPacket.salience.voiceCandidate ? "candidate" : "no"}; recommended ${latestProcessedPacket.recommendedNext}`
        : null,
      edgeLabel: microRun("hypothesis_arbiter") ? "arbiter verdict" : "needs arbiter",
      edgeTone: microRun("hypothesis_arbiter") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "hypothesis_arbiter",
      run: microRun("hypothesis_arbiter"),
      prompt: microPrompt("hypothesis_arbiter"),
      packet: latestProcessedPacket,
      fallbackInputRefs: latestProcessedPacket ? [
        latestProcessedPacket.packetId,
        ...(latestProcessedPacket.hypotheses ?? []).map((hypothesis) => hypothesis.label),
        ...(latestProcessedPacket.microReasonerRunRefs ?? []),
      ] : [],
      fallbackInputPreview: latestProcessedPacket
        ? `effort ${latestProcessedPacket.effortEstimate?.currentEffort ?? "unknown"}; hypotheses ${latestProcessedPacket.hypotheses?.length ?? 0}; salience ${latestProcessedPacket.salience.level}`
        : "arbiter inputs pending",
      fallbackOutputPreview: latestProcessedPacket?.arbiter
        ? `${latestProcessedPacket.arbiter.recommendedNext}; wake ${latestProcessedPacket.arbiter.wakeAsk ? "yes" : "no"}; ${latestProcessedPacket.arbiter.reason}`
        : null,
      edgeLabel: microRun("decision_selector") ? "decision selected" : "needs decision",
      edgeTone: microRun("decision_selector") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "decision_selector",
      run: microRun("decision_selector"),
      prompt: microPrompt("decision_selector"),
      packet: latestProcessedPacket,
      fallbackInputRefs: latestProcessedPacket ? [
        latestProcessedPacket.packetId,
        ...latestProcessedPacket.microReasonerRunRefs,
      ] : [],
      fallbackInputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.recommendedNext}; ${latestProcessedPacket.salience.level}`
        : "processed packet pending",
      fallbackOutputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.recommendedNext}; next ${latestProcessedPacket.recommendedNext === "wait_for_next_summary" ? "none" : "record decision"}`
        : null,
      edgeLabel: latestProcessedPacket?.recommendedNext === "request_voice_callout"
        ? microRun("voice_callout_drafter") ? "voice draft" : "needs voice draft"
        : microRun("packet_composer") ? "packet ready" : "needs packet",
      edgeTone: latestProcessedPacket?.recommendedNext === "request_voice_callout"
        ? microRun("voice_callout_drafter") ? "connected" : latestProcessedPacket ? "pending" : "blocked"
        : microRun("packet_composer") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "voice_callout_drafter",
      run: microRun("voice_callout_drafter"),
      prompt: microPrompt("voice_callout_drafter"),
      packet: latestProcessedPacket,
      fallbackInputRefs: latestProcessedPacket ? [
        latestProcessedPacket.packetId,
        ...latestProcessedPacket.salience.reasons,
      ] : [],
      fallbackInputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.salience.level}; ${latestProcessedPacket.salience.reasons.slice(0, 2).join(" | ") || "no reason"}`
        : "voice candidate pending",
      fallbackOutputPreview: latestProcessedPacket?.salience.calloutDraft ?? null,
      edgeLabel: microRun("packet_composer") ? "packet ready" : "needs packet",
      edgeTone: microRun("packet_composer") ? "connected" : latestProcessedPacket ? "pending" : "blocked",
    }),
    makeMicroReasonerNode({
      role: "packet_composer",
      run: microRun("packet_composer"),
      prompt: microPrompt("packet_composer"),
      packet: latestProcessedPacket,
      fallbackInputRefs: latestProcessedPacket?.microReasonerRunRefs ?? [],
      fallbackInputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.mailIds.length} mail; ${latestProcessedPacket.resolutionState}`
        : "processed packet pending",
      fallbackOutputPreview: latestProcessedPacket
        ? `${latestProcessedPacket.recommendedNext}; ${latestProcessedPacket.resolutionState}; ${latestProcessedPacket.observedFacts.slice(0, 2).join(" | ")}`
        : null,
      edgeLabel: displayWake ? "Ask handoff" : latestProcessedPacket?.arbiter?.wakeAsk ? "handoff pending" : "local packet",
      edgeTone: displayWake ? "connected" : latestProcessedPacket?.arbiter?.wakeAsk ? "pending" : latestProcessedPacket ? "connected" : "blocked",
    }),
    {
      id: "observer_mail_loop:ask_wake",
      title: "Ask Handoff",
      subtitle: "packet-backed interrupt admission",
      status: latestWakeLifecycleStage ?? latestWakeStatus ?? (latestProcessedPacket?.arbiter?.wakeAsk ? "handoff pending" : "not Ask-ready"),
      preview: manualCheckpointWithoutPolicy && unreadCount > 0
        ? `manual checkpoint completed; ${unreadCount} unread retained until a watch policy is configured`
        : pressureText
        ? pressureText
        : pendingWakeLifecycleStage === "voice_pending" && latestPendingWake
        ? stagePlayWakeLifecycleSummary({
            lifecycleStage: pendingWakeLifecycleStage,
            status: pendingWakeStatus,
            askTurnId: latestPendingWake.askTurnId,
            decisionIds: latestPendingWake.decisionIds,
            failureReason: pendingWakeLifecycleReason ?? pendingWakeFailureReason,
          })
        : latestWakeStatus
          ? `${stagePlayWakeLifecycleSummary({
              lifecycleStage: latestWakeLifecycleStage,
              status: latestWakeStatus,
              askTurnId: latestWakeAskTurnId,
              decisionIds: latestWakeDecisionIds,
              voiceRefs: completedWakeVoiceRefs,
              nextRetryAt: pressureNextRetryAt,
              failureReason: latestWakeLifecycleReason ?? latestWakeFailureReason,
            })}; ${latestWakeAskText}; ${unreadCount} unread retained${secondaryPressureText ? `; ${secondaryPressureText}` : ""}`
        : `${queuedRunningText}; waiting for mail`,
      statusChips: [
        manualCheckpointWithoutPolicy ? "policy missing" : null,
        latestWakeLifecycleStage ? `latest ${labelize(latestWakeLifecycleStage)}` : null,
        pendingWakeLifecycleStage ? `pending ${labelize(pendingWakeLifecycleStage)}` : null,
        latestCompletedWakeResult ? "last wake completed" : null,
        completedWakeVoiceRefs.length > 0 ? "voice checkpoint" : null,
        latestPendingWake ? "current wake pending" : null,
        wakeContinuationActive ? "continuation armed" : null,
        queuedWakeMailCount > 0 ? `${queuedWakeMailCount} queued mail` : null,
        runningWakeMailCount > 0 ? `${runningWakeMailCount} running mail` : null,
        wakePressureActive ? "wake pressure" : null,
        pressureWakeMailCount > 0 ? `${pressureWakeMailCount} retained mail` : null,
        retryWakeCount > 0 ? "retrying" : null,
      ].filter((entry): entry is string => Boolean(entry)),
      statusBand: wakePressureBand ?? wakeContinuationBand,
      payloadRows: [
        {
          label: "Last completed",
          value: latestCompletedWakeResult
            ? `${stagePlayWakeLifecycleSummary({
                lifecycleStage: latestCompletedWakeResult.lifecycleStage,
                status: latestCompletedWakeResult.status,
                askTurnId: completedWakeAskTurnId,
                decisionIds: completedWakeDecisionIds,
                voiceRefs: completedWakeVoiceRefs,
                failureReason: latestCompletedWakeResult.lifecycleReason,
              })}; ${completedWakeDecisionIds.length} decision${completedWakeDecisionIds.length === 1 ? "" : "s"}`
            : "No completed Ask interrupt yet.",
          tone: latestCompletedWakeResult ? "good" : "default",
        },
        {
          label: "Current pending",
          value: latestPendingWake
            ? `${stagePlayWakeLifecycleSummary({
                lifecycleStage: pendingWakeLifecycleStage,
                status: pendingWakeStatus ?? latestPendingWake.status,
                askTurnId: latestPendingWake.askTurnId,
                decisionIds: latestPendingWake.decisionIds,
                nextRetryAt: latestPendingWake.nextRetryAt,
                failureReason: pendingWakeLifecycleReason ?? pendingWakeFailureReason,
              })}; ${latestPendingWake.mailIds.length} mail`
            : "No current pending/deferred interrupt.",
          tone: latestPendingWake ? stagePlayWakeLifecycleTone(pendingWakeLifecycleStage, pendingWakeStatus ?? latestPendingWake.status) : "default",
        },
        {
          label: "Lifecycle",
          value: latestWakeLifecycleStage || pendingWakeLifecycleStage
            ? `${labelize(latestWakeLifecycleStage ?? pendingWakeLifecycleStage ?? "unknown")}${latestWakeLifecycleReason || pendingWakeLifecycleReason ? `; ${latestWakeLifecycleReason ?? pendingWakeLifecycleReason}` : ""}`
            : "No lifecycle evidence yet.",
          tone: stagePlayWakeLifecycleTone(latestWakeLifecycleStage ?? pendingWakeLifecycleStage, latestWakeStatus ?? pendingWakeStatus),
        },
        {
          label: "Tool",
          value: `packet verdict -> Helix Ask${latestWakeAskTurnId ? ` -> ${latestWakeAskTurnId}` : ""}`,
          tone: latestWakeAskTurnId ? "good" : displayWake ? "warn" : "default",
        },
        {
          label: "Handoff",
          value: manualCheckpointWithoutPolicy
            ? "watch policy missing; configure a standing job before automatic interpretation"
            : latestWakeStatus
            ? `${latestWakeStatus}${latestWakeFailureReason ? `; ${latestWakeFailureReason}` : ""}`
            : latestProcessedPacket?.arbiter?.wakeAsk ? "deck verdict is Ask-ready; waiting for handoff" : "no packet-backed Ask handoff",
          tone: manualCheckpointWithoutPolicy ||
            latestWakeStatus === "failed_retryable" || latestWakeStatus === "failed_terminal"
            ? "blocked"
            : latestWakeStatus === "deferred_for_pressure" || unreadCount > 0 ? "warn" : latestWakeStatus ? "good" : "default",
        },
        {
          label: wakePressureActive ? "Pressure" : "Continuation",
          value: wakePressureActive
            ? `deferred; ${unreadCount} unread retained${pressureNextRetryAt ? `; next retry ${formatStagePlayClock(pressureNextRetryAt)}` : ""}`
            : `${continuationStateText}${continuationRetainedMailCount > 0 ? `; ${continuationRetainedMailCount} unread retained` : ""}`,
          tone: wakePressureActive ? "warn" : wakeContinuationActive ? "good" : "default",
        },
      ],
      edgeToNext: {
        label: manualCheckpointWithoutPolicy
          ? "policy missing"
          : latestDecision ? "decision" : latestWakeStatus === "deferred_for_pressure" ? "deferred" : displayWake ? "running/pending" : "wake missing",
        tone: manualCheckpointWithoutPolicy
          ? "blocked"
          : latestDecision ? "connected" : latestWakeStatus === "deferred_for_pressure" ? "pending" : latestWakeStatus === "failed_terminal" ? "blocked" : displayWake ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: wakeInputRefs,
      inputPreview: wakeInputRefs.length > 0 ? wakeInputRefs.join(", ") : "packet/deck verdict pending",
      transformLabel: "processed packet + deck verdict -> Helix Ask handoff",
      outputLabel: "Output",
      outputRefs: displayWake ? uniqueSorted([
        displayWake.wakeRequestId,
        latestWakeResult?.wakeResultId ?? "",
        latestWakeAskTurnId ?? "",
        ...latestWakeDecisionIds,
        ...displayWake.evidenceRefs,
        ...(latestWakeResult?.evidenceRefs ?? []),
        ...(latestCompletedWakeResult?.evidenceRefs ?? []),
        ...completedWakeVoiceRefs,
      ].filter(Boolean)) : [],
      outputPreview: latestWakeStatus
        ? manualCheckpointWithoutPolicy
          ? `manual checkpoint complete; ${unreadCount} unread retained; configure live_env.configure_live_source_watch_job for the continuing loop`
          : latestWakeStatus === "deferred_for_pressure"
          ? `deferred_for_pressure; ${runtimePressureReason ?? "runtime pressure"}; ${unreadCount} unread retained${pressureNextRetryAt ? `; next retry ${formatStagePlayClock(pressureNextRetryAt)}` : ""}; ${pressureContinuationText}`
          : `${stagePlayWakeLifecycleSummary({
              lifecycleStage: latestWakeLifecycleStage,
              status: latestWakeStatus,
              askTurnId: latestWakeAskTurnId,
              decisionIds: latestWakeDecisionIds,
              voiceRefs: completedWakeVoiceRefs,
              failureReason: latestWakeLifecycleReason ?? latestWakeFailureReason,
            })}; continuation ${continuationStateText}; ${continuationRetainedMailCount || unreadCount} unread retained${secondaryPressureText ? `; ${secondaryPressureText}` : ""}`
        : unreadCount > 0
          ? "raw observer backlog remains a processing trigger, not Ask-ready"
          : "no packet-backed Ask handoff yet",
    },
    {
      id: "observer_mail_loop:ask_decision",
      title: "Decision",
      subtitle: "mail reader + model decision",
      status: latestDecision?.decision ?? (deliveredCount > 0 ? "delivered_to_ask" : "awaiting_mail_read"),
      preview: latestDecisionText,
      statusChips: [
        latestDecision?.modelReviewed ? "model reviewed" : null,
        latestDecision?.mailIds.length ? `${latestDecision.mailIds.length} mail` : null,
      ].filter((entry): entry is string => Boolean(entry)),
      payloadRows: [
        {
          label: "Decision",
          value: latestDecision?.decision ?? "No model decision yet.",
          tone: latestDecision ? "good" : "warn",
        },
        {
          label: "Reason",
          value: latestDecision?.rationalePreview || "Waiting for Ask to record a decision.",
        },
        {
          label: "Refs",
          value: latestDecision?.decisionId ?? "decision ref pending",
        },
      ],
      edgeToNext: {
        label: steeringRows.length > 0 ? "steering audit" : latestDecision ? "output state" : "decision missing",
        tone: latestDecision ? "connected" : "pending",
      },
      inputLabel: "Input",
      inputRefs: decisionInputRefs,
      inputPreview: decisionInputRefs.length > 0 ? decisionInputRefs.join(", ") : "mail item ids pending",
      transformLabel: "live_env.read_live_source_mail -> live_env.record_live_source_mail_decision",
      outputLabel: "Output",
      outputRefs: latestDecision ? [latestDecision.decisionId, ...latestDecision.evidenceRefs] : [],
      outputPreview: latestDecision?.decision ?? (unreadCount > 0 ? "awaiting Ask mail read" : "wait_for_next_summary"),
    },
    {
      id: "observer_mail_loop:steering",
      title: "Steering",
      subtitle: "voice steering timeline",
      status: steeringStatus,
      preview: steeringPreview,
      statusChips: [
        steeringRows.length > 0 ? `${steeringRows.length} row${steeringRows.length === 1 ? "" : "s"}` : "no rows",
        latestSteeringAck ? "ack receipt" : null,
      ].filter((entry): entry is string => Boolean(entry)),
      statusBand: steeringRows.length > 0
        ? {
            title: "Steering timeline",
            lines: [
              latestSteeringReceived ? `Heard: ${compactStagePlayText(latestSteeringReceived.body, "voice steering received", 82)}` : null,
              latestSteeringDecisionRow ? `Decision: ${stagePlaySteeringRowLabel(latestSteeringDecisionRow.rowKind)}` : "Decision: not recorded yet",
              latestSteeringAck ? `Ack: ${compactStagePlayText(latestSteeringAck.body, "receipt recorded", 82)}` : "Ack: no receipt yet",
            ].filter((line): line is string => Boolean(line)),
            tone: steeringTone === "good" ? "good" : steeringTone === "blocked" ? "blocked" : "pending",
          }
        : null,
      payloadRows: [
        {
          label: "Status",
          value: steeringStatusText,
          tone: steeringTone,
        },
        {
          label: "Target",
          value: steeringStatusRow?.source.artifactId ?? latestWakeAskTurnId ?? "No target turn evidence yet.",
          tone: steeringStatusRow ? "good" : "default",
        },
        {
          label: "Debug",
          value: steeringRows.length > 0
            ? "Transcript rows back voice_steering_debug; receipts remain evidence-only."
            : "Waiting for voice_steering_debug rows from live transcript.",
          tone: steeringRows.length > 0 ? "good" : "warn",
        },
      ],
      edgeToNext: {
        label: steeringRows.length > 0 ? "visible timeline" : "no steering",
        tone: steeringRows.length > 0 ? "connected" : latestDecision ? "pending" : "blocked",
      },
      inputLabel: "Input",
      inputRefs: steeringRows.flatMap((row) => row.evidenceRefs).slice(0, 8),
      inputPreview: latestSteeringReceived?.body
        ? compactStagePlayText(latestSteeringReceived.body, "voice steering received")
        : "voice steering transcript rows pending",
      transformLabel: "voice steering event/decision/ack -> console timeline",
      outputLabel: "Output",
      outputRefs: steeringEventRefs.slice(0, 12),
      outputPreview: steeringRows.length > 0
        ? steeringRows.slice(-3).map((row) => stagePlaySteeringRowLabel(row.rowKind)).join(" -> ")
        : "no steering timeline rows observed",
    },
    {
      id: "observer_mail_loop:output_wait",
      title: "Output / Wait",
      subtitle: "text answer / voice draft / wait",
      status: manualCheckpointWithoutPolicy
        ? "policy missing"
        : latestDecision?.nextLoopState ?? activeJob?.nextLoopState ?? "armed_for_next_summary",
      preview: outputPreview,
      statusChips: [
        latestDecision?.voicePolicy?.voiceEnabled ? "voice enabled" : "voice off",
        manualCheckpointWithoutPolicy ? "configure watch job" : activeJob?.status ? `job ${activeJob.status}` : null,
        wakeContinuationActive ? "armed" : null,
      ].filter((entry): entry is string => Boolean(entry)),
      statusBand: wakePressureBand ?? wakeContinuationBand,
      payloadRows: [
        {
          label: "Output",
          value: outputPreview,
          tone: latestDecision ? "good" : "default",
        },
        {
          label: "Watch next",
          value: manualCheckpointWithoutPolicy
            ? "A watch-next target was produced for this checkpoint, but no standing watch policy is armed for future mail."
            : latestNarrativeState?.watchNext?.reason ?? latestDecision?.nextLoopState ?? activeJob?.nextLoopState ?? "armed for next summary",
          tone: manualCheckpointWithoutPolicy ? "warn" : latestNarrativeState?.watchNext?.reason ? "good" : "default",
        },
        {
          label: "Loop",
          value: manualCheckpointWithoutPolicy
            ? "Missing inner loop: configure a live-source watch job so new mail re-enters Ask under a stored objective."
            : latestPolicy
              ? `Watch policy: ${latestPolicy.interpretationMode ?? "armed"}; mail ${latestPolicy.mailProcessingMode ?? "latest_only"}; cadence ${latestPolicy.outputCadence ?? "every_batch"}; continuation ${continuationStateText}`
              : "No watch policy.",
          tone: manualCheckpointWithoutPolicy ? "blocked" : latestPolicy ? "good" : "warn",
        },
        {
          label: "Retained",
          value: `${continuationRetainedMailCount || unreadCount} unread retained`,
          tone: continuationRetainedMailCount > 0 || unreadCount > 0 ? "warn" : "good",
        },
      ],
      edgeToNext: null,
      inputLabel: "Input",
      inputRefs: latestDecision ? [latestDecision.decisionId] : [],
      inputPreview: latestDecision?.decisionId ?? "decision id pending",
      transformLabel: "decision receipt -> output policy",
      outputLabel: "Output",
      outputRefs: uniqueSorted([
        latestDecision?.voiceCalloutDraft?.text ? "voice_callout_draft" : "",
        latestDecision?.textAnswerDraft?.text ? "text_answer_draft" : "",
        latestNarrativeState?.narrativeStateId ?? "",
        latestDecision?.requestedTool?.toolName ?? "",
      ].filter(Boolean)),
      outputPreview,
      blockedUntil: latestDecision?.voiceCalloutDraft?.requiresConfirmation
        ? "voice confirmation"
        : latestNarrativeState?.watchNext?.reason
          ? `watch next: ${latestNarrativeState.watchNext.reason}`
          : null,
    },
  ];
}

const STAGE_PLAY_DECK_ROLES: StagePlayMicroReasonerRoleV1[] = [
  "claim_extractor",
  "observation_classifier",
  "effort_estimator",
  "axiom_extractor",
  "hypothesis_generator",
  "profile_comparator",
  "delta_extractor",
  "prediction_validator",
  "salience_scorer",
  "hypothesis_arbiter",
  "prompt_router",
  "decision_selector",
  "voice_callout_drafter",
  "packet_composer",
];

const STAGE_PLAY_MICRO_REASONER_ROLE_CLUSTERS: Array<{
  key: string;
  title: string;
  roles: StagePlayMicroReasonerRoleV1[];
}> = [
  {
    key: "observation",
    title: "Observation",
    roles: ["claim_extractor", "observation_classifier", "delta_extractor"],
  },
  {
    key: "model",
    title: "Task Model",
    roles: ["effort_estimator", "axiom_extractor", "hypothesis_generator", "profile_comparator", "prediction_validator"],
  },
  {
    key: "arbiter",
    title: "Arbiter",
    roles: ["salience_scorer", "hypothesis_arbiter", "prompt_router", "decision_selector", "voice_callout_drafter", "packet_composer"],
  },
];

const microReasonerPresetCategory = (preset: StagePlayMicroReasonerPromptPresetV1): string => {
  if (preset.domain === "minecraft_gameplay") return "Gaming";
  if (preset.domain === "calculator_stream") return "Tools";
  if (preset.domain === "science_visual") return "Science";
  if (preset.domain === "browser_workflow") return "Workflows";
  if (preset.domain === "custom") return "Custom";
  return "General";
};

const microReasonerPresetOptionLabel = (preset: StagePlayMicroReasonerPromptPresetV1): string =>
  `${preset.title}${preset.sourceIds.length > 0 ? " (applied)" : ""}`;

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

function jsonCharCount(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return 0;
  }
}

function formatStagePlayMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "pending";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatStagePlayCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function stagePlayRuntimePercent(used: number | null | undefined, limit: number | null | undefined): number | null {
  if (
    typeof used !== "number" ||
    typeof limit !== "number" ||
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(999, (used / limit) * 100));
}

function formatStagePlayRuntimePercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "n/a";
  return `${Math.round(percent)}%`;
}

function formatStagePlayRuntimeMiB(
  used: number | null | undefined,
  limit: number | null | undefined,
  percent: number | null,
): string {
  if (percent != null) return formatStagePlayRuntimePercent(percent);
  if (typeof used === "number" && Number.isFinite(used)) {
    return `${Math.round(used)}MiB`;
  }
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return `limit ${Math.round(limit)}MiB`;
  }
  return "n/a";
}

function stagePlayBudgetTone(level?: string | null, ratio?: number | null): "default" | "good" | "warn" | "blocked" {
  const normalized = String(level ?? "").toLowerCase();
  if (normalized === "limited" || normalized.includes("blocked") || normalized.includes("hard")) return "blocked";
  if (normalized === "watch" || normalized.includes("pressure") || normalized.includes("deferred")) return "warn";
  if (typeof ratio === "number" && Number.isFinite(ratio)) {
    if (ratio >= 1) return "blocked";
    if (ratio >= 0.75) return "warn";
    return "good";
  }
  return normalized === "normal" ? "good" : "default";
}

function formatStagePlayBudgetRatio(ratio?: number | null): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "n/a";
  return `${Math.round(ratio * 100)}%`;
}

function stagePlayRuntimeTone(percent: number | null, pressureLevel?: string | null): "default" | "good" | "warn" | "blocked" {
  const normalizedPressure = (pressureLevel ?? "").toLowerCase();
  if (normalizedPressure.includes("hard") || normalizedPressure.includes("blocked")) return "blocked";
  if (normalizedPressure.includes("soft") || normalizedPressure.includes("pressure")) return "warn";
  if (percent == null) return "default";
  if (percent >= 90) return "blocked";
  if (percent >= 75) return "warn";
  return "good";
}

function ageMsFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Date.now() - parsed);
}

function latestStagePlayPacketForMail(
  packets: StagePlayProcessedMailPacketV1[],
  mailId?: string | null,
): StagePlayProcessedMailPacketV1 | null {
  const matching = mailId ? packets.filter((packet) => packet.mailIds.includes(mailId)) : packets;
  return matching.at(-1) ?? packets.at(-1) ?? null;
}

function latestStagePlayRunForPacket(
  runs: StagePlayMicroReasonerRunV1[],
  role: StagePlayMicroReasonerRoleV1,
  packet: StagePlayProcessedMailPacketV1 | null,
): StagePlayMicroReasonerRunV1 | null {
  const runRefs = new Set(packet?.microReasonerRunRefs ?? []);
  const mailIds = new Set(packet?.mailIds ?? []);
  return runs
    .filter((run) => run.role === role)
    .filter((run) => runRefs.size > 0 ? runRefs.has(run.runId) : run.mailIds.some((mailId) => mailIds.has(mailId)))
    .at(-1) ?? null;
}

function StagePlayMetricPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "blocked";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "good"
          ? "border-emerald-800 bg-emerald-950/25 text-emerald-100"
          : tone === "warn"
            ? "border-amber-800 bg-amber-950/25 text-amber-100"
            : tone === "blocked"
              ? "border-rose-800 bg-rose-950/25 text-rose-100"
              : "border-slate-800 bg-slate-950/60 text-slate-200"
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

function StagePlayMailLoopLiveOverview({
  graph,
  mailbox,
}: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [debugCopyState, setDebugCopyState] = useState<"idle" | "trace" | "packet" | "wake" | "ask" | "full">("idle");
  const [dismissingWakeId, setDismissingWakeId] = useState<string | null>(null);
  const [selectedTrafficPayloadId, setSelectedTrafficPayloadId] = useState<string | null>(null);
  const [selectedPacketTrafficKey, setSelectedPacketTrafficKey] = useState<string | null>(null);
  const [selectedMicroReasonerRole, setSelectedMicroReasonerRole] = useState<StagePlayMicroReasonerRoleV1>("claim_extractor");
  const [selectedMicroPresetId, setSelectedMicroPresetId] = useState("");
  const [microReasonerPromptDraft, setMicroReasonerPromptDraft] = useState("");
  const [microDeckApplyStatus, setMicroDeckApplyStatus] = useState<{
    state: "idle" | "applying" | "applied" | "failed";
    message: string;
  }>({ state: "idle", message: "" });
  const [microDeckSaveStatus, setMicroDeckSaveStatus] = useState<{
    state: "idle" | "saving" | "saved" | "failed";
    message: string;
  }>({ state: "idle", message: "" });
  const debugCopyResetTimerRef = useRef<number | null>(null);
  const mailItems = mailbox?.mailItems ?? [];
  const packets = mailbox?.processedMailPackets ?? [];
  const runs = mailbox?.microReasonerRuns ?? [];
  const prompts = mailbox?.microReasonerPrompts ?? [];
  const microReasonerPromptPresets = mailbox?.microReasonerPromptPresets ?? [];
  const activeMicroReasonerPromptPreset = mailbox?.activeMicroReasonerPromptPreset ?? null;
  const microReasonerPromptToolActivities = mailbox?.microReasonerPromptToolActivities ?? [];
  const latestMicroReasonerPromptToolActivity = microReasonerPromptToolActivities.at(-1) ?? null;
  const wakeRequests = mailbox?.wakeRequests ?? [];
  const wakeResults = mailbox?.wakeResults ?? [];
  const decisions = mailbox?.decisions ?? [];
  const latestMail = latestStagePlayMailItem(mailItems, (item) => item.sourceKind === "visual_frame") ?? latestStagePlayMailItem(mailItems);
  const latestPacket = latestStagePlayPacketForMail(packets, latestMail?.mailId);
  const latestPacketRuns = runs.filter((run) => latestPacket?.microReasonerRunRefs.includes(run.runId));
  const latestWake =
    latestStagePlayMailWakeRequest(wakeRequests, latestMail?.mailId) ??
    latestStagePlayMailWakeRequest(wakeRequests);
  const latestWakeResult =
    latestWake ? latestStagePlayMailWakeResult(wakeResults, latestWake.wakeRequestId) : null;
  const dismissibleWakeRequests = wakeRequests
    .filter(isDismissibleStagePlayWakeRequest)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
  const liveOverviewPendingWakes = wakeRequests.filter((wake) =>
    wake.status === "queued" ||
    wake.status === "waiting_for_ui_handoff" ||
    wake.status === "running" ||
    wake.status === "failed_retryable" ||
    wake.status === "deferred_for_pressure"
  );
  const liveOverviewPendingWake =
    liveOverviewPendingWakes.filter((wake) => wake.lifecycleStage === "voice_pending").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    liveOverviewPendingWakes.filter((wake) => wake.status === "deferred_for_pressure").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    liveOverviewPendingWakes.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ??
    null;
  const liveOverviewPendingWakeResult = liveOverviewPendingWake
    ? latestStagePlayMailWakeResult(wakeResults, liveOverviewPendingWake.wakeRequestId)
    : null;
  const liveOverviewCompletedWakeResult =
    latestStagePlayMailWakeResult(wakeResults.filter((result) => result.status === "completed")) ?? null;
  const liveOverviewCompletedWake = liveOverviewCompletedWakeResult
    ? wakeRequests.find((wake) => wake.wakeRequestId === liveOverviewCompletedWakeResult.wakeRequestId) ?? null
    : wakeRequests.filter((wake) => wake.status === "completed").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1) ?? null;
  const visualSource = graph.sourceWindow.sources.find((source) =>
    source.modality === "visual_frame" && source.status === "active"
  ) ?? graph.sourceWindow.sources.find((source) => source.modality === "visual_frame") ?? null;
  const microDeckSourceId =
    visualSource?.sourceId ??
    latestMail?.sourceId ??
    activeMicroReasonerPromptPreset?.sourceIds.at(-1) ??
    null;
  const selectedMicroReasonerPromptPreset =
    microReasonerPromptPresets.find((preset) => preset.presetId === selectedMicroPresetId) ??
    microReasonerPromptPresets.find((preset) => preset.presetId === preferredMicroReasonerPresetId(microReasonerPromptPresets, activeMicroReasonerPromptPreset)) ??
    null;
  const selectedMicroPresetApplied = Boolean(
    activeMicroReasonerPromptPreset &&
      selectedMicroReasonerPromptPreset &&
      activeMicroReasonerPromptPreset.presetId === selectedMicroReasonerPromptPreset.presetId,
  );
  const appliedMicroReasonerPresetIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeMicroReasonerPromptPreset?.presetId) ids.add(activeMicroReasonerPromptPreset.presetId);
    for (const packet of packets) {
      if (packet.microReasonerDeck?.presetId) ids.add(packet.microReasonerDeck.presetId);
    }
    for (const run of runs) {
      if (run.deckPresetId) ids.add(run.deckPresetId);
    }
    for (const wake of wakeRequests) {
      if (wake.deckPresetId) ids.add(wake.deckPresetId);
    }
    for (const update of mailbox?.goalContextUpdates ?? []) {
      for (const action of update.suggestedDispatch) {
        if (action.kind === "change_preset" && action.presetId) ids.add(action.presetId);
      }
    }
    if (mailbox?.mailLoopWorkBudget?.selectedDeck?.presetId) ids.add(mailbox.mailLoopWorkBudget.selectedDeck.presetId);
    return ids;
  }, [
    activeMicroReasonerPromptPreset?.presetId,
    mailbox?.goalContextUpdates,
    mailbox?.mailLoopWorkBudget?.selectedDeck?.presetId,
    packets,
    runs,
    wakeRequests,
  ]);
  const appliedMicroDecks = useMemo<StagePlayAppliedMicroDeck[]>(() => {
    const presetsById = new Map(microReasonerPromptPresets.map((preset) => [preset.presetId, preset]));
    const entries = new Map<string, StagePlayAppliedMicroDeck>();
    const put = (input: StagePlayAppliedMicroDeck) => {
      entries.set(stagePlayAppliedDeckKey(input.presetId, input.sourceId, input.reason), input);
    };
    if (activeMicroReasonerPromptPreset?.presetId) {
      put({
        presetId: activeMicroReasonerPromptPreset.presetId,
        title: activeMicroReasonerPromptPreset.title,
        sourceId: microDeckSourceId,
        colorKey: latestPacket?.packetId ?? microDeckSourceId ?? activeMicroReasonerPromptPreset.presetId,
        reason: "active source deck",
      });
    }
    for (const packet of packets.slice(-8)) {
      const presetId = packet.microReasonerDeck?.presetId;
      if (!presetId) continue;
      put({
        presetId,
        title: packet.microReasonerDeck?.presetTitle ?? presetsById.get(presetId)?.title ?? presetId,
        sourceId: packet.sourceId,
        colorKey: packet.packetId,
        reason: "packet deck",
      });
    }
    for (const run of runs.slice(-12)) {
      if (!run.deckPresetId) continue;
      put({
        presetId: run.deckPresetId,
        title: run.deckPresetTitle ?? presetsById.get(run.deckPresetId)?.title ?? run.deckPresetId,
        sourceId: run.sourceId,
        colorKey: latestPacket?.microReasonerRunRefs.includes(run.runId) ? latestPacket.packetId : run.runId,
        reason: "run deck",
      });
    }
    for (const wake of wakeRequests.slice(-8)) {
      if (!wake.deckPresetId) continue;
      put({
        presetId: wake.deckPresetId,
        title: wake.deckPresetTitle ?? presetsById.get(wake.deckPresetId)?.title ?? wake.deckPresetId,
        sourceId: wake.sourceIds[0] ?? null,
        colorKey: wake.packetIds[0] ?? wake.wakeRequestId,
        reason: "wake deck",
      });
    }
    for (const update of (mailbox?.goalContextUpdates ?? []).slice(-12)) {
      for (const action of update.suggestedDispatch) {
        if (action.kind !== "change_preset" || !action.presetId) continue;
        put({
          presetId: action.presetId,
          title: presetsById.get(action.presetId)?.title ?? action.presetId,
          sourceId: update.sourceRefs[0] ?? action.targetRef ?? null,
          colorKey: update.contentRef || update.updateId,
          reason: "goal dispatch deck",
        });
      }
    }
    return Array.from(entries.values()).slice(-10).reverse();
  }, [
    activeMicroReasonerPromptPreset,
    latestPacket,
    mailbox?.goalContextUpdates,
    microDeckSourceId,
    microReasonerPromptPresets,
    packets,
    runs,
    wakeRequests,
  ]);
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
  useEffect(() => {
    if (microReasonerPromptPresets.length === 0) return;
    if (selectedMicroPresetId && microReasonerPromptPresets.some((preset) => preset.presetId === selectedMicroPresetId)) return;
    if (selectedMicroPresetId.startsWith("stage_play_micro_reasoner_prompt_preset:custom:")) return;
    setSelectedMicroPresetId(preferredMicroReasonerPresetId(microReasonerPromptPresets, activeMicroReasonerPromptPreset));
  }, [activeMicroReasonerPromptPreset, microReasonerPromptPresets, selectedMicroPresetId]);
  const visualProducerState = useVisualSourceCaptureStore((state: { producers: Record<string, VisualSourceCaptureState> }) =>
    visualSource?.sourceId ? state.producers[visualSource.sourceId] ?? null : null
  );
  const latestPolicy = (mailbox?.watchJobPolicies ?? []).at(-1) ?? null;
  const cadenceMs =
    visualProducerState?.cadence_ms ??
    visualSource?.cadenceMs ??
    latestPolicy?.nextWakePolicy?.afterMs ??
    STAGE_PLAY_SOURCE_SETUP_DEFAULTS.visualCadenceMs;
  const captureStateLabel = visualProducerState
    ? visualProducerState.stream_active
      ? visualProducerState.interval_active
        ? "capturing"
        : "paused, stream shared"
      : "stopped"
    : visualSource?.status
      ? labelize(visualSource.status)
      : "unknown";
  const captureStateTone =
    visualProducerState?.stream_active && visualProducerState.interval_active
      ? "good"
      : visualProducerState?.stream_active
        ? "warn"
        : visualProducerState
          ? "blocked"
          : "default";
  const latestSummary = formatStagePlayLiveSummaryForOverview(latestMail);
  const latestDeckVerdict = formatStagePlayDeckVerdictForOverview(latestPacket);
  const packetAgeMs = ageMsFromIso(latestPacket?.createdAt);
  const mailAgeMs = ageMsFromIso(latestMail?.createdAt);
  const wakeStatus = latestWakeResult?.status ?? latestWake?.status ?? "none";
  const wakeLifecycleStage =
    latestWakeResult?.lifecycleStage ??
    latestWake?.lifecycleStage ??
    liveOverviewPendingWakeResult?.lifecycleStage ??
    liveOverviewPendingWake?.lifecycleStage ??
    null;
  const wakeBridgeEligible = shouldBridgeStagePlayWakeToAsk({
    wake: latestWake,
    wakeResult: latestWakeResult,
    packet: latestPacket,
  });
  const wakeBridgeReason = wakeStatus === "deferred_for_pressure"
    ? "backend interrupt admission deferred for pressure, opening visible Helix Ask interrupt as a manual override"
    : wakeStatus === "failed_retryable"
      ? "backend interrupt attempt failed retryably, opening visible Helix Ask interrupt"
      : "micro-reasoner interrupt candidate ready for Helix Ask";
  const wakeBridgeButtonLabel = wakeStatus === "deferred_for_pressure"
    ? "Open pressure-deferred interrupt"
    : wakeStatus === "failed_retryable"
      ? "Retry interrupt in Helix Ask"
      : "Open queued interrupt in Helix Ask";
  const wakeBridgeButtonTitle = wakeBridgeEligible
    ? wakeStatus === "deferred_for_pressure"
      ? "Open and auto-submit this pressure-deferred mailbox interrupt in Helix Ask as a visible manual override."
      : "Open and auto-submit this constrained mailbox interrupt in Helix Ask."
    : "No eligible unresolved interrupt candidate is ready.";
  const packetChars = latestPacket ? jsonCharCount(latestPacket) : 0;
  const runChars = jsonCharCount(latestPacketRuns.length > 0 ? latestPacketRuns : runs);
  const compactPacketChars = latestPacket ? jsonCharCount({
    packetId: latestPacket.packetId,
    mailIds: latestPacket.mailIds,
    observedFacts: latestPacket.observedFacts.slice(0, 4),
    changedFacts: latestPacket.changedFacts.slice(0, 4),
    effort: latestPacket.effortEstimate,
    axioms: latestPacket.axioms,
    hypotheses: latestPacket.hypotheses?.slice(0, 4) ?? [],
    arbiter: latestPacket.arbiter,
    recommendedNext: latestPacket.recommendedNext,
    watchNext: latestPacket.watchNext.slice(0, 4),
  }) : 0;
  const arbiterChars = latestPacket ? jsonCharCount({
    packetId: latestPacket.packetId,
    mailIds: latestPacket.mailIds,
    effort: latestPacket.effortEstimate?.currentEffort ?? "unknown",
    arbiter: latestPacket.arbiter,
    recommendedNext: latestPacket.recommendedNext,
    evidenceRefs: latestPacket.evidenceRefs.slice(0, 10),
  }) : 0;
  const deckLatencyMs = latestPacketRuns.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0);
  const runtimeAdmission = mailbox?.wakeAdmissionCycle?.runtimeAdmission ?? null;
  const runtimePressureLevel = runtimeAdmission?.pressureLevel ?? mailbox?.wakeAdmissionCycle?.reason ?? null;
  const heapRamPercent = stagePlayRuntimePercent(
    runtimeAdmission?.memory?.heapUsedMiB,
    runtimeAdmission?.limits?.maxHeapUsedMiB,
  );
  const rssRamPercent = stagePlayRuntimePercent(
    runtimeAdmission?.memory?.rssMiB,
    runtimeAdmission?.limits?.maxRssMiB,
  );
  const heapRamLabel = formatStagePlayRuntimeMiB(
    runtimeAdmission?.memory?.heapUsedMiB,
    runtimeAdmission?.limits?.maxHeapUsedMiB,
    heapRamPercent,
  );
  const rssRamLabel = formatStagePlayRuntimeMiB(
    runtimeAdmission?.memory?.rssMiB,
    runtimeAdmission?.limits?.maxRssMiB,
    rssRamPercent,
  );
  const runtimePressureLabel = runtimePressureLevel ? labelize(runtimePressureLevel) : "n/a";
  const deckRuntimeLabel = heapRamPercent != null
    ? `heap ${formatStagePlayRuntimePercent(heapRamPercent)}`
    : rssRamPercent != null
      ? `rss ${formatStagePlayRuntimePercent(rssRamPercent)}`
      : "ram n/a";
  const combinedRuntimePercent = heapRamPercent != null || rssRamPercent != null
    ? Math.max(heapRamPercent ?? 0, rssRamPercent ?? 0)
    : null;
  const combinedRuntimeTone = stagePlayRuntimeTone(combinedRuntimePercent, runtimePressureLevel);
  const latestPacketColor = packetTrailColor(latestPacket?.packetId ?? latestMail?.mailId ?? microDeckSourceId ?? "packet");
  const mailLoopWorkBudget = mailbox?.mailLoopWorkBudget ?? null;
  const workBudgetTone = stagePlayBudgetTone(mailLoopWorkBudget?.pressure?.level, mailLoopWorkBudget?.pressure?.ratio);
  const workBudgetLabel = mailLoopWorkBudget?.pressure?.level
    ? `${labelize(mailLoopWorkBudget.pressure.level)} ${formatStagePlayBudgetRatio(mailLoopWorkBudget.pressure.ratio)}`
    : "budget n/a";
  const deckBudgetLabel = mailLoopWorkBudget
    ? `${typeof mailLoopWorkBudget.usage?.rolesPerPacket === "number" ? `${formatStagePlayCount(mailLoopWorkBudget.usage.rolesPerPacket)} roles` : "roles n/a"} | ${typeof mailLoopWorkBudget.usage?.estimatedDeckCallsPerMinute === "number" ? `${formatStagePlayCount(mailLoopWorkBudget.usage.estimatedDeckCallsPerMinute)}/min` : "calls n/a"}`
    : "deck n/a";
  const currentWakeForOperator = liveOverviewPendingWake ?? latestWake;
  const currentWakeResultForOperator =
    (currentWakeForOperator
      ? latestStagePlayMailWakeResult(wakeResults, currentWakeForOperator.wakeRequestId)
      : null) ??
    latestWakeResult;
  const currentDecisionIds = new Set([
    ...(currentWakeForOperator?.decisionIds ?? []),
    ...(currentWakeResultForOperator?.decisionIds ?? []),
  ]);
  const latestWakeDecision =
    decisions.filter((decision) => currentDecisionIds.has(decision.decisionId)).at(-1) ??
    decisions.at(-1) ??
    null;
  const currentAskTurnId =
    currentWakeForOperator?.askTurnId ??
    currentWakeResultForOperator?.askTurnId ??
    null;
  const currentWakeFailure =
    currentWakeResultForOperator?.failedReason ??
    currentWakeResultForOperator?.skippedReason ??
    currentWakeForOperator?.failureReason ??
    null;
  const currentWakeStatus =
    currentWakeResultForOperator?.status ??
    currentWakeForOperator?.status ??
    "none";
  const currentWakeStage =
    currentWakeResultForOperator?.lifecycleStage ??
    currentWakeForOperator?.lifecycleStage ??
    null;
  const blockedBeforeAsk =
    !currentAskTurnId &&
    (
      currentWakeStatus === "deferred_for_pressure" ||
      currentWakeStage === "pressure_deferred" ||
      /(?:pressure|runtime_memory|queue_deferrable|503)/i.test(currentWakeFailure ?? "")
    );
  const voiceCheckpointRefs = (currentWakeResultForOperator?.voiceCheckpointRefs?.length
    ? currentWakeResultForOperator.voiceCheckpointRefs
    : (currentWakeResultForOperator?.evidenceRefs ?? []).filter((ref) =>
        /^(?:live_source_interim_voice_callout_receipt|helix_interim_voice_callout_receipt|voice_hold_receipt|voice_block_receipt|voice_receipt|stage_play_live_source_voice_delivery_receipt):/i.test(ref)
      ));
  const voiceRequested =
    latestPacket?.recommendedNext === "request_voice_callout" ||
    latestPacket?.arbiter?.recommendedNext === "request_voice_callout" ||
    latestWakeDecision?.decision === "request_voice_callout";
  const voiceStatusLabel = !voiceRequested
    ? "not requested"
    : currentWakeStage === "voice_delivered"
      ? "voice delivered"
      : currentWakeStage === "voice_queued_retry"
        ? "voice queued/retry"
        : currentWakeStage === "voice_unknown" || voiceCheckpointRefs.length > 0
          ? "voice checkpoint status unknown"
      : currentWakeStage === "voice_held"
        ? "voice held"
        : currentWakeStage === "voice_blocked"
          ? "voice blocked"
          : latestWakeDecision?.decision === "request_voice_callout"
            ? "voice request pending"
            : "voice decision missing";
  const currentWakeSummary = stagePlayWakeLifecycleSummary({
    lifecycleStage: currentWakeStage,
    status: currentWakeStatus,
    askTurnId: currentAskTurnId,
    decisionIds: [...currentDecisionIds],
    voiceRefs: voiceCheckpointRefs,
    nextRetryAt: currentWakeForOperator?.nextRetryAt ?? null,
    failureReason: currentWakeFailure,
  });
  const recentMailPayloads: StagePlayMailJourneyPayload[] = mailItems.slice(-5).reverse().map((mail) => ({
    id: mail.mailId,
    label: mail.mailId.split(":").at(-1)?.slice(0, 8) ?? "mail",
    status: labelize(mail.status),
    preview: compactStagePlayMailPreview(mail.summary.preview || mail.summary.text, "No visual summary preview.", 120),
    meta: formatStagePlayClock(mail.createdAt),
    state: mail.status === "unread" ? "active" : "done",
    evidenceRefs: mail.evidenceRefs,
  }));
  const recentPacketPayloads: StagePlayMailJourneyPayload[] = packets.slice(-5).reverse().map((packet) => ({
    id: packet.packetId,
    label: packet.packetId.split(":").at(-1)?.slice(0, 8) ?? "packet",
    status: labelize(packet.recommendedNext),
    preview: compactStagePlayText(packet.arbiter?.reason || formatStagePlayDeckVerdictForOverview(packet), "Packet verdict pending.", 120),
    meta: formatStagePlayClock(packet.createdAt),
    state: packet.arbiter?.wakeAsk || packet.recommendedNext !== "wait_for_next_summary" ? "active" : "done",
    evidenceRefs: packet.evidenceRefs,
  }));
  const recentWakePayloads: StagePlayMailJourneyPayload[] = wakeRequests.slice(-6).reverse().map((wake) => ({
    id: wake.wakeRequestId,
    label: wake.wakeRequestId.split(":").at(-1)?.slice(0, 8) ?? "interrupt",
    status: labelize(wake.lifecycleStage ?? wake.status),
    preview: compactStagePlayText(wake.failureReason ?? `${wake.mailIds.length} mail item(s), ${wake.decisionIds.length} decision(s).`, "Interrupt queued.", 120),
    meta: wake.askTurnId ? "ask" : formatStagePlayClock(wake.updatedAt),
    state: wake.status === "completed"
      ? "done"
      : wake.status === "deferred_for_pressure" || wake.status === "failed_retryable"
        ? "blocked"
        : wake.status === "running"
          ? "active"
          : "pending",
    evidenceRefs: wake.evidenceRefs,
  }));
  const askHandoffPayloads: StagePlayMailJourneyPayload[] = wakeRequests
    .filter((wake) => wake.askTurnId || wake.status === "running" || wake.status === "waiting_for_ui_handoff")
    .slice(-5)
    .reverse()
    .map((wake) => ({
      id: `${wake.wakeRequestId}:ask`,
      label: wake.askTurnId?.split(":").at(-1)?.slice(0, 8) ?? wake.wakeRequestId.split(":").at(-1)?.slice(0, 8) ?? "ask",
      status: wake.askTurnId ? "Ask entered" : wake.status === "waiting_for_ui_handoff" ? "Waiting for UI handoff" : "launching",
      preview: compactStagePlayText(wake.askTurnId ? "Structured mailbox route metadata attached to Ask." : wake.status === "waiting_for_ui_handoff" ? "Queued for the Helix Ask UI bridge." : "Waiting for Ask turn id.", "Ask handoff pending.", 120),
      meta: wake.askTurnId ? "turn" : formatStagePlayClock(wake.updatedAt),
      state: wake.askTurnId ? "done" : wake.status === "waiting_for_ui_handoff" ? "pending" : "active",
      evidenceRefs: wake.evidenceRefs,
    }));
  const resultPayloads: StagePlayMailJourneyPayload[] = wakeResults.slice(-5).reverse().map((result) => ({
    id: result.wakeResultId,
    label: result.wakeResultId.split(":").at(-1)?.slice(0, 8) ?? "result",
    status: labelize(result.lifecycleStage ?? result.status),
    preview: compactStagePlayText(result.failedReason ?? result.skippedReason ?? `${result.decisionIds.length} decision(s), ${result.voiceCheckpointRefs?.length ?? 0} voice checkpoint(s).`, "Interrupt result pending.", 120),
    meta: formatStagePlayClock(result.createdAt),
    state: result.status === "completed"
      ? "done"
      : result.status === "deferred_for_pressure" || result.status === "failed_retryable" || result.status === "failed_terminal"
        ? "blocked"
        : "pending",
    evidenceRefs: result.evidenceRefs,
  }));
  const mailTransformSteps: Array<{
    key: string;
    title: string;
    status: string;
    body: string;
    meta: string;
    state: "done" | "active" | "blocked" | "pending" | "missing";
    payloads?: StagePlayMailJourneyPayload[];
  }> = [
    {
      key: "observation",
      title: "Original observation",
      status: latestMail ? "captured" : "waiting",
      body: compactStagePlayText(latestMail?.summary.text, "Waiting for visual source mail.", 190),
      meta: latestMail ? `${formatStagePlayClock(latestMail.createdAt)} | ${formatStagePlayCount(latestMail.summary.text.length)} chars` : captureStateLabel,
      state: latestMail ? "done" : "missing",
    },
    {
      key: "shade-mail",
      title: "Minecraft shade mail",
      status: latestMail?.status ? labelize(latestMail.status) : "not built",
      body: compactStagePlayText(latestMail?.summary.preview, latestSummary, 190),
      meta: latestMail?.mailId ?? "no mail id",
      state: latestMail ? "done" : "missing",
      payloads: recentMailPayloads.filter((payload) => payload.state === "active").length > 0
        ? recentMailPayloads
        : recentMailPayloads.slice(0, 3),
    },
    {
      key: "micro-deck",
      title: "Micro-reasoner deck",
      status: latestPacket?.arbiter?.recommendedNext ? labelize(latestPacket.arbiter.recommendedNext) : "binding",
      body: compactStagePlayText(latestPacket?.arbiter?.reason, "Deck outputs are still binding into an arbiter verdict.", 190),
      meta: `${latestPacketRuns.length || runs.length} runs | ${formatStagePlayMs(deckLatencyMs)} | ${formatStagePlayCount(runChars)} chars`,
      state: latestPacket?.arbiter ? "done" : latestPacket ? "active" : "missing",
    },
    {
      key: "processed-packet",
      title: "Processed packet",
      status: latestPacket?.recommendedNext ? labelize(latestPacket.recommendedNext) : "not processed",
      body: latestPacket
        ? compactStagePlayText(formatStagePlayDeckVerdictForOverview(latestPacket), "Packet verdict pending.", 190)
        : "Micro-reasoner packet has not been composed yet.",
      meta: latestPacket ? `${formatStagePlayCount(packetChars)} chars | ${formatStagePlayClock(latestPacket.createdAt)}` : "packet pending",
      state: latestPacket ? "done" : latestMail ? "pending" : "missing",
      payloads: recentPacketPayloads,
    },
    {
      key: "wake",
      title: "Wake request",
      status: currentWakeForOperator ? labelize(currentWakeStatus) : "not queued",
      body: currentWakeSummary,
      meta: currentWakeForOperator?.wakeRequestId ?? "no wake request",
      state: blockedBeforeAsk
        ? "blocked"
        : currentWakeForOperator
          ? currentAskTurnId
            ? "done"
            : "active"
          : latestPacket?.arbiter?.wakeAsk
            ? "pending"
            : "missing",
      payloads: recentWakePayloads,
    },
    {
      key: "ask-handoff",
      title: "Helix Ask handoff",
      status: currentAskTurnId ? "entered Ask" : blockedBeforeAsk ? "blocked" : "waiting",
      body: currentAskTurnId
        ? "Structured mailbox route metadata is attached to the Ask turn."
        : blockedBeforeAsk
          ? `Not sent to Ask: ${currentWakeFailure ?? runtimePressureLabel}.`
          : "If the arbiter wakes Ask, this box is auto-sent into the Helix Ask lane.",
      meta: currentAskTurnId ?? "no Ask turn id",
      state: currentAskTurnId ? "done" : blockedBeforeAsk ? "blocked" : currentWakeForOperator ? "pending" : "missing",
      payloads: askHandoffPayloads,
    },
    {
      key: "checkpoint",
      title: "Decision / voice / final",
      status: currentWakeResultForOperator?.status === "completed" ? "checkpoint reached" : voiceStatusLabel,
      body: voiceRequested
        ? `${voiceStatusLabel}. ${voiceCheckpointRefs.length} voice checkpoint ref${voiceCheckpointRefs.length === 1 ? "" : "s"}.`
        : "No voice callout requested by the current packet.",
      meta: currentWakeResultForOperator?.wakeResultId ?? "wake result pending",
      state: currentWakeResultForOperator?.status === "completed"
        ? "done"
        : currentAskTurnId
          ? "pending"
          : blockedBeforeAsk
            ? "blocked"
            : "missing",
      payloads: resultPayloads,
    },
  ];
  const recentPackets = packets.slice(-6);
  const deckRows = STAGE_PLAY_DECK_ROLES.map((role) => {
    const run = latestStagePlayRunForPacket(runs, role, latestPacket);
    const activePrompt = activeMicroReasonerPromptForRole(prompts, role);
    const selectedPresetPromptId = selectedMicroReasonerPromptPreset?.rolePromptIds[role] ?? null;
    const selectedPresetPrompt = selectedPresetPromptId
      ? prompts.find((prompt) => prompt.promptId === selectedPresetPromptId) ?? null
      : null;
    const prompt = selectedPresetPrompt ?? activePrompt;
    const promptedBySelectedPreset = Boolean(
      selectedMicroReasonerPromptPreset?.promptedRoles.includes(role) ||
        selectedPresetPromptId,
    );
    return {
      role,
      run,
      prompt,
      promptedBySelectedPreset,
      selectedPresetPromptMissing: Boolean(selectedPresetPromptId && !selectedPresetPrompt),
      display: MICRO_REASONER_DISPLAY[role],
    };
  });
  const microDeckClusters = STAGE_PLAY_MICRO_REASONER_ROLE_CLUSTERS.map((cluster) => ({
    ...cluster,
    rows: cluster.roles.map((role) => deckRows.find((row) => row.role === role)).filter(Boolean) as typeof deckRows,
  }));
  const selectedDeckRow = deckRows.find((row) => row.role === selectedMicroReasonerRole) ?? deckRows[0] ?? null;
  const selectedDeckPromptStatus = selectedDeckRow?.prompt
    ? !selectedDeckRow.promptedBySelectedPreset
      ? "inactive for selected preset"
      : selectedMicroPresetApplied
      ? "active prompt"
      : "available prompt"
    : selectedDeckRow?.selectedPresetPromptMissing
      ? "apply preset to load"
      : "prompt missing";
  const selectedDeckPromptTemplate = selectedDeckRow?.prompt?.template ?? "";
  const microReasonerPromptChanged = Boolean(
    selectedDeckRow?.prompt &&
      microReasonerPromptDraft.trim() &&
      microReasonerPromptDraft.trim() !== selectedDeckPromptTemplate.trim()
  );
  useEffect(() => {
    setMicroReasonerPromptDraft(selectedDeckPromptTemplate);
    setMicroDeckSaveStatus({ state: "idle", message: "" });
  }, [selectedDeckPromptTemplate, selectedDeckRow?.role]);
  const microDeckEvidenceWiringWidgets = useMemo(
    () => buildMicroDeckEvidenceWiringWidgets(latestPacket, microDeckSourceId),
    [latestPacket, microDeckSourceId],
  );
  const handleAppendMicroDeckEvidenceWiring = (widget: MicroDeckEvidenceWiringWidget) => {
    if (!selectedDeckRow?.prompt || widget.disabledReason) return;
    setMicroReasonerPromptDraft((draft) => appendMicroDeckEvidenceWiring(draft, widget.block));
    setMicroDeckSaveStatus({
      state: "idle",
      message: "Evidence handle wiring appended to the draft. Save As to attach it as a custom deck.",
    });
  };
  const askHandoffCount = wakeRequests.filter((wake) => wake.askTurnId || wake.status === "running").length;
  const queueRows: StagePlayFlowQueueRow[] = [
    {
      key: "capture-shade",
      label: "visual capture queue",
      from: "source",
      to: "shade mail",
      count: mailItems.length,
      bytes: latestMail?.summary.text.length ?? 0,
      ageMs: mailAgeMs,
      status: latestMail ? labelize(latestMail.status) : "pending",
      tone: latestMail ? "done" : captureStateTone === "blocked" ? "blocked" : "pending",
    },
    {
      key: "shade-deck",
      label: "reasoner input queue",
      from: "shade mail",
      to: "micro deck",
      count: latestPacketRuns.length || runs.length,
      bytes: runChars,
      ageMs: latestPacket ? packetAgeMs : mailAgeMs,
      status: latestPacketRuns.length || runs.length ? "binding" : "waiting",
      tone: latestPacketRuns.some((run) => run.status === "failed") ? "blocked" : latestPacketRuns.length || runs.length ? "active" : "pending",
    },
    {
      key: "deck-packet",
      label: "packet output queue",
      from: "micro deck",
      to: "packet",
      count: packets.length,
      bytes: packetChars,
      ageMs: packetAgeMs,
      status: latestPacket ? labelize(latestPacket.recommendedNext) : "not processed",
      tone: latestPacket ? latestPacket.arbiter?.wakeAsk ? "active" : "done" : "pending",
    },
    {
      key: "packet-wake",
      label: "interrupt admission queue",
      from: "packet",
      to: "interrupt",
      count: wakeRequests.length,
      bytes: compactPacketChars,
      ageMs: latestWake ? Date.now() - new Date(latestWake.updatedAt).getTime() : null,
      status: labelize(wakeLifecycleStage ?? wakeStatus),
      tone: stagePlayWakeLifecycleTone(wakeLifecycleStage, wakeStatus) === "blocked" ? "blocked" : latestWake ? "active" : "pending",
    },
    {
      key: "wake-ask",
      label: "Ask handoff queue",
      from: "wake",
      to: "Ask",
      count: askHandoffCount,
      bytes: currentAskTurnId ? currentAskTurnId.length : 0,
      ageMs: currentWakeForOperator ? Date.now() - new Date(currentWakeForOperator.updatedAt).getTime() : null,
      status: blockedBeforeAsk ? "blocked before Ask" : currentAskTurnId ? "entered" : "waiting",
      tone: blockedBeforeAsk ? "blocked" : currentAskTurnId ? "done" : liveOverviewPendingWake ? "active" : "pending",
    },
    {
      key: "ask-output",
      label: "decision / voice queue",
      from: "Ask",
      to: "operator",
      count: wakeResults.length,
      bytes: voiceCheckpointRefs.join("").length,
      ageMs: currentWakeResultForOperator ? Date.now() - new Date(currentWakeResultForOperator.createdAt).getTime() : null,
      status: voiceStatusLabel,
      tone: currentWakeResultForOperator?.status === "completed"
        ? "done"
        : currentWakeResultForOperator?.status?.includes("failed")
          ? "blocked"
          : voiceRequested
            ? "active"
            : "pending",
    },
  ];
  const mailById = new Map(mailItems.map((mail) => [mail.mailId, mail]));
  const wakeResultsByWakeId = new Map<string, StagePlayLiveSourceMailWakeResultV1[]>();
  for (const result of wakeResults) {
    const bucket = wakeResultsByWakeId.get(result.wakeRequestId) ?? [];
    bucket.push(result);
    wakeResultsByWakeId.set(result.wakeRequestId, bucket);
  }
  const packetMailIdSet = new Set(packets.flatMap((packet) => packet.mailIds));
  const buildReasonerTrafficRuns = (
    packet: StagePlayProcessedMailPacketV1 | null,
    mailIds: string[],
  ): StagePlayPacketTrafficReasonerRun[] => {
    const rolesForPacket = stagePlayDeckRolesForPacket(packet);
    const scopedRuns = runs.filter((run) => {
      if (packet?.microReasonerRunRefs.includes(run.runId)) return true;
      return run.mailIds.some((mailId) => mailIds.includes(mailId));
    });
    return rolesForPacket.map((role) => {
      const run =
        (packet ? latestStagePlayRunForPacket(scopedRuns, role, packet) : null) ??
        scopedRuns.filter((entry) => entry.role === role).at(-1) ??
        null;
      return {
        runId: run?.runId ?? `${packet?.packetId ?? mailIds[0] ?? "mail"}:${role}:missing`,
        role,
        status: run?.status ?? "missing",
        promptId: run?.promptId ?? null,
        deckExecutionMode: run?.deckExecutionMode ?? null,
        deckProductRole: run?.deckProductRole ?? false,
        inputPreview: run?.inputPreview ?? null,
        outputPreview: run?.outputPreview ?? MICRO_REASONER_DISPLAY[role].missingPreview,
        latencyMs: run?.latencyMs ?? null,
        refs: uniqueSorted([...(run?.inputRefs ?? []), ...(run?.outputRefs ?? []), ...(run ? [run.runId] : [])]),
      };
    });
  };
  const stationStatusForDeck = (reasonerRuns: StagePlayPacketTrafficReasonerRun[]): StagePlayPacketTrafficStationStatus => {
    const productRuns = reasonerRuns.filter((run) => run.deckProductRole);
    if (productRuns.some((run) => run.status === "completed")) return "complete";
    if (productRuns.some((run) => run.status === "running" || run.status === "queued")) return "running";
    if (productRuns.some((run) => run.status === "failed")) return "failed";
    if (reasonerRuns.some((run) => run.status === "failed")) return "failed";
    if (reasonerRuns.some((run) => run.status === "running" || run.status === "queued")) return "running";
    if (reasonerRuns.some((run) => run.status === "completed")) return "complete";
    return "pending";
  };
  const buildPacketTrafficRow = (packet: StagePlayProcessedMailPacketV1): StagePlayPacketTrafficViewV1 => {
    const mailIds = packet.mailIds;
    const primaryMail = mailIds.map((mailId) => mailById.get(mailId)).find(Boolean) ?? null;
    const reasonerRuns = buildReasonerTrafficRuns(packet, mailIds);
    const deck = stagePlayDeckSnapshotForPacket(packet);
    const deckStatus = stationStatusForDeck(reasonerRuns);
    const wake = wakeRequests
      .filter((candidate) => candidate.mailIds.some((mailId) => mailIds.includes(mailId)))
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .at(-1) ?? null;
    const wakeResult = wake
      ? latestStagePlayMailWakeResult(wakeResultsByWakeId.get(wake.wakeRequestId) ?? [], wake.wakeRequestId)
      : null;
    const decisionIds = new Set([...(wake?.decisionIds ?? []), ...(wakeResult?.decisionIds ?? [])]);
    const decision = decisions.filter((entry) => decisionIds.has(entry.decisionId)).at(-1) ?? null;
    const voiceRefs = wakeResult?.voiceCheckpointRefs ?? [];
    const supersededWakeIds = uniqueSorted([
      ...(wake?.supersededWakeIds ?? []),
      ...(wakeResult?.supersededWakeIds ?? []),
    ]);
    const wakeFailure = wakeResult?.failedReason ?? wakeResult?.skippedReason ?? wake?.failureReason ?? null;
    const packetVoiceRequested =
      packet.recommendedNext === "request_voice_callout" ||
      packet.arbiter?.recommendedNext === "request_voice_callout" ||
      decision?.decision === "request_voice_callout";
    const askStatus: StagePlayPacketTrafficStationStatus = wake?.askTurnId || wakeResult?.askTurnId
      ? "complete"
      : wake?.status === "deferred_for_pressure" || wakeResult?.status === "deferred_for_pressure"
        ? "deferred"
        : wake?.status === "failed_retryable" || wakeResult?.status === "failed_retryable" || wakeResult?.status === "failed_terminal"
          ? "failed"
          : wake
            ? "running"
            : packet.arbiter?.wakeAsk
              ? "pending"
              : "skipped";
    const decisionStatus: StagePlayPacketTrafficStationStatus = decision
      ? "complete"
      : askStatus === "failed" || askStatus === "deferred"
        ? askStatus
        : wake
          ? "pending"
          : "skipped";
    const outputStatus: StagePlayPacketTrafficStationStatus = voiceRefs.length > 0 || wakeResult?.status === "completed"
      ? "complete"
      : packetVoiceRequested
        ? "pending"
        : decision
          ? "skipped"
          : "pending";
    const loopStatus: StagePlayPacketTrafficStationStatus =
      askStatus === "failed" || decisionStatus === "failed"
        ? "failed"
        : askStatus === "deferred" || decisionStatus === "deferred"
          ? "deferred"
          : outputStatus === "complete" || packet.recommendedNext === "wait_for_next_summary"
            ? "complete"
            : "running";
    const trafficStatus: StagePlayPacketTrafficViewV1["status"] =
      loopStatus === "failed"
        ? "failed"
        : loopStatus === "deferred"
          ? "deferred"
          : voiceRefs.length > 0
            ? "voice_done"
            : packetVoiceRequested && outputStatus !== "complete"
              ? "voice_pending"
              : decision
                ? "decision_recorded"
                : wake?.askTurnId || wakeResult?.askTurnId
                  ? "ask_running"
                  : wake
                    ? "ask_pending"
                    : deckStatus === "running"
                      ? "deck_running"
                      : deckStatus === "complete"
                        ? packet.arbiter?.wakeAsk ? "deck_complete" : "ask_skipped"
                        : "packet_ready";
    const packetDeckMs = reasonerRuns.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0);
    const packetRunChars = jsonCharCount(reasonerRuns.filter((run) => run.status !== "missing"));
    const packetRawMailChars = mailIds.reduce((sum, mailId) => sum + (mailById.get(mailId)?.summary.text.length ?? 0), 0);
    const packetCompactChars = jsonCharCount({
      packetId: packet.packetId,
      mailIds: packet.mailIds,
      observedFacts: packet.observedFacts.slice(0, 4),
      changedFacts: packet.changedFacts.slice(0, 4),
      effort: packet.effortEstimate,
      axioms: packet.axioms,
      hypotheses: packet.hypotheses?.slice(0, 4) ?? [],
      arbiter: packet.arbiter,
      recommendedNext: packet.recommendedNext,
      watchNext: packet.watchNext.slice(0, 4),
    });
    const packetArbiterChars = jsonCharCount({
      packetId: packet.packetId,
      effort: packet.effortEstimate?.currentEffort ?? "unknown",
      arbiter: packet.arbiter,
      recommendedNext: packet.recommendedNext,
      evidenceRefs: packet.evidenceRefs.slice(0, 10),
    });
    const goalId = primaryMail?.objective?.objectiveId || "workstation_goal_context";
    const packetDispatchActions: WorkstationDispatchActionV1[] = [
      { kind: "log_receipt", receiptRef: primaryMail?.mailId ?? packet.packetId },
      { kind: "append_goal_context", goalId },
      { kind: "update_panel", panelId: "stage-play-badge-graph" },
    ];
    if (packetVoiceRequested) {
      packetDispatchActions.push({ kind: "speak_narrator", mode: "confirm" });
    }
    if (packet.arbiter?.wakeAsk) {
      packetDispatchActions.push({
        kind: "wake_agent",
        interruptKind: "urgent",
        reason: packet.arbiter.reason ?? "micro-reasoner marked this packet as interruption-worthy",
      });
    }
    const packetGoalContextUpdate: WorkstationGoalContextUpdateV1 = {
      schemaVersion: WORKSTATION_GOAL_CONTEXT_UPDATE_SCHEMA,
      updateId: `workstation_goal_context_update:${packet.packetId}`,
      createdAtMs: stagePlayIsoMs(packet.createdAt),
      sourceRefs: uniqueSorted([packet.sourceId, primaryMail?.sourceId, visualSource?.sourceId].filter(Boolean) as string[]),
      loopRefs: uniqueSorted([
        "stage_play_mail_loop:desktop",
        packet.microReasonerDeck?.presetId ?? null,
        ...reasonerRuns.map((run) => run.runId),
      ].filter(Boolean) as string[]),
      producerKind: "microdeck",
      updateKind: packetVoiceRequested ? "suggested_action" : "visual_observation",
      contentRef: packet.packetId,
      preview: compactStagePlayText(
        packet.arbiter?.reason ??
          packet.observedFacts.slice(0, 3).join("; ") ??
          primaryMail?.summary.preview,
        "Processed packet available for goal context.",
        180,
      ),
      evidenceRefs: uniqueSorted([...packet.evidenceRefs, ...reasonerRuns.flatMap((run) => run.refs)]),
      receiptRefs: uniqueSorted([primaryMail?.mailId ?? null, wake?.wakeRequestId ?? null, wakeResult?.wakeResultId ?? null].filter(Boolean) as string[]),
      freshness: {
        observedAtMs: stagePlayIsoMs(packet.createdAt),
        staleAfterMs: 30_000,
        status: primaryMail?.hints.sourceFreshness === "stale" ? "stale" : "fresh",
      },
      goalRelevance: {
        goalId,
        relevance: packet.salience.score ?? 0,
        reason: packet.salience.reasons.slice(0, 3).join("; ") || labelize(packet.recommendedNext),
      },
      suggestedDispatch: packetDispatchActions,
      authority: {
        assistantAnswer: false,
        terminalEligible: false,
        rawContentIncluded: false,
        postToolModelStepRequired: true,
      },
    };
    const stationStates: StagePlayPacketTrafficStationState[] = [
      {
        station: "visual_source",
        status: captureStateTone === "blocked" ? "failed" : captureStateTone === "good" ? "complete" : "running",
        preview: `${visualSource?.sourceId ?? "visual source"}: ${captureStateLabel}`,
        refs: visualSource?.sourceId ? [visualSource.sourceId] : [],
        completedAt: primaryMail?.createdAt ?? null,
      },
      {
        station: "observer_shades",
        status: primaryMail ? "complete" : "pending",
        preview: compactStagePlayMailPreview(primaryMail?.summary.preview ?? primaryMail?.summary.text, "Observer shade pending.", 90),
        refs: primaryMail?.evidenceRefs ?? [],
        completedAt: primaryMail?.createdAt ?? null,
      },
      {
        station: "raw_mail",
        status: primaryMail ? "complete" : "pending",
        preview: `${mailIds.length} mail item${mailIds.length === 1 ? "" : "s"} | ${formatStagePlayCount(packetRawMailChars)} chars`,
        refs: mailIds,
        completedAt: primaryMail?.createdAt ?? null,
      },
      {
        station: "processed_packet",
        status: "complete",
        preview: `${labelize(packet.recommendedNext)} | ${labelize(packet.salience.level)}`,
        refs: [packet.packetId, ...packet.evidenceRefs],
        completedAt: packet.createdAt,
      },
      {
        station: "micro_reasoner_deck",
        status: deckStatus,
        preview: `${stagePlayPacketDeckTitle(deck)} | ${stagePlayPacketDeckRunPlan(deck)} | ${reasonerRuns.filter((run) => run.status === "completed").length}/${reasonerRuns.length} complete${reasonerRuns.some((run) => run.deckProductRole && run.status === "completed") ? " | product ready" : ""}`,
        refs: reasonerRuns.flatMap((run) => run.refs),
        durationMs: packetDeckMs,
      },
      {
        station: "ask_handoff",
        status: askStatus,
        preview: wake
          ? `${labelize(wake.lifecycleStage ?? wake.status)} interrupt | ${wake.askTurnId ?? "no Ask turn"}`
          : packet.arbiter?.wakeAsk
            ? "Interrupt requested; admission pending."
            : "No interrupt dispatch; packet remains goal context.",
        refs: wake ? [wake.wakeRequestId, ...wake.evidenceRefs] : [],
        completedAt: wake?.updatedAt ?? wakeResult?.createdAt ?? null,
      },
      {
        station: "decision",
        status: decisionStatus,
        preview: decision
          ? `${labelize(decision.decision)} | ${compactStagePlayText(decision.rationalePreview, "rationale pending", 70)}`
          : wakeFailure
            ? compactStagePlayText(wakeFailure, "Decision blocked.", 90)
            : "Decision pending or not required.",
        refs: decision ? [decision.decisionId, ...decision.evidenceRefs] : [...decisionIds],
        completedAt: decision?.createdAt ?? null,
      },
      {
        station: "output",
        status: outputStatus,
        preview: voiceRefs.length > 0
          ? `${voiceRefs.length} voice checkpoint ref${voiceRefs.length === 1 ? "" : "s"}`
          : packetVoiceRequested
            ? "Voice requested, receipt pending."
            : wakeResult?.status === "completed"
              ? "Interrupt result completed."
              : "No output required yet.",
        refs: voiceRefs,
        completedAt: wakeResult?.createdAt ?? null,
      },
      {
        station: "loop_state",
        status: loopStatus,
        preview: packet.watchNext.length > 0
          ? compactStagePlayText(packet.watchNext.slice(0, 3).join(" | "), "Loop armed for next observation.", 100)
          : loopStatus === "deferred"
            ? `Deferred: ${runtimePressureLabel}`
            : "Loop armed for next observation.",
        refs: uniqueSorted([...packet.evidenceRefs, ...(wakeResult?.evidenceRefs ?? [])]),
        completedAt: wakeResult?.createdAt ?? packet.createdAt,
      },
    ];
    return {
      packetKey: packet.packetId,
      colorKey: packet.packetId || mailIds[0] || wake?.wakeRequestId || "packet",
      mailIds,
      packetId: packet.packetId,
      wakeRequestId: wake?.wakeRequestId ?? null,
      askTurnId: wake?.askTurnId ?? wakeResult?.askTurnId ?? null,
      decisionId: decision?.decisionId ?? null,
      voiceReceiptId: voiceRefs[0] ?? null,
      sourceId: primaryMail?.sourceId ?? visualSource?.sourceId ?? null,
      observerProfileId: latestPolicy?.observerProfileId ?? null,
      observerProfileTitle: latestPolicy?.observerProfileTitle ?? null,
      deck,
      deckVerdict: {
        recommendedNext: packet.arbiter?.recommendedNext ?? packet.recommendedNext,
        wakeAsk: packet.arbiter?.wakeAsk ?? false,
        voiceCandidate: packet.arbiter?.voiceCandidate ?? packet.salience.voiceCandidate ?? false,
        reason: packet.arbiter?.reason ?? null,
      },
      coalescing: {
        supersededWakeIds,
        label: supersededWakeIds.length > 0
          ? `superseded ${supersededWakeIds.length} older interrupt${supersededWakeIds.length === 1 ? "" : "s"}; latest same-source packet wins`
          : null,
      },
      status: trafficStatus,
      stationStates,
      microReasonerRuns: reasonerRuns,
      goalContextUpdates: [packetGoalContextUpdate],
      dispatchActions: packetDispatchActions,
      metrics: {
        mailAgeMs: ageMsFromIso(primaryMail?.createdAt),
        packetAgeMs: ageMsFromIso(packet.createdAt),
        deckMs: packetDeckMs,
        rawMailChars: packetRawMailChars,
        packetChars: jsonCharCount(packet),
        compactChars: packetCompactChars,
        arbiterChars: packetArbiterChars,
        deckChars: packetRunChars,
        heapMb: runtimeAdmission?.memory?.heapUsedMiB ?? null,
        rssMb: runtimeAdmission?.memory?.rssMiB ?? null,
        pressure: runtimePressureLabel,
        rolesPerPacket: mailLoopWorkBudget?.usage?.rolesPerPacket ?? null,
        estimatedDeckCallsPerMinute: mailLoopWorkBudget?.usage?.estimatedDeckCallsPerMinute ?? null,
        reasonerRunsPerMinute: mailLoopWorkBudget?.usage?.reasonerRunsPerMinute ?? null,
        estimatedReasonerLoad: mailLoopWorkBudget?.pressure?.estimatedReasonerLoad ?? null,
        activePacketLoad: mailLoopWorkBudget?.pressure?.packetLoad ?? null,
        queueLoad: mailLoopWorkBudget?.pressure?.queueLoad ?? null,
      },
    };
  };
  const buildMailOnlyTrafficRow = (mail: StagePlayLiveSourceMailItemV1): StagePlayPacketTrafficViewV1 => ({
    packetKey: mail.mailId,
    colorKey: mail.mailId,
    mailIds: [mail.mailId],
    packetId: null,
    wakeRequestId: null,
    askTurnId: null,
    decisionId: null,
    voiceReceiptId: null,
    sourceId: mail.sourceId,
    observerProfileId: latestPolicy?.observerProfileId ?? null,
    observerProfileTitle: latestPolicy?.observerProfileTitle ?? null,
    deck: null,
    deckVerdict: {
      recommendedNext: null,
      wakeAsk: false,
      voiceCandidate: false,
      reason: null,
    },
    coalescing: {
      supersededWakeIds: [],
      label: null,
    },
    status: "mail_received",
    stationStates: [
      {
        station: "visual_source",
        status: captureStateTone === "blocked" ? "failed" : "complete",
        preview: `${visualSource?.sourceId ?? mail.sourceId}: ${captureStateLabel}`,
        refs: visualSource?.sourceId ? [visualSource.sourceId] : [mail.sourceId],
        completedAt: mail.createdAt,
      },
      {
        station: "observer_shades",
        status: "complete",
        preview: compactStagePlayMailPreview(mail.summary.preview || mail.summary.text, "Observer shade captured.", 90),
        refs: mail.evidenceRefs,
        completedAt: mail.createdAt,
      },
      {
        station: "raw_mail",
        status: "complete",
        preview: `${labelize(mail.status)} | ${formatStagePlayCount(mail.summary.text.length)} chars`,
        refs: [mail.mailId, ...mail.evidenceRefs],
        completedAt: mail.createdAt,
      },
      {
        station: "processed_packet",
        status: "pending",
        preview: "Packet not composed yet.",
        refs: [mail.mailId],
      },
      {
        station: "micro_reasoner_deck",
        status: "pending",
        preview: "Deck waiting for packet.",
        refs: [],
      },
      {
        station: "ask_handoff",
        status: "skipped",
        preview: "No interrupt dispatch until packet exists.",
        refs: [],
      },
      {
        station: "decision",
        status: "skipped",
        preview: "No packet decision yet.",
        refs: [],
      },
      {
        station: "output",
        status: "skipped",
        preview: "No output yet.",
        refs: [],
      },
      {
        station: "loop_state",
        status: "running",
        preview: "Waiting for micro-reasoner deck.",
        refs: [mail.mailId],
      },
    ],
    microReasonerRuns: buildReasonerTrafficRuns(null, [mail.mailId]),
    goalContextUpdates: [],
    dispatchActions: [{ kind: "log_receipt", receiptRef: mail.mailId }],
    metrics: {
      mailAgeMs: ageMsFromIso(mail.createdAt),
      packetAgeMs: null,
      deckMs: null,
      rawMailChars: mail.summary.text.length,
      packetChars: null,
      compactChars: null,
      arbiterChars: null,
      deckChars: null,
      heapMb: runtimeAdmission?.memory?.heapUsedMiB ?? null,
      rssMb: runtimeAdmission?.memory?.rssMiB ?? null,
      pressure: runtimePressureLabel,
      rolesPerPacket: mailLoopWorkBudget?.usage?.rolesPerPacket ?? null,
      estimatedDeckCallsPerMinute: mailLoopWorkBudget?.usage?.estimatedDeckCallsPerMinute ?? null,
      reasonerRunsPerMinute: mailLoopWorkBudget?.usage?.reasonerRunsPerMinute ?? null,
      estimatedReasonerLoad: mailLoopWorkBudget?.pressure?.estimatedReasonerLoad ?? null,
      activePacketLoad: mailLoopWorkBudget?.pressure?.packetLoad ?? null,
      queueLoad: mailLoopWorkBudget?.pressure?.queueLoad ?? null,
    },
  });
  const packetTrafficRows = [
    ...packets.slice(-8).map((packet) => ({
      sortAt: packet.createdAt,
      row: buildPacketTrafficRow(packet),
    })),
    ...mailItems
      .filter((mail) => !packetMailIdSet.has(mail.mailId))
      .slice(-4)
      .map((mail) => ({
        sortAt: mail.createdAt,
        row: buildMailOnlyTrafficRow(mail),
      })),
  ]
    .sort((left, right) => right.sortAt.localeCompare(left.sortAt))
    .map((entry) => entry.row)
    .slice(0, 8);
  const packetTrafficIds = packetTrafficRows.map((row) => row.packetKey).join("\n");
  const defaultPacketTrafficKey = latestPacket?.packetId ?? latestMail?.mailId ?? packetTrafficRows[0]?.packetKey ?? null;
  useEffect(() => {
    if (selectedPacketTrafficKey && packetTrafficRows.some((row) => row.packetKey === selectedPacketTrafficKey)) return;
    setSelectedPacketTrafficKey(defaultPacketTrafficKey);
  }, [defaultPacketTrafficKey, packetTrafficIds, selectedPacketTrafficKey]);
  const derivedGoalContextUpdates = packetTrafficRows.flatMap((row) => row.goalContextUpdates);
  const goalContextUpdates = [
    ...(mailbox?.goalContextUpdates ?? []),
    ...derivedGoalContextUpdates,
  ]
    .filter((update, index, list) =>
      list.findIndex((candidate) => candidate.updateId === update.updateId) === index
    )
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
  const agentGoalSessions = mailbox?.agentGoalSessions ?? [];
  const trafficDetails: StagePlayTrafficDetail[] = [
    ...mailItems.slice(-5).reverse().map((mail): StagePlayTrafficDetail => ({
      id: mail.mailId,
      label: mail.mailId.split(":").at(-1)?.slice(0, 12) ?? "mail",
      station: "Shade mail",
      status: labelize(mail.status),
      state: mail.status === "unread" ? "active" : "done",
      summary: compactStagePlayText(mail.summary.text || mail.summary.preview, "No visual-source mail summary was recorded.", 900),
      meta: `${formatStagePlayClock(mail.createdAt)} | ${mail.sourceId}`,
      rows: [
        { label: "source", value: mail.sourceId },
        { label: "freshness", value: mail.hints.sourceFreshness },
        { label: "analysis", value: labelize(mail.summary.analysisState) },
        { label: "confidence", value: String(mail.summary.confidence ?? "n/a"), tone: mail.summary.confidence >= 0.7 ? "good" : "warn" },
        { label: "mail age", value: mail.mailId === latestMail?.mailId ? formatStagePlayMs(mailAgeMs) : formatStagePlayClock(mail.createdAt) },
      ],
      evidenceRefs: mail.evidenceRefs,
    })),
    ...packets.slice(-5).reverse().map((packet): StagePlayTrafficDetail => ({
      id: packet.packetId,
      label: packet.packetId.split(":").at(-1)?.slice(0, 12) ?? "packet",
      station: "Processed packet",
      status: labelize(packet.recommendedNext),
      state: packet.arbiter?.wakeAsk || packet.recommendedNext !== "wait_for_next_summary" ? "active" : "done",
      summary: compactStagePlayText(packet.arbiter?.reason || formatStagePlayDeckVerdictForOverview(packet), "Packet verdict pending.", 900),
      meta: `${formatStagePlayClock(packet.createdAt)} | ${formatStagePlayCount(jsonCharCount(packet))} chars`,
      rows: [
        { label: "effort", value: labelize(packet.effortEstimate?.currentEffort ?? "unknown") },
        { label: "interrupt ask", value: packet.arbiter?.wakeAsk ? "true" : "false", tone: packet.arbiter?.wakeAsk ? "warn" : "good" },
        { label: "arbiter", value: labelize(packet.arbiter?.recommendedNext ?? packet.recommendedNext) },
        { label: "confidence", value: String(packet.arbiter?.confidence ?? "n/a") },
        { label: "mail ids", value: String(packet.mailIds.length) },
        { label: "hypotheses", value: String(packet.hypotheses?.length ?? 0) },
      ],
      evidenceRefs: uniqueSorted([...packet.evidenceRefs, ...packet.mailIds, ...(packet.microReasonerRunRefs ?? [])]),
    })),
    ...wakeRequests.slice(-6).reverse().map((wake): StagePlayTrafficDetail => ({
      id: wake.wakeRequestId,
      label: wake.wakeRequestId.split(":").at(-1)?.slice(0, 12) ?? "interrupt",
      station: "Interrupt queue",
      status: labelize(wake.lifecycleStage ?? wake.status),
      state: wake.status === "completed"
        ? "done"
        : wake.status === "deferred_for_pressure" || wake.status === "failed_retryable"
          ? "blocked"
          : wake.status === "running"
            ? "active"
            : "pending",
      summary: compactStagePlayText(wake.failureReason ?? wake.reason, "Interrupt is queued for Ask admission.", 900),
      meta: `${formatStagePlayClock(wake.updatedAt)} | ${wake.askTurnId ?? "no Ask turn"}`,
      rows: [
        { label: "status", value: labelize(wake.status), tone: wake.status === "deferred_for_pressure" ? "blocked" : "default" },
        { label: "lifecycle", value: labelize(wake.lifecycleStage ?? "n/a") },
        { label: "Ask id", value: wake.askTurnId ?? "none", tone: wake.askTurnId ? "good" : "warn" },
        { label: "next retry", value: wake.nextRetryAt ? formatStagePlayClock(wake.nextRetryAt) : "none" },
        { label: "mail ids", value: String(wake.mailIds.length) },
        { label: "decisions", value: String(wake.decisionIds.length) },
      ],
      evidenceRefs: uniqueSorted([...wake.evidenceRefs, ...wake.mailIds, ...wake.decisionIds]),
    })),
    ...wakeRequests
      .filter((wake) => wake.askTurnId || wake.status === "running")
      .slice(-5)
      .reverse()
      .map((wake): StagePlayTrafficDetail => ({
        id: `${wake.wakeRequestId}:ask`,
        label: wake.askTurnId?.split(":").at(-1)?.slice(0, 12) ?? "Ask handoff",
        station: "Helix Ask handoff",
        status: wake.askTurnId ? "Ask entered" : "launching",
        state: wake.askTurnId ? "done" : "active",
        summary: wake.askTurnId
          ? "Structured mailbox route metadata is attached to the Ask turn."
          : "Interrupt dispatch is running but the Ask turn id is not visible yet.",
        meta: wake.askTurnId ?? wake.wakeRequestId,
        rows: [
          { label: "interrupt", value: wake.wakeRequestId },
          { label: "Ask id", value: wake.askTurnId ?? "none", tone: wake.askTurnId ? "good" : "warn" },
          { label: "required source", value: "live_source_mailbox" },
          { label: "required tool", value: "live_env.read_live_source_mail" },
        ],
        evidenceRefs: uniqueSorted([...wake.evidenceRefs, ...wake.mailIds, ...wake.decisionIds]),
      })),
    ...wakeResults.slice(-5).reverse().map((result): StagePlayTrafficDetail => ({
      id: result.wakeResultId,
      label: result.wakeResultId.split(":").at(-1)?.slice(0, 12) ?? "result",
      station: "Decision / voice / final",
      status: labelize(result.lifecycleStage ?? result.status),
      state: result.status === "completed"
        ? "done"
        : result.status === "deferred_for_pressure" || result.status === "failed_retryable" || result.status === "failed_terminal"
          ? "blocked"
          : "pending",
      summary: compactStagePlayText(
        result.failedReason ?? result.skippedReason ?? `${result.decisionIds.length} decision(s), ${result.voiceCheckpointRefs?.length ?? 0} voice checkpoint ref(s).`,
        "Interrupt result pending.",
        900,
      ),
      meta: `${formatStagePlayClock(result.createdAt)} | ${result.askTurnId ?? "no Ask turn"}`,
      rows: [
        { label: "status", value: labelize(result.status), tone: result.status === "completed" ? "good" : result.status.includes("failed") ? "blocked" : "default" },
        { label: "lifecycle", value: labelize(result.lifecycleStage ?? "n/a") },
        { label: "Ask id", value: result.askTurnId ?? "none" },
        { label: "decisions", value: String(result.decisionIds.length) },
        { label: "voice refs", value: String(result.voiceCheckpointRefs?.length ?? 0) },
        { label: "budget ref", value: result.budgetStateRef ?? "none" },
      ],
      evidenceRefs: uniqueSorted([...result.evidenceRefs, ...(result.voiceCheckpointRefs ?? []), ...result.decisionIds]),
    })),
  ];
  const trafficDetailIds = trafficDetails.map((detail) => detail.id).join("\n");
  const defaultTrafficPayloadId =
    blockedBeforeAsk
      ? currentWakeForOperator?.wakeRequestId ?? latestPacket?.packetId ?? latestMail?.mailId ?? null
      : currentAskTurnId && currentWakeForOperator
        ? `${currentWakeForOperator.wakeRequestId}:ask`
        : latestPacket?.packetId ?? latestMail?.mailId ?? currentWakeResultForOperator?.wakeResultId ?? null;
  useEffect(() => {
    if (selectedTrafficPayloadId && trafficDetails.some((detail) => detail.id === selectedTrafficPayloadId)) return;
    setSelectedTrafficPayloadId(defaultTrafficPayloadId ?? trafficDetails[0]?.id ?? null);
  }, [defaultTrafficPayloadId, selectedTrafficPayloadId, trafficDetailIds]);
  const selectedTrafficDetail =
    trafficDetails.find((detail) => detail.id === selectedTrafficPayloadId) ??
    trafficDetails.find((detail) => detail.id === defaultTrafficPayloadId) ??
    trafficDetails[0] ??
    null;
  const unifiedTrace = useMemo(
    () => buildStagePlayMailLoopUnifiedTrace({ graph, mailbox }),
    [graph, mailbox],
  );
  const selectedPacketTrace = useMemo(
    () => buildStagePlayPacketScopedTrace({ graph, mailbox, packetKey: selectedPacketTrafficKey }),
    [graph, mailbox, selectedPacketTrafficKey],
  );
  const selectedWakeTrace = useMemo(
    () => buildStagePlayWakeScopedTrace({
      graph,
      mailbox,
      wakeRequestId: selectedPacketTrace.wake?.wakeRequestId ?? latestWake?.wakeRequestId ?? null,
    }),
    [graph, latestWake?.wakeRequestId, mailbox, selectedPacketTrace.wake?.wakeRequestId],
  );
  const selectedAskDebugTrace = useMemo(
    () => buildStagePlayAskDebugTrace({
      graph,
      mailbox,
      wakeRequestId: selectedWakeTrace.wakeRequestId,
    }),
    [graph, mailbox, selectedWakeTrace.wakeRequestId],
  );
  const markDebugCopied = (state: typeof debugCopyState) => {
    setDebugCopyState(state);
    if (debugCopyResetTimerRef.current) window.clearTimeout(debugCopyResetTimerRef.current);
    debugCopyResetTimerRef.current = window.setTimeout(() => setDebugCopyState("idle"), 1800);
  };
  const handleCopyUnifiedTrace = () => {
    void copyStagePlayText(JSON.stringify(unifiedTrace, null, 2), "stage-play.copy_mail_loop_unified_trace")
      .then((copied) => { if (copied) markDebugCopied("trace"); });
  };
  const handleCopyPacketTrace = () => {
    void copyStagePlayText(JSON.stringify(selectedPacketTrace, null, 2), "stage-play.copy_mail_loop_packet_trace")
      .then((copied) => { if (copied) markDebugCopied("packet"); });
  };
  const handleCopyWakeTrace = () => {
    void copyStagePlayText(JSON.stringify(selectedWakeTrace, null, 2), "stage-play.copy_mail_loop_wake_trace")
      .then((copied) => { if (copied) markDebugCopied("wake"); });
  };
  const handleCopyAskDebugTrace = () => {
    void copyStagePlayText(JSON.stringify(selectedAskDebugTrace, null, 2), "stage-play.copy_mail_loop_ask_debug")
      .then((copied) => { if (copied) markDebugCopied("ask"); });
  };
  const handleCopyFullMailbox = async () => {
    const fullMailbox = await fetchStagePlayLiveSourceMail({
      threadId: STAGE_PLAY_PANEL_THREAD_ID,
      mailboxThreadId: STAGE_PLAY_PANEL_THREAD_ID,
      view: "full",
      limit: 50,
    }).catch(() => mailbox ?? null);
    const copied = await copyStagePlayText(JSON.stringify({
      schema: "helix.stage_play.mail_loop_full_mailbox_capture.v1",
      exportedAt: new Date().toISOString(),
      graphId: graph.graphId,
      mailbox: fullMailbox,
    }, null, 2), "stage-play.copy_mail_loop_full_state");
    if (copied) markDebugCopied("full");
  };

  useEffect(() => () => {
    if (debugCopyResetTimerRef.current) window.clearTimeout(debugCopyResetTimerRef.current);
  }, []);

  useEffect(() => {
    if (!wakeBridgeEligible || !latestWake) return;
    const memory = readStagePlayWakeBridgeMemory();
    const now = Date.now();
    if (!shouldAutoLaunchStagePlayWakeBridge({
      wake: latestWake,
      memory,
      now,
    })) return;
    launchStagePlayWakeInHelixAsk({
      wake: latestWake,
      mailItems,
      processedPacket: latestPacket,
      wakeResult: latestWakeResult,
      bridgeReason: wakeBridgeReason,
    });
    writeStagePlayWakeBridgeMemory(markStagePlayWakeBridgeLaunched(memory, latestWake.wakeRequestId, now));
  }, [
    latestPacket?.packetId,
    latestWake?.wakeRequestId,
    latestWakeResult?.wakeResultId,
    latestWakeResult?.status,
    mailItems,
    wakeBridgeEligible,
    wakeBridgeReason,
  ]);

  const handleOpenWakeInAsk = () => {
    if (!latestWake) return;
    launchStagePlayWakeInHelixAsk({
      wake: latestWake,
      mailItems,
      processedPacket: latestPacket,
      wakeResult: latestWakeResult,
      bridgeReason: "operator opened queued interrupt from Stage Play mail-loop UI",
    });
    const memory = readStagePlayWakeBridgeMemory();
    writeStagePlayWakeBridgeMemory(markStagePlayWakeBridgeLaunched(memory, latestWake.wakeRequestId, Date.now()));
  };

  const handleDismissWake = async (wakeRequestId: string) => {
    if (dismissingWakeId) return;
    setDismissingWakeId(wakeRequestId);
    try {
      await dismissStagePlayLiveSourceMailWake({ wakeRequestId, reason: "operator_dismissed" });
      const memory = readStagePlayWakeBridgeMemory();
      if (memory.launchedWakeIds.includes(wakeRequestId)) {
        const launchedWakeAtById = { ...memory.launchedWakeAtById };
        delete launchedWakeAtById[wakeRequestId];
        writeStagePlayWakeBridgeMemory({
          launchedWakeIds: memory.launchedWakeIds.filter((id) => id !== wakeRequestId),
          launchedWakeAtById,
          lastLaunchedAt: memory.lastLaunchedAt,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STAGE_PLAY_MAILBOX_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: STAGE_PLAY_TRANSCRIPT_QUERY_KEY }),
      ]);
    } catch (error) {
      console.warn("[stage-play] wake dismiss failed", error);
    } finally {
      setDismissingWakeId(null);
    }
  };

  const handleApplyMicroReasonerPreset = async () => {
    if (!selectedMicroReasonerPromptPreset) {
      setMicroDeckApplyStatus({ state: "failed", message: "MicroDeck preset is not available." });
      return;
    }
    if (!microDeckSourceId) {
      setMicroDeckApplyStatus({ state: "failed", message: "No live visual source is available for this MicroDeck preset." });
      return;
    }
    setMicroDeckApplyStatus({ state: "applying", message: `Applying ${selectedMicroReasonerPromptPreset.title} to ${microDeckSourceId}.` });
    try {
      const response = await applyStagePlayMicroReasonerPromptPreset({
        presetId: selectedMicroReasonerPromptPreset.presetId,
        sourceIds: [microDeckSourceId],
      });
      await queryClient.invalidateQueries({ queryKey: STAGE_PLAY_MAILBOX_QUERY_KEY });
      setMicroDeckApplyStatus({
        state: "applied",
        message: `${response.preset?.title ?? selectedMicroReasonerPromptPreset.title} applied. Future processed-mail packets will use this deck.`,
      });
    } catch (error) {
      setMicroDeckApplyStatus({
        state: "failed",
        message: error instanceof Error ? error.message : "micro_reasoner_prompt_preset_apply_failed",
      });
    }
  };

  const handleSaveCustomMicroReasonerPreset = async () => {
    if (!selectedDeckRow?.prompt) {
      setMicroDeckSaveStatus({ state: "failed", message: "Select a MicroReasoner prompt before saving a custom deck." });
      return;
    }
    if (!microReasonerPromptChanged) return;
    const template = microReasonerPromptDraft.trim();
    if (!template) {
      setMicroDeckSaveStatus({ state: "failed", message: "Custom MicroReasoner prompt cannot be empty." });
      return;
    }
    if (!microDeckSourceId) {
      setMicroDeckSaveStatus({ state: "failed", message: "No live source is available for this custom MicroDeck." });
      return;
    }
    const baseTitle = selectedMicroReasonerPromptPreset?.title ?? activeMicroReasonerPromptPreset?.title ?? "MicroDeck";
    const title = `Custom ${selectedDeckRow.display.title}`;
    setMicroDeckSaveStatus({ state: "saving", message: `Saving ${title} from ${baseTitle}.` });
    try {
      const response = await createStagePlayCustomMicroReasonerPromptPreset({
        title,
        description: `Browser-session custom MicroDeck based on ${baseTitle}; overrides ${selectedDeckRow.display.title}.`,
        basePresetId: selectedMicroReasonerPromptPreset?.presetId ?? activeMicroReasonerPromptPreset?.presetId ?? null,
        role: selectedDeckRow.role,
        template,
        sourceIds: [microDeckSourceId],
        promptedRoles: selectedMicroReasonerPromptPreset?.promptedRoles ?? activeMicroReasonerPromptPreset?.promptedRoles ?? [],
      });
      if (response.preset) {
        rememberStagePlayCustomMicroDeckPreset(response.preset);
        setSelectedMicroPresetId(response.preset.presetId);
      }
      await queryClient.invalidateQueries({ queryKey: STAGE_PLAY_MAILBOX_QUERY_KEY });
      setMicroDeckSaveStatus({
        state: "saved",
        message: `${response.preset?.title ?? title} saved and attached to ${microDeckSourceId}.`,
      });
    } catch (error) {
      setMicroDeckSaveStatus({
        state: "failed",
        message: error instanceof Error ? error.message : "custom_micro_reasoner_prompt_preset_save_failed",
      });
    }
  };

  return (
    <section
      className="mb-5 space-y-4 rounded-md border border-slate-800 bg-slate-950/80 p-4"
      data-testid="stage-play-mail-loop-live-overview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Live Mail Loop</div>
          <div className="mt-1 text-lg font-semibold text-slate-50">
            {latestPacket?.effortEstimate?.currentEffort ? labelize(latestPacket.effortEstimate.currentEffort) : "Waiting for current effort"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {latestPacket?.arbiter?.reason ?? "Waiting for the first mail packet to decide whether an Ask interrupt is needed."}
          </div>
          {latestWake ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenWakeInAsk}
                disabled={!wakeBridgeEligible}
                className={`rounded border px-3 py-1.5 text-[10px] font-semibold ${
                  wakeBridgeEligible
                    ? "border-cyan-600 bg-cyan-950/35 text-cyan-100 hover:border-cyan-300"
                    : "border-slate-800 bg-slate-950 text-slate-500"
                }`}
                data-testid="stage-play-open-wake-in-ask"
                title={wakeBridgeButtonTitle}
              >
                {wakeBridgeButtonLabel}
              </button>
              <span className="font-mono text-[10px] text-slate-500">
                {latestWake.wakeRequestId}
              </span>
              {isDismissibleStagePlayWakeRequest(latestWake) ? (
                <button
                  type="button"
                  onClick={() => void handleDismissWake(latestWake.wakeRequestId)}
                  disabled={dismissingWakeId === latestWake.wakeRequestId}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-950 text-slate-400 hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Dismiss queued interrupt"
                  title="Dismiss this queued interrupt"
                  data-testid="stage-play-dismiss-latest-wake"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPacketTrace}
              disabled={!selectedPacketTrace.processedPacket && selectedPacketTrace.rawVisualMail.length === 0}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="stage-play-copy-mail-loop-packet-trace"
              title="Copy the selected packet trace from raw mail through deck, interrupt dispatch, Ask, decision, voice, and continuation state."
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy packet trace
            </button>
            <button
              type="button"
              onClick={handleCopyWakeTrace}
              disabled={!selectedWakeTrace.wakeRequestId}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="stage-play-copy-mail-loop-wake-trace"
              title="Copy the selected interrupt trace, including wake request ids and interrupt results."
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy interrupt trace
            </button>
            <button
              type="button"
              onClick={handleCopyAskDebugTrace}
              disabled={!selectedAskDebugTrace.wakeRequestId}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="stage-play-copy-mail-loop-ask-debug"
              title="Copy the mailbox projection of Ask debug for this interrupt."
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy Ask debug
            </button>
            <button
              type="button"
              onClick={handleCopyUnifiedTrace}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
              data-testid="stage-play-copy-mail-loop-unified-trace"
              title="Copy compact mailbox traffic trace, including paths that never reached Helix Ask."
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy unified trace
            </button>
            <button
              type="button"
              onClick={() => void handleCopyFullMailbox()}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
              data-testid="stage-play-copy-mail-loop-full-state"
              title="Copy the full mailbox API projection for deep debugging."
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy full state
            </button>
            <span className="text-[10px] text-slate-500" data-testid="stage-play-mail-loop-debug-copy-state">
              {debugCopyState === "trace"
                ? "unified trace copied"
                : debugCopyState === "packet"
                  ? "packet trace copied"
                : debugCopyState === "wake"
                  ? "interrupt trace copied"
                : debugCopyState === "ask"
                  ? "Ask debug copied"
                : debugCopyState === "full"
                  ? "full mailbox copied"
                  : "debug covers pre-Ask and final-answer paths"}
            </span>
          </div>
        </div>
      </div>

      <StagePlayTrafficHeader
        cadenceMs={cadenceMs}
        mailAgeMs={mailAgeMs}
        packetAgeMs={packetAgeMs}
        deckLatencyMs={deckLatencyMs}
        wakeLabel={labelize(wakeLifecycleStage ?? wakeStatus)}
        wakeTone={stagePlayWakeLifecycleTone(wakeLifecycleStage, wakeStatus)}
        runtimePressureLabel={runtimePressureLabel}
        unreadCount={mailItems.filter((mail) => mail.status === "unread").length}
        retainedCount={mailItems.length}
        heapRamLabel={heapRamLabel}
        rssRamLabel={rssRamLabel}
        pressureTone={combinedRuntimeTone}
        workBudgetLabel={workBudgetLabel}
        workBudgetTone={workBudgetTone}
        deckBudgetLabel={deckBudgetLabel}
      />

      <StagePlayPacketTrafficBoard
        traffic={packetTrafficRows}
        selectedPacketKey={selectedPacketTrafficKey}
        onSelectPacket={setSelectedPacketTrafficKey}
        workBudget={mailLoopWorkBudget}
      />

      <StagePlayGoalContextBoard
        updates={goalContextUpdates}
        sessions={agentGoalSessions}
      />

      <section
        id="stage-play-microdeck-panel"
        className="rounded-md border border-cyan-900/60 bg-slate-950/80 p-3 scroll-mt-4"
        data-testid="stage-play-microdeck-panel"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">MicroReasoner Deck</div>
            <div className="mt-1 text-sm font-semibold text-slate-50">
              {activeMicroReasonerPromptPreset?.title ?? "Generic MicroDeck"}
            </div>
            <div className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
              Source {microDeckSourceId ?? "pending"} uses this prompt deck for future processed-mail packets. Squares show the role assembly; selecting one opens the prompt currently available for that role.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="stage-play-microdeck-preset-select">
              MicroReasoner prompt preset
            </label>
            <select
              id="stage-play-microdeck-preset-select"
              aria-label="MicroReasoner prompt preset"
              value={selectedMicroReasonerPromptPreset?.presetId ?? ""}
              onChange={(event) => setSelectedMicroPresetId(event.currentTarget.value)}
              disabled={microReasonerPromptPresets.length === 0}
              className="min-w-[18rem] rounded border border-cyan-300/30 bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {microReasonerPresetGroups.length === 0 ? (
                <option value="">No MicroDeck presets loaded</option>
              ) : (
                microReasonerPresetGroups.map((group) => (
                  <optgroup key={group.category} label={`${group.category} source`}>
                    {group.presets.map((preset) => {
                      const applied = appliedMicroReasonerPresetIds.has(preset.presetId);
                      return (
                        <option key={preset.presetId} value={preset.presetId}>
                          {applied ? "[applied] " : ""}{microReasonerPresetOptionLabel(preset)}
                        </option>
                      );
                    })}
                  </optgroup>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => void handleApplyMicroReasonerPreset()}
              disabled={!selectedMicroReasonerPromptPreset || selectedMicroPresetApplied || microDeckApplyStatus.state === "applying"}
              className={`rounded border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                selectedMicroPresetApplied
                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                  : "border-cyan-300/30 text-cyan-100 hover:bg-cyan-400/10"
              }`}
              aria-label="Apply selected MicroReasoner prompt preset"
            >
              {microDeckApplyStatus.state === "applying"
                ? "Applying"
                : selectedMicroPresetApplied
                  ? "Selected deck applied"
                  : "Apply selected deck"}
            </button>
          </div>
        </div>

        {selectedMicroReasonerPromptPreset ? (
          <div className="mt-3 rounded border border-cyan-300/15 bg-black/20 px-3 py-2 text-xs leading-relaxed text-cyan-100">
            {selectedMicroReasonerPromptPreset.description}
            <span className="ml-2 font-mono text-[10px] text-cyan-200/70">
              {selectedMicroReasonerPromptPreset.promptedRoles.length} prompted role{selectedMicroReasonerPromptPreset.promptedRoles.length === 1 ? "" : "s"} | {selectedMicroReasonerPromptPreset.outputPolicy}
            </span>
          </div>
        ) : null}
        {appliedMicroDecks.length > 0 ? (
          <div
            className="mt-3 rounded border border-emerald-300/20 bg-emerald-950/10 p-2"
            data-testid="stage-play-applied-microdeck-checklist"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-100">Applied deck checklist</div>
              <div className="font-mono text-[10px] text-emerald-100/70">{appliedMicroDecks.length} applied</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {appliedMicroDecks.map((entry) => {
                const color = packetTrailColor(entry.colorKey);
                return (
                  <div
                    key={stagePlayAppliedDeckKey(entry.presetId, entry.sourceId, entry.reason)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded border bg-slate-950/70 px-2 py-1 text-[10px] text-slate-100"
                    style={{ borderColor: color.border, boxShadow: color.glow }}
                    title={`${entry.title} | ${entry.sourceId ?? "source pending"} | ${entry.reason}`}
                    data-circuit-color-hsl={color.hsl}
                    data-circuit-color-key={entry.colorKey}
                    data-deck-preset-id={entry.presetId}
                    data-source-ref={entry.sourceId ?? "source pending"}
                    data-testid="stage-play-applied-microdeck-chip"
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.hsl }} aria-hidden="true" />
                    <span className="max-w-[16rem] truncate font-semibold">{entry.title}</span>
                    <span className="font-mono text-[9px] text-slate-400">{entry.reason}</span>
                    <span className="max-w-[12rem] truncate font-mono text-[9px] text-emerald-100/70">
                      color={compactStagePlayCircuitRef(entry.colorKey)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {microDeckApplyStatus.message ? (
          <div className={`mt-2 rounded border px-3 py-2 text-[11px] ${
            microDeckApplyStatus.state === "failed"
              ? "border-rose-800 bg-rose-950/25 text-rose-100"
              : microDeckApplyStatus.state === "applied"
                ? "border-emerald-800 bg-emerald-950/20 text-emerald-100"
                : "border-cyan-800 bg-cyan-950/20 text-cyan-100"
          }`}>
            {microDeckApplyStatus.message}
          </div>
        ) : null}
        {latestMicroReasonerPromptToolActivity ? (
          <div
            className={`mt-2 rounded border px-3 py-2 text-[11px] ${
              latestMicroReasonerPromptToolActivity.status === "failed"
                ? "border-rose-800 bg-rose-950/25 text-rose-100"
                : latestMicroReasonerPromptToolActivity.status === "running"
                  ? "border-cyan-700 bg-cyan-950/25 text-cyan-100"
                  : "border-emerald-900 bg-emerald-950/15 text-emerald-100"
            }`}
            data-testid="stage-play-microdeck-tool-activity"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Tool activity: {labelize(latestMicroReasonerPromptToolActivity.action)} {labelize(latestMicroReasonerPromptToolActivity.status)}
              </span>
              <span className="font-mono text-[10px] opacity-75">
                {formatStagePlayClock(latestMicroReasonerPromptToolActivity.updatedAt)}
              </span>
            </div>
            <div className="mt-1 text-[10px] opacity-80">
              {latestMicroReasonerPromptToolActivity.summary}
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
          <div className="space-y-3">
            {microDeckClusters.map((cluster) => (
              <div key={cluster.key}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cluster.title}</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {cluster.rows.map(({ role, run, prompt, display, promptedBySelectedPreset, selectedPresetPromptMissing }) => {
                    const selected = selectedDeckRow?.role === role;
                    const roleLoaded = Boolean(prompt);
                    const inactiveForPreset = selectedMicroReasonerPromptPreset && !promptedBySelectedPreset;
                    const roleBoundToLatestPacket = Boolean(run && latestPacket?.microReasonerRunRefs.includes(run.runId));
                    const roleColorStyle = roleBoundToLatestPacket && !inactiveForPreset
                      ? {
                          borderColor: latestPacketColor.border,
                          boxShadow: selected ? latestPacketColor.glow : undefined,
                          background: selected ? latestPacketColor.background : undefined,
                        }
                      : undefined;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setSelectedMicroReasonerRole(role)}
                        className={`min-h-[112px] rounded-md border p-3 text-left transition ${
                          inactiveForPreset
                            ? selected
                              ? "border-slate-600 bg-slate-950/95 opacity-80 ring-1 ring-slate-700"
                              : "border-slate-900 bg-black/35 opacity-45 hover:opacity-65"
                            : selected
                            ? "border-cyan-300 bg-cyan-950/35"
                            : promptedBySelectedPreset
                              ? "border-cyan-800 bg-cyan-950/15 hover:border-cyan-500"
                              : "border-slate-800 bg-slate-950/65 hover:border-slate-600"
                        }`}
                        style={roleColorStyle}
                        aria-pressed={selected}
                        data-testid="stage-play-microdeck-role-square"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {roleBoundToLatestPacket && !inactiveForPreset ? (
                              <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-cyan-100">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: latestPacketColor.hsl }} aria-hidden="true" />
                                packet color match
                              </div>
                            ) : null}
                            <div className={`truncate text-xs font-semibold ${inactiveForPreset ? "text-slate-500" : "text-slate-100"}`}>{display.title}</div>
                            <div className={`mt-0.5 truncate text-[10px] ${inactiveForPreset ? "text-slate-700" : "text-slate-500"}`}>{display.subtitle}</div>
                          </div>
                          <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                            inactiveForPreset
                              ? "border-slate-800 text-slate-600"
                              : run?.status === "completed"
                              ? "border-emerald-800 text-emerald-100"
                              : run
                                ? "border-amber-800 text-amber-100"
                                : roleLoaded
                                  ? "border-cyan-800 text-cyan-100"
                                  : "border-slate-700 text-slate-400"
                          }`}>
                            {inactiveForPreset ? "inactive" : run?.status ?? (roleLoaded ? "ready" : "missing")}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1 text-[9px]">
                          <span className={`rounded border border-slate-800 px-1.5 py-1 ${inactiveForPreset ? "text-slate-700" : "text-slate-400"}`}>{inactiveForPreset ? "off" : formatStagePlayMs(run?.latencyMs)}</span>
                          <span className={`rounded border border-slate-800 px-1.5 py-1 ${inactiveForPreset ? "text-slate-700" : "text-slate-400"}`}>{formatStagePlayCount(jsonCharCount(prompt?.template ?? ""))} prompt</span>
                          <span className={`rounded border border-slate-800 px-1.5 py-1 ${inactiveForPreset ? "text-slate-700" : "text-slate-400"}`}>{promptedBySelectedPreset ? "preset" : "inactive"}</span>
                        </div>
                        <div className={`mt-2 line-clamp-2 text-[10px] leading-snug ${inactiveForPreset ? "text-slate-700" : "text-slate-400"}`}>
                          {inactiveForPreset
                            ? "Not used by the selected preset."
                            : selectedPresetPromptMissing
                            ? "Apply this preset to load its source-bound template."
                            : prompt?.title ?? run?.outputPreview ?? display.missingPreview}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-slate-800 bg-black/25 p-3" data-testid="stage-play-microdeck-prompt-inspector">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Prompt Inspector</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-50">
                  {selectedDeckRow?.display.title ?? "Select a role"}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {selectedDeckPromptStatus} | {selectedDeckRow?.role ?? "none"}
                </div>
              </div>
              <div className="rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-300">
                {selectedDeckRow?.run?.modelUsed ?? selectedDeckRow?.prompt?.modelPreference ?? "model pending"}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <StagePlayMetricPill label="prompt chars" value={formatStagePlayCount(jsonCharCount(selectedDeckRow?.prompt?.template ?? ""))} />
              <StagePlayMetricPill label="output chars" value={formatStagePlayCount((selectedDeckRow?.run?.outputPreview ?? "").length)} />
            </div>
            <div className="mt-3 rounded border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Prompt</div>
              <div
                className="mt-2 rounded border border-cyan-900/40 bg-cyan-950/10 p-2"
                data-testid="stage-play-microdeck-evidence-wiring"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200">Evidence wiring</div>
                  <div className="max-w-full truncate font-mono text-[9px] text-cyan-200/70">
                    {latestPacket?.packetId ?? "packet pending"}
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {microDeckEvidenceWiringWidgets.map((widget) => {
                    const disabled = !selectedDeckRow?.prompt || Boolean(widget.disabledReason);
                    return (
                      <button
                        key={widget.key}
                        type="button"
                        onClick={() => handleAppendMicroDeckEvidenceWiring(widget)}
                        disabled={disabled}
                        className="flex min-h-[42px] items-center gap-2 rounded border border-cyan-900/50 bg-slate-950/70 px-2 py-1.5 text-left text-cyan-100 hover:border-cyan-400 hover:bg-cyan-950/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600 disabled:opacity-60"
                        aria-label={`Append ${widget.label} evidence wiring`}
                        title={widget.disabledReason ?? `Append ${widget.label} evidence wiring to the prompt draft`}
                        data-testid={`stage-play-microdeck-evidence-widget-${widget.key}`}
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-[10px] font-semibold">{widget.label}</span>
                          <span className="block truncate font-mono text-[9px] text-cyan-200/65">{widget.summary}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedDeckRow?.prompt ? (
                <textarea
                  value={microReasonerPromptDraft}
                  onChange={(event) => setMicroReasonerPromptDraft(event.currentTarget.value)}
                  className="mt-2 min-h-[280px] w-full resize-y rounded border border-slate-800 bg-black/30 p-2 font-mono text-[10px] leading-4 text-slate-300 outline-none focus:border-cyan-500"
                  aria-label="MicroReasoner prompt draft"
                  spellCheck={false}
                />
              ) : (
                <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-slate-300">
                  {selectedDeckRow?.selectedPresetPromptMissing
                    ? "This preset maps the role to a template that is not in the current source-bound mailbox projection yet. Apply the preset, then the prompt will refresh here."
                    : "Prompt missing for this role."}
                </pre>
              )}
            </div>
            <div className="mt-3 rounded border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Latest Output</div>
              <div className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                {selectedDeckRow?.run?.outputPreview ?? selectedDeckRow?.display.missingPreview ?? "No run output yet."}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
              <div className="text-[10px] leading-relaxed text-slate-500">
                Custom decks are saved to this browser session and attached to the active live source.
              </div>
              {microReasonerPromptChanged ? (
                <button
                  type="button"
                  onClick={() => void handleSaveCustomMicroReasonerPreset()}
                  disabled={microDeckSaveStatus.state === "saving"}
                  className="rounded border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {microDeckSaveStatus.state === "saving" ? "Saving" : "Save As"}
                </button>
              ) : null}
            </div>
            {microDeckSaveStatus.message ? (
              <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
                microDeckSaveStatus.state === "failed"
                  ? "border-rose-800 bg-rose-950/25 text-rose-100"
                  : microDeckSaveStatus.state === "saved"
                    ? "border-emerald-800 bg-emerald-950/20 text-emerald-100"
                    : "border-cyan-800 bg-cyan-950/20 text-cyan-100"
              }`}>
                {microDeckSaveStatus.message}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <details className="rounded-md border border-slate-800 bg-black/20 p-3" data-testid="stage-play-mail-loop-diagnostics">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Diagnostics: queue, Ask handoff, selected packet, packet history, prompts
        </summary>
        <div className="mt-3 space-y-3">
          <StagePlayMailJourneyRail
            stations={mailTransformSteps}
            deckRows={deckRows}
            payloadChars={latestMail?.summary.text.length ?? 0}
            packetChars={packetChars}
            deckLatencyMs={deckLatencyMs}
            deckRuntimeLabel={deckRuntimeLabel}
            combinedRuntimeTone={combinedRuntimeTone}
            selectedPayloadId={selectedTrafficDetail?.id ?? selectedTrafficPayloadId}
            onSelectPayload={setSelectedTrafficPayloadId}
          />

          <div className="rounded-md border border-slate-800 bg-black/20 p-3" data-testid="stage-play-mail-loop-packet-profile">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Packet profile</div>
                <div className="mt-0.5 text-xs text-slate-500">Compact size, latency, pressure, and deck budget for the current packet.</div>
              </div>
              <div className="font-mono text-[10px] text-slate-500">{latestPacket?.packetId ?? "packet pending"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
              <StagePlayMetricPill label="raw mail chars" value={formatStagePlayCount(latestMail?.summary.text.length ?? 0)} />
              <StagePlayMetricPill label="packet chars" value={formatStagePlayCount(packetChars)} />
              <StagePlayMetricPill label="compact ask chars" value={formatStagePlayCount(compactPacketChars)} tone={compactPacketChars <= 4000 ? "good" : "warn"} />
              <StagePlayMetricPill label="arbiter chars" value={formatStagePlayCount(arbiterChars)} tone={arbiterChars <= 1500 ? "good" : "warn"} />
              <StagePlayMetricPill label="deck ms" value={formatStagePlayMs(deckLatencyMs)} tone={deckLatencyMs <= 1000 ? "good" : deckLatencyMs <= cadenceMs ? "warn" : "blocked"} />
              <StagePlayMetricPill label="deck chars" value={formatStagePlayCount(runChars)} tone={runChars > compactPacketChars * 3 ? "warn" : "default"} />
              <StagePlayMetricPill label="heap ram" value={heapRamLabel} tone={stagePlayRuntimeTone(heapRamPercent, runtimePressureLevel)} />
              <StagePlayMetricPill label="rss ram" value={rssRamLabel} tone={stagePlayRuntimeTone(rssRamPercent, runtimePressureLevel)} />
              <StagePlayMetricPill label="pressure" value={runtimePressureLabel} tone={combinedRuntimeTone} />
              <StagePlayMetricPill label="reasoners" value={`${latestPacketRuns.length || runs.length} runs`} />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <StagePlaySelectedTrafficDetail detail={selectedTrafficDetail} />
        <div className="rounded-md border border-slate-800 bg-black/25 p-3" data-testid="stage-play-mail-loop-operator-queue">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Operator queue</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {blockedBeforeAsk
                  ? "Blocked before Ask"
                  : currentAskTurnId
                    ? "Ask route entered"
                    : liveOverviewPendingWake
                      ? "Interrupt waiting"
                      : "Queue clear"}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">{currentWakeSummary}</div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-[10px] sm:w-auto sm:min-w-[320px] sm:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                <div className="uppercase tracking-wide text-slate-500">Ask id</div>
                <div className="mt-0.5 truncate font-mono text-slate-200">{currentAskTurnId ?? "none"}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                <div className="uppercase tracking-wide text-slate-500">voice</div>
                <div className="mt-0.5 truncate font-mono text-slate-200">{voiceStatusLabel}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                <div className="uppercase tracking-wide text-slate-500">heap</div>
                <div className="mt-0.5 truncate font-mono text-slate-200">{heapRamLabel}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                <div className="uppercase tracking-wide text-slate-500">rss</div>
                <div className="mt-0.5 truncate font-mono text-slate-200">{rssRamLabel}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className={`rounded-md border p-3 ${
              blockedBeforeAsk
                ? "border-rose-800 bg-rose-950/20"
                : currentAskTurnId
                  ? "border-emerald-800 bg-emerald-950/15"
                  : "border-slate-800 bg-slate-950/50"
            }`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Handoff</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {blockedBeforeAsk ? "Blocked before Ask" : currentAskTurnId ? "Ask route entered" : "Waiting for route entry"}
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Blocker</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">
                {blockedBeforeAsk
                  ? `Reason: ${currentWakeFailure ?? runtimePressureLabel}. Ask stayed unstarted.`
                  : currentAskTurnId
                    ? "Ask has an id; final-answer debug export can be collected from that turn."
                    : "No pressure blocker is visible for the current route state."}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pressure / voice</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">{runtimePressureLabel}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">
                Voice checkpoint: {voiceStatusLabel}. {voiceCheckpointRefs.length > 0
                  ? `${voiceCheckpointRefs.length} voice/hold/block receipt reference(s) recorded.`
                  : voiceRequested
                    ? "The packet requested voice, but no voice/hold/block receipt is visible for this interrupt."
                    : "No voice callout is requested for this route."}
              </div>
            </div>
            <div className="rounded-md border border-emerald-900/60 bg-emerald-950/15 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Last completed interrupt</div>
              <div className="mt-1 text-sm font-semibold text-emerald-50">
                {liveOverviewCompletedWake
                  ? labelize(liveOverviewCompletedWakeResult?.lifecycleStage ?? liveOverviewCompletedWake.lifecycleStage ?? liveOverviewCompletedWakeResult?.status ?? liveOverviewCompletedWake.status)
                  : "none yet"}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-emerald-200/70">
                {liveOverviewCompletedWake?.wakeRequestId ?? "no completed interrupt receipt"}
              </div>
            </div>
            <div className="rounded-md border border-amber-900/60 bg-amber-950/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Current pending/deferred interrupt</div>
                {isDismissibleStagePlayWakeRequest(liveOverviewPendingWake) ? (
                  <button
                    type="button"
                    onClick={() => void handleDismissWake(liveOverviewPendingWake.wakeRequestId)}
                    disabled={dismissingWakeId === liveOverviewPendingWake.wakeRequestId}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-amber-700/50 bg-amber-950/30 text-amber-100 hover:border-rose-400 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Dismiss pending interrupt"
                    title="Dismiss this pending interrupt"
                    data-testid="stage-play-dismiss-pending-wake"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="mt-1 text-sm font-semibold text-amber-50">
                {liveOverviewPendingWake
                  ? labelize(liveOverviewPendingWakeResult?.lifecycleStage ?? liveOverviewPendingWake.lifecycleStage ?? liveOverviewPendingWakeResult?.status ?? liveOverviewPendingWake.status)
                  : "clear"}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-amber-200/70">
                {liveOverviewPendingWake?.wakeRequestId ?? "no unresolved interrupt"}
              </div>
            </div>
          </div>
          {dismissibleWakeRequests.length > 0 ? (
            <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/55 p-2.5" data-testid="stage-play-dismissible-wake-list">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Queued interrupt controls</div>
                <div className="font-mono text-[9px] text-slate-500">{dismissibleWakeRequests.length} clearable</div>
              </div>
              <div className="space-y-1.5">
                {dismissibleWakeRequests.map((wake) => (
                  <div key={wake.wakeRequestId} className="flex items-center gap-2 rounded border border-slate-800 bg-black/20 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] text-slate-200">{wake.wakeRequestId}</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">
                        {labelize(wake.lifecycleStage ?? wake.status)} | {wake.mailIds.length} mail | {formatStagePlayClock(wake.updatedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDismissWake(wake.wakeRequestId)}
                      disabled={dismissingWakeId === wake.wakeRequestId}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-950 text-slate-400 hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label={`Dismiss interrupt ${wake.wakeRequestId}`}
                      title="Dismiss this queued interrupt"
                      data-testid="stage-play-dismiss-queued-wake"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

          <StagePlayFlowQueueColumn
            rows={queueRows}
            deckRuntimeLabel={deckRuntimeLabel}
            combinedRuntimeTone={combinedRuntimeTone}
          />

      <div className="rounded-md border border-slate-800 bg-black/25 p-3" data-testid="stage-play-mail-loop-operator-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ask handoff status</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {blockedBeforeAsk
                ? "Blocked before Ask"
                : currentAskTurnId
                  ? "Ask route entered"
                  : "Waiting for route entry"}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">{currentWakeSummary}</div>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
            <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
              <div className="uppercase tracking-wide text-slate-500">Ask turn</div>
              <div className="mt-0.5 truncate font-mono text-slate-200">{currentAskTurnId ?? "none"}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
              <div className="uppercase tracking-wide text-slate-500">debug export</div>
              <div className="mt-0.5 font-mono text-slate-200">{currentAskTurnId ? "available by turn id" : "no Ask debug"}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
              <div className="uppercase tracking-wide text-slate-500">voice</div>
              <div className="mt-0.5 truncate font-mono text-slate-200">{voiceStatusLabel}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
              <div className="uppercase tracking-wide text-slate-500">pressure</div>
              <div className="mt-0.5 truncate font-mono text-slate-200">{runtimePressureLabel}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className={`rounded-md border p-3 ${
            blockedBeforeAsk
              ? "border-rose-800 bg-rose-950/20"
              : currentAskTurnId
                ? "border-emerald-800 bg-emerald-950/15"
                : "border-slate-800 bg-slate-950/50"
          }`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Blocking reason</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {blockedBeforeAsk ? "Blocked before Ask" : currentWakeFailure ? labelize(currentWakeFailure) : "No active blocker"}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              {blockedBeforeAsk
                ? `Reason: ${currentWakeFailure ?? runtimePressureLabel}. Ask turn was not started.`
                : currentAskTurnId
                  ? "Ask has an id, so final-answer debug export can be collected from the Ask turn."
                  : "No pressure blocker is visible for the current route state."}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pressure admission</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {labelize(runtimeAdmission?.action ?? mailbox?.wakeAdmissionCycle?.status ?? "not sampled")}
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-400">
              <div>reason: {runtimeAdmission?.reason ?? mailbox?.wakeAdmissionCycle?.reason ?? "n/a"}</div>
              <div>heap: {heapRamLabel} ({Math.round(runtimeAdmission?.memory?.heapUsedMiB ?? 0)}MiB / {Math.round(runtimeAdmission?.limits?.maxHeapUsedMiB ?? 0)}MiB)</div>
              <div>rss: {rssRamLabel} ({Math.round(runtimeAdmission?.memory?.rssMiB ?? 0)}MiB / {Math.round(runtimeAdmission?.limits?.maxRssMiB ?? 0)}MiB)</div>
              <div>local bypass: {runtimeAdmission?.localBypass?.applied ? "applied" : runtimeAdmission?.localBypass?.reason ?? "not applied"}</div>
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voice checkpoint</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{voiceStatusLabel}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              {voiceCheckpointRefs.length > 0
                ? `${voiceCheckpointRefs.length} voice/hold/block receipt reference(s) recorded.`
                : voiceRequested
                  ? "The packet requested voice, but no voice/hold/block receipt is visible for this interrupt."
                  : "The latest packet did not request a voice callout."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-emerald-900/60 bg-emerald-950/15 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Last completed interrupt</div>
          <div className="mt-1 text-sm font-semibold text-emerald-50">
            {liveOverviewCompletedWake
              ? labelize(liveOverviewCompletedWakeResult?.lifecycleStage ?? liveOverviewCompletedWake.lifecycleStage ?? liveOverviewCompletedWakeResult?.status ?? liveOverviewCompletedWake.status)
              : "none yet"}
          </div>
          <div className="mt-1 font-mono text-[10px] text-emerald-200/70">
            {liveOverviewCompletedWake?.wakeRequestId ?? "no completed interrupt receipt"}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-emerald-100/80">
            {liveOverviewCompletedWake
              ? `Ask ${liveOverviewCompletedWakeResult?.askTurnId ?? liveOverviewCompletedWake.askTurnId ?? "not recorded"}; decisions ${(liveOverviewCompletedWakeResult?.decisionIds ?? liveOverviewCompletedWake.decisionIds).length}; evidence ${(liveOverviewCompletedWakeResult?.evidenceRefs ?? liveOverviewCompletedWake.evidenceRefs).length}.`
              : "No interrupt has completed with a decision/voice/hold/block checkpoint in this mailbox view."}
          </div>
        </div>
        <div className="rounded-md border border-amber-900/60 bg-amber-950/15 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Current pending/deferred interrupt</div>
          <div className="mt-1 text-sm font-semibold text-amber-50">
            {liveOverviewPendingWake
              ? labelize(liveOverviewPendingWakeResult?.lifecycleStage ?? liveOverviewPendingWake.lifecycleStage ?? liveOverviewPendingWakeResult?.status ?? liveOverviewPendingWake.status)
              : "clear"}
          </div>
          <div className="mt-1 font-mono text-[10px] text-amber-200/70">
            {liveOverviewPendingWake?.wakeRequestId ?? "no unresolved interrupt"}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-amber-100/80">
            {liveOverviewPendingWake
              ? `${labelize(liveOverviewPendingWakeResult?.status ?? liveOverviewPendingWake.status)}${liveOverviewPendingWakeResult?.failedReason || liveOverviewPendingWake.failureReason ? `; ${liveOverviewPendingWakeResult?.failedReason ?? liveOverviewPendingWake.failureReason}` : ""}${liveOverviewPendingWake.nextRetryAt ? `; retry ${formatStagePlayClock(liveOverviewPendingWake.nextRetryAt)}` : ""}.`
              : "No queued, running, retryable, or pressure-deferred interrupt is currently blocking the lane."}
          </div>
        </div>
      </div>

      <div className="hidden">
        <div className="rounded-md border border-slate-800 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Minecraft shade summary</div>
            <div className="font-mono text-[10px] text-slate-500">
              {latestMail?.mailId ?? "mail pending"} · {captureStateLabel}
            </div>
          </div>
          <div
            className="mt-2 min-h-[96px] rounded border border-slate-800 bg-slate-950 p-3 text-sm leading-relaxed text-slate-100"
            data-testid="stage-play-live-summary-textbox"
          >
            {compactStagePlayText(latestSummary, "Waiting for visual summary mail.", 720)}
          </div>
          <div className="mt-2 rounded border border-cyan-900/50 bg-cyan-950/15 p-2 text-xs leading-relaxed text-cyan-100">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-cyan-300/80">Processed deck verdict</div>
            {latestDeckVerdict}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StagePlayMetricPill label="diag raw mail chars" value={formatStagePlayCount(latestMail?.summary.text.length ?? 0)} />
          <StagePlayMetricPill label="diag packet chars" value={formatStagePlayCount(packetChars)} />
          <StagePlayMetricPill label="diag compact ask chars" value={formatStagePlayCount(compactPacketChars)} tone={compactPacketChars <= 4000 ? "good" : "warn"} />
          <StagePlayMetricPill label="diag arbiter chars" value={formatStagePlayCount(arbiterChars)} tone={arbiterChars <= 1500 ? "good" : "warn"} />
          <StagePlayMetricPill label="diag deck chars" value={formatStagePlayCount(runChars)} tone={runChars > compactPacketChars * 3 ? "warn" : "default"} />
          <StagePlayMetricPill label="diag deck ms" value={formatStagePlayMs(deckLatencyMs)} tone={deckLatencyMs <= 1000 ? "good" : deckLatencyMs <= cadenceMs ? "warn" : "blocked"} />
          <StagePlayMetricPill label="diag heap ram" value={heapRamLabel} tone={stagePlayRuntimeTone(heapRamPercent, runtimePressureLevel)} />
          <StagePlayMetricPill label="diag rss ram" value={rssRamLabel} tone={stagePlayRuntimeTone(rssRamPercent, runtimePressureLevel)} />
          <StagePlayMetricPill label="diag pressure" value={runtimePressureLabel} tone={combinedRuntimeTone} />
          <StagePlayMetricPill label="diag reasoners" value={`${latestPacketRuns.length || runs.length} runs`} />
        </div>
      </div>

      <div className="rounded-md border border-slate-800 bg-black/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Packet flow</div>
            <div className="mt-0.5 text-xs text-slate-500">latest packets arrive left to right; the deck below binds the selected/latest packet</div>
          </div>
          <div className="font-mono text-[10px] text-slate-500">{recentPackets.length} packet(s)</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(recentPackets.length, 1)}, minmax(180px, 1fr))` }}>
          {recentPackets.length > 0 ? recentPackets.map((packet) => {
            const active = packet.packetId === latestPacket?.packetId;
            const color = packetTrailColor(packet.packetId);
            return (
              <div
                key={packet.packetId}
                className={`rounded-md border p-3 ${
                  active
                    ? "border-cyan-500 bg-cyan-950/30"
                    : "border-slate-800 bg-slate-950/55"
                }`}
                style={{ borderColor: color.border, boxShadow: active ? color.glow : undefined }}
                data-testid="stage-play-packet-flow-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.hsl }} aria-hidden="true" />
                    <span className="truncate text-xs font-semibold text-slate-100">{labelize(packet.recommendedNext)}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{formatStagePlayClock(packet.createdAt)}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-[11px] text-slate-300">
                  {packet.effortEstimate?.currentEffort ? labelize(packet.effortEstimate.currentEffort) : "effort pending"}
                  {packet.arbiter?.wakeAsk ? " | interrupt Ask" : " | local wait"}
                </div>
                <div className="mt-2 h-1.5 rounded bg-slate-800">
                  <div
                    className="h-1.5 rounded"
                    style={{ backgroundColor: color.hsl, width: `${Math.min(100, Math.max(18, (packet.hypotheses?.length ?? 1) * 24))}%` }}
                  />
                </div>
                <div className="mt-2 font-mono text-[10px] text-slate-500">{formatStagePlayCount(jsonCharCount(packet))} chars</div>
              </div>
            );
          }) : (
            <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-500">No processed packet yet.</div>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-md border border-slate-800 bg-black/20 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deck synchrony</div>
          <div className="mt-2 text-sm text-slate-100">
            {latestPacket?.arbiter?.recommendedNext ? labelize(latestPacket.arbiter.recommendedNext) : "waiting for arbiter"}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-slate-400">
            The vertical deck shows independent micro-reasoner outputs for the current packet. Prompt text is visible on each row so prompt length can be compared with output size.
          </div>
          <div className="mt-3 space-y-1 font-mono text-[10px] text-slate-500">
            <div>packet: {latestPacket?.packetId ?? "pending"}</div>
            <div>selected hypothesis: {latestPacket?.arbiter?.selectedHypothesis ?? "none"}</div>
            <div>voice candidate: {latestPacket?.arbiter?.voiceCandidate ? "yes" : "no"}</div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="stage-play-micro-reasoner-deck">
          {deckRows.map(({ role, run, prompt, display }) => {
            const boundToLatestPacket = Boolean(run && latestPacket?.microReasonerRunRefs.includes(run.runId));
            const style = boundToLatestPacket
              ? { borderColor: latestPacketColor.border, boxShadow: latestPacketColor.glow }
              : undefined;
            return (
              <button
                key={role}
                type="button"
                className={`min-h-[160px] rounded-md border p-3 text-left ${
                  run
                    ? "border-slate-700 bg-slate-900/70 hover:border-cyan-500"
                    : prompt
                      ? "border-slate-800 bg-slate-950/70"
                      : "border-rose-900 bg-rose-950/20"
                }`}
                style={style}
                title={prompt?.template ?? "Prompt missing"}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {boundToLatestPacket ? (
                      <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-cyan-100">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: latestPacketColor.hsl }} aria-hidden="true" />
                        packet match
                      </div>
                    ) : null}
                    <div className="truncate text-xs font-semibold text-slate-100">{display.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">{display.subtitle}</div>
                  </div>
                  <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                    run?.status === "completed"
                      ? "border-emerald-800 text-emerald-100"
                      : run
                        ? "border-amber-800 text-amber-100"
                        : "border-slate-700 text-slate-400"
                  }`}>
                    {run?.status ?? "ready"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-[9px]">
                  <span className="rounded border border-slate-800 px-1.5 py-1 text-slate-400">{formatStagePlayMs(run?.latencyMs)}</span>
                  <span className="rounded border border-slate-800 px-1.5 py-1 text-slate-400">{formatStagePlayCount(jsonCharCount(prompt?.template ?? ""))} prompt</span>
                  <span className="rounded border border-slate-800 px-1.5 py-1 text-slate-400">{formatStagePlayCount((run?.outputPreview ?? "").length)} out</span>
                  <span
                    className={`rounded border px-1.5 py-1 ${
                      combinedRuntimeTone === "blocked"
                        ? "border-rose-800 text-rose-100"
                        : combinedRuntimeTone === "warn"
                          ? "border-amber-800 text-amber-100"
                          : "border-slate-800 text-slate-400"
                    }`}
                    title="Runtime RAM pressure is sampled for the shared server process that runs this micro-reasoner deck."
                  >
                    {deckRuntimeLabel}
                  </span>
                </div>
                <div className="mt-2 rounded border border-slate-800 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Output</span>
                    <span>{run?.deckProductRole ? "product" : run?.deckExecutionMode === "uses_prior_outputs" ? "chain" : "independent"}</span>
                  </div>
                  <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-200">
                    {run?.outputPreview ?? display.missingPreview}
                  </div>
                </div>
                <div className="mt-2 rounded border border-slate-800 bg-black/20 p-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Prompt</div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                    {prompt?.template ?? "Prompt missing."}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
        </div>
      </details>
    </section>
  );
}

function StagePlayObserverMailLoopCanvas({
  graph,
  mailbox,
  transcript,
}: {
  graph: StagePlayBadgeGraphV1;
  mailbox: StagePlayLiveSourceMailListResponse | null | undefined;
  transcript: StagePlayLiveSourceMailTranscriptResponse | null | undefined;
}) {
  const nodes = useMemo(() => buildObserverMailLoopNodes({ graph, mailbox, transcript }), [graph, mailbox, transcript]);
  const [selectedInspectorNodeId, setSelectedInspectorNodeId] = useState<string | null>(null);
  const selectedInspectorNode =
    nodes.find((node) => node.id === selectedInspectorNodeId && node.inspector) ??
    nodes.find((node) => node.inspector) ??
    null;
  return (
    <div
      className="relative min-h-0 flex-1 overflow-auto rounded-md border border-slate-800 bg-slate-950/95 p-6"
      data-testid="stage-play-badge-graph-scrollport"
      data-stage-play-graph-mode="observer_mail_loop_v1"
    >
      <StagePlayMailLoopLiveOverview graph={graph} mailbox={mailbox} />
      <details className="mt-4 rounded-md border border-slate-800 bg-black/20 p-3" data-testid="stage-play-mail-loop-topology-diagnostics">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Topology diagnostics: nodes, wires, prompt inspector
        </summary>
        <div className="mt-4">
      <div
        className="grid items-start gap-6"
        style={{
          contain: "layout paint style",
          minWidth: `${Math.max(13, nodes.length) * 244}px`,
          gridTemplateColumns: `repeat(${nodes.length}, 220px)`,
        }}
      >
        {nodes.map((node) => (
          <div
            key={node.id}
            className="relative"
            style={{
              contain: "layout paint style",
              contentVisibility: "auto",
              containIntrinsicSize: "220px 290px",
            }}
            data-testid="stage-play-observer-mail-loop-node"
            title={`Refs: ${uniqueSorted([...node.inputRefs, ...node.outputRefs]).join(", ") || "none"}`}
          >
            <button
              type="button"
              onClick={() => node.inspector ? setSelectedInspectorNodeId(node.id) : undefined}
              className={`flex min-h-[218px] w-full flex-col justify-between rounded-md border px-3 py-3 text-center shadow-[0_12px_30px_rgba(2,6,23,0.3)] ${
                node.inspector && selectedInspectorNode?.id === node.id
                  ? "border-cyan-400 bg-cyan-950/40"
                  : "border-slate-700 bg-slate-900/80"
              } ${node.inspector ? "cursor-pointer hover:border-cyan-500" : "cursor-default"}`}
              aria-label={node.inspector ? `Open ${node.title} inspector` : node.title}
            >
              <div>
                <span className="text-xs font-semibold text-slate-100">{node.title}</span>
                <span className="mt-1 block font-mono text-[10px] text-cyan-200">{labelize(node.status)}</span>
                <span className="mt-1 block text-[10px] text-slate-500">{node.subtitle}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-[11px] text-slate-200">{node.preview}</div>
              {node.payloadRows?.length ? (
                <div className="mt-2 space-y-1 text-left" data-testid="stage-play-mail-loop-node-payload">
                  {node.payloadRows.slice(0, 4).map((row) => (
                    <div
                      key={`${node.id}:${row.label}`}
                      className={`rounded border px-2 py-1 ${
                        row.tone === "good"
                          ? "border-emerald-900 bg-emerald-950/25"
                          : row.tone === "warn"
                            ? "border-amber-900 bg-amber-950/25"
                            : row.tone === "blocked"
                              ? "border-rose-900 bg-rose-950/25"
                              : "border-slate-800 bg-slate-950/45"
                      }`}
                    >
                      <div className="font-mono text-[8px] uppercase tracking-wide text-slate-500">{row.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-200">{row.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {node.statusBand ? (
                <div
                  className={`mt-2 rounded border px-2 py-1 text-left ${
                    node.statusBand.tone === "pressure"
                      ? "border-amber-700 bg-amber-950/35 text-amber-100"
                      : node.statusBand.tone === "blocked"
                        ? "border-rose-800 bg-rose-950/35 text-rose-100"
                        : node.statusBand.tone === "good"
                          ? "border-emerald-800 bg-emerald-950/25 text-emerald-100"
                          : "border-slate-700 bg-slate-950/60 text-slate-200"
                  }`}
                >
                  <div className="text-[8px] font-semibold uppercase tracking-wide">{node.statusBand.title}</div>
                  <div className="mt-0.5 space-y-0.5">
                    {node.statusBand.lines.slice(0, 6).map((line) => (
                      <div key={line} className="line-clamp-1 text-[9px] leading-tight">{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {node.statusChips?.length ? (
                <span className="mt-1 flex max-w-full flex-wrap justify-center gap-1">
                  {node.statusChips.slice(0, 2).map((chip) => (
                    <span key={chip} className="rounded border border-slate-700 bg-slate-950/70 px-1.5 py-0.5 text-[9px] text-slate-300">
                      {chip}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
            <details
              className="mt-2 rounded-md border border-slate-800 bg-black/25 p-2 text-[10px] text-slate-300"
              data-testid="stage-play-mail-loop-node-tray"
            >
              <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-slate-200">
                Details
              </summary>
              <div className="mt-2 space-y-2 text-left">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{node.inputLabel}</div>
                  <div className="mt-0.5 line-clamp-2 font-mono text-[10px] text-sky-100">{node.inputPreview}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Transform</div>
                  <div className="mt-0.5 line-clamp-2 font-mono text-[10px] text-cyan-100">{node.transformLabel}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{node.outputLabel}</div>
                  <div className="mt-0.5 line-clamp-3 font-mono text-[10px] text-emerald-100">{node.outputPreview}</div>
                </div>
                {node.blockedUntil ? (
                  <div className="rounded border border-amber-800 bg-amber-950/25 px-2 py-1 text-amber-100">
                    Blocked until: <span className="font-mono">{node.blockedUntil}</span>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        ))}
      </div>
      <div
        className="mt-4 grid gap-6 font-mono text-[10px] text-slate-500"
        style={{
          minWidth: `${Math.max(13, nodes.length) * 244}px`,
          gridTemplateColumns: `repeat(${nodes.length}, 220px)`,
        }}
      >
        {nodes.map((node, index) => (
          <div key={`${node.id}:edge`} className="flex items-center justify-center">
            {index < nodes.length - 1 ? (
              <div
                className={`flex w-full items-center gap-2 ${
                  node.edgeToNext?.tone === "connected"
                    ? "text-emerald-200"
                    : node.edgeToNext?.tone === "pending"
                      ? "text-amber-200"
                      : "text-rose-200"
                }`}
                data-testid="stage-play-mail-loop-edge"
              >
                <span
                  className={`h-px flex-1 ${
                    node.edgeToNext?.tone === "connected"
                      ? "bg-emerald-500"
                      : node.edgeToNext?.tone === "pending"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
                <span className="max-w-[126px] truncate rounded border border-current/40 px-1.5 py-0.5">
                  {node.edgeToNext?.label ?? "not connected"}
                </span>
                <span
                  className={`h-px flex-1 ${
                    node.edgeToNext?.tone === "connected"
                      ? "bg-emerald-500"
                      : node.edgeToNext?.tone === "pending"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
              </div>
            ) : <span>end</span>}
          </div>
        ))}
      </div>
      {selectedInspectorNode?.inspector ? (
        <div
          className="mt-5 max-w-3xl rounded-md border border-cyan-900 bg-slate-950/85 p-4 text-sm text-slate-200"
          data-testid="stage-play-interpreter-profile-inspector"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                {selectedInspectorNode.inspector.kind === "micro_reasoner_prompt"
                  ? "Prompt inspector"
                  : "Profile inspector"}
              </div>
              <div className="mt-1 text-base font-semibold text-slate-50">{selectedInspectorNode.inspector.title}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                {selectedInspectorNode.inspector.promptId ?? selectedInspectorNode.inspector.profileId}
              </div>
            </div>
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded border border-slate-800 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-300">
            {selectedInspectorNode.inspector.body}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedInspectorNode.inspector.linkedNoteId}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 disabled:cursor-not-allowed disabled:opacity-45"
              title={selectedInspectorNode.inspector.linkedNoteId ?? "No linked note yet"}
            >
              Open linked note
            </button>
            <button
              type="button"
              disabled
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 opacity-45"
              title={selectedInspectorNode.inspector.kind === "micro_reasoner_prompt"
                ? "Prompt edit/fork route is not exposed in this panel yet."
                : "Profile note compile route is not exposed in this panel yet."}
            >
              {selectedInspectorNode.inspector.kind === "micro_reasoner_prompt" ? "Edit / fork prompt" : "Compile from note"}
            </button>
            <button
              type="button"
              disabled
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 opacity-45"
              title={selectedInspectorNode.inspector.kind === "micro_reasoner_prompt"
                ? "Prompt test route is not exposed in this panel yet."
                : "Profile status route is not exposed in this panel yet."}
            >
              {selectedInspectorNode.inspector.kind === "micro_reasoner_prompt" ? "Test latest mail" : "Pause / archive"}
            </button>
          </div>
        </div>
      ) : null}
        </div>
      </details>
    </div>
  );
}

function StagePlayToolActivityStrip({
  graph,
  diff,
  projectionStatus,
  checkpointQueueStatus,
  onCheckpointQueueAction,
}: {
  graph: StagePlayBadgeGraphV1;
  diff: StagePlayGraphDiff | null;
  projectionStatus: StagePlayProjectionStatus | null;
  checkpointQueueStatus: StagePlayCheckpointQueueStatus;
  onCheckpointQueueAction: (action: StagePlayCheckpointQueueAction, requestId?: string | null) => void;
}) {
  const sourceFreshnessChanged = diff?.sourceWindowChanged === true;
  const missingCount = graph.summary.missingEvidenceCount;
  const latestPerturbations = (graph.perturbations ?? []).slice(0, 5);
  const latestCheckpointPerturbation = latestPerturbations.find((event) => event.checkpointSuggested);
  const visibleCheckpointRequest = selectStagePlayVisibleCheckpointRequest(graph);
  const summaryText = `Built Stage Play Badge Graph with ${graph.summary.badgeCount} badge(s), ${graph.summary.affordanceCount} affordance(s), and ${graph.summary.blockedAffordanceCount} blocked move(s).`;
  const skippedText = projectionStatus?.skippedLineKeys
    .map((key) => key === "recommendation" ? "recommendation requires model review" : key)
    .join(", ");
  const checkpointOnlyText = projectionStatus?.checkpointOnlySkipped
    .map((key) => key === "recommendation" ? "checkpoint recommendation" : labelize(key))
    .join(", ");
  return (
    <div
      data-testid="stage-play-tool-activity-strip"
      className={`absolute bottom-3 left-1/2 z-20 max-w-[calc(100%-7rem)] -translate-x-1/2 rounded-md border bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-2xl ${
        sourceFreshnessChanged
          ? "border-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.22)]"
          : "border-slate-800"
      }`}
      title={summaryText}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="font-semibold text-cyan-100">Latest reflect_stage_play_context</span>
        <span className="font-mono text-slate-400">{formatStagePlayClock(graph.generatedAt)}</span>
        <span>{graph.summary.badgeCount} badges</span>
        <span>{graph.summary.affordanceCount} affordances</span>
        <span>{graph.summary.blockedAffordanceCount} blocked</span>
        <span>{graph.summary.proceduralBindingCount} procedural bindings</span>
        <span className={missingCount > 0 ? "text-amber-100" : "text-slate-400"}>{missingCount} missing checks</span>
        <span className={sourceFreshnessChanged ? "text-amber-100" : "text-slate-400"}>
          source freshness: {graph.sourceWindow.freshness}
        </span>
        {diff && hasStagePlayGraphDiff(diff) ? (
          <span className="font-mono text-[11px] text-emerald-200">
            +{diff.addedBadgeIds.length} / ~{diff.updatedBadgeIds.length} / -{diff.removedBadgeIds.length}
          </span>
        ) : null}
        {latestPerturbations.length > 0 ? (
          <span className={latestCheckpointPerturbation ? "font-mono text-[11px] text-amber-100" : "font-mono text-[11px] text-cyan-100"}>
            perturbations: {latestPerturbations.map((event) => `${labelize(event.reason)}:${event.materiality}`).join(" | ")}
          </span>
        ) : null}
        {latestCheckpointPerturbation ? (
          <span className="basis-full text-center text-[11px] text-amber-100">
            Checkpoint suggested after {labelize(latestCheckpointPerturbation.reason)}; affected {latestCheckpointPerturbation.affectedBadgeIds.length} badge(s).
          </span>
        ) : null}
        {visibleCheckpointRequest ? (
          <span className="basis-full flex flex-wrap items-center justify-center gap-2 text-[11px] text-cyan-100">
            <span className="font-mono">
              checkpoint queue: {labelize(visibleCheckpointRequest.reason)} / {visibleCheckpointRequest.status}
            </span>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("run", visibleCheckpointRequest.checkpointRequestId)}
              disabled={visibleCheckpointRequest.status !== "queued"}
              className="rounded border border-cyan-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="stage-play-run-checkpoint"
            >
              Run checkpoint
            </button>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("skip", visibleCheckpointRequest.checkpointRequestId)}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-amber-500 hover:text-amber-100"
              data-testid="stage-play-skip-checkpoint"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("pause_job")}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-amber-500 hover:text-amber-100"
              data-testid="stage-play-pause-checkpoint-job"
            >
              Pause job
            </button>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("resume_job")}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-emerald-500 hover:text-emerald-100"
              data-testid="stage-play-resume-checkpoint-job"
            >
              Resume job
            </button>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("clear_queued")}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-rose-500 hover:text-rose-100"
              data-testid="stage-play-clear-checkpoint-queue"
            >
              Clear queued checkpoints
            </button>
            <button
              type="button"
              onClick={() => onCheckpointQueueAction("end_live_job")}
              className="rounded border border-rose-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-100 hover:border-rose-500"
              data-testid="stage-play-end-checkpoint-job"
            >
              End live job
            </button>
          </span>
        ) : null}
        {checkpointQueueStatus ? (
          <span className={checkpointQueueStatus.ok ? "basis-full text-center text-[11px] text-emerald-100" : "basis-full text-center text-[11px] text-amber-100"}>
            {checkpointQueueStatus.message}
          </span>
        ) : null}
        {projectionStatus ? (
          <span className="basis-full text-center font-mono text-[11px] text-emerald-100">
            Projected {projectionStatus.projectedLineKeys.length} interpretation lanes: {projectionStatus.projectedLineKeys.join(", ") || "none"}
            {projectionStatus.skippedLineKeys.length > 0 ? (
              <span className="text-amber-100"> | Skipped: {skippedText}</span>
            ) : null}
            {projectionStatus.checkpointOnlySkipped.length > 0 ? (
              <span className="text-amber-100"> | Checkpoint-only: {checkpointOnlyText}</span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function buildStagePlayCheckpointAskQuestion(input: {
  request: StagePlayCheckpointRequest;
  graph: StagePlayBadgeGraphV1;
  environmentId?: string | null;
  roomId?: string | null;
}): string {
  const checkpointFocus = input.request.question
    .replace(/\bproduce\b/gi, "summarize")
    .replace(/\brequest(?:ed)?\b/gi, "asked about")
    .replace(/\bqueue(?:d)?|enqueue(?:d)?\b/gi, "tracked")
    .replace(/\brun\b/gi, "review")
    .replace(/\bstart\b/gi, "begin")
    .replace(/\bcreate|make\b/gi, "describe");
  const sourceRefs = [
    ...input.graph.sourceWindow.latestObservationRefs,
    ...input.graph.sourceWindow.latestSnapshotRefs,
    ...input.graph.sourceWindow.latestNavigationRefs,
  ].filter(Boolean).slice(0, 6);
  return [
    "Use the Stage Play reflection capability live_env.reflect_stage_play_context.",
    "Reflect the active Stage Play Badge Graph and project the current Live Interpretation.",
    `Stage Play checkpoint handle: ${input.request.checkpointRequestId}.`,
    `Stage Play graph handle: ${input.graph.graphId}.`,
    input.environmentId ? `Live Interpretation environment handle: ${input.environmentId}.` : "",
    input.roomId ? `Stage room handle: ${input.roomId}.` : "",
    sourceRefs.length > 0 ? `Stage Play evidence handles: ${sourceRefs.join(", ")}.` : "",
    `Checkpoint focus: ${checkpointFocus}`,
    "Report checkpoint freshness, missing evidence, and whether a current model-reviewed Answer Snapshot exists after the reflection.",
    "Leave visual/audio capture cadence unchanged.",
  ].filter(Boolean).join("\n");
}

function buildStagePlayMailWakeAskQuestion(input: {
  wake: StagePlayLiveSourceMailWakeRequestV1;
  processedPacket?: StagePlayProcessedMailPacketV1 | null;
}): string {
  const packet = input.processedPacket ?? null;
  const effort = packet?.effortEstimate?.currentEffort ? labelize(packet.effortEstimate.currentEffort) : "the latest live-source finding";
  const recommendation = labelize(packet?.arbiter?.recommendedNext ?? packet?.recommendedNext ?? "review_required");
  return [
    "Review the latest Stage Play live-source mailbox finding.",
    `Current effort: ${effort}.`,
    `Micro-reasoner recommendation: ${recommendation}.`,
    "Use the structured mailbox route metadata attached to this turn; keep the visible answer concise and evidence-bound.",
  ].filter(Boolean).join("\n");
}

function buildStagePlayMailWakeRouteMetadata(input: {
  wake: StagePlayLiveSourceMailWakeRequestV1;
  mailItems?: StagePlayLiveSourceMailItemV1[];
  processedPacket?: StagePlayProcessedMailPacketV1 | null;
  wakeResult?: StagePlayLiveSourceMailWakeResultV1 | null;
  bridgeReason?: string | null;
}) {
  const packet = input.processedPacket ?? null;
  const recommendedNext = packet?.arbiter?.recommendedNext ?? packet?.recommendedNext ?? null;
  const requiredPhase = recommendedNext === "request_voice_callout" ? "record_decision" : "read_mailbox";
  const requiredCanonicalGoal =
    recommendedNext === "request_voice_callout"
      ? "processed_mail_voice_decision"
      : "processed_mail_interpretation";
  const mandatoryTool =
    requiredPhase === "record_decision"
      ? "live_env.record_live_source_mail_decision"
      : "live_env.read_live_source_mail";
  const allowedCapabilities = [
    "live_env.read_live_source_mail",
    "live_env.read_processed_live_source_mail",
    "live_env.process_live_source_mail",
    "live_env.record_live_source_mail_decision",
    "live_env.request_interim_voice_callout",
  ];
  const forbiddenCapabilities = [
    "workspace_os.status",
    "internet-search.search_web",
    "docs-viewer.open",
    "docs-viewer.search_docs",
    "repo-code.search_concept",
    "situation_room.describe_visual_capture",
  ];
  const mailPreviews = (input.mailItems ?? [])
    .filter((item) => input.wake.mailIds.includes(item.mailId))
    .map((item) => ({
      mailId: item.mailId,
      preview: compactStagePlayText(item.summary.preview, "", 260),
      createdAt: item.createdAt,
    }))
    .slice(0, 4);
  return {
    schema: "helix.ask.route_metadata.v1" as const,
    source: "stage_play_mail_wake",
    invocationKind: "stage_play_mail_wake" as const,
    wakeRequestId: input.wake.wakeRequestId,
    mailboxThreadId: input.wake.threadId,
    sourceTarget: "live_source_mailbox" as const,
    requiredCanonicalGoal,
    requiredPhase,
    allowedCapabilities,
    forbiddenCapabilities,
    evidenceRefs: [
      ...input.wake.evidenceRefs,
      ...(packet?.packetId ? [packet.packetId] : []),
      ...input.wake.mailIds,
    ].filter(Boolean),
    requiredToolFamily: "live_source_mail",
    source_target_intent: {
      schema: "helix.ask_source_target_intent.v1",
      target_source: "live_source_mailbox",
      target_kind: "live_source_mailbox",
      targetSource: "live_source_mailbox",
      targetKind: "live_source_mailbox",
      strength: "hard",
      source: "stage_play_mail_wake_route_metadata",
      wakeRequestId: input.wake.wakeRequestId,
      stage_play_live_source_mail_wake_request_id: input.wake.wakeRequestId,
      processedPacketId: packet?.packetId ?? null,
      requiredPhase,
      mandatoryNextTool: mandatoryTool,
      reasons: [
        "structured_stage_play_mail_wake_handoff",
        recommendedNext === "request_voice_callout"
          ? "micro_reasoner_requested_voice_callout"
          : "micro_reasoner_requested_mailbox_review",
      ],
    },
    stage_play_live_source_mailbox_debug: {
      schema: "stage_play.live_source_mailbox_debug.v1",
      source: "stage_play_mail_wake_route_metadata",
      route_selected: "live_source_mailbox",
      wake_request_id: input.wake.wakeRequestId,
      wake_request_ids: [input.wake.wakeRequestId],
      processed_packet_id: packet?.packetId ?? null,
      mail_ids: input.wake.mailIds,
      source_ids: input.wake.sourceIds,
      recommended_next: recommendedNext,
      required_phase: requiredPhase,
      mandatory_next_tool: mandatoryTool,
      bridge_reason: input.bridgeReason ?? null,
      wake_result_id: input.wakeResult?.wakeResultId ?? null,
      wake_status: input.wakeResult?.status ?? input.wake.status,
    },
    live_source_mailbox_authority_summary: {
      artifactId: "live_source_mailbox_authority_summary",
      schemaVersion: "helix.live_source_mailbox_authority_summary.v1",
      routeFamily: "live_source_mailbox",
      wakeRequestId: input.wake.wakeRequestId,
      processedPacketId: packet?.packetId ?? null,
      recommendedNext,
      requiredPhase,
      mandatoryNextTool: {
        tool_name: mandatoryTool,
        reason: "structured_stage_play_mail_wake_handoff",
        terminal_forbidden: true,
      },
      assistant_answer: false,
      terminal_eligible: false,
    },
    mandatory_next_tool: {
      tool_name: mandatoryTool,
      reason: "structured_stage_play_mail_wake_handoff",
      canonical_goal: "live_source_mailbox_wake_decision",
      terminal_forbidden: true,
      wake_request_id: input.wake.wakeRequestId,
      processed_packet_id: packet?.packetId ?? null,
    },
    compact_context: {
      mailPreviews,
      packetSummary: packet ? {
        packetId: packet.packetId,
        recommendedNext: packet.recommendedNext,
        salience: packet.salience,
        currentEffort: packet.effortEstimate?.currentEffort ?? null,
        arbiter: packet.arbiter ?? null,
      } : null,
    },
  };
}

function readStagePlayWakeBridgeMemory(): StagePlayWakeBridgeMemory {
  if (typeof window === "undefined") return { launchedWakeIds: [], launchedWakeAtById: {}, lastLaunchedAt: 0 };
  try {
    const raw = window.sessionStorage.getItem(STAGE_PLAY_UI_WAKE_BRIDGE_STORAGE_KEY);
    if (!raw) return { launchedWakeIds: [], launchedWakeAtById: {}, lastLaunchedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<{
      launchedWakeIds: unknown;
      launchedWakeAtById: unknown;
      lastLaunchedAt: unknown;
    }>;
    const launchedWakeIds = Array.isArray(parsed.launchedWakeIds)
      ? parsed.launchedWakeIds.filter((id): id is string => typeof id === "string")
      : [];
    const launchedWakeAtById = parsed.launchedWakeAtById && typeof parsed.launchedWakeAtById === "object" && !Array.isArray(parsed.launchedWakeAtById)
      ? Object.fromEntries(
          Object.entries(parsed.launchedWakeAtById as Record<string, unknown>)
            .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
        )
      : Object.fromEntries(launchedWakeIds.map((id) => [id, 0]));
    return {
      launchedWakeIds,
      launchedWakeAtById,
      lastLaunchedAt: typeof parsed.lastLaunchedAt === "number" && Number.isFinite(parsed.lastLaunchedAt)
        ? parsed.lastLaunchedAt
        : 0,
    };
  } catch {
    return { launchedWakeIds: [], launchedWakeAtById: {}, lastLaunchedAt: 0 };
  }
}

function writeStagePlayWakeBridgeMemory(next: StagePlayWakeBridgeMemory) {
  if (typeof window === "undefined") return;
  try {
    const launchedWakeIds = next.launchedWakeIds.slice(-25);
    const launchedWakeAtById = Object.fromEntries(
      launchedWakeIds.map((id) => [id, next.launchedWakeAtById[id] ?? next.lastLaunchedAt]),
    );
    window.sessionStorage.setItem(STAGE_PLAY_UI_WAKE_BRIDGE_STORAGE_KEY, JSON.stringify({
      launchedWakeIds,
      launchedWakeAtById,
      lastLaunchedAt: next.lastLaunchedAt,
    }));
  } catch {
    // session storage is best-effort; the visible button still works without it
  }
}

function shouldAutoLaunchStagePlayWakeBridge(input: {
  wake: StagePlayLiveSourceMailWakeRequestV1;
  memory: StagePlayWakeBridgeMemory;
  now: number;
}): boolean {
  if (input.now - input.memory.lastLaunchedAt < STAGE_PLAY_UI_WAKE_BRIDGE_COOLDOWN_MS) return false;
  const lastWakeLaunchAt = input.memory.launchedWakeAtById[input.wake.wakeRequestId] ?? 0;
  if (lastWakeLaunchAt <= 0) return true;
  if (input.wake.status === "deferred_for_pressure" || input.wake.status === "failed_retryable") {
    return input.now - lastWakeLaunchAt >= STAGE_PLAY_UI_WAKE_BRIDGE_COOLDOWN_MS;
  }
  return false;
}

function markStagePlayWakeBridgeLaunched(
  memory: StagePlayWakeBridgeMemory,
  wakeRequestId: string,
  now: number,
): StagePlayWakeBridgeMemory {
  return {
    launchedWakeIds: [...memory.launchedWakeIds.filter((id) => id !== wakeRequestId), wakeRequestId],
    launchedWakeAtById: {
      ...memory.launchedWakeAtById,
      [wakeRequestId]: now,
    },
    lastLaunchedAt: now,
  };
}

function isDismissibleStagePlayWakeRequest(wake: StagePlayLiveSourceMailWakeRequestV1 | null | undefined): wake is StagePlayLiveSourceMailWakeRequestV1 {
  if (!wake) return false;
  if (wake.askTurnId || wake.decisionIds.length > 0) return false;
  return wake.status === "queued" ||
    wake.status === "waiting_for_ui_handoff" ||
    wake.status === "failed_retryable" ||
    wake.status === "failed_terminal" ||
    wake.status === "deferred_for_pressure";
}

function shouldBridgeStagePlayWakeToAsk(input: {
  wake: StagePlayLiveSourceMailWakeRequestV1 | null;
  wakeResult: StagePlayLiveSourceMailWakeResultV1 | null;
  packet: StagePlayProcessedMailPacketV1 | null;
}): boolean {
  const wake = input.wake;
  if (!wake) return false;
  if (wake.askTurnId || wake.decisionIds.length > 0) return false;
  if (input.wakeResult?.askTurnId || (input.wakeResult?.decisionIds.length ?? 0) > 0) return false;
  const uiHandoffRequired = input.wakeResult?.status === "skipped" &&
    input.wakeResult.skippedReason === "ui_handoff_required";
  const wakeStatus = uiHandoffRequired ? wake.status : input.wakeResult?.status ?? wake.status;
  if (!["queued", "waiting_for_ui_handoff", "running", "failed_retryable", "deferred_for_pressure"].includes(wakeStatus)) return false;
  const recommendedNext = input.packet?.arbiter?.recommendedNext ?? input.packet?.recommendedNext;
  if (!input.packet) return true;
  const wakeAsk = input.packet.arbiter?.wakeAsk === true || recommendedNext === "request_voice_callout";
  return (wakeAsk || uiHandoffRequired || wake.status === "deferred_for_pressure" || wake.status === "failed_retryable") &&
    recommendedNext !== "wait_for_next_summary";
}

function launchStagePlayWakeInHelixAsk(input: {
  wake: StagePlayLiveSourceMailWakeRequestV1;
  mailItems: StagePlayLiveSourceMailItemV1[];
  processedPacket: StagePlayProcessedMailPacketV1 | null;
  wakeResult: StagePlayLiveSourceMailWakeResultV1 | null;
  bridgeReason: string;
}) {
  launchHelixAskPrompt({
    question: buildStagePlayMailWakeAskQuestion({
      wake: input.wake,
      processedPacket: input.processedPacket,
    }),
    autoSubmit: true,
    panelId: "stage-play-badge-graph",
    bypassWorkstationDispatch: true,
    forceReasoningDispatch: true,
    suppressWorkstationPayloadActions: true,
    routeMetadata: buildStagePlayMailWakeRouteMetadata({
      wake: input.wake,
      mailItems: input.mailItems,
      processedPacket: input.processedPacket,
      wakeResult: input.wakeResult,
      bridgeReason: input.bridgeReason,
    }),
  });
}

const STAGE_PLAY_NODE_BUILDER_TYPES: StagePlayNodeBuilderType[] = [
  { kind: "observer", label: "Observer", role: "source custody and routing" },
  { kind: "source", label: "Source Class", role: "live feed handle to wire in" },
  { kind: "fusion", label: "Fusion", role: "multi-source alignment or missing modality" },
  { kind: "interpreter", label: "Interpreter Job", role: "continual reflection over source refs" },
  { kind: "setting", label: "Setting", role: "where the scene is bounded" },
  { kind: "actor", label: "Actor", role: "who can act or be acted on" },
  { kind: "prop", label: "Prop", role: "nearby object or world feature" },
  { kind: "resource", label: "Resource", role: "usable inventory or material" },
  { kind: "hazard", label: "Hazard", role: "danger that constrains movement" },
  { kind: "constraint", label: "Constraint", role: "rule limiting possible moves" },
  { kind: "goal", label: "Goal", role: "desired state or objective" },
  { kind: "world_state", label: "World State", role: "current observed condition" },
  { kind: "affordance", label: "Affordance", role: "move currently available" },
  { kind: "blocked_affordance", label: "Blocked Move", role: "move ruled out by evidence" },
  { kind: "intent_module", label: "Intent Module", role: "verb building block" },
  { kind: "procedural_binding", label: "Procedure", role: "combined action pattern" },
  { kind: "recommended_check", label: "Check", role: "missing validation step" },
  { kind: "admission_gate", label: "Gate", role: "permission boundary" },
  { kind: "perturbation", label: "Perturbation", role: "source-window change that may stale output" },
  { kind: "checkpoint_request", label: "Checkpoint Request", role: "queued bounded Ask checkpoint" },
  { kind: "helix_ask_checkpoint", label: "Helix Ask Checkpoint", role: "visible model reasoning boundary" },
  { kind: "missing_evidence", label: "Missing Evidence", role: "unknown fact to resolve" },
];

const STAGE_PLAY_SOURCE_CLASSES = [
  "world_event",
  "environment_state",
  "environment_affordance",
  "visual_frame",
  "audio_transcript",
  "text_chat",
  "screen_summary",
  "minecraft_world_events",
  "calculator_stream",
  "simulation_stream",
  "document_context",
  "note_context",
  "procedure_graph",
  "process_graph",
] as const;

function defaultDraftParametersForNode(node: StagePlayNodeBuilderType): DraftStagePlayNodeParameter[] {
  const presets: Record<StagePlayBadgeV1["kind"], [string, string][]> = {
    observer: [["role", "source_custody"], ["route_policy", "evidence_only"], ["selected_sources", ""]],
    source: [["source_class", ""], ["source_id", ""], ["status", ""], ["descriptor_ref", ""], ["producer_ref", ""], ["latest_ref", ""]],
    compact_observation: [["window", ""], ["fact_summary", ""], ["evidence_refs", ""]],
    stage_interpretation: [["bounds", ""], ["interpretation", ""], ["source_refs", ""]],
    fusion: [["fusion_rule", ""], ["input_modalities", ""], ["result", ""]],
    interpreter: [["tool", "live_env.reflect_stage_play_context"], ["cadence", ""], ["input_sources", ""], ["output", "stage_play_badge_graph"]],
    setting: [["dimension", ""], ["biome_or_area", ""], ["bounds", ""]],
    actor: [["entity_id", ""], ["state", ""], ["relation", ""]],
    prop: [["object_or_block", ""], ["position", ""], ["state", ""]],
    resource: [["item_or_material", ""], ["count", ""], ["availability", ""]],
    hazard: [["hazard_type", ""], ["severity", ""], ["radius_or_position", ""]],
    constraint: [["rule", ""], ["applies_to", ""], ["reason", ""]],
    goal: [["target_state", ""], ["priority", ""], ["success_check", ""]],
    world_state: [["observation", ""], ["freshness", ""], ["source_ref", ""]],
    affordance: [["action", ""], ["precondition", ""], ["possible_effect", ""]],
    blocked_affordance: [["blocked_action", ""], ["blocked_by", ""], ["missing_check", ""]],
    intent_module: [["verb", ""], ["target", ""], ["preserves", ""]],
    procedural_binding: [["expression", ""], ["requires", ""], ["possible_result", ""]],
    ask_checkpoint: [["ask_turn_id", ""], ["solver_trace_ref", ""], ["model_reviewed", "false"]],
    helix_ask_checkpoint: [["ask_turn_id", ""], ["solver_trace_ref", ""], ["model_reviewed", "false"]],
    answer_snapshot: [["line_key", "answer_snapshot"], ["answer_text", ""], ["model_reviewed", "false"]],
    live_output: [["line_key", ""], ["state", "draft"], ["voice_eligible", "false"]],
    voice_output: [["line_key", ""], ["state", "draft"], ["voice_eligible", "false"]],
    recommended_check: [["check", ""], ["evidence_needed", ""], ["status", ""]],
    admission_gate: [["gate", ""], ["admission", ""], ["authority", "evidence_only"]],
    perturbation: [["reason", ""], ["materiality", ""], ["affected_badges", ""]],
    checkpoint_request: [["reason", ""], ["status", "queued"], ["question", ""]],
    missing_evidence: [["question", ""], ["needed_ref", ""], ["status", "missing"]],
  };

  return presets[node.kind].map(([key, value], index) => ({
    id: `${node.kind}:param:${index + 1}`,
    key,
    value,
  }));
}

function readDraftParameter(node: DraftStagePlayNode, key: string): string {
  return node.parameters.find((parameter) => parameter.key === key)?.value ?? "";
}

function setDraftParameterValue(node: DraftStagePlayNode, key: string, value: string): DraftStagePlayNode {
  const index = node.parameters.findIndex((parameter) => parameter.key === key);
  if (index >= 0) {
    return {
      ...node,
      parameters: node.parameters.map((parameter, parameterIndex) =>
        parameterIndex === index ? { ...parameter, value } : parameter,
      ),
    };
  }
  return {
    ...node,
    parameters: [
      ...node.parameters,
      {
        id: `${node.id}:param:${key}`,
        key,
        value,
      },
    ],
  };
}

function draftParameterRecord(node: DraftStagePlayNode): Record<string, string> {
  return Object.fromEntries(
    node.parameters
      .map((parameter) => [parameter.key.trim(), parameter.value.trim()] as const)
      .filter(([key]) => key.length > 0),
  );
}

function splitEvidenceRefs(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function draftNodeEvidenceRefs(node: DraftStagePlayNode): string[] {
  const parameters = draftParameterRecord(node);
  return uniqueSorted([
    ...splitEvidenceRefs(parameters.descriptor_ref),
    ...splitEvidenceRefs(parameters.producer_ref),
    ...splitEvidenceRefs(parameters.latest_ref),
    ...splitEvidenceRefs(parameters.source_ref),
    ...splitEvidenceRefs(parameters.evidence_ref),
  ]);
}

function buildDraftEdges(nodes: DraftStagePlayNode[]) {
  const edges: { from: string; to: string; relation: string; label: string }[] = [];
  let edgeCount = 0;
  const observerNodes = nodes.filter((node) => node.kind === "observer");
  const sourceNodes = nodes.filter((node) => node.kind === "source");
  const interpreterNodes = nodes.filter((node) => node.kind === "interpreter");
  const intentNodes = nodes.filter((node) => node.kind === "intent_module");
  const procedureNodes = nodes.filter((node) => node.kind === "procedural_binding");
  const affordanceNodes = nodes.filter((node) => node.kind === "affordance" || node.kind === "blocked_affordance");
  const constraintNodes = nodes.filter((node) => node.kind === "hazard" || node.kind === "constraint" || node.kind === "missing_evidence");
  const addEdge = (from: DraftStagePlayNode, to: DraftStagePlayNode, relation: string, label: string) => {
    edgeCount += 1;
    edges.push({
      from: from.id,
      to: to.id,
      relation,
      label: `${edgeCount}. ${label}`,
    });
  };

  for (const observer of observerNodes) {
    for (const source of sourceNodes) addEdge(observer, source, "observes", "observer tracks source custody");
    for (const interpreter of interpreterNodes) addEdge(observer, interpreter, "feeds", "observer routes sources to interpreter");
  }
  for (const source of sourceNodes) {
    for (const interpreter of interpreterNodes) addEdge(source, interpreter, "feeds", "source feeds interpreter");
  }
  for (const interpreter of interpreterNodes) {
    for (const node of nodes.filter((entry) => entry.kind !== "source" && entry.kind !== "interpreter")) {
      addEdge(interpreter, node, "interprets", "interpreter produces stage fact");
    }
  }
  for (const intent of intentNodes) {
    for (const procedure of procedureNodes) addEdge(intent, procedure, "composes_with", "intent composes procedure");
  }
  for (const constraint of constraintNodes) {
    for (const affordance of affordanceNodes) addEdge(constraint, affordance, "constrains", "constraint bounds affordance");
  }
  return edges;
}

function buildStagePlayDraftFromNodes(input: {
  draftNodes: DraftStagePlayNode[];
  objective?: string | null;
}) {
  const cadenceCandidate = input.draftNodes
    .flatMap((node) => [
      readDraftParameter(node, "cadence_ms"),
      readDraftParameter(node, "cadence"),
    ])
    .map((value) => Number.parseInt(value, 10))
    .find((value) => Number.isFinite(value) && value > 0);
  return {
    artifactId: "stage_play_graph_draft",
    schemaVersion: "stage_play_graph_draft/v1",
    draftId: "stage_play_panel_draft",
    objective: input.objective ?? "Assemble a Stage Play evidence graph from admitted source handles.",
    nodes: input.draftNodes.map((node) => {
      const parameters = draftParameterRecord(node);
      return {
        id: node.id,
        kind: node.kind,
        title: node.label,
        bind: node.kind === "source"
          ? {
              sourceClass: parameters.source_class || null,
              sourceId: parameters.source_id || null,
            }
          : null,
        parameters,
        evidenceRefs: draftNodeEvidenceRefs(node),
      };
    }),
    edges: buildDraftEdges(input.draftNodes),
    checkpointPolicy: {
      cadenceMs: cadenceCandidate ?? null,
      completeEachWindow: true,
      standingJobRemainsOpen: true,
    },
  };
}

function BadgeButton({
  badge,
  selected,
  onSelect,
}: {
  badge: StagePlayBadgeV1;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        selected
          ? "border-cyan-500 bg-cyan-950/45 text-cyan-50"
          : `${kindTone(badge.kind)} text-slate-100 hover:border-slate-600`
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{badge.title}</div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-400">{badge.plainMeaning}</div>
        </div>
        {badge.kind === "blocked_affordance" || badge.status === "blocked" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-label="Blocked move" />
        ) : badge.kind === "procedural_binding" ? (
          <Waypoints className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-label="Procedural binding" />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
          {labelize(badge.kind)}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${statusTone(badge.status)}`}>
          {labelize(badge.status)}
        </Badge>
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-400">
          {badge.confidence.toFixed(2)}
        </Badge>
      </div>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-2 text-sm text-slate-200">{children}</div>
    </section>
  );
}

function StagePlayDataFlowSection({ badge }: { badge: StagePlayBadgeV1 }) {
  if (!hasStagePlayDataFlowTray(badge)) return null;
  const inputRefs = badge.dataTray?.inputRefs ?? [];
  const toolRefs = badge.dataTray?.toolRefs ?? [];
  const outputRefs = badge.dataTray?.outputRefs ?? [];
  const skipped = badge.dataTray?.skipped ?? [];
  const copyRefs = stagePlayDataFlowRefs(badge);
  const renderRefs = (refs: string[], empty: string) => refs.length > 0 ? (
    <div className="mt-1 space-y-1 font-mono text-[11px] text-slate-400">
      {refs.slice(0, 8).map((ref) => <div key={ref} className="break-all">{ref}</div>)}
      {refs.length > 8 ? <div className="text-slate-600">+{refs.length - 8} more ref(s)</div> : null}
    </div>
  ) : (
    <div className="mt-1 text-xs text-slate-500">{empty}</div>
  );

  return (
    <Section title="Data Flow">
      <div className="space-y-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold uppercase tracking-wide text-slate-500">Input</div>
            {badge.dataTray?.inputPreview ? (
              <div className="mt-1 rounded border border-slate-800 bg-black/20 p-2 text-slate-300">
                {badge.dataTray.inputPreview}
              </div>
            ) : null}
            {renderRefs(inputRefs, "No input refs recorded.")}
          </div>
          <CopyStagePlayRefsButton refs={copyRefs} label={`Copy data flow refs for ${badge.title}`} />
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Transform</div>
          <div className="mt-1 rounded border border-cyan-900/70 bg-cyan-950/15 p-2 font-mono text-cyan-100">
            {badge.dataTray?.transformLabel ?? "No transform label recorded."}
          </div>
        </div>
        {badge.dataTray?.toolPreview || toolRefs.length > 0 ? (
          <div data-testid="stage-play-data-flow-tool-identity">
            <div className="font-semibold uppercase tracking-wide text-slate-500">Tool Identity</div>
            {badge.dataTray?.toolPreview ? (
              <div className="mt-1 rounded border border-violet-900/70 bg-violet-950/15 p-2 text-violet-100">
                {badge.dataTray.toolPreview}
              </div>
            ) : null}
            {renderRefs(toolRefs, "No tool identity refs recorded.")}
          </div>
        ) : null}
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Output</div>
          {badge.dataTray?.outputPreview ? (
            <div className="mt-1 rounded border border-emerald-900/70 bg-emerald-950/15 p-2 text-emerald-100">
              {badge.dataTray.outputPreview}
            </div>
          ) : null}
          {renderRefs(outputRefs, "No output refs recorded.")}
        </div>
        {skipped.length > 0 ? (
          <div>
            <div className="font-semibold uppercase tracking-wide text-slate-500">Skipped</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {skipped.map((entry) => (
                <Badge key={entry} variant="outline" className="border-amber-800 text-amber-100">
                  {labelize(entry)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {badge.dataTray?.blockedUntil ? (
          <div className="rounded border border-amber-900/70 bg-amber-950/20 p-2 text-amber-100">
            Blocked until: <span className="font-mono">{badge.dataTray.blockedUntil}</span>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function floatingTooltipPosition(rect: DOMRect | null | undefined, input: {
  width?: number;
  estimatedHeight?: number;
} = {}): StagePlayTooltipPosition {
  const margin = 12;
  const width = Math.min(input.width ?? 256, Math.max(220, window.innerWidth - margin * 2));
  const maxHeight = Math.max(140, window.innerHeight - margin * 2);
  const estimatedHeight = Math.min(input.estimatedHeight ?? 240, maxHeight);
  if (!rect) {
    return {
      left: margin,
      top: margin,
      width,
      maxHeight,
    };
  }
  const preferredBelow = rect.bottom + 8;
  const preferredAbove = rect.top - estimatedHeight - 8;
  const top = preferredBelow + estimatedHeight <= window.innerHeight - margin
    ? preferredBelow
    : preferredAbove >= margin
      ? preferredAbove
      : clampNumber(rect.top + rect.height / 2 - estimatedHeight / 2, margin, window.innerHeight - margin - estimatedHeight);
  return {
    left: clampNumber(rect.left + rect.width / 2 - width / 2, margin, window.innerWidth - margin - width),
    top,
    width,
    maxHeight,
  };
}

function StagePlayFloatingTooltipView({ tooltip }: { tooltip: StagePlayFloatingTooltip | null }) {
  if (!tooltip) return null;
  if (tooltip.kind === "badge") {
    const { badge, observerSources } = tooltip;
    return (
      <div
        className="pointer-events-none fixed z-[80] overflow-y-auto rounded-md border border-cyan-700/70 bg-slate-950/95 p-3 text-left text-xs text-slate-100 shadow-2xl"
        style={{
          left: tooltip.position.left,
          top: tooltip.position.top,
          width: tooltip.position.width,
          maxHeight: tooltip.position.maxHeight,
        }}
        data-testid="stage-play-floating-tooltip"
      >
        <div className="font-semibold text-cyan-100">{badge.title}</div>
        <div className="mt-1 text-slate-300">{badgeActionLine(badge)}</div>
        <div className="mt-2 font-mono text-[11px] leading-snug text-cyan-100">
          {proceduralExpression(badge) || labelize(badge.kind)}
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-slate-400">{badge.plainMeaning}</div>
        {hasStagePlayDataFlowTray(badge) ? (
          <div className="mt-2 rounded border border-slate-800 bg-black/25 p-2 text-[10px] leading-relaxed">
            <div className="font-semibold uppercase tracking-wide text-slate-400">Data flow</div>
            {badge.dataTray?.inputPreview || badge.dataTray?.inputRefs?.length ? (
              <div className="mt-1">
                <span className="text-slate-500">Input:</span>{" "}
                <span className="font-mono text-slate-200">{badge.dataTray.inputPreview ?? badge.dataTray.inputRefs?.slice(0, 2).join(", ")}</span>
              </div>
            ) : null}
            {badge.dataTray?.transformLabel ? (
              <div>
                <span className="text-slate-500">Transform:</span>{" "}
                <span className="font-mono text-cyan-100">{badge.dataTray.transformLabel}</span>
              </div>
            ) : null}
            {badge.dataTray?.outputPreview || badge.dataTray?.outputRefs?.length ? (
              <div>
                <span className="text-slate-500">Output:</span>{" "}
                <span className="font-mono text-emerald-100">{badge.dataTray.outputPreview ?? badge.dataTray.outputRefs?.slice(0, 2).join(", ")}</span>
              </div>
            ) : null}
            {badge.dataTray?.skipped?.length ? (
              <div>
                <span className="text-slate-500">Skipped:</span>{" "}
                <span className="font-mono text-amber-100">{badge.dataTray.skipped.join(", ")}</span>
              </div>
            ) : null}
            {badge.dataTray?.blockedUntil ? (
              <div>
                <span className="text-slate-500">Blocked:</span>{" "}
                <span className="font-mono text-amber-100">{badge.dataTray.blockedUntil}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        {badge.kind === "observer" ? (
          <div className="mt-2 space-y-1">
            {observerSources.slice(0, 5).map((source) => (
              <div key={`${source.sourceId}:${source.modality}`} className="rounded border border-slate-800 bg-black/20 px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-slate-200">{labelize(source.modality)}</span>
                  <span className="text-[10px] text-slate-500">{labelize(source.status)}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-amber-100">
                  {source.routeTo} {source.cadenceMs ? `@ ${source.cadenceMs}ms` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{labelize(badge.kind)}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{labelize(badge.status)}</span>
          {badge.admission ? (
            <span className="rounded border border-amber-700 px-1.5 py-0.5 text-[10px] text-amber-100">{labelize(badge.admission)}</span>
          ) : null}
        </div>
      </div>
    );
  }
  if (tooltip.kind === "output") {
    const { node } = tooltip;
    return (
      <div
        className="pointer-events-none fixed z-[80] overflow-y-auto rounded-md border border-amber-700/70 bg-slate-950/95 p-3 text-left text-xs text-slate-100 shadow-2xl"
        style={{
          left: tooltip.position.left,
          top: tooltip.position.top,
          width: tooltip.position.width,
          maxHeight: tooltip.position.maxHeight,
        }}
        data-testid="stage-play-floating-tooltip"
      >
        <div className="font-semibold text-amber-100">{node.title}</div>
        <div className="mt-1 text-slate-300">{labelize(node.kind)}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{labelize(node.status)}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{node.evidenceRefs.length} ref(s)</span>
        </div>
        <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-500">
          {node.evidenceRefs.slice(0, 4).map((ref) => <div key={ref} className="truncate">{ref}</div>)}
        </div>
      </div>
    );
  }
  const { node } = tooltip;
  return (
    <div
      className="pointer-events-none fixed z-[80] overflow-y-auto rounded-md border border-cyan-700/70 bg-slate-950/95 p-2 text-left text-xs text-slate-100 shadow-2xl"
      style={{
        left: tooltip.position.left,
        top: tooltip.position.top,
        width: tooltip.position.width,
        maxHeight: tooltip.position.maxHeight,
      }}
      data-testid="stage-play-floating-tooltip"
    >
      <div className="font-semibold text-cyan-100">{node.label}</div>
      <div className="mt-1 text-slate-300">{node.role}</div>
      <div className="mt-1 font-mono text-[10px] text-cyan-100">draft.{node.kind} / {laneForDraftNode(node)}</div>
      <div className="mt-1 text-[10px] text-slate-400">{node.parameters.length} parameter(s)</div>
    </div>
  );
}

function StagePlayGraphCanvas({
  graph,
  graphDiff,
  removedBadgeGhosts,
  selectedBadgeIds,
  selectedBadgeId,
  draftNodes,
  selectedDraftNodeId,
  scrollportRef,
  onSelect,
  onSelectDraftNode,
  onProjectLiveAnswer,
}: {
  graph: StagePlayBadgeGraphV1;
  graphDiff: StagePlayGraphDiff | null;
  removedBadgeGhosts: StagePlayRemovedBadgeGhost[];
  selectedBadgeIds: string[];
  selectedBadgeId: string | null;
  draftNodes: DraftStagePlayNode[];
  selectedDraftNodeId: string | null;
  scrollportRef: React.RefObject<HTMLDivElement>;
  onSelect: (badgeId: string) => void;
  onSelectDraftNode: (nodeId: string) => void;
  onProjectLiveAnswer: () => void;
}) {
  const outputNodes = useMemo(() => outputNodesForGraph(graph), [graph]);
  const [floatingTooltip, setFloatingTooltip] = useState<StagePlayFloatingTooltip | null>(null);
  const lanes = useMemo(() => STAGE_PLAY_LANES.map((lane) => ({
    ...lane,
    badges: graph.badges.filter((badge) => laneForBadge(badge) === lane.id),
    outputNodes: outputNodes.filter((node) => node.lane === lane.id),
  })), [graph.badges, outputNodes]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    lanes.forEach((lane, laneIndex) => {
      lane.badges.forEach((badge, rowIndex) => {
        const left = CANVAS_PADDING_X + laneIndex * LANE_STRIDE;
        const top = CANVAS_PADDING_Y + rowIndex * NODE_SLOT_HEIGHT;
        map.set(badge.id, {
          x: left + NODE_WIDTH / 2,
          y: top + NODE_HEIGHT / 2,
        });
      });
    });
    return map;
  }, [lanes]);

  const outputPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    lanes.forEach((lane, laneIndex) => {
      lane.outputNodes.forEach((node, outputIndex) => {
        const left = CANVAS_PADDING_X + laneIndex * LANE_STRIDE;
        const top = CANVAS_PADDING_Y + (lane.badges.length + outputIndex) * NODE_SLOT_HEIGHT;
        map.set(node.id, {
          x: left + NODE_WIDTH / 2,
          y: top + NODE_HEIGHT / 2,
        });
      });
    });
    return map;
  }, [lanes]);

  const width = Math.max(
    1900,
    CANVAS_PADDING_X * 2 + STAGE_PLAY_LANES.length * NODE_WIDTH + (STAGE_PLAY_LANES.length - 1) * LANE_GAP,
    ...draftNodes.map((node) => node.x + NODE_WIDTH),
  );
  const height = Math.max(
    520,
    CANVAS_PADDING_Y * 2 + Math.max(...lanes.map((lane) => lane.badges.length + lane.outputNodes.length), 1) * NODE_SLOT_HEIGHT,
    ...draftNodes.map((node) => node.y + NODE_HEIGHT + DATA_TRAY_HEIGHT),
  );
  const selectedSet = new Set(selectedBadgeIds);
  const addedBadgeIds = new Set(graphDiff?.addedBadgeIds ?? []);
  const updatedBadgeIds = new Set(graphDiff?.updatedBadgeIds ?? []);
  const updatedActionIds = new Set(graphDiff?.updatedActionIds ?? []);
  const perturbedBadgeIds = new Set(
    (graph.perturbations ?? []).slice(0, 5).flatMap((event) => event.affectedBadgeIds),
  );
  const relatedEdgeIds = new Set(
    graph.edges
      .filter((edge: StagePlayBadgeEdgeV1) =>
        selectedBadgeId ? edge.from === selectedBadgeId || edge.to === selectedBadgeId : false,
      )
      .map((edge: StagePlayBadgeEdgeV1) => edge.id),
  );

  return (
    <div
      ref={scrollportRef}
      className="relative min-h-0 flex-1 overflow-auto rounded-md border border-slate-800 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.16)_1px,transparent_0)] [background-size:22px_22px]"
      data-testid="stage-play-badge-graph-scrollport"
    >
      <svg width={width} height={height} className="absolute left-0 top-0">
        <defs>
          <marker id="stage-play-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="rgb(100 116 139)" />
          </marker>
          <marker id="stage-play-dashed-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="rgb(180 83 9)" />
          </marker>
        </defs>
        {graph.edges.map((edge: StagePlayBadgeEdgeV1) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const active = relatedEdgeIds.has(edge.id) || selectedSet.has(edge.from) || selectedSet.has(edge.to);
          const forward = to.x >= from.x;
          const curve = Math.max(42, Math.abs(to.x - from.x) * 0.48);
          const startX = from.x + (forward ? NODE_WIDTH / 2 : -NODE_WIDTH / 2);
          const endX = to.x - (forward ? NODE_WIDTH / 2 : -NODE_WIDTH / 2);
          return (
            <g key={edge.id}>
              <path
                d={`M ${startX} ${from.y} C ${startX + (forward ? curve : -curve)} ${from.y}, ${endX - (forward ? curve : -curve)} ${to.y}, ${endX} ${to.y}`}
                fill="none"
                stroke={active ? "rgb(34 211 238)" : "rgb(51 65 85)"}
                strokeWidth={active ? 2 : 1}
                markerEnd="url(#stage-play-arrow)"
              />
            </g>
          );
        })}
        {outputNodes.flatMap((node) => node.relatedBadgeIds.slice(0, 4).map((badgeId) => {
          const from = positions.get(badgeId);
          const to = outputPositions.get(node.id);
          if (!from || !to) return null;
          const active = selectedSet.has(badgeId);
          return (
            <path
              key={`${node.id}:${badgeId}`}
              d={`M ${from.x + NODE_WIDTH / 2} ${from.y} C ${from.x + NODE_WIDTH / 2 + 34} ${from.y}, ${to.x - NODE_WIDTH / 2 - 34} ${to.y}, ${to.x - NODE_WIDTH / 2} ${to.y}`}
              fill="none"
              stroke={active ? "rgb(251 191 36)" : "rgb(120 113 108)"}
              strokeDasharray="4 4"
              strokeWidth={active ? 2 : 1}
              markerEnd="url(#stage-play-dashed-arrow)"
            />
          );
        }))}
      </svg>
      <div className="relative" style={{ width, height }}>
        {lanes.map((lane, laneIndex) => (
          <div
            key={lane.id}
            className="pointer-events-none absolute bottom-0 top-0 border-l border-slate-900/55"
            style={{ left: CANVAS_PADDING_X + laneIndex * LANE_STRIDE - LANE_GAP / 2, width: NODE_WIDTH + LANE_GAP }}
            data-testid={`stage-play-lane-${lane.id}`}
            aria-hidden="true"
          />
        ))}
        {graph.badges.map((badge: StagePlayBadgeV1) => {
          const point = positions.get(badge.id);
          if (!point) return null;
          const active = selectedBadgeId === badge.id || selectedSet.has(badge.id);
          const observerSources = badge.kind === "observer" ? graph.sourceWindow.sources ?? [] : [];
          const selectedObserverSourceCount = observerSources.filter((source) => source.selectedForStagePlay).length;
          const isBlocked = badge.kind === "blocked_affordance" || badge.status === "blocked";
          const isMissing = badge.kind === "missing_evidence" || badge.status === "missing_evidence";
          const canProjectFromBadge = badge.id === "interpreter.stage_play_reflection";
          const isNew = addedBadgeIds.has(badge.id);
          const isUpdated = updatedBadgeIds.has(badge.id) ||
            perturbedBadgeIds.has(badge.id) ||
            (badge.kind === "observer" && graphDiff?.sourceWindowChanged === true);
          const tray = badgeTrayView(badge, observerSources);
          const pulseClass = isNew
            ? "animate-pulse ring-2 ring-emerald-300/70 shadow-[0_0_26px_rgba(52,211,153,0.28)]"
            : isUpdated
              ? "ring-1 ring-cyan-300/70 shadow-[0_0_20px_rgba(34,211,238,0.22)]"
              : isMissing
                ? "animate-pulse"
                : "";
          const trayTone = isMissing
            ? "border-amber-800/70 bg-amber-950/25 text-amber-100"
            : isBlocked
              ? "border-rose-800/70 bg-rose-950/25 text-rose-100"
              : "border-slate-800 bg-slate-950/80 text-slate-300";
          return (
            <div
              key={badge.id}
              className="absolute"
              data-testid="stage-play-node-slot"
              style={{
                left: point.x - NODE_WIDTH / 2,
                top: point.y - NODE_HEIGHT / 2,
                width: NODE_WIDTH,
                height: NODE_HEIGHT + DATA_TRAY_HEIGHT,
              }}
              onMouseEnter={(event) => {
                const key = `badge:${badge.id}`;
                setFloatingTooltip({
                  key,
                  kind: "badge",
                  badge,
                  observerSources,
                  position: floatingTooltipPosition(
                    event.currentTarget?.getBoundingClientRect(),
                    { estimatedHeight: badge.kind === "observer" ? 340 : 230 },
                  ),
                });
              }}
              onMouseMove={(event) => {
                const key = `badge:${badge.id}`;
                const rect = event.currentTarget?.getBoundingClientRect();
                setFloatingTooltip((current) => current?.key === key
                  ? {
                      ...current,
                      position: floatingTooltipPosition(
                        rect,
                        { estimatedHeight: badge.kind === "observer" ? 340 : 230 },
                      ),
                    }
                  : current);
              }}
              onMouseLeave={() => {
                const key = `badge:${badge.id}`;
                setFloatingTooltip((current) => current?.key === key ? null : current);
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(badge.id)}
                className={`relative flex flex-col items-center justify-center rounded-md border px-3 text-center text-xs transition ${
                  active
                    ? "border-cyan-400 bg-cyan-950/70 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.2)]"
                    : isBlocked
                      ? "border-rose-600 bg-rose-950/35 text-rose-100 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.25)] hover:border-rose-400"
                      : isMissing
                        ? "border-amber-600 bg-amber-950/35 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)] hover:border-amber-400"
                      : `${kindTone(badge.kind)} text-slate-200 hover:border-slate-500`
                } ${pulseClass}`}
                style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
                aria-label={badge.title}
                data-testid="stage-play-graph-node"
              >
                {isBlocked ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-rose-200 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                  />
                ) : null}
                {badge.kind === "observer" ? (
                  <RadioTower className="h-5 w-5 text-amber-100" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`${badge.kind === "procedural_binding" ? "h-5 w-12 rounded-sm" : "h-3.5 w-3.5 rounded-full"} border ${
                      active
                        ? "border-cyan-100 bg-cyan-300"
                        : badge.status === "blocked"
                          ? "border-rose-300 bg-rose-500/80"
                          : badge.kind === "procedural_binding"
                            ? "border-violet-300 bg-violet-500/80"
                            : badge.kind === "intent_module"
                              ? "border-cyan-300 bg-cyan-500/80"
                              : "border-slate-300 bg-slate-500/80"
                    }`}
                  />
                )}
                {badge.kind === "observer" ? (
                  <>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">Observer</span>
                    <span className="font-mono text-[9px] text-slate-400">{selectedObserverSourceCount}/{observerSources.length} routed</span>
                  </>
                ) : null}
              </button>
              <div
                className={`mt-2 overflow-hidden rounded-md border px-2 py-1.5 text-[10px] shadow-[0_8px_18px_rgba(2,6,23,0.28)] ${trayTone}`}
                style={{ width: NODE_WIDTH, height: DATA_TRAY_HEIGHT }}
                data-testid="stage-play-data-tray"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold uppercase tracking-wide">{tray.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="truncate font-mono text-[9px] text-slate-500">{tray.metric}</span>
                    <CopyStagePlayRefsButton refs={stagePlayDataFlowRefs(badge)} label={`Copy refs for ${badge.title}`} />
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                  {tray.summary}
                </div>
                {canProjectFromBadge ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onProjectLiveAnswer();
                    }}
                    className="mt-1 h-5 w-full rounded border border-emerald-700 bg-emerald-950/70 px-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-100 hover:border-emerald-400"
                    data-testid="stage-play-project-live-answer-interpreter"
                  >
                    Project Interpretation
                  </button>
                ) : (
                  <div className="mt-1 truncate font-mono text-[9px] text-slate-600">{tray.detail}</div>
                )}
              </div>
            </div>
          );
        })}
        {removedBadgeGhosts.map((ghost) => {
          const laneIndex = STAGE_PLAY_LANES.findIndex((lane) => lane.id === ghost.lane);
          const left = CANVAS_PADDING_X + Math.max(0, laneIndex) * LANE_STRIDE;
          const top = CANVAS_PADDING_Y + ghost.rowIndex * NODE_SLOT_HEIGHT;
          const point = {
            x: left + NODE_WIDTH / 2,
            y: top + NODE_HEIGHT / 2,
          };
          return (
            <div
              key={`removed:${ghost.id}`}
              className="pointer-events-none absolute flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/45 px-2 text-center text-[10px] uppercase tracking-wide text-slate-400 opacity-50 shadow-[0_0_18px_rgba(148,163,184,0.16)]"
              style={{
                left: point.x - NODE_WIDTH / 2,
                top: point.y - NODE_HEIGHT / 2,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
              data-testid="stage-play-removed-ghost"
            >
              <span className="truncate">removed {labelize(ghost.kind)}</span>
            </div>
          );
        })}
        {outputNodes.map((node) => {
          const point = outputPositions.get(node.id);
          if (!point) return null;
          const actionId = node.id.startsWith("synthetic:action:")
            ? node.id.replace("synthetic:action:", "")
            : null;
          const outputPulse = actionId && updatedActionIds.has(actionId)
            ? "ring-1 ring-cyan-300/70 shadow-[0_0_20px_rgba(34,211,238,0.22)]"
            : node.status === "missing_evidence"
              ? "animate-pulse"
              : "";
          const left = point.x - NODE_WIDTH / 2;
          const top = point.y - NODE_HEIGHT / 2;
          const trayTone = node.status === "missing_evidence"
            ? "border-amber-800/70 bg-amber-950/25 text-amber-100"
            : node.status === "blocked"
              ? "border-rose-800/70 bg-rose-950/25 text-rose-100"
              : "border-slate-800 bg-slate-950/80 text-slate-300";
          const tray = syntheticNodeTrayView(node);
          return (
            <div
              key={node.id}
              className="absolute"
              data-testid="stage-play-node-slot"
              style={{ left, top, width: NODE_WIDTH, height: NODE_HEIGHT + DATA_TRAY_HEIGHT }}
            >
              <button
                type="button"
                onClick={() => {
                  if (node.relatedBadgeIds[0]) onSelect(node.relatedBadgeIds[0]);
                }}
                className={`flex items-center justify-center rounded-md border px-2 text-center text-[10px] font-semibold uppercase tracking-wide transition ${syntheticNodeTone(node)} hover:border-cyan-400 ${outputPulse}`}
                style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
                aria-label={node.title}
                data-testid="stage-play-output-node"
                onMouseEnter={(event) => {
                  const key = `output:${node.id}`;
                  setFloatingTooltip({
                    key,
                    kind: "output",
                    node,
                    position: floatingTooltipPosition(event.currentTarget?.getBoundingClientRect(), { estimatedHeight: 190 }),
                  });
                }}
                onMouseMove={(event) => {
                  const key = `output:${node.id}`;
                  const rect = event.currentTarget?.getBoundingClientRect();
                  setFloatingTooltip((current) => current?.key === key
                    ? {
                        ...current,
                        position: floatingTooltipPosition(rect, { estimatedHeight: 190 }),
                      }
                    : current);
                }}
                onMouseLeave={() => {
                  const key = `output:${node.id}`;
                  setFloatingTooltip((current) => current?.key === key ? null : current);
                }}
              >
                {node.kind === "validation" ? (
                  <span className="text-base" aria-hidden="true">{node.status === "blocked" ? "x" : "ok"}</span>
                ) : node.kind === "prediction" ? (
                  <span aria-hidden="true">-&gt;</span>
                ) : node.kind === "live_answer" ? (
                  <span className="font-mono text-[10px]" aria-hidden="true">OUT</span>
                ) : node.status === "missing_evidence" ? (
                  <span aria-hidden="true">?</span>
                ) : (
                  <span aria-hidden="true">.</span>
                )}
              </button>
              <div
                className={`mt-2 overflow-hidden rounded-md border px-2 py-1.5 text-[10px] shadow-[0_8px_18px_rgba(2,6,23,0.28)] ${trayTone}`}
                style={{ width: NODE_WIDTH, height: DATA_TRAY_HEIGHT }}
                data-testid="stage-play-data-tray"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold uppercase tracking-wide">{tray.title}</span>
                  <span className="shrink-0 truncate font-mono text-[9px] text-slate-500">{tray.metric}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                  {tray.summary}
                </div>
                {node.kind === "live_answer" ? (
                  <button
                    type="button"
                    onClick={onProjectLiveAnswer}
                    className="mt-1 h-5 w-full rounded border border-emerald-700 bg-emerald-950/80 px-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-100 hover:border-emerald-400"
                    data-testid="stage-play-project-live-answer-output"
                  >
                    Project Interpretation
                  </button>
                ) : (
                  <div className="mt-1 truncate font-mono text-[9px] text-slate-600">{tray.detail}</div>
                )}
              </div>
            </div>
          );
        })}
        {draftNodes.map((node) => (
          <button
            type="button"
            key={node.id}
            className={`absolute flex h-12 w-12 items-center justify-center rounded-sm border-2 shadow-lg transition ${
              selectedDraftNodeId === node.id
                ? "border-cyan-300 bg-cyan-950/70 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
                : kindTone(node.kind)
            }`}
            style={{ left: node.x - 24, top: node.y - 24 }}
            aria-label={`Draft ${node.label} node`}
            data-testid="stage-play-draft-node"
            onClick={() => onSelectDraftNode(node.id)}
            onMouseEnter={(event) => {
              const key = `draft:${node.id}`;
              setFloatingTooltip({
                key,
                kind: "draft",
                node,
                position: floatingTooltipPosition(event.currentTarget?.getBoundingClientRect(), { width: 224, estimatedHeight: 130 }),
              });
            }}
            onMouseMove={(event) => {
              const key = `draft:${node.id}`;
              const rect = event.currentTarget?.getBoundingClientRect();
              setFloatingTooltip((current) => current?.key === key
                ? {
                    ...current,
                    position: floatingTooltipPosition(rect, { width: 224, estimatedHeight: 130 }),
                  }
                : current);
            }}
            onMouseLeave={() => {
              const key = `draft:${node.id}`;
              setFloatingTooltip((current) => current?.key === key ? null : current);
            }}
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 rounded-sm border border-cyan-200 bg-cyan-400/80"
            />
          </button>
        ))}
        <StagePlayFloatingTooltipView tooltip={floatingTooltip} />
      </div>
    </div>
  );
}

function DraftNodeParameterEditor({
  node,
  sourceOptions,
  draftValidation,
  onClose,
  onRemove,
  onUpdateParameter,
  onAddParameter,
  onSetSourceClass,
  onApplySourceOption,
}: {
  node: DraftStagePlayNode;
  sourceOptions: StagePlaySourceOption[];
  draftValidation?: StagePlayGraphDraftValidationV1 | null;
  onClose: () => void;
  onRemove: (nodeId: string) => void;
  onUpdateParameter: (nodeId: string, parameterId: string, field: "key" | "value", value: string) => void;
  onAddParameter: (nodeId: string) => void;
  onSetSourceClass: (nodeId: string, sourceClass: string) => void;
  onApplySourceOption: (nodeId: string, option: StagePlaySourceOption) => void;
}) {
  const selectedSourceClass = readDraftParameter(node, "source_class");
  const matchingSourceOptions = sourceOptions.filter((option) =>
    !selectedSourceClass || option.sourceClass === selectedSourceClass,
  );
  const sourceClassOptions = Array.from(new Set([
    ...STAGE_PLAY_SOURCE_CLASSES,
    ...sourceOptions.map((option) => option.sourceClass),
  ])).filter(Boolean).sort((a, b) => a.localeCompare(b));

  return (
    <aside
      data-testid="stage-play-draft-parameter-editor"
      className="absolute right-3 top-3 z-30 w-80 rounded-md border border-slate-800 bg-slate-950/95 p-3 text-slate-100 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Draft Parameters</div>
          <div className="mt-0.5 text-base font-semibold leading-tight">{node.label}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">draft.{node.kind}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRemove(node.id)}
            className="rounded border border-rose-800/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-200 hover:border-rose-500"
            aria-label="Remove draft node"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:border-slate-500"
            aria-label="Close draft parameters"
          >
            Close
          </button>
        </div>
      </div>

      {node.kind === "source" ? (
        <div className="mt-3 rounded-md border border-sky-800/70 bg-sky-950/20 p-3">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">
            Source class
            <select
              value={selectedSourceClass}
              onChange={(event) => onSetSourceClass(node.id, event.target.value)}
              className="mt-1 h-8 w-full rounded border border-slate-800 bg-slate-950 px-2 text-xs normal-case tracking-normal text-slate-100 outline-none focus:border-sky-500"
              aria-label="Source class"
            >
              <option value="">Choose source class</option>
              {sourceClassOptions.map((sourceClass) => (
                <option key={sourceClass} value={sourceClass}>{labelize(sourceClass)}</option>
              ))}
            </select>
          </label>
          <div className="mt-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active sources</div>
            {matchingSourceOptions.length === 0 ? (
              <div className="rounded border border-slate-800 bg-black/20 p-2 text-[11px] text-slate-500">
                No matching source handle is active for this class.
              </div>
            ) : matchingSourceOptions.slice(0, 8).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onApplySourceOption(node.id, option)}
                className="w-full rounded border border-slate-800 bg-black/20 p-2 text-left text-xs text-slate-200 hover:border-sky-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{option.label}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{labelize(option.status)}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-sky-100">{option.sourceClass} / {option.sourceId}</div>
                <div className="mt-1 truncate text-[10px] text-slate-500">
                  {option.descriptorId ?? "no descriptor"} / {option.producerId ?? "no producer"}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {node.parameters.map((parameter) => (
          <div key={parameter.id} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <Input
              value={parameter.key}
              onChange={(event) => onUpdateParameter(node.id, parameter.id, "key", event.target.value)}
              aria-label={`Parameter key ${parameter.key}`}
              className="h-8 border-slate-800 bg-slate-950 text-xs text-slate-100"
            />
            <Input
              value={parameter.value}
              onChange={(event) => onUpdateParameter(node.id, parameter.id, "value", event.target.value)}
              aria-label={`Parameter value ${parameter.key}`}
              placeholder="value"
              className="h-8 border-slate-800 bg-slate-950 text-xs text-slate-100 placeholder:text-slate-600"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAddParameter(node.id)}
        className="mt-3 w-full rounded-md border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:border-cyan-400"
      >
        Add parameter
      </button>
      <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Manual parameters stay local until a future admission path explicitly persists them.
      </div>
      <div
        data-testid="stage-play-draft-validation-status"
        className={`mt-3 rounded-md border p-3 text-xs ${
          draftValidation?.ok
            ? "border-emerald-800 bg-emerald-950/25 text-emerald-100"
            : draftValidation
              ? "border-amber-800 bg-amber-950/25 text-amber-100"
              : "border-slate-800 bg-black/20 text-slate-400"
        }`}
      >
        <div className="font-semibold">
          {draftValidation?.ok ? "Draft accepted" : draftValidation ? "Draft needs checks" : "Draft not submitted"}
        </div>
        {draftValidation ? (
          <div className="mt-2 space-y-1">
            <div className="font-mono text-[10px] text-slate-300">{draftValidation.schemaVersion}</div>
            {draftValidation.resolvedSourceIds.length > 0 ? (
              <div>Resolved source: {draftValidation.resolvedSourceIds.join(", ")}</div>
            ) : null}
            {draftValidation.issues.slice(0, 3).map((issue) => (
              <div key={issue}>Issue: {issue}</div>
            ))}
            {draftValidation.warnings.slice(0, 2).map((warning) => (
              <div key={warning}>Warning: {warning}</div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function StagePlayBindingOverlay({
  graph,
  builderContext,
  sourceOptions,
  draftNodeCount,
  draftValidation,
  query,
  setQuery,
  groupedBadges,
  activeFilterKind,
  setActiveFilterKind,
  selectedBadgeId,
  selectedBadgeIds,
  setSelectedBadgeIds,
  toggleSelectedBadgeId,
  selectedBadge,
  relatedEdges,
  relatedBadges,
  relatedActions,
  onStartBuilderDrag,
  onObserverDraftAction,
  sourceSetupCadenceMs,
  sourceSetupStatus,
  onSetSourceSetupCadenceMs,
  onStartVisualSourceSetup,
  onAttachAudioTranscriptSource,
  onPauseVisualSourceSetup,
  onProjectLiveAnswer,
  onCheckpointQueueAction,
  sourceAuditSelection,
  rawSessionBufferEntries,
  rawSessionBufferLoading,
  onOpenSourceAudit,
  onClearRawSessionBuffer,
  onClearSelectedBadge,
  onClose,
}: {
  graph: StagePlayBadgeGraphV1;
  builderContext?: StagePlayBuilderContextResponse | null;
  sourceOptions: StagePlaySourceOption[];
  draftNodeCount: number;
  draftValidation?: StagePlayGraphDraftValidationV1 | null;
  query: string;
  setQuery: (value: string) => void;
  groupedBadges: { kind: string; badges: StagePlayBadgeV1[] }[];
  activeFilterKind: string | null;
  setActiveFilterKind: (kind: string | null) => void;
  selectedBadgeId: string | null;
  selectedBadgeIds: string[];
  setSelectedBadgeIds: (badgeIds: string[]) => void;
  toggleSelectedBadgeId: (badgeId: string) => void;
  selectedBadge: StagePlayBadgeV1 | null;
  relatedEdges: StagePlayBadgeEdgeV1[];
  relatedBadges: StagePlayBadgeV1[];
  relatedActions: StagePlayBadgeGraphRecommendedActionV1[];
  onStartBuilderDrag: (nodeType: StagePlayNodeBuilderType, event: React.PointerEvent<HTMLButtonElement>) => void;
  onObserverDraftAction: (source: StagePlayObserverSource | null, action: StagePlayObserverDraftAction) => void;
  sourceSetupCadenceMs: number;
  sourceSetupStatus: StagePlaySourceSetupStatus;
  onSetSourceSetupCadenceMs: (cadenceMs: number) => void;
  onStartVisualSourceSetup: (surface: StagePlayVisualCaptureSurface) => void;
  onAttachAudioTranscriptSource: (source: StagePlayAudioTranscriptSource) => void;
  onPauseVisualSourceSetup: () => void;
  onProjectLiveAnswer: () => void;
  onCheckpointQueueAction: (action: StagePlayCheckpointQueueAction, requestId?: string | null) => void;
  sourceAuditSelection: StagePlaySourceAuditSelection;
  rawSessionBufferEntries: StagePlayRawSessionBufferEntryV1[];
  rawSessionBufferLoading: boolean;
  onOpenSourceAudit: (source: StagePlayObserverSource, mode: StagePlaySourceAuditMode) => void;
  onClearRawSessionBuffer: (source: StagePlayObserverSource | null) => void;
  onClearSelectedBadge: () => void;
  onClose: () => void;
}) {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const selectedBadges = graph.badges.filter((badge) => selectedBadgeIds.includes(badge.id));
  const selectedExpression = selectedBadges.length > 0
    ? selectedBadges.map((badge) => proceduralExpression(badge) || badge.id).join(" + ")
    : "Click badges in the map to assemble a procedural trace.";
  const liveNodeGroups = activeFilterKind ? groupedBadges : [];
  const visibleBadges = liveNodeGroups.flatMap((group) => group.badges);

  function addNodeType(kind: StagePlayBadgeV1["kind"]) {
    const matchingIds = graph.badges.filter((badge) => badge.kind === kind).map((badge) => badge.id);
    setActiveFilterKind(kind);
    if (matchingIds.length > 0) {
      setSelectedBadgeIds(Array.from(new Set([...selectedBadgeIds, ...matchingIds])));
    }
  }
  const consoleTitle = selectedNodeConsoleTitle(selectedBadge);
  const consoleDescription = selectedNodeConsoleDescription(selectedBadge);

  return (
    <aside
      data-testid="stage-play-binding-overlay"
      className="absolute bottom-3 left-3 top-3 z-30 flex w-[340px] flex-col rounded-md border border-slate-800 bg-slate-950/95 text-slate-100 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Stage Console</div>
          <div className="mt-0.5 text-base font-semibold leading-tight">{consoleTitle}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {consoleDescription}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-700 p-1.5 text-slate-300 hover:border-slate-500 hover:text-slate-100"
          aria-label={t("stagePlay.action.closeConsole")}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {!selectedBadge ? (
        <div className="border-b border-slate-800 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search live badges"
              className="h-9 border-slate-800 bg-slate-950 pl-8 text-slate-100 placeholder:text-slate-600"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 p-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{selectedBadge.title}</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{selectedBadge.id}</div>
          </div>
          <button
            type="button"
            onClick={onClearSelectedBadge}
            className="shrink-0 rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:border-cyan-500 hover:text-cyan-100"
          >
            Builder Palette
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedBadge ? (
          <Inspector
            badge={selectedBadge}
            relatedEdges={relatedEdges}
            relatedBadges={relatedBadges}
            relatedActions={relatedActions}
            observerSources={graph.sourceWindow.sources}
            answerSnapshots={graph.badges.filter((entry) => entry.kind === "answer_snapshot")}
            onObserverDraftAction={onObserverDraftAction}
            sourceSetupCadenceMs={sourceSetupCadenceMs}
            sourceSetupStatus={sourceSetupStatus}
            onSetSourceSetupCadenceMs={onSetSourceSetupCadenceMs}
            onStartVisualSourceSetup={onStartVisualSourceSetup}
            onAttachAudioTranscriptSource={onAttachAudioTranscriptSource}
            onPauseVisualSourceSetup={onPauseVisualSourceSetup}
            onProjectLiveAnswer={onProjectLiveAnswer}
            onCheckpointQueueAction={onCheckpointQueueAction}
            sourceAuditSelection={sourceAuditSelection}
            rawSessionBufferEntries={rawSessionBufferEntries}
            rawSessionBufferLoading={rawSessionBufferLoading}
            onOpenSourceAudit={onOpenSourceAudit}
            onClearRawSessionBuffer={onClearRawSessionBuffer}
          />
        ) : (
          <>
        <Section title="Builder Palette">
          <div className="space-y-2">
            {STAGE_PLAY_NODE_BUILDER_TYPES.map((nodeType) => {
              const count = graph.summary.kindCounts[nodeType.kind] ?? 0;
              const active = activeFilterKind === nodeType.kind;
              return (
                <button
                  key={nodeType.kind}
                  type="button"
                  onPointerDown={(event) => onStartBuilderDrag(nodeType, event)}
                  onClick={() => addNodeType(nodeType.kind)}
                  className={`w-full rounded-md border p-2 text-left transition ${
                    active
                      ? "border-cyan-500 bg-cyan-950/45"
                      : "border-slate-800 bg-black/20 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{nodeType.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{nodeType.role}</div>
                    </div>
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Tool assembly">
          <div data-testid="stage-play-builder-artifacts" className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="border-cyan-800 text-cyan-100">
                {builderContext?.catalog.schemaVersion ?? "stage_play_builder_catalog/v1"}
              </Badge>
              <Badge variant="outline" className="border-cyan-800 text-cyan-100">
                {builderContext?.sourceQuery.schemaVersion ?? "stage_play_source_query/v1"}
              </Badge>
              <Badge variant="outline" className="border-cyan-800 text-cyan-100">
                {draftValidation?.schemaVersion ?? "stage_play_graph_draft_validation/v1"}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="font-mono text-sm text-slate-100">{sourceOptions.length}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">sources</div>
              </div>
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="font-mono text-sm text-slate-100">{draftNodeCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">draft nodes</div>
              </div>
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="font-mono text-sm text-slate-100">
                  {draftValidation ? (draftValidation.ok ? "ok" : "check") : "idle"}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">validation</div>
              </div>
            </div>
            {draftValidation ? (
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="font-semibold text-slate-200">
                  {draftValidation.ok ? "Draft accepted by builder contract." : "Draft needs checks before reflection."}
                </div>
                {draftValidation.issues.length > 0 ? (
                  <div className="mt-1 text-amber-100">{draftValidation.issues[0]}</div>
                ) : draftValidation.warnings.length > 0 ? (
                  <div className="mt-1 text-slate-400">{draftValidation.warnings[0]}</div>
                ) : (
                  <div className="mt-1 text-slate-400">Evidence-only validation; no execution permission granted.</div>
                )}
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Source handles">
          <div className="space-y-1.5 text-xs">
            {sourceOptions.length === 0 ? (
              <div className="rounded border border-slate-800 bg-black/20 p-2 text-slate-500">
                No active source handles are available to stage.
              </div>
            ) : sourceOptions.slice(0, 6).map((option) => (
              <div key={option.id} className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-100">{option.label}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{labelize(option.status)}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-cyan-100">{option.sourceClass} / {option.sourceId}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Procedure Trace">
          <div className="font-mono text-xs leading-relaxed text-cyan-100">{selectedExpression}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedBadges.map((badge) => (
              <Badge key={badge.id} variant="outline" className="border-cyan-700 text-cyan-100">
                {badge.title}
              </Badge>
            ))}
          </div>
        </Section>

        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {activeFilterKind ? `${labelize(activeFilterKind)} evidence nodes` : "Evidence Nodes"}
            </div>
            {activeFilterKind ? (
              <button
                type="button"
                onClick={() => setActiveFilterKind(null)}
                className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:border-slate-500"
              >
                Show all
              </button>
            ) : null}
          </div>
          {!activeFilterKind ? (
            <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-500">
              Choose a builder palette type above to stage matching evidence nodes onto the graph assembly.
            </div>
          ) : visibleBadges.length === 0 ? (
            <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-500">
              This node type is ready for tool-call assembly, but no admitted live source has filled it yet.
            </div>
          ) : liveNodeGroups.map((group) => (
            <div key={group.kind}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{labelize(group.kind)}</div>
              <div className="space-y-2">
                {group.badges.map((badge) => (
                  <BadgeButton
                    key={badge.id}
                    badge={badge}
                    selected={selectedBadgeId === badge.id || selectedBadgeIds.includes(badge.id)}
                    onSelect={() => toggleSelectedBadgeId(badge.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

          </>
        )}
      </div>
    </aside>
  );
}

function Inspector({
  badge,
  relatedEdges,
  relatedBadges,
  relatedActions,
  observerSources,
  answerSnapshots,
  onObserverDraftAction,
  sourceSetupCadenceMs,
  sourceSetupStatus,
  onSetSourceSetupCadenceMs,
  onStartVisualSourceSetup,
  onAttachAudioTranscriptSource,
  onPauseVisualSourceSetup,
  onProjectLiveAnswer,
  onCheckpointQueueAction,
  sourceAuditSelection,
  rawSessionBufferEntries,
  rawSessionBufferLoading,
  onOpenSourceAudit,
  onClearRawSessionBuffer,
}: {
  badge: StagePlayBadgeV1 | null;
  relatedEdges: StagePlayBadgeEdgeV1[];
  relatedBadges: StagePlayBadgeV1[];
  relatedActions: StagePlayBadgeGraphRecommendedActionV1[];
  observerSources: StagePlayObserverSource[];
  answerSnapshots: StagePlayBadgeV1[];
  onObserverDraftAction: (source: StagePlayObserverSource | null, action: StagePlayObserverDraftAction) => void;
  sourceSetupCadenceMs: number;
  sourceSetupStatus: StagePlaySourceSetupStatus;
  onSetSourceSetupCadenceMs: (cadenceMs: number) => void;
  onStartVisualSourceSetup: (surface: StagePlayVisualCaptureSurface) => void;
  onAttachAudioTranscriptSource: (source: StagePlayAudioTranscriptSource) => void;
  onPauseVisualSourceSetup: () => void;
  onProjectLiveAnswer: () => void;
  onCheckpointQueueAction: (action: StagePlayCheckpointQueueAction, requestId?: string | null) => void;
  sourceAuditSelection: StagePlaySourceAuditSelection;
  rawSessionBufferEntries: StagePlayRawSessionBufferEntryV1[];
  rawSessionBufferLoading: boolean;
  onOpenSourceAudit: (source: StagePlayObserverSource, mode: StagePlaySourceAuditMode) => void;
  onClearRawSessionBuffer: (source: StagePlayObserverSource | null) => void;
}) {
  if (!badge) {
    return (
      <aside className="min-h-0 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/75 p-4 text-sm text-slate-400">
        Select a Stage Play badge to inspect live bindings, affordances, procedural bindings, evidence, and admission.
      </aside>
    );
  }

  const expression = proceduralExpression(badge);
  const sourceControl = badge.kind === "source"
    ? observerSources.find((source) =>
      badge.subjects.includes(source.sourceId) ||
      badge.evidenceRefs.some((ref) => source.evidenceRefs.includes(ref)) ||
      badge.sourceRefs.some((ref) => source.evidenceRefs.includes(ref.id))
    ) ?? null
    : null;
  const matchingObserverSources = observerSources.filter((source) =>
    badge.evidenceRefs.some((ref) => source.evidenceRefs.includes(ref)) ||
    badge.sourceRefs.some((ref) => source.evidenceRefs.includes(ref.id) || ref.id === source.sourceId) ||
    badge.subjects.includes(source.sourceId)
  );
  const displayEvidenceRefs = uniqueSorted([
    ...badge.evidenceRefs,
    ...(badge.dataTray?.evidenceRefs ?? []),
    ...badge.sourceRefs.map((ref) => `${ref.kind}:${ref.id}`),
  ]);
  const isOutputNode = badge.kind === "answer_snapshot" || badge.kind === "live_output" || badge.kind === "voice_output";
  const citedAnswerSnapshot = badge.kind === "live_output" || badge.kind === "voice_output"
    ? findCitedModelReviewedAnswerSnapshot(badge, answerSnapshots)
    : null;
  const voiceBoundaryPassed = Boolean(
    citedAnswerSnapshot &&
    badge.output?.voiceEligible === true &&
    badge.output.state === "model_reviewed",
  );
  const checkpointRequestId = badge.sourceRefs.find((ref) => ref.kind === "stage_play_checkpoint_request")?.id ??
    badge.evidenceRefs.find((ref) => ref.startsWith("stage_play_checkpoint_request:")) ??
    null;
  const isSelectedSpecificNode = [
    "observer",
    "source",
    "compact_observation",
    "procedural_binding",
    "ask_checkpoint",
    "helix_ask_checkpoint",
    "checkpoint_request",
    "answer_snapshot",
    "live_output",
    "voice_output",
  ].includes(badge.kind) || badge.id === "interpreter.stage_play_reflection";
  const showGenericLiveBindings = !isSelectedSpecificNode && badge.liveBindings.length > 0;
  const showAffordanceSection = badge.kind === "affordance" || badge.kind === "blocked_affordance";
  const showIntentSection = badge.kind === "intent_module";
  const showMissingEvidenceSection = badge.kind === "missing_evidence" || badge.missingEvidence.length > 0;
  const showAdmissionSection = !isOutputNode && (Boolean(badge.admission) || relatedActions.length > 0);
  const showGenericSourceRefs = !isSelectedSpecificNode && badge.sourceRefs.length > 0;
  const showGenericRelatedBadges = !["compact_observation", "ask_checkpoint", "helix_ask_checkpoint", "checkpoint_request", "answer_snapshot", "live_output", "voice_output"].includes(badge.kind) &&
    (relatedEdges.length > 0 || relatedBadges.length > 0);

  return (
    <aside
      className="min-h-0 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/75 p-4"
      data-testid={inspectorTestIdForBadge(badge)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">{badge.title}</div>
          <div className="mt-1 font-mono text-xs text-slate-500">{badge.id}</div>
        </div>
        <Badge variant="outline" className={statusTone(badge.status)}>
          {labelize(badge.status)}
        </Badge>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Section title="Meaning">
          <p>{badge.plainMeaning}</p>
          <p className="mt-2 text-xs text-slate-400">{badge.whyItMatters}</p>
        </Section>

        <StagePlayDataFlowSection badge={badge} />

        {badge.id === "workstation_state_plane.terminal_authority" ? (
          <>
            <Section title="Terminal Boundary">
              <div className="space-y-2 text-xs">
                <div
                  className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-amber-100"
                  data-testid="stage-play-terminal-authority-boundary"
                >
                  {badge.dataTray?.blockedUntil
                    ? `Blocked until ${badge.dataTray.blockedUntil}.`
                    : "Completed solver path has selected the current terminal answer."}
                </div>
                <div className="rounded border border-slate-800 bg-black/20 p-2 text-slate-300">
                  {badge.plainMeaning}
                </div>
              </div>
            </Section>
            <Section title="Observation Sources">
              <div className="flex flex-wrap gap-1" data-testid="stage-play-terminal-authority-skipped-sources">
                {(badge.dataTray?.skipped ?? []).length > 0 ? badge.dataTray?.skipped?.map((entry) => (
                  <Badge key={entry} variant="outline" className="border-amber-800/70 bg-amber-950/20 text-amber-100">
                    {labelize(entry)}
                  </Badge>
                )) : (
                  <span className="text-xs text-slate-500">No skipped observation sources recorded.</span>
                )}
              </div>
            </Section>
            <Section title="Authority Refs">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No terminal authority refs recorded.</span>}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "compact_observation" ? (
          <>
            <Section title="Evidence Refs">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No evidence refs recorded.</span>}
              </div>
            </Section>
            <Section title="Audit Links">
              <div className="space-y-2 text-xs">
                {badge.dataTray?.summary ? (
                  <div className="rounded border border-slate-800 bg-black/20 p-2 text-slate-300">
                    {badge.dataTray.summary}
                  </div>
                ) : null}
                {matchingObserverSources.length > 0 ? matchingObserverSources.map((source) => (
                  <div key={`${source.sourceId}:audit`} className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-100">{labelize(source.modality)}</span>
                      <Badge variant="outline" className={statusTone(source.status === "active" ? "observed" : source.status === "configured_missing" ? "missing_evidence" : source.status)}>
                        {labelize(source.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenSourceAudit(source, "source_evidence")}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                      >
                        Review source evidence
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenSourceAudit(source, "compact_observation")}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                      >
                        Open compact observation
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenSourceAudit(source, "raw_buffer")}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                      >
                        Open raw buffer preview
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded border border-slate-800 bg-black/20 p-2 text-slate-500">
                    No routed source matched this compact observation yet.
                  </div>
                )}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "procedural_binding" ? (
          <>
            <Section title="Expression">
              <div className="rounded border border-slate-800 bg-black/30 p-2 font-mono text-xs text-cyan-100">
                {expression || "No procedural expression for this badge."}
              </div>
            </Section>
            <Section title="Supporting Badges">
              <div className="space-y-2">
                {relatedEdges.map((edge) => (
                  <div key={edge.id} className="rounded border border-slate-800 bg-black/20 p-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-200">
                      <Link2 className="h-3.5 w-3.5 text-slate-500" />
                      {labelize(edge.relation)}: {edge.label}
                    </div>
                  </div>
                ))}
                {relatedBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {relatedBadges.map((related) => (
                      <Badge key={related.id} variant="outline" className="border-slate-700 text-slate-300">
                        {related.title}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500">No supporting badge edges recorded.</span>
                )}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "ask_checkpoint" || badge.kind === "helix_ask_checkpoint" ? (
          <>
            <Section title="Ask Prompt">
              <div className="space-y-2 text-xs">
                <div>Turn id: <span className="font-mono text-slate-200">{badge.checkpoint?.askTurnId ?? "none"}</span></div>
                <div className="rounded border border-slate-800 bg-black/20 p-2 text-slate-500">
                  Raw prompt text is not embedded in the Stage Play graph; use the Ask turn/debug refs for audit.
                </div>
              </div>
            </Section>
            <Section title="Tool Observation">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No tool observation refs recorded.</span>}
              </div>
            </Section>
            <Section title="Solver / Debug Status">
              <div className="space-y-2 text-xs">
                <div>Model reviewed: <span className="font-mono text-slate-200">{badge.checkpoint?.modelReviewed ? "yes" : "no"}</span></div>
                <div>Solver trace: <span className="font-mono text-slate-200">{badge.checkpoint?.solverTraceRef ?? "none"}</span></div>
                <div>Terminal artifact: <span className="font-mono text-slate-200">{badge.checkpoint?.terminalArtifactKind ?? "none"}</span></div>
                <div>Final answer source: <span className="font-mono text-slate-200">{badge.checkpoint?.finalAnswerSource ?? "none"}</span></div>
                <div className="flex flex-wrap gap-1">
                  {badge.reasonCodes.map((code) => (
                    <Badge key={code} variant="outline" className="border-slate-700 text-slate-300">{code}</Badge>
                  ))}
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "checkpoint_request" ? (
          <>
            <Section title="Checkpoint Request">
              <div className="space-y-2 text-xs">
                <div>Status: <span className="font-mono text-slate-200">{labelize(badge.status)}</span></div>
                <div>Request ref: <span className="font-mono text-slate-200">{checkpointRequestId ?? "missing"}</span></div>
                <div className="rounded border border-slate-800 bg-black/20 p-2 leading-relaxed text-slate-300">
                  {badge.dataTray?.summary ?? "Queued checkpoint request waits for a bounded visible Ask turn."}
                </div>
                <div className="flex flex-wrap gap-1">
                  {badge.reasonCodes.map((code) => (
                    <Badge key={code} variant="outline" className="border-slate-700 text-slate-300">{code}</Badge>
                  ))}
                </div>
              </div>
            </Section>
            <Section title="Queue Controls">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("run", checkpointRequestId)}
                  className="rounded border border-cyan-800 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100 hover:border-cyan-400"
                  data-testid="stage-play-run-checkpoint-inspector"
                >
                  Run checkpoint
                </button>
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("skip", checkpointRequestId)}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-amber-500 hover:text-amber-100"
                  data-testid="stage-play-skip-checkpoint-inspector"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("pause_job")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-amber-500 hover:text-amber-100"
                >
                  Pause job
                </button>
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("resume_job")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-emerald-500 hover:text-emerald-100"
                >
                  Resume job
                </button>
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("clear_queued")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:border-rose-500 hover:text-rose-100"
                >
                  Clear queued checkpoints
                </button>
                <button
                  type="button"
                  onClick={() => onCheckpointQueueAction("end_live_job")}
                  className="rounded border border-rose-900 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-100 hover:border-rose-500"
                >
                  End live job
                </button>
              </div>
            </Section>
            <Section title="Checkpoint Evidence">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No checkpoint request refs recorded.</span>}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "answer_snapshot" ? (
          <>
            <Section title="Upheld Answer">
              <div className="rounded border border-slate-800 bg-black/30 p-2 text-sm leading-relaxed text-slate-100">
                {badge.output?.text ?? badge.dataTray?.summary ?? "No upheld answer text recorded."}
              </div>
            </Section>
            <Section title="Source Refs">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No answer source refs recorded.</span>}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "live_output" || badge.kind === "voice_output" ? (
          <>
            <Section title="Projection State">
              <div className="space-y-2 text-xs">
                <div>Line key: <span className="font-mono text-slate-200">{badge.output?.lineKey ?? "none"}</span></div>
                <div>State: <span className="font-mono text-slate-200">{badge.output?.state ?? "draft"}</span></div>
                <div>Voice eligible: <span className="font-mono text-slate-200">{badge.output?.voiceEligible ? "yes" : "no"}</span></div>
              </div>
            </Section>
            <Section title="Voice Boundary">
              <div className="space-y-2 text-xs">
                <div>
                  Answer snapshot citation:{" "}
                  <span className="font-mono text-slate-200">{citedAnswerSnapshot?.id ?? "missing"}</span>
                </div>
                {voiceBoundaryPassed ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded border border-emerald-700 bg-emerald-950/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 hover:border-emerald-400"
                    data-testid="stage-play-speak-reviewed-answer"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Speak reviewed answer
                  </button>
                ) : (
                  <div
                    className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-amber-100"
                    data-testid="stage-play-voice-boundary-locked"
                  >
                    Voice locked until this output cites a model-reviewed answer snapshot. Raw Stage Play projections and Observer refs cannot speak.
                  </div>
                )}
              </div>
            </Section>
            <Section title="Output Text">
              <div className="rounded border border-slate-800 bg-black/30 p-2 text-sm leading-relaxed text-slate-100">
                {badge.output?.text ?? badge.dataTray?.summary ?? "No output text projected yet."}
              </div>
            </Section>
            <Section title="Source Refs">
              <div className="space-y-1 font-mono text-xs text-slate-400">
                {displayEvidenceRefs.length > 0
                  ? displayEvidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                  : <span>No output source refs recorded.</span>}
              </div>
            </Section>
          </>
        ) : null}

        {badge.kind === "observer" ? (
          <>
          <Section title="Source Setup">
            <div className="space-y-3">
              <div className="rounded border border-slate-800 bg-black/20 p-2 text-[11px] leading-relaxed text-slate-400">
                <div className="font-semibold uppercase tracking-wide text-amber-100">Narrative test defaults</div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>Route: <span className="font-mono text-slate-200">{STAGE_PLAY_SOURCE_SETUP_DEFAULTS.routeTo}</span></div>
                  <div>Visual: <span className="font-mono text-slate-200">{STAGE_PLAY_SOURCE_SETUP_DEFAULTS.visualCadenceMs / 1000}s</span></div>
                  <div>Audio: <span className="font-mono text-slate-200">{STAGE_PLAY_SOURCE_SETUP_DEFAULTS.audioWindowMs / 1000}s</span></div>
                  <div>Window: <span className="font-mono text-slate-200">{STAGE_PLAY_SOURCE_SETUP_DEFAULTS.compactObservationWindowMs / 1000}s</span></div>
                  <div className="col-span-2">Raw retention: <span className="font-mono text-slate-200">{STAGE_PLAY_SOURCE_SETUP_DEFAULTS.rawRetention}</span></div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Set visual cadence</div>
                <div className="flex flex-wrap gap-1">
                  {STAGE_PLAY_VISUAL_CADENCE_OPTIONS.map((cadenceMs) => (
                    <button
                      key={cadenceMs}
                      type="button"
                      onClick={() => onSetSourceSetupCadenceMs(cadenceMs)}
                      className={`rounded border px-2 py-1 text-[10px] font-semibold ${
                        sourceSetupCadenceMs === cadenceMs
                          ? "border-cyan-500 bg-cyan-950/40 text-cyan-100"
                          : "border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-100"
                      }`}
                    >
                      {cadenceMs / 1000}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => onStartVisualSourceSetup("browser_tab")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Capture browser tab visual
                </button>
                <button
                  type="button"
                  onClick={() => onStartVisualSourceSetup("screen")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Capture screen visual
                </button>
                <button
                  type="button"
                  onClick={() => onAttachAudioTranscriptSource("browser_audio")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Attach browser audio transcript
                </button>
                <button
                  type="button"
                  onClick={() => onAttachAudioTranscriptSource("microphone")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Attach microphone transcript
                </button>
                <button
                  type="button"
                  onClick={() => onObserverDraftAction(observerSources.find((source) => source.selectedForStagePlay) ?? observerSources[0] ?? null, "use_for_stage_play")}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Use source for Stage Play
                </button>
                <button
                  type="button"
                  onClick={onPauseVisualSourceSetup}
                  className="rounded border border-slate-700 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Pause source
                </button>
                <button
                  type="button"
                  onClick={onProjectLiveAnswer}
                  className="col-span-2 rounded border border-emerald-700 bg-emerald-950/25 px-2 py-1.5 text-[10px] font-semibold text-emerald-100 hover:border-emerald-400"
                  data-testid="stage-play-project-live-answer"
                >
                  Project Interpretation
                </button>
              </div>

              {sourceSetupStatus.message ? (
                <div className={`rounded border p-2 text-[11px] ${
                  sourceSetupStatus.level === "error"
                    ? "border-rose-800 bg-rose-950/25 text-rose-100"
                    : sourceSetupStatus.level === "ok"
                      ? "border-emerald-800 bg-emerald-950/25 text-emerald-100"
                      : sourceSetupStatus.level === "working"
                        ? "border-cyan-800 bg-cyan-950/25 text-cyan-100"
                        : "border-slate-800 bg-black/20 text-slate-400"
                }`}>
                  {sourceSetupStatus.message}
                </div>
              ) : null}
              <div className="text-[11px] leading-relaxed text-slate-500">
                Visual capture is owned by the visual source producer. Audio transcript attachment is registered as source setup and reflected after source capability evidence exists.
              </div>
            </div>
          </Section>

          <Section title="Observer Source Routes">
            <div className="space-y-2">
              {observerSources.length === 0 ? (
                <div className="text-slate-500">No source routes are registered yet.</div>
              ) : observerSources.map((source) => (
                <div key={`${source.sourceId}:${source.modality}`} className="rounded border border-slate-800 bg-black/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{labelize(source.modality)}</div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{source.sourceId}</div>
                    </div>
                    <Badge variant="outline" className={statusTone(source.status === "active" ? "observed" : source.status === "configured_missing" ? "missing_evidence" : source.status)}>
                      {labelize(source.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>Route: <span className="font-mono text-amber-100">{source.routeTo}</span></div>
                    <div>Selected: <span className="font-mono text-slate-200">{source.selectedForStagePlay ? "yes" : "no"}</span></div>
                    <div>Fidelity: <span className="font-mono text-slate-200">{source.fidelityScore.toFixed(2)}</span></div>
                    <div>Cadence: <span className="font-mono text-slate-200">{source.cadenceMs ? `${source.cadenceMs}ms` : "none"}</span></div>
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-slate-400">{source.contribution}</div>
                  {source.missingReason || source.nextRequiredAction ? (
                    <div className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                      {source.missingReason ?? source.nextRequiredAction}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => onObserverDraftAction(source, "use_for_stage_play")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Use for Stage Play
                    </button>
                    <button
                      type="button"
                      onClick={() => onObserverDraftAction(source, "route_to_narrative")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Route to Narrative
                    </button>
                    <button
                      type="button"
                      onClick={() => onObserverDraftAction(source, "route_to_minecraft_world")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Route to Minecraft World
                    </button>
                    {source.modality === "visual_frame" ? (
                      <button
                        type="button"
                        onClick={() => onObserverDraftAction(source, "start_visual_interval")}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                      >
                        Start visual interval
                      </button>
                    ) : null}
                    {source.modality === "audio_transcript" ? (
                      <button
                        type="button"
                        onClick={() => onObserverDraftAction(source, "attach_audio_transcript")}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                      >
                        Attach audio transcript
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onObserverDraftAction(source, "pause_source")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Pause source
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSourceAudit(source, "source_evidence")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Review source evidence
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSourceAudit(source, "compact_observation")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Open compact observation
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSourceAudit(source, "raw_buffer")}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                    >
                      Open raw buffer preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onClearRawSessionBuffer(source)}
                      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-amber-500 hover:text-amber-100"
                    >
                      Clear raw buffer
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onClearRawSessionBuffer(null)}
                className="w-full rounded border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
              >
                Clear session buffer
              </button>
              <div className="text-[11px] leading-relaxed text-slate-500">
                Routing controls persist source custody overrides. Capture and audit controls remain local setup requests until source capability or evidence refs exist.
              </div>
            </div>
          </Section>

          {sourceAuditSelection ? (
            <Section title="Source Evidence Audit">
              <div className="space-y-2 text-xs">
                <div className="rounded border border-slate-800 bg-black/20 p-2">
                  <div className="font-semibold text-slate-100">{labelize(sourceAuditSelection.source.modality)}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">{sourceAuditSelection.source.sourceId}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className="border-slate-700 text-slate-300">{labelize(sourceAuditSelection.mode)}</Badge>
                    <Badge variant="outline" className="border-slate-700 text-slate-300">audit buffer, not graph</Badge>
                  </div>
                </div>
                {sourceAuditSelection.mode === "source_evidence" ? (
                  <div className="space-y-1 font-mono text-[11px] text-slate-400">
                    {sourceAuditSelection.source.evidenceRefs.length > 0
                      ? sourceAuditSelection.source.evidenceRefs.map((ref) => <div key={ref}>{ref}</div>)
                      : <div>No source evidence refs recorded.</div>}
                  </div>
                ) : null}
                {sourceAuditSelection.mode === "compact_observation" ? (
                  <div className="space-y-1 font-mono text-[11px] text-slate-400">
                    {sourceAuditSelection.source.evidenceRefs.filter(isCompactObservationRef).length > 0
                      ? sourceAuditSelection.source.evidenceRefs.filter(isCompactObservationRef).map((ref) => <div key={ref}>{ref}</div>)
                      : <div>No compact observation refs recorded.</div>}
                  </div>
                ) : null}
                {sourceAuditSelection.mode === "raw_buffer" ? (
                  <div className="space-y-2">
                    {rawSessionBufferLoading ? (
                      <div className="text-slate-500">Loading raw buffer previews...</div>
                    ) : rawSessionBufferEntries.length > 0 ? rawSessionBufferEntries.map((entry) => (
                      <div key={entry.entryId} className="rounded border border-slate-800 bg-black/20 p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="border-slate-700 text-slate-300">{labelize(entry.rawKind)}</Badge>
                          <Badge variant="outline" className="border-slate-700 text-slate-300">{entry.retention.policy}</Badge>
                        </div>
                        <div className="mt-2 font-mono text-[10px] text-slate-500">{entry.entryId}</div>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">{entry.rawRef}</div>
                        {entry.rawTextPreview ? (
                          <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-300">
                            {entry.rawTextPreview}
                          </div>
                        ) : null}
                      </div>
                    )) : (
                      <div className="text-slate-500">No raw buffer preview entries for this source.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}
          </>
        ) : null}

        {badge.kind === "source" && sourceControl ? (
          <Section title="Source Route Controls">
            <div className="space-y-2 text-xs">
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{labelize(sourceControl.modality)}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{sourceControl.sourceId}</div>
                  </div>
                  <Badge variant="outline" className={statusTone(sourceControl.status === "active" ? "observed" : sourceControl.status === "configured_missing" ? "missing_evidence" : sourceControl.status)}>
                    {labelize(sourceControl.status)}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Route: <span className="font-mono text-amber-100">{sourceControl.routeTo}</span></div>
                  <div>Selected: <span className="font-mono text-slate-200">{sourceControl.selectedForStagePlay ? "yes" : "no"}</span></div>
                  <div>Fidelity: <span className="font-mono text-slate-200">{sourceControl.fidelityScore.toFixed(2)}</span></div>
                  <div>Cadence: <span className="font-mono text-slate-200">{sourceControl.cadenceMs ? `${sourceControl.cadenceMs}ms` : "none"}</span></div>
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-slate-400">{sourceControl.contribution}</div>
              </div>

              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onObserverDraftAction(sourceControl, "use_for_stage_play")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Use for Stage Play
                </button>
                <button
                  type="button"
                  onClick={() => onObserverDraftAction(sourceControl, "route_to_narrative")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Route to Narrative
                </button>
                <button
                  type="button"
                  onClick={() => onObserverDraftAction(sourceControl, "route_to_minecraft_world")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Route to Minecraft World
                </button>
                {sourceControl.modality === "visual_frame" ? (
                  <button
                    type="button"
                    onClick={() => onObserverDraftAction(sourceControl, "start_visual_interval")}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                  >
                    Start visual interval
                  </button>
                ) : null}
                {sourceControl.modality === "audio_transcript" ? (
                  <button
                    type="button"
                    onClick={() => onObserverDraftAction(sourceControl, "attach_audio_transcript")}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                  >
                    Attach audio transcript
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onObserverDraftAction(sourceControl, "pause_source")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Pause source
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSourceAudit(sourceControl, "source_evidence")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Review source evidence
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSourceAudit(sourceControl, "compact_observation")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Open compact observation
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSourceAudit(sourceControl, "raw_buffer")}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-100"
                >
                  Open raw buffer preview
                </button>
                <button
                  type="button"
                  onClick={() => onClearRawSessionBuffer(sourceControl)}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-amber-500 hover:text-amber-100"
                >
                  Clear raw buffer
                </button>
              </div>

              {sourceControl.missingReason || sourceControl.nextRequiredAction ? (
                <div className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                  {sourceControl.missingReason ?? sourceControl.nextRequiredAction}
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {badge.id === "interpreter.stage_play_reflection" ? (
          <Section title="Live Interpretation Projection">
            <div className="space-y-2 text-xs">
              <p className="text-slate-400">
                Project current Stage Play evidence lanes into Live Interpretation. This is deterministic observation projection, not answer snapshot authority.
              </p>
              <button
                type="button"
                onClick={onProjectLiveAnswer}
                className="w-full rounded border border-emerald-700 bg-emerald-950/25 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 hover:border-emerald-400"
                data-testid="stage-play-project-live-answer-inspector"
              >
                Project Interpretation
              </button>
            </div>
          </Section>
        ) : null}

        {showGenericLiveBindings ? (
        <Section title="Live Bindings">
          {badge.liveBindings.length > 0 ? (
            <div className="space-y-2">
              {badge.liveBindings.map((binding, index) => (
                <div key={`${binding.bindingKind}-${index}`} className="rounded border border-slate-800 bg-black/20 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {labelize(binding.bindingKind)}
                    </Badge>
                    <span className="text-xs text-slate-400">{binding.freshness}</span>
                    <span className="font-mono text-[10px] text-slate-500">{binding.confidence.toFixed(2)}</span>
                  </div>
                  {binding.compactValue !== undefined && binding.compactValue !== null ? (
                    <div className="mt-1 font-mono text-xs text-slate-300">{String(binding.compactValue)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-500">No live binding attached to this badge.</span>
          )}
        </Section>
        ) : null}

        {showAffordanceSection ? (
        <Section title="Affordance / Blocked Move">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              {labelize(badge.kind)}
            </Badge>
            {badge.admission ? (
              <Badge variant="outline" className={statusTone(badge.admission === "blocked" ? "blocked" : badge.status)}>
                {labelize(badge.admission)}
              </Badge>
            ) : null}
          </div>
        </Section>
        ) : null}

        {showIntentSection ? (
        <Section title="Intent Module">
          {badge.intentModule ? (
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500">Verb:</span>{" "}
                <span className="font-mono text-cyan-200">{badge.intentModule.verb}</span>
              </div>
              {badge.intentModule.requires?.length ? <div>Requires: {badge.intentModule.requires.join(", ")}</div> : null}
              {badge.intentModule.preserves?.length ? <div>Preserves: {badge.intentModule.preserves.join(", ")}</div> : null}
              {badge.intentModule.blocks?.length ? <div>Blocks: {badge.intentModule.blocks.join(", ")}</div> : null}
            </div>
          ) : (
            <span className="text-slate-500">No intent verb is attached to this badge.</span>
          )}
        </Section>
        ) : null}

        {!isSelectedSpecificNode && badge.kind !== "procedural_binding" ? (
        <Section title="Procedural Binding">
          <div className="rounded border border-slate-800 bg-black/30 p-2 font-mono text-xs text-cyan-100">
            {expression || "No procedural expression for this badge."}
          </div>
        </Section>
        ) : null}

        {showMissingEvidenceSection ? (
        <Section title="Missing Evidence">
          {badge.missingEvidence.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-xs text-amber-100">
              {badge.missingEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <span className="text-slate-500">No missing evidence recorded.</span>
          )}
        </Section>
        ) : null}

        {showAdmissionSection ? (
        <Section title="Admission">
          <div className="space-y-2 text-xs">
            <div>Badge admission: <span className="font-mono text-slate-200">{badge.admission ?? "none"}</span></div>
            {relatedActions.map((action) => (
              <div key={action.id} className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="font-semibold text-slate-100">{action.label}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className={statusTone(action.admission === "blocked" ? "blocked" : "candidate")}>
                    {labelize(action.admission)}
                  </Badge>
                  <Badge variant="outline" className="border-slate-700 text-slate-300">
                    {labelize(action.actionType)}
                  </Badge>
                  <Badge variant="outline" className="border-slate-700 text-slate-300">
                    agent executable: false
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
        ) : null}

        {showGenericSourceRefs ? (
        <Section title="Source Refs">
          <div className="space-y-1 font-mono text-xs text-slate-400">
            {badge.sourceRefs.length > 0 ? badge.sourceRefs.map((ref) => (
              <div key={`${ref.kind}:${ref.id}`}>{ref.kind}: {ref.id}</div>
            )) : <span>No source refs.</span>}
          </div>
        </Section>
        ) : null}

        {showGenericRelatedBadges ? (
        <Section title="Related Badges">
          <div className="space-y-2">
            {relatedEdges.map((edge) => (
              <div key={edge.id} className="rounded border border-slate-800 bg-black/20 p-2 text-xs">
                <div className="flex items-center gap-2 text-slate-200">
                  <Link2 className="h-3.5 w-3.5 text-slate-500" />
                  {labelize(edge.relation)}: {edge.label}
                </div>
              </div>
            ))}
            {relatedBadges.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {relatedBadges.map((related) => (
                  <Badge key={related.id} variant="outline" className="border-slate-700 text-slate-300">
                    {related.title}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </Section>
        ) : null}
      </div>
    </aside>
  );
}

export default function StagePlayBadgeGraphPanel() {
  const queryClient = useQueryClient();
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const [query, setQuery] = useState("");
  const [bindingOverlayOpen, setBindingOverlayOpen] = useState(false);
  const [draftNodes, setDraftNodes] = useState<DraftStagePlayNode[]>([]);
  const [selectedDraftNodeId, setSelectedDraftNodeId] = useState<string | null>(null);
  const [heldNode, setHeldNode] = useState<HeldStagePlayNode | null>(null);
  const [sourceSetupCadenceMs, setSourceSetupCadenceMs] = useState<number>(STAGE_PLAY_SOURCE_SETUP_DEFAULTS.visualCadenceMs);
  const [sourceSetupStatus, setSourceSetupStatus] = useState<StagePlaySourceSetupStatus>({
    level: "idle",
    message: "",
  });
  const [projectionStatus, setProjectionStatus] = useState<StagePlayProjectionStatus | null>(null);
  const [checkpointQueueStatus, setCheckpointQueueStatus] = useState<StagePlayCheckpointQueueStatus>(null);
  const [sourceAuditSelection, setSourceAuditSelection] = useState<StagePlaySourceAuditSelection>(null);
  const [graphDiff, setGraphDiff] = useState<StagePlayGraphDiff | null>(null);
  const [removedBadgeGhosts, setRemovedBadgeGhosts] = useState<StagePlayRemovedBadgeGhost[]>([]);
  const [graphDisplayMode, setGraphDisplayMode] = useState<StagePlayGraphDisplayMode>("observer_mail_loop_v1");
  const graphScrollportRef = useRef<HTMLDivElement>(null);
  const previousGraphRef = useRef<StagePlayBadgeGraphV1 | null>(null);
  const graphDiffClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removedGhostClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mailLoopRefreshTimerRef = useRef<number | null>(null);
  const draftNodeCountRef = useRef(0);
  const draftParameterCountRef = useRef(0);
  const performanceSample = useWorkstationPerformanceStore((state: any) => state.latest);
  const stagePlayRenderPressure = maxStagePlayRenderPressure({
    advisory: performanceSample?.advisory_pressure ?? null,
    responsiveness: performanceSample?.responsiveness_pressure ?? null,
  });
  const observerMailLoopActive = graphDisplayMode === "observer_mail_loop_v1";
  const observerGraphRefetchMs = STAGE_PLAY_OBSERVER_GRAPH_REFETCH_MS[stagePlayRenderPressure];
  const observerMailboxRefetchMs = STAGE_PLAY_OBSERVER_MAILBOX_REFETCH_MS[stagePlayRenderPressure];
  const mailLoopRefreshCoalesceMs = STAGE_PLAY_REFRESH_COALESCE_MS[stagePlayRenderPressure];
  const activeEnvironment = useLiveAnswerEnvironmentStore((state) =>
    selectActiveLiveAnswerEnvironment(state, STAGE_PLAY_PANEL_THREAD_ID),
  );
  const loadLiveAnswerEnvironment = useLiveAnswerEnvironmentStore((state) => state.loadLiveAnswerEnvironment);
  const threadId = activeEnvironment?.thread_id ?? STAGE_PLAY_PANEL_THREAD_ID;
  const roomId = activeEnvironment?.room_id ?? null;
  const environmentId = activeEnvironment?.environment_id ?? null;
  const selectedBadgeId = useStagePlayBadgeGraphPanelStore((state) => state.selectedBadgeId);
  const selectedBadgeIds = useStagePlayBadgeGraphPanelStore((state) => state.selectedBadgeIds);
  const activeFilterKind = useStagePlayBadgeGraphPanelStore((state) => state.activeFilterKind);
  const setSelectedBadgeId = useStagePlayBadgeGraphPanelStore((state) => state.setSelectedBadgeId);
  const setSelectedBadgeIds = useStagePlayBadgeGraphPanelStore((state) => state.setSelectedBadgeIds);
  const toggleSelectedBadgeId = useStagePlayBadgeGraphPanelStore((state) => state.toggleSelectedBadgeId);
  const setActiveFilterKind = useStagePlayBadgeGraphPanelStore((state) => state.setActiveFilterKind);
  const graphQuery = useQuery<StagePlayBadgeGraphV1>({
    queryKey: [
      "/api/helix/stage-play/graph",
      threadId,
      roomId,
      environmentId,
    ],
    queryFn: () => fetchStagePlayBadgeGraph({ threadId, roomId, environmentId }),
    refetchInterval: observerMailLoopActive ? observerGraphRefetchMs : 1000,
  });
  const { data: graph, isLoading, error } = graphQuery;
  const mailboxQuery = useQuery<StagePlayLiveSourceMailListResponse>({
    queryKey: STAGE_PLAY_MAILBOX_QUERY_KEY,
    queryFn: () => fetchStagePlayLiveSourceMail({
      threadId: STAGE_PLAY_PANEL_THREAD_ID,
      mailboxThreadId: STAGE_PLAY_PANEL_THREAD_ID,
      view: "operator",
      limit: 4,
    }),
    refetchInterval: observerMailLoopActive ? observerMailboxRefetchMs : false,
  });
  const mailbox = mailboxQuery.data ?? null;
  const transcriptQuery = useQuery<StagePlayLiveSourceMailTranscriptResponse>({
    queryKey: STAGE_PLAY_TRANSCRIPT_QUERY_KEY,
    queryFn: () => fetchStagePlayLiveSourceMailTranscript({
      threadId: STAGE_PLAY_PANEL_THREAD_ID,
      mailboxThreadId: STAGE_PLAY_PANEL_THREAD_ID,
    }),
    refetchInterval: observerMailLoopActive ? observerMailboxRefetchMs : false,
  });
  const transcript = transcriptQuery.data ?? null;
  const rawSessionBufferQuery = useQuery<StagePlayRawSessionBufferListResponse>({
    queryKey: [
      "/api/helix/stage-play/raw-session-buffer",
      threadId,
      roomId,
      sourceAuditSelection?.source.sourceId ?? null,
    ],
    queryFn: () => fetchStagePlayRawSessionBuffer({
      threadId,
      roomId,
      sourceId: sourceAuditSelection?.source.sourceId ?? null,
    }),
    enabled: Boolean(sourceAuditSelection),
    refetchInterval: sourceAuditSelection?.mode === "raw_buffer" ? 1000 : false,
  });
  const builderContextQuery = useQuery<StagePlayBuilderContextResponse>({
    queryKey: [
      "/api/helix/stage-play/builder",
      threadId,
      environmentId,
    ],
    queryFn: () => fetchStagePlayBuilderContext({ threadId, environmentId }),
    refetchInterval: 2000,
  });
  const builderContext = builderContextQuery.data ?? null;
  const sourceOptions = useMemo(
    () => (builderContext?.sourceQuery.sourceHandles ?? []).map(sourceOptionFromHandle),
    [builderContext?.sourceQuery.sourceHandles],
  );
  const draftForValidation = useMemo(
    () => buildStagePlayDraftFromNodes({
      draftNodes,
      objective: graph?.description ?? graph?.title ?? null,
    }),
    [draftNodes, graph?.description, graph?.title],
  );
  const draftValidationKey = useMemo(
    () => JSON.stringify(draftForValidation),
    [draftForValidation],
  );
  const { data: draftValidation = null } = useQuery<StagePlayGraphDraftValidationV1>({
    queryKey: [
      "/api/helix/stage-play/draft/validate",
      threadId,
      environmentId,
      draftValidationKey,
    ],
    queryFn: () => validateStagePlayDraft({
      threadId,
      environmentId,
      draft: draftForValidation,
    }),
    enabled: draftNodes.length > 0,
  });

  function refetchMailLoopViews() {
    void queryClient.invalidateQueries({ queryKey: STAGE_PLAY_MAILBOX_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: STAGE_PLAY_TRANSCRIPT_QUERY_KEY });
    void mailboxQuery.refetch();
    void transcriptQuery.refetch();
  }

  function scheduleMailLoopRefresh(delayMs: number = mailLoopRefreshCoalesceMs) {
    if (mailLoopRefreshTimerRef.current !== null) return;
    mailLoopRefreshTimerRef.current = window.setTimeout(() => {
      mailLoopRefreshTimerRef.current = null;
      refetchMailLoopViews();
    }, delayMs);
  }

  useEffect(() => {
    return () => {
      if (graphDiffClearTimerRef.current) clearTimeout(graphDiffClearTimerRef.current);
      if (removedGhostClearTimerRef.current) clearTimeout(removedGhostClearTimerRef.current);
      if (mailLoopRefreshTimerRef.current !== null) window.clearTimeout(mailLoopRefreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (graphDisplayMode !== "observer_mail_loop_v1") return;
    scheduleMailLoopRefresh(0);
  }, [graphDisplayMode, observerMailboxRefetchMs]);

  useEffect(() => {
    const handleMailboxRefresh = (event: Event) => {
      const detail = (event as CustomEvent<StagePlayLiveSourceMailRefreshEventDetail>).detail;
      const mailboxThreadId = detail?.mailboxThreadId ?? detail?.threadId ?? STAGE_PLAY_PANEL_THREAD_ID;
      if (mailboxThreadId && mailboxThreadId !== STAGE_PLAY_PANEL_THREAD_ID) return;
      scheduleMailLoopRefresh();
    };
    window.addEventListener(STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT, handleMailboxRefresh);
    return () => {
      window.removeEventListener(STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT, handleMailboxRefresh);
    };
  }, [mailLoopRefreshCoalesceMs, mailboxQuery.refetch, queryClient, transcriptQuery.refetch]);

  useEffect(() => {
    if (!graph) return;
    const previousGraph = previousGraphRef.current;
    if (previousGraph) {
      const nextDiff = diffStagePlayBadgeGraphs(previousGraph, graph);
      if (hasStagePlayGraphDiff(nextDiff)) {
        setGraphDiff(nextDiff);
        setRemovedBadgeGhosts(removedGhostsForDiff(previousGraph, nextDiff));
        if (graphDiffClearTimerRef.current) clearTimeout(graphDiffClearTimerRef.current);
        if (removedGhostClearTimerRef.current) clearTimeout(removedGhostClearTimerRef.current);
        graphDiffClearTimerRef.current = setTimeout(() => setGraphDiff(null), 1800);
        removedGhostClearTimerRef.current = setTimeout(() => setRemovedBadgeGhosts([]), 1000);
      }
    }
    previousGraphRef.current = graph;
  }, [graph]);

  const filteredBadges = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (graph?.badges ?? []).filter((badge: StagePlayBadgeV1) => {
      const haystack = [
        badge.id,
        badge.title,
        badge.plainMeaning,
        badge.whyItMatters,
        badge.kind,
        badge.status,
        ...badge.subjects,
        ...badge.tags,
        ...badge.reasonCodes,
      ].join(" ").toLowerCase();
      return (
        (needle.length === 0 || haystack.includes(needle)) &&
        (!activeFilterKind || badge.kind === activeFilterKind)
      );
    });
  }, [activeFilterKind, graph?.badges, query]);

  const groupedBadges = useMemo(() => {
    return uniqueSorted(filteredBadges.map((badge) => badge.kind)).map((kind) => ({
      kind,
      badges: filteredBadges.filter((badge: StagePlayBadgeV1) => badge.kind === kind),
    })).filter((group) => group.badges.length > 0);
  }, [filteredBadges]);

  useEffect(() => {
    if (!graph) return;
    if (filteredBadges.length === 0) {
      setSelectedBadgeId(null);
      return;
    }
    if (selectedBadgeId && !filteredBadges.some((badge) => badge.id === selectedBadgeId)) {
      setSelectedBadgeId(null);
    }
  }, [filteredBadges, graph, selectedBadgeId, setSelectedBadgeId]);

  const selectedBadge = useMemo(
    () => graph?.badges.find((badge) => badge.id === selectedBadgeId) ?? null,
    [graph?.badges, selectedBadgeId],
  );
  function selectGraphBadge(badgeId: string) {
    const badge = graph?.badges.find((entry) => entry.id === badgeId) ?? null;
    toggleSelectedBadgeId(badgeId);
    if (badge?.kind === "observer") {
      setActiveFilterKind("observer");
      setBindingOverlayOpen(true);
    } else if (badge?.kind) {
      setActiveFilterKind(badge.kind);
      setBindingOverlayOpen(true);
    }
  }
  const relatedEdges = useMemo(
    () => graph && selectedBadge
      ? graph.edges.filter((edge) => edge.from === selectedBadge.id || edge.to === selectedBadge.id)
      : [],
    [graph, selectedBadge],
  );
  const relatedBadges = useMemo(() => {
    if (!graph || !selectedBadge) return [];
    const ids = new Set(relatedEdges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id !== selectedBadge.id));
    return graph.badges.filter((badge) => ids.has(badge.id));
  }, [graph, relatedEdges, selectedBadge]);
  const relatedActions = useMemo(
    () => graph && selectedBadge
      ? graph.recommendedActions.filter((action) =>
        action.evidenceRefs.some((ref) => selectedBadge.evidenceRefs.includes(ref)) ||
        action.reasonCodes.some((code) => selectedBadge.reasonCodes.includes(code)),
      )
      : [],
    [graph, selectedBadge],
  );

  function scrollGraphNearEdge(clientX: number, clientY: number) {
    const scrollport = graphScrollportRef.current;
    if (!scrollport) return;
    const rect = scrollport.getBoundingClientRect();
    const threshold = 56;
    const maxStep = 22;
    const leftPressure = Math.max(0, threshold - (clientX - rect.left));
    const rightPressure = Math.max(0, threshold - (rect.right - clientX));
    const topPressure = Math.max(0, threshold - (clientY - rect.top));
    const bottomPressure = Math.max(0, threshold - (rect.bottom - clientY));
    const left = rightPressure > 0
      ? Math.ceil((rightPressure / threshold) * maxStep)
      : leftPressure > 0
        ? -Math.ceil((leftPressure / threshold) * maxStep)
        : 0;
    const top = bottomPressure > 0
      ? Math.ceil((bottomPressure / threshold) * maxStep)
      : topPressure > 0
        ? -Math.ceil((topPressure / threshold) * maxStep)
        : 0;
    if (left !== 0 || top !== 0) {
      scrollport.scrollBy({ left, top });
    }
  }

  function startBuilderDrag(nodeType: StagePlayNodeBuilderType, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setBindingOverlayOpen(false);
    setHeldNode({
      ...nodeType,
      clientX: readClientCoordinate(event.clientX),
      clientY: readClientCoordinate(event.clientY),
    });
  }

  function updateDraftParameter(nodeId: string, parameterId: string, field: "key" | "value", value: string) {
    setDraftNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              parameters: node.parameters.map((parameter) =>
                parameter.id === parameterId ? { ...parameter, [field]: value } : parameter,
              ),
            }
          : node,
      ),
    );
  }

  function addDraftParameter(nodeId: string) {
    draftParameterCountRef.current += 1;
    setDraftNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              parameters: [
                ...node.parameters,
                {
                  id: `${node.id}:param:custom:${draftParameterCountRef.current}`,
                  key: "parameter",
                  value: "",
                },
              ],
            }
          : node,
      ),
    );
  }

  function removeDraftNode(nodeId: string) {
    setDraftNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
    setSelectedDraftNodeId((current) => current === nodeId ? null : current);
  }

  function setDraftSourceClass(nodeId: string, sourceClass: string) {
    setDraftNodes((nodes) =>
      nodes.map((node) => node.id === nodeId ? setDraftParameterValue(node, "source_class", sourceClass) : node),
    );
  }

  function applyDraftSourceOption(nodeId: string, option: StagePlaySourceOption) {
    setDraftNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return [
          ["source_class", option.sourceClass],
          ["source_id", option.sourceId],
          ["status", option.status],
          ["descriptor_ref", option.descriptorId ?? ""],
          ["producer_ref", option.producerId ?? ""],
          ["latest_ref", option.latestRef ?? ""],
          ["surface", option.surface ?? ""],
          ["origin", option.origin ?? ""],
          ["cadence_ms", option.cadenceMs != null ? String(option.cadenceMs) : ""],
        ].reduce<DraftStagePlayNode>(
          (updated, [key, value]) => setDraftParameterValue(updated, key, value),
          node,
        );
      }),
    );
  }

  function addObserverDraftAction(source: StagePlayObserverSource | null, action: StagePlayObserverDraftAction) {
    draftNodeCountRef.current += 1;
    const actionLabel = labelize(action);
    const nodeType: StagePlayNodeBuilderType = {
      kind: action === "clear_session_buffer" ? "recommended_check" : "source",
      label: action === "clear_session_buffer" ? "Clear session buffer" : `Source request: ${actionLabel}`,
      role: "local user draft request",
    };
    const parameters: [string, string][] = action === "clear_session_buffer"
      ? [
          ["check", "clear_session_buffer"],
          ["status", "local_draft_only"],
          ["authority", "user_action_required"],
        ]
      : [
          ["source_class", source?.modality ?? ""],
          ["source_id", source?.sourceId ?? ""],
          ["status", source?.status ?? ""],
          ["route_to", action === "route_to_narrative" ? "narrative_stage_play" : action === "route_to_minecraft_world" ? "world_stage_play" : source?.routeTo ?? ""],
          ["requested_action", action],
          ["selected_for_stage_play", action === "use_for_stage_play" ? "true" : String(source?.selectedForStagePlay ?? false)],
          ["latest_ref", source?.evidenceRefs.at(-1) ?? ""],
          ["draft_only", "true"],
        ];
    const nextNode: DraftStagePlayNode = {
      ...nodeType,
      id: `draft:${nodeType.kind}:${draftNodeCountRef.current}`,
      x: 96 + draftNodeCountRef.current * 18,
      y: 96 + draftNodeCountRef.current * 28,
      parameters: parameters.map(([key, value], index) => ({
        id: `${nodeType.kind}:observer-action:${draftNodeCountRef.current}:${index + 1}`,
        key,
        value,
      })),
    };
    setDraftNodes((nodes) => [...nodes, nextNode]);
    setSelectedDraftNodeId(nextNode.id);
  }

  function routeTargetForObserverAction(source: StagePlayObserverSource, action: StagePlayObserverDraftAction): string | null {
    if (action === "route_to_narrative") return "narrative_stage_play";
    if (action === "route_to_minecraft_world") return "world_stage_play";
    if (action === "use_for_stage_play") return source.routeTo;
    return null;
  }

  async function persistObserverSourceRoute(source: StagePlayObserverSource, action: StagePlayObserverDraftAction) {
    const routeTo = routeTargetForObserverAction(source, action);
    if (!routeTo) return;
    setSourceSetupStatus({
      level: "working",
      message: `Updating ${labelize(source.modality)} route for Stage Play...`,
    });
    try {
      await postJson("/api/helix/stage-play/source-route", {
        threadId,
        roomId,
        environmentId,
        sourceId: source.sourceId,
        modality: source.modality,
        routeTo,
        selectedForStagePlay: true,
        evidenceRefs: source.evidenceRefs.slice(-6),
      });
      setSourceSetupStatus({
        level: "ok",
        message: `${labelize(source.modality)} routed to ${routeTo}.`,
      });
      await Promise.all([graphQuery.refetch(), builderContextQuery.refetch()]);
    } catch (error) {
      setSourceSetupStatus({
        level: "error",
        message: error instanceof Error ? error.message : "stage_play_source_route_update_failed",
      });
    }
  }

  function handleObserverDraftAction(source: StagePlayObserverSource | null, action: StagePlayObserverDraftAction) {
    if (source && routeTargetForObserverAction(source, action)) {
      void persistObserverSourceRoute(source, action);
      return;
    }
    addObserverDraftAction(source, action);
  }

  async function handleProjectLiveAnswer() {
    setSourceSetupStatus({
      level: "working",
      message: "Projecting Stage Play evidence lanes into Live Interpretation...",
    });
    try {
      const result = await projectStagePlayLiveAnswer({
        threadId,
        roomId,
        environmentId,
        objective: activeEnvironment?.objective ?? graph?.description ?? graph?.title ?? "Project Stage Play graph into Live Interpretation.",
      });
      const message = result.reason === "projected"
        ? `Projected ${result.projectedLineKeys.length} Live Interpretation lane(s).`
        : result.reason === "no_line_changes"
          ? "Stage Play projection ran; no Live Interpretation lanes changed."
          : `${labelize(result.reason)}: ${result.skippedLineKeys.slice(0, 4).join(", ")}`;
      setProjectionStatus({
        projectedLineKeys: result.projectedLineKeys,
        skippedLineKeys: result.skippedLineKeys,
        checkpointOnlySkipped: result.checkpointOnlySkipped ?? [],
        reason: result.reason,
        updatedAt: new Date().toISOString(),
        message,
      });
      setSourceSetupStatus({
        level: result.reason === "projected" || result.reason === "no_line_changes" ? "ok" : "error",
        message,
      });
      await Promise.all([
        graphQuery.refetch(),
        builderContextQuery.refetch(),
        loadLiveAnswerEnvironment(threadId),
      ]);
    } catch (error) {
      setSourceSetupStatus({
        level: "error",
        message: error instanceof Error ? error.message : "stage_play_live_answer_projection_failed",
      });
      setProjectionStatus({
        projectedLineKeys: [],
        skippedLineKeys: [],
        checkpointOnlySkipped: [],
        reason: "request_failed",
        updatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "stage_play_live_answer_projection_failed",
      });
    }
  }

  async function handleCheckpointQueueAction(action: StagePlayCheckpointQueueAction, requestId?: string | null) {
    const request = requestId
      ? graph?.checkpointRequests?.find((entry) => entry.checkpointRequestId === requestId) ?? null
      : selectStagePlayVisibleCheckpointRequest(graph);
    const jobId = request?.jobId ?? graph?.checkpointRequests?.[0]?.jobId ?? null;
    if (!jobId) {
      setCheckpointQueueStatus({
        action,
        reason: "no_request",
        message: "No checkpoint request queue is active for this graph yet.",
        updatedAt: new Date().toISOString(),
        ok: false,
      });
      return;
    }
    setCheckpointQueueStatus({
      action,
      reason: "working",
      message: `${labelize(action)} checkpoint queue...`,
      updatedAt: new Date().toISOString(),
      ok: true,
    });
    try {
      const result = await postJson("/api/helix/stage-play/checkpoint-queue/action", {
        jobId,
        action,
        checkpointRequestId: requestId ?? request?.checkpointRequestId ?? null,
      });
      const resultRequest =
        result.request && typeof result.request === "object" && !Array.isArray(result.request)
          ? (result.request as StagePlayCheckpointRequest)
          : request;
      const launchedAskCheckpoint = action === "run" && Boolean(result.ok && resultRequest && graph);
      if (launchedAskCheckpoint && resultRequest && graph) {
        launchHelixAskPrompt({
          question: buildStagePlayCheckpointAskQuestion({
            request: resultRequest,
            graph,
            environmentId,
            roomId,
          }),
          autoSubmit: true,
          panelId: "stage-play-badge-graph",
          forceReasoningDispatch: true,
          suppressWorkstationPayloadActions: true,
        });
      }
      setCheckpointQueueStatus({
        action,
        reason: String(result.reason ?? "updated"),
        message: launchedAskCheckpoint
          ? "Run checkpoint: visible Helix Ask checkpoint turn launched."
          : `${labelize(action)}: ${labelize(String(result.reason ?? "updated"))}`,
        updatedAt: new Date().toISOString(),
        ok: Boolean(result.ok),
      });
      await graphQuery.refetch();
    } catch (error) {
      setCheckpointQueueStatus({
        action,
        reason: "request_failed",
        message: error instanceof Error ? error.message : "stage_play_checkpoint_queue_action_failed",
        updatedAt: new Date().toISOString(),
        ok: false,
      });
    }
  }

  async function postJson(path: string, body?: Record<string, unknown>): Promise<any> {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : `request_failed:${response.status}`);
    }
    return payload;
  }

  function sourceSetupDraft(source: StagePlayObserverSource | null, action: StagePlayObserverDraftAction, extra: [string, string][] = []) {
    addObserverDraftAction(source, action);
    if (extra.length === 0) return;
    setDraftNodes((nodes) =>
      nodes.map((node, index) =>
        index === nodes.length - 1
          ? {
              ...node,
              parameters: [
                ...node.parameters,
                ...extra.map(([key, value], extraIndex) => ({
                  id: `${node.id}:setup:${extraIndex + 1}`,
                  key,
                  value,
                })),
              ],
            }
          : node,
      ),
    );
  }

  function openSourceAudit(source: StagePlayObserverSource, mode: StagePlaySourceAuditMode) {
    setSourceAuditSelection({ source, mode });
  }

  async function clearRawSessionBuffer(source: StagePlayObserverSource | null) {
    try {
      await postJson("/api/helix/stage-play/raw-session-buffer/clear", {
        threadId,
        roomId,
        sourceId: source?.sourceId ?? null,
      });
      if (!source) addObserverDraftAction(null, "clear_session_buffer");
      setSourceSetupStatus({
        level: "ok",
        message: source
          ? `Cleared raw buffer entries for ${source.sourceId}.`
          : "Cleared raw session buffer entries for this Stage Play window.",
      });
      await Promise.all([rawSessionBufferQuery.refetch(), graphQuery.refetch(), builderContextQuery.refetch()]);
    } catch (error) {
      setSourceSetupStatus({
        level: "error",
        message: error instanceof Error ? error.message : "raw_session_buffer_clear_failed",
      });
    }
  }

  function existingVisualSourceId(): string | null {
    const routed = graph?.sourceWindow.sources.find((source) =>
      source.modality === "visual_frame" &&
      source.sourceId &&
      !source.sourceId.startsWith("missing:") &&
      !source.sourceId.startsWith("source:visual-frame")
    );
    return routed?.sourceId ?? getLatestActiveVisualFrameStream(threadId)?.sourceId ?? null;
  }

  async function requestVisualSetupStream(surface: StagePlayVisualCaptureSurface): Promise<MediaStream> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("screen_capture_not_available_in_this_browser");
    }
    const displaySurface = surface === "browser_tab" ? "browser" : "monitor";
    return navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface } as MediaTrackConstraints,
      audio: false,
    });
  }

  async function ensureVisualSetupSource(surface: StagePlayVisualCaptureSurface): Promise<string> {
    const existingSourceId = existingVisualSourceId();
    const response = await postJson("/api/agi/situation/visual-source/start", {
      source_id: existingSourceId ?? `source:visual_frame:${threadId}`,
      thread_id: threadId,
      room_id: roomId,
      environment_id: environmentId,
      capture_mode: "interval",
      source_surface: surface,
      status: "permission_required",
      cadence_ms: sourceSetupCadenceMs,
      raw_image_storage_policy: "ephemeral",
    });
    const source = response?.source ?? response?.receipt?.source ?? null;
    const sourceId = typeof source?.source_id === "string" ? source.source_id : existingSourceId;
    if (!sourceId) throw new Error("visual_source_registration_failed");
    return sourceId;
  }

  async function startVisualSourceSetup(surface: StagePlayVisualCaptureSurface) {
    let stream: MediaStream | null = null;
    let ownsStream = false;
    const label = surface === "browser_tab" ? "browser tab visual" : "screen visual";
    setSourceSetupStatus({ level: "working", message: `Requesting ${label} capture permission...` });
    try {
      const sourceId = await ensureVisualSetupSource(surface);
      stream = getActiveVisualFrameStream(sourceId) ?? getLatestActiveVisualFrameStream(threadId)?.stream ?? null;
      if (!stream) {
        stream = await requestVisualSetupStream(surface);
        ownsStream = true;
      }
      const result = await startVisualFrameProducerInterval({
        sourceId,
        threadId,
        roomId,
        environmentId,
        cadenceMs: sourceSetupCadenceMs,
        stream,
        postJson,
        preserveExistingStream: !ownsStream,
        prompt: "Summarize this live visual frame as compact Stage Play source evidence for narrative or world-state interpretation. Include uncertainty and avoid raw text transcription unless it is necessary as compact evidence.",
      });
      stream = null;
      sourceSetupDraft(
        {
          sourceId,
          modality: "visual_frame",
          status: "active",
          contribution: `${label} interval producer requested from Stage Play setup.`,
          fidelityScore: 0.8,
          selectedForStagePlay: true,
          routeTo: STAGE_PLAY_SOURCE_SETUP_DEFAULTS.routeTo,
          cadenceMs: sourceSetupCadenceMs,
          lastEventTs: new Date().toISOString(),
          missingReason: null,
          nextRequiredAction: null,
          evidenceRefs: [result.evidence_id, result.frame_id].filter((ref): ref is string => Boolean(ref)),
        },
        "start_visual_interval",
        [
          ["capture_surface", surface],
          ["visual_cadence_ms", String(sourceSetupCadenceMs)],
          ["route_to", STAGE_PLAY_SOURCE_SETUP_DEFAULTS.routeTo],
          ["compact_observation_window_ms", String(STAGE_PLAY_SOURCE_SETUP_DEFAULTS.compactObservationWindowMs)],
          ["raw_retention", STAGE_PLAY_SOURCE_SETUP_DEFAULTS.rawRetention],
        ],
      );
      setSourceSetupStatus({
        level: "ok",
        message: `${label} interval active every ${sourceSetupCadenceMs / 1000}s. ${result.summary}`,
      });
      await Promise.all([graphQuery.refetch(), builderContextQuery.refetch()]);
    } catch (error) {
      if (ownsStream) stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setSourceSetupStatus({
        level: "error",
        message: error instanceof Error ? error.message : "visual_source_setup_failed",
      });
    }
  }

  async function attachAudioTranscriptSource(source: StagePlayAudioTranscriptSource) {
    const label = source === "browser_audio" ? "browser audio transcript" : "microphone transcript";
    setSourceSetupStatus({ level: "working", message: `Requesting ${label} setup...` });
    try {
      const { useSituationRoomStore } = await import("@/store/useSituationRoomStore");
      const situationRoom = useSituationRoomStore.getState();
      const localRoomId = situationRoom.active_room_id && situationRoom.rooms[situationRoom.active_room_id]
        ? situationRoom.active_room_id
        : situationRoom.createRoom("Stage Play Source Setup").room_id;
      const attached = source === "browser_audio"
        ? await situationRoom.attachDisplayAudioSource(localRoomId, "Stage Play browser audio")
        : await situationRoom.attachMicAudioSource(localRoomId, "Stage Play microphone");
      const sourceId = attached?.source_id ?? `audio_transcript:${threadId}`;
      await postJson("/api/agi/situation/audio-source/permission-granted", {
        source_id: sourceId,
        thread_id: threadId,
        room_id: roomId,
        ts: new Date().toISOString(),
      }).catch(() => null);
      sourceSetupDraft(
        {
          sourceId,
          modality: "audio_transcript",
          status: attached?.status === "active" ? "active" : "waiting_for_client",
          contribution: `${label} requested from Stage Play source setup.`,
          fidelityScore: attached?.status === "active" ? 0.72 : 0.3,
          selectedForStagePlay: attached?.status === "active",
          routeTo: STAGE_PLAY_SOURCE_SETUP_DEFAULTS.routeTo,
          cadenceMs: STAGE_PLAY_SOURCE_SETUP_DEFAULTS.audioWindowMs,
          lastEventTs: new Date().toISOString(),
          missingReason: attached?.status === "active" ? null : "Audio capture did not become active yet.",
          nextRequiredAction: attached?.status === "active" ? null : "Confirm audio capture permission",
          evidenceRefs: attached ? [`situation-room:${attached.room_id}:${attached.source_id}`] : [],
        },
        "attach_audio_transcript",
        [
          ["capture_source", source],
          ["audio_window_ms", String(STAGE_PLAY_SOURCE_SETUP_DEFAULTS.audioWindowMs)],
          ["route_to", STAGE_PLAY_SOURCE_SETUP_DEFAULTS.routeTo],
          ["compact_observation_window_ms", String(STAGE_PLAY_SOURCE_SETUP_DEFAULTS.compactObservationWindowMs)],
          ["raw_retention", STAGE_PLAY_SOURCE_SETUP_DEFAULTS.rawRetention],
        ],
      );
      setSourceSetupStatus({
        level: attached?.status === "active" ? "ok" : "error",
        message: attached?.status === "active"
          ? `${label} attached. Transcript chunks remain source evidence, not assistant answers.`
          : attached?.last_error ?? `${label} setup did not become active.`,
      });
      await Promise.all([graphQuery.refetch(), builderContextQuery.refetch()]);
    } catch (error) {
      setSourceSetupStatus({
        level: "error",
        message: error instanceof Error ? error.message : "audio_transcript_setup_failed",
      });
    }
  }

  async function pauseVisualSourceSetup() {
    const sourceId = existingVisualSourceId();
    if (!sourceId) {
      setSourceSetupStatus({ level: "error", message: "No visual source is registered." });
      return;
    }
    stopVisualFrameProducerInterval(sourceId, { stopStream: false });
    await postJson("/api/agi/situation/live-source/producer/heartbeat", {
      source_id: sourceId,
      thread_id: threadId,
      environment_id: environmentId,
      client_stream_confirmed: Boolean(getActiveVisualFrameStream(sourceId)),
      status: "paused",
      ts: new Date().toISOString(),
    }).catch(() => null);
    sourceSetupDraft(
      graph?.sourceWindow.sources.find((source) => source.sourceId === sourceId) ?? null,
      "pause_source",
      [["visual_cadence_ms", String(sourceSetupCadenceMs)]],
    );
    setSourceSetupStatus({ level: "ok", message: "Paused visual interval capture; existing stream ownership stayed with the visual producer." });
    await Promise.all([graphQuery.refetch(), builderContextQuery.refetch()]);
  }

  useEffect(() => {
    if (!heldNode) return;

    function handlePointerMove(event: PointerEvent) {
      const clientX = readClientCoordinate(event.clientX);
      const clientY = readClientCoordinate(event.clientY);
      setHeldNode((node) => node ? { ...node, clientX, clientY } : null);
      scrollGraphNearEdge(clientX, clientY);
    }

    function handlePointerUp(event: PointerEvent) {
      const scrollport = graphScrollportRef.current;
      setHeldNode((node) => {
        if (!node || !scrollport) return null;
        const rect = scrollport.getBoundingClientRect();
        const clientX = readClientCoordinate(event.clientX);
        const clientY = readClientCoordinate(event.clientY);
        const x = Math.max(32, Math.round(clientX - rect.left + scrollport.scrollLeft));
        const y = Math.max(32, Math.round(clientY - rect.top + scrollport.scrollTop));
        draftNodeCountRef.current += 1;
        setDraftNodes((nodes) => [
          ...nodes,
          {
            id: `draft:${node.kind}:${draftNodeCountRef.current}`,
            kind: node.kind,
            label: node.label,
            role: node.role,
            x,
            y,
            parameters: defaultDraftParametersForNode(node),
          },
        ]);
        setSelectedDraftNodeId(`draft:${node.kind}:${draftNodeCountRef.current}`);
        return null;
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [heldNode]);

  useEffect(() => {
    if (!heldNode) return;
    const timer = window.setInterval(() => {
      scrollGraphNearEdge(heldNode.clientX, heldNode.clientY);
    }, 40);
    return () => window.clearInterval(timer);
  }, [heldNode]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-400">{t("stagePlay.loading")}</div>;
  }

  if (error || !graph) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-sm text-rose-200">
        {t("stagePlay.error.load")}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="relative min-h-0 flex-1">
        {graphDisplayMode === "full_graph" && !bindingOverlayOpen ? (
          <button
            type="button"
            onClick={() => setBindingOverlayOpen(true)}
            className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 shadow-xl hover:border-cyan-500"
            aria-label={t("stagePlay.action.openConsole")}
          >
            <PanelLeftOpen className="h-4 w-4" />
            {t("stagePlay.action.console")}
          </button>
        ) : null}

        <div className="absolute right-3 top-3 z-30 flex rounded-md border border-slate-800 bg-slate-950/90 p-1 text-[10px] font-semibold uppercase tracking-wide shadow-xl">
          <button
            type="button"
            onClick={() => {
              setGraphDisplayMode("observer_mail_loop_v1");
              setBindingOverlayOpen(false);
            }}
            className={`rounded px-2.5 py-1.5 ${
              graphDisplayMode === "observer_mail_loop_v1"
                ? "bg-cyan-950 text-cyan-100"
                : "text-slate-400 hover:text-slate-100"
            }`}
            aria-label={t("stagePlay.view.showObserverMailLoop")}
            data-testid="stage-play-observer-mail-loop-toggle"
          >
            {t("stagePlay.view.processedMailLoop")}
          </button>
          <button
            type="button"
            onClick={() => setGraphDisplayMode("full_graph")}
            className={`rounded px-2.5 py-1.5 ${
              graphDisplayMode === "full_graph"
                ? "bg-cyan-950 text-cyan-100"
                : "text-slate-400 hover:text-slate-100"
            }`}
            aria-label={t("stagePlay.view.showFullGraph")}
            data-testid="stage-play-full-graph-toggle"
          >
            {t("stagePlay.view.fullGraph")}
          </button>
        </div>

        {graphDisplayMode === "full_graph" && bindingOverlayOpen ? (
          <StagePlayBindingOverlay
            graph={graph}
            builderContext={builderContext}
            sourceOptions={sourceOptions}
            draftNodeCount={draftNodes.length}
            draftValidation={draftValidation}
            query={query}
            setQuery={setQuery}
            groupedBadges={groupedBadges}
            activeFilterKind={activeFilterKind}
            setActiveFilterKind={setActiveFilterKind}
            selectedBadgeId={selectedBadgeId}
            selectedBadgeIds={selectedBadgeIds}
            setSelectedBadgeIds={setSelectedBadgeIds}
            toggleSelectedBadgeId={toggleSelectedBadgeId}
            selectedBadge={selectedBadge}
            relatedEdges={relatedEdges}
            relatedBadges={relatedBadges}
            relatedActions={relatedActions}
            onStartBuilderDrag={startBuilderDrag}
            onObserverDraftAction={handleObserverDraftAction}
            sourceSetupCadenceMs={sourceSetupCadenceMs}
            sourceSetupStatus={sourceSetupStatus}
            onSetSourceSetupCadenceMs={setSourceSetupCadenceMs}
            onStartVisualSourceSetup={startVisualSourceSetup}
            onAttachAudioTranscriptSource={attachAudioTranscriptSource}
            onPauseVisualSourceSetup={pauseVisualSourceSetup}
            onProjectLiveAnswer={handleProjectLiveAnswer}
            onCheckpointQueueAction={handleCheckpointQueueAction}
            sourceAuditSelection={sourceAuditSelection}
            rawSessionBufferEntries={rawSessionBufferQuery.data?.entries ?? []}
            rawSessionBufferLoading={rawSessionBufferQuery.isLoading}
            onOpenSourceAudit={openSourceAudit}
            onClearRawSessionBuffer={clearRawSessionBuffer}
            onClearSelectedBadge={() => {
              setSelectedBadgeId(null);
              setSelectedBadgeIds([]);
              setActiveFilterKind(null);
            }}
            onClose={() => setBindingOverlayOpen(false)}
          />
        ) : null}

        {heldNode ? (
          <div
            className={`pointer-events-none fixed z-50 flex h-16 w-16 items-center justify-center rounded-sm border-2 shadow-2xl ${kindTone(heldNode.kind)}`}
            style={{ left: heldNode.clientX - 32, top: heldNode.clientY - 32 }}
            data-testid="stage-play-held-builder-node"
            aria-hidden="true"
          >
            <span className="h-5 w-5 rounded-sm border border-cyan-100 bg-cyan-300" />
          </div>
        ) : null}

        {graphDisplayMode === "full_graph" ? (
          <StagePlayToolActivityStrip
            graph={graph}
            diff={graphDiff}
            projectionStatus={projectionStatus}
            checkpointQueueStatus={checkpointQueueStatus}
            onCheckpointQueueAction={handleCheckpointQueueAction}
          />
        ) : null}

        {selectedDraftNodeId ? (
          (() => {
            const selectedDraftNode = draftNodes.find((node) => node.id === selectedDraftNodeId) ?? null;
            return selectedDraftNode ? (
              <DraftNodeParameterEditor
                node={selectedDraftNode}
                sourceOptions={sourceOptions}
                draftValidation={draftValidation}
                onClose={() => setSelectedDraftNodeId(null)}
                onRemove={removeDraftNode}
                onUpdateParameter={updateDraftParameter}
                onAddParameter={addDraftParameter}
                onSetSourceClass={setDraftSourceClass}
                onApplySourceOption={applyDraftSourceOption}
              />
            ) : null;
          })()
        ) : null}

        <main className="flex h-full min-h-0 flex-col">
          {graphDisplayMode === "observer_mail_loop_v1" ? (
            <StagePlayObserverMailLoopCanvas
              graph={graph}
              mailbox={mailbox}
              transcript={transcript}
            />
          ) : (
            <StagePlayGraphCanvas
              graph={graph}
              graphDiff={graphDiff}
              removedBadgeGhosts={removedBadgeGhosts}
              selectedBadgeIds={selectedBadgeIds}
              selectedBadgeId={selectedBadgeId}
              draftNodes={draftNodes}
              selectedDraftNodeId={selectedDraftNodeId}
              scrollportRef={graphScrollportRef}
              onSelect={selectGraphBadge}
              onSelectDraftNode={setSelectedDraftNodeId}
              onProjectLiveAnswer={handleProjectLiveAnswer}
            />
          )}
        </main>
      </div>
    </div>
  );
}
