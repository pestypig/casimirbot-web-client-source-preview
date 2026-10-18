// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { isLocalRoomTextOwnerAdmitted, LocalRoomTextOwnerBridge, type LocalRoomTextOwnerSnapshot } from "../LocalRoomTextOwnerBridge";
import { createRoomTextDraftStore } from "../RoomTextDraftStore";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps authenticated away members in room text while denying left or mismatched rooms", () => {
  const room = { room_id: "room:one", title: "Study room", status: "ready",
    self_participant_id: "host", participants: [{ participant_id: "host", presence: "away" }] } as unknown as HelixSharedRealtimeRoom;
  const snapshot = { room, conversation: { admitted: true } } as LocalRoomTextOwnerSnapshot;
  expect(isLocalRoomTextOwnerAdmitted(snapshot, "room:one")).toBe(true);
  expect(isLocalRoomTextOwnerAdmitted(snapshot, "room:other")).toBe(false);
  expect(isLocalRoomTextOwnerAdmitted({ ...snapshot, room: { ...room, participants: [
    { ...room.participants[0], presence: "left" },
  ] } }, "room:one")).toBe(false);
  expect(isLocalRoomTextOwnerAdmitted({ ...snapshot, conversation: {
    ...snapshot.conversation, admitted: false,
  } }, "room:one")).toBe(false);
});

it("keeps one admitted room owner and its history when the dialog view closes", async () => {
  const room = { room_id: "room:one", title: "Study room", status: "ready",
    self_participant_id: "host", participants: [{ participant_id: "host", display_name: "Host", presence: "present" }] } as unknown as HelixSharedRealtimeRoom;
  const fetchRoom = vi.fn(async () => ({ ok: true, json: async () => ({
    schema: "helix.shared_realtime_room.text_messages.v1", room_id: "room:one",
    model_input: false, task_handoff: false,
    messages: [{ message_id: "m1", room_id: "room:one", author_participant_id: "host",
      text: "Existing room message", created_at: "2026-09-28T00:00:00Z", content_role: "room_member_text" }],
  }) }));
  vi.stubGlobal("fetch", fetchRoom);
  const store = createRoomTextDraftStore();
  function Harness() {
    const [dialogOpen, setDialogOpen] = useState(true);
    const [snapshot, setSnapshot] = useState<LocalRoomTextOwnerSnapshot | null>(null);
    return <><LocalRoomTextOwnerBridge room={room} draftStore={store} onChange={setSnapshot}>
      {() => dialogOpen ? <div>Room dialog view</div> : null}
    </LocalRoomTextOwnerBridge>
      <button type="button" onClick={() => setDialogOpen(false)}>Close room dialog</button>
      <p>{snapshot?.conversation.admitted ? snapshot.conversation.messages[0]?.text : "Checking membership"}</p>
    </>;
  }
  render(<Harness />);
  await waitFor(() => expect(screen.getByText("Existing room message")).toBeInTheDocument());
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close room dialog" })));
  expect(screen.queryByText("Room dialog view")).toBeNull();
  expect(screen.getByText("Existing room message")).toBeInTheDocument();
  expect(fetchRoom).toHaveBeenCalledTimes(1);
});
