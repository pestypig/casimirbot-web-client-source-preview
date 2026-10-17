import React, { type ReactNode } from "react";

import { HelixAskConsoleStack } from "./HelixAskConsoleStack";
import { HelixAskErrorBoundary } from "./HelixAskErrorBoundary";

export type HelixAskConsoleRuntimeLayoutProps = {
  className?: string;
  layoutVariant: "hero" | "dock";
  surface: ReactNode;
  workflowSuggestion?: ReactNode;
  goalPill?: ReactNode;
  steeringQueue?: ReactNode;
  errorLine?: ReactNode;
  turnList?: ReactNode;
  debugDrawer?: ReactNode;
};

export function HelixAskConsoleRuntimeLayout({
  className,
  layoutVariant,
  surface,
  workflowSuggestion = null,
  goalPill = null,
  steeringQueue = null,
  errorLine = null,
  turnList = null,
  debugDrawer = null,
}: HelixAskConsoleRuntimeLayoutProps) {
  return (
    <HelixAskErrorBoundary>
      <HelixAskConsoleStack className={className} layoutVariant={layoutVariant}>
        {surface}
        {workflowSuggestion}
        {goalPill}
        {errorLine}
        {turnList}
        {steeringQueue}
        {debugDrawer}
      </HelixAskConsoleStack>
    </HelixAskErrorBoundary>
  );
}
