import type {
  HelixAskMinimalRuntimeStreamEvent,
  HelixAskMinimalRuntimeTransportResult,
  HelixAskMinimalRuntimeTurnPayload,
  HelixAskMinimalRuntimeTurnRunner,
} from "./HelixAskMinimalRuntimeTransport";

export type HelixAskMinimalRuntimeBackendRunnerDeps = {
  runStream: (
    payload: HelixAskMinimalRuntimeTurnPayload,
    onEvent?: (event: HelixAskMinimalRuntimeStreamEvent) => void,
  ) => Promise<HelixAskMinimalRuntimeTransportResult>;
  runFallback: (
    payload: HelixAskMinimalRuntimeTurnPayload,
  ) => Promise<HelixAskMinimalRuntimeTransportResult>;
};

export function createHelixAskMinimalRuntimeBackendRunner(
  deps: HelixAskMinimalRuntimeBackendRunnerDeps,
): HelixAskMinimalRuntimeTurnRunner {
  return async (payload, onEvent) => {
    try {
      return await deps.runStream(payload, onEvent);
    } catch (error) {
      const fallback = await deps.runFallback(payload);
      return {
        ...fallback,
        debug: {
          ...((fallback.debug && typeof fallback.debug === "object") ? fallback.debug : {}),
          stream_used: false,
          stream_fallback_reason: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

export const runHelixAskMinimalRuntimeBackendTurn: HelixAskMinimalRuntimeTurnRunner =
  createHelixAskMinimalRuntimeBackendRunner({
    runStream: async (payload, onEvent) => {
      const { runAskTurnStream } = await import("@/lib/agi/api");
      return runAskTurnStream(payload, onEvent);
    },
    runFallback: async (payload) => {
      const { runAskTurn } = await import("@/lib/agi/api");
      return runAskTurn(payload);
    },
  });
