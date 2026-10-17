import { useRef } from "react";
import type { PendingHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import { useHelixWorkflowDemoStore } from "@/store/useHelixWorkflowDemoStore";

export type HelixAskWorkflowQteLaunch = NonNullable<PendingHelixAskPrompt["workflowQte"]>;

export type HelixAskWorkflowQteSubmission = {
  workflowQte: HelixAskWorkflowQteLaunch | null | undefined;
  sourceSessionId: string | null | undefined;
  turnId: string;
  prompt: string;
};

export type HelixAskWorkflowQteBridge = {
  resolvePending: (pendingPrompt?: PendingHelixAskPrompt | null) => HelixAskWorkflowQteLaunch | null;
  replacePending: (workflowQte?: HelixAskWorkflowQteLaunch | null) => void;
  clearPending: () => void;
  takePending: (eligible: boolean) => HelixAskWorkflowQteLaunch | null;
  recordSubmitted: (submission: HelixAskWorkflowQteSubmission) => boolean;
};

export function createHelixAskWorkflowQteBridge(): HelixAskWorkflowQteBridge {
  let pendingWorkflowQte: HelixAskWorkflowQteLaunch | null = null;
  return {
    resolvePending: (pendingPrompt) => pendingPrompt?.workflowQte ?? pendingWorkflowQte,
    replacePending: (workflowQte) => {
      pendingWorkflowQte = workflowQte ?? null;
    },
    clearPending: () => {
      pendingWorkflowQte = null;
    },
    takePending: (eligible) => {
      const selected = eligible ? pendingWorkflowQte : null;
      pendingWorkflowQte = null;
      return selected;
    },
    recordSubmitted: ({ workflowQte, sourceSessionId, turnId, prompt }) => {
      const normalizedSessionId = sourceSessionId?.trim() ?? "";
      const normalizedTurnId = turnId.trim();
      const normalizedPrompt = prompt.trim();
      if (
        !workflowQte ||
        !normalizedSessionId ||
        workflowQte.sourceSessionId !== normalizedSessionId ||
        !normalizedTurnId ||
        !normalizedPrompt
      ) {
        return false;
      }
      useHelixWorkflowDemoStore.getState().markPromptSubmitted({
        runId: workflowQte.runId,
        stepId: workflowQte.stepId,
        sourceSessionId: normalizedSessionId,
        turnId: normalizedTurnId,
        prompt: normalizedPrompt,
      });
      return true;
    },
  };
}

export function useHelixAskWorkflowQteBridge(): HelixAskWorkflowQteBridge {
  const bridgeRef = useRef<HelixAskWorkflowQteBridge | null>(null);
  if (!bridgeRef.current) bridgeRef.current = createHelixAskWorkflowQteBridge();
  return bridgeRef.current;
}
