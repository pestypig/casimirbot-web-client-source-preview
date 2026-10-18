import React, { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptConfirmPolicyReason } from "@/lib/helix/ask-voice-transcript-confidence";

import {
  HelixAskTranscriptConfirmationPanel,
  HelixAskVoiceCommandConfirmationPanel,
} from "./HelixAskVoiceConfirmationPanel";
import { buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection } from "./HelixAskVoiceTurnAssemblyController";

export const HELIX_ASK_VOICE_CONFIRMATION_COUNTDOWN_MS = 3_000;
export const HELIX_ASK_VOICE_CONFIRMATION_TICK_MS = 120;

export type HelixAskVoiceCommandConfirmationCandidate = {
  id: string;
  action: "send" | "cancel" | "retry";
  transcript: string;
};

export type HelixAskVoiceTranscriptConfirmationCandidate = {
  id: string;
  transcript: string;
  sourceText?: string | null;
  sourceLanguage?: string | null;
  languageConfidence?: number | null;
  pivotConfidence?: number | null;
  dispatchState?: "auto" | "confirm" | "blocked" | null;
  translated: boolean;
  translationUncertain: boolean;
  confidence: number;
  speechProbability?: number | null;
  snrDb?: number | null;
};

export type HelixAskVoiceConfirmationActivity = {
  speechActive: boolean;
  queuedSegmentCount: number;
};

export type HelixAskVoiceConfirmationRuntimeEvent =
  | {
      type: "command_countdown_started" | "command_countdown_fired" | "command_preempted";
      candidateId: string;
      action: HelixAskVoiceCommandConfirmationCandidate["action"];
    }
  | {
      type:
        | "transcript_countdown_started"
        | "transcript_countdown_fired"
        | "transcript_countdown_cancelled"
        | "transcript_waiting_for_inactivity";
      candidateId: string;
    }
  | {
      type: "transcript_countdown_blocked";
      candidateId: string;
      reason: TranscriptConfirmPolicyReason;
    };

export type HelixAskVoiceConfirmationRuntimeOptions = {
  micEnabled: boolean;
  commandCandidate: HelixAskVoiceCommandConfirmationCandidate | null;
  transcriptCandidate: HelixAskVoiceTranscriptConfirmationCandidate | null;
  confirmV2Active: boolean;
  lowQualitySpeechProbability: number;
  lowQualitySnrDb: number;
  readTranscriptActivity: () => HelixAskVoiceConfirmationActivity;
  onCommandAutoConfirm: (candidateId: string) => void;
  onCommandPreempted: (candidateId: string) => void;
  onTranscriptAutoConfirm: (candidateId: string) => void;
  onEvent?: (event: HelixAskVoiceConfirmationRuntimeEvent) => void;
  countdownMs?: number;
  tickMs?: number;
};

export type HelixAskVoiceConfirmationRuntimeState = {
  commandCountdownSec: number | null;
  transcriptCountdownSec: number | null;
  clearCommandCountdown: () => void;
  clearTranscriptCountdown: () => void;
};

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function countdownSeconds(durationMs: number): number {
  return Math.max(0, Math.ceil(durationMs / 1_000));
}

export function useHelixAskVoiceConfirmationRuntime({
  micEnabled,
  commandCandidate,
  transcriptCandidate,
  confirmV2Active,
  lowQualitySpeechProbability,
  lowQualitySnrDb,
  readTranscriptActivity,
  onCommandAutoConfirm,
  onCommandPreempted,
  onTranscriptAutoConfirm,
  onEvent,
  countdownMs = HELIX_ASK_VOICE_CONFIRMATION_COUNTDOWN_MS,
  tickMs = HELIX_ASK_VOICE_CONFIRMATION_TICK_MS,
}: HelixAskVoiceConfirmationRuntimeOptions): HelixAskVoiceConfirmationRuntimeState {
  const [commandCountdownSec, setCommandCountdownSec] = useState<number | null>(null);
  const [transcriptCountdownSec, setTranscriptCountdownSec] = useState<number | null>(null);
  const commandTimerRef = useRef<number | null>(null);
  const commandDeadlineMsRef = useRef<number | null>(null);
  const transcriptTimerRef = useRef<number | null>(null);
  const transcriptDeadlineMsRef = useRef<number | null>(null);
  const transcriptWaitingForInactivityRef = useRef(false);

  const commandCandidateRef = useLatestRef(commandCandidate);
  const transcriptCandidateRef = useLatestRef(transcriptCandidate);
  const readTranscriptActivityRef = useLatestRef(readTranscriptActivity);
  const onCommandAutoConfirmRef = useLatestRef(onCommandAutoConfirm);
  const onCommandPreemptedRef = useLatestRef(onCommandPreempted);
  const onTranscriptAutoConfirmRef = useLatestRef(onTranscriptAutoConfirm);
  const onEventRef = useLatestRef(onEvent);

  const clearCommandCountdown = useCallback(() => {
    if (typeof window !== "undefined" && commandTimerRef.current !== null) {
      window.clearInterval(commandTimerRef.current);
    }
    commandTimerRef.current = null;
    commandDeadlineMsRef.current = null;
    setCommandCountdownSec(null);
  }, []);

  const clearTranscriptCountdown = useCallback(() => {
    if (typeof window !== "undefined" && transcriptTimerRef.current !== null) {
      window.clearInterval(transcriptTimerRef.current);
    }
    transcriptTimerRef.current = null;
    transcriptDeadlineMsRef.current = null;
    transcriptWaitingForInactivityRef.current = false;
    setTranscriptCountdownSec(null);
  }, []);

  const commandCandidateId = commandCandidate?.id ?? null;
  const transcriptCandidateId = transcriptCandidate?.id ?? null;

  useEffect(() => {
    clearCommandCountdown();
    if (typeof window === "undefined" || !micEnabled || !commandCandidateId || transcriptCandidateId) {
      return;
    }
    const pending = commandCandidateRef.current;
    if (!pending || pending.id !== commandCandidateId) return;

    commandDeadlineMsRef.current = Date.now() + countdownMs;
    setCommandCountdownSec(countdownSeconds(countdownMs));
    onEventRef.current?.({
      type: "command_countdown_started",
      candidateId: pending.id,
      action: pending.action,
    });

    commandTimerRef.current = window.setInterval(() => {
      const latest = commandCandidateRef.current;
      if (!latest || latest.id !== commandCandidateId) {
        clearCommandCountdown();
        return;
      }
      if (transcriptCandidateRef.current) {
        clearCommandCountdown();
        return;
      }
      const deadlineMs = commandDeadlineMsRef.current;
      if (deadlineMs === null) {
        clearCommandCountdown();
        return;
      }
      const remainingMs = Math.max(0, deadlineMs - Date.now());
      const nextCountdownSec = countdownSeconds(remainingMs);
      setCommandCountdownSec((current) => (current === nextCountdownSec ? current : nextCountdownSec));
      if (remainingMs > 0) return;

      clearCommandCountdown();
      onEventRef.current?.({
        type: "command_countdown_fired",
        candidateId: latest.id,
        action: latest.action,
      });
      onCommandAutoConfirmRef.current(latest.id);
    }, tickMs);

    return clearCommandCountdown;
  }, [
    clearCommandCountdown,
    commandCandidateId,
    countdownMs,
    micEnabled,
    tickMs,
    transcriptCandidateId,
  ]);

  useEffect(() => {
    const pendingCommand = commandCandidateRef.current;
    if (!pendingCommand || !transcriptCandidateId) return;
    clearCommandCountdown();
    onEventRef.current?.({
      type: "command_preempted",
      candidateId: pendingCommand.id,
      action: pendingCommand.action,
    });
    onCommandPreemptedRef.current(pendingCommand.id);
  }, [clearCommandCountdown, commandCandidateId, transcriptCandidateId]);

  useEffect(() => {
    clearTranscriptCountdown();
    if (typeof window === "undefined" || !micEnabled || !transcriptCandidateId) return;
    const pending = transcriptCandidateRef.current;
    if (!pending || pending.id !== transcriptCandidateId) return;

    const buildPolicyProjection = () => {
      const activity = readTranscriptActivityRef.current();
      return buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection({
        dispatchState: pending.dispatchState ?? "confirm",
        confidence: pending.confidence,
        languageConfidence: pending.languageConfidence,
        pivotConfidence: pending.pivotConfidence,
        translationUncertain: pending.translationUncertain,
        sourceLanguage: pending.sourceLanguage ?? null,
        sourceText: pending.sourceText ?? null,
        translated: pending.translated,
        speechProbability: pending.speechProbability,
        snrDb: pending.snrDb,
        lowQualitySpeechProbability,
        lowQualitySnrDb,
        speechActive: activity.speechActive,
        queuedSegmentCount: activity.queuedSegmentCount,
        confirmV2Active,
      });
    };

    const initialPolicyProjection = buildPolicyProjection();
    const initialBlockReason = initialPolicyProjection.confirmPolicy.confirmBlockReason;
    if (confirmV2Active && initialBlockReason) {
      onEventRef.current?.({
        type: "transcript_countdown_blocked",
        candidateId: pending.id,
        reason: initialBlockReason,
      });
    }
    if (!initialPolicyProjection.shouldAutoConfirm) return;

    transcriptDeadlineMsRef.current = Date.now() + countdownMs;
    setTranscriptCountdownSec(countdownSeconds(countdownMs));
    onEventRef.current?.({ type: "transcript_countdown_started", candidateId: pending.id });

    transcriptTimerRef.current = window.setInterval(() => {
      const latest = transcriptCandidateRef.current;
      if (!latest || latest.id !== transcriptCandidateId) {
        onEventRef.current?.({
          type: "transcript_countdown_cancelled",
          candidateId: transcriptCandidateId,
        });
        clearTranscriptCountdown();
        return;
      }

      if (confirmV2Active) {
        const policyProjection = buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection({
          dispatchState: latest.dispatchState ?? "confirm",
          confidence: latest.confidence,
          languageConfidence: latest.languageConfidence,
          pivotConfidence: latest.pivotConfidence,
          translationUncertain: latest.translationUncertain,
          sourceLanguage: latest.sourceLanguage ?? null,
          sourceText: latest.sourceText ?? null,
          translated: latest.translated,
          speechProbability: latest.speechProbability,
          snrDb: latest.snrDb,
          lowQualitySpeechProbability,
          lowQualitySnrDb,
          ...readTranscriptActivityRef.current(),
          confirmV2Active: true,
        });
        const policy = policyProjection.confirmPolicy;
        if (policy.confirmBlockReason) {
          onEventRef.current?.({
            type: "transcript_countdown_blocked",
            candidateId: latest.id,
            reason: policy.confirmBlockReason,
          });
          clearTranscriptCountdown();
          return;
        }
        if (!policyProjection.confirmPolicyWithoutLiveActivity.confirmAutoEligible) {
          clearTranscriptCountdown();
          return;
        }
        if (policy.reason === "live_activity") {
          transcriptDeadlineMsRef.current = Date.now() + countdownMs;
          setTranscriptCountdownSec(countdownSeconds(countdownMs));
          if (!transcriptWaitingForInactivityRef.current) {
            transcriptWaitingForInactivityRef.current = true;
            onEventRef.current?.({
              type: "transcript_waiting_for_inactivity",
              candidateId: latest.id,
            });
          }
          return;
        }
        transcriptWaitingForInactivityRef.current = false;
      }

      const deadlineMs = transcriptDeadlineMsRef.current;
      if (deadlineMs === null) {
        clearTranscriptCountdown();
        return;
      }
      const remainingMs = Math.max(0, deadlineMs - Date.now());
      const nextCountdownSec = countdownSeconds(remainingMs);
      setTranscriptCountdownSec((current) => (current === nextCountdownSec ? current : nextCountdownSec));
      if (remainingMs > 0) return;

      clearTranscriptCountdown();
      onEventRef.current?.({ type: "transcript_countdown_fired", candidateId: latest.id });
      onTranscriptAutoConfirmRef.current(latest.id);
    }, tickMs);

    return clearTranscriptCountdown;
  }, [
    clearTranscriptCountdown,
    confirmV2Active,
    countdownMs,
    lowQualitySnrDb,
    lowQualitySpeechProbability,
    micEnabled,
    tickMs,
    transcriptCandidateId,
  ]);

  return {
    commandCountdownSec,
    transcriptCountdownSec,
    clearCommandCountdown,
    clearTranscriptCountdown,
  };
}

export type HelixAskVoiceConfirmationRuntimeSurfaceProps =
  HelixAskVoiceConfirmationRuntimeOptions & {
    clipText: (text: string, limit: number) => string;
    describeCommandAction: (action: HelixAskVoiceCommandConfirmationCandidate["action"]) => string;
    onCommandAccept: (candidateId: string) => void;
    onCommandCancel: (candidateId: string) => void;
    onTranscriptAccept: (candidateId: string) => void;
    onTranscriptRetry: (candidateId: string) => void;
  };

export function HelixAskVoiceConfirmationRuntimeSurface({
  clipText,
  describeCommandAction,
  onCommandAccept,
  onCommandCancel,
  onTranscriptAccept,
  onTranscriptRetry,
  ...runtimeOptions
}: HelixAskVoiceConfirmationRuntimeSurfaceProps) {
  const runtime = useHelixAskVoiceConfirmationRuntime(runtimeOptions);
  const commandCandidate = runtimeOptions.commandCandidate;
  const transcriptCandidate = runtimeOptions.transcriptCandidate;

  return (
    <>
      <HelixAskVoiceCommandConfirmationPanel
        visible={!transcriptCandidate && Boolean(commandCandidate)}
        actionLabel={commandCandidate ? describeCommandAction(commandCandidate.action) : ""}
        transcript={commandCandidate?.transcript ?? ""}
        countdownSec={runtime.commandCountdownSec}
        onAccept={() => {
          if (!commandCandidate) return;
          runtime.clearCommandCountdown();
          onCommandAccept(commandCandidate.id);
        }}
        onCancel={() => {
          if (!commandCandidate) return;
          runtime.clearCommandCountdown();
          onCommandCancel(commandCandidate.id);
        }}
        clipText={clipText}
      />
      <HelixAskTranscriptConfirmationPanel
        visible={Boolean(transcriptCandidate)}
        transcript={transcriptCandidate?.transcript ?? ""}
        sourceText={transcriptCandidate?.sourceText}
        sourceLanguage={transcriptCandidate?.sourceLanguage}
        translationUncertain={transcriptCandidate?.translationUncertain}
        countdownSec={runtime.transcriptCountdownSec}
        onAccept={() => {
          if (!transcriptCandidate) return;
          runtime.clearTranscriptCountdown();
          onTranscriptAccept(transcriptCandidate.id);
        }}
        onRetry={() => {
          if (!transcriptCandidate) return;
          runtime.clearTranscriptCountdown();
          onTranscriptRetry(transcriptCandidate.id);
        }}
        clipText={clipText}
      />
    </>
  );
}
