// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from
  "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import { clearPendingExactRoomReviewNavigation,
  consumePendingExactRoomReviewNavigation, requestExactRoomReviewNavigation } from
  "../exactRoomReviewNavigation";

const review = { roomId: "shared_realtime_room:exact",
  environmentBindingId: "environment:exact" };
afterEach(() => clearPendingExactRoomReviewNavigation());

describe("owner-clicked exact room review navigation", () => {
  it("queues one exact read until the room control mounts", () => {
    expect(requestExactRoomReviewNavigation(review, 1000))
      .toBe("waiting_for_room_control");
    expect(consumePendingExactRoomReviewNavigation(1001)).toEqual(review);
    expect(consumePendingExactRoomReviewNavigation(1002)).toBeNull();
  });

  it("delivers directly to an existing room control without leaving a stale hint", () => {
    const listener = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener);
    try {
      expect(requestExactRoomReviewNavigation(review, 1000)).toBe("opened_or_reading");
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        detail: review,
      }));
      expect(consumePendingExactRoomReviewNavigation(1001)).toBeNull();
    } finally { window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener); }
  });

  it("rejects unsupported room IDs and expires unattended navigation", () => {
    expect(requestExactRoomReviewNavigation({ roomId: "room:ambiguous" }, 1000))
      .toBe("invalid_room");
    expect(consumePendingExactRoomReviewNavigation(1001)).toBeNull();
    requestExactRoomReviewNavigation(review, 1000);
    expect(consumePendingExactRoomReviewNavigation(13_001)).toBeNull();
  });
});
