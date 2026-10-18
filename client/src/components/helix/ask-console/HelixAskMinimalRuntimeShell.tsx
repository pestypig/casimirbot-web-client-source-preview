import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import { BoundAgentPromptDisplay } from "./BoundAgentPromptDisplay";
import type {
  HelixLanguageModelProfileId,
  HelixLanguageModelSelectionRequest,
  HelixPinnedLanguageModelId,
} from "@shared/helix-language-model-policy";
import {
  DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
  normalizeHelixAgentProvidersResponse,
  resolveSelectedHelixAgentRuntime,
} from "@/lib/helix/ask-agent-runtime-display";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

import {
  buildHelixAskComposerViewModel,
} from "./HelixAskComposer";
import { HelixAskLegacyComposerSurface } from "./HelixAskLegacyComposerSurface";
import { HelixAskConsoleRuntimeLayout } from "./HelixAskConsoleRuntimeLayout";
import { buildHelixAskConsoleRuntimeBridgeProps } from "./HelixAskConsoleRuntimeShellProps";
import { HelixAskDebugDrawer } from "./HelixAskDebugDrawer";
import type { HelixAskConsoleProps } from "./HelixAskConsoleState";
import {
  completeHelixAskMinimalRuntimeTurn,
  createHelixAskMinimalRuntimeInitialState,
  failHelixAskMinimalRuntimeTurn,
  HELIX_ASK_MINIMAL_RUNTIME_REPLY_LIMIT,
  recordHelixAskMinimalRuntimeStreamEvent,
  resolveHelixAskMinimalRuntimeAnswerText,
  startHelixAskMinimalRuntimeTurn,
} from "./HelixAskMinimalRuntimeLifecycle";
import { buildHelixAskMinimalRuntimeRepliesFromChatSession } from "./HelixAskMinimalRuntimeChatSession";
import { runHelixAskMinimalRuntimeBackendTurn } from "./HelixAskMinimalRuntimeBackendRunner";
import {
  buildHelixAskMinimalRuntimeSubmitPlan,
  type HelixAskMinimalRuntimeSubmitPlan,
} from "./HelixAskMinimalRuntimeSubmitPlan";
import {
  buildHelixAskMinimalRuntimeTurnPayload,
  runHelixAskMinimalRuntimeInjectedTransport,
  type HelixAskMinimalRuntimeTurnRunner,
} from "./HelixAskMinimalRuntimeTransport";
import { applyHelixAskWorkstationActionsFromResult } from "./HelixAskWorkstationActionBridge";
import { HelixAskMinimalRuntimeTurnList } from "./HelixAskMinimalRuntimeTurnList";
import {
  HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS,
  type HelixAskMinimalRuntimeControlActions,
  type HelixAskMinimalRuntimeControlPayload,
} from "./HelixAskMinimalRuntimeControls";
import {
  clearPendingHelixAskPrompt,
  consumePendingHelixAskPrompt,
  HELIX_ASK_PROMPT_EVENT,
  type PendingHelixAskPrompt,
} from "@/lib/helix/ask-prompt-launch";
import {
  claimExternalPromptSingleFlight,
  resolveExternalPromptClaimId,
} from "@/lib/helix/ask-external-prompt-claim";
import {
  buildHelixAskRuntimePickerModel,
  HelixAskRuntimePicker,
} from "./HelixAskRuntimePicker";
import {
  buildHelixAskLanguageModelPickerModel,
  HelixAskLanguageModelPicker,
  type HelixAskLanguageModelPickerSelection,
} from "./HelixAskLanguageModelPicker";
import {
  persistHelixAskPinnedLanguageModel,
  persistHelixAskLanguageModelProfile,
  readStoredHelixAskPinnedLanguageModel,
  readStoredHelixAskLanguageModelProfile,
} from "./HelixAskLanguageModelPreference";
import { useHelixAskRuntimeGoalWakeSubscriptions } from "./HelixAskRuntimeGoalWakeSubscriptions";
import { HelixAskRuntimeStatusLine } from "./HelixAskStatusLine";
import {
  HelixAskSurfaceSupplementStack,
  type HelixAskSurfaceSupplementStackProps,
} from "./HelixAskSurfaceSupplementStack";
import { HelixAskSurfaceFrameSurface } from "./HelixAskSurfaceFrameSurface";
import {
  HelixAskVoiceConfirmationRuntimeSurface,
  type HelixAskVoiceConfirmationRuntimeSurfaceProps,
} from "./HelixAskVoiceConfirmationRuntime";
import { HelixAskWorkflowSuggestionRuntime } from "./HelixAskWorkflowSuggestionRuntime";
import { useHelixAskWorkflowQteBridge } from "./HelixAskWorkflowQteBridge";
import { buildHelixAskMinimalRuntimeWorkspaceContext } from "./HelixAskMinimalRuntimeWorkspaceContext";
import {
  buildHelixAskComposerDestinationModel,
  saveHelixOperatorNote,
  type HelixAskComposerDestinationKind,
} from "./HelixAskComposerDestination";
import { HelixAskComposerDestinationStrip } from "./HelixAskComposerDestinationStrip";
import {
  dispatchCurrentReasoningSteering,
  HELIX_REASONING_BINDING_STORAGE_KEY,
  HELIX_REASONING_BINDING_UPDATED_EVENT,
  inspectReasoningBinding,
  inspectCurrentReasoningBinding,
  inspectLatestReasoningBinding,
  inspectReasoningSteering,
  readLatestReasoningBinding,
  readReasoningBinding,
  type BrowserReasoningBinding,
  useBrowserReasoningBindingStore,
} from "@/lib/agent-access/reasoningTaskBinding";
import {
  publishBoundAgentSteeringProgress,
  subscribeBoundAgentSteeringRequests,
} from "./HelixBoundAgentSteeringBridge";
import {
  HELIX_VOICE_STEERING_FINALIZED_EVENT,
  type HelixVoiceSteeringFinalizedDetail,
} from "@/lib/helix/voice-steering-finalized";

export type HelixAskMinimalRuntimeVisibleSurfaceSlots = {
  voiceLevelMonitor?: ReactNode;
  goalPill?: ReactNode;
  steeringQueue?: ReactNode;
  supplementStack?: HelixAskSurfaceSupplementStackProps;
  voiceConfirmationRuntime?: HelixAskVoiceConfirmationRuntimeSurfaceProps;
};

export type HelixAskMinimalRuntimeShellProps = HelixAskConsoleProps & {
  onSubmitPlan?: (submitPlan: HelixAskMinimalRuntimeSubmitPlan) => void;
  runTurn?: HelixAskMinimalRuntimeTurnRunner;
  controlActions?: HelixAskMinimalRuntimeControlActions;
  visibleSurface?: HelixAskMinimalRuntimeVisibleSurfaceSlots;
};

type HelixAskMinimalRuntimeDebugDrawerState = {
  payload: string;
  payloadHash: string;
  readbackMatch: string;
  replyId: string;
};

type RecordLike = Record<string, unknown>;

function hashHelixAskMinimalRuntimeDebugPayload(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function HelixAskMinimalRuntimeShell({
  onSubmitPlan,
  runTurn,
  controlActions,
  visibleSurface,
  ...props
}: HelixAskMinimalRuntimeShellProps) {
  const shellProps = buildHelixAskConsoleRuntimeBridgeProps(props);
  const [draft, setDraft] = useState("");
  const [composerDestination, setComposerDestination] =
    useState<HelixAskComposerDestinationKind>("helix_ask");
  const composerDestinationRef = useRef<HelixAskComposerDestinationKind>("helix_ask");
  const composerDestinationChosenByOperatorRef = useRef(false);
  const [operatorNoteState, setOperatorNoteState] =
    useState<"idle" | "saving" | "saved" | "unavailable">("idle");
  const [boundAgentState, setBoundAgentState] =
    useState<"active" | "awaiting_agent_pickup" | "unavailable">("unavailable");
  const [currentReasoningBinding, setCurrentReasoningBinding] =
    useState<BrowserReasoningBinding | null>(null);
  const sharedReasoningBinding = useBrowserReasoningBindingStore((state) => state.current);
  const [selectedRuntime, setSelectedRuntime] = useState<HelixAgentRuntimeId>("codex");
  const [runtimeProviders, setRuntimeProviders] = useState(DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS);
  const [selectedLanguageModelProfile, setSelectedLanguageModelProfile] = useState<HelixLanguageModelProfileId>(() =>
    readStoredHelixAskLanguageModelProfile(),
  );
  const [selectedPinnedLanguageModel, setSelectedPinnedLanguageModel] = useState<HelixPinnedLanguageModelId | null>(() =>
    readStoredHelixAskPinnedLanguageModel(),
  );
  const [runtimeMenuOpen, setRuntimeMenuOpen] = useState(false);
  const [languageModelMenuOpen, setLanguageModelMenuOpen] = useState(false);
  const [runtimeState, setRuntimeState] = useState(createHelixAskMinimalRuntimeInitialState);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [debugDrawer, setDebugDrawer] = useState<HelixAskMinimalRuntimeDebugDrawerState | null>(null);
  const runtimeRepliesRef = useRef<readonly RecordLike[]>([]);
  const runtimeGoalWakeInFlightRef = useRef(false);
  const runtimeGoalWakeLastSubmittedKeyRef = useRef<string | null>(null);
  const hydratedChatSessionRef = useRef<string | null>(null);
  const pendingExternalPromptRef = useRef<PendingHelixAskPrompt | null>(null);
  const bindingPickupPollRef = useRef<AbortController | null>(null);
  const bindingInspectionSequenceRef = useRef(0);
  const workflowQteBridge = useHelixAskWorkflowQteBridge();
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const ensureContextSession = useAgiChatStore((state) => state.ensureContextSession);
  const addChatMessage = useAgiChatStore((state) => state.addMessage);
  const setActiveChatSession = useAgiChatStore((state) => state.setActive);
  const activeChatSessionId = useAgiChatStore((state) => state.activeId ?? null);
  const persistedReasoningBindings = useAgiChatStore(
    (state) => state.reasoningTaskBindings,
  );
  const existingContextSessionId = useAgiChatStore((state) => {
    const activeSession = state.activeId ? state.sessions[state.activeId] : undefined;
    if (activeSession?.contextId === props.contextId) return activeSession.id;
    return Object.values(state.sessions).find(
      (session) => session.contextId === props.contextId,
    )?.id;
  });
  const chatSession = useAgiChatStore((state) => (chatSessionId ? state.sessions[chatSessionId] : undefined));
  const turnRunner = runTurn ?? runHelixAskMinimalRuntimeBackendTurn;
  const selectedLanguageModelSelection = useMemo<HelixLanguageModelSelectionRequest>(
    () => selectedPinnedLanguageModel
      ? { mode: "pinned", model: selectedPinnedLanguageModel }
      : selectedLanguageModelProfile === "auto"
        ? { mode: "auto" }
        : { mode: "profile", profile: selectedLanguageModelProfile },
    [selectedLanguageModelProfile, selectedPinnedLanguageModel],
  );
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agi/agent-providers", {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`agent_providers_unavailable:${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const providers = normalizeHelixAgentProvidersResponse(payload);
        setRuntimeProviders(providers);
        setSelectedRuntime((current) => resolveSelectedHelixAgentRuntime(current, providers));
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeProviders(DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS);
        setSelectedRuntime((current) =>
          resolveSelectedHelixAgentRuntime(current, DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const shellControlActions = useMemo<HelixAskMinimalRuntimeControlActions>(() => {
    if (controlActions) return controlActions;
    return {
      ...HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS,
      debugCopy: async (payload: HelixAskMinimalRuntimeControlPayload) => {
        await HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS.debugCopy(payload);
        setDebugDrawer({
          payload: payload.debugCopyText,
          payloadHash: hashHelixAskMinimalRuntimeDebugPayload(payload.debugCopyText),
          readbackMatch: "not_checked",
          replyId: payload.replyId,
        });
      },
    };
  }, [controlActions]);

  useEffect(() => {
    runtimeRepliesRef.current = runtimeState.replies as unknown as readonly RecordLike[];
  }, [runtimeState.replies]);

  const getMinimalRuntimeSessionId = useCallback(() => {
    const sessionId = activeChatSessionId ?? chatSessionId ?? ensureContextSession(props.contextId, "Helix Ask");
    if (sessionId && sessionId !== chatSessionId) {
      setChatSessionId(sessionId);
      setActiveChatSession(sessionId);
    }
    return sessionId ?? null;
  }, [chatSessionId, ensureContextSession, props.contextId, setActiveChatSession]);

  const buildMinimalWorkspaceContextSnapshot = useCallback((sessionId: string | null): RecordLike => {
    const href = typeof window === "undefined" ? "" : window.location.href;
    return buildHelixAskMinimalRuntimeWorkspaceContext({
      sessionId,
      desktopUrl: href,
      layoutState: useWorkstationLayoutStore.getState(),
    });
  }, []);

  const appendMinimalRuntimeWakeReply = useCallback((reply: RecordLike) => {
    const turnId =
      typeof reply.turn_id === "string" && reply.turn_id.trim()
        ? reply.turn_id.trim()
        : typeof reply.id === "string" && reply.id.trim()
          ? reply.id.trim()
          : `runtime-goal-wake:${Date.now()}`;
    const content =
      typeof reply.content === "string" && reply.content.trim()
        ? reply.content
        : typeof reply.selected_final_answer === "string" && reply.selected_final_answer.trim()
          ? reply.selected_final_answer
          : typeof reply.text === "string" && reply.text.trim()
            ? reply.text
            : "Runtime goal wake completed.";
    const question =
      typeof reply.question === "string" && reply.question.trim()
        ? reply.question
        : "Runtime goal wake: visible source changed";
    setRuntimeState((state) => ({
      ...state,
      askBusy: false,
      askStatus: "Runtime goal wake completed.",
      activeTurnId: state.activeTurnId === turnId ? null : state.activeTurnId,
      activeStartedAtMs: state.activeTurnId === turnId ? null : state.activeStartedAtMs,
      replies: [
        ...state.replies.filter((entry) => entry.turn_id !== turnId),
        {
          id: turnId,
          turn_id: turnId,
          createdAtMs:
            typeof reply.createdAtMs === "number" && Number.isFinite(reply.createdAtMs)
              ? reply.createdAtMs
              : Date.now(),
          content,
          question,
          mode: "observe" as const,
          result: reply,
          debug: reply.debug,
          liveEvents: [],
        },
      ].slice(-HELIX_ASK_MINIMAL_RUNTIME_REPLY_LIMIT),
    }));
  }, []);

  useHelixAskRuntimeGoalWakeSubscriptions({
    selectedAgentRuntime: selectedRuntime,
    askRepliesRef: runtimeRepliesRef,
    runtimeGoalWakeInFlightRef,
    runtimeGoalWakeLastSubmittedKeyRef,
    getHelixAskSessionId: getMinimalRuntimeSessionId,
    buildWorkspaceContextSnapshot: buildMinimalWorkspaceContextSnapshot,
    setAskStatus: (status) => {
      setRuntimeState((state) => ({ ...state, askStatus: status }));
    },
    setAskError: (error) => {
      if (!error) return;
      setRuntimeState((state) => ({ ...state, askStatus: error }));
    },
    appendWakeReply: appendMinimalRuntimeWakeReply,
  });

  const submitMinimalRuntimeQuestion = useCallback((questionText: string, pendingPrompt: PendingHelixAskPrompt | null = null) => {
    const draftText = questionText.trim();
    if (!draftText) return false;
    const workflowQte = workflowQteBridge.resolvePending(pendingPrompt);
    if (runtimeState.askBusy) {
      workflowQteBridge.clearPending();
      pendingExternalPromptRef.current = pendingPrompt
        ? { ...pendingPrompt, question: draftText, workflowQte }
        : {
            promptId: `queued:${Date.now()}`,
            question: draftText,
            autoSubmit: true,
            workflowQte,
            createdAt: Date.now(),
          };
      return true;
    }
    workflowQteBridge.clearPending();
    const desktopUrl = typeof window === "undefined" ? "" : window.location.href;
    const sessionId = chatSessionId ?? ensureContextSession(props.contextId, "Helix Ask");
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: draftText,
      selectedRuntime,
      selectedLanguageModelProfile,
      selectedLanguageModelSelection,
      desktopUrl,
      workspaceContextSnapshot: buildMinimalWorkspaceContextSnapshot(sessionId || null),
      pendingPrompt,
      durableReplies: chatSession ? buildHelixAskMinimalRuntimeRepliesFromChatSession(chatSession) : [],
      visibleReplies: runtimeState.replies,
    });
    if (submitPlan.envelope) {
      const turnId = `ask:${crypto.randomUUID()}`;
      onSubmitPlan?.(submitPlan);
      if (sessionId) {
        setChatSessionId(sessionId);
        setActiveChatSession(sessionId);
        workflowQteBridge.recordSubmitted({
          workflowQte,
          sourceSessionId: sessionId,
          turnId,
          prompt: submitPlan.envelope.question,
        });
        addChatMessage(sessionId, {
          role: "user",
          content: submitPlan.envelope.question,
          traceId: turnId,
        });
      }
      setRuntimeState((state) =>
        startHelixAskMinimalRuntimeTurn({
          state,
          submitPlan,
          turnId,
          startedAtMs: Date.now(),
        }),
      );
      const payload = buildHelixAskMinimalRuntimeTurnPayload({
        submitPlan,
        sessionId,
        traceId: turnId,
        turnId,
        maxTokens: 8192,
      });
      if (payload) {
        void runHelixAskMinimalRuntimeInjectedTransport({
          runner: turnRunner,
          payload,
          onEvent: (event) => {
            setRuntimeState((state) =>
              recordHelixAskMinimalRuntimeStreamEvent({
                state,
                turnId,
                eventName: event.event,
                receivedAtMs: Date.now(),
              }),
            );
          },
        })
          .then((result) =>
            applyHelixAskWorkstationActionsFromResult({
              result,
              turnId,
              traceId: turnId,
            }),
          )
          .then((result) => {
            if (sessionId) {
              addChatMessage(sessionId, {
                role: "assistant",
                content: resolveHelixAskMinimalRuntimeAnswerText(result),
                traceId: turnId,
                helixAsk: {
                  schema: "helix.ask.chat_backend_observation.v1",
                  backend_ask_call_attempted: true,
                  backend_ask_entrypoint_observed: true,
                  use_backend_ask_turn_entrypoint: true,
                  turn_id: typeof result.turn_id === "string" && result.turn_id.trim() ? result.turn_id : turnId,
                  final_answer_source:
                    typeof result.final_answer_source === "string" ? result.final_answer_source : null,
                  terminal_artifact_kind:
                    typeof result.terminal_artifact_kind === "string" ? result.terminal_artifact_kind : null,
                  terminal_error_code:
                    typeof result.terminal_error_code === "string" ? result.terminal_error_code : null,
                },
              });
            }
            setRuntimeState((state) =>
              completeHelixAskMinimalRuntimeTurn({
                state,
                turnId,
                result,
                completedAtMs: Date.now(),
              }),
            );
          })
          .catch((error: unknown) => {
            if (sessionId) {
              addChatMessage(sessionId, {
                role: "assistant",
                content: error instanceof Error ? error.message : "Ask turn failed.",
                traceId: turnId,
              });
            }
            setRuntimeState((state) =>
              failHelixAskMinimalRuntimeTurn({
                state,
                turnId,
                error,
                failedAtMs: Date.now(),
              }),
            );
          });
      }
      setDraft("");
      return true;
    }
    setDraft((value) => (value === questionText ? value.trimStart() : value));
    return false;
  }, [
    addChatMessage,
    buildMinimalWorkspaceContextSnapshot,
    chatSessionId,
    ensureContextSession,
    onSubmitPlan,
    props.contextId,
    runtimeState.askBusy,
    selectedLanguageModelProfile,
    selectedLanguageModelSelection,
    selectedRuntime,
    setActiveChatSession,
    turnRunner,
    workflowQteBridge,
  ]);

  const executePendingPrompt = useCallback((pending: PendingHelixAskPrompt | null | undefined) => {
    const question = pending?.question?.trim() ?? "";
    if (!question) return;
    const claimId = resolveExternalPromptClaimId(pending, question);
    if (!claimExternalPromptSingleFlight(claimId)) return;
    clearPendingHelixAskPrompt();
    if (pending?.autoSubmit === false) {
      workflowQteBridge.replacePending(pending.workflowQte);
      setDraft(question);
      return;
    }
    workflowQteBridge.clearPending();
    submitMinimalRuntimeQuestion(question, pending);
  }, [submitMinimalRuntimeQuestion, workflowQteBridge]);

  useEffect(() => {
    if (runtimeState.askBusy) return;
    const pending = pendingExternalPromptRef.current;
    if (!pending) return;
    pendingExternalPromptRef.current = null;
    submitMinimalRuntimeQuestion(pending.question, pending);
  }, [runtimeState.askBusy, submitMinimalRuntimeQuestion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = consumePendingHelixAskPrompt();
    if (pending) executePendingPrompt(pending);
    const handlePromptEvent = (event: Event) => {
      const detail = (event as CustomEvent<PendingHelixAskPrompt>)?.detail;
      executePendingPrompt(detail);
    };
    window.addEventListener(HELIX_ASK_PROMPT_EVENT, handlePromptEvent as EventListener);
    return () => {
      window.removeEventListener(HELIX_ASK_PROMPT_EVENT, handlePromptEvent as EventListener);
    };
  }, [executePendingPrompt]);

  const runtimePickerModel = useMemo(
    () =>
      buildHelixAskRuntimePickerModel({
        selectedRuntime,
        providers: runtimeProviders,
      }),
    [runtimeProviders, selectedRuntime],
  );
  const languageModelPickerModel = useMemo(
    () => buildHelixAskLanguageModelPickerModel({
      selectedProfile: selectedLanguageModelProfile,
      selectedPinnedModel: selectedPinnedLanguageModel,
    }),
    [selectedLanguageModelProfile, selectedPinnedLanguageModel],
  );
  const composerViewModel = useMemo(
    () =>
      buildHelixAskComposerViewModel({
        busy: runtimeState.askBusy,
        placeholder: shellProps.placeholder,
        runtimeLabel: runtimePickerModel.selectedLabel,
      }),
    [runtimePickerModel.selectedLabel, runtimeState.askBusy, shellProps.placeholder],
  );
  const selectedHelixConversationId = activeChatSessionId ?? chatSessionId;
  const displayBinding = [sharedReasoningBinding, currentReasoningBinding].find(binding =>
    binding?.status === "active" && binding.helix_conversation_id === selectedHelixConversationId);
  const latestIssuedReasoningBinding = typeof window === "undefined"
    ? null
    : readLatestReasoningBinding();
  const exactBindingIsActive = [
    sharedReasoningBinding,
    currentReasoningBinding,
    latestIssuedReasoningBinding,
    selectedHelixConversationId
      ? persistedReasoningBindings[selectedHelixConversationId] ?? null
      : null,
    readReasoningBinding(selectedHelixConversationId),
  ].some((binding) => binding?.status === "active" && (
    binding.helix_conversation_id === selectedHelixConversationId ||
    binding === sharedReasoningBinding ||
    binding === currentReasoningBinding
  ));
  const effectiveBoundAgentState = exactBindingIsActive && boundAgentState !== "awaiting_agent_pickup"
    ? "active"
    : boundAgentState;
  const composerDestinationModel = useMemo(
    () => buildHelixAskComposerDestinationModel({
      kind: composerDestination,
      runtimeLabel: runtimePickerModel.selectedLabel,
      busy: runtimeState.askBusy,
      noteState: operatorNoteState,
      boundAgentState: effectiveBoundAgentState,
    }),
    [
      composerDestination,
      effectiveBoundAgentState,
      operatorNoteState,
      runtimePickerModel.selectedLabel,
      runtimeState.askBusy,
    ],
  );
  const dispatchToBoundAgent = useCallback(async (
    text: string,
    origin: "typed" | "gpt_live_finalized",
    clientEventRef: string,
  ): Promise<boolean> => {
    const candidateSessionId = activeChatSessionId ?? chatSessionId;
    if (!candidateSessionId) {
      setBoundAgentState("unavailable");
      setRuntimeState((state) => ({ ...state,
        askStatus: "Select the Helix chat to receive this prompt before submitting to a bound task." }));
      return false;
    }
    const verifiedPanelCandidate = [
      readLatestReasoningBinding(),
      sharedReasoningBinding,
      currentReasoningBinding,
    ]
      .find((candidate) => candidate?.status === "active" &&
        candidate.helix_conversation_id === candidateSessionId) ?? null;
    const bindingCandidates = [
      sharedReasoningBinding,
      currentReasoningBinding,
      readReasoningBinding(candidateSessionId),
      candidateSessionId ? persistedReasoningBindings[candidateSessionId] ?? null : null,
    ].filter((candidate) =>
      candidate != null && candidate.helix_conversation_id === candidateSessionId,
    );
    // Resolve the selected chat through the authenticated server before using
    // any browser projection. Stored `active` is only a historical status and
    // can outlive the short lease; it must never mask a newer exact binding.
    let binding: BrowserReasoningBinding | null = null;
    try {
      const authoritative = binding ?? (candidateSessionId
        ? await inspectCurrentReasoningBinding(candidateSessionId) : null);
      if (authoritative?.status === "active" && authoritative.helix_conversation_id === candidateSessionId) {
        binding = authoritative;
        setCurrentReasoningBinding(authoritative);
        setBoundAgentState("active");
      }
    } catch {
      // Browser projections and the selected-chat lookup remain fail-closed fallbacks.
    }
    if (!binding && verifiedPanelCandidate) {
      try {
        const authoritative = await inspectReasoningBinding(
          verifiedPanelCandidate.reasoning_binding_id,
        );
        if (authoritative.status === "active" && authoritative.helix_conversation_id === candidateSessionId) {
          binding = authoritative;
          setCurrentReasoningBinding(authoritative);
          setBoundAgentState("active");
        }
      } catch {
        // The authenticated selected-chat lookup below is the only fallback.
      }
    }
    if (!binding && candidateSessionId) {
      try {
        const authoritative = await inspectCurrentReasoningBinding(candidateSessionId);
        if (authoritative.status === "active" && authoritative.helix_conversation_id === candidateSessionId) {
          binding = authoritative;
          setCurrentReasoningBinding(authoritative);
          setBoundAgentState("active");
        }
      } catch {
        // Exact remembered candidates are verified below; no other chat may
        // substitute for the selected destination.
      }
    }
    if (!binding) {
      for (const candidate of bindingCandidates) {
        try {
          const authoritative = await inspectReasoningBinding(candidate.reasoning_binding_id);
          if (
            authoritative.status === "active" &&
            authoritative.helix_conversation_id === candidateSessionId
          ) {
            binding = authoritative;
            setCurrentReasoningBinding(authoritative);
            setBoundAgentState("active");
            break;
          }
        } catch {
          // Continue only across projections for this exact selected chat.
        }
      }
    }
    const sessionId = binding?.helix_conversation_id ?? candidateSessionId ??
      ensureContextSession(props.contextId, "Helix Ask");
    if (!sessionId || !binding || binding.status !== "active") {
      console.warn("[helix-bound-agent] exact binding unavailable", {
        candidateSessionId,
        candidates: bindingCandidates.map((candidate) => candidate
          ? {
              bindingId: candidate.reasoning_binding_id,
              conversationId: candidate.helix_conversation_id,
              status: candidate.status,
            }
          : null),
      });
      setBoundAgentState("unavailable");
      setRuntimeState((state) => ({
        ...state,
        askStatus: "No active exact-task binding. Save a local note or bind this Helix chat in Agent Connections.",
      }));
      return false;
    }
    setBoundAgentState("awaiting_agent_pickup");
    try {
      // Pin the verified target in the write. A replacement between this read
      // and submission must reject, never inherit the prompt or trigger another
      // mutation through a compatibility fallback.
      const dispatch = await dispatchCurrentReasoningSteering({
          helixConversationId: sessionId,
          bindingId: binding.reasoning_binding_id,
          bindingEpoch: binding.binding_epoch,
          runId: binding.run_id ?? null,
          clientEventRef,
          origin,
          instructionText: text,
        });
      setChatSessionId(sessionId);
      setActiveChatSession(sessionId);
      // The same accepted transport request can be replayed after a lost
      // response. Preserve one visible prompt per exact binding/request tuple.
      useAgiChatStore.getState().appendMessageOnce(sessionId, {
        id: `bound-steering:${JSON.stringify([binding.reasoning_binding_id, binding.binding_epoch, clientEventRef])}`,
        at: new Date().toISOString(),
        role: "user",
        content: text,
        traceId: clientEventRef,
      });
      const event = dispatch.event;
      const progressTarget = { steeringEventRef: event?.steering_event_ref,
        reasoningBindingId: binding.reasoning_binding_id, bindingEpoch: binding.binding_epoch,
        helixConversationId: sessionId };
      bindingPickupPollRef.current?.abort();
      if (event?.delivery_state === "acknowledged") {
        setBoundAgentState("active");
        setRuntimeState((state) => ({ ...state,
          askStatus: "The bound agent acknowledged exact pickup. This confirms transport pickup, not task completion.",
        }));
        publishBoundAgentSteeringProgress(clientEventRef, "acknowledged", progressTarget);
        return true;
      }
      if (event?.delivery_state && event.delivery_state !== "pending") {
        setBoundAgentState("unavailable");
        setRuntimeState((state) => ({ ...state,
          askStatus: `Exact pickup ended with ${event.delivery_state}; no provider answer is claimed.`,
        }));
        publishBoundAgentSteeringProgress(clientEventRef, event.delivery_state, progressTarget);
        return true;
      }
      setRuntimeState((state) => ({
        ...state,
        askStatus: "Steering queued for exact agent pickup. Provider delivery is not claimed until acknowledgement.",
      }));
      publishBoundAgentSteeringProgress(clientEventRef, "queued", progressTarget);
      if (event?.steering_event_ref) {
        bindingPickupPollRef.current?.abort();
        const controller = new AbortController();
        bindingPickupPollRef.current = controller;
        void (async () => {
          for (let attempt = 0; attempt < 30 && !controller.signal.aborted; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
            if (controller.signal.aborted) return;
            try {
              const current = await inspectReasoningSteering({
                bindingId: binding.reasoning_binding_id,
                bindingEpoch: binding.binding_epoch,
                eventRef: event.steering_event_ref!,
              });
              if (current.delivery_state === "acknowledged") {
                setBoundAgentState("active");
                setRuntimeState((state) => ({
                  ...state,
                  askStatus: "The bound agent acknowledged exact pickup. This confirms transport pickup, not task completion.",
                }));
                publishBoundAgentSteeringProgress(clientEventRef, "acknowledged", progressTarget);
                return;
              }
              if (current.delivery_state !== "pending") {
                setBoundAgentState("unavailable");
                setRuntimeState((state) => ({
                  ...state,
                  askStatus: `Exact pickup ended with ${current.delivery_state}; no provider answer is claimed.`,
                }));
                publishBoundAgentSteeringProgress(
                  clientEventRef,
                  current.delivery_state,
                  progressTarget,
                );
                return;
              }
            } catch {
              setBoundAgentState("unavailable");
              setRuntimeState((state) => ({
                ...state,
                askStatus: "Exact pickup status became unavailable; no provider delivery is claimed.",
              }));
              publishBoundAgentSteeringProgress(clientEventRef, "unavailable", progressTarget);
              return;
            }
          }
          if (!controller.signal.aborted) {
            setBoundAgentState("active");
            setRuntimeState((state) => ({
              ...state,
              askStatus: "Steering remains queued without an acknowledgement. The exact binding is still active.",
            }));
            publishBoundAgentSteeringProgress(clientEventRef, "unavailable", progressTarget);
          }
        })();
      }
      return true;
    } catch {
      setBoundAgentState("unavailable");
      setRuntimeState((state) => ({
        ...state,
        askStatus: "The bound agent steering request was rejected or became stale.",
      }));
      return false;
    }
  }, [activeChatSessionId, addChatMessage, chatSessionId, currentReasoningBinding, ensureContextSession, persistedReasoningBindings, props.contextId, setActiveChatSession, sharedReasoningBinding]);

  useEffect(() => {
    return subscribeBoundAgentSteeringRequests(dispatchToBoundAgent);
  }, [dispatchToBoundAgent]);

  useEffect(() => () => bindingPickupPollRef.current?.abort(), []);

  const submitCurrentDraft = useCallback((destinationOverride?: HelixAskComposerDestinationKind) => {
    const destination = destinationOverride ?? composerDestinationRef.current;
    if (destination === "operator_note") {
      if (!draft.trim()) return;
      setOperatorNoteState("saving");
      try {
        saveHelixOperatorNote(draft);
        setDraft("");
        setOperatorNoteState("saved");
        setRuntimeState((state) => ({
          ...state,
          askStatus: "Operator note saved locally. No provider delivery was claimed.",
        }));
      } catch {
        setOperatorNoteState("unavailable");
        setRuntimeState((state) => ({
          ...state,
          askStatus: "Operator note could not be saved on this device.",
        }));
      }
      return;
    }
    if (destination === "bound_agent") {
      const text = draft.trim();
      if (!text) return;
      const eventRef = `typed:${crypto.randomUUID()}`;
      void dispatchToBoundAgent(text, "typed", eventRef).then((accepted) => {
        if (accepted) setDraft("");
      });
      return;
    }
    submitMinimalRuntimeQuestion(draft);
  }, [dispatchToBoundAgent, draft, submitMinimalRuntimeQuestion]);

  useEffect(() => {
    const inspectionSequence = ++bindingInspectionSequenceRef.current;
    const preferredBinding = readReasoningBinding(activeChatSessionId ?? chatSessionId);
    const latestBinding = readLatestReasoningBinding();
    const binding = [preferredBinding, latestBinding].find(
      (candidate) => candidate?.status === "active",
    ) ?? [preferredBinding, latestBinding].filter(
      (candidate): candidate is BrowserReasoningBinding => candidate != null,
    ).sort((left, right) => right.binding_epoch - left.binding_epoch)[0] ?? null;
    if (!binding) {
      setCurrentReasoningBinding(null);
      setBoundAgentState("unavailable");
      return;
    }
    setCurrentReasoningBinding(binding);
    setBoundAgentState(binding.status === "active" ? "active" : "unavailable");
    void inspectReasoningBinding(binding.reasoning_binding_id).then((current) => {
      if (bindingInspectionSequenceRef.current !== inspectionSequence) return;
      setCurrentReasoningBinding(current);
      setBoundAgentState(current.status === "active" ? "active" : "unavailable");
    }).catch(() => {
      if (bindingInspectionSequenceRef.current === inspectionSequence) {
        setBoundAgentState("unavailable");
      }
    });
  }, [activeChatSessionId, chatSessionId]);

  useEffect(() => {
    const helixConversationId = activeChatSessionId ?? chatSessionId;
    if (!helixConversationId) return;
    let cancelled = false;
    const synchronizeServerBinding = async () => {
      try {
        const binding = composerDestination === "bound_agent"
          ? await inspectLatestReasoningBinding()
          : await inspectCurrentReasoningBinding(helixConversationId);
        if (cancelled) return;
        bindingInspectionSequenceRef.current += 1;
        setCurrentReasoningBinding((current) => {
          if (
            binding.status !== "active" &&
            current?.status === "active" &&
            current.reasoning_binding_id !== binding.reasoning_binding_id
          ) {
            return current;
          }
          setBoundAgentState(binding.status === "active" ? "active" : "unavailable");
          return binding;
        });
        if (
          composerDestination === "bound_agent" &&
          binding.status === "active" &&
          useAgiChatStore.getState().sessions[binding.helix_conversation_id]
        ) {
          setChatSessionId(binding.helix_conversation_id);
          setActiveChatSession(binding.helix_conversation_id);
        }
      } catch {
        // A missing binding is an expected unavailable state. Existing local
        // projection remains visible until an authoritative status replaces it.
      }
    };
    void synchronizeServerBinding();
    if (composerDestination !== "bound_agent") {
      return () => { cancelled = true; };
    }
    const interval = window.setInterval(() => void synchronizeServerBinding(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeChatSessionId, chatSessionId, composerDestination, setActiveChatSession]);

  useEffect(() => {
    if (composerDestination !== "bound_agent") return;
    let cancelled = false;
    void inspectLatestReasoningBinding().then((binding) => {
      if (cancelled) return;
      setCurrentReasoningBinding(binding);
      setBoundAgentState(binding.status === "active" ? "active" : "unavailable");
    }).catch(() => {
      if (!cancelled) setBoundAgentState("unavailable");
    });
    return () => { cancelled = true; };
  }, [composerDestination]);

  useEffect(() => {
    const synchronizeRememberedBinding = () => {
      // Once the operator selects the exact-task destination, browser storage
      // is only historical projection. Binding epochs are service-local, so an
      // older service can otherwise overwrite the authenticated current epoch.
      if (composerDestination === "bound_agent") return;
      const binding = readLatestReasoningBinding();
      if (!binding) return;
      setCurrentReasoningBinding((current) => {
        if (
          current?.reasoning_binding_id === binding.reasoning_binding_id &&
          current.status === binding.status
        ) return current;
        setBoundAgentState(binding.status === "active" ? "active" : "unavailable");
        return binding;
      });
    };
    synchronizeRememberedBinding();
    const interval = window.setInterval(synchronizeRememberedBinding, 1_000);
    return () => window.clearInterval(interval);
  }, [composerDestination]);

  useEffect(() => {
    if (!sharedReasoningBinding) return;
    bindingInspectionSequenceRef.current += 1;
    setCurrentReasoningBinding(sharedReasoningBinding);
    setBoundAgentState(sharedReasoningBinding.status === "active" ? "active" : "unavailable");
    if (
      sharedReasoningBinding.status === "active" &&
      useAgiChatStore.getState().sessions[sharedReasoningBinding.helix_conversation_id]
    ) {
      setChatSessionId(sharedReasoningBinding.helix_conversation_id);
      setActiveChatSession(sharedReasoningBinding.helix_conversation_id);
    }
  }, [setActiveChatSession, sharedReasoningBinding]);

  useEffect(() => {
    const activeBinding = [currentReasoningBinding, sharedReasoningBinding].find(
      (candidate) => candidate?.status === "active",
    );
    if (!activeBinding || composerDestinationChosenByOperatorRef.current) return;
    composerDestinationRef.current = "bound_agent";
    setComposerDestination("bound_agent");
  }, [currentReasoningBinding, sharedReasoningBinding]);

  useEffect(() => {
    const applyBinding = (binding: BrowserReasoningBinding | null) => {
      if (!binding) return;
      bindingInspectionSequenceRef.current += 1;
      setCurrentReasoningBinding(binding);
      setBoundAgentState(binding.status === "active" ? "active" : "unavailable");
      if (
        binding.status === "active" &&
        useAgiChatStore.getState().sessions[binding.helix_conversation_id]
      ) {
        setChatSessionId(binding.helix_conversation_id);
        setActiveChatSession(binding.helix_conversation_id);
      }
    };
    const onBindingUpdated = (event: Event) => {
      applyBinding((event as CustomEvent<BrowserReasoningBinding>).detail ?? null);
    };
    const onBindingStorageUpdated = (event: StorageEvent) => {
      if (event.key !== HELIX_REASONING_BINDING_STORAGE_KEY) return;
      applyBinding(readLatestReasoningBinding());
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingUpdated);
    window.addEventListener("storage", onBindingStorageUpdated);
    return () => {
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingUpdated);
      window.removeEventListener("storage", onBindingStorageUpdated);
    };
  }, [activeChatSessionId, chatSessionId, setActiveChatSession]);

  useEffect(() => {
    const onFinalizedVoice = (event: Event) => {
      if (event.defaultPrevented) return;
      const voiceEvent = event as CustomEvent<HelixVoiceSteeringFinalizedDetail>;
      if (voiceEvent.detail?.destination !== "message_codex") return;
      const transcript = voiceEvent.detail?.transcript?.trim();
      if (!transcript) return;
      event.preventDefault();
      void dispatchToBoundAgent(
        transcript,
        "gpt_live_finalized",
        voiceEvent.detail.clientEventRef,
      );
    };
    window.addEventListener(HELIX_VOICE_STEERING_FINALIZED_EVENT, onFinalizedVoice);
    return () => window.removeEventListener(HELIX_VOICE_STEERING_FINALIZED_EVENT, onFinalizedVoice);
  }, [composerDestination, dispatchToBoundAgent, effectiveBoundAgentState]);

  useEffect(() => {
    const preferredSessionId = activeChatSessionId ?? existingContextSessionId;
    if (!preferredSessionId || preferredSessionId === chatSessionId) return;
    // The operator-selected chat is global workstation state. A shell mounted
    // for another panel context may hydrate its local transcript from that
    // selection, but must never replace the global selection with an older
    // context-matching session.
    setChatSessionId(preferredSessionId);
    if (!activeChatSessionId) setActiveChatSession(preferredSessionId);
  }, [activeChatSessionId, chatSessionId, existingContextSessionId, setActiveChatSession]);

  useEffect(() => {
    if (!chatSession || hydratedChatSessionRef.current === chatSession.id) return;
    const hydratedReplies = buildHelixAskMinimalRuntimeRepliesFromChatSession(chatSession);
    hydratedChatSessionRef.current = chatSession.id;
    if (hydratedReplies.length === 0) return;
    setRuntimeState((state) => {
      if (state.replies.length > 0) return state;
      return {
        ...state,
        replies: hydratedReplies,
      };
    });
  }, [chatSession]);

  return (
    <HelixAskConsoleRuntimeLayout
      className={shellProps.className}
      layoutVariant={shellProps.layoutVariant ?? "hero"}
      surface={
        <div
          className="relative z-10"
          data-testid="helix-ask-minimal-runtime-shell"
        >
          <HelixAskSurfaceFrameSurface
            maxWidthClassName={
              shellProps.maxWidthClassName ??
              (shellProps.layoutVariant === "dock" ? "max-w-none" : "mx-auto max-w-4xl")
            }
            surfaceBorderClassName="border-cyan-300/20"
            surfaceTintClassName="bg-cyan-400/[0.03]"
            surfaceHaloClassName="shadow-[0_0_80px_rgba(34,211,238,0.08)]"
            isOffline={false}
            onPrimeInteraction={() => undefined}
            onSubmit={(event) => {
              event.preventDefault();
              const selectedDestination = (
                event.currentTarget.elements.namedItem("helix-composer-destination") as HTMLSelectElement | null
              )?.value as HelixAskComposerDestinationKind | undefined;
              submitCurrentDraft(selectedDestination);
            }}
          >
            <div className="relative z-[90] flex justify-end px-4 pt-3">
              <HelixAskLanguageModelPicker
                model={languageModelPickerModel}
                menuOpen={languageModelMenuOpen}
                onPrimaryClick={() => {
                  setRuntimeMenuOpen(false);
                  setLanguageModelMenuOpen((open) => !open);
                }}
                onSelect={(selection: HelixAskLanguageModelPickerSelection) => {
                  if (selection.kind === "pinned") {
                    setSelectedPinnedLanguageModel(selection.model);
                    persistHelixAskPinnedLanguageModel(selection.model);
                  } else {
                    setSelectedLanguageModelProfile(selection.profile);
                    persistHelixAskLanguageModelProfile(selection.profile);
                    setSelectedPinnedLanguageModel(null);
                    persistHelixAskPinnedLanguageModel(null);
                  }
                  setLanguageModelMenuOpen(false);
                }}
              />
            </div>
            {visibleSurface?.voiceLevelMonitor}
            <HelixAskLegacyComposerSurface
              destination={
                <HelixAskComposerDestinationStrip
                  model={composerDestinationModel}
                  onDestinationChange={(kind) => {
                    composerDestinationChosenByOperatorRef.current = true;
                    composerDestinationRef.current = kind;
                    setComposerDestination(kind);
                    setOperatorNoteState("idle");
                  }}
                />
              }
              voiceLevelMonitor={{
                visible: false,
                maxHeightPx: 0,
                level: 0,
                signalState: "low",
              }}
              moodAvatar={{
                auraClassName: "border-cyan-300/25 bg-cyan-400/10 shadow-[0_0_28px_rgba(34,211,238,0.18)]",
                ringClassName: "ring-cyan-200/25",
                moodSrc: null,
                moodLabel: "Helix",
                onImageError: () => undefined,
              }}
              actionToolbar={{
                imageInputRef,
                onImageSelect: () => undefined,
                onAttachImage: () => imageInputRef.current?.click(),
                attachDisabled: true,
                hasReadyAttachment: false,
                hasAnyAttachment: false,
                micEnabled: false,
                voiceTranscribing: false,
                onToggleMic: () => undefined,
                showRetryVoiceSample: false,
                retryVoiceSampleDisabled: true,
                onRetryVoiceSample: () => undefined,
                showVisualCaptureControls: true,
                visualSituationSourceStatus: "idle",
                onCaptureVisualSource: () => undefined,
                visualSituationIncludeAudio: false,
                displayAudioStatus: "idle",
                visualAudioToggleDisabled: true,
                onToggleVisualAudio: () => undefined,
                runtimePickerModel,
                runtimeMenuOpen,
                onRuntimePrimaryClick: () => {
                  setLanguageModelMenuOpen(false);
                  setRuntimeMenuOpen((open) => !open);
                },
                onRuntimeSelect: (runtime) => {
                  setSelectedRuntime(runtime);
                  setRuntimeMenuOpen(false);
                  setLanguageModelMenuOpen(false);
                },
                submitViewModel: composerViewModel,
                onSubmitIntent: submitCurrentDraft,
                onStop: () => undefined,
              }}
              textarea={{
                ariaDisabled: runtimeState.askBusy,
                className: composerViewModel.textareaClassName,
                placeholder: composerViewModel.currentPlaceholder,
                value: draft,
                onInputValue: (value) => setDraft(value),
                onSubmitRequested: (form) => form?.requestSubmit(),
              }}
              textareaRef={askInputRef}
            />
          </HelixAskSurfaceFrameSurface>
          {visibleSurface?.supplementStack ? (
            <HelixAskSurfaceSupplementStack {...visibleSurface.supplementStack} />
          ) : null}
          {visibleSurface?.voiceConfirmationRuntime ? (
            <HelixAskVoiceConfirmationRuntimeSurface {...visibleSurface.voiceConfirmationRuntime} />
          ) : null}
          <HelixAskRuntimeStatusLine text={runtimeState.askStatus} />
          {displayBinding ? <BoundAgentPromptDisplay
            key={`${displayBinding.reasoning_binding_id}:${displayBinding.binding_epoch}:${displayBinding.helix_conversation_id}`}
            binding={displayBinding} /> : null}
          <HelixAskMinimalRuntimeTurnList
            replies={runtimeState.replies}
            className={shellProps.replyListClassName ?? "relative z-10 mt-4 space-y-5"}
            controlActions={shellControlActions}
          />
        </div>
      }
      workflowSuggestion={
        <HelixAskWorkflowSuggestionRuntime
          latestPayload={runtimeState.replies[runtimeState.replies.length - 1] ?? null}
        />
      }
      goalPill={visibleSurface?.goalPill}
      steeringQueue={visibleSurface?.steeringQueue}
      debugDrawer={debugDrawer ? (
        <HelixAskDebugDrawer
          payload={debugDrawer.payload}
          payloadHash={debugDrawer.payloadHash}
          readbackMatch={debugDrawer.readbackMatch}
          replyId={debugDrawer.replyId}
          onClose={() => setDebugDrawer(null)}
        />
      ) : null}
    />
  );
}
