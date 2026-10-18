import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContextCapsuleSummary } from "@shared/helix-context-capsule";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";

import {
  HELIX_ASK_CONSOLE_ACTIVE_RECROWN_PHASE,
  HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES,
  HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES,
  HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_READY,
  HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS,
  HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS,
  HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP,
  HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_OWNS,
  HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS,
  HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
  HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS,
  HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_READY,
  HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS,
  HELIX_ASK_CONSOLE_RECROWN_PHASES,
  HELIX_ASK_CONSOLE_RECROWNED_DISPLAY_OWNERS,
  HELIX_ASK_CONSOLE_RECROWNED_PURE_HELPER_REQUIREMENTS,
  HELIX_ASK_CONSOLE_RECROWN_VERSION,
  HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP,
} from "@/components/helix/ask-console/HelixAskConsoleState";
import {
  HELIX_ASK_LEGACY_CONSOLE_ACTIVE_PATH,
  HELIX_ASK_LEGACY_CONSOLE_SLICES,
  HELIX_ASK_LEGACY_CONSOLE_SLICE_PROGRESS,
  HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT,
} from "@/components/helix/ask-console/HelixAskLegacyConsoleInventory";
import {
  buildHelixAskDebugDrawerCopyProjection,
  buildHelixAskDebugExportDrawerState,
  clearHelixAskDebugDrawerForStaleReply,
} from "@/components/helix/ask-console/HelixAskDebugDrawerState";
import {
  hasHelixAskLegacyTerminalMismatch,
  resolveHelixAskLegacyFinalSourceLabel,
  selectHelixAskLegacyFinalAnswerText,
} from "@/components/helix/ask-console/HelixAskLegacyFinalTextSelection";
import { resolveHelixAskLegacyReplyFailContext } from "@/components/helix/ask-console/HelixAskLegacyReplyDebugContext";
import { sortHelixAskLegacyReplyEventsChronologically } from "@/components/helix/ask-console/HelixAskLegacyReplyEventOrder";
import {
  HELIX_ASK_CONSOLE_DOCK_REPLY_LIST_CLASS_NAME,
  HELIX_ASK_CONSOLE_HERO_REPLY_LIST_CLASS_NAME,
  buildHelixAskConsoleRuntimeBridgeProps,
} from "@/components/helix/ask-console/HelixAskConsoleRuntimeShellProps";
import {
  captureHelixAskOperatorSurfaceBrowserRecord,
  captureHelixAskOperatorSurfaceViewportMeasurement,
  HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceBrowserCapture";
import {
  HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST,
  buildHelixAskOperatorSurfaceParityChecklistSummary,
  selectHelixAskOperatorSurfaceParityChecklistByStatus,
  selectHelixAskOperatorSurfaceParityLayoutOpenKeys,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceParityChecklist";
import {
  HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA,
  buildHelixAskOperatorSurfaceLayoutParityBrowserRecord,
  buildHelixAskOperatorSurfaceLayoutParityEvidencePacket,
  buildHelixAskOperatorSurfaceLayoutParityEvidenceFromMeasurements,
  buildHelixAskOperatorSurfaceLayoutParitySummary,
  mergeHelixAskOperatorSurfaceLayoutParityEvidence,
  resolveHelixAskOperatorSurfaceLayoutParityViewportKind,
  resolveHelixAskOperatorSurfaceLayoutParityReadiness,
  upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceLayoutParity";
import {
  buildHelixAskOperatorSurfaceParityHarnessContextIds,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceParityHarness";
import {
  HelixAskOperatorSurfaceParityEvidencePanel,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceParityEvidencePanel";
import {
  HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM,
  HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE,
  buildHelixAskOperatorSurfaceParityRouteHint,
  shouldRenderHelixAskOperatorSurfaceParityHarness,
} from "@/components/helix/ask-console/HelixAskOperatorSurfaceParityRoute";
import {
  buildHelixAskFinalAnswerBlocks,
  HelixAskFinalAnswer,
  resolveHelixAskFinalAnswerReadAloudBlockKey,
  resolveHelixAskFinalAnswerReadAloudBlockKeys,
} from "@/components/helix/ask-console/HelixAskFinalAnswer";
import { HelixAskRuntimeGoalProgressPanel } from "@/components/helix/ask-console/HelixAskFinalExtras";
import {
  buildHelixAskContextBridgeSnapshot,
  readDocPathFromDesktopUrl,
} from "@/components/helix/ask-console/HelixAskContextBridge";
import {
  buildHelixAskConsoleRequestEnvelope,
  buildHelixAskConsoleBackendTurnPayloadCore,
  buildHelixAskConsoleContextFiles,
} from "@/components/helix/ask-console/HelixAskRequestEnvelope";
import { buildHelixAskQueuedTurn } from "@/components/helix/ask-console/HelixAskQueuedTurn";
import {
  buildHelixAskDocViewerDebugSnapshotBinding,
  readHelixAskDocViewerPathFromDesktopUrlForSnapshot,
  rememberHelixAskDocViewerPathForSnapshot,
  resetHelixAskDocViewerSnapshotPathMemoryForTests,
  resolveHelixAskDocViewerSnapshotPathBinding,
} from "@/components/helix/ask-console/HelixAskActiveDocContextBinding";
import {
  buildHelixAskWorkspaceContextSnapshotBinding,
  buildHelixAskWorkstationLayoutDebugSnapshotBinding,
} from "@/components/helix/ask-console/HelixAskWorkspaceContextBinding";
import {
  copyHelixAskContextCapsuleToClipboard,
  copyHelixAskDebugJsonToClipboard,
  copyHelixAskPlainTextToClipboard,
} from "@/components/helix/ask-console/HelixAskClipboard";
import {
  buildDocViewerDebugSnapshotFromState,
  resolveDocsViewerAnchorPathCandidate,
  resolveDocViewerSnapshotPathCandidate,
} from "@/lib/helix/ask-doc-viewer-context";
import {
  buildAskTurnWorkspaceContextSnapshotFromState,
  buildWorkstationLayoutDebugSnapshotFromState,
} from "@/lib/helix/ask-workspace-context-snapshot";
import {
  buildHelixAskLatestTurnBinding,
  resolveHelixAskLatestTurnId,
} from "@/components/helix/ask-console/HelixAskLatestTurnBinding";
import {
  buildHelixAskLegacyTurnControlActionPayload,
  buildHelixAskLegacyTurnControlViewModel,
  buildHelixAskReplyCopyText,
  clearHelixAskLegacyCopiedDebugIdIfCurrent,
  collectHelixAskLegacyReplyTerminalTranscriptTexts,
  debugPayloadMatchesHelixAskLegacyRenderedReply,
  debugPayloadMatchesHelixAskLegacyRenderedTurnPayload,
  enforceHelixAskLegacyDebugExportMatchesClickedButton,
  extractHelixAskLegacyClickedTurnDebugScope,
  isHelixAskLegacyBackendDebugExportEligibleTurnId,
  isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted,
  normalizeHelixAskLegacyBackendTurnId,
  resolveHelixAskLegacyClickedDebugReply,
  resolveHelixAskLegacyDebugExportBackendTarget,
  resolveHelixAskLegacyDebugExportClientTurnId,
  resolveHelixAskLegacyReplyDebugTurnId,
  resolveHelixAskLegacyTurnControlText,
  selectHelixAskLegacyDebugCopyLocalPayload,
  selectHelixAskLegacyGuardedDebugExportPayload,
  selectHelixAskLegacyReplyScopedDebugExportPayload,
} from "@/components/helix/ask-console/HelixAskLegacyTurnControls";
import {
  HELIX_DEBUG_EXPORT_MAX_UI_CHARS,
  boundHelixDebugExportTextForUi,
} from "@/components/helix/ask-console/HelixAskDebugExportSizeControl";
import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";
import {
  resolveHelixAskBackendEntrypointFailureProjection,
} from "@/components/helix/ask-console/HelixAskBackendEntrypointProjection";
import {
  buildHelixAskBackendTurnDebugExportRef,
  copyHelixAskDebugPayloadToClipboard,
  resolveHelixAskAuthoritativeDebugExportPayload,
} from "@/components/helix/ask-console/HelixAskDebugCopyProjection";
import { mergeHelixAskClientWorkflowDemoDebugIntoExport } from "@/components/helix/ask-console/HelixAskWorkflowDebugProjection";
import { selectHelixAskVisibleFinalAnswer } from "@/components/helix/ask-console/HelixAskVisibleFinalAnswerSelection";
import {
  buildHelixAskRuntimeGoalDebugFields,
  buildHelixAskRuntimeGoalDebugSummary,
  mergeHelixAskRuntimeGoalDebugFields,
} from "@/components/helix/ask-console/HelixAskRuntimeGoalDebugContext";
import { buildHelixAskObserverLaneEvents } from "@/components/helix/ask-console/HelixAskObserverLaneEvents";
import {
  buildHelixAskActiveTimelineFeed,
  buildHelixAskTimelineFeed,
} from "@/components/helix/ask-console/HelixAskTimelineFeed";
import {
  hasSuccessfulWorkstationTerminalTranscriptRows,
  resolveHelixAskConsoleFinalAnswerSourceLabel,
} from "@/components/helix/ask-console/HelixAskFinalProjection";
import {
  selectHelixAskConsoleTurnTranscriptRowsForStream,
  selectHelixAskConsoleWorkstationTraceRows,
} from "@/components/helix/ask-console/HelixAskWorkstationTraceRows";
import { buildHelixAskRuntimePickerModel } from "@/components/helix/ask-console/HelixAskRuntimePicker";
import {
  HelixAskLiveRuntimeControls,
  buildHelixAskLiveRuntimeControlsModel,
} from "@/components/helix/ask-console/HelixAskLiveRuntimeControls";
import {
  HELIX_ASK_DISABLED_LIVE_RUNTIME_TRANSPORT_BOUNDARY,
  HELIX_ASK_LIVE_RUNTIME_LIFECYCLE_STATES,
  HELIX_ASK_LIVE_RUNTIME_TRANSPORT_CONTROLLER_STATES,
  buildHelixAskLiveRuntimeClientReceiptPayload,
  buildHelixAskLiveRuntimeRouteRequest,
  buildHelixAskLiveRuntimeTransportControllerModel,
  buildHelixAskLiveRuntimeTransportHandoffPlan,
  buildHelixAskLiveRuntimeTransportLifecycleReceiptPayload,
  buildHelixAskLiveRuntimeTransportReceiptRouteRequest,
} from "@/components/helix/ask-console/HelixAskLiveRuntimeLifecycle";
import {
  createHelixAskLiveRuntimeBrowserTransportController,
} from "@/components/helix/ask-console/HelixAskLiveRuntimeTransportController";
import {
  HELIX_ASK_CONSOLE_MAX_PROMPT_LINES,
  buildHelixAskComposerPlaceholder,
  buildHelixAskComposerViewModel,
} from "@/components/helix/ask-console/HelixAskComposer";
import { buildHelixAskSituationRoomSourceDerivedState } from "@/components/helix/ask-console/HelixAskSituationRoomSourceState";
import { buildHelixAskVoiceCaptureHealthState } from "@/components/helix/ask-console/HelixAskVoiceCaptureHealthState";
import { buildHelixAskVoiceCaptureDiagnosticsBaseState } from "@/components/helix/ask-console/HelixAskVoiceCaptureDiagnosticsState";
import { buildHelixAskVoiceFeatureFlagsState } from "@/components/helix/ask-console/HelixAskVoiceFeatureFlagsState";
import { buildHelixAskVoiceTimelineBuildInfoEvent } from "@/components/helix/ask-console/HelixAskVoiceTimelineBuildInfo";
import { buildHelixAskVoiceLevelMonitorState } from "@/components/helix/ask-console/HelixAskVoiceLevelMonitorState";
import { buildHelixAskVoiceStatusDerivedState } from "@/components/helix/ask-console/HelixAskVoiceStatusState";
import { buildHelixAskReasoningTheaterMeterState } from "@/components/helix/ask-console/HelixAskReasoningTheaterMeterState";
import { buildHelixAskReasoningTheaterStatusState } from "@/components/helix/ask-console/HelixAskReasoningTheaterStatusState";
import { buildHelixAskMoodAvatarState } from "@/components/helix/ask-console/HelixAskMoodAvatarState";
import { buildHelixAskComposerActionToolbarState } from "@/components/helix/ask-console/HelixAskComposerActionToolbarState";
import { buildHelixAskComposerTextareaState } from "@/components/helix/ask-console/HelixAskComposerTextareaState";
import { buildHelixAskSubmitAdmission } from "@/components/helix/ask-console/HelixAskSubmitAdmission";
import {
  buildHelixAskRepliesFromChatSessionProjection,
  shouldSuppressGeneratedStagePlayMailWakeChatProjection,
} from "@/components/helix/ask-console/HelixAskChatProjection";
import {
  appendHelixAskConsoleReplyChronologically,
  resolveHelixAskConsoleReplyCanonicalKey,
  shouldKeepHelixAskConsoleReplyInBriefLane,
  shouldRenderHelixAskConsoleActiveTurnStream,
  sortHelixAskConsoleRepliesChronologically,
} from "@/components/helix/ask-console/HelixAskReplyLifecycle";
import {
  buildHelixAskActiveTurnDisplayViewModel,
  HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS,
} from "@/components/helix/ask-console/HelixAskActiveTurnDisplayViewModel";
import {
  buildHelixAskConsoleChatMessagePayload,
  buildHelixAskConsoleChatTurnPayloads,
} from "@/components/helix/ask-console/HelixAskChatPersistence";
import {
  isHelixAgentRuntimeId,
  normalizeHelixAgentProvidersResponse,
  resolveHelixAgentRuntimePrimaryButtonDecision,
  resolveHelixAgentRuntimeSelectDecision,
} from "@/lib/helix/ask-agent-runtime-display";
import {
  addHelixAskLegacyChatMessage,
  addHelixAskLegacyChatTurnMessages,
} from "@/components/helix/ask-console/HelixAskLegacyChatPersistenceBinding";
import {
  HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY,
  persistHelixAskAgentRuntime,
  readStoredHelixAskAgentRuntime,
  type HelixAskRuntimePreferenceStorage,
} from "@/components/helix/ask-console/HelixAskRuntimePreference";
import {
  HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY,
  HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT,
  readHelixAskVisualCaptureAudioPreference,
  syncHelixAskVisualCaptureRoutePreference,
  type HelixAskVisualCapturePreferenceStorage,
} from "@/components/helix/ask-console/HelixAskVisualCapturePreference";
import {
  HELIX_ASK_CONTEXT_RESUME_FRAME_SCHEMA,
  HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY,
  extractHelixAskContextCompactionResumeFrame,
  extractLatestHelixAskContextCompactionResumeFrameFromReplies,
  isHelixAskContextCompactionPausePendingReply,
  isHelixAskContextCompactionResumeFrame,
  isHelixAskContextCompactionPauseText,
  readStoredHelixAskContextCompactionResumeFrame,
  writeStoredHelixAskContextCompactionResumeFrame,
  type HelixAskContextCompactionResumeFrameStorage,
} from "@/components/helix/ask-console/HelixAskContextCompactionResumeFrameStorage";
import {
  completeHelixAskMinimalRuntimeTurn,
  createHelixAskMinimalRuntimeInitialState,
  failHelixAskMinimalRuntimeTurn,
  recordHelixAskMinimalRuntimeStreamEvent,
  resolveHelixAskMinimalRuntimeAnswerText,
  startHelixAskMinimalRuntimeTurn,
} from "@/components/helix/ask-console/HelixAskMinimalRuntimeLifecycle";
import { buildHelixAskMinimalRuntimeSubmitPlan } from "@/components/helix/ask-console/HelixAskMinimalRuntimeSubmitPlan";
import {
  buildHelixAskMinimalRuntimeTurnPayload,
  runHelixAskMinimalRuntimeInjectedTransport,
} from "@/components/helix/ask-console/HelixAskMinimalRuntimeTransport";
import { createHelixAskMinimalRuntimeBackendRunner } from "@/components/helix/ask-console/HelixAskMinimalRuntimeBackendRunner";
import { buildHelixAskMinimalRuntimeRepliesFromChatSession } from "@/components/helix/ask-console/HelixAskMinimalRuntimeChatSession";
import {
  buildHelixAskMinimalRuntimeControlPayload,
  buildHelixAskMinimalRuntimeDebugCopyText,
} from "@/components/helix/ask-console/HelixAskMinimalRuntimeControls";
import {
  buildHelixAskMinimalRuntimeDebugExportRequest,
  materializeHelixAskMinimalRuntimeDebugCopyText,
  readHelixAskMinimalRuntimeDebugExportRef,
} from "@/components/helix/ask-console/HelixAskMinimalRuntimeDebugExport";
import { buildHelixAskMinimalRuntimeTurnViews } from "@/components/helix/ask-console/HelixAskMinimalRuntimeTurnList";
import {
  resolveHelixAskActualAgentProviderLabel,
  resolveHelixAskModelUsageLabel,
} from "@/lib/helix/ask-agent-runtime-display";
import { buildHelixTurnTranscriptRows } from "@/lib/helix/ask-turn-transcript";
import { readWorkstationActionArgText } from "@/lib/helix/ask-workstation-fast-path";

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("Helix Ask Console recrown boundary", () => {
  it("projects runtime goal job progress fields for the console", () => {
    const fields = buildHelixAskRuntimeGoalDebugFields({
      final_answer_source: "runtime_goal_command",
      terminal_artifact_kind: "runtime_goal_command_result",
      runtime_goal_command: {
        command: "wake",
        goal_id: "goal:test:console-progress",
      },
      runtime_goal_session: {
        schema: "helix.runtime_goal.session.v1",
        goal_id: "goal:test:console-progress",
        objective: "Keep a running summary of the visible document.",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime:codex:console-progress",
        status: "waiting",
        wake_count: 1,
        updated_at: "2026-06-29T12:05:00.000Z",
        job_brief: {
          schema: "helix.runtime_goal.job_brief.v1",
          user_goal_text: "Keep a running summary of the visible document.",
          expected_wake_behavior: "Inspect admitted workstation evidence and report progress.",
        },
        latest_wake_plan: {
          schema: "helix.runtime_goal.wake_plan.v1",
          requested_observation_or_lane: "docs-viewer.read_visible_surface",
          relevance_reason: "The wake plan requests docs-viewer.read_visible_surface for the assigned job.",
          expected_terminal_product: "job_progress_report",
        },
        latest_progress_summary: {
          schema: "helix.runtime_goal.progress_summary.v1",
          job: "Keep a running summary of the visible document.",
          observed_source: {
            schema: "helix.runtime_goal.source_binding.v1",
            source_kind: "docs_viewer_visible_surface",
            source_label: "docs/current.md",
            doc_path: "docs/current.md",
            source_freshness_ms: 42,
          },
          evidence_used: {
            requested_tool_or_lane: "docs-viewer.read_visible_surface",
            observation_refs: ["obs:visible-doc"],
            receipt_refs: ["receipt:visible-doc"],
            provider_terminal_candidate_ref: "candidate:codex",
          },
          current_summary: "The visible section now emphasizes bounded evidence states.",
          next_wake_behavior: "Waiting for the next /goal wake.",
          terminal_authority_status: "authorized",
        },
        latest_source_binding: {
          schema: "helix.runtime_goal.source_binding.v1",
          source_kind: "docs_viewer_visible_surface",
          source_label: "docs/current.md",
          doc_path: "docs/current.md",
          source_freshness_ms: 42,
        },
        latest_observation_refs: ["obs:visible-doc"],
        latest_receipt_refs: ["receipt:visible-doc"],
        latest_provider_terminal_candidate_ref: "candidate:codex",
        terminal_authority_status: "authorized",
      },
      runtime_goal_debug_export: {
        schema: "helix.runtime_goal.debug_export.v1",
        goal_id: "goal:test:console-progress",
        runtime_provider: "codex",
        runtime_session_id: "runtime:codex:console-progress",
        session_status: "waiting",
        runtime_goal_terminal_authority_status: "authorized",
        wake_events: [
          {
            wake_event_id: "goal-wake:console-progress",
            created_at: "2026-06-29T12:05:00.000Z",
          },
        ],
        debug_events: [
          { stage: "evidence_reentered", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
          { stage: "runtime_candidate_generated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
          { stage: "terminal_authority_evaluated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
        ],
        latest_wake_candidate: {
          schema: "helix.runtime_goal.wake_candidate.v1",
          event_kind: "visible_source_changed",
          reason: "docs_viewer_active_doc_changed",
          dedupe_key: "docs-viewer:docs/current.md",
        },
        latest_wake_admission: {
          schema: "helix.runtime_goal.wake_admission.v1",
          status: "admitted",
          reason: "visible_source_changed",
        },
      },
    });

    expect(fields.runtime_goal_debug_summary).toMatchObject({
      schema: "helix.runtime_goal.debug_copy_summary.v1",
      command: "wake",
      goal_id: "goal:test:console-progress",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:console-progress",
      session_status: "waiting",
      wake_count: 1,
      last_wake_at: "2026-06-29T12:05:00.000Z",
      last_wake_event_id: "goal-wake:console-progress",
      session_updated_at: "2026-06-29T12:05:00.000Z",
      job_title: "Keep a running summary of the visible document.",
      observed_source_label: "docs/current.md",
      observed_source_kind: "docs_viewer_visible_surface",
      observed_source_doc_path: "docs/current.md",
      observed_source_freshness_ms: 42,
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      wake_relevance_reason: "The wake plan requests docs-viewer.read_visible_surface for the assigned job.",
      wake_expected_terminal_product: "job_progress_report",
      wake_candidate_event_kind: "visible_source_changed",
      wake_candidate_reason: "docs_viewer_active_doc_changed",
      wake_candidate_dedupe_key: "docs-viewer:docs/current.md",
      wake_admission_status: "admitted",
      wake_admission_reason: "visible_source_changed",
      current_progress_summary: "The visible section now emphasizes bounded evidence states.",
      next_wake_behavior: "Waiting for the next /goal wake.",
      terminal_authority_status: "authorized",
      latest_observation_refs: ["obs:visible-doc"],
      latest_receipt_refs: ["receipt:visible-doc"],
      provider_terminal_candidate_ref: "candidate:codex",
      evidence_reentered: true,
      runtime_candidate_generated: true,
      terminal_authority_evaluated: true,
    });
  });

  it("builds runtime goal debug summaries from split command/session/debug export records", () => {
    expect(buildHelixAskRuntimeGoalDebugSummary({
      command: { command: "wake", goal_id: "goal:test:split-summary" },
      session: {
        goal_id: "goal:test:split-summary",
        objective: "Watch the open source.",
        runtime_agent_provider: "helix",
        runtime_session_id: "runtime:helix:split-summary",
        status: "waiting",
        updated_at: "2026-06-29T12:07:00.000Z",
        wake_count: 2,
        terminal_authority_status: "authorized",
      },
      debugExport: {
        runtime_goal_job_brief: {
          user_goal_text: "Watch the open source.",
        },
        runtime_goal_wake_plan: {
          requested_observation_or_lane: "docs-viewer.read_visible_surface",
          relevance_reason: "The wake plan reads the visible source for the assigned job.",
          expected_terminal_product: "job_progress_report",
          current_source_binding: {
            source_label: "docs/source.md",
            doc_path: "docs/source.md",
          },
        },
        runtime_goal_progress_summary: {
          current_summary: "Progress was updated from document evidence.",
          next_wake_behavior: "Wake on the next manual command.",
          evidence_used: {
            observation_refs: ["obs:split"],
            receipt_refs: ["receipt:split"],
          },
        },
        debug_events: [
          { stage: "evidence_reentered", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
        ],
        wake_events: [
          {
            wake_event_id: "goal-wake:split-summary",
            created_at: "2026-06-29T12:07:00.000Z",
          },
        ],
      },
    })).toMatchObject({
      job_title: "Watch the open source.",
      wake_count: 2,
      last_wake_at: "2026-06-29T12:07:00.000Z",
      last_wake_event_id: "goal-wake:split-summary",
      session_updated_at: "2026-06-29T12:07:00.000Z",
      observed_source_label: "docs/source.md",
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      wake_relevance_reason: "The wake plan reads the visible source for the assigned job.",
      wake_expected_terminal_product: "job_progress_report",
      current_progress_summary: "Progress was updated from document evidence.",
      next_wake_behavior: "Wake on the next manual command.",
      latest_observation_refs: ["obs:split"],
      latest_receipt_refs: ["receipt:split"],
      evidence_reentered: true,
    });
  });

  it("backfills partial backend runtime goal summaries from session and debug export fields", () => {
    expect(buildHelixAskRuntimeGoalDebugSummary({
      command: { command: "wake", goal_id: "goal:test:partial-summary" },
      session: {
        goal_id: "goal:test:partial-summary",
        objective: "Watch the visible document.",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime:codex:partial-summary",
        status: "waiting",
        updated_at: "2026-06-29T12:11:00.000Z",
        wake_count: 3,
        terminal_authority_status: "authorized",
        latest_observation_refs: ["obs:partial"],
        latest_receipt_refs: ["receipt:partial"],
        latest_provider_terminal_candidate_ref: "candidate:partial",
        job_brief: {
          user_goal_text: "Watch the visible document.",
        },
        latest_wake_plan: {
          requested_observation_or_lane: "docs-viewer.read_visible_surface",
        },
        latest_progress_summary: {
          current_summary: "Rebuilt progress text.",
          next_wake_behavior: "Wait for the next visible-source wake.",
          observed_source: {
            source_label: "docs/partial.md",
            doc_path: "docs/partial.md",
          },
          evidence_used: {
            observation_refs: ["obs:partial"],
            receipt_refs: ["receipt:partial"],
            provider_terminal_candidate_ref: "candidate:partial",
          },
        },
      },
      debugExport: {
        wake_events: [
          {
            wake_event_id: "wake:partial",
            created_at: "2026-06-29T12:11:00.000Z",
          },
        ],
        debug_events: [
          { stage: "evidence_reentered", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
          { stage: "runtime_candidate_generated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
          { stage: "terminal_authority_evaluated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
        ],
      },
      existingSummary: {
        schema: "helix.runtime_goal.debug_copy_summary.v1",
        goal_id: "goal:test:partial-summary",
        runtime_agent_provider: "codex",
        session_status: "waiting",
        current_progress_summary: "Backend-authored progress text.",
        latest_observation_refs: [],
        latest_receipt_refs: null,
        assistant_answer: false,
        terminal_eligible: false,
      },
    })).toMatchObject({
      schema: "helix.runtime_goal.debug_copy_summary.v1",
      goal_id: "goal:test:partial-summary",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:partial-summary",
      session_status: "waiting",
      wake_count: 3,
      last_wake_at: "2026-06-29T12:11:00.000Z",
      last_wake_event_id: "wake:partial",
      job_title: "Watch the visible document.",
      observed_source_label: "docs/partial.md",
      observed_source_doc_path: "docs/partial.md",
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      current_progress_summary: "Backend-authored progress text.",
      next_wake_behavior: "Wait for the next visible-source wake.",
      terminal_authority_status: "authorized",
      latest_observation_refs: ["obs:partial"],
      latest_receipt_refs: ["receipt:partial"],
      provider_terminal_candidate_ref: "candidate:partial",
      evidence_reentered: true,
      runtime_candidate_generated: true,
      terminal_authority_evaluated: true,
      assistant_answer: false,
      terminal_eligible: false,
    });
  });

  it("renders runtime goal progress through the shared reply card boundary", () => {
    const finalExtrasSource = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");
    const replyCardSource = read("client/src/components/helix/ask-console/HelixAskReplyCard.tsx");
    const minimalTurnListSource = read("client/src/components/helix/ask-console/HelixAskMinimalRuntimeTurnList.tsx");
    const legacyBridgeSource = read("client/src/components/helix/HelixAskPill.tsx");

    expect(finalExtrasSource).toContain("export function HelixAskRuntimeGoalProgressPanel");
    expect(finalExtrasSource).toContain("data-testid={isLatestReply ? \"helix-ask-latest-runtime-goal-progress\"");
    expect(finalExtrasSource).toContain("Goal progress");
    expect(finalExtrasSource).toContain("terminal_authority_status");
    expect(finalExtrasSource).toContain("Authority");
    expect(finalExtrasSource).toContain("wake_expected_terminal_product");
    expect(finalExtrasSource).toContain("wake_relevance_reason");
    expect(finalExtrasSource).toContain("wake_candidate_event_kind");
    expect(finalExtrasSource).toContain("wake_admission_status");
    expect(finalExtrasSource).toContain("requested_observation_or_lane");

    expect(replyCardSource).toContain("runtimeGoalDebugSummary?: Record<string, unknown> | null");
    expect(replyCardSource).toContain("<HelixAskRuntimeGoalProgressPanel");
    expect(replyCardSource).toContain("summary={runtimeGoalDebugSummary}");
    expect(replyCardSource).not.toContain("runtime_goal_session");
    expect(replyCardSource).not.toContain("terminal_answer_authority");

    expect(minimalTurnListSource).toContain("mergeHelixAskRuntimeGoalDebugFields");
    expect(minimalTurnListSource).toContain("runtimeGoalDebugSummary={view.runtimeGoalDebugSummary}");
    expect(legacyBridgeSource).toContain("runtimeGoalDebugSummary = mergeHelixAskRuntimeGoalDebugFields");
    expect(legacyBridgeSource).toContain("runtimeGoalDebugSummary,");
  });

  it("renders runtime goal progress as visible console text", () => {
    const html = renderToStaticMarkup(
      React.createElement(HelixAskRuntimeGoalProgressPanel, {
        isLatestReply: true,
        summary: {
          goal_id: "goal:ui-progress",
          runtime_agent_provider: "codex",
          job_title: "Watch the visible document.",
          observed_source_label: "docs/current.md",
          observed_source_kind: "docs_viewer_visible_surface",
          observed_source_freshness_ms: 42,
          requested_observation_or_lane: "docs-viewer.read_visible_surface",
          wake_expected_terminal_product: "job_progress_report",
          wake_relevance_reason: "The wake plan requests docs-viewer.read_visible_surface for the assigned job.",
          wake_candidate_event_kind: "visible_source_changed",
          wake_admission_status: "admitted",
          current_progress_summary: "The visible section was inspected.",
          next_wake_behavior: "Waiting for the next wake.",
          terminal_authority_status: "authorized",
          terminal_answer_server_authoritative: true,
          session_status: "waiting",
          last_wake_at: "2026-06-29T12:10:00.000Z",
          latest_observation_refs: ["obs:visible"],
          latest_receipt_refs: ["receipt:visible"],
          provider_terminal_candidate_ref: "candidate:codex",
        },
      }),
    );

    expect(html).toContain("helix-ask-latest-runtime-goal-progress");
    expect(html).toContain("Goal progress");
    expect(html).toContain("Watch the visible document.");
    expect(html).toContain("codex");
    expect(html).toContain("waiting");
    expect(html).toContain("2026-06-29T12:10:00.000Z");
    expect(html).toContain("docs/current.md");
    expect(html).toContain("docs_viewer_visible_surface");
    expect(html).toContain("42 ms");
    expect(html).toContain("docs-viewer.read_visible_surface");
    expect(html).toContain("job_progress_report");
    expect(html).toContain("The wake plan requests docs-viewer.read_visible_surface for the assigned job.");
    expect(html).toContain("visible_source_changed");
    expect(html).toContain("admitted");
    expect(html).toContain("The visible section was inspected.");
    expect(html).toContain("Waiting for the next wake.");
    expect(html).toContain("Authority");
    expect(html).toContain("Server authority");
    expect(html).toContain("server-authorized");
    expect(html).toContain("1 observation | 1 receipt | candidate recorded");
    expect(html).toContain("authorized");
  });

  it("preserves split runtime goal fields in minimal runtime turn views", () => {
    const [view] = buildHelixAskMinimalRuntimeTurnViews({
      replies: [
        {
          id: "ask:split-runtime-goal",
          turn_id: "ask:split-runtime-goal",
          createdAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
          content: "Goal progress answer.",
          question: "/goal wake",
          mode: "observe",
          liveEvents: [],
          result: {
            selected_final_answer: "Goal progress answer.",
            text: "Goal progress answer.",
            runtime_goal_command: {
              command: "wake",
              goal_id: "goal:split-runtime-view",
            },
            debug: {
              runtime_goal_session: {
                goal_id: "goal:split-runtime-view",
                runtime_agent_provider: "codex",
                runtime_session_id: "runtime:codex:split-view",
                status: "waiting",
                latest_observation_refs: ["obs:split-view"],
                latest_receipt_refs: ["receipt:split-view"],
                terminal_authority_status: "authorized",
                job_brief: {
                  user_goal_text: "Watch the document from Codex.",
                },
                latest_wake_plan: {
                  requested_observation_or_lane: "docs-viewer.read_visible_surface",
                },
                latest_progress_summary: {
                  current_summary: "The document changed in the visible section.",
                  next_wake_behavior: "Waiting for another wake.",
                  observed_source: {
                    source_label: "docs/split.md",
                    doc_path: "docs/split.md",
                  },
                  evidence_used: {
                    observation_refs: ["obs:split-view"],
                    receipt_refs: ["receipt:split-view"],
                  },
                },
              },
              runtime_goal_debug_export: {
                runtime_goal_terminal_authority_status: "authorized",
                debug_events: [
                  { stage: "evidence_reentered", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
                  { stage: "terminal_authority_evaluated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
                ],
              },
            },
          },
        },
      ],
    });

    expect(view?.runtimeGoalDebugSummary).toMatchObject({
      command: "wake",
      goal_id: "goal:split-runtime-view",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:split-view",
      job_title: "Watch the document from Codex.",
      observed_source_label: "docs/split.md",
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      current_progress_summary: "The document changed in the visible section.",
      next_wake_behavior: "Waiting for another wake.",
      latest_observation_refs: ["obs:split-view"],
      latest_receipt_refs: ["receipt:split-view"],
      terminal_authority_status: "authorized",
      evidence_reentered: true,
      terminal_authority_evaluated: true,
    });
  });

  it("preserves streamed runtime goal summaries in minimal runtime turn views", () => {
    const [view] = buildHelixAskMinimalRuntimeTurnViews({
      replies: [
        {
          id: "ask:stream-runtime-goal",
          turn_id: "ask:stream-runtime-goal",
          createdAtMs: Date.UTC(2026, 5, 29, 12, 20, 0),
          content: [
            "Goal: Keep a cumulative summary of the visible document section.",
            "Runtime: codex",
            "Observed source: docs/audits/research/civilization-bounds-nation-procedural-network-fit-2026-06-17.md",
            "Evidence used: docs-viewer.read_visible_surface",
            "",
            "Current summary:",
            "Visible progress: the document says civilization labels are provisional evidence states.",
          ].join("\n"),
          question: "/goal wake",
          mode: "observe",
          liveEvents: [],
          result: {
            ok: true,
            selected_final_answer: "Goal progress answer.",
            final_answer_source: "runtime_goal_command",
            terminal_artifact_kind: "runtime_goal_command_result",
            runtime_goal_command: {
              command: "wake",
              goal_id: "goal:stream-runtime-view",
            },
            runtime_goal_session: {
              goal_id: "goal:stream-runtime-view",
              runtime_agent_provider: "codex",
              runtime_session_id: "runtime:codex:stream-view",
              status: "waiting",
              wake_count: 1,
              updated_at: "2026-06-29T12:20:00.000Z",
              terminal_authority_status: "authorized",
              latest_observation_refs: ["obs:stream-visible"],
              latest_receipt_refs: [],
              job_brief: {
                user_goal_text: "Keep a cumulative summary of the visible document section.",
              },
              latest_wake_plan: {
                requested_observation_or_lane: "docs-viewer.read_visible_surface",
                expected_terminal_product: "job_progress_report",
              },
              latest_progress_summary: {
                current_summary: "Rebuilt summary should not replace backend-authored progress.",
                next_wake_behavior: "Waiting for the next /goal wake.",
                observed_source: {
                  source_label: "docs/audits/research/civilization-bounds-nation-procedural-network-fit-2026-06-17.md",
                  doc_path: "docs/audits/research/civilization-bounds-nation-procedural-network-fit-2026-06-17.md",
                },
                evidence_used: {
                  requested_tool_or_lane: "docs-viewer.read_visible_surface",
                  observation_refs: ["obs:stream-visible"],
                  receipt_refs: [],
                },
              },
            },
            runtime_goal_debug_export: {
              runtime_goal_terminal_authority_status: "authorized",
              wake_events: [
                {
                  wake_event_id: "goal-wake:stream-view",
                  created_at: "2026-06-29T12:20:00.000Z",
                },
              ],
              debug_events: [
                { stage: "tool_or_lane_requested", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
                { stage: "evidence_reentered", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
                { stage: "runtime_candidate_generated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
                { stage: "terminal_authority_evaluated", requested_tool_or_lane: "docs-viewer.read_visible_surface" },
              ],
              terminal_answer_authority: {
                schema: "helix.turn_terminal_authority.v1",
                route: "/ask/turn/stream",
                server_authoritative: true,
              },
            },
            runtime_goal_debug_summary: {
              schema: "helix.runtime_goal.debug_copy_summary.v1",
              command: "wake",
              goal_id: "goal:stream-runtime-view",
              runtime_agent_provider: "codex",
              runtime_session_id: "runtime:codex:stream-view",
              session_status: "waiting",
              job_title: "Backend-authored streamed goal title.",
              observed_source_doc_path: "docs/audits/research/civilization-bounds-nation-procedural-network-fit-2026-06-17.md",
              requested_observation_or_lane: "docs-viewer.read_visible_surface",
              current_progress_summary: "Backend-authored streamed progress summary.",
              terminal_authority_status: "authorized",
              latest_observation_refs: ["obs:stream-visible"],
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
            },
            terminal_answer_authority: {
              schema: "helix.turn_terminal_authority.v1",
              route: "/ask/turn/stream",
              server_authoritative: true,
            },
            debug: {
              runtime_goal_debug_summary: {
                schema: "helix.runtime_goal.debug_copy_summary.v1",
                current_progress_summary: "Backend-authored streamed progress summary.",
              },
            },
          },
        },
      ],
    });

    expect(view?.runtimeGoalDebugSummary).toMatchObject({
      command: "wake",
      goal_id: "goal:stream-runtime-view",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:stream-view",
      session_status: "waiting",
      job_title: "Backend-authored streamed goal title.",
      observed_source_doc_path: "docs/audits/research/civilization-bounds-nation-procedural-network-fit-2026-06-17.md",
      requested_observation_or_lane: "docs-viewer.read_visible_surface",
      current_progress_summary: "Backend-authored streamed progress summary.",
      terminal_authority_status: "authorized",
      latest_observation_refs: ["obs:stream-visible"],
      terminal_answer_server_authoritative: true,
      evidence_reentered: true,
      runtime_candidate_generated: true,
      terminal_authority_evaluated: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(HelixAskRuntimeGoalProgressPanel, {
        isLatestReply: true,
        summary: view?.runtimeGoalDebugSummary,
      }),
    );
    expect(html).toContain("helix-ask-latest-runtime-goal-progress");
    expect(html).toContain("Backend-authored streamed goal title.");
    expect(html).toContain("Backend-authored streamed progress summary.");
    expect(html).toContain("docs-viewer.read_visible_surface");
    expect(html).toContain("authorized");
  });

  it("loads the rendered console crown behind the app entrypoint", async () => {
    (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

    const module = await import("@/components/helix/ask-console");

    expect(typeof module.HelixAskConsole).toBe("function");
  }, 30000);

  it("creates the new ask-console crown modules for the live surface", () => {
    const root = path.resolve(process.cwd(), "client/src/components/helix/ask-console");
    const expectedFiles = [
      "HelixAskConsole.tsx",
      "HelixAskConsoleRuntimeShell.tsx",
      "HelixAskMinimalRuntimeShell.tsx",
      "HelixAskConsoleRuntimeShellProps.ts",
      "HelixAskBusyReasoningPanel.tsx",
      "HelixAskErrorBoundary.tsx",
      "HelixAskComposer.tsx",
      "HelixAskComposerTextareaSurface.tsx",
      "HelixAskComposerTextareaState.ts",
      "HelixAskComposerTextareaSizing.ts",
      "HelixAskPromptHistory.ts",
      "HelixAskSlashCommandCatalog.ts",
      "HelixAskSlashCommandInsertion.ts",
      "HelixAskSlashCommandMenu.tsx",
      "HelixAskSlashCommandMenuState.ts",
      "HelixAskLegacyComposerSurface.tsx",
      "HelixAskLegacyComposerState.ts",
      "HelixAskLegacySurfaceContent.tsx",
      "HelixAskLegacySurfaceContentState.ts",
      "HelixAskRuntimePicker.tsx",
      "HelixAskMoodAvatar.tsx",
      "HelixAskMoodAvatarSurface.tsx",
      "HelixAskMoodAvatarState.ts",
      "HelixAskActionToolbar.tsx",
      "useHelixAskActionCarousel.ts",
      "HelixAskComposerActionToolbarSurface.tsx",
      "HelixAskComposerActionToolbarState.ts",
      "HelixAskGoalPill.tsx",
      "HelixAskGoalPillSurface.tsx",
      "HelixAskGoalPillState.ts",
      "HelixAskProceduralTimeline.tsx",
      "HelixAskLegacyProceduralTimelineSlot.tsx",
      "HelixAskLegacyProceduralTimelineProjection.tsx",
      "HelixAskConsoleStack.tsx",
      "HelixAskLegacyConsoleView.tsx",
      "HelixAskLegacyConsoleRootState.ts",
      "HelixAskLegacyConsoleViewState.ts",
      "HelixAskConsoleRuntimeLayout.tsx",
      "HelixAskReasoningAnimationStyles.tsx",
      "HelixAskReasoningBattleStage.tsx",
      "HelixAskReasoningMeterSurface.tsx",
      "HelixAskReasoningMirekField.tsx",
      "HelixAskReasoningStatusMedalStrip.tsx",
      "HelixAskReasoningTheaterSurface.tsx",
      "HelixAskReasoningTheaterState.ts",
      "HelixAskReasoningTheaterMeterState.ts",
      "HelixAskReasoningTheaterStatusState.ts",
      "HelixAskSurfaceComposerPanel.tsx",
      "HelixAskSurfaceFrame.tsx",
      "HelixAskSurfaceFrameSurface.tsx",
      "HelixAskSurfaceFrameState.ts",
      "HelixAskSurfaceSupplementStack.tsx",
      "HelixAskConsoleSupplementSurface.tsx",
      "HelixAskConsoleSupplementState.ts",
      "HelixAskAttachmentStripState.ts",
      "HelixAskSupplementClipTextState.ts",
      "HelixAskContextCapsuleState.ts",
      "HelixAskSituationRoomSourceState.ts",
      "HelixAskVoiceConfirmationState.ts",
      "HelixAskVoiceStatusState.ts",
      "HelixAskVoiceCaptureHealthState.ts",
      "HelixAskVoiceCaptureDiagnosticsState.ts",
      "HelixAskVoiceFeatureFlagsState.ts",
      "HelixAskContextChooserState.ts",
      "HelixAskObserverSupplementState.ts",
      "HelixAskContextMemoryStatusState.ts",
      "HelixAskTurnList.tsx",
      "HelixAskTurnListSurface.tsx",
      "HelixAskActiveTurnListState.ts",
      "HelixAskReplyCard.tsx",
      "HelixAskReplyTurn.tsx",
      "HelixAskReplyTurnState.ts",
      "HelixAskCompletedReplyTurnSurface.tsx",
      "HelixAskLegacyCompletedReplySlot.tsx",
      "HelixAskReplyTurnItemSurface.tsx",
      "HelixAskReplyTurnSurface.tsx",
      "HelixAskActiveTurnReply.tsx",
      "HelixAskActiveTurnReplySurface.tsx",
      "HelixAskDebugDrawerSurface.tsx",
      "HelixAskLegacyCompletedReplyState.ts",
      "HelixAskLegacyFinalTextSelection.ts",
      "HelixAskLegacyReplyDebugContext.ts",
      "HelixAskLegacyReplyEventOrder.ts",
      "HelixAskLegacyChatPersistenceBinding.ts",
      "HelixAskRuntimePreference.ts",
      "HelixAskVisualCapturePreference.ts",
      "HelixAskContextCompactionResumeFrameStorage.ts",
      "HelixAskVoiceTimelineBuildInfo.ts",
      "HelixAskTurnStreamPanel.tsx",
      "HelixAskCalculatorPanelLaunchSurface.tsx",
      "HelixAskEnvelopeAnswerSurface.tsx",
      "HelixAskEnvelopeSectionsSurface.tsx",
      "HelixAskEnvelopeSupplementSurface.tsx",
      "HelixAskFinalAnswer.tsx",
      "HelixAskFinalAnswerSurface.tsx",
      "HelixAskInlineCodeSurface.tsx",
      "HelixAskMathHtmlSurface.tsx",
      "HelixAskMermaidBlock.tsx",
      "HelixAskRenderedContentSurface.tsx",
      "HelixAskPathLinkedTextSurface.tsx",
      "HelixAskLegacyContentRenderers.tsx",
      "HelixAskLegacyAnswerEnvelopeSlot.tsx",
      "HelixAskPlainAnswerSurface.tsx",
      "HelixAskFinalExtras.tsx",
      "HelixAskActiveTurnStreamPanel.tsx",
      "HelixAskTurnControls.tsx",
      "HelixAskCompletedReplyBattleState.ts",
      "HelixAskCompletedReplyCardState.ts",
      "HelixAskCompletedReplyStreamState.ts",
      "HelixAskDebugDrawer.tsx",
      "HelixAskDebugDrawerState.ts",
      "HelixAskAttachmentStrip.tsx",
      "HelixAskAttachmentCommit.ts",
      "HelixAskAttachmentPayload.ts",
      "HelixAskImageAttachment.ts",
      "HelixAskTextAttachment.ts",
      "HelixAskStatusLine.tsx",
      "HelixAskConsoleStatusSurfaces.tsx",
      "HelixAskConsoleErrorLineSurface.tsx",
      "HelixAskConsoleErrorLineState.ts",
      "HelixAskVoiceLevelMonitor.tsx",
      "HelixAskVoiceLevelMonitorSurface.tsx",
      "HelixAskVoiceLevelMonitorState.ts",
      "HelixAskObserverLane.tsx",
      "HelixAskSteeringQueuePanel.tsx",
      "HelixAskSteeringQueueSurface.tsx",
      "HelixAskContextCapsulePreview.tsx",
      "HelixAskSituationRoomSourcePanel.tsx",
      "HelixAskVoiceConfirmationPanel.tsx",
      "HelixAskLegacyConsoleInventory.ts",
      "HelixAskContextBridge.ts",
      "HelixAskRequestEnvelope.ts",
      "HelixAskBackendEntrypointPolicy.ts",
      "HelixAskMinimalRuntimeLifecycle.ts",
      "HelixAskMinimalRuntimeSubmitPlan.ts",
      "HelixAskMinimalRuntimeTransport.ts",
      "HelixAskMinimalRuntimeBackendRunner.ts",
      "HelixAskMinimalRuntimeControls.ts",
      "HelixAskMinimalRuntimeDebugExport.ts",
      "HelixAskMinimalRuntimeChatSession.ts",
      "HelixAskMinimalRuntimeTurnList.tsx",
      "HelixAskLatestTurnBinding.ts",
      "HelixAskLegacyTurnControls.ts",
      "HelixAskFinalProjection.ts",
      "HelixAskWorkstationTraceRows.ts",
      "HelixAskSubmitAdmission.ts",
      "HelixAskChatProjection.ts",
      "HelixAskReplyLifecycle.ts",
      "HelixAskChatPersistence.ts",
      "HelixAskConsoleState.ts",
      "index.ts",
    ];

    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(root, file))).toBe(true);
    }
    expect(HELIX_ASK_CONSOLE_RECROWN_VERSION).toBe("ask-console-recrown-v1");
    expect(HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS).toEqual([
      "prompt_input",
      "runtime_picker",
      "active_docs_context_handoff",
      "request_envelope",
      "submit_stream_handling",
      "latest_turn_selection",
      "final_answer_rendering",
      "workstation_trace_rows",
      "provider_model_metadata",
      "copy_final",
      "debug_copy_export",
      "read_aloud",
      "chat_session_persistence",
    ]);
  });

  it("projects voice capture health without owning media capture behavior", () => {
    const base = {
      nowMs: 1_000,
      meterStats: {
        rmsRaw: 0.2,
        rmsDb: -18,
        peak: 0.4,
        noiseFloor: 0.01,
        displayLevel: 0.32,
      },
      recorderStats: {
        mediaChunkCount: 3,
        mediaBytes: 2048,
        lastChunkAtMs: 800,
        chunksPerSecond: 2,
      },
      lastRoundtripMs: 180,
    };

    expect(buildHelixAskVoiceCaptureHealthState({
      ...base,
      micArmState: "off",
      warnings: [],
      checkpointList: [{ status: "ok" }],
    })).toMatchObject({
      displayLevel: 0.32,
      mediaChunkCount: 3,
      mediaBytes: 2048,
      lastChunkAgeMs: 200,
      pipelineStatus: "idle",
      lastRoundtripMs: 180,
    });

    expect(buildHelixAskVoiceCaptureHealthState({
      ...base,
      micArmState: "on",
      warnings: [],
      checkpointList: [{ status: "ok" }],
    }).pipelineStatus).toBe("active");

    expect(buildHelixAskVoiceCaptureHealthState({
      ...base,
      micArmState: "on",
      warnings: ["flat_signal"],
      checkpointList: [{ status: "ok" }],
    }).pipelineStatus).toBe("attention");

    expect(buildHelixAskVoiceCaptureHealthState({
      ...base,
      nowMs: 700,
      micArmState: "on",
      warnings: [],
      checkpointList: [{ status: "warn" }],
    })).toMatchObject({
      lastChunkAgeMs: 0,
      pipelineStatus: "attention",
    });
  });

  it("projects the shared voice capture diagnostics base without publishing diagnostics", () => {
    expect(buildHelixAskVoiceCaptureDiagnosticsBaseState({
      micArmState: "on",
      voiceInputState: "transcribing",
      voiceSignalState: "speech",
      voiceMonitorLevel: 0.62,
      voiceMonitorThreshold: 0.2,
      voiceRecorderMimeType: "audio/webm",
      voiceInputDeviceLabel: "Studio Mic",
      voiceTrackMuted: false,
      voiceCaptureHealth: {
        rmsRaw: 0.3,
        rmsDb: -12,
        peak: 0.7,
        noiseFloor: 0.02,
        displayLevel: 0.62,
        mediaChunkCount: 4,
        mediaBytes: 4096,
        chunksPerSecond: 3,
        lastChunkAgeMs: 125,
        warnings: ["recorder_stalled"],
        pipelineStatus: "attention",
        lastRoundtripMs: 240,
      },
      warnings: ["recorder_stalled"],
      checkpointList: [
        {
          key: "recorder",
          status: "warn",
          message: "Recorder has not produced a recent chunk.",
          lastAtMs: 900,
        },
      ],
      checkpointLabels: {
        recorder: "Recorder",
      },
      segments: [
        {
          id: "segment:1",
          cutAtMs: 1_000,
          durationMs: 800,
          status: "stt_ok",
          sttLatencyMs: 120,
          transcriptPreview: "hello",
          translated: false,
          dispatch: "queued",
          engine: "whisper",
          error: null,
          speakerId: "speaker:a",
          speakerConfidence: 0.9,
          speechProbability: 0.8,
          snrDb: 14,
          confirmAutoEligible: true,
          confirmBlockReason: null,
        },
      ],
      pendingConfirmation: {
        dispatchState: "confirm",
        needsConfirmation: true,
        pivotConfidence: 0.72,
        speechProbability: 0.8,
        snrDb: 14,
        speakerId: "speaker:a",
        speakerConfidence: 0.9,
        confirmAutoEligible: false,
        confirmBlockReason: "low_confidence",
      },
      voiceFeatureFlags: {
        ...buildHelixAskVoiceFeatureFlagsState({
          confirmV2RolloutEligible: true,
          confirmV2Active: true,
          confirmV2ShadowMode: false,
          commandLaneUiEnabled: true,
          localAudioGateActive: true,
          sessionSpeakerActive: true,
          multiSpeakerUiActive: false,
          noisyEnvironmentMode: false,
        }),
      },
    })).toMatchObject({
      micArmState: "on",
      voiceInputState: "transcribing",
      voiceSignalState: "speech",
      rmsRaw: 0.3,
      mediaChunkCount: 4,
      warnings: ["recorder_stalled"],
      checkpoints: [
        {
          key: "recorder",
          label: "Recorder",
          status: "warn",
          message: "Recorder has not produced a recent chunk.",
          lastAtMs: 900,
        },
      ],
      segments: [
        {
          id: "segment:1",
          dispatch: "queued",
          speakerId: "speaker:a",
          confirmAutoEligible: true,
        },
      ],
      pendingConfirmation: {
        dispatchState: "confirm",
        needsConfirmation: true,
        confirmAutoEligible: false,
        confirmBlockReason: "low_confidence",
      },
      voiceFeatureFlags: {
        confirmV2Active: true,
        commandLaneUiEnabled: true,
      },
    });
  });

  it("projects the voice timeline build-info event outside the bridge", () => {
    expect(buildHelixAskVoiceTimelineBuildInfoEvent({
      buildInfo: {
        clientBuild: "client-dev",
        clientMode: "dev",
        serverService: "helix",
        serverVersion: "1.2.3",
        serverGitSha: "abcdef1234567890",
        serverBuildTime: "2026-07-05T10:00:00Z",
        fetchedAtMs: 1_000,
        error: null,
      },
      atMs: 1_100,
    })).toMatchObject({
      id: "build:client-dev-1.2.3-abcdef1234567890",
      atMs: 1_100,
      source: "system",
      kind: "build_info",
      status: "ok",
      traceId: null,
      turnKey: null,
      attemptId: null,
      text: "client:client-dev | server:1.2.3 | git:abcdef123456",
      detail: "client_mode:dev | service:helix | build_time:2026-07-05T10:00:00Z",
    });
    expect(buildHelixAskVoiceTimelineBuildInfoEvent({
      buildInfo: {
        clientBuild: "client dev",
        clientMode: "prod",
        serverService: null,
        serverVersion: null,
        serverGitSha: null,
        serverBuildTime: null,
        fetchedAtMs: null,
        error: "version_unavailable",
      },
      atMs: 2_000,
    })).toMatchObject({
      id: "build:client-dev-unknown-nogit",
      status: "error",
      text: "client:client dev | server:unknown",
      detail: "client_mode:prod | error:version_unavailable",
    });
  });

  it("defines the ordered recrown phases and minimal runtime shell contract", () => {
    expect(HELIX_ASK_CONSOLE_RECROWN_PHASES).toEqual([
      "stabilize_legacy_bridge",
      "extract_display_owners",
      "quarantine_behavior_sensitive_paths",
      "build_minimal_runtime_shell",
      "replace_legacy_bridge_after_parity",
      "retire_legacy_pill_after_proof",
    ]);
    expect(HELIX_ASK_CONSOLE_ACTIVE_RECROWN_PHASE).toBe("build_minimal_runtime_shell");
    expect(HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_OWNS).toEqual(
      HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS,
    );
    expect(HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP).toEqual([
      "backend_terminal_authority",
      "model_or_tool_execution",
      "private_retry_loop",
      "private_agent_runtime",
      "final_prose_tool_observation_scraping",
      "duplicated_backend_route_authority",
    ]);
    expect(HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_READY).toBe(false);
    expect(HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES).toEqual([
      "desktop_entrypoints_route_to_console_crown",
      "legacy_bridge_is_named_and_quarantined",
      "runtime_shell_owns_safe_layout_defaults",
      "active_docs_context_has_pure_snapshot_helper",
      "request_envelope_has_pure_builder",
      "latest_turn_binding_has_pure_selector",
      "latest_copy_debug_read_aloud_has_pure_control_target",
      "final_answer_projection_has_pure_helper",
      "long_final_answer_has_unclipped_display_contract",
      "workstation_trace_rows_have_structured_projection",
      "workstation_no_observation_keeps_typed_failure",
      "workstation_calculator_gateway_trace_parity",
      "provider_model_metadata_has_pure_projection",
      "chat_projection_has_pure_hydration_helper",
      "chat_persistence_has_pure_payload_helper",
      "minimal_runtime_shell_surface_scaffold_exists",
      "minimal_runtime_shell_builds_submit_plan",
      "minimal_runtime_shell_starts_optimistic_turn",
      "minimal_runtime_shell_has_injected_transport_seam",
      "minimal_runtime_shell_completes_injected_turn",
      "minimal_runtime_shell_has_backend_runner_adapter",
      "minimal_runtime_shell_records_stream_events",
      "minimal_runtime_shell_renders_local_turns",
      "minimal_runtime_shell_renders_workstation_trace_rows",
      "minimal_runtime_shell_binds_latest_controls",
      "minimal_runtime_shell_materializes_backend_debug_export",
      "runtime_shell_can_select_minimal_runtime_without_legacy_pill",
      "minimal_shell_submits_and_streams_without_legacy_pill",
      "minimal_shell_preserves_active_docs_context_handoff_live",
      "minimal_runtime_shell_component_submits_injected_turn",
      "minimal_runtime_shell_persists_and_hydrates_chat_sessions",
    ]);
    expect(HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES).toEqual([
      "operator_surface_live_parity_validation",
    ]);
    expect(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS).toEqual([
      "prompt_composer_surface",
      "runtime_picker",
      "goal_pill",
      "steering_queue",
      "attachment_context_strip",
      "context_source_panels",
      "observer_panels",
      "debug_drawer",
      "copy_debug_read_aloud_controls",
      "voice_read_aloud_affordances",
      "voice_confirmation_qte",
      "workflow_next_prompt_qte",
      "visible_stream_progress_status_rows",
      "final_answer_metadata",
      "workstation_trace_rows",
      "layout_position_sizing_dock_behavior",
      "top_of_console_readable",
      "long_answer_unclipped",
    ]);
    expect(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_READY).toBe(false);
    expect(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS).toEqual([
      "prompt_composer_surface",
      "runtime_picker",
      "goal_pill",
      "steering_queue",
      "attachment_context_strip",
      "context_source_panels",
      "observer_panels",
      "debug_drawer",
      "copy_debug_read_aloud_controls",
      "final_answer_metadata",
      "workstation_trace_rows",
      "visible_stream_progress_status_rows",
      "voice_read_aloud_affordances",
      "voice_confirmation_qte",
      "workflow_next_prompt_qte",
      "long_answer_unclipped",
    ]);
    expect(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS).toEqual([
      "layout_position_sizing_dock_behavior",
      "top_of_console_readable",
    ]);
    expect(HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST.map((item) => item.key)).toEqual(
      HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS,
    );
    expect(new Set(selectHelixAskOperatorSurfaceParityChecklistByStatus("proven").map((item) => item.key))).toEqual(
      new Set(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS),
    );
    expect(new Set(selectHelixAskOperatorSurfaceParityChecklistByStatus("open").map((item) => item.key))).toEqual(
      new Set(HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS),
    );
    expect(buildHelixAskOperatorSurfaceParityChecklistSummary()).toEqual({
      totalCount: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS.length,
      provenCount: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS.length,
      openCount: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS.length,
      ready: false,
      openKeys: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
    });
    expect(
      HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST
        .filter((item) => item.status === "open")
        .every((item) => item.validationKind === "browser_visual_parity"),
    ).toBe(true);
    expect(selectHelixAskOperatorSurfaceParityLayoutOpenKeys()).toEqual(
      HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
    );
    expect(HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA.map((criterion) => criterion.key)).toEqual(
      HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
    );
    expect(buildHelixAskOperatorSurfaceLayoutParitySummary()).toMatchObject({
      criteriaCount: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS.length,
      ready: false,
      openKeys: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
    });
    expect(resolveHelixAskOperatorSurfaceLayoutParityReadiness({
      oldBridgeScreenshotRef: "artifacts/ask-console/bridge-desktop.png",
      recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-desktop.png",
      desktopTopOffsetPx: 16,
      mobileTopOffsetPx: 12,
      dockReplyListScrolls: true,
      composerFullyVisible: true,
      completedTurnLaneVisible: true,
    })).toMatchObject({
      ready: true,
      openKeys: [],
      missingEvidence: {},
    });
    expect(resolveHelixAskOperatorSurfaceLayoutParityViewportKind({ width: 390, height: 844 })).toBe("mobile");
    expect(resolveHelixAskOperatorSurfaceLayoutParityViewportKind({ width: 1280, height: 720 })).toBe("desktop");
    expect(resolveHelixAskOperatorSurfaceLayoutParityViewportKind({ width: 0, height: 720 })).toBe("unknown");
    expect(buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000000,
      viewportWidth: 1280,
      viewportHeight: 720,
      evidence: {
        oldBridgeScreenshotRef: "artifacts/ask-console/bridge-desktop.png",
        recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-desktop.png",
        desktopTopOffsetPx: 16,
        mobileTopOffsetPx: 12,
        dockReplyListScrolls: true,
        composerFullyVisible: true,
        completedTurnLaneVisible: true,
      },
    })).toMatchObject({
      schema: "helix.ask.operator_surface.layout_parity.browser_record.v1",
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000000,
      viewport: {
        width: 1280,
        height: 720,
        kind: "desktop",
      },
      readiness: {
        ready: true,
        openKeys: [],
        missingEvidence: {},
      },
    });
    const measuredEvidence = buildHelixAskOperatorSurfaceLayoutParityEvidenceFromMeasurements({
      oldBridgeScreenshotRef: "artifacts/ask-console/bridge-measured.png",
      recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-measured.png",
      desktop: {
        viewportWidth: 1280,
        viewportHeight: 720,
        legacySurfaceRect: { top: 16, bottom: 704, height: 688 },
        recrownedSurfaceRect: { top: 16, bottom: 704, height: 688 },
        recrownedComposerRect: { top: 24, bottom: 104, height: 80 },
        recrownedCompletedTurnLaneRect: { top: 112, bottom: 690, height: 578 },
        recrownedReplyListScrollMetrics: { clientHeight: 578, scrollHeight: 1200 },
      },
      mobile: {
        viewportWidth: 390,
        viewportHeight: 844,
        legacySurfaceRect: { top: 12, bottom: 832, height: 820 },
        recrownedSurfaceRect: { top: 12, bottom: 832, height: 820 },
        recrownedComposerRect: { top: 20, bottom: 112, height: 92 },
        recrownedCompletedTurnLaneRect: { top: 120, bottom: 828, height: 708 },
        recrownedReplyListScrollMetrics: { clientHeight: 708, scrollHeight: 1600 },
      },
    });
    expect(measuredEvidence).toEqual({
      oldBridgeScreenshotRef: "artifacts/ask-console/bridge-measured.png",
      recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-measured.png",
      desktopTopOffsetPx: 16,
      mobileTopOffsetPx: 12,
      dockReplyListScrolls: true,
      composerFullyVisible: true,
      completedTurnLaneVisible: true,
    });
    expect(resolveHelixAskOperatorSurfaceLayoutParityReadiness(measuredEvidence)).toMatchObject({
      ready: true,
      openKeys: [],
      missingEvidence: {},
    });
    const fakeElement = (rect: { top: number; bottom: number; height: number }, scroll?: {
      clientHeight: number;
      scrollHeight: number;
    }) => ({
      getBoundingClientRect: () => rect,
      clientHeight: scroll?.clientHeight ?? rect.height,
      scrollHeight: scroll?.scrollHeight ?? rect.height,
    } as unknown as Element);
    const fakeDocument = {
      querySelector: (selector: string) =>
        ({
          [HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS.legacySurface]: fakeElement({
            top: 18,
            bottom: 708,
            height: 690,
          }),
          [HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS.recrownedSurface]: fakeElement({
            top: 18,
            bottom: 708,
            height: 690,
          }),
          [HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS.recrownedComposer]: fakeElement({
            top: 28,
            bottom: 104,
            height: 76,
          }),
          [HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS.recrownedCompletedTurnLane]: fakeElement({
            top: 112,
            bottom: 694,
            height: 582,
          }),
          [HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS.recrownedReplyList]: fakeElement(
            { top: 112, bottom: 694, height: 582 },
            { clientHeight: 582, scrollHeight: 1400 },
          ),
        }[selector] ?? null),
    };
    expect(captureHelixAskOperatorSurfaceViewportMeasurement({
      document: fakeDocument,
      viewportWidth: 1280,
      viewportHeight: 720,
    })).toMatchObject({
      viewportWidth: 1280,
      viewportHeight: 720,
      legacySurfaceRect: {
        top: 18,
        bottom: 708,
        height: 690,
      },
      recrownedReplyListScrollMetrics: {
        clientHeight: 582,
        scrollHeight: 1400,
      },
    });
    expect(captureHelixAskOperatorSurfaceBrowserRecord({
      document: fakeDocument,
      viewportWidth: 1280,
      viewportHeight: 720,
      capturedAtMs: 1783030000001,
      oldBridgeScreenshotRef: "artifacts/ask-console/bridge-captured.png",
      recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-captured.png",
    })).toMatchObject({
      status: "captured",
      record: {
        schema: "helix.ask.operator_surface.layout_parity.browser_record.v1",
        capturedAtMs: 1783030000001,
        viewport: {
          width: 1280,
          height: 720,
          kind: "desktop",
        },
        evidence: {
          oldBridgeScreenshotRef: "artifacts/ask-console/bridge-captured.png",
          recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-captured.png",
          desktopTopOffsetPx: 18,
          dockReplyListScrolls: true,
          composerFullyVisible: true,
          completedTurnLaneVisible: true,
        },
      },
      missingSelectors: [],
    });
    expect(captureHelixAskOperatorSurfaceBrowserRecord({
      document: { querySelector: () => null },
      viewportWidth: 1280,
      viewportHeight: 720,
      capturedAtMs: 1783030000002,
    })).toMatchObject({
      status: "missing_selectors",
      record: null,
      missingSelectors: Object.values(HELIX_ASK_OPERATOR_SURFACE_BROWSER_CAPTURE_SELECTORS),
    });
    const desktopRecord = buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000003,
      viewportWidth: 1280,
      viewportHeight: 720,
      evidence: {
        oldBridgeScreenshotRef: "artifacts/ask-console/bridge-desktop.png",
        recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-desktop.png",
        desktopTopOffsetPx: 18,
        dockReplyListScrolls: true,
        composerFullyVisible: true,
        completedTurnLaneVisible: true,
      },
    });
    const mobileRecord = buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000004,
      viewportWidth: 390,
      viewportHeight: 844,
      evidence: {
        oldBridgeScreenshotRef: "artifacts/ask-console/bridge-mobile.png",
        recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-mobile.png",
        mobileTopOffsetPx: 12,
        dockReplyListScrolls: true,
        composerFullyVisible: true,
        completedTurnLaneVisible: true,
      },
    });
    const mergedEvidence = mergeHelixAskOperatorSurfaceLayoutParityEvidence([desktopRecord, mobileRecord]);
    expect(mergedEvidence).toEqual({
      oldBridgeScreenshotRef: "artifacts/ask-console/bridge-desktop.png",
      recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-desktop.png",
      desktopTopOffsetPx: 18,
      mobileTopOffsetPx: 12,
      dockReplyListScrolls: true,
      composerFullyVisible: true,
      completedTurnLaneVisible: true,
    });
    expect(resolveHelixAskOperatorSurfaceLayoutParityReadiness(mergedEvidence)).toMatchObject({
      ready: true,
      openKeys: [],
      missingEvidence: {},
    });
    expect(buildHelixAskOperatorSurfaceLayoutParityEvidencePacket([desktopRecord])).toMatchObject({
      schema: "helix.ask.operator_surface.layout_parity.evidence_packet.v1",
      desktopRecordCount: 1,
      mobileRecordCount: 0,
      missingViewportKinds: ["mobile"],
      ready: false,
    });
    expect(buildHelixAskOperatorSurfaceLayoutParityEvidencePacket([desktopRecord, mobileRecord])).toMatchObject({
      schema: "helix.ask.operator_surface.layout_parity.evidence_packet.v1",
      desktopRecordCount: 1,
      mobileRecordCount: 1,
      missingViewportKinds: [],
      ready: true,
      readiness: {
        ready: true,
        openKeys: [],
        missingEvidence: {},
      },
    });
    const updatedDesktopRecord = buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000005,
      viewportWidth: 1440,
      viewportHeight: 900,
      evidence: {
        oldBridgeScreenshotRef: "artifacts/ask-console/bridge-desktop-updated.png",
        recrownedShellScreenshotRef: "artifacts/ask-console/recrowned-desktop-updated.png",
        desktopTopOffsetPx: 22,
        dockReplyListScrolls: true,
        composerFullyVisible: true,
        completedTurnLaneVisible: true,
      },
    });
    const upsertedRecords = upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord(
      [desktopRecord, mobileRecord],
      updatedDesktopRecord,
    );
    expect(upsertedRecords.map((record) => record.capturedAtMs)).toEqual([1783030000005, 1783030000004]);
    const unknownRecord = buildHelixAskOperatorSurfaceLayoutParityBrowserRecord({
      route: "?helixAskParity=operator_surface",
      capturedAtMs: 1783030000006,
      viewportWidth: 0,
      viewportHeight: 0,
    });
    expect(upsertHelixAskOperatorSurfaceLayoutParityBrowserRecord(upsertedRecords, unknownRecord)).toBe(
      upsertedRecords,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS.map((entry) => entry.classification)).toEqual([
      "used_must_move",
      "used_must_move",
      "used_temporary_adapter",
      "unknown_quarantined",
      "conflicting_remove_after_golden_path_proof",
    ]);
  });

  it("tracks the live legacy console slicing inventory before bridge replacement", () => {
    const legacyPillSource = read("client/src/components/helix/HelixAskPill.tsx");
    const legacySurfaceContentSource = read("client/src/components/helix/ask-console/HelixAskLegacySurfaceContent.tsx");
    const legacyPillLines = legacyPillSource.trimEnd().split(/\r?\n/);
    const exportedComponentLine =
      legacyPillLines.findIndex((line) => line.includes("export function HelixAskPill")) + 1;
    const activeRenderLine =
      legacyPillLines.findIndex((line) => line.includes("<HelixAskLegacyConsoleView")) + 1;
    const legacyConsoleViewLine =
      legacyPillLines.findIndex((line) => line.includes("<HelixAskLegacyConsoleView")) + 1;

    expect(HELIX_ASK_LEGACY_CONSOLE_ACTIVE_PATH).toEqual([
      "HelixAskConsole",
      "HelixAskConsoleRuntimeShell",
      "HelixAskLegacyRuntimeBridge",
      "HelixAskPill",
    ]);
    expect(HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT).toMatchObject({
      file: "client/src/components/helix/HelixAskPill.tsx",
      exportedComponentStartsAtLine: exportedComponentLine,
      liveRenderSliceStartsAtLine: activeRenderLine,
      liveLegacyConsoleViewStartsAtLine: legacyConsoleViewLine,
    });
    expect(Math.abs(HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT.lineCountAtInventory - legacyPillLines.length)).toBeLessThanOrEqual(5);
    expect(HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT.lineCountAtInventory).toBeGreaterThan(23000);
    expect(HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT.exportedComponentStartsAtLine).toBeGreaterThan(6300);
    expect(HELIX_ASK_LEGACY_CONSOLE_SOURCE_SNAPSHOT.liveRenderSliceStartsAtLine).toBeGreaterThan(23000);
    const sliceClassifications = HELIX_ASK_LEGACY_CONSOLE_SLICES.map((slice) => slice.classification);
    expect(sliceClassifications[0]).toBe("live_day_to_day_must_move");
    expect(new Set(sliceClassifications)).toEqual(
      new Set([
        "live_day_to_day_must_move",
        "pure_display_already_recrowned",
        "behavior_sensitive_recrowned_with_parity",
        "behavior_sensitive_quarantined",
      ]),
    );
    expect(HELIX_ASK_LEGACY_CONSOLE_SLICES.find((slice) => slice.key === "legacy_attached_context_chooser_retired")).toMatchObject({
      classification: "behavior_sensitive_quarantined",
      source: "HelixAskPill.tsx",
    });
    expect(HELIX_ASK_LEGACY_CONSOLE_SLICE_PROGRESS).toMatchObject({
      activeDefaultImplementation: "legacy_bridge",
      replacementTarget: "legacy_equivalent_recrowned_runtime",
      simplifiedMinimalShellIsDefault: false,
      bridgeReplacementReady: false,
      liveDayToDaySliceCount: 1,
      pureDisplayRecrownedSliceCount: 86,
      behaviorSensitiveRecrownedWithParitySliceCount: 69,
      behaviorSensitiveQuarantinedSliceCount: 10,
      unknownTrapDoorSliceCount: 0,
    });
    expect(legacyPillSource).toContain("<HelixAskLegacyConsoleView");
    expect(legacyPillSource).toContain("const legacyConsoleRootState = buildHelixAskLegacyConsoleRootState({");
    expect(legacyPillSource).toContain("const legacyConsoleViewState = buildHelixAskLegacyConsoleViewState({");
    expect(legacyPillSource).toContain("...legacyConsoleRootState");
    expect(legacyPillSource).toContain("{...legacyConsoleViewState}");
    expect(legacyPillSource).not.toContain("surfaceFrameState={surfaceFrameState}");
    expect(legacyPillSource).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(legacyPillSource).toContain("surfaceContentState,");
    expect(legacyPillSource).not.toContain("surfaceContentState={surfaceContentState}");
    expect(legacyPillSource).not.toContain("surfaceContentState={{");
    expect(legacyPillSource).toContain("composer: composerState");
    expect(legacyPillSource).not.toContain("<HelixAskLegacyComposerSurface");
    expect(legacyPillSource).not.toContain("<HelixAskSurfaceComposerPanel");
    expect(legacyPillSource).toContain("supplement: supplementState");
    expect(legacyPillSource).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPillSource).not.toContain("<HelixAskConsoleSupplementSurface");
    expect(legacyPillSource).not.toContain("<HelixAskReasoningTheaterSurface");
    expect(legacySurfaceContentSource).toContain("<HelixAskLegacyComposerSurface {...composer} />");
    expect(legacySurfaceContentSource).toContain("<HelixAskConsoleSupplementSurface {...supplement} />");
    expect(legacySurfaceContentSource).toContain("<HelixAskReasoningTheaterSurface {...reasoningTheater} />");
    expect(legacyPillSource).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPillSource).toContain("const completedReplyState = buildHelixAskLegacyCompletedReplyState({");
    expect(legacyPillSource).toContain("turn: buildHelixAskReplyTurnState({");
    expect(legacyPillSource).toContain("{...completedReplyState}");
    expect(legacyPillSource).not.toContain("<HelixAskCompletedReplyTurnSurface");
    expect(legacyPillSource).toContain("debugDrawerState={debugExportDrawer}");
    expect(legacyPillSource).not.toContain("<HelixAskDebugDrawerSurface");
  });

  it("recrowns reply-event chronological ordering without moving stream ownership", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const helper = read("client/src/components/helix/ask-console/HelixAskLegacyReplyEventOrder.ts");
    expect(
      sortHelixAskLegacyReplyEventsChronologically(
        [
          { id: "id-c", seq: 3, ts: 30 },
          { id: "id-a", seq: 2, ts: 10 },
        ],
        (event) => event.ts,
      ),
    ).toEqual([
      { id: "id-a", seq: 2, ts: 10 },
      { id: "id-c", seq: 3, ts: 30 },
    ]);
    expect(
      sortHelixAskLegacyReplyEventsChronologically(
        [
          { id: "id-z", seq: 2, ts: null },
          { id: "id-a", seq: 2, ts: null },
          { id: "id-m", seq: 1, ts: null },
        ],
        (event) => event.ts,
      ),
    ).toEqual([
      { id: "id-m", seq: 1, ts: null },
      { id: "id-a", seq: 2, ts: null },
      { id: "id-z", seq: 2, ts: null },
    ]);
    expect(legacyPill).toContain("sortHelixAskLegacyReplyEventsChronologically(");
    expect(legacyPill).not.toContain("const replyEventsChronological = [...replyEvents].sort");
    expect(helper).toContain("export function sortHelixAskLegacyReplyEventsChronologically");
    expect(helper).not.toContain("resolveAskLiveEventTimestampMs");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("runAskTurn");
  });

  it("recrowns reply fail-context reading without moving debug export ownership", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const helper = read("client/src/components/helix/ask-console/HelixAskLegacyReplyDebugContext.ts");

    expect(
      resolveHelixAskLegacyReplyFailContext({
        helix_ask_fail_reason: "canonical reason",
        fail_reason: "fallback reason",
        helix_ask_fail_class: "canonical class",
        fail_class: "fallback class",
      }),
    ).toEqual({
      failReason: "canonical reason",
      failClass: "canonical class",
    });
    expect(
      resolveHelixAskLegacyReplyFailContext({
        fail_reason: "fallback reason",
        fail_class: "fallback class",
      }),
    ).toEqual({
      failReason: "fallback reason",
      failClass: "fallback class",
    });
    expect(resolveHelixAskLegacyReplyFailContext(undefined)).toEqual({
      failReason: null,
      failClass: null,
    });
    expect(legacyPill).toContain("resolveHelixAskLegacyReplyFailContext(reply.debug)");
    expect(legacyPill).not.toContain("typeof reply.debug?.helix_ask_fail_reason");
    expect(helper).toContain("export function resolveHelixAskLegacyReplyFailContext");
    expect(helper).not.toContain("buildHelixAskDebugContextSummary");
    expect(helper).not.toContain("copyDebugPayloadToClipboard");
    expect(helper).not.toContain("fetch(");
  });

  it("recrowns observer lane event projection without moving timeline state", () => {
    const events = buildHelixAskObserverLaneEvents({
      askBusy: true,
      askLiveTraceId: "trace-active",
      helixTimeline: [
        {
          id: "old-trace",
          type: "conversation_brief",
          status: "completed",
          text: "Do not show old trace",
          createdAtMs: 1,
          updatedAtMs: 1,
          traceId: "trace-old",
        },
        {
          id: "parent-trace",
          type: "suppressed",
          status: "completed",
          text: "Suppressed by parent trace",
          createdAtMs: 2,
          updatedAtMs: 4,
          traceId: "trace-child",
          meta: { parent_trace_id: "trace-active" },
        },
        {
          id: "commentary-a",
          type: "action_receipt",
          status: "completed",
          detail: "observer_lane_commentary",
          text: "Observer commentary repeated",
          createdAtMs: 3,
          updatedAtMs: 5,
          traceId: "trace-active",
        },
        {
          id: "commentary-b",
          type: "action_receipt",
          status: "completed",
          detail: "observer_lane_commentary",
          text: "Observer commentary repeated",
          createdAtMs: 4,
          updatedAtMs: 6,
          traceId: "trace-active",
        },
        {
          id: "plain-action",
          type: "action_receipt",
          status: "completed",
          detail: "ordinary action",
          text: "Not observer commentary",
          createdAtMs: 5,
          updatedAtMs: 7,
          traceId: "trace-active",
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "observer:commentary-b",
        text: "Observer commentary repeated",
        tsMs: 6,
        traceId: "trace-active",
      },
      {
        id: "observer:parent-trace",
        text: "Suppressed by parent trace",
        tsMs: 4,
        traceId: "trace-child",
      },
    ]);
    expect(buildHelixAskObserverLaneEvents({
      askBusy: false,
      helixTimeline: [
        {
          id: "hidden",
          type: "conversation_brief",
          text: "hidden",
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
    })).toEqual([]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const owner = read("client/src/components/helix/ask-console/HelixAskObserverLaneEvents.ts");
    expect(legacyPill).toContain("buildHelixAskObserverLaneEvents({");
    expect(legacyPill).not.toContain("return [...helixTimeline]\n      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)");
    expect(owner).toContain("export function buildHelixAskObserverLaneEvents");
    expect(owner).toContain("observer_lane_commentary");
    expect(owner).not.toMatch(/from [\"']react[\"']/);
    expect(owner).not.toContain("@/store/");
    expect(owner).not.toContain("useState");
    expect(owner).not.toContain("fetch(");
  });

  it("recrowns timeline feed sorting and active-trace filtering without moving timeline state", () => {
    const helixTimeline = [
      {
        id: "completed-new",
        status: "completed",
        createdAtMs: 10,
        traceId: "trace-old",
      },
      {
        id: "queued-old",
        status: "queued",
        createdAtMs: 1,
        traceId: "trace-active",
      },
      {
        id: "running-new",
        status: "running",
        createdAtMs: 20,
        traceId: "trace-active",
      },
      {
        id: "completed-parent",
        status: "completed",
        createdAtMs: 4,
        traceId: "trace-child",
        meta: { parent_trace_id: "trace-active" },
      },
    ];

    const feed = buildHelixAskTimelineFeed(helixTimeline);
    expect(feed.map((entry) => entry.id)).toEqual([
      "running-new",
      "queued-old",
      "completed-new",
      "completed-parent",
    ]);
    expect(buildHelixAskActiveTimelineFeed({
      askBusy: true,
      askLiveTraceId: "",
      helixTimelineFeed: feed,
    }).map((entry) => entry.id)).toEqual(["running-new", "queued-old"]);
    expect(buildHelixAskActiveTimelineFeed({
      askBusy: true,
      askLiveTraceId: "trace-active",
      helixTimelineFeed: feed,
    }).map((entry) => entry.id)).toEqual(["running-new", "queued-old", "completed-parent"]);
    expect(buildHelixAskActiveTimelineFeed({
      askBusy: false,
      askLiveTraceId: "trace-active",
      helixTimelineFeed: feed,
    })).toEqual([]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const owner = read("client/src/components/helix/ask-console/HelixAskTimelineFeed.ts");
    expect(legacyPill).toContain("buildHelixAskTimelineFeed(helixTimeline)");
    expect(legacyPill).toContain("buildHelixAskActiveTimelineFeed({");
    expect(legacyPill).not.toContain("const aActive = a.status === \"queued\" || a.status === \"running\" || a.status === \"streaming\"");
    expect(owner).toContain("export function buildHelixAskTimelineFeed");
    expect(owner).toContain("export function buildHelixAskActiveTimelineFeed");
    expect(owner).not.toMatch(/from [\"']react[\"']/);
    expect(owner).not.toContain("@/store/");
    expect(owner).not.toContain("useState");
    expect(owner).not.toContain("fetch(");
  });

  it("recrowns legacy final-text selection without moving terminal authority", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const helper = read("client/src/components/helix/ask-console/HelixAskLegacyFinalTextSelection.ts");
    const isInvalid = (value: string) => value === "invalid placeholder";

    expect(
      selectHelixAskLegacyFinalAnswerText({
        turnTranscriptRows: [
          { label: "Final", text: "invalid placeholder" },
          { label: "Final", text: "Transcript terminal answer" },
        ],
        chosenVisibleFinalText: "Cause: synthesis_unavailable",
        primaryTerminalLabel: "final_answer",
        primarySourceLabel: "provider_terminal",
        isInvalidTerminalAnswerText: isInvalid,
      }),
    ).toEqual({
      finalAnswerRawText: "Transcript terminal answer",
      transcriptFinalRowText: "Transcript terminal answer",
      usedTranscriptFinalRow: true,
    });
    expect(
      selectHelixAskLegacyFinalAnswerText({
        turnTranscriptRows: [{ label: "Final", text: "Transcript failure answer" }],
        chosenVisibleFinalText: "Visible fallback",
        primaryTerminalLabel: "final_failure",
        primarySourceLabel: "provider_terminal",
        isInvalidTerminalAnswerText: isInvalid,
      }).finalAnswerRawText,
    ).toBe("Transcript failure answer");
    expect(
      selectHelixAskLegacyFinalAnswerText({
        turnTranscriptRows: [{ label: "Final", text: "Transcript answer" }],
        chosenVisibleFinalText: "Visible terminal answer",
        primaryTerminalLabel: "final_answer",
        primarySourceLabel: "provider_terminal",
        isInvalidTerminalAnswerText: isInvalid,
      }),
    ).toEqual({
      finalAnswerRawText: "Visible terminal answer",
      transcriptFinalRowText: "Transcript answer",
      usedTranscriptFinalRow: false,
    });
    expect(
      selectHelixAskLegacyFinalAnswerText({
        turnTranscriptRows: [{ label: "Final", text: "Discarded provider failure" }],
        chosenVisibleFinalText: "Authoritative typed failure",
        backendTerminalText: "Authoritative typed failure",
        primaryTerminalLabel: "final_failure",
        primarySourceLabel: "typed_failure",
        isInvalidTerminalAnswerText: isInvalid,
      }),
    ).toEqual({
      finalAnswerRawText: "Authoritative typed failure",
      transcriptFinalRowText: "Discarded provider failure",
      usedTranscriptFinalRow: false,
    });
    expect(legacyPill).toContain("selectHelixAskLegacyFinalAnswerText({");
    expect(legacyPill).not.toContain("chosenVisibleFinalIsTypedFailureBoundary");
    expect(helper).toContain("export function selectHelixAskLegacyFinalAnswerText");
    expect(helper).toContain("export function hasHelixAskLegacyTerminalMismatch");
    expect(helper).toContain("export function resolveHelixAskLegacyFinalSourceLabel");
    expect(helper).not.toContain("resolveHelixAskVisibleTerminal");
    expect(helper).not.toContain("runAskTurn");
    expect(helper).not.toContain("fetch(");
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    expect(
      hasHelixAskLegacyTerminalMismatch({
        backendTerminalText: "Backend answer",
        visibleTerminalText: "Backend   answer",
        normalizeTerminalAnswerText: normalize,
      }),
    ).toBe(false);
    expect(
      hasHelixAskLegacyTerminalMismatch({
        backendTerminalText: "Backend answer",
        visibleTerminalText: "Visible answer",
        normalizeTerminalAnswerText: normalize,
      }),
    ).toBe(true);
    expect(
      hasHelixAskLegacyTerminalMismatch({
        backendTerminalText: null,
        visibleTerminalText: "Visible answer",
        normalizeTerminalAnswerText: normalize,
      }),
    ).toBe(false);
    expect(legacyPill).toContain("hasHelixAskLegacyTerminalMismatch({");
    expect(legacyPill).not.toContain("normalizeTerminalAnswerText(transcriptTerminal.backendTerminalText) !==");
    expect(resolveHelixAskLegacyFinalSourceLabel({
      presentationSourceLabel: "presentation",
      finalAnswerSourceLabel: "final",
      transcriptTerminalSource: "transcript",
    })).toBe("presentation");
    expect(resolveHelixAskLegacyFinalSourceLabel({
      presentationSourceLabel: null,
      finalAnswerSourceLabel: "final",
      transcriptTerminalSource: "transcript",
    })).toBe("final");
    expect(resolveHelixAskLegacyFinalSourceLabel({
      presentationSourceLabel: null,
      finalAnswerSourceLabel: null,
      transcriptTerminalSource: "transcript",
    })).toBe("transcript");
    expect(resolveHelixAskLegacyFinalSourceLabel({
      presentationSourceLabel: null,
      finalAnswerSourceLabel: null,
      transcriptTerminalSource: null,
    })).toBeNull();
    expect(legacyPill).toContain("displayedFinalAnswerSourceLabel");
    expect(legacyPill).not.toContain("finalAnswerPresentation.sourceLabel || finalAnswerSourceLabel || transcriptTerminal.source");
  });

  it("routes active desktop and workstation entrypoints through the new console crown", () => {
    const entrypoints = [
      "client/src/components/workstation/HelixAskDock.tsx",
      "client/src/components/workstation/mobile/MobileHelixAskDrawer.tsx",
      "client/src/pages/desktop.tsx",
      "client/src/pages/mobile-start.tsx",
    ];

    for (const entrypoint of entrypoints) {
      const source = read(entrypoint);
      expect(source).toContain("@/components/helix/ask-console");
      expect(source).not.toContain("@/components/helix/HelixAskPill");
    }
  });

  it("quarantines the remaining legacy behavior behind a named bridge", () => {
    const consoleSource = read("client/src/components/helix/ask-console/HelixAskConsole.tsx");
    const runtimeShellSource = read("client/src/components/helix/ask-console/HelixAskConsoleRuntimeShell.tsx");
    const bridgeSource = read("client/src/components/helix/ask-console/HelixAskLegacyRuntimeBridge.tsx");

    expect(consoleSource).toContain("HelixAskConsoleRuntimeShell");
    expect(consoleSource).not.toContain("@/components/helix/HelixAskPill");
    expect(consoleSource).not.toContain("HelixAskLegacyRuntimeBridge");
    expect(runtimeShellSource).toContain("HelixAskLegacyRuntimeBridge");
    expect(runtimeShellSource).not.toContain("@/components/helix/HelixAskPill");
    expect(bridgeSource).toContain("@/components/helix/HelixAskPill");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS).toMatchObject({
      activeImplementation: "legacy_bridge",
      bridge: "helix_ask_pill_legacy_runtime_bridge",
      activePhase: "build_minimal_runtime_shell",
      reason: "operator_surface_parity_not_live_proven",
      runtimeShell: "helix_ask_console_runtime_shell",
      replacementTarget: "legacy_pill_retirement_after_proof",
    });
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toBe(
      HELIX_ASK_CONSOLE_RECROWNED_DISPLAY_OWNERS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedPureHelperRequirements).toBe(
      HELIX_ASK_CONSOLE_RECROWNED_PURE_HELPER_REQUIREMENTS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.minimalRuntimeShellOwns).toBe(
      HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_OWNS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.minimalRuntimeShellForbiddenOwnership).toBe(
      HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.runtimeShellActiveOwnership).toBe(
      HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.remainingBehaviorSensitivePaths).toEqual(
      HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.bridgeReplacementReady).toBe(false);
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.bridgeReplacementProvenGates).toBe(
      HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.bridgeReplacementOpenGates).toBe(
      HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.bridgeReplacementProvenGates).toContain(
      "minimal_shell_submits_and_streams_without_legacy_pill",
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.bridgeReplacementOpenGates).toEqual([
      "operator_surface_live_parity_validation",
    ]);
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.operatorSurfaceParityReady).toBe(false);
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.operatorSurfaceParityOpenItems).toEqual(
      HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.legacyBehaviorClassifications).toBe(
      HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS,
    );
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("composer");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("runtime_layout");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("surface_composer_panel");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("surface_supplement_stack");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("busy_reasoning_panel");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("legacy_console_view");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedDisplayOwners).toContain("reasoning_battle_stage");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedPureHelperRequirements).toContain("request_envelope");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedPureHelperRequirements).toContain("latest_turn_selection");
    expect(HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS.recrownedPureHelperRequirements).toContain(
      "provider_model_metadata",
    );
    const ownershipMap = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");
    expect(ownershipMap).toContain("HelixAskConsoleState.ts");
    expect(ownershipMap).toContain("HelixAskConsoleRuntimeShell");
    expect(ownershipMap).toContain("runtimeShellActiveOwnership");
    expect(ownershipMap).toContain("HELIX_ASK_CONSOLE_RECROWN_PHASES");
    expect(ownershipMap).toContain("minimalRuntimeShellOwns");
    expect(ownershipMap).toContain("minimalRuntimeShellForbiddenOwnership");
    expect(ownershipMap).toContain("remainingBehaviorSensitivePaths");
    expect(ownershipMap).toContain("bridgeReplacementProvenGates");
    expect(ownershipMap).toContain("bridgeReplacementOpenGates");
    expect(ownershipMap).toContain("operatorSurfaceParityOpenItems");
    expect(ownershipMap).toContain("legacyBehaviorClassifications");
    expect(ownershipMap).toContain("defaults to the legacy bridge");
  });

  it("keeps the legacy-looking bridge as default until the minimal runtime shell has visual parity", () => {
    const consoleSource = read("client/src/components/helix/ask-console/HelixAskConsole.tsx");
    const runtimeShellSource = read("client/src/components/helix/ask-console/HelixAskConsoleRuntimeShell.tsx");
    const bridgeSource = read("client/src/components/helix/ask-console/HelixAskLegacyRuntimeBridge.tsx");
    const minimalShellSource = read("client/src/components/helix/ask-console/HelixAskMinimalRuntimeShell.tsx");
    const parityHarnessSource = read("client/src/components/helix/ask-console/HelixAskOperatorSurfaceParityHarness.tsx");
    const parityRouteSource = read("client/src/components/helix/ask-console/HelixAskOperatorSurfaceParityRoute.ts");

    expect(HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM).toBe("helixAskParity");
    expect(HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE).toBe("operator_surface");
    expect(shouldRenderHelixAskOperatorSurfaceParityHarness("")).toBe(false);
    expect(shouldRenderHelixAskOperatorSurfaceParityHarness("?helixAskParity=off")).toBe(false);
    expect(shouldRenderHelixAskOperatorSurfaceParityHarness("?helixAskParity=operator_surface")).toBe(true);
    expect(buildHelixAskOperatorSurfaceParityRouteHint()).toBe("?helixAskParity=operator_surface");
    const parityEvidenceMarkup = renderToStaticMarkup(
      React.createElement(HelixAskOperatorSurfaceParityEvidencePanel, {
        routeSearch: "?helixAskParity=operator_surface",
      }),
    );
    expect(parityEvidenceMarkup).toContain("data-testid=\"helix-ask-operator-surface-parity-evidence\"");
    expect(parityEvidenceMarkup).toContain("data-open-gate-count=\"2\"");
    expect(parityEvidenceMarkup).toContain("layout_position_sizing_dock_behavior");
    expect(parityEvidenceMarkup).toContain("top_of_console_readable");
    expect(parityEvidenceMarkup).toContain("data-active-parity-route=\"true\"");
    expect(parityEvidenceMarkup).toContain("data-testid=\"helix-ask-operator-surface-parity-record-schema\"");
    expect(parityEvidenceMarkup).toContain("helix.ask.operator_surface.layout_parity.browser_record.v1");
    expect(parityEvidenceMarkup).toContain("data-testid=\"helix-ask-operator-surface-parity-capture-status\"");
    expect(parityEvidenceMarkup).toContain("data-capture-status=\"waiting_for_browser_measurement\"");
    expect(parityEvidenceMarkup).toContain("data-record-ready=\"unknown\"");
    expect(parityEvidenceMarkup).toContain("data-viewport-kind=\"unknown\"");
    expect(parityEvidenceMarkup).toContain(
      "data-testid=\"helix-ask-operator-surface-parity-evidence-packet-status\"",
    );
    expect(parityEvidenceMarkup).toContain("data-packet-ready=\"false\"");
    expect(parityEvidenceMarkup).toContain("data-desktop-record-count=\"0\"");
    expect(parityEvidenceMarkup).toContain("data-mobile-record-count=\"0\"");
    expect(parityEvidenceMarkup).toContain("data-missing-viewport-kinds=\"desktop,mobile\"");
    expect(parityEvidenceMarkup).toContain("data-testid=\"helix-ask-operator-surface-parity-capture-record\"");
    expect(parityEvidenceMarkup).toContain(
      "data-record-schema=\"helix.ask.operator_surface.layout_parity.browser_record.v1\"",
    );
    expect(parityEvidenceMarkup).toContain("data-testid=\"helix-ask-operator-surface-parity-evidence-packet\"");
    expect(parityEvidenceMarkup).toContain(
      "data-packet-schema=\"helix.ask.operator_surface.layout_parity.evidence_packet.v1\"",
    );
    expect(consoleSource).toContain("shouldRenderHelixAskOperatorSurfaceParityHarness(search)");
    expect(consoleSource).toContain("const HelixAskOperatorSurfaceParityHarness = React.lazy");
    expect(consoleSource).toContain("<Suspense fallback={<HelixLoadingMark");
    expect(consoleSource).toContain("<HelixAskOperatorSurfaceParityHarness {...props} />");
    expect(consoleSource).toContain("return <HelixAskConsoleRuntimeShell {...props} />");
    expect(runtimeShellSource).toContain("buildHelixAskConsoleRuntimeBridgeProps(props)");
    expect(runtimeShellSource).toContain("runtimeImplementation = \"legacy_bridge\"");
    expect(runtimeShellSource).toContain("runtimeImplementation === \"minimal_runtime_shell\"");
    expect(runtimeShellSource).toContain("<HelixAskMinimalRuntimeShell");
    expect(runtimeShellSource).toContain("<HelixAskLegacyRuntimeBridge");
    expect(bridgeSource).toContain("return <HelixAskPill {...props} />");
    expect(runtimeShellSource).not.toContain("@/components/helix/HelixAskPill");
    expect(minimalShellSource).toContain("data-testid=\"helix-ask-minimal-runtime-shell\"");
    expect(minimalShellSource).toContain("HelixAskConsoleRuntimeLayout");
    expect(minimalShellSource).toContain("HelixAskDebugDrawer");
    expect(minimalShellSource).toContain("HelixAskRuntimePicker");
    expect(minimalShellSource).toContain("HelixAskRuntimeStatusLine");
    expect(minimalShellSource).toContain("HelixAskSurfaceSupplementStack");
    expect(minimalShellSource).toContain("goalPill={visibleSurface?.goalPill}");
    expect(minimalShellSource).toContain("steeringQueue={visibleSurface?.steeringQueue}");
    expect(minimalShellSource).toContain("HelixAskComposer");
    expect(minimalShellSource).toContain("buildHelixAskMinimalRuntimeSubmitPlan");
    expect(minimalShellSource).toContain("startHelixAskMinimalRuntimeTurn");
    expect(minimalShellSource).toContain("recordHelixAskMinimalRuntimeStreamEvent");
    expect(minimalShellSource).toContain("completeHelixAskMinimalRuntimeTurn");
    expect(minimalShellSource).toContain("failHelixAskMinimalRuntimeTurn");
    expect(minimalShellSource).toContain("buildHelixAskMinimalRuntimeTurnPayload");
    expect(minimalShellSource).toContain("runHelixAskMinimalRuntimeInjectedTransport");
    expect(minimalShellSource).toContain("onEvent: (event)");
    expect(minimalShellSource).toContain("runHelixAskMinimalRuntimeBackendTurn");
    expect(minimalShellSource).toContain("HelixAskMinimalRuntimeTurnList");
    expect(minimalShellSource).toContain("useAgiChatStore");
    expect(minimalShellSource).toContain("buildHelixAskMinimalRuntimeRepliesFromChatSession");
    expect(minimalShellSource).toContain("resolveHelixAskMinimalRuntimeAnswerText");
    expect(minimalShellSource).toContain("onSubmitPlan?.(submitPlan)");
    expect(minimalShellSource).not.toContain("HelixAskLegacyRuntimeBridge");
    expect(minimalShellSource).not.toContain("@/components/helix/HelixAskPill");
    expect(buildHelixAskOperatorSurfaceParityHarnessContextIds("ctx")).toEqual({
      legacyContextId: "ctx:legacy-parity",
      recrownedContextId: "ctx:recrowned-parity",
    });
    expect(parityHarnessSource).toContain("data-parity-harness=\"operator_surface\"");
    expect(parityHarnessSource).toContain("<HelixAskOperatorSurfaceParityEvidencePanel");
    expect(parityHarnessSource).toContain("runtimeImplementation=\"legacy_bridge\"");
    expect(parityHarnessSource).toContain("runtimeImplementation=\"minimal_runtime_shell\"");
    expect(parityHarnessSource).toContain("buildHelixAskOperatorSurfaceParityHarnessContextIds");
    expect(parityHarnessSource).not.toContain("@/components/helix/HelixAskPill");
    expect(parityRouteSource).toContain("HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM");
    expect(parityRouteSource).toContain("HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE");
    for (const forbidden of [
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speakVoice",
      "fetch(",
      "terminal_authority",
    ]) {
      expect(runtimeShellSource).not.toContain(forbidden);
    }
    for (const forbidden of [
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speakVoice",
      "fetch(",
      "terminal_authority",
    ]) {
      expect(minimalShellSource).not.toContain(forbidden);
    }
  });

  it("lets the runtime shell own safe layout defaults before bridge replacement", () => {
    expect(HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP).toEqual([
      "layout_variant_default",
      "reply_list_class_default",
    ]);
    expect(buildHelixAskConsoleRuntimeBridgeProps({
      contextId: "ctx",
    })).toMatchObject({
      contextId: "ctx",
      layoutVariant: "hero",
      replyListClassName: HELIX_ASK_CONSOLE_HERO_REPLY_LIST_CLASS_NAME,
    });
    expect(buildHelixAskConsoleRuntimeBridgeProps({
      contextId: "ctx",
      layoutVariant: "dock",
    })).toMatchObject({
      contextId: "ctx",
      layoutVariant: "dock",
      replyListClassName: HELIX_ASK_CONSOLE_DOCK_REPLY_LIST_CLASS_NAME,
    });
    expect(buildHelixAskConsoleRuntimeBridgeProps({
      contextId: "ctx",
      layoutVariant: "dock",
      replyListClassName: "custom-list",
      maxWidthClassName: undefined,
    })).toMatchObject({
      contextId: "ctx",
      layoutVariant: "dock",
      replyListClassName: "custom-list",
      maxWidthClassName: undefined,
    });
    const runtimeShellSource = read("client/src/components/helix/ask-console/HelixAskConsoleRuntimeShell.tsx");
    const runtimeShellPropsSource = read(
      "client/src/components/helix/ask-console/HelixAskConsoleRuntimeShellProps.ts",
    );
    expect(runtimeShellSource).toContain("buildHelixAskConsoleRuntimeBridgeProps");
    expect(runtimeShellSource).not.toContain("maxWidthClassName ??");
    expect(runtimeShellPropsSource).toContain("buildHelixAskConsoleRuntimeBridgeProps");
    for (const forbidden of [
      "HelixAskLegacyRuntimeBridge",
      "HelixAskPill",
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speakVoice",
      "useAgiChatStore",
      "fetch(",
      "terminal_authority",
    ]) {
      expect(runtimeShellPropsSource).not.toContain(forbidden);
    }
  });

  it("keeps active document handoff as a pure request-envelope helper", () => {
    const url =
      "http://127.0.0.1:1498/desktop?panels=docs-viewer%2Cscientific-calculator&focus=docs-viewer&doc=docs/research/nhm2-current-status-whitepaper.md";
    const context = buildHelixAskContextBridgeSnapshot(url);

    expect(readDocPathFromDesktopUrl(url)).toBe(
      "docs/research/nhm2-current-status-whitepaper.md",
    );
    expect(buildHelixAskConsoleRequestEnvelope({
      question: "Summarize the current whitepaper.",
      agentRuntime: "codex",
      context,
    })).toEqual({
      question: "Summarize the current whitepaper.",
      agentRuntime: "codex",
      agent_runtime: "codex",
      doc_path: "docs/research/nhm2-current-status-whitepaper.md",
    });
    expect(buildHelixAskConsoleContextFiles({
      docsViewerAnchorPath: "workspace://docs/research/nhm2-current-status-whitepaper.md",
      workspaceContextSnapshot: {
        activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
        active_doc_path: "docs/research/nhm2-current-status-whitepaper.md",
        docContextPath: "docs/other.md",
        doc_context_path: "docs/third.md",
      },
    })).toEqual([
      "docs/research/nhm2-current-status-whitepaper.md",
      "docs/other.md",
      "docs/third.md",
    ]);
  });

  it("recrowns queued Ask turn shaping without moving queue state", () => {
    expect(buildHelixAskQueuedTurn({
      question: "  hello  ",
      capsuleIds: ["cap-1"],
      reason: "busy",
      queuedAtMs: 123,
    })).toEqual({
      question: "hello",
      capsuleIds: ["cap-1"],
      options: undefined,
      queuedAtMs: 123,
      reason: "busy",
    });

    expect(buildHelixAskQueuedTurn({
      question: "Retry with context.",
      reason: "retry",
      queuedAtMs: 124,
      options: {
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "test",
        },
      },
      contextResumeFrame: { marker: "resume-frame" },
    }).options?.routeMetadata).toMatchObject({
      schema: "helix.ask.route_metadata.v1",
      source: "test",
      context_resume_frame: { marker: "resume-frame" },
    });

    const pastedTextQueue = buildHelixAskQueuedTurn({
      question: "What was the marker in the previous pasted text?",
      reason: "compaction_pause",
      queuedAtMs: 125,
      options: {
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "existing",
        },
      },
    });

    expect(pastedTextQueue).toMatchObject({
      question: "What was the marker in the previous pasted text?",
      queuedAtMs: 125,
      reason: "compaction_pause",
      options: {
        bypassWorkstationDispatch: true,
        forceReasoningDispatch: true,
        skipContextChooser: true,
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "conversation_memory_recall",
          sourceTarget: "conversation_memory",
          source_target_intent: {
            target_source: "conversation_memory",
            must_enter_backend_ask: true,
            allow_client_shortcut: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        },
      },
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const queuedTurnOwner = read("client/src/components/helix/ask-console/HelixAskQueuedTurn.ts");
    expect(legacyPill).toContain("buildHelixAskQueuedTurn<RunAskOptions>({");
    expect(legacyPill).toContain("queuedAtMs: Date.now()");
    expect(legacyPill).not.toContain("const backendOwnedPastedTextResumeRecall = isHelixAskPastedTextResumeRecallPrompt(question)");
    expect(queuedTurnOwner).toContain("export function buildHelixAskQueuedTurn");
    expect(queuedTurnOwner).toContain("isHelixAskPastedTextResumeRecallPrompt(question)");
    expect(queuedTurnOwner).toContain("buildHelixAskPastedTextResumeRecallRouteMetadata");
    expect(queuedTurnOwner).not.toContain("Date.now");
    expect(queuedTurnOwner).not.toContain("useState");
    expect(queuedTurnOwner).not.toContain("runAsk");
  });

  it("recrowns docs-viewer snapshot path source priority without moving UI reads", () => {
    resetHelixAskDocViewerSnapshotPathMemoryForTests();
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: "docs/store.md",
      debugSnapshotPath: "docs/debug.md",
      desktopUrlDocPath: "docs/url.md",
      lastKnownPath: "docs/remembered.md",
    })).toEqual({
      path: "docs/store.md",
      source: "doc_viewer_store",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: null,
      debugSnapshotPath: "docs/debug.md",
      desktopUrlDocPath: "docs/url.md",
      lastKnownPath: "docs/remembered.md",
    })).toEqual({
      path: "docs/debug.md",
      source: "doc_viewer_debug_snapshot",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: null,
      debugSnapshotPath: null,
      desktopUrlDocPath: "docs/url.md",
      lastKnownPath: "docs/remembered.md",
    })).toEqual({
      path: "docs/url.md",
      source: "desktop_url_doc_param",
    });
    expect(readHelixAskDocViewerPathFromDesktopUrlForSnapshot(
      "http://localhost:1498/desktop?doc=docs%2Fresearch%2Fnhm2-current-status-whitepaper.md",
    )).toBe("docs/research/nhm2-current-status-whitepaper.md");
    expect(resolveHelixAskDocViewerSnapshotPathBinding({
      state: {
        currentPath: "",
      },
      desktopUrlDocPath: "docs/url-active.md",
    })).toEqual({
      path: "docs/url-active.md",
      source: "desktop_url_doc_param",
    });
    expect(resolveHelixAskDocViewerSnapshotPathBinding({
      state: {
        currentPath: "",
      },
      desktopUrlDocPath: null,
    })).toEqual({
      path: "docs/url-active.md",
      source: "doc_viewer_debug_snapshot",
    });
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const docContext = read("client/src/lib/helix/ask-doc-viewer-context.ts");
    const activeDocBinding = read("client/src/components/helix/ask-console/HelixAskActiveDocContextBinding.ts");
    expect(legacyPill).not.toContain("resolveDocViewerSnapshotPathCandidate({");
    expect(legacyPill).toContain("readHelixAskDocViewerPathFromDesktopUrlForSnapshot(url)");
    expect(legacyPill).toContain("resolveHelixAskDocViewerSnapshotPathBinding({");
    expect(legacyPill).not.toContain("let helixAskLastKnownDocViewerPath");
    expect(docContext).toContain("export function resolveDocViewerSnapshotPathCandidate");
    expect(activeDocBinding).toContain("let helixAskLastKnownDocViewerPath");
    expect(activeDocBinding).toContain("readDocPathFromDesktopUrl(desktopUrl)");
    expect(activeDocBinding).toContain("resolveDocViewerSnapshotPathCandidate({");
    expect(docContext).not.toContain("useDocViewerStore");
    expect(docContext).not.toContain("window.");
    expect(docContext).not.toContain("readDocPathFromDesktopUrl");
    expect(docContext).not.toContain("fetch(");
  });

  it("recrowns docs-viewer debug snapshot projection without moving store reads", () => {
    resetHelixAskDocViewerSnapshotPathMemoryForTests();
    expect(buildDocViewerDebugSnapshotFromState(
      {
        mode: "read",
        anchor: "intro",
        pendingAutoReadNonce: "nonce-7",
        recent: ["a", "b"],
      },
      "docs/research/current.md",
    )).toEqual({
      mode: "read",
      currentPath: "docs/research/current.md",
      anchor: "intro",
      pendingAutoReadNonce: "nonce-7",
      recentCount: 2,
    });
    expect(buildHelixAskDocViewerDebugSnapshotBinding({
      mode: "read",
      currentPath: "docs/research/current.md",
      anchor: "results",
      recent: ["a"],
    })).toEqual({
      mode: "read",
      currentPath: "docs/research/current.md",
      anchor: "results",
      pendingAutoReadNonce: null,
      recentCount: 1,
    });
    expect(rememberHelixAskDocViewerPathForSnapshot("")).toBe("docs/research/current.md");
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const docContext = read("client/src/lib/helix/ask-doc-viewer-context.ts");
    const activeDocBinding = read("client/src/components/helix/ask-console/HelixAskActiveDocContextBinding.ts");
    expect(legacyPill).toContain("const state = useDocViewerStore.getState()");
    expect(legacyPill).toContain("buildHelixAskDocViewerDebugSnapshotBinding(state)");
    expect(legacyPill).not.toContain("buildDocViewerDebugSnapshotFromState(state, currentPath)");
    expect(legacyPill).not.toContain("recentCount: Array.isArray(state.recent)");
    expect(docContext).toContain("export function buildDocViewerDebugSnapshotFromState");
    expect(docContext).not.toContain("useDocViewerStore");
    expect(activeDocBinding).toContain("rememberHelixAskDocViewerPathForSnapshot(state.currentPath)");
    expect(docContext).not.toContain("rememberHelixAskDocViewerPathForSnapshot");
    expect(docContext).not.toContain("window.");
    expect(docContext).not.toContain("fetch(");
  });

  it("recrowns docs-viewer current-document anchor resolution without moving current-path reads", () => {
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current NHM2 whitepaper.",
      currentPath: "docs/research/nhm2-current-status-whitepaper.md",
    })).toBe("docs/research/nhm2-current-status-whitepaper.md");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current document. document path: docs/research/explicit.md",
      currentPath: "docs/research/current.md",
    })).toBe("docs/research/explicit.md");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current document and compare client/src/App.tsx.",
      currentPath: "docs/research/current.md",
    })).toBe("client/src/App.tsx");
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const docContext = read("client/src/lib/helix/ask-doc-viewer-context.ts");
    expect(legacyPill).toContain("resolveDocsViewerAnchorPathCandidate({");
    expect(legacyPill).toContain("currentPath: resolveAskTurnDocViewerSnapshotPath().path");
    expect(legacyPill).not.toContain("HELIX_ACTIVE_DOC_VIEWER_ARTIFACT_CUE_RE");
    expect(docContext).toContain("export function resolveDocsViewerAnchorPathCandidate");
    expect(docContext).toContain("HELIX_ACTIVE_DOC_VIEWER_ARTIFACT_CUE_RE");
    expect(docContext).toContain("white\\s*paper|whitepaper");
    expect(docContext).not.toContain("useDocViewerStore");
    expect(docContext).not.toContain("window.");
    expect(docContext).not.toContain("fetch(");
  });

  it("recrowns workstation layout debug snapshot projection without moving layout store reads", () => {
    expect(buildWorkstationLayoutDebugSnapshotFromState({
      mode: "desktop",
      activeGroupId: "main",
      groups: {
        main: { panelIds: ["scientific-calculator", "docs-viewer"] },
        side: { panelIds: ["docs-viewer", "stage-play-badge-graph"] },
      },
      chatDock: { collapsed: false, widthPx: 360, side: "right" },
      mobileDrawer: { open: false, snap: "peek" },
    })).toEqual({
      mode: "desktop",
      activeGroupId: "main",
      groupCount: 2,
      openPanels: ["docs-viewer", "scientific-calculator", "stage-play-badge-graph"],
      chatDock: { collapsed: false, widthPx: 360, side: "right" },
      mobileDrawer: { open: false, snap: "peek" },
    });
    expect(buildHelixAskWorkstationLayoutDebugSnapshotBinding({
      mode: "desktop",
      activeGroupId: "main",
      groups: {
        main: { panelIds: ["docs-viewer", "scientific-calculator"] },
      },
      chatDock: { collapsed: true, widthPx: 420, side: "left" },
      mobileDrawer: { open: true, snap: "full" },
    })).toEqual({
      mode: "desktop",
      activeGroupId: "main",
      groupCount: 1,
      openPanels: ["docs-viewer", "scientific-calculator"],
      chatDock: { collapsed: true, widthPx: 420, side: "left" },
      mobileDrawer: { open: true, snap: "full" },
    });
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const workspaceSnapshot = read("client/src/lib/helix/ask-workspace-context-snapshot.ts");
    const workspaceBinding = read("client/src/components/helix/ask-console/HelixAskWorkspaceContextBinding.ts");
    expect(legacyPill).toContain("buildHelixAskWorkstationLayoutDebugSnapshotBinding(state)");
    expect(legacyPill).not.toContain("buildWorkstationLayoutDebugSnapshotFromState(state)");
    expect(legacyPill).toContain("useWorkstationLayoutStore.getState()");
    expect(workspaceBinding).toContain("buildWorkstationLayoutDebugSnapshotFromState(layoutState)");
    expect(legacyPill).not.toContain("const panelIds = new Set<string>();");
    expect(workspaceSnapshot).toContain("export function buildWorkstationLayoutDebugSnapshotFromState");
    expect(workspaceSnapshot).not.toContain("useWorkstationLayoutStore");
    expect(workspaceSnapshot).not.toContain("@/store/");
    expect(workspaceSnapshot).not.toContain("window.");
    expect(workspaceSnapshot).not.toContain("fetch(");
  });

  it("recrowns Ask turn workspace context snapshot shaping without moving store reads", () => {
    expect(buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-1",
      layoutState: {
        activeGroupId: "main",
        groups: {
          main: {
            activePanelId: "docs-viewer",
            panelIds: ["docs-viewer", "workstation-notes", "workstation-clipboard-history"],
          },
        },
      },
      notesState: {
        active_note_id: "note-1",
        order: ["note-1"],
        notes: {
          "note-1": { id: "note-1", title: "Active note", body: " note body " },
        },
      },
      calculatorState: {
        currentLatex: " ",
        lastSolve: null,
        steps: [],
        debugEvents: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "store",
      },
      situationRoomContext: { status: "ready" },
      situationCaptureContext: { capture: "available" },
      lastUpdatedAtMs: 99,
    })).toMatchObject({
      sessionId: "session-1",
      activePanel: "docs-viewer",
      activeDocPath: "docs/current.md",
      docContextValid: true,
      activeNoteTitle: "Active note",
      activeNoteBody: "note body",
      hasNoteContext: true,
      hasClipboardContext: true,
      situationRoomContext: { status: "ready" },
      situationCaptureContext: { capture: "available" },
      hasSituationRoomContext: true,
      lastUpdatedAtMs: 99,
    });
    expect(buildHelixAskWorkspaceContextSnapshotBinding({
      sessionId: "session-2",
      layoutState: {
        activeGroupId: "main",
        groups: {
          main: {
            activePanelId: "docs-viewer",
            panelIds: ["docs-viewer"],
          },
        },
      },
      notesState: {
        active_note_id: null,
        order: [],
        notes: {},
      },
      calculatorState: {
        currentLatex: "",
        lastSolve: null,
        steps: [],
        debugEvents: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "doc_viewer_store",
      },
      situationRoomContext: null,
      situationCaptureContext: null,
      lastUpdatedAtMs: 101,
    })).toMatchObject({
      sessionId: "session-2",
      activeDocPath: "docs/current.md",
      active_doc_path: "docs/current.md",
      source: "doc_viewer_store",
      lastUpdatedAtMs: 101,
    });
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const workspaceSnapshot = read("client/src/lib/helix/ask-workspace-context-snapshot.ts");
    const workspaceBinding = read("client/src/components/helix/ask-console/HelixAskWorkspaceContextBinding.ts");
    expect(legacyPill).toContain("buildHelixAskWorkspaceContextSnapshotBinding({");
    expect(legacyPill).not.toContain("buildAskTurnWorkspaceContextSnapshotFromState({");
    expect(workspaceBinding).toContain("buildAskTurnWorkspaceContextSnapshotFromState(input)");
    expect(legacyPill).toContain("const layoutState = useWorkstationLayoutStore.getState()");
    expect(legacyPill).toContain("const notesState = useWorkstationNotesStore.getState()");
    expect(legacyPill).toContain("const calculatorState = useScientificCalculatorStore.getState()");
    expect(legacyPill).toContain("const docContext = resolveAskTurnDocViewerSnapshotPath()");
    expect(legacyPill).toContain("lastUpdatedAtMs: Date.now()");
    expect(legacyPill).not.toContain("const clipNoteBodyForAskTurn");
    expect(legacyPill).not.toContain("const calculatorRecentDebugEvents = calculatorState.debugEvents");
    expect(workspaceSnapshot).toContain("export function buildAskTurnWorkspaceContextSnapshotFromState");
    expect(workspaceSnapshot).not.toContain("@/store/");
    expect(workspaceSnapshot).not.toContain("useWorkstationLayoutStore");
    expect(workspaceSnapshot).not.toContain("Date.now");
    expect(workspaceSnapshot).not.toContain("selectSituationRoomAskContextSnapshot");
    expect(workspaceSnapshot).not.toContain("fetch(");
  });

  it("recrowns docs-viewer workstation action arg extraction without moving docs-viewer mutation", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const fastPath = read("client/src/lib/helix/ask-workstation-fast-path.ts");

    expect(
      readWorkstationActionArgText(
        {
          action: "run_panel_action",
          panel_id: "docs-viewer",
          action_id: "open_doc_and_read",
          args: {
            path: " ",
            doc_path: " docs/research/current-whitepaper.md ",
            anchor: " section-2 ",
          },
        },
        ["path", "doc_path", "target"],
      ),
    ).toBe("docs/research/current-whitepaper.md");

    expect(legacyPill).toContain('from "@/lib/helix/ask-workstation-fast-path"');
    expect(legacyPill).toContain('readWorkstationActionArgText(action, ["path", "doc_path", "target"])');
    expect(legacyPill).toContain('readWorkstationActionArgText(action, ["anchor"])');
    expect(legacyPill).toContain("useDocViewerStore.getState().viewDoc(path, anchor)");
    expect(legacyPill).not.toContain("function readWorkstationActionArgString");
    expect(legacyPill).not.toContain("readWorkstationActionArgString(action");
    expect(fastPath).toContain("export function readWorkstationActionArgText");
    expect(fastPath).not.toContain("useDocViewerStore");
    expect(fastPath).not.toContain("viewDoc(");
  });

  it("owns the core backend turn request shape used by the legacy bridge", () => {
    expect(buildHelixAskConsoleBackendTurnPayloadCore({
      sessionId: "session-1",
      agentRuntime: "codex",
      traceId: "ask:trace",
      turnId: "ask:turn",
      maxTokens: 1234,
      question: "Use the active doc.",
      contextFiles: ["docs/current.md"],
    })).toEqual({
      sessionId: "session-1",
      agentRuntime: "codex",
      agent_runtime: "codex",
      traceId: "ask:trace",
      turnId: "ask:turn",
      maxTokens: 1234,
      question: "Use the active doc.",
      doc_path: "docs/current.md",
      active_doc_path: "docs/current.md",
      contextFiles: ["docs/current.md"],
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const activeDocBinding = read("client/src/components/helix/ask-console/HelixAskActiveDocContextBinding.ts");
    const backendEntrypointPolicy = read("client/src/components/helix/ask-console/HelixAskBackendEntrypointPolicy.ts");
    expect(legacyPill).toContain("buildHelixAskConsoleBackendTurnPayloadCore");
    expect(legacyPill).toContain("buildHelixAskConsoleContextFiles");
    expect(legacyPill).toContain("buildHelixAskConsoleContextFiles({");
    expect(legacyPill).not.toContain("function buildHelixAskContextFilesForTurn");
    expect(legacyPill).toContain("buildHelixAskSubmitBackendEntrypointRoutePlan({");
    expect(legacyPill).not.toContain("buildHelixAskHardBackendEntrypointRouteMetadata({");
    expect(legacyPill).not.toContain("function buildHelixAskHardBackendEntrypointRouteMetadata");
    expect(backendEntrypointPolicy).toContain("export function buildHelixAskHardBackendEntrypointRouteMetadata");
    expect(read("client/src/components/helix/ask-console/HelixAskSubmitBackendEntrypointOptions.ts")).toContain(
      "buildHelixAskHardBackendEntrypointRouteMetadata({",
    );
    expect(legacyPill).toContain("readHelixAskDocViewerPathFromDesktopUrlForSnapshot");
    expect(activeDocBinding).toContain("readDocPathFromDesktopUrl");
  });

  it("owns latest visible turn control binding for copy, debug copy, and read aloud", () => {
    const latestId = resolveHelixAskLatestTurnId([
      { id: "old-turn", finalAnswerText: "old answer" },
      { id: "latest-turn", finalAnswerText: "latest answer" },
    ]);

    expect(latestId).toBe("latest-turn");
    expect(buildHelixAskLatestTurnBinding({
      replyId: "old-turn",
      latestReplyId: latestId,
      finalAnswerText: "old answer",
    })).toEqual({
      isLatest: false,
      controlTarget: {
        replyId: "old-turn",
        isLatest: false,
        finalAnswerText: "old answer",
      },
      finalAnswerText: "old answer",
    });
    expect(buildHelixAskLatestTurnBinding({
      replyId: "latest-turn",
      latestReplyId: latestId,
      finalAnswerText: "latest answer",
    })).toEqual({
      isLatest: true,
      controlTarget: {
        replyId: "latest-turn",
        isLatest: true,
        finalAnswerText: "latest answer",
      },
      copyFinalTestId: "helix-ask-latest-copy-final",
      debugCopyTestId: "helix-ask-latest-debug-copy",
      finalAnswerTestId: "helix-ask-latest-final-answer",
      questionTestId: "helix-ask-latest-question",
      readAloudTestId: "helix-ask-latest-read-aloud",
      turnTestId: "helix-ask-latest-turn",
      workLogTestId: "helix-ask-latest-work-log",
      finalAnswerText: "latest answer",
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const latestTurnBindingSource = read("client/src/components/helix/ask-console/HelixAskLatestTurnBinding.ts");
    expect(legacyPill).toContain("buildHelixAskLatestTurnBinding");
    expect(legacyPill).toContain("latestTurnBinding.controlTarget.finalAnswerText");
    expect(latestTurnBindingSource).toContain("export type HelixAskLatestTurnControlTarget");
    for (const forbidden of [
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "fetch(",
      "copyDebugPayloadToClipboard",
      "handleCopyReply",
      "handleReadAloud",
      "runAskTurn",
      "runAskTurnStream",
    ]) {
      expect(latestTurnBindingSource).not.toContain(forbidden);
    }
  });

  it("owns legacy turn control target text and local debug payload selection without side effects", () => {
    expect(resolveHelixAskLegacyTurnControlText({
      visibleFinalAnswerText: "  Visible latest answer.  ",
      fallbackCopyText: "Stale fallback answer.",
    })).toBe("Visible latest answer.");
    expect(resolveHelixAskLegacyTurnControlText({
      visibleFinalAnswerText: "   ",
      fallbackCopyText: "Envelope fallback answer.",
    })).toBe("Envelope fallback answer.");
    expect(buildHelixAskLegacyTurnControlActionPayload({
      reply: {
        id: "reply-latest",
        content: "Fallback answer.",
      },
      visibleFinalAnswerText: "  Visible latest answer.  ",
      fallbackCopyText: "Fallback answer.",
    })).toEqual({
      replyId: "reply-latest",
      text: "Visible latest answer.",
      hasText: true,
    });
    expect(buildHelixAskLegacyTurnControlActionPayload({
      reply: {
        id: "reply-empty",
      },
      visibleFinalAnswerText: "   ",
      fallbackCopyText: "   ",
    })).toEqual({
      replyId: "reply-empty",
      text: "   ",
      hasText: false,
    });
    expect(clearHelixAskLegacyCopiedDebugIdIfCurrent("reply-latest", "reply-latest")).toBeNull();
    expect(clearHelixAskLegacyCopiedDebugIdIfCurrent("reply-newer", "reply-older")).toBe("reply-newer");
    const currentReply = { id: "reply-current" };
    const visibleReply = { id: "reply-visible" };
    expect(resolveHelixAskLegacyClickedDebugReply(currentReply, [currentReply, visibleReply], {
      clientTurnId: "reply-visible",
    })).toEqual({
      reply: visibleReply,
      source: "clicked_client_turn_id",
    });
    expect(resolveHelixAskLegacyClickedDebugReply(currentReply, [currentReply, visibleReply], {
      clientTurnId: "reply-missing",
    })).toEqual({
      reply: currentReply,
      source: "current_reply",
    });
    expect(resolveHelixAskLegacyClickedDebugReply(currentReply, [currentReply, visibleReply], {
      clientTurnId: null,
      activeTurnId: "ask:eaf320-stale",
    })).toEqual({
      reply: currentReply,
      source: "current_reply",
    });

    expect(selectHelixAskLegacyDebugCopyLocalPayload({
      providedPayload: "{\"turn_id\":\"latest\"}",
      normalizedPayload: "{\"turn_id\":\"latest\",\"normalized\":true}",
      renderedButtonScopedPayload: "{\"turn_id\":\"latest\",\"scope\":\"button\"}",
      providedPayloadMatchesRenderedTurn: true,
    })).toEqual({
      localExportPayload: "{\"turn_id\":\"latest\",\"scope\":\"button\"}",
      source: "rendered_button_scope",
    });
    expect(selectHelixAskLegacyDebugCopyLocalPayload({
      providedPayload: "{\"turn_id\":\"stale\"}",
      normalizedPayload: "{\"turn_id\":\"latest\",\"normalized\":true}",
      renderedButtonScopedPayload: "{\"turn_id\":\"latest\",\"scope\":\"button\"}",
      providedPayloadMatchesRenderedTurn: false,
    })).toEqual({
      localExportPayload: "{\"turn_id\":\"latest\",\"scope\":\"button\"}",
      source: "rendered_button_scope",
    });
    expect(selectHelixAskLegacyDebugCopyLocalPayload({
      providedPayload: "{\"turn_id\":\"stale\"}",
      normalizedPayload: "{\"turn_id\":\"latest\",\"normalized\":true}",
      renderedButtonScopedPayload: null,
      providedPayloadMatchesRenderedTurn: false,
    })).toEqual({
      localExportPayload: "{\"turn_id\":\"latest\",\"normalized\":true}",
      source: "normalized_payload",
    });
    const clickedScope = {
      activeTurnId: "ask:latest",
      clientTurnId: "client:latest",
      question: "Latest question?",
      finalAnswer: "Latest answer.",
    };
    const scopedDebugPayload = "{\"active_turn_id\":\"ask:latest\",\"client_active_turn_id\":\"client:latest\",\"scope\":\"button\"}";
    expect(selectHelixAskLegacyGuardedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:latest",
        backend_turn_id: "ask:latest",
        client_active_turn_id: "client:latest",
        active_prompt: "Latest question?",
      }),
      clickedButtonScopedPayload: scopedDebugPayload,
      clickedTurnScope: clickedScope,
      payloadMatchesClickedTurn: () => true,
    })).toContain("\"ask:latest\"");
    expect(selectHelixAskLegacyGuardedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:stale",
        backend_turn_id: "ask:stale",
        client_active_turn_id: "client:latest",
      }),
      clickedButtonScopedPayload: scopedDebugPayload,
      clickedTurnScope: clickedScope,
      payloadMatchesClickedTurn: () => true,
    })).toBe(scopedDebugPayload);
    expect(selectHelixAskLegacyGuardedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:latest",
        backend_turn_id: "ask:latest",
        client_active_turn_id: "client:stale",
      }),
      clickedButtonScopedPayload: scopedDebugPayload,
      clickedTurnScope: clickedScope,
      payloadMatchesClickedTurn: () => true,
    })).toBe(scopedDebugPayload);
    expect(selectHelixAskLegacyGuardedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:latest",
        backend_turn_id: "ask:latest",
        client_active_turn_id: "client:latest",
      }),
      clickedButtonScopedPayload: scopedDebugPayload,
      clickedTurnScope: clickedScope,
      payloadMatchesClickedTurn: () => false,
    })).toBe(scopedDebugPayload);
    expect(selectHelixAskLegacyGuardedDebugExportPayload({
      exportPayload: "{not-json",
      clickedButtonScopedPayload: scopedDebugPayload,
      clickedTurnScope: clickedScope,
      payloadMatchesClickedTurn: () => true,
    })).toBe(scopedDebugPayload);
    expect(selectHelixAskLegacyReplyScopedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc",
        active_prompt: "ok, can you grab numerics...",
      }),
      replyScopedFallbackPayload: JSON.stringify({
        active_turn_id: "client:latest",
        client_active_turn_id: "client:latest",
        active_prompt: "UI debug binding retest latest prompt",
      }),
      payloadMatchesExpectedReply: () => false,
    })).toContain("UI debug binding retest latest prompt");
    expect(selectHelixAskLegacyReplyScopedDebugExportPayload({
      exportPayload: JSON.stringify({
        active_turn_id: "ask:latest",
        active_prompt: "UI debug binding retest latest prompt",
      }),
      replyScopedFallbackPayload: scopedDebugPayload,
      payloadMatchesExpectedReply: () => true,
    })).toContain("ask:latest");
    const identityMatchedBackendExport = JSON.stringify({
      active_turn_id: "ask:latest",
      active_prompt: "Latest question?",
      selected_final_answer: "Server diagnostic answer that differs from the UI failure.",
      debug_export_source: "backend_endpoint",
      backend_debug_response_status: "fetched",
      ask_turn_solver_trace: { completed: false },
    });
    expect(selectHelixAskLegacyReplyScopedDebugExportPayload({
      exportPayload: identityMatchedBackendExport,
      replyScopedFallbackPayload: JSON.stringify({
        active_turn_id: "ask:latest",
        active_prompt: "Latest question?",
        selected_final_answer: "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.",
        debug_export_source: "rendered_reply_dom",
      }),
      payloadMatchesExpectedReply: () => false,
    })).toBe(identityMatchedBackendExport);
    expect(selectHelixAskLegacyReplyScopedDebugExportPayload({
      exportPayload: identityMatchedBackendExport,
      replyScopedFallbackPayload: JSON.stringify({
        active_turn_id: "ask:different",
        active_prompt: "Different question?",
        debug_export_source: "rendered_reply_dom",
      }),
      payloadMatchesExpectedReply: () => false,
    })).toContain("ask:different");
    const latestQuestion = "UI debug binding retest latest prompt";
    const latestFinal = "Latest visible final answer from Codex runtime.";
    const questionNode = {
      innerText: `1Questionquestion${latestQuestion}user prompt`,
      textContent: `1Questionquestion${latestQuestion}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${latestFinal}chat final answer | Provider: Codex Workstation Mode`,
      textContent: `15Final answerfinal${latestFinal}chat final answer | Provider: Codex Workstation Mode`,
      getAttribute: (name: string) =>
        name === "data-final-answer-text"
          ? latestFinal
          : name === "data-visible-terminal-source"
            ? "chat final answer"
            : null,
    };
    const visibleTurnContainer = {
      innerText: "",
      textContent: "",
      parentElement: null,
      querySelector: (selector: string) => {
        if (selector.includes("question")) return questionNode;
        if (selector.includes("final")) return finalNode;
        return null;
      },
    } as unknown as HTMLElement;
    const staleDebugButton = {
      innerText: "",
      textContent: "",
      parentElement: visibleTurnContainer,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return "ask:eaf320-stale";
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-visible";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return "old prompt";
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return "3 + 5 = 8";
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(extractHelixAskLegacyClickedTurnDebugScope(staleDebugButton)).toEqual({
      question: latestQuestion,
      finalAnswer: latestFinal,
      terminalArtifactKind: null,
      activeTurnId: null,
      clientTurnId: null,
    });
    const staleClientDebugButton = {
      innerText: "",
      textContent: "",
      parentElement: visibleTurnContainer,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return "ask:eaf320-stale";
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-eaf320-stale";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return "ok, can you grab numerics...";
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return "3 + 5 = 8";
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(extractHelixAskLegacyClickedTurnDebugScope(staleClientDebugButton)).toMatchObject({
      question: latestQuestion,
      finalAnswer: latestFinal,
      activeTurnId: null,
      clientTurnId: null,
    });
    const modelPolicyDebugSummary = "AI: Auto -> Fast | gpt-5.4-mini | reasoning: low | turn-local";
    const modelPolicyDebugButton = {
      innerText: "",
      textContent: "",
      parentElement: null,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return "ask:model-policy";
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-model-policy";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return "policy question";
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return "policy answer";
        if (
          name === "data-debug-copy-model-policy-debug-summary" ||
          name === "data-turn-control-model-policy-debug-summary"
        ) {
          return modelPolicyDebugSummary;
        }
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(extractHelixAskLegacyClickedTurnDebugScope(modelPolicyDebugButton)).toMatchObject({
      question: "policy question",
      finalAnswer: "policy answer",
      activeTurnId: "ask:model-policy",
      clientTurnId: "reply-model-policy",
      modelPolicyDebugSummary,
    });
    const scopedLatestDebugPayload = JSON.stringify({
      active_turn_id: "ask:latest-visible",
      client_active_turn_id: "reply-visible",
      selectedDebugQuestion: latestQuestion,
      selected_final_answer: latestFinal,
    });
    const staleDebugPayload = JSON.stringify({
      active_turn_id: "ask:eaf320-stale",
      client_active_turn_id: "reply-visible",
      selectedDebugQuestion: latestQuestion,
      selected_final_answer: latestFinal,
    });
    const latestDebugButton = {
      innerText: "",
      textContent: "",
      parentElement: visibleTurnContainer,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return "ask:latest-visible";
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-visible";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return latestQuestion;
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return latestFinal;
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(scopedLatestDebugPayload, latestDebugButton)).toBe(true);
    expect(debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(staleDebugPayload, latestDebugButton)).toBe(false);
    const fetchedBackendMarkdownPayload = JSON.stringify({
      active_turn_id: "ask:latest-visible",
      client_active_turn_id: "reply-visible",
      selectedDebugQuestion: latestQuestion,
      selected_final_answer: `**${latestFinal}**`,
      debug_export_source: "backend_endpoint",
      backend_debug_response_status: "fetched",
    });
    const staleFetchedBackendPayload = JSON.stringify({
      active_turn_id: "ask:eaf320-stale",
      client_active_turn_id: "reply-stale",
      selectedDebugQuestion: latestQuestion,
      selected_final_answer: `**${latestFinal}**`,
      debug_export_source: "backend_endpoint",
      backend_debug_response_status: "fetched",
    });
    expect(debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(fetchedBackendMarkdownPayload, latestDebugButton)).toBe(true);
    expect(debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(staleFetchedBackendPayload, latestDebugButton)).toBe(false);
    expect(isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({
      rendered: {
        activeTurnId: "ask:latest-visible",
        clientTurnId: "reply-visible",
        question: latestQuestion,
        finalAnswer: latestFinal,
      },
      renderedMatchesReply: true,
      replyDebugRecord: {
        active_prompt: latestQuestion,
        selected_final_answer: latestFinal,
      },
    })).toBe(true);
    expect(isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({
      rendered: {
        activeTurnId: "ask:eaf320-stale",
        clientTurnId: "reply-visible",
        question: latestQuestion,
        finalAnswer: latestFinal,
      },
      renderedMatchesReply: true,
      replyDebugRecord: {
        active_prompt: "old prompt",
        selected_final_answer: "3 + 5 = 8",
      },
    })).toBe(false);
    expect(isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({
      rendered: {
        activeTurnId: "ask:eaf320-stale",
        clientTurnId: "reply-visible",
        question: latestQuestion,
        finalAnswer: latestFinal,
      },
      renderedMatchesReply: true,
      replyDebugRecord: null,
    })).toBe(false);
    expect(isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({
      rendered: {
        activeTurnId: "ask:eaf320-stale",
        clientTurnId: "reply-visible",
        question: latestQuestion,
        finalAnswer: latestFinal,
      },
      renderedMatchesReply: true,
      replyDebugRecord: {},
    })).toBe(false);
    expect(enforceHelixAskLegacyDebugExportMatchesClickedButton({
      exportPayload: staleDebugPayload,
      clickedButtonScopedPayload: scopedLatestDebugPayload,
      sourceElement: latestDebugButton,
    })).toBe(scopedLatestDebugPayload);
    expect(resolveHelixAskLegacyReplyDebugTurnId({
      id: "reply-fallback",
      debug: {
        turn_id: "ask:debug-turn",
      },
    })).toBe("ask:debug-turn");
    expect(resolveHelixAskLegacyReplyDebugTurnId({
      id: "reply-fallback",
      resolved_turn_summary: {
        turn_id: "ask:summary-turn",
      },
      debug: {},
    })).toBe("ask:summary-turn");
    expect(resolveHelixAskLegacyReplyDebugTurnId({
      id: "reply-fallback",
      terminal_answer_authority: {
        turn_id: "ask:authority-turn",
      },
      debug: {},
    })).toBe("ask:authority-turn");
    expect(resolveHelixAskLegacyReplyDebugTurnId({
      id: "reply-fallback",
      debug: {},
    })).toBe("reply-fallback");
    expect(debugPayloadMatchesHelixAskLegacyRenderedReply({
      id: "reply-visible",
      question: latestQuestion,
      debug: { turn_id: "ask:latest-visible" },
    }, {
      active_turn_id: "ask:latest-visible",
      selectedDebugQuestion: latestQuestion,
    })).toBe(true);
    expect(debugPayloadMatchesHelixAskLegacyRenderedReply({
      id: "reply-visible",
      question: latestQuestion,
      debug: { turn_id: "ask:latest-visible" },
    }, {
      active_turn_id: "ask:eaf320-stale",
      selectedDebugQuestion: latestQuestion,
    })).toBe(false);
    expect(debugPayloadMatchesHelixAskLegacyRenderedReply({
      id: "reply-visible",
      question: latestQuestion,
      debug: { turn_id: "ask:latest-visible" },
    }, {
      active_turn_id: "ask:latest-visible",
      selectedDebugQuestion: "old prompt",
    })).toBe(false);
    const oversizedDebugPayload = JSON.stringify({
      schema: "helix.ask.debug_export.v1",
      active_turn_id: "ask:latest-visible",
      selected_final_answer: "bounded answer",
      final_answer_source: "chat_final_answer",
      terminal_artifact_kind: "chat_final_answer",
      terminal_answer_authority: {
        terminal_text_preview: "bounded answer",
      },
      runtime_goal_command: {
        command: "wake",
        goal_id: "goal:bounded-runtime",
      },
      runtime_goal_session: {
        goal_id: "goal:bounded-runtime",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime:bounded-runtime",
        terminal_authority_status: "authorized",
      },
      runtime_goal_debug_export: {
        schema: "helix.runtime_goal.debug_export.v1",
        goal_id: "goal:bounded-runtime",
        runtime_provider: "codex",
        runtime_session_id: "runtime:bounded-runtime",
        debug_events: [
          { stage: "evidence_reentered" },
          { stage: "runtime_candidate_generated" },
          { stage: "terminal_authority_evaluated" },
        ],
      },
      runtime_goal_debug_summary: {
        schema: "helix.runtime_goal.debug_copy_summary.v1",
        goal_id: "goal:bounded-runtime",
        runtime_agent_provider: "codex",
        evidence_reentered: true,
        runtime_candidate_generated: true,
        terminal_authority_evaluated: true,
      },
      current_turn_artifact_ledger: [
        {
          artifact_id: "artifact:calculator",
          kind: "workspace_action_receipt",
          payload: {
            schema: "helix.workspace_action_receipt.v1",
            action_key: "scientific-calculator.solve_expression",
            expression: "8*9",
            result: "72",
          },
        },
      ],
      giant_debug_blob: "x".repeat(HELIX_DEBUG_EXPORT_MAX_UI_CHARS + 1000),
    });
    const boundedDebugPayload = boundHelixDebugExportTextForUi(oversizedDebugPayload);
    expect(boundedDebugPayload.length).toBeLessThanOrEqual(HELIX_DEBUG_EXPORT_MAX_UI_CHARS);
    expect(JSON.parse(boundedDebugPayload)).toMatchObject({
      schema: "helix.ask.debug_export.v1",
      active_turn_id: "ask:latest-visible",
      selected_final_answer: "bounded answer",
      terminal_answer_authority: {
        terminal_text_preview: "bounded answer",
      },
      runtime_goal_command: {
        command: "wake",
        goal_id: "goal:bounded-runtime",
      },
      runtime_goal_session: {
        goal_id: "goal:bounded-runtime",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime:bounded-runtime",
        terminal_authority_status: "authorized",
      },
      runtime_goal_debug_export: {
        schema: "helix.runtime_goal.debug_export.v1",
        goal_id: "goal:bounded-runtime",
      },
      runtime_goal_debug_summary: {
        schema: "helix.runtime_goal.debug_copy_summary.v1",
        goal_id: "goal:bounded-runtime",
        evidence_reentered: true,
      },
      debug_export_size_control: {
        schema: "helix.ask.debug_export_size_control.v1",
        truncated: true,
        bounded_by: "client_copy_path",
      },
    });

    const longAnswer = `Final answer starts.\n${"agent-output ".repeat(120)}\nFinal answer ends.`;
    expect(buildHelixAskReplyCopyText({
      id: "reply-long-answer",
      content: longAnswer,
      question: "Return a long answer.",
      debug: {
        selected_final_answer: longAnswer,
        final_answer_source: "model_direct_answer",
      },
    })).toBe(longAnswer);

    const envelopeAnswer = `Envelope answer starts.\n${"section-output ".repeat(40)}\nEnvelope answer ends.`;
    const envelopeDetail = `Detail starts.\n${"detail-output ".repeat(30)}\nDetail ends.`;
    const envelopeCopy = buildHelixAskReplyCopyText({
      id: "reply-envelope-long-answer",
      content: "fallback should not win",
      question: "Return an envelope answer.",
      envelope: {
        answer: envelopeAnswer,
        sections: [
          {
            title: "Details",
            layer: "detail",
            body: envelopeDetail,
          },
        ],
      },
    });
    expect(envelopeCopy).toContain(envelopeAnswer);
    expect(envelopeCopy).toContain(envelopeDetail);
    expect(envelopeCopy).toContain("Envelope answer ends.");
    expect(envelopeCopy).toContain("Detail ends.");
    expect(envelopeCopy).not.toContain("...");

    expect(collectHelixAskLegacyReplyTerminalTranscriptTexts({
      id: "reply-terminal-transcript",
      content: "visible fallback",
      turn_transcript_events: [
        { source_event_type: "terminal_answer", text: "  final from top level  " },
        { source_event_type: "tool_observation", text: "not final" },
      ],
      debug: {
        turnTranscriptEvents: [
          { type: "final_answer", text: "final from debug" },
          { type: "final_answer", text: "final from debug" },
        ],
        agent_loop: {
          transcript_events: [
            { type: "terminal_answer", text: "final from agent loop" },
          ],
        },
      },
    })).toEqual([
      "final from top level",
      "final from debug",
      "final from agent loop",
    ]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const controlsSource = read("client/src/components/helix/ask-console/HelixAskLegacyTurnControls.ts");
    const runtimeGoalDebugFields = buildHelixAskRuntimeGoalDebugFields({
      runtime_goal_command: { command: "wake" },
      runtime_goal_session: { goal_id: "goal:recrowned-runtime" },
      runtime_goal_debug_export: { schema: "helix.runtime_goal.debug_export.v1" },
    });
    expect(runtimeGoalDebugFields).toMatchObject({
      runtime_goal_command: { command: "wake" },
      runtime_goal_session: { goal_id: "goal:recrowned-runtime" },
      runtime_goal_debug_export: { schema: "helix.runtime_goal.debug_export.v1" },
    });
    expect(mergeHelixAskRuntimeGoalDebugFields(
      {
        selected_final_answer: "Awake.",
        final_answer_source: "runtime_goal_command",
      },
      {
        runtime_goal_command: { command: "wake" },
        runtime_goal_session: { goal_id: "goal:recrowned-runtime" },
        runtime_goal_debug_export: { schema: "helix.runtime_goal.debug_export.v1" },
      },
    )).toMatchObject({
      runtime_goal_command: { command: "wake" },
      runtime_goal_session: { goal_id: "goal:recrowned-runtime" },
      runtime_goal_debug_export: { schema: "helix.runtime_goal.debug_export.v1" },
    });
    expect(legacyPill).toContain("buildHelixAskLegacyTurnControlActionPayload");
    expect(legacyPill).toContain("clearHelixAskLegacyCopiedDebugIdIfCurrent(current, clickedReply.id)");
    expect(legacyPill).not.toContain("resolveHelixAskLegacyTurnControlText");
    expect(legacyPill).not.toContain("current === clickedReply.id ? null : current");
    expect(legacyPill).toContain("selectHelixAskLegacyDebugCopyLocalPayload");
    expect(legacyPill).toContain("copyHelixAskPlainTextToClipboard(target.text)");
    expect(legacyPill).toContain("text: target.text");
    expect(legacyPill).toContain("replyId: target.replyId || reply.id");
    expect(legacyPill).toContain("const clickedTurnScope = extractHelixAskLegacyClickedTurnDebugScope(sourceElement)");
    expect(legacyPill).toContain("resolveHelixAskLegacyClickedDebugReply(reply, askReplies, clickedTurnScope)");
    expect(legacyPill).not.toContain("askReplies.find((candidate) => candidate.id === clickedTurnScope.clientTurnId) ?? reply");
    expect(legacyPill).toContain("normalizeReplyMasterDebugPayload(clickedReply, payload)");
    expect(legacyPill).toContain("buildReplyScopedDebugExportFromRenderedButton(\n          clickedReply,");
    const renderedReplyDebugExportSource = read(
      "client/src/components/helix/ask-console/HelixAskRenderedReplyDebugExport.ts",
    );
    expect(legacyPill).not.toContain("collectHelixAskLegacyReplyTerminalTranscriptTexts(reply)");
    expect(renderedReplyDebugExportSource).toContain("collectHelixAskLegacyReplyTerminalTranscriptTexts(args.reply)");
    expect(legacyPill).not.toContain("function collectHelixReplyTerminalTranscriptTexts");
    expect(legacyPill).toContain("debugPayloadMatchesHelixAskLegacyRenderedReply as debugPayloadMatchesRenderedReply");
    expect(legacyPill).not.toContain("function debugPayloadMatchesRenderedReply");
    expect(legacyPill).toContain("finalizeHelixAskWorkflowDebugCopyExport");
    expect(legacyPill).not.toContain("boundHelixDebugExportTextForUi");
    const workflowDebugProjectionSource = read(
      "client/src/components/helix/ask-console/HelixAskWorkflowDebugProjection.ts",
    );
    expect(workflowDebugProjectionSource).toContain("boundHelixDebugExportTextForUi");
    expect(legacyPill).toContain("buildHelixAskRuntimeGoalDebugFields(localResponseRecord)");
    const debugCopyProjectionSource = read("client/src/components/helix/ask-console/HelixAskDebugCopyProjection.ts");
    expect(legacyPill).toContain("resolveHelixAskAuthoritativeDebugExportPayload(localPayload)");
    expect(debugCopyProjectionSource).toContain("...mergeHelixAskRuntimeGoalDebugFields(authoritativePayload, parsed)");
    expect(legacyPill).not.toContain("localResponseRecord.runtime_goal_command && typeof localResponseRecord.runtime_goal_command");
    expect(legacyPill).not.toContain("const HELIX_DEBUG_EXPORT_MAX_UI_CHARS = 750_000");
    expect(legacyPill).not.toContain("function copyHelixRailCriticalDebugFieldsForUi");
    expect(legacyPill).not.toContain("isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({");
    expect(renderedReplyDebugExportSource).toContain("isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({");
    expect(legacyPill).toContain("extractHelixAskLegacyClickedTurnDebugScope(sourceElement)");
    expect(legacyPill).toContain("resolveHelixAskLegacyReplyDebugTurnId as resolveHelixAskReplyDebugTurnId");
    expect(legacyPill).not.toContain("function extractHelixRenderedTurnDebugFromButton");
    expect(legacyPill).not.toContain("function resolveHelixAskReplyDebugTurnId");
    expect(legacyPill).toContain(
      "export function buildHelixAskReplyCopyText(reply: HelixAskReply): string {\n  return buildRecrownedHelixAskReplyCopyText(reply);\n}",
    );
    expect(controlsSource).toContain("export function buildHelixAskReplyCopyText");
    expect(controlsSource).toContain("export function buildHelixAskLegacyTurnControlActionPayload");
    expect(controlsSource).toContain("export function clearHelixAskLegacyCopiedDebugIdIfCurrent");
    expect(controlsSource).toContain("export function resolveHelixAskLegacyTurnControlText");
    expect(controlsSource).toContain("export function extractHelixAskLegacyClickedTurnDebugScope");
    expect(controlsSource).toContain("export function isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted");
    expect(controlsSource).toContain("export function resolveHelixAskLegacyReplyDebugTurnId");
    expect(controlsSource).toContain("export function collectHelixAskLegacyReplyTerminalTranscriptTexts");
    expect(controlsSource).toContain("export function debugPayloadMatchesHelixAskLegacyRenderedReply");
    expect(controlsSource).toContain("staleAttributeMismatch");
    expect(controlsSource).toContain("resolveHelixVisibleTerminal(reply, fallbackContent)");
    expect(controlsSource).toContain("formatEnvelopeSectionsForCopy");
    const debugSizeControlSource = read("client/src/components/helix/ask-console/HelixAskDebugExportSizeControl.ts");
    expect(debugSizeControlSource).toContain("export function boundHelixDebugExportTextForUi");
    expect(debugSizeControlSource).toContain("export function copyHelixRailCriticalDebugFieldsForUi");
    expect(debugSizeControlSource).toContain("HELIX_DEBUG_EXPORT_MAX_UI_CHARS");
    expect(debugSizeControlSource).not.toContain("navigator.clipboard");
    expect(debugSizeControlSource).not.toContain("fetch(");
    expect(debugSizeControlSource).not.toMatch(/from ["']react["']/);
    expect(debugCopyProjectionSource).toContain("export async function resolveHelixAskAuthoritativeDebugExportPayload");
    expect(debugCopyProjectionSource).toContain("export async function copyHelixAskDebugPayloadToClipboard");
    for (const forbidden of [
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "fetch(",
      "copyDebugPayloadToClipboard",
      "resolveAuthoritativeDebugExportPayload",
      "handleCopyReply",
      "handleReadAloud",
      "runAskTurn",
      "runAskTurnStream",
    ]) {
      expect(controlsSource).not.toContain(forbidden);
    }
  });

  it("owns legacy debug-export backend target selection without fetching", () => {
    expect(isHelixAskLegacyBackendDebugExportEligibleTurnId("ask:latest")).toBe(true);
    expect(isHelixAskLegacyBackendDebugExportEligibleTurnId("chat:ask:latest")).toBe(true);
    expect(isHelixAskLegacyBackendDebugExportEligibleTurnId("turn-old")).toBe(false);
    expect(normalizeHelixAskLegacyBackendTurnId(
      "helix-chat-turn:53379b0b-93de-41b5-b6f7-46de25dd90ad:ask:09872050-9595-49d5-ac1d-54d79dbea20b",
    )).toBe("ask:09872050-9595-49d5-ac1d-54d79dbea20b");

    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "helix-chat-turn:client:ask:nested-backend-turn",
      debug_export_rebuild_reason: "rendered_button_scope",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/ask%3Anested-backend-turn/debug-export",
        turn_id: "ask:nested-backend-turn",
      },
    })).toEqual({
      activeTurnId: "ask:nested-backend-turn",
      backendRef: {
        endpoint: "/api/agi/ask/turn/ask%3Anested-backend-turn/debug-export",
        turn_id: "ask:nested-backend-turn",
      },
      endpoint: "/api/agi/ask/turn/ask%3Anested-backend-turn/debug-export",
      status: "ready",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:latest",
      debug_export_rebuild_reason: "rendered_button_scope",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/ask%3Alatest/debug-export",
        turn_id: "ask:latest",
      },
    })).toEqual({
      activeTurnId: "ask:latest",
      backendRef: {
        endpoint: "/api/agi/ask/turn/ask%3Alatest/debug-export",
        turn_id: "ask:latest",
      },
      endpoint: "/api/agi/ask/turn/ask%3Alatest/debug-export",
      status: "ready",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:latest",
      debug_export_rebuild_reason: "rendered_button_scope",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/old/debug-export",
        turn_id: "old",
      },
    })).toEqual({
      activeTurnId: "ask:latest",
      backendRef: null,
      endpoint: null,
      status: "not_advertised",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc",
      debug_export_rebuild_reason: "rendered_button_scope",
    })).toEqual({
      activeTurnId: "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc",
      backendRef: {
        endpoint: "/api/agi/ask/turn/ask%3Aeaf320fb-a91d-45f7-ba63-11c9c35e22fc/debug-export",
        turn_id: "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc",
      },
      endpoint: "/api/agi/ask/turn/ask%3Aeaf320fb-a91d-45f7-ba63-11c9c35e22fc/debug-export",
      status: "ready",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:rendered-reply",
      debug_export_rebuild_reason: "rendered_reply",
    })).toEqual({
      activeTurnId: "ask:rendered-reply",
      backendRef: {
        endpoint: "/api/agi/ask/turn/ask%3Arendered-reply/debug-export",
        turn_id: "ask:rendered-reply",
      },
      endpoint: "/api/agi/ask/turn/ask%3Arendered-reply/debug-export",
      status: "ready",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:payload-mismatch",
      debug_export_rebuild_reason: "payload_reply_mismatch",
    })).toEqual({
      activeTurnId: "ask:payload-mismatch",
      backendRef: null,
      endpoint: null,
      status: "not_advertised",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "turn-not-backend-eligible",
      debug_export_rebuild_reason: "rendered_button_scope",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/old/debug-export",
        turn_id: "old",
      },
    })).toEqual({
      activeTurnId: "turn-not-backend-eligible",
      backendRef: null,
      endpoint: null,
      status: "not_advertised",
    });
    expect(resolveHelixAskLegacyDebugExportBackendTarget({
      active_turn_id: "ask:latest",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/old/debug-export",
        turn_id: "old",
      },
    })).toEqual({
      activeTurnId: "ask:latest",
      backendRef: {
        endpoint: "/api/agi/ask/turn/old/debug-export",
        turn_id: "old",
      },
      endpoint: "/api/agi/ask/turn/old/debug-export",
      status: "turn_mismatch",
    });
    expect(debugPayloadMatchesHelixAskLegacyRenderedReply(
      {
        id: "helix-chat-turn:client:ask:image-lens",
        question: "Use the Image Lens region tool on the attached image.",
        content: "Recovered Image Lens observation report.",
        debug: {
          turn_id: "ask:image-lens",
        },
      },
      {
        active_turn_id: "ask:image-lens",
        backend_turn_id: "ask:image-lens",
        debug_export_source: "backend_endpoint",
        backend_debug_response_status: "fetched",
        active_prompt: "Use the Image Lens region tool on the attached image. Inspect the equation area first...",
        selected_final_answer: "Recovered Image Lens observation report.",
      },
    )).toBe(true);
    expect(debugPayloadMatchesHelixAskLegacyRenderedReply(
      {
        id: "helix-chat-turn:client:ask:nested-backend-turn",
        question: "Inspect the saved paper.",
        content: "Grounded answer.",
      },
      {
        active_turn_id: "ask:nested-backend-turn",
        debug_export_source: "backend_endpoint",
        backend_debug_response_status: "fetched",
        active_prompt: "Inspect the saved paper.",
        selected_final_answer: "Grounded answer.",
      },
    )).toBe(true);
    expect(resolveHelixAskLegacyDebugExportClientTurnId({
      client_active_turn_id: "client-active",
      clientSelectedDebugTurnId: "client-selected",
      reply: { id: "reply-id" },
    })).toBe("client-active");
    expect(resolveHelixAskLegacyDebugExportClientTurnId({
      clientSelectedDebugTurnId: "client-selected",
      reply: { id: "reply-id" },
    })).toBe("client-selected");
    expect(resolveHelixAskLegacyDebugExportClientTurnId({
      reply: { id: "reply-id" },
    })).toBe("reply-id");
    expect(resolveHelixAskLegacyDebugExportClientTurnId({
      active_turn_id: "helix-chat-turn:client:ask:nested-backend-turn",
    })).toBe("helix-chat-turn:client:ask:nested-backend-turn");
    expect(resolveHelixAskLegacyDebugExportClientTurnId({})).toBeNull();

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const controlsSource = read("client/src/components/helix/ask-console/HelixAskLegacyTurnControls.ts");
    const debugCopyProjectionSource = read("client/src/components/helix/ask-console/HelixAskDebugCopyProjection.ts");
    expect(debugCopyProjectionSource).toContain("resolveHelixAskLegacyDebugExportBackendTarget(parsed)");
    expect(debugCopyProjectionSource).toContain("resolveHelixAskLegacyDebugExportClientTurnId(parsed)");
    expect(legacyPill).not.toContain("resolveHelixAskLegacyDebugExportBackendTarget(parsed)");
    expect(legacyPill).not.toContain("resolveHelixAskLegacyDebugExportClientTurnId(parsed)");
    expect(legacyPill).toContain("resolveHelixAskAuthoritativeDebugExportPayload(localPayload)");
    expect(legacyPill).not.toContain("coerceText(parsed.clientSelectedDebugTurnId).trim()");
    expect(controlsSource).toContain("export function resolveHelixAskLegacyDebugExportBackendTarget");
    expect(controlsSource).toContain("export function resolveHelixAskLegacyDebugExportClientTurnId");
    expect(controlsSource).toContain("export function isHelixAskLegacyBackendDebugExportEligibleTurnId");
    for (const forbidden of [
      "fetch(",
      "copyDebugPayloadToClipboard",
      "resolveAuthoritativeDebugExportPayload",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "runAskTurn",
      "runAskTurnStream",
    ]) {
      expect(controlsSource).not.toContain(forbidden);
    }
  });

  it("keeps a fetched backend debug export when the rendered client id nests the same Ask turn", async () => {
    const originalFetch = globalThis.fetch;
    const clientTurnId = "helix-chat-turn:53379b0b-93de-41b5-b6f7-46de25dd90ad:ask:09872050-9595-49d5-ac1d-54d79dbea20b";
    const backendTurnId = "ask:09872050-9595-49d5-ac1d-54d79dbea20b";
    const prompt = "Inspect equation (47) in the saved paper.";
    const endpoint = `/api/agi/ask/turn/${encodeURIComponent(backendTurnId)}/debug-export`;
    const fetchCalls: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(async (input: unknown) => {
        fetchCalls.push(String(input));
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            payload: {
              schema: "helix.ask.debug_export.v1",
              active_turn_id: backendTurnId,
              active_prompt: prompt,
              selected_final_answer: "Page-grounded answer.",
              ask_turn_solver_trace: { completed: true },
            },
          })),
        } as unknown as Response;
      }),
    });

    try {
      const resolved = await resolveHelixAskAuthoritativeDebugExportPayload(JSON.stringify({
        schema: "helix.ask.debug_export.v1",
        active_turn_id: clientTurnId,
        active_prompt: prompt,
        debug_export_source: "rendered_reply_dom",
        debug_export_rebuild_reason: "rendered_button_scope",
        backend_debug_response_status: "ref_advertised",
        backend_debug_response_ref: {
          endpoint,
          turn_id: backendTurnId,
        },
        channels: {
          workflowDemo: {
            schema: "helix.workflow_demo_debug.v1",
            current_turn_event_count: 3,
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
          },
        },
      }));
      const parsed = JSON.parse(resolved) as Record<string, unknown>;

      expect(fetchCalls).toEqual([endpoint]);
      expect(parsed).toMatchObject({
        active_turn_id: backendTurnId,
        client_active_turn_id: clientTurnId,
        ui_client_active_turn_id: clientTurnId,
        debug_export_source: "backend_endpoint",
        backend_debug_response_status: "fetched",
        ask_turn_solver_trace: { completed: true },
        workflow_demo_debug: {
          schema: "helix.workflow_demo_debug.v1",
          current_turn_event_count: 3,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
        },
      });
      expect(debugPayloadMatchesHelixAskLegacyRenderedReply(
        { id: clientTurnId, question: prompt, content: "Page-grounded answer." },
        parsed,
      )).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
  });

  it("hydrates an advertised backend debug ref at the shared clipboard boundary", async () => {
    const originalFetch = globalThis.fetch;
    const originalNavigator = globalThis.navigator;
    const backendTurnId = "ask:research-library-debug-copy";
    const clientTurnId = `helix-chat-turn:client:${backendTurnId}`;
    const endpoint = `/api/agi/ask/turn/${encodeURIComponent(backendTurnId)}/debug-export`;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          payload: {
            schema: "helix.ask.debug_export.v1",
            active_turn_id: backendTurnId,
            active_prompt: "Read the saved Research Library document.",
            ask_turn_solver_trace: { completed_solver_path: true },
          },
        })),
      }) as unknown as Response),
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => writes.push(text)),
        },
      },
    });

    try {
      const result = await copyHelixAskDebugPayloadToClipboard(JSON.stringify({
        schema: "helix.ask.debug_export.v1",
        active_turn_id: clientTurnId,
        active_prompt: "Read the saved Research Library document.",
        debug_export_source: "rendered_reply_dom",
        backend_debug_response_status: "ref_advertised",
        backend_debug_response_ref: { endpoint, turn_id: backendTurnId },
      }));

      expect(result).toMatchObject({ ok: true, method: "navigator.clipboard" });
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0])).toMatchObject({
        active_turn_id: backendTurnId,
        client_active_turn_id: clientTurnId,
        debug_export_source: "backend_endpoint",
        backend_debug_response_status: "fetched",
        ask_turn_solver_trace: { completed_solver_path: true },
      });
    } finally {
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    }
  });

  it("attaches client workflow demo debug at the final debug-copy boundary", () => {
    const merged = mergeHelixAskClientWorkflowDemoDebugIntoExport(
      JSON.stringify({
        schema: "helix.ask.debug_export.v1",
        active_turn_id: "ask:qte-debug",
        workflow_demo_debug: null,
      }),
      {
        schema: "helix.workflow_demo_debug.v1",
        current_turn_event_count: 3,
        run_event_count: 8,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    );

    expect(JSON.parse(merged)).toMatchObject({
      active_turn_id: "ask:qte-debug",
      workflow_demo_debug: {
        schema: "helix.workflow_demo_debug.v1",
        current_turn_event_count: 3,
        run_event_count: 8,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
  });

  it("resolves debug-copy backend-entrypoint misses as typed failure before stale sidecar text can answer", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(async (input: unknown) => {
        fetchCalls.push(String(input));
        return {
          ok: false,
          status: 404,
          json: vi.fn(async () => ({})),
        } as unknown as Response;
      }),
    });

    try {
      expect(buildHelixAskBackendTurnDebugExportRef("chat:ask:moral-copy")).toEqual({
        endpoint: "/api/agi/ask/turn/ask%3Amoral-copy/debug-export",
        turn_id: "ask:moral-copy",
      });
      const resolved = await resolveHelixAskAuthoritativeDebugExportPayload(JSON.stringify({
        schema: "helix.ask.debug_export.v1",
        active_turn_id: "ask:moral-copy",
        selected_final_answer: "stale scientific sidecar text",
        visible_final_answer: "stale scientific sidecar text",
        final_answer_source: "scholarly_pdf_workbench_state",
        terminal_artifact_kind: "scientific_image_evidence",
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        ask_entrypoint_failure_code: "backend_ask_entry_required",
        source_target_intent: {
          target_source: "moral_graph",
          target_kind: "moral_graph_reflection",
        },
      }));
      const parsed = JSON.parse(resolved);

      expect(fetchCalls).toEqual(["/api/agi/ask/turn/ask%3Amoral-copy/debug-export"]);
      expect(copyHelixAskDebugPayloadToClipboard).toBeTypeOf("function");
      expect(parsed).toMatchObject({
        selected_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
        visible_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "backend_ask_entry_required",
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        first_broken_rail: "backend_ask_entrypoint",
        repair_target: "prompt_submit_entrypoint",
      });
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
  });

  it("keeps a rendered typed failure aligned with the visible turn instead of a stale repo fallback", () => {
    const visibleFailure =
      "I could not complete this turn because a tool observation required a follow-up model answer step, but no later terminal answer artifact was available.";
    const staleRepoFailure =
      "I cannot answer repository or codebase content from this turn because no repo.search observation packet was materialized.";
    const exported = JSON.parse(buildHelixDebugExportEnvelopeFromMasterPayload({
      id: "client:scholarly-reentry",
      question: "Use scholarly-research.lookup_papers for quantum inequality sampling constraints.",
      content: visibleFailure,
    }, {
      debug_export_source: "rendered_reply_dom",
      debug_export_rebuild_reason: "rendered_button_scope",
      selectedDebugFinalAnswer: visibleFailure,
      selected_final_answer: staleRepoFailure,
      terminal_failure_text: staleRepoFailure,
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "post_tool_model_step_missing",
    }));

    expect(exported.selected_final_answer).toBe(visibleFailure);
    expect(exported.selected_final_answer).not.toContain("repo.search observation packet");
    expect(exported.ui_debug_parity_harness).toMatchObject({
      visible_final_answer: visibleFailure,
      selected_final_answer: visibleFailure,
      ui_answer_equals_selected_final_answer: true,
    });
  });

  it("keeps clicked rendered-turn identity above a stale nested terminal authority", () => {
    const selectedTurnId = "ask:dynamic-reflection";
    const selectedClientTurnId = "helix-chat-turn:client:ask:dynamic-reflection";
    const selectedQuestion = "Compile the dynamic theory reflection request.";
    const selectedFailure =
      "I could not complete this turn because a tool observation required a follow-up model answer step, but no later terminal answer artifact was available.";
    const staleScholarlyAnswer = "Old scholarly-paper answer from another turn.";
    const exported = JSON.parse(buildHelixDebugExportEnvelopeFromMasterPayload({
      id: selectedClientTurnId,
      question: selectedQuestion,
      content: selectedFailure,
    }, {
      debug_export_source: "rendered_reply_dom",
      debug_export_rebuild_reason: "rendered_button_scope",
      active_turn_id: selectedTurnId,
      client_active_turn_id: selectedClientTurnId,
      selectedDebugQuestion: selectedQuestion,
      selectedDebugFinalAnswer: selectedFailure,
      selected_final_answer: selectedFailure,
      terminal_artifact_kind: "typed_failure",
      final_answer_source: "typed_failure",
      terminal_error_code: "post_tool_model_step_missing",
      debug: {
        turn_id: selectedTurnId,
        terminal_artifact_kind: "typed_failure",
        final_answer_source: "typed_failure",
        terminal_error_code: "post_tool_model_step_missing",
        terminal_answer_authority: {
          turn_id: "ask:old-scholarly-paper",
          server_authoritative: true,
          terminal_artifact_kind: "scholarly_research_answer",
          final_answer_source: "scholarly_research_answer",
          terminal_text_preview: staleScholarlyAnswer,
        },
      },
    }));

    expect(exported.active_turn_id).toBe(selectedTurnId);
    expect(exported.backend_turn_id).toBe(selectedTurnId);
    expect(exported.client_active_turn_id).toBe(selectedClientTurnId);
    expect(exported.active_prompt).toBe(selectedQuestion);
    expect(exported.selected_final_answer).toBe(selectedFailure);
    expect(exported.selected_final_answer).not.toBe(staleScholarlyAnswer);
    expect(exported.resolved_turn_summary).toMatchObject({
      turn_id: selectedTurnId,
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "post_tool_model_step_missing",
    });
  });

  it("owns legacy turn control button state projection without side effects", () => {
    const latestTurnBinding = buildHelixAskLatestTurnBinding({
      replyId: "reply-latest",
      latestReplyId: "reply-latest",
      finalAnswerText: "Visible final.",
    });

    expect(buildHelixAskLegacyTurnControlViewModel({
      latestTurnBinding,
      showDebugCopy: true,
      browserAvailable: false,
      readAloudState: "playing",
    })).toEqual({
      showDebugCopy: true,
      debugCopyDisabled: true,
      copyFinalTestId: "helix-ask-latest-copy-final",
      debugCopyTestId: "helix-ask-latest-debug-copy",
      readAloudTestId: "helix-ask-latest-read-aloud",
      readAloudActive: true,
      readAloudState: "playing",
      readAloudAriaLabel: "Pause read-aloud",
      readAloudTitle: "Pause read-aloud",
    });

    expect(buildHelixAskLegacyTurnControlViewModel({
      latestTurnBinding,
      showDebugCopy: false,
      browserAvailable: true,
      readAloudState: "unavailable",
    })).toEqual({
      showDebugCopy: false,
      debugCopyDisabled: false,
      copyFinalTestId: "helix-ask-latest-copy-final",
      debugCopyTestId: "helix-ask-latest-debug-copy",
      readAloudTestId: "helix-ask-latest-read-aloud",
      readAloudActive: false,
      readAloudState: "unavailable",
      readAloudAriaLabel: "Read aloud unavailable",
      readAloudTitle: "Read aloud unavailable",
    });

    const oldTurnBinding = buildHelixAskLatestTurnBinding({
      replyId: "reply-old",
      latestReplyId: "reply-latest",
      finalAnswerText: "Old final.",
    });
    expect(buildHelixAskLegacyTurnControlViewModel({
      latestTurnBinding: oldTurnBinding,
      showDebugCopy: true,
      browserAvailable: true,
      readAloudState: null,
    })).toEqual({
      showDebugCopy: true,
      debugCopyDisabled: false,
      copyFinalTestId: undefined,
      debugCopyTestId: undefined,
      readAloudTestId: undefined,
      readAloudActive: false,
      readAloudState: "idle",
      readAloudAriaLabel: "Read aloud",
      readAloudTitle: "Read aloud",
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const controlsSource = read("client/src/components/helix/ask-console/HelixAskLegacyTurnControls.ts");
    expect(legacyPill).toContain("buildHelixAskLegacyTurnControlViewModel({");
    expect(controlsSource).toContain("export function buildHelixAskLegacyTurnControlViewModel");
    for (const forbidden of [
      "navigator.clipboard",
      "SpeechSynthesisUtterance",
      "AudioContext",
      "fetch(",
      "copyDebugPayloadToClipboard",
      "resolveAuthoritativeDebugExportPayload",
      "runAskTurn",
      "runAskTurnStream",
    ]) {
      expect(controlsSource).not.toContain(forbidden);
    }
  });

  it("owns structured workstation success projection without final-prose scraping", () => {
    const successfulRows = [
      {
        key: "request",
        role: "assistant",
        label: "Tool Request",
        text: "Tool request: scientific-calculator.solve_expression",
        meta: "workstation_gateway | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "observation",
        role: "tool",
        label: "Tool Observation",
        text: "Tool observation: scientific-calculator.solve_expression observed expression 8*9 result 72",
        meta: "scientific-calculator.solve_expression | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "reentry",
        role: "assistant",
        label: "Model Re-entry",
        text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
        meta: "workstation_gateway | reentry | completed",
        status: "completed",
      },
      {
        key: "heartbeat",
        role: "agent",
        label: "Thinking",
        text: "Backend Ask runtime is still running (5s).",
        meta: "reasoning | backend_ask_runtime | running",
        status: "running",
      },
      {
        key: "final",
        role: "assistant",
        label: "Final",
        text: "Observed expression: 8*9\nResult: 72",
        meta: "terminal | final",
        status: "completed",
      },
    ];

    expect(hasSuccessfulWorkstationTerminalTranscriptRows(successfulRows)).toBe(true);
    expect(resolveHelixAskConsoleFinalAnswerSourceLabel({
      rawFinalAnswerSourceLabel: "typed failure",
      turnTranscriptRows: successfulRows,
    })).toBe("workstation tool evaluation");
    expect(resolveHelixAskConsoleFinalAnswerSourceLabel({
      rawFinalAnswerSourceLabel: "typed failure",
      turnTranscriptRows: [
        {
          key: "final-only",
          role: "assistant",
          label: "Final",
          text: "Observed expression: 8*9\nResult: 72",
          meta: "terminal | final",
          status: "completed",
        },
      ],
    })).toBe("typed failure");

    const structuredCalculatorRows = buildHelixTurnTranscriptRows({
      id: "reply-codex-structured-gateway",
      turn_id: "turn-codex-structured-gateway",
      content: "Observed expression: 8*9\nResult: 72",
      debug: {
        turn_id: "turn-codex-structured-gateway",
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: no workstation observation packet was available for this Codex turn.",
            source_event_type: "model_reentry",
          },
        ],
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "scientific-calculator.solve_expression",
            mode: "read",
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              admission_status: "admitted",
            },
            observation: {
              expression: "8*9",
              result: "72",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-structured-gateway",
              capability_key: "scientific-calculator.solve_expression",
              status: "succeeded",
              observation_summary: "8*9 = 72",
            },
          },
        ],
      },
    });
    const structuredCalculatorText = structuredCalculatorRows.map((row) => `${row.label}: ${row.text}`).join("\n");
    expect(structuredCalculatorText).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(structuredCalculatorText).toContain("Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.");
    expect(structuredCalculatorText).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(structuredCalculatorText).not.toContain("no workstation observation packet was available");
    expect(selectHelixAskConsoleWorkstationTraceRows(structuredCalculatorRows).map((row) => row.label)).toEqual([
      "Tool Request",
      "Tool Observation",
      "Model Re-entry",
    ]);

    const proseOnlyRows = buildHelixTurnTranscriptRows({
      id: "reply-prose-only",
      content: "Observed expression: 8*9\nResult: 72",
      debug: {
        turn_id: "turn-prose-only",
        agent_runtime: "codex",
      },
    });
    expect(proseOnlyRows).toEqual([]);
    expect(selectHelixAskConsoleWorkstationTraceRows(proseOnlyRows)).toEqual([]);

    const noObservationRows = buildHelixTurnTranscriptRows({
      id: "reply-codex-no-observation",
      debug: {
        agent_runtime: "codex",
        workstation_gateway_call_results: [
          {
            ok: false,
            capability_id: "scientific-calculator.solve_expression",
            mode: "read",
            error: "calculator_gateway_solve_observation_missing",
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              admission_status: "blocked",
              blocked_reason: "calculator_gateway_solve_observation_missing",
            },
            observation_packet: {
              capability_key: "scientific-calculator.solve_expression",
              status: "blocked",
              observation_summary: "calculator_gateway_solve_observation_missing",
            },
          },
        ],
      },
    });
    const noObservationText = noObservationRows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(noObservationText).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(noObservationText).toContain(
      "Tool observation: scientific-calculator.solve_expression blocked calculator_gateway_solve_observation_missing.",
    );
    expect(noObservationText).not.toContain("Codex received the workstation observation packet");
    expect(hasSuccessfulWorkstationTerminalTranscriptRows(noObservationRows)).toBe(false);
    expect(resolveHelixAskConsoleFinalAnswerSourceLabel({
      rawFinalAnswerSourceLabel: "typed failure",
      turnTranscriptRows: noObservationRows,
    })).toBe("typed failure");

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    expect(legacyPill).toContain("resolveHelixAskConsoleFinalAnswerSourceLabel");
  });

  it("owns provider and model metadata projection as a pure runtime-display helper", () => {
    expect(
      resolveHelixAskActualAgentProviderLabel({
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
      }),
    ).toBe("Provider: Codex Workstation Mode");
    expect(
      resolveHelixAskModelUsageLabel({
        debug: {
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          codex_args: ["exec", "--sandbox", "read-only"],
        },
      }),
    ).toBe("Model: not reported by backend");

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");
    const runtimeDisplay = read("client/src/lib/helix/ask-agent-runtime-display.ts");

    expect(legacyPill).toContain("resolveHelixAskActualAgentProviderLabel(reply, agentRuntimeProviders)");
    expect(legacyPill).toContain("resolveHelixAskModelUsageLabel(reply)");
    expect(legacyPill).toContain("actualAgentProviderLabel");
    expect(legacyPill).toContain("actualAgentModelLabel");
    expect(turnStreamPanel).toContain("actualAgentProviderLabel");
    expect(turnStreamPanel).toContain("actualAgentModelLabel");
    expect(turnStreamPanel).toContain("formatHelixAskFinalReceiptMeta");
    expect(turnStreamPanel).toContain("isFinalRow ? actualAgentProviderLabel : null");
    expect(turnStreamPanel).toContain("isFinalRow ? actualAgentModelLabel : null");

    for (const forbidden of [
      "fetch(",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "runAskTurn",
      "runAskTurnStream",
      "terminal_authority",
    ]) {
      expect(runtimeDisplay).not.toContain(forbidden);
    }
  });

  it("projects read-aloud chunk traffic as a non-authoritative final-answer reticle", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const readAloudTrafficState = read(
      "client/src/components/helix/ask-console/HelixAskReadAloudTrafficState.ts",
    );
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");
    const finalAnswerSource = read("client/src/components/helix/ask-console/HelixAskFinalAnswer.tsx");
    const readAloudDisplay = read("client/src/lib/helix/ask-read-aloud-display.ts");

    expect(readAloudDisplay).toContain("export function resolveReadAloudRegionTrafficState");
    expect(readAloudDisplay).toContain("chunk_synth_start");
    expect(readAloudDisplay).toContain("chunk_play_start");
    expect(readAloudDisplay).toContain("READ_ALOUD_COMPLETED_CHUNK_TRAFFIC_LINGER_MS");
    expect(readAloudDisplay).toContain("\"preloading\"");
    expect(readAloudDisplay).toContain("chunkText");
    expect(readAloudTrafficState).toContain("export function buildHelixAskReadAloudTrafficState");
    expect(readAloudTrafficState).toContain("resolveReadAloudRegionTrafficState(input)");
    expect(legacyPill).toContain("buildHelixAskReadAloudTrafficState({");
    expect(legacyPill).not.toContain("resolveReadAloudRegionTrafficState({");
    expect(legacyPill).toContain("events: voiceLaneTimelineEvents");
    expect(legacyPill).toContain("readAloudTraffic");
    expect(legacyPill).toContain("text: chunk.text");
    expect(legacyPill).toContain("text: nextChunk.text");
    expect(legacyPill).toContain('utterance.kind === "manual_read_aloud"');
    expect(legacyPill).toContain("replyId: utterance.replyId ?? null");
    expect(turnStreamPanel).toContain("renderFinalAnswer(readAloudTraffic)");
    expect(turnStreamPanel).not.toContain("HelixAskReadAloudRegionReticle");
    expect(finalAnswerSource).toContain("resolveHelixAskFinalAnswerReadAloudBlockKey");
    expect(finalAnswerSource).toContain("HelixAskReadAloudBlockReticle");
    expect(finalAnswerSource).toContain("HelixAskReadAloudInlineReticle");
    expect(finalAnswerSource).toContain("readAloudTraffic.regions");
    expect(finalAnswerSource).toContain("border-violet-200/85");
    expect(finalAnswerSource).toContain("border-2 border-dotted");
    expect(finalAnswerSource).toContain("data-helix-read-aloud-region-state");
    expect(finalAnswerSource).toContain("data-helix-read-aloud-chunk-index");
    expect(finalAnswerSource).toContain("data-helix-read-aloud-chunk-count");
    expect(turnStreamPanel).not.toContain("speechSynthesis");
    expect(turnStreamPanel).not.toContain("AudioContext");
    expect(turnStreamPanel).not.toContain("fetch(");
  });

  it("owns final-answer block rendering policy without UI clipping", () => {
    const longLine = `Long answer: ${"0123456789abcdef".repeat(320)}`;

    expect(buildHelixAskFinalAnswerBlocks(longLine)).toEqual([
      {
        kind: "line",
        key: "final-answer-line-0",
        text: longLine,
        segments: [
          {
            key: "final-answer-line-0-segment-0",
            text: longLine,
          },
        ],
        isSectionHeader: false,
      },
    ]);
    expect(buildHelixAskFinalAnswerBlocks("Summary:\n- NHM2 remains bounded.\n\nDone.")).toEqual([
      {
        kind: "line",
        key: "final-answer-line-0",
        text: "Summary:",
        segments: [
          {
            key: "final-answer-line-0-segment-0",
            text: "Summary:",
          },
        ],
        isSectionHeader: true,
      },
      {
        kind: "bullet",
        key: "final-answer-bullet-1",
        text: "NHM2 remains bounded.",
        segments: [
          {
            key: "final-answer-bullet-1-segment-0",
            text: "NHM2 remains bounded.",
          },
        ],
      },
      {
        kind: "blank",
        key: "final-answer-blank-2",
      },
      {
        kind: "line",
        key: "final-answer-line-3",
        text: "Done.",
        segments: [
          {
            key: "final-answer-line-3-segment-0",
            text: "Done.",
          },
        ],
        isSectionHeader: false,
      },
    ]);
    expect(buildHelixAskFinalAnswerBlocks(
      [
        "The prior evidence only supports `partial_candidate`.",
        "",
        "```latex",
        "S[\\varphi, g] = -\\frac{1}{2} \\int d^Dx \\sqrt{-g} \\varphi \\left[ \\Box + \\xi R \\right] \\varphi,",
        "```",
        "",
        "with a concrete page image `source_id`.",
      ].join("\n"),
    )).toEqual([
      {
        kind: "line",
        key: "final-answer-line-0",
        text: "The prior evidence only supports `partial_candidate`.",
        segments: [
          {
            key: "final-answer-line-0-segment-0",
            text: "The prior evidence only supports `partial_candidate`.",
          },
        ],
        isSectionHeader: false,
      },
      {
        kind: "blank",
        key: "final-answer-blank-1",
      },
      {
        kind: "code",
        key: "final-answer-code-2",
        language: "latex",
        text: "S[\\varphi, g] = -\\frac{1}{2} \\int d^Dx \\sqrt{-g} \\varphi \\left[ \\Box + \\xi R \\right] \\varphi,",
      },
      {
        kind: "blank",
        key: "final-answer-blank-5",
      },
      {
        kind: "line",
        key: "final-answer-line-6",
        text: "with a concrete page image `source_id`.",
        segments: [
          {
            key: "final-answer-line-6-segment-0",
            text: "with a concrete page image `source_id`.",
          },
        ],
        isSectionHeader: false,
      },
    ]);
    const providerMarkdownMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: [
          "The prior evidence only supports `partial_candidate`.",
          "",
          "```latex",
          "S[\\varphi, g] = -\\frac{1}{2} \\int d^Dx \\sqrt{-g} \\varphi \\left[ \\Box + \\xi R \\right] \\varphi,",
          "```",
          "",
          "with a concrete page image `source_id`.",
        ].join("\n"),
      }),
    );
    expect(providerMarkdownMarkup).toContain("data-testid=\"helix-ask-final-answer-code-block\"");
    expect(providerMarkdownMarkup).toContain("data-code-language=\"latex\"");
    expect(providerMarkdownMarkup).toContain("data-code-renderer=\"katex\"");
    expect(providerMarkdownMarkup).toContain("class=\"katex");
    expect(providerMarkdownMarkup).toContain("partial_candidate</code>");
    expect(providerMarkdownMarkup).toContain("source_id</code>");
    expect(providerMarkdownMarkup).toContain("S[\\varphi, g] = -\\frac{1}{2} \\int d^Dx");
    const decimalInlineCodeBullet =
      "- Its current local campaign frontier records a diagnostic pass for the `alpha = 0.7` observer-compatible source profile, while the longstanding clocking anchor remains `alpha = 0.995`.";
    expect(buildHelixAskFinalAnswerBlocks(decimalInlineCodeBullet)[0]).toMatchObject({
      kind: "bullet",
      text: decimalInlineCodeBullet.slice(2),
      segments: [
        {
          key: "final-answer-bullet-0-segment-0",
          text: decimalInlineCodeBullet.slice(2),
        },
      ],
    });
    const decimalInlineCodeMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: decimalInlineCodeBullet,
      }),
    );
    expect(decimalInlineCodeMarkup).toContain("Its current local campaign frontier records a diagnostic pass");
    expect(decimalInlineCodeMarkup).toContain("alpha = 0.7</code>");
    expect(decimalInlineCodeMarkup).toContain("while the longstanding clocking anchor remains");
    expect(decimalInlineCodeMarkup).toContain("alpha = 0.995</code>");
    const rawCodeFallbackMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: [
          "```json",
          "{\"status\":\"partial_candidate\"}",
          "```",
        ].join("\n"),
      }),
    );
    expect(rawCodeFallbackMarkup).toContain("data-code-language=\"json\"");
    expect(rawCodeFallbackMarkup).toContain("data-code-renderer=\"raw\"");
    expect(rawCodeFallbackMarkup).toContain("{&quot;status&quot;:&quot;partial_candidate&quot;}");
    expect(buildHelixAskFinalAnswerBlocks(
      "I cannot answer from the paper I found earlier because no prior scholarly evidence packet was recoverable for this turn. Ask me to rerun the scholarly lookup, provide a DOI/arXiv id, or refer to a specific paper title so Helix can create bounded paper evidence first.",
    )[0]).toMatchObject({
      kind: "line",
      key: "final-answer-line-0",
      segments: [
        {
          key: "final-answer-line-0-segment-0",
          text: "I cannot answer from the paper I found earlier because no prior scholarly evidence packet was recoverable for this turn.",
        },
        {
          key: "final-answer-line-0-segment-1",
          text: "Ask me to rerun the scholarly lookup, provide a DOI/arXiv id, or refer to a specific paper title so Helix can create bounded paper evidence first.",
        },
      ],
    });
    expect(resolveHelixAskFinalAnswerReadAloudBlockKey(
      buildHelixAskFinalAnswerBlocks("Summary:\n- NHM2 remains bounded.\n\nDone."),
      {
        active: true,
        phase: "reading",
        label: "Reading aloud",
        detail: "chunk 2/3",
        chunkIndex: 1,
        chunkCount: 3,
        chunkText: "NHM2 remains bounded.",
      },
    )).toBe("final-answer-bullet-1-segment-0");
    expect(resolveHelixAskFinalAnswerReadAloudBlockKey(
      buildHelixAskFinalAnswerBlocks("First section is loading. Second section waits."),
      {
        active: true,
        phase: "loading",
        label: "Loading read-aloud",
        detail: null,
        chunkIndex: null,
        chunkCount: null,
        chunkText: null,
      },
    )).toBe("final-answer-line-0-segment-0");
    expect(resolveHelixAskFinalAnswerReadAloudBlockKey(
      buildHelixAskFinalAnswerBlocks("First section is playing. Second section waits."),
      {
        active: true,
        phase: "reading",
        label: "Reading aloud",
        detail: null,
        chunkIndex: null,
        chunkCount: null,
        chunkText: null,
      },
    )).toBeNull();
    expect(resolveHelixAskFinalAnswerReadAloudBlockKeys(
      buildHelixAskFinalAnswerBlocks("First section is bundled. Second section is bundled."),
      {
        active: true,
        phase: "reading",
        label: "Reading aloud",
        detail: "chunk 1/1",
        chunkIndex: 0,
        chunkCount: 1,
        chunkText: "First section is bundled. Second section is bundled.",
      },
    )).toEqual([
      "final-answer-line-0-segment-0",
      "final-answer-line-0-segment-1",
    ]);
    const bundledChunkReadAloudMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: "First section is bundled. Second section is bundled.",
        readAloudTraffic: {
          active: true,
          phase: "reading",
          label: "Reading aloud",
          detail: "chunk 1/1",
          chunkIndex: 0,
          chunkCount: 1,
          chunkText: "First section is bundled. Second section is bundled.",
        },
      }),
    );
    expect(bundledChunkReadAloudMarkup.match(/data-testid="helix-ask-read-aloud-region-reticle"/g)?.length).toBe(2);
    expect(bundledChunkReadAloudMarkup).toContain(">First section is bundled.<");
    expect(bundledChunkReadAloudMarkup).toContain(">Second section is bundled.<");
    const multiRegionReadAloudMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: "The first sentence is being read. The second sentence is being prepared.",
        readAloudTraffic: {
          active: true,
          phase: "reading",
          label: "Reading aloud",
          detail: "chunk 1/2",
          chunkIndex: 0,
          chunkCount: 2,
          chunkText: "The first sentence is being read.",
          regions: [
            {
              active: true,
              phase: "reading",
              label: "Reading aloud",
              detail: "chunk 1/2",
              chunkIndex: 0,
              chunkCount: 2,
              chunkText: "The first sentence is being read.",
            },
            {
              active: true,
              phase: "preloading",
              label: "Preloading next read-aloud chunk",
              detail: "chunk 2/2",
              chunkIndex: 1,
              chunkCount: 2,
              chunkText: "The second sentence is being prepared.",
            },
          ],
        },
      }),
    );
    expect(multiRegionReadAloudMarkup.match(/data-testid="helix-ask-read-aloud-region-reticle"/g)?.length).toBe(2);
    expect(multiRegionReadAloudMarkup).toContain("data-helix-read-aloud-region-state=\"reading\"");
    expect(multiRegionReadAloudMarkup).toContain("data-helix-read-aloud-region-state=\"preloading\"");
    expect(multiRegionReadAloudMarkup).toContain("The first sentence is being read.");
    expect(multiRegionReadAloudMarkup).toContain("The second sentence is being prepared.");
    const loadingReadAloudMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: "First section is loading. Second section waits.",
        readAloudTraffic: {
          active: true,
          phase: "loading",
          label: "Loading read-aloud",
          detail: null,
          chunkIndex: null,
          chunkCount: null,
          chunkText: null,
        },
      }),
    );
    expect(loadingReadAloudMarkup.match(/data-testid="helix-ask-read-aloud-region-reticle"/g)?.length).toBe(1);
    expect(loadingReadAloudMarkup).toContain("data-helix-read-aloud-region-state=\"loading\"");
    expect(loadingReadAloudMarkup).toContain(">First section is loading.<");
    expect(loadingReadAloudMarkup).not.toContain("Loading read-aloudFirst section is loading. Second section waits.");
    const metadataLessReadingMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: "First section is playing. Second section waits.",
        readAloudTraffic: {
          active: true,
          phase: "reading",
          label: "Reading aloud",
          detail: null,
          chunkIndex: null,
          chunkCount: null,
          chunkText: null,
        },
      }),
    );
    expect(metadataLessReadingMarkup).not.toContain("data-testid=\"helix-ask-read-aloud-region-reticle\"");
    expect(metadataLessReadingMarkup).not.toContain("data-helix-read-aloud-region-state=\"reading\"");
    expect(metadataLessReadingMarkup).toContain("First section is playing.");
    expect(metadataLessReadingMarkup).toContain("Second section waits.");
    const unresolvedReadAloudMarkup = renderToStaticMarkup(
      React.createElement(HelixAskFinalAnswer, {
        text: "No chunk metadata was available.",
        readAloudTraffic: {
          active: true,
          phase: "paused",
          label: "Read-aloud paused",
          detail: null,
          chunkIndex: null,
          chunkCount: null,
          chunkText: null,
        },
      }),
    );
    expect(unresolvedReadAloudMarkup).not.toContain("data-testid=\"helix-ask-read-aloud-region-reticle\"");
    expect(unresolvedReadAloudMarkup).not.toContain("data-helix-read-aloud-region-state=\"paused\"");
    expect(unresolvedReadAloudMarkup).toContain("No chunk metadata was available.");

    const finalAnswerSource = read("client/src/components/helix/ask-console/HelixAskFinalAnswer.tsx");
    expect(finalAnswerSource).toContain("buildHelixAskFinalAnswerBlocks");
    expect(finalAnswerSource).toContain("data-narrator-source-id");
    expect(finalAnswerSource).toContain("[overflow-wrap:anywhere]");
    expect(finalAnswerSource).toContain("break-words");
    expect(finalAnswerSource).not.toMatch(/\b(?:line-clamp|max-h-|overflow-hidden|truncate|text-ellipsis|whitespace-nowrap)\b/);
    for (const forbidden of ["clipText(", "slice(", "substring("]) {
      expect(finalAnswerSource).not.toContain(forbidden);
    }

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const answerRendering = read("client/src/lib/helix/ask-answer-rendering.ts");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");
    const calculatorPanelLaunchSurface = read("client/src/components/helix/ask-console/HelixAskCalculatorPanelLaunchSurface.tsx");
    const envelopeAnswerSurface = read("client/src/components/helix/ask-console/HelixAskEnvelopeAnswerSurface.tsx");
    const envelopeSectionsSurface = read("client/src/components/helix/ask-console/HelixAskEnvelopeSectionsSurface.tsx");
    const envelopeSupplementSurface = read("client/src/components/helix/ask-console/HelixAskEnvelopeSupplementSurface.tsx");
    const finalAnswerSurfaceSource = read("client/src/components/helix/ask-console/HelixAskFinalAnswerSurface.tsx");
    const inlineCodeSurface = read("client/src/components/helix/ask-console/HelixAskInlineCodeSurface.tsx");
    const mathHtmlSurface = read("client/src/components/helix/ask-console/HelixAskMathHtmlSurface.tsx");
    const renderedContentSurface = read("client/src/components/helix/ask-console/HelixAskRenderedContentSurface.tsx");
    const pathLinkedTextSurface = read("client/src/components/helix/ask-console/HelixAskPathLinkedTextSurface.tsx");
    const contentRenderers = read("client/src/components/helix/ask-console/HelixAskLegacyContentRenderers.tsx");
    const answerEnvelopeSlot = read("client/src/components/helix/ask-console/HelixAskLegacyAnswerEnvelopeSlot.tsx");
    const plainAnswerSurface = read("client/src/components/helix/ask-console/HelixAskPlainAnswerSurface.tsx");
    expect(legacyPill).not.toContain("<HelixAskCalculatorPanelLaunchSurface");
    expect(legacyPill).not.toContain("<HelixAskEnvelopeAnswerSurface");
    expect(legacyPill).not.toContain("<HelixAskEnvelopeSectionsSurface");
    expect(legacyPill).not.toContain("<HelixAskEnvelopeSupplementSurface");
    expect(legacyPill).not.toContain("<HelixAskFinalAnswerSurface");
    expect(legacyPill).not.toContain("<HelixAskRenderedContentSurface");
    expect(legacyPill).not.toContain("<HelixAskLegacyAnswerEnvelopeSlot");
    expect(legacyPill).toContain("useHelixAskLegacyContentRenderers");
    expect(legacyPill).toContain("renderHelixAskPlainAnswerEnvelope({");
    expect(legacyPill).toContain("renderHelixAskResponseEnvelope({");
    expect(legacyPill).not.toContain("<HelixAskInlineCodeSurface");
    expect(legacyPill).not.toContain("<HelixAskMathHtmlSurface");
    expect(legacyPill).not.toContain("<HelixAskPlainAnswerSurface");
    expect(legacyPill).not.toContain("const inlineCodeSegments = splitHelixAskInlineCodeTextSegments");
    expect(legacyPill).not.toContain("for (const segment of splitHelixAskTextPathSegments(text))");
    expect(legacyPill).not.toContain("<HelixAskPathLinkedTextSurface");
    expect(legacyPill).not.toContain("HELIX_ASK_PATH_REGEX");
    expect(legacyPill).not.toContain("codeSpanMatches");
    expect(legacyPill).not.toContain("matchAll(/`([^`\\n]+)`/g)");
    expect(legacyPill).not.toContain("text-sky-300 underline underline-offset-2 hover:text-sky-200");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskFinalAnswer"');
    expect(legacyPill).toContain("renderContent: renderHelixAskContent");
    expect(legacyPill).not.toContain("blocks.map((block)");
    expect(legacyPill).not.toContain("parseHelixAskFinalAnswerBulletLine");
    expect(legacyPill).not.toContain("mx-0.5 rounded border border-slate-700");
    expect(inlineCodeSurface).toContain("export function HelixAskInlineCodeSurface");
    expect(inlineCodeSurface).toContain("mx-0.5 rounded border border-slate-700");
    expect(inlineCodeSurface).not.toContain("tokenizeHelixAskMathTokens");
    expect(inlineCodeSurface).not.toContain("splitHelixAskInlineCodeTextSegments");
    expect(mathHtmlSurface).toContain("export function HelixAskMathHtmlSurface");
    expect(mathHtmlSurface).toContain("dangerouslySetInnerHTML");
    expect(mathHtmlSurface).toContain("inline-block align-middle text-slate-100");
    expect(mathHtmlSurface).not.toContain("renderKatexToString");
    expect(mathHtmlSurface).not.toContain("tokenizeHelixAskMathTokens");
    expect(renderedContentSurface).toContain("export function HelixAskRenderedContentSurface");
    expect(renderedContentSurface).toContain("splitHelixAskInlineCodeTextSegments");
    expect(renderedContentSurface).toContain("tokenizeHelixAskMathTokens");
    expect(renderedContentSurface).toContain("renderKatexToString");
    expect(renderedContentSurface).toContain("<HelixAskInlineCodeSurface");
    expect(renderedContentSurface).toContain("<HelixAskMathHtmlSurface");
    expect(renderedContentSurface).not.toContain("openPanelById");
    expect(renderedContentSurface).not.toContain("resolvePanelIdFromPath");
    expect(pathLinkedTextSurface).toContain("export function HelixAskPathLinkedTextSurface");
    expect(pathLinkedTextSurface).toContain("splitHelixAskTextPathSegments");
    expect(pathLinkedTextSurface).toContain("<button");
    expect(pathLinkedTextSurface).toContain("text-sky-300 underline underline-offset-2 hover:text-sky-200");
    expect(pathLinkedTextSurface).not.toContain("resolvePanelIdFromPath");
    expect(pathLinkedTextSurface).not.toContain("openPanelById");
    expect(pathLinkedTextSurface).not.toContain("getPanelDef");
    expect(pathLinkedTextSurface).not.toContain("navigator.clipboard");
    expect(contentRenderers).toContain("export function useHelixAskLegacyContentRenderers");
    expect(contentRenderers).toContain("<HelixAskPathLinkedTextSurface");
    expect(contentRenderers).toContain("<HelixAskRenderedContentSurface");
    expect(contentRenderers).toContain("<HelixAskLegacyAnswerEnvelopeSlot");
    expect(contentRenderers).toContain("renderPlainAnswerEnvelope");
    expect(contentRenderers).toContain("renderResponseEnvelope");
    expect(contentRenderers).not.toContain("resolvePanelIdFromPath");
    expect(contentRenderers).not.toContain("getPanelDef");
    expect(contentRenderers).not.toContain("openPanelById");
    expect(contentRenderers).not.toContain("navigator.clipboard");
    expect(answerEnvelopeSlot).toContain("export function HelixAskLegacyAnswerEnvelopeSlot");
    expect(answerEnvelopeSlot).toContain("<HelixAskPlainAnswerSurface");
    expect(answerEnvelopeSlot).toContain("<HelixAskEnvelopeAnswerSurface");
    expect(answerEnvelopeSlot).toContain("<HelixAskEnvelopeSectionsSurface");
    expect(answerEnvelopeSlot).toContain("<HelixAskEnvelopeSupplementSurface");
    expect(answerEnvelopeSlot).toContain("<HelixAskFinalAnswerSurface");
    expect(answerEnvelopeSlot).toContain("<HelixAskCalculatorPanelLaunchSurface");
    expect(answerEnvelopeSlot).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(answerEnvelopeSlot).not.toContain("setAskExtensionOpenByReply");
    expect(answerEnvelopeSlot).not.toContain("openPanelById");
    expect(answerEnvelopeSlot).not.toContain("navigator.clipboard");
    expect(answerEnvelopeSlot).not.toContain("speechSynthesis");
    expect(legacyPill).not.toContain("dangerouslySetInnerHTML={{ __html: katexHtml }}");
    expect(plainAnswerSurface).toContain("export function HelixAskPlainAnswerSurface");
    expect(plainAnswerSurface).toContain("whitespace-pre-wrap leading-relaxed");
    expect(plainAnswerSurface).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(plainAnswerSurface).not.toContain("openPanelById");
    expect(calculatorPanelLaunchSurface).toContain("export function HelixAskCalculatorPanelLaunchSurface");
    expect(calculatorPanelLaunchSurface).toContain("Open Calculator Panel");
    expect(calculatorPanelLaunchSurface).not.toContain("openPanelById");
    expect(calculatorPanelLaunchSurface).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(envelopeAnswerSurface).toContain("export function HelixAskEnvelopeAnswerSurface");
    expect(envelopeAnswerSurface).toContain("space-y-3");
    expect(envelopeAnswerSurface).not.toContain("setAskExtensionOpenByReply");
    expect(envelopeAnswerSurface).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(legacyPill).not.toContain(">Open Calculator Panel<");
    expect(legacyPill).not.toContain("sections.map((section, index)");
    expect(envelopeSectionsSurface).toContain("export function HelixAskEnvelopeSectionsSurface");
    expect(envelopeSectionsSurface).toContain("sections.map((section, index)");
    expect(envelopeSectionsSurface).not.toContain("askExtensionOpenByReply");
    expect(envelopeSectionsSurface).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(envelopeSectionsSurface).not.toContain("openPanelById");
    expect(envelopeSupplementSurface).toContain("export function HelixAskEnvelopeSupplementSurface");
    expect(envelopeSupplementSurface).toContain("Expand With Retrieved Evidence");
    expect(envelopeSupplementSurface).toContain("<details");
    expect(envelopeSupplementSurface).not.toContain("setAskExtensionOpenByReply");
    expect(envelopeSupplementSurface).not.toContain("shouldShowHelixAskCalculatorPanel");
    expect(envelopeSupplementSurface).not.toContain("openPanelById");
    expect(legacyPill).not.toContain("Hide Additional Repo Context");
    expect(legacyPill).not.toContain("<summary className=\"cursor-pointer text-[10px] uppercase tracking-[0.22em] text-slate-400\">");
    expect(answerRendering).toContain("export function splitHelixAskInlineCodeTextSegments");
    expect(answerRendering).toContain("export function splitHelixAskTextPathSegments");
    expect(finalAnswerSurfaceSource).toContain("export function HelixAskFinalAnswerSurface");
    expect(finalAnswerSurfaceSource).toContain("<HelixAskFinalAnswer {...props} />");
    expect(finalAnswerSurfaceSource).not.toContain("renderHelixAskContent");
    expect(finalAnswerSurfaceSource).not.toContain("selectHelixAskLegacyFinalAnswerText");
    expect(finalAnswerSurfaceSource).not.toContain("terminal");
    expect(finalAnswerSurfaceSource).not.toContain("navigator.clipboard");
    expect(finalAnswerSurfaceSource).not.toContain("speechSynthesis");
    expect(turnStreamPanel).toContain("data-final-answer-text={isFinalRow ? finalAnswerRawText : undefined}");
    expect(turnStreamPanel).toContain("const visibleText = isFinalRow ? row.text : clipText");
  });

  it("owns final-row proof trace display while trace selection stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const finalExtras = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("workstation_reasoning_trace");
    expect(legacyPill).toContain("proofTrace: (replyDebugRecord as Record<string, unknown> | null | undefined)");
    expect(legacyPill).not.toContain("<summary className=\"cursor-pointer select-none text-[10px] uppercase tracking-[0.2em] text-amber-200\">");
    expect(legacyPill).not.toContain("trace.compact_steps");
    expect(legacyPill).not.toContain("trace.caveats");

    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain("<HelixAskProofTraceDetails trace={proofTrace} clipText={clipText} />");
    expect(finalExtras).toContain("export function HelixAskProofTraceDetails");
    expect(finalExtras).toContain("if (!record) return null");
    expect(finalExtras).toContain("Proof trace");
    expect(finalExtras).toContain("record.compact_steps");
    expect(finalExtras).toContain("record.caveats");
    expect(finalExtras).toContain("clipText(String(stepRecord?.summary ?? \"\"), 260)");
    expect(finalExtras).not.toContain("replyDebugRecord");
    expect(finalExtras).not.toContain("workstation_reasoning_trace");
  });

  it("owns job-ready link button display while execution stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const finalExtras = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("jobReadyLinks,");
    expect(legacyPill).toContain("onRunJobReadyLink: runJobReadyLink");
    expect(legacyPill).toContain("const jobReadyLinks = resolveHelixAskVisibleJobReadyLinks(reply)");
    expect(legacyPill).toContain("syncDocViewerStateFromWorkstationAction(action)");
    expect(legacyPill).not.toContain("jobReadyLinks.slice(0, 6).map");
    expect(legacyPill).not.toContain("title={`From ${source}`}");

    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain("<HelixAskJobReadyLinkStrip links={jobReadyLinks} onRun={onRunJobReadyLink} />");
    expect(finalExtras).toContain("export function HelixAskJobReadyLinkStrip");
    expect(finalExtras).toContain("if (links.length === 0) return null");
    expect(finalExtras).toContain("links.slice(0, 6).map");
    expect(finalExtras).toContain("onClick={() => onRun(link)}");
    expect(finalExtras).toContain("title={`From ${source}`}");
    expect(finalExtras).not.toContain("resolveHelixAskVisibleJobReadyLinks");
    expect(finalExtras).not.toContain("syncDocViewerStateFromWorkstationAction");
    expect(finalExtras).not.toContain("dispatchHelixWorkstationActions");
  });

  it("owns latest reply status footer display while latest selection stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const replyCard = read("client/src/components/helix/ask-console/HelixAskReplyCard.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const finalExtras = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("promptIngested: reply.promptIngested");
    expect(legacyPill).toContain("const isLatestReply = reply.id === transcriptLatestAskReplyId");
    expect(legacyPill).not.toContain("<HelixAskReplyStatusFooter");
    expect(legacyPill).not.toContain("In Helix Console");
    expect(legacyPill).not.toContain("{reply.promptIngested ? \" | Prompt ingested\" : \"\"}");

    expect(replyTurn).toContain("<HelixAskReplyCard");
    expect(replyCard).toContain("<HelixAskReplyStatusFooter visible={isLatestReply} promptIngested={promptIngested} />");
    expect(replyCard).not.toContain("transcriptLatestAskReplyId");
    expect(replyCard).not.toContain("reply.id");
    expect(finalExtras).toContain("export function HelixAskReplyStatusFooter");
    expect(finalExtras).toContain("if (!visible) return null");
    expect(finalExtras).toContain("In Helix Console");
    expect(finalExtras).toContain("{promptIngested ? \" | Prompt ingested\" : \"\"}");
    expect(finalExtras).not.toContain("transcriptLatestAskReplyId");
    expect(finalExtras).not.toContain("reply.id");
  });

  it("owns live bridge pill display while bridge state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const finalExtras = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("liveBridgeStatus: liveAnswerTurnBridge?.status");
    expect(legacyPill).toContain("readPillClassName: readLiveAnswerTurnBridgePillClassName");
    expect(legacyPill).toContain("liveAnswerTurnBridge = buildLiveAnswerTurnBridgeState");
    expect(legacyPill).not.toContain("row.bridgePills.map");
    expect(legacyPill).not.toContain("pills={row.bridgePills}");
    expect(legacyPill).not.toContain('data-testid={isLatestReply ? "helix-ask-latest-live-turn-bridge" : undefined}');

    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain("<HelixAskLiveBridgePillStrip");
    expect(turnStreamPanel).toContain("pills={row.bridgePills}");
    expect(turnStreamPanel).toContain("status={liveBridgeStatus}");
    expect(finalExtras).toContain("export function HelixAskLiveBridgePillStrip");
    expect(finalExtras).toContain("if (!pills?.length) return null");
    expect(finalExtras).toContain('data-testid={isLatestReply ? "helix-ask-latest-live-turn-bridge" : undefined}');
    expect(finalExtras).toContain("data-live-turn-bridge-status={status ?? undefined}");
    expect(finalExtras).toContain("pills.map((pill)");
    expect(finalExtras).toContain("readPillClassName(pill.tone)");
    expect(finalExtras).not.toContain("buildLiveAnswerTurnBridgeState");
  });

  it("owns disabled Stage Play action button display while action rows stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const finalExtras = read("client/src/components/helix/ask-console/HelixAskFinalExtras.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("stagePlayEvents: stagePlayChatLedgerEvents");
    expect(legacyPill).toContain("stagePlayEventCount: stagePlayChatLedgerEvents.length");
    expect(legacyPill).not.toContain("<HelixAskStagePlayActionButtons");
    expect(legacyPill).not.toContain("row.actions.map");
    expect(legacyPill).not.toContain("Use the Stage Play graph checkpoint controls for this v1 action.");

    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain("<HelixAskStagePlayActionButtons");
    expect(turnStreamPanel).toContain("actions={row.actions}");
    expect(finalExtras).toContain("export function HelixAskStagePlayActionButtons");
    expect(finalExtras).toContain("if (!actions?.length) return null");
    expect(finalExtras).toContain("actions.map((action)");
    expect(finalExtras).toContain("Use the Stage Play graph checkpoint controls for this v1 action.");
    expect(finalExtras).toContain("helix-ask-latest-stage-play-${action.toLowerCase().replace");
    expect(finalExtras).not.toContain("stagePlayChatLedgerEvents");
    expect(finalExtras).not.toContain("buildHelixContinuousTurnStreamRows");
  });

  it("owns structured workstation trace-row admission without final-prose scraping", () => {
    const rows = [
      {
        key: "request",
        role: "assistant",
        label: "Tool Request",
        text: "Tool request: scientific-calculator.solve_expression",
        meta: "workstation_gateway | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "observation",
        role: "tool",
        label: "Tool Observation",
        text: "Tool observation: scientific-calculator.solve_expression observed expression 8*9 result 72",
        meta: "scientific-calculator.solve_expression | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "reentry",
        role: "assistant",
        label: "Model Re-entry",
        text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
        meta: "workstation_gateway | reentry | completed",
        status: "completed",
      },
      {
        key: "final",
        role: "assistant",
        label: "Final",
        text: "Observed expression: 8*9\nResult: 72",
        meta: "terminal | final",
        status: "completed",
      },
    ];

    expect(selectHelixAskConsoleWorkstationTraceRows(rows).map((row) => row.label)).toEqual([
      "Tool Request",
      "Tool Observation",
      "Model Re-entry",
    ]);
    expect(selectHelixAskConsoleTurnTranscriptRowsForStream(rows).map((row) => row.label)).toEqual([
      "Tool Request",
      "Tool Observation",
      "Model Re-entry",
    ]);
    expect(selectHelixAskConsoleTurnTranscriptRowsForStream(rows).map((row) => row.key)).not.toContain("heartbeat");
    expect(selectHelixAskConsoleWorkstationTraceRows([
      {
        key: "final-prose-only",
        role: "assistant",
        label: "Final",
        text: "Tool observation: scientific-calculator.solve_expression observed expression 8*9 result 72",
        meta: "terminal | final",
        status: "completed",
      },
    ])).toEqual([]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    expect(legacyPill).toContain("selectHelixAskConsoleTurnTranscriptRowsForStream");
  });

  it("owns runtime picker labels and menu-vs-cycle view model", () => {
    const model = buildHelixAskRuntimePickerModel({
      selectedRuntime: "codex",
      providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          experimental: false,
          permission_profile: {
            id: "helix-native",
            label: "Helix native governed runtime",
            allows: { observe: true, read: true, act: true, write: false, shell: false, codeMutation: false },
          },
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: true,
          experimental: false,
          permission_profile: {
            id: "read-observe-act",
            label: "Read/observe/action",
            allows: { observe: true, read: true, act: true, write: false, shell: false, codeMutation: false },
          },
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "future",
          label: "Future Agent Wrapper",
          enabled: false,
          experimental: true,
          permission_profile: {
            id: "read-observe",
            label: "Read/observe only",
            allows: { observe: true, read: true, act: false, write: false, shell: false, codeMutation: false },
          },
          supports: { streaming: false, workstationTools: false, codeMutation: false },
        },
      ],
    });

    expect(model.selectedLabel).toBe("Codex");
    expect(model.enabledProviderCount).toBe(2);
    expect(model.primaryButtonMode).toBe("cycle");
    expect(model.items.map((item) => ({
      id: item.id,
      shortLabel: item.shortLabel,
      selected: item.selected,
      statusLabel: item.statusLabel,
    }))).toEqual([
      { id: "helix", shortLabel: "Helix", selected: false, statusLabel: "on" },
      { id: "codex", shortLabel: "Codex", selected: true, statusLabel: "on" },
      { id: "future", shortLabel: "Future", selected: false, statusLabel: "off" },
    ]);

    const menuModel = buildHelixAskRuntimePickerModel({
      selectedRuntime: "helix",
      providers: model.items.map((item) => ({
        id: item.id,
        label: item.label,
        enabled: true,
        experimental: item.id === "future",
        permission_profile: {
          id: item.id === "helix" ? "helix-native" : "read-observe-act",
          label: "runtime",
          allows: { observe: true, read: true, act: true, write: false, shell: false, codeMutation: false },
        },
        supports: { streaming: true, workstationTools: true, codeMutation: false },
      })),
    });
    expect(menuModel.enabledProviderCount).toBe(3);
    expect(menuModel.primaryButtonMode).toBe("menu");

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const legacyComposerState = read("client/src/components/helix/ask-console/HelixAskLegacyComposerState.ts");
    const runtimePicker = read("client/src/components/helix/ask-console/HelixAskRuntimePicker.tsx");
    const actionToolbarSurface = read("client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx");
    expect(legacyPill).toContain("buildHelixAskRuntimePickerModel");
    expect(legacyPill).toContain("const composerState = buildHelixAskLegacyComposerState({");
    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(legacyPill).toContain("runtimePickerModel: agentRuntimePickerModel");
    expect(legacyPill).toContain("onRuntimePrimaryClick: handleAgentRuntimeButtonClick");
    expect(legacyPill).toContain("onRuntimeSelect: handleAgentRuntimeSelect");
    expect(legacyPill).not.toContain("<HelixAskRuntimePicker");
    expect(legacyPill).not.toContain("agentRuntimePickerModel.items.map");
    expect(legacyComposerSurface).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(legacyComposerState).toContain("export function buildHelixAskLegacyComposerState");
    expect(legacyComposerState).toContain("voiceLevelMonitor");
    expect(legacyComposerState).toContain("moodAvatar");
    expect(legacyComposerState).toContain("actionToolbar");
    expect(legacyComposerState).toContain("textarea");
    expect(legacyComposerState).not.toContain("triggerAskActionHaptic");
    expect(legacyComposerState).not.toContain("handleAskImageSelect");
    expect(legacyComposerState).not.toContain("handleVoiceInputToggle");
    expect(legacyComposerState).not.toContain("syncAskDraftValue");
    expect(legacyComposerState).not.toContain("runAskTurn");
    expect(legacyComposerState).not.toContain("fetch(");
    expect(legacyComposerState).not.toContain("navigator.clipboard");
    expect(legacyComposerState).not.toContain("speechSynthesis");
    expect(actionToolbarSurface).toContain("<HelixAskRuntimePicker");
    expect(actionToolbarSurface).toContain("model={runtimePickerModel}");
    expect(actionToolbarSurface).toContain("onPrimaryClick={onRuntimePrimaryClick}");
    expect(actionToolbarSurface).toContain("onSelect={onRuntimeSelect}");
    expect(runtimePicker).toContain("model.items.map");
    expect(runtimePicker).toContain('aria-label="Choose Ask agent runtime"');
    expect(runtimePicker).toContain('aria-label="Ask agent runtime"');
    expect(runtimePicker).toContain("disabled={!provider.enabled}");
    expect(runtimePicker).not.toContain('fetch("/api/agi/agent-providers"');
  });

  it("keeps live runtime controls developer-gated and outside the language runtime picker", () => {
    const developerModel = buildHelixAskLiveRuntimeControlsModel({
      accountPolicy: HELIX_DEVELOPER_ACCOUNT_POLICY,
      lifecycleState: "listening",
      transportControllerState: "ready_blocked",
      transportBlockedReason: "realtime_live_transport_disabled_by_env",
    });
    const userModel = buildHelixAskLiveRuntimeControlsModel({
      accountPolicy: HELIX_USER_ACCOUNT_POLICY,
      mode: "live_voice",
      authority: "execute_confirmed_actions",
    });

    expect(developerModel).toMatchObject({
      visible: true,
      locked: false,
      lockReason: null,
      modeLabel: "Live Off",
      authorityLabel: "Observe",
      lifecycleState: "listening",
      lifecycleLabel: "Listening",
      transportControllerState: "ready_blocked",
      transportControllerLabel: "Ready Blocked",
      transportBlockedReason: "realtime_live_transport_disabled_by_env",
      controlState: expect.objectContaining({
        runtime_agent_mode: "off",
        runtime_agent_authority: "observe_only",
        session_status: "idle",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    });
    expect(userModel).toMatchObject({
      visible: false,
      locked: true,
      lockReason: "developer_runtime_agent_controls_required",
      modeLabel: "Live Voice",
      authorityLabel: "Confirm",
      controlState: expect.objectContaining({
        runtime_agent_mode: "live_voice",
        runtime_agent_authority: "execute_confirmed_actions",
        terminal_eligible: false,
        assistant_answer: false,
      }),
    });
    const noSessionModel = buildHelixAskLiveRuntimeControlsModel({
      accountPolicy: null,
      mode: "live_voice",
    });
    expect(noSessionModel).toMatchObject({
      visible: false,
      locked: true,
    });
    expect(isHelixAgentRuntimeId("realtime_session")).toBe(false);
    expect(normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "realtime_session",
          label: "Realtime runtime session",
          enabled: true,
        },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "helix" }),
    ]));

    const markup = renderToStaticMarkup(
      React.createElement(HelixAskLiveRuntimeControls, { model: developerModel }),
    );
    const userMarkup = renderToStaticMarkup(
      React.createElement(HelixAskLiveRuntimeControls, { model: userModel }),
    );
    const toolbar = read("client/src/components/helix/ask-console/HelixAskActionToolbar.tsx");
    const actionToolbarSurface = read("client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx");
    const liveRuntimeControls = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeControls.tsx");
    const liveRuntimeSession = read("client/src/components/helix/ask-console/useHelixAskLiveRuntimeSession.ts");
    const visualFrameProducer = read("client/src/lib/helix/visualFrameProducer.ts");
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");

    expect(markup).toContain("Live Off");
    expect(markup).toContain("Observe");
    expect(markup).toContain("Listening");
    expect(markup).not.toContain("Ready Blocked");
    expect(userMarkup).toBe("");
    expect(toolbar).toContain("{liveRuntimeControls}");
    expect(toolbar.indexOf("{liveRuntimeControls}")).toBeLessThan(
      toolbar.indexOf("{runtimePicker}"),
    );
    expect(actionToolbarSurface).toContain("<HelixAskLiveRuntimeControls");
    expect(actionToolbarSurface).toContain("liveRuntimeControlsModel?.visible");
    expect(liveRuntimeControls).toContain("developer_runtime_agent_controls_required");
    expect(liveRuntimeControls).toContain("data-live-microphone-enabled");
    expect(liveRuntimeControls).toContain("runtime.setMicrophoneEnabled(!runtime.microphoneEnabled)");
    expect(liveRuntimeControls).toContain("data-live-visual-input-enabled");
    expect(liveRuntimeControls).toContain("const nextEnabled = !runtime.visualInputEnabled");
    expect(liveRuntimeControls).toContain("onVisualInputEnableRequested?.()");
    expect(liveRuntimeControls).toContain("runtime.setVisualInputEnabled(nextEnabled)");
    expect(liveRuntimeSession).toContain("subscribeVisualFrameProducerFrames(routeFrame)");
    expect(liveRuntimeSession).toContain("!frame.liveRuntimeEligible");
    expect(liveRuntimeSession).toContain("controllerRef.current?.sendVisualFrame({");
    expect(visualFrameProducer).toContain("liveRuntimeEligible: input.liveRuntimeEligible === true");
    expect(actionToolbarSurface).toContain("showMicButton={!liveOwnsMicrophone}");
    expect(liveRuntimeControls).not.toContain("fetch(");
    expect(liveRuntimeControls).not.toContain("navigator.mediaDevices");
    expect(liveRuntimeControls).not.toContain("RTCPeerConnection");
    expect(liveRuntimeControls).not.toContain("OpenAI");
    expect(legacyPill).not.toContain("HelixAskLiveRuntimeControls");
  });

  it("builds live runtime lifecycle receipts as non-terminal route requests only", () => {
    expect(HELIX_ASK_LIVE_RUNTIME_LIFECYCLE_STATES).toEqual([
      "off",
      "requesting",
      "active",
      "listening",
      "speaking",
      "muted",
      "paused",
      "transcript_received",
      "stopping",
      "stopped",
      "error",
    ]);

    const receiptKinds = [
      "session_start_requested",
      "session_started",
      "consent_granted",
      "consent_denied",
      "mic_permission_granted",
      "mic_permission_denied",
      "capture_active",
      "capture_stopped",
      "track_stopped",
      "playback_started",
      "playback_ended",
      "playback_failed",
      "transcript_event_received",
      "stop_requested",
      "stopped",
      "error",
    ] as const;
    const payloads = receiptKinds.map((receiptKind) =>
      buildHelixAskLiveRuntimeClientReceiptPayload({
        receiptKind,
        realtimeSessionId: "realtime:test",
        runtimeAgentMode: "live_transcription",
        runtimeAgentAuthority: "execute_confirmed_actions",
        lifecycleState: receiptKind === "transcript_event_received" ? "transcript_received" : undefined,
        clientReceiptRef: `receipt:${receiptKind}`,
        observedAtMs: 1783375252000,
        eventType: receiptKind === "transcript_event_received" ? "transcript.final" : null,
        sourceBinding: receiptKind === "transcript_event_received" ? { source_id: "mic:visible" } : null,
        transcriptObservationRef:
          receiptKind === "transcript_event_received" ? "obs:realtime:transcript:test" : null,
        transcriptTextHash:
          receiptKind === "transcript_event_received" ? "sha256:abc" : null,
        transcriptTextCharCount: receiptKind === "transcript_event_received" ? 42 : null,
        errorCode: receiptKind === "error" ? "permission_denied" : null,
      }),
    );

    for (const payload of payloads) {
      expect(payload).toMatchObject({
        schema: "helix.ask.live_runtime.client_receipt.v1",
        realtime_session_id: "realtime:test",
        runtime_agent_mode: "live_transcription",
        runtime_agent_authority: "execute_confirmed_actions",
        route_method: "POST",
        transcript_is_user_intent: false,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        sideband_started: false,
        media_capture_started: false,
        browser_media_api_referenced: false,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      });
      expect(payload).not.toHaveProperty("transcript_text");
      expect(payload).not.toHaveProperty("transcriptText");
      const request = buildHelixAskLiveRuntimeRouteRequest(payload);
      expect(request).toMatchObject({
        method: "POST",
        path: payload.route_path,
      });
      expect(request.body).not.toHaveProperty("transcript_text");
      expect(request.body).not.toHaveProperty("transcriptText");
      expect(JSON.stringify(request.body)).not.toContain("navigator.mediaDevices");
      expect(JSON.stringify(request.body)).not.toContain("RTCPeerConnection");
      expect(JSON.stringify(request.body)).not.toContain("OpenAI");
    }

    expect(buildHelixAskLiveRuntimeRouteRequest(payloads[0])).toMatchObject({
      path: "/api/agi/realtime/session",
      body: expect.objectContaining({
        visible_user_consent_receipt: "receipt:session_start_requested",
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        media_capture_started: false,
      }),
    });
    const transcriptReceipt = payloads.find((payload) => payload.receipt_kind === "transcript_event_received");
    expect(transcriptReceipt).toBeDefined();
    expect(buildHelixAskLiveRuntimeRouteRequest(transcriptReceipt!)).toMatchObject({
      path: "/api/agi/realtime/session/realtime%3Atest/event",
      body: expect.objectContaining({
        event_type: "transcript.final",
        event_ref: "obs:realtime:transcript:test",
        client_receipt_ref: "receipt:transcript_event_received",
        transcript_text_hash: "sha256:abc",
        transcript_text_char_count: 42,
      }),
    });
    const stopReceipt = payloads.find((payload) => payload.receipt_kind === "stop_requested");
    expect(stopReceipt).toBeDefined();
    expect(buildHelixAskLiveRuntimeRouteRequest(stopReceipt!)).toMatchObject({
      path: "/api/agi/realtime/session/realtime%3Atest/stop",
      body: expect.objectContaining({
        receipt_kind: "stop_requested",
        lifecycle_state: "stopping",
        assistant_answer: false,
        terminal_eligible: false,
      }),
    });

    const consentReceipt = buildHelixAskLiveRuntimeClientReceiptPayload({
      receiptKind: "consent_granted",
      realtimeSessionId: "realtime:test",
      clientReceiptRef: "receipt:consent:granted",
      observedAtMs: 1783375252001,
    });
    expect(buildHelixAskLiveRuntimeTransportHandoffPlan({})).toMatchObject({
      schema: "helix.ask.live_runtime.transport_handoff_plan.v1",
      status: "waiting_for_visible_consent",
      visible_user_consent_receipt: null,
      requires_visible_user_gesture: true,
      requires_server_session_response: true,
      requires_client_consent_receipt: true,
      can_start_browser_transport: false,
      media_capture_started: false,
      browser_media_api_referenced: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      blocked_reason: "visible_user_consent_required",
      reentry_required: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(buildHelixAskLiveRuntimeTransportHandoffPlan({
      consentReceipt,
    })).toMatchObject({
      status: "waiting_for_server_session_response",
      visible_user_consent_receipt: "receipt:consent:granted",
      server_session_response_observed: false,
      can_start_browser_transport: false,
      blocked_reason: "server_session_response_required",
    });
    expect(buildHelixAskLiveRuntimeTransportHandoffPlan({
      consentReceipt,
      serverResponse: {
        schema: "helix.realtime_session.response.v1",
        ok: false,
        action: "start",
        error: "realtime_session_disabled",
        blocked_reason: "capability_lane_disabled_by_policy",
        realtime_session_id: "realtime:test",
        lane_id: "realtime_session",
        transport: "none",
        transport_plan: {
          schema: "helix.realtime_session.transport_plan.v1",
          requested_transport: "webrtc",
          planned_transport: "none",
          adapter_id: "disabled",
          adapter_state: "disabled",
          descriptor_enabled: false,
          adapter_enabled: false,
          live_transport_enabled: false,
          live_execution_attempted: false,
          live_execution_disabled_reason: "realtime_adapter_disabled_by_env",
          requires_visible_user_gesture: true,
          requires_server_session_response: true,
          requires_client_consent_receipt: true,
          client_secret_requested: false,
          client_secret_issued: false,
          ephemeral_client_secret_expires_at_ms: null,
          sdp_exchange_requested: false,
          server_sideband_requested: false,
          provider_session_ref: null,
          client_receipt_refs: ["receipt:consent:granted"],
        },
        client_secret_requested: false,
        client_secret_issued: false,
        sdp_exchange_requested: false,
        server_sideband_requested: false,
        provider_session_ref: null,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        sideband_started: false,
        account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        policy_gate: {
          account_type: "developer",
          runtime_agent_controls_available: true,
          locked_reason: null,
          requested_runtime_agent_mode: "live_voice",
          requested_runtime_agent_authority: "observe_only",
        },
        realtime_runtime_session_summary: {} as never,
        realtime_runtime_session_events: [],
        realtime_transcript_observations: [],
        realtime_tool_suggestion_observations: [],
        realtime_client_receipt_observations: [],
        realtime_reentry_status: null,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    })).toMatchObject({
      status: "blocked_live_transport_disabled",
      server_session_response_observed: true,
      server_session_response_ok: false,
      provider_session_ref: null,
      client_secret_issued: false,
      sdp_exchange_allowed: false,
      server_sideband_allowed: false,
      can_start_browser_transport: false,
      blocked_reason: "realtime_adapter_disabled_by_env",
    });

    const lifecycle = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeLifecycle.ts");
    const controls = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeControls.tsx");
    const index = read("client/src/components/helix/ask-console/index.ts");
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");

    expect(lifecycle).not.toContain("fetch(");
    expect(lifecycle).not.toContain("navigator.mediaDevices");
    expect(lifecycle).not.toContain("RTCPeerConnection");
    expect(lifecycle).not.toContain("client_secrets");
    expect(lifecycle).not.toContain("/v1/realtime");
    expect(lifecycle).not.toContain("OPENAI_API_KEY");
    expect(controls).toContain("data-lifecycle-state");
    expect(index).toContain("buildHelixAskLiveRuntimeClientReceiptPayload");
    expect(legacyPill).not.toContain("HelixAskLiveRuntimeLifecycle");
    expect(legacyPill).not.toContain("buildHelixAskLiveRuntimeClientReceiptPayload");
  });

  it("builds a disabled live runtime transport controller without browser execution", async () => {
    expect(HELIX_ASK_LIVE_RUNTIME_TRANSPORT_CONTROLLER_STATES).toEqual([
      "idle",
      "awaiting_consent",
      "awaiting_server_session",
      "ready",
      "connecting",
      "active",
      "ready_blocked",
      "starting_blocked",
      "stopping",
      "stopped",
      "error",
    ]);

    const consentReceipt = buildHelixAskLiveRuntimeClientReceiptPayload({
      receiptKind: "consent_granted",
      realtimeSessionId: "realtime:controller",
      clientReceiptRef: "receipt:controller:consent",
      observedAtMs: 1783375252100,
    });
    const handoffPlan = buildHelixAskLiveRuntimeTransportHandoffPlan({
      consentReceipt,
      serverResponse: {
        schema: "helix.realtime_session.response.v1",
        ok: false,
        action: "start",
        error: "realtime_session_disabled",
        blocked_reason: "capability_lane_disabled_by_policy",
        realtime_session_id: "realtime:controller",
        lane_id: "realtime_session",
        transport: "none",
        transport_plan: {
          schema: "helix.realtime_session.transport_plan.v1",
          requested_transport: "webrtc",
          planned_transport: "none",
          adapter_id: "disabled",
          adapter_state: "disabled",
          descriptor_enabled: false,
          adapter_enabled: false,
          live_transport_enabled: false,
          live_execution_attempted: false,
          live_execution_disabled_reason: "realtime_live_transport_disabled_by_env",
          requires_visible_user_gesture: true,
          requires_server_session_response: true,
          requires_client_consent_receipt: true,
          client_secret_requested: false,
          client_secret_issued: false,
          ephemeral_client_secret_expires_at_ms: null,
          sdp_exchange_requested: false,
          server_sideband_requested: false,
          provider_session_ref: null,
          client_receipt_refs: ["receipt:controller:consent"],
        },
        client_secret_requested: false,
        client_secret_issued: false,
        sdp_exchange_requested: false,
        server_sideband_requested: false,
        provider_session_ref: null,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        sideband_started: false,
        account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        policy_gate: {
          account_type: "developer",
          runtime_agent_controls_available: true,
          locked_reason: null,
          requested_runtime_agent_mode: "live_voice",
          requested_runtime_agent_authority: "observe_only",
        },
        realtime_runtime_session_summary: {} as never,
        realtime_runtime_session_events: [],
        realtime_transcript_observations: [],
        realtime_tool_suggestion_observations: [],
        realtime_client_receipt_observations: [],
        realtime_reentry_status: null,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    const startBlockedReceipt = buildHelixAskLiveRuntimeTransportLifecycleReceiptPayload({
      receiptKind: "transport_start_blocked",
      realtimeSessionId: "realtime:controller",
      handoffPlan,
      clientReceiptRef: "receipt:transport:start-blocked",
      observedAtMs: 1783375252200,
    });
    const controller = buildHelixAskLiveRuntimeTransportControllerModel({
      handoffPlan,
      latestReceipt: startBlockedReceipt,
    });
    const routeRequest = buildHelixAskLiveRuntimeTransportReceiptRouteRequest(startBlockedReceipt);

    expect(controller).toMatchObject({
      schema: "helix.ask.live_runtime.transport_controller_model.v1",
      controller_state: "starting_blocked",
      controller_label: "Start Blocked",
      latest_lifecycle_receipt_refs: ["receipt:transport:start-blocked"],
      blocked_reason: "realtime_live_transport_disabled_by_env",
      transport_execution_attempted: false,
      media_capture_started: false,
      browser_media_api_referenced: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      reentry_required: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      events: [
        expect.objectContaining({
          event_kind: "transport_start_blocked",
          receipt_ref: "receipt:transport:start-blocked",
          transport_execution_attempted: false,
          media_capture_started: false,
          webrtc_started: false,
          assistant_answer: false,
          terminal_eligible: false,
        }),
      ],
    });
    expect(startBlockedReceipt).toMatchObject({
      schema: "helix.ask.live_runtime.transport_lifecycle_receipt.v1",
      receipt_kind: "transport_start_blocked",
      controller_state: "starting_blocked",
      handoff_status: "blocked_live_transport_disabled",
      route_path: "/api/agi/realtime/session/realtime%3Acontroller/client-receipt",
      blocked_reason: "realtime_live_transport_disabled_by_env",
      transport_execution_attempted: false,
      media_capture_started: false,
      browser_media_api_referenced: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      browser_tracks_created: false,
      data_channels_created: false,
      reentry_required: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(routeRequest).toMatchObject({
      method: "POST",
      path: "/api/agi/realtime/session/realtime%3Acontroller/client-receipt",
      body: expect.objectContaining({
        receipt_kind: "transport_start_blocked",
        controller_state: "starting_blocked",
        transport_execution_attempted: false,
        media_capture_started: false,
        browser_media_api_referenced: false,
        webrtc_started: false,
        openai_network_call_attempted: false,
        browser_tracks_created: false,
        data_channels_created: false,
        assistant_answer: false,
        terminal_eligible: false,
      }),
    });

    const prepare = await HELIX_ASK_DISABLED_LIVE_RUNTIME_TRANSPORT_BOUNDARY.prepareTransport({
      handoffPlan,
      observedAtMs: 1783375252300,
    });
    const start = await HELIX_ASK_DISABLED_LIVE_RUNTIME_TRANSPORT_BOUNDARY.startTransport({
      handoffPlan,
      observedAtMs: 1783375252400,
    });
    const stop = await HELIX_ASK_DISABLED_LIVE_RUNTIME_TRANSPORT_BOUNDARY.stopTransport({
      realtimeSessionId: "realtime:controller",
      observedAtMs: 1783375252500,
    });

    expect(prepare).toMatchObject({
      ok: false,
      method: "prepareTransport",
      controller_state: "ready_blocked",
      blocked_reason: "realtime_live_transport_disabled_by_env",
      transport_execution_attempted: false,
      media_capture_started: false,
      browser_media_api_referenced: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      browser_tracks_created: false,
      data_channels_created: false,
    });
    expect(start).toMatchObject({
      ok: false,
      method: "startTransport",
      controller_state: "starting_blocked",
      receipt: expect.objectContaining({
        receipt_kind: "transport_start_blocked",
        terminal_eligible: false,
        assistant_answer: false,
      }),
    });
    expect(stop).toMatchObject({
      ok: false,
      method: "stopTransport",
      controller_state: "stopped",
      blocked_reason: "transport_stop_recorded_without_browser_resources",
      receipt: expect.objectContaining({
        receipt_kind: "transport_stopped",
        route_path: "/api/agi/realtime/session/realtime%3Acontroller/client-receipt",
        media_capture_started: false,
        webrtc_started: false,
      }),
    });

    const lifecycle = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeLifecycle.ts");
    expect(lifecycle).toContain("prepareTransport");
    expect(lifecycle).toContain("startTransport");
    expect(lifecycle).toContain("stopTransport");
    expect(lifecycle).not.toContain("navigator.mediaDevices");
    expect(lifecycle).not.toContain("RTCPeerConnection");
    expect(lifecycle).not.toContain("fetch(");
    expect(lifecycle).not.toContain("client_secrets");
    expect(lifecycle).not.toContain("/v1/realtime");
    expect(lifecycle).not.toContain("OPENAI_API_KEY");
    expect(lifecycle).not.toContain("MediaStreamTrack");
    expect(lifecycle).not.toContain("createDataChannel");
  });

  it("gates live runtime browser Realtime transport on server admission and cleans up explicit resources", async () => {
    const consentDenied = buildHelixAskLiveRuntimeClientReceiptPayload({
      receiptKind: "consent_denied",
      realtimeSessionId: "realtime:browser",
      clientReceiptRef: "receipt:consent:denied",
      observedAtMs: 1783375252600,
      errorCode: "permission_denied",
    });
    expect(consentDenied).toMatchObject({
      lifecycle_state: "error",
      status: "denied",
      route_path: "/api/agi/realtime/session/realtime%3Abrowser/client-receipt",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      reentry_required: true,
    });
    expect(buildHelixAskLiveRuntimeRouteRequest(consentDenied)).toMatchObject({
      body: expect.objectContaining({
        receipt_kind: "consent_denied",
        status: "denied",
        error_code: "permission_denied",
        assistant_answer: false,
        terminal_eligible: false,
      }),
    });

    const deniedMicRequest = vi.fn(async () => ({
      getTracks: () => [],
    }));
    const blockedController = createHelixAskLiveRuntimeBrowserTransportController({
      requestMicrophone: deniedMicRequest,
      nowMs: () => 1783375252700,
    });
    const blockedHandoff = buildHelixAskLiveRuntimeTransportHandoffPlan({
      consentReceipt: buildHelixAskLiveRuntimeClientReceiptPayload({
        receiptKind: "consent_granted",
        realtimeSessionId: "realtime:browser",
        clientReceiptRef: "receipt:consent:granted",
        observedAtMs: 1783375252650,
      }),
      serverResponse: {
        schema: "helix.realtime_session.response.v1",
        ok: false,
        action: "start",
        error: "realtime_session_disabled",
        blocked_reason: "capability_lane_disabled_by_policy",
        realtime_session_id: "realtime:browser",
        lane_id: "realtime_session",
        transport: "none",
        transport_plan: {
          schema: "helix.realtime_session.transport_plan.v1",
          requested_transport: "webrtc",
          planned_transport: "none",
          adapter_id: "openai_realtime_stub",
          adapter_state: "stubbed",
          descriptor_enabled: true,
          adapter_enabled: true,
          live_transport_enabled: false,
          live_execution_attempted: false,
          live_execution_disabled_reason: "realtime_live_transport_disabled_by_env",
          requires_visible_user_gesture: true,
          requires_server_session_response: true,
          requires_client_consent_receipt: true,
          client_secret_requested: false,
          client_secret_issued: false,
          ephemeral_client_secret_expires_at_ms: null,
          sdp_exchange_requested: false,
          server_sideband_requested: false,
          provider_session_ref: null,
          client_receipt_refs: ["receipt:consent:granted"],
        },
        client_secret_requested: false,
        client_secret_issued: false,
        sdp_exchange_requested: false,
        server_sideband_requested: false,
        provider_session_ref: null,
        openai_network_call_attempted: false,
        ephemeral_credential_minted: false,
        webrtc_started: false,
        sideband_started: false,
        account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        policy_gate: {
          account_type: "developer",
          runtime_agent_controls_available: true,
          locked_reason: null,
          requested_runtime_agent_mode: "live_voice",
          requested_runtime_agent_authority: "observe_only",
        },
        realtime_runtime_session_summary: {} as never,
        realtime_runtime_session_events: [],
        realtime_transcript_observations: [],
        realtime_tool_suggestion_observations: [],
        realtime_client_receipt_observations: [],
        realtime_reentry_status: null,
        reentry_required: true,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    const blockedStart = await blockedController.startTransport({
      handoffPlan: blockedHandoff,
      observedAtMs: 1783375252700,
    });
    expect(blockedStart).toMatchObject({
      ok: false,
      method: "startTransport",
      controller_state: "starting_blocked",
      blocked_reason: "realtime_live_transport_disabled_by_env",
      transport_execution_attempted: false,
      browser_media_api_referenced: false,
      media_capture_started: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      receipt: expect.objectContaining({
        receipt_kind: "transport_start_blocked",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
        reentry_required: true,
      }),
    });
    expect(deniedMicRequest).not.toHaveBeenCalled();

    const stopWithoutResources = await blockedController.stopTransport({
      realtimeSessionId: "realtime:browser",
      observedAtMs: 1783375252750,
    });
    expect(stopWithoutResources).toMatchObject({
      ok: false,
      controller_state: "stopped",
      blocked_reason: "transport_stop_recorded_without_browser_resources",
      browser_tracks_created: false,
      data_channels_created: false,
      receipt: expect.objectContaining({
        receipt_kind: "transport_stopped",
        media_capture_started: false,
        webrtc_started: false,
      }),
    });

    const trackStop = vi.fn();
    const dataChannelClose = vi.fn();
    const dataChannelSend = vi.fn();
    const dataChannelState = vi.fn();
    const microphoneState = vi.fn();
    const localMicrophoneTrack = {
      stop: trackStop,
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live",
      label: "USB Microphone",
    };
    let onDataChannelOpen: (() => void) | null = null;
    const dataChannel = {
      close: dataChannelClose,
      send: dataChannelSend,
      get onopen() {
        return onDataChannelOpen;
      },
      set onopen(handler: (() => void) | null) {
        onDataChannelOpen = handler;
      },
      onclose: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onmessage: null as ((event: { data: unknown }) => void) | null,
    };
    const peerConnectionClose = vi.fn();
    const remoteAudioPlay = vi.fn(async () => undefined);
    const remoteAudioPause = vi.fn();
    const remoteAudioPlayback = vi.fn();
    const remoteAudioTrack = vi.fn();
    const remoteTrackStream = { getTracks: () => [] };
    const createRemoteMediaStream = vi.fn(() => remoteTrackStream);
    let onRemoteTrack: ((event: {
      streams?: Array<{ getTracks(): Array<{ stop(): void }> }>;
      track?: { stop(): void };
    }) => void) | null = null;
    const dispatchRemoteTrack = (event: {
      streams?: Array<{ getTracks(): Array<{ stop(): void }> }>;
      track?: { stop(): void };
    }) => {
      if (!onRemoteTrack) throw new Error("remote_track_handler_not_registered");
      onRemoteTrack(event);
    };
    const remoteAudio = {
      autoplay: true,
      muted: false,
      srcObject: null as unknown,
      play: remoteAudioPlay,
      pause: remoteAudioPause,
    };
    const allowedHandoff = {
      schema: "helix.ask.live_runtime.transport_handoff_plan.v1",
      status: "blocked_live_transport_disabled",
      visible_user_consent_receipt: "receipt:consent:granted",
      server_session_response_observed: true,
      server_session_response_ok: true,
      transport_plan: blockedHandoff.transport_plan,
      provider_session_ref: null,
      requires_visible_user_gesture: true,
      requires_server_session_response: true,
      requires_client_consent_receipt: true,
      client_secret_issued: true,
      sdp_exchange_allowed: true,
      server_sideband_allowed: false,
      can_start_browser_transport: true,
      media_capture_started: false,
      browser_media_api_referenced: false,
      webrtc_started: false,
      openai_network_call_attempted: false,
      blocked_reason: "transport_contract_admitted",
      reentry_required: true,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    } as const;
    const serverReturnedSessionContract = {
      ok: true,
      realtime_session_id: "realtime:browser",
      client_secret_issued: true,
      sdp_exchange_requested: true,
      openai_network_call_attempted: false,
      ephemeral_credential_minted: false,
    } as never;
    const permissionError = new Error("Permission denied by browser");
    permissionError.name = "NotAllowedError";
    const permissionDeniedController = createHelixAskLiveRuntimeBrowserTransportController({
      nowMs: () => 1783375252775,
      requestMicrophone: vi.fn(async () => {
        throw permissionError;
      }),
    });
    const permissionDenied = await permissionDeniedController.startTransport({
      handoffPlan: allowedHandoff,
      serverResponse: serverReturnedSessionContract,
      observedAtMs: 1783375252775,
    });
    expect(permissionDenied).toMatchObject({
      ok: false,
      controller_state: "error",
      blocked_reason: "microphone_permission_denied",
      transport_execution_attempted: true,
      browser_media_api_referenced: true,
      media_capture_started: false,
      openai_network_call_attempted: false,
      receipt: expect.objectContaining({
        receipt_kind: "transport_error",
        blocked_reason: "microphone_permission_denied",
        terminal_eligible: false,
      }),
    });
    const allowedController = createHelixAskLiveRuntimeBrowserTransportController({
      nowMs: () => 1783375252800,
      requestMicrophone: vi.fn(async () => ({
        getTracks: () => [localMicrophoneTrack],
      })),
      createPeerConnection: () => ({
        get ontrack() {
          return onRemoteTrack;
        },
        set ontrack(handler) {
          onRemoteTrack = handler ?? null;
        },
        createDataChannel: () => dataChannel,
        addTrack: vi.fn(),
        createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\r\nmock-offer" })),
        setLocalDescription: vi.fn(async () => undefined),
        setRemoteDescription: vi.fn(async () => undefined),
        close: peerConnectionClose,
      }),
      createRemoteAudio: () => remoteAudio,
      createRemoteMediaStream,
      onRemoteAudioTrack: remoteAudioTrack,
      onRemoteAudioPlayback: remoteAudioPlayback,
      onMicrophoneState: microphoneState,
      onDataChannelState: dataChannelState,
      exchangeSdp: vi.fn(async () => ({
        answerSdp: "v=0\r\nmock-answer",
        providerCallRef: "openai-realtime:call:test",
      })),
    });
    const started = await allowedController.startTransport({
      handoffPlan: allowedHandoff,
      serverResponse: serverReturnedSessionContract,
      observedAtMs: 1783375252800,
    });
    expect(started).toMatchObject({
      ok: true,
      transport_execution_attempted: true,
      browser_media_api_referenced: true,
      media_capture_started: true,
      webrtc_started: true,
      browser_tracks_created: true,
      data_channels_created: true,
      openai_network_call_attempted: true,
      receipt: expect.objectContaining({
        receipt_kind: "transport_start_requested",
        transport_execution_attempted: true,
        browser_media_api_referenced: true,
        media_capture_started: true,
        webrtc_started: true,
        browser_tracks_created: true,
        data_channels_created: true,
        assistant_answer: false,
        terminal_eligible: false,
      }),
    });
    expect(microphoneState).toHaveBeenCalledWith({
      trackCount: 1,
      liveTrackCount: 1,
      enabledTrackCount: 0,
      mutedTrackCount: 0,
      deviceLabel: "USB Microphone",
      loopbackSource: false,
    });
    expect(allowedController.getMicrophoneEnabled()).toBe(false);
    expect(localMicrophoneTrack.enabled).toBe(false);
    expect(allowedController.setMicrophoneEnabled(true)).toBe(true);
    expect(allowedController.getMicrophoneEnabled()).toBe(true);
    expect(localMicrophoneTrack.enabled).toBe(true);
    expect(microphoneState).toHaveBeenLastCalledWith({
      trackCount: 1,
      liveTrackCount: 1,
      enabledTrackCount: 1,
      mutedTrackCount: 0,
      deviceLabel: "USB Microphone",
      loopbackSource: false,
    });
    if (!onDataChannelOpen) throw new Error("data_channel_open_handler_not_registered");
    onDataChannelOpen();
    expect(dataChannelState).toHaveBeenNthCalledWith(1, {
      state: "open",
      initialAudioProbe: "not_attempted",
      errorCode: null,
    });
    expect(dataChannelState).toHaveBeenNthCalledWith(2, {
      state: "open",
      initialAudioProbe: "requested",
      errorCode: null,
    });
    expect(dataChannelSend).toHaveBeenCalledTimes(1);
    expect(JSON.parse(dataChannelSend.mock.calls[0][0])).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["audio"],
        metadata: {
          helix_purpose: "connection_audio_probe",
          answer_authority: "none",
        },
      },
    });
    const streamBackedRemoteAudio = { getTracks: () => [] };
    dispatchRemoteTrack({ streams: [streamBackedRemoteAudio] });
    await vi.waitFor(() => expect(remoteAudioPlayback).toHaveBeenLastCalledWith({
      status: "started",
      errorCode: null,
      muted: false,
    }));
    expect(remoteAudioPlay).toHaveBeenCalledTimes(1);
    expect(remoteAudio.srcObject).toBe(streamBackedRemoteAudio);
    expect(remoteAudioTrack).toHaveBeenLastCalledWith({
      source: "stream",
      muted: false,
      focusGranted: true,
    });

    const playbackBlocked = new Error("play() requires a user gesture");
    playbackBlocked.name = "NotAllowedError";
    remoteAudioPlay.mockRejectedValueOnce(playbackBlocked);
    const trackOnlyRemoteAudio = { stop: vi.fn() };
    dispatchRemoteTrack({ streams: [], track: trackOnlyRemoteAudio });
    await vi.waitFor(() => expect(remoteAudioPlayback).toHaveBeenLastCalledWith({
      status: "failed",
      errorCode: "remote_audio_playback_blocked",
      muted: false,
    }));
    expect(createRemoteMediaStream).toHaveBeenCalledWith(trackOnlyRemoteAudio);
    expect(remoteAudio.srcObject).toBe(remoteTrackStream);
    expect(remoteAudioTrack).toHaveBeenLastCalledWith({
      source: "track_fallback",
      muted: false,
      focusGranted: true,
    });
    const stopped = await allowedController.stopTransport({
      realtimeSessionId: "realtime:browser",
      observedAtMs: 1783375252900,
    });
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(remoteAudioPause).toHaveBeenCalledTimes(1);
    expect(dataChannelClose).toHaveBeenCalledTimes(1);
    expect(peerConnectionClose).toHaveBeenCalledTimes(1);
    expect(stopped).toMatchObject({
      controller_state: "stopped",
      blocked_reason: "transport_resources_stopped",
      browser_tracks_created: true,
      data_channels_created: true,
      receipt: expect.objectContaining({
        receipt_kind: "transport_stopped",
        browser_tracks_created: true,
        data_channels_created: true,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
        reentry_required: true,
      }),
    });
    const stoppedAgain = await allowedController.stopTransport({
      realtimeSessionId: "realtime:browser",
      observedAtMs: 1783375252950,
    });
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(dataChannelClose).toHaveBeenCalledTimes(1);
    expect(peerConnectionClose).toHaveBeenCalledTimes(1);
    expect(stoppedAgain).toMatchObject({
      controller_state: "stopped",
      blocked_reason: "transport_stop_recorded_without_browser_resources",
      browser_tracks_created: false,
      data_channels_created: false,
    });

    const controllerSource = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeTransportController.ts");
    const lifecycleSource = read("client/src/components/helix/ask-console/HelixAskLiveRuntimeLifecycle.ts");
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    expect(controllerSource).toContain("navigator?.mediaDevices");
    expect(controllerSource).toContain("RTCPeerConnection");
    expect(controllerSource).toContain("document.body.appendChild(audio)");
    expect(controllerSource).toContain("isLikelyLoopbackDeviceLabel");
    expect(controllerSource).toContain("setMicrophoneEnabled(false)");
    expect(controllerSource).not.toContain("OPENAI_API_KEY");
    expect(controllerSource).not.toContain("client_secrets");
    expect(controllerSource).not.toContain("/v1/realtime");
    expect(lifecycleSource).not.toContain("navigator.mediaDevices");
    expect(lifecycleSource).not.toContain("RTCPeerConnection");
    expect(legacyPill).not.toContain("HelixAskLiveRuntimeTransportController");
  });

  it("owns prompt composer display state without submit-stream behavior", () => {
    expect(HELIX_ASK_CONSOLE_MAX_PROMPT_LINES).toBe(10);
    expect(buildHelixAskComposerViewModel({
      busy: false,
      placeholder: null,
      runtimeLabel: "Codex",
    })).toMatchObject({
      inputPlaceholder: "Ask Codex about this workspace",
      currentPlaceholder: "Ask Codex about this workspace",
      maxPromptLines: 10,
      submitMode: "submit",
      submitAriaLabel: "Submit prompt",
      submitTitle: "Submit prompt",
      submitButtonType: "submit",
      submitIcon: "search",
    });
    expect(buildHelixAskComposerPlaceholder({
      placeholder: null,
      runtimeLabel: "Future",
    })).toBe("Ask Future about this workspace");
    expect(buildHelixAskComposerPlaceholder({
      placeholder: "Ask the active doc",
      runtimeLabel: "Codex",
    })).toBe("Ask the active doc");
    expect(buildHelixAskComposerViewModel({
      busy: true,
      placeholder: "Ask the active doc",
      runtimeLabel: "Codex",
    })).toMatchObject({
      inputPlaceholder: "Ask the active doc",
      currentPlaceholder: "Add another question...",
      maxPromptLines: 10,
      submitMode: "stop",
      submitAriaLabel: "Stop generation",
      submitTitle: "Stop generation",
      submitButtonType: "button",
      submitIcon: "square",
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const composer = read("client/src/components/helix/ask-console/HelixAskComposer.tsx");
    const legacyComposerState = read("client/src/components/helix/ask-console/HelixAskLegacyComposerState.ts");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const textareaSurface = read("client/src/components/helix/ask-console/HelixAskComposerTextareaSurface.tsx");
    const actionToolbarSurface = read("client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx");
    const minimalShell = read("client/src/components/helix/ask-console/HelixAskMinimalRuntimeShell.tsx");
    const dock = read("client/src/components/workstation/HelixAskDock.tsx");
    const mobileDrawer = read("client/src/components/workstation/mobile/MobileHelixAskDrawer.tsx");
    expect(legacyPill).toContain("buildHelixAskComposerViewModel");
    expect(legacyPill).toContain("runtimeLabel: agentRuntimePickerModel.selectedLabel");
    expect(legacyPill).toContain("const composerState = buildHelixAskLegacyComposerState({");
    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).not.toContain("<HelixAskComposerTextareaSurface");
    expect(legacyPill).not.toContain("HelixAskComposerTextarea,");
    expect(legacyPill).toContain("composerViewModel.textareaClassName");
    expect(legacyPill).toContain("onInputValue: (value, target)");
    expect(legacyPill).toContain("onSubmitRequested: (form) => form?.requestSubmit?.()");
    expect(legacyPill).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(legacyPill).toContain("submitViewModel: composerViewModel");
    expect(legacyPill).toContain("onSubmitIntent: () => triggerAskActionHaptic()");
    expect(legacyPill).toContain("handleStop();");
    expect(legacyPill).not.toContain("<HelixAskComposerSubmitButton");
    expect(legacyPill).toContain("handleAskSubmit");
    expect(legacyPill).not.toContain("<textarea\n                aria-label=\"Ask Helix\"");
    expect(legacyPill).not.toContain("viewModel.submitButtonType");
    expect(legacyComposerSurface).toContain("<HelixAskComposerTextareaSurface {...textarea} ref={textareaRef} />");
    expect(legacyComposerSurface).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(legacyComposerState).toContain("export function buildHelixAskLegacyComposerState");
    expect(legacyComposerState).toContain("textareaRef");
    expect(legacyComposerState).not.toContain("requestSubmit");
    expect(legacyComposerState).not.toContain("syncAskDraftValue");
    expect(legacyComposerState).not.toContain("fetch(");
    expect(textareaSurface).toContain("export const HelixAskComposerTextareaSurface");
    expect(textareaSurface).toContain("<HelixAskComposerTextarea {...props} ref={ref} />");
    expect(textareaSurface).not.toContain("syncAskDraftValue");
    expect(textareaSurface).not.toContain("handleAskPaste");
    expect(textareaSurface).not.toContain("requestSubmit");
    expect(textareaSurface).not.toContain("fetch(");
    expect(textareaSurface).not.toContain("navigator.clipboard");
    expect(textareaSurface).not.toContain("speechSynthesis");
    expect(composer).toContain("export const HelixAskComposerTextarea");
    expect(composer).toContain("export function buildHelixAskComposerPlaceholder");
    expect(composer).toContain("export function HelixAskComposerSubmitButton");
    expect(actionToolbarSurface).toContain("<HelixAskComposerSubmitButton");
    expect(actionToolbarSurface).toContain("viewModel={submitViewModel}");
    expect(actionToolbarSurface).toContain("onSubmitIntent={onSubmitIntent}");
    expect(actionToolbarSurface).toContain("onStop={onStop}");
    expect(composer).toContain("runtimeLabel?: string | null");
    expect(composer).not.toContain('placeholder = "Ask Helix about this workspace"');
    expect(minimalShell).toContain("runtimeLabel: runtimePickerModel.selectedLabel");
    expect(composer).toContain('aria-label="Ask Helix"');
    expect(composer).toContain("onSubmitRequested(event.currentTarget.form)");
    expect(composer).toContain("title={viewModel.submitTitle}");
    expect(composer).toContain("type={viewModel.submitButtonType}");
    expect(composer).toContain("<Square className=");
    expect(composer).toContain("<Search className=");
    expect(composer).not.toContain("handleAskSubmit");
    expect(composer).not.toContain("runAskTurn");
    expect(dock).toContain("<HelixAskConsole");
    expect(mobileDrawer).toContain("<HelixAskConsole");
    expect(dock).not.toContain('placeholder="Ask Helix about this workspace"');
    expect(mobileDrawer).not.toContain('placeholder="Ask Helix about this workspace"');
  });

  it("owns action toolbar display while input and capture behavior stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const toolbar = read("client/src/components/helix/ask-console/HelixAskActionToolbar.tsx");
    const actionToolbarSurface = read("client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx");
    const actionCarousel = read("client/src/components/helix/ask-console/useHelixAskActionCarousel.ts");
    const minimalShell = read("client/src/components/helix/ask-console/HelixAskMinimalRuntimeShell.tsx");

    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(legacyPill).not.toContain("<HelixAskActionToolbar");
    expect(legacyPill).toContain("onCarouselScrollIntent: triggerAskActionHaptic");
    expect(legacyPill).not.toContain("askActionCarouselRef");
    expect(legacyPill).not.toContain("askActionCarouselEdges");
    expect(legacyPill).not.toContain("updateAskActionCarouselEdges");
    expect(legacyPill).not.toContain("scrollAskActionCarousel");
    expect(legacyPill).toContain("imageInputRef: askImageInputRef");
    expect(legacyPill).toContain("onImageSelect: handleAskImageSelect");
    expect(legacyPill).toContain("askImageInputRef.current?.click()");
    expect(legacyPill).toContain("handleVoiceInputToggle();");
    expect(legacyPill).toContain("handleVisualSituationSourceCapture();");
    expect(legacyPill).toContain("handleVisualSituationAudioPreferenceToggle();");
    expect(legacyPill).toContain("runtimePickerModel: agentRuntimePickerModel");
    expect(legacyPill).toContain("submitViewModel: composerViewModel");
    expect(legacyPill).not.toContain("runtimePicker={");
    expect(legacyPill).not.toContain("submitButton={");
    expect(legacyPill).not.toContain('title="Attach image"');
    expect(legacyPill).not.toContain("<Plus className=");
    expect(legacyPill).not.toContain("<Mic className=");
    expect(legacyPill).not.toContain("<Headphones");
    expect(legacyPill).not.toContain('aria-label="Scroll Ask controls left"');

    expect(toolbar).toContain("export function HelixAskActionToolbar");
    expect(toolbar).toContain('title="Attach image"');
    expect(toolbar).toContain('micInputMode === "live_runtime"');
    expect(toolbar).toContain('data-microphone-owner={micInputMode}');
    expect(toolbar).toContain('visualSituationSourceStatus === "requesting"');
    expect(toolbar).toContain("title={visualCaptureTitle}");
    expect(toolbar).toContain("const visualAudioTitle = visualSituationIncludeAudio");
    expect(toolbar).toContain("<Plus className=");
    expect(toolbar).toContain("<Mic");
    expect(toolbar).toContain("<ImageIcon");
    expect(toolbar).toContain("<Headphones");
    expect(toolbar).toContain('aria-label="Scroll Ask controls left"');
    expect(toolbar).toContain('aria-label="Scroll Ask controls right"');
    expect(toolbar).toContain('data-testid="helix-ask-action-carousel-viewport"');
    expect(toolbar).toContain('data-testid="helix-ask-action-carousel-track"');
    expect(toolbar).toContain("flex w-max min-w-full items-center justify-end gap-2 px-12");
    expect(toolbar).toContain("{runtimePicker}");
    expect(toolbar).toContain("{submitButton}");
    expect(toolbar).not.toContain("handleAskImageSelect");
    expect(toolbar).not.toContain("handleVoiceInputToggle");
    expect(toolbar).not.toContain("handleVisualSituationSourceCapture");
    expect(toolbar).not.toContain("handleVisualSituationAudioPreferenceToggle");
    expect(toolbar).not.toContain("runAskTurn");
    expect(toolbar).not.toContain("navigator.clipboard");
    expect(actionToolbarSurface).toContain("export function HelixAskComposerActionToolbarSurface");
    expect(actionToolbarSurface).toContain("<HelixAskActionToolbar");
    expect(actionToolbarSurface).toContain("useHelixAskActionCarousel({");
    expect(actionToolbarSurface).toContain("onScrollIntent: onCarouselScrollIntent");
    expect(actionToolbarSurface).toContain("<HelixAskRuntimePicker");
    expect(actionToolbarSurface).toContain("<HelixAskComposerSubmitButton");
    expect(legacyComposerSurface).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(actionToolbarSurface).not.toContain("triggerAskActionHaptic");
    expect(actionToolbarSurface).not.toContain("handleStop");
    expect(actionToolbarSurface).not.toContain("handleVoiceInputToggle");
    expect(actionToolbarSurface).not.toContain("handleVisualSituationSourceCapture");
    expect(actionToolbarSurface).not.toContain("runAskTurn");
    expect(actionToolbarSurface).not.toContain("fetch(");
    expect(actionToolbarSurface).not.toContain("setAskReplies");
    expect(actionCarousel).toContain("export function useHelixAskActionCarousel");
    expect(actionCarousel).toContain("resizeObserver?.observe(viewport)");
    expect(actionCarousel).toContain("resizeObserver?.observe(track)");
    expect(actionCarousel).not.toContain("HelixAskPill");
    expect(actionCarousel).not.toContain("runAskTurn");
    expect(actionCarousel).not.toContain("fetch(");
    expect(minimalShell).not.toContain("toolbarCarouselRef");
    expect(minimalShell).not.toContain("canScrollLeft: false");
    expect(minimalShell).not.toContain("canScrollRight: false");
    expect(minimalShell).not.toContain("onScrollLeft: () => undefined");
    expect(minimalShell).not.toContain("onScrollRight: () => undefined");
  });

  it("owns the surface frame display while submit and audio priming stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const consoleStack = read("client/src/components/helix/ask-console/HelixAskConsoleStack.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const surfaceFrame = read("client/src/components/helix/ask-console/HelixAskSurfaceFrame.tsx");
    const surfaceFrameSurface = read("client/src/components/helix/ask-console/HelixAskSurfaceFrameSurface.tsx");
    const surfaceFrameState = read("client/src/components/helix/ask-console/HelixAskSurfaceFrameState.ts");
    const surfaceContentState = read("client/src/components/helix/ask-console/HelixAskLegacySurfaceContentState.ts");
    const legacyConsoleRootState = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleRootState.ts");
    const legacyConsoleViewState = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleViewState.ts");

    expect(legacyPill).toContain("<HelixAskLegacyConsoleView");
    expect(legacyPill).not.toContain("<HelixAskSurfaceFrameSurface");
    expect(legacyPill).toContain("const surfaceFrameState = buildHelixAskSurfaceFrameState({");
    expect(legacyPill).toContain("const legacyConsoleRootState = buildHelixAskLegacyConsoleRootState({");
    expect(legacyPill).toContain("const legacyConsoleViewState = buildHelixAskLegacyConsoleViewState({");
    expect(legacyPill).toContain("...legacyConsoleRootState");
    expect(legacyPill).toContain("surfaceFrameState,");
    expect(legacyPill).toContain("{...legacyConsoleViewState}");
    expect(legacyPill).not.toContain("surfaceFrameState={surfaceFrameState}");
    expect(legacyPill).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(legacyPill).toContain("surfaceContentState,");
    expect(legacyPill).not.toContain("surfaceContentState={surfaceContentState}");
    expect(legacyPill).not.toContain("surfaceContentState={{");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskSurfaceFrame"');
    expect(legacyPill).toContain("maxWidthClassName: maxWidthClass");
    expect(legacyPill).toContain("maxWidthStyle: formMaxWidthStyle");
    expect(legacyPill).toContain("surfaceBorderClassName: moodPalette.surfaceBorder");
    expect(legacyPill).toContain("surfaceTintClassName: moodPalette.surfaceTint");
    expect(legacyPill).toContain("surfaceHaloClassName: moodPalette.surfaceHalo");
    expect(legacyPill).toContain("isOffline,");
    expect(legacyPill).toContain("onSubmit: handleAskSubmit");
    expect(legacyPill).toContain("void primeVoiceAudioPlayback()");
    expect(legacyPill).not.toContain("shadow-[0_24px_60px_rgba(0,0,0,0.55)]");
    expect(legacyPill).not.toContain("Offline - reconnecting\n");

    expect(consoleStack).toContain("export function HelixAskConsoleStack");
    expect(consoleStack).toContain('layoutVariant === "dock" ? "min-h-0" : ""');
    expect(consoleStack).not.toContain("<form");
    expect(consoleStack).not.toContain("onSubmit");
    expect(consoleStack).not.toContain("runAskTurn");

    expect(surfaceFrame).toContain("export function HelixAskSurfaceFrame");
    expect(surfaceFrame).not.toContain('layoutVariant === "dock" ? "min-h-0" : ""');
    expect(surfaceFrame).toContain("transition-[max-width] duration-300 ease-out");
    expect(surfaceFrame).toContain("shadow-[0_24px_60px_rgba(0,0,0,0.55)]");
    expect(surfaceFrame).toContain("surfaceBorderClassName");
    expect(surfaceFrame).toContain("surfaceTintClassName");
    expect(surfaceFrame).toContain("surfaceHaloClassName");
    expect(surfaceFrame).toContain("onPointerDownCapture={onPrimeInteraction}");
    expect(surfaceFrame).toContain("onTouchStartCapture={onPrimeInteraction}");
    expect(surfaceFrame).toContain("onClickCapture={onPrimeInteraction}");
    expect(surfaceFrame).toContain("Offline - reconnecting");
    expect(surfaceFrame).not.toContain("handleAskSubmit");
    expect(surfaceFrame).not.toContain("primeVoiceAudioPlayback");
    expect(surfaceFrame).not.toContain("moodPalette");
    expect(surfaceFrame).not.toContain("setAskReplies");
    expect(surfaceFrame).not.toContain("runAskTurn");
    expect(surfaceFrameSurface).toContain("export function HelixAskSurfaceFrameSurface");
    expect(surfaceFrameSurface).toContain("<HelixAskSurfaceFrame {...props} />");
    expect(surfaceFrameSurface).not.toContain("handleAskSubmit");
    expect(surfaceFrameSurface).not.toContain("primeVoiceAudioPlayback");
    expect(surfaceFrameSurface).not.toContain("moodPalette");
    expect(surfaceFrameSurface).not.toContain("setAskReplies");
    expect(surfaceFrameSurface).not.toContain("runAskTurn");
    expect(surfaceFrameSurface).not.toContain("fetch(");
    expect(surfaceFrameSurface).not.toContain("navigator.clipboard");
    expect(surfaceFrameSurface).not.toContain("speechSynthesis");
    expect(surfaceFrameState).toContain("export function buildHelixAskSurfaceFrameState");
    expect(surfaceFrameState).toContain("maxWidthClassName");
    expect(surfaceFrameState).toContain("surfaceBorderClassName");
    expect(surfaceFrameState).toContain("onSubmit");
    expect(surfaceFrameState).toContain("onPrimeInteraction");
    expect(surfaceFrameState).not.toMatch(/from ["']react["']/);
    expect(surfaceFrameState).not.toContain("@/store/");
    expect(surfaceFrameState).not.toContain("@/components/helix/HelixAskPill");
    expect(surfaceFrameState).not.toContain("handleAskSubmit");
    expect(surfaceFrameState).not.toContain("primeVoiceAudioPlayback");
    expect(surfaceFrameState).not.toContain("moodPalette");
    expect(surfaceFrameState).not.toContain("setAskReplies");
    expect(surfaceFrameState).not.toContain("runAskTurn");
    expect(surfaceFrameState).not.toContain("fetch(");
    expect(surfaceFrameState).not.toContain("navigator.clipboard");
    expect(surfaceFrameState).not.toContain("speechSynthesis");
    expect(surfaceContentState).toContain("export function buildHelixAskLegacySurfaceContentState");
    expect(surfaceContentState).toContain("composer");
    expect(surfaceContentState).toContain("supplement");
    expect(surfaceContentState).toContain("reasoningTheater");
    expect(surfaceContentState).not.toMatch(/from ["']react["']/);
    expect(surfaceContentState).not.toContain("@/store/");
    expect(surfaceContentState).not.toContain("@/components/helix/HelixAskPill");
    expect(surfaceContentState).not.toContain("setAskReplies");
    expect(surfaceContentState).not.toContain("runAskTurn");
    expect(surfaceContentState).not.toContain("fetch(");
    expect(surfaceContentState).not.toContain("navigator.clipboard");
    expect(surfaceContentState).not.toContain("speechSynthesis");
    expect(legacyConsoleRootState).toContain("export function buildHelixAskLegacyConsoleRootState");
    expect(legacyConsoleRootState).toContain("className");
    expect(legacyConsoleRootState).toContain("layoutVariant");
    expect(legacyConsoleRootState).not.toMatch(/from ["']react["']/);
    expect(legacyConsoleRootState).not.toContain("@/store/");
    expect(legacyConsoleRootState).not.toContain("@/components/helix/HelixAskPill");
    expect(legacyConsoleRootState).not.toContain("buildHelixAskConsoleRuntimeBridgeProps");
    expect(legacyConsoleRootState).not.toContain("runAskTurn");
    expect(legacyConsoleRootState).not.toContain("fetch(");
    expect(legacyConsoleRootState).not.toContain("navigator.clipboard");
    expect(legacyConsoleRootState).not.toContain("speechSynthesis");
    expect(legacyConsoleViewState).toContain("export function buildHelixAskLegacyConsoleViewState");
    for (const prop of [
      "className",
      "layoutVariant",
      "surfaceFrameState",
      "surfaceContentState",
      "goalPillState",
      "errorLineState",
      "turnListState",
    ]) {
      expect(legacyConsoleViewState).toContain(prop);
    }
    expect(legacyConsoleViewState).not.toMatch(/from ["']react["']/);
    expect(legacyConsoleViewState).not.toContain("@/store/");
    expect(legacyConsoleViewState).not.toContain("@/components/helix/HelixAskPill");
    expect(legacyConsoleViewState).not.toContain("turnListContent");
    expect(legacyConsoleViewState).not.toContain("turnListRef");
    expect(legacyConsoleViewState).not.toContain("onDebugDrawerClose");
    expect(legacyConsoleViewState).not.toContain("setDebugExportDrawer");
    expect(legacyConsoleViewState).not.toContain("runAskTurn");
    expect(legacyConsoleViewState).not.toContain("fetch(");
    expect(legacyConsoleViewState).not.toContain("navigator.clipboard");
    expect(legacyConsoleViewState).not.toContain("speechSynthesis");
    expect(legacyConsoleView).toContain("surfaceFrameState");
    expect(legacyConsoleView).toContain("<HelixAskSurfaceFrameSurface {...surfaceFrameState}>");
    expect(legacyConsoleView).toContain("surfaceContent ?? (surfaceContentState ? <HelixAskLegacySurfaceContent {...surfaceContentState} /> : null)");
    expect(legacyConsoleView).not.toContain("handleAskSubmit");
    expect(legacyConsoleView).not.toContain("primeVoiceAudioPlayback");
    expect(legacyConsoleView).not.toContain("moodPalette");
  });

  it("owns legacy console view slot composition while live state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const legacyConsoleRootState = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleRootState.ts");
    const legacyConsoleViewState = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleViewState.ts");
    const runtimeLayout = read("client/src/components/helix/ask-console/HelixAskConsoleRuntimeLayout.tsx");
    const ownershipMap = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");

    expect(legacyPill).toContain("<HelixAskLegacyConsoleView");
    expect(legacyPill).toContain("const legacyConsoleRootState = buildHelixAskLegacyConsoleRootState({");
    expect(legacyPill).toContain("const legacyConsoleViewState = buildHelixAskLegacyConsoleViewState({");
    expect(legacyPill).toContain("...legacyConsoleRootState");
    expect(legacyPill).toContain("{...legacyConsoleViewState}");
    expect(legacyPill).toContain("surfaceFrameState,");
    expect(legacyPill).not.toContain("surfaceFrameState={surfaceFrameState}");
    expect(legacyPill).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(legacyPill).toContain("surfaceContentState,");
    expect(legacyPill).not.toContain("surfaceContentState={surfaceContentState}");
    expect(legacyPill).not.toContain("surfaceContentState={{");
    expect(legacyPill).toContain("const goalPillState = buildHelixAskGoalPillState({");
    expect(legacyPill).toContain("goalPillState,");
    expect(legacyPill).not.toContain("goalPillState={goalPillState}");
    expect(legacyPill).not.toContain("goalPill={");
    expect(legacyPill).not.toContain("<HelixAskGoalPillSurface");
    expect(legacyPill).not.toContain("steeringQueue={<HelixAskSteeringQueueSurface />}");
    expect(legacyPill).toContain("const errorLineState = buildHelixAskConsoleErrorLineState({");
    expect(legacyPill).toContain("message: askError");
    expect(legacyPill).toContain("errorLineState,");
    expect(legacyPill).not.toContain("errorLineState={errorLineState}");
    expect(legacyPill).not.toContain("errorMessage={askError}");
    expect(legacyPill).not.toContain("errorLine={<HelixAskConsoleErrorLineSurface message={askError} />}");
    expect(legacyPill).toContain("const turnListState = buildHelixAskActiveTurnListState({");
    expect(legacyPill).toContain("turnListState,");
    expect(legacyPill).not.toContain("turnListState={turnListState}");
    expect(legacyPill).toContain("turnListContent={");
    expect(legacyPill).not.toContain("turnList={chronologicalAskReplies.length > 0 || visibleActiveTurnStreamRows.length > 0 ? (");
    expect(legacyPill).toContain("debugDrawerState={debugExportDrawer}");
    expect(legacyPill).toContain("onDebugDrawerClose={() => setDebugExportDrawer(null)}");
    expect(legacyPill).not.toContain("<HelixAskDebugDrawerSurface");
    expect(legacyPill).toContain("setAskGoalPillExpanded");
    expect(legacyPill).not.toContain("setSteeringQueueExpanded");
    expect(legacyPill).toContain("setDebugExportDrawer(null)");
    expect(legacyConsoleRootState).toContain("export function buildHelixAskLegacyConsoleRootState");
    expect(legacyConsoleRootState).toContain("className");
    expect(legacyConsoleRootState).toContain("layoutVariant");
    expect(legacyConsoleRootState).not.toMatch(/from ["']react["']/);
    expect(legacyConsoleRootState).not.toContain("@/store/");
    expect(legacyConsoleRootState).not.toContain("@/components/helix/HelixAskPill");
    expect(legacyConsoleRootState).not.toContain("buildHelixAskConsoleRuntimeBridgeProps");
    expect(legacyConsoleRootState).not.toContain("runAskTurn");
    expect(legacyConsoleRootState).not.toContain("fetch(");
    expect(legacyConsoleRootState).not.toContain("navigator.clipboard");
    expect(legacyConsoleRootState).not.toContain("speechSynthesis");
    expect(legacyConsoleViewState).toContain("export function buildHelixAskLegacyConsoleViewState");
    expect(legacyConsoleViewState).toContain("surfaceFrameState");
    expect(legacyConsoleViewState).toContain("surfaceContentState");
    expect(legacyConsoleViewState).toContain("goalPillState");
    expect(legacyConsoleViewState).toContain("errorLineState");
    expect(legacyConsoleViewState).toContain("turnListState");
    expect(legacyConsoleViewState).not.toContain("turnListContent");
    expect(legacyConsoleViewState).not.toContain("turnListRef");
    expect(legacyConsoleViewState).not.toContain("onDebugDrawerClose");

    expect(legacyConsoleView).toContain("export function HelixAskLegacyConsoleView");
    expect(legacyConsoleView).toContain("surfaceFrameState");
    expect(legacyConsoleView).toContain("<HelixAskSurfaceFrameSurface {...surfaceFrameState}>");
    expect(legacyConsoleView).toContain("surfaceContent ?? (surfaceContentState ? <HelixAskLegacySurfaceContent {...surfaceContentState} /> : null)");
    expect(legacyConsoleView).toContain("goalPillState");
    expect(legacyConsoleView).toContain("goalPill={goalPill ?? (goalPillState ? <HelixAskGoalPillSurface {...goalPillState} /> : null)}");
    expect(legacyConsoleView).toContain("turnListState");
    expect(legacyConsoleView).toContain("<HelixAskTurnListSurface {...turnListState} ref={turnListRef}>");
    expect(legacyConsoleView).toContain("errorLineState");
    expect(legacyConsoleView).toContain("errorMessage");
    expect(legacyConsoleView).toContain("errorLine={errorLine ?? <HelixAskConsoleErrorLineSurface {...(errorLineState ?? { message: errorMessage })} />}");
    expect(legacyConsoleView).toContain("steeringQueue");
    expect(legacyConsoleView).toContain("steeringQueue={steeringQueue ?? <HelixAskSteeringQueueSurface />}");
    expect(legacyConsoleView).toContain("debugDrawerState");
    expect(legacyConsoleView).toContain("<HelixAskDebugDrawerSurface");
    expect(legacyConsoleView).toContain("drawerState={debugDrawerState}");
    expect(legacyConsoleView).toContain("onClose={onDebugDrawerClose ?? undefined}");
    expect(legacyConsoleView).not.toContain("useState");
    expect(legacyConsoleView).not.toContain("fetch(");
    expect(legacyConsoleView).not.toContain("navigator.clipboard");
    expect(legacyConsoleView).not.toContain("speechSynthesis");

    expect(runtimeLayout).toContain("export function HelixAskConsoleRuntimeLayout");
    expect(runtimeLayout).toContain("<HelixAskErrorBoundary>");
    expect(runtimeLayout).toContain("<HelixAskConsoleStack className={className} layoutVariant={layoutVariant}>");
    for (const slot of ["{surface}", "{goalPill}", "{steeringQueue}", "{errorLine}", "{turnList}", "{debugDrawer}"]) {
      expect(runtimeLayout).toContain(slot);
    }
    expect(runtimeLayout.indexOf("{turnList}")).toBeLessThan(runtimeLayout.indexOf("{steeringQueue}"));
    expect(runtimeLayout).not.toContain("askGoalSession");
    expect(runtimeLayout).not.toContain("chronologicalAskReplies");
    expect(runtimeLayout).not.toContain("setAskGoalPillExpanded");
    expect(runtimeLayout).not.toContain("setSteeringQueueExpanded");
    expect(runtimeLayout).not.toContain("setDebugExportDrawer");
    expect(runtimeLayout).not.toContain("runAskTurn");
    expect(runtimeLayout).not.toContain("fetch(");
    expect(ownershipMap).toContain("Legacy console view and runtime layout slot composition");
    expect(ownershipMap).toContain("HelixAskLegacyConsoleView");
    expect(ownershipMap).toContain("HelixAskConsoleRuntimeLayout");
    expect(ownershipMap).toContain("HelixAskLegacyTurnControls");
  });

  it("owns surface composer slot layout while composer behavior stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const legacyComposerState = read("client/src/components/helix/ask-console/HelixAskLegacyComposerState.ts");
    const actionToolbarState = read("client/src/components/helix/ask-console/HelixAskComposerActionToolbarState.ts");
    const textareaState = read("client/src/components/helix/ask-console/HelixAskComposerTextareaState.ts");
    const promptHistory = read("client/src/components/helix/ask-console/HelixAskPromptHistory.ts");
    const slashCommandCatalog = read("client/src/components/helix/ask-console/HelixAskSlashCommandCatalog.ts");
    const slashCommandInsertion = read("client/src/components/helix/ask-console/HelixAskSlashCommandInsertion.ts");
    const slashCommandMenu = read("client/src/components/helix/ask-console/HelixAskSlashCommandMenu.tsx");
    const slashCommandMenuState = read("client/src/components/helix/ask-console/HelixAskSlashCommandMenuState.ts");
    const composerPanel = read("client/src/components/helix/ask-console/HelixAskSurfaceComposerPanel.tsx");

    expect(legacyPill).toContain("const composerState = buildHelixAskLegacyComposerState({");
    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).not.toContain("<HelixAskSurfaceComposerPanel");
    expect(legacyPill).toContain("const voiceLevelMonitorState = buildHelixAskVoiceLevelMonitorState({");
    expect(legacyPill).toContain("voiceLevelMonitor: voiceLevelMonitorState");
    expect(legacyPill).toContain("const moodAvatarState = buildHelixAskMoodAvatarState({");
    expect(legacyPill).toContain("moodAvatar: moodAvatarState");
    expect(legacyPill).not.toContain("moodAvatar: {");
    expect(legacyPill).toContain("const actionToolbarState = buildHelixAskComposerActionToolbarState({");
    expect(legacyPill).toContain("actionToolbar: actionToolbarState");
    expect(legacyPill).not.toContain("actionToolbar: {");
    expect(legacyPill).toContain("const textareaState = buildHelixAskComposerTextareaState({");
    expect(legacyPill).toContain("textarea: textareaState");
    expect(legacyPill).not.toContain("textarea: {");
    expect(legacyPill).toContain("triggerAskActionHaptic");
    expect(legacyPill).toContain("handleAskImageSelect");
    expect(legacyPill).toContain("handleVoiceInputToggle");
    expect(legacyPill).toContain("syncAskDraftValue");
    expect(legacyPill).toContain("handleAskPromptHistoryKeyDown");
    expect(legacyPill).toContain("resolveHelixAskPromptHistoryNavigation({");
    expect(legacyPill).toContain("buildHelixAskSlashCommandMenuItems({");
    expect(legacyPill).toContain("insertAskSlashCommandMenuItem");
    expect(legacyPill).toContain("slashCommandMenu: (");
    expect(legacyPill).not.toContain("const HELIX_ASK_SLASH_COMMAND_CATALOG");
    expect(legacyPill).not.toContain('<div className="flex flex-col gap-2 px-4 py-3">');

    expect(legacyComposerSurface).toContain("export function HelixAskLegacyComposerSurface");
    expect(legacyComposerSurface).toContain("<HelixAskSurfaceComposerPanel");
    expect(legacyComposerSurface).toContain("<HelixAskVoiceLevelMonitorSurface {...voiceLevelMonitor}");
    expect(legacyComposerSurface).toContain("<HelixAskMoodAvatarSurface {...moodAvatar}");
    expect(legacyComposerSurface).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(legacyComposerSurface).toContain("<HelixAskComposerTextareaSurface {...textarea} ref={textareaRef} />");
    expect(legacyComposerSurface).toContain("slashCommandMenu={slashCommandMenu}");
    expect(legacyComposerState).toContain("export function buildHelixAskLegacyComposerState");
    expect(legacyComposerState).toContain("slashCommandMenu");
    expect(legacyComposerState).not.toContain("triggerAskActionHaptic");
    expect(legacyComposerState).not.toContain("handleAskImageSelect");
    expect(legacyComposerState).not.toContain("handleVoiceInputToggle");
    expect(actionToolbarState).toContain("export function buildHelixAskComposerActionToolbarState");
    expect(actionToolbarState).toContain("runtimePickerModel");
    expect(actionToolbarState).toContain("submitViewModel");
    expect(actionToolbarState).toContain("onStop");
    expect(actionToolbarState).not.toMatch(/from [\"']react[\"']/);
    expect(actionToolbarState).not.toContain("@/store/");
    expect(actionToolbarState).not.toContain("@/components/helix/HelixAskPill");
    expect(actionToolbarState).not.toContain("triggerAskActionHaptic");
    expect(actionToolbarState).not.toContain("handleVoiceInputToggle");
    expect(actionToolbarState).not.toContain("handleStop");
    expect(actionToolbarState).not.toContain("runAskTurn");
    expect(actionToolbarState).not.toContain("fetch(");
    expect(actionToolbarState).not.toContain("navigator.clipboard");
    expect(actionToolbarState).not.toContain("speechSynthesis");
    expect(textareaState).toContain("export function buildHelixAskComposerTextareaState");
    expect(textareaState).toContain("ariaDisabled");
    expect(textareaState).toContain("onKeyDown");
    expect(textareaState).toContain("onInputValue");
    expect(textareaState).toContain("onSubmitRequested");
    expect(textareaState).not.toMatch(/from [\"']react[\"']/);
    expect(textareaState).not.toContain("@/store/");
    expect(textareaState).not.toContain("@/components/helix/HelixAskPill");
    expect(textareaState).not.toContain("syncAskDraftValue");
    expect(textareaState).not.toContain("handleAskPaste");
    expect(textareaState).not.toContain("resolveHelixAskPromptHistoryNavigation");
    expect(textareaState).not.toContain("runAskTurn");
    expect(textareaState).not.toContain("fetch(");
    expect(textareaState).not.toContain("navigator.clipboard");
    expect(textareaState).not.toContain("speechSynthesis");
    expect(legacyComposerSurface).not.toContain("triggerAskActionHaptic");
    expect(legacyComposerSurface).not.toContain("handleAskImageSelect");
    expect(legacyComposerSurface).not.toContain("handleVoiceInputToggle");
    expect(legacyComposerSurface).not.toContain("syncAskDraftValue");
    expect(promptHistory).toContain("export function buildHelixAskPromptHistoryEntries");
    expect(promptHistory).toContain("export function resolveHelixAskPromptHistoryNavigation");
    expect(promptHistory).toContain("export function shouldHandleHelixAskPromptHistoryKey");
    expect(promptHistory).not.toContain("useRef");
    expect(promptHistory).not.toContain("setSelectionRange");
    expect(promptHistory).not.toContain("runAskTurn");
    expect(promptHistory).not.toContain("fetch(");
    expect(slashCommandCatalog).toContain("export function buildHelixAskSlashCommandMenuItems");
    expect(slashCommandCatalog).toContain("export function buildHelixAskSlashCommandCatalogForPolicy");
    expect(slashCommandCatalog).toContain("buildHelixAskGeneratedSlashCommandForCapability");
    expect(slashCommandCatalog).toContain("allowed_workstation_capabilities");
    expect(slashCommandCatalog).toContain("resolveHelixWorkstationCapabilityAccess");
    expect(slashCommandInsertion).toContain("export function resolveHelixAskSlashCommandTrigger");
    expect(slashCommandInsertion).toContain("export function insertHelixAskSlashCommandPrompt");
    expect(slashCommandMenuState).toContain("export function buildHelixAskSlashCommandMenuState");
    expect(slashCommandMenuState).toContain("export function resolveHelixAskSlashCommandMenuKey");
    expect(slashCommandMenu).toContain("export function HelixAskSlashCommandMenu");
    expect(slashCommandMenu).toContain('data-testid="helix-ask-slash-command-menu"');
    expect(slashCommandMenu).toContain("createPortal(menu, document.body)");
    expect(slashCommandMenu).toContain('data-testid="helix-ask-slash-command-anchor"');
    expect(slashCommandMenu).toContain("getBoundingClientRect()");
    expect(slashCommandMenu).toContain("z-[2147483000]");
    for (const slashOwner of [
      slashCommandCatalog,
      slashCommandInsertion,
      slashCommandMenu,
      slashCommandMenuState,
    ]) {
      expect(slashOwner).not.toContain("@/components/helix/HelixAskPill");
      expect(slashOwner).not.toContain("@/store/");
      expect(slashOwner).not.toContain("runAskTurn");
      expect(slashOwner).not.toContain("requestSubmit");
      expect(slashOwner).not.toContain("navigator.clipboard");
      expect(slashOwner).not.toContain("speechSynthesis");
      expect(slashOwner).not.toContain("terminal_authority");
    }
    expect(slashCommandMenu).not.toContain("fetch(");
    expect(slashCommandInsertion).not.toContain("fetch(");
    expect(slashCommandMenuState).not.toContain("fetch(");
    expect(legacyComposerSurface).not.toContain("runAskTurn");
    expect(legacyComposerSurface).not.toContain("fetch(");
    expect(composerPanel).toContain("export function HelixAskSurfaceComposerPanel");
    expect(composerPanel).toContain("{voiceLevelMonitor}");
    expect(composerPanel).toContain("{moodAvatar}");
    expect(composerPanel).toContain("{actionToolbar}");
    expect(composerPanel).toContain("{slashCommandMenu}");
    expect(composerPanel).toContain("{textarea}");
    expect(composerPanel).toContain('className="relative z-[80] flex flex-col gap-2 px-4 py-3"');
    expect(composerPanel).toContain('className="relative z-[90] min-w-0 overflow-visible"');
    expect(composerPanel).not.toContain("triggerAskActionHaptic");
    expect(composerPanel).not.toContain("handleAskImageSelect");
    expect(composerPanel).not.toContain("handleVoiceInputToggle");
    expect(composerPanel).not.toContain("syncAskDraftValue");
    expect(composerPanel).not.toContain("runAskTurn");
    expect(composerPanel).not.toContain("fetch(");

    const onStop = vi.fn();
    expect(buildHelixAskComposerActionToolbarState({
      onCarouselScrollIntent: vi.fn(),
      onImageSelect: vi.fn(),
      onAttachImage: vi.fn(),
      micEnabled: true,
      onToggleMic: vi.fn(),
      onRetryVoiceSample: vi.fn(),
      visualSituationSourceStatus: "idle",
      onCaptureVisualSource: vi.fn(),
      visualSituationIncludeAudio: false,
      onToggleVisualAudio: vi.fn(),
      runtimePickerModel: {
        selectedRuntime: "helix",
        selectedLabel: "Helix",
        providers: [],
        disabled: false,
      },
      runtimeMenuOpen: false,
      onRuntimePrimaryClick: vi.fn(),
      onRuntimeSelect: vi.fn(),
      liveRuntimeControlsModel: buildHelixAskLiveRuntimeControlsModel({
        accountPolicy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        lifecycleState: "transcript_received",
      }),
      submitViewModel: buildHelixAskComposerViewModel({
        busy: false,
        placeholder: "Ask Helix",
        runtimeLabel: "Helix",
      }),
      onSubmitIntent: vi.fn(),
      onStop,
    })).toMatchObject({
      onCarouselScrollIntent: expect.any(Function),
      micEnabled: true,
      visualSituationSourceStatus: "idle",
      runtimeMenuOpen: false,
      liveRuntimeControlsModel: expect.objectContaining({
        lifecycleState: "transcript_received",
        lifecycleLabel: "Transcript",
      }),
      onStop,
    });

    const onInputValue = vi.fn();
    const onSubmitRequested = vi.fn();
    const onKeyDown = vi.fn();
    expect(buildHelixAskComposerTextareaState({
      ariaDisabled: true,
      className: "textarea",
      placeholder: "Ask Codex",
      onPaste: vi.fn(),
      onKeyDown,
      onInputValue,
      onSubmitRequested,
    })).toMatchObject({
      ariaDisabled: true,
      className: "textarea",
      placeholder: "Ask Codex",
      onKeyDown,
      onInputValue,
      onSubmitRequested,
    });
  });

  it("owns surface supplemental slot order while supplemental behavior stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const supplementStack = read("client/src/components/helix/ask-console/HelixAskSurfaceSupplementStack.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const supplementState = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementState.ts");
    const attachmentStripState = read("client/src/components/helix/ask-console/HelixAskAttachmentStripState.ts");
    const supplementClipTextState = read("client/src/components/helix/ask-console/HelixAskSupplementClipTextState.ts");
    const contextCapsuleState = read("client/src/components/helix/ask-console/HelixAskContextCapsuleState.ts");
    const situationRoomSourceState = read("client/src/components/helix/ask-console/HelixAskSituationRoomSourceState.ts");
    const voiceConfirmationState = read("client/src/components/helix/ask-console/HelixAskVoiceConfirmationState.ts");
    const voiceStatusState = read("client/src/components/helix/ask-console/HelixAskVoiceStatusState.ts");
    const voiceCaptureHealthState = read(
      "client/src/components/helix/ask-console/HelixAskVoiceCaptureHealthState.ts",
    );
    const voiceCaptureDiagnosticsState = read(
      "client/src/components/helix/ask-console/HelixAskVoiceCaptureDiagnosticsState.ts",
    );
    const voiceFeatureFlagsState = read(
      "client/src/components/helix/ask-console/HelixAskVoiceFeatureFlagsState.ts",
    );
    const contextChooserState = read("client/src/components/helix/ask-console/HelixAskContextChooserState.ts");
    const observerSupplementState = read("client/src/components/helix/ask-console/HelixAskObserverSupplementState.ts");
    const contextMemoryStatusState = read(
      "client/src/components/helix/ask-console/HelixAskContextMemoryStatusState.ts",
    );

    expect(legacyPill).toContain("const supplementState = buildHelixAskConsoleSupplementState({");
    expect(legacyPill).toContain("supplement: supplementState");
    expect(legacyPill).toContain("const attachmentStripState = buildHelixAskAttachmentStripState({");
    expect(legacyPill).toContain("const supplementClipTextState = buildHelixAskSupplementClipTextState({");
    expect(legacyPill).toContain("const contextCapsuleState = buildHelixAskContextCapsuleState({");
    expect(legacyPill).toContain("const situationRoomSourceState = buildHelixAskSituationRoomSourceDerivedState({");
    expect(legacyPill).toContain("const voiceCommandConfirmationState = buildHelixAskVoiceCommandConfirmationState({");
    expect(legacyPill).toContain("const transcriptConfirmationState = buildHelixAskTranscriptConfirmationState({");
    expect(legacyPill).toContain("const voiceStatusSupplementState = buildHelixAskVoiceStatusDerivedState({");
    expect(legacyPill).toContain("const voiceCaptureHealth = useMemo<HelixAskVoiceCaptureHealthSnapshot>(() =>");
    expect(legacyPill).toContain("buildHelixAskVoiceCaptureHealthState({");
    expect(legacyPill).toContain("const voiceFeatureFlagsState = useMemo(");
    expect(legacyPill).toContain("buildHelixAskVoiceFeatureFlagsState({");
    expect(legacyPill).toContain("const voiceCaptureDiagnosticsBaseState = useMemo(");
    expect(legacyPill).toContain("buildHelixAskVoiceCaptureDiagnosticsBaseState({");
    expect(legacyPill).toContain("voiceFeatureFlags: voiceFeatureFlagsState");
    expect(legacyPill).toContain("...voiceCaptureDiagnosticsBaseState");
    expect(legacyPill).toContain("nowMs: Date.now()");
    expect(legacyPill).not.toContain("const hasWarningCheckpoint = voiceCaptureCheckpointList.some(");
    expect(legacyPill).not.toContain("VOICE_CAPTURE_CHECKPOINT_LABEL[checkpoint.key]");
    expect(legacyPill).toContain("const contextChooserState = buildHelixAskContextChooserState({");
    expect(legacyPill).toContain("const observerSupplementState = buildHelixAskObserverSupplementState({");
    expect(legacyPill).toContain("const contextMemoryStatusState = buildHelixAskContextMemoryStatusState({");
    for (const slot of [
      "...attachmentStripState",
      "...contextCapsuleState",
      "...voiceStatusSupplementState",
      "situationRoomSource: situationRoomSourceState",
      "voiceCommandConfirmation: voiceCommandConfirmationState",
      "transcriptConfirmation: transcriptConfirmationState",
      "contextChooser: contextChooserState",
      "...observerSupplementState",
      "...contextMemoryStatusState",
      "...supplementClipTextState",
    ]) {
      expect(legacyPill).toContain(slot);
    }
    expect(supplementState).toContain("export function buildHelixAskConsoleSupplementState");
    expect(supplementState).toContain("situationRoomSource");
    expect(supplementState).toContain("voiceCommandConfirmation");
    expect(supplementState).toContain("transcriptConfirmation");
    expect(supplementState).toContain("contextChooser");
    expect(supplementState).toContain("observerLaneEvents");
    expect(supplementState).not.toContain("triggerAskActionHaptic");
    expect(supplementState).not.toContain("setAskReplies");
    expect(supplementState).not.toContain("fetch(");
    expect(supplementState).not.toContain("navigator.clipboard");
    expect(supplementState).not.toContain("speechSynthesis");
    expect(attachmentStripState).toContain("export function buildHelixAskAttachmentStripState");
    expect(attachmentStripState).toContain("attachmentItems");
    expect(attachmentStripState).toContain("onRemoveAttachment");
    expect(attachmentStripState).not.toMatch(/from ["']react["']/);
    expect(attachmentStripState).not.toContain("@/store/");
    expect(attachmentStripState).not.toContain("@/components/helix/HelixAskPill");
    expect(attachmentStripState).not.toContain("removeAskAttachment");
    expect(attachmentStripState).not.toContain("validateHelixAskAttachmentForSubmit");
    expect(attachmentStripState).not.toContain("buildHelixAskAttachmentTurnInputItems");
    expect(attachmentStripState).not.toContain("runAskTurn");
    expect(attachmentStripState).not.toContain("fetch(");
    expect(attachmentStripState).not.toContain("navigator.clipboard");
    expect(attachmentStripState).not.toContain("speechSynthesis");
    expect(supplementClipTextState).toContain("export function buildHelixAskSupplementClipTextState");
    expect(supplementClipTextState).toContain("clipText");
    expect(supplementClipTextState).not.toMatch(/from ["']react["']/);
    expect(supplementClipTextState).not.toContain("@/store/");
    expect(supplementClipTextState).not.toContain("@/components/helix/HelixAskPill");
    expect(supplementClipTextState).not.toContain("coerceText");
    expect(supplementClipTextState).not.toContain("runAskTurn");
    expect(supplementClipTextState).not.toContain("fetch(");
    expect(supplementClipTextState).not.toContain("navigator.clipboard");
    expect(supplementClipTextState).not.toContain("speechSynthesis");
    expect(contextCapsuleState).toContain("export function buildHelixAskContextCapsuleState");
    expect(contextCapsuleState).toContain("contextCapsulePreview");
    expect(contextCapsuleState).toContain("contextCapsuleAutoApplied");
    expect(contextCapsuleState).not.toMatch(/from ["']react["']/);
    expect(contextCapsuleState).not.toContain("@/store/");
    expect(contextCapsuleState).not.toContain("@/components/helix/HelixAskPill");
    expect(contextCapsuleState).toContain("export function buildHelixAskActiveContextCapsuleDerivedState");
    expect(contextCapsuleState).toContain("sessionCapsuleState");
    expect(contextCapsuleState).not.toContain("copyHelixAskContextCapsuleToClipboard");
    expect(contextCapsuleState).not.toContain("runAskTurn");
    expect(contextCapsuleState).not.toContain("fetch(");
    expect(contextCapsuleState).not.toContain("navigator.clipboard");
    expect(contextCapsuleState).not.toContain("speechSynthesis");
    expect(situationRoomSourceState).toContain("export function buildHelixAskSituationRoomSourceState");
    expect(situationRoomSourceState).toContain("export function buildHelixAskSituationRoomSourceDerivedState");
    expect(situationRoomSourceState).toContain("visible");
    expect(situationRoomSourceState).toContain("label");
    expect(situationRoomSourceState).toContain("status");
    expect(situationRoomSourceState).toContain("sourceCount");
    expect(situationRoomSourceState).toContain("displayAudioSourceSnapshot?.transcript_preview");
    expect(situationRoomSourceState).toContain("situationRoomState.recentTranscript");
    expect(situationRoomSourceState).toContain("situationRoomState.recentEvents.length");
    expect(situationRoomSourceState).toContain("onStopDisplayAudio");
    expect(situationRoomSourceState).not.toMatch(/from ["']react["']/);
    expect(situationRoomSourceState).not.toContain("@/store/");
    expect(situationRoomSourceState).not.toContain("@/components/helix/HelixAskPill");
    expect(situationRoomSourceState).not.toContain("useSituationRoomStore");
    expect(situationRoomSourceState).not.toContain("displayAudioSourceIdRef");
    expect(situationRoomSourceState).not.toContain("visualSituationSourceIdRef");
    expect(situationRoomSourceState).not.toContain("stopDisplayAudioCapture");
    expect(situationRoomSourceState).not.toContain("runAskTurn");
    expect(situationRoomSourceState).not.toContain("fetch(");
    expect(situationRoomSourceState).not.toContain("navigator.clipboard");
    expect(situationRoomSourceState).not.toContain("speechSynthesis");
    expect(voiceConfirmationState).toContain("export function buildHelixAskVoiceCommandConfirmationState");
    expect(voiceConfirmationState).toContain("export function buildHelixAskTranscriptConfirmationState");
    expect(voiceConfirmationState).toContain("actionLabel");
    expect(voiceConfirmationState).toContain("sourceLanguage");
    expect(voiceConfirmationState).toContain("translationUncertain");
    expect(voiceConfirmationState).not.toMatch(/from ["']react["']/);
    expect(voiceConfirmationState).not.toContain("@/store/");
    expect(voiceConfirmationState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceConfirmationState).not.toContain("describeVoiceCommandAction");
    expect(voiceConfirmationState).not.toContain("commandConfirmState");
    expect(voiceConfirmationState).not.toContain("transcriptConfirmState");
    expect(voiceConfirmationState).not.toContain("handleCommandConfirmationAccept");
    expect(voiceConfirmationState).not.toContain("handleTranscriptConfirmationAccept");
    expect(voiceConfirmationState).not.toContain("runAskTurn");
    expect(voiceConfirmationState).not.toContain("fetch(");
    expect(voiceConfirmationState).not.toContain("navigator.clipboard");
    expect(voiceConfirmationState).not.toContain("speechSynthesis");
    expect(voiceStatusState).toContain("export function buildHelixAskVoiceStatusState");
    expect(voiceStatusState).toContain("export function buildHelixAskVoiceStatusDerivedState");
    expect(voiceStatusState).toContain("voiceStatusLabel");
    expect(voiceStatusState).toContain("voiceStatusState");
    expect(voiceStatusState).toContain("buildVoiceInputStatusLabel");
    expect(voiceStatusState).not.toMatch(/from ["']react["']/);
    expect(voiceStatusState).not.toContain("@/store/");
    expect(voiceStatusState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceStatusState).not.toContain("setVoiceInputState");
    expect(voiceStatusState).not.toContain("voiceRecorderRef");
    expect(voiceStatusState).not.toContain("MediaRecorder");
    expect(voiceStatusState).not.toContain("setVoiceInputState");
    expect(voiceStatusState).not.toContain("runAskTurn");
    expect(voiceStatusState).not.toContain("fetch(");
    expect(voiceStatusState).not.toContain("navigator.clipboard");
    expect(voiceStatusState).not.toContain("speechSynthesis");
    expect(voiceCaptureHealthState).toContain("export function buildHelixAskVoiceCaptureHealthState");
    expect(voiceCaptureHealthState).toContain("lastChunkAgeMs");
    expect(voiceCaptureHealthState).toContain("pipelineStatus");
    expect(voiceCaptureHealthState).toContain("checkpointList");
    expect(voiceCaptureHealthState).not.toMatch(/from ["']react["']/);
    expect(voiceCaptureHealthState).not.toContain("@/store/");
    expect(voiceCaptureHealthState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceCaptureHealthState).not.toContain("Date.now()");
    expect(voiceCaptureHealthState).not.toContain("MediaRecorder");
    expect(voiceCaptureHealthState).not.toContain("AudioContext");
    expect(voiceCaptureHealthState).not.toContain("publishVoiceCaptureDiagnosticsSnapshot");
    expect(voiceCaptureHealthState).not.toContain("runAskTurn");
    expect(voiceCaptureHealthState).not.toContain("fetch(");
    expect(voiceCaptureHealthState).not.toContain("navigator.clipboard");
    expect(voiceCaptureHealthState).not.toContain("speechSynthesis");
    expect(voiceCaptureDiagnosticsState).toContain("export function buildHelixAskVoiceCaptureDiagnosticsBaseState");
    expect(voiceCaptureDiagnosticsState).toContain("checkpoints: checkpointList.map");
    expect(voiceCaptureDiagnosticsState).toContain("segments: segments.map");
    expect(voiceCaptureDiagnosticsState).toContain("pendingConfirmation");
    expect(voiceCaptureDiagnosticsState).toContain("voiceFeatureFlags");
    expect(voiceCaptureDiagnosticsState).not.toMatch(/from ["']react["']/);
    expect(voiceCaptureDiagnosticsState).not.toContain("@/store/");
    expect(voiceCaptureDiagnosticsState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceCaptureDiagnosticsState).not.toContain("Date.now()");
    expect(voiceCaptureDiagnosticsState).not.toContain("MediaRecorder");
    expect(voiceCaptureDiagnosticsState).not.toContain("AudioContext");
    expect(voiceCaptureDiagnosticsState).not.toContain("publishVoiceCaptureDiagnosticsSnapshot");
    expect(voiceCaptureDiagnosticsState).not.toContain("playbackOutput");
    expect(voiceCaptureDiagnosticsState).not.toContain("voiceAutoSpeakLastMetrics");
    expect(voiceCaptureDiagnosticsState).not.toContain("runAskTurn");
    expect(voiceCaptureDiagnosticsState).not.toContain("fetch(");
    expect(voiceCaptureDiagnosticsState).not.toContain("navigator.clipboard");
    expect(voiceCaptureDiagnosticsState).not.toContain("speechSynthesis");
    expect(legacyPill).toContain("buildHelixAskVoiceTimelineBuildInfoEvent({");
    expect(legacyPill).toContain("buildInfo: voiceTimelineBuildInfo");
    expect(legacyPill).not.toContain("const buildStatus: VoiceLaneTimelineDebugEvent");
    expect(legacyPill).not.toContain("const buildSummary = summarizeVoiceDebugText(");
    expect(legacyPill).not.toContain("const buildIdToken = [");
    expect(voiceCaptureDiagnosticsState).not.toContain("buildHelixAskVoiceTimelineBuildInfoEvent");
    expect(voiceFeatureFlagsState).toContain("export function buildHelixAskVoiceFeatureFlagsState");
    expect(voiceFeatureFlagsState).toContain("confirmV2RolloutEligible");
    expect(voiceFeatureFlagsState).toContain("noisyEnvironmentMode");
    expect(voiceFeatureFlagsState).not.toMatch(/from ["']react["']/);
    expect(voiceFeatureFlagsState).not.toContain("@/store/");
    expect(voiceFeatureFlagsState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceFeatureFlagsState).not.toContain("MediaRecorder");
    expect(voiceFeatureFlagsState).not.toContain("AudioContext");
    expect(voiceFeatureFlagsState).not.toContain("publishVoiceCaptureDiagnosticsSnapshot");
    expect(voiceFeatureFlagsState).not.toContain("playbackOutput");
    expect(voiceFeatureFlagsState).not.toContain("voiceAutoSpeakLastMetrics");
    expect(voiceFeatureFlagsState).not.toContain("runAskTurn");
    expect(voiceFeatureFlagsState).not.toContain("fetch(");
    expect(voiceFeatureFlagsState).not.toContain("navigator.clipboard");
    expect(voiceFeatureFlagsState).not.toContain("speechSynthesis");
    expect(contextChooserState).toContain("export function buildHelixAskContextChooserState");
    expect(contextChooserState).toContain("autoContextMode");
    expect(contextChooserState).toContain("countdownSec");
    expect(contextChooserState).toContain("onRunAttached");
    expect(contextChooserState).toContain("onRunIsolated");
    expect(contextChooserState).not.toMatch(/from ["']react["']/);
    expect(contextChooserState).not.toContain("@/store/");
    expect(contextChooserState).not.toContain("@/components/helix/HelixAskPill");
    expect(contextChooserState).not.toContain("executeAskWithContextMode");
    expect(contextChooserState).not.toContain("setAskContextChooser");
    expect(contextChooserState).not.toContain("runAskTurn");
    expect(contextChooserState).not.toContain("fetch(");
    expect(contextChooserState).not.toContain("navigator.clipboard");
    expect(contextChooserState).not.toContain("speechSynthesis");
    expect(observerSupplementState).toContain("export function buildHelixAskObserverSupplementState");
    expect(observerSupplementState).toContain("showObserverLane");
    expect(observerSupplementState).toContain("conversationBriefText");
    expect(observerSupplementState).toContain("observerLaneVisible");
    expect(observerSupplementState).toContain("observerLaneEvents");
    expect(observerSupplementState).not.toMatch(/from ["']react["']/);
    expect(observerSupplementState).not.toContain("@/store/");
    expect(observerSupplementState).not.toContain("@/components/helix/HelixAskPill");
    expect(observerSupplementState).not.toContain("helixTimeline");
    expect(observerSupplementState).not.toContain("latestConversationBrief");
    expect(observerSupplementState).not.toContain("showHelixAskObserverLane");
    expect(observerSupplementState).not.toContain("runAskTurn");
    expect(observerSupplementState).not.toContain("fetch(");
    expect(observerSupplementState).not.toContain("navigator.clipboard");
    expect(observerSupplementState).not.toContain("speechSynthesis");
    expect(contextMemoryStatusState).toContain("export function buildHelixAskContextMemoryStatusState");
    expect(contextMemoryStatusState).toContain("contextMemoryStatusText");
    expect(contextMemoryStatusState).not.toMatch(/from ["']react["']/);
    expect(contextMemoryStatusState).not.toContain("@/store/");
    expect(contextMemoryStatusState).not.toContain("@/components/helix/HelixAskPill");
    expect(contextMemoryStatusState).not.toContain("SESSION_CAPSULE_CONFIDENCE_LABEL");
    expect(contextMemoryStatusState).not.toContain("sessionCapsuleState");
    expect(contextMemoryStatusState).not.toContain("runAskTurn");
    expect(contextMemoryStatusState).not.toContain("fetch(");
    expect(contextMemoryStatusState).not.toContain("navigator.clipboard");
    expect(contextMemoryStatusState).not.toContain("speechSynthesis");
    expect(legacyPill).toContain("handleCommandConfirmationAccept");
    expect(legacyPill).toContain("handleTranscriptConfirmationAccept");
    expect(legacyPill).toContain("handleAskContextChooserRunAttached");
    expect(legacyPill).toContain("stopDisplayAudioCapture");

    expect(supplementStack).toContain("export function HelixAskSurfaceSupplementStack");
    for (const slot of [
      "{attachments}",
      "{contextCapsule}",
      "{voiceStatus}",
      "{situationRoomSource}",
      "{voiceCommandConfirmation}",
      "{transcriptConfirmation}",
      "{contextChooser}",
      "{conversationBrief}",
      "{observerLane}",
      "{contextMemoryStatus}",
    ]) {
      expect(supplementStack).toContain(slot);
      expect(supplementSurface).toContain(slot.replace(/[{}]/g, ""));
    }
    expect(supplementSurface).toContain("export function HelixAskConsoleSupplementSurface");
    expect(supplementSurface).toContain("<HelixAskSurfaceSupplementStack");
    expect(supplementSurface).toContain("<HelixAskAttachmentStrip");
    expect(supplementSurface).toContain("<HelixAskContextCapsulePreview");
    expect(supplementSurface).toContain("<HelixAskSituationRoomSourcePanel");
    expect(supplementSurface).toContain("<HelixAskVoiceCommandConfirmationPanel");
    expect(supplementSurface).toContain("<HelixAskTranscriptConfirmationPanel");
    expect(supplementSurface).toContain("<HelixAskContextChooserPanel");
    expect(supplementSurface).toContain("<HelixAskConversationBriefPanel");
    expect(supplementSurface).toContain("<HelixAskObserverLanePanel");
    expect(supplementSurface).toContain("<HelixAskConsoleContextMemoryStatusSurface");
    expect(supplementSurface).toContain("<HelixAskConsoleVoiceStatusSurface");
    expect(supplementStack).not.toContain("handleCommandConfirmationAccept");
    expect(supplementStack).not.toContain("handleTranscriptConfirmationAccept");
    expect(supplementStack).not.toContain("handleAskContextChooserRunAttached");
    expect(supplementStack).not.toContain("stopDisplayAudioCapture");
    expect(supplementStack).not.toContain("runAskTurn");
    expect(supplementStack).not.toContain("fetch(");
    expect(supplementSurface).not.toContain("setAskReplies");
    expect(supplementSurface).not.toContain("runAskTurn");
    expect(supplementSurface).not.toContain("fetch(");
  });

  it("owns busy reasoning panel chrome while reasoning state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const busyPanel = read("client/src/components/helix/ask-console/HelixAskBusyReasoningPanel.tsx");
    const theaterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx");
    const theaterState = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterState.ts");
    const theaterMeterState = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterMeterState.ts");
    const theaterStatusState = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterStatusState.ts");

    expect(legacyPill).toContain("const reasoningTheaterState = buildHelixAskReasoningTheaterState({");
    expect(legacyPill).toContain("const reasoningTheaterMeterState = buildHelixAskReasoningTheaterMeterState({");
    expect(legacyPill).toContain("const reasoningTheaterStatusState = buildHelixAskReasoningTheaterStatusState({");
    expect(legacyPill).toContain("status: reasoningTheaterStatusState");
    expect(legacyPill).toContain("meter: reasoningTheaterMeterState");
    expect(legacyPill).not.toContain("meter: {");
    expect(legacyPill).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPill).not.toContain("<HelixAskBusyReasoningPanel");
    expect(legacyPill).toContain("visible: askBusy");
    expect(legacyPill).toContain("liveBorderClassName: moodPalette.liveBorder");
    expect(legacyPill).toContain("replyTintClassName: moodPalette.replyTint");
    expect(legacyPill).not.toContain("<HelixAskReasoningMirekField");
    expect(legacyPill).toContain("reasoningTheaterMeterFillRef");
    expect(legacyPill).toContain("setReasoningTheaterFrontierIconBrokenByPath");
    expect(legacyPill).not.toContain("HelixAskReasoningAnimationStyles");
    expect(legacyPill).not.toContain("relative overflow-hidden border-t px-4 py-2 text-[11px] text-slate-300");
    expect(theaterSurface).toContain("<HelixAskBusyReasoningPanel");
    expect(theaterSurface).toContain("<HelixAskReasoningMirekField");
    expect(theaterState).toContain("export function buildHelixAskReasoningTheaterState");
    expect(theaterState).toContain("visible");
    expect(theaterState).toContain("status");
    expect(theaterState).toContain("meter");
    expect(theaterState).not.toMatch(/from ["']react["']/);
    expect(theaterState).not.toContain("@/store/");
    expect(theaterState).not.toContain("@/components/helix/HelixAskPill");
    expect(theaterState).not.toContain("setReasoningTheater");
    expect(theaterState).not.toContain("setReasoningTheaterMedalBrokenByToken");
    expect(theaterState).not.toContain("setReasoningTheaterFrontierIconBrokenByPath");
    expect(theaterState).not.toContain("runAskTurn");
    expect(theaterState).not.toContain("fetch(");
    expect(theaterState).not.toContain("navigator.clipboard");
    expect(theaterState).not.toContain("speechSynthesis");
    expect(theaterMeterState).toContain("export function buildHelixAskReasoningTheaterMeterState");
    expect(theaterMeterState).toContain("beats");
    expect(theaterMeterState).toContain("frontierIconAlt");
    expect(theaterMeterState).toContain("onFrontierIconError");
    expect(theaterMeterState).not.toMatch(/from [\"']react[\"']/);
    expect(theaterMeterState).not.toContain("@/store/");
    expect(theaterMeterState).not.toContain("@/components/helix/HelixAskPill");
    expect(theaterMeterState).not.toContain("setReasoningTheater");
    expect(theaterMeterState).not.toContain("setReasoningTheaterFrontierIconBrokenByPath");
    expect(theaterMeterState).not.toContain("REASONING_THEATER_FRONTIER_ACTION_LABEL");
    expect(theaterMeterState).not.toContain("runAskTurn");
    expect(theaterMeterState).not.toContain("fetch(");
    expect(theaterMeterState).not.toContain("navigator.clipboard");
    expect(theaterMeterState).not.toContain("speechSynthesis");
    expect(theaterStatusState).toContain("export function buildHelixAskReasoningTheaterStatusState");
    expect(theaterStatusState).toContain("stanceBadgeClassName");
    expect(theaterStatusState).toContain("latestMedal");
    expect(theaterStatusState).toContain("onMedalImageError");
    expect(theaterStatusState).not.toMatch(/from [\"']react[\"']/);
    expect(theaterStatusState).not.toContain("@/store/");
    expect(theaterStatusState).not.toContain("@/components/helix/HelixAskPill");
    expect(theaterStatusState).not.toContain("setReasoningTheater");
    expect(theaterStatusState).not.toContain("setReasoningTheaterMedalBrokenByToken");
    expect(theaterStatusState).not.toContain("REASONING_THEATER_STANCE_META");
    expect(theaterStatusState).not.toContain("REASONING_THEATER_MEDAL_LABEL");
    expect(theaterStatusState).not.toContain("runAskTurn");
    expect(theaterStatusState).not.toContain("fetch(");
    expect(theaterStatusState).not.toContain("navigator.clipboard");
    expect(theaterStatusState).not.toContain("speechSynthesis");

    expect(busyPanel).toContain("export function HelixAskBusyReasoningPanel");
    expect(busyPanel).toContain("if (!visible) return null");
    expect(busyPanel).toContain("HelixAskReasoningAnimationStyles");
    expect(busyPanel).toContain("relative overflow-hidden border-t px-4 py-2 text-[11px] text-slate-300");
    expect(busyPanel).toContain("{children}");
    expect(busyPanel).not.toContain("reasoningTheater");
    expect(busyPanel).not.toContain("mirekReasoningDisplayGrid");
    expect(busyPanel).not.toContain("setReasoningTheater");
    expect(busyPanel).not.toContain("runAskTurn");
    expect(busyPanel).not.toContain("fetch(");
  });

  it("owns render error fallback display outside the legacy bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const errorBoundary = read("client/src/components/helix/ask-console/HelixAskErrorBoundary.tsx");
    const runtimeLayout = read("client/src/components/helix/ask-console/HelixAskConsoleRuntimeLayout.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyConsoleView");
    expect(legacyPill).not.toContain("<HelixAskErrorBoundary>");
    expect(runtimeLayout).toContain("<HelixAskErrorBoundary>");
    expect(runtimeLayout).toContain("</HelixAskErrorBoundary>");
    expect(legacyPill).not.toContain("class HelixAskErrorBoundary");
    expect(legacyPill).not.toContain("The Helix Ask panel hit a rendering error");
    expect(legacyPill).not.toContain("reportClientError(error");

    expect(errorBoundary).toContain("export class HelixAskErrorBoundary");
    expect(errorBoundary).toContain("componentDidCatch(error: Error, info: ErrorInfo)");
    expect(errorBoundary).toContain('scope: "helix-ask"');
    expect(errorBoundary).toContain("The Helix Ask panel hit a rendering error");
    expect(errorBoundary).toContain("this.handleRetry");
    expect(errorBoundary).toContain("window.location.reload()");
    expect(errorBoundary).not.toContain("runAskTurn");
    expect(errorBoundary).not.toContain("setAskReplies");
    expect(errorBoundary).not.toContain("handleAskSubmit");
  });

  it("owns procedural timeline display and recrowned row projection outside the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const proceduralTimeline = read("client/src/components/helix/ask-console/HelixAskProceduralTimeline.tsx");
    const proceduralTimelineSlot = read("client/src/components/helix/ask-console/HelixAskLegacyProceduralTimelineSlot.tsx");
    const proceduralTimelineProjection = read("client/src/components/helix/ask-console/HelixAskLegacyProceduralTimelineProjection.tsx");

    expect(legacyPill).not.toContain("function renderProceduralTurnTimeline");
    expect(legacyPill).not.toContain("<HelixAskProceduralTimeline");
    expect(legacyPill).not.toContain("<HelixAskLegacyProceduralTimelineSlot");
    expect(legacyPill).not.toContain("renderHelixAskLegacyProceduralTimeline");
    expect(legacyPill).not.toContain("Procedural workspace timeline");
    expect(legacyPill).not.toContain("rows.slice(0, 18).map");
    expect(legacyPill).not.toContain("readProceduralStatusClass(row.status)");

    expect(proceduralTimelineProjection).toContain("export function renderHelixAskLegacyProceduralTimeline");
    expect(proceduralTimelineProjection).toContain("reply.debug?.turn_truth_table");
    expect(proceduralTimelineProjection).toContain("ui_answer_equals_terminal_authority_text");
    expect(proceduralTimelineProjection).toContain("replyRecord?.agent_runtime_loop");
    expect(proceduralTimelineProjection).toContain("executed_action_key");
    expect(proceduralTimelineProjection).toContain("<HelixAskLegacyProceduralTimelineSlot");
    expect(proceduralTimelineProjection).toContain("rows={rows}");
    expect(proceduralTimelineProjection).toContain("truthMatchesVisible={truthMatchesVisible}");
    expect(proceduralTimelineProjection).toContain("resolveVisibleTerminalKind");
    expect(proceduralTimelineProjection).not.toContain("resolveHelixVisibleTerminalKind");
    expect(proceduralTimelineProjection).not.toContain("fetch(");

    expect(proceduralTimeline).toContain("export function HelixAskProceduralTimeline");
    expect(proceduralTimeline).toContain("Procedural workspace timeline");
    expect(proceduralTimeline).toContain("backend terminal == visible answer");
    expect(proceduralTimeline).toContain("rows.slice(0, 18).map");
    expect(proceduralTimeline).toContain("readProceduralStatusClass(row.status)");
    expect(proceduralTimeline).not.toContain("reply.debug?.turn_truth_table");
    expect(proceduralTimeline).not.toContain("agent_runtime_loop");
    expect(proceduralTimeline).not.toContain("buildVisibleResolvedTurn");
    expect(proceduralTimelineSlot).toContain("export function HelixAskLegacyProceduralTimelineSlot");
    expect(proceduralTimelineSlot).toContain("<HelixAskProceduralTimeline {...props} />");
    expect(proceduralTimelineSlot).not.toContain("reply.debug?.turn_truth_table");
    expect(proceduralTimelineSlot).not.toContain("agent_runtime_loop");
    expect(proceduralTimelineSlot).not.toContain("fetch(");
  });

  it("owns reasoning battle stage display while battle state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const battleStage = read("client/src/components/helix/ask-console/HelixAskReasoningBattleStage.tsx");
    const completedReplyBattleState = read("client/src/components/helix/ask-console/HelixAskCompletedReplyBattleState.ts");
    const meterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningMeterSurface.tsx");
    const theaterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx");

    expect(legacyPill).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPill).not.toContain("<HelixAskReasoningMeterSurface");
    expect(legacyPill).not.toContain("<HelixAskReasoningBattleStage");
    expect(legacyPill).toContain("buildReasoningBattleBeats({");
    expect(legacyPill).toContain("buildReasoningBattleAmbientState({");
    expect(legacyPill).toContain("buildHelixAskCompletedReplyBattleState({");
    expect(legacyPill).not.toContain("buildReasoningBattleAnswerTint({");
    expect(legacyPill).not.toContain("function renderReasoningBattleStage");
    expect(legacyPill).not.toContain('data-testid="helix-ask-reasoning-battle-stage"');
    expect(legacyPill).not.toContain("reasoningBattlePrimitiveStyle({ beat, primitive");

    expect(completedReplyBattleState).toContain("buildReasoningBattleAnswerTint({");
    expect(completedReplyBattleState).not.toContain("fetch(");
    expect(completedReplyBattleState).not.toContain("navigator.clipboard");

    expect(meterSurface).toContain("export function HelixAskReasoningMeterSurface");
    expect(meterSurface).toContain("<HelixAskReasoningBattleStage");
    expect(meterSurface).toContain("beats={beats}");
    expect(meterSurface).toContain("pressurePct={pressurePct}");
    expect(meterSurface).toContain("floatingActionTexts.map");
    expect(meterSurface).toContain("frontierParticleRefs.current[index] = node");
    expect(meterSurface).not.toContain("buildReasoningBattleBeats");
    expect(meterSurface).not.toContain("buildReasoningBattleAmbientState");
    expect(meterSurface).not.toContain("buildReasoningBattleAnswerTint");
    expect(meterSurface).not.toContain("setReasoningTheaterFrontierIconBrokenByPath");
    expect(meterSurface).not.toContain("runAskTurn");
    expect(meterSurface).not.toContain("fetch(");
    expect(theaterSurface).toContain("<HelixAskReasoningMeterSurface");
    expect(theaterSurface).toContain("beats={meter.beats}");
    expect(battleStage).toContain("export function HelixAskReasoningBattleStage");
    expect(battleStage).toContain('data-testid={testId ?? "helix-ask-reasoning-battle-stage"}');
    expect(battleStage).toContain("reasoningBattleBeatPrimitive(beat)");
    expect(battleStage).toContain("reasoningBattlePrimitiveStyle({ beat, primitive");
    expect(battleStage).toContain("reasoningBattleAmbientClassName(ambient, staticMotion)");
    expect(battleStage).not.toContain("buildReasoningBattleBeats");
    expect(battleStage).not.toContain("buildReasoningBattleAmbientState");
    expect(battleStage).not.toContain("buildReasoningBattleAnswerTint");
    expect(battleStage).not.toContain("runAskTurn");
    expect(battleStage).not.toContain("fetch(");
  });

  it("owns Mirek reasoning field display while grid derivation stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const mirekField = read("client/src/components/helix/ask-console/HelixAskReasoningMirekField.tsx");
    const theaterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx");
    const ownershipMap = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");

    expect(legacyPill).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPill).not.toContain("<HelixAskReasoningMirekField");
    expect(legacyPill).toContain("mirekGrid: mirekReasoningDisplayGrid");
    expect(legacyPill).toContain("fieldStrength: mirekReasoningFieldStrength");
    expect(legacyPill).toContain("buildMirekReasoningDisplayGrid");
    expect(legacyPill).not.toContain('data-testid="helix-ask-mirek-field"');
    expect(legacyPill).not.toContain("gridTemplateColumns: `repeat(${mirekReasoningDisplayGrid.width}");
    expect(legacyPill).not.toContain("mirekReasoningDisplayGrid.cells.map");

    expect(mirekField).toContain("export function HelixAskReasoningMirekField");
    expect(mirekField).toContain('data-testid="helix-ask-mirek-field"');
    expect(mirekField).toContain("grid.cells.map((cell, index)");
    expect(mirekField).toContain("mirekCellGridClassName(cell.kind)");
    expect(mirekField).toContain("fieldStrength");
    expect(mirekField).not.toContain("buildMirekReasoningDisplayGrid");
    expect(mirekField).not.toContain("reasoningTheater");
    expect(mirekField).not.toContain("setReasoning");
    expect(mirekField).not.toContain("runAskTurn");
    expect(mirekField).not.toContain("fetch(");
    expect(mirekField).not.toContain("navigator.clipboard");
    expect(theaterSurface).toContain("<HelixAskReasoningMirekField");
    expect(theaterSurface).toContain("grid={active ? mirekGrid : null}");
    expect(ownershipMap).toContain("Mirek reasoning field display");
    expect(ownershipMap).toContain("HelixAskReasoningMirekField");
  });

  it("owns reasoning status and medal strip display while medal state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const statusMedalStrip = read(
      "client/src/components/helix/ask-console/HelixAskReasoningStatusMedalStrip.tsx",
    );
    const theaterStatusState = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterStatusState.ts");
    const theaterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx");
    const ownershipMap = read("client/src/lib/helix/ASK_UI_OWNERSHIP.md");

    expect(legacyPill).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPill).toContain("const reasoningTheaterStatusState = buildHelixAskReasoningTheaterStatusState({");
    expect(legacyPill).toContain("status: reasoningTheaterStatusState");
    expect(legacyPill).not.toContain("<HelixAskReasoningStatusMedalStrip");
    expect(legacyPill).toContain("setReasoningTheaterMedalBrokenByToken");
    expect(legacyPill).toContain("reasoningTheaterMedalQueue.map((medalPulse) => ({");
    expect(legacyPill).toContain("REASONING_THEATER_STANCE_META[reasoningTheater.stance].badge");
    expect(legacyPill).not.toContain('alt={`${REASONING_THEATER_MEDAL_LABEL[medalPulse.medal]} medal`}');
    expect(legacyPill).not.toContain("className=\"h-12 w-12 shrink-0 object-contain");

    expect(statusMedalStrip).toContain("export function HelixAskReasoningStatusMedalStrip");
    expect(statusMedalStrip).toContain("medals.map((medal)");
    expect(statusMedalStrip).toContain("alt={`${medal.label} medal`}");
    expect(statusMedalStrip).toContain("onMedalImageError?.(medal.token");
    expect(statusMedalStrip).toContain("latestMedal.reason");
    expect(statusMedalStrip).not.toContain("setReasoningTheaterMedalBrokenByToken");
    expect(statusMedalStrip).not.toContain("reasoningTheaterMedalQueue");
    expect(statusMedalStrip).not.toContain("REASONING_THEATER_STANCE_META");
    expect(statusMedalStrip).not.toContain("REASONING_THEATER_MEDAL_LABEL");
    expect(statusMedalStrip).not.toContain("runAskTurn");
    expect(statusMedalStrip).not.toContain("fetch(");
    expect(statusMedalStrip).not.toContain("navigator.clipboard");
    expect(theaterStatusState).toContain("export function buildHelixAskReasoningTheaterStatusState");
    expect(theaterStatusState).not.toContain("setReasoningTheaterMedalBrokenByToken");
    expect(theaterStatusState).not.toContain("reasoningTheaterMedalQueue");
    expect(theaterStatusState).not.toContain("REASONING_THEATER_STANCE_META");
    expect(theaterStatusState).not.toContain("REASONING_THEATER_MEDAL_LABEL");
    expect(theaterSurface).toContain("<HelixAskReasoningStatusMedalStrip");
    expect(theaterSurface).toContain("onMedalImageError={status.onMedalImageError}");
    expect(ownershipMap).toContain("Reasoning status and medal strip display");
    expect(ownershipMap).toContain("HelixAskReasoningStatusMedalStrip");
    expect(ownershipMap).toContain("HelixAskReasoningTheaterMeterState");

    const onMedalImageError = vi.fn();
    expect(buildHelixAskReasoningTheaterStatusState({
      stanceBadgeClassName: "badge",
      stanceLabel: "steady",
      archetypeLabel: "solver",
      phaseLabel: "inspect",
      certaintyLabel: "bounded",
      medals: [
        {
          token: "medal:1",
          label: "proof",
          assetPath: "/proof.png",
          fading: false,
          broken: false,
        },
      ],
      latestMedal: {
        label: "proof",
        reason: "evidence checked",
      },
      onMedalImageError,
    })).toMatchObject({
      stanceBadgeClassName: "badge",
      stanceLabel: "steady",
      archetypeLabel: "solver",
      phaseLabel: "inspect",
      certaintyLabel: "bounded",
      medals: [
        {
          token: "medal:1",
          label: "proof",
          assetPath: "/proof.png",
          fading: false,
          broken: false,
        },
      ],
      latestMedal: {
        label: "proof",
        reason: "evidence checked",
      },
      onMedalImageError,
    });
    const onFrontierIconError = vi.fn();
    expect(buildHelixAskReasoningTheaterMeterState({
      beats: [],
      pressurePct: 42,
      reducedMotion: true,
      ambient: null,
      stanceBarClassName: "bar",
      meterTargetPct: 64,
      meterFillRef: null,
      meterPatternRef: null,
      frontierEnabled: true,
      frontierCursorRef: null,
      frontierBurstRef: null,
      frontierIconRef: null,
      frontierTextRef: null,
      frontierParticleRefs: { current: [] },
      frontierIconBroken: false,
      frontierIconPath: "/frontier.png",
      frontierIconAlt: "frontier action",
      onFrontierIconError,
      frontierParticles: [],
      floatingActionTexts: [],
    })).toMatchObject({
      pressurePct: 42,
      stanceBarClassName: "bar",
      meterTargetPct: 64,
      frontierEnabled: true,
      frontierIconPath: "/frontier.png",
      frontierIconAlt: "frontier action",
      onFrontierIconError,
    });
  });

  it("owns reasoning animation keyframes outside the legacy bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const busyPanel = read("client/src/components/helix/ask-console/HelixAskBusyReasoningPanel.tsx");
    const theaterSurface = read("client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx");
    const animationStyles = read("client/src/components/helix/ask-console/HelixAskReasoningAnimationStyles.tsx");

    expect(legacyPill).toContain("reasoningTheater: reasoningTheaterState");
    expect(legacyPill).not.toContain("<HelixAskBusyReasoningPanel");
    expect(theaterSurface).toContain("<HelixAskBusyReasoningPanel");
    expect(legacyPill).not.toContain("<HelixAskReasoningAnimationStyles />");
    expect(busyPanel).toContain("<HelixAskReasoningAnimationStyles />");
    expect(legacyPill).not.toContain("@keyframes helixReasoningFloatingText{");
    expect(legacyPill).not.toContain("@keyframes helixReasoningBattleBeat{");
    expect(legacyPill).not.toContain("@keyframes helixReasoningBattlePrimitive{");

    expect(animationStyles).toContain("export function HelixAskReasoningAnimationStyles");
    expect(animationStyles).toContain("@keyframes helixReasoningFloatingText{");
    expect(animationStyles).toContain("@keyframes helixReasoningBattleBeat{");
    expect(animationStyles).toContain("@keyframes helixReasoningBattlePrimitive{");
    expect(animationStyles).not.toContain("runAskTurn");
    expect(animationStyles).not.toContain("fetch(");
    expect(animationStyles).not.toContain("@/store/");
  });

  it("owns goal-session pill display while goal actions stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const goalPill = read("client/src/components/helix/ask-console/HelixAskGoalPill.tsx");
    const goalPillSurface = read("client/src/components/helix/ask-console/HelixAskGoalPillSurface.tsx");
    const goalPillState = read("client/src/components/helix/ask-console/HelixAskGoalPillState.ts");

    expect(legacyPill).not.toContain("<HelixAskGoalPillSurface");
    expect(legacyPill).not.toContain("<HelixAskGoalPill\n");
    expect(legacyPill).toContain("const goalPillState = buildHelixAskGoalPillState({");
    expect(legacyPill).toContain("goalPillState,");
    expect(legacyPill).not.toContain("goalPillState={goalPillState}");
    expect(legacyPill).toContain("session: askGoalSession");
    expect(legacyPill).toContain("expanded: askGoalPillExpanded");
    expect(legacyPill).toContain("busyAction: askGoalPillBusyAction");
    expect(legacyPill).toContain("error: askGoalPillError");
    expect(legacyPill).toContain("onToggleExpanded: () => setAskGoalPillExpanded((current) => !current)");
    expect(legacyPill).toContain("onAction: handleAskGoalSessionAction");
    expect(legacyPill).toContain("postHelixAskGoalSessionAction");
    expect(legacyPill).not.toContain('aria-label="Helix Ask goal session"');
    expect(legacyPill).not.toContain('aria-label="Edit goal prompt"');
    expect(legacyPill).not.toContain("formatGoalPillCadence(session.cadence)");
    expect(legacyPill).not.toContain("session.contextFeeds.map");
    expect(goalPillState).toContain("export function buildHelixAskGoalPillState");
    expect(goalPillState).toContain("return {");
    expect(goalPillState).toContain("onToggleExpanded");
    expect(goalPillState).toContain("onAction");
    expect(goalPillState).not.toContain("postHelixAskGoalSessionAction");
    expect(goalPillState).not.toContain("setAskGoalPillBusyAction");
    expect(goalPillState).not.toContain("fetch(");
    expect(goalPillState).not.toContain("navigator.clipboard");
    expect(goalPillState).not.toContain("speechSynthesis");
    expect(goalPillSurface).toContain("export function HelixAskGoalPillSurface");
    expect(goalPillSurface).toContain("if (!session) return null");
    expect(goalPillSurface).toContain("<HelixAskGoalPill");
    expect(legacyConsoleView).toContain("<HelixAskGoalPillSurface {...goalPillState} />");
    expect(goalPillSurface).not.toContain("postHelixAskGoalSessionAction");
    expect(goalPillSurface).not.toContain("setAskGoalPillBusyAction");
    expect(goalPillSurface).not.toContain("fetch(");

    expect(goalPill).toContain("export function HelixAskGoalPill");
    expect(goalPill).toContain('aria-label="Helix Ask goal session"');
    expect(goalPill).toContain('aria-controls="helix-ask-goal-pill-details"');
    expect(goalPill).toContain('aria-label="Edit goal prompt"');
    expect(goalPill).toContain('aria-label={isPaused ? "Resume goal" : "Pause goal"}');
    expect(goalPill).toContain('aria-label="Archive goal"');
    expect(goalPill).toContain("formatGoalPillCadence(session.cadence)");
    expect(goalPill).toContain("session.contextFeeds.map");
    expect(goalPill).not.toContain("postHelixAskGoalSessionAction");
    expect(goalPill).not.toContain("setAskGoalPillBusyAction");
    expect(goalPill).not.toContain("fetch(");
  });

  it("owns mood avatar display while mood state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const moodAvatar = read("client/src/components/helix/ask-console/HelixAskMoodAvatar.tsx");
    const moodAvatarSurface = read("client/src/components/helix/ask-console/HelixAskMoodAvatarSurface.tsx");
    const moodAvatarState = read("client/src/components/helix/ask-console/HelixAskMoodAvatarState.ts");

    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).toContain("const moodAvatarState = buildHelixAskMoodAvatarState({");
    expect(legacyPill).toContain("moodAvatar: moodAvatarState");
    expect(legacyPill).not.toContain("<HelixAskMoodAvatarSurface");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskMoodAvatar"');
    expect(legacyPill).toContain("auraClassName: moodPalette.aura");
    expect(legacyPill).toContain("ringClassName: moodRingClass");
    expect(legacyPill).toContain("moodSrc,");
    expect(legacyPill).toContain("moodLabel,");
    expect(legacyPill).toContain("onImageError: () => setAskMoodBroken(true)");
    expect(legacyPill).toContain("const moodSrc = askMoodBroken ? null : moodAsset?.sources[0] ?? null");
    expect(legacyPill).not.toContain("<BrainCircuit");
    expect(legacyPill).not.toContain('className="h-9 w-9 object-contain"');

    expect(moodAvatarSurface).toContain("export function HelixAskMoodAvatarSurface");
    expect(moodAvatarSurface).toContain("<HelixAskMoodAvatar {...props} />");
    expect(legacyComposerSurface).toContain("<HelixAskMoodAvatarSurface {...moodAvatar}");
    expect(moodAvatarSurface).not.toContain("setAskMoodBroken");
    expect(moodAvatarSurface).not.toContain("askMoodBroken");
    expect(moodAvatarSurface).not.toContain("resolveMoodAsset");
    expect(moodAvatarSurface).not.toContain("fetch(");
    expect(moodAvatarSurface).not.toContain("navigator.clipboard");
    expect(moodAvatarSurface).not.toContain("speechSynthesis");
    expect(moodAvatarState).toContain("export function buildHelixAskMoodAvatarState");
    expect(moodAvatarState).toContain("auraClassName");
    expect(moodAvatarState).toContain("ringClassName");
    expect(moodAvatarState).toContain("moodSrc");
    expect(moodAvatarState).toContain("moodLabel");
    expect(moodAvatarState).toContain("onImageError");
    expect(moodAvatarState).not.toMatch(/from [\"']react[\"']/);
    expect(moodAvatarState).not.toContain("@/store/");
    expect(moodAvatarState).not.toContain("@/components/helix/HelixAskPill");
    expect(moodAvatarState).not.toContain("askMoodBroken");
    expect(moodAvatarState).not.toContain("resolveMoodAsset");
    expect(moodAvatarState).not.toContain("fetch(");
    expect(moodAvatarState).not.toContain("navigator.clipboard");
    expect(moodAvatarState).not.toContain("speechSynthesis");
    const onImageError = vi.fn();
    expect(buildHelixAskMoodAvatarState({
      auraClassName: "aura",
      ringClassName: "ring",
      moodSrc: "mood.png",
      moodLabel: "focused",
      onImageError,
    })).toEqual({
      auraClassName: "aura",
      ringClassName: "ring",
      moodSrc: "mood.png",
      moodLabel: "focused",
      onImageError,
    });
    expect(moodAvatar).toContain("export function HelixAskMoodAvatar");
    expect(moodAvatar).toContain("<BrainCircuit");
    expect(moodAvatar).toContain('className="h-9 w-9 object-contain"');
    expect(moodAvatar).toContain("onError={onImageError}");
    expect(moodAvatar).not.toContain("setAskMoodBroken");
    expect(moodAvatar).not.toContain("askMoodBroken");
    expect(moodAvatar).not.toContain("resolveMoodAsset");
  });

  it("owns pure submit admission while leaving stream transport in the bridge", () => {
    expect(buildHelixAskSubmitAdmission({
      entries: ["  first  ", " second "],
      askBusy: false,
      compactionPausePending: false,
      hasPastedTextResumeFrameForSubmit: false,
      attachmentKinds: [],
      allEntriesArePastedTextResumeRecallPrompt: false,
    })).toMatchObject({
      normalizedEntries: ["first", "second"],
      singleEntry: null,
      shouldQueueForAskHandoff: false,
      queueReason: null,
      shouldReleaseConsumedPastedTextAttachmentForResume: false,
      shouldBlockQueuedAttachments: false,
      firstEntry: "first",
      restEntries: ["second"],
    });

    expect(buildHelixAskSubmitAdmission({
      entries: ["next question"],
      askBusy: true,
      compactionPausePending: false,
      hasPastedTextResumeFrameForSubmit: false,
      attachmentKinds: ["image"],
      allEntriesArePastedTextResumeRecallPrompt: false,
    })).toMatchObject({
      singleEntry: "next question",
      shouldQueueForAskHandoff: true,
      queueReason: "busy",
      shouldBlockQueuedAttachments: true,
    });

    expect(buildHelixAskSubmitAdmission({
      entries: ["resume from pasted text"],
      askBusy: false,
      compactionPausePending: true,
      hasPastedTextResumeFrameForSubmit: true,
      attachmentKinds: ["text"],
      allEntriesArePastedTextResumeRecallPrompt: true,
    })).toMatchObject({
      shouldQueueForAskHandoff: true,
      queueReason: "compaction_pause",
      shouldReleaseConsumedPastedTextAttachmentForResume: true,
      shouldBlockQueuedAttachments: false,
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const submitBackendEntrypointOptions = read(
      "client/src/components/helix/ask-console/HelixAskSubmitBackendEntrypointOptions.ts",
    );
    expect(legacyPill).toContain("buildHelixAskSubmitAdmission");
    expect(legacyPill).toContain("mergeHelixAskSubmitBackendEntrypointRunOptions({");
    expect(submitBackendEntrypointOptions).toContain("requiresHelixAskBackendEntrypoint(args.question)");
    expect(submitBackendEntrypointOptions).toContain("requiresBackendAskEntrypoint: true");
    expect(submitBackendEntrypointOptions).toContain("buildHelixAskHardBackendEntrypointRouteMetadata({");
    expect(legacyPill).toContain("void runAsk(first, selectedCapsuleIds, runOptions)");
  });

  it("builds a minimal shell submit plan without starting transport", () => {
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "  summarize current doc  ",
      selectedRuntime: "codex",
      selectedLanguageModelProfile: "deep",
      desktopUrl: "http://127.0.0.1:1498/desktop?doc=docs/research/nhm2-current-status-whitepaper.md",
    });
    expect(submitPlan).toMatchObject({
      admission: {
        normalizedEntries: ["summarize current doc"],
        singleEntry: "summarize current doc",
        shouldQueueForAskHandoff: false,
        queueReason: null,
        shouldReleaseConsumedPastedTextAttachmentForResume: false,
        shouldBlockQueuedAttachments: false,
        firstEntry: "summarize current doc",
        restEntries: [],
      },
      context: {
        activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
        chat_referent_context_source_summary: {
          context_present: false,
        },
      },
      envelope: {
        question: "summarize current doc",
        agentRuntime: "codex",
        agent_runtime: "codex",
        languageModelProfile: "deep",
        language_model_profile: "deep",
        doc_path: "docs/research/nhm2-current-status-whitepaper.md",
      },
    });

    expect(buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "   ",
      selectedRuntime: "helix",
      desktopUrl: "http://127.0.0.1:1498/desktop",
    }).envelope).toBeNull();

    const submitPlanSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeSubmitPlan.ts",
    );
    for (const forbidden of [
      "fetch(",
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
    ]) {
      expect(submitPlanSource).not.toContain(forbidden);
    }
  });

  it("starts the minimal runtime optimistic turn lifecycle without backend transport", () => {
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "  summarize current doc  ",
      selectedRuntime: "codex",
      selectedLanguageModelProfile: "deep",
      desktopUrl: "http://127.0.0.1:1498/desktop?doc=docs/research/nhm2-current-status-whitepaper.md",
    });
    expect(startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan,
      turnId: "ask:test-turn",
      startedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
    })).toEqual({
      askBusy: true,
      askStatus: "Interpreting prompt...",
      activeTurnId: "ask:test-turn",
      activeStartedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
      replies: [
        {
          id: "ask:test-turn",
          turn_id: "ask:test-turn",
          createdAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
          content: "Reasoning in progress...",
          question: "summarize current doc",
          mode: "observe",
          liveEvents: [
            {
              id: "turn-start:ask:test-turn",
              text: "Turn started.",
              tool: "helix.ask.client",
              ts: "2026-06-29T12:00:00.000Z",
              tsMs: Date.UTC(2026, 5, 29, 12, 0, 0),
              meta: {
                kind: "client_optimistic_turn_start",
                turn_id: "ask:test-turn",
                assistant_answer: false,
              },
            },
          ],
        },
      ],
    });

    const lifecycleSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeLifecycle.ts",
    );
    for (const forbidden of [
      "fetch(",
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
    ]) {
      expect(lifecycleSource).not.toContain(forbidden);
    }
  });

  it("records minimal runtime stream events without using the legacy bridge", () => {
    const started = startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan: buildHelixAskMinimalRuntimeSubmitPlan({
        draft: "summarize current doc",
        selectedRuntime: "codex",
        desktopUrl: "http://127.0.0.1:1498/desktop",
      }),
      turnId: "ask:test-turn",
      startedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
    });

    expect(recordHelixAskMinimalRuntimeStreamEvent({
      state: started,
      turnId: "ask:test-turn",
      eventName: "turn_delta",
      receivedAtMs: Date.UTC(2026, 5, 29, 12, 0, 1),
    }).replies[0]?.liveEvents.at(-1)).toEqual({
      id: "turn-stream:ask:test-turn:1",
      text: "Stream event: turn_delta",
      tool: "helix.ask.client",
      ts: "2026-06-29T12:00:01.000Z",
      tsMs: Date.UTC(2026, 5, 29, 12, 0, 1),
      meta: {
        kind: "client_transport_stream_event",
        turn_id: "ask:test-turn",
        stream_event: "turn_delta",
        assistant_answer: false,
      },
    });
  });

  it("builds and runs the minimal runtime transport through an injected runner", async () => {
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "  summarize current doc  ",
      selectedRuntime: "codex",
      selectedLanguageModelProfile: "deep",
      desktopUrl: "http://127.0.0.1:1498/desktop?doc=docs/research/nhm2-current-status-whitepaper.md",
    });
    const payload = buildHelixAskMinimalRuntimeTurnPayload({
      submitPlan,
      sessionId: "session-1",
      traceId: "ask:test-turn",
      turnId: "ask:test-turn",
      maxTokens: 8192,
    });
    expect(payload).toMatchObject({
      sessionId: "session-1",
      agentRuntime: "codex",
      agent_runtime: "codex",
      languageModelProfile: "deep",
      language_model_profile: "deep",
      traceId: "ask:test-turn",
      turnId: "ask:test-turn",
      maxTokens: 8192,
      question: "summarize current doc",
      doc_path: "docs/research/nhm2-current-status-whitepaper.md",
      active_doc_path: "docs/research/nhm2-current-status-whitepaper.md",
      contextFiles: ["docs/research/nhm2-current-status-whitepaper.md"],
      workspace_context_snapshot: {
        activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
        chat_referent_context_source_summary: {
          context_present: false,
        },
      },
    });

    const seenEvents: unknown[] = [];
    const result = await runHelixAskMinimalRuntimeInjectedTransport({
      payload: payload!,
      onEvent: (event) => seenEvents.push(event),
      runner: async (runnerPayload, onEvent) => {
        onEvent?.({ event: "turn_final", data: { ok: true } });
        return {
          text: `ok:${runnerPayload.turnId}`,
          turn_id: runnerPayload.turnId,
        };
      },
    });
    expect(seenEvents).toEqual([{ event: "turn_final", data: { ok: true } }]);
    expect(result).toEqual({
      text: "ok:ask:test-turn",
      turn_id: "ask:test-turn",
    });

    const transportSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeTransport.ts",
    );
    for (const forbidden of [
      "fetch(",
      "runAskTurn(",
      "runAskTurnStream(",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
    ]) {
      expect(transportSource).not.toContain(forbidden);
    }
  });

  it("hydrates minimal runtime named Image Lens receipt prompts with prior answer context and hard backend route metadata", () => {
    const priorReceiptText = [
      "The runtime provider echoed Helix internal capability instructions after Image Lens observations re-entered.",
      "",
      "**crop_1**",
      "- Bbox: x=73, y=562, width=1077, height=103",
      "- Crop ref: [inline image/png crop data redacted; ref_hash=sha256:6718b03937ecd859]",
      "- Extraction status: extracted",
      "- Exact equation admissibility: partial_candidate",
      "- Exact row promotion: not_applicable; reasons: context_crop_not_exact_equation_row",
      "- Extracted information:",
      "- latex_candidate:",
      "```latex",
      "S = \\int d^4x \\sqrt{-g} e^{-\\phi} \\{ R + 2\\Lambda e^{-\\phi} + \\kappa e^{-\\phi} L_m \\}, \\ (7)",
      "```",
    ].join("\n");
    const question = [
      "Do not run scholarly lookup or internet retrieval. Use only the latest Image Lens observation receipt named crop_1.",
      "Evaluate crop_1 as an exact equation row for equation (7).",
      "Do not finalize a scientific claim, do not run Theory Badge Graph, and do not use calculator payloads.",
    ].join("\n");
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: question,
      selectedRuntime: "codex",
      desktopUrl: "http://127.0.0.1:1498/desktop?panels=image-lens&focus=image-lens",
      visibleReplies: [
        {
          id: "ask:previous",
          turn_id: "ask:previous",
          content: priorReceiptText,
        },
      ],
    });
    const payload = buildHelixAskMinimalRuntimeTurnPayload({
      submitPlan,
      sessionId: "session-1",
      traceId: "ask:named-receipt",
      turnId: "ask:named-receipt",
      maxTokens: 8192,
    });
    const workspaceContext = payload?.workspace_context_snapshot as Record<string, unknown> | undefined;
    const referent = workspaceContext?.chat_referent_context as Record<string, unknown> | undefined;
    const previousAnswer = referent?.previous_assistant_final_answer as Record<string, unknown> | undefined;
    const routeMetadata = payload?.route_metadata as Record<string, unknown> | undefined;

    expect(payload).toMatchObject({
      requiresBackendAskEntrypoint: true,
      requires_backend_ask_entrypoint: true,
      ask_entrypoint_required: true,
      submit_handler_source: "HelixAskMinimalRuntimeShell.submitMinimalRuntimeQuestion",
      runAsk_entered: true,
      hard_backend_entrypoint_required: true,
      use_backend_ask_turn_entrypoint: true,
      backend_ask_call_attempted: true,
      backend_ask_call_path: "runAskTurnStream",
      backend_ask_call_error: null,
      route_metadata_source: "hard_tool_backend_entrypoint",
      mandatory_next_tool_name: null,
      legacy_ask_local_bypassed: true,
    });
    expect(payload?.backend_ask_entrypoint_runtime_fingerprint).toMatchObject({
      schema: "helix.ask.backend_entrypoint_runtime_fingerprint.v1",
      submit_handler_source: "HelixAskMinimalRuntimeShell.submitMinimalRuntimeQuestion",
      backend_ask_call_attempted: true,
      backend_ask_call_path: "runAskTurnStream",
      route_metadata_source: "hard_tool_backend_entrypoint",
      mandatory_next_tool_name: null,
    });
    expect(previousAnswer?.text).toContain("**crop_1**");
    expect(previousAnswer?.text).toContain("context_crop_not_exact_equation_row");
    expect(routeMetadata).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "scientific_image_evidence",
      requiredToolFamily: "visual_analysis",
    });
    expect(routeMetadata?.mandatory_next_tool).toBeUndefined();
    expect(routeMetadata?.source_target_intent).toMatchObject({
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      target_source: "scientific_image_evidence",
    });
  });

  it("sends backend-entrypoint proof in the legacy Ask backend request before response projection", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const requestFingerprintIndex = legacyPill.indexOf("const backendEntrypointRequestFingerprint");
    const payloadIndex = legacyPill.indexOf("const askTurnPayload = {", requestFingerprintIndex);
    const streamCallIndex = legacyPill.indexOf("localResponse = await runAskTurnStream", payloadIndex);
    const payloadBlock = legacyPill.slice(payloadIndex, streamCallIndex);

    expect(requestFingerprintIndex).toBeGreaterThan(0);
    expect(payloadIndex).toBeGreaterThan(requestFingerprintIndex);
    expect(streamCallIndex).toBeGreaterThan(payloadIndex);
    expect(payloadBlock).toContain("backend_ask_entrypoint_runtime_fingerprint");
    expect(payloadBlock).toContain("submit_handler_source");
    expect(payloadBlock).toContain("runAsk_entered");
    expect(payloadBlock).toContain("backend_ask_call_attempted");
    expect(payloadBlock).toContain("backend_ask_call_path");
    expect(payloadBlock).toContain("legacy_ask_local_bypassed");
    expect(payloadBlock).toContain("workspaceContextSnapshot: reasoningContextModeForTurn === \"isolated\" ? undefined : workspaceContextSnapshotForTurn");
    expect(payloadBlock).toContain("routeMetadata: routeMetadataForTurn");
  });

  it("wraps backend stream transport with fallback for the minimal runtime shell", async () => {
    const payload = {
      agentRuntime: "codex" as const,
      agent_runtime: "codex" as const,
      languageModelProfile: "fast" as const,
      language_model_profile: "fast" as const,
      traceId: "ask:test-turn",
      turnId: "ask:test-turn",
      maxTokens: 8192,
      question: "summarize current doc",
      contextFiles: ["docs/research/nhm2-current-status-whitepaper.md"],
    };
    const streamRunner = createHelixAskMinimalRuntimeBackendRunner({
      runStream: async (runnerPayload, onEvent) => {
        onEvent?.({ event: "turn_final", data: { ok: true } });
        return {
          text: `stream:${runnerPayload.turnId}`,
          turn_id: runnerPayload.turnId,
          debug: { stream_used: true },
        };
      },
      runFallback: async () => {
        throw new Error("fallback should not run");
      },
    });
    const streamEvents: unknown[] = [];
    await expect(streamRunner(payload, (event) => streamEvents.push(event))).resolves.toEqual({
      text: "stream:ask:test-turn",
      turn_id: "ask:test-turn",
      debug: { stream_used: true },
    });
    expect(streamEvents).toEqual([{ event: "turn_final", data: { ok: true } }]);

    const fallbackRunner = createHelixAskMinimalRuntimeBackendRunner({
      runStream: async () => {
        throw new Error("stream unavailable");
      },
      runFallback: async (runnerPayload) => ({
        text: `fallback:${runnerPayload.turnId}`,
        turn_id: runnerPayload.turnId,
        debug: { stream_used: false },
      }),
    });
    await expect(fallbackRunner(payload)).resolves.toEqual({
      text: "fallback:ask:test-turn",
      turn_id: "ask:test-turn",
      debug: {
        stream_used: false,
        stream_fallback_reason: "stream unavailable",
      },
    });

    const backendRunnerSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeBackendRunner.ts",
    );
    expect(backendRunnerSource).toContain('await import("@/lib/agi/api")');
    expect(backendRunnerSource).toContain("runAskTurnStream");
    expect(backendRunnerSource).toContain("runAskTurn");
    for (const forbidden of [
      "fetch(",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
    ]) {
      expect(backendRunnerSource).not.toContain(forbidden);
    }
  });

  it("completes and fails minimal runtime injected turns without backend authority decisions", () => {
    const started = startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan: buildHelixAskMinimalRuntimeSubmitPlan({
        draft: "summarize current doc",
        selectedRuntime: "codex",
        desktopUrl: "http://127.0.0.1:1498/desktop",
      }),
      turnId: "ask:test-turn",
      startedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
    });

    expect(completeHelixAskMinimalRuntimeTurn({
      state: started,
      turnId: "ask:test-turn",
      result: {
        selected_final_answer: "Grounded final answer.",
        text: "Fallback text.",
        debug: { turn_id: "ask:test-turn" },
      },
      completedAtMs: Date.UTC(2026, 5, 29, 12, 1, 0),
    })).toMatchObject({
      askBusy: false,
      askStatus: "Final answer ready.",
      activeTurnId: null,
      activeStartedAtMs: null,
      replies: [
        {
          turn_id: "ask:test-turn",
          content: "Grounded final answer.",
          debug: { turn_id: "ask:test-turn" },
          liveEvents: [
            { id: "turn-start:ask:test-turn" },
            {
              id: "turn-final:ask:test-turn",
              text: "Final answer ready.",
              meta: {
                kind: "client_transport_turn_final",
                turn_id: "ask:test-turn",
                assistant_answer: false,
              },
            },
          ],
        },
      ],
    });

    expect(failHelixAskMinimalRuntimeTurn({
      state: started,
      turnId: "ask:test-turn",
      error: new Error("stream unavailable"),
      failedAtMs: Date.UTC(2026, 5, 29, 12, 2, 0),
    })).toMatchObject({
      askBusy: false,
      askStatus: "Ask turn failed.",
      activeTurnId: null,
      activeStartedAtMs: null,
      replies: [
        {
          turn_id: "ask:test-turn",
          content: "stream unavailable",
          liveEvents: [
            { id: "turn-start:ask:test-turn" },
            {
              id: "turn-error:ask:test-turn",
              text: "stream unavailable",
              meta: {
                kind: "client_transport_turn_error",
                turn_id: "ask:test-turn",
                assistant_answer: false,
              },
            },
          ],
        },
      ],
    });
  });

  it("does not surface backend debug-materialization text when minimal runtime explicitly missed the Ask entrypoint", () => {
    const answerText = resolveHelixAskMinimalRuntimeAnswerText({
      selected_final_answer:
        "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.",
      text: "I could not complete that turn.",
      turn_id: "ask:test-turn",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
        ask_entrypoint_failure_code: "backend_ask_entry_required",
        selected_final_answer: "I could not complete that turn.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
      },
    });

    expect(answerText).toBe("This prompt requires the backend Ask solver path before a final answer can be shown.");
    expect(answerText).not.toContain("Backend Ask was reached");
  });

  it("renders minimal runtime local turns through recrowned final-answer display", () => {
    const started = startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan: buildHelixAskMinimalRuntimeSubmitPlan({
        draft: "calculate 8*9",
        selectedRuntime: "codex",
        desktopUrl: "http://127.0.0.1:1498/desktop",
      }),
      turnId: "ask:test-turn",
      startedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
    });
    const completed = completeHelixAskMinimalRuntimeTurn({
      state: started,
      turnId: "ask:test-turn",
      result: {
        selected_final_answer: "Observed expression: 8*9\nResult: 72",
        text: "fallback",
        turn_id: "ask:test-turn",
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        model: "gpt-5",
        debug: {
          turn_id: "ask:test-turn",
          turn_transcript_events: [
            {
              source_event_type: "tool_request",
              role: "assistant",
              text: "Tool request: scientific-calculator.solve_expression",
              status: "completed",
              tool: "workstation_gateway",
            },
            {
              source_event_type: "tool_observation",
              role: "tool",
              text: "Tool observation: scientific-calculator.solve_expression observed expression 8*9 result 72",
              status: "completed",
              tool: "scientific-calculator.solve_expression",
            },
            {
              source_event_type: "model_reentry",
              role: "assistant",
              text: "Model re-entry: Codex received the workstation observation packet before final answer.",
              status: "completed",
              tool: "workstation_gateway",
            },
          ],
        },
      },
      completedAtMs: Date.UTC(2026, 5, 29, 12, 1, 0),
    });

    expect(buildHelixAskMinimalRuntimeTurnViews({
      replies: completed.replies,
    })).toEqual([
      {
        id: "ask:test-turn",
        turnId: "ask:test-turn",
        question: "calculate 8*9",
        answerText: "Observed expression: 8*9\nResult: 72",
        meta: "Provider: Codex Workstation Mode | Model: gpt-5",
        isLatest: true,
        runtimeSummaryRows: [
          {
            key: "runtime_provider",
            label: "Runtime provider",
            value: "codex / Codex Workstation Mode",
          },
          {
            key: "adapter_boundary",
            label: "Adapter boundary",
            value: "provider adapter boundary",
          },
        ],
        runtimeGoalDebugSummary: null,
        workstationTraceRows: [
          expect.objectContaining({
            label: "Tool Request",
            text: "workstation_gateway: Tool request: scientific-calculator.solve_expression",
            status: "completed",
          }),
          expect.objectContaining({
            label: "Tool Observation",
            text: "Tool observation: scientific-calculator.solve_expression observed expression 8*9 result 72",
            status: "completed",
          }),
          expect.objectContaining({
            label: "Model Re-entry",
            text: "workstation_gateway: Model re-entry: Codex received the workstation observation packet before final answer.",
            status: "completed",
          }),
        ],
      },
    ]);

    const turnListSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeTurnList.tsx",
    );
    expect(turnListSource).toContain("HelixAskTurnList");
    expect(turnListSource).toContain("HelixAskReplyCard");
    expect(turnListSource).toContain("HelixAskFinalAnswer");
    expect(turnListSource).toContain("HelixAskTurnControls");
    expect(turnListSource).toContain("buildHelixAskMinimalRuntimeControlPayload");
    expect(turnListSource).toContain("buildHelixAskRuntimeTurnSummary");
    expect(turnListSource).toContain("buildHelixTurnTranscriptRows");
    expect(turnListSource).toContain("selectHelixAskConsoleWorkstationTraceRows");
    expect(turnListSource).toContain("helix-ask-minimal-runtime-workstation-trace");
    expect(turnListSource).toContain("copyFinalTestId=\"helix-ask-latest-copy-final\"");
    expect(turnListSource).toContain("debugCopyTestId=\"helix-ask-latest-debug-copy\"");
    expect(turnListSource).toContain("readAloudTestId=\"helix-ask-latest-read-aloud\"");
    expect(turnListSource).toContain("resolveHelixAskActualAgentProviderLabel");
    expect(turnListSource).toContain("resolveHelixAskModelUsageLabel");
    for (const forbidden of [
      "fetch(",
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
    ]) {
      expect(turnListSource).not.toContain(forbidden);
    }
  });

  it("binds minimal runtime copy, debug copy, and read-aloud payloads to the latest visible turn", () => {
    const started = startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan: buildHelixAskMinimalRuntimeSubmitPlan({
        draft: "calculate 8*9",
        selectedRuntime: "codex",
        desktopUrl: "http://127.0.0.1:1498/desktop",
      }),
      turnId: "ask:test-turn",
      startedAtMs: Date.UTC(2026, 5, 29, 12, 0, 0),
    });
    const completed = completeHelixAskMinimalRuntimeTurn({
      state: started,
      turnId: "ask:test-turn",
      result: {
        selected_final_answer: "Observed expression: 8*9\nResult: 72",
        turn_id: "ask:test-turn",
        agent_runtime: "codex",
        debug: {
          debug_export_ref: "debug:ask:test-turn",
          turn_id: "ask:test-turn",
        },
      },
      completedAtMs: Date.UTC(2026, 5, 29, 12, 1, 0),
    });
    const [view] = buildHelixAskMinimalRuntimeTurnViews({ replies: completed.replies });
    const [reply] = completed.replies;
    expect(reply).toBeTruthy();
    expect(view).toBeTruthy();

    const payload = buildHelixAskMinimalRuntimeControlPayload({
      reply: reply!,
      view: view!,
    });
    expect(payload).toMatchObject({
      replyId: "ask:test-turn",
      turnId: "ask:test-turn",
      isLatest: true,
      finalAnswerText: "Observed expression: 8*9\nResult: 72",
      readAloudText: "Observed expression: 8*9\nResult: 72",
    });
    expect(JSON.parse(payload.debugCopyText)).toMatchObject({
      schema: "helix.ask.minimal_runtime.debug_copy.v1",
      reply_id: "ask:test-turn",
      turn_id: "ask:test-turn",
      is_latest: true,
      question: "calculate 8*9",
      final_answer: "Observed expression: 8*9\nResult: 72",
      debug: {
        debug_export_ref: "debug:ask:test-turn",
        turn_id: "ask:test-turn",
      },
      result: {
        turn_id: "ask:test-turn",
      },
    });
    expect(buildHelixAskMinimalRuntimeDebugCopyText({
      reply: reply!,
      view: view!,
    })).toBe(payload.debugCopyText);

    const controlsSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeControls.ts",
    );
    expect(controlsSource).toContain("navigator.clipboard.writeText");
    expect(controlsSource).toContain("document.execCommand(\"copy\")");
    expect(controlsSource).toContain("SpeechSynthesisUtterance");
    expect(controlsSource).toContain("HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS");
    for (const forbidden of [
      "fetch(",
      "runAskTurn",
      "runAskTurnStream",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
      "useAgiChatStore",
    ]) {
      expect(controlsSource).not.toContain(forbidden);
    }
  });

  it("keeps Minecraft read-aloud text exactly aligned with the authoritative visible terminal", () => {
    const prompt =
      "Inspect my paired Minecraft Fabric fireplace candidate and report only fresh verified evidence.";
    const authoritativeAnswer =
      "No safe fireplace ignition cell was observed within the fresh bounded region; no mutation was performed.";
    const started = startHelixAskMinimalRuntimeTurn({
      state: createHelixAskMinimalRuntimeInitialState(),
      submitPlan: buildHelixAskMinimalRuntimeSubmitPlan({
        draft: prompt,
        selectedRuntime: "codex",
        desktopUrl: "http://127.0.0.1:1498/desktop",
      }),
      turnId: "ask:minecraft-fireplace-parity",
      startedAtMs: Date.UTC(2026, 7, 4, 16, 0, 0),
    });
    const completed = completeHelixAskMinimalRuntimeTurn({
      state: started,
      turnId: "ask:minecraft-fireplace-parity",
      result: {
        selected_final_answer: authoritativeAnswer,
        answer: "A fireplace was probably lit successfully.",
        turn_id: "ask:minecraft-fireplace-parity",
        agent_runtime: "codex",
        terminal_artifact_kind: "compound_evidence_synthesis_answer",
      },
      completedAtMs: Date.UTC(2026, 7, 4, 16, 0, 5),
    });
    const [view] = buildHelixAskMinimalRuntimeTurnViews({
      replies: completed.replies,
    });
    const [reply] = completed.replies;
    const payload = buildHelixAskMinimalRuntimeControlPayload({
      reply: reply!,
      view: view!,
    });

    expect(payload.finalAnswerText).toBe(authoritativeAnswer);
    expect(payload.readAloudText).toBe(authoritativeAnswer);
    expect(payload.readAloudText).not.toContain("probably lit successfully");
  });

  it("materializes minimal runtime debug copy from the matching backend export only", async () => {
    const payload = {
      replyId: "reply-latest",
      turnId: "ask:latest-turn",
      isLatest: true,
      finalAnswerText: "Visible latest answer.",
      readAloudText: "Visible latest answer.",
      debugCopyText: JSON.stringify({
        schema: "helix.ask.minimal_runtime.debug_copy.v1",
        turn_id: "ask:latest-turn",
        final_answer: "Visible latest answer.",
      }),
      debugSource: {
        debug_export_ref: {
          endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
          turn_id: "ask:latest-turn",
        },
      },
    };
    const requests: unknown[] = [];
    const materialized = await materializeHelixAskMinimalRuntimeDebugCopyText({
      payload,
      materializeBackendDebugExport: async (request) => {
        requests.push(request);
        return {
          payload: {
            schema: "helix.ask.debug_export.v1",
            active_turn_id: request.turnId,
            selected_final_answer: "Visible latest answer.",
            debug_export_source: "backend_endpoint",
          },
        };
      },
    });

    expect(requests).toEqual([
      {
        replyId: "reply-latest",
        turnId: "ask:latest-turn",
        fallbackDebugCopyText: payload.debugCopyText,
        debugExportRef: {
          endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
          turn_id: "ask:latest-turn",
        },
        endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
      },
    ]);
    expect(JSON.parse(materialized)).toMatchObject({
      schema: "helix.ask.debug_export.v1",
      active_turn_id: "ask:latest-turn",
      debug_export_source: "backend_endpoint",
    });

    const stalePayload = {
      ...payload,
      debugSource: {
        debug_export_ref: {
          endpoint: "/api/agi/ask/turn/old-turn/debug-export",
          turn_id: "old-turn",
        },
      },
    };
    await expect(materializeHelixAskMinimalRuntimeDebugCopyText({
      payload: stalePayload,
      materializeBackendDebugExport: async () => {
        throw new Error("stale backend request should not run");
      },
    })).resolves.toBe(payload.debugCopyText);

    const nonLatestRequests: unknown[] = [];
    await expect(materializeHelixAskMinimalRuntimeDebugCopyText({
      payload: {
        ...payload,
        isLatest: false,
      },
      materializeBackendDebugExport: async (request) => {
        nonLatestRequests.push(request);
        return {
          payload: {
            schema: "helix.ask.debug_export.v1",
            active_turn_id: request.turnId,
            debug_export_source: "backend_endpoint",
          },
        };
      },
    })).resolves.toContain("\"debug_export_source\": \"backend_endpoint\"");
    expect(nonLatestRequests).toEqual([
      expect.objectContaining({
        turnId: "ask:latest-turn",
        endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
      }),
    ]);

    await expect(materializeHelixAskMinimalRuntimeDebugCopyText({
      payload: {
        ...payload,
        turnId: "client-only-turn",
        isLatest: false,
      },
      materializeBackendDebugExport: async () => "not used",
    })).resolves.toBe(payload.debugCopyText);

    expect(readHelixAskMinimalRuntimeDebugExportRef({
      debug: {
        debug_export_ref: {
          endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
          turn_id: "ask:latest-turn",
        },
      },
    })).toEqual({
      endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
      turn_id: "ask:latest-turn",
    });
    expect(buildHelixAskMinimalRuntimeDebugExportRequest({
      ...payload,
      debugSource: null,
    })).toMatchObject({
      replyId: "reply-latest",
      turnId: "ask:latest-turn",
      endpoint: "/api/agi/ask/turn/ask%3Alatest-turn/debug-export",
      debugExportRef: null,
    });

    const debugExportSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeDebugExport.ts",
    );
    expect(debugExportSource).toContain("HELIX_ASK_MINIMAL_RUNTIME_BACKEND_DEBUG_EXPORT_MATERIALIZER");
    expect(debugExportSource).toContain("/api/agi/ask/turn/");
    expect(debugExportSource).toContain("turn_id");
    for (const forbidden of [
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
      "runAskTurn",
      "runAskTurnStream",
      "terminal_authority",
      "speechSynthesis",
    ]) {
      expect(debugExportSource).not.toContain(forbidden);
    }
  });

  it("hydrates minimal runtime replies from durable chat sessions", () => {
    expect(buildHelixAskMinimalRuntimeRepliesFromChatSession({
      id: "session-1",
      title: "Helix Ask",
      createdAt: "2026-06-29T12:00:00.000Z",
      updatedAt: "2026-06-29T12:02:00.000Z",
      personaId: "default",
      contextId: "ctx",
      messages: [
        {
          id: "assistant-late",
          role: "assistant",
          content: "Hydrated answer.",
          at: "2026-06-29T12:02:00.000Z",
          traceId: "turn-1",
        },
        {
          id: "user-early",
          role: "user",
          content: "Hydrate this turn",
          at: "2026-06-29T12:00:00.000Z",
          traceId: "turn-1",
        },
      ],
    })).toEqual([
      {
        id: "helix-chat-turn:session-1:turn-1",
        turn_id: "turn-1",
        createdAtMs: Date.parse("2026-06-29T12:02:00.000Z"),
        content: "Hydrated answer.",
        question: "Hydrate this turn",
        mode: "observe",
        debug: {
          durable_chat_projection: true,
          session_id: "session-1",
          user_message_id: "user-early",
          assistant_message_id: "assistant-late",
          turn_id: "turn-1",
          backend_ask_call_attempted: false,
          use_backend_ask_turn_entrypoint: false,
          ask_entrypoint_observed: false,
        },
        result: {
          selected_final_answer: "Hydrated answer.",
          turn_id: "turn-1",
          final_answer_source: "durable_chat_session",
          terminal_artifact_kind: "chat_final_answer",
          terminal_error_code: null,
          debug: {
            durable_chat_projection: true,
            session_id: "session-1",
            backend_ask_call_attempted: false,
            use_backend_ask_turn_entrypoint: false,
            ask_entrypoint_observed: false,
          },
        },
        liveEvents: [],
      },
    ]);

    const chatSessionSource = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeChatSession.ts",
    );
    for (const forbidden of [
      "fetch(",
      "runAskTurn",
      "runAskTurnStream",
      "navigator.clipboard",
      "speechSynthesis",
      "AudioContext",
      "terminal_authority",
      "HelixAskLegacyRuntimeBridge",
      "@/components/helix/HelixAskPill",
      "useAgiChatStore",
    ]) {
      expect(chatSessionSource).not.toContain(forbidden);
    }
  });

  it("owns pure durable chat-session projection while policy stays injected", () => {
    const replies = buildHelixAskRepliesFromChatSessionProjection({
      session: {
        id: "session-1",
        messages: [
          {
            id: "assistant-late",
            role: "assistant",
            content: "Later answer",
            at: "2026-06-30T12:02:00.000Z",
          },
          {
            id: "user-early",
            role: "user",
            content: "What changed?",
            at: "2026-06-30T12:00:00.000Z",
            traceId: "trace-1",
          },
          {
            id: "assistant-early",
            role: "assistant",
            content: "  First answer  ",
            at: "2026-06-30T12:01:00.000Z",
          },
        ],
      },
      policy: {
        backendEntrypointRequiredErrorCode: "backend_ask_entry_required",
        backendEntrypointRequiredText: "Backend required.",
        isProgressPlaceholderText: (text) => text === "Generating...",
        requiresBackendEntrypoint: (question) => question.includes("tool"),
        isInvalidTerminalAnswerText: (text) => text === "invalid",
        renderTypedFailureFallback: (code) => `typed failure: ${code}`,
        nowMs: () => 123,
      },
    });

    expect(replies).toHaveLength(2);
    expect(replies[0]).toMatchObject({
      id: "helix-chat-turn:session-1:trace-1",
      content: "First answer",
      question: "What changed?",
      turn_id: "trace-1",
      ok: true,
      final_answer_source: "durable_chat_session",
      terminal_artifact_kind: "chat_final_answer",
      debug: {
        durable_chat_projection: true,
        blocked_projection_kind: null,
        session_id: "session-1",
        user_message_id: "user-early",
        assistant_message_id: "assistant-early",
      },
    });
    expect(replies[1]).toMatchObject({
      id: "helix-chat-turn:session-1:standalone:assistant-late",
      content: "Later answer",
      question: "",
    });
  });

  it("keeps durable chat projection from bypassing hard backend or terminal authority", () => {
    const replies = buildHelixAskRepliesFromChatSessionProjection({
      session: {
        id: "session-2",
        messages: [
          {
            id: "user-tool",
            role: "user",
            content: "Use calculator tool",
            at: "2026-06-30T12:00:00.000Z",
          },
          {
            id: "assistant-tool",
            role: "assistant",
            content: "Tool-looking durable answer",
            at: "2026-06-30T12:01:00.000Z",
          },
          {
            id: "user-tool-observed",
            role: "user",
            content: "Use calculator tool with backend observation",
            at: "2026-06-30T12:01:30.000Z",
          },
          {
            id: "assistant-tool-observed",
            role: "assistant",
            content: "Backend observed answer",
            at: "2026-06-30T12:01:45.000Z",
            helixAsk: {
              schema: "helix.ask.chat_backend_observation.v1",
              backend_ask_call_attempted: true,
              backend_ask_entrypoint_observed: true,
              use_backend_ask_turn_entrypoint: true,
              final_answer_source: "scientific_image_evidence_continuity_summary",
              terminal_artifact_kind: "scientific_image_evidence_continuity_summary",
            },
          },
          {
            id: "user-invalid",
            role: "user",
            content: "Normal question",
            at: "2026-06-30T12:02:00.000Z",
          },
          {
            id: "assistant-invalid",
            role: "assistant",
            content: "invalid",
            at: "2026-06-30T12:03:00.000Z",
          },
        ],
      },
      policy: {
        backendEntrypointRequiredErrorCode: "backend_ask_entry_required",
        backendEntrypointRequiredText: "Backend required.",
        isProgressPlaceholderText: () => false,
        requiresBackendEntrypoint: (question) => question.includes("tool"),
        isInvalidTerminalAnswerText: (text) => text === "invalid",
        renderTypedFailureFallback: (code) => `typed failure: ${code}`,
      },
    });

    expect(replies.map((reply) => reply.content)).toEqual([
      "Backend observed answer",
      "typed failure: terminal_authority_missing",
    ]);
    expect(replies.map((reply) => reply.terminal_error_code)).toEqual([
      null,
      "terminal_authority_missing",
    ]);
    expect(replies[0]).toMatchObject({
      final_answer_source: "scientific_image_evidence_continuity_summary",
      terminal_artifact_kind: "scientific_image_evidence_continuity_summary",
      debug: {
        ask_entrypoint_required: true,
        ask_entrypoint_observed: true,
        backend_ask_call_attempted: true,
        use_backend_ask_turn_entrypoint: true,
        blocked_projection_kind: null,
      },
    });
    expect(replies[1]?.final_answer_source).toBe("typed_failure");
  });

  it("suppresses generated Stage Play mailbox durable projections", () => {
    expect(shouldSuppressGeneratedStagePlayMailWakeChatProjection(
      {
        id: "user-mail",
        role: "user",
        content: "stage_play_live_source_mail_wake:abc",
        at: "2026-06-30T12:00:00.000Z",
      },
      {
        id: "assistant-mail",
        role: "assistant",
        content: "The live-source mailbox route completed.",
        at: "2026-06-30T12:01:00.000Z",
      },
    )).toBe(true);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    expect(legacyPill).toContain("buildHelixAskRepliesFromChatSessionProjection");
    expect(legacyPill).not.toContain("STAGE_PLAY_MAIL_WAKE_PROMPT_PATTERNS");
  });

  it("moves manual read-aloud playback lifecycle ownership into the recrowned runtime", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const playbackRuntime = read(
      "client/src/components/helix/ask-console/HelixAskVoicePlaybackRuntime.ts",
    );

    expect(legacyPill).toContain("playHelixAskVoiceAudioBlob({");
    expect(legacyPill).toContain("applyHelixAskVoicePlaybackTransportCommand({");
    expect(legacyPill).toContain("recordManualReadAloudLifecycleReceipt");
    expect(legacyPill).not.toContain("audio.onplaying =");
    expect(legacyPill).not.toContain("watchdogId = window.setInterval");
    expect(legacyPill).not.toContain("VOICE_PLAYBACK_NO_PROGRESS_TIMEOUT_MS");
    expect(legacyPill).not.toContain("manual_read_aloud_resume_failed");

    expect(playbackRuntime).toContain("export async function playHelixAskVoiceAudioBlob");
    expect(playbackRuntime).toContain("export async function applyHelixAskVoicePlaybackTransportCommand");
    expect(playbackRuntime).toContain("audio.onplaying =");
    expect(playbackRuntime).toContain("watchdogId = window.setInterval");
    expect(playbackRuntime).toContain("VOICE_PLAYBACK_NO_PROGRESS_TIMEOUT_MS");
    expect(playbackRuntime).toContain("manual_read_aloud_resume_failed");
    expect(playbackRuntime).toContain("recordManualReadAloudLifecycleReceipt");
  });

  it("owns pure reply lifecycle ordering while state mutation stays in the bridge", () => {
    const replies = [
      {
        id: "late",
        content: "late",
        createdAtMs: 300,
      },
      {
        id: "first-shell",
        turn_id: "same-turn",
        content: "old",
        createdAtMs: 200,
      },
      {
        id: "first-update",
        turn_id: "same-turn",
        content: "new",
        debug: { created_at_ms: 100 },
      },
    ];

    expect(resolveHelixAskConsoleReplyCanonicalKey(replies[1])).toBe("same-turn");
    expect(sortHelixAskConsoleRepliesChronologically(replies).map((reply) => reply.id)).toEqual([
      "first-shell",
      "late",
    ]);
    expect(sortHelixAskConsoleRepliesChronologically(replies)[0]).toMatchObject({
      id: "first-shell",
      content: "new",
      createdAtMs: 200,
    });
    expect(appendHelixAskConsoleReplyChronologically(replies.slice(0, 1), {
      id: "early",
      content: "early",
      createdAtMs: 100,
    }, 2).map((reply) => reply.id)).toEqual(["early", "late"]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    expect(legacyPill).toContain("appendHelixAskReplyChronologicallyWithOrder");
    expect(legacyPill).toContain("setAskReplies");
  });

  it("owns pure active stream and brief-lane reply decisions", () => {
    expect(shouldRenderHelixAskConsoleActiveTurnStream({
      askBusy: true,
      activeTurnId: "active-turn",
      latestReply: {
        id: "reply",
        turn_id: "completed-turn",
        content: "done",
      },
    })).toBe(true);
    expect(shouldRenderHelixAskConsoleActiveTurnStream({
      askBusy: true,
      activeTurnId: "active-turn",
      latestReply: {
        id: "reply",
        turn_id: "active-turn",
        content: "done",
      },
    })).toBe(false);
    expect(shouldKeepHelixAskConsoleReplyInBriefLane({
      answer_path: ["ForcedAnswer:Smalltalk_Fast_Path"],
    })).toBe(true);
    expect(shouldKeepHelixAskConsoleReplyInBriefLane({
      answer_path: ["normal"],
    })).toBe(false);

    const activeDisplay = buildHelixAskActiveTurnDisplayViewModel({
      askBusy: true,
      rows: [{
        key: "real-transcript-row",
        source: "agent_work",
        label: "Tool Observation",
        text: "Calculator observed 19*23 = 437.",
        meta: "source live_provider_transcript",
        status: "completed",
        tone: "observation",
        evidenceRefs: [],
      }],
      replyId: "ask:turn-1",
      lastTranscriptEventAppliedAtMs: 100,
      nowMs: 100 + HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS + 1,
    });
    expect(activeDisplay.visibleRows.map((row) => row.key)).toEqual(["real-transcript-row"]);
    expect(activeDisplay.statusLine).toContain("Provider running");

    const activeDisplayHelper = read("client/src/components/helix/ask-console/HelixAskActiveTurnDisplayViewModel.ts");
    expect(activeDisplayHelper).not.toContain("fetch(");
    expect(activeDisplayHelper).not.toContain("navigator.clipboard");
    expect(activeDisplayHelper).not.toContain("useAgiChatStore");
    expect(activeDisplayHelper).not.toContain("terminal_authority");
  });

  it("owns pure chat persistence payloads while store mutation stays in the bridge", () => {
    expect(buildHelixAskConsoleChatMessagePayload({
      role: "user",
      content: "Ask the active doc.",
      traceId: " trace-1 ",
    })).toEqual({
      role: "user",
      content: "Ask the active doc.",
      traceId: "trace-1",
    });
    expect(buildHelixAskConsoleChatMessagePayload({
      role: "assistant",
      content: "",
      traceId: "trace-1",
    })).toBeNull();
    expect(buildHelixAskConsoleChatTurnPayloads({
      userContent: "Question",
      assistantContent: "Answer",
      traceId: "turn-1",
    })).toEqual([
      { role: "user", content: "Question", traceId: "turn-1" },
      { role: "assistant", content: "Answer", traceId: "turn-1" },
    ]);

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const chatPersistence = read("client/src/components/helix/ask-console/HelixAskChatPersistence.ts");
    const chatPersistenceBinding = read(
      "client/src/components/helix/ask-console/HelixAskLegacyChatPersistenceBinding.ts",
    );
    expect(legacyPill).toContain("addHelixAskLegacyChatMessage(addMessage");
    expect(legacyPill).toContain("addHelixAskLegacyChatTurnMessages(addMessage");
    expect(legacyPill).not.toContain("function addHelixAskLegacyChatMessage");
    expect(legacyPill).not.toContain("function addHelixAskLegacyChatTurnMessages");
    expect(legacyPill).not.toContain("buildHelixAskConsoleChatMessagePayload");
    expect(legacyPill).not.toContain('addMessage(sessionId, { role: "user"');
    expect(legacyPill).not.toContain('addMessage(sessionId, { role: "assistant"');
    expect(legacyPill).not.toContain("userMessagePayload");
    expect(legacyPill).not.toContain("assistantMessagePayload");
    expect(chatPersistence).not.toContain("addMessage");
    expect(chatPersistence).not.toContain("setActive");
    expect(chatPersistence).not.toContain("ensureContextSession");
    expect(chatPersistenceBinding).toContain("buildHelixAskConsoleChatMessagePayload");
    expect(chatPersistenceBinding).toContain("buildHelixAskConsoleChatTurnPayloads");
    expect(chatPersistenceBinding).toContain("addMessage(sessionId, payload)");
    expect(chatPersistenceBinding).not.toContain("setActive");
    expect(chatPersistenceBinding).not.toContain("ensureContextSession");
  });

  it("preserves legacy chat persistence binding call behavior", () => {
    const calls: Array<{ sessionId: string; message: unknown }> = [];
    const addMessage = (sessionId: string, message: any) => {
      calls.push({ sessionId, message });
      return { id: `msg-${calls.length}`, at: "2026-07-01T00:00:00.000Z", tokens: 0, ...message };
    };

    expect(
      addHelixAskLegacyChatMessage(addMessage, "session-1", {
        role: "assistant",
        content: "Answer",
        traceId: " trace-1 ",
      }),
    ).toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Answer",
      traceId: "trace-1",
    });
    expect(calls).toEqual([
      {
        sessionId: "session-1",
        message: { role: "assistant", content: "Answer", traceId: "trace-1" },
      },
    ]);

    expect(
      addHelixAskLegacyChatTurnMessages(addMessage, "session-2", {
        userContent: "Question",
        assistantContent: "Answer",
        traceId: "turn-2",
      }),
    ).toHaveLength(2);
    expect(calls.slice(1)).toEqual([
      {
        sessionId: "session-2",
        message: { role: "user", content: "Question", traceId: "turn-2" },
      },
      {
        sessionId: "session-2",
        message: { role: "assistant", content: "Answer", traceId: "turn-2" },
      },
    ]);

    expect(
      addHelixAskLegacyChatMessage(addMessage, null, {
        role: "user",
        content: "Ignored",
      }),
    ).toBeNull();
    expect(
      addHelixAskLegacyChatTurnMessages(addMessage, undefined, {
        userContent: "Ignored",
        assistantContent: "Ignored",
      }),
    ).toEqual([]);
  });

  it("recrowns agent runtime preference storage without moving backend provider transport", () => {
    const values = new Map<string, string>();
    const storage: HelixAskRuntimePreferenceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };

    expect(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY).toBe("helix.ask.agentRuntime.v1");
    expect(readStoredHelixAskAgentRuntime(null)).toBe("codex");
    expect(readStoredHelixAskAgentRuntime(storage)).toBe("codex");
    values.set(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY, "codex");
    expect(readStoredHelixAskAgentRuntime(storage)).toBe("codex");
    values.set(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY, "legacy-invalid");
    expect(readStoredHelixAskAgentRuntime(storage)).toBe("codex");

    persistHelixAskAgentRuntime("codex", storage);
    expect(values.get(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY)).toBe("codex");

    const throwingStorage: HelixAskRuntimePreferenceStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(readStoredHelixAskAgentRuntime(throwingStorage)).toBe("codex");
    expect(() => persistHelixAskAgentRuntime("helix", throwingStorage)).not.toThrow();

    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        { id: "helix", label: "Helix Ask Native", enabled: true, supports: {} },
        { id: "codex", label: "Codex Workstation Mode", enabled: true, supports: {} },
        { id: "future", label: "Future Agent Wrapper", enabled: false, supports: {} },
      ],
    });
    expect(resolveHelixAgentRuntimeSelectDecision("future", providers)).toEqual({
      runtime: "helix",
      menuOpen: false,
      invalidSelection: true,
    });
    expect(resolveHelixAgentRuntimePrimaryButtonDecision({
      selectedRuntime: "helix",
      providers,
      primaryButtonMode: "cycle",
      currentMenuOpen: true,
    })).toEqual({
      runtime: "codex",
      menuOpen: false,
      persistRuntime: true,
    });
    expect(resolveHelixAgentRuntimePrimaryButtonDecision({
      selectedRuntime: "codex",
      providers,
      primaryButtonMode: "menu",
      currentMenuOpen: false,
    })).toEqual({
      runtime: "codex",
      menuOpen: true,
      persistRuntime: false,
    });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const runtimeDisplay = read("client/src/lib/helix/ask-agent-runtime-display.ts");
    const runtimePreference = read("client/src/components/helix/ask-console/HelixAskRuntimePreference.ts");
    expect(legacyPill).toContain("readStoredHelixAskAgentRuntime()");
    expect(legacyPill).toContain("persistHelixAskAgentRuntime(");
    expect(legacyPill).toContain("resolveHelixAgentRuntimeSelectDecision(runtime, agentRuntimeProviders)");
    expect(legacyPill).toContain("resolveHelixAgentRuntimePrimaryButtonDecision({");
    expect(legacyPill).toContain('fetch("/api/agi/agent-providers"');
    expect(legacyPill).not.toContain("const HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY");
    expect(legacyPill).not.toContain("function readStoredHelixAskAgentRuntime");
    expect(legacyPill).not.toContain("function persistHelixAskAgentRuntime");
    expect(runtimeDisplay).toContain("export function resolveHelixAgentRuntimeSelectDecision");
    expect(runtimeDisplay).toContain("export function resolveHelixAgentRuntimePrimaryButtonDecision");
    expect(runtimePreference).toContain("export const HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY");
    expect(runtimePreference).toContain("export function readStoredHelixAskAgentRuntime");
    expect(runtimePreference).toContain("export function persistHelixAskAgentRuntime");
    expect(runtimePreference).not.toContain('fetch("/api/agi/agent-providers"');
    expect(runtimePreference).not.toContain("setAgentRuntimeProviders");
    expect(runtimePreference).not.toContain("setSelectedAgentRuntime");
  });

  it("recrowns visual capture audio preference syncing without moving capture runtime", () => {
    const values = new Map<string, string>();
    const storage: HelixAskVisualCapturePreferenceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    const dispatched: unknown[] = [];

    expect(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY).toBe(
      "helix.liveAnswer.visualCaptureRoutes.v1",
    );
    expect(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT).toBe(
      "helix:live-answer:visual-capture-routes",
    );
    expect(readHelixAskVisualCaptureAudioPreference(null)).toBe(false);
    expect(readHelixAskVisualCaptureAudioPreference(storage)).toBe(false);

    values.set(
      HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY,
      JSON.stringify(["live_answer", "audio_transcript"]),
    );
    expect(readHelixAskVisualCaptureAudioPreference(storage)).toBe(true);
    values.set(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY, "{broken");
    expect(readHelixAskVisualCaptureAudioPreference(storage)).toBe(false);

    expect(
      syncHelixAskVisualCaptureRoutePreference(true, {
        storage,
        dispatchSyncEvent: (detail) => dispatched.push(detail),
      }),
    ).toEqual(["live_answer", "audio_transcript"]);
    expect(values.get(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY)).toBe(
      JSON.stringify(["live_answer", "audio_transcript"]),
    );
    expect(dispatched).toEqual([{ routes: ["live_answer", "audio_transcript"] }]);

    expect(
      syncHelixAskVisualCaptureRoutePreference(false, {
        storage,
        dispatchSyncEvent: (detail) => dispatched.push(detail),
      }),
    ).toEqual(["live_answer"]);
    expect(values.get(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY)).toBe(
      JSON.stringify(["live_answer"]),
    );
    expect(dispatched.at(-1)).toEqual({ routes: ["live_answer"] });

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const visualPreference = read("client/src/components/helix/ask-console/HelixAskVisualCapturePreference.ts");
    const visualRuntime = read("client/src/components/helix/ask-console/useHelixAskVisualSourceCaptureRuntime.ts");
    expect(legacyPill).toContain("useHelixAskVisualSourceCaptureRuntime({");
    expect(legacyPill).toContain("visualSituationIncludeAudio");
    expect(legacyPill).not.toContain("readHelixAskVisualCaptureAudioPreference()");
    expect(legacyPill).not.toContain("syncHelixAskVisualCaptureRoutePreference(");
    expect(legacyPill).not.toContain("attachDisplayAudioSource(");
    expect(legacyPill).not.toContain("postHelixAskAudioTranscriptChunk");
    expect(visualRuntime).toContain("readHelixAskVisualCaptureAudioPreference()");
    expect(visualRuntime).toContain("syncHelixAskVisualCaptureRoutePreference(");
    expect(visualRuntime).toContain("attachDisplayAudioSource(");
    expect(visualRuntime).toContain("postHelixAskAudioTranscriptChunk");
    expect(visualPreference).toContain("export function readHelixAskVisualCaptureAudioPreference");
    expect(visualPreference).toContain("export function syncHelixAskVisualCaptureRoutePreference");
    expect(visualPreference).toContain("HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT");
    expect(visualPreference).not.toContain("attachDisplayAudioSource");
    expect(visualPreference).not.toContain("postHelixAskAudioTranscriptChunk");
    expect(visualPreference).not.toContain("navigator.mediaDevices");
  });

  it("recrowns context compaction resume-frame storage without moving request handoff", () => {
    const values = new Map<string, string>();
    const storage: HelixAskContextCompactionResumeFrameStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    const validFrame = {
      schema: HELIX_ASK_CONTEXT_RESUME_FRAME_SCHEMA,
      page_file: "tmp/context-page.md",
      reason: "context_compaction",
    };

    expect(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY).toBe("helix.ask.contextResumeFrame.v1");
    expect(HELIX_ASK_CONTEXT_RESUME_FRAME_SCHEMA).toBe(
      "helix.pasted_text_attachment_resume_frame.v1",
    );
    expect(isHelixAskContextCompactionResumeFrame(validFrame)).toBe(true);
    expect(isHelixAskContextCompactionResumeFrame({ schema: "wrong" })).toBe(false);
    expect(isHelixAskContextCompactionResumeFrame(null)).toBe(false);
    expect(isHelixAskContextCompactionPauseText("context is compacting before the next ask turn")).toBe(true);
    expect(isHelixAskContextCompactionPauseText("active context page file is ready")).toBe(true);
    expect(isHelixAskContextCompactionPauseText("ordinary answer")).toBe(false);
    expect(
      extractHelixAskContextCompactionResumeFrame({
        pending_request: {
          resume_frame: validFrame,
        },
      }),
    ).toEqual(validFrame);
    expect(
      extractHelixAskContextCompactionResumeFrame({
        debug: {
          pending_server_request: {
            resume_frame: { schema: "wrong" },
          },
        },
      }),
    ).toBeNull();
    expect(
      extractLatestHelixAskContextCompactionResumeFrameFromReplies([
        { debug: { resume_frame: { schema: "wrong" } } },
        { envelope: { resume_frame: validFrame } },
      ]),
    ).toEqual(validFrame);
    expect(
      isHelixAskContextCompactionPausePendingReply({
        content: "waiting",
        debug: {
          pending_request: { reason: "context_compaction", resume_frame: validFrame },
        },
      }),
    ).toBe(true);
    expect(
      isHelixAskContextCompactionPausePendingReply({
        content: "context is compacting before the next ask turn",
      }),
    ).toBe(true);
    expect(
      isHelixAskContextCompactionPausePendingReply({
        content: "ordinary answer",
        debug: { pending_request: { reason: "ordinary_pending_input" } },
      }),
    ).toBe(false);
    expect(readStoredHelixAskContextCompactionResumeFrame(null)).toBeNull();
    expect(readStoredHelixAskContextCompactionResumeFrame(storage)).toBeNull();

    values.set(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY, JSON.stringify(validFrame));
    expect(readStoredHelixAskContextCompactionResumeFrame(storage)).toEqual(validFrame);
    values.set(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY, "{broken");
    expect(readStoredHelixAskContextCompactionResumeFrame(storage)).toBeNull();
    values.set(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY, JSON.stringify({ schema: "wrong" }));
    expect(readStoredHelixAskContextCompactionResumeFrame(storage)).toBeNull();

    writeStoredHelixAskContextCompactionResumeFrame(validFrame, storage);
    expect(values.get(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY)).toBe(JSON.stringify(validFrame));
    writeStoredHelixAskContextCompactionResumeFrame({ schema: "wrong" }, storage);
    expect(values.get(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY)).toBe(JSON.stringify(validFrame));

    const throwingStorage: HelixAskContextCompactionResumeFrameStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(readStoredHelixAskContextCompactionResumeFrame(throwingStorage)).toBeNull();
    expect(() => writeStoredHelixAskContextCompactionResumeFrame(validFrame, throwingStorage)).not.toThrow();

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const queuedTurnOwner = read("client/src/components/helix/ask-console/HelixAskQueuedTurn.ts");
    const storageOwner = read(
      "client/src/components/helix/ask-console/HelixAskContextCompactionResumeFrameStorage.ts",
    );
    expect(legacyPill).toContain("extractHelixAskContextCompactionResumeFrame");
    expect(legacyPill).toContain("extractLatestHelixAskContextCompactionResumeFrameFromReplies");
    expect(legacyPill).toContain("isHelixAskContextCompactionPausePendingReply");
    expect(queuedTurnOwner).toContain("context_resume_frame: args.contextResumeFrame");
    expect(legacyPill).not.toContain("context_resume_frame: args.contextResumeFrame");
    expect(legacyPill).toContain("readStoredHelixAskContextCompactionResumeFrame()");
    expect(legacyPill).toContain(
      "writeStoredHelixAskContextCompactionResumeFrame(extractedContextCompactionResumeFrame)",
    );
    expect(legacyPill).not.toContain("function isHelixAskContextCompactionPauseText");
    expect(legacyPill).not.toContain("function isHelixAskContextCompactionPausePendingReply");
    expect(legacyPill).not.toContain("function extractHelixAskContextCompactionResumeFrame");
    expect(legacyPill).not.toContain("function extractLatestHelixAskContextCompactionResumeFrameFromReplies");
    expect(legacyPill).not.toContain("function readStoredHelixAskContextCompactionResumeFrame");
    expect(legacyPill).not.toContain("function writeStoredHelixAskContextCompactionResumeFrame");
    expect(legacyPill).not.toContain("const HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY");
    expect(storageOwner).toContain("export function isHelixAskContextCompactionPauseText");
    expect(storageOwner).toContain("export function isHelixAskContextCompactionPausePendingReply");
    expect(storageOwner).toContain("export function extractHelixAskContextCompactionResumeFrame");
    expect(storageOwner).toContain("export function extractLatestHelixAskContextCompactionResumeFrameFromReplies");
    expect(storageOwner).toContain("export function readStoredHelixAskContextCompactionResumeFrame");
    expect(storageOwner).toContain("export function writeStoredHelixAskContextCompactionResumeFrame");
    expect(storageOwner).toContain("window.sessionStorage");
    expect(storageOwner).not.toContain("context_resume_frame: args.contextResumeFrame");
    expect(storageOwner).not.toContain("setContextCompactionPausePendingState");
    expect(storageOwner).not.toContain("buildQueuedAskTurn");
  });

  it("owns final-answer control button display while the bridge keeps behavior handlers", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");
    const turnControls = read("client/src/components/helix/ask-console/HelixAskTurnControls.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain(
      "onCopyFinal: () => void handleCopyReply(reply, latestTurnBinding.controlTarget.finalAnswerText)",
    );
    expect(legacyPill).toContain(
      "onReadAloud: () => void handleReadAloud(reply, latestTurnBinding.controlTarget.finalAnswerText)",
    );
    expect(legacyPill).toContain("const turnControlViewModel = buildHelixAskLegacyTurnControlViewModel({");
    expect(legacyPill).toContain("debugCopyTestId: turnControlViewModel.debugCopyTestId");
    expect(legacyPill).not.toContain("debugCopyTestId: latestTurnBinding.debugCopyTestId");
    expect(legacyPill).not.toContain("<Copy className=");
    expect(legacyPill).not.toContain("<Bug className=");
    expect(legacyPill).not.toContain("<Volume2 className=");

    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain("<HelixAskTurnControls");
    expect(turnStreamPanel).toContain("onCopyFinal={onCopyFinal}");
    expect(turnStreamPanel).toContain("onDebugCopy={onDebugCopy}");
    expect(turnStreamPanel).toContain("onReadAloud={onReadAloud}");
    expect(turnControls).toContain('aria-label="Copy response"');
    expect(turnControls).toContain('title="Unified Debug Copy"');
    expect(turnControls).toContain("const turnScopeAttributes = {");
    expect(turnControls).toContain('"data-turn-control-active-turn-id"');
    expect(turnControls).toContain('"data-turn-control-client-turn-id"');
    expect(turnControls).toContain("{...turnScopeAttributes}");
    expect(turnControls).toContain("data-debug-copy-active-turn-id");
    expect(turnControls).toContain("readAloudActive");
    expect(turnControls).not.toContain("handleCopyReply");
    expect(turnControls).not.toContain("handleCopyReplyMasterDebug");
    expect(turnControls).not.toContain("handleReadAloud");
    expect(turnControls).not.toContain("navigator.clipboard");
    expect(turnControls).not.toContain("speechSynthesis");
  });

  it("owns debug export drawer display while the bridge keeps selected drawer state", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const debugDrawer = read("client/src/components/helix/ask-console/HelixAskDebugDrawer.tsx");
    const debugDrawerSurface = read("client/src/components/helix/ask-console/HelixAskDebugDrawerSurface.tsx");

    expect(legacyPill).not.toContain("<HelixAskDebugDrawerSurface");
    expect(legacyPill).not.toContain("<HelixAskDebugDrawer\n");
    expect(legacyPill).toContain("debugDrawerState={debugExportDrawer}");
    expect(legacyPill).toContain("onDebugDrawerClose={() => setDebugExportDrawer(null)}");
    expect(legacyPill).not.toContain("payload: debugExportDrawer.payload");
    expect(legacyPill).not.toContain("readbackMatch: debugExportDrawer.result.readback_match");
    expect(legacyPill).not.toContain('data-testid="helix-debug-export-json"');
    expect(legacyPill).not.toContain("Download JSON");

    expect(legacyConsoleView).toContain("<HelixAskDebugDrawerSurface");
    expect(legacyConsoleView).toContain("drawerState={debugDrawerState}");
    expect(legacyConsoleView).toContain("onClose={onDebugDrawerClose ?? undefined}");
    expect(legacyConsoleView).not.toContain("setDebugExportDrawer");
    expect(legacyConsoleView).not.toContain("navigator.clipboard");
    expect(legacyConsoleView).not.toContain("fetch(");
    expect(debugDrawerSurface).toContain("export function HelixAskDebugDrawerSurface");
    expect(debugDrawerSurface).toContain("drawerState?: HelixAskDebugExportDrawerState");
    expect(debugDrawerSurface).toContain("payload: drawerState.payload");
    expect(debugDrawerSurface).toContain('readbackMatch: drawerState.result.readback_match ?? "unavailable"');
    expect(debugDrawerSurface).toContain("if (!resolvedDrawer) return null");
    expect(debugDrawerSurface).toContain("<HelixAskDebugDrawer {...resolvedDrawer}");
    expect(debugDrawerSurface).not.toContain("setDebugExportDrawer");
    expect(debugDrawerSurface).not.toContain("navigator.clipboard");
    expect(debugDrawerSurface).not.toContain("fetch(");
    expect(debugDrawer).toContain('aria-label="Debug Export drawer"');
    expect(debugDrawer).toContain('data-testid="helix-debug-export-drawer"');
    expect(debugDrawer).toContain('data-testid="helix-debug-export-json"');
    expect(debugDrawer).toContain("download={`helix-debug-${replyId}.json`}");
    expect(debugDrawer).toContain("Clipboard readback: {readbackMatch} | hash {payloadHash}");
    expect(debugDrawer).not.toContain("setDebugExportDrawer");
    expect(debugDrawer).not.toContain("buildDebugExport");
    expect(debugDrawer).not.toContain("navigator.clipboard");
  });

  it("owns debug export drawer state projection while the bridge keeps copy side effects", () => {
    expect(buildHelixAskDebugExportDrawerState({
      replyId: "reply-latest",
      payload: "{\"ok\":true}",
      payloadHash: "fnv1a:latest",
      result: {
        ok: true,
        attempted_payload_hash: "fnv1a:latest",
        copied_payload_hash: "fnv1a:latest",
        copied_text_length: 11,
        method: "navigator.clipboard",
        readback_match: "exact",
        fallback_presented: false,
      },
    })).toEqual({
      replyId: "reply-latest",
      payload: "{\"ok\":true}",
      payloadHash: "fnv1a:latest",
      result: {
        ok: true,
        attempted_payload_hash: "fnv1a:latest",
        copied_payload_hash: "fnv1a:latest",
        copied_text_length: 11,
        method: "navigator.clipboard",
        readback_match: "exact",
        fallback_presented: false,
      },
    });

    expect(buildHelixAskDebugDrawerCopyProjection({
      replyId: "reply-latest",
      exportPayload: "{\"ok\":true}",
      payloadHash: "fnv1a:latest",
      copyResult: {
        ok: true,
        attempted_payload_hash: "fnv1a:latest",
        copied_payload_hash: "fnv1a:latest",
        copied_text_length: 11,
        method: "navigator.clipboard",
        readback_match: "exact",
      },
    })).toMatchObject({
      copied: true,
      drawerState: {
        replyId: "reply-latest",
        payloadHash: "fnv1a:latest",
        result: {
          ok: true,
          fallback_presented: false,
          readback_match: "exact",
        },
      },
      finalCopyResult: {
        ok: true,
        method: "navigator.clipboard",
      },
    });

    expect(buildHelixAskDebugDrawerCopyProjection({
      replyId: "reply-latest",
      exportPayload: "{\"ok\":false}",
      payloadHash: "fnv1a:latest",
      copyResult: {
        ok: false,
        attempted_payload_hash: "fnv1a:latest",
        copied_text_length: 0,
        method: "failed",
        readback_match: "empty",
        error: "clipboard_write_failed",
      },
    })).toMatchObject({
      copied: false,
      drawerState: {
        replyId: "reply-latest",
        payload: "{\"ok\":false}",
        payloadHash: "fnv1a:latest",
        result: {
          ok: true,
          attempted_payload_hash: "fnv1a:latest",
          method: "debug_drawer",
          readback_match: "empty",
          fallback_presented: true,
          error: "clipboard_write_failed",
        },
      },
      finalCopyResult: {
        ok: true,
        method: "debug_drawer",
        fallback_presented: true,
      },
    });
    const currentDrawer = buildHelixAskDebugExportDrawerState({
      replyId: "reply-latest",
      payload: "{\"ok\":true}",
      payloadHash: "fnv1a:latest",
      result: {
        ok: true,
        attempted_payload_hash: "fnv1a:latest",
        copied_text_length: 11,
        method: "debug_drawer",
        readback_match: "unavailable",
        fallback_presented: true,
      },
    });
    expect(clearHelixAskDebugDrawerForStaleReply(currentDrawer, "reply-latest")).toBe(currentDrawer);
    expect(clearHelixAskDebugDrawerForStaleReply(currentDrawer, "reply-newer")).toBeNull();
    expect(clearHelixAskDebugDrawerForStaleReply(null, "reply-newer")).toBeNull();

    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const drawerState = read("client/src/components/helix/ask-console/HelixAskDebugDrawerState.ts");
    expect(legacyPill).toContain("buildHelixAskDebugDrawerCopyProjection({");
    expect(legacyPill).toContain("setDebugExportDrawer(drawerProjection.drawerState)");
    expect(legacyPill).toContain("clearHelixAskDebugDrawerForStaleReply(current, latestAskReplyIdForDebugDrawer)");
    expect(legacyPill).not.toContain("current && current.replyId !== latestAskReplyIdForDebugDrawer ? null : current");
    expect(drawerState).toContain("export function buildHelixAskDebugDrawerCopyProjection");
    expect(drawerState).toContain("export function clearHelixAskDebugDrawerForStaleReply");
    for (const forbidden of [
      "navigator.clipboard.",
      "navigator.clipboard.writeText",
      "window.",
      "fetch(",
      "resolveAuthoritativeDebugExportPayload",
      "copyDebugPayloadToClipboard",
      "SpeechSynthesisUtterance",
      "runAskTurn",
      "runAskTurnStream",
    ]) {
      expect(drawerState).not.toContain(forbidden);
    }
  });

  it("owns legacy plain response clipboard writes through the recrowned clipboard adapter", async () => {
    const originalNavigator = globalThis.navigator;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes.at(-1) ?? ""),
        },
      },
    });

    try {
      await expect(copyHelixAskPlainTextToClipboard("plain final answer")).resolves.toBe(true);
      expect(writes).toEqual(["plain final answer"]);
      await expect(copyHelixAskPlainTextToClipboard("")).resolves.toBe(false);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it("owns legacy context-capsule clipboard writes through the recrowned clipboard adapter", async () => {
    const originalNavigator = globalThis.navigator;
    const writes: string[] = [];
    const capsule = {
      stamp: {
        finalBits: "111111111111111111111111111111",
        gridW: 10,
        gridH: 3,
      },
      commit: {
        proof_verdict: "PASS",
      },
      convergence: {
        source: "repo_exact",
      },
    } as ContextCapsuleSummary;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes.at(-1) ?? ""),
        },
      },
    });

    try {
      await expect(copyHelixAskContextCapsuleToClipboard(capsule)).resolves.toBe(true);
      expect(writes).toEqual([
        ["##########", "##########", "##########", "proof:PASS  src:repo_exact"].join("\n"),
      ]);
      await expect(copyHelixAskContextCapsuleToClipboard(null)).resolves.toBe(false);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it("owns legacy debug JSON clipboard writes through the recrowned clipboard adapter", async () => {
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes.at(-1) ?? ""),
        },
      },
    });

    try {
      const result = await copyHelixAskDebugJsonToClipboard(JSON.stringify({ selected_final_answer: "ok" }));
      expect(result).toMatchObject({
        ok: true,
        method: "navigator.clipboard",
        readback_match: "exact",
      });
      expect(writes).toEqual([JSON.stringify({ selected_final_answer: "ok" })]);

      const invalid = await copyHelixAskDebugJsonToClipboard("{not-json");
      expect(invalid).toMatchObject({
        ok: false,
        copied_text_length: 0,
        method: "failed",
        readback_match: "mismatch",
        error: "debug_payload_invalid_json",
      });
      const empty = await copyHelixAskDebugJsonToClipboard("");
      expect(empty).toMatchObject({
        ok: false,
        copied_text_length: 0,
        method: "failed",
        readback_match: "empty",
        error: "debug_payload_empty",
      });

      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          clipboard: {
            writeText: vi.fn(async (text: string) => {
              writes.push(text);
            }),
            readText: vi.fn(async () => JSON.stringify({ active_turn_id: "ask:eaf320-stale" })),
          },
        },
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: undefined,
      });
      const staleReadback = await copyHelixAskDebugJsonToClipboard(
        JSON.stringify({ active_turn_id: "ask:new-visible-turn" }),
      );
      expect(staleReadback).toMatchObject({
        ok: false,
        method: "failed",
        readback_match: "mismatch",
        fallback_presented: true,
        error: "clipboard_mismatch_after_write",
      });
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  it("falls back to textarea copy for legacy plain response clipboard writes", async () => {
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;
    const appended: Array<{ removed: boolean; value: string }> = [];
    const execCommand = vi.fn(() => true);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async () => {
            throw new Error("clipboard denied");
          }),
          readText: vi.fn(async () => ""),
        },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: vi.fn(() => {
          const textarea = {
            value: "",
            style: {} as Record<string, string>,
            setAttribute: vi.fn(),
            focus: vi.fn(),
            select: vi.fn(),
            remove: vi.fn(() => {
              textarea.removed = true;
            }),
            removed: false,
          };
          return textarea;
        }),
        body: {
          appendChild: vi.fn((element: { removed: boolean; value: string }) => {
            appended.push(element);
            return element;
          }),
        },
        execCommand,
      },
    });

    try {
      await expect(copyHelixAskPlainTextToClipboard("fallback final answer")).resolves.toBe(true);
      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(appended[0]).toMatchObject({
        value: "fallback final answer",
        removed: true,
      });
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  it("owns turn-list shell display while the bridge keeps reply projection", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const turnList = read("client/src/components/helix/ask-console/HelixAskTurnList.tsx");
    const activeTurnListState = read("client/src/components/helix/ask-console/HelixAskActiveTurnListState.ts");
    const turnListSurface = read("client/src/components/helix/ask-console/HelixAskTurnListSurface.tsx");

    expect(legacyPill).not.toContain("<HelixAskTurnListSurface");
    expect(legacyPill).toContain("const turnListState = buildHelixAskActiveTurnListState({");
    expect(legacyPill).toContain("turnListState,");
    expect(legacyPill).not.toContain("turnListState={turnListState}");
    expect(legacyPill).toContain("turnListContent={");
    expect(legacyPill).toContain("turnListRef={askReplyListRef}");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskTurnList"');
    expect(legacyPill).toContain("consoleDebugSnapshot: userSettings.showHelixAskConsoleDebug ? helixAskConsoleDebugSnapshot : null");
    expect(legacyPill).not.toContain("activeTurnStreamReply: {");
    expect(legacyPill).not.toContain("activeTurnStreamPanel={activeTurnStreamPanel}");
    expect(legacyPill).toContain("laneRef: activeTurnStreamPanelRef");
    expect(legacyPill).toContain("bottomRef: askReplyListBottomRef");
    expect(legacyPill).toContain("chronologicalAskReplies.map");
    expect(legacyPill).not.toContain('data-testid="helix-ask-reply-list-bottom"');
    expect(legacyPill).not.toContain('data-testid="helix-ask-console-debug"');
    expect(legacyPill).not.toContain("@keyframes helixAskTurnFadeIn");

    expect(turnList).toContain('data-testid="helix-ask-reply-list-bottom"');
    expect(turnList).toContain('data-testid="helix-ask-console-debug"');
    expect(turnList).toContain("@keyframes helixAskTurnFadeIn");
    expect(turnList).toContain("helix-ask-turn-line-enter");
    expect(turnList.indexOf("{children}")).toBeLessThan(turnList.indexOf("{activeTurnStreamPanel}"));
    expect(turnList.indexOf("{activeTurnStreamPanel}")).toBeLessThan(turnList.indexOf('data-testid="helix-ask-reply-list-bottom"'));
    expect(turnList).not.toContain("chronologicalAskReplies.map");
    expect(turnList).not.toContain("buildHelixTurnTranscriptRows");
    expect(turnList).not.toContain("resolveHelixAskVisibleTerminal");
    expect(turnListSurface).toContain("export const HelixAskTurnListSurface");
    expect(turnListSurface).toContain("visible?: boolean");
    expect(turnListSurface).toContain("activeTurnStreamReply?: HelixAskActiveTurnReplySurfaceProps | null");
    expect(turnListSurface).toContain("<HelixAskActiveTurnReplySurface {...activeTurnStreamReply} />");
    expect(turnListSurface).toContain("if (!visible) return null");
    expect(turnListSurface).toContain("<HelixAskTurnList");
    expect(turnListSurface).toContain("activeTurnStreamPanel={resolvedActiveTurnStreamPanel}");
    expect(turnListSurface).not.toContain("chronologicalAskReplies.map");
    expect(turnListSurface).not.toContain("buildHelixTurnTranscriptRows");
    expect(turnListSurface).not.toContain("resolveHelixAskVisibleTerminal");
    expect(turnListSurface).not.toContain("fetch(");
    expect(turnListSurface).not.toContain("navigator.clipboard");
    expect(activeTurnListState).toContain("export function buildHelixAskActiveTurnListState");
    expect(activeTurnListState).toContain("visible: completedReplyCount > 0 || rows.length > 0");
    expect(activeTurnListState).toContain("activeTurnStreamReply: {");
    expect(activeTurnListState).toContain("activeTurnStreamLaneRef: laneRef");
    expect(activeTurnListState).toContain("activeTurnStreamLineCount: rows.length");
    expect(activeTurnListState).toContain("activeTurnStreamTraceId: activeTraceId");
    expect(activeTurnListState).not.toContain("buildHelixActiveTurnTranscriptRows");
    expect(activeTurnListState).not.toContain("filterHelixAskActiveTurnStreamRows");
    expect(activeTurnListState).not.toContain("setInterval");
    expect(activeTurnListState).not.toContain("fetch(");
    expect(activeTurnListState).not.toContain("navigator.clipboard");
    expect(activeTurnListState).not.toContain("speechSynthesis");
    expect(legacyConsoleView).toContain("<HelixAskTurnListSurface {...turnListState} ref={turnListRef}>");
    expect(legacyConsoleView).toContain("{turnListContent}");
    expect(legacyConsoleView).not.toContain("chronologicalAskReplies.map");
    expect(legacyConsoleView).not.toContain("buildHelixTurnTranscriptRows");
    expect(legacyConsoleView).not.toContain("resolveHelixAskVisibleTerminal");
    expect(legacyConsoleView).not.toContain("fetch(");
    expect(legacyConsoleView).not.toContain("navigator.clipboard");
    expect(turnListSurface).not.toContain("speechSynthesis");
  });

  it("owns completed reply card shell display while reply projection stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const replyCard = read("client/src/components/helix/ask-console/HelixAskReplyCard.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("turnTestId: latestTurnBinding.turnTestId");
    expect(legacyPill).toContain("isLatestReply,");
    expect(legacyPill).toContain("tintClassName: moodPalette.replyTint");
    expect(legacyPill).toContain("contextCapsule: reply.contextCapsule");
    expect(legacyPill).toContain("promptIngested: reply.promptIngested");
    expect(legacyPill).toContain("const isLatestReply = reply.id === transcriptLatestAskReplyId");
    expect(legacyPill).not.toContain("className={`relative px-1 py-1 text-sm text-slate-100 ${isLatestReply ? \"helix-ask-turn-enter\" : \"\"}`}");
    expect(legacyPill).not.toContain("pointer-events-none absolute inset-0 opacity-0 ${moodPalette.replyTint}");

    expect(replyTurn).toContain("export function HelixAskReplyTurn");
    expect(replyTurn).toContain("<HelixAskReplyCard");
    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(replyTurn).toContain("isLatestReply={isLatestReply}");
    expect(replyTurn).toContain("{...card}");
    expect(replyTurn).toContain("{...stream}");
    expect(replyTurn).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyTurn).not.toContain("resolveHelixAskVisibleTerminal");
    expect(replyTurn).not.toContain("handleCopyReply");
    expect(replyTurn).not.toContain("transcriptLatestAskReplyId");
    expect(replyCard).toContain("export function HelixAskReplyCard");
    expect(replyCard).toContain('className={`relative px-1 py-1 text-sm text-slate-100 ${isLatestReply ? "helix-ask-turn-enter" : ""}`}');
    expect(replyCard).toContain("data-testid={turnTestId}");
    expect(replyCard).toContain("pointer-events-none absolute inset-0 opacity-0 ${tintClassName}");
    expect(replyCard).toContain("<HelixAskReplyContextCapsuleCard capsule={contextCapsule} />");
    expect(replyCard).toContain("<HelixAskReplyStatusFooter visible={isLatestReply} promptIngested={promptIngested} />");
    expect(replyCard).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyCard).not.toContain("resolveHelixAskVisibleTerminal");
    expect(replyCard).not.toContain("handleCopyReply");
    expect(replyCard).not.toContain("transcriptLatestAskReplyId");
  });

  it("renders active turn stream through the same reply turn shell as completed turns", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const activeTurnReply = read("client/src/components/helix/ask-console/HelixAskActiveTurnReply.tsx");
    const activeTurnReplySurface = read("client/src/components/helix/ask-console/HelixAskActiveTurnReplySurface.tsx");
    const completedReplyTurnSurface = read("client/src/components/helix/ask-console/HelixAskCompletedReplyTurnSurface.tsx");
    const legacyCompletedReplySlot = read("client/src/components/helix/ask-console/HelixAskLegacyCompletedReplySlot.tsx");
    const legacyCompletedReplyState = read("client/src/components/helix/ask-console/HelixAskLegacyCompletedReplyState.ts");
    const replyTurnState = read("client/src/components/helix/ask-console/HelixAskReplyTurnState.ts");
    const replyTurnItemSurface = read("client/src/components/helix/ask-console/HelixAskReplyTurnItemSurface.tsx");
    const replyTurnSurface = read("client/src/components/helix/ask-console/HelixAskReplyTurnSurface.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const turnStreamPanel = read("client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx");

    expect(legacyPill).not.toContain("<HelixAskActiveTurnStreamPanel");
    expect(legacyPill).not.toContain("<HelixAskActiveTurnReplySurface");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskActiveTurnReply"');
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskActiveTurnReplySurface"');
    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).not.toContain("<HelixAskCompletedReplyTurnSurface");
    expect(legacyPill).not.toContain("<HelixAskReplyTurnItemSurface");
    expect(legacyPill).not.toContain("<HelixAskReplyTurnSurface");
    expect(legacyPill).not.toContain("<div key={reply.id}>");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskReplyTurn"');
    expect(legacyPill).toContain("const completedReplyState = buildHelixAskLegacyCompletedReplyState({");
    expect(legacyPill).toContain("turn: buildHelixAskReplyTurnState({");
    expect(legacyPill).toContain("key={completedReplyState.replyId}");
    expect(legacyPill).toContain("{...completedReplyState}");
    expect(legacyPill).toContain("rows: visibleActiveTurnStreamRows");
    expect(legacyPill).toContain("buildHelixAskActiveTurnListState");
    expect(legacyPill).not.toContain("activeTurnStreamReply: {");
    expect(legacyPill).toContain("laneRef: activeTurnStreamPanelRef");
    expect(legacyPill).not.toContain('workLogTestId: "helix-ask-active-turn-work-log"');
    expect(legacyPill).not.toContain("visibleActiveTurnStreamRows.map((row, index)");
    expect(legacyPill).not.toContain("const activeTurnStreamPanel = visibleActiveTurnStreamRows.length > 0 ? (");
    expect(legacyPill).not.toContain("renderFinalAnswer={() => null}");
    expect(legacyPill).not.toContain('data-testid="helix-ask-active-turn-stream-row"');
    expect(activeTurnReply).toContain("export function HelixAskActiveTurnReply");
    expect(activeTurnReply).toContain("<HelixAskReplyTurn");
    expect(activeTurnReply).toContain("const renderNoActiveTurnFinalAnswer = () => null");
    expect(activeTurnReply).toContain("if (rows.length === 0) return null");
    expect(activeTurnReply).toContain("renderFinalAnswer: renderFinalAnswer ?? renderNoActiveTurnFinalAnswer");
    expect(activeTurnReply).toContain('workLogTestId: "helix-ask-active-turn-work-log"');
    expect(activeTurnReply).toContain("showDebugCopy: false");
    expect(activeTurnReply).toContain("debugCopyDisabled: true");
    expect(activeTurnReply).not.toContain("visibleActiveTurnStreamRows");
    expect(activeTurnReply).not.toContain("setAskReplies");
    expect(activeTurnReply).not.toContain("fetch(");
    expect(activeTurnReplySurface).toContain("export function HelixAskActiveTurnReplySurface");
    expect(activeTurnReplySurface).toContain("<HelixAskActiveTurnReply {...props} />");
    expect(activeTurnReplySurface).not.toContain("visibleActiveTurnStreamRows");
    expect(activeTurnReplySurface).not.toContain("setAskReplies");
    expect(activeTurnReplySurface).not.toContain("fetch(");
    expect(activeTurnReplySurface).not.toContain("navigator.clipboard");
    expect(activeTurnReplySurface).not.toContain("speechSynthesis");
    expect(completedReplyTurnSurface).toContain("export function HelixAskCompletedReplyTurnSurface");
    expect(completedReplyTurnSurface).toContain("<HelixAskReplyTurnItemSurface>");
    expect(completedReplyTurnSurface).toContain("<HelixAskReplyTurnSurface {...props} />");
    expect(completedReplyTurnSurface).not.toContain("buildHelixTurnTranscriptRows");
    expect(completedReplyTurnSurface).not.toContain("handleCopyReply");
    expect(completedReplyTurnSurface).not.toContain("fetch(");
    expect(completedReplyTurnSurface).not.toContain("navigator.clipboard");
    expect(legacyCompletedReplySlot).toContain("export function HelixAskLegacyCompletedReplySlot");
    expect(legacyCompletedReplySlot).toContain("<HelixAskCompletedReplyTurnSurface key={replyId} {...turn} />");
    expect(legacyCompletedReplySlot).not.toContain("buildHelixTurnTranscriptRows");
    expect(legacyCompletedReplySlot).not.toContain("handleCopyReply");
    expect(legacyCompletedReplySlot).not.toContain("fetch(");
    expect(legacyCompletedReplySlot).not.toContain("navigator.clipboard");
    expect(legacyCompletedReplyState).toContain("export function buildHelixAskLegacyCompletedReplyState");
    expect(legacyCompletedReplyState).toContain("replyId");
    expect(legacyCompletedReplyState).toContain("turn");
    expect(legacyCompletedReplyState).not.toMatch(/from ["']react["']/);
    expect(legacyCompletedReplyState).not.toContain("@/store/");
    expect(legacyCompletedReplyState).not.toContain("@/components/helix/HelixAskPill");
    expect(legacyCompletedReplyState).not.toContain("handleCopyReply");
    expect(legacyCompletedReplyState).not.toContain("handleCopyReplyMasterDebug");
    expect(legacyCompletedReplyState).not.toContain("handleReadAloud");
    expect(legacyCompletedReplyState).not.toContain("runJobReadyLink");
    expect(legacyCompletedReplyState).not.toContain("runAskTurn");
    expect(legacyCompletedReplyState).not.toContain("fetch(");
    expect(legacyCompletedReplyState).not.toContain("navigator.clipboard");
    expect(legacyCompletedReplyState).not.toContain("speechSynthesis");
    expect(replyTurnState).toContain("export function buildHelixAskReplyTurnState");
    expect(replyTurnState).toContain("isLatestReply");
    expect(replyTurnState).toContain("card");
    expect(replyTurnState).toContain("stream");
    expect(replyTurnState).not.toMatch(/from ["']react["']/);
    expect(replyTurnState).not.toContain("@/store/");
    expect(replyTurnState).not.toContain("@/components/helix/HelixAskPill");
    expect(replyTurnState).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyTurnState).not.toContain("latestTurnBinding");
    expect(replyTurnState).not.toContain("handleCopyReply");
    expect(replyTurnState).not.toContain("handleCopyReplyMasterDebug");
    expect(replyTurnState).not.toContain("handleReadAloud");
    expect(replyTurnState).not.toContain("runJobReadyLink");
    expect(replyTurnState).not.toContain("runAskTurn");
    expect(replyTurnState).not.toContain("fetch(");
    expect(replyTurnState).not.toContain("navigator.clipboard");
    expect(replyTurnState).not.toContain("speechSynthesis");
    expect(replyTurnItemSurface).toContain("export function HelixAskReplyTurnItemSurface");
    expect(replyTurnItemSurface).toContain("return <div>{children}</div>");
    expect(replyTurnItemSurface).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyTurnItemSurface).not.toContain("handleCopyReply");
    expect(replyTurnItemSurface).not.toContain("fetch(");
    expect(replyTurnItemSurface).not.toContain("navigator.clipboard");
    expect(replyTurnSurface).toContain("export function HelixAskReplyTurnSurface");
    expect(replyTurnSurface).toContain("<HelixAskReplyTurn {...props} />");
    expect(replyTurnSurface).not.toContain("latestTurnBinding");
    expect(replyTurnSurface).not.toContain("setAskReplies");
    expect(replyTurnSurface).not.toContain("fetch(");
    expect(replyTurnSurface).not.toContain("navigator.clipboard");
    expect(replyTurnSurface).not.toContain("speechSynthesis");
    expect(replyTurn).toContain("export function HelixAskReplyTurn");
    expect(replyTurn).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanel).toContain('aria-label="Turn stream"');
    expect(turnStreamPanel).toContain("rows.map((row, index)");

    const turnList = read("client/src/components/helix/ask-console/HelixAskTurnList.tsx");
    expect(turnList).toContain('data-testid="helix-ask-active-turn-stream-lane"');
    expect(turnList).toContain('data-render-placement="inline_active_turn"');
    expect(turnList).toContain("activeTurnStreamLaneRef");
    expect(turnList).toContain("data-active-render-token");
    expect(turnList).not.toContain('className="contents"');
    expect(turnList.indexOf("{children}")).toBeLessThan(turnList.indexOf("{activeTurnStreamPanel}"));
  });

  it("owns attachment strip display while validation is recrowned and mutation stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const attachmentStrip = read("client/src/components/helix/ask-console/HelixAskAttachmentStrip.tsx");
    const attachmentStripState = read("client/src/components/helix/ask-console/HelixAskAttachmentStripState.ts");
    const attachmentCommit = read("client/src/components/helix/ask-console/HelixAskAttachmentCommit.ts");
    const attachmentPayload = read("client/src/components/helix/ask-console/HelixAskAttachmentPayload.ts");
    const imageAttachment = read("client/src/components/helix/ask-console/HelixAskImageAttachment.ts");

    expect(legacyPill).toContain("supplement: supplementState");
    expect(legacyPill).toContain("const attachmentStripState = buildHelixAskAttachmentStripState({");
    expect(legacyPill).toContain("attachmentItems: askAttachmentCommitChecks");
    expect(legacyPill).toContain("onRemoveAttachment: removeAskAttachment");
    expect(legacyPill).toContain("...attachmentStripState");
    expect(legacyPill).toContain("buildHelixAskAttachmentCommitChecks(askAttachments)");
    expect(legacyPill).toContain("hasReadyHelixAskAttachmentCommitCheck(askAttachmentCommitChecks)");
    expect(legacyPill).toContain("buildHelixAskAttachmentContextPack(submittedAttachments)");
    expect(legacyPill).toContain("buildHelixAskAttachmentTurnInputItems(submittedAttachments)");
    expect(legacyPill).toContain("buildHelixAskVisualEvidenceTurnInputContext(options?.visualEvidence)");
    expect(legacyPill).toContain("buildHelixAskTurnInputItemsForSubmit({");
    expect(legacyPill).toContain("buildHelixAskSubmitRunOptionsPayload({");
    expect(legacyPill).toContain("resolveHelixAskSubmittedAttachments({");
    expect(legacyPill).toContain("selectFirstHelixAskSubmitReadyImageAttachment(submittedAttachments)");
    expect(legacyPill).toContain("buildHelixAskSubmittedAttachmentChecks(submittedAttachments)");
    expect(legacyPill).toContain("selectFirstInvalidHelixAskSubmittedAttachment(submittedAttachmentChecks)");
    expect(legacyPill).toContain("selectHelixAskNativeImageAttachments(submittedAttachments)");
    expect(legacyPill).toContain('from "@/components/helix/ask-console/HelixAskAttachmentCommit"');
    expect(legacyPill).toContain('from "@/components/helix/ask-console/HelixAskAttachmentPayload"');
    expect(legacyPill).toContain('from "@/components/helix/ask-console/HelixAskImageAttachment"');
    expect(legacyPill).toContain("buildHelixAskImageAttachmentsFromFiles(selected)");
    expect(legacyPill).toContain("selectHelixAskClipboardImageFiles(event.clipboardData)");
    expect(legacyPill).not.toContain("validateHelixAskAttachmentForSubmit");
    expect(legacyPill).not.toContain("function validateHelixAskAttachmentForSubmit");
    expect(legacyPill).not.toContain("validateHelixAskImageAttachmentForSubmit");
    expect(legacyPill).not.toContain("const imageBase64 = await base64FromFile(file)");
    expect(legacyPill).not.toContain("URL.createObjectURL(file)");
    expect(legacyPill).not.toContain("Array.isArray(options?.attachments) && options.attachments.length > 0");
    expect(legacyPill).not.toContain("const nativeImageAttachments = submittedAttachments.filter");
    expect(legacyPill).not.toContain("const submittedAttachmentChecks = submittedAttachments.map((attachment) => ({");
    expect(legacyPill).not.toContain("const invalidSubmittedAttachment = submittedAttachmentChecks.find((entry) => !entry.check?.can_submit)");
    expect(legacyPill).not.toContain("const submittedImageAttachments = submittedAttachments.filter");
    expect(legacyPill).not.toContain("turnInputItems: promotedPastedTextTurnInputItems");
    expect(legacyPill).not.toContain("visualEvidence: submittedVisualEvidence");
    expect(legacyPill).not.toContain("visualCapability: submittedVisualCapability");
    expect(legacyPill).not.toContain("submittedAttachments.flatMap((attachment)");
    expect(legacyPill).not.toContain("attachments: submittedAttachments.map((attachment, index)");
    expect(legacyPill).not.toContain("const inferredTurnInputItemsForTurn");
    expect(legacyPill).not.toContain("const explicitTurnInputItemsForTurn");
    expect(legacyPill).not.toContain("askAttachmentCommitChecks.map");
    expect(legacyPill).not.toContain("<HelixAskAttachmentStrip");
    expect(legacyPill).not.toContain("askAttachments.map((attachment) => ({");
    expect(legacyPill).not.toContain("askAttachmentCommitChecks.some((entry) => entry.check?.can_submit)");
    expect(legacyPill).not.toContain("image ready");
    expect(legacyPill).not.toContain("text needs reattach");
    expect(legacyPill).not.toContain("<FileText className=");
    expect(legacyPill).not.toContain("<X className=");

    expect(attachmentStrip).toContain("export function HelixAskAttachmentStrip");
    expect(attachmentStrip).toContain("items.map");
    expect(attachmentStrip).toContain("image ready");
    expect(attachmentStrip).toContain("text needs reattach");
    expect(attachmentStrip).toContain("onRemove(attachment.id)");
    expect(attachmentStrip).not.toContain("validateHelixAskAttachmentForSubmit");
    expect(attachmentStrip).not.toContain("removeAskAttachment");
    expect(attachmentStrip).not.toContain("FileReader");
    expect(attachmentStripState).toContain("export function buildHelixAskAttachmentStripState");
    expect(attachmentStripState).toContain("attachmentItems");
    expect(attachmentStripState).toContain("onRemoveAttachment");
    expect(attachmentStripState).not.toContain("removeAskAttachment");
    expect(attachmentStripState).not.toContain("validateHelixAskAttachmentForSubmit");
    expect(attachmentStripState).not.toContain("buildHelixAskAttachmentTurnInputItems");
    expect(attachmentStripState).not.toContain("FileReader");
    expect(attachmentStripState).not.toContain("fetch(");
    expect(attachmentStripState).not.toContain("navigator.clipboard");
    expect(attachmentStripState).not.toContain("speechSynthesis");
    expect(supplementSurface).toContain("<HelixAskAttachmentStrip");
    expect(supplementSurface).toContain("items={attachmentItems}");
    expect(supplementSurface).toContain("onRemove={onRemoveAttachment}");
    expect(supplementSurface).not.toContain("removeAskAttachment");

    expect(attachmentCommit).toContain("export function validateHelixAskAttachmentForSubmit");
    expect(attachmentCommit).toContain("export function validateHelixAskImageAttachmentForSubmit");
    expect(attachmentCommit).toContain("export function validateHelixAskTextAttachmentForSubmit");
    expect(attachmentCommit).toContain("export function buildHelixAskAttachmentCommitChecks");
    expect(attachmentCommit).toContain("export function hasReadyHelixAskAttachmentCommitCheck");
    expect(attachmentCommit).not.toContain("removeAskAttachment");
    expect(attachmentCommit).not.toContain("FileReader");
    expect(attachmentCommit).not.toContain("source_target_intent");

    expect(imageAttachment).toContain("export function selectHelixAskClipboardImageFiles");
    expect(imageAttachment).toContain("export async function buildHelixAskImageAttachmentFromFile");
    expect(imageAttachment).toContain("export async function buildHelixAskImageAttachmentsFromFiles");
    expect(imageAttachment).toContain("HELIX_ASK_IMAGE_ATTACHMENT_MAX_BYTES");
    expect(imageAttachment).toContain("base64FromFile");
    expect(imageAttachment).not.toContain("setAskAttachments");
    expect(imageAttachment).not.toContain("runAskTurn");
    expect(imageAttachment).not.toContain("source_target_intent");

    expect(attachmentPayload).toContain("export function buildHelixAskAttachmentContextPack");
    expect(attachmentPayload).toContain("export function buildHelixAskAttachmentTurnInputItems");
    expect(attachmentPayload).toContain("export function buildHelixAskVisualEvidenceTurnInputContext");
    expect(attachmentPayload).toContain("export function buildHelixAskTurnInputItemsForSubmit");
    expect(attachmentPayload).toContain("export function buildHelixAskSubmitRunOptionsPayload");
    expect(attachmentPayload).toContain("export function resolveHelixAskSubmittedAttachments");
    expect(attachmentPayload).toContain("export function selectHelixAskNativeImageAttachments");
    expect(attachmentPayload).toContain("export function selectFirstHelixAskSubmitReadyImageAttachment");
    expect(attachmentPayload).toContain("export function buildHelixAskSubmittedAttachmentChecks");
    expect(attachmentPayload).toContain("export function selectFirstInvalidHelixAskSubmittedAttachment");
    expect(attachmentPayload).toContain("validateHelixAskAttachmentForSubmit(attachment)");
    expect(attachmentPayload).toContain("validateHelixAskImageAttachmentForSubmit(attachment)");
    expect(attachmentPayload).toContain("buildHelixAskTextAttachmentTurnInputItem(attachment)");
    expect(attachmentPayload).not.toContain("removeAskAttachment");
    expect(attachmentPayload).not.toContain("FileReader");
    expect(attachmentPayload).not.toContain("source_target_intent");
  });

  it("owns ask error-line display while error state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const statusLine = read("client/src/components/helix/ask-console/HelixAskStatusLine.tsx");
    const statusSurfaces = read("client/src/components/helix/ask-console/HelixAskConsoleStatusSurfaces.tsx");
    const errorLineSurface = read("client/src/components/helix/ask-console/HelixAskConsoleErrorLineSurface.tsx");
    const errorLineState = read("client/src/components/helix/ask-console/HelixAskConsoleErrorLineState.ts");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");

    expect(legacyPill).toContain("const errorLineState = buildHelixAskConsoleErrorLineState({");
    expect(legacyPill).toContain("message: askError");
    expect(legacyPill).toContain("errorLineState,");
    expect(legacyPill).not.toContain("errorLineState={errorLineState}");
    expect(legacyPill).not.toContain("errorMessage={askError}");
    expect(legacyPill).not.toContain("<HelixAskConsoleErrorLineSurface message={askError} />");
    expect(legacyPill).toContain("setAskError");
    expect(legacyPill).not.toContain("<HelixAskConsoleErrorSurface message={askError} />");
    expect(legacyPill).not.toContain("<HelixAskErrorLine message={askError} />");
    expect(legacyPill).not.toContain('<p className="mt-3 text-xs text-rose-200">{askError}</p>');

    expect(errorLineState).toContain("export function buildHelixAskConsoleErrorLineState");
    expect(errorLineState).toContain("message");
    expect(errorLineState).not.toContain("React");
    expect(errorLineState).not.toContain("@/store/");
    expect(errorLineState).not.toContain("@/components/helix/HelixAskPill");
    expect(errorLineState).not.toContain("setAskError");
    expect(errorLineState).not.toContain("setAskReplies");
    expect(errorLineState).not.toContain("runAskTurn");
    expect(errorLineState).not.toContain("fetch(");
    expect(errorLineState).not.toContain("navigator.clipboard");
    expect(errorLineState).not.toContain("speechSynthesis");
    expect(legacyConsoleView).toContain("errorMessage");
    expect(legacyConsoleView).toContain("errorLineState");
    expect(legacyConsoleView).toContain("<HelixAskConsoleErrorLineSurface {...(errorLineState ?? { message: errorMessage })} />");
    expect(legacyConsoleView).not.toContain("setAskError");
    expect(legacyConsoleView).not.toContain("fetch(");
    expect(errorLineSurface).toContain("export function HelixAskConsoleErrorLineSurface");
    expect(errorLineSurface).toContain("<HelixAskConsoleErrorSurface message={message} />");
    expect(errorLineSurface).not.toContain("setAskError");
    expect(errorLineSurface).not.toContain("fetch(");
    expect(errorLineSurface).not.toContain("navigator.clipboard");
    expect(errorLineSurface).not.toContain("speechSynthesis");
    expect(statusSurfaces).toContain("export function HelixAskConsoleErrorSurface");
    expect(statusSurfaces).toContain("<HelixAskErrorLine message={message} />");
    expect(statusLine).toContain("export function HelixAskErrorLine");
    expect(statusLine).toContain("if (!message) return null");
    expect(statusLine).toContain('className="mt-3 text-xs text-rose-200"');
    expect(statusLine).not.toContain("setAskError");
  });

  it("owns voice status pill display while voice capture state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const statusLine = read("client/src/components/helix/ask-console/HelixAskStatusLine.tsx");
    const statusSurfaces = read("client/src/components/helix/ask-console/HelixAskConsoleStatusSurfaces.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const voiceStatusState = read("client/src/components/helix/ask-console/HelixAskVoiceStatusState.ts");

    expect(legacyPill).toContain("const voiceStatusSupplementState = buildHelixAskVoiceStatusDerivedState({");
    expect(legacyPill).toContain("micArmState,");
    expect(legacyPill).toContain("voiceInputState,");
    expect(legacyPill).toContain("voiceInputError,");
    expect(legacyPill).toContain("...voiceStatusSupplementState");
    expect(legacyPill).toContain("buildVoiceInputStatusLabel");
    expect(legacyPill).not.toContain("const voiceInputStatusLabel = buildVoiceInputStatusLabel(");
    expect(legacyPill).not.toContain("voiceStatusLabel: voiceInputStatusLabel");
    expect(legacyPill).toContain("setVoiceInputState");
    expect(legacyPill).not.toContain("<HelixAskConsoleVoiceStatusSurface label={voiceInputStatusLabel} state={voiceInputState} />");
    expect(legacyPill).not.toContain("<HelixAskVoiceStatusPill label={voiceInputStatusLabel} state={voiceInputState} />");
    expect(legacyPill).not.toContain("{voiceInputStatusLabel ? (");
    expect(legacyPill).not.toContain("border-emerald-300/40 bg-emerald-500/10 text-emerald-100");

    expect(statusSurfaces).toContain("export function HelixAskConsoleVoiceStatusSurface");
    expect(statusSurfaces).toContain("<HelixAskVoiceStatusPill label={label} state={state} />");
    expect(supplementSurface).toContain("<HelixAskConsoleVoiceStatusSurface label={voiceStatusLabel} state={voiceStatusState} />");
    expect(statusLine).toContain("export function HelixAskVoiceStatusPill");
    expect(statusLine).toContain('state === "listening"');
    expect(statusLine).toContain("border-emerald-300/40 bg-emerald-500/10 text-emerald-100");
    expect(statusLine).not.toContain("buildVoiceInputStatusLabel");
    expect(statusLine).not.toContain("setVoiceInputState");
    expect(voiceStatusState).toContain("export function buildHelixAskVoiceStatusState");
    expect(voiceStatusState).toContain("export function buildHelixAskVoiceStatusDerivedState");
    expect(voiceStatusState).toContain("voiceStatusLabel");
    expect(voiceStatusState).toContain("voiceStatusState");
    expect(voiceStatusState).toContain("buildVoiceInputStatusLabel");
    expect(voiceStatusState).not.toContain("setVoiceInputState");
    expect(voiceStatusState).not.toContain("voiceRecorderRef");
    expect(voiceStatusState).not.toContain("MediaRecorder");
    expect(voiceStatusState).not.toContain("fetch(");
    expect(voiceStatusState).not.toContain("navigator.clipboard");
    expect(voiceStatusState).not.toContain("speechSynthesis");

    expect(buildHelixAskVoiceStatusDerivedState({
      micArmState: "off",
      voiceInputState: "listening",
      voiceInputError: null,
    })).toMatchObject({
      voiceStatusLabel: null,
      voiceStatusState: "listening",
    });
    expect(buildHelixAskVoiceStatusDerivedState({
      micArmState: "on",
      voiceInputState: "transcribing",
      voiceInputError: null,
    })).toMatchObject({
      voiceStatusLabel: "Transcribing",
      voiceStatusState: "transcribing",
    });
    expect(buildHelixAskVoiceStatusDerivedState({
      micArmState: "on",
      voiceInputState: "error",
      voiceInputError: "Microphone permission denied.",
    })).toMatchObject({
      voiceStatusLabel: "Microphone permission denied.",
      voiceStatusState: "error",
    });
  });

  it("owns voice level monitor display while voice capture metrics stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyComposerSurface = read("client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx");
    const voiceLevelMonitor = read("client/src/components/helix/ask-console/HelixAskVoiceLevelMonitor.tsx");
    const voiceLevelMonitorSurface = read("client/src/components/helix/ask-console/HelixAskVoiceLevelMonitorSurface.tsx");
    const voiceLevelMonitorState = read("client/src/components/helix/ask-console/HelixAskVoiceLevelMonitorState.ts");
    const voiceCaptureHealthState = read(
      "client/src/components/helix/ask-console/HelixAskVoiceCaptureHealthState.ts",
    );

    expect(legacyPill).toContain("composer: composerState");
    expect(legacyPill).not.toContain("<HelixAskVoiceLevelMonitorSurface");
    expect(legacyPill).not.toContain('from "@/components/helix/ask-console/HelixAskVoiceLevelMonitor"');
    expect(legacyPill).toContain("const voiceLevelMonitorState = buildHelixAskVoiceLevelMonitorState({");
    expect(legacyPill).toContain("voiceLevelMonitor: voiceLevelMonitorState");
    expect(legacyPill).toContain("micArmState,");
    expect(legacyPill).toContain("maxHeightPx: voiceMonitorMaxHeightPx");
    expect(legacyPill).toContain("level: voiceMonitorLevel");
    expect(legacyPill).toContain("signalState: voiceSignalState");
    expect(legacyPill).toContain("anchorRef: voiceMonitorAnchorRef");
    expect(legacyPill).not.toContain("visible: showTopInputLevelMonitor");
    expect(legacyPill).toContain("meterStats: voiceMeterStats");
    expect(voiceCaptureHealthState).toContain("displayLevel: meterStats.displayLevel");
    expect(legacyPill).not.toContain("Array.from({ length: 16 }).map");
    expect(legacyPill).not.toContain("Voice input level meter:");
    expect(legacyPill).not.toContain("bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.85)]");

    expect(voiceLevelMonitorSurface).toContain("export function HelixAskVoiceLevelMonitorSurface");
    expect(voiceLevelMonitorSurface).toContain("<HelixAskVoiceLevelMonitor {...props} />");
    expect(legacyComposerSurface).toContain("<HelixAskVoiceLevelMonitorSurface {...voiceLevelMonitor}");
    expect(voiceLevelMonitorSurface).not.toContain("voiceMeterStats");
    expect(voiceLevelMonitorSurface).not.toContain("setVoiceInputState");
    expect(voiceLevelMonitorSurface).not.toContain("MediaRecorder");
    expect(voiceLevelMonitorSurface).not.toContain("fetch(");
    expect(voiceLevelMonitorSurface).not.toContain("navigator.clipboard");
    expect(voiceLevelMonitorSurface).not.toContain("speechSynthesis");
    expect(voiceLevelMonitorState).toContain("export function buildHelixAskVoiceLevelMonitorState");
    expect(voiceLevelMonitorState).toContain('visible: micArmState === "on"');
    expect(voiceLevelMonitorState).toContain("anchorRef");
    expect(voiceLevelMonitorState).not.toMatch(/from [\"']react[\"']/);
    expect(voiceLevelMonitorState).not.toContain("@/store/");
    expect(voiceLevelMonitorState).not.toContain("@/components/helix/HelixAskPill");
    expect(voiceLevelMonitorState).not.toContain("voiceMeterStats");
    expect(voiceLevelMonitorState).not.toContain("setVoiceInputState");
    expect(voiceLevelMonitorState).not.toContain("MediaRecorder");
    expect(voiceLevelMonitorState).not.toContain("fetch(");
    expect(voiceLevelMonitorState).not.toContain("navigator.clipboard");
    expect(voiceLevelMonitorState).not.toContain("speechSynthesis");
    expect(buildHelixAskVoiceLevelMonitorState({
      micArmState: "off",
      maxHeightPx: 120,
      level: 0.4,
      signalState: "low",
    })).toMatchObject({
      visible: false,
      maxHeightPx: 120,
      level: 0.4,
      signalState: "low",
    });
    expect(buildHelixAskVoiceLevelMonitorState({
      micArmState: "on",
      maxHeightPx: 180,
      level: 0.8,
      signalState: "speech",
    })).toMatchObject({
      visible: true,
      maxHeightPx: 180,
      level: 0.8,
      signalState: "speech",
    });
    expect(voiceLevelMonitor).toContain("export function HelixAskVoiceLevelMonitor");
    expect(voiceLevelMonitor).toContain("aria-hidden={!visible}");
    expect(voiceLevelMonitor).toContain("Array.from({ length: 16 }).map");
    expect(voiceLevelMonitor).toContain("Voice input level meter:");
    expect(voiceLevelMonitor).toContain("level >= threshold");
    expect(voiceLevelMonitor).toContain("Math.max(0, maxHeightPx)");
    expect(voiceLevelMonitor).not.toContain("voiceMeterStats");
    expect(voiceLevelMonitor).not.toContain("setVoiceInputState");
    expect(voiceLevelMonitor).not.toContain("MediaRecorder");
  });

  it("owns context memory status display while memory state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const statusLine = read("client/src/components/helix/ask-console/HelixAskStatusLine.tsx");
    const statusSurfaces = read("client/src/components/helix/ask-console/HelixAskConsoleStatusSurfaces.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const contextCapsuleState = read("client/src/components/helix/ask-console/HelixAskContextCapsuleState.ts");
    const contextMemoryStatusState = read(
      "client/src/components/helix/ask-console/HelixAskContextMemoryStatusState.ts",
    );

    expect(legacyPill).toContain("const contextMemoryStatusState = buildHelixAskContextMemoryStatusState({");
    expect(legacyPill).toContain("contextMemoryStatusText: activeContextCapsuleDerivedState.contextMemoryStatusText");
    expect(legacyPill).toContain("...contextMemoryStatusState");
    expect(contextCapsuleState).toContain("SESSION_CAPSULE_CONFIDENCE_LABEL");
    expect(contextCapsuleState).toContain("sessionCapsuleState.confidenceBand");
    expect(legacyPill).not.toContain("<HelixAskConsoleContextMemoryStatusSurface text={contextMemoryStatusText} />");
    expect(legacyPill).not.toContain("<HelixAskContextMemoryStatusLine text={contextMemoryStatusText} />");
    expect(legacyPill).not.toContain("{contextMemoryStatusText ? (");
    expect(legacyPill).not.toContain('text-emerald-200/85">\\n                {contextMemoryStatusText}');

    expect(statusSurfaces).toContain("export function HelixAskConsoleContextMemoryStatusSurface");
    expect(statusSurfaces).toContain("<HelixAskContextMemoryStatusLine text={text} />");
    expect(supplementSurface).toContain("<HelixAskConsoleContextMemoryStatusSurface text={contextMemoryStatusText} />");
    expect(statusLine).toContain("export function HelixAskContextMemoryStatusLine");
    expect(statusLine).toContain("if (!text) return null");
    expect(statusLine).toContain("text-emerald-200/85");
    expect(statusLine).not.toContain("SESSION_CAPSULE_CONFIDENCE_LABEL");
    expect(statusLine).not.toContain("sessionCapsuleState");
    expect(contextMemoryStatusState).toContain("export function buildHelixAskContextMemoryStatusState");
    expect(contextMemoryStatusState).toContain("contextMemoryStatusText");
    expect(contextMemoryStatusState).not.toContain("SESSION_CAPSULE_CONFIDENCE_LABEL");
    expect(contextMemoryStatusState).not.toContain("sessionCapsuleState");
    expect(contextMemoryStatusState).not.toContain("fetch(");
    expect(contextMemoryStatusState).not.toContain("navigator.clipboard");
    expect(contextMemoryStatusState).not.toContain("speechSynthesis");
  });

  it("owns conversation brief display while observer selection stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const observerLane = read("client/src/components/helix/ask-console/HelixAskObserverLane.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const observerSupplementState = read("client/src/components/helix/ask-console/HelixAskObserverSupplementState.ts");

    expect(legacyPill).toContain("const observerSupplementState = buildHelixAskObserverSupplementState({");
    expect(legacyPill).toContain("conversationBriefText: latestConversationBrief?.text");
    expect(legacyPill).toContain("...observerSupplementState");
    expect(legacyPill).toContain("userSettings.showHelixAskObserverLane");
    expect(legacyPill).toContain("latestConversationBrief");
    expect(legacyPill).not.toContain("<HelixAskConversationBriefPanel text={latestConversationBrief?.text} />");
    expect(legacyPill).not.toContain('<p className="text-[9px] uppercase tracking-[0.14em] text-cyan-300/80">brief</p>');

    expect(observerLane).toContain("export function HelixAskConversationBriefPanel");
    expect(observerLane).toContain("if (!text) return null");
    expect(observerLane).toContain(">brief</p>");
    expect(observerLane).not.toContain("latestConversationBrief");
    expect(observerLane).not.toContain("showHelixAskObserverLane");
    expect(observerSupplementState).toContain("export function buildHelixAskObserverSupplementState");
    expect(observerSupplementState).not.toContain("latestConversationBrief");
    expect(observerSupplementState).not.toContain("showHelixAskObserverLane");
    expect(supplementSurface).toContain("<HelixAskConversationBriefPanel text={conversationBriefText} />");
  });

  it("owns context chooser display while chooser state and execution stay in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const observerLane = read("client/src/components/helix/ask-console/HelixAskObserverLane.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const contextChooserState = read("client/src/components/helix/ask-console/HelixAskContextChooserState.ts");

    expect(legacyPill).toContain("const HELIX_ASK_LEGACY_ATTACHED_CONTEXT_CHOOSER_ENABLED = false;");
    expect(legacyPill).toContain("HELIX_ASK_LEGACY_ATTACHED_CONTEXT_CHOOSER_ENABLED &&");
    expect(legacyPill).toContain('executeAskWithContextMode(askContextChooser.autoContextMode ?? "isolated")');
    expect(legacyPill).toContain("const contextChooserState = buildHelixAskContextChooserState({");
    expect(legacyPill).toContain("contextChooser: contextChooserState");
    expect(legacyPill).toContain("visible: Boolean(askContextChooser)");
    expect(legacyPill).toContain("autoContextMode: askContextChooser?.autoContextMode");
    expect(legacyPill).toContain("countdownSec: askContextChooserCountdownSec");
    expect(legacyPill).toContain("onRunAttached: handleAskContextChooserRunAttached");
    expect(legacyPill).toContain("onRunIsolated: handleAskContextChooserRunIsolated");
    expect(legacyPill).toContain("onCancel: dismissAskContextChooser");
    expect(legacyPill).not.toContain("<HelixAskContextChooserPanel");
    expect(legacyPill).toContain("setAskContextChooser");
    expect(legacyPill).toContain("executeAskWithContextMode");
    expect(legacyPill).not.toContain("Reasoning context");
    expect(legacyPill).not.toContain("Attach current workspace context to this reasoning turn?");
    expect(legacyPill).toContain("Attach workspace context to this reasoning turn?");

    expect(observerLane).toContain("export function HelixAskContextChooserPanel");
    expect(observerLane).toContain("if (!visible) return null");
    expect(observerLane).toContain("Reasoning context");
    expect(observerLane).toContain("Attach current workspace context to this reasoning turn?");
    expect(observerLane).toContain("Auto-running isolated in ${countdownSec}s.");
    expect(observerLane).toContain("onClick={onRunAttached}");
    expect(observerLane).toContain("onClick={onRunIsolated}");
    expect(observerLane).toContain("onClick={onCancel}");
    expect(observerLane).not.toContain("executeAskWithContextMode");
    expect(observerLane).not.toContain("setAskContextChooser");
    expect(contextChooserState).toContain("export function buildHelixAskContextChooserState");
    expect(contextChooserState).not.toContain("executeAskWithContextMode");
    expect(contextChooserState).not.toContain("setAskContextChooser");
    expect(supplementSurface).toContain("<HelixAskContextChooserPanel");
    expect(supplementSurface).toContain("visible={contextChooser.visible}");
  });

  it("owns observer lane event display while event selection stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const observerLane = read("client/src/components/helix/ask-console/HelixAskObserverLane.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const observerSupplementState = read("client/src/components/helix/ask-console/HelixAskObserverSupplementState.ts");
    const supplementClipTextState = read("client/src/components/helix/ask-console/HelixAskSupplementClipTextState.ts");

    expect(legacyPill).toContain("const observerSupplementState = buildHelixAskObserverSupplementState({");
    expect(legacyPill).toContain("observerLaneEvents,");
    expect(legacyPill).toContain("...observerSupplementState");
    expect(legacyPill).toContain("const supplementClipTextState = buildHelixAskSupplementClipTextState({");
    expect(legacyPill).toContain("clipText,");
    expect(legacyPill).toContain("...supplementClipTextState");
    expect(legacyPill).toContain("const observerLaneEvents = useMemo");
    expect(legacyPill).toContain("observer_lane_commentary");
    expect(legacyPill).not.toContain("<HelixAskObserverLanePanel");
    expect(legacyPill).not.toContain("Observer lane</p>");
    expect(legacyPill).not.toContain("Waiting for observer events...");
    expect(legacyPill).not.toContain("observerLaneEvents.map");

    expect(observerLane).toContain("export function HelixAskObserverLanePanel");
    expect(observerLane).toContain("events.map");
    expect(observerLane).toContain("Observer lane");
    expect(observerLane).toContain("Waiting for observer events...");
    expect(observerLane).toContain("toLocaleTimeString");
    expect(observerLane).not.toContain("observer_lane_commentary");
    expect(observerLane).not.toContain("helixTimeline");
    expect(observerSupplementState).toContain("observerLaneEvents");
    expect(observerSupplementState).not.toContain("observer_lane_commentary");
    expect(observerSupplementState).not.toContain("helixTimeline");
    expect(supplementClipTextState).toContain("export function buildHelixAskSupplementClipTextState");
    expect(supplementClipTextState).not.toContain("observer_lane_commentary");
    expect(supplementClipTextState).not.toContain("coerceText");
    expect(supplementSurface).toContain("<HelixAskObserverLanePanel");
    expect(supplementSurface).toContain("events={observerLaneEvents}");
  });

  it("owns the legacy steering queue slot while preserving empty day-to-day behavior", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const legacyConsoleView = read("client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx");
    const steeringPanel = read("client/src/components/helix/ask-console/HelixAskSteeringQueuePanel.tsx");
    const steeringSurface = read("client/src/components/helix/ask-console/HelixAskSteeringQueueSurface.tsx");
    const steeringDisplay = read("client/src/lib/helix/ask-steering-queue-display.ts");

    expect(legacyPill).not.toContain("<HelixAskSteeringQueueSurface />");
    expect(legacyPill).not.toContain("steeringQueue={<HelixAskSteeringQueueSurface />}");
    expect(legacyPill).not.toContain("<HelixAskSteeringQueuePanel");
    expect(legacyPill).not.toContain("items={steeringQueueItems}");
    expect(legacyPill).not.toContain("activeCount={activeSteeringQueueCount}");
    expect(legacyPill).not.toContain("expanded={steeringQueueExpanded}");
    expect(legacyPill).not.toContain("onToggleExpanded={() => setSteeringQueueExpanded((current) => !current)}");
    expect(legacyPill).not.toContain("steeringQueue={null}");
    expect(legacyPill).toContain("buildHelixAskSteeringQueueItems");
    expect(legacyPill).toContain("shouldAutoWakeHelixMailboxQueueItem");
    expect(legacyPill).not.toContain("steeringQueueItems.map((item, index)");
    expect(legacyPill).not.toContain('aria-controls="helix-ask-steering-queue-items"');
    expect(legacyPill).not.toContain("readHelixSteeringQueueItemClass(item)");
    expect(legacyPill).not.toContain("readHelixSteeringQueueDotClass(item)");

    expect(legacyConsoleView).toContain("steeringQueue={steeringQueue ?? <HelixAskSteeringQueueSurface />}");
    expect(legacyConsoleView).not.toContain("buildHelixAskSteeringQueueItems");
    expect(legacyConsoleView).not.toContain("shouldAutoWakeHelixMailboxQueueItem");
    expect(legacyConsoleView).not.toContain("setSteeringQueueExpanded");
    expect(steeringSurface).toContain("export function HelixAskSteeringQueueSurface");
    expect(steeringSurface).toContain("return null");
    expect(steeringSurface).toContain("<HelixAskSteeringQueuePanel");
    expect(steeringSurface).not.toContain("setSteeringQueueExpanded");
    expect(steeringSurface).not.toContain("buildHelixAskSteeringQueueItems");
    expect(steeringSurface).not.toContain("shouldAutoWakeHelixMailboxQueueItem");
    expect(steeringSurface).not.toContain("fetch(");
    expect(steeringSurface).not.toContain("navigator.clipboard");
    expect(steeringSurface).not.toContain("speechSynthesis");
    expect(steeringPanel).toContain("export function HelixAskSteeringQueuePanel");
    expect(steeringPanel).toContain("if (items.length === 0) return null");
    expect(steeringPanel).toContain('aria-label="Helix Ask steering queue"');
    expect(steeringPanel).toContain('aria-controls="helix-ask-steering-queue-items"');
    expect(steeringPanel).toContain('data-expanded={expanded ? "true" : "false"}');
    expect(steeringPanel).toContain('{expanded ? "Hide" : "Show"}');
    expect(steeringPanel).toContain("items.map((item, index)");
    expect(steeringPanel).toContain("readHelixSteeringQueueItemClass(item)");
    expect(steeringPanel).toContain("readHelixSteeringQueueDotClass(item)");
    expect(steeringPanel).not.toContain("setSteeringQueueExpanded");
    expect(steeringPanel).not.toContain("buildHelixAskSteeringQueueItems");
    expect(steeringPanel).not.toContain("shouldAutoWakeHelixMailboxQueueItem");

    expect(steeringDisplay).toContain("export function buildHelixAskSteeringQueueItems");
    expect(steeringDisplay).toContain("export function shouldAutoWakeHelixMailboxQueueItem");
  });

  it("owns context capsule preview display while capsule display-state derivation stays pure", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const capsulePreview = read("client/src/components/helix/ask-console/HelixAskContextCapsulePreview.tsx");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");
    const contextCapsuleState = read("client/src/components/helix/ask-console/HelixAskContextCapsuleState.ts");

    expect(legacyPill).toContain("const contextCapsuleState = buildHelixAskContextCapsuleState({");
    expect(legacyPill).toContain("const activeContextCapsuleDerivedState = useMemo(");
    expect(legacyPill).toContain("buildHelixAskActiveContextCapsuleDerivedState({");
    expect(legacyPill).toContain("contextCapsulePreview: activeContextCapsuleDerivedState.contextCapsulePreview");
    expect(legacyPill).toContain("contextCapsuleAutoApplied: activeContextCapsuleDerivedState.contextCapsuleAutoApplied");
    expect(legacyPill).toContain("...contextCapsuleState");
    expect(legacyPill).toContain("deriveSessionCapsuleState");
    expect(legacyPill).toContain("activeContextCapsuleDerivedState");
    expect(legacyPill).not.toContain("<HelixAskContextCapsulePreview ");
    expect(legacyPill).not.toContain("visual key detected");
    expect(legacyPill).not.toContain("auto-applied");
    expect(legacyPill).not.toContain("CONVERGENCE_SOURCE_LABEL[activeContextCapsulePreview");

    expect(capsulePreview).toContain("export function HelixAskContextCapsulePreview");
    expect(capsulePreview).toContain("buildContextCapsuleStampDataUri(preview.summary.stamp)");
    expect(capsulePreview).toContain("CONVERGENCE_SOURCE_LABEL[preview.convergence.source]");
    expect(capsulePreview).toContain("visual key detected");
    expect(capsulePreview).toContain("auto-applied");
    expect(capsulePreview).not.toContain("deriveSessionCapsuleState");
    expect(capsulePreview).not.toContain("sessionCapsuleState");
    expect(supplementSurface).toContain("<HelixAskContextCapsulePreview");
    expect(supplementSurface).toContain("preview={contextCapsulePreview}");
    expect(supplementSurface).toContain("autoApplied={contextCapsuleAutoApplied}");
    expect(contextCapsuleState).toContain("export function buildHelixAskContextCapsuleState");
    expect(contextCapsuleState).toContain("export function buildHelixAskActiveContextCapsuleDerivedState");
    expect(contextCapsuleState).toContain("contextCapsulePreview");
    expect(contextCapsuleState).toContain("contextCapsuleAutoApplied");
    expect(contextCapsuleState).not.toContain("deriveSessionCapsuleState");
    expect(contextCapsuleState).toContain("sessionCapsuleState");
    expect(contextCapsuleState).not.toContain("copyHelixAskContextCapsuleToClipboard");
    expect(contextCapsuleState).not.toContain("fetch(");
    expect(contextCapsuleState).not.toContain("navigator.clipboard");
    expect(contextCapsuleState).not.toContain("speechSynthesis");
  });

  it("owns reply context capsule card display while reply state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const replyCard = read("client/src/components/helix/ask-console/HelixAskReplyCard.tsx");
    const replyTurn = read("client/src/components/helix/ask-console/HelixAskReplyTurn.tsx");
    const capsulePreview = read("client/src/components/helix/ask-console/HelixAskContextCapsulePreview.tsx");
    const clipboard = read("client/src/components/helix/ask-console/HelixAskClipboard.ts");

    expect(legacyPill).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(legacyPill).toContain("contextCapsule: reply.contextCapsule");
    expect(legacyPill).toContain("contextCapsule: responseContextCapsule");
    expect(legacyPill).toContain("copyHelixAskContextCapsuleToClipboard(reply.contextCapsule)");
    expect(legacyPill).not.toContain("buildContextCapsuleCopyText(reply.contextCapsule)");
    expect(legacyPill).not.toContain("<HelixAskReplyContextCapsuleCard");
    expect(legacyPill).not.toContain("buildContextCapsuleStampDataUri(reply.contextCapsule.stamp)");
    expect(legacyPill).not.toContain('alt="Context capsule fingerprint"\\n                          className="mt-1 h-10 w-44');

    expect(replyTurn).toContain("<HelixAskReplyCard");
    expect(replyCard).toContain("<HelixAskReplyContextCapsuleCard capsule={contextCapsule} />");
    expect(replyCard).not.toContain("responseContextCapsule");
    expect(replyCard).not.toContain("buildContextCapsuleCopyText");
    expect(capsulePreview).toContain("export function HelixAskReplyContextCapsuleCard");
    expect(capsulePreview).toContain("if (!capsule) return null");
    expect(capsulePreview).toContain("buildContextCapsuleStampDataUri(capsule.stamp)");
    expect(capsulePreview).toContain(">Context capsule</p>");
    expect(capsulePreview).toContain("auto\n        </span>");
    expect(capsulePreview).not.toContain("responseContextCapsule");
    expect(capsulePreview).not.toContain("buildContextCapsuleCopyText");
    expect(clipboard).toContain("export async function copyHelixAskContextCapsuleToClipboard");
    expect(clipboard).toContain("buildContextCapsuleCopyText(summary)");
  });

  it("owns Situation Room source panel display while source state stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const situationPanel = read("client/src/components/helix/ask-console/HelixAskSituationRoomSourcePanel.tsx");
    const situationState = read("client/src/components/helix/ask-console/HelixAskSituationRoomSourceState.ts");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");

    expect(legacyPill).toContain("const situationRoomSourceState = buildHelixAskSituationRoomSourceDerivedState({");
    expect(legacyPill).toContain("situationRoomSource: situationRoomSourceState");
    expect(legacyPill).toContain("visualSituationSourceStatus,");
    expect(legacyPill).toContain("displayAudioSourceSnapshot,");
    expect(legacyPill).toContain("situationRoomState,");
    expect(legacyPill).toContain("onStopDisplayAudio: stopDisplayAudioCapture");
    expect(legacyPill).not.toContain("const showSituationRoomSourcePanel =");
    expect(legacyPill).not.toContain("const situationSourceDisplayLabel =");
    expect(legacyPill).not.toContain("const situationSourceDisplayStatus =");
    expect(legacyPill).not.toContain("const displayAudioActive =");
    expect(legacyPill).not.toContain("<HelixAskSituationRoomSourcePanel");
    expect(legacyPill).not.toContain("Situation Room Source");
    expect(legacyPill).not.toContain("Awaiting transcript chunks.");
    expect(legacyPill).not.toContain("Stop source");

    expect(situationPanel).toContain("export function HelixAskSituationRoomSourcePanel");
    expect(situationPanel).toContain("if (!visible) return null");
    expect(situationPanel).toContain("Situation Room Source");
    expect(situationPanel).toContain("Awaiting transcript chunks.");
    expect(situationPanel).toContain("Stop source");
    expect(situationPanel).toContain("onClick={onStopDisplayAudio}");
    expect(situationPanel).not.toContain("displayAudioSourceSnapshot");
    expect(situationPanel).not.toContain("situationRoomState");
    expect(situationPanel).not.toContain("stopDisplayAudioCapture");
    expect(situationState).toContain("export function buildHelixAskSituationRoomSourceState");
    expect(situationState).toContain("export function buildHelixAskSituationRoomSourceDerivedState");
    expect(situationState).toContain("displayAudioSourceSnapshot?.transcript_preview");
    expect(situationState).toContain("situationRoomState.recentTranscript");
    expect(situationState).toContain("situationRoomState.recentEvents.length");
    expect(situationState).not.toContain("useSituationRoomStore");
    expect(situationState).not.toContain("displayAudioSourceIdRef");
    expect(situationState).not.toContain("visualSituationSourceIdRef");
    expect(situationState).not.toContain("stopDisplayAudioCapture");
    expect(supplementSurface).toContain("<HelixAskSituationRoomSourcePanel");
    expect(supplementSurface).toContain("visible={situationRoomSource.visible}");
    expect(supplementSurface).toContain("onStopDisplayAudio={situationRoomSource.onStopDisplayAudio}");
  });

  it("derives Situation Room source display state without reading legacy refs or stores", () => {
    const stopDisplayAudio = vi.fn();
    const derived = buildHelixAskSituationRoomSourceDerivedState({
      visualSituationSourceStatus: "idle",
      visualSituationSourceLabel: null,
      visualSituationSourceError: null,
      displayAudioStatus: "transcribing",
      displayAudioError: "audio warning",
      displayAudioCaptureLabel: "Display audio fallback",
      displayAudioSourceSnapshot: {
        label: "Browser tab",
        status: "transcribing",
        transcript_preview: "latest transcript preview",
      },
      situationRoomState: {
        recentTranscript: [
          {
            id: "segment:1",
            room_id: "room:test",
            source: "display_tab_audio",
            text: "older transcript",
            ts: "2026-06-29T12:00:00.000Z",
          },
        ],
        recentEvents: [
          {
            id: "event:1",
            room_id: "room:test",
            source: "display_tab_audio",
            event_type: "voice_transcript",
            evidence_refs: [],
            ts: "2026-06-29T12:00:00.000Z",
          },
        ],
        sources: {},
      },
      onStopDisplayAudio: stopDisplayAudio,
    });

    expect(derived).toMatchObject({
      visible: true,
      label: "Browser tab",
      status: "transcribing",
      sourceCount: 1,
      visualError: null,
      audioError: "audio warning",
      visualSourceActive: false,
      transcriptPreview: "latest transcript preview",
      displayAudioActive: true,
    });
    expect(derived.onStopDisplayAudio).toBe(stopDisplayAudio);

    expect(buildHelixAskSituationRoomSourceDerivedState({
      visualSituationSourceStatus: "idle",
      displayAudioStatus: "idle",
      displayAudioCaptureLabel: "Display audio fallback",
      displayAudioSourceSnapshot: null,
      situationRoomState: {
        recentTranscript: [],
        recentEvents: [],
        sources: {},
      },
      onStopDisplayAudio: stopDisplayAudio,
    })).toMatchObject({
      visible: false,
      label: "Display audio fallback",
      status: "idle",
      sourceCount: 0,
      transcriptPreview: "",
      displayAudioActive: false,
    });
  });

  it("owns voice command confirmation display while command policy stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const voiceConfirmation = read("client/src/components/helix/ask-console/HelixAskVoiceConfirmationPanel.tsx");
    const voiceConfirmationState = read("client/src/components/helix/ask-console/HelixAskVoiceConfirmationState.ts");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");

    expect(legacyPill).toContain("const voiceCommandConfirmationState = buildHelixAskVoiceCommandConfirmationState({");
    expect(legacyPill).toContain("voiceCommandConfirmation: voiceCommandConfirmationState");
    expect(legacyPill).toContain("visible: !transcriptConfirmState && Boolean(commandConfirmState)");
    expect(legacyPill).toContain("actionLabel: commandConfirmState ? describeVoiceCommandAction(commandConfirmState.action) : \"\"");
    expect(legacyPill).toContain("onAccept: handleCommandConfirmationAccept");
    expect(legacyPill).toContain("onCancel: handleCommandConfirmationCancel");
    expect(legacyPill).toContain("setCommandConfirmState");
    expect(legacyPill).not.toContain("<HelixAskVoiceCommandConfirmationPanel");
    expect(legacyPill).not.toContain("Voice command</p>");
    expect(legacyPill).not.toContain("Auto-confirming in {commandConfirmAutoCountdownSec}s");

    expect(voiceConfirmation).toContain("export function HelixAskVoiceCommandConfirmationPanel");
    expect(voiceConfirmation).toContain("if (!visible) return null");
    expect(voiceConfirmation).toContain("Voice command");
    expect(voiceConfirmation).toContain("Auto-confirming in {countdownSec}s");
    expect(voiceConfirmation).toContain("onClick={onAccept}");
    expect(voiceConfirmation).toContain("onClick={onCancel}");
    expect(voiceConfirmation).not.toContain("describeVoiceCommandAction");
    expect(voiceConfirmation).not.toContain("setCommandConfirmState");
    expect(voiceConfirmationState).toContain("export function buildHelixAskVoiceCommandConfirmationState");
    expect(voiceConfirmationState).not.toContain("describeVoiceCommandAction");
    expect(voiceConfirmationState).not.toContain("setCommandConfirmState");
    expect(supplementSurface).toContain("<HelixAskVoiceCommandConfirmationPanel");
    expect(supplementSurface).toContain("visible={voiceCommandConfirmation.visible}");
  });

  it("owns transcript confirmation display while transcript policy stays in the bridge", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const voiceConfirmation = read("client/src/components/helix/ask-console/HelixAskVoiceConfirmationPanel.tsx");
    const voiceConfirmationState = read("client/src/components/helix/ask-console/HelixAskVoiceConfirmationState.ts");
    const supplementSurface = read("client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx");

    expect(legacyPill).toContain("const transcriptConfirmationState = buildHelixAskTranscriptConfirmationState({");
    expect(legacyPill).toContain("transcriptConfirmation: transcriptConfirmationState");
    expect(legacyPill).toContain("visible: Boolean(transcriptConfirmState)");
    expect(legacyPill).toContain("countdownSec: transcriptConfirmAutoCountdownSec");
    expect(legacyPill).toContain("onAccept: handleTranscriptConfirmationAccept");
    expect(legacyPill).toContain("onRetry: handleTranscriptConfirmationRetryFromPanel");
    expect(legacyPill).toContain("setTranscriptConfirmState");
    expect(legacyPill).not.toContain("<HelixAskTranscriptConfirmationPanel");
    expect(legacyPill).not.toContain("Confirm transcript</p>");
    expect(legacyPill).not.toContain("Auto-confirming in {transcriptConfirmAutoCountdownSec}s");

    expect(voiceConfirmation).toContain("export function HelixAskTranscriptConfirmationPanel");
    expect(voiceConfirmation).toContain("showSourceText");
    expect(voiceConfirmation).toContain("Confirm transcript");
    expect(voiceConfirmation).toContain("Auto-confirming in {countdownSec}s");
    expect(voiceConfirmation).toContain("onClick={onAccept}");
    expect(voiceConfirmation).toContain("onClick={onRetry}");
    expect(voiceConfirmation).not.toContain("setTranscriptConfirmState");
    expect(voiceConfirmationState).toContain("export function buildHelixAskTranscriptConfirmationState");
    expect(voiceConfirmationState).not.toContain("setTranscriptConfirmState");
    expect(supplementSurface).toContain("<HelixAskTranscriptConfirmationPanel");
    expect(supplementSurface).toContain("visible={transcriptConfirmation.visible}");
  });

  it("owns voice confirmation countdown behavior in the shared recrowned runtime", () => {
    const legacyPill = read("client/src/components/helix/HelixAskPill.tsx");
    const runtime = read(
      "client/src/components/helix/ask-console/HelixAskVoiceConfirmationRuntime.tsx",
    );
    const minimalRuntime = read(
      "client/src/components/helix/ask-console/HelixAskMinimalRuntimeShell.tsx",
    );

    expect(runtime).toContain("export function useHelixAskVoiceConfirmationRuntime");
    expect(runtime).toContain("export function HelixAskVoiceConfirmationRuntimeSurface");
    expect(runtime).toContain("HELIX_ASK_VOICE_CONFIRMATION_COUNTDOWN_MS = 3_000");
    expect(runtime).toContain("command_countdown_fired");
    expect(runtime).toContain("transcript_countdown_fired");
    expect(runtime).toContain("buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection");
    expect(runtime).toContain("window.setInterval");
    expect(runtime).toContain("window.clearInterval");
    expect(legacyPill).toContain("useHelixAskVoiceConfirmationRuntime({");
    expect(legacyPill).toContain("onCommandAutoConfirm: acceptCommandConfirmationCandidate");
    expect(legacyPill).toContain("acceptTranscriptConfirmationCandidate(candidateId, \"auto\")");
    expect(legacyPill).not.toContain("commandConfirmAutoTimerRef");
    expect(legacyPill).not.toContain("transcriptConfirmAutoTimerRef");
    expect(minimalRuntime).toContain("voiceConfirmationRuntime?: HelixAskVoiceConfirmationRuntimeSurfaceProps");
    expect(minimalRuntime).toContain("<HelixAskVoiceConfirmationRuntimeSurface");
    expect(runtime).not.toContain("dispatchConfirmedVoiceTranscript");
    expect(runtime).not.toContain("executeVoiceCommandLaneAction");
    expect(runtime).not.toContain("fetch(");
    expect(runtime).not.toContain("@/store/");
  });

  it("bounds debug exports without preserving stale client projection when backend Ask was required", () => {
    const staleProjection =
      "I can see the scientific workflow still has a page source to work from, but the reusable scientific evidence package is not available in this turn.";
    const oversizedDebugPayload = JSON.stringify({
      schema: "helix.ask.debug_export.v1",
      active_turn_id: "ask:moral-graph-entrypoint-missed",
      active_prompt:
        "Use the Moral Graph to help me reflect on a roommate situation where delayed disclosure removed planning options.",
      selected_final_answer: staleProjection,
      final_answer_source: null,
      terminal_artifact_kind: null,
      terminal_error_code: null,
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      blocked_projection_kind: "client_projection",
      debug_export_source: "backend_ref_advertised",
      backend_debug_response_status: "ref_advertised",
      giant_debug_blob: "x".repeat(HELIX_DEBUG_EXPORT_MAX_UI_CHARS + 1000),
    });

    const parsed = JSON.parse(boundHelixDebugExportTextForUi(oversizedDebugPayload));

    expect(parsed).toMatchObject({
      selected_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "backend_ask_entry_required",
      first_broken_rail: "backend_ask_entrypoint",
      repair_target: "prompt_submit_entrypoint",
    });
    expect(parsed.selected_final_answer).not.toContain("scientific workflow");
  });

  it("resolves backend-entrypoint miss as a typed failure before stale client text can answer", () => {
    const staleProjection =
      "I can see the scientific workflow still has a page source to work from, but the reusable scientific evidence package is not available in this turn.";
    const projection = resolveHelixAskBackendEntrypointFailureProjection({
      source: {
        selected_final_answer: staleProjection,
        ask_entrypoint_required: true,
        ask_entrypoint_observed: false,
      },
    });

    expect(projection).toMatchObject({
      selected_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: "backend_ask_entry_required",
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      blocked_projection_kind: "client_projection",
      first_broken_rail: "backend_ask_entrypoint",
      repair_target: "prompt_submit_entrypoint",
    });
    expect(projection?.selected_final_answer).not.toContain("scientific workflow");

    expect(
      resolveHelixAskBackendEntrypointFailureProjection({
        source: {
          selected_final_answer: "Moral Graph answered from its observation.",
          ask_entrypoint_required: true,
          ask_entrypoint_observed: true,
        },
      }),
    ).toBeNull();
  });

  it("selects visible final answer from terminal authority before stale selected text", () => {
    const selection = selectHelixAskVisibleFinalAnswer({
      source: {
        selected_final_answer:
          "I can see the scientific workflow still has a page source to work from, but the reusable scientific evidence package is not available in this turn.",
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          server_authoritative: true,
          terminal_text_preview:
            "The Moral Graph treats this as a bounded procedural reflection about disclosure under shared dependency.",
          terminal_artifact_kind: "model_synthesized_answer",
          final_answer_source: "final_answer_draft",
        },
      },
    });

    expect(selection).toMatchObject({
      text: "The Moral Graph treats this as a bounded procedural reflection about disclosure under shared dependency.",
      backendTerminalText:
        "The Moral Graph treats this as a bounded procedural reflection about disclosure under shared dependency.",
      terminalArtifactKind: "model_synthesized_answer",
      finalAnswerSource: "final_answer_draft",
      authorityVerified: true,
    });
    expect(selection.text).not.toContain("scientific workflow");
  });

  it("selects backend-entrypoint typed failure as visible final answer when projection is blocked", () => {
    const selection = selectHelixAskVisibleFinalAnswer({
      source: {
        selected_final_answer: "This prompt requires the backend Ask solver path before a final answer can be shown.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "backend_ask_entry_required",
      },
    });

    expect(selection).toMatchObject({
      text: "This prompt requires the backend Ask solver path before a final answer can be shown.",
      terminalArtifactKind: "typed_failure",
      finalAnswerSource: "typed_failure",
      terminalErrorCode: "backend_ask_entry_required",
    });
  });
});
