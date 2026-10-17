import type { HelixAskReplyCardProps } from "./HelixAskReplyCard";

export type HelixAskCompletedReplyCardStateOptions = Omit<
  HelixAskReplyCardProps,
  "children" | "isLatestReply"
>;

export function buildHelixAskCompletedReplyCardState(
  options: HelixAskCompletedReplyCardStateOptions,
): HelixAskCompletedReplyCardStateOptions {
  return {
    ...options,
  };
}
