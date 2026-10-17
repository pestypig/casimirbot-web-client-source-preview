// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomPublicResultsPanel } from "../SharedLiveRoomPublicResultsPanel";

describe("SharedLiveRoomPublicResultsPanel", () => {
  afterEach(cleanup);

  it("shows the same authorized result as a non-authoritative room projection", () => {
    const room = {
      participants: [{ participant_id: "participant:guest", display_name: "Sam" }],
      public_terminal_results: [{
        schema: "helix.shared_realtime_room.public_terminal_result.v1",
        result_ref: "room_terminal_result:test",
        room_id: "shared_realtime_room:test",
        turn_id: "ask:test",
        author_participant_id: "participant:guest",
        published_at: "2026-08-27T14:00:00.000Z",
        terminal_artifact_kind: "model_synthesized_answer",
        final_answer_source: "final_answer_draft",
        text: "A fresh read reports one sword and four bread.",
        evidence_refs: ["observation:test"],
        capability_ids: ["com.casimirbot.minecraft.inventory.check"],
        source_terminal_authorized: true,
        content_role: "room_public_terminal_projection",
        credential_included: false,
        private_endpoint_included: false,
        hidden_reasoning_included: false,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }],
    } as HelixSharedRealtimeRoom;
    render(<SharedLiveRoomPublicResultsPanel room={room} />);
    expect(screen.getByText("A fresh read reports one sword and four bread.")).toBeTruthy();
    expect(screen.getByText("Shared by Sam")).toBeTruthy();
    expect(screen.getByText(/com\.casimirbot\.minecraft\.inventory\.check/u)).toBeTruthy();
    expect(screen.getByText(/not another answer or permission source/iu)).toBeTruthy();
  });
});
