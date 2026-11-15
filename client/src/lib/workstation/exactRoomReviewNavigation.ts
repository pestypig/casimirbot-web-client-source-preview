import { helixSharedLiveRoomIdSchema } from
  "@shared/contracts/helix-shared-live-room-agent.v1";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from
  "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";

type ExactRoomReview = Readonly<{
  roomId: string;
  environmentBindingId?: string;
}>;

const MAX_PENDING_MS = 12_000;
let pending: { review: ExactRoomReview; expiresAtMs: number } | null = null;

/** An owner-clicked navigation hint. The room controller performs only an authenticated read. */
export function requestExactRoomReviewNavigation(
  review: ExactRoomReview, nowMs = Date.now(),
): "opened_or_reading" | "waiting_for_room_control" | "invalid_room" {
  if (!helixSharedLiveRoomIdSchema.safeParse(review.roomId).success ||
      review.environmentBindingId !== undefined &&
      (typeof review.environmentBindingId !== "string" ||
        !review.environmentBindingId.trim() || review.environmentBindingId.length > 200)) {
    return "invalid_room";
  }
  const event = new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, {
    detail: review, cancelable: true,
  });
  if (!window.dispatchEvent(event)) {
    pending = null;
    return "opened_or_reading";
  }
  pending = { review: { ...review }, expiresAtMs: nowMs + MAX_PENDING_MS };
  return "waiting_for_room_control";
}

/** Called after a room controller mounts its exact-room event listener. */
export function consumePendingExactRoomReviewNavigation(nowMs = Date.now()):
  ExactRoomReview | null {
  const queued = pending;
  pending = null;
  return queued && queued.expiresAtMs > nowMs ? queued.review : null;
}

export function clearPendingExactRoomReviewNavigation(): void { pending = null; }
