import {
  HelixAskCompletedReplyTurnSurface,
  type HelixAskCompletedReplyTurnSurfaceProps,
} from "./HelixAskCompletedReplyTurnSurface";

export type HelixAskLegacyCompletedReplySlotProps = {
  replyId: string;
  turn: HelixAskCompletedReplyTurnSurfaceProps;
};

export function HelixAskLegacyCompletedReplySlot({
  replyId,
  turn,
}: HelixAskLegacyCompletedReplySlotProps) {
  return <HelixAskCompletedReplyTurnSurface key={replyId} {...turn} />;
}
