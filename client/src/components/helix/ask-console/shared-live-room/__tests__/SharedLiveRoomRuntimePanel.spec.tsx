// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomRuntimePanel } from "../SharedLiveRoomRuntimePanel";
import type { HelixSharedLiveRoomController } from "../useHelixSharedLiveRoom";

afterEach(cleanup);

describe("Shared GPT Live runtime presentation", () => {
  it("shows the actual room model and host-payer boundary without implying guest device activity", () => {
    const room = {
      readiness: { ready: true },
      runtime: {
        state: "host_transport_active",
        transport_owner: "host_browser",
        model: "gpt-realtime",
        realtime_session_ref_hash: "session-hash",
        active_speaker_participant_id: null,
      },
    } as HelixSharedRealtimeRoom;
    const controller = {
      selfParticipant: { participant_id: "guest", role: "participant" },
      runtimeActive: false,
      busyAction: null,
    } as HelixSharedLiveRoomController;

    render(<SharedLiveRoomRuntimePanel room={room} controller={controller} sectionId="runtime-title" />);

    const panel = screen.getByText("Shared GPT Live · assisted evaluation").closest("section");
    expect(panel).toHaveTextContent("GPT Live on this device: inactive");
    expect(panel).toHaveTextContent("Selected model: gpt-realtime");
    expect(panel).toHaveTextContent("Expected payer: the host's configured OpenAI connection");
    expect(panel).toHaveTextContent("does not verify provider billing");
  });
});
