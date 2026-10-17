// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_OPERATOR_ACTIVITY_EVENT_SCHEMA,
  HELIX_OPERATOR_ACTIVITY_PAGE_SCHEMA,
  HELIX_OPERATOR_ACTIVITY_STREAM_LIST_SCHEMA,
  type HelixOperatorActivityEvent,
} from "@shared/helix-operator-activity";

const fetchStreams = vi.fn();
const fetchPage = vi.fn();

vi.mock("../HelixOperatorActivityApi", () => ({
  fetchHelixOperatorActivityStreams: (...args: unknown[]) => fetchStreams(...args),
  fetchHelixOperatorActivityPage: (...args: unknown[]) => fetchPage(...args),
}));

import { HelixOperatorActivityPanel } from "../HelixOperatorActivityPanel";

const activityEvent = (sequence: number): HelixOperatorActivityEvent => ({
  schema: HELIX_OPERATOR_ACTIVITY_EVENT_SCHEMA,
  activity_event_id: `operator_activity:${sequence}`,
  projection_sequence: sequence,
  source_kind: "agent_turn_lifecycle",
  source_schema: "helix.agent_run.event.v1",
  source_event_ref: `agent_event:${sequence}`,
  profile_ref: "profile:one",
  node_ref: "node:one",
  oauth_client_ref: null,
  client_session_ref: null,
  provider_thread_ref: "provider_thread:hashed",
  provider_thread_epoch: "provider_thread_epoch:hashed",
  run_id: "run:one",
  turn_id: null,
  capability_call_ref: null,
  environment_binding_ref: null,
  room_ref: null,
  source_ref: null,
  world_ref: null,
  workflow_ref: null,
  effect_lease_ref: null,
  terminal_product_ref: null,
  event_kind: sequence === 23 ? "completion" : "status",
  lifecycle_stage: "agent_run_observed",
  outcome: sequence === 23 ? "succeeded" : "pending",
  summary: `Agent lifecycle event ${sequence}.`,
  evidence_refs: [`agent_event:${sequence}`],
  occurred_at: "2026-09-01T20:00:00.000Z",
  observed_at: "2026-09-01T20:00:01.000Z",
  provenance: "derived",
  redaction_state: "sanitized",
  visibility: "profile",
  content_role: "operator_activity_not_assistant_answer",
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

describe("HelixOperatorActivityPanel", () => {
  beforeEach(() => {
    fetchStreams.mockReset().mockResolvedValue({
      schema: HELIX_OPERATOR_ACTIVITY_STREAM_LIST_SCHEMA,
      profile_ref: "profile:one",
      streams: [{
        stream_ref: "operator_activity_stream:one",
        profile_ref: "profile:one",
        node_ref: "node:one",
        event_count: 24,
        next_sequence: 24,
        latest_observed_at: "2026-09-01T20:00:01.000Z",
      }],
      content_role: "operator_activity_stream_list_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    const events = Array.from({ length: 24 }, (_, index) => activityEvent(index));
    fetchPage.mockReset().mockResolvedValue({
      schema: HELIX_OPERATOR_ACTIVITY_PAGE_SCHEMA,
      stream_ref: "operator_activity_stream:one",
      profile_ref: "profile:one",
      node_ref: "node:one",
      run_id: null,
      provider_thread_ref: null,
      provider_thread_epoch: null,
      events,
      next_cursor: null,
      has_more: false,
      complete_for_query: true,
      summary: {
        returned_count: 24,
        first_sequence: 0,
        last_sequence: 23,
        outcome_counts: { pending: 23, succeeded: 1 },
      },
      content_role: "operator_activity_page_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
  });

  it("shows more than fifteen durable events through progressive disclosure", async () => {
    const { container } = render(<HelixOperatorActivityPanel />);
    expect(await screen.findByText("24 of 24")).toBeInTheDocument();
    expect(screen.getByText(/not private reasoning or an assistant answer/i)).toBeInTheDocument();
    expect(container.querySelector("[data-answer-authority='false']")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "activity" }));
    expect(await screen.findByText("Agent lifecycle event 23.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(24);

    fireEvent.click(screen.getByRole("tab", { name: "technical" }));
    await waitFor(() => {
      expect(screen.getByText("operator_activity:23")).toBeInTheDocument();
    });
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
      streamRef: "operator_activity_stream:one",
      nodeRef: "node:one",
    }));
  });

  it("uses a plain-language empty state without claiming disconnection", async () => {
    fetchStreams.mockResolvedValueOnce({
      schema: HELIX_OPERATOR_ACTIVITY_STREAM_LIST_SCHEMA,
      profile_ref: "profile:one",
      streams: [],
      content_role: "operator_activity_stream_list_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    render(<HelixOperatorActivityPanel />);
    expect(await screen.findByText(/No governed activity yet/i)).toBeInTheDocument();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
