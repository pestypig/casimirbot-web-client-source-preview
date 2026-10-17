import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LiveWorkstationPipeline } from "@shared/helix-live-workstation-pipeline";

export type LiveWorkstationPipelineState = {
  pipelines: LiveWorkstationPipeline[];
  last_loaded_at?: string | null;
  last_fetch_error?: string | null;
  loadPipelines: () => Promise<void>;
  upsertPipelines: (pipelines: LiveWorkstationPipeline[]) => void;
};

export const selectActiveLiveWorkstationPipelines = (state: LiveWorkstationPipelineState): LiveWorkstationPipeline[] =>
  state.pipelines.filter((pipeline) => pipeline.status === "active");

export const useLiveWorkstationPipelineStore = create<LiveWorkstationPipelineState>()(
  persist(
    (set) => ({
      pipelines: [],
      last_loaded_at: null,
      last_fetch_error: null,
      upsertPipelines: (pipelines) =>
        set((state) => {
          const byId = new Map(state.pipelines.map((pipeline) => [pipeline.pipeline_id, pipeline]));
          for (const pipeline of pipelines) byId.set(pipeline.pipeline_id, pipeline);
          return {
            pipelines: Array.from(byId.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50),
            last_loaded_at: new Date().toISOString(),
            last_fetch_error: null,
          };
        }),
      loadPipelines: async () => {
        try {
          const response = await fetch("/api/agi/situation/live-workstation-pipeline/list");
          if (!response.ok) throw new Error(`pipeline_fetch_failed:${response.status}`);
          const body = await response.json() as { pipelines?: LiveWorkstationPipeline[] };
          set({
            pipelines: Array.isArray(body.pipelines) ? body.pipelines : [],
            last_loaded_at: new Date().toISOString(),
            last_fetch_error: null,
          });
        } catch (error) {
          set({ last_fetch_error: error instanceof Error ? error.message : "pipeline_fetch_failed" });
        }
      },
    }),
    {
      name: "helix-live-workstation-pipelines-v1",
      partialize: (state) => ({
        pipelines: state.pipelines,
        last_loaded_at: state.last_loaded_at,
      }),
    },
  ),
);
