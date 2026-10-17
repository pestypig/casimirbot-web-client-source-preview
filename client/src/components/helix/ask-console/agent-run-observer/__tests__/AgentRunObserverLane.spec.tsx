/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRunObserverLane } from "../AgentRunObserverLane";

afterEach(() => cleanup());

describe("AgentRunObserverLane", () => {
  it("renders a separate run lane without exposing receipt payload content", () => {
    render(
      <AgentRunObserverLane
        controller={{
          bindingRef: "binding-a",
          chatSessionId: "chat-a",
          phase: "waiting",
          afterSeq: 2,
          terminalMessageId: null,
          error: null,
          events: [
            {
              schema: "helix.agent_run.event.v1",
              event_id: "event-a",
              run_id: "run-a",
              seq: 2,
              event_type: "input_requested",
              payload: {
                receipt_text:
                  "This receipt content must never appear as an assistant answer.",
              },
              created_at: "2026-07-26T15:00:00.000Z",
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("region", { name: "External agent run" }),
    ).toHaveAttribute("data-agent-run-observer-phase", "waiting");
    expect(screen.getByText("Input requested")).toBeInTheDocument();
    expect(screen.queryByText(/receipt content must never/i)).toBeNull();
  });

  it("announces terminal reconciliation while leaving answer text to chat", () => {
    render(
      <AgentRunObserverLane
        controller={{
          bindingRef: "binding-a",
          chatSessionId: "chat-a",
          phase: "completed",
          afterSeq: 7,
          terminalMessageId: "terminal-a",
          error: null,
          events: [],
        }}
      />,
    );

    expect(
      screen.getByText("Verified answer added to the selected chat."),
    ).toBeInTheDocument();
  });

  it("shows only bounded tool, receipt, question, and typed-failure status", () => {
    render(
      <AgentRunObserverLane
        controller={{
          bindingRef: "binding-a",
          chatSessionId: "chat-a",
          phase: "failed",
          afterSeq: 4,
          terminalMessageId: null,
          error: null,
          events: [
            {
              schema: "helix.agent_run.event.v1",
              event_id: "event-evidence",
              run_id: "run-a",
              seq: 2,
              event_type: "evidence_reentered",
              payload: {
                observation_ref_count: 2,
                evidence_ref_count: 1,
                receipt_ref_count: 2,
                receipt_refs: ["private-receipt"],
                status_rows: [
                  {
                    kind: "observation",
                    status: "reentered",
                    status_ref: `observer-observation:sha256:${"a".repeat(64)}`,
                    answer_authority: false,
                    assistant_answer: false,
                    terminal_eligible: false,
                    raw_content_included: false,
                  },
                  {
                    kind: "receipt",
                    status: "reentered",
                    status_ref: `observer-receipt:sha256:${"b".repeat(64)}`,
                    answer_authority: false,
                    assistant_answer: false,
                    terminal_eligible: false,
                    raw_content_included: false,
                  },
                  {
                    kind: "receipt",
                    status: "reentered",
                    status_ref: "private-receipt",
                    answer_authority: true,
                    assistant_answer: true,
                    terminal_eligible: true,
                    raw_content_included: true,
                  },
                ],
              },
              created_at: "2026-07-26T15:00:00.000Z",
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            {
              schema: "helix.agent_run.event.v1",
              event_id: "event-input",
              run_id: "run-a",
              seq: 3,
              event_type: "input_requested",
              payload: {
                pending_input: true,
                question_count: 1,
                questions: ["private question"],
              },
              created_at: "2026-07-26T15:00:01.000Z",
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
            {
              schema: "helix.agent_run.event.v1",
              event_id: "event-failed",
              run_id: "run-a",
              seq: 4,
              event_type: "run_failed",
              payload: {
                failure_code: "bound_room_evidence_stale",
                secret: "private failure detail",
              },
              created_at: "2026-07-26T15:00:02.000Z",
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText("3 tool/evidence observations; 2 receipts"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pending input required; 1 question"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tool observation re-entered")).toBeInTheDocument();
    expect(screen.getByText("Receipt re-entered")).toBeInTheDocument();
    expect(
      screen.getByText(`observer-observation:sha256:${"a".repeat(64)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Typed failure: bound_room_evidence_stale"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private/i)).toBeNull();
  });
});
