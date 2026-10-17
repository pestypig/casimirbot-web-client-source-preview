import { z } from "zod";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import { helixReasoningSteeringEventProjectionSchema } from "@shared/helix-reasoning-task-binding";

const selectionSchema = z.object({
  selection_id: z.string(), room_id: z.string(), message_id: z.string(),
  author_participant_id: z.string(), mission_id: z.string(), mission_revision: z.number().int().positive(),
  reasoning_binding_id: z.string(), binding_epoch: z.number().int().positive(),
  message_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["selected", "approved", "revoked"]),
  consent_revision: z.number().int().positive(), approval_id: z.string().nullable(),
  raw_content_included: z.literal(false), task_handoff: z.literal(false),
  dispatch_authority: z.literal(false), provider_calls: z.literal(0),
}).passthrough();
const reviewSchema = z.object({
  schema: z.literal("helix.room_mission_text_owner_review.v1"),
  selection: selectionSchema,
  raw_content_included: z.literal(false), task_handoff: z.literal(false),
  dispatch_authority: z.literal(false), provider_calls: z.literal(0),
}).passthrough();
export type RoomMissionTextOwnerReview = z.infer<typeof reviewSchema>;

const request = async (url: string, signal: AbortSignal, body?: unknown) => {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST",
    credentials: "include", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body) }) });
  const value: unknown = await response.json();
  if (!response.ok) throw Error("room_mission_text_request_failed");
  return value;
};
const roomBase = (roomId: string) => `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}`;

export async function readRoomMissionTextOwnerReviews(mission: RoomMissionOwnerSelection,
  signal: AbortSignal): Promise<RoomMissionTextOwnerReview[]> {
  const result = z.object({ schema: z.literal("helix.room_mission_text_owner_reviews.v1"),
    room_id: z.literal(mission.room_id), reviews: z.array(reviewSchema),
    model_input: z.literal(false), task_handoff: z.literal(false),
    dispatch_authority: z.literal(false), provider_calls: z.literal(0),
  }).passthrough().parse(await request(`${roomBase(mission.room_id)}/mission-text-review`, signal));
  if (result.reviews.some(item => item.selection.room_id !== mission.room_id ||
      item.selection.mission_id !== mission.mission_id ||
      item.selection.mission_revision !== mission.mission_revision ||
      item.selection.reasoning_binding_id !== mission.reasoning_binding_id ||
      item.selection.binding_epoch !== mission.binding_epoch ||
      item.selection.state === "revoked")) throw Error("room_mission_text_review_scope_mismatch");
  return result.reviews;
}

export async function approveRoomMissionTextReview(mission: RoomMissionOwnerSelection,
  review: RoomMissionTextOwnerReview, requestId: string, signal: AbortSignal) {
  const selected = review.selection;
  if (selected.state !== "selected" || selected.mission_id !== mission.mission_id ||
      selected.mission_revision !== mission.mission_revision) throw Error("room_mission_text_review_not_current");
  const result = z.object({ schema: z.literal("helix.room_mission_text_approval_response.v1"),
    room_id: z.literal(mission.room_id), approval: selectionSchema,
    model_input: z.literal(false), task_handoff: z.literal(false),
    dispatch_authority: z.literal(false), provider_calls: z.literal(0),
  }).passthrough().parse(await request(`${roomBase(mission.room_id)}/mission-text-approvals`, signal, {
    selection_id: selected.selection_id, expected_message_sha256: selected.message_sha256,
    expected_consent_revision: selected.consent_revision,
    expected_mission_revision: mission.mission_revision, request_id: requestId,
  }));
  if (result.approval.selection_id !== selected.selection_id || result.approval.state !== "approved" ||
      result.approval.message_sha256 !== selected.message_sha256 ||
      result.approval.consent_revision !== selected.consent_revision || !result.approval.approval_id)
    throw Error("room_mission_text_approval_mismatch");
  return result.approval;
}

export async function dispatchApprovedRoomMissionText(mission: RoomMissionOwnerSelection,
  review: RoomMissionTextOwnerReview, signal: AbortSignal) {
  const selected = review.selection;
  if (selected.state !== "approved" || !selected.approval_id ||
      selected.mission_id !== mission.mission_id ||
      selected.mission_revision !== mission.mission_revision) throw Error("room_mission_text_approval_not_current");
  const result = z.object({ schema: z.literal("helix.room_mission_text_dispatch_receipt.v1"),
    ok: z.literal(true), event: helixReasoningSteeringEventProjectionSchema,
    room_mission_id: z.literal(mission.mission_id),
    room_mission_revision: z.literal(mission.mission_revision),
    selection_id: z.literal(selected.selection_id),
    author_participant_id: z.literal(selected.author_participant_id),
    provider_pickup_confirmed: z.literal(false), answer_authority: z.literal(false),
    terminal_eligible: z.literal(false), raw_content_included: z.literal(false),
  }).passthrough().parse(await request(
    "/api/account/session/agent-connections/room-missions/dispatch-text", signal, {
      room_id: mission.room_id, room_mission_id: mission.mission_id,
      room_mission_revision: mission.mission_revision,
      selection_id: selected.selection_id, approval_id: selected.approval_id,
      expected_message_sha256: selected.message_sha256,
      expected_consent_revision: selected.consent_revision,
    }));
  const event = result.event;
  if (event.reasoning_binding_id !== mission.reasoning_binding_id ||
      event.binding_epoch !== mission.binding_epoch || event.origin !== "typed" ||
      event.client_event_ref !== `room_text_approval_dispatch:${selected.approval_id}` ||
      event.instruction_sha256 !== selected.message_sha256) throw Error("room_mission_text_dispatch_mismatch");
  return event;
}

export async function readRoomMissionTextDispatchStatus(mission: RoomMissionOwnerSelection,
  eventRef: string, signal: AbortSignal) {
  const result = z.object({ ok: z.literal(true), event: helixReasoningSteeringEventProjectionSchema })
    .passthrough().parse(await request(
      `/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(mission.reasoning_binding_id)}` +
      `/steering/${encodeURIComponent(eventRef)}?binding_epoch=${mission.binding_epoch}`, signal));
  if (result.event.steering_event_ref !== eventRef ||
      result.event.reasoning_binding_id !== mission.reasoning_binding_id ||
      result.event.binding_epoch !== mission.binding_epoch || result.event.origin !== "typed")
    throw Error("room_mission_text_status_mismatch");
  return result.event;
}
