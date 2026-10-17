// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSituationArtifactCard } from "@/components/helix/LiveSituationArtifactCard";
import type { LiveSituationArtifact, LiveSituationArtifactDelta } from "@shared/helix-live-situation-artifact";

const artifact: LiveSituationArtifact = {
  schema: "helix.live_situation_artifact.v1",
  artifact_id: "live_situation:test-card",
  thread_id: "helix-ask:test-card",
  created_turn_id: "turn:setup",
  session_id: "situation_goal:test-card",
  room_id: "room:minecraft-minehut",
  world_id: "minecraft:minehut",
  source_ids: ["source:minecraft-server"],
  graph_id: null,
  status: "active",
  mode: "voice_on_confirm",
  objective: "Watch my run and tell me about danger or progress.",
  current_state_lines: {
    now: "Now: entered danger at 4 health.",
    goal: "Likely goal: survive immediate danger",
    risk: "Risk: DatDamPig is in danger at 4 health.",
    progress: "Recent progress: entered danger at 4 health.",
    unknowns: "Open question: No hostile precursor sensing yet.",
    last_decision: "Last decision: delivered - DatDamPig is in danger at 4 health.",
  },
  subgoals: [
    {
      schema: "helix.live_situation_subgoal.v1",
      subgoal_id: "subgoal:risk",
      label: "Detect danger signals",
      status: "progress",
      confidence: 0.86,
      evidence_refs: ["minecraft:event:risk"],
      updated_at: "2026-05-08T10:00:00.000Z",
    },
  ],
  latest_evaluation: null,
  evidence_refs: ["minecraft:event:risk"],
  created_at: "2026-05-08T10:00:00.000Z",
  updated_at: "2026-05-08T10:00:01.000Z",
  context_policy: "compact_context_pack_only",
  raw_transcript_included: false,
  raw_audio_included: false,
  deterministic_content_role: "observation_not_assistant_answer",
};

const delta: LiveSituationArtifactDelta = {
  schema: "helix.live_situation_artifact_delta.v1",
  delta_id: "live_delta:test-card",
  artifact_id: artifact.artifact_id,
  thread_id: artifact.thread_id,
  turn_id: "turn:aux",
  reason: "risk_update",
  previous_hash: "old",
  next_hash: "new",
  changed_fields: ["current_state_lines"],
  artifact_snapshot: artifact,
  evidence_refs: ["minecraft:event:risk"],
  ts: "2026-05-08T10:00:01.000Z",
};

describe("LiveSituationArtifactCard", () => {
  afterEach(() => cleanup());

  it("renders compact live state without duplicate labels and opens trace", () => {
    render(<LiveSituationArtifactCard artifact={artifact} deltas={[delta]} speakable />);

    expect(screen.getByText("Minecraft Situation: active · voice_on_confirm")).toBeTruthy();
    expect(screen.getByText("DatDamPig is in danger at 4 health.")).toBeTruthy();
    expect(screen.queryByText("Risk: DatDamPig is in danger at 4 health.")).toBeNull();
    expect(screen.getByRole("button", { name: "Speak" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show trace" }));
    expect(screen.getByText("risk update")).toBeTruthy();
    expect(screen.getByText(/Changed: current_state_lines/i)).toBeTruthy();
  });

  it("keeps actions local and never emits Minecraft commands", () => {
    const onAskHelix = vi.fn();
    const onSpeak = vi.fn();
    render(<LiveSituationArtifactCard artifact={artifact} onAskHelix={onAskHelix} onSpeak={onSpeak} speakable />);

    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));

    expect(onAskHelix).toHaveBeenCalledWith("What is my current Minecraft situation, and what should I watch next?");
    expect(onSpeak).toHaveBeenCalled();
  });
});
