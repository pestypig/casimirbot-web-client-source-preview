// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveAnswerEnvironmentCard } from "@/components/helix/LiveAnswerEnvironmentCard";
import type { LiveAnswerEnvironment, LiveAnswerEnvironmentDelta } from "@shared/helix-live-answer-environment";

const environment: LiveAnswerEnvironment = {
  schema: "helix.live_answer_environment.v1",
  environment_id: "live_answer:test",
  thread_id: "helix-ask:test",
  created_turn_id: "turn:test",
  objective: "Watch my Minecraft run and tell me about danger or progress.",
  room_id: "room:minecraft-minehut",
  source_ids: ["source:minecraft-server"],
  graph_id: null,
  status: "active",
  mode: "text_only",
  line_schema: [],
  subgoals: [],
  lines: [
    {
      key: "risk",
      label: "Risk",
      update_policy: "salience_only",
      visibility: "answer_card",
      value: "Risk: DatDamPig is in danger at 4 health.",
      confidence: 0.86,
      evidence_refs: ["minecraft:event:risk"],
      updated_at: "2026-05-08T16:00:00.000Z",
      source: "deterministic_reducer",
      model_invoked: false,
    },
    {
      key: "debug",
      label: "Debug",
      update_policy: "projection_only",
      visibility: "debug_only",
      value: "raw detail",
      confidence: null,
      evidence_refs: [],
      updated_at: "2026-05-08T16:00:00.000Z",
      source: "deterministic_reducer",
      model_invoked: false,
    },
  ],
  latest_summary: "DatDamPig is in danger at 4 health.",
  evidence_refs: ["minecraft:event:risk"],
  created_at: "2026-05-08T16:00:00.000Z",
  updated_at: "2026-05-08T16:00:00.000Z",
  context_policy: "compact_context_pack_only",
  raw_transcript_included: false,
  raw_audio_included: false,
  deterministic_content_role: "observation_not_assistant_answer",
  context_role: "observation_not_assistant_answer",
  terminal_eligible: false,
  post_tool_model_step_required: true,
  assistant_answer: false,
  raw_content_included: false,
};

const delta: LiveAnswerEnvironmentDelta = {
  schema: "helix.live_answer_environment_delta.v1",
  delta_id: "delta:test",
  environment_id: "live_answer:test",
  thread_id: "helix-ask:test",
  reason: "salience_update",
  changed_line_keys: ["risk"],
  previous_hash: "before",
  next_hash: "after",
  environment_snapshot: environment,
  evidence_refs: ["minecraft:event:risk"],
  ts: "2026-05-08T16:00:00.000Z",
};

describe("LiveAnswerEnvironmentCard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders answer-card lines only and opens delta trace", () => {
    render(<LiveAnswerEnvironmentCard environment={environment} deltas={[delta]} />);

    expect(screen.getByText("Live Answer Environment")).toBeTruthy();
    expect(screen.getByText("DatDamPig is in danger at 4 health.")).toBeTruthy();
    expect(screen.queryByText("raw detail")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show trace" }));
    expect(screen.getByText("Changed: risk")).toBeTruthy();
  });

  it("starts a direct Ask prompt through the card action", () => {
    const onAskHelix = vi.fn();
    render(<LiveAnswerEnvironmentCard environment={environment} onAskHelix={onAskHelix} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));
    expect(onAskHelix).toHaveBeenCalledWith(expect.stringContaining("live answer environment"));
  });

  it("renders Live Answer projection authority as non-terminal goal-context evidence", () => {
    render(<LiveAnswerEnvironmentCard environment={environment} />);

    const authority = screen.getByTestId("live-answer-card-authority");
    expect(authority).toHaveTextContent("Authority: observation-only");
    expect(authority).toHaveTextContent("assistant: false");
    expect(authority).toHaveTextContent("terminal: false");
    expect(authority).toHaveTextContent("raw: false");
    expect(authority).toHaveTextContent("model step: required");
    expect(authority).toHaveTextContent(
      "Live Answer projections are goal-context evidence until terminal authority selects a final answer.",
    );
  });

  it("prefers Stage Play answer lines over generic visual present-state lines", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/agi/situation/present-state-card")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            card: {
              lines: [
                {
                  key: "scene",
                  label: "Scene",
                  value: "Generic visual scene should not be foregrounded.",
                  evidence_refs: ["visual:generic"],
                  confidence: 0.5,
                  updated_at: "2026-05-08T16:00:00.000Z",
                },
              ],
            },
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => null } as Response);
    }));

    const stagePlayEnvironment: LiveAnswerEnvironment = {
      ...environment,
      environment_id: "live_answer:stage-play",
      objective: "Project Stage Play graph into Live Answer.",
      graph_id: "stage_play_badge_graph:test",
      line_schema: [
        { key: "situation", label: "Situation", update_policy: "episode_based", visibility: "answer_card" },
        { key: "actor_state", label: "Actor", update_policy: "episode_based", visibility: "answer_card" },
        { key: "resources", label: "Resources", update_policy: "episode_based", visibility: "answer_card" },
        { key: "affordances", label: "Affordances", update_policy: "episode_based", visibility: "answer_card" },
        { key: "risk", label: "Risk", update_policy: "salience_only", visibility: "answer_card" },
        { key: "possibilities", label: "Possibilities", update_policy: "projection_only", visibility: "answer_card" },
        { key: "unknowns", label: "Unknowns", update_policy: "projection_only", visibility: "answer_card" },
        { key: "next_check", label: "Next check", update_policy: "episode_based", visibility: "answer_card" },
      ],
      lines: [
        {
          key: "scene",
          label: "Scene",
          update_policy: "episode_based",
          visibility: "answer_card",
          value: "Scene: Generic line should not be foregrounded.",
          confidence: 0.7,
          evidence_refs: ["visual:generic"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
        {
          key: "situation",
          label: "Situation",
          update_policy: "episode_based",
          visibility: "answer_card",
          value: "Situation: Stage scene built from graph.",
          confidence: 0.86,
          evidence_refs: ["stage:graph"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
        {
          key: "risk",
          label: "Risk",
          update_policy: "salience_only",
          visibility: "answer_card",
          value: "Risk: Audio grounding is missing.",
          confidence: 0.76,
          evidence_refs: ["stage:risk"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
        {
          key: "possibilities",
          label: "Possibilities",
          update_policy: "projection_only",
          visibility: "answer_card",
          value: "Possibilities: Continue visual comparison.",
          confidence: 0.8,
          evidence_refs: ["stage:possibilities"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
        {
          key: "unknowns",
          label: "Unknowns",
          update_policy: "projection_only",
          visibility: "answer_card",
          value: "Unknowns: Audio/transcript grounding and prediction target.",
          confidence: 0.9,
          evidence_refs: ["stage:unknowns"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
        {
          key: "next_check",
          label: "Next check",
          update_policy: "episode_based",
          visibility: "answer_card",
          value: "Next check: Attach transcript or set prediction target.",
          confidence: 0.9,
          evidence_refs: ["stage:next"],
          updated_at: "2026-05-08T16:00:00.000Z",
          source: "deterministic_reducer",
          model_invoked: false,
        },
      ],
    };

    render(<LiveAnswerEnvironmentCard environment={stagePlayEnvironment} />);

    expect(screen.getByText("Stage scene built from graph.")).toBeTruthy();
    expect(screen.getByText("Audio grounding is missing.")).toBeTruthy();
    expect(screen.queryByText("Generic line should not be foregrounded.")).toBeNull();

    await waitFor(() => {
      expect(screen.queryByText("Generic visual scene should not be foregrounded.")).toBeNull();
      expect(screen.getByText("Stage scene built from graph.")).toBeTruthy();
    });
  });
});
