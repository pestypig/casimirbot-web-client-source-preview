// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedRoomInterpreterTurnHistory } from "../SharedRoomInterpreterTurnHistory";

const room = (id: string) => ({ room_id: id, self_participant_id: "owner",
  status: "waiting_for_participant" }) as HelixSharedRealtimeRoom;
const turn = (id: string, text: string) => ({ schema: "helix.room_interpreter_turn_status.v1",
  request_id: "room_interpreter_turn:11111111-1111-4111-8111-111111111111",
  room_id: id, trigger_message_id: "room_message:22222222-2222-4222-8222-222222222222",
  state: "completed", reply: { content_role: "room_interpreter_reply", text,
    result_sha256: "a".repeat(64) },
  failure_code: null, mission_authority: false, program_action: false });
const response = (id: string, turns: unknown[]) => new Response(JSON.stringify({
  schema: "helix.room_interpreter_turn_statuses.v1", room_id: id, turns }), { status: 200 });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("room interpreter conversation projection", () => {
  it("renders a bounded AI reply distinctly from mission and program authority", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("room:one", [turn("room:one", "A bounded reply")] )));
    render(<SharedRoomInterpreterTurnHistory room={room("room:one")} />);
    await screen.findByText("A bounded reply");
    expect(screen.getByText(/not a task decision or program action/)).toBeTruthy();
    expect(screen.getByText("Shared AI reply")).toBeTruthy();
  });
  it("drops a late reply when the selected room changes", async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: unknown) => String(url).includes("room%3Aold")
      ? new Promise<Response>(resolve => { resolveOld = resolve; })
      : Promise.resolve(response("room:new", [turn("room:new", "New room answer")]))));
    const view = render(<SharedRoomInterpreterTurnHistory room={room("room:old")} />);
    view.rerender(<SharedRoomInterpreterTurnHistory room={room("room:new")} />);
    await screen.findByText("New room answer");
    resolveOld?.(response("room:old", [turn("room:old", "Old room answer")]));
    await Promise.resolve();
    expect(screen.queryByText("Old room answer")).toBeNull();
  });
  it("hides the developer evaluation on policy denial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    render(<SharedRoomInterpreterTurnHistory room={room("room:one")} />);
    await Promise.resolve();
    expect(screen.queryByLabelText("Room AI turn history")).toBeNull();
  });
});
