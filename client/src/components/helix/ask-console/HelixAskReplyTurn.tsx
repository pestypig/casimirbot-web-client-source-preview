import { HelixAskReplyCard, type HelixAskReplyCardProps } from "./HelixAskReplyCard";
import {
  HelixAskTurnStreamPanel,
  type HelixAskTurnStreamPanelProps,
} from "./HelixAskTurnStreamPanel";

export type HelixAskReplyTurnProps = {
  isLatestReply: boolean;
  card: Omit<HelixAskReplyCardProps, "children" | "isLatestReply">;
  stream: Omit<HelixAskTurnStreamPanelProps, "isLatestReply">;
};

export function HelixAskReplyTurn({
  isLatestReply,
  card,
  stream,
}: HelixAskReplyTurnProps) {
  return (
    <HelixAskReplyCard {...card} isLatestReply={isLatestReply}>
      <HelixAskTurnStreamPanel {...stream} isLatestReply={isLatestReply} />
    </HelixAskReplyCard>
  );
}
