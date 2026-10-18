import type { HelixAskRouteMetadata } from "./HelixAskRequestEnvelope";
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

export function buildHelixAskSubmitBackendEntrypointRoutePlan(args: {
  question: string;
  baseRunOptions?: HelixAskSubmitBackendEntrypointRunOptions;
  turnId: string;
  threadId: string;
  manualCanaryEnabled: boolean;
  backendOwnedPastedTextResumeRecall?: boolean;
}): HelixAskSubmitBackendEntrypointRoutePlan {
  const backendOwnedPastedTextResumeRecall = args.backendOwnedPastedTextResumeRecall === true;
  const conceptualToolExplanationWithoutExecution =
    isConceptualToolExplanationWithoutExecution(args.question);
  const hardBackendEntrypointRequired =
    !conceptualToolExplanationWithoutExecution &&
    (args.baseRunOptions?.requiresBackendAskEntrypoint === true ||
      requiresHelixAskBackendEntrypoint(args.question));
  const hardRouteMetadata = hardBackendEntrypointRequired
    ? buildHelixAskHardBackendEntrypointRouteMetadata({
        question: args.question,
        base: args.baseRunOptions?.routeMetadata,
        turnId: args.turnId,
        threadId: args.threadId,
      })
    : null;
  const routeMetadata = backendOwnedPastedTextResumeRecall
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
