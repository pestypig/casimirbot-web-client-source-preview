// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedRoomMissionTextChoices } from "../SharedRoomMissionTextChoices";

const room = (id: string) => ({ room_id: id, self_participant_id: "participant:author",
  status: "waiting_for_participant" }) as HelixSharedRealtimeRoom;
const message = (id: string) => ({ message_id: id, room_id: "room:test",
  author_participant_id: "participant:author", text: "Use the dry route." });
const selection = (state: "selected" | "revoked") => ({
  selection_id: "room_mission_text_selection:one", room_id: "room:test",
  message_id: "room_message:one", author_participant_id: "participant:author",
  mission_id: "room_mission:one", mission_revision: 1, state,
  consent_revision: state === "selected" ? 1 : 2,
  selected_at: "2026-09-30T00:00:00.000Z", expires_at: "2026-09-30T00:15:00.000Z",
  raw_content_included: false, task_handoff: false, dispatch_authority: false, provider_calls: 0,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("requires an explicit author choice and sends only IDs, never room text or task-binding fields", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let saved: ReturnType<typeof selection>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method) return response({ schema: "helix.room_mission_text_selections.v1",
      room_id: "room:test", selections: saved,
      current_mission: { mission_id: "room_mission:one", mission_revision: 1 },
      model_input: false, task_handoff: false, provider_calls: 0 });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body });
    const receipt = selection(body.action === "select" ? "selected" : "revoked");
    saved = [receipt];
    return response({ schema: "helix.room_mission_text_selection_response.v1",
      room_id: "room:test", selection: receipt,
      model_input: false, task_handoff: false, provider_calls: 0 });
  }));
  render(<SharedRoomMissionTextChoices room={room("room:test")}
    messages={[message("room_message:one")]} admitted />);
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Review mission choices" }));
  await screen.findByRole("button", { name: "Review selection" });
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Review selection" }));
  fireEvent.click(screen.getByRole("button", { name: "Select this message for owner review" }));
  await screen.findByText(/It has not been sent to Codex/);
  expect(calls).toEqual([{ url: "/api/agi/realtime/rooms/room%3Atest/mission-text-selections/current",
    body: { action: "select", message_id: "room_message:one" } }]);
  fireEvent.click(screen.getByRole("button", { name: "Revoke mission selection" }));
  await screen.findByText(/Undelivered task pickup is blocked/);
  expect(calls[1]).toEqual({ url: calls[0].url,
    body: { action: "revoke", selection_id: "room_mission_text_selection:one" } });
  expect(JSON.stringify(calls)).not.toContain("Use the dry route.");
});

it("withholds a mismatched author receipt and clears choices on room change", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method
    ? response({ schema: "helix.room_mission_text_selection_response.v1", room_id: "room:test",
      selection: { ...selection("selected"), author_participant_id: "participant:other" },
      model_input: false, task_handoff: false, provider_calls: 0 })
    : response({ schema: "helix.room_mission_text_selections.v1", room_id: "room:test",
      selections: [], current_mission: { mission_id: "room_mission:one", mission_revision: 1 },
      model_input: false, task_handoff: false, provider_calls: 0 })));
  const view = render(<SharedRoomMissionTextChoices room={room("room:test")}
    messages={[message("room_message:one")]} admitted />);
  fireEvent.click(screen.getByRole("button", { name: "Review mission choices" }));
  await screen.findByRole("button", { name: "Review selection" });
  fireEvent.click(screen.getByRole("button", { name: "Review selection" }));
  fireEvent.click(screen.getByRole("button", { name: "Select this message for owner review" }));
  await screen.findByText(/selection outcome is unconfirmed/i);
  expect(screen.queryByRole("button", { name: "Revoke mission selection" })).toBeNull();
  view.rerender(<SharedRoomMissionTextChoices room={room("room:other")}
    messages={[]} admitted />);
  expect(screen.queryByText(/selection outcome is unconfirmed/i)).toBeNull();
});

it("does not mistake an earlier mission receipt for consent to the current task", async () => {
  const prior = selection("selected");
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return response({ schema: "helix.room_mission_text_selections.v1",
      room_id: "room:test", selections: [prior],
      current_mission: { mission_id: "room_mission:two", mission_revision: 2 },
      model_input: false, task_handoff: false, provider_calls: 0 });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push(body);
    return response({ schema: "helix.room_mission_text_selection_response.v1",
      room_id: "room:test", selection: { ...prior, state: "revoked", consent_revision: 2 },
      model_input: false, task_handoff: false, provider_calls: 0 });
  }));
  render(<SharedRoomMissionTextChoices room={room("room:test")}
    messages={[message("room_message:one")]} admitted />);
  fireEvent.click(screen.getByRole("button", { name: "Review mission choices" }));
  await screen.findByText(/Earlier mission selection is selected/);
  expect(screen.queryByText(/Awaiting owner review for the current mission/)).toBeNull();
  expect(screen.getByRole("button", { name: "Review selection" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Revoke earlier selection" }));
  await screen.findByText(/Undelivered task pickup is blocked/);
  expect(calls).toEqual([{ action: "revoke", selection_id: prior.selection_id }]);
});
