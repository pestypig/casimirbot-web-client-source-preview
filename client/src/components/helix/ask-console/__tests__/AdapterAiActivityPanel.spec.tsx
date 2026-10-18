// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeResponsesActionActivity } from
  "../../../../../../server/services/helix-ask/operator-activity-normalizer";
import type { HelixAdapterAiActivityPage } from
  "@shared/helix-environment-action-activity";
import { AdapterAiActivityPanel } from "../AdapterAiActivityPanel";

afterEach(cleanup);

const page = (chatId: string, runId: string, sourceRef: string):
  HelixAdapterAiActivityPage => ({
    schema: "helix.adapter_ai_activity_page.v1",
    helix_conversation_id: chatId, reasoning_binding_id: `binding:${chatId}`,
    binding_epoch: 1, run_id: runId, adapter_results_status: "available",
    events: [normalizeResponsesActionActivity({
      activity: { schema: "environment.responses_actor_activity.v1",
        event_id: `choice:${sourceRef}`, helix_conversation_id: chatId,
        reasoning_binding_id: `binding:${chatId}`, binding_epoch: 1,
        run_id: runId, goal_id: "goal:one", goal_revision: 1,
        checkpoint_event_id: `checkpoint:${sourceRef}`, decision_id: `decision:${sourceRef}`,
        phase: "proposed", action_code: "walk_to_waypoint", target_ref: sourceRef,
        reason_code: null, observed_at: "2026-10-07T12:00:00.000Z",
        provenance: "verified_responses_actor_boundary", raw_response_included: false,
        private_reasoning_included: false, execution_authority: false,
        action_performed: false, answer_authority: false, terminal_eligible: false },
      profileRef: "profile:one", nodeRef: "node:one", environmentBindingRef: "environment:one",
      roomRef: "room:one", sourceRef, worldRef: "world:one", projectionSequence: 0,
    })],
    answer_authority: false, terminal_eligible: false,
    raw_content_included: false, private_reasoning_included: false,
  });

describe("Adapter AI run activity", () => {
  it("separates two adapter sources and labels proposals as no action", () => {
    const first = page("chat:first", "run:one", "source:first");
    const second = page("chat:second", "run:two", "source:second");
    render(<AdapterAiActivityPanel pages={[first, second]} chatTitles={[
      { id: "chat:first", title: "First chat" }, { id: "chat:second", title: "Second chat" },
    ]} />);
    expect(screen.getByLabelText("Adapter AI runs")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Adapter AI runs"),
      { target: { value: '["chat:second","run:two","source:second"]' } });
    expect(screen.getByText(/Source source:second · Run run:two · Second chat/)).toBeInTheDocument();
    expect(screen.getByText(/No action started/)).toBeInTheDocument();
    expect(screen.queryByText(/Source source:first · Run run:one/)).not.toBeInTheDocument();
  });

  it("shows a verified choice and the separate native-result read failure", () => {
    const current = { ...page("chat:first", "run:one", "source:first"),
      adapter_results_status: "unavailable" as const };
    render(<AdapterAiActivityPanel pages={[current]} chatTitles={[]} />);
    expect(screen.getByText(/No action started/)).toBeInTheDocument();
    expect(screen.getByText(/Native adapter result receipts could not be read/))
      .toBeInTheDocument();
  });

  it("shows a read failure instead of an empty-run claim", () => {
    render(<AdapterAiActivityPanel pages={[]} chatTitles={[]}
      requestedChatIds={["chat:first"]}
      readFailures={{ "chat:first": "activity_unavailable" }} />);
    expect(screen.getByText(/Activity could not be read right now/)).toBeInTheDocument();
    expect(screen.queryByText(/No current owner-verified adapter run/)).toBeNull();
  });
});
