import { roomResultCatalogSchema, type RoomResultOption } from "@shared/helix-room-result-catalog";
import { sharedRoomReportCatalogSchema, sharedRoomReportExplanationSelectionSchema } from "@shared/helix-hosted-room-shared-reports";

export class RoomResultRequestError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
const safeCode = (value: unknown) => typeof value === "string" && /^[a-z0-9_]{3,100}$/.test(value)
  ? value : "room_result_request_failed";

export async function readOwnerRoomResults(roomId: string, signal: AbortSignal) {
  const response = await fetch(`/api/account/session/agent-connections/room-missions/${encodeURIComponent(roomId)}/results`,
    { credentials: "include", cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new RoomResultRequestError(safeCode(body?.error), response.status);
  const catalog = roomResultCatalogSchema.parse(body);
  if (catalog.room_id !== roomId || catalog.results.some(result => result.room_id !== roomId ||
      result.room_mission_id !== catalog.mission?.mission_id ||
      result.room_mission_revision !== catalog.mission?.mission_revision))
    throw new RoomResultRequestError("room_result_source_mismatch", 409);
  return catalog;
}

export async function explainOwnerRoomResult(result: RoomResultOption, question: string, signal: AbortSignal) {
  return submitExplanation({ room_id: result.room_id, room_mission_id: result.room_mission_id,
    room_mission_revision: result.room_mission_revision, steering_event_ref: result.steering_event_ref,
    result_ref: result.result_ref, request_id: result.result_ref, share_with_room: true }, question, signal);
}

export async function readOwnerHostedRoomReports(roomId: string, signal: AbortSignal) {
  const response = await fetch(`/api/account/session/rooms/${encodeURIComponent(roomId)}/approved-reports`,
    { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new RoomResultRequestError(safeCode(body?.error), response.status);
  const catalog = sharedRoomReportCatalogSchema.parse(body);
  if (catalog.room.room_id !== roomId) throw new RoomResultRequestError("room_result_source_mismatch", 409);
  return catalog;
}

export async function explainOwnerHostedRoomReport(roomId: string, report: { disclosure_ref: string; result_sha256: string },
  question: string, signal: AbortSignal) {
  const selection = sharedRoomReportExplanationSelectionSchema.parse({ source: "hosted_approved_report", room_id: roomId,
    disclosure_ref: report.disclosure_ref, result_sha256: report.result_sha256,
    request_id: report.disclosure_ref, share_with_room: true });
  return submitExplanation(selection, question, signal);
}

async function submitExplanation(selection: { room_id: string } & Record<string, unknown>, question: string, signal: AbortSignal) {
  const response = await fetch("/api/agi/ask/turn", {
    method: "POST", credentials: "include", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: question.trim(), session_id: `helix-ask:room:${selection.room_id}`, room_mission_result: selection }),
  });
  const body = await response.json();
  if (response.status === 202) return { state: "pending" as const, turnId: null };
  if (!response.ok || body?.final_status === "final_failure" || body?.terminal_error_code)
    throw new RoomResultRequestError(safeCode(body?.terminal_error_code ?? body?.error), response.status);
  if (!["final_answer", "completed"].includes(body?.final_status) ||
      typeof body?.turn_id !== "string" || !body.turn_id.startsWith("ask:room-result:"))
    throw new RoomResultRequestError("room_result_answer_unconfirmed", response.status);
  // Do not render this HTTP payload as a public answer. The room's existing
  // authorized projection is the only source for shared answer presentation.
  return { state: "processed" as const, turnId: body.turn_id as string };
}
