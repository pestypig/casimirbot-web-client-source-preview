import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import { helixOwnerMissionActivityPageSchema } from
  "@shared/helix-environment-mission-activity-page";

export class RoomMissionActivityReadError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** A private owner read. It cannot send room messages or control the game. */
export async function readRoomMissionActivityPage(
  mission: RoomMissionOwnerSelection,
  cursor: string | null,
  signal: AbortSignal,
) {
  if (mission.status !== "active" || !mission.run_id ||
      (cursor !== null && (cursor.length < 1 || cursor.length > 8_192))) {
    throw new RoomMissionActivityReadError("mission_activity_scope_invalid");
  }
  const query = new URLSearchParams({ room_id: mission.room_id });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/account/session/operator-activity/mission-overlay?${query}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new RoomMissionActivityReadError(
    [400, 401, 403, 404, 409, 410].includes(response.status)
      ? "mission_activity_scope_changed" : "mission_activity_unavailable",
  );
  const parsed = helixOwnerMissionActivityPageSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.run_id !== mission.run_id ||
      parsed.data.session_identity.mission_id !== mission.mission_id ||
      parsed.data.session_identity.mission_revision !== mission.mission_revision ||
      parsed.data.session_identity.binding_epoch !== mission.binding_epoch ||
      parsed.data.session_identity.scope.room_ref !== mission.room_id) {
    throw new RoomMissionActivityReadError("mission_activity_response_mismatch");
  }
  return parsed.data;
}
