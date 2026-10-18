import type { HelixAskReplyTurnProps } from "./HelixAskReplyTurn";

export type HelixAskReplyTurnStateOptions = HelixAskReplyTurnProps;

export function buildHelixAskReplyTurnState({
  isLatestReply,
  card,
  stream,
}: HelixAskReplyTurnStateOptions): HelixAskReplyTurnProps {
  return {
    isLatestReply,
    card,
    stream,
  };
}
