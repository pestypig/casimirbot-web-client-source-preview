import { afterEach, describe, expect, it, vi } from "vitest";
import { useHelixWorkflowDemoStore } from "@/store/useHelixWorkflowDemoStore";
import { createHelixAskWorkflowQteBridge } from "../HelixAskWorkflowQteBridge";

const workflowQte = {
  schema: "helix.workflow_qte_launch.v1" as const,
  runId: "run:qte",
  stepId: "ocr_math_candidate" as const,
  sourceSessionId: "chat:qte",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HelixAskWorkflowQteBridge", () => {
  it("consumes an inserted QTE exactly once and clears it for non-manual submissions", () => {
    const bridge = createHelixAskWorkflowQteBridge();
    bridge.replacePending(workflowQte);

    expect(bridge.takePending(true)).toEqual(workflowQte);
    expect(bridge.takePending(true)).toBeNull();

    bridge.replacePending(workflowQte);
    expect(bridge.takePending(false)).toBeNull();
    expect(bridge.takePending(true)).toBeNull();
  });

  it("prefers dispatch metadata carried by the pending prompt", () => {
    const bridge = createHelixAskWorkflowQteBridge();
    bridge.replacePending({ ...workflowQte, runId: "run:stale" });

    expect(bridge.resolvePending({
      promptId: "prompt:qte",
      question: "Inspect the equation.",
      autoSubmit: false,
      workflowQte,
      createdAt: 1,
    })).toEqual(workflowQte);
  });

  it("records only same-chat, non-empty submissions through the workflow store", () => {
    const markPromptSubmitted = vi
      .spyOn(useHelixWorkflowDemoStore.getState(), "markPromptSubmitted")
      .mockImplementation(() => undefined);
    const bridge = createHelixAskWorkflowQteBridge();

    expect(bridge.recordSubmitted({
      workflowQte,
      sourceSessionId: "chat:other",
      turnId: "ask:wrong",
      prompt: "Inspect the equation.",
    })).toBe(false);
    expect(markPromptSubmitted).not.toHaveBeenCalled();

    expect(bridge.recordSubmitted({
      workflowQte,
      sourceSessionId: "chat:qte",
      turnId: "ask:linked",
      prompt: "  Inspect the equation.  ",
    })).toBe(true);
    expect(markPromptSubmitted).toHaveBeenCalledWith({
      runId: "run:qte",
      stepId: "ocr_math_candidate",
      sourceSessionId: "chat:qte",
      turnId: "ask:linked",
      prompt: "Inspect the equation.",
    });
  });
});
