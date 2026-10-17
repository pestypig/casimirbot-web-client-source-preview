import type { ReactNode } from "react";

export type HelixAskReplyTurnItemSurfaceProps = {
  children: ReactNode;
};

export function HelixAskReplyTurnItemSurface({
  children,
}: HelixAskReplyTurnItemSurfaceProps) {
  return <div>{children}</div>;
}
