import type { HelixAskTurnStreamPanelProps } from "./HelixAskTurnStreamPanel";

export type HelixAskCompletedReplyStreamStateOptions = Omit<
  HelixAskTurnStreamPanelProps,
  "isLatestReply"
>;

export function buildHelixAskCompletedReplyStreamState(
  options: HelixAskCompletedReplyStreamStateOptions,
): HelixAskCompletedReplyStreamStateOptions {
  return {
    ...options,
  };
}
