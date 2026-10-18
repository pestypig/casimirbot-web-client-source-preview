import type { HelixAskRouteMetadata } from "@/lib/agi/api";
import { isHelixAskPastedTextResumeRecallPrompt } from "@/lib/helix/ask-attachment-prompt-policy";
import { buildHelixAskPastedTextResumeRecallRouteMetadata } from "./HelixAskBackendEntrypointPolicy";

export type HelixAskQueuedTurnReason = "busy" | "compaction_pause" | "retry" | "multi_prompt";

export type HelixAskQueuedTurnOptionsBase = {
  routeMetadata?: HelixAskRouteMetadata;
  bypassWorkstationDispatch?: boolean;
  forceReasoningDispatch?: boolean;
  skipContextChooser?: boolean;
};

export type HelixAskQueuedTurn<TOptions extends HelixAskQueuedTurnOptionsBase = HelixAskQueuedTurnOptionsBase> = {
  question: string;
  capsuleIds?: string[];
  options?: TOptions;
  queuedAtMs: number;
  reason: HelixAskQueuedTurnReason;
};

export function buildHelixAskQueuedTurn<TOptions extends HelixAskQueuedTurnOptionsBase = HelixAskQueuedTurnOptionsBase>(
  args: {
    question: string;
    capsuleIds?: string[];
    options?: TOptions;
    reason: HelixAskQueuedTurnReason;
    contextResumeFrame?: Record<string, unknown> | null;
    queuedAtMs: number;
  },
): HelixAskQueuedTurn<TOptions> {
  const question = args.question.trim();
  const backendOwnedPastedTextResumeRecall = isHelixAskPastedTextResumeRecallPrompt(question);
  const baseRouteMetadata = args.contextResumeFrame
    ? {
        ...(args.options?.routeMetadata ?? {}),
        context_resume_frame: args.contextResumeFrame,
      }
    : args.options?.routeMetadata;
  const options = backendOwnedPastedTextResumeRecall
    ? ({
        ...(args.options ?? {}),
        bypassWorkstationDispatch: true,
        forceReasoningDispatch: true,
        skipContextChooser: true,
        routeMetadata: buildHelixAskPastedTextResumeRecallRouteMetadata({
          base: baseRouteMetadata,
          turnId: "queued:pasted_text_resume_recall",
          threadId: "queued:pasted_text_resume_recall",
        }),
      } as TOptions)
    : baseRouteMetadata
      ? ({
          ...(args.options ?? {}),
          routeMetadata: baseRouteMetadata,
        } as TOptions)
      : args.options;
  return {
    question,
    capsuleIds: args.capsuleIds,
    options,
    queuedAtMs: args.queuedAtMs,
    reason: args.reason,
  };
}
