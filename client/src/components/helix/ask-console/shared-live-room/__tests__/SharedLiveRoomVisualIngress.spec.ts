import { describe, expect, it } from "vitest";
import type { VisualSourceCaptureFrameHistoryItem } from
  "@/store/useVisualSourceCaptureStore";
import { mapCaptureFrameToRoomSurface } from "../useSharedLiveRoomVisualIngress";

const frame = (
  sourceSurface: VisualSourceCaptureFrameHistoryItem["source_surface"],
  sourceKind: VisualSourceCaptureFrameHistoryItem["source_kind"] = "full_frame",
): VisualSourceCaptureFrameHistoryItem => ({
  history_id: "history:test",
  source_id: "source:test",
  frame_id: null,
  evidence_id: null,
  captured_at: new Date().toISOString(),
  preview_data_url: "data:image/jpeg;base64,AQID",
  preview_hash: "sha256:test",
  source_surface: sourceSurface,
  source_kind: sourceKind,
  summary: "test",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
});

describe("Shared Live Room visual provenance mapping", () => {
  it("preserves screen, tab, window, and camera surface identity", () => {
    expect(mapCaptureFrameToRoomSurface(frame("camera"), "source:camera"))
      .toBe("device_camera");
    expect(mapCaptureFrameToRoomSurface(frame("browser_tab"), "source:tab"))
      .toBe("browser_tab");
    expect(mapCaptureFrameToRoomSurface(frame("window"), "source:window"))
      .toBe("desktop_window");
    expect(mapCaptureFrameToRoomSurface(frame("screen"), "source:screen"))
      .toBe("screen_share_window");
  });

  it("labels Image Lens/manual carousel frames as manual uploads", () => {
    expect(mapCaptureFrameToRoomSurface(
      frame("image_lens", "image_lens_crop"),
      "source:image-lens",
    )).toBe("manual_upload");
  });
});
