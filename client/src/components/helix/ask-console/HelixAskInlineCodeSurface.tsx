import type { ReactNode } from "react";

export type HelixAskInlineCodeSurfaceProps = {
  children: ReactNode;
};

export function HelixAskInlineCodeSurface({ children }: HelixAskInlineCodeSurfaceProps) {
  return (
    <code className="mx-0.5 rounded border border-slate-700 bg-slate-950/70 px-1 py-0.5 font-mono text-[0.9em] text-emerald-200">
      {children}
    </code>
  );
}
