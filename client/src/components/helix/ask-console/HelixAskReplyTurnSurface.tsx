import {
  HelixAskReplyTurn,
  type HelixAskReplyTurnProps,
} from "./HelixAskReplyTurn";

export type HelixAskReplyTurnSurfaceProps = HelixAskReplyTurnProps;

export function HelixAskReplyTurnSurface(props: HelixAskReplyTurnSurfaceProps) {
  return <HelixAskReplyTurn {...props} />;
}
