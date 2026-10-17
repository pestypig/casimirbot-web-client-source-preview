import type { ReactNode } from "react";

import { HelixAskReasoningAnimationStyles } from "./HelixAskReasoningAnimationStyles";

export type HelixAskBusyReasoningPanelProps = {
  visible: boolean;
  liveBorderClassName: string;
  replyTintClassName: string;
  children: ReactNode;
};

export function HelixAskBusyReasoningPanel({
  visible,
  liveBorderClassName,
  replyTintClassName,
  children,
}: HelixAskBusyReasoningPanelProps) {
  if (!visible) return null;

  return (
    <div className={`relative overflow-hidden border-t px-4 py-2 text-[11px] text-slate-300 ${liveBorderClassName}`}>
      <div className={`pointer-events-none absolute inset-0 opacity-70 ${replyTintClassName}`} aria-hidden />
      <HelixAskReasoningAnimationStyles />
      {children}
    </div>
  );
}
