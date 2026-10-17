// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptServerVisualProducerPolicies,
  getLatestVisualFrameProducerFrame,
  isVisualFrameProducerSourceActive,
  runVisualFrameProducerOnce,
  startVisualFrameProducerInterval,
  stopVisualFrameProducerInterval,
  subscribeVisualFrameProducerFrames,
  type VisualFrameProducerClientFrame,
} from "@/lib/helix/visualFrameProducer";
import { useVisualSourceCaptureStore } from "@/store/useVisualSourceCaptureStore";

const jpegDataUrl = "data:image/jpeg;base64,shared-frame";
const expectedPreviewHash = "0001020304050607";

const unsubscriptions: Array<() => void> = [];

const createStream = (): MediaStream => {
  const track = {
    readyState: "live",
    label: "Shared visual source",
    addEventListener: vi.fn(),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  return {
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
    getTracks: () => [track],
  } as unknown as MediaStream;
};

const createPostJson = () => vi.fn(async (path: string) => {
  if (path === "/api/agi/situation/visual-frame/analyze") {
    return {
      evidence: {
        frame_id: "visual_frame:test",
        evidence_id: "visual_evidence:test",
        summary: "Visible test frame.",
      },
      live_source_chunk: { chunk_id: "live_source_chunk:test" },
      live_source_analysis_jobs: [{ job_id: "analysis_job:test" }],
    };
  }
  return { ok: true };
});

beforeEach(() => {
  useVisualSourceCaptureStore.setState({ producers: {} });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(360);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(jpegDataUrl);
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi.fn(async () => Uint8Array.from({ length: 32 }, (_, index) => index).buffer),
    },
  });
});

afterEach(() => {
  while (unsubscriptions.length > 0) unsubscriptions.pop()?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useVisualSourceCaptureStore.setState({ producers: {} });
});

describe("visual frame producer client fan-out", () => {
  it("shares one captured JPEG with local and global sinks before server analysis", async () => {
    const postJson = createPostJson();
    const globalFrames: VisualFrameProducerClientFrame[] = [];
    const localFrames: VisualFrameProducerClientFrame[] = [];
    unsubscriptions.push(subscribeVisualFrameProducerFrames((frame) => {
      expect(postJson).not.toHaveBeenCalledWith(
        "/api/agi/situation/visual-frame/analyze",
        expect.anything(),
      );
      globalFrames.push(frame);
    }));

    const result = await runVisualFrameProducerOnce({
      sourceId: "visual_source:test",
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      sourceSurface: "camera",
      sourceOrigin: "browser_getUserMedia",
      liveRuntimeEligible: true,
      onFrame: (frame) => {
        localFrames.push(frame);
      },
    });

    expect(globalFrames).toHaveLength(1);
    expect(localFrames).toHaveLength(1);
    expect(globalFrames[0]).toBe(localFrames[0]);
    expect(result.client_frame).toBe(globalFrames[0]);
    expect(result.client_frame).toMatchObject({
      sourceId: "visual_source:test",
      threadId: "thread:test",
      previewHash: expectedPreviewHash,
      mimeType: "image/jpeg",
      dataUrl: jpegDataUrl,
      sourceSurface: "camera",
      sourceOrigin: "browser_getUserMedia",
      liveRuntimeEligible: true,
    });
    expect(result.client_frame?.clientFrameId).toContain(
      `visual_source:test:${expectedPreviewHash}:`,
    );
    expect(getLatestVisualFrameProducerFrame()).toBe(result.client_frame);
    expect(result.warnings).toEqual([]);

    const descriptorCall = postJson.mock.calls.find(([path]) =>
      path === "/api/agi/situation/live-source/descriptor");
    expect(descriptorCall?.[1]).toMatchObject({
      serving_context: {
        surface: "camera",
        source_origin: "browser_getUserMedia",
      },
      raw_content_included: false,
    });

    const callsContainingRawFrame = postJson.mock.calls.filter(([, body]) =>
      JSON.stringify(body).includes(jpegDataUrl));
    expect(callsContainingRawFrame.map(([path]) => path)).toEqual([
      "/api/agi/situation/visual-frame/analyze",
    ]);
    for (const [, body] of postJson.mock.calls) {
      expect(body).not.toHaveProperty("client_frame");
      expect(body).not.toHaveProperty("dataUrl");
    }
  });

  it("isolates rejected sinks and reports one deterministic warning", async () => {
    const postJson = createPostJson();
    const onWarning = vi.fn(async () => {
      throw new Error("warning reporter must also be isolated");
    });
    unsubscriptions.push(subscribeVisualFrameProducerFrames(() => {
      throw new Error("global sink failed with sensitive detail");
    }));

    const result = await runVisualFrameProducerOnce({
      sourceId: "visual_source:sink-failure",
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      onFrame: async () => {
        throw new Error("local sink failed with different sensitive detail");
      },
      onWarning,
    });

    expect(result.summary).toBe("Visible test frame.");
    expect(result.warnings).toEqual([{
      code: "visual_frame_sink_callback_failed",
      message: "One or more visual frame sink callbacks failed; evidence capture continued.",
      sourceId: "visual_source:sink-failure",
      clientFrameId: result.client_frame?.clientFrameId,
      failedSinkCount: 2,
    }]);
    expect(JSON.stringify(result.warnings)).not.toContain("sensitive detail");
    expect(onWarning).toHaveBeenCalledWith(result.warnings[0]);
    expect(postJson).toHaveBeenCalledWith(
      "/api/agi/situation/visual-frame/analyze",
      expect.objectContaining({ image_base64: jpegDataUrl }),
    );
    expect(useVisualSourceCaptureStore.getState().producers["visual_source:sink-failure"])
      .toMatchObject({
        last_error: null,
        last_frame_hash: expectedPreviewHash,
        last_frame_at: result.client_frame?.capturedAt,
      });
  });

  it("stops notifying a subscriber after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeVisualFrameProducerFrames(listener);
    unsubscribe();

    await runVisualFrameProducerOnce({
      sourceId: "visual_source:unsubscribed",
      threadId: "thread:test",
      stream: createStream(),
      postJson: createPostJson(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears the latest raw frame when its source stops so it cannot be replayed", async () => {
    const sourceId = "visual_source:stopped-preview";
    const result = await runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson: createPostJson(),
      liveRuntimeEligible: true,
    });

    expect(getLatestVisualFrameProducerFrame()).toBe(result.client_frame);

    stopVisualFrameProducerInterval(sourceId);

    const listener = vi.fn();
    unsubscriptions.push(subscribeVisualFrameProducerFrames(listener));
    await Promise.resolve();
    expect(getLatestVisualFrameProducerFrame()).toBeNull();
    expect(useVisualSourceCaptureStore.getState().producers[sourceId]).toMatchObject({
      frame_history: [],
      last_frame_preview_data_url: null,
      stream_active: false,
      interval_active: false,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not fan out or upload an in-flight first frame after the source is stopped", async () => {
    const sourceId = "visual_source:stopped-in-flight";
    let releasePermission!: () => void;
    const permissionGate = new Promise<void>((resolve) => {
      releasePermission = resolve;
    });
    const postJson = vi.fn(async (path: string) => {
      if (path === "/api/agi/situation/visual-source/permission-granted") {
        await permissionGate;
      }
      return { ok: true };
    });
    const listener = vi.fn();
    unsubscriptions.push(subscribeVisualFrameProducerFrames(listener));

    const pendingCapture = runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      liveRuntimeEligible: true,
    });
    await vi.waitFor(() => {
      expect(postJson).toHaveBeenCalledWith(
        "/api/agi/situation/visual-source/permission-granted",
        expect.anything(),
      );
    });

    stopVisualFrameProducerInterval(sourceId);
    releasePermission();

    await expect(pendingCapture).rejects.toThrow("visual_capture_cancelled");
    expect(listener).not.toHaveBeenCalled();
    expect(postJson).not.toHaveBeenCalledWith(
      "/api/agi/situation/visual-frame/analyze",
      expect.anything(),
    );
    expect(getLatestVisualFrameProducerFrame()).toBeNull();
  });

  it("does not fan out or upload an in-flight first frame after its abort signal fires", async () => {
    const sourceId = "visual_source:aborted-in-flight";
    const controller = new AbortController();
    let releasePermission!: () => void;
    const permissionGate = new Promise<void>((resolve) => {
      releasePermission = resolve;
    });
    const postJson = vi.fn(async (path: string) => {
      if (path === "/api/agi/situation/visual-source/permission-granted") {
        await permissionGate;
      }
      return { ok: true };
    });
    const listener = vi.fn();
    unsubscriptions.push(subscribeVisualFrameProducerFrames(listener));

    const pendingCapture = runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      liveRuntimeEligible: true,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(postJson).toHaveBeenCalledWith(
        "/api/agi/situation/visual-source/permission-granted",
        expect.anything(),
      );
    });

    controller.abort();
    releasePermission();

    await expect(pendingCapture).rejects.toThrow("visual_capture_cancelled");
    expect(listener).not.toHaveBeenCalled();
    expect(postJson).not.toHaveBeenCalledWith(
      "/api/agi/situation/visual-frame/analyze",
      expect.anything(),
    );

    stopVisualFrameProducerInterval(sourceId);
  });

  it("does not restore raw frame history when stopped during post-analysis alignment", async () => {
    const sourceId = "visual_source:stopped-during-alignment";
    let releaseAlignment!: () => void;
    const alignmentGate = new Promise<void>((resolve) => {
      releaseAlignment = resolve;
    });
    const postJson = vi.fn(async (path: string) => {
      if (path === "/api/agi/situation/visual-frame/analyze") {
        return {
          evidence: {
            frame_id: "visual_frame:alignment",
            evidence_id: "visual_evidence:alignment",
            summary: "Visible alignment frame.",
          },
        };
      }
      if (path === "/api/agi/situation/visual-frame/align-with-events") {
        await alignmentGate;
      }
      return { ok: true };
    });

    const pendingCapture = runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      liveRuntimeEligible: true,
    });
    await vi.waitFor(() => {
      expect(postJson).toHaveBeenCalledWith(
        "/api/agi/situation/visual-frame/align-with-events",
        expect.anything(),
      );
    });

    stopVisualFrameProducerInterval(sourceId);
    releaseAlignment();

    await expect(pendingCapture).rejects.toThrow("visual_capture_cancelled");
    expect(getLatestVisualFrameProducerFrame()).toBeNull();
    expect(useVisualSourceCaptureStore.getState().producers[sourceId]).toMatchObject({
      frame_history: [],
      last_frame_preview_data_url: null,
      stream_active: false,
    });
  });

  it("reasserts stopped state after a late interval adoption write settles", async () => {
    vi.useFakeTimers();
    try {
      const sourceId = "visual_source:late-interval-adoption";
      let adoptionCallCount = 0;
      let releaseLateAdoption!: () => void;
      let markLateAdoptionStarted!: () => void;
      let markStoppedCompensation!: () => void;
      let markStoppedDescriptor!: () => void;
      const lateAdoptionGate = new Promise<void>((resolve) => {
        releaseLateAdoption = resolve;
      });
      const lateAdoptionStarted = new Promise<void>((resolve) => {
        markLateAdoptionStarted = resolve;
      });
      const stoppedCompensation = new Promise<void>((resolve) => {
        markStoppedCompensation = resolve;
      });
      const stoppedDescriptor = new Promise<void>((resolve) => {
        markStoppedDescriptor = resolve;
      });
      const postJson = vi.fn(async (path: string, body?: Record<string, unknown>) => {
        if (path === "/api/agi/situation/visual-frame/analyze") {
          return {
            evidence: {
              frame_id: `visual_frame:${Date.now()}`,
              evidence_id: `visual_evidence:${Date.now()}`,
              summary: "Visible interval frame.",
            },
          };
        }
        if (path === "/api/agi/situation/live-source/producer/adopt") {
          adoptionCallCount += 1;
          if (adoptionCallCount === 3) {
            markLateAdoptionStarted();
            await lateAdoptionGate;
          }
          if (body?.status === "stopped") markStoppedCompensation();
          return { adoption: { status: body?.status ?? "adopted" } };
        }
        if (
          path === "/api/agi/situation/live-source/descriptor" &&
          body?.current_state === "stopped"
        ) {
          markStoppedDescriptor();
        }
        return { ok: true };
      });

      await startVisualFrameProducerInterval({
        sourceId,
        threadId: "thread:test",
        stream: createStream(),
        postJson,
        cadenceMs: 10_000,
        liveRuntimeEligible: true,
      });

      vi.advanceTimersByTime(10_000);
      await lateAdoptionStarted;
      stopVisualFrameProducerInterval(sourceId);
      releaseLateAdoption();
      await stoppedCompensation;
      await stoppedDescriptor;

      const descriptorBodies = postJson.mock.calls
        .filter(([path]) => path === "/api/agi/situation/live-source/descriptor")
        .map(([, body]) => body);
      expect(descriptorBodies.at(-1)).toMatchObject({ current_state: "stopped" });
      expect(useVisualSourceCaptureStore.getState().producers[sourceId]).toMatchObject({
        stream_active: false,
        interval_active: false,
        scheduler_adoption_status: "stopped",
        frame_history: [],
        last_frame_preview_data_url: null,
      });
      expect(getLatestVisualFrameProducerFrame()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not adopt a different active stream for a server producer with another source id", async () => {
    const activeSourceId = "visual_source:active-camera";
    const requestedSourceId = "visual_source:server-screen";
    const postJson = createPostJson();
    await runVisualFrameProducerOnce({
      sourceId: activeSourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      sourceSurface: "camera",
      sourceOrigin: "browser_getUserMedia",
      liveRuntimeEligible: true,
    });
    postJson.mockClear();

    const fetchJson = vi.fn(async (path: string) => {
      if (path.startsWith("/api/agi/situation/live-source/producers")) {
        return {
          producers: [{
            producer_id: "visual_producer:server-screen",
            source_id: requestedSourceId,
            thread_id: "thread:test",
            modality: "visual_frame",
            capture_mode: "interval",
            cadence_ms: 10_000,
            status: "active",
          }],
        };
      }
      return { actions: [] };
    });

    const adopted = await adoptServerVisualProducerPolicies({
      threadId: "thread:test",
      postJson,
      fetchJson,
    });

    expect(adopted).toBe(0);
    expect(postJson).toHaveBeenCalledWith(
      "/api/agi/situation/live-source/producer/adopt",
      expect.objectContaining({
        source_id: requestedSourceId,
        client_stream_confirmed: false,
        interval_active: false,
        status: "waiting_for_stream",
      }),
    );
    expect(postJson).not.toHaveBeenCalledWith(
      "/api/agi/situation/live-source/producer/set-cadence",
      expect.objectContaining({ source_id: requestedSourceId }),
    );
    expect(postJson).not.toHaveBeenCalledWith(
      "/api/agi/situation/visual-frame/analyze",
      expect.anything(),
    );

    stopVisualFrameProducerInterval(activeSourceId);
  });

  it("preserves camera provenance in client capability adoption receipts", async () => {
    const sourceId = "visual_source:adopted-camera";
    const producerId = "visual_producer:adopted-camera";
    const actionRequestId = "client_action:adopted-camera";
    const postJson = createPostJson();
    await runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream: createStream(),
      postJson,
      sourceSurface: "camera",
      sourceOrigin: "browser_getUserMedia",
      liveRuntimeEligible: true,
    });
    postJson.mockClear();

    const fetchJson = vi.fn(async (path: string) => {
      if (path.startsWith("/api/agi/situation/live-source/producers")) {
        return {
          producers: [{
            producer_id: producerId,
            source_id: sourceId,
            thread_id: "thread:test",
            modality: "visual_frame",
            capture_mode: "interval",
            cadence_ms: 10_000,
            status: "active",
          }],
        };
      }
      return {
        actions: [{
          action_request_id: actionRequestId,
          thread_id: "thread:test",
          capability: "visual_capture",
          action: "adopt_producer",
          args: {
            producer_id: producerId,
            source_id: sourceId,
            capture_mode: "interval",
            cadence_ms: 10_000,
          },
        }],
      };
    });

    expect(await adoptServerVisualProducerPolicies({
      threadId: "thread:test",
      postJson,
      fetchJson,
    })).toBe(1);
    expect(postJson).toHaveBeenCalledWith(
      `/api/agi/client-action/${encodeURIComponent(actionRequestId)}/adopt`,
      expect.objectContaining({
        observed_state: expect.objectContaining({
          source_id: sourceId,
          surface: "camera",
          source_origin: "browser_getUserMedia",
          client_stream_confirmed: true,
        }),
      }),
    );

    stopVisualFrameProducerInterval(sourceId);
  });

  it("fails closed when the server pauses or stops the exact visual producer", async () => {
    const sourceId = "visual_source:server-controlled";
    const stream = createStream();
    const postJson = createPostJson();
    await runVisualFrameProducerOnce({
      sourceId,
      threadId: "thread:test",
      stream,
      postJson,
      captureMode: "interval",
      cadenceMs: 10_000,
      liveRuntimeEligible: true,
    });
    expect(isVisualFrameProducerSourceActive(sourceId)).toBe(true);

    const status = { current: "paused" as "paused" | "stopped" };
    const fetchJson = vi.fn(async (path: string) => {
      if (path.startsWith("/api/agi/situation/live-source/producers")) {
        return {
          producers: [{
            producer_id: "visual_producer:server-controlled",
            source_id: sourceId,
            thread_id: "thread:test",
            modality: "visual_frame",
            capture_mode: "interval",
            cadence_ms: 10_000,
            status: status.current,
          }],
        };
      }
      return { actions: [] };
    });

    expect(await adoptServerVisualProducerPolicies({
      threadId: "thread:test",
      postJson,
      fetchJson,
    })).toBe(0);
    expect(isVisualFrameProducerSourceActive(sourceId)).toBe(false);
    expect(useVisualSourceCaptureStore.getState().producers[sourceId]).toMatchObject({
      stream_active: true,
      interval_active: false,
      scheduler_adoption_status: "paused",
    });

    status.current = "stopped";
    expect(await adoptServerVisualProducerPolicies({
      threadId: "thread:test",
      postJson,
      fetchJson,
    })).toBe(0);
    expect(isVisualFrameProducerSourceActive(sourceId)).toBe(false);
    expect(getLatestVisualFrameProducerFrame()).toBeNull();
    expect(useVisualSourceCaptureStore.getState().producers[sourceId]).toMatchObject({
      stream_active: false,
      interval_active: false,
      scheduler_adoption_status: "stopped",
      frame_history: [],
      last_frame_preview_data_url: null,
    });
  });
});
