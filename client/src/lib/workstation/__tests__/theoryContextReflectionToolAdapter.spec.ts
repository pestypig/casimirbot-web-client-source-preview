import { describe, expect, it, vi, beforeEach } from "vitest";

import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";
import { isHelixTheoryContextReflectionToolReceiptV1 } from "@shared/contracts/helix-theory-context-reflection-tool-receipt.v1";
import { runClientTheoryContextReflectionTool } from "../theoryContextReflectionToolAdapter";

describe("client theory context reflection tool adapter", () => {
  beforeEach(() => {
    useTheoryMapOverlayStore.getState().clearOverlay();
    useTheoryMapOverlayStore.getState().clearLiveAnswerContext();
  });

  it("runs the shared receipt and applies requested panel sync", () => {
    const openPanel = vi.fn();
    const focusPanel = vi.fn();
    const receipt = runClientTheoryContextReflectionTool({
      turnId: "turn:client-reflection",
      threadId: "thread:client-reflection",
      prompt: "Map source residual and QEI margin in the theory graph.",
      overlayMode: "discussion_zone",
      openPanel: true,
      openPanelHandler: openPanel,
      focusPanelHandler: focusPanel,
    });

    expect(isHelixTheoryContextReflectionToolReceiptV1(receipt)).toBe(true);
    expect(receipt.panelSync.applied).toBe(true);
    expect(openPanel).toHaveBeenCalledWith("theory-badge-graph");
    expect(focusPanel).toHaveBeenCalledWith("theory-badge-graph");
    expect(useTheoryMapOverlayStore.getState().lastReflectionArtifact).toBe(receipt.reflectionV1);
    expect(useTheoryMapOverlayStore.getState().reflectionOverlay).toBe(receipt.reflectionV1);
  });

  it("stores live answer context without showing the green overlay", () => {
    const receipt = runClientTheoryContextReflectionTool({
      turnId: "turn:client-reflection:live",
      threadId: "thread:client-reflection",
      prompt: "Map source residual and QEI margin in the theory graph.",
      overlayMode: "live_answer_context",
      openPanel: false,
    });
    const state = useTheoryMapOverlayStore.getState();

    expect(isHelixTheoryContextReflectionToolReceiptV1(receipt)).toBe(true);
    expect(receipt.panelSync.applied).toBe(true);
    expect(state.source).toBe("none");
    expect(state.softRegions).toEqual([]);
    expect(state.liveAnswerContextReflection).toBe(receipt.reflectionV1);
    expect(state.lastReflectionArtifact).toBe(receipt.reflectionV1);
  });

  it("can run without mutating the overlay store", () => {
    const receipt = runClientTheoryContextReflectionTool({
      turnId: "turn:client-reflection:no-sync",
      prompt: "Map source residual and QEI margin in the theory graph.",
      syncPanel: false,
      openPanel: false,
    });

    expect(isHelixTheoryContextReflectionToolReceiptV1(receipt)).toBe(true);
    expect(receipt.panelSync.requested).toBe(false);
    expect(receipt.panelSync.applied).toBe(false);
    expect(useTheoryMapOverlayStore.getState().lastReflectionArtifact).toBeNull();
  });
});
