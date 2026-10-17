import { create, type StateCreator } from "zustand";
import {
  buildTheoryBadgePlaybackArtifactV1,
  type TheoryBadgePlaybackArtifactV1,
} from "@shared/contracts/theory-badge-playback.v1";
import type { TheoryBadgeGraphV1 } from "@shared/contracts/theory-badge-graph.v1";
import { runTheoryBadgePlaybackNow } from "@/lib/theory/theoryBadgePlaybackRunner";

type TheoryBadgePlaybackState = {
  activeRun: TheoryBadgePlaybackArtifactV1 | null;
  activeTargetBadgeId: string | null;
  status: "idle" | "running" | "complete" | "failed";
  currentStepIndex: number | null;
  error: string | null;

  runPlayback: (args: {
    graph: TheoryBadgeGraphV1;
    targetBadgeId: string;
    delayMs?: number;
  }) => Promise<TheoryBadgePlaybackArtifactV1 | null>;

  clearPlayback: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void) => setTimeout(resolve, ms));
}

function buildPartialRun(
  finalRun: TheoryBadgePlaybackArtifactV1,
  stepCount: number,
): TheoryBadgePlaybackArtifactV1 {
  const steps = finalRun.steps.slice(0, stepCount);
  return buildTheoryBadgePlaybackArtifactV1({
    generatedAt: finalRun.generatedAt,
    runId: finalRun.runId,
    graphId: finalRun.graphId,
    targetBadgeId: finalRun.targetBadgeId,
    targetBadgeTitle: finalRun.targetBadgeTitle,
    plan: finalRun.plan,
    steps,
  });
}

const createTheoryBadgePlaybackStore: StateCreator<TheoryBadgePlaybackState> = (set) => ({
  activeRun: null,
  activeTargetBadgeId: null,
  status: "idle",
  currentStepIndex: null,
  error: null,

  runPlayback: async ({
    graph,
    targetBadgeId,
    delayMs = 80,
  }: {
    graph: TheoryBadgeGraphV1;
    targetBadgeId: string;
    delayMs?: number;
  }) => {
    set({
      activeRun: null,
      activeTargetBadgeId: targetBadgeId,
      status: "running",
      currentStepIndex: null,
      error: null,
    });

    try {
      const finalRun = runTheoryBadgePlaybackNow({
        graph,
        targetBadgeId,
        source: "panel",
      });

      for (let index = 0; index < finalRun.steps.length; index += 1) {
        if (delayMs > 0) await sleep(delayMs);
        set({
          activeRun: buildPartialRun(finalRun, index + 1),
          currentStepIndex: index + 1,
          status: "running",
        });
      }

      set({
        activeRun: finalRun,
        activeTargetBadgeId: targetBadgeId,
        status: finalRun.summary.ok ? "complete" : "failed",
        currentStepIndex: finalRun.steps.length || null,
        error: finalRun.summary.ok ? null : "Playback completed with failed steps.",
      });
      return finalRun;
    } catch (error) {
      set({
        activeRun: null,
        activeTargetBadgeId: targetBadgeId,
        status: "failed",
        currentStepIndex: null,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  clearPlayback: () =>
    set({
      activeRun: null,
      activeTargetBadgeId: null,
      status: "idle",
      currentStepIndex: null,
      error: null,
    }),
});

export const useTheoryBadgePlaybackStore = create<TheoryBadgePlaybackState>()(
  createTheoryBadgePlaybackStore,
);
