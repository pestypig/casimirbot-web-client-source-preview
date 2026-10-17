import type { HelixAskRealtimeWorkerDispatchResult } from
  "./HelixAskRealtimeWorkerDispatch";

export const HELIX_REALTIME_PARALLEL_DISPATCH_FALLBACK_MS = 20_000;

export type HelixAskRealtimeParallelDispatchSettlementTrigger =
  | "live_response_playback_ended"
  | "live_response_failed"
  | "settlement_fallback_elapsed"
  | "user_speech_resumed"
  | "provider_response_interrupted"
  | "newer_parallel_handoff"
  | "speech_resumed_before_handoff_returned";

export type HelixAskRealtimeParallelDispatchSettlementState =
  | HelixAskRealtimeWorkerDispatchResult["state"]
  | "awaiting_live_turn_settlement"
  | "cancelled_user_continuation"
  | "cancelled_provider_interruption"
  | "superseded_by_newer_handoff"
  | "dispatch_failed";

export type HelixAskRealtimeParallelDispatchSettlement = {
  handoffId: string;
  workerAdmissionId: string;
  speechEpoch: number;
  trigger: HelixAskRealtimeParallelDispatchSettlementTrigger;
  state: HelixAskRealtimeParallelDispatchSettlementState;
  result: HelixAskRealtimeWorkerDispatchResult | null;
  failureCode: string | null;
};

export type HelixAskRealtimeParallelDispatchCoordinator = {
  readSpeechEpoch(): number;
  noteSpeechStarted(): HelixAskRealtimeParallelDispatchSettlement | null;
  defer(input: {
    handoffId: string;
    workerAdmissionId: string;
    speechEpoch: number;
    execute: () => HelixAskRealtimeWorkerDispatchResult;
    onSettlement: (settlement: HelixAskRealtimeParallelDispatchSettlement) => void;
  }): HelixAskRealtimeParallelDispatchSettlementState;
  settleHandoff(input: {
    handoffId: string;
    trigger:
      | "live_response_playback_ended"
      | "live_response_failed";
  }): HelixAskRealtimeParallelDispatchSettlement | null;
  cancelHandoff(input: {
    handoffId: string;
    trigger: "provider_response_interrupted";
  }): HelixAskRealtimeParallelDispatchSettlement | null;
  dispose(): void;
};

type PendingParallelDispatch = {
  handoffId: string;
  workerAdmissionId: string;
  speechEpoch: number;
  execute: () => HelixAskRealtimeWorkerDispatchResult;
  onSettlement: (settlement: HelixAskRealtimeParallelDispatchSettlement) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ParallelDispatchDetails = Omit<PendingParallelDispatch, "timer">;

const failureCodeFor = (error: unknown): string => {
  const value = error instanceof Error ? error.message : "realtime_parallel_dispatch_failed";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || "realtime_parallel_dispatch_failed";
};

export const createHelixAskRealtimeParallelDispatchCoordinator = (input: {
  fallbackMs?: number;
} = {}): HelixAskRealtimeParallelDispatchCoordinator => {
  const fallbackMs = Math.max(
    1,
    Math.trunc(input.fallbackMs ?? HELIX_REALTIME_PARALLEL_DISPATCH_FALLBACK_MS),
  );
  let speechEpoch = 0;
  let pending: PendingParallelDispatch | null = null;
  let disposed = false;

  const takePending = (
    handoffId?: string,
  ): PendingParallelDispatch | null => {
    if (!pending || (handoffId && pending.handoffId !== handoffId)) return null;
    const selected = pending;
    pending = null;
    clearTimeout(selected.timer);
    return selected;
  };

  const emitCancellation = (
    selected: ParallelDispatchDetails,
    trigger: HelixAskRealtimeParallelDispatchSettlementTrigger,
    state:
      | "cancelled_user_continuation"
      | "cancelled_provider_interruption"
      | "superseded_by_newer_handoff",
  ): HelixAskRealtimeParallelDispatchSettlement => {
    const settlement: HelixAskRealtimeParallelDispatchSettlement = {
      handoffId: selected.handoffId,
      workerAdmissionId: selected.workerAdmissionId,
      speechEpoch: selected.speechEpoch,
      trigger,
      state,
      result: null,
      failureCode: null,
    };
    selected.onSettlement(settlement);
    return settlement;
  };

  const dispatchPending = (
    handoffId: string,
    trigger:
      | "live_response_playback_ended"
      | "live_response_failed"
      | "settlement_fallback_elapsed",
  ): HelixAskRealtimeParallelDispatchSettlement | null => {
    const selected = takePending(handoffId);
    if (!selected || disposed) return null;
    try {
      const result = selected.execute();
      const settlement: HelixAskRealtimeParallelDispatchSettlement = {
        handoffId: selected.handoffId,
        workerAdmissionId: selected.workerAdmissionId,
        speechEpoch: selected.speechEpoch,
        trigger,
        state: result.state,
        result,
        failureCode: null,
      };
      selected.onSettlement(settlement);
      return settlement;
    } catch (error) {
      const settlement: HelixAskRealtimeParallelDispatchSettlement = {
        handoffId: selected.handoffId,
        workerAdmissionId: selected.workerAdmissionId,
        speechEpoch: selected.speechEpoch,
        trigger,
        state: "dispatch_failed",
        result: null,
        failureCode: failureCodeFor(error),
      };
      selected.onSettlement(settlement);
      return settlement;
    }
  };

  return {
    readSpeechEpoch: () => speechEpoch,
    noteSpeechStarted: () => {
      speechEpoch += 1;
      const selected = takePending();
      return selected
        ? emitCancellation(
            selected,
            "user_speech_resumed",
            "cancelled_user_continuation",
          )
        : null;
    },
    defer: (request) => {
      if (disposed) return "cancelled_user_continuation";
      if (pending) {
        const superseded = takePending();
        if (superseded) {
          emitCancellation(
            superseded,
            "newer_parallel_handoff",
            "superseded_by_newer_handoff",
          );
        }
      }
      if (request.speechEpoch !== speechEpoch) {
        emitCancellation(
          request,
          "speech_resumed_before_handoff_returned",
          "cancelled_user_continuation",
        );
        return "cancelled_user_continuation";
      }
      const timer = setTimeout(() => {
        dispatchPending(request.handoffId, "settlement_fallback_elapsed");
      }, fallbackMs);
      pending = { ...request, timer };
      return "awaiting_live_turn_settlement";
    },
    settleHandoff: ({ handoffId, trigger }) =>
      dispatchPending(handoffId, trigger),
    cancelHandoff: ({ handoffId }) => {
      const selected = takePending(handoffId);
      return selected
        ? emitCancellation(
            selected,
            "provider_response_interrupted",
            "cancelled_provider_interruption",
          )
        : null;
    },
    dispose: () => {
      disposed = true;
      const selected = takePending();
      if (selected) clearTimeout(selected.timer);
    },
  };
};
