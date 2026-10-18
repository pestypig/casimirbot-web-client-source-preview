import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import { buildHelixAskConsoleContextFiles } from "@/components/helix/ask-console/HelixAskRequestEnvelope";
import { appendHelixAskConsoleReplyChronologically } from "@/components/helix/ask-console/HelixAskReplyLifecycle";

const appendHelixAskReplyChronologically = (replies: any[], reply: any, limit = 50): any[] =>
  appendHelixAskConsoleReplyChronologically(replies, reply, limit);

let mergeVoiceTranscriptDraft: typeof import("@/components/helix/HelixAskPill").mergeVoiceTranscriptDraft;
let resolveVoiceDispatchTranscriptFromDraft: typeof import("@/components/helix/HelixAskPill").resolveVoiceDispatchTranscriptFromDraft;
let buildVoiceInputStatusLabel: typeof import("@/components/helix/HelixAskPill").buildVoiceInputStatusLabel;
let scoreConversationCompletion: typeof import("@/components/helix/HelixAskPill").scoreConversationCompletion;
let shouldDispatchReasoningAttempt: typeof import("@/components/helix/HelixAskPill").shouldDispatchReasoningAttempt;
let shouldForceObserveDispatchFromSuppression: typeof import("@/components/helix/HelixAskPill").shouldForceObserveDispatchFromSuppression;
let inferSuppressionCauseFromRouteReason: typeof import("@/components/helix/HelixAskPill").inferSuppressionCauseFromRouteReason;
let deriveVoiceTimelineSuppressionMeta: typeof import("@/components/helix/HelixAskPill").deriveVoiceTimelineSuppressionMeta;
let resolveSuppressedDispatchRescueTranscript: typeof import("@/components/helix/HelixAskPill").resolveSuppressedDispatchRescueTranscript;
let isLikelyContextDependentTurn: typeof import("@/components/helix/HelixAskPill").isLikelyContextDependentTurn;
let buildVoiceReasoningDispatchPrompt: typeof import("@/components/helix/HelixAskPill").buildVoiceReasoningDispatchPrompt;
let shouldMergeVoiceContinuationTurn: typeof import("@/components/helix/HelixAskPill").shouldMergeVoiceContinuationTurn;
let shouldMergeVoiceContinuationInFlight: typeof import("@/components/helix/HelixAskPill").shouldMergeVoiceContinuationInFlight;
let shouldMergePendingConfirmationTranscript: typeof import("@/components/helix/HelixAskPill").shouldMergePendingConfirmationTranscript;
let decideExplorationLadderAction: typeof import("@/components/helix/HelixAskPill").decideExplorationLadderAction;
let smoothVoiceLevel: typeof import("@/components/helix/HelixAskPill").smoothVoiceLevel;
let isFlatVoiceSignal: typeof import("@/components/helix/HelixAskPill").isFlatVoiceSignal;
let isRecorderStalled: typeof import("@/components/helix/HelixAskPill").isRecorderStalled;
let isLikelyLoopbackDeviceLabel: typeof import("@/components/helix/HelixAskPill").isLikelyLoopbackDeviceLabel;
let shouldPrimeSegmentWithContainerHeader: typeof import("@/components/helix/HelixAskPill").shouldPrimeSegmentWithContainerHeader;
let getMicRecorderMimeCandidates: typeof import("@/components/helix/HelixAskPill").getMicRecorderMimeCandidates;
let pickSupportedMicRecorderMimeType: typeof import("@/components/helix/HelixAskPill").pickSupportedMicRecorderMimeType;
let formatVoiceDecisionSentence: typeof import("@/components/helix/HelixAskPill").formatVoiceDecisionSentence;
let composeVoiceBriefWithDecision: typeof import("@/components/helix/HelixAskPill").composeVoiceBriefWithDecision;
let isAgibotPreflightScopeError: typeof import("@/components/helix/HelixAskPill").isAgibotPreflightScopeError;
let deriveTranscriptConfidence: typeof import("@/components/helix/HelixAskPill").deriveTranscriptConfidence;
let shouldRequireTranscriptConfirmation: typeof import("@/components/helix/HelixAskPill").shouldRequireTranscriptConfirmation;
let shouldAutoConfirmTranscriptPrompt: typeof import("@/components/helix/HelixAskPill").shouldAutoConfirmTranscriptPrompt;
let resolveTranscriptConfirmPolicy: typeof import("@/components/helix/HelixAskPill").resolveTranscriptConfirmPolicy;
let shouldIgnoreLowQualityTranscriptBargeIn: typeof import("@/components/helix/HelixAskPill").shouldIgnoreLowQualityTranscriptBargeIn;
let parseTranscriptConfirmationVoiceCommand: typeof import("@/components/helix/HelixAskPill").parseTranscriptConfirmationVoiceCommand;
let shouldInterruptForSupersededReason: typeof import("@/components/helix/HelixAskPill").shouldInterruptForSupersededReason;
let scoreVoiceTurnComplete: typeof import("@/components/helix/HelixAskPill").scoreVoiceTurnComplete;
let scoreIntentShift: typeof import("@/components/helix/HelixAskPill").scoreIntentShift;
let evaluateVoiceReasoningResponseAuthority: typeof import("@/components/helix/HelixAskPill").evaluateVoiceReasoningResponseAuthority;
let evaluateVoiceTurnSealGate: typeof import("@/components/helix/HelixAskPill").evaluateVoiceTurnSealGate;
let resolveVoicePlaybackGain: typeof import("@/components/helix/HelixAskPill").resolveVoicePlaybackGain;
let shouldUseVoicePlaybackAudioGraph: typeof import("@/components/helix/HelixAskPill").shouldUseVoicePlaybackAudioGraph;
let shouldRetryVoicePlaybackWithDirectFallback: typeof import("@/components/helix/HelixAskPill").shouldRetryVoicePlaybackWithDirectFallback;
let shouldRetryVoicePlaybackDirectAttempt: typeof import("@/components/helix/HelixAskPill").shouldRetryVoicePlaybackDirectAttempt;
let shouldTreatVoicePlaybackErrorAsEnded: typeof import("@/components/helix/HelixAskPill").shouldTreatVoicePlaybackErrorAsEnded;
let resolveVoicePlaybackAttemptPath: typeof import("@/components/helix/HelixAskPill").resolveVoicePlaybackAttemptPath;
let shouldBypassVoicePlaybackGraph: typeof import("@/components/helix/HelixAskPill").shouldBypassVoicePlaybackGraph;
let shouldAutoSpeakAnswerForTurn: typeof import("@/components/helix/HelixAskPill").shouldAutoSpeakAnswerForTurn;
let shouldPreserveAuthoritativeTerminalOverEvidenceGate: typeof import("@/components/helix/HelixAskPill").shouldPreserveAuthoritativeTerminalOverEvidenceGate;
let shouldSuppressVoiceForTerminalState: typeof import("@/components/helix/HelixAskPill").shouldSuppressVoiceForTerminalState;
let resolveInitialMicArmState: typeof import("@/components/helix/HelixAskPill").resolveInitialMicArmState;
let shouldStopReadAloudOnButtonPress: typeof import("@/components/helix/HelixAskPill").shouldStopReadAloudOnButtonPress;
let formatReadAloudButtonLabel: typeof import("@/components/helix/HelixAskPill").formatReadAloudButtonLabel;
let buildManualReadAloudVoiceIntent: typeof import("@/components/helix/HelixAskPill").buildManualReadAloudVoiceIntent;
let mapVoicePlaybackIntentToTask: typeof import("@/components/helix/HelixAskPill").mapVoicePlaybackIntentToTask;
let collectInterimVoiceCalloutPlaybackIntents: typeof import("@/components/helix/HelixAskPill").collectInterimVoiceCalloutPlaybackIntents;
let classifyVoiceSteeringClientTranscript: typeof import("@/components/helix/HelixAskPill").classifyVoiceSteeringClientTranscript;
let buildVoiceSteeringClientRequest: typeof import("@/components/helix/HelixAskPill").buildVoiceSteeringClientRequest;
let isVoiceSteeringDuringToolCall: typeof import("@/components/helix/HelixAskPill").isVoiceSteeringDuringToolCall;
let normalizeVoiceCommandLaneEnvelope: typeof import("@/components/helix/HelixAskPill").normalizeVoiceCommandLaneEnvelope;
let resolveReasoningAttemptTimelineText: typeof import("@/components/helix/HelixAskPill").resolveReasoningAttemptTimelineText;
let describeVoiceCommandAction: typeof import("@/components/helix/HelixAskPill").describeVoiceCommandAction;
let shouldKeepHelixReplyInBriefLane: typeof import("@/components/helix/HelixAskPill").shouldKeepHelixReplyInBriefLane;
let parseWorkstationActionCommand: typeof import("@/components/helix/HelixAskPill").parseWorkstationActionCommand;
let buildObserverCommentaryForRow: typeof import("@/components/helix/HelixAskPill").buildObserverCommentaryForRow;
let deriveObserverDispatchPlan: typeof import("@/components/helix/HelixAskPill").deriveObserverDispatchPlan;
let deriveHelixPlannerContract: typeof import("@/components/helix/HelixAskPill").deriveHelixPlannerContract;
let resolveHelixDispatchPolicyAtTurnStart: typeof import("@/components/helix/HelixAskPill").resolveHelixDispatchPolicyAtTurnStart;
let classifyHelixReasoningIntent: typeof import("@/components/helix/HelixAskPill").classifyHelixReasoningIntent;
let isSimpleConversationTurnCandidate: typeof import("@/components/helix/HelixAskPill").isSimpleConversationTurnCandidate;
let buildObserverPlanDeltaEvent: typeof import("@/components/helix/HelixAskPill").buildObserverPlanDeltaEvent;
let buildObserverPlanItemCompletedEvent: typeof import("@/components/helix/HelixAskPill").buildObserverPlanItemCompletedEvent;
let buildObserverFinalizationEvent: typeof import("@/components/helix/HelixAskPill").buildObserverFinalizationEvent;
let buildObserverHandoffEvent: typeof import("@/components/helix/HelixAskPill").buildObserverHandoffEvent;
let buildWorkstationUserInputRequest: typeof import("@/components/helix/HelixAskPill").buildWorkstationUserInputRequest;
let resolvePendingWorkstationUserInput: typeof import("@/components/helix/HelixAskPill").resolvePendingWorkstationUserInput;
let isWorkstationTurnTransitionPendingRequest: typeof import("@/components/helix/HelixAskPill").isWorkstationTurnTransitionPendingRequest;
let normalizeTerminalAnswerText: typeof import("@/components/helix/HelixAskPill").normalizeTerminalAnswerText;
let isInvalidTerminalAnswerText: typeof import("@/components/helix/HelixAskPill").isInvalidTerminalAnswerText;
let registerTurnTerminalOutcome: typeof import("@/components/helix/HelixAskPill").registerTurnTerminalOutcome;
let parseWorkstationActionChainCommand: typeof import("@/components/helix/HelixAskPill").parseWorkstationActionChainCommand;
let buildWorkstationProceduralStepEvent: typeof import("@/components/helix/HelixAskPill").buildWorkstationProceduralStepEvent;
let evaluateEvidenceFinalizationGate: typeof import("@/components/helix/HelixAskPill").evaluateEvidenceFinalizationGate;
let buildNeedsRetrievalPlanEvent: typeof import("@/components/helix/HelixAskPill").buildNeedsRetrievalPlanEvent;
let syncDocViewerStateFromWorkstationAction: typeof import("@/components/helix/HelixAskPill").syncDocViewerStateFromWorkstationAction;
let copyDebugPayloadToClipboard: typeof import("@/components/helix/HelixAskPill").copyDebugPayloadToClipboard;
let buildHelixTurnTranscriptRows: typeof import("@/components/helix/HelixAskPill").buildHelixTurnTranscriptRows;
let buildHelixCausalTurnTraceRows: typeof import("@/components/helix/HelixAskPill").buildHelixCausalTurnTraceRows;
let buildStagePlayChatLedgerEvents: typeof import("@/components/helix/HelixAskPill").buildStagePlayChatLedgerEvents;
let buildLiveAnswerTurnBridgeState: typeof import("@/components/helix/HelixAskPill").buildLiveAnswerTurnBridgeState;
let resolveHelixAskFinalAnswerPresentation: typeof import("@/components/helix/HelixAskPill").resolveHelixAskFinalAnswerPresentation;
let readHelixAskFinalAnswerSourceLabel: typeof import("@/components/helix/HelixAskPill").readHelixAskFinalAnswerSourceLabel;
let readReasoningTheaterHardFailureSignals: typeof import("@/components/helix/HelixAskPill").readReasoningTheaterHardFailureSignals;
let sortHelixAskRepliesChronologically: typeof import("@/components/helix/HelixAskPill").sortHelixAskRepliesChronologically;
let buildHelixAskRepliesFromChatSession: typeof import("@/components/helix/HelixAskPill").buildHelixAskRepliesFromChatSession;
let shouldRenderHelixAskActiveTurnStream: typeof import("@/components/helix/HelixAskPill").shouldRenderHelixAskActiveTurnStream;
let shouldAdmitHelixAskExternalLiveEventToActiveStream: typeof import("@/components/helix/HelixAskPill").shouldAdmitHelixAskExternalLiveEventToActiveStream;
let filterHelixAskActiveTurnStreamRows: typeof import("@/components/helix/HelixAskPill").filterHelixAskActiveTurnStreamRows;
let buildAskLiveAgenticEventRows: typeof import("@/components/helix/HelixAskPill").buildAskLiveAgenticEventRows;
let buildHelixActiveTurnStreamRows: typeof import("@/components/helix/HelixAskPill").buildHelixActiveTurnStreamRows;
let createHelixAskConsoleStreamIngressDebug: typeof import("@/components/helix/HelixAskPill").createHelixAskConsoleStreamIngressDebug;
let attachHelixAskClientTraceToLiveEvent: typeof import("@/components/helix/HelixAskPill").attachHelixAskClientTraceToLiveEvent;
let isDurableHelixAskMailTranscriptGroup: typeof import("@/components/helix/HelixAskPill").isDurableHelixAskMailTranscriptGroup;
let shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata: typeof import("@/components/helix/HelixAskPill").shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata;
let HELIX_E6_ASK_TURN_VOICE_PARITY_FLAG: typeof import("@/components/helix/HelixAskPill").HELIX_E6_ASK_TURN_VOICE_PARITY_FLAG;
let HELIX_VOICE_LEGACY_DISPATCH_FALLBACK_FLAG: typeof import("@/components/helix/HelixAskPill").HELIX_VOICE_LEGACY_DISPATCH_FALLBACK_FLAG;
let evaluateVoiceAutoDispatchGovernance: typeof import("@/components/helix/HelixAskPill").evaluateVoiceAutoDispatchGovernance;
let normalizeHelixAgentProvidersResponse: typeof import("@/components/helix/HelixAskPill").normalizeHelixAgentProvidersResponse;
let resolveSelectedHelixAgentRuntime: typeof import("@/components/helix/HelixAskPill").resolveSelectedHelixAgentRuntime;
let resolveNextSelectableHelixAgentRuntime: typeof import("@/components/helix/HelixAskPill").resolveNextSelectableHelixAgentRuntime;
let resolveHelixAskActualAgentProviderLabel: typeof import("@/components/helix/HelixAskPill").resolveHelixAskActualAgentProviderLabel;
let parseHelixAskFinalAnswerBulletLine: typeof import("@/lib/helix/ask-answer-rendering").parseHelixAskFinalAnswerBulletLine;
let buildHelixActionEnvelopeRuntimeAuthority: typeof import("@/components/helix/HelixAskPill").buildHelixActionEnvelopeRuntimeAuthority;
let buildHelixDebugExportEnvelopeFromMasterPayload: typeof import("@/components/helix/HelixAskPill").buildHelixDebugExportEnvelopeFromMasterPayload;
let buildHelixAskReplyCopyText: typeof import("@/components/helix/HelixAskPill").buildHelixAskReplyCopyText;
let debugPayloadMatchesRenderedTurnPayload: typeof import("@/components/helix/HelixAskPill").debugPayloadMatchesRenderedTurnPayload;
let readDocViewerPathFromDesktopUrlForAskSnapshot: typeof import("@/components/helix/HelixAskPill").readDocViewerPathFromDesktopUrlForAskSnapshot;
let buildReplyScopedDebugExportFromRenderedButton: typeof import("@/components/helix/HelixAskPill").buildReplyScopedDebugExportFromRenderedButton;
let hasSuccessfulWorkstationTerminalTranscriptRows: typeof import("@/components/helix/HelixAskPill").hasSuccessfulWorkstationTerminalTranscriptRows;
let copyHelixAskPlainTextToClipboard: typeof import("@/components/helix/HelixAskPill").copyHelixAskPlainTextToClipboard;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({
    mergeVoiceTranscriptDraft,
    resolveVoiceDispatchTranscriptFromDraft,
    buildVoiceInputStatusLabel,
    scoreConversationCompletion,
    shouldDispatchReasoningAttempt,
    shouldForceObserveDispatchFromSuppression,
    inferSuppressionCauseFromRouteReason,
    deriveVoiceTimelineSuppressionMeta,
    resolveSuppressedDispatchRescueTranscript,
    isLikelyContextDependentTurn,
    buildVoiceReasoningDispatchPrompt,
    shouldMergeVoiceContinuationTurn,
    shouldMergeVoiceContinuationInFlight,
    shouldMergePendingConfirmationTranscript,
    decideExplorationLadderAction,
    smoothVoiceLevel,
    isFlatVoiceSignal,
    isRecorderStalled,
    isLikelyLoopbackDeviceLabel,
    shouldPrimeSegmentWithContainerHeader,
    getMicRecorderMimeCandidates,
    pickSupportedMicRecorderMimeType,
    formatVoiceDecisionSentence,
    composeVoiceBriefWithDecision,
    isAgibotPreflightScopeError,
    deriveTranscriptConfidence,
    shouldRequireTranscriptConfirmation,
    shouldAutoConfirmTranscriptPrompt,
    resolveTranscriptConfirmPolicy,
    shouldIgnoreLowQualityTranscriptBargeIn,
    parseTranscriptConfirmationVoiceCommand,
    shouldInterruptForSupersededReason,
    scoreVoiceTurnComplete,
    scoreIntentShift,
    evaluateVoiceReasoningResponseAuthority,
    evaluateVoiceTurnSealGate,
    resolveVoicePlaybackGain,
    shouldUseVoicePlaybackAudioGraph,
    shouldRetryVoicePlaybackWithDirectFallback,
    shouldRetryVoicePlaybackDirectAttempt,
    shouldTreatVoicePlaybackErrorAsEnded,
    resolveVoicePlaybackAttemptPath,
    shouldBypassVoicePlaybackGraph,
    shouldAutoSpeakAnswerForTurn,
    shouldPreserveAuthoritativeTerminalOverEvidenceGate,
    shouldSuppressVoiceForTerminalState,
    resolveInitialMicArmState,
    shouldStopReadAloudOnButtonPress,
    formatReadAloudButtonLabel,
    buildManualReadAloudVoiceIntent,
    mapVoicePlaybackIntentToTask,
    collectInterimVoiceCalloutPlaybackIntents,
    classifyVoiceSteeringClientTranscript,
    buildVoiceSteeringClientRequest,
    isVoiceSteeringDuringToolCall,
    normalizeVoiceCommandLaneEnvelope,
    resolveReasoningAttemptTimelineText,
    describeVoiceCommandAction,
    shouldKeepHelixReplyInBriefLane,
    parseWorkstationActionCommand,
    buildObserverCommentaryForRow,
    deriveObserverDispatchPlan,
    deriveHelixPlannerContract,
    resolveHelixDispatchPolicyAtTurnStart,
    classifyHelixReasoningIntent,
    isSimpleConversationTurnCandidate,
    buildObserverPlanDeltaEvent,
    buildObserverPlanItemCompletedEvent,
    buildObserverFinalizationEvent,
    buildObserverHandoffEvent,
    buildWorkstationUserInputRequest,
    resolvePendingWorkstationUserInput,
    isWorkstationTurnTransitionPendingRequest,
    normalizeTerminalAnswerText,
    isInvalidTerminalAnswerText,
    registerTurnTerminalOutcome,
    parseWorkstationActionChainCommand,
    buildWorkstationProceduralStepEvent,
    evaluateEvidenceFinalizationGate,
    buildNeedsRetrievalPlanEvent,
    syncDocViewerStateFromWorkstationAction,
    copyDebugPayloadToClipboard,
    buildHelixTurnTranscriptRows,
    buildHelixCausalTurnTraceRows,
    buildStagePlayChatLedgerEvents,
    buildLiveAnswerTurnBridgeState,
    resolveHelixAskFinalAnswerPresentation,
    readHelixAskFinalAnswerSourceLabel,
    readReasoningTheaterHardFailureSignals,
    sortHelixAskRepliesChronologically,
    buildHelixAskRepliesFromChatSession,
    shouldRenderHelixAskActiveTurnStream,
    shouldAdmitHelixAskExternalLiveEventToActiveStream,
    filterHelixAskActiveTurnStreamRows,
    buildAskLiveAgenticEventRows,
    buildHelixActiveTurnStreamRows,
    createHelixAskConsoleStreamIngressDebug,
    attachHelixAskClientTraceToLiveEvent,
    isDurableHelixAskMailTranscriptGroup,
    shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata,
    HELIX_E6_ASK_TURN_VOICE_PARITY_FLAG,
    HELIX_VOICE_LEGACY_DISPATCH_FALLBACK_FLAG,
    evaluateVoiceAutoDispatchGovernance,
    normalizeHelixAgentProvidersResponse,
    resolveSelectedHelixAgentRuntime,
    resolveNextSelectableHelixAgentRuntime,
    resolveHelixAskActualAgentProviderLabel,
    buildHelixActionEnvelopeRuntimeAuthority,
    buildHelixDebugExportEnvelopeFromMasterPayload,
    buildHelixAskReplyCopyText,
    debugPayloadMatchesRenderedTurnPayload,
    readDocViewerPathFromDesktopUrlForAskSnapshot,
    buildReplyScopedDebugExportFromRenderedButton,
    hasSuccessfulWorkstationTerminalTranscriptRows,
    copyHelixAskPlainTextToClipboard,
  } = await import("@/components/helix/HelixAskPill"));
  ({ parseHelixAskFinalAnswerBulletLine } = await import("@/lib/helix/ask-answer-rendering"));
});
const pillPath = path.resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx");
const workspaceContextSnapshotPath = path.resolve(
  process.cwd(),
  "client/src/lib/helix/ask-workspace-context-snapshot.ts",
);
const docsViewerContextPath = path.resolve(process.cwd(), "client/src/lib/helix/ask-doc-viewer-context.ts");
const askConsoleContextBridgePath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskContextBridge.ts",
);
const askConsoleRequestEnvelopePath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskRequestEnvelope.ts",
);
const askConsoleActiveDocContextBindingPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskActiveDocContextBinding.ts",
);
const askConsoleLatestTurnBindingPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskLatestTurnBinding.ts",
);
const askConsoleLegacyTurnControlsPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskLegacyTurnControls.ts",
);
const askConsoleFinalExtrasPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskFinalExtras.tsx",
);
const askConsoleTurnStreamPanelPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskTurnStreamPanel.tsx",
);
const askConsoleReplyCardPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskReplyCard.tsx",
);
const askConsoleActionToolbarPath = path.resolve(
  process.cwd(),
  "client/src/components/helix/ask-console/HelixAskActionToolbar.tsx",
);

describe("HelixAskPill mic-first surface contract", () => {
  it("keeps completed Ask answers in timestamp order after stale active rows arrive", () => {
    const olderActive = {
      id: "reply-active-old",
      createdAtMs: 1_000,
      question: "older unfinished reasoning",
      content: "Still working...",
      debug: { turn_id: "turn-active-old" },
    } as any;
    const newerFinal = {
      id: "reply-final-new",
      createdAtMs: 2_000,
      question: "newer completed wake",
      content: "Latest final answer",
      debug: { turn_id: "turn-final-new" },
    } as any;

    expect(sortHelixAskRepliesChronologically([newerFinal, olderActive]).map((reply: any) => reply.id)).toEqual([
      "reply-active-old",
      "reply-final-new",
    ]);

    const appended = appendHelixAskReplyChronologically([newerFinal], olderActive, 8);
    expect(appended.map((reply: any) => reply.id)).toEqual(["reply-active-old", "reply-final-new"]);
    expect(appended.at(-1)?.content).toBe("Latest final answer");
  });

  it("keeps a durable transcript window instead of pruning completed chat to the active queue size", () => {
    const replies = Array.from({ length: 12 }, (_, index) => ({
      id: `reply-${index}`,
      createdAtMs: 1_000 + index,
      question: `question ${index}`,
      content: `answer ${index}`,
      debug: { turn_id: `turn-${index}` },
    })) as any[];

    const appended = appendHelixAskReplyChronologically(
      replies.slice(0, 11),
      replies[11],
    );

    expect(appended).toHaveLength(12);
    expect(appended.map((reply: any) => reply.id)).toEqual(replies.map((reply) => reply.id));
  });

  it("merges an optimistic active turn with its final answer by turn id", () => {
    const optimistic = {
      id: "ask:mail-wake-1",
      turn_id: "ask:mail-wake-1",
      createdAtMs: 1_000,
      question: "Review latest mailbox wake",
      content: "Reasoning in progress...",
      liveEvents: [{ id: "turn-start:ask:mail-wake-1", text: "Turn started." }],
    } as any;
    const final = {
      id: "ask:mail-wake-1",
      turn_id: "ask:mail-wake-1",
      createdAtMs: 5_000,
      question: "Review latest mailbox wake",
      content: "Voice callout delivered.",
      debug: { turn_id: "ask:mail-wake-1", selected_final_answer: "Voice callout delivered." },
      liveEvents: [{ id: "voice-receipt", text: "Voice requested." }],
    } as any;

    const appended = appendHelixAskReplyChronologically([optimistic], final, 8);

    expect(appended).toHaveLength(1);
    expect(appended[0]?.id).toBe("ask:mail-wake-1");
    expect(appended[0]?.createdAtMs).toBe(1_000);
    expect(appended[0]?.content).toBe("Voice callout delivered.");
    expect(appended[0]?.debug?.selected_final_answer).toBe("Voice callout delivered.");
  });

  it("blocks compact Stage Play wake prompts that lost structured route metadata", () => {
    const question = [
      "Review the latest Stage Play live-source mailbox finding.",
      "Current effort: combat or recovery.",
      "Micro-reasoner recommendation: request voice callout.",
      "Use the structured mailbox route metadata attached to this turn; keep the visible answer concise and evidence-bound.",
    ].join("\n");

    expect(shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(null, question)).toBe(true);
    expect(shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata({
      promptId: "wake:test",
      question,
      autoSubmit: true,
      routeMetadata: {
        invocationKind: "stage_play_mail_wake",
        wakeRequestId: "stage_play_live_source_mail_wake:test",
        mailboxThreadId: "helix-ask:desktop",
        sourceTarget: "live_source_mailbox",
      },
      createdAt: 1_000,
    }, question)).toBe(false);
    expect(shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(null, "Quote this prompt: Review the latest Stage Play live-source mailbox finding.")).toBe(false);
  });

  it("includes active docs-viewer context files even when no prompt anchor path was resolved", () => {
    expect(buildHelixAskConsoleContextFiles({
      docsViewerAnchorPath: null,
      workspaceContextSnapshot: {
      activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
      docContextPath: "docs/research/nhm2-current-status-whitepaper.md",
      },
    })).toEqual(["docs/research/nhm2-current-status-whitepaper.md"]);

    expect(buildHelixAskConsoleContextFiles({
      docsViewerAnchorPath: "docs/research/explicit.md",
      workspaceContextSnapshot: {
        activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
      },
    })).toEqual([
      "docs/research/explicit.md",
      "docs/research/nhm2-current-status-whitepaper.md",
    ]);
  });

  it("feeds docs-viewer doc URL parameters into Ask request context files", () => {
    const originalWindow = (globalThis as Record<string, unknown>).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          search: "?doc=docs%2Fresearch%2Fnhm2-current-status-whitepaper.md",
        },
      },
    });
    try {
      const urlDocPath = readDocViewerPathFromDesktopUrlForAskSnapshot();
      expect(urlDocPath).toBe("docs/research/nhm2-current-status-whitepaper.md");
      expect(buildHelixAskConsoleContextFiles({
        docsViewerAnchorPath: null,
        workspaceContextSnapshot: {
          activeDocPath: urlDocPath,
        },
      })).toEqual(["docs/research/nhm2-current-status-whitepaper.md"]);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });

  it("copies long terminal answers without UI ellipsis truncation", () => {
    const longAnswer = `Final answer starts.\n${"agent-output ".repeat(120)}\nFinal answer ends.`;

    const copied = buildHelixAskReplyCopyText({
      id: "reply-long-answer",
      content: longAnswer,
      question: "Return a long answer.",
      debug: {
        selected_final_answer: longAnswer,
        final_answer_source: "model_direct_answer",
      },
    } as any);

    expect(copied).toBe(longAnswer);
    expect(copied).toContain("Final answer ends.");
    expect(copied).not.toContain("...");
  });

  it("copies envelope answers and sections without preview-only truncation", () => {
    const answer = `Envelope answer starts.\n${"section-output ".repeat(90)}\nEnvelope answer ends.`;
    const detail = `Detail starts.\n${"detail-output ".repeat(60)}\nDetail ends.`;

    const copied = buildHelixAskReplyCopyText({
      id: "reply-envelope-long-answer",
      content: "fallback should not win",
      question: "Return an envelope answer.",
      envelope: {
        answer,
        sections: [
          {
            title: "Details",
            layer: "detail",
            body: detail,
          },
        ],
      },
    } as any);

    expect(copied).toContain(answer);
    expect(copied).toContain(detail);
    expect(copied).toContain("Envelope answer ends.");
    expect(copied).toContain("Detail ends.");
    expect(copied).not.toContain("...");
  });

  it("hides the active stream only once the same turn has a durable reply", () => {
    const durableActiveReply = {
      id: "reply-final",
      createdAtMs: 2_000,
      question: "active wake",
      content: "Final answer",
      debug: { turn_id: "ask:active-turn" },
    } as any;
    const differentReply = {
      id: "reply-old",
      createdAtMs: 1_000,
      question: "older turn",
      content: "Older answer",
      debug: { turn_id: "ask:old-turn" },
    } as any;

    expect(shouldRenderHelixAskActiveTurnStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeStartedAtMs: 2_100,
      latestReply: durableActiveReply,
    })).toBe(false);
    expect(shouldRenderHelixAskActiveTurnStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeStartedAtMs: 2_100,
      latestReply: differentReply,
    })).toBe(true);
    expect(shouldRenderHelixAskActiveTurnStream({
      askBusy: true,
      activeTurnId: "ask:stale-active-turn",
      activeStartedAtMs: 900,
      latestReply: durableActiveReply,
    })).toBe(true);
    expect(shouldRenderHelixAskActiveTurnStream({
      askBusy: true,
      activeTurnId: null,
      activeStartedAtMs: 900,
      latestReply: durableActiveReply,
    })).toBe(false);
    expect(shouldRenderHelixAskActiveTurnStream({
      askBusy: true,
      activeTurnId: null,
      activeStartedAtMs: 2_100,
      latestReply: durableActiveReply,
    })).toBe(true);
  });

  it("admits only active-turn external live events into the Ask reasoning stream", () => {
    expect(shouldAdmitHelixAskExternalLiveEventToActiveStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeTraceId: "ask:active-turn",
      eventTraceId: "ask:active-turn",
      eventMeta: { kind: "workstation_action_receipt" },
    })).toBe(true);

    expect(shouldAdmitHelixAskExternalLiveEventToActiveStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeTraceId: "ask:active-turn",
      eventTraceId: "workstation-action:copy:123",
      eventMeta: { kind: "workstation_clipboard_receipt" },
    })).toBe(false);

    expect(shouldAdmitHelixAskExternalLiveEventToActiveStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeTraceId: "ask:active-turn",
      eventTraceId: null,
      eventMeta: { kind: "stage_play_mail_wake_queue_status" },
    })).toBe(false);

    expect(shouldAdmitHelixAskExternalLiveEventToActiveStream({
      askBusy: true,
      activeTurnId: "ask:active-turn",
      activeTraceId: "ask:active-turn",
      eventTraceId: "workstation-action:panel:456",
      eventMeta: {
        kind: "workstation_action_receipt",
        turnKey: "ask:active-turn",
      },
    })).toBe(true);

    expect(shouldAdmitHelixAskExternalLiveEventToActiveStream({
      askBusy: false,
      activeTurnId: "ask:active-turn",
      activeTraceId: "ask:active-turn",
      eventTraceId: "ask:active-turn",
      eventMeta: { kind: "workstation_action_receipt" },
    })).toBe(false);
  });

  it("does not render terminal active stream rows as the latest console session", () => {
    const runningRows = [
      {
        key: "active-question",
        source: "question",
        label: "Question",
        text: "Watch the mailbox.",
        meta: "current prompt",
        status: "submitted",
        tone: "question",
        evidenceRefs: [],
      },
      {
        key: "active-tool",
        source: "agent_work",
        label: "Agent decision",
        text: "Reading live-source mail.",
        meta: "tool",
        status: "running",
        tone: "working",
        evidenceRefs: [],
      },
    ] as any[];
    const terminalRows = [
      ...runningRows,
      {
        key: "active-final",
        source: "agent_work",
        label: "Final",
        text: "I have enough to answer, and the terminal checks allow the final response.",
        meta: "agent work",
        status: "final",
        tone: "final",
        evidenceRefs: [],
      },
    ] as any[];

    expect(filterHelixAskActiveTurnStreamRows(runningRows)).toHaveLength(2);
    expect(filterHelixAskActiveTurnStreamRows(terminalRows)).toEqual([]);
    expect(filterHelixAskActiveTurnStreamRows(terminalRows, { includeTerminalRows: true })).toHaveLength(3);
  });

  it("keeps low-signal lifecycle rows available when Helix console debug is enabled", () => {
    const lowSignalRows = buildAskLiveAgenticEventRows([
      {
        id: "turn-completed",
        text: "Turn completed.",
        tool: "agent",
        meta: {
          stage: "turn_completed",
          source_event_type: "turn_completed",
          turn_id: "ask:test",
        },
      },
    ] as any);
    const debugRows = buildAskLiveAgenticEventRows([
      {
        id: "turn-completed",
        text: "Turn completed.",
        tool: "agent",
        meta: {
          stage: "turn_completed",
          source_event_type: "turn_completed",
          turn_id: "ask:test",
        },
      },
    ] as any, { includeLowSignalRows: true });
    const activeRows = buildHelixActiveTurnStreamRows({
      question: "Why did the console only show the question row?",
      eventRows: debugRows,
    });

    expect(lowSignalRows).toHaveLength(0);
    expect(debugRows).toHaveLength(1);
    expect(activeRows.map((row) => row.source)).toEqual(["question", "final"]);
  });

  it("does not clip active-stream final answer rows in the console", () => {
    const longFinal = `Final answer: ${"runtime-owned answer ".repeat(80)}done.`;
    const eventRows = buildAskLiveAgenticEventRows([
      {
        id: "final-answer",
        text: longFinal,
        tool: "agent",
        meta: {
          stage: "terminal_answer",
          source_event_type: "terminal_answer",
          turn_id: "ask:test",
        },
      },
    ] as any, { includeLowSignalRows: true });
    const activeRows = buildHelixActiveTurnStreamRows({
      question: "Give me the full answer.",
      eventRows,
    });
    const finalRow = activeRows.find((row) => row.source === "final");

    expect(finalRow).toBeTruthy();
    expect(finalRow?.text).toBe(longFinal);
    expect(finalRow?.text.endsWith("done.")).toBe(true);
  });

  it("initializes Helix console stream ingress debug with deterministic counters", () => {
    const debug = createHelixAskConsoleStreamIngressDebug({
      turnId: "ask:turn",
      traceId: "ask:trace",
      startedAtMs: 1234.8,
    });

    expect(debug).toMatchObject({
      schema: "helix.ask.console_stream_ingress_debug.v1",
      turnId: "ask:turn",
      traceId: "ask:trace",
      startedAtMs: 1234,
      rawStreamPacketCount: 0,
      transcriptPacketCount: 0,
      acceptedLiveEventCount: 0,
      replayedTranscriptEventCount: 0,
      droppedEventCount: 0,
      droppedReasons: {},
    });
  });

  it("tags backend transcript events with the active client trace for console admission", () => {
    const traced = attachHelixAskClientTraceToLiveEvent(
      {
        id: "stream:backend",
        text: "Runtime selected terminal synthesis from current observations.",
        meta: {
          turn_id: "ask:backend-runtime-turn",
          source_event_type: "model_decision_completed",
        },
      } as any,
      {
        traceId: "ask:client-active-turn",
        turnId: "ask:client-active-turn",
      },
    );

    expect(traced.meta).toMatchObject({
      turn_id: "ask:backend-runtime-turn",
      backend_turn_id: "ask:backend-runtime-turn",
      active_turn_id: "ask:client-active-turn",
      client_active_turn_id: "ask:client-active-turn",
      trace_id: "ask:client-active-turn",
      ask_trace_id: "ask:client-active-turn",
    });
  });

  it("only treats terminal answer mail transcript groups as saved console turn candidates", () => {
    const buildEntry = (rowKind: string, overrides: Record<string, any> = {}) => {
      const { row: rowOverrides, ...entryOverrides } = overrides;
      return ({
        artifactId: "stage_play_live_source_mail_transcript_entry",
        schemaVersion: "stage_play_live_source_mail_transcript_entry/v1",
        entryId: `entry:${rowKind}`,
        threadId: "helix-ask:desktop",
        wakeRequestId: "wake:stale",
        wakeResultId: "wake-result:stale",
        askTurnId: null,
        decisionIds: [],
        mailIds: ["mail:1"],
        sourceIds: [],
        sequence: 1,
        row: {
          rowId: `row:${rowKind}`,
          rowKind,
          title: rowKind,
          body: "",
          source: {},
          evidenceRefs: [],
          authority: "tool_evidence",
          assistantAnswer: false,
          terminalEligible: false,
          createdAt: "2026-06-10T15:20:00.000Z",
          ...(rowOverrides ?? {}),
        },
        evidenceRefs: [],
        createdAt: "2026-06-10T15:20:00.000Z",
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
        ...entryOverrides,
      }) as any;
    };

    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("mail_wake_requested"),
      buildEntry("budget_state", { row: { body: "runtime_memory_queue_deferrable" } }),
      buildEntry("continuation_deferred"),
      buildEntry("tool_budget_no_progress"),
      buildEntry("blocked", { row: { body: "mail_wake_ask_turn_timeout:120000" } }),
    ])).toBe(false);

    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("mail_read_receipt"),
      buildEntry("decision_recorded"),
      buildEntry("checkpoint_summary"),
    ])).toBe(false);
    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("voice_tool_call"),
      buildEntry("voice_receipt"),
    ])).toBe(false);
    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("text_answer", { row: { terminalEligible: true } }),
    ])).toBe(true);
    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("typed_failure", { row: { body: "solver authority failed" } }),
    ])).toBe(true);
    expect(isDurableHelixAskMailTranscriptGroup([
      buildEntry("final_answer", { row: { body: "Completed mailbox answer." } }),
    ])).toBe(true);
  });

  it("hydrates console turns from durable chat messages in chronological order", () => {
    const session = {
      id: "session:helix",
      title: "Helix Ask",
      createdAt: "2026-06-10T15:00:00.000Z",
      updatedAt: "2026-06-10T15:04:00.000Z",
      personaId: "default",
      contextId: "helix-ask:desktop",
      messages: [
        {
          id: "user-2",
          role: "user",
          content: "second prompt",
          at: "2026-06-10T15:02:00.000Z",
          traceId: "ask:second",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "first answer",
          at: "2026-06-10T15:01:00.000Z",
          traceId: "ask:first",
        },
        {
          id: "user-1",
          role: "user",
          content: "first prompt",
          at: "2026-06-10T15:00:00.000Z",
          traceId: "ask:first",
        },
        {
          id: "tool-1",
          role: "tool",
          content: "voice receipt",
          at: "2026-06-10T15:02:30.000Z",
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "second answer",
          at: "2026-06-10T15:03:00.000Z",
          traceId: "ask:second",
        },
      ],
    } as any;

    const replies = buildHelixAskRepliesFromChatSession(session);

    expect(replies.map((reply: any) => reply.question)).toEqual(["first prompt", "second prompt"]);
    expect(replies.map((reply: any) => reply.content)).toEqual(["first answer", "second answer"]);
    expect(replies.map((reply: any) => reply.turn_id)).toEqual(["ask:first", "ask:second"]);
    expect(replies.every((reply: any) => reply.debug?.durable_chat_projection === true)).toBe(true);
  });

  it("filters stale generated Stage Play mailbox wake failures but keeps grounded compact wake answers", () => {
    const session = {
      id: "session:helix",
      title: "Helix Ask",
      createdAt: "2026-06-10T15:00:00.000Z",
      updatedAt: "2026-06-10T15:04:00.000Z",
      personaId: "default",
      contextId: "helix-ask:desktop",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "normal prompt",
          at: "2026-06-10T15:00:00.000Z",
          traceId: "ask:normal",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "normal answer",
          at: "2026-06-10T15:00:20.000Z",
          traceId: "ask:normal",
        },
        {
          id: "user-wake-old",
          role: "user",
          content:
            "Use live_env.read_live_source_mail for the active Stage Play live-source mailbox. Wake request: stage_play_live_source_mail_wake:old",
          at: "2026-06-10T15:01:00.000Z",
          traceId: "ask:wake-old",
        },
        {
          id: "assistant-wake-old",
          role: "assistant",
          content:
            "I could not complete this live-source turn because the selected tool/action violated the current live-source phase contract.\nPhase: terminal_checkpoint.\nSelected: live_env.read_live_source_mail.",
          at: "2026-06-10T15:01:20.000Z",
          traceId: "ask:wake-old",
        },
        {
          id: "user-wake-compact",
          role: "user",
          content:
            "Review the latest Stage Play live-source mailbox finding. Use the structured mailbox route metadata attached to this turn to decide the next mailbox action.",
          at: "2026-06-10T15:02:00.000Z",
          traceId: "ask:wake-compact",
        },
        {
          id: "assistant-wake-compact",
          role: "assistant",
          content: "The live-source mailbox route completed and the interim voice callout request was recorded.",
          at: "2026-06-10T15:02:20.000Z",
          traceId: "ask:wake-compact",
        },
        {
          id: "user-wake-grounded",
          role: "user",
          content:
            "Review the latest Stage Play live-source mailbox finding.\nCurrent effort: combat or recovery.\nMicro-reasoner recommendation: request voice callout.\nUse the structured mailbox route metadata attached to this turn; keep the visible answer concise and evidence-bound.",
          at: "2026-06-10T15:02:40.000Z",
          traceId: "ask:wake-grounded",
        },
        {
          id: "assistant-wake-grounded",
          role: "assistant",
          content: "I need retrieval before finalizing this claim. I do not yet have grounded evidence references for it.",
          at: "2026-06-10T15:02:50.000Z",
          traceId: "ask:wake-grounded",
        },
        {
          id: "user-2",
          role: "user",
          content: "why did the generated prompt mention live_env.read_live_source_mail?",
          at: "2026-06-10T15:03:00.000Z",
          traceId: "ask:manual-debug",
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "Because the older generated wake prompt encoded tool names in visible prose.",
          at: "2026-06-10T15:03:20.000Z",
          traceId: "ask:manual-debug",
        },
      ],
    } as any;

    const replies = buildHelixAskRepliesFromChatSession(session);

    expect(replies.map((reply: any) => reply.turn_id)).toEqual([
      "ask:normal",
      "ask:wake-grounded",
      "ask:manual-debug",
    ]);
    expect(replies.map((reply: any) => reply.question)).toEqual([
      "normal prompt",
      "Review the latest Stage Play live-source mailbox finding.\nCurrent effort: combat or recovery.\nMicro-reasoner recommendation: request voice callout.\nUse the structured mailbox route metadata attached to this turn; keep the visible answer concise and evidence-bound.",
      "why did the generated prompt mention live_env.read_live_source_mail?",
    ]);
  });

  it("keeps voice turns ordered behind unified Ask by default", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(HELIX_E6_ASK_TURN_VOICE_PARITY_FLAG).toBe(true);
    expect(HELIX_VOICE_LEGACY_DISPATCH_FALLBACK_FLAG).toBe(false);
    expect(source).toContain("if (runAskUnified) {");
    expect(source).toContain("suppressed:voice_unified_ask_unavailable");
    expect(source).toContain("legacy voice-side routing is disabled");
    expect(source).toContain("HELIX_VOICE_LEGACY_DISPATCH_FALLBACK");
    expect(source).not.toContain("env?.HELIX_E6_ASK_TURN_VOICE_PARITY");
  });

  it("lets Helix Ask visual capture request and sync tab audio preference", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const toolbarSource = fs.readFileSync(askConsoleActionToolbarPath, "utf8");
    const legacyComposerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx"),
      "utf8",
    );
    const legacyComposerStateSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerState.ts"),
      "utf8",
    );
    const visualPreferenceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskVisualCapturePreference.ts"),
      "utf8",
    );
    const visualRuntimeSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/useHelixAskVisualSourceCaptureRuntime.ts"),
      "utf8",
    );

    expect(source).toContain("useHelixAskVisualSourceCaptureRuntime({");
    expect(source).not.toContain("readHelixAskVisualCaptureAudioPreference");
    expect(source).not.toContain("syncHelixAskVisualCaptureRoutePreference");
    expect(visualRuntimeSource).toContain("readHelixAskVisualCaptureAudioPreference");
    expect(visualRuntimeSource).toContain("syncHelixAskVisualCaptureRoutePreference");
    expect(visualPreferenceSource).toContain(
      'HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT =\n  "helix:live-answer:visual-capture-routes"',
    );
    expect(visualRuntimeSource).toContain('HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID = `audio_transcript:${HELIX_ASK_THREAD_ID}`');
    expect(visualRuntimeSource).toContain("HELIX_ASK_DISPLAY_AUDIO_CHUNK_MS = 10_000");
    expect(visualRuntimeSource).toContain("postHelixAskAudioTranscriptChunk");
    expect(visualRuntimeSource).toContain('postSituationJson("/api/agi/situation/audio-source/transcript-chunk"');
    expect(visualRuntimeSource).toContain("source_id: sourceId");
    expect(visualRuntimeSource).toContain("displayAudioTranscriptSourceIdRef");
    expect(visualRuntimeSource).toContain(
      "`${HELIX_ASK_AUDIO_TRANSCRIPT_SOURCE_ID}:${crypto.randomUUID()}`",
    );
    expect(source).toContain("visualSituationIncludeAudio");
    expect(visualRuntimeSource).toContain("requestVisualSourceMediaStream({");
    expect(visualRuntimeSource).toContain("includeDisplayAudio,");
    expect(visualRuntimeSource).toContain('kind: visualSituationSourceKind');
    expect(visualRuntimeSource).toContain('source_surface: kind === "camera" ? "device_camera" : "screen_share_window"');
    expect(visualRuntimeSource).toContain("startVisualFrameProducerInterval({");
    expect(visualRuntimeSource).toContain("liveRuntimeEligible: true");
    expect(visualRuntimeSource).toContain("canUseCaptureControls ||");
    expect(visualRuntimeSource).toContain("releaseVisualSituationCapture(visualSituationSourceKind)");
    expect(visualRuntimeSource).toContain('stream?.getAudioTracks().some((track) => track.readyState !== "ended")');
    expect(visualRuntimeSource).toContain("visualSituationStreamRef.current?.getAudioTracks()");
    expect(visualRuntimeSource).toContain("attachDisplayAudioSource(");
    expect(visualRuntimeSource).toContain("onTranscriptChunk: (chunk) => postHelixAskAudioTranscriptChunk(");
    expect(visualRuntimeSource).toContain("sourceId: audioTranscriptSourceId");
    expect(source).toContain("visualSituationIncludeAudio,");
    expect(source).toContain("onToggleVisualAudio: () =>");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(toolbarSource).toContain("const visualAudioTitle = visualSituationIncludeAudio");
    expect(toolbarSource).toContain('aria-label={visualAudioTitle}');
    expect(toolbarSource).toContain('title={visualAudioTitle}');
    expect(toolbarSource).toContain("<Headphones");
    expect(source).not.toContain("Visual capture only");
    expect(source).toContain("handleVisualSituationAudioPreferenceToggle");
  });

  it("keeps primary composer icon buttons discoverable on hover", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const toolbarSource = fs.readFileSync(askConsoleActionToolbarPath, "utf8");
    const legacyComposerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx"),
      "utf8",
    );
    const legacyComposerStateSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerState.ts"),
      "utf8",
    );
    const actionToolbarSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx"),
      "utf8",
    );
    const composerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskComposer.tsx"),
      "utf8",
    );

    expect(source).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(source).toContain("surfaceContentState,");
    expect(source).toContain("{...legacyConsoleViewState}");
    expect(source).not.toContain("surfaceContentState={surfaceContentState}");
    expect(source).not.toContain("surfaceContentState={{");
    expect(source).toContain("composer: composerState");
    expect(source).not.toContain("<HelixAskLegacyComposerSurface");
    expect(source).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(legacyComposerStateSource).toContain("export function buildHelixAskLegacyComposerState");
    expect(legacyComposerStateSource).toContain("actionToolbar");
    expect(actionToolbarSurfaceSource).toContain("<HelixAskActionToolbar");
    expect(toolbarSource).toContain('title="Attach image"');
    expect(toolbarSource).toContain('title={micTitle}');
    expect(toolbarSource).toContain("const visualCaptureTitle = visualSituationSourceStatus");
    expect(toolbarSource).toContain("title={visualCaptureTitle}");
    expect(toolbarSource).toContain('title={visualAudioTitle}');
    expect(actionToolbarSurfaceSource).toContain("<HelixAskComposerSubmitButton");
    expect(composerSource).toContain("title={viewModel.submitTitle}");
  });

  it("routes finalized voice into active-turn steering before normal Ask dispatch", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("activeAskTurnIdRef.current");
    expect(source).toContain("type HelixAskVoiceSteeringReservation as VoiceSteeringReservation");
    expect(source).toContain("buildVoiceSteeringReservation");
    expect(source).toContain("steeringReservation: buildVoiceSteeringReservation()");
    expect(source).toContain("active_turn_completed_before_stt_final");
    expect(source).toContain("buildVoiceSteeringClientRequest({");
    expect(source).toContain('toolName: "live_env.record_voice_steering"');
    expect(source).toContain('classification === "cancel_or_stop"');
    expect(source).toContain('queue_decision: "deferred_to_new_turn"');
    expect(source.indexOf("activeVoiceSteeringTurnId")).toBeLessThan(source.indexOf("const runAskUnified = runAskRef.current"));
  });

  it("classifies active-turn voice steering separately from idle voice commands", () => {
    expect(classifyVoiceSteeringClientTranscript("Actually use meters per second.")).toMatchObject({
      classification: "correction",
      queueDecision: "queued_for_safe_boundary",
    });
    expect(classifyVoiceSteeringClientTranscript("Stop, cancel that.")).toMatchObject({
      classification: "cancel_or_stop",
      queueDecision: "cancel_requested",
    });
    expect(classifyVoiceSteeringClientTranscript("What is the weather tomorrow?")).toMatchObject({
      classification: "off_topic_new_goal",
      queueDecision: "deferred_to_new_turn",
    });
    expect(buildVoiceSteeringClientRequest({
      threadId: "thread:voice",
      turnId: "ask:active",
      transcriptText: "Also check the units.",
      timing: "during_tool_call",
      evidenceRefs: ["voice:segment"],
    })).toMatchObject({
      thread_id: "thread:voice",
      turn_id: "ask:active",
      expected_turn_id: "ask:active",
      transcript_text: "Also check the units.",
      timing: "during_tool_call",
      classification: "on_topic_additive",
      queue_decision: "queued_for_safe_boundary",
      evidence_refs: ["voice:segment"],
    });
    expect(isVoiceSteeringDuringToolCall([
      { type: "tool_call", tool: "live_env.query_event_log", status: "running" },
    ])).toBe(true);
  });

  it("keeps removed operator controls out of the primary composer markup", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const voiceLevelMonitorSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskVoiceLevelMonitor.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Dot context");
    expect(source).not.toContain("mute while typing");
    expect(source).not.toContain("Ask mode");
    expect(source).not.toContain(">read<");
    expect(source).not.toContain(">observe<");
    expect(source).not.toContain(">act<");
    expect(source).not.toContain(">verify<");
    const toolbarSource = fs.readFileSync(askConsoleActionToolbarPath, "utf8");
    expect(toolbarSource).toContain("Enable microphone");
    expect(toolbarSource).toContain("Disable microphone");
    expect(source).not.toContain("Voice Monitor");
    expect(source).not.toContain("Helix Timeline");
    expect(source).not.toContain("<span>Input level</span>");
    expect(source).not.toContain("Listening for first segment...");
    expect(source).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(source).toContain("surfaceContentState,");
    expect(source).toContain("{...legacyConsoleViewState}");
    expect(source).not.toContain("surfaceContentState={surfaceContentState}");
    expect(source).not.toContain("surfaceContentState={{");
    expect(source).toContain("composer: composerState");
    expect(source).not.toContain("<HelixAskLegacyComposerSurface");
    expect(source).not.toContain("<HelixAskVoiceLevelMonitor");
    expect(voiceLevelMonitorSource).toContain("backdrop-blur-xl");
    expect(voiceLevelMonitorSource).toContain("Voice input level meter");
    expect(source).not.toContain("{voiceMonitorExpanded ? \"hide\" : \"diag\"}");
    expect(source).not.toContain("Capture diagnostics");
    expect(source).not.toContain("Last 5 segments");
    expect(source).not.toContain("chunk cadence");
    expect(source).toContain("latestConversationBrief");
    expect(source).not.toContain("latestTimelineEvent");
    expect(source).not.toContain("max-h-44 space-y-1.5 overflow-y-auto");
    expect(source).not.toContain("Reasoning Attempts");
  });

  it("keeps the prompt textarea below the controls at full composer width", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const toolbarSource = fs.readFileSync(askConsoleActionToolbarPath, "utf8");
    const legacyComposerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx"),
      "utf8",
    );
    const surfaceComposerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskSurfaceComposerPanel.tsx"),
      "utf8",
    );
    const composerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskComposer.tsx"),
      "utf8",
    );
    expect(source).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(source).toContain("surfaceContentState,");
    expect(source).toContain("{...legacyConsoleViewState}");
    expect(source).not.toContain("surfaceContentState={surfaceContentState}");
    expect(source).not.toContain("surfaceContentState={{");
    expect(source).toContain("composer: composerState");
    expect(source).not.toContain("<HelixAskLegacyComposerSurface");
    expect(source).not.toContain("<HelixAskSurfaceComposerPanel");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskSurfaceComposerPanel");
    expect(surfaceComposerSource).toContain('className="relative z-[80] flex flex-col gap-2 px-4 py-3"');
    expect(surfaceComposerSource).toContain('className="relative z-[90] min-w-0 overflow-visible"');
    expect(surfaceComposerSource).toContain("{actionToolbar}");
    expect(surfaceComposerSource).toContain("{textarea}");
    expect(source).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(toolbarSource).toContain('className="relative min-w-0 flex-1"');
    expect(toolbarSource).toContain("snap-x snap-mandatory");
    expect(toolbarSource).toContain("[scrollbar-width:none]");
    expect(toolbarSource).toContain("Scroll Ask controls right");
    expect(source).not.toContain("<HelixAskComposerTextarea");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskComposerTextareaSurface {...textarea} ref={textareaRef} />");
    expect(source).toContain("composerViewModel.textareaClassName");
    expect(composerSource).toContain('aria-label="Ask Helix"');
    expect(composerSource).toContain("onSubmitRequested(event.currentTarget.form)");
    expect(source).toContain("HELIX_ASK_CONSOLE_MAX_PROMPT_LINES");
  });

  it("renders an agent runtime picker sourced from the backend provider scaffold", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const runtimePickerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskRuntimePicker.tsx"),
      "utf8",
    );
    const actionToolbarSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskComposerActionToolbarSurface.tsx"),
      "utf8",
    );
    const legacyComposerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyComposerSurface.tsx"),
      "utf8",
    );
    expect(source).toContain('fetch("/api/agi/agent-providers"');
    expect(source).toContain("buildHelixAskRuntimePickerModel");
    expect(source).toContain("const surfaceContentState = buildHelixAskLegacySurfaceContentState({");
    expect(source).toContain("surfaceContentState,");
    expect(source).toContain("{...legacyConsoleViewState}");
    expect(source).not.toContain("surfaceContentState={surfaceContentState}");
    expect(source).not.toContain("surfaceContentState={{");
    expect(source).toContain("composer: composerState");
    expect(source).not.toContain("<HelixAskLegacyComposerSurface");
    expect(source).not.toContain("<HelixAskComposerActionToolbarSurface");
    expect(source).toContain("runtimePickerModel: agentRuntimePickerModel");
    expect(legacyComposerSurfaceSource).toContain("<HelixAskComposerActionToolbarSurface {...actionToolbar}");
    expect(actionToolbarSurfaceSource).toContain("<HelixAskRuntimePicker");
    expect(actionToolbarSurfaceSource).toContain("model={runtimePickerModel}");
    expect(runtimePickerSource).toContain('aria-label="Choose Ask agent runtime"');
    expect(runtimePickerSource).toContain('aria-label="Ask agent runtime"');
    expect(runtimePickerSource).toContain("model.items.map");
    expect(runtimePickerSource).toContain("disabled={!provider.enabled}");
    expect(runtimePickerSource).toContain("{model.selectedLabel}");
    expect(source).toContain("resolveHelixAgentRuntimePrimaryButtonDecision({");
    expect(source).toContain("resolveHelixAgentRuntimeSelectDecision(runtime, agentRuntimeProviders)");
    expect(source).toContain("onRuntimePrimaryClick: handleAgentRuntimeButtonClick");
    expect(actionToolbarSurfaceSource).toContain("onPrimaryClick={onRuntimePrimaryClick}");
    expect(runtimePickerSource).toContain("event.stopPropagation();");
  });

  it("normalizes Helix, Codex, and Future providers from the mocked agent provider response", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          experimental: false,
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: true,
          experimental: true,
          permission_profile: {
            id: "read-observe",
            label: "Read/observe only; Helix may project non-mutating UI receipts",
            allows: {
              observe: true,
              read: true,
              act: false,
              write: false,
              shell: false,
              codeMutation: false,
            },
          },
          supports: { streaming: true, workstationTools: true, codeMutation: true },
        },
        {
          id: "future",
          label: "Future Agent Wrapper",
          enabled: false,
          experimental: true,
          supports: { streaming: false, workstationTools: true, codeMutation: false },
        },
      ],
    });

    expect(providers.map((provider: { label: string }) => provider.label)).toEqual([
      "Helix Ask Native",
      "Codex Workstation Mode",
      "Future Agent Wrapper",
    ]);
    const codexProvider = providers.find((provider: { id: string }) => provider.id === "codex") as
      | { permission_profile?: Record<string, unknown> }
      | undefined;
    const futureProvider = providers.find((provider: { id: string }) => provider.id === "future") as
      | { permission_profile?: Record<string, unknown> }
      | undefined;
    expect(codexProvider?.permission_profile).toMatchObject({
      id: "read-observe",
      allows: {
        read: true,
        act: false,
        write: false,
        shell: false,
        codeMutation: false,
      },
    });
    expect(resolveSelectedHelixAgentRuntime("codex", providers)).toBe("codex");
    expect(futureProvider?.permission_profile).toMatchObject({
      id: "read-observe",
      allows: {
        read: true,
        write: false,
        shell: false,
        codeMutation: false,
      },
    });
    expect(resolveSelectedHelixAgentRuntime("future", providers)).toBe("helix");
    expect(resolveNextSelectableHelixAgentRuntime("helix", providers)).toBe("codex");
    expect(resolveNextSelectableHelixAgentRuntime("codex", providers)).toBe("helix");
  });

  it("keeps disabled Codex visible but not selectable", () => {
    const providers = normalizeHelixAgentProvidersResponse({
      providers: [
        {
          id: "helix",
          label: "Helix Ask Native",
          enabled: true,
          experimental: false,
          supports: { streaming: true, workstationTools: true, codeMutation: false },
        },
        {
          id: "codex",
          label: "Codex Workstation Mode",
          enabled: false,
          experimental: true,
          supports: { streaming: true, workstationTools: true, codeMutation: true },
        },
      ],
    });

    const codexProvider = providers.find((provider: { id: string }) => provider.id === "codex") as
      | { enabled?: boolean; permission_profile?: { id?: string } }
      | undefined;
    expect(codexProvider?.enabled).toBe(false);
    expect(codexProvider?.permission_profile?.id).toBe("read-observe");
    expect(resolveSelectedHelixAgentRuntime("codex", providers)).toBe("helix");
    expect(resolveNextSelectableHelixAgentRuntime("helix", providers)).toBe("helix");
  });

  it("threads the selected runtime only through backend Ask turn payloads", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("agentRuntime: selectedAgentRuntime");
    expect(source.indexOf("agentRuntime: selectedAgentRuntime")).toBeLessThan(source.indexOf("runAskTurnStream(askTurnPayload"));
    expect(source.indexOf("agentRuntime: selectedAgentRuntime")).toBeLessThan(source.indexOf("runAskTurn(askTurnPayload"));
    expect(source).toContain("backendAskCallPath = \"askLocal\"");
  });

  it("preserves provider gateway trace fields in the UI debug export path", () => {
    const debugExportSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/agi/debugExport.ts"),
      "utf8",
    );
    expect(debugExportSource).toContain("providerGatewayDebugSummary");
    expect(debugExportSource).toContain("provider_gateway_debug_summary: providerGatewayDebugSummary");
    expect(debugExportSource).toContain("workstation_gateway_call_results: workstationGatewayCallResults");
    expect(debugExportSource).toContain("provider_terminal_authority_bridge: providerTerminalAuthorityBridge");
  });

  it("attaches turn-correlated workflow QTE events to the master debug export", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const workflowDebugProjectionSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskWorkflowDebugProjection.ts"),
      "utf8",
    );
    const debugExportSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/agi/debugExport.ts"),
      "utf8",
    );
    expect(source).toContain("buildHelixAskWorkflowDemoDebugRows({");
    expect(source).toContain("workflowDemo: args.workflowDemoDebug ?? null");
    expect(source).toContain("const workflowDemoDebug = buildHelixAskWorkflowDemoReplyDebug");
    expect(source).not.toContain('channel: "workflow_demo" as const');
    expect(workflowDebugProjectionSource).toContain('channel: "workflow_demo"');
    expect(workflowDebugProjectionSource).toContain("buildHelixWorkflowDemoDebugExport({");
    expect(workflowDebugProjectionSource).toContain("finalizeHelixAskWorkflowDebugCopyExport");
    expect(debugExportSource).toContain("workflow_demo_debug:");
    expect(debugExportSource).toContain("asRecord(asRecord(payload.channels)?.workflowDemo)");
  });

  it("includes active scientific calculator context in backend Ask turn snapshots", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const workspaceContextSource = fs.readFileSync(workspaceContextSnapshotPath, "utf8");
    expect(source).toContain("useScientificCalculatorStore.getState()");
    expect(source).toContain("buildHelixAskWorkspaceContextSnapshotBinding({");
    expect(source).not.toContain("buildAskTurnWorkspaceContextSnapshotFromState({");
    expect(workspaceContextSource).toContain("activeCalculatorContext");
    expect(workspaceContextSource).toContain("hasCalculatorContext");
    expect(workspaceContextSource).toContain("last_result_text");
    expect(workspaceContextSource).toContain("recent_debug_events");
  });

  it("includes bounded active/open panel identity in backend Ask turn snapshots", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const workspaceContextSource = fs.readFileSync(workspaceContextSnapshotPath, "utf8");
    expect(source).toContain("buildHelixAskWorkspaceContextSnapshotBinding({");
    expect(source).not.toContain("buildAskTurnWorkspaceContextSnapshotFromState({");
    expect(source).toContain("layoutState,");
    expect(workspaceContextSource).toContain("openPanelIds");
    expect(workspaceContextSource).toContain("activeGroupId");
    expect(workspaceContextSource).toContain("openPanels: [...new Set(openPanelIds)]");
    expect(workspaceContextSource).toContain("groupCount: Object.keys(groups).length");
  });

  it("threads account-language translation projection context through backend Ask turn snapshots", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const workspaceContextSource = fs.readFileSync(workspaceContextSnapshotPath, "utf8");
    expect(source).toContain("readHelixAccountLanguageTranslationProjectionContext()");
    expect(source).toContain("readHelixVisibleTranslationProjectionContext()");
    expect(source).toContain("accountLanguageTranslationProjections,");
    expect(source).toContain("visibleTranslationProjections,");
    expect(source).toContain("publishHelixAccountLanguageTranslationProjectionsFromPayload({");
    expect(source).toContain("publishHelixVisibleTranslationProjectionsFromPayload({");
    expect(workspaceContextSource).toContain("accountLanguageTranslationProjections");
    expect(workspaceContextSource).toContain("account_language_translation_projections");
    expect(workspaceContextSource).toContain("hasAccountLanguageTranslationProjections");
    expect(workspaceContextSource).toContain("has_account_language_translation_projections");
    expect(workspaceContextSource).toContain("visibleTranslationProjections");
    expect(workspaceContextSource).toContain("visible_translation_projections");
    expect(workspaceContextSource).toContain("hasVisibleTranslationProjections");
    expect(workspaceContextSource).toContain("has_visible_translation_projections");
  });

  it("labels console responses from backend provider metadata, not client selection", () => {
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
      resolveHelixAskActualAgentProviderLabel({
        agent_runtime: "helix",
        selected_agent_provider: {
          id: "helix",
          label: "Helix Ask Native",
        },
      }),
    ).toBe("Provider: Helix Ask Native");
    expect(
      resolveHelixAskActualAgentProviderLabel({
        agent_runtime: "future",
        selected_agent_provider: {
          id: "future",
          label: "Future Agent Wrapper",
        },
      }),
    ).toBe("Provider: Future Agent Wrapper");
  });

  it("does not label a response as Codex from agent_runtime_loop alone", () => {
    expect(
      resolveHelixAskActualAgentProviderLabel({
        debug: {
          agent_runtime_loop: {
            schema: "helix.agent_runtime_loop.v1",
            iterations: [{ chosen_capability: "repo-code.search" }],
          },
        },
      }),
    ).toBeNull();
  });

  it("interrupts read-aloud playback when speech is detected", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const evaluateBlock = /const evaluateMicLevel = useCallback\(\(\) => \{[\s\S]+?\n  \}, \[/.exec(source);
    expect(evaluateBlock?.[0]).toContain('stopReadAloud("barge_in");');
    expect(evaluateBlock?.[0]).toContain("turn_state: \"interrupted\"");
  });

  it("retries turn-close deferred finals without waiting for a new enqueue event", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toMatch(
      /if \(yieldedForTurnClose\) \{[\s\S]+setTimeout\(resolve, turnCloseYieldDelayMs\);[\s\S]+continue;/,
    );
  });

  it("includes build provenance as a system timeline event", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const buildInfoSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskVoiceTimelineBuildInfo.ts"),
      "utf8",
    );
    expect(source).toContain('fetch("/version"');
    expect(source).toContain("buildHelixAskVoiceTimelineBuildInfoEvent({");
    expect(buildInfoSource).toContain('source: "system"');
    expect(buildInfoSource).toContain('kind: "build_info"');
  });

  it("requires explicit S2 planning artifacts before reasoning execution", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("S2_PLANNING");
    expect(source).toContain("explicit_reasoning_plan");
    expect(source).toContain("ensureExplicitReasoningPlan");
    expect(source).toMatch(/attempt = ensureExplicitReasoningPlan\(attempt\)/);
    expect(source).toContain("RF_EMPTY_TERMINAL");
  });

  it("routes workstation overview prompts through the read-only process graph context pack", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("shouldUseProcessGraphContextPack(trimmed)");
    expect(source).toContain("getContextPack()");
    expect(source).toContain("process_graph_context_pack | overview_only");
    expect(source).toContain('process_graph_execution_authority: "none"');
    expect(source).toContain("workspaceContextSnapshotForTurn");
  });

  it("preserves retained docs-viewer URL context in Ask workspace snapshots", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const contextBridgeSource = fs.readFileSync(askConsoleContextBridgePath, "utf8");
    const docsContextSource = fs.readFileSync(docsViewerContextPath, "utf8");
    const activeDocBindingSource = fs.readFileSync(askConsoleActiveDocContextBindingPath, "utf8");
    expect(source).toContain("readDocViewerPathFromDesktopUrlForAskSnapshot");
    expect(source).toContain("readHelixAskDocViewerPathFromDesktopUrlForSnapshot");
    expect(activeDocBindingSource).toContain("readDocPathFromDesktopUrl");
    expect(contextBridgeSource).toContain('searchParams.get("doc")');
    expect(source).toContain("resolveHelixAskDocViewerSnapshotPathBinding");
    expect(activeDocBindingSource).toContain("resolveDocViewerSnapshotPathCandidate");
    expect(docsContextSource).toContain('source: "desktop_url_doc_param"');
    expect(activeDocBindingSource).toContain("normalizeDocViewerPathForAskSnapshot");
    expect(docsContextSource).toContain('normalized.startsWith("docs/")');
  });

  it("promotes current whitepaper prompts to the retained docs-viewer path", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const docsContextSource = fs.readFileSync(docsViewerContextPath, "utf8");
    const requestEnvelopeSource = fs.readFileSync(askConsoleRequestEnvelopePath, "utf8");
    expect(source).toContain("resolveDocsViewerAnchorPathCandidate");
    expect(docsContextSource).toContain("HELIX_ACTIVE_DOC_VIEWER_ARTIFACT_CUE_RE");
    expect(docsContextSource).toContain("white\\s*paper|whitepaper");
    expect(source).toContain("resolveAskTurnDocViewerSnapshotPath().path");
    expect(source).toContain("buildHelixAskConsoleContextFiles");
    expect(source).not.toContain("function buildHelixAskContextFilesForTurn");
    expect(requestEnvelopeSource).toContain("workspaceContextSnapshot?.activeDocPath");
    expect(source).toContain("contextFiles: contextFilesForTurn");
  });

  it("advertises backend debug export lookup for chat-scoped Ask turn ids", () => {
    const controlsSource = fs.readFileSync(askConsoleLegacyTurnControlsPath, "utf8");
    const debugCopyProjectionSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskDebugCopyProjection.ts"),
      "utf8",
    );
    expect(debugCopyProjectionSource).toContain("isHelixAskLegacyBackendDebugExportEligibleTurnId");
    expect(debugCopyProjectionSource).toContain("resolveHelixAskLegacyDebugExportBackendTarget(parsed)");
    expect(controlsSource).toContain("export function isHelixAskLegacyBackendDebugExportEligibleTurnId");
    expect(controlsSource).toContain('trimmed.startsWith("ask:")');
    expect(controlsSource).toContain('(?:^|:)ask:[^:]+');
    expect(controlsSource).toContain("activeTurnFallbackRef");
  });

  it("keeps rendered-button debug copy scoped to the visible reply turn", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const controlsSource = fs.readFileSync(askConsoleLegacyTurnControlsPath, "utf8");
    const renderedReplyDebugExportSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskRenderedReplyDebugExport.ts"),
      "utf8",
    );
    const debugCopyProjectionSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskDebugCopyProjection.ts"),
      "utf8",
    );
    expect(renderedReplyDebugExportSource).toContain("debug_export_rebuild_reason: args.reason");
    expect(source).toContain("selectHelixAskLegacyDebugCopyLocalPayload");
    expect(debugCopyProjectionSource).toContain("resolveHelixAskLegacyDebugExportBackendTarget(parsed)");
    expect(controlsSource).toContain('rebuildReason === "rendered_button_scope"');
    expect(controlsSource).toContain("matchingBackendRef ??");
    expect(controlsSource).toContain("(isReplyScopedRebuild ? null : refCandidates[0])");
  });

  it("rejects stale debug payloads that do not match the clicked visible reply", () => {
    const questionNode = {
      innerText: "Question QUESTION Latest calculator prompt USER PROMPT",
      textContent: "Question QUESTION Latest calculator prompt USER PROMPT",
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: "Final answer FINAL Observed expression: 8*9\nResult: 72",
      textContent: "Final answer FINAL Observed expression: 8*9\nResult: 72",
      getAttribute: (name: string) =>
        name === "data-final-answer-text" ? "Observed expression: 8*9\nResult: 72" : null,
    };
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: null,
      querySelector: (selector: string) => {
        if (selector.includes("question")) return questionNode;
        if (selector.includes("final")) return finalNode;
        return null;
      },
    } as unknown as HTMLElement;

    const stalePayload = JSON.stringify({
      active_turn_id: "turn-old-calculator",
      selectedDebugQuestion: "Old calculator prompt",
      selected_final_answer: "3 + 5 = 8",
      selectedDebugFinalAnswer: "3 + 5 = 8",
      reply: {
        id: "reply-old-calculator",
        question: "Old calculator prompt",
      },
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/turn-old-calculator/debug-export",
        turn_id: "turn-old-calculator",
      },
    });

    expect(debugPayloadMatchesRenderedTurnPayload(stalePayload, debugButton)).toBe(false);
    expect(debugPayloadMatchesRenderedTurnPayload(JSON.stringify({
      active_turn_id: "turn-latest-calculator",
      selectedDebugQuestion: "Latest calculator prompt",
      selected_final_answer: "Observed expression: 8*9\nResult: 72",
      selectedDebugFinalAnswer: "Observed expression: 8*9\nResult: 72",
    }), debugButton)).toBe(true);
  });

  it("keeps rendered-button debug copy bound when the visible final comes from terminal transcript rows", () => {
    const questionText = "Debug binding check: summarize the terminal transcript result for this turn.";
    const finalText =
      "I cannot claim the requested workstation tool or UI action ran because Helix did not produce a successful observation or action receipt for every gateway request.\n" +
      "Blocked or failed gateway request: scientific-calculator.solve_expression: expression_evaluation_failed.";
    const questionNode = {
      innerText: `1Questionquestion${questionText}user prompt`,
      textContent: `1Questionquestion${questionText}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${finalText}typed failure | Provider: Codex Workstation Mode`,
      textContent: `15Final answerfinal${finalText}typed failure | Provider: Codex Workstation Mode`,
      getAttribute: (name: string) => name === "data-final-answer-text" ? finalText : null,
    };
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: null,
      querySelector: (selector: string) => {
        if (selector.includes("question")) return questionNode;
        if (selector.includes("final")) return finalNode;
        return null;
      },
    } as unknown as HTMLElement;

    const exportText = buildReplyScopedDebugExportFromRenderedButton({
      id: "reply-live-debug-binding",
      question: questionText,
      content: "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.",
      debug: {
        turn_id: "turn-live-debug-binding",
        turn_transcript_events: [
          {
            source_event_type: "terminal_answer",
            type: "final_answer",
            text: finalText,
          },
        ],
        debug_export_ref: {
          endpoint: "/api/agi/ask/turn/turn-live-debug-binding/debug-export",
          turn_id: "turn-live-debug-binding",
        },
      },
    } as any, debugButton, "rendered_button_scope");

    expect(exportText).toBeTruthy();
    const parsed = JSON.parse(exportText ?? "{}");
    expect(parsed.active_turn_id).toBe("turn-live-debug-binding");
    expect(parsed.client_active_turn_id).toBe("reply-live-debug-binding");
    expect(parsed.selected_final_answer.replace(/\s+/g, " ").trim()).toBe(
      finalText.replace(/\s+/g, " ").trim(),
    );
  });

  it("does not let a stale debug export ref become the clicked visible reply turn id", () => {
    const boundaryQuestion =
      "Boundary test: use docs search and scholarly research, then explain whether calculator-ready numerics exist.";
    const boundaryFinal =
      "The available evidence is not sufficient for calculator-ready numeric bindings; the next useful step is targeted extraction.";
    const staleTurnId = "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc";
    const questionNode = {
      innerText: `1Questionquestion${boundaryQuestion}user prompt`,
      textContent: `1Questionquestion${boundaryQuestion}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${boundaryFinal}typed failure | Provider: Codex Workstation Mode`,
      textContent: `15Final answerfinal${boundaryFinal}typed failure | Provider: Codex Workstation Mode`,
      getAttribute: (name: string) => name === "data-final-answer-text" ? boundaryFinal : null,
    };
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: null,
      querySelector: (selector: string) => {
        if (selector.includes("question")) return questionNode;
        if (selector.includes("final")) return finalNode;
        return null;
      },
    } as unknown as HTMLElement;

    const exportText = buildReplyScopedDebugExportFromRenderedButton({
      id: "reply-boundary-visible",
      question: boundaryQuestion,
      content: boundaryFinal,
      debug: {
        debug_export_ref: {
          endpoint: `/api/agi/ask/turn/${staleTurnId}/debug-export`,
          turn_id: staleTurnId,
        },
        backend_debug_response_ref: {
          endpoint: `/api/agi/ask/turn/${staleTurnId}/debug-export`,
          turn_id: staleTurnId,
        },
      },
    } as any, debugButton, "rendered_button_scope");

    expect(exportText).toBeTruthy();
    const parsed = JSON.parse(exportText ?? "{}");
    expect(parsed.active_turn_id).toBe("reply-boundary-visible");
    expect(parsed.client_active_turn_id).toBe("reply-boundary-visible");
    expect(parsed.active_turn_id).not.toBe(staleTurnId);
    expect(parsed.active_prompt).toBe(boundaryQuestion);
    expect(parsed.selected_final_answer).toBe(boundaryFinal);
  });

  it("drops stale reply debug when the rendered Docs turn has newer prompt identity", () => {
    const docsQuestion =
      "According to the currently open status whitepaper, what are the unresolved technical blockers?";
    const docsFinal =
      "I could not produce a terminal answer because the selected terminal product did not match the committed Ask route.";
    const staleQuestion =
      "Reflect local adaptation through the Theory Badge Graph and keep it diagnostic.";
    const staleTurnId = "ask:stale-theory-turn";
    const questionNode = {
      innerText: `1Questionquestion${docsQuestion}user prompt`,
      textContent: `1Questionquestion${docsQuestion}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${docsFinal}typed failure`,
      textContent: `15Final answerfinal${docsFinal}typed failure`,
      getAttribute: (name: string) => name === "data-final-answer-text" ? docsFinal : null,
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
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: visibleTurnContainer,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return staleTurnId;
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-docs-visible";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return docsQuestion;
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return docsFinal;
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;

    const exportText = buildReplyScopedDebugExportFromRenderedButton({
      id: "reply-docs-visible",
      question: docsQuestion,
      content: docsFinal,
      debug: {
        turn_id: staleTurnId,
        active_prompt: staleQuestion,
        selected_final_answer: "Theory context reflection answer.",
        debug_export_ref: {
          endpoint: `/api/agi/ask/turn/${encodeURIComponent(staleTurnId)}/debug-export`,
          turn_id: staleTurnId,
        },
      },
    } as any, debugButton, "rendered_button_scope");

    expect(exportText).toBeTruthy();
    const parsed = JSON.parse(exportText ?? "{}");
    expect(parsed.active_turn_id).toBe("reply-docs-visible");
    expect(parsed.active_prompt).toBe(docsQuestion);
    expect(parsed.selected_final_answer).toBe(docsFinal);
    expect(parsed.debug).not.toMatchObject({
      active_prompt: staleQuestion,
      selected_final_answer: "Theory context reflection answer.",
    });
    expect(parsed.debug_export_ref ?? null).toBeNull();
    expect(parsed.backend_debug_response_ref ?? null).toBeNull();
  });

  it("lets the visible row veto stale debug-copy button attributes", () => {
    const boundaryQuestion = "UI debug binding retest 178295-second prompt";
    const boundaryFinal = "Paper-backed values are needed before calculator use.";
    const staleTurnId = "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc";
    const staleQuestion = "ok, can you grab numerics...";
    const questionNode = {
      innerText: `1Questionquestion${boundaryQuestion}user prompt`,
      textContent: `1Questionquestion${boundaryQuestion}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${boundaryFinal}chat final answer | Provider: Codex Workstation Mode`,
      textContent: `15Final answerfinal${boundaryFinal}chat final answer | Provider: Codex Workstation Mode`,
      getAttribute: (name: string) => name === "data-final-answer-text" ? boundaryFinal : null,
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
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: visibleTurnContainer,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return staleTurnId;
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-visible";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return staleQuestion;
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return "3 + 5 = 8";
        return null;
      },
      querySelector: () => null,
    } as unknown as HTMLElement;

    const exportText = buildReplyScopedDebugExportFromRenderedButton({
      id: "reply-visible",
      question: boundaryQuestion,
      content: boundaryFinal,
      debug: {
        turn_id: staleTurnId,
        active_prompt: staleQuestion,
        debug_export_ref: {
          endpoint: `/api/agi/ask/turn/${staleTurnId}/debug-export`,
          turn_id: staleTurnId,
        },
      },
    } as any, debugButton, "rendered_button_scope");

    expect(exportText).toBeTruthy();
    const parsed = JSON.parse(exportText ?? "{}");
    expect(parsed.active_turn_id).toBe("reply-visible");
    expect(parsed.client_active_turn_id).toBe("reply-visible");
    expect(parsed.active_turn_id).not.toBe(staleTurnId);
    expect(parsed.active_prompt).toBe(boundaryQuestion);
    expect(parsed.selected_final_answer).toBe(boundaryFinal);
  });

  it("does not fetch a stale backend debug ref when rendered ask turn id lacks matching debug evidence", () => {
    const boundaryQuestion = "UI debug binding retest newest visible prompt";
    const boundaryFinal = "The fetched paper is useful, but calculator-ready numeric bindings are still missing.";
    const staleTurnId = "ask:eaf320fb-a91d-45f7-ba63-11c9c35e22fc";
    const questionNode = {
      innerText: `1Questionquestion${boundaryQuestion}user prompt`,
      textContent: `1Questionquestion${boundaryQuestion}user prompt`,
      getAttribute: () => null,
    };
    const finalNode = {
      innerText: `15Final answerfinal${boundaryFinal}chat final answer | Provider: Codex Workstation Mode`,
      textContent: `15Final answerfinal${boundaryFinal}chat final answer | Provider: Codex Workstation Mode`,
      getAttribute: (name: string) => name === "data-final-answer-text" ? boundaryFinal : null,
    };
    const debugButton = {
      innerText: "",
      textContent: "",
      parentElement: null,
      getAttribute: (name: string) => {
        if (name === "data-debug-copy-active-turn-id" || name === "data-turn-control-active-turn-id") return staleTurnId;
        if (name === "data-debug-copy-client-turn-id" || name === "data-turn-control-client-turn-id") return "reply-visible";
        if (name === "data-debug-copy-question" || name === "data-turn-control-question") return boundaryQuestion;
        if (name === "data-debug-copy-final-answer" || name === "data-turn-control-final-answer") return boundaryFinal;
        return null;
      },
      querySelector: (selector: string) => {
        if (selector.includes("question")) return questionNode;
        if (selector.includes("final")) return finalNode;
        return null;
      },
    } as unknown as HTMLElement;

    const exportText = buildReplyScopedDebugExportFromRenderedButton({
      id: "reply-visible",
      question: boundaryQuestion,
      content: boundaryFinal,
      debug_export_ref: {
        endpoint: `/api/agi/ask/turn/${staleTurnId}/debug-export`,
        turn_id: staleTurnId,
      },
    } as any, debugButton, "rendered_button_scope");

    expect(exportText).toBeTruthy();
    const parsed = JSON.parse(exportText ?? "{}");
    expect(parsed.active_turn_id).toBe("reply-visible");
    expect(parsed.client_active_turn_id).toBe("reply-visible");
    expect(parsed.debug_export_ref ?? null).toBeNull();
    expect(parsed.backend_debug_response_ref ?? null).toBeNull();
    expect(parsed.active_turn_id).not.toBe(staleTurnId);
    expect(parsed.active_prompt).toBe(boundaryQuestion);
    expect(parsed.selected_final_answer).toBe(boundaryFinal);
  });

  it("routes voice lite prompts through normal-turn lane without queued reasoning", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("voice normal turn lane (no queued reasoning)");
    expect(source).toContain("dispatch:simple_conversation_turn");
  });

  it("exposes command-lane confirmation UX with deterministic countdown", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const supplementSurface = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskConsoleSupplementSurface.tsx"),
      "utf8",
    );
    const voiceConfirmation = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskVoiceConfirmationPanel.tsx"),
      "utf8",
    );
    const voiceConfirmationState = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskVoiceConfirmationState.ts"),
      "utf8",
    );
    const voiceConfirmationRuntime = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "client/src/components/helix/ask-console/HelixAskVoiceConfirmationRuntime.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("const voiceCommandConfirmationState = buildHelixAskVoiceCommandConfirmationState({");
    expect(source).toContain("voiceCommandConfirmation: voiceCommandConfirmationState");
    expect(source).toContain("countdownSec: commandConfirmAutoCountdownSec");
    expect(voiceConfirmationState).toContain("export function buildHelixAskVoiceCommandConfirmationState");
    expect(voiceConfirmationState).not.toContain("command_confirm_fired");
    expect(supplementSurface).toContain("<HelixAskVoiceCommandConfirmationPanel");
    expect(supplementSurface).toContain("countdownSec={voiceCommandConfirmation.countdownSec}");
    expect(voiceConfirmation).toContain("Voice command");
    expect(voiceConfirmation).toContain("Auto-confirming in {countdownSec}s.");
    expect(voiceConfirmationRuntime).toContain("export function useHelixAskVoiceConfirmationRuntime");
    expect(voiceConfirmationRuntime).toContain("HELIX_ASK_VOICE_CONFIRMATION_COUNTDOWN_MS = 3_000");
    expect(voiceConfirmationRuntime).toContain("command_countdown_fired");
    expect(voiceConfirmationRuntime).toContain("window.clearInterval");
    expect(source).toContain("useHelixAskVoiceConfirmationRuntime({");
    expect(source).not.toContain("commandConfirmAutoTimerRef");
    expect(source).not.toContain("transcriptConfirmAutoTimerRef");
    expect(source).toContain("command_detected");
    expect(source).toContain("command_confirm_started");
    expect(source).toContain("command_confirm_fired");
    expect(source).toContain("command_executed");
    expect(source).toContain("command_cancelled");
  });

  it("routes accepted command-lane decisions through confirm state without draft append", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toMatch(
      /commandLane\?\.decision === "accepted"[\s\S]+setCommandConfirmState\([\s\S]+continue;/,
    );
  });

  it("does not let evidence gating overwrite authoritative workspace terminals", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("shouldPreserveAuthoritativeTerminalOverEvidenceGate");
    expect(source).toContain("preserveAuthoritativeTerminal");
    expect(source).toMatch(/evidenceGateDecision\.blocked && !preserveAuthoritativeTerminal/);
    expect(source).toContain('args.dispatchPolicy === "workspace_only"');
    expect(source).toContain('args.routeReasonCode === "dispatch:act"');
    expect(source).toContain('args.dispatchPolicy === "direct_answer_only"');
    expect(source).toContain('args.routeReasonCode === "conversation:simple"');
    expect(source).toContain("runtimeObservationsForTerminal");
    expect(source).toContain("runtimeSummaryRecord?.observations");
  });

  it("copies turn truth table and visible answer text into debug exports", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const apiSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/lib/agi/api.ts"), "utf8");
    expect(apiSource).toContain("turn_truth_table?: Record<string, unknown>");
    expect(apiSource).toContain("equation_attempt_debug?: Record<string, unknown> | null");
    expect(apiSource).toContain("resolved_turn_summary?: Record<string, unknown> | null");
    expect(source).toContain("turn_truth_table: localResponse.turn_truth_table ?? null");
    expect(source).toContain("visible_answer_text: responseDebugSelectedFinalAnswer");
    expect(source).toContain("turnTruthTable");
    expect(source).toContain("visible_answer_text: args.reply.content");
    expect(source).toContain("equation_attempt_debug");
    expect(source).toContain("terminal_failure_context");
    expect(source).toContain("resolved_turn_summary");
    expect(source).toContain("resolvedRouteLabel");
    expect(source).toContain("Route: ${resolvedRouteLabel}");
  });

  it("keeps trusted terminal authority ahead of stale typed-failure fields in debug exports", () => {
    const payload = JSON.parse(buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "reply-codex-workstation-success",
        turn_id: "turn-codex-workstation-success",
        content: "Observed expression: 8*9\nResult: 72",
        question: "Use scientific-calculator.solve_expression for 8*9.",
      } as any,
      {
        selected_final_answer: "I do not have a workstation observation packet.",
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "calculator_gateway_solve_observation_missing",
        terminal_answer_authority: {
          schema: "helix.turn_terminal_authority.v1",
          turn_id: "turn-codex-workstation-success",
          server_authoritative: true,
          terminal_text_preview: "Observed expression: 8*9\nResult: 72",
          final_answer_source: "agent_provider_terminal_candidate",
          terminal_artifact_kind: "agent_provider_terminal_candidate",
        },
      },
    ));

    expect(payload.selected_final_answer).toBe("Observed expression: 8*9\nResult: 72");
    expect(payload.final_answer_source).toBe("agent_provider_terminal_candidate");
    expect(payload.terminal_artifact_kind).toBe("agent_provider_terminal_candidate");
    expect(payload.terminal_error_code).toBeNull();
    expect(payload.resolved_turn_summary).toMatchObject({
      final_status: "final_answer",
      terminal_artifact_kind: "agent_provider_terminal_candidate",
      terminal_error_code: null,
    });
  });

  it("builds a visible Stage Play chat ledger from tool receipts and graph artifacts", () => {
    const reply = {
      id: "reply-stage-play",
      content: "Stage Play reflected the active visual source.",
      debug: {
        current_turn_artifact_ledger: [
          {
            kind: "live_environment_tool_observation",
            payload: {
              tool_name: "live_env.plan_stage_play_job",
              observation: {
                artifactId: "stage_play_job_plan",
                schemaVersion: "stage_play_job_plan/v1",
                domain: "narrative_media",
                requiredSources: [
                  {
                    modality: "visual_frame",
                    label: "Visual frame",
                    required: true,
                    routeTo: "narrative_stage_play",
                  },
                  {
                    modality: "audio_transcript",
                    label: "Audio transcript",
                    required: false,
                    routeTo: "narrative_stage_play",
                  },
                ],
                nodeChain: [
                  { nodeId: "observer.live_sources", nodeKind: "observer" },
                  { nodeId: "answer_snapshot.latest", nodeKind: "answer_snapshot" },
                ],
              },
            },
          },
          {
            kind: "live_environment_tool_observation",
            payload: {
              tool_name: "live_env.reflect_stage_play_context",
              observation: {
                schema: "stage_play_reflection_result/v1",
                graph: {
                  graphId: "stage_play_badge_graph:test",
                  badges: [
                    {
                      id: "compact_observation.latest_visual",
                      kind: "compact_observation",
                      status: "observed",
                      evidenceRefs: ["visual_observation:test"],
                      dataTray: {
                        summary: "First compact observation ready.",
                        evidenceRefs: ["visual_observation:test", "visual_evidence:test"],
                      },
                    },
                    {
                      id: "helix_ask.checkpoint.latest",
                      kind: "helix_ask_checkpoint",
                      status: "observed",
                      checkpoint: {
                        askTurnId: "ask_turn:test",
                        modelReviewed: true,
                      },
                      evidenceRefs: ["ask_turn_solver_trace:test"],
                    },
                    {
                      id: "answer_snapshot.latest",
                      kind: "answer_snapshot",
                      status: "observed",
                      output: {
                        lineKey: "answer_snapshot",
                        state: "model_reviewed",
                        text: "The likely next scene beat is controlled delay.",
                      },
                      evidenceRefs: ["ask_turn:test"],
                    },
                    {
                      id: "live_output.current",
                      kind: "live_output",
                      status: "candidate",
                      output: {
                        lineKey: "live_output",
                        state: "projected",
                        text: "Projected Stage Play interpretation.",
                      },
                      evidenceRefs: ["stage_play_output_lane_projection:test"],
                    },
                  ],
                  checkpointRequests: [
                    {
                      checkpointRequestId: "stage_play_checkpoint_request:test",
                      reason: "first_usable_observation",
                      status: "queued",
                      currentGraphRefs: ["stage_play_badge_graph:test"],
                      compactObservationRefs: ["visual_observation:test"],
                      perturbationRefs: [],
                      priorAnswerSnapshotRefs: [],
                    },
                  ],
                  perturbations: [
                    {
                      perturbationId: "stage_play_perturbation_event:test",
                      reason: "scene_change",
                      materiality: "meaningful",
                      affectedBadgeIds: ["setting.visual_scene"],
                      staleAnswerSnapshotIds: ["answer_snapshot:old"],
                      evidenceRefs: ["visual_observation:next"],
                    },
                  ],
                },
                liveAnswerProjection: {
                  changedLineKeys: ["risk", "possibilities", "unknowns", "next_check"],
                  projectedLineKeys: ["risk", "possibilities", "unknowns", "next_check"],
                  checkpointOnlySkipped: ["recommendation", "answer_snapshot", "voice_output"],
                  reason: "projected",
                },
                debugReceipt: {
                  schema: "stage_play_tool_receipt_debug/v1",
                  graphId: "stage_play_badge_graph:test",
                  sourceRefs: ["visual_observation:test", "visual_evidence:test"],
                  checkpointOnlySkipped: ["recommendation", "answer_snapshot", "voice_output"],
                  visualSourceStatus: [
                    {
                      sourceId: "browser_tab_visual:test",
                      modality: "visual_frame",
                      status: "active",
                      cadenceMs: 10000,
                      selectedForStagePlay: true,
                      routeTo: "narrative_stage_play",
                      evidenceRefs: ["visual_observation:test", "visual_evidence:test"],
                    },
                  ],
                  checkpointFreshness: {
                    reason: "checkpoint_model_reviewed_and_source_window_matches",
                    modelReviewed: true,
                    fresh: true,
                    checkpointId: "ask_turn:test",
                  },
                },
              },
            },
          },
        ],
      },
    } as Parameters<typeof buildStagePlayChatLedgerEvents>[0];

    const events = buildStagePlayChatLedgerEvents(reply);

    expect(events.map((event) => event.kind)).toEqual([
      "job_plan",
      "source_observation",
      "debug_receipt",
      "checkpoint_request",
      "ask_checkpoint",
      "answer_snapshot",
      "perturbation",
      "live_output",
    ]);
    expect(events[0]).toMatchObject({
      title: "Stage Play job plan created.",
      detail: "Required: visual_frame. Optional: audio_transcript.",
    });
    expect(events.find((event) => event.kind === "source_observation")?.detail).toContain(
      "First compact observation ready.",
    );
    const receipt = events.find((event) => event.kind === "debug_receipt");
    expect(receipt?.detail).toContain("Tool: live_env.reflect_stage_play_context");
    expect(receipt?.detail).toContain("Graph: stage_play_badge_graph:test");
    expect(receipt?.detail).toContain("Source: visual_frame active selected yes narrative_stage_play");
    expect(receipt?.detail).toContain("Visual evidence: visual_evidence:test");
    expect(receipt?.detail).toContain("Projected live interpretation: risk, possibilities, unknowns, next_check");
    expect(receipt?.detail).toContain("Checkpoint-only skipped: recommendation, answer_snapshot, voice_output");
    expect(receipt?.detail).toContain("Queued checkpoint: stage_play_checkpoint_request:test");
    expect(receipt?.detail).toContain("Checkpoint reviewed: true");
    expect(events.find((event) => event.kind === "checkpoint_request")?.actions).toEqual([
      "Run",
      "Skip",
      "Pause job",
    ]);
    expect(events.find((event) => event.kind === "ask_checkpoint")?.title).toBe(
      "Helix Ask checkpoint completed.",
    );
    expect(events.find((event) => event.kind === "perturbation")?.detail).toContain(
      "Staled 1 answer snapshot",
    );
    expect(events.find((event) => event.kind === "live_output")?.detail).toContain(
      "risk, possibilities, unknowns, next_check",
    );
  });

  it("shows a pending Stage Play debug receipt when checkpoint synthesis has not completed", () => {
    const reply = {
      id: "reply-stage-play-pending",
      content: "Stage Play reflection succeeded, but checkpoint answer synthesis did not complete.",
      debug: {
        current_turn_artifact_ledger: [
          {
            kind: "live_environment_tool_observation",
            payload: {
              tool_name: "live_env.reflect_stage_play_context",
              observation: {
                schema: "stage_play_reflection_result/v1",
                graph: {
                  graphId: "stage_play_badge_graph:pending",
                  badges: [
                    {
                      id: "compact_observation.latest_visual",
                      kind: "compact_observation",
                      status: "observed",
                      evidenceRefs: ["visual_frame:pending", "visual_evidence:pending"],
                    },
                  ],
                  checkpointRequests: [
                    {
                      checkpointRequestId: "stage_play_checkpoint_request:pending",
                      reason: "first_usable_observation",
                      status: "queued",
                      currentGraphRefs: ["stage_play_badge_graph:pending"],
                      compactObservationRefs: ["visual_evidence:pending"],
                    },
                  ],
                },
                liveAnswerProjection: {
                  projectedLineKeys: ["risk", "possibilities", "unknowns", "next_check"],
                  checkpointOnlySkipped: ["recommendation", "answer_snapshot", "voice_output"],
                },
                debugReceipt: {
                  schema: "stage_play_tool_receipt_debug/v1",
                  graphId: "stage_play_badge_graph:pending",
                  sourceRefs: ["visual_frame:pending", "visual_evidence:pending"],
                  checkpointOnlySkipped: ["recommendation", "answer_snapshot", "voice_output"],
                  checkpointRequestId: "stage_play_checkpoint_request:pending",
                  visualSourceStatus: [
                    {
                      sourceId: "visual_source:pending",
                      modality: "visual_frame",
                      status: "active",
                      selectedForStagePlay: true,
                      routeTo: "narrative_stage_play",
                      evidenceRefs: ["visual_frame:pending", "visual_evidence:pending"],
                    },
                  ],
                  checkpointFreshness: {
                    reason: "no_checkpoint",
                    modelReviewed: false,
                    fresh: false,
                    checkpointId: null,
                  },
                },
              },
            },
          },
        ],
      },
    } as Parameters<typeof buildStagePlayChatLedgerEvents>[0];

    const receipt = buildStagePlayChatLedgerEvents(reply).find((event) => event.kind === "debug_receipt");

    expect(receipt?.detail).toContain("Tool: live_env.reflect_stage_play_context");
    expect(receipt?.detail).toContain("Graph: stage_play_badge_graph:pending");
    expect(receipt?.detail).toContain("Source: visual_frame active selected yes narrative_stage_play");
    expect(receipt?.detail).toContain("Visual evidence: visual_evidence:pending");
    expect(receipt?.detail).toContain("Projected live interpretation: risk, possibilities, unknowns, next_check");
    expect(receipt?.detail).toContain("Checkpoint-only skipped: recommendation, answer_snapshot, voice_output");
    expect(receipt?.detail).toContain("Queued checkpoint: stage_play_checkpoint_request:pending");
    expect(receipt?.detail).toContain("Checkpoint reviewed: false");
  });

  it("uses an atomic nonempty JSON debug copy helper", async () => {
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
    const result = await copyDebugPayloadToClipboard(JSON.stringify({ selected_final_answer: "ok" }));
    expect(result).toMatchObject({
      ok: true,
      method: "navigator.clipboard",
    });
    expect(result.copied_text_length).toBeGreaterThan(0);

    let readAttempts = 0;
    const retryWrites: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async (text: string) => {
            retryWrites.push(text);
          }),
          readText: vi.fn(async () => {
            readAttempts += 1;
            return readAttempts === 1 ? "" : retryWrites.at(-1) ?? "";
          }),
        },
      },
    });
    const retryResult = await copyDebugPayloadToClipboard(JSON.stringify({ selected_final_answer: "retry ok" }));
    expect(retryResult).toMatchObject({
      ok: true,
      method: "navigator.clipboard",
    });
    expect(readAttempts).toBe(2);

    const empty = await copyDebugPayloadToClipboard("");
    expect(empty).toMatchObject({
      ok: false,
      copied_text_length: 0,
      method: "failed",
      error: "debug_payload_empty",
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("copies plain final-answer text through the response clipboard helper", async () => {
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

    await expect(copyHelixAskPlainTextToClipboard("plain final answer")).resolves.toBe(true);
    expect(writes).toEqual(["plain final answer"]);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("exposes UI/debug parity hooks without making clipboard copy part of prompt submission", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const compactSource = source.replace(/\s+/g, " ");
    const latestTurnBindingSource = fs.readFileSync(askConsoleLatestTurnBindingPath, "utf8");
    const turnControlsSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskTurnControls.tsx"),
      "utf8",
    );
    const debugDrawerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskDebugDrawer.tsx"),
      "utf8",
    );
    const debugDrawerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskDebugDrawerSurface.tsx"),
      "utf8",
    );
    const legacyConsoleViewSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyConsoleView.tsx"),
      "utf8",
    );
    const finalAnswerSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskFinalAnswer.tsx"),
      "utf8",
    );
    const finalAnswerSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskFinalAnswerSurface.tsx"),
      "utf8",
    );
    const answerEnvelopeSlotSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyAnswerEnvelopeSlot.tsx"),
      "utf8",
    );
    const contentRenderersSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyContentRenderers.tsx"),
      "utf8",
    );
    const replyTurnSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReplyTurn.tsx"),
      "utf8",
    );
    const turnStreamPanelSource = fs.readFileSync(askConsoleTurnStreamPanelPath, "utf8");
    expect(source).toContain("buildHelixAskLatestTurnBinding");
    expect(latestTurnBindingSource).toContain('finalAnswerTestId: "helix-ask-latest-final-answer"');
    expect(source).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(source).not.toContain("<HelixAskCompletedReplyTurnSurface");
    expect(source).toContain("finalAnswerTestId: latestTurnBinding.finalAnswerTestId");
    expect(source).toContain("const transcriptAnswer = finalAnswerRawText");
    expect(replyTurnSource).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanelSource).toContain("const isFinalRow = row.source === \"final\"");
    expect(turnStreamPanelSource).toContain("const visibleText = isFinalRow ? row.text : clipText(row.text, row.detailLimit ?? 360)");
    expect(source).toContain("useHelixAskLegacyContentRenderers");
    expect(source).not.toContain("<HelixAskLegacyAnswerEnvelopeSlot");
    expect(source).toContain("renderHelixAskPlainAnswerEnvelope({");
    expect(source).toContain("renderHelixAskResponseEnvelope({");
    expect(contentRenderersSource).toContain("<HelixAskLegacyAnswerEnvelopeSlot");
    expect(contentRenderersSource).toContain("renderPlainAnswerEnvelope");
    expect(contentRenderersSource).toContain("renderResponseEnvelope");
    expect(contentRenderersSource).toContain("<HelixAskRenderedContentSurface");
    expect(contentRenderersSource).toContain("<HelixAskPathLinkedTextSurface");
    expect(answerEnvelopeSlotSource).toContain("<HelixAskFinalAnswerSurface");
    expect(finalAnswerSurfaceSource).toContain("<HelixAskFinalAnswer {...props} />");
    expect(finalAnswerSource).toContain("whitespace-normal");
    expect(finalAnswerSource).toContain("break-words");
    expect(finalAnswerSource).toContain("[overflow-wrap:anywhere]");
    expect(contentRenderersSource).not.toMatch(/\b(?:line-clamp|max-h-|overflow-hidden|truncate|text-ellipsis|whitespace-nowrap)\b/);
    expect(source).not.toContain("clipForDisplay(");
    expect(source).not.toContain("HELIX_ASK_MAX_RENDER_CHARS");
    expect(turnStreamPanelSource).toContain("data-final-answer-text={isFinalRow ? finalAnswerRawText : undefined}");
    expect(turnStreamPanelSource).toContain("data-visible-terminal-source={isFinalRow ? finalAnswerSourceLabel : undefined}");
    expect(turnStreamPanelSource).toContain("data-backend-terminal-answer={isFinalRow ? backendTerminalAnswer ?? \"\" : undefined}");
    expect(source).toContain("ui_debug_parity_harness");
    expect(source).toContain("__HELIX_LAST_UNIFIED_DEBUG_COPY__");
    expect(source).toContain("__HELIX_LAST_UNIFIED_DEBUG_COPY_FALLBACK__");
    expect(source).toContain("clipboard_debug_copy_required_for_prompt_submission: false");
    expect(turnStreamPanelSource).toContain("<HelixAskTurnControls");
    expect(turnControlsSource).toContain("relative z-20 mt-2 flex max-w-fit items-center gap-1");
    expect(source).toContain("debugDrawerState={debugExportDrawer}");
    expect(source).not.toContain("<HelixAskDebugDrawerSurface");
    expect(source).not.toContain("<HelixAskDebugDrawer\n");
    expect(legacyConsoleViewSource).toContain("<HelixAskDebugDrawerSurface");
    expect(legacyConsoleViewSource).toContain("drawerState={debugDrawerState}");
    expect(debugDrawerSurfaceSource).toContain("<HelixAskDebugDrawer {...resolvedDrawer}");
    expect(debugDrawerSource).toContain("relative z-0 mt-3 rounded-lg border border-cyan-300/30");
  });

  it("renders Live Answer as an inline turn bridge before terminal output", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const finalExtrasSource = fs.readFileSync(askConsoleFinalExtrasPath, "utf8");
    const replyTurnSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReplyTurn.tsx"),
      "utf8",
    );
    const turnStreamPanelSource = fs.readFileSync(askConsoleTurnStreamPanelPath, "utf8");
    expect(source).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(source).not.toContain("<HelixAskCompletedReplyTurnSurface");
    expect(source).toContain("liveBridgeStatus: liveAnswerTurnBridge?.status");
    expect(replyTurnSource).toContain("<HelixAskTurnStreamPanel");
    expect(turnStreamPanelSource).toContain("<HelixAskLiveBridgePillStrip");
    expect(turnStreamPanelSource).toContain("status={liveBridgeStatus}");
    expect(source).not.toContain('data-testid={isLatestReply ? "helix-ask-latest-live-turn-bridge" : undefined}');
    expect(finalExtrasSource).toContain('data-testid={isLatestReply ? "helix-ask-latest-live-turn-bridge" : undefined}');
    expect(finalExtrasSource).toContain("data-live-turn-bridge-status={status ?? undefined}");
    expect(turnStreamPanelSource).toContain("data-final-answer-authority=");
    expect(source).toContain("receipt_fallback_not_reviewed");
    expect(source).toContain("resolveHelixAskFinalAnswerPresentation(finalAnswerSourceLabel)");
    expect(source).toContain("finalAnswerPresentation.heading");
    expect(source).toContain("buildHelixContinuousTurnStreamRows");
    expect(turnStreamPanelSource).toContain('aria-label="Turn stream"');
    expect(turnStreamPanelSource).toContain("data-stage-play-events");
    expect(source).not.toContain("<HelixAskLiveAnswerEnvironmentProjection");
    expect(source).not.toContain("<HelixAskLiveSituationProjection");
    expect(source).not.toMatch(/<details\s+open\s+className="rounded-2xl border border-violet-300\/20/);
    expect(source).not.toContain("`source: ${finalAnswerSourceLabel}`");
    expect(source).not.toContain("Stage Play ledger");
    expect(source).not.toContain("Stage Play inline");
    expect(source).not.toContain(">Turn stream<");
    expect(source).toContain("stagePlayEvents: stagePlayChatLedgerEvents");
    expect(source).toContain("liveAnswerTurnBridge,");
    expect(source).toContain("finalAnswerText: finalAnswerRawText");
  });

  it("prefers resolved scholarly terminal labels over stale direct model labels", () => {
    const label = readHelixAskFinalAnswerSourceLabel({
      final_answer_source: "final_answer_draft",
      terminal_artifact_kind: "model_synthesized_answer",
      resolved_turn_summary: {
        final_answer_source: "final_answer_draft",
        terminal_artifact_kind: "scholarly_research_answer",
      },
    });

    expect(label).toBe("scholarly research answer");
    expect(resolveHelixAskFinalAnswerPresentation(label).sourceLabel).toBe("scholarly research answer");
  });

  it("demotes deterministic receipt fallback to checkpoint receipt presentation", () => {
    const presentation = resolveHelixAskFinalAnswerPresentation("deterministic receipt fallback");
    expect(presentation).toEqual({
      heading: "Checkpoint receipt",
      sourceLabel: "checkpoint receipt (not reviewed)",
      isDeterministicReceiptFallback: true,
    });
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: true,
      stagePlayEvents: [],
      finalAnswerPresentation: presentation,
    });
    expect(bridge).toMatchObject({
      title: "Receipt fallback is evidence",
      status: "receipt_fallback",
      tone: "amber",
    });
  });

  it("does not show the live bridge for ambient live state without current-turn Stage Play evidence", () => {
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: false,
      stagePlayEvents: [],
      finalAnswerPresentation: resolveHelixAskFinalAnswerPresentation("model direct answer"),
    });
    expect(bridge).toBeNull();
  });

  it("marks model-reviewed Stage Play output as snapshot-bound for answer and voice lanes", () => {
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: true,
      finalAnswerPresentation: resolveHelixAskFinalAnswerPresentation("model_answer"),
      stagePlayEvents: [
        {
          key: "checkpoint",
          kind: "ask_checkpoint",
          title: "Helix Ask checkpoint completed.",
          detail: "Model-reviewed checkpoint available.",
          meta: "ask-turn-1 | model reviewed",
          evidenceRefs: ["visual_frame:1"],
          status: "model_reviewed",
        },
        {
          key: "snapshot",
          kind: "answer_snapshot",
          title: "Answer Snapshot, checkpoint only.",
          detail: "Reviewed output.",
          meta: "fresh | refs 1",
          evidenceRefs: ["answer_snapshot:1"],
          status: "fresh",
        },
      ],
    });
    expect(bridge).toMatchObject({
      title: "Answer snapshot ready",
      status: "answer_snapshot_ready",
      tone: "emerald",
    });
    expect(bridge?.pills.map((pill) => pill.label)).toContain("voice snapshot-bound");
  });

  it("does not let calculator Ask prompts bypass the unified backend turn owner", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    expect(source).toContain("clientOwnedCalculatorAction && !HELIX_E6_ASK_TURN_MANUAL_CANARY_FLAG");
    expect(source).toContain("HELIX_E6_ASK_TURN_MANUAL_CANARY_FLAG && !bypassWorkstationDispatch");
    expect(source).not.toContain("HELIX_E6_ASK_TURN_MANUAL_CANARY_FLAG && !bypassWorkstationDispatch && !clientOwnedCalculatorAction");
  });

  it("renders the Codex-style turn transcript ahead of raw plan/debug blocks", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const activeStreamSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/helix/ask-active-turn-stream.ts"),
      "utf8",
    );
    const transcriptSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/helix/ask-turn-transcript.ts"),
      "utf8",
    );
    const turnListSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskTurnList.tsx"),
      "utf8",
    );
    const turnListSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskTurnListSurface.tsx"),
      "utf8",
    );
    const activeTurnReplySource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskActiveTurnReply.tsx"),
      "utf8",
    );
    const replyTurnSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReplyTurnSurface.tsx"),
      "utf8",
    );
    const completedReplyTurnSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskCompletedReplyTurnSurface.tsx"),
      "utf8",
    );
    const legacyCompletedReplySlotSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyCompletedReplySlot.tsx"),
      "utf8",
    );
    const replyTurnItemSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReplyTurnItemSurface.tsx"),
      "utf8",
    );
    const activeTurnReplySurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskActiveTurnReplySurface.tsx"),
      "utf8",
    );
    const turnStreamPanelSource = fs.readFileSync(askConsoleTurnStreamPanelPath, "utf8");
    const replyCardSource = fs.readFileSync(askConsoleReplyCardPath, "utf8");
    const reasoningStatusMedalStripSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningStatusMedalStrip.tsx"),
      "utf8",
    );
    const reasoningTheaterSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningTheaterSurface.tsx"),
      "utf8",
    );
    const reasoningTheaterStateSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningTheaterState.ts"),
      "utf8",
    );
    const reasoningAnimationStylesSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningAnimationStyles.tsx"),
      "utf8",
    );
    const battleStageSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningBattleStage.tsx"),
      "utf8",
    );
    const consoleDiagnosticsSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskConsoleDiagnostics.ts"),
      "utf8",
    );
    const activeTurnListStateSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskActiveTurnListState.ts"),
      "utf8",
    );
    const completedReplyBattleStateSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskCompletedReplyBattleState.ts"),
      "utf8",
    );
    expect(source).toContain("buildHelixTurnTranscriptRows");
    expect(source).toContain("buildHelixContinuousTurnStreamRows");
    expect(source).toContain("buildHelixCausalTurnTraceRows");
    expect(source).toContain("sortHelixAskRepliesChronologically");
    expect(source).toContain("chronologicalAskRepliesForState");
    expect(source).toContain("chronologicalAskRepliesForTranscript");
    expect(source).toContain("const latestAskReply = chronologicalAskRepliesForTranscript.at(-1) ?? null");
    expect(source).toContain("chronologicalAskReplies.map");
    expect(source).toContain("<HelixAskLegacyCompletedReplySlot");
    expect(source).not.toContain("<HelixAskCompletedReplyTurnSurface");
    expect(source).not.toContain("<HelixAskReplyTurnItemSurface");
    expect(source).not.toContain("<HelixAskReplyTurnSurface");
    expect(source).not.toContain("<div key={reply.id}>");
    expect(source).not.toContain("const activeTurnStreamPanel = (");
    expect(source).not.toContain("<HelixAskActiveTurnReplySurface");
    expect(source).not.toContain("activeTurnStreamReply: {");
    expect(source).toContain("buildHelixAskActiveTurnListState");
    expect(source).toContain("rows: visibleActiveTurnStreamRows");
    expect(activeTurnListStateSource).toContain("activeTurnStreamReply: {");
    expect(activeTurnListStateSource).toContain("activeTurnStreamLineCount: rows.length");
    expect(source).not.toContain('workLogTestId: "helix-ask-active-turn-work-log"');
    expect(completedReplyTurnSurfaceSource).toContain("<HelixAskReplyTurnItemSurface>");
    expect(completedReplyTurnSurfaceSource).toContain("<HelixAskReplyTurnSurface {...props} />");
    expect(completedReplyTurnSurfaceSource).not.toContain("buildHelixTurnTranscriptRows");
    expect(legacyCompletedReplySlotSource).toContain("<HelixAskCompletedReplyTurnSurface key={replyId} {...turn} />");
    expect(legacyCompletedReplySlotSource).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyTurnItemSurfaceSource).toContain("return <div>{children}</div>");
    expect(replyTurnItemSurfaceSource).not.toContain("buildHelixTurnTranscriptRows");
    expect(replyTurnSurfaceSource).toContain("<HelixAskReplyTurn {...props} />");
    expect(activeTurnReplySurfaceSource).toContain("<HelixAskActiveTurnReply {...props} />");
    expect(activeTurnReplySource).toContain("<HelixAskReplyTurn");
    expect(activeTurnReplySource).toContain('workLogTestId: "helix-ask-active-turn-work-log"');
    expect(consoleDiagnosticsSource).toContain("renderPlacement: \"inline_active_turn\"");
    expect(source).not.toContain("<HelixAskTurnListSurface");
    expect(source).toContain("const turnListState = buildHelixAskActiveTurnListState({");
    expect(source).toContain("turnListState,");
    expect(source).toContain("{...legacyConsoleViewState}");
    expect(source).not.toContain("turnListState={turnListState}");
    expect(activeTurnListStateSource).toContain("visible: completedReplyCount > 0 || rows.length > 0");
    expect(source).not.toContain("turnList={chronologicalAskReplies.length > 0 || visibleActiveTurnStreamRows.length > 0 ? (");
    expect(turnListSurfaceSource).toContain("if (!visible) return null");
    expect(turnListSurfaceSource).toContain("<HelixAskTurnList");
    expect(turnListSurfaceSource).toContain("activeTurnStreamPanel={resolvedActiveTurnStreamPanel}");
    expect(turnListSource).toContain('data-testid="helix-ask-active-turn-stream-lane"');
    expect(turnListSource).toContain('data-render-placement="inline_active_turn"');
    expect(turnListSource).toContain("activeTurnStreamLaneRef");
    expect(turnListSource).toContain("data-active-render-token");
    expect(turnListSource).not.toContain('className="contents"');
    expect(turnListSource.indexOf("{children}")).toBeLessThan(turnListSource.indexOf("{activeTurnStreamPanel}"));
    expect(source).toContain("laneRef: activeTurnStreamPanelRef");
    expect(activeTurnListStateSource).toContain("activeTurnStreamLaneRef: laneRef");
    expect(source).toContain("activeStreamDom");
    expect(source).toContain("activeStreamMounted");
    expect(source).toContain("activeStreamBeforeBottom");
    expect(source).toContain("activeStreamRectHeight");
    expect(source).toContain("retainedLiveEventCount");
    expect(turnStreamPanelSource).toContain('aria-label="Turn stream"');
    expect(turnStreamPanelSource).toContain('data-latest-turn-stream={isLatestReply ? "true" : undefined}');
    expect(source).not.toContain(">Turn stream<");
    expect(turnStreamPanelSource).toContain("data-turn-stream-lines");
    expect(turnStreamPanelSource).toContain("data-stream-row-source");
    expect(turnListSource).toContain('data-testid="helix-ask-reply-list-bottom"');
    expect(source).toContain("askReplyListBottomRef");
    expect(source).toContain("scrollIntoView({ behavior, block: \"end\" })");
    expect(source).toContain("askReplyListPinnedToBottomRef.current = true");
    expect(source).toContain('from "@/lib/helix/ask-active-turn-stream"');
    expect(activeStreamSource).toContain("LOW_SIGNAL_ASK_LIVE_TRANSCRIPT_PATTERNS");
    expect(activeStreamSource).toContain("shouldShowAskLiveAgenticEventRow");
    expect(activeStreamSource).toContain("live turn completed");
    expect(activeStreamSource).toContain("live question");
    expect(activeStreamSource).toContain("/^model decision:\\s*.+\\.?$/i");
    expect(source).not.toContain("askLiveStatusText");
    expect(source).toContain("helixAskSessionContextRef.current === normalizedContextId");
    expect(source).toContain("ensureContextSession(normalizedContextId, \"Helix Ask\")");
    expect(source).not.toContain("<HelixAskReasoningStatusMedalStrip");
    expect(reasoningTheaterSurfaceSource).toContain("<HelixAskReasoningStatusMedalStrip");
    expect(reasoningStatusMedalStripSource).toContain("flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap");
    expect(reasoningStatusMedalStripSource).toContain("min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-slate-300/90");
    expect(replyCardSource).toContain("helix-ask-turn-enter");
    expect(turnStreamPanelSource).toContain("helix-ask-turn-line-enter");
    expect(turnListSource).toContain("@keyframes helixAskTurnFadeIn");
    const turnControlsSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskTurnControls.tsx"),
      "utf8",
    );
    expect(turnStreamPanelSource).toContain("<HelixAskTurnControls");
    expect(turnControlsSource).toContain('title="Copy response"');
    expect(turnControlsSource).toContain('title="Unified Debug Copy"');
    expect(source).toContain("buildReplyScopedDebugExportFromRenderedButton");
    expect(source).toContain("selectedDebugTurnId: renderedMatchesReply ? activeTurnId : null");
    expect(source).toContain("const backendTurnScopeTrusted = isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({");
    expect(source).toContain("const replyResolvedTurnIdTrusted =");
    expect(source).toContain("!isBackendAskTurnDebugExportEligibleTurnId(replyResolvedTurnId) || Boolean(rendered.activeTurnId)");
    expect(source).toContain('selectedDebugSource: "rendered_reply_dom"');
    expect(source).toContain(
      "debug_export_ref: includeReplyDebug ? replyRecord.debug_export_ref ?? replyDebugRecord?.debug_export_ref ?? null : null",
    );
    expect(source.indexOf("buildReplyScopedDebugExportFromRenderedButton")).toBeLessThan(
      source.indexOf("<HelixAskLegacyCompletedReplySlot"),
    );
    expect(source).toContain("formatReadAloudButtonLabel");
    expect(source).not.toContain("Copy Capsule");
    expect(source).not.toContain("Open conversation");
    expect(source).not.toContain(">Causal trace<");
    expect(source).not.toContain("helix-ask-latest-causal-trace");
    expect(source).not.toContain(">Debug trace<");
    expect(source).not.toContain("Reasoning event log");
    expect(source).not.toContain("copy logs");
    expect(source).toContain("causal_turn_timeline");
    expect(source).toContain("buildReasoningTheaterFloatingActionText");
    const reasoningMeterSurfaceSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReasoningMeterSurface.tsx"),
      "utf8",
    );
    expect(source).toContain("const reasoningTheaterState = buildHelixAskReasoningTheaterState({");
    expect(source).toContain("reasoningTheater: reasoningTheaterState");
    expect(source).not.toContain("<HelixAskReasoningTheaterSurface");
    expect(source).not.toContain("<HelixAskReasoningMeterSurface");
    expect(reasoningTheaterSurfaceSource).toContain("<HelixAskReasoningMeterSurface");
    expect(reasoningTheaterStateSource).toContain("export function buildHelixAskReasoningTheaterState");
    expect(reasoningMeterSurfaceSource).toContain("helix-ask-reasoning-floating-action-text");
    const busyReasoningPanelSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskBusyReasoningPanel.tsx"),
      "utf8",
    );
    expect(source).not.toContain("<HelixAskBusyReasoningPanel");
    expect(reasoningTheaterSurfaceSource).toContain("<HelixAskBusyReasoningPanel");
    expect(busyReasoningPanelSource).toContain("<HelixAskReasoningAnimationStyles />");
    expect(reasoningAnimationStylesSource).toContain("helixReasoningFloatingText");
    expect(source).toContain("readReasoningTheaterHardFailureSignals");
    expect(source).toContain("applyReasoningTheaterFailureOverride");
    const hardFailureSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/helix/ask-reasoning-theater-hard-failure.ts"),
      "utf8",
    );
    expect(hardFailureSource).toContain("terminal_artifact_forbidden_by_route_contract");
    expect(source).toContain("buildReasoningBattleAmbientState");
    expect(source).not.toContain("buildReasoningBattleAnswerTint({");
    expect(completedReplyBattleStateSource).toContain("buildReasoningBattleAnswerTint({");
    expect(source).toContain("buildReasoningBattleBeats");
    expect(source).not.toContain("<HelixAskReasoningBattleStage");
    expect(reasoningMeterSurfaceSource).toContain("<HelixAskReasoningBattleStage");
    expect(battleStageSource).toContain("helix-ask-reasoning-battle-stage");
    expect(battleStageSource).toContain("helix-ask-reasoning-battle-ambient");
    expect(turnStreamPanelSource).toContain("data-reasoning-stage-palette");
    expect(turnStreamPanelSource).toContain("data-reasoning-stage-balance");
    expect(battleStageSource).toContain("helix-ask-reasoning-battle-beat");
    expect(battleStageSource).toContain("helix-ask-reasoning-battle-primitive");
    expect(battleStageSource).toContain("helix-ask-reasoning-battle-pressure");
    expect(reasoningAnimationStylesSource).toContain("helixReasoningBattleBeat");
    expect(reasoningAnimationStylesSource).toContain("helixReasoningBattlePrimitive");
    expect(battleStageSource).toContain("reasoningBattleBeatPrimitive");
    expect(battleStageSource).toContain("reasoningBattlePrimitiveClassName");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(transcriptSource).toContain('type === "model_decision"');
    expect(source).toContain("Thinking");
    expect(source).toContain("turn_transcript_events");
    expect(source).toContain("buildAskLiveEventFromTurnTranscriptRecord");
    expect(source).toContain('source_event_type === "public_commentary"');
    expect(transcriptSource).toContain('stream_event: "turn_transcript_event"');
    expect(source).toContain("appendSyntheticLiveEvent(tracedLiveEvent)");
    expect(source).toContain("console_stream_ingress_debug");
    expect(source).toContain("rawStreamPacketCount");
    expect(source).toContain("acceptedLiveEventCount");
    expect(source).toContain("replayedTranscriptEventCount");
    expect(source).toContain("buildHelixActiveTurnTranscriptRows");
    expect(source).toContain("includeTerminalRows");
    expect(source).toContain("replayHelixAskTurnTranscriptEventsToConsole");
    expect(source).toContain("attachHelixAskClientTraceToLiveEvent");
    expect(source).toContain("backend_turn_id");
    expect(transcriptSource).toContain("record.turn_id ?? record.turnId ?? record.active_turn_id");
    expect(source).toContain("targetTurnId");
    expect(source).toContain("resolveHelixAskReplyCanonicalKey(reply) !== targetTurnId");
    expect(source).toContain("turn_transcript_source");
    expect(source).toContain("visible_event_count");
    expect(source).toContain("backend_event_count");
    expect(source).toContain("runAskTurnStream");
    expect(source).toContain("stream_fallback_reason");
    expect(source).toContain("async_executor_used");
    expect(source).toContain("async_step_durations");
  });

  it("renders live-source mail loop rows in the continuous Helix Ask transcript", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const liveSourceDisplay = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/helix/ask-live-source-display.ts"),
      "utf8",
    );
    expect(source).toContain('from "@/lib/helix/ask-live-source-display"');
    expect(source).toContain("collectHelixMailLoopTranscriptRows");
    expect(source).toContain("buildHelixMailLoopTurnStreamRows");
    expect(source).not.toContain("const HELIX_MAIL_LOOP_TRANSCRIPT_ROW_KINDS");
    expect(liveSourceDisplay).toContain("HELIX_MAIL_LOOP_TRANSCRIPT_ROW_KINDS");
    expect(liveSourceDisplay).toContain('"mail_received"');
    expect(liveSourceDisplay).toContain('"mail_read_tool_call"');
    expect(liveSourceDisplay).toContain('"mail_read_receipt"');
    expect(liveSourceDisplay).toContain('"prediction_check"');
    expect(liveSourceDisplay).toContain('"task_queued"');
    expect(liveSourceDisplay).toContain('"narrative_projection"');
    expect(liveSourceDisplay).toContain('"agent_decision"');
    expect(liveSourceDisplay).toContain('"interpretation"');
    expect(liveSourceDisplay).toContain('"watch_next"');
    expect(liveSourceDisplay).toContain('"prediction"');
    expect(liveSourceDisplay).toContain('"narrative_state"');
    expect(liveSourceDisplay).toContain('"interpreter_profile"');
    expect(liveSourceDisplay).toContain('"profile_comparison"');
    expect(liveSourceDisplay).toContain('"profile_note_link"');
    expect(liveSourceDisplay).toContain('"profile_compiled"');
    expect(liveSourceDisplay).toContain('"text_answer"');
    expect(liveSourceDisplay).toContain('"voice_callout_request"');
    expect(liveSourceDisplay).toContain('"voice_tool_call"');
    expect(liveSourceDisplay).toContain('"voice_receipt"');
    expect(liveSourceDisplay).toContain('"voice_steering_received"');
    expect(liveSourceDisplay).toContain('"voice_steering_queued"');
    expect(liveSourceDisplay).toContain('"voice_steering_applied"');
    expect(liveSourceDisplay).toContain('"steering_ack_receipt"');
    expect(liveSourceDisplay).toContain('"goal_context_snapshot"');
    expect(liveSourceDisplay).toContain('"wait_for_next_summary"');
    expect(liveSourceDisplay).toContain('if (row.rowKind === "prediction_check") return row.body || "No prior prediction."');
    expect(liveSourceDisplay).toContain('if (row.rowKind === "goal_context_snapshot") return row.body || "Goal context snapshot recorded as non-terminal evidence."');
    expect(liveSourceDisplay).toContain("live_env.read_live_source_mail");
    expect(liveSourceDisplay).toContain("Read ${count} unread live-source mail item");
    expect(liveSourceDisplay).toContain('count === "1"');
    expect(liveSourceDisplay).toContain("Reason:");
    expect(liveSourceDisplay).toContain("Prediction check");
    expect(liveSourceDisplay).toContain("Narrative projection");
    expect(liveSourceDisplay).toContain("Narrative state");
    expect(liveSourceDisplay).toContain("Interpreter profile");
    expect(liveSourceDisplay).toContain("Profile comparison");
    expect(liveSourceDisplay).toContain("Text draft");
    expect(liveSourceDisplay).toContain("Voice callout request");
    expect(liveSourceDisplay).toContain("Voice tool call");
    expect(liveSourceDisplay).toContain("Voice receipt");
    expect(liveSourceDisplay).toContain("Voice steering received");
    expect(liveSourceDisplay).toContain("Steering ack receipt");
    expect(liveSourceDisplay).toContain("Goal context snapshot");
    expect(liveSourceDisplay).toContain('if (row.rowKind === "goal_context_snapshot") return "observation"');
    expect(liveSourceDisplay).toContain('row.rowKind === "goal_context_snapshot"');
    expect(liveSourceDisplay).toContain('? "live_answer"');
    expect(liveSourceDisplay).toContain('if (row.rowKind === "loop_state") return row.title || "Loop state"');
    expect(liveSourceDisplay).toContain('row.rowKind.startsWith("voice_steering_")');
  });

  it("keeps wake mail transcript rows out of the durable chat projection", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const chatProjectionSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskChatProjection.ts"),
      "utf8",
    );
    const replyLifecycleSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskReplyLifecycle.ts"),
      "utf8",
    );
    expect(source).toContain("fetchStagePlayLiveSourceMailTranscript");
    expect(source).toContain("/api/helix/stage-play/live-source-mail/transcript?");
    expect(source).toContain("/api/helix/stage-play/live-source-mail/wake/cycle");
    expect(source).toContain("shouldAutoWakeHelixMailboxQueueItem");
    expect(source).toContain("helix_ask_steering_queue_auto_wake");
    expect(source).toContain("mailboxThreadId: HELIX_ASK_LIVE_SOURCE_MAIL_THREAD_ID");
    expect(source).toContain("buildHelixAskRepliesFromChatSession");
    expect(source).toContain("buildHelixAskRepliesFromChatSessionProjection");
    expect(source).toContain("durable_chat_projection");
    expect(source).toContain("The mailbox transcript is operational history.");
    expect(source).not.toContain("groupStagePlayMailTranscriptEntries(entries)");
    expect(source).not.toContain("buildHelixAskReplyFromMailTranscriptEntries");
    expect(source).not.toContain("live_source_mail_wake_transcript_durable: true");
    expect(source).toContain("sortHelixAskRepliesChronologically");
    expect(source).toContain("appendHelixAskReplyChronologically");
    expect(source).toContain("chronologicalAskRepliesForState");
    expect(source).toContain("chronologicalAskRepliesForTranscript");
    expect(source).toContain("shouldHideHelixAskTranscriptReply");
    expect(chatProjectionSource).toContain("policy.isProgressPlaceholderText(answer)");
    expect(source).toContain("const latestAskReply = chronologicalAskRepliesForTranscript.at(-1) ?? null");
    expect(source).toContain("chronologicalAskReplies.map");
    expect(source).toContain("const transcriptLatestAskReplyId = chronologicalAskReplies.at(-1)?.id ?? latestAskReplyId");
    expect(source).toContain("reply.id === transcriptLatestAskReplyId");
    expect(chatProjectionSource).toContain("parseHelixAskChatMessageTimeMs");
    expect(chatProjectionSource).toContain("buildHelixAskChatProjectionId");
    expect(chatProjectionSource).toContain(".sort((left, right) => {");
    expect(replyLifecycleSource).toContain("return left.orderMs - right.orderMs;");
    expect(replyLifecycleSource).toContain("reply.createdAtMs");
    expect(chatProjectionSource).toContain('final_answer_source: "durable_chat_session"');
  });

  it("marks poisoned or contract-invalid terminal answers as hard theater failures", () => {
    const signals = readReasoningTheaterHardFailureSignals(
      {
        resolved_turn_summary: {
          final_status: "final_answer",
          terminal_error_code: "direct_answer_unavailable",
        },
        observation_review: {
          runtime_next_action: "fail_closed",
          missing_piece: "direct_answer_unavailable",
        },
        poison_audit: {
          ok: false,
          violations: [
            {
              kind: "terminal_artifact_forbidden_by_route_contract",
            },
          ],
        },
        current_turn_events: [
          {
            type: "turn_completed",
            status: "failed",
          },
        ],
      },
      [],
    );

    expect(signals.failed).toBe(true);
    expect(signals.reasons).toContain("terminal_artifact_forbidden_by_route_contract");
    expect(signals.reasons).toContain("direct_answer_unavailable");
    expect(signals.reasons).toContain("observation_review.fail_closed");
    expect(signals.reasons).toContain("event.turn_completed.failed");
  });

  it("prefers runtime loop events over stale procedural transcript events", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-runtime-docs",
      question: "summarize docs about nhm2 current status",
      content: "Five bullet summary",
      debug: {
        turn_transcript_events: [
          {
            type: "model_decision",
            role: "agent",
            status: "completed",
            text: "No tool step selected; prepare direct response.",
          },
        ],
        agent_runtime_loop: {
          schema: "helix.agent_runtime_loop.v1",
          iterations: [
            {
              next_step: "next_action",
              chosen_capability: "docs-viewer.search_docs",
              decision_authority: "llm",
              observed_artifact_refs: ["doc_search_results:nhm2-current-status"],
            },
            {
              next_step: "next_action",
              chosen_capability: "docs-viewer.summarize_doc",
              decision_authority: "llm",
              observed_artifact_refs: ["doc_summary:nhm2-current-status"],
            },
            {
              next_step: "answer",
              chosen_capability: "model.direct_answer",
              decision_authority: "llm",
              artifact_refs: ["final_answer_draft:docs-summary"],
            },
          ],
        },
      },
    } as never);
    const combined = rows
      .map((row: { label: string; text: string; meta: string }) => `${row.label}: ${row.text} ${row.meta}`)
      .join("\n");
    expect(combined).toContain("docs-viewer.search_docs");
    expect(combined).toContain("docs-viewer.summarize_doc");
    expect(combined).toContain("Composed final answer");
    expect(combined).not.toContain("No tool step selected");
    expect(rows.some((row) => row.label === "Final" && /final_answer_draft/i.test(row.text))).toBe(false);
  });

  it("renders Codex provider gateway transcript rows with provider and tool observation labels", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-gateway-trace",
      question: "Use the scientific calculator to evaluate 8 * 9.",
      content: "The result is 72.",
      debug: {
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            lane: "agent_runtime",
            step_id: "runtime_selected",
            source_event_type: "runtime_selected",
          },
          {
            role: "system",
            type: "observation",
            status: "completed",
            text: "Context state: focused panel scientific-calculator; retained doc docs/helix-ask-flow.md.",
            lane: "workstation_context",
            step_id: "context_state",
            source_event_type: "context_state",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Tool request: scientific-calculator.solve_expression.",
            lane: "workstation_gateway",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_request",
          },
          {
            role: "tool",
            type: "tool_result",
            status: "completed",
            text: "Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.",
            lane: "scientific-calculator.solve_expression",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_observation",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Action request: scientific-calculator.open_panel.",
            lane: "workstation_gateway",
            step_id: "workstation_gateway_2",
            source_event_type: "action_request",
          },
          {
            role: "tool",
            type: "tool_result",
            status: "completed",
            text: "Action observation: scientific-calculator.open_panel admitted open_panel for scientific-calculator.",
            lane: "scientific-calculator.open_panel",
            step_id: "workstation_gateway_2",
            source_event_type: "action_observation",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
            lane: "codex_provider",
            step_id: "model_reentry",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "The result is 72.",
            lane: "codex_provider",
            step_id: "final_answer",
            source_event_type: "terminal_answer",
          },
        ],
      },
    } as never);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta}`).join("\n");
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain("Context state: focused panel scientific-calculator; retained doc docs/helix-ask-flow.md.");
    expect(combined).toContain("Action request: scientific-calculator.open_panel.");
    expect(combined).toContain("Action observation: scientific-calculator.open_panel admitted open_panel for scientific-calculator.");
    expect(combined).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(combined).toContain("Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).toContain("The result is 72.");
    expect(rows.map((row) => row.label)).toEqual([
      "Runtime",
      "Context",
      "Tool Request",
      "Tool Observation",
      "Action Request",
      "Action Observation",
      "Model Re-entry",
      "Final",
    ]);
  });

  it("renders latest-turn readable surface observation and narrator receipt rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-readable-surface-ui",
      question: "Read aloud the visible section of this document.",
      content: "I sent the visible section to the narrator.",
      debug: {
        agent_runtime: "codex",
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            lane: "agent_runtime",
            step_id: "runtime_selected",
            source_event_type: "runtime_selected",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Tool request: docs-viewer.read_visible_surface.",
            lane: "workstation_gateway",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_request",
          },
          {
            role: "tool",
            type: "tool_result",
            status: "completed",
            text: "Tool observation: docs-viewer.read_visible_surface observed surface observation ready.",
            lane: "docs-viewer.read_visible_surface",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_observation",
          },
          {
            role: "agent",
            type: "decision",
            status: "completed",
            text: "Compound itinerary: read_aloud_surface satisfied with 2/2 subgoals satisfied.",
            lane: "helix_compound_capability_dependency_planner",
            step_id: "compound_itinerary",
            source_event_type: "compound_itinerary",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Action request: live_env.narrator_say.",
            lane: "workstation_gateway",
            step_id: "workstation_gateway_2",
            source_event_type: "action_request",
          },
          {
            role: "tool",
            type: "tool_result",
            status: "completed",
            text: "Action observation: live_env.narrator_say observed Narrator voice playback request queued.",
            lane: "live_env.narrator_say",
            step_id: "workstation_gateway_2",
            source_event_type: "action_observation",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
            lane: "codex_provider",
            step_id: "model_reentry",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "I sent the visible section to the narrator.",
            lane: "codex_provider",
            step_id: "final_answer",
            source_event_type: "terminal_answer",
          },
        ],
        workstation_gateway_call_results: [
          {
            ok: true,
            capability_id: "docs-viewer.read_visible_surface",
            mode: "read",
            gateway_admission: {
              requested_capability: "docs-viewer.read_visible_surface",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_surface",
                subgoal_id: "read_aloud_surface:surface_observation",
              },
            },
            observation: {
              schema: "helix.workstation_readable_surface_observation.v1",
              text: "Visible document surface text.",
              compound_dependency_turn_plan: {
                schema: "helix.compound_capability_dependency_turn_plan.v1",
                compound_outcomes: ["read_aloud_surface"],
                rail_status: "satisfied",
                subgoal_count: 2,
                satisfied_subgoal_count: 2,
                ordered_subgoals: [
                  {
                    subgoal_id: "read_aloud_surface:surface_observation",
                    requested_capability: "docs-viewer.read_visible_surface",
                    executed_capability: "docs-viewer.read_visible_surface",
                    satisfied: true,
                  },
                  {
                    subgoal_id: "read_aloud_surface:narrator_receipt",
                    requested_capability: "live_env.narrator_say",
                    executed_capability: "live_env.narrator_say",
                    satisfied: true,
                  },
                ],
              },
            },
            observation_packet: {
              capability_key: "docs-viewer.read_visible_surface",
              status: "succeeded",
              observation_summary: "surface observation ready",
            },
          },
          {
            ok: true,
            capability_id: "live_env.narrator_say",
            mode: "act",
            gateway_admission: {
              requested_capability: "live_env.narrator_say",
              admission_status: "admitted",
              source_target_intent: {
                compound_outcome: "read_aloud_surface",
                subgoal_id: "read_aloud_surface:narrator_receipt",
                depends_on_capability_id: "docs-viewer.read_visible_surface",
              },
            },
            observation: {
              schema: "helix.interim_voice_callout_tool_result.v1",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            observation_packet: {
              capability_key: "live_env.narrator_say",
              status: "succeeded",
              observation_summary: "Narrator voice playback request queued",
            },
          },
        ],
      },
    } as never);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.status}`).join("\n");
    expect(combined).toContain("Tool request: docs-viewer.read_visible_surface.");
    expect(combined).toContain("Tool observation: docs-viewer.read_visible_surface observed surface observation ready.");
    expect(combined).toContain("Action request: live_env.narrator_say.");
    expect(combined).toContain("Action observation: live_env.narrator_say observed Narrator voice playback request queued.");
    expect(combined).toContain("Itinerary: Compound itinerary: read_aloud_surface satisfied with 2/2 subgoals satisfied.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).toContain("Final: I sent the visible section to the narrator.");
    expect(combined).not.toContain("client.read_aloud");
  });

  it("renders structured Codex gateway fields in latest-turn rows before final answer", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-gateway-structured-fields",
      question:
        "Codex UI gateway smoke 2026-06-29: use the Helix workstation gateway capability scientific-calculator.solve_expression with expression 8*9. Answer with the observed expression and result.",
      content: "Observed expression: 8*9\nResult: 72",
      debug: {
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        workstation_gateway_call_results: [
          {
            schema: "helix.workstation_tool_gateway.call_result.v1",
            ok: true,
            capability_id: "scientific-calculator.solve_expression",
            mode: "read",
            gateway_admission: {
              requested_capability: "scientific-calculator.solve_expression",
              selected_agent_provider: "codex",
              admission_status: "admitted",
            },
            observation: {
              expression: "8*9",
              result: "72",
            },
            observation_packet: {
              schema: "helix.agent_step_observation_packet.v1",
              turn_id: "turn-codex-gateway-structured-fields",
              capability_key: "scientific-calculator.solve_expression",
              status: "succeeded",
              observation_summary: "8*9 = 72",
              assistant_answer: false,
              raw_content_included: false,
            },
          },
        ],
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            lane: "agent_runtime",
            step_id: "runtime_selected",
            source_event_type: "runtime_selected",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: no workstation observation packet was available for this Codex turn.",
            lane: "codex_provider",
            step_id: "model_reentry",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "completed",
            text: "Observed expression: 8*9\nResult: 72",
            lane: "codex_provider",
            step_id: "final_answer",
            source_event_type: "terminal_answer",
          },
        ],
      },
    } as never);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta}`).join("\n");
    const labels = rows.map((row) => row.label);
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain("Tool request: scientific-calculator.solve_expression.");
    expect(combined).toContain("Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.");
    expect(combined).toContain("Model re-entry: Codex received the workstation observation packet");
    expect(combined).toContain("Observed expression: 8*9\nResult: 72");
    expect(combined).not.toContain("no workstation observation packet was available");
    expect(labels.indexOf("Tool Request")).toBeLessThan(labels.indexOf("Final"));
    expect(labels.indexOf("Tool Observation")).toBeLessThan(labels.indexOf("Final"));
    expect(labels.indexOf("Model Re-entry")).toBeLessThan(labels.indexOf("Final"));
  });

  it("classifies successful workstation transcript rows as terminal workstation output", () => {
    expect(hasSuccessfulWorkstationTerminalTranscriptRows([
      {
        key: "request",
        role: "agent",
        label: "Tool Request",
        text: "Tool request: scientific-calculator.solve_expression.",
        meta: "workstation_gateway | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "observation",
        role: "tool",
        label: "Tool Observation",
        text: "Tool observation: scientific-calculator.solve_expression observed 8*9 = 72.",
        meta: "scientific-calculator.solve_expression | workstation_gateway_1 | completed",
        status: "completed",
      },
      {
        key: "reentry",
        role: "agent",
        label: "Model Re-entry",
        text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
        meta: "codex_provider | model_reentry | completed",
        status: "completed",
      },
      {
        key: "final",
        role: "assistant",
        label: "Final",
        text: "Observed expression: `8*9`\n\nResult: `72`",
        meta: "",
        status: "completed",
      },
    ])).toBe(true);
  });

  it("renders Codex provider blocked gateway observations in the latest turn rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-codex-gateway-blocked-trace",
      question: "Search the repo and tell me what you find.",
      content:
        "I cannot claim the requested workstation tool or UI action ran because Helix did not produce a successful observation or action receipt for every gateway request.",
      debug: {
        agent_runtime: "codex",
        selected_agent_provider: {
          id: "codex",
          label: "Codex Workstation Mode",
        },
        turn_transcript_events: [
          {
            role: "system",
            type: "plan",
            status: "completed",
            text: "Runtime selected: Codex Workstation Mode.",
            lane: "agent_runtime",
            step_id: "runtime_selected",
            source_event_type: "runtime_selected",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Tool request: repo.search.",
            lane: "workstation_gateway",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_request",
          },
          {
            role: "tool",
            type: "tool_result",
            status: "failed",
            text: "Tool observation: Repo search gateway blocked query: missing_query.",
            detail: "Repo search gateway blocked query: missing_query.",
            lane: "repo.search",
            step_id: "workstation_gateway_1",
            source_event_type: "tool_observation",
            capability_id: "repo.search",
          },
          {
            role: "agent",
            type: "model_decision",
            status: "completed",
            text: "Model re-entry: Codex received the workstation observation packet(s) before final answer.",
            lane: "codex_provider",
            step_id: "model_reentry",
            source_event_type: "model_reentry",
          },
          {
            role: "assistant",
            type: "final_answer",
            status: "final_failure",
            text: "Blocked or failed gateway request: repo.search: missing_query.",
            lane: "codex_provider",
            step_id: "final_answer",
            source_event_type: "terminal_answer",
          },
        ],
      },
    } as never);

    const combined = rows.map((row) => `${row.label}: ${row.text} ${row.meta}`).join("\n");
    expect(rows.map((row) => row.label)).toEqual([
      "Runtime",
      "Tool Request",
      "Tool Observation",
      "Model Re-entry",
      "Final",
    ]);
    expect(combined).toContain("Runtime selected: Codex Workstation Mode.");
    expect(combined).toContain("Tool request: repo.search.");
    expect(combined).toContain("Repo search gateway blocked query: missing_query.");
    expect(combined).toContain("Blocked or failed gateway request: repo.search: missing_query.");
  });

  it("admits Codex provider calculator open/focus action envelopes when backed by action receipts", () => {
    const actionEnvelope = {
      schema: "helix.ask.action_envelope.v1",
      governance: {
        dispatch: "allow",
        reason: "admitted_non_mutating_codex_workstation_action",
      },
      workstation_actions: [
        {
          schema_version: "helix.workstation.action/v1",
          action: "open_panel",
          panel_id: "scientific-calculator",
        },
        {
          schema_version: "helix.workstation.action/v1",
          action: "focus_panel",
          panel_id: "scientific-calculator",
        },
      ],
    } as never;
    const agentStepLoop = {
      schema: "helix.agent_step_loop.v1",
      iterations: [
        {
          next_step: "workstation_action",
          chosen_capability: "scientific-calculator.open_panel",
          selected_capability: "scientific-calculator.open_panel",
          observed_artifact_refs: ["ask:test:scientific-calculator.open_panel:observation"],
        },
        {
          next_step: "workstation_action",
          chosen_capability: "scientific-calculator.focus_panel",
          selected_capability: "scientific-calculator.focus_panel",
          observed_artifact_refs: ["ask:test:scientific-calculator.focus_panel:observation"],
        },
      ],
    };

    const result = buildHelixActionEnvelopeRuntimeAuthority(actionEnvelope, { agent_step_loop: agentStepLoop });

    expect(result.audit).toMatchObject({
      allowed: true,
      reason: "agent_step_decision_backed",
      selected_capabilities: expect.arrayContaining([
        "scientific-calculator.open_panel",
        "scientific-calculator.focus_panel",
      ]),
      envelope_action_keys: expect.arrayContaining([
        "scientific-calculator.open_panel",
        "scientific-calculator.focus_panel",
      ]),
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(result.executableEnvelope).toBe(actionEnvelope);
  });

  it("admits Codex provider docs open-doc action envelopes when backed by action receipts", () => {
    const actionEnvelope = {
      schema: "helix.ask.action_envelope.v1",
      governance: {
        dispatch: "allow",
        reason: "admitted_non_mutating_codex_workstation_action",
      },
      workstation_actions: [
        {
          schema_version: "helix.workstation.action/v1",
          action: "run_panel_action",
          panel_id: "docs-viewer",
          action_id: "open_doc",
          args: {
            path: "docs/helix-ask-api-parity-matrix.md",
          },
        },
      ],
    } as never;
    const agentStepLoop = {
      schema: "helix.agent_step_loop.v1",
      iterations: [
        {
          next_step: "workstation_action",
          chosen_capability: "docs-viewer.open_doc",
          selected_capability: "docs-viewer.open_doc",
          observed_artifact_refs: ["ask:test:docs-viewer.open_doc:observation"],
        },
      ],
    };

    const result = buildHelixActionEnvelopeRuntimeAuthority(actionEnvelope, { agent_step_loop: agentStepLoop });

    expect(result.audit).toMatchObject({
      allowed: true,
      reason: "agent_step_decision_backed",
      selected_capabilities: expect.arrayContaining(["docs-viewer.open_doc"]),
      envelope_action_keys: expect.arrayContaining(["docs-viewer.open_doc"]),
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(result.executableEnvelope).toBe(actionEnvelope);
  });

  it("admits Codex calculator gateway solve projections when backed by gateway receipts", () => {
    const actionEnvelope = {
      schema: "helix.ask.action_envelope.v1",
      governance: {
        dispatch: "allow",
        reason: "admitted_non_mutating_codex_workstation_action",
      },
      workstation_actions: [
        {
          schema_version: "helix.workstation.action/v1",
          action: "run_panel_action",
          panel_id: "scientific-calculator",
          action_id: "show_gateway_solve",
          args: {
            expression: "6*7",
            normalized_expression: "6*7",
            result: "42",
            source_capability: "scientific-calculator.solve_expression",
            observation_ref: "ask:test:scientific-calculator.solve_expression",
          },
        },
      ],
    } as never;

    const result = buildHelixActionEnvelopeRuntimeAuthority(actionEnvelope, {
      workstation_gateway_call_results: [
        {
          capability_id: "scientific-calculator.show_gateway_solve",
          ok: true,
          gateway_admission: {
            requested_capability: "scientific-calculator.show_gateway_solve",
          },
        },
      ],
    });

    expect(result.audit).toMatchObject({
      allowed: true,
      reason: "agent_step_decision_backed",
      selected_capabilities: expect.arrayContaining(["scientific-calculator.show_gateway_solve"]),
      envelope_action_keys: expect.arrayContaining(["scientific-calculator.show_gateway_solve"]),
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(result.executableEnvelope).toBe(actionEnvelope);
  });

  it("does not admit Codex calculator panel projections from blocked gateway receipts", () => {
    const actionEnvelope = {
      schema: "helix.ask.action_envelope.v1",
      governance: {
        dispatch: "allow",
        reason: "admitted_non_mutating_codex_workstation_action",
      },
      workstation_actions: [
        {
          schema_version: "helix.workstation.action/v1",
          action: "run_panel_action",
          panel_id: "scientific-calculator",
          action_id: "show_gateway_solve",
          args: {
            expression: "6*7",
            result: "42",
          },
        },
      ],
    } as never;

    const result = buildHelixActionEnvelopeRuntimeAuthority(actionEnvelope, {
      workstation_gateway_call_results: [
        {
          capability_id: "scientific-calculator.show_gateway_solve",
          ok: false,
          gateway_admission: {
            requested_capability: "scientific-calculator.show_gateway_solve",
            blocked_reason: "calculator_gateway_solve_observation_missing",
          },
        },
      ],
    });

    expect(result.audit).toMatchObject({
      allowed: false,
      reason: "agent_step_decision_missing_for_action_envelope",
      selected_capabilities: [],
      envelope_action_keys: expect.arrayContaining(["scientific-calculator.show_gateway_solve"]),
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(result.executableEnvelope).toBeUndefined();
  });

  it("parses compact Codex Markdown bullets through the final-answer renderer contract", () => {
    expect(parseHelixAskFinalAnswerBulletLine("-NHM2 remains claim-bounded.")).toBe("NHM2 remains claim-bounded.");
    expect(parseHelixAskFinalAnswerBulletLine("- NHM2 remains claim-bounded.")).toBe("NHM2 remains claim-bounded.");
    expect(parseHelixAskFinalAnswerBulletLine("-**Document Evidence**")).toBe("**Document Evidence**");
    expect(parseHelixAskFinalAnswerBulletLine("- **Document Evidence**")).toBe("**Document Evidence**");
    expect(parseHelixAskFinalAnswerBulletLine("NHM2 remains claim-bounded.")).toBeNull();
  });

  it("renders public commentary rows before generic lifecycle rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-public-commentary",
      question: "GR light cones and refraction",
      content: "Final answer",
      debug: {
        public_commentary_timeline: [
          {
            schema: "helix.ask_public_commentary_event.v1",
            event_id: "public-commentary-1",
            turn_id: "turn-public-commentary",
            trace_id: "turn-public-commentary",
            timing: "turn_start",
            status: "thinking",
            text: "I'm separating this into GR light cones, material refraction, and spacetime geometry.",
            evidence_refs: ["turn-public-commentary:prompt_interpretation"],
            certainty_class: "hypothesis",
            assistant_answer: false,
            raw_reasoning_included: false,
          },
        ],
        turn_transcript_events: [
          {
            role: "agent",
            type: "work_delta",
            status: "running",
            text: "Starting Helix Ask turn.",
          },
          {
            role: "system",
            type: "turn_completed",
            status: "completed",
            step_id: "model_only_reasoning",
            text: "Completed step model_only_reasoning.",
          },
        ],
      },
    } as never);

    expect(rows[0]?.text).toContain("GR light cones");
    expect(rows.map((row) => row.text).join("\n")).not.toContain("Starting Helix Ask turn");
    expect(rows.map((row) => row.text).join("\n")).not.toContain("Completed step model_only_reasoning");
    expect(rows.map((row) => row.text).join("\n")).not.toMatch(/turn_purpose|why_this_capability|observation_summary/);
  });

  it("renders compound calculator public commentary before stale procedural rows", () => {
    const rows = buildHelixTurnTranscriptRows({
      id: "reply-public-commentary-calculator",
      question: "compute photon energy for 500 nm in joules and eV",
      content: "Final answer",
      debug: {
        public_commentary_timeline: [
          {
            schema: "helix.ask_public_commentary_event.v1",
            event_id: "public-commentary-calc-plan",
            turn_id: "turn-public-commentary-calculator",
            trace_id: "turn-public-commentary-calculator",
            timing: "before_step",
            status: "using_tool",
            text: "I'm treating this as a calculator-backed problem with numeric receipts and an explanation.",
            evidence_refs: ["turn-public-commentary-calculator:calculator_compound_plan"],
            certainty_class: "hypothesis",
            assistant_answer: false,
            raw_reasoning_included: false,
          },
          {
            schema: "helix.ask_public_commentary_event.v1",
            event_id: "public-commentary-calc-validation",
            turn_id: "turn-public-commentary-calculator",
            trace_id: "turn-public-commentary-calculator",
            timing: "after_step",
            status: "checking",
            text: "The calculator receipts passed quantity and unit validation.",
            evidence_refs: ["calculator_result_validation:photon_energy_ev"],
            certainty_class: "reasoned",
            assistant_answer: false,
            raw_reasoning_included: false,
          },
        ],
        turn_transcript_events: [
          {
            role: "agent",
            type: "work_delta",
            status: "running",
            text: "Starting Helix Ask turn.",
          },
          {
            role: "system",
            type: "turn_completed",
            status: "completed",
            step_id: "calculator_compound_3_calculator_subgoal_receipt",
            text: "Completed step calculator_compound_3_calculator_subgoal_receipt.",
          },
        ],
        agent_runtime_loop: {
          schema: "helix.agent_runtime_loop.v1",
          iterations: [
            {
              next_step: "next_action",
              chosen_capability: "scientific-calculator.solve_expression",
              decision_authority: "llm",
              observed_artifact_refs: ["calculator_subgoal_receipt:photon_energy_j"],
            },
          ],
        },
      },
    } as never);
    const text = rows.map((row) => row.text).join("\n");

    expect(rows[0]?.text).toContain("calculator-backed");
    expect(text).toContain("quantity and unit validation");
    expect(text).not.toContain("Starting Helix Ask turn");
    expect(text).not.toContain("Completed step calculator_compound_3_calculator_subgoal_receipt");
    expect(text).not.toMatch(/calculator_subgoal_receipt:photon_energy_j|calculator_result_validation:photon_energy_ev/);
  });

  it("renders causal timeline events as public transparency rows without raw answer content", () => {
    const rows = buildHelixCausalTurnTraceRows({
      id: "reply-causal",
      question: "open docs",
      content: "Opened docs.",
      debug: {
        causal_turn_timeline: {
          schema: "helix.causal_turn_timeline.v1",
          turn_id: "turn-causal",
          assistant_answer: false,
          raw_content_included: false,
          integrity: {
            ok: false,
            missing_created_by_event_refs: [],
            terminal_without_selected_event: false,
            visible_without_terminal_event: false,
            stale_route_label_detected: true,
            deterministic_fallback_without_rule_id: false,
          },
          events: [
            {
              schema: "helix.causal_turn_event.v1",
              turn_id: "turn-causal",
              event_id: "evt-1",
              sequence: 1,
              stage: "prompt_received",
              producer: "user",
              input_refs: [],
              output_refs: ["prompt:hash"],
              status: "succeeded",
              public_summary: "Prompt was received.",
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.causal_turn_event.v1",
              turn_id: "turn-causal",
              event_id: "evt-2",
              sequence: 2,
              stage: "tool_observation_created",
              producer: "runtime_tool",
              input_refs: ["tool_call:docs"],
              output_refs: ["observation:docs"],
              status: "succeeded",
              selected_capability: "docs-viewer.open_doc_by_path",
              public_summary: "Docs tool produced an observation.",
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.causal_turn_event.v1",
              turn_id: "turn-causal",
              event_id: "evt-3",
              sequence: 3,
              stage: "terminal_artifact_selected",
              producer: "terminal_authority",
              input_refs: ["observation:docs"],
              output_refs: ["terminal:typed_failure"],
              status: "failed",
              reason_code: "stale_route_label",
              terminal: { selected_terminal_artifact_kind: "typed_failure" },
              rejected: [{ artifact_kind: "direct_answer", reason: "stale_route_label" }],
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
        },
      },
    } as never);

    const combined = rows
      .map((row: { label: string; text: string; meta: string }) => `${row.label}: ${row.text} ${row.meta}`)
      .join("\n");
    expect(combined).toContain("Observation: Docs tool produced an observation");
    expect(combined).toContain("Notice: Selected typed failure");
    expect(combined).toContain("stale route label");
    expect(combined).not.toContain("Prompt was received");
    expect(rows.some((row: { status: string }) => row.status === "failed")).toBe(true);
  });

  it("renders a procedural workspace timeline from the turn truth table", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const proceduralTimeline = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskProceduralTimeline.tsx"),
      "utf8",
    );
    const proceduralTimelineSlot = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyProceduralTimelineSlot.tsx"),
      "utf8",
    );
    const proceduralTimelineProjection = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskLegacyProceduralTimelineProjection.tsx"),
      "utf8",
    );
    expect(source).not.toContain("function renderProceduralTurnTimeline");
    expect(source).not.toContain("<HelixAskProceduralTimeline");
    expect(source).not.toContain("<HelixAskLegacyProceduralTimelineSlot");
    expect(source).not.toContain("renderHelixAskLegacyProceduralTimeline");
    expect(proceduralTimelineProjection).toContain("reply.debug?.turn_truth_table");
    expect(proceduralTimelineProjection).toContain("ui_answer_equals_terminal_authority_text");
    expect(proceduralTimelineProjection).toContain("replyRecord?.agent_runtime_loop");
    expect(proceduralTimelineProjection).toContain("executed_action_key");
    expect(proceduralTimelineProjection).toContain("<HelixAskLegacyProceduralTimelineSlot");
    expect(proceduralTimeline).toContain("Procedural workspace timeline");
    expect(proceduralTimeline).toContain("backend terminal == visible answer");
    expect(proceduralTimelineSlot).toContain("<HelixAskProceduralTimeline {...props} />");
    expect(proceduralTimelineProjection).toContain("Appended step:");
    expect(proceduralTimelineProjection).toContain("planned");
    expect(proceduralTimelineProjection).toContain("completed");
    expect(source).toContain("suppressed");
    expect(source).toContain("pending_input");
    expect(source).toContain("failed");
    expect(source).toContain("TURN TRUTH TABLE");
  });

  it("normalizes jump-over navigation before workstation parsing", () => {
    const source = fs.readFileSync(pillPath, "utf8");
    const commandTextSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/lib/helix/ask-workstation-command-text.ts"),
      "utf8",
    );
    expect(source).toContain('from "@/lib/helix/ask-workstation-command-text"');
    expect(commandTextSource).toContain('.replace(/\\bjump\\s+(?:over\\s+)?to\\b/gi, "go to")');
  });
});

describe("HelixAskPill mic helper behavior", () => {
  it("auto-speaks sealed final answers when the voice lane is armed", () => {
    expect(
      shouldAutoSpeakAnswerForTurn({
        micArmState: "on",
        inputSource: "manual",
        voiceMode: "standard",
        answerAuthority: "final",
        toolIntent: "none",
        finalTimelineType: "reasoning_final",
      }),
    ).toBe(true);
    expect(
      shouldAutoSpeakAnswerForTurn({
        micArmState: "off",
        inputSource: "voice_auto",
        answerAuthority: "sealed_final",
        toolIntent: "none",
        finalTimelineType: "reasoning_final",
      }),
    ).toBe(true);
    expect(
      shouldAutoSpeakAnswerForTurn({
        micArmState: "on",
        inputSource: "manual",
        answerAuthority: "final",
        toolIntent: "workspace_terminal_summary",
        finalTimelineType: "workspace_terminal_summary",
      }),
    ).toBe(true);
  });

  it("keeps automatic answer narration out of muted, non-final, and tool-only turns", () => {
    const base = {
      micArmState: "on" as const,
      inputSource: "voice_auto" as const,
      answerAuthority: "final" as const,
      finalTimelineType: "reasoning_final",
    };

    expect(shouldAutoSpeakAnswerForTurn({ ...base, micArmState: "off" })).toBe(true);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, micArmState: "off", inputSource: "manual" })).toBe(false);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, userMuted: true })).toBe(false);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, answerAuthority: "provisional" })).toBe(false);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, toolIntent: "tool_only" })).toBe(false);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, toolIntent: "explicit_voice_tool" })).toBe(false);
    expect(shouldAutoSpeakAnswerForTurn({ ...base, finalTimelineType: "action_receipt" })).toBe(false);
  });

  it("preserves authoritative terminal answers over stale client evidence-gate fallbacks", () => {
    expect(
      shouldPreserveAuthoritativeTerminalOverEvidenceGate({
        evidenceGateBlocked: true,
        dispatchPolicy: "direct_answer_only",
        routeReasonCode: "conversation:simple",
        hasTerminalText: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveAuthoritativeTerminalOverEvidenceGate({
        evidenceGateBlocked: true,
        dispatchPolicy: "workspace_only",
        routeReasonCode: "dispatch:act",
        hasCompletedWorkspaceTool: true,
        hasTerminalText: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveAuthoritativeTerminalOverEvidenceGate({
        evidenceGateBlocked: true,
        dispatchPolicy: "direct_answer_only",
        routeReasonCode: "conversation:simple",
        hasTerminalText: true,
        hasPendingRequest: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveAuthoritativeTerminalOverEvidenceGate({
        evidenceGateBlocked: true,
        dispatchPolicy: "workspace_only",
        routeReasonCode: "dispatch:act",
        hasCompletedWorkspaceTool: false,
        hasTerminalText: true,
      }),
    ).toBe(false);
    expect(
      shouldPreserveAuthoritativeTerminalOverEvidenceGate({
        evidenceGateBlocked: true,
        finalAnswerSource: "typed_failure",
        terminalArtifactKind: "typed_failure",
        hasTerminalText: true,
        serverAuthoritativeTerminal: true,
      }),
    ).toBe(true);
  });

  it("suppresses voice playback for pending and failed terminal states", () => {
    expect(
      shouldSuppressVoiceForTerminalState({
        dispatchPolicy: "needs_user_input",
        routeReasonCode: "clarify:missing_args",
        hasPendingRequest: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressVoiceForTerminalState({
        dispatchPolicy: "direct_answer_only",
        routeReasonCode: "conversation:simple",
        terminalKind: "final_failure",
      }),
    ).toBe(true);
    expect(
      shouldSuppressVoiceForTerminalState({
        dispatchPolicy: "direct_answer_only",
        routeReasonCode: "conversation:simple",
        finalAnswerSource: "typed_failure",
      }),
    ).toBe(true);
    expect(
      shouldSuppressVoiceForTerminalState({
        dispatchPolicy: "direct_answer_only",
        routeReasonCode: "conversation:simple",
        terminalKind: "final_answer",
      }),
    ).toBe(false);
  });

  it("defaults every fresh voice session to disarmed", () => {
    expect(resolveInitialMicArmState()).toBe("off");
  });

  it("formats read-aloud as a start-stop toggle", () => {
    expect(shouldStopReadAloudOnButtonPress("idle")).toBe(false);
    expect(shouldStopReadAloudOnButtonPress("loading")).toBe(true);
    expect(shouldStopReadAloudOnButtonPress("playing")).toBe(false);
    expect(formatReadAloudButtonLabel("idle")).toBe("Read aloud");
    expect(formatReadAloudButtonLabel("loading")).toBe("Loading read-aloud");
    expect(formatReadAloudButtonLabel("playing")).toBe("Pause read-aloud");
    expect(formatReadAloudButtonLabel("paused")).toBe("Resume read-aloud");
    expect(formatReadAloudButtonLabel("unavailable")).toBe("Read aloud unavailable");
    expect(formatReadAloudButtonLabel("error")).toBe("Retry read-aloud");
  });

  it("maps manual read-aloud into a final manual voice playback task", () => {
    const intent = buildManualReadAloudVoiceIntent({
      text: "Read this answer aloud.",
      replyId: "reply-1",
      traceId: "trace-1",
    });
    const task = mapVoicePlaybackIntentToTask(intent);

    expect(intent).toMatchObject({
      kind: "manual_read_aloud",
      authority: "final",
      source: "manual",
      turnKey: "manual:reply-1",
      revision: 1,
      eventId: "reply-1",
      replyId: "reply-1",
      traceId: "trace-1",
    });
    expect(task).toMatchObject({
      kind: "manual_read_aloud",
      authority: "final",
      source: "manual",
      replyId: "reply-1",
      turnKey: "manual:reply-1",
      revision: 1,
    });
    expect(task.key).toContain("manual_read_aloud");
    expect(task.key).toContain("reply-1");
  });

  it("preserves latched voice-session final answer playback intent", () => {
    const task = mapVoicePlaybackIntentToTask({
      kind: "final",
      authority: "final",
      source: "agent_loop",
      turnKey: "ask:turn-1",
      revision: 2,
      text: "Final answer from the direct ask path.",
      traceId: "ask:turn-1",
      eventId: "reply-2",
      replyId: "reply-2",
      allowMicOffPlayback: true,
      briefSource: "none",
      finalSource: "normal_reasoning",
    });

    expect(task).toMatchObject({
      kind: "final",
      authority: "final",
      source: "agent_loop",
      turnKey: "ask:turn-1",
      replyId: "reply-2",
      allowMicOffPlayback: true,
    });
  });

  const interimVoiceToolResult = (overrides: {
    kind?: string;
    text?: string;
    turnId?: string;
    requestId?: string;
    receiptId?: string;
    utteranceId?: string;
    status?: string;
    requestAuthority?: Partial<Record<string, unknown>>;
    receiptAuthority?: Partial<Record<string, unknown>>;
  } = {}) => ({
    schema: "helix.interim_voice_callout_tool_result.v1",
    request: {
      artifactId: "helix_interim_voice_callout_request",
      requestId: overrides.requestId ?? "request:interim:1",
      turnId: overrides.turnId ?? "turn:interim:1",
      kind: overrides.kind ?? "immediate_ack",
      text: overrides.text ?? "Okay, I will check that now.",
      voicePlaybackKind: overrides.kind === "translation_relay" ? "translation_relay" : "tool_receipt",
      authority: "provisional",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      ...overrides.requestAuthority,
    },
    receipt: {
      artifactId: "helix_interim_voice_callout_receipt",
      receiptId: overrides.receiptId ?? "receipt:interim:1",
      requestId: overrides.requestId ?? "request:interim:1",
      status: overrides.status ?? "awaiting_client_playback",
      delivery: {
        utteranceId: overrides.utteranceId ?? "utterance:interim:1",
        playbackConfirmationRequired: true,
        playbackAuthority: "client_runtime_required",
        playbackStatus: "awaiting_client_receipt",
      },
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      ...overrides.receiptAuthority,
    },
    post_tool_model_step_required: true,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  });

  it("maps client-playback handoff immediate ack receipts into provisional tool-receipt playback", () => {
    const intents = collectInterimVoiceCalloutPlaybackIntents({
      artifacts: [
        {
          debug: {
            nested: interimVoiceToolResult({
              text: "Okay, I will look into this.",
              turnId: "turn:voice:1",
              receiptId: "receipt:voice:ack",
              utteranceId: "utterance:voice:ack",
            }),
          },
        },
      ],
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "tool_receipt",
      authority: "provisional",
      source: "agent_loop",
      turnKey: "turn:voice:1",
      traceId: "turn:voice:1",
      eventId: "receipt:voice:ack",
      receiptKey: "utterance:voice:ack",
      calloutKind: "immediate_ack",
      text: "Okay, I will look into this.",
    });
    expect(mapVoicePlaybackIntentToTask(intents[0]!)).toMatchObject({
      kind: "tool_receipt",
      authority: "provisional",
      source: "agent_loop",
      turnKey: "turn:voice:1",
      eventId: "receipt:voice:ack",
    });
  });

  it("maps steering acknowledgement receipts into provisional tool-receipt playback", () => {
    const intents = collectInterimVoiceCalloutPlaybackIntents({
      artifacts: [
        interimVoiceToolResult({
          kind: "steering_ack",
          text: "I heard the correction. I'll apply it after this step.",
          turnId: "turn:voice:steering",
          requestId: "request:voice:steering",
          receiptId: "receipt:voice:steering",
          utteranceId: "utterance:voice:steering",
        }),
      ],
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "tool_receipt",
      authority: "provisional",
      source: "agent_loop",
      turnKey: "turn:voice:steering",
      eventId: "receipt:voice:steering",
      receiptKey: "utterance:voice:steering",
      calloutKind: "steering_ack",
      text: "I heard the correction. I'll apply it after this step.",
    });
  });

  it("does not dedupe steering acknowledgements because an immediate ack already played", () => {
    const intents = collectInterimVoiceCalloutPlaybackIntents({
      artifacts: [
        interimVoiceToolResult({
          turnId: "turn:voice:steering-dedupe",
          receiptId: "receipt:ack:steering-dedupe",
          utteranceId: "utterance:ack:steering-dedupe",
          kind: "immediate_ack",
        }),
        interimVoiceToolResult({
          turnId: "turn:voice:steering-dedupe",
          requestId: "request:steering-ack:1",
          receiptId: "receipt:steering-ack:1",
          utteranceId: "utterance:steering-ack:1",
          kind: "steering_ack",
          text: "I heard the correction. I'll apply it after this step.",
        }),
      ],
    });

    expect(intents.map((intent) => intent.calloutKind)).toEqual(["immediate_ack", "steering_ack"]);
    expect(intents.map((intent) => intent.receiptId)).toEqual([
      "receipt:ack:steering-dedupe",
      "receipt:steering-ack:1",
    ]);
  });

  it("dedupes duplicate immediate ack receipts while allowing later progress receipts", () => {
    const intents = collectInterimVoiceCalloutPlaybackIntents({
      artifacts: [
        interimVoiceToolResult({
          turnId: "turn:voice:dedupe",
          receiptId: "receipt:ack:1",
          utteranceId: "utterance:ack:1",
          kind: "immediate_ack",
        }),
        interimVoiceToolResult({
          turnId: "turn:voice:dedupe",
          receiptId: "receipt:ack:2",
          utteranceId: "utterance:ack:2",
          kind: "immediate_ack",
          text: "Still starting.",
        }),
        interimVoiceToolResult({
          turnId: "turn:voice:dedupe",
          requestId: "request:progress:1",
          receiptId: "receipt:progress:1",
          utteranceId: "utterance:progress:1",
          kind: "tool_progress",
          text: "I found the live-source mailbox and I am checking it.",
        }),
      ],
    });

    expect(intents.map((intent) => intent.calloutKind)).toEqual(["immediate_ack", "tool_progress"]);
    expect(intents.map((intent) => intent.receiptId)).toEqual(["receipt:ack:1", "receipt:progress:1"]);
  });

  it("ignores already spoken receipts and unsafe terminal-authority receipts", () => {
    const intents = collectInterimVoiceCalloutPlaybackIntents({
      spokenReceiptKeys: ["utterance:already"],
      spokenImmediateAckTurnKeys: ["turn:ack:already"],
      artifacts: [
        interimVoiceToolResult({
          turnId: "turn:ack:already",
          receiptId: "receipt:ack:already",
          utteranceId: "utterance:ack:already",
          kind: "immediate_ack",
        }),
        interimVoiceToolResult({
          receiptId: "receipt:already",
          utteranceId: "utterance:already",
          kind: "tool_progress",
        }),
        interimVoiceToolResult({
          requestId: "request:unsafe",
          receiptId: "receipt:unsafe",
          utteranceId: "utterance:unsafe",
          kind: "tool_progress",
          requestAuthority: {
            assistant_answer: true,
          },
        }),
        interimVoiceToolResult({
          requestId: "request:terminal",
          receiptId: "receipt:terminal",
          utteranceId: "utterance:terminal",
          kind: "tool_progress",
          receiptAuthority: {
            terminal_eligible: true,
          },
        }),
      ],
    });

    expect(intents).toEqual([]);
  });

  it("parses close-this-panel phrasing into close_active_panel action", () => {
    expect(parseWorkstationActionCommand("close this panel")).toEqual({ action: "close_active_panel" });
    expect(parseWorkstationActionCommand("close doc")).toEqual({ action: "close_active_panel" });
    expect(parseWorkstationActionCommand("can you close this panel for me")).toEqual({
      action: "close_active_panel",
    });
    expect(parseWorkstationActionCommand("close this doc")).toEqual({ action: "close_active_panel" });
    expect(parseWorkstationActionCommand("please close this document")).toEqual({
      action: "close_active_panel",
    });
  });

  it("routes doc intent questions to explain_paper workstation action", () => {
    expect(parseWorkstationActionCommand("what does this doc do?")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "explain_paper",
      args: undefined,
    });
  });

  it("maps copy-docs-to-notes compare requests to observable research workflow jobs", () => {
    const action = parseWorkstationActionCommand(
      "Copy sections about quantum inequalities in docs and paste in notes mission-notes, then compare the topics for an explanation",
    );
    expect(action).not.toBeNull();
    expect(action?.action).toBe("run_job");
    if (action?.action !== "run_job") return;
    expect(action.payload.workflow).toBe("observable_research_pipeline");
    const workflowArgs = (action.payload.workflow_args ?? {}) as Record<string, unknown>;
    expect(String(workflowArgs.topic ?? "")).toContain("quantum inequalities");
    expect(String(workflowArgs.note_title ?? "")).toContain("mission-notes");
    expect(String(workflowArgs.compare_instruction ?? "").toLowerCase()).toContain("compare");
  });

  it("builds deterministic two-step workstation chains for copy-then-compare prompts", () => {
    const chain = parseWorkstationActionChainCommand(
      "copy this abstract to a note pad called Mission Notes and compare with current doc",
    );
    expect(chain).not.toBeNull();
    expect(Array.isArray(chain)).toBe(true);
    if (!Array.isArray(chain)) return;
    expect(chain).toHaveLength(2);
    expect(chain[0]?.action).toBe("run_panel_action");
    if (chain[0]?.action === "run_panel_action") {
      expect(chain[0].panel_id).toBe("workstation-clipboard-history");
      expect(chain[0].action_id).toBe("copy_selection_to_note");
    }
    expect(chain[1]?.action).toBe("run_job");
    if (chain[1]?.action === "run_job") {
      expect(chain[1].payload.workflow).toBe("observable_research_pipeline");
      const workflowArgs = (chain[1].payload.workflow_args ?? {}) as Record<string, unknown>;
      expect(String(workflowArgs.chain_signature ?? "")).toContain("copy_selection_to_note");
      expect(String(workflowArgs.compare_basis ?? "")).toBe("current_doc");
    }
  });

  it("routes deictic read-this-doc prompts to open_doc_and_read using active docs context", () => {
    useDocViewerStore.getState().viewDoc("/docs/papers.md");
    expect(parseWorkstationActionCommand("ok read this doc to me")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc_and_read",
      args: { path: "docs/papers.md" },
    });
    expect(parseWorkstationActionCommand("ok read this file to me")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc_and_read",
      args: { path: "docs/papers.md" },
    });
    expect(parseWorkstationActionCommand("read this doc outloud")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc_and_read",
      args: { path: "docs/papers.md" },
    });
    expect(parseWorkstationActionCommand("read this document aloud")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc_and_read",
      args: { path: "docs/papers.md" },
    });
  });

  it("routes latest-topic doc prompts to deterministic docs-viewer actions", () => {
    const pickLatest = parseWorkstationActionCommand("ok pick the latest NHM2 doc");
    expect(pickLatest?.action).toBe("run_panel_action");
    if (pickLatest?.action !== "run_panel_action") return;
    expect(pickLatest.panel_id).toBe("docs-viewer");
    expect(pickLatest.action_id).toBe("open_latest_doc_by_topic");
    expect((pickLatest.args as { topic?: string } | undefined)?.topic).toMatch(/nhm2/i);

    const viewLatest = parseWorkstationActionCommand("ok view the latest NHM2 doc");
    expect(viewLatest?.action).toBe("run_panel_action");
    if (viewLatest?.action !== "run_panel_action") return;
    expect(viewLatest.panel_id).toBe("docs-viewer");
    expect(viewLatest.action_id).toBe("open_latest_doc_by_topic");
    expect((viewLatest.args as { topic?: string } | undefined)?.topic).toMatch(/nhm2/i);

    const pullLatestToday = parseWorkstationActionCommand("Ok pull up the latest NHM2 doc from today");
    expect(pullLatestToday?.action).toBe("run_panel_action");
    if (pullLatestToday?.action !== "run_panel_action") return;
    expect(pullLatestToday.panel_id).toBe("docs-viewer");
    expect(pullLatestToday.action_id).toBe("open_latest_doc_by_topic");
    expect((pullLatestToday.args as { topic?: string } | undefined)?.topic).toMatch(/nhm2/i);

    const popLatestToday = parseWorkstationActionCommand("Ok pop open the latest NHM2 document from today");
    expect(popLatestToday?.action).toBe("run_panel_action");
    if (popLatestToday?.action !== "run_panel_action") return;
    expect(popLatestToday.panel_id).toBe("docs-viewer");
    expect(popLatestToday.action_id).toBe("open_latest_doc_by_topic");
    expect((popLatestToday.args as { topic?: string } | undefined)?.topic).toMatch(/nhm2/i);
  });

  it("maps notes lexicon utterances to deterministic panel actions", () => {
    expect(parseWorkstationActionCommand("create a note called Warp Notes")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "create_note",
      args: { title: "Warp Notes", topic: "Warp Notes" },
    });
    expect(parseWorkstationActionCommand("new note Casimir capture")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "create_note",
      args: { title: "Casimir capture", topic: "Casimir capture" },
    });
    expect(parseWorkstationActionCommand('make a note for me "qwerty"')).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "create_note",
      args: { body: "qwerty" },
    });
    expect(parseWorkstationActionCommand("add to note Mission Log: Track quantum inequality bounds")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "append_to_note",
      args: { title: "Mission Log", text: "Track quantum inequality bounds" },
    });
    expect(parseWorkstationActionCommand("append centerline alpha notes to note Mission Log")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "append_to_note",
      args: { title: "Mission Log", text: "centerline alpha notes" },
    });
    expect(parseWorkstationActionCommand("rename note Mission Log to Mission Log v2")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "rename_note",
      args: { from_title: "Mission Log", title: "Mission Log v2" },
    });
    expect(parseWorkstationActionCommand("delete note Mission Log v2")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "delete_note",
      args: { title: "Mission Log v2" },
    });
    expect(parseWorkstationActionCommand("list my notes")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-notes",
      action_id: "list_notes",
      args: undefined,
    });
    expect(parseWorkstationActionCommand("Ok can you copy this abstract to a note pad")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "copy_selection_to_note",
      args: { note_title: undefined },
    });
  });

  it("maps clipboard lexicon utterances to deterministic panel actions", () => {
    expect(parseWorkstationActionCommand("read clipboard")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "read_clipboard",
      args: undefined,
    });
    expect(parseWorkstationActionCommand("copy this to clipboard: NHM2 complete")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "write_clipboard",
      args: { text: "NHM2 complete" },
    });
    expect(parseWorkstationActionCommand("clear clipboard history")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "clear_history",
      args: undefined,
    });
    expect(parseWorkstationActionCommand("copy latest clipboard entry to note Mission Notes")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "copy_receipt_to_note",
      args: { note_title: "Mission Notes" },
    });
  });

  it("resolves capability alias actions with no required args", () => {
    expect(parseWorkstationActionCommand("show docs directory")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_directory",
      args: undefined,
    });
    expect(parseWorkstationActionCommand("view clipboard history")).toEqual({
      action: "run_panel_action",
      panel_id: "workstation-clipboard-history",
      action_id: "open",
      args: undefined,
    });
  });

  it("does not map ambiguous note phrasing into mutating lexicon actions", () => {
    expect(parseWorkstationActionCommand("note this might be useful later")).toBeNull();
    expect(parseWorkstationActionCommand("clipboard maybe has something")).toBeNull();
  });

  it("derives observer dispatch plans for chat/workspace/reasoning combinations", () => {
    expect(
      deriveObserverDispatchPlan({
        question: "close the docs",
        workstationAction: { action: "close_active_panel" },
      }),
    ).toMatchObject({
      intent_type: "chat_plus_workspace",
      dispatch_plan: "workspace",
      should_dispatch_workspace: true,
      should_dispatch_reasoning: false,
      should_stay_conversational: true,
    });
    expect(
      deriveObserverDispatchPlan({
        question: "open the latest nhm2 doc and explain it in plain language",
        workstationAction: {
          action: "run_panel_action",
          panel_id: "docs-viewer",
          action_id: "open_doc",
        },
      }),
    ).toMatchObject({
      intent_type: "chat_plus_workspace_plus_reasoning",
      dispatch_plan: "workspace+reasoning",
      should_dispatch_workspace: true,
      should_dispatch_reasoning: true,
    });
    expect(
      deriveObserverDispatchPlan({
        question: "explain this section in simpler terms",
        workstationAction: null,
      }),
    ).toMatchObject({
      intent_type: "chat_plus_reasoning",
      dispatch_plan: "reasoning",
      should_dispatch_workspace: false,
      should_dispatch_reasoning: true,
    });
  });

  it("planner contract blocks accidental docs explain actionization on pasted abstract prompts", () => {
    const contract = deriveHelixPlannerContract({
      question:
        "In this paper we analyze quantum horizon structure across multiple manifolds.\nThe abstract derives a constrained variance regime with nontrivial curvature transport.\nWhat does this abstract mean in plain language?",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "explain_paper",
      },
    });
    expect(contract.planner_blocked_workstation).toBe(true);
    expect(contract.workstation_action).toBeNull();
    expect(contract.dispatch_plan.dispatch_plan).toBe("reasoning");
    expect(contract.intent_kind).toBe("conversational_explain");
  });

  it("planner contract keeps explicit workstation commands actionable", () => {
    const contract = deriveHelixPlannerContract({
      question: "Open the docs and explain this paper",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "explain_paper",
      },
    });
    expect(contract.planner_blocked_workstation).toBe(false);
    expect(contract.workstation_action).not.toBeNull();
    expect(contract.dispatch_plan.should_dispatch_workspace).toBe(true);
  });

  it("planner contract keeps docs explain prompts workspace-owned even with hard reasoning cues", () => {
    const workspaceOwned = deriveHelixPlannerContract({
      question: "what does the abstract of this paper mean?",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "explain_paper",
      },
    });
    expect(workspaceOwned.dispatch_plan.dispatch_plan).toBe("workspace");
    expect(workspaceOwned.reasoning_required).toBe("none");

    const hardReasoning = deriveHelixPlannerContract({
      question: "verify and compare what this paper claims",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "explain_paper",
      },
    });
    expect(hardReasoning.dispatch_plan.should_dispatch_reasoning).toBe(false);
    expect(hardReasoning.reasoning_required).toBe("none");
  });

  it("freezes workspace_only dispatch policy unless explicit workspace_then_reasoning cue exists", () => {
    const workspaceOnly = resolveHelixDispatchPolicyAtTurnStart({
      question: "open the latest nhm2 doc and explain it",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
      },
    });
    expect(workspaceOnly).toBe("workspace_only");
    const contract = deriveHelixPlannerContract({
      question: "open the latest nhm2 doc and explain it",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
      },
      dispatchPolicy: workspaceOnly,
    });
    expect(contract.dispatch_plan.dispatch_plan).toBe("workspace");
    expect(contract.dispatch_plan.should_dispatch_reasoning).toBe(false);

    const explicitHybrid = resolveHelixDispatchPolicyAtTurnStart({
      question: "open the latest nhm2 doc and then explain it in the background",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
      },
    });
    expect(explicitHybrid).toBe("workspace_then_reasoning");
    const hybridContract = deriveHelixPlannerContract({
      question: "open the latest nhm2 doc and then explain it in the background",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
      },
      dispatchPolicy: explicitHybrid,
    });
    expect(hybridContract.dispatch_plan.dispatch_plan).toBe("workspace+reasoning");
  });

  it("classifies reasoning intent with typed classes for deterministic routing", () => {
    expect(classifyHelixReasoningIntent("verify these claims against evidence").intent_class).toBe(
      "hard_reasoning",
    );
    expect(classifyHelixReasoningIntent("explain the theory behind this result").intent_class).toBe(
      "research_synthesis",
    );
    expect(classifyHelixReasoningIntent("open the docs viewer").intent_class).toBe("simple_workspace_query");
    expect(classifyHelixReasoningIntent("hello").intent_class).toBe("simple_conversation");
  });

  it("marks lite social prompts as normal-turn conversation candidates", () => {
    expect(isSimpleConversationTurnCandidate("hello")).toBe(true);
    expect(isSimpleConversationTurnCandidate("thanks!")).toBe(true);
    expect(isSimpleConversationTurnCandidate("open the docs")).toBe(false);
    expect(isSimpleConversationTurnCandidate("compare these two docs")).toBe(false);
  });

  it("keeps summarize-doc prompts on summarize action (not read-aloud)", () => {
    expect(parseWorkstationActionCommand("ok summarize a doc about the sun to me")).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "summarize_doc",
      args: undefined,
    });
  });

  it("resolves open-doc plus summarize phrasing to docs summarize action", () => {
    const action = parseWorkstationActionCommand("okay open up a doc about the sun and summarize what it means");
    expect(action?.action).toBe("run_panel_action");
    if (action?.action !== "run_panel_action") return;
    expect(action.panel_id).toBe("docs-viewer");
    expect(action.action_id).toBe("summarize_doc");
    expect((action.args as { path?: string } | undefined)?.path).toBeTruthy();
  });

  it("resolves open-paper plus summarize phrasing to docs summarize action", () => {
    const action = parseWorkstationActionCommand(
      "okay open up a paper about the sun and summarize what it means",
    );
    expect(action?.action).toBe("run_panel_action");
    if (action?.action !== "run_panel_action") return;
    expect(action.panel_id).toBe("docs-viewer");
    expect(action.action_id).toBe("summarize_doc");
    expect((action.args as { path?: string } | undefined)?.path).toBeTruthy();
  });

  it("routes quoted open-doc title prompts through workstation docs actions", () => {
    const action = parseWorkstationActionCommand(
      'Ok open the doc "NHM2 Full Solve Overview v2 (Journal-Style Draft, 2026-04-23)"',
    );
    expect(action).not.toBeNull();
    if (action?.action === "run_panel_action") {
      expect(action.panel_id).toBe("docs-viewer");
      expect(action.action_id).toBe("open_doc");
      expect((action as { args?: { path?: string } }).args?.path).toBeTruthy();
    } else {
      expect(action).toEqual({
        action: "open_panel",
        panel_id: "docs-viewer",
      });
    }
  });

  it("does not let nhm2 topic hints override explicit direct-title open requests", () => {
    const action = parseWorkstationActionCommand(
      "ok open up the doc NHM2 Full Solve Overview v2 (Journal-Style Draft, 2026-04-23)",
    );
    expect(action?.action).toBe("run_panel_action");
    if (action?.action !== "run_panel_action") return;
    expect(action.panel_id).toBe("docs-viewer");
    expect(action.action_id).toBe("open_doc");
    expect((action.args as { path?: string } | undefined)?.path).toContain(
      "/docs/research/nhm2-full-solve-overview-v2-2026-04-23.md",
    );
  });

  it("builds deterministic observer plan delta events", () => {
    const dispatchPlan = deriveObserverDispatchPlan({
      question: "open the latest NHM2 doc and explain it",
      workstationAction: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
      },
      forceReasoningDispatch: true,
    });
    const event = buildObserverPlanDeltaEvent({
      source: "run_ask",
      dispatchPlan,
      question: "open the latest NHM2 doc and explain it",
    });
    expect(event.tool).toBe("helix.observer.plan");
    expect(event.text).toContain("observer plan update");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_plan_delta");
    expect(meta.dispatch_plan).toBe("workspace+reasoning");
    expect(meta.intent_type).toBe("chat_plus_workspace_plus_reasoning");
    expect(meta.source).toBe("run_ask");
  });

  it("builds deterministic observer plan item-completed events", () => {
    const dispatchPlan = deriveObserverDispatchPlan({
      question: "close the docs",
      workstationAction: { action: "close_active_panel" },
    });
    const event = buildObserverPlanItemCompletedEvent({
      source: "submit",
      dispatchPlan,
      item: "workspace_dispatched",
      question: "close the docs",
      action: { action: "close_active_panel" },
    });
    expect(event.tool).toBe("helix.observer.plan");
    expect(event.text).toContain("observer plan step complete");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_plan_item_completed");
    expect(meta.item).toBe("workspace_dispatched");
    expect(meta.dispatch_plan).toBe("workspace");
    expect(meta.source).toBe("submit");
  });

  it("builds deterministic observer finalization events", () => {
    const event = buildObserverFinalizationEvent({
      source: "run_ask",
      question: "compare the two docs and explain the difference",
      mode: "observe",
      certaintyClass: "reasoned",
      evidence_refs: ["docs/NHM2.md"],
      needs_retrieval: false,
      final_source: "normal_reasoning",
      answer_id: "answer-123",
      attempt_id: "attempt-123",
      traceId: "ask:trace-123",
      live_event_count: 7,
      debug_context: { policyPromptFamily: "general_overview" },
    });
    expect(event.tool).toBe("helix.observer.finalization");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_finalization");
    expect(meta.mode).toBe("observe");
    expect(meta.certainty_class).toBe("reasoned");
    expect(meta.answer_id).toBe("answer-123");
    expect(meta.live_event_count).toBe(7);
  });

  it("builds deterministic observer handoff events for retrieval-blocked claims", () => {
    const event = buildObserverHandoffEvent({
      source: "run_ask",
      question: "prove this from the docs",
      mode: "verify",
      certaintyClass: "unknown",
      evidence_refs: [],
      needs_retrieval: true,
      answer_id: "answer-234",
      attempt_id: "attempt-234",
      traceId: "ask:trace-234",
    });
    expect(event.tool).toBe("helix.observer.handoff");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_handoff");
    expect(meta.needs_retrieval).toBe(true);
    const actions = (meta.recommended_workspace_actions ?? []) as Array<Record<string, unknown>>;
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((entry) => entry.action_id === "open_doc")).toBe(true);
  });

  it("builds deterministic observer handoff events for grounded answers", () => {
    const event = buildObserverHandoffEvent({
      source: "voice_dispatch",
      question: "summarize this and align claims",
      mode: "observe",
      certaintyClass: "reasoned",
      evidence_refs: ["docs/NHM2.md", "docs/NHM2-appendix.md"],
      needs_retrieval: false,
      answer_id: "answer-345",
      attempt_id: "attempt-345",
      traceId: "ask:trace-345",
    });
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_handoff");
    const actions = (meta.recommended_workspace_actions ?? []) as Array<Record<string, unknown>>;
    expect(actions.some((entry) => entry.action_id === "append_to_note")).toBe(true);
    const followups = (meta.reasoning_followups ?? []) as string[];
    expect(followups.some((item) => /citation alignment/i.test(item))).toBe(true);
  });

  it("builds deterministic workstation procedural-step events", () => {
    const event = buildWorkstationProceduralStepEvent({
      source: "run_ask",
      step: 2,
      total: 2,
      action: {
        action: "run_job",
        payload: {
          workflow: "observable_research_pipeline",
        },
      },
      question: "copy this abstract to note and compare it",
    });
    expect(event.tool).toBe("helix.workstation.chain");
    expect(event.text).toContain("workstation step 2/2");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("workstation_procedural_step");
    expect(meta.step).toBe(2);
    expect(meta.total_steps).toBe(2);
    expect(meta.source).toBe("run_ask");
  });

  it("builds workstation request_user_input prompt for missing required args", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "submit",
      turn_id: "turn:submit:1",
      question: "append this to note mission",
      action: {
        action: "run_panel_action",
        panel_id: "workstation-notes",
        action_id: "append_to_note",
        args: { title: "mission" },
      },
    });
    expect(pending).not.toBeNull();
    expect(pending?.turn_id).toBe("turn:submit:1");
    expect(pending?.reason).toBe("missing_args");
    expect(pending?.missing_args).toContain("text");
    expect(pending?.prompt.toLowerCase()).toContain("i need text");
  });

  it("builds workstation request_user_input prompt for confirmation-required actions", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "run_ask",
      question: "delete note mission log",
      action: {
        action: "run_panel_action",
        panel_id: "workstation-notes",
        action_id: "delete_note",
        args: { title: "Mission Log" },
      },
    });
    expect(pending).not.toBeNull();
    expect(pending?.reason).toBe("confirmation_required");
    expect(pending?.prompt.toLowerCase()).toContain("reply yes");
  });

  it("requests clarification for ambiguous doc-topic resolution even when required args are present", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "submit",
      question: "open docs about foc",
      action: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
        args: {
          path: "/docs/research/focus-overview.md",
          _doc_resolution_status: "ambiguous",
          _doc_resolution_confidence: 0.31,
          _doc_resolution_topic: "foc",
          _doc_resolution_candidates: ["/docs/research/focus-overview.md", "/docs/research/foc-appendix.md"],
        },
      },
    });
    expect(pending).not.toBeNull();
    expect(pending?.reason).toBe("missing_args");
    expect(pending?.router_fail_id).toBe("RF_AMBIGUOUS_DOC_TOPIC");
    expect(pending?.missing_args).toContain("path");
    expect(pending?.doc_topic).toBe("foc");
    expect(pending?.doc_candidates).toEqual(["/docs/research/focus-overview.md", "/docs/research/foc-appendix.md"]);
    expect(pending?.prompt.toLowerCase()).toContain("multiple docs");
  });

  it("requests clarification for weak doc-topic resolution even when confidence appears high", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "submit",
      question: "open docs about foc",
      action: {
        action: "run_panel_action",
        panel_id: "docs-viewer",
        action_id: "open_doc",
        args: {
          path: "/docs/research/focus-overview.md",
          _doc_resolution_status: "weak",
          _doc_resolution_confidence: 0.91,
          _doc_resolution_topic: "foc",
          _doc_resolution_candidates: ["/docs/research/focus-overview.md"],
        },
      },
    });
    expect(pending).not.toBeNull();
    expect(pending?.reason).toBe("missing_args");
    expect(pending?.router_fail_id).toBe("RF_LOW_CONFIDENCE_DOC_RESOLUTION");
    expect(pending?.missing_args).toContain("path");
    expect(pending?.doc_topic).toBe("foc");
    expect(pending?.doc_candidates).toEqual(["/docs/research/focus-overview.md"]);
    expect(pending?.prompt.toLowerCase()).toContain("could not confidently resolve");
  });

  it("resolves pending workstation missing-arg requests from user reply", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "submit",
      question: "append to note mission",
      action: {
        action: "run_panel_action",
        panel_id: "workstation-notes",
        action_id: "append_to_note",
        args: { title: "Mission" },
      },
    });
    expect(pending).not.toBeNull();
    if (!pending) return;
    const resolved = resolvePendingWorkstationUserInput({
      pending,
      reply: "Track the NHM2 checkpoints",
    });
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved") return;
    expect(resolved.action.action).toBe("run_panel_action");
    if (resolved.action.action !== "run_panel_action") return;
    expect((resolved.action.args ?? {}).text).toBe("Track the NHM2 checkpoints");
  });

  it("resolves confirmation requests deterministically from yes/no replies", () => {
    const pending = buildWorkstationUserInputRequest({
      source: "submit",
      question: "clear clipboard history",
      action: {
        action: "run_panel_action",
        panel_id: "workstation-clipboard-history",
        action_id: "clear_history",
      },
    });
    expect(pending).not.toBeNull();
    if (!pending) return;
    const cancelled = resolvePendingWorkstationUserInput({
      pending,
      reply: "no",
    });
    expect(cancelled.status).toBe("cancelled");
    const confirmed = resolvePendingWorkstationUserInput({
      pending,
      reply: "yes",
    });
    expect(confirmed.status).toBe("resolved");
    if (confirmed.status !== "resolved") return;
    expect(confirmed.action.action).toBe("run_panel_action");
    if (confirmed.action.action !== "run_panel_action") return;
    expect((confirmed.action.args ?? {}).confirmed).toBe(true);
  });

  it("detects pending request turn transitions deterministically", () => {
    expect(
      isWorkstationTurnTransitionPendingRequest({
        pending_turn_id: "ask:turn_a",
        current_turn_id: "ask:turn_b",
      }),
    ).toBe(true);
    expect(
      isWorkstationTurnTransitionPendingRequest({
        pending_turn_id: "ask:turn_a",
        current_turn_id: "ask:turn_a",
      }),
    ).toBe(false);
    expect(
      isWorkstationTurnTransitionPendingRequest({
        pending_turn_id: "",
        current_turn_id: "ask:turn_b",
      }),
    ).toBe(false);
  });

  it("normalizes and rejects invalid terminal answer text", () => {
    expect(normalizeTerminalAnswerText(" \u00a0No final answer returned.  ")).toBe("No final answer returned.");
    expect(isInvalidTerminalAnswerText("")).toBe(true);
    expect(isInvalidTerminalAnswerText("No final answer returned.")).toBe(true);
    expect(isInvalidTerminalAnswerText("  grounded answer ready  ")).toBe(false);
  });

  it("registers exactly one terminal outcome per turn", () => {
    const registry: Record<string, "final_answer" | "final_failure"> = {};
    const first = registerTurnTerminalOutcome({
      registry,
      turn_id: "ask:turn_terminal_1",
      outcome: "final_answer",
    });
    const second = registerTurnTerminalOutcome({
      registry,
      turn_id: "ask:turn_terminal_1",
      outcome: "final_failure",
    });
    const missing = registerTurnTerminalOutcome({
      registry,
      turn_id: "",
      outcome: "final_answer",
    });
    expect(first.accepted).toBe(true);
    expect(first.existing).toBeNull();
    expect(second.accepted).toBe(false);
    expect(second.existing).toBe("final_answer");
    expect(missing.accepted).toBe(false);
    expect(missing.turn_id).toBeNull();
  });

  it("blocks hard-claim finalization when no evidence refs are present", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question: "compare these docs and prove which claim is correct",
      mode: "observe",
      debug: {},
      proof: undefined,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("hard_claim_without_evidence_refs");
    expect(decision.evidence_refs).toEqual([]);
  });

  it("does not turn literal quoted tool-name explanations into retrieval-gated hard claims", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        "The text says `internet-search.search_web`; explain that phrase as text only. Do not run internet search.",
      mode: "read",
      debug: {
        selected_final_answer:
          "`internet-search.search_web` is a capability or tool identifier, not an executed search in this prompt.",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: undefined,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.hard_claim).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it("does not retrieval-gate quoted translation payload claims", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        'translate to japanese "I don’t see a voice/speak-out-loud tool admitted for this turn. None of the listed capabilities is a voice callout or text-to-speech action where I can submit text to be spoken aloud. I can’t invoke it or claim anything was said out loud unless Helix exposes a voice capability and returns an action receipt/observation for it."',
      mode: "read",
      debug: {
        selected_final_answer:
          "このターンでは、音声／読み上げツールが許可されているようには見えません。",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: undefined,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.hard_claim).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it("does not retrieval-gate multiline quoted translation payloads with tool contract text", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        'translate to japanese "I donâ€™t see a voice/speak-out-loud tool admitted for this turn.\nThe available Helix workstation capabilities here include things like calculator, docs/search, repo search, web search, panel open/focus, and status/context observation. None of the listed capabilities is a voice callout or text-to-speech action where I can submit text to be spoken aloud.\nSo for this turn: I can reason about the intended voice-tool contract, but I canâ€™t invoke it or claim anything was said out loud unless Helix exposes a voice capability and returns an action receipt/observation for it."',
      mode: "read",
      debug: {
        selected_final_answer:
          "ã“ã®ã‚¿ãƒ¼ãƒ³ã§ã¯ã€éŸ³å£°ï¼èª­ã¿ä¸Šã’ãƒ„ãƒ¼ãƒ«ãŒè¨±å¯ã•ã‚Œã¦ã„ã‚‹ã‚ˆã†ã«ã¯è¦‹ãˆã¾ã›ã‚“ã€‚",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: undefined,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.hard_claim).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it("does not retrieval-gate quoted translation payloads when local mode classification says verify", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        'translate to japanese "I donâ€™t see a voice/speak-out-loud tool admitted for this turn.\nThe available Helix workstation capabilities here include calculator, docs/search, repo search, web search, panel open/focus, and status/context observation. I canâ€™t claim anything was said out loud unless Helix exposes a voice capability and returns an action receipt/observation for it."',
      mode: "verify",
      debug: {
        selected_final_answer:
          "このターンでは、音声/読み上げツールが許可されているようには見えません。",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: { artifacts: [] } as never,
    });

    expect(decision.blocked).toBe(false);
    expect(decision.hard_claim).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it("still retrieval-gates quoted translation prompts when verification is requested outside the quote", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        'translate to japanese "I don’t see a voice tool" and verify whether that claim is true in the current runtime',
      mode: "read",
      debug: {
        selected_final_answer: "音声ツールは見えません。",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: undefined,
    });

    expect(decision.blocked).toBe(true);
    expect(decision.hard_claim).toBe(true);
    expect(decision.reason).toBe("hard_claim_without_evidence_refs");
  });

  it("still retrieval-gates quoted tool-name prompts when they ask for proof claims", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question:
        "The text says `internet-search.search_web`; as text only, prove whether this claim has current public evidence.",
      mode: "read",
      debug: {
        selected_final_answer: "This is only a tool identifier.",
        workstation_gateway_call_results: [],
        workstation_gateway_observation_packets: [],
      } as never,
      proof: undefined,
    });

    expect(decision.blocked).toBe(true);
    expect(decision.hard_claim).toBe(true);
    expect(decision.reason).toBe("hard_claim_without_evidence_refs");
  });

  it("blocks hard-claim finalization when evidence gate is not satisfied", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question: "verify this theory against the current docs",
      mode: "verify",
      debug: {
        context_files: ["docs/NHM2.md"],
        evidence_gate_ok: false,
      },
      proof: undefined,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("hard_claim_evidence_gate_not_ok");
    expect(decision.evidence_refs).toEqual(["docs/NHM2.md"]);
  });

  it("allows hard-claim finalization when evidence refs and evidence gate are both present", () => {
    const decision = evaluateEvidenceFinalizationGate({
      question: "synthesize and compare both documents",
      mode: "observe",
      debug: {
        context_files: ["docs/NHM2.md"],
        evidence_gate_ok: true,
      },
      proof: undefined,
    });
    expect(decision.blocked).toBe(false);
    expect(decision.reason).toBeNull();
    expect(decision.evidence_refs).toEqual(["docs/NHM2.md"]);
  });

  it("builds deterministic needs-retrieval observer plan events", () => {
    const event = buildNeedsRetrievalPlanEvent({
      source: "run_ask",
      question: "prove the claim from the docs",
      reason: "hard_claim_without_evidence_refs",
      evidence_refs: [],
      traceId: "ask:trace-123",
    });
    expect(event.tool).toBe("helix.observer.plan");
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    expect(meta.kind).toBe("observer_plan_delta");
    expect(meta.plan_step).toBe("needs_retrieval");
    expect(meta.reason).toBe("hard_claim_without_evidence_refs");
  });

  it("builds observer lane commentary with user-perspective restating", () => {
    const commentary = buildObserverCommentaryForRow(
      {
        tool: "workstation.action",
        text: "summarizing current document",
        detail: "workstation_intent_stage",
      },
      {
        userPrompt: "okay open up a doc about the sun and summarize what it means",
      },
    );
    expect(commentary).toContain("From your request");
    expect(commentary).toContain("summarized in plain language");
    expect(commentary).toContain("Summarize-doc action dispatched");
  });

  it("keeps observer lane deterministic when no user prompt is available", () => {
    const commentary = buildObserverCommentaryForRow({
      tool: "workstation.action",
      text: "closed active panel docs-viewer",
      detail: "workstation_intent_stage",
    });
    expect(commentary).toBe(
      "Observer: Close-panel action completed and active workspace panel was removed.",
    );
  });

  it("builds transient mic status labels", () => {
    expect(buildVoiceInputStatusLabel("off", "listening", null)).toBeNull();
    expect(buildVoiceInputStatusLabel("on", "listening", null)).toBe("Listening");
    expect(buildVoiceInputStatusLabel("on", "transcribing", null)).toBe("Transcribing");
    expect(buildVoiceInputStatusLabel("on", "cooldown", null)).toBe("Cooldown");
    expect(buildVoiceInputStatusLabel("on", "error", "Microphone permission denied.")).toBe(
      "Microphone permission denied.",
    );
  });

  it("uses a stronger playback gain profile for mobile audio devices", () => {
    const desktopGain = resolveVoicePlaybackGain(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    );
    const androidGain = resolveVoicePlaybackGain(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36",
    );
    const iosGain = resolveVoicePlaybackGain(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );
    expect(desktopGain).toBe(1.15);
    expect(androidGain).toBe(3.6);
    expect(iosGain).toBe(5.0);
    expect(androidGain).toBeGreaterThan(desktopGain);
    expect(iosGain).toBeGreaterThan(androidGain);
  });

  it("treats desktop-style iOS Safari user agents as mobile when touch is available", () => {
    const originalNavigator = globalThis.navigator;
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
    } as Navigator);
    try {
      const iosDesktopUa =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
      expect(resolveVoicePlaybackGain(iosDesktopUa)).toBe(5.0);
      expect(shouldUseVoicePlaybackAudioGraph(iosDesktopUa)).toBe(true);
    } finally {
      if (originalNavigator) {
        vi.stubGlobal("navigator", originalNavigator);
      } else {
        vi.unstubAllGlobals();
      }
    }
  });

  it("enables WebAudio media-element routing on mobile user agents by default", () => {
    expect(
      shouldUseVoicePlaybackAudioGraph(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      ),
    ).toBe(true);
    expect(
      shouldUseVoicePlaybackAudioGraph(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      shouldUseVoicePlaybackAudioGraph(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
  });

  it("retries playback fallback only for the current utterance", () => {
    expect(
      shouldRetryVoicePlaybackWithDirectFallback({
        graphAttached: true,
        directFallbackAttempted: false,
      }),
    ).toBe(true);
    expect(
      resolveVoicePlaybackAttemptPath({
        graphAttached: false,
        directFallbackAttempted: true,
      }),
    ).toBe("direct_fallback");
    expect(
      resolveVoicePlaybackAttemptPath({
        graphAttached: true,
        directFallbackAttempted: false,
      }),
    ).toBe("audio_graph");
  });

  it("allows one clean direct retry after fallback if direct playback throws", () => {
    expect(
      shouldRetryVoicePlaybackDirectAttempt({
        graphAttached: false,
        directFallbackAttempted: true,
        directRetryCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryVoicePlaybackDirectAttempt({
        graphAttached: false,
        directFallbackAttempted: true,
        directRetryCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldRetryVoicePlaybackDirectAttempt({
        graphAttached: true,
        directFallbackAttempted: false,
        directRetryCount: 0,
      }),
    ).toBe(false);
  });

  it("treats late media errors as ended to avoid iOS tail-drop stalls", () => {
    expect(
      shouldTreatVoicePlaybackErrorAsEnded({
        playedSeconds: 9.1,
        durationSeconds: 10,
      }),
    ).toBe(true);
    expect(
      shouldTreatVoicePlaybackErrorAsEnded({
        playedSeconds: 0.2,
        durationSeconds: 10,
      }),
    ).toBe(false);
    expect(
      shouldTreatVoicePlaybackErrorAsEnded({
        playedSeconds: 2.1,
        durationSeconds: null,
      }),
    ).toBe(true);
    expect(
      shouldTreatVoicePlaybackErrorAsEnded({
        playedSeconds: 0.35,
        durationSeconds: 6,
        directFallbackAttempted: true,
      }),
    ).toBe(true);
  });

  it("routes completion scores by threshold", () => {
    expect(
      scoreConversationCompletion({
        transcript: "I think maybe we should",
        pauseMs: 200,
        stability: 0.2,
      }).route,
    ).toBe("ask_more");
    expect(
      scoreConversationCompletion({
        transcript: "Could you check this claim",
        pauseMs: 700,
        stability: 0.6,
      }).route,
    ).toBe("mirror_clarify");
    expect(
      scoreConversationCompletion({
        transcript: "Please verify the certificate integrity.",
        pauseMs: 1400,
        stability: 1,
      }).route,
    ).toBe("answer");
  });

  it("activates graph bypass only while the bypass window is still open", () => {
    const nowMs = Date.now();
    expect(
      shouldBypassVoicePlaybackGraph({
        bypassUntilMs: nowMs + 5000,
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldBypassVoicePlaybackGraph({
        bypassUntilMs: nowMs - 1,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldBypassVoicePlaybackGraph({
        bypassUntilMs: null,
        nowMs,
      }),
    ).toBe(false);
  });

  it("dispatches background reasoning only for reasoning-heavy turns", () => {
    expect(shouldDispatchReasoningAttempt("Verify this claim and provide evidence.")).toBe(true);
    expect(shouldDispatchReasoningAttempt("Implement the patch now.")).toBe(true);
    expect(shouldDispatchReasoningAttempt("How is a full solve done?")).toBe(true);
    expect(shouldDispatchReasoningAttempt("and what a warp bubble is the congruence of the code base")).toBe(
      true,
    );
    expect(shouldDispatchReasoningAttempt("hello")).toBe(false);
    expect(shouldDispatchReasoningAttempt("hello, how are you today?")).toBe(false);
    expect(shouldDispatchReasoningAttempt("ok")).toBe(false);
    expect(shouldDispatchReasoningAttempt("thanks")).toBe(false);
  });

  it("keeps passive voice observations from becoming automatic dispatches", () => {
    const passive = evaluateVoiceAutoDispatchGovernance({
      transcript: "earlier you mentioned the Dottie voice lane",
      micArmState: "on",
      confidence: 0.92,
      queueDepth: 0,
      activeDispatchCount: 0,
    });
    expect(passive.admitted).toBe(false);
    expect(passive.reason).toBe("observe_only_by_default");
    expect(passive.assistant_answer).toBe(false);
    expect(passive.instruction_authority).toBe("none");

    const explicitAsk = evaluateVoiceAutoDispatchGovernance({
      transcript: "Can you explain what the voice lane is doing?",
      micArmState: "on",
      confidence: 0.92,
      queueDepth: 0,
      activeDispatchCount: 0,
    });
    expect(explicitAsk.admitted).toBe(true);
    expect(explicitAsk.reason).toBe("admitted_explicit_user_turn");
  });

  it("blocks voice auto-dispatch under echo, queue, and budget pressure", () => {
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        possibleTtsEcho: true,
      }).reason,
    ).toBe("possible_tts_echo");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        queueDepth: 4,
        maxQueueDepth: 4,
      }).reason,
    ).toBe("queue_backpressure");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        activeDispatchCount: 3,
        maxAutoDispatchPerWindow: 3,
      }).reason,
    ).toBe("auto_dispatch_budget_exceeded");
  });

  it("keeps smalltalk fast-path outputs in the brief lane", () => {
    expect(shouldKeepHelixReplyInBriefLane(undefined)).toBe(false);
    expect(
      shouldKeepHelixReplyInBriefLane({
        smalltalk_fast_path_applied: true,
      } as never),
    ).toBe(true);
    expect(
      shouldKeepHelixReplyInBriefLane({
        fallback_reason_taxonomy: "smalltalk_fast_path",
      } as never),
    ).toBe(true);
    expect(
      shouldKeepHelixReplyInBriefLane({
        answer_path: ["forcedAnswer:smalltalk_fast_path", "answer:forced"],
      } as never),
    ).toBe(true);
    expect(
      shouldKeepHelixReplyInBriefLane({
        fallback_reason_taxonomy: "pre_intent_microplanner_answer",
      } as never),
    ).toBe(false);
  });

  it("forces observe dispatch for suppressed noisy codebase questions", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:clarify_after_attempt1",
        transcript: "What is a warp bubble false off in this codebase?",
      }),
    ).toBe(true);
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:multilang_dispatch_blocked",
        transcript: "What is a warp bubble in this codebase?",
      }),
    ).toBe(true);
  });

  it("maps suppressed route reasons to stable suppression causes", () => {
    expect(inferSuppressionCauseFromRouteReason("suppressed:heuristic_low_salience")).toBe("low_salience");
    expect(inferSuppressionCauseFromRouteReason("suppressed:clarify_after_attempt1")).toBe(
      "clarifier_requested",
    );
    expect(inferSuppressionCauseFromRouteReason("dispatch:observe")).toBeNull();
  });

  it("derives suppression metadata from restart and preflight fixtures", () => {
    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_final",
        detail: "artifact-dominated output; restarting observe lane",
        meta: {},
      }),
    ).toEqual({
      suppressionCause: "artifact_guard_restart",
      authorityRejectStage: "final",
    });

    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_attempt",
        detail: "phase_not_sealed; causal_ref:timeline:f83a0039-3139-4923-b90b-ad9fd7664b68",
        meta: {
          authorityRejectStage: "preflight",
        },
      }),
    ).toEqual({
      suppressionCause: "phase_not_sealed",
      authorityRejectStage: "preflight",
    });

    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "conversation_brief",
        detail: "Reasoning is suppressed for this turn.",
        meta: {
          suppressionCause: "dispatch_suppressed",
          authorityRejectStage: "preflight",
        },
      }),
    ).toEqual({
      suppressionCause: "dispatch_suppressed",
      authorityRejectStage: "preflight",
    });

    expect(
      deriveVoiceTimelineSuppressionMeta({
        status: "suppressed",
        type: "reasoning_final",
        detail: null,
        meta: null,
      }),
    ).toEqual({
      suppressionCause: "suppressed_unspecified",
      authorityRejectStage: "final",
    });
  });

  it("rescues suppressed low-info transcript fragments from richer draft context", () => {
    expect(
      resolveSuppressedDispatchRescueTranscript({
        dispatchHint: false,
        routeReasonCode: "dispatch:heuristic",
        transcript: "a notario solve.",
        draftText: "Okay, define what a warp solve is for. a notario solve.",
      }),
    ).toContain("warp solve");

    expect(
      resolveSuppressedDispatchRescueTranscript({
        dispatchHint: false,
        routeReasonCode: "suppressed:multilang_dispatch_blocked",
        transcript: "a notario solve.",
        draftText: "Okay, define what a warp solve is for. a notario solve.",
      }),
    ).toContain("warp solve");
  });

  it("marks short follow-up turns as context-dependent", () => {
    expect(isLikelyContextDependentTurn("where is that coming from?")).toBe(true);
    expect(isLikelyContextDependentTurn("And how does that affect propulsion?")).toBe(true);
    expect(isLikelyContextDependentTurn("Explain negative energy density in quantum field theory.")).toBe(
      false,
    );
  });

  it("merges short continuation fragments into the same in-flight prompt", () => {
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "Okay, so, what's a token amount that",
        nextTranscript: "used in long prompts like in GPT-5.",
        gapMs: 1800,
      }),
    ).toBe(true);
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "What is negative energy density?",
        nextTranscript: "used in warp discussions",
        gapMs: 1500,
      }),
    ).toBe(true);
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "What is negative energy density?",
        nextTranscript: "Tell me the history of aviation.",
        gapMs: 1500,
      }),
    ).toBe(false);
    expect(
      shouldMergeVoiceContinuationTurn({
        previousPrompt: "What is negative energy density",
        nextTranscript: "and where is it observed?",
        gapMs: 12000,
      }),
    ).toBe(false);
  });

  it("keeps merging active voice chain segments while reasoning is in flight", () => {
    expect(
      shouldMergeVoiceContinuationInFlight({
        gapMs: 3_000,
        lexicalContinuation: false,
      }),
    ).toBe(true);
    expect(
      shouldMergeVoiceContinuationInFlight({
        gapMs: 30_000,
        lexicalContinuation: false,
      }),
    ).toBe(false);
    expect(
      shouldMergeVoiceContinuationInFlight({
        gapMs: 30_000,
        lexicalContinuation: true,
      }),
    ).toBe(true);
  });

  it("merges pending confirm transcripts for low-salience follow-up fragments", () => {
    expect(
      shouldMergePendingConfirmationTranscript({
        pendingTranscript: "How does the immersion of fantasy reflect the",
        nextTranscript: "Human qualities in storytelling.",
        pendingAgeMs: 1800,
      }),
    ).toBe(true);
    expect(
      shouldMergePendingConfirmationTranscript({
        pendingTranscript: "What is a warp bubble in this codebase?",
        nextTranscript: "Actually switch topics and explain tomato soil acidity.",
        pendingAgeMs: 1500,
      }),
    ).toBe(false);
  });

  it("suppresses stale voice responses when turn revision drifts", () => {
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "Follow-up turn: Where does that come from?",
        askPromptForRequest: "Follow-up turn: Where does that come from?",
        requestIntentRevision: 3,
        latestIntentRevision: 4,
        latestAttemptIntentRevision: 4,
        requestDispatchPromptHash: "hash-3",
        latestDispatchPromptHash: "hash-4",
      }),
    ).toEqual({
      suppress: true,
      reason: "sealed_revision_mismatch",
      restart: true,
    });
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "What is negative energy density?",
        askPromptForRequest: "What is negative energy density?",
        requestIntentRevision: 5,
        latestIntentRevision: 5,
        latestAttemptIntentRevision: 5,
        requestDispatchPromptHash: "hash-a",
        latestDispatchPromptHash: "hash-b",
      }),
    ).toEqual({
      suppress: true,
      reason: "dispatch_hash_mismatch",
      restart: true,
    });
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "What is negative energy density?",
        askPromptForRequest: "What is negative energy density?",
        latestAttemptStatus: "suppressed",
      }),
    ).toEqual({
      suppress: true,
      reason: "inactive_attempt",
      restart: false,
    });
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: true,
        latestAskPromptForAttempt: "A",
        askPromptForRequest: "A",
      }),
    ).toEqual({
      suppress: true,
      reason: "continuation_merged",
      restart: true,
    });
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "What is negative energy density?",
        askPromptForRequest: "What is negative energy density?",
        requestIntentRevision: 4,
        latestIntentRevision: 4,
        latestAttemptIntentRevision: 4,
        requestDispatchPromptHash: "hash-a",
        latestDispatchPromptHash: "hash-a",
      }),
    ).toEqual({
      suppress: false,
      reason: "ok",
      restart: false,
    });
  });

  it("enforces deterministic seal gate conditions before dispatch", () => {
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 4000,
        sttQueueDepth: 0,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 1200,
      }),
    ).toBe(true);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 3000,
        sttQueueDepth: 0,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 1200,
      }),
    ).toBe(false);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 4000,
        sttQueueDepth: 1,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 1200,
      }),
    ).toBe(false);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 4000,
        sttQueueDepth: 0,
        sttInFlight: true,
        heldPending: false,
        hashStableDwellMs: 1200,
      }),
    ).toBe(false);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 4000,
        sttQueueDepth: 0,
        sttInFlight: false,
        heldPending: true,
        hashStableDwellMs: 1200,
      }),
    ).toBe(false);
    expect(
      evaluateVoiceTurnSealGate({
        sinceLastSpeechMs: 4000,
        sttQueueDepth: 0,
        sttInFlight: false,
        heldPending: false,
        hashStableDwellMs: 400,
      }),
    ).toBe(false);
  });

  it("rejects responses that violate sealed revision authority", () => {
    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "A",
        askPromptForRequest: "A",
        assemblerPhase: "draft",
      }),
    ).toEqual({
      suppress: true,
      reason: "phase_not_sealed",
      restart: false,
    });

    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "A",
        askPromptForRequest: "A",
        assemblerPhase: "sealed",
        attemptTranscriptRevision: 2,
        latestSealedTranscriptRevision: 3,
      }),
    ).toEqual({
      suppress: true,
      reason: "sealed_revision_mismatch",
      restart: false,
    });

    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "A",
        askPromptForRequest: "A",
        assemblerPhase: "sealed",
        attemptTranscriptRevision: 3,
        latestSealedTranscriptRevision: 3,
        attemptSealToken: "seal-old",
        latestSealToken: "seal-new",
      }),
    ).toEqual({
      suppress: true,
      reason: "seal_token_mismatch",
      restart: false,
    });

    expect(
      evaluateVoiceReasoningResponseAuthority({
        source: "voice_auto",
        continuationRestartRequested: false,
        latestAskPromptForAttempt: "A",
        askPromptForRequest: "A",
        assemblerPhase: "sealed",
        attemptTranscriptRevision: 3,
        latestSealedTranscriptRevision: 3,
        attemptSealToken: "seal-new",
        latestSealToken: "seal-new",
      }),
    ).toEqual({
      suppress: false,
      reason: "ok",
      restart: false,
    });
  });

  it("builds a context-anchored dispatch prompt for follow-up turns", () => {
    const prompt = buildVoiceReasoningDispatchPrompt({
      transcript: "Where is that coming from?",
      recentTurns: [
        "user: what is negative energy",
        "dottie: Negative energy can refer to effective energy-density terms in GR.",
        "user: where is that coming from?",
      ],
      explorationPacket: null,
    });
    expect(prompt).toContain("Follow-up turn: Where is that coming from?");
    expect(prompt).toContain("Immediate anchor: what is negative energy");
    expect(prompt).toContain("Prior user turn: what is negative energy");
    expect(prompt).not.toContain("Recent turns:");
    expect(prompt).not.toContain("Immediate anchor: Where is that coming from?");
  });

  it("routes exploration ladder outcomes after attempt one", () => {
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 1,
        outputText: "Could you clarify which specific context you're referring to?",
        debug: { arbiter_mode: "clarify", coverage_gate_reason: "missing user context" },
      }).action,
    ).toBe("clarify_after_attempt1");
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 1,
        promptText: "Please verify this with pass/fail and evidence anchors.",
        outputText: "Next step: run pass/fail verification with evidence anchors.",
      }).action,
    ).toBe("escalate_verify");
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 1,
        promptText: "Implement the change and run the tool.",
        outputText: "Action required: apply patch and run tool execution.",
      }).action,
    ).toBe("escalate_act");
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 1,
        outputText: "Here is the grounded mechanism and evidence-backed summary.",
      }).action,
    ).toBe("finalize");
  });

  it("finalizes substantive artifact-noisy observe output instead of looping restarts", () => {
    const artifactNoisyButSubstantive = [
      "A system is a set of interacting components with boundaries and feedback loops.[docs/knowledge/a.md]",
      "In this codebase, the sun consciousness topic appears in retrieval and reasoning orchestration paths.[docs/knowledge/b.md]",
      "A practical next step is to inspect those paths and map where context is injected before final response assembly.[docs/knowledge/c.md]",
      "That gives a grounded baseline before deeper verification or action steps.[docs/knowledge/d.md]",
      "The overlap between question intent and retrieved context remains the main alignment check.[docs/knowledge/e.md]",
    ].join(" ");
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 2,
        promptText: "Can you see what the codebase has for the sun consciousness system?",
        outputText: artifactNoisyButSubstantive,
      }).action,
    ).toBe("finalize");
  });

  it("does not artifact-restart when file-location prompts return grounded path-based answers", () => {
    const pathAnchoredAnswer = [
      "Helix Ask retrieval logic is routed through server/services/helix-ask/repo-search.ts.",
      "Intent and ask orchestration are coordinated in server/routes/agi.plan.ts.",
      "The voice turn enters through server/routes/voice.ts before dispatch.",
    ].join(" ");
    expect(
      decideExplorationLadderAction({
        explorationAttemptCount: 1,
        promptText: "What files does Helix Ask retrieval use in the codebase?",
        outputText: pathAnchoredAnswer,
      }).action,
    ).toBe("finalize");
  });

  it("appends transcript text without losing existing draft formatting", () => {
    expect(mergeVoiceTranscriptDraft("Check", "captured transcript")).toBe("Check captured transcript");
    expect(mergeVoiceTranscriptDraft("Check ", "captured transcript")).toBe("Check captured transcript");
    expect(mergeVoiceTranscriptDraft("Check", "   ")).toBe("Check");
    expect(mergeVoiceTranscriptDraft("What is negative energy...", "...where does it come from")).toBe(
      "What is negative energy where does it come from",
    );
    expect(
      mergeVoiceTranscriptDraft(
        "First sentence.",
        "First sentence. Second sentence with a new direction?",
      ),
    ).toBe("First sentence. Second sentence with a new direction?");
    expect(
      mergeVoiceTranscriptDraft(
        "First sentence. Transition phrase",
        "Transition phrase with additional detail.",
      ),
    ).toBe("First sentence. Transition phrase with additional detail.");
  });

  it("uses the accumulated visible draft as the voice dispatch source when it contains the latest fragment", () => {
    expect(
      resolveVoiceDispatchTranscriptFromDraft({
        draftText: "First thing I said. Second thing I said. Final send sentence.",
        assemblerTranscript: "Final send sentence.",
        recordedText: "Final send sentence.",
      }),
    ).toEqual({
      transcript: "First thing I said. Second thing I said. Final send sentence.",
      recordedText: "First thing I said. Second thing I said. Final send sentence.",
      source: "draft",
    });
  });

  it("merges the visible draft and assembler fragment before voice dispatch when they diverge", () => {
    expect(
      resolveVoiceDispatchTranscriptFromDraft({
        draftText: "First thing I said.",
        assemblerTranscript: "Second thing I said.",
      }),
    ).toEqual({
      transcript: "First thing I said. Second thing I said.",
      recordedText: "First thing I said. Second thing I said.",
      source: "merged",
    });
  });

  it("falls back to whichever voice dispatch transcript source has text", () => {
    expect(
      resolveVoiceDispatchTranscriptFromDraft({
        draftText: "",
        assemblerTranscript: "Only assembler text.",
      }),
    ).toEqual({
      transcript: "Only assembler text.",
      recordedText: "Only assembler text.",
      source: "assembler",
    });
    expect(
      resolveVoiceDispatchTranscriptFromDraft({
        draftText: "Only visible draft text.",
        assemblerTranscript: "",
      }),
    ).toEqual({
      transcript: "Only visible draft text.",
      recordedText: "Only visible draft text.",
      source: "draft",
    });
  });

  it("smooths the level meter with attack/release behavior", () => {
    const attacked = smoothVoiceLevel(0.1, 0.9);
    const released = smoothVoiceLevel(0.9, 0.1);
    expect(attacked).toBeGreaterThan(0.5);
    expect(released).toBeLessThan(0.8);
    expect(released).toBeGreaterThan(0.1);
  });

  it("detects flat signals and recorder stalls with deterministic thresholds", () => {
    expect(isFlatVoiceSignal(0.001, 3050)).toBe(true);
    expect(isFlatVoiceSignal(0.003, 3050)).toBe(false);
    expect(
      isRecorderStalled({
        recorderActive: true,
        nowMs: 4200,
        recorderStartedAtMs: 0,
        lastChunkAtMs: 2500,
      }),
    ).toBe(true);
    expect(
      isRecorderStalled({
        recorderActive: true,
        nowMs: 3100,
        recorderStartedAtMs: 0,
        lastChunkAtMs: 2500,
      }),
    ).toBe(false);
  });

  it("flags likely loopback-style device labels", () => {
    expect(isLikelyLoopbackDeviceLabel("VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)")).toBe(true);
    expect(isLikelyLoopbackDeviceLabel("Stereo Mix (Realtek)")).toBe(true);
    expect(isLikelyLoopbackDeviceLabel("USB Microphone")).toBe(false);
  });

  it("primes sliced webm/ogg segments with a header chunk", () => {
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/webm;codecs=opus",
        hasHeaderChunk: true,
      }),
    ).toBe(true);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 0,
        mimeType: "audio/webm",
        hasHeaderChunk: true,
      }),
    ).toBe(false);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/mp4",
        hasHeaderChunk: true,
      }),
    ).toBe(false);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/wav",
        hasHeaderChunk: false,
      }),
    ).toBe(false);
  });

  it("orders recorder MIME candidates by runtime capabilities", () => {
    const iosUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const desktopUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36";
    expect(getMicRecorderMimeCandidates(iosUa)[0]).toContain("audio/mp4");
    expect(getMicRecorderMimeCandidates(desktopUa)[0]).toContain("audio/webm");
    const supported = new Set<string>(["audio/mp4", "audio/webm;codecs=opus"]);
    expect(
      pickSupportedMicRecorderMimeType({
        userAgent: iosUa,
        isTypeSupported: (mimeType) => supported.has(mimeType),
      }),
    ).toBe("audio/mp4");
    expect(
      pickSupportedMicRecorderMimeType({
        userAgent: desktopUa,
        isTypeSupported: (mimeType) => supported.has(mimeType),
      }),
    ).toBe("audio/webm;codecs=opus");
  });

  it("formats lifecycle decision sentences in human wording only", () => {
    expect(
      formatVoiceDecisionSentence({
        lifecycle: "queued",
        mode: "observe",
        routeReasonCode: "dispatch:observe_explore",
      }),
    ).toBe("I am thinking through this in the background.");
    expect(
      formatVoiceDecisionSentence({
        lifecycle: "running",
        mode: "verify",
      }),
    ).toBe("Reasoning is running in verification mode.");
    expect(
      formatVoiceDecisionSentence({
        lifecycle: "suppressed",
        routeReasonCode: "suppressed:clarify_after_attempt1",
      }),
    ).toContain("one concrete detail");
    expect(
      formatVoiceDecisionSentence({
        lifecycle: "escalated",
        escalatedMode: "act",
      }),
    ).toBe("Reasoning is escalated to action mode.");
    expect(
      formatVoiceDecisionSentence({
        lifecycle: "done",
        mode: "observe",
      }),
    ).toBe("Reasoning is complete; see the answer below.");
    const failedSentence = formatVoiceDecisionSentence({
      lifecycle: "failed",
    });
    expect(failedSentence).not.toMatch(/dispatch:|suppressed:/i);
    const failedScopedSentence = formatVoiceDecisionSentence({
      lifecycle: "failed",
      failureReasonRaw: "DESKTOP_JOINT_SCOPE_REQUIRED",
    });
    expect(failedScopedSentence).toContain("desktop joint scope");
    expect(failedScopedSentence).not.toContain("DESKTOP_JOINT_SCOPE_REQUIRED");
    const timedOutSentence = formatVoiceDecisionSentence({
      lifecycle: "failed",
      failureReasonRaw: "reasoning_timeout:90000",
    });
    expect(timedOutSentence).toContain("timed out");
    expect(timedOutSentence).not.toContain("reasoning_timeout");
  });

  it("composes base brief plus decision sentence as one updated brief", () => {
    expect(
      composeVoiceBriefWithDecision(
        'I heard: "How is a full solve done?"',
        "Reasoning is queued in explore mode.",
      ),
    ).toBe(
      'I heard: "How is a full solve done?" Reasoning is queued in explore mode.',
    );
    expect(composeVoiceBriefWithDecision("Short brief.", "")).toBe("Short brief.");
  });

  it("detects mission preflight scope failures for safe fallback retry", () => {
    expect(isAgibotPreflightScopeError(new Error("DESKTOP_JOINT_SCOPE_REQUIRED"))).toBe(true);
    expect(
      isAgibotPreflightScopeError("Mission interface blocked by bring-up preflight gate."),
    ).toBe(true);
    expect(isAgibotPreflightScopeError(new Error("network timeout"))).toBe(false);
  });

  it("gates transcript confirmation only for uncertain STT inputs", () => {
    const confident = deriveTranscriptConfidence({
      transcript: "Explain the Casimir effect in one sentence.",
      providerConfidence: 0.91,
      segments: [],
    });
    expect(
      shouldRequireTranscriptConfirmation({
        confidence: confident.confidence,
        translationUncertain: false,
      }),
    ).toBe(false);

    const uncertain = deriveTranscriptConfidence({
      transcript: "x y z ???",
      providerConfidence: 0.34,
      segments: [],
    });
    expect(
      shouldRequireTranscriptConfirmation({
        confidence: uncertain.confidence,
        translationUncertain: false,
      }),
    ).toBe(true);
    expect(
      shouldRequireTranscriptConfirmation({
        confidence: 0.92,
        translationUncertain: true,
      }),
    ).toBe(true);
  });

  it("auto-confirms only safe confirm-state transcript prompts", () => {
    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0.76,
        languageConfidence: 0.82,
        pivotConfidence: 0.79,
        translationUncertain: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "blocked",
        confidence: 0.92,
        languageConfidence: 0.9,
        pivotConfidence: 0.9,
        translationUncertain: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0,
        languageConfidence: 0.9,
        pivotConfidence: 0.9,
        translationUncertain: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0.88,
        languageConfidence: 0.62,
        pivotConfidence: 0.9,
        translationUncertain: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0.9,
        languageConfidence: 0.9,
        pivotConfidence: null,
        translationUncertain: true,
        sourceLanguage: "zh-hans",
      }),
    ).toBe(false);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0.9,
        languageConfidence: 0.9,
        pivotConfidence: null,
        translationUncertain: true,
        sourceLanguage: "unknown",
        sourceText: "Define what a warp bubble is in this codebase.",
      }),
    ).toBe(true);

    expect(
      shouldAutoConfirmTranscriptPrompt({
        dispatchState: "confirm",
        confidence: 0.9,
        languageConfidence: 0.9,
        pivotConfidence: 0.4,
        translationUncertain: true,
        sourceLanguage: "unknown",
        sourceText: "Define what a warp bubble is in this codebase.",
      }),
    ).toBe(true);
  });

  it("resolves confirm policy with deterministic blocked/manual/auto reasons", () => {
    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "blocked",
        confidence: 0.9,
        pivotConfidence: 0.9,
        translationUncertain: false,
      }),
    ).toMatchObject({
      action: "blocked",
      reason: "dispatch_blocked",
      confirmAutoEligible: false,
      confirmBlockReason: "dispatch_blocked",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.4,
        translationUncertain: false,
      }),
    ).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.92,
        translationUncertain: false,
        lowAudioQuality: true,
      }),
    ).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
      confirmAutoEligible: true,
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.62,
        pivotConfidence: 0.92,
        translationUncertain: false,
        lowAudioQuality: true,
      }),
    ).toMatchObject({
      action: "manual_confirm",
      reason: "low_audio_quality",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.92,
        translationUncertain: false,
        speechActive: true,
      }),
    ).toMatchObject({
      action: "manual_confirm",
      reason: "live_activity",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.4,
        translationUncertain: true,
        sourceLanguage: "zh-hans",
      }),
    ).toMatchObject({
      action: "blocked",
      reason: "pivot_low_confidence",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: null,
        translationUncertain: true,
        sourceLanguage: "zh-hans",
      }),
    ).toMatchObject({
      action: "blocked",
      reason: "translation_uncertain_without_pivot",
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: null,
        translationUncertain: true,
        sourceLanguage: "unknown",
        sourceText: "Define what a warp bubble is in this codebase.",
      }),
    ).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
      confirmAutoEligible: true,
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.4,
        translationUncertain: true,
        sourceLanguage: "unknown",
        sourceText: "Define what a warp bubble is in this codebase.",
      }),
    ).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
      confirmAutoEligible: true,
    });

    expect(
      resolveTranscriptConfirmPolicy({
        dispatchState: "confirm",
        confidence: 0.9,
        pivotConfidence: 0.92,
        translationUncertain: false,
      }),
    ).toMatchObject({
      action: "auto_confirm",
      reason: "eligible",
      confirmAutoEligible: true,
    });
  });

  it("ignores low-quality transcript barge-in while voice reasoning/playback is active", () => {
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.71,
        speechProbability: 0.41,
        snrDb: 5,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: false,
        needsConfirmation: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.7,
        speechProbability: null,
        snrDb: null,
        hasActiveVoiceReasoningAttempt: false,
        hasActiveVoicePlayback: true,
        needsConfirmation: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.94,
        speechProbability: null,
        snrDb: null,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: true,
        needsConfirmation: false,
      }),
    ).toBe(false);
  });

  it("does not ignore low-quality transcript barge-in when confirmation is required", () => {
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.5,
        speechProbability: 0.3,
        snrDb: 2,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: true,
        needsConfirmation: true,
      }),
    ).toBe(false);
  });

  it("parses transcript confirmation voice commands conservatively", () => {
    expect(parseTranscriptConfirmationVoiceCommand("confirm")).toBe("confirm");
    expect(parseTranscriptConfirmationVoiceCommand("yes")).toBe("confirm");
    expect(parseTranscriptConfirmationVoiceCommand("retry")).toBe("retry");
    expect(parseTranscriptConfirmationVoiceCommand("no")).toBe("retry");
    expect(parseTranscriptConfirmationVoiceCommand("cancel")).toBe("cancel");
    expect(parseTranscriptConfirmationVoiceCommand("dismiss")).toBe("cancel");
    expect(
      parseTranscriptConfirmationVoiceCommand(
        "we define what is truth from the helix standpoint",
      ),
    ).toBeNull();
  });

  it("normalizes additive command-lane payloads", () => {
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "accepted",
        action: "send",
        confidence: 0.91,
        source: "parser",
        suppression_reason: null,
        strict_prefix_applied: true,
        confirm_required: true,
        utterance_id: "vcmd:test",
      }),
    ).toMatchObject({
      decision: "accepted",
      action: "send",
      source: "parser",
      confidence: 0.91,
      strict_prefix_applied: true,
      confirm_required: true,
      utterance_id: "vcmd:test",
    });
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confidence: null,
        source: "none",
        suppression_reason: "disabled",
        strict_prefix_applied: false,
        confirm_required: false,
        utterance_id: "vcmd:none",
      }),
    ).toMatchObject({
      decision: "none",
      suppression_reason: "disabled",
    });
    expect(normalizeVoiceCommandLaneEnvelope(null)).toBeNull();
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "bad",
        action: null,
        confidence: null,
        source: "none",
        suppression_reason: null,
        strict_prefix_applied: false,
        confirm_required: false,
        utterance_id: "bad",
      } as any),
    ).toBeNull();
  });

  it("maps accepted command actions to the exact command-confirm display wording", () => {
    expect(describeVoiceCommandAction("send")).toBe("Send current draft");
    expect(describeVoiceCommandAction("retry")).toBe("Retry previous ask");
    expect(describeVoiceCommandAction("cancel")).toBe("Cancel pending flow");
  });

  it("uses recorded text for voice reasoning timeline entries and hides internal retry scaffolds", () => {
    expect(
      resolveReasoningAttemptTimelineText({
        source: "voice_auto",
        prompt:
          "Topic: Explain warp\nRestart observe mode from the top of the reasoning chain.\nOriginal user turn:\nWhat is a warp bubble?\n\nPrevious artifact-dominated output (avoid repeating this pattern):\n...",
        recordedText: "What is a warp bubble?",
      }),
    ).toBe("What is a warp bubble?");

    expect(
      resolveReasoningAttemptTimelineText({
        source: "voice_auto",
        prompt:
          "Topic: Explain warp\nRestart observe mode from the top of the reasoning chain.\nOriginal user turn:\nHow do we solve the warp level?\n\nPrevious artifact-dominated output (avoid repeating this pattern):\n...",
        recordedText: null,
      }),
    ).toBe("How do we solve the warp level?");

    expect(
      resolveReasoningAttemptTimelineText({
        source: "manual",
        prompt: "Topic: Keep this manual prompt literal.",
        recordedText: null,
      }),
    ).toBe("Topic: Keep this manual prompt literal.");
  });

  it("avoids hard-cut interruption for same-turn supersede handoff", () => {
    expect(shouldInterruptForSupersededReason("superseded_same_turn", true)).toBe(false);
    expect(shouldInterruptForSupersededReason("preempted_by_final", false)).toBe(false);
    expect(shouldInterruptForSupersededReason("preempted_by_final", true)).toBe(true);
  });

  it("scores turn completion with semantic guard bands", () => {
    const low = scoreVoiceTurnComplete({
      transcript: "and then because",
      pauseMs: 300,
      stability: 0.45,
    });
    const danglingTail = scoreVoiceTurnComplete({
      transcript: "it's not like a classical system that you can",
      pauseMs: 1600,
      stability: 1,
    });
    const high = scoreVoiceTurnComplete({
      transcript: "Negative energy density is bounded by quantum inequalities.",
      pauseMs: 1600,
      stability: 1,
    });
    expect(low.band).toBe("low");
    expect(danglingTail.band).not.toBe("high");
    expect(high.band).toBe("high");
  });

  it("detects continuation vs topic shift for latest-wins routing", () => {
    const continuation = scoreIntentShift({
      activePrompt: "How can we improve answer quality in this conversation lane?",
      nextTranscript: "Can we improve answer quality with better context continuity in this lane?",
    });
    const shifted = scoreIntentShift({
      activePrompt: "How can we improve answer quality in this conversation lane?",
      nextTranscript: "Switch topics and explain how to grow tomatoes indoors.",
    });
    expect(continuation.band).toBe("continuation");
    expect(shifted.band).toBe("shift");
  });

  it("syncs doc viewer state from shorthand docs action envelopes", async () => {
    const { coerceHelixWorkstationActions } = await import("@/lib/workstation/workstationActionContract");
    const path = "/docs/research/example.md";
    useDocViewerStore.setState({ mode: "directory", currentPath: undefined, anchor: undefined, recent: [] });

    const actions = coerceHelixWorkstationActions([
      {
        panel_id: "docs-viewer",
        action_id: "open_latest_doc_by_topic",
        args: { topic: "example", path },
      },
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("run_panel_action");
    expect(syncDocViewerStateFromWorkstationAction(actions[0]!)).toBe(true);
    expect(useDocViewerStore.getState().mode).toBe("doc");
    expect(useDocViewerStore.getState().currentPath).toBe(path);
  });
});
