import type { ReactNode } from "react";

export type HelixAskPlainAnswerSurfaceProps = {
  children: ReactNode;
  supplement?: ReactNode;
};

export function HelixAskPlainAnswerSurface({ children, supplement }: HelixAskPlainAnswerSurfaceProps) {
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap leading-relaxed">{children}</p>
      {supplement}
    </div>
  );
}
