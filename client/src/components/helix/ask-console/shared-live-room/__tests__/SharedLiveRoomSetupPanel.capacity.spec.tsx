/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedLiveRoomSetupPanel } from "../SharedLiveRoomSetupPanel";
import type { HelixSharedLiveRoomController } from "../useHelixSharedLiveRoom";

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  readCachedAccountCapabilityPolicy: () => ({ account_type: "developer" }),
}));

afterEach(cleanup);

it("offers the developer a distinct text-only profile without changing default room creation", () => {
  const createRoom = vi.fn(async () => true);
  const controller = { createRoom, joinRoom: vi.fn(async () => true), rooms: [], busyAction: null } as unknown as HelixSharedLiveRoomController;
  render(<SharedLiveRoomSetupPanel controller={controller} fieldIdPrefix="capacity" />);
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  expect(createRoom).toHaveBeenLastCalledWith("");
  fireEvent.change(screen.getByLabelText("Room profile"), { target: { value: "three_human_text" } });
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  expect(createRoom).toHaveBeenLastCalledWith("", "three_human_text");
});

it("shows the actual capacity of an existing text room in the switcher", () => {
  const controller = { createRoom: vi.fn(), joinRoom: vi.fn(), openRoom: vi.fn(), busyAction: null,
    rooms: [{ room_id: "three", title: "Text evaluation", capacity_profile: "three_human_text",
      status: "waiting_for_participant", participants: [
        { participant_id: "host", presence: "present" },
        { participant_id: "departed", presence: "left" },
      ] }] } as unknown as HelixSharedLiveRoomController;
  render(<SharedLiveRoomSetupPanel controller={controller} fieldIdPrefix="existing" />);
  expect(screen.getByRole("button", { name: /Text evaluation/ })).toHaveTextContent(
    "1/3 · text only · waiting_for_participant",
  );
});
