/** @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomVisualLanes } from "../SharedLiveRoomVisualLanes";
import type { HelixSharedLiveRoomController } from "../useHelixSharedLiveRoom";

const participant: HelixSharedRealtimeRoomParticipant = {
  participant_id: "participant:self",
  display_name: "Dan",
  role: "participant",
  presence: "present",
  consent: {
    schema: "helix.shared_realtime_room.consent.v1",
    microphone_to_room: true,
    microphone_to_model: true,
    transcript_to_room: true,
    screen_to_model: true,
    screen_thumbnail_to_room: false,
    model_audio_output: true,
    consent_version: 1,
    consent_receipt_ref: "consent:self",
    updated_at: new Date(0).toISOString(),
  },
  joined_at: new Date(0).toISOString(),
  last_seen_at: new Date(0).toISOString(),
};

const room = {
  self_participant_id: participant.participant_id,
  participants: [participant],
  participant_context_cards: [],
} as unknown as HelixSharedRealtimeRoom;

const controller = {
  selfParticipant: participant,
  frames: [],
  busyAction: null,
  frameUpload: {
    status: "idle",
    sourceId: null,
    historyId: null,
    observedAt: null,
    providerDelivery: null,
    error: null,
  },
} as unknown as HelixSharedLiveRoomController;

describe("Shared Live Room visual capture action", () => {
  it("starts the selected local producer without requiring a local GPT Live call", () => {
    const requestCapture = vi.fn();
    render(
      <SharedLiveRoomVisualLanes
        room={room}
        controller={controller}
        sectionId="room-visuals"
        onVisualSourceCaptureRequested={requestCapture}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Start selected Screen / Camera capture",
    }));

    expect(requestCapture).toHaveBeenCalledOnce();
    expect(screen.getByText(/does not start a second GPT Live call/i)).toBeInTheDocument();
  });
});
