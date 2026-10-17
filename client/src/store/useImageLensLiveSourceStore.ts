import { create } from "zustand";

export type ImageLensLiveSourceState = {
  sourceId: string;
  threadId: string;
  environmentId?: string | null;
  pipelineId?: string | null;
  roomId?: string | null;
  stream: MediaStream;
  streamActive: boolean;
  captureMode: "screen_share_lens";
  latestFrameDataUrl?: string | null;
  lastFrameAt?: string | null;
  createdAt: string;
};

type ImageLensLiveSourceStore = {
  liveSource: ImageLensLiveSourceState | null;
  setLiveSource: (state: ImageLensLiveSourceState) => void;
  patchLiveSource: (patch: Partial<Omit<ImageLensLiveSourceState, "stream">> & { stream?: MediaStream }) => void;
  clearLiveSource: (sourceId?: string | null) => void;
};

export const useImageLensLiveSourceStore = create<ImageLensLiveSourceStore>((set) => ({
  liveSource: null,
  setLiveSource: (state: ImageLensLiveSourceState) => set({ liveSource: state }),
  patchLiveSource: (patch) =>
    set((current) => current.liveSource
      ? {
          liveSource: {
            ...current.liveSource,
            ...patch,
          },
        }
      : current),
  clearLiveSource: (sourceId?: string | null) =>
    set((current) => {
      if (sourceId && current.liveSource?.sourceId !== sourceId) return current;
      return { liveSource: null };
    }),
}));
