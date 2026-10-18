import {
  HelixAskActiveTurnReply,
  type HelixAskActiveTurnReplyProps,
} from "./HelixAskActiveTurnReply";

export type HelixAskActiveTurnReplySurfaceProps = HelixAskActiveTurnReplyProps;

export function HelixAskActiveTurnReplySurface(props: HelixAskActiveTurnReplySurfaceProps) {
  return <HelixAskActiveTurnReply {...props} />;
}
