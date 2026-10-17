// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EnvironmentMissionActivityHud from "../EnvironmentMissionActivityHud";
import {
  HELIX_ENVIRONMENT_MISSION_ACTIVITY_PROJECTION_SCHEMA,
  type HelixEnvironmentMissionActivityProjection,
} from "@shared/helix-environment-mission-activity-projection";

const projection = (
  sequence: number,
  overrides: Partial<HelixEnvironmentMissionActivityProjection> = {},
): HelixEnvironmentMissionActivityProjection => ({
  schema: HELIX_ENVIRONMENT_MISSION_ACTIVITY_PROJECTION_SCHEMA,
  surface: "overlay",
  activity_event_id: `activity:${sequence}`,
  projection_sequence: sequence,
  run_id: "run:mine",
  event_kind: "checkpoint",
  outcome: "succeeded",
  label: "Checkpoint",
  summary: `Waypoint ${sequence} verified.`,
  truncated: false,
  observed_at: new Date().toISOString(),
  provenance: "measured",
  content_role: "mission_activity_not_assistant_answer",
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  private_reasoning_included: false,
  action_authority_granted: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("read-only mission activity HUD", () => {
  it("shows at most three latest exact-run public events", () => {
    render(<EnvironmentMissionActivityHud missionLabel="Minecraft mission" runId="run:mine"
      projections={[projection(1), projection(2), projection(3), projection(4),
        projection(5, { run_id: "run:other" }),
        projection(6, { surface: "room" })]} />);
    const hud = screen.getByRole("complementary", { name: "Mission activity overlay" });
    expect(hud).toHaveAttribute("data-content-role", "mission_activity_not_assistant_answer");
    expect(hud).toHaveClass("pointer-events-none");
    expect(screen.getByText("Waypoint 4 verified.")).toBeInTheDocument();
    expect(screen.getByText("Waypoint 2 verified.")).toBeInTheDocument();
    expect(screen.queryByText("Waypoint 1 verified.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waypoint 5 verified.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waypoint 6 verified.")).not.toBeInTheDocument();
  });

  it("refuses authority-bearing or extra-content payloads and never renders markup", () => {
    const { container } = render(<EnvironmentMissionActivityHud missionLabel="Minecraft mission" runId="run:mine"
      projections={[
        { ...projection(1), action_authority_granted: true },
        { ...projection(2), private_transcript: "hidden" },
        projection(3, { summary: "<script>window.attack()</script>" }),
      ]} />);
    expect(screen.queryByText("Waypoint 1 verified.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waypoint 2 verified.")).not.toBeInTheDocument();
    expect(screen.getByText("<script>window.attack()</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not pretend the mission is ready when no verified activity exists", () => {
    render(<EnvironmentMissionActivityHud missionLabel="Minecraft mission" runId="run:mine" projections={[]} />);
    expect(screen.getByText("Waiting for verified mission activity.")).toBeInTheDocument();
    expect(screen.getByText(/not private reasoning or permission to act/)).toBeInTheDocument();
  });

  it("expires old activity locally even when the host never refreshes projections", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T15:00:00.000Z"));
    render(<EnvironmentMissionActivityHud missionLabel="Minecraft mission" runId="run:mine"
      projections={[projection(1)]} />);
    expect(screen.getByText("Waypoint 1 verified.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.queryByText("Waypoint 1 verified.")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for verified mission activity.")).toBeInTheDocument();
  });
});
