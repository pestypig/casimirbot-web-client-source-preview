import { afterEach, describe, expect, it } from "vitest";
import { useImageLensLiveSourceStore } from "./useImageLensLiveSourceStore";

const initialState = useImageLensLiveSourceStore.getState();

afterEach(() => {
  useImageLensLiveSourceStore.setState(initialState, true);
});

const makeStream = (): MediaStream => ({
  getTracks: () => [],
  getVideoTracks: () => [],
} as unknown as MediaStream);

describe("image lens live source store", () => {
  it("stores and clears a routed screen-share stream by source id", () => {
    const stream = makeStream();

    useImageLensLiveSourceStore.getState().setLiveSource({
      sourceId: "visual_source:screen",
      threadId: "helix-ask:desktop",
      environmentId: "environment:test",
      pipelineId: null,
      roomId: "room:test",
      stream,
      streamActive: true,
      captureMode: "screen_share_lens",
      latestFrameDataUrl: null,
      lastFrameAt: null,
      createdAt: "2026-06-12T00:00:00.000Z",
    });

    expect(useImageLensLiveSourceStore.getState().liveSource?.sourceId).toBe("visual_source:screen");

    useImageLensLiveSourceStore.getState().clearLiveSource("visual_source:other");
    expect(useImageLensLiveSourceStore.getState().liveSource?.sourceId).toBe("visual_source:screen");

    useImageLensLiveSourceStore.getState().clearLiveSource("visual_source:screen");
    expect(useImageLensLiveSourceStore.getState().liveSource).toBeNull();
  });
});
