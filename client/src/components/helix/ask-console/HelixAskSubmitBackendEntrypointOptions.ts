import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import { hasPhysicsGlyphAskConnection } from "@/lib/workstation/physicsGlyphAskContext";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import {
  buildHelixAskHardBackendEntrypointRouteMetadata,
  buildHelixAskPastedTextResumeRecallRouteMetadata,
  isConceptualToolExplanationWithoutExecution,
  requiresHelixAskBackendEntrypoint,
  shouldUseHelixAskBackendTurnEntrypoint,
} from "./HelixAskBackendEntrypointPolicy";

export type HelixAskSubmitBackendEntrypointRunOptions = {
  forceReasoningDispatch?: boolean;
  requiresBackendAskEntrypoint?: boolean;
  routeMetadata?: HelixAskRouteMetadata;
};

export type HelixAskSubmitBackendEntrypointRoutePlan = {
  backendOwnedPastedTextResumeRecall: boolean;
  hardBackendEntrypointRequired: boolean;
  forceReasoningDispatch: boolean;
  routeMetadata: HelixAskRouteMetadata | undefined;
  useBackendAskTurnEntrypoint: boolean;
};

export const hasHelixAskRealtimeBackendHandoff = (
  options?: HelixAskSubmitBackendEntrypointRunOptions | null,
): boolean =>
  options?.requiresBackendAskEntrypoint === true &&
  options.routeMetadata?.source === "realtime_stage_play" &&
  options.routeMetadata.invocationKind === "stage_play_realtime_transcript_handoff";

export function resolveHelixAskSubmitRuntime(args: {
  selectedRuntime: HelixAgentRuntimeId;
  serverAdmittedRuntimeAgentProvider?: HelixAgentRuntimeId;
}): HelixAgentRuntimeId {
  return args.serverAdmittedRuntimeAgentProvider ?? args.selectedRuntime;
}

export function buildHelixAskSubmitBackendEntrypointRoutePlan(args: {
  question: string;
  baseRunOptions?: HelixAskSubmitBackendEntrypointRunOptions;
  turnId: string;
  threadId: string;
  manualCanaryEnabled: boolean;
  backendOwnedPastedTextResumeRecall?: boolean;
}): HelixAskSubmitBackendEntrypointRoutePlan {
  const backendOwnedPastedTextResumeRecall = args.backendOwnedPastedTextResumeRecall === true;
  // The backend must validate this handoff. Client hard-tool classification
  // must not replace its source, transcript hash or room authority metadata.
  const realtimeStagePlayHandoff = hasHelixAskRealtimeBackendHandoff(args.baseRunOptions);
  const conceptualToolExplanationWithoutExecution =
    !realtimeStagePlayHandoff &&
    isConceptualToolExplanationWithoutExecution(args.question);
  const hardBackendEntrypointRequired =
    hasPhysicsGlyphAskConnection() ||
    realtimeStagePlayHandoff ||
    (!conceptualToolExplanationWithoutExecution &&
      (args.baseRunOptions?.requiresBackendAskEntrypoint === true ||
        requiresHelixAskBackendEntrypoint(args.question)));
  const hardRouteMetadata = hardBackendEntrypointRequired && !realtimeStagePlayHandoff
    ? buildHelixAskHardBackendEntrypointRouteMetadata({
        question: args.question,
        base: args.baseRunOptions?.routeMetadata,
        turnId: args.turnId,
        threadId: args.threadId,
      })
    : null;
  const routeMetadata = realtimeStagePlayHandoff
    ? args.baseRunOptions?.routeMetadata
    : backendOwnedPastedTextResumeRecall
    ? buildHelixAskPastedTextResumeRecallRouteMetadata({
        base: args.baseRunOptions?.routeMetadata,
        turnId: args.turnId,
        threadId: args.threadId,
      })
    : conceptualToolExplanationWithoutExecution
      ? undefined
      : hardRouteMetadata ?? args.baseRunOptions?.routeMetadata;
  return {
    backendOwnedPastedTextResumeRecall,
    hardBackendEntrypointRequired,
    forceReasoningDispatch:
      (!conceptualToolExplanationWithoutExecution && args.baseRunOptions?.forceReasoningDispatch === true) ||
      hardBackendEntrypointRequired,
    routeMetadata,
    useBackendAskTurnEntrypoint: shouldUseHelixAskBackendTurnEntrypoint({
      manualCanaryEnabled: args.manualCanaryEnabled,
      hardBackendEntrypointRequired,
    }),
  };
}

export function mergeHelixAskSubmitBackendEntrypointRunOptions<
  TOptions extends HelixAskSubmitBackendEntrypointRunOptions,
>(args: {
  question: string;
  baseRunOptions?: TOptions;
  turnId: string;
  threadId: string;
}): TOptions | undefined {
  if (hasHelixAskRealtimeBackendHandoff(args.baseRunOptions)) {
    return args.baseRunOptions;
  }
  if (isConceptualToolExplanationWithoutExecution(args.question)) {
    if (!args.baseRunOptions) return undefined;
    const { requiresBackendAskEntrypoint, forceReasoningDispatch, routeMetadata, ...rest } = args.baseRunOptions;
    void requiresBackendAskEntrypoint;
    void forceReasoningDispatch;
    void routeMetadata;
    return rest as TOptions;
  }
  if (!requiresHelixAskBackendEntrypoint(args.question)) {
    return args.baseRunOptions;
  }
  return {
    ...(args.baseRunOptions ?? {}),
    requiresBackendAskEntrypoint: true,
    forceReasoningDispatch: true,
    routeMetadata:
      buildHelixAskHardBackendEntrypointRouteMetadata({
        question: args.question,
        base: args.baseRunOptions?.routeMetadata,
        turnId: args.turnId,
        threadId: args.threadId,
      }) ?? args.baseRunOptions?.routeMetadata,
  } as TOptions;
}
