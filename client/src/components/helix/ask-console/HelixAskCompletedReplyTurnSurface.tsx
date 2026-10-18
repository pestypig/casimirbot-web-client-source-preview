import { HelixAskReplyTurnItemSurface } from "./HelixAskReplyTurnItemSurface";
import {
  HelixAskReplyTurnSurface,
  type HelixAskReplyTurnSurfaceProps,
} from "./HelixAskReplyTurnSurface";

export type HelixAskCompletedReplyTurnSurfaceProps = HelixAskReplyTurnSurfaceProps;

export function HelixAskCompletedReplyTurnSurface(props: HelixAskCompletedReplyTurnSurfaceProps) {
  return (
    <HelixAskReplyTurnItemSurface>
      <HelixAskReplyTurnSurface {...props} />
    </HelixAskReplyTurnItemSurface>
  );
}
