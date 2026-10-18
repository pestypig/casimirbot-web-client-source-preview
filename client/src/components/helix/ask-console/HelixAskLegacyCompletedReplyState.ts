import type { HelixAskLegacyCompletedReplySlotProps } from "./HelixAskLegacyCompletedReplySlot";

export type HelixAskLegacyCompletedReplyStateOptions = HelixAskLegacyCompletedReplySlotProps;

export function buildHelixAskLegacyCompletedReplyState({
  replyId,
  turn,
}: HelixAskLegacyCompletedReplyStateOptions): HelixAskLegacyCompletedReplySlotProps {
  return {
    replyId,
    turn,
  };
}
