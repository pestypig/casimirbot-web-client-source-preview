import { useEffect, type MutableRefObject } from "react";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import {
  fetchActiveRuntimeGoalSession,
  submitRuntimeGoalWakeCandidate,
  type RuntimeGoalWakeCandidatePayload,
} from "@/lib/agi/api";
import {
  HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT,
  type HelixActiveDocVisibleTranslationContextChangedEventDetail,
} from "@/lib/docs/visibleTranslationContext";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import {
  buildHelixAskRuntimeGoalActiveGoalFromSession,
  buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision,
  buildHelixAskRuntimeGoalWakePostDecision,
  buildHelixAskRuntimeGoalWakeReply,
  selectHelixAskActiveRuntimeGoalFromReplies,
  type HelixAskRuntimeGoalWakePostDecision,
} from "./HelixAskRuntimeGoalWakeEmitter";
import {
  HELIX_ASK_REALTIME_GOAL_WAKE_REQUEST_EVENT,
  type HelixAskRealtimeGoalWakeRequestEventDetail,
} from "./HelixAskRealtimeWorkerDispatch";

type RecordLike = Record<string, unknown>;

export function useHelixAskRuntimeGoalWakeSubscriptions(input: {
  selectedAgentRuntime: HelixAgentRuntimeId;
  askRepliesRef: MutableRefObject<readonly RecordLike[]>;
  runtimeGoalWakeInFlightRef: MutableRefObject<boolean>;
  runtimeGoalWakeLastSubmittedKeyRef: MutableRefObject<string | null>;
  getHelixAskSessionId: () => string | null;
  buildWorkspaceContextSnapshot: (sessionId: string | null) => RecordLike;
  setAskStatus: (status: string) => void;
  setAskError: (error: string | null) => void;
  appendWakeReply: (reply: RecordLike) => void;
  debounceMs?: number;
}): void {
  const {
    selectedAgentRuntime,
    askRepliesRef,
    runtimeGoalWakeInFlightRef,
    runtimeGoalWakeLastSubmittedKeyRef,
    getHelixAskSessionId,
    buildWorkspaceContextSnapshot,
    setAskStatus,
    setAskError,
    appendWakeReply,
    debounceMs = 450,
  } = input;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let wakeTimer: number | null = null;
    let visibleSurfaceWakeTimer: number | null = null;
    const clearWakeTimer = () => {
      if (wakeTimer !== null) {
        window.clearTimeout(wakeTimer);
        wakeTimer = null;
      }
    };
    const clearVisibleSurfaceWakeTimer = () => {
      if (visibleSurfaceWakeTimer !== null) {
        window.clearTimeout(visibleSurfaceWakeTimer);
        visibleSurfaceWakeTimer = null;
      }
    };
    const submitWakeDecision = (
      wakePostDecision: HelixAskRuntimeGoalWakePostDecision,
      fallbackQuestion: string,
      queuedStatus: string,
    ) => {
      if (!wakePostDecision.shouldSubmit || !wakePostDecision.candidate) return;
      const { candidate, dedupeKey } = wakePostDecision;
      runtimeGoalWakeInFlightRef.current = true;
      runtimeGoalWakeLastSubmittedKeyRef.current = dedupeKey;
      setAskStatus(queuedStatus);
      void submitRuntimeGoalWakeCandidate(candidate)
        .then((response) => {
          const responseRecord = response as unknown as RecordLike;
          const admission = responseRecord.runtime_goal_wake_admission as RecordLike | undefined;
          const admitted = admission?.status === "admitted";
          setAskStatus(admitted ? "Runtime goal wake completed." : "Runtime goal wake rejected.");
          appendWakeReply(
            buildHelixAskRuntimeGoalWakeReply({
              response: responseRecord,
              fallbackQuestion,
            }),
          );
        })
        .catch((error) => {
          if (dedupeKey && runtimeGoalWakeLastSubmittedKeyRef.current === dedupeKey) {
            runtimeGoalWakeLastSubmittedKeyRef.current = null;
          }
          setAskStatus("Runtime goal wake failed.");
          setAskError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          runtimeGoalWakeInFlightRef.current = false;
        });
    };
    const resolveActiveGoal = async () => {
      const localGoal = selectHelixAskActiveRuntimeGoalFromReplies(askRepliesRef.current);
      if (localGoal) return localGoal;
      try {
        const response = await fetchActiveRuntimeGoalSession();
        return buildHelixAskRuntimeGoalActiveGoalFromSession(response.runtime_goal_session);
      } catch {
        return null;
      }
    };
    const unsubscribe = useDocViewerStore.subscribe((state, previousState) => {
      if (state.mode !== "doc") return;
      const docPath = typeof state.currentPath === "string" ? state.currentPath.trim() : "";
      const previousDocPath =
        typeof previousState.currentPath === "string" ? previousState.currentPath.trim() : "";
      if (!docPath || docPath === previousDocPath) return;
      clearWakeTimer();
      wakeTimer = window.setTimeout(() => {
        void resolveActiveGoal().then((activeGoal) => {
          const workspaceContextSnapshot = buildWorkspaceContextSnapshot(getHelixAskSessionId());
          const wakePostDecision = buildHelixAskRuntimeGoalWakePostDecision({
            activeGoal,
            selectedAgentRuntime,
            docPath,
            workspaceContextSnapshot,
            inFlight: runtimeGoalWakeInFlightRef.current,
            lastSubmittedDedupeKey: runtimeGoalWakeLastSubmittedKeyRef.current,
          });
          submitWakeDecision(
            wakePostDecision,
            "Runtime goal wake: visible source changed",
            "Runtime goal wake queued for visible source change...",
          );
        });
      }, debounceMs);
    });
    const handleVisibleContextChanged = (event: Event) => {
      const detail = (event as CustomEvent<HelixActiveDocVisibleTranslationContextChangedEventDetail>).detail;
      const context = detail?.context;
      const previousContext = detail?.previous_context;
      const docPath = typeof context?.doc_path === "string" ? context.doc_path.trim() : "";
      const previousDocPath =
        typeof previousContext?.doc_path === "string" ? previousContext.doc_path.trim() : "";
      if (!docPath || !previousDocPath || docPath !== previousDocPath) return;
      clearVisibleSurfaceWakeTimer();
      visibleSurfaceWakeTimer = window.setTimeout(() => {
        void resolveActiveGoal().then((activeGoal) => {
          const workspaceContextSnapshot = buildWorkspaceContextSnapshot(getHelixAskSessionId());
          const wakePostDecision = buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision({
            activeGoal,
            selectedAgentRuntime,
            docPath,
            workspaceContextSnapshot,
            activeVisibleContext: context as unknown as RecordLike,
            observedAtMs: detail.observed_at_ms,
            inFlight: runtimeGoalWakeInFlightRef.current,
            lastSubmittedDedupeKey: runtimeGoalWakeLastSubmittedKeyRef.current,
          });
          submitWakeDecision(
            wakePostDecision,
            "Runtime goal wake: visible surface changed",
            "Runtime goal wake queued for visible surface change...",
          );
        });
      }, debounceMs);
    };
    const handleRealtimeGoalWakeRequest = (event: Event) => {
      const detail = (event as CustomEvent<HelixAskRealtimeGoalWakeRequestEventDetail>).detail;
      const request = detail?.request;
      if (!request?.goalId || !request.handoffId || !request.transcript.trim()) return;

      detail.accepted = true;
      const dedupeKey = `realtime-goal-wake:${request.handoffId}`;
      if (runtimeGoalWakeLastSubmittedKeyRef.current === dedupeKey) return;

      const candidate: RuntimeGoalWakeCandidatePayload = {
        goalId: request.goalId,
        eventKind: "manual_resume",
        sourceKind: "realtime_transcript",
        sourceId: request.observationRef,
        sourceHash: request.transcriptHash,
        sourceLabel: "GPT Live transcript",
        reason: "realtime_durable_goal_voice_turn",
        dedupeKey,
        freshnessStatus: "fresh",
        observedAtMs: request.observedAtMs,
        requiresUserVisibleTurn: true,
        agentRuntime: request.runtimeAgentProvider as HelixAgentRuntimeId | null ?? selectedAgentRuntime,
        turnId: `${request.handoffId}:goal-wake`,
        realtimeHandoffId: request.realtimeHandoffId,
        question: request.transcript,
        workspaceContextSnapshot: {
          ...buildWorkspaceContextSnapshot(getHelixAskSessionId()),
          ...(request.sourceBinding
            ? { realtime_stage_play_source_binding: request.sourceBinding }
            : {}),
        },
      };
      submitWakeDecision(
        {
          shouldSubmit: true,
          reason: "candidate_ready",
          candidate,
          dedupeKey,
        },
        request.transcript,
        "Runtime goal wake queued from Live Voice...",
      );
    };
    window.addEventListener(HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT, handleVisibleContextChanged);
    window.addEventListener(HELIX_ASK_REALTIME_GOAL_WAKE_REQUEST_EVENT, handleRealtimeGoalWakeRequest);
    return () => {
      clearWakeTimer();
      clearVisibleSurfaceWakeTimer();
      window.removeEventListener(HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT, handleVisibleContextChanged);
      window.removeEventListener(HELIX_ASK_REALTIME_GOAL_WAKE_REQUEST_EVENT, handleRealtimeGoalWakeRequest);
      unsubscribe();
    };
  }, [
    selectedAgentRuntime,
    askRepliesRef,
    runtimeGoalWakeInFlightRef,
    runtimeGoalWakeLastSubmittedKeyRef,
    getHelixAskSessionId,
    buildWorkspaceContextSnapshot,
    setAskStatus,
    setAskError,
    appendWakeReply,
    debounceMs,
  ]);
}
