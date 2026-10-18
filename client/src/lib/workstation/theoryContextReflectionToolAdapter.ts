import type {
  HelixTheoryContextReflectionPanelSyncOverlayMode,
  HelixTheoryContextReflectionToolReceiptV1,
} from "@shared/contracts/helix-theory-context-reflection-tool-receipt.v1";
import type {
  TheoryContextReflectionConfidenceMode,
  TheoryContextReflectionSource,
} from "@shared/contracts/theory-context-reflection.v1";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { runHelixTheoryContextReflectionTool } from "@shared/theory/theory-context-reflection-tool";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";

export type RunClientTheoryContextReflectionToolInput = {
  prompt: string;
  conversationContext?: string | null;
  mentionedEquations?: string[];
  mentionedSymbols?: string[];
  mentionedDomains?: string[];
  source?: TheoryContextReflectionSource;
  confidenceMode?: TheoryContextReflectionConfidenceMode;
  limit?: number;
  threadId?: string | null;
  turnId: string;
  buildExplanationPlan?: boolean;
  buildFrontierSearch?: boolean;
  frontierSearchSeed?: string;
  syncPanel?: boolean;
  openPanel?: boolean;
  overlayMode?: HelixTheoryContextReflectionPanelSyncOverlayMode;
  openPanelHandler?: (panelId: "theory-badge-graph") => void;
  focusPanelHandler?: (panelId: "theory-badge-graph") => void;
};

export function applyTheoryContextReflectionPanelSync(
  receipt: HelixTheoryContextReflectionToolReceiptV1,
  options: {
    openPanel?: boolean;
    overlayMode?: HelixTheoryContextReflectionPanelSyncOverlayMode;
    openPanelHandler?: (panelId: "theory-badge-graph") => void;
    focusPanelHandler?: (panelId: "theory-badge-graph") => void;
  } = {},
): void {
  const overlayMode = options.overlayMode ?? receipt.panelSync.overlayMode;
  if (overlayMode === "live_answer_context") {
    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(receipt.reflectionV1);
  } else if (overlayMode === "discussion_zone") {
    useTheoryMapOverlayStore.getState().setReflectionOverlay(receipt.reflectionV1);
    useTheoryBadgeGraphPanelStore.getState().setActiveAtlasLensId(null);
  }
  if (options.openPanel ?? receipt.panelSync.openPanel) {
    options.openPanelHandler?.("theory-badge-graph");
    options.focusPanelHandler?.("theory-badge-graph");
  }
}

export function runClientTheoryContextReflectionTool(
  input: RunClientTheoryContextReflectionToolInput,
): HelixTheoryContextReflectionToolReceiptV1 {
  const graph = buildNhm2TheoryBadgeGraphV1();
  const requested = input.syncPanel ?? true;
  const overlayMode = input.overlayMode ?? "discussion_zone";
  const receipt = runHelixTheoryContextReflectionTool({
    graph,
    prompt: input.prompt,
    conversationContext: input.conversationContext ?? null,
    mentionedEquations: input.mentionedEquations ?? [],
    mentionedSymbols: input.mentionedSymbols ?? [],
    mentionedDomains: input.mentionedDomains ?? [],
    confidenceMode: input.confidenceMode,
    limit: input.limit,
    threadId: input.threadId ?? null,
    turnId: input.turnId,
    source: input.source ?? "workstation_action",
    buildExplanationPlan: input.buildExplanationPlan ?? false,
    buildFrontierSearch: input.buildFrontierSearch ?? false,
    frontierSearchSeed: input.frontierSearchSeed,
    panelSync: {
      requested,
      applied: false,
      overlayMode,
      openPanel: input.openPanel ?? true,
      selectedLiveContextBlock: overlayMode === "live_answer_context",
    },
  });

  if (receipt.panelSync.requested) {
    applyTheoryContextReflectionPanelSync(receipt, {
      openPanel: receipt.panelSync.openPanel,
      overlayMode: receipt.panelSync.overlayMode,
      openPanelHandler: input.openPanelHandler,
      focusPanelHandler: input.focusPanelHandler,
    });
  }

  return {
    ...receipt,
    panelSync: {
      ...receipt.panelSync,
      applied: receipt.panelSync.requested,
    },
  };
}
