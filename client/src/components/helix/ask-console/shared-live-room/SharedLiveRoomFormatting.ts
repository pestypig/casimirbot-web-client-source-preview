import type { HelixSharedRealtimeRoomVisualFrame } from
  "@shared/helix-shared-realtime-room";

export const formatSharedLiveRoomTimestamp = (
  value: string | null | undefined,
): string => {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "unknown";
};

export const labelSharedLiveRoomFrameSurface = (
  frame: HelixSharedRealtimeRoomVisualFrame,
): string => {
  switch (frame.source_surface) {
    case "device_camera":
      return "Camera";
    case "browser_tab":
      return "Browser tab";
    case "desktop_window":
      return "Desktop window";
    case "manual_upload":
      return "Image Lens / manual image";
    case "screen_share_window":
      return "Shared screen";
  }
};
