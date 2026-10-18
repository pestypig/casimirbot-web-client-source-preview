/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomParticipantsPanel } from "../SharedLiveRoomParticipantsPanel";
import type { HelixSharedLiveRoomController } from "../useHelixSharedLiveRoom";

vi.mock("../SharedLiveRoomSourceBindingsPanel", () => ({ SharedLiveRoomSourceBindingsPanel: () => null }));
vi.mock("../SharedLiveRoomCapabilitiesPanel", () => ({ SharedLiveRoomCapabilitiesPanel: () => null }));
vi.mock("../SharedLiveRoomBrokerageBindingsPanel", () => ({ SharedLiveRoomBrokerageBindingsPanel: () => null }));
afterEach(cleanup);

const room = (capacity_profile: "two_person_voice" | "three_human_text", members: number) => ({
  room_id: "shared_realtime_room:test", status: "waiting_for_participant", capacity_profile,
  participants: Array.from({ length: members }, (_, index) => ({
    participant_id: `p${index}`, display_name: `Person ${index}`, presence: "present", role: index ? "participant" : "owner",
  })),
  readiness: { missing_consent_by_participant: {} },
  runtime: { active_speaker_participant_id: null },
  self_participant_id: "p0",
}) as unknown as HelixSharedRealtimeRoom;
const controller = { selfParticipant: { role: "owner" }, busyAction: null,
  inviteCode: null, inviteExpiresAt: null, createInvite: vi.fn() } as unknown as HelixSharedLiveRoomController;

it("shows two open seats to a solo text-room host and one after a guest joins", () => {
  const view = render(<SharedLiveRoomParticipantsPanel room={room("three_human_text", 1)}
    controller={controller} sectionId="people" />);
  expect(screen.getByText("2 open seats · invite signed-in accounts")).toBeInTheDocument();
  expect(screen.getByText("No voice or visual consent needed for text")).toBeInTheDocument();
  expect(screen.queryByText("Required permission records ready")).not.toBeInTheDocument();
  view.rerender(<SharedLiveRoomParticipantsPanel room={room("three_human_text", 2)}
    controller={controller} sectionId="people" />);
  expect(screen.getByText("1 open seat · invite signed-in account")).toBeInTheDocument();
  view.rerender(<SharedLiveRoomParticipantsPanel room={room("three_human_text", 3)}
    controller={controller} sectionId="people" />);
  expect(screen.queryByText(/open seat/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create invite" })).toBeDisabled();
});

it("keeps the two-person voice room at one available seat", () => {
  render(<SharedLiveRoomParticipantsPanel room={room("two_person_voice", 1)}
    controller={controller} sectionId="voice-people" />);
  expect(screen.getByText("1 open seat · invite signed-in account")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create invite" })).toBeEnabled();
});
