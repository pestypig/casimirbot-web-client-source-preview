// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveAnswerEnvironmentCard } from "@/components/helix/LiveAnswerEnvironmentCard";
import type { LiveAnswerEnvironment } from "@shared/helix-live-answer-environment";

describe("LiveAnswerEnvironmentCard pipeline projection", () => {
  it("renders pipeline-defined answer-card lines without debug-only lines", () => {
    const environment: LiveAnswerEnvironment = {
      schema: "helix.live_answer_environment.v1",
      environment_id: "live_answer:pipeline",
      thread_id: "helix-ask:test",
      created_turn_id: "turn:pipeline",
      objective: "Compare this live transcript to Moral philosophy.",
      preset: "custom",
      status: "active",
      mode: "text_only",
      room_id: null,
      graph_id: null,
      source_ids: ["source:browser-tab-transcript"],
      line_schema: [],
      lines: [
        {
          key: "moral_parallel",
          label: "Moral parallel",
          value: "Observe directly before adding interpretation.",
          update_policy: "model_reviewed",
          visibility: "answer_card",
          priority: "info",
          confidence: 0.7,
          source_event_ids: ["evt:1"],
          evidence_refs: ["evt:1"],
          updated_at: "2026-05-10T12:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
          deterministic: true,
        },
        {
          key: "debug_basis",
          label: "Debug basis",
          value: "hidden debug line",
          update_policy: "projection_only",
          visibility: "debug_only",
          priority: "info",
          confidence: null,
          source_event_ids: [],
          evidence_refs: [],
          updated_at: "2026-05-10T12:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
          deterministic: true,
        },
      ],
      subgoals: [],
      evidence_refs: ["evt:1"],
      created_at: "2026-05-10T12:00:00.000Z",
      updated_at: "2026-05-10T12:00:00.000Z",
      latest_summary: "Moral comparison updated.",
      context_policy: "compact_context_pack_only",
      raw_logs_included: false,
      raw_transcript_included: false,
      raw_audio_included: false,
      deterministic_content_role: "observation_not_assistant_answer",
    };

    render(<LiveAnswerEnvironmentCard environment={environment} />);

    expect(screen.getByText(/Moral parallel:/)).toBeTruthy();
    expect(screen.getByText(/Observe directly/)).toBeTruthy();
    expect(screen.queryByText(/hidden debug line/)).toBeNull();
  });
});
