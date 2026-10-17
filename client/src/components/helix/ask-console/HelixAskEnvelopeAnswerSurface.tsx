import type { ReactNode } from "react";

export type HelixAskEnvelopeAnswerSurfaceProps = {
  finalAnswer: ReactNode;
  calculatorLaunch?: ReactNode;
  supplement?: ReactNode;
};

export function HelixAskEnvelopeAnswerSurface({
  finalAnswer,
  calculatorLaunch,
  supplement,
}: HelixAskEnvelopeAnswerSurfaceProps) {
  return (
    <div className="space-y-3">
      {finalAnswer}
      {calculatorLaunch}
      {supplement}
    </div>
  );
}
