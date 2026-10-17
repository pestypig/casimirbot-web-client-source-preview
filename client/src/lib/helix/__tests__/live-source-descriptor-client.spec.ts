import { describe, expect, it, vi } from "vitest";

import { postVisualLiveSourceDescriptor } from "@/lib/helix/liveSourceDescriptorClient";

describe("live source descriptor client", () => {
  it("posts device-camera identity while preserving screen-share defaults", async () => {
    const postJson = vi.fn().mockResolvedValue({ ok: true });

    await postVisualLiveSourceDescriptor({
      postJson,
      sourceId: "visual:camera",
      threadId: "thread:1",
      sourceOrigin: "browser_getUserMedia",
      surface: "camera",
    });

    expect(postJson).toHaveBeenCalledWith(
      "/api/agi/situation/live-source/descriptor",
      expect.objectContaining({
        source_id: "visual:camera",
        user_label: "Device camera capture",
        serving_context: expect.objectContaining({
          surface: "camera",
          source_origin: "browser_getUserMedia",
        }),
        assistant_answer: false,
        raw_content_included: false,
      }),
    );

    postJson.mockClear();
    await postVisualLiveSourceDescriptor({
      postJson,
      sourceId: "visual:screen",
      threadId: "thread:1",
    });
    expect(postJson).toHaveBeenCalledWith(
      "/api/agi/situation/live-source/descriptor",
      expect.objectContaining({
        user_label: "Browser visual capture",
        serving_context: expect.objectContaining({
          surface: "screen",
          source_origin: "browser_getDisplayMedia",
        }),
      }),
    );
  });
});
