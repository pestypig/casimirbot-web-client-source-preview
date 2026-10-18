// @vitest-environment jsdom
import React from "react";
import { createHash, webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import { RoomMissionTextOwnerReviewPanel } from "../RoomMissionTextOwnerReviewPanel";

const text = "Use the dry route.";
const hash = createHash("sha256").update(text).digest("hex");
const room = { room_id: "room:owner", self_participant_id: "participant:owner", status: "open",
  participants: [{ participant_id: "participant:author", display_name: "Sam" }] } as unknown as HelixSharedRealtimeRoom;
const mission = { room_id: room.room_id, mission_id: "room_mission:one", mission_revision: 1,
  status: "active", reasoning_binding_id: "binding:one", binding_epoch: 2 } as RoomMissionOwnerSelection;
const message = { room_id: room.room_id, message_id: "room_message:one",
  author_participant_id: "participant:author", text };
const selected = { selection_id: "room_mission_text_selection:one", room_id: room.room_id,
  message_id: message.message_id, author_participant_id: message.author_participant_id,
  mission_id: mission.mission_id, mission_revision: 1, reasoning_binding_id: mission.reasoning_binding_id,
  binding_epoch: 2, message_sha256: hash, state: "selected", consent_revision: 1,
  approval_id: null, raw_content_included: false, task_handoff: false,
  dispatch_authority: false, provider_calls: 0 };
const review = { schema: "helix.room_mission_text_owner_review.v1", selection: selected,
  raw_content_included: false, task_handoff: false, dispatch_authority: false, provider_calls: 0 };
const json = (body: unknown) => new Response(JSON.stringify(body),
  { status: 200, headers: { "Content-Type": "application/json" } });
const event = { schema: "helix.reasoning_steering_event.v1", steering_event_ref: "event:text",
  reasoning_binding_id: mission.reasoning_binding_id, binding_epoch: 2, cursor: 1,
  client_event_ref: "room_text_approval_dispatch:room_mission_text_approval:one",
  origin: "typed", delivery_state: "pending", instruction_sha256: hash,
  instruction_length: text.length, created_at: "2026-09-30T00:00:00.000Z",
  expires_at: "2026-09-30T00:10:00.000Z", acknowledged_at: null,
  advisory_only: true, execution_requested: false, evidence_satisfied: false,
  provider_thread_content_included: false, hidden_reasoning_included: false,
  answer_authority: false, terminal_eligible: false };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("verifies visible room text, then separates owner approval from exact-task dispatch", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return json({
      schema: "helix.room_mission_text_owner_reviews.v1", room_id: room.room_id,
      reviews: [review], model_input: false, task_handoff: false,
      dispatch_authority: false, provider_calls: 0 });
    const body = JSON.parse(String(init.body)); calls.push({ url, body });
    if (url.endsWith("/mission-text-approvals")) return json({
      schema: "helix.room_mission_text_approval_response.v1", room_id: room.room_id,
      approval: { ...selected, state: "approved", approval_id: "room_mission_text_approval:one" },
      model_input: false, task_handoff: false, dispatch_authority: false, provider_calls: 0 });
    return json({ schema: "helix.room_mission_text_dispatch_receipt.v1", ok: true,
      event, room_mission_id: mission.mission_id, room_mission_revision: 1,
      selection_id: selected.selection_id, author_participant_id: selected.author_participant_id,
      provider_pickup_confirmed: false, answer_authority: false,
      terminal_eligible: false, raw_content_included: false });
  }));
  render(<RoomMissionTextOwnerReviewPanel room={room} mission={mission} messages={[message]} />);
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Load member proposals" }));
  await screen.findByText(text);
  expect(screen.queryByRole("button", { name: "Record owner approval" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Verify displayed message" }));
  await screen.findByText(/matches the author's selected message hash/i);
  fireEvent.click(screen.getByLabelText(/Approve this exact message/));
  fireEvent.click(screen.getByRole("button", { name: "Record owner approval" }));
  await screen.findByText(/Codex has not received this message/i);
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toMatchObject({ selection_id: selected.selection_id,
    expected_message_sha256: hash, expected_consent_revision: 1 });
  expect(screen.queryByText(/Instruction queued for the exact paired task/)).toBeNull();
  fireEvent.click(screen.getByLabelText(/Send this approved message/));
  fireEvent.click(screen.getByRole("button", { name: "Send approved text to Codex" }));
  await screen.findByText(/Instruction queued for the exact paired task/);
  expect(calls).toHaveLength(2);
  expect(calls[1].body).toEqual({ room_id: room.room_id,
    room_mission_id: mission.mission_id, room_mission_revision: 1,
    selection_id: selected.selection_id, approval_id: "room_mission_text_approval:one",
    expected_message_sha256: hash, expected_consent_revision: 1 });
  expect(JSON.stringify(calls)).not.toContain(text);
});

it("refuses approval when displayed text does not match the selected hash", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async () => json({ schema: "helix.room_mission_text_owner_reviews.v1",
    room_id: room.room_id, reviews: [review], model_input: false, task_handoff: false,
    dispatch_authority: false, provider_calls: 0 }));
  vi.stubGlobal("fetch", fetcher);
  render(<RoomMissionTextOwnerReviewPanel room={room} mission={mission}
    messages={[{ ...message, text: "Changed after selection" }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Load member proposals" }));
  await screen.findByText("Changed after selection");
  fireEvent.click(screen.getByRole("button", { name: "Verify displayed message" }));
  await screen.findByText(/Displayed room text does not match the selected message/i);
  expect(screen.queryByRole("button", { name: "Record owner approval" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("recovers an approved review after remount but still requires explicit verification and send", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return json({
      schema: "helix.room_mission_text_owner_reviews.v1", room_id: room.room_id,
      reviews: [{ ...review, selection: { ...selected, state: "approved",
        approval_id: "room_mission_text_approval:one" } }],
      model_input: false, task_handoff: false, dispatch_authority: false, provider_calls: 0,
    });
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return json({ schema: "helix.room_mission_text_dispatch_receipt.v1", ok: true,
      event, room_mission_id: mission.mission_id, room_mission_revision: 1,
      selection_id: selected.selection_id, author_participant_id: selected.author_participant_id,
      provider_pickup_confirmed: false, answer_authority: false,
      terminal_eligible: false, raw_content_included: false });
  }));
  render(<RoomMissionTextOwnerReviewPanel room={room} mission={mission} messages={[message]} />);
  fireEvent.click(screen.getByRole("button", { name: "Load member proposals" }));
  await screen.findByText(text);
  expect(screen.queryByRole("button", { name: "Send approved text to Codex" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Verify displayed message" }));
  await screen.findByText(/matches the author's selected message hash/i);
  expect(screen.getByRole("button", { name: "Send approved text to Codex" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByLabelText(/Send this approved message/));
  fireEvent.click(screen.getByRole("button", { name: "Send approved text to Codex" }));
  await screen.findByText(/Instruction queued for the exact paired task/);
  expect(calls).toHaveLength(1);
  expect(JSON.stringify(calls)).not.toContain(text);
});
